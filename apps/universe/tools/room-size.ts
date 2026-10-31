/**
 * **Wie gross ist unser Raum wirklich? — die Tiefe, gemessen statt geschaetzt.**
 *
 * Betreiber: „**ist unsere raum eigentlich nahe oder fast unendlich ausser dem outzoom?**"
 *
 * Die Frage hat zwei Teile, und beide sind Zahlen:
 *
 *   1. **Wie weit reicht der Inhalt?** Das ist der Abstand vom Ursprung bis zum äussersten Körper —
 *      die echte Ausdehnung dessen, was im Baum steht.
 *   2. **Wie weit reicht die Kamera?** Das ist `MAX_DISTANCE`. Was dazwischen liegt, ist **Leere**:
 *      die Kamera kann dorthin, aber es steht nichts dort.
 *
 * Und die dritte Zahl, die die Frage eigentlich beantwortet: **um wie viel grösser ist die Kameraweite
 * als der Inhalt?** Ist sie es um ein Vielfaches, dann ist der Raum „fast unendlich" — und genau das
 * sieht man, wenn man hinauszoomt.
 *
 * Aufruf:  bun tools/room-size.ts
 */
import { MAX_DISTANCE, MIN_DISTANCE, distanceForLevel } from '../src/camera'
import { LEVELS, exampleUniverse } from '../src/universe'
import type { Body, Level } from '../src/universe'

const u = exampleUniverse()

/** Der weiteste Körper im Baum — die Weltlage zählt alle Vorfahren mit. */
let weiteste = 0
let weitesteName = ''
let groesster = 0
let groessterName = ''
const walk = (b: Body, ursprung: readonly [number, number, number]): void => {
  const welt: [number, number, number] = [
    ursprung[0] + b.position[0],
    ursprung[1] + b.position[1],
    ursprung[2] + b.position[2],
  ]
  const abstand = Math.hypot(welt[0], welt[1], welt[2])
  if (abstand > weiteste) {
    weiteste = abstand
    weitesteName = b.name
  }
  if (b.radius > groesster) {
    groesster = b.radius
    groessterName = b.name
  }
  for (const k of b.children ?? []) walk(k, welt)
}
walk(u, [0, 0, 0])

/** Der Radius des Wurzelknotens — die Ausdehnung, die der Baum sich selbst zuschreibt. */
const wurzelRadius = u.radius

console.log('Wie gross ist unser Raum?')
console.log('')
console.log('  Der INHALT:')
console.log(`    Wurzelknoten „${u.name}"        Radius ${wurzelRadius.toLocaleString('de-DE')} Einheiten`)
console.log(`    weitester Körper                ${weitesteName}, bei ${Math.round(weiteste).toLocaleString('de-DE')}`)
console.log(`    grösster Körper                 ${groessterName}, Radius ${groesster.toLocaleString('de-DE')}`)
console.log('')
console.log('  Die KAMERA:')
console.log(`    nächster Abstand                ${MIN_DISTANCE}`)
console.log(`    weitester Abstand               ${MAX_DISTANCE.toLocaleString('de-DE')}`)
console.log('')
console.log('  Und das Verhältnis, das die Frage beantwortet:')
const inhalt = Math.max(wurzelRadius, weiteste)
const verhaeltnis = MAX_DISTANCE / inhalt
console.log(`    Kameraweite / Inhalt            ${verhaeltnis.toFixed(1)}x`)
console.log('')
/*
 * **Die Zahl, die man im Bild sieht.** Bei welchem Abstand ist der Inhalt nur noch ein Punkt?
 * Die sichtbare Höhe ist `2 · d · tan 30°`. Wenn der ganze Inhalt (Durchmesser 2·inhalt) kleiner als
 * **ein Pixel** ist, ist er verschwunden — dann sieht man nur noch Leere.
 */
const hoehe = 900
const einPixelAbstand = (2 * inhalt * hoehe) / (2 * Math.tan((60 * Math.PI) / 180 / 2) * 1)
console.log('  Ab wann ist der Inhalt nur noch ein Punkt (900 px Fenster, 60°)?')
console.log(`    bei Abstand rund ${Math.round(einPixelAbstand).toLocaleString('de-DE')}`)
console.log(
  `    das ist das ${(einPixelAbstand / MAX_DISTANCE * 100).toFixed(1)} % der Kameraweite`,
)
console.log('')
console.log('  Die Ebenen und ihr Abstand:')
console.log('    Ebene  Name                  Mitte          untere Grenze   Inhalt sichtbar?')
for (const l of LEVELS) {
  const mitte = distanceForLevel(l.level as Level)
  const unten = mitte / 2
  const sichtbar = mitte < einPixelAbstand
  console.log(
    `    ${String(l.level).padStart(5)}  ${l.label.padEnd(20)} ${mitte.toExponential(2).padStart(10)}   ${unten.toExponential(2).padStart(12)}   ${sichtbar ? 'ja' : 'NEIN — nur Leere'}`,
  )
}
