/**
 * `@prometheus-harness/world-obsidian-provider` — der Vault als HTTP-Quelle der Welt.
 *
 * Sechs Routen unter `/api/world/obsidian`, alle nur von diesem Rechner:
 *
 * | Route | Frage |
 * |---|---|
 * | `GET status` | *ist ein Vault da, und was steht darin?* |
 * | `GET graph` | *der Welt-Graph aus dem Vault* |
 * | `POST vault` | *welchen Vault soll die Welt lesen?* |
 * | `GET note` / `POST note` | *eine Notiz lesen bzw. schreiben* |
 * | `GET app` | *ist Obsidian installiert, und wo?* |
 * | `POST app/open` | *Vault oder Notiz im Programm öffnen* |
 * | `POST sync` | *noch nicht verdrahtet — und das wird gesagt* |
 *
 * Gelesen wird mit `leseVault` aus `@prometheus-harness/world-obsidian`; die
 * Zuordnung zum Vertrag steht in `mapping.ts` und ist ohne Netz prüfbar.
 * Fehlende Vaults und Lesefehler werden **als Antwort** gemeldet, nie geworfen.
 *
 * @module @prometheus-harness/world-obsidian-provider
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { leseVault, vaultPfad } from '@prometheus-harness/world-obsidian'
import type { ObsidianApp } from './app.ts'
import { findeApp, oeffneApp } from './app.ts'
import {
  darfInstallieren,
  findeRezept,
  installiereObsidian,
  merkeVersuch,
  vorKurzemGescheitert,
} from './install.ts'
import type { HomeEnv } from './config.ts'
import { leseVaultConfig, pruefeVaultPfad, schreibeVaultConfig } from './config.ts'
import { BodyFehler, istLokal, json, readJson } from './http.ts'
import { graphAusVault, graphMitFehler, vaultDetail } from './mapping.ts'

/** Stabiler Cordis-Plugin-Name. */
export const name = 'pmh-world-obsidian'

/** Ohne Webserver und Werkzeug-Registry gibt es nichts zu registrieren. */
export const inject = ['webServer', 'tools'] as const

/** Gemeinsamer Anfang aller Routen dieses Plugins. */
export const BASIS = '/api/world/obsidian'

/** Zustand des Vaults. */
export const STATUS_PATH = `${BASIS}/status`

/** Der Graph aus dem Vault. */
export const GRAPH_PATH = `${BASIS}/graph`

/** Vault-Auswahl. */
export const VAULT_PATH = `${BASIS}/vault`

/** Der Inhalt einer Notiz — für das Panel. */
export const NOTE_PATH = `${BASIS}/note`

/** Einlesen — in dieser Phase nur eine ehrliche Auskunft. */
export const SYNC_PATH = `${BASIS}/sync`

/** Ist das Programm installiert, und wo? — für den Knopf im Panel. */
export const APP_PATH = `${BASIS}/app`

/** Vault oder eine Notiz im Programm öffnen. */
export const APP_OPEN_PATH = `${BASIS}/app/open`

/** Die Meldung der noch nicht verdrahteten Einlese-Route. */
export const SYNC_MELDUNG =
  'Das Einlesen in die Datenbank läuft über POST /api/pmh/notizen/einlesen (Sitzung nötig).'

/** Was `GET status` liefert. */
export interface ObsidianStatus {
  readonly id: 'obsidian'
  readonly label: 'Obsidian'
  readonly available: boolean
  readonly vault: string | null
  readonly notes: number
  readonly edges: number
  readonly openLinks: number
  readonly detail: string
  readonly error?: string
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

/**
 * Meldet einen Fehlerwert als Text.
 *
 * @param fehler - der gefangene Wert
 * @returns eine Meldung
 */
function fehlerText(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler)
}

/**
 * Der Vault, der gelesen werden soll: zuerst die gespeicherte Einstellung,
 * sonst der von Obsidian gemeldete Vault.
 *
 * @param env - die Umgebung
 * @returns der Pfad oder `undefined`
 */
export function ermittleVault(env: HomeEnv = process.env): string | undefined {
  const gespeichert = leseVaultConfig(env)
  if (gespeichert !== undefined) return gespeichert.vault
  return vaultPfad()
}

/**
 * Baut die Statusantwort — ohne zu werfen.
 *
 * @param env - die Umgebung
 * @returns der Zustand
 */
export function statusAus(env: HomeEnv = process.env): ObsidianStatus {
  const vault = ermittleVault(env)
  if (vault === undefined) {
    return {
      id: 'obsidian',
      label: 'Obsidian',
      available: false,
      vault: null,
      notes: 0,
      edges: 0,
      openLinks: 0,
      detail: 'Kein Vault ermittelt.',
      error: 'Kein Vault ermittelt — weder gespeichert noch von Obsidian gemeldet.',
    }
  }
  try {
    const graph = leseVault(vault)
    if (graph.notizen.length === 0) {
      return {
        id: 'obsidian',
        label: 'Obsidian',
        available: false,
        vault,
        notes: 0,
        edges: 0,
        openLinks: graph.offeneVerweise,
        detail: vaultDetail(vault, 0, graph.offeneVerweise),
        error: `Der Vault enthält keine Markdown-Notizen: ${vault}`,
      }
    }
    return {
      id: 'obsidian',
      label: 'Obsidian',
      available: true,
      vault,
      notes: graph.notizen.length,
      edges: graph.kanten.length,
      openLinks: graph.offeneVerweise,
      detail: vaultDetail(vault, graph.notizen.length, graph.offeneVerweise),
    }
  } catch (fehler) {
    return {
      id: 'obsidian',
      label: 'Obsidian',
      available: false,
      vault,
      notes: 0,
      edges: 0,
      openLinks: 0,
      detail: `Vault: ${vault}`,
      error: fehlerText(fehler),
    }
  }
}

/**
 * Baut den Graph — als gültigen Graphen, auch wenn nichts gelesen werden konnte.
 *
 * @param env - die Umgebung
 * @returns der Graph
 */
export function graphAntwort(env: HomeEnv = process.env): ReturnType<typeof graphAusVault> {
  const vault = ermittleVault(env)
  if (vault === undefined) {
    return graphMitFehler('Kein Vault ermittelt — weder gespeichert noch von Obsidian gemeldet.', null)
  }
  try {
    const graph = leseVault(vault)
    if (graph.notizen.length === 0) {
      return graphMitFehler(`Der Vault enthält keine Markdown-Notizen: ${vault}`, vault)
    }
    return graphAusVault(graph, vault)
  } catch (fehler) {
    return graphMitFehler(fehlerText(fehler), vault)
  }
}

/** Nur von diesem Rechner — sonst 403. */
function nurLokal(handler: Handler): Handler {
  return (req, res) => {
    if (!istLokal(req)) {
      json(res, 403, { ok: false, code: 'nicht-lokal', message: 'Diese Route ist nur von localhost erreichbar.' })
      return
    }
    return handler(req, res)
  }
}

/** Nur die genannte Methode — sonst 405. */
function mitMethode(methode: 'GET' | 'POST', handler: Handler): Handler {
  return (req, res) => {
    if ((req.method ?? 'GET') !== methode) {
      res.setHeader('Allow', methode)
      json(res, 405, { ok: false, code: 'methode', message: `Erwartet wird ${methode}.` })
      return
    }
    return handler(req, res)
  }
}

/** `GET status` */
function statusRoute(_req: IncomingMessage, res: ServerResponse): void {
  json(res, 200, statusAus())
}

/** `GET graph` */
function graphRoute(_req: IncomingMessage, res: ServerResponse): void {
  json(res, 200, graphAntwort())
}

/** `POST vault` */
const vaultRoute: Handler = async (req, res) => {
  let rumpf: unknown
  try {
    rumpf = await readJson(req)
  } catch (fehler) {
    if (fehler instanceof BodyFehler) {
      json(res, fehler.status, { ok: false, code: fehler.code, message: fehler.message })
      return
    }
    json(res, 400, { ok: false, code: 'rumpf', message: fehlerText(fehler) })
    return
  }
  const gewuenscht =
    typeof rumpf === 'object' && rumpf !== null
      ? (rumpf as { path?: unknown; anlegen?: unknown })
      : { path: undefined, anlegen: undefined }
  const pfad = gewuenscht.path
  if (typeof pfad !== 'string') {
    json(res, 400, { ok: false, code: 'ungueltig', message: 'Erwartet wird { "path": "<absoluter Pfad>" }.' })
    return
  }
  /*
   * **„Vault anlegen" — der Weg ohne Obsidian.**
   *
   * Wer das Programm nicht hat, braucht trotzdem einen Ordner mit Notizen. Mit
   * `anlegen: true` wird er erzeugt (samt einer Willkommensnotiz); ohne das Flag
   * bleibt es beim Prüfen, damit ein Tippfehler keinen leeren Ordner hinterläßt.
   */
  if (gewuenscht.anlegen === true && !existsSync(pfad)) {
    try {
      mkdirSync(pfad, { recursive: true })
      writeFileSync(
        join(pfad, 'Willkommen.md'),
        '# Willkommen\n\nDieser Vault wurde in Prometheus Harness angelegt.\n\n' +
          'Notizen sind Markdown-Dateien; Verweise schreibst du als `[[Andere Notiz]]`.\n',
        'utf8',
      )
    } catch (fehler) {
      json(res, 500, { ok: false, code: 'anlegen-fehlgeschlagen', message: fehlerText(fehler) })
      return
    }
  }
  const geprueft = pruefeVaultPfad(pfad)
  if (!geprueft.ok) {
    json(res, geprueft.status, { ok: false, code: geprueft.code, message: geprueft.message })
    return
  }
  try {
    schreibeVaultConfig(geprueft.vault)
  } catch (fehler) {
    json(res, 500, { ok: false, code: 'schreiben-fehlgeschlagen', message: fehlerText(fehler) })
    return
  }
  json(res, 200, { ok: true, vault: geprueft.vault })
}

type NotizZiel =
  | { readonly ok: true; readonly ziel: string; readonly rel: string }
  | { readonly ok: false; readonly status: number; readonly code: string; readonly message: string }

/**
 * Löst einen Notizpfad sicher gegen den Vault auf.
 *
 * Der Präfix `obsidian:` wird abgeschnitten (das erste Panel schickte die
 * Knoten-ID), `..`, absolute Pfade und Symlinks nach draußen werden abgelehnt.
 * Die Datei muss **existieren** — Anlegen neuer Notizen ist ein eigener Schritt.
 */
function notizZiel(vault: string, roh: string): NotizZiel {
  const rel = roh.startsWith('obsidian:') ? roh.slice('obsidian:'.length) : roh
  if (rel.length === 0 || rel.includes('\0') || isAbsolute(rel)) {
    return { ok: false, status: 400, code: 'pfad-ungueltig', message: 'Der Pfad muss relativ zum Vault sein.' }
  }
  const basis = resolve(vault)
  const ziel = resolve(basis, rel)
  const zurueck = relative(basis, ziel)
  if (zurueck.startsWith('..') || isAbsolute(zurueck)) {
    return { ok: false, status: 403, code: 'ausserhalb', message: 'Der Pfad liegt außerhalb des Vaults.' }
  }
  if (!ziel.toLowerCase().endsWith('.md')) {
    return { ok: false, status: 415, code: 'kein-markdown', message: 'Nur .md-Dateien werden gelesen.' }
  }
  try {
    const echteBasis = realpathSync(basis)
    const echtesZiel = realpathSync(ziel)
    const echtRel = relative(echteBasis, echtesZiel)
    if (echtRel.startsWith('..') || isAbsolute(echtRel)) {
      return { ok: false, status: 403, code: 'ausserhalb', message: 'Der Pfad liegt außerhalb des Vaults.' }
    }
  } catch (fehler) {
    return { ok: false, status: 404, code: 'nicht-gefunden', message: fehlerText(fehler) }
  }
  return { ok: true, ziel, rel: zurueck.replaceAll('\\', '/') }
}

/**
 * `GET note?path=…` — Inhalt lesen.
 * `POST note` mit `{ path, content }` — Inhalt schreiben.
 */
function noteRoute(req: IncomingMessage, res: ServerResponse): void {
  const methode = req.method ?? 'GET'
  if (methode === 'POST') {
    void noteWrite(req, res)
    return
  }
  if (methode !== 'GET') {
    res.setHeader('Allow', 'GET, POST')
    json(res, 405, { ok: false, code: 'methode', message: 'Erwartet wird GET oder POST.' })
    return
  }
  const vault = ermittleVault()
  if (vault === undefined) {
    json(res, 404, { ok: false, code: 'kein-vault', message: 'Kein Obsidian-Vault ermittelt.' })
    return
  }
  const url = new URL(req.url ?? '', 'http://localhost')
  const roh = url.searchParams.get('path')
  if (roh === null || roh.length === 0) {
    json(res, 400, { ok: false, code: 'pfad-fehlt', message: 'Erwartet wird ?path=<relativer Pfad>.' })
    return
  }
  const ziel = notizZiel(vault, roh)
  if (!ziel.ok) {
    json(res, ziel.status, { ok: false, code: ziel.code, message: ziel.message })
    return
  }
  try {
    const inhalt = readFileSync(ziel.ziel, 'utf8')
    json(res, 200, { path: ziel.rel, content: inhalt.slice(0, 200_000) })
  } catch (fehler) {
    json(res, 404, { ok: false, code: 'nicht-gefunden', message: fehlerText(fehler) })
  }
}

/** `POST note` — eine bestehende Notiz speichern. */
async function noteWrite(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const vault = ermittleVault()
  if (vault === undefined) {
    json(res, 404, { ok: false, code: 'kein-vault', message: 'Kein Obsidian-Vault ermittelt.' })
    return
  }
  let rumpf: unknown
  try {
    rumpf = await readJson(req)
  } catch (fehler) {
    if (fehler instanceof BodyFehler) {
      json(res, fehler.status, { ok: false, code: fehler.code, message: fehler.message })
      return
    }
    json(res, 400, { ok: false, code: 'rumpf', message: fehlerText(fehler) })
    return
  }
  const daten = typeof rumpf === 'object' && rumpf !== null ? (rumpf as Record<string, unknown>) : {}
  const pfad = daten['path']
  const inhalt = daten['content']
  if (typeof pfad !== 'string' || typeof inhalt !== 'string') {
    json(res, 400, { ok: false, code: 'ungueltig', message: 'Erwartet wird { "path": "…", "content": "…" }.' })
    return
  }
  if (inhalt.length > 200_000) {
    json(res, 413, { ok: false, code: 'zu-gross', message: 'Eine Notiz darf höchstens 200 000 Zeichen haben.' })
    return
  }
  const ziel = notizZiel(vault, pfad)
  if (!ziel.ok) {
    json(res, ziel.status, { ok: false, code: ziel.code, message: ziel.message })
    return
  }
  try {
    writeFileSync(ziel.ziel, inhalt, 'utf8')
    json(res, 200, { ok: true, path: ziel.rel, bytes: Buffer.byteLength(inhalt, 'utf8') })
  } catch (fehler) {
    json(res, 500, { ok: false, code: 'schreiben-fehlgeschlagen', message: fehlerText(fehler) })
  }
}

/** `POST sync` — Phase 1: keine Datenbank, sondern die Wahrheit. */
function syncRoute(_req: IncomingMessage, res: ServerResponse): void {
  json(res, 501, { ok: false, code: 'nicht-verdrahtet', message: SYNC_MELDUNG })
}

/** Was `GET app` liefert: der Befund des Programms plus der Vault, den es öffnen würde. */
export interface AppAntwort extends ObsidianApp {
  readonly vault: string | null
}

/**
 * `GET app` — ist Obsidian installiert?
 *
 * Die Antwort ist **kein Fehler**, wenn das Programm fehlt: das Panel zeigt dann
 * keinen Knopf, statt einen anzubieten, der nichts tut.
 *
 * @param _req - ungenutzt
 * @param res - die Antwort
 */
export function appRoute(_req: IncomingMessage, res: ServerResponse): void {
  const app = findeApp()
  const vault = ermittleVault()
  const antwort: AppAntwort = { ...app, vault: vault ?? null }
  json(res, 200, antwort)
}

/**
 * `POST app/open` — den Vault oder **genau eine Notiz** im Programm öffnen.
 *
 * Der Rumpf ist optional: `{}` öffnet den Vault, `{ "note": "Ordner/Notiz.md" }`
 * die Notiz. Der Pfad wird über {@link notizZiel} gegen den Vault geprüft —
 * dieselbe Prüfung wie beim Lesen, damit das Öffnen keinen Weg nach draußen
 * aufmacht.
 *
 * @param req - die Anfrage
 * @param res - die Antwort
 */
export async function appOpenRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  /*
   * **Erst die Eingabe, dann die Umgebung.**
   *
   * Vorher stand die Installationsprüfung vorn. In CI, wo Obsidian fehlt,
   * antwortete deshalb jeder Aufruf mit 409 — auch der mit leerem Rumpf, der
   * offensichtlich ein Fehler des Aufrufers ist. Die Reihenfolge sagt jetzt, was
   * der Aufrufer falsch gemacht hat, und nennt die Umgebung zuletzt: sie ist nur
   * für den Start nötig, nicht für die Prüfung der Argumente.
   */
  let rumpf: unknown = {}
  try {
    rumpf = await readJson(req)
  } catch (fehler) {
    if (fehler instanceof BodyFehler) {
      json(res, fehler.status, { ok: false, code: fehler.code, message: fehler.message })
      return
    }
    json(res, 400, { ok: false, code: 'rumpf', message: fehlerText(fehler) })
    return
  }
  const notiz =
    typeof rumpf === 'object' && rumpf !== null ? (rumpf as { note?: unknown }).note : undefined
  const vault = ermittleVault()
  if (vault === undefined) {
    json(res, 404, { ok: false, code: 'kein-vault', message: 'Kein Obsidian-Vault ermittelt.' })
    return
  }
  let ziel = vault
  if (typeof notiz === 'string' && notiz.length > 0) {
    const geprueft = notizZiel(vault, notiz)
    if (!geprueft.ok) {
      json(res, geprueft.status, { ok: false, code: geprueft.code, message: geprueft.message })
      return
    }
    ziel = geprueft.ziel
  }
  const app = findeApp()
  if (!app.verfuegbar) {
    json(res, 409, { ok: false, code: 'nicht-installiert', message: app.detail })
    return
  }
  const ergebnis = await oeffneApp(ziel, app.exe)
  json(res, ergebnis.ok ? 200 : 502, {
    ok: ergebnis.ok,
    url: ergebnis.url,
    message: ergebnis.detail,
  })
}

/**
 * Baut ein Kern-Werkzeug mit offenem Ausgabeschema.
 *
 * Die drei Obsidian-Werkzeuge liefern Objekte, deren Form vom Vault abhängt
 * (Treffer, Inhalt, Bytes). Ein enges Schema wäre eine Zusage, die der Vault
 * nicht geben kann; `{ type: 'object' }` prüft nur „ist ein Objekt".
 */
function werkzeug(
  name: string,
  description: string,
  parameters: Readonly<Record<string, unknown>>,
  ausfuehren: (argumente: Readonly<Record<string, unknown>>) => Promise<unknown> | unknown,
): ToolDefinition {
  return {
    name,
    description,
    parameters: parameters as ToolDefinition['parameters'],
    output: {
      schema: { type: 'object' } as ToolDefinition['output']['schema'],
      render: (_args, wert) => [
        { type: 'text', text: typeof wert === 'string' ? wert : JSON.stringify(wert) },
      ] as ToolDefinition['output'] extends { render: (...args: never[]) => infer R } ? R : never,
    },
    execute: async (argumente) =>
      ausfuehren(
        (typeof argumente === 'object' && argumente !== null
          ? argumente
          : {}) as Readonly<Record<string, unknown>>,
      ),
  }
}

/** Die drei Werkzeuge, die der Agent autonom benutzen darf. */
function obsidianWerkzeuge(): readonly ToolDefinition[] {
  return [
    werkzeug(
      'obsidian_search',
      'Durchsucht den Obsidian-Vault nach Notizen. Vor Projektentscheidungen oder wenn der Nutzer sich auf frühere Notizen bezieht, zuerst hier suchen.',
      {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Suchbegriff; leer listet die ersten Notizen.' },
          limit: { type: 'number', description: 'Höchstens 50 Treffer (Vorgabe 20).' },
        },
        required: ['query'],
      },
      (argumente) => {
        const query = typeof argumente['query'] === 'string' ? argumente['query'].toLowerCase() : ''
        const limit = Math.min(50, Math.max(1, Number(argumente['limit'] ?? 20)))
        const graph = graphAntwort()
        const notizen = graph.nodes.filter((knoten) => knoten.kind === 'note')
        const treffer = notizen
          .filter((knoten) => `${knoten.label} ${knoten.path ?? ''}`.toLowerCase().includes(query))
          .slice(0, limit)
          .map((knoten) => ({ label: knoten.label, path: knoten.path ?? null }))
        return { vault: statusAus().vault, total: notizen.length, notes: treffer }
      },
    ),
    werkzeug(
      'obsidian_read',
      'Liest eine Obsidian-Notiz aus dem Vault. Pfad relativ zum Vault, z. B. "Willkommen.md".',
      {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relativer Pfad der .md-Notiz.' },
        },
        required: ['path'],
      },
      (argumente) => {
        const vault = ermittleVault()
        if (vault === undefined) return { ok: false, error: 'Kein Obsidian-Vault ermittelt.' }
        const pfad = typeof argumente['path'] === 'string' ? argumente['path'] : ''
        const ziel = notizZiel(vault, pfad)
        if (!ziel.ok) return { ok: false, error: ziel.message }
        try {
          return { ok: true, path: ziel.rel, content: readFileSync(ziel.ziel, 'utf8') }
        } catch (fehler) {
          return { ok: false, error: fehlerText(fehler) }
        }
      },
    ),
    werkzeug(
      'obsidian_write',
      'Schreibt eine bestehende Obsidian-Notiz. Nur benutzen, wenn der Nutzer ausdrücklich um eine Änderung bittet; vorher den Inhalt lesen.',
      {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relativer Pfad der .md-Notiz.' },
          content: { type: 'string', description: 'Der vollständige neue Inhalt.' },
        },
        required: ['path', 'content'],
      },
      (argumente) => {
        const vault = ermittleVault()
        if (vault === undefined) return { ok: false, error: 'Kein Obsidian-Vault ermittelt.' }
        const pfad = typeof argumente['path'] === 'string' ? argumente['path'] : ''
        const inhalt = typeof argumente['content'] === 'string' ? argumente['content'] : ''
        if (inhalt.length > 200_000) return { ok: false, error: 'Höchstens 200 000 Zeichen.' }
        const ziel = notizZiel(vault, pfad)
        if (!ziel.ok) return { ok: false, error: ziel.message }
        try {
          writeFileSync(ziel.ziel, inhalt, 'utf8')
          return { ok: true, path: ziel.rel, bytes: Buffer.byteLength(inhalt, 'utf8') }
        } catch (fehler) {
          return { ok: false, error: fehlerText(fehler) }
        }
      },
    ),
  ]
}

/**
 * Hängt die vier Routen und drei Agent-Werkzeuge ein.
 *
 * @param ctx - der Plugin-Kontext mit Webserver und Werkzeug-Registry
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const abmeldungen = obsidianWerkzeuge().map((definition) => ctx.tools.register(definition))
    return () => {
      for (const ab of abmeldungen) ab()
    }
  }, `${name} obsidian_search/read/write`)

  ctx.effect(() => {
    const routen: readonly WebRoute[] = [
      { kind: 'exact', path: STATUS_PATH, handler: nurLokal(mitMethode('GET', statusRoute)) },
      { kind: 'exact', path: GRAPH_PATH, handler: nurLokal(mitMethode('GET', graphRoute)) },
      { kind: 'exact', path: VAULT_PATH, handler: nurLokal(mitMethode('POST', vaultRoute)) },
      { kind: 'exact', path: NOTE_PATH, handler: nurLokal(noteRoute) },
      { kind: 'exact', path: SYNC_PATH, handler: nurLokal(mitMethode('POST', syncRoute)) },
      { kind: 'exact', path: APP_PATH, handler: nurLokal(mitMethode('GET', appRoute)) },
      { kind: 'exact', path: APP_OPEN_PATH, handler: nurLokal(mitMethode('POST', appOpenRoute)) },
    ]
    const abbrueche = routen.map((route) => ctx.webServer.register(route))
    return () => {
      for (const ab of abbrueche) ab()
    }
  }, `${name} ${BASIS}`)

  /*
   * **Beim Einschalten des Plugins das Programm nachziehen.**
   *
   * Der Betreiber: *„wenn obsidian existiert oder nicht sollten wir es mit plugin
   * installation obsidian mit checken installieren passend zur betriebssystem."*
   * Das Plugin ist der richtige Ort — wer es einschaltet, will das Panel, und ein
   * Panel ohne Programm ist eine halbe Sache.
   *
   * **Warum das nicht blockiert.** Der Start des Hosts darf nicht an einem
   * Paketmanager hängen: die Installation läuft asynchron und ihr Ergebnis wird
   * nur protokolliert. Scheitert sie, sagt das Panel es beim nächsten Lesen — und
   * ein Merker verhindert, daß jeder Start denselben Fehlversuch wiederholt.
   *
   * **Warum ein Merker und kein Zustand im Speicher.** Der Host wird neu gestartet;
   * ein Speicherzustand wäre damit weg, und ein Rechner ohne winget/brew/flatpak
   * würde bei jedem Start erneut einen Paketmanager suchen.
   */
  if (findeApp().verfuegbar === false && darfInstallieren()) {
    const home = process.env['DSH_HOME'] ?? process.env['PMH_HOME']
    const schonVersucht = home !== undefined && vorKurzemGescheitert(home)
    const rezept = findeRezept()
    if (!schonVersucht && rezept !== undefined) {
      // Nach dem Start, nicht davor: die Oberfläche soll zuerst erreichbar sein.
      const timer = setTimeout(() => {
        void installiereObsidian(undefined, () => findeApp().verfuegbar)
          .then((ergebnis) => {
            const lage = ergebnis.ok ? 'installiert' : 'nicht installiert'
            process.stderr.write(`[pmh] Obsidian ${lage}: ${ergebnis.weg}\n`)
            if (home !== undefined) merkeVersuch(home, ergebnis.ok, ergebnis.weg)
          })
          .catch((problem: unknown) => {
            process.stderr.write(
              `[pmh] Obsidian: Installation abgebrochen — ${problem instanceof Error ? problem.message : String(problem)}\n`,
            )
          })
      }, 5000)
      timer.unref?.()
    } else if (!schonVersucht && rezept === undefined) {
      process.stderr.write(
        '[pmh] Obsidian fehlt, und es gibt keinen Installationsweg auf dieser Maschine ' +
          '(winget/brew/flatpak/snap). Das Panel sagt es; PMH_OBSIDIAN_INSTALL=0 schaltet den Versuch ab.\n',
      )
    }
  }
}

export default apply
