/**
 * Der Aufzeichner: buchen, preisen, ablesen — je Nutzer getrennt.
 *
 * Festgenagelt wird: **was gebucht ist, ist auch ablesbar**, **zwei Nutzer sehen ihre eigenen
 * Zahlen**, **ein fehlender Tarif bleibt sichtbar unbepreist** (nicht kostenlos), und **eine
 * Grenze meldet sich beim Ablesen** — sie sperrt nichts.
 */

import { describe, expect, test } from 'bun:test'

import { Verbrauchsspeicher } from '@prometheus-harness/usage-budget'
import type { Tarifeintrag } from '@prometheus-harness/tariffs'

import { Aufzeichner, type Aufruf } from '../src/index.ts'

const JETZT = new Date('2026-10-18T12:00:00.000Z')

/** Der Tarif, mit dem gerechnet wird: 0,15 / 0,60 USD je 1 Mio Token. */
const TARIFE: readonly Tarifeintrag[] = [{
  familie: 'deepseek-official',
  modell: 'deepseek-flash',
  preis: { hinein: 0.15, heraus: 0.6 },
  stand: '2026-10-15',
  quelle: 'Test',
  herkunft: 'tabelle',
}]

/** Ein Aufruf für Tests. */
const aufruf = (teil: Partial<Aufruf> = {}): Aufruf => ({
  nutzer: 'anna',
  familie: 'deepseek-official',
  modell: 'deepseek-flash',
  tokens: { inputTokens: 1_200, outputTokens: 300 },
  ...teil,
})

/** Ein Aufzeichner im Arbeitsspeicher. */
const aufzeichner = (tarife: readonly Tarifeintrag[] = TARIFE): Aufzeichner =>
  new Aufzeichner({ speicher: new Verbrauchsspeicher({ jetzt: () => JETZT }), tarife, jetzt: () => JETZT })

describe('Buchen', () => {
  test('ein Aufruf ergibt einen gepreisten Datensatz und liegt im Speicher', async () => {
    const zeichner = aufzeichner()
    const { zeile, aufnahme } = await zeichner.verbuchen(aufruf())
    // 1200 × 0,15 / 1e6 + 300 × 0,60 / 1e6 = 0,00018 + 0,00018
    expect(zeile.kosten).toBe(0.00036)
    expect(zeile.kostenart).toBe('kostenpflichtig')
    expect(zeile.tarifStand).toBe('2026-10-15')
    expect(aufnahme.aufgenommen).toBe(1)

    const konto = await zeichner.konto('anna')
    expect(konto.zeilen).toBe(1)
    expect(konto.uebersicht.kostenUsd).toBe(0.00036)
    expect(konto.stand.gesamt.kostenUsd).toBe(0.00036)
  })

  test('ohne Tarif bleibt der Aufruf unbepreist — sichtbar, nicht kostenlos', async () => {
    const zeichner = aufzeichner([])
    const { zeile } = await zeichner.verbuchen(aufruf())
    expect(zeile.kosten).toBeUndefined()
    expect(zeile.kostenart).toBe('unbekannt')
    const konto = await zeichner.konto('anna')
    expect(konto.uebersicht.kostenUsd).toBe(0)
    expect(konto.uebersicht.unbepreistProzent).toBe(100)
    expect(konto.stand.gesamt.unbepreist).toBe(1)
  })

  test('zwei Nutzer sehen ihre eigenen Zahlen', async () => {
    const zeichner = aufzeichner()
    await zeichner.verbuchen(aufruf({ nutzer: 'anna' }))
    await zeichner.verbuchen(aufruf({ nutzer: 'bernd', tokens: { inputTokens: 9_000, outputTokens: 1_000 } }))
    const anna = await zeichner.konto('anna')
    const bernd = await zeichner.konto('bernd')
    expect(anna.zeilen).toBe(1)
    expect(bernd.zeilen).toBe(1)
    expect(anna.uebersicht.token.hinein).toBe(1_200)
    expect(bernd.uebersicht.token.hinein).toBe(9_000)
  })
})

describe('Ablesen', () => {
  test('das Zeitfenster schneidet ältere Aufrufe ab', async () => {
    const zeichner = aufzeichner()
    await zeichner.verbuchen(aufruf({ zeit: '2026-10-01T12:00:00.000Z' }))
    await zeichner.verbuchen(aufruf({ zeit: '2026-10-18T09:00:00.000Z' }))
    const alle = await zeichner.konto('anna')
    const woche = await zeichner.konto('anna', { tage: 7 })
    expect(alle.zeilen).toBe(2)
    expect(woche.zeilen).toBe(1)
  })

  test('eine Grenze meldet sich beim Ablesen — sie sperrt nichts', async () => {
    const zeichner = aufzeichner()
    await zeichner.verbuchen(aufruf({ tokens: { inputTokens: 10_000_000, outputTokens: 0 } }))
    const konto = await zeichner.konto('anna', { budget: { warnProzent: 80, schluessel: {}, modelle: {}, gesamtUsd: 1 } })
    // 10 000 000 × 0,15 / 1e6 = 1,50 USD — über der Grenze von 1,00
    expect(konto.stand.gesamt.kostenUsd).toBe(1.5)
    expect(konto.stand.gesamt.warnung).toBe('ueberschritten')
    // ... und der nächste Aufruf geht trotzdem durch: das Paket sperrt nicht.
    await expect(zeichner.verbuchen(aufruf())).resolves.toBeDefined()
  })

  test('je Schlüssel und je Modell wird getrennt ausgewiesen', async () => {
    const zeichner = aufzeichner()
    await zeichner.verbuchen(aufruf())
    await zeichner.verbuchen(aufruf({ familie: 'openrouter', modell: 'google/gemini-3.8-flash' }))
    const konto = await zeichner.konto('anna')
    expect(konto.stand.schluessel.map((posten) => posten.name).sort()).toEqual(['DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY'])
    expect(konto.stand.modelle).toHaveLength(2)
  })

  test('der Preisstand ist ablesbar und mit der Buchung identisch', async () => {
    const zeichner = aufzeichner()
    expect(zeichner.preisstand).toHaveLength(1)
    expect(zeichner.preisstand[0]?.familie).toBe('deepseek-official')
  })

  test('ein leeres Konto ist keine leere Anzeige, sondern eine Null mit Grund', async () => {
    const zeichner = aufzeichner()
    const konto = await zeichner.konto('unbekannt')
    expect(konto.zeilen).toBe(0)
    expect(konto.uebersicht).toEqual({
      kostenUsd: 0,
      anfragen: 0,
      token: { hinein: 0, heraus: 0 },
      unbepreistProzent: 0,
      jeSchluessel: [],
      jeModell: [],
      jeTag: [],
    })
  })
})
