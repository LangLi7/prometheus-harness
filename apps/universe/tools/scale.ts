/**
 * **Was wirklich auf dem Bildschirm steht** — gerechnet, ohne Browser.
 *
 * **Warum dieses Werkzeug existiert.** Ich habe dreimal hintereinander „die Sonne ist zu klein"
 * mit einer Änderung an einer Zahl beantwortet und danach ein Bild angesehen, in dem wieder etwas
 * anderes zu klein war. Das ist Raten mit Zwischenschritt.
 *
 * Die Geometrie ist vollständig rechenbar: die Körpergrössen stehen in `bodies.ts`, der Startblick
 * in `camera.ts`, und die Bildschirmgrösse ist eine Formel. Also wird sie gerechnet —
 * **eine Zahl je Körper, in Pixeln**, so wie der Nutzer sie sieht.
 *
 * Aufruf:  bun tools/scale.ts
 */
import { exampleUniverse, outermostOf, search } from '../src/universe'
import {
  EARTH_DISTANCE,
  SCALE_EXPONENT,
  SIZE_EXPONENT,
  SUN_RADIUS,
  planetRadius,
  factsFor,
  relativeDistance,
} from '../src/bodies'
import { openingView } from '../src/camera'
import { buildScene } from '../src/scene'

const HOEHE = 900
const FOV = 60

/** Die Bildschirmgrösse eines Körpers: Höhe · r / (d · tan(fov/2)). */
function pixel(radius: number, abstand: number): number {
  return (HOEHE * radius) / (abstand * Math.tan((FOV * Math.PI) / 360))
}

const universum = exampleUniverse()
const treffer = search(universum, 'Sonnensystem')[0]
if (!treffer) throw new Error('Sonnensystem nicht gefunden')
const sonne = treffer.body

/** Alle Körper mit ihrer Lage — die Positionen sind **lokal**, also über den Weg aufsummiert. */
interface Lage {
  readonly name: string
  readonly radius: number
  readonly x: number
  readonly y: number
  readonly z: number
}
function alle(b: typeof sonne, x = 0, y = 0, z = 0): Lage[] {
  const px = x + b.position[0]
  const py = y + b.position[1]
  const pz = z + b.position[2]
  const selbst: Lage[] = [{ name: b.name, radius: b.radius, x: px, y: py, z: pz }]
  for (const kind of b.children ?? []) selbst.push(...alle(kind, px, py, pz))
  return selbst
}

/**
 * **Nur das Sonnensystem** — nicht der ganze Baum.
 *
 * Der erste Anlauf lief über `exampleUniverse()` und meldete „äusserster: index.ts bei 22434
 * Einheiten": die Dateien der äusseren Ebenen sind weiter draussen als Neptun, also bestimmten
 * **sie** den Startblick. Eine Messung, die den ganzen Baum nimmt, misst damit etwas anderes als
 * das Bild — und genau diesen Unterschied hat sie dann gefunden.
 */
const lagen = alle(sonne)
// Der **Bahn**radius, nicht die Weltlage: der Startblick braucht den Abstand zur Sonne.
// Die Sonne selbst liegt im Ursprung des Systems, ihre Kinder tragen `orbit`.
const sx = 0
const sy = 0
const sz = 0

const koerper = lagen
  .map((b) => ({ name: b.name, radius: b.radius, abstand: Math.hypot(b.x - sx, b.z - sz) }))
  .filter((b) => b.abstand > 1)
  .sort((a, b) => a.abstand - b.abstand)

/*
 * **Dieselbe Funktion wie die Szene.** Hier stand zuerst `koerper[koerper.length - 1]` — der
 * weiteste Körper überhaupt, also Voyager. Der Startblick nimmt aber `outermostOf`, und das ist
 * Neptun. Ein Werkzeug, das eine **andere** Regel anwendet als der Code, den es prüfen soll, misst
 * nicht den Code, sondern sich selbst.
 */
const aussen = outermostOf(sonne)
if (!aussen) throw new Error('keine Bahn gefunden')
const blick = openingView([sx, sy, sz], aussen.radius)
/*
 * **Der Abstand von der Sonne ist `blick.distance`** — nicht mehr und nicht weniger.
 *
 * Hier stand zuerst ein `Math.hypot` über die Differenz der Kameraposition, das es nicht gibt
 * (`CameraState` hat `focus`, `distance`, `orientation` — keine Position), und dann ein selbst
 * gebauter Schräg-Winkel. Beides war Umweg: `distance` **ist** der Abstand zum Fokuspunkt, und der
 * Fokuspunkt liegt auf der Sonne. Wer ihn aus dem Winkel nachrechnet, rechnet ihn falsch.
 */
const kamera = blick.distance

console.log(`Exponenten:  Abstand ${SCALE_EXPONENT}   Größe ${SIZE_EXPONENT}`)
console.log(`Erdbahn:     ${EARTH_DISTANCE} Einheiten`)
console.log(`Sonne:       Radius ${SUN_RADIUS} Einheiten`)
console.log(`äusserster:  ${aussen.body.name} bei ${aussen.radius.toFixed(0)} Einheiten`)
console.log(`Startblick:  Kamera bei ${kamera.toFixed(0)} Einheiten (Faktor ${(kamera / aussen.radius).toFixed(2)})`)
console.log('')
console.log('Körper        Abstand   Radius   scheinbar   Bildanteil')
console.log('─'.repeat(58))

const paare: [string, number, number][] = [
  ['Sonne', SUN_RADIUS, 0],
  ...koerper.map((b) => [b.name, b.radius, b.abstand] as [string, number, number]),
]

let sichtbar = 0
for (const [name, radius, abstand] of paare) {
  const d = Math.max(kamera - abstand, 1)
  const px = pixel(radius, d)
  const anteil = (100 * px) / HOEHE
  if (px >= 1) sichtbar += 1
  // Die Orbitgrösse auf dem Bildschirm: der halbe Durchmesser der Bahn.
  const bahn = pixel(abstand, kamera)
  console.log(
    `${name.padEnd(13)} ${abstand.toFixed(0).padStart(7)}  ${radius.toFixed(1).padStart(7)}  ` +
      `${px.toFixed(1).padStart(7)} px  ${anteil.toFixed(2).padStart(6)} %   Bahn ${(2 * bahn).toFixed(0)} px`,
  )
}

console.log('')
console.log(`Körper mit mindestens 1 px: ${sichtbar} von ${paare.length}`)
console.log(
  `Über der Namensgrenze (14 px): ${
    paare.filter(([, r, a]) => pixel(r, Math.max(kamera - a, 1)) >= 14).length
  }`,
)

// Zur Kontrolle die echten Verhältnisse, gegen die gestauchten.
const erde = factsFor('erde')
const jupiter = factsFor('jupiter')
if (erde && jupiter) {
  console.log('')
  console.log('Echte Verhältnisse gegen die gestauchten:')
  console.log(`  Jupiter/Erde Radius:  echt ${(jupiter.radiusKm / erde.radiusKm).toFixed(1)}×  ` +
    `gezeichnet ${(planetRadius('jupiter', 1) / planetRadius('erde', 1)).toFixed(1)}×`)
  const neptunF = factsFor('neptun')
  if (neptunF) {
    console.log(`  Neptun/Erde Abstand:  echt ${(neptunF.au / erde.au).toFixed(1)}×  ` +
      `gezeichnet ${(relativeDistance('neptun')! / relativeDistance('erde')!).toFixed(1)}×`)
  }
}

/**
 * **Und jetzt der Zoombereich — die Frage des Betreibers.**
 *
 * „die planeten galxien ect sind meistens ultra klein auch beim zoom rein ich denke die grösse zoom
 * sollte in bestimmte ebene geändert gezeichnet werden oder so"
 *
 * Die Szene zeichnet einen Körper nie kleiner als `MIN_BODY_FRACTION · Abstand` (`scene.ts`). Diese
 * Zahl ist für **jeden** Körper dieselbe, und genau darin liegt das Problem: sie macht alle Körper
 * **gleich gross**, statt die Grössenverhältnisse zu erhalten. Bei Abstand 4761 sind es 24 Einheiten
 * — also ist die Erde (1,0) genauso gross wie Jupiter (6,0), und beide sind grösser als Saturn (5,3)
 * mal eben nicht.
 *
 * Diese Tabelle rechnet den ganzen Zoombereich durch. Eine Spalte je Abstand, eine Zeile je Körper,
 * und was herauskommt, ist die Zahl, die man **sieht**.
 */
const MIN_BODY_FRACTION = 0.005
const abstaende = [20000, 11000, 4761, 1600, 950, 400, 190, 60, 20]
console.log('')
console.log('Scheinbare Grösse (px) — mit der heutigen Mindestgrösse für ALLE Körper')
console.log(`Abstand:      ${abstaende.map((a) => String(a).padStart(7)).join('')}`)
console.log('─'.repeat(12 + abstaende.length * 7))
const interessante: [string, number][] = [
  ['Sonne', SUN_RADIUS],
  ['Jupiter', planetRadius('jupiter', 6)],
  ['Saturn', planetRadius('saturn', 5.3)],
  ['Erde', planetRadius('erde', 1)],
  ['Merkur', planetRadius('merkur', 0.49)],
]
for (const [name, radius] of interessante) {
  const zeile = abstaende.map((d) => {
    // Dieselbe Rechnung wie `scene.ts`: der Radius wird auf die Mindestgrösse angehoben.
    const gezeichnet = Math.max(radius, d * MIN_BODY_FRACTION)
    return pixel(gezeichnet, d).toFixed(1).padStart(7)
  })
  console.log(`${name.padEnd(11)} ${zeile.join('')}`)
}
/*
 * **Und die Zahlen je Bezugsebene.**
 *
 * Ein Körper wird nur auf **seiner** Ebene gezeichnet (oder als Kind eines Systems auf der
 * Systemebene). Deshalb ist die Frage „wie gross ist ein Planet" keine Frage über alle Körper,
 * sondern über die Körper **einer** Ebene. Hier stehen sie — und daraus folgt, welche Mindestgrösse
 * diese Ebene verträgt: sie darf die **kleinsten** nicht auf die **grössten** anheben.
 */
console.log('')
console.log('Körpergrössen je Bezugsebene (Welteneinheiten)')
console.log('─'.repeat(78))
for (const lvl of [1, 2, 3, 4, 5, 6, 7] as const) {
  const s = buildScene(exampleUniverse(), lvl)
  const alle = [
    ...s.placed.map((p) => p.body.radius),
    ...s.systems.flatMap((sys) => [sys.star.body.radius, ...sys.planets.map((p) => p.body.radius)]),
  ].filter((r) => r > 0)
  if (alle.length === 0) {
    console.log(`Ebene ${lvl}:  (nichts)`)
    continue
  }
  alle.sort((a, b) => b - a)
  const groesster = alle[0] ?? 0
  const kleinster = alle[alle.length - 1] ?? 0
  console.log(
    `Ebene ${lvl}:  ${alle.length} Körper   grösster ${groesster.toFixed(2)}   ` +
      `kleinster ${kleinster.toFixed(2)}   Spreizung ${(groesster / kleinster).toFixed(0)}×`,
  )
  console.log(`          die fünf grössten: ${alle.slice(0, 5).map((r) => r.toFixed(2)).join(', ')}`)
  console.log(`          die fünf kleinsten: ${alle.slice(-5).map((r) => r.toFixed(2)).join(', ')}`)
}

/*
 * **Die geplante Regel, durchgerechnet: Untergrenze aus dem Median der Ebene.**
 *
 * „ich denke die grösse zoom sollte in bestimmte ebene geändert gezeichnet werden oder so"
 *
 * Die beiden verworfenen Anläufe und **warum** sie verworfen sind:
 *
 *   1. **Untergrenze als Anteil des Körpers** (`radius / N`). Wirkungslos: bei Abstand 4761 sind
 *      0,49 · 0,1 = 0,049 Einheiten, und das sind 0,01 px. Ein Merkur, der „geschützt" ist, bleibt
 *      unsichtbar.
 *   2. **Feste Sichtgrenze in Pixeln** („nichts unter 2 px"). Sie **projiziert die Spreizung nach
 *      aussen**: bei Abstand 4761 sind 2 px gleich 21 Welteneinheiten, also wird Merkur (0,49) auf
 *      21 gezogen — so gross wie die Sonne. Aus „unrealistisch klein" wird „unrealistisch gleich".
 *
 * Die Regel, die beides vermeidet: die Untergrenze ist ein **Anteil des typischen Körpers dieser
 * Ebene** (`Median / VERHAELTNIS`). Dann gilt:
 *
 *   - Der grösste Körper wird **nie** angehoben.
 *   - Kleine Körper werden auf höchstens `Median/N` gezogen — **nicht** auf die Grösse des Grössten.
 *   - Die **Reihenfolge** bleibt also erhalten, und die Spreizung wird auf `N` gestaucht statt auf 1.
 *   - Bei feinen Ebenen (5–7), wo ohnehin alles gross ist, verschwindet die Untergrenze von selbst.
 */
const VERHAELTNIS = 12
console.log('')
console.log(`Untergrenze = Median der Ebene / ${VERHAELTNIS}   —  gezeichnete Grössen`)
console.log('─'.repeat(86))
for (const lvl of [1, 2, 3, 4, 5, 6, 7] as const) {
  const s = buildScene(exampleUniverse(), lvl)
  const roh = [
    ...s.placed.map((p) => ({ name: p.body.name, r: p.body.radius })),
    ...s.systems.flatMap((sys) => [
      { name: sys.star.body.name, r: sys.star.body.radius },
      ...sys.planets.map((p) => ({ name: p.body.name, r: p.body.radius })),
    ]),
  ].filter((b) => b.r > 0)
  if (roh.length === 0) continue
  const sortiert = [...roh].sort((a, b) => a.r - b.r)
  const median = sortiert[Math.floor(sortiert.length / 2)]?.r ?? 0
  const untergrenze = median / VERHAELTNIS
  /*
   * Die Untergrenze gilt **je Körper**, aber sie wird beim grössten gedeckelt: eine Untergrenze, die
   * über dem grössten Körper liegt, würde die ganze Ebene auf einen einzigen Wert ziehen. Genau das
   * war Fehler 2.
   */
  const groesster = sortiert[sortiert.length - 1]?.r ?? 0
  const boden = Math.min(untergrenze, groesster)
  const gezeichnet = roh.map((b) => {
    const r = Math.max(b.r, boden)
    // Und die Sichtgrenze bleibt als **letzte** Sicherung: kein Körper unter 1,5 px.
    const sicht = (1.5 * kamera * Math.tan((60 * Math.PI) / 360)) / HOEHE
    return { name: b.name, r: Math.max(r, Math.min(sicht, groesster)) }
  })
  const g = gezeichnet.map((b) => b.r).sort((a, b) => b - a)
  const pxKlein = pixel(g[g.length - 1] ?? 0, kamera)
  const pxGross = pixel(g[0] ?? 0, kamera)
  console.log(
    `Ebene ${lvl}:  Median ${median.toFixed(2).padStart(7)}  Boden ${boden.toFixed(2).padStart(7)}  ` +
      `grösster ${(g[0] ?? 0).toFixed(1).padStart(7)} (${pxGross.toFixed(0)} px)  ` +
      `kleinster ${(g[g.length - 1] ?? 0).toFixed(1).padStart(6)} (${pxKlein.toFixed(1)} px)  ` +
      `Spreizung ${((g[0] ?? 1) / (g[g.length - 1] ?? 1)).toFixed(1)}×`,
  )
}

/*
 * **Und was „fokussieren" ergibt — die zweite Hälfte der Frage.**
 *
 * „die planeten … sind meistens ultra klein **auch beim zoom rein**". Das eine ist die Grösse, das
 * andere der **Abstand**. `focusOn` setzt `radius · 3,2`; hier wird gerechnet, welchen Anteil des
 * Bildes ein Körper dann einnimmt — und ob die Kamera dabei **innerhalb der Sonne** steht (Radius
 * 100), denn von innen sieht man nichts.
 */
console.log('')
console.log('Fokus auf einen Körper (heute: Abstand = radius · 3,2)')
console.log('─'.repeat(72))
for (const [name, r] of [
  ['Sonne', SUN_RADIUS],
  ['Jupiter', planetRadius('jupiter', 6)],
  ['Erde', planetRadius('erde', 1)],
  ['Merkur', planetRadius('merkur', 0.49)],
] as [string, number][]) {
  const d = r * 3.2
  const anteil = (100 * pixel(r, d)) / HOEHE
  const innen = d < SUN_RADIUS
  console.log(
    `${name.padEnd(9)} r=${r.toFixed(2).padStart(7)}  Abstand ${d.toFixed(2).padStart(8)}  ` +
      `füllt ${anteil.toFixed(0).padStart(4)} % der Bildhöhe` +
      (innen ? '   ← Kamera steht IN der Sonne (r=100), von innen ist sie unsichtbar' : ''),
  )
}
