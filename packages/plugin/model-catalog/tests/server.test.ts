/**
 * Ein Lauf über die Anbieter — ohne Netz, ohne Host.
 *
 * **Was hier festgehalten wird.** Der Lauf hat vier Ausgänge, und jeder ist eine Entscheidung:
 * kein Schlüssel (kein Abruf), Anbieter antwortet nicht (Befund, kein Abbruch), Katalog nennt
 * nichts Wählbares (Befund), und Erfolg (Profile schreiben). Dazu die Regel, wer eine **neue** Route
 * anlegen darf. Ohne diese Prüfung wäre „kein Schlüssel" ein stiller leerer Katalog.
 *
 * @module @prometheus-harness/model-catalog/tests/server
 */

import { describe, expect, test } from 'bun:test'

import { PROVIDERS, providerRule } from '../src/catalog.ts'
import {
  existingModels,
  rulesFor,
  runCatalog,
  sameList,
  type Deps,
} from '../src/server.ts'

/** Eine Antwort, wie sie der Abruf liefert. */
function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Ein Katalog mit **einem** neuen und **einem** schon geführten Modell. */
const CATALOG = {
  data: [
    { id: 'recursive/flint-v1.0:free', name: 'Recursive: Flint (free)', context_length: 262144 },
    { id: 'openai/gpt-6.1-terra', name: 'OpenAI: GPT-6.1 Terra', context_length: 1050000 },
  ],
}

/** Baut die Abhängigkeiten für einen Lauf. */
function deps(parts: Partial<Deps> = {}): Deps {
  return {
    now: () => new Date('2026-10-26T22:00:00.000Z'),
    fetch: (async () => reply(CATALOG)) as unknown as typeof fetch,
    readKey: async () => 'secret',
    managed: async () => [{ id: 'openai/gpt-6.1-terra', name: 'GPT-6.1 Terra' }],
    writeProfile: async () => 'written',
    log: () => undefined,
    ...parts,
  }
}

/** Die Vorgabe der Optionen. */
const OPTIONS = { write: true, create: 'key-only', ttlMinutes: 10 }

/** Die Regel für OpenRouter — die Familie, gegen die der echte Abruf läuft. */
const OPENROUTER = PROVIDERS.filter((rule) => rule.provider === 'openrouter')

describe('a run over one provider', () => {
  test('writes the union when everything is there', async () => {
    const written: { provider: string; profile: Record<string, unknown> }[] = []
    const report = await runCatalog(
      OPENROUTER,
      deps({
        writeProfile: async (provider, profile) => {
          written.push({ provider, profile })
          return 'written'
        },
      }),
      OPTIONS,
    )

    const state = report.providers[0]
    expect(state?.provider).toBe('openrouter')
    expect(state?.written).toBe(true)
    expect(state?.added).toBe(1)
    expect(state?.models).toBe(2)
    expect(state?.error).toBeUndefined()
    expect(written[0]?.provider).toBe('openrouter')
    expect(written[0]?.profile['apiKeyEnv']).toBe('OPENROUTER_API_KEY')
    expect((written[0]?.profile['models'] as { id: string }[]).map((model) => model.id)).toEqual([
      'openai/gpt-6.1-terra',
      'recursive/flint-v1.0:free',
    ])
  })

  test('without a credential nothing is fetched', async () => {
    let calls = 0
    const report = await runCatalog(
      OPENROUTER,
      deps({
        readKey: async () => undefined,
        fetch: (async () => {
          calls += 1
          return reply(CATALOG)
        }) as unknown as typeof fetch,
      }),
      OPTIONS,
    )

    expect(calls).toBe(0)
    expect(report.providers[0]?.error).toContain('no credential')
    expect(report.providers[0]?.written).toBe(false)
  })

  test('a provider error is a finding, not an abort', async () => {
    const report = await runCatalog(
      OPENROUTER,
      deps({ fetch: (async () => reply({ error: 'no' }, 500)) as unknown as typeof fetch }),
      OPTIONS,
    )

    expect(report.providers[0]?.error).toContain('HTTP 500')
    expect(report.providers[0]?.written).toBe(false)
  })

  test('a catalog without a text-capable model writes nothing', async () => {
    const report = await runCatalog(
      OPENROUTER,
      deps({
        fetch: (async () =>
          reply({ data: [{ id: 'a/image', architecture: { output_modalities: ['image'] } }] })) as unknown as typeof fetch,
      }),
      OPTIONS,
    )

    expect(report.providers[0]?.error).toContain('no text-capable model')
    expect(report.providers[0]?.written).toBe(false)
  })

  test('create = never leaves an unconfigured route untouched', async () => {
    let writes = 0
    const report = await runCatalog(
      OPENROUTER,
      deps({
        managed: async () => [],
        writeProfile: async () => {
          writes += 1
          return 'written'
        },
      }),
      { ...OPTIONS, create: 'never' },
    )

    expect(writes).toBe(0)
    expect(report.providers[0]?.error).toContain('not configured')
  })

  test('write = false only reports', async () => {
    let writes = 0
    const report = await runCatalog(
      OPENROUTER,
      deps({
        writeProfile: async () => {
          writes += 1
          return 'written'
        },
      }),
      { ...OPTIONS, write: false },
    )

    expect(writes).toBe(0)
    expect(report.providers[0]?.models).toBe(2)
    expect(report.providers[0]?.error).toContain('not written')
  })

  test('a rejected write is reported', async () => {
    const report = await runCatalog(
      OPENROUTER,
      deps({
        writeProfile: async () => {
          throw new Error('settings/conflict')
        },
      }),
      OPTIONS,
    )

    expect(report.providers[0]?.error).toContain('settings/conflict')
    expect(report.providers[0]?.written).toBe(false)
  })

  test('a provider without a family is named', async () => {
    const report = await runCatalog(
      [{ provider: 'unknown-provider', credentialRef: 'UNKNOWN_API_KEY', protocol: 'openai-completions' }],
      deps(),
      OPTIONS,
    )
    expect(report.providers[0]?.error).toContain('provider directory')
  })
})

describe('the provider list from settings', () => {
  test('skips unknown entries and says so', () => {
    const messages: string[] = []
    const rules = rulesFor(['openrouter', 'unknown-provider', 'zenmux'], (text) => messages.push(text))
    expect(rules.map((rule) => rule.provider)).toEqual(['openrouter', 'zenmux'])
    expect(messages[0]).toContain('unknown-provider')
  })

  test('tolerates whitespace around the provider id', () => {
    expect(rulesFor([' openrouter '], () => undefined).map((rule) => rule.provider)).toEqual(['openrouter'])
  })
})

describe('comparing with the written state', () => {
  test('reads the models of a route from a settings value', () => {
    const value = { providers: { openrouter: { models: [{ id: 'a/b' }] } } }
    expect(existingModels(value, 'openrouter')).toEqual([{ id: 'a/b' }])
    expect(existingModels(value, 'zenmux')).toBeUndefined()
    expect(existingModels(undefined, 'openrouter')).toBeUndefined()
  })

  test('equal lists count as unchanged', () => {
    expect(sameList([{ id: 'a' }], [{ id: 'a' }])).toBe(true)
    expect(sameList([{ id: 'a' }], [{ id: 'b' }])).toBe(false)
  })
})

describe('the rules themselves', () => {
  test('every rule can be found', () => {
    for (const rule of PROVIDERS) expect(providerRule(rule.provider)?.credentialRef).toBe(rule.credentialRef)
  })
})
