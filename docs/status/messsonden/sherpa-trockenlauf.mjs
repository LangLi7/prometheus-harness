/**
 * Trockenlauf: lädt ein sherpa-onnx-Modell und erkennt eine WAV-Datei.
 *
 * Aufruf:
 *   node docs/status/messsonden/sherpa-trockenlauf.mjs --art whisper --modell <ordner> --wav <datei> --sprache de
 *   node docs/status/messsonden/sherpa-trockenlauf.mjs --art nemo    --modell <ordner> --wav <datei>
 *
 * Der Zweck ist eng: **belegen**, daß die installierte native Anbindung
 * (`sherpa-onnx-node` 1.13.8) ein Whisper- und ein NeMo-Modell laden und erkennen
 * kann — bevor ein Provider darauf gebaut wird. Geprüft werden beide Laufzeiten,
 * weil der Host unter Bun läuft und der Kindprozeß unter Node laufen soll.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const argv = process.argv.slice(2)
/** Liest einen Schalterwert, z. B. `--wav datei.wav`. */
const hole = (name, vorgabe) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : vorgabe
}

const art = hole('art', 'whisper')
const ordner = hole('modell')
const wav = hole('wav')
const sprache = hole('sprache', 'de')
const threads = Number(hole('threads', '4'))
if (!ordner || !wav) throw new Error('--modell <ordner> und --wav <datei> sind nötig')

const require = createRequire(import.meta.url)
const sherpa = require('sherpa-onnx-node')

/** Baut den Modellabschnitt je Familie; nur dieser Teil unterscheidet sich. */
function modellConfig() {
  if (art === 'whisper') {
    return {
      whisper: {
        encoder: join(ordner, 'base-encoder.int8.onnx'),
        decoder: join(ordner, 'base-decoder.int8.onnx'),
        language: sprache,
        task: 'transcribe',
      },
      tokens: join(ordner, 'base-tokens.txt'),
    }
  }
  if (art === 'nemo') {
    return {
      nemoCtc: { model: join(ordner, 'model.int8.onnx') },
      tokens: join(ordner, 'tokens.txt'),
    }
  }
  throw new Error(`Unbekannte Art: ${art}`)
}

/**
 * Liest die PCM-Bytes einer WAV-Datei als Float32 in [-1, 1].
 *
 * Die Vorlage benutzt dafür ihren eigenen WAV-Prüfer; hier genügt das Nötigste,
 * weil die Testdateien kanonisch sind (PCM16).
 *
 * @param {string} pfad - WAV-Datei.
 * @returns {{samples: Float32Array, rate: number, sekunden: number}}
 */
function leseWav(pfad) {
  const roh = readFileSync(pfad)
  const sicht = new DataView(roh.buffer, roh.byteOffset, roh.byteLength)
  const rate = sicht.getUint32(24, true)
  const kanaele = sicht.getUint16(22, true)
  const bits = sicht.getUint16(34, true)
  const daten = roh.byteLength - 44
  const anzahl = daten / 2 / kanaele
  const samples = new Float32Array(anzahl)
  for (let i = 0; i < anzahl; i++) {
    samples[i] = sicht.getInt16(44 + i * 2 * kanaele, true) / 32768
  }
  return { samples, rate, sekunden: anzahl / rate, bits }
}

const klang = leseWav(wav)
console.log(`Laufzeit: ${typeof Bun === 'undefined' ? 'Node' : `Bun ${Bun.version}`}`)
console.log(`WAV: ${klang.sekunden.toFixed(2)} s, ${klang.rate} Hz, ${klang.bits} Bit`)

const start = performance.now()
const erkenner = new sherpa.OfflineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: { ...modellConfig(), numThreads: threads, provider: 'cpu', debug: 0 },
})
const geladen = performance.now()
console.log(`Modell geladen in ${(geladen - start).toFixed(0)} ms (Art: ${art})`)

const strom = erkenner.createStream()
strom.acceptWaveform({ samples: klang.samples, sampleRate: klang.rate })
erkenner.decode(strom)
const ergebnis = erkenner.getResult(strom)
const fertig = performance.now()
console.log(`Erkennung in ${(fertig - geladen).toFixed(0)} ms (${(klang.sekunden / ((fertig - geladen) / 1000)).toFixed(1)}× Echtzeit)`)
console.log(`TEXT: ${JSON.stringify(ergebnis.text)}`)
