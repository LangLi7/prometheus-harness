/**
 * **Der Notizgraph — geprüft ohne Browser.**
 *
 * Drei Dinge können hier falsch sein, und alle drei sind ohne Klick sichtbar:
 *
 * 1. **Der Ausschnitt.** Er muß in *beide* Richtungen laufen (wer verweist
 *    hierher, wohin verweise ich) und die Tiefe einhalten. Ein Ausschnitt, der
 *    nur die ausgehenden Kanten nimmt, zeigt die halbe Umgebung.
 * 2. **Die Verweislisten.** Zwei Richtungen, zwei Listen — nicht eine.
 * 3. **Die Lage.** Sie darf nicht vom Zufall abhängen (sonst springt das Bild bei
 *    jedem Wechsel) und keine `NaN` erzeugen (dann verschwindet der ganze Graph
 *    stillschweigend).
 */
import { describe, expect, test } from 'bun:test'
import type { VaultGraph } from '../src/graph.ts'
import { HOECHSTENS, baueAusschnitt, lege, nachbarschaft } from '../src/graph.ts'

/** Ein kleiner Vault: Willkommen → A → B, und C → Willkommen. */
const graph: VaultGraph = {
  nodes: [
    { id: 'obsidian:Willkommen.md', label: 'Willkommen', kind: 'note', path: 'Willkommen.md' },
    { id: 'obsidian:A.md', label: 'A', kind: 'note', path: 'A.md' },
    { id: 'obsidian:B.md', label: 'B', kind: 'note', path: 'B.md' },
    { id: 'obsidian:C.md', label: 'C', kind: 'note', path: 'C.md' },
  ],
  edges: [
    { from: 'obsidian:Willkommen.md', to: 'obsidian:A.md' },
    { from: 'obsidian:A.md', to: 'obsidian:B.md' },
    { from: 'obsidian:C.md', to: 'obsidian:Willkommen.md' },
  ],
}

describe('baueAusschnitt', () => {
  test('Tiefe 1 nimmt die Notiz und ihre direkten Nachbarn — in beide Richtungen', () => {
    const ausschnitt = baueAusschnitt(graph, 'obsidian:Willkommen.md', 1)
    expect(ausschnitt.knoten.map((knoten) => knoten.label).sort()).toEqual(['A', 'C', 'Willkommen'])
    expect(ausschnitt.knoten.find((knoten) => knoten.mitte)?.label).toBe('Willkommen')
    expect(ausschnitt.gesamt).toBe(4)
    expect(ausschnitt.gekappt).toBe(false)
  })

  test('Tiefe 2 nimmt auch B mit', () => {
    const ausschnitt = baueAusschnitt(graph, 'obsidian:Willkommen.md', 2)
    expect(ausschnitt.knoten.map((knoten) => knoten.label).sort()).toEqual(['A', 'B', 'C', 'Willkommen'])
  })

  test('die Kanten bleiben im Ausschnitt — keine Kante zu einem fehlenden Knoten', () => {
    const ausschnitt = baueAusschnitt(graph, 'obsidian:Willkommen.md', 1)
    const ids = new Set(ausschnitt.knoten.map((knoten) => knoten.id))
    for (const kante of ausschnitt.kanten) {
      expect(ids.has(kante.von)).toBe(true)
      expect(ids.has(kante.nach)).toBe(true)
    }
  })

  test('die Mitte steht vorn, danach die besser vernetzten', () => {
    const ausschnitt = baueAusschnitt(graph, 'obsidian:Willkommen.md', 2)
    expect(ausschnitt.knoten[0]?.mitte).toBe(true)
  })

  test('eine unbekannte oder fehlende Kennung ergibt einen leeren Ausschnitt — mit Gesamtzahl', () => {
    expect(baueAusschnitt(graph, null, 2).knoten).toEqual([])
    expect(baueAusschnitt(graph, 'obsidian:gibt-es-nicht.md', 2).knoten).toEqual([])
    expect(baueAusschnitt(graph, null, 2).gesamt).toBe(4)
  })

  test('die Obergrenze kappt und sagt es', () => {
    const gross: VaultGraph = {
      nodes: Array.from({ length: 10 }, (_, i) => ({
        id: `obsidian:N${String(i)}.md`,
        label: `N${String(i)}`,
        kind: 'note',
        path: `N${String(i)}.md`,
      })),
      edges: Array.from({ length: 9 }, (_, i) => ({
        from: 'obsidian:N0.md',
        to: `obsidian:N${String(i + 1)}.md`,
      })),
    }
    const ausschnitt = baueAusschnitt(gross, 'obsidian:N0.md', Number.POSITIVE_INFINITY, 4)
    expect(ausschnitt.knoten.length).toBe(4)
    expect(ausschnitt.gekappt).toBe(true)
    expect(HOECHSTENS).toBeGreaterThan(4)
  })

  test('eine Selbstkante wird nicht gezeichnet', () => {
    const mitSelbst: VaultGraph = {
      nodes: [{ id: 'obsidian:X.md', label: 'X', kind: 'note', path: 'X.md' }],
      edges: [{ from: 'obsidian:X.md', to: 'obsidian:X.md' }],
    }
    const ausschnitt = baueAusschnitt(mitSelbst, 'obsidian:X.md', 1)
    expect(ausschnitt.kanten).toEqual([])
  })
})

describe('nachbarschaft', () => {
  test('trennt „wer verweist hierher" von „wohin verweise ich"', () => {
    const { eingehend, ausgehend } = nachbarschaft(graph, 'obsidian:Willkommen.md')
    expect(eingehend.map((knoten) => knoten.label)).toEqual(['C'])
    expect(ausgehend.map((knoten) => knoten.label)).toEqual(['A'])
  })

  test('ohne Auswahl zwei leere Listen', () => {
    expect(nachbarschaft(graph, null)).toEqual({ eingehend: [], ausgehend: [] })
  })

  test('Doppelte Kanten ergeben keine doppelten Einträge', () => {
    const doppelt: VaultGraph = {
      nodes: graph.nodes,
      edges: [
        { from: 'obsidian:C.md', to: 'obsidian:Willkommen.md' },
        { from: 'obsidian:C.md', to: 'obsidian:Willkommen.md' },
      ],
    }
    expect(nachbarschaft(doppelt, 'obsidian:Willkommen.md').eingehend.length).toBe(1)
  })
})

describe('lege', () => {
  test('ist reproduzierbar — zweimal derselbe Ausschnitt ergibt dasselbe Bild', () => {
    const ausschnitt = baueAusschnitt(graph, 'obsidian:Willkommen.md', 2)
    const a = lege(ausschnitt)
    const b = lege(ausschnitt)
    expect(a.knoten.map((knoten) => [knoten.x, knoten.y])).toEqual(b.knoten.map((knoten) => [knoten.x, knoten.y]))
  })

  test('die Mitte liegt in der Mitte', () => {
    const lage = lege(baueAusschnitt(graph, 'obsidian:Willkommen.md', 2), 700, 400)
    const mitte = lage.knoten.find((knoten) => knoten.mitte)
    expect(mitte?.x).toBe(350)
    expect(mitte?.y).toBe(200)
  })

  test('keine Zahl ist NaN und nichts läuft aus dem Bild', () => {
    const lage = lege(baueAusschnitt(graph, 'obsidian:Willkommen.md', 2), 700, 400)
    for (const knoten of lage.knoten) {
      expect(Number.isFinite(knoten.x)).toBe(true)
      expect(Number.isFinite(knoten.y)).toBe(true)
      expect(knoten.x).toBeGreaterThanOrEqual(0)
      expect(knoten.x).toBeLessThanOrEqual(700)
      expect(knoten.y).toBeGreaterThanOrEqual(0)
      expect(knoten.y).toBeLessThanOrEqual(400)
    }
  })

  test('ein leerer Ausschnitt ergibt ein leeres Bild, keinen Fehler', () => {
    const lage = lege({ knoten: [], kanten: [], gesamt: 0, gekappt: false })
    expect(lage.knoten).toEqual([])
    expect(lage.kanten).toEqual([])
  })

  test('die Kanten der Lage zeigen auf Knoten der Lage', () => {
    const lage = lege(baueAusschnitt(graph, 'obsidian:Willkommen.md', 2))
    const ids = new Set(lage.knoten.map((knoten) => knoten.id))
    for (const kante of lage.kanten) {
      expect(ids.has(kante.von.id)).toBe(true)
      expect(ids.has(kante.nach.id)).toBe(true)
    }
  })
})
