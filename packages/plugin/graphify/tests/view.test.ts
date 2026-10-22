/**
 * Prüfungen der reinen Rechenwege: Einstellungen, Index, Ausschnitt, Farben
 * und das Kräfte-Layout. Alles ohne Browser — deshalb hier und nicht im Panel.
 */

import { describe, expect, test } from 'bun:test'
import {
  baueGemeinschaften,
  baueIndex,
  farbeNachArt,
  farbeNachGruppe,
  hubs,
  liesAnsicht,
  schneideAusschnitt,
  schneideGesamt,
  schneideGruppe,
  startPunkt,
  streuung,
  type ViewGraph,
} from '../src/view.ts'
import { baueSim, grenzen, schritt } from '../src/sim.ts'

/** Ein kleiner Graph mit einer Kette und einem Stern. */
function graph(): ViewGraph {
  return {
    nodes: [
      { id: 'zentrum', label: 'Zentrum', kind: 'symbol', community: 1 },
      { id: 'a', label: 'A', kind: 'symbol', community: 1 },
      { id: 'b', label: 'B', kind: 'file', community: 2 },
      { id: 'c', label: 'C', kind: 'file', community: 2 },
      { id: 'd', label: 'D', kind: 'symbol', community: 3 },
    ],
    edges: [
      { from: 'zentrum', to: 'a' },
      { from: 'zentrum', to: 'b' },
      { from: 'zentrum', to: 'c' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
      { from: 'd', to: 'd' },
    ],
  }
}

describe('liesAnsicht', () => {
  test('ohne Einstellung gilt die Vorgabe', () => {
    const anzeige = liesAnsicht(undefined)
    expect(anzeige.oberflaeche).toBe('sidebar')
    expect(anzeige.reihenfolge).toBe(12)
    expect(anzeige.modus).toBe('split')
    expect(anzeige.tiefe).toBe(2)
    expect(anzeige.grenze).toBe(160)
    expect(anzeige.beschriftungen).toBe(true)
    expect(anzeige.farbe).toBe('community')
    expect(anzeige.bewegung).toBe(true)
    expect(anzeige.inspektor).toBe('right')
  })

  test('unbekannte Werte fallen auf die Vorgabe zurück, Zahlen werden begrenzt', () => {
    const anzeige = liesAnsicht({
      surface: 'irgendwo',
      view: 'gitter',
      depth: 9,
      limit: 5000,
      colour: 'regenbogen',
      inspector: 'links',
    })
    expect(anzeige.oberflaeche).toBe('sidebar')
    expect(anzeige.modus).toBe('split')
    expect(anzeige.tiefe).toBe(3)
    expect(anzeige.grenze).toBe(400)
    expect(anzeige.farbe).toBe('community')
    expect(anzeige.inspektor).toBe('right')
  })

  test('die untere Grenze greift und Schalter bleiben Schalter', () => {
    const anzeige = liesAnsicht({ limit: 1, labels: false, motion: false, view: 'list', inspector: 'off' })
    expect(anzeige.grenze).toBe(20)
    expect(anzeige.beschriftungen).toBe(false)
    expect(anzeige.bewegung).toBe(false)
    expect(anzeige.modus).toBe('list')
    expect(anzeige.inspektor).toBe('off')
  })
})

describe('baueIndex', () => {
  test('der Grad zählt beide Richtungen, Schleifen zählen nicht', () => {
    const index = baueIndex(graph())
    expect(index.degree.get('zentrum')).toBe(3)
    expect(index.degree.get('c')).toBe(3)
    expect(index.degree.get('d')).toBe(1)
    expect(index.degree.get('d')).not.toBe(2)
  })

  test('Nachbarn sind nach Grad sortiert', () => {
    const index = baueIndex(graph())
    expect(index.neighbours.get('zentrum')).toEqual(['c', 'b', 'a'])
    expect(index.neighbours.get('d')).toEqual(['c'])
  })
})

describe('schneideAusschnitt', () => {
  test('Tiefe 1 nimmt nur die direkten Nachbarn', () => {
    const g = graph()
    const index = baueIndex(g)
    const ausschnitt = schneideAusschnitt(g, index, 'zentrum', 1, 160)
    expect(ausschnitt.nodes.map((knoten) => knoten.id).sort()).toEqual(['a', 'b', 'c', 'zentrum'])
    expect(ausschnitt.fokus).toBe('zentrum')
    expect(ausschnitt.gekuerzt).toBe(true)
  })

  test('Tiefe 2 nimmt die Nachbarn der Nachbarn mit', () => {
    const g = graph()
    const index = baueIndex(g)
    const ausschnitt = schneideAusschnitt(g, index, 'zentrum', 2, 160)
    expect(ausschnitt.nodes.map((knoten) => knoten.id).sort()).toEqual(['a', 'b', 'c', 'd', 'zentrum'])
  })

  test('die Grenze wird eingehalten und als Kürzung gemeldet', () => {
    const g = graph()
    const index = baueIndex(g)
    const ausschnitt = schneideAusschnitt(g, index, 'zentrum', 2, 3)
    expect(ausschnitt.nodes).toHaveLength(3)
    expect(ausschnitt.gekuerzt).toBe(true)
  })

  test('nur Kanten zwischen gewählten Knoten kommen mit', () => {
    const g = graph()
    const index = baueIndex(g)
    const ausschnitt = schneideAusschnitt(g, index, 'zentrum', 1, 160)
    const paare = ausschnitt.edges.map((kante) => `${kante.from}>${kante.to}`)
    expect(paare).toContain('zentrum>b')
    expect(paare).not.toContain('c>d')
  })

  test('ohne Fokus beginnt der Ausschnitt bei den Hubs', () => {
    const g = graph()
    const index = baueIndex(g)
    const ausschnitt = schneideAusschnitt(g, index, null, 1, 160)
    expect(ausschnitt.fokus).toBeNull()
    expect(ausschnitt.nodes[0]?.id).toBe('c')
  })

  test('ein unbekannter Fokus fällt auf die Hubs zurück', () => {
    const g = graph()
    const index = baueIndex(g)
    const ausschnitt = schneideAusschnitt(g, index, 'gibt-es-nicht', 1, 160)
    expect(ausschnitt.fokus).toBeNull()
    expect(ausschnitt.nodes[0]?.id).toBe('c')
  })
})

describe('Ebenen', () => {
  test('Gemeinschaften stehen nach Größe, ihre Mitglieder nach Grad', () => {
    const index = baueIndex(graph())
    const gemeinschaften = baueGemeinschaften(index)
    expect(gemeinschaften.liste.map((eintrag) => eintrag.id)).toEqual([1, 2, 3])
    expect(gemeinschaften.liste[0]?.members).toEqual(['zentrum', 'a'])
    expect(gemeinschaften.nach.get('c')).toBe(2)
    expect(gemeinschaften.liste[0]?.top).toBe('zentrum')
  })

  test('die Gruppenebene enthält nur Mitglieder dieser Gruppe', () => {
    const g = graph()
    const index = baueIndex(g)
    const gemeinschaften = baueGemeinschaften(index)
    const ausschnitt = schneideGruppe(g, index, gemeinschaften, 2, 160)
    expect(ausschnitt.nodes.map((knoten) => knoten.id).sort()).toEqual(['b', 'c'])
    expect(ausschnitt.edges.map((kante) => `${kante.from}>${kante.to}`)).toEqual(['b>c'])
    expect(ausschnitt.fokus).toBe('c')
  })

  test('die Gruppenebene kürzt an der Grenze', () => {
    const g = graph()
    const index = baueIndex(g)
    const gemeinschaften = baueGemeinschaften(index)
    const ausschnitt = schneideGruppe(g, index, gemeinschaften, 2, 1)
    expect(ausschnitt.nodes).toHaveLength(1)
    expect(ausschnitt.gekuerzt).toBe(true)
  })

  test('die Gesamtkarte nimmt aus jeder Gruppe gleich viele', () => {
    const g = graph()
    const index = baueIndex(g)
    const gemeinschaften = baueGemeinschaften(index)
    const ausschnitt = schneideGesamt(g, index, gemeinschaften, 4)
    expect(ausschnitt.nodes.map((knoten) => knoten.id).sort()).toEqual(['a', 'b', 'c', 'zentrum'])
    expect(ausschnitt.fokus).toBeNull()
    expect(ausschnitt.gekuerzt).toBe(true)
  })

  test('ein Hub mit vielen Blättern bleibt bei Tiefe 2 kein reiner Stern', () => {
    const nodes = [{ id: 'hub', label: 'Hub', community: 1 }]
    const edges = []
    // 40 Blätter am Hub, jedes mit einem eigenen Kind.
    for (let i = 0; i < 40; i += 1) {
      nodes.push({ id: `blatt${i}`, label: `Blatt${i}`, community: 1 })
      nodes.push({ id: `kind${i}`, label: `Kind${i}`, community: 1 })
      edges.push({ from: 'hub', to: `blatt${i}` })
      edges.push({ from: `blatt${i}`, to: `kind${i}` })
    }
    const g = { nodes, edges }
    const index = baueIndex(g)
    const ausschnitt = schneideAusschnitt(g, index, 'hub', 2, 40)
    expect(ausschnitt.nodes).toHaveLength(40)
    const ohneKinder = ausschnitt.nodes.filter((knoten) => knoten.id.startsWith('kind'))
    expect(ohneKinder.length).toBeGreaterThan(0)
  })
})

describe('hubs und Farben', () => {  test('hubs sortiert nach Grad', () => {
    const index = baueIndex(graph())
    expect(hubs(index, 2)).toEqual(['c', 'zentrum'])
  })

  test('die Gruppenfarbe ist stabil und wiederholt sich nach der Palette', () => {
    expect(farbeNachGruppe(66)).toBe(farbeNachGruppe(66))
    expect(farbeNachGruppe(66)).not.toBe(farbeNachGruppe(67))
    expect(farbeNachGruppe(undefined)).toBe('#6b7c8f')
  })

  test('die Art hat zwei Farben und einen neutralen Rest', () => {
    expect(farbeNachArt('file')).toBe('#4fc3d9')
    expect(farbeNachArt('symbol')).toBe('#8fe3c6')
    expect(farbeNachArt(undefined)).toBe('#8f9bb3')
  })
})

describe('startPunkt', () => {
  test('gleiche Kennung ergibt denselben Punkt', () => {
    expect(startPunkt('abc', 3, 40)).toEqual(startPunkt('abc', 3, 40))
  })

  test('verschiedene Kennungen liegen nicht aufeinander', () => {
    const a = startPunkt('abc', 3, 40)
    const b = startPunkt('abd', 3, 40)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.5)
    expect(streuung('abc')).not.toBe(streuung('abd'))
  })

  test('der Punkt liegt im Layoutraum', () => {
    const punkt = startPunkt('abc', 39, 40)
    expect(Math.hypot(punkt.x, punkt.y)).toBeLessThanOrEqual(251)
  })
})

describe('das Kräfte-Layout', () => {
  test('nach vielen Schritten sind alle Punkte endlich', () => {
    const g = graph()
    const sim = baueSim(g.nodes, g.edges)
    for (let i = 0; i < 400; i += 1) schritt(sim)
    for (const knoten of sim.nodes) {
      expect(Number.isFinite(knoten.x)).toBe(true)
      expect(Number.isFinite(knoten.y)).toBe(true)
    }
    const raum = grenzen(sim)
    expect(raum.maxX).toBeGreaterThan(raum.minX)
    expect(raum.maxY).toBeGreaterThan(raum.minY)
  })

  test('zwei Läufe ergeben dasselbe Bild', () => {
    const g = graph()
    const eins = baueSim(g.nodes, g.edges)
    const zwei = baueSim(g.nodes, g.edges)
    for (let i = 0; i < 120; i += 1) {
      schritt(eins)
      schritt(zwei)
    }
    expect(eins.nodes.map((knoten) => [knoten.x, knoten.y])).toEqual(
      zwei.nodes.map((knoten) => [knoten.x, knoten.y]),
    )
  })

  test('ein fester Knoten bewegt sich nicht', () => {
    const g = graph()
    const sim = baueSim(g.nodes, g.edges)
    const erster = sim.nodes[0]
    expect(erster).toBeDefined()
    if (erster === undefined) return
    erster.fix = true
    const x = erster.x
    const y = erster.y
    for (let i = 0; i < 60; i += 1) schritt(sim)
    expect(erster.x).toBe(x)
    expect(erster.y).toBe(y)
  })

  test('Kanten zu unbekannten Knoten werden übergangen', () => {
    const sim = baueSim(
      [{ id: 'a', label: 'A' }],
      [
        { from: 'a', to: 'fehlt' },
        { from: 'a', to: 'a' },
      ],
    )
    expect(sim.edges).toHaveLength(0)
    expect(sim.nodes[0]?.degree).toBe(0)
  })
})
