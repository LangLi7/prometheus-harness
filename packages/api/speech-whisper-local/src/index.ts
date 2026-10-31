/**
 * Whisper `base` als lokaler Spracherkenner — ein Modell für **Deutsch und
 * Englisch**.
 *
 * ## Warum Whisper und nicht etwas Deutsches
 *
 * Der Anlaß war „deutsch und englisch fokussiert". Whisper ist mehrsprachig
 * trainiert und **erkennt die Sprache selbst** (`language: auto`), kann aber auch
 * fest auf `de` oder `en` gestellt werden — das ist bei gemischten Sätzen
 * („das Deployment ist grün") der Unterschied zwischen brauchbar und geraten.
 *
 * **Gemessen am 14.10.2026** (Trockenlauf, CPU, 4 Fäden):
 *
 * | Aufnahme | Text | Zeit |
 * |---|---|---|
 * | Deutsch, 2,75 s | „Alles hat ein Ende, nur die Wurst hat zwei." | 271 ms |
 * | Englisch, 6,63 s | „After early nightfall, the yellow lamps would light up here and there, the squalid quarter of the brothels." | 516 ms |
 *
 * Im **Prüfstand mit Kindprozeß** (derselbe Weg wie im Host): 2,75 s Deutsch in
 * 312 ms, 6,63 s Englisch in 539 ms — die Vorbereitung meldet nach 240 ms `ready`,
 * ohne etwas zu laden.
 *
 * ## Was hier nur Konfiguration ist
 *
 * Die ganze Mechanik — Herkunft und Prüfsumme der Gewichte, Vorbereitung mit
 * Fortschritt, Kindprozeß, Warteschlange, Abbau — liegt in
 * `@prometheus-harness/speech-local-base`. Dieses Paket setzt den **einen**
 * Unterschied: das Modell und den Namen.
 *
 * @module @prometheus-harness/speech-whisper-local
 */

import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import type { Context } from '@deepseek-ai/cordis'
import { STANDARD_ORIGINS, registriere, type LocalProviderConfig } from '@prometheus-harness/speech-local-base'
import { WHISPER_BASE } from '@prometheus-harness/speech-local-base/manifest'

/** Name des Ladeprogramm-Eintrags. */
export const name = 'pmh-speech-whisper-local'

/** Der Dienst, an den sich dieser Anbieter hängt. */
export const inject = ['speechToText', 'subprocess']

/**
 * Die prüfbaren Laufzeitangaben.
 *
 * **Warum `dataRoot` freiwillig ist.** Die Zeilen, die dieses Paket in das Profil
 * eintragen, entstehen in `scripts/profile-patch.mjs` und tragen keine
 * `config`-Werte (Form: `id` + `name` + `inject`). Fehlt der Ort, wird er aus
 * `DSH_HOME` gebildet — dieselbe Quelle, aus der der Kern seinen Wohnort nimmt.
 * Wer ihn ausdrücklich setzen will, kann das tun; die Vorgabe `dataSubdir` bleibt
 * dann unbenutzt.
 */
export const Config = z.object({
  providerId: z.string().min(1).default('whisper-local'),
  displayName: z.string().min(1).default('Whisper base (lokal, de+en)'),
  dataRoot: z.union([z.string().min(1), z.const(undefined)]).default(undefined),
  dataSubdir: z.string().min(1).default('speech-to-text/whisper/models/whisper-onnx'),
  languages: z.array(z.string().min(1)).min(1).default(['de', 'en', 'auto']),
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
 * Meldet den lokalen Whisper-Erkenner an.
 *
 * @param ctx - der Kontext des ladenden Pakets.
 * @param config - geprüfte Laufzeitangaben.
 */
export function apply(ctx: Context, config: z.infer<typeof Config>): void {
  const vollstaendig: LocalProviderConfig = {
    ...config,
    variant: WHISPER_BASE,
  }
  registriere(ctx, vollstaendig)
  ctx.logger.info(
    `Lokaler Spracherkenner bereit: ${config.displayName} (Modell Whisper base int8, Sprachen ${config.languages.join(', ')})`,
  )
}
