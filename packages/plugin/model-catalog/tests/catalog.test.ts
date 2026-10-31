/**
 * Der Katalogleser und die Zusammenführung.
 *
 * **Warum diese Prüfung den Kern ausmacht.** Der Fehler, der das Plugin ausgelöst hat, war eine
 * Liste, die nicht stimmte. Hier steht deshalb, **welche** Zeilen aus einer Katalogantwort
 * hereinkommen und **wie** sie sich mit dem verhalten, was die Route schon führt — ohne Netz, ohne
 * Host.
 *
 * @module @prometheus-harness/model-catalog/tests/catalog
 */

import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_PROVIDERS,
  PROVIDERS,
  familyFor,
  mergeModels,
  modelsUrl,
  profileFor,
  providerRule,
  readModels,
} from '../src/catalog.ts'

/** Ein Katalogausschnitt in der Form, die OpenRouter liefert (gekürzt). */
const CATALOG = {
  data: [
    {
      id: 'recursive/flint-v1.0:free',
      name: 'Recursive: Flint (free)',
      context_length: 262144,
      top_provider: { max_completion_tokens: 235929 },
      architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    },
    {
      id: 'openai/gpt-6.1-terra',
      name: 'OpenAI: GPT-6.1 Terra',
      context_length: 1050000,
      top_provider: { max_completion_tokens: 128000 },
      architecture: { input_modalities: ['file', 'image', 'text'], output_modalities: ['text'] },
    },
    {
      id: 'openai/gpt-image-1',
      name: 'OpenAI: GPT Image',
      context_length: 128000,
      architecture: { input_modalities: ['text'], output_modalities: ['image'] },
    },
    {
      id: 'openrouter/auto',
      name: 'Auto',
      architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    },
    { id: 'without-name', context_length: 8_000 },
    { id: 'recursive/flint-v1.0:free', name: 'Duplicate' },
    { name: 'without id' },
  ],
}

describe('reading the catalog', () => {
  const models = readModels(CATALOG)

  test('keeps text-capable models in catalog order', () => {
    expect(models.map((model) => model.id)).toEqual([
      'recursive/flint-v1.0:free',
      'openai/gpt-6.1-terra',
      'without-name',
    ])
  })

  test('drops image-only models and redirects', () => {
    expect(models.some((model) => model.id === 'openai/gpt-image-1')).toBe(false)
    expect(models.some((model) => model.id === 'openrouter/auto')).toBe(false)
  })

  test('falls back to the id when no name is declared', () => {
    expect(models[0]?.name).toBe('Recursive: Flint (free)')
    expect(models[2]?.name).toBe('without-name')
  })

  test('reads the context window, but keeps a large output budget out of the profile', () => {
    expect(models[0]?.contextWindow).toBe(262144)
    // **235 929 Token Ausgabe wären 26 215 Token weniger Prompt.** Der Adapter nimmt ohne Angabe
    // 32 768 an; alles darüber schadet nur — siehe ADAPTER_DEFAULT_MAX_TOKENS.
    expect(models[0]?.maxTokens).toBeUndefined()
    expect(models[1]?.contextWindow).toBe(1050000)
    expect(models[1]?.maxTokens).toBeUndefined()
  })

  test('keeps only input modalities the adapter knows', () => {
    expect(models[1]?.input).toEqual(['text', 'image'])
    expect(models[0]?.input).toEqual(['text'])
  })

  test('accepts a bare list', () => {
    expect(readModels([{ id: 'a/b' }]).map((model) => model.id)).toEqual(['a/b'])
  })

  test('returns nothing for junk instead of throwing', () => {
    expect(readModels(null)).toEqual([])
    expect(readModels('broken')).toEqual([])
    expect(readModels({ data: 'no' })).toEqual([])
  })

  test('clamps an output larger than the window', () => {
    const [model] = readModels([{ id: 'x/y', context_length: 1000, top_provider: { max_completion_tokens: 9000 } }])
    expect(model?.maxTokens).toBe(1000)
  })

  test('keeps a genuinely small output budget', () => {
    const [model] = readModels([{ id: 'x/y', context_length: 8000, top_provider: { max_completion_tokens: 4096 } }])
    expect(model?.maxTokens).toBe(4096)
  })

  test('drops an output budget at the adapter default', () => {
    const [model] = readModels([{ id: 'x/y', context_length: 262144, top_provider: { max_completion_tokens: 32768 } }])
    expect(model?.maxTokens).toBeUndefined()
  })
})

describe('merging managed and live models', () => {
  const managed = [
    { id: 'a/known', name: 'Adapter display name', inputModalities: ['text', 'image'] },
    { id: 'a/also', name: 'Second' },
  ]
  const live = [
    { id: 'a/known', name: 'Provider name', contextWindow: 1000, maxTokens: 100 },
    { id: 'a/new', name: 'Brand new', contextWindow: 2000, maxTokens: 200 },
  ]

  test('the adapter keeps its name, the provider supplies capacities', () => {
    const merged = mergeModels(managed, live)
    expect(merged[0]).toEqual({
      id: 'a/known',
      name: 'Adapter display name',
      contextWindow: 1000,
      maxTokens: 100,
      input: ['text', 'image'],
    })
  })

  test('new models are appended, not inserted', () => {
    expect(mergeModels(managed, live).map((model) => model.id)).toEqual(['a/known', 'a/also', 'a/new'])
  })

  test('an empty managed list leaves the provider catalog', () => {
    expect(mergeModels([], live).map((model) => model.id)).toEqual(['a/known', 'a/new'])
  })

  test('duplicate ids appear once', () => {
    const merged = mergeModels([{ id: 'a/b', name: 'B' }], [
      { id: 'a/b', name: 'B2' },
      { id: 'a/b', name: 'B3' },
    ])
    expect(merged).toHaveLength(1)
  })
})

describe('the llm-pi-ai profile', () => {
  test('names credential reference, protocol, base url and models', () => {
    const rule = providerRule('openrouter')
    const family = familyFor('openrouter')
    if (rule === undefined || family === undefined) throw new Error('openrouter missing')
    const profile = profileFor(rule, family, [{ id: 'x/y', name: 'X' }])
    expect(profile['apiKeyEnv']).toBe('OPENROUTER_API_KEY')
    expect(profile['api']).toBe('openai-completions')
    expect(profile['baseURL']).toBe('https://openrouter.ai/api/v1')
    expect(profile['models']).toEqual([{ id: 'x/y', name: 'X' }])
  })

  test('anthropic gets the base without /v1 because the protocol appends it', () => {
    const rule = providerRule('anthropic')
    const family = familyFor('anthropic')
    if (rule === undefined || family === undefined) throw new Error('anthropic missing')
    expect(profileFor(rule, family, [])['baseURL']).toBe('https://api.anthropic.com')
    expect(rule.protocol).toBe('anthropic-messages')
  })

  test('the models url has no double slash', () => {
    const family = familyFor('opencode')
    if (family === undefined) throw new Error('opencode missing')
    expect(modelsUrl(family)).toBe('https://opencode.ai/zen/v1/models')
  })
})

describe('the provider rules', () => {
  test('every rule has a family in the directory', () => {
    for (const rule of PROVIDERS) expect(familyFor(rule.provider)).toBeDefined()
  })

  test('deepseek is known but not in the default', () => {
    expect(providerRule('deepseek')).toBeDefined()
    expect(DEFAULT_PROVIDERS).not.toContain('deepseek')
  })

  test('the default holds the routing providers', () => {
    expect([...DEFAULT_PROVIDERS].sort()).toEqual(
      ['anthropic', 'nous', 'opencode', 'openrouter', 'zai', 'zenmux'].sort(),
    )
  })

  test('every reference follows the <PROVIDER>_API_KEY convention', () => {
    for (const rule of PROVIDERS) {
      expect(rule.credentialRef).toBe(`${rule.provider.toUpperCase().replaceAll('-', '_')}_API_KEY`)
    }
  })
})
