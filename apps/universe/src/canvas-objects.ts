/**
 * **Objekte in der Fläche — Dateien, die man hineinlegt und verschiebt.**
 *
 * ── Der Auftrag, und warum er in Stufen gebaut wird ─────────────────────────────────────
 *
 * Betreiber: „**also objecte aka datei möglichkeit drag and drop genauso später zb in eine art
 * workspaces definieren zu was es gehört also kann man und daraus die möglichkeit geben das der harness
 * Prometheus diese datei sieht sozusagen das es ein Workspaces Datei folder existiert**".
 *
 * Das sind **drei** Dinge, und sie bauen aufeinander:
 *
 *   1. **Ablegen und verschieben** — diese Datei. Eine Datei fällt in die Fläche, bleibt liegen und
 *      lässt sich ziehen. Sichtbar und prüfbar.
 *   2. **Einem Workspace zuordnen** — zu was gehört die Datei. Kommt später.
 *   3. **Der Harness sieht sie** — über einen echten Datei-Ordner, damit Prometheus damit arbeiten
 *      kann. Kommt zuletzt, weil es die Schnittstelle zum Wirt braucht.
 *
 * ── Die eine Entscheidung, die alles andere bestimmt ────────────────────────────────────
 *
 * **Die Objekte liegen in BILDPUNKTEN, nicht in Weltkoordinaten.** In `docs/design/img/other/drawdb.png`
 * liegen die Tabellen in der Fläche und werden in Bildpunkten verschoben — die Ansicht zoomt, die
 * Objekte bleiben bedienbar. Genau so ist es hier: man legt eine Datei ab, sie bleibt an ihrem Platz,
 * und der 3D-Zoom darunter ändert daran nichts.
 *
 * **Warum das richtig ist und nicht bequem.** Ein Objekt in Weltkoordinaten wäre beim Herauszoomen nach
 * zwei Ebenen ein Punkt — und nicht mehr anzufassen. In Bildpunkten bleibt es ein **Objekt**, egal
 * welcher Maßstab darunter liegt. Das ist derselbe Gedanke wie beim Raster-Versuch: der Bezug kommt
 * aus dem, was man **hineinlegt**.
 *
 * Alles Zustandslogische ist **rein** (kein DOM), damit es ohne Browser prüfbar ist.
 */
import { storageKey } from './room'

/** Ein abgelegtes Objekt. Die Lage steht in **Bildpunkten** relativ zur Fläche. */
export interface CanvasObject {
  readonly id: string
  /** Was auf der Karte steht — der Dateiname. */
  readonly name: string
  /** Die Art, aus der Dateiendung abgeleitet (`pdf`, `ts`, `md`, …). */
  readonly kind: string
  /** Die Groesse in Bytes, wie sie die Datei meldet. */
  readonly size: number
  readonly x: number
  readonly y: number
}

export interface CanvasLayout {
  readonly objects: readonly CanvasObject[]
  readonly version?: number
}

/**
 * **Die Fassung der Anordnung.** Passt sie nicht, wird die Ablage verworfen und die Voreinstellung
 * gilt — dieselbe Regel wie beim Dock (`LAYOUT_VERSION`): eine geänderte Voreinstellung muss
 * **ankommen**, auch bei jemandem, der die Fläche schon benutzt hat.
 */
const LAYOUT_VERSION = 1
const STORAGE_NAME = 'canvas.v1'

/** Die Groesse einer Karte in Bildpunkten — dieselbe wie in `app.css` (`.cobj`). */
export const CARD = { w: 168, h: 56 } as const

/** Aus einem Dateinamen die Art ableiten: `bericht.pdf` → `pdf`. */
export function kindOf(name: string): string {
  const punkt = name.lastIndexOf('.')
  if (punkt <= 0 || punkt === name.length - 1) return 'datei'
  return name.slice(punkt + 1).toLowerCase()
}

/**
 * **Eine eindeutige Kennung — aus Name, Groesse und der Zeit.**
 *
 * `crypto.randomUUID` waere kürzer, gibt es aber nicht überall (und in den Tests ohne Netz erst recht
 * nicht). Der Name allein genügt nicht: zwei Dateien dürfen gleich heissen, und dann wären es zwei
 * Objekte mit derselben Kennung — die Suche fände das falsche.
 */
export function makeId(name: string, size: number, jetzt = Date.now()): string {
  const sauber = name.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 24)
  return `${sauber || 'objekt'}-${size}-${jetzt.toString(36)}`
}

/**
 * **Wohin eine neue Datei fällt.**
 *
 * Sie landet dort, wo sie abgelegt wurde — aber **nicht genau darunter**: ein Objekt direkt unter dem
 * Zeiger verdeckt ihn, und beim nächsten Ablegen läge das zweite genau auf dem ersten. Der kleine
 * Versatz macht aus einem Stapel eine Reihe.
 *
 * **Und sie bleibt im Bild.** Eine Karte, die halb über den Rand ragt, ist nicht mehr zu greifen —
 * dieselbe Regel wie bei `stationPlacement` im Dock: die Stelle gibt die Richtung, das Bild die Grenze.
 */
export function dropPosition(
  x: number,
  y: number,
  fenster: { readonly b: number; readonly h: number },
  versatz = 0,
): { readonly x: number; readonly y: number } {
  const kaskade = versatz * 22
  return {
    x: Math.round(Math.max(4, Math.min(x - CARD.w / 2 + kaskade, fenster.b - CARD.w - 4))),
    y: Math.round(Math.max(4, Math.min(y - CARD.h / 2 + kaskade, fenster.h - CARD.h - 4))),
  }
}

/** Ein Objekt an eine neue Stelle schieben — auf ganze Bildpunkte und im Bild. */
export function moveObject(
  layout: CanvasLayout,
  id: string,
  x: number,
  y: number,
  fenster: { readonly b: number; readonly h: number },
): CanvasLayout {
  return {
    ...layout,
    objects: layout.objects.map((o) =>
      o.id === id
        ? {
            ...o,
            x: Math.round(Math.max(4, Math.min(x, fenster.b - CARD.w - 4))),
            y: Math.round(Math.max(4, Math.min(y, fenster.h - CARD.h - 4))),
          }
        : o,
    ),
  }
}

/** Ein Objekt entfernen. */
export function removeObject(layout: CanvasLayout, id: string): CanvasLayout {
  return { ...layout, objects: layout.objects.filter((o) => o.id !== id) }
}

/**
 * **Welches Objekt liegt unter dem Zeiger?**
 *
 * Von **hinten** gesucht: das zuletzt abgelegte liegt oben, und wer klickt, meint das, was er sieht.
 * Eine Suche von vorne träfe das verdeckte darunter — ein Fehler, der nur bei überlappenden Karten
 * auffällt.
 */
export function objectAt(layout: CanvasLayout, x: number, y: number): CanvasObject | null {
  for (let i = layout.objects.length - 1; i >= 0; i--) {
    const o = layout.objects[i]
    if (!o) continue
    if (x >= o.x && x <= o.x + CARD.w && y >= o.y && y <= o.y + CARD.h) return o
  }
  return null
}

/** Der leere Anfang — die Fläche startet leer, wie das Universe selbst. */
export function emptyLayout(): CanvasLayout {
  return { objects: [], version: LAYOUT_VERSION }
}

export function loadLayout(room: string): CanvasLayout {
  const fallback = emptyLayout()
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(room, STORAGE_NAME))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<CanvasLayout>
    if (!Array.isArray(parsed.objects)) return fallback
    if (parsed.version !== LAYOUT_VERSION) return fallback
    /*
     * **Jedes Objekt wird geprüft, nicht geglaubt.** Eine Ablage kann von Hand geändert oder von einer
     * älteren Fassung geschrieben worden sein. Ein Objekt ohne Zahlen wäre im Bild eine Karte an der
     * Stelle `NaN` — unsichtbar und nicht zu greifen.
     */
    const objects = parsed.objects.filter(
      (o): o is CanvasObject =>
        !!o &&
        typeof o.id === 'string' &&
        typeof o.name === 'string' &&
        typeof o.kind === 'string' &&
        typeof o.size === 'number' &&
        Number.isFinite(o.x) &&
        Number.isFinite(o.y),
    )
    return { objects, version: LAYOUT_VERSION }
  } catch {
    // Beschaedigter Speicher darf den Start nie verhindern.
    return fallback
  }
}

export function saveLayout(layout: CanvasLayout, room: string): void {
  try {
    globalThis.localStorage?.setItem(storageKey(room, STORAGE_NAME), JSON.stringify(layout))
  } catch {
    // Voller Speicher oder Privatmodus: kein Grund, die Objekte zu verlieren.
  }
}
