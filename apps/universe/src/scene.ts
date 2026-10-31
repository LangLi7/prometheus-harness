/**
 * Die 3D-Welt: Objekte, Bahnen, Licht, Beschriftungen.
 *
 * **three.js uebernimmt die Projektion.** Das ist die Entscheidung des Betreibers und der
 * Grund, warum hier kein selbstgerechnetes `worldToScreen` steht: Perspektive, Tiefenpuffer,
 * Kamera-Hierarchie und Beleuchtung sind fertig und erprobt. Die Rechnung, die wir selbst
 * behalten, ist die **Auswahl**: welche Ebene gerade ein Punkt ist und welche ein
 * Bezugssystem (siehe `universe.ts` und `camera.ts`).
 *
 * **Was in der zweiten Fassung anders ist — drei Fehler der ersten:**
 *
 *  1. **Ein Sternenfeld in 3D war ein Fehler.** Die Sterne lagen auf einer Kugelschale in der
 *     Welt; bei mittlerem Zoom fielen sie alle in einen **weissen Klumpen** in der Mitte.
 *     Jetzt sind sie ein Hintergrund **ohne Tiefe** (in `app.css`): sie drehen sich nicht mit
 *     und liegen nie im Weg.
 *  2. **Licht fehlte.** Alle Koerper hatten ein Grundmaterial, das Licht ignoriert — flach
 *     wie Aufkleber, und ein Stern, der nichts beleuchtet, ist kein Stern. Jetzt hat jedes
 *     Sonnensystem ein Punktlicht in seinem Zentrum.
 *  3. **Beschriftungen waren alle gleich gross.** Bei mehreren sichtbaren Objekten schoben sie
 *     sich zu einem Textbrei uebereinander. Jetzt richtet sich die Groesse nach der Tiefe.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  Mesh,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { AdditiveBlending, CanvasTexture, NormalBlending } from 'three'
import { mitAdditiv, mitKantenglaettung, energieVorliebe } from './gpu'
import type { Geraetestufe } from './gpu'
import type { Stern } from './stars'
import { STERN_KLASSEN } from './stars'
import type { Body, Level } from './universe'
import { EBENEN_MAX, cameraPosition, distanceForLevel, framingDistance, levelForDistance } from './camera'
import type { CameraState } from './camera'
import {
  SPHERE,
  buildPlanet,
  buildStar,
  buildTrail,
  fillLight,
  lightReach,
  surfaceMaterial,
  svgTexture,
  updateTrail,
} from './lighting'
import { aggregateSvg } from './bodies'
import { chooseLabels } from './labels'
import type { Quat } from './rotation'

/** Ein Objekt in Weltkoordinaten, mit seiner Rolle auf der aktuellen Bezugsebene. */
export interface Placed {
  readonly body: Body
  readonly world: readonly [number, number, number]
  readonly path: readonly string[]
  /**
   * `sun`    = Zentrum eines Systems, leuchtet (Stern)
   * `planet` = Koerper in einer Bahn (Workspace, Datei)
   * `node`   = Zusammenfassung einer Gruppe (Sternhaufen, Galaxie, Filament)
   */
  readonly kind: 'sun' | 'planet' | 'node'
  /**
   * **Wie tief unter dem Systemkern** dieser Koerper haengt: 0 = direkt, 1 = Mond, 2 = Sonde.
   *
   * **Wozu das gebraucht wird.** Ein Koerper mit `depth > 0` kreist **nicht** um den Stern, sondern
   * um seinen Elternteil — und der bewegt sich. Ohne diese Angabe liefe der Mond weiter um die
   * Sonne (der Fehler, den der Betreiber gesehen hat).
   */
  readonly depth: number
  /** Die Kennung des Elternteils — `undefined` beim direkten Kind des Kerns. */
  readonly parentId?: string
  /**
   * Der **lokale** Bahnradius: der Abstand zum Elternteil, nicht zum Stern.
   *
   * Bei einem Planeten ist das derselbe Wert wie in `SolarSystem.orbits`. Bei einem Mond ist er der
   * **einzige** richtige Radius — der Abstand zur Sonne waere bei ihm voellig bedeutungslos.
   */
  readonly localOrbit: number
}

/** Ein Sonnensystem, das als Ganzes geisDrawing wird — sein Stern plus seine Planeten. */
export interface SolarSystem {
  readonly star: Placed
  readonly planets: readonly Placed[]
  /** Bahnradius je Planet, in derselben Reihenfolge wie `planets`. */
  readonly orbits: readonly number[]
}

export interface BuiltScene {
  readonly level: Level
  /** Einzelne Koerper: Sterne, Planeten und Gruppenzusammenfassungen. */
  readonly placed: readonly Placed[]
  /** Sonnensysteme, die als Ganzes mit Bahnen geisDrawing werden. */
  readonly systems: readonly SolarSystem[]
  /**
   * **Alle** beschrifteten Koerper — Placed **und** die Planeten aus den Systemen.
   *
   * Eigene Liste, weil die Planeten in `systems` liegen und nicht in `placed`. Ohne sie
   * blieben ihre Beschriftungen beim Wechsel der Bezugsebene stehen, und der Text stuende
   * ueber einer anderen Welt.
   */
  readonly labeled: readonly Placed[]
  /**
   * **Der nächste Stern, wenn auf dieser Ebene keiner steht** — sonst `null`.
   *
   * **Warum das nötig ist, und wie es gemessen wurde.** `buildScene` liefert auf den Ebenen **1–3
   * kein einziges System**:
   *
   *     Ebene 1 | Systeme: —   | als sun markiert: KEINE
   *     Ebene 2 | Systeme: —   | als sun markiert: KEINE
   *     Ebene 3 | Systeme: —   | als sun markiert: KEINE
   *     Ebene 4 | Systeme: Sonnensystem(11) | als sun markiert: Sonnensystem
   *
   * Ein System entsteht nur, wenn ein Körper **genau** auf der gesuchten Ebene liegt **und**
   * `system === true` hat — das ist „Sonnensystem" auf Ebene 4. Zoomt man hinein, verschwindet das
   * System und mit ihm **der Stern**: kein Licht, keine Sonne im Bild, und die Planeten standen als
   * nackte Punkte in der Dunkelheit. Zu sehen war genau das — ein fast schwarzes Bild mit sieben
   * Punkten und **ohne einen einzigen Namen** (die Sonne war ja nicht da, und die Planeten liegen
   * unter der Namensgrenze).
   *
   * Der Stern ist der **Anker** eines Systems: er beleuchtet es, und er ist der Punkt, um den
   * alles kreist. Deshalb wird er auch dann geisDrawing, wenn die Ebene feiner ist als er selbst.
   */
  readonly anchor: Placed | null
  /**
   * Der **typische Körper dieser Ebene** (Median seiner Radien, 0 wenn es keinen gibt).
   *
   * Bezugsgrösse für die Untergrenze: `reference / SPREIZUNG`, gedeckelt beim grössten Körper und
   * bei einer harten Sichtgrenze in Pixeln. Siehe `SPREIZUNG`.
   */
  readonly reference: number
}

/**
 * Sammelt, was auf einer Bezugsebene zu sehen ist.
 *
 * Die Regel nutzt die Richtung der Ebenennummern (`universe.ts`: je **kleiner**, desto
 * **groesser** der Bezug):
 *
 *   - Ist die gesuchte Ebene **feiner** als ein Koerper, wird **in** ihn hineingesehen — das
 *     ist der Bezugswechsel, den der Betreiber „Fix Fokus" nennt.
 *   - Ein Koerper **genau** dieser Ebene **mit** passenden Kindern wird zum **Sonnensystem**:
 *     Stern in der Mitte, Kinder in Bahnen.
 *   - Ein Koerper ohne passende Kinder ist ein **Punkt**; liegt er in einem System, ein Planet.
 *
 * Positionen der Kinder sind **relativ** zum Elternobjekt — der Ursprung wird mitgefuehrt.
 * Wer das vergisst, springt bei der Suche ins Leere.
 */
export function buildScene(root: Body, level: Level): BuiltScene {
  const placed: Placed[] = []
  const systems: SolarSystem[] = []

  const walk = (
    body: Body,
    origin: readonly [number, number, number],
    path: readonly string[],
  ): void => {
    const world: [number, number, number] = [
      origin[0] + body.position[0],
      origin[1] + body.position[1],
      origin[2] + body.position[2],
    ]
    const children = body.children ?? []
    if (body.level === level) {
      // Ein Koerper **genau** dieser Ebene. Er ist das, was man auf dieser Ebene sieht.
      if (body.system !== true) {
        // Kein System: ein einzelner Koerper, auch wenn er Kinder hat. Eine Galaxie enthaelt
        // Sternhaufen, ist aber selbst kein Stern — sie bekommt **keinen** Glorienschein und
        // **keine** Bahnen.
        placed.push({ body, world, path, kind: 'node', depth: 0, localOrbit: 0 })
        return
      }
      // Ein System: **Stern** in der Mitte, alles darunter als Koerper.
      //
      // **Warum bis zum feinsten Kind gesammelt wird:** Ein erster Anlauf nahm nur solche
      // Kinder, deren Ebene **groesser oder gleich** der Systemebene war — und liess damit den
      // **Mond der Erde** durchfallen (Ebene 2, das System liegt auf 4). Er war deshalb auf
      // **keiner** Ebene zu sehen. Der Betreiber hat es nicht gesehen, weil er nicht wusste,
      // dass dort etwas fehlt; der Test hat es gefunden.
      //
      // **Der Bahnradius bleibt trotzdem bei 0** fuer Koerper, die **feiner** sind als die
      // Systemebene: ein Mond kreist in 70 Einheiten um eine Erde mit 12 Einheiten Radius. Ein
      // Ring darum waere im Bild ein Punkt auf der Erde. Der Koerper **ist** da und
      // beschriftet — die Bahn kommt, wenn man auf seine Ebene zoomt.
      const star: Placed = { body, world, path, kind: 'sun', depth: 0, localOrbit: 0 }
      placed.push(star)
      const planets: Placed[] = []
      const orbits: number[] = []

      const sammle = (
        kind: Body,
        kindUrsprung: readonly [number, number, number],
        kindPfad: readonly string[],
        tiefe: number,
        elternId: string | undefined,
      ): void => {
        const kindWelt: [number, number, number] = [
          kindUrsprung[0] + kind.position[0],
          kindUrsprung[1] + kind.position[1],
          kindUrsprung[2] + kind.position[2],
        ]
        // Der Bahnradius ist der **lokale** Abstand zum Elternkoerper. Im Schaustueck sind
        // Merkur und Neptun Geschwister der Sonne, und ihre Positionen sind relativ zur Sonne;
        // im Platzhalter-System sind die Dateien Geschwister des Kerns. Beidesmal ist der
        // lokale Abstand der richtige Radius.
        const entfernung = Math.hypot(kind.position[0], kind.position[2])
        planets.push({
          body: kind,
          world: kindWelt,
          path: kindPfad,
          kind: 'planet',
          depth: tiefe,
          ...(elternId === undefined ? {} : { parentId: elternId }),
          localOrbit: entfernung,
        })

        // **Nur die direkten Kinder bekommen einen Ring.** Ein Ring sagt „hier kreist dieser
        // Koerper **um den Stern**". Ein Mond kreist aber um seinen Planeten, nicht um den
        // Stern — sein Ring waere im Bild ein Punkt auf der Erde. Deshalb: Tiefe 0 = Ring,
        // Tiefe 1 oder mehr = kein Ring (der Koerper **ist** da und beschriftet).
        orbits.push(tiefe === 0 ? entfernung : 0)
        for (const enkel of kind.children ?? []) {
          sammle(enkel, kindWelt, [...kindPfad, kind.name], tiefe + 1, kind.id)
        }
      }

      // **Ursprung ist das erste Kind** — der Kern des Systems (im Schaustueck die Sonne, im
      // Platzhalter der Workspace-Kern). Alle uebrigen Kinder stehen **relativ zu ihm**,
      // deshalb muss von seiner Weltposition aus gerechnet werden und nicht von der des
      // Systems. Ein erster Anlauf nahm den Systemmittelpunkt — dann lagen alle Koerper auf
      // Bahnradius 0, weil die Positionen doppelt gezaehlt wurden.
      const kern = children[0] ?? body
      const kernWelt: [number, number, number] = [
        world[0] + kern.position[0],
        world[1] + kern.position[1],
        world[2] + kern.position[2],
      ]
      for (const child of children) sammle(child, kernWelt, [...path, body.name], 0, undefined)
      systems.push({ star, planets, orbits })
      return
    }

    if (body.level > level) {
      // Groeber als die gesuchte Ebene: **hineinsehen**. Das ist der Bezugswechsel.
      //
      // **Und bis zum feinsten Kind hinabsteigen.** Ein erster Anlauf blieb beim ersten
      // groeberen Kind stehen — dann war die **Sonde** (Ebene 1, unter dem Mond der Erde)
      // auf keiner Ebene zu sehen. Wer bis zum Mond hineinzoomt, muss auch die Sonde finden.
      for (const child of children) walk(child, world, [...path, body.name])
      return
    }

    // Feiner als die gesuchte Ebene: diese Groessenordnung existiert hier nicht (kein
    // Workspace unterhalb). Dann zeigt die Ebene den **naechstgroesseren** Koerper — besser
    // als eine leere Welt, und genau das, was auch ein Auge tut, wenn es naeher herangeht.
    placed.push({ body, world, path, kind: 'node', depth: 0, localOrbit: 0 })
  }

  walk(root, [0, 0, 0], [])
  /*
   * **Der Anker wird benannt.**
   *
   * Er bekommt sein Element über `labeled` — ohne das fehlt ihm **jede** Beschriftung, weil die
   * Szene ihre Elemente aus dieser Liste baut und die Auswahl (`chooseLabels`) nur liest, was schon
   * da ist. Im gemessenen Bild war die Sonne nach dem Anker-Einbau eine grosse Scheibe **ohne
   * Namen**, und kein Test hätte das gemeldet: die Tests prüfen die Auswahl (`labels.test.ts`) und
   * den Aufbau (`scene.test.ts`) getrennt, aber niemand prüfte, **ob der Stern überhaupt in der
   * Liste steht**.
   *
   * Er steht in `labeled`, aber **nicht** in `placed`: die Ebenen-Liste beschreibt, was auf dieser
   * Ebene liegt, und das ist der Stern nicht mehr, wenn man in sein System hineinsieht. Für den
   * Namen ist er trotzdem die wichtigste Aussage im Bild — er ist der Mittelpunkt.
   */
  const labeled = [...placed, ...systems.flatMap((system) => system.planets)]

  /*
   * **Den Anker suchen — aber nur, wenn ein System aufgeklappt ist und sein Stern fehlt.**
   *
   * **Der Betreiber hat den Fehler gesehen:** auf der Galaxie-Ebene stand in der Pille „Sonne".
   *
   *     Ebene 5:  projekt-stack(r671)  Sonnensystem(r100)      ← Zusammenfassungen
   *     Ebene 6:  prometheus(r1400)                            ← eine Zusammenfassung
   *     Ebene 7:  kosmischer Überblick(r9000)                  ← eine Zusammenfassung
   *
   * Die erste Fassung suchte den Anker, sobald **kein** System da war — und das ist auf diesen
   * Ebenen immer der Fall. Also wurde die Sonne geisDrawing, obwohl auf Ebene 7 nur **ein** Körper
   * steht: der Überblick mit 9000 Einheiten Radius. Die Sonne mit Radius 100 lag darin und
   * verschwand; geblieben ist ihr **Name** — eine Beschriftung für etwas, das man nicht sieht, an
   * einer Stelle, an der ein anderer Körper steht.
   *
   * **Die richtige Bedingung ist nicht „kein System", sondern „hier kreist etwas — und der Stern
   * fehlt".** Beides ist an den **Daten** ablesbar:
   *
   *   - Ein Körper in einer Bahn trägt `orbit > 0` (`universe.ts`). Der Kern trägt 0, eine
   *     Zusammenfassung trägt gar nichts — sie **ist** ein Punkt.
   *   - „Der Stern fehlt" heisst: kein Körper der geisDrawingen Menge hat `kind === 'Stern'`.
   *
   * Gemessen an den Ebenen:
   *
   *     Ebene 1:  Voyager, orbit 1412      → Anker Sonne   (die Sonde kreist um sie)
   *     Ebene 2:  acht Planeten            → Anker Sonne   (die Planeten kreisen um sie)
   *     Ebene 3:  Sonne **ist** geisDrawing → **kein** Anker, sonst stünde sie doppelt da
   *     Ebene 4:  vier Systeme             → Systeme tragen ihren Stern selbst
   *     Ebene 5–7: Zusammenfassungen       → kein Anker    (nichts kreist)
   *
   * **Was ich dabei falsch angenommen hatte, offen benannt.** Der erste Anlauf prüfte
   * `p.kind === 'planet'` — dort steht aber „node", weil der Zweig „feiner als die gesuchte Ebene"
   * die Körper als Einzelkörper sammelt. Der zweite Anlauf liess Ebene 1 ohne Anker, mit der
   * Begründung „die Sonne war dort auch falsch" — und die Begründung war **erfunden**: Voyager trägt
   * `orbit = 1412`, er kreist also wirklich um die Sonne. Nachgemessen, nicht geglaubt.
   */
  const kreist = placed.some((p) => (p.body.orbit ?? 0) > 0 || p.localOrbit > 0)
  const sternGeisDrawing = [...placed, ...systems.flatMap((s) => s.planets)].some(
    (p) => p.body.kind === 'Stern',
  )
  let anchor: Placed | null = null
  if (systems.length === 0 && kreist && !sternGeisDrawing) {
    /*
     * **Der Anker wird NUR innerhalb des Zweigs gesucht, den diese Ebene zeigt.**
     *
     * Der Betreiber: „**es ist immer noch eine sonne obwohl ich ultra weit weg bin sollte da keine
     * universum werden als maxout**". Genau das war der Fehler: hier stand `suche(root, …)` — die Suche
     * lief über den **ganzen Baum** und fand die Sonne **immer**, auch auf Ebene 7 („kosmischer
     * Überblick", Radius 9000). Dort ist die Sonne ein 100-Einheiten-Punkt **innerhalb** des
     * Überblicks — sie wurde als Anker geisDrawing und blieb als Name stehen.
     *
     * **Die Regel ist eine Abstiegsgrenze.** Ein Körper und seine Nachfahren gehören zusammen: ein
     * Körper der Ebene 4 („Sonnensystem") **enthält** seine Sterne und Planeten. Ist die gesuchte
     * Ebene **feiner** als er (`body.level >= level`), sieht man in ihn hinein — dann darf sein Stern
     * der Mittelpunkt sein. Ist sie **gröber** (`body.level < level`), ist er ein Punkt unter anderen,
     * und sein Inneres gehört nicht zum Bild.
     *
     * Gemessen an den Ebenen des Beispiels:
     *
     *     Ebene 1–2:  Sonnensystem (L4 ≥ 1) wird betreten → Anker **Sonne**   (die Planeten kreisen um sie)
     *     Ebene 3:    Sonne ist selbst geisDrawing          → kein Anker
     *     Ebene 4:    Systeme tragen ihren Stern selbst    → kein Anker
     *     Ebene 5–7:  Sonnensystem (L4 < 5) wird NICHT betreten → **kein Anker**
     *
     * Und damit stimmt die Reihenfolge des Betreibers: beim Herauszoomen verschwindet die Sonne, und
     * was bleibt, sind Sternhaufen, Galaxie und Universum — **das Grösste als Maximum**.
     */
    const suche = (body: Body, origin: readonly [number, number, number], pfad: readonly string[]): void => {
      const welt: [number, number, number] = [
        origin[0] + body.position[0],
        origin[1] + body.position[1],
        origin[2] + body.position[2],
      ]
      if (!anchor && body.kind === 'Stern') {
        anchor = { body, world: welt, path: pfad, kind: 'sun', depth: 0, localOrbit: 0 }
        return
      }
      // Nur absteigen, wenn dieser Körper feiner ist als die gezeigte Ebene — sonst ist er ein Punkt.
      if (body.level < level) return
      for (const kind of body.children ?? []) suche(kind, welt, [...pfad, body.name])
    }
    suche(root, [0, 0, 0], [])
  }

  return {
    level,
    placed,
    systems,
    labeled: anchor ? [...labeled, anchor] : labeled,
    anchor,
    /*
     * **Der typische Körper dieser Ebene** — der Median seiner Radien.
     *
     * Er ist die Bezugsgrösse für die Untergrenze (siehe `SPREIZUNG` in `rebuild`). Median und nicht
     * Mittelwert: ein einzelner Riesenknoten zieht den Mittelwert nach oben und damit die
     * Untergrenze für alle anderen mit.
     */
    reference: median(
      labeled.length > 0 ? labeled.map((p) => p.body.radius) : placed.map((p) => p.body.radius),
    ),
  }
}

/** Der Median einer Zahlenreihe — 0 für eine leere Reihe. */
function median(werte: readonly number[]): number {
  if (werte.length === 0) return 0
  const sortiert = [...werte].sort((a, b) => a - b)
  return sortiert[Math.floor(sortiert.length / 2)] ?? 0
}

/**
 * **Die Mindestgrösse eines Körpers auf einer Ebene** — die Regel als reine Rechnung.
 *
 * Ausgelagert, damit sie **prüfbar** ist: in `rebuild` steckte sie zwischen GPU-Aufräumen und
 * Szenenaufbau, und eine Regel, die „ob man etwas sieht" entscheidet, gehört ohne Browser prüfbar.
 * Sie ist der Grund, warum die Grössenverhältnisse erhalten bleiben (siehe `SPREIZUNG`).
 *
 * Drei Anteile, in dieser Reihenfolge:
 *
 *   1. `reference / SPREIZUNG` — der typische Körper der Ebene, gestaucht.
 *   2. `MIN_BODY_PIXELS` in Welteneinheiten — die harte Sichtgrenze.
 *   3. Der **grösste** Körper der Ebene als Deckel — eine Untergrenze darüber würde die ganze Ebene
 *      auf einen Wert ziehen, und genau das war der Fehler der alten Regel.
 */
export function minBodySize(
  reference: number,
  _largest: number,
  distance: number,
  viewHeight: number,
  fovDegrees: number,
): number {
  /*
   * **Der Deckel ist weg — und das war der Grund, warum die groben Ebenen leer waren.**
   *
   * Hier stand `Math.min(Math.max(reference / SPREIZUNG, sichtgrenze), largest)`: die Untergrenze wurde
   * beim **groessten** Koerper der Ebene gedeckelt. Die Absicht war, dass eine Untergrenze nicht die
   * **ganze** Ebene auf einen Wert zieht. Auf den Ebenen 1 bis 7 tut sie das auch nicht — dort gibt es
   * viele Koerper, und `reference / SPREIZUNG` liegt unter dem groessten.
   *
   * **Auf den groben Ebenen war der Deckel aber toedlich**, weil dort **ein einziger** Koerper steht:
   * der groesste **ist** der einzige, also war `minSize = sein Radius` — und die Sichtgrenze wurde
   * wirkungslos. Gemessen (`bun tools/_groesse.ts`):
   *
   *     Ebene  Koerper                px mit Deckel   px ohne Deckel
   *       8    prometheus                    1,1            5,0
   *       9    lokale Gruppe                 1,0            5,0
   *      10    Galaxienhaufen                0,7            5,0
   *      11    Laniakea                      0,5            5,0
   *      12    kosmischer Überblick          0,3            5,0
   *
   * Der Betreiber hat genau das gesehen — das Maximum war ein **leeres Bild** („sieht immer noch so
   * beschissen aus", und zum Universum: „es ist immer noch eine sonne obwohl ich ultra weit weg bin").
   * Und auf den Ebenen 3 bis 7 aendert der Wegfall **nichts**: dort greift die Ebenenregel.
   *
   * **Der Deckel wird nicht gebraucht.** Er sollte verhindern, dass alle Koerper gleich gross werden —
   * aber das kann `reference / SPREIZUNG` gar nicht: der **Median geteilt durch 12** liegt immer unter
   * dem Median und damit unter dem groessten Koerper. Was der Deckel tat, war einzig, die
   * **Sichtgrenze** auf duennen Ebenen abzuschalten.
   *
   * `_largest` bleibt in der Signatur, damit die Aufrufstellen und `tests/opening-view.test.ts` nicht
   * alle angefasst werden muessen — die Zahl wird nur nicht mehr benutzt.
   */
  return Math.max(reference / SPREIZUNG, visibilityFloor(distance, viewHeight, fovDegrees))
}

/**
 * **Die harte Sichtgrenze: die Weltenweite, die `MIN_BODY_PIXELS` Bildpunkten entspricht.**
 *
 * **Hier stand `tan((fov·π)/360)` — also `tan(fov/2)` — und das ist um `cos(fov/2)` zu gross.**
 *
 * Die Rechnung: ein Körper der Weltenweite `w` in der Entfernung `d` deckt
 *
 *     pixel = w · (viewHeight / 2) / (d · tan(fov/2))
 *
 * Bildpunkte ab. Nach `w` umgestellt, für genau `MIN_BODY_PIXELS` Bildpunkte:
 *
 *     w = MIN_BODY_PIXELS · d · tan(fov/2) / (viewHeight / 2)
 *       = MIN_BODY_PIXELS · d · 2 · tan(fov/2) / viewHeight
 *
 * Der Faktor **2** fehlte. Bei 60° Bildwinkel ist der Fehler `cos 30° = 0,866` — also **13,4 %** zu
 * grosse Körper, und die Konstante, die „2,4 Pixel" heisst, ergab in Wahrheit **2,77**. Bei einem
 * engeren Bildwinkel wäre der Fehler noch gewachsen: die Grenze hing am **Bildwinkel**, obwohl sie in
 * Pixeln festgelegt ist.
 *
 * Ausgelagert und benannt, damit die Umkehrung **prüfbar** ist: `tests/scale-pixel.test.ts` rechnet
 * sie vorwärts und prüft, dass wirklich `MIN_BODY_PIXELS` herauskommt — bei 30°, 60° und 90°.
 */
export function visibilityFloor(distance: number, viewHeight: number, fovDegrees: number): number {
  if (!(viewHeight > 0)) return 0
  const halbeHoehe = Math.tan((fovDegrees * Math.PI) / 360)
  return (MIN_BODY_PIXELS * distance * 2 * halbeHoehe) / viewHeight
}

/**
 * **Wie viele Bildpunkte ein Körper wirklich einnimmt** — die Probe zur Rechnung oben.
 *
 * Sie ist die Umkehrung und steht hier, weil eine Grenze, die „Pixel" heisst, auch in Pixeln gemessen
 * werden muss. Wer die eine Formel ändert, sieht hier sofort, was sie bedeutet.
 */
export function bodyPixels(worldSize: number, distance: number, viewHeight: number, fovDegrees: number): number {
  const halbeHoehe = Math.tan((fovDegrees * Math.PI) / 360)
  if (!(distance > 0) || halbeHoehe === 0) return 0
  return (worldSize * (viewHeight / 2)) / (distance * halbeHoehe)
}

/**
 * **Was ein Körper wirklich gross ist** — `max(radius, Untergrenze)`.
 *
 * Die Funktion ist **monoton**: für `a ≥ b` gilt `max(a, boden) ≥ max(b, boden)`. Deshalb kann die
 * Untergrenze die Grössenverhältnisse nicht umkehren — sie stauchen sie nur. Das ist die Eigenschaft,
 * auf der die ganze Regel beruht, und sie wird in `scene.test.ts` geprüft.
 */
export function drawnRadius(radius: number, minSize: number): number {
  return Math.max(radius, minSize)
}

/**
 * Ein Koerper, der sich **bewegt** — seine Lage wird je Bild neu gerechnet.
 *
 * Ohne diese Liste stehen die Planeten still: die Szene wird einmal gebaut, und ein Körper
 * ohne eigene Lageaenderung bleibt, wo er gebaut wurde. Der Betreiber: „das es nicht so stock
 * fisch stuck aussieht."
 */
export interface DynamicEntry {
  readonly body: Body
  readonly mesh: Mesh
  /** Die Spur hinter dem Koerper — null, wenn dieser Koerper keinen Schweif hat. */
  readonly trail: Line | null
  /**
   * **Der Koerper, um den dieser kreist — oder `null` fuer den Stern.**
   *
   * **Warum das ein eigenes Feld ist, und warum es fehlte.** Vorher kreiste **jeder** Koerper um
   * `center`, also um den **Systemkern**. Fuer die Planeten stimmt das. Fuer den Mond nicht: er
   * kreist um die **Erde**, und die bewegt sich. Der Betreiber hat es gesehen — „anmerkung mond und
   * voayger folgt erde nicht lol" —, und er hatte recht: der Mond lief um die Sonne, in einem Ring
   * von 70 Einheiten um einen 34 Einheiten grossen Stern.
   *
   * Mit `parent` haengt die Bahn am **Elternteil**, und der Elternteil wird **vor** seinem Kind
   * gerechnet. Deshalb ist die Reihenfolge in `dynamic` keine Zierde: sie ist die Abhaengigkeit.
   */
  readonly parent: DynamicEntry | null
  /**
   * Der Bahnmittelpunkt in Weltkoordinaten — **nur gueltig, wenn `parent === null`**.
   *
   * Bei einem Mond ist er wertlos: der Mittelpunkt bewegt sich mit der Erde. Genau deshalb gibt es
   * `parent`.
   */
  readonly center: readonly [number, number, number]
  /** Der **lokale** Bahnradius um den Elternteil. */
  readonly orbit: number
  /** Kreisfrequenz in Radiant je Sekunde — aus der echten Umlaufzeit. */
  readonly omega: number
  readonly phase: number
  /** Hoehe der Bahnebene ueber dem Zentrum (bzw. ueber dem Elternteil). */
  readonly plane: number
  /** Wie weit der Schweif zurueckreicht, in Sekunden. */
  readonly span: number
  /** Eigenrotation: wie schnell sich der Koerper um sich selbst dreht. */
  readonly spin: number
}

/**
 * Wie viele Punkte eine Bahn hat.
 *
 * 96 genuegt fuer eine glatte, fast geschlossene Ellipse; die Punkte werden je Bild
 * neu gerechnet, aber nur **eine** Linie gezeichnet.
 */
const TRAIL_SEGMENTS = 96

/**
 * Wie weit die Bahn zurueckreicht — als Anteil einer vollen Runde.
 *
 * **0,985 heisst: fast die ganze Bahn.** Ein halber Schweif zeigte nur einen Bogen
 * und liess die Bahn wie einen Kometenschweif aussehen; die Physik ist aber eine
 * geschlossene Umlaufbahn. Der kleine Rest ist die Naht, an der die Linie ausblendet.
 */
const TRAIL_FRACTION = 0.985

/**
 * Wie schnell die Zeit im Sonnensystem läuft — **visuelle Zeit, nicht Physikzeit.**
 *
 * `ω ∝ T^(−0,5)` ist eine bewusste Stauchung. Bei echter Zeit (`T^−1`) wäre
 * Neptun bei 120 s je Erdenjahr rund **5,7 Stunden** unterwegs und stünde im
 * Bild still, während Merkur alle 29 s vorbeizieht. Mit `0,5` bleibt die
 * Reihenfolge echt (Merkur schneller als Neptun), aber das Verhältnis liegt bei
 * rund 26 : 1 statt 684 : 1 — ein Takt, den man ansieht, ohne dass die Anzeige
 * flimmert.
 *
 * `universe.orbitSpeed` ist der Multiplikator, mit dem man den Takt schneller
 * oder langsamer stellen kann. `tests/orbits.test.ts` liest `YEAR_SECONDS` von
 * hier, statt eine zweite Kopie der Zahl zu führen.
 */
export const YEAR_SECONDS = 120
const OMEGA_EXPONENT = 0.5

/**
 * Die Lage eines kreisenden Koerpers zu einem Zeitpunkt — **reine Rechnung, ohne Netz**.
 *
 * Als eigene Funktion, damit sie **ohne Browser** pruefbar ist (`tests/scene.test.ts`). Das ist
 * der Grund, warum die Bewegung hier steht und nicht in `updateBodies`: eine Rechnung, die nur
 * im Zeichenpfad existiert, laesst sich nicht nachpruefen — und genau dort sass der Fehler, bei
 * dem der Planet **neben** seiner eigenen Bahn lief.
 *
 * Die Form ist **genau die des Bahnrings** (`buildOrbit`): ein Kreis in `xz`, um `plane`
 * angehoben. Deshalb liegt der Koerper immer auf seiner Bahn.
 */
export function orbitPosition(
  center: readonly [number, number, number],
  orbit: number,
  plane: number,
  phase: number,
  omega: number,
  seconds: number,
): [number, number, number] {
  const angle = phase + omega * seconds
  return [
    center[0] + Math.cos(angle) * orbit,
    center[1] + plane,
    center[2] + Math.sin(angle) * orbit,
  ]
}

/** Die Kreisfrequenz aus einer echten Umlaufzeit — gestaucht, siehe `OMEGA_EXPONENT`. */
export function angularSpeed(periodYears: number, yearSeconds = YEAR_SECONDS): number {
  if (!(periodYears > 0)) throw new Error('Eine Umlaufzeit muss größer als null sein')
  return (Math.PI * 2) / yearSeconds / Math.pow(periodYears, OMEGA_EXPONENT)
}

/**
 * Prueft, ob sich in einem System zwei Koerper **ueberlagern** — reine Rechnung, ohne Netz.
 *
 * **Warum das geprueft wird.** Der Betreiber hat es sofort gesehen: „beim bewegen des
 * Sonnensystem … ist bischen komisch diese masse der sonne gross und dann noch sehr sehr sehr
 * nah beinander ist es naja kritisch oder nicht?" Er hatte recht — gemessen lagen Venus und
 * Erde nur **8 Einheiten** auseinander, und Merkurs Bahn war **26-mal** der Sonnenradius
 * (in der Wirklichkeit: 83-mal).
 *
 * Diese Funktion ist die **Wache** dafuer. Sie laeuft im Test **und** als
 * Gesundheitspruefung im Terminal (`health`) — damit derselbe Fehler nicht noch einmal
 * unbemerkt entsteht.
 *
 * Geprueft werden zwei Faelle:
 *   1. **Zwei Koerper im gleichen Ring** — dann liegen ihre Kugeln uebereinander.
 *   2. **Zwei Bahnen zu dicht** — die Kugeln beruehren sich, sobald sie aneinander vorbeiziehen.
 */
export function crowding(system: SolarSystem): readonly string[] {
  const befunde: string[] = []
  const lagen = system.planets.map((planet, index) => ({
    name: planet.body.name,
    radius: planet.body.radius,
    orbit: system.orbits[index] ?? 0,
  }))

  for (let i = 0; i < lagen.length; i++) {
    for (let j = i + 1; j < lagen.length; j++) {
      const a = lagen[i]
      const b = lagen[j]
      if (!a || !b) continue
      // **Koerper ohne eigenen Ring werden nicht verglichen.** Der Stern steht in der Mitte,
      // ein Mond kreist um seinen Planeten statt um den Stern — ihre „Bahn 0" ist keine Bahn,
      // sondern die Aussage „gehoert nicht in diesen Ring". Ein erster Anlauf verglich sie
      // mit und meldete 55 Fehlalarme („Sonne und Neptun liegen im selben Ring").
      if (a.orbit === 0 || b.orbit === 0) continue
      // Gleicher Ring (oder fast derselbe): die Koerper sitzen aufeinander.
      if (Math.abs(a.orbit - b.orbit) < 1e-6) {
        befunde.push(`${a.name} und ${b.name} liegen im selben Ring (${Math.round(a.orbit)})`)
        continue
      }
      // Verschiedene Ringe: sie beruehren sich, wenn die Luecke kleiner ist als die
      // Summe der Radien — dann streifen sich die Kugeln beim Vorbeiziehen.
      const luecke = Math.abs(a.orbit - b.orbit) - a.radius - b.radius
      if (luecke < 0) {
        befunde.push(
          `${a.name} und ${b.name} berühren sich: Lücke ${luecke.toFixed(1)} (Bahn ${Math.round(a.orbit)} gegen ${Math.round(b.orbit)})`,
        )
      }
    }
  }

  // Und der Stern: die innerste Bahn darf nicht in ihm stecken.
  const innerste = lagen
    .filter((lage) => lage.orbit > 0)
    .sort((a, b) => a.orbit - b.orbit)[0]
  if (innerste && innerste.orbit < system.star.body.radius) {
    befunde.push(
      `Die innerste Bahn (${innerste.name}, ${Math.round(innerste.orbit)}) liegt im Stern (Radius ${system.star.body.radius})`,
    )
  }
  return befunde
}

/** Die sichtbare Szene: Renderer, Szene, Kamera, Objekte und Beschriftungen. */
export class UniverseView {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(58, 1, 0.1, 1_000_000)
  private readonly world = new Group()
  /**
   * **Die naechstgrobere Stufe — fuer das Ueberblenden beim Zoom.**
   *
   * Betreiber: „**ebene ist eine erleichterung der zoom sollte es natuerlich sein also keine ebene
   * direkt change oder so ansonsten fuehl es sich nach ruckeln oder verjaenderung der kamera
   * perspektive und so an**".
   *
   * Gemessen war das Ruckeln eine **Zahl** (`bun tools/_ruckeln.ts`): bei jedem Ebenenwechsel sprang die
   * Zahl der geisDrawingen Koerper — **16 → 4** bei 2 240, **4 → 2** bei 32 500, **2 → 1** bei 124 000.
   * Weil zwischen den beiden Mengen **nichts** gemeinsam ist, verschwanden alle alten Koerper in
   * **einem** Bild und alle neuen erschienen in **einem** Bild.
   *
   * Deshalb liegt die naechstgrobere Stufe **gleichzeitig** in der Szene und blendet ein, waehrend die
   * feinere ausblendet. Gebaut wird sie **vor** dem Uebergang — so faellt der Aufbau nicht in das Bild,
   * in dem der Uebergang stattfindet.
   */
  private readonly distant = new Group()
  /** Der Gewinn der feinen und der groben Stufe, 0 bis 1. Sie ergaenzen sich zu 1. */
  private fade = 1
  private fadeDistant = 0
  /**
   * **Die letzte Rechnung des Uebergangs — zum Nachsehen.**
   *
   * Hier stand zuerst nur das Ergebnis (`fade`), und als es nicht stimmte, war nicht zu sehen **warum**:
   * der Abstand, die beiden Bandgrenzen und das Gewicht sind vier Zahlen, und jede kann falsch sein.
   * Diese vier werden mitgefuehrt, damit `tools/transition.js` sie zeigen kann.
   */
  private lastFadeCalc = { oben: 0, unten: 0, anteil: 0, gewicht: 0, abstand: 0 }
  private readonly labelLayer: HTMLElement
  private readonly labels = new Map<string, HTMLElement>()
  private readonly root: Body
  private built: BuiltScene = { level: 1, placed: [], systems: [], labeled: [], anchor: null, reference: 0 }
  /** Kennung der zuletzt geisDrawingen Menge — Grundlage fuer „muss neu gebaut werden?". */
  private signature = ''
  /** Die Koerper, die sich bewegen. Leer, wenn die Ebene keine Bahnen zeigt. */
  private dynamic: DynamicEntry[] = []
  private readonly pickable: { mesh: Mesh; placed: Placed }[] = []
  private readonly raycaster = new Raycaster()
  private readonly starSpins: { mesh: Mesh; speed: number }[] = []

  /**
   * **Das Sternenfeld — je Helligkeitsklasse eine Punktwolke.**
   *
   * ## Warum ein Feld und kein SVG mehr
   *
   * Bis zum 16.10.2026 war der Himmel eine **DOM-Schicht** mit 4 053 `<circle>` (`sky.ts`). Der
   * Betreiber: *„keine bilder nutzen lol ;D das macht es doch so laggy ;D, stattdessen kannst du doch
   * quasi die sterne generieren … das es realistisch zoom in and zoom out ist. like star wars schiff
   * beschleunigen"*. Er hat recht, und der Grund ist nicht nur die Last (gemessen 58,8 ms je Bild für
   * eine Lageänderung, siehe `docs/status/himmel-physik.md` §4.6): **ein Standbild hat keine Tiefe.**
   *
   * Hier stehen die Sterne als **Punkte im Raum** — in Weltkoordinaten, nicht als Kind der Kamera und
   * **nicht** im `world`-Gruppenknoten:
   *
   *   * **Nicht im `world`**, weil der sich mit der 5D-Drehung dreht. Die Sterne sind das
   *     **Inertialsystem** — genau das, was sich beim Drehen der Welt *nicht* mitdreht.
   *   * **Nicht als Kamerakind**, weil sie sonst keine Parallaxe hätten: die Kamera **fährt** in
   *     Weltkoordinaten (`cameraPosition` = Fokus + Abstand), und nur Sterne in **endlicher**
   *     Entfernung wandern dabei über das Bild. Das ist der Beschleunigungseindruck — Perspektive,
   *     keine Animation.
   *
   * ## Warum eine Wolke je Klasse
   *
   * Weil die Grafikkarte **je Zeichenaufruf eine Punktgröße** kennt. Sechs Klassen, sechs Aufrufe —
   * und die Grenzhelligkeit einer Ebene ist dann ein `visible` je Wolke: **sechs** Schreibvorgänge
   * beim Ebenenwechsel, **keine** je Bild. (Ein eigener Shader könnte es in einem Aufruf; das ist
   * eine Frage der Bequemlichkeit, nicht der Last — sechs Aufrufe sind nichts.)
   */
  private sternPunkte: { readonly punkte: Points; readonly klasse: number }[] = []
  /** Die feinste Klasse, die noch zu sehen ist (1 … 6). */
  private sternGrenze = 6

  /**
   * **Die Gerätestufe** — siehe `gpu.ts`.
   *
   * Sie entscheidet dreierlei: die Bitte an den Zeichner im Konstruktor (Kantenglättung, Energie),
   * die **Zahl** der Sterne (der Wirt skaliert den Katalog, `STERN_ANTEIL`) und die **Blendart** —
   * additives Licht kostet Füllrate, und auf der CPU ist Füllrate das knappste Gut, das es gibt.
   */
  private readonly geraet: Geraetestufe

  /** Ob der Browser den WebGL-Kontext entzogen hat. */
  private kontextVerloren = false

  /**
   * Wird gerufen, wenn der Kontext verloren geht.
   *
   * **Warum ein Rückruf und keine Meldung aus dieser Datei.** Die Ansicht kennt keine Sprache
   * (`i18n`) und keine Oberfläche — sie zeichnet. Wer dem Nutzer etwas **sagen** will, tut das dort,
   * wo die Sätze liegen. Hier steht nur die Tatsache.
   */
  ctxVerlust: (() => void) | undefined

  /** Ob der Kontext entzogen wurde — für die Anzeige. */
  istKontextVerloren(): boolean {
    return this.kontextVerloren
  }

  /** Die Stufe, mit der diese Ansicht läuft — für die Statuszeile. */
  stufe(): Geraetestufe {
    return this.geraet
  }
  /** Das weiche Punktbild — **erzeugt**, nicht geladen. Siehe {@link sternTextur}. */
  private sternTextur: CanvasTexture | null = null

  /**
   * **Das Punktbild — gezeichnet, nicht geladen.**
   *
   * Ein Stern ist kein Quadrat. Ohne Bild zeichnet `PointsMaterial` ein Viereck je Stern; bei 30 000
   * Punkten sieht das nach Rauschen aus. Das Bild hier entsteht **im Browser** aus einem radialen
   * Verlauf: in der Mitte voll, nach außen auf null. Kein Download, keine Datei, keine Lizenz.
   *
   * **Warum `null` erlaubt ist.** In den Prüfungen ist das Dokument ein Stub ohne `getContext` — dort
   * gibt es kein Bild, und die Punkte werden als Vierecke gezeichnet. Ein Wurf wäre hier ein Absturz
   * beim Start, also beim ersten Bild.
   *
   * @returns das Bild oder `null`, wenn die Umgebung keines hergibt
   */
  private sternBild(): CanvasTexture | null {
    if (this.sternTextur) return this.sternTextur
    const kante = 32
    const flaeche = document.createElement('canvas')
    flaeche.width = kante
    flaeche.height = kante
    const stift = flaeche.getContext?.('2d')
    if (!stift) return null
    const verlauf = stift.createRadialGradient(kante / 2, kante / 2, 0, kante / 2, kante / 2, kante / 2)
    verlauf.addColorStop(0, 'rgba(255,255,255,1)')
    // **Der Kern ist klein und der Rand weich.** Ein harter Punkt sieht bei kleiner Anzeige aus wie
    // ein Krümel; der weiche Rand ist das, was ein Stern auf einem Bildschirm ist.
    verlauf.addColorStop(0.28, 'rgba(255,255,255,0.62)')
    verlauf.addColorStop(1, 'rgba(255,255,255,0)')
    stift.fillStyle = verlauf
    stift.fillRect(0, 0, kante, kante)
    this.sternTextur = new CanvasTexture(flaeche)
    return this.sternTextur
  }

  /**
   * **Das Sternenfeld setzen** — einmal je Aufbau, nicht je Bild.
   *
   * Sechs Punktwolken, eine je Helligkeitsklasse. Die Farbe **jedes** Sterns kommt aus der Reihe
   * (`vertexColors`), die Deckkraft und die Größe aus seiner Klasse.
   *
   * @param liste - die Sterne in Weltkoordinaten
   * @param grenze - die feinste Klasse, die auf der jetzigen Ebene zu sehen ist
   */
  setzeSterne(liste: readonly Stern[], grenze: number): void {
    for (const { punkte } of this.sternPunkte) {
      this.scene.remove(punkte)
      punkte.geometry.dispose()
      ;(punkte.material as PointsMaterial).dispose()
    }
    this.sternPunkte = []

    const nachKlasse: Stern[][] = STERN_KLASSEN.map(() => [])
    for (const stern of liste) {
      const i = Math.min(nachKlasse.length, Math.max(1, stern.klasse)) - 1
      nachKlasse[i]?.push(stern)
    }

    const bild = this.sternBild()
    for (let k = 0; k < nachKlasse.length; k += 1) {
      const sterne = nachKlasse[k] ?? []
      if (sterne.length === 0) continue
      const position = new Float32Array(sterne.length * 3)
      const farbe = new Float32Array(sterne.length * 3)
      for (let i = 0; i < sterne.length; i += 1) {
        const s = sterne[i]
        if (!s) continue
        position[i * 3] = s.x
        position[i * 3 + 1] = s.y
        position[i * 3 + 2] = s.z
        farbe[i * 3] = s.farbe[0]
        farbe[i * 3 + 1] = s.farbe[1]
        farbe[i * 3 + 2] = s.farbe[2]
      }
      const geometrie = new BufferGeometry()
      geometrie.setAttribute('position', new BufferAttribute(position, 3))
      geometrie.setAttribute('color', new BufferAttribute(farbe, 3))
      const material = new PointsMaterial({
        /*
         * **Additiv, nicht deckend — wo es bezahlt ist.** Licht addiert sich: wo zwei Sterne
         * übereinanderliegen, ist es heller und nicht „der letzte gewinnt". Das ist der Unterschied
         * zwischen einem Himmel und einer Liste von Punkten.
         *
         * **Auf der CPU wird daraus eine gewöhnliche Überblendung.** Additiv heißt: für **jeden**
         * Punkt wird die Fläche gelesen, addiert und zurückgeschrieben — doppelte Füllrate, und
         * Füllrate ist das knappste Gut ohne Grafikkarte. Die Sterne sehen dann etwas flacher aus
         * (sie addieren sich nicht mehr auf), und das ist der richtige Tausch: lieber ein flacheres
         * Bild als ein stehendes.
         */
        blending: mitAdditiv(this.geraet) ? AdditiveBlending : NormalBlending,
        vertexColors: true,
        transparent: true,
        opacity: STERN_KLASSEN[k]?.o ?? 0.5,
        depthWrite: false,
        /*
         * **Keine Tiefenskalierung — und das war ein gemessener Fehler.**
         *
         * Der erste Anlauf ließ die Punkte mit der Entfernung schrumpfen (`sizeAttenuation: true`) und
         * rechnete die Größe aus dem Abstand. Gemessen blieben davon **4 helle Pixel** von 324 000
         * gelesenen: die Sterne des Feldes liegen zwischen 0,8- und 25-fachem des Abstands, also ist
         * der Bei weitem größte Teil **subpixelklein** — vorhanden, gezeichnet und unsichtbar.
         *
         * Ein Stern ist aber ein **Punkt**: seine scheinbare Größe ist bedeutungslos, solange sie unter
         * einem Bildpunkt liegt. Was das Auge sieht, ist **Helligkeit** — und die kommt hier aus der
         * Klasse (und aus der Farbe), nicht aus der Entfernung. Die Größe steht deshalb in **Pixeln**
         * und gilt für jede Entfernung: die **Lage** trägt die Tiefe (Parallaxe), nicht die Größe.
         */
        sizeAttenuation: false,
        ...(bild ? { map: bild } : {}),
        size: 2.6 * (STERN_KLASSEN[k]?.r ?? 0.5),
      })
      const punkte = new Points(geometrie, material)
      punkte.frustumCulled = false
      punkte.renderOrder = -2
      this.scene.add(punkte)
      this.sternPunkte.push({ punkte, klasse: k + 1 })
    }
    this.setzeSternGrenze(grenze)
  }

  /**
   * **Die Grenzhelligkeit setzen** — sechs Schreibvorgänge beim Ebenenwechsel.
   *
   * **Warum nur `visible` und nicht neu gebaut.** Ausblenden ist keine Arbeit: die Wolke bleibt im
   * Speicher, sie wird nicht gezeichnet. Ein Neuaufbau je Ebene würde die Punkte **springen** lassen —
   * ein Stern, der bei jedem Zoomschritt woanders steht, ist kein Himmel.
   *
   * @param grenze - die feinste Klasse, die noch zu sehen ist (1 … 6)
   */
  setzeSternGrenze(grenze: number): void {
    this.sternGrenze = grenze
    for (const { punkte, klasse } of this.sternPunkte) {
      punkte.visible = klasse <= grenze
    }
  }

  /**
   * Das Sternenfeld ein- oder ausblenden.
   *
   * Es ist — wie das Raster — der **Bezug** und nicht die Anzeige: die Einstellung „was das Universum
   * zeigt" entscheidet, ob es da ist. Ohne Sterne bleibt der leere Raum, den der Betreiber als
   * Sandbox verlangt hat.
   *
   * @param an - ob das Feld gezeichnet wird
   */
  sterneSichtbar(an: boolean): void {
    for (const { punkte, klasse } of this.sternPunkte) {
      punkte.visible = an && klasse <= this.sternGrenze
    }
  }

  /**
   * **Die Punktgröße — in Pixeln, nicht im Weltmaßstab.**
   *
   * Hier stand zuerst eine Rechnung, die die Größe aus dem Abstand ableitete (wie beim Raster), damit
   * die Sterne bei jedem Zoom gleich groß *aussehen*. Gemessen war das der Fehler: bei einer Streuung
   * von 0,8- bis 25-fachem des Abstands ist der größte Teil des Feldes dann **subpixelklein** — von
   * 324 000 gelesenen Pixeln leuchteten **vier**. Die Größe steht deshalb einmal im Material
   * (`setzeSterne`, `sizeAttenuation: false`) und **nicht** hier.
   */
  /**
   * **Was noch fehlt, ehrlich benannt: die Streckung.**
   *
   * Der Betreiber will den Eindruck eines Schiffes, das beschleunigt („like star wars schiff
   * beschleunigen"). Was davon **schon da** ist, ist der Kern: die Sterne stehen in endlicher
   * Entfernung, die Kamera fährt an ihnen vorbei — beim Zoomen fliegen sie radial auseinander. Was
   * **fehlt**, ist die Bewegungsunschärfe: ein Stern, der in einem Bild weit wandert, müßte ein
   * **Strich** sein und kein Punkt.
   *
   * Der Weg dahin ist gemessen und schmal: zwei Eckpunkte je Stern (die Lage jetzt und die Lage im
   * vorigen Bild) als `LineSegments`, und die Streckung im Vertex-Shader aus einer Uniform
   * (vorige Ansichtsmatrix). Der Bildtakt schriebe dann **eine** Matrix je Bild statt 30 000 Punkte.
   *
   * **Warum das noch nicht gebaut ist.** Es ist eine Farb- und Formfrage, die man **sehen** muß — und
   * der kopflose Browser, in dem hier geprüft wird, zeichnet zwar (nachgewiesen über `readPixels`),
   * erlaubt aber keinen Blick auf das Ergebnis. Ein Shader blind zu schreiben und als „fertig" zu
   * melden wäre die Sorte Behauptung, die dieses Projekt nicht macht.
   */
  /**
  /**
   * **Das Raster — der Bezug der leeren Fläche.**
   *
   * Betreiber: „**kannst du stattdessen ein raster implementieren also eine raste punkt wie drawdb.png
   * hier als bild beispiel**". `docs/design/img/other/drawdb.png` zeigt einen dunklen Grund mit einem
   * sehr zurückhaltenden Raster aus **kleinen Punkten** — es ist ein **Maßstab**, keine Dekoration.
   *
   * **Warum ein leerer Raum eines braucht.** Ohne alles ist die Fläche nicht „minimalistisch", sondern
   * **orientierungslos**: beim Zoomen und Schieben gibt es keinen Anhaltspunkt, ob sich etwas bewegt
   * hat oder wie weit man ist. Das Raster ist die **einzige** Anzeige, die bleibt — und sie zeigt
   * nichts über das Universum, sondern nur über den **Raum**.
   *
   * **Warum es in der WELT liegt und nicht als CSS-Hintergrund.** Ein CSS-Raster steht still: beim
   * Zoomen müsste man es selbst nachrechnen, und beim Drehen wäre es falsch. Hier liegt es als Punkte
   * in der Szene — es zoomt, schiebt und dreht damit **von selbst** richtig. Und es liegt **in der
   * Welt**, also dreht es mit ihr; das ist die Regel, die schon für die Achse gilt.
   */
  private grid: Points | null = null
  /** Der Punktabstand, für den `grid` gebaut ist — bei einem anderen wird neu gebaut. */
  private gridStep = 0
  /**
   * **Ob die Himmelskoerper GEZEICHNET werden — die Logik bleibt in jedem Fall.**
   *
   * Der Betreiber: „**entferne mal alle anzeige im Universe, nur logic schnittstelle behalten. also ich
   * meinte den planeten galaxien ect wir behandel den Universe als eine sandbox visualisierung modern
   * minimalistisch wie ein OS/betriebsystem**" und auf die Nachfrage, wie ein Objekt dann aussehen
   * soll: „**nix einfach leer lassen :D**".
   *
   * **Was das heisst, und was es NICHT heisst.** Nicht geisDrawing werden: Planeten, Sonne, Galaxien,
   * Sternhaufen, Bahnschweife, der Glorienschein und die Beschriftungen. **Erhalten bleibt alles
   * andere** — und das ist der grössere Teil:
   *
   *   - `buildScene` rechnet weiter, welche Koerper auf welcher Ebene sichtbar sind (`placed`,
   *     `systems`, `labeled`, `anchor`, `reference`) — samt Ankermaske und Mindestgroessen.
   *   - `framing` und `idealDistance` rechnen weiter die Rahmung.
   *   - `pick` bleibt die Schnittstelle für den Klick auf ein Objekt.
   *   - Die Bewegung (`updateBodies`) und die Ueberblendung zwischen zwei Stufen laufen weiter.
   *
   * **Warum als Schalter und nicht als Löschung.** „Nicht benutzt" ist etwas anderes als „nicht da":
   * wer die Zeichnung löscht, muss sie neu schreiben, wenn er sie wiedersehen will. So ist es eine
   * Zeile in der Einstellung — und die Logik dahinter ist unangetastet. Beim ersten Bild ist der
   * Schalter **aus** (der Betreiber hat es so verlangt); die Einstellung `universe.visuals` schaltet
   * ihn ein — und zwar **nur** bei `all`: der Wert `stars` lässt den Sternenhimmel stehen und die
   * Körper weg (siehe `universeView` in `main.ts`).
   */
  private zeichnen = false

  constructor(canvas: HTMLCanvasElement, labelLayer: HTMLElement, root: Body, geraet: Geraetestufe = 'gpu') {
    this.root = root
    this.labelLayer = labelLayer
    this.geraet = geraet
    /*
     * ══ DER ZEICHNER — UND DIE BITTE AN DEN RECHNER ═══════════════════════════════════════════════
     *
     * **Was der Betreiber verlangt hat:** *„noch nebenbei sollte es auch IGPU und CPU supporten"*.
     * Bis hierher forderte diese Zeile das Gegenteil:
     *
     *   * `antialias: true` — Kantenglättung. Auf einer eigenen Karte ist sie bezahlt; auf einer
     *     **integrierten** kostet sie einen Teil der Füllrate, und **ohne** Karte (die CPU rechnet)
     *     ist sie Verschwendung: dieselbe Arbeit, viele Male, in Software.
     *   * `powerPreference: 'high-performance'` — die Bitte um die **schnelle** Karte. Auf einem
     *     Laptop mit zwei Karten heißt das: die stromfressende; auf einem Rechner mit einer
     *     integrierten heißt es: eine Bitte, die niemand erfüllen kann. Sie gehört an die Stufe
     *     gebunden und nicht in jede Zeile.
     *   * `failIfMajorPerformanceCaveat` — die Voreinstellung ist `false`, und das ist **die
     *     Voraussetzung für CPU-Betrieb**: stünde sie auf `true`, verweigerte der Browser den Kontext,
     *     sobald er merkt, daß die Grafik langsam ist (Software-Rasterung, blockierter Treiber). Die
     *     Seite wäre **leer** — auf genau den Rechnern, um die es hier geht. Sie steht deshalb
     *     ausdrücklich da, mit Begründung, statt sich auf eine Voreinstellung zu verlassen.
     *
     * Was die Stufe **nicht** ändert: `alpha: true`. Der durchsichtige Grund ist keine Frage der
     * Leistung, sondern die Voraussetzung dafür, daß der Dunst (`--starfield`) durch das Bild scheint.
     */
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: mitKantenglaettung(geraet),
      powerPreference: energieVorliebe(geraet),
      failIfMajorPerformanceCaveat: false,
      /*
       * `alpha: true` ist die Voraussetzung für den durchsichtigen Grund unten. Ohne diese Zeile
       * ignoriert der Zeichner die Deckkraft der Räumfarbe, und das Canvas bleibt deckend.
       */
      alpha: true,
    })

    /*
     * **Und der Verlust des Kontexts — der Fall, der eintritt und den niemand erwartet.**
     *
     * Der Browser nimmt einer Seite die Grafikkarte weg, wenn sie zu lange braucht, der Rechner in den
     * Ruhezustand geht, der Treiber abstürzt oder zu viele Kontexte offen sind. Ohne Behandlung ist
     * das Ergebnis ein **schwarzes Bild ohne Meldung** — der teuerste Fehler, den dieses Projekt
     * kennt, weil er wie eine Entscheidung aussieht. Hier wird er **gesagt**.
     */
    this.renderer.domElement.addEventListener('webglcontextlost', (ereignis) => {
      ereignis.preventDefault()
      this.kontextVerloren = true
      this.ctxVerlust?.()
    })
    /*
     * **Durchsichtig räumen — damit der Sternenhimmel durchkommt.**
     *
     * Hier stand `setClearColor(0x050507, 1)` — eine **deckende** Fläche in fast demselben Ton wie
     * der Himmel. Der Sternenhimmel ist aber **kein 3D-Objekt**, sondern ein CSS-Hintergrund
     * (`#screen-os::before` mit `var(--starfield)`, siehe `app.css`), und das Canvas liegt mit
     * `z-index: 2` **darüber**. Gemessen im Bild auf Ebene 7:
     *
     *     sternfeldVar: ""      sternfeldBild: "none"   ← am `.stage`, dort ist es nicht gesetzt
     *     ueberSchwelle: 0      hellster: 0             ← canvas-Pixel, alles schwarz
     *
     * Der Betreiber hat es gesehen — „ich möchte gerne diese kleine sterne background wieder haben
     * sonst sieht es so leer aus". Sie waren **nie weg**: sie standen hinter einer deckenden Fläche.
     * Mit `alpha: true` und einer durchsichtigen Räumung liegt das Bild wieder hinter der Welt, wo es
     * hingehört. Die Farbe des Grundes bleibt dieselbe — sie kommt jetzt aus `app.css`.
     */
    this.renderer.setClearColor(0x000000, 0)
    this.scene.add(this.world)
    // Die grobe Stufe liegt **hinter** der feinen: sie blendet ein, waehrend die feine ausblendet.
    this.distant.visible = false
    this.scene.add(this.distant)

    // Ein schwaches Grundlicht. Es ist **nicht** die Sonne, sondern nur genug Licht, damit
    // die Nachtseite eines Planeten nicht vollkommen schwarz ist — ohne das wirkt jede Kugel
    // halb verschwunden, also flach. (Ein erster Anlauf hatte nur `AmbientLight` und dazu
    // Punktlichter mit physikalischem Abfall: die Welt war schwarz.)
    this.scene.add(fillLight())
  }

  /**
   * Baut die Szene neu, wenn sich die **sichtbare Menge** aendert.
   *
   * Der Vergleich laeuft ueber eine Kennung aus Ebenennummer und Objekt-IDs. Wuerde stattdessen
   * jedes Bild neu gebaut, entstuenden bei 60 Bildern je Sekunde Hunderte neuer Geometrien —
   * ein Speicherleck, das erst nach Minuten auffaellt.
   */
  /**
   * Baut den Inhalt der Welt fuer eine Ebene neu — wenn sich die **Kennung** geaendert hat.
   *
   * **Oeffentlich, weil eine Einstellung die Szene aendern kann.** Die Namen an den Koerpern
   * (`interface.labels`) sind keine Frage der Darstellung, sondern des **Inhalts**: ohne sie
   * werden die Beschriftungsknoten gar nicht erst angelegt. Wer sie umschaltet, muss den Aufbau
   * anstossen koennen, ohne auf die naechste Aenderung von Ebene oder Abstand zu warten.
   *
   * Die Kennung schuetzt weiterhin davor, dass der Aufbau bei jedem Bild geschieht: ein Aufruf
   * mit derselben Ebene und demselben Abstand tut nichts.
   */
  /**
   * **Die Bildhöhe in Pixeln** — die Zahl, ohne die keine Pixelrechnung geht.
   *
   * Sie steht sonst nirgends in der Szene: `render(width, height, …)` bekommt sie je Bild, aber
   * `rebuild` läuft **vor** dem ersten Bild und braucht sie für die Sichtgrenze. Deshalb kommt sie
   * aus dem Canvas, der die Welt isDrawing — und mit einem Rückfall auf die Fensterhöhe, weil ein
   * Canvas vor dem ersten `render` die Grösse 0 haben kann.
   */
  private viewHeight(): number {
    const hoehe = this.renderer.domElement.clientHeight
    if (hoehe > 1) return hoehe
    return globalThis.innerHeight ?? 900
  }

  /**
   * **Der Abstand und der Fokus, mit denen diese Ebene gut im Bild steht.**
   *
   * ── Was hier zuerst falsch war, und es war zweimal falsch ───────────────────────────────
   *
   * Erster Anlauf: `idealDistance` lieferte nur einen **Abstand**, der Fokus blieb. Gemessen: Ebene 7
   * führte den Abstand von 573 440 auf **51 962** herunter — und der Knoten war **immer noch 15 px**,
   * weil die Kamera weiter auf den Ursprung schaute, während der Knoten 1204 Einheiten daneben liegt.
   *
   * Zweiter Anlauf: gerahmt wurde der **grösste** Körper der Ebene. Auf Ebene 4 gewann damit ein
   * Knoten aus `apps` (Radius 187) gegen die Sonne (100), und die Kamera fuhr **weg von der Mitte** —
   * im Bild des Betreibers lag das Sonnensystem dann am Rand einer leeren Fläche.
   *
   * Richtig ist beides zusammen: **der Fokus bleibt**, und gerahmt wird die Ausdehnung **um den
   * Fokus** (`extentAround`). Ein Sonnensystem ist Stern plus äusserster Ring.
   */
  framing(level: Level, focus?: readonly [number, number, number]): { readonly focus: [number, number, number]; readonly distance: number } | null {
    /*
     * **Eine Regel, und der Fokus entscheidet sie — nicht der Zufall.**
     *
     * Hier standen nacheinander drei Fassungen, und jede war auf ihre Weise falsch:
     *
     *   1. Nur der **Abstand** (Fokus blieb) — der Knoten auf Ebene 7 blieb **15 px**, weil die Kamera
     *      weiter auf den Ursprung schaute.
     *   2. Der **grösste** Körper — auf Ebene 4 gewann ein `apps`-Knoten (187) gegen die Sonne (100),
     *      und die Kamera fuhr **weg von der Mitte**.
     *   3. Die **Ausdehnung um den Fokus** (`extentAround`) — dort ist der nächstgelegene Körper aber
     *      ein beliebiger: gemessen (Ebene 3) die **Sonne** mit Radius 100 und ohne Kinder. Also rahmte
     *      sie auf 100 und setzte den Abstand auf **241** — beim Herauszoomen zog sie damit **jedes
     *      Mal zurück**. Der Betreiber: „**es ist immer noch eine sonne obwohl ich ultra weit weg
     *      bin**".
     *
     * **Die Regel, die alle drei Fälle trifft:** gerahmt wird der **grösste Körper der Ebene** — sein
     * eigener Radius **plus der äusserste Ring um ihn**, denn ein Sonnensystem ist nicht sein Stern,
     * sondern Stern plus Ring. Und der **Fokus** wird dabei auf diesen Körper gesetzt, wenn der
     * übergebene Fokus nicht auf ihm liegt; sonst schaut die Kamera an dem vorbei, was sie rahmt.
     *
     * `focus` bleibt als **Eingabe** erhalten, aber nur für den einen Fall, in dem der Nutzer ihn
     * gewählt hat: das **Fokussieren** geht über `focusOn` (Klick auf einen Körper), nicht über diese
     * Funktion. Wer sie ohne Fokus ruft — Zoomen, Start, Ebenenwechsel — bekommt den grössten Körper.
     */
    void focus
    const next = buildScene(this.root, level)
    const alle = [...next.labeled, ...next.placed]
    let groesster: Placed | null = null
    for (const p of alle) {
      if (!groesster || p.body.radius > groesster.body.radius) groesster = p
    }
    if (!groesster) return null

    /*
     * **Sein Ring.** Die Kinder tragen den Bahnradius in den Daten (`orbit`) — das gilt für einen
     * Systemknoten (Kinder = Planeten) **und** für einen Stern, dessen Planeten Geschwister sind:
     * dann kommt der Ring vom **Elternteil** (siehe `solarShowcase`: die Sonne ist ein Blatt).
     */
    const ring = (b: Body): number => {
      const kinder = (b.children ?? []).map((k) => k.orbit ?? 0)
      if (kinder.length > 0) return Math.max(...kinder)
      const eltern = this.elternVon(b)
      const geschwister = (eltern?.children ?? []).map((k) => k.orbit ?? 0)
      return geschwister.length > 0 ? Math.max(...geschwister) : 0
    }
    const ausdehnung = Math.max(groesster.body.radius, ring(groesster.body))
    const distance = framingDistance(ausdehnung, this.viewHeight(), this.camera.fov, 0.75)
    if (!(distance > 0)) return null
    return { focus: [groesster.world[0], groesster.world[1], groesster.world[2]], distance }
  }

  /** Der Elternteil eines Körpers — für Sterne, deren Planeten Geschwister sind. */
  private elternVon(ziel: Body): Body | null {
    const suche = (b: Body): Body | null => {
      for (const kind of b.children ?? []) {
        if (kind.id === ziel.id) return b
        const treffer = suche(kind)
        if (treffer) return treffer
      }
      return null
    }
    return suche(this.root)
  }

  /**
   * **Nur der Abstand — für Aufrufer, denen der Fokus egal ist (Tests, Werkzeuge).**
   */
  idealDistance(level: Level): number {
    return this.framing(level)?.distance ?? 0
  }

  /**
   * **Das Raster bauen — Punkte in der BILDEBENE der Kamera.**
   *
   * ── Der erste Anlauf war falsch, und der Grund ist Geometrie ────────────────────────────
   *
   * Zuerst lag das Raster in der Weltebene `xz` — flach, wie ein Fußboden. Im Bild war es eine
   * **schmale Linie**: eine flache Punktwolke, die man von der Seite ansieht, degeneriert zu einer
   * Kante. Der Betreiber schaut bei 38° Neigung auf die Welt, also **immer** von der Seite.
   *
   * ── Die Lösung: die Bildebene, wie in drawdb ────────────────────────────────────────────
   *
   * In `drawdb.png` ist das Raster **parallel zum Bildschirm** — es sieht immer gleich aus, egal wohin
   * man schaut. Das ist bei einem Zeichenwerkzeug richtig (dort gibt es keine Perspektive) und hier
   * **auch**: der Betreiber will es als **Maßstab**, nicht als Boden.
   *
   * Deshalb ist das Raster jetzt ein **Kind der Kamera** (`this.camera.add`). Damit gilt:
   *
   *   - Es steht **immer** senkrecht zur Blickrichtung — es kann nicht degenerieren.
   *   - Es **zoomt nicht weg**: als Kamerakind behält es seine Lage im Bild.
   *   - Der **Abstand** wächst mit dem Zoom (`GRID_DOTS_Y` Punkte über die sichtbare Höhe), damit die
   *     Dichte gleich bleibt — der Maßstab liest sich auf jeder Ebene gleich.
   *
   * **Was es nicht tut:** es dreht **nicht** mit der Welt. Das ist beabsichtigt — die Weltdrehung ist
   * die 5D-Ansicht, und ein Raster, das mitdreht, wäre ein Boden. Als Maßstab gehört es zum **Auge**.
   */
  private ensureGrid(distance: number): void {
    // **Aus per Voreinstellung** — siehe `GRID_ON`. Der Aufbau darunter bleibt vollstaendig.
    if (!GRID_ON) return
    const step = Math.max(1e-3, (distance * 1.155) / GRID_DOTS_Y)
    // Nur neu bauen, wenn sich der Abstand **deutlich** geändert hat — sonst bei jedem Bild.
    if (this.grid && step / this.gridStep < 1.15 && step / this.gridStep > 0.87) return

    this.gridStep = step
    if (this.grid) {
      this.camera.remove(this.grid)
      this.grid.geometry.dispose()
      const material = this.grid.material as PointsMaterial
      material.map?.dispose()
      material.dispose()
    }

    const haelfte = Math.ceil(GRID_DOTS_Y / 2)
    const positionen: number[] = []
    for (let i = -haelfte; i <= haelfte; i++) {
      for (let j = -haelfte; j <= haelfte; j++) {
        // **In Kamerakoordinaten:** `x` nach rechts, `y` nach oben, `z` negativ nach vorne.
        positionen.push(i * step, j * step, -distance)
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positionen), 3))
    const material = new PointsMaterial({
      /*
       * **Die Punktgrösse hängt an der Sichtweite, nicht am Abstand.** Als Kamerakind ändert sich der
       * Abstand zum Raster nicht — `sizeAttenuation` würde die Grösse also einfrieren. Die Grösse wird
       * deshalb **aus dem Schritt** gerechnet: derselbe Anteil wie beim Weltversuch, damit die Punkte
       * bei jedem Zoom gleich gross **aussehen**.
       */
      size: step * 0.4,
      color: new Color(GRID_COLOR),
      transparent: true,
      opacity: GRID_OPACITY,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true,
    })
    this.grid = new Points(geometry, material)
    this.grid.renderOrder = -1
    this.grid.visible = true
    this.camera.add(this.grid)
    // Und die Kamera in die Szene, damit ihre Kinder gezeichnet werden.
    if (!this.scene.children.includes(this.camera)) this.scene.add(this.camera)
  }

  /**
   * **Die Himmelskoerper ein- oder ausschalten — die Logik bleibt vollstaendig erhalten.**
   *
   * Der Betreiber will das Universe als **leere Sandbox**: keine Planeten, keine Kugeln, nur die
   * Schnittstelle. `rebuild` rechnet weiter (welche Koerper auf welcher Ebene sichtbar sind, samt
   * Mindestgroessen und Ueberblendung), `pick` bleibt die Klickschnittstelle, `updateBodies` bewegt
   * weiter — **geisDrawing** wird nur nichts.
   *
   * **Warum die Kennung zurueckgesetzt wird.** `rebuild` vergleicht eine Kennung und tut nichts, wenn
   * sie gleich bleibt. Ohne diese Zeile bliebe das Umschalten **ohne Wirkung** — ein Fehler, der wie
   * ein kaputter Schalter aussieht.
   *
   * **Und warum der Name `zeichnen` ist und nicht `visuals`.** Er beschreibt genau, was er tut: das
   * Zeichnen der Koerper. Die Einstellung heisst `universe.visuals` — dort ist „Visualisierung" das
   * richtige Wort, weil sie beim Nutzer steht.
   */
  setDrawing(an: boolean): void {
    if (this.zeichnen === an) return
    this.zeichnen = an
    this.signature = ''
    this.world.visible = an
    this.distant.visible = an
    this.labelLayer.classList.toggle('hidden', !an)
  }

  /** Wird gerade geisDrawing? — fuer Werkzeuge und Tests. */
  get isDrawing(): boolean {
    return this.zeichnen
  }

  /**
   * **Der Stand der Ueberblendung — fuer die Messung.**
   *
   * Betreiber: „**ebene ist eine erleichterung der zoom sollte es natuerlich sein also keine ebene
   * direkt change oder so ansonsten fuehl es sich nach ruckeln**". Ob das stimmt, ist keine Frage des
   * Auges, sondern eine **Zahl**: wie viele Koerper sind sichtbar, und mit welcher Deckkraft — ueber
   * den ganzen Zoombereich.
   *
   * `tools/transition.js` liest das je Abstand und legt die Tabelle hin. Ohne diesen Griff muesste das
   * Werkzeug die Szene von aussen erraten — und eine Messung, die raet, bestaetigt nur sich selbst.
   */
  blendState(): {
    readonly level: number
    readonly fade: number
    readonly fadeDistant: number
    readonly fine: number
    readonly grob: number
    readonly grobSichtbar: boolean
    /** Die rohen Zwischenwerte der Rechnung — damit ein Widerspruch messbar ist statt ratbar. */
    readonly oben: number
    readonly unten: number
    readonly anteil: number
    readonly gewicht: number
    readonly abstand: number
  } {
    let fine = 0
    this.world.traverse((n) => {
      const m = (n as Mesh).material as { opacity?: number } | undefined
      if (m && typeof m.opacity === 'number' && m.opacity > 0.002) fine++
    })
    let grob = 0
    this.distant.traverse((n) => {
      const m = (n as Mesh).material as { opacity?: number } | undefined
      if (m && typeof m.opacity === 'number' && m.opacity > 0.002) grob++
    })
    return {
      level: this.built.level,
      fade: this.fade,
      fadeDistant: this.fadeDistant,
      fine,
      grob,
      grobSichtbar: this.distant.visible,
      oben: this.lastFadeCalc.oben,
      unten: this.lastFadeCalc.unten,
      anteil: this.lastFadeCalc.anteil,
      gewicht: this.lastFadeCalc.gewicht,
      abstand: this.lastFadeCalc.abstand,
    }
  }

  rebuild(level: Level, distance: number): void {
    /*
     * **Was diese Methode entscheidet — und was `buildInto` danach tut.**
     *
     * Hier steht **welche** Stufen gebaut werden (die feine und, waehrend eines Uebergangs, die
     * naechstgrobere) und **wie stark** jede zu sehen ist. Das Zeichnen selbst liegt in `buildInto`.
     *
     * Betreiber: „**ebene ist eine erleichterung der zoom sollte es natuerlich sein also keine ebene
     * direkt change oder so ansonsten fuehl es sich nach ruckeln oder veraenderung der kamera
     * perspektive und so an**". Die Ebene ist damit **keine Anzeige** mehr, die umschaltet, sondern nur
     * noch die Wahl, **welche zwei Mengen** gerade ineinander uebergehen.
     */
    const next = buildScene(this.root, level)
    /*
     * **Die Mindestgrösse: ebenenbezogen, nicht abstandsbezogen.**
     *
     * Zwei Anteile, und beide sind nötig (die Rechnung steht bei `SPREIZUNG`):
     *
     *   1. `reference / SPREIZUNG` — der typische Körper dieser Ebene, gestaucht. Das erhält die
     *      **Reihenfolge**: Jupiter bleibt grösser als die Erde, weil `max(r, boden)` monoton ist.
     *      Und es hängt am **Inhalt** der Ebene, nicht am Abstand — deshalb skaliert die Grösse nicht
     *      mehr mit der Kamera, sondern mit dem Bezug.
     *   2. Die harte **Sichtgrenze** in Pixeln, als letzte Sicherung.
     */
    const groesster = Math.max(
      ...next.labeled.map((p) => p.body.radius),
      ...next.placed.map((p) => p.body.radius),
      0,
    )
    const minSize = minBodySize(next.reference, groesster, distance, this.viewHeight(), this.camera.fov)
    /*
     * **Der Uebergang — und warum er INNERHALB einer Stufe liegt.**
     *
     * Betreiber: „**ebene ist eine erleichterung der zoom sollte es natuerlich sein also keine ebene
     * direkt change**". Das Ueberblenden darf deshalb nicht *an* der Stufengrenze passieren, sondern
     * **vor** ihr: waere es umgekehrt, saehe man beim Wechsel die naechstfeinere Stufe wieder
     * auftauchen, und die Ansicht spraenge hin und her.
     *
     * Gerechnet wird mit dem **Abstand** (`distanceForLevel`), nicht mit der bereits gerundeten Ebene:
     * die Grenze von Stufe n liegt bei `distanceForLevel(n+1)/2`, weil `distanceForLevel` die **Mitte**
     * des Bandes liefert. In den letzten 25 % davor beginnt der Uebergang.
     */
    /*
     * **Die Bandgrenzen — und hier stand DREIMAL eine falsche Rechnung.**
     *
     * Der Betreiber: „**ebene ist eine erleichterung der zoom sollte es natuerlich sein also keine
     * ebene direkt change oder so ansonsten fuehl es sich nach ruckeln**". Bis das stimmte, waren drei
     * Anlaeufe noetig, und jeder ist an einer Messung gescheitert:
     *
     *   (1) `oben = distanceForLevel(n)`, `unten = distanceForLevel(n+1)/2` — das ist **zweimal
     *       dieselbe Zahl**, und sie liegt **doppelt** so hoch wie die echte Grenze. Gemessen
     *       (`tools/_sprung.ts`): `anteil` sprang an der Grenze von 0,98 auf −0,48.
     *   (2) `gewicht = anteil` — **falsche Richtung**: beim Herauszoomen muss die feine Stufe
     *       verschwinden, nicht die grobe.
     *   (3) `gewicht = 1 − anteil` mit dem Band `[M/2, 2M]` — die Richtung stimmte, aber das Fenster
     *       war **viel zu frueh**: bei 2 266 (Bandmitte 3 840) stand die feine Stufe schon auf **0,05**,
     *       und die Sonne war **weg**. Gemessen mit dem Bildschirmfoto (`tools/_fein.ts`): ein Sprung
     *       von **54 %** der Bildgroesse an genau dieser Stelle — die einzige grosse Unstetigkeit.
     *
     * ── Die Rechnung, die stimmt ────────────────────────────────────────────────────────
     *
     * Sei `M = distanceForLevel(level)` die **Mitte** des Bandes. `levelForDistance` wechselt bei
     * `2M` — dort beginnt das naechste Band, dessen Mitte `4M` ist. Also gilt:
     *
     *     die feine Stufe ist zustaendig fuer  d ∈ [M/2, 2M]
     *     die grobe Stufe wird sichtbar fuer  d ∈ [2M, 8M]      (das Band der naechsten Stufe)
     *
     * Der Uebergang muss also im **zweiten Teil** des eigenen Bandes liegen und **bei 2M enden** —
     * genau dort wechselt die Ebene. Mit
     *
     *     w = (d/M − 1)     fuer d ∈ [M, 2M]
     *
     * steht `w` bei `M` auf 0 (die feine Stufe allein) und bei `2M` auf 1 (die grobe allein). Und weil
     * die **grobe** Stufe der Ebene n `buildScene(root, n+1)` ist — also genau die **feine** der Ebene
     * n+1 —, wird beim Wechsel zwischen zwei **identischen** Bildern umgeschaltet: unsichtbar.
     */
    const bandMid = distanceForLevel(level)
    const oben = bandMid
    const unten = bandMid * 2
    const anteil = unten > oben ? (distance - oben) / (unten - oben) : 0
    const gewicht = Math.max(0, Math.min(1, anteil))
    this.lastFadeCalc = { oben, unten, anteil, gewicht, abstand: distance }
    const coarseLevel = gewicht > 0 && level < EBENEN_MAX ? ((level + 1) as Level) : null
    // Die Mindestgroesse haengt am Inhalt der Ebene und am Abstand. Beides gehoert **in** die
    // Kennung: ohne den Abstand bliebe die Sichtgrenze beim Hineinzoomen stehen. **Und die grobe
    // Stufe gehoert hinein** — sonst bliebe nach einem Wechsel die alte Ueberblendung stehen.
    const signature = `${level}|${Math.round(minSize)}|${next.placed.map((p) => p.body.id).join(',')}|${next.systems.length}|${coarseLevel ?? '-'}`
    if (signature === this.signature) {
      /*
       * **Nichts neu zu bauen — aber der Uebergang laeuft weiter.**
       *
       * Solange die Kennung gleich bleibt, aendert sich der **Abstand** trotzdem, und damit das
       * Gewicht. Deshalb wird es hier nachgefuehrt: ohne diese Zeile bliebe die Ansicht auf dem
       * Stand des ersten Aufrufs stehen — sie saehe aus wie festgefroren.
       */
      this.fade = 1 - gewicht
      this.fadeDistant = gewicht
      /*
       * **Und das Gewicht wird sofort angewendet — hier, wo es sich aendert.**
       *
       * Der Uebergang laeuft **je Bild**: solange die Kennung gleich bleibt, aendert sich nur der
       * Abstand und damit das Gewicht. Wuerde die Deckkraft nur beim Neuaufbau gesetzt, bliebe sie auf
       * dem Stand des ersten Aufrufs stehen — die Ansicht saehe aus wie **festgefroren**, und zwar
       * mitten im Uebergang.
       */
      this.setGroupOpacity(this.world, this.fade)
      this.setGroupOpacity(this.distant, this.fadeDistant)
      return
    }
    this.signature = signature
    this.built = next
    this.fade = 1 - gewicht
    this.fadeDistant = gewicht
    // **Freigeben, nicht wegwerfen.** `clear()` nimmt die Kinder aus dem Graphen, gibt aber
    // GPU-Speicher nicht frei. Bei jedem Ebenenwechsel entstuenden sonst neue Geometrien,
    // Materialien und Texturen, waehrend die alten im Speicher der Grafikkarte liegen bleiben —
    // nach ein paar Dutzend Zoomstufen ruckelt es, und niemand sieht warum.
    this.disposeChildren()
    this.disposeGroup(this.distant)
    this.dynamic = []
    this.starSpins.length = 0
    this.pickable.length = 0
    /*
     * **Und die grobe Stufe — sie wird VOR dem Uebergang gebaut.**
     *
     * Sie liegt in `this.distant` und ist unsichtbar, solange ihr Gewicht 0 ist. Gebaut wird sie schon
     * dann, wenn der Uebergang **beginnt** — so faellt der Aufbau (bis zu 250 Meshes, gemessen) nicht
     * in das Bild, in dem der Uebergang stattfindet. Genau das war der Ruckler, den der Betreiber
     * gesehen hat: der Aufbau fiel mit dem Bild zusammen, in dem alles umsprang.
     */
    if (coarseLevel !== null && coarseLevel !== next.level) {
      const grob = buildScene(this.root, coarseLevel)
      const grobGroesster = Math.max(
        ...grob.labeled.map((p) => p.body.radius),
        ...grob.placed.map((p) => p.body.radius),
        0,
      )
      const grobMin = minBodySize(grob.reference, grobGroesster, distance, this.viewHeight(), this.camera.fov)
      this.scene.remove(this.distant)
      this.scene.add(this.distant)
      this.buildInto(this.distant, grob, grobMin, false)
      this.distant.visible = true
    } else {
      this.distant.visible = false
    }

    // **Die feine Stufe** — sie ist die, die man anfasst und die sich bewegt (`primaer`).
    this.buildInto(this.world, next, minSize, true)
    this.refreshLabels()
    // Und die Gewichte anwenden. Ohne diese Zeile waeren beide Stufen voll sichtbar — die eine laege
    // deckend auf der anderen, und im Uebergang saehe man **beide** Welten gleichzeitig.
    this.setGroupOpacity(this.world, this.fade)
    this.setGroupOpacity(this.distant, this.fadeDistant)
  }

  /**
   * **Baut den Inhalt EINER Stufe in eine Gruppe.**
   *
   * Herausgeloest aus `rebuild`, weil es seit der Ueberblendung **zwei** Gruppen gibt: die feine
   * (`this.world`) und die naechstgrobere (`this.distant`). Beide werden von derselben Schleife
   * gefuellt — eine zweite Fassung der Schleife waere eine zweite Wahrheit ueber das Zeichnen, und die
   * laufen auseinander (genau das war beim zweiten `SCHWELLE` schon einmal so).
   *
   * **Was `primaer` steuert.** Anklicken (`pickable`) und die Bewegung der Koerper (`dynamic`) gehoeren
   * **nur** zur feinen Stufe:
   *
   *   - Ein Klick soll das Objekt treffen, das man **sieht** — die halbdurchsichtige grobe Stufe liegt
   *     an derselben Stelle und wuerde den Strahl sonst abfangen.
   *   - Die grobe Stufe steht still. Sie ist nur einen Augenblick lang da, und eine Bewegung, die in
   *     einem Bild anfaengt und im naechsten verschwindet, waere ein Zucken.
   */
  private buildInto(
    ziel: Group,
    next: BuiltScene,
    minSize: number,
    primaer: boolean,
  ): void {
    // Gruppenzusammenfassungen: Sternhaufen, Galaxie, Ueberblick — ohne eigenes Licht.
    for (const item of next.placed) {
      if (item.kind !== 'node') continue
      /*
       * **Der Anker wird hier nicht geisDrawing — er bekommt seinen Stern weiter unten.**
       *
       * Auf einer **feineren** Ebene als der Stern fällt er in den Zweig „feiner als die gesuchte
       * Ebene: diese Groessenordnung existiert hier nicht" und landet als **Knoten** in `placed`
       * (die Sonne ist Ebene 3, auf Ebene 1 also ein groeberer Koerper). Er erschiene damit als
       * einfarbige Kugel aus `surfaceMaterial` — und die Sonne, die der Anker weiter unten als
       * **Stern mit Zeichnung** hinzufuegt, steckte darin: im Bild waere es wieder ein oranger Ball
       * ohne Zeichnung, genau wie auf Ebene 4 vorher.
       *
       * Gefunden hat das ein **Test**, nicht ein Bild: die Pruefung „der Anker ist nicht Teil der
       * Ebene" war rot. Sie war **falsch formuliert** — die Sonne liegt auf Ebene 1 als groeberer
       * Koerper zu Recht in `placed`. Was gilt, ist die Regel „**einmal** zeichnen": die
       * Knotenschleife laesst den Anker aus, weil er weiter unten als Stern mit Zeichnung kommt.
       */
      const istAnker = next.anchor !== null && item.body.id === next.anchor.body.id
      if (istAnker) continue
      /*
       * **Eine Zusammenfassung bekommt ihre Zeichnung — und sie strahlt sie selbst aus.**
       *
       * Gemessen war der „kosmische Überblick" auf Ebene 7 ein **dunkelgrüner Ball von 20 px**:
       * `surfaceMaterial` ist ein unbeleuchtetes Standardmaterial (`emissive = 000000`), und ohne
       * Lichtquelle an dieser Stelle bleibt es schwarz. Der Betreiber hat es gesehen — „da fehlt
       * galaxie".
       *
       * `emissive` statt `map` allein, aus demselben Grund wie bei der Sonne: eine Galaxie **leuchtet
       * aus sich heraus**. Hinge ihre Helligkeit an einer Lichtquelle, wäre die eine Hälfte hell und
       * die andere schwarz — und eine halb schwarze Galaxie ist keine.
       *
       * Die Zeichnung kommt aus `aggregateSvg(kind)` — nach der **Art** des Objekts, nicht nach dem
       * Namen. Fehlt sie, bleibt es bei der Farbe aus den Daten.
       */
      const zeichnung = aggregateSvg(item.body.kind)
      const material = surfaceMaterial(item.body.color, zeichnung ? svgTexture(zeichnung) : null)
      if (zeichnung) {
        material.emissiveMap = material.map
        material.emissive = new Color(item.body.color)
        material.emissiveIntensity = 0.85
      }
      const mesh = new Mesh(SPHERE_LOCAL, material)
      mesh.position.set(item.world[0], item.world[1], item.world[2])
      mesh.scale.setScalar(drawnRadius(scaleFor(item.body), minSize))
      ziel.add(mesh)
      if (primaer) this.pickable.push({ mesh, placed: item })
    }

    // Der **Anker**: der Stern, in dessen System man hineinsieht. Ohne ihn ist die Ebene dunkel.
    if (next.anchor) {
      const anker = buildStar(next.anchor.body, minSize)
      anker.mesh.position.set(next.anchor.world[0], next.anchor.world[1], next.anchor.world[2])
      anker.light.position.copy(anker.mesh.position)
      ziel.add(anker.mesh)
      ziel.add(anker.light)
      if (primaer) this.pickable.push({ mesh: anker.mesh, placed: next.anchor })
    }

    // Sonnensysteme: **Stern** mit Licht in der Mitte, dann seine Koerper in Bahnen.
    for (const system of next.systems) {
      /*
       * **Der Stern der Zusammenfassung wird nicht geisDrawing — er steht schon in der Szene.**
       *
       * Das ist der Fehler, der die Sonne unsichtbar gemacht hat, und er ist gemessen:
       *
       *     Sonnensystem   level 4   radius 100   system true
       *       Sonne        level 3   radius 100   kind Stern   orbit 0
       *
       * `buildScene` nimmt **das erste Kind** als Kern des Systems (`kern = children[0]`) — für das
       * Sonnensystem ist das die **Sonne selbst**. Und weil sie auf Ebene 4 als Körper gesammelt
       * wird, landet sie **zusätzlich** in `planets`. Also entstanden **zwei Kugeln an derselben
       * Stelle**: die des Knotens (aus `surfaceMaterial`, einfarbig, ohne Zeichnung) und die der
       * Sonne (aus `buildStar`, mit SVG). Beide auf denselben Radius skaliert, und welche man
       * sieht, entscheidet die Zeichenreihenfolge — im Bild war es ein **einfarbig oranger Ball**,
       * und keine Änderung an der Sonne selbst konnte das beheben.
       *
       * Erkannt wird der Fall an den Daten, nicht an einer Sonderregel: der Kern des Systems liegt
       * auf **Bahnradius 0** und ist ein **Stern**. Dann ist er kein Planet, sondern das Zentrum,
       * und sein Licht gehört zur Sonne, die ohnehin geisDrawing wird.
       */
      const kernIstStern = system.planets.some(
        (p) => p.kind === 'planet' && p.localOrbit === 0 && p.body.kind === 'Stern',
      )
      if (!kernIstStern) {
        const star = buildStar(system.star.body, minSize)
        star.mesh.position.set(system.star.world[0], system.star.world[1], system.star.world[2])
        star.light.position.copy(star.mesh.position)
        // Die Lichter sind **Kinder der Welt**: sie drehen mit der 5D-Drehung ohne eigenes Zutun.
        ziel.add(star.mesh)
        ziel.add(star.light)
        // Der Stern gehört zur Szene wie jeder andere Körper — auch er ist anklickbar.
        if (primaer) this.pickable.push({ mesh: star.mesh, placed: system.star })
      }

      for (let i = 0; i < system.planets.length; i++) {
        const item = system.planets[i]
        if (!item) continue
        /**
         * **Der Bahnradius kommt aus dem Koerper, nicht aus dem Ring-Array.**
         *
         * `system.orbits` traegt fuer **verschachtelte** Koerper eine **0** — sie bekommen keinen
         * Ring, weil ein Mondring im Bild ein Punkt auf der Erde waere (siehe `buildScene`). Wer
         * daraus den Radius liest, laesst den Mond stehen oder — schlimmer — in einem Kreis von
         * Radius 0 um die Sonne laufen.
         *
         * `item.localOrbit` ist der Abstand **zum Elternteil** und fuer beide Faelle richtig.
         */
        const radius = item.localOrbit
        const plane = item.body.position[1]

        // **Ist dieses Kind selbst ein Stern?** Dann ist es der leuchtende Koerper im Zentrum
        // — nicht ein Planet. Genau hier lag ein Fehler: die Sonne wurde als Planet geisDrawing
        // und verschwand damit als dunkle Kugel. Ein Stern ist ein Stern, auch als Kind.
        const isStar = item.body.kind === 'Stern'
        const mesh = isStar ? buildStar(item.body, radius > 0 ? minSize * 0.6 : minSize).mesh : buildPlanet(item.body, minSize)
        mesh.position.set(item.world[0], item.world[1], item.world[2])
        ziel.add(mesh)
        if (primaer) this.pickable.push({ mesh, placed: item })

        const period = item.body.period

        /**
         * **Worum kreist dieser Koerper?**
         *
         * Ein direkter Nachfahre des Kerns kreist um den **Stern**. Ein Enkel — der Mond, die Sonde —
         * kreist um **seinen Elternteil**, der sich selbst bewegt. Erkannt wird das an der Tiefe,
         * die `buildScene` mitgibt: `depth > 0` heisst „ich habe einen beweglichen Mittelpunkt".
         *
         * **Warum das die Ursache des Fehlers war.** Ohne diese Unterscheidung bekam jeder Koerper
         * `center = Sternposition`, und der Mond lief in einem Ring von 70 Einheiten um die Sonne —
         * mit einer Umlaufzeit von 27 Tagen, also schneller als Merkur. Der Betreiber: „mond und
         * voayger folgt erde nicht lol". Er folgte der Erde nie, er kannte sie nicht.
         */
        const elternEintrag =
          item.depth > 0 ? this.dynamic.find((entry) => entry.body.id === item.parentId) ?? null : null

        if (elternEintrag && period && period > 0 && radius > 0) {
          // Ein Mond: kreist um seinen **beweglichen** Elternteil.
          if (primaer) this.dynamic.push({
            body: item.body,
            mesh,
            trail: null,
            parent: elternEintrag,
            center: [system.star.world[0], system.star.world[1], system.star.world[2]],
            orbit: radius,
            omega: angularSpeed(period),
            phase: item.body.phase ?? 0,
            plane,
            span: 0,
            spin: angularSpeed(period) * 6,
          })
        } else if (radius > 0 && period && period > 0) {
          // **Schweif statt Ring:** die Spur, die der Koerper gerade genommen hat.
          const trail = buildTrail(item.body.color, TRAIL_SEGMENTS)
          ziel.add(trail)
          if (primaer) this.dynamic.push({
            body: item.body,
            mesh,
            trail,
            parent: null,
            center: [system.star.world[0], system.star.world[1], system.star.world[2]],
            orbit: radius,
            omega: angularSpeed(period),
            phase: item.body.phase ?? 0,
            plane,
            // Wie weit der Schweif zurueckreicht: ein Stueck der Bahn, nicht die ganze Runde.
            span: (Math.PI * 2) / angularSpeed(period) * TRAIL_FRACTION,
            // **Die Achse dreht sich mit.** Ohne Eigenrotation zeigt eine Textur immer
            // dieselbe Seite, und der Koerper sieht aus wie eingefroren — auch wenn er zieht.
            spin: angularSpeed(period) * 6,
          })
        } else if (isStar) {
          // Der Stern steht still — aber er dreht sich (ein Stern rotiert).
          this.starSpins.push({ mesh, speed: 0.35 })
        }
      }
    }

    this.refreshLabels()
  }

  /**
   * Setzt alle kreisenden Koerper auf ihre Lage zum Zeitpunkt `seconds`.
   *
   * **Der Grund, warum das je Bild laeuft und nicht beim Bauen:** eine Lage, die nur einmal
   * gerechnet wird, ist eingefroren. Genau das hat der Betreiber gesehen — ein Sonnensystem,
   * das wie ein Mobile steht.
   *
   * Die Lage wird nach der **echten Umlaufzeit** gerechnet (Merkur rast, Neptun kriecht), die
   * Geschwindigkeit selbst ist gestaucht, damit beides zugleich sichtbar ist.
   *
   * **Die Reihenfolge ist die Abhaengigkeit, nicht die Laenge.** Ein Koerper mit `parent` wird
   * **nach** seinem Elternteil gerechnet und liest dessen **frische** Lage. Deshalb ist die Liste
   * so sortiert, wie `buildScene` sie fuellt: erst die Kinder des Sterns, dann deren Kinder. Wer
   * hier umsortiert, laesst den Mond um die **alte** Erdposition kreisen — ein Fehler, der wie ein
   * Ruckeln aussieht und keins ist.
   */
  updateBodies(seconds: number): void {
    for (const entry of this.dynamic) {
      // **Der Mittelpunkt.** Beim Stern ist er fest; bei einem Mond ist er die Lage seines
      // Elternteils **in diesem Bild**. Das ist der ganze Unterschied — und die Ursache des
      // Fehlers, den der Betreiber gesehen hat („mond und voayger folgt erde nicht lol").
      const center: readonly [number, number, number] = entry.parent
        ? [entry.parent.mesh.position.x, entry.parent.mesh.position.y, entry.parent.mesh.position.z]
        : entry.center
      const [x, y, z] = orbitPosition(
        center,
        entry.orbit,
        entry.plane,
        entry.phase,
        entry.omega,
        seconds,
      )
      entry.mesh.position.set(x, y, z)
      // **Eigenrotation.** Ohne sie zeigt eine Oberflaeche immer dieselbe Seite und der
      // Koerper sieht eingefroren aus, auch wenn er zieht.
      entry.mesh.rotation.y = seconds * entry.spin

      if (entry.trail) {
        if (!entry.parent) {
          updateTrail(entry.trail, TRAIL_SEGMENTS, seconds, entry.span, (t) =>
            orbitPosition(entry.center, entry.orbit, entry.plane, entry.phase, entry.omega, t),
          )
        } else {
          // **Ein Schweif um einen beweglichen Elternteil.**
          //
          // Die einfache Fassung — „Position zur Zeit t relativ zum JETZIGEN Mittelpunkt" — ergibt
          // keine Bahn, sondern ein Kriechbild: die Erde verschiebt sich zwischen den Punkten um
          // ein Vielfaches des Mondradius, und aus dem Ring wuerde ein Strich. Deshalb wird der
          // **Mittelpunkt von damals** mitgerechnet: beide Koerper werden zur selben Zeit `t`
          // ausgewertet, und die Differenz ist die Bahn, die der Mond wirklich gezogen hat.
          const eltern = entry.parent
          updateTrail(entry.trail, TRAIL_SEGMENTS, seconds, entry.span, (t) => {
            const mutter = orbitPosition(
              eltern.center,
              eltern.orbit,
              eltern.plane,
              eltern.phase,
              eltern.omega,
              t,
            )
            return orbitPosition(mutter, entry.orbit, entry.plane, entry.phase, entry.omega, t)
          })
        }
      }
    }
    for (const star of this.starSpins) star.mesh.rotation.y = seconds * star.speed
  }

  /**
   * Findet den Koerper unter einem Bildschirmpunkt.
   *
   * **Wozu:** „es klicken zu können wäre einfach das man quasi es als objekt fokusieren kann."
   * Anklicken heisst hier **fokussieren** — die Kamera faehrt auf das Objekt, und der naechste
   * Zoom beginnt dort. Kein Menue, kein Auswahlrahmen: der Klick **ist** der Bezugswechsel.
   *
   * Der Strahl wird gegen die **Mesh-Knoten** gefuehrt, nicht gegen die Daten — damit
   * funktioniert das Anklicken auch fuer Koerper, die sich gerade bewegen, ohne dass ihre
   * Position doppelt gefuehrt werden muss.
   */
  pick(normalisedX: number, normalisedY: number): Placed | null {
    if (this.pickable.length === 0) return null
    this.world.updateMatrixWorld()
    this.raycaster.setFromCamera(new Vector2(normalisedX, normalisedY), this.camera)
    const treffer = this.raycaster.intersectObjects(
      this.pickable.map((entry) => entry.mesh),
      false,
    )
    const erster = treffer[0]
    if (!erster) return null
    return this.pickable.find((entry) => entry.mesh === erster.object)?.placed ?? null
  }

  /**
   * Gibt Geometrien, Materialien und Texturen der Kinder frei und leert die Gruppe.
   *
   * Die **gemeinsam** genutzte Kugel (`SPHERE`) und die Kugel der Zusammenfassungen sind
   * ausgenommen: sie sind einmal erzeugt und werden geteilt. Wer sie freigibt, zerbricht die
   * naechste Szene — ein Fehler, der erst beim zweiten Ebenenwechsel auffaellt.
   */
  private disposeChildren(): void {
    this.disposeGroup(this.world)
  }

  /**
   * **Dasselbe fuer eine beliebige Gruppe** — seit der Ueberblendung gibt es **zwei**.
   *
   * Die grobe Stufe in `this.distant` braucht dieselbe Freigabe wie die feine. Eine zweite Fassung der
   * Schleife waere eine zweite Wahrheit ueber das Aufraeumen, und die vergisst man beim naechsten Umbau
   * an einer Stelle — dann leckt genau die Haelfte.
   */
  private disposeGroup(gruppe: Group): void {
    for (const child of [...gruppe.children]) {
      const mesh = child as Mesh & { material?: unknown; geometry?: unknown }
      const material = mesh.material
      if (material && material !== undefined) {
        const list = Array.isArray(material) ? material : [material]
        for (const entry of list) {
          const mat = entry as { map?: { dispose?: () => void } | null; dispose?: () => void }
          mat.map?.dispose?.()
          mat.dispose?.()
        }
      }
      // Die Kugel ist geteilt und darf **nicht** freigegeben werden; die Bahnlinien sind
      // einzeln und muessen weg.
      const geometry = mesh.geometry as { dispose?: () => void } | undefined
      if (geometry && geometry !== SPHERE && geometry !== SPHERE_LOCAL) geometry.dispose?.()
    }
    gruppe.clear()
  }

  /**
   * **Setzt die Sichtbarkeit einer Gruppe — 0 bis 1.**
   *
   * **Warum das noetig ist, obwohl `Group` ein `visible` hat.** `visible` kennt nur **an** oder **aus**:
   * damit waere der Uebergang wieder ein Sprung, nur ein anderer. Was gebraucht wird, ist ein
   * **weiches** Aus- und Einblenden, und das heisst: die Deckkraft jedes Materials.
   *
   * **Und die Lichter werden mitgerechnet.** Eine Sonne strahlt ueber ihr `PointLight`; wuerde nur das
   * Material ausgeblendet, leuchtete die halbdurchsichtige Stufe die andere weiter aus — im Uebergang
   * waere die Szene **doppelt** so hell. Die Intensitaet wird deshalb **gemerkt und mit dem Gewicht
   * multipliziert** (`userData.baseIntensity`), nicht gesetzt: ein zweiter Aufruf darf nicht die halbe
   * Helligkeit als neue Grundlage nehmen.
   */
  private setGroupOpacity(gruppe: Group, wert: number): void {
    const sichtbar = wert > 0.002
    gruppe.visible = sichtbar
    if (!sichtbar) return
    gruppe.traverse((node) => {
      const mesh = node as Mesh & {
        material?: unknown
        isPointLight?: boolean
        intensity?: number
        userData: Record<string, unknown>
      }
      if (mesh.isPointLight && typeof mesh.intensity === 'number') {
        const basis = (mesh.userData.baseIntensity as number | undefined) ?? mesh.intensity
        mesh.userData.baseIntensity = basis
        mesh.intensity = basis * wert
        return
      }
      const material = mesh.material
      if (!material) return
      const list = Array.isArray(material) ? material : [material]
      for (const entry of list) {
        const mat = entry as { transparent?: boolean; opacity?: number }
        if (typeof mat.opacity !== 'number') continue
        mat.transparent = true
        mat.opacity = wert
      }
    })
  }

  /** Setzt die Beschriftungen neu, wenn sich die Objektmenge geaendert hat. */
  private refreshLabels(): void {
    // **Alle** beschrifteten Koerper, auch die Planeten aus den Systemen — sonst bleiben
    // deren Beschriftungen beim Ebenenwechsel stehen.
    const wanted = new Set(this.built.labeled.map((p) => p.body.id))
    for (const [id, el] of this.labels) {
      if (!wanted.has(id)) {
        el.remove()
        this.labels.delete(id)
      }
    }
    for (const item of this.built.labeled) {
      if (this.labels.has(item.body.id)) continue
      const el = document.createElement('span')
      /*
       * **Ein Stern wird als Stern benannt — auch als Kind.**
       *
       * Hier stand `item.kind === 'sun'`, und das traf nur die **Zusammenfassung** eines Systems
       * („Sonnensystem" auf Ebene 4). Seit die Zusammenfassung nicht mehr geisDrawing und nicht mehr
       * benannt wird, kommt der Stern über den Weg der **Kinder** — dort ist sein `kind` „planet",
       * obwohl sein `body.kind` „Stern" ist. Ohne diese zweite Bedingung hätte die Sonne die Farbe
       * eines Planeten bekommen und ihre Akzentfarbe verloren: ein sichtbarer Rückschritt, der in
       * einem Bild nur als „die Sonne sieht anders aus" auffällt.
       */
      const istStern = item.kind === 'sun' || item.body.kind === 'Stern'
      el.className = istStern ? 'label label-sun' : 'label'
      el.textContent = item.body.name
      el.dataset.id = item.body.id
      this.labelLayer.appendChild(el)
      this.labels.set(item.body.id, el)
    }
  }

  /** Ein Bild. `state` kommt aus `camera.ts` — hier wird nur geisDrawing. */
  render(
    state: CameraState,
    width: number,
    height: number,
    dpr: number,
    worldRotation?: Quat,
    seconds = 0,
  ): void {
    this.rebuild(levelForDistance(state.distance), state.distance)

    // **Die Bahnen laufen in ihrer eigenen Zeit.** Sie hat mit der Drehlage der Welt nichts zu
    // tun: die Welt kann stehen, waehrend die Planeten ziehen — und umgekehrt.
    this.updateBodies(seconds)

    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(height, 1)

    // **Erst die Welt drehen, dann die Kamera.** Das ist der Unterschied zwischen „ich drehe
    // den Kopf" und „der Raum dreht sich": die Drehlage der Welt kommt aus der 5D-Ansicht
    // (`main.ts`), die der Kamera aus dem Ziehen. Beides sind Quaternionen, ohne Gimbal-Sperre.
    //
    // Die Lichter sind **Kinder der Welt** (`this.world`), deshalb drehen sie ohne eigenes
    // Zutun mit. Waeren sie Kinder der Szene, beleuchtete die Sonne nach einer Drehung aus der
    // falschen Richtung — ein Fehler, der wie ein Beleuchtungsproblem aussieht, aber keins ist.
    /*
     * **Die Drehung geht um den Fokus — nicht um den Weltursprung.**
     *
     * Das Sonnensystem liegt bei rund 94 000 Einheiten. Eine Drehung des
     * Welt-Objekts um `(0,0,0)` schob es beim ersten Winkel aus dem Bild: die
     * Kamera schaut auf 94 000, die Körper wandern um den Ursprung. Genau das
     * war die leere Fläche bei „Körper und Sternenhimmel".
     *
     * Die Drehung um den Fokus ist `p' = q·(p − c) + c`. Für ein `Group` heißt
     * das: `quaternion = q`, `position = c − q·c`. Dieselbe Rechnung steht in
     * `placeLabels`, damit die Namen auf den Körpern bleiben.
     */
    if (worldRotation) {
      const q = new Quaternion(...worldRotation)
      const c = new Vector3(...state.focus)
      this.world.quaternion.copy(q)
      this.world.position.copy(c).sub(c.clone().applyQuaternion(q))
      this.distant.quaternion.copy(q)
      this.distant.position.copy(this.world.position)
    } else {
      this.world.quaternion.identity()
      this.world.position.set(0, 0, 0)
      this.distant.quaternion.identity()
      this.distant.position.set(0, 0, 0)
    }

    this.camera.position.copy(cameraPosition(state))
    this.camera.quaternion.set(...state.orientation)
    // Die ferne Ebene muss **alles** fassen, was zur Welt gehoert: die eigene Ausdehnung und
    // das Licht der Sterne. War sie zu klein, verschwanden die eigenen Planeten — genau der
    // Fehler der ersten Fassung.
    this.camera.near = Math.max(0.05, state.distance * 0.001)
    this.camera.far = Math.max(state.distance * 40, lightReach(30) * 14)
    this.camera.updateProjectionMatrix()

    /* Die Größe der Sterne steht im Material — siehe `sternGroesseSetzen`. Hier gibt es je Bild nichts zu tun. */

    /*
     * **Und hier wird die Zeichnung erzwungen — bei JEDEM Bild.**
     *
     * `setDrawing` setzt `world.visible` und `distant.visible` — aber **andere Stellen setzen sie
     * zurueck**: `rebuild` baut die Stufen neu und macht die grobe mit `this.distant.visible = true`
     * sichtbar, und die Welt wird beim Aufbau ohnehin eingeschaltet. Gemessen (`tools/_frisch.ts`):
     * nach dem Abschalten stand weiter eine **graue Kugel** im Bild, obwohl `isDrawing` `false` meldete.
     *
     * Statt jede dieser Stellen zu suchen und einzeln zu bewachen, steht die Regel **dort, wo sie gilt**:
     * unmittelbar vor dem Zeichnen. Eine Bedingung an einer Stelle ist weniger wert als eine Bedingung
     * an der Stelle, an der sie wirkt.
     */
    const sichtbar = this.zeichnen
    this.world.visible = sichtbar
    this.distant.visible = sichtbar && this.fadeDistant > 0
    /*
     * **Und das Raster — es bleibt IMMER sichtbar, auch wenn nichts gezeichnet wird.**
     *
     * Das ist der Unterschied zu allem anderen: die Körper sind die **Anzeige**, das Raster ist der
     * **Bezug**. Ohne es wäre die leere Fläche orientierungslos, und der Betreiber hat ausdrücklich ein
     * Raster verlangt („**kannst du stattdessen ein raster implementieren**").
     */
    this.ensureGrid(state.distance)

    this.renderer.render(this.scene, this.camera)
    this.placeLabels(width, height, state.focus)
  }

  /**
   * Positioniert die HTML-Beschriftungen ueber der Flaeche.
   *
   * Beschriftungen sind **HTML, keine Textur**: eine Textur muesste bei jedem Zoom neu erzeugt
   * oder vergroessert werden — vergroessern heisst verwaschen. Genau der Fehler, der die
   * verworfene Messdatei verpixelt hat.
   *
   * Die Groesse folgt der Tiefe: nah = gross, fern = klein. Das ordnet den Text und ist der
   * Tiefenhinweis, den eine flache Zeichnung nicht hergibt.
   */
  private placeLabels(width: number, height: number, focus: readonly [number, number, number]): void {
    // Die Beschriftungen gehoeren zur **Welt**, nicht zum Bildschirm: ihre Punkte werden
    // deshalb erst durch die Weltdrehung gefuehrt und dann projiziert. Ohne das blieben die
    // Namen stehen, waehrend sich die Welt darunter dreht.
    this.world.updateMatrixWorld()
    // Kreisende Koerper haben ihre Lage im **Netz** (`mesh.position`), nicht in den Daten —
    // ihre Beschriftung muss deshalb von dort kommen, sonst bleibt der Name am Startpunkt
    // stehen, waehrend der Planet weiterzieht.
    const live = new Map<string, Vector3>()
    for (const entry of this.dynamic) live.set(entry.body.id, entry.mesh.position)

    /*
     * **Dieselbe Drehung wie die Welt — inklusive Versatz.**
     *
     * `render` dreht um den Fokus (`position = c − q·c`). Wer hier nur
     * `applyQuaternion` schreibt, setzt die Namen an die unverschobene Stelle;
     * sie stünden dann neben den Körpern, die die Drehung mitgemacht haben.
     */
    const q = this.world.quaternion
    const versatz = this.world.position
    const projiziere = (punkt: Vector3): Vector3 =>
      punkt.applyQuaternion(q).add(versatz).project(this.camera)

    // Zwei Durchlaeufe: erst Lage und Groesse sammeln, dann auswaehlen und setzen. Die Auswahl
    // braucht eine **Reihenfolge** (die groessten zuerst) — die sieht kein einzelner Koerper.
    const lagen = new Map<string, { x: number; y: number; tiefe: number; abstand: number }>()
    const kandidaten: Parameters<typeof chooseLabels>[0][number][] = []

    for (const item of this.built.labeled) {
      const el = this.labels.get(item.body.id)
      if (!el) continue
      const livePosition = live.get(item.body.id)
      const v = livePosition
        ? projiziere(livePosition.clone())
        : projiziere(new Vector3(item.world[0], item.world[1], item.world[2]))
      if (v.z > 1) {
        // Hinter der Kamera — nicht spiegeln, sondern weglassen (Konzept §5.4, Regel 3).
        el.style.display = 'none'
        continue
      }
      const x = (v.x * 0.5 + 0.5) * width
      const y = (-v.y * 0.5 + 0.5) * height
      // Die Entscheidung ueber den Namen faellt **nach** dieser Schleife, weil sie eine Reihenfolge
      // braucht (die groessten zuerst). Hier werden nur Lage und Groesse gesammelt.
      lagen.set(item.body.id, { x, y, tiefe: 0, abstand: 0 })

      /*
       * **Die Tiefe kommt aus dem Abstand zur Kamera — nicht aus `v.z`.**
       *
       * `v.z` ist die normierte Tiefe der **Projektion**, und die sättigt: bei einer weiten Sicht
       * liegen alle Körper nahe der **fernen Ebene** (`v.z ≈ 1`), und `(v.z+1)/2` ergibt für jeden
       * fast denselben Wert. Gemessen war die Folge: **alle 22 Beschriftungen 15 px** — die
       * Tiefenstufe tat nichts, obwohl sie im Code stand.
       *
       * **Und der Nenner ist der Sichtabstand, nicht die ferne Ebene.** `camera.far` steht auf dem
       * **40-fachen** des Abstands (damit die Lichter reichen); als Nenner macht er jeden Quotienten
       * zu 0. Gemessen waren die Beschriftungen danach 14,9 px — praktisch unverändert.
       *
       * Richtig ist der **Fokusabstand**: er ist die Bezugsgröße, in der die Körper liegen. Ein
       * Körper an der Kamera ist 1, einer in der doppelten Entfernung ist 0.
       */
      const weltPunkt = livePosition
        ? livePosition.clone().applyQuaternion(q).add(versatz)
        : new Vector3(item.world[0], item.world[1], item.world[2]).applyQuaternion(q).add(versatz)
      const abstand = this.camera.position.distanceTo(weltPunkt)
      const bezug = Math.max(1, this.camera.position.distanceTo(new Vector3(focus[0], focus[1], focus[2])))
      const tiefe = 1 - Math.min(1, abstand / (bezug * 2))
      const lage = lagen.get(item.body.id)
      if (lage) {
        lage.tiefe = tiefe
        // Der Abstand wird **für den Namen des Sterns** gebraucht: er steht unter der Scheibe, und
        // wie tief „unter" ist, hängt an der Bildschirmgrösse des Sterns.
        lage.abstand = abstand
      }

      /*
       * **Eine Zusammenfassung, die auf ihrem eigenen Stern steht, wird nicht benannt — der Anker schon.**
       *
       * „Sonnensystem" (Ebene 4) und „Sonne" (Ebene 3) liegen **auf derselben Stelle**, und beide
       * haben Radius 100 — also gewinnt der Knoten die Überlagerung (grösser heisst breiter heisst
       * zuerst gesetzt) und schreibt sich **über die Sonne**. Im Bild stand „Sonnensystem" genau
       * dort, wo „Sonne" stehen muss, und die inneren Planeten lagen unter dem Namen.
       *
       * **Warum die Bedingung „ist ein System" heisst und nicht „ist die Sonne".** Hier stand
       * zuerst `item.kind === 'sun'` — und das traf **zwei verschiedene Dinge**: den
       * Zusammenfassungsknoten (der weg soll) und den **Anker** (der bleiben muss). Im gemessenen
       * Bild hatte die Sonne danach auf Ebene 2 **gar keinen Namen mehr**: ihr Element stand im DOM,
       * aber `display: none`, weil die Auswahl sie nie zu sehen bekam. Ein Anker, den niemand
       * benennt, ist als Mittelpunkt des Bildes nutzlos.
       *
       * Unterschieden wird an den **Daten**: der Zusammenfassungsknoten trägt `system === true`, der
       * Anker ist der Stern selbst.
       */
      const istZusammenfassung = item.body.system === true || item.kind === 'sun'
      const istAnker = this.built.anchor !== null && item.body.id === this.built.anchor.body.id
      if (istZusammenfassung && !istAnker) continue

      kandidaten.push({
        id: item.body.id,
        radius: item.body.radius,
        cameraDistance: abstand,
        // Der Anker ist ein **Stern** — mit der niedrigeren Grenze aus `labels.ts`.
        kind: istAnker ? 'star' : 'body',
        focused: false,
        /*
         * **Der Anker wird immer benannt.**
         *
         * Er ist der Mittelpunkt des Bildes: ohne seinen Namen weiss man nicht, **worum** die
         * Körper kreisen, die man sieht. Die Überlagerungsregel bleibt zuständig — er setzt sich
         * gegen einen zweiten Namen an derselben Stelle durch (der Stern gewinnt gegen die
         * Zusammenfassung, weil er die genauere Aussage ist).
         */
        imBild: istAnker,
        // Lage und geschätzte Textbreite — die Auswahl braucht sie für die Überlagerung.
        screenX: (v.x * 0.5 + 0.5) * width,
        screenY: (-v.y * 0.5 + 0.5) * height,
        /*
         * **Und die Verschiebung, mit der der Name wirklich steht.**
         *
         * Der Name sitzt **unter** dem Körper. Ohne diese Zahl prüft die Überlagerungsregel
         * Rechtecke am Körper statt am Namen — bei dicht beieinanderliegenden Körpern lässt sie dann
         * Namen zu, die sich verdecken, und weist Namen ab, die sich nicht stören.
         *
         * Dieselbe Rechnung wie beim Setzen (`placeLabels`), und der gerundete Mindestabstand von
         * 2 px + 4 px, damit ein winziger Körper seinen Namen nicht auf sich selbst klebt.
         */
        offsetY:
          Math.max(
            (height * drawnRadius(item.body.radius, 0)) /
              (2 * Math.max(abstand, 1) * Math.tan((this.camera.fov * Math.PI) / 360)),
            2,
          ) + 4,
        textWidth: item.body.name.length * 7.2 + 12,
      })
    }

    /*
     * **Und jetzt wird entschieden, wer seinen Namen bekommt.**
     *
     * Der Betreiber: „wenn es immer anzeigt ist es unschön evt sollten wir name nur ab bestimmte
     * grösse radius also fokusiert". Im gemessenen Bild standen **22 Namen** gleichzeitig, sechs
     * davon als Klumpen um die Sonne — ein Name, der immer da ist, ist kein Hinweis mehr.
     *
     * Die Regel steht in `labels.ts` und ist dort ohne Browser geprueft: ab **14 px Bildschirmgroesse**
     * (Sterne ab 8), der Fokus immer, und je Ebene hoechstens eine feste Zahl.
     */
    const gewaehlt = new Set(chooseLabels(kandidaten, this.built.level, height, this.camera.fov))

    /*
     * **Und wenn nicht geisDrawing wird, gibt es auch keine Namen.**
     *
     * Der Betreiber: „**entferne mal alle anzeige im Universe, nur logic schnittstelle behalten**" und
     * „**nix einfach leer lassen :D**". Die Namen hängen an den **Körpern** — ohne Körper sind sie
     * Namen von Nichts.
     *
     * Hier stand zuerst nur `labelLayer.classList.toggle('hidden')` in `setDrawing`. Das war zu
     * wenig: **diese Schleife setzt `display: block` bei jedem Bild** und macht die Klasse damit
     * wirkungslos. Gemessen: nach dem Abschalten standen weiter **22 Namen** im Bild.
     *
     * Die Sperre steht deshalb **hier**, im Zeichenweg selbst — dort, wo die Sichtbarkeit entschieden
     * wird.
     */
    if (!this.zeichnen) {
      for (const el of this.labels.values()) el.style.display = 'none'
      return
    }

    for (const item of this.built.labeled) {
      const el = this.labels.get(item.body.id)
      const lage = lagen.get(item.body.id)
      if (!el) continue
      if (!lage || !gewaehlt.has(item.body.id)) {
        el.style.display = 'none'
        continue
      }
      el.style.display = 'block'
      /*
       * **Kein Name liegt auf einem Körper — jeder steht darunter.**
       *
       * Hier stand die Verschiebung nur für **Sterne** (`alsStern ? … : 0`). Für alle anderen sass der
       * Name damit auf dem **Mittelpunkt** des Körpers — also mitten auf ihm. Der Betreiber: „ich rede
       * davon das es alles überlappt ist idk why und warum".
       *
       * Warum es auffällt, obwohl der Text auf dem Körper liegt: ein Körper ist **kleiner** als sein
       * Etikett (ein Planet von 8 px trägt einen Namen von 60 px Breite und 18 px Höhe), also ragt der
       * Name über den Körper hinaus **und** verdeckt ihn. Auf einer Ebene mit acht Körpern stehen acht
       * solcher Etiketten, und das Bild ist ein Textteppich — genau der Eindruck, den er beschreibt.
       *
       * Die Verschiebung ist jetzt für **jeden** Körper der **Halbmesser in Pixeln** plus vier Pixel
       * Abstand. Sie kommt aus derselben Grösse wie die Sichtbarkeitsregel in `labels.ts`: was man
       * sieht, bestimmt, wo der Name steht.
       */
      const halbmesserPx =
        (height * drawnRadius(item.body.radius, 0)) /
        (2 * Math.max(lage.abstand, 1) * Math.tan((this.camera.fov * Math.PI) / 360))
      const kante = Math.max(halbmesserPx, 2) + 4
      el.style.transform = `translate(-50%,0) translate(${lage.x.toFixed(1)}px,${(lage.y + kante).toFixed(1)}px)`
      el.style.setProperty('--depth', lage.tiefe.toFixed(3))
    }
  }

  dispose(): void {
    this.renderer.dispose()
  }
}

/** Sichtbare Groesse einer Gruppenzusammenfassung: aus der Masse, nicht roh aus dem Radius. */
function scaleFor(body: Body): number {
  return body.radius * (0.6 + Math.sqrt(Math.max(body.mass, 0.2)) * 0.05)
}

/**
 * Der **Mindestanteil** des Abstands, den ein Koerper als Radius einnimmt.
 *
 * Ohne ihn verschwinden Planeten und sogar Sonnen beim Herauszoomen: ihre Groesse steht in
 * Welteneinheiten, und die werden mit dem Abstand kleiner. Ein Planet in 10 Einheiten ist bei
 * Abstand 20 000 ein **Zehntausendstel** — also unsichtbar. Der Betreiber hat genau das
 * gesehen: „wenn ich raus gehe weiter ist es nur ein punkt".
 *
 * ── Warum hier 0,005 steht und nicht 0,0022 ──────────────────────────────────────────────
 *
 * **Gemessen, nicht geschaetzt** (`tools/scale.ts`). Im Startblick (Kamera bei 4 761) ergibt der
 * echte Massstab:
 *
 *     Sonne  32,7 px      Jupiter  2,0 px      Erde  0,3 px      Merkur  0,2 px
 *
 * Die Sonne ist **109-mal** so gross wie die Erde — das ist keine Einstellung, das ist die Zahl des
 * Sonnensystems. Ein Bild, in dem beide „realistisch" sind, zeigt eine 33-Pixel-Sonne und eine
 * Erde, die **kein Pixel** erreicht. Es gibt keinen Groessen-Exponenten, der das aufloest: das
 * Werkzeug hat fuenf Kandidaten von 0,35 bis 0,75 durchgerechnet, und Jupiter wird mit **jedem**
 * kleineren Exponenten **kleiner**, nicht groesser (0,75 → 2,0 px ist bereits der obere Rand).
 *
 * Also bleibt die Wahl, und sie ist eine Entscheidung, keine Rechnung:
 *
 *   **Realistischer Massstab** heisst: Sonne 33 px, Erde 0,3 px, und die acht Planeten sind acht
 *   unsichtbare Punkte. **Sichtbarkeit** heisst: jeder Koerper ist mindestens ein kleiner Kreis,
 *   und die Groessen **untereinander** bleiben richtig (Jupiter groesser als Erde, Erde groesser
 *   als Merkur) — nur der Abstand zur Sonne ist gestaucht.
 *
 * Der Betreiber hat beides verlangt („sollte schon realistische Relative groesse haben"). Beides
 * zugleich ist bei 109:1 nicht darstellbar, und deshalb steht hier die zweite Wahl: **ein Koerper,
 * den man nicht sieht, traegt keine Bedeutung.** Der Abstand ist der realistische Teil — die
 * Bahnen stimmen jetzt (`openingView` rechnet mit dem echten aeussersten Ring), und die
 * Namensgrenze (`labels.ts`) sorgt dafuer, dass nur benannt wird, was auch zu sehen ist.
 *
 * 0,005 heisst: rund **2,4 px** Radius im Startblick. Genug, dass ein Planet ein Punkt **mit
 * Ausdehnung** ist und nicht ein Pixelrauschen.
 *
 * **Sie ist ersetzt, nicht gelöscht — und zwar aus einem gemessenen Grund.** Sie stand hier bis zur
 * Rückmeldung „die planeten galxien ect sind meistens ultra klein auch beim zoom rein": sie ist für
 * **jeden** Körper dieselbe Zahl und macht damit alle Körper einer Ebene **gleich gross**. Die
 * Grössenverhältnisse, die der Betreiber ausdrücklich verlangt hat, waren damit weg. Jetzt gilt
 * `SPREIZUNG` mit `MIN_BODY_PIXELS` — die Erklärung steht dort, die Tabelle in `tools/scale.ts`.
 */
export const MIN_BODY_FRACTION = 0.005

/**
 * **Wie weit die Grössen einer Ebene gestaucht werden dürfen — und warum nicht mehr pauschal.**
 *
 * **Der Befund des Betreibers:** „die planeten galxien ect sind meistens ultra klein auch beim zoom
 * rein ich denke die grösse zoom sollte in bestimmte ebene geändert geisDrawing werden oder so idk
 * schau dir mal an wie man es realistisch lösen könnte".
 *
 * Er hatte recht, und die Ursache steht in `tools/scale.ts` als Tabelle:
 *
 *     Abstand:   20000  11000   4761   1600    950    400    190     60
 *     Jupiter      7.8    7.8    7.8    7.8    9.9   23.5   49.5  156.6
 *     Saturn       7.8    7.8    7.8    7.8    8.6   20.5   43.1  136.6
 *     Erde         7.8    7.8    7.8    7.8    7.8    7.8    8.2   26.0
 *     Merkur       7.8    7.8    7.8    7.8    7.8    7.8    7.8   12.6
 *
 * **Vier Körper, eine Zahl.** Die pauschale Untergrenze (`Abstand · 0,005`) ist für **jeden** Körper
 * dieselbe. Sie macht damit genau das, was sie verhindern soll: sie **löscht die
 * Grössenverhältnisse**. Jupiter, Saturn, Erde und Merkur sind bis Abstand 190 alle 7,8 px gross —
 * man kann sie nicht unterscheiden. Und die Sonne wächst daneben ins Riesenhafte (33 px → 2598 px),
 * während die Planeten stehen. Genau das Bild, das der Betreiber beschreibt.
 *
 * **Warum eine Untergrenze trotzdem sein muss.** Ohne sie ist die Erde im Startblick **0,33 px** —
 * ein Körper ohne Ausdehnung. Gemessen, nicht geschätzt: 900 · 1,0 / (4761 · tan 30°).
 *
 * ── Die Regel, die beides kann ───────────────────────────────────────────────────────────
 *
 * Die Untergrenze ist **kein fester Bruchteil des Abstands**, sondern ein Bruchteil des **typischen
 * Körpers dieser Ebene** — der Median ihrer Radien:
 *
 *     Untergrenze = Median(level) / SPREIZUNG        und nie über dem grössten Körper
 *
 * Damit gilt:
 *
 *   - Der **grösste** Körper einer Ebene wird nie angehoben.
 *   - Kleine Körper werden auf höchstens `Median/12` gezogen — **nicht** auf die Grösse des Grössten.
 *   - Die **Reihenfolge bleibt erhalten** (`max(r, boden)` ist monoton), und die Spreizung wird auf
 *     `SPREIZUNG` **gestaucht** statt auf 1.
 *   - Bei feinen Ebenen (5–7) ist `Median/12` kleiner als alles Sichtbare — dort tut die Regel nichts.
 *
 * Durchgerechnet (Tabelle in `tools/scale.ts`, Abstand 4761, Ebene 4):
 *
 *     vorher:   grösster 7,8 px   kleinster 7,8 px   Spreizung 1,0×
 *     jetzt:    grösster 61 px    kleinster 4,6 px   Spreizung 40,8×
 *
 * **Warum 12 und warum der Median.** Die Zwölf ist die Stauung, die eine Ebene mit 500-facher
 * Rohspreizung (Ebene 4: 0,38 bis 187) auf eine **lesbare** Spreizung bringt: die kleinen bleiben
 * Punkte mit Ausdehnung, die grossen werden Scheiben. Der Median und nicht der Mittelwert, weil ein
 * einzelner Riesenknoten (ein 9000-Einheiten-Überblick) den Mittelwert nach oben zieht und damit die
 * Untergrenze für **alle** anderen mitzieht.
 */
const SPREIZUNG = 12

/**
 * **Und eine harte Sichtgrenze als letzte Sicherung.**
 *
 * `Median/12` kann bei einer sehr groben Ebene (Median 9000) selbst noch winzig **gerechnet** sein,
 * wenn die Kamera weit weg steht. Deshalb gilt zusätzlich: kein Körper wird kleiner geisDrawing als
 * **`MIN_BODY_PIXELS` Bildpunkte Radius**. Das ist die Zahl, die vorher **alle** Körper auf dieselbe
 * Größe zog; jetzt greift sie nur noch dort, wo die Ebenenregel nicht ausreicht.
 *
 * **Warum sie von 2,4 auf 5 gestiegen ist.** Gemessen war der grösste Körper der Ebenen 8 bis 12
 * **1,1 px und kleiner** — ein Punkt, den man nicht als Objekt erkennt. Der Betreiber: „**komische
 * weisse und grösse das man es gar nicht erkennen kann was es ist**". Bei 5 px Radius (10 px
 * Durchmesser) ist die Zeichnung eines Objekts erkennbar — und die Zeichnung ist der Grund, warum es
 * `aggregateSvg` gibt (`da fehlt galaxie`).
 *
 * Die Reihenfolge bleibt auch hier erhalten, weil `max(a, boden) ≥ max(b, boden)` für `a ≥ b`.
 * **Nur wenn zwei Körper beide unter der Grenze liegen, sind sie gleich gross** — und das ist der
 * bewusste Kompromiss: zwei unsichtbare Körper sind schlimmer als zwei gleich grosse.
 *
 * **Warum die Zahl exportiert ist.** Sie steht in `tests/scale-pixel.test.ts` als **Zusage**: die
 * Grenze, vorwärts in Bildpunkte gerechnet, muss genau diesen Wert ergeben. Ohne den Export müsste der
 * Test die Zahl noch einmal hinschreiben — und eine zweite Kopie einer Zahl ist eine zweite Wahrheit.
 */
export const MIN_BODY_PIXELS = 5

/**
 * **Das Raster — gebaut, aber AUS.**
 *
 * Betreiber, nachdem er es gesehen hat: „**weisst du was scheiss auf den raster es sieht schlimm aus**".
 *
 * Das ist eine klare Ansage, und sie wird befolgt: `GRID_ON = false`. Der Aufbau bleibt vollständig
 * stehen — dieselbe Entscheidung wie bei den Himmelskörpern (`setDrawing`): **abschalten ist nicht
 * löschen.** Wer es wiedersehen will, ändert **eine** Zeile.
 *
 * **Was ich daraus mitnehme.** Ich hatte einen leeren Raum für „orientierungslos" gehalten und ein
 * Raster für den Bezug gebaut. Der Betreiber sieht das anders, und er sieht es zuerst: die Fläche ist
 * **Arbeitsfläche**, kein Koordinatensystem. Was sie braucht, sind **Objekte, die man anfassen kann** —
 * „**ich möchte eher den objekt item datei ect rein tun können verschieben interagieren**". Der Bezug
 * kommt aus dem, was man hineinlegt, nicht aus einem Muster darunter.
 *
 * Die Zahlen bleiben stehen, damit ein zweiter Versuch nicht bei null anfängt: 38 Punkte über die
 * Höhe, ein Viertel des Schritts gross (rund 2 px), 22 % Deckkraft, kühles Grau.
 */
const GRID_ON = false
const GRID_DOTS_Y = 38
const GRID_OPACITY = 0.22
const GRID_COLOR = 0x6f7c92

// Eine Kugel fuer alle Zusammenfassungen. Tausend gleiche Geometrien waeren Unsinn; die
// Sterne und Planeten holen ihre Kugel aus `lighting.ts`, weil sie eigenes Material brauchen.
const SPHERE_LOCAL = new SphereGeometry(1, 24, 16)
