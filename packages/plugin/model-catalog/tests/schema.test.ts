/**
 * Das Profil gegen das **echte** Schema des Hosts.
 *
 * **Warum diese Prüfung die wichtigste ist.** Geschrieben wird in `llm-pi-ai.providers.<id>` — ein
 * Objekt, dessen Form nicht dieses Plugin erfindet, sondern der Adapter. Ein Profil, das der
 * Adapter ablehnt, wäre im Betrieb ein „nicht geschrieben" mit einer Fehlermeldung, die niemand
 * liest. Deshalb wird hier gegen das **ausgelieferte** `Config`-Schema von
 * `@deepseek-ai/dsh-llm-pi-ai` geprüft, nicht gegen eine Nachbildung.
 *
 * **Die Gegenprobe gehört dazu.** Ein Schema, das alles annimmt, beweist nichts — deshalb werden
 * drei kaputte Profile geprüft, die abgelehnt werden **müssen**.
 *
 * @module @prometheus-harness/model-catalog/tests/schema
 */

import { describe, expect, test } from 'bun:test'

import { familyFor, profileFor, providerRule } from '../src/catalog.ts'

/**
 * Das Config-Schema des Adapters.
 *
 * **Warum dynamisch geladen.** Das Paket gehört dem Host, nicht diesem Plugin; eine feste
 * Abhängigkeit würde eine Fassung einklemmen, die der Host selbst wählt. Fehlt es, wird die
 * Prüfung **rot** statt still übersprungen.
 */
const adapter = (await import('@deepseek-ai/dsh-llm-pi-ai').catch(() => undefined)) as
  | { Config?: (input: unknown) => unknown }
  | undefined

/** Prüft eine Eingabe gegen das Schema und gibt den Fehler oder `undefined` zurück. */
function rejectionOf(input: unknown): string | undefined {
  const Config = adapter?.Config
  if (typeof Config !== 'function') throw new Error('@deepseek-ai/dsh-llm-pi-ai exports no Config schema')
  try {
    Config(input)
    return undefined
  } catch (problem) {
    return problem instanceof Error ? problem.message : String(problem)
  }
}

/** Das Profil, das dieses Plugin für OpenRouter schreibt — mit einem echten Modell. */
function openrouterProfile(): Record<string, unknown> {
  const rule = providerRule('openrouter')
  const family = familyFor('openrouter')
  if (rule === undefined || family === undefined) throw new Error('openrouter missing')
  return profileFor(rule, family, [
    {
      id: 'recursive/flint-v1.0:free',
      name: 'Recursive: Flint (free)',
      contextWindow: 262144,
      maxTokens: 235929,
      input: ['text'],
    },
  ])
}

describe('das Schema des Adapters', () => {
  test('ist geladen', () => {
    expect(typeof adapter?.Config).toBe('function')
  })

  test('nimmt das OpenRouter-Profil an', () => {
    expect(rejectionOf({ providers: { openrouter: openrouterProfile() } })).toBeUndefined()
  })

  test('nimmt auch einen Anbieter an, den pi-ai selbst nicht beschreibt', () => {
    // ZenMux und Nous stehen nicht im Paketkatalog — die Route braucht deshalb `api` und `baseURL`
    // aus dem Profil. Genau das schreibt {@link profileFor}.
    const rule = providerRule('zenmux')
    const family = familyFor('zenmux')
    if (rule === undefined || family === undefined) throw new Error('zenmux missing')
    const profile = profileFor(rule, family, [{ id: 'vendor/model', name: 'Model' }])
    expect(rejectionOf({ providers: { zenmux: profile } })).toBeUndefined()
  })

  test('weist ein Modell ohne Kennung ab', () => {
    expect(rejectionOf({ providers: { openrouter: { models: [{ name: 'ohne id' }] } } })).toContain('id')
  })

  test('weist ein negatives Kontextfenster ab', () => {
    expect(rejectionOf({ providers: { openrouter: { models: [{ id: 'a/b', contextWindow: -1 }] } } })).toContain(
      'contextWindow',
    )
  })

  test('weist ein unbekanntes Protokoll ab', () => {
    expect(rejectionOf({ providers: { openrouter: { api: 'quatsch', models: [{ id: 'a/b' }] } } })).toContain('api')
  })
})
