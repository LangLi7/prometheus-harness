/**
 * Die Huelle: zwei Modi, Docking, Kamera-Schleife.
 *
 *   CHAT  — Verlauf und Eingabe. Kein Canvas. Auf dem Telefon die **einzige** Ansicht.
 *   OS    — die Welt: 3D-Universum, Rotation, Tiefen-Zoom, Bezugswechsel, Suche, Panels.
 *
 * **Zustand ueberlebt den Reload** (Betreiber-Wunsch): Modus, Kamera und Einstellungen werden
 * gespeichert. Die Welt selbst wird **nicht** gespeichert — sie ist aus dem Code berechnet und
 * damit immer reproduzierbar; sie zu speichern waere Ballast, der bei jeder Aenderung veraltet.
 *
 * **Sprache und Einstellungen sind der Kern, ihre Inhalte sind Plugins.** Das ist die Form, die
 * der Betreiber verlangt hat: „diese sprache fuer den harness wird durch eine language
 * package/plugin implementiert, wie beim Visual studio code extension". Der Kern kennt deshalb
 * **keinen** deutschen Satz und **keine** Einstellung — er kennt nur das Verfahren. Was es gibt,
 * beschreiben die Plugins; wie es klingt, die Sprachpakete.
 *
 * ── Warum diese Datei neu geschrieben wurde ─────────────────────────────────────────────
 *
 * Ein `Set-Content -NoNewline` hatte alle Zeilenumbrueche entfernt, und dadurch frassen die
 * `//`-Kommentare den jeweils folgenden Code. Der Inhalt war vollstaendig, die **Grenzen** zwischen
 * Kommentar und Code aber nicht mehr rekonstruierbar. Eine Reparatur haette geraten. Deshalb steht
 * die Datei hier neu — mit demselben Aufbau und derselben Reihenfolge wie vorher, und mit den
 * Einstellungen und Sprachschluesseln, die in dieser Runde dazugekommen sind.
 */
import './design-system.css'
import './app.css'
// **Die Vorlagen der Welt** — nach `app.css`, und das ist keine Kleinigkeit: eine Vorlage belegt
// dieselben Token mit anderen Werten. Stünde sie davor, gewänne der Grundsatz, und die Umschaltung
// täte nichts. Die Begründung steht in `stil.css`.
import './stil.css'
import { Quaternion, Vector3 } from 'three'
import {
  MAX_DISTANCE,
  MIN_DISTANCE,
  defaultCamera,
  distanceForLevel,
  focusOn,
  levelForDistance,
  loadPersist,
  openingView,
  panBy,
  rotateBy,
  savePersist,
  spinWorld,
  zoomBy,
} from './camera'
import type { Ansicht, CameraState } from './camera'
import {
  STIL_SCHLUESSEL,
  STIL_VORGABE,
  istStil,
  setzeStil,
  stilAusAdresse,
  stilMarke,
  stilWahl,
} from './stil'
import type { Stil } from './stil'
import { alsEinstellung, wechsleAnsicht } from './view-switch'
import type { Wechsel } from './view-switch'
import { chatUrl, inselChatTextKey, markeTextKey, markeZiel, takeArrival, waehleAnsicht } from './entry'
// **Die Zeichen der Oberfläche** — gezeichnet, nicht geschrieben. Bis zum 15.10.2026 standen hier
// Schriftzeichen (`◆`, `▤`, `◉`, `⟲`, `#`, `⌥`, `⚙`, `▸`); die Begründung steht in
// `packages/assets/icons/src/index.ts`. Der Typ ist eine Aufzählung: ein Tippfehler fällt beim
// Typlauf auf, nicht erst im Bild.
import { iconMarkup } from '@prometheus-harness/icons'
import type { IconName } from '@prometheus-harness/icons'
import { mountChat } from './chat-placeholder'
import type { Message } from './chat-types'
import { DockView, zoneAt } from './dock-view'
import { stationById, stationPlacement } from './docking'
import type { DockLayout, DockStation, PanelSpec } from './docking'
import { UniverseView } from './scene'
import { buildScene, crowding } from './scene'
import { describeRoom, hasSetup, markSetup, resolveRoom, storageKey } from './room'
import { PluginRegistry } from './plugins'
import { ViewControls } from './view-controls'
import { registerBuiltinPlugins } from './builtin-plugins'
import { Locales } from './i18n'
import { Settings } from './settings'
import { settingsPlugin } from './settings-screen'
import { SettingsModal } from './settings-modal'
import { orderPlugin } from './chat-order'
import { registerLocalePlugins } from './locale-plugins'
import { CONTROL_KEYS, controlsPlugin } from './control-settings'
// **Die Notizen** — das Plugin, das Daten aus dem Wirt zeigt (`/api/pmh/notizen`).
import { notizenPlugin } from './notizen'
/*
 * **Der Himmel sind Punkte im Raum** — siehe `stars.ts` und `scene.ts`. Er ist **kein** DOM mehr:
 * erzeugte Positionen, von der Grafikkarte gezeichnet. Die **Grenzhelligkeit** kommt weiter aus der
 * Bezugsebene (`grenzeFuerEbene`); die **Lage** ergibt sich aus der Kamera, weil die Sterne in
 * endlicher Entfernung stehen und die Kamera in Weltkoordinaten fährt.
 */
import { STERN_JE_KLASSE, grenzeFuerEbene, sterne } from './stars'
import { STERN_ANTEIL, stufeAusBildzeiten, stufeFuerKontext } from './gpu'
import type { Geraetestufe } from './gpu'
import { CanvasObjects } from './canvas-view'
import { quatFromAxisAngle, quatMultiply, rotationFrom } from './rotation'
import type { Mat, Quat } from './rotation'
import { LEVELS, countBodies, realSize, exampleUniverse, outermostOf, rankHits, search } from './universe'
import type { Hit, Level } from './universe'

/** Schmaler als das: nur Chat. Der Betreiber will mobil „quasi perspektivisch nur chat". */
const MOBILE_BREAKPOINT = 860

const root = document.getElementById('root')
if (!root) throw new Error('Wurzelelement #root fehlt')

/**
 * **Die dunkle Marke — genau wie im Harness.**
 *
 * `design-platform.css` führt **zwei** Token-Sätze: den hellen auf `body` und den dunklen auf
 * `body[data-ds-dark-theme]`. Ohne diese Zeile gilt der **helle** — die Oberfläche wäre weiß, und
 * zwar nicht durch einen Fehler in einer Regel, sondern weil der dunkle Satz schlicht nicht
 * ausgewählt ist.
 *
 * **Warum das eine eigene Zeile sein muss.** Ein `@media (prefers-color-scheme: dark)` gäbe es
 * auch, aber der Harness schaltet das Thema **ausdrücklich** (der Nutzer wählt es, und die
 * Desktop-Hülle meldet es). Wer sich auf die Systemeinstellung verlässt, hat bei hellem System eine
 * weiße Oberfläche in einem Fenster, das dunkel sein soll.
 *
 * `document.body` ist hier schon da: das Skript wird als Modul geladen, und Module laufen nach dem
 * Parsen des Dokuments.
 */
document.body.dataset.dsDarkTheme = ''

/**
 * Der Raum — die Grenze zwischen zwei Nutzern.
 *
 * Der Betreiber hat klargestellt: nicht „eigene Daten in einer gemeinsamen Datenbank", sondern
 * **eine eigene Instanz**, „komplett sein eigenes wie eine Sandbox / Container". Im Prototyp ist
 * der Raum ein **Name aus der Adresse** (`?room=alice`); die echte Grenze zieht spaeter der
 * Container. Sichtbar ist er trotzdem — niemand soll raten muessen, in welchem Universum er gerade
 * schaut.
 */
const room = resolveRoom(window.location.search)

/**
 * **Wohin die Marke oben links fuehrt — in den Chat, an die Wurzel DERSELBEN Herkunft.**
 *
 * Seit dem 14.10.2026 liegen Chat und Welt auf **einem** Port: der Chat an `/`, die Welt an
 * `/universe/`. Die Adresse des Chats ist damit keine Angabe mehr, die jemand mitbringen müsste —
 * sie steht in `location.origin` ({@link chatUrl}).
 *
 * **Gelesen wird beim Klick, nicht beim Laden.** Prüfbarkeit: die Huelle wird in den Tests
 * **einmal** geladen (alle Testdateien teilen sich ein Modul, gemessen); ein Wert, der nur beim
 * Laden gelesen wird, ließe sich dort nicht mehr herstellen. `location.origin` beim Klick zu lesen
 * ist derselbe Wert, nur später — und der Fall ist damit prüfbar.
 *
 * **Was hier stand und warum es weg ist.** Ein Zusatz `?chat=<fremde Adresse>` und ein Speicher je
 * Raum — beides Notwendigkeiten aus der Zeit **zweier** Ports. Der Betreiber hat den langen Link
 * bemerkt: *„der link ist nur zu lange so lol"*. Die Begründung steht in `entry.ts`.
 *
 * **Ohne Herkunft bleibt der alte Weg:** die Chat-Ansicht dieses Prototyps (erreichbar über
 * `view chat`). Das ist der Fall, wenn die Welt nicht von einem Webserver ausgeliefert wird.
 */
function chatZiel(): string | undefined {
  return chatUrl(globalThis.location?.origin)
}

// ── Sprache und Einstellungen: die Verwaltungen ─────────────────────────────────────────
//
// **Warum sie hier stehen und nicht in einem Plugin.** Weil alles andere sie braucht: jede
// Beschriftung, jede Zahl der Kamera, jeder Panel-Titel. Eine Verwaltung, die selbst ein Plugin
// waere, muesste geladen sein, bevor irgendetwas angezeigt wird — und dann waere sie kein Plugin
// mehr, sondern ein Fundament mit anderem Namen.
//
// **Was dagegen ein Plugin ist:** die **Inhalte**. Die Sprachpakete (`locale-plugins.ts`), jede
// Einstellung (das Plugin, das sie beschreibt), der Einstellungsbildschirm (`settings-screen.ts`).

const locales = new Locales()
const settings = new Settings(room)

/**
 * Der Uebersetzer der **aktuellen** Sprache.
 *
 * Als Funktion, nicht als Wert. Die Sprache kann sich mitten im Lauf aendern (`lang de`); wer den
 * Uebersetzer einmal holt und weglegt, zeigt danach die alte Sprache — an genau einer Stelle, und
 * niemand findet sie wieder.
 */
const t = (): ReturnType<Locales['translator']> => locales.translator()

/** Kurzform fuer eine einzelne Uebersetzung: `tr('panel.search')`. */
function tr(key: string, vars?: Readonly<Record<string, string | number>>): string {
  return locales.lookup(key, vars)
}

// ── Die Vorlage (Stil) ───────────────────────────────────────────────────────────────────
//
// **Warum das hier steht und nicht in einem Plugin.** Die Vorlage ist keine Beigabe zu einem
// einzelnen Bauteil: sie gilt fuer **alles** — Kamera-Anzeige, Insel, Panels, Dialog. Ein Plugin
// muesste geladen sein, bevor irgendetwas gezeichnet wird, und waere damit ein Fundament mit anderem
// Namen (dieselbe Begruendung wie bei Sprache und Einstellungen, siehe oben).
//
// **Was ein Plugin beisteuert, ist die Auswahl** (`ui-controls` beschreibt `interface.stil`) — und
// damit erscheint sie im Einstellungsbildschirm, ohne dass diese Datei etwas davon weiss.

/** Die Vorlage aus der Adresse (`?stil=prometheus`) — sie gewinnt beim Laden, ohne gespeichert zu werden. */
const stilAdresse = stilAusAdresse(globalThis.location?.search ?? '')

/**
 * **Die geltende Vorlage — Wahl und Herkunft.**
 *
 * Der Wert aus dem Speicher geht **durch die Prüfung** (`stilWahl`): ein beschädigter oder fremder
 * Wert darf nicht als Attribut im Dokument landen, denn die Vorlage **ersetzt** den Grundsatz und
 * ergänzt ihn nicht. Ein unbekannter Name ließe die Welt ohne Farben stehen.
 */
const vorlageWahl = stilWahl(settings.getString(STIL_SCHLUESSEL, STIL_VORGABE), stilAdresse)

/** Die Vorlage, die gerade gilt. `let`, weil sie sich im Lauf ändern kann (Einstellung, Adresse). */
let aktiverStil: Stil = vorlageWahl.stil

setzeStil(document.documentElement, aktiverStil, vorlageWahl.quelle)

/**
 * Tauscht das Zeichen der Marke.
 *
 * **Warum die Marke und nicht nur die Farbe.** Wer einen Bildschirm fotografiert, sieht ein Bild ohne
 * Namen — zwei Vorlagen, die sich nur in Farbtönen unterscheiden, sind darauf nicht zu unterscheiden.
 * Das Zeichen ist die **einzige** Struktur, die eine Vorlage ändert (siehe `stil.ts`) — und es steht
 * an zwei Stellen: in der eingeklappten Insel und in der Kopfzeile.
 *
 * **Warum es nichts wirft, wenn nichts da ist.** In den Prüfungen ist das Gerüst ein Stub ohne diese
 * Knoten. Ein `querySelector` gibt dort `null` beziehungsweise eine leere Liste — die Funktion tut
 * dann nichts. Ein `throw` wäre hier ein Absturz beim Laden, also beim ersten Bild.
 */
function markenZeichenTauschen(): void {
  const markup = iconMarkup(stilMarke(aktiverStil), 'marke')
  for (const stelle of document.querySelectorAll('.marke')) stelle.innerHTML = markup
}

/**
 * Setzt die Vorlage im Lauf.
 *
 * **Der Adresszusatz wird dabei nicht angefaßt.** Wer eine Einstellung ändert, will sie sehen — auch
 * dann, wenn die Seite mit `?stil=…` geöffnet wurde. Der Zusatz gilt beim **Laden**; danach gilt, was
 * der Nutzer tut. Alles andere wäre eine Einstellung, die sich nicht bedienen läßt.
 *
 * @param stil - die neue Vorlage
 * @param quelle - woher sie kommt (steht im Dokument und ist damit nachlesbar)
 */
function setzeVorlage(stil: Stil, quelle: 'adresse' | 'einstellung' | 'vorgabe'): void {
  aktiverStil = stil
  setzeStil(document.documentElement, stil, quelle)
  markenZeichenTauschen()
}

// ── Steuerung: aus den Einstellungen, nicht aus Konstanten ───────────────────────────────
//
// **Warum hier Funktionen stehen und keine Werte.** Eine Einstellung kann sich mitten im Lauf
// aendern. Wer sie einmal liest und in eine Variable legt, hat eine zweite Wahrheit — und die
// Anzeige im Einstellungsbildschirm zeigt dann etwas anderes als die Kamera tut.
//
// Die Zahlen in Klammern sind die **Rueckfallwerte**: sie gelten, wenn das Plugin `ui-controls`
// abgeschaltet ist. Ein abgeschaltetes Plugin nimmt seine Beschreibung mit — die Kamera darf
// deshalb nicht stehenbleiben, sie muss mit den Vorgaben weiterlaufen.

/** Radian je Bildschirmpixel beim Ziehen. Vorgabe: 0,00175 rad/px = 57 Pixel je Grad. */
function rotateSpeed(): number {
  return settings.getNumber('control.rotateSpeed', 0.00175)
}
/** Faktor je Radrastschritt. Vorgabe: 1,25 — drei Schritte je Halbierung. */
function zoomFactor(): number {
  return settings.getNumber('control.zoomFactor', 1.25)
}
/** Radian je Pixel beim Ziehen an einem Achsengriff. */
function axisSpinSpeed(): number {
  return settings.getNumber('control.axisSpin', 0.006)
}
/** Anteil des Abstands, um den ein Pixelzug schiebt. */
function panFactor(): number {
  return settings.getNumber('control.panFactor', 0.0011)
}
/** Das Achsenkreuz zeigen? */
function showAxes(): boolean {
  return settings.getBoolean('control.showAxes', true)
}
/** Die Zahl der wirkenden Dimensionen (3 bis 5). */
function worldDimensions(): number {
  return clampZahl(settings.getNumber('universe.dimensions', 3), 3, 5)
}

/**
 * Ist die Oberflaeche schon gebaut?
 *
 * **Das ist die wichtigste Zeile dieser Datei, und sie ist aus einem echten Absturz entstanden.**
 *
 * Die Sprach-Plugins rufen beim **Eintragen** ihren `onSwitch` — sie setzen die Startsprache und
 * melden das sofort. `onSwitch` ruft `relabel()`, und `relabel()` greift auf `dock` zu. `dock` wird
 * aber erst weiter unten deklariert. Zur Laufzeit heisst das: `ReferenceError: Cannot access 'dock'
 * before initialization` — **beim Laden des Moduls**.
 *
 * Die Folge war nicht eine Fehlermeldung, sondern ein **leeres Bild**: das Modul starb, bevor
 * `requestAnimationFrame(loop)` erreicht war. Das Canvas blieb schwarz, das Achsenkreuz halb
 * gezeichnet, und nichts sagte warum. Genau so hat es der Betreiber gesehen („komplett leer").
 *
 * Mit dieser Marke ist die Reihenfolge **nicht** mehr eine Frage des Gluecks: was vor dem Aufbau
 * passiert, beschriftet nichts. Und wer spaeter etwas eintraegt, muss nicht wissen, was schon steht.
 */
let aufgebaut = false

// Das Universum gehoert dem Raum. Im Prototyp ist es ueberall dasselbe Beispiel; sobald der Harness
// angebunden ist, wird es **je Instanz** aus deren eigenen Daten gebaut — deshalb steht die
// Erzeugung hier an einer Stelle und nicht verstreut.
const universe = exampleUniverse()

/**
 * Der **Startblick**: das Sonnensystem, schräg von oben.
 *
 * Vorher startete die Ansicht irgendwo im Nichts bei Abstand 14 000 — das erste Bild war ein
 * dunkler Fleck. Jetzt berechnet `openingView` den Abstand aus dem **äussersten Ring**, damit
 * Neptun im Bild liegt, und setzt die Kamera 38° über die Bahnebene. Von der Seite wäre die Ebene
 * eine Linie; von oben sieht man die Ringe.
 */
function startCamera(): CameraState {
  const showcase = search(universe, 'Sonnensystem')[0]
  if (!showcase) return defaultCamera()
  /*
   * **Der Fokus liegt auf dem Stern — nicht auf dem Container.**
   *
   * Gemessen im gemerkten Zustand (`tools/focus.js` liest ihn aus):
   *
   *     focus: [-800, 60, 900]   ← die Lage des **Containers** „Sonnensystem"
   *     distance: 4761
   *
   * Die Körper sitzen aber **nicht** dort: `scene.ts` rechnet sie von `world + kern.position` aus,
   * weil der Kern (die Sonne) im Container einen eigenen Versatz hat (`kern = children[0]`). Die
   * Kamera schaute also auf einen Punkt **1204 Einheiten neben** der Sonne — sie stand im Bild
   * nicht mittig, und beim Hineinzoomen lief man am System **vorbei** ins Leere.
   *
   * Aufgefallen ist es an einer Messung, die etwas anderes prüfen sollte: beim Zoom auf die Erde war
   * nach drei Radstufen nichts benannt, weil die Erde gar nicht dort war, wo die Kamera hinschaute.
   *
   * Deshalb: der Fokus ist **der Kern des Systems**, und das ist sein erstes Kind.
   */
  const kern = showcase.body.children?.[0]
  const kernWelt: readonly [number, number, number] = kern
    ? [
        showcase.world[0] + kern.position[0],
        showcase.world[1] + kern.position[1],
        showcase.world[2] + kern.position[2],
      ]
    : showcase.world
  /*
   * **Der äusserste Ring kommt aus den Kindern des Systems — nicht aus einer Suche.**
   *
   * Hier stand `search(universe, 'Neptun')[0]`, und dessen `world` ist die Summe über **alle**
   * Ebenen darüber. Im Beispielbaum liegt unter den Zusammenfassungen ein weiterer Neptun, also
   * stand dort 22 434 statt 1 253 Einheiten — der Startblick rechnete `3,8 · 22434` und die Sonne
   * war **1,8 Pixel** gross. Gemessen mit `tools/scale.ts`; im Bild war es ein Punkt, und ich
   * habe dreimal an der Sonne korrigiert statt am Abstand.
   */
  const aussen = outermostOf(showcase.body)
  return openingView(kernWelt, aussen ? aussen.radius : 1200)
}

const persist = loadPersist({ camera: startCamera(), mode: 'os' }, room)
let camera: CameraState = persist.camera
let mode: Ansicht = persist.mode

// ── Die 5D-Ansicht ───────────────────────────────────────────────────────────────────────
//
// **Fuenf Freiheitsgrade der Ansicht**, nicht fuenf Raumachsen: drei Raumachsen (x, y, z), die
// **Drehlage** und die **Zeit**, mit der sich die Drehlage aendert. Der Betreiber will Bewegung —
// „bei 5D ist es rotation ect" und „doch das wollte ich".
//
// **Warum die Drehung nicht aus der Kamera kommt.** Die Kamera haelt ein Quaternion — das ist 3D
// und reicht fuer den Blick. Damit die Welt sich aber **als Ganzes** dreht (das ist der Unterschied
// zwischen „ich drehe den Kopf" und „der Raum dreht sich"), bekommt jede Position erst eine Drehung
// der Welt und danach die Kamera. Beides sind Quaternionen, beides ohne Gimbal-Sperre.

interface Welt5D {
  /** Zehn Drehflaechen-Werte fuer `SO(5)`. */
  bivector: number[]
  /** Wie weit die Drehung fortgeschritten ist — die **Zeit** als Freiheitsgrad. */
  time: number
  /** Laeuft die Eigenrotation? */
  laeuft: boolean
  /** Wie schnell (je Sekunde). */
  tempo: number
  /**
   * Wie viele Dimensionen **wirken** — 3 bis 5.
   *
   * **Das ist die Antwort auf „kann ja nicht sein das ich drehe und schon die sonnesystem sehen
   * kann".** In 3D gibt es drei Drehflaechen (x-y, x-z, y-z); das sind genau die drei
   * Quaternion-Drehungen, die jeder kennt. Erst die vierte und fuenfte Dimension bringen die
   * zusaetzlichen sieben Flaechen — die, die sich **nicht** als Kippen eines Raums beschreiben
   * lassen. Wer es bei drei laesst, sieht eine Welt, die sich wie erwartet dreht; wer fuenf setzt,
   * sieht eine, die sich zusaetzlich **verwindet**.
   */
  dimension: number
}

const universe5d: Welt5D = {
  // Die ersten drei Flaechen sind die gewohnten 3D-Drehungen (x-y, x-z, y-z); die restlichen sieben
  // gibt es nur in 5D. Sie bleiben klein, damit der Ueberblick lesbar bleibt.
  bivector: [0.12, 0.05, -0.18, 0.02, 0, 0, 0.01, 0, 0, 0],
  time: 0,
  laeuft: true,
  tempo: 0.045,
  dimension: 3,
}

/** Die Drehung der Welt als Quaternion, aus der 5D-Ansicht abgeleitet. */
function universeRotation(): Quat {
  // Die ersten drei Drehflaechen von SO(5) sind genau die drei Drehungen des 3D-Raums. Deshalb
  // laesst sich die Weltdrehung **exakt** als Quaternion bilden — kein Umweg ueber eine 5×5-Matrix,
  // die three.js gar nicht verstehen wuerde.
  const [xy = 0, xz = 0, yz = 0] = universe5d.bivector.map((value) => value * universe5d.time)
  const a = quatFromAxisAngle([0, 0, 1], xy)
  const b = quatFromAxisAngle([0, 1, 0], xz)
  const c = quatFromAxisAngle([1, 0, 0], yz)
  return quatMultiply(c, quatMultiply(b, a))
}

/** Die Zeit der **Bahnen** — unabhängig von der Drehlage des Universe. */
const bahnen = { sekunden: 0, laeuft: true, tempo: 1 }

/**
 * Die volle Drehmatrix — fuer den Nachweis und den Terminalbefehl `rotation`.
 *
 * **Sie haengt an der eingestellten Dimension.** Bei 3 sind es die drei bekannten Flaechen, bei 5
 * alle zehn. Die Matrix ist der Grund, warum „5D" hier keine Behauptung ist: wer sie liest, kann
 * nachrechnen, dass sie orthonormal ist und die Determinante +1 hat (`tests/rotation.test.ts`
 * prueft das fuer jede Dimension).
 */
function universeMatrix(): Mat {
  const n = universe5d.dimension
  const flaechen: { plane: readonly [number, number]; angle: number }[] = []
  // Alle Paare (i, j) mit i < j — das sind n·(n−1)/2 Flaechen: bei 5 genau zehn.
  let index = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      flaechen.push({ plane: [i, j], angle: (universe5d.bivector[index] ?? 0) * universe5d.time })
      index += 1
    }
  }
  return rotationFrom(n, flaechen)
}

// ── Geruest ──────────────────────────────────────────────────────────────────────────────

root.className = 'app'
/**
 * **Das Markenzeichen der Kopfzeile.**
 *
 * Hier stand ein `◆` — ein Schriftzeichen, das auf dem Rechner des Betrachters mal eine fette Raute
 * ist und mal eine dünne, und in manchen Schriften ein Platzhalterkästchen. Jetzt steht dort die
 * **Flamme** aus `@prometheus-harness/icons`: dieselbe Zeichnung auf jedem Rechner, in der Farbe der
 * Oberfläche (`currentColor`).
 *
 * **Warum als Konstante und nicht im Markup.** Das Gerüst darunter ist **ein** Template-String. Ein
 * zweiter Aufruf von `iconMarkup` weiter unten wäre eine zweite Gelegenheit, ein anderes Zeichen zu
 * setzen — hier steht es einmal, und wer die Marke ändern will, ändert sie an einer Stelle.
 *
 * **Und seit dem 16.10.2026 hängt das Zeichen an der Vorlage.** `stilMarke` nennt es: das Gerüst
 * („grund") trägt die Flamme, die Vorlage „prometheus" den Phönix, der daraus steigt. Die Marke ist
 * damit das einzige, was eine Vorlage an der **Struktur** ändert — und sie muß es: an der Farbe
 * allein erkennt niemand, welche Richtung gerade gilt.
 */
const MARKEN_ZEICHEN = iconMarkup(stilMarke(aktiverStil), 'marke')
root.innerHTML = `
  <div class="screen" id="screen-chat"></div>
  <!--
    Die **Vorlage des Betreibers** (apps/web) — 1:1.

    Aufbau: die Flaeche (.screen), darin der Verlaufshintergrund (.universe) und die Dynamic
    Island (.isl). Eingeklappt ist die Insel eine Pille (230 x 40, Radius 22), aufgeklappt eine
    Flaeche von 560 x 280 mit Radius 16 — CHANNELS mit zwei Spalten.

    **Warum das ein eigener Bildschirm ist und nicht ein Zustand der Welt.** Der Betreiber:
    „anders gesagt ist unsere welt anzeige eine art switch zur chat". Zwei Ansichten, die
    dieselben Knoten benutzen, nehmen sich gegenseitig die Kinder weg.

    ACHTUNG: hier duerfen **keine Backticks** stehen — sie beenden die Zeichenkette.
  -->
  <div class="screen hidden" id="screen-web">
    <div class="universe" aria-hidden="true"></div>
    <div class="isl" id="islWeb"></div>
  </div>
  <div class="screen" id="screen-os">
    <!--
      ══ DER HIMMEL ══════════════════════════════════════════════════════════════════════════════

      **Hier stand eine eigene Schicht.** Bis zum 16.10.2026 lag an dieser Stelle ein div
      (Klasse himmel-schicht, Kennung himmel) mit 4 053 gezeichneten Sternen — eine **Plattkarte**
      aus sky.ts, die je Bild über zwei CSS-Variablen verschoben wurde.

      **Was hier bewusst NICHT steht: ein Ersatz-Element.** Die Sterne sind jetzt **Punkte im Raum**
      (stars.ts) und werden im Canvas gezeichnet (scene.ts) — mit echter Parallaxe, weil die Kamera in
      Weltkoordinaten fährt. Der Dunst über der Fläche kommt weiter aus der Variablen starfield
      (app.css), aber die Sterne brauchen kein DOM mehr — und ein leeres Element, das nur noch einen
      Namen trägt, wäre eine Einladung, es wieder zu füllen.

      (Der Betreiber zu diesem Umbau: keine Bilder nutzen, das mache es laggy — stattdessen die Sterne
      erzeugen, damit der Zoom wirklich aussieht wie ein Schiff, das beschleunigt.)
    -->
    <!--
      Die **Kernfläche** ist alles, was die Welt selbst ist: Canvas, Beschriftungen, Achsenanzeige,
      Insel und Kopfzeile. Sie ist ein **eigenes Element**, seit das Dock kein Overlay mehr ist:
      vorher lagen die Panels absolut über dem Canvas, und beim Öffnen der Welt **erschienen** sie
      schlagartig darüber — der Betreiber: „dockingstuff wurde einfach rein getan plop auftaucht".

      Jetzt sind Kern und Dock **Geschwister**: der Kern nimmt den Platz, der übrig bleibt, das Dock
      den, den es braucht. Wer ein Panel öffnet, verkleinert die Welt — statt sie zu verdecken.
    -->
    <div class="core" id="core">
      <canvas id="world"></canvas>
      <div class="labels" id="labels"></div>
      <div class="axes" id="axes"></div>
      <!--
        Die **Dynamic Island** ist die einzige Navigation. Aufbau und Maße aus der Vorlage des
        Betreibers (H:/Projekt/Programmieren/Prometheus/sketches/002-g-universe/index.html):
        eingeklappt eine Pille von 40 px Hoehe, auf Klick eine Flaeche von 560 x 280 mit Kopfzeile,
        Gruppen und Eintraegen.

        **Eine Seitenleiste gibt es nicht** — der Betreiber hat sie ausdruecklich abgelehnt.

        ACHTUNG beim Aendern: In diesem Template-String duerfen **keine Backticks** stehen. Sie
        beenden die Zeichenkette, und der Fehler zeigt dann auf eine ganz andere Stelle.
      -->
      <div class="isl" id="isl">
        <div class="mini" id="islMini" role="button" tabindex="0" aria-expanded="false">
          <span class="marke">${MARKEN_ZEICHEN}</span>
          <b>PROMETHEUS</b>
          <span id="miniTxt">orbit</span>
        </div>
      </div>
      <div class="hud" id="hud">
        <span class="wm"><span class="marke">${MARKEN_ZEICHEN}</span>PROMETHEUS</span>
        <small id="hudLine"><span id="hudLevel"></span> <span id="hudEcht"></span> <span id="hudDist"></span> <span id="hudFps"></span> <span id="hudGeraet"></span></small>
      </div>
    </div>
    <div class="dockhost" id="dockhost"></div>
    <!--
      Die **Einstellungen** als eigener Bildschirm ueber allem — die Form aus dem Harness
      (ui-settings-shell): links die Abschnitte, rechts die Zeilen. Der Betreiber:
      „sollte es den settings oeffnen vom Harness die man auch in chat hat".

      **Ausserhalb der Bildschirme**, nicht darin: die Einstellungen gehoeren keiner Ansicht —
      sie sind aus Welt, Chat und Vorlage gleichermassen erreichbar.

      ACHTUNG: hier duerfen **keine Backticks** stehen — sie beenden die Zeichenkette.
    -->
    <div class="set-overlay" id="settingsOverlay"></div>
    <div class="mobile-note hidden" id="mobileNote">
      <span id="mobileText"></span>
      <button type="button" class="mobile-switch" id="mobileSwitch">Chat</button>
    </div>
  </div>`

const screens = {
  chat: must<HTMLElement>('#screen-chat'),
  os: must<HTMLElement>('#screen-os'),
  web: must<HTMLElement>('#screen-web'),
}
const canvas = must<HTMLCanvasElement>('#world')
const labelLayer = must<HTMLElement>('#labels')
const axesLayer = must<HTMLElement>('#axes')
const hud = must<HTMLElement>('#hud')

/**
 * **Der Himmel ist kein Element mehr.**
 *
 * Hier stand eine **DOM-Schicht** (`<div id="himmel">`) mit 4 053 `<circle>`, erzeugt aus `sky.ts`.
 * Sie wird mit dieser Runde **nicht mehr gebraucht** — und das ist der eigentliche Gewinn: der
 * Betreiber hat den Grund selbst genannt, ohne ihn zu kennen.
 *
 * > *„keine bilder nutzen lol ;D das macht es doch so laggy ;D, stattdessen kannst du doch quasi die
 * > sterne generieren oder anderewaltig machen das es realistisch zoom in and zoom out ist. like star
 * > wars schiff beschleunigen"*
 *
 * Die Sterne entstehen jetzt als **Punkte im Raum** (`stars.ts`) und werden von der Grafikkarte
 * gezeichnet (`scene.ts`, `setzeSterne`). Was damit verschwindet:
 *
 *   * die Stilberechnung über 4 053 Knoten je Lageänderung (gemessen 58,8 ms → 0,09 ms, und danach
 *     ganz weg: **kein** DOM-Zugriff mehr je Bild),
 *   * die Plattkarte samt ihrer Randverzerrung (eine Schwäche, die im Dokument stand — die Perspektive
 *     hat sie nicht),
 *   * und der Umweg über zwei CSS-Variablen, der beim Rauszoomen **nicht** billiger wurde, weil die
 *     Kosten an der Zahl der Knoten hingen und nicht an der Zahl der sichtbaren Sterne.
 *
 * Was **bleibt**, ist die Bezugsebene: sie entscheidet über die Grenzhelligkeit (`STERN_GRENZE`) und
 * über den Dunst (`--starfield`, eine Farbfläche aus `app.css`). Beides wird beim **Ebenenwechsel**
 * gesetzt, nicht je Bild.
 */

/**
 * **Die Marke oben links ist der Umschalter zum Chat.**
 *
 * **Der Auftrag des Betreibers (14.10.2026):** *„schaue dir eine moeglichkeit es einfacher in dem
 * Universe modus zu wechseln ich denke wir nutzen oben links den text wo den deepseek logo und text
 * ist fuers wechseln"* — und auf die Rueckfrage, welche Stelle genau: *„ja genau … zur chat wechseln
 * von universum zur chat ist das auch ein gute idee ansonsten habe ich noch in dynamic illand die
 * moeglichkeit es zu wechseln."*
 *
 * **Was hier entsteht.** Die Marke (`.wm`, im Markup `◆ PROMETHEUS`) wird ein Bedienelement. **Wohin
 * sie fuehrt, haengt davon ab, ob es einen Chat in Reichweite gibt** (`markeZiel`, `entry.ts`):
 *
 * | Fall | Ziel |
 * |---|---|
 * | die Welt laeuft auf einem **Server** (`location.origin` ist echt) | **der Harness-Chat** — die Wurzel **derselben** Herkunft, an der er ausgeliefert wird |
 * | die Welt wurde **ohne** Webserver geoeffnet (`file://` hat `origin === 'null'`) | die **Chat-Ansicht dieses Prototyps** (Platzhalter) |
 *
 * **Warum diese Unterscheidung noetig war.** Der Betreiber hat es gemessen: er klickte die Marke —
 * und landete im Platzhalter („Hier entsteht der Chat"). Der echte Prometheus-Chat und der
 * Platzhalter dieses Prototyps heissen beide „Chat" und sind **nicht** dasselbe. Wer ueber den
 * Umschalter hereinkam, will zurueck **in den Chat, aus dem er kam**; wer die Welt direkt aufruft,
 * hat keinen anderen Chat in Reichweite.
 *
 * **Die Herkunft wird BEIM KLICK gelesen** (`chatZiel`), nicht beim Laden — der Testhuelle wegen
 * (alle Testdateien teilen ein Modul, siehe `docs/status/umschalter-marke.md` §3.2) und weil es im
 * Betrieb dasselbe ist: die Herkunft aendert sich ohne Neuladen nicht.
 *
 * **Und die Insel?** Ihre Eintraege (`Chat`, `Universe`, `Vorlage`) wechseln **innerhalb** der Welt —
 * so hiess es beim Bau, und dabei bleibt es. Deshalb gilt die Regel:
 * **die Marke fuehrt zwischen Harness und Welt, die Insel fuehrt innerhalb der Welt.**
 *
 * **Warum Rolle und Tastaturweg.** Ein Klickziel ohne Rolle ist im Browser nicht bedienbar
 * (Befund „Barrierefreiheit" in `docs/design/ui-keep-cut.md`): ein `<span>` bekommt keinen Fokus und
 * keine Enter-Taste. Die Marke bleibt **dasselbe Element mit demselben Aussehen** — dazu kommen
 * `role`, `tabindex` und zwei Zuhoerer. Die Beschriftung setzt `relabel()`, damit sie der Sprache
 * folgt. Das Aussehen regelt `app.css` (`.hud .wm`): Zeiger, Trefferflaeche, Fokusring.
 */
const hudMarke = must<HTMLElement>('.wm', hud)

/**
 * **Der Weg zum Chat — eine Stelle, drei Wege hinein.**
 *
 * Was geschieht, entscheidet `markeZiel` (`entry.ts`) — und der Unterschied ist keine Kleinigkeit:
 * mit Adresse wird **navigiert** (die Welt wird verlassen), ohne Adresse wird **umgeblendet** (die
 * Welt bleibt, nur die Ansicht wechselt). Wer beides gleich behandelt, blendet beim Verlassen
 * zusaetzlich auf den Platzhalter um — genau das war der Fehler aus dem Bild des Betreibers.
 *
 * **Wer hier hereinkommt:** die **Marke** oben links (Klick und Tastatur) und der Eintrag
 * **`▤ Chat`** der Insel. Der Betreiber: *„kannst du noch den neue implementierungsverknuepfung auch
 * hier machen: ◉ ansichten · ▤ Chat · ⟲ Ansicht zuruecksetzen"*. Zwei Wege mit demselben Namen
 * muessen **dasselbe** tun — sonst fuehrt der eine in den echten Chat und der andere in den
 * Platzhalter.
 */
function geheZumChat(): void {
  const ziel = markeZiel(chatZiel())
  if (ziel.art === 'ansicht') {
    wechsleAnsicht(wechsel, ziel.ansicht)
    return
  }
  const ort = globalThis.location
  if (ort === undefined) return
  if (typeof ort.assign === 'function') ort.assign(ziel.adresse)
  else ort.href = ziel.adresse
}

hudMarke.setAttribute('role', 'button')
hudMarke.setAttribute('tabindex', '0')
hudMarke.addEventListener('click', () => {
  geheZumChat()
})
hudMarke.addEventListener('keydown', (event) => {
  // Dieselbe Tastenbelegung wie bei jedem Knopf: Enter und Leertaste. Ein `keydown` auf einem
  // fokussierten Element erreicht dieses Element — anders als bei der Insel, die ihre Tasten am
  // Dokument haengt, weil sie beim Aufklappen ihren Knoten verliert.
  const taste = (event as KeyboardEvent).key
  if (taste !== 'Enter' && taste !== ' ') return
  ;(event as KeyboardEvent).preventDefault?.()
  geheZumChat()
})
/**
 * Die Insel der **Vorlage** (`apps/web`).
 *
 * Sie ist ein **eigener** Knoten, nicht derselbe wie im Weltmodus: die Vorlage und die Welt sind
 * zwei Ansichten, und zwei Ansichten duerfen nicht denselben Knoten besitzen — sonst nimmt die eine
 * der anderen das Kind weg, sobald sie ihn fuellt.
 */
const islWeb = must<HTMLElement>('#islWeb')

/**
 * **Der Himmel wird nur neu gebaut, wenn sich die Bezugsebene ändert.**
/**
 * **Ist der Himmel an?** — `null` heisst „noch nie gesetzt".
 *
 * Der Himmel folgt der Einstellung `universe.visuals` (der Wert `none` lässt ihn aus, siehe
 * `universeView`). Damit wird er nicht mehr bei jedem Ebenenwechsel neu gebaut, sondern nur bei einem
 * **Wechsel des Werts** oder der Ebene — und der Zustand muss dafuer gemerkt werden.
 *
 * `null` und nicht `false`: sonst haelt der erste Aufruf „aus" fuer „schon gesetzt" und baut den
 * Himmel nie, wenn er beim Start aus ist.
 */
let skyOn: boolean | null = null

/**
 * **Was das Universum zeigt — die eine Antwort auf drei Fragen.**
 *
 * Der Wert steht in der Einstellung `universe.visuals` (eine Auswahlliste, siehe
 * `control-settings.ts`). Drei Stellen hängen daran: das **Zeichnen der Körper** (`setDrawing`), der
 * **Sternenhimmel** (`applyStarfield`) und die **Beschriftungen** (sie hängen an `setDrawing`).
 *
 * **Warum eine Funktion und nicht drei Abfragen.** Vorher las jede Stelle den Wert selbst — und
 * `applyStarfield` verknüpfte ihn zusätzlich per UND mit einem zweiten Feld, das es in keiner
 * Einstellung gab. Wer die Körper wegwollte, verlor die Sterne. **Eine** Stelle, die den Wert
 * übersetzt, ist die Antwort darauf.
 *
 * **Was `'all'` NICHT heisst.** Nicht „alles", sondern „Körper **und** Himmel" — das ist die
 * vollständige Anzeige. Alles darüber hinaus (Raster, Achsenkreuz, Beschriftungen der Schnittstelle)
 * gehört zur **Schnittstelle** und bleibt in jedem Fall.
 *
 * @returns `none` (leer), `stars` (nur Himmel) oder `all` (Körper und Himmel)
 */
function universeView(): 'none' | 'stars' | 'all' {
  // Die Vorgabe ist **die Welt**, nicht die leere Sandbox: ein erster Blick auf
  // `/universe/`, der nichts zeigt, ist von einem Fehler nicht zu unterscheiden.
  const roh = settings.getString(CONTROL_KEYS.universeVisuals, 'all')
  return roh === 'stars' || roh === 'all' ? roh : 'none'
}

/**
 * **Und die zuletzt gebaute Ebene.**
 *
 * `applyStarfield` erzeugt ein Bild aus rund 900 Kreisen — das ist billig, aber nicht umsonst, und
 * `updateReadouts` läuft mehrmals in der Sekunde. Diese Zahl merkt sich, für welche Ebene der Himmel
 * zuletzt gebaut wurde; nur ein **Wechsel** baut ihn neu.
 *
 * **Warum diese beiden HIER stehen und nicht neben `applyStarfield`.** Dort standen sie zuerst — und
 * damit **nach** der Einstellung, die `applyStarfield` beim Aufbau ruft (`settings.onChange`). Ein
 * `let` ist vor seiner Zeile nicht definiert, und der Aufruf wäre mit „Cannot access before
 * initialization" gestorben.
 */
let lastSkyLevel = 0

/**
 * **Für welche Bezugsebene das Sternenfeld zuletzt gelegt wurde.**
 *
 * Das Feld umgibt den **Beobachter** und wird bei einem Ebenenwechsel neu gelegt (die Begründung steht
 * in `applyStarfield`). Diese Zahl ist die Bedingung dafür: ohne sie würde bei **jeder** Meldung neu
 * gebaut — auch bei denen, die nur den Dunst betreffen — und die Sterne sprängen, obwohl sich nichts
 * geändert hat.
 *
 * `0` heißt „noch nie gelegt": jeder Ebenenwert (1 … 12) ist davon verschieden, also legt der erste
 * Aufruf das Feld in jedem Fall.
 */
let sterneGelegtFuer = 0

/**
 * Das Sternenfeld als Hintergrundbild — **je Bezugsebene ein anderes** (siehe `HIMMEL`).
 *
 * Erzeugt aus einem **festen** Zufallsstartwert: dieselben Sterne bei jedem Laden und auf jeder Ebene.
 * Ein wechselndes Feld waere bei jedem Neuladen ein anderes Weltall — und beim Zoomen ein Flackern, weil
 * die Sterne springen wuerden. Was sich aendert, ist nicht **wo** sie stehen, sondern **wie viele** und
 * **wie hell** — siehe `HIMMEL`.
 *
 * Die Sterne liegen **nicht** in der 3D-Welt. In der ersten Fassung lagen sie auf einer Kugelschale
 * in der Szene und fielen bei mittlerem Zoom in einen weissen Klumpen in der Mitte.
 *
 * `ebene` ist die Bezugsebene (1 = Planet … 7 = Universum). Sie bestimmt zwei Dinge: die **Farbe** des
 * Dunstes und den **Anteil** der Sterne, die ueberhaupt gezeichnet werden.
 */
function starfieldUrl(ebene = 4): string {
  /*
   * **Die Sterne sind hier NICHT mehr.**
   *
   * Bis zum 15.10.2026 wurden sie in diesem Bild mitgezeichnet — als Kreise in einem
   * background-image. Das hatte zwei Folgen, und beide hat der Betreiber gemeldet: der Himmel
   * **klebte am Bildschirm** („es fühlt sich wie ein stock background an"), und er hatte auf jeder
   * Ebene dieselbe **Dichte** („bei end of the universe … immer noch so viele sterne … unlogisch").
   *
   * Jetzt sind die Sterne **Punkte im Raum** (`stars.ts`), gezeichnet von der Grafikkarte
   * (`scene.ts`), mit **endlicher** Entfernung — und die **Grenzhelligkeit** steigt mit der
   * Bezugsebene. Was hier bleibt, ist der **Dunst** — die diffusen Verläufe, die zur Ebene gehören.
   *
   * **Warum das eine Trennung ist und keine Verlagerung.** Sterne sind **Quellen** (ein Punkt mit
   * einer Richtung), Dunst ist ein **Untergrund** (eine Fläche ohne Richtung). Die Quellen haben
   * Tiefe und Parallaxe, der Untergrund nicht. Wer beides in ein Bild legt, kann nur eines von beiden
   * richtig machen.
   */
  const farben = HIMMEL[Math.min(HIMMEL.length - 1, Math.max(0, ebene - 1))]!
  const parts: string[] = []
  /*
   * **Die Nebel sind VERLÄUFE — kein Weichzeichner.**
   *
   * Hier stand ein `feGaussianBlur` über drei Ellipsen, mit der Begründung „ein Nebel hat keine Kante".
   * Das war richtig gedacht und **falsch gebaut**: ein SVG-Filter wird auf seinen **Filterbereich**
   * gerastert, und der ist ein Rechteck. Was darüber hinausgeht, ist **abgeschnitten** — die Kante war
   * danach keine Ellipse mehr, sondern eine **Gerade**.
   *
   * Der Betreiber hat genau das gesehen und dreimal gemeldet: „die andere stuff ist immer noch da",
   * „immer noch da den abgedeckte teil?" und zuletzt „das sollten wir ändern". Es war kein abgedecktes
   * Element und auch kein Panel — es war der **Rand des Filterbereichs**, mitten im Bild, und er stand
   * still, während sich die Welt drehte.
   *
   * **Ein Verlauf kann keine Kante haben.** Ein `radialGradient` läuft bis `stop-opacity: 0` aus, und
   * zwar ohne Rastergrenze: es gibt nichts zu beschneiden. Deshalb ist der Nebel jetzt ein Verlauf und
   * nicht mehr ein Bild mit Unschärfe — die Wirkung ist dieselbe, der Fehler ist ausgeschlossen.
   *
   * Die Farben kommen aus `nebelFarben` (drei Farbtöne je Zoomstufe): das Weltall **sieht anders aus**,
   * je weiter man hinausgeht — von der warmen Umgebung eines Sterns bis zum kalten Grund des Kosmos.
   */
  const nebel = `
    <defs>
      ${nebelVerlauf('w1', 0.26, farben[0])}
      ${nebelVerlauf('w2', 0.22, farben[1])}
      ${nebelVerlauf('w3', 0.16, farben[2])}
    </defs>
    <rect x="0" y="0" width="1600" height="900" fill="url(#w1)"/>
    <ellipse cx="1180" cy="640" rx="760" ry="440" fill="url(#w2)"/>
    <ellipse cx="900" cy="180" rx="520" ry="300" fill="url(#w3)"/>`

  /*
   * **Und das Bild wird auf das Fenster GEZOGEN, nicht beschnitten.**
   *
   * Hier stand `preserveAspectRatio="xMidYMid slice"`. Bei einem Fenster, dessen Seitenverhältnis nicht
   * 16:9 ist, **schneidet** `slice` das Bild ab — und der Schnitt ist wieder eine gerade Kante. Mit
   * `none` füllt es die Fläche in beiden Richtungen; Sterne werden dabei höchstens ein paar Prozent
   * breiter oder schmaler, und das sieht niemand.
   */
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="none">${nebel}${parts.join('')}</svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

/**
 * Ein Nebel als Verlauf: eine Farbe, die in der Mitte sitzt und zum Rand hin **ausläuft**.
 *
 * Der Rand ist die ganze Absicht: `stop-opacity` geht auf `0`, lange bevor der Kasten aufhört. Deshalb
 * gibt es keine Stelle, an der etwas aufhört — und damit auch keine Kante.
 */
function nebelVerlauf(id: string, deckkraft: number, farbe: readonly [number, number, number]): string {
  const [r, g, b] = farbe
  return `<radialGradient id="${id}" cx="50%" cy="50%" r="62%">
      <stop offset="0%" stop-color="rgb(${r}, ${g}, ${b})" stop-opacity="${deckkraft}"/>
      <stop offset="55%" stop-color="rgb(${r}, ${g}, ${b})" stop-opacity="${(deckkraft * 0.45).toFixed(3)}"/>
      <stop offset="100%" stop-color="rgb(${r}, ${g}, ${b})" stop-opacity="0"/>
    </radialGradient>`
}

/**
 * **Der Himmel je Bezugsebene — das Weltall sieht anders aus, je weiter man hinausgeht.**
 *
 * Der Betreiber: „**beim maximum denke ich es wäre besser das es komplett in eine umhüllung aussehen
 * könnte mit weisse sterne weil universum sich ja ausdehnt aber ab bestimmt grenze von weitem sollte
 * irgendwann nicht überall sterne geben hintergrund verstehst was ich meine?**"
 *
 * Verstanden — und es ist ein **Maßstabsthema**, kein Farbthema: eine Ebene ist nicht nur „weiter weg",
 * sie hat eine **andere Art von Leere**. Deshalb bekommt jede der **zwölf** Stufen ihren eigenen Himmel:
 *
 *    1  Kleinkörper        fast schwarz. Man steht **auf** einem Körper; der Himmel dahinter ist Rest.
 *    2  Planet             kalt und dünn — der Blick von der Oberfläche nach oben.
 *    3  Stern              warm: das Licht der Sonne färbt den Dunst.
 *    4  Sonnensystem       wärmer, mehr Dunst — die Atmosphäre eines Systems.
 *    5  Planetensystem     violett: die Bahnen liegen im Staub.
 *    6  Sternsystem        violettblau — viele junge Sterne, viel Staub.
 *    7  Sternhaufen        blauviolett, erste Leere zwischen den Sternen.
 *    8  Welteninsel        blau: die Scheibe einer Galaxie, Staubbänder.
 *    9  Galaxiengruppe     dunkelblau und dünn — die Leere zwischen den Inseln beginnt.
 *   10  Galaxienhaufen     kälter, weniger Dunst.
 *   11  Superhaufen        fast leer, nur ein Hauch.
 *   12  Universum          **kalt und leer.** Das ist die „Umhüllung": kaum Dunst, und die Sterne sind
 *                          Punkte **ohne** Himmel. Was bleibt, ist der Rand.
 *
 * Die Sterne selbst werden nach aussen **dünner und weisser** (siehe `starfieldUrl`), damit das Maximum
 * nach aussen wirkt und nicht nach einem leeren Bild.
 */
export const HIMMEL: readonly (readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]])[] = [
  [[16, 15, 22], [10, 10, 16], [6, 6, 11]],
  [[20, 19, 30], [14, 14, 24], [8, 8, 16]],
  [[62, 34, 16], [38, 24, 30], [18, 14, 24]],
  [[44, 26, 14], [30, 22, 34], [16, 14, 26]],
  [[40, 28, 52], [30, 22, 44], [16, 14, 28]],
  [[38, 30, 62], [30, 26, 54], [16, 14, 30]],
  [[34, 32, 70], [28, 24, 58], [15, 14, 32]],
  [[30, 34, 72], [26, 22, 58], [14, 14, 32]],
  [[20, 26, 60], [16, 20, 48], [10, 12, 28]],
  [[14, 20, 50], [12, 16, 40], [8, 10, 24]],
  [[10, 14, 40], [8, 11, 30], [5, 7, 18]],
  [[8, 12, 34], [6, 8, 24], [4, 5, 14]],
]

// ── Welt ─────────────────────────────────────────────────────────────────────────────────
//
// **Die Welt entsteht im Startabschnitt, nicht hier.** Ihr Bau braucht WebGL, und damit ist er der
// **letzte** Schritt des Starts — nicht der erste. Solange diese Zeile weiter oben stand, starb das
// Modul bei fehlender Grafikkarte, **bevor** die Oberflaeche aufgebaut war; ein Test konnte deshalb
// nicht unterscheiden, ob der Start durchgelaufen ist oder nicht.

/**
 * Was der Chat dem Wirt melden darf.
 *
 * **Warum das eine Funktion und keine Konstante ist.** Der Chat braucht den Uebersetzer der
 * **aktuellen** Sprache. Der aendert sich, wenn der Nutzer die Sprache wechselt — eine einmal
 * gebaute Konstante traege die Sprache des ersten Bildes.
 *
 * **Was hier NICHT mehr steht: die Orte der Leiste.** Der Chat-Aufbau ist aus diesem Prototyp
 * herausgenommen und einem anderen Agenten uebergeben (siehe chat-order.ts und den Befehl order). `chatSideGroups`
 * und die Leiste sind mit ihm gegangen; wer sie braucht, findet die Absicht im Auftrag beschrieben.
 * Was bleibt, ist die **Schnittstelle**: `onOpenUniverse`, der Uebersetzer und die Sprache.
 */
function chatCallbacks(): Parameters<typeof mountChat>[1] {
  return {
    onOpenUniverse: () => setMode('os'),
    tr,
    locale: locales.locale,
  }
}

/**
 * Der **Winkelanzeiger** in der Ecke — und zugleich das **Drehwerkzeug**.
 *
 * **Die Knoten werden EINMAL gebaut und danach nur noch verschoben.** Ein erster Anlauf setzte alle
 * 500 ms den kompletten `innerHTML` — das erzeugt jedes Mal neue SVG-Knoten, wirft die alten weg und
 * laesst den Browser Layout und Stil neu berechnen. Der Betreiber hat es gemerkt („diese achsen
 * anzeige ist cool gemacht, nur das es lagt"). Es lagte, weil es **DOM-Arbeit** war, nicht weil
 * WebGL langsam waere.
 *
 * Ein SVG mit stabilen Knoten, deren `x1/y1/x2/y2` sich aendern, kostet fast nichts.
 *
 * **Greifbar, nicht nur Anzeige.** Der Betreiber: „ich möchte also auch diese achse dinger nutzen
 * können um rotation bewegung zu machen" und „fehlt unten beim achsen noch eine rotation Kugel".
 * Deshalb hat jede Achse drei Knoten: eine unsichtbare, **dicke** Trefferlinie, den sichtbaren
 * Strich und den Endpunkt, an dem man zieht.
 *
 * Ziehen am Endpunkt dreht die **Welt** um die **beiden anderen** Achsen — so wie in einem
 * CAD-Programm, wo ein Zug am Achsenkreuz die Ansicht kippt. Unten sitzt der **Ring** fuer die freie
 * Drehung in der Bildebene.
 */
const AXES: readonly (readonly [string, string, string])[] = [
  ['x', 'ax-x', 'tx'],
  ['y', 'ax-y', 'ty'],
  ['z', 'ax-z', 'tz'],
]

const AXIS_ORIGIN = { x: 34, y: 40 }
const AXIS_LENGTH = 34
/** Der Ring unten: freie Drehung in der Bildebene. */
const SPIN_BAND = { cx: AXIS_ORIGIN.x, cy: 92, r: 8 }

/**
 * Die drei Einheitsachsen — nur die **Richtung**, nicht die Achse.
 *
 * Sie werden zyklisch durchlaufen: zu einer Achse gehoeren die beiden **anderen**. Genau das macht
 * ein Achsenkreuz greifbar: ein Zug am x-Endpunkt kippt um y und z, nicht um x.
 */
const EINHEIT: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

interface AxisNode {
  readonly line: SVGLineElement
  readonly hit: SVGLineElement
  readonly knob: SVGCircleElement
  readonly text: SVGTextElement
  readonly axis: readonly [number, number, number]
}

const axisNodes: AxisNode[] = []

function buildAxes(): void {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 120 120')
  svg.setAttribute('aria-label', tr('panel.ruler'))

  EINHEIT.forEach((axis, index) => {
    const spec = AXES[index]
    if (!spec) return
    // Reihenfolge im DOM = Zeichenreihenfolge: die unsichtbare Trefferlinie liegt unten, danach der
    // sichtbare Strich, zuletzt der Endpunkt.
    const hit = document.createElementNS(NS, 'line')
    hit.setAttribute('class', 'ax-hit')
    const line = document.createElementNS(NS, 'line')
    line.setAttribute('class', `ax ${spec[1]}`)
    // **`createElementNS`, nicht `createElement`.** Ein `<circle>` aus `createElement` ist ein
    // HTMLUnknownElement: es sieht aus wie ein Kreis, hat aber kein `cx`, kein `cy` und kein `r`.
    // Der Browser zeichnet es nicht, und `updateAxes` schreibt in Attribute, die es nicht gibt —
    // der Fehler faellt erst auf, wenn der Kreis fehlt.
    const knob = document.createElementNS(NS, 'circle')
    knob.setAttribute('class', `knob kn-${spec[0]}`)
    knob.setAttribute('r', '5')
    const text = document.createElementNS(NS, 'text')
    text.setAttribute('class', spec[2])
    text.textContent = spec[0]
    svg.append(hit, line, knob, text)
    axisNodes.push({ line, hit, knob, text, axis })

    // Der Griff: ein Zug am Endpunkt dreht die Welt um die **beiden anderen** Achsen. Fuer die Achse
    // x sind das y (waagerechter Zug) und z (senkrechter Zug) — bei y und z zyklisch weiter.
    const second = EINHEIT[(index + 1) % 3] ?? EINHEIT[1]
    const third = EINHEIT[(index + 2) % 3] ?? EINHEIT[2]
    grab(hit, knob, (dx, dy) => {
      const speed = axisSpinSpeed()
      camera = spinWorld(camera, second, dx * speed)
      camera = spinWorld(camera, third, -dy * speed)
      afterCameraChange()
    })
  })

  // Der **Drehring**. Ohne ihn bliebe die freie Drehung beim Ziehen auf leerem Raum — das gibt es
  // zwar (siehe Canvas), aber hier ist der Ort, an dem man es sucht.
  const band = document.createElementNS(NS, 'circle')
  band.setAttribute('class', 'spin-band')
  band.setAttribute('cx', String(SPIN_BAND.cx))
  band.setAttribute('cy', String(SPIN_BAND.cy))
  band.setAttribute('r', String(SPIN_BAND.r))
  const bandHit = document.createElementNS(NS, 'circle')
  bandHit.setAttribute('class', 'spin-hit')
  bandHit.setAttribute('cx', String(SPIN_BAND.cx))
  bandHit.setAttribute('cy', String(SPIN_BAND.cy))
  bandHit.setAttribute('r', String(SPIN_BAND.r + 8))
  svg.append(band, bandHit)

  const cap = document.createElementNS(NS, 'text')
  cap.setAttribute('class', 'cap')
  cap.setAttribute('x', '6')
  cap.setAttribute('y', '112')
  cap.textContent = tr('axes.caption')
  svg.appendChild(cap)

  axesLayer.replaceChildren(svg)

  // Der **Ring** unten: freie Drehung in der Bildebene.
  //
  // Er dreht um **Bildschirmachsen**, nicht um Weltachsen. Das ist der Unterschied zur freien
  // Drehung auf leerem Raum: dort ist es dieselbe Bewegung, hier ist es ein Griff — und ein Griff
  // soll das tun, was seine Form verspricht. Ein Ring dreht um die Achse, die aus dem Bild zeigt.
  grab(bandHit, bandHit, (dx, dy) => {
    const speed = rotateSpeed()
    // Die Bildschirmachsen in Weltkoordinaten: rechts und oben der **aktuellen** Drehlage. Ohne sie
    // drehte der Ring bei gekippter Ansicht in eine Richtung, die man nicht erwartet.
    const q = new Quaternion(...camera.orientation)
    const rechts = new Vector3(1, 0, 0).applyQuaternion(q).normalize()
    const oben = new Vector3(0, 1, 0).applyQuaternion(q).normalize()
    const spiegel = new Vector3(0, 0, 1).applyQuaternion(q)
    // Das Vorzeichen haengt davon ab, ob man von vorne oder von hinten auf die Bildebene schaut.
    // Sonst dreht der Ring gegen die Hand, sobald man die Welt umgedreht hat.
    const vorzeichen = spiegel.z >= 0 ? 1 : -1
    camera = spinWorld(camera, [rechts.x, rechts.y, rechts.z], dy * speed * vorzeichen)
    camera = spinWorld(camera, [oben.x, oben.y, oben.z], -dx * speed * vorzeichen)
    afterCameraChange()
  })
}

/** Verschiebt die Achsenstriche — ohne neue Knoten, ohne Layout-Neuberechnung. */
function updateAxes(): void {
  const q = new Quaternion(...camera.orientation)
  const { x: ox, y: oy } = AXIS_ORIGIN
  const length = AXIS_LENGTH
  for (const node of axisNodes) {
    const v = new Vector3(node.axis[0], node.axis[1], node.axis[2]).applyQuaternion(q)
    const ex = ox + v.x * length
    const ey = oy - v.y * length
    for (const target of [node.line, node.hit]) {
      target.setAttribute('x1', String(ox))
      target.setAttribute('y1', String(oy))
      target.setAttribute('x2', ex.toFixed(1))
      target.setAttribute('y2', ey.toFixed(1))
    }
    node.knob.setAttribute('cx', ex.toFixed(1))
    node.knob.setAttribute('cy', ey.toFixed(1))
    node.text.setAttribute('x', (ox + v.x * (length + 11)).toFixed(1))
    node.text.setAttribute('y', (oy - v.y * (length + 11) + 3).toFixed(1))
  }
}

/**
 * Ziehen an einem Griff: `move` bekommt die Pixel seit dem Anfassen.
 *
 * Die Zeigerlage wird **auf dem Element gefangen** (`setPointerCapture`), damit der Zug nicht
 * abbricht, sobald der Zeiger den schmalen Griff verlaesst.
 */
function grab(target: SVGElement, hover: SVGElement, move: (dx: number, dy: number) => void): void {
  let last: { x: number; y: number } | null = null
  target.addEventListener('pointerdown', (event) => {
    event.stopPropagation()
    last = { x: event.clientX, y: event.clientY }
    target.setPointerCapture(event.pointerId)
    hover.classList.add('on')
  })
  target.addEventListener('pointermove', (event) => {
    if (!last) return
    move(event.clientX - last.x, event.clientY - last.y)
    last = { x: event.clientX, y: event.clientY }
  })
  for (const type of ['pointerup', 'pointercancel'] as const) {
    target.addEventListener(type, () => {
      last = null
      hover.classList.remove('on')
    })
  }
}

buildAxes()

// ── Die Dynamic Island ───────────────────────────────────────────────────────────────────
//
// **Die einzige Navigation dieser Oberflaeche.** Aufbau und Maße stammen aus der Vorlage des
// Betreibers (`H:/Projekt/Programmieren/Prometheus/sketches/002-g-universe/index.html`):
// eingeklappt `.mini` (40 px hoch), auf Klick `.max` mit `.full` (560 × 280, Radius 16) — `.head`,
// `.ch`, `.grp`, Eintraege mit Sigil und Marke.
//
// **Warum sie die Leiste ersetzt.** Der Betreiber: „warum auch immer diese bar seitlich existiert
// verstehe ich auch nicht, habe doch gesagt ein dynamic illand". Eine Leiste ist eine zweite
// Navigation neben der ersten — und zwei Wege zum selben Ziel sind einer zu viel.

interface IslandItem {
  /**
   * **Das Zeichen des Eintrags — ein Name, kein Schriftzeichen.**
   *
   * Hier stand ein `sigil: string` mit `'#'`, `'⌥'`, `'⚙'`, `'◉'`, `'▤'`, `'⟲'`. Der Betreiber:
   * *„emoji sieht schon scheisse aus und umprofessionell"*.
   *
   * Er hat recht, und der Grund ist nicht Geschmack: ein Schriftzeichen ist eine **Schriftart**.
   * Wie `▤` aussieht, entscheidet der Rechner des Betrachters; fehlt es in seiner Schrift, steht dort
   * ein **Platzhalterkasten**. Und Bedeutung trägt es auch keine: `#` heisst „Nummer", nicht „Ort".
   *
   * Jetzt steht hier der **Name eines gezeichneten Zeichens** (`@prometheus-harness/icons`). Der Typ
   * ist eine Aufzählung, also fällt ein Tippfehler beim Typlauf auf und nicht erst im Bild.
   */
  readonly icon: IconName
  /**
   * **Ein Schlüssel, kein Satz.**
   *
   * Vorher stand hier `label: 'Sonnensystem'` — ein deutscher Satz im Code. Mit zwei Sprachen waere
   * das ein zweiter Satz daneben, und beim dritten faellt es auseinander. Jetzt steht hier, **was**
   * der Eintrag ist; wie er klingt, entscheidet das Sprachpaket.
   *
   * **Zwei Arten von Schlüsseln, und das ist Absicht.** Ein Eintrag, der auf ein **Objekt** zeigt,
   * braucht `query`: gesucht wird nach dem **Namen des Objekts**, nicht nach der Beschriftung. Sonst
   * fände „Erde" im englischen Paket („Earth") nichts mehr — und ein Eintrag, der nichts findet, ist
   * schlimmer als kein Eintrag.
   */
  readonly labelKey: string
  readonly query?: string
  readonly badgeKey?: string
  readonly action: 'chat' | 'os' | 'reset' | 'focus' | 'settings'
  /**
   * **Nur in dieser Ansicht zeigen — `undefined` heisst „immer".**
   *
   * Betreiber, mit einem Bild der Gruppe „Ansichten" im Universe: „**kannst du den universe in dynamic
   * illand entfernen wenn man schon in universe befindet ;D ist bischen waste und unötig**".
   *
   * Ein Eintrag, der einen **dorthin** bringt, wo man **schon ist**, ist kein Weg — er ist eine
   * Sackgasse mit Beschriftung. Und er kostet Platz in einer Leiste, deren ganzer Zweck Kürze ist.
   *
   * **Warum die Bedingung am Eintrag steht und nicht im Aufbau.** So bleibt die Liste eine **Daten**
   * liste: man liest sie von oben nach unten und sieht an jedem Eintrag, wann er erscheint. Eine
   * Wenn-Abfrage im Aufbau wäre eine zweite Stelle, an der man nachsehen muss — und beim nächsten
   * Eintrag würde sie vergessen.
   */
  readonly onlyIn?: 'chat' | 'os'
}

/**
 * Die Einträge der Insel.
 *
 * **Alle zeigen auf echte Orte oder echte Ansichten dieser Welt.** Ein erster Anlauf hatte hier die
 * Beispielnamen aus der Skizze übernommen (`btc-dqn-experiment`, `session-alpha`) — die gehören zu
 * einem anderen Vorhaben, und ein Eintrag, der nichts findet, ist schlimmer als kein Eintrag. Wer
 * hier etwas hinzufügt, prüft es mit `find <name>` im Terminal.
 *
 * **Die Einstellungen stehen hier, nicht in einem Zahnrad irgendwo.** Der Betreiber hat sich über
 * Drehgeschwindigkeit und Zoom beschwert — also muss der Weg dorthin kurz sein.
 */
const ISLAND_GROUPS: readonly {
  readonly titleKey: string
  readonly icon: IconName
  readonly items: readonly IslandItem[]
}[] = [
  {
    titleKey: 'island.group.places',
    icon: 'place',
    items: [
      { icon: 'solar-system', labelKey: 'island.item.solar', query: 'Sonnensystem', badgeKey: 'island.badge.live', action: 'focus' },
      { icon: 'stack', labelKey: 'island.item.stack', query: 'projekt-stack', action: 'focus' },
      { icon: 'prometheus', labelKey: 'island.item.prometheus', query: 'prometheus', action: 'focus' },
      { icon: 'constellation', labelKey: 'island.item.overview', query: 'kosmischer Überblick', action: 'focus' },
    ],
  },
  {
    titleKey: 'island.group.objects',
    icon: 'object',
    items: [
      { icon: 'star', labelKey: 'island.item.sun', query: 'Sonne', badgeKey: 'island.badge.star', action: 'focus' },
      { icon: 'planet', labelKey: 'island.item.earth', query: 'Erde', badgeKey: 'island.badge.planet', action: 'focus' },
      { icon: 'code-file', labelKey: 'island.item.appcss', query: 'app.css', action: 'focus' },
    ],
  },
  {
    titleKey: 'island.group.settings',
    icon: 'gear',
    items: [{ icon: 'settings', labelKey: 'island.action.settings', action: 'settings' }],
  },
  {
    titleKey: 'island.group.views',
    icon: 'layers',
    items: [
      /*
       * **„Universe" erscheint nur im Chat — und „Chat" nur im Universe.**
       *
       * Betreiber: „**kannst du den universe in dynamic illand entfernen wenn man schon in universe
       * befindet**". Beide Einträge sind **Wege**, keine Zustände: wer im Universe steht, braucht den
       * Weg dorthin nicht, und wer im Chat steht, braucht den Weg in den Chat nicht.
       *
       * **Was bleibt:** der jeweils **andere** Weg und der Zurücksetzen-Eintrag. Die Gruppe schrumpft
       * damit nie auf null — es gibt immer genau einen Weg hinaus.
       */
      { icon: 'orbit', labelKey: 'island.action.world', action: 'os', onlyIn: 'chat' },
      { icon: 'chat', labelKey: 'island.action.chat', action: 'chat', onlyIn: 'os' },
      { icon: 'reset-view', labelKey: 'island.action.reset', action: 'reset' },
    ],
  },
]

const isl = must<HTMLElement>('#isl')
const miniTxt = must<HTMLElement>('#miniTxt')
let islandOpen = false

function openIsland(): void {
  if (islandOpen) return
  islandOpen = true
  isl.classList.add('max')
  buildIslandFull()
}

function closeIsland(): void {
  if (!islandOpen) return
  islandOpen = false
  isl.classList.remove('max')
  isl.querySelector('.full')?.remove()
}

/**
 * **Ist die Panel-Liste in der Insel aufgeklappt?**
 *
 * Sie startet **eingeklappt**: zwölf Zeilen machen aus der Übersicht eine Liste. Der Zustand lebt nur
 * in dieser Sitzung — er ist eine Sicht, keine Einstellung, und gehört deshalb **nicht** in die
 * Ablage (dort steht, welche Panels offen sind, nicht wie die Insel aussieht).
 */
let panelsOffen = false

function buildIslandFull(): void {
  isl.querySelector('.full')?.remove()
  const full = document.createElement('div')
  full.className = 'full'

  /*
   * **Wohin „Chat" fuehrt, gilt fuer den ganzen Aufbau** — und wird deshalb **hier** gelesen, nicht
   * in der Schleife: die Herkunft aendert sich waehrend eines Aufbaus nicht, und ein zweiter Blick
   * je Eintrag waere eine zweite Gelegenheit, etwas anderes zu lesen.
   */
  const chatAdresse = chatZiel()

  const head = document.createElement('div')
  head.className = 'head'
  // Die Kopfzeile ist **kein** Modellname und keine Modellbeschreibung. In der Skizze des Betreibers
  // stand hier ein Beispielname aus einem anderen Vorhaben; er hat ihn ausdruecklich entfernen
  // lassen („sieht falsch aus und hat damit nichts zu tun mit unserem Agent Harness web"). Was
  // bleibt, ist die Angabe, **wo** man ist: der Raum.
  head.innerHTML = `<b>${iconMarkup('prometheus', 'marke')} ${tr('island.open')}</b><span class="proj">${describeRoom(room)}</span><span class="spacer"></span>`
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'x'
  close.innerHTML = iconMarkup('close')
  close.setAttribute('aria-label', tr('island.close'))
  close.addEventListener('click', (event) => {
    event.stopPropagation()
    closeIsland()
  })
  head.appendChild(close)
  full.appendChild(head)

  const ch = document.createElement('div')
  ch.className = 'ch'
  for (const group of ISLAND_GROUPS) {
    const title = document.createElement('div')
    title.className = 'grp'
    title.innerHTML = iconMarkup(group.icon, 'grp-zeichen') + `<span>${tr(group.titleKey)}</span>`
    /*
     * **Und die Einträge, die es in dieser Ansicht nicht gibt, werden übersprungen.**
     *
     * Betreiber: „**kannst du den universe in dynamic illand entfernen wenn man schon in universe
     * befindet**". Die Bedingung steht am **Eintrag** (`onlyIn`), die Prüfung hier — eine Stelle, an der
     * man sie sucht, statt einer Abfrage je Eintrag.
     *
     * **Und die Gruppe wird nicht leer.** Der jeweils andere Weg und der Zurücksetzen-Eintrag haben kein
     * `onlyIn`, also bleibt immer mindestens einer stehen. Eine Überschrift ohne Einträge wäre ein
     * zweiter Fehler, den man erst im Bild sieht.
     */
    const sichtbar = group.items.filter((item) => item.onlyIn === undefined || item.onlyIn === mode)
    if (sichtbar.length === 0) continue
    ch.appendChild(title)
    for (const item of sichtbar) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'isitem'
      // **Ein stabiler Griff fuer jeden Eintrag.** Er traegt die **Handlung**, nicht die
      // Beschriftung: eine Beschriftung wechselt mit der Sprache, und ein Test, der nach ihr sucht,
      // findet den Eintrag nach `lang de` nicht mehr. `data-action` bleibt.
      button.dataset.action = item.action
      if (item.query !== undefined) button.dataset.query = item.query
      /*
       * **Der Eintrag „Chat" heisst, wohin er fuehrt.**
       *
       * Seit dem 14.10.2026 gibt es zwei Dinge mit dem Namen „Chat": den **Harness-Chat** und den
       * Platzhalter dieses Prototyps. Der Eintrag fuehrt über dieselbe Stelle wie die Marke
       * (`geheZumChat`) — also muss er es auch **sagen**: heisst er „Prometheus-Chat", geht es
       * dorthin; heisst er „Chat", bleibt man in dieser Ansicht.
       *
       * **Warum die Beschriftung hier gewaehlt wird und nicht in den Daten.** Die Daten
       * (`ISLAND_GROUPS`) sind eine feste Liste; welcher Chat gemeint ist, weiss nur die Herkunft
       * (`chatAdresse`, aus `location.origin`). Eine `labelKey`-Angabe in den Daten waere an dieser
       * Stelle eine zweite Wahrheit.
       */
      const labelKey = item.action === 'chat' ? inselChatTextKey(chatAdresse) : item.labelKey
      const label = tr(labelKey)
      if (item.action === 'chat' && chatAdresse !== undefined) {
        // Wie an der Marke: wer mit der Maus zeigt, sieht **wohin**.
        button.title = `${label} — ${chatAdresse}`
      }
      button.innerHTML =
        `<span class="ih">${iconMarkup(item.icon)}</span><span class="il">${label}</span>` +
        (item.badgeKey ? `<span class="ib">${tr(item.badgeKey)}</span>` : '')
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        choose(item, label)
      })
      ch.appendChild(button)
    }
  }
  full.appendChild(ch)

  /*
   * **Und die Panels als Gruppe IN der Insel.**
   *
   * Der Betreiber: „**sollten wir das nicht in dynamic illand implementieren als ein punkt oder Button
   * wie dynamic illand die man drücken könnte**". Er hat recht, und der Grund ist die Insel selbst:
   * die Dynamic Island ist laut Entwurf die **einzige** Navigation („Eine Seitenleiste gibt es
   * nicht"). Eine Knopfleiste unten links war ein **zweiter** Navigationsweg für dieselbe Sache —
   * zwölf Knöpfe, die quer über den Bildschirm laufen.
   *
   * Jetzt steht dort eine Gruppe „Panels" mit einem Eintrag je Panel. Ein Klick **holt** es (in seine
   * Zone) oder **steckt es ab** — der Zustand steht als Marke am Eintrag („offen" / „abgesteckt").
   *
   * **Warum die Liste aus dem Dock kommt und nicht aus einer eigenen.** `dock.getLayout()` ist die
   * einzige Wahrheit über Zonen — eine zweite Liste liefe auseinander, und dann zeigt die Insel etwas
   * anderes als das Dock tut.
   */
  const anordnung = dock.getLayout()
  /*
   * **Eine Zeile statt zwölf — die Liste kommt auf Klick.**
   *
   * Der Betreiber: „**ist das möglich dieses irgendwie zu veringern als eine art dropdown liste
   * sozusagen?**" Zwölf Zeilen in der Insel machen aus der Übersicht eine Liste. Jetzt steht dort
   * **eine** Zeile „▸ Panels · 2 von 12 offen", und erst ein Klick zeigt die Einträge.
   *
   * **Warum keine native `<details>`.** Sie wäre kürzer, bringt aber ihr eigenes Aussehen mit. Ein
   * `hidden` am Container tut dasselbe mit den Mitteln, die hier schon stehen — und `hidden` heisst
   * wirklich „nicht da", nicht „unauffällig".
   */
  const anzahlOffen = allPanels().filter((s) => {
    const z = anordnung.panels.find((p) => p.id === s.id)
    return z !== undefined && z.zone !== 'closed'
  }).length

  const panelKopf = document.createElement('button')
  panelKopf.type = 'button'
  panelKopf.className = 'grp grp-knopf'
  panelKopf.dataset.panelGroup = 'toggle'
  panelKopf.setAttribute('aria-expanded', panelsOffen ? 'true' : 'false')
  panelKopf.innerHTML =
    `<span class="ih">${iconMarkup(panelsOffen ? 'chevron-down' : 'chevron-right')}</span>` +
    `<span class="il">${tr('island.group.panels')}</span>` +
    `<span class="ib">${tr('island.panels.count', { offen: String(anzahlOffen), gesamt: String(allPanels().length) })}</span>`
  panelKopf.addEventListener('click', (event) => {
    event.stopPropagation()
    panelsOffen = !panelsOffen
    buildIslandFull()
  })
  ch.appendChild(panelKopf)

  const panelListe = document.createElement('div')
  panelListe.className = 'grp-liste'
  panelListe.hidden = !panelsOffen

  /*
   * **Und die Ansichts-Leiste als Eintrag — sie ist ein Objekt, das man verlieren kann.**
   *
   * Wer sie mit „✕" weggelegt hat, braucht einen Weg zurück. Er steht **vor** der Panelliste, weil die
   * Leiste zur Ansicht gehört und die Panels zu den Werkzeugen: das Nähere zuerst.
   */
  const sichtEintrag = document.createElement('button')
  sichtEintrag.type = 'button'
  sichtEintrag.className = 'isitem'
  sichtEintrag.dataset.viewToggle = '1'
  const sichtMarke = document.createElement('span')
  sichtMarke.className = `pkt ${viewControls.istOffen ? 'an' : 'aus'}`
  sichtMarke.setAttribute('aria-hidden', 'true')
  const sichtText = document.createElement('span')
  sichtText.className = 'il'
  sichtText.textContent = tr('island.panel.viewbar')
  sichtEintrag.append(sichtMarke, sichtText)
  sichtEintrag.addEventListener('click', (event) => {
    event.stopPropagation()
    if (viewControls.istOffen) viewControls.schliessen()
    else viewControls.oeffnen()
    buildIslandFull()
  })
  /*
   * **Die Liste ist gruppiert — nicht alphabetisch, nicht nach Zufall.**
   *
   * Der Betreiber hat die Liste als HTML geschickt: vierzehn Zeilen, darunter zweimal „Zustand" und
   * zweimal „Einstellungen". Das war kein Zufall, sondern ein Namensdoppler (die Systemprüfung hieß
   * wie das Zustands-Panel, der Dialog wie das Einstellungs-Panel). Jetzt gibt es **einen**
   * Einstellungs-Eintrag (`panel.settings`), die Prüfung heißt `panel.health`, das Gerät
   * `panel.device` — und die Reihenfolge sagt, wozu ein Panel gehört: **Ansicht**, **System**,
   * **Werkzeuge**. Was kein Panel mehr ist, steht unter „Weitere".
   */
  const specs = allPanels()
  const untertitel = (text: string): HTMLElement => {
    const el = document.createElement('div')
    el.className = 'grp-unter'
    el.textContent = text
    return el
  }

  const eintragen = (spec: PanelSpec): void => {
    const zustand = anordnung.panels.find((p) => p.id === spec.id)
    const offen = zustand !== undefined && zustand.zone !== 'closed'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'isitem'
    button.dataset.panelToggle = spec.id
    /* **Der Zustand ist eine Marke, kein Zeichen.** „▣/▢" liest niemand; ein Punkt mit Text schon. */
    const marke = document.createElement('span')
    marke.className = `pkt ${offen ? 'an' : 'aus'}`
    marke.setAttribute('aria-hidden', 'true')
    const text = document.createElement('span')
    text.className = 'il'
    text.textContent = spec.title
    button.append(marke, text)
    /*
     * **„abgesteckt" stand vierzehnmal in derselben Liste.**
     *
     * Der Zustand ist schon der Punkt links (`an`/`aus`), und die Gruppenzeile nennt die Zahl der
     * offenen Panels. Eine Marke an **jeder** geschlossenen Zeile war keine Information, sondern
     * Rauschen — sie hat die zwei offenen Zeilen genauso aussehen lassen wie die zwölf anderen. Die
     * Marke bleibt deshalb nur, wo sie etwas sagt: bei einem **offenen** Panel. Wer eine geschlossene
     * Zeile ansieht, findet den Zustand im `title` und im Punkt.
     */
    button.title = offen ? tr('island.panel.open') : tr('island.panel.closed')
    if (offen) {
      const badge = document.createElement('span')
      badge.className = 'ib'
      badge.textContent = tr('island.panel.open')
      button.appendChild(badge)
    }
    button.setAttribute('aria-pressed', offen ? 'true' : 'false')
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const s = dock.getLayout().panels.find((p) => p.id === spec.id)
      const istOffen = s !== undefined && s.zone !== 'closed'
      /*
       * **Abstecken heisst zurück in die Zone, in der es zu Hause ist** — nicht in die Zone, in der es
       * gerade steht. Wer ein Panel nach links gezogen und dann abgesteckt hat, will es beim nächsten
       * Holen dort wiederfinden, wo es laut Entwurf hingehört.
       *
       * **Und die Heimatzone muss hier stehen, nicht im Dock geraten werden.** Alle Angebote tragen
       * inzwischen `zone: 'closed'` (die Voreinstellung ist „abgesteckt"), also kann das Dock die
       * Zielzone nicht aus dem Angebot lesen — es hätte jedes Panel rechts abgelegt. Die Suchleiste
       * gehört nach links, das Terminal nach unten, und das steht **hier**.
       */
      const heimat: Record<string, 'left' | 'right' | 'bottom'> = {
        search: 'left',
        'plugin:debug-terminal': 'bottom',
        /*
         * **Die Rangliste gehört nach unten.**
         *
         * Sie trägt **Sätze** (Begründungen, Preise, Hinweise), und die rechte Spalte ist 280 px
         * breit — dort bricht jede Zeile dreimal um. Unten liegt sie über die **ganze** Breite des
         * Fensters. Ohne diesen Eintrag fiele sie auf den Rückfall (`'right'`) und wäre unleserlich,
         * ohne daß irgendetwas rot würde.
         */
        'plugin:ai-rangliste': 'bottom',
      }
      dock.openPanel(spec.id, istOffen ? 'closed' : (heimat[spec.id] ?? 'right'))
      buildIslandFull()
    })
    panelListe.appendChild(button)
  }

  const gruppen: readonly { readonly titel: string; readonly ids: readonly string[] }[] = [
    {
      titel: tr('island.panels.group.view'),
      ids: ['view', 'search', 'ruler', 'status', 'room', 'found'],
    },
    {
      titel: tr('island.panels.group.system'),
      ids: ['plugin:ui-settings', 'plugin:device-info'],
    },
    {
      titel: tr('island.panels.group.tools'),
      ids: ['plugin:debug-terminal', 'plugin:ai-rangliste', 'plugin:chat-order', 'plugin:health-check', 'plugin:token'],
    },
  ]
  /*
   * **Zwei Zeilen, die nicht in die Liste gehören.**
   *
   * `open-settings` und `open-language` öffnen nur den Dialog, der schon im Insel-Menü steht — als
   * Panelzeile waren sie ein zweiter Weg zu derselben Sache, und „Einstellungen" stand dadurch
   * doppelt in der Liste. Das Notiz-Panel ist gar nicht mehr eingehängt (`notizenPlugin` bekommt
   * `{ panel: false }`): es zeigte Titel und Pfad, konnte aber keine Notiz öffnen, ändern oder
   * anlegen. Der Befehl `notizen` bleibt und listet im Terminal.
   */
  const versteckt = new Set(['open-settings', 'open-language'])
  const bekannt = new Set(gruppen.flatMap((gruppe) => gruppe.ids))
  for (const gruppe of gruppen) {
    const vorhanden = gruppe.ids.filter(
      (id) => id === 'view' || specs.some((spec) => spec.id === id),
    )
    if (vorhanden.length === 0) continue
    panelListe.appendChild(untertitel(gruppe.titel))
    for (const id of vorhanden) {
      if (id === 'view') {
        panelListe.appendChild(sichtEintrag)
        continue
      }
      const spec = specs.find((kandidat) => kandidat.id === id)
      if (spec !== undefined) eintragen(spec)
    }
  }
  const weitere = specs.filter((spec) => !bekannt.has(spec.id) && !versteckt.has(spec.id))
  if (weitere.length > 0) {
    panelListe.appendChild(untertitel(tr('island.panels.group.more')))
    for (const spec of weitere) eintragen(spec)
  }
  ch.appendChild(panelListe)

  /*
   * **Die Zahl im Kopf zählt, was in der Liste steht — nicht, was das Dock kennt.**
   *
   * `open-settings` und `open-language` sind absichtlich nicht in der Liste; sie zählten aber im
   * Kopf mit („0 von 13 offen" bei zwölf Zeilen). Gezählt wird deshalb nach dem Aufbau: die
   * Knöpfe der Liste, und von ihnen die mit einem grünen Punkt.
   */
  const sichtbare = [...panelListe.querySelectorAll<HTMLButtonElement>('[data-panel-toggle]')]
  const offenSichtbar = sichtbare.filter((eintrag) => eintrag.querySelector('.pkt.an') !== null).length
  const kopfMarke = panelKopf.querySelector('.ib')
  if (kopfMarke !== null) {
    kopfMarke.textContent = tr('island.panels.count', {
      offen: String(offenSichtbar),
      gesamt: String(sichtbare.length),
    })
  }

  isl.appendChild(full)
}

/**
 * Ein Eintrag der Insel gewaehlt.
 *
 * **Gesucht wird nach dem Objektnamen, nicht nach der Beschriftung** (`item.query`). Sonst fände
 * „Erde" im englischen Paket („Earth") nichts mehr — und die Beschriftung einer Ansicht ist ohnehin
 * kein Objektname. Das ist der Preis dafür, dass die Oberflaeche uebersetzbar ist: die Daten
 * behalten ihre Namen, nur die Anzeige wechselt.
 */
function choose(item: IslandItem, label: string): void {
  /*
   * **Der Wechsel geht durch `wechsleAnsicht` — gemerkt und umgeblendet.**
   *
   * Hier stand `setMode('chat')` / `setMode('os')`. Das blendete um, merkte aber nichts: die
   * Einstellung `interface.mode` blieb auf dem alten Wert, und **sie gewinnt beim naechsten Laden**
   * gegen den Raum-Speicher. Wer ueber die Insel in den Chat wechselte und die Seite neu lud, stand
   * wieder im Universum. Siehe `view-switch.ts`.
   */
  if (item.action === 'chat') geheZumChat()
  else if (item.action === 'os') wechsleAnsicht(wechsel, 'os')
  else if (item.action === 'settings') {
    // **Der Einstellungsbildschirm — kein Panel.** Der Betreiber: „settings funktioniert nicht per
    // dynamic illand bzw sollte es den settings öffnen vom Harness die man auch in chat hat".
    // Vorher rief dieser Zweig `dock.openPanel(...)` und legte damit ein schmales Panel in eine
    // Dock-Zone. Im Harness sind die Einstellungen eine **eigene Fläche über dem Chat** — mit
    // Navigationsleiste links und dem Abschnitt rechts.
    settingsModal.open()
  } else if (item.action === 'reset') {
    camera = startCamera()
    // Auch dieser Weg **wechselt die Ansicht** (aus dem Chat zurueck in die Welt) und geht deshalb
    // durch dieselbe Stelle — sonst gaebe es wieder einen Wechsel, der den Reload nicht ueberlebt.
    wechsleAnsicht(wechsel, 'os')
  } else {
    // Ein Kanal ist ein **Ort in der Welt**: die Kamera faehrt dorthin (Fix Fokus).
    const target = search(universe, item.query ?? label)[0]
    wechsleAnsicht(wechsel, 'os')
    if (target) {
      camera = focusOn(camera, target.world, target.body.radius)
      save()
    }
  }
  // Die Wahl steht in der eingeklappten Pille — wie in der Vorlage (`mini-txt`).
  //
  // **Kein Modellname.** In der Skizze stand dort `ornith-9b · lokal` — ein Beispielname aus einem
  // anderen Vorhaben. In der Pille steht deshalb nur, **wo man ist**: der gewählte Kanal.
  miniTxt.textContent = label
  setTimeout(closeIsland, 150)
}

must<HTMLElement>('#islMini').addEventListener('click', openIsland)
must<HTMLElement>('#islMini').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    openIsland()
  }
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeIsland()
})
document.addEventListener('click', (event) => {
  if (islandOpen && !isl.contains(event.target as Node)) closeIsland()
})
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return
  if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    if (islandOpen) closeIsland()
    else openIsland()
  }
})

/*
 * Es gibt hier bewusst **keine** Funktion `modelName()`.
 *
 * In der Skizze des Betreibers stand in der Insel `ornith-9b · lokal` und im Chat-Kopf `ornith-9b`.
 * Das ist ein Beispielname aus einem anderen Vorhaben — er hat mit diesem Harness nichts zu tun.
 * Seine Entfernung war eine ausdrueckliche Ansage: „thema Ornith Beschreibung in dynamic illand
 * sollten wir weg tun, sieht falsch aus und hat damit nichts zu tun mit unserem Agent Harness web."
 *
 * Wenn hier spaeter ein **echter** Modellname steht, kommt er aus der Harness-Antwort — nicht aus
 * einer Konstanten. Bis dahin steht in der Pille nur, wo man ist.
 */

// ── Modus ────────────────────────────────────────────────────────────────────────────────
//
// **Der Chat wird nicht hier gebaut.** Sein Aufbau gehoert in den Startabschnitt, weil er die
// **Sprache** liest — und die steht erst fest, wenn die Sprachpakete eingetragen sind. Hier bleibt
// nur der Griff, mit dem `main.ts` spaeter Nachrichten anhaengen kann.
let appendMessage: (message: Message) => void = () => {}

function setMode(next: Ansicht): void {
  const mobile = window.innerWidth < MOBILE_BREAKPOINT
  // **Die Welt braucht Platz.** Auf einem schmalen Bildschirm bleibt nur der Chat — das war die
  // Ansage des Betreibers („quasi perspektivisch nur chat"). Die Vorlage und die Welt sind beide
  // gross, aber die Vorlage ist nur ein Hintergrund mit einer Insel; sie darf bleiben.
  mode = mobile && next === 'os' ? 'chat' : next
  screens.chat.classList.toggle('hidden', mode !== 'chat')
  screens.os.classList.toggle('hidden', mode !== 'os')
  screens.web.classList.toggle('hidden', mode !== 'web')
  must<HTMLElement>('#mobileNote').classList.toggle('hidden', !mobile)
  setText('#mobileText', tr('mobile.note'))
  setText('#mobileSwitch', tr('mobile.switch'))
  /*
   * **Und die Insel neu bauen, wenn sie offen ist.**
   *
   * Betreiber: „**kannst du den universe in dynamic illand entfernen wenn man schon in universe
   * befindet**". Diese Ausblendung hängt an `mode` (`onlyIn`) — und `buildIslandFull` läuft **nur beim
   * Öffnen**. Wer die Ansicht **bei offener Insel** umschaltet, sähe weiter den alten Stand: im Universe
   * stünde „Universe", obwohl man dort ist.
   *
   * Gefunden, bevor es im Bild auftauchte: die Filterung liest `mode`, und `setMode` war die einzige
   * Stelle, die ihn ändert, ohne die Insel zu erneuern. **Eine Anzeige, die von einem Zustand abhängt,
   * muss neu gebaut werden, wenn sich der Zustand ändert** — sonst zeigt sie die Vergangenheit.
   */
  if (islandOpen) buildIslandFull()
  save()
}

/**
 * **Die Wirkungen des Ansichtswechsels — einmal, für alle Wege.**
 *
 * Die Marke oben links, die Eintraege der Insel und der Befehl `view` gehen durch `wechsleAnsicht`
 * (`view-switch.ts`). Hier stehen nur die zwei Griffe, die *diese* Huelle dazu beisteuert:
 * `setMode` blendet um und legt den Zustand im Raum-Speicher ab, `settings.set` merkt die
 * ausdrueckliche Wahl — die gewinnt beim naechsten Laden gegen den Speicher.
 *
 * **Was das repariert hat.** Die Insel-Eintraege riefen nur `setMode`. Wer ueber die Insel in den
 * Chat wechselte und die Seite neu lud, stand **wieder im Universum**: die Einstellung sagte weiter
 * `world`. Ein Wechsel, der aussieht, als haette er nicht stattgefunden, ist schlimmer als keiner —
 * deshalb steht die Zusammenfassung jetzt in einer Datei und nicht an drei Stellen.
 */
const wechsel: Wechsel = {
  merke: (ziel) => settings.set('interface.mode', alsEinstellung(ziel)),
  setze: (ziel) => setMode(ziel),
}

/**
 * **Die Vorlage des Betreibers, 1:1** (`apps/web`).
 *
 * Der Betreiber: „anders gesagt ist unsere welt anzeige eine art switch zur chat … und dort wird zb
 * beim DSH structure web vorlage komplett implementiert. also quasi 1:1
 * `C:\Users\Chang\prometheus-harness\apps\web`".
 *
 * **Was hier steht, ist genau das, was dort steht** — und nichts darueber hinaus:
 *
 *   `.stage`      die Flaeche (im Markup `#screen-web`)
 *   `.universe`   der Verlaufshintergrund, `radial-gradient(ellipse at 50% 35%, #0c0a10, #050507 75%)`
 *   `.isl`        die Dynamic Island: eingeklappt eine Pille, aufgeklappt `CHANNELS`
 *
 * **Und jedes Teil davon ist ein Paket.** Die Insel bekommt ihre Belegung von aussen
 * (`groups` — hier aus `ISLAND_GROUPS`, also aus denselben Daten wie die Welt), genau wie in
 * `apps/web` die `groups`-Eigenschaft. Die Belegung ist damit **kein** festes Markup, sondern ein
 * Andockpunkt.
 */
function buildWebIsland(): void {
  islWeb.replaceChildren()
  const full = document.createElement('div')
  full.className = 'full'

  const head = document.createElement('div')
  head.className = 'head'
  head.innerHTML = `<b>${iconMarkup('prometheus', 'marke')} CHANNELS</b><span>${tr('web.project')}: prometheus</span><span class="spacer"></span>`
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'x'
  close.innerHTML = iconMarkup('close')
  close.setAttribute('aria-label', tr('island.close'))
  close.addEventListener('click', (event) => {
    event.stopPropagation()
    closeWebIsland()
  })
  head.appendChild(close)
  full.appendChild(head)

  // Zwei Spalten, wie die Vorlage (`grid-template-columns: 1fr 1fr`), mit Gruppenueberschriften
  // ueber die volle Breite.
  const ch = document.createElement('div')
  ch.className = 'ch'
  for (const group of ISLAND_GROUPS) {
    const title = document.createElement('div')
    title.className = 'grp'
    /*
     * **Auch die Gruppenüberschrift bekommt ein Zeichen.** Sie trug bisher keines — die Glyphen, die
     * dort standen, gehörten zu den Einträgen darunter. Ein Zeichen je Gruppe ist der Unterschied
     * zwischen einer Liste und einer **gegliederten** Liste: man sieht die drei Blöcke, ohne die
     * Wörter zu lesen.
     */
    title.innerHTML = iconMarkup(group.icon, 'grp-zeichen') + `<span>${tr(group.titleKey)}</span>`
    ch.appendChild(title)
    for (const item of group.items) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'item'
      const sigil = document.createElement('span')
      sigil.className = 'sigil'
      sigil.innerHTML = iconMarkup(item.icon)
      button.appendChild(sigil)
      button.append(document.createTextNode(tr(item.labelKey)))
      if (item.badgeKey) {
        const badge = document.createElement('span')
        badge.className = 'badge'
        badge.textContent = tr(item.badgeKey)
        button.appendChild(badge)
      }
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        // **Ein Eintrag schaltet um.** Genau das ist der „Switch zur Chat": die Insel waehlt die
        // Ansicht, und jede Wahl ist ein Ort oder eine Ansicht — nie ein Name, der nichts findet.
        choose(item, tr(item.labelKey))
      })
      ch.appendChild(button)
    }
  }
  full.appendChild(ch)
  islWeb.appendChild(full)
  islWeb.classList.add('max')
}

function closeWebIsland(): void {
  islWeb.classList.remove('max')
  islWeb.replaceChildren(miniPille())
}

/**
 * Die eingeklappte Pille — **Marke**, `PROMETHEUS`, Zustandstext.
 *
 * **Hier stand ein grüner Punkt.** Er war als Betriebslampe gedacht („es läuft"), stand aber direkt
 * vor dem Wort `PROMETHEUS` — und damit als **Marke**. Seit die Marke eine gezeichnete Flamme ist
 * (Kopfzeile oben links), gäbe es zwei verschiedene Marken im selben Bild: die Flamme und einen
 * grünen Punkt. Wer die Pille sieht, soll dieselbe Marke sehen wie in der Kopfzeile.
 *
 * Der Zustand geht davon nicht verloren: er steht als Text daneben (`PROMETHEUS · Einstellungen`),
 * und die Bildrate steht in der Kopfzeile.
 */
function miniPille(): HTMLElement {
  const mini = document.createElement('div')
  mini.className = 'mini'
  mini.setAttribute('role', 'button')
  mini.tabIndex = 0
  mini.setAttribute('aria-expanded', 'false')
  mini.setAttribute('aria-label', tr('island.open'))
  const marke = document.createElement('span')
  marke.className = 'marke'
  marke.innerHTML = iconMarkup('prometheus')
  const name = document.createElement('b')
  name.textContent = 'PROMETHEUS'
  const zustand = document.createElement('span')
  zustand.textContent = tr('web.summary')
  mini.append(marke, name, zustand)
  mini.addEventListener('click', () => buildWebIsland())
  mini.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      buildWebIsland()
    }
  })
  return mini
}

function save(): void {
  savePersist({ camera, mode }, room)
}

/**
 * **Eine Aenderung an der Kamera ist durch.**
 *
 * Sie speichert den Zustand und lässt die Achsenanzeige **sofort** nachziehen — nicht erst beim
 * naechsten 120-ms-Takt. Beim Ziehen an einem Achsengriff ist das der Unterschied zwischen „das
 * Kreuz folgt meiner Hand" und „das Kreuz hinkt hinterher".
 */
function afterCameraChange(): void {
  save()
  updateAxes()
}

// ── Die Plugins ──────────────────────────────────────────────────────────────────────────
//
// **Die Oberflaeche hat keine feste Panel-Liste mehr.** Was angezeigt wird, liefert die Registry —
// deshalb verschwindet ein abgeschaltetes Plugin samt Fenster und Befehlen, ohne dass hier eine
// Sonderregel steht.
//
// Die **Grundpanels** (Suche, Maßstab, Zustand, Raum) bleiben fest. Sie sind die Ausstattung der Welt
// selbst, kein Zusatz — alles andere ist ein Plugin.

const plugins = new PluginRegistry()

/**
 * Die **Sprachpakete** tragen sich zuerst ein — und **entscheiden dabei die Startsprache**.
 *
 * **Warum die Entscheidung dort liegt und nicht hier.** Beim ersten Anlauf stand sie in dieser Datei,
 * aber **vor** dem Eintragen der Pakete: `Locales.set()` kannte kein Paket, `Settings.set()` keine
 * Beschreibung. Beide Aufrufe schlugen still fehl — und weil am Ende „Englisch" dastand, sah es aus
 * wie gewollt. Jetzt entscheidet die Wahl in `locale-plugins.ts`, nach dem Eintragen; hier bleibt nur,
 * was **nach** der Entscheidung noetig ist: das Beschriften.
 */
registerLocalePlugins(
  plugins,
  {
    locales,
    settings,
    // Die Sprache hat gewechselt: alles, was **Text traegt**, wird neu beschriftet. Knoten tragen
    // ihren Text, nicht ihren Schluessel — deshalb neu bauen und nicht umschreiben.
    onSwitch: () => relabel(),
  },
  {
    // Die beiden Fragen des **ersten** Starts. Sie kommen aus `room.ts`, weil sie am Raum haengen:
    // jeder Raum hat seine eigene Einrichtung, wie er seinen eigenen Speicher hat.
    hasSetup: () => hasSetup(room),
    markSetup: () => markSetup(room),
  },
)

/** Ein Griff in die Flaeche, fuer die Messwerte. */
let webglInfo: string | undefined

function metrics(): Readonly<Record<string, string | number>> {
  const canvasEl = canvas
  const gl = canvasEl.getContext('webgl2') ?? canvasEl.getContext('webgl')
  if (gl && webglInfo === undefined) {
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      webglInfo = ext
        ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER))
    } catch {
      webglInfo = 'nicht lesbar'
    }
  }
  const level = LEVELS.find((l) => l.level === levelForDistance(camera.distance))
  return {
    room,
    view: mode === 'os' ? 'world' : 'chat',
    // **Die Zahlen kommen aus der Verwaltung, nicht aus einer zweiten Quelle.** Zweimal dieselbe
    // Zahl an zwei Stellen ist die Stelle, an der sie auseinanderlaufen.
    rotateSpeed: rotateSpeed(),
    zoomFactor: zoomFactor(),
    level: level ? `${level.label} (${level.level}/7)` : '—',
    distance: formatDistance(camera.distance),
    bodies: countBodies(universe),
    fps: `${fps} fps`,
    dimensions: universe5d.dimension,
    locale: locales.locale,
    screen: `${window.innerWidth}×${window.innerHeight} @ ${(window.devicePixelRatio || 1).toFixed(2)}x`,
    renderer: webglInfo ? `WebGL · ${webglInfo}` : 'WebGL',
  }
}

// Die eingebauten Plugins werden eingetragen; die Kennungen braucht hier niemand, denn die Flaeche
// liest ausschliesslich die Registry (`allPanels`).
//
// **Der Rückruf für Befehle, die eine Fläche brauchen.** `dock` entsteht erst weiter unten; die
// Variable hält den Weg, bis er steht. Bis dahin antwortet ein solcher Befehl mit Text — ein
// Befehl, der ohne Dock wirft, wäre in einer Einbettung unbrauchbar.
let panelOeffnen: (id: string) => void = () => {}
registerBuiltinPlugins(plugins, {
  registry: plugins,
  oeffnePanel: (id) => panelOeffnen(id),
  readUniverse: () => universe,
  metrics,
  // Die Plugins sprechen **die Sprache des Nutzers** — sie bekommen den Uebersetzer, nicht einen
  // fertigen Satz. Wer den Satz uebergaebe, muesste bei jedem Sprachwechsel alles neu eintragen.
  tr,
  // **Nicht angeschlossen** — und die Pruefung meldet das ausdruecklich als Befund, statt „in
  // Ordnung" zu sagen, obwohl nichts geprueft wurde.
  healthApi: () => null,
  view5d: () => ({
    bivector: universe5d.bivector,
    time: universe5d.time,
    running: universe5d.laeuft,
    speed: universe5d.tempo,
    // **Die Dimension gehoert zum Zustand**, nicht in eine zweite Variable: sie bestimmt, wie viele
    // der zehn Flaechen ueberhaupt wirken.
    dimension: universe5d.dimension,
    matrix: universeMatrix(),
  }),
  setView5d: (patch) => {
    if (patch.bivector) universe5d.bivector = [...patch.bivector]
    if (typeof patch.time === 'number') universe5d.time = patch.time
    if (typeof patch.running === 'boolean') universe5d.laeuft = patch.running
    if (typeof patch.speed === 'number') universe5d.tempo = patch.speed
  },
  orbits: () => ({ seconds: bahnen.sekunden, running: bahnen.laeuft, speed: bahnen.tempo }),
  setOrbits: (patch) => {
    if (typeof patch.seconds === 'number') bahnen.sekunden = patch.seconds
    if (typeof patch.running === 'boolean') bahnen.laeuft = patch.running
    if (typeof patch.speed === 'number') bahnen.tempo = patch.speed
    // **Die Einstellung ist die Wahrheit, nicht der Befehl.** Wer `orbits pause` tippt, aendert damit
    // die Einstellung — sonst haette er zwei Schalter fuer dieselbe Sache, und der naechste Start
    // waere wieder der alte.
    if (typeof patch.running === 'boolean') settings.set('universe.orbits', patch.running)
    if (typeof patch.speed === 'number') settings.set('universe.orbitSpeed', patch.speed)
  },
  checkCrowding: () => {
    // Auf der Ebene, auf der die Sonnensysteme gezeigt werden — dort sind die Bahnen sichtbar.
    const befunde: string[] = []
    for (const system of buildScene(universe, 4).systems) {
      for (const befund of crowding(system)) befunde.push(`${system.star.body.name}: ${befund}`)
    }
    return befunde
  },
})

// **Die Notizen** — Befehl und Gesundheitsprüfung bleiben, das Panel nicht.
//
// Das Panel zeigte Titel und Pfad, konnte aber keine Notiz öffnen, ändern oder anlegen; als
// rechte Spalte verdeckte es die Welt und war eine Sackgasse. Der Befehl `notizen` listet im
// Terminal — dort ist eine Liste ohne Editor ehrlich. `notizenPlugin` kann das Panel wieder
// anbieten, sobald es eine Handlung gibt (`notizenPlugin(env, { panel: true })`).
plugins.register(
  notizenPlugin(
    {
      tr,
      settings,
    },
    { panel: false },
  ),
)

/**
 * Die **Grundpanels**.
 *
 * Sie sind die Ausstattung der Welt selbst: Suchen, den Maßstab lesen, den Zustand ablesen, in
 * welchem Raum man ist. Alles andere — Terminal, Health, Geraet, Einstellungen, Sprache — kommt aus
 * Plugins.
 *
 * **Warum eine Funktion und keine Liste.** Die Titel sind **Saetze**, und Saetze haengen an der
 * Sprache. Eine einmal gebaute Liste traege die Titel der Sprache, die beim Laden galt — nach
 * `lang de` stuende in den Reitern weiter Englisch.
 */
function basePanels(): readonly PanelSpec[] {
  return [
    {
      id: 'search',
      title: tr('panel.search'),
      /*
       * **Abgesteckt, nicht angedockt.**
       *
       * Der Betreiber: „**bitte die ausblenden bzw sollte nicht da sein sollange man es per button
       * oder per command idk what ever macht erst dann auftaucht**" und dann, mit Bild: „die andere
       * stuff ist immer noch da: terminal, suche, zustand und abgedeckt??".
       *
       * Hier stand `zone: 'left'`. Damit war das Suchpanel **von Anfang an** sichtbar — und weil das
       * Dock über der Welt liegt, hat es sie **abgedeckt**. Jetzt startet es `closed`: es ist
       * abgesteckt und wird über die Leiste unten links („+ Suche") oder per Befehl geholt.
       *
       * **Warum `closed` und nicht „unsichtbar".** Ein ausgeblendetes Panel wäre nicht mehr
       * erreichbar; ein **abgestecktes** ist genau das, was der Betreiber verlangt: nicht da, bis man
       * es ruft — und dann da, mit seiner Größe und Anordnung.
       */
      zone: 'closed',
      size: 280,
      render: (host) => {
        host.replaceChildren()
        const hint = document.createElement('p')
        hint.className = 'hint'
        hint.textContent = tr('search.hint', { n: countBodies(universe) })
        const field = document.createElement('input')
        field.className = 'field'
        field.id = 'q'
        field.placeholder = tr('search.placeholder')
        field.setAttribute('aria-label', tr('panel.search'))
        const results = document.createElement('div')
        results.className = 'results'
        results.id = 'results'
        host.append(hint, field, results)

        /** Die Treffer der letzten Suche — fuer den Klick auf einen Eintrag. */
        let hits: readonly Hit[] = []
        const run = (): void => {
          const query = field.value
          hits = rankHits(search(universe, query), query)
          results.replaceChildren()
          if (query.trim() === '') {
            const leer = document.createElement('p')
            leer.className = 'hint'
            leer.textContent = tr('search.all', { n: countBodies(universe) })
            results.appendChild(leer)
            return
          }
          if (!hits.length) {
            const leer = document.createElement('p')
            leer.className = 'hint'
            leer.textContent = tr('term.noHits', { query })
            results.appendChild(leer)
            return
          }
          for (const hit of hits.slice(0, 40)) {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'result'
            const name = document.createElement('b')
            name.textContent = hit.body.name
            const kind = document.createElement('span')
            kind.className = 'kind'
            kind.textContent = hit.body.kind
            const where = document.createElement('span')
            where.className = 'where'
            where.textContent = hit.path.length ? hit.path.join(' / ') : '—'
            button.append(name, kind, where)
            button.addEventListener('click', () => {
              // Der Bezugswechsel: die Kamera faehrt **in** das Objekt hinein.
              camera = focusOn(camera, hit.world, hit.body.radius)
              save()
              miniTxt.textContent = hit.body.name
            })
            results.appendChild(button)
          }
        }
        field.addEventListener('input', run)
        run()
      },
    },
    {
      id: 'ruler',
      title: tr('panel.ruler'),
      // **Abgesteckt** — der Betreiber will den OS-Modus zuerst **leer** sehen: nur die Welt und die
      // Insel. Wer den Maßstab will, hängt ihn über die Leiste unten wieder ein.
      zone: 'closed',
      size: 300,
      render: (host) => {
        host.replaceChildren()
        const legend = document.createElement('div')
        legend.className = 'axes-legend'
        for (const name of ['x', 'y', 'z'] as const) {
          const span = document.createElement('span')
          span.className = `axis ${name}`
          span.textContent = name
          legend.appendChild(span)
        }
        const hint = document.createElement('p')
        hint.className = 'hint'
        hint.textContent = tr('axes.hint')
        const table = document.createElement('table')
        table.className = 'kv'
        table.innerHTML = `
          <tr><td>${tr('axes.level')}</td><td id="rLevel">—</td></tr>
          <tr><td>${tr('axes.distance')}</td><td id="rDist">—</td></tr>
          <tr><td>${tr('axes.focus')}</td><td id="rFocus">—</td></tr>
          <tr><td>${tr('axes.unit')}</td><td>1</td></tr>`
        host.append(legend, hint, table)
      },
    },
    {
      id: 'status',
      title: tr('panel.status'),
      /* Ebenfalls abgesteckt — siehe die Erklärung beim Suchpanel. */
      zone: 'closed',
      size: 280,
      render: (host) => {
        const aktiv = plugins.list().filter((e) => e.enabled).length
        host.innerHTML = `
          <table class="kv">
            <tr><td>${tr('panel.room')}</td><td>${describeRoom(room)}</td></tr>
            <tr><td>${tr('setting.interface.mode.label')}</td><td id="sMode">—</td></tr>
            <tr><td>${tr('setting.plugins.count.label')}</td><td>${aktiv} / ${plugins.list().length}</td></tr>
            <tr><td>${tr('setting.language.locale.label')}</td><td>${locales.locale}</td></tr>
            <tr><td>fps</td><td id="sFps">—</td></tr>
          </table>
          <p class="hint">${tr('status.hint')}</p>`
      },
    },
    {
      id: 'room',
      title: tr('panel.room'),
      zone: 'closed',
      size: 260,
      render: (host) => {
        host.replaceChildren()
        const hint = document.createElement('p')
        hint.className = 'hint'
        hint.textContent = tr('room.hint', { room, key: storageKey(room, '…') })
        host.appendChild(hint)
      },
    },
    {
      id: 'found',
      title: tr('panel.found'),
      // Ebenfalls abgesteckt: die Liste ist eine **Werkzeug**ansicht, kein Teil der Welt.
      zone: 'closed',
      size: 210,
      render: (host) => {
        host.innerHTML = '<div class="chips" id="chips"></div>'
      },
    },
    {
      // **Ein Sprungbrett, kein zweiter Bildschirm.** Dieses Panel zeigt auf dieselbe Fläche wie der
      // Einstellungs-Eintrag der Insel (`plugin:ui-settings`) — aber als **Panel**, das man neben die
      // Welt legen kann. Der Eintrag ist der kurze Weg, das Panel der, den man offen laesst.
      id: 'open-settings',
      title: tr('panel.settings'),
      zone: 'closed',
      size: 300,
      render: (host) => {
        host.replaceChildren()
        const hint = document.createElement('p')
        hint.className = 'hint'
        hint.textContent = tr('settings.hint')
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'result'
        button.textContent = tr('panel.settings')
        button.addEventListener('click', () => dock.openPanel('plugin:ui-settings'))
        host.append(hint, button)
      },
    },
    {
      // Und dasselbe fuer die Sprache. Beide zeigen **nicht** auf ein eigenes Fenster: die
      // Spracheinstellung ist eine gewoehnliche Einstellung im Einstellungsbildschirm
      // (`ui-language` beschreibt sie). Ein zweiter Bildschirm waere ein zweiter Ort fuer denselben
      // Wert — und der zweite waere irgendwann der falsche.
      id: 'open-language',
      title: tr('panel.language'),
      zone: 'closed',
      size: 260,
      render: (host) => {
        host.replaceChildren()
        const hint = document.createElement('p')
        hint.className = 'hint'
        hint.textContent = tr('language.hint')
        const liste = document.createElement('div')
        liste.className = 'results'
        for (const pack of locales.list()) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = pack.id === locales.locale ? 'result on' : 'result'
          const name = document.createElement('b')
          name.textContent = pack.label
          const count = document.createElement('span')
          count.className = 'kind'
          count.textContent = `${Object.keys(pack.messages).length}`
          button.append(name, count)
          button.addEventListener('click', () => {
            // Ueber die **Einstellung**, nicht am Sprachkern vorbei: nur so gilt sie beim naechsten
            // Start und die Anzeige zieht mit.
            settings.set('language.locale', pack.id)
          })
          liste.appendChild(button)
        }
        host.append(hint, liste)
      },
    },
  ]
}

/**
 * Die Panels, die die Oberflaeche kennt: Grundpanels **plus** alles, was Plugins beisteuern.
 *
 * Neu berechnet bei jeder Aenderung an der Registry. Ein ausgeschaltetes Plugin liefert nichts mehr —
 * deshalb ist „abstecken" hier keine Ausnahme, sondern der Normalfall.
 */
function allPanels(): readonly PanelSpec[] {
  const fromPlugins: PanelSpec[] = plugins.panels().map(({ pluginId, panel }) => ({
    id: `plugin:${pluginId}`,
    // Ein Titel darf eine Funktion sein — dann wird er **jetzt** geholt, in der aktuellen Sprache.
    title: typeof panel.title === 'function' ? panel.title() : panel.title,
    zone: panel.zone,
    size: panel.size,
    render: panel.render,
  }))
  return [...basePanels(), ...fromPlugins]
}

/**
 * Die Docking-Flaeche.
 *
 * Sie wird **neu aufgebaut**, wenn sich die Panel-Liste aendert — also wenn ein Plugin ein- oder
 * ausgeschaltet wird. `loadLayout` gleicht dabei gegen die **aktuellen** Angebote ab: ein
 * verschwundenes Panel faellt heraus, ein neues bekommt seine Voreinstellung, alles andere behaelt
 * Zone, Groesse und Position. Wer ein Plugin abschaltet, verliert seine Anordnung also **nicht**.
 */
const dock = new DockView(must<HTMLElement>('#dockhost'), allPanels(), room, {
  /*
   * **Die Kopfzeile weicht dem linken Panel aus.**
   *
   * Der Betreiber hat es zweimal gemeldet — „ich rede davon das es alles überlappt ist idk why und
   * warum" und dann „irgendwie immer noch nicht behoben idk why" — und beim Vergrössern des
   * Ausschnitts war es eindeutig:
   *
   *     ◆ PROMETHEUS                         ← die Marke, fest bei `left: 20px`
   *     Jedes Objekt hat einen Namen. 25 …   ← der Text des Suchpanels
   *     Ebene Sonnensystem · 4,8 k · 60 fps  ← die Kopfzeile, ebenfalls fest
   *
   * Die Marke und die Kopfzeile sind **frei über die Fläche positioniert** — sie kennen die Panels
   * nicht. Ist das linke Panel offen (Standard, 280 px), liegen sie **auf** ihm, und der Text ist
   * unlesbar. Gemessen: **2864 px²** Überlappung, die grösste im ganzen Bild.
   *
   * Deshalb meldet die Docking-Fläche jetzt ihre Breite, und die Kopfzeile liest sie. Der Wert steht
   * als CSS-Variable (`--panel-links`), nicht als Zahl im Code: die Breite **ändert sich**, wenn der
   * Nutzer das Panel zieht, und eine feste Zahl wäre beim ersten Zug falsch.
   *
   * **Warum im nächsten Bild gemessen wird.** `onLayout` läuft, **bevor** die Fläche neu gebaut ist —
   * wer hier sofort misst, misst den alten Zustand. Ein `requestAnimationFrame` wartet genau einen
   * Bildlauf und misst danach.
   */
  onLayout: () => {
    requestAnimationFrame(() => {
      const links = document.querySelector<HTMLElement>('.zone-left')
      const breite = links ? Math.round(links.getBoundingClientRect().width) : 0
      document.documentElement.style.setProperty('--panel-links', `${breite}px`)
      /*
       * **Und die Höhe der Knopfleiste — damit die Achsenanzeige darüber bleibt.**
       *
       * Gemessen im Ausschnitt (`tools/overlap3.png`): „ACHSEN · ZIEHEN" lag **auf** der
       * Knopfleiste („abgesteckt: + Achsen + Raum …"). Beide sitzen unten links, und beide hatten
       * einen **festen** Abstand vom unteren Rand — 22 px die Anzeige, 14 px die Leiste. Zwei feste
       * Zahlen, die nichts voneinander wissen, überlappen irgendwann.
       *
       * Die Höhe wird deshalb **gemessen** statt geschätzt: sie hängt an Schriftgrad und Polsterung,
       * und beides ändert sich, wenn jemand die Skala anfasst.
       */
      const leiste = document.querySelector<HTMLElement>('.panelbar')
      const hoehe = leiste ? Math.round(leiste.getBoundingClientRect().height) : 0
      if (hoehe > 0) document.documentElement.style.setProperty('--leiste-hoehe', `${hoehe}px`)
      /*
       * **Und die Oberkante der unteren Zone.**
       *
       * Sie ist die Grenze, unter der der Terminal-Bereich liegt. Gemessen statt geschätzt: sie hängt
       * an der Panelhöhe, und die zieht der Nutzer. Die Achsenanzeige richtet sich danach aus, damit
       * sie **über** dem Terminal bleibt statt darin — gemessen lag sie sonst zwischen 739 und 835 px,
       * während das Terminal bei 792 px beginnt.
       */
      const unten = document.querySelector<HTMLElement>('.zone-bottom')
      const kante = unten ? Math.round(unten.getBoundingClientRect().top) : 0
      if (kante > 0) document.documentElement.style.setProperty('--unten-top', `${kante}px`)
    })
  },
  // **Das Fenster bekommt die Sprache, nicht die Saetze.** Seine drei Beschriftungen sind fest —
  // aber ein `tr` als Wert waere der Stand vom Laden, und nach `lang de` stuende dort weiter
  // Englisch. Als Funktion holt es sich bei jedem Aufbau die aktuelle Sprache.
  tr: (key) => tr(key),
})

/*
 * **Jetzt gibt es das Dock — und damit den Weg zu einer Fläche.**
 *
 * Das Token-Panel gehört nach rechts: es ist ein Formular, keine lange Liste, und
 * die rechte Spalte ist 420 px breit. Wer `/token` tippt, sieht es sofort.
 */
panelOeffnen = (id) => {
  dock.openPanel(id, 'right')
}

/**
 * **Die Andockstellen fuer die Messung zugaenglich machen.**
 *
 * Die Werkzeuge (`tools/dock-stations.js`, `tools/docking-probe.js`) fragen damit die **ausgelieferte**
 * Funktion, nicht eine Kopie ihrer Regel.
 *
 * **Warum das noetig ist — und was es schon gekostet hat.** Das erste Werkzeug rechnete `zoneAt` **im
 * Browser nach** (zwanzig Zeilen, dieselben Zahlen). Als die Regel dann auf Stellen umgestellt wurde,
 * mass das Werkzeug weiter die **alte**: es meldete „abstecken gibt es nur am oberen Rand", waehrend der
 * Code daneben etwas anderes tat. Eine Messung, die ihre eigene Regel mitbringt, kann den Code nicht
 * widerlegen — sie bestaetigt nur sich selbst.
 *
 * Deshalb liegt hier ein **Griff** auf dieselbe Rechnung: `stellen` baut die Stellen aus dem Zustand,
 * `zoneAt` entscheidet damit — genau der Weg, den die Oberflaeche beim Loslassen geht.
 */
declare global {
  interface Window {
    __prometheusDock?: {
      readonly stellen: () => readonly DockStation[]
      readonly zoneAt: (x: number, y: number) => string
      readonly lage: (
        stelle: string,
        groesse: { readonly w: number; readonly h: number },
        belegt: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[],
      ) => { readonly x: number; readonly y: number } | null
      readonly layout: () => DockLayout
    }
    /**
     * **Die Kamera fuer die Messung — lesen und setzen.**
     *
     * **Warum das noetig ist.** Ein Werkzeug kann die Ebenen nicht ueber Radzuege abfahren: ein
     * Radereignis sind `-deltaY / 100` Rastschritte, bei `deltaY = 120` also **1,2** — und der Faktor je
     * Stufe ist 4. Wer mit vier Zuegen je Runde misst, springt ueber Ebenen hinweg und meldet dann
     * „8 von 12 Ebenen erreichbar", obwohl alle erreichbar sind. Gefunden hat das ein
     * **Widerspruch** zwischen zwei Messungen: die Arithmetik (`tools/_ebenen.ts`) sagte „jede Ebene
     * trifft ihr Band", das Rad-Werkzeug sagte „vier fehlen".
     *
     * Hier liegt deshalb derselbe Weg offen, den auch die Sprungmarken gehen: `distanceForLevel` setzen
     * und lesen, was daraus wird. **Nur zum Messen** — die Bedienung bleibt Rad, Tastatur und Leiste.
     */
    __prometheusKamera?: {
      readonly distance: () => number
      readonly setDistance: (d: number) => void
      /** **Eine Ebene gezielt anfahren** — ueber `distanceForLevel`, nicht ueber Radzuege. */
      readonly setLevel: (level: number) => void
      readonly level: () => number
      /** **Der Stand der Ueberblendung** — wie viele Koerper je Stufe sichtbar sind. */
      readonly blend: () => {
        readonly level: number
        readonly fade: number
        readonly fadeDistant: number
        readonly fine: number
        readonly grob: number
        readonly grobSichtbar: boolean
      }
      /** **Wird gezeichnet?** — ob `universe.visuals` auf `all` steht (siehe `universeView`). */
      readonly isDrawing: () => boolean
    }
  }
}

window.__prometheusDock = {
  stellen: () => dock.stellen(),
  zoneAt: (x: number, y: number) => zoneAt(x, y, window.innerWidth, window.innerHeight, dock.stellen()),
  /*
   * **Und wohin eine Stelle ihre Objekte legt.**
   *
   * Dieselbe Funktion, die beim Loslassen die Lage bestimmt (`stationPlacement`). Das Werkzeug kann damit
   * zeigen, dass das zweite Objekt **neben** dem ersten liegt und nicht darauf — der Teil des Auftrags,
   * der „**auch den objekte selbst auch orientiert**" lautet.
   */
  lage: (stelle, groesse, belegt) => {
    const gefunden = stationById(dock.stellen(), stelle)
    return gefunden ? stationPlacement(gefunden, groesse, belegt) : null
  },
  layout: () => dock.getLayout(),
}

/*
 * **Der Messgriff — und warum er ENGLISCH heisst.**
 *
 * Betreiber: „**„uebergang" naming sollte schon englisch sein ;D das könnte probleme verursachen.**
 * **Chinesische und asiatische datei wird doch auch nicht in ihren sprache genutzt**".
 *
 * Er hat recht, und der Grund ist praktisch, nicht ästhetisch: **eine Kennung, die in der Sprache des
 * Kommentars steht, ist in einer Fehlermeldung nicht suchbar.** Wer einen Stapelauszug mit
 * `setzeEbene is not a function` vor sich hat, findet die Stelle nur, wenn er auch Deutsch sucht — und
 * die Hausordnung dieses Projekts ist: **Schnittstelle englisch, Kommentar und Oberfläche deutsch**
 * (`buildScene`, `distanceForLevel`, `framingDistance`, `orbitView` — nur `SCHWELLE` und `alsAnsicht`
 * sind begründete Ausnahmen).
 *
 * **Und ich hatte sie verletzt.** Dieser Griff hiess `setzeAbstand`, `setzeEbene`, `uebergang` — die
 * Stelle, die am ehesten in einem Protokoll auftaucht, war die einzige mit deutschen Kennungen.
 */
window.__prometheusKamera = {
  distance: () => camera.distance,
  level: () => levelForDistance(camera.distance),
  setDistance: (d: number) => {
    camera = { ...camera, distance: Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, d)) }
    save()
  },
  setLevel: (level: number) => {
    // **`distanceForLevel` und nicht eine eigene Rechnung** — sonst gäbe es zwei Formeln für dieselbe
    // Sache, und die eine wäre irgendwann falsch (genau das war beim zweiten `SCHWELLE` schon einmal so).
    camera = { ...camera, distance: distanceForLevel(level as Level) }
    save()
  },
  blend: () => view.blendState(),
  isDrawing: () => view.isDrawing,
}

/**
 * **Die Ansichts-Leiste — Zoomstufe und Abstand als verschiebbares Objekt.**
 *
 * Der Betreiber: „für den zoom und distanz könnten wir zb theoretisch diese logic vom Deepseek Harness
 * nutzen … das gleiche behandel als eine art objekt die man theoretisch verschieben kann und
 * verschwinden könnte".
 *
 * Sie hängt **nicht** am Dock: Panels gehören zu Zonen und werden angedockt, diese Leiste gehört zur
 * **Ansicht** — sie zeigt, wohin man schaut, und man schiebt sie dorthin, wo sie nicht stört. Deshalb
 * liegt sie im `#core` (über der Welt) und merkt Position und Sichtbarkeit **je Raum**, wie Kamera und
 * Dock.
 *
 * `naechsterAbstand` kommt aus `camera.ts`: `−`/`+` gehen **eine Bezugsebene** weiter und benutzen
 * dieselbe Funktion wie die Sprungmarken. Eine eigene Rechnung hier wäre eine zweite Wahrheit.
 */
const VIEW_CONTROLS_KEY = 'view.v1'

/**
 * **Der Zustand der Leiste — mit einem Startplatz, der nicht (0,0) ist.**
 *
 * `x: 0, y: 0` wäre die linke **obere Ecke** — genau dort steht die Kopfzeile („◆ PROMETHEUS / Ebene
 * …"). Und der Konstruktor **begrenzt** die Position auf das Fenster, also muss sie schon beim ersten
 * Aufbau stimmen; nachträgliches Setzen wäre ein Sprung.
 *
 * Der Startplatz ist **rechts oben**: dort ist nichts — die Kopfzeile ist links, die Insel in der
 * Mitte, die Achsenanzeige unten links. Ein Objekt, das man verschieben kann, soll nicht dort
 * anfangen, wo schon etwas liegt.
 */
function viewControlsZustand(): { x: number; y: number; offen: boolean } {
  const standard = { x: Math.max(8, window.innerWidth - 168), y: 64, offen: true }
  try {
    const roh = globalThis.localStorage?.getItem(storageKey(room, VIEW_CONTROLS_KEY))
    if (!roh) return standard
    const p = JSON.parse(roh) as Partial<{ x: number; y: number; offen: boolean }>
    return {
      x: typeof p.x === 'number' && p.x > 0 ? p.x : standard.x,
      y: typeof p.y === 'number' && p.y > 0 ? p.y : standard.y,
      offen: p.offen !== false,
    }
  } catch {
    return standard
  }
}

const viewControls = new ViewControls(must<HTMLElement>('#core'), {
  abstand: () => camera.distance,
  /*
   * **Ein Sprung — der Abstand kommt vom Aufrufer.**
   *
   * Die Leiste rechnet **nicht** selbst: sie nennt den Abstand, und hier wird gesetzt. Das `Rahmen`
   * (Fokus und Abstand aus dem Inhalt) macht die Schleife beim Ebenenwechsel — dieselbe Regel wie beim
   * Rad und beim Klick auf einen Körper. Zwei Stellen, die dasselbe tun, liefen auseinander.
   */
  setzen: (abstand) => {
    camera = { ...camera, distance: abstand }
    letzteEbene = levelForDistance(camera.distance)
    save()
  },
  tr: (key, werte) => tr(key, werte),
  // Die echte Größe gibt es in zwei Sprachen („10 Mio Lj" / „10 million ly") — die Ansichtsleiste fragt.
  deutsch: () => locales.locale !== 'en',
  laden: viewControlsZustand,
  merken: (zustand) => {
    try {
      globalThis.localStorage?.setItem(storageKey(room, VIEW_CONTROLS_KEY), JSON.stringify(zustand))
    } catch {
      // Kein Speicher: die Leiste funktioniert trotzdem, nur nicht über den Neustart hinaus.
    }
  },
})

/**
 * **Eine Aenderung zieht durch.**
 *
 * Hier steht die Liste der Folgen, die eine Einstellung haben kann — an **einer** Stelle. Sonst
 * haette jeder Aufrufer selbst daran denken muessen, die Achsenanzeige nachzuziehen oder die Panels
 * neu zu beschriften; beim dritten Aufrufer waere es vergessen worden, und dann zeigt die Anzeige
 * etwas anderes als die Kamera tut.
 *
 * **Was hier bewusst NICHT steht:** ein `switch` ueber alle Schluessel. Die meisten Einstellungen
 * wirken **beim Lesen** — die Kamera holt ihren Wert bei jeder Bewegung. Nur was **materiell** ist
 * (Sprache, Dimension, Achsen, Modus, Hintergrund, Namen), muss hier gemeldet werden. Das ist die
 * kuerzere und ehrlichere Liste: „wirkt beim Lesen" ist der Normalfall, nicht die Ausnahme.
 */
function onSettingChanged(key: string): void {
  // **Wer die Sprache umstellt, hat gewaehlt.** Die Marke trennt „automatisch erkannt" von „so
  // gewollt" — ohne sie galt die Erkennung als Entscheidung, und auf einem deutschen Rechner blieb
  // Englisch stehen, ohne dass es jemand gewollt haette.
  if (key === 'language.locale' || key === '*') {
    /*
     * ══ DIE SPRACHE WIRD JETZT WIRKLICH GESETZT ════════════════════════════════════════════════════
     *
     * **Der Fehler, der hier stand (gemessen am 16.10.2026).** Hier standen zwei Zeilen:
     *
     *     if (key === 'language.locale') settings.set('language.chosen', true)
     *     if (key === 'language.locale' || key === '*') relabel()
     *
     * Die erste setzt die **Marke** („der Nutzer hat gewählt"), die zweite **beschriftet neu**. Was
     * fehlte, war der Schritt dazwischen: `locales.set(...)` — der einzige Aufruf, der die Sprache
     * **umstellt**. Im ganzen `main.ts` kam er **nicht ein einziges Mal** vor.
     *
     * Die Folge hat der Betreiber gesehen und gemeldet: *„next issue ist das nix ändert"*. Gemessen im
     * Dialog: die Auswahl wechselte von `de` auf `en`, der Speicher stand danach auf
     * `{"language.locale":"en","language.chosen":true,…}` — und die Abschnitte hießen weiter
     * „Steuerung, Universe, Oberfläche, Sprache". Der **Wert** war neu, das **Bild** alt. Beim nächsten
     * Laden stimmte es dann, weil `registerLocalePlugins` die Sprache beim Start setzt — was den
     * Fehler verdeckte: es sah aus wie „wirkt beim nächsten Mal", statt wie „wirkt nie sofort".
     *
     * **Warum `relabel()` allein nicht genügt.** Es beschriftet die Oberfläche mit der Sprache, die
     * der Sprachkern **hat** — nicht mit der, die in den Einstellungen **steht**. Zwei Dinge, zwei
     * Zustände; ohne den Satz dazwischen bleiben sie auseinander.
     *
     * **Und wenn die Sprache nicht existiert** (ein Wert aus einem älteren Speicher, ein Paket wurde
     * abgesteckt), gibt `locales.set` `false` zurück. Dann wird die **Einstellung zurückgenommen** —
     * auf die Sprache, die wirklich gilt. Eine Auswahl, die auf einen Wert stehenbleibt, den es nicht
     * gibt, ist die unangenehmste Sorte Zustand: sie sieht aus wie eine Wahl und ist keine.
     */
    if (key === 'language.locale') settings.set('language.chosen', true)
    const gewuenscht = settings.getString('language.locale', locales.locale)
    if (!locales.set(gewuenscht)) settings.set('language.locale', locales.locale)
    relabel()
  }
  /*
   * **Die Vorlage — und hier gilt der Adresszusatz absichtlich NICHT.**
   *
   * Beim **Laden** gewinnt `?stil=…` (damit man zwei Vorlagen in zwei Tabs vergleichen kann). Beim
   * **Ändern** gilt die Einstellung — auch dann, wenn die Seite mit Zusatz geöffnet wurde. Wer die
   * Liste im Einstellungsbildschirm bedient und nichts passiert, weil in der Adresse noch etwas
   * steht, hält die Einstellung für kaputt (zu Recht). Die Herkunft wird deshalb hier neu gesetzt:
   * `einstellung` oder `vorgabe`, niemals `adresse`.
   *
   * **Und warum die Marke `aufgebaut` hier steht — gemessen, nicht vorsorglich.** `controlsPlugin`
   * trägt seine Felder beim **Einschalten** ein (`onEnable` → `settings.describe`), und `describe`
   * **meldet jede Eintragung** an die Zuhoerer. Diese Meldung erreicht den Zweig hier — und der
   * schrieb die Vorlage aus der **Einstellung** (Vorgabe `base`) über die aus der **Adresse**.
   *
   * Gemessen am 16.10.2026 im Browser: `?stil=prometheus` in der Adresse, `location.search` intakt,
   * Wert im Raster — und im Dokument stand trotzdem `data-stil="base"`, `data-stil-quelle="einstellung"`.
   * Die Umschaltung war richtig gebaut und wurde **beim Start überschrieben**.
   *
   * Dieselbe Regel wie bei `interface.labels` zwei Abschnitte weiter oben: was die Oberfläche baut,
   * darf erst nach dem Aufbau angefasst werden — und was der Aufbau **meldet**, ist keine Handlung
   * des Nutzers. Vor `aufgebaut` gilt deshalb die Wahl aus dem Laden, unverändert.
   */
  if ((key === STIL_SCHLUESSEL || key === '*') && aufgebaut) {
    const gewaehlt = settings.getString(STIL_SCHLUESSEL, STIL_VORGABE)
    setzeVorlage(istStil(gewaehlt) ? gewaehlt : STIL_VORGABE, istStil(gewaehlt) ? 'einstellung' : 'vorgabe')
  }
  if (key === 'universe.dimensions' || key === '*') universe5d.dimension = worldDimensions()
  if (key === 'control.showAxes' || key === '*') axesLayer.style.display = showAxes() ? '' : 'none'
  if (key === 'interface.mode' || key === '*') {
    setMode(settings.getString('interface.mode', mode) === 'chat' ? 'chat' : 'os')
  }
  /*
   * **Was das Universum zeigt — EINE Entscheidung, EINE Stelle, die sie liest.**
   *
   * Der Betreiber: *„die sterne finde ich gut gemacht sollte man dort belassen das man via einstellung
   * machen kann evt als dropdown liste auswahl oder so"*.
   *
   * Bis hierher lasen **zwei** Stellen dieselbe Absicht auseinander: `applyStarfield` verknüpfte den
   * Körperschalter per UND mit `interface.starfield` (einem Feld, das es in keiner Einstellung gab),
   * und diese Zeile las den Schalter als Wahrheitswert. Wer die Körper wegwollte, verlor die Sterne.
   *
   * Jetzt gibt es **einen** Wert mit drei Ausprägungen, und beide Wirkungen werden daraus abgeleitet:
   *
   *   `none`   nichts zeichnen — auch keinen Himmel
   *   `stars`  **nur** der Himmel (die Körper nicht)
   *   `all`    Körper und Himmel
   */
  if (key === CONTROL_KEYS.universeVisuals || key === '*') {
    /*
     * **Und hier die Marke — aus demselben Grund wie eine Zeile tiefer.**
     *
     * `settings.onChange` läuft **schon beim Eintragen** der Einstellungen, also **bevor** `view`
     * gebaut ist (Zeile `const view = new UniverseView…`). Ein Zugriff dort starb mit „Cannot access
     * 'view' before initialization", und drei Tests haben es gemeldet („der Startweg wurde nicht
     * erreicht").
     *
     * Das ist die **dritte** Stelle derselben Klasse in diesem Projekt — nach `dock` und `himmelEbene`.
     * Die Marke `aufgebaut` gibt es genau dafür, und sie steht eine Zeile tiefer schon im Code; sie
     * hier zu vergessen war der Fehler.
     */
    const was = universeView()
    if (aufgebaut) view.setDrawing(was === 'all')
    applyStarfield(true)
  }
  if (key === 'interface.hud' || key === '*') {
    hud.classList.toggle('hidden', !settings.getBoolean('interface.hud', true))
  }
  if (key === 'interface.labels' || key === '*') {
    // Die Beschriftungen haengen an der Szene; ein Neubau der Welt ist der ehrliche Weg.
    //
    // **Die Marke ist hier nicht Zierde — sie ist der zweite Fall desselben Fehlers.** Die
    // Einstellungen tragen sich beim **Einschalten ihrer Plugins** ein, und das geschieht, **bevor**
    // `view` gebaut ist: `controlsPlugin.onEnable` ruft `settings.describe`, das meldet die
    // Aenderung, und dieser Zweig griffe auf `view` zu — ein `ReferenceError`, der das ganze Modul
    // sterben laesst und ein **leeres Bild** hinterlaesst.
    //
    // Genau das ist beim ersten Anlauf mit `dock` passiert. Dass es jetzt mit `view` wieder
    // passierte, ist der Beweis, dass die Marke kein Einzelfall war, sondern eine **Regel**:
    // was die Oberflaeche baut, darf erst nach dem Aufbau angefasst werden.
    if (aufgebaut) view.rebuild(levelForDistance(camera.distance), camera.distance)
  }
  if (key === 'universe.orbits' || key === '*') bahnen.laeuft = settings.getBoolean('universe.orbits', true)
  if (key === 'universe.orbitSpeed' || key === '*') bahnen.tempo = settings.getNumber('universe.orbitSpeed', 1)
  if (key === 'universe.rolling' || key === '*') universe5d.laeuft = settings.getBoolean('universe.rolling', true)
  if (key === 'universe.rollSpeed' || key === '*') universe5d.tempo = settings.getNumber('universe.rollSpeed', 0.045)
}

/**
 * Setzt den Sternenhintergrund — **je Bezugsebene ein anderer** (siehe `HIMMEL`).
 *
 * Der Betreiber zum Maximum: „ab bestimmt grenze von weitem sollte irgendwann nicht überall sterne
 * geben hintergrund". Das ist keine Farbfrage, sondern eine **Frage des Maßstabs**: jede Ebene hat ihre
 * eigene Leere. Auf der Ebene eines Planeten steht man im Licht einer Sonne; auf der des Universums
 * steht man am Rand von allem, und dort ist es dunkel und leer.
 *
 * **Und seit dem 15.10.2026 hat der Himmel seinen EIGENEN Wert.** Vorher hing er per UND am
 * Körperschalter (`universe.visuals && interface.starfield`) — und `interface.starfield` war ein Feld,
 * das in **keiner** Einstellung stand. Der Betreiber: *„die sterne finde ich gut gemacht sollte man
 * dort belassen"*. Jetzt ist „nur Sterne" ein **eigener Wert** derselben Auswahlliste (`universeView`):
 * eine Entscheidung, drei Bilder — siehe `control-settings.ts`.
 *
 * `neu` baut den Himmel **hart** neu — für den Wechsel der Einstellung, der die Bezugsebene nicht
 * ändert (`himmelEbene` würde den Aufruf sonst überspringen).
 */
function applyStarfield(neu = false): void {
  const an = universeView() !== 'none'
  const ebene = levelForDistance(camera.distance)
  /*
   * **Zwei Bedingungen, und beide sind nötig.** Gebaut wird nur, wenn sich der **Schalter** oder die
   * **Ebene** geändert hat. Hier stand zuerst eine gemerkte Zahl (`himmelEbene`) — die ist überflüssig:
   * die Ebene kommt aus der Kamera, und ein zweiter Wert für dieselbe Sache läuft irgendwann
   * auseinander.
   */
  if (!neu && an === skyOn && ebene === lastSkyLevel) return
  skyOn = an
  lastSkyLevel = ebene
  screens.os.style.setProperty('--starfield', an ? starfieldUrl(ebene) : 'none')
  /*
   * **Und die Grenzhelligkeit des Sternenfelds.**
   *
   * Der Katalog wird **einmal** erzeugt (`stars.ts`, beim Start) — was sich mit der Bezugsebene
   * ändert, ist **wie viele Klassen davon zu sehen sind**. Das ist der Unterschied zwischen einem
   * Katalog und einer Anzeige: der Katalog ist die Wahrheit über den Himmel, die Grenzhelligkeit ist
   * die Frage, was ein Auge in dieser Entfernung noch auflöst.
   *
   * **Warum das kein Neubau ist.** Ein Neubau je Ebene würde die Sterne **springen** lassen — ein
   * Stern, der bei jedem Zoomschritt woanders steht, ist kein Himmel. Gesetzt wird nur `visible` je
   * Klasse: **sechs** Schreibvorgänge beim Ebenenwechsel, **keine** je Bild.
   *
   * **Und warum die Marke `aufgebaut` hier steht.** Während des Aufbaus (Sprachpakete, erste
   * Einstellung) gibt es `view` noch nicht; `applyStarfield` wird aber schon gerufen. Der Zugriff
   * starb früher mit „Cannot access 'view' before initialization" und hinterließ ein **leeres Bild** —
   * dieselbe Fehlerklasse wie bei `dock` und `interface.labels`. Gebaut wird das Feld deshalb am Ende
   * des Aufbaus (`view.setzeSterne(...)`, siehe unten).
   */
  if (aufgebaut) {
    view.setzeSternGrenze(grenzeFuerEbene(ebene))
    view.sterneSichtbar(an)
    /*
     * **Und das Feld neu legen, wenn die Bezugsebene wechselt.**
     *
     * Der erste Anlauf legte die Sterne **einmal um den Weltursprung** — und der Puffer blieb
     * schwarz (gemessen: 0 von 324 000 gelesenen Pixeln hell, hellster Wert 16). Kein Fehler in der
     * Zeichnung: der Fokus der Kamera liegt bei rund **1,4 · 10⁵** Einheiten vom Ursprung, die Sterne
     * der nahen Ebene aber im Umkreis von 3 132. Sie waren da — nur meilenweit weg.
     *
     * Der physikalisch richtige Ort ist der **Beobachter**: ein Sternenfeld umgibt den, der hineinsieht,
     * und nicht den Nullpunkt eines Koordinatensystems. Die Radien liegen deshalb zwischen einem
     * Bruchteil und einem Vielfachen des Abstands — **bezogen auf den Fokus**.
     *
     * **Warum ein Neulegen und keine Bewegung.** Innerhalb einer Ebene steht das Feld **fest**: die
     * Kamera fährt daran vorbei, und das ist die Parallaxe. Bei einem Ebenenwechsel wird der
     * Bezugsrahmen getauscht (die Körper werden dort ebenfalls neu gebaut, siehe `rebuild`), und das
     * Feld wird mit ihm neu gelegt. Dieselbe Zahl Sterne, dieselbe Verteilung, andere Lage — die
     * Alternative wäre, sie über zwölf Größenordnungen mitzuschleppen, und dann lägen sie wieder
     * nirgends.
     */
    if (sterneGelegtFuer !== ebene) {
      sterneGelegtFuer = ebene
      view.setzeSterne(
        sterne(STERN_JE_KLASSE, camera.distance * 0.8, camera.distance * 25, camera.focus),
        grenzeFuerEbene(ebene),
      )
      view.sterneSichtbar(an)
    }
  }
  // **Und der Zustand am Bildschirm.** Er trägt den Dunst (`--starfield`) und ist die Marke, an der
  // eine Prüfung sieht, ob der Himmel an ist.
  screens.os.classList.toggle('himmel', an)
}

/**
 * Baut den Chat **nur, wenn sich wirklich etwas geaendert hat**.
 *
 * **Warum das noetig ist.** `relabel()` wird beim Aufbau und danach bei jeder Aenderung gerufen, die
 * Text traegt — und der Chat ist die teuerste Flaeche darin. Ohne diese Pruefung wird er beim Start
 * **dreimal** gebaut (Sprachpakete eintragen, Aufbau, erste Einstellung), und jedes Mal entstehen
 * Knoten und Zuhoerer neu. Der Pruefstand hat es gezeigt: im Baum stand der Beispielverlauf
 * vierfach.
 *
 * **Die Kennung ist der Zustand, den der Chat liest** — die Sprache und die Kennung ihrer Pakete.
 * Aendert sich nichts davon, ist ein Neubau nicht nur unnoetig, sondern **falsch**: er wuerde den
 * Verlauf des Nutzers gegen den Beispielverlauf tauschen.
 *
 * **Was der naechste Agent beachten muss:** steht hier spaeter wieder eine Leiste mit einer Breite
 * (wie die 280 px der Vorlage), gehoert sie **in die Kennung**. Sonst klappt sie nicht um, weil der
 * Aufbau ausbleibt — ein Fehler, der wie ein kaputter Knopf aussieht.
 */
let chatSignatur = ''

function mountChatIfNeeded(): void {
  const signatur = `${locales.locale}|${locales
    .list()
    .map((pack) => pack.id)
    .join(',')}`
  if (signatur === chatSignatur) return
  chatSignatur = signatur
  appendMessage = mountChat(screens.chat, chatCallbacks())
}

/**
 * Beschriftet alles neu, was **Text traegt**.
 *
 * **Warum neu bauen und nicht umschreiben.** Ein Knoten traegt seinen Text, nicht seinen Schluessel.
 * Wer ihn umschreiben wollte, muesste wissen, welcher Schluessel ihn erzeugt hat — also eine zweite
 * Liste fuehren, die zur ersten veraltet. Ein Neubau ist kuerzer und immer richtig.
 */
function relabel(): void {
  // **Vor dem Aufbau gibt es nichts zu beschriften.** Siehe `aufgebaut` oben: ohne diese Zeile
  // stirbt das Modul beim Eintragen der Sprach-Plugins, und das Bild bleibt leer.
  if (!aufgebaut) return
  buildAxes()
  axesLayer.style.display = showAxes() ? '' : 'none'
  if (islandOpen) buildIslandFull()
  miniTxt.textContent = tr('island.open')
  /*
   * Die Marke oben links ist ein Bedienelement (siehe `hudMarke`) — ihre Beschriftung gehoert
   * hierher, sonst stuende nach `lang de` weiter die Sprache vom Laden darauf.
   *
   * **Und sie sagt, wohin es geht.** Zwei Faelle, zwei Saetze: in den **Harness-Chat**
   * (`hud.toHarness`) oder in die Chat-Ansicht **dieses Prototyps** (`hud.toChat`). Der Unterschied
   * ist der ganze Punkt dieser Aenderung — eine Beschriftung, die beides „Chat" nennt, waere genau
   * die Verwechslung, die der Betreiber gemeldet hat.
   *
   * Die **Adresse** steht als Kurzhinweis (`title`) dabei, nicht als `aria-label`: wer mit der Maus
   * zeigt, sieht **wohin** der Klick fuehrt. Seit die Welt auf demselben Port liegt, ist das die
   * Wurzel der eigenen Herkunft — kurz genug, um sie zu nennen.
   */
  const chatAdresse = chatZiel()
  const markeText = tr(markeTextKey(chatAdresse))
  hudMarke.setAttribute('aria-label', markeText)
  hudMarke.title = chatAdresse === undefined ? markeText : `${markeText} — ${chatAdresse}`
  mountChatIfNeeded()
  dock.setPanels(allPanels(), room)
  setMode(mode)
}

settings.onChange(onSettingChanged)
plugins.onChange(() => dock.setPanels(allPanels(), room))

/**
 * **`view` — der Umschalter zwischen den Ansichten.**
 *
 * Der Betreiber: „anders gesagt ist unsere welt anzeige eine art switch zur chat" und „man kann es
 * switchen über chat command".
 *
 * **Warum das ein Befehl ist und kein Knopf.** Der Umschalter gehoert dorthin, wo man ohnehin
 * arbeitet — das Terminal ist in **jeder** Ansicht da. Ein Knopf muesste in jeder Ansicht neu gebaut
 * werden, und drei Knoepfe fuer dieselbe Sache sind drei Stellen, an denen einer kaputtgehen kann.
 *
 * **Die Ansicht wird als Einstellung gespeichert**, nicht nur als Zustand: wer die Welt verlaesst,
 * will sie beim naechsten Laden so vorfinden, wie er sie verlassen hat.
 */
plugins.register({
  id: 'ui-view',
  name: 'Ansicht wechseln',
  version: '0.1.0',
  description: 'Schaltet zwischen Chat, Vorlage und Universe um — der Switch zwischen den Ansichten.',
  commands: [
    {
      name: 'view',
      help: 'wechselt die Ansicht: view [web|world|chat] — ohne Argument zeigt sie den Zustand',
      run: (args) => {
        const [ziel = ''] = args
        const namen: Record<string, Ansicht> = { web: 'web', world: 'os', os: 'os', chat: 'chat' }
        if (ziel === '') {
          return [`${tr('term.view.current')}: ${alsEinstellung(mode)}`, '  chat · web · world']
        }
        const naechste = namen[ziel]
        if (!naechste) return [`${tr('term.usage')}: view [web|world|chat]`]
        /*
         * **Der eine Weg, die Ansicht zu wechseln.**
         *
         * Hier standen die beiden Zeilen `settings.set('interface.mode', naechste === 'os' ? 'world' :
         * naechste)` und `setMode(naechste)` — dieselbe Paarung, die die Marke und die Insel ebenfalls
         * brauchen. Sie steht jetzt in `view-switch.ts`, damit es **eine** Stelle gibt, an der ein
         * Wechsel vollstaendig ist. Wer hier wieder eine einzelne Zeile danebensetzt, hat einen
         * Wechsel, der den Reload nicht ueberlebt.
         */
        wechsleAnsicht(wechsel, naechste)
        return [`${tr('term.view.set')}: ${alsEinstellung(naechste)}`]
      },
    },
  ],
  healthChecks: [
    () => ({
      name: 'ui-view:ansicht',
      ok: true,
      message: `aktiv: ${alsEinstellung(mode)}`,
    }),
  ],
})

// Der **Einstellungsbildschirm** — ein Plugin wie jedes andere. Es kennt keine einzige Einstellung;
// es zeigt an, was die anderen beschreiben. Deshalb erscheint eine Einstellung, die ein spaeter
// hinzugefuegtes Plugin mitbringt, ohne eine Aenderung an dieser Datei.
plugins.register(
  settingsPlugin({
    settings,
    registry: plugins,
    t: () => t(),
    apply: (key) => onSettingChanged(key),
  }),
)

// Der **Auftrag für den Chat** — als Panel und als Befehl.
//
// Der Betreiber hat die Chat-Implementierung herausgenommen und einem anderen Agenten uebergeben:
// „beschreibe es was vorhaben ist funktion und projekt stack". Eine Beschreibung, die nur in einer
// Datei steht, findet man nicht, wenn man den Prototyp oeffnet. Hier ist sie **im Programm**.
plugins.register(orderPlugin({ t: () => t() }))

/**
 * **Der Einstellungsbildschirm als Overlay.**
 *
 * Er liegt **ausserhalb** der drei Ansichten und ist damit aus jeder erreichbar: aus der Welt ueber
 * den Insel-Eintrag, aus dem Chat ueber `settings` im Terminal und aus der Vorlage ueber die
 * CHANNELS-Insel. Drei Wege, ein Ziel — und der Wert kommt aus **einer** Verwaltung.
 */
const settingsModal = new SettingsModal(must<HTMLElement>('#settingsOverlay'), {
  settings,
  registry: plugins,
  t: () => t(),
  apply: (key) => onSettingChanged(key),
})

// Der Dock-Eintrag `→ Einstellungen` oeffnet dieselbe Flaeche. Er bleibt, weil ein Panel, das man
// offen **liegen** laesst, etwas anderes ist als ein Bildschirm, den man aufsucht.
plugins.register({
  id: 'ui-settings-open',
  name: 'Einstellungen öffnen',
  version: '0.1.0',
  description: 'Der Weg zum Einstellungsbildschirm aus jeder Ansicht.',
  commands: [
    {
      // **Nicht `settings`.** Diesen Namen traegt schon der Befehl, der Werte **liest und setzt**
      // (`settings list`, `settings control.rotateSpeed 0.002`) — er kommt aus dem
      // Einstellungs-Plugin. Ein zweiter Befehl mit demselben Namen wuerde den ersten verdecken, und
      // dann findet man `settings list` nicht mehr. `open` oeffnet den Bildschirm, `settings`
      // bedient die Werte: zwei Aufgaben, zwei Namen.
      name: 'open',
      help: 'öffnet die Einstellungen als Bildschirm: open [settings]',
      run: (args) => {
        const [was = 'settings'] = args
        if (was !== 'settings') return [`${tr('term.usage')}: open settings`]
        settingsModal.open()
        return [tr('settings.opened')]
      },
    },
  ],
})

// Die **Steuerung** beschreibt ihre Einstellungen selbst — und wird eingetragen, damit die Verwaltung
// sie kennt und `settings list` sie zeigt.
plugins.register(controlsPlugin({ settings, onApply: (key) => onSettingChanged(key) }))

window.addEventListener('resize', () => {
  // Beim Wechsel der Bildschirmbreite entscheidet sich neu, ob die Welt ueberhaupt laeuft.
  setMode(mode)
})

// ── Zeiger: drehen, zoomen, schieben ─────────────────────────────────────────────────────
//
// **Zwei Belegungen, und der Nutzer waehlt** (Einstellung `control.scheme`):
//
//   `cad`    — linke Taste dreht, **mittlere Taste oder Shift+links schiebt**, das Achsenkreuz
//              zieht um eine Weltachse. Die Belegung eines CAD-Programms.
//   `orbit`  — die **vorherige** Belegung: linke Taste dreht immer, Shift+links schiebt.
//
// **Warum beide bleiben.** Der Betreiber: „der openworld ist schon richtig so die steuereung ist
// glaub gut aber ich möchte auch die alte steuerung noch behalten und per settings ändern können
// was man bevorzugt." Wer sich an eine Belegung gewoehnt hat, soll sie behalten duerfen — eine
// Umstellung, die man nicht zuruecknehmen kann, ist keine Verbesserung, sondern eine Zumutung.
//
// **Was sich NICHT unterscheidet:** das Rad, der Klick zum Fokussieren und die Achsengriffe. Drei
// Dinge mit zwei Belegungen waeren zwei Programme in einem.

/**
 * **Das Kontextmenue des Browsers wird auf der Flaeche unterdrueckt.**
 *
 * Der Betreiber: „rechtsklick issue das immer diese website pop up erscheint das war vorher nicht
 * so." Vorher gab es hier keinen Zuhoerer — das Menue kam vom **Browser**, sobald man auf die
 * Flaeche rechtsklickte, und auf einer Zeichenflaeche ist „Seitenquelltext anzeigen" keine sinnvolle
 * Antwort auf einen Klick.
 *
 * **Unterdrueckt wird es nur auf der Welt und im Dock — nicht im ganzen Dokument.** Wer markierten
 * Text oder ein Eingabefeld rechtsklickt, behaelt das Menue: dort ist es nuetzlich (Kopieren,
 * Einfuegen), und es dort zu nehmen waere eine zweite Unannehmlichkeit statt einer Behebung.
 */
for (const flaeche of [screens.os, must<HTMLElement>('#dockhost')]) {
  flaeche.addEventListener('contextmenu', (event) => {
    const ziel = event.target
    if (ziel instanceof HTMLInputElement || ziel instanceof HTMLTextAreaElement) return
    event.preventDefault()
  })
}

let dragging: { x: number; y: number; pan: boolean } | null = null

/** Die Belegung — bei jeder Beruehrung **gelesen**, nicht einmal kopiert. */
function controlScheme(): 'cad' | 'orbit' {
  return settings.getString('control.scheme', 'cad') === 'orbit' ? 'orbit' : 'cad'
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId)
  // Die **mittlere** Taste ist `button === 1`. In `cad` schiebt sie; in `orbit` gibt es das nicht —
  // dort dreht sie wie vorher, damit die alte Belegung wirklich die alte ist.
  const mitte = event.button === 1
  const pan = controlScheme() === 'cad' ? mitte || event.shiftKey : event.shiftKey
  dragging = { x: event.clientX, y: event.clientY, pan }
})

canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return
  const dx = event.clientX - dragging.x
  const dy = event.clientY - dragging.y
  dragging.x = event.clientX
  dragging.y = event.clientY
  camera = dragging.pan
    ? panBy(camera, dx, dy, panFactor())
    : rotateBy(camera, dx, dy, rotateSpeed())
  save()
})

for (const type of ['pointerup', 'pointercancel'] as const) {
  canvas.addEventListener(type, () => {
    dragging = null
  })
}

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    // Ein Rastschritt ist ein Faktor — dadurch fuehlt sich Zoom ueberall gleich an. Wie gross der
    // Faktor ist, steht in den Einstellungen (`control.zoomFactor`).
    const notches = -event.deltaY / 100
    camera = zoomBy(camera, notches, zoomFactor())
    save()
  },
  { passive: false },
)

/**
 * **Anklicken heisst fokussieren.**
 *
 * Kein Menue, kein Auswahlrahmen: wer einen Koerper anklickt, faehrt mit der Kamera dorthin — und der
 * naechste Zoom beginnt bei ihm. Das ist der Bezugswechsel („Fix Fokus"), und er ist die einzige Form
 * der Auswahl, die diese Welt braucht.
 *
 * Der Klick darf das **Ziehen** nicht stoeren: deshalb wird nur ausgeloest, wenn der Zeiger zwischen
 * Druecken und Loslassen kaum gewandert ist. Ohne diese Pruefung wuerde jedes Drehen versehentlich
 * etwas fokussieren.
 */
let pointerStart: { x: number; y: number } | null = null
canvas.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY }
})
canvas.addEventListener('pointerup', (event) => {
  const start = pointerStart
  pointerStart = null
  if (!start) return
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return

  const rect = canvas.getBoundingClientRect()
  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1
  const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
  const getroffen = view.pick(nx, ny)
  if (!getroffen) return

  camera = focusOn(camera, getroffen.world, getroffen.body.radius)
  save()
  // Und der Name steht in der Pille — sonst weiss man nicht, was man gerade fokussiert hat.
  miniTxt.textContent = getroffen.body.name
})

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return
  if (event.key === '0') camera = startCamera()
  else if (event.key === '+' || event.key === '=') camera = zoomBy(camera, 1, zoomFactor())
  else if (event.key === '-') camera = zoomBy(camera, -1, zoomFactor())
  else return
  save()
})

window.addEventListener('beforeunload', save)

// ── Die Schleife ─────────────────────────────────────────────────────────────────────────

let lastFrame = performance.now()
let frames = 0
let fpsAt = lastFrame
let fps = 0

/** Der Anfang — für „die ersten zwei Sekunden tragen den Aufbau und zählen nicht". */
const startZeit = lastFrame
/** Die Dauer des letzten Bildes: die Meßgröße für die Gerätestufe. */
let letzteBildZeit = lastFrame
/** Die gemessenen Bildzeiten — Grundlage der Entscheidung, siehe unten im Bildtakt. */
const bildZeiten: number[] = []
/** Ob die Gerätestufe schon einmal anhand echter Bilder entschieden wurde. */
let stufeEntschieden = false

/**
 * **Die Gerätestufe dieser Seite — siehe `gpu.ts`.**
 *
 * Ermittelt **vor** dem Bau der Ansicht, weil sie in den Zeichner eingeht (Kantenglättung, Energie,
 * Blendart). Die Messung nach den ersten Bildern kann sie danach **senken** — nie heben: wer zu
 * langsam war, war zu langsam; ein Gerät, das sich erholt, gibt es nicht.
 */
let aktiveStufe: Geraetestufe = geraetestufeErmitteln()

/**
 * Der Sternenkatalog **für eine Stufe** — die Zahl der Punkte ist der eine Regler, der sich dosieren
 * läßt, ohne daß das Bild aufhört, ein Himmel zu sein.
 *
 * **Warum das eine Funktion ist und keine Zeile am Aufrufort.** Sie wird an **zwei** Stellen gebraucht
 * (beim Aufbau und beim Senken der Stufe), und zwei Stellen mit derselben Rechnung laufen irgendwann
 * auseinander — dann steht beim Nachziehen ein voller Katalog auf einer CPU.
 *
 * @param stufe - die Gerätestufe
 * @returns die Zahl der Sterne je Helligkeitsklasse
 */
function sternKatalog(stufe: Geraetestufe): readonly number[] {
  const anteil = STERN_ANTEIL[stufe]
  return STERN_JE_KLASSE.map((n) => Math.max(1, Math.round(n * anteil)))
}

/**
 * **Welche Zeichenmaschine unter der Seite liegt.**
 *
 * **Warum auf einer eigenen Fläche gemessen und nicht auf `#world`.** Der Zeichner der Welt entsteht
 * gleich danach; würde ich jetzt schon einen Kontext auf **derselben** Fläche holen, gäbe der Browser
 * bei jedem weiteren `getContext` **denselben** Kontext zurück — und die Attribute des ersten Aufrufs
 * (Kantenglättung!) blieben für immer stehen. Die Stufe wäre dann eine Absicht ohne Wirkung.
 *
 * **Und die Probe wird wieder freigegeben.** Browser begrenzen die Zahl gleichzeitiger
 * WebGL-Kontexte (Chromium: 16). Einen davon liegen zu lassen, weil „er ja nichts tut", ist genau die
 * Sorte Leck, die erst nach vielen Seitenwechseln auffällt.
 *
 * Der Rückfall ist **nicht** `gpu`: kann die Stufe nicht ermittelt werden, ist die vorsichtige Annahme
 * die integrierte Karte. Eine zu niedrige Stufe kostet ein paar Sterne; eine zu hohe kostet Bilder.
 *
 * @returns die Startstufe
 */
function geraetestufeErmitteln(): Geraetestufe {
  try {
    const probe = document.createElement('canvas')
    const gl = (probe.getContext('webgl2') ?? probe.getContext('webgl')) as WebGLRenderingContext | null
    const stufe = stufeFuerKontext(gl)
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return stufe
  } catch {
    return 'igpu'
  }
}

/**
 * **Sagen, auf welcher Stufe die Welt läuft — wenn sie reduziert ist.**
 *
 * Eine stille Reduktion ist von einem Fehler nicht zu unterscheiden: der Betreiber sieht weniger
 * Sterne und weiß nicht, ob das eine Entscheidung war oder ein Defekt. Deshalb steht es in der
 * Kopfzeile — an derselben Stelle wie Ebene und Abstand, und in derselben Sprache.
 *
 * @param stufe - die Stufe, die gerade gilt
 */
function zeigeGeraeteHinweis(stufe: Geraetestufe): void {
  const hinweis = document.getElementById('hudGeraet')
  if (!hinweis) return
  hinweis.textContent = stufe === 'kein-webgl' ? tr('geraet.keinWebgl') : tr('geraet.reduziert')
}
/** Eigener Takt fuer die Achsenanzeige — sie muss dem Drehen folgen, nicht der Statistik. */
let uiAt = lastFrame
/** Und ein ruhigerer fuer die Zahlen. */
let statsAt = lastFrame

/**
 * **Die Bezugsebene des letzten Bildes.**
 *
 * Nur beim **Wechsel** wird der Abstand nachgeführt. Ohne diese Marke würde die Kamera bei jedem Bild
 * gegen den Inhalt gerechnet — und wer innerhalb einer Ebene zoomt, käme nicht vom Fleck.
 */
let letzteEbene = levelForDistance(camera.distance)

/**
 * **Wurde der erste Blick schon gerahmt?**
 *
 * Der erste Bildlauf rahmt **immer**, auch ohne Ebenenwechsel — der gemerkte Abstand kann aus einer
 * früheren Fassung stammen und zu klein sein. Danach gilt die Regel „nur beim Wechsel".
 */
let erstGerähmt = false

function loop(now: number): void {
  const dt = Math.min(64, now - lastFrame)
  lastFrame = now

  /*
   * **Die Kamera richtet sich am Inhalt aus — aber nur, wenn sie abdriften würde.**
   *
   * Der Betreiber hat zweimal ein Bild gesehen, das „leer" wirkte: auf Ebene 7 stand die Kamera bei
   * 573 440 Einheiten, während der einzige Körper der Ebene einen Radius von 9000 hat — er füllte
   * **1,5 %** der Bildhöhe. `distanceForLevel` rechnet aus einer Zweierpotenz, nicht aus dem Inhalt.
   *
   * Deshalb wird der Abstand jetzt **beim Wechsel der Bezugsebene** auf den Inhalt gesetzt
   * (`view.idealDistance`). Und nur dann: wer innerhalb einer Ebene zoomt, soll frei zoomen können —
   * eine Kamera, die jede Handbewegung zurücksetzt, ist schlimmer als eine, die zu weit steht.
   *
   * Die Toleranz von 25 % verhindert genau das: erst wenn die Ansicht **deutlich** neben dem liegt,
   * was die Ebene zeigt, wird nachgeführt.
   */
  if (mode === 'os' && aufgebaut) {
    const ebene = levelForDistance(camera.distance)
    /*
     * **Beim ersten Bild gilt der Startblick — danach nur noch der Ebenenwechsel.**
     *
     * Zwei Dinge sind hier nacheinander falsch gewesen, und beide hat der Betreiber gesehen:
     *
     *   „sieht immer noch so beschissen aus" — die Welt lag als **kleiner Ring in der Mitte**, bei
     *   **280 fps**. Ursache: der gemerkte Abstand kam aus einer früheren Fassung und war zu gross.
     *
     *   „die Sonne hängt halb aus dem Bild" — Ursache: die erste Rahmung setzte **nur den Abstand**,
     *   die **Drehlage** blieb vom Startblick. Beide gehören zusammen: `openingView` setzt die Kamera
     *   so, dass der Fokus bei **diesem** Winkel mittig steht. Wird nur der Abstand geändert, wandert
     *   der Bildmittelpunkt.
     *
     * Deshalb kommt das erste Bild **ganz** aus `startCamera()` — Fokus, Abstand **und** Drehlage.
     * Danach gilt „nur beim Ebenenwechsel", und dort bleibt die Drehlage stehen, während die
     * Ausdehnung um den Fokus gerahmt wird.
     */
    const ersterBlick = !erstGerähmt
    if (ersterBlick) {
      erstGerähmt = true
      camera = startCamera()
      letzteEbene = levelForDistance(camera.distance)
      save()
    } else if (ebene !== letzteEbene) {
      letzteEbene = ebene
      /*
       * **Beim Zoomen rahmt der GRÖSSTE Körper der Ebene — nicht der nächstgelegene.**
       *
       * Hier stand `view.framing(ebene, camera.focus)`. Der Fokus ist beim Zoomen ein beliebiger Punkt,
       * und „der nächstgelegene Körper" ist dann oft ein **kleiner**: gemessen zog die Nachführung beim
       * Herauszoomen von 4 761 auf 23 740 **jedes Mal zurück auf 3 014**, weil sie einen Körper mit
       * Radius 100 fand. Der Betreiber sah das als „**es ist immer noch eine sonne obwohl ich ultra
       * weit weg bin**".
       *
       * Ohne Fokus gilt der **grösste** Körper der Ebene — und beim Herauszoomen wird daraus
       * Stern → Sternhaufen → Galaxie → Universum. **Das Grösste ist das Maximum.**
       *
       * **Und der Fokus folgt mit**, wenn er auf einem kleineren Körper stand: sonst schaut die Kamera
       * an dem vorbei, was sie rahmen soll. `framing(ebene)` liefert den Fokus des grössten Körpers.
       *
       * Der fokus-basierte Weg bleibt für das **Fokussieren** (`focusOn` beim Klick) — dort ist der
       * gewählte Körper genau der richtige Bezug.
       */
      /*
       * **Beim Ebenenwechsel wird NICHT mehr nachgeführt.**
       *
       * Hier stand ein `view.framing(ebene)`, das den Abstand auf den Inhalt der neuen Ebene setzte.
       * Die Absicht war gut — „zeig, was die Ebene zeigt" — und die Wirkung war ein **Kampf gegen das
       * Rad**. Gemessen (`tools/zoom-out.js`, echte Radereignisse):
       *
       *     Rad:  4 761 → 8 134 → 13 896 → 23 740        (der Nutzer zoomt heraus)
       *     Nachführung setzt: 1 550 → 3 014 → 3 014      (sie zieht zurück)
       *     Ergebnis: der Abstand bleibt bei 3 014 stehen
       *
       * Der Betreiber: „**es ist immer noch eine sonne obwohl ich ultra weit weg bin**". Und er hat
       * recht: **wer zoomt, will weiter weg — nicht auf eine Zahl zurückgeholt werden.**
       *
       * **Warum es so verlockend war.** Auf Ebene 1 ist das Bild leer (dort liegt nur die Sonde), und
       * die Nachführung schien die Lösung: sie füllte den Rahmen. Aber sie füllt ihn, indem sie dem
       * Nutzer die Kontrolle nimmt — und eine Kamera, die jede Handbewegung zurücksetzt, ist schlimmer
       * als eine, die zu weit steht (dieselbe Regel, die schon bei der Startansicht galt).
       *
       * **Was bleibt:** der Inhalt wird weiter aus dem **Inhalt** gerahmt — beim ersten Bild und beim
       * **Fokussieren** (Klick auf einen Körper, `focusOn`). Dort ist der Bezug gewählt, nicht zufällig.
       * Und `view.framing()` bleibt bestehen, damit Werkzeuge und Tests eine gute Stellung errechnen
       * können, ohne sie aufzuzwingen.
       */
      letzteEbene = ebene
    }
  }

  // **Die Zeit ist der fuenfte Freiheitsgrad.** Solange sie laeuft, aendert sich die Drehlage der
  // Welt — nicht durch Ziehen, sondern von selbst.
  if (universe5d.laeuft && mode === 'os') universe5d.time += (dt / 1000) * universe5d.tempo

  // **Und die Bahnen laufen in ihrer eigenen Zeit.** Sie hat mit der Drehlage nichts zu tun: die Welt
  // kann stehen, waehrend die Planeten ziehen — und umgekehrt.
  if (bahnen.laeuft && mode === 'os') bahnen.sekunden += (dt / 1000) * bahnen.tempo

  if (mode === 'os') {
    const width = screens.os.clientWidth
    const height = screens.os.clientHeight
    /*
     * **Der Himmel wird hier NICHT mehr bewegt.**
     *
     * Bis zum 16.10.2026 stand an dieser Stelle die Rechnung für die Plattkarte: `himmelVersatz` und
     * `blickvektor` aus `sky.ts`, geschrieben in zwei CSS-Variablen — **je Bild**. Gemessen kostete
     * allein das Schreiben 58,8 ms (Stilberechnung über 4 053 Knoten) gegen 0,09 ms für das
     * Verschieben einer Ebene; und weil die Kosten an der Zahl der **Knoten** hingen, wurde es beim
     * Rauszoomen **nicht** billiger („wenn man ganz raus zoomt ist es immer noch stock, also kein
     * change").
     *
     * Jetzt gibt es hier **nichts** zu tun: die Sterne sind Punkte in Weltkoordinaten
     * (`stars.ts`), und die Kamera fährt daran vorbei. Die Bewegung des Himmels entsteht in der
     * Zeichnung selbst — es ist die Perspektive, keine Animation. Was der Bildtakt noch beiträgt, ist
     * ein `uniform` in der Szene (die Punktgröße, `scene.ts`).
     */
    view.render(
      camera,
      width,
      height,
      Math.min(window.devicePixelRatio || 1, 2),
      universeRotation(),
      bahnen.sekunden,
    )

    // Die Anzeigen mitschreiben — nicht jeden Frame, sonst flackern die Zahlen.
    frames += 1
    if (now - fpsAt > 500) {
      fps = Math.round((frames * 1000) / (now - fpsAt))
      frames = 0
      fpsAt = now
    }
    /*
     * ══ DIE GERÄTESTUFE — GEMESSEN, NICHT GERATEN ══════════════════════════════════════════════════
     *
     * Der Betreiber: *„noch nebenbei sollte es auch IGPU und CPU supporten"*. Der **Name** des
     * Zeichners (`gpu.ts`, `stufeFuerKontext`) sagt, woher die Maschine kommt; ob sie **reicht**, sagt
     * nur die Zeit. Deshalb wird hier gemessen: die Dauer eines Bildes, und wenn ihr Mittelwert über
     * dem Budget liegt, fällt die Stufe — und mit ihr die **Zahl der Sterne** (der eine Regler, der
     * sich dosieren läßt, ohne daß das Bild aufhört, ein Himmel zu sein).
     *
     * **Warum erst nach zwei Sekunden und nur einmal.** Die ersten Bilder tragen den Aufbau (Katalog
     * erzeugen, Punkte hochladen, Panels bauen); aus ihnen eine Gerätestufe abzuleiten hieße, den
     * Aufwand mit der Leistung zu verwechseln. Und ein Regler, der bei jedem langsamen Bild nachzieht,
     * würde die Sterne **flackern** lassen: einmal entschieden, dann Ruhe.
     */
    bildZeiten.push(now - letzteBildZeit)
    letzteBildZeit = now
    if (!stufeEntschieden && now - startZeit > 2000 && bildZeiten.length > 30) {
      stufeEntschieden = true
      const neu = stufeAusBildzeiten(bildZeiten, aktiveStufe)
      if (neu !== aktiveStufe) {
        aktiveStufe = neu
        /*
         * **Die Sterne werden neu gelegt — mit weniger Punkten.**
         *
         * Ein kleineres Feld ist die ehrlichste Antwort auf eine langsame Maschine: dasselbe Bild,
         * weniger Punkte. Was **nicht** passiert: die Körper verschwinden oder das Bild bleibt stehen.
         */
        view.setzeSterne(
          sterne(sternKatalog(aktiveStufe), camera.distance * 0.8, camera.distance * 25, camera.focus),
          grenzeFuerEbene(levelForDistance(camera.distance)),
        )
        view.sterneSichtbar(universeView() !== 'none')
        sterneGelegtFuer = levelForDistance(camera.distance)
        // **Und es wird gesagt.** Eine stille Reduktion wäre von einem Fehler nicht zu unterscheiden.
        zeigeGeraeteHinweis(aktiveStufe)
      }
    }
    // **Anzeigen seltener aktualisieren als drehen.** Vorher hing die Achsenanzeige am
    // Halbsekundentakt der Zahlen — sie ruckelte im Rhythmus der Statistik, obwohl das Drehen
    // fluessig war. Jetzt hat sie ihren eigenen, schnelleren Takt, und die Zahlen bleiben ruhig:
    // zwei Dinge, zwei Takte.
    if (now - uiAt > 120) {
      uiAt = now
      updateAxes()
    }
    if (now - statsAt > 700) {
      statsAt = now
      updateReadouts()
    }
    /*
     * **Und bei einem Ebenenwechsel SOFORT — sonst hinkt die Kopfzeile dem Zoom nach.**
     *
     * Betreiber: „**ebene ist eine erleichterung der zoom sollte es natuerlich sein also keine ebene
     * direkt change oder so ansonsten fuehl es sich nach ruckeln**".
     *
     * Der 700-ms-Takt ist Absicht: er hält die **Bildrate** ruhig („die fps zahlen sollte eigentlich
     * einzeln aktualisieren"). Aber er gilt auch für den **Ebenennamen** — und der ist keine Messung,
     * sondern eine **Aussage über den Zustand**. Gemessen (`tools/_einheit.ts`): nach
     * `setzeEbene(1…7)` stand in der Kopfzeile weiter „Ebene Sonnensystem", und erst die achte zeigte
     * die richtige. **Die Anzeige lief dem Zoom bis zu 700 ms hinterher** — und genau das sieht aus wie
     * ein Ruckler, obwohl die Kamera stetig fährt.
     *
     * Deshalb: ändert sich die **Ebene**, wird sofort geschrieben. Die Bildrate bleibt im 700-ms-Takt.
     * `updateReadouts` schreibt ohnehin nur, was sich ändert — der zusätzliche Aufruf kostet nichts.
     */
    const jetzigeEbene = levelForDistance(camera.distance)
    if (jetzigeEbene !== gezeigteEbene) {
      gezeigteEbene = jetzigeEbene
      updateReadouts()
      /*
       * **Und der Himmel zieht SOFORT nach.**
       *
       * Die Grenzhelligkeit der Sterne hing zuerst am 700-ms-Takt der Anzeigen — gemessen: beim
       * Sprung auf Ebene 8 blieben die schwachen Klassen bis zu **700 ms** stehen, und der Himmel
       * „leerte" sich erst danach. Das sieht aus wie ein Fehler, weil der Zoom längst weiter ist.
       *
       * Seit der Hintergrund nur noch **Dunst** ist (die Sterne liegen in der eigenen Schicht, siehe
       * `sky.ts`), kostet der Neuaufbau nichts mehr: sechs Verläufe statt 900 Kreise. Deshalb steht
       * der Aufruf jetzt hier, wo die Ebene sich ändert — und nicht im langsamen Takt.
       */
      applyStarfield(true)
    }
  }
  requestAnimationFrame(loop)
}

/** Die Bezugsebene, die zuletzt in der Kopfzeile stand — siehe den Sofort-Aufruf in der Schleife. */
let gezeigteEbene: Level = levelForDistance(camera.distance)

/**
 * Die Kopfzeile — **eine** Zeile, wie in der Vorlage (`hud small`).
 *
 * Dort steht, was man am Rand abliest: welche Bezugsebene, wie viele Objekte, welcher Abstand, welche
 * Bildrate. Alles andere ist die Insel.
 */
function updateReadouts(): void {
  const level = LEVELS.find((l) => l.level === levelForDistance(camera.distance))
  /*
   * **Drei Felder statt einer Zeile — damit sich nur ändert, was sich ändert.**
   *
   * Der Betreiber: „**die fps zahlen sollte eigentlich einzeln aktualisieren ohne den text**". Vorher
   * stand hier **ein** Übersetzungsschlüssel für die ganze Zeile (`hud.summary`), der alle 700 ms den
   * **ganzen** Text neu setzte: bei jeder Änderung der Bildrate wurde auch „Ebene Sonnensystem · 4,8 k"
   * neu geschrieben. Derselbe Text mit demselben Inhalt — aber ein neuer Knoteninhalt, und der Browser
   * setzt die Zeile neu.
   *
   * Jetzt sind es drei Felder, und jedes wird **nur bei Änderung** geschrieben (`setText` vergleicht).
   * Die Bildrate bekommt zusätzlich eine **feste Breite** in der Stilvorlage (`tabular-nums`, 3
   * Zeichen), damit die Zeile beim Wechsel von 60 auf 280 fps nicht springt — eine zappelnde Zahl ist
   * genau das, was „einzeln aktualisieren" vermeiden soll.
   */
  const ebene = tr('hud.level', { level: level?.label ?? '—' })
  /*
   * **Die Anzeige trägt jetzt eine ECHTE Einheit statt „Einheiten".**
   *
   * Betreiber: „**ändere masseinheit also einheit in lichtjahre oder so**".
   *
   * Davor stand hier `formatDistance(camera.distance)` — „· 4,8 k". Eine Zahl ohne Einheit, und die
   * Einheit wäre auch nicht zu retten: die Welt ist **gestaucht** (Abstände rund 7-mal enger, Größen
   * rund 7,5-mal zu gross, siehe `realSize` in `universe.ts`). Ein Umrechnungsfaktor existiert
   * damit nicht, und ein erfundener wäre schlimmer als keiner.
   *
   * Stattdessen steht die **echte Größe der Bezugsebene** da — die Zahlen, die der Betreiber selbst
   * genannt hat: „Welteninsel · 100 000 Lj". Der Zoomabstand folgt dahinter, weil er die **Kamera**
   * beschreibt und dafür die richtige Angabe ist.
   */
  const groesse = tr('hud.size', { size: realSize(level?.level ?? 1, locales.locale !== 'en') })
  const abstand = tr('hud.distance', { distance: formatDistance(camera.distance) })
  /*
   * **Kein Auffüllen im Text.**
   *
   * Hier stand `\`${fps}\`.padStart(3, ' ')`, damit die Zeile beim Wechsel der Bildrate nicht springt.
   * Gebaut war es falsch: bei zweistelligen Werten entstand ein **doppeltes Leerzeichen** — im Bild des
   * Betreibers stand „·  60 fps", und er hat zu Recht gefragt, was da oben links los ist.
   *
   * Eine feste Breite gehört in die **Stilvorlage**, nicht in den Text: `#hudFps` hat `min-width` und
   * `tabular-nums`, damit die Ziffern untereinander stehen. Der Text ist dann einfach „60 fps".
   */
  const rate = tr('hud.fps', { fps })
  setText('#hudLevel', ebene)
  setText('#hudEcht', groesse)
  setText('#hudDist', abstand)
  setText('#hudFps', rate)
  /*
   * **Und der Himmel folgt der Ebene — aber NACH den Textfeldern.**
   *
   * Betreiber: „**ebene ist eine erleichterung der zoom sollte es natuerlich sein**". Hier stand
   * `applyStarfield()` **vor** `setText`. Das war eine Reihenfolge mit Folge: `applyStarfield` baut bei
   * einem Ebenenwechsel ein neues Sternenfeld aus rund **900 Kreisen** als Data-URL — und alles, was
   * danach kommt, wartet darauf. Gemessen (`tools/_einheit.ts`): die Kopfzeile zeigte nach
   * `setzeEbene(1)` bis `setzeEbene(8)` **„Ebene Sonnensystem · 80 AE"** und erst ab 9 die richtige
   * Ebene — die **Anzeige hinkte dem Zoom um mehrere Stufen nach**.
   *
   * Mit dieser Reihenfolge steht der Text **zuerst** im DOM, und die Arbeit am Sternenfeld kommt
   * danach. Der Effekt derselbe, die Anzeige aber im Takt der Kamera.
   */
  applyStarfield()
  /*
   * **Die Ansichts-Leiste liest den Abstand — hier, wo er schon gelesen wird.**
   *
   * Sie schreibt nur bei Änderung (`write` in `view-controls.ts`), also kostet der Aufruf nichts und
   * die Zahl zappelt nicht. Sie hier zu aktualisieren und nicht in der Schleife hält beide Anzeigen
   * **im selben Takt**: Kopfzeile und Leiste zeigen nie verschiedene Abstände.
   */
  viewControls.update(camera.distance)
  setText('#rLevel', level ? `${level.label} (${level.item})` : '—')
  /*
   * **Auch hier die ECHTE Größe statt der abstrakten Einheit.**
   *
   * Betreiber: „**ändere masseinheit also einheit in lichtjahre oder so**". Die Kopfzeile trägt sie
   * schon (`welteninsel · 100 000 Lj`), dieses Panel trug noch `3.1 k`. Zwei Anzeigen für dieselbe
   * Sache dürfen nicht zwei Sprachen sprechen — und die Herleitung steht bei `realSize` in
   * `universe.ts`: der Zoomabstand lässt sich **nicht** ehrlich in Lichtjahre umrechnen, die **Ebene**
   * hat aber eine echte Grösse.
   */
  const groesseR = level ? realSize(level.level, locales.locale !== 'en') : '—'
  setText('#rDist', `${formatDistance(camera.distance)} · ${groesseR}`)
  /*
   * **Und die Koordinaten — drei Achsen, in Welteneinheiten.**
   *
   * Betreiber: „**es fehlt nur noch corinaten position system implementieren**". Es war schon da
   * (`camera.focus` als `x · y · z`), nur nicht sichtbar — alle Panels starten abgesteckt. Gemessen
   * (`tools/_koord.ts`): `rFocus = "94396 · 1862 · 108650"`, und die Zeile belegt zugleich die
   * Raumberechnung — der Fokus liegt rund **144 000** vom Ursprung, genau die Grössenordnung des
   * weitesten Körpers (145 236).
   *
   * **Warum das erst jetzt auffällt.** Eine Anzeige, die niemand öffnet, ist von einer fehlenden nicht
   * zu unterscheiden. Genau das ist der Fall, den der Betreiber mit „es fehlt nur noch" beschreibt.
   */
  setText('#rFocus', camera.focus.map((n) => Math.round(n).toLocaleString('de-DE')).join(' · '))
  setText('#sMode', mode === 'os' ? tr('island.action.world') : tr('island.action.chat'))
  setText('#sFps', `${fps} fps`)

  const chips = document.getElementById('chips')
  if (chips) {
    chips.replaceChildren()
    for (const name of collectVisible(levelForDistance(camera.distance))) {
      const chip = document.createElement('span')
      chip.className = 'chip'
      chip.textContent = name
      chips.appendChild(chip)
    }
  }
}

function collectVisible(level: number): readonly string[] {
  const names: string[] = []
  const walk = (body: { level: number; name: string; children?: readonly unknown[] }): void => {
    if (body.level === level) {
      names.push(body.name)
      return
    }
    for (const child of (body.children ?? []) as readonly typeof body[]) walk(child)
  }
  walk(universe)
  return names
}

function setText(selector: string, value: string): void {
  const el = document.querySelector(selector)
  if (el) el.textContent = value
}

function formatDistance(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} k`
  return value.toFixed(1)
}

function must<T extends Element>(selector: string, within: ParentNode = document): T {
  const el = within.querySelector<T>(selector)
  if (!el) throw new Error(`Element ${selector} fehlt`)
  return el
}

/** Zieht eine Zahl in einen Bereich — fuer Werte, die aus dem Speicher kommen koennen. */
function clampZahl(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

// ── Der Start ────────────────────────────────────────────────────────────────────────────
//
// **Die Reihenfolge ist keine Kleinigkeit, und sie hat schon einmal weh getan.** Beim ersten Anlauf
// stand die Sprachwahl hier oben, **bevor** die Sprach-Plugins eingetragen waren: `Locales.set()`
// kannte kein Paket, `Settings.set()` keine Beschreibung — zwei stille Fehlschlaege. Und der
// `onSwitch`-Rueckruf der Plugins rief `relabel()`, das auf `dock` zugriff, bevor es existierte —
// ein `ReferenceError` beim Laden, der das Bild **leer** liess.
//
// Deshalb steht jetzt alles, was von der Oberflaeche abhaengt, **hier unten**: erst die Welt aus den
// Einstellungen, dann die Anzeige, dann das Beschriften. Die Sprachwahl selbst hat
// `registerLocalePlugins` schon getroffen — sie brauchte dafuer nur die Pakete.

// 1. Die Welt aus den Einstellungen. **Vor** dem ersten Bild, nicht danach: sonst zeigt der erste
// Frame die Vorgaben und wechselt einen Wimpernschlag spaeter auf die gespeicherten Werte.
universe5d.dimension = worldDimensions()
universe5d.laeuft = settings.getBoolean('universe.rolling', true)
universe5d.tempo = settings.getNumber('universe.rollSpeed', 0.045)
bahnen.laeuft = settings.getBoolean('universe.orbits', true)
bahnen.tempo = settings.getNumber('universe.orbitSpeed', 1)

// 2. Die Anzeige aus den Einstellungen.
hud.classList.toggle('hidden', !settings.getBoolean('interface.hud', true))
applyStarfield(true)

/*
 * **Die Ansicht: erst der Ankunftswunsch, dann die Einstellung, dann der Kamera-Speicher.**
 *
 * Die Einstellung ist die **ausdrueckliche** Wahl, der Speicher nur die letzte Lage — das stand hier
 * schon. Der **Ankunftswunsch** (`takeArrival`, `entry.ts`) schlaegt beide: wer im Chat auf die
 * Marke drueckt, will die **Welt** sehen. Stand in diesem Browser zuletzt `chat`, kam bisher genau
 * der Platzhalter — der Befund des Betreibers vom 14.10.2026.
 *
 * **Und `alsAnsicht` statt eines Vergleichs mit `'chat'`.** Hier stand
 * `… === 'chat' ? 'chat' : 'os'`; das verschluckte `web` **still** — wer die Vorlagen-Ansicht
 * eingestellt hatte, fand nach dem Neuladen die Welt. Dieselbe Falle, die `alsAnsicht` in `camera.ts`
 * schon einmal behandelt hat (dort fuer den Kamera-Speicher).
 *
 * **Warum der Wunsch aus dem Speicher kommt und nicht aus der Adresse.** Er stand früher als
 * `?ansicht=os` in der Zeile — sichtbar für jeden, und der Betreiber: *„der link ist nur zu lange so
 * lol"*. Mit **einem** Port teilen sich Chat und Welt denselben `localStorage`; `takeArrival` liest
 * den Wunsch und **nimmt ihn weg** (einmalig, sonst sähe ein Reload wie ein vergessener Klick aus).
 */
const ankunft = takeArrival(globalThis.localStorage)
mode = waehleAnsicht(ankunft, settings.getString('interface.mode', mode))

/**
 * 3. **Jetzt ist die Oberflaeche da.**
 *
 * Ab dieser Zeile darf `relabel()` arbeiten: die Marke gibt den Rueckruf der Sprach-Plugins frei,
 * und der Aufruf darunter beschriftet alles mit der Sprache, die beim Eintragen gewaehlt wurde.
 */
aufgebaut = true
relabel()

setMode(mode)

/*
 * **Und der Ankunftswunsch wird zur Wahl — er war keine Laune.**
 *
 * `setMode` hat schon umgeblendet; hier wird nur noch festgehalten, was der Umschalter verlangt hat.
 * Ohne diese Zeile stuende nach einem **Neuladen** wieder die alte Ansicht da (der Wunsch ist beim
 * Lesen verbraucht), und der Wechsel saehe aus, als haette er nicht stattgefunden — derselbe Fehler,
 * den die Insel-Eintraege hatten (siehe `view-switch.ts`).
 *
 * **Nicht mit `wechsleAnsicht`**, weil das `setMode` ein zweites Mal riefe: die Anzeige ist schon
 * richtig, es fehlt nur der Eintrag in den Einstellungen.
 */
if (ankunft !== undefined) wechsel.merke(ankunft)

// **Die Oberflaeche ist aufgebaut.** Das ist die Marke, die `tests/boot.test.ts` misst.
//
// **Warum hier und nicht ganz am Ende.** Der letzte Schritt ist die Welt, und die braucht WebGL —
// in einem Test ohne Grafikkarte scheitert sie immer. Eine Marke *danach* waere also nie erreichbar
// und damit wertlos. Die Marke steht deshalb genau dort, wo der Fehler saß, der das Bild leer
// liess: **nach dem Aufbau der Oberflaeche** (Insel, HUD, Panels, Chat, Ereignisse) und **vor** der
// Grafik. Wer wissen will, ob das Zeichnen laeuft, braucht einen Browser — das ist eine andere
// Frage, und `opening-view.test.ts` beantwortet sie rechnerisch.
Object.defineProperty(globalThis, '__prometheusGestartet__', {
  value: true,
  configurable: true,
  writable: true,
})

// 4. **Zuletzt die Welt.** Ihr Bau ist der einzige Schritt, der eine Grafikkarte braucht.
const view = new UniverseView(canvas, labelLayer, universe, aktiveStufe)

/*
 * **Und was passiert, wenn die Grafikkarte weggenommen wird.**
 *
 * Der Browser entzieht einer Seite den WebGL-Kontext (zu lange gebraucht, Treiber abgestürzt,
 * Ruhezustand, zu viele offene Kontexte). Ohne Meldung bleibt ein **schwarzes Bild** stehen — und der
 * Betreiber sucht den Fehler in der Welt, die in Ordnung ist. Hier wird es gesagt: in der Kopfzeile,
 * in seiner Sprache.
 */
view.ctxVerlust = () => {
  const hinweis = document.getElementById('hudGeraet')
  if (hinweis) hinweis.textContent = tr('geraet.kontextVerloren')
}
  /*
   * **Und wenn die Maschine von Anfang an nicht die volle Stufe ist, wird es sofort gesagt.**
   *
   * Der erste Anlauf meldete eine Reduktion nur, wenn sie **im Lauf** entstand (der Regler nach den
   * ersten Bildern). Steht die Stufe aber schon beim Start auf `cpu` — Software-Rasterung, blockierter
   * Treiber, alte integrierte Karte —, ist der Katalog von Anfang an kleiner. Ohne Meldung sieht der
   * Betreiber weniger Sterne und hält es für einen Fehler. Gemessen im kopflosen Lauf mit SwiftShader:
   * der Zeichner war SwiftShader, die Kopfzeile sagte **nichts**.
   */
  if (aktiveStufe !== 'gpu') zeigeGeraeteHinweis(aktiveStufe)

/**
 * **Die Objektfläche — Dateien, die man hineinlegt und verschiebt.**
 *
 * Betreiber: „**also objecte aka datei möglichkeit drag and drop genauso später zb in eine art
 * workspaces definieren zu was es gehört also kann man und daraus die möglichkeit geben das der harness
 * Prometheus diese datei sieht**".
 *
 * Das ist **Stufe 1** von dreien (`canvas-objects.ts` erklärt die Reihenfolge): ablegen und
 * verschieben. Die Zuordnung zu einem Workspace und die Schnittstelle zum Wirt kommen später.
 *
 * **Sie hängt an `screens.os`, nicht am Dock.** Die Objekte gehören zur **Welt**, nicht zu einem Panel:
 * wer eine Datei ablegt, legt sie in den Raum — nicht in ein Fenster. Und `screens.os` ist die Fläche,
 * die den Zoom trägt; die Karten liegen in **Bildpunkten** darüber und bleiben davon unberührt.
 */
const canvasObjects = new CanvasObjects(screens.os, room, { tr: (key) => tr(key) })

/**
 * **Und ein Griff darauf — fuer den Messstand.**
 *
 * `window.__prometheusCanvas` legt Anzahl und Lage offen, damit `tools/objects.js` **messen** kann,
 * statt zu raten: ob eine abgelegte Datei wirklich liegen bleibt, ob sie sich bewegen laesst und ob
 * sie einen Neustart ueberlebt. Dieselbe Bauart wie `__prometheusDock` — und derselbe Grund: eine
 * Messung, die ihre eigene Regel mitbringt, kann den Code nicht widerlegen.
 *
 * **Nur lesen und ablegen.** Ein `remove` und ein `clear` gibt es auch, aber kein „setze die Lage von
 * Hand" — die Lage entsteht durch **Ziehen**, und ein Werkzeug, das sie direkt schreibt, pruefte das
 * Ziehen nicht.
 */
declare global {
  interface Window {
    __prometheusCanvas?: {
      readonly anzahl: () => number
      readonly objekte: () => readonly { readonly id: string; readonly name: string; readonly x: number; readonly y: number }[]
      readonly ablegen: (name: string, groesse: number, x: number, y: number) => void
      /** **Was liegt an dieser Stelle?** — die Frage, die `objectAt` beantwortet. */
      readonly anStelle: (x: number, y: number) => string | null
      readonly leeren: () => void
    }
  }
}

window.__prometheusCanvas = {
  anzahl: () => canvasObjects.anzahl,
  objekte: () => canvasObjects.getLayout().objects.map((o) => ({ id: o.id, name: o.name, x: o.x, y: o.y })),
  ablegen: (name, groesse, x, y) =>
    void canvasObjects.add(name, groesse, x, y, { b: screens.os.clientWidth, h: screens.os.clientHeight }),
  anStelle: (x, y) => canvasObjects.at(x, y)?.name ?? null,
  leeren: () => canvasObjects.clear(),
}

/*
 * **Und die Himmelskoerper — beim Start aus, wenn die Einstellung aus ist.**
 *
 * Der Betreiber: „**entferne mal alle anzeige im Universe, nur logic schnittstelle behalten. also ich
 * meinte den planeten galaxien ect**" und „**nix einfach leer lassen :D**".
 *
 * **Warum der Aufruf HIER steht und nicht oben bei den Einstellungen.** Dort stand er zuerst — und
 * `view` wird erst in dieser Zeile gebaut: der Start starb mit „Cannot access 'view' before
 * initialization", und drei Tests haben es gemeldet („der Startweg wurde nicht erreicht"). Dieselbe
 * Klasse Fehler wie beim `dock` und beim `let himmelEbene`: **was die Oberflaeche baut, darf erst nach
 * dem Aufbau angefasst werden.**
 *
 * Ohne diese Zeile wuerde der erste Aufbau die Koerper zeichnen — das Bild waere erst nach der ersten
 * Einstellungsaenderung leer.
 */
view.setDrawing(universeView() === 'all')

/*
 * ══ DAS STERNENFELD — ERZEUGT UND HOCHGELADEN ═══════════════════════════════════════════════════
 *
 * **Einmal, nicht je Bild.** 30 000 Sterne werden hier gerechnet, in Zahlenreihen gelegt und an die
 * Szene gegeben. Danach zeichnet die Grafikkarte sie in **sechs** Zeichenaufrufen (eine Punktwolke je
 * Helligkeitsklasse) — und der Bildtakt hat mit ihnen **nichts** mehr zu tun.
 *
 * **Der Maßstab kommt aus dem Modell, nicht aus dieser Zeile.** Die Radien liegen zwischen der
 * kleinsten und der größten Bezugsebene (`MIN_DISTANCE` … `MAX_DISTANCE`, `camera.ts`) — dieselben
 * Grenzen, die auch die Kamera nicht verläßt. Stünden hier zwei eigene Zahlen, wären es zwei
 * Wahrheiten über denselben Raum, und die zweite driftet beim nächsten Umbau.
 *
 * **Warum der Aufruf HIER steht und nicht oben bei den Einstellungen.** `view` entsteht erst wenige
 * Zeilen darüber; ein Zugriff früher starb mit „Cannot access 'view' before initialization" und
 * hinterließ ein **leeres Bild**. Dieselbe Fehlerklasse wie bei `dock` und `interface.labels`:
 * **was die Oberfläche baut, darf erst nach dem Aufbau angefaßt werden.**
 */
view.setzeSterne(
  sterne(sternKatalog(aktiveStufe), camera.distance * 0.8, camera.distance * 25, camera.focus),
  grenzeFuerEbene(levelForDistance(camera.distance)),
)
sterneGelegtFuer = levelForDistance(camera.distance)
view.sterneSichtbar(universeView() !== 'none')

// Und die **Vorlage** (`apps/web`) bekommt ihre eingeklappte Pille. Die Flaeche entsteht beim Klick —
// genau wie in der Vorlage, die mit `defaultOpen = false` startet.
islWeb.appendChild(miniPille())

requestAnimationFrame(loop)

// Der Chat meldet neue Nachrichten ueber die Rueckgabefunktion. Ohne Harness gibt es keine fremde
// Quelle, also bleibt sie hier bereitliegen — der Anschluss ist ein eigener Schritt.
void appendMessage
