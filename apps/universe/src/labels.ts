/**
 * **Wann ein Name gezeigt wird — und wie er aussieht.**
 *
 * **Was der Betreiber gesagt hat:** „ich denke es liegt eher auch an skallierungsgrösse und wenn es
 * immer anzeigt ist es unschön evt sollten wir name nur ab bestimmte grösse radius also fokusiert.
 * es muss ja idk passend denke in richtung scifi schrifft".
 *
 * Drei Aussagen, und alle drei sind berechtigt:
 *
 *   1. **„wenn es immer anzeigt ist es unschön"** — im gemessenen Bild standen **22 Namen**
 *      gleichzeitig im Bild, und Merkur, Venus, Erde, Mond, Mars und „Sonnensystem" lagen als
 *      Klumpen übereinander. Ein Name, der immer da ist, ist kein Hinweis mehr, sondern Rauschen.
 *   2. **„name nur ab bestimmte grösse"** — der richtige Filter ist **nicht** die Welteneinheit,
 *      sondern die **Grösse auf dem Bildschirm**. Ein Körper von 500 Einheiten ist bei weiter Sicht
 *      ein Punkt und bei naher Sicht eine Scheibe; nur der Bildschirm weiss, welcher Fall gilt.
 *   3. **„oder fokussiert"** — und das ist die Ausnahme, die die Regel brauchbar macht: **wer einen
 *      Körper ansieht, will seinen Namen sehen** — auch wenn er klein ist. Sonst verschwindet genau
 *      der Name, den man sucht.
 *
 * **Warum das eine eigene Datei ist.** Die Regel ist eine **Rechnung** (Bildschirmgrösse aus Weltgrösse
 * und Abstand), keine Zeichenanweisung. Sie gehört ohne Browser prüfbar — `tests/labels.test.ts`.
 */
import type { Level } from './universe'

/**
 * Die **Mindestgrösse auf dem Bildschirm**, ab der ein Körper seinen Namen bekommt.
 *
 * **14 Pixel Durchmesser.** Das ist die Grenze, ab der eine Kugel als **Kugel** erkennbar ist und
 * nicht als Punkt: darunter ist jeder Körper ein Pixel und jeder Name eine Behauptung über etwas,
 * das man nicht sieht.
 */
export const MIN_LABEL_PIXELS = 14

/**
 * Die Mindestgrösse für einen **Stern**.
 *
 * **Kleiner, und das ist Absicht.** Ein Stern ist das **Zentrum** — er ist der Anker, an dem man die
 * Bahnen liest. Wer die Sonne nicht benannt sieht, weiss nicht, wo das System hängt, auch wenn die
 * Bahnen da sind. Deshalb bekommt ein Stern seinen Namen schon bei 8 Pixeln.
 */
export const MIN_STAR_PIXELS = 8

/**
 * Wie gross ein Körper auf dem Bildschirm wird — in Pixeln Durchmesser.
 *
 * **Die Rechnung, und warum sie so aussieht.** Bei einem Bildwinkel `fov` und einer Bildhöhe `h`
 * deckt die Sicht in Abstand `d` die Höhe `2 · d · tan(fov/2)` ab. Ein Körper mit Radius `r` nimmt
 * davon den Anteil `2r / (2 · d · tan(fov/2))` ein — auf Pixeln also:
 *
 *   `pixel = h · r / (d · tan(fov/2))`
 *
 * **Was in die Rechnung gehört und was nicht.** Nur der **Abstand zur Kamera**, nicht die Entfernung
 * zum Fokuspunkt: ein Körper neben der Kamera ist gross, auch wenn der Blick woanders hinzeigt.
 */
export function screenDiameter(
  radius: number,
  cameraDistance: number,
  viewHeight: number,
  fovDegrees: number,
): number {
  if (!(cameraDistance > 0) || !(viewHeight > 0) || !(radius > 0)) return 0
  const halberWinkel = (Math.min(179, Math.max(1, fovDegrees)) * Math.PI) / 360
  return (viewHeight * radius) / (cameraDistance * Math.tan(halberWinkel))
}

/** Wofür ein Körper gehalten wird — die Rolle entscheidet über die Grenze. */
export type LabelKind = 'star' | 'body'

export interface LabelInput {
  /** Radius des Körpers in Welteneinheiten. */
  readonly radius: number
  /** Abstand der Kamera **zu diesem Körper** — nicht zum Fokuspunkt. */
  readonly cameraDistance: number
  readonly kind: LabelKind
  /** Ist dieser Körper gerade der Fokus? Dann bekommt er seinen Namen immer. */
  readonly focused: boolean
  /**
   * Ist er der **Fokus der Szene** (das Objekt, auf das die Kamera zeigt)?
   *
   * Anders als `focused`: das ist die Auswahl des Nutzers. Ein Objekt, in dem man steht, braucht
   * seinen Namen ebenfalls — sonst weiss man nicht, worin man ist.
   */
  readonly imBild: boolean
}

export interface LabelDecision {
  /** Wird der Name gezeigt? */
  readonly show: boolean
  /** Wie gross er auf dem Bildschirm ist — für die Anzeige und für Tests. */
  readonly pixels: number
  /** Warum — damit man den Grund nachlesen kann statt ihn zu erraten. */
  readonly reason: 'focused' | 'big-enough' | 'too-small'
}

/**
 * **Die Entscheidung.**
 *
 * Die Reihenfolge ist die Regel: der **Fokus gewinnt immer**, danach entscheidet die
 * Bildschirmgrösse. Wer die Reihenfolge umdreht, verliert den Namen genau dann, wenn man ihn sucht.
 */
export function labelDecision(input: LabelInput, viewHeight: number, fovDegrees: number): LabelDecision {
  const pixels = screenDiameter(input.radius, input.cameraDistance, viewHeight, fovDegrees)
  // **Der Fokus schlägt die Grösse.** Ein angesehener Körper wird benannt, auch wenn er klein ist.
  if (input.focused || input.imBild) return { show: true, pixels, reason: 'focused' }
  const grenze = input.kind === 'star' ? MIN_STAR_PIXELS : MIN_LABEL_PIXELS
  return pixels >= grenze
    ? { show: true, pixels, reason: 'big-enough' }
    : { show: false, pixels, reason: 'too-small' }
}

/**
 * Wie viele Namen auf einer **Bezugsebene** höchstens stehen.
 *
 * **Warum eine Obergrenze und nicht nur eine Grösse.** Bei einer weiten Sicht kann es passieren,
 * dass zwanzig Körper knapp über der Grenze liegen — dann steht wieder ein Klumpen da, nur mit
 * anderer Begründung. Die Grenze je Ebene ist die zweite Sicherung.
 *
 * **Die feinen Ebenen tragen mehr Namen, die groben weniger.** Das ist keine Willkür: auf der Ebene
 * eines Planeten stehen seine Monde und Nachbarn, und die will man lesen. Auf der Ebene des Universums
 * stehen **Umschlaege** — dort ist ein Name je Körper schon einer zu viel, weil ohnehin nur zwei oder
 * drei Körper im Bild sind (siehe `umschlag` in `universe.ts`).
 *
 * Die Zahlen sind Erfahrungswerte: bei zwoelf Ebenen und den Körpern, die dieses Universum hat, ist
 * das die Zahl, ab der ein Bild unruhig wird. Wer sie ändert, sieht das Ergebnis sofort.
 */
export const MAX_LABELS_PER_LEVEL: Readonly<Record<Level, number>> = {
  1: 4,
  2: 6,
  3: 6,
  4: 8,
  5: 8,
  6: 8,
  7: 6,
  8: 5,
  9: 4,
  10: 4,
  11: 3,
  12: 3,
}

/**
 * Wählt aus den sichtbaren Körpern die aus, die **beschriftet** werden — **ohne Überlagerung**.
 *
 * Drei Regeln, in dieser Reihenfolge:
 *
 *   1. **Der Fokus steht immer** — er ist die Ausnahme, für die es die Regel gibt.
 *   2. **Die Grössten zuerst.** Wenn nur acht Namen auf die Ebene passen, gehören sie den acht
 *      grössten Körpern — nicht den acht ersten in der Datenreihenfolge. Sonst entscheidet die
 *      Reihenfolge im Quelltext darüber, was man sieht, und das ist keine Regel, sondern ein Zufall.
 *   3. **Keine zwei Namen übereinander.** Im gemessenen Bild standen „Sonne" und „Sonnensystem"
 *      **auf derselben Stelle** — das System und sein Stern sitzen im selben Punkt. Ein Name, der
 *      einen anderen verdeckt, ist keiner: man liest einen Klumpen aus zwei Wörtern.
 *
 * **Warum die dritte Regel hier steht und nicht im Bild.** Sie ist eine Rechnung über Rechtecke —
 * `x`, `y` und die geschätzte Textbreite. Damit ist sie ohne Browser prüfbar, und genau das war bei
 * einer Regel, die „ob man etwas lesen kann" entscheidet, die Voraussetzung.
 */
export function chooseLabels(
  kandidaten: readonly (LabelInput & {
    readonly id: string
    /** Lage auf dem Bildschirm in Pixeln. Fehlt sie, wird nicht auf Überlagerung geprüft. */
    readonly screenX?: number
    readonly screenY?: number
    /** Geschätzte Textbreite in Pixeln — für die Überlagerungsprüfung. */
    readonly textWidth?: number
    /**
     * **Wie weit der Name unter dem Körper steht** — in Pixeln.
     *
     * Namen stehen **unter** ihrem Körper, nicht darauf (siehe `placeLabels`). Wer die Überlagerung
     * ohne diese Verschiebung prüft, prüft Rechtecke an Stellen, an denen die Namen gar nicht stehen:
     * zwei Körper, die dicht beieinander liegen, haben Namen, die sich **nicht** berühren — und
     * umgekehrt.
     */
    readonly offsetY?: number
  })[],
  level: Level,
  viewHeight: number,
  fovDegrees: number,
): readonly string[] {
  const grenze = MAX_LABELS_PER_LEVEL[level] ?? 8
  const entschieden = kandidaten.map((k) => ({
    id: k.id,
    screenX: k.screenX,
    // Die Verschiebung gehört **in** die Lage: geprüft wird, wo der Name steht, nicht wo der Körper ist.
    screenY: k.screenY === undefined ? undefined : k.screenY + (k.offsetY ?? 0),
    textWidth: k.textWidth,
    ...labelDecision(k, viewHeight, fovDegrees),
  }))

  // (1) Die Ausnahmen zuerst — sie stehen immer, und sie belegen ihren Platz.
  const fokus = entschieden.filter((e) => e.reason === 'focused')
  // (2) Der Rest nach Grösse.
  const grosse = entschieden
    .filter((e) => e.reason === 'big-enough')
    .sort((a, b) => b.pixels - a.pixels)

  const belegt: { x: number; y: number; w: number }[] = []
  const gewaehlt: string[] = []

  /** Passt der Name hier hin, ohne einen bereits gesetzten zu verdecken? */
  const frei = (e: (typeof entschieden)[number]): boolean => {
    if (e.screenX === undefined || e.screenY === undefined) return true
    const w = e.textWidth ?? 0
    const h = 18
    for (const b of belegt) {
      // Zwei Rechtecke überlappen, wenn sie sich in **beiden** Achsen überschneiden.
      const xUeber = Math.abs(e.screenX - b.x) < (w + b.w) / 2
      const yUeber = Math.abs(e.screenY - b.y) < h
      if (xUeber && yUeber) return false
    }
    return true
  }

  const setzen = (e: (typeof entschieden)[number]): void => {
    gewaehlt.push(e.id)
    if (e.screenX !== undefined && e.screenY !== undefined) {
      belegt.push({ x: e.screenX, y: e.screenY, w: e.textWidth ?? 0 })
    }
  }

  /*
   * Der Fokus zuerst — **aber auch er wird geprüft**.
   *
   * Hier stand vorher `for (const e of fokus) setzen(e)` ohne Prüfung, und im gemessenen Bild
   * standen „Sonne" und „Sonnensystem" weiterhin übereinander: beide sind Fokus (derselbe Punkt),
   * beide kamen ungeprüft durch, und die Kollisionsregel galt nur für die anderen.
   *
   * **Ein Name, der einen anderen verdeckt, ist keiner** — auch wenn er der Fokus ist. Also wird
   * der Fokus nach Grösse sortiert und ebenfalls geprüft: der Stern gewinnt gegen die
   * Zusammenfassung, weil er die genauere Aussage über dieselbe Stelle ist.
   */
  const fokusSortiert = [...fokus].sort((a, b) => b.pixels - a.pixels)
  for (const e of fokusSortiert) {
    if (!frei(e)) continue
    setzen(e)
  }
  /*
   * Und dann die Grossen, **bis die Grenze erreicht ist**.
   *
   * Gezaehlt werden nur sie: der Fokus ist die **Ausnahme**, nicht ein Kontingentplatz. Wer ihn
   * mitzaehlt, verliert bei jedem Fokus einen Platz fuer einen grossen Koerper — und im Bild sieht
   * man dann weniger, obwohl man mehr angesehen hat.
   */
  let gesetzt = 0
  for (const e of grosse) {
    if (gesetzt >= grenze) break
    if (!frei(e)) continue
    setzen(e)
    gesetzt += 1
  }

  return gewaehlt
}
