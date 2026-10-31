#!/usr/bin/env bun
/**
 * **Ein Bild mit Stellschrauben** — Seitenverhältnis, Auflösung, Preis.
 *
 * ## Was diese Sonde beweist
 *
 * Daß `aspect_ratio` nicht nur im Körper steht, sondern **wirkt**: das Ergebnis muß breiter als
 * hoch sein. Geprüft wird das an der Kopfzeile der PNG-Datei (IHDR), nicht am Augenschein — und
 * `usage.cost` sagt, was der Aufruf gekostet hat.
 *
 * ## Kosten
 *
 * Ein Bild. Deshalb steht die Sonde **nicht** im Prüflauf.
 *
 * @module docs/status/messsonden/bild-optionen
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { baueKette } from '../../../packages/api/ai-capabilities/src/kette.ts'

const ZIEL = join(import.meta.dir, '..', '..', '..', 'assets', 'bilder', 'fuchs-16-9.png')
const PROMPT =
  'A red fox sitting in deep snow at dusk. Wildlife photograph, 85 mm, f/2.8, low winter sun ' +
  'from the left, rim light on the fur, cold blue shadows, shallow depth of field, natural ' +
  'colors, quiet winter forest background out of focus. No text, no watermark.'

/**
 * Liest den Schlüssel aus dem Speicher des Harness.
 *
 * @returns der Schlüssel oder `undefined`
 */
async function schluesselAusSpeicher() {
  try {
    const text = await readFile(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8')
    const treffer = /^\s*OPENROUTER_API_KEY:\s*(\S+)\s*$/mu.exec(text)
    return treffer === null ? undefined : treffer[1].replace(/^["']|["']$/gu, '')
  } catch {
    return undefined
  }
}

/** Breite und Höhe aus einem PNG-Kopf. */
function masse(bytes) {
  const u32 = (ab) => ((bytes[ab] << 24) | (bytes[ab + 1] << 16) | (bytes[ab + 2] << 8) | bytes[ab + 3]) >>> 0
  return { breite: u32(16), hoehe: u32(20) }
}

const kette = await baueKette({ schluessel: schluesselAusSpeicher })
const anbieter = await kette.aufbau.faehigkeiten.waehle('bild')
if (anbieter.zeichner === undefined) throw new Error('kein Zeichner')

const start = performance.now()
const bild = await anbieter.zeichner.zeichne(PROMPT, { seitenverhaeltnis: '16:9' })
const dauer = Math.round(performance.now() - start)

const { breite, hoehe } = masse(bild.bytes)
await mkdir(dirname(ZIEL), { recursive: true })
await writeFile(ZIEL, bild.bytes)

process.stdout.write(`Modell:      ${kette.einstellungen.wahl.bild?.modell ?? '?'}\n`)
process.stdout.write(`Dauer:       ${String(dauer)} ms\n`)
process.stdout.write(`Typ:         ${bild.typ}\n`)
process.stdout.write(`Bytes:       ${String(bild.bytes.byteLength)}\n`)
process.stdout.write(`Maße:        ${String(breite)} × ${String(hoehe)} (Verhältnis ${(breite / hoehe).toFixed(3)})\n`)
process.stdout.write(
  `Kosten:      ${bild.kostenUsd === undefined ? 'nicht gemeldet' : `${String(bild.kostenUsd)} USD`}\n`,
)
process.stdout.write(`Datei:       ${ZIEL}\n`)

// **Die Gegenprobe.** Ein 16:9-Bild ist breiter als hoch; 1024×1024 wäre quadratisch.
process.exitCode = breite > hoehe ? 0 : 1
