/**
 * `@prometheus-harness/session-format` — die fünfte Sprosse der kleinsten Kette.
 *
 * **Was hier entschieden wird.** Wie ein Verlauf auf die Platte kommt, ohne dass
 * ein Absturz ihn unlesbar macht — und ohne dass eine spätere Fassung die
 * frühere wegwirft.
 *
 * **Die drei Entscheidungen, jede mit einem Preis:**
 *
 * | Entscheidung | Warum | Der Preis |
 * |---|---|---|
 * | **JSON-Zeilen statt einer JSON-Datei** | eine abgebrochene Zeile kostet **eine** Nachricht, keine Datei. Eine halb geschriebene JSON-Datei ist nicht mehr parsebar — der ganze Verlauf ist verloren | die Datei ist kein gültiges JSON als Ganzes; wer sie auswerten will, liest Zeile für Zeile |
 * | **Ereignisse statt Zustände** | der Verlauf ist die **Summe** der Ereignisse, nicht ein Überschreiben. Damit ist nachvollziehbar, was geschah, und nicht nur, was übrig blieb | die Datei wird länger als ein Zustandsbild — sie wächst linear mit der Arbeit |
 * | **Unbekannte Zeilen werden aufbewahrt, nicht verworfen** | eine spätere Fassung kann Ereignisarten kennen, die diese nicht kennt. Wer sie wegwirft, zerstört beim Lesen fremde Daten | der Verlauf trägt Ballast mit, den diese Fassung nicht versteht |
 *
 * **Formatversion 1 — und was das ehrlich heißt.** `MAPPING.md` §3.3 nennt für
 * die Vorlage die **Formatversion 4** mit vier Migrationen (v0→v1→v2→v3→v4).
 * Dieses Paket beginnt bei **1** und hat **keine** Migration von den
 * Vorlage-Fassungen: deren Bedeutung ist ohne Einsicht in die Vorlage-Daten
 * nicht rekonstruierbar, und eine erfundene Migration wäre schlimmer als keine
 * — sie würde fremde Verläufe stillschweigend verfälschen. Was fehlt, steht
 * offen im Bericht; hier steht die **Mechanik** (Versionsfeld, Verteiler,
 * Prüfung), damit die Migrationen darauf aufsetzen können.
 *
 * **Was dieses Paket bewusst NICHT tut:** es schreibt nichts (das ist
 * `session-persistence-jsonl`), es ruft kein Werkzeug und kein Modell, und es
 * kennt keinen Anbieter.
 *
 * @module @prometheus-harness/session-format
 */

import {
  assistantMessage,
  messageText,
  textMessage,
  toolResultMessage,
  type CompletionResult,
  type Message,
  type ToolCall,
} from '@prometheus-harness/llm'

/**
 * Die Formatversion, die dieses Paket **schreibt**.
 *
 * **Warum eine Zahl und nicht „das aktuelle Format".** Eine Zeile ohne Version
 * ist in einem Jahr nicht mehr deutbar. Die Zahl steht in **jeder** Zeile, nicht
 * nur in der ersten: nur so ist eine einzelne Zeile für sich lesbar — und genau
 * das ist der Sinn von JSON-Zeilen.
 */
export const SESSION_FORMAT_VERSION = 1

/** Zeitstempel in ISO-8601 mit Zeitzone. */
export type Timestamp = string

/** Die Kennung einer Sitzung. */
export type SessionId = string

// ---------------------------------------------------------------------------
// Ereignisse
// ---------------------------------------------------------------------------

/** Felder, die **jede** Zeile trägt. */
export interface EventBase {
  /** Formatversion dieser Zeile. */
  readonly v: number
  /** Laufende Nummer innerhalb der Sitzung, ab 1 — lückenlos. */
  readonly seq: number
  /** Zeitpunkt der Aufzeichnung. */
  readonly at: Timestamp
}

/** Der Beginn einer Sitzung. Genau **einmal**, als erste Zeile. */
export interface SessionStartEvent extends EventBase {
  readonly type: 'session-start'
  readonly id: SessionId
  /** Modellkennung, mit der die Sitzung begann. */
  readonly model: string
  /** Arbeitsverzeichnis zum Startzeitpunkt. */
  readonly cwd: string
  /** Fassung der schreibenden Software — für die Fehlersuche. */
  readonly writer: string
}

/**
 * Die Systemanweisung, mit der die Sitzung begann.
 *
 * **Warum sie aufgezeichnet wird.** Ohne sie beginnt ein wieder aufgenommener
 * Verlauf mit der Benutzereingabe — das Modell hätte dann **andere**
 * Anweisungen als beim ersten Lauf. Gemessen am 13.10.2026 am durchgehenden
 * Test: der Verlauf aus der Datei ließ genau die Systemnachricht vermissen, die
 * der Speicher noch hatte. Ein Agent, der anders arbeitet, wenn man die Sitzung
 * fortsetzt, ist nicht fortsetzbar.
 *
 * Sie steht **einmal** in der Datei, direkt nach `session-start`: sie ist eine
 * Eigenschaft der Sitzung, nicht jedes Turns.
 */
export interface SystemPromptEvent extends EventBase {
  readonly type: 'system-prompt'
  readonly text: string
}

/** Die Eingabe des Benutzers. */
export interface UserInputEvent extends EventBase {
  readonly type: 'user-input'
  readonly text: string
}

/** Der Beginn eines Turns. */
export interface TurnStartEvent extends EventBase {
  readonly type: 'turn-start'
  readonly turn: number
  readonly maxSteps: number
}

/** Der Beginn eines Steps. */
export interface StepStartEvent extends EventBase {
  readonly type: 'step-start'
  readonly turn: number
  readonly step: number
}

/** Die Antwort des Modells — Text **und** verlangte Werkzeugaufrufe. */
export interface ModelReplyEvent extends EventBase {
  readonly type: 'model-reply'
  readonly turn: number
  readonly step: number
  readonly text: string
  readonly toolCalls: readonly ToolCall[]
  readonly finishReason: CompletionResult['finishReason']
}

/** Das Ergebnis eines Werkzeugs. */
export interface ToolResultEvent extends EventBase {
  readonly type: 'tool-result'
  readonly turn: number
  readonly step: number
  readonly callId: string
  readonly name: string
  readonly content: string
  readonly failed: boolean
  readonly durationMs: number
}

/** Der Zählerstand nach einem Step. */
export interface UsageEvent extends EventBase {
  readonly type: 'usage'
  readonly turn: number
  readonly step: number
  readonly inputTokens: number
  readonly outputTokens: number
  /**
   * Herkunft der Zahlen: `reported`, `estimated` oder `mixed`.
   *
   * **Warum das mitgeschrieben wird.** Eine Zahl in einer Datei wird zur
   * Messung, sobald niemand mehr weiß, woher sie kam. Ohne dieses Feld wäre
   * eine geschätzte Zahl von einer gemeldeten nicht zu unterscheiden — in einer
   * Datei, die Monate später gelesen wird.
   */
  readonly method: string
  readonly requests: number
}

/** Das Ende eines Turns. */
export interface TurnEndEvent extends EventBase {
  readonly type: 'turn-end'
  readonly turn: number
  readonly step: number
  readonly reason: string
  readonly text: string
  /** Nur bei einem Fehler gesetzt. */
  readonly errorKind?: string
  readonly errorMessage?: string
}

/**
 * Etwas, das diese Fassung **nicht kennt**.
 *
 * **Warum das aufbewahrt und nicht verworfen wird.** Eine neuere Fassung kann
 * Ereignisarten schreiben, die hier unbekannt sind. Wer sie beim Lesen
 * wegwirft, zerstört fremde Daten — und beim nächsten Schreiben sind sie
 * endgültig fort. Diese Fassung liest sie, zählt sie und **schreibt sie
 * unverändert zurück**.
 */
export interface UnknownEvent {
  readonly v: number
  readonly seq: number
  readonly at: Timestamp
  readonly type: 'unknown'
  /** Wie die Zeile ursprünglich hieß. */
  readonly actualType: string
  /** Die Zeile, unverändert. */
  readonly raw: Readonly<Record<string, unknown>>
}

/** Ein Ereignis dieser Fassung. */
export type SessionEvent =
  | SessionStartEvent
  | SystemPromptEvent
  | UserInputEvent
  | TurnStartEvent
  | StepStartEvent
  | ModelReplyEvent
  | ToolResultEvent
  | UsageEvent
  | TurnEndEvent

/** Eine gelesene Zeile: bekannt oder unbekannt. */
export type ReadEvent = SessionEvent | UnknownEvent

/** Alle bekannten Ereignisarten. */
export const KNOWN_EVENT_TYPES = [
  'session-start',
  'system-prompt',
  'user-input',
  'turn-start',
  'step-start',
  'model-reply',
  'tool-result',
  'usage',
  'turn-end',
] as const

/** Eine der bekannten Ereignisarten. */
export type KnownEventType = (typeof KNOWN_EVENT_TYPES)[number]

// ---------------------------------------------------------------------------
// Schreiben: Ereignis → Zeile
// ---------------------------------------------------------------------------

/**
 * Macht aus einem Ereignis genau **eine** Zeile.
 *
 * **Die Zusage: eine Zeile, nie ein Umbruch mitten im JSON.** `\n` im Text
 * wird von `JSON.stringify` escaped, deshalb ist die Zeile immer genau eine.
 * Eine eingebettete neue Zeile würde die Datei unlesbar machen — und zwar erst
 * beim Lesen, also lange nach dem Schreiben.
 *
 * @param event - das Ereignis
 * @returns die Zeile **ohne** abschließenden Zeilenumbruch
 */
export function serializeEvent(event: ReadEvent): string {
  const payload =
    event.type === 'unknown'
      ? { ...event.raw, v: event.v, seq: event.seq, at: event.at }
      : { ...event, v: event.v, seq: event.seq, at: event.at }
  return JSON.stringify(payload)
}

/** Wie {@link serializeEvent}, aber mit Zeilenumbruch für das Anhängen. */
export function serializeLine(event: ReadEvent): string {
  return `${serializeEvent(event)}\n`
}

// ---------------------------------------------------------------------------
// Lesen: Zeile → Ereignis
// ---------------------------------------------------------------------------

/** Was beim Lesen einer Zeile herauskam. */
export type ParseOutcome =
  /** Eine gültige Zeile mit bekanntem Ereignis. */
  | { readonly ok: true; readonly event: ReadEvent }
  /** Eine leere Zeile — kein Fehler, sie wird übergangen. */
  | { readonly ok: true; readonly event: undefined }
  /** Eine unbrauchbare Zeile — der Grund wird benannt, nicht verschwiegen. */
  | { readonly ok: false; readonly problem: string }

/** Die Felder, die jede Zeile tragen muss. */
interface RawEnvelope {
  readonly v?: unknown
  readonly seq?: unknown
  readonly at?: unknown
  readonly type?: unknown
}

/**
 * Parst eine Zeile.
 *
 * **Die Regel, die hier gilt:** eine unbrauchbare Zeile ist ein **Befund**, kein
 * Absturz. Wer eine Datei mit 5000 Zeilen liest und bei Zeile 4000 abbricht,
 * verliert 1000 gute Zeilen — wegen einer kaputten. Deshalb gibt diese Funktion
 * ein Ergebnis zurück und wirft nicht.
 *
 * **Was als bekannt gilt:** jedes `type`, das in {@link KNOWN_EVENT_TYPES}
 * steht. Alles andere wird zu {@link UnknownEvent} — **nicht** zu einem Fehler:
 * eine neuere Fassung darf mehr wissen als diese.
 *
 * @param line - die rohe Zeile, mit oder ohne Umbruch
 * @returns das Ergebnis; bei `ok: false` steht der Grund im Feld `problem`
 */
export function parseLine(line: string): ParseOutcome {
  const trimmed = line.replace(/\r?\n$/, '')
  if (trimmed.trim() === '') return { ok: true, event: undefined }

  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { ok: false, problem: `Zeile ist kein JSON: ${message}` }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, problem: 'Zeile ist kein Objekt' }
  }

  const envelope = raw as RawEnvelope
  const version = typeof envelope.v === 'number' && Number.isInteger(envelope.v) ? envelope.v : undefined
  if (version === undefined) return { ok: false, problem: 'Feld "v" fehlt oder ist keine ganze Zahl' }

  const seq = typeof envelope.seq === 'number' && Number.isInteger(envelope.seq) ? envelope.seq : undefined
  if (seq === undefined) return { ok: false, problem: 'Feld "seq" fehlt oder ist keine ganze Zahl' }

  const at = typeof envelope.at === 'string' ? envelope.at : undefined
  if (at === undefined) return { ok: false, problem: 'Feld "at" fehlt' }

  if (typeof envelope.type !== 'string' || envelope.type === '') {
    return { ok: false, problem: 'Feld "type" fehlt' }
  }

  if (version > SESSION_FORMAT_VERSION) {
    // Eine **neuere** Zeile: nicht als Fehler behandeln — sie ist gültig, nur
    // nicht für diese Fassung. Sie wird aufbewahrt.
    return {
      ok: true,
      event: { v: version, seq, at, type: 'unknown', actualType: envelope.type, raw: raw as Record<string, unknown> },
    }
  }

  if (!isKnownType(envelope.type)) {
    return {
      ok: true,
      event: { v: version, seq, at, type: 'unknown', actualType: envelope.type, raw: raw as Record<string, unknown> },
    }
  }

  const event = raw as Record<string, unknown> & EventBase & { type: KnownEventType }
  return { ok: true, event: event as unknown as SessionEvent }
}

/** Prüft, ob ein `type` zu dieser Fassung gehört. */
export function isKnownType(type: string): type is KnownEventType {
  return (KNOWN_EVENT_TYPES as readonly string[]).includes(type)
}

/** Was beim Lesen einer ganzen Datei herauskam. */
export interface ParseReport {
  /** Alle gelesenen Ereignisse, in Reihenfolge — auch die unbekannten. */
  readonly events: readonly ReadEvent[]
  /** Die Befunde: Zeilennummer und Grund. Leer heißt: alles lesbar. */
  readonly problems: readonly { readonly line: number; readonly problem: string }[]
  /** Zahl der Zeilen, die eine **neuere** Fassung tragen. */
  readonly futureVersions: number
  /** Die höchste gesehene Formatversion; `0`, wenn keine Zeile eine nannte. */
  readonly highestVersion: number
}

/**
 * Parst eine ganze Datei.
 *
 * @param text - der Inhalt; Zeilenumbrüche dürfen `\n` oder `\r\n` sein
 * @returns Ereignisse, Befunde und Versionsangaben
 */
export function parseSession(text: string): ParseReport {
  const events: ReadEvent[] = []
  const problems: { line: number; problem: string }[] = []
  let futureVersions = 0
  let highestVersion = 0

  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    const outcome = parseLine(line)
    if (!outcome.ok) {
      problems.push({ line: index + 1, problem: outcome.problem })
      continue
    }
    if (outcome.event === undefined) continue
    events.push(outcome.event)
    if (outcome.event.v > highestVersion) highestVersion = outcome.event.v
    if (outcome.event.v > SESSION_FORMAT_VERSION) futureVersions += 1
  }

  return { events, problems, futureVersions, highestVersion }
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/** Ein Migrationsschritt von einer Fassung auf die nächste. */
export interface Migration {
  /** Die Fassung, von der er liest. */
  readonly from: number
  /** Die Fassung, auf die er schreibt — immer `from + 1`. */
  readonly to: number
  /** Kurze Begründung; erscheint im Bericht. */
  readonly why: string
  /**
   * Wandelt eine Zeile um.
   *
   * @param raw - die rohe Zeile
   * @returns die umgewandelte Zeile
   */
  migrate(raw: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>
}

/**
 * Die bekannten Migrationen.
 *
 * **Warum sie leer ist — und warum das kein Versehen ist.** Die Vorlage kennt
 * die Fassungen 0 bis 4 (`MAPPING.md` §3.3). Deren Feldbedeutungen sind aus
 * dieser Sicht **nicht rekonstruierbar**: es liegen keine Vorlage-Sitzungsdaten
 * vor, gegen die sich eine Umwandlung prüfen ließe. Eine erfundene Migration
 * würde fremde Verläufe **stillschweigend verfälschen** — sie sähe erfolgreich
 * aus und wäre falsch. Deshalb ist die Kette hier leer, und
 * {@link migrateEvents} meldet ehrlich, was es nicht kann.
 */
export const MIGRATIONS: readonly Migration[] = []

/** Der Bericht einer Migration. */
export interface MigrationReport {
  /** Die Ereignisse nach der Migration. */
  readonly events: readonly ReadEvent[]
  /** Die Schritte, die angewandt wurden, in Reihenfolge. */
  readonly applied: readonly string[]
  /** Zeilen, die **nicht** auf die Zielfassung gebracht werden konnten. */
  readonly skipped: readonly { readonly seq: number; readonly from: number; readonly reason: string }[]
}

/**
 * Bringt Ereignisse auf eine Fassung.
 *
 * **Was hier passiert, wenn keine Migration existiert:** die Zeile wird **nicht**
 * verändert und **nicht** verworfen, sondern als `skipped` mit Grund gemeldet.
 * Der Aufrufer entscheidet, ob er weiterarbeitet. Ein stilles Überspringen wäre
 * der gefährlichste Ausgang: der Verlauf sähe vollständig aus und wäre es nicht.
 *
 * @param events - die gelesenen Ereignisse
 * @param target - die Zielfassung; Vorgabe ist die aktuelle
 * @returns Ereignisse, angewandte Schritte und nicht wandelbare Zeilen
 */
export function migrateEvents(
  events: readonly ReadEvent[],
  target: number = SESSION_FORMAT_VERSION,
): MigrationReport {
  const migrated: ReadEvent[] = []
  const applied: string[] = []
  const skipped: { seq: number; from: number; reason: string }[] = []

  for (const event of events) {
    if (event.v === target) {
      migrated.push(event)
      continue
    }
    if (event.v > target) {
      skipped.push({ seq: event.seq, from: event.v, reason: `Fassung ${event.v} ist neuer als die Zielfassung ${target}` })
      continue
    }

    let current: ReadEvent = event
    let currentRaw: ReadOnlyRecord = toRaw(event)
    let moved = false

    while (current.v < target) {
      const step = MIGRATIONS.find((migration) => migration.from === current.v)
      if (step === undefined) {
        skipped.push({
          seq: event.seq,
          from: current.v,
          reason: `keine Migration von Fassung ${current.v} auf ${current.v + 1} vorhanden`,
        })
        break
      }
      currentRaw = step.migrate(currentRaw)
      applied.push(`v${step.from}→v${step.to}`)
      current = parseRaw(currentRaw, current.v + 1)
      moved = true
    }

    if (moved && current.v === target) migrated.push(current)
  }

  return { events: migrated, applied, skipped }
}

/** Ein schreibgeschütztes Objekt. */
type ReadOnlyRecord = Readonly<Record<string, unknown>>

/** Macht aus einem Ereignis wieder eine rohe Zeile. */
function toRaw(event: ReadEvent): ReadOnlyRecord {
  if (event.type === 'unknown') return { ...event.raw, v: event.v, seq: event.seq, at: event.at }
  return { ...event } as unknown as ReadOnlyRecord
}

/** Baut aus einer rohen Zeile ein Ereignis der genannten Fassung. */
function parseRaw(raw: ReadOnlyRecord, version: number): ReadEvent {
  const seq = typeof raw.seq === 'number' ? raw.seq : 0
  const at = typeof raw.at === 'string' ? raw.at : ''
  const type = typeof raw.type === 'string' ? raw.type : ''
  if (!isKnownType(type)) {
    return { v: version, seq, at, type: 'unknown', actualType: type, raw }
  }
  return { ...(raw as unknown as SessionEvent), v: version, seq, at }
}

// ---------------------------------------------------------------------------
// Falten: Ereignisse → Verlauf
// ---------------------------------------------------------------------------

/** Ein Problem, das beim Falten auffällt. */
export interface FoldProblem {
  readonly seq: number
  readonly problem: 'result-without-call' | 'unknown-event' | 'duplicate-seq' | 'gap-in-seq'
}

/** Das Ergebnis des Faltens. */
export interface FoldResult {
  /**
   * Der rekonstruierte Verlauf — **genau die Form**, die der Agent-Loop an den
   * Anbieter schicken würde. Das ist der Zweck dieses Pakets: eine Sitzung, die
   * auf der Platte lag, geht unverändert weiter.
   */
  readonly messages: readonly Message[]
  /** Summe der Token. */
  readonly inputTokens: number
  readonly outputTokens: number
  /** Der Grund des letzten Turn-Endes, falls es eines gibt. */
  readonly lastTurnReason: string | undefined
  /** Die Zahl der Turns im Verlauf. */
  readonly turns: number
  /** Auffälligkeiten; leer heißt unauffällig. */
  readonly problems: readonly FoldProblem[]
}

/**
 * Baut aus Ereignissen den Verlauf.
 *
 * **Warum das Falten und nicht ein mitgeschriebener Verlauf.** Ein
 * mitgeschriebener Verlauf wäre eine zweite Wahrheit: er könnte von den
 * Ereignissen abweichen, und niemand wüsste, welche gilt. Das Falten macht die
 * Ereignisse zur **einzigen** Quelle — es gibt nichts, was widersprechen könnte.
 *
 * **Was geprüft wird.** Die Reihenfolge (`seq` lückenlos, keine Doppelten), ein
 * Werkzeugergebnis ohne Aufruf, und unbekannte Ereignisse (sie werden gemeldet,
 * aber **nicht** stillschweigend als leer behandelt).
 *
 * @param events - die Ereignisse in Dateireihenfolge
 * @returns der Verlauf samt Summen und Befunden
 */
export function foldSession(events: readonly ReadEvent[]): FoldResult {
  const messages: Message[] = []
  const problems: FoldProblem[] = []
  const callIds = new Set<string>()
  let inputTokens = 0
  let outputTokens = 0
  let lastTurnReason: string | undefined
  let turns = 0
  let expectedSeq = 1

  for (const event of events) {
    if (event.seq !== expectedSeq) {
      problems.push({ seq: event.seq, problem: event.seq < expectedSeq ? 'duplicate-seq' : 'gap-in-seq' })
      expectedSeq = event.seq + 1
    } else {
      expectedSeq = event.seq + 1
    }

    switch (event.type) {
      case 'session-start':
      case 'turn-start':
        if (event.type === 'turn-start') turns += 1
        break

      case 'system-prompt':
        // Die Systemnachricht steht **am Anfang**, wie im Loop: sie ist die
        // Anweisung, unter der alles Weitere gilt.
        if (event.text !== '') messages.unshift(textMessage('system', event.text))
        break

      case 'user-input':
        messages.push(textMessage('user', event.text))
        break

      case 'step-start':
        break

      case 'model-reply': {
        const result: CompletionResult = {
          text: event.text,
          toolCalls: event.toolCalls,
          finishReason: event.finishReason,
          model: '',
        }
        for (const call of event.toolCalls) callIds.add(call.id)
        const assistant = assistantMessage(result)
        if (assistant.parts.length > 0) messages.push(assistant)
        break
      }

      case 'tool-result':
        if (!callIds.has(event.callId)) {
          problems.push({ seq: event.seq, problem: 'result-without-call' })
        }
        messages.push(
          toolResultMessage([
            { type: 'tool-result', callId: event.callId, content: event.content },
          ]),
        )
        break

      case 'usage':
        inputTokens += event.inputTokens
        outputTokens += event.outputTokens
        break

      case 'turn-end':
        lastTurnReason = event.reason
        break

      case 'unknown':
        problems.push({ seq: event.seq, problem: 'unknown-event' })
        break
    }
  }

  return { messages, inputTokens, outputTokens, lastTurnReason, turns, problems }
}

/** Der Text eines Verlaufs, Zeile für Zeile — für Berichte und Prüfungen. */
export function describeMessages(messages: readonly Message[]): readonly string[] {
  return messages.map((message) => {
    const text = messageText(message)
    const results = message.parts.filter((part) => part.type === 'tool-result')
    const calls = message.parts.filter((part) => part.type === 'tool-call')

    // **Ergebnisse zuerst.** Eine `role: 'tool'`-Nachricht darf keine Aufrufe
    // tragen; stünde die Aufruf-Prüfung vorn, würde sie trotzdem greifen und
    // das Ergebnis verschweigen — die Beschreibung wäre dann leer, obwohl die
    // Nachricht den Inhalt trägt. Genau das ist beim ersten Testlauf passiert.
    if (results.length > 0) {
      const contents = results
        .map((part) => (part.type === 'tool-result' ? part.content : ''))
        .join(' | ')
      return `${message.role}: [Ergebnis] ${contents}${text === '' ? '' : ` ${text}`}`
    }
    if (calls.length > 0) {
      const names = calls.map((part) => (part.type === 'tool-call' ? part.name : '')).join(', ')
      return `${message.role}: [Aufruf ${names}]${text === '' ? '' : ` ${text}`}`
    }
    return `${message.role}: ${text}`
  })
}
