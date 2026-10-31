/**
 * **Die zwei Programm-Routen — geprüft ohne Host und ohne Start.**
 *
 * Der Punkt dieser Datei ist die **Grenze**: `GET app` darf nur lesen, und
 * `POST app/open` darf einen Pfad außerhalb des Vaults **nicht** erreichen. Ein
 * Test, der nur den Erfolgsfall prüft, würde genau die Stelle übersehen, an der
 * ein Programmstart gefährlich wird.
 *
 * Gestartet wird in keinem Fall etwas: der Erfolgsfall von `app/open` ist hier
 * absichtlich nicht abgedeckt — er würde Obsidian wirklich öffnen.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appRoute, appOpenRoute } from '../src/index.ts'

/**
 * **Ein Vault für die Dauer dieser Datei.**
 *
 * `POST app/open` prüft den Pfad gegen den Vault. Ohne einen gibt es in CI nichts
 * zu prüfen, und die Route antwortet mit einem Umgebungsfehler statt mit dem, was
 * der Test meint. Die gespeicherte Einstellung liegt unter `DSH_HOME`; sie zeigt
 * hier auf ein Wegwerf-Verzeichnis.
 */
let haus: string
let vorher: string | undefined
beforeAll(() => {
  haus = mkdtempSync(join(tmpdir(), 'pmh-obsidian-'))
  const vault = join(haus, 'vault')
  mkdirSync(vault, { recursive: true })
  mkdirSync(join(haus, 'world'), { recursive: true })
  writeFileSync(join(haus, 'world', 'obsidian.json'), JSON.stringify({ vault }))
  vorher = process.env.DSH_HOME
  process.env.DSH_HOME = haus
})
afterAll(() => {
  if (vorher === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = vorher
  rmSync(haus, { recursive: true, force: true })
})

/** Eine Antwort, die alles mitschreibt, statt es zu senden. */
interface Aufzeichnung {
  readonly status: number
  readonly koerper: unknown
  readonly kopf: Record<string, string>
}

/**
 * Ruft einen Handler mit erfundenem Rumpf auf.
 *
 * @param handler - der zu prüfende Handler
 * @param rumpf - der Rumpf, den die Anfrage liefern soll
 * @returns Status, Körper und Köpfe der Antwort
 */
async function ruf(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  rumpf?: string,
): Promise<Aufzeichnung> {
  const kopf: Record<string, string> = {}
  let status = 0
  let text = ''
  const res = {
    set statusCode(wert: number) {
      status = wert
    },
    get statusCode() {
      return status
    },
    setHeader(name: string, wert: string) {
      kopf[name.toLowerCase()] = wert
    },
    end(stueck?: unknown) {
      if (typeof stueck === 'string') text = stueck
      else if (stueck instanceof Uint8Array) text = Buffer.from(stueck).toString('utf8')
    },
  } as unknown as ServerResponse

  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (rumpf !== undefined) yield Buffer.from(rumpf, 'utf8')
    },
  } as unknown as IncomingMessage

  await handler(req, res)
  return { status, koerper: text === '' ? undefined : JSON.parse(text), kopf }
}

describe('GET app', () => {
  test('meldet den Befund dieser Maschine und den Vault', async () => {
    const antwort = await ruf(appRoute)
    expect(antwort.status).toBe(200)
    expect(antwort.kopf['cache-control']).toBe('no-store')
    const koerper = antwort.koerper as { verfuegbar: boolean; exe: string | null; detail: string; vault: string | null }
    // **Beide Fälle sind ein Befund.** Auf einer Maschine mit Obsidian nennt die
    // Antwort die exe; auf einer ohne (CI) muss sie sagen, dass sie keine fand.
    // Vorher stand hier hart `true` — richtig auf der Entwicklungsmaschine, in CI
    // ein Fehler, der nicht die Erkennung prüfte, sondern die Ausstattung.
    if (koerper.verfuegbar) {
      expect(koerper.exe).toContain('Obsidian.exe')
      expect(koerper.vault).toBeString()
      expect(koerper.detail).toContain(koerper.exe ?? '')
    } else {
      expect(koerper.exe).toBeNull()
      expect(koerper.detail.length).toBeGreaterThan(0)
    }
  })
})

describe('POST app/open', () => {
  test('weist einen leeren Rumpf ab, ohne zu starten', async () => {
    const antwort = await ruf(appOpenRoute)
    expect(antwort.status).toBe(400)
    expect((antwort.koerper as { code: string }).code).toBe('leer')
  })

  test('weist einen Pfad außerhalb des Vaults ab, ohne zu starten', async () => {
    const antwort = await ruf(appOpenRoute, JSON.stringify({ note: '../../Windows/System32/notepad.exe' }))
    expect([400, 403]).toContain(antwort.status)
    expect((antwort.koerper as { ok: boolean }).ok).toBe(false)
  })

  test('weist eine nicht vorhandene Notiz ab, ohne zu starten', async () => {
    const antwort = await ruf(appOpenRoute, JSON.stringify({ note: 'gibt-es-nicht.md' }))
    expect(antwort.status).toBe(404)
    expect((antwort.koerper as { code: string }).code).toBe('nicht-gefunden')
  })
})
