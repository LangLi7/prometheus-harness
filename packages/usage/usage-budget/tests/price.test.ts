/**
 * Die Preisrechnung: Token × Tarif — und die drei Fälle, die auseinanderbleiben müssen.
 *
 * Festgenagelt wird: **ein unbekannter Preis ergibt keine Kosten** (nicht null), **ein Preis von
 * null ist kostenlos** (und nicht unbekannt), und **Cache-Token werden zum Hinein-Preis
 * gerechnet** — als Obergrenze, weil die Tarife nur zwei Preise kennen.
 */

import { describe, expect, test } from 'bun:test'

import type { Tarifeintrag } from '@prometheus-harness/tariffs'

import { aufCent, preiseAlle, preiseAufruf, summe, zuKostenzeile } from '../src/index.ts'
import type { Verbrauch } from '../src/index.ts'

/** Ein Tarif, wie ihn `tariffs` liefert. */
const tarif = (modell: string, hinein: number, heraus: number): Tarifeintrag => ({
  familie: 'deepseek-official',
  modell,
  preis: { hinein, heraus },
  stand: '2026-10-15',
  quelle: 'Test',
  herkunft: 'tabelle',
})

/** Ein Aufruf. */
const aufruf = (teil: Partial<Verbrauch> = {}): Verbrauch => ({
  zeit: '2026-10-18T12:00:00.000Z',
  nutzer: 'benutzer-1',
  schluessel: 'DEEPSEEK_API_KEY',
  familie: 'deepseek-official',
  modell: 'deepseek-flash',
  hinein: 1_000,
  heraus: 500,
  herkunft: 'gemessen',
  ...teil,
})

describe('Preis rechnen', () => {
  test('1000 hinein und 500 heraus bei 0,15 / 0,60 ergeben 0,00045 USD', () => {
    const auskunft = preiseAufruf([tarif('deepseek-flash', 0.15, 0.6)], aufruf())
    expect(auskunft.kosten).toBe(0.00045)
    expect(auskunft.kostenart).toBe('kostenpflichtig')
  })

  test('Zwischenspeicher-Token werden dem Hinein-Preis zugeschlagen', () => {
    const ohne = preiseAufruf([tarif('deepseek-flash', 0.15, 0.6)], aufruf())
    const mit = preiseAufruf(
      [tarif('deepseek-flash', 0.15, 0.6)],
      aufruf({ cacheGelesen: 1_000, cacheGeschrieben: 500 }),
    )
    expect(ohne.kosten).toBe(0.00045)
    expect(mit.kosten).toBe(0.000675)
  })

  test('ohne Tarif gibt es keine Kosten — nicht null', () => {
    const auskunft = preiseAufruf([], aufruf())
    expect(auskunft.kosten).toBeUndefined()
    expect(auskunft.kostenart).toBe('unbekannt')
    expect(auskunft.beleg).toContain('kein Tarif')
  })

  test('ein Tarif ohne Preis ist ebenfalls unbekannt, nennt aber seinen Stand', () => {
    const ohnePreis: Tarifeintrag = {
      familie: 'deepseek-official',
      modell: 'deepseek-flash',
      preis: { hinein: -1, heraus: -1 },
      stand: '2026-10-15',
      quelle: 'gemessen: kein Preisfeld',
      herkunft: 'gemessen',
    }
    const auskunft = preiseAufruf([ohnePreis], aufruf())
    expect(auskunft.kosten).toBeUndefined()
    expect(auskunft.kostenart).toBe('unbekannt')
    expect(auskunft.tarifStand).toBe('2026-10-15')
    expect(auskunft.beleg).toContain('unbekannt, nicht null')
  })

  test('ein Tarif mit Preis null ist kostenlos — eine Aussage, kein Fehlen', () => {
    const auskunft = preiseAufruf([tarif('deepseek-flash', 0, 0)], aufruf())
    expect(auskunft.kosten).toBe(0)
    expect(auskunft.kostenart).toBe('kostenlos')
  })

  test('die Suche prüft die Familie mit', () => {
    const fremd: Tarifeintrag = { ...tarif('deepseek-flash', 1, 1), familie: 'openrouter' }
    expect(preiseAufruf([fremd], aufruf()).kosten).toBeUndefined()
  })

  test('Beträge werden gerundet, damit sich kein Rechenrest summiert', () => {
    expect(aufCent(0.0006599999999999999)).toBe(0.00066)
    expect(aufCent(0)).toBe(0)
  })
})

describe('Zeilen und Summen', () => {
  test('eine Kostenzeile übernimmt den Aufruf und trägt Kosten und Kostenart', () => {
    const zeile = zuKostenzeile([tarif('deepseek-flash', 0.15, 0.6)], aufruf())
    expect(zeile.kosten).toBe(0.00045)
    expect(zeile.kostenart).toBe('kostenpflichtig')
    expect(zeile.tarifStand).toBe('2026-10-15')
    expect(zeile.nutzer).toBe('benutzer-1')
  })

  test('die Summe trennt bekannte Kosten von unbepreisten Aufrufen', () => {
    const zeilen = preiseAlle([tarif('deepseek-flash', 0.15, 0.6)], [
      aufruf(),
      aufruf({ modell: 'unbekanntes-modell' }),
    ])
    expect(summe(zeilen)).toEqual({ kostenUsd: 0.00045, unbepreist: 1 })
  })

  test('eine leere Liste ergibt null Kosten und keinen unbepreisten Aufruf', () => {
    expect(summe([])).toEqual({ kostenUsd: 0, unbepreist: 0 })
  })
})
