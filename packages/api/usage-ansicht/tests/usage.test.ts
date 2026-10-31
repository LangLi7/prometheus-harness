/**
 * Die Prüfungen zu Verbrauch und Schätzung — **ohne Netz**.
 *
 * Was hier zählt: die Antwort des Anbieters wird richtig gelesen (fehlende Felder fehlen), die
 * Schätzung nennt ihre Grundlage, und wo kein Anker ist, gibt es **keine** Zahl.
 *
 * @module @prometheus-harness/usage-ansicht/tests/usage
 */

import { describe, expect, test } from 'bun:test'

import { alsText, liesVerbrauch, schaetzeBildkosten } from '../src/index.ts'

describe('Verbrauch lesen', () => {
  test('die fünf Felder werden gelesen', () => {
    const verbrauch = liesVerbrauch({
      data: { usage: 0.4185, usage_daily: 0.0388, limit: 5, limit_remaining: 4.5815 },
    })
    expect(verbrauch).toEqual({
      verbrauchtUsd: 0.4185,
      heuteUsd: 0.0388,
      limitUsd: 5,
      restUsd: 4.5815,
    })
  })

  test('fehlende Felder werden NICHT zu 0 — sie fehlen', () => {
    const verbrauch = liesVerbrauch({ data: { usage: 1 } })
    expect(verbrauch.verbrauchtUsd).toBe(1)
    expect(verbrauch.heuteUsd).toBeUndefined()
    expect(verbrauch.limitUsd).toBeUndefined()
  })

  test('eine Antwort ohne `data` ergibt einen leeren Verbrauch — keinen falschen', () => {
    expect(liesVerbrauch({})).toEqual({})
    expect(liesVerbrauch(null)).toEqual({})
    expect(liesVerbrauch('kaputt')).toEqual({})
  })

  test('Text auf deutsch nennt alle vier Zeilen', () => {
    const text = alsText({ verbrauchtUsd: 0.4185, heuteUsd: 0.0388, limitUsd: 5, restUsd: 4.5815 }, 'de')
    expect(text).toContain('Verbraucht: 0.4185 USD')
    expect(text).toContain('Rest: 4.5815 USD')
  })

  test('Text auf englisch ebenso', () => {
    const text = alsText({ verbrauchtUsd: 1 }, 'en')
    expect(text).toContain('Spent: 1.0000 USD')
    expect(text).toContain('Remaining: —')
  })
})

describe('Kosten schätzen', () => {
  test('das gemessene Modell hat einen Anker — und die Schätzung nennt ihn', () => {
    const schaetzung = schaetzeBildkosten('google/gemini-2.5-flash-image')
    expect(schaetzung.usd).toBeCloseTo(0.0387, 4)
    expect(schaetzung.grund).toContain('gemessen')
    expect(schaetzung.grund).toContain('Schätzung')
  })

  test('zwei Bilder kosten das Doppelte', () => {
    const eins = schaetzeBildkosten('google/gemini-2.5-flash-image')
    const zwei = schaetzeBildkosten('google/gemini-2.5-flash-image', { anzahl: 2 })
    expect(zwei.usd).toBeCloseTo((eins.usd ?? 0) * 2, 4)
  })

  test('2K skaliert über die Pixelzahl', () => {
    const eins = schaetzeBildkosten('google/gemini-2.5-flash-image')
    const gross = schaetzeBildkosten('google/gemini-2.5-flash-image', { aufloesung: '2K' })
    // 2048² gegen 1344×768 — rund das Vierfache.
    expect(gross.usd ?? 0).toBeGreaterThan((eins.usd ?? 0) * 3)
  })

  test('ohne Anker gibt es KEINE Zahl — nur den Grund', () => {
    const schaetzung = schaetzeBildkosten('irgendein/modell')
    expect(schaetzung.usd).toBeUndefined()
    expect(schaetzung.grund).toContain('kein Preis gemessen')
  })
})
