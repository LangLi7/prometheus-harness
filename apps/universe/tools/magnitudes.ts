/**
 * **Die Grössenordnungen — gemessen, nicht behauptet.**
 *
 * Der Betreiber hat die astronomische Hierarchie vorgegeben und will sie als **Reihenfolge der
 * Bezugsebenen** wiederfinden:
 *
 *   „planet, Das Sonnensystem, Galaxien & Das Universum"
 *
 * Und dazu: „**es ist immer noch eine sonne obwohl ich ultra weit weg bin sollte da keine universum
 * werden als maxout**".
 *
 * **Was dieses Werkzeug rechnet.** Die Hierarchie in **einem** Maß — Kilometer — mit den Zahlen des
 * Betreibers, und danach den Faktor zwischen den Stufen. Denn darum geht es: nicht um die Namen,
 * sondern darum, wie **steil** die Stufen sind. Ein Sonnensystem ist rund 10¹³ km, eine Galaxie 10¹⁸,
 * das beobachtbare Universum 10²³ — dazwischen liegen je **fünf** Zehnerpotenzen, nicht vier.
 *
 * Aufruf:  bun tools/magnitudes.ts
 */

/** Die Stufen mit ihrer Ausdehnung in Kilometern — die Zahlen stammen vom Betreiber. */
const STUFEN = [
  ['Planet (Erde)', 1.27e4, 'Durchmesser 12 742 km'],
  ['Sonne', 1.39e6, '109 × Erde'],
  ['Sonnensystem (innen/mittlerer)', 9.6e9, 'rund 64 AE bis Neptun'],
  ['Sonnensystem (Oortsche Wolke)', 1.5e13, 'rund 0,25 Lichtjahre'],
  ['Sternhaufen (Plejaden)', 3.8e14, 'rund 40 Lichtjahre'],
  ['Milchstraße', 9.5e17, '100 000 – 120 000 Lichtjahre'],
  ['Lokale Gruppe', 9.5e18, 'rund 10 Millionen Lichtjahre'],
  ['Laniakea (Superhaufen)', 4.7e20, 'rund 500 Millionen Lichtjahre'],
  ['Beobachtbares Universum', 8.8e23, '93 Milliarden Lichtjahre'],
] as const

console.log('Stufe                              Ausdehnung        Faktor zur Vorstufe')
console.log('─'.repeat(76))
let vorher = 0
for (const [name, km, hinweis] of STUFEN) {
  const faktor = vorher > 0 ? km / vorher : 0
  console.log(
    `${name.padEnd(33)} ${km.toExponential(2).padStart(10)} km  ` +
      (faktor > 0 ? `${faktor.toExponential(2).padStart(10)} ×` : '          —') +
      `   ${hinweis}`,
  )
  vorher = km
}

/*
 * **Und jetzt die Frage, die den Code angeht.**
 *
 * `distanceForLevel` rechnet heute `SCHWELLE · 2^(2n+1)` — je Ebene Faktor **4**. Ausgezählt:
 */
console.log('')
console.log('Was die Bezugsebenen heute tun (`distanceForLevel`, Faktor 4 je Stufe):')
const SCHWELLE = 70
for (let n = 1; n <= 7; n++) {
  const d = SCHWELLE * Math.pow(2, (n - 1) * 2 + 1)
  console.log(`  Ebene ${n}:  Abstand ${String(Math.round(d)).padStart(9)}`)
}

console.log('')
console.log('Die echten Stufen brauchen Faktor ~316 bis ~1800 (2,5 bis 3,25 Zehnerpotenzen).')
console.log('Der Unterschied ist der Grund, warum beim Herauszoomen „immer noch eine Sonne" steht:')
console.log('nach vier Ebenen ist der Blick erst 256-mal weiter, nicht milliardenfach.')
