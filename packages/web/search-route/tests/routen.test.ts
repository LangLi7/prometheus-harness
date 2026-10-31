/**
 * Die Wege und ihre Preise: lokal kostet nichts, der Vorrat ist knapp, der Stichtag bewegt einen Preis.
 */

import { describe, expect, test } from 'bun:test'

import {
  PREIS_FIRECRAWL_CLOUD_USD,
  STICHTAG,
  WEGE,
  leererZustand,
  wegNach,
} from '../src/index.ts'

/** Ein Zeitpunkt vor dem Stichtag. */
const VORHER = new Date('2026-10-21T20:00:00Z')

/** Ein Zeitpunkt nach dem Stichtag. */
const NACHHER = new Date('2026-11-05T12:00:00Z')

describe('Wege', () => {
  test('SearXNG kostet nichts, zu jedem Zeitpunkt', () => {
    expect(wegNach('searxng').kosten(leererZustand(), VORHER)).toBe(0)
    expect(wegNach('searxng').kosten(leererZustand(), NACHHER)).toBe(0)
  })

  test('das lokale Firecrawl kostet nichts, auch nach dem Stichtag', () => {
    expect(wegNach('firecrawl').kosten(leererZustand(), VORHER)).toBe(0)
    expect(wegNach('firecrawl').kosten(leererZustand(), NACHHER)).toBe(0)
  })

  test('das Cloud-Firecrawl ist im Freikontingent gratis und danach bezahlt', () => {
    expect(wegNach('firecrawl-cloud').kosten(leererZustand(), VORHER)).toBe(0)
    expect(wegNach('firecrawl-cloud').kosten({ firecrawlCloudGenutzt: 500 }, VORHER)).toBe(
      PREIS_FIRECRAWL_CLOUD_USD,
    )
  })

  test('das DeepSeek-Werkzeug ist bis zum Stichtag gratis und danach bezahlt', () => {
    expect(wegNach('deepseek-server').kosten(leererZustand(), VORHER)).toBe(0)
    expect(wegNach('deepseek-server').kosten(leererZustand(), NACHHER)).toBe(0.00075)
  })

  test('Browser-Use hat keinen Preis je Suche', () => {
    expect(Number.isNaN(wegNach('browser').kosten(leererZustand(), VORHER))).toBe(true)
  })

  test('die Wege decken, was sie versprechen', () => {
    expect(wegNach('searxng').deckt).toEqual(['links'])
    expect(wegNach('deepseek-server').deckt).toEqual(['answer', 'links'])
    expect(wegNach('firecrawl').deckt).toEqual(['links', 'extract'])
    expect(wegNach('firecrawl-cloud').deckt).toEqual(['links', 'extract'])
    expect(wegNach('browser').deckt).toEqual(['render'])
  })

  test('alle fünf Wege sind vorhanden', () => {
    expect(WEGE.map((weg) => weg.id)).toEqual([
      'searxng',
      'deepseek-server',
      'firecrawl',
      'firecrawl-cloud',
      'browser',
    ])
  })

  test('der Stichtag ist 2026-10-31T16:00:00Z', () => {
    expect(STICHTAG.toISOString()).toBe('2026-10-31T16:00:00.000Z')
  })
})
