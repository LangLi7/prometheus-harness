/**
 * Kamera, Zoom und Bezugswechsel.
 *
 * **Der Kern:** Die Kamera steht im Raum und schaut in eine **Richtung**, die als
 * Quaternion gehalten wird — nicht als drei Winkel. Euler-Winkel haben eine
 * Gimbal-Sperre: bei bestimmten Stellungen faellt ein Freiheitsgrad weg und die Drehung
 * springt. Mit dem Quaternion gibt es diese Stellung nicht, deshalb ist die Drehung
 * wirklich 360° in jede Richtung.
 *
 * **Zoom ist Abstand, logarithmisch.** Ein Radklick ist ueberall derselbe *wahrgenommene*
 * Schritt (Faktor statt Zuwachs). Deshalb ist die gefuehrte Groesse `logZoom`, nicht `zoom`.
 *
 * **Der Abstand waehlt die Bezugsebene.** Es gibt keine Zoomstufen im Sinne von „Vergroesserung"
 * — es gibt einen Abstand, und aus ihm folgt, welche Ebene *ein Punkt* ist und welche ein
 * *Bezugssystem*. Das ist der Unterschied zur flachen Skalierung.
 */
import { Quaternion, Vector3 } from 'three'
import type { Level } from './universe'
import { LEVELS } from './universe'

export interface CameraState {
  /** Fokuspunkt in Weltkoordinaten — das, was im Bild mittig steht. */
  readonly focus: readonly [number, number, number]
  /** Abstand zum Fokuspunkt in Welteneinheiten. */
  readonly distance: number
  /** Blickrichtung als Quaternion (Kamera → Welt). */
  readonly orientation: readonly [number, number, number, number]
}

/** Untere Grenze: naeher als das geht die Kamera nicht heran. */
export const MIN_DISTANCE = 0.5
/**
 * Obere Grenze: weiter als das ist das ganze Netz ein Punkt.
 *
 * **Sie musste mit der Ebenenzahl wachsen — und das ist der Punkt.** Bei Faktor 4 je Ebene liegt die
 * oberste Ebene 12 bei `30 · 2^23` = **251,7 Mio**. Mit der alten Grenze von 4 Mio war bei Ebene **9**
 * Schluss: die Ebenen 10, 11 und 12 waren **unerreichbar** — eine Skala, die man nicht abfahren kann,
 * ist keine Skala. `tests/camera.test.ts` prüft genau das („herauszoomen führt durch alle Ebenen").
 *
 * Die neue Grenze lässt Luft: 4 Mrd liegt in Ebene 12, und die drei Stufen darunter sind alle
 * erreichbar. Wer die Ebenenzahl ändert, muss **diese** Zahl und `SCHWELLE` zusammen nachrechnen —
 * die Beziehung steht bei `SCHWELLE` als Tabelle.
 */
export const MAX_DISTANCE = 4_000_000_000

export const defaultCamera = (): CameraState => ({
  focus: [0, 0, 0],
  // Start **weit draussen**: der erste Blick zeigt die Ordnung des Ganzen, nicht ein Detail.
  // Wer hineinzoomt, wechselt den Bezug (Ebene 5 → 4 → 3 → 2 → 1).
  distance: 16_000,
  orientation: [0, 0, 0, 1],
})

/**
 * Der Startblick: das Sonnensystem, schräg von oben.
 *
 * Nicht von der Seite — dann läge die Bahnebene in der Blickrichtung und man sähe eine Linie
 * statt Ringe. Nicht senkrecht von oben — dann wirkt es wie ein Grundriss und die Tiefe fehlt.
 * 38° dazwischen ist der Winkel, in dem ein Sonnensystem so aussieht, wie man es kennt.
 */
export function openingView(showcase: readonly [number, number, number], outermostOrbit: number): CameraState {
  /*
   * Der Abstand muss den **äussersten Ring** fassen, nicht nur die Mitte: sonst liegt Neptun
   * ausserhalb des Bildes und das Sonnensystem sieht aus wie ein Fleck.
   *
   * **3,8 — die untere Kante von Ebene 4, und warum genau dort.** Zwei Anforderungen, die
   * gegeneinander arbeiten:
   *
   *   1. **Ebene 4 soll es sein** — die Bezugsebene „Sonnensystem". Sie beginnt bei Abstand **4500**.
   *   2. **Man soll etwas sehen.** Bei 5424 (Faktor 4,5) war das System ein **250 Pixel breiter
   *      Fleck**, und Merkur, Venus, Erde und Mars lagen als vier Beschriftungen übereinander: sie
   *      stehen innerhalb von **360 Einheiten**, das sind bei 5424 Abstand **70 Pixel**.
   *
   * Mit Faktor **3,8** ergibt sich 4761 — **innerhalb** von Ebene 4 und so nah an der unteren Kante,
   * wie es geht. Der äussere Ring füllt dann rund ein Drittel der Bildhöhe, und die inneren Planeten
   * haben getrennte Namen.
   *
   * **Warum nicht noch näher (Faktor 2 → 2506).** Dann wäre alles schön gross — und die Ansicht
   * fiele auf **Ebene 3** („Stern"). Der Test „die Startebene ist das Sonnensystem" hat genau das
   * gemeldet, und er hat recht: wer den Startblick auf einen Stern stellt, zeigt nicht das System.
   *
   * **Was man dafür nicht sieht:** Neptun liegt **ausserhalb** des Bildes. Das ist der Preis, und er
   * ist der bessere: ein Startbild, das alles enthält und nichts zeigt, ist kein Überblick. Wer das
   * ganze System sehen will, zoomt heraus — eine Handbewegung.
   *
   * ── Warum der Faktor 2,5 ist und nicht 3,8 ──────────────────────────────────────────────
   *
   * **Weil er zur Schwelle passen muss — und die hat sich geändert.** Der Startblick soll auf der
   * Ebene „Sonnensystem" liegen, und deren Band ist `SCHWELLE · 2^(2n+1)` … `SCHWELLE · 2^(2n+3)`.
   * Gemessen mit dem äussersten Ring des Beispiels (1 253 Einheiten):
   *
   *     SCHWELLE 70:  Ebene 4 = 4 500 … 17 950   →  1 253 · 3,8 = 4 761  ✓
   *     SCHWELLE 30:  Ebene 4 = 1 920 …  7 680   →  1 253 · 3,8 = 4 761  ✗ (das ist Ebene 5)
   *
   * Der Test „der Startblick zeigt das Sonnensystem — nicht einen Stern allein" hat genau das gemeldet,
   * als die Schwelle fiel: **Erwartet 4, bekommen 5.** Mit 2,5 ergibt sich **3 133** — innerhalb von
   * Ebene 4, und das Sonnensystem nimmt rund zwei Drittel der Bildhöhe ein.
   *
   * **Die Regel daraus:** eine Schwelle und ein Startfaktor sind **eine** Entscheidung, nicht zwei.
   * Wer eine ändert, rechnet die andere nach — oder ein Test sagt es ihm.
   */
  const passend = outermostOrbit * 2.5
  return orbitView(showcase, passend, SOLAR_ELEVATION, 0.45)
}

/**
 * Der nächstgelegene Abstand, bei dem eine bestimmte Ebene gezeigt wird.
 *
 * **Wozu das gut ist:** Beim Hineinzoomen soll die Ebenenfolge **durchlaufen** werden, nicht
 * springen. Wer von der Galaxie direkt auf einen Planeten springt, hat die Sterne nie gesehen.
 * Diese Umkehrung von `levelForDistance` erlaubt es, eine Ebene **gezielt** anzufahren — fuer
 * Sprungmarken, Befehle und Tests.
 */
export function distanceForLevel(level: Level): number {
  const step = Math.min(EBENEN_MAX - 1, Math.max(0, level - 1))
  // Die Mitte des Bereichs, nicht seine Kante: dort ist die Ebene sicher erreicht.
  return SCHWELLE * Math.pow(2, step * 2 + 1)
}

/**
 * **Wie viele Bezugsebenen es gibt — an EINER Stelle.**
 *
 * Vorher stand die Sieben an vier Stellen im Code (`Math.min(7, …)`, `Math.min(6, …)`, die Tabelle in
 * `universe.ts`, die Himmelsfarben in `main.ts`). Wer die Ebenenzahl ändert, muss **eine** Zahl ändern
 * — sonst gilt an einer Stelle noch die alte, und das Bild widerspricht sich selbst. Genau diese Klasse
 * von Fehler gab es hier schon zweimal: ein zweites `SCHWELLE` und zwei Konstanten mit demselben Namen.
 *
 * Die Zahl kommt aus `LEVELS` in `universe.ts` — nicht als zweite Wahrheit, sondern **gelesen**.
 */
export const EBENEN_MAX = LEVELS.length as Level

/**
 * **Die Schwelle der Bezugsebenen — sie muss zur Rahmung passen.**
 *
 * `SCHWELLE · 2^(2n+1)` legt fest, welcher Abstand zu welcher Ebene gehört (Faktor 4 je Stufe). Und
 * `framing` in `scene.ts` setzt den Abstand aus dem Inhalt: der grösste Körper einer Ebene soll
 * **75 % der Bildhöhe** einnehmen, also `d = r / (0,75 · tan 30°)`.
 *
 * **Beide Zahlen müssen zusammenpassen — sonst zappelt die Ansicht.** Gemessen
 * (`bun -e` über `buildScene` + `framingDistance`):
 *
 *     Ebene | grösster Körper + Ring | Rahmung | untere Bandgrenze (SCHWELLE 70)
 *       4   | apps                   | 1 478   | 4 500     ← Rahmung liegt IM Band 3
 *       5   | projekt-stack          | 1 550   | 17 950    ← 11,6× zu klein
 *       6   | prometheus             | 3 233   | 71 800
 *       7   | kosmischer Überblick   | 20 785  | 286 720
 *
 * Die Folge: **jede Rahmung warf die Ansicht in ein feineres Band zurück.** Beim Herauszoomen stieg der
 * Abstand (4 761 → 8 134 → 13 896), die Nachführung setzte ihn auf die Rahmung der neuen Ebene
 * (1 550 bzw. 3 014), und der Abstand landete wieder in der alten — eine Schleife, in der die Ansicht
 * **stehenblieb**. Der Betreiber: „**es ist immer noch eine sonne obwohl ich ultra weit weg bin**".
 *
 * **Warum 30.** Mit `SCHWELLE = 30` liegt die untere Grenze von Ebene *n* bei `30 · 2^(2n-3)`:
 *
 *     Ebene 4: 1 920    Ebene 5: 7 680    Ebene 6: 30 720    Ebene 7: 122 880
 *
 * und die gemessenen Rahmungen (1 478 / 1 550 / 3 233 / 20 785) liegen für die Ebenen **5–7** sauber
 * darin. Ebene 4 bleibt die Ausnahme: ihr grösster Körper (`apps`, Radius 187) ist **kleiner** als das
 * Sonnensystem (Ring 1 253) — die Ebene enthält zwei Maßstäbe, und die Rahmung nimmt den kleineren.
 * Das ist keine Unstimmigkeit der Schwellen, sondern eine Eigenschaft des Beispielbaums.
 *
 * **Was das für den Massstab heisst.** Ein Sonnensystem ist rund 10¹³ km gross, eine Galaxie 10¹⁸, das
 * beobachtbare Universum 10²³ — die echten Stufen springen um Faktor **10 bis 6 900** (gemessen in
 * `tools/magnitudes.ts`). Ein **konstanter** Faktor kann das nicht abbilden; vier Ebenen
 * Abstand sind hier rund 256-fach, nicht milliardenfach. Das ist der bewusste Verzicht dieses
 * Prototyps: die **Reihenfolge** stimmt (Kleinkörper → Planet → Stern → Sonnensystem → Sternhaufen →
 * Galaxie → Universum), die Steilheit nicht.
 */
export const SCHWELLE = 30

/**
 * **Der Abstand, bei dem ein Körper dieser Grösse gut im Bild steht.**
 *
 * ── Warum es diese Funktion gibt, und was sie behebt ─────────────────────────────────────
 *
 * Der Betreiber hat zweimal ein **leeres oder leeres-wirkendes** Bild gesehen:
 *
 *   „sieht immer noch so beschissen aus" (Ebene 7, eine **15-Pixel-Galaxie**)
 *   leerer Bildschirm auf **Ebene 1** (dort ist gar kein Körper im Bild)
 *
 * Beide Male war die Ursache dieselbe: `distanceForLevel` setzt den Abstand aus einer
 * **Zweierpotenz** — 70 · 2^(2n+1) — und **nicht** aus dem, was die Ebene zeigt. Bei Ebene 7 sind
 * das 573 440 Einheiten, während der einzige Körper der Ebene einen Radius von 9000 hat. Ein Körper
 * von 9000 Einheiten füllt aus 573 440 Einheiten Entfernung **1,5 %** der Bildhöhe.
 *
 * **Die Zahl der Ebenen war nie das Problem — der Abstand war es.** Wer die Kamera am Inhalt
 * ausrichtet, bekommt auf **jeder** Ebene ein Bild, das etwas zeigt.
 *
 * ── Die Rechnung ────────────────────────────────────────────────────────────────────────
 *
 * Ein Körper vom Radius `r` füllt `2·r / (2·d·tan(fov/2))` der Bildhöhe. Soll er den Anteil
 * `anteil` einnehmen, ist `d = r / (anteil · tan(fov/2))`. Mit `anteil = 0,30` steht er auf knapp
 * einem Drittel der Bildhöhe — gross genug zum Ansehen, klein genug, dass ringsum noch etwas Platz
 * ist.
 */
export function framingDistance(contentRadius: number, viewHeight: number, fovDegrees: number, anteil = 0.3): number {
  if (!(contentRadius > 0) || !(viewHeight > 0)) return 0
  const halbwinkel = Math.tan((fovDegrees * Math.PI) / 360)
  return clamp(contentRadius / (anteil * halbwinkel), MIN_DISTANCE, MAX_DISTANCE)
}

/**
 * Abstand → Bezugsebene.
 *
 * **Sieben Ebenen, jede um den Faktor 4 breiter.** Die Schwellen sind Zweierpotenzen, damit
 * jede Ebene gleich breit ist — nicht willkuerliche Zahlen.
 *
 * **Warum 4 und nicht 8:** Mit dem Faktor 8 lagen die Schwellen so weit auseinander, dass ein
 * Startblick, der die inneren Planeten zeigt, schon auf der **Stern**-Ebene landete — man sah
 * den Stern, aber nicht sein System. Der Faktor 4 gibt sieben Ebenen in der Spanne, die diese
 * Welt tatsaechlich hat.
 *
 * **Die Richtung folgt `universe.ts`:** je **groesser** die Zahl, desto **groesser** der Bezug.
 * Weiter weg heisst also eine groessere Ebene — vom Kleinkoerper ueber Planet, Stern,
 * Sonnensystem, Sternhaufen und Galaxie bis zum Ueberblick.
 *
 * **Das Drehen ist davon unberuehrt.** Man kann bei **jeder** Stufe frei drehen: der Abstand
 * waehlt, *was* man sieht, die Drehlage, *wohin* man schaut. Zwei getrennte Groessen — wer sie
 * vermischt, bekommt eine Welt, in der man nur in eine Richtung schauen kann.
 *
 * **Hier stand eine zweite `SCHWELLE` mit dem Wert 70.** Sie stand **später** und gewann damit gegen
 * die exportierte — wer an der einen drehte, sah keine Wirkung. Genau das ist beim Anpassen der
 * Schwellen passiert. Es gibt jetzt **eine**, oben bei `distanceForLevel`, mit der Herleitung.
 */
export function levelForDistance(distance: number): Level {
  const exponent = Math.log2(Math.max(distance, MIN_DISTANCE) / SCHWELLE)
  // exponent <0..2 → 1 (Kleinkoerper), dann je 2 Schritte eine Ebene hoeher, ab 22 → 12
  const step = Math.floor(Math.max(0, exponent) / 2)
  const level = 1 + step
  return Math.min(EBENEN_MAX, Math.max(1, level)) as Level
}

/**
 * Ein Zoom-Schritt ist ein Faktor — dadurch fuehlt sich Zoom ueberall gleich an.
 *
 * **Vorzeichen:** ein **positiver** Rastschritt heisst „**naeher heran**", also ein
 * **kleinerer** Abstand. Das entspricht dem Rad nach oben und der Taste `+`.
 *
 * ── Warum die Zahl von 1,25 auf 1,12 gefallen ist ───────────────────────────────────────
 *
 * Betreiber: „**die ebene und zoom ist zu schnelle wechseln da kann man nicht einmal reinzoomen wie
 * man es will ohne das es groesser wird oder kleiner, wir sollten evt die reichweite bis zur ebene
 * wechseln anpassen oder so**".
 *
 * **Er hat recht, und hier stand die Zahl für eine andere Skala.** Der alte Kommentar begründete die
 * 1,25 so: „fuer ein Universum mit **sieben** Groessenordnungen viel zu zahm". Mit sieben Ebenen waren
 * fünf Radzüge je Ebene vertretbar — man war schnell oben. **Mit zwölf Ebenen ist dieselbe Zahl
 * falsch**, denn der Weg ist länger und jede einzelne Stufe ist wichtiger: 12 × 5,2 sind 63 Züge für
 * den ganzen Bereich, und **innerhalb** einer Ebene hat man nur fünf Züge, um sich zurechtzufinden.
 *
 * ── Die Rechnung, offen — und zweimal korrigiert ────────────────────────────────────────
 *
 * Ein Mausrad-Ereignis sind **1,2 Rastschritte** (`main.ts` rechnet `-deltaY / 100`, Chrome liefert
 * `deltaY = 120`). Eine Ebene ist **Faktor 4** (`distanceForLevel` verdoppelt den Exponenten).
 *
 * **Der erste Anlauf rechnete `ln(4)`, und das war die falsche Strecke.** `setLevel(n)` fährt die
 * **Mitte** des Bandes an — und von der Mitte bis zur Grenze ist es nur die **halbe** Strecke, also
 * `ln(2)`. Die Vorhersage sagte 10,2 Ereignisse, gemessen wurden **6** (`tools/zoom-rate.js`).
 *
 * Für das Gefühl zählt genau diese kürzeste Strecke: von der Mitte bis zur nächsten Grenze. Nachgerechnet
 * (`tools/_zoom.ts`) und **mit dem echten Rad nachgemessen**:
 *
 *     Faktor   je Ereignis   Mitte → Grenze   ganze Ebenenbreite
 *     1,25       1,3070          2,6               5,2      ← so war es: man war durch, bevor man ankam
 *     1,12       1,1457          5,1              10,2
 *     1,08       1,0968          7,5              15,0      ← jetzt
 *
 * **Warum 1,08 und nicht 1,06.** 1,06 gäbe 9,9 Ereignisse bis zur Grenze, aber **201** für die ganze
 * Reise von 3 132 bis 4 Mrd. Das ist zu zahm — der Betreiber hat früher schon „**scrollen viel zu
 * langsam**" gemeldet, und ein Zoom, der 200 Züge für den Überblick braucht, wird nicht benutzt. 1,08
 * ist der Punkt, an dem beides zusammenpasst: **7,5 Züge je halber Ebene** und **152** für die Reise.
 *
 * **Warum nicht die Reichweite statt des Faktors.** Der Betreiber hat beides vorgeschlagen; die
 * Reichweite zu ändern hiesse, die **Ebenenbänder** breiter zu machen. Dann läge mehr Abstand in jeder
 * Ebene, und die Körper wären **innerhalb** der Ebene länger klein — das vergrössert genau das Problem,
 * das die Untergrenze (`MIN_BODY_PIXELS`) gerade löst. Der Faktor ist die richtige Schraube: er ändert
 * nur, wie schnell man fährt, nicht was man sieht.
 *
 * **Und er bleibt eine Einstellung** (`control.zoomFactor`) — wer es anders will, dreht daran.
 */
export const ZOOM_FACTOR_PER_NOTCH = 1.08

export function zoomBy(state: CameraState, notches: number, factor = ZOOM_FACTOR_PER_NOTCH): CameraState {
  // Ein Faktor unter 1 waere kein Zoom, sondern Stillstand bzw. eine Umkehrung. Deshalb wird er
  // **hier** abgefangen und nicht in der Einstellung: eine Kamera, aus der man nicht mehr
  // herauszoomt, ist der schlimmste Zustand, den eine Ansicht haben kann.
  const sicher = Number.isFinite(factor) && factor > 1 ? factor : ZOOM_FACTOR_PER_NOTCH
  const distance = clamp(
    state.distance / Math.pow(sicher, notches),
    MIN_DISTANCE,
    MAX_DISTANCE,
  )
  return { ...state, distance }
}

/**
 * Drehgeschwindigkeit in Radiant je Bildschirmpixel beim Ziehen.
 *
 * **Warum 0,00175.** Der Betreiber: „wenn ich versuche zu drehen ist es zu fast". Der alte Wert war
 * 0,0042, also **2,4-mal** so schnell. Ein Zug quer ueber einen 1280 px breiten Bildschirm dreht:
 *
 *   alt  0,0042 · 1280 · 180/π = **308°** — mehr als einmal herum, in **einem** Zug
 *   neu  0,00175 · 1280 · 180/π = **128°** — zwei Zuege, einmal herum
 *
 * **Eine Zahl, die hier frueher stand und falsch war.** In einer Vorversion stand, 0,0042 seien
 * „24 Pixel je Grad" und 0,00175 seien „57", und der CAD-Bereich liege bei 40 bis 60 px/°. Die
 * Rechnung war falsch: richtig sind **4,15** und **9,97** px/° — es wurde „Grad je Pixel" gerechnet
 * und „Pixel je Grad" genannt, der Wert war um 5,7 zu gross. Das Verhaeltnis alt/neu (2,4) stimmt,
 * und die Entscheidung, langsamer zu drehen, bleibt richtig. Die Umrechnung steht jetzt in
 * `settings.ts` (`pixelsPerDegree`, `degreesPerWidth`) und ist geprueft — `tests/settings.test.ts`
 * haelt die nachgerechneten Zahlen fest, damit der Fehler nicht zurueckkommt.
 */
export const ROTATE_SPEED = 0.00175

/**
 * Dreht die Kamera um `dx`/`dy` Bildschirmpixel.
 *
 * Die Drehung geschieht in **Kamerakoordinaten** (rechts/hoch) und wird **an die bestehende
 * Drehlage angehaengt** — nicht in Weltachsen. Nur so bleibt das Ziehen bei jeder Stellung
 * natuerlich, auch wenn man ueber den Pol hinweg ist.
 */
export function rotateBy(state: CameraState, dx: number, dy: number, speed = ROTATE_SPEED): CameraState {
  const current = new Quaternion(...state.orientation)
  const pitch = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), dy * speed)
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), dx * speed)
  // Erst gieren, dann nicken — beides in Kamerakoordinaten, also links multipliziert.
  const next = current.clone().multiply(yaw).multiply(pitch).normalize()
  return { ...state, orientation: [next.x, next.y, next.z, next.w] }
}

export const PAN_FACTOR = 0.0011

/**
 * Bewegt den Fokuspunkt in der Bildebene (Pan) — wie die mittlere Taste in CAD-Programmen.
 *
 * Der Faktor haengt am **Abstand**: bei weiter Sicht muss ein Pixelzug mehr Welt bewegen als
 * bei naher, sonst trifft der Zug nicht mehr das, was man angefasst hat. 0,0011 ist so
 * gewaehlt, dass ein Zug quer ueber den Bildschirm ungefaehr die halbe Bildbreite verschiebt.
 */
export function panBy(state: CameraState, dx: number, dy: number, factor = PAN_FACTOR): CameraState {
  const q = new Quaternion(...state.orientation)
  // Eine unsinnige Einstellung (0 oder negativ) darf das Schieben nicht **umkehren** — dann waere
  // die Maus eine Falle. Deshalb faellt der Faktor hier auf die Vorgabe zurueck.
  const k = state.distance * (Number.isFinite(factor) && factor > 0 ? factor : PAN_FACTOR)
  const right = new Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(-dx * k)
  const up = new Vector3(0, 1, 0).applyQuaternion(q).multiplyScalar(dy * k)
  const next = new Vector3(...state.focus).add(right).add(up)
  return { ...state, focus: [next.x, next.y, next.z] }
}

/**
 * Dreht die Welt um eine **bestimmte Achse** — das, was die Achsenanzeige greifbar macht.
 *
 * Das ist der Unterschied zur freien Drehung des Kamerablicks: hier dreht sich **die Welt**
 * um eine ihrer eigenen Achsen, wie wenn man in einem CAD-Programm am Achsenkreuz zieht. Der
 * Winkel ist positiv im Sinne der Achse (Rechte-Hand-Regel).
 */
export function spinWorld(
  state: CameraState,
  axis: readonly [number, number, number],
  angle: number,
): CameraState {
  const laenge = Math.hypot(axis[0], axis[1], axis[2])
  // Eine Achse der Laenge 0 ist keine Achse. Ohne diese Pruefung machte `normalize()` daraus
  // `NaN`, und die ganze Drehlage waere stillschweigend zerstoert — der Fehler faellt erst
  // spaeter auf, wenn nichts mehr zu sehen ist.
  if (!Number.isFinite(laenge) || laenge === 0 || !Number.isFinite(angle)) return state
  const stretch = new Quaternion().setFromAxisAngle(
    new Vector3(axis[0] / laenge, axis[1] / laenge, axis[2] / laenge),
    angle,
  )
  const current = new Quaternion(...state.orientation)
  // Von **links** multipliziert: die Drehung geschieht in Weltachsen, nicht in Kamerakoordinaten.
  const next = stretch.multiply(current).normalize()
  return { ...state, orientation: [next.x, next.y, next.z, next.w] }
}

/**
 * Setzt die Kamera **in** ein Objekt — der Bezugswechsel („Fix Fokus").
 *
 * Der Abstand wird nicht klein gesetzt, sondern auf die Groesse des Objekts bezogen:
 * ein Planet wird aus der Naehe betrachtet, ein Filament aus der Ferne. Sonst landet man
 * bei grossen Objekten *in* ihnen und sieht nichts.
 */
export function focusOn(
  state: CameraState,
  target: readonly [number, number, number],
  radius: number,
): CameraState {
  return {
    ...state,
    focus: [...target],
    distance: clamp(radius * 3.2, MIN_DISTANCE, MAX_DISTANCE),
  }
}

/** Kameraposition aus Fokus, Abstand und Blickrichtung. */
export function cameraPosition(state: CameraState): Vector3 {
  const q = new Quaternion(...state.orientation)
  const back = new Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(state.distance)
  return new Vector3(...state.focus).add(back)
}

/**
 * Eine Kamera aus Fokus, Abstand und **zwei Winkeln** bauen.
 *
 * **Warum das gebraucht wird:** Eine Bahnebene liegt in der `xz`-Ebene — waagerecht, wie eine
 * Tischplatte. Schaut man von der Seite darauf, sieht man sie als **Linie**; die Ringe werden
 * zu Streifen. Erst von **oben** werden aus den Kreisen die Ellipsen, die ein Sonnensystem
 * ausmachen.
 *
 * `elevation` ist der Winkel **über** der Bahnebene (0 = genau in ihr, π/2 = senkrecht von
 * oben), `azimuth` die Drehung darum. Beides in Bogenmaß.
 */
export function orbitView(
  focus: readonly [number, number, number],
  distance: number,
  elevation: number,
  azimuth = 0,
): CameraState {
  // Die Blickrichtung zeigt von der Kamera zum Fokus — deshalb ist die Kamera um
  // −(90° − elevation) um die x-Achse zu kippen, wenn man von schräg oben schaut.
  const pitch = elevation - Math.PI / 2
  const nick = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch)
  const giert = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), azimuth)
  const q = giert.multiply(nick).normalize()
  return {
    focus: [...focus],
    distance: clamp(distance, MIN_DISTANCE, MAX_DISTANCE),
    orientation: [q.x, q.y, q.z, q.w],
  }
}

/** Wie schräg die Kamera auf ein Sonnensystem schaut — 38° über der Bahnebene. */
export const SOLAR_ELEVATION = 0.66

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ── Zustand ueber den Reload retten ──────────────────────────────────────────────────────
//
// Der Betreiber will, dass ein Reload die Ansicht nicht verliert. Das betrifft **nur den
// Zustand** (Fokus, Abstand, Drehlage, Modus) — nicht die Welt selbst. Die Welt ist aus dem
// Code berechnet und damit immer reproduzierbar; sie zu speichern waere Ballast und wuerde
// bei jeder Aenderung veralten.
//
// **Der Schluessel haengt am Raum.** Jeder Nutzer hat eine eigene Instanz; laufen zwei Raeume
// im selben Browser, duerfen sie sich nicht ueberschreiben (siehe `room.ts`).

import { storageKey } from './room'

const STORAGE_NAME = 'world.v1'

export interface Persist {
  readonly camera: CameraState
  /**
   * Die Ansicht.
   *
   * **Drei, nicht zwei.** `chat` und `os` sind die beiden, die es von Anfang an gab. `web` ist die
   * **Vorlage des Betreibers** (`apps/web`) 1:1: der Verlaufshintergrund mit der Dynamic Island
   * darin — kein Canvas, keine Panels, nur die Insel. Der Betreiber: „anders gesagt ist unsere welt
   * anzeige eine art switch zur chat … und dort wird zb beim DSH structure web vorlage komplett
   * implementiert. also quasi 1:1".
   */
  readonly mode: 'chat' | 'os' | 'web'
}

export type Ansicht = Persist['mode']

export function loadPersist(fallback: Persist, room: string): Persist {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(room, STORAGE_NAME))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Persist>
    if (!parsed.camera || !isCamera(parsed.camera)) return fallback
    return { camera: parsed.camera, mode: alsAnsicht(parsed.mode) }
  } catch {
    // Beschaedigter oder gesperrter Speicher darf den Start **nie** verhindern.
    return fallback
  }
}

/**
 * Macht aus einem gespeicherten Wert eine Ansicht.
 *
 * **Warum das eine eigene Funktion ist.** Der gespeicherte Wert kommt aus dem **Speicher**, nicht
 * aus dem Code: er kann von einer aelteren Fassung stammen oder von Hand geschrieben sein. Ein
 * `parsed.mode === 'chat' ? 'chat' : 'os'`, wie es hier stand, verschluckt `web` stillschweigend —
 * die Ansicht waere nach jedem Reload wieder die Welt.
 */
export function alsAnsicht(raw: unknown): Ansicht {
  return raw === 'chat' || raw === 'web' ? raw : 'os'
}

export function savePersist(value: Persist, room: string): void {
  try {
    globalThis.localStorage?.setItem(storageKey(room, STORAGE_NAME), JSON.stringify(value))
  } catch {
    // Voller Speicher oder Privatmodus: kein Grund, die Ansicht zu verlieren.
  }
}

function isCamera(value: unknown): value is CameraState {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Partial<CameraState>
  return (
    Array.isArray(c.focus) &&
    c.focus.length === 3 &&
    c.focus.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    typeof c.distance === 'number' &&
    Number.isFinite(c.distance) &&
    c.distance >= MIN_DISTANCE &&
    c.distance <= MAX_DISTANCE &&
    Array.isArray(c.orientation) &&
    c.orientation.length === 4 &&
    c.orientation.every((n) => typeof n === 'number' && Number.isFinite(n))
  )
}
