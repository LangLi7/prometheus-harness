/**
 * Tests für das Session-Format.
 *
 * **Worauf diese Tests zielen.** Nicht „eine Zeile lässt sich schreiben",
 * sondern die Fälle, in denen eine Sitzung **verloren geht** oder **still
 * verfälscht** wird:
 *
 * - eine abgebrochene letzte Zeile (Absturz mitten im Schreiben)
 * - eine Zeile aus einer **neueren** Fassung
 * - eine Zeile ohne Versionsnummer
 * - ein Werkzeugergebnis ohne Aufruf
 * - eine Lücke in der Reihenfolge
 * - Text mit Zeilenumbrüchen (darf die Datei nicht zerlegen)
 */

import { describe, expect, test } from 'bun:test'
import type { Message } from '@prometheus-harness/llm'
import {
  KNOWN_EVENT_TYPES,
  MIGRATIONS,
  SESSION_FORMAT_VERSION,
  describeMessages,
  foldSession,
  isKnownType,
  migrateEvents,
  parseLine,
  parseSession,
  serializeEvent,
  serializeLine,
  type ReadEvent,
  type SessionEvent,
  type UnknownEvent,
} from '../src/index.ts'

// ---------------------------------------------------------------------------
// Prüfgerüst
// ---------------------------------------------------------------------------

/** Die feste Zeit aller Testzeilen. */
const AT = '2026-10-13T12:00:00.000Z'

/** Baut eine Zeile mit fortlaufender Nummer. */
function envelope(seq: number) {
  return { v: SESSION_FORMAT_VERSION, seq, at: AT }
}

/** Ein Sitzungsbeginn. */
function start(id = 's1'): SessionEvent {
  return { ...envelope(1), type: 'session-start', id, model: 'deepseek-chat', cwd: '/tmp', writer: 'pmh/0.1.0' }
}

/** Eine Benutzereingabe. */
function input(seq: number, text: string): SessionEvent {
  return { ...envelope(seq), type: 'user-input', text }
}

/** Eine Modellantwort. */
function reply(seq: number, text: string): SessionEvent {
  return {
    ...envelope(seq),
    type: 'model-reply',
    turn: 1,
    step: 1,
    text,
    toolCalls: [],
    finishReason: 'stop',
  }
}

/** Eine Modellantwort mit Aufruf. */
function replyWithCall(seq: number, callId: string, name = 'lesen'): SessionEvent {
  return {
    ...envelope(seq),
    type: 'model-reply',
    turn: 1,
    step: 1,
    text: '',
    toolCalls: [{ id: callId, name, arguments: { pfad: 'a.txt' } }],
    finishReason: 'tool-calls',
  }
}

/** Ein Werkzeugergebnis. */
function toolResult(seq: number, callId: string, content = 'Inhalt'): SessionEvent {
  return {
    ...envelope(seq),
    type: 'tool-result',
    turn: 1,
    step: 1,
    callId,
    name: 'lesen',
    content,
    failed: false,
    durationMs: 3,
  }
}

/** Ein Turn-Ende. */
function turnEnd(seq: number, reason = 'stop'): SessionEvent {
  return { ...envelope(seq), type: 'turn-end', turn: 1, step: 1, reason, text: 'fertig' }
}

/** Ein Zählerstand. */
function usage(seq: number, inputTokens = 10, outputTokens = 2): SessionEvent {
  return { ...envelope(seq), type: 'usage', turn: 1, step: 1, inputTokens, outputTokens, method: 'reported', requests: 1 }
}

/** Alle Zeilen eines Feldes zu einem Text. */
function textOf(events: readonly ReadEvent[]): string {
  return events.map((event) => serializeLine(event)).join('')
}

// ---------------------------------------------------------------------------
// Zeilen schreiben
// ---------------------------------------------------------------------------

describe('Zeilen schreiben', () => {
  test('eine Zeile ohne Umbruch, mit Versionsnummer und Nummer', () => {
    const line = serializeEvent(start())
    expect(line).not.toContain('\n')
    const raw = JSON.parse(line) as Record<string, unknown>
    expect(raw.v).toBe(SESSION_FORMAT_VERSION)
    expect(raw.seq).toBe(1)
    expect(raw.type).toBe('session-start')
  })

  test('Text mit Zeilenumbruch zerlegt die Zeile nicht', () => {
    const line = serializeEvent(input(2, 'erste Zeile\nzweite Zeile\n\ndritte'))
    expect(line).not.toContain('\n')
    // Und der Text kommt unverändert zurück.
    const outcome = parseLine(line)
    expect(outcome.ok && outcome.event?.type === 'user-input' && outcome.event.text).toBe(
      'erste Zeile\nzweite Zeile\n\ndritte',
    )
  })

  test('Text mit Anführungszeichen und Backslash übersteht den Rundlauf', () => {
    const tricky = 'er sagte "hallo" \\ und: {}[]'
    const outcome = parseLine(serializeEvent(input(2, tricky)))
    expect(outcome.ok && outcome.event?.type === 'user-input' && outcome.event.text).toBe(tricky)
  })

  test('serializeLine hängt genau einen Umbruch an', () => {
    const line = serializeLine(start())
    expect(line.endsWith('\n')).toBe(true)
    expect(line.split('\n')).toHaveLength(2)
  })

  test('eine unbekannte Zeile wird unverändert zurückgeschrieben', () => {
    const unknown: UnknownEvent = {
      ...envelope(5),
      type: 'unknown',
      actualType: 'etwas-neues',
      raw: { v: SESSION_FORMAT_VERSION, seq: 5, at: AT, type: 'etwas-neues', feld: 42 },
    }
    const raw = JSON.parse(serializeEvent(unknown)) as Record<string, unknown>
    expect(raw.type).toBe('etwas-neues')
    expect(raw.feld).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// Zeilen lesen
// ---------------------------------------------------------------------------

describe('Zeilen lesen', () => {
  test('liest ein bekanntes Ereignis', () => {
    const outcome = parseLine(serializeEvent(reply(3, 'Hallo')))
    expect(outcome.ok).toBe(true)
    expect(outcome.ok && outcome.event?.type).toBe('model-reply')
  })

  test('eine leere Zeile ist kein Fehler', () => {
    expect(parseLine('')).toEqual({ ok: true, event: undefined })
    expect(parseLine('   ')).toEqual({ ok: true, event: undefined })
    expect(parseLine('\r\n')).toEqual({ ok: true, event: undefined })
  })

  test('eine abgebrochene Zeile wird als Befund gemeldet, nicht geworfen', () => {
    const outcome = parseLine('{"v":1,"seq":9,"at":"2026-10-13T12:00:00.000Z","type":"user-inp')
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.problem).toContain('kein JSON')
  })

  test('eine Zeile ohne Versionsnummer wird gemeldet', () => {
    const outcome = parseLine('{"seq":1,"at":"x","type":"user-input","text":"a"}')
    expect(outcome.ok === false && outcome.problem).toContain('"v"')
  })

  test('eine Zeile ohne Nummer wird gemeldet', () => {
    const outcome = parseLine('{"v":1,"at":"x","type":"user-input","text":"a"}')
    expect(outcome.ok === false && outcome.problem).toContain('"seq"')
  })

  test('eine Zeile ohne Zeit wird gemeldet', () => {
    const outcome = parseLine('{"v":1,"seq":1,"type":"user-input","text":"a"}')
    expect(outcome.ok === false && outcome.problem).toContain('"at"')
  })

  test('eine Zeile ohne type wird gemeldet', () => {
    const outcome = parseLine('{"v":1,"seq":1,"at":"x"}')
    expect(outcome.ok === false && outcome.problem).toContain('"type"')
  })

  test('ein Feld statt eines Objekts wird gemeldet', () => {
    expect(parseLine('[1,2,3]').ok).toBe(false)
    expect(parseLine('"nur ein Text"').ok).toBe(false)
    expect(parseLine('42').ok).toBe(false)
  })

  test('eine unbekannte Art ist kein Fehler, sondern wird aufbewahrt', () => {
    const outcome = parseLine('{"v":1,"seq":2,"at":"x","type":"etwas-neues","wert":7}')
    expect(outcome.ok).toBe(true)
    const event = outcome.ok ? outcome.event : undefined
    expect(event?.type).toBe('unknown')
    expect(event?.type === 'unknown' && event.actualType).toBe('etwas-neues')
    expect(event?.type === 'unknown' && event.raw.wert).toBe(7)
  })

  test('eine neuere Fassung wird als unbekannt geführt, nicht als Fehler', () => {
    const outcome = parseLine('{"v":99,"seq":2,"at":"x","type":"user-input","text":"a"}')
    expect(outcome.ok).toBe(true)
    expect(outcome.ok && outcome.event?.type).toBe('unknown')
  })

  test('kennt genau die neun Ereignisarten dieser Fassung', () => {
    expect(KNOWN_EVENT_TYPES).toHaveLength(9)
    expect(isKnownType('turn-end')).toBe(true)
    expect(isKnownType('system-prompt')).toBe(true)
    expect(isKnownType('etwas-neues')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Ganze Datei lesen
// ---------------------------------------------------------------------------

describe('Ganze Datei lesen', () => {
  test('liest eine gültige Datei vollständig', () => {
    const text = textOf([start(), input(2, 'hallo'), reply(3, 'antwort'), turnEnd(4)])
    const report = parseSession(text)
    expect(report.problems).toEqual([])
    expect(report.events).toHaveLength(4)
    expect(report.highestVersion).toBe(SESSION_FORMAT_VERSION)
    expect(report.futureVersions).toBe(0)
  })

  test('eine kaputte Zeile kostet genau diese Zeile, nicht die Datei', () => {
    const text = `${serializeLine(start())}{kaputt\n${serializeLine(input(2, 'hallo'))}`
    const report = parseSession(text)
    expect(report.problems).toHaveLength(1)
    expect(report.problems[0]?.line).toBe(2)
    expect(report.events).toHaveLength(2)
  })

  test('zählt Zeilen einer neueren Fassung', () => {
    const text =
      serializeLine(start()) +
      '{"v":99,"seq":2,"at":"x","type":"user-input","text":"a"}\n' +
      serializeLine(reply(3, 'ok'))
    const report = parseSession(text)
    expect(report.futureVersions).toBe(1)
    expect(report.highestVersion).toBe(99)
    expect(report.events).toHaveLength(3)
  })

  test('eine leere Datei ergibt keine Ereignisse und keine Befunde', () => {
    const report = parseSession('')
    expect(report.events).toEqual([])
    expect(report.problems).toEqual([])
    expect(report.highestVersion).toBe(0)
  })

  test('behandelt CRLF-Zeilen wie LF', () => {
    const text = textOf([start(), input(2, 'hallo')]).replace(/\n/g, '\r\n')
    expect(parseSession(text).events).toHaveLength(2)
  })

  test('die letzte Zeile ohne Umbruch wird gelesen', () => {
    const text = `${serializeLine(start())}${serializeEvent(input(2, 'letzte'))}`
    expect(parseSession(text).events).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('Migration', () => {
  test('die Migrationskette ist leer und das ist ausdrücklich so', () => {
    // Kein Versehen: ohne Vorlage-Daten wäre jede Umwandlung geraten.
    expect(MIGRATIONS).toEqual([])
  })

  test('Ereignisse der Zielfassung gehen unverändert durch', () => {
    const events: ReadEvent[] = [start(), input(2, 'x')]
    const report = migrateEvents(events)
    expect(report.events).toHaveLength(2)
    expect(report.applied).toEqual([])
    expect(report.skipped).toEqual([])
  })

  test('eine ältere Zeile ohne Migration wird gemeldet, nicht stillschweigend verworfen', () => {
    const older: SessionEvent = { ...envelope(1), type: 'user-input', text: 'alt' }
    const raw = { ...older, v: 0 } as unknown as SessionEvent
    const report = migrateEvents([raw])
    expect(report.events).toEqual([])
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0]?.reason).toContain('keine Migration')
  })

  test('eine neuere Zeile wird mit Grund gemeldet', () => {
    const newer = { ...input(1, 'neu'), v: 99 } as SessionEvent
    const report = migrateEvents([newer])
    expect(report.events).toEqual([])
    expect(report.skipped[0]?.reason).toContain('neuer als die Zielfassung')
  })

  test('unbekannte Ereignisse gehen durch die Migration hindurch', () => {
    const unknown: UnknownEvent = {
      ...envelope(2),
      type: 'unknown',
      actualType: 'etwas-neues',
      raw: { v: SESSION_FORMAT_VERSION, seq: 2, at: AT, type: 'etwas-neues' },
    }
    const report = migrateEvents([unknown])
    expect(report.events).toHaveLength(1)
    expect(report.events[0]?.type).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// Falten
// ---------------------------------------------------------------------------

describe('Verlauf falten', () => {
  test('eine reine Textrunde ergibt System-nichts, Benutzer und Assistent', () => {
    const fold = foldSession([start(), input(2, 'hallo'), reply(3, 'antwort'), turnEnd(4)])
    expect(fold.messages).toHaveLength(2)
    expect(fold.messages[0]?.role).toBe('user')
    expect(fold.messages[1]?.role).toBe('assistant')
    expect(fold.lastTurnReason).toBe('stop')
    expect(fold.turns).toBe(0)
    expect(fold.problems).toEqual([])
  })

  test('eine Werkzeugrunde ergibt Aufruf und Ergebnis in dieser Reihenfolge', () => {
    const fold = foldSession([
      start(),
      input(2, 'lies'),
      replyWithCall(3, 'c1'),
      toolResult(4, 'c1'),
      reply(5, 'fertig'),
      turnEnd(6),
    ])
    expect(fold.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    const assistant = fold.messages[1]
    expect(assistant?.parts[0]?.type).toBe('tool-call')
    const tool = fold.messages[2]
    expect(tool?.parts[0]?.type).toBe('tool-result')
    expect(fold.problems).toEqual([])
  })

  test('summiert die Token über alle Zählerstände', () => {
    const fold = foldSession([start(), input(2, 'x'), usage(3, 10, 2), usage(4, 5, 1)])
    expect(fold.inputTokens).toBe(15)
    expect(fold.outputTokens).toBe(3)
  })

  test('meldet ein Ergebnis ohne Aufruf', () => {
    const fold = foldSession([start(), input(2, 'x'), toolResult(3, 'nie-gerufen')])
    expect(fold.problems).toEqual([{ seq: 3, problem: 'result-without-call' }])
  })

  test('meldet eine Lücke in der Nummerierung', () => {
    const fold = foldSession([start(), input(5, 'x')])
    expect(fold.problems.map((problem) => problem.problem)).toEqual(['gap-in-seq'])
  })

  test('meldet eine doppelte Nummerierung', () => {
    const fold = foldSession([start(), input(1, 'x')])
    expect(fold.problems.map((problem) => problem.problem)).toEqual(['duplicate-seq'])
  })

  test('meldet ein unbekanntes Ereignis, ohne es als leer zu behandeln', () => {
    const unknown: UnknownEvent = {
      ...envelope(2),
      type: 'unknown',
      actualType: 'etwas-neues',
      raw: { v: SESSION_FORMAT_VERSION, seq: 2, at: AT, type: 'etwas-neues' },
    }
    const fold = foldSession([start(), unknown])
    expect(fold.problems).toEqual([{ seq: 2, problem: 'unknown-event' }])
  })

  test('eine leere Ereignisfolge ergibt einen leeren Verlauf', () => {
    const fold = foldSession([])
    expect(fold.messages).toEqual([])
    expect(fold.inputTokens).toBe(0)
    expect(fold.lastTurnReason).toBeUndefined()
    expect(fold.problems).toEqual([])
  })

  test('zählt die Turns', () => {
    const fold = foldSession([
      start(),
      { ...envelope(2), type: 'turn-start', turn: 1, maxSteps: 25 },
      input(3, 'a'),
      reply(4, 'b'),
      { ...envelope(5), type: 'turn-start', turn: 2, maxSteps: 25 },
      input(6, 'c'),
      reply(7, 'd'),
    ])
    expect(fold.turns).toBe(2)
    expect(fold.messages).toHaveLength(4)
  })

  test('ein fehlerhaftes Turn-Ende wird als Grund geführt', () => {
    const fold = foldSession([start(), input(2, 'x'), turnEnd(3, 'error')])
    expect(fold.lastTurnReason).toBe('error')
  })

  test('die Beschreibung nennt Aufrufe und Ergebnisse', () => {
    const fold = foldSession([
      start(),
      input(2, 'lies'),
      replyWithCall(3, 'c1'),
      toolResult(4, 'c1', 'Inhalt'),
    ])
    const lines = describeMessages(fold.messages)
    expect(lines[0]).toBe('user: lies')
    expect(lines[1]).toBe('assistant: [Aufruf lesen]')
    expect(lines[2]).toBe('tool: [Ergebnis] Inhalt')
  })
})

// ---------------------------------------------------------------------------
// Rundlauf: schreiben, lesen, falten
// ---------------------------------------------------------------------------

describe('Rundlauf', () => {
  test('ein Verlauf übersteht Schreiben, Lesen und Falten unverändert', () => {
    const events: ReadEvent[] = [
      start(),
      { ...envelope(2), type: 'turn-start', turn: 1, maxSteps: 25 },
      input(3, 'lies a.txt\nund b.txt'),
      replyWithCall(4, 'c1'),
      toolResult(5, 'c1', 'Inhalt von a.txt'),
      usage(6, 40, 5),
      reply(7, 'Beides gelesen.'),
      turnEnd(8),
    ]
    const file = textOf(events)
    // Zwei Durchläufe: die Datei ist die einzige Quelle der Wahrheit.
    const first = foldSession(parseSession(file).events)
    const second = foldSession(parseSession(textOf(parseSession(file).events)).events)

    expect(second.messages).toEqual(first.messages)
    expect(second.inputTokens).toBe(first.inputTokens)
    expect(first.problems).toEqual([])
    expect(second.problems).toEqual([])

    // Und der Verlauf sieht so aus, wie der Loop ihn erzeugt hätte.
    const roles = first.messages.map((message: Message) => message.role)
    expect(roles).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(describeMessages(first.messages)[0]).toBe('user: lies a.txt\nund b.txt')
  })

  test('eine abgeschnittene Datei lässt sich weiterhin falten', () => {
    const file = textOf([start(), input(2, 'lies'), replyWithCall(3, 'c1')])
    // Der Absturz mitten in der nächsten Zeile:
    const truncated = `${file}{"v":1,"seq":4,"at":"${AT}","type":"tool-resu`
    const report = parseSession(truncated)
    expect(report.problems).toHaveLength(1)
    const fold = foldSession(report.events)
    expect(fold.messages).toHaveLength(2)
    // Der Aufruf bleibt ohne Ergebnis — und das wird **gemeldet**, nicht erfunden.
    expect(fold.problems).toEqual([])
  })

  test('ein unbekanntes Ereignis übersteht den Rundlauf und wird nicht verworfen', () => {
    const file =
      textOf([start(), input(2, 'x')]) + '{"v":1,"seq":3,"at":"' + AT + '","type":"etwas-neues","wert":7}\n'
    const report = parseSession(file)
    expect(report.events).toHaveLength(3)
    const written = textOf(report.events)
    expect(written).toContain('etwas-neues')
    expect(written).toContain('"wert":7')
  })
})
