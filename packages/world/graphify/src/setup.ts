/**
 * **Graphify kommt mit.**
 *
 * Wer das Plugin installiert, soll die CLI nicht von Hand suchen müssen. Diese
 * Datei prüft, ob `graphify` da ist, und installiert es sonst über den
 * vorhandenen Paketmanager — in fester Reihenfolge:
 *
 * | Reihenfolge | Werkzeug | Befehl |
 * |---|---|---|
 * | 1 | `uv` | `uv tool install graphifyy` |
 * | 2 | `pipx` | `pipx install graphifyy` |
 * | 3 | Python | `python -m pip install --user graphifyy` |
 *
 * ## Warum die Reihenfolge fest ist
 *
 * `uv tool install` legt ein eigenes, isoliertes Werkzeug an — kein Eingriff in
 * die Pakete des Systems. `pipx` tut dasselbe, nur älter. `pip --user` ist die
 * letzte Wahl, weil es in die Nutzerumgebung schreibt und auf verwalteten
 * Systemen (PEP 668) scheitern darf; das ist dann eine Meldung, kein Absturz.
 *
 * ## Warum hier kein beliebiger Befehl entsteht
 *
 * Es gibt **drei** feste Befehlsformen; Paketname und Argumente stehen im Code.
 * Aus dem Anfragekörper kommt höchstens die **Wahl** zwischen ihnen, und ein
 * unbekannter Wert wird abgelehnt. Eine Route, die aus einem Körper eine
 * Kommandozeile baut, wäre ein Ausführungsdienst.
 *
 * ## Was hier **nicht** passiert
 *
 * * Kein `curl | sh`, kein Herunterladen eines Installers, kein `sudo`.
 * * Kein Eingriff, wenn `uv`, `pipx` und Python fehlen: dann stehen die
 *   Hinweise in {@link SetupStatus.hinweise}, und der Mensch entscheidet.
 * * Kein Nachinstallieren des MCP-Servers; der ist ein eigener Profil-Eintrag.
 *
 * @module @prometheus-harness/world-graphify/setup
 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import {
  fehlerText,
  leseConfig,
  speichereConfig,
  type GraphifyConfig,
  type SetupModus,
} from './config.ts'

/** Der Paketname bei PyPI. */
export const PAKET = 'graphifyy'

/** So lange darf eine Installation höchstens dauern. */
export const INSTALL_TIMEOUT_MS = 5 * 60 * 1000

/** So viel Ausgabe wird behalten. */
export const MAX_AUSGABE = 8 * 1024

/** Der Weg, den eine Installation nimmt. */
export type SetupMethod = 'uv' | 'pipx' | 'pip' | 'none'

/** Das Ergebnis eines Installationsversuchs. */
export interface InstallErgebnis {
  readonly ok: boolean
  readonly method: SetupMethod
  /** Der ausgeführte Befehl, nur zur Anzeige. */
  readonly command: string
  readonly output: string
  readonly error?: string
  readonly at: string
  /** Der gefundene Pfad zur CLI, wenn die Installation geglückt ist. */
  readonly pfad: string | null
}

/** Die Auskunft von `GET /setup`. */
export interface SetupStatus {
  readonly platform: string
  readonly command: string
  readonly cli: string | null
  readonly uv: string | null
  readonly pipx: string | null
  readonly python: string | null
  readonly method: SetupMethod
  readonly installable: boolean
  readonly modus: SetupModus
  readonly installiert: InstallErgebnis | null
  readonly hinweise: readonly string[]
}

/**
 * Sucht einen Befehl — als Namen über `PATH` oder als absoluten Pfad.
 *
 * @param befehl - der Name oder Pfad
 * @returns der gefundene Pfad oder `null`
 */
export function findeBefehl(befehl: string): string | null {
  const wert = befehl.trim()
  if (wert === '') return null
  if (isAbsolute(wert)) return existsSync(wert) ? wert : null
  try {
    return Bun.which(wert)
  } catch {
    return null
  }
}

/**
 * Die Orte, an denen `uv tool install` die CLI ablegt.
 *
 * **Warum das nötig ist.** Nach einer Installation steht der Ordner oft erst in
 * der nächsten Sitzung im `PATH`; der Host läuft aber schon. Wer nur `which`
 * fragt, sähe die CLI bis zum Neustart als fehlend.
 *
 * @param platform - die Plattform (`process.platform`)
 * @param home - das Benutzerverzeichnis
 * @param appData - `%APPDATA%` unter Windows
 * @returns die Kandidaten in sinnvoller Reihenfolge
 */
export function kandidaten(
  platform: string = process.platform,
  home: string = homedir(),
  appData: string | undefined = process.env['APPDATA'],
): readonly string[] {
  if (platform === 'win32') {
    const liste: string[] = []
    if (appData !== undefined && appData.trim() !== '') {
      liste.push(join(appData, 'uv', 'tools', 'graphifyy', 'Scripts', 'graphify.exe'))
    }
    liste.push(join(home, '.local', 'bin', 'graphify.exe'))
    return liste
  }
  return [
    join(home, '.local', 'bin', 'graphify'),
    join(home, '.local', 'share', 'uv', 'tools', 'graphifyy', 'bin', 'graphify'),
  ]
}

/**
 * Findet die CLI: erst unter dem konfigurierten Namen, dann an den bekannten Orten.
 *
 * @param command - der konfigurierte Befehl
 * @returns der Pfad oder `null`
 */
export function findeGraphify(command: string): string | null {
  const direkt = findeBefehl(command)
  if (direkt !== null) return direkt
  for (const kandidat of kandidaten()) {
    if (existsSync(kandidat)) return kandidat
  }
  return null
}

/**
 * Wählt den Weg der Installation.
 *
 * @param hatUv - `uv` wurde gefunden
 * @param hatPipx - `pipx` wurde gefunden
 * @param hatPython - ein Python-Interpreter wurde gefunden
 * @returns der Weg; `none`, wenn keiner bleibt
 */
export function waehleMethode(hatUv: boolean, hatPipx: boolean, hatPython: boolean): SetupMethod {
  if (hatUv) return 'uv'
  if (hatPipx) return 'pipx'
  if (hatPython) return 'pip'
  return 'none'
}

/**
 * Baut die feste Befehlszeile einer Methode.
 *
 * @param method - der Weg
 * @param python - der gefundene Python-Pfad (nur für `pip`)
 * @returns die Argumentliste oder `null`
 */
export function installBefehl(method: SetupMethod, python: string | null): readonly string[] | null {
  if (method === 'uv') return ['uv', 'tool', 'install', PAKET]
  if (method === 'pipx') return ['pipx', 'install', PAKET]
  if (method === 'pip') {
    if (python === null) return null
    // `py` ist der Windows-Starter und braucht die Versionswahl. `basename`
    // erkennt auf Linux den Backslash nicht als Trenner, deshalb der Split: der
    // Test prüft den Windows-Pfad auf jeder Plattform.
    const name = python.includes('\\') ? (python.split('\\').pop() ?? '') : basename(python)
    const starter = /^py(?:\.exe)?$/iu.test(name)
    return [python, ...(starter ? ['-3'] : []), '-m', 'pip', 'install', '--user', PAKET]
  }
  return null
}

/**
 * Die Hinweise, wenn kein Paketmanager da ist.
 *
 * @param platform - die Plattform
 * @returns die Zeilen für die Anzeige
 */
function hinweise(platform: string): readonly string[] {
  if (platform === 'win32') {
    return [
      'Kein uv, pipx oder Python gefunden.',
      'uv installieren: winget install --id=astral-sh.uv -e',
      'Danach im Panel erneut auf „Prüfen" gehen.',
    ]
  }
  return [
    'Kein uv, pipx oder Python gefunden.',
    'uv installieren: curl -LsSf https://astral.sh/uv/install.sh | sh',
    'Danach im Panel erneut auf „Prüfen" gehen.',
  ]
}

/**
 * Der zuletzt gelaufene Installationsversuch dieses Prozesses.
 *
 * **Warum im Speicher und nicht in der Konfiguration.** Ein Ergebnis ist eine
 * Beobachtung dieses Laufs, keine Einstellung; es in die Datei zu schreiben
 * hieße, eine vergangene Ausgabe als Wahrheit zu speichern.
 */
let letztes: InstallErgebnis | null = null

/** Läuft gerade eine Installation? Ein zweiter Aufruf hängt sich daran. */
let laufend: Promise<InstallErgebnis> | null = null

/** Wurde seit dem Start schon einmal automatisch installiert? */
let versucht = false

/**
 * Die Auskunft über CLI und Installationswege.
 *
 * @param config - die Konfiguration; ohne Angabe wird sie gelesen
 * @returns die Auskunft
 */
export function setupStatus(config: GraphifyConfig = leseConfig()): SetupStatus {
  const cli = findeGraphify(config.command)
  const uv = findeBefehl('uv')
  const pipx = findeBefehl('pipx')
  const python = findeBefehl('python3') ?? findeBefehl('python') ?? findeBefehl('py')
  const method = waehleMethode(uv !== null, pipx !== null, python !== null)
  return {
    platform: process.platform,
    command: config.command,
    cli,
    uv,
    pipx,
    python,
    method,
    installable: method !== 'none',
    modus: config.setup,
    installiert: letztes,
    hinweise: method === 'none' && cli === null ? hinweise(process.platform) : [],
  }
}

/**
 * Liest einen Ausgabestrom und behält höchstens `grenze` Bytes.
 *
 * @param strom - der Strom
 * @param grenze - die Obergrenze in Bytes
 * @returns der Text
 */
async function leseStrom(strom: ReadableStream<Uint8Array>, grenze: number): Promise<string> {
  const leser = strom.getReader()
  const teile: Buffer[] = []
  let gesamt = 0
  try {
    for (;;) {
      const { done, value } = await leser.read()
      if (done) break
      if (value === undefined) continue
      const rest = grenze - gesamt
      if (rest <= 0) continue
      const stueck = value.byteLength > rest ? value.subarray(0, rest) : value
      teile.push(Buffer.from(stueck))
      gesamt += stueck.byteLength
    }
  } finally {
    leser.releaseLock()
  }
  return Buffer.concat(teile).toString('utf8')
}

/**
 * Führt einen Installationsweg aus und merkt sich den gefundenen Pfad.
 *
 * @param method - der gewünschte Weg; ohne Angabe der erkannte
 * @returns das Ergebnis
 */
async function installiere(method?: SetupMethod): Promise<InstallErgebnis> {
  const config = leseConfig()
  const status = setupStatus(config)
  const wahl = method ?? status.method
  const at = new Date().toISOString()
  const args = installBefehl(wahl, status.python)
  if (args === null) {
    const ergebnis: InstallErgebnis = {
      ok: false,
      method: wahl,
      command: '',
      output: '',
      error:
        wahl === 'none'
          ? 'Kein uv, pipx oder Python gefunden — bitte zuerst uv installieren.'
          : `Der Weg „${wahl}" braucht einen Pfad, der nicht gefunden wurde.`,
      at,
      pfad: null,
    }
    letztes = ergebnis
    return ergebnis
  }

  const befehl = args.join(' ')
  const controller = new AbortController()
  const uhr = setTimeout(() => controller.abort(), INSTALL_TIMEOUT_MS)
  let ausgabe = ''
  let exitCode: number | null = null
  let fehler: string | undefined
  try {
    const prozess = Bun.spawn([...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      signal: controller.signal,
    })
    const [aus, err] = await Promise.all([
      leseStrom(prozess.stdout, MAX_AUSGABE),
      leseStrom(prozess.stderr, MAX_AUSGABE),
    ])
    exitCode = await prozess.exited
    ausgabe = [aus, err].filter((teil) => teil.trim() !== '').join('\n').slice(0, MAX_AUSGABE)
  } catch (problem) {
    fehler = `Die Installation konnte nicht gestartet werden: ${fehlerText(problem)}`
  } finally {
    clearTimeout(uhr)
  }
  if (controller.signal.aborted) fehler = `Zeitüberschreitung nach ${INSTALL_TIMEOUT_MS / 60_000} Minuten.`
  if (fehlerFrei(exitCode, fehler)) {
    // Erst nach dem Lauf suchen: der Pfad entsteht währenddessen.
    const pfad = findeGraphify('graphify') ?? findeGraphify(leseConfig().command)
    if (pfad !== null) speichereConfig({ command: pfad })
    const ergebnis: InstallErgebnis = {
      ok: true,
      method: wahl,
      command: befehl,
      output: ausgabe,
      at,
      pfad,
    }
    letztes = ergebnis
    return ergebnis
  }
  const ergebnis: InstallErgebnis = {
    ok: false,
    method: wahl,
    command: befehl,
    output: ausgabe,
    error:
      fehler ??
      `Die Installation endete mit Code ${String(exitCode ?? '?')}. Die Ausgabe oben nennt den Grund.`,
    at,
    pfad: null,
  }
  letztes = ergebnis
  return ergebnis
}

/**
 * Ist der Lauf ohne Fehler zu Ende gegangen?
 *
 * @param exitCode - der Exit-Code oder `null`
 * @param fehler - ein schon bekannter Fehler
 * @returns ob der Lauf als geglückt gilt
 */
function fehlerFrei(exitCode: number | null, fehler: string | undefined): boolean {
  return fehler === undefined && exitCode === 0
}

/**
 * Startet eine Installation — oder hängt sich an die laufende.
 *
 * @param method - der gewünschte Weg; ohne Angabe der erkannte
 * @returns das Ergebnis
 */
export function starteInstallation(method?: SetupMethod): Promise<InstallErgebnis> {
  if (laufend !== null) return laufend
  const lauf = installiere(method)
  laufend = lauf
  void lauf.finally(() => {
    if (laufend === lauf) laufend = null
  })
  return lauf
}

/**
 * **Die Selbstinstallation beim Start.**
 *
 * Läuft nur, wenn `setup` auf `auto` steht, die CLI fehlt und ein Weg bekannt
 * ist. Einmal je Prozeß; ein Fehlschlag wird gemeldet, nicht wiederholt — sonst
 * hinge jeder Neustart an einem Netz, das nicht da ist.
 *
 * @returns das Ergebnis oder `null`, wenn nichts zu tun war
 */
export async function autoInstalliere(): Promise<InstallErgebnis | null> {
  if (versucht) return null
  versucht = true
  const config = leseConfig()
  if (config.setup !== 'auto') return null
  if (findeGraphify(config.command) !== null) return null
  const status = setupStatus(config)
  if (status.method === 'none') return null
  return starteInstallation(status.method)
}

/** Der letzte Versuch dieses Prozesses — für die Anzeige. */
export function letztesErgebnis(): InstallErgebnis | null {
  return letztes
}
