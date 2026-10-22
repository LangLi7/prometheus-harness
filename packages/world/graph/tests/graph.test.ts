import { describe, expect, test } from 'bun:test'
import {
  confidenceFrom,
  edgeKindFromRelation,
  emptyWorldGraph,
  isWorldGraph,
  mergeWorldGraphs,
  type WorldGraph,
  type WorldSourceStatus,
} from '../src/index.ts'

const obsidian: WorldGraph = {
  nodes: [
    { id: 'obsidian:Willkommen.md', label: 'Willkommen', kind: 'note', source: 'obsidian', path: 'Willkommen.md' },
    { id: 'obsidian:Neuer Link.md', label: 'Neuer Link', kind: 'note', source: 'obsidian', path: 'Neuer Link.md' },
  ],
  edges: [
    { from: 'obsidian:Willkommen.md', to: 'obsidian:Neuer Link.md', kind: 'link', confidence: 'EXTRACTED' },
  ],
  sources: [],
  generatedAt: '2026-10-18T00:00:00.000Z',
}

const graphify: WorldGraph = {
  nodes: [
    { id: 'graphify:client', label: 'client.py', kind: 'file', source: 'graphify' },
    { id: 'graphify:client_timeout', label: 'Timeout', kind: 'symbol', source: 'graphify' },
  ],
  edges: [
    {
      from: 'graphify:client',
      to: 'graphify:client_timeout',
      kind: 'contains',
      confidence: 'EXTRACTED',
      relation: 'contains',
    },
  ],
  sources: [],
  generatedAt: '2026-10-18T00:00:01.000Z',
}

const status = (id: 'obsidian' | 'graphify', nodes: number, edges: number): WorldSourceStatus => ({
  id,
  label: id,
  available: true,
  nodes,
  edges,
})

describe('world-graph', () => {
  test('leerer Graph hat den Zeitpunkt', () => {
    const graph = emptyWorldGraph('2026-10-18T00:00:00.000Z')
    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
    expect(graph.generatedAt).toBe('2026-10-18T00:00:00.000Z')
  })

  test('fügt beide Quellen zusammen und behält die Herkunft', () => {
    const merged = mergeWorldGraphs(
      [
        { graph: obsidian, status: status('obsidian', 2, 1) },
        { graph: graphify, status: status('graphify', 2, 1) },
      ],
      '2026-10-18T00:00:02.000Z',
    )
    expect(merged.nodes).toHaveLength(4)
    expect(merged.edges).toHaveLength(2)
    expect(merged.nodes.map((n) => n.source).sort()).toEqual(['graphify', 'graphify', 'obsidian', 'obsidian'])
    expect(merged.sources.map((s) => s.id)).toEqual(['obsidian', 'graphify'])
    expect(merged.generatedAt).toBe('2026-10-18T00:00:02.000Z')
  })

  test('doppelte Knoten und Kanten werden nicht doppelt', () => {
    const merged = mergeWorldGraphs([
      { graph: obsidian, status: status('obsidian', 2, 1) },
      { graph: obsidian, status: status('obsidian', 2, 1) },
    ])
    expect(merged.nodes).toHaveLength(2)
    expect(merged.edges).toHaveLength(1)
  })

  test('erkennt einen gültigen und einen kaputten Graphen', () => {
    expect(isWorldGraph(obsidian)).toBe(true)
    expect(isWorldGraph({ nodes: [], edges: [], sources: [], generatedAt: 'x' })).toBe(true)
    expect(isWorldGraph({ nodes: [{ id: 1 }], edges: [], sources: [], generatedAt: 'x' })).toBe(false)
    expect(isWorldGraph(null)).toBe(false)
    expect(isWorldGraph({})).toBe(false)
  })

  test('übersetzt Graphifys Beziehungen', () => {
    expect(edgeKindFromRelation('contains')).toBe('contains')
    expect(edgeKindFromRelation('imports_from')).toBe('imports')
    expect(edgeKindFromRelation('calls')).toBe('calls')
    expect(edgeKindFromRelation('does-not-exist')).toBe('relation')
  })

  test('unbekannte Sicherheit gilt als AMBIGUOUS', () => {
    expect(confidenceFrom('EXTRACTED')).toBe('EXTRACTED')
    expect(confidenceFrom('INFERRED')).toBe('INFERRED')
    expect(confidenceFrom('vielleicht')).toBe('AMBIGUOUS')
  })
})
