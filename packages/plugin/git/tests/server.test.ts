/**
 * Die vier Routen — ohne Host, aber mit einem Kontext, der mitschreibt.
 *
 * ## Was diese Prüfung beweist
 *
 * Daß `apply` vier Adressen einträgt, daß alle ohne Anmeldung abweisen, daß der Stand aus einem
 * echten Repository bis in die Antwort durchkommt, und daß **ungültige Aufträge abgewiesen werden,
 * bevor git etwas schreibt**. Was sie nicht beweist: daß der Loader das Plugin lädt — das steht erst
 * nach einem Neustart des Hosts fest.
 *
 * ## Warum kein Test eine Schreibaktion auslöst
 *
 * Der Repo-Workspace dieses Tests ist **dieses Projekt**. Ein `stage` darauf wäre ein Eingriff in
 * den Arbeitsbaum des Nutzers. Geprüft werden deshalb nur die Wege, die vor dem Schreiben enden.
 *
 * @module @prometheus-harness/git/tests/server
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

import { apply, name, WEG_AKTION, WEG_DIFF, WEG_FERN, WEG_STAND } from '../src/server.ts'

/** Ein Verzeichnis ohne Repository. */
const LEER = mkdtempSync(join(tmpdir(), 'pmh-git-leer-'))

/** Die Umgebung, die dieser Test wegräumt. */
const TOKENS = ['GITHUB_TOKEN', 'GH_TOKEN', 'GITLAB_TOKEN', 'GL_TOKEN', 'GITEA_TOKEN', 'FORGEJO_TOKEN'] as const
let gerettet: Record<string, string | undefined> = {}

beforeEach(() => {
  gerettet = {}
  for (const token of TOKENS) {
    gerettet[token] = process.env[token]
    delete process.env[token]
  }
})

afterAll(() => {
  rmSync(LEER, { recursive: true, force: true })
  for (const token of TOKENS) {
    const wert = gerettet[token]
    if (wert === undefined) delete process.env[token]
    else process.env[token] = wert
  }
})

/** Eine geschriebene Antwort. */
interface Antwort {
  status: number
  koerper: string
}

/** Ein Workspace, wie ihn die Registry liefert. */
interface FakeWorkspace {
  readonly id: string
  readonly path: string
  readonly title: string
}

/** Was ein Fake-Kontext mitschreibt. */
interface Fake {
  readonly ctx: Context
  readonly routen: WebRoute[]
  readonly wirkungen: (() => void)[]
}

/**
 * Baut einen Kontext mit zwei Workspaces: diesem Repository und einem leeren Verzeichnis.
 *
 * @param erlaubt - ob der Verbindungsdienst durchläßt
 * @returns der Fake
 */
function macheFake(erlaubt = true): Fake {
  const routen: WebRoute[] = []
  const wirkungen: (() => void)[] = []
  const workspaces: FakeWorkspace[] = [
    { id: 'w-repo', path: process.cwd(), title: 'Prometheus Harness' },
    { id: 'w-leer', path: LEER, title: 'Leer' },
  ]
  const ctx = {
    get: (dienst: string) =>
      dienst === 'connection' ? { requestRejection: () => (erlaubt ? undefined : 401) } : undefined,
    webServer: {
      register: (route: WebRoute) => {
        routen.push(route)
        return () => {
          const at = routen.indexOf(route)
          if (at >= 0) routen.splice(at, 1)
        }
      },
    },
    workspaceRegistry: { list: () => workspaces },
    effect: (fn: () => () => void) => {
      wirkungen.push(fn())
    },
  } as unknown as Context
  return { ctx, routen, wirkungen }
}

/**
 * Ruft eine Route auf.
 *
 * @param route - die Route
 * @param url - der angefragte Pfad samt Abfrage
 * @param koerper - ein JSON-Körper für POST
 * @param methode - die Methode
 * @returns Status und Körper
 */
async function rufe(route: WebRoute, url: string, koerper?: string, methode = 'GET'): Promise<Antwort> {
  const antwort: Antwort = { status: 0, koerper: '' }
  const res = {
    writeHead: (status: number) => {
      antwort.status = status
    },
    end: (text?: string) => {
      antwort.koerper = text ?? ''
    },
  }
  const req: Record<string, unknown> = { url, headers: {}, method: methode }
  if (koerper !== undefined) {
    // `for await` sucht den Schlüssel am Objekt, nicht über einen String.
    ;(req as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] = async function* () {
      yield Buffer.from(koerper, 'utf8')
    }
  }
  await route.handler(req as unknown as IncomingMessage, res as unknown as ServerResponse)
  return antwort
}

/**
 * Sucht eine Route nach Pfad.
 *
 * @param routen - die eingetragenen Routen
 * @param pfad - der gesuchte Pfad
 * @returns die Route
 */
function route(routen: readonly WebRoute[], pfad: string): WebRoute {
  const gefunden = routen.find((eintrag) => eintrag.path === pfad)
  if (gefunden === undefined) throw new Error(`Route ${pfad} fehlt`)
  return gefunden
}

describe('Das Plugin', () => {
  test('trägt vier Adressen ein', () => {
    const fake = macheFake()
    apply(fake.ctx)
    expect(fake.routen.map((eintrag) => eintrag.path).sort()).toEqual(
      [WEG_STAND, WEG_DIFF, WEG_AKTION, WEG_FERN].sort(),
    )
    expect(fake.routen.every((eintrag) => eintrag.kind === 'exact')).toBe(true)
  })

  test('beim Abhängen verschwindet alles wieder', () => {
    const fake = macheFake()
    apply(fake.ctx)
    for (const ab of fake.wirkungen.splice(0).reverse()) ab()
    expect(fake.routen).toHaveLength(0)
  })

  test('der Plugin-Name ist stabil', () => {
    expect(name).toBe('pmh-git')
  })
})

describe('Die Sperre', () => {
  test('ohne Anmeldung antworten alle vier Routen 401', async () => {
    const fake = macheFake(false)
    apply(fake.ctx)
    for (const eintrag of fake.routen) {
      const antwort = await rufe(eintrag, eintrag.path)
      expect(antwort.status).toBe(401)
      expect(JSON.parse(antwort.koerper).fehler).toBe('nicht angemeldet')
    }
  })

  test('ohne Verbindungsdienst antworten sie 503 — nicht 200', async () => {
    const routen: WebRoute[] = []
    const ctx = {
      get: () => undefined,
      webServer: {
        register: (eintrag: WebRoute) => {
          routen.push(eintrag)
          return () => undefined
        },
      },
      workspaceRegistry: { list: () => [] },
      effect: (fn: () => () => void) => {
        fn()
      },
    } as unknown as Context
    apply(ctx)
    for (const eintrag of routen) {
      const antwort = await rufe(eintrag, eintrag.path)
      expect(antwort.status).toBe(503)
    }
  })
})

describe('GET /stand', () => {
  test('nennt beide Workspaces, das Repository und den fehlenden Rest', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(route(fake.routen, WEG_STAND), WEG_STAND)
    expect(antwort.status).toBe(200)
    const koerper = JSON.parse(antwort.koerper) as {
      gelesenAm: string
      workspaces: { id: string; repo: { zweig: { name: string | null }; commits: unknown[] } | null; hinweis?: string }[]
    }
    expect(koerper.workspaces).toHaveLength(2)
    const repo = koerper.workspaces.find((eintrag) => eintrag.id === 'w-repo')
    expect(repo?.repo).not.toBeNull()
    expect(repo?.repo?.zweig.name).toBeTruthy()
    expect(repo?.repo?.commits.length).toBeGreaterThan(0)

    const leer = koerper.workspaces.find((eintrag) => eintrag.id === 'w-leer')
    expect(leer?.repo).toBeNull()
    expect(leer?.hinweis).toContain('keinem git-Repository')
  })

  test('ein unbekannter Modus ist 400', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(route(fake.routen, WEG_STAND), `${WEG_STAND}?modus=irgendwas`)
    expect(antwort.status).toBe(400)
  })

  test('ein unbekannter Workspace ist 404', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(route(fake.routen, WEG_STAND), `${WEG_STAND}?workspace=gibtsnicht`)
    expect(antwort.status).toBe(404)
  })
})

describe('GET /diff', () => {
  test('ohne Pfad ist es 400', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(route(fake.routen, WEG_DIFF), `${WEG_DIFF}?workspace=w-repo`)
    expect(antwort.status).toBe(400)
  })

  test('ein unbekannter Bereich ist 400', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(route(fake.routen, WEG_DIFF), `${WEG_DIFF}?workspace=w-repo&pfad=a.txt&bereich=quatsch`)
    expect(antwort.status).toBe(400)
  })

  test('ein Workspace ohne Repository ist 404', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(route(fake.routen, WEG_DIFF), `${WEG_DIFF}?workspace=w-leer&pfad=a.txt`)
    expect(antwort.status).toBe(404)
  })
})

describe('POST /aktion', () => {
  test('ein GET ist 405', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(route(fake.routen, WEG_AKTION), WEG_AKTION)
    expect(antwort.status).toBe(405)
  })

  test('eine unbekannte Aktion ist 400', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(route(fake.routen, WEG_AKTION), WEG_AKTION, JSON.stringify({ workspace: 'w-repo', aktion: 'rm-rf' }), 'POST')
    expect(antwort.status).toBe(400)
  })

  test('ein unbekannter Workspace ist 404', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(route(fake.routen, WEG_AKTION), WEG_AKTION, JSON.stringify({ workspace: 'weg', aktion: 'stage' }), 'POST')
    expect(antwort.status).toBe(404)
  })

  test('ein unzulässiger Pfad wird abgewiesen, bevor git schreibt', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(
      route(fake.routen, WEG_AKTION),
      WEG_AKTION,
      JSON.stringify({ workspace: 'w-repo', aktion: 'stage', pfade: [''] }),
      'POST',
    )
    expect(antwort.status).toBe(400)
    expect(JSON.parse(antwort.koerper).fehler).toContain('Pfad')
  })
})

describe('GET /fern', () => {
  test('ohne Repository ist es 404', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(route(fake.routen, WEG_FERN), `${WEG_FERN}?workspace=w-leer`)
    expect(antwort.status).toBe(404)
  })

  test('ohne Token antwortet die Route mit einem Hinweis, nicht mit einer leeren Liste', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const antwort = await rufe(route(fake.routen, WEG_FERN), `${WEG_FERN}?workspace=w-repo`)
    expect(antwort.status).toBe(200)
    const koerper = JSON.parse(antwort.koerper) as { hinweis?: string; pulls: unknown[] }
    expect(koerper.hinweis).toContain('Kein Token')
    expect(koerper.pulls).toHaveLength(0)
  })
})

