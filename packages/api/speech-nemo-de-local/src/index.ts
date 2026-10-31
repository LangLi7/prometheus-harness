/**
 * NVIDIA NeMo German fastconformer als lokaler Spracherkenner — **nur Deutsch**.
 *
 * ## Warum ein zweiter lokaler Anbieter neben Whisper
 *
 * Whisper `base` ist klein und schnell, aber ein Basismodell: bei Fachbegriffen,
 * Namen und Zahlen läßt die Genauigkeit nach. Dieses Modell ist auf **Deutsch**
 * trainiert (NeMo `stt_de_fastconformer_hybrid_large_pc`) und gewinnt dort, wo es
 * darauf ankommt — kostet aber 132 MB und **versteht kein Englisch**. Beide
 * anzubieten ist der ehrliche Weg: die Wahl hängt am Satz, nicht am Geschmack.
 *
 * **Gemessen am 14.10.2026** (Trockenlauf, CPU, 4 Fäden, Testaufnahme des
 * Modellherstellers):
 *
 * | Aufnahme | Text | Zeit |
 * |---|---|---|
 * | Deutsch, 2,75 s (22 050 Hz) | „Alles hat ein Ende , nur die Wurst hat zwei" | 50 ms nach 767 ms Ladezeit |
 *
 * Das sind **55× Echtzeit** — auf der CPU, ohne Grafikkarte.
 *
 * ## Der Unterschied zur Whisper-Hülle
 *
 * Nur zwei Zeilen: das Modell und der Sprachumfang. Deshalb steht hier keine
 * zweite Mechanik.
 *
 * @module @prometheus-harness/speech-nemo-de-local
 */

import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import type { Context } from '@deepseek-ai/cordis'
import { STANDARD_ORIGINS, registriere, type LocalProviderConfig } from '@prometheus-harness/speech-local-base'
import { NEMO_DE } from '@prometheus-harness/speech-local-base/manifest'

/** Name des Ladeprogramm-Eintrags. */
export const name = 'pmh-speech-nemo-de-local'

/** Der Dienst, an den sich dieser Anbieter hängt. */
export const inject = ['speechToText', 'subprocess']

/**
 * Die prüfbaren Laufzeitangaben.
 *
 * **Warum `auto` in der Sprachliste steht, obwohl das Modell nur Deutsch kann.**
 * NeMo erkennt nicht selbst, welche Sprache gesprochen wird. `auto` bedeutet hier
 * deshalb „ohne Hinweis erkennen" — also Deutsch, weil das Modell nichts anderes
 * kennt. Die Kennung ist trotzdem nützlich: die Oberfläche zeigt sie als Vorgabe,
 * und ein Verbraucher, der die Sprache nicht kennt, muß nichts raten.
 */
export const Config = z.object({
  providerId: z.string().min(1).default('nemo-de-local'),
  displayName: z.string().min(1).default('NeMo German large (lokal, de)'),
  dataRoot: z.union([z.string().min(1), z.const(undefined)]).default(undefined),
  dataSubdir: z.string().min(1).default('speech-to-text/nemo-de/models/nemo-onnx'),
  languages: z.array(z.string().min(1)).min(1).default(['de', 'auto']),
  language: z.string().min(1).default('de'),
  modelOrigins: z.array(z.string().pattern(/^https?:\/\/[^/\s?#@]+\/?$/u)).min(1).default([...STANDARD_ORIGINS]),
  threads: z.natural().min(1).default(4),
  segmentSeconds: z.number().min(1).max(120).default(30),
  vadThreshold: z.number().min(0).max(1).default(0.5),
  minSpeechSeconds: z.number().min(0).default(0.25),
  minSilenceSeconds: z.number().min(0.01).default(0.5),
  prepareTimeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(3600_000),
  inferenceTimeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(300_000),
  idleTimeoutMs: z.natural().max(MAX_TIMER_DELAY_MS).default(300_000),
  maxPending: z.natural().min(1).default(4),
  graceMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(1000),
  maxLogBytes: z.natural().min(1).default(64 * 1024),
  maxResponseBytes: z.natural().min(1).default(128 * 1024),
  maxAudioBytes: z.natural().min(46).default(8 * 1024 * 1024),
})

/**
 * Meldet den lokalen deutschen Erkenner an.
 *
 * @param ctx - der Kontext des ladenden Pakets.
 * @param config - geprüfte Laufzeitangaben.
 */
export function apply(ctx: Context, config: z.infer<typeof Config>): void {
  const vollstaendig: LocalProviderConfig = {
    ...config,
    variant: NEMO_DE,
  }
  registriere(ctx, vollstaendig)
  ctx.logger.info(
    `Lokaler deutscher Spracherkenner bereit: ${config.displayName} (Modell NeMo German fastconformer int8)`,
  )
}
