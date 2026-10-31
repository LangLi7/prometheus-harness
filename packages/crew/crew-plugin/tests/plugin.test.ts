/**
 * Das Plugin gegen einen **nachgebauten** Kontext: Anmeldung, Werkzeuge, Buchung, Abmelden.
 *
 * Festgenagelt wird: der Adapter geht unter der Route `crew` an den Kern; jedes Werkzeug wird als
 * `ToolDefinition` angemeldet (mit Ausgabeschema und Darstellung); der `llm/stream`-Waterfall wird
 * **durchgereicht** und bucht dabei; das Abmelden nimmt alles zurück; und **ohne Nutzer startet das
 * Plugin nicht**.
 */

import { describe, expect, test } from 'bun:test'

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import {
  alsKernWerkzeug,
  apply,
  applyAusDatei,
  applyMitKonfiguration,
  homeAusUmgebung,
  konfigurationsdatei,
  kontoFuer,
  liesKonfiguration,
  name,
  protokollAus,
  type HostKontext,
  type Konfiguration,
} from '../src/index.ts'
import type { CrewEintrag } from '@prometheus-harness/crew-core-adapter'

/** Eine Crew. */
const CREW: CrewEintrag = {
  id: 'crew-1',
  rollen: {
    executor: { familie: 'deepseek-official', modell: 'deepseek-flash' },
    vision: { familie: 'openrouter', modell: 'google/gemini-3.8-flash' },
  },
}

/** Ein nachgebauter Kontext. */
const kontext = (): {
  ctx: HostKontext
  adapterRouten: string[][]
  werkzeuge: ToolDefinition[]
  zuhoerer: ((options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>)[]
  abgemeldet: { adapter: number; werkzeuge: number; zuhoerer: number }
} => {
  const adapterRouten: string[][] = []
  const werkzeuge: ToolDefinition[] = []
  const zuhoerer: ((options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>)[] = []
  const abgemeldet = { adapter: 0, werkzeuge: 0, zuhoerer: 0 }
  const ctx: HostKontext = {
    llm: {
      registerAdapter: (routen: string[]) => {
        adapterRouten.push(routen)
        return () => { abgemeldet.adapter += 1 }
      },
      stream: async function* () { /* im Test nicht benutzt */ },
    },
    tools: {
      register: (definition: ToolDefinition) => {
        werkzeuge.push(definition)
        return () => { abgemeldet.werkzeuge += 1 }
      },
    },
    on: (_ereignis, listener) => {
      zuhoerer.push(listener)
      return () => { abgemeldet.zuhoerer += 1 }
    },
  }
  return { ctx, adapterRouten, werkzeuge, zuhoerer, abgemeldet }
}

/** Eine Konfiguration. */
const konfiguration = (teil: Partial<Konfiguration> = {}): Konfiguration => ({
  crews: [CREW],
  crew: 'crew-1',
  nutzer: 'anna',
  ...teil,
})

/**
 * Fängt `process.stderr` ab.
 *
 * Das Plugin schreibt jede Protokollzeile zusätzlich auf `stderr` (der Host gibt den cordis-Logger
 * nicht aus). Ohne diesen Fang stünden die Zeilen im Testbericht — und geprüft wäre nichts.
 */
const fangeStderr = (): { zeilen: string[]; zurueck: () => void } => {
  const zeilen: string[] = []
  const echt = process.stderr.write.bind(process.stderr)
  const ersatz = (stueck: string | Uint8Array): boolean => {
    zeilen.push(typeof stueck === 'string' ? stueck : Buffer.from(stueck).toString('utf8'))
    return true
  }
  ;(process.stderr as unknown as { write: typeof ersatz }).write = ersatz
  return {
    zeilen,
    zurueck: () => { (process.stderr as unknown as { write: typeof ersatz }).write = echt as unknown as typeof ersatz },
  }
}

describe('Anmeldung im Host', () => {
  test('der Adapter geht unter der Route crew an den Kern', () => {
    const { ctx, adapterRouten } = kontext()
    apply(ctx, konfiguration())
    expect(adapterRouten).toEqual([['crew']])
  })

  test('die vier Zustandswerkzeuge stehen als ToolDefinition in der Registry', () => {
    const { ctx, werkzeuge } = kontext()
    apply(ctx, konfiguration())
    expect(werkzeuge.map((werkzeug) => werkzeug.name)).toEqual([
      'crew_plan',
      'crew_todo',
      'crew_todo_status',
      'crew_workspace',
    ])
    for (const werkzeug of werkzeuge) {
      expect(werkzeug.output.schema).toEqual({ type: 'object' })
      expect(typeof werkzeug.output.render).toBe('function')
      expect((werkzeug.parameters as { type?: string }).type).toBe('object')
    }
  })

  test('Bild- und Suchwerkzeuge kommen nur dazu, wenn sie eingerichtet sind', () => {
    const { ctx, werkzeuge } = kontext()
    apply(ctx, konfiguration({
      modlens: { cliPfad: 'main.js', ausfuehren: async () => ({ stdout: '', stderr: '', code: 0 }) },
      suche: { apiKey: 'sk-TEST', hole: async () => ({ status: 200, text: '{"results":[]}' }) },
    }))
    const namen = werkzeuge.map((werkzeug) => werkzeug.name)
    expect(namen).toContain('modlens_read_image')
    expect(namen).toContain('tools_search')
    expect(namen).toContain('tools_fetch')
    expect(namen).toHaveLength(7)
  })

  test('die Suche kommt aus einer DATEI — ohne Funktion, mit echtem Netzweg', () => {
    // Eine JSON-Datei kann `hole` nicht liefern. Bis zum 19.10.2026 war das Feld Pflicht, also war
    // die Suche im Host nicht einschaltbar. Dieser Test nagelt die Vorgabe fest.
    const { ctx, werkzeuge } = kontext()
    const stderr = fangeStderr()
    try {
      apply(ctx, konfiguration({ suche: { apiKey: 'sk-TEST' } }))
    } finally {
      stderr.zurueck()
    }
    const namen = werkzeuge.map((werkzeug) => werkzeug.name)
    expect(namen).toContain('tools_search')
    expect(namen).toContain('tools_fetch')
  })

  test('ein Werkzeug ohne Nutzer startet nicht — fail-closed', () => {
    const { ctx } = kontext()
    expect(() => apply(ctx, konfiguration({ nutzer: ' ' }))).toThrow(/ohne Nutzer/)
    expect(() => applyMitKonfiguration(ctx, konfiguration({ crews: [] }))).toThrow(/ohne Crew/)
    expect(() => apply(ctx, konfiguration({ crew: 'gibt-es-nicht' }))).toThrow(/steht nicht in der Konfiguration/)
  })

  test('ohne Konfiguration faellt apply auf die Datei zurueck — und wirft nicht', async () => {
    // **Ein leeres Home, nicht das des Rechners.** `apply(ctx)` liest `DSH_HOME`; auf einer
    // Maschine, die wirklich eine Crew eingerichtet hat, steht dort eine Datei — und dieser Test
    // wäre dann von der Umgebung abhängig statt von seinem Gegenstand. Gemessen am 21.10.2026:
    // mit `DSH_HOME` auf das Bau-Home schlug er fehl, ohne daß sich am Plugin etwas geändert hatte.
    const alt = process.env['DSH_HOME']
    const leer = await mkdtemp(join(tmpdir(), 'crew-leer-'))
    process.env['DSH_HOME'] = leer
    const stderr = fangeStderr()
    try {
      const { ctx, adapterRouten, werkzeuge } = kontext()
      const abmelden = apply(ctx)
      expect(typeof abmelden).toBe('function')
      expect(adapterRouten).toEqual([])
      expect(werkzeuge).toEqual([])
    } finally {
      stderr.zurueck()
      await rm(leer, { recursive: true, force: true })
      if (alt === undefined) delete process.env['DSH_HOME']
      else process.env['DSH_HOME'] = alt
    }
  })
})

describe('Werkzeugbrücke', () => {
  test('execute liefert den kanonischen Wert, render den Text', async () => {
    const werkzeug = alsKernWerkzeug({
      name: 'beispiel',
      description: 'Beispiel.',
      parameters: { type: 'object' },
      execute: async () => '{"a":1}',
    })
    const wert = await werkzeug.execute({}, {
      signal: new AbortController().signal,
      rootCallId: 'c1',
      token: 't',
    } as unknown as Parameters<typeof werkzeug.execute>[1])
    expect(wert).toEqual({ a: 1 })
    const bloecke = werkzeug.output.render({}, wert as never) as unknown as { type: string; text: string }[]
    expect(bloecke).toEqual([{ type: 'text', text: '{"a":1}' }])
  })

  test('was kein JSON ist, kommt als Text zurück statt zu werfen', async () => {
    const werkzeug = alsKernWerkzeug({
      name: 'beispiel',
      description: 'Beispiel.',
      parameters: { type: 'object' },
      execute: async () => 'kein json',
    })
    const wert = await werkzeug.execute({}, {
      signal: new AbortController().signal,
      rootCallId: 'c1',
      token: 't',
    } as unknown as Parameters<typeof werkzeug.execute>[1])
    expect(wert).toBe('kein json')
  })
})

describe('Buchung am Wasserfall', () => {
  test('der Wasserfall wird durchgereicht und jede usage gemeldet', async () => {
    const { ctx, zuhoerer } = kontext()
    const verzeichnis = await mkdtemp(join(tmpdir(), 'pmh-crew-plugin-'))
    try {
      apply(ctx, konfiguration({ verzeichnis }))
      expect(zuhoerer).toHaveLength(1)
      const strom = zuhoerer[0]?.(
        { provider: 'crew', model: 'crew-1', messages: [] },
        () => (async function* () {
          yield { type: 'usage', usage: { inputTokens: 1_000, outputTokens: 500 } } as StreamChunk
          yield { type: 'finish', reason: 'stop' } as unknown as StreamChunk
        })(),
      )
      const gesehen: string[] = []
      for await (const stueck of strom ?? []) gesehen.push(stueck.type)
      // Durchgereicht: beide Stücke kommen an.
      expect(gesehen).toEqual(['usage', 'finish'])
      // Gebucht wird im Hintergrund (kein Blockieren der Antwort).
      await new Promise((fertig) => setTimeout(fertig, 20))
      const konto = await kontoFuer(konfiguration({ verzeichnis }))
      expect(konto.anfragen).toBe(1)
      // Ohne passenden Tarif bleibt die Anfrage unbepreist — sichtbar, nicht kostenlos.
      expect(konto.unbepreistProzent).toBe(100)
    } finally {
      await rm(verzeichnis, { recursive: true, force: true })
    }
  })

  test('abmelden nimmt Adapter, Werkzeuge und Zuhoerer zurück', () => {
    const { ctx, abgemeldet } = kontext()
    const abmelden = apply(ctx, konfiguration())
    abmelden()
    expect(abgemeldet).toEqual({ adapter: 1, werkzeuge: 4, zuhoerer: 1 })
  })
})
describe('Konfiguration aus der Datei', () => {
  test('eine fehlende Datei ist kein Fehler — nichts eingehängt, ein Satz im Protokoll', async () => {
    const { ctx, adapterRouten, werkzeuge } = kontext()
    const meldungen: string[] = []
    ctx.logger = { warn: (meldung: string) => meldungen.push(meldung) }
    const wurzel = await mkdtemp(join(tmpdir(), 'pmh-crew-cfg-'))
    try {
      const abmelden = applyAusDatei(ctx, wurzel)
      expect(typeof abmelden).toBe('function')
      abmelden()
      expect(adapterRouten).toEqual([])
      expect(werkzeuge).toEqual([])
      expect(meldungen[0]).toContain('keine Konfiguration')
      expect(meldungen[0]).toContain(konfigurationsdatei(wurzel))
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })

  test('der cordis-Protokolldienst ist aufrufbar — der Hinweis kommt trotzdem an', () => {
    // Gemessen: `ctx.logger` ist eine Funktion, `ctx.logger.warn` gibt es nicht. Ein Plugin, das
    // `ctx.logger?.warn?.(…)` schreibt, schreibt nirgendwohin — deshalb prüft dieser Test die Form.
    const meldungen: { art: string; text: string }[] = []
    const benannter = {
      info: (text: string) => meldungen.push({ art: 'info', text }),
      warn: (text: string) => meldungen.push({ art: 'warn', text }),
    }
    const namen: (string | undefined)[] = []
    const dienst = (name?: string) => {
      namen.push(name)
      return benannter
    }
    const protokoll = protokollAus({ ...kontext().ctx, logger: dienst })
    const stderr = fangeStderr()
    try {
      protokoll.info('läuft')
      protokoll.warn('fehlt')
    } finally {
      stderr.zurueck()
    }
    expect(meldungen).toEqual([
      { art: 'info', text: 'läuft' },
      { art: 'warn', text: 'fehlt' },
    ])
    expect(namen).toEqual([name])
  })

  test('ohne info fällt das Protokoll auf warn zurück — und stderr bekommt jede Zeile', () => {
    const stderr = fangeStderr()
    try {
      const meldungen: string[] = []
      const nurWarn = protokollAus({ ...kontext().ctx, logger: { warn: (text: string) => meldungen.push(text) } })
      nurWarn.info('auch das muß man sehen')
      expect(meldungen).toEqual(['auch das muß man sehen'])
      expect(stderr.zeilen.join('')).toContain('[pmh] pmh-crew: auch das muß man sehen')
    } finally {
      stderr.zurueck()
    }
  })

  test('auch OHNE Protokolldienst kommt die Zeile an — der Host gibt den Logger nicht aus', () => {
    // Gemessen: der einzige Exporter des Hosts sammelt nur warn/error für die Startdiagnose. Ein
    // Plugin, das sich allein auf `ctx.logger` verläßt, ist im Betrieb unsichtbar.
    const stderr = fangeStderr()
    try {
      const protokoll = protokollAus(kontext().ctx)
      protokoll.info('sichtbar')
      protokoll.warn('auch sichtbar')
      expect(stderr.zeilen).toEqual([
        '[pmh] pmh-crew: sichtbar\n',
        '[pmh] pmh-crew: auch sichtbar\n',
      ])
    } finally {
      stderr.zurueck()
    }
  })

  test('ein gültiges Einhängen schreibt eine Zeile — sonst sieht es aus wie „nichts getan"', () => {
    const { ctx } = kontext()
    const meldungen: string[] = []
    ctx.logger = {
      info: (text: string) => meldungen.push(text),
      warn: (text: string) => meldungen.push(`WARN ${text}`),
    }
    const stderr = fangeStderr()
    try {
      apply(ctx, konfiguration({ crew: 'crew-1', nutzer: 'anna' }))
    } finally {
      stderr.zurueck()
    }
    expect(meldungen).toHaveLength(1)
    expect(meldungen[0]).toContain('eingehaengt')
    expect(meldungen[0]).toContain('crew-1')
    expect(meldungen[0]).toContain('anna')
    expect(meldungen[0]).toContain('4 Werkzeuge')
    expect(stderr.zeilen.join('')).toContain('eingehaengt')
  })

  test('das Home kommt aus DSH_HOME und wird absolut — der Host reicht es wörtlich weiter', () => {
    const vorher = process.env['DSH_HOME']
    try {
      process.env['DSH_HOME'] = '.pmh-build/harness-home'
      expect(homeAusUmgebung()).toBe(resolve('.pmh-build/harness-home'))
      expect(isAbsolute(homeAusUmgebung())).toBe(true)
      process.env['DSH_HOME'] = ''
      expect(homeAusUmgebung()).toBe(join(homedir(), '.dsh'))
    } finally {
      if (vorher === undefined) delete process.env['DSH_HOME']
      else process.env['DSH_HOME'] = vorher
    }
  })

  test('PMH_HOME wird bewußt NICHT gelesen — das ist das eigene Home dieses Projekts', () => {
    const vorherPmh = process.env['PMH_HOME']
    const vorherDsh = process.env['DSH_HOME']
    try {
      process.env['PMH_HOME'] = 'C:\\anderes\\home'
      process.env['DSH_HOME'] = 'C:\\dsh\\home'
      expect(homeAusUmgebung()).toBe(resolve('C:\\dsh\\home'))
    } finally {
      if (vorherPmh === undefined) delete process.env['PMH_HOME']
      else process.env['PMH_HOME'] = vorherPmh
      if (vorherDsh === undefined) delete process.env['DSH_HOME']
      else process.env['DSH_HOME'] = vorherDsh
    }
  })

  test('eine gültige Datei hängt ein — und die Ablage liegt unter <wurzel>/crew', async () => {
    const { ctx, adapterRouten, werkzeuge } = kontext()
    const wurzel = await mkdtemp(join(tmpdir(), 'pmh-crew-cfg-'))
    try {
      const pfad = konfigurationsdatei(wurzel)
      await mkdir(join(wurzel, 'crew'), { recursive: true })
      await writeFile(pfad, JSON.stringify({
        crews: [{ id: 'crew-1', rollen: { executor: { familie: 'deepseek-official', modell: 'deepseek-flash' } } }],
        crew: 'crew-1',
        nutzer: 'anna',
      }), 'utf8')
      applyAusDatei(ctx, wurzel)
      expect(adapterRouten).toEqual([['crew']])
      expect(werkzeuge).toHaveLength(4)
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })

  test('eine kaputte Datei wird geworfen — vorhandener Fehler bleibt sichtbar', async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'pmh-crew-cfg-'))
    try {
      const pfad = konfigurationsdatei(wurzel)
      await mkdir(join(wurzel, 'crew'), { recursive: true })
      await writeFile(pfad, 'kein json', 'utf8')
      expect(() => liesKonfiguration(pfad)).toThrow(/kein JSON/)
      await writeFile(pfad, JSON.stringify({ crews: [], crew: 'x', nutzer: 'y' }), 'utf8')
      expect(() => liesKonfiguration(pfad)).toThrow(/leer/)
      await writeFile(pfad, JSON.stringify({ crews: [{ id: 'c' }], crew: 'c', nutzer: ' ' }), 'utf8')
      expect(() => liesKonfiguration(pfad)).toThrow(/nutzer/)
    } finally {
      await rm(wurzel, { recursive: true, force: true })
    }
  })
})
