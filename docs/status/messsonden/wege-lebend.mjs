#!/usr/bin/env bun
/**
 * **Die vier Wege lebend** — TTS, STT, Entscheiden, Einbetten. Ohne Host, ohne Attrappe.
 *
 * ## Warum diese Sonde
 *
 * Der Betreiber: *„bild hat ja funktioniert es fehlt ja nur den andere stuff tts, STT ect? die
 * müsste ich ja selbst testen"*. Muß er nicht — der Anbieter-Code ist derselbe, den das Plugin
 * benutzt. Diese Sonde fährt ihn gegen den echten Dienst:
 *
 * 1. **TTS** — ein deutscher Satz wird zu Ton (PCM), der Ton zu einer WAV-Datei.
 * 2. **STT** — **dieselbe WAV-Datei** geht zurück an die Transkription. Das ist die schärfste
 *    Probe: der Text muß wieder herauskommen, den wir hineingegeben haben.
 * 3. **Entscheiden** — eine Frage mit zwei erlaubten Antworten, Ergebnis gegen das Schema geprüft.
 * 4. **Einbetten** — zwei ähnliche und ein fremder Satz; die Ähnlichkeit muß das wiedergeben.
 *
 * ## Kosten
 *
 * Ein Sprachaufruf hin, einer zurück, ein winziges Urteil, drei kurze Einbettungen: zusammen
 * Bruchteile eines Cents. Diese Sonde steht **nicht** im Prüflauf, weil sie Geld ausgibt.
 *
 * ## Der Schlüssel
 *
 * Aus `~/.dsh/.credentials.yaml`, nie ausgegeben.
 *
 * @module docs/status/messsonden/wege-lebend
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { alsWav, liesTonformat } from '../../../packages/api/ai-capabilities/src/flaechen.ts'
import { baueKette } from '../../../packages/api/ai-capabilities/src/kette.ts'

/** Was gesprochen wird — ein Satz mit Namen, damit ein Fehler auffällt. */
const SATZ = 'Guten Tag. Ich bin Prometheus, ein Assistent auf diesem Rechner.'

const ZIEL = join(import.meta.dir, '..', '..', '..', 'assets', 'audio', 'prometheus.wav')

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

/** Zerlegt Text in vergleichbare Wörter. */
function woerter(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u)
    .filter((w) => w !== '')
}

/** Wie viele Wörter des Satzes im Transkript stehen (0…1). */
function trefferquote(satz, transkript) {
  const soll = woerter(satz)
  const hat = new Set(woerter(transkript))
  return soll.filter((w) => hat.has(w)).length / soll.length
}

/** Kosinus-Ähnlichkeit zweier Vektoren. */
function kosinus(a, b) {
  let skalar = 0
  let la = 0
  let lb = 0
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    skalar += a[i] * b[i]
    la += a[i] * a[i]
    lb += b[i] * b[i]
  }
  return skalar / (Math.sqrt(la) * Math.sqrt(lb) || 1)
}

const kette = await baueKette({ schluessel: schluesselAusSpeicher })
let fehler = 0
const bericht = (name, ok, text) => {
  process.stdout.write(`${ok ? 'JA  ' : 'NEIN'} ${name.padEnd(14)} ${text}\n`)
  if (!ok) fehler += 1
}

process.stdout.write(`Fähigkeiten eingetragen: ${kette.aufbau.eingetragen.join(', ') || '(keine)'}\n\n`)

// ---------------------------------------------------------------------------
// 1. Text zu Sprache
// ---------------------------------------------------------------------------
let wav
try {
  const start = performance.now()
  const sprecher = await kette.aufbau.faehigkeiten.sprecher()
  const ton = await sprecher.sprich({ text: SATZ })
  const dauer = Math.round(performance.now() - start)
  const { rate, kanaele } = liesTonformat(ton.typ)
  const datei = ton.typ.startsWith('audio/pcm') ? alsWav(ton.bytes, rate, kanaele) : ton.bytes
  wav = datei
  await mkdir(dirname(ZIEL), { recursive: true })
  await writeFile(ZIEL, datei)
  const sekunden = ton.typ.startsWith('audio/pcm') ? datei.byteLength / (rate * 2 * kanaele) : 0
  bericht(
    'TTS',
    datei.byteLength > 1000,
    `${String(ton.bytes.byteLength)} Bytes ${ton.typ} → WAV ${String(datei.byteLength)} Bytes ` +
      `(${sekunden.toFixed(1)} s Ton, ${String(dauer)} ms) → ${ZIEL}`,
  )
} catch (e) {
  bericht('TTS', false, e instanceof Error ? e.message : String(e))
}

// ---------------------------------------------------------------------------
// 2. Sprache zu Text — dieselbe Datei
// ---------------------------------------------------------------------------
if (wav !== undefined) {
  try {
    const start = performance.now()
    const hoerer = await kette.aufbau.faehigkeiten.hoerer()
    const ergebnis = await hoerer.hoere(wav)
    const dauer = Math.round(performance.now() - start)
    const quote = trefferquote(SATZ, ergebnis.text)
    bericht(
      'STT',
      quote >= 0.6,
      `${String(dauer)} ms, ${Math.round(quote * 100)} % der Wörter wiedererkannt:\n` +
        `          „${ergebnis.text}"`,
    )
  } catch (e) {
    bericht('STT', false, e instanceof Error ? e.message : String(e))
  }
}

// ---------------------------------------------------------------------------
// 3. Entscheiden
// ---------------------------------------------------------------------------
try {
  const start = performance.now()
  const entscheider = await kette.aufbau.faehigkeiten.entscheider()
  const urteil = await entscheider.entscheide({
    frage: 'Ist ein Import von 12.000 Dateien auf einmal für einen einzelnen Rechner zu viel?',
    lage: { dateien: 12_000, rechner: 'ein Laptop', speicher: '16 GB' },
    schema: { felder: { antwort: { art: 'text', auswahl: ['ja', 'nein'] } } },
  })
  const dauer = Math.round(performance.now() - start)
  const gueltig = urteil.wert?.antwort === 'ja' || urteil.wert?.antwort === 'nein'
  bericht(
    'Entscheiden',
    gueltig,
    `${String(dauer)} ms → ${JSON.stringify(urteil.wert)}` +
      (urteil.herkunft === undefined ? ' (ohne Herkunft)' : ` von ${urteil.herkunft.anbieter}/${urteil.herkunft.modell}`),
  )
} catch (e) {
  bericht('Entscheiden', false, e instanceof Error ? e.message : String(e))
}

// ---------------------------------------------------------------------------
// 4. Einbetten
// ---------------------------------------------------------------------------
try {
  const start = performance.now()
  const anbieter = await kette.aufbau.faehigkeiten.waehle('einbetten')
  const einbetter = anbieter.einbetter
  if (einbetter === undefined) throw new Error('kein Einbetter')
  const vektoren = await einbetter.betteEin([
    'Der Himmel ist blau.',
    'Der Himmel ist blau!',
    'Ein Flammenkopfsymbol auf weißem Grund.',
  ])
  const dauer = Math.round(performance.now() - start)
  const nah = kosinus(vektoren[0] ?? [], vektoren[1] ?? [])
  const fern = kosinus(vektoren[0] ?? [], vektoren[2] ?? [])
  bericht(
    'Einbetten',
    (vektoren[0]?.length ?? 0) > 0 && nah > fern,
    `${String(dauer)} ms, ${String(vektoren[0]?.length ?? 0)} Dimensionen, ` +
      `ähnlich ${nah.toFixed(3)} > fremd ${fern.toFixed(3)}`,
  )
} catch (e) {
  bericht('Einbetten', false, e instanceof Error ? e.message : String(e))
}

process.stdout.write(`\n${fehler === 0 ? 'GRÜN — alle vier Wege tragen.' : `ROT — ${String(fehler)} Weg(e) tragen nicht.`}\n`)
process.exitCode = fehler === 0 ? 0 : 1
