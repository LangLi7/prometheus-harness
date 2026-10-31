/**
 * **Was steht im Zentrum — und wie gross ist es wirklich?**
 *
 * **Warum dieses Werkzeug.** Der Betreiber: „das problem ist nicht den sternhaufen hinten, schau dir
 * das nochmals an". Sein Bild zeigt auf **Ebene 4** („Sonnensystem", Abstand 577) das ganze System
 * als **dunkle Scheibe von rund 60 px** in der Bildmitte, mit der Sonne als kleinem Punkt darin.
 *
 * Und die Kopfzeile nennt **280 fps** — der Rechner zeichnet also fast nichts.
 *
 * Das ist kein Geschmacksurteil, das sind Zahlen, die man rechnen kann: der Radius des grössten
 * Körpers, der Radius der grössten Bahn, der Abstand der Kamera — und daraus die Pixel, die jedes
 * davon einnimmt. Erst damit ist „das ist zu klein" eine Aussage.
 *
 * **Es rechnet ohne Browser** — dieselbe Kette wie die Szene.
 *
 * Aufruf:  bun tools/center.ts [ebene]
 */
import { buildScene } from '../src/scene'
import { exampleUniverse } from '../src/universe'
import { distanceForLevel } from '../src/camera'

const HOEHE = 900
const FOV = 60
const HALB = Math.tan((FOV * Math.PI) / 360)

/** Bildschirmgrösse eines Radius bei einem Abstand — Durchmesser in Pixeln. */
function px(radius: number, abstand: number): number {
  return (2 * HOEHE * radius) / (2 * Math.max(abstand, 1) * HALB)
}

const universum = exampleUniverse()

for (const ebene of [4, 3] as const) {
  const abstand = distanceForLevel(ebene)
  const s = buildScene(universum, ebene)
  console.log(`\n─── Ebene ${ebene}   (Abstand nach Zweierpotenz: ${abstand}) ───`)
  console.log(`  Systeme: ${s.systems.length}   gezeichnet: ${s.placed.length}   beschriftet: ${s.labeled.length}   Anker: ${s.anchor?.body.name ?? 'keiner'}`)

  for (const sys of s.systems) {
    const bahnen = sys.orbits.filter((r) => r > 0)
    const aussen = bahnen.length ? Math.max(...bahnen) : 0
    console.log(`  SYSTEM „${sys.star.body.name}"`)
    console.log(`    Sternradius          ${sys.star.body.radius.toFixed(1).padStart(9)}  →  ${px(sys.star.body.radius, abstand).toFixed(1)} px`)
    console.log(`    grösste Bahn         ${aussen.toFixed(1).padStart(9)}  →  Durchmesser ${px(aussen, abstand).toFixed(1)} px`)
    console.log(`    Planeten: ${sys.planets.length}`)
    for (const p of sys.planets.slice(0, 4)) {
      console.log(
        `      ${p.body.name.padEnd(12)} r=${p.body.radius.toFixed(2).padStart(7)}  Bahn=${String(Math.round(p.localOrbit)).padStart(6)}` +
          `  → Körper ${px(p.body.radius, abstand).toFixed(1)} px`,
      )
    }
  }

  /*
   * **Und die Frage, die der Betreiber wirklich stellt: wie gross ist das Ganze?**
   *
   * Der Durchmesser des Systems auf dem Bildschirm gegen die Bildhöhe. Ein System, das 7 % der
   * Bildhöhe einnimmt, ist eine Scheibe in der Mitte — unabhängig davon, wie viele Körper darin
   * liegen.
   */
  const bahnen = s.systems.flatMap((sys) => sys.orbits.filter((r) => r > 0))
  const aussen = bahnen.length ? Math.max(...bahnen) : 0
  const anteil = (100 * px(aussen, abstand)) / HOEHE
  console.log(`  ⇒ Das System nimmt ${anteil.toFixed(1)} % der Bildhöhe ein (äusserste Bahn ${Math.round(aussen)} Einheiten)`)
}

console.log('')
console.log('Der Startblick rechnet anders: `openingView` nimmt den äussersten Ring × 3,8.')
console.log('Für das Sonnensystem sind das 1253 · 3,8 = 4761 — dort nimmt die äusserste Bahn rund 33 % ein.')
