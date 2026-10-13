/**
 * `@prometheus-harness/llm` — der LLM-Seam.
 *
 * **Warum ein Seam und nicht ein Client.** Der Agent-Loop darf **einen**
 * Anbieter nicht kennen. Er kennt diese Datei: eine Anfrage aus Nachrichten
 * geht hinein, ein Ergebnis mit Text und Werkzeugaufrufen kommt heraus. Welcher
 * Anbieter dahinter antwortet, ist eine Konfigurationsfrage — dieselbe Trennung,
 * die der Referenz-Harness mit `llm/llm` (Seam) und `llm/llm-deepseek`
 * (Implementierung) zieht (`MAPPING.md` §3.4, Stufe A).
 *
 * **Was hier bewusst NICHT passiert:** kein HTTP, kein Schlüssel, keine
 * Wiederholung, kein Token-Zählen. Jede dieser Aufgaben ist ein eigenes Paket
 * (`llm-deepseek`, `llm-retry`, `token-meter`), weil sie unabhängig
 * ausgetauscht werden sollen. Ein Seam, der alles mitbringt, ist kein Seam.
 *
 * @module @prometheus-harness/llm
 */

// ---------------------------------------------------------------------------
// Nachrichten
// ---------------------------------------------------------------------------

/** Wer eine Nachricht beigetragen hat. */
export type Role = 'system' | 'user' | 'assistant' | 'tool'

/** Ein Textstück einer Nachricht. */
export interface TextPart {
  readonly type: 'text'
  readonly text: string
}

/** Ein Werkzeugergebnis, das der Loop zurückschickt. */
export interface ToolResultPart {
  readonly type: 'tool-result'
  /** Kennung des Aufrufs, zu dem dieses Ergebnis gehört. */
  readonly callId: string
  /** Ergebnis als Text; ein Anbieter ohne strukturierte Ergebnisse bekommt das so. */
  readonly content: string
}

/** Ein Teil einer Nachricht. */
export type MessagePart = TextPart | ToolResultPart

/** Eine Nachricht im Verlauf. */
export interface Message {
  readonly role: Role
  /**
   * Teile der Nachricht. Eine reine Textnachricht ist erlaubt; sie wird
   * intern zu genau einem {@link TextPart}.
   */
  readonly parts: readonly MessagePart[]
  /** Bei `role: 'tool'` die Kennung des beantworteten Aufrufs. */
  readonly toolCallId?: string
}

// ---------------------------------------------------------------------------
// Werkzeuge
// ---------------------------------------------------------------------------

/**
 * Ein Werkzeug, wie der Anbieter es sieht.
 *
 * **Warum das Schema offen typisiert ist.** Jeder Anbieter beschreibt seine
 * Werkzeuge anders (JSON Schema, eigene Felder). Der Seam gibt die Beschreibung
 * **unverändert** weiter, statt sie zu normalisieren — eine Normalisierung
 * würde Informationen wegwerfen, die ein Anbieter braucht. Der Loop baut die
 * Beschreibung, der Adapter reicht sie durch.
 */
export interface ToolSpec {
  readonly name: string
  readonly description: string
  /** Anbieter-spezifische Parameterbeschreibung, unverändert. */
  readonly parameters: Readonly<Record<string, unknown>>
}

/** Ein vom Modell angeforderter Werkzeugaufruf. */
export interface ToolCall {
  /** Kennung, mit der das Ergebnis zurückkommt. */
  readonly id: string
  readonly name: string
  /** Argumente als bereits geparste Struktur (der Adapter parst das JSON). */
  readonly arguments: Readonly<Record<string, unknown>>
}

// ---------------------------------------------------------------------------
// Anfrage und Antwort
// ---------------------------------------------------------------------------

/** Warum die Antwort endete. */
export type FinishReason = 'stop' | 'tool-calls' | 'length' | 'content-filter'

/** Eine Anfrage an ein Modell. */
export interface CompletionRequest {
  /** Modellkennung, anbieterspezifisch (z. B. `deepseek-chat`). */
  readonly model: string
  readonly messages: readonly Message[]
  /** Leer heißt: das Modell darf nur Text liefern. */
  readonly tools?: readonly ToolSpec[]
  readonly temperature?: number
  /** Obergrenze der erzeugten Token, sofern der Anbieter sie kennt. */
  readonly maxTokens?: number
  /** Abbruchsignal — der Loop bricht damit ab, wenn der Benutzer stoppt. */
  readonly signal?: AbortSignal
}

/** Zählung der verbrauchten Token, sofern der Anbieter sie meldet. */
export interface Usage {
  readonly inputTokens: number
  readonly outputTokens: number
}

/** Die Antwort eines Modells. */
export interface CompletionResult {
  /** Text der Antwort; kann leer sein, wenn nur Werkzeuge angefordert wurden. */
  readonly text: string
  /** Angeforderte Werkzeugaufrufe in Reihenfolge. */
  readonly toolCalls: readonly ToolCall[]
  readonly finishReason: FinishReason
  /** Kennung des Modells, das tatsächlich geantwortet hat (kann abweichen). */
  readonly model: string
  readonly usage?: Usage
}

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

/** Warum eine Anfrage scheiterte. */
export type LlmErrorKind =
  /** Der Anbieter antwortete nicht rechtzeitig. */
  | 'timeout'
  /** Netzwerk- oder Verbindungsfehler. */
  | 'transport'
  /** Der Anbieter hat die Anfrage abgelehnt (4xx). */
  | 'rejected'
  /** Der Anbieter ist überlastet oder begrenzt (429/5xx). */
  | 'unavailable'
  /** Zugangsdaten fehlen oder sind ungültig. */
  | 'credentials'
  /** Die Antwort war nicht lesbar (Format, abgeschnittener Strom). */
  | 'malformed'
  /** Der Aufruf wurde abgebrochen. */
  | 'aborted'

/**
 * Ein Fehler des Seams.
 *
 * **Warum `kind` und nicht nur eine Meldung.** Der Loop muss unterscheiden:
 * ein `unavailable` darf **wiederholt** werden, ein `rejected` nicht — sonst
 * läuft eine Anfrage, die nie gelingen kann, fünfmal. `malformed` darf
 * wiederholt werden, aber nur mit einer Korrektur. Diese Entscheidung gehört
 * dem Loop; der Adapter liefert nur die Tatsache.
 */
export class LlmError extends Error {
  readonly kind: LlmErrorKind
  /** Anbieter-Kennung, sofern bekannt (z. B. `429`). */
  readonly providerCode?: string
  /** Ob ein Wiederholen sinnvoll ist — Vorschlag, keine Entscheidung. */
  readonly retryable: boolean

  constructor(
    kind: LlmErrorKind,
    message: string,
    options: { readonly providerCode?: string; readonly retryable?: boolean; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'LlmError'
    this.kind = kind
    const retryable = options.retryable ?? (kind === 'unavailable' || kind === 'transport' || kind === 'timeout')
    this.retryable = retryable
    if (options.providerCode !== undefined) this.providerCode = options.providerCode
  }
}

// ---------------------------------------------------------------------------
// Der Seam
// ---------------------------------------------------------------------------

/**
 * Ein LLM-Anbieter.
 *
 * **Die eine Methode, die zählt.** Mehr braucht der Loop nicht: eine Anfrage
 * stellen. Alles Weitere — Wiederholung, Token-Zählung, Kostenrechnung,
 * Modellwahl — liegt darüber, nicht darin.
 */
export interface LlmProvider {
  /** Stabiler Name, z. B. `deepseek`. Erscheint in Diagnosen und Berichten. */
  readonly name: string
  /**
   * Stellt eine Anfrage und wartet auf die vollständige Antwort.
   *
   * **Warum nicht streamend, obwohl der Harness streamt.** Der Loop braucht
   * für seinen ersten Lauf die **ganze** Antwort: er muss entscheiden, ob
   * Werkzeuge aufgerufen werden, bevor er etwas anzeigt. Streaming ist eine
   * Frage der Darstellung und kommt als eigene Methode dazu, wenn die
   * Oberfläche sie braucht — nicht vorab.
   *
   * @param request - Modell, Nachrichten, Werkzeuge
   * @returns die Antwort
   * @throws LlmError bei jedem Scheitern, mit unterscheidbarem `kind`
   */
  complete(request: CompletionRequest): Promise<CompletionResult>
}

// ---------------------------------------------------------------------------
// Hilfen, die jeder Aufrufer braucht
// ---------------------------------------------------------------------------

/** Baut eine reine Textnachricht. */
export function textMessage(role: Role, text: string): Message {
  return { role, parts: [{ type: 'text', text }] }
}

/** Setzt die Textteile einer Nachricht zu einem String zusammen. */
export function messageText(message: Message): string {
  return message.parts
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

/**
 * Übersetzt einen durchgereichten Abbruch in einen `LlmError` der Art `aborted`.
 *
 * **Warum das eine Hilfe ist.** Jedes HTTP-Werkzeug wirft bei Abbruch einen
 * eigenen Fehlertyp (`AbortError`, `DOMException`, `Error` mit `name`). Der
 * Loop soll **einen** Typ kennen. Diese Funktion prüft die Form, nicht die
 * Klasse — damit sie auch für selbstgebaute Abbrüche gilt.
 *
 * @param cause - der gefangene Wert
 * @returns `true`, wenn er einen Abbruch bezeichnet
 */
export function isAbortCause(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null) return false
  const candidate = cause as { readonly name?: unknown; readonly code?: unknown }
  return candidate.name === 'AbortError' || candidate.code === 'ABORT_ERR'
}

/**
 * Prüft, ob ein Wert ein brauchbarer Anbieter ist.
 *
 * **Warum das nötig ist.** Ein Anbieter kommt als geladenes Plugin herein, also
 * als `unknown`. Eine Prüfung an der Grenze ist billiger als ein Absturz
 * mitten in einer Anfrage.
 *
 * @param value - der zu prüfende Wert
 * @returns `true`, wenn er {@link LlmProvider} erfüllt
 */
export function isLlmProvider(value: unknown): value is LlmProvider {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { readonly name?: unknown; readonly complete?: unknown }
  return typeof candidate.name === 'string' && candidate.name !== '' && typeof candidate.complete === 'function'
}
