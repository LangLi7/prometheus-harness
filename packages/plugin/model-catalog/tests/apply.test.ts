/**
 * Die Naht des Plugins — Routen, Schreibweg, Wiederholung.
 *
 * **Warum das eine eigene Prüfung ist.** `runCatalog` kennt nur den Bericht. Der Weg in die
 * Einstellungen ist ein anderer Vertrag: `describe` liefert eine Revision, `update` nimmt sie
 * entgegen und weist ab, wenn sie veraltet ist. Ohne Host läßt sich genau das mit einer Attrappe
 * prüfen — und es ist die Stelle, an der ein Fehler Daten überschreiben würde.
 *
 * @module @prometheus-harness/model-catalog/tests/apply
 */

import { describe, expect, test } from 'bun:test'

import { REFRESH_PATH, STATUS_PATH, apply } from '../src/server.ts'

/** Ein Einstellungswert, wie ihn `describe` liefert. */
interface FakeSection {
  ns: string
  revision: number
  value: unknown
}

/** Der Bauplan einer Attrappe des Host-Kontexts. */
interface FakeOptions {
  /** Der Anfangswert der Sektion `llm-pi-ai`. */
  readonly value?: unknown
  /** Ob der erste `update`-Aufruf mit einem Revisionskonflikt scheitern soll. */
  readonly conflictOnce?: boolean
  /** Ob die Sektion `llm-pi-ai` gar nicht geladen ist (Adapter abgeschaltet). */
  readonly noSection?: boolean
  /** Was `llm.listModels` zurückgibt. */
  readonly models?: readonly { id: string; name: string }[]
}

/** Ein `res`-Ersatz, der den geschriebenen Körper mitschreibt. */
function fakeResponse(): { status: number; body: unknown; res: unknown } {
  const box = { status: 0, body: undefined as unknown, res: undefined as unknown }
  box.res = {
    writeHead: (status: number) => {
      box.status = status
    },
    end: (text: string) => {
      box.body = JSON.parse(text) as unknown
    },
  }
  return box
}

/**
 * Baut einen minimalen Host-Kontext.
 *
 * @param options - Sektion, Konflikt, Modelle
 * @returns der Kontext, die Aufzeichnungen und die eingehängten Routen
 */
function fakeContext(options: FakeOptions = {}): {
  ctx: unknown
  updates: { ns: string; patch: unknown; revision: number }[]
  routes: Map<string, (req: unknown, res: unknown) => Promise<void>>
  section: FakeSection
} {
  const section: FakeSection = { ns: 'llm-pi-ai', revision: 1, value: options.value ?? { providers: {} } }
  const updates: { ns: string; patch: unknown; revision: number }[] = []
  const routes = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  let conflictPending = options.conflictOnce === true

  const settings = {
    describe: () => (options.noSection === true ? [] : [{ ...section }]),
    update: async (ns: string, patch: unknown, revision: number) => {
      if (conflictPending) {
        conflictPending = false
        throw new Error('settings namespace "llm-pi-ai" changed since it was read (expected revision 1, now 2)')
      }
      if (revision !== section.revision) throw new Error('settings/conflict')
      updates.push({ ns, patch, revision })
      section.revision += 1
      section.value = patch
    },
  }

  const ctx = {
    get: (name: string) =>
      name === 'credentials'
        ? { resolve: async () => ({ value: 'secret' }) }
        : name === 'connection'
          ? { requestRejection: () => undefined }
          : undefined,
    effect: (fn: () => () => void, _label: string) => {
      fn()
    },
    webServer: {
      register: (entry: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
        routes.set(entry.path, entry.handler)
        return () => {
          routes.delete(entry.path)
        }
      },
    },
    settings,
    llm: { listModels: async () => options.models ?? [] },
    logger: { info: () => undefined },
  }

  return { ctx, updates, routes, section }
}

/** Ein Abruf, der einen Katalog mit genau einem Modell liefert. */
const fetchOne = (async () =>
  new Response(
    JSON.stringify({ data: [{ id: 'recursive/flint-v1.0:free', name: 'Recursive: Flint (free)', context_length: 262144 }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )) as unknown as typeof fetch

describe('the plugin seams', () => {
  test('registers the status and refresh routes', () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = fetchOne
    try {
      const { ctx, routes } = fakeContext()
      apply(ctx as never, { providers: ['openrouter'], ttlMinutes: 600, create: 'key-only', write: true })
      expect([...routes.keys()].sort()).toEqual([REFRESH_PATH, STATUS_PATH].sort())
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('writes the profile into the llm-pi-ai section', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = fetchOne
    try {
      const { ctx, routes, updates } = fakeContext()
      apply(ctx as never, { providers: ['openrouter'], ttlMinutes: 600, create: 'key-only', write: true })
      const handler = routes.get(REFRESH_PATH)
      if (handler === undefined) throw new Error('refresh route missing')
      const box = fakeResponse()
      await handler({ headers: {} }, box.res)

      expect(box.status).toBe(200)
      expect(updates).toHaveLength(1)
      expect(updates[0]?.ns).toBe('llm-pi-ai')
      const patch = updates[0]?.patch as { providers: Record<string, { models: { id: string }[] }> }
      expect(patch.providers['openrouter']?.models.map((model) => model.id)).toEqual([
        'recursive/flint-v1.0:free',
      ])
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('retries once when the revision moved', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = fetchOne
    try {
      const { ctx, routes, updates } = fakeContext({ conflictOnce: true })
      apply(ctx as never, { providers: ['openrouter'], ttlMinutes: 600, create: 'key-only', write: true })
      const handler = routes.get(REFRESH_PATH)
      if (handler === undefined) throw new Error('refresh route missing')
      await handler({ headers: {} }, fakeResponse().res)
      expect(updates).toHaveLength(1)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('does not write when the list is unchanged', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = fetchOne
    try {
      const same = { providers: { openrouter: { models: [{ id: 'recursive/flint-v1.0:free', name: 'Recursive: Flint (free)', contextWindow: 262144 }] } } }
      const { ctx, routes, updates } = fakeContext({ value: same })
      apply(ctx as never, { providers: ['openrouter'], ttlMinutes: 600, create: 'key-only', write: true })
      const handler = routes.get(REFRESH_PATH)
      if (handler === undefined) throw new Error('refresh route missing')
      const box = fakeResponse()
      await handler({ headers: {} }, box.res)
      expect(updates).toHaveLength(0)
      expect((box.body as { providers: { written: boolean }[] }).providers[0]?.written).toBe(false)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('reports a finding instead of failing when the adapter is not mounted', async () => {
    // **Der Fall hinter der Prüfung.** Ist `llm-pi-ai` im Profil abgeschaltet, gibt es die Sektion
    // nicht. Ein Wurf hier wäre ein 500 auf einer Statusabfrage — die Route soll stattdessen sagen,
    // warum sie nicht schreiben konnte.
    const realFetch = globalThis.fetch
    globalThis.fetch = fetchOne
    try {
      const { ctx, routes, updates } = fakeContext({ noSection: true })
      apply(ctx as never, { providers: ['openrouter'], ttlMinutes: 600, create: 'key-only', write: true })
      const handler = routes.get(REFRESH_PATH)
      if (handler === undefined) throw new Error('refresh route missing')
      const box = fakeResponse()
      await handler({ headers: {} }, box.res)

      expect(box.status).toBe(200)
      expect(updates).toHaveLength(0)
      const state = (box.body as { providers: { written: boolean; error?: string }[] }).providers[0]
      expect(state?.written).toBe(false)
      expect(state?.error).toContain('is not loaded')
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
