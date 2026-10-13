/**
 * Tests für den HTTP-Anbieter.
 *
 * **Warum diese Tests ohne Netz laufen.** Der Anbieter nimmt sein `fetch` als
 * Argument. Damit ist jede Antwortform prüfbar, ohne einen Schlüssel, ohne
 * Netz und ohne einen Aufruf, der Geld kostet. Ein Adapter, den man nur mit
 * echtem Dienst prüfen kann, wird nicht geprüft.
 *
 * **Was hier bewusst geprüft wird.** Nicht „es funktioniert", sondern die
 * Stellen, an denen ein Anbieter anders antwortet als erwartet: fehlende
 * Felder, ungültiges Argument-JSON, HTTP-Fehler mit und ohne
 * Wiederholungswert, Abbruch durch den Aufrufer gegen Zeitgrenze.
 */

import { describe, expect, test } from 'bun:test'
import { LlmError } from '@prometheus-harness/llm'
import {
  LlmHttpProvider,
  buildBody,
  errorForStatus,
  mapFinishReason,
  parseArguments,
  parseCompletion,
  providerFromEnv,
} from '../src/index.ts'

/** Baut eine Antwort im Anbieterformat. */
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Antwort lesen', () => {
  test('liest Text und Modellkennung', () => {
    const result = parseCompletion({
      model: 'deepseek-chat',
      choices: [{ message: { content: 'Hallo' }, finish_reason: 'stop' }],
    })
    expect(result.text).toBe('Hallo')
    expect(result.model).toBe('deepseek-chat')
    expect(result.finishReason).toBe('stop')
    expect(result.toolCalls).toEqual([])
  })

  test('liest Werkzeugaufrufe und setzt finishReason auf tool-calls', () => {
    const result = parseCompletion({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: '',
            tool_calls: [
              { id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } },
            ],
          },
        },
      ],
    })
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]?.name).toBe('read_file')
    expect(result.toolCalls[0]?.arguments).toEqual({ path: 'a.txt' })
    expect(result.finishReason).toBe('tool-calls')
  })

  test('liest die Token-Zählung, wenn sie da ist', () => {
    const result = parseCompletion({
      choices: [{ message: { content: 'x' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    })
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 3 })
  })

  test('wirft malformed ohne choices', () => {
    expect(() => parseCompletion({})).toThrow(LlmError)
    try {
      parseCompletion({})
    } catch (error) {
      expect((error as LlmError).kind).toBe('malformed')
    }
  })

  test('wirft malformed bei einer Nicht-Objekt-Antwort', () => {
    expect(() => parseCompletion('kaputt')).toThrow(LlmError)
  })

  test('überspringt Werkzeugaufrufe ohne Kennung oder Namen', () => {
    const result = parseCompletion({
      choices: [{ message: { tool_calls: [{ id: '', function: { name: 'x' } }, { id: 'ok' }] } }],
    })
    expect(result.toolCalls).toEqual([])
  })
})

describe('finish_reason abbilden', () => {
  test('Werkzeugaufrufe schlagen den Anbieterwert', () => {
    expect(mapFinishReason('stop', true)).toBe('tool-calls')
  })

  test('bekannte Werte werden übernommen', () => {
    expect(mapFinishReason('length', false)).toBe('length')
    expect(mapFinishReason('content_filter', false)).toBe('content-filter')
    expect(mapFinishReason('tool_calls', false)).toBe('tool-calls')
  })

  test('unbekannter Wert wird zu stop — nicht zu tool-calls', () => {
    expect(mapFinishReason('irgendwas-neues', false)).toBe('stop')
    expect(mapFinishReason(undefined, false)).toBe('stop')
  })
})

describe('Argumente parsen', () => {
  test('parst gültiges JSON', () => {
    expect(parseArguments('{"a":1}')).toEqual({ a: 1 })
  })

  test('ungültiges JSON ergibt ein leeres Objekt statt eines Wurfs', () => {
    // Der Loop soll dem Modell den Fehler als Werkzeugergebnis zurückgeben
    // können — ein Wurf würde den ganzen Turn beenden.
    expect(parseArguments('{kaputt')).toEqual({})
  })

  test('leere Werte ergeben ein leeres Objekt', () => {
    expect(parseArguments(undefined)).toEqual({})
    expect(parseArguments('')).toEqual({})
  })

  test('ein Objekt wird unverändert durchgereicht', () => {
    expect(parseArguments({ schon: 'objekt' })).toEqual({ schon: 'objekt' })
  })
})

describe('Nutzlast bauen', () => {
  test('setzt Werkzeugergebnisse als eigene tool-Nachricht ab', () => {
    const body = buildBody({
      model: 'deepseek-chat',
      messages: [
        { role: 'user', parts: [{ type: 'text', text: 'tu was' }] },
        { role: 'tool', parts: [{ type: 'tool-result', callId: 'c1', content: 'ergebnis' }] },
      ],
    })
    const messages = body.messages as { role: string; tool_call_id?: string }[]
    expect(messages).toHaveLength(2)
    expect(messages[1]?.role).toBe('tool')
    expect(messages[1]?.tool_call_id).toBe('c1')
  })

  test('lässt tools weg, wenn keine genannt sind', () => {
    const body = buildBody({ model: 'm', messages: [] })
    expect(body.tools).toBeUndefined()
    expect(body.stream).toBe(false)
  })

  test('übersetzt Werkzeuge in die Funktionenform des Anbieters', () => {
    const body = buildBody({
      model: 'm',
      messages: [],
      tools: [{ name: 'read', description: 'liest', parameters: { type: 'object' } }],
    })
    const tools = body.tools as { type: string; function: { name: string } }[]
    expect(tools[0]?.type).toBe('function')
    expect(tools[0]?.function.name).toBe('read')
  })

  test('übersetzt einen Werkzeugaufruf der Assistenten-Nachricht mit (Befund vom 13.10.2026)', () => {
    const body = buildBody({
      model: 'm',
      messages: [
        { role: 'user', parts: [{ type: 'text', text: 'lies a.txt' }] },
        {
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Ich sehe nach.' },
            { type: 'tool-call', callId: 'c1', name: 'read', arguments: { path: 'a.txt' } },
          ],
        },
        { role: 'tool', parts: [{ type: 'tool-result', callId: 'c1', content: 'Inhalt' }] },
      ],
    })
    const messages = body.messages as {
      role: string
      content: string
      tool_call_id?: string
      tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]
    }[]
    expect(messages).toHaveLength(3)
    const assistant = messages[1]
    expect(assistant?.role).toBe('assistant')
    expect(assistant?.content).toBe('Ich sehe nach.')
    expect(assistant?.tool_calls).toHaveLength(1)
    expect(assistant?.tool_calls?.[0]?.id).toBe('c1')
    expect(assistant?.tool_calls?.[0]?.type).toBe('function')
    expect(assistant?.tool_calls?.[0]?.function.name).toBe('read')
    // Die Argumente gehen als **String** hinaus — die Schnittstelle verlangt das.
    expect(assistant?.tool_calls?.[0]?.function.arguments).toBe('{"path":"a.txt"}')
    // Und die Zuordnung stimmt: das Ergebnis zeigt auf einen Aufruf, der da ist.
    expect(messages[2]?.tool_call_id).toBe(assistant?.tool_calls?.[0]?.id)
  })

  test('lässt eine leere Assistenten-Nachricht ohne Aufruf weiterhin weg', () => {
    const body = buildBody({
      model: 'm',
      messages: [
        { role: 'user', parts: [{ type: 'text', text: 'x' }] },
        { role: 'assistant', parts: [{ type: 'text', text: '' }] },
      ],
    })
    expect(body.messages).toHaveLength(1)
  })

  test('eine Assistenten-Nachricht mit Aufruf, aber ohne Text wird nicht weggelassen', () => {
    const body = buildBody({
      model: 'm',
      messages: [
        { role: 'assistant', parts: [{ type: 'tool-call', callId: 'c9', name: 'n', arguments: {} }] },
        { role: 'tool', parts: [{ type: 'tool-result', callId: 'c9', content: 'ok' }] },
      ],
    })
    const messages = body.messages as { role: string; content: string; tool_calls?: unknown[] }[]
    // Vor der Korrektur stand hier genau **eine** Nachricht: die tool-Nachricht
    // zeigte damit auf einen Aufruf, den die Nutzlast nicht kannte.
    expect(messages).toHaveLength(2)
    expect(messages[0]?.tool_calls).toHaveLength(1)
    expect(messages[0]?.content).toBe('')
  })
})

describe('HTTP-Fehler zuordnen', () => {
  test('401 gilt als Zugangsdatenproblem und ist nicht wiederholbar', () => {
    const error = errorForStatus(401, 'unauthorized')
    expect(error.kind).toBe('credentials')
    expect(error.retryable).toBe(false)
  })

  test('429 ist wiederholbar', () => {
    expect(errorForStatus(429, 'slow down').retryable).toBe(true)
  })

  test('500 ist wiederholbar, 400 nicht', () => {
    expect(errorForStatus(500, 'boom').retryable).toBe(true)
    expect(errorForStatus(400, 'bad').retryable).toBe(false)
  })

  test('kürzt lange Antworttexte', () => {
    const error = errorForStatus(400, 'x'.repeat(2000))
    expect(error.message.length).toBeLessThan(700)
  })
})

describe('Anbieter aufrufen', () => {
  test('setzt Kopfzeilen und Adresse richtig', async () => {
    let seen: { url: string; init: RequestInit | undefined } = { url: '', init: undefined }
    const fake: typeof globalThis.fetch = async (input, init) => {
      seen = { url: String(input), init }
      return response({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
    }
    const provider = new LlmHttpProvider({ apiKey: 'geheim', baseUrl: 'https://example.test/v1/' }, fake)
    const result = await provider.complete({ model: 'deepseek-chat', messages: [] })
    expect(result.text).toBe('ok')
    expect(seen.url).toBe('https://example.test/v1/chat/completions')
    const headers = seen.init?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer geheim')
  })

  test('wirft credentials ohne Schlüssel — schon beim Bauen, nicht erst beim Aufruf', () => {
    // Der Konstruktor beurteilt den Schlüssel und lehnt einen unbrauchbaren ab.
    // Ein Anbieter mit kaputtem Schlüssel soll gar nicht erst entstehen: sonst
    // verschiebt sich der Fehler an eine Stelle, an der niemand mehr nach der
    // Konfiguration sucht.
    expect(() => new LlmHttpProvider({ apiKey: '' })).toThrow(LlmError)
  })

  test('nimmt einen Schlüssel mit umgebendem Leerraum an und trimmt ihn', async () => {
    let seen: string | undefined
    const fake: typeof globalThis.fetch = async (_input, init) => {
      seen = (init?.headers as Record<string, string>).authorization
      return response({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
    }
    const provider = new LlmHttpProvider({ apiKey: '  geheim  ' }, fake)
    await provider.complete({ model: 'm', messages: [] })
    // Der Leerraum ist weg — ein umgebender Rand hat genau eine Lesart.
    expect(seen).toBe('Bearer geheim')
  })

  test('lehnt einen Schlüssel mit Steuerzeichen ab', () => {
    // Ein Zeilenumbruch in einer HTTP-Kopfzeile ist entweder ein Tippfehler
    // oder ein Versuch, zusätzliche Kopfzeilen einzuschmuggeln.
    expect(() => new LlmHttpProvider({ apiKey: 'geheim\r\nX-Boese: 1' })).toThrow(LlmError)
  })

  test('leitet Ablehnung des Anbieters in rejected über', async () => {
    const provider = new LlmHttpProvider({ apiKey: 'k' }, async () => response({ error: 'nein' }, 400))
    try {
      await provider.complete({ model: 'm', messages: [] })
      throw new Error('hätte werfen müssen')
    } catch (error) {
      expect(error).toBeInstanceOf(LlmError)
      expect((error as LlmError).kind).toBe('rejected')
    }
  })

  test('unterscheidet Abbruch des Aufrufers von der Zeitgrenze', async () => {
    const controller = new AbortController()
    const fake: typeof globalThis.fetch = async (_input, init) => {
      controller.abort()
      // Der echte fetch wirft bei abgebrochenem Signal genau so.
      const reason: unknown = init?.signal?.reason
      const abort = new Error('aborted')
      abort.name = 'AbortError'
      throw Object.assign(abort, { cause: reason })
    }
    const provider = new LlmHttpProvider({ apiKey: 'k', timeoutMs: 5000 }, fake)
    try {
      await provider.complete({ model: 'm', messages: [], signal: controller.signal })
      throw new Error('hätte werfen müssen')
    } catch (error) {
      expect((error as LlmError).kind).toBe('aborted')
    }
  })

  test('meldet Zeitgrenze als timeout, wenn der Aufrufer nicht abgebrochen hat', async () => {
    const fake: typeof globalThis.fetch = async () => {
      const abort = new Error('timeout')
      abort.name = 'AbortError'
      throw abort
    }
    const provider = new LlmHttpProvider({ apiKey: 'k', timeoutMs: 10 }, fake)
    try {
      await provider.complete({ model: 'm', messages: [] })
      throw new Error('hätte werfen müssen')
    } catch (error) {
      expect((error as LlmError).kind).toBe('timeout')
    }
  })

  test('meldet einen Netzwerkfehler als transport', async () => {
    const fake: typeof globalThis.fetch = async () => { throw new Error('ECONNREFUSED') }
    const provider = new LlmHttpProvider({ apiKey: 'k' }, fake)
    try {
      await provider.complete({ model: 'm', messages: [] })
      throw new Error('hätte werfen müssen')
    } catch (error) {
      expect((error as LlmError).kind).toBe('transport')
    }
  })
})

describe('Fabrik aus der Umgebung', () => {
  test('wirft ohne DEEPSEEK_API_KEY', () => {
    expect(() => providerFromEnv({})).toThrow(LlmError)
  })

  test('baut den Anbieter mit gesetztem Schlüssel', () => {
    const provider = providerFromEnv({ DEEPSEEK_API_KEY: 'k' })
    expect(provider.name).toBe('llm-http')
  })
})
