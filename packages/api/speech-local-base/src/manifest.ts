/**
 * Herkunft und Prüfsummen der Gewichte.
 *
 * ## Warum die Angaben hier stehen und nicht in der Vorbereitung
 *
 * Die Vorlage (`@deepseek-ai/dsh-experimental-speech-to-text-sensevoice`) führt
 * ihre Dateien in `runtime/assets.json`: festgenagelte Revision, Größe, SHA-256.
 * Für Whisper und NeMo gibt es das dort **nicht** — die Angaben wurden am
 * 14.10.2026 über die Hugging-Face-Schnittstelle geholt (`/tree/<rev>` liefert
 * `size`, bei LFS-Dateien `lfs.oid` = SHA-256) und sind hier festgeschrieben.
 *
 * **Was das leistet.** Eine festgenagelte Revision bedeutet: derselbe Inhalt, auch
 * wenn das Repositorium weiterentwickelt wird. Die Größe erkennt einen
 * abgebrochenen Download, die Prüfsumme einen veränderten Inhalt. Beides wird vor
 * dem Laden geprüft — und **erst nach bestandener Prüfung** umbenannt.
 *
 * **Was das nicht leistet.** Es ist keine Signatur. Wer den Hugging-Face-Server
 * oder den Weg dorthin kontrolliert, kann andere Gewichte unterschieben, solange
 * er auch dieses Manifest ändert. Das ist derselbe Stand wie bei der Vorlage.
 */

/** Eine Datei, die zu einem Modell gehört. */
export interface ModelFile {
  /** Rolle der Datei; der Erkenner braucht sie unter diesem Namen. */
  readonly role: 'encoder' | 'decoder' | 'tokens' | 'model'
  /** Dateiname im Zielordner. */
  readonly name: string
  /** Erwartete Größe in Bytes. */
  readonly bytes: number
  /** Erwarteter SHA-256 (Kleinschreibung); `undefined` läßt die Inhaltsprüfung aus. */
  readonly sha256?: string
}

/** Ein Modell samt Herkunft und Dateien. */
export interface ModelVariant {
  /** Hugging-Face-Repositorium, z. B. `csukuangfj/sherpa-onnx-whisper-base`. */
  readonly repo: string
  /** Festgenagelte Revision (Commit-SHA). */
  readonly revision: string
  /** Erkenner-Familie im Sinne von sherpa-onnx. */
  readonly family: 'whisper' | 'nemoCtc'
  /** Die Dateien in der Reihenfolge, in der sie geladen werden. */
  readonly files: readonly ModelFile[]
}

/** Whisper `base`, int8 — ein Modell für Deutsch **und** Englisch. */
export const WHISPER_BASE: ModelVariant = {
  repo: 'csukuangfj/sherpa-onnx-whisper-base',
  revision: 'bb53ee204431c90d314c1cc08d28d23e5b7927cc',
  family: 'whisper',
  files: [
    {
      role: 'encoder',
      name: 'base-encoder.int8.onnx',
      bytes: 29120534,
      sha256: '0b8fb1304b6109976038efff5ace81720e00386f3ff6b54ee8c75291ca0a1e11',
    },
    {
      role: 'decoder',
      name: 'base-decoder.int8.onnx',
      bytes: 130672026,
      sha256: '9759d217388a01b3a4c7c15533201067b48ae819c4daafc8624e64b9409dc02d',
    },
    {
      role: 'tokens',
      name: 'base-tokens.txt',
      bytes: 816730,
      sha256: 'b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126',
    },
  ],
}

/** NVIDIA NeMo `stt_de_fastconformer_hybrid_large_pc`, int8 — Deutsch, sehr genau. */
export const NEMO_DE: ModelVariant = {
  repo: 'csukuangfj/sherpa-onnx-nemo-stt_de_fastconformer_hybrid_large_pc-int8',
  revision: 'main',
  family: 'nemoCtc',
  files: [
    {
      role: 'model',
      name: 'model.int8.onnx',
      bytes: 131652945,
      sha256: 'fcf42d4fd55b42b0b11fed368b04467f0a636a52f44bcacd3f4667697c26e259',
    },
    {
      role: 'tokens',
      name: 'tokens.txt',
      bytes: 10686,
    },
  ],
}

/**
 * Der Silero-VAD, den der lokale Erkenner zur Segmentierung benutzt.
 *
 * **Dieselbe Datei wie die Vorlage** — sie liegt bereits im Katalog dieses
 * Rechners und wird deshalb nicht erneut geladen, wenn sie schon da ist.
 */
export const SILERO_VAD: ModelFile = {
  role: 'model',
  name: 'silero_vad.onnx',
  bytes: 1807522,
  sha256: 'a35ebf52fd3ce5f1469b2a36158dba761bc47b973ea3382b3186ca15b1f5af28',
}

/** Quellen für den Abruf der Gewichte, in der Reihenfolge des Versuchs. */
export const MODEL_ORIGINS: readonly string[] = [
  'https://huggingface.co',
  'https://hf-mirror.com',
]

/**
 * Baut die Abrufadresse einer Datei.
 *
 * @param origin - Ursprung, z. B. `https://huggingface.co`
 * @param variant - Modell mit Repositorium und Revision
 * @param datei - die gewünschte Datei
 * @returns vollständige Adresse
 */
export function assetUrl(origin: string, variant: ModelVariant, datei: ModelFile): string {
  return `${origin.replace(/\/$/u, '')}/${variant.repo}/resolve/${variant.revision}/${datei.name}`
}
