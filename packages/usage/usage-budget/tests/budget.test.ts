/**
 * Grenzen, Warnschwellen, Zeitfenster und die Zusammenfassung.
 *
 * Festgenagelt wird: **eine Grenze meldet, sie blockiert nicht** (es gibt keine Sperre in diesem
 * Paket), **die Warnschwelle gilt je Posten** (80 Prozent von 5 USD ist etwas anderes als von
 * 500), und **die Zusammenfassung nennt den Anteil unbepreister Aufrufe** statt ihn zu verschweigen.
 */

import { describe, expect, test } from 'bun:test'

import {
  STANDARDBUDGET,
  budgetstand,
  zusammenfassung,
  warnungFuer,
  zeitfenster,
  type Budget,
  type Kostenzeile,
} from '../src/index.ts'

/** Der gemeinsame Rumpf einer Zeile — ohne `kosten`, damit „unbekannt" nicht als `undefined` nötig ist. */
const rumpf = (teil: Partial<Omit<Kostenzeile, 'kosten'>> = {}): Omit<Kostenzeile, 'kosten'> => ({
  zeit: '2026-10-18T12:00:00.000Z',
  nutzer: 'benutzer-1',
  schluessel: 'DEEPSEEK_API_KEY',
  familie: 'deepseek-official',
  modell: 'deepseek-flash',
  hinein: 1_000,
  heraus: 500,
  herkunft: 'gemessen',
  kostenart: 'kostenpflichtig',
  ...teil,
})

/** Eine Zeile **mit** bekannten Kosten (Vorgabe 1 USD). */
const zeile = (teil: Partial<Omit<Kostenzeile, 'kosten'>> = {}, betrag = 1): Kostenzeile => ({ ...rumpf(teil), kosten: betrag })

/** Eine Zeile **ohne** bekannten Preis — die Kosten fehlen, statt null zu sein. */
const unbepreistZeile = (teil: Partial<Omit<Kostenzeile, 'kosten'>> = {}): Kostenzeile =>
  rumpf({ ...teil, kostenart: 'unbekannt' })

describe('Warnschwellen', () => {
  test('ohne Grenze gibt es keine Meldung', () => {
    expect(warnungFuer(50, undefined, 80)).toBe('keine')
    expect(warnungFuer(50, 0, 80)).toBe('keine')
  })

  test('über der Grenze heißt überschritten, darüber warnschwelle, darunter keine', () => {
    expect(warnungFuer(100, 100, 80)).toBe('ueberschritten')
    expect(warnungFuer(120, 100, 80)).toBe('ueberschritten')
    expect(warnungFuer(80, 100, 80)).toBe('warnschwelle')
    expect(warnungFuer(79.9, 100, 80)).toBe('keine')
  })
})

describe('Budgetstand', () => {
  test('ohne Grenzen bleibt alles ohne Meldung — auch mit Kosten', () => {
    const stand = budgetstand([zeile(), zeile()], STANDARDBUDGET)
    expect(stand.gesamt.kostenUsd).toBe(2)
    expect(stand.gesamt.warnung).toBe('keine')
    expect(stand.gesamt.prozent).toBeUndefined()
  })

  test('die Gesamtgrenze zählt alle Aufrufe, und die Meldung nennt den Anteil', () => {
    const stand = budgetstand([zeile(), zeile()], { ...STANDARDBUDGET, gesamtUsd: 4 })
    expect(stand.gesamt.kostenUsd).toBe(2)
    expect(stand.gesamt.limitUsd).toBe(4)
    expect(stand.gesamt.prozent).toBe(50)
    expect(stand.gesamt.warnung).toBe('keine')
  })

  test('je Schlüssel und je Modell getrennt, mit eigener Warnschwelle', () => {
    const budget: Budget = {
      warnProzent: 80,
      schluessel: { OPENROUTER_API_KEY: { limitUsd: 1, warnProzent: 50 } },
      modelle: {},
    }
    const stand = budgetstand(
      [
        zeile({ schluessel: 'OPENROUTER_API_KEY', familie: 'openrouter', modell: 'google/gemini-3.8-flash' }, 0.75),
        zeile({}, 0.5),
      ],
      budget,
    )
    const offen = stand.schluessel.find((posten) => posten.name === 'OPENROUTER_API_KEY')
    expect(offen?.kostenUsd).toBe(0.75)
    expect(offen?.prozent).toBe(75)
    // 75 Prozent liegt über der Schwelle 50, aber unter der Grenze 100
    expect(offen?.warnung).toBe('warnschwelle')
    expect(stand.schluessel[0]?.name).toBe('OPENROUTER_API_KEY')
    expect(stand.modelle.map((posten) => posten.name).sort()).toEqual([
      'deepseek-official/deepseek-flash',
      'openrouter/google/gemini-3.8-flash',
    ])
  })

  test('eine Modellgrenze gilt für den vollen Namen und für den kurzen', () => {
    const voll: Budget = { warnProzent: 80, schluessel: {}, modelle: { 'deepseek-official/deepseek-flash': { limitUsd: 1 } } }
    expect(budgetstand([zeile({}, 1.2)], voll).modelle[0]?.warnung).toBe('ueberschritten')
    // 1,20 von 2,00 sind 60 Prozent — unter der Warnschwelle 80. Der kurze Name muß trotzdem greifen:
    const kurz: Budget = { warnProzent: 80, schluessel: {}, modelle: { 'deepseek-flash': { limitUsd: 2 } } }
    const knapp = budgetstand([zeile({}, 1.2)], kurz).modelle[0]
    expect(knapp?.limitUsd).toBe(2)
    expect(knapp?.prozent).toBe(60)
    expect(knapp?.warnung).toBe('keine')
    expect(budgetstand([zeile({}, 1.8)], kurz).modelle[0]?.warnung).toBe('warnschwelle')
  })

  test('unbepreiste Aufrufe werden gezählt und nicht als null verbucht', () => {
    const stand = budgetstand(
      [zeile(), unbepreistZeile()],
      { ...STANDARDBUDGET, gesamtUsd: 10 },
    )
    expect(stand.gesamt.kostenUsd).toBe(1)
    expect(stand.gesamt.unbepreist).toBe(1)
    expect(stand.gesamt.anfragen).toBe(2)
  })

  test('eine leere Liste ergibt einen leeren, aber vollständigen Stand', () => {
    const stand = budgetstand([], STANDARDBUDGET)
    expect(stand.gesamt).toEqual({ name: 'gesamt', kostenUsd: 0, anfragen: 0, unbepreist: 0, warnung: 'keine' })
    expect(stand.schluessel).toEqual([])
    expect(stand.modelle).toEqual([])
  })
})

describe('Zeitfenster', () => {
  const jetzt = new Date('2026-10-18T12:00:00.000Z')

  test('ältere Zeilen fallen heraus, neuere bleiben', () => {
    const zeilen = [
      zeile({ zeit: '2026-10-01T12:00:00.000Z' }),
      zeile({ zeit: '2026-10-17T12:00:00.000Z' }),
    ]
    expect(zeitfenster(zeilen, { tage: 7, jetzt })).toHaveLength(1)
    expect(zeitfenster(zeilen, { tage: 30, jetzt })).toHaveLength(2)
  })

  test('eine unsinnige Tageszahl wird abgewiesen', () => {
    expect(() => zeitfenster([], { tage: -1, jetzt })).toThrow(/Tage/)
    expect(() => zeitfenster([], { tage: Number.NaN, jetzt })).toThrow(/Tage/)
  })

  test('eine Zeile mit kaputter Zeit fällt heraus statt zu zählen', () => {
    expect(zeitfenster([zeile({ zeit: 'gestern' })], { tage: 30, jetzt })).toEqual([])
  })
})

describe('Zusammenfassung', () => {
  test('Kosten, Anfragen, Token und Anteil unbepreister Aufrufe', () => {
    const kurz = zusammenfassung([
      zeile({ hinein: 1_000, heraus: 500, cacheGelesen: 100 }),
      unbepreistZeile({ modell: 'unbekannt', hinein: 2_000, heraus: 0 }),
    ])
    expect(kurz.kostenUsd).toBe(1)
    expect(kurz.anfragen).toBe(2)
    expect(kurz.token).toEqual({ hinein: 3_100, heraus: 500 })
    expect(kurz.unbepreistProzent).toBe(50)
  })

  test('je Schlüssel und je Modell absteigend nach Kosten, je Tag aufsteigend', () => {
    const kurz = zusammenfassung([
      zeile({ schluessel: 'DEEPSEEK_API_KEY', zeit: '2026-10-18T09:00:00.000Z' }, 0.5),
      zeile({ schluessel: 'OPENROUTER_API_KEY', familie: 'openrouter', modell: 'google/gemini-3.8-flash', zeit: '2026-10-17T09:00:00.000Z' }, 2),
    ])
    expect(kurz.jeSchluessel.map((posten) => posten.schluessel)).toEqual(['OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY'])
    expect(kurz.jeModell[0]?.modell).toBe('google/gemini-3.8-flash')
    expect(kurz.jeTag.map((tag) => tag.tag)).toEqual(['2026-10-17', '2026-10-18'])
  })

  test('eine leere Liste ergibt Nullen, nicht NaN', () => {
    const kurz = zusammenfassung([])
    expect(kurz).toEqual({
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
