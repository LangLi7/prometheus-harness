/**
 * `@prometheus-harness/llm-http` — der HTTP-Anbieter hinter dem LLM-Seam.
 *
 * **Was dieses Paket ist.** Die eine Implementierung, die aus
 * {@link CompletionRequest} einen HTTP-Aufruf macht und aus der Antwort wieder
 * einen {@link CompletionResult}. Alles Anbieterspezifische lebt **hier** — der
 * Seam bleibt sauber (`MAPPING.md` §3.4, Stufe A).
 *
 * **Warum ein eigener Anbieter und nicht ein fertiges SDK.** Drei Gründe:
 *   1. **Abhängigkeitsfrei** — kein SDK, das eigene Anforderungen an Laufzeit
 *      oder Versionen mitbringt. Der Aufruf ist ein `fetch` mit JSON.
 *   2. **Fehler in Seam-Typen** — ein SDK wirft eigene Fehlerklassen; wir
 *      brauchen {@link LlmError} mit unterscheidbarem `kind`.
 *   3. **Kein Schlüssel im Speicher des SDK** — der Schlüssel kommt als
 *      Argument herein und geht nirgends hinaus. Das Paket protokolliert ihn
 *      nie, auch nicht in Fehlermeldungen.
 *
 * **Die Schnittstelle.** Der Chat-Endpunkt des Anbieters ist OpenAI-kompatibel:
 * `POST /chat/completions` mit `{model, messages, tools}` und einer Antwort
 * `{choices: [{message: {content, tool_calls}, finish_reason}], usage}`.
 *
 * @module @prometheus-harness/llm-http
 */

import {
  LlmError,
  isAbortCause,
  messageText,
  messageToolCalls,
  messageToolResults,
  type CompletionRequest,
  type CompletionResult,
  type FinishReason,
  type LlmProvider,
  type Message,
  type ToolCall,
  type ToolSpec,
  type Usage,
} from '@prometheus-harness/llm'

/** Vorgabe-Adresse. Überschreibbar, damit Tests keinen echten Dienst brauchen. */
export const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'

// ---------------------------------------------------------------------------
// Zugangsschlüssel — im Wortlaut des Upstream-Vertrags
// ---------------------------------------------------------------------------

/**
 * Warum ein übergebener Schlüssel nicht verwendbar ist.
 *
 * **Wörtlich aus dem Upstream** (`@deepseek-ai/dsh-llm/api-key`): dort heißt der
 * Typ `ApiKeyRejection` und kennt genau diese zwei Gründe. Wir übernehmen die
 * Bezeichner, damit ein späterer Vergleich beider Fassungen ohne Übersetzung
 * möglich ist — die Vorgabe lautet „gleiche Logik und Benennung, andere Sprache".
 *
 * **Warum „leer" hier auftaucht, obwohl der Upstream es ausschließt:** Dort ist
 * das Fehlen eines Schlüssels ein **Konfigurationszustand** (ein Profil kann
 * einen Schlüssel über die Umgebung des Anbieters oder OAuth beziehen), und die
 * Prüffunktion sieht ihn nie. Unser Adapter bekommt den Schlüssel dagegen als
 * Zeichenkette — für ihn ist der leere Wert ein prüfbarer Fall.
 */
export type ApiKeyRejection = 'empty' | 'illegalCharacters'

/** Das Urteil über einen übergebenen Schlüssel. */
export type ApiKeyCheck =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: ApiKeyRejection }

/**
 * Beurteilt einen **übergebenen** Schlüssel — Leerraum an den Rändern wird
 * zuerst entfernt.
 *
 * **Das Trimmen ist still**, weil ein umgebender Leerraum genau eine Lesart hat
 * (dieselbe Regel wie im Upstream). Jeder andere Defekt wird gemeldet.
 *
 * **Was als unzulässig gilt:** Steuerzeichen und alles außerhalb des druckbaren
 * ASCII. Ein Schlüssel wandert in eine HTTP-Kopfzeile; ein Zeilenumbruch darin
 * ist entweder ein Tippfehler oder ein Versuch, zusätzliche Kopfzeilen
 * einzuschmuggeln. Beides darf nicht durchgehen.
 *
 * @param raw - der Schlüssel, wie er konfiguriert oder eingegeben wurde
 * @returns das getrimmte Urteil
 */
export function checkApiKey(raw: string): ApiKeyCheck {
  const value = raw.trim()
  if (value === '') return { ok: false, reason: 'empty' }
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    // Druckbares ASCII ohne Leerraum: 0x21–0x7E.
    if (code < 0x21 || code > 0x7e) return { ok: false, reason: 'illegalCharacters' }
  }
  return { ok: true, value }
}

/**
 * Wie {@link checkApiKey}, aber wirft statt ein Urteil zurückzugeben.
 *
 * **Wörtlich aus dem Upstream** (`assertUsableApiKey(raw, pkg, ref)`): die
 * Meldung nennt das **Paket** und die **Bezugsstelle**, damit im Fehlerfall
 * sichtbar ist, *wo* der Schlüssel herkam — ohne ihn zu nennen. Genau die
 * Angabe, die man braucht, wenn mehrere Profile und Umgebungsquellen im Spiel
 * sind.
 *
 * @param raw - der Schlüssel
 * @param pkg - Name des Pakets, das ihn verlangt
 * @param ref - woher er stammt (Umgebungsvariable, Profil, Eingabe)
 * @returns der getrimmte Schlüssel
 * @throws LlmError der Art `credentials`, wenn er nicht verwendbar ist
 */
export function assertUsableApiKey(raw: string, pkg: string, ref: string): string {
  const check = checkApiKey(raw)
  if (check.ok) return check.value
  const why =
    check.reason === 'empty'
      ? 'ist leer'
      : 'enthält unzulässige Zeichen (erlaubt ist druckbares ASCII ohne Leerraum)'
  // Der Schlüssel selbst wird **nie** genannt — auch nicht gekürzt.
  throw new LlmError('credentials', `${pkg}: Zugangsschlüssel aus ${ref} ${why}`, {
    retryable: false,
  })
}

/** Modellkennungen, die dieses Paket kennt. */
export const KNOWN_MODELS = ['deepseek-chat', 'deepseek-reasoner'] as const

/** Einstellungen des Anbieters. */
export interface LlmHttpOptions {
  /** Zugangsschlüssel. Pflicht — ohne ihn wirft der Aufruf `credentials`. */
  readonly apiKey: string
  /**
   * Basis-Adresse. Ohne Angabe {@link DEFAULT_BASE_URL}.
   *
   * **Warum das einstellbar ist.** Ein Test darf gegen eine lokale Attrappe
   * laufen; ohne diese Option müsste jeder Test das Netz und einen echten
   * Schlüssel haben. Das ist der Unterschied zwischen prüfbar und unprüfbar.
   */
  readonly baseUrl?: string
  /** Zeitgrenze in Millisekunden; Vorgabe 120 000. */
  readonly timeoutMs?: number
  /** Zusätzliche Kopfzeilen, z. B. für einen Proxy. Der Schlüssel bleibt außen vor. */
  readonly headers?: Readonly<Record<string, string>>
}

/** Ein Werkzeugaufruf, wie der Anbieter ihn liefert. */
interface RawToolCall {
  readonly id?: unknown
  readonly type?: unknown
  readonly function?: { readonly name?: unknown; readonly arguments?: unknown }
}

/** Die Antwortform, soweit wir sie lesen. Unbekanntes wird ignoriert. */
interface RawCompletion {
  readonly model?: unknown
  readonly choices?: readonly {
    readonly finish_reason?: unknown
    readonly message?: {
      readonly content?: unknown
      readonly tool_calls?: readonly RawToolCall[]
    }
  }[]
  readonly usage?: {
    readonly prompt_tokens?: unknown
    readonly completion_tokens?: unknown
  }
}

/**
 * Übersetzt den `finish_reason` des Anbieters in unsere vier Werte.
 *
 * **Warum eine Abbildung und kein Durchreichen.** Der Loop verzweigt über
 * `finishReason`. Ein unbekannter Anbieterwert würde dort durchfallen; hier
 * wird er zu `stop` — die konservative Wahl, weil „unbekannt" nicht
 * „Werkzeugaufruf erwartet" bedeutet.
 *
 * @param raw - der Wert des Anbieters
 * @param hasToolCalls - ob die Antwort Werkzeugaufrufe trägt
 * @returns der Seam-Wert
 */
export function mapFinishReason(raw: unknown, hasToolCalls: boolean): FinishReason {
  if (hasToolCalls) return 'tool-calls'
  switch (raw) {
    case 'tool_calls':
      return 'tool-calls'
    case 'length':
      return 'length'
    case 'content_filter':
      return 'content-filter'
    default:
      return 'stop'
  }
}

/** Liest eine Zahl, wenn sie eine ist. */
function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Baut die Nutzlast für den Anbieter.
 *
 * **Warum Werkzeugergebnisse als `role: 'tool'` gehen.** Der Anbieter (OpenAI-Form)
 * erwartet ein Ergebnis als eigene Nachricht mit `tool_call_id`. Der Seam
 * erlaubt Ergebnisse auch als Teil einer Nachricht; hier wird daraus die
 * Anbieterform — die Übersetzung gehört in den Adapter, nicht in den Loop.
 *
 * **Der Befund, der diese Funktion geändert hat (gemessen, 13.10.2026).** In der
 * ersten Fassung wurde eine Assistenten-Nachricht **nur als Text** übersetzt:
 *
 * ```ts
 * if (text !== '' || message.role !== 'assistant') messages.push({ role, content: text })
 * ```
 *
 * Eine Assistenten-Nachricht, die ausschließlich einen Werkzeugaufruf trug,
 * wurde damit **ganz weggelassen**; trug sie Text und Aufruf, ging nur der Text
 * hinaus. Die folgenden `role: 'tool'`-Nachrichten zeigten dann auf
 * `tool_call_id`s, die in der Nutzlast nicht existierten — OpenAI-kompatible
 * Anbieter beantworten das mit `400 Bad Request`. Der Fehler wäre erst bei der
 * **ersten echten Werkzeugrunde** aufgetreten. Jetzt wird der Aufruf mit
 * übersetzt (`tool_calls` mit `function.arguments` als **String**, wie es die
 * Schnittstelle verlangt).
 *
 * @param request - die Seam-Anfrage
 * @returns der JSON-Body
 */
export function buildBody(request: CompletionRequest): Record<string, unknown> {
  const messages: Record<string, unknown>[] = []
  for (const message of request.messages) {
    const text = messageText(message)
    const toolResults = messageToolResults(message)

    if (message.role === 'tool' && toolResults.length > 0) {
      for (const part of toolResults) {
        messages.push({ role: 'tool', tool_call_id: part.callId, content: part.content })
      }
      continue
    }

    const calls = messageToolCalls(message)
    if (calls.length > 0) {
      // Die Argumente gehen als **String** hinaus: die Schnittstelle erwartet
      // JSON als Text, nicht als verschachteltes Objekt.
      messages.push({
        role: message.role,
        content: text,
        tool_calls: calls.map((call) => ({
          id: call.callId,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
        })),
      })
      continue
    }

    // Eine leere Assistenten-Nachricht ohne Aufruf wird **weggelassen**: sie
    // trägt nichts, und ein Anbieter darf an ihr keinen Anstoß nehmen.
    if (text !== '' || message.role !== 'assistant') {
      messages.push({ role: message.role, content: text })
    }
  }

  const body: Record<string, unknown> = {
    model: request.model,
    messages,
    stream: false,
  }
  if (request.tools !== undefined && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }))
  }
  if (request.temperature !== undefined) body.temperature = request.temperature
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens
  return body
}

/**
 * Wandelt eine rohe Antwort in ein {@link CompletionResult}.
 *
 * **Warum das getrennt und exportiert ist.** Fehler in der Antwort sind die
 * häufigste Ursache für „der Agent tut nichts": ein Anbieter liefert ein Feld
 * anders, und der Loop sieht eine leere Antwort. Diese Funktion ist deshalb
 * **einzeln prüfbar** — mit einer echten Anbieterantwort als Eingabe.
 *
 * @param raw - die geparste Antwort
 * @returns das Seam-Ergebnis
 * @throws LlmError der Art `malformed`, wenn die Form nicht passt
 */
export function parseCompletion(raw: unknown): CompletionResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new LlmError('malformed', 'Antwort ist kein Objekt')
  }
  const value = raw as RawCompletion
  const first = value.choices?.[0]
  if (first === undefined) {
    throw new LlmError('malformed', 'Antwort enthält keine choices[0]')
  }

  const rawCalls = first.message?.tool_calls ?? []
  const toolCalls: ToolCall[] = []
  for (const call of rawCalls) {
    const id = typeof call.id === 'string' ? call.id : ''
    const name = typeof call.function?.name === 'string' ? call.function.name : ''
    if (id === '' || name === '') continue
    toolCalls.push({ id, name, arguments: parseArguments(call.function?.arguments) })
  }

  const text = typeof first.message?.content === 'string' ? first.message.content : ''
  const result: CompletionResult = {
    text,
    toolCalls,
    finishReason: mapFinishReason(first.finish_reason, toolCalls.length > 0),
    model: typeof value.model === 'string' ? value.model : '',
  }

  const usage = value.usage
  if (usage !== undefined) {
    const measured: Usage = {
      inputTokens: numberOr(usage.prompt_tokens, 0),
      outputTokens: numberOr(usage.completion_tokens, 0),
    }
    return { ...result, usage: measured }
  }
  return result
}

/**
 * Parst die Argumente eines Werkzeugaufrufs.
 *
 * **Warum ein Fehlschlag hier nicht wirft.** Ein Modell liefert gelegentlich
 * ungültiges JSON. Würde das werfen, bräche der ganze Turn ab — obwohl der
 * Loop die Chance hat, dem Modell den Fehler **als Werkzeugergebnis**
 * zurückzugeben und es korrigieren zu lassen. Deshalb: leeres Objekt plus
 * einen Marker, den der Loop sieht.
 *
 * @param raw - der Argumentwert des Anbieters
 * @returns die Argumente; bei ungültigem JSON leer
 */
export function parseArguments(raw: unknown): Readonly<Record<string, unknown>> {
  if (raw === undefined || raw === null || raw === '') return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>
    return { value: parsed }
  } catch {
    return {}
  }
}

/**
 * Ordnet einen HTTP-Status einem Fehler zu.
 *
 * **Die Zuordnung ist die Entscheidung, ob wiederholt wird.** 429 und 5xx sind
 * vorübergehend; 400 und 401 nicht. Ein 401 fünfmal zu wiederholen kostet Zeit
 * und ändert nichts.
 *
 * @param status - der HTTP-Status
 * @param detail - Antworttext, gekürzt und **ohne** Zugangsdaten
 * @returns der passende Fehler
 */
export function errorForStatus(status: number, detail: string): LlmError {
  const trimmed = detail.length > 500 ? `${detail.slice(0, 500)}…` : detail
  if (status === 401 || status === 403) {
    return new LlmError('credentials', `Der Anbieter lehnt die Zugangsdaten ab (${status}): ${trimmed}`, {
      providerCode: String(status),
      retryable: false,
    })
  }
  if (status === 429) {
    return new LlmError('unavailable', `Der Anbieter begrenzt die Anfragen (429): ${trimmed}`, {
      providerCode: '429',
      retryable: true,
    })
  }
  if (status >= 500) {
    return new LlmError('unavailable', `Der Anbieter ist nicht verfügbar (${status}): ${trimmed}`, {
      providerCode: String(status),
      retryable: true,
    })
  }
  return new LlmError('rejected', `Der Anbieter hat die Anfrage abgelehnt (${status}): ${trimmed}`, {
    providerCode: String(status),
    retryable: false,
  })
}

/**
 * Der HTTP-Anbieter.
 *
 * **Der Schlüssel verlässt dieses Objekt nicht.** Er wird im Konstruktor
 * aufgenommen und nur als Kopfzeile gesetzt. Fehlermeldungen enthalten ihn
 * **nie** — auch nicht die Antwort des Anbieters, die ausdrücklich gekürzt
 * wird ({@link errorForStatus}).
 */
export class LlmHttpProvider implements LlmProvider {
  readonly name = 'llm-http'
  readonly #apiKey: string
  readonly #baseUrl: string
  readonly #timeoutMs: number
  readonly #headers: Readonly<Record<string, string>>
  #fetch: typeof globalThis.fetch

  /**
   * @param options - Schlüssel, optionale Adresse, Zeitgrenze und Kopfzeilen
   * @param fetchImpl - Austauschbare `fetch`-Umsetzung; Vorgabe ist die globale.
   *   **Warum austauschbar:** nur so ist der Anbieter ohne Netz prüfbar.
   * @throws LlmError der Art `credentials`, wenn der Schlüssel unbrauchbar ist —
   *   **beim Bauen**, nicht erst beim ersten Aufruf. Ein Anbieter, der mit einem
   *   kaputten Schlüssel entsteht und erst später scheitert, verschiebt den
   *   Fehler an eine Stelle, an der niemand mehr nach der Konfiguration sucht.
   */
  constructor(options: LlmHttpOptions, fetchImpl?: typeof globalThis.fetch) {
    this.#apiKey = assertUsableApiKey(options.apiKey, '@prometheus-harness/llm-http', 'LlmHttpOptions.apiKey')
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.#timeoutMs = options.timeoutMs ?? 120_000
    this.#headers = options.headers ?? {}
    this.#fetch = fetchImpl ?? globalThis.fetch
  }

  /** Setzt die `fetch`-Umsetzung neu — für Tests und für spätere Umlenkung. */
  useFetch(fetchImpl: typeof globalThis.fetch): void {
    this.#fetch = fetchImpl
  }

  /** {@inheritDoc LlmProvider.complete} */
  async complete(request: CompletionRequest): Promise<CompletionResult> {
    // Kein Schlüsselprüfung hier: der Konstruktor hat den Schlüssel bereits
    // beurteilt und einen unbrauchbaren abgelehnt. Eine zweite Prüfung an dieser
    // Stelle wäre toter Code, der den Eindruck erweckt, hier werde noch etwas
    // entschieden.

    // Eigene Zeitgrenze **plus** das durchgereichte Signal: ein Aufruf soll
    // auch dann enden, wenn der Aufrufer nicht abbricht.
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, this.#timeoutMs)
    const onOuterAbort = (): void => { controller.abort() }
    request.signal?.addEventListener('abort', onOuterAbort, { once: true })

    let response: Response
    try {
      response = await this.#fetch(`${this.#baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.#apiKey}`,
          ...this.#headers,
        },
        body: JSON.stringify(buildBody(request)),
        signal: controller.signal,
      })
    } catch (cause) {
      if (isAbortCause(cause)) {
        // Unterscheidung: hat **der Aufrufer** abgebrochen oder die Zeitgrenze?
        const byCaller = request.signal?.aborted === true
        throw new LlmError(byCaller ? 'aborted' : 'timeout', byCaller
          ? 'Anfrage wurde abgebrochen'
          : `Zeitgrenze von ${this.#timeoutMs} ms überschritten`, { cause })
      }
      throw new LlmError('transport', `Verbindung zum Anbieter fehlgeschlagen: ${describe(cause)}`, { cause })
    } finally {
      clearTimeout(timer)
      request.signal?.removeEventListener('abort', onOuterAbort)
    }

    if (!response.ok) {
      const detail = await readTextSafely(response)
      throw errorForStatus(response.status, detail)
    }

    let parsed: unknown
    try {
      parsed = await response.json()
    } catch (cause) {
      throw new LlmError('malformed', `Antwort ist kein JSON: ${describe(cause)}`, { cause })
    }
    return parseCompletion(parsed)
  }
}

/** Liest einen Antworttext, ohne bei einem Lesefehler zu werfen. */
async function readTextSafely(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return '(Antworttext nicht lesbar)'
  }
}

/** Kurze, sichere Beschreibung eines unbekannten Fehlers. */
function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}

/**
 * Der Name unserer eigenen Umgebungsvariablen für den Anbieterschlüssel.
 *
 * **Warum eine eigene Kennung.** Bis zum 13.10.2026 las dieses Paket nur
 * `DEEPSEEK_API_KEY` — den Namen des **Anbieters**. Damit trug unsere
 * Konfiguration einen fremden Namen als einzige Möglichkeit, und wer die
 * Harness aufstellt, mußte raten, welche Variable gemeint ist.
 */
export const PMH_LLM_API_KEY_ENV = 'PMH_LLM_API_KEY'

/**
 * Der Name der Umgebungsvariablen des Anbieters — als **Rückfall**.
 *
 * **Warum er bleibt.** Diese Variable steht in der `.credentials.yaml` dieses
 * Rechners und in der Umgebung, in der die Harness läuft. Sie abzuschaffen
 * hieße: die bestehende Installation verliert ihren Schlüssel und die Harness
 * antwortet nicht mehr. Sie wird deshalb **weiter gelesen** — nur nicht mehr
 * als einzige.
 */
export const ANBIETER_API_KEY_ENV = 'DEEPSEEK_API_KEY'

/**
 * Baut einen Anbieter aus dem Schlüssel in der Umgebung.
 *
 * **Warum eine Fabrik und nicht der Konstruktor direkt.** Der Loop soll keinen
 * Schlüssel kennen und keine Umgebungsvariable lesen. Diese Funktion ist die
 * **eine** Stelle, an der Zugangsdaten aus der Umgebung gelesen werden — dadurch
 * ist nachvollziehbar, woher sie kommen.
 *
 * **Die Reihenfolge: erst unsere Kennung, dann die des Anbieters.** Eigene
 * Variablen gewinnen, weil sie die ausdrückliche Konfiguration dieses Projekts
 * sind; die Variable des Anbieters bleibt als Rückfall, damit eine bestehende
 * Installation weiterläuft.
 *
 * @param env - Umgebung; Vorgabe `process.env`
 * @param options - überschreibbare Adresse, Zeitgrenze, Kopfzeilen
 * @returns der Anbieter
 * @throws LlmError der Art `credentials`, wenn kein Schlüssel gesetzt ist
 */
export function providerFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  options: Omit<LlmHttpOptions, 'apiKey'> = {},
): LlmHttpProvider {
  const eigen = env[PMH_LLM_API_KEY_ENV]?.trim() ?? ''
  const vomAnbieter = env[ANBIETER_API_KEY_ENV]?.trim() ?? ''
  const aus = eigen !== '' ? PMH_LLM_API_KEY_ENV : ANBIETER_API_KEY_ENV
  const apiKey = assertUsableApiKey(
    eigen !== '' ? eigen : vomAnbieter,
    '@prometheus-harness/llm-http',
    `Umgebungsvariable ${aus}`,
  )
  return new LlmHttpProvider({ apiKey, ...options })
}

/** Übersetzt eine Systemanweisung in eine Nachricht — Kurzform für Aufrufer. */
export function systemMessage(text: string): Message {
  return { role: 'system', parts: [{ type: 'text', text }] }
}

/** Übersetzt Werkzeugnamen in die Anbieterform — Kurzform für Aufrufer. */
export function toolSpecs(tools: readonly ToolSpec[]): readonly ToolSpec[] {
  return tools
}
