/**
 * **Graphifys Ausgabe wird zur Welt.**
 *
 * Graphify schreibt `graphify-out/graph.json` im Netzwerkx-Format:
 *
 * ```json
 * { "nodes": [ { "id": …, "label": …, "file_type": …, … } ],
 *   "links": [ { "source": …, "target": …, "relation": …, "confidence": … } ] }
 * ```
 *
 * Die Welt kennt aber nur **eine** Form — `WorldGraph` aus
 * `@prometheus-harness/world-graph`. Diese Datei ist die Übersetzung, und sie
 * ist **rein**: sie bekommt den geparsten Wert und gibt einen gültigen Graphen
 * zurück. Kein Dateisystem, kein Netz.
 *
 * ## Warum kaputte Eingaben keinen Fehler werfen
 *
 * `graph.json` ist **fremder** Text aus einem anderen Prozeß. Ein Wurf würde
 * die Route abbrechen, und der Betrachter sähe eine leere Seite statt einer
 * Auskunft. Deshalb gilt: was nicht lesbar ist, wird zu einem **gültigen
 * leeren Graphen** mit `available: false` und einem `error` — die Anzeige kann
 * ihn zeichnen, und der Fehler steht darin.
 *
 * ## Die Knotenart
 *
 * Graphify nennt Dateien und Symbole beide `code`. Die Welt unterscheidet sie,
 * weil eine Datei ein anderer Ort ist als eine Funktion. Zwei Merkmale werden
 * geprüft:
 *
 * * das Label endet auf eine bekannte Dateiendung, **oder**
 * * der Ort ist `L1` **und** die Kennung enthält keinen Unterstrich (eine
 *   Datei ist ein Name, ein Symbol trägt seinen Container mit `_`).
 *
 * Alles andere ist ein `symbol`. Eine falsche Einordnung ist hier billiger als
 * eine fehlende: der Knoten bleibt sichtbar.
 *
 * @module @prometheus-harness/world-graphify/mapping
 */

import {
  confidenceFrom,
  edgeKindFromRelation,
  emptyWorldGraph,
  type WorldEdge,
  type WorldGraph,
  type WorldNode,
  type WorldSourceStatus,
} from '@prometheus-harness/world-graph'

/** Das Präfix **jeder** Kennung aus dieser Quelle. */
export const PRAEFIX = 'graphify:'

/** Die Endungen, an denen ein Label als Datei gilt. */
export const DATEI_ENDUNGEN: readonly string[] = ['.py', '.ts', '.js', '.go', '.rs', '.java', '.md', '.json']

/**
 * Ist das ein einfaches Objekt?
 *
 * @param wert - der geprüfte Wert
 * @returns ob es ein Objekt und kein Feld ist
 */
function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return wert !== null && typeof wert === 'object' && !Array.isArray(wert)
}

/**
 * Liest eine nicht-leere Zeichenkette.
 *
 * @param wert - der geprüfte Wert
 * @returns der Text oder `undefined`
 */
function text(wert: unknown): string | undefined {
  return typeof wert === 'string' && wert.trim() !== '' ? wert : undefined
}

/**
 * Ist der Knoten eine **Datei**?
 *
 * @param id - Graphifys Kennung
 * @param label - die Anzeige
 * @param dateiTyp - Graphifys `file_type`
 * @param ort - Graphifys `source_location`
 * @returns ob der Knoten als Datei gilt
 */
export function istDateiKnoten(id: string, label: string, dateiTyp: unknown, ort: unknown): boolean {
  if (dateiTyp !== 'code') return false
  const klein = label.toLowerCase()
  if (DATEI_ENDUNGEN.some((endung) => klein.endsWith(endung))) return true
  return ort === 'L1' && !id.includes('_')
}

/**
 * Macht aus einem Graphify-Knoten einen Welt-Knoten.
 *
 * @param wert - der rohe Knoten
 * @returns der Knoten oder `undefined`, wenn die Kennung fehlt
 */
export function knotenAus(wert: unknown): WorldNode | undefined {
  if (!istObjekt(wert)) return undefined
  const id = text(wert['id'])
  if (id === undefined) return undefined
  const label = text(wert['label']) ?? id
  const pfad = text(wert['source_file'])
  const roheGemeinde = wert['community']
  const community = typeof roheGemeinde === 'number' && Number.isFinite(roheGemeinde) ? roheGemeinde : undefined
  const kind = istDateiKnoten(id, label, wert['file_type'], wert['source_location']) ? 'file' : 'symbol'
  return {
    id: `${PRAEFIX}${id}`,
    label,
    kind,
    source: 'graphify',
    ...(pfad !== undefined ? { path: pfad } : {}),
    ...(community !== undefined ? { community } : {}),
  }
}

/**
 * Macht aus einer Graphify-Kante eine Welt-Kante.
 *
 * Die **rohe** Bezeichnung bleibt in `relation` stehen: `imports_from` wird zu
 * `imports`, aber was Graphify gesagt hat, geht nicht verloren.
 *
 * @param wert - die rohe Kante
 * @returns die Kante oder `undefined`, wenn Quelle oder Ziel fehlen
 */
export function kanteAus(wert: unknown): WorldEdge | undefined {
  if (!istObjekt(wert)) return undefined
  const quelle = text(wert['source'])
  const ziel = text(wert['target'])
  if (quelle === undefined || ziel === undefined) return undefined
  const relation = text(wert['relation'])
  return {
    from: `${PRAEFIX}${quelle}`,
    to: `${PRAEFIX}${ziel}`,
    kind: edgeKindFromRelation(relation ?? ''),
    confidence: confidenceFrom(wert['confidence']),
    ...(relation !== undefined ? { relation } : {}),
  }
}

/**
 * Ein **gültiger leerer Graph** mit dem Grund.
 *
 * @param datei - der gelesene Pfad
 * @param error - warum nichts gelesen wurde
 * @param generatedAt - der Zeitpunkt
 * @returns der leere Graph mit einem Quellenstatus
 */
export function leererGraph(
  datei: string,
  error: string,
  generatedAt: string = new Date().toISOString(),
): WorldGraph {
  const status: WorldSourceStatus = {
    id: 'graphify',
    label: 'Graphify',
    available: false,
    nodes: 0,
    edges: 0,
    detail: `Datei: ${datei}`,
    error,
  }
  return { ...emptyWorldGraph(generatedAt), sources: [status] }
}

/**
 * Übersetzt eine geparste `graph.json` in einen `WorldGraph`.
 *
 * **Niemals ein Wurf.** Fehlt eine Liste oder ist der Wert kein Objekt, kommt
 * ein leerer Graph mit `available: false` und `error` zurück. Einzelne
 * unbrauchbare Knoten und Kanten werden übersprungen — ein kaputter Eintrag
 * macht nicht den ganzen Graphen unlesbar.
 *
 * @param roh - der geparste Wert der Datei
 * @param datei - der Pfad, der im Quellenstatus genannt wird
 * @param generatedAt - der Zeitpunkt; ohne Angabe jetzt
 * @returns der Graph
 */
export function worldGraphAus(
  roh: unknown,
  datei: string,
  generatedAt: string = new Date().toISOString(),
): WorldGraph {
  if (!istObjekt(roh)) return leererGraph(datei, 'Die Graphify-Ausgabe ist kein JSON-Objekt.', generatedAt)
  const knotenRoh = roh['nodes']
  const kantenRoh = roh['links']
  if (!Array.isArray(knotenRoh)) {
    return leererGraph(datei, 'Der Graphify-Ausgabe fehlt die Liste „nodes".', generatedAt)
  }
  if (!Array.isArray(kantenRoh)) {
    return leererGraph(datei, 'Der Graphify-Ausgabe fehlt die Liste „links".', generatedAt)
  }
  const nodes: WorldNode[] = []
  for (const eintrag of knotenRoh) {
    const knoten = knotenAus(eintrag)
    if (knoten !== undefined) nodes.push(knoten)
  }
  const edges: WorldEdge[] = []
  for (const eintrag of kantenRoh) {
    const kante = kanteAus(eintrag)
    if (kante !== undefined) edges.push(kante)
  }
  const status: WorldSourceStatus = {
    id: 'graphify',
    label: 'Graphify',
    available: true,
    nodes: nodes.length,
    edges: edges.length,
    detail: `${datei} · gelesen ${generatedAt} · ${nodes.length} Knoten, ${edges.length} Kanten`,
  }
  return { nodes, edges, sources: [status], generatedAt }
}
