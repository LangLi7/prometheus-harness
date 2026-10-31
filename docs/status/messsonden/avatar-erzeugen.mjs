#!/usr/bin/env bun
/**
 * Erzeugt ein Bild **über das Werkzeug** — also über denselben Weg, den das Modell im Gespräch
 * benutzt: Kette → `bild`-Fähigkeit → OpenRouter → Datei.
 *
 * ## Warum diese Sonde und nicht nur `bild-form.mjs`
 *
 * `bild-form.mjs` prüft die **Form** der Schnittstelle mit einem nackten `fetch`. Diese Sonde prüft
 * den **Weg danach**: Base64 entschlüsseln, Behälter erkennen, Datei schreiben, Pfad melden. Ein
 * Fehler dort wäre in der Form-Messung unsichtbar.
 *
 * ## Kosten
 *
 * Ein Bild. Der Lauf ist deshalb **kein** Test und steht nicht im Prüflauf.
 *
 * @module docs/status/messsonden/avatar-erzeugen
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { baueKette } from '../../../packages/api/ai-capabilities/src/kette.ts'
import { bildWerkzeug } from '../../../packages/api/ai-capabilities/src/werkzeuge.ts'

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

const auftrag =
  process.argv.slice(2).join(' ') ||
  'A flat vector avatar icon of a flame-headed humanoid, bold black outlines, solid burnt orange ' +
    'and deep blue fills, centered and filling the frame, plain white background, minimal geometric ' +
    'shapes, no gradients, no shadows, no text, sticker style, high contrast, suitable for tracing ' +
    'to SVG.'

const werkzeug = bildWerkzeug(() => baueKette({ schluessel: schluesselAusSpeicher }))
const bericht = await werkzeug.execute({ beschreibung: auftrag, pfad: 'assets/avatar/avatar-plugin.png' }, {
  signal: undefined,
  step: 1,
  callId: 'sonde',
})
process.stdout.write(`${bericht}\n`)
