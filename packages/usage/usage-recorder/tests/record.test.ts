/**
 * Zuordnung und Verbrauch: Route → Schlüsselname, Zählart → Herkunft, Aufruf → Datensatz.
 *
 * Festgenagelt wird: **kein erfundener Schlüsselname** (ohne Treffer ist die Route die Kennung),
 * **eine Schätzung bleibt eine Schätzung** (sie wird nicht „gemessen" genannt), und **ein Aufruf
 * ohne Nutzer oder Modell wird abgewiesen**.
 */

import { describe, expect, test } from 'bun:test'

import { herkunftAus, schluesselFuerRoute, verbuche, type Aufruf } from '../src/index.ts'

const JETZT = new Date('2026-10-18T12:00:00.000Z')

/** Ein Aufruf für Tests. */
const aufruf = (teil: Partial<Aufruf> = {}): Aufruf => ({
  nutzer: 'anna',
  familie: 'deepseek-official',
  modell: 'deepseek-flash',
  tokens: { inputTokens: 1_200, outputTokens: 300 },
  ...teil,
})

describe('Schlüsselname je Route', () => {
  test('die gemessenen Routen tragen ihren Namen', () => {
    expect(schluesselFuerRoute('deepseek-official')).toBe('DEEPSEEK_API_KEY')
    expect(schluesselFuerRoute('openrouter')).toBe('OPENROUTER_API_KEY')
    expect(schluesselFuerRoute('anthropic')).toBe('ANTHROPIC_API_KEY')
    expect(schluesselFuerRoute('crew')).toBe('DEEPSEEK_API_KEY')
  })

  test('die Suche ist unabhängig von der Schreibweise', () => {
    expect(schluesselFuerRoute('OpenRouter')).toBe('OPENROUTER_API_KEY')
    expect(schluesselFuerRoute('DEEPSEEK-OFFICIAL')).toBe('DEEPSEEK_API_KEY')
  })

  test('eine Unterroute findet ihren Namen über den Präfix', () => {
    expect(schluesselFuerRoute('deepseek-account')).toBe('DEEPSEEK_API_KEY')
    expect(schluesselFuerRoute('openrouter-v2')).toBe('OPENROUTER_API_KEY')
  })

  test('ohne Treffer ist die Route selbst die Kennung — kein erfundener Name', () => {
    expect(schluesselFuerRoute('mein-anbieter')).toBe('mein-anbieter')
    expect(schluesselFuerRoute('  ')).toBe('UNBEKANNT')
  })
})

describe('Zählart', () => {
  test('reported heißt gemessen, estimated heißt geschaetzt, mixed heißt gemischt', () => {
    expect(herkunftAus('reported')).toBe('gemessen')
    expect(herkunftAus('estimated')).toBe('geschaetzt')
    expect(herkunftAus('mixed')).toBe('gemischt')
  })
})

describe('Aufruf zum Verbrauch', () => {
  test('die Felder kommen an, der Schlüssel wird zugeordnet, die Zeit gesetzt', () => {
    const verbrauch = verbuche(aufruf(), () => JETZT)
    expect(verbrauch).toEqual({
      zeit: JETZT.toISOString(),
      nutzer: 'anna',
      schluessel: 'DEEPSEEK_API_KEY',
      familie: 'deepseek-official',
      modell: 'deepseek-flash',
      hinein: 1_200,
      heraus: 300,
      herkunft: 'gemessen',
    })
  })

  test('Cache-Token, Zweck und eine ausdrückliche Zeit kommen mit', () => {
    const verbrauch = verbuche(
      aufruf({
        tokens: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 7 },
        zweck: 'verdichtung',
        zeit: '2026-10-17T08:00:00.000Z',
        schluessel: 'EIGENER_NAME',
      }),
      () => JETZT,
    )
    expect(verbrauch.cacheGelesen).toBe(5)
    expect(verbrauch.cacheGeschrieben).toBe(7)
    expect(verbrauch.zweck).toBe('verdichtung')
    expect(verbrauch.zeit).toBe('2026-10-17T08:00:00.000Z')
    expect(verbrauch.schluessel).toBe('EIGENER_NAME')
  })

  test('eine geschätzte Zahl wird geschaetzt genannt, nicht gemessen', () => {
    expect(verbuche(aufruf({ zaehlung: 'estimated' }), () => JETZT).herkunft).toBe('geschaetzt')
  })

  test('ein Aufruf ohne Nutzer oder Modell wird abgewiesen', () => {
    expect(() => verbuche(aufruf({ nutzer: '  ' }))).toThrow(/ohne Nutzer/)
    expect(() => verbuche(aufruf({ modell: '' }))).toThrow(/ohne Modell/)
  })

  test('unbrauchbare Token-Zahlen werden abgewiesen statt verbucht', () => {
    expect(() => verbuche(aufruf({ tokens: { inputTokens: Number.NaN, outputTokens: 0 } }))).toThrow(/Token/)
    expect(() => verbuche(aufruf({ tokens: { inputTokens: -1, outputTokens: 0 } }))).toThrow(/Token/)
    expect(() =>
      verbuche(aufruf({ tokens: { inputTokens: 1, outputTokens: 1, cacheReadTokens: -2 } }))).toThrow(/cacheReadTokens/)
    expect(() =>
      verbuche(aufruf({ tokens: { inputTokens: 1, outputTokens: 1, cacheWriteTokens: Number.NaN } }))).toThrow(/cacheWriteTokens/)
  })
})
