/**
 * **Das Kräfte-Layout des Graphify-Panels.**
 *
 * Ein kleiner Feder-Kern in der Art von Fruchterman-Reingold, ohne Bibliothek:
 *
 * * **Abstoßung** zwischen allen Paaren hält die Knoten auseinander,
 * * **Federn** an den Kanten ziehen zusammenhängende Knoten zusammen,
 * * **Schwerkraft** hält den Ausschnitt um den Ursprung,
 * * **Gruppenzug** zieht Knoten derselben Gruppe zueinander.
 *
 * ## Warum kein `d3-force`
 *
 * Das Bündel wird von `build.mjs` gebaut und teilt sich React mit der
 * Oberfläche. Eine Layout-Bibliothek für einen Ausschnitt von einigen hundert
 * Knoten wäre mehr Abhängigkeit als Nutzen — und ein weiterer Vertrag, der
 * gepflegt werden muß.
 *
 * ## Warum der Zufall reproduzierbar ist
 *
 * Zwei Aufrufe mit demselben Ausschnitt ergeben dasselbe Bild. Gestreut wird
 * nur der Startpunkt, und zwar aus der Kennung ({@link startPunkt}), nicht aus
 * `Math.random`.
 *
 * @module @prometheus-harness/graphify/sim
 */

import { startPunkt, type ViewEdge, type ViewNode } from './view.ts'

/** Ein Knoten im Layout. Die Felder ändern sich mit jedem Schritt. */
export interface SimKnoten {
  readonly id: string
  readonly label: string
  readonly kind: string | undefined
  readonly community: number | undefined
  degree: number
  x: number
  y: number
  vx: number
  vy: number
  /** Ein gezogener Knoten bleibt stehen, bis die Maus ihn losläßt. */
  fix: boolean
}

/** Eine Feder zwischen zwei Knoten — als Indizes, nicht als Kennungen. */
export interface SimKante {
  readonly a: number
  readonly b: number
}

/** Das Layout: Knoten, Federn und die Kraftpuffer. */
export interface Sim {
  readonly nodes: SimKnoten[]
  readonly edges: SimKante[]
  readonly fx: Float64Array
  readonly fy: Float64Array
  /** Wie viele Schritte schon gerechnet wurden. */
  ticks: number
}

/** So stark stoßen sich Knoten ab. */
const ABSTOSSUNG = 9000

/** So stark ziehen Kanten. */
const FEDER = 0.045

/** Die Länge, bei der eine Feder nichts mehr tut. */
const RUHELAENGE = 48

/** So stark zieht der Ursprung. */
const SCHWERKRAFT = 0.0015

/** So stark zieht die eigene Gruppe. */
const GRUPPENZUG = 0.01

/** Was von der Geschwindigkeit je Schritt übrig bleibt. */
const DAEMPFUNG = 0.84

/** Schneller als das wird kein Knoten. */
const MAX_TEMPO = 16

/** Ab diesem Abstand wird die Abstoßung nicht mehr gerechnet. */
const ABSTAND = 480

/**
 * Baut das Layout für einen Ausschnitt.
 *
 * Kanten zu Knoten, die nicht im Ausschnitt liegen, werden übergangen: eine
 * Feder ins Nichts wäre eine Kraft ohne Gegenpart.
 *
 * @param knoten - die Knoten des Ausschnitts
 * @param kanten - die Kanten des Ausschnitts
 * @returns das Layout mit Startpunkten auf einer Spirale
 */
export function baueSim(knoten: readonly ViewNode[], kanten: readonly ViewEdge[]): Sim {
  const stelle = new Map<string, number>()
  const nodes: SimKnoten[] = knoten.map((eintrag, platz) => {
    stelle.set(eintrag.id, platz)
    const punkt = startPunkt(eintrag.id, platz, knoten.length)
    return {
      id: eintrag.id,
      label: eintrag.label,
      kind: eintrag.kind,
      community: eintrag.community,
      degree: 0,
      x: punkt.x,
      y: punkt.y,
      vx: 0,
      vy: 0,
      fix: false,
    }
  })
  const edges: SimKante[] = []
  const grade = new Array<number>(nodes.length).fill(0)
  for (const kante of kanten) {
    const a = stelle.get(kante.from)
    const b = stelle.get(kante.to)
    if (a === undefined || b === undefined || a === b) continue
    edges.push({ a, b })
    grade[a] = (grade[a] ?? 0) + 1
    grade[b] = (grade[b] ?? 0) + 1
  }
  for (const [platz, knoten] of nodes.entries()) {
    knoten.degree = grade[platz] ?? 0
  }
  return {
    nodes,
    edges,
    fx: new Float64Array(nodes.length),
    fy: new Float64Array(nodes.length),
    ticks: 0,
  }
}

/**
 * Rechnet einen Schritt.
 *
 * Die Kräfte landen zuerst in Puffern; erst danach wird bewegt. Wer Kraft und
 * Position im selben Durchlauf ändert, rechnet je nach Reihenfolge der Schleife
 * ein anderes Layout — und das Ergebnis hinge an der Array-Reihenfolge.
 *
 * @param sim - das Layout; wird verändert
 */
export function schritt(sim: Sim): void {
  const { nodes, edges, fx, fy } = sim
  const anzahl = nodes.length
  if (anzahl === 0) return
  fx.fill(0)
  fy.fill(0)

  // Abstoßung: jedes Paar einmal.
  for (let a = 0; a < anzahl; a += 1) {
    const ka = nodes[a]
    if (ka === undefined) continue
    for (let b = a + 1; b < anzahl; b += 1) {
      const kb = nodes[b]
      if (kb === undefined) continue
      let dx = ka.x - kb.x
      let dy = ka.y - kb.y
      let abstand2 = dx * dx + dy * dy
      if (abstand2 > ABSTAND * ABSTAND) continue
      if (abstand2 < 0.01) {
        // Zwei Knoten auf demselben Punkt: ein kleiner, aber reproduzierbarer Stoß.
        dx = ((a + 1) % 7) - 3
        dy = ((b + 1) % 5) - 2
        abstand2 = dx * dx + dy * dy
      }
      const abstand = Math.sqrt(abstand2)
      const staerke = ABSTOSSUNG / abstand2
      const x = (dx / abstand) * staerke
      const y = (dy / abstand) * staerke
      fx[a] = (fx[a] ?? 0) + x
      fy[a] = (fy[a] ?? 0) + y
      fx[b] = (fx[b] ?? 0) - x
      fy[b] = (fy[b] ?? 0) - y
    }
  }

  // Federn an den Kanten.
  for (const kante of edges) {
    const ka = nodes[kante.a]
    const kb = nodes[kante.b]
    if (ka === undefined || kb === undefined) continue
    const dx = kb.x - ka.x
    const dy = kb.y - ka.y
    const abstand = Math.sqrt(dx * dx + dy * dy) || 0.01
    const staerke = (abstand - RUHELAENGE) * FEDER
    const x = (dx / abstand) * staerke
    const y = (dy / abstand) * staerke
    fx[kante.a] = (fx[kante.a] ?? 0) + x
    fy[kante.a] = (fy[kante.a] ?? 0) + y
    fx[kante.b] = (fx[kante.b] ?? 0) - x
    fy[kante.b] = (fy[kante.b] ?? 0) - y
  }

  // Schwerkraft und Gruppenzug.
  const gruppen = new Map<number, { x: number; y: number; n: number }>()
  for (const knoten of nodes) {
    if (knoten.community === undefined) continue
    let gruppe = gruppen.get(knoten.community)
    if (gruppe === undefined) {
      gruppe = { x: 0, y: 0, n: 0 }
      gruppen.set(knoten.community, gruppe)
    }
    gruppe.x += knoten.x
    gruppe.y += knoten.y
    gruppe.n += 1
  }
  for (const [stelle, knoten] of nodes.entries()) {
    let x = (fx[stelle] ?? 0) - knoten.x * SCHWERKRAFT
    let y = (fy[stelle] ?? 0) - knoten.y * SCHWERKRAFT
    if (knoten.community !== undefined) {
      const gruppe = gruppen.get(knoten.community)
      if (gruppe !== undefined && gruppe.n > 1) {
        x += (gruppe.x / gruppe.n - knoten.x) * GRUPPENZUG
        y += (gruppe.y / gruppe.n - knoten.y) * GRUPPENZUG
      }
    }
    knoten.vx = (knoten.vx + x) * DAEMPFUNG
    knoten.vy = (knoten.vy + y) * DAEMPFUNG
    const tempo = Math.hypot(knoten.vx, knoten.vy)
    if (tempo > MAX_TEMPO) {
      const faktor = MAX_TEMPO / tempo
      knoten.vx *= faktor
      knoten.vy *= faktor
    }
  }

  // Bewegung.
  for (const knoten of nodes) {
    if (knoten.fix) {
      knoten.vx = 0
      knoten.vy = 0
      continue
    }
    knoten.x += knoten.vx
    knoten.y += knoten.vy
    if (!Number.isFinite(knoten.x) || !Number.isFinite(knoten.y)) {
      knoten.x = 0
      knoten.y = 0
      knoten.vx = 0
      knoten.vy = 0
    }
  }
  sim.ticks += 1
}

/**
 * Der Bereich, den die Knoten einnehmen.
 *
 * **Warum es einen Anteil gibt.** Ein einzelner entlaufener Knoten — etwa ein
 * Blatt an einem Hub mit tausenden Kanten — würde die Einpassung sonst so weit
 * aufziehen, daß der eigentliche Graph als Punkt erscheint. Mit `anteil` werden
 * die äußersten Werte je Achse abgeschnitten.
 *
 * @param sim - das Layout
 * @param anteil - der Anteil je Seite, der abgeschnitten wird (0 = nichts)
 * @returns die Grenzen; ohne Knoten ein Punkt um den Ursprung
 */
export function grenzen(
  sim: Sim,
  anteil = 0,
): { minX: number; minY: number; maxX: number; maxY: number } {
  if (sim.nodes.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  const xs = sim.nodes.map((knoten) => knoten.x).sort((a, b) => a - b)
  const ys = sim.nodes.map((knoten) => knoten.y).sort((a, b) => a - b)
  const ab = Math.min(0.2, Math.max(0, anteil))
  const unten = Math.floor(xs.length * ab)
  const oben = Math.max(unten, xs.length - 1 - unten)
  const minX = xs[unten] ?? 0
  const maxX = xs[oben] ?? 0
  const minY = ys[unten] ?? 0
  const maxY = ys[oben] ?? 0
  return { minX, minY, maxX, maxY }
}
