/**
 * **Die reinen Rechenwege des Graphify-Panels.**
 *
 * Hier steht alles, was man ohne Browser und ohne React prüfen kann:
 *
 * | Aufgabe | Funktion |
 * |---|---|
 * | Einstellungen lesen und mit Vorgaben füllen | {@link liesAnsicht} |
 * | Grad, Nachbarn und Namen in einer Suche bündeln | {@link baueIndex} |
 * | Den Ausschnitt um einen Knoten schneiden | {@link schneideAusschnitt} |
 * | Farben für Gruppen und Arten | {@link farbeNachGruppe}, {@link farbeNachArt} |
 * | Startpunkte für das Kräfte-Layout | {@link startPunkt} |
 *
 * **Warum das ausgelagert ist.** Ein Canvas zeichnet man nicht im Test; einen
 * Ausschnitt schon. Die Datei kennt deshalb weder `document` noch React und
 * bleibt auch im Browser-Bündel klein.
 *
 * @module @prometheus-harness/graphify/view
 */

/** Ein Knoten, so wie die Host-Route ihn liefert. */
export interface ViewNode {
  readonly id: string
  readonly label: string
  readonly kind?: string
  readonly path?: string
  readonly community?: number
}

/** Eine Kante, so wie die Host-Route sie liefert. */
export interface ViewEdge {
  readonly from: string
  readonly to: string
  readonly kind?: string
}

/** Der Graph, so wie die Host-Route ihn liefert. */
export interface ViewGraph {
  readonly nodes: readonly ViewNode[]
  readonly edges: readonly ViewEdge[]
}

/**
 * Die Ebene, auf der gezeichnet wird.
 *
 * * `gesamt` — eine Stichprobe über die größten Gruppen: der ganze Graph als Karte.
 * * `gruppe` — alle Knoten **einer** Gruppe.
 * * `nachbarschaft` — der Ausschnitt um **einen** Knoten.
 *
 * Drei Ebenen statt einer, weil ein Graph mit 36 000 Knoten nur in Stufen lesbar
 * ist: erst die Landschaft, dann ein Land, dann eine Straße.
 */
export type Ebene = 'gesamt' | 'gruppe' | 'nachbarschaft'

/**
 * Die Anzeige-Einstellungen — **die Form der `Config` auf der Host-Hälfte**.
 *
 * Alle Felder sind optional: die Einstellungsseite schickt nur, was der Nutzer
 * geändert hat, und eine fehlende Angabe heißt „Vorgabe", nicht „leer".
 */
export interface DisplayConfig {
  /** Wo das Panel erscheint: `sidebar`, `plugins`, `both` oder `none`. */
  readonly surface?: string
  /** Platz in der Leiste bzw. in der Plugin-Liste; kleinere Zahl steht weiter oben. */
  readonly order?: number
  /** Eigene Beschriftung. Leer heißt: der Text aus dem Sprachpaket. */
  readonly label?: string
  /** Wie das Panel aufgeht: `split`, `graph` oder `list`. */
  readonly view?: string
  /** Die Ebene, mit der das Panel aufgeht. */
  readonly level?: string
  /** Wie viele Schritte der Nachbarschaft gezeichnet werden (1–3). */
  readonly depth?: number
  /** Wie viele Knoten höchstens gezeichnet werden (20–400). */
  readonly limit?: number
  /** Namen an den Knoten zeichnen. */
  readonly labels?: boolean
  /** Wonach gefärbt wird: `community` oder `kind`. */
  readonly colour?: string
  /** Das Layout beim Öffnen und nach dem Ziehen weiterrechnen lassen. */
  readonly motion?: boolean
  /** Wo die Knotendaten stehen: `right`, `below` oder `off`. */
  readonly inspector?: string
}

/** Die Anzeige, wie sie nach dem Lesen der Einstellungen gilt — Vorgaben schon eingesetzt. */
export interface Ansicht {
  readonly oberflaeche: 'sidebar' | 'plugins' | 'both' | 'none'
  readonly reihenfolge: number
  readonly beschriftung: string | undefined
  readonly modus: 'split' | 'graph' | 'list'
  readonly ebene: Ebene
  readonly tiefe: 1 | 2 | 3
  readonly grenze: number
  readonly beschriftungen: boolean
  readonly farbe: 'community' | 'kind'
  readonly bewegung: boolean
  readonly inspektor: 'right' | 'below' | 'off'
}

/** Der Platz, den das Plugin ohne Einstellung hatte — ein Bestand soll sich nicht verschieben. */
const STANDARD_REIHENFOLGE = 12

/** So viele Knoten werden ohne Einstellung gezeichnet. */
const STANDARD_GRENZE = 160

/** Weniger als das ist kein Bild, mehr als das ist kein Gespräch mehr. */
const GRENZE_MIN = 20
const GRENZE_MAX = 400

/**
 * Liest eine Zahl aus der Einstellung und hält sie in ihren Grenzen.
 *
 * @param wert - der Rohwert aus der Einstellung
 * @param vorgabe - der Wert, der ohne Angabe gilt
 * @param min - die kleinste erlaubte Zahl
 * @param max - die größte erlaubte Zahl
 * @returns die gültige Zahl
 */
function zahlIn(wert: unknown, vorgabe: number, min: number, max: number): number {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return vorgabe
  return Math.min(max, Math.max(min, Math.round(wert)))
}

/**
 * Setzt die Vorgaben in die Einstellungen ein.
 *
 * **Warum das eine eigene Funktion ist.** Dieselbe Auslegung wird an mehreren
 * Stellen gebraucht (Seitenleiste, Plugin-Liste, Inspektor, Layout). Stünde sie
 * mehrfach da, wäre die Vorgabe `split` irgendwann an einer Stelle `graph` —
 * und das fiele niemandem auf.
 *
 * @param config - der gelesene Abschnitt, oder `undefined`, solange der Host noch nicht geantwortet hat
 * @returns die geltende Anzeige
 */
export function liesAnsicht(config: DisplayConfig | undefined): Ansicht {
  const flaeche = config?.surface
  const oberflaeche: Ansicht['oberflaeche'] =
    flaeche === 'plugins' || flaeche === 'both' || flaeche === 'none' || flaeche === 'sidebar'
      ? flaeche
      : 'sidebar'

  const modusRoh = config?.view
  const modus: Ansicht['modus'] =
    modusRoh === 'graph' || modusRoh === 'list' || modusRoh === 'split' ? modusRoh : 'split'

  const ebeneRoh = config?.level
  const ebene: Ebene =
    ebeneRoh === 'gruppe' || ebeneRoh === 'nachbarschaft' || ebeneRoh === 'gesamt' ? ebeneRoh : 'gesamt'

  const tiefeRoh = zahlIn(config?.depth, 2, 1, 3)
  const tiefe: Ansicht['tiefe'] = tiefeRoh === 1 ? 1 : tiefeRoh === 3 ? 3 : 2

  const inspektorRoh = config?.inspector
  const inspektor: Ansicht['inspektor'] =
    inspektorRoh === 'below' || inspektorRoh === 'off' || inspektorRoh === 'right' ? inspektorRoh : 'right'

  const roh = config?.label
  const beschriftung = typeof roh === 'string' && roh.trim() !== '' ? roh.trim() : undefined

  return {
    oberflaeche,
    reihenfolge: zahlIn(config?.order, STANDARD_REIHENFOLGE, 0, 999),
    beschriftung,
    modus,
    ebene,
    tiefe,
    grenze: zahlIn(config?.limit, STANDARD_GRENZE, GRENZE_MIN, GRENZE_MAX),
    beschriftungen: config?.labels !== false,
    farbe: config?.colour === 'kind' ? 'kind' : 'community',
    bewegung: config?.motion !== false,
    inspektor,
  }
}

/** Grad, Nachbarn und Namen eines Graphen — einmal gebaut, oft gelesen. */
export interface GraphIndex {
  readonly byId: ReadonlyMap<string, ViewNode>
  readonly degree: ReadonlyMap<string, number>
  readonly neighbours: ReadonlyMap<string, readonly string[]>
}

/** Ein leerer Index — damit die Anzeige vor der ersten Antwort nicht `null` prüfen muss. */
export const LEERER_INDEX: GraphIndex = {
  byId: new Map(),
  degree: new Map(),
  neighbours: new Map(),
}

/**
 * Baut Grad, Nachbarn und Namenssuche.
 *
 * **Der Grad zählt beide Richtungen.** Eine Kante `a → b` ist für die Frage
 * „wie groß ist dieser Knoten" genauso eine Verbindung wie `b → a`. Die
 * Nachbarlisten sind nach Grad sortiert: die erste Zeile einer Nachbarschaft
 * soll die wichtigste sein, nicht die zufällig erste im Array.
 *
 * @param graph - der Graph aus der Host-Route
 * @returns der Index
 */
export function baueIndex(graph: ViewGraph): GraphIndex {
  const byId = new Map<string, ViewNode>()
  for (const knoten of graph.nodes) byId.set(knoten.id, knoten)

  const degree = new Map<string, number>()
  const nachbarn = new Map<string, Set<string>>()
  const merke = (id: string, anderer: string): void => {
    let menge = nachbarn.get(id)
    if (menge === undefined) {
      menge = new Set()
      nachbarn.set(id, menge)
    }
    menge.add(anderer)
  }
  for (const kante of graph.edges) {
    if (kante.from === kante.to) continue
    degree.set(kante.from, (degree.get(kante.from) ?? 0) + 1)
    degree.set(kante.to, (degree.get(kante.to) ?? 0) + 1)
    merke(kante.from, kante.to)
    merke(kante.to, kante.from)
  }

  const neighbours = new Map<string, readonly string[]>()
  for (const [id, menge] of nachbarn) {
    neighbours.set(
      id,
      [...menge].sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b)),
    )
  }
  return { byId, degree, neighbours }
}

/**
 * Die wichtigsten Knoten nach Grad.
 *
 * @param index - der Index
 * @param anzahl - wie viele genannt werden sollen
 * @returns die Kennungen, die größte zuerst
 */
export function hubs(index: GraphIndex, anzahl: number): readonly string[] {
  return [...index.degree.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, anzahl))
    .map(([id]) => id)
}

/** Eine Gruppe: ihre Kennung, ihre Mitglieder (nach Grad) und ihr wichtigster Knoten. */
export interface Gemeinschaft {
  readonly id: number
  readonly members: readonly string[]
  readonly top: string
}

/** Alle Gruppen eines Graphen, die größte zuerst. */
export interface Gemeinschaften {
  readonly liste: readonly Gemeinschaft[]
  /** Zu jedem Knoten seine Gruppe — für den Sprung „diese Gruppe öffnen". */
  readonly nach: ReadonlyMap<string, number>
}

/** Keine Gruppen — vor der ersten Antwort und für einen leeren Graphen. */
export const LEERE_GEMEINSCHAFTEN: Gemeinschaften = { liste: [], nach: new Map() }

/**
 * Ordnet die Knoten ihren Gruppen zu.
 *
 * **Warum das einmal geschieht und nicht je Ebene.** Die Zuordnung ändert sich
 * nur mit dem Graphen; sie bei jedem Ebenenwechsel neu zu bauen wäre Arbeit für
 * ein Ergebnis, das schon dasteht.
 *
 * @param index - der Index des Graphen
 * @returns die Gruppen, die größte zuerst
 */
export function baueGemeinschaften(index: GraphIndex): Gemeinschaften {
  const eimer = new Map<number, string[]>()
  const nach = new Map<string, number>()
  for (const knoten of index.byId.values()) {
    if (knoten.community === undefined) continue
    nach.set(knoten.id, knoten.community)
    const liste = eimer.get(knoten.community)
    if (liste === undefined) eimer.set(knoten.community, [knoten.id])
    else liste.push(knoten.id)
  }
  const liste: Gemeinschaft[] = []
  for (const [id, members] of eimer) {
    members.sort(
      (a, b) => (index.degree.get(b) ?? 0) - (index.degree.get(a) ?? 0) || a.localeCompare(b),
    )
    const top = members[0]
    if (top === undefined) continue
    liste.push({ id, members, top })
  }
  liste.sort((a, b) => b.members.length - a.members.length || a.id - b.id)
  return { liste, nach }
}

/**
 * Alle Kanten zwischen einer Auswahl.
 *
 * @param graph - der Graph
 * @param gewaehlt - die Kennungen der Auswahl
 * @returns die Kanten, deren beide Enden in der Auswahl liegen
 */
function kantenIn(graph: ViewGraph, gewaehlt: ReadonlySet<string>): ViewEdge[] {
  const edges: ViewEdge[] = []
  for (const kante of graph.edges) {
    if (kante.from === kante.to) continue
    if (gewaehlt.has(kante.from) && gewaehlt.has(kante.to)) edges.push(kante)
  }
  return edges
}

/**
 * Baut einen Ausschnitt aus einer Auswahl von Kennungen.
 *
 * @param graph - der Graph
 * @param index - der Index
 * @param ids - die Kennungen in der Reihenfolge, in der sie gezeichnet werden
 * @param gekuerzt - ob außerhalb der Auswahl noch Knoten liegen
 * @param fokus - der Knoten, um den es geht, oder `null`
 * @returns der Ausschnitt
 */
function auswahl(
  graph: ViewGraph,
  index: GraphIndex,
  ids: readonly string[],
  gekuerzt: boolean,
  fokus: string | null,
): Ausschnitt {
  const nodes: ViewNode[] = []
  const gewaehlt = new Set<string>()
  for (const id of ids) {
    const knoten = index.byId.get(id)
    if (knoten === undefined) continue
    gewaehlt.add(id)
    nodes.push(knoten)
  }
  return {
    nodes,
    edges: kantenIn(graph, gewaehlt),
    fokus,
    gekuerzt: gekuerzt || graph.nodes.length > nodes.length,
  }
}

/**
 * **Die Gesamtkarte.** Eine Stichprobe über die größten Gruppen.
 *
 * Jede Gruppe trägt gleich viele Knoten bei, damit nicht eine riesige Gruppe
 * das Bild füllt und der Rest verschwindet. Gewählt wird **wachsend** vom
 * wichtigsten Knoten einer Gruppe aus: so entsteht je Gruppe ein
 * zusammenhängender Fleck statt verstreuter Punkte, und die Landschaft aus
 * Farbinseln ist überhaupt erst zu sehen.
 *
 * @param graph - der Graph
 * @param index - der Index
 * @param gemeinschaften - die Gruppen
 * @param grenze - wie viele Knoten höchstens gezeichnet werden
 * @returns der Ausschnitt
 */
export function schneideGesamt(
  graph: ViewGraph,
  index: GraphIndex,
  gemeinschaften: Gemeinschaften,
  grenze: number,
): Ausschnitt {
  const erlaubt = Math.max(1, Math.round(grenze))
  const gruppen = gemeinschaften.liste.filter((gruppe) => gruppe.members.length >= 2).slice(0, 16)
  if (gruppen.length === 0) return auswahl(graph, index, hubs(index, erlaubt), true, null)
  const pro = Math.max(2, Math.floor(erlaubt / gruppen.length))
  const ids: string[] = []
  for (const gruppe of gruppen) {
    ids.push(...wachseInGruppe(index, gruppe, pro))
    if (ids.length >= erlaubt) break
  }
  return auswahl(graph, index, ids.slice(0, erlaubt), true, null)
}

/**
 * Sammelt bis zu `anzahl` Knoten einer Gruppe, vom wichtigsten aus wachsend.
 *
 * **Warum nicht einfach die ersten der Liste.** Die Liste ist nach Grad
 * sortiert; die zehn größten Knoten einer Gruppe müssen einander nicht kennen.
 * Ein Fleck entsteht nur, wenn die Auswahl den Kanten folgt.
 *
 * @param index - der Index
 * @param gruppe - die Gruppe
 * @param anzahl - wie viele Knoten gesammelt werden
 * @returns die Kennungen, zusammenhängend soweit die Gruppe es hergibt
 */
function wachseInGruppe(index: GraphIndex, gruppe: Gemeinschaft, anzahl: number): string[] {
  const mitglieder = new Set(gruppe.members)
  const gewaehlt: string[] = []
  const gesehen = new Set<string>()
  const warteschlange = [gruppe.top]
  gesehen.add(gruppe.top)
  for (let kopf = 0; kopf < warteschlange.length && gewaehlt.length < anzahl; kopf += 1) {
    const id = warteschlange[kopf]
    if (id === undefined) continue
    gewaehlt.push(id)
    for (const nachbar of index.neighbours.get(id) ?? []) {
      if (!mitglieder.has(nachbar) || gesehen.has(nachbar)) continue
      gesehen.add(nachbar)
      warteschlange.push(nachbar)
    }
  }
  // Reicht der Zusammenhang nicht, wird mit den übrigen Mitgliedern aufgefüllt.
  for (const id of gruppe.members) {
    if (gewaehlt.length >= anzahl) break
    if (gesehen.has(id)) continue
    gesehen.add(id)
    gewaehlt.push(id)
  }
  return gewaehlt
}

/**
 * **Eine Gruppe.** Alle ihre Knoten, nach Grad, bis zur Grenze.
 *
 * @param graph - der Graph
 * @param index - der Index
 * @param gemeinschaften - die Gruppen
 * @param gruppe - die Kennung der Gruppe
 * @param grenze - wie viele Knoten höchstens gezeichnet werden
 * @returns der Ausschnitt
 */
export function schneideGruppe(
  graph: ViewGraph,
  index: GraphIndex,
  gemeinschaften: Gemeinschaften,
  gruppe: number,
  grenze: number,
): Ausschnitt {
  const erlaubt = Math.max(1, Math.round(grenze))
  const eintrag = gemeinschaften.liste.find((kandidat) => kandidat.id === gruppe)
  if (eintrag === undefined) return LEERER_AUSSCHNITT
  const ids = eintrag.members.slice(0, erlaubt)
  return auswahl(graph, index, ids, eintrag.members.length > ids.length, eintrag.top)
}

/** Was das Bild zeigt — und ob es dafür gekürzt wurde. */
export interface Ausschnitt {
  readonly nodes: readonly ViewNode[]
  readonly edges: readonly ViewEdge[]
  readonly fokus: string | null
  readonly gekuerzt: boolean
}

/** Ein leerer Ausschnitt. */
export const LEERER_AUSSCHNITT: Ausschnitt = { nodes: [], edges: [], fokus: null, gekuerzt: false }

/**
 * Schneidet die Nachbarschaft um einen Knoten aus dem Graphen.
 *
 * **Warum nicht der ganze Graph.** 36 000 Knoten sind ein Datenbestand, kein
 * Bild: sie passen nicht auf eine Fläche und keine Kraftrechnung trägt sie.
 * Gezeigt wird der Ausschnitt, der eine Frage beantwortet — „was hängt an
 * diesem Knoten" —, und die Grenze steht sichtbar daneben.
 *
 * **Ohne Fokus** beginnen die größten Hubs. Ein leeres Bild wäre die schlechteste
 * aller Antworten auf „zeig mir den Graphen".
 *
 * @param graph - der Graph aus der Host-Route
 * @param index - der Index dazu
 * @param fokus - der gewählte Knoten oder `null`
 * @param tiefe - wie viele Schritte gesammelt werden
 * @param grenze - wie viele Knoten höchstens in den Ausschnitt kommen
 * @returns der Ausschnitt mit seinen Kanten
 */
export function schneideAusschnitt(
  graph: ViewGraph,
  index: GraphIndex,
  fokus: string | null,
  tiefe: number,
  grenze: number,
): Ausschnitt {
  const erlaubt = Math.max(1, Math.round(grenze))
  const wurzeln: string[] = []
  if (fokus !== null && index.byId.has(fokus)) wurzeln.push(fokus)
  else wurzeln.push(...hubs(index, Math.min(8, erlaubt)))

  const distanz = new Map<string, number>()
  const reihenfolge: string[] = []
  const warteschlange: string[] = []
  for (const wurzel of wurzeln) {
    if (distanz.has(wurzel)) continue
    distanz.set(wurzel, 0)
    reihenfolge.push(wurzel)
    warteschlange.push(wurzel)
  }

  let gekuerzt = false
  // Bei Tiefe 2 und mehr nur einen Teil der direkten Nachbarn nehmen: sonst
  // füllt ein Hub mit tausenden Kanten den Ausschnitt als Stern, und von der
  // zweiten Ebene ist nichts zu sehen.
  const maxTiefe = Math.max(1, Math.round(tiefe))
  const direkte = Math.max(1, Math.ceil(erlaubt * 0.45))
  for (let kopf = 0; kopf < warteschlange.length; kopf += 1) {
    const id = warteschlange[kopf]
    if (id === undefined) continue
    const tiefeJetzt = distanz.get(id) ?? 0
    if (tiefeJetzt >= maxTiefe) continue
    const nachbarn = index.neighbours.get(id) ?? []
    const liste =
      tiefeJetzt === 0 && maxTiefe >= 2 && nachbarn.length > direkte
        ? nachbarn.slice(0, direkte)
        : nachbarn
    for (const nachbar of liste) {
      if (distanz.has(nachbar)) continue
      if (reihenfolge.length >= erlaubt) {
        gekuerzt = true
        break
      }
      distanz.set(nachbar, tiefeJetzt + 1)
      reihenfolge.push(nachbar)
      warteschlange.push(nachbar)
    }
  }

  // Bleibt Platz übrig — etwa weil die zweite Ebene nichts hergibt —, wird er
  // mit den restlichen direkten Nachbarn gefüllt. Ein Stern bleibt so ein
  // Stern; nur bei genug Umgebung bekommt die zweite Ebene den Vorrang.
  if (fokus !== null && index.byId.has(fokus) && reihenfolge.length < erlaubt) {
    for (const nachbar of index.neighbours.get(fokus) ?? []) {
      if (reihenfolge.length >= erlaubt) {
        gekuerzt = true
        break
      }
      if (distanz.has(nachbar)) continue
      distanz.set(nachbar, 1)
      reihenfolge.push(nachbar)
    }
  }

  return auswahl(
    graph,
    index,
    reihenfolge,
    gekuerzt,
    fokus !== null && index.byId.has(fokus) ? fokus : null,
  )
}

/**
 * Die Farben der Gruppen.
 *
 * Zwölf Töne, die sich auf dunklem Grund unterscheiden und weder grell noch
 * grau sind. Mehr als zwölf Gruppen bekommen wieder den ersten Ton — eine
 * dreizehnte Farbe wäre nicht mehr zu unterscheiden, und eine Legende, die
 * lügt, ist schlechter als eine, die sich wiederholt.
 */
export const GRUPPEN_FARBEN: readonly string[] = [
  '#5b8def',
  '#e8833a',
  '#d9534f',
  '#3fae9f',
  '#8fc93a',
  '#d9b34a',
  '#a97bd6',
  '#e06fa0',
  '#4fc3d9',
  '#8f9bb3',
  '#c47a5a',
  '#63b36f',
]

/**
 * Die Farbe einer Gruppe.
 *
 * @param community - die Gruppennummer aus dem Graphen
 * @returns die Farbe; ohne Gruppe ein neutrales Grau
 */
export function farbeNachGruppe(community: number | undefined): string {
  if (community === undefined || !Number.isFinite(community)) return '#6b7c8f'
  const stelle = ((Math.trunc(community) % GRUPPEN_FARBEN.length) + GRUPPEN_FARBEN.length) % GRUPPEN_FARBEN.length
  return GRUPPEN_FARBEN[stelle] ?? '#6b7c8f'
}

/**
 * Die Farbe einer Art.
 *
 * @param kind - `file`, `symbol` oder nichts davon
 * @returns die Farbe
 */
export function farbeNachArt(kind: string | undefined): string {
  if (kind === 'file') return '#4fc3d9'
  if (kind === 'symbol') return '#8fe3c6'
  return '#8f9bb3'
}

/**
 * Alles, wonach sich ein Knoten färben läßt.
 *
 * Die Felder sind bewußt breiter als bei {@link ViewNode}: das Layout führt
 * `kind` als eigenes Feld und kennt `path` nicht. Ein `undefined` ist hier ein
 * gültiger Wert und keine fehlende Angabe.
 */
export interface Farbbar {
  readonly kind?: string | undefined
  readonly community?: number | undefined
}

/**
 * Die Farbe eines Knotens nach der gewählten Regel.
 *
 * @param knoten - der Knoten
 * @param regel - `community` oder `kind`
 * @returns die Farbe
 */
export function farbeFuer(knoten: Farbbar, regel: Ansicht['farbe']): string {
  return regel === 'kind' ? farbeNachArt(knoten.kind) : farbeNachGruppe(knoten.community)
}

/**
 * Ein reproduzierbarer Wert zwischen 0 und 1 aus einer Kennung.
 *
 * **Warum nicht `Math.random`.** Zwei Aufrufe mit demselben Graphen sollen
 * dasselbe Bild ergeben; der Zufall darf nur die Startpunkte streuen, nicht
 * das Ergebnis verschieben.
 *
 * @param id - die Kennung
 * @returns eine Zahl in `[0, 1)`
 */
export function streuung(id: string): number {
  let hash = 2166136261
  for (let stelle = 0; stelle < id.length; stelle += 1) {
    hash ^= id.charCodeAt(stelle)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

/**
 * Ein Startpunkt auf einer Spirale.
 *
 * Die Spirale verteilt die Knoten gleichmäßig auf einer Fläche; ohne sie
 * lägen alle auf einem Punkt und die erste Kraftrechnung müßte sie mit
 * Zufallsstößen auseinandertreiben.
 *
 * @param id - die Kennung des Knotens (für die Streuung)
 * @param platz - der Platz in der Reihenfolge
 * @param gesamt - die Zahl der Knoten
 * @returns der Punkt im Layoutraum
 */
export function startPunkt(id: string, platz: number, gesamt: number): { x: number; y: number } {
  const goldener = 2.399963229728653
  const anteil = (platz + 0.5) / Math.max(1, gesamt)
  const radius = 250 * Math.sqrt(anteil)
  const winkel = platz * goldener + streuung(id) * 0.7
  return { x: Math.cos(winkel) * radius, y: Math.sin(winkel) * radius }
}
