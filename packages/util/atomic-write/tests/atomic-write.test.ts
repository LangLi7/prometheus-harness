/**
 * Tests gegen den **Prozessvertrag** von `pmh-atomicfs`.
 *
 * Zwei Ebenen:
 *  1. mit einem Testdoppel (Node-Skript), das jedes im Vertrag genannte
 *     Verhalten erzeugt — Erfolgszeile, Fehlerobjekt, Exit 125, kaputter
 *     Report, Zeitüberschreitung. Damit ist der Wrapper unabhängig davon
 *     prüfbar, ob ein Rust-Build vorliegt.
 *  2. mit dem **echten** Binary, wenn es gebaut ist (`target/debug`). Dann wird
 *     wirklich geschrieben, gelesen, die Identität verglichen und aufgeräumt.
 */

import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AtomicfsError,
  atomicfsAvailableSync,
  cleanup,
  identity,
  probe,
  readFileBytes,
  resolveAtomicfsBinary,
  writeFileAtomic,
} from '../src/index'

const fakeScript = join(import.meta.dir, 'fixtures', 'pmh-atomicfs-fake.mjs')
const node = Bun.which('node') ?? process.execPath

/**
 * Ein Aufruf des Testdoppels: `node <skript> <verhalten>` als Programmpfad plus
 * Vorspann-Argumente. Der Wrapper hängt seine fachlichen Argumente hinten an —
 * genau wie beim echten Binary.
 */
function fake(behavior: string): { binary: string; prefixArgs: string[] } {
  return { binary: node, prefixArgs: [fakeScript, behavior] }
}

describe('resolveAtomicfsBinary', () => {
  test('zeigt ohne Umgebungsvariablen auf target/debug', () => {
    const path = resolveAtomicfsBinary()
    expect(path).toContain('target')
    expect(path).toContain('pmh-atomicfs')
    expect(path.startsWith(import.meta.dir)).toBe(false)
  })
})

describe('writeFileAtomic — Erfolgsweg', () => {
  test('die Erfolgszeile wird vollständig aufbereitet', async () => {
    const report = await writeFileAtomic('C:\\temp\\a.jsonl', {
      ...fake('ok'),
      source: { text: 'hallo' },
    })
    expect(report.version).toBe(1)
    expect(report.path).toBe('C:\\temp\\a.jsonl')
    expect(report.bytes).toBe(5)
    expect(report.synced).toBe(5)
    expect(report.replaced).toBe(true)
    expect(report.identity).toEqual({ device: 66306, inode: 1234567 })
  })

  test('ein leerer Inhalt ist gültig', async () => {
    const report = await writeFileAtomic('leer.jsonl', { ...fake('ok'), source: { text: '' } })
    expect(report.bytes).toBe(0)
    expect(report.synced).toBe(0)
  })

  test('`--json` wird durchgereicht und stört den Report nicht', async () => {
    const report = await writeFileAtomic('b.jsonl', {
      ...fake('ok'),
      source: { text: 'x' },
      json: true,
    })
    expect(report.bytes).toBe(1)
  })

  test('`fromFile` schickt nichts nach stdin', async () => {
    const report = await writeFileAtomic('c.jsonl', {
      ...fake('ok'),
      source: { fromFile: 'C:\\temp\\quelle.txt' },
    })
    // Ohne stdin zählt der Doppelgänger 0 Bytes — der Pfad kommt durch.
    expect(report.path).toBe('c.jsonl')
    expect(report.bytes).toBe(0)
  })
})

describe('writeFileAtomic — Fehlerweg', () => {
  test('stderr-JSON wird zu einer AtomicfsError mit code', async () => {
    let caught: unknown
    try {
      await writeFileAtomic('a.jsonl', { ...fake('err'), source: { text: 'x' } })
    }
    catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AtomicfsError)
    const failure = caught as AtomicfsError
    expect(failure.code).toBe('ERR_ATOMIC_MOVE')
    expect(failure.exitCode).toBe(125)
    expect(failure.errno).toBeUndefined()
    expect(failure.message).toContain('MoveFileExW')
    expect(failure.stderr).toContain('ERR_ATOMIC_MOVE')
  })

  test('errno wird als Zahl übernommen', async () => {
    let caught: AtomicfsError | undefined
    try {
      await writeFileAtomic('a.jsonl', { ...fake('errno'), source: { text: 'x' } })
    }
    catch (error) {
      caught = error as AtomicfsError
    }
    expect(caught?.code).toBe('ERR_ATOMIC_OPEN')
    expect(caught?.errno).toBe(5)
  })

  test('Exit 125 ohne JSON ergibt ERR_ATOMICFS_EXIT', async () => {
    let caught: AtomicfsError | undefined
    try {
      await writeFileAtomic('a.jsonl', { ...fake('exit'), source: { text: 'x' } })
    }
    catch (error) {
      caught = error as AtomicfsError
    }
    expect(caught?.code).toBe('ERR_ATOMICFS_EXIT')
    expect(caught?.exitCode).toBe(125)
  })

  test('unbrauchbares stdout ergibt ERR_ATOMICFS_PROTOCOL', async () => {
    let caught: AtomicfsError | undefined
    try {
      await writeFileAtomic('a.jsonl', { ...fake('garbage'), source: { text: 'x' } })
    }
    catch (error) {
      caught = error as AtomicfsError
    }
    expect(caught?.code).toBe('ERR_ATOMICFS_PROTOCOL')
  })

  test('ein Report ohne `identity` wird abgelehnt', async () => {
    let caught: AtomicfsError | undefined
    try {
      await writeFileAtomic('a.jsonl', { ...fake('partial'), source: { text: 'x' } })
    }
    catch (error) {
      caught = error as AtomicfsError
    }
    expect(caught?.code).toBe('ERR_ATOMICFS_PROTOCOL')
  })

  test('ein nicht startbares Programm ergibt ERR_ATOMICFS_SPAWN', async () => {
    let caught: AtomicfsError | undefined
    try {
      await writeFileAtomic('a.jsonl', {
        binary: 'C:\\gibt-es-nicht-12345\\pmh-atomicfs.exe',
        source: { text: 'x' },
      })
    }
    catch (error) {
      caught = error as AtomicfsError
    }
    expect(caught?.code).toBe('ERR_ATOMICFS_SPAWN')
  })

  test('die Zeitüberschreitung bricht ab und meldet es', async () => {
    let caught: AtomicfsError | undefined
    try {
      await writeFileAtomic('a.jsonl', {
      ...fake('forever'),
        source: { text: 'x' },
        timeoutMs: 300,
      })
    }
    catch (error) {
      caught = error as AtomicfsError
    }
    expect(caught?.code).toBe('ERR_ATOMICFS_TIMEOUT')
  })

  test('ein Abbruchsignal des Aufrufers ergibt ABORTED', async () => {
    const controller = new AbortController()
    const pending = writeFileAtomic('a.jsonl', {
      ...fake('forever'),
      source: { text: 'x' },
      signal: controller.signal,
      timeoutMs: 5_000,
    })
    setTimeout(() => controller.abort(), 150)
    let caught: AtomicfsError | undefined
    try {
      await pending
    }
    catch (error) {
      caught = error as AtomicfsError
    }
    expect(caught?.code).toBe('ABORTED')
  })
})

describe('identity, cleanup, probe am Testdoppel', () => {
  test('identity liefert Gerät und Inode', async () => {
    const report = await identity('a.jsonl', { ...fake('identity') })
    expect(report.path).toBe('a.jsonl')
    expect(report.identity.device).toBe(66306)
    expect(report.identity.inode).toBe(1234567)
  })

  test('cleanup meldet, ob es etwas entfernt hat', async () => {
    const report = await cleanup('a.jsonl', { ...fake('cleanup') })
    expect(report.removed).toBe(true)
  })

  test('probe liest die Fähigkeiten und behält unbekannte Felder', async () => {
    const capabilities = await probe({ ...fake('probe') })
    expect(capabilities.writeThrough).toBe(true)
    expect(capabilities.directorySync).toBe(true)
    expect(capabilities.identity).toBe(true)
    expect(capabilities.extra['mechanism']).toBe('MoveFileExW')
  })

  test('read gibt die Bytes unverändert zurück', async () => {
    const bytes = await readFileBytes('a.jsonl', { ...fake('read') })
    expect(bytes).toBeInstanceOf(Uint8Array)
  })
})

describe('gegen das echte Rust-Binary', () => {
  const available = atomicfsAvailableSync()

  test.skipIf(!available)('write, read, identity und cleanup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pmh-atomicfs-'))
    const target = join(directory, 'sitzung.jsonl')
    try {
      const first = await writeFileAtomic(target, { source: { text: 'zeile eins\n' } })
      expect(first.bytes).toBe(11)
      expect(first.synced).toBe(11)
      expect(first.replaced).toBe(false)

      const before = await identity(target)
      expect(before.identity.inode).toBeGreaterThan(0)

      const second = await writeFileAtomic(target, { source: { text: 'zeile eins\nzeile zwei\n' } })
      // Garantie 1 der Vorlage: das Ersetzen wechselt die Identität.
      expect(second.replaced).toBe(true)
      const after = await identity(target)
      expect(after.identity.inode).not.toBe(before.identity.inode)

      const bytes = await readFileBytes(target)
      expect(new TextDecoder().decode(bytes)).toBe('zeile eins\nzeile zwei\n')

      const cleaned = await cleanup(target)
      expect(typeof cleaned.removed).toBe('boolean')

      const capabilities = await probe()
      expect(capabilities.version).toBe(1)

      // Auch über eine Datei als Quelle.
      const source = join(directory, 'quelle.txt')
      await writeFile(source, 'aus datei\n')
      const third = await writeFileAtomic(target, { source: { fromFile: source } })
      expect(third.bytes).toBe(10)
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test.skipIf(!available)('ein fehlender Pfad ergibt einen typisierten Fehler', async () => {
    let caught: AtomicfsError | undefined
    try {
      await writeFileAtomic(join(tmpdir(), 'gibt-es-nicht-12345', 'x.jsonl'), { source: { text: 'x' } })
    }
    catch (error) {
      caught = error as AtomicfsError
    }
    expect(caught).toBeInstanceOf(AtomicfsError)
    expect(caught?.exitCode).toBe(125)
    expect(caught?.code.length).toBeGreaterThan(0)
  })
})
