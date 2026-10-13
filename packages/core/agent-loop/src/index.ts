/**
 * `@prometheus-harness/agent-loop` — die vierte Sprosse der kleinsten Kette.
 *
 * **Was der Loop ist.** Die Zustandsmaschine, die aus einer Benutzeranfrage
 * eine Antwort macht: Modell fragen → Werkzeuge ausführen → Modell erneut
 * fragen → … bis das Modell nichts mehr verlangt. Ein **Turn** ist ein solcher
 * Durchlauf, ein **Step** ist eine Modellanfrage samt der Werkzeuge, die sie
 * angefordert hat.
 *
 * **Die vier Regeln, die diesen Loop tragen:**
 *
 * | Regel | Warum sie da ist |
 * |---|---|
 * | **Jeder Turn endet mit einem benannten Grund** | ein Loop ohne Ende ist der teuerste Fehler, den ein Agent haben kann: er kostet Geld, Zeit und Vertrauen. Deshalb gibt es **immer** ein `TurnEndReason` — auch beim Abbruch und beim Fehler |
 * | **Der Verlauf ist nach jedem Step vollständig** | die Assistenten-Nachricht mit ihren Werkzeugaufrufen wird festgehalten, **bevor** die Ergebnisse kommen ({@link ToolCallPart}). Sonst ist der nächste Aufruf beim Anbieter nicht zuordenbar |
 * | **Ein Werkzeugfehler beendet keinen Turn** | er wird zum Werkzeugergebnis, das Modell kann sich korrigieren. Nur ein Abbruch beendet |
 * | **`maxSteps` ist eine harte Obergrenze** | sie ist keine Empfehlung an das Modell, sondern die Zusicherung, dass der Loop terminiert |
 *
 * **Was der Loop bewusst NICHT tut:** er kennt keinen Anbieter (nur
 * {@link LlmProvider}), er persistiert nichts (das ist `session` — er meldet
 * jedes Ereignis und gibt den ganzen Verlauf zurück), er zeigt nichts an (er
 * meldet Ereignisse), er kürzt keinen Kontext (er **zählt** ihn, über
 * `token-meter`, und meldet den Stand), und er wiederholt nichts (das ist
 * `llm-retry`, als Anbieter eingehängt).
 *
 * **Die Reihenfolge, in der die Sprossen zusammengesteckt werden:**
 *
 * ```ts
 * const provider = new RetryProvider({ inner: new LlmHttpProvider({ apiKey }) })
 * const loop = new AgentLoop({ provider, tools, model: 'deepseek-chat' })
 * for await (const event of loop.run('Bitte lies a.txt')) { … }
 * ```
 *
 * @module @prometheus-harness/agent-loop
 */

import { executeToolCall, toolSpecs, type ToolRegistry } from '@prometheus-harness/agent-tools'
import {
  LlmError,
  assistantMessage,
  assertUsableHistory,
  messageText,
  textMessage,
  toolResultMessage,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
  type Message,
  type ToolResultPart,
} from '@prometheus-harness/llm'
import {
  RecordingTokenMeter,
  describeMeterState,
  type MeterOptions,
  type MeterState,
} from '@prometheus-harness/token-meter'

// ---------------------------------------------------------------------------
// Ergebnisse und Ereignisse
// ---------------------------------------------------------------------------

/**
 * Warum ein Turn geendet hat.
 *
 * **Jeder Wert ist ein eigener Fall, weil jeder eine andere Reaktion verlangt:**
 * `stop` heißt fertig, `max-steps` heißt „das Modell drehte sich im Kreis" (ein
 * Befund über den Prompt oder die Werkzeuge, kein Normalzustand), `aborted`
 * heißt „der Benutzer wollte nicht mehr", `error` heißt „es ist etwas
 * gescheitert" (und der Fehler steht daneben), `empty-reply` heißt „das Modell
 * hat nichts gesagt" (ein Befund über das Modell).
 */
export type TurnEndReason = 'stop' | 'max-steps' | 'aborted' | 'error' | 'empty-reply'

/** Die Art eines Ereignisses aus {@link AgentLoop.run}. */
export type AgentEventType =
  | 'turn-start'
  | 'step-start'
  | 'model-reply'
  | 'tool-result'
  | 'usage'
  | 'turn-end'

/** Ein Teil einer Assistenten-Antwort, wie das Modell sie geliefert hat. */
export interface ModelReplyEvent {
  readonly type: 'model-reply'
  /** Nummer des Turns innerhalb des Loops, ab 1. */
  readonly turn: number
  readonly step: number
  readonly text: string
  /** Die Namen der verlangten Werkzeuge, in Reihenfolge. */
  readonly toolNames: readonly string[]
  readonly finishReason: CompletionResult['finishReason']
  /** Ob der Anbieter eine eigene Zählung gemeldet hat. */
  readonly reportedUsage: boolean
}

/** Das Ereignis eines ausgeführten Werkzeugs. */
export interface ToolResultEvent {
  readonly type: 'tool-result'
  readonly turn: number
  readonly step: number
  readonly callId: string
  readonly name: string
  /** Der Ergebnistext, wie er an das Modell geht. */
  readonly content: string
  /** Ob das Ergebnis ein Fehler ist (unbekanntes Werkzeug oder Wurf). */
  readonly failed: boolean
  /** Laufzeit des Werkzeugs in Millisekunden, gemessen. */
  readonly durationMs: number
}

/** Ein Ereignis des Loops. */
export type AgentEvent =
  /**
   * Die Eingabe des Benutzers.
   *
   * **Warum das ein eigenes Ereignis ist und nicht nur ein Feld von
   * `turn-start`.** Der Verlauf besteht aus Benutzer- und Assistenten-Nachrichten.
   * Ohne dieses Ereignis hätte die Persistenz **keine** Benutzernachricht — und
   * eine wieder aufgenommene Sitzung begänne mit einer Assistenten-Antwort auf
   * eine Frage, die niemand mehr sieht. Gemessen am 13.10.2026: der durchgehende
   * Test der kleinsten Kette faltete nach dem ersten Turn genau **eine**
   * Nachricht aus der Datei statt zwei.
   */
  /**
   * Die Systemanweisung des Loops — **einmal**, vor dem ersten Turn.
   *
   * Ein Ereignis und kein Feld von `turn-start`: die Anweisung gilt für die
   * ganze Sitzung, nicht für einen Turn. Wird sie in jedem Turn gemeldet, steht
   * sie in der Datei mehrfach — und bei einer Wiederaufnahme müsste geraten
   * werden, welche gilt.
   */
  | { readonly type: 'system-prompt'; readonly text: string }
  | { readonly type: 'user-input'; readonly turn: number; readonly text: string }
  | {
      readonly type: 'turn-start'
      readonly turn: number
      readonly userText: string
      readonly maxSteps: number
    }
  | { readonly type: 'step-start'; readonly turn: number; readonly step: number }
  | ModelReplyEvent
  | ToolResultEvent
  | { readonly type: 'usage'; readonly turn: number; readonly state: MeterState; readonly line: string }
  | {
      readonly type: 'turn-end'
      readonly turn: number
      readonly reason: TurnEndReason
      readonly steps: number
      readonly text: string
      /** Nur bei `reason: 'error'` gesetzt. */
      readonly error?: LlmError
    }

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

/** Einstellungen des Loops. */
export interface AgentLoopOptions {
  /** Der Anbieter. Hier wird `llm-retry` eingehängt, nicht im Loop. */
  readonly provider: LlmProvider
  /** Die Werkzeuge. Leer heißt: das Modell kann nur antworten, nicht handeln. */
  readonly tools?: ToolRegistry
  /** Modellkennung für jede Anfrage. */
  readonly model: string
  /**
   * Kennung der Sitzung, zu der dieser Loop gehört.
   *
   * **Wofür sie gebraucht wird.** Die Persistenz schreibt die Kennung in jede
   * Zeile. Ein Loop, der sie nicht kennt, könnte eine Sitzung nicht bedienen —
   * und zwei Läufe ließen sich nachträglich nicht auseinanderhalten.
   */
  readonly sessionId?: string
  /**
   * Nummer des ersten Turns. Vorgabe 1.
   *
   * **Warum eine Sitzung damit fortsetzbar ist.** Wird eine Sitzung mit fünf
   * Turns wieder aufgenommen, muss der nächste Turn die Nummer **6** tragen.
   * Ohne diese Angabe begänne die Zählung wieder bei 1 — der Verlauf hätte dann
   * zwei Turns mit derselben Nummer.
   */
  readonly firstTurn?: number
  /**
   * Harte Obergrenze der Steps **je Turn**. Vorgabe 25.
   *
   * Bei Erreichen wird der Turn mit `max-steps` beendet — **nicht** still
   * verlängert. Ein Loop, der sich selbst verlängert, ist kein Loop mehr,
   * sondern eine offene Rechnung.
   */
  readonly maxSteps?: number
  readonly temperature?: number
  readonly maxTokens?: number
  /**
   * Zähler-Einstellungen, insbesondere `budgetInputTokens`.
   *
   * Der Zähler **verbietet nichts**: er meldet `overBudget` im
   * `usage`-Ereignis. Was daraus folgt (verdichten, abbrechen, weiterlaufen),
   * entscheidet der Aufrufer — nicht der Loop im Stillen.
   */
  readonly meter?: MeterOptions
  /** Systemanweisung; wird als erste Nachricht jedes Laufs eingesetzt. */
  readonly system?: string
}

/** Was ein Turn geliefert hat. */
export interface TurnResult {
  readonly reason: TurnEndReason
  /** Alle Nachrichten, die in diesem Turn hinzugekommen sind (ohne Systemanweisung). */
  readonly messages: readonly Message[]
  /** Die letzte Textantwort des Modells — `''`, wenn es keine gab. */
  readonly text: string
  /** Zahl der Steps in diesem Turn. */
  readonly steps: number
  /** Der Fehler, falls `reason: 'error'`. */
  readonly error: LlmError | undefined
  /** Stand des Zählers nach dem Turn. */
  readonly usage: MeterState
}

// ---------------------------------------------------------------------------
// Der Loop
// ---------------------------------------------------------------------------

/**
 * Die Turn-/Step-Zustandsmaschine.
 *
 * **Der Verlauf lebt im Loop und wächst über Turns hinweg.** Ein Turn fügt
 * Nachrichten hinzu, ohne die früheren zu verändern — dieselbe Zusage, die die
 * Persistenz braucht: was geschrieben wurde, bleibt gültig.
 */
export class AgentLoop {
  readonly #provider: LlmProvider
  readonly #tools: ToolRegistry
  readonly #model: string
  readonly #maxSteps: number
  readonly #temperature: number | undefined
  readonly #maxTokens: number | undefined
  readonly #system: string | undefined
  readonly #meter: RecordingTokenMeter
  readonly #history: Message[] = []
  readonly #sessionId: string | undefined
  /**
   * Die Ereignisse des **laufenden** Turns.
   *
   * **Warum der Loop sie mitschreibt.** Das Ergebnis eines Turns
   * ({@link TurnResult}) trägt nur die letzten Nachrichten. Für eine
   * Wiederaufnahme braucht die Persistenz aber die **ganze** Ereignisfolge —
   * und die kennt nur der Loop. Ohne diesen Puffer müsste der Aufrufer die
   * Ereignisse selbst sammeln, und zwei Sammler können auseinanderlaufen.
   */
  readonly #events: AgentEvent[] = []
  #turn: number
  #started = false

  /**
   * @param options - Anbieter, Werkzeuge, Modell und Grenzen
   * @throws RangeError bei `maxSteps` unter 1
   */
  constructor(options: AgentLoopOptions) {
    const maxSteps = options.maxSteps ?? 25
    if (!Number.isInteger(maxSteps) || maxSteps < 1) {
      throw new RangeError(`maxSteps muss eine ganze Zahl ≥ 1 sein, ist ${String(maxSteps)}`)
    }
    const firstTurn = options.firstTurn ?? 1
    if (!Number.isInteger(firstTurn) || firstTurn < 1) {
      throw new RangeError(`firstTurn muss eine ganze Zahl ≥ 1 sein, ist ${String(firstTurn)}`)
    }
    this.#provider = options.provider
    this.#tools = options.tools ?? { list: () => [], get: () => undefined, size: 0 }
    this.#model = options.model
    this.#maxSteps = maxSteps
    this.#temperature = options.temperature
    this.#maxTokens = options.maxTokens
    this.#system = options.system
    this.#meter = new RecordingTokenMeter(options.meter ?? {})
    this.#sessionId = options.sessionId
    this.#turn = firstTurn - 1
  }

  /** Die Kennung der Sitzung, falls eine gesetzt ist. */
  get sessionId(): string | undefined {
    return this.#sessionId
  }

  /** Die Nummer des zuletzt gelaufenen Turns; `0`, solange keiner lief. */
  get turnNumber(): number {
    return this.#turn
  }

  /** Der Verlauf, wie er an den Anbieter gehen würde. Eine **Kopie**, nicht das Original. */
  history(): Message[] {
    return [...this.#history]
  }

  /** Der Stand des Zählers. */
  usage(): MeterState {
    return this.#meter.state()
  }

  /**
   * Die Ereignisse des zuletzt gelaufenen Turns, in Reihenfolge.
   *
   * Eine **Kopie**: wer sie verändert, verändert nicht den Loop.
   */
  events(): AgentEvent[] {
    return [...this.#events]
  }

  /** Setzt Verlauf und Zähler zurück. Die Turn-Nummer bleibt, wo sie ist. */
  reset(): void {
    this.#history.length = 0
    this.#events.length = 0
    this.#started = false
    this.#meter.reset()
  }

  /**
   * Nimmt einen bereits vorhandenen Verlauf auf — für die Wiederaufnahme.
   *
   * **Warum fail-closed.** Ein Verlauf aus der Persistenz kann beschädigt sein.
   * Wenn ein Werkzeugergebnis auf einen Aufruf zeigt, den der Verlauf nicht
   * kennt, scheitert der **nächste** Anbieteraufruf mit `400` — und dann sucht
   * jemand an der falschen Stelle. Deshalb wird hier geprüft und **geworfen**,
   * mit dem Befund im Text.
   *
   * @param messages - der aufzunehmende Verlauf
   * @throws LlmError der Art `malformed`, wenn der Verlauf nicht zuordenbar ist
   */
  loadHistory(messages: readonly Message[]): void {
    assertUsableHistory(messages)
    this.#history.length = 0
    this.#history.push(...messages)
    this.#started = true
  }

  /**
   * Führt einen Turn aus und meldet jedes Ereignis.
   *
   * **Warum ein Strom und kein Rückgabewert.** Ein Turn kann Minuten dauern und
   * viele Schritte haben. Wer erst am Ende alles erfährt, kann nichts anzeigen
   * und nicht eingreifen. Der Strom ist die einzige Form, in der ein Aufrufer
   * **während** des Turns etwas weiß — und die Persistenz kann jeden Schritt
   * sofort mitschreiben, statt am Ende einen Block zu schreiben, der bei einem
   * Absturz verloren wäre.
   *
   * **Was nach dem Strom übrig bleibt:** {@link result} liefert das Ergebnis des
   * letzten Turns, {@link history} den ganzen Verlauf.
   *
   * @param userText - die Eingabe des Benutzers
   * @param signal - Abbruchsignal; ein Abbruch beendet den Turn mit `aborted`
   * @returns die Ereignisse des Turns, in Reihenfolge
   */
  async *run(userText: string, signal?: AbortSignal): AsyncGenerator<AgentEvent, TurnResult> {
    const first = this.#prepare(userText)
    this.#turn += 1
    this.#events.length = 0
    const turn = this.#turn

    for (const event of this.#record([
      ...(first ? [{ type: 'system-prompt' as const, text: this.#system ?? '' }] : []),
      { type: 'user-input' as const, turn, text: userText },
      { type: 'turn-start' as const, userText, maxSteps: this.#maxSteps, turn },
    ])) {
      yield event
    }

    const steps = this.#maxSteps
    let step = 0
    let lastText = ''

    for (;;) {
      if (abortedNow(signal)) {
        for (const event of this.#record([usageEvent(this.#meter, turn)])) yield event
        return yield* this.#finish('aborted', step, lastText)
      }
      if (step >= steps) {
        for (const event of this.#record([usageEvent(this.#meter, turn)])) yield event
        return yield* this.#finish('max-steps', step, lastText)
      }

      step += 1
      for (const event of this.#record([{ type: 'step-start', step, turn }])) yield event

      // Die Anfrage entsteht **frisch** aus dem Verlauf: eine wiederholte
      // Anfrage (`llm-retry`) ist damit identisch, und die Werkzeugliste bleibt
      // in Registry-Reihenfolge stabil.
      const request = this.#buildRequest(signal)

      let result: CompletionResult
      try {
        assertUsableHistory(request.messages)
        result = await this.#provider.complete(request)
      } catch (cause) {
        const error = cause instanceof LlmError ? cause : asLlmError(cause)
        for (const event of this.#record([usageEvent(this.#meter, turn)])) yield event
        return yield* this.#finish('error', step, lastText, error)
      }

      // Erst zählen, dann melden: die Zahl im Ereignis gehört zu dieser Antwort.
      this.#meter.record(result, request)
      lastText = result.text

      for (const event of this.#record([
        {
          type: 'model-reply',
          step,
          turn,
          text: result.text,
          toolNames: result.toolCalls.map((call) => call.name),
          finishReason: result.finishReason,
          reportedUsage: result.usage !== undefined,
        },
      ])) {
        yield event
      }

      // Die Assistenten-Nachricht wird **vor** den Ergebnissen festgehalten:
      // sie trägt die Aufrufe, auf die sich die Ergebnisse beziehen.
      const assistant = assistantMessage(result)
      if (assistant.parts.length > 0) this.#history.push(assistant)

      if (result.toolCalls.length === 0) {
        for (const event of this.#record([usageEvent(this.#meter, turn)])) yield event
        const reason = result.text === '' ? 'empty-reply' : 'stop'
        return yield* this.#finish(reason, step, lastText)
      }

      const results = await this.#executeAll(result, step, signal, turn)
      for (const event of this.#record(results.events)) yield event
      this.#history.push(toolResultMessage(results.parts))

      for (const event of this.#record([usageEvent(this.#meter, turn)])) yield event

      if (abortedNow(signal)) {
        return yield* this.#finish('aborted', step, lastText)
      }
    }
  }

  /**
   * Schreibt Ereignisse in den Puffer des Turns und gibt sie zum Weiterreichen
   * zurück.
   *
   * **Warum der Puffer nicht die einzige Quelle ist.** Die Ereignisse gehen
   * sowohl an den Strom ({@link run}) als auch in den Puffer
   * ({@link AgentLoop.events}). Zwei Wege, die getrennt gefüllt würden, können
   * auseinanderlaufen — dann schreibt die Persistenz etwas anderes, als der
   * Aufrufer gesehen hat. Ein Weg, zwei Verwendungen.
   *
   * @param events - die Ereignisse
   * @returns dieselben Ereignisse
   */
  #record<E extends AgentEvent>(events: readonly E[]): readonly E[] {
    this.#events.push(...events)
    return events
  }

  /**
   * Führt **alle** Werkzeuge eines Steps aus — notfalls mit Platzhaltern.
   *
   * **Die Zusage, die diese Funktion gibt:** zu **jedem** Aufruf gibt es genau
   * ein Ergebnis, auch wenn der Aufruf mittendrin abgebrochen wird. Ein
   * fehlendes Ergebnis wäre ein Verlauf, den der Anbieter ablehnt — und der
   * Abbruch ist genau der Moment, in dem niemand mehr hinsieht. Deshalb werden
   * die Aufrufe ab der Abbruchstelle mit einem benannten Ergebnis aufgefüllt,
   * statt weggelassen.
   */
  async #executeAll(
    result: CompletionResult,
    step: number,
    signal: AbortSignal | undefined,
    turn: number,
  ): Promise<{ readonly parts: readonly ToolResultPart[]; readonly events: readonly ToolResultEvent[] }> {
    const parts: ToolResultPart[] = []
    const events: ToolResultEvent[] = []
    let aborted = false

    for (const call of result.toolCalls) {
      if (aborted) {
        parts.push({
          type: 'tool-result',
          callId: call.id,
          content: 'Nicht ausgeführt: der Turn wurde abgebrochen',
        })
        continue
      }
      const started = performance.now()
      const part = await executeToolCall(this.#tools, call, { signal, step })
      const durationMs = Math.round((performance.now() - started) * 1000) / 1000
      parts.push(part)
      events.push({
        type: 'tool-result',
        turn,
        step,
        callId: call.id,
        name: call.name,
        content: part.content,
        failed: isFailureText(part.content, call.name),
        durationMs,
      })
      if (abortedNow(signal)) aborted = true
    }

    return { parts, events }
  }

  /** Baut die Anfrage aus dem aktuellen Verlauf. */
  #buildRequest(signal: AbortSignal | undefined): CompletionRequest {
    const tools = toolSpecs(this.#tools)
    return {
      model: this.#model,
      messages: [...this.#history],
      ...(tools.length > 0 ? { tools } : {}),
      ...(this.#temperature === undefined ? {} : { temperature: this.#temperature }),
      ...(this.#maxTokens === undefined ? {} : { maxTokens: this.#maxTokens }),
      ...(signal === undefined ? {} : { signal }),
    }
  }

  /**
   * Legt die Systemanweisung an den Anfang — **einmal je Loop**, nicht je Turn.
   *
   * **Warum das geprüft wird.** Eine zweite Systemanweisung würde bei jedem Turn
   * eine weitere Nachricht an den Anfang setzen; der Verlauf wüchse mit jeder
   * Runde um eine Kopie. Und ein leerer Text wird gar nicht erst eingesetzt.
   *
   * @param userText - die Eingabe des Benutzers, die immer angehängt wird
   * @returns `true`, wenn **in diesem Aufruf** eine Systemanweisung gesetzt
   *   wurde — der Aufrufer meldet sie dann als Ereignis, damit sie in der
   *   Sitzung steht und bei einer Wiederaufnahme nicht fehlt
   */
  #prepare(userText: string): boolean {
    let introduced = false
    if (!this.#started && this.#system !== undefined && this.#system !== '') {
      this.#history.push(textMessage('system', this.#system))
      introduced = true
    }
    this.#started = true
    this.#history.push(textMessage('user', userText))
    return introduced
  }

  /**
   * Schließt den Turn ab: meldet das Ende **und** gibt das Ergebnis zurück.
   *
   * **Warum das ein Generator ist.** Ein Ereignis muss aus dem Strom kommen —
   * ein Aufrufer, der nur den Strom liest, würde das Ende sonst verpassen. Und
   * das Ergebnis muss **zurück**kommen, weil `return` den Wert des Generators
   * trägt. Eine Funktion, die beides tut, ist der kürzeste Weg, beides
   * einzuhalten.
   */
  *#finish(
    reason: TurnEndReason,
    steps: number,
    text: string,
    error?: LlmError,
  ): Generator<AgentEvent, TurnResult> {
    const end: AgentEvent = {
      type: 'turn-end',
      turn: this.#turn,
      reason,
      steps,
      text,
      ...(error === undefined ? {} : { error }),
    }
    this.#events.push(end)
    yield end
    return {
      reason,
      messages: [...this.#history],
      text,
      steps,
      error,
      usage: this.#meter.state(),
    }
  }
}

/**
 * Erkennt, ob ein Ergebnistext einen Werkzeugfehler bezeichnet.
 *
 * **Warum über den Text und nicht über einen Rückgabewert.** Der Vertrag eines
 * Werkzeugs ist „ein Text geht an das Modell" — absichtlich einfach, damit ein
 * Werkzeug nichts über den Loop wissen muss. Diese Prüfung ist deshalb eine
 * **Auswertung für die Anzeige**, keine Steuerung: der Loop behandelt jedes
 * Ergebnis gleich. Die Formen sind die, die `agent-tools` erzeugt.
 *
 * @param content - der Ergebnistext
 * @param name - der Name des Werkzeugs
 * @returns `true`, wenn der Text einen Fehler bezeichnet
 */
export function isFailureText(content: string, name: string): boolean {
  return (
    content.startsWith(`Unbekanntes Werkzeug`) ||
    content.startsWith(`Werkzeug "${name}" ist gescheitert`) ||
    content.startsWith(`Werkzeug "${name}" wurde`) ||
    content.startsWith('Nicht ausgeführt')
  )
}

/** Baut das `usage`-Ereignis aus dem Zähler. */
function usageEvent(meter: RecordingTokenMeter, turn: number): AgentEvent {
  const state = meter.state()
  return { type: 'usage', turn, state, line: describeMeterState(state) }
}

/**
 * Liest den Abbruchzustand eines Signals.
 *
 * **Warum das eine Funktion ist.** Ein direkter Zugriff auf `signal.aborted`
 * wird vom Typechecker über den umgebenden Ablauf verengt: hinter einem `await`
 * auf ein Werkzeug leitet er ab, ein Abbruch sei dort unmöglich. Diese
 * Ableitung ist eine Annahme über **fremden** Code — das Werkzeug kann das
 * Signal selbst auslösen. Die Funktion macht die Prüfung davon unabhängig.
 *
 * @param signal - das Abbruchsignal, falls eines gesetzt ist
 * @returns `true`, wenn abgebrochen wurde
 */
function abortedNow(signal: AbortSignal | undefined): boolean {
  const aborted: boolean = signal?.aborted === true
  return aborted
}

/** Hüllt einen anbieterfremden Fehler in einen `LlmError`. */
function asLlmError(cause: unknown): LlmError {
  const message = cause instanceof Error ? cause.message : String(cause)
  return new LlmError('malformed', `Anbieter warf einen Fehler außerhalb des Seams: ${message}`, {
    retryable: false,
    cause,
  })
}

/**
 * Führt einen Turn aus und sammelt die Ereignisse.
 *
 * **Wann das nützlich ist und wann nicht.** Für eine Oberfläche ist der Strom
 * richtig ({@link AgentLoop.run}); für einen Test oder ein Skript, das nur das
 * Ergebnis will, ist diese Funktion kürzer. Sie **verschluckt nichts**: die
 * vollständige Ereignisfolge kommt mit.
 *
 * @param loop - der Loop
 * @param userText - die Eingabe
 * @param signal - Abbruchsignal
 * @returns Ereignisse und Ergebnis
 */
export async function runTurn(
  loop: AgentLoop,
  userText: string,
  signal?: AbortSignal,
): Promise<{ readonly events: readonly AgentEvent[]; readonly result: TurnResult }> {
  const events: AgentEvent[] = []
  const generator = loop.run(userText, signal)
  for (;;) {
    const next = await generator.next()
    if (next.done === true) return { events, result: next.value }
    events.push(next.value)
  }
}

/** Setzt die Texte aller Assistenten-Nachrichten zusammen — für Berichte. */
export function transcript(messages: readonly Message[]): readonly string[] {
  return messages
    .filter((message) => message.role === 'assistant')
    .map((message) => messageText(message))
    .filter((text) => text !== '')
}
