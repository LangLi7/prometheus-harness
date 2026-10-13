/**
 * Tests für die JSONL-Persistenz.
 *
 * **Was hier geprüft wird.** Nicht „schreiben und lesen klappt", sondern die
 * Fälle, die eine Sitzung **verlieren**:
 *
 * - ein Absturz mitten in einer Zeile (die letzte Zeile ist abgebrochen)
 * - eine Lücke in der Nummerierung (darf **nicht** stillschweigend weitergehen)
 * - eine Zeile mit falscher Nummer (darf **nicht** geschrieben werden)
 * - eine Sitzungskennung mit Pfadanteilen (Pfadausbruch)
 * - Schreiben aus zwei Strängen gleichzeitig (die Reihenfolge muss halten)
 *
 * **Jeder Test arbeitet in einem eigenen temporären Ordner** und räumt ihn
 * wieder weg. Tests, die einander den Ordner streitig machen, erzeugen
 * Fehlalarme — die gibt es in diesem Projekt schon (siehe Arbeitspakete, P2).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SESSION_FORMAT_VERSION, serializeLine, type ReadEvent } from '@prometheus-harness/session-format'
import {
  EVENTS_FILENAME,
  META_FILENAME,
  assertUsableSessionId,
  createSession,
  deleteSession,
  listSessions,
  newSessionId,
  openSession,
  readSession,
  renameSession,
  sessionDirOf,
  sessionExists,
  sessionPaths,
  writeSession,
} from '../src/index.ts'

// ---------------------------------------------------------------------------
// Prüfgerüst
// ---------------------------------------------------------------------------

/** Der Wurzelordner dieses Tests. */
let root = ''
/** Eine feste Zeit, damit nichts vom Augenblick abhängt. */
const AT = '2026-10-13T12:00:00.000Z'
const NOW = (): Date => new Date(AT)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pmh-session-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Eine Benutzereingabe. */
function input(seq: number, text: string): ReadEvent {
  return { v: SESSION_FORMAT_VERSION, seq, at: AT, type: 'user-input', text }
}

/** Eine Modellantwort. */
function reply(seq: number, text: string): ReadEvent {
  return {
    v: SESSION_FORMAT_VERSION,
    seq,
    at: AT,
    type: 'model-reply',
    turn: 1,
    step: 1,
    text,
    toolCalls: [],
    finishReason: 'stop',
  }
}

/** Eine Modellantwort mit Werkzeugaufruf. */
function replyWithCall(seq: number, callId: string): ReadEvent {
  return {
    v: SESSION_FORMAT_VERSION,
    seq,
    at: AT,
    type: 'model-reply',
    turn: 1,
    step: 1,
    text: '',
    toolCalls: [{ id: callId, name: 'lesen', arguments: { pfad: 'a.txt' } }],
    finishReason: 'tool-calls',
  }
}

/** Ein Werkzeugergebnis. */
function toolResult(seq: number, callId: string, content = 'Inhalt'): ReadEvent {
  return {
    v: SESSION_FORMAT_VERSION,
    seq,
    at: AT,
    type: 'tool-result',
    turn: 1,
    step: 1,
    callId,
    name: 'lesen',
    content,
    failed: false,
    durationMs: 2,
  }
}

// ---------------------------------------------------------------------------
// Kennungen und Pfade
// ---------------------------------------------------------------------------

describe('Kennungen und Pfade', () => {
  test('lehnt einen Pfadtrenner ab — sonst schreibt die Sitzung außerhalb der Wurzel', () => {
    expect(() => assertUsableSessionId('a/b')).toThrow('Pfadtrenner')
    expect(() => assertUsableSessionId('a\\b')).toThrow('Pfadtrenner')
  })

  test('lehnt ".." und "." ab', () => {
    expect(() => assertUsableSessionId('..')).toThrow('Pfadverweis')
    expect(() => assertUsableSessionId('.')).toThrow('Pfadverweis')
  })

  test('lehnt einen führenden Punkt ab — sonst ist die Sitzung unsichtbar', () => {
    expect(() => assertUsableSessionId('.versteckt')).toThrow('beginnen')
  })

  test('lehnt einen Doppelpunkt ab — Laufwerk oder NTFS-Datenstrom', () => {
    expect(() => assertUsableSessionId('C:x')).toThrow('Doppelpunkt')
  })

  test('lehnt eine leere und eine zu lange Kennung ab', () => {
    expect(() => assertUsableSessionId('')).toThrow('leer')
    expect(() => assertUsableSessionId('a'.repeat(129))).toThrow('zu lang')
  })

  test('nimmt eine gewöhnliche Kennung an', () => {
    expect(() => assertUsableSessionId('2026-10-13T12-00-00-000Z-abcd')).not.toThrow()
  })

  test('baut die drei Pfade', () => {
    const paths = sessionPaths('/wurzel', 's1')
    expect(paths.dir).toBe(join('/wurzel', 's1'))
    expect(paths.events).toBe(join('/wurzel', 's1', EVENTS_FILENAME))
    expect(paths.meta).toBe(join('/wurzel', 's1', META_FILENAME))
    expect(sessionDirOf('/wurzel', 's1')).toBe(paths.dir)
  })

  test('eine Kennung aus der Zeit ist sortierbar und ohne Doppelpunkte', () => {
    const id = newSessionId(new Date(AT), () => 0.5)
    expect(id.startsWith('2026-10-13T12-00-00-000Z-')).toBe(true)
    expect(id).not.toContain(':')
    expect(() => assertUsableSessionId(id)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Anlegen und Schreiben
// ---------------------------------------------------------------------------

describe('Anlegen und Schreiben', () => {
  test('legt Ordner, Zustandsbild und die erste Zeile an', async () => {
    const writer = await createSession({ root, id: 's1', model: 'deepseek-chat', cwd: '/w', now: NOW })
    const text = await readFile(writer.paths.events, 'utf8')
    const lines = text.split('\n').filter((line) => line !== '')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('"type":"session-start"')
    const meta = JSON.parse(await readFile(writer.paths.meta, 'utf8')) as Record<string, unknown>
    expect(meta.id).toBe('s1')
    expect(meta.model).toBe('deepseek-chat')
    expect(meta.createdAt).toBe(AT)
  })

  test('lehnt eine bereits vorhandene Sitzung ab', async () => {
    await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await expect(createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })).rejects.toThrow(
      'existiert bereits',
    )
  })

  test('hängt Ereignisse in Reihenfolge an', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await writer.append(input(2, 'hallo'))
    await writer.append(reply(3, 'antwort'))
    await writer.close()
    const report = await readSession(root, 's1')
    expect(report.events).toHaveLength(3)
    expect(report.problems).toEqual([])
    expect(report.foldProblems).toEqual([])
    expect(report.fold.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
  })

  test('erzwingt die richtige Nummer und schreibt eine falsche nicht', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await expect(writer.append(input(7, 'falsch'))).rejects.toThrow('erwartet war 2')
    // Und der Schreiber bleibt benutzbar.
    await writer.append(input(2, 'richtig'))
    await writer.close()
    const report = await readSession(root, 's1')
    expect(report.events).toHaveLength(2)
    expect(report.foldProblems).toEqual([])
  })

  test('aktualisiert den Zustand beim Schließen', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await writer.append(input(2, 'x'))
    await writer.close()
    const meta = JSON.parse(await readFile(writer.paths.meta, 'utf8')) as Record<string, unknown>
    expect(meta.events).toBe(2)
  })

  test('lehnt ein Anhängen nach dem Schließen ab', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await writer.close()
    await expect(writer.append(input(2, 'x'))).rejects.toThrow('geschlossen')
  })

  test('schreibt einen Text mit Umbruch als eine Zeile — und liest ihn unverändert', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    const text = 'erste\nzweite\n\ndritte'
    await writer.append(input(2, text))
    await writer.close()
    const report = await readSession(root, 's1')
    const event = report.events[1]
    expect(event?.type === 'user-input' && event.text).toBe(text)
    expect(report.problems).toEqual([])
  })

  test('hält die Reihenfolge bei vielen gleichzeitigen Anhängen', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    // Bewusst **nicht** abgewartet: genau so entsteht der Wettlauf, den die
    // Warteschlange im Schreiber auflösen muss.
    const pending: Promise<void>[] = []
    for (let seq = 2; seq <= 60; seq += 1) pending.push(writer.append(input(seq, `nr ${seq}`)))
    await Promise.all(pending)
    await writer.close()

    const report = await readSession(root, 's1')
    // 1 Sitzungsbeginn + 59 Eingaben.
    expect(report.events).toHaveLength(60)
    expect(report.foldProblems).toEqual([])
    // Und die Reihenfolge **auf der Platte** stimmt mit der Nummerierung überein.
    const raw = await readFile(writer.paths.events, 'utf8')
    const seqs = raw
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => (JSON.parse(line) as { seq: number }).seq)
    // Alle 60 Zeilen sind lesbar **und** in Nummernfolge — das ist die Zusage
    // der Warteschlange im Schreiber.
    expect(seqs).toEqual([...Array(60).keys()].map((index) => index + 1))
  })

  test('puffert bei flushEvery und schreibt beim Flush alles', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW, flushEvery: 10 })
    await writer.append(input(2, 'a'))
    await writer.append(input(3, 'b'))
    const before = await readFile(writer.paths.events, 'utf8')
    // Nur die erste Zeile ist geschrieben; die zwei liegen im Puffer.
    expect(before.split('\n').filter((line) => line !== '')).toHaveLength(1)
    await writer.flush()
    const after = await readFile(writer.paths.events, 'utf8')
    expect(after.split('\n').filter((line) => line !== '')).toHaveLength(3)
    await writer.close()
  })
})

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

describe('Lesen', () => {
  test('liest eine Werkzeugrunde und faltet sie vollständig', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await writer.append(input(2, 'lies'))
    await writer.append(replyWithCall(3, 'c1'))
    await writer.append(toolResult(4, 'c1'))
    await writer.append(reply(5, 'fertig'))
    await writer.close()

    const report = await readSession(root, 's1')
    expect(report.problems).toEqual([])
    expect(report.foldProblems).toEqual([])
    expect(report.fold.messages.map((message) => message.role)).toEqual([
      'user', 'assistant', 'tool', 'assistant',
    ])
  })

  test('meldet eine abgebrochene letzte Zeile als abgebrochenen Schwanz', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await writer.append(input(2, 'hallo'))
    await writer.close()
    // Der Absturz: eine halbe Zeile wird angehängt.
    await writeFile(writer.paths.events, `${await readFile(writer.paths.events, 'utf8')}{"v":1,"seq":3,"at":"${AT}","type":"user-inp`, 'utf8')

    const report = await readSession(root, 's1')
    expect(report.truncatedTail).toBe(true)
    expect(report.problems).toHaveLength(1)
    expect(report.events).toHaveLength(2)
    // Der Rest bleibt vollständig lesbar.
    expect(report.fold.messages).toHaveLength(1)
  })

  test('meldet eine Lücke in der Nummerierung', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await writer.append(input(2, 'a'))
    await writer.close()
    // Eine Zeile mit Nummer 5 wird direkt angehängt (Simulation eines fremden Schreibers).
    await writeFile(
      writer.paths.events,
      `${await readFile(writer.paths.events, 'utf8')}${serializeLine(input(5, 'b'))}`,
      'utf8',
    )
    const report = await readSession(root, 's1')
    expect(report.foldProblems).toEqual([{ seq: 5, problem: 'gap-in-seq' }])
  })

  test('wirft bei einer nicht vorhandenen Sitzung', async () => {
    await expect(readSession(root, 'gibtsnicht')).rejects.toThrow('nicht lesbar')
  })

  test('liest den Zustand aus meta.json', async () => {
    const writer = await createSession({ root, id: 's1', model: 'deepseek-chat', cwd: '/w', now: NOW, title: 'Erste' })
    await writer.close()
    const report = await readSession(root, 's1')
    expect(report.meta?.title).toBe('Erste')
    expect(report.meta?.model).toBe('deepseek-chat')
  })

  test('ein kaputtes meta.json ist kein Leseabbruch', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await writer.close()
    await writeFile(writer.paths.meta, '{kaputt', 'utf8')
    const report = await readSession(root, 's1')
    expect(report.meta).toBeUndefined()
    expect(report.events).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Wiederaufnahme
// ---------------------------------------------------------------------------

describe('Wiederaufnahme', () => {
  test('setzt die Nummerierung nach der letzten gültigen Zeile fort', async () => {
    const first = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await first.append(input(2, 'erster Turn'))
    await first.append(reply(3, 'erste Antwort'))
    await first.close()

    const { writer, report } = await openSession(root, 's1', { now: NOW })
    expect(report.events).toHaveLength(3)
    expect(writer.appended).toBe(0)
    await writer.append(input(4, 'zweiter Turn'))
    await writer.append(reply(5, 'zweite Antwort'))
    await writer.close()

    const after = await readSession(root, 's1')
    expect(after.events).toHaveLength(5)
    expect(after.foldProblems).toEqual([])
    // Der Verlauf ist durchgehend: zwei Benutzereingaben, zwei Antworten.
    expect(after.fold.messages.map((message) => message.role)).toEqual([
      'user', 'assistant', 'user', 'assistant',
    ])
  })

  test('verwendet die Nummer einer abgebrochenen Zeile wieder — statt eine Lücke zu reißen', async () => {
    const first = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await first.append(input(2, 'a'))
    await first.close()
    // Absturz mitten in Zeile 3.
    await writeFile(
      first.paths.events,
      `${await readFile(first.paths.events, 'utf8')}{"v":1,"seq":3,"at":"${AT}","type":"user-inp`,
      'utf8',
    )

    const { writer, report } = await openSession(root, 's1', { now: NOW })
    expect(report.truncatedTail).toBe(true)
    // Zeile 3 ist nie gültig gewesen — ihre Nummer ist frei.
    await writer.append(input(3, 'nach dem Absturz'))
    await writer.close()

    // **Der Rest der kaputten Zeile ist weg.** Bliebe er stehen, wäre die neue,
    // gültige Zeile an ihn angehängt und damit selbst unlesbar.
    const raw = await readFile(writer.paths.events, 'utf8')
    expect(raw).not.toContain('"type":"user-inp{')
    expect(raw.split('\n').filter((line) => line !== '')).toHaveLength(3)

    const after = await readSession(root, 's1')
    expect(after.problems).toEqual([])
    expect(after.foldProblems).toEqual([])
    expect(after.fold.messages).toHaveLength(2)
  })

  test('verweigert die Fortsetzung bei mehr als einer Lücke', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await writer.append(input(2, 'a'))
    await writer.close()
    const content = await readFile(writer.paths.events, 'utf8')
    await writeFile(
      writer.paths.events,
      `${content}${serializeLine(input(5, 'b'))}${serializeLine(input(9, 'c'))}`,
      'utf8',
    )
    await expect(openSession(root, 's1', { now: NOW })).rejects.toThrow('Lücken')
  })

  test('verweigert die Fortsetzung bei einem Ergebnis ohne Aufruf', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await writer.append(toolResult(2, 'nie-gerufen'))
    await writer.close()
    await expect(openSession(root, 's1', { now: NOW })).rejects.toThrow('nicht fortsetzbar')
  })

  test('wirft beim Öffnen einer nicht vorhandenen Sitzung', async () => {
    await expect(openSession(root, 'gibtsnicht', { now: NOW })).rejects.toThrow('nicht lesbar')
  })
})

// ---------------------------------------------------------------------------
// Verwalten
// ---------------------------------------------------------------------------

describe('Verwalten', () => {
  test('listet Sitzungen sortiert nach Kennung', async () => {
    await (await createSession({ root, id: 'b', model: 'm', cwd: '/w', now: NOW })).close()
    await (await createSession({ root, id: 'a', model: 'm', cwd: '/w', now: NOW })).close()
    const list = await listSessions(root)
    expect(list.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(list[0]?.lines).toBe(1)
    expect(list[0]?.truncatedTail).toBe(false)
  })

  test('eine leere oder fehlende Wurzel ergibt eine leere Liste', async () => {
    expect(await listSessions(join(root, 'gibtsnicht'))).toEqual([])
  })

  test('überspringt einen kaputten Ordner, statt die Liste zu verhindern', async () => {
    await (await createSession({ root, id: 'gut', model: 'm', cwd: '/w', now: NOW })).close()
    await mkdir(join(root, 'kaputt'), { recursive: true })
    const list = await listSessions(root)
    expect(list.map((entry) => entry.id)).toEqual(['gut'])
  })

  test('benennt um, ohne die Ereignisse anzufassen', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await writer.append(input(2, 'x'))
    await writer.close()
    const before = await readFile(writer.paths.events, 'utf8')
    await renameSession(root, 's1', 'Neuer Titel')
    const report = await readSession(root, 's1')
    expect(report.meta?.title).toBe('Neuer Titel')
    expect(await readFile(writer.paths.events, 'utf8')).toBe(before)
  })

  test('wirft beim Umbenennen ohne lesbares Zustandsbild', async () => {
    await mkdir(join(root, 's1'), { recursive: true })
    await expect(renameSession(root, 's1', 'x')).rejects.toThrow('kein lesbares')
  })

  test('löscht eine Sitzung samt Ordner', async () => {
    const writer = await createSession({ root, id: 's1', model: 'm', cwd: '/w', now: NOW })
    await writer.close()
    expect(await sessionExists(root, 's1')).toBe(true)
    await deleteSession(root, 's1')
    expect(await sessionExists(root, 's1')).toBe(false)
    await expect(readSession(root, 's1')).rejects.toThrow()
  })

  test('deleteSession ist bei einer fehlenden Sitzung kein Fehler', async () => {
    await expect(deleteSession(root, 'gibtsnicht')).resolves.toBeUndefined()
  })

  test('writeSession schreibt einen ganzen Verlauf', async () => {
    const writer = await writeSession({
      root,
      id: 's1',
      model: 'm',
      cwd: '/w',
      now: NOW,
      events: [
        { v: SESSION_FORMAT_VERSION, seq: 1, at: AT, type: 'session-start', id: 's1', model: 'm', cwd: '/w', writer: 't' },
        input(2, 'hallo'),
        reply(3, 'antwort'),
      ],
    })
    await writer.close()
    const report = await readSession(root, 's1')
    expect(report.events).toHaveLength(3)
    expect(report.foldProblems).toEqual([])
  })
})
