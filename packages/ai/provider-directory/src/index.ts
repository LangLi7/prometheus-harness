/**
 * `@prometheus-harness/provider-directory` — das Verzeichnis der KI-Anbieter.
 *
 * ## Die Lücke, die dieses Paket füllt
 *
 * Gemessen am 15.10.2026 über **alle** Paketordner des Hosts: eine Suche nach
 * `embed|speech|tts|stt|transcri|image|rerank|vision|audio` ergibt **null Treffer**. Der
 * Anbieter-Kern des Hosts kann **nur Chat**. Für Sprache, Ton, Einbetten und Bild gibt es dort
 * keine Naht, keinen Anbieter, keinen Einstellungsort.
 *
 * Dieses Paket legt die fehlende Auskunft **als Daten** ab: je Familie von APIs, welche Fähigkeit
 * über welchen Weg läuft — und ob das **gemessen** ist oder nicht.
 *
 * ## Was hier NICHT steht
 *
 * **Kein Netzzugriff beim Import** und keine Umsetzung eines Anbieters. Die Umsetzung für
 * OpenRouter steht in `@prometheus-harness/openrouter` und ist dort gegen einen echten Socket
 * geprüft. Hier stehen die **Tatsachen über die Schnittstellen** und die **Sonde**, die sie
 * nachmißt.
 *
 * @module @prometheus-harness/provider-directory
 */

export {
  ANTHROPIC,
  DEEPSEEK,
  FAMILIEN,
  GEMESSEN_AM,
  NOUS,
  OPENCODE,
  OPENROUTER,
  ZAI,
  ZENMUX,
  familieMit,
  standDesWeges,
  type Familie,
  type Weg,
  type Wegart,
  type Wegstand,
} from './families.ts'

export {
  VERSUCHSPFAD,
  VerzeichnisFehler,
  frageModelle,
  frageModelleMitPreis,
  pruefeWeg,
  sonde,
  type Abruf,
  type Modellangabe,
  type Sondebefund,
  type SondeOptionen,
  type Wegbefund,
} from './probe.ts'
