/**
 * **Der Obsidian-Anbieter — geprüft ohne Host und ohne echten Vault.**
 *
 * Drei Stellen können falsch sein, und alle drei sind hier sichtbar:
 * die Zuordnung zum Welt-Graph (Präfixe, Zählwerte), die Prüfung eines
 * Vault-Pfads samt Ablage, und die HTTP-Helfer (Status, Typ, Größe).
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ObsidianGraph } from '@prometheus-harness/world-obsidian'
import { isWorldGraph } from '@prometheus-harness/world-graph'
import { configPfad, leseVaultConfig, pruefeVaultPfad, schreibeVaultConfig } from '../src/config.ts'
import { BodyFehler, istLokal, json, readJson } from '../src/http.ts'
import { graphAusVault, graphMitFehler } from '../src/mapping.ts'

const ZEIT = '2026-10-18T00:00:00.000Z'

// ── Die Zuordnung: Vault → Welt-Graph ─────────────────────────────────────────────────────────

/** Zwei Notizen, eine Kante, ein offener Verweis. */
const vaultGraph: ObsidianGraph = {
  wurzel: 'C:\\Vault',
  notizen: [
    {
      id: 'Willkommen.md',
      titel: 'Willkommen',
      text: 'Siehe [[Neuer Link]] und [[Fehlt]].',
      tags: ['start', 'beispiel'],
      links: [
        { ziel: 'Neuer Link', offen: false },
        { ziel: 'Fehlt', offen: true },
      ],
      groesse: 37,
    },
    {
      id: 'Neuer Link.md',
      titel: 'Neuer Link',
      text: '',
      tags: [],
      links: [],
      groesse: 0,
    },
  ],
  kanten: [{ von: 'Willkommen.md', nach: 'Neuer Link.md' }],
  ordner: 1,
  offeneVerweise: 1,
}

describe('graphAusVault', () => {
  test('Knoten tragen Präfix, Titel, Art, Quelle, Pfad und Marken', () => {
    const graph = graphAusVault(vaultGraph, 'C:\\Vault', ZEIT)
    expect(graph.nodes).toEqual([
      {
        id: 'obsidian:Willkommen.md',
        label: 'Willkommen',
        kind: 'note',
        source: 'obsidian',
        path: 'Willkommen.md',
        tags: ['start', 'beispiel'],
      },
      {
        id: 'obsidian:Neuer Link.md',
        label: 'Neuer Link',
        kind: 'note',
        source: 'obsidian',
        path: 'Neuer Link.md',
        tags: [],
      },
    ])
  })

  test('Kanten kommen aus graph.kanten — als link, EXTRACTED, mit Präfix', () => {
    const graph = graphAusVault(vaultGraph, 'C:\\Vault', ZEIT)
    expect(graph.edges).toEqual([
      {
        from: 'obsidian:Willkommen.md',
        to: 'obsidian:Neuer Link.md',
        kind: 'link',
        confidence: 'EXTRACTED',
      },
    ])
    expect(graph.generatedAt).toBe(ZEIT)
  })

  test('der Quellenstatus zählt Knoten, Kanten und offene Verweise', () => {
    const graph = graphAusVault(vaultGraph, 'C:\\Vault', ZEIT)
    expect(graph.sources).toHaveLength(1)
    const quelle = graph.sources[0]
    expect(quelle).toMatchObject({
      id: 'obsidian',
      label: 'Obsidian',
      available: true,
      nodes: 2,
      edges: 1,
    })
    expect(quelle?.detail).toBe('Vault: C:\\Vault · 2 Notizen · 1 offener Verweis')
  })

  test('ein fehlender Vault ergibt einen gültigen leeren Graphen mit Fehler', () => {
    const graph = graphMitFehler('Vault fehlt.', null, ZEIT)
    expect(isWorldGraph(graph)).toBe(true)
    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
    expect(graph.generatedAt).toBe(ZEIT)
    const quelle = graph.sources[0]
    expect(quelle).toMatchObject({ id: 'obsidian', available: false, nodes: 0, edges: 0 })
    expect(quelle?.error).toBe('Vault fehlt.')
    expect(quelle?.detail).toBe('Kein Vault ermittelt.')
  })
})

// ── Vault-Pfad und Ablage ────────────────────────────────────────────────────────────────────

const temp = mkdtempSync(join(tmpdir(), 'pmh-world-obsidian-provider-'))

afterAll(() => {
  rmSync(temp, { recursive: true, force: true })
})

describe('pruefeVaultPfad', () => {
  test('nimmt ein vorhandenes Verzeichnis an', () => {
    const ordner = join(temp, 'vault-a')
    mkdirSync(ordner, { recursive: true })
    const ergebnis = pruefeVaultPfad(ordner)
    expect(ergebnis.ok).toBe(true)
    if (!ergebnis.ok) return
    expect(ergebnis.vault).toBe(resolve(ordner))
  })

  test('weist relative Pfade ab', () => {
    const ergebnis = pruefeVaultPfad('vault/relativ')
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.status).toBe(400)
    expect(ergebnis.code).toBe('nicht-absolut')
  })

  test('weist ".." ab, auch wenn der Pfad sonst gültig wäre', () => {
    // Kein `join`: das würde die Stufe vorher wegnormalisieren.
    const ergebnis = pruefeVaultPfad(`${join(temp, 'a')}\\..\\b`)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.status).toBe(400)
    expect(ergebnis.code).toBe('rueckweg')
  })

  test('meldet einen fehlenden Pfad als 404', () => {
    const ergebnis = pruefeVaultPfad(join(temp, 'gibt-es-nicht'))
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.status).toBe(404)
    expect(ergebnis.code).toBe('nicht-gefunden')
  })

  test('weist eine Datei ab', () => {
    const datei = join(temp, 'kein-vault.txt')
    writeFileSync(datei, 'kein Ordner', 'utf8')
    const ergebnis = pruefeVaultPfad(datei)
    expect(ergebnis.ok).toBe(false)
    if (ergebnis.ok) return
    expect(ergebnis.status).toBe(400)
    expect(ergebnis.code).toBe('kein-verzeichnis')
  })

  test('weist leere und nicht-textliche Werte ab', () => {
    for (const wert of ['', '   ', null, 42, {}, []]) {
      const ergebnis = pruefeVaultPfad(wert)
      expect(ergebnis.ok).toBe(false)
    }
  })
})

describe('Vault-Ablage', () => {
  test('configPfad liegt unter DSH_HOME/world/obsidian.json', () => {
    const home = join(temp, 'home-a')
    expect(configPfad({ DSH_HOME: home })).toBe(join(home, 'world', 'obsidian.json'))
  })

  test('schreibt die Einstellung und legt das Verzeichnis an', () => {
    const home = join(temp, 'home-b')
    const vault = resolve(join(temp, 'vault-b'))
    mkdirSync(vault, { recursive: true })
    const env = { DSH_HOME: home }
    const datei = schreibeVaultConfig(vault, env)
    expect(existsSync(datei)).toBe(true)
    expect(leseVaultConfig(env)).toEqual({ vault })
  })

  test('eine kaputte Datei gilt als "nichts gespeichert"', () => {
    const home = join(temp, 'home-c')
    mkdirSync(join(home, 'world'), { recursive: true })
    writeFileSync(join(home, 'world', 'obsidian.json'), '{ kaputt', 'utf8')
    expect(leseVaultConfig({ DSH_HOME: home })).toBeUndefined()
  })
})

// ── HTTP-Helfer ─────────────────────────────────────────────────────────────────────────────

interface FakeAntwort {
  readonly res: ServerResponse
  readonly kopf: Map<string, string>
  readonly koerper: () => string
}

/** Minimale `ServerResponse`: Status, Kopfzeilen, Rumpf. */
function macheAntwort(): FakeAntwort {
  const kopf = new Map<string, string>()
  let koerper = ''
  const roh = {
    statusCode: 0,
    setHeader(name: string, wert: string): void {
      kopf.set(name.toLowerCase(), wert)
    },
    end(teil?: string | Uint8Array): void {
      if (teil === undefined) return
      koerper = typeof teil === 'string' ? teil : Buffer.from(teil).toString('utf8')
    },
  }
  return { res: roh as unknown as ServerResponse, kopf, koerper: () => koerper }
}

/** Minimale `IncomingMessage`: ein async iterable über die Stücke. */
function macheRumpf(teile: readonly (string | Uint8Array)[]): IncomingMessage {
  const roh = {
    async *[Symbol.asyncIterator](): AsyncGenerator<string | Uint8Array> {
      for (const teil of teile) yield teil
    },
  }
  return roh as unknown as IncomingMessage
}

/** Fängt die Ablehnung ein, ohne den Test mit einem Wurf zu beenden. */
async function ablehnungVon(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return undefined
  } catch (fehler) {
    return fehler
  }
}

describe('json', () => {
  test('setzt Status, Typ und die Sicherheitsköpfe', () => {
    const fake = macheAntwort()
    json(fake.res, 201, { ok: true, wert: 7 })
    expect(fake.res.statusCode).toBe(201)
    expect(fake.kopf.get('content-type')).toBe('application/json; charset=utf-8')
    expect(fake.kopf.get('cache-control')).toBe('no-store')
    expect(fake.kopf.get('x-content-type-options')).toBe('nosniff')
    expect(JSON.parse(fake.koerper())).toEqual({ ok: true, wert: 7 })
  })
})

describe('readJson', () => {
  test('liest gültiges JSON, auch über mehrere Stücke', async () => {
    await expect(readJson(macheRumpf(['{"a":', '1}']))).resolves.toEqual({ a: 1 })
  })

  test('weist einen zu großen Rumpf mit 413 ab', async () => {
    const fehler = await ablehnungVon(readJson(macheRumpf(['{"a":"0123456789"}']), 8))
    expect(fehler).toBeInstanceOf(BodyFehler)
    expect((fehler as BodyFehler).status).toBe(413)
    expect((fehler as BodyFehler).code).toBe('zu-gross')
  })

  test('weist ungültiges JSON mit 400 ab', async () => {
    const fehler = await ablehnungVon(readJson(macheRumpf(['kein json'])))
    expect(fehler).toBeInstanceOf(BodyFehler)
    expect((fehler as BodyFehler).status).toBe(400)
    expect((fehler as BodyFehler).code).toBe('kein-json')
  })

  test('weist einen leeren Rumpf mit 400 ab', async () => {
    const fehler = await ablehnungVon(readJson(macheRumpf([])))
    expect(fehler).toBeInstanceOf(BodyFehler)
    expect((fehler as BodyFehler).status).toBe(400)
    expect((fehler as BodyFehler).code).toBe('leer')
  })
})

describe('istLokal', () => {
  const reqMit = (remoteAddress: string): IncomingMessage =>
    ({ socket: { remoteAddress } }) as unknown as IncomingMessage

  test('akzeptiert localhost, auch als IPv4-Zuordnung', () => {
    expect(istLokal(reqMit('127.0.0.1'))).toBe(true)
    expect(istLokal(reqMit('::ffff:127.0.0.1'))).toBe(true)
    expect(istLokal(reqMit('::1'))).toBe(true)
  })

  test('weist fremde Adressen ab', () => {
    expect(istLokal(reqMit('192.168.0.5'))).toBe(false)
    expect(istLokal(reqMit('::ffff:192.168.0.5'))).toBe(false)
  })
})
