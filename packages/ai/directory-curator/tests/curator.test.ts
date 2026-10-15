/**
 * Der Verwalter — **rein** geprüft: kein Netz, kein Modell, kein Dateisystem.
 *
 * ## Die drei Sätze, die dieser Code tragen
 *
 * 1. **Bei einem Fund wird das Modell GAR NICHT gefragt.** Eine fremde Antwort kann alles
 *    enthalten — auch einen Schlüssel aus einer Fehlermeldung. Sie zu einem Modell zu schicken
 *    hieße, sie hinauszuschicken. Der Ausleger hätte dann das Leck verursacht, das er nicht sieht.
 * 2. **Ein Aussetzer löscht keinen Eintrag.** Ein Dienst, der nicht antwortet, hat nichts
 *    widerlegt. Wissen wegen eines Netzfehlers wegzuwerfen wäre der teuerste Fehler hier.
 * 3. **Eine unsichere Auslegung wird NICHT zur Tatsache.** Sie bleibt offen, mit dem Grund — sonst
 *    stünde sie danach im Katalog wie eine Messung.
 *
 * ## Was diese Datei NICHT beweist
 *
 * Daß die Sonde richtig mißt (das steht in `@prometheus-harness/provider-directory`) und daß ein echtes
 * Modell richtig auslegt. Hier antworten Attrappen mit **vorgegebenen** Werten.
 */

import { describe, expect, test } from 'bun:test'
import { FAEHIGKEITEN, type Entscheider, type EntscheidungsEingabe, type Urteil } from '@prometheus-harness/capabilities'
import { waechter } from '@prometheus-harness/guard'
import type { Familie, Sondebefund } from '@prometheus-harness/provider-directory'
import {
  KatalogFehler,
  LEER,
  TAKT_TAG,
  auslegeSchema,
  eintragAus,
  eintragFuer,
  istFrisch,
  legeAus,
  leseKatalog,
  mitEintrag,
  schreibeKatalog,
  sollLaufen,
  verwalte,
  messbar,
  pruefeAuslegung,
  type Katalogeintrag,
} from '../src/index.ts'

/** Die Schwellen für die Prüfungen. */
const STUFEN = { automatisch: 0.9, rueckfrage: 0.5 }

/**
 * Führt etwas aus, das werfen soll, und gibt den Fehler zurück.
 *
 * @param tu - was ausgeführt wird
 * @returns der Fehler
 * @throws Error - wenn nichts geworfen wurde
 */
function fange(tu: () => unknown): unknown {
  try {
    tu()
  } catch (fehler: unknown) {
    return fehler
  }
  throw new Error('Es wurde nichts geworfen — diese Prüfung erwartet einen Fehler.')
}

/**
 * Eine Familie für die Prüfung.
 *
 * @param id - die Kennung
 * @returns die Familie
 */
function familie(id: string, name = id.toUpperCase()): Familie {
  return {
    id,
    name,
    basis: `http://127.0.0.1:1/${id}`,
    kopf: (s) => ({ authorization: `Bearer ${s}` }),
    modellWeg: '/models',
    wege: {},
    stand: 'Prüfung',
  }
}

/**
 * Ein Sondenbefund für die Prüfung.
 *
 * @param id - die Kennung der Familie
 * @param modelle - die Kennungen
 * @returns der Befund
 */
function befund(id: string, modelle: readonly string[] = ['ein-modell']): Sondebefund {
  return {
    familie: id,
    modelle,
    wege: { gespraech: 'vorhanden', einbetten: 'fehlt' },
    modelleErreichbar: true,
    bemerkung: 'Prüfung',
  }
}

/** Ein Zeitpunkt für die Prüfungen. */
const JETZT = new Date('2026-10-15T12:00:00.000Z')

/**
 * Ein Entscheider, der **vorgegebene** Werte liefert — und zählt, ob er gefragt wurde.
 *
 * @param antwort - je Fähigkeit ein Wahrheitswert, dazu die Sicherheit
 * @returns der Entscheider und der Zähler
 */
function attrappe(antwort: {
  readonly wahr?: readonly string[]
  readonly sicherheit: number
}): Entscheider & { readonly gefragt: () => number } {
  let gefragt = 0
  const entscheider: Entscheider = {
    async entscheide<T>(_eingabe: EntscheidungsEingabe<T>): Promise<Urteil<T>> {
      gefragt += 1
      const wert: Record<string, unknown> = { sicherheit: antwort.sicherheit }
      for (const faehigkeit of FAEHIGKEITEN) wert[faehigkeit] = (antwort.wahr ?? []).includes(faehigkeit)
      return {
        wert: wert as T,
        herkunft: { anbieter: 'deepseek', modell: 'deepseek-flash' },
      }
    },
  }
  return Object.assign(entscheider, { gefragt: () => gefragt })
}

// ---------------------------------------------------------------------------
// 1. Wann läuft er?
// ---------------------------------------------------------------------------

describe('Der Anlass', () => {
  const frisch: Katalogeintrag = {
    familie: 'x',
    geprueftAm: '2026-10-15T11:00:00.000Z',
    modelleErreichbar: true,
    modelle: [],
    wege: {},
    bemerkung: '',
  }

  test('start, fehlender Schlüssel und von Hand laufen IMMER', () => {
    for (const anlass of ['start', 'schluessel-fehlt', 'von-hand'] as const) {
      expect({ anlass, laeuft: sollLaufen(anlass, frisch, JETZT) }).toEqual({ anlass, laeuft: true })
    }
  })

  test('der Zeitplan läuft nur, wenn der Eintrag NICHT mehr frisch ist', () => {
    // Frisch: vor einer Stunde geprüft, Frist ein Tag.
    expect(sollLaufen('zeitplan', frisch, JETZT, TAKT_TAG)).toBe(false)
    // Alt: vor zwei Tagen geprüft.
    const alt = { ...frisch, geprueftAm: '2026-10-13T11:00:00.000Z' }
    expect(sollLaufen('zeitplan', alt, JETZT, TAKT_TAG)).toBe(true)
  })

  test('OHNE Eintrag ist der Zeitplan immer fällig — wer nichts weiß, muß messen', () => {
    expect(sollLaufen('zeitplan', undefined, JETZT, TAKT_TAG)).toBe(true)
  })

  test('ein unlesbares Datum gilt als NICHT frisch', () => {
    // Lieber einmal zu viel messen als eine Auskunft für gültig halten, deren Datum niemand lesen
    // kann.
    const kaputt = { ...frisch, geprueftAm: 'irgendwann' }
    expect(istFrisch(kaputt, JETZT, TAKT_TAG)).toBe(false)
    expect(sollLaufen('zeitplan', kaputt, JETZT, TAKT_TAG)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. Der Katalog
// ---------------------------------------------------------------------------

describe('Der Katalog', () => {
  test('leer hin und zurück', () => {
    expect(leseKatalog(schreibeKatalog(LEER))).toEqual(LEER)
  })

  test('mit einem Eintrag hin und zurück', () => {
    const katalog = mitEintrag(LEER, eintragAus('zai', befund('zai', ['a', 'b']), JETZT))
    expect(leseKatalog(schreibeKatalog(katalog))).toEqual(katalog)
  })

  test('dieselbe Eingabe ergibt DENSELBEN Text', () => {
    const a = mitEintrag(mitEintrag(LEER, eintragAus('zai', befund('zai'), JETZT)), eintragAus('a', befund('a'), JETZT))
    const b = mitEintrag(mitEintrag(LEER, eintragAus('a', befund('a'), JETZT)), eintragAus('zai', befund('zai'), JETZT))
    expect(schreibeKatalog(a)).toBe(schreibeKatalog(b))
  })

  test('eine unbekannte Fassung wird abgelehnt', () => {
    const fehler = fange(() => leseKatalog(JSON.stringify({ fassung: 9, eintraege: {} })))
    expect(fehler).toBeInstanceOf(KatalogFehler)
    expect((fehler as KatalogFehler).maengel.join(' ')).toContain('9')
  })

  test('ein unbekanntes Feld wird abgelehnt', () => {
    const fehler = fange(() => leseKatalog(JSON.stringify({ fassung: 1, eintraege: {}, neu: 1 })))
    expect((fehler as KatalogFehler).maengel.join(' ')).toContain('neu')
  })

  test('NUR die drei Befunde zählen — ein beliebiger Text sieht sonst wie eine Auskunft aus', () => {
    const fehler = fange(() =>
      leseKatalog(
        JSON.stringify({
          fassung: 1,
          eintraege: {
            x: {
              familie: 'x',
              geprueftAm: JETZT.toISOString(),
              modelleErreichbar: true,
              modelle: [],
              wege: { einbetten: 'vielleicht' },
              bemerkung: '',
            },
          },
        }),
      ),
    )
    expect((fehler as KatalogFehler).maengel.join(' ')).toContain('kein Befund')
  })

  test('ein Eintrag unter falschem Namen wird abgelehnt', () => {
    const fehler = fange(() =>
      leseKatalog(
        JSON.stringify({
          fassung: 1,
          eintraege: {
            x: {
              familie: 'y',
              geprueftAm: JETZT.toISOString(),
              modelleErreichbar: true,
              modelle: [],
              wege: {},
              bemerkung: '',
            },
          },
        }),
      ),
    )
    expect((fehler as KatalogFehler).maengel.join(' ')).toContain('familie')
  })

  test('ein unlesbares Prüfdatum wird abgelehnt', () => {
    const fehler = fange(() =>
      leseKatalog(
        JSON.stringify({
          fassung: 1,
          eintraege: {
            x: { familie: 'x', geprueftAm: 'irgendwann', modelleErreichbar: true, modelle: [], wege: {}, bemerkung: '' },
          },
        }),
      ),
    )
    expect((fehler as KatalogFehler).maengel.join(' ')).toContain('Zeitpunkt')
  })

  test('mitWahl läßt den alten Katalog in Ruhe', () => {
    const neu = mitEintrag(LEER, eintragAus('a', befund('a'), JETZT))
    expect(LEER.eintraege).toEqual({})
    expect(eintragFuer(neu, 'a')?.familie).toBe('a')
    expect(eintragFuer(neu, 'b')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 3. Der Ausleger
// ---------------------------------------------------------------------------

describe('Der Ausleger', () => {
  test('das Schema kennt JEDE Fähigkeit — aus der Liste, nicht handgeschrieben', () => {
    const schema = auslegeSchema()
    for (const faehigkeit of FAEHIGKEITEN) {
      expect({ faehigkeit, da: Object.hasOwn(schema.felder, faehigkeit) }).toEqual({ faehigkeit, da: true })
    }
    // Dazu die Sicherheit — die wird VERLANGT, nicht erhofft.
    expect(schema.felder.sicherheit).toEqual({ art: 'zahl' })
  })

  test('DER WICHTIGSTE FALL: bei einem Fund des Wächters wird das Modell GAR NICHT gefragt', async () => {
    // Diese Attrappe wirft, wenn sie gefragt wird. Käme ein Aufruf, wäre der Test rot — und das
    // ist der Zweck: die fremde Antwort hätte das Haus verlassen.
    const a: Entscheider = {
      async entscheide<T>(_e: EntscheidungsEingabe<T>): Promise<Urteil<T>> {
        throw new Error('Die fremde Antwort hätte das Haus verlassen — hier darf nichts gefragt werden.')
      },
    }
    const w = waechter({
      bekannteWerte: () => [{ name: 'TESTWERT', wert: 'geheim-abcdefghijkl' }],
    })
    const ergebnis = await legeAus({
      familie: 'x',
      dienst: 'Prüfdienst',
      modelle: ['modell-geheim-abcdefghijkl-1', 'harmlos'],
      wege: { gespraech: 'vorhanden' },
      entscheider: a,
      stufen: STUFEN,
      waechter: w,
    })
    expect(ergebnis.angenommen).toBe(false)
    expect(ergebnis.wegen).toContain('KEIN Modell gefragt')
    // Und der Wert steht NICHT in der Meldung.
    expect(ergebnis.wegen).not.toContain('geheim-abcdefghijkl')
  })

  test('eine leere Modellliste wird nicht ausgelegt — es gibt nichts auszulegen', async () => {
    const a = attrappe({ sicherheit: 0.99 })
    const ergebnis = await legeAus({
      familie: 'x',
      dienst: 'Prüfdienst',
      modelle: [],
      wege: { gespraech: 'vorhanden' },
      entscheider: a,
      stufen: STUFEN,
      waechter: waechter(),
    })
    expect(ergebnis.angenommen).toBe(false)
    expect(ergebnis.wegen).toContain('KEINE Kennung')
    expect(a.gefragt()).toBe(0)
  })

  test('hohe Sicherheit: die Auslegung wird übernommen — WENN die Messung sie trägt', async () => {
    // **Nachgezogen am 15.10.2026.** Diese Prüfung gab dem Ausleger vorher **keine** gemessenen
    // Wege (`wege: {}`) und verlangte trotzdem, daß seine Behauptung angenommen wird. Genau das
    // ist die Lücke, durch die ZenMux mit sechs erfundenen Fähigkeiten in den Katalog kam. Jetzt
    // müssen die Wege gemessen sein — sonst ist die Behauptung unbelegt.
    const a = attrappe({ wahr: ['gespraech', 'einbetten'], sicherheit: 0.97 })
    const ergebnis = await legeAus({
      familie: 'x',
      dienst: 'Prüfdienst',
      modelle: ['a', 'b'],
      wege: { gespraech: 'vorhanden', einbetten: 'vorhanden' },
      entscheider: a,
      stufen: STUFEN,
      waechter: waechter(),
    })
    expect(ergebnis.angenommen).toBe(true)
    expect(ergebnis.faehigkeiten).toEqual(['gespraech', 'einbetten'])
    expect(ergebnis.sicherheit).toBe(0.97)
    expect(ergebnis.herkunft?.modell).toBe('deepseek-flash')
  })

  test('dieselbe Behauptung OHNE Meßwert wird gar nicht erst gefragt — der Ausleger WIRFT', async () => {
    // **Nachgezogen am 15.10.2026 auf Einwurf des Betreibers:** „man sollte immer messen,
    // faktenbasiert." Vorher lief eine Auslegung ganz ohne Messung durch und wurde erst beim
    // Auswerten abgelehnt — zu nachsichtig. Wer nichts gemessen hat, darf **gar nicht** fragen:
    // `wege: {}` kann im echten Ablauf nicht vorkommen, die Sonde prüft immer alle sechs Wege.
    const a = attrappe({ wahr: ['gespraech'], sicherheit: 0.97 })
    const fehler = await legeAus({
      familie: 'x',
      dienst: 'Prüfdienst',
      modelle: ['a'],
      // **Nichts gemessen** — der Fall, der im echten Ablauf nicht vorkommen kann.
      wege: {},
      entscheider: a,
      stufen: STUFEN,
      waechter: waechter(),
    }).catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(Error)
    expect((fehler as Error).message).toContain('OHNE MESSUNG')
    // Und es wurde auch niemand gefragt — der Fehler kommt VOR dem Aufruf.
    expect(a.gefragt()).toBe(0)
  })

  test('sechs ergebnislose Messungen sind KEIN Meßwert', async () => {
    // Der echte Fall (ZenMux): geprüft wurde, aber jedes Tor war zu. `unbekannt` ist ein Befund —
    // aber kein Meßwert, an dem eine Auslegung sich halten könnte.
    expect(messbar({ einbetten: 'unbekannt' })).toBe(false)
    expect(messbar({ einbetten: 'vorhanden' })).toBe(true)
    expect(messbar({ einbetten: 'fehlt' })).toBe(true)
    expect(messbar({})).toBe(false)
  })

  test('mittlere Sicherheit: NICHT übernommen — und der Grund steht da', async () => {
    const a = attrappe({ wahr: ['gespraech'], sicherheit: 0.7 })
    const ergebnis = await legeAus({
      familie: 'x',
      dienst: 'Prüfdienst',
      modelle: ['a'],
      wege: { gespraech: 'vorhanden' },
      entscheider: a,
      stufen: STUFEN,
      waechter: waechter(),
    })
    expect(ergebnis.angenommen).toBe(false)
    expect(ergebnis.faehigkeiten).toBeUndefined()
    expect(ergebnis.wegen).toContain('unsicher')
  })

  test('keine Sicherheit: zum Menschen — nicht übernommen', async () => {
    const a = attrappe({ wahr: ['gespraech'], sicherheit: Number.NaN })
    const ergebnis = await legeAus({
      familie: 'x',
      dienst: 'Prüfdienst',
      modelle: ['a'],
      wege: { gespraech: 'vorhanden' },
      entscheider: a,
      stufen: STUFEN,
      waechter: waechter(),
    })
    expect(ergebnis.angenommen).toBe(false)
    expect(ergebnis.wegen).toContain('zu unsicher')
  })

  test('eine sichere Auslegung OHNE Fähigkeiten wird übernommen — als leere Liste', async () => {
    // „Dieser Dienst kann nichts davon" ist eine gültige, sichere Auskunft — und etwas anderes als
    // „ich weiß es nicht".
    const a = attrappe({ wahr: [], sicherheit: 0.99 })
    const ergebnis = await legeAus({
      familie: 'x',
      dienst: 'Prüfdienst',
      modelle: ['a'],
      // Gemessen — und der Dienst hat den Weg **nicht**. „Nichts davon" ist damit gedeckt.
      wege: { einbetten: 'fehlt' },
      entscheider: a,
      stufen: STUFEN,
      waechter: waechter(),
    })
    expect(ergebnis.angenommen).toBe(true)
    expect(ergebnis.faehigkeiten).toEqual([])
    expect(ergebnis.wegen).toContain('KEINE der bekannten')
  })
})

// ---------------------------------------------------------------------------
// 3b. Der Widerspruch gegen die Messung
// ---------------------------------------------------------------------------

describe('Der Widerspruch gegen die Messung', () => {
  test('die Sonde maß einen Weg, die Auslegung streitet ihn ab — sie ist ENGER als die Messung', () => {
    // **Der Fall aus dem ERSTEN lebenden Lauf:** das Modell sagte für Z.ai „keine der bekannten
    // Fähigkeiten", während die Sonde alle sechs Wege als antwortend gemessen hatte.
    const p = pruefeAuslegung({ einbetten: 'vorhanden' }, [])
    expect(p.engerAlsGemessen).toContain('Einbetten')
    expect(p.widerspruch).toBeUndefined()
    expect(p.nichtBelegt).toBeUndefined()
  })

  test('die Sonde maß 404, die Auslegung behauptet den Weg — WIDERSPRUCH', () => {
    const p = pruefeAuslegung({ 'text-zu-sprache': 'fehlt' }, ['text-zu-sprache'])
    expect(p.widerspruch).toContain('404')
    expect(p.nichtBelegt).toBeUndefined()
  })

  test('`unbekannt` widerspricht nichts — aber es BELEGT auch nichts', () => {
    // Der ZenMux-Fall: auf jeden POST 403, also kein Befund. Eine Behauptung steht dann auf nichts.
    const p = pruefeAuslegung({ einbetten: 'unbekannt' }, ['einbetten'])
    expect(p.widerspruch).toBeUndefined()
    expect(p.nichtBelegt).toContain('Einbetten')
  })

  test('eine Behauptung ohne jeden Befund ist ebenso unbelegt', () => {
    const p = pruefeAuslegung({}, ['einbetten'])
    expect(p.nichtBelegt).toContain('Einbetten')
  })

  test('wo beide einig sind, gibt es nichts zu beanstanden', () => {
    expect(pruefeAuslegung({ einbetten: 'vorhanden' }, ['einbetten'])).toEqual({})
    expect(pruefeAuslegung({ einbetten: 'fehlt' }, [])).toEqual({})
    expect(pruefeAuslegung({}, [])).toEqual({})
  })

  test('DER FALL AUS DEM LEBENDEN LAUF: Z.ai — sechs Wege antworten, die Auslegung sagt „keine"', async () => {
    // Gemessen am 15.10.2026: die Sonde fand für Z.ai alle sechs Wege als antwortend, und das
    // Modell legte mit Sicherheit **0,93** fest, der Dienst biete „keine der bekannten
    // Fähigkeiten". Diese Prüfung ist der Fall, der damals durchging.
    const a = attrappe({ wahr: [], sicherheit: 0.93 })
    const wege = {
      gespraech: 'vorhanden',
      entscheiden: 'vorhanden',
      'text-zu-sprache': 'vorhanden',
      'sprache-zu-text': 'vorhanden',
      einbetten: 'vorhanden',
      bild: 'vorhanden',
    } as const

    const ergebnis = await legeAus({
      familie: 'zai',
      dienst: 'Z.ai',
      modelle: ['glm-4.6'],
      wege,
      entscheider: a,
      stufen: STUFEN,
      waechter: waechter(),
    })

    // **Hohe Sicherheit schützt nicht.** 0,93 lag über jeder Schwelle — und die Antwort war falsch.
    expect(ergebnis.angenommen).toBe(false)
    expect(ergebnis.faehigkeiten).toBeUndefined()
    expect(ergebnis.engerAlsGemessen).toBeDefined()
    expect(ergebnis.wegen).toContain('ENGER als die Messung')
    expect(ergebnis.sicherheit).toBe(0.93)
  })

  test('DER ZWEITE FALL: ZenMux — kein Weg meßbar, die Auslegung behauptet alle sechs', async () => {
    // Gemessen am 15.10.2026 im vierten Lauf: ZenMux gibt auf jeden POST 403, alles war
    // `unbekannt` — und `granite-4.0-h-micro` behauptete mit 0,95 alle sechs Fähigkeiten. Das
    // wurde ANGENOMMEN, weil `unbekannt` nichts widerspricht. Genau diese Lücke schließt die
    // Prüfung.
    const a = attrappe({ wahr: ['gespraech', 'entscheiden', 'text-zu-sprache', 'sprache-zu-text', 'einbetten', 'bild'], sicherheit: 0.95 })
    const wege = {
      gespraech: 'unbekannt',
      entscheiden: 'unbekannt',
      'text-zu-sprache': 'unbekannt',
      'sprache-zu-text': 'unbekannt',
      einbetten: 'unbekannt',
      bild: 'unbekannt',
    } as const

    const ergebnis = await legeAus({
      familie: 'zenmux',
      dienst: 'ZenMux',
      modelle: ['ein-modell'],
      wege,
      entscheider: a,
      stufen: STUFEN,
      waechter: waechter(),
    })
    expect(ergebnis.angenommen).toBe(false)
    expect(ergebnis.nichtBelegt).toBeDefined()
    expect(ergebnis.wegen).toContain('mehr, als gemessen ist')
  })

  test('ein Widerspruch entsteht NICHT, wenn die Auslegung den gemessenen Weg nennt', async () => {
    const a = attrappe({ wahr: ['einbetten'], sicherheit: 0.99 })
    const ergebnis = await legeAus({
      familie: 'x',
      dienst: 'Prüfdienst',
      modelle: ['a'],
      wege: { einbetten: 'vorhanden', 'text-zu-sprache': 'fehlt' },
      entscheider: a,
      stufen: STUFEN,
      waechter: waechter(),
    })
    expect(ergebnis.widerspruch).toBeUndefined()
    expect(ergebnis.nichtBelegt).toBeUndefined()
    expect(ergebnis.engerAlsGemessen).toBeUndefined()
    expect(ergebnis.angenommen).toBe(true)
    expect(ergebnis.faehigkeiten).toEqual(['einbetten'])
  })

  test('die gemessenen Wege gehen in den Text an das Modell ein', async () => {
    // Ohne sie beurteilt der Ausleger ins Leere — das war der Befund des ersten Laufs.
    let gesehen = ''
    const a: Entscheider = {
      async entscheide<T>(eingabe: EntscheidungsEingabe<T>): Promise<Urteil<T>> {
        gesehen = JSON.stringify(eingabe.lage)
        return {
          wert: { sicherheit: 0.99, gespraech: true } as unknown as T,
          herkunft: { anbieter: 'deepseek', modell: 'deepseek-flash' },
        }
      },
    }
    await legeAus({
      familie: 'x',
      dienst: 'Prüfdienst',
      modelle: ['a'],
      wege: { gespraech: 'vorhanden' },
      entscheider: a,
      stufen: STUFEN,
      waechter: waechter(),
    })
    expect(gesehen).toContain('kennungen')
  })

  test('der Verwalter schreibt den WIDERSPRUCH in den Katalog, nicht die Auslegung', async () => {
    const lauf = await verwalte(LEER, {
      familien: [familie('a')],
      sonde: async (f) => befund(f.id, ['x']),
      ausleger: async () => ({
        angenommen: false,
        sicherheit: 0.93,
        widerspruch: '„Einbetten": der Weg antwortet, die Auslegung sagt „gibt es nicht"',
        wegen: 'NICHT übernommen: die Auslegung widerspricht der MESSUNG.',
      }),
      jetzt: () => JETZT,
      anlass: 'start',
    })
    const eintrag = eintragFuer(lauf.katalog, 'a')
    expect(eintrag?.auslegung).toBeUndefined()
    expect(eintrag?.widerspruch).toContain('Einbetten')
    expect(eintrag?.auslegungOffen).toContain('MESSUNG')
  })

  test('ein Widerspruch überlebt den Weg durch die Datei', async () => {
    const lauf = await verwalte(LEER, {
      familien: [familie('a')],
      sonde: async (f) => befund(f.id, ['x']),
      ausleger: async () => ({ angenommen: false, widerspruch: 'hier stimmt etwas nicht', wegen: 'x' }),
      jetzt: () => JETZT,
      anlass: 'start',
    })
    expect(leseKatalog(schreibeKatalog(lauf.katalog))).toEqual(lauf.katalog)
    expect(eintragFuer(leseKatalog(schreibeKatalog(lauf.katalog)), 'a')?.widerspruch).toBe(
      'hier stimmt etwas nicht',
    )
  })
})

// ---------------------------------------------------------------------------
// 4. Der Lauf
// ---------------------------------------------------------------------------

describe('Der Verwalterlauf', () => {
  test('prüft alle Familien und füllt den Katalog', async () => {
    const lauf = await verwalte(LEER, {
      familien: [familie('a'), familie('b')],
      sonde: async (f) => befund(f.id),
      jetzt: () => JETZT,
      anlass: 'start',
    })
    expect(lauf.geprueft).toEqual(['a', 'b'])
    expect(Object.keys(lauf.katalog.eintraege).sort()).toEqual(['a', 'b'])
    expect(lauf.bericht.join('\n')).toContain('2 geprüft')
  })

  test('ein Aussetzer LÖSCHT den alten Eintrag nicht', async () => {
    // **Der teuerste Fehler, den dieser Code machen könnte.** Ein Dienst, der nicht antwortet, hat
    // nichts widerlegt.
    const alt = mitEintrag(LEER, eintragAus('a', befund('a', ['altes-modell']), new Date('2026-10-01T00:00:00Z')))
    const lauf = await verwalte(alt, {
      familien: [familie('a')],
      sonde: async () => {
        throw new Error('nicht erreichbar')
      },
      jetzt: () => JETZT,
      anlass: 'start',
    })
    expect(lauf.gescheitert).toEqual(['a'])
    expect(eintragFuer(lauf.katalog, 'a')?.modelle).toEqual(['altes-modell'])
    expect(eintragFuer(lauf.katalog, 'a')?.geprueftAm).toBe('2026-10-01T00:00:00.000Z')
    expect(lauf.bericht.join('\n')).toContain('widerlegt nichts')
  })

  test('ein Aussetzer ohne alten Eintrag bleibt ohne Eintrag', async () => {
    const lauf = await verwalte(LEER, {
      familien: [familie('neu')],
      sonde: async () => {
        throw new Error('nicht erreichbar')
      },
      jetzt: () => JETZT,
      anlass: 'start',
    })
    expect(eintragFuer(lauf.katalog, 'neu')).toBeUndefined()
    expect(lauf.bericht.join('\n')).toContain('noch keinen Eintrag')
  })

  test('frische Einträge werden beim Zeitplan übersprungen', async () => {
    const frisch = mitEintrag(LEER, eintragAus('a', befund('a'), new Date('2026-10-15T11:00:00Z')))
    let gefragt = 0
    const lauf = await verwalte(frisch, {
      familien: [familie('a')],
      sonde: async (f) => {
        gefragt += 1
        return befund(f.id)
      },
      jetzt: () => JETZT,
      anlass: 'zeitplan',
    })
    expect(gefragt).toBe(0)
    expect(lauf.uebersprungen).toEqual(['a'])
    expect(lauf.geprueft).toEqual([])
  })

  test('der Ausleger wird nur gefragt, wenn es Kennungen gibt', async () => {
    let auslegungen = 0
    const lauf = await verwalte(LEER, {
      familien: [familie('mit'), familie('ohne')],
      sonde: async (f) => (f.id === 'ohne' ? befund('ohne', []) : befund('mit', ['x'])),
      ausleger: async () => {
        auslegungen += 1
        return { angenommen: true, faehigkeiten: ['gespraech'], sicherheit: 0.95, wegen: 'ok' }
      },
      jetzt: () => JETZT,
      anlass: 'start',
    })
    expect(auslegungen).toBe(1)
    expect(eintragFuer(lauf.katalog, 'mit')?.auslegung?.faehigkeiten).toEqual(['gespraech'])
    expect(eintragFuer(lauf.katalog, 'mit')?.auslegungOffen).toBeUndefined()
    expect(eintragFuer(lauf.katalog, 'ohne')?.auslegung).toBeUndefined()
    expect(eintragFuer(lauf.katalog, 'ohne')?.auslegungOffen).toContain('keine Kennung')
  })

  test('eine ABGELEHNTE Auslegung wird als OFFEN festgehalten, nicht als Tatsache', async () => {
    const lauf = await verwalte(LEER, {
      familien: [familie('a')],
      sonde: async (f) => befund(f.id, ['x']),
      ausleger: async () => ({
        angenommen: false,
        sicherheit: 0.6,
        wegen: 'Nicht übernommen: unsicher (Sicherheit 0.60).',
      }),
      jetzt: () => JETZT,
      anlass: 'start',
    })
    const eintrag = eintragFuer(lauf.katalog, 'a')
    expect(eintrag?.auslegung).toBeUndefined()
    expect(eintrag?.auslegungOffen).toContain('unsicher')
    // Und der Grund steht im Bericht — wer ihn liest, soll nicht raten müssen.
    expect(lauf.bericht.join('\n')).toContain('unsicher')
  })

  test('ein SCHEITERNDER Ausleger reißt den Lauf nicht mit', async () => {
    const lauf = await verwalte(LEER, {
      familien: [familie('a'), familie('b')],
      sonde: async (f) => befund(f.id, ['x']),
      ausleger: async (f) => {
        if (f.id === 'a') throw new Error('Modell nicht erreichbar')
        return { angenommen: true, faehigkeiten: [], sicherheit: 0.99, wegen: 'ok' }
      },
      jetzt: () => JETZT,
      anlass: 'start',
    })
    expect(lauf.geprueft).toEqual(['a', 'b'])
    expect(eintragFuer(lauf.katalog, 'a')?.auslegungOffen).toContain('scheiterte')
    expect(eintragFuer(lauf.katalog, 'b')?.auslegung?.faehigkeiten).toEqual([])
  })

  test('ohne Ausleger gibt es keinen Auslegungseintrag — aber auch keinen offenen Grund', async () => {
    // Wer nicht auslegt, hat nichts offen gelassen. Ein „offen" ohne Versuch wäre irreführend.
    const lauf = await verwalte(LEER, {
      familien: [familie('a')],
      sonde: async (f) => befund(f.id, ['x']),
      jetzt: () => JETZT,
      anlass: 'start',
    })
    const eintrag = eintragFuer(lauf.katalog, 'a')
    expect(eintrag?.auslegung).toBeUndefined()
    expect(eintrag?.auslegungOffen).toBeUndefined()
  })

  test('der Katalog eines Laufs läßt sich schreiben und wieder lesen', async () => {
    const lauf = await verwalte(LEER, {
      familien: [familie('a')],
      sonde: async (f) => befund(f.id),
      jetzt: () => JETZT,
      anlass: 'start',
    })
    expect(leseKatalog(schreibeKatalog(lauf.katalog))).toEqual(lauf.katalog)
  })
})
