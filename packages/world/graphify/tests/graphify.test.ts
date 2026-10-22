/**
 * **Graphify — geprüft ohne CLI und ohne Host.**
 *
 * Drei Dinge werden hier gezeigt:
 *
 * 1. **Die Übersetzung** aus einem echten `graph.json` (drei Knoten, zwei
 *    Kanten, eine `EXTRACTED`, eine `INFERRED`) in die Form der Welt — samt
 *    Quellenstatus.
 * 2. **Die Konfiguration** auf einem Wegwerf-Home: Vorgaben, Speichern,
 *    Ablehnungen. `DSH_HOME` wird dafür gesetzt und danach zurückgesetzt.
 * 3. **Die kleinen Handgriffe**: die festen Lauf-Argumente und die HTTP-Helfer
 *    (`json`, `readJson`, Localhost-Prüfung).
 *
 * Ein echter Graphify-Lauf kommt **nicht** vor: die CLI ist hier nicht
 * installiert, und ein Test, der sie voraussetzt, wäre auf jedem anderen
 * Rechner rot.
 */

import { afterEach, beforeEach, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  argsFuer,
  graphDatei,
  konfigDatei,
  leseConfig,
  speichereConfig,
  validiereAenderung,
} from '../src/config.ts'
import { istLokal, json, normalisiereAdresse, readJson } from '../src/http.ts'
import { PRAEFIX, worldGraphAus } from '../src/mapping.ts'
import {
  graphifyStatus,
  macheRunHandler,
  macheSetupHandler,
  macheStatusHandler,
  methodeAus,
  modusAus,
} from '../src/index.ts'

// ── Ein Wegwerf-Home ─────────────────────────────────────────────────────────

/** Das Home dieses Tests; `beforeEach` legt es an. */
let home = ''

/** `DSH_HOME`, wie es vor dem Test stand. */
const ALT = process.env['DSH_HOME']

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'pmh-graphify-'))
  process.env['DSH_HOME'] = home
})

afterEach(() => {
  if (home !== '') rmSync(home, { recursive: true, force: true })
  home = ''
  if (ALT === undefined) delete process.env['DSH_HOME']
  else process.env['DSH_HOME'] = ALT
})

// ── Die Übersetzung ─────────────────────────────────────────────────────────

/** Der feste Zeitpunkt, damit die Ausgabe vergleichbar ist. */
const ZEIT = '2026-10-18T12:00:00.000Z'

/** Das kleine Fixture — drei Knoten, zwei Kanten, keine echten Daten. */
const FIXTURE = new URL('./fixtures/graph.json', import.meta.url)

/**
 * Liest das Fixture frisch.
 *
 * @returns der geparste Wert
 */
function fixture(): unknown {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as unknown
}

test('Knoten bekommen das Präfix, die Art und die Herkunft', () => {
  const graph = worldGraphAus(fixture(), 'graphify-out/graph.json', ZEIT)
  expect(graph.nodes.map((knoten) => knoten.id)).toEqual([
    `${PRAEFIX}httpx/_client.py`,
    `${PRAEFIX}httpx/_client.py:Client`,
    `${PRAEFIX}httpx`,
  ])
  // Datei über die Endung, Symbol über den fehlenden Dateinamen, Datei über L1 ohne Unterstrich.
  expect(graph.nodes.map((knoten) => knoten.kind)).toEqual(['file', 'symbol', 'file'])
  expect(graph.nodes.every((knoten) => knoten.source === 'graphify')).toBe(true)
  expect(graph.nodes[0]?.label).toBe('_client.py')
  expect(graph.nodes[0]?.path).toBe('httpx/_client.py')
  expect(graph.nodes[0]?.community).toBe(1)
  expect(graph.nodes[1]?.community).toBe(1)
  expect(graph.nodes[2]?.community).toBe(2)
})

test('Kanten behalten Beziehung, Rohbezeichnung und Sicherheitsstufe', () => {
  const graph = worldGraphAus(fixture(), 'graphify-out/graph.json', ZEIT)
  expect(graph.edges).toEqual([
    {
      from: `${PRAEFIX}httpx/_client.py`,
      to: `${PRAEFIX}httpx/_client.py:Client`,
      kind: 'contains',
      confidence: 'EXTRACTED',
      relation: 'contains',
    },
    {
      from: `${PRAEFIX}httpx/_client.py:Client`,
      to: `${PRAEFIX}httpx`,
      kind: 'imports',
      confidence: 'INFERRED',
      relation: 'imports_from',
    },
  ])
})

test('der Quellenstatus nennt Datei, Zeitpunkt und Anzahl', () => {
  const graph = worldGraphAus(fixture(), 'graphify-out/graph.json', ZEIT)
  expect(graph.generatedAt).toBe(ZEIT)
  expect(graph.sources.length).toBe(1)
  const status = graph.sources[0]
  expect(status?.id).toBe('graphify')
  expect(status?.label).toBe('Graphify')
  expect(status?.available).toBe(true)
  expect(status?.nodes).toBe(3)
  expect(status?.edges).toBe(2)
  expect(status?.detail).toContain('graphify-out/graph.json')
  expect(status?.detail).toContain(ZEIT)
  expect(status?.detail).toContain('3 Knoten')
})

test('kaputte Eingaben ergeben einen gültigen leeren Graphen — keinen Wurf', () => {
  const ohne = worldGraphAus(null, 'kaputt.json', ZEIT)
  expect(ohne.nodes).toEqual([])
  expect(ohne.edges).toEqual([])
  expect(ohne.generatedAt).toBe(ZEIT)
  expect(ohne.sources[0]?.available).toBe(false)
  expect(ohne.sources[0]?.nodes).toBe(0)
  expect(ohne.sources[0]?.error).toBeDefined()

  const falscheListe = worldGraphAus({ nodes: 'nein', links: [] }, 'x.json', ZEIT)
  expect(falscheListe.sources[0]?.available).toBe(false)

  const leer = worldGraphAus({ nodes: [], links: [] }, 'x.json', ZEIT)
  expect(leer.sources[0]?.available).toBe(true)
  expect(leer.nodes).toEqual([])
})

test('einzelne unbrauchbare Einträge werden übersprungen, nicht der ganze Graph', () => {
  const teil = worldGraphAus(
    {
      nodes: [null, { id: 'a', label: 'A' }, { label: 'ohne id' }],
      links: [{ source: 'a' }, null, { source: 'a', target: 'b' }],
    },
    'x.json',
    ZEIT,
  )
  expect(teil.nodes.map((knoten) => knoten.id)).toEqual([`${PRAEFIX}a`])
  expect(teil.edges.length).toBe(1)
})

test('unbekannte confidence wird AMBIGUOUS, unbekannte relation „relation"', () => {
  const graph = worldGraphAus(
    { nodes: [], links: [{ source: 'a', target: 'b' }] },
    'x.json',
    ZEIT,
  )
  expect(graph.edges[0]?.confidence).toBe('AMBIGUOUS')
  expect(graph.edges[0]?.kind).toBe('relation')
  expect(graph.edges[0]?.relation).toBeUndefined()
})

// ── Die Konfiguration ──────────────────────────────────────────────────────

test('ohne Datei gelten die Vorgaben', () => {
  expect(leseConfig()).toEqual({
    command: 'graphify',
    outDir: 'graphify-out',
    root: process.cwd(),
    setup: 'auto',
  })
  expect(konfigDatei()).toBe(join(home, 'world', 'graphify.json'))
  expect(existsSync(konfigDatei())).toBe(false)
})

test('Speichern legt das Verzeichnis an und ergänzt fehlende Felder', () => {
  const gespeichert = speichereConfig({ command: 'graphify-cli', outDir: 'aus' })
  expect(gespeichert.ok).toBe(true)
  if (!gespeichert.ok) return
  expect(gespeichert.wert).toEqual({
    command: 'graphify-cli',
    outDir: 'aus',
    root: process.cwd(),
    setup: 'auto',
  })
  expect(existsSync(konfigDatei())).toBe(true)
  // Die Datei enthält genau die vier Felder — nicht mehr.
  const roh = JSON.parse(readFileSync(konfigDatei(), 'utf8')) as unknown
  expect(roh).toEqual({
    command: 'graphify-cli',
    outDir: 'aus',
    root: process.cwd(),
    setup: 'auto',
  })
  expect(leseConfig()).toEqual(gespeichert.wert)
})

test('absolute Pfade sind erlaubt, `..` und leere Werte nicht', () => {
  const absolut = resolve(home, 'repo')
  const ok = speichereConfig({ outDir: absolut, root: absolut })
  expect(ok.ok).toBe(true)
  if (ok.ok) expect(ok.wert.outDir).toBe(absolut)

  const abgelehnt: readonly unknown[] = [
    null,
    { command: '' },
    { command: '   ' },
    { command: 7 },
    { outDir: '' },
    { outDir: '../raus' },
    { root: 'a/../b' },
    { root: 'C:\\repo\\..\\raus' },
  ]
  for (const koerper of abgelehnt) {
    expect(speichereConfig(koerper).ok).toBe(false)
  }
})

test('nur genannte Felder ändern sich', () => {
  const basis = { command: 'graphify', outDir: 'graphify-out', root: 'repo', setup: 'auto' as const }
  expect(validiereAenderung({ command: 'neu' }, basis)).toEqual({
    ok: true,
    wert: { command: 'neu', outDir: 'graphify-out', root: 'repo', setup: 'auto' },
  })
})

test('graph.json liegt in outDir — relativ zu root oder absolut', () => {
  const relativ = { command: 'g', outDir: 'graphify-out', root: resolve(home, 'repo'), setup: 'auto' as const }
  expect(graphDatei(relativ)).toBe(resolve(home, 'repo', 'graphify-out', 'graph.json'))

  const absolut = { command: 'g', outDir: resolve(home, 'aus'), root: resolve(home, 'repo'), setup: 'auto' as const }
  expect(graphDatei(absolut)).toBe(join(resolve(home, 'aus'), 'graph.json'))
})

test('die Statusauskunft lebt auch von einem vorhandenen Graphen allein', () => {
  const outDir = join(home, 'aus')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'graph.json'), JSON.stringify(fixture()), 'utf8')
  expect(speichereConfig({ outDir }).ok).toBe(true)

  const status = graphifyStatus()
  expect(status.id).toBe('graphify')
  expect(status.available).toBe(true)
  expect(status.nodes).toBe(3)
  expect(status.edges).toBe(2)
  expect(status.graphFile).toBe(join(outDir, 'graph.json'))
  // Der Graph allein genügt — ob die CLI daneben gefunden wird, ist für den
  // Status unerheblich. Der Test prüft deshalb den Graphen, nicht die CLI.
  expect(status.detail).toContain('Graph:')
})

// ── Die Lauf-Argumente (reine Funktion) ────────────────────────────────────

test('die Argumente eines Laufs sind fest und kommen nie aus dem Körper', () => {
  expect(argsFuer()).toEqual(['.', '--code-only'])
  expect(argsFuer('deep')).toEqual(['.', '--code-only', '--mode', 'deep'])
  expect(argsFuer('update')).toEqual(['.', '--code-only', '--update'])
})

test('mode nimmt nur deep und update an', () => {
  expect(modusAus({})).toEqual({ ok: true, mode: undefined })
  expect(modusAus({ mode: 'deep' })).toEqual({ ok: true, mode: 'deep' })
  expect(modusAus({ mode: 'update' })).toEqual({ ok: true, mode: 'update' })
  expect(modusAus({ mode: 'full' }).ok).toBe(false)
  expect(modusAus({ mode: 'DEEP' }).ok).toBe(false)
  expect(modusAus(null).ok).toBe(false)
  expect(modusAus({ mode: 1 }).ok).toBe(false)
})

// ── Die HTTP-Helfer ────────────────────────────────────────────────────────

/** Eine gefälschte Antwort, die nur mitschreibt. */
interface FakeAntwort {
  statusCode: number
  readonly kopf: Map<string, string>
  koerper: Buffer
  setHeader(name: string, wert: string): void
  end(stueck?: Buffer | string): void
}

/**
 * Baut eine gefälschte Antwort.
 *
 * @returns die Antwort
 */
function antwort(): FakeAntwort {
  const zustand: FakeAntwort = {
    statusCode: 0,
    kopf: new Map<string, string>(),
    koerper: Buffer.alloc(0),
    setHeader(name, wert) {
      zustand.kopf.set(name.toLowerCase(), wert)
    },
    end(stueck) {
      zustand.koerper =
        stueck === undefined ? Buffer.alloc(0) : Buffer.isBuffer(stueck) ? stueck : Buffer.from(stueck)
    },
  }
  return zustand
}

/**
 * Baut eine gefälschte Anfrage aus einem Körper.
 *
 * @param koerper - der Text
 * @param kopf - zusätzliche Kopfzeilen
 * @returns die Anfrage
 */
function anfrage(koerper: string, kopf: Record<string, string> = {}): IncomingMessage {
  const strom = Readable.from([Buffer.from(koerper, 'utf8')])
  return Object.assign(strom, { headers: kopf, socket: { remoteAddress: '127.0.0.1' } }) as unknown as IncomingMessage
}

/**
 * Baut eine Anfrage mit einer bestimmten Peer-Adresse.
 *
 * @param adresse - die Adresse
 * @returns die Anfrage
 */
function mitAdresse(adresse: string): IncomingMessage {
  return { socket: { remoteAddress: adresse } } as unknown as IncomingMessage
}

test('json setzt Inhaltstyp, no-store und nosniff', () => {
  const res = antwort()
  json(res as unknown as ServerResponse, 201, { status: 'ok' })
  expect(res.statusCode).toBe(201)
  expect(res.kopf.get('content-type')).toBe('application/json; charset=utf-8')
  expect(res.kopf.get('cache-control')).toBe('no-store')
  expect(res.kopf.get('x-content-type-options')).toBe('nosniff')
  expect(JSON.parse(res.koerper.toString('utf8'))).toEqual({ status: 'ok' })
})

test('readJson liest gültiges JSON, {} bei leerem Körper und lehnt Kaputtes ab', async () => {
  expect(await readJson(anfrage('{"mode":"deep"}'))).toEqual({ ok: true, wert: { mode: 'deep' } })
  expect(await readJson(anfrage(''))).toEqual({ ok: true, wert: {} })

  const kaputt = await readJson(anfrage('{'))
  expect(kaputt.ok).toBe(false)
  if (!kaputt.ok) expect(kaputt.status).toBe(400)

  const zuGross = await readJson(anfrage('x'.repeat(20)), 10)
  expect(zuGross.ok).toBe(false)
  if (!zuGross.ok) expect(zuGross.status).toBe(413)

  // Eine angekündigte Länge über der Grenze wird schon vor dem Lesen abgelehnt.
  const angekuendigt = await readJson(anfrage('{}', { 'content-length': '999' }), 10)
  expect(angekuendigt.ok).toBe(false)
  if (!angekuendigt.ok) expect(angekuendigt.status).toBe(413)
})

test('nur Loopback ist lokal — auch in der IPv4-gemappten Form', () => {
  expect(normalisiereAdresse('::ffff:127.0.0.1')).toBe('127.0.0.1')
  expect(istLokal(mitAdresse('::ffff:127.0.0.1'))).toBe(true)
  expect(istLokal(mitAdresse('::1'))).toBe(true)
  expect(istLokal(mitAdresse('127.0.0.1'))).toBe(true)
  expect(istLokal(mitAdresse('192.168.1.5'))).toBe(false)
  expect(istLokal(mitAdresse('2001:db8::1'))).toBe(false)
  expect(istLokal({ socket: {} } as unknown as IncomingMessage)).toBe(false)
})

// ── Die Routen (ohne Host) ─────────────────────────────────────────────────

/**
 * Baut eine POST-Anfrage aus einem Körper.
 *
 * @param koerper - der Text
 * @param adresse - die Peer-Adresse
 * @returns die Anfrage
 */
function postAnfrage(koerper: string, adresse = '127.0.0.1'): IncomingMessage {
  const strom = Readable.from([Buffer.from(koerper, 'utf8')])
  return Object.assign(strom, {
    method: 'POST',
    headers: {},
    socket: { remoteAddress: adresse },
  }) as unknown as IncomingMessage
}

test('eine fremde Adresse bekommt 403 — auch bei gültigem Aufruf', async () => {
  const res = antwort()
  const req = Object.assign(mitAdresse('10.0.0.7'), { method: 'GET' })
  await macheStatusHandler()(req, res as unknown as ServerResponse)
  expect(res.statusCode).toBe(403)
  expect(res.kopf.get('content-type')).toBe('application/json; charset=utf-8')
})

test('status antwortet auf GET mit der Auskunft und lehnt POST mit 405 ab', async () => {
  const gut = antwort()
  await macheStatusHandler()(
    Object.assign(mitAdresse('127.0.0.1'), { method: 'GET' }),
    gut as unknown as ServerResponse,
  )
  expect(gut.statusCode).toBe(200)
  const koerper = JSON.parse(gut.koerper.toString('utf8')) as { id?: string; graphFile?: string }
  expect(koerper.id).toBe('graphify')
  expect(typeof koerper.graphFile).toBe('string')

  const falsch = antwort()
  await macheStatusHandler()(
    Object.assign(mitAdresse('127.0.0.1'), { method: 'POST' }),
    falsch as unknown as ServerResponse,
  )
  expect(falsch.statusCode).toBe(405)
  expect(falsch.kopf.get('allow')).toBe('GET')
})

test('run lehnt einen unbekannten mode ab, BEVOR irgendetwas gestartet wird', async () => {
  const res = antwort()
  await macheRunHandler()(postAnfrage('{"mode":"voll"}'), res as unknown as ServerResponse)
  expect(res.statusCode).toBe(400)
  const koerper = JSON.parse(res.koerper.toString('utf8')) as { error?: string }
  expect(koerper.error).toContain('deep')
})

test('setup prüft auf GET und lehnt einen unbekannten Weg ab', async () => {
  const gut = antwort()
  await macheSetupHandler()(
    Object.assign(mitAdresse('127.0.0.1'), { method: 'GET' }),
    gut as unknown as ServerResponse,
  )
  expect(gut.statusCode).toBe(200)
  const koerper = JSON.parse(gut.koerper.toString('utf8')) as { method?: string; modus?: string }
  expect(typeof koerper.method).toBe('string')
  expect(koerper.modus).toBe('auto')

  const falsch = antwort()
  await macheSetupHandler()(postAnfrage('{"method":"sudo"}'), falsch as unknown as ServerResponse)
  expect(falsch.statusCode).toBe(400)
  const meldung = JSON.parse(falsch.koerper.toString('utf8')) as { error?: string }
  expect(meldung.error).toContain('uv')
})

test('methodeAus nimmt nur uv, pipx und pip', () => {
  expect(methodeAus({})).toEqual({ ok: true, method: undefined })
  expect(methodeAus({ method: 'uv' })).toEqual({ ok: true, method: 'uv' })
  expect(methodeAus({ method: 'pipx' })).toEqual({ ok: true, method: 'pipx' })
  expect(methodeAus({ method: 'pip' })).toEqual({ ok: true, method: 'pip' })
  expect(methodeAus({ method: 'sudo' }).ok).toBe(false)
  expect(methodeAus(null).ok).toBe(false)
})
