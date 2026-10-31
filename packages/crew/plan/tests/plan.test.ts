/**
 * Der Planungskern: Zerlegung, Wellen, Ausführung, Rollenwahl.
 *
 * Drei Eigenschaften werden hier festgenagelt:
 * **eine unbrauchbare Antwort beendet keinen Lauf** (sie wird ein Ein-Schritt-Plan),
 * **ein Ring hält nichts an** (die übrigen Schritte laufen einzeln), und
 * **jeder Schritt geht an seine eigene Rolle** — das ist die Stelle, an der aus „starkes Modell
 * oder Bildmodell oder Browser-Suche" ein Ablauf wird.
 */

import { describe, expect, test } from 'bun:test'

import {
  fuehreAus,
  routen,
  wellen,
  zerlegePlan,
  type PlanSchritt,
  type Rollenaufruf,
  type RufeRolle,
} from '../src/index.ts'

describe('Rollenwahl', () => {
  test('ein Bild geht an die Bildrolle, wenn eine gebunden ist', () => {
    expect(routen({ bild: true, gebunden: ['vision', 'executor'] })).toBe('vision')
  })

  test('ohne Bildrolle geht ein Bild an den Executor — nicht an eine leere Rolle', () => {
    expect(routen({ bild: true, gebunden: ['executor'] })).toBe('executor')
  })

  test('Text geht an den Executor, ersatzweise an den Planer', () => {
    expect(routen({ bild: false, gebunden: ['planner', 'executor'] })).toBe('executor')
    expect(routen({ bild: false, gebunden: ['planner'] })).toBe('planner')
  })

  test('ohne passende Rolle wird geworfen statt geraten', () => {
    expect(() => routen({ bild: false, gebunden: ['vision'] })).toThrow(/executor/)
    expect(() => routen({ bild: true, gebunden: ['helper'] })).toThrow(/Bildrolle/)
  })
})

describe('Zerlegung', () => {
  test('JSON mit Abhängigkeiten und Rollen wird gelesen', () => {
    const plan = zerlegePlan(
      JSON.stringify({
        steps: [
          { id: 'a', instruction: 'Recherche', role: 'search' },
          { id: 'b', instruction: 'Umsetzen', dependsOn: ['a'], role: 'executor' },
        ],
      }),
      'Ziel',
    )
    expect(plan).toEqual([
      { id: 'a', auftrag: 'Recherche', abhaengigVon: [], rolle: 'search' },
      { id: 'b', auftrag: 'Umsetzen', abhaengigVon: ['a'], rolle: 'executor' },
    ])
  })

  test('ein Satz um das JSON herum macht die Antwort nicht unbrauchbar', () => {
    const plan = zerlegePlan('Hier ist der Plan:\n{"steps":[{"instruction":"eins"}]}\nViel Erfolg!', 'Ziel')
    expect(plan).toHaveLength(1)
    expect(plan[0]?.auftrag).toBe('eins')
  })

  test('Prosa wird ein Ein-Schritt-Plan — kein Fehler', () => {
    const plan = zerlegePlan('Ich wuerde zuerst lesen und dann schreiben.', 'Ziel')
    expect(plan).toHaveLength(1)
    expect(plan[0]?.auftrag).toBe('Ich wuerde zuerst lesen und dann schreiben.')
    expect(plan[0]?.rolle).toBe('executor')
  })

  test('eine leere Antwort wird das Ziel', () => {
    const plan = zerlegePlan('   ', 'Das Ziel')
    expect(plan).toEqual([{ id: 't1', auftrag: 'Das Ziel', abhaengigVon: [], rolle: 'executor' }])
  })

  test('doppelte Kennungen werden eindeutig, unbekannte Vorbedingungen fallen weg', () => {
    const plan = zerlegePlan(
      JSON.stringify([
        { id: 'x', instruction: 'eins', dependsOn: ['gibt-es-nicht', 'x'] },
        { id: 'x', instruction: 'zwei' },
        { instruction: 'drei' },
      ]),
      'Ziel',
    )
    expect(plan.map((schritt) => schritt.id)).toEqual(['x', 'x-2', 't3'])
    expect(plan[0]?.abhaengigVon).toEqual([])
  })
})

describe('Wellen', () => {
  const schritt = (id: string, abhaengigVon: string[] = []): PlanSchritt => ({
    id,
    auftrag: id,
    abhaengigVon,
    rolle: 'executor',
  })

  test('unabhängige Schritte laufen in einer Welle', () => {
    const plan = wellen([schritt('a'), schritt('b'), schritt('c')])
    expect(plan.map((welle) => welle.map((s) => s.id))).toEqual([['a', 'b', 'c']])
  })

  test('Abhängigkeit ergibt eine zweite Welle', () => {
    const plan = wellen([schritt('a'), schritt('b', ['a']), schritt('c', ['a', 'b'])])
    expect(plan.map((welle) => welle.map((s) => s.id))).toEqual([['a'], ['b'], ['c']])
  })

  test('ein Ring hält den Lauf nicht an — die Reste laufen einzeln', () => {
    const plan = wellen([schritt('a', ['b']), schritt('b', ['a'])])
    expect(plan).toHaveLength(2)
    expect(plan[0]?.map((s) => s.id)).toEqual(['a'])
    expect(plan[1]?.map((s) => s.id)).toEqual(['b'])
  })
})

describe('Ausführung', () => {
  const plan: PlanSchritt[] = [
    { id: 'a', auftrag: 'Recherche', abhaengigVon: [], rolle: 'search' },
    { id: 'b', auftrag: 'Schreiben', abhaengigVon: ['a'], rolle: 'executor' },
  ]

  /** Ein Ruf, der jede Anfrage mitschreibt und feste Antworten gibt. */
  const aufzeichnen = (antworten: (rolle: string, auftrag: string) => string): {
    rufe: RufeRolle
    anfragen: { rolle: string; auftrag: string }[]
  } => {
    const anfragen: { rolle: string; auftrag: string }[] = []
    const rufe: RufeRolle = async (rolle, auftrag): Promise<Rollenaufruf> => {
      anfragen.push({ rolle, auftrag })
      return { text: antworten(rolle, auftrag), tokens: { hinein: 10, heraus: 5 } }
    }
    return { rufe, anfragen }
  }

  test('ein bestandener Lauf endet mit pass und nennt die Token', async () => {
    const { rufe } = aufzeichnen((rolle) =>
      rolle === 'reviewer' ? '{"pass":true}' : `antwort von ${rolle}`,
    )
    const lauf = await fuehreAus({ crew: 'c1', ziel: 'Bauen', plan, rufe })
    expect(lauf.urteil).toBe('pass')
    expect(lauf.versuche).toBe(1)
    expect(lauf.maengel).toEqual([])
    // a, b, reviewer = 3 Anfragen à 10/5
    expect(lauf.tokens).toEqual({ hinein: 30, heraus: 15 })
    expect(lauf.ergebnisse.map((eintrag) => eintrag.id)).toEqual(['a', 'b'])
  })

  test('jeder Schritt geht an seine eigene Rolle — die Suche bekommt die Suche', async () => {
    const { rufe, anfragen } = aufzeichnen(() => '{"pass":true}')
    await fuehreAus({ crew: 'c1', ziel: 'Bauen', plan, rufe })
    expect(anfragen.map((eintrag) => eintrag.rolle)).toEqual(['search', 'executor', 'reviewer'])
  })

  test('ein Mangel führt zu einer zweiten Runde — dieselbe Tabelle, mit dem Mangel im Auftrag', async () => {
    let runde = 0
    const { rufe, anfragen } = aufzeichnen((rolle) => {
      if (rolle !== 'reviewer') return 'arbeit'
      runde += 1
      return runde === 1 ? '{"pass":false,"maengel":["Titel fehlt"]}' : '{"pass":true}'
    })
    const lauf = await fuehreAus({ crew: 'c1', ziel: 'Bauen', plan, rufe })
    expect(lauf.urteil).toBe('pass')
    expect(lauf.versuche).toBe(2)
    const zweiter = anfragen.filter((eintrag) => eintrag.rolle === 'executor')[1]
    expect(zweiter?.auftrag).toContain('Titel fehlt')
  })

  test('bleibt der Mangel, endet der Lauf mit fail und nennt ihn', async () => {
    const { rufe } = aufzeichnen((rolle) => (rolle === 'reviewer' ? '{"pass":false,"maengel":["zu kurz"]}' : 'arbeit'))
    const lauf = await fuehreAus({ crew: 'c1', ziel: 'Bauen', plan, rufe, maxVersuche: 2 })
    expect(lauf.urteil).toBe('fail')
    expect(lauf.versuche).toBe(2)
    expect(lauf.maengel).toContain('zu kurz')
  })

  test('ein Prüfer, den es nicht gibt, prüft nicht', async () => {
    const { rufe, anfragen } = aufzeichnen(() => 'arbeit')
    const lauf = await fuehreAus({ crew: 'c1', ziel: 'Bauen', plan, rufe, pruefer: null })
    expect(lauf.urteil).toBe('pass')
    expect(anfragen.some((eintrag) => eintrag.rolle === 'reviewer')).toBe(false)
  })

  test('das Token-Budget beendet den Lauf und wird benannt', async () => {
    const { rufe } = aufzeichnen(() => 'arbeit')
    const lauf = await fuehreAus({ crew: 'c1', ziel: 'Bauen', plan, rufe, maxTokens: 12 })
    expect(lauf.urteil).toBe('exhausted')
    expect(lauf.maengel.some((mangel) => mangel.includes('12'))).toBe(true)
  })

  test('was keine positive Rundenzahl ist, wird abgewiesen', async () => {
    const { rufe } = aufzeichnen(() => 'arbeit')
    await expect(fuehreAus({ crew: 'c1', ziel: 'Bauen', plan, rufe, maxVersuche: 0 })).rejects.toThrow(/maxVersuche/)
    await expect(fuehreAus({ crew: 'c1', ziel: 'Bauen', plan, rufe, maxTokens: -1 })).rejects.toThrow(/maxTokens/)
  })

  test('ein gescheiterter Rollenaufruf wird nicht verschluckt', async () => {
    const rufe: RufeRolle = async () => {
      throw new Error('Anbieter nicht erreichbar')
    }
    await expect(fuehreAus({ crew: 'c1', ziel: 'Bauen', plan, rufe })).rejects.toThrow(/nicht erreichbar/)
  })
})
