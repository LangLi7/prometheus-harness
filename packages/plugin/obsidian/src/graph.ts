/**
 * **Der Notizgraph — Ausschnitt, Nachbarschaft und Lage.**
 *
 * Die Liste zeigt Notizen, die Vorschau zeigt eine. Was fehlte, ist das, was
 * Obsidian selbst *Graph-Ansicht* nennt: Notizen als Knoten, `[[Verweise]]` als
 * Kanten. Dieses Modul rechnet dafür alles, was **nicht** gezeichnet wird —
 * damit es ohne Browser prüfbar bleibt:
 *
 * | Frage | Funktion |
 * |---|---|
 * | *welche Notizen liegen um diese herum?* | {@link baueAusschnitt} |
 * | *wer verweist auf diese Notiz, und wohin verweist sie?* | {@link nachbarschaft} |
 * | *wo liegen die Knoten?* | {@link lege} |
 *
 * ## Warum ein Ausschnitt und nicht der ganze Vault
 *
 * Der Vault dieses Rechners hat **678 Notizen und 3 937 Kanten** (gemessen am
 * 21.10.2026 im Panel). Ein Gesamtbild davon ist ein Knäuel, in dem man nichts
 * findet — Obsidian selbst bietet für genau diesen Grund die *lokale* Graph-Ansicht
 * an. Der Ausschnitt ist der Standard; „ganzer Vault" bleibt eine bewußte Wahl.
 *
 * ## Warum das Layout reproduzierbar ist
 *
 * Die Startpunkte kommen aus der Kennung (FNV-1a → zwei Winkel), nicht aus
 * `Math.random`. Derselbe Ausschnitt ergibt damit dasselbe Bild — sonst sähe jede
 * Auswahl anders aus, und ein Wechsel der Notiz wäre ein Sprung im Bild.
 *
 * @module @prometheus-harness/obsidian/graph
 */

/** Ein Knoten, wie ihn `GET /api/world/obsidian/graph` liefert. */
export interface GraphKnoten {
  readonly id: string
  readonly label: string
  readonly kind?: string
  readonly path?: string
}

/** Eine Kante, wie sie die Route liefert: Kennungen mit `obsidian:`-Präfix. */
export interface GraphKante {
  readonly from: string
  readonly to: string
}

/** Was der Graph als Ganzes ist. */
export interface VaultGraph {
  readonly nodes: readonly GraphKnoten[]
  readonly edges: readonly GraphKante[]
}

/** Ein Knoten im Ausschnitt, mit dem Grad innerhalb des Ausschnitts. */
export interface AusschnittKnoten {
  readonly id: string
  readonly label: string
  readonly path: string | null
  /** Wie viele Kanten ihn **im Ausschnitt** berühren. */
  readonly grad: number
  /** Liegt er auf der gewählten Notiz? */
  readonly mitte: boolean
  /** Abstand zur Mitte in Kanten (0 = die Notiz selbst). */
  readonly tiefe: number
}

/** Eine Kante im Ausschnitt. */
export interface AusschnittKante {
  readonly von: string
  readonly nach: string
}

/** Der Ausschnitt, den die Ansicht zeichnet. */
export interface Ausschnitt {
  readonly knoten: readonly AusschnittKnoten[]
  readonly kanten: readonly AusschnittKante[]
  /** Wie viele Notizen der Vault insgesamt hat — für „12 von 678". */
  readonly gesamt: number
  /** Wurde wegen der Obergrenze abgeschnitten? */
  readonly gekappt: boolean
}

/** Mehr Knoten zeichnet die Ansicht nicht — darüber ist es kein Bild mehr. */
export const HOECHSTENS = 400

/**
 * Die Nachbarschaft einer Notiz bis zu einer Tiefe.
 *
 * Breitensuche über die Kanten in **beide** Richtungen: ein Verweis, der hierher
 * zeigt, gehört genauso zur Umgebung wie einer, der hinausführt. Genau das ist
 * der Unterschied zwischen „was ich verlinkt habe" und „wer mich verlinkt".
 *
 * @param graph - der ganze Vault-Graph
 * @param mitte - Kennung der gewählten Notiz (`obsidian:Pfad.md`)
 * @param tiefe - wie viele Kanten weit (1 = direkte Nachbarn)
 * @param hoechstens - Obergrenze der Knoten
 * @returns der Ausschnitt; ohne Treffer ein leerer mit `gesamt`
 */
export function baueAusschnitt(
  graph: VaultGraph,
  mitte: string | null,
  tiefe = 1,
  hoechstens = HOECHSTENS,
): Ausschnitt {
  const notizen = graph.nodes.filter((knoten) => knoten.kind === 'note')
  const gesamt = notizen.length
  if (mitte === null || !notizen.some((knoten) => knoten.id === mitte)) {
    return { knoten: [], kanten: [], gesamt, gekappt: false }
  }

  // Nachbarschaftsliste in beide Richtungen — einmal aufgebaut, zweimal benutzt.
  const nachbarn = new Map<string, string[]>()
  for (const kante of graph.edges) {
    if (kante.from === kante.to) continue
    const a = nachbarn.get(kante.from)
    if (a === undefined) nachbarn.set(kante.from, [kante.to])
    else a.push(kante.to)
    const b = nachbarn.get(kante.to)
    if (b === undefined) nachbarn.set(kante.to, [kante.from])
    else b.push(kante.from)
  }

  const abstand = new Map<string, number>([[mitte, 0]])
  const reihe = [mitte]
  let gekappt = false
  while (reihe.length > 0) {
    const hier = reihe.shift()
    if (hier === undefined) break
    const d = abstand.get(hier) ?? 0
    if (d >= tiefe) continue
    for (const ziel of nachbarn.get(hier) ?? []) {
      if (abstand.has(ziel)) continue
      if (abstand.size >= hoechstens) {
        gekappt = true
        continue
      }
      abstand.set(ziel, d + 1)
      reihe.push(ziel)
    }
  }

  const bekannt = new Map(notizen.map((knoten) => [knoten.id, knoten]))
  /*
   * **Die Kante wird übersetzt, nicht durchgereicht.** Die Route liefert
   * `{ from, to }`; der Ausschnitt spricht `{ von, nach }`. Stand hier die rohe
   * Kante, las die Ansicht `undefined` — und weil Bun beim Testen nur Typen
   * entfernt, fiel das erst im Browser auf. Der Test hat es gefunden.
   */
  const kanten: AusschnittKante[] = graph.edges
    .filter((kante) => abstand.has(kante.from) && abstand.has(kante.to) && kante.from !== kante.to)
    .map((kante) => ({ von: kante.from, nach: kante.to }))
  const grad = new Map<string, number>()
  for (const kante of kanten) {
    grad.set(kante.von, (grad.get(kante.von) ?? 0) + 1)
    grad.set(kante.nach, (grad.get(kante.nach) ?? 0) + 1)
  }
  const knoten = [...abstand.entries()]
    .map(([id, tiefe]) => {
      const quelle = bekannt.get(id)
      return {
        id,
        label: quelle?.label ?? id,
        path: quelle?.path ?? null,
        grad: grad.get(id) ?? 0,
        mitte: id === mitte,
        tiefe,
      }
    })
    // Die Mitte zuerst, dann die besser vernetzten — so steht das Wichtige vorn.
    .sort((a, b) => Number(b.mitte) - Number(a.mitte) || b.grad - a.grad || a.label.localeCompare(b.label, 'de'))

  return { knoten, kanten, gesamt, gekappt }
}

/** Wer zeigt hierher, wohin zeigt diese Notiz. */
export interface Nachbarschaft {
  /** Notizen, die auf diese verweisen („backlinks"). */
  readonly eingehend: readonly GraphKnoten[]
  /** Notizen, auf die diese verweist. */
  readonly ausgehend: readonly GraphKnoten[]
}

/**
 * Die beiden Verweisrichtungen einer Notiz — getrennt, weil sie zwei Fragen sind.
 *
 * „Wer verweist auf mich" ist die Frage, die man beim Lesen hat; „wohin verweise
 * ich" die beim Aufräumen. Eine gemeinsame Liste beantwortet keine von beiden.
 *
 * @param graph - der ganze Vault-Graph
 * @param id - Kennung der Notiz
 * @returns die beiden Richtungen, je ohne Doppelte und alphabetisch
 */
export function nachbarschaft(graph: VaultGraph, id: string | null): Nachbarschaft {
  if (id === null) return { eingehend: [], ausgehend: [] }
  const bekannt = new Map(graph.nodes.map((knoten) => [knoten.id, knoten]))
  const eingehend = new Set<string>()
  const ausgehend = new Set<string>()
  for (const kante of graph.edges) {
    if (kante.to === id && kante.from !== id) eingehend.add(kante.from)
    if (kante.from === id && kante.to !== id) ausgehend.add(kante.to)
  }
  const sammle = (ids: Set<string>): GraphKnoten[] =>
    [...ids]
      .map((kennung) => bekannt.get(kennung))
      .filter((knoten): knoten is GraphKnoten => knoten !== undefined)
      .sort((a, b) => a.label.localeCompare(b.label, 'de'))
  return { eingehend: sammle(eingehend), ausgehend: sammle(ausgehend) }
}

/** Ein Knoten mit Lage im Bild. */
export interface GelegtKnoten extends AusschnittKnoten {
  readonly x: number
  readonly y: number
  /** Kantenlänge des Punkts — die Mitte und gut vernetzte Knoten sind größer. */
  readonly r: number
}

/** Das gelegte Bild. */
export interface Lage {
  readonly knoten: readonly GelegtKnoten[]
  /** Die Kanten als Punktpaare — dieselbe Reihenfolge wie im Ausschnitt. */
  readonly kanten: readonly { readonly von: GelegtKnoten; readonly nach: GelegtKnoten }[]
  readonly breite: number
  readonly hoehe: number
}

/** FNV-1a über die Kennung — billig, stabil, ohne Zufall. */
function streuung(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h / 0xffffffff
}

/**
 * **Ein laufendes Layout — Knoten mit Geschwindigkeit, Kanten als Indizes.**
 *
 * Der Unterschied zu {@link lege}: hier wird **schrittweise** gerechnet, damit
 * die Ansicht jeden Bildtakt zeichnen kann, statt einmal 220 Schritte im
 * Speicher zu verrechnen und dann stillzustehen. Genau das macht den Unterschied
 * zwischen „Bild erscheint" und „Graph läuft".
 */
export interface LaufKnoten extends AusschnittKnoten {
  x: number
  y: number
  vx: number
  vy: number
  /** Kantenlänge des Punkts. */
  readonly r: number
  /** Festgehalten (die Mitte, oder ein gezogener Knoten). */
  fest: boolean
}

/** Ein laufendes Layout. */
export interface Lauf {
  readonly knoten: LaufKnoten[]
  readonly kanten: readonly { readonly a: number; readonly b: number }[]
  readonly breite: number
  readonly hoehe: number
  /** Wie viele Schritte schon gerechnet wurden. */
  ticks: number
}

/** So stark stoßen sich Knoten ab. */
const ABSTOSSUNG = 2600
/** So stark ziehen Kanten. */
const FEDER = 0.035
/** Die Länge, bei der eine Feder nichts mehr tut. */
const RUHELAENGE = 70
/** So stark zieht der Ursprung. */
const SCHWERKRAFT = 0.006
/** Was von der Geschwindigkeit je Schritt übrig bleibt. */
const DAEMPFUNG = 0.86
/** Schneller als das wird kein Knoten je Schritt. */
const MAX_TEMPO = 14

/**
 * Startet ein Layout.
 *
 * @param ausschnitt - der Ausschnitt
 * @param breite - Zeichenfläche
 * @param hoehe - Zeichenfläche
 * @returns der laufende Zustand
 */
export function starteLauf(ausschnitt: Ausschnitt, breite = 760, hoehe = 460): Lauf {
  const mx = breite / 2
  const my = hoehe / 2
  const radius = Math.min(breite, hoehe) * 0.36
  const knoten: LaufKnoten[] = ausschnitt.knoten.map((knoten) => {
    const s = streuung(knoten.id)
    const winkel = s * Math.PI * 2
    const r = radius * (0.5 + 0.5 * streuung(`${knoten.id}#`))
    const x = knoten.mitte ? mx : mx + Math.cos(winkel) * r
    const y = knoten.mitte ? my : my + Math.sin(winkel) * r
    return {
      ...knoten,
      x,
      y,
      vx: 0,
      vy: 0,
      r: knoten.mitte ? 9 : 3.5 + Math.min(6, Math.sqrt(knoten.grad) * 1.6),
      fest: knoten.mitte,
    }
  })
  const index = new Map(knoten.map((k, i) => [k.id, i]))
  const kanten = ausschnitt.kanten
    .map((kante) => ({ a: index.get(kante.von), b: index.get(kante.nach) }))
    .filter((kante): kante is { a: number, b: number } => kante.a !== undefined && kante.b !== undefined)
  return { knoten, kanten, breite, hoehe, ticks: 0 }
}

/**
 * Rechnet **einen** Schritt.
 *
 * Abstoßung, Federn, Schwerkraft — mit Geschwindigkeit und Dämpfung statt mit
 * harter Kühlung. Dadurch schwingt das Bild ein, statt zu springen; und ein
 * gezogener Knoten (fest) reißt seine Nachbarn mit, weil die Federn weiterwirken.
 *
 * @param lauf - der Zustand; wird verändert
 */
export function schreibeSchritt(lauf: Lauf): void {
  const { knoten, kanten, breite, hoehe } = lauf
  const n = knoten.length
  if (n === 0) return
  const mx = breite / 2
  const my = hoehe / 2
  const fx = new Float64Array(n)
  const fy = new Float64Array(n)

  for (let i = 0; i < n; i += 1) {
    const a = knoten[i]
    if (a === undefined) continue
    for (let j = i + 1; j < n; j += 1) {
      const b = knoten[j]
      if (b === undefined) continue
      const dx = a.x - b.x
      const dy = a.y - b.y
      const d2 = dx * dx + dy * dy + 40
      const d = Math.sqrt(d2)
      const kraft = ABSTOSSUNG / d2
      const ux = (dx / d) * kraft
      const uy = (dy / d) * kraft
      fx[i]! += ux
      fy[i]! += uy
      fx[j]! -= ux
      fy[j]! -= uy
    }
  }

  for (const kante of kanten) {
    const a = knoten[kante.a]
    const b = knoten[kante.b]
    if (a === undefined || b === undefined) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.sqrt(dx * dx + dy * dy) + 0.01
    const zug = (d - RUHELAENGE) * FEDER
    const ux = (dx / d) * zug
    const uy = (dy / d) * zug
    fx[kante.a]! += ux
    fy[kante.a]! += uy
    fx[kante.b]! -= ux
    fy[kante.b]! -= uy
  }

  for (let i = 0; i < n; i += 1) {
    const k = knoten[i]
    if (k === undefined) continue
    if (k.fest) {
      k.vx = 0
      k.vy = 0
      continue
    }
    fx[i]! += (mx - k.x) * SCHWERKRAFT
    fy[i]! += (my - k.y) * SCHWERKRAFT
    k.vx = (k.vx + fx[i]!) * DAEMPFUNG
    k.vy = (k.vy + fy[i]!) * DAEMPFUNG
    k.vx = Math.max(-MAX_TEMPO, Math.min(MAX_TEMPO, k.vx))
    k.vy = Math.max(-MAX_TEMPO, Math.min(MAX_TEMPO, k.vy))
    k.x += k.vx
    k.y += k.vy
    // Eine weiche Wand: der Graph darf über den Rand hinaus, aber nicht weg.
    if (k.x < -40) { k.x = -40; k.vx = 0 }
    if (k.x > breite + 40) { k.x = breite + 40; k.vx = 0 }
    if (k.y < -40) { k.y = -40; k.vy = 0 }
    if (k.y > hoehe + 40) { k.y = hoehe + 40; k.vy = 0 }
  }
  lauf.ticks += 1
}

/**
 * Ist das Bild zur Ruhe gekommen?
 *
 * @param lauf - der Zustand
 * @param grenze - ab welcher Geschwindigkeit „ruhig" gilt
 * @returns ob nichts mehr nennenswert wandert
 */
export function istRuhig(lauf: Lauf, grenze = 0.08): boolean {
  for (const k of lauf.knoten) {
    if (k.fest) continue
    if (Math.abs(k.vx) > grenze || Math.abs(k.vy) > grenze) return false
  }
  return true
}

/** Ein Knoten mit Lage im Bild. */
export interface GelegtKnoten extends AusschnittKnoten {
  readonly x: number
  readonly y: number
  /** Kantenlänge des Punkts — die Mitte und gut vernetzte Knoten sind größer. */
  readonly r: number
}

/** Das gelegte Bild. */
export interface Lage {
  readonly knoten: readonly GelegtKnoten[]
  /** Die Kanten als Punktpaare — dieselbe Reihenfolge wie im Ausschnitt. */
  readonly kanten: readonly { readonly von: GelegtKnoten; readonly nach: GelegtKnoten }[]
  readonly breite: number
  readonly hoehe: number
}

/**
 * Legt die Knoten in **einem** Zug aus — für Prüfungen und für Aufrufer, die
 * kein laufendes Bild brauchen.
 *
 * @param ausschnitt - der Ausschnitt
 * @param breite - Zeichenfläche
 * @param hoehe - Zeichenfläche
 * @param schritte - wie viele Rechenschritte
 * @returns die Lage; bei leerem Ausschnitt eine leere
 */
export function lege(ausschnitt: Ausschnitt, breite = 720, hoehe = 460, schritte = 220): Lage {
  if (ausschnitt.knoten.length === 0) return { knoten: [], kanten: [], breite, hoehe }
  const lauf = starteLauf(ausschnitt, breite, hoehe)
  for (let i = 0; i < schritte; i += 1) schreibeSchritt(lauf)
  const gelegt: GelegtKnoten[] = lauf.knoten.map((k) => ({
    id: k.id,
    label: k.label,
    path: k.path,
    grad: k.grad,
    mitte: k.mitte,
    tiefe: k.tiefe,
    x: k.x,
    y: k.y,
    r: k.r,
  }))
  const nachId = new Map(gelegt.map((k) => [k.id, k]))
  const kanten = lauf.kanten
    .map((kante) => ({ von: nachId.get(lauf.knoten[kante.a]?.id ?? ''), nach: nachId.get(lauf.knoten[kante.b]?.id ?? '') }))
    .filter((k): k is { von: GelegtKnoten, nach: GelegtKnoten } => k.von !== undefined && k.nach !== undefined)
  return { knoten: gelegt, kanten, breite, hoehe }
}