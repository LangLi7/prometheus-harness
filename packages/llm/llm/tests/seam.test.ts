/**
 * Tests für den LLM-Seam.
 *
 * **Was hier geprüft wird.** Nicht der Anbieter (das tut `llm-deepseek`),
 * sondern die **Form des Verlaufs**. Der Seam ist die Stelle, an der ein
 * Werkzeugaufruf festgehalten wird — geht er verloren, ist der nächste Aufruf
 * beim Anbieter nicht mehr zuordenbar. Diese Tests sind der Riegel davor.
 *
 * **Der Anlass (gemessen, 13.10.2026):** der Adapter ließ eine
 * Assistenten-Nachricht weg, die nur einen Werkzeugaufruf trug. Der Seam hatte
 * gar keinen Typ dafür — der Verlauf war nach der ersten Werkzeugrunde nicht
 * mehr rekonstruierbar. Die Tests unten hätten das gefunden.
 */

import { describe, expect, test } from 'bun:test'
import {
  LlmError,
  assistantMessage,
  checkHistory,
  isAbortCause,
  isLlmProvider,
  messageText,
  messageToolCalls,
  messageToolResults,
  textMessage,
  toolCallPart,
  toolResultMessage,
  type CompletionResult,
  type Message,
} from '../src/index.ts'

/** Eine Antwort des Modells mit einem Werkzeugaufruf. */
function toolCallResult(text = ''): CompletionResult {
  return {
    text,
    toolCalls: [{ id: 'c1', name: 'lesen', arguments: { pfad: 'a.txt' } }],
    finishReason: 'tool-calls',
    model: 'm',
  }
}

describe('Nachrichten bauen', () => {
  test('eine Textnachricht hat genau einen Textteil', () => {
    const message = textMessage('user', 'Hallo')
    expect(message.parts).toEqual([{ type: 'text', text: 'Hallo' }])
    expect(messageText(message)).toBe('Hallo')
  })

  test('eine Assistenten-Antwort mit Text und Aufruf behält beides', () => {
    const message = assistantMessage(toolCallResult('Ich sehe nach.'))
    expect(message.role).toBe('assistant')
    expect(messageText(message)).toBe('Ich sehe nach.')
    expect(messageToolCalls(message)).toHaveLength(1)
    expect(messageToolCalls(message)[0]?.callId).toBe('c1')
    expect(messageToolCalls(message)[0]?.name).toBe('lesen')
    expect(messageToolCalls(message)[0]?.arguments).toEqual({ pfad: 'a.txt' })
  })

  test('eine Antwort ohne Text besteht nur aus dem Aufruf — sie wird nicht leer', () => {
    const message = assistantMessage(toolCallResult())
    expect(message.parts).toHaveLength(1)
    expect(message.parts[0]?.type).toBe('tool-call')
    expect(messageText(message)).toBe('')
  })

  test('eine reine Textantwort hat keinen Aufrufteil', () => {
    const result: CompletionResult = { text: 'fertig', toolCalls: [], finishReason: 'stop', model: 'm' }
    const message = assistantMessage(result)
    expect(message.parts).toEqual([{ type: 'text', text: 'fertig' }])
    expect(messageToolCalls(message)).toEqual([])
  })

  test('Ergebnisse werden zu einer Tool-Nachricht mit allen Teilen', () => {
    const message = toolResultMessage([
      { type: 'tool-result', callId: 'c1', content: 'Inhalt' },
      { type: 'tool-result', callId: 'c2', content: 'mehr' },
    ])
    expect(message.role).toBe('tool')
    expect(messageToolResults(message)).toHaveLength(2)
    expect(messageText(message)).toBe('')
  })

  test('toolCallPart übersetzt die Kennung id nach callId', () => {
    expect(toolCallPart({ id: 'x', name: 'n', arguments: {} })).toEqual({
      type: 'tool-call',
      callId: 'x',
      name: 'n',
      arguments: {},
    })
  })
})

describe('Verlauf prüfen', () => {
  test('ein zuordenbarer Verlauf ergibt keine Befunde', () => {
    const messages: Message[] = [
      textMessage('user', 'bitte lesen'),
      assistantMessage(toolCallResult()),
      toolResultMessage([{ type: 'tool-result', callId: 'c1', content: 'Inhalt' }]),
      { role: 'assistant', parts: [{ type: 'text', text: 'fertig' }] },
    ]
    expect(checkHistory(messages)).toEqual([])
  })

  test('ein Ergebnis ohne Aufruf wird benannt — genau der Fehler von vorhin', () => {
    const messages: Message[] = [
      textMessage('user', 'bitte lesen'),
      // Die Assistenten-Nachricht fehlt — so sah der Verlauf vor der Korrektur aus.
      toolResultMessage([{ type: 'tool-result', callId: 'c1', content: 'Inhalt' }]),
    ]
    const problems = checkHistory(messages)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toEqual({ index: 1, problem: 'result-without-call', callId: 'c1' })
  })

  test('eine doppelte Aufruf-Kennung wird benannt', () => {
    const messages: Message[] = [assistantMessage(toolCallResult()), assistantMessage(toolCallResult())]
    const problems = checkHistory(messages)
    expect(problems.map((problem) => problem.problem)).toEqual(['duplicate-call-id'])
  })

  test('ein doppeltes Ergebnis wird benannt', () => {
    const messages: Message[] = [
      assistantMessage(toolCallResult()),
      toolResultMessage([{ type: 'tool-result', callId: 'c1', content: 'a' }]),
      toolResultMessage([{ type: 'tool-result', callId: 'c1', content: 'b' }]),
    ]
    expect(checkHistory(messages).map((problem) => problem.problem)).toEqual(['duplicate-result'])
  })

  test('mehrere Befunde werden alle gemeldet, nicht nur der erste', () => {
    const messages: Message[] = [
      toolResultMessage([{ type: 'tool-result', callId: 'a', content: '' }]),
      toolResultMessage([{ type: 'tool-result', callId: 'b', content: '' }]),
    ]
    expect(checkHistory(messages)).toHaveLength(2)
  })

  test('der Verlauf wird nicht verändert', () => {
    const messages: Message[] = [assistantMessage(toolCallResult())]
    const before = JSON.stringify(messages)
    checkHistory(messages)
    expect(JSON.stringify(messages)).toBe(before)
  })
})

describe('Abbruch erkennen', () => {
  test('erkennt AbortError über den Namen', () => {
    const error = new Error('weg')
    error.name = 'AbortError'
    expect(isAbortCause(error)).toBe(true)
  })

  test('erkennt den Code ABORT_ERR', () => {
    expect(isAbortCause({ code: 'ABORT_ERR' })).toBe(true)
  })

  test('erkennt einen gewöhnlichen Fehler nicht als Abbruch', () => {
    expect(isAbortCause(new Error('kaputt'))).toBe(false)
    expect(isAbortCause('kaputt')).toBe(false)
    expect(isAbortCause(null)).toBe(false)
    expect(isAbortCause(undefined)).toBe(false)
  })
})

describe('Fehlermodell', () => {
  test('setzt retryable je Art vor — und lässt es überschreiben', () => {
    expect(new LlmError('unavailable', 'x').retryable).toBe(true)
    expect(new LlmError('transport', 'x').retryable).toBe(true)
    expect(new LlmError('timeout', 'x').retryable).toBe(true)
    expect(new LlmError('rejected', 'x').retryable).toBe(false)
    expect(new LlmError('credentials', 'x').retryable).toBe(false)
    expect(new LlmError('malformed', 'x').retryable).toBe(false)
    expect(new LlmError('aborted', 'x').retryable).toBe(false)
    // Ausdrückliche Angabe gewinnt — auch gegen die Vorgabe.
    expect(new LlmError('unavailable', 'x', { retryable: false }).retryable).toBe(false)
  })

  test('trägt den Anbieter-Code, wenn er genannt ist', () => {
    const error = new LlmError('unavailable', 'x', { providerCode: '429' })
    expect(error.providerCode).toBe('429')
    expect(new LlmError('unavailable', 'x').providerCode).toBeUndefined()
  })

  test('ist als Fehler erkennbar und trägt den Namen', () => {
    const error = new LlmError('rejected', 'x')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('LlmError')
  })
})

describe('Anbieter prüfen', () => {
  test('erkennt einen brauchbaren Anbieter', () => {
    expect(isLlmProvider({ name: 'x', complete: () => Promise.resolve() })).toBe(true)
  })

  test('lehnt fehlenden Namen, leeren Namen und fehlendes complete ab', () => {
    expect(isLlmProvider({ complete: () => Promise.resolve() })).toBe(false)
    expect(isLlmProvider({ name: '', complete: () => Promise.resolve() })).toBe(false)
    expect(isLlmProvider({ name: 'x' })).toBe(false)
    expect(isLlmProvider(null)).toBe(false)
    expect(isLlmProvider('deepseek')).toBe(false)
  })
})
