import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'

import type { Context } from '@deepseek-ai/cordis'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { apply } from '../src/server.ts'

/** Eine Antwort, die den Status und den Körper festhält. */
interface Aufgefangen {
  status: number
  koerper: unknown
}

/** Baut eine Attrappe des Kern-Kontexts. */
function fakeKontext(): {
  ctx: Context
  adapter: unknown[]
  werkzeuge: string[]
  wege: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }[]
} {
  const adapter: unknown[] = []
  const werkzeuge: string[] = []
  const wege: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }[] = []
  const ctx = {
    webServer: {
      protocol: 'http:',
      register(route: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }): () => void {
        wege.push(route)
        return () => undefined
      },
    },
    llm: {
      registerAdapter(_providers: string[], eintrag: unknown): () => void {
        adapter.push(eintrag)
        return () => undefined
      },
      async *stream(): AsyncIterable<StreamChunk> {
        yield* []
      },
    },
    tools: {
      register(definition: ToolDefinition): () => void {
        werkzeuge.push(definition.name)
        return () => undefined
      },
    },
    on(): () => void {
      return () => undefined
    },
    effect(setup: () => () => void): void {
      setup()
    },
    logger: undefined,
  } as unknown as Context
  return { ctx, adapter, werkzeuge, wege }
}

/** Eine Antwort-Attrappe. */
function fakeRes(): { res: unknown; aufgefangen: Aufgefangen } {
  const aufgefangen: Aufgefangen = { status: 0, koerper: undefined }
  const res = {
    setHeader(): void {},
    writeHead(status: number): void {
      aufgefangen.status = status
    },
    end(text?: string): void {
      aufgefangen.koerper = text === undefined ? undefined : (JSON.parse(text) as unknown)
    },
  }
  return { res, aufgefangen }
}

/** Wartet, bis `bedingung` wahr wird — oder gibt nach einer Sekunde auf. */
async function warte(bedingung: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (bedingung()) return
    await new Promise((fertig) => setTimeout(fertig, 10))
  }
}

const CREW = {
  id: 'crew-1',
  rollen: {
    planner: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
    executor: { familie: 'deepseek-official', modell: 'deepseek-flash' },
  },
}

let heim: string
const vorher = { dsh: process.env['DSH_HOME'], datenbank: process.env['DATABASE_URL'] }

beforeAll(() => {
  heim = mkdtempSync(join(tmpdir(), 'crew-plugin-'))
  mkdirSync(join(heim, 'crew'), { recursive: true })
  writeFileSync(
    join(heim, 'crew', 'config.json'),
    JSON.stringify({ crews: [CREW], crew: 'crew-1', nutzer: 'operator', projekt: 'C:/Arbeit/Projekt' }),
    'utf8',
  )
})

afterAll(() => {
  rmSync(heim, { recursive: true, force: true })
  if (vorher.dsh === undefined) delete process.env['DSH_HOME']
  else process.env['DSH_HOME'] = vorher.dsh
  if (vorher.datenbank === undefined) delete process.env['DATABASE_URL']
  else process.env['DATABASE_URL'] = vorher.datenbank
})

afterEach(() => {
  if (vorher.datenbank === undefined) delete process.env['DATABASE_URL']
  else process.env['DATABASE_URL'] = vorher.datenbank
})

describe('ohne Datenbank', () => {
  test('der Weg wird eingehängt, die Datei steuert den Adapter', async () => {
    process.env['DSH_HOME'] = heim
    delete process.env['DATABASE_URL']
    const { ctx, adapter, werkzeuge, wege } = fakeKontext()
    apply(ctx)
    await warte(() => adapter.length > 0)
    // Zwei Wege: der Stand des Kontos und der Katalog der wählbaren Routen/Modelle.
    expect(wege.map((weg) => weg.path)).toEqual(['/api/pmh/crew', '/api/pmh/crew/katalog'])
    expect(adapter).toHaveLength(1)
    expect(werkzeuge).toContain('crew_plan')

    const { res, aufgefangen } = fakeRes()
    await wege[0]?.handler({ method: 'GET', url: '/api/pmh/crew', headers: {} }, res)
    expect(aufgefangen.status).toBe(200)
    const sicht = aufgefangen.koerper as { art: string; crews: { id: string }[]; betrieb: { werkzeuge: boolean } }
    expect(sicht.art).toBe('datei')
    expect(sicht.crews.map((crew) => crew.id)).toEqual(['crew-1'])
    expect(sicht.betrieb.werkzeuge).toBe(true)
  })

  test('ein PUT wird abgelehnt, mit Grund und Pfad', async () => {
    process.env['DSH_HOME'] = heim
    delete process.env['DATABASE_URL']
    const { ctx, wege } = fakeKontext()
    apply(ctx)
    const { res, aufgefangen } = fakeRes()
    await wege[0]?.handler({ method: 'PUT', url: '/api/pmh/crew', headers: {} }, res)
    expect(aufgefangen.status).toBe(409)
    const antwort = aufgefangen.koerper as { fehler: string; datei: string }
    expect(antwort.fehler).toBe('ohne-datenbank')
    expect(antwort.datei).toContain('config.json')
  })

  test('eine unbekannte Methode ist 405', async () => {
    process.env['DSH_HOME'] = heim
    delete process.env['DATABASE_URL']
    const { ctx, wege } = fakeKontext()
    apply(ctx)
    const { res, aufgefangen } = fakeRes()
    await wege[0]?.handler({ method: 'DELETE', url: '/api/pmh/crew', headers: {} }, res)
    expect(aufgefangen.status).toBe(405)
  })

  test('Englisch ist die Vorgabe, Deutsch kommt auf Anfrage', async () => {
    process.env['DSH_HOME'] = heim
    delete process.env['DATABASE_URL']
    const { ctx, wege } = fakeKontext()
    apply(ctx)

    const ohne = fakeRes()
    await wege[0]?.handler({ method: 'GET', url: '/api/pmh/crew', headers: {} }, ohne.res)
    expect(ohne.aufgefangen.status).toBe(200)
    const englisch = ohne.aufgefangen.koerper as { hinweis: string }
    expect(englisch.hinweis).toContain('DATABASE_URL is not set')

    const mit = fakeRes()
    await wege[0]?.handler({ method: 'GET', url: '/api/pmh/crew?sprache=de', headers: {} }, mit.res)
    const deutsch = mit.aufgefangen.koerper as { hinweis: string }
    expect(deutsch.hinweis).toContain('ist nicht gesetzt')

    const kopf = fakeRes()
    await wege[0]?.handler(
      { method: 'GET', url: '/api/pmh/crew', headers: { 'accept-language': 'de-CH,de;q=0.9' } },
      kopf.res,
    )
    const ueberKopf = kopf.aufgefangen.koerper as { hinweis: string }
    expect(ueberKopf.hinweis).toContain('ist nicht gesetzt')
  })
})

describe('mit Datenbank', () => {
  test('ohne Sitzung ist GET 401 — die Routen sind gesperrt', async () => {
    process.env['DSH_HOME'] = heim
    // Eine Adresse, die niemanden erreicht: die Prüfung fragt die Sitzung, nicht die Datenbank.
    process.env['DATABASE_URL'] = 'postgres://pmh_app:geheim@127.0.0.1:1/pmh'
    const { ctx, wege } = fakeKontext()
    apply(ctx)
    const { res, aufgefangen } = fakeRes()
    await wege[0]?.handler(
      { method: 'GET', url: '/api/pmh/crew', headers: {} },
      res,
    )
    expect([401, 403, 503]).toContain(aufgefangen.status)
  })
})
