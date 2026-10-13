/**
 * Tests für den Agent-Loop.
 *
 * **Worauf diese Tests zielen.** Nicht „das Modell antwortet", sondern die
 * Stellen, an denen ein Loop **nicht endet** oder einen **Verlauf ohne
 * Zuordnung** hinterlässt:
 *
 * - ein Modell, das immer wieder dasselbe unbekannte Werkzeug verlangt
 * - ein Werkzeug, das wirft
 * - ein Abbruch mitten in einer Werkzeugrunde
 * - eine leere Antwort
 * - ein Anbieter, der scheitert
 *
 * **Kein Netz, kein Schlüssel, keine Wartezeit.** Der Anbieter ist eine
 * Attrappe mit vorgegebener Antwortfolge; die Werkzeuge sind Funktionen.
 */

import { describe, expect, test } from 'bun:test'
import { Tools, clampResult, emptyTools, executeToolCall, toolSpecs, type AgentTool } from '@prometheus-harness/agent-tools'
import {
  LlmError,
  assistantMessage,
  checkHistory,
  messageText,
  messageToolCalls,
  textMessage,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
  type Message,
} from '@prometheus-harness/llm'
import {
  AgentLoop,
  isFailureText,
  runTurn,
  transcript,
  type AgentEvent,
} from '../src/index.ts'

// ---------------------------------------------------------------------------
// Prüfgerüst
// ---------------------------------------------------------------------------

/** Ein Anbieter mit vorgegebener Antwortfolge; danach wiederholt sich die letzte. */
class ScriptedProvider implements LlmProvider {
  readonly name = 'scripted'
  readonly requests: CompletionRequest[] = []
  #index = 0
  readonly #answers: readonly CompletionResult[]

  constructor(answers: readonly CompletionResult[]) {
    if (answers.length === 0) throw new Error('Skript ohne Antworten')
    this.#answers = answers
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    this.requests.push(request)
    const answer = this.#answers[Math.min(this.#index, this.#answers.length - 1)]
    this.#index += 1
    if (answer === undefined) throw new Error('keine Antwort vorbereitet')
    return answer
  }
}

/** Ein Anbieter, der seine Antwort aus der laufenden Nummer der Anfrage baut. */
class CountingProvider implements LlmProvider {
  readonly name = 'counting'
  readonly requests: CompletionRequest[] = []
  readonly #make: (index: number) => CompletionResult

  constructor(make: (index: number) => CompletionResult) {
    this.#make = make
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    this.requests.push(request)
    return this.#make(this.requests.length)
  }
}

/** Ein Anbieter, der immer scheitert. */
class FailingProvider implements LlmProvider {
  readonly name = 'failing'
  constructor(private readonly error: Error) {}
  complete(): Promise<CompletionResult> {
    return Promise.reject(this.error)
  }
}

/** Eine Textantwort. */
function textAnswer(text: string, usage?: { inputTokens: number; outputTokens: number }): CompletionResult {
  return usage === undefined
    ? { text, toolCalls: [], finishReason: 'stop', model: 'm' }
    : { text, toolCalls: [], finishReason: 'stop', model: 'm', usage }
}

/** Eine Antwort, die ein Werkzeug verlangt. */
function callAnswer(name: string, args: Readonly<Record<string, unknown>> = {}, id = 'c1'): CompletionResult {
  return {
    text: '',
    toolCalls: [{ id, name, arguments: args }],
    finishReason: 'tool-calls',
    model: 'm',
  }
}

/** Eine Antwort, die zwei Werkzeuge verlangt. */
function twoCallAnswer(): CompletionResult {
  return {
    text: '',
    toolCalls: [
      { id: 'c1', name: 'lesen', arguments: { pfad: 'a.txt' } },
      { id: 'c2', name: 'lesen', arguments: { pfad: 'b.txt' } },
    ],
    finishReason: 'tool-calls',
    model: 'm',
  }
}

/** Ein Werkzeug, das festhält, womit es gerufen wurde. */
function recordingTool(
  name: string,
  impl: (args: Readonly<Record<string, unknown>>) => Promise<string>,
): { readonly tool: AgentTool; readonly calls: Readonly<Record<string, unknown>>[] } {
  const calls: Readonly<Record<string, unknown>>[] = []
  return {
    calls,
    tool: {
      name,
      description: `${name} beschreibung`,
      parameters: { type: 'object' },
      execute: (args): Promise<string> => {
        calls.push(args)
        return impl(args)
      },
    },
  }
}

/** Der Standard-Loop für Tests ohne Werkzeuge. */
function loopWith(provider: LlmProvider, options: Partial<Parameters<typeof makeLoop>[1]> = {}): AgentLoop {
  return makeLoop(provider, options)
}

interface LoopExtras {
  readonly tools: Tools
  readonly model: string
  readonly maxSteps: number
  readonly system: string
  readonly meter: { readonly budgetInputTokens: number }
}

function makeLoop(provider: LlmProvider, extras: Partial<LoopExtras> = {}): AgentLoop {
  const base = {
    provider,
    tools: extras.tools ?? emptyTools(),
    model: extras.model ?? 'test-modell',
  }
  return new AgentLoop({
    ...base,
    ...(extras.maxSteps === undefined ? {} : { maxSteps: extras.maxSteps }),
    ...(extras.system === undefined ? {} : { system: extras.system }),
    ...(extras.meter === undefined ? {} : { meter: extras.meter }),
  })
}

/** Die Ereignisarten in Reihenfolge. */
function typesOf(events: readonly AgentEvent[]): string[] {
  return events.map((event) => event.type)
}

// ---------------------------------------------------------------------------
// Werkzeug-Registry
// ---------------------------------------------------------------------------

describe('Werkzeug-Registry', () => {
  test('lehnt einen doppelten Namen beim Bauen ab — ein Programmierfehler, kein Modellfehler', () => {
    const a: AgentTool = { name: 'x', description: '', parameters: {}, execute: () => Promise.resolve('') }
    const b: AgentTool = { name: 'x', description: 'andere', parameters: {}, execute: () => Promise.resolve('') }
    expect(() => new Tools([a, b])).toThrow('doppelt')
  })

  test('lehnt einen leeren Namen ab', () => {
    const bare: AgentTool = { name: '', description: '', parameters: {}, execute: () => Promise.resolve('') }
    expect(() => new Tools([bare])).toThrow('ohne Namen')
  })

  test('behält die Reihenfolge bei — sie geht in jede Anfrage', () => {
    const { tool: a } = recordingTool('a', () => Promise.resolve(''))
    const { tool: b } = recordingTool('b', () => Promise.resolve(''))
    const registry = new Tools([b, a])
    expect(registry.list().map((entry) => entry.name)).toEqual(['b', 'a'])
    expect(toolSpecs(registry).map((spec) => spec.name)).toEqual(['b', 'a'])
  })

  test('with gibt eine neue Registry zurück und lässt die alte unverändert', () => {
    const { tool: a } = recordingTool('a', () => Promise.resolve(''))
    const { tool: b } = recordingTool('b', () => Promise.resolve(''))
    const first = new Tools([a])
    const second = first.with(b)
    expect(first.size).toBe(1)
    expect(second.size).toBe(2)
  })

  test('get findet ein Werkzeug, size zählt', () => {
    const { tool } = recordingTool('lesen', () => Promise.resolve(''))
    const registry = new Tools([tool])
    expect(registry.get('lesen')?.name).toBe('lesen')
    expect(registry.get('gibtsnicht')).toBeUndefined()
    expect(registry.size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Werkzeugaufruf ausführen
// ---------------------------------------------------------------------------

describe('Werkzeugaufruf ausführen', () => {
  test('gibt den Text eines erfolgreichen Werkzeugs zurück', async () => {
    const { tool, calls } = recordingTool('lesen', (args) => Promise.resolve(`Inhalt von ${String(args.pfad)}`))
    const part = await executeToolCall(new Tools([tool]), { id: 'c1', name: 'lesen', arguments: { pfad: 'a.txt' } }, { step: 1, signal: undefined })
    expect(part).toEqual({ type: 'tool-result', callId: 'c1', content: 'Inhalt von a.txt' })
    expect(calls).toEqual([{ pfad: 'a.txt' }])
  })

  test('ein unbekanntes Werkzeug wird zum Ergebnis mit der Liste der verfügbaren', async () => {
    const { tool } = recordingTool('lesen', () => Promise.resolve(''))
    const part = await executeToolCall(new Tools([tool]), { id: 'c1', name: 'loeschen', arguments: {} }, { step: 1, signal: undefined })
    expect(part.content).toContain('Unbekanntes Werkzeug "loeschen"')
    expect(part.content).toContain('Verfügbar: lesen')
  })

  test('ohne Werkzeuge sagt das Ergebnis das ausdrücklich', async () => {
    const part = await executeToolCall(emptyTools(), { id: 'c1', name: 'x', arguments: {} }, { step: 1, signal: undefined })
    expect(part.content).toBe('Unbekanntes Werkzeug "x". Es ist kein Werkzeug eingehängt.')
  })

  test('ein werfendes Werkzeug wird zum Ergebnis, nicht zum Absturz', async () => {
    const { tool } = recordingTool('kaputt', () => Promise.reject(new Error('Platte weg')))
    const part = await executeToolCall(new Tools([tool]), { id: 'c1', name: 'kaputt', arguments: {} }, { step: 1, signal: undefined })
    expect(part.content).toBe('Werkzeug "kaputt" ist gescheitert: Platte weg')
  })

  test('ein bereits abgebrochener Aufruf startet das Werkzeug nicht', async () => {
    const { tool, calls } = recordingTool('lesen', () => Promise.resolve('x'))
    const controller = new AbortController()
    controller.abort()
    const part = await executeToolCall(new Tools([tool]), { id: 'c1', name: 'lesen', arguments: {} }, { step: 1, signal: controller.signal })
    expect(calls).toHaveLength(0)
    expect(part.content).toContain('vor dem Start abgebrochen')
  })

  test('ein überlanges Ergebnis wird gekürzt, mit sichtbarem Vermerk', () => {
    const long = 'a'.repeat(MAX_FOR_TEST + 10)
    const clamped = clampResult(long, MAX_FOR_TEST)
    expect(clamped).toHaveLength(MAX_FOR_TEST + '… [gekürzt: 10 Zeichen]'.length)
    expect(clamped).toContain('[gekürzt: 10 Zeichen]')
  })

  test('ein Ergebnis genau an der Grenze wird nicht angetastet', () => {
    const exact = 'a'.repeat(100)
    expect(clampResult(exact, 100)).toBe(exact)
  })

  test('erkennt Fehlertexte für die Anzeige', () => {
    expect(isFailureText('Unbekanntes Werkzeug "x". Verfügbar: y', 'x')).toBe(true)
    expect(isFailureText('Werkzeug "x" ist gescheitert: kaputt', 'x')).toBe(true)
    expect(isFailureText('Werkzeug "x" wurde vor dem Start abgebrochen', 'x')).toBe(true)
    expect(isFailureText('Nicht ausgeführt: der Turn wurde abgebrochen', 'x')).toBe(true)
    expect(isFailureText('Inhalt von a.txt', 'x')).toBe(false)
  })
})

/** Grenze für den Kürzen-Test, bewusst klein. */
const MAX_FOR_TEST = 64

// ---------------------------------------------------------------------------
// Loop: die einfachen Fälle
// ---------------------------------------------------------------------------

describe('Loop: einfache Turns', () => {
  test('eine Textantwort beendet den Turn mit stop', async () => {
    const provider = new ScriptedProvider([textAnswer('Hallo zurück')])
    const loop = loopWith(provider)
    const { events, result } = await runTurn(loop, 'Hallo')
    expect(result.reason).toBe('stop')
    expect(result.text).toBe('Hallo zurück')
    expect(result.steps).toBe(1)
    expect(result.error).toBeUndefined()
    expect(typesOf(events)).toEqual([
      'user-input', 'turn-start', 'step-start', 'model-reply', 'usage', 'turn-end',
    ])
  })

  test('meldet die Eingabe des Benutzers als eigenes Ereignis — sonst fehlt sie in der Sitzung', async () => {
    const provider = new ScriptedProvider([textAnswer('a')])
    const loop = loopWith(provider)
    const { events } = await runTurn(loop, 'die Frage')
    const input = events.find((event) => event.type === 'user-input')
    expect(input?.type === 'user-input' && input.text).toBe('die Frage')
    // Und sie steht **vor** dem Turn-Beginn: der Verlauf beginnt mit ihr.
    expect(typesOf(events).indexOf('user-input')).toBeLessThan(typesOf(events).indexOf('turn-start'))
  })

  test('meldet die Systemanweisung genau einmal — beim ersten Turn', async () => {
    const provider = new ScriptedProvider([textAnswer('a'), textAnswer('b')])
    const loop = makeLoop(provider, { system: 'Du bist knapp.' })
    const first = await runTurn(loop, 'eins')
    const second = await runTurn(loop, 'zwei')
    expect(first.events.filter((event) => event.type === 'system-prompt')).toHaveLength(1)
    expect(second.events.filter((event) => event.type === 'system-prompt')).toHaveLength(0)
    // Und ohne Systemanweisung gibt es das Ereignis gar nicht.
    const bare = await runTurn(loopWith(new ScriptedProvider([textAnswer('c')])), 'x')
    expect(bare.events.filter((event) => event.type === 'system-prompt')).toHaveLength(0)
  })

  test('führt die Turn-Nummer mit und zählt bei firstTurn weiter', async () => {
    const provider = new ScriptedProvider([textAnswer('a')])
    const loop = makeLoop(provider, {})
    expect(loop.turnNumber).toBe(0)
    const first = await runTurn(loop, 'eins')
    expect(loop.turnNumber).toBe(1)
    const start = first.events.find((event) => event.type === 'turn-start')
    expect(start?.type === 'turn-start' && start.turn).toBe(1)

    const continued = new AgentLoop({
      provider: new ScriptedProvider([textAnswer('b')]),
      model: 'test-modell',
      firstTurn: 7,
    })
    const next = await runTurn(continued, 'sieben')
    const startNext = next.events.find((event) => event.type === 'turn-start')
    expect(startNext?.type === 'turn-start' && startNext.turn).toBe(7)
  })

  test('lehnt firstTurn unter 1 ab', () => {
    expect(
      () => new AgentLoop({ provider: new ScriptedProvider([textAnswer('x')]), model: 'm', firstTurn: 0 }),
    ).toThrow(RangeError)
  })

  test('merkt sich die Sitzungskennung', () => {
    expect(makeLoop(new ScriptedProvider([textAnswer('x')]), {}).sessionId).toBeUndefined()
    const named = new AgentLoop({ provider: new ScriptedProvider([textAnswer('x')]), model: 'm', sessionId: 's1' })
    expect(named.sessionId).toBe('s1')
  })

  test('events() gibt die Ereignisse des letzten Turns — als Kopie', async () => {
    const loop = loopWith(new ScriptedProvider([textAnswer('a')]))
    await runTurn(loop, 'eins')
    const first = loop.events()
    expect(first.length).toBeGreaterThan(0)
    first.push({ type: 'step-start', turn: 99, step: 99 })
    expect(loop.events()).toHaveLength(first.length - 1)
    // Der nächste Turn ersetzt die Liste — sie sammelt sich nicht an.
    await runTurn(loop, 'zwei')
    const turns = loop
      .events()
      .filter((event): event is Extract<AgentEvent, { turn: number }> => 'turn' in event)
      .map((event) => event.turn)
    expect(turns.every((turn) => turn === 2)).toBe(true)
    expect(turns.length).toBeGreaterThan(0)
  })

  test('die Systemanweisung steht einmal am Anfang und wird nicht wiederholt', async () => {
    const provider = new ScriptedProvider([textAnswer('a'), textAnswer('b')])
    const loop = makeLoop(provider, { system: 'Du bist knapp.' })
    await runTurn(loop, 'erstens')
    await runTurn(loop, 'zweitens')
    const history = loop.history()
    expect(history.filter((message) => message.role === 'system')).toHaveLength(1)
    expect(history[0]?.role).toBe('system')
    expect(history[1]?.role).toBe('user')
    expect(history[2]?.role).toBe('assistant')
    expect(history[3]?.role).toBe('user')
  })

  test('eine leere Antwort beendet den Turn mit empty-reply, nicht mit stop', async () => {
    const provider = new ScriptedProvider([textAnswer('')])
    const { result } = await runTurn(loopWith(provider), 'Hallo')
    expect(result.reason).toBe('empty-reply')
    expect(result.text).toBe('')
  })

  test('gibt der Anfrage Modell und Werkzeugbeschreibungen mit', async () => {
    const { tool } = recordingTool('lesen', () => Promise.resolve(''))
    const provider = new ScriptedProvider([textAnswer('ok')])
    const loop = makeLoop(provider, { tools: new Tools([tool]), model: 'deepseek-chat' })
    await runTurn(loop, 'x')
    expect(provider.requests[0]?.model).toBe('deepseek-chat')
    expect(provider.requests[0]?.tools?.map((spec) => spec.name)).toEqual(['lesen'])
  })

  test('ohne Werkzeuge steht kein tools-Feld in der Anfrage', async () => {
    const provider = new ScriptedProvider([textAnswer('ok')])
    await runTurn(loopWith(provider), 'x')
    expect(provider.requests[0]?.tools).toBeUndefined()
  })

  test('reicht das Abbruchsignal an die Anfrage durch', async () => {
    const provider = new ScriptedProvider([textAnswer('ok')])
    const controller = new AbortController()
    await runTurn(loopWith(provider), 'x', controller.signal)
    expect(provider.requests[0]?.signal).toBe(controller.signal)
  })
})

// ---------------------------------------------------------------------------
// Loop: Werkzeugrunden
// ---------------------------------------------------------------------------

describe('Loop: Werkzeugrunden', () => {
  test('führt ein verlangtes Werkzeug aus und fragt danach erneut', async () => {
    const { tool, calls } = recordingTool('lesen', () => Promise.resolve('Inhalt'))
    const provider = new ScriptedProvider([callAnswer('lesen', { pfad: 'a.txt' }), textAnswer('Fertig')])
    const loop = makeLoop(provider, { tools: new Tools([tool]) })
    const { events, result } = await runTurn(loop, 'lies a.txt')
    expect(result.reason).toBe('stop')
    expect(result.steps).toBe(2)
    expect(result.text).toBe('Fertig')
    expect(calls).toEqual([{ pfad: 'a.txt' }])
    expect(typesOf(events)).toEqual([
      'user-input', 'turn-start', 'step-start', 'model-reply', 'tool-result', 'usage',
      'step-start', 'model-reply', 'usage', 'turn-end',
    ])
  })

  test('der Verlauf trägt den Aufruf VOR dem Ergebnis — sonst ist er nicht zuordenbar', async () => {
    const { tool } = recordingTool('lesen', () => Promise.resolve('Inhalt'))
    const provider = new ScriptedProvider([callAnswer('lesen'), textAnswer('Fertig')])
    const loop = makeLoop(provider, { tools: new Tools([tool]) })
    await runTurn(loop, 'lies')
    const history = loop.history()
    const assistantIndex = history.findIndex((message) => messageToolCalls(message).length > 0)
    const toolIndex = history.findIndex((message) => message.role === 'tool')
    expect(assistantIndex).toBeGreaterThanOrEqual(0)
    expect(toolIndex).toBeGreaterThan(assistantIndex)
    expect(checkHistory(history)).toEqual([])
  })

  test('die zweite Anfrage enthält den Aufruf und das Ergebnis', async () => {
    const { tool } = recordingTool('lesen', () => Promise.resolve('Inhalt'))
    const provider = new ScriptedProvider([callAnswer('lesen', { pfad: 'a.txt' }, 'c7'), textAnswer('Fertig')])
    const loop = makeLoop(provider, { tools: new Tools([tool]) })
    await runTurn(loop, 'lies')
    const second = provider.requests[1]
    expect(second).toBeDefined()
    const messages = second?.messages ?? []
    const assistant = messages.find((message) => messageToolCalls(message).length > 0)
    expect(messageToolCalls(assistant as Message)[0]?.callId).toBe('c7')
    expect(messageToolCalls(assistant as Message)[0]?.arguments).toEqual({ pfad: 'a.txt' })
    const toolMessage = messages.find((message) => message.role === 'tool')
    expect(toolMessage?.parts).toEqual([{ type: 'tool-result', callId: 'c7', content: 'Inhalt' }])
  })

  test('behält Text und Aufruf derselben Antwort zusammen', async () => {
    const { tool } = recordingTool('lesen', () => Promise.resolve('Inhalt'))
    const provider = new ScriptedProvider([
      { text: 'Ich sehe nach.', toolCalls: [{ id: 'c1', name: 'lesen', arguments: {} }], finishReason: 'tool-calls', model: 'm' },
      textAnswer('Fertig'),
    ])
    const loop = makeLoop(provider, { tools: new Tools([tool]) })
    await runTurn(loop, 'lies')
    const assistant = loop.history().find((message) => messageToolCalls(message).length > 0)
    expect(messageText(assistant as Message)).toBe('Ich sehe nach.')
    expect(messageToolCalls(assistant as Message)).toHaveLength(1)
  })

  test('zwei Aufrufe in einer Antwort ergeben zwei Ergebnisse mit derselben Kennung', async () => {
    const { tool, calls } = recordingTool('lesen', (args) => Promise.resolve(`Inhalt ${String(args.pfad)}`))
    const provider = new ScriptedProvider([twoCallAnswer(), textAnswer('Fertig')])
    const loop = makeLoop(provider, { tools: new Tools([tool]) })
    const { result } = await runTurn(loop, 'lies beide')
    expect(calls).toHaveLength(2)
    const toolMessage = loop.history().find((message) => message.role === 'tool')
    expect(toolMessage?.parts).toEqual([
      { type: 'tool-result', callId: 'c1', content: 'Inhalt a.txt' },
      { type: 'tool-result', callId: 'c2', content: 'Inhalt b.txt' },
    ])
    expect(checkHistory(loop.history())).toEqual([])
    expect(result.reason).toBe('stop')
  })

  test('ein unbekanntes Werkzeug beendet den Turn nicht — das Modell kann sich korrigieren', async () => {
    const { tool } = recordingTool('lesen', () => Promise.resolve('Inhalt'))
    const provider = new ScriptedProvider([callAnswer('loeschen'), textAnswer('Dann eben nicht.')])
    const loop = makeLoop(provider, { tools: new Tools([tool]) })
    const { events, result } = await runTurn(loop, 'lösch was')
    expect(result.reason).toBe('stop')
    const toolEvent = events.find((event) => event.type === 'tool-result')
    expect(toolEvent?.type === 'tool-result' && toolEvent.failed).toBe(true)
    expect(result.steps).toBe(2)
  })

  test('ein werfendes Werkzeug beendet den Turn nicht', async () => {
    const { tool } = recordingTool('kaputt', () => Promise.reject(new Error('Platte weg')))
    const provider = new ScriptedProvider([callAnswer('kaputt'), textAnswer('Verstanden.')])
    const loop = makeLoop(provider, { tools: new Tools([tool]) })
    const { result } = await runTurn(loop, 'mach was')
    expect(result.reason).toBe('stop')
    expect(result.steps).toBe(2)
  })

  test('das Modell dreht sich im Kreis: der Turn endet mit max-steps, nicht nie', async () => {
    // Der Anbieter verlangt in **jeder** Runde dasselbe unbekannte Werkzeug —
    // aber mit einer eigenen Aufruf-Kennung. Dieselbe Kennung zweimal wäre ein
    // anderer Fehler (der Verlauf wäre nicht mehr zuordenbar, siehe unten).
    const provider = new CountingProvider((index) => ({
      text: '',
      toolCalls: [{ id: `c${index}`, name: 'gibtsnicht', arguments: {} }],
      finishReason: 'tool-calls',
      model: 'm',
    }))
    const loop = makeLoop(provider, { maxSteps: 4 })
    const { events, result } = await runTurn(loop, 'mach')
    if (result.reason !== 'max-steps') {
      throw new Error(`Turn endete mit ${result.reason}: ${result.error?.kind ?? ''} ${result.error?.message ?? ''}`)
    }
    expect(result.steps).toBe(4)
    expect(result.steps).toBe(4)
    expect(provider.requests).toHaveLength(4)
    // Vier Runden, vier Ergebnisse — und ein Verlauf, der zuordenbar bleibt.
    expect(loop.history().filter((message) => message.role === 'tool')).toHaveLength(4)
    expect(checkHistory(loop.history())).toEqual([])
    const end = events.at(-1)
    expect(end?.type === 'turn-end' && end.reason).toBe('max-steps')
  })

  test('maxSteps unter 1 wird beim Bauen abgelehnt', () => {
    expect(() => makeLoop(new ScriptedProvider([textAnswer('x')]), { maxSteps: 0 })).toThrow(RangeError)
  })
})

// ---------------------------------------------------------------------------
// Loop: Fehler und Abbruch
// ---------------------------------------------------------------------------

describe('Loop: Fehler und Abbruch', () => {
  test('ein Anbieterfehler beendet den Turn mit error und nennt ihn', async () => {
    const provider = new FailingProvider(new LlmError('unavailable', 'überlastet'))
    const { events, result } = await runTurn(loopWith(provider), 'x')
    expect(result.reason).toBe('error')
    expect(result.error?.kind).toBe('unavailable')
    expect(result.steps).toBe(1)
    const end = events.at(-1)
    expect(end?.type === 'turn-end' && end.error?.message).toBe('überlastet')
  })

  test('ein anbieterfremder Fehler wird in malformed gehüllt', async () => {
    const provider = new FailingProvider(new TypeError('x ist kein Feld'))
    const { result } = await runTurn(loopWith(provider), 'x')
    expect(result.error?.kind).toBe('malformed')
    expect(result.error?.message).toContain('x ist kein Feld')
  })

  test('ein Abbruch vor dem Turn beendet ihn mit aborted, ohne den Anbieter zu fragen', async () => {
    const provider = new ScriptedProvider([textAnswer('egal')])
    const controller = new AbortController()
    controller.abort()
    const { result } = await runTurn(loopWith(provider), 'x', controller.signal)
    expect(result.reason).toBe('aborted')
    expect(provider.requests).toHaveLength(0)
  })

  test('ein Abbruch während einer Werkzeugrunde füllt die offenen Aufrufe auf', async () => {
    const controller = new AbortController()
    // Das erste Werkzeug bricht den Turn ab; der zweite Aufruf derselben
    // Antwort darf nicht einfach fehlen — sonst zeigt ein Ergebnis auf keinen
    // Aufruf mehr, und der nächste Anbieteraufruf wäre nicht zuordenbar.
    const first = recordingTool('eins', () => {
      controller.abort()
      return Promise.resolve('erstes fertig')
    })
    const second = recordingTool('zwei', () => Promise.resolve('zweites'))
    const provider = new ScriptedProvider([
      {
        text: '',
        toolCalls: [
          { id: 'c1', name: 'eins', arguments: {} },
          { id: 'c2', name: 'zwei', arguments: {} },
        ],
        finishReason: 'tool-calls',
        model: 'm',
      },
      textAnswer('nie erreicht'),
    ])
    const loop = makeLoop(provider, { tools: new Tools([first.tool, second.tool]) })
    const { events, result } = await runTurn(loop, 'x', controller.signal)
    expect(result.reason).toBe('aborted')
    const toolMessage = loop.history().find((message) => message.role === 'tool')
    expect(toolMessage?.parts).toEqual([
      { type: 'tool-result', callId: 'c1', content: 'erstes fertig' },
      { type: 'tool-result', callId: 'c2', content: 'Nicht ausgeführt: der Turn wurde abgebrochen' },
    ])
    expect(checkHistory(loop.history())).toEqual([])
    // Nur das ausgeführte Werkzeug meldet ein Ereignis; der Platzhalter ist
    // kein Lauf, sondern ein Vermerk.
    const results = events.filter((event) => event.type === 'tool-result')
    expect(results).toHaveLength(1)
    expect(second.calls).toHaveLength(0)
  })

  test('ein Abbruch nach dem ausführenden Werkzeug beendet den Turn, statt weiterzufragen', async () => {
    const controller = new AbortController()
    const { tool } = recordingTool('lesen', () => {
      controller.abort()
      return Promise.resolve('Inhalt')
    })
    const provider = new ScriptedProvider([callAnswer('lesen'), textAnswer('sollte nicht kommen')])
    const loop = makeLoop(provider, { tools: new Tools([tool]) })
    const { result } = await runTurn(loop, 'lies', controller.signal)
    expect(result.reason).toBe('aborted')
    expect(provider.requests).toHaveLength(1)
  })

  test('ein beschädigter Verlauf wird beim Aufnehmen abgelehnt', () => {
    const loop = loopWith(new ScriptedProvider([textAnswer('x')]))
    const broken: Message[] = [
      textMessage('user', 'x'),
      { role: 'tool', parts: [{ type: 'tool-result', callId: 'nie-gerufen', content: 'x' }] },
    ]
    expect(() => loop.loadHistory(broken)).toThrow(LlmError)
    expect(() => loop.loadHistory(broken)).toThrow('nicht zuordenbar')
  })

  test('ein gültiger Verlauf wird aufgenommen und fortgesetzt', async () => {
    const provider = new ScriptedProvider([textAnswer('weiter')])
    const loop = loopWith(provider)
    const loaded: Message[] = [
      textMessage('system', 'Du bist knapp.'),
      textMessage('user', 'alt'),
      assistantMessage(textAnswer('alt geantwortet')),
    ]
    loop.loadHistory(loaded)
    await runTurn(loop, 'neu')
    expect(loop.history()).toHaveLength(5)
    // Die Systemanweisung des aufgenommenen Verlaufs wird nicht verdoppelt.
    expect(loop.history().filter((message) => message.role === 'system')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Loop: Zählung und Verlauf
// ---------------------------------------------------------------------------

describe('Loop: Zählung und Verlauf', () => {
  test('übernimmt eine gemeldete Zählung und meldet sie als gemeldet', async () => {
    const provider = new ScriptedProvider([textAnswer('ok', { inputTokens: 40, outputTokens: 5 })])
    const loop = loopWith(provider)
    const { events, result } = await runTurn(loop, 'x')
    expect(result.usage.inputTokens).toBe(40)
    expect(result.usage.method).toBe('reported')
    const usage = events.find((event) => event.type === 'usage')
    expect(usage?.type === 'usage' && usage.line).toContain('gemeldet')
  })

  test('zählt über mehrere Steps und meldet die Grenze, ohne zu verbieten', async () => {
    const { tool } = recordingTool('lesen', () => Promise.resolve('Inhalt'))
    const provider = new ScriptedProvider([
      callAnswer('lesen'),
      textAnswer('Fertig', { inputTokens: 60, outputTokens: 5 }),
    ])
    const loop = makeLoop(provider, { tools: new Tools([tool]), meter: { budgetInputTokens: 50 } })
    const { result } = await runTurn(loop, 'lies')
    expect(result.reason).toBe('stop')
    // Der erste Step hatte keine Meldung (geschätzt), der zweite 60 (gemeldet).
    expect(result.usage.method).toBe('mixed')
    expect(result.usage.inputTokens).toBeGreaterThan(50)
    expect(result.usage.overBudget).toBe(true)
    expect(result.usage.requests).toBe(2)
  })

  test('history gibt eine Kopie, nicht das Original', () => {
    const loop = loopWith(new ScriptedProvider([textAnswer('x')]))
    const first = loop.history()
    expect(first).toHaveLength(0)
    first.push(textMessage('user', 'eingeschmuggelt'))
    expect(loop.history()).toHaveLength(0)
  })

  test('reset leert Verlauf und Zähler', async () => {
    const provider = new ScriptedProvider([textAnswer('ok', { inputTokens: 9, outputTokens: 1 })])
    const loop = makeLoop(provider, { system: 'S' })
    await runTurn(loop, 'x')
    loop.reset()
    expect(loop.history()).toHaveLength(0)
    expect(loop.usage().inputTokens).toBe(0)
    // Nach reset wird die Systemanweisung wieder gesetzt.
    await runTurn(loop, 'y')
    expect(loop.history()[0]?.role).toBe('system')
  })

  test('transcript sammelt nur die Assistenten-Texte', async () => {
    const { tool } = recordingTool('lesen', () => Promise.resolve('Inhalt'))
    const provider = new ScriptedProvider([
      { text: 'Ich sehe nach.', toolCalls: [{ id: 'c1', name: 'lesen', arguments: {} }], finishReason: 'tool-calls', model: 'm' },
      textAnswer('Fertig'),
    ])
    const loop = makeLoop(provider, { tools: new Tools([tool]) })
    await runTurn(loop, 'lies')
    expect(transcript(loop.history())).toEqual(['Ich sehe nach.', 'Fertig'])
  })

  test('das model-reply-Ereignis nennt die verlangten Werkzeugnamen', async () => {
    const { tool } = recordingTool('lesen', () => Promise.resolve('Inhalt'))
    const provider = new ScriptedProvider([twoCallAnswer(), textAnswer('Fertig')])
    const loop = makeLoop(provider, { tools: new Tools([tool]) })
    const { events } = await runTurn(loop, 'lies')
    const reply = events.find((event) => event.type === 'model-reply')
    expect(reply?.type === 'model-reply' && reply.toolNames).toEqual(['lesen', 'lesen'])
    expect(reply?.type === 'model-reply' && reply.finishReason).toBe('tool-calls')
    expect(reply?.type === 'model-reply' && reply.reportedUsage).toBe(false)
  })

  test('das tool-result-Ereignis misst eine Laufzeit', async () => {
    const { tool } = recordingTool('langsam', async () => {
      await new Promise((resolve) => setTimeout(resolve, 15))
      return 'da'
    })
    const provider = new ScriptedProvider([callAnswer('langsam'), textAnswer('ok')])
    const loop = makeLoop(provider, { tools: new Tools([tool]) })
    const { events } = await runTurn(loop, 'x')
    const result = events.find((event) => event.type === 'tool-result')
    expect(result?.type === 'tool-result' && result.durationMs).toBeGreaterThanOrEqual(10)
    expect(result?.type === 'tool-result' && result.content).toBe('da')
  })
})
