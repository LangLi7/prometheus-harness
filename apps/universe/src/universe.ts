/**
 * Das Universum als Datenmodell.
 *
 * **Die Ordnung ist die des echten Weltalls** — fünf Bezugsebenen, jede um Größenordnungen
 * größer als die vorige:
 *
 *   kosmisches Netz  →  Filament          →  Galaxie        →  Sternhaufen  →  Sonnensystem  →  Planet
 *   alles            mehrere Projekte       ein Projekt       eine Gruppe     ein Workspace    eine Datei
 *
 * Die Ebenen sind **nicht** Zoomstufen im Sinne von „größer gezeichnet". Beim Wechsel der
 * Ebene wechselt der **Bezug**: die Galaxie wird zum Boden, das Sonnensystem rückt ins
 * Zentrum. Genau das meint der Betreiber mit „Fix Fokus" — man ist dann *dort*.
 *
 * **Warum „Filament":** Die größten bekannten Strukturen des Universums heißen Filamente —
 * Wände aus Galaxienhaufen um riesige Hohlräume. Größer als das gibt es nichts.
 * (Wikipedia: Large-scale structure of the universe, Galaxy filament.)
 *
 * Die Zahlen in `mass` sind **Attrappen**. Sie stammen nicht vom Harness; die echte
 * Anbindung (Chatmenge, Speicher, pgvector) ist ein eigener Schritt. Sie sind hier, damit
 * Größe, Helligkeit und Anziehung etwas zu greifen haben.
 */

/**
 * Die Bezugsebenen.
 *
 * **Die Nummer ist die Groesse:** je **groesser** die Zahl, desto **groesser** der Bezug.
 * Ebene 7 ist das Ganze, Ebene 1 ist das Kleinste. Diese Richtung ist kein Geschmack —
 * sie macht „welche Ebene ist gerade ein Punkt" zu einem einfachen Vergleich:
 *
 *     ein Objekt ist genau dann ein Punkt, wenn seine Ebene <= gesuchte Ebene
 *     und alle seine Kinder feiner sind.
 *
 * **Eine Sonne ist ein Stern.** Das ist keine Spitzfindigkeit, sondern die Ordnung selbst:
 * Der leuchtende Koerper im Zentrum eines Sonnensystems **ist** ein Stern, und ein Stern ist
 * genau das, was auf der Stern-Ebene ein Punkt ist. Ein erster Anlauf hatte Sterne nur als
 * Zusammenfassung einer Gruppe behandelt — dann fehlte die Stufe, auf der man einen Stern
 * ansieht, und das Sonnensystem hatte keinen Anfang.
 *
 * **Zwei Anlaeufe waren hier verkehrt**, beide fand die Pruefung, nicht das Auge: erst lief die
 * Nummer gegen die Groesse, dann trugen „Sternhaufen" und „Galaxie" vertauschte Nummern.
 */
import {
  EARTH_DISTANCE,
  SCALE_EXPONENT,
  SUN_RADIUS,
  moonDistance,
  planetMass,
  planetRadius,
  voyagerDistance,
} from './bodies'

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

/**
 * **Die zwölf Bezugsebenen — die astronomische Folge des Betreibers, eine Stufe je Name.**
 *
 * Der Betreiber hat die Reihe zweimal genannt und beide Male die **Zahlen** mitgeliefert:
 *
 *   „**zb diese grösse ordnung reihe folge: planet, Das Sonnensystem, Galaxien & Das Universum**"
 *
 *   Planet 12 742 km  →  Sonnensystem ~64 AE  →  Oortsche Wolke 0,25 Lj  →  Plejaden 40 Lj
 *   →  Milchstrasse 100 000 Lj  →  Lokale Gruppe 10 Mio Lj  →  Laniakea 500 Mio Lj
 *   →  beobachtbares Universum 93 Mrd Lj
 *
 * **Warum es zwölf sind und nicht sieben.** Vorher standen hier sieben Ebenen, und auf den groben
 * Stufen war der einzige Koerper **0,7 Pixel** gross — gemessen, nicht geschaetzt. Die Ursache ist
 * keine Zahl, sondern die **Anzahl**: ein konstanter Faktor je Ebene kann die echten Stufen (Faktor 10
 * bis 6 900, siehe `tools/magnitudes.ts`) nur abbilden, wenn es **genug** Ebenen gibt. Der
 * Betreiber hat die Loesung selbst genannt: „**ich denke die grösse zoom sollte in bestimmte ebene
 * geändert gezeichnet werden**".
 *
 * **Die Namen sind astronomisch, nicht projektbezogen.** Ein erster Anlauf nannte die Stufen nach der
 * Bedeutung im Projekt („Sternhaufen" fuer eine Gruppe, „Kosmischer Ueberblick" fuer alles). Das war
 * eine **zweite Wahrheit** ueber dieselbe Sache: die Kachel heisst „Ebene Universum", und dann darf
 * nicht „Kosmischer Ueberblick" dort stehen. Die Projekt-Bedeutung steht in `item` — dieselbe
 * Unterscheidung wie zwischen einem Objekt und seiner Beschriftung.
 */
export const LEVELS = [
  { level: 1, label: 'Kleinkörper', item: 'Symbol / Funktion', echt: '1 km', echtEn: '1 km' },
  { level: 2, label: 'Planet', item: 'Datei', echt: '12 742 km', echtEn: '12,742 km' },
  { level: 3, label: 'Stern', item: 'Stern des Systems', echt: '1,4 Mio km', echtEn: '1.4 million km' },
  { level: 4, label: 'Sonnensystem', item: 'Workspace', echt: '80 AE', echtEn: '80 AU' },
  { level: 5, label: 'Planetensystem', item: 'System eines Workspace', echt: '0,25 Lj', echtEn: '0.25 ly' },
  { level: 6, label: 'Sternsystem', item: 'Gruppe', echt: '40 Lj', echtEn: '40 ly' },
  { level: 7, label: 'Sternhaufen', item: 'Projekt', echt: '1 500 Lj', echtEn: '1,500 ly' },
  { level: 8, label: 'Welteninsel', item: 'Programm', echt: '100 000 Lj', echtEn: '100,000 ly' },
  { level: 9, label: 'Galaxiengruppe', item: 'Programmfamilie', echt: '10 Mio Lj', echtEn: '10 million ly' },
  { level: 10, label: 'Galaxienhaufen', item: 'Portfolio', echt: '100 Mio Lj', echtEn: '100 million ly' },
  { level: 11, label: 'Superhaufen', item: 'Organisation', echt: '500 Mio Lj', echtEn: '500 million ly' },
  { level: 12, label: 'Universum', item: 'Alles', echt: '93 Mrd Lj', echtEn: '93 billion ly' },
] as const

/**
 * **Die echten Größen — und warum sie nicht aus dem Abstand gerechnet werden.**
 *
 * Der Betreiber: „**ändere masseinheit also einheit in lichtjahre oder so**". Das ist richtig — die
 * Anzeige „4,8 k Einheiten" sagt niemandem etwas. Aber die naheliegende Lösung (den Zoom-Abstand in
 * Kilometer umrechnen) wäre eine **Lüge**, und der Grund steht in `bodies.ts`:
 *
 *   - Die **Abstände** sind gestaucht: Neptun liegt beim **4,2-fachen** Erdenabstand statt beim
 *     30-fachen. Die Bahnen sind also rund **7-mal** enger, als sie sein müssten.
 *   - Die **Größen** sind dagegen aufgeblasen: die Sonne hat `SUN_RADIUS = 100`, ehrlich wäre
 *     `13,4` — sie ist **7,5-mal** zu gross.
 *
 * Zusammen ist das Modell rund **50-mal** „enger" als die Wirklichkeit, und zwar **nicht gleichmässig**:
 * die Abstauchung wächst mit dem Abstand, die Aufblähung nicht. Ein Umrechnungsfaktor existiert damit
 * **nicht** — jede einzelne Zahl wäre erfunden, und eine erfundene Einheit ist schlimmer als keine.
 *
 * **Was stattdessen angezeigt wird.** Jede Bezugsebene trägt ihre **echte astronomische Größe** — die
 * Zahlen, die der Betreiber selbst mitgeliefert hat. Wer auf der Ebene „Welteninsel" steht, liest
 * „100 000 Lj": das ist die Grösse **dieser Stufe**, nicht der Zoomabstand. Und es ist nachprüfbar.
 *
 * **Warum das die bessere Auskunft ist.** „4,8 k Einheiten" beantwortet keine Frage. „Sternsystem ·
 * 40 Lj" beantwortet die einzige Frage, die man an einem Maßstab hat: **in welcher Größenordnung bin
 * ich hier**. Der Zoomabstand bleibt als Zahl daneben stehen — er beschreibt die Kamera, und dafür ist
 * er richtig.
 */
export function realSize(level: Level, deutsch: boolean): string {
  const eintrag = LEVELS.find((l) => l.level === level)
  if (!eintrag) return '—'
  return deutsch ? eintrag.echt : eintrag.echtEn
}

/**
 * Ein Objekt im Universum.
 *
 * `id` ist stabil und **eindeutig** — die Suche findet darüber. `name` ist das, was man
 * eintippt. `focus` ist der Punkt, den die Kamera anfaehrt: der Bezugswechsel setzt die
 * Kamera **in** dieses Objekt, nicht nur nahe heran.
 */
export interface Body {
  readonly id: string
  readonly name: string
  /** Ebene, auf der dieses Objekt **ein Punkt** ist (nicht die seiner Kinder). */
  readonly level: Level
  readonly position: readonly [number, number, number]
  /** Radius in Welteneinheiten — die sichtbare Groesse. */
  readonly radius: number
  /**
   * Attrappen-Masse. Bestimmt Groesse, Helligkeit und (spaeter) Anziehung.
   * Vorbild laut Betreiber: Chatmenge + Speicherverbrauch, Sterne mit Zuschlag.
   */
  readonly mass: number
  /** Was dieses Objekt im Projekt bedeutet, z. B. „Datei", „Workspace", „Baum". */
  readonly kind: string
  readonly color: string
  /**
   * **Ist dieses Objekt ein System?**
   *
   * Ein System hat einen **Stern in der Mitte** und seine Kinder in **Bahnen** — ein
   * Sonnensystem. Alles andere ist ein einzelner Koerper, auch wenn es Kinder hat: eine
   * Galaxie enthaelt Sternhaufen, ist aber selbst kein Stern.
   *
   * Diese Eigenschaft steht **in den Daten**, nicht in einer Regel. Ein erster Anlauf hat sie
   * aus „hat Kinder" geraten — und prompt die Galaxie als Sonnensystem gezeichnet, mit dem
   * eigenen Kern als Sonne. Die Welt haette auf der Galaxie-Ebene falsch ausgesehen, ohne dass
   * ein Test das bemerkt haette.
   */
  readonly system?: boolean
  /**
   * **Umlaufzeit in Erdjahren.** Merkur 0,24 · Erde 1 · Neptun 165. Nur fuer Koerper in einer
   * Bahn. Wer keine Zeit hat, steht still — und das ist bei einer Zusammenfassung richtig.
   */
  readonly period?: number
  /** Stellung auf der Bahn zum Zeitpunkt null, im Bogenmass. */
  readonly phase?: number
  /** Bahnradius in Welteneinheiten (0 fuer das Zentrum eines Systems). */
  readonly orbit?: number
  /** Kinder, falls dieses Objekt ein Bezugssystem ist. */
  readonly children?: readonly Body[]
}

/** Ein Suchtreffer: das Objekt **und** der Weg dorthin, damit man hinsprigen kann. */
export interface Hit {
  readonly body: Body
  /** Namen der Vorfahren von aussen nach innen, z. B. ['prometheus', 'apps', 'web']. */
  readonly path: readonly string[]
  /** Punkt in Weltkoordinaten — aufgeloest ueber die ganze Kette. */
  readonly world: readonly [number, number, number]
}

const C = {
  star: '#ffb35c',
  starHot: '#ff5a1f',
  planet: '#6ba3ff',
  moon: '#8b949e',
  group: '#c9bfb2',
  deep: '#3fb970',
}

/**
 * Ein Himmelskörper in einer Bahn.
 *
 * **`period` und `phase` machen das Sonnensystem lebendig.** Ohne sie stehen die Planeten
 * still — und ein stehendes Sonnensystem sieht aus wie ein Mobile, nicht wie ein Himmel.
 * Der Betreiber: „die anordnung physic planeten rotation ect sollte realistisch 1:1 sein.
 * das es nicht so stock fisch stuck aussieht."
 *
 * `period` ist die **echte Umlaufzeit in Erdjahren** (Merkur 0,24 · Neptun 165). `phase` ist
 * die Stellung zum Zeitpunkt null, damit nicht alle Planeten auf einer Linie starten.
 */
function body(
  id: string,
  name: string,
  kind: string,
  level: Level,
  orbit: number,
  angle: number,
  radius: number,
  mass: number,
  color: string,
  children?: readonly Body[],
  period = 1,
): Body {
  return {
    id,
    name,
    kind,
    level,
    position: [Math.cos(angle) * orbit, Math.sin(angle * 0.3) * orbit * 0.04, Math.sin(angle) * orbit],
    radius,
    mass,
    color,
    period,
    phase: angle,
    orbit,
    ...(children ? { children } : {}),
  }
}

/**
 * **Das echte Sonnensystem** — Sonne, Merkur bis Neptun, mit dem Erdmond.
 *
 * **Warum das hier steht:** Der Betreiber will den Schauplatz sehen, nicht nur die Struktur.
 * Solange kein echtes Projekt angebunden ist, waere die Welt leer — und eine leere Welt zeigt
 * nicht, ob die Darstellung traegt. Also der bekannteste Schauplatz, den es gibt.
 *
 * **Die Abstaende sind gestaucht, nicht massstaetig.** In Wirklichkeit ist Neptun 78-mal so
 * weit von der Sonne wie der Merkur; massstaetig waere Merkur ein Punkt in der Mitte und Neptun
 * weit ausserhalb des Bildes. Deshalb waechst der Bahnradius mit einer **Wurzel**:
 *
 *     orbit = 700 · a^0,55        a = grosse Halbachse in AE
 *
 * **Warum nicht logarithmisch** (ein erster Anlauf tat das): eine Logarithmik staucht zu stark.
 * Damit wuchs die Bahn von Venus zur Erde nur um **24 %** — die inneren Planeten klebten
 * uebereinander, waehrend draussen riesige Luecken blieben. Mit der Wurzel liegt das Verhaeltnis
 * von Neptun zu Merkur bei rund **10** statt bei 78: gestaucht genug, um alles ins Bild zu
 * bekommen, und gespreizt genug, dass die Reihenfolge **sichtbar** bleibt.
 */
export function solarShowcase(): Body {
  /*
   * **Die Grössen und Abstände kommen jetzt aus `bodies.ts` — und sind nachprüfbar.**
   *
   * Der Betreiber: „die grösse der planet und Sollar system vorallem mit dem erde sonne ect sollte
   * schon realistische Relative grösse haben als masstab, diestance ect sieht kurse aus genauso wie
   * grösse". Er hatte recht: hier standen **handgewählte** Zahlen (Merkur 7, Jupiter 26, Sonne 78),
   * die nirgends herkamen. Jetzt steht dort:
   *
   *   Radius     `(r / r_erde)^0,42`  →  Sonne 6,8 · Jupiter 2,6 · Erde 1,0 · Merkur 0,66
   *   Abstand    `300 · a^0,42`       →  Merkur 178 · Erde 300 · Neptun 1240
   *
   * **Ein Exponent für beides.** Dadurch bleiben die Verhältnisse **in sich** stimmig — Jupiter ist
   * 11-mal so gross wie die Erde, und die Sonne 6,8-mal so gross wie Jupiter. Nur die Steilheit ist
   * gestaucht; die Herleitung und ihr Preis stehen in `bodies.ts`.
   */
  const AE = (a: number): number => EARTH_DISTANCE * Math.pow(a, SCALE_EXPONENT)

  // Acht Planeten: grosse Halbachse (AE), **echte Umlaufzeit in Erdjahren**, Farbe nach
  // Erscheinung. Die Umlaufzeit ist Keplers drittes Gesetz in Zahlen — Merkur rast in 88 Tagen
  // einmal herum, Neptun braucht 165 Jahre. Genau das macht aus einem Mobile einen Himmel.
  //
  // **Die Radien sind bewusst klein gehalten.** Ein erster Anlauf hatte Merkur auf 16 und die
  // Sonne auf 78 — dann war Merkurs Bahn nur **26-mal** der Sonnenradius (in der Wirklichkeit
  // 83-mal), und Venus und Erde lagen **8 Einheiten** auseinander statt sich zu beruehren.
  // Der Betreiber hat es gesehen: „die masse der sonne gross und dann noch sehr sehr nah
  // beinander". Die Radien sind jetzt so gewaehlt, dass jede Bahn **mindestens das Vierfache**
  // des groessten Koerpers Abstand haelt — geprueft von `crowding()` in `scene.ts`.
  // **Der Radius kommt aus der Tabelle, nicht aus einer Wunschzahl.**
  const planeten: readonly (readonly [string, string, number, number, string])[] = [
    ['merkur', 'Merkur', 0.387, 0.241, '#9c8a7a'],
    ['venus', 'Venus', 0.723, 0.615, '#e6c88a'],
    ['erde', 'Erde', 1.0, 1.0, '#6ba3ff'],
    ['mars', 'Mars', 1.524, 1.881, '#c1440e'],
    ['jupiter', 'Jupiter', 5.203, 11.86, '#d8a06a'],
    ['saturn', 'Saturn', 9.537, 29.46, '#e3d1a0'],
    ['uranus', 'Uranus', 19.19, 84.01, '#9fd8e0'],
    ['neptun', 'Neptun', 30.07, 164.8, '#4b70dd'],
  ]

  const kinder: Body[] = planeten.map(([id, name, a, jahre, color], index) => {
    const radius = planetRadius(name, 10)
    // Stellungen bewusst ungleich verteilt — acht Planeten auf gleichem Winkel saehen aus
    // wie eine Perlenkette, nicht wie ein Sonnensystem.
    const angle = index * 0.9 + 0.35
    // **Der Mond ist die feinste Stufe dieses Planeten.** Zwei Ebenen unter der Sonne:
    // Sonnensystem (4) → Planet (2) → Kleinkoerper (1). Die 3 dazwischen ist der Stern.
    const children =
      id === 'erde'
        ? [
            body('showcase/erde/mond', 'Mond', 'Mond', 2, moonDistance(), 1.2, planetRadius('Mond', 2), planetMass('Mond'), C.moon, undefined, 0.0748),
            // Eine **Sonde** als feinste Stufe: das ist der Punkt, an dem ein Workspace
            // wirklich anfaengt — ein einzelnes Werkzeug, ein Symbol, eine Funktion.
            body('showcase/erde/voyager', 'Voyager', 'Sonde', 1, voyagerDistance(), 2.4, 1.2, 0.3, '#e8e8e8', undefined, 0.02),
          ]
        : undefined
    return body(
      `showcase/${id}`,
      name,
      'Planet',
      // **Ebene 2: ein Planet ist eine Datei.**
      2,
      AE(a),
      angle,
      radius,
      // Masse grob nach Groesse — sie bestimmt Glorienschein und Beschriftungsgroesse.
      radius / 2,
      color,
      children,
      // Die **echte** Umlaufzeit. Sie ist der Grund, warum Merkur rast und Neptun kriecht.
      jahre,
    )
  })

  return {
    id: 'showcase',
    name: 'Sonnensystem',
    kind: 'Schaustück',
    // **Ebene 4: ein Sonnensystem ist ein Workspace.**
    level: 4,
    position: [-800, 60, 900],
    radius: SUN_RADIUS,
    // **Die Masse des Sterns ist neutral.** Ein erster Anlauf gab ihr 240 — das Dreifache des
    // ganzen Projekt-Stapels —, und weil die Darstellung Groesse und Glorienschein aus der Masse
    // ableitet, wirkte die Sonne wie ein Monstrum. Masse **bedeutet** spaeter Chatmenge und
    // Speicher; solange es keine echten Zahlen gibt, ist jede Zahl eine Behauptung. 100 heisst
    // hier: „noch keine Daten, nichts wird bevorzugt."
    mass: 100,
    color: C.star,
    system: true,
    children: [
      // **Die Sonne ist ein Stern** — Ebene 3. Sie ist der leuchtende Koerper im Zentrum,
      // und ein Stern ist genau das, was auf dieser Ebene ein Punkt ist.
      body('showcase/sonne', 'Sonne', 'Stern', 3, 0, 0, SUN_RADIUS, planetMass('Sonne'), C.star),
      ...kinder,
    ],
  }
}

/**
 * Ein Platzhalter-Workspace.
 *
 * **Kein echtes Projekt** — der Harness ist noch nicht angebunden. Der Name sagt das
 * ausdruecklich, damit niemand glaubt, hier laege schon Code.
 */
function placeholderSystem(
  id: string,
  name: string,
  mass: number,
  offset: readonly [number, number, number],
  files: readonly string[],
): Body {
  const children = files.map((file, i) =>
    body(
      `${id}/${file}`,
      file,
      'Datei',
      // Ebene 2: eine Datei ist ein Planet.
      2,
      260 + i * 190,
      (i / files.length) * Math.PI * 2 + 0.4,
      11 + Math.max(0, 3 - i) * 3,
      Math.max(0.4, 8 - i * 2),
      i === 0 ? C.starHot : C.planet,
      undefined,
      1 + i * 0.6,
    ),
  )
  return {
    id,
    name,
    kind: 'Platzhalter',
    // Ebene 4: ein Workspace ist ein Sonnensystem.
    level: 4,
    position: offset,
    radius: 95 + mass * 2,
    mass,
    color: C.star,
    system: true,
    children,
  }
}

/**
 * **Zwei Körper sollen sich nicht durchdringen — die Wache.**
 *
 * Betreiber, mit einem Bild von zwei ineinandergeschobenen Kugeln: „**überlappen? xD sieht strange aus
 * lol**" und „**es ist 3D raum mit zoom aber es sollte nicht so unrealistisch aussehen**".
 *
 * Gemessen (`tools/ui-surface.ts`) waren **neun** Eltern-Kind-Paare betroffen, mehrere mit
 * **Abstand 0** — zwei Körper an derselben Stelle:
 *
 *     lokale Gruppe        -> prometheus      Abstand 0
 *     Sternhaufen          -> planetensystem  Abstand 0
 *     kosmischer Überblick -> Laniakea        22 % der Radiensumme
 *     Laniakea             -> Galaxienhaufen  19 %
 *
 * **Warum das entsteht.** Die Versätze in den Daten sind von Hand gesetzt, die Radien auch — beide nach
 * Gefühl. Zwei Körper, deren Radien zusammen grösser sind als ihr Abstand, **durchdringen** sich. Im
 * Bild sieht das wie ein Darstellungsfehler aus, ist aber einer in den **Daten**.
 *
 * ── Was die Wache unterscheidet, und warum das nötig ist ────────────────────────────────
 *
 * Ein erster Anlauf hätte **jedes** zu nahe Kind weggeschoben — und damit die **Sonne** aus der Mitte
 * gerissen. Die Sonne liegt bei Abstand 0 vom Sonnensystem, und das ist **richtig**: ein Stern ist der
 * Kern seines Systems, nicht ein Körper daneben.
 *
 * Deshalb drei Fälle, und nur zwei werden geschoben:
 *
 *   1. **Der Kern eines Systems** (`kind === 'Stern'`) bleibt, wo er ist — er **ist** der Mittelpunkt.
 *   2. **Ein Kind, das auf seinem Elternknoten liegt** (`Abstand ≈ 0`), wird auf die Oberfläche
 *      gesetzt. Es gibt keine Richtung, in die man schubsen könnte, also nimmt die Wache eine feste.
 *   3. **Sonst**: das Kind wird so weit hinausgeschoben, dass sich die Kugeln höchstens **berühren**.
 *
 * **Was sie ausdrücklich NICHT prüft:** ob ein Kind weiter draussen liegt als der Elternkörper gross
 * ist. Die Sonne hat Radius 100, Neptun kreist bei 1 254 — der Planet liegt **zwölfmal** weiter draussen
 * als die Sonne gross ist, und das ist richtig. Radien sind eine Darstellung der **Bedeutung**,
 * Abstände eine der **Struktur**; beide sind mit demselben Exponenten gestaucht (`SIZE_EXPONENT`).
 */
const SEPARATION = 1.06

function entzerre(
  elternRadius: number,
  kindRadius: number,
  kind: Body,
  versatz: readonly [number, number, number],
): readonly [number, number, number] {
  // (1) **Der Kern bleibt in der Mitte.**
  if (kind.kind === 'Stern') return versatz

  const abstand = Math.hypot(versatz[0], versatz[1], versatz[2])
  const noetig = (elternRadius + kindRadius) * SEPARATION
  if (abstand >= noetig) return versatz

  // (2) **Genau aufeinander** — keine Richtung vorhanden, also eine feste nehmen.
  if (abstand < 1e-6) {
    return [noetig * 0.62, noetig * 0.5, noetig * 0.4]
  }
  // (3) **Zu nah** — in die vorhandene Richtung hinaus.
  const faktor = noetig / abstand
  return [versatz[0] * faktor, versatz[1] * faktor, versatz[2] * faktor]
}

/** Ein Sternsystem: mehrere Workspaces, die zusammengehoeren. Eine Gruppe von Apps. */
function cluster(
  id: string,
  name: string,
  level: Level,
  offset: readonly [number, number, number],
  systems: readonly Body[],
): Body {
  const mass = systems.reduce((sum, s) => sum + s.mass, 0)
  return {
    id,
    name,
    kind: 'Gruppe',
    level,
    position: offset,
    radius: 320 + mass * 3,
    mass,
    color: C.group,
    children: systems,
  }
}

/**
 * **Ein Knoten, der nur zusammenfasst — fuer die Ebenen dazwischen.**
 *
 * Mit zwoelf Ebenen braucht jede Stufe **etwas**, das auf ihr steht. Der Beispielbaum hat aber nur
 * fuenf echte Groessen: Kleinkoerper, Planet, Stern, System und Gruppe. Die sieben Stufen darueber
 * waeren sonst **leer** — und ein leeres Bild ist keine Aussage ueber die Darstellung.
 *
 * Deshalb gibt es diese Knoten: sie tragen einen **Namen** aus der astronomischen Folge und **ein**
 * Kind. Sie sind keine Erfindung von Inhalt — sie stehen ausdruecklich als `Umschlag` da, und ihr Name
 * sagt, was sie sind. Wer echte Daten anbindet, ersetzt sie durch die wirkliche Struktur.
 *
 * `versatz` ist die Lage **relativ zum Elternknoten**, nicht zur Welt: die Weltlage eines Objekts ist
 * die Summe ueber alle Vorfahren (siehe `search`).
 */
function umschlag(
  id: string,
  name: string,
  level: Level,
  radius: number,
  versatz: readonly [number, number, number],
  kind: string,
  farbe: string,
  kinder: readonly Body[],
): Body {
  return {
    id,
    name,
    kind,
    level,
    position: versatz,
    radius,
    mass: kinder.reduce((sum, k) => sum + k.mass, 0),
    color: farbe,
    children: kinder,
  }
}

/**
 * **Die Wache anwenden — auf den ganzen Baum, von unten nach oben.**
 *
 * Betreiber: „**sollte zukünftig vermeiden ik ist 3D raum mit zoom aber es sollte nicht so unrealistisch
 * ausehen**". Die Regel steht in `entzerre`; hier wird sie **einmal** über den fertigen Baum gelegt,
 * statt jeden der neun Versätze von Hand zu korrigieren. Das hat einen Grund: **wer die Daten später
 * ändert, kann den Fehler nicht wieder einbauen** — die Wache läuft immer.
 *
 * **Von unten nach oben.** Ein Kind wird verschoben, bevor sein Elternteil geprüft wird — sonst würde
 * die Rechnung mit einer Lage arbeiten, die gleich darauf nicht mehr stimmt.
 *
 * **Was sie nicht anfasst:** den Kern eines Systems, und alles, was schon genug Abstand hat.
 */
function entzerreBaum(eltern: Body): Body {
  const kinder = (eltern.children ?? []).map((kind) => entzerreBaum(kind))
  if (kinder.length === 0) return eltern
  return {
    ...eltern,
    children: kinder.map((kind) => ({
      ...kind,
      position: entzerre(eltern.radius, kind.radius, kind, kind.position),
    })),
  }
}

/**
 * Das Beispiel-Universum.
 *
 * **Zwei Dinge stehen nebeneinander, und sie sind verschieden:**
 *
 *   - Das **Schaustück** (`solarShowcase`): das echte Sonnensystem mit Sonne, Merkur bis
 *     Neptun und dem Mond. Es ist der **Schauplatz** — solange kein Projekt angebunden ist,
 *     waere die Welt leer, und eine leere Welt zeigt nicht, ob die Darstellung traegt.
 *   - Die **Platzhalter** fuer den spaeteren Projekt-Stack: drei Workspaces, die ausdruecklich
 *     `Platzhalter` heissen, damit niemand glaubt, dort laege schon Code.
 *
 * **Die Abstaende sind bewusst weit.** Ein erster Anlauf hatte alles dicht beieinander; die
 * Sternhaufen ueberlagerten sich und die Beschriftungen schoben sich zu einem Textbrei. Der
 * Betreiber: „ist es zu nah dran, wenn projekte, workspaces ect nah beieinander ist sollte es
 * zusammen kommen". Deshalb liegt jede Gruppe **weit** fuer sich — und was zusammengehoert,
 * liegt zusammen.
 *
 * ── Warum der Baum jetzt zwoelf Ebenen hoch ist ─────────────────────────────────────────
 *
 * Vorher endete er auf Ebene 7. Mit der neuen Skala waeren die Ebenen 8 bis 12 **leer** gewesen, und
 * ein leeres Bild sagt nichts darueber, ob die Darstellung traegt. Die Stufen 8 bis 12 sind deshalb
 * **Umschlaege** (`umschlag`): sie tragen einen astronomischen Namen und genau ein Kind. Damit sieht
 * jede Stufe etwas, und die Kette der Groessenordnungen ist lueckenlos:
 *
 *     4  Sonnensystem      das echte System mit der Sonne
 *     5  Planetensystem    der Umschlag um das Sonnensystem
 *     6  Sternsystem       die Gruppe „projekt-stack" mit ihren drei Workspaces
 *     7  Sternhaufen       der Umschlag, der die Gruppe umfasst
 *     8  Welteninsel       das Projekt „prometheus" — eine Galaxie
 *     9  Galaxiengruppe    der Umschlag um die Galaxie
 *    10  Galaxienhaufen    der naechste Umschlag
 *    11  Superhaufen       der naechste
 *    12  Universum         alles
 *
 * **Die Umschlaege liegen bewusst etwas neben ihrem Kind** (`versatz`), nicht genau darauf: ein
 * Umschlag, der exakt auf seinem Kind sitzt, ist im Bild nicht zu unterscheiden — man sieht nur eines
 * von beiden und weiss nicht, welche Stufe man gerade ansieht.
 */
export function exampleUniverse(): Body {
  // Der Schauplatz liegt naeher an der Mitte — er ist der Grund, warum man hinschaut.
  const showcase = solarShowcase()

  /*
   * **Ebene 5: das Planetensystem — das, was um einen Stern kreist.**
   *
   * Und hier war eine **Lücke**, die dieses Beispiel fast gehabt hätte. Vorher hing das Sonnensystem
   * (Ebene 4) direkt unter dem Projekt (Ebene 8) — die Stufen 5, 6 und 7 waren **leer**. Gefunden hat
   * das ein Test („describeLevel zeigt jede Ebene mit ihrem Inhalt"), nicht das Auge: ein Baum mit
   * einer Lücke sieht in der Ansicht zunächst in Ordnung aus.
   *
   * Jetzt traegt jede Stufe etwas, und die Kette ist lueckenlos:
   *
   *     4  Sonnensystem     das echte System mit der Sonne
   *     5  Planetensystem   der Umschlag darum — Planeten, Mond, Sonde
   *     6  Sternsystem      die Gruppe „projekt-stack“ mit ihren drei Workspaces
   *     7  Sternhaufen      der Umschlag, der das Sternsystem umfasst
   */
  const planetensystem = umschlag(
    'planetensystem',
    'planetensystem',
    5,
    2600,
    [0, 0, 0],
    'Planetensystem',
    C.group,
    [showcase],
  )

  /*
   * **Ebene 6: das Sternsystem.** Eine Gruppe von Workspaces, die zusammengehoeren.
   *
   * Es steht **neben** dem Planetensystem unter demselben Sternhaufen (Ebene 7) — nicht darin. Das war
   * der zweite Anlauf: zuerst hing der Stapel **unter** dem Planetensystem, und damit war er ein Kind
   * eines Systems, zu dem er nicht gehoert.
   */
  const stack = cluster('stack', 'projekt-stack', 6, [17_000, 900, -11_000], [
    placeholderSystem('stack/apps', 'apps', 46, [0, 0, 0], ['main.ts', 'App.tsx', 'app.css']),
    placeholderSystem('stack/packages', 'packages', 38, [1400, 200, 600], ['index.ts', 'types.ts']),
    placeholderSystem('stack/services', 'services', 33, [-1200, -180, 900], ['main.go', 'api.go']),
  ])

  /*
   * **Ebene 7: der Sternhaufen — ein Haufen VON Sternsystemen.**
   *
   * Er enthaelt beide: das Planetensystem (unser Sonnensystem mit seinen Planeten) und das Sternsystem
   * des Projekts. Das ist die Stufe, die vorher ganz fehlte.
   *
   * **Zwei Anlaeufe waren hier falsch, und beide fand eine Pruefung:**
   *
   *   1. Der Umschlag hing **neben** dem Sternsystem statt darum — damit hing der Projekt-Stapel
   *      **zweimal** im Baum. Gefunden von `tests/universe.test.ts` („jede Kennung ist eindeutig").
   *      In `search` haette derselbe Stapel zwei Wege gehabt, und ein Sprung waere im Zweifel beim
   *      falschen gelandet.
   *   2. Danach hiess der Stapel selbst „Sternsystem" und stand auf Ebene 6 — aber seine Kinder
   *      (die Workspaces) sind Ebene 4. Damit **uebersprang** die Kette die Stufe 5, und
   *      `describeLevel(6)` fand nichts.
   */
  const sternhaufen = umschlag(
    'sternhaufen-umschlag',
    'Sternhaufen',
    7,
    3400,
    [2600, -300, 1500],
    'Sternhaufen',
    C.group,
    [planetensystem, stack],
  )

  const galaxie: Body = {
    id: 'prometheus',
    name: 'prometheus',
    kind: 'Projekt',
    // **Ebene 8: ein Projekt ist eine Welteninsel** — eine Galaxie aus Sternhaufen.
    level: 8,
    position: [0, 0, 0],
    radius: 1400,
    mass: 100,
    color: C.starHot,
    children: [sternhaufen],
  }

  /*
   * **Und darueber die Umschlaege bis zum Universum.**
   *
   * Jeder liegt ein Stueck neben seinem Kind, damit im Bild sichtbar bleibt, **welche** Stufe man
   * ansieht. Die Versaetze wachsen mit der Stufe: ein Umschlag auf Ebene 11 mit einem Versatz von
   * 1000 Einheiten laege im Bild **auf** seinem Kind von Ebene 12.
   */
  const gruppe = umschlag('lokale-gruppe', 'lokale Gruppe', 9, 5200, [4200, 600, -2800], 'Galaxiengruppe', C.group, [galaxie])
  const haufen = umschlag('haufen', 'Galaxienhaufen', 10, 14_000, [-9000, 1400, 6000], 'Galaxienhaufen', C.deep, [gruppe])
  const superhaufen = umschlag('superhaufen', 'Laniakea', 11, 42_000, [24_000, -3000, 16_000], 'Superhaufen', C.deep, [haufen])

  // Der Ueberblick: alles. Der Wurzelknoten — er ist der Bezug beim weitesten Herauszoomen.
  /*
   * **Und die Wache läuft über den ganzen Baum.**
   *
   * Betreiber: „**sollte zukünftig vermeiden**". Deshalb steht `entzerreBaum` **hier**, an der einen
   * Stelle, an der das Beispiel-Universum entsteht — und nicht als Handkorrektur an den neun
   * überlappenden Versätzen. Wer die Daten später ändert, kann den Fehler damit **nicht wieder
   * einbauen**: die Wache läuft bei jedem Aufbau.
   */
  return entzerreBaum(
    umschlag('gesamt', 'kosmischer Überblick', 12, 90_000, [0, 0, 0], 'Alles', C.deep, [superhaufen]),
  )
}

// ── Suche ────────────────────────────────────────────────────────────────────────────────

/**
 * Durchsucht den ganzen Baum und loest jeden Treffer in **Weltkoordinaten** auf.
 *
 * Nötig, weil die Positionen der Kinder **relativ zu ihrem Elternobjekt** stehen. Ein
 * Treffer auf Ebene 5 hat damit drei Vorfahren, deren Verschiebungen alle mitzaehlen —
 * wer das vergisst, springt ins Leere.
 */
export function search(root: Body, query: string): readonly Hit[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []
  const words = needle.split(/\s+/).filter((word) => word !== '')

  const hits: Hit[] = []
  const walk = (
    body: Body,
    path: readonly string[],
    origin: readonly [number, number, number],
  ): void => {
    const world: [number, number, number] = [
      origin[0] + body.position[0],
      origin[1] + body.position[1],
      origin[2] + body.position[2],
    ]
    // „main.ts", „unit-export", „pmh-nix" — ein Tippender schreibt Leerzeichen statt
    // Bindestrich und Punkt. Deshalb werden beide Seiten auf Buchstaben und Ziffern
    // eingedampft, **bevor** verglichen wird. Ohne das findet „pmh nix" das Plugin
    // `pmh-nix` nicht, obwohl jeder es so eingeben wuerde.
    const haystack = flatten(`${body.name} ${body.kind}`)
    if (words.every((word) => haystack.includes(flatten(word)))) hits.push({ body, path, world })

    for (const child of body.children ?? []) {
      walk(child, [...path, body.name], world)
    }
  }
  walk(root, [], [0, 0, 0])
  return hits
}

/** „unit-export.ts" → „unitexportts". Nur Buchstaben und Ziffern bleiben. */
function flatten(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Die **direkten Kinder** eines Systems, mit ihrer Lage **relativ zu ihm**.
 *
 * **Warum es diese Funktion gibt — und warum `search` sie nicht ersetzt.** Der Startblick soll so
 * weit weg stehen, dass der äusserste Ring ins Bild passt. Dafür braucht er den **Bahnradius**;
 * `search` liefert aber die **Weltlage**, also die Summe über alle Ebenen darüber. Im gemessenen
 * Bild war das der Fehler:
 *
 *     äusserster:  index.ts bei 22434 Einheiten
 *     Startblick:  Kamera bei 85251 Einheiten
 *     Sonne … 1,8 px
 *
 * `search(universum, 'Neptun')[0]` findet den **tiefsten** Neptun — im Dateibaum des Beispiels
 * liegt ein Neptun-artiger Knoten unter mehreren Zusammenfassungen. Seine Weltlage ist 22 434
 * statt 1 253, der Startblick rechnet `3,8 · 22434`, und die Sonne ist ein Punkt. Kein Fehler
 * fliegt, keine Ebene ist falsch — es ist nur **der falsche Abstand**, und deshalb war er an einer
 * Zahl im Bild zu erkennen und nicht an einer Meldung.
 *
 * Sichtbar heisst: ein Ring. Ein Sternhaufen ist kein Ring, auch wenn er Kinder hat.
 */
export function outwardBodies(system: Body): readonly { readonly body: Body; readonly radius: number }[] {
  return (system.children ?? []).map((body) => ({
    body,
    radius: Math.hypot(body.position[0], body.position[2]),
  }))
}

/**
 * Der **weiteste Körper einer Bahnebene** — der, der den Startblick bestimmt.
 *
 * **Nur Körper mit einer Bahn zählen, und das ist keine Kleinigkeit.** Im Beispiel ist „Voyager"
 * der weiteste Körper (2 908 Einheiten gegen Neptun 1 253), aber eine **Sonde kreist nicht** — sie
 * ist nur weit weg. Wer sie mitzählt, stellt den Startblick auf 11 049 statt 4 761, und im Bild ist
 * die Sonne dann **14 Pixel** statt 33: sie ist noch da, aber das System ist ein Fleck. Gemessen mit
 * `tools/scale.ts`, nachdem zwei Korrekturen an der Sonne selbst nichts geändert hatten — der
 * Fehler sass im **Abstand**.
 *
 * Ein Körper „in einer Bahn" hat Umlaufzeit und Bahnradius. Das steht in den Daten, es wird nicht
 * aus dem Namen geraten.
 */
export function outermostOf(system: Body): { readonly body: Body; readonly radius: number } | null {
  let weit: { body: Body; radius: number } | null = null
  for (const eintrag of outwardBodies(system)) {
    const { body } = eintrag
    if (body.orbit === undefined || body.period === undefined) continue
    if (!weit || eintrag.radius > weit.radius) weit = { body, radius: eintrag.radius }
  }
  return weit
}

/** Grober Rang: exakter Name zuerst, dann Praefix, dann Teilwort, dann der Rest. */
export function rankHits(hits: readonly Hit[], query: string): readonly Hit[] {
  const needle = query.trim().toLowerCase()
  const score = (hit: Hit): number => {
    const name = hit.body.name.toLowerCase()
    if (name === needle) return 0
    if (name.startsWith(needle)) return 1
    if (name.includes(needle)) return 2
    return 3
  }
  return [...hits].sort((a, b) => score(a) - score(b) || a.body.name.length - b.body.name.length)
}

/** Zaehlt alle Objekte unterhalb eines Punktes — fuer die Anzeige „247 Knoten". */
export function countBodies(root: Body): number {
  let n = 0
  const walk = (body: Body): void => {
    n += 1
    for (const child of body.children ?? []) walk(child)
  }
  walk(root)
  return n
}
