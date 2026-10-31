/**
 * Die Rangliste: Ordnung, Empfehlung und Begründung.
 *
 * Die Tests nageln die vier Regeln fest, an denen die Liste hängt: **Verdrahtung zuerst**, ein
 * **unbekannter Preis sortiert nach hinten**, **`fehlt` hinter `unbekannt`** — und eine Empfehlung
 * nur, wenn Umsetzung **und** Messung zusammenkommen.
 */

import { describe, expect, test } from 'bun:test'

import type { Anbieter, Faehigkeit } from '@prometheus-harness/capabilities'
import type { Familie } from '@prometheus-harness/provider-directory'
import type { Katalog, Katalogeintrag } from '@prometheus-harness/directory-curator'
import { PREIS_UNBEKANNT, type Tarifeintrag } from '@prometheus-harness/tariffs'
import { alsListe, baueRangliste, zaehle, type Rangoptionen } from '../src/index.ts'

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

function familie(id: string, faehigkeiten: readonly Faehigkeit[], name = id): Familie {
  const wege: Familie['wege'] = {}
  for (const faehigkeit of faehigkeiten) {
    wege[faehigkeit] = { pfad: `/x/${faehigkeit}`, art: 'json', gemessenAm: '2026-10-15' }
  }
  return {
    id,
    name,
    basis: `https://${id}.invalid/v1`,
    kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
    modellWeg: '/models',
    wege,
    stand: 'Test',
  }
}

function katalogEintrag(id: string, wege: Record<string, string>, geprueftAm = '2026-10-15T00:00:00.000Z'): Katalogeintrag {
  return {
    familie: id,
    geprueftAm,
    modelleErreichbar: true,
    modelle: [],
    wege: wege as Katalogeintrag['wege'],
    bemerkung: 'Test',
  }
}

function katalog(eintraege: readonly Katalogeintrag[]): Katalog {
  const nach: Record<string, Katalogeintrag> = {}
  for (const eintrag of eintraege) nach[eintrag.familie] = eintrag
  return { fassung: 1, eintraege: nach }
}

function anbieter(id: string, faehigkeiten: readonly Faehigkeit[]): Anbieter {
  return {
    id,
    name: id,
    faehigkeiten,
    schluessel: 'schluessel-noetig',
    modelle: () => [],
    bereit: async () => ({ bereit: true }),
  }
}

function tarif(familieId: string, modell: string, hinein: number, heraus: number): Tarifeintrag {
  return {
    familie: familieId,
    modell,
    preis: { hinein, heraus },
    stand: '2026-10-01',
    quelle: 'Tabelle',
    herkunft: 'tabelle',
  }
}

/** Der Zeitpunkt, mit dem gerechnet wird — fest, damit „veraltet" prüfbar ist. */
const JETZT = new Date('2026-10-15T12:00:00.000Z')

function rechne(teil: Partial<Rangoptionen>): ReturnType<typeof baueRangliste> {
  return baueRangliste({
    familien: [],
    faehigkeiten: ['entscheiden'],
    jetzt: JETZT,
    ...teil,
  })
}

// ---------------------------------------------------------------------------
// Ordnung
// ---------------------------------------------------------------------------

describe('Die Ordnung', () => {
  test('eine Umsetzung schlägt einen billigeren, nicht verdrahteten Eintrag', () => {
    const rangliste = rechne({
      familien: [familie('teuer', ['entscheiden']), familie('gratis', ['entscheiden'])],
      anbieter: [anbieter('teuer', ['entscheiden'])],
      katalog: katalog([
        katalogEintrag('teuer', { entscheiden: 'vorhanden' }),
        katalogEintrag('gratis', { entscheiden: 'vorhanden' }),
      ]),
      tarife: [tarif('teuer', 'm', 5, 5)],
    })

    const liste = rangliste.listen[0]
    expect(liste?.eintraege.map((e) => e.familie)).toEqual(['teuer', 'gratis'])
    expect(liste?.empfehlung?.familie).toBe('teuer')
    // Der Grund steht dabei — nicht nur das Ergebnis.
    expect(liste?.eintraege[1]?.gruende[0]).toContain('NICHT verdrahtet')
  })

  test('ein unbekannter Preis sortiert HINTER einem bezifferten', () => {
    const rangliste = rechne({
      familien: [familie('ohne', ['entscheiden']), familie('mit', ['entscheiden'])],
      anbieter: [anbieter('ohne', ['entscheiden']), anbieter('mit', ['entscheiden'])],
      katalog: katalog([
        katalogEintrag('ohne', { entscheiden: 'vorhanden' }),
        katalogEintrag('mit', { entscheiden: 'vorhanden' }),
      ]),
      tarife: [tarif('mit', 'm', 1, 1)],
    })

    const liste = rangliste.listen[0]
    expect(liste?.eintraege.map((e) => e.familie)).toEqual(['mit', 'ohne'])
    const letzter = liste?.eintraege[1]
    expect(letzter?.kostenart).toBe('unbekannt')
    expect(letzter?.preis).toEqual(PREIS_UNBEKANNT)
    expect(letzter?.gruende.join(' ')).toContain('nicht günstig')
  })

  test('kostenlos vor kostenpflichtig — aber erst nach Verdrahtung und Befund', () => {
    const rangliste = rechne({
      familien: [familie('bezahlt', ['entscheiden']), familie('frei', ['entscheiden'])],
      anbieter: [anbieter('bezahlt', ['entscheiden']), anbieter('frei', ['entscheiden'])],
      katalog: katalog([
        katalogEintrag('bezahlt', { entscheiden: 'vorhanden' }),
        katalogEintrag('frei', { entscheiden: 'vorhanden' }),
      ]),
      tarife: [tarif('bezahlt', 'm', 2, 2), tarif('frei', 'm', 0, 0)],
    })

    const liste = rangliste.listen[0]
    expect(liste?.eintraege.map((e) => e.familie)).toEqual(['frei', 'bezahlt'])
    expect(liste?.eintraege[0]?.kostenart).toBe('kostenlos')
    expect(liste?.empfehlung?.familie).toBe('frei')
  })

  test('ein gemessen fehlender Weg steht hinter einem ungemessenen', () => {
    const rangliste = rechne({
      familien: [familie('weg', ['entscheiden']), familie('nix', ['entscheiden'])],
      anbieter: [anbieter('weg', ['entscheiden']), anbieter('nix', ['entscheiden'])],
      katalog: katalog([
        katalogEintrag('weg', { entscheiden: 'fehlt' }),
        katalogEintrag('nix', { entscheiden: 'unbekannt' }),
      ]),
    })

    const liste = rangliste.listen[0]
    expect(liste?.eintraege.map((e) => e.funktionalitaet)).toEqual(['unbekannt', 'fehlt'])
    expect(liste?.eintraege[1]?.gruende.join(' ')).toContain('FEHLEND (404)')
  })

  test('zwei gleiche Läufe ergeben dieselbe Reihenfolge', () => {
    const bauen = (): ReturnType<typeof baueRangliste> =>
      rechne({
        familien: [familie('b', ['entscheiden']), familie('a', ['entscheiden'])],
        anbieter: [anbieter('a', ['entscheiden']), anbieter('b', ['entscheiden'])],
        katalog: katalog([
          katalogEintrag('a', { entscheiden: 'vorhanden' }),
          katalogEintrag('b', { entscheiden: 'vorhanden' }),
        ]),
      })
    expect(JSON.stringify(bauen())).toBe(JSON.stringify(bauen()))
    // Und der Name entscheidet, weil sonst nichts entscheidet.
    expect(bauen().listen[0]?.eintraege.map((e) => e.familie)).toEqual(['a', 'b'])
  })

  test('die Ränge sind lückenlos und eins-basiert', () => {
    const rangliste = rechne({
      familien: [familie('a', ['entscheiden']), familie('b', ['entscheiden'])],
      anbieter: [anbieter('a', ['entscheiden'])],
      katalog: katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]),
    })
    expect(rangliste.listen[0]?.eintraege.map((e) => e.rang)).toEqual([1, 2])
  })
})

// ---------------------------------------------------------------------------
// Empfehlung
// ---------------------------------------------------------------------------

describe('Die Empfehlung', () => {
  const ohneEmpfehlungFaelle: readonly { readonly name: string; readonly teil: Partial<Rangoptionen>; readonly erwartet: string }[] = [
    {
      name: 'nichts verdrahtet',
      teil: {
        familien: [familie('a', ['entscheiden'])],
        katalog: katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]),
      },
      erwartet: 'keine Umsetzung eingetragen',
    },
    {
      name: 'verdrahtet, aber nichts gemessen',
      teil: {
        familien: [familie('a', ['entscheiden'])],
        anbieter: [anbieter('a', ['entscheiden'])],
      },
      erwartet: 'keinen Katalog',
    },
    {
      name: 'verdrahtet, aber der Weg fehlt',
      teil: {
        familien: [familie('a', ['entscheiden'])],
        anbieter: [anbieter('a', ['entscheiden'])],
        katalog: katalog([katalogEintrag('a', { entscheiden: 'fehlt' })]),
      },
      erwartet: 'nur vermutet',
    },
  ]

  for (const fall of ohneEmpfehlungFaelle) {
    test(`ohne Empfehlung: ${fall.name} — und der Grund steht da`, () => {
      const liste = rechne(fall.teil).listen[0]
      expect(liste?.empfehlung).toBeUndefined()
      expect(liste?.ohneEmpfehlung ?? '').toContain(fall.erwartet)
    })
  }

  test('eine Empfehlung verlangt Umsetzung UND gemessenen Weg', () => {
    const liste = rechne({
      familien: [familie('a', ['entscheiden'])],
      anbieter: [anbieter('a', ['entscheiden'])],
      katalog: katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]),
    }).listen[0]
    expect(liste?.empfehlung?.familie).toBe('a')
    expect(liste?.ohneEmpfehlung).toBeUndefined()
  })

  test('ein anderes Anbieter-Id verdrahtet nicht — die Kennung muß passen', () => {
    const liste = rechne({
      familien: [familie('a', ['entscheiden'])],
      anbieter: [anbieter('ganz-anders', ['entscheiden'])],
      katalog: katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]),
    }).listen[0]
    // **Seit dem lokalen Fall stehen hier ZWEI Einträge.** `ganz-anders` ist eine Umsetzung ohne
    // Verzeichniseintrag und erscheint deshalb selbst — verdrahtet. Die Aussage des Tests gilt
    // weiter, sie muß nur den richtigen Eintrag treffen.
    const ausDemVerzeichnis = liste?.eintraege.find((eintrag) => eintrag.familie === 'a')
    expect(ausDemVerzeichnis?.verdrahtet).toBe(false)
    expect(ausDemVerzeichnis?.imVerzeichnis).toBe(true)
    const ohneVerzeichnis = liste?.eintraege.find((eintrag) => eintrag.familie === 'ganz-anders')
    expect(ohneVerzeichnis?.verdrahtet).toBe(true)
    expect(ohneVerzeichnis?.imVerzeichnis).toBe(false)
  })

  test('ein Anbieter ohne diese Fähigkeit verdrahtet nicht', () => {
    const liste = rechne({
      familien: [familie('a', ['entscheiden'])],
      anbieter: [anbieter('a', ['einbetten'])],
      katalog: katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]),
    }).listen[0]
    expect(liste?.eintraege[0]?.verdrahtet).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Preise und Messung
// ---------------------------------------------------------------------------

describe('Preise', () => {
  test('die gemessene Modellliste schlägt die Tabelle', () => {
    const rangliste = rechne({
      familien: [familie('a', ['entscheiden'])],
      anbieter: [anbieter('a', ['entscheiden'])],
      katalog: katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]),
      tarife: [tarif('a', 'm', 90, 90)],
      modelle: { a: [{ kennung: 'm', preis: { hinein: 1, heraus: 2 } }] },
    })

    const eintrag = rangliste.listen[0]?.eintraege[0]
    expect(eintrag?.preis).toEqual({ hinein: 1, heraus: 2 })
    expect(eintrag?.gruende.join(' ')).toContain('GEMESSEN')
  })

  test('ohne gemessene Liste greift die Tabelle als Saat', () => {
    const rangliste = rechne({
      familien: [familie('a', ['entscheiden'])],
      anbieter: [anbieter('a', ['entscheiden'])],
      katalog: katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]),
      tarife: [tarif('a', 'gpt-oss-20b', 0.02, 0.09)],
    })

    const eintrag = rangliste.listen[0]?.eintraege[0]
    expect(eintrag?.modell).toBe('gpt-oss-20b')
    expect(eintrag?.kostenart).toBe('kostenpflichtig')
    expect(eintrag?.gruende.join(' ')).toContain('aus der Tabelle')
  })

  test('ohne Modell steht ein Eintrag ohne Modell — mit Grund', () => {
    const rangliste = rechne({
      familien: [familie('a', ['entscheiden'])],
      anbieter: [anbieter('a', ['entscheiden'])],
      katalog: katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]),
    })

    const eintrag = rangliste.listen[0]?.eintraege[0]
    expect(eintrag?.modell).toBeUndefined()
    expect(eintrag?.gruende.join(' ')).toContain('Kein Modell bekannt')
  })

  test('das teuerste Modell steht hinten — sortiert nach der Summe', () => {
    const rangliste = rechne({
      familien: [familie('a', ['entscheiden'])],
      anbieter: [anbieter('a', ['entscheiden'])],
      katalog: katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]),
      modelle: {
        a: [
          { kennung: 'teuer', preis: { hinein: 10, heraus: 10 } },
          { kennung: 'billig', preis: { hinein: 0.1, heraus: 0.1 } },
        ],
      },
    })

    expect(rangliste.listen[0]?.eintraege.map((e) => e.modell)).toEqual(['billig', 'teuer'])
  })
})

// ---------------------------------------------------------------------------
// Was fehlt, wird gesagt
// ---------------------------------------------------------------------------

describe('Was fehlt, wird gesagt', () => {
  test('ohne Katalog ist alles unbekannt — mit Hinweis', () => {
    const rangliste = rechne({ familien: [familie('a', ['entscheiden'])] })
    expect(rangliste.listen[0]?.eintraege[0]?.funktionalitaet).toBe('unbekannt')
    expect(rangliste.hinweise.join(' ')).toContain('KEIN Katalog')
  })

  test('ohne Umsetzung wird es gesagt', () => {
    const rangliste = rechne({ familien: [familie('a', ['entscheiden'])] })
    expect(rangliste.hinweise.join(' ')).toContain('KEINE Umsetzung')
  })

  test('eine Familie ohne Weg und ohne Befund kommt gar nicht vor', () => {
    const rangliste = rechne({ familien: [familie('ohne-weg', [])] })
    expect(rangliste.listen[0]?.eintraege).toEqual([])
    expect(rangliste.hinweise.join(' ')).toContain('KEINEN Eintrag')
  })

  test('eine Fähigkeit, die nur GEMESSEN vorhanden ist, kommt vor — auch ohne Tabellenweg', () => {
    const rangliste = rechne({
      familien: [familie('nur-gemessen', [])],
      anbieter: [anbieter('nur-gemessen', ['entscheiden'])],
      katalog: katalog([katalogEintrag('nur-gemessen', { entscheiden: 'vorhanden' })]),
    })
    expect(rangliste.listen[0]?.eintraege.map((e) => e.familie)).toEqual(['nur-gemessen'])
  })

  test('eine alte Messung wird als veraltet markiert', () => {
    const rangliste = rechne({
      familien: [familie('a', ['entscheiden'])],
      anbieter: [anbieter('a', ['entscheiden'])],
      katalog: katalog([katalogEintrag('a', { entscheiden: 'vorhanden' }, '2026-09-01T00:00:00.000Z')]),
    })

    const eintrag = rangliste.listen[0]?.eintraege[0]
    expect(eintrag?.veraltet).toBe(true)
    expect(eintrag?.gruende.join(' ')).toContain('ÄLTER als die Frist')
  })
})

// ---------------------------------------------------------------------------
// Die Liste als Text und als Zahl
// ---------------------------------------------------------------------------

describe('Anzeige', () => {
  const rangliste = rechne({
    familien: [familie('frei', ['entscheiden'], 'Frei'), familie('teuer', ['entscheiden'], 'Teuer')],
    anbieter: [anbieter('frei', ['entscheiden']), anbieter('teuer', ['entscheiden'])],
    katalog: katalog([
      katalogEintrag('frei', { entscheiden: 'vorhanden' }),
      katalogEintrag('teuer', { entscheiden: 'vorhanden' }),
    ]),
    tarife: [tarif('frei', 'm', 0, 0), tarif('teuer', 'm', 5, 5)],
  })

  test('der Text nennt die bevorzugte Wahl', () => {
    const text = alsListe(rangliste)
    expect(text).toContain('Entscheiden (entscheiden)')
    expect(text).toContain('Bevorzugt: Frei')
    expect(text).toContain('kostenlos')
  })

  test('der Text läßt Unbrauchbares auf Wunsch weg', () => {
    const text = alsListe(rangliste, { nurBrauchbare: true })
    expect(text).toContain('Frei')
  })

  test('der Text endet mit einem Zeilenumbruch', () => {
    expect(alsListe(rangliste).endsWith('\n')).toBe(true)
  })

  test('die Zählung trennt belegt von unbelegt', () => {
    const zahlen = zaehle(rangliste)
    expect(zahlen.eintraege).toBe(2)
    expect(zahlen.verdrahtet).toBe(2)
    expect(zahlen.gemessen).toBe(2)
    expect(zahlen.kostenlos).toBe(1)
    expect(zahlen.ohnePreis).toBe(0)
  })
})
