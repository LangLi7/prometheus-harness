/**
 * Der durchgehende Nachweis der kleinsten Kette.
 *
 * ```
 * DeepSeek-Adapter → llm-retry → agent-loop → Werkzeuge → session-format → JSONL → Wiederaufnahme
 * ```
 *
 * **Warum diese Datei außerhalb der Pakete liegt.** Jeder Pakettest prüft sein
 * Paket. Ob die sechs **zusammen** einen Agenten ergeben, prüft keiner von
 * ihnen. Genau an dieser Stelle scheitert ein Bauvorhaben dieser Art
 * typischerweise: sechs grüne Pakete und keine Kette. Diese Datei ist der
 * Riegel davor.
 *
 * **Was hier echt ist und was nicht:**
 *
 * | Teil | echt? |
 * |---|---|
 * | Seam, Wiederholung, Loop, Werkzeuge, Format, Persistenz | **echt** — der Code, der ausgeliefert wird |
 * | HTTP-Weg des Adapters | **echt** — `fetch` mit JSON, Nutzlast und Kopfzeilen |
 * | Dateisystem | **echt** — ein temporärer Ordner |
 * | Anbieter (`api.deepseek.com`) | **nicht** — eine Attrappe antwortet. Ein Test, der einen Schlüssel und Netz braucht, wird nicht ausgeführt; ein nicht ausgeführter Test beweist nichts |
 *
 * **Der Befund, der beim Schreiben dieser Datei entstand und behoben wurde.**
 * Der erste Versuch warf die Loop-Ereignisse mit einer Typumwandlung in den
 * Session-Schreiber. Das schlug zur Laufzeit fehl — und es hätte auch mit
 * Typen nicht funktionieren können: die Ereignisse des Loops tragen
 * `toolNames` (Namen), die Zeilen des Formats brauchen `toolCalls`
 * (Kennungen und Argumente). **Ohne die Kennungen ist der Verlauf nicht
 * wiederherstellbar.** Deshalb gibt es jetzt eine ausdrückliche Übersetzung
 * ({@link toSessionEvent}) statt einer Umwandlung — und der Loop führt
 * zusätzlich die Turn-Nummer, damit die Zeilen „Turn 2, Step 1" sagen können
 * und nicht zweimal „Turn 1".
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Tools, type AgentTool } from '@prometheus-harness/agent-tools'
import { AgentLoop, runTurn, type AgentEvent } from '@prometheus-harness/agent-loop'
import {
  LlmError,
  checkHistory,
  messageText,
  messageToolCalls,
  messageToolResults,
  type Message,
} from '@prometheus-harness/llm'
import { DeepSeekProvider } from '@prometheus-harness/llm-deepseek'
import { RetryProvider } from '@prometheus-harness/llm-retry'
import { SESSION_FORMAT_VERSION, type ReadEvent } from '@prometheus-harness/session-format'
import { createSession, openSession, readSession, type SessionWriter } from '@prometheus-harness/session-persistence-jsonl'

// ---------------------------------------------------------------------------
// Die Anbieter-Attrappe
// ---------------------------------------------------------------------------

/** Was die Attrappe auf eine Anfrage antwortet. */
type FakeAnswer =
  | { readonly status: number; readonly body: unknown }
  | { readonly status: number; readonly text: string }

/** Hält jede Nutzlast, jeden Pfad und jede Kopfzeile fest. */
interface FakeRecorder {
  readonly bodies: Record<string, unknown>[]
  readonly paths: string[]
  readonly headers: Record<string, string>[]
}

/**
 * Baut ein `fetch`, das gegen eine feste Antwortfolge antwortet.
 *
 * **Warum der Rückgabetyp `typeof globalThis.fetch` ist.** Der Adapter nimmt
 * genau diesen Typ. In dieser Laufzeit hängt daran auch `preconnect` — eine
 * Vorab-Verbindung, die der echte `fetch` von Bun anbietet. Sie ist für den
 * Adapter bedeutungslos (er ruft sie nie auf); sie wird hier **vorhanden** sein
 * gelassen, statt den Typ wegzucasten. Ein weggcasteter Typ würde verstecken,
 * wenn der Adapter später etwas anderes aufruft.
 */
function fakeFetch(
  answers: readonly FakeAnswer[],
  recorder: FakeRecorder,
): typeof globalThis.fetch {
  let index = 0
  const fn = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    recorder.paths.push(url)
    recorder.headers.push((init?.headers ?? {}) as Record<string, string>)
    const body = typeof init?.body === 'string' ? init.body : '{}'
    recorder.bodies.push(JSON.parse(body) as Record<string, unknown>)

    const answer = answers[Math.min(index, answers.length - 1)]
    index += 1
    if (answer === undefined) throw new Error('Attrappe ohne Antworten')

    const payload = 'body' in answer ? JSON.stringify(answer.body) : answer.text
    return Promise.resolve(
      new Response(payload, { status: answer.status, headers: { 'content-type': 'application/json' } }),
    )
  }
  // `preconnect` gehört in dieser Laufzeit zum Typ `fetch`. Der Adapter ruft es
  // nie auf; es wird hier nur **vorhanden** gemacht, damit kein Cast nötig ist.
  return Object.assign(fn, { preconnect: (): void => undefined }) as unknown as typeof globalThis.fetch
}

/** Eine gültige Chat-Antwort mit Text. */
function chatText(text: string, usage = { prompt_tokens: 120, completion_tokens: 8 }): FakeAnswer {
  return {
    status: 200,
    body: { model: 'deepseek-chat', choices: [{ message: { content: text }, finish_reason: 'stop' }], usage },
  }
}

/** Eine gültige Chat-Antwort, die ein Werkzeug verlangt. */
function chatToolCall(id: string, name: string, args: Record<string, unknown>): FakeAnswer {
  return {
    status: 200,
    body: {
      model: 'deepseek-chat',
      choices: [
        {
          message: {
            content: '',
            tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 80, completion_tokens: 12 },
    },
  }
}

/** Eine Überlastungsantwort — der Anlass für eine Wiederholung. */
function overloaded(): FakeAnswer {
  return { status: 429, text: '{"error":{"message":"rate limited"}}' }
}

// ---------------------------------------------------------------------------
// Übersetzung: Loop-Ereignis → Session-Zeile
// ---------------------------------------------------------------------------

/**
 * Übersetzt ein Ereignis des Loops in eine Zeile des Session-Formats.
 *
 * **Warum das eine ausdrückliche Funktion ist und keine Typumwandlung.** Die
 * beiden Formen sind **nicht** gleich: der Loop meldet die **Namen** der
 * verlangten Werkzeuge (`toolNames`), das Format braucht die **Aufrufe**
 * (`toolCalls` — Kennung und Argumente). Eine Umwandlung des Typs würde diesen
 * Unterschied verstecken; die Datei hätte dann Zeilen ohne Kennungen, und der
 * Verlauf wäre nicht mehr zuordenbar. Diese Funktion zwingt die Entscheidung an
 * eine sichtbare Stelle.
 *
 * `usage`-Ereignisse werden **nicht** geschrieben: der Zählerstand folgt aus den
 * Modellantworten und steht zusätzlich im Zustandsbild. Sie mitzuschreiben wäre
 * eine zweite Wahrheit über dieselbe Zahl.
 *
 * @param event - das Ereignis des Loops
 * @param seq - die Zeilennummer
 * @param at - der Zeitstempel
 * @param toolCalls - die Aufrufe der zugehörigen Antwort (nur für `model-reply`)
 * @returns die Zeile, oder `undefined`, wenn das Ereignis nicht geschrieben wird
 */
function toSessionEvent(
  event: AgentEvent,
  seq: number,
  at: string,
  toolCalls: readonly {
    readonly id: string
    readonly name: string
    readonly arguments: Readonly<Record<string, unknown>>
  }[] = [],
): ReadEvent | undefined {
  const base = { v: SESSION_FORMAT_VERSION, seq, at }
  switch (event.type) {
    case 'system-prompt':
      return { ...base, type: 'system-prompt', text: event.text }
    case 'user-input':
      return { ...base, type: 'user-input', text: event.text }
    case 'turn-start':
      return { ...base, type: 'turn-start', turn: event.turn, maxSteps: event.maxSteps }
    case 'step-start':
      return { ...base, type: 'step-start', turn: event.turn, step: event.step }
    case 'model-reply':
      return {
        ...base,
        type: 'model-reply',
        turn: event.turn,
        step: event.step,
        text: event.text,
        toolCalls: [...toolCalls],
        finishReason: event.finishReason,
      }
    case 'tool-result':
      return {
        ...base,
        type: 'tool-result',
        turn: event.turn,
        step: event.step,
        callId: event.callId,
        name: event.name,
        content: event.content,
        failed: event.failed,
        durationMs: event.durationMs,
      }
    case 'turn-end':
      return {
        ...base,
        type: 'turn-end',
        turn: event.turn,
        step: event.steps,
        reason: event.reason,
        text: event.text,
      }
    case 'usage':
      // Bewusst nicht geschrieben — siehe oben.
      return undefined
  }
}

// ---------------------------------------------------------------------------
// Prüfgerüst
// ---------------------------------------------------------------------------

let root = ''
const AT = '2026-10-13T12:00:00.000Z'
const NOW = (): Date => new Date(AT)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pmh-kette-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Ein Werkzeug, das eine Datei „liest". */
function fileTool(): { readonly tool: AgentTool; readonly calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = []
  return {
    calls,
    tool: {
      name: 'read_file',
      description: 'Liest eine Datei und gibt ihren Inhalt zurück.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      execute: (args): Promise<string> => {
        calls.push(args)
        return Promise.resolve(`Inhalt von ${String(args.path)}`)
      },
    },
  }
}

/**
 * Schreibt die Ereignisse eines Turns in eine Sitzung.
 *
 * Der Aufrufer gibt die Aufrufe je Antwort mit, weil sie im Loop-Ereignis nur
 * als Namen stehen: die Argumente kennt der Loop nicht mehr, der Anbieter schon.
 * Deshalb zeichnet der Test die Antworten mit auf (`seenAnswers`).
 */
// ---------------------------------------------------------------------------
// Die Kette
// ---------------------------------------------------------------------------

describe('Kette: Adapter → Wiederholung → Loop → Werkzeuge → Sitzung → Wiederaufnahme', () => {
  test('ein Agent-Turn mit Wiederholung, Werkzeug, Persistenz und Fortsetzung', async () => {
    const fake: FakeRecorder = { bodies: [], paths: [], headers: [] }
    const answers: FakeAnswer[] = [
      overloaded(),
      chatToolCall('call-1', 'read_file', { path: 'notizen.txt' }),
      chatText('In notizen.txt steht: Inhalt von notizen.txt'),
      chatText('Gern. Sonst noch etwas?'),
    ]
    const deepseek = new DeepSeekProvider(
      { apiKey: 'test-schluessel-123', baseUrl: 'https://attrappe.invalid/v1' },
      fakeFetch(answers, fake),
    )
    const waited: number[] = []
    const provider = new RetryProvider({
      inner: deepseek,
      policy: { maxAttempts: 3, baseDelayMs: 250, jitter: 'none' },
      sleep: (ms): Promise<void> => {
        waited.push(ms)
        return Promise.resolve()
      },
    })
    expect(provider.name).toBe('deepseek+retry')

    const file = fileTool()
    const tools = new Tools([file.tool])
    const loop = new AgentLoop({
      provider,
      tools,
      model: 'deepseek-chat',
      sessionId: 'kette-1',
      system: 'Du bist knapp und liest Dateien, statt zu raten.',
      meter: { estimator: (text) => Math.ceil(text.length / 4) },
    })

    const writer = await createSession({ root, id: 'kette-1', model: 'deepseek-chat', cwd: '/w', now: NOW })

    // --- Turn 1 -------------------------------------------------------------
    const first = await runTurn(loop, 'Was steht in notizen.txt?')
    await writeEvents(writer, loop, first.events, 2)

    expect(first.result.reason).toBe('stop')
    // **Zwei** Steps: Step 1 endet mit dem Werkzeugaufruf, Step 2 mit dem Text.
    // Die Wiederholung nach dem 429 zählt **nicht** als eigener Step — sie ist
    // eine Angelegenheit des Anbieters (`llm-retry`), nicht des Turns. Genau
    // deshalb liegt die Wiederholung hinter dem Seam und nicht im Loop.
    expect(first.result.steps).toBe(2)
    expect(first.result.text).toBe('In notizen.txt steht: Inhalt von notizen.txt')
    // Genau **eine** Wiederholung nach dem 429.
    expect(waited).toEqual([250])
    expect(file.calls).toEqual([{ path: 'notizen.txt' }])
    // Drei HTTP-Aufrufe in diesem Turn: 429, Werkzeugaufruf, Text.
    expect(fake.paths).toHaveLength(3)
    expect(fake.paths.every((path) => path.endsWith('/chat/completions'))).toBe(true)
    // Der Schlüssel geht als Kopfzeile hinaus — und steht in keiner Nutzlast.
    expect(fake.headers[0]?.authorization).toBe('Bearer test-schluessel-123')
    expect(JSON.stringify(fake.bodies)).not.toContain('test-schluessel-123')
    const tools0 = fake.bodies[0]?.tools as { function: { name: string } }[] | undefined
    expect(tools0?.[0]?.function.name).toBe('read_file')

    await writer.close()

    // --- Der Zwischenstand auf der Platte -----------------------------------
    const before = await readSession(root, 'kette-1')
    expect(before.problems).toEqual([])
    expect(before.foldProblems).toEqual([])
    expect(before.fold.messages.map((message) => message.role)).toEqual([
      'system', 'user', 'assistant', 'tool', 'assistant',
    ])
    expect(checkHistory(before.fold.messages)).toEqual([])

    // --- Wiederaufnahme: der Verlauf kommt aus der DATEI --------------------
    const { writer: reopened, report } = await openSession(root, 'kette-1', { now: NOW })
    expect(report.meta?.id).toBe('kette-1')
    const folded = report.fold.messages
    expect(checkHistory(folded)).toEqual([])

    const turnOfLast = report.events.filter((event) => event.type === 'turn-start').length
    expect(turnOfLast).toBe(1)

    const resumed = new AgentLoop({
      provider,
      tools,
      model: 'deepseek-chat',
      sessionId: 'kette-1',
      firstTurn: turnOfLast + 1,
    })
    resumed.loadHistory(folded)

    // --- Turn 2 -------------------------------------------------------------
    const second = await runTurn(resumed, 'Danke.')
    // Die Nummerierung setzt dort fort, wo die Datei endete.
    await writeEvents(reopened, resumed, second.events, nextSeqOf(before.events))
    await reopened.close()

    expect(second.result.reason).toBe('stop')
    expect(second.result.text).toBe('Gern. Sonst noch etwas?')

    // --- Der Beweis, der die ganze Kette trägt ------------------------------
    // Der **vierte** HTTP-Aufruf gehört zu Turn 2. Seine Nutzlast muss den
    // Werkzeugaufruf aus Turn 1 tragen — sonst wäre das Ergebnis nicht
    // zuordenbar, und ein echter Anbieter antwortete mit `400`.
    expect(fake.paths).toHaveLength(4)
    const payload = fake.bodies[3] as { messages: Record<string, unknown>[] }
    const messages = payload.messages
    expect(messages.map((message) => message.role)).toEqual([
      'system', 'user', 'assistant', 'tool', 'assistant', 'user',
    ])
    const assistantWithCall = messages.find((message) => Array.isArray(message.tool_calls))
    expect(assistantWithCall).toBeDefined()
    const calls = assistantWithCall?.tool_calls as { id: string; function: { name: string; arguments: string } }[]
    expect(calls[0]?.id).toBe('call-1')
    expect(calls[0]?.function.name).toBe('read_file')
    expect(calls[0]?.function.arguments).toBe('{"path":"notizen.txt"}')
    const toolMessage = messages.find((message) => message.role === 'tool')
    expect(toolMessage?.tool_call_id).toBe('call-1')
    expect(toolMessage?.content).toBe('Inhalt von notizen.txt')

    // --- Und der Verlauf nach zwei Turns ist lückenlos ----------------------
    const after = await readSession(root, 'kette-1')
    expect(after.problems).toEqual([])
    expect(after.foldProblems).toEqual([])
    expect(after.fold.messages.map((message) => message.role)).toEqual([
      'system', 'user', 'assistant', 'tool', 'assistant', 'user', 'assistant',
    ])
    expect(checkHistory(after.fold.messages)).toEqual([])
    // Zwei Turns, verschiedene Nummern — das ist der Grund für `firstTurn`.
    const turns = after.events.filter((event) => event.type === 'turn-start')
    expect(turns.map((event) => (event.type === 'turn-start' ? event.turn : 0))).toEqual([1, 2])
    // Und die Zeilennummern sind lückenlos.
    expect(after.events.at(-1)?.seq).toBe(after.events.length)
  })

  test('ohne Werkzeuge antwortet der Agent direkt — die Kette bleibt gültig', async () => {
    const fake: FakeRecorder = { bodies: [], paths: [], headers: [] }
    const deepseek = new DeepSeekProvider(
      { apiKey: 'k', baseUrl: 'https://attrappe.invalid/v1' },
      fakeFetch([chatText('Zwei.')], fake),
    )
    const loop = new AgentLoop({ provider: deepseek, model: 'deepseek-chat' })
    const writer = await createSession({ root, id: 'kette-2', model: 'deepseek-chat', cwd: '/w', now: NOW })
    const { result, events } = await runTurn(loop, 'Wie viel ist eins plus eins?')
    await writeEvents(writer, loop, events, 2)
    await writer.close()

    expect(result.reason).toBe('stop')
    expect(result.usage.inputTokens).toBe(120)
    expect(result.usage.method).toBe('reported')
    const report = await readSession(root, 'kette-2')
    if (report.fold.messages.map((message) => message.role).length !== 2) {
      const raw = await readFile(join(root, 'kette-2', 'events.jsonl'), 'utf8')
      throw new Error(
        `Nur ${report.fold.messages.length} Nachrichten. Ereignisse: ${report.events
          .map((event) => `${event.seq}:${event.type}`)
          .join(', ')}\nDatei:\n${raw}`,
      )
    }
    expect(report.problems).toEqual([])
    expect(report.foldProblems).toEqual([])
    expect(report.fold.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
  })

  test('der Verlauf aus der Datei ist mit dem aus dem Speicher identisch', async () => {
    const fake: FakeRecorder = { bodies: [], paths: [], headers: [] }
    const file = fileTool()
    const deepseek = new DeepSeekProvider(
      { apiKey: 'k', baseUrl: 'https://attrappe.invalid/v1' },
      fakeFetch([chatToolCall('c9', 'read_file', { path: 'a.txt' }), chatText('gelesen')], fake),
    )
    const loop = new AgentLoop({
      provider: deepseek,
      tools: new Tools([file.tool]),
      model: 'deepseek-chat',
      system: 'S',
    })
    const writer = await createSession({ root, id: 'kette-3', model: 'deepseek-chat', cwd: '/w', now: NOW })
    const { events } = await runTurn(loop, 'lies a.txt')
    await writeEvents(writer, loop, events, 2)
    await writer.close()

    const report = await readSession(root, 'kette-3')
    const fromMemory: readonly Message[] = loop.history()
    const fromFile = report.fold.messages

    expect(fromFile.map((message) => message.role)).toEqual(fromMemory.map((message) => message.role))
    expect(fromFile.map((message) => messageText(message))).toEqual(fromMemory.map((message) => messageText(message)))
    expect(fromFile.flatMap((message) => messageToolCalls(message))).toEqual(
      fromMemory.flatMap((message) => messageToolCalls(message)),
    )
    expect(fromFile.flatMap((message) => messageToolResults(message))).toEqual(
      fromMemory.flatMap((message) => messageToolResults(message)),
    )
  })

  test('ein endgültig abgelehnter Aufruf (400) wird nicht wiederholt und benannt', async () => {
    const fake: FakeRecorder = { bodies: [], paths: [], headers: [] }
    const deepseek = new DeepSeekProvider(
      { apiKey: 'k', baseUrl: 'https://attrappe.invalid/v1' },
      fakeFetch([{ status: 400, text: '{"error":{"message":"messages: tool_call_id unbekannt"}}' }], fake),
    )
    const waited: number[] = []
    const provider = new RetryProvider({
      inner: deepseek,
      sleep: (ms): Promise<void> => {
        waited.push(ms)
        return Promise.resolve()
      },
    })
    const { result } = await runTurn(new AgentLoop({ provider, model: 'deepseek-chat' }), 'x')

    expect(result.reason).toBe('error')
    expect(result.error?.kind).toBe('rejected')
    expect(result.error?.providerCode).toBe('400')
    // Genau **ein** HTTP-Aufruf: eine abgelehnte Anfrage wird nicht wiederholt.
    expect(fake.paths).toHaveLength(1)
    expect(waited).toEqual([])
  })

  test('ein Abbruch mitten im Turn endet benannt und hinterlässt einen zuordenbaren Verlauf', async () => {
    const fake: FakeRecorder = { bodies: [], paths: [], headers: [] }
    const controller = new AbortController()
    const { tool } = fileTool()
    const slow: AgentTool = {
      ...tool,
      execute: (args): Promise<string> => {
        controller.abort()
        return Promise.resolve(`Inhalt von ${String(args.path)}`)
      },
    }
    const deepseek = new DeepSeekProvider(
      { apiKey: 'k', baseUrl: 'https://attrappe.invalid/v1' },
      fakeFetch([chatToolCall('c1', 'read_file', { path: 'a.txt' }), chatText('nie erreicht')], fake),
    )
    const loop = new AgentLoop({ provider: deepseek, tools: new Tools([slow]), model: 'deepseek-chat' })
    const writer = await createSession({ root, id: 'kette-4', model: 'deepseek-chat', cwd: '/w', now: NOW })
    const { result, events } = await runTurn(loop, 'lies', controller.signal)
    await writeEvents(writer, loop, events, 2)
    await writer.close()

    expect(result.reason).toBe('aborted')
    const report = await readSession(root, 'kette-4')
    expect(report.problems).toEqual([])
    expect(report.foldProblems).toEqual([])
    expect(checkHistory(report.fold.messages)).toEqual([])
    expect(report.fold.lastTurnReason).toBe('aborted')
    // Nur **ein** HTTP-Aufruf: nach dem Abbruch wird nicht weitergefragt.
    expect(fake.paths).toHaveLength(1)
  })

  test('die Wiederholung scheitert sichtbar, wenn der Anbieter dauerhaft überlastet ist', async () => {
    const fake: FakeRecorder = { bodies: [], paths: [], headers: [] }
    const deepseek = new DeepSeekProvider(
      { apiKey: 'k', baseUrl: 'https://attrappe.invalid/v1' },
      fakeFetch([overloaded()], fake),
    )
    const waited: number[] = []
    const provider = new RetryProvider({
      inner: deepseek,
      policy: { maxAttempts: 3, baseDelayMs: 100, multiplier: 2, jitter: 'none' },
      sleep: (ms): Promise<void> => {
        waited.push(ms)
        return Promise.resolve()
      },
    })
    const { result } = await runTurn(new AgentLoop({ provider, model: 'deepseek-chat' }), 'x')

    expect(result.reason).toBe('error')
    expect(result.error).toBeInstanceOf(LlmError)
    expect(result.error?.kind).toBe('unavailable')
    expect(fake.paths).toHaveLength(3)
    expect(waited).toEqual([100, 200])
    expect((result.error as { attempts?: number }).attempts).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Kleine Helfer für die Persistenz im Test
// ---------------------------------------------------------------------------

/** Die nächste freie Zeilennummer nach den gelesenen Ereignissen. */
function nextSeqOf(events: readonly ReadEvent[]): number {
  const highest = events.reduce((max, event) => (event.seq > max ? event.seq : max), 0)
  return highest + 1
}

/**
 * Schreibt die Ereignisse eines Turns in die Sitzung.
 *
 * **Die Aufrufe kommen aus dem Verlauf des Loops**, nicht aus dem Ereignis: das
 * Ereignis trägt nur die Namen, das Format braucht Kennung und Argumente. Der
 * Verlauf ist die Stelle, an der eine echte Anwendung sie ebenfalls herbekommt.
 * Ein Zähler je Werkzeugname ordnet sie den Antworten richtig zu — auch wenn
 * dasselbe Werkzeug mehrfach gerufen wird.
 */
async function writeEvents(
  writer: SessionWriter,
  loop: AgentLoop,
  events: readonly AgentEvent[],
  startSeq: number,
): Promise<void> {
  const callsByName = new Map<string, { id: string; name: string; arguments: Readonly<Record<string, unknown>> }[]>()
  for (const message of loop.history()) {
    for (const part of messageToolCalls(message)) {
      const list = callsByName.get(part.name) ?? []
      list.push({ id: part.callId, name: part.name, arguments: part.arguments })
      callsByName.set(part.name, list)
    }
  }
  const used = new Map<string, number>()

  let seq = startSeq
  for (const event of events) {
    let calls: readonly { id: string; name: string; arguments: Readonly<Record<string, unknown>> }[] = []
    if (event.type === 'model-reply') {
      for (const name of event.toolNames) {
        const index = used.get(name) ?? 0
        const call = (callsByName.get(name) ?? [])[index]
        if (call !== undefined) calls = [...calls, call]
        used.set(name, index + 1)
      }
    }
    const line = toSessionEvent(event, seq, AT, calls)
    if (line === undefined) continue
    await writer.append(line)
    seq += 1
  }
}
