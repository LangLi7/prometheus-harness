/**
 * **`@prometheus-harness/world-graphify` — Graphifys Graph am Webserver des Kerns.**
 *
 * ## Der Auftrag
 *
 * Graphify ist ein Python-CLI/Skill, das aus einem Repository einen Graphen
 * macht: Dateien, Symbole, aufgelöste Beziehungen. Dieses Paket **ersetzt es
 * nicht** — es liest seine Ausgabe (`graphify-out/graph.json`), zeigt sie in
 * der Form der Welt (`WorldGraph`) und startet auf Wunsch einen Lauf.
 *
 * ## Fünf Routen, alle nur auf diesem Rechner
 *
 * | Weg | Was er tut |
 * |---|---|
 * | `GET  /api/world/graphify/status` | Ist die CLI da? Gibt es einen Graphen? |
 * | `GET  /api/world/graphify/graph`  | die Ausgabe als `WorldGraph` |
 * | `POST /api/world/graphify/run`    | ein Lauf (`deep` oder `update`) |
 * | `GET/POST /api/world/graphify/config` | Befehl, Ordner, Wurzel, Selbstinstallation lesen/schreiben |
 * | `GET/POST /api/world/graphify/setup`  | CLI prüfen und über uv/pipx/pip installieren |
 *
 * **Warum local-only.** `/run` startet ein Programm, `/setup` installiert eines,
 * `/config` schreibt eine Datei, `/graph` liest das Dateisystem. Der Webserver
 * kann auf einer loopback-Adresse laufen — diese Prüfung ist die **zweite**
 * Zaunlatte, und eine zweite Latte, die zu weit greift, ist keine. Deshalb wird
 * jede Anfrage anhand von `req.socket.remoteAddress` geprüft, nicht anhand
 * eines Kopfes: `X-Forwarded-For` ist ein Wunsch des Clients, keine Adresse.
 *
 * ## Was dieses Paket **nicht** tut
 *
 * * **Es nimmt keine Argumente aus dem Körper.** Der Befehl kommt aus der
 *   Konfiguration, die Argumente aus {@link argsFuer}. `/setup` kennt nur die
 *   drei festen Installationswege; ein Lauf ist damit kein Ausführungsdienst
 *   für beliebige Kommandozeilen.
 * * **Es wirft nicht.** Fehlt die Datei oder ist sie kaputt, antwortet
 *   `/graph` mit einem **gültigen leeren Graphen** samt `available: false` und
 *   `error` in der Quelle. Ein Fehler, den man zeichnen kann, ist besser als
 *   eine abgebrochene Antwort.
 *
 * @module @prometheus-harness/world-graphify
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { WorldGraph } from '@prometheus-harness/world-graph'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import {
  argsFuer,
  fehlerText,
  graphDatei,
  leseConfig,
  speichereConfig,
  type GraphifyConfig,
  type GraphifyMode,
} from './config.ts'
import { istLokal, json, readJson } from './http.ts'
import { leererGraph, worldGraphAus } from './mapping.ts'
import {
  autoInstalliere,
  findeGraphify,
  setupStatus,
  starteInstallation,
  type SetupMethod,
} from './setup.ts'

/** Stabiler Cordis-Plugin-Name — er steht in der Patch-Zeile und in jeder Meldung. */
export const name = 'pmh-world-graphify'

/** Der Dienst, ohne den es nichts zu registrieren gibt. */
export const inject = ['webServer']

/** Die gemeinsame Wurzel aller Wege. */
export const BASIS = '/api/world/graphify'

/** Der Zustand von CLI und Graph. */
export const PFAD_STATUS = `${BASIS}/status`

/** Der Graph selbst. */
export const PFAD_GRAPH = `${BASIS}/graph`

/** Ein Lauf der CLI. */
export const PFAD_RUN = `${BASIS}/run`

/** Die Konfiguration. */
export const PFAD_CONFIG = `${BASIS}/config`

/** Eine Datei aus dem Graph — für den Code-Viewer. */
export const PFAD_FILE = `${BASIS}/file`

/** Prüfen, ob die CLI da ist — und sie auf Wunsch installieren. */
export const PFAD_SETUP = `${BASIS}/setup`

/** Die Obergrenze eines Laufs: zehn Minuten. */
export const TIMEOUT_MS = 10 * 60 * 1000

/** So viel Ausgabe wird höchstens zurückgegeben. */
export const MAX_AUSGABE = 16 * 1024

/** Die Auskunft von {@link PFAD_STATUS}. */
export interface GraphifyStatus {
  readonly id: 'graphify'
  readonly label: 'Graphify'
  readonly available: boolean
  readonly command: string
  readonly outDir: string
  readonly graphFile: string
  readonly nodes: number
  readonly edges: number
  readonly detail: string
  readonly error?: string
}

/** Die Laufart, wie sie in der Antwort steht; ohne Angabe `default`. */
export type GraphifyModus = GraphifyMode | 'default'

/** Die Antwort eines Laufs. */
export interface RunAntwort {
  readonly ok: boolean
  readonly exitCode: number | null
  readonly mode: GraphifyModus
  readonly command: string
  readonly output: string
  readonly error?: string
}

/** Die Antwort der Konfigurationsroute — die gespeicherten Felder. */
export type ConfigAntwort = GraphifyConfig

/** Antwortet mit 403, wenn die Anfrage nicht von diesem Rechner kommt. */
function nurLokal(req: IncomingMessage, res: ServerResponse): boolean {
  if (istLokal(req)) return true
  json(res, 403, { error: 'Diese Route ist nur von diesem Rechner erreichbar.' })
  return false
}

/** Antwortet mit 405 und nennt die erlaubten Methoden. */
function methodeNichtErlaubt(res: ServerResponse, erlaubt: readonly string[]): void {
  res.setHeader('Allow', erlaubt.join(', '))
  json(res, 405, { error: `Erlaubt: ${erlaubt.join(', ')}.` })
}

/**
 * Liest `graph.json` und übersetzt sie — **ohne** zu werfen.
 *
 * @param graphFile - der absolute Pfad der Datei
 * @param generatedAt - der Zeitpunkt; ohne Angabe jetzt
 * @returns der Graph oder ein leerer Graph mit dem Grund
 */
export function ladeGraph(graphFile: string, generatedAt?: string): WorldGraph {
  try {
    const roh = JSON.parse(readFileSync(graphFile, 'utf8')) as unknown
    return worldGraphAus(roh, graphFile, generatedAt)
  } catch (problem) {
    return leererGraph(
      graphFile,
      `Die Datei konnte nicht gelesen werden: ${fehlerText(problem)}`,
      generatedAt,
    )
  }
}

/**
 * **Die Statusauskunft.**
 *
 * `available` ist wahr, wenn **entweder** die CLI gefunden wird **oder** ein
 * lesbarer Graph vorliegt. Beides ist nützlich: wer die CLI hat, kann einen
 * Lauf starten; wer nur den Graphen hat, kann ihn ansehen. `detail` sagt, was
 * fehlt — eine Auskunft, die nur „nicht verfügbar" sagt, hilft niemandem.
 *
 * @param config - die Konfiguration; ohne Angabe wird sie gelesen
 * @returns die Auskunft
 */
export function graphifyStatus(config: GraphifyConfig = leseConfig()): GraphifyStatus {
  const graphFile = graphDatei(config)
  const graph = ladeGraph(graphFile)
  const quelle = graph.sources[0]
  const lesbar = quelle?.available === true
  // Auch an den bekannten uv-Orten suchen: nach einer Installation steht der
  // Ordner oft erst in der nächsten Sitzung im PATH.
  const cli = findeGraphify(config.command)
  const available = cli !== null || lesbar
  const teile: string[] = [
    cli === null ? `CLI „${config.command}" nicht gefunden` : `CLI: ${cli}`,
    lesbar ? `Graph: ${graphFile}` : `kein lesbarer Graph unter ${graphFile}`,
  ]
  if (!available) teile.push('Graphify ist weder installiert noch liegt ein Graph vor.')
  const error = lesbar ? undefined : (quelle?.error ?? `Kein Graph unter ${graphFile}.`)
  return {
    id: 'graphify',
    label: 'Graphify',
    available,
    command: config.command,
    outDir: config.outDir,
    graphFile,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    detail: teile.join(' · '),
    ...(error !== undefined ? { error } : {}),
  }
}

/**
 * Der Handler von {@link PFAD_STATUS}.
 *
 * @returns der Handler
 */
export function macheStatusHandler(): WebRoute['handler'] {
  return (req, res) => {
    if (!nurLokal(req, res)) return
    if ((req.method ?? 'GET') !== 'GET') {
      methodeNichtErlaubt(res, ['GET'])
      return
    }
    json(res, 200, graphifyStatus())
  }
}

/**
 * Der Handler von {@link PFAD_GRAPH}.
 *
 * **Immer 200.** Auch ein fehlender Graph ist eine Antwort und keine Störung:
 * der leere Graph trägt den Grund in seiner Quelle, und die Anzeige kann ihn
 * zeichnen.
 *
 * @returns der Handler
 */
export function macheGraphHandler(): WebRoute['handler'] {
  return (req, res) => {
    if (!nurLokal(req, res)) return
    if ((req.method ?? 'GET') !== 'GET') {
      methodeNichtErlaubt(res, ['GET'])
      return
    }
    const config = leseConfig()
    json(res, 200, ladeGraph(graphDatei(config)))
  }
}

/**
 * Der Handler von {@link PFAD_CONFIG} — lesen und schreiben.
 *
 * @returns der Handler
 */
export function macheConfigHandler(): WebRoute['handler'] {
  return async (req, res) => {
    if (!nurLokal(req, res)) return
    const methode = req.method ?? 'GET'
    if (methode === 'GET') {
      json(res, 200, configAntwort(leseConfig()))
      return
    }
    if (methode !== 'POST') {
      methodeNichtErlaubt(res, ['GET', 'POST'])
      return
    }
    const gelesen = await readJson(req)
    if (!gelesen.ok) {
      json(res, gelesen.status, { error: gelesen.error })
      return
    }
    const gespeichert = speichereConfig(gelesen.wert)
    if (!gespeichert.ok) {
      json(res, 400, { error: gespeichert.error })
      return
    }
    json(res, 200, configAntwort(gespeichert.wert))
  }
}

/**
 * Baut die Antwort der Konfigurationsroute.
 *
 * **Nur die gespeicherten Felder** — der Pfad der Datei folgt aus `DSH_HOME`
 * und ist keine Einstellung.
 *
 * @param config - die Konfiguration
 * @returns die Antwort
 */
function configAntwort(config: GraphifyConfig): ConfigAntwort {
  return {
    command: config.command,
    outDir: config.outDir,
    root: config.root,
    setup: config.setup,
  }
}

/** Das Ergebnis der Prüfung des `mode`-Feldes. */
export type ModusErgebnis =
  | { readonly ok: true; readonly mode: GraphifyMode | undefined }
  | { readonly ok: false; readonly error: string }

/**
 * Liest `mode` aus dem Körper — **nur** `deep` und `update` sind erlaubt.
 *
 * Ohne `mode` läuft die CLI ohne Zusatzargument. Ein unbekannter Wert ist ein
 * Fehler des Aufrufers und keine stille Vorgabe.
 *
 * @param roh - der Anfragekörper
 * @returns die Laufart oder der Grund der Ablehnung
 */
export function modusAus(roh: unknown): ModusErgebnis {
  if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
    return { ok: false, error: 'Der Körper muss ein JSON-Objekt sein.' }
  }
  const daten = roh as Record<string, unknown>
  if (!('mode' in daten)) return { ok: true, mode: undefined }
  const mode = daten['mode']
  if (mode === 'deep' || mode === 'update') return { ok: true, mode }
  return { ok: false, error: '„mode" muss „deep" oder „update" sein.' }
}

/**
 * Der Handler von {@link PFAD_RUN}.
 *
 * @returns der Handler
 */
export function macheRunHandler(): WebRoute['handler'] {
  return async (req, res) => {
    if (!nurLokal(req, res)) return
    if ((req.method ?? 'GET') !== 'POST') {
      methodeNichtErlaubt(res, ['POST'])
      return
    }
    const gelesen = await readJson(req)
    if (!gelesen.ok) {
      json(res, gelesen.status, { error: gelesen.error })
      return
    }
    const modus = modusAus(gelesen.wert)
    if (!modus.ok) {
      json(res, 400, { error: modus.error })
      return
    }
    json(res, 200, await fuehreAus(leseConfig(), modus.mode))
  }
}

/**
 * Startet die CLI und sammelt die Ausgabe.
 *
 * Der Befehl stammt **nur** aus `config`, die Argumente **nur** aus
 * {@link argsFuer}. Es gibt keinen Weg, aus dem Anfragekörper ein Argument zu
 * machen.
 *
 * @param config - die Konfiguration
 * @param mode - die Laufart
 * @returns die Antwort
 */
async function fuehreAus(config: GraphifyConfig, mode: GraphifyMode | undefined): Promise<RunAntwort> {
  const args = argsFuer(mode)
  const befehl = [config.command, ...args]
  const controller = new AbortController()
  const uhr = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let exitCode: number | null = null
  let ausgabe = ''
  let fehler: string | undefined
  try {
    const prozess = Bun.spawn(befehl, {
      cwd: config.root,
      stdout: 'pipe',
      stderr: 'pipe',
      signal: controller.signal,
    })
    const [aus, err] = await Promise.all([
      leseStrom(prozess.stdout, MAX_AUSGABE),
      leseStrom(prozess.stderr, MAX_AUSGABE),
    ])
    exitCode = await prozess.exited
    ausgabe = begrenze([aus, err].filter((teil) => teil !== '').join('\n'), MAX_AUSGABE)
  } catch (problem) {
    fehler = `Graphify konnte nicht gestartet werden: ${fehlerText(problem)}`
  } finally {
    clearTimeout(uhr)
  }
  if (controller.signal.aborted) fehler = `Zeitüberschreitung nach ${TIMEOUT_MS / 60_000} Minuten.`
  return {
    ok: fehler === undefined && exitCode === 0,
    exitCode,
    mode: mode ?? 'default',
    command: befehl.join(' '),
    output: ausgabe,
    ...(fehler !== undefined ? { error: fehler } : {}),
  }
}

/**
 * Liest einen Ausgabestrom und behält höchstens `grenze` Bytes.
 *
 * Der Rest wird **weiter gelesen und verworfen**, nicht abgebrochen: ein
 * geschlossenes Rohr würde dem Programm einen Schreibfehler geben und den
 * Exit-Code verfälschen. Begrenzt wird die Antwort, nicht der Lauf.
 *
 * @param strom - der Strom
 * @param grenze - die Obergrenze in Bytes
 * @returns der gelesene Text
 */
async function leseStrom(strom: ReadableStream<Uint8Array>, grenze: number): Promise<string> {
  const leser = strom.getReader()
  const teile: Buffer[] = []
  let gesamt = 0
  let gekuerzt = false
  try {
    for (;;) {
      const { done, value } = await leser.read()
      if (done) break
      if (value === undefined) continue
      const rest = grenze - gesamt
      if (rest <= 0) {
        gekuerzt = true
        continue
      }
      const stueck = value.byteLength > rest ? value.subarray(0, rest) : value
      teile.push(Buffer.from(stueck))
      gesamt += stueck.byteLength
      if (value.byteLength > rest) gekuerzt = true
    }
  } finally {
    leser.releaseLock()
  }
  const text = Buffer.concat(teile).toString('utf8')
  return gekuerzt ? `${text}\n… (gekürzt auf ${grenze} Bytes)` : text
}

/**
 * Kürzt einen Text auf **höchstens** `grenze` Bytes.
 *
 * Der Hinweis auf die Kürzung zählt gegen die Grenze: die Antwort soll klein
 * bleiben, nicht „klein plus Hinweis" sein. Drei Byte Rücklage deckt den Fall
 * ab, daß der Schnitt mitten in einem Mehrbytezeichen liegt und die Dekodierung
 * daraus ein Ersatzzeichen macht.
 *
 * @param text - der Text
 * @param grenze - die Obergrenze in Bytes
 * @returns der gekürzte Text
 */
function begrenze(text: string, grenze: number): string {
  const roh = Buffer.from(text, 'utf8')
  if (roh.byteLength <= grenze) return text
  const hinweis = '\n… (gekürzt)\n'
  const hinweisBytes = Buffer.byteLength(hinweis, 'utf8')
  if (grenze <= hinweisBytes + 3) return roh.subarray(0, grenze).toString('utf8')
  const platz = grenze - hinweisBytes - 3
  return `${roh.subarray(0, platz).toString('utf8')}${hinweis}`
}

/**
 * Hängt die vier Routen ein.
 *
 * @param ctx - der Plugin-Kontext mit dem Webserver
 */
/**
 * `GET file?path=…` — eine Quelldatei für den Viewer.
 *
 * Nur Text, nur innerhalb von `config.root`, höchstens 400 000 Zeichen. Der
 * Pfad kommt aus dem Graphen (`source_file`), wird aber trotzdem geprüft.
 */
const SPRACHEN: Readonly<Record<string, string>> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.css': 'css',
  '.html': 'html',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.sh': 'bash',
  '.ps1': 'powershell',
}

type DateiZiel =
  | { readonly ok: true; readonly ziel: string; readonly rel: string; readonly sprache: string }
  | { readonly ok: false; readonly status: number; readonly error: string }

/**
 * Löst einen Graphpfad sicher gegen `config.root` auf.
 *
 * Die Datei muss existieren; `..`, absolute Pfade und Symlinks nach draußen
 * werden abgelehnt. Dieselbe Prüfung gilt für Lesen und Schreiben.
 */
function dateiZiel(rel: string): DateiZiel {
  if (rel.length === 0 || rel.includes('\0') || isAbsolute(rel)) {
    return { ok: false, status: 400, error: 'Der Pfad muss relativ zur Wurzel sein.' }
  }
  const wurzel = resolve(leseConfig().root)
  const ziel = resolve(wurzel, rel)
  const zurueck = relative(wurzel, ziel)
  if (zurueck.startsWith('..') || isAbsolute(zurueck)) {
    return { ok: false, status: 403, error: 'Der Pfad liegt außerhalb der Wurzel.' }
  }
  const endung = ziel.toLowerCase().slice(ziel.lastIndexOf('.'))
  const sprache = SPRACHEN[endung]
  if (sprache === undefined) {
    return { ok: false, status: 415, error: `Für ${endung || 'diese Datei'} gibt es keinen Viewer.` }
  }
  try {
    const echteWurzel = realpathSync(wurzel)
    const echtesZiel = realpathSync(ziel)
    const echtRel = relative(echteWurzel, echtesZiel)
    if (echtRel.startsWith('..') || isAbsolute(echtRel)) {
      return { ok: false, status: 403, error: 'Der Pfad liegt außerhalb der Wurzel.' }
    }
  } catch (fehler) {
    return { ok: false, status: 404, error: fehlerText(fehler) }
  }
  return { ok: true, ziel, rel: zurueck.replaceAll('\\', '/'), sprache }
}

/** `GET file` liest, `POST file` schreibt eine bestehende Textdatei. */
export function macheFileHandler(): WebRoute['handler'] {
  return (req, res) => {
    if (!nurLokal(req, res)) return
    const methode = req.method ?? 'GET'
    if (methode === 'POST') {
      void dateiWrite(req, res)
      return
    }
    if (methode !== 'GET') {
      methodeNichtErlaubt(res, ['GET', 'POST'])
      return
    }
    const url = new URL(req.url ?? '', 'http://localhost')
    const rel = url.searchParams.get('path')
    if (rel === null || rel.length === 0) {
      json(res, 400, { error: 'Erwartet wird ?path=<relativer Pfad>.' })
      return
    }
    const ziel = dateiZiel(rel)
    if (!ziel.ok) {
      json(res, ziel.status, { error: ziel.error })
      return
    }
    try {
      const inhalt = readFileSync(ziel.ziel, 'utf8')
      json(res, 200, {
        path: ziel.rel,
        content: inhalt.slice(0, 400_000),
        language: ziel.sprache,
        // Die Zeilenzahl kommt vom Server: der Client muss sie nicht aus dem
        // Text raten, und der Gutter bleibt auch bei einer Zeile richtig.
        lines: inhalt.split('\n').length,
      })
    } catch (fehler) {
      json(res, 404, { error: fehlerText(fehler) })
    }
  }
}

/** `POST file` — Inhalt einer bestehenden Datei speichern. */
async function dateiWrite(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const gelesen = await readJson(req)
  if (!gelesen.ok) {
    json(res, gelesen.status, { error: gelesen.error })
    return
  }
  const daten =
    typeof gelesen.wert === 'object' && gelesen.wert !== null
      ? (gelesen.wert as Record<string, unknown>)
      : {}
  const pfad = daten['path']
  const inhalt = daten['content']
  if (typeof pfad !== 'string' || typeof inhalt !== 'string') {
    json(res, 400, { error: 'Erwartet wird { "path": "…", "content": "…" }.' })
    return
  }
  if (inhalt.length > 400_000) {
    json(res, 413, { error: 'Eine Datei darf höchstens 400 000 Zeichen haben.' })
    return
  }
  const ziel = dateiZiel(pfad)
  if (!ziel.ok) {
    json(res, ziel.status, { error: ziel.error })
    return
  }
  try {
    writeFileSync(ziel.ziel, inhalt, 'utf8')
    json(res, 200, {
      ok: true,
      path: ziel.rel,
      language: ziel.sprache,
      lines: inhalt.split('\n').length,
      bytes: Buffer.byteLength(inhalt, 'utf8'),
    })
  } catch (fehler) {
    json(res, 500, { error: fehlerText(fehler) })
  }
}

/**
 * Das Ergebnis der Prüfung des `method`-Feldes.
 *
 * Ohne Angabe wird der erkannte Weg genommen. Ein unbekannter Wert ist ein
 * Fehler des Aufrufers — es gibt keinen vierten Weg.
 */
export type MethodenWahl =
  | { readonly ok: true; readonly method: SetupMethod | undefined }
  | { readonly ok: false; readonly error: string }

/**
 * Liest `method` aus dem Körper.
 *
 * @param roh - der Anfragekörper
 * @returns die Wahl oder der Grund der Ablehnung
 */
export function methodeAus(roh: unknown): MethodenWahl {
  if (roh === null || typeof roh !== 'object' || Array.isArray(roh)) {
    return { ok: false, error: 'Der Körper muss ein JSON-Objekt sein.' }
  }
  const daten = roh as Record<string, unknown>
  if (!('method' in daten)) return { ok: true, method: undefined }
  const methode = daten['method']
  if (methode === 'uv' || methode === 'pipx' || methode === 'pip') return { ok: true, method: methode }
  return { ok: false, error: '„method" muss „uv", „pipx" oder „pip" sein.' }
}

/**
 * Der Handler von {@link PFAD_SETUP}.
 *
 * `GET` prüft nur. `POST` installiert — über den genannten oder den erkannten
 * Weg — und antwortet mit der Auskunft **danach**, also samt Ergebnis.
 *
 * @returns der Handler
 */
export function macheSetupHandler(): WebRoute['handler'] {
  return async (req, res) => {
    if (!nurLokal(req, res)) return
    const methode = req.method ?? 'GET'
    if (methode === 'GET') {
      json(res, 200, setupStatus())
      return
    }
    if (methode !== 'POST') {
      methodeNichtErlaubt(res, ['GET', 'POST'])
      return
    }
    const gelesen = await readJson(req)
    if (!gelesen.ok) {
      json(res, gelesen.status, { error: gelesen.error })
      return
    }
    const wahl = methodeAus(gelesen.wert)
    if (!wahl.ok) {
      json(res, 400, { error: wahl.error })
      return
    }
    const ergebnis = await starteInstallation(wahl.method)
    json(res, 200, { ...setupStatus(), installiert: ergebnis })
  }
}

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const wege: readonly WebRoute[] = [
      { kind: 'exact', path: PFAD_STATUS, handler: macheStatusHandler() },
      { kind: 'exact', path: PFAD_GRAPH, handler: macheGraphHandler() },
      { kind: 'exact', path: PFAD_RUN, handler: macheRunHandler() },
      { kind: 'exact', path: PFAD_CONFIG, handler: macheConfigHandler() },
      { kind: 'exact', path: PFAD_FILE, handler: macheFileHandler() },
      { kind: 'exact', path: PFAD_SETUP, handler: macheSetupHandler() },
    ]
    const ab = wege.map((weg) => ctx.webServer.register(weg))
    return () => {
      for (const einer of ab.reverse()) einer()
    }
  }, `${name} ${BASIS}`)

  /*
   * **Die Selbstinstallation.**
   *
   * Läuft neben dem Start, nicht davor: ein fehlendes Paket soll den Host nicht
   * aufhalten. Ob überhaupt installiert wird, entscheidet `setup` in der
   * Konfiguration (`auto` | `ask` | `never`); ein Fehlschlag wird gemeldet und
   * beim nächsten Start erneut versucht.
   */
  ctx.effect(() => {
    void autoInstalliere()
      .then((ergebnis) => {
        if (ergebnis === null) return
        if (ergebnis.ok) {
          console.log(`graphify: CLI installiert (${ergebnis.method})${ergebnis.pfad === null ? '' : `: ${ergebnis.pfad}`}`)
        } else {
          console.warn(`graphify: Installation über ${ergebnis.method} fehlgeschlagen — ${ergebnis.error ?? 'ohne Meldung'}`)
        }
      })
      .catch((problem: unknown) => {
        console.warn(`graphify: Selbstinstallation nicht möglich — ${fehlerText(problem)}`)
      })
    return () => undefined
  }, `${name} Selbstinstallation`)
}

export default apply
