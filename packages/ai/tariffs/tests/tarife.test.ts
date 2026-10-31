/**
 * Tarife: die Umrechnung, die Kostenart und die Verschmelzungsregel.
 *
 * Zwei Eigenschaften werden hier festgenagelt: **„unbekannt" ist kein niedriger Preis** (es sortiert
 * sich nicht nach vorn) und **die Messung schlägt die Tabelle** — aber nur, wenn sie wirklich einen
 * Preis nennt.
 */

import { describe, expect, test } from 'bun:test'

import {
  KOSTEN_RANG,
  PREIS_UNBEKANNT,
  SAAT,
  alsText,
  alsZahl,
  istBekannt,
  jeMioToken,
  kostenartFuer,
  preisBekannt,
  summe,
  tarifFuer,
  unbekannterTarif,
  verschmelze,
  type Tarifeintrag,
} from '../src/index.ts'

describe('Preise lesen', () => {
  test('eine Zeichenkette mit Preis wird gelesen — die Models-API liefert sie so', () => {
    expect(alsZahl('0.0000005')).toBe(0.0000005)
    expect(alsZahl('0')).toBe(0)
  })

  test('was kein Preis ist, ergibt keine Zahl', () => {
    expect(alsZahl('')).toBeUndefined()
    expect(alsZahl('   ')).toBeUndefined()
    expect(alsZahl('kostenlos')).toBeUndefined()
    expect(alsZahl(null)).toBeUndefined()
    expect(alsZahl({})).toBeUndefined()
    expect(alsZahl(Number.NaN)).toBeUndefined()
    expect(alsZahl(Number.POSITIVE_INFINITY)).toBeUndefined()
  })

  test('je Token wird auf je 1 Mio Token gerechnet, ohne Rechenrest', () => {
    // Das ist der Fall, der ohne Rundung 0.49999999999999994 ergäbe.
    expect(jeMioToken(0.0000005)).toBe(0.5)
    expect(jeMioToken(0)).toBe(0)
    expect(jeMioToken(0.000002)).toBe(2)
  })

  test('die Marke -1 ist kein Preis', () => {
    expect(istBekannt(-1)).toBe(false)
    expect(istBekannt(0)).toBe(true)
    expect(preisBekannt({ hinein: 0.5, heraus: -1 })).toBe(false)
    expect(preisBekannt({ hinein: 0.5, heraus: 9 })).toBe(true)
  })

  test('ein halber Preis ergibt keine Summe', () => {
    expect(summe({ hinein: 0.5, heraus: 9 })).toBe(9.5)
    expect(summe({ hinein: 0.5, heraus: -1 })).toBeUndefined()
  })

  test('ein unvollständiger Preis wird als solcher geschrieben', () => {
    expect(alsText({ hinein: 0.5, heraus: 9 })).toBe('0.50 / 9.00')
    expect(alsText({ hinein: 0.5, heraus: -1 })).toContain('unvollständig')
  })
})

describe('Kostenart', () => {
  const bauen = (preis: { hinein: number; heraus: number }): Tarifeintrag => ({
    familie: 'x',
    modell: 'm',
    preis,
    stand: '2026-10-15',
    quelle: 'Test',
    herkunft: 'tabelle',
  })

  test('Preis null ist kostenlos', () => {
    expect(kostenartFuer(bauen({ hinein: 0, heraus: 0 }))).toBe('kostenlos')
  })

  test('Preis größer null ist kostenpflichtig', () => {
    expect(kostenartFuer(bauen({ hinein: 0.2, heraus: 0 }))).toBe('kostenpflichtig')
  })

  test('ohne Preis ist die Kostenart unbekannt — nicht kostenlos', () => {
    expect(kostenartFuer(bauen(PREIS_UNBEKANNT))).toBe('unbekannt')
  })

  test('ein Kontingent ergibt freibetrag — aber ein Preis von null schlägt es', () => {
    const mitKontingent: Tarifeintrag = {
      ...bauen({ hinein: 0.5, heraus: 9 }),
      freibetrag: { einheit: 'Anfragen/Tag', menge: 50, beleg: 'Test' },
    }
    expect(kostenartFuer(mitKontingent)).toBe('freibetrag')

    const gratisTrotzKontingent: Tarifeintrag = {
      ...bauen({ hinein: 0, heraus: 0 }),
      freibetrag: { einheit: 'Anfragen/Tag', menge: 50, beleg: 'Test' },
    }
    expect(kostenartFuer(gratisTrotzKontingent)).toBe('kostenlos')
  })

  test('unbekannt sortiert sich HINTER kostenpflichtig', () => {
    // Das ist die eine Regel, an der die ganze Liste hängt.
    expect(KOSTEN_RANG['kostenlos']).toBeLessThan(KOSTEN_RANG['kostenpflichtig'])
    expect(KOSTEN_RANG['unbekannt']).toBeGreaterThan(KOSTEN_RANG['kostenpflichtig'])
  })
})

describe('Verschmelzen', () => {
  const tabelle: readonly Tarifeintrag[] = [
    {
      familie: 'openrouter',
      modell: 'a',
      preis: { hinein: 1, heraus: 2 },
      stand: '2026-10-01',
      quelle: 'Tabelle',
      herkunft: 'tabelle',
    },
  ]

  test('die Messung schlägt die Tabelle', () => {
    const ergebnis = verschmelze(tabelle, [{
      familie: 'openrouter',
      modell: 'a',
      preis: { hinein: 0.1, heraus: 0.2 },
      stand: '2026-10-01',
      quelle: 'Measure',
      herkunft: 'tabelle',
    }], '2026-10-15')

    expect(ergebnis.ueberschrieben).toBe(1)
    expect(ergebnis.tarife[0]?.preis).toEqual({ hinein: 0.1, heraus: 0.2 })
    expect(ergebnis.tarife[0]?.herkunft).toBe('gemessen')
    expect(ergebnis.tarife[0]?.stand).toBe('2026-10-15')
    expect(ergebnis.bericht.join('\n')).toContain('schlägt die Tabelle')
  })

  test('ein gemessener unbekannter Preis überschreibt NICHT', () => {
    // Eine API ohne Preisfeld darf keinen eingetragenen Preis löschen.
    const ergebnis = verschmelze(tabelle, [{
      familie: 'openrouter',
      modell: 'a',
      preis: PREIS_UNBEKANNT,
      stand: '2026-10-15',
      quelle: 'Measure',
      herkunft: 'gemessen',
    }], '2026-10-15')

    expect(ergebnis.ueberschrieben).toBe(0)
    expect(ergebnis.tarife[0]?.preis).toEqual({ hinein: 1, heraus: 2 })
    expect(ergebnis.tarife[0]?.stand).toBe('2026-10-01')
  })

  test('ein unbekannter Preis ohne Vorgänger wird nicht aufgenommen', () => {
    const ergebnis = verschmelze([], [{
      familie: 'x',
      modell: 'y',
      preis: PREIS_UNBEKANNT,
      stand: '2026-10-15',
      quelle: 'Measure',
      herkunft: 'gemessen',
    }], '2026-10-15')

    expect(ergebnis.tarife).toEqual([])
    expect(ergebnis.bericht.join('\n')).toContain('nicht aufgenommen')
  })

  test('ein neuer Preis wird ergänzt', () => {
    const ergebnis = verschmelze(tabelle, [{
      familie: 'openrouter',
      modell: 'b',
      preis: { hinein: 0, heraus: 0 },
      stand: '2026-10-15',
      quelle: 'Measure',
      herkunft: 'gemessen',
    }], '2026-10-15')

    expect(ergebnis.ergaenzt).toBe(1)
    expect(ergebnis.tarife.map((e) => e.modell)).toEqual(['a', 'b'])
    expect(kostenartFuer(ergebnis.tarife[1] as Tarifeintrag)).toBe('kostenlos')
  })

  test('zweimal verschmelzen ergibt dieselbe Reihenfolge', () => {
    const einmal = verschmelze(SAAT, [], '2026-10-15')
    const zweimal = verschmelze(SAAT, [], '2026-10-15')
    expect(JSON.stringify(einmal.tarife)).toBe(JSON.stringify(zweimal.tarife))
  })
})

describe('Nachschlagen', () => {
  test('die Familie gehört zum Schlüssel — dieselbe Kennung bei zwei Familien', () => {
    const tarife = [
      unbekannterTarif('a', 'gleich', '2026-10-15', 'T'),
      { ...unbekannterTarif('b', 'gleich', '2026-10-15', 'T'), preis: { hinein: 5, heraus: 5 } },
    ]
    expect(tarifFuer(tarife, 'a', 'gleich')?.preis).toEqual(PREIS_UNBEKANNT)
    expect(tarifFuer(tarife, 'b', 'gleich')?.preis).toEqual({ hinein: 5, heraus: 5 })
    expect(tarifFuer(tarife, 'c', 'gleich')).toBeUndefined()
  })

  test('die Saat trägt die gemessenen Zahlen im Wortlaut', () => {
    const tts = tarifFuer(SAAT, 'openrouter', 'google/gemini-3.8-flash-tts')
    expect(tts?.preis).toEqual({ hinein: 0.5, heraus: 9 })
    expect(tts?.stand).toBe('2026-10-15')
  })

  test('die Saat behauptet KEINEN Gratis-Tarif', () => {
    // Die wichtigste Zusage dieses Pakets: kein Freibetrag ohne Beleg.
    const mitKontingent = SAAT.filter((eintrag) => eintrag.freibetrag !== undefined)
    expect(mitKontingent).toEqual([])
    const kostenlos = SAAT.filter((eintrag) => kostenartFuer(eintrag) === 'kostenlos')
    expect(kostenlos).toEqual([])
  })

  test('jev-router steht als ausdrücklich unbekannt in der Saat', () => {
    const router = tarifFuer(SAAT, 'openrouter', 'typesafe/jev-router')
    expect(router).toBeDefined()
    expect(kostenartFuer(router as Tarifeintrag)).toBe('unbekannt')
  })
})
