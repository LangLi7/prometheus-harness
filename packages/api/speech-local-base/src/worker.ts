/**
 * Der Kindprozeß: lädt **ein** sherpa-onnx-Modell und erkennt Aufnahmen.
 *
 * ## Warum ein eigener Prozeß
 *
 * Die Erkennung ist **synchron** und läuft in nativem Code. Liefe sie im Host,
 * würde jede Aufnahme den Ereignisknoten des Hosts blockieren (die Weboberfläche
 * stünde still), und ein Fehler im nativen Teil könnte den **Host** mitnehmen.
 * Die Vorlage macht es genauso (`speech-to-text-sensevoice` startet einen
 * Kindprozeß); hier wird bewußt dasselbe Muster benutzt, statt eine zweite
 * Lebensdauer-Verwaltung zu erfinden.
 *
 * ## Schnittstelle (nur Schleife, nur mit Kennwort)
 *
 * | Weg | Wirkung |
 * |---|---|
 * | `GET /ready` | meldet `{ok:true}` — der Host liest daraus den Port |
 * | `POST /transcribe?language=<kennung>` | Rumpf = WAV-Bytes, Antwort = `{text,audioSeconds,inferenceSeconds}` |
 * | `POST /shutdown` | beendet den Prozeß |
 *
 * Jede Anfrage braucht `Authorization: Bearer <DSH_SPEECH_TOKEN>`; der Vergleich
 * läuft in **konstanter Zeit** (`timingSafeEqual`), damit das Kennwort nicht über
 * Laufzeitunterschiede erratbar wird. Der Port ist 0 — das Betriebssystem vergibt
 * ihn, der Host erfährt ihn über `/ready`.
 *
 * ## Aufruf
 *
 * ```
 * node worker.js '<JSON mit modelDirectory, family, threads, sprache …>'
 * ```
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/** Ein WAV-Stück, das der Erkenner verarbeiten kann. */
interface Segment {
  readonly samples: Float32Array
  readonly sekunden: number
}

/** Die Felder, die der Host dem Kindprozeß übergibt. */
export interface WorkerConfig {
  /** Ordner mit den geprüften Gewichten. */
  readonly modelDirectory: string
  /** Erkenner-Familie. */
  readonly family: 'whisper' | 'nemoCtc'
  /** Dateinamen der Gewichte, wie sie im Ordner liegen. */
  readonly encoderName?: string
  readonly decoderName?: string
  readonly tokensName: string
  /** Silero-VAD-Datei; fehlt sie, wird die ganze Aufnahme in einem Stück erkannt. */
  readonly vadModelPath?: string
  /** CPU-Fäden für die Erkennung. */
  readonly threads: number
  /** Sprachhinweis, wenn die Anfrage keinen mitbringt. */
  readonly language: string
  /** Obergrenze der Sprachstücke in Sekunden. */
  readonly segmentSeconds: number
  /** Sprechwahrscheinlichkeit, ab der Silero Sprache annimmt. */
  readonly vadThreshold: number
  /** Kürzeste Sprache in Sekunden. */
  readonly minSpeechSeconds: number
  /** Stille, die zwei Sprachstücke trennt. */
  readonly minSilenceSeconds: number
}

/** Ein geprüfter WAV-Puffer in seine Bestandteile zerlegt. */
interface Wave {
  readonly samples: Float32Array
  readonly rate: number
  readonly sekunden: number
}

/**
 * Liest einen WAV-Puffer (PCM16, mono oder mehrkanalig).
 *
 * **Warum hier nicht der Prüfer der Vorlage benutzt wird.** Der Host prüft die
 * Aufnahme bereits (`validateWave` im Fernweg) und schickt ausschließlich
 * kanonisches 16-kHz-mono-PCM16. Dieser Leser ist deshalb der **zweite** Wächter
 * für den Fall, daß jemand den Kindprozeß direkt anspricht: er nimmt jede
 * Abtastrate und jedes PCM16-Format an, weil sherpa-onnx selbst umrechnet
 * (gemessen: 22 050 Hz → 16 000 Hz im Trockenlauf).
 *
 * @param roh - die WAV-Bytes.
 * @returns Abtastwerte in [-1, 1] samt Rate und Dauer.
 */
export function leseWave(roh: Buffer): Wave {
  if (roh.byteLength < 44) throw new Error('WAV zu kurz')
  if (roh.subarray(0, 4).toString('ascii') !== 'RIFF') throw new Error('kein RIFF-Kopf')
  if (roh.subarray(8, 12).toString('ascii') !== 'WAVE') throw new Error('kein WAVE-Kopf')
  const sicht = new DataView(roh.buffer, roh.byteOffset, roh.byteLength)
  const format = sicht.getUint16(20, true)
  const kanaele = sicht.getUint16(22, true)
  const rate = sicht.getUint32(24, true)
  const bits = sicht.getUint16(34, true)
  if (format !== 1 || bits !== 16) throw new Error(`nur PCM16 wird angenommen (Format ${format}, ${bits} Bit)`)
  if (kanaele < 1 || rate < 8000) throw new Error('unbrauchbare Kanal- oder Ratenangabe')
  const anzahl = Math.floor((roh.byteLength - 44) / (2 * kanaele))
  const samples = new Float32Array(anzahl)
  for (let i = 0; i < anzahl; i++) samples[i] = sicht.getInt16(44 + i * 2 * kanaele, true) / 32768
  return { samples, rate, sekunden: anzahl / rate }
}

/**
 * Zerlegt eine Aufnahme mit Silero-VAD in Sprachstücke.
 *
 * **Warum überhaupt zerlegt wird.** Ein Erkenner verliert bei sehr langen Stücken
 * Genauigkeit, und Stille kostet nur Zeit. Ohne VAD-Datei wird die Aufnahme als
 * **ein** Stück behandelt — das ist der ehrliche Rückfall, kein Fehler.
 *
 * @param sherpa - das geladene native Modul.
 * @param config - Grenzen für die Zerlegung.
 * @param klang - die gelesene Aufnahme.
 * @returns die Sprachstücke in zeitlicher Reihenfolge.
 */
function zerlege(sherpa: any, config: WorkerConfig, klang: Wave): Segment[] {
  if (!config.vadModelPath) return [{ samples: klang.samples, sekunden: klang.sekunden }]
  const detektor = new sherpa.Vad(
    {
      sileroVad: {
        model: config.vadModelPath,
        threshold: config.vadThreshold,
        minSilenceDuration: config.minSilenceSeconds,
        minSpeechDuration: config.minSpeechSeconds,
        maxSpeechDuration: config.segmentSeconds,
        windowSize: 512,
      },
      sampleRate: 16000,
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
    },
    config.segmentSeconds + config.minSilenceSeconds + 1,
  )
  /** Fenster von 512 Abtastwerten, wie Silero es erwartet. */
  for (let start = 0; start < klang.samples.length; start += 512) {
    detektor.acceptWaveform(klang.samples.subarray(start, Math.min(start + 512, klang.samples.length)))
  }
  detektor.flush()
  const stuecke: Segment[] = []
  while (!detektor.isEmpty()) {
    const stueck = detektor.front()
    detektor.pop()
    const samples = stueck.samples as Float32Array
    stuecke.push({ samples, sekunden: samples.length / 16000 })
  }
  detektor.clear()
  return stuecke.length > 0 ? stuecke : [{ samples: klang.samples, sekunden: klang.sekunden }]
}

/**
 * Startet den Erkenner und den Schleifenserver.
 *
 * @param config - geprüfte Laufzeitangaben des Hosts.
 */
export function starte(config: WorkerConfig): void {
  const require = createRequire(import.meta.url)
  const sherpa = require('sherpa-onnx-node')
  const tokens = join(config.modelDirectory, config.tokensName)
  const modell = config.family === 'whisper'
    ? {
        whisper: {
          encoder: join(config.modelDirectory, config.encoderName as string),
          decoder: join(config.modelDirectory, config.decoderName as string),
          language: config.language,
          task: 'transcribe',
        },
        tokens,
      }
    : { nemoCtc: { model: join(config.modelDirectory, config.encoderName as string) }, tokens }

  const erkenner = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: { ...modell, numThreads: config.threads, provider: 'cpu', debug: 0 },
  })

  /** Erkennt ein Sprachstück und gibt den Text zurück. */
  const erkenne = (segment: Segment, language: string): string => {
    if (config.family === 'whisper') {
      const mitSprache = {
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          ...modell,
          whisper: { ...modell.whisper, language },
          numThreads: config.threads,
          provider: 'cpu',
          debug: 0,
        },
      }
      erkenner.setConfig(mitSprache)
    }
    const strom = erkenner.createStream()
    strom.acceptWaveform({ samples: segment.samples, sampleRate: 16000 })
    erkenner.decode(strom)
    return String(erkenner.getResult(strom).text ?? '')
  }

  const erwartet = process.env.DSH_SPEECH_TOKEN ?? ''
  if (erwartet.length < 16) throw new Error('DSH_SPEECH_TOKEN fehlt oder ist zu kurz')

  /** Vergleicht das vorgelegte Kennwort in konstanter Zeit. */
  const kennwortStimmt = (kopf: string | undefined): boolean => {
    const treffer = /^Bearer\s+(.+)$/u.exec(kopf ?? '')
    if (!treffer) return false
    const a = Buffer.from(treffer[1])
    const b = Buffer.from(erwartet)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  const server = createServer((anfrage, antwort) => {
    /** Schreibt eine JSON-Antwort mit Status. */
    const sende = (status: number, koerper: unknown): void => {
      const text = JSON.stringify(koerper)
      antwort.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) })
      antwort.end(text)
    }
    const pfad = new URL(anfrage.url ?? '/', 'http://127.0.0.1').pathname
    if (pfad === '/ready' && anfrage.method === 'GET') {
      sende(200, { ok: true, modell: config.family, prozess: process.pid })
      return
    }
    if (!kennwortStimmt(anfrage.headers.authorization)) {
      sende(401, { error: 'unberechtigt' })
      return
    }
    if (pfad === '/shutdown' && anfrage.method === 'POST') {
      sende(200, { ok: true })
      server.close(() => process.exit(0))
      return
    }
    if (pfad !== '/transcribe' || anfrage.method !== 'POST') {
      sende(404, { error: 'unbekannter Weg' })
      return
    }
    const stuecke: Buffer[] = []
    anfrage.on('data', (stueck: Buffer) => stuecke.push(stueck))
    anfrage.on('end', () => {
      try {
        const roh = Buffer.concat(stuecke)
        const sprache = new URL(anfrage.url ?? '/', 'http://127.0.0.1').searchParams.get('language') ?? config.language
        const klang = leseWave(roh)
        const segmente = zerlege(sherpa, config, klang)
        const start = performance.now()
        const texte = segmente.map((segment) => erkenne(segment, sprache)).filter((text) => text.length > 0)
        const dauer = (performance.now() - start) / 1000
        sende(200, {
          text: texte.join(' ').trim(),
          audioSeconds: klang.sekunden,
          inferenceSeconds: dauer,
          segments: segmente.length,
          hash: createHash('sha256').update(roh).digest('hex').slice(0, 12),
        })
      } catch (fehler) {
        sende(400, { error: fehler instanceof Error ? fehler.message : String(fehler) })
      }
    })
  })

  server.listen(0, '127.0.0.1', () => {
    const adresse = server.address()
    if (adresse === null || typeof adresse === 'string') throw new Error('kein Port vergeben')
    // **Diese Zeile ist die Bereitschaftsmeldung.** Der Host liest sie aus der
    // Standardausgabe, weil nur so der vom Betriebssystem vergebene Port bekannt wird.
    console.log(JSON.stringify({ port: adresse.port, pid: process.pid, family: config.family }))
  })
}

if (process.argv[1] && /worker\.(ts|js)$/u.test(process.argv[1])) {
  const config = JSON.parse(process.argv[2] ?? '{}') as WorkerConfig
  starte(config)
}

// Nur für den Typprüfer: der Kindprozeß liest die Gewichte selbst, diese Angabe
// hält den Import lebendig, falls ein Bündeler unbenutzte Importe entfernt.
void readFileSync
