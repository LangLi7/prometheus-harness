/**
 * **Die sichtbare Objektfläche.**
 *
 * Trennung wie beim Dock: `canvas-objects.ts` rechnet (rein, prüfbar), diese Datei **nimmt an und
 * malt**. Wer die Regeln ändert, ändert `canvas-objects.ts`; wer das Aussehen ändert, ändert hier.
 *
 * ── Was hier passiert ───────────────────────────────────────────────────────────────────
 *
 *   - **Annehmen**: eine Datei fällt auf `#screen-os`, wird zu einem Objekt.
 *   - **Malen**: je Objekt eine Karte (`.cobj`) an ihrer Stelle in Bildpunkten.
 *   - **Ziehen**: anfassen, bewegen, loslassen — die Lage wird gespeichert.
 *   - **Zeigen**: wer eine Datei über die Fläche zieht, sieht das **bevor** er loslässt.
 *
 * ── Die Entscheidung, die den Rest bestimmt ─────────────────────────────────────────────
 *
 * Die Karten liegen in **Bildpunkten**, nicht in Weltkoordinaten (Begründung in `canvas-objects.ts`).
 * Damit hängt ihre Lage **nicht** am 3D-Zoom: man kann hineinzoomen, und die Karte bleibt an ihrem
 * Platz und greifbar. Das ist der Unterschied zu einem Objekt **in** der Welt.
 */
import {
  CARD,
  dropPosition,
  kindOf,
  loadLayout,
  makeId,
  moveObject,
  objectAt,
  removeObject,
  saveLayout,
} from './canvas-objects'
import type { CanvasLayout, CanvasObject } from './canvas-objects'
// Die Zeichen kommen aus EINER Quelle (packages/assets/icons) — keine Schriftzeichen mehr.
import { iconMarkup } from '@prometheus-harness/icons'

export interface CanvasCallbacks {
  /** Uebersetzer — die Beschriftungen sind Saetze und gehoeren ins Sprachpaket. */
  readonly tr?: (key: string, werte?: Readonly<Record<string, string | number>>) => string
  /** Was gerade abgelegt wurde — fuer die Meldung im Terminal und fuer die Messung. */
  readonly onAdded?: (objekt: CanvasObject) => void
}

export class CanvasObjects {
  private readonly host: HTMLElement
  private readonly room: string
  private readonly callbacks: CanvasCallbacks
  private layout: CanvasLayout
  private readonly layer: HTMLElement
  private readonly meldung: HTMLElement
  /** Wird gerade eine Datei ueber der Flaeche gehalten? Dann zeigt sich die Meldung. */
  private schwebt = false
  private drag: { readonly id: string; readonly dx: number; readonly dy: number } | null = null

  constructor(host: HTMLElement, room: string, callbacks: CanvasCallbacks = {}) {
    this.host = host
    this.room = room
    this.callbacks = callbacks
    this.layout = loadLayout(room)

    /*
     * **Zwei Ebenen, zwei Aufgaben.**
     *
     * `layer` traegt die Karten und **muss** Zeigerereignisse annehmen (sonst kann man sie nicht
     * ziehen). `meldung` ist die Anzeige „hier ablegen" — sie darf **keine** annehmen, sonst liegt sie
     * beim Ziehen im Weg und die Datei fällt auf die Meldung statt auf die Flaeche. Genau dieser Fehler
     * ist beim Dock schon einmal passiert („die Kernflaeche lag ueber der Flaeche").
     */
    this.layer = document.createElement('div')
    this.layer.className = 'canvasobj'
    this.layer.dataset.canvasObjects = '1'

    this.meldung = document.createElement('div')
    this.meldung.className = 'cobjdrop'
    this.meldung.textContent = this.label('canvas.drop')
    this.meldung.hidden = true

    host.appendChild(this.layer)
    host.appendChild(this.meldung)

    this.installDrop()
    this.render()
  }

  getLayout(): CanvasLayout {
    return this.layout
  }

  /** Wie viele Objekte liegen in der Flaeche? — fuer Werkzeuge und Tests. */
  get anzahl(): number {
    return this.layout.objects.length
  }

  private label(key: string): string {
    return this.callbacks.tr?.(key) ?? ''
  }

  private persist(): void {
    saveLayout(this.layout, this.room)
  }

  /**
   * **Annehmen und ziehen — dieselben Ereignisse, zwei Wege.**
   *
   * `dragover` **muss** `preventDefault` rufen. Ohne diese Zeile sagt der Browser „hier darf nichts
   * fallen", und `drop` feuert **gar nicht** — man zieht eine Datei über die Fläche und nichts
   * passiert, ohne Fehlermeldung. Das ist der klassische Fehler bei Drag & Drop im Browser.
   *
   * `dragenter`/`dragleave` zaehlen mit: `dragleave` feuert auch beim Wechsel zwischen **Kindern** der
   * Flaeche, und ohne Zaehler flackerte die Meldung bei jeder Bewegung.
   */
  private installDrop(): void {
    let tiefe = 0

    this.host.addEventListener('dragenter', (event) => {
      if (!this.hatDateien(event)) return
      event.preventDefault()
      tiefe++
      if (!this.schwebt) {
        this.schwebt = true
        this.meldung.hidden = false
        this.host.classList.add('zieht-datei')
      }
    })

    this.host.addEventListener('dragover', (event) => {
      if (!this.hatDateien(event)) return
      // Ohne diese Zeile kein `drop` — siehe oben.
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    })

    this.host.addEventListener('dragleave', (event) => {
      if (!this.hatDateien(event)) return
      tiefe = Math.max(0, tiefe - 1)
      if (tiefe === 0 && this.schwebt) {
        this.schwebt = false
        this.meldung.hidden = true
        this.host.classList.remove('zieht-datei')
      }
    })

    this.host.addEventListener('drop', (event) => {
      if (!this.hatDateien(event)) return
      event.preventDefault()
      tiefe = 0
      this.schwebt = false
      this.meldung.hidden = true
      this.host.classList.remove('zieht-datei')

      const liste = event.dataTransfer?.files
      if (!liste || liste.length === 0) return
      const kasten = this.host.getBoundingClientRect()
      const fenster = { b: kasten.width, h: kasten.height }
      for (let i = 0; i < liste.length; i++) {
        const datei = liste.item(i)
        if (!datei) continue
        this.add(datei.name, datei.size, event.clientX - kasten.left, event.clientY - kasten.top, fenster, i)
      }
    })
  }

  /** Wurden wirklich **Dateien** gezogen? Ein Textzug aus der Seite hat keine. */
  private hatDateien(event: DragEvent): boolean {
    const typen = event.dataTransfer?.types
    if (!typen) return false
    return [...typen].includes('Files')
  }

  /**
   * **Ein Objekt hinzufuegen.**
   *
   * Oeffentlich, weil zwei Wege hierher fuehren: der Drop von aussen **und** spaeter ein Befehl
   * („lege diese Datei in den Workspace"). Ein zweiter Weg, der die Anordnung selbst schreibt, waere
   * eine zweite Wahrheit ueber dieselbe Sache.
   */
  add(
    name: string,
    size: number,
    x: number,
    y: number,
    fenster: { readonly b: number; readonly h: number },
    versatz = 0,
  ): CanvasObject {
    const stelle = dropPosition(x, y, fenster, versatz)
    const objekt: CanvasObject = {
      id: makeId(name, size, Date.now() + versatz),
      name,
      kind: kindOf(name),
      size,
      x: stelle.x,
      y: stelle.y,
    }
    this.layout = { ...this.layout, objects: [...this.layout.objects, objekt] }
    this.persist()
    this.render()
    this.callbacks.onAdded?.(objekt)
    return objekt
  }

  /** Ein Objekt entfernen — oeffentlich aus demselben Grund wie `add`. */
  remove(id: string): boolean {
    if (!this.layout.objects.some((o) => o.id === id)) return false
    this.layout = removeObject(this.layout, id)
    this.persist()
    this.render()
    return true
  }

  /** Alles entfernen — fuer „zuruecksetzen". */
  clear(): void {
    this.layout = { objects: [], version: this.layout.version }
    this.persist()
    this.render()
  }

  /**
   * **Was liegt an dieser Stelle?**
   *
   * Oeffentlich, weil das der **zweite** Weg ist, ein Objekt zu treffen: der erste ist der Zeiger auf
   * der Karte, dieser hier rechnet mit einer **Stelle**. Damit kann die Anwendung fragen („was liegt
   * unter der Mitte?"), ohne den DOM zu durchsuchen — und die Regel „das oberste gewinnt" steht an
   * **einer** Stelle (`objectAt` in `canvas-objects.ts`) statt zweimal.
   */
  at(x: number, y: number): CanvasObject | null {
    return objectAt(this.layout, x, y)
  }

  /**
   * **Die Karten malen.**
   *
   * `replaceChildren` und dann neu aufbauen ist hier richtig: es sind wenige Karten, und ein
   * **Ziehen** laeuft ueber `style.left/top` **ohne** Neubau (siehe `installDrag`) — sonst wuerde die
   * Karte unter dem Zeiger bei jeder Bewegung neu erzeugt und `setPointerCapture` verlieren.
   */
  private render(): void {
    this.layer.replaceChildren()
    for (const objekt of this.layout.objects) {
      this.layer.appendChild(this.karte(objekt))
    }
  }

  private karte(objekt: CanvasObject): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cobj'
    el.dataset.objekt = objekt.id
    el.dataset.art = objekt.kind
    el.style.left = `${objekt.x}px`
    el.style.top = `${objekt.y}px`
    el.style.width = `${CARD.w}px`
    el.tabIndex = 0
    el.title = `${objekt.name} · ${formatBytes(objekt.size)}`

    const kopf = document.createElement('div')
    kopf.className = 'cobjart'
    kopf.textContent = objekt.kind

    const name = document.createElement('div')
    name.className = 'cobjname'
    name.textContent = objekt.name

    const groesse = document.createElement('div')
    groesse.className = 'cobjgroesse'
    groesse.textContent = formatBytes(objekt.size)

    const weg = document.createElement('button')
    weg.type = 'button'
    weg.className = 'cobjx'
    weg.innerHTML = iconMarkup('close')
    weg.title = this.label('canvas.remove')
    weg.addEventListener('pointerdown', (event) => event.stopPropagation())
    weg.addEventListener('click', (event) => {
      event.stopPropagation()
      this.remove(objekt.id)
    })

    el.append(kopf, name, groesse, weg)
    this.installDrag(el, objekt)
    return el
  }

  /**
   * **Ziehen — mit `setPointerCapture`.**
   *
   * Ohne die Capture verliert die Karte den Zeiger, sobald er sie verlaesst, und das Ziehen bricht ab.
   * Mit ihr bekommt **die Karte** alle Bewegungen, auch ausserhalb ihrer selbst — wie beim Panelkopf im
   * Dock.
   *
   * **Und der Klick auf „✕" zieht nicht.** Der Knopf ruft `stopPropagation` beim `pointerdown`; ohne
   * das faengt der Kopf den Zeiger und die Karte wandert statt zu verschwinden.
   */
  private installDrag(el: HTMLElement, objekt: CanvasObject): void {
    el.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement).closest('button')) return
      event.preventDefault()
      const kasten = this.host.getBoundingClientRect()
      this.drag = {
        id: objekt.id,
        dx: event.clientX - kasten.left - objekt.x,
        dy: event.clientY - kasten.top - objekt.y,
      }
      el.setPointerCapture(event.pointerId)
      el.classList.add('zieht')
    })

    el.addEventListener('pointermove', (event) => {
      if (!this.drag || this.drag.id !== objekt.id) return
      const kasten = this.host.getBoundingClientRect()
      const x = event.clientX - kasten.left - this.drag.dx
      const y = event.clientY - kasten.top - this.drag.dy
      // **Nur die Lage im Stil, kein Neubau** — sonst verliert die Karte die Zeigerbindung.
      const imBild = moveObject(this.layout, objekt.id, x, y, { b: kasten.width, h: kasten.height })
      const neu = imBild.objects.find((o) => o.id === objekt.id)
      if (!neu) return
      el.style.left = `${neu.x}px`
      el.style.top = `${neu.y}px`
      this.layout = imBild
    })

    const los = (event: PointerEvent): void => {
      if (!this.drag || this.drag.id !== objekt.id) return
      this.drag = null
      el.classList.remove('zieht')
      el.releasePointerCapture(event.pointerId)
      this.persist()
    }
    el.addEventListener('pointerup', los)
    el.addEventListener('pointercancel', los)
  }
}

/**
 * **Bytes, wie man sie liest** — `1,2 MB` statt `1234567`.
 *
 * Die Datei meldet Bytes; ein Mensch liest Größenordnungen. Dezimal und nicht binär (`kB` = 1000),
 * weil das die Angabe ist, die auf Betriebssystemen steht — eine zweite Zählweise wäre eine zweite
 * Wahrheit über dieselbe Datei.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1000) return `${Math.round(bytes)} B`
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} kB`
  if (bytes < 1000 * 1000 * 1000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`
}
