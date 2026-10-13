/**
 * `@prometheus-harness/token-meter` — die dritte Sprosse der kleinsten Kette.
 *
 * **Die Frage, die dieses Paket beantwortet.** Nicht „wie viele Token sind es?"
 * (das weiß nur der Anbieter), sondern **„wie viele Token waren es, und woher
 * weiß ich das?"** Der Unterschied ist der ganze Inhalt dieses Pakets.
 *
 * **Warum das getrennt ist.** Der Adapter meldet eine Zählung, wenn der Anbieter
 * eine liefert (`Usage` im {@link CompletionResult}); der Agent-Loop muss
 * wissen, wie voll sein Kontext ist, **bevor** er anfragt — und dann gibt es
 * keine Zählung, weil die Anfrage noch nicht gestellt wurde. Zwei Quellen,
 * zwei Genauigkeiten, ein Zähler.
 *
 * **Die Regel, die dieses Paket trägt:** eine Schätzung wird **nie** als
 * Messung ausgegeben. Jede Summe nennt ihren {@link UsageMethod}; eine Summe
 * aus beidem heißt `mixed`. Wer eine Zahl anzeigt, ohne die Herkunft zu nennen,
 * zeigt eine Zahl, der niemand trauen kann.
 *
 * **Was dieses Paket bewusst NICHT tut:** es kürzt keinen Kontext. Es sagt nur,
 * wie voll es ist. Die Entscheidung „jetzt zusammenfassen" gehört dem Loop bzw.
 * dem Compaction-Schritt — und die braucht eine belastbare Zahl, nicht dieses
 * Paket.
 *
 * **Was die Schätzung ist und was nicht.** Die Vorgabe
 * ({@link heuristicEstimator}) rechnet mit einer festen Zeichen-pro-Token-Annahme.
 * Das ist für Code, JSON und deutsche Texte **nachweislich ungenau** — siehe
 * {@link HEURISTIC_CHARS_PER_TOKEN}. Sie ist als **Notnagel** gedacht, nicht als
 * Messung: eine Grenze, die auf einer Schätzung beruht, muss Reserve haben.
 *
 * @module @prometheus-harness/token-meter
 */

import {
  messageText,
  type CompletionRequest,
  type CompletionResult,
  type Message,
  type ToolSpec,
  type Usage,
} from '@prometheus-harness/llm'

// ---------------------------------------------------------------------------
// Herkunft und Zählung
// ---------------------------------------------------------------------------

/** Woher eine Zahl stammt. */
export type UsageMethod =
  /** Vom Anbieter gemeldet — die belastbare Quelle. */
  | 'reported'
  /** Geschätzt — eine Rechnung, keine Messung. */
  | 'estimated'
  /** Teils gemeldet, teils geschätzt. */
  | 'mixed'

/** Eine Zählung mit Herkunft. */
export interface UsageRecord extends Usage {
  readonly method: UsageMethod
}

/**
 * Zählt Text in Token.
 *
 * **Warum eine Funktion und nicht eine Formel im Zähler.** Nur so ist die
 * Schätzung austauschbar: ein Modell mit eigenem Tokenizer (oder ein Test mit
 * einer festen Zahl) wird hier eingesetzt, und der Rest des Pakets bleibt
 * unverändert.
 */
export type TokenEstimator = (text: string) => number

/**
 * Zeichen je Token in der Vorgabe-Schätzung.
 *
 * **Diese Zahl ist eine Annahme, keine Messung.** Für englischen Fließtext
 * liegt der wahre Wert bei etwa 4; für Code, JSON und deutsche
 * Zusammensetzungen deutlich darunter (2 bis 3), weil Sonderzeichen und
 * Umlaute in mehrere Token zerfallen. Wer die Schätzung für eine harte Grenze
 * benutzt, muss deshalb Reserve einplanen — genau deshalb steht die Zahl hier
 * als benannte Konstante und nicht als `4` mitten in einer Rechnung.
 */
export const HEURISTIC_CHARS_PER_TOKEN = 3.5

/**
 * Zuschlag je Nachricht für Rollen- und Rahmenfelder.
 *
 * Jede Nachricht kostet beim Anbieter mehr als ihren Text: Rolle,
 * Trennzeichen, teils eine Kennung. Die Zahl ist ein Erfahrungswert, keine
 * Messung — sie steht hier, damit sie prüfbar und änderbar ist.
 */
export const HEURISTIC_TOKENS_PER_MESSAGE = 4

/** Zuschlag je Werkzeugbeschreibung für Namen und Hülle. */
export const HEURISTIC_TOKENS_PER_TOOL = 8

/**
 * Die Vorgabe-Schätzung: Zeichen geteilt durch {@link HEURISTIC_CHARS_PER_TOKEN},
 * aufgerundet.
 *
 * **Warum aufgerundet und nicht abgerundet.** Eine Schätzung, die zu niedrig
 * liegt, führt zu einer Anfrage, die der Anbieter ablehnt (`length`) — eine,
 * die zu hoch liegt, kostet etwas Kontext. Der Fehler in die sichere Richtung
 * ist der kleinere.
 *
 * @param text - der zu zählende Text
 * @returns die geschätzte Zahl der Token, mindestens 0
 */
export function heuristicEstimator(text: string): number {
  if (text === '') return 0
  return Math.ceil(text.length / HEURISTIC_CHARS_PER_TOKEN)
}

// ---------------------------------------------------------------------------
// Schätzen, was in einer Anfrage steckt
// ---------------------------------------------------------------------------

/**
 * Schätzt die Token einer Nachrichtenfolge.
 *
 * **Was gezählt wird.** Text jeder Nachricht, Werkzeugergebnisse (sie gehen als
 * eigener Text an den Anbieter), die Rollen- und Rahmenzuschläge sowie die
 * Werkzeugbeschreibungen. Die Beschreibungen werden **mitgezählt**, weil sie in
 * jeder Anfrage erneut mitgeschickt werden — sie sind der Posten, den man am
 * leichtesten vergisst und der bei zehn Werkzeugen mehrere hundert Token
 * ausmacht.
 *
 * **Was nicht gezählt wird.** Bilder, Anhänge und alles, was der Adapter
 * umsetzt, ohne dass hier Text ankommt. Solche Teile gibt es im Seam derzeit
 * nicht; kommt einer dazu, muss diese Funktion ihn kennen — sonst schweigt sie
 * ihn still weg, und eine Schätzung, die einen ganzen Posten nicht kennt, ist
 * schlimmer als keine.
 *
 * @param messages - die Nachrichten der Anfrage
 * @param tools - die Werkzeugbeschreibungen, falls welche mitgehen
 * @param estimator - die Zählfunktion; Vorgabe {@link heuristicEstimator}
 * @returns die geschätzte Zahl der Token
 */
export function estimateMessages(
  messages: readonly Message[],
  tools: readonly ToolSpec[] = [],
  estimator: TokenEstimator = heuristicEstimator,
): number {
  let total = 0
  for (const message of messages) {
    total += HEURISTIC_TOKENS_PER_MESSAGE
    const text = messageText(message)
    if (text !== '') total += estimator(text)
    for (const part of message.parts) {
      if (part.type === 'tool-result') total += estimator(part.content)
    }
  }
  for (const tool of tools) {
    total += HEURISTIC_TOKENS_PER_TOOL
    total += estimator(tool.name)
    total += estimator(tool.description)
    total += estimateJson(tool.parameters, estimator)
  }
  return total
}

/**
 * Schätzt die Token einer JSON-Struktur.
 *
 * **Warum über `JSON.stringify` und nicht über einen Durchlauf.** Die
 * Parameterbeschreibung eines Werkzeugs ist beliebig verschachtelt; ein
 * Durchlauf müsste jeden Fall kennen. Der Anbieter sieht genau die
 * serialisierte Form — also ist sie das richtige Maß. Bei einer Struktur, die
 * sich nicht serialisieren lässt (Zyklen), wird **nicht** geworfen: eine
 * Schätzung darf keinen Aufruf abbrechen.
 *
 * @param value - der zu schätzende Wert
 * @param estimator - die Zählfunktion
 * @returns die geschätzte Zahl der Token
 */
export function estimateJson(value: unknown, estimator: TokenEstimator = heuristicEstimator): number {
  if (value === undefined) return 0
  let text: string
  try {
    text = JSON.stringify(value) ?? ''
  } catch {
    return 0
  }
  return estimator(text)
}

/** Schätzt die Token einer ganzen Anfrage. */
export function estimateRequest(
  request: CompletionRequest,
  estimator: TokenEstimator = heuristicEstimator,
): number {
  return estimateMessages(request.messages, request.tools ?? [], estimator)
}

// ---------------------------------------------------------------------------
// Der Zähler
// ---------------------------------------------------------------------------

/**
 * Ein Zähler über mehrere Anfragen hinweg.
 *
 * **Warum ein Objekt und keine vier Zahlen.** Der Loop stellt mehrere Anfragen
 * je Turn (jede Werkzeugrunde ist eine). Ein Zähler, der die Summe führt, macht
 * aus „diese Anfrage war groß" ein „dieser Turn war teuer" — die Zahl, die
 * jemand tatsächlich wissen will.
 */
export interface TokenMeter {
  /**
   * Nimmt das Ergebnis einer Anfrage auf.
   *
   * Meldet der Anbieter eine Zählung, wird sie **übernommen**; fehlt sie, wird
   * geschätzt — aus der Anfrage, die der Zähler nicht kennt. Deshalb muss der
   * Aufrufer die Anfrage mitgeben, wenn er eine Schätzung will.
   *
   * @param result - die Antwort des Anbieters
   * @param request - die zugehörige Anfrage; ohne sie ist eine Schätzung unmöglich
   * @returns der aufgenommene Posten mit seiner Herkunft
   */
  record(result: CompletionResult, request?: CompletionRequest): UsageRecord
  /** Die Summe aller aufgenommenen Posten. */
  total(): UsageRecord
  /** Wie viele Anfragen aufgenommen wurden. */
  count(): number
  /** Ob die Summe **irgendwo** auf einer Schätzung beruht. */
  hasEstimates(): boolean
  /** Setzt den Zähler zurück. */
  reset(): void
}

/** Einstellungen des Zählers. */
export interface MeterOptions {
  /** Die Zählfunktion für Schätzungen; Vorgabe {@link heuristicEstimator}. */
  readonly estimator?: TokenEstimator
  /**
   * Obergrenze der Eingabe-Token.
   *
   * **Was der Zähler damit tut — und was nicht.** Er **verbietet nichts**. Er
   * zählt weiter und meldet, ob die Grenze überschritten ist
   * ({@link MeterState.overBudget}). Eine Grenze, die stillschweigend das
   * Verhalten ändert, ist die gefährlichere Bauform: niemand sieht, wann sie
   * greift. Der Loop entscheidet, was bei `overBudget` geschieht.
   */
  readonly budgetInputTokens?: number
  /**
   * Anteil, ab dem gewarnt wird (0 bis 1), Vorgabe 0,8.
   *
   * **Warum eine Warnschwelle und nicht nur die Grenze.** Wer erst bei 100 %
   * zusammenfasst, hat keinen Spielraum für die nächste Antwort. Ab 80 % lässt
   * sich noch in Ruhe verdichten.
   */
  readonly warnAt?: number
}

/** Der Stand eines Zählers nach außen. */
export interface MeterState {
  /** Summe der Eingabe-Token. */
  readonly inputTokens: number
  /** Summe der Ausgabe-Token. */
  readonly outputTokens: number
  /** Herkunft der Summe. */
  readonly method: UsageMethod
  /** Zahl der aufgenommenen Anfragen. */
  readonly requests: number
  /** Ob überhaupt etwas aufgenommen wurde. */
  readonly empty: boolean
  /** Die gesetzte Grenze, falls eine gesetzt ist. */
  readonly budgetInputTokens: number | undefined
  /** Ob die Eingabe-Grenze überschritten ist. */
  readonly overBudget: boolean
  /** Ob die Warnschwelle erreicht ist, aber die Grenze noch nicht. */
  readonly nearBudget: boolean
}

/**
 * Ein Zähler über mehrere Anfragen.
 *
 * **Warum die Herkunft mitgeführt wird und nicht nur die Zahl.** Eine Summe aus
 * gemeldeten und geschätzten Posten ist keine Messung. Wer sie als Messung
 * ausgibt, behauptet etwas, das er nicht weiß. Diese Klasse führt deshalb
 * `method` mit und liefert `mixed`, sobald beide Quellen vorkommen.
 */
export class RecordingTokenMeter implements TokenMeter {
  readonly #estimator: TokenEstimator
  readonly #budget: number | undefined
  readonly #warnAt: number
  #inputTokens = 0
  #outputTokens = 0
  #requests = 0
  #reported = 0
  #estimated = 0

  constructor(options: MeterOptions = {}) {
    this.#estimator = options.estimator ?? heuristicEstimator
    this.#budget = options.budgetInputTokens
    const warnAt = options.warnAt ?? 0.8
    if (!Number.isFinite(warnAt) || warnAt <= 0 || warnAt > 1) {
      throw new RangeError(`warnAt muss eine Zahl > 0 und ≤ 1 sein, ist ${String(warnAt)}`)
    }
    if (this.#budget !== undefined && (!Number.isFinite(this.#budget) || this.#budget < 0)) {
      throw new RangeError(`budgetInputTokens muss eine endliche Zahl ≥ 0 sein, ist ${String(this.#budget)}`)
    }
    this.#warnAt = warnAt
  }

  /** {@inheritDoc TokenMeter.record} */
  record(result: CompletionResult, request?: CompletionRequest): UsageRecord {
    this.#requests += 1

    const usage = result.usage
    if (isUsableUsage(usage)) {
      this.#inputTokens += usage.inputTokens
      this.#outputTokens += usage.outputTokens
      this.#reported += 1
      return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, method: 'reported' }
    }

    // Ohne Meldung wird geschätzt. Die Eingabe kommt aus der Anfrage; die
    // Ausgabe aus Text **und** Werkzeugaufrufen — Argumente sind auch Token,
    // und bei einem Werkzeug-lastigen Turn sind sie der größere Posten.
    const inputTokens = request === undefined ? 0 : estimateRequest(request, this.#estimator)
    const outputTokens =
      this.#estimator(result.text) + estimateToolCalls(result, this.#estimator)

    this.#inputTokens += inputTokens
    this.#outputTokens += outputTokens
    this.#estimated += 1
    return { inputTokens, outputTokens, method: 'estimated' }
  }

  /** {@inheritDoc TokenMeter.total} */
  total(): UsageRecord {
    return {
      inputTokens: this.#inputTokens,
      outputTokens: this.#outputTokens,
      method: methodOf(this.#reported, this.#estimated),
    }
  }

  /** {@inheritDoc TokenMeter.count} */
  count(): number {
    return this.#requests
  }

  /** {@inheritDoc TokenMeter.hasEstimates} */
  hasEstimates(): boolean {
    return this.#estimated > 0
  }

  /** {@inheritDoc TokenMeter.reset} */
  reset(): void {
    this.#inputTokens = 0
    this.#outputTokens = 0
    this.#requests = 0
    this.#reported = 0
    this.#estimated = 0
  }

  /** Der vollständige Stand — für Anzeige und Entscheidung. */
  state(): MeterState {
    const overBudget = this.#budget !== undefined && this.#inputTokens > this.#budget
    const nearBudget =
      this.#budget !== undefined &&
      !overBudget &&
      this.#inputTokens >= this.#budget * this.#warnAt
    return {
      inputTokens: this.#inputTokens,
      outputTokens: this.#outputTokens,
      method: methodOf(this.#reported, this.#estimated),
      requests: this.#requests,
      empty: this.#requests === 0,
      budgetInputTokens: this.#budget,
      overBudget,
      nearBudget,
    }
  }
}

/**
 * Bestimmt die Herkunft einer Summe aus den Zählern beider Quellen.
 *
 * @param reported - Zahl der gemeldeten Posten
 * @param estimated - Zahl der geschätzten Posten
 * @returns die Herkunft der Summe
 */
export function methodOf(reported: number, estimated: number): UsageMethod {
  if (reported > 0 && estimated > 0) return 'mixed'
  if (reported > 0) return 'reported'
  // Der Fall „nichts aufgenommen" wird als Schätzung geführt: eine Summe ohne
  // Quelle ist keine Messung. `state().empty` sagt, dass sie leer ist.
  return 'estimated'
}

/**
 * Prüft, ob eine gemeldete Zählung brauchbar ist.
 *
 * **Warum eine Prüfung und nicht `usage !== undefined`.** Ein Anbieter kann
 * `usage: {}` oder `usage: {prompt_tokens: null}` liefern. Ungeprüft würde
 * daraus `NaN` in der Summe — und `NaN` in einer Summe ist der Fehler, der am
 * längsten unentdeckt bleibt, weil jede Anzeige weiterhin „etwas" zeigt.
 *
 * @param usage - der gemeldete Wert, falls vorhanden
 * @returns `true`, wenn beide Zahlen endlich und ≥ 0 sind
 */
export function isUsableUsage(usage: Usage | undefined): usage is Usage {
  if (usage === undefined) return false
  const input: number = usage.inputTokens
  const output: number = usage.outputTokens
  return Number.isFinite(input) && input >= 0 && Number.isFinite(output) && output >= 0
}

/** Schätzt die Token der Werkzeugaufrufe einer Antwort. */
function estimateToolCalls(result: CompletionResult, estimator: TokenEstimator): number {
  let total = 0
  for (const call of result.toolCalls) {
    total += estimator(call.name)
    total += estimateJson(call.arguments, estimator)
  }
  return total
}

/**
 * Baut einen Zähler.
 *
 * @param options - Zählfunktion, Grenze, Warnschwelle
 * @returns der Zähler
 */
export function createTokenMeter(options: MeterOptions = {}): RecordingTokenMeter {
  return new RecordingTokenMeter(options)
}

/**
 * Formatiert den Stand als **eine** Zeile — mit Herkunft.
 *
 * **Warum die Herkunft in der Zeile steht und nicht in einem zweiten Feld.**
 * Diese Zeile landet in Protokollen und Berichten. Eine Zahl ohne „geschätzt"
 * wird dort zur Messung, sobald niemand mehr weiß, woher sie kam.
 *
 * @param state - der Stand
 * @returns eine Zeile, z. B. `1 234 ein / 567 aus (gemeldet) · 3 Anfragen`
 */
export function describeMeterState(state: MeterState): string {
  const origin =
    state.method === 'reported' ? 'gemeldet' : state.method === 'estimated' ? 'geschätzt' : 'gemischt'
  const requests = state.requests === 1 ? '1 Anfrage' : `${state.requests} Anfragen`
  const budget =
    state.budgetInputTokens === undefined
      ? ''
      : state.overBudget
        ? ` · GRENZE ÜBERSCHRITTEN (${state.budgetInputTokens})`
        : state.nearBudget
          ? ` · nahe der Grenze (${state.budgetInputTokens})`
          : ` · Grenze ${state.budgetInputTokens}`
  return `${state.inputTokens} ein / ${state.outputTokens} aus (${origin}) · ${requests}${budget}`
}
