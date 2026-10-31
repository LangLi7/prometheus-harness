/**
 * Übersetzung des gelesenen Vaults in den gemeinsamen Graph-Vertrag.
 *
 * Reine Funktionen: kein Dateisystem, kein Netz. Damit ist die Zuordnung ohne
 * Host prüfbar — genau der Teil, in dem Präfixe und Zählwerte falsch sein können.
 *
 * @module @prometheus-harness/world-obsidian-provider/mapping
 */

import type { ObsidianGraph, ObsidianNote } from '@prometheus-harness/world-obsidian'
import { emptyWorldGraph } from '@prometheus-harness/world-graph'
import type { WorldEdge, WorldGraph, WorldNode, WorldSourceStatus } from '@prometheus-harness/world-graph'

/** Präfix der Knoten-Kennungen; verhindert Kollisionen mit Graphify. */
export const KNOTEN_PRAEFIX = 'obsidian:'

/** Die eine Quelle dieses Graphen. */
export const QUELLE = 'obsidian' as const

/** Anzeigename der Quelle. */
export const QUELLE_LABEL = 'Obsidian' as const

/**
 * Ein Satz für Menschen: Vault, Anzahl Notizen, offene Verweise.
 *
 * @param vaultPfad - der gelesene Vault
 * @param notizen - Anzahl der Knoten
 * @param offene - Anzahl der Verweise ohne Ziel
 * @returns der Beschreibungstext
 */
export function vaultDetail(vaultPfad: string, notizen: number, offene: number): string {
  return `Vault: ${vaultPfad} · ${notizen} ${notizen === 1 ? 'Notiz' : 'Notizen'} · ${offene} ${
    offene === 1 ? 'offener Verweis' : 'offene Verweise'
  }`
}

/**
 * Ein Knoten aus einer Notiz.
 *
 * @param notiz - die gelesene Notiz
 * @returns der Knoten
 */
function knotenAus(notiz: ObsidianNote): WorldNode {
  return {
    id: `${KNOTEN_PRAEFIX}${notiz.id}`,
    label: notiz.titel,
    kind: 'note',
    source: QUELLE,
    path: notiz.id,
    tags: notiz.tags,
  }
}

/**
 * Baut den Welt-Graph aus einem gelesenen Vault.
 *
 * Kanten entstehen nur aus `graph.kanten` (vorhandene Notizen); offene Verweise
 * stehen im Quellenstatus, nicht als Kante ins Leere.
 *
 * @param graph - das Ergebnis von `leseVault`
 * @param vaultPfad - der gelesene Vault-Pfad (für den Quellenstatus)
 * @param generatedAt - der Zeitpunkt; ohne Angabe jetzt
 * @returns der Graph
 */
export function graphAusVault(
  graph: ObsidianGraph,
  vaultPfad: string,
  generatedAt: string = new Date().toISOString(),
): WorldGraph {
  const nodes = graph.notizen.map(knotenAus)
  const edges: WorldEdge[] = graph.kanten.map((kante) => ({
    from: `${KNOTEN_PRAEFIX}${kante.von}`,
    to: `${KNOTEN_PRAEFIX}${kante.nach}`,
    kind: 'link',
    confidence: 'EXTRACTED',
  }))
  const status: WorldSourceStatus = {
    id: QUELLE,
    label: QUELLE_LABEL,
    available: true,
    nodes: nodes.length,
    edges: edges.length,
    detail: vaultDetail(vaultPfad, nodes.length, graph.offeneVerweise),
  }
  return { nodes, edges, sources: [status], generatedAt }
}

/**
 * Ein gültiger, leerer Graph für den Fall „kein Vault" oder „Vault leer".
 *
 * Der Fehler ist Teil der Antwort, nicht ein geworfener Ausnahmefall.
 *
 * @param fehler - warum nichts gelesen wurde
 * @param vaultPfad - der ermittelte Vault oder `null`
 * @param generatedAt - der Zeitpunkt; ohne Angabe jetzt
 * @returns der leere Graph mit Quellenstatus
 */
export function graphMitFehler(
  fehler: string,
  vaultPfad: string | null,
  generatedAt: string = new Date().toISOString(),
): WorldGraph {
  const status: WorldSourceStatus = {
    id: QUELLE,
    label: QUELLE_LABEL,
    available: false,
    nodes: 0,
    edges: 0,
    detail: vaultPfad === null ? 'Kein Vault ermittelt.' : `Vault: ${vaultPfad}`,
    error: fehler,
  }
  return { ...emptyWorldGraph(generatedAt), sources: [status] }
}
