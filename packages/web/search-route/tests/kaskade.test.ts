/**
 * Die Kette: gratis zuerst, dann Deckung, dann Rang — der knappe Vorrat wird geschont.
 */

import { describe, expect, test } from 'bun:test'

import { kaskade, leererZustand, proBedarf } from '../src/index.ts'
import type { Lage } from '../src/index.ts'

/** Alles erreichbar. */
const ALLE: Lage = { searxng: true, firecrawl: true, firecrawlCloud: true, deepseek: true }

/** Ein Zeitpunkt vor dem Stichtag. */
const VORHER = new Date('2026-10-21T20:00:00Z')

/** Ein Zeitpunkt nach dem Stichtag. */
const NACHHER = new Date('2026-11-05T12:00:00Z')

/** Reihenfolge der Wege einer Kette. */
const wege = (
  lage: Lage,
  bedarf: 'answer' | 'links' | 'extract' | 'render',
  jetzt = VORHER,
  zustand = leererZustand(),
  regel = { darfDegradieren: true },
): string[] => kaskade(bedarf, lage, zustand, jetzt, regel).schritte.map((schritt) => schritt.weg)

describe('Kette', () => {
  test('vor dem Stichtag: gratis Werkzeug zuerst, der knappe Vorrat zuletzt', () => {
    expect(wege(ALLE, 'links')).toEqual(['deepseek-server', 'searxng', 'firecrawl', 'firecrawl-cloud'])
  })

  test('nach dem Stichtag: lokale Wege zuerst, bezahlt zuletzt', () => {
    expect(wege(ALLE, 'links', NACHHER)).toEqual(['searxng', 'firecrawl', 'firecrawl-cloud', 'deepseek-server'])
  })

  test('erschöpfter Vorrat macht die Cloud teurer als das Werkzeug', () => {
    expect(wege(ALLE, 'links', NACHHER, { firecrawlCloudGenutzt: 500 })).toEqual([
      'searxng',
      'firecrawl',
      'deepseek-server',
      'firecrawl-cloud',
    ])
  })

  test('der bezahlte Schritt ist markiert und verlangt eine Rückfrage', () => {
    const kette = kaskade('links', ALLE, leererZustand(), NACHHER)
    expect(kette.bezahltAb).toBe(3)
    expect(kette.schritte[3]?.bezahlt).toBe(true)
    expect(kette.hinweis).toBeNull()
  })

  test('vor dem Stichtag ist nichts bezahlt', () => {
    const kette = kaskade('links', ALLE, leererZustand(), VORHER)
    expect(kette.bezahltAb).toBeNull()
    expect(kette.schritte.every((schritt) => !schritt.bezahlt)).toBe(true)
  })

  test('SearXNG ausgefallen: Firecrawl übernimmt', () => {
    expect(wege({ ...ALLE, searxng: false }, 'links')).toEqual([
      'deepseek-server',
      'firecrawl',
      'firecrawl-cloud',
    ])
  })

  test('nur noch der bezahlte Weg: die Kette beginnt mit der Rückfrage', () => {
    const kette = kaskade(
      'links',
      { searxng: false, firecrawl: false, firecrawlCloud: false, deepseek: true },
      leererZustand(),
      NACHHER,
    )
    expect(kette.bezahltAb).toBe(0)
    expect(kette.hinweis).toContain('lokale Dienste starten')
  })

  test('nichts erreichbar: leere Kette mit Hinweis', () => {
    const kette = kaskade(
      'links',
      { searxng: false, firecrawl: false, firecrawlCloud: false, deepseek: false },
      leererZustand(),
      VORHER,
    )
    expect(kette.schritte).toEqual([])
    expect(kette.hinweis).toBe('keine Quelle erreichbar')
  })

  test('answer ohne Degradierung: nur der Weg mit Antwort', () => {
    expect(wege(ALLE, 'answer', NACHHER, leererZustand(), { darfDegradieren: false })).toEqual([
      'deepseek-server',
    ])
  })

  test('extract: lokales Firecrawl vor der Cloud', () => {
    expect(wege(ALLE, 'extract')).toEqual(['firecrawl', 'firecrawl-cloud'])
  })

  test('proBedarf liefert eine Zeile je Bedarf', () => {
    expect(proBedarf(ALLE, leererZustand(), VORHER).map((zeile) => zeile.bedarf)).toEqual([
      'answer',
      'links',
      'extract',
      'render',
    ])
  })
})
