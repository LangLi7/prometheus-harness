#!/usr/bin/env bun
/**
 * **Warum die Transkription leer zurückkommt** — die Form des Hör-Wegs, Variante für Variante.
 *
 * ## Der Befund, der diese Sonde erzwungen hat
 *
 * `wege-lebend.mjs` hat am 19.10.2026 Ton über TTS erzeugt (4,7 s, RMS 4870 — **nicht stumm**) und
 * dieselbe WAV-Datei an `/audio/transcriptions` gegeben. Zurück kam `{"text":""}`. Der Ton ist also
 * da; die **Form** des Auftrags paßt nicht. Diese Sonde probiert die naheliegenden Varianten —
 * Dateiname, Inhaltstyp, Sprachfeld — und sagt, welche trägt.
 *
 * ## Kosten
 *
 * Vier Transkriptionen von je ~5 s: Bruchteile eines Cents.
 *
 * @module docs/status/messsonden/stt-form
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const BASIS = 'https://openrouter.ai/api/v1'
const MODELL = process.env.STT_MODELL ?? 'google/gemini-3.5-transcribe'
const WAV = join(import.meta.dir, '..', '..', '..', 'assets', 'audio', 'prometheus.wav')

/**
 * Liest den Schlüssel aus dem Speicher des Harness — nie ausgeben.
 *
 * @returns der Schlüssel
 */
async function ladeSchluessel() {
  const text = await readFile(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8')
  const treffer = /^\s*OPENROUTER_API_KEY:\s*(\S+)\s*$/mu.exec(text)
  if (treffer === null) throw new Error('kein OPENROUTER_API_KEY gefunden')
  return treffer[1].replace(/^["']|["']$/gu, '')
}

/** Ersetzt den Schlüssel in Fehlertexten. */
const entschaerfe = (text, schluessel) => text.split(schluessel).join('***')

/**
 * Eine Variante.
 *
 * @param {string} name - der Name der Variante
 * @param {{dateiname: string, typ: string, sprache?: string}} form - Dateiname, Typ, Sprache
 * @param {Uint8Array} ton - die Bytes
 * @param {string} schluessel - der Schlüssel
 */
async function variante(name, form, ton, schluessel) {
  const daten = new FormData()
  daten.append('model', MODELL)
  daten.append('file', new Blob([ton], { type: form.typ }), form.dateiname)
  if (form.sprache !== undefined) daten.append('language', form.sprache)

  const antwort = await fetch(`${BASIS}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${schluessel}` },
    body: daten,
    signal: AbortSignal.timeout(120_000),
  })
  const text = entschaerfe(await antwort.text(), schluessel)
  let gelesen
  try {
    gelesen = JSON.parse(text)
  } catch {
    gelesen = undefined
  }
  const inhalt = typeof gelesen?.text === 'string' ? gelesen.text : undefined
  process.stdout.write(
    `\n[${name}] HTTP ${String(antwort.status)}  ` +
      (inhalt === undefined ? `kein text-Feld — ${text.slice(0, 300)}` : `text (${String(inhalt.length)} Zeichen): „${inhalt.slice(0, 160)}"`),
  )
  return { name, ok: typeof inhalt === 'string' && inhalt.trim() !== '' }
}

const schluessel = await ladeSchluessel()
const ton = new Uint8Array(await readFile(WAV))
process.stdout.write(`Datei: ${WAV} (${String(ton.length)} Bytes) · Modell: ${MODELL}\n`)

const varianten = [
  ['wie im Anbieter', { dateiname: 'ton', typ: 'application/octet-stream' }],
  ['mit Endung', { dateiname: 'ton.wav', typ: 'audio/wav' }],
  ['mit Sprache', { dateiname: 'ton.wav', typ: 'audio/wav', sprache: 'de' }],
  ['nackt + Sprache', { dateiname: 'ton', typ: 'application/octet-stream', sprache: 'de' }],
]

const ergebnisse = []
for (const [name, form] of varianten) {
  ergebnisse.push(await variante(name, form, ton, schluessel))
}

process.stdout.write('\n--- Zusammenfassung ---\n')
for (const e of ergebnisse) process.stdout.write(`${e.ok ? 'JA  ' : 'NEIN'} ${e.name}\n`)
process.exit(ergebnisse.some((e) => e.ok) ? 0 : 1)
