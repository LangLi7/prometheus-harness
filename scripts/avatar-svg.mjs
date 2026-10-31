#!/usr/bin/env bun
/**
 * Ein Bild zu SVG — **ohne Fremdwerkzeug**, mit Gegenprobe.
 *
 * ## Warum es dieses Skript gibt
 *
 * Der Betreiber wollte den Avatar „später als Vector SVG". Auf diesem Rechner gibt es dafür nichts:
 * `magick`, `potrace`, `vtracer`, `inkscape` fehlen (geprüft am 19.10.2026). Statt auf ein
 * Programm zu verweisen, das nicht da ist, macht `@prometheus-harness/vectorize` die Arbeit selbst
 * — und **rechnet das Ergebnis zurück**, damit die Abweichung als Zahl dasteht.
 *
 * ## Aufruf
 *
 * ```powershell
 * bun scripts/avatar-svg.mjs assets/avatar/avatar-plugin.png
 * bun scripts/avatar-svg.mjs <bild.png> --farben 5 --toleranz 1.2
 * ```
 *
 * Es entstehen zwei Dateien neben der Vorlage: `<name>.svg` und `<name>-vorschau.png` (das
 * zurückgerechnete Bild — was der Pfad beschreibt, nicht die Vorlage).
 *
 * @module scripts/avatar-svg
 */

import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

import { schreibePng, vektorisierePng } from '../packages/vision/vectorize/src/index.ts'

/**
 * Liest `--name wert` und die freien Argumente.
 *
 * @param {readonly string[]} argv - die Argumente
 * @returns {{frei: string[], werte: Record<string, string>}}
 */
function liesArgumente(argv) {
  const frei = []
  const werte = {}
  for (let i = 0; i < argv.length; i += 1) {
    const teil = argv[i]
    if (teil.startsWith('--')) {
      const wert = argv[i + 1]
      if (wert === undefined || wert.startsWith('--')) throw new Error(`Zu „${teil}" fehlt der Wert.`)
      werte[teil.slice(2)] = wert
      i += 1
    } else {
      frei.push(teil)
    }
  }
  return { frei, werte }
}

/**
 * Schneidet ein Bild auf einen Rahmen zu.
 *
 * @param {import('../packages/vision/vectorize/src/png.ts').Bild} bild - das Quellbild
 * @param {{x: number, y: number, breite: number, hoehe: number}} rahmen - der Rahmen
 * @returns das zugeschnittene Bild
 */
function schneide(bild, rahmen) {
  const rgb = new Uint8Array(rahmen.breite * rahmen.hoehe * 3)
  for (let y = 0; y < rahmen.hoehe; y += 1) {
    const quelle = ((rahmen.y + y) * bild.breite + rahmen.x) * 3
    rgb.set(bild.rgb.subarray(quelle, quelle + rahmen.breite * 3), y * rahmen.breite * 3)
  }
  return { breite: rahmen.breite, hoehe: rahmen.hoehe, rgb }
}

const { frei, werte } = liesArgumente(process.argv.slice(2))
const eingabe = frei[0] ?? 'assets/avatar/avatar-plugin.png'
const farben = werte.farben === undefined ? 6 : Number(werte.farben)
const toleranz = werte.toleranz === undefined ? 1.2 : Number(werte.toleranz)
const minFlaeche = werte.flaeche === undefined ? 96 : Number(werte.flaeche)
// **Für ein Logo:** auf den Inhalt zuschneiden, damit der `viewBox` den Umriß umschließt.
const zuschneiden = werte.zuschneiden === '1' || werte.zuschneiden === 'true'
const rand = werte.rand === undefined ? 12 : Number(werte.rand)

if (!Number.isFinite(farben) || farben < 2) throw new Error('--farben muß eine Zahl ab 2 sein.')
if (!Number.isFinite(toleranz) || toleranz <= 0) throw new Error('--toleranz muß eine positive Zahl sein.')

const datei = await readFile(eingabe)
process.stdout.write(`Vorlage: ${eingabe} (${String(datei.byteLength)} Bytes)\n`)

const start = performance.now()
const ergebnis = vektorisierePng(new Uint8Array(datei), {
  farben,
  toleranz,
  minFlaeche,
  vorschau: true,
  zuschneiden,
  rand,
})
const dauer = Math.round(performance.now() - start)

const basis = join(dirname(eingabe), basename(eingabe, extname(eingabe)))
const svgPfad = `${basis}.svg`
const vorschauPfad = `${basis}-vorschau.png`
await writeFile(svgPfad, ergebnis.svg, 'utf8')
if (ergebnis.vorschau !== undefined) {
  // **Die Vorschau folgt dem `viewBox`.** Sonst zeigte sie beim zugeschnittenen Logo weiter das
  // 1024er Bild mit leerem Rand — und man sähe nicht, was im SVG steht.
  const b = ergebnis.bericht
  const vorschau = zuschneiden ? schneide(ergebnis.vorschau, b.rahmen) : ergebnis.vorschau
  await writeFile(vorschauPfad, schreibePng(vorschau.breite, vorschau.hoehe, vorschau.rgb))
}

const b = ergebnis.bericht
process.stdout.write(`\nGröße:      ${String(b.breite)} × ${String(b.hoehe)}\n`)
process.stdout.write(
  `viewBox:    ${String(b.rahmen.x)} ${String(b.rahmen.y)} ${String(b.rahmen.breite)} ${String(b.rahmen.hoehe)}` +
    `${zuschneiden ? ' (zugeschnitten)' : ''}\n`,
)
process.stdout.write(`Dauer:      ${String(dauer)} ms\n`)
process.stdout.write(`Farben:     ${String(b.farben.length)} — ${b.farben.join(', ')}\n`)
process.stdout.write(`Schleifen:  ${b.schleifen.join(', ')}\n`)
process.stdout.write(`Punkte:     ${b.punkteVorher.join(', ')} → ${b.punkteNachher.join(', ')}\n`)
process.stdout.write(
  `Abweichung: ${(b.abweichung * 100).toFixed(3)} % der Pixel ` +
    `(${String(Math.round(b.abweichung * b.breite * b.hoehe))} von ${String(b.breite * b.hoehe)})\n`,
)
process.stdout.write(`SVG:        ${svgPfad} (${String(b.svgBytes)} Bytes)\n`)
process.stdout.write(`Vorschau:   ${vorschauPfad}\n`)

// **Ein SVG ohne Fläche ist kein Ergebnis.** Wenn keine einzige Schleife übrigbleibt, ist etwas
// schiefgegangen — und das soll der Aufrufer am Exit-Code merken, nicht am Bild.
process.exitCode = b.schleifen.some((n) => n > 0) ? 0 : 1
