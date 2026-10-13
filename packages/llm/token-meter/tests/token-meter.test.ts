/**
 * Tests für die Token-Zählung.
 *
 * **Was hier geprüft wird, ist nicht „die Zahl stimmt".** Eine Schätzung kann
 * nicht richtig sein — sie kann nur **als Schätzung gekennzeichnet** sein. Die
 * Tests prüfen deshalb vor allem die **Herkunft**: dass eine gemeldete Zählung
 * übernommen und nicht überschrieben wird, dass eine fehlende als Schätzung
 * erscheint, dass eine gemischte Summe `mixed` heißt, und dass eine kaputte
 * Meldung (`NaN`, `null`, negativ) nicht still in die Summe läuft.
 */

import { describe, expect, test } from 'bun:test'
import type { CompletionRequest, CompletionResult } from '@prometheus-harness/llm'
import {
  HEURISTIC_CHARS_PER_TOKEN,
  HEURISTIC_TOKENS_PER_MESSAGE,
  HEURISTIC_TOKENS_PER_TOOL,
  RecordingTokenMeter,
  createTokenMeter,
  describeMeterState,
  estimateJson,
  estimateMessages,
  estimateRequest,
  heuristicEstimator,
  isUsableUsage,
  methodOf,
} from '../src/index.ts'

/** Eine feste Zählfunktion: ein Token je Zeichen. Damit sind Zahlen prüfbar. */
const onePerChar = (text: string): number => text.length

/** Eine Antwort ohne gemeldete Zählung. */
function resultWithoutUsage(text = '', toolCalls: CompletionResult['toolCalls'] = []): CompletionResult {
  return { text, toolCalls, finishReason: 'stop', model: 'm' }
}

/** Eine Antwort mit gemeldeter Zählung. */
function resultWithUsage(inputTokens: number, outputTokens: number): CompletionResult {
  return { ...resultWithoutUsage('x'), usage: { inputTokens, outputTokens } }
}

/** Eine Anfrage mit einem Text. */
function request(text: string, tools: CompletionRequest['tools'] = []): CompletionRequest {
  return { model: 'm', messages: [{ role: 'user', parts: [{ type: 'text', text }] }], ...(tools.length > 0 ? { tools } : {}) }
}

// ---------------------------------------------------------------------------
// Schätzen
// ---------------------------------------------------------------------------

describe('Schätzen', () => {
  test('rundet auf, damit die Schätzung nicht zu niedrig liegt', () => {
    // 10 Zeichen / 3,5 = 2,857… → 3
    expect(heuristicEstimator('0123456789')).toBe(3)
    expect(heuristicEstimator('012345678')).toBe(3)
    expect(heuristicEstimator('0123456')).toBe(2)
  })

  test('leerer Text kostet nichts', () => {
    expect(heuristicEstimator('')).toBe(0)
  })

  test('die Annahme steht als benannte Konstante — nicht als Zahl in der Rechnung', () => {
    expect(HEURISTIC_CHARS_PER_TOKEN).toBeGreaterThan(0)
    const text = 'a'.repeat(70)
    expect(heuristicEstimator(text)).toBe(Math.ceil(70 / HEURISTIC_CHARS_PER_TOKEN))
  })

  test('zählt den Rahmen jeder Nachricht mit', () => {
    const withoutFrame = estimateMessages([], [], onePerChar)
    expect(withoutFrame).toBe(0)
    const one = estimateMessages([{ role: 'user', parts: [{ type: 'text', text: 'abc' }] }], [], onePerChar)
    expect(one).toBe(HEURISTIC_TOKENS_PER_MESSAGE + 3)
  })

  test('zählt Werkzeugergebnisse als eigenen Text', () => {
    const total = estimateMessages(
      [{ role: 'tool', toolCallId: 'c1', parts: [{ type: 'tool-result', callId: 'c1', content: 'abcdef' }] }],
      [],
      onePerChar,
    )
    expect(total).toBe(HEURISTIC_TOKENS_PER_MESSAGE + 6)
  })

  test('zählt Werkzeugbeschreibungen mit — der am leichtesten vergessene Posten', () => {
    const tools = [
      { name: 'read', description: 'liest', parameters: { type: 'object' } },
      { name: 'write', description: 'schreibt', parameters: { type: 'object' } },
    ]
    const withTools = estimateMessages([], tools, onePerChar)
    const parameters = estimateJson({ type: 'object' }, onePerChar)
    // Je Werkzeug: Rahmen + Name + Beschreibung + serialisierte Parameter.
    const perTool = (name: string, description: string): number =>
      HEURISTIC_TOKENS_PER_TOOL + name.length + description.length + parameters
    expect(withTools).toBe(perTool('read', 'liest') + perTool('write', 'schreibt'))
    // Und ohne Werkzeuge kostet es nichts — der Posten kommt wirklich von ihnen.
    expect(estimateMessages([], [], onePerChar)).toBe(0)
  })

  test('eine Anfrage wird wie ihre Nachrichten plus Werkzeuge geschätzt', () => {
    const r = request('hallo welt')
    expect(estimateRequest(r, onePerChar)).toBe(estimateMessages(r.messages, [], onePerChar))
  })

  test('liest die Werkzeuge aus der Anfrage, wenn sie dort stehen', () => {
    const tools = [{ name: 't', description: 'd', parameters: {} }]
    const r = request('x', tools)
    expect(estimateRequest(r, onePerChar)).toBe(
      estimateMessages(r.messages, tools, onePerChar),
    )
  })

  test('eine unsinnige Struktur ergibt 0 statt eines Abbruchs', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(estimateJson(cyclic, onePerChar)).toBe(0)
    expect(estimateJson(undefined, onePerChar)).toBe(0)
  })

  test('eine Funktion in der Struktur wird still weggelassen, nicht geschätzt', () => {
    // `JSON.stringify` lässt Funktionen aus — die Schätzung sieht `{}` und
    // rechnet 2 Zeichen. Das ist kein Abbruch, aber auch keine Zählung des
    // Funktionsrumpfs: Funktionsquelltext geht nie an den Anbieter.
    expect(estimateJson({ f: (): number => 1 }, onePerChar)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Brauchbarkeit einer gemeldeten Zählung
// ---------------------------------------------------------------------------

describe('Gemeldete Zählung prüfen', () => {
  test('nimmt eine vollständige, nicht-negative Meldung an', () => {
    expect(isUsableUsage({ inputTokens: 0, outputTokens: 0 })).toBe(true)
    expect(isUsableUsage({ inputTokens: 12, outputTokens: 3 })).toBe(true)
  })

  test('lehnt NaN ab — sonst vergiftet es die Summe', () => {
    expect(isUsableUsage({ inputTokens: Number.NaN, outputTokens: 1 })).toBe(false)
    expect(isUsableUsage({ inputTokens: 1, outputTokens: Number.NaN })).toBe(false)
  })

  test('lehnt Unendlich ab', () => {
    expect(isUsableUsage({ inputTokens: Number.POSITIVE_INFINITY, outputTokens: 0 })).toBe(false)
  })

  test('lehnt negative Zahlen ab', () => {
    expect(isUsableUsage({ inputTokens: -1, outputTokens: 0 })).toBe(false)
  })

  test('lehnt undefined als Ganzes ab', () => {
    expect(isUsableUsage(undefined)).toBe(false)
  })

  test('bestimmt die Herkunft einer Summe', () => {
    expect(methodOf(0, 0)).toBe('estimated')
    expect(methodOf(3, 0)).toBe('reported')
    expect(methodOf(0, 3)).toBe('estimated')
    expect(methodOf(1, 1)).toBe('mixed')
  })
})

// ---------------------------------------------------------------------------
// Der Zähler
// ---------------------------------------------------------------------------

describe('Zähler', () => {
  test('übernimmt eine gemeldete Zählung und kennzeichnet sie als gemeldet', () => {
    const meter = createTokenMeter()
    const record = meter.record(resultWithUsage(12, 3))
    expect(record).toEqual({ inputTokens: 12, outputTokens: 3, method: 'reported' })
    expect(meter.total().method).toBe('reported')
    expect(meter.count()).toBe(1)
    expect(meter.hasEstimates()).toBe(false)
  })

  test('schätzt ohne Meldung und kennzeichnet die Schätzung', () => {
    const meter = createTokenMeter({ estimator: onePerChar })
    const record = meter.record(resultWithoutUsage('abcd'), request('abcdef'))
    // Eingabe: Rahmen + 6 Zeichen. Ausgabe: 4 Zeichen.
    expect(record.inputTokens).toBe(HEURISTIC_TOKENS_PER_MESSAGE + 6)
    expect(record.outputTokens).toBe(4)
    expect(record.method).toBe('estimated')
    expect(meter.hasEstimates()).toBe(true)
  })

  test('zählt die Argumente eines Werkzeugaufrufs zur Ausgabe', () => {
    const meter = createTokenMeter({ estimator: onePerChar })
    const call = { id: 'c1', name: 'read', arguments: { path: 'a' } }
    const record = meter.record(resultWithoutUsage('', [call]))
    const argumentsTokens = estimateJson(call.arguments, onePerChar)
    expect(record.outputTokens).toBe('read'.length + argumentsTokens)
  })

  test('ohne Anfrage ist die Eingabe-Schätzung 0 — und wird als Schätzung geführt', () => {
    const meter = createTokenMeter({ estimator: onePerChar })
    const record = meter.record(resultWithoutUsage('abc'))
    expect(record.inputTokens).toBe(0)
    expect(record.outputTokens).toBe(3)
    expect(record.method).toBe('estimated')
  })

  test('summiert über mehrere Anfragen und nennt die Herkunft gemischt', () => {
    const meter = createTokenMeter({ estimator: onePerChar })
    meter.record(resultWithUsage(10, 1))
    const estimate = meter.record(resultWithoutUsage('abcd'), request('ab'))
    const total = meter.total()
    expect(total.inputTokens).toBe(10 + estimate.inputTokens)
    expect(total.outputTokens).toBe(1 + 4)
    expect(total.method).toBe('mixed')
    expect(meter.count()).toBe(2)
  })

  test('eine kaputte Meldung fällt auf die Schätzung zurück, nicht in die Summe', () => {
    const meter = createTokenMeter({ estimator: onePerChar })
    const broken: CompletionResult = { ...resultWithoutUsage('abcd'), usage: { inputTokens: Number.NaN, outputTokens: 0 } }
    const record = meter.record(broken, request('abcdef'))
    expect(record.method).toBe('estimated')
    expect(Number.isNaN(meter.total().inputTokens)).toBe(false)
    expect(meter.total().outputTokens).toBe(4)
  })

  test('reset setzt alles auf null', () => {
    const meter = createTokenMeter({ estimator: onePerChar })
    meter.record(resultWithUsage(10, 1))
    meter.reset()
    expect(meter.total()).toEqual({ inputTokens: 0, outputTokens: 0, method: 'estimated' })
    expect(meter.count()).toBe(0)
    expect(meter.state().empty).toBe(true)
  })

  test('lehnt eine unsinnige Warnschwelle ab', () => {
    expect(() => new RecordingTokenMeter({ warnAt: 0 })).toThrow(RangeError)
    expect(() => new RecordingTokenMeter({ warnAt: 1.5 })).toThrow(RangeError)
  })

  test('lehnt ein unsinniges Budget ab', () => {
    expect(() => new RecordingTokenMeter({ budgetInputTokens: -1 })).toThrow(RangeError)
  })

  test('erlaubt Budget 0 — dann ist jede geschätzte Eingabe über der Grenze', () => {
    const meter = new RecordingTokenMeter({ budgetInputTokens: 0, estimator: onePerChar })
    meter.record(resultWithoutUsage('x'), request('y'))
    expect(meter.state().overBudget).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Stand und Grenze
// ---------------------------------------------------------------------------

describe('Stand und Grenze', () => {
  test('meldet eine leere Summe als leer', () => {
    const state = createTokenMeter().state()
    expect(state.empty).toBe(true)
    expect(state.inputTokens).toBe(0)
    expect(state.requests).toBe(0)
    expect(state.method).toBe('estimated')
  })

  test('meldet die Warnschwelle, bevor die Grenze erreicht ist', () => {
    const meter = createTokenMeter({ budgetInputTokens: 100, warnAt: 0.8 })
    meter.record(resultWithUsage(80, 0))
    expect(meter.state().nearBudget).toBe(true)
    expect(meter.state().overBudget).toBe(false)
  })

  test('meldet die Überschreitung erst über der Grenze, nicht bei ihr', () => {
    const meter = createTokenMeter({ budgetInputTokens: 100 })
    meter.record(resultWithUsage(100, 0))
    expect(meter.state().overBudget).toBe(false)
    expect(meter.state().nearBudget).toBe(true)
    meter.record(resultWithUsage(1, 0))
    expect(meter.state().overBudget).toBe(true)
    // Überschritten heißt nicht „nahe" — die zwei Zustände schließen sich aus.
    expect(meter.state().nearBudget).toBe(false)
  })

  test('verbietet nichts: der Zähler zählt über die Grenze hinaus weiter', () => {
    const meter = createTokenMeter({ budgetInputTokens: 10 })
    meter.record(resultWithUsage(50, 0))
    meter.record(resultWithUsage(50, 0))
    expect(meter.state().inputTokens).toBe(100)
    expect(meter.count()).toBe(2)
  })

  test('ohne Budget gibt es weder Warnung noch Überschreitung', () => {
    const meter = createTokenMeter()
    meter.record(resultWithUsage(1_000_000, 0))
    expect(meter.state().overBudget).toBe(false)
    expect(meter.state().nearBudget).toBe(false)
    expect(meter.state().budgetInputTokens).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Darstellung
// ---------------------------------------------------------------------------

describe('Darstellung', () => {
  test('nennt die Herkunft in der Zeile — sonst wird die Schätzung zur Messung', () => {
    const line = describeMeterState(createTokenMeter({ estimator: onePerChar }).state())
    expect(line).toContain('geschätzt')
  })

  test('nennt gemeldet, wenn alles gemeldet war', () => {
    const meter = createTokenMeter()
    meter.record(resultWithUsage(5, 2))
    expect(describeMeterState(meter.state())).toBe('5 ein / 2 aus (gemeldet) · 1 Anfrage')
  })

  test('nennt gemischt, wenn beides vorkam', () => {
    const meter = createTokenMeter({ estimator: onePerChar })
    meter.record(resultWithUsage(5, 2))
    meter.record(resultWithoutUsage('a'), request('b'))
    const line = describeMeterState(meter.state())
    expect(line).toContain('gemischt')
    expect(line).toContain('2 Anfragen')
  })

  test('meldet die Überschreitung in der Zeile', () => {
    const meter = createTokenMeter({ budgetInputTokens: 4 })
    meter.record(resultWithUsage(5, 0))
    expect(describeMeterState(meter.state())).toContain('GRENZE ÜBERSCHRITTEN')
  })

  test('meldet die Nähe zur Grenze in der Zeile', () => {
    const meter = createTokenMeter({ budgetInputTokens: 10, warnAt: 0.5 })
    meter.record(resultWithUsage(6, 0))
    expect(describeMeterState(meter.state())).toContain('nahe der Grenze')
  })

  test('meldet eine ungenutzte Grenze als Zahl', () => {
    const meter = createTokenMeter({ budgetInputTokens: 1000 })
    meter.record(resultWithUsage(1, 0))
    expect(describeMeterState(meter.state())).toContain('Grenze 1000')
  })
})
