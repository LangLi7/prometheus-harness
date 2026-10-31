/**
 * **Steht auf jeder Bezugsebene überhaupt etwas im Bild?**
 *
 * **Der Befund, der dieses Werkzeug erzwungen hat.** `tools/boot-with-state.js` hat gemessen, dass
 * bei gemerktem Abstand **140** (Ebene 1, „Kleinkörper") das Canvas **leer** ist — nur Sternenhimmel.
 * Der Betreiber hat genau das gesehen.
 *
 * Und der Grund ist keine Kleinigkeit: die Ebenen sind über den **Abstand** definiert
 * (`levelForDistance`: 70 … 300 = Ebene 1), die **Körper** liegen aber in Welteneinheiten — die Sonne
 * bei 0, der Voyager bei **1412**. Wer die Kamera bei 140 auf die Sonne richtet, sieht auf Ebene 1
 * den Voyager **nicht** und die Sonne **nicht** (sie ist kein Körper dieser Ebene mehr, und ohne Anker
 * wird sie nicht gezeichnet).
 *
 * Dieses Werkzeug rechnet für **jede** Ebene durch, was im Bild steht: für jeden Körper der Ebene den
 * Abstand zur Kamera und seine scheinbare Grösse. Damit ist „die Welt ist leer" eine Zahlengeschichte
 * und keine Beobachtung.
 *
 * **Es rechnet ohne Browser** — dieselbe Kette wie die Szene: `distanceForLevel` → `buildScene` →
 * `screenDiameter`. Es wird nichts gezeichnet.
 *
 * Aufruf:  bun tools/ebenenshot.js
 */
import { distanceForLevel, levelForDistance } from '../src/camera'
import { exampleUniverse } from '../src/universe'
import { buildScene, drawnRadius, minBodySize } from '../src/scene'

const HOEHE = 900
const FOV = 60
const HALBWINKEL = Math.tan((FOV * Math.PI) / 360)

/** Die Bildschirmgrösse eines Körpers in Pixeln. */
function pixel(radius: number, abstand: number): number {
  return (HOEHE * radius) / (Math.max(abstand, 1) * HALBWINKEL)
}

/** Wie weit reicht das Bild in Welteneinheiten, bei diesem Abstand? */
function sichtweite(abstand: number): number {
  return abstand * HALBWINKEL
}

const universum = exampleUniverse()

console.log('Ebene  Abstand    Sichtweite   Körper im Bild        scheinbar (grösster)')
console.log('─'.repeat(86))

for (const ebene of [1, 2, 3, 4, 5, 6, 7] as const) {
  const abstand = distanceForLevel(ebene)
  const sicht = sichtweite(abstand)
  const szene = buildScene(universum, ebene)

  /*
   * **Alle Körper, die gezeichnet werden** — die der Ebene, die Planeten der Systeme und der Anker.
   * Ihre Lage ist die **Weltkoordinate**, also die Summe über den Weg; ohne das rechnet man gegen
   * falsche Zahlen.
   */
  const koerper = [
    ...szene.placed.map((p) => ({ name: p.body.name, radius: p.body.radius, world: p.world })),
    ...szene.systems.flatMap((s) => [
      { name: s.star.body.name, radius: s.star.body.radius, world: s.star.world },
      ...s.planets.map((p) => ({ name: p.body.name, radius: p.body.radius, world: p.world })),
    ]),
    ...(szene.anchor ? [{ name: szene.anchor.body.name, radius: szene.anchor.body.radius, world: szene.anchor.world }] : []),
  ]

  /*
   * **Der Abstand, der zählt: Kamera → Körper.**
   *
   * Hier stand zuerst `Math.abs(|Lage| − Abstand)` — die Länge der Körperlage vom Ursprung gegen die
   * Blicklänge. Das ist **falsch**, und es fiel sofort auf: die Rechnung meldete für Ebene 7
   * „0 Körper", während das Bild dort den Knoten deutlich zeigt. Ein gemessener Widerspruch.
   *
   * Richtig ist der **euklidische Abstand zur Kameraposition**. Für diese Rechnung steht die Kamera
   * auf der z-Achse im Abstand `distance` und schaut auf den Ursprung — dieselbe Lage wie
   * `cameraPosition()` bei der Drehlage `[0,0,0,1]`.
   */
  const kamera: [number, number, number] = [0, 0, abstand]
  const mitAbstand = koerper.map((k) => ({
    ...k,
    abstand: Math.hypot(k.world[0] - kamera[0], k.world[1] - kamera[1], k.world[2] - kamera[2]),
  }))
  const sichtbar = mitAbstand.filter((k) => k.abstand < sicht * 1.5)
  const groesster = sichtbar.length
    ? sichtbar.reduce((a, b) => (pixel(b.radius, b.abstand) > pixel(a.radius, a.abstand) ? b : a))
    : null

  const grenze = minBodySize(
    szene.reference,
    Math.max(...koerper.map((k) => k.radius), 0),
    abstand,
    HOEHE,
    FOV,
  )
  const namen = sichtbar.map((k) => k.name).slice(0, 3).join(', ') || '(keiner)'
  console.log(
    `  ${ebene}   ${String(abstand).padEnd(10)} ${String(Math.round(sicht)).padEnd(12)} ` +
      `${(sichtbar.length + ' → ' + namen).slice(0, 21).padEnd(21)} ` +
      (groesster
        ? `${groesster.name} ${pixel(drawnRadius(groesster.radius, grenze), groesster.abstand).toFixed(1)} px`
        : '—'),
  )
}

console.log('')
console.log('„Körper im Bild" heisst: ihr Abstand zur Kamera liegt innerhalb der Sichtweite.')
console.log('Ebene 1 … 300 und darunter: was dort liegt, sind Einzelkörper weit draussen.')
console.log(`Zur Kontrolle: levelForDistance(${distanceForLevel(1)}) = ${levelForDistance(distanceForLevel(1))}`)
console.log('')
console.log('⚠ Die Kamera wird hier auf die **z-Achse** gesetzt. Der Startblick steht 38° schräg über')
console.log('  der Bahnebene, und die Bahnen liegen in der xz-Ebene — die Zahlen für die **groben**')
console.log('  Ebenen sind dadurch zu klein (Ebene 7 zeigt im Bild den Knoten, hier „0 Körper").')
console.log('  Verlässlich ist das Werkzeug für die **feinen** Ebenen und für die Frage, ob eine')
console.log('  Ebene überhaupt Inhalt hat; die Lage der Kamera kommt aus `openingView`/`cameraPosition`.')
