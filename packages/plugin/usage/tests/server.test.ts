/**
 * Die beiden Routen — ohne Host, aber mit einem Kontext, der **mitschreibt**.
 *
 * ## Was diese Prüfung beweist
 *
 * Daß `apply` zwei Adressen einträgt, daß beide ohne Anmeldung abweisen, und daß der Stand aus
 * einer echten Datei bis in die Summen durchkommt. Was sie **nicht** beweist: daß der echte Loader
 * das Plugin lädt — das steht erst nach einem Neustart des Hosts fest.
 *
 * ## Warum die Datei über `PMH_USAGE_DATEI` kommt
 *
 * Der Suchpfad ist Teil des Vertrags (`kandidaten`), aber ein Test darf nicht davon abhängen, ob
 * auf dieser Maschine zufällig `~/.dsh/usage-budget/usage.json` liegt. Die Umgebungsvariable
 * überstimmt alles — also ist sie der ehrliche Weg in den Test.
 *
 * @module @prometheus-harness/usage/tests/server
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

import { ANZAHL_MAX, WEG_SCHAETZUNG, WEG_STAND, apply, geltung, geteilteSchluessel, haengeAnteile, name, verschmelzeSaldo } from '../src/server.ts'

/**
 * Ein winziger Katalog auf einem lokalen Port.
 *
 * **Warum kein echter Abruf.** Die Route holt den Bildmodell-Katalog; ein Test, der dafür
 * openrouter.ai fragt, ist langsam, netzabhängig und beim ersten Ausfall rot. `PMH_KATALOG_URL`
 * ist genau dafür da — und prüft nebenbei, daß die Übersteuerung wirkt.
 */
let katalogServer: ReturnType<typeof Bun.serve> | undefined

/** Die Umgebungsvariablen, die dieser Test setzt und wieder wegräumt. */
const UMWELT = ['OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'PMH_KATALOG_URL', 'PMH_BENUTZER'] as const
let gerettet: Record<string, string | undefined> = {}

beforeAll(() => {
  katalogServer = Bun.serve({
    port: 0,
    fetch: () =>
      Response.json({
        data: [
          {
            id: 'google/gemini-2.5-flash-image',
            name: 'Gemini 2.5 Flash Image',
            architecture: { output_modalities: ['image'] },
          },
          { id: 'openai/gpt-5-image', architecture: { output_modalities: ['image'] } },
        ],
      }),
  })
})

afterAll(() => {
  katalogServer?.stop(true)
  katalogServer = undefined
})

beforeEach(() => {
  gerettet = {}
  for (const name0 of UMWELT) {
    gerettet[name0] = process.env[name0]
    delete process.env[name0]
  }
  if (katalogServer !== undefined) {
    process.env['PMH_KATALOG_URL'] = `http://127.0.0.1:${String(katalogServer.port)}/models`
  }
})

afterEach(() => {
  for (const name0 of UMWELT) {
    const wert = gerettet[name0]
    if (wert === undefined) delete process.env[name0]
    else process.env[name0] = wert
  }
})

/** Eine geschriebene Antwort. */
interface Antwort {
  status: number
  koerper: string
}

/** Was ein Fake-Kontext mitschreibt. */
interface Fake {
  readonly ctx: Context
  readonly routen: WebRoute[]
  readonly wirkungen: (() => void)[]
  readonly abmelden: () => void
}

/**
 * Baut einen Kontext, der nur das kann, was `apply` verlangt.
 *
 * @param erlaubt - ob der Verbindungsdienst die Anfrage durchläßt
 * @param konfiguriert - welche Schlüssel hinterlegt sind (fehlt der Speicher ganz, gilt „alle")
 * @returns der Fake
 */
function macheFake(erlaubt = true, konfiguriert?: Readonly<Record<string, boolean>>): Fake {
  const routen: WebRoute[] = []
  const wirkungen: (() => void)[] = []
  const ctx = {
    get: (dienst: string) => {
      if (dienst === 'connection') return { requestRejection: () => (erlaubt ? undefined : 401) }
      if (dienst === 'credentials' && konfiguriert !== undefined) {
        return {
          describe: async (ref: string) => ({
            configured: konfiguriert[ref] === true,
            writable: false,
          }),
        }
      }
      return undefined
    },
    webServer: {
      register: (route: WebRoute) => {
        routen.push(route)
        return () => {
          const at = routen.indexOf(route)
          if (at >= 0) routen.splice(at, 1)
        }
      },
    },
    effect: (fn: () => () => void) => {
      wirkungen.push(fn())
    },
  } as unknown as Context
  return {
    ctx,
    routen,
    wirkungen,
    abmelden: () => {
      for (const ab of wirkungen.splice(0).reverse()) ab()
    },
  }
}

/**
 * Ruft eine Route auf.
 *
 * @param route - die Route
 * @param url - der angefragte Pfad samt Abfrage
 * @returns Status und Körper
 */
async function rufe(route: WebRoute, url: string): Promise<Antwort> {
  const antwort: Antwort = { status: 0, koerper: '' }
  const res = {
    writeHead: (status: number) => {
      antwort.status = status
    },
    end: (koerper?: string) => {
      antwort.koerper = koerper ?? ''
    },
  }
  await route.handler({ url, headers: {} } as unknown as IncomingMessage, res as unknown as ServerResponse)
  return antwort
}

describe('Das Plugin', () => {
  test('trägt zwei Adressen ein — Stand und Schätzung', () => {
    const fake = macheFake()
    apply(fake.ctx)
    expect(fake.routen.map((route) => route.path).sort()).toEqual([WEG_SCHAETZUNG, WEG_STAND].sort())
    expect(fake.routen.every((route) => route.kind === 'exact')).toBe(true)
  })

  test('beim Abhängen verschwindet alles wieder', () => {
    const fake = macheFake()
    apply(fake.ctx)
    fake.abmelden()
    expect(fake.routen).toHaveLength(0)
  })

  test('der Plugin-Name ist stabil', () => {
    expect(name).toBe('pmh-usage-panel')
  })
})

describe('Der Geltungsbereich', () => {
  test('ohne Angabe: ein Host ohne Namen', () => {
    expect(geltung({})).toEqual({ art: 'host', nutzer: null })
    expect(geltung({ PMH_BENUTZER: '   ' })).toEqual({ art: 'host', nutzer: null })
  })

  test('mit Angabe: das Konto, für das der Host läuft', () => {
    expect(geltung({ PMH_BENUTZER: ' chang ' })).toEqual({ art: 'host', nutzer: 'chang' })
  })

  test('die Route nennt ihn mit', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const route = fake.routen.find((eintrag) => eintrag.path === WEG_STAND)
    if (route === undefined) return
    const koerper = JSON.parse((await rufe(route, WEG_STAND)).koerper) as {
      geltung: { art: string; nutzer: string | null }
    }
    expect(koerper.geltung).toEqual({ art: 'host', nutzer: null })
  })
})

describe('Die Sperre', () => {
  test('ohne Anmeldung antworten beide Routen 401', async () => {
    const fake = macheFake(false)
    apply(fake.ctx)
    for (const route of fake.routen) {
      const antwort = await rufe(route, route.path)
      expect(antwort.status).toBe(401)
      expect(JSON.parse(antwort.koerper).fehler).toBe('nicht angemeldet')
    }
  })

  test('ohne Verbindungsdienst antworten beide Routen 503 — nicht 200', async () => {
    const routen: WebRoute[] = []
    const wirkungen: (() => void)[] = []
    const ctx = {
      get: () => undefined,
      webServer: {
        register: (route: WebRoute) => {
          routen.push(route)
          return () => undefined
        },
      },
      effect: (fn: () => () => void) => {
        wirkungen.push(fn())
      },
    } as unknown as Context
    apply(ctx)
    expect(routen).toHaveLength(2)
    for (const route of routen) {
      const antwort = await rufe(route, route.path)
      expect(antwort.status).toBe(503)
      expect(JSON.parse(antwort.koerper).fehler).toBe('kein Verbindungsdienst')
    }
    for (const ab of wirkungen.splice(0).reverse()) ab()
  })
})

describe('Der Stand', () => {
  let verzeichnis: string
  let datei: string

  beforeEach(() => {
    verzeichnis = mkdtempSync(join(tmpdir(), 'pmh-usage-'))
    datei = join(verzeichnis, 'usage.json')
    writeFileSync(
      datei,
      JSON.stringify({
        version: 1,
        balanceFetchedAt: Date.now(),
        balances: {
          OPENROUTER_API_KEY: { balanceUsd: 20.01, limitUsd: 5, limitRemainingUsd: 4.74, usageUsd: 0.26 },
        },
        records: [
          { time: Date.now(), cost: 1.5, provider: 'deepseek-official', model: 'deepseek-flash' },
          { time: Date.now(), provider: 'x', model: 'y' },
        ],
      }),
      'utf8',
    )
    process.env['PMH_USAGE_DATEI'] = datei
  })

  afterEach(() => {
    delete process.env['PMH_USAGE_DATEI']
    rmSync(verzeichnis, { recursive: true, force: true })
  })

  test('200 mit Summen, Salden und der Preisanswahl', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const route = fake.routen.find((eintrag) => eintrag.path === WEG_STAND)
    expect(route).toBeDefined()
    if (route === undefined) return
    const antwort = await rufe(route, WEG_STAND)
    expect(antwort.status).toBe(200)
    const koerper = JSON.parse(antwort.koerper) as {
      datei: string | null
      fenster: { gesamt: { usd: number; anfragen: number; unbepreist: number } }
      salden: { schluessel: string; quelle?: string }[]
      schaetzung: { modelle: { modell: string; usd?: number; herkunft: string }[]; stufen: string[] }
      katalog: { geholtAm: string | null; fehler?: string }
    }
    expect(koerper.datei).toBe(datei)
    expect(koerper.fenster.gesamt.usd).toBeCloseTo(1.5, 6)
    expect(koerper.fenster.gesamt.anfragen).toBe(2)
    expect(koerper.fenster.gesamt.unbepreist).toBe(1)
    expect(koerper.salden[0]?.schluessel).toBe('OPENROUTER_API_KEY')
    // Ohne Schlüssel wird nichts erfragt — also bleibt der Wert aus der Datei stehen, und er sagt das.
    expect(koerper.salden[0]?.quelle).toBe('datei')
    expect(koerper.schaetzung.stufen).toContain('1K')
    expect(koerper.katalog.geholtAm).not.toBeNull()
    // Die vier Anker stehen vorn; der Katalog ergänzt, was sonst noch Bilder ausgibt.
    const kennungen = koerper.schaetzung.modelle.map((eintrag) => eintrag.modell)
    expect(kennungen[0]).toBe('google/gemini-2.5-flash-image')
    expect(kennungen).toContain('openai/gpt-5-image')
    expect(kennungen.indexOf('openai/gpt-5-image')).toBeGreaterThan(3)
  })

  test('nur was hinterlegt ist, erscheint — der Rest wird gezählt', async () => {
    const fake = macheFake(true, { OTHER_API_KEY: true })
    apply(fake.ctx)
    const route = fake.routen.find((eintrag) => eintrag.path === WEG_STAND)
    if (route === undefined) return
    const koerper = JSON.parse((await rufe(route, WEG_STAND)).koerper) as {
      salden: { schluessel: string }[]
      ausgeblendet: number
    }
    // Die Datei nennt OPENROUTER — hinterlegt ist er hier nicht.
    expect(koerper.salden).toEqual([])
    expect(koerper.ausgeblendet).toBe(1)
  })

  test('ein hinterlegter Schlüssel bleibt stehen', async () => {
    const fake = macheFake(true, { OPENROUTER_API_KEY: true })
    apply(fake.ctx)
    const route = fake.routen.find((eintrag) => eintrag.path === WEG_STAND)
    if (route === undefined) return
    const koerper = JSON.parse((await rufe(route, WEG_STAND)).koerper) as {
      salden: { schluessel: string }[]
      ausgeblendet: number
    }
    expect(koerper.salden[0]?.schluessel).toBe('OPENROUTER_API_KEY')
    expect(koerper.ausgeblendet).toBe(0)
  })

  test('ohne Datei bleibt die Route 200 und sagt, daß keine da ist', async () => {
    process.env['PMH_USAGE_DATEI'] = join(verzeichnis, 'gibt-es-nicht.json')
    const fake = macheFake()
    apply(fake.ctx)
    const route = fake.routen.find((eintrag) => eintrag.path === WEG_STAND)
    if (route === undefined) return
    const antwort = await rufe(route, WEG_STAND)
    expect(antwort.status).toBe(200)
    const koerper = JSON.parse(antwort.koerper) as { datei: string | null; hinweis?: string }
    expect(koerper.datei).toBeNull()
    expect(koerper.hinweis).toContain('Keine Verbrauchsdatei')
  })
})

describe('Die Schätzung', () => {
  /** Ruft die Schätzung mit dieser Abfrage auf. */
  async function schaetze(abfrage: string): Promise<Antwort> {
    const fake = macheFake()
    apply(fake.ctx)
    const route = fake.routen.find((eintrag) => eintrag.path === WEG_SCHAETZUNG)
    if (route === undefined) throw new Error('die Schätzungsroute fehlt')
    return rufe(route, `${WEG_SCHAETZUNG}?${abfrage}`)
  }

  test('das gemessene Modell liefert eine Zahl mit Grundlage', async () => {
    const antwort = await schaetze('modell=google/gemini-2.5-flash-image&aufloesung=1K&anzahl=2')
    expect(antwort.status).toBe(200)
    const koerper = JSON.parse(antwort.koerper) as { schaetzung: { usd?: number; grund: string } }
    expect(koerper.schaetzung.usd).toBeGreaterThan(0)
    expect(koerper.schaetzung.grund).toContain('Schätzung')
    expect(koerper.schaetzung.grund).toContain('× 2 Bild(er)')
  })

  test('ohne Anker gibt es keine Zahl — aber einen Grund', async () => {
    const antwort = await schaetze('modell=irgendein/modell')
    expect(antwort.status).toBe(200)
    const koerper = JSON.parse(antwort.koerper) as { schaetzung: { usd?: number; grund: string } }
    expect(koerper.schaetzung.usd).toBeUndefined()
    expect(koerper.schaetzung.grund).toContain('kein Preis gemessen')
  })

  test('ohne Modell 400', async () => {
    const antwort = await schaetze('')
    expect(antwort.status).toBe(400)
  })

  test('eine unbekannte Auflösung ist ein Fehler, kein stiller Rückfall', async () => {
    const antwort = await schaetze('modell=google/gemini-2.5-flash-image&aufloesung=8K')
    expect(antwort.status).toBe(400)
    expect(JSON.parse(antwort.koerper).fehler).toContain('unbekannte Auflösung')
  })

  test('anzahl muß eine ganze Zahl im erlaubten Band sein', async () => {
    for (const falsch of ['0', '-1', '2.5', String(ANZAHL_MAX + 1), 'viele']) {
      const antwort = await schaetze(`modell=google/gemini-2.5-flash-image&anzahl=${falsch}`)
      expect(antwort.status).toBe(400)
    }
    const gut = await schaetze(`modell=google/gemini-2.5-flash-image&anzahl=${String(ANZAHL_MAX)}`)
    expect(gut.status).toBe(200)
  })
})

describe('Geteilte Schlüssel', () => {
  test('PMH_GETEILT liest eine Liste, auch mit Leerzeichen', () => {
    expect(geteilteSchluessel({ PMH_GETEILT: ' OPENROUTER_API_KEY , FREELMAPI_API_KEY ' })).toEqual(
      new Set(['OPENROUTER_API_KEY', 'FREELMAPI_API_KEY']),
    )
    expect(geteilteSchluessel({})).toEqual(new Set())
    expect(geteilteSchluessel({ PMH_GETEILT: ' , ' })).toEqual(new Set())
  })

  test('der Anteil neben dem Guthaben ist der 30-Tage-Verbrauch', () => {
    const aus = haengeAnteile(
      [{ schluessel: 'DEEPSEEK_API_KEY' }, { schluessel: 'ZAI_API_KEY' }],
      [{ schluessel: 'DEEPSEEK_API_KEY', usd: 111.01, usd30: 103.48, anfragen: 3, unbepreist: 0 }],
      new Set(),
    )
    // Nicht 111,01 (seit Beginn) — das war der Vergleich zweier Zeiträume.
    expect(aus[0]?.hier30Usd).toBeCloseTo(103.48, 6)
    // Ohne Markierung ist ein Schlüssel nicht geteilt, auch wenn er Verbrauch hat.
    expect(aus[0]?.geteilt).toBeUndefined()
    expect(aus[1]?.hier30Usd).toBeUndefined()
  })

  test('ausdrücklich geteilt, auch bevor Buchungen da sind', () => {
    const aus = haengeAnteile([{ schluessel: 'FREELMAPI_API_KEY' }], [], new Set(['FREELMAPI_API_KEY']))
    expect(aus[0]?.geteilt).toBe(true)
    expect(aus[0]?.hier30Usd).toBeUndefined()
  })
})

describe('Verschmelzen: der Stand gehört zur Zahl', () => {
  /** Der Saldo aus der Datei — 21.10.2026, 21:39 Ortszeit. */
  const datei = {
    schluessel: 'OPENROUTER_API_KEY',
    quelle: 'datei' as const,
    guthabenUsd: 19.773293471,
    stand: '2026-10-21T19:39:01.323Z',
  }

  test('scheitert der Abruf, bleibt das Datum der Datei stehen', () => {
    // `holeLebendeSalden` setzt `stand` auch bei einem Fehler auf „jetzt"; die Zahl kommt aber aus
    // der Datei. Ein Datum von heute darüber behauptet, sie sei frisch — genau das war am
    // 28.10.2026 zu lesen, über einem 6,8 Tage alten Wert.
    const live = {
      schluessel: 'OPENROUTER_API_KEY',
      quelle: 'live' as const,
      stand: '2026-10-28T16:20:00.000Z',
      fehler: 'Guthaben: Name nicht auflösbar · Limit: Name nicht auflösbar',
      fehlerTechnisch: 'Guthaben: getaddrinfo ENOTFOUND openrouter.ai',
    }
    const aus = verschmelzeSaldo(datei, live)
    expect(aus.quelle).toBe('datei')
    expect(aus.stand).toBe('2026-10-21T19:39:01.323Z')
    expect(aus.guthabenUsd).toBeCloseTo(19.7733, 4)
    expect(aus.fehler).toContain('Name nicht auflösbar')
    expect(aus.fehlerTechnisch).toContain('getaddrinfo')
  })

  test('antwortet der Anbieter, gilt sein Datum', () => {
    const live = {
      schluessel: 'OPENROUTER_API_KEY',
      quelle: 'live' as const,
      guthabenUsd: 4.2,
      stand: '2026-10-28T16:20:00.000Z',
    }
    const aus = verschmelzeSaldo(datei, live)
    expect(aus.quelle).toBe('live')
    expect(aus.stand).toBe('2026-10-28T16:20:00.000Z')
    expect(aus.guthabenUsd).toBeCloseTo(4.2, 6)
  })
})

