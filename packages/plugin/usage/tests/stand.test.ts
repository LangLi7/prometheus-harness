/**
 * Die Auswertung der Verbrauchsdatei — ohne Host, ohne Netz, ohne Uhr.
 *
 * ## Was hier zählt
 *
 * Daß die Summen stimmen, daß ein unbepreister Datensatz **nicht** zu null wird, und daß die
 * Tagesreihe lückenlos ist. Die Zeitpunkte werden relativ zu einem festen `jetzt` gebaut, damit
 * der Test nicht davon abhängt, wann er läuft.
 *
 * @module @prometheus-harness/usage/tests/stand
 */

import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { ANZEIGE_MODELLE, VERLAUF_TAGE, kandidaten, liesStand } from '../src/stand.ts'

/** Der Bezugspunkt aller Prüfungen: 21.10.2026, 12:00 Ortszeit. */
const JETZT = new Date(2026, 9, 21, 12, 0, 0)

/**
 * Ein Zeitpunkt, `tage` vor dem Bezugstag.
 *
 * @param tage - wie viele Tage zurück
 * @param stunde - die Stunde des Tages
 * @returns der Zeitpunkt in Millisekunden
 */
function zeit(tage: number, stunde = 9): number {
  return new Date(2026, 9, 21 - tage, stunde, 0, 0).getTime()
}

/**
 * Ein Rohbestand mit diesen Datensätzen.
 *
 * @param records - die Datensätze
 * @param balances - die Guthaben
 * @returns der Rohbestand
 */
function roh(records: unknown[], balances: Record<string, unknown> = {}): unknown {
  return { version: 1, balances, balanceFetchedAt: JETZT.getTime(), records }
}

/** Ein bezahlter Datensatz. */
function satz(tage: number, kosten: number, modell = 'deepseek-flash', familie = 'deepseek-official'): unknown {
  return { time: zeit(tage), cost: kosten, provider: familie, model: modell, inputTokens: 10, outputTokens: 20 }
}

describe('Fenster', () => {
  test('heute, Woche, Monat und Gesamt zählen die richtigen Datensätze', () => {
    const stand = liesStand(
      roh([satz(0, 1), satz(1, 2), satz(10, 4), satz(100, 8)]),
      { datei: 'x.json', jetzt: JETZT },
    )
    expect(stand.fenster.tag.usd).toBeCloseTo(1, 6)
    expect(stand.fenster.woche.usd).toBeCloseTo(3, 6)
    expect(stand.fenster.monat.usd).toBeCloseTo(7, 6)
    expect(stand.fenster.gesamt.usd).toBeCloseTo(15, 6)
  })

  test('ein Datensatz ohne Preis zählt bei den Anfragen, nicht beim Geld', () => {
    const stand = liesStand(roh([satz(0, 1), { time: zeit(0), provider: 'p', model: 'm' }]), {
      datei: 'x.json',
      jetzt: JETZT,
    })
    expect(stand.fenster.tag.usd).toBeCloseTo(1, 6)
    expect(stand.fenster.tag.unbepreist).toBe(1)
    expect(stand.fenster.tag.anfragen).toBe(2)
  })

  test('ein Datensatz mit `requests` zählt als viele Anfragen', () => {
    const stand = liesStand(
      roh([{ time: zeit(0), cost: 3, provider: 'p', model: 'm', requests: 1364 }]),
      { datei: 'x.json', jetzt: JETZT },
    )
    expect(stand.fenster.gesamt.anfragen).toBe(1364)
  })

  test('Datensätze ohne brauchbare Zeit werden verworfen', () => {
    const stand = liesStand(
      roh([satz(0, 1), { time: 'gestern', cost: 99 }, { cost: 99 }, 'kaputt', null]),
      { datei: 'x.json', jetzt: JETZT },
    )
    expect(stand.fenster.gesamt.usd).toBeCloseTo(1, 6)
    expect(stand.fenster.gesamt.anfragen).toBe(1)
  })
})

describe('Tagesreihe', () => {
  test('sie ist lückenlos, aufsteigend und endet heute', () => {
    const stand = liesStand(roh([satz(0, 1), satz(3, 2)]), { datei: 'x.json', jetzt: JETZT })
    expect(stand.jeTag).toHaveLength(VERLAUF_TAGE)
    expect(stand.jeTag[0]?.tag).toBe('2026-09-22')
    expect(stand.jeTag[VERLAUF_TAGE - 1]?.tag).toBe('2026-10-21')
    expect(stand.jeTag[VERLAUF_TAGE - 1]?.usd).toBeCloseTo(1, 6)
    // Der Tag vor drei Tagen trägt die 2, der Tag dazwischen nichts — aber er ist da.
    expect(stand.jeTag[VERLAUF_TAGE - 4]?.usd).toBeCloseTo(2, 6)
    expect(stand.jeTag[VERLAUF_TAGE - 3]?.usd).toBe(0)
  })
})

describe('Modelle', () => {
  test('absteigend nach Kosten, gekappt auf die Anzeigezahl', () => {
    const records = Array.from({ length: ANZEIGE_MODELLE + 4 }, (_, i) => satz(0, i + 1, `modell-${String(i)}`))
    const stand = liesStand(roh(records), { datei: 'x.json', jetzt: JETZT })
    expect(stand.jeModell).toHaveLength(ANZEIGE_MODELLE)
    expect(stand.jeModell[0]?.modell).toBe(`modell-${String(ANZEIGE_MODELLE + 3)}`)
    expect(stand.jeModell[0]?.usd).toBeCloseTo(ANZEIGE_MODELLE + 4, 6)
  })

  test('dasselbe Modell aus zwei Familien bleibt getrennt', () => {
    const stand = liesStand(
      roh([satz(0, 1, 'gleich', 'a'), satz(0, 2, 'gleich', 'b')]),
      { datei: 'x.json', jetzt: JETZT },
    )
    expect(stand.jeModell).toHaveLength(2)
    expect(stand.jeModell.map((posten) => posten.familie)).toEqual(['b', 'a'])
  })
})

describe('Guthaben', () => {
  test('Limit zuerst, Fehler zuletzt, fehlende Zahlen bleiben undefined', () => {
    const stand = liesStand(
      roh([], {
        OPENROUTER_API_KEY: {
          balanceUsd: 20,
          limitUsd: 5,
          limitRemainingUsd: 4.7,
          usageUsd: 0.26,
          at: JETZT.getTime(),
        },
        DEEPSEEK_API_KEY: { balanceUsd: 5.98, detail: 'topped-up + 47.31 granted' },
        CREW: { balanceUsd: null, error: 'Provider bietet keine Guthaben-API' },
        LEER: {},
      }),
      { datei: 'x.json', jetzt: JETZT },
    )
    expect(stand.salden.map((saldo) => saldo.schluessel)).toEqual([
      'OPENROUTER_API_KEY',
      'DEEPSEEK_API_KEY',
      'LEER',
      'CREW',
    ])
    expect(stand.salden[0]?.limitUsd).toBe(5)
    expect(stand.salden[0]?.limitRestUsd).toBeCloseTo(4.7, 6)
    expect(stand.salden[1]?.limitUsd).toBeUndefined()
    // `null` ist keine Zahl — es wird nicht zu 0.
    expect(stand.salden[3]?.guthabenUsd).toBeUndefined()
    expect(stand.salden[3]?.fehler).toContain('Guthaben-API')
  })

  test('der Zeitpunkt der Guthaben wird mitgelesen', () => {
    const stand = liesStand(roh([]), { datei: 'x.json', jetzt: JETZT })
    expect(stand.saldenStand).toBe(JETZT.toISOString())
  })
})

describe('Der Rand', () => {
  test('ohne Datei sind alle Summen 0 und der Hinweis nennt den Grund', () => {
    const stand = liesStand(undefined, { datei: null, jetzt: JETZT, hinweis: 'keine Datei' })
    expect(stand.datei).toBeNull()
    expect(stand.fenster.gesamt).toEqual({ usd: 0, anfragen: 0, unbepreist: 0 })
    expect(stand.salden).toEqual([])
    expect(stand.hinweis).toBe('keine Datei')
  })

  test('ein Rohbestand, der kein Objekt ist, ergibt einen leeren Stand', () => {
    const stand = liesStand('kaputt', { datei: 'x.json', jetzt: JETZT })
    expect(stand.jeTag).toHaveLength(VERLAUF_TAGE)
    expect(stand.jeModell).toEqual([])
  })
})

describe('Suchpfade', () => {
  test('ein ausdrücklicher Pfad beendet die Suche — kein stiller Rückfall', () => {
    const liste = kandidaten({ PMH_USAGE_DATEI: 'C:/frei.json', DSH_HOME: 'C:/h' }, 'C:/heim')
    expect(liste).toEqual(['C:/frei.json'])
  })

  test('ohne ausdrücklichen Pfad: DSH_HOME, dann das Heimatverzeichnis', () => {
    const liste = kandidaten({ DSH_HOME: 'C:/h' }, 'C:/heim')
    expect(liste).toEqual([
      join('C:/h', 'usage-budget', 'usage.json'),
      join('C:/heim', '.dsh', 'usage-budget', 'usage.json'),
    ])
  })

  test('fallen beide Pfade zusammen, bleibt einer', () => {
    const liste = kandidaten({ DSH_HOME: join('C:/heim', '.dsh') }, 'C:/heim')
    expect(liste).toEqual([join('C:/heim', '.dsh', 'usage-budget', 'usage.json')])
  })

  test('ohne DSH_HOME bleibt einer', () => {
    const liste = kandidaten({}, 'C:/heim')
    expect(liste).toHaveLength(1)
    expect(liste[0]).toBe(join('C:/heim', '.dsh', 'usage-budget', 'usage.json'))
  })

  test('ein leerer ausdrücklicher Pfad zählt nicht', () => {
    const liste = kandidaten({ PMH_USAGE_DATEI: '   ' }, 'C:/heim')
    expect(liste).toHaveLength(1)
    expect(liste[0]).toBe(join('C:/heim', '.dsh', 'usage-budget', 'usage.json'))
  })
})

describe('Verbrauch je Schlüssel', () => {
  test('nach Schlüssel getrennt — insgesamt und 30 Tage', () => {
    const stand = liesStand(
      roh([
        satz(0, 1),
        { time: zeit(0), cost: 0.5, provider: 'p', model: 'm', keyRef: 'DEEPSEEK_API_KEY' },
        { time: zeit(100), cost: 8, provider: 'p', model: 'm', keyRef: 'DEEPSEEK_API_KEY' },
      ]),
      { datei: 'x', jetzt: JETZT },
    )
    const deepseek = stand.jeSchluessel.find((eintrag) => eintrag.schluessel === 'DEEPSEEK_API_KEY')
    // Seit Beginn 8,50 — aber im 30-Tage-Fenster nur 0,50. Genau diese Verwechslung war der Fehler.
    expect(deepseek?.usd).toBeCloseTo(8.5, 6)
    expect(deepseek?.usd30).toBeCloseTo(0.5, 6)
    expect(stand.jeSchluessel.find((eintrag) => eintrag.schluessel === '—')?.usd).toBeCloseTo(1, 6)
  })

  test('eine fremde Eigner-Kennung zählt nicht mit — wird aber gezählt', () => {
    const stand = liesStand(
      roh([
        { time: zeit(0), cost: 1, provider: 'p', model: 'm', keyRef: 'DEEPSEEK_API_KEY' },
        { time: zeit(0), cost: 0.25, provider: 'p', model: 'm', keyRef: 'DEEPSEEK_API_KEY:openalice' },
      ]),
      { datei: 'x', jetzt: JETZT },
    )
    // openalice/finance ist ein anderes Werkzeug — 0,25 USD gehören nicht in diese Abrechnung.
    expect(stand.fremd).toBe(1)
    expect(stand.jeSchluessel).toHaveLength(1)
    expect(stand.jeSchluessel[0]?.usd).toBeCloseTo(1, 6)
    expect(stand.jeSchluessel[0]?.anfragen).toBe(1)
  })

  test('ohne keyRef geht nichts verloren', () => {
    const stand = liesStand(roh([{ time: zeit(0), cost: 2, provider: 'p', model: 'm' }]), {
      datei: 'x',
      jetzt: JETZT,
    })
    expect(stand.jeSchluessel).toEqual([
      { schluessel: '—', usd: 2, usd30: 2, anfragen: 1, unbepreist: 0 },
    ])
  })

  test('unbepreiste Datensätze zählen mit, kosten aber nichts', () => {
    const stand = liesStand(
      roh([
        { time: zeit(0), provider: 'p', model: 'm', keyRef: 'ZAI_API_KEY' },
        { time: zeit(0), cost: 0.1, provider: 'p', model: 'm', keyRef: 'ZAI_API_KEY' },
      ]),
      { datei: 'x', jetzt: JETZT },
    )
    expect(stand.jeSchluessel[0]?.unbepreist).toBe(1)
    expect(stand.jeSchluessel[0]?.anfragen).toBe(2)
    expect(stand.jeSchluessel[0]?.usd).toBeCloseTo(0.1, 6)
  })
})
