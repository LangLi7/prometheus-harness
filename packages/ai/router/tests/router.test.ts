/**
 * Die Auswahl: Reihenfolge, ausdrückliche Wahl und die Gründe.
 *
 * Der wichtigste Test dieser Datei ist der zweite: **die Rangfolge entscheidet, nicht die
 * Eintragsreihenfolge.** Genau das war der Zustand vorher — `Faehigkeiten.waehle()` nahm den
 * ersten einsatzbereiten Anbieter in der Reihenfolge, in der jemand `anbieten()` gerufen hatte.
 */

import { describe, expect, test } from 'bun:test'

import {
  Faehigkeiten,
  MENSCH_ID,
  menschAlsAnbieter,
  type Anbieter,
  type Faehigkeit,
} from '@prometheus-harness/capabilities'
import type { Familie } from '@prometheus-harness/provider-directory'
import type { Katalog, Katalogeintrag } from '@prometheus-harness/directory-curator'
import type { Tarifeintrag } from '@prometheus-harness/tariffs'
import { baueRangliste, type Rangliste } from '@prometheus-harness/ranking'

import { KeineWahlError, moeglichkeiten, waehle } from '../src/index.ts'

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

function katalogEintrag(id: string, wege: Record<string, string>): Katalogeintrag {
  return {
    familie: id,
    geprueftAm: '2026-10-15T00:00:00.000Z',
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

/**
 * Wie oft `bereit()` je Kennung gefragt wurde.
 *
 * **Warum ein Zähler und kein Rückgabefeld.** Ein Test soll beweisen, daß eine **Anzeige** keinen
 * Anbieter befragt. Dafür muß gezählt werden, ohne die Form des Anbieters zu ändern — sonst
 * prüfte der Test eine Attrappe, die es so nicht gibt. Kennungen, deren Zahl geprüft wird, sind
 * deshalb **eigene** (`m-…`), damit kein früherer Test die Zahl verfälscht.
 */
const abfragen = new Map<string, number>()

/** Wie oft für diese Kennung gefragt wurde. */
function gezaehlt(id: string): number {
  return abfragen.get(id) ?? 0
}

/** Ein Anbieter, dessen Bereitschaft sich einstellen läßt. */
function anbieter(
  id: string,
  faehigkeiten: readonly Faehigkeit[],
  bereit = true,
  grund = 'kein Schlüssel',
): Anbieter {
  return {
    id,
    name: id,
    faehigkeiten,
    schluessel: 'schluessel-noetig',
    modelle: () => [],
    async bereit(): Promise<{ bereit: true } | { bereit: false; grund: string }> {
      abfragen.set(id, gezaehlt(id) + 1)
      return bereit ? { bereit: true } : { bereit: false, grund }
    },
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

const JETZT = new Date('2026-10-15T12:00:00.000Z')

/**
 * Eine Rangfolge für `entscheiden` mit zwei Familien:
 * **`billig`** (gemessen vorhanden, 0,02) und **`teuer`** (gemessen vorhanden, 5).
 */
function rangfolge(): Rangliste {
  return baueRangliste({
    familien: [familie('teuer', ['entscheiden']), familie('billig', ['entscheiden'])],
    anbieter: [anbieter('teuer', ['entscheiden']), anbieter('billig', ['entscheiden'])],
    katalog: katalog([
      katalogEintrag('teuer', { entscheiden: 'vorhanden' }),
      katalogEintrag('billig', { entscheiden: 'vorhanden' }),
    ]),
    tarife: [tarif('teuer', 'm', 5, 5), tarif('billig', 'm', 0.02, 0.02)],
    faehigkeiten: ['entscheiden'],
    jetzt: JETZT,
  })
}

// ---------------------------------------------------------------------------
// Die Rangfolge entscheidet
// ---------------------------------------------------------------------------

describe('Die Rangfolge entscheidet', () => {
  test('der billigere Rang gewinnt — auch wenn der teure ZUERST eingetragen ist', async () => {
    const registratur = new Faehigkeiten()
    // **Absichtlich die verkehrte Reihenfolge.** Vorher hätte `waehle()` den ersten genommen.
    registratur.anbieten(anbieter('teuer', ['entscheiden']))
    registratur.anbieten(anbieter('billig', ['entscheiden']))

    const wahl = await waehle({ registratur, rangliste: rangfolge(), faehigkeit: 'entscheiden' })
    expect(wahl.anbieter.id).toBe('billig')
    expect(wahl.wegen).toBe('rangfolge')
    expect(wahl.rang).toBe(1)
    expect(wahl.eintrag?.kostenart).toBe('kostenpflichtig')
  })

  test('der erste NICHT bereite wird übersprungen — mit Grund', async () => {
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('billig', ['entscheiden'], false, 'Schlüssel fehlt'))
    registratur.anbieten(anbieter('teuer', ['entscheiden']))

    const wahl = await waehle({ registratur, rangliste: rangfolge(), faehigkeit: 'entscheiden' })
    expect(wahl.anbieter.id).toBe('teuer')
    expect(wahl.rang).toBe(2)
    expect(wahl.verworfen.join(' ')).toContain('Schlüssel fehlt')
  })

  test('ein Eintrag ohne Umsetzung wird übersprungen — mit Grund', async () => {
    // In der Rangfolge stehen ZWEI Familien, eingetragen ist nur eine.
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('teuer', ['entscheiden']))

    const wahl = await waehle({ registratur, rangliste: rangfolge(), faehigkeit: 'entscheiden' })
    expect(wahl.anbieter.id).toBe('teuer')
    expect(wahl.verworfen.join(' ')).toContain('keine Umsetzung eingetragen')
  })
})

// ---------------------------------------------------------------------------
// Die ausdrückliche Wahl
// ---------------------------------------------------------------------------

describe('Die ausdrückliche Wahl', () => {
  test('eine bereite Wahl schlägt die Rangfolge', async () => {
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('billig', ['entscheiden']))
    registratur.anbieten(anbieter('teuer', ['entscheiden']))

    const wahl = await waehle({
      registratur,
      rangliste: rangfolge(),
      faehigkeit: 'entscheiden',
      gewaehlt: 'teuer',
    })
    expect(wahl.anbieter.id).toBe('teuer')
    expect(wahl.wegen).toBe('gewaehlt')
    expect(wahl.rang).toBeUndefined()
  })

  test('eine NICHT bereite Wahl greift nicht — aber der Grund steht da', async () => {
    // **Der Fall, der sonst unsichtbar bliebe:** der Nutzer wählt `teuer`, der Schlüssel fehlt,
    // und es antwortet `billig`. Ohne `verworfen` wüsste niemand, daß seine Wahl nicht griff.
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('billig', ['entscheiden']))
    registratur.anbieten(anbieter('teuer', ['entscheiden'], false, 'Schlüssel fehlt'))

    const wahl = await waehle({
      registratur,
      rangliste: rangfolge(),
      faehigkeit: 'entscheiden',
      gewaehlt: 'teuer',
    })
    expect(wahl.anbieter.id).toBe('billig')
    expect(wahl.wegen).toBe('rangfolge')
    expect(wahl.verworfen[0]).toContain('teuer')
    expect(wahl.verworfen[0]).toContain('nicht bereit')
  })

  test('eine Wahl auf eine unbekannte Kennung wirkt nicht — und wird gesagt', async () => {
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('billig', ['entscheiden']))

    const wahl = await waehle({
      registratur,
      rangliste: rangfolge(),
      faehigkeit: 'entscheiden',
      gewaehlt: 'zai',
    })
    expect(wahl.anbieter.id).toBe('billig')
    expect(wahl.verworfen.join(' ')).toContain('KEINEN Anbieter mit dieser Kennung')
  })
})

// ---------------------------------------------------------------------------
// Kein stiller Rückfall
// ---------------------------------------------------------------------------

describe('Kein stiller Rückfall', () => {
  test('kann niemand, WIRFT es — mit allen Gründen', async () => {
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('billig', ['entscheiden'], false, 'erster Grund'))
    registratur.anbieten(anbieter('teuer', ['entscheiden'], false, 'zweiter Grund'))

    const fehler = await waehle({ registratur, rangliste: rangfolge(), faehigkeit: 'entscheiden' })
      .then(() => undefined)
      .catch((geworfen: unknown) => geworfen as KeineWahlError)

    expect(fehler).toBeInstanceOf(KeineWahlError)
    expect(fehler?.gruende.join(' ')).toContain('erster Grund')
    expect(fehler?.gruende.join(' ')).toContain('zweiter Grund')
  })

  test('eine leere Registratur ergibt einen Fehler, keinen Anbieter', async () => {
    const registratur = new Faehigkeiten()
    await expect(waehle({ registratur, rangliste: rangfolge(), faehigkeit: 'entscheiden' }))
      .rejects.toThrow(KeineWahlError)
  })

  test('eine Rangliste ohne diese Fähigkeit wird benannt', async () => {
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('billig', ['einbetten']))
    await expect(waehle({ registratur, rangliste: rangfolge(), faehigkeit: 'einbetten' }))
      .rejects.toThrow('keine Liste für')
  })

  test('ein Anbieter, der die Fähigkeit NICHT nennt, ist kein Kandidat', async () => {
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('billig', ['einbetten']))
    await expect(waehle({ registratur, rangliste: rangfolge(), faehigkeit: 'entscheiden' }))
      .rejects.toThrow(KeineWahlError)
  })
})

// ---------------------------------------------------------------------------
// Der Mensch — und die lokalen Anbieter
// ---------------------------------------------------------------------------

describe('Der Mensch und das Lokale', () => {
  test('der Mensch steht HINTEN — ein gemessener Anbieter schlägt ihn', async () => {
    // Ohne die Regel „Mensch zuletzt" entschiede der Name: `mensch` < `billig`? Nein — aber
    // `mensch` schlüge jeden verdrahteten, ungemessenen Anbieter, dessen Name später kommt.
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('billig', ['entscheiden']))
    registratur.anbieten(menschAlsAnbieter({
      // **Wirft, statt zu antworten.** So beweist der Test zugleich, daß der Mensch hier gar nicht
      // gefragt wird: käme es doch dazu, fiele der Test mit dieser Meldung aus.
      frage: async () => {
        throw new Error('Der Mensch wurde gefragt, obwohl ein gemessener Anbieter bereitstand.')
      },
      faehigkeiten: ['entscheiden'],
    }))

    const wahl = await waehle({ registratur, rangliste: rangfolge(), faehigkeit: 'entscheiden' })
    expect(wahl.anbieter.id).toBe('billig')
  })

  test('der Mensch steht in der Rangliste GANZ HINTEN', () => {
    const rangliste = baueRangliste({
      familien: [familie('billig', ['entscheiden'])],
      anbieter: [
        anbieter('billig', ['entscheiden']),
        menschAlsAnbieter({
          frage: async () => {
            throw new Error('nicht gefragt')
          },
          faehigkeiten: ['entscheiden'],
        }),
      ],
      katalog: katalog([katalogEintrag('billig', { entscheiden: 'vorhanden' })]),
      tarife: [tarif('billig', 'm', 0, 0)],
      faehigkeiten: ['entscheiden'],
      jetzt: JETZT,
    })
    const liste = rangliste.listen[0]
    expect(liste?.eintraege[0]?.familie).toBe('billig')
    expect(liste?.eintraege.at(-1)?.familie).toBe(MENSCH_ID)
  })

  test('ein LOKALER Anbieter ohne Verzeichniseintrag erscheint in der Rangliste', async () => {
    // Der Fall, der vorher unsichtbar war: `piper-local` hat keine Basisadresse, steht in keiner
    // `FAMILIEN`-Tabelle — und war damit gar nicht in der Liste.
    const rangliste = baueRangliste({
      familien: [familie('fern', ['entscheiden'])],
      anbieter: [anbieter('fern', ['entscheiden']), anbieter('lokal', ['entscheiden'])],
      katalog: katalog([katalogEintrag('fern', { entscheiden: 'vorhanden' })]),
      tarife: [tarif('fern', 'm', 0.02, 0.02)],
      faehigkeiten: ['entscheiden'],
      jetzt: JETZT,
    })

    const liste = rangliste.listen[0]
    const lokal = liste?.eintraege.find((eintrag) => eintrag.familie === 'lokal')
    expect(lokal).toBeDefined()
    expect(lokal?.imVerzeichnis).toBe(false)
    expect(lokal?.verdrahtet).toBe(true)
    expect(lokal?.funktionalitaet).toBe('unbekannt')
    expect(lokal?.gruende.join(' ')).toContain('NICHT im Verzeichnis')

    // Gemessen schlägt ungemessen: der entfernte Anbieter steht vorn.
    expect(liste?.eintraege[0]?.familie).toBe('fern')
  })

  test('ein lokaler Anbieter wird auch GEWÄHLT, wenn er der einzige ist', async () => {
    const rangliste = baueRangliste({
      familien: [],
      anbieter: [anbieter('lokal', ['entscheiden'])],
      faehigkeiten: ['entscheiden'],
      jetzt: JETZT,
    })
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('lokal', ['entscheiden']))

    const wahl = await waehle({ registratur, rangliste, faehigkeit: 'entscheiden' })
    expect(wahl.anbieter.id).toBe('lokal')
    expect(wahl.eintrag?.imVerzeichnis).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Anzeigen ohne zu fragen
// ---------------------------------------------------------------------------

describe('Anzeigen ohne zu fragen', () => {
  test('moeglichkeiten() fragt KEINEN Anbieter — und liefert die Rangfolge', () => {
    // Eigene Kennungen, damit der Zähler nicht von früheren Tests belastet ist.
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('m-teuer', ['entscheiden']))
    registratur.anbieten(anbieter('m-billig', ['entscheiden']))

    const eigene = baueRangliste({
      familien: [familie('m-teuer', ['entscheiden']), familie('m-billig', ['entscheiden'])],
      anbieter: [anbieter('m-teuer', ['entscheiden']), anbieter('m-billig', ['entscheiden'])],
      katalog: katalog([
        katalogEintrag('m-teuer', { entscheiden: 'vorhanden' }),
        katalogEintrag('m-billig', { entscheiden: 'vorhanden' }),
      ]),
      tarife: [tarif('m-teuer', 'm', 5, 5), tarif('m-billig', 'm', 0.02, 0.02)],
      faehigkeiten: ['entscheiden'],
      jetzt: JETZT,
    })

    const liste = moeglichkeiten(registratur, eigene, 'entscheiden')
    expect(liste.map((m) => m.eintrag.familie)).toEqual(['m-billig', 'm-teuer'])
    expect(liste.every((m) => m.anbieter !== undefined)).toBe(true)
    // **Der Kern:** keine `bereit()`-Abfrage. Eine Liste, die beim Aufbau Schlüssel prüft, wäre
    // langsam und überraschend.
    expect(gezaehlt('m-billig')).toBe(0)
    expect(gezaehlt('m-teuer')).toBe(0)
  })

  test('ohne Umsetzung bleibt `anbieter` weg — der Eintrag bleibt sichtbar', () => {
    const registratur = new Faehigkeiten()
    registratur.anbieten(anbieter('teuer', ['entscheiden']))
    const liste = moeglichkeiten(registratur, rangfolge(), 'entscheiden')
    const billig = liste.find((m) => m.eintrag.familie === 'billig')
    expect(billig?.anbieter).toBeUndefined()
    expect(billig?.eintrag.rang).toBe(1)
  })

  test('ohne Liste für die Fähigkeit kommt eine leere Liste, kein Wurf', () => {
    const registratur = new Faehigkeiten()
    expect(moeglichkeiten(registratur, rangfolge(), 'bild')).toEqual([])
  })
})
