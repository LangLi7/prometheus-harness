/**
 * **`@prometheus-harness/world-graph` — der gemeinsame Vertrag der Welt.**
 *
 * Obsidian und Graphify liefern **verschiedene** Dinge: der eine Notizen mit
 * Wikilinks, der andere Code-Symbole mit aufgelösten Beziehungen. Die Welt soll
 * aber nur **eine** Form kennen. Diese Datei ist diese Form — Typen und reine
 * Funktionen, ohne Dateisystem, ohne Netz, ohne Datenbank.
 *
 * ## Warum die Quellen im Graphen stehen
 *
 * Ein Knoten ohne Herkunft wäre in der 3D-Ansicht nicht unterscheidbar: eine
 * Notiz und eine Funktion sähen gleich aus, obwohl sie verschieden entstanden
 * sind. `source` ist deshalb **Pflicht**, und `sources` beschreibt je Quelle,
 * ob sie gelesen werden konnte. Eine Quelle, die fehlt, wird **genannt** und
 * nicht verschwiegen — sonst sähe ein leerer Graph wie ein leerer Vault aus.
 *
 * @module @prometheus-harness/world-graph
 */

/** Woher ein Knoten oder eine Kante kommt. */
export type WorldSourceId = 'obsidian' | 'graphify'

/** Was ein Knoten in der Welt bedeutet. */
export type WorldNodeKind = 'note' | 'file' | 'symbol' | 'concept' | 'community' | 'unknown'

/** Was eine Kante bedeutet — die gesuchte, nicht die rohe Bezeichnung. */
export type WorldEdgeKind =
  | 'link'
  | 'contains'
  | 'calls'
  | 'imports'
  | 'inherits'
  | 'uses'
  | 'relation'
  | 'unknown'

/** Wie sicher eine Kante ist — Graphifys eigene Stufen. */
export type WorldEdgeConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS'

/** Ein Knoten der Welt. */
export interface WorldNode {
  /** Eindeutig **über alle Quellen** — die Quelle steckt im Präfix. */
  readonly id: string
  readonly label: string
  readonly kind: WorldNodeKind
  readonly source: WorldSourceId
  /** Der Pfad im Vault oder im Repository, wenn es einen gibt. */
  readonly path?: string
  /** Graphifys Gemeinschaft — nur dort vorhanden. */
  readonly community?: number
  /** Marken aus einer Obsidian-Notiz. */
  readonly tags?: readonly string[]
}

/** Eine Kante der Welt. */
export interface WorldEdge {
  readonly from: string
  readonly to: string
  readonly kind: WorldEdgeKind
  readonly confidence: WorldEdgeConfidence
  /** Die rohe Bezeichnung der Quelle, damit nichts verlorengeht. */
  readonly relation?: string
}

/** Der Zustand **einer** Quelle. */
export interface WorldSourceStatus {
  readonly id: WorldSourceId
  readonly label: string
  readonly available: boolean
  readonly nodes: number
  readonly edges: number
  /** Ein Satz für Menschen — Pfad, Zeitpunkt, Anzahl. */
  readonly detail?: string
  /** Warum die Quelle nicht gelesen werden konnte. */
  readonly error?: string
}

/** Der ganze Graph, den die Welt zeichnet. */
export interface WorldGraph {
  readonly nodes: readonly WorldNode[]
  readonly edges: readonly WorldEdge[]
  readonly sources: readonly WorldSourceStatus[]
  /** ISO-8601, damit zwei Läufe unterscheidbar sind. */
  readonly generatedAt: string
}

/**
 * Ein leerer Graph — **mit** dem Zeitpunkt.
 *
 * @param generatedAt - der Zeitpunkt; ohne Angabe jetzt
 * @returns der leere Graph
 */
export function emptyWorldGraph(generatedAt: string = new Date().toISOString()): WorldGraph {
  return { nodes: [], edges: [], sources: [], generatedAt }
}

/**
 * **Fügt die Graphen der Quellen zusammen.**
 *
 * Doppelte Knoten werden über `id` zusammengeführt; die **erste** Quelle gewinnt.
 * Doppelte Kanten (gleiches `from`, `to`, `kind`) werden entfernt — zweimal
 * dieselbe Aussage ist keine zweite Kante.
 *
 * @param parts - je Quelle ein Graph und ihr Zustand
 * @param generatedAt - der Zeitpunkt des Zusammenbaus
 * @returns der zusammengeführte Graph
 */
export function mergeWorldGraphs(
  parts: readonly { readonly graph: WorldGraph; readonly status: WorldSourceStatus }[],
  generatedAt: string = new Date().toISOString(),
): WorldGraph {
  const nodes = new Map<string, WorldNode>()
  const edges = new Map<string, WorldEdge>()
  for (const part of parts) {
    for (const node of part.graph.nodes) {
      if (!nodes.has(node.id)) nodes.set(node.id, node)
    }
    for (const edge of part.graph.edges) {
      const key = `${edge.from}\u0000${edge.to}\u0000${edge.kind}`
      if (!edges.has(key)) edges.set(key, edge)
    }
  }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    sources: parts.map((part) => part.status),
    generatedAt,
  }
}

/**
 * Ist das ein Graph, den die Welt zeichnen kann?
 *
 * **Warum eine Prüfung und kein Cast.** Die Antwort kommt über HTTP aus einem
 * anderen Prozeß; ein `as WorldGraph` wäre eine Behauptung über fremde Bytes.
 *
 * @param value - der rohe Wert
 * @returns ob er die Pflichtfelder hat
 */
export function isWorldGraph(value: unknown): value is WorldGraph {
  if (value === null || typeof value !== 'object') return false
  const graph = value as Partial<WorldGraph>
  return (
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges) &&
    Array.isArray(graph.sources) &&
    typeof graph.generatedAt === 'string' &&
    graph.nodes.every(
      (node) =>
        node !== null &&
        typeof node === 'object' &&
        typeof (node as WorldNode).id === 'string' &&
        typeof (node as WorldNode).label === 'string' &&
        typeof (node as WorldNode).source === 'string',
    ) &&
    graph.edges.every(
      (edge) =>
        edge !== null &&
        typeof edge === 'object' &&
        typeof (edge as WorldEdge).from === 'string' &&
        typeof (edge as WorldEdge).to === 'string',
    )
  )
}

/**
 * Macht aus einer rohen Graphify-Beziehung eine Kante der Welt.
 *
 * @param relation - Graphifys `relation`
 * @returns die Kante
 */
export function edgeKindFromRelation(relation: string): WorldEdgeKind {
  switch (relation) {
    case 'link':
    case 'links_to':
    case 'references':
      return 'link'
    case 'contains':
      return 'contains'
    case 'calls':
      return 'calls'
    case 'imports':
    case 'imports_from':
      return 'imports'
    case 'inherits':
      return 'inherits'
    case 'uses':
      return 'uses'
    default:
      return 'relation'
  }
}

/**
 * Macht aus Graphifys `confidence` eine der drei Stufen.
 *
 * @param confidence - der rohe Wert
 * @returns die Stufe; Unbekanntes gilt als `AMBIGUOUS`
 */
export function confidenceFrom(confidence: unknown): WorldEdgeConfidence {
  return confidence === 'EXTRACTED' || confidence === 'INFERRED' || confidence === 'AMBIGUOUS'
    ? confidence
    : 'AMBIGUOUS'
}
