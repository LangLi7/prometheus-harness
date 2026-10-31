/**
 * Andockbare Panels.
 *
 * **Warum das neu gebaut ist:** In der Vorlage (`docs/design/webdesign example/002-f-galaxy`)
 * ist das Dock ein **fest positioniertes** Element unten mittig (`left:50%`) — es laesst sich
 * ein- und ausblenden, aber **nicht verschieben und nicht andocken**. Der Betreiber will
 * „UI, GUI, UX einfach einschalten, verschieben etc." Genau das steht hier.
 *
 * **Die Regeln sind absichtlich einfach**, weil sie sonst nicht bedienbar bleiben:
 *   - vier Zonen: links, rechts, unten, schwebend
 *   - Ziehen an der Griffleiste dockt an, wo man loslaesst
 *   - in einer Zone stehen die Panels als Reiter; nur eines ist sichtbar
 *   - jede Aenderung wird gespeichert und ueberlebt den Reload
 *
 * Alles Zustandslogische ist **rein** (kein DOM), damit es ohne Browser pruefbar ist —
 * siehe `tests/docking.test.ts`.
 *
 * Der gespeicherte Zustand haengt am **Raum** (siehe `room.ts`): jeder Nutzer hat eine eigene
 * Instanz, und zwei Raeume im selben Browser duerfen sich nicht ueberschreiben.
 */
import { storageKey } from './room'

export type Zone = 'left' | 'right' | 'bottom' | 'floating' | 'closed'

export const ZONES: readonly Zone[] = ['left', 'right', 'bottom', 'floating', 'closed']

// ── Andockstellen ────────────────────────────────────────────────────────────────────────

/**
 * **Wie eine Stelle ihre Objekte ausrichtet.**
 *
 * Der Betreiber: „**diese docking station objekt logic könnten wir ja implementieren das es quasi
 * bestimmte stellen erleichtert und auch den objekte selbst auch orientiert**".
 *
 * *Orientiert* heisst hier **nicht** „gedreht", sondern **nach der Stelle ausgerichtet**: eine Stelle
 * ist keine Flaeche, sondern eine **Richtung**, aus der sie kommt. Wer oben am Rand andockt, dessen
 * Panel haengt **unter** der Stelle — nicht in der Mitte eines Kastens. Und ein zweites Panel, das an
 * dieselbe Stelle kommt, legt sich **dahinter**, in die Richtung, die die Stelle vorgibt. Ohne diese
 * Richtung muesste man raten, und Raten war genau das Problem (siehe `stationOffset`).
 */
export interface StationAxis {
  /** Die Richtung, in die die Stelle zeigt: waagerecht (oben/unten) oder senkrecht (links/rechts). */
  readonly entlang: 'x' | 'y'
  /** Der Bezug: die Kante, an der die Stelle liegt. */
  readonly platz: StationPlace
}

/**
 * **Wo die Stelle im Bild liegt.**
 *
 * `ecke` ist keine eigene Zone: sie gehoert zur Seite und unterscheidet sich nur darin, **wie die
 * Objekte untereinander liegen** — an der Ecke waagerecht, sonst senkrecht (siehe `stationOffset`).
 */
export type StationPlace = 'links' | 'rechts' | 'unten' | 'ecke'

/** Eine Andockstelle, wie sie im Bild liegt — gemessen, in Bildschirmpunkten. */
export interface ZoneRect {
  readonly zone: Exclude<Zone, 'floating' | 'closed'>
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface DockStation {
  /** Die Zone, die ein Panel bekommt, wenn es hier einrastet. */
  readonly zone: Zone
  /** Kennung fuer die Anzeige und fuer die Messung (`data-dockstation`). */
  readonly id: string
  readonly axis: StationAxis
  /** Der **Kasten der Stelle selbst** — ihr Rand, nicht ihr Fangbereich. */
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  /** Der **Fangbereich**: um so viel darf der Zeiger daneben liegen und dockt trotzdem an. */
  readonly margin: number
  /**
   * **Ist die Stelle eine Kante (randlos) — oder ein Punkt im Bild?**
   *
   * Eine Zone **grenzt an den Bildrand**: die linke Stelle ist so hoch wie das Fenster, die untere so
   * breit. Wer sie meint, meint sie auf **jeder** Hoehe bzw. Breite — ihr Band laeuft also randlos
   * durch (`siehe inReichweite`).
   *
   * Die **Insel** ist keine Kante: sie ist ein Objekt **im** Bild, oben in der Mitte. Sie ist damit die
   * einzige Stelle, die in **beiden** Achsen begrenzt ist — sonst finge sie ein Panel ab, das ganz
   * unten in der Mitte losgelassen wird.
   */
  readonly randlos: boolean
}

/**
 * **Der Abstand, den gleiche Nachbarn zueinander halten** — und warum es ihn gibt.
 *
 * Der Betreiber: „**wie ein klebstoff mit andere objekte nebeneinander nachbar reagieren**". Kleben
 * heisst hier: was an **derselben** Stelle liegt, soll **zusammen** liegen. Zwei schwebende Panels,
 * die sich beruehren, werden deshalb auf diesen Abstand gebracht — gleich fuer alle, damit es
 * gleichmaessig aussieht und nicht wie ein Zufall.
 */
export const GLUE_GAP = 14

/** Wie weit zwei gleiche Nachbarn auseinander duerfen und trotzdem noch als Nachbarn gelten. */
export const GLUE_SNAP = 18

/** Wo eine Stelle ihre Objekte hinlegt: an den Rand, den sie beruehrt. */
function stationOffset(platz: StationPlace, rect: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  switch (platz) {
    case 'links':
      return { x: rect.x + GLUE_GAP, y: rect.y + GLUE_GAP }
    case 'rechts':
      return { x: rect.x + rect.w, y: rect.y + GLUE_GAP }
    case 'unten':
      return { x: rect.x + GLUE_GAP, y: rect.y }
    case 'ecke':
      return { x: rect.x, y: rect.y }
  }
}

/**
 * **Wohin ein Objekt an einer Stelle gelegt wird — und wie es dort liegt.**
 *
 * Der Betreiber: „**bestimmte stellen erleichtert und auch den objekte selbst auch orientiert**".
 *
 * Eine Stelle ist keine Flaeche, sondern eine **Richtung**, aus der sie kommt. Deshalb liegt das erste
 * Objekt **an seinem Rand** (`stationOffset`) — nicht in der Mitte eines Kastens, wo es zufaellig
 * aussieht.
 *
 * **Und das zweite Objekt legt sich daneben, nicht darauf.** In welche Richtung, sagt die Stelle:
 *
 *   - **links und rechts** liegen senkrecht (`entlang: 'x'`): das naechste rutscht **nach unten**.
 *   - **unten** liegt waagerecht (`entlang: 'y'`): das naechste rutscht **nach rechts** — an der Ecke
 *     also in die freie Richtung, weg von der Seite, an der die Stelle schon liegt.
 *
 * Ohne diese Regel lagen zwei schwebende Panels **genau uebereinander** und sahen aus wie eines. Der
 * Betreiber hat das gesehen („**dockingstuff wurde einfach rein getan plop auftaucht**") — ein Objekt,
 * das irgendwo erscheint, ohne dass man sieht, woher es kommt.
 *
 * `belegt` sind die bereits liegenden Objekte **derselben Stelle**, in Reihenfolge. Sie werden
 * uebersprungen, nicht ueberdeckt.
 */
export function stationPlacement(
  stelle: DockStation,
  groesse: { readonly w: number; readonly h: number },
  belegt: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[] = [],
): { readonly x: number; readonly y: number } {
  const start = stationOffset(stelle.axis.platz, stelle.rect)
  let x = start.x
  let y = start.y
  /*
   * **Was „daneben" heisst: die Querachse muss sich ueberlappen — nicht die Kante stimmen.**
   *
   * Hier stand ein Vergleich der **Kanten** (Abstand der x-Werte gegen die Breite des Nachbarn). Der
   * ist zu streng: zwei Objekte an derselben Stelle liegen mit **derselben** Kante, aber ihre Breiten
   * sind nicht dieselben. Gemessen (`tests/dock-stations.test.ts`): ein 420 px breites Objekt lag auf
   * einem 420 px breiten Nachbarn **genau darauf**, statt daneben.
   *
   * Richtig ist die **Ueberlappung auf der Querachse**: beim Stapeln nach unten muessen sich die
   * x-Bereiche beruehren, beim Stapeln nach rechts die y-Bereiche. Nur dann liegt das zweite Objekt
   * ueber dem ersten und muss weichen.
   */
  for (const belegtRect of belegt) {
    if (stelle.axis.platz === 'ecke') {
      // Waagerecht nebeneinander: nur wenn sich die Hoehen beruehren.
      if (belegtRect.y >= y + groesse.h || belegtRect.y + belegtRect.h <= y) continue
      x = Math.max(x, belegtRect.x + belegtRect.w + GLUE_GAP)
    } else {
      // Senkrecht untereinander: nur wenn sich die Breiten beruehren.
      if (belegtRect.x >= x + groesse.w || belegtRect.x + belegtRect.w <= x) continue
      y = Math.max(y, belegtRect.y + belegtRect.h + GLUE_GAP)
    }
  }
  /*
   * **Und kein Objekt ragt aus dem Bild.**
   *
   * Die Stelle gibt die **Richtung**, das Bild gibt die **Grenze** — nicht der Kasten der Stelle. Er
   * ist bei der unteren Zone nur `size` hoch (gemessen 145 px) und bei der rechten so breit wie ihr
   * Panel: wer ihn als Grenze nimmt, schiebt ein 300 px hohes Objekt **aus dem Bild** oder presst es in
   * eine Spalte, die es nicht gibt.
   *
   * Der Zugriff auf `window` ist dabei kein Bruch der Reinheit: `innerWidth` und `innerHeight` sind
   * Zahlen, die jede Umgebung liefert — im Browser das Fenster, im Test die Attrappe
   * (`tests/dock-stations.test.ts` setzt sie). Alles andere hier bleibt reine Rechnung.
   */
  const b = typeof window === 'undefined' ? 1440 : window.innerWidth
  const h = typeof window === 'undefined' ? 900 : window.innerHeight
  return {
    x: Math.round(Math.max(0, Math.min(x, Math.max(0, b - groesse.w)))),
    y: Math.round(Math.max(0, Math.min(y, Math.max(0, h - groesse.h)))),
  }
}

/**
 * **Der Klebstoff: zwei Nachbarn, die sich beruehren, rasten ineinander.**
 *
 * Der Betreiber: „**wie ein klebstoff mit andere objekte nebeneinander nachbar reagieren**".
 *
 * Gemeint ist: zwei schwebende Objekte sollen nicht **zufaellig** nebeneinander liegen, sondern
 * **buendig** — mit gleichem Abstand (`GLUE_GAP`) und gleicher Kante. Wer eines der beiden zieht, zieht
 * damit eine Kante gerade.
 *
 * **Wann es greift.** Nur wenn das gezogene Objekt schon **fast** buendig liegt (`GLUE_SNAP`), und nur
 * an **derselben** Stelle. Ein Objekt, das absichtlich frei liegt, wird nicht eingefangen: Klebstoff
 * zieht nicht, er haelt.
 *
 * Verglichen wird die **linke obere Ecke** des gezogenen Objekts gegen die **rechte** und **untere**
 * Kante des Nachbarn — die beiden Faelle, die beim Ziehen tatsaechlich vorkommen.
 */
export function glueTo(
  punkt: { readonly x: number; readonly y: number },
  nachbarn: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[],
): { readonly x: number; readonly y: number } {
  let x = punkt.x
  let y = punkt.y
  for (const n of nachbarn) {
    // Nachbar rechts: gleiche Kante oben, linke Kante genau `GLUE_GAP` hinter seiner rechten.
    const xKante = n.x + n.w + GLUE_GAP
    if (Math.abs(x - xKante) <= GLUE_SNAP && Math.abs(y - n.y) <= GLUE_SNAP * 3) x = xKante
    // Nachbar unten: gleiche Kante links, obere Kante genau `GLUE_GAP` unter seiner unteren.
    const yKante = n.y + n.h + GLUE_GAP
    if (Math.abs(y - yKante) <= GLUE_SNAP && Math.abs(x - n.x) <= GLUE_SNAP * 3) y = yKante
  }
  return { x: Math.round(x), y: Math.round(y) }
}

/** Aus den gemessenen Zonen die Andockstellen bauen. */
export function dockStations(
  fenster: { readonly b: number; readonly h: number },
  zonen: readonly ZoneRect[],
  insel?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
): readonly DockStation[] {
  const stellen: DockStation[] = []

  for (const z of zonen) {
    /*
     * **Die Ausrichtung kommt aus der Form der Stelle, nicht aus ihrer Lage.**
     *
     * Eine Stelle am **Rand einer Spalte** (links, rechts) hat Platz **unter** sich — dort liegen ihre
     * Objekte untereinander. Eine Stelle am **unteren Rand** hat Platz **neben** sich — dort liegen sie
     * nebeneinander, nach rechts, weg von der Seite, an der schon eine Spalte steht.
     *
     * Hier stand zuerst „unten stapelt senkrecht, ausser es gibt eine rechte Spalte". Das war falsch
     * gedacht: die Entscheidung haengt nicht daran, **ob** rechts etwas ist, sondern daran, **wieviel
     * Platz in der Querachse** da ist. An der unteren Stelle ist das die ganze Breite des Fensters
     * (gemessen 1440 px) — genug fuer viele Objekte nebeneinander, und genau das will man dort.
     */
    const platz: StationPlace = z.zone === 'bottom' ? 'ecke' : z.zone === 'left' ? 'links' : 'rechts'
    const breit = z.w
    const hoch = z.h
    stellen.push({
      zone: z.zone,
      id: `zone-${z.zone}`,
      axis: { entlang: z.zone === 'bottom' ? 'y' : 'x', platz },
      rect: { x: z.x, y: z.y, w: breit, h: hoch },
      /*
       * **Der Fangbereich ist gemessen, nicht geraten.**
       *
       * Er ist die halbe Breite der Stelle: an der linken Stelle also 140 px. Wer ein Fenster zieht,
       * trifft damit auch dann, wenn er knapp daneben loslaesst — und „bestimmte Stellen erleichtert"
       * heisst genau das.
       *
       * Die **Insel bekommt mehr**, obwohl sie viel kleiner ist (181 x 40 px): sie ist die einzige
       * Absteck-Stelle, und eine Pille dieser Groesse waere beim Ziehen sonst Glueckssache. Ihre
       * Zugabe waechst mit dem Fenster, weil eine feste Zahl bei 1440 px zu duenn und bei 900 px zu
       * gross waere.
       */
      margin: Math.max(60, z.zone === 'bottom' ? hoch : breit / 2),
      // Eine Zone grenzt an den Bildrand — ihr Band laeuft in der Querachse durch.
      randlos: true,
    })
  }

  if (insel) {
    /*
     * **Die Insel ist eine Stelle, die absteckt.**
     *
     * Gemessen (`tools/dock-stations.js`): die einzige Absteck-Stelle war der **obere Bildrand** — ein
     * Zug ueber die Insel landete dort nur, weil sie oben liegt (`y = 15 … 55`). Sie war also gar
     * keine Stelle, sondern ein Zufall. Die Insel ist aber die Navigation („Eine Seitenleiste gibt es
     * nicht"), also ist sie der Ort, an dem man ein Objekt ablegt: „weg damit".
     *
     * Sie bekommt eine eigene Kennung (`insel`), damit die Anzeige sie zeigen kann — und **mehr**
     * Zugabe als die Zonen, weil sie kleiner ist.
     */
    const zugabe = Math.max(56, Math.round(Math.min(fenster.b, fenster.h) * 0.12))
    stellen.push({
      zone: 'closed',
      id: 'insel',
      axis: { entlang: 'x', platz: 'ecke' },
      rect: { x: insel.x, y: insel.y, w: insel.w, h: insel.h },
      margin: zugabe,
      // **Die Insel ist ein Punkt im Bild, keine Kante** — sie ist in beiden Achsen begrenzt.
      randlos: false,
    })
  }

  return stellen
}

/**
 * **Liegt der Zeiger in der Reichweite dieser Stelle?**
 *
 * Der Fangbereich ist ein **Band auf der Achse der Stelle** — nicht ein Kasten um sie herum. Das ist
 * der Unterschied, an dem die erste Fassung gescheitert ist: gemessen lag die linke Stelle bei
 * `0 … 280` mit 140 px Zugabe, und ihr „Fangbereich" reichte damit nur bis **420**. Ein Panel in ihrer
 * eigenen Spalte bei x = 500 fiel durch — obwohl es genau dort liegt, wo die Stelle ist.
 *
 * Warum: eine Stelle am linken Rand ist **so hoch wie das Fenster** (gemessen 280 x 900). Wer sie meint,
 * meint sie auf **jeder** Hoehe — ein Zug nach unten links ist genauso ein Zug an die linke Stelle wie
 * einer nach oben links. Nur die **Breite** ist begrenzt, und nur sie braucht eine Zugabe.
 *
 * Deshalb: die **Laengsachse** (die Richtung, in der die Stelle liegt) wird auf den Kasten plus Zugabe
 * geprueft — die **Querachse** auf das ganze Fenster. Das gilt fuer alle Stellen, auch fuer die Insel:
 * auch sie ist nur ein Punkt im Bild, und alles andere bleibt ihr fremd.
 */
function inReichweite(x: number, y: number, s: DockStation): boolean {
  const b = typeof window === 'undefined' ? 1440 : window.innerWidth
  const h = typeof window === 'undefined' ? 900 : window.innerHeight
  const nah = (wert: number, von: number, bis: number): boolean => wert >= von - s.margin && wert <= bis + s.margin
  if (s.axis.entlang === 'x') {
    // Laengsachse ist x: die Breite ist begrenzt, die Hoehe nur bei einer Stelle, die keine Kante ist.
    return nah(x, s.rect.x, s.rect.x + s.rect.w) && (s.randlos ? y >= 0 && y <= h : nah(y, s.rect.y, s.rect.y + s.rect.h))
  }
  return nah(y, s.rect.y, s.rect.y + s.rect.h) && (s.randlos ? x >= 0 && x <= b : nah(x, s.rect.x, s.rect.x + s.rect.w))
}

/**
 * **Welche Stelle unter dem Zeiger liegt — oder keine.**
 *
 * **Die kleinste gewinnt.** Die Stellen ueberlappen sich (die Insel liegt dort, wo auch die linke Stelle
 * ihre Breite hat), und die **genauere** Stelle muss den Vorrang haben. Ohne diese Regel entschiede die
 * Reihenfolge im Quelltext — und die Insel verloere gegen die Zone, obwohl sie das kleinere und gemeinte
 * Ziel ist. Gemessen: Insel 181 x 40 px gegen linke Stelle 280 x 900 px.
 *
 * Gibt **keine** Stelle zurueck, wenn der Zeiger nirgends in Reichweite ist. Dann bleibt ein Panel
 * schwebend — es verschwindet nicht (siehe `zoneAt`).
 */
export function stationAt(x: number, y: number, stellen: readonly DockStation[]): DockStation | null {
  let beste: DockStation | null = null
  for (const s of stellen) {
    if (!inReichweite(x, y, s)) continue
    if (!beste || s.rect.w * s.rect.h < beste.rect.w * beste.rect.h) beste = s
  }
  return beste
}

/** Eine Stelle zu ihrer Kennung — fuer die Anzeige waehrend des Ziehens. */
export function stationById(stellen: readonly DockStation[], id: string): DockStation | null {
  return stellen.find((s) => s.id === id) ?? null
}

/**
 * **Die Zonen, wie sie im Bild **liegen wuerden** — gerechnet, nicht gemessen.**
 *
 * `main.ts` misst die Zonen am DOM und setzt `--panel-links`. Hier wird dieselbe Geometrie
 * **nachgerechnet**, damit die Andockstellen schon beim **Ziehen** feststehen — also **bevor** das
 * Panel losgelassen ist und die Zone ihren Inhalt bekommt.
 *
 * **Warum das noetig ist.** Beim Ziehen aus einer Zone heraus wird das Panel **schwebend** (sonst
 * klebt es am Rand). Die Zone ist dann **aus** (`display: none`, gemessen), und wer ihre Lage erst
 * beim Loslassen am DOM abfragt, fragt einen leeren Kasten ab. Genau daran ist die erste Fassung
 * gescheitert: das Panel fiel in die Mitte zurueck.
 *
 * Die Breite kommt deshalb als **Zahl** herein (die gemessene Breite der linken Zone) — die Hoehe der
 * unteren Zone aus der Groesse des Panels, das dort steht.
 */
export function zoneRects(
  fenster: { readonly b: number; readonly h: number },
  groessen: { readonly links: number; readonly rechts: number; readonly unten: number },
  offen: { readonly links: boolean; readonly rechts: boolean; readonly unten: boolean },
): readonly ZoneRect[] {
  const rects: ZoneRect[] = []
  if (offen.links) rects.push({ zone: 'left', x: 0, y: 0, w: groessen.links, h: fenster.h })
  if (offen.rechts) rects.push({ zone: 'right', x: fenster.b - groessen.rechts, y: 0, w: groessen.rechts, h: fenster.h })
  if (offen.unten) rects.push({ zone: 'bottom', x: 0, y: fenster.h - groessen.unten, w: fenster.b, h: groessen.unten })
  return rects
}

/** Ein Panel, wie es die Oberflaeche anbietet. `render` malt den Inhalt. */
export interface PanelSpec {
  readonly id: string
  readonly title: string
  readonly zone: Zone
  /** Groesse in Pixeln: Breite fuer left/right, Hoehe fuer bottom. */
  readonly size: number
  readonly render: (host: HTMLElement) => void
}

/** Der gespeicherte Zustand eines Panels — alles, was sich aendern laesst. */
export interface PanelState {
  readonly id: string
  readonly zone: Zone
  readonly size: number
  /** Position und Groesse im schwebenden Zustand. */
  readonly floating: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
}

export interface DockLayout {
  readonly panels: readonly PanelState[]
  /** Je Zone das Panel, das vorne steht. */
  readonly active: Readonly<Record<Exclude<Zone, 'closed'>, string | null>>
  /**
   * **Die Fassung der Voreinstellung, mit der diese Anordnung entstanden ist.**
   *
   * Passt sie nicht zur aktuellen (`LAYOUT_VERSION`), wird die Anordnung verworfen. Ohne dieses Feld
   * hätte eine geänderte Voreinstellung **keine Wirkung** bei allen, die die Panels schon einmal
   * angefasst haben — und genau das war der Fall, den der Betreiber als „immer noch da" sah.
   */
  readonly version?: number
}

/*
 * **Die Fassung der Anordnung — und warum sie in der Ablage steht.**
 *
 * `loadLayout` gleicht den gespeicherten Zustand gegen die aktuellen Angebote ab, und der gespeicherte
 * **gewinnt**: wer die Panels einmal offen hatte, behält sie offen, auch nachdem die Voreinstellung
 * geändert wurde.
 *
 * Genau das ist dem Betreiber passiert: die Voreinstellung stand auf „alle abgesteckt", und in seinem
 * Raum lag weiterhin `plugin:health-check=right` — er sah das Panel und schrieb zu Recht „**immer noch
 * da**".
 *
 * Deshalb trägt die Ablage jetzt eine **Fassung**. Passt sie nicht zur aktuellen, wird die
 * gespeicherte Anordnung **verworfen** und die Voreinstellung gilt einmalig; danach ist die Ablage
 * wieder die Wahrheit. Das ist ehrlicher als ein Umbenennen des Schlüssels: es gibt **eine** Ablage,
 * **einen** Schlüssel und einen sichtbaren Grund, warum sie einmal zurückgesetzt wird.
 */
const LAYOUT_VERSION = 3

const STORAGE_NAME = 'dock.v2'

/** Aus den Angeboten die Anfangsanordnung bauen. */
export function initialLayout(specs: readonly PanelSpec[]): DockLayout {
  const panels: PanelState[] = specs.map((spec, index) => ({
    id: spec.id,
    zone: spec.zone,
    size: spec.size,
    floating: { x: 80 + index * 24, y: 90 + index * 24, w: 420, h: 300 },
  }))
  const active: Record<Exclude<Zone, 'closed'>, string | null> = {
    left: null,
    right: null,
    bottom: null,
    floating: null,
  }
  for (const panel of panels) {
    if (panel.zone !== 'closed' && !active[panel.zone]) active[panel.zone] = panel.id
  }
  return { panels, active, version: LAYOUT_VERSION }
}

/** Panels einer Zone, in Reihenfolge. */
export function panelsIn(layout: DockLayout, zone: Zone): readonly PanelState[] {
  return layout.panels.filter((p) => p.zone === zone)
}

/** Das Panel, das in einer Zone vorne steht. */
export function activeIn(layout: DockLayout, zone: Exclude<Zone, 'closed'>): PanelState | null {
  const id = layout.active[zone]
  if (!id) return null
  const found = layout.panels.find((p) => p.id === id && p.zone === zone)
  // Zeigt der Zeiger auf ein Panel, das die Zone gewechselt hat, faellt die Zone auf das
  // erste vorhandene zurueck — sonst waere die Zone sichtbar leer, obwohl Panels da sind.
  if (found) return found
  return panelsIn(layout, zone)[0] ?? null
}

/**
 * Verschiebt ein Panel in eine Zone.
 *
 * Beim Schliessen wird nichts geloescht: `zone: 'closed'` heisst „abgesteckt", und der
 * Betreiber kann es jederzeit wieder einhaengen. Die Groesse bleibt dabei erhalten.
 */
export function movePanel(layout: DockLayout, id: string, zone: Zone): DockLayout {
  const panels = layout.panels.map((p) => (p.id === id ? { ...p, zone } : p))
  const active = { ...layout.active }
  if (zone !== 'closed') {
    // Das verschobene Panel wird in seiner neuen Zone vorne sichtbar — man will es sehen,
    // wenn man es gerade dorthin gezogen hat.
    active[zone] = id
  }
  for (const key of ['left', 'right', 'bottom', 'floating'] as const) {
    if (active[key] && !panels.some((p) => p.id === active[key] && p.zone === key)) {
      active[key] = panels.find((p) => p.zone === key)?.id ?? null
    }
  }
  return { panels, active }
}

/** Setzt die Groesse einer Zone bzw. eines schwebenden Panels. */
export function resizePanel(
  layout: DockLayout,
  id: string,
  size: number,
  options: { readonly min?: number; readonly max?: number } = {},
): DockLayout {
  const min = options.min ?? 120
  const max = options.max ?? 900
  const clamped = Math.round(Math.min(max, Math.max(min, size)))
  return {
    ...layout,
    panels: layout.panels.map((p) => (p.id === id ? { ...p, size: clamped } : p)),
  }
}

/** Verschiebt ein schwebendes Panel. */
export function moveFloating(
  layout: DockLayout,
  id: string,
  x: number,
  y: number,
): DockLayout {
  return {
    ...layout,
    panels: layout.panels.map((p) =>
      p.id === id ? { ...p, floating: { ...p.floating, x: Math.round(x), y: Math.round(y) } } : p,
    ),
  }
}

/** Waehlt in einer Zone einen anderen Reiter. */
export function activatePanel(layout: DockLayout, zone: Exclude<Zone, 'closed'>, id: string): DockLayout {
  return { ...layout, active: { ...layout.active, [zone]: id } }
}

// ── Speichern ────────────────────────────────────────────────────────────────────────────

export function loadLayout(specs: readonly PanelSpec[], room: string): DockLayout {
  const fallback = initialLayout(specs)
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(room, STORAGE_NAME))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<DockLayout>
    if (!Array.isArray(parsed.panels)) return fallback
    /*
     * **Fassungsprüfung: eine geänderte Voreinstellung muss ankommen.**
     *
     * Ohne diese Zeile gilt für jeden, der die Panels schon einmal angefasst hat, **seine** Anordnung
     * weiter — auch wenn die Voreinstellung inzwischen „alle abgesteckt" lautet. Der Betreiber hat
     * genau das gesehen („immer noch da") und zu Recht nachgefragt.
     *
     * Die Anordnung wird dabei **nicht gelöscht**: `initialLayout` baut sie neu, und beim nächsten
     * Speichern steht die neue Fassung mit der Anordnung des Nutzers in derselben Ablage.
     */
    if (parsed.version !== LAYOUT_VERSION) return fallback
    // Gegen die **aktuellen** Angebote abgleichen: ein Panel, das es nicht mehr gibt, wird
    // verworfen; ein neues bekommt seine Voreinstellung. Sonst bleibt nach einem Umbau ein
    // gespeicherter Zustand stehen, der auf nichts mehr zeigt.
    const known = new Set(specs.map((s) => s.id))
    const defaults = new Map(fallback.panels.map((p) => [p.id, p]))
    const panels: PanelState[] = []
    for (const id of known) {
      const stored = parsed.panels.find((p) => p && p.id === id)
      const def = defaults.get(id)
      if (!def) continue
      panels.push(
        stored && typeof stored.zone === 'string' && ZONES.includes(stored.zone)
          ? {
              id,
              zone: stored.zone,
              size: typeof stored.size === 'number' ? stored.size : def.size,
              floating: stored.floating ?? def.floating,
            }
          : def,
      )
    }
    const layout = { panels, active: parsed.active ?? fallback.active }
    return {
      panels: layout.panels,
      active: {
        left: activeIn(layout, 'left')?.id ?? null,
        right: activeIn(layout, 'right')?.id ?? null,
        bottom: activeIn(layout, 'bottom')?.id ?? null,
        floating: activeIn(layout, 'floating')?.id ?? null,
      },
    }
  } catch {
    // Beschaedigter Speicher darf den Start nie verhindern.
    return fallback
  }
}

export function saveLayout(layout: DockLayout, room: string): void {
  try {
    globalThis.localStorage?.setItem(storageKey(room, STORAGE_NAME), JSON.stringify(layout))
  } catch {
    // Voller Speicher oder Privatmodus: kein Grund, die Ansicht zu verlieren.
  }
}
