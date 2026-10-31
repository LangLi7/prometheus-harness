import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { projektbereich } from '@prometheus-harness/crew-plan'

import { haengeEin, konfigurationAus, planLesen, planwurzel, type Hostschicht } from '../src/host.ts'

/** Ein Kontext, der nur mitschreibt — der Kern wird nicht nachgebaut, nur seine Form. */
function fakeKontext(): {
  ctx: Hostschicht
  adapter: unknown[]
  werkzeuge: string[]
  abmeldungen: (() => void)[]
  gerufen: string[]
} {
  const adapter: unknown[] = []
  const werkzeuge: string[] = []
  const abmeldungen: (() => void)[] = []
  const gerufen: string[] = []
  const ctx: Hostschicht = {
    llm: {
      registerAdapter(_providers: string[], eintrag: unknown): () => void {
        adapter.push(eintrag)
        return () => gerufen.push('adapter')
      },
      async *stream(): AsyncIterable<StreamChunk> {
        yield* []
      },
    },
    tools: {
      register(definition: ToolDefinition): () => void {
        werkzeuge.push(definition.name)
        return () => gerufen.push(`werkzeug:${definition.name}`)
      },
    },
    on(): () => void {
      return () => gerufen.push('waterfall')
    },
    effect(setup: () => () => void): void {
      abmeldungen.push(setup())
    },
  }
  return { ctx, adapter, werkzeuge, abmeldungen, gerufen }
}

const CREW = {
  id: 'crew-1',
  name: 'Zwei Modelle',
  rollen: {
    planner: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
    executor: { familie: 'deepseek-official', modell: 'deepseek-flash' },
  },
}

const NUTZER = '11111111-1111-4111-8111-111111111111'

describe('konfigurationAus', () => {
  test('ohne Crews gibt es nichts einzuhängen', () => {
    expect(
      konfigurationAus({
        nutzer: NUTZER,
        verzeichnis: '/crew',
        crews: [],
        stand: { crews: [], standard: null, projekt: null, aktiv: true },
      }),
    ).toBeUndefined()
  })

  test('die Standard-Crew gilt, sonst die erste', () => {
    const mitStandard = konfigurationAus({
      nutzer: NUTZER,
      verzeichnis: '/crew',
      crews: [CREW],
      stand: { crews: [CREW], standard: 'crew-1', projekt: null, aktiv: true },
    })
    expect(mitStandard?.crew).toBe('crew-1')

    const ohne = konfigurationAus({
      nutzer: NUTZER,
      verzeichnis: '/crew',
      crews: [CREW],
      stand: { crews: [CREW], standard: 'gibt-es-nicht', projekt: null, aktiv: true },
    })
    expect(ohne?.crew).toBe('crew-1')
  })

  test('das Projekt kommt mit, wenn es gesetzt ist', () => {
    const konfiguration = konfigurationAus({
      nutzer: NUTZER,
      verzeichnis: '/crew',
      crews: [CREW],
      stand: { crews: [CREW], standard: 'crew-1', projekt: 'C:/Arbeit/Projekt', aktiv: true },
    })
    expect(konfiguration?.projekt).toBe('C:/Arbeit/Projekt')
    expect(konfiguration?.nutzer).toBe(NUTZER)
    expect(konfiguration?.verzeichnis).toBe('/crew')
  })

  test('ohne Betriebskonto bleiben die Modelle, aber ohne Werkzeug und Buchung', () => {
    const konfiguration = konfigurationAus({
      nutzer: null,
      verzeichnis: '/crew',
      crews: [CREW],
      stand: { crews: [CREW], standard: 'crew-1', projekt: null, aktiv: true },
    })
    expect(konfiguration?.nurAdapter).toBe(true)
    expect(konfiguration?.nutzer).toBe('')
  })
})

describe('haengeEin', () => {
  test('meldet Adapter, Werkzeuge und Buchung an — und nimmt sie zurück', () => {
    const { ctx, adapter, werkzeuge, abmeldungen, gerufen } = fakeKontext()
    const meldungen: string[] = []
    const konfiguration = konfigurationAus({
      nutzer: NUTZER,
      verzeichnis: '/crew',
      crews: [CREW],
      stand: { crews: [CREW], standard: 'crew-1', projekt: null, aktiv: true },
    })
    const abmelden = haengeEin(ctx, konfiguration, (meldung) => meldungen.push(meldung))
    expect(abmelden).toBeDefined()
    expect(adapter).toHaveLength(1)
    expect(werkzeuge).toEqual(
      expect.arrayContaining(['crew_plan', 'crew_todo', 'crew_todo_status', 'crew_workspace']),
    )
    expect(meldungen).toHaveLength(0)
    // **Kein `effect` mehr im Kontext.** Die Abmeldung gehört dem Aufrufer; sie wird hier
    // ausgelöst und muß Adapter, Wasserfall und jedes Werkzeug zurücknehmen.
    expect(abmeldungen).toHaveLength(0)
    abmelden?.()
    expect(gerufen).toContain('adapter')
    expect(gerufen).toContain('waterfall')
    expect(gerufen.filter((eintrag) => eintrag.startsWith('werkzeug:'))).toHaveLength(4)
  })

  test('ohne Konfiguration wird nichts eingehängt', () => {
    const { ctx, adapter } = fakeKontext()
    expect(haengeEin(ctx, undefined, () => undefined)).toBeUndefined()
    expect(adapter).toHaveLength(0)
  })

  test('nur Modelle: Adapter ja, Werkzeuge und Buchung nein', () => {
    const { ctx, adapter, werkzeuge, gerufen } = fakeKontext()
    const konfiguration = konfigurationAus({
      nutzer: null,
      verzeichnis: '/crew',
      crews: [CREW],
      stand: { crews: [CREW], standard: 'crew-1', projekt: null, aktiv: true },
    })
    const abmelden = haengeEin(ctx, konfiguration, () => undefined)
    expect(adapter).toHaveLength(1)
    expect(werkzeuge).toHaveLength(0)
    abmelden?.()
    expect(gerufen).toEqual(['adapter'])
  })
})

describe('planLesen', () => {
  let ordner: string | undefined

  afterEach(() => {
    if (ordner !== undefined) rmSync(ordner, { recursive: true, force: true })
    ordner = undefined
  })

  test('ohne Dokument ist der Plan leer, nicht kaputt', async () => {
    ordner = mkdtempSync(join(tmpdir(), 'crew-plan-'))
    const sicht = await planLesen(ordner, NUTZER, 'crew-1', null)
    expect(sicht.crew).toBe('crew-1')
    expect(sicht.rollen).toHaveLength(0)
  })

  test('ein vorhandenes Dokument wird gelesen', async () => {
    ordner = mkdtempSync(join(tmpdir(), 'crew-plan-'))
    const bereich = projektbereich({ nutzer: NUTZER, pfad: 'C:/Arbeit/Projekt' })
    const pfad = join(ordner, NUTZER, 'crew-1', `${bereich.label}.json`)
    mkdirSync(dirname(pfad), { recursive: true })
    const jetzt = new Date().toISOString()
    writeFileSync(
      pfad,
      JSON.stringify({
        fassung: 1,
        crew: 'crew-1',
        nutzer: NUTZER,
        projekt: bereich.label,
        erstellt: jetzt,
        aktualisiert: jetzt,
        rollen: {
          executor: {
            aufgaben: [{ id: 'a', text: 'Bauen', stand: 'in_progress', erstellt: jetzt, aktualisiert: jetzt }],
          },
        },
      }),
      'utf8',
    )
    const sicht = await planLesen(ordner, NUTZER, 'crew-1', 'C:/Arbeit/Projekt')
    expect(sicht.rollen[0]?.rolle).toBe('executor')
    expect(sicht.rollen[0]?.aufgaben[0]?.text).toBe('Bauen')
    expect(sicht.rollen[0]?.aufgaben[0]?.stand).toBe('in_progress')
  })

  test('planwurzel ist <home>/crew', () => {
    expect(planwurzel(join('C:', 'dsh'))).toBe(join('C:', 'dsh', 'crew'))
  })
})

describe('GenerateOptions bleibt unberührt', () => {
  test('der Fake-Kontext erfüllt die Form, die der Adapter erwartet', () => {
    const { ctx } = fakeKontext()
    const optionen = { provider: 'crew', model: 'crew-1' } as unknown as GenerateOptions
    expect(typeof ctx.llm.stream(optionen)).toBe('object')
  })
})
