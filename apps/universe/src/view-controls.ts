/**
 * **Die Ansichts-Leiste — ein Strich, klickbar und scrollbar.**
 *
 * ── Was der Betreiber gesagt hat ────────────────────────────────────────────────────────
 *
 *   „**sieht scheisse aus nicht modern nicht scifi** und ich würde lieber den strich nutzen als button
 *    und als scrollen"
 *
 * Der erste Anlauf war ein **Kasten**: Kopfzeile „ANSICHT", ein grosser Ebenenname, der Abstand, und
 * zwei Knöpfe „−" und "+". Das ist die Form eines **Formulars**, nicht eines Instruments — und der
 * Harness sieht an dieser Stelle anders aus: dünne Striche, der **aktive** heller und länger, sonst
 * nichts. Diese Sprache ist aus `ui-layout` (Tab-Indikatoren, Spaltenmarken) bekannt.
 *
 * ── Was jetzt steht ─────────────────────────────────────────────────────────────────────
 *
 * **Sieben dünne Striche, einer je Bezugsebene** — von oben (feinster Blick) nach unten (weitester).
 * Der aktive Strich ist breit und hell, die anderen kurz und gedämpft. Kein Rahmen um die Gruppe,
 * keine Knöpfe.
 *
 *   - **Klick auf einen Strich** springt auf diese Ebene.
 *   - **Rad über der Leiste** geht eine Ebene weiter — oder mehrere, je nach Radweg.
 *   - **Ziehen am Strich** (senkrecht) fährt durch die Ebenen, wie ein Regler.
 *   - **Der Name und der Abstand stehen unter der Gruppe**, klein und ruhig. Sie sind eine **Anzeige**,
 *     kein Bedienelement: wer sie liest, weiss, wo er ist; wer zoomt, sieht es mitwandern.
 *   - **„✕" nur beim Überfahren** — ein Objekt, das man wegräumen kann, soll das nicht anschreien.
 *
 * **Warum keine Knöpfe mehr.** „−" und "+" sind zwei Ziele, die eine Leiste in **einer** Bewegung
 * erledigt: man zeigt auf die Ebene, die man will. Das ist die kürzere Handlung — und die Richtung
 * dieses Projekts („steuern wie in einem CAD-Programm").
 *
 * **Und sie bleibt ein Objekt**: die ganze Gruppe ist am Titel zu ziehen, sie lässt sich schliessen und
 * über die Insel zurückholen.
 */
import { EBENEN_MAX, distanceForLevel, levelForDistance } from './camera'
import { LEVELS, realSize } from './universe'
import type { Level } from './universe'
// Die Zeichen kommen aus EINER Quelle (packages/assets/icons) — keine Schriftzeichen mehr.
import { iconMarkup } from '@prometheus-harness/icons'

export interface ViewControlsHandles {
  /** Der aktuelle Abstand — die Leiste liest ihn bei jedem Bild. */
  readonly abstand: () => number
  /** Auf einen bestimmten Abstand fahren. */
  readonly setzen: (abstand: number) => void
  readonly tr: (key: string, werte?: Readonly<Record<string, string | number>>) => string
  /**
   * **Ist die Oberflaeche deutsch?**
   *
   * Gebraucht fuer die **echte Groesse**: „10 Mio Lj" und „10 million ly" sind zwei Sprachen, und die
   * Zahl kommt aus `realSize(level, deutsch)`. Ohne diese Auskunft muesste die Leiste die Sprache
   * erraten — und Raten ist hier schon zweimal schiefgegangen.
   */
  readonly deutsch?: () => boolean
  /** Der gemerkte Zustand: Position und Sichtbarkeit. */
  readonly laden: () => { readonly x: number; readonly y: number; readonly offen: boolean }
  readonly merken: (zustand: { readonly x: number; readonly y: number; readonly offen: boolean }) => void
}

/** Die Richtung, in der die Striche gelesen werden: oben fein, unten weit. */
const SICHT = [...LEVELS].sort((a, b) => a.level - b.level)

export class ViewControls {
  private readonly el: HTMLElement
  private readonly striche = new Map<Level, HTMLElement>()
  private readonly ebeneText: HTMLElement
  private readonly abstandText: HTMLElement
  private x: number
  private y: number
  private offen: boolean
  private zieht: { dy: number; startEbene: number } | null = null
  private aktuelle: Level = 4

  constructor(
    host: HTMLElement,
    private readonly h: ViewControlsHandles,
  ) {
    const gemerkt = h.laden()
    this.x = gemerkt.x
    this.y = gemerkt.y
    this.offen = gemerkt.offen

    const el = document.createElement('div')
    el.className = 'viewctl'
    el.id = 'viewctl'
    el.dataset.viewControls = '1'
    el.setAttribute('role', 'slider')
    el.setAttribute('aria-valuemin', '1')
    el.setAttribute('aria-valuemax', String(SICHT.length))
    el.setAttribute('aria-label', h.tr('view.controls.title'))
    el.tabIndex = 0

    /*
     * **Die Kopfzeile ist nur noch ein Griff — und sie ist fast unsichtbar.**
     *
     * Der Harness hat an Instrumenten keine Titelzeile. Was es gibt, ist ein **Anfasser**: ein kurzer
     * Strich, der zeigt, wo man zieht. Beim Überfahren wird er sichtbar.
     */
    const griff = document.createElement('div')
    griff.className = 'vc-grip'
    griff.setAttribute('aria-hidden', 'true')

    const striche = document.createElement('div')
    striche.className = 'vc-ticks'
    for (const eintrag of SICHT) {
      const strich = document.createElement('button')
      strich.type = 'button'
      strich.className = 'vc-tick'
      strich.dataset.level = String(eintrag.level)
      strich.title = eintrag.label
      strich.setAttribute('aria-label', eintrag.label)
      strich.addEventListener('click', (event) => {
        event.stopPropagation()
        this.h.setzen(distanceForLevel(eintrag.level))
      })
      striche.appendChild(strich)
      this.striche.set(eintrag.level, strich)
    }

    const texte = document.createElement('div')
    texte.className = 'vc-read'
    this.ebeneText = document.createElement('span')
    this.ebeneText.className = 'vc-ebene'
    this.abstandText = document.createElement('span')
    this.abstandText.className = 'vc-abstand'
    texte.append(this.ebeneText, this.abstandText)

    const zu = document.createElement('button')
    zu.type = 'button'
    zu.className = 'vc-close'
    zu.innerHTML = iconMarkup('close')
    zu.title = h.tr('view.controls.hide')
    zu.setAttribute('aria-label', h.tr('view.controls.hide'))
    zu.addEventListener('click', (event) => {
      event.stopPropagation()
      this.setzeOffen(false)
    })

    el.append(zu, griff, striche, texte)
    host.appendChild(el)
    this.el = el

    this.setzePosition(this.x, this.y)
    this.setzeOffen(this.offen)

    /*
     * **Das Rad über der Leiste zoomt.**
     *
     * Ohne `preventDefault` scrollt die Seite mit — und die Leiste zuckt. `passive: false` ist dafür
     * Pflicht: mit einem passiven Hörcher darf man nicht abbrechen.
     */
    el.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault()
        const richtung = event.deltaY > 0 ? 1 : -1
        this.h.setzen(distanceForLevel(this.naechsteEbene(richtung)))
      },
      { passive: false },
    )

    /*
     * **Ziehen fährt durch die Ebenen** — wie ein Regler. Die Bewegung ist senkrecht, und **eine
     * Ebene je 18 px**: weniger wäre zu fein (man trifft nie), mehr zu grob (die Ebenen springen).
     */
    el.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement).closest('button')) return
      this.zieht = {
        dy: event.clientY,
        startEbene: levelForDistance(this.h.abstand()),
      }
      el.setPointerCapture(event.pointerId)
      el.classList.add('zieht')
      event.preventDefault()
    })
    el.addEventListener('pointermove', (event) => {
      if (!this.zieht) return
      const schritte = Math.round((event.clientY - this.zieht.dy) / 18)
      const ziel = Math.min(EBENEN_MAX, Math.max(1, this.zieht.startEbene + schritte)) as Level
      if (ziel !== levelForDistance(this.h.abstand())) this.h.setzen(distanceForLevel(ziel))
    })
    const los = (event: PointerEvent): void => {
      if (!this.zieht) return
      this.zieht = null
      el.classList.remove('zieht')
      el.releasePointerCapture(event.pointerId)
      this.merken()
    }
    el.addEventListener('pointerup', los)
    el.addEventListener('pointercancel', los)

    // Ziehen am Griff verschiebt **das Objekt**, nicht den Blick.
    griff.addEventListener('pointerdown', (event) => {
      const r = el.getBoundingClientRect()
      const dx = event.clientX - r.left
      const dy = event.clientY - r.top
      const bewegen = (m: PointerEvent): void => this.setzePosition(m.clientX - dx, m.clientY - dy)
      const ende = (): void => {
        window.removeEventListener('pointermove', bewegen)
        window.removeEventListener('pointerup', ende)
        this.merken()
      }
      window.addEventListener('pointermove', bewegen)
      window.addEventListener('pointerup', ende)
      event.preventDefault()
      event.stopPropagation()
    })

    el.addEventListener('keydown', (event) => {
      if (event.key === '+' || event.key === '=' || event.key === 'ArrowUp') {
        this.h.setzen(distanceForLevel(this.naechsteEbene(-1)))
      } else if (event.key === '-' || event.key === '_' || event.key === 'ArrowDown') {
        this.h.setzen(distanceForLevel(this.naechsteEbene(1)))
      } else {
        return
      }
      event.preventDefault()
    })
  }

  /** Die nächste Ebene in dieser Richtung — begrenzt auf 1 … 7. */
  private naechsteEbene(richtung: -1 | 1): Level {
    const jetzt = levelForDistance(this.h.abstand())
    return Math.min(EBENEN_MAX, Math.max(1, jetzt + richtung)) as Level
  }

  private setzePosition(x: number, y: number): void {
    const b = this.el.getBoundingClientRect()
    const breite = b.width || 46
    const hoehe = b.height || 190
    this.x = Math.max(8, Math.min(x, window.innerWidth - breite - 8))
    this.y = Math.max(8, Math.min(y, window.innerHeight - hoehe - 8))
    this.el.style.left = `${Math.round(this.x)}px`
    this.el.style.top = `${Math.round(this.y)}px`
  }

  private setzeOffen(offen: boolean): void {
    this.offen = offen
    this.el.hidden = !offen
    this.merken()
  }

  oeffnen(): void {
    this.setzeOffen(true)
  }

  schliessen(): void {
    this.setzeOffen(false)
  }

  get istOffen(): boolean {
    return this.offen
  }

  private merken(): void {
    this.h.merken({ x: this.x, y: this.y, offen: this.offen })
  }

  /**
   * **Was auf der Leiste steht — bei jedem Bild, aber nur bei Änderung.**
   *
   * Der aktive Strich bekommt seine Länge und Helligkeit über `data-an`; Name und Abstand werden nur
   * geschrieben, wenn sie sich ändern. Ohne das zappelt die Zahl 60-mal je Sekunde.
   */
  update(abstand: number): void {
    const ebene = levelForDistance(abstand)
    this.aktuelle = ebene
    if (this.el.dataset.level !== String(ebene)) {
      this.el.dataset.level = String(ebene)
      for (const [stufe, strich] of this.striche) {
        if (stufe === ebene) strich.dataset.an = '1'
        else delete strich.dataset.an
      }
      this.el.setAttribute('aria-valuenow', String(ebene))
    }
    const eintrag = LEVELS.find((l) => l.level === ebene)
    write(this.ebeneText, eintrag ? eintrag.label : '—')
    /*
     * **Und der Abstandstext trägt die ECHTE Größe statt „Einheiten".**
     *
     * Betreiber: „**ändere masseinheit also einheit in lichtjahre oder so**". Hier stand
     * `{ wert } Einheiten` — die abstrakte Welteneinheit, die niemandem etwas sagt. Der Wert kommt
     * jetzt aus `realSize()` und bringt seine Einheit mit; der Zoomabstand folgt in Klammern,
     * weil **er** die Kamera beschreibt (siehe `realSize` in `universe.ts`).
     *
     * Die Sprache kommt aus dem Uebersetzer des Wirts: `deutsch` wird daraus abgeleitet, ob `de` die
     * aktuelle Sprache ist — dieselbe Regel wie bei der Kopfzeile.
     */
    const groesse = realSize(ebene, this.h.deutsch?.() ?? true)
    write(this.abstandText, `${groesse} · ${this.h.tr('view.controls.zoom', { wert: formatAbstand(abstand) })}`)
  }

  /** Die Ebene, auf der die Leiste gerade steht — für Werkzeuge und Tests. */
  get ebene(): Level {
    return this.aktuelle
  }
}

/** Schreibt nur, wenn sich etwas ändert — sonst zappelt der Text. */
function write(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text
}

/** Ein Abstand, wie man ihn liest: 4.8 k statt 4761.248963646969. */
export function formatAbstand(wert: number): string {
  if (wert >= 1_000_000) return `${(wert / 1_000_000).toFixed(2)} M`
  if (wert >= 1000) return `${(wert / 1000).toFixed(1)} k`
  if (wert >= 10) return String(Math.round(wert))
  return wert.toFixed(1)
}

/**
 * **Die nächste Bezugsebene als Abstand.**
 *
 * Der Harness rastet den Zoom auf **Vielfache** ein (`steppedZoom` in `ZoomControls.tsx`). Hier ist die
 * Einheit die **Ebene**: `−`/`+` und das Rad gehen eine Ebene weiter, und der Abstand kommt aus
 * `distanceForLevel` — derselben Funktion, die auch die Sprungmarken benutzen. Eine eigene Rechnung
 * wäre eine zweite Wahrheit.
 */
export function naechsterAbstand(abstand: number, richtung: -1 | 1): number {
  const ebene = levelForDistance(abstand)
  const naechste = Math.min(EBENEN_MAX, Math.max(1, ebene + richtung)) as Level
  if (naechste === ebene) return abstand
  return distanceForLevel(naechste)
}
