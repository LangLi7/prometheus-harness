/**
 * Die sichtbare Andock-Flaeche.
 *
 * Trennung: `docking.ts` rechnet (rein, pruefbar), diese Datei **malt und zieht**. Wer die
 * Regeln aendern will, aendert `docking.ts`; wer das Aussehen aendert, aendert hier.
 *
 * Vier Zonen plus schwebend. Beim Ziehen an der Griffleiste erscheinen Zielmarken; das
 * Panel landet dort, wo man loslaesst. Ein geschlossenes Panel ist **nicht geloescht**,
 * sondern abgesteckt und laesst sich ueber die Leiste wieder einhaengen.
 */
import {
  activatePanel,
  dockStations,
  glueTo,
  panelsIn,
  activeIn,
  loadLayout,
  moveFloating,
  movePanel,
  resizePanel,
  saveLayout,
  stationAt,
  stationPlacement,
  zoneRects,
} from './docking'
import type { DockLayout, DockStation, PanelSpec, Zone } from './docking'
// Die Zeichen kommen aus EINER Quelle (packages/assets/icons) — keine Schriftzeichen mehr.
import { iconMarkup } from '@prometheus-harness/icons'

/**
 * **Wohin ein gezogenes Panel gehoert — und warum es jetzt STELLEN gibt statt Raender.**
 *
 * ── Der Fehler, den der Betreiber gesehen hat ────────────────────────────────────────────
 *
 *   „**wen ich zb in mitte rot rein tue verschwindet es einfach**"
 *
 * Hier stand `if (y < edgeY) return 'closed'` — der **obere Rand** steckte ab. Wer ein Panel also nach
 * oben zog (und die Mitte des Bildschirms war schnell „oben"), **steckte es ab**, und es verschwand.
 * Dazu lagen zwei gestrichelte Zielmarken ueber der **ganzen** Dockflaeche, die aussahen wie ein
 * Einwurfschlitz — „diese komische rote Anzeige Umrandung".
 *
 * ── Und die Insel war gar keine Stelle ──────────────────────────────────────────────────
 *
 * Der zweite Anlauf machte „nur die Insel steckt ab" — und das war **richtig gemeint, aber nicht
 * gebaut**: gemessen (`tools/dock-stations.js`) steckte weiterhin der obere Rand ab, und ein Zug ueber
 * die Insel landete nur deshalb dort, weil sie oben liegt. Die Insel war ein **Zufall der Lage**.
 *
 * ── Was jetzt gilt ──────────────────────────────────────────────────────────────────────
 *
 * Der Auftrag: „**diese docking station objekt logic koennten wir ja implementieren das es quasi
 * bestimmte stellen erleichtert und auch den objekte selbst auch orientiert**".
 *
 * Es gibt **Stellen**, und sie sind **endlich** (`dockStations`): links, rechts, unten — und die Insel,
 * die absteckt. Jede Stelle hat einen **Fangbereich** (`margin`), damit man sie nicht treffen muss,
 * sondern nur **meinen**. Wer keine Stelle meint, dessen Panel **schwebt**: nichts verschwindet
 * ungewollt.
 *
 * Die **engste** Stelle gewinnt (`stationAt`), nicht die erste im Quelltext.
 *
 * `stellen` sind die Stellen dieses Zugs. Fehlen sie, gilt die Zone aus dem Angebot als einzige Stelle
 * — dann bleibt das Verhalten fuer Aufrufer ohne Stellen vorhersagbar.
 */
export function zoneAt(
  x: number,
  y: number,
  width: number,
  height: number,
  stellen: readonly DockStation[] = [],
): Zone {
  const treffer = stationAt(x, y, stellen)
  if (treffer) return treffer.zone
  void width
  void height
  // **Nichts gemeint: es schwebt.** Kein „abstecken" am oberen Rand mehr.
  return 'floating'
}

export interface DockCallbacks {
  readonly onLayout: (layout: DockLayout) => void
  /**
   * Der Uebersetzer.
   *
   * **Warum das Fenster ihn braucht.** Seine drei Beschriftungen — „abgesteckt", „ziehen =
   * andocken", „abstecken" — sind **Saetze**, und Saetze haengen an der Sprache. Sie hier
   * hinzuschreiben waere der zweite Ort, an dem eine Sprache im Code steht.
   *
   * Fehlt er, bleibt der Text leer statt zu werfen: ein Fenster ohne Sprachpaket soll benutzbar
   * bleiben.
   */
  readonly tr?: (key: string) => string
}

export class DockView {
  private specs: readonly PanelSpec[]
  private readonly root: HTMLElement
  private readonly callbacks: DockCallbacks
  private readonly room: string
  private layout: DockLayout

  private readonly zones = new Map<Zone, HTMLElement>()
  private readonly toggleBar: HTMLElement
  /*
   * **Die Vorschau-Ebene der Andockstellen.**
   *
   * Sie ist **leer**, solange nicht gezogen wird — und das ist der Punkt. Der Betreiber: „diese
   * komische rote Anzeige Umrandung". Vorher lagen Marken **immer** ueber der ganzen Flaeche. Jetzt
   * zeigt jede Stelle sich **selbst**, und nur **waehrend** eines Zugs: man sieht, wohin das Objekt
   * gehoert, waehrend man es bewegt — nicht dauerhaft.
   */
  private readonly vorschau: HTMLElement
  /**
   * **Die zuletzt gemessenen Maße der Zonen** — Breite links, Höhe unten.
   *
   * Sie werden in `render` gemessen (dort steht schon ein Umbruch an) und in `stellenFuer` als Rückfall
   * gebraucht: sobald ein Panel seine Zone verlässt, ist die Zone leer und damit nicht mehr messbar —
   * ihre **Masse** sollen aber dieselben bleiben.
   *
   * **Warum das nötig ist, und was es gekostet hat.** Hier stand zuerst nur die Breite, und die Höhe der
   * unteren Stelle kam aus `panel.size`. Das sind zwei verschiedene Zahlen: gemessen lag die Zone bei
   * **145** px, ihr Panel hat aber `size: 280` — die Höhe der Zone ergibt sich aus dem **Inhalt** ihres
   * Bereichs (`--unten-top` in `main.ts` rechnet mit ihr), nicht aus der Wunschgröße.
   *
   * Die Folge war messbar: die untere Stelle fing bei y = 620 an statt bei y = 755, und ein Panel, das
   * in der Mitte des Bildes losgelassen wurde, dockte unten an — obwohl die Zone dort gar nicht beginnt.
   */
  private linksBreite = 0
  private untenHoehe = 0
  private drag: {
    readonly id: string
    readonly from: Zone
    readonly offsetX: number
    readonly offsetY: number
    readonly startedFloating: boolean
    /** **Die Andockstellen DIESES Zugs** — beim Anfassen festgelegt und danach unveraendert. */
    readonly stellen: readonly DockStation[]
    /** Die Groesse des gezogenen Objekts in Bildschirmpunkten, beim Anfassen gemessen. */
    readonly sizeW: number
    readonly sizeH: number
  } | null = null
  /** Der zuletzt gemalte Kasten eines schwebenden Objekts — Rueckfall, wenn das DOM noch nicht steht. */
  private readonly letzterKasten = new Map<string, { readonly x: number; readonly y: number; readonly w: number; readonly h: number }>()

  constructor(root: HTMLElement, specs: readonly PanelSpec[], room: string, callbacks: DockCallbacks) {
    this.root = root
    this.specs = specs
    this.room = room
    this.callbacks = callbacks
    this.layout = loadLayout(specs, room)

    /*
     * **Die Zonen liegen direkt in der Hülle — kein Zwischenelement.**
     *
     * Hier stand zwischenzeitlich eine `.dock-row` für „links und rechts nebeneinander". Sie war
     * Teil eines Umbaus, der das Dock in den Fluss legen sollte und **gescheitert** ist (die Panels
     * wurden ein Band, die Welt ein Streifen). Zurückgenommen, samt der Zwischenebene: die drei Zonen
     * liegen absolut (`left`, `right`, `bottom`) und finden ihren Platz ohne Reihe.
     */
    for (const zone of ['left', 'right', 'bottom', 'floating'] as const) {
      const el = document.createElement('section')
      el.className = `zone zone-${zone}`
      el.dataset.zone = zone
      root.appendChild(el)
      this.zones.set(zone, el)
    }

    this.toggleBar = document.createElement('div')
    this.toggleBar.className = 'panelbar'
    root.appendChild(this.toggleBar)

    this.vorschau = document.createElement('div')
    this.vorschau.className = 'dockstellen'
    root.appendChild(this.vorschau)

    this.installDragTargets()
    this.render()
  }

  getLayout(): DockLayout {
    return this.layout
  }

  /**
   * Tauscht die Panel-Angebote aus — **ohne** die Anordnung des Nutzers zu verlieren.
   *
   * Gebraucht, wenn ein Plugin ein- oder ausgeschaltet wird: sein Panel kommt hinzu oder
   * verschwindet. `loadLayout` gleicht gegen die neuen Angebote ab, deshalb bleiben Zonen,
   * Groessen und schwebende Positionen der uebrigen Panels erhalten. Ein Panel, das es nicht
   * mehr gibt, faellt heraus; ein neues bekommt seine Voreinstellung.
   */
  setPanels(specs: readonly PanelSpec[], room: string): void {
    this.specs = specs
    this.layout = loadLayout(specs, room)
    this.persist()
    this.render()
  }

  /** Aendert die Anordnung von aussen (z. B. „alles zuruecksetzen"). */
  setLayout(layout: DockLayout): void {
    this.layout = layout
    this.persist()
    this.render()
  }

  /**
   * Holt ein Panel nach vorne — auch wenn es abgesteckt ist.
   *
   * **Wozu das gebraucht wird:** „Einstellungen" sind ein Ort, den man **aufsucht**, kein
   * Fenster, das man offen laesst. Ein Befehl oder ein Klick in der Insel soll es zeigen
   * koennen, ohne dass der Nutzer erst weiss, in welcher Zone es liegt. Ein abgestecktes Panel
   * wird dabei in seine **Voreinstellungszone** zurueckgehaengt (`spec.zone`), damit es dort
   * erscheint, wo es hingehoert — nicht irgendwo.
   */
  /**
   * **Ein Panel holen oder abstellen.**
   *
   * `ziel` ist die Zone, in die es soll — und sie ist **nötig**, seit alle Panels `closed` starten:
   * `spec.zone` ist damit `'closed'`, und die alte Regel „nimm die Zone aus dem Angebot, sonst rechts"
   * hätte **jedes** Panel in die rechte Spalte gelegt. Die Suchleiste gehört nach links, das Terminal
   * nach unten.
   *
   * Ohne `ziel` gilt weiter die Zone aus dem Angebot — für Aufrufer, die es nicht besser wissen. Ist
   * auch die `closed`, landet es rechts: irgendwo muss es hin, und rechts ist die ruhigere Seite.
   */
  openPanel(id: string, ziel?: Zone): boolean {
    const panel = this.layout.panels.find((p) => p.id === id)
    if (!panel) return false
    if (ziel === 'closed') {
      // **Abstecken.** Die Zone bleibt gemerkt (`spec.zone`) — sie ist der Ort, an den es gehört.
      this.layout = movePanel(this.layout, id, 'closed')
    } else if (panel.zone === 'closed') {
      const spec = this.specs.find((s) => s.id === id)
      const hin = ziel ?? (spec?.zone === 'closed' ? 'right' : (spec?.zone ?? 'right'))
      this.layout = movePanel(this.layout, id, hin)
    } else {
      // Schon sichtbar: nur den Reiter davor holen.
      this.layout = activatePanel(this.layout, panel.zone, id)
    }
    this.persist()
    this.render()
    return true
  }

  /** Holt ein Panel nach vorne **in eine bestimmte Zone** — fuer „zeig es mir hier". */
  openPanelIn(id: string, zone: Exclude<Zone, 'closed'>): boolean {
    if (!this.layout.panels.some((p) => p.id === id)) return false
    this.layout = movePanel(this.layout, id, zone)
    this.persist()
    this.render()
    return true
  }

  private persist(): void {
    saveLayout(this.layout, this.room)
    this.callbacks.onLayout(this.layout)
  }

  /**
   * **Der Kasten der Dynamic Island** — in Bildschirmpunkten.
   *
   * Das Dock kennt die Insel nicht: sie gehört der Welt (`main.ts`). Es fragt sie über das DOM, und
   * **nur hier**: für die Frage „wurde das Panel über der Insel abgelegt". Eine zweite Kopie ihrer
   * Masse wäre eine zweite Wahrheit — und die Insel ändert ihre Grösse, wenn man sie aufklappt.
   */
  private inselKasten(): { x: number; y: number; w: number; h: number } | undefined {
    const insel = document.querySelector('#isl .mini') ?? document.getElementById('isl')
    if (!insel) return undefined
    const r = insel.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return undefined
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }

  /** Merkt sich, ob die Insel im vorigen Bild unter dem Zeiger lag — für das Aufleuchten. */
  private inselUnterZeiger(x: number, y: number): boolean {
    const k = this.inselKasten()
    if (!k) return false
    return x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h
  }

  private installDragTargets(): void {    window.addEventListener('pointerup', (event) => {
      if (!this.drag) return
      const zug = this.drag
      /*
       * **Loslassen heisst: die Stelle unter dem Zeiger entscheidet.**
       *
       * Nicht mehr „welcher Bildschirmrand ist am naechsten", sondern „welche **Stelle** ist gemeint".
       * `stationAt` nimmt die engste in Reichweite — und wenn keine in Reichweite ist, bleibt das
       * Panel **schwebend**, dort wo es losgelassen wurde. Es verschwindet nicht.
       */
      const stelle = stationAt(event.clientX, event.clientY, zug.stellen)
      const zone: Zone = stelle ? stelle.zone : 'floating'
      this.layout = movePanel(this.layout, zug.id, zone)
      this.drag = null
      this.root.classList.remove('dragging')
      document.getElementById('isl')?.classList.remove('dropziel')
      this.stellenZeichnen()
      this.persist()
      this.render()
      /*
       * **Und danach richtet es sich aus.**
       *
       * Erst steht die **Stelle** fest (welche Zone), dann die **Lage** innerhalb der Zone
       * (`stationPlacement`: am Rand der Stelle, und neben einem schon liegenden Objekt statt darauf).
       * Und zuletzt der **Klebstoff** (`glueTo`): liegen zwei Nachbarn fast buendig, rasten sie ein.
       *
       * **Warum in zwei Bildern gemessen.** Im ersten Bild nach `render` steht das DOM, aber die
       * Kante des gezogenen Objekts ist noch nicht gesetzt; die Ausrichtung liest ihre Nachbarn per
       * `getBoundingClientRect` und braucht **fertige** Kaesten. Zwei Bilder sind deshalb zwei
       * Messungen — dasselbe Vorgehen wie bei `--panel-links` in `main.ts`.
       */
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          this.lageAusrichten(zug.id, stelle, { w: zug.sizeW, h: zug.sizeH })
        }),
      )
    })
    window.addEventListener('pointermove', (event) => {
      if (!this.drag) return
      /*
       * **Die Insel leuchtet auf, wenn sie gemeint ist.**
       *
       * Sie ist die einzige Stelle, an der ein Panel **abgesteckt** wird. Der Zustand wird am
       * **Inselknoten** gesetzt (`#isl`), nicht am Dock: die Insel gehoert der Welt, und ihr
       * Erscheinungsbild gehoert zu ihr.
       */
      const insel = document.getElementById('isl')
      if (insel) insel.classList.toggle('dropziel', this.inselUnterZeiger(event.clientX, event.clientY))
      /*
       * **Und die Stellen zeigen sich — aber nur die gemeinte.**
       *
       * Alle Stellen liegen als leise Marken da (damit man sieht, **dass** es sie gibt), und die
       * getroffene hebt sich. Das ist der Unterschied zur alten Fassung: dort waren zwei Striche
       * **immer** da, und sie sagten nicht, welche gemeint ist.
       */
      this.stellenZeichnen(stationAt(event.clientX, event.clientY, this.drag.stellen)?.id ?? null)

      const panel = this.layout.panels.find((p) => p.id === this.drag?.id)
      if (panel && panel.zone === 'floating') {
        this.layout = moveFloating(
          this.layout,
          panel.id,
          event.clientX - this.drag.offsetX,
          event.clientY - this.drag.offsetY,
        )
        this.render()
      }
    })
  }

  /**
   * **Die Andockstellen dieses Zustands — oeffentlich, weil die Messung sie braucht.**
   *
   * `tools/dock-stations.js` und `tools/docking-probe.js` fragen sie ueber
   * `window.__prometheusDock.stellen()` ab, damit sie die **ausgelieferte** Regel messen und nicht eine
   * Kopie davon. Eine Kopie hat schon einmal falsche Zahlen geliefert: das erste Werkzeug rechnete
   * `zoneAt` selbst nach und meldete danach „abstecken gibt es nur am oberen Rand", waehrend der Code
   * daneben etwas anderes tat.
   */
  stellen(): readonly DockStation[] {
    return this.stellenFuer()
  }

  /**
   * **Die Andockstellen fuer den aktuellen Zustand — gerechnet, nicht gemessen.**
   *
   * **Warum hier gerechnet wird und nicht am DOM gemessen.** Beim Ziehen aus einer Zone heraus wird das
   * Panel **schwebend**, und die Zone, aus der es kam, ist danach **leer** (`display: none`). Wer ihre
   * Lage erst beim Loslassen am DOM abfragt, fragt einen unsichtbaren Kasten ab — und die erste Fassung
   * dieses Umbaus fiel genau deshalb in die Mitte zurueck.
   *
   * Deshalb gilt: **die Breiten kommen aus dem Zustand**, und der Zustand kennt die Groesse jedes
   * Panels (`size`). Die zuletzt **gemessene** Breite der linken Zone (`--panel-links`) geht als
   * Rueckfall ein, falls dort gerade kein Panel steht.
   */
  private stellenFuer(): readonly DockStation[] {
    const b = window.innerWidth
    const h = window.innerHeight
    const linksAktiv = activeIn(this.layout, 'left')
    const rechtsAktiv = activeIn(this.layout, 'right')
    const untenAktiv = activeIn(this.layout, 'bottom')
    const zonen = zoneRects(
      { b, h },
      {
        /*
         * **Die Masse sind die GEMESSENEN, nicht die gewünschten.**
         *
         * `size` in der Anordnung ist der **Wunsch** des Panels; wie breit die Spalte und wie hoch der
         * untere Bereich **wirklich** ist, steht nur im Bild — und die beiden Zahlen gehen auseinander:
         * gemessen war die untere Zone **145** px hoch, während ihr Panel `size: 280` trägt.
         *
         * Der gemessene Wert gilt, die Zahl aus der Anordnung ist nur der letzte Rückfall (vor dem
         * ersten Bild, wenn noch nichts im DOM steht).
         */
        links: this.linksBreite || 280,
        // Die rechte Zone hat dieselbe Breitenquelle wie die linke: beide sind Spalten mit `size`.
        rechts: this.linksBreite || 280,
        unten: this.untenHoehe || 240,
      },
      { links: !!linksAktiv, rechts: !!rechtsAktiv, unten: !!untenAktiv },
    )
    return dockStations({ b, h }, zonen, this.inselKasten())
  }

  /**
   * **Die Lage eines abgelegten Objekts — Stelle, Nachbarschaft, Klebstoff.**
   *
   * Laeuft **nach** dem Loslassen und **nach** dem Umbau: erst wenn das DOM steht, ist die Frage „was
   * liegt schon da" beantwortbar.
   *
   * `stelle` ist die getroffene Andockstelle oder `null` (dann schwebt es frei und nur der Klebstoff
   * greift).
   */
  private lageAusrichten(
    id: string,
    stelle: DockStation | null,
    groesse: { readonly w: number; readonly h: number },
  ): void {
    const panel = this.layout.panels.find((p) => p.id === id)
    if (!panel || panel.zone === 'closed') return

    const kaesten = this.kaestenIn(id)
    let ziel = { x: panel.floating.x, y: panel.floating.y }

    if (stelle && stelle.zone !== 'closed') {
      /*
       * **An der Stelle ausrichten.**
       *
       * `stationPlacement` legt das **erste** Objekt an den Rand der Stelle und jedes weitere
       * **daneben** — in die Richtung, die die Stelle vorgibt. Ohne das laegen zwei Objekte genau
       * uebereinander.
       */
      const geschwister = this.layout.panels
        .filter((p) => p.zone === panel.zone && p.id !== id)
        .map((p) => kaesten.find((k) => k.id === p.id))
        .filter((k): k is { readonly id: string; readonly rect: { x: number; y: number; w: number; h: number } } => !!k)
      ziel = stationPlacement(
        stelle,
        groesse,
        geschwister.map((k) => k.rect),
      )
    }

    /*
     * **Und der Klebstoff.**
     *
     * Nur gegen Nachbarn **derselben** Stelle: was an einer anderen Kante liegt, ist kein Nachbar,
     * sondern ein anderes Objekt an einem anderen Ort.
     */
    const nachbarn = this.layout.panels
      .filter((p) => p.zone === panel.zone && p.id !== id)
      .map((p) => kaesten.find((k) => k.id === p.id))
      .filter((k): k is { readonly id: string; readonly rect: { x: number; y: number; w: number; h: number } } => !!k)
      .map((k) => k.rect)
    const geklebt = glueTo(ziel, nachbarn)

    const geaendert = geklebt.x !== panel.floating.x || geklebt.y !== panel.floating.y
    if (!geaendert) return
    this.layout = moveFloating(this.layout, id, geklebt.x, geklebt.y)
    this.persist()
    this.render()
  }

  /**
   * **Die gemalten Kaesten einer Zone.**
   *
   * Gelesen wird am **DOM**, nicht am Zustand: der Zustand kennt die schwebenden Positionen, aber die
   * Kante eines Objekts in einer festen Zone ergibt sich aus ihrem Aufbau — eine zweite Rechnung waere
   * eine zweite Wahrheit.
   *
   * Faellt auf `letzterKasten` zurueck, wenn das DOM gerade nichts hergibt (Zone noch nicht gemalt).
   */
  private kaestenIn(
    ohne: string,
  ): readonly { readonly id: string; readonly rect: { x: number; y: number; w: number; h: number } }[] {
    const gefunden: { id: string; rect: { x: number; y: number; w: number; h: number } }[] = []
    const kaesten = document.querySelectorAll<HTMLElement>('.zone .panel[data-panel], .zone .panel')
    kaesten.forEach((el) => {
      const id = el.dataset.panel
      if (!id || id === ohne) return
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return
      gefunden.push({ id, rect: { x: r.left, y: r.top, w: r.width, h: r.height } })
    })
    if (gefunden.length) return gefunden
    for (const [id, rect] of this.letzterKasten) {
      if (id !== ohne) gefunden.push({ id, rect })
    }
    return gefunden
  }

  /**
   * **Die Stellen zeigen — waehrend eines Zugs.**
   *
   * Jede Stelle bekommt eine **duenne Linie dort, wo ihre Kante ist**: an der linken Stelle eine
   * senkrechte Linie in ihrer Breite, an der unteren eine waagerechte in ihrer Hoehe. Kein Kasten, kein
   * Rahmen ueber der Flaeche — der Betreiber hat „diese komische rote Anzeige Umrandung" ausdruecklich
   * abgelehnt.
   *
   * Die **gemeinte** Stelle hebt sich: `data-aktiv` bekommt sie nur, wenn der Zeiger in ihrem
   * Fangbereich liegt. Alle anderen bleiben leise, damit man sieht, **dass** es sie gibt — und welche
   * man gerade meint.
   *
   * Die Insel bekommt **keine** Linie: sie ist sichtbar, sie leuchtet beim Gemeintsein auf
   * (`#isl.dropziel`), und eine zweite Marke ueber ihr waere eine zweite Wahrheit ueber denselben Ort.
   */
  private stellenZeichnen(aktiv: string | null = null): void {
    if (!this.drag) {
      this.vorschau.replaceChildren()
      return
    }
    /*
     * **Und sie zeigen, wie sie das Objekt ausrichten.**
     *
     * Der Auftrag lautete, die Stellen sollen „**auch den objekte selbst auch orientiert**". Diese
     * Marke ist die Antwort darauf: eine Stelle ist keine Flaeche, sondern eine **Richtung**. An der
     * linken Stelle steht die Linie **senkrecht** und ist so **hoch** wie das gezogene Objekt — genau
     * dort, wo das Objekt zu liegen kommt. An der unteren Stelle ist sie **waagerecht**.
     *
     * Damit sieht man vor dem Loslassen, **wie** das Objekt liegen wird, nicht nur **wo**.
     */
    const gezogen = this.layout.panels.find((p) => p.id === this.drag?.id)
    const objektBreit = gezogen?.floating.w ?? 280
    const objektHoch = gezogen?.floating.h ?? 200
    this.vorschau.replaceChildren()
    for (const stelle of this.drag.stellen) {
      if (stelle.id === 'insel') continue
      const marke = document.createElement('div')
      marke.className = 'dockstelle'
      marke.dataset.dockstation = stelle.id
      marke.dataset.achse = stelle.axis.entlang
      if (stelle.id === aktiv) marke.dataset.aktiv = 'ja'
      if (stelle.axis.entlang === 'x' && stelle.axis.platz === 'links') {
        marke.style.cssText =
          `left:${Math.round(stelle.rect.x + stelle.rect.w)}px;top:${Math.round(stelle.rect.y)}px;`
          + `height:${Math.round(Math.min(objektHoch, stelle.rect.h))}px`
      } else if (stelle.axis.platz === 'rechts') {
        marke.style.cssText =
          `left:${Math.round(stelle.rect.x)}px;top:${Math.round(stelle.rect.y)}px;`
          + `height:${Math.round(Math.min(objektHoch, stelle.rect.h))}px`
      } else {
        marke.style.cssText =
          `left:${Math.round(stelle.rect.x)}px;top:${Math.round(stelle.rect.y)}px;`
          + `width:${Math.round(Math.min(objektBreit, stelle.rect.w))}px`
      }
      this.vorschau.appendChild(marke)
    }
  }

  private render(): void {
    for (const el of this.zones.values()) el.replaceChildren()
    this.toggleBar.replaceChildren()
    this.letzterKasten.clear()

    /*
     * **Die Masse der Zonen werden hier gemessen — NACH dem Aufbau, nicht davor.**
     *
     * `getBoundingClientRect` in einer Schleife erzwingt je Aufruf einen neuen Umbruch, und
     * `stellenFuer` läuft bei jeder Zeigerbewegung — deshalb wird hier gemessen und dort nur gelesen.
     *
     * **Die Reihenfolge ist der ganze Punkt.** Hier stand die Messung zuerst **vor** der Zonenschleife,
     * also bevor die Panels eingesetzt waren: gemessen wurde eine **leere** Zone, und die untere Stelle
     * bekam die Höhe **1**. Gemessen (erste Fassung): `zone-bottom 0 / 899  1440 × 1  ±60 px` — eine
     * Stelle, die ein Pixel hoch ist und 60 px Reichweite hat. Die Zahlen waren plausibel und falsch.
     */
    for (const zone of ['left', 'right', 'bottom'] as const) {
      const host = this.zones.get(zone)
      const panels = panelsIn(this.layout, zone)
      if (!host) continue
      host.style.display = panels.length ? 'flex' : 'none'
      if (!panels.length) continue

      const active = activeIn(this.layout, zone)
      if (active) {
        /*
         * **Die untere Zone braucht eine Höhe, nicht nur eine `flex-basis`.**
         *
         * Sie liegt `position: absolute` mit `bottom: 0`; damit hängt ihre Höhe am Inhalt. Gemessen
         * war das bei der alten Rangliste 672 px, bei der neuen 917 px — das Panel wuchs über den
         * Bildschirmrand hinaus, und der Kopf war nicht mehr zu sehen. `flex-basis` allein tut in
         * einer absoluten Zone nichts. Also: die gewünschte Größe ist die **Höhe**, und der Inhalt
         * scrollt darin (`.panelcontent` hat `overflow: auto`).
         */
        host.style.flexBasis = `${active.size}px`
        host.style.height = zone === 'bottom' ? `${active.size}px` : ''
      }

      /*
       * **Die Reiter liegen IN der Kopfzeile des Panels — kein eigenes Band.**
       *
       * Der Betreiber: „**bitte die ausblenden bzw sollte nicht da sein sollange man es per button
       * oder per command idk what ever macht erst dann auftaucht**".
       *
       * Hier stand zuerst ein eigenes `.tabs`-Element als **Geschwister** des Panels. In einer
       * `flex-direction: row`-Zone wurde daraus eine **Spalte** — gemessen 253 × **900** px, und das
       * Panel daneben hatte nur **157** px. Der zweite Anlauf war ein Band über dem Panel; auch das
       * ist eine eigene Zeile, die Platz nimmt und deren Titel sich mit dem Panelkopf **doppelt**.
       *
       * Jetzt sind die Reiter **Knöpfe in der Kopfzeile**: nur sichtbar, wenn es mehr als ein Panel in
       * der Zone gibt, klein, rechts neben dem Titel. Wer umschalten will, klickt sie; wer nicht, sieht
       * einen Titel statt eines Bandes.
       *
       * **Was das nicht ist:** ein Verstecken per Befehl. Die Panels in einer Zone sind
       * **Geschwister**, und ohne sichtbaren Schalter gäbe es keinen Weg zum zweiten — ein Befehl
       * dafür wäre eine zweite Bedienung für etwas, das schon eine hat. Sichtbar, aber leise.
       */
      const spalte = document.createElement('div')
      spalte.className = 'dock-col'
      if (active) spalte.appendChild(this.buildPanel(active.id, zone, panels, active.id))
      spalte.appendChild(this.buildResizer(zone, active?.id ?? null))
      host.appendChild(spalte)

      // Jetzt steht die Zone im Bild — **jetzt** ist ihr Mass die Wahrheit (siehe oben).
      const kasten = host.getBoundingClientRect()
      const gemessen = Math.round(zone === 'bottom' ? kasten.height : kasten.width)
      if (gemessen > 0) {
        if (zone === 'bottom') this.untenHoehe = gemessen
        else if (zone === 'left') this.linksBreite = gemessen
      }
    }

    // Schwebende Panels frei ueber der Flaeche.
    const floatHost = this.zones.get('floating')
    if (floatHost) {
      const panels = panelsIn(this.layout, 'floating')
      floatHost.style.display = panels.length ? 'block' : 'none'
      for (const panel of panels) {
        const el = this.buildPanel(panel.id, 'floating')
        el.style.left = `${panel.floating.x}px`
        el.style.top = `${panel.floating.y}px`
        el.style.width = `${panel.floating.w}px`
        el.style.height = `${panel.floating.h}px`
        floatHost.appendChild(el)
        /*
         * **Der zuletzt gemalte Kasten.**
         *
         * Der Zustand kennt ihn schon — bis auf **eine** Ungenauigkeit: in einer festen Zone ergibt sich
         * der Kasten aus dem Aufbau, nicht aus `floating`. Wer den Rueckfall braucht (siehe `kaestenIn`),
         * will genau diesen gemalten Kasten, nicht die Lage, an der das Objekt einmal schwebte.
         */
        this.letzterKasten.set(panel.id, {
          x: panel.floating.x,
          y: panel.floating.y,
          w: panel.floating.w,
          h: panel.floating.h,
        })
      }
    }

    // Leiste: was gerade abgesteckt ist, kann wieder eingehaengt werden.
    const closed = panelsIn(this.layout, 'closed')
    if (closed.length) {
      const label = document.createElement('span')
      label.className = 'panelbar-label'
      label.textContent = this.label('dock.detached')
      this.toggleBar.appendChild(label)
      for (const panel of closed) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'dockbtn'
        /*
         * **Das Plus ist ein Zeichen, kein Buchstabe.**
         *
         * Hier stand `` `+ ${…}` `` — das Plus eines Textsatzes. In einer Knopfreihe ist es damit mal
         * größer und mal kleiner als die Beschriftung daneben, und es sitzt auf der Grundlinie statt
         * in der Mitte. Das gezeichnete Plus (zwei gleich lange Striche) sitzt immer gleich.
         */
        button.innerHTML = `${iconMarkup('plus', 'dockbtn-zeichen')}<span>${this.titleOf(panel.id)}</span>`
        button.addEventListener('click', () => {
          const spec = this.specs.find((s) => s.id === panel.id)
          this.layout = movePanel(this.layout, panel.id, spec?.zone === 'closed' ? 'right' : (spec?.zone ?? 'right'))
          this.persist()
          this.render()
        })
        this.toggleBar.appendChild(button)
      }
    }
    /*
     * **Die Knopfleiste ist abgeschafft.**
     *
     * Der Betreiber: „**sollten wir das nicht in dynamic illand implementieren als ein punkt oder
     * Button wie dynamic illand die man drücken könnte**". Zwölf Knöpfe liefen quer über den
     * Bildschirm (gemessen 1166 px breit), lagen **auf** der Welt und waren ein **zweiter**
     * Navigationsweg neben der Insel — obwohl die Insel laut Entwurf die **einzige** Navigation ist.
     *
     * Das Dock liefert die Panels weiter (`getLayout`, `openPanel`), und die Insel zeigt sie als
     * Gruppe „Panels" mit einem Eintrag je Panel. Der Knoten `.panelbar` bleibt im Baum, damit nichts
     * auf einen fehlenden Selektor läuft, wird aber **leer** und **unsichtbar** gelassen.
     */
    this.toggleBar.style.display = 'none'
  }

  private titleOf(id: string): string {
    return this.specs.find((s) => s.id === id)?.title ?? id
  }

  /** Uebersetzt eine Beschriftung dieses Fensters — oder laesst sie leer, wenn es keine Sprache gibt. */
  private label(key: string): string {
    return this.callbacks.tr?.(key) ?? ''
  }

  private buildPanel(
    id: string,
    zone: Exclude<Zone, 'closed'>,
    geschwister: readonly { readonly id: string }[] = [],
    aktiv: string | null = null,
  ): HTMLElement {
    const spec = this.specs.find((s) => s.id === id)
    const panel = document.createElement('div')
    panel.className = `panel panel-${zone}`
    panel.dataset.panel = id

    const head = document.createElement('div')
    head.className = 'panelhead'
    head.innerHTML = `<span class="grip" title="${this.label('dock.grab')}">⠿</span><b>${this.titleOf(id)}</b>`
    const spacer = document.createElement('span')
    spacer.className = 'spacer'
    head.appendChild(spacer)

    /*
     * **Die Umschaltung liegt in der Kopfzeile — nur wenn es etwas umzuschalten gibt.**
     *
     * Ein Klick auf den Titel eines Geschwisterpanels holt es nach vorne. Die Knöpfe sind **leise**:
     * gleiche Grösse wie der Titel, ohne Rahmen, gedämpfte Farbe — wer nicht umschalten will, liest
     * eine Kopfzeile; wer will, sieht, dass es einen zweiten gibt.
     *
     * **Und die Kopfzeile bleibt ziehbar.** Der `pointerdown` weiter unten überspringt Knöpfe
     * (`closest('button')`), also zieht man am Griff und am Titel, nicht an den Reitern.
     */
    if (geschwister.length > 1) {
      const wechsler = document.createElement('span')
      wechsler.className = 'tabs'
      for (const bruder of geschwister) {
        if (bruder.id === id) continue
        const knopf = document.createElement('button')
        knopf.type = 'button'
        knopf.className = 'tab'
        knopf.textContent = this.titleOf(bruder.id)
        knopf.title = this.titleOf(bruder.id)
        knopf.addEventListener('click', (event) => {
          event.stopPropagation()
          this.layout = activatePanel(this.layout, zone, bruder.id)
          this.persist()
          this.render()
        })
        wechsler.appendChild(knopf)
      }
      head.appendChild(wechsler)
    }
    void aktiv

    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'panelx'
    close.innerHTML = iconMarkup('close')
    close.title = this.label('dock.detach')
    close.addEventListener('click', (event) => {
      event.stopPropagation()
      this.layout = movePanel(this.layout, id, 'closed')
      this.persist()
      this.render()
    })
    head.appendChild(close)

    head.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement).closest('button')) return
      event.preventDefault()
      const rect = panel.getBoundingClientRect()
      /*
       * **Die Stellen stehen fest, sobald man anfasst.**
       *
       * `stellenFuer` liest den Zustand **vor** dem Umbau: noch liegt das Panel in seiner Zone, die Zone
       * hat Inhalt und Groesse. Einmal berechnet und im Zug mitgefuehrt — sonst aenderten sich die
       * Ziele **waehrend** man zieht, und das Objekt landete woanders als die Vorschau zeigte.
       */
      this.drag = {
        id,
        from: zone,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        startedFloating: zone === 'floating',
        stellen: this.stellenFuer(),
        /*
         * **Die Groesse des Objekts, festgehalten beim Anfassen.**
         *
         * Nach dem Umbau (Panel wird schwebend) ist seine Groesse im DOM eine andere Frage — hier steht
         * sie **einmal** fest und wird beim Ausrichten gebraucht (`stationPlacement`).
         */
        sizeW: Math.round(rect.width),
        sizeH: Math.round(rect.height),
      }
      this.root.classList.add('dragging')
      if (zone !== 'floating') {
        // Beim Ziehen aus einer festen Zone heraus wird das Panel schwebend — sonst
        // klebt es am Rand und man sieht nicht, wohin man zieht.
        this.layout = moveFloating(this.layout, id, rect.left, rect.top)
        this.layout = movePanel(this.layout, id, 'floating')
        this.render()
      }
      this.stellenZeichnen(stationAt(event.clientX, event.clientY, this.drag.stellen)?.id ?? null)
    })

    panel.appendChild(head)

    const content = document.createElement('div')
    content.className = 'panelcontent'
    spec?.render(content)
    panel.appendChild(content)

    if (zone === 'floating') {
      const handle = document.createElement('div')
      handle.className = 'resize'
      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const startX = event.clientX
        const startY = event.clientY
        const startW = panel.offsetWidth
        const startH = panel.offsetHeight
        const onMove = (move: PointerEvent): void => {
          const w = Math.max(260, startW + (move.clientX - startX))
          const h = Math.max(160, startH + (move.clientY - startY))
          const target = this.layout.panels.find((p) => p.id === id)
          if (!target) return
          this.layout = {
            ...this.layout,
            panels: this.layout.panels.map((p) =>
              p.id === id ? { ...p, floating: { ...p.floating, w: Math.round(w), h: Math.round(h) } } : p,
            ),
          }
          this.render()
        }
        const onUp = (): void => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          this.persist()
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      })
      panel.appendChild(handle)
    }

    return panel
  }

  /** Der Greifer an der Kante einer Zone — Breite bzw. Hoehe ziehen. */
  private buildResizer(zone: Exclude<Zone, 'floating' | 'closed'>, panelId: string | null): HTMLElement {
    const handle = document.createElement('div')
    handle.className = zone === 'bottom' ? 'edge edge-y' : 'edge edge-x'
    handle.addEventListener('pointerdown', (event) => {
      if (!panelId) return
      event.preventDefault()
      const start = zone === 'bottom' ? event.clientY : event.clientX
      const panel = this.layout.panels.find((p) => p.id === panelId)
      const startSize = panel?.size ?? 240
      const onMove = (move: PointerEvent): void => {
        const delta =
          zone === 'bottom'
            ? start - move.clientY
            : zone === 'left'
              ? move.clientX - start
              : start - move.clientX
        this.layout = resizePanel(this.layout, panelId, startSize + delta, { min: 160, max: 720 })
        this.render()
      }
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        this.persist()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    })
    return handle
  }
}
