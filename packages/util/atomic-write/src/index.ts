/**
 * Dauerhafte atomare Schreibvorgänge über den Rust-Prozess `pmh-atomicfs`.
 *
 * Dieses Paket ersetzt das native Node-Addon `koffi` der Vorlage
 * (`MoveFileExW` mit `MOVEFILE_WRITE_THROUGH`). Es gibt **kein** natives Modul
 * und **kein** Linken: der Kern startet einen Prozess, schreibt den neuen
 * Inhalt nach stdin und liest **eine** JSON-Zeile von stdout.
 *
 * Prozessvertrag (native/atomicfs/README.md):
 *
 *     pmh-atomicfs write    <path> [--from <file> | --stdin] [--json]
 *     pmh-atomicfs read     <path>
 *     pmh-atomicfs identity <path>
 *     pmh-atomicfs cleanup  <path>
 *     pmh-atomicfs probe
 *
 * Erfolg: **eine** JSON-Zeile auf stdout
 *   `{"version":1,"path":"…","bytes":N,"synced":N,"replaced":bool,"identity":{"device":N,"inode":N}}`
 * Fehler: **ein** JSON-Objekt auf stderr `{"code":"…","message":"…","errno":N?}`
 * und Exit-Code **125**.
 *
 * Zwei Eigenschaften, die der Aufrufer kennen muss:
 *  1. Nach einem erfolgreichen `write` ist die **Identität eine andere** als
 *     vorher. Wer eine Sperre auf der alten Datei hält, hält sie auf einem
 *     verwaisten Inode — deshalb liefert der Report `identity`, und deshalb
 *     gibt es hier `identity()`.
 *  2. Der Programmpfad wird **nicht** über Umgebungsvariablen aufgelöst. Welches
 *     Programm schreibt, darf nicht von der Umgebung abhängen.
 */

/** Kommandos, die das Binary kennt. */
import { resolve } from 'node:path'

export type AtomicfsCommand = 'write' | 'read' | 'identity' | 'cleanup' | 'probe'

/** Geräte-/Inode-Identität einer Datei (unter Windows Volumen + Dateiindex). */
export interface AtomicfsIdentity {
  readonly device: number
  readonly inode: number
}

/** Die Erfolgszeile von `write`. */
export interface AtomicWriteReport {
  readonly version: number
  readonly path: string
  readonly bytes: number
  readonly synced: number
  readonly replaced: boolean
  readonly identity: AtomicfsIdentity
}

/** Die Erfolgszeile von `identity`. */
export interface AtomicfsIdentityReport {
  readonly version: number
  readonly path: string
  readonly identity: AtomicfsIdentity
}

/** Die Erfolgszeile von `cleanup`. */
export interface AtomicfsCleanupReport {
  readonly version: number
  readonly path: string
  readonly removed: boolean
}

/** Die Erfolgszeile von `probe`. */
export interface AtomicfsProbeReport {
  readonly version: number
  readonly [key: string]: unknown
}

/** Aufbereiteter Fehler des Binarys: symbolischer Code plus positives errno. */
export interface AtomicfsErrorDetail {
  readonly code: string
  readonly message: string
  /** Positives `errno`, wenn das Betriebssystem eines geliefert hat. */
  readonly errno?: number
}

/** Optionen für einen Prozessaufruf. */
export interface AtomicfsRunOptions {
  /** Programmpfad; sonst greift {@link resolveAtomicfsBinary}. */
  readonly binary?: string
  /**
   * Argumente, die **vor** die fachlichen Argumente gestellt werden. Leer im
   * Normalbetrieb; Tests schieben damit ein Testdoppel vor das Binary, statt
   * den Programmpfad zu einem Befehl mit Leerzeichen zu machen.
   */
  readonly prefixArgs?: readonly string[]
  /** Abbruchsignal des Aufrufers. */
  readonly signal?: AbortSignal
  /** Notbremse; Standard 30 000 ms. */
  readonly timeoutMs?: number
}

/**
 * Fehler beim Aufruf von `pmh-atomicfs`.
 *
 * Genau eine Klasse für alle Fälle — der Unterschied steckt in `code`:
 * `ERR_ATOMICFS_SPAWN` (Prozess ließ sich nicht starten, z. B. fehlendes
 * Binary), `ERR_ATOMICFS_EXIT` (Exit ohne verwertbaren Report),
 * `ERR_ATOMICFS_PROTOCOL` (Report fehlt, ist kein JSON oder hat die falsche
 * Form), `ERR_ATOMICFS_TIMEOUT`, `ABORTED` (Signal des Aufrufers).
 */
export class AtomicfsError extends Error {
  readonly code: string
  readonly errno: number | undefined
  readonly exitCode: number | undefined
  /** Rohinhalt von stderr — bleibt erhalten, auch wenn er kein JSON war. */
  readonly stderr: string

  constructor(
    message: string,
    options: {
      code: string
      errno?: number | undefined
      exitCode?: number | undefined
      stderr?: string | undefined
      cause?: unknown
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AtomicfsError'
    this.code = options.code
    this.errno = options.errno
    this.exitCode = options.exitCode
    this.stderr = options.stderr ?? ''
  }
}

/** Laufzeit einer Datei, wie `probe` sie meldet. */
export interface AtomicfsCapabilities {
  readonly version: number
  readonly platform: string
  readonly writeThrough: boolean
  readonly directorySync: boolean
  readonly identity: boolean
  /** Alle weiteren Felder des Reports, unverändert. */
  readonly extra: Readonly<Record<string, unknown>>
}

const DEFAULT_TIMEOUT_MS = 30_000

/** Verzeichnis der gebauten Binaries, vom Paket aus gesehen. */
const TARGET_DEBUG = resolve(import.meta.dir, '..', '..', '..', '..', 'target', 'debug')

/** Dateinamen, die das Binary je Plattform tragen kann (in Prüfreihenfolge). */
export function atomicfsBinaryNames(): readonly string[] {
  return process.platform === 'win32'
    ? ['pmh-atomicfs.exe', 'pmh-atomicfs']
    : ['pmh-atomicfs', 'pmh-atomicfs.exe']
}

/**
 * Standardpfad des Binarys: `target/debug/pmh-atomicfs[.exe]`.
 *
 * Bewusst **keine** Env-Variable: welches Programm schreibt, darf nicht von der
 * Umgebung abhängen (Sicherheitsanforderung der Vorlage, MAPPING.md §3.8). Die
 * Prüfung ist eine Dateisystemfrage, keine Umgebungsfrage.
 */
export function resolveAtomicfsBinary(): string {
  for (const name of atomicfsBinaryNames()) {
    const path = resolve(TARGET_DEBUG, name)
    if (Bun.file(path).size > 0) return path
  }
  return resolve(TARGET_DEBUG, atomicfsBinaryNames()[0] as string)
}

/** Ist ein Programm an diesem Pfad vorhanden? */
export async function atomicfsAvailable(binary = resolveAtomicfsBinary()): Promise<boolean> {
  try {
    const stat = await Bun.file(binary).stat()
    return stat.size > 0
  }
  catch {
    return false
  }
}

interface SpawnResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

interface SpawnOptions {
  readonly command: string
  readonly args: readonly string[]
  readonly stdin?: string | undefined
  readonly signal?: AbortSignal | undefined
  readonly timeoutMs: number
}

async function runProcess(options: SpawnOptions): Promise<SpawnResult> {
  const started = Date.now()
  let child: Bun.Subprocess<'pipe', 'pipe', 'pipe'>
  try {
    child = Bun.spawn([options.command, ...options.args], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })
  }
  catch (cause) {
    throw new AtomicfsError(`Programm nicht startbar: ${options.command}`, {
      code: 'ERR_ATOMICFS_SPAWN',
      cause,
    })
  }

  let timedOut = false
  const abort = (): void => {
    child.kill()
  }
  const timer = setTimeout(() => {
    timedOut = true
    child.kill()
  }, options.timeoutMs)
  options.signal?.addEventListener('abort', abort, { once: true })

  try {
    if (options.stdin !== undefined && child.stdin) {
      child.stdin.write(options.stdin)
    }
    child.stdin?.end()

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])

    if (options.signal?.aborted === true) {
      throw new AtomicfsError('Aufruf wurde abgebrochen', { code: 'ABORTED' })
    }
    if (timedOut) {
      throw new AtomicfsError(
        `pmh-atomicfs hat nach ${options.timeoutMs} ms nicht geantwortet (Laufzeit ${Date.now() - started} ms)`,
        { code: 'ERR_ATOMICFS_TIMEOUT', exitCode },
      )
    }
    return { exitCode, stdout, stderr }
  }
  finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

function parseError(stderr: string): AtomicfsErrorDetail | undefined {
  const line = stderr.trim().split(/\r?\n/).find((candidate) => candidate.trim().startsWith('{'))
  if (line === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(line)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const record = parsed as Record<string, unknown>
    const code = record['code']
    const message = record['message']
    if (typeof code !== 'string') return undefined
    const errno = record['errno']
    return {
      code,
      message: typeof message === 'string' ? message : code,
      ...(typeof errno === 'number' ? { errno } : {}),
    }
  }
  catch {
    return undefined
  }
}

function parseJsonObject(stdout: string): Record<string, unknown> | undefined {
  const line = stdout.trim().split(/\r?\n/).find((candidate) => candidate.trim().startsWith('{'))
  if (line === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(line)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  }
  catch {
    return undefined
  }
}

function requireIdentity(record: Record<string, unknown>): AtomicfsIdentity {
  const identity = record['identity']
  if (typeof identity !== 'object' || identity === null) {
    throw new AtomicfsError('Report enthält kein `identity`-Objekt', { code: 'ERR_ATOMICFS_PROTOCOL' })
  }
  const { device, inode } = identity as Record<string, unknown>
  if (typeof device !== 'number' || typeof inode !== 'number') {
    throw new AtomicfsError('`identity` braucht numerische Felder `device` und `inode`', {
      code: 'ERR_ATOMICFS_PROTOCOL',
    })
  }
  return { device, inode }
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new AtomicfsError(`Report braucht das Feld \`${key}\` als Zeichenkette`, {
      code: 'ERR_ATOMICFS_PROTOCOL',
    })
  }
  return value
}

/**
 * Ein Aufruf des Binarys. Jede Fachfunktion baut hierauf auf, damit
 * Prozessstart, Zeitüberschreitung, Abbruch und Fehlerabbildung **einmal**
 * implementiert sind.
 */
async function invoke(args: readonly string[], options: AtomicfsRunOptions, stdin?: string): Promise<Record<string, unknown>> {
  const binary = options.binary ?? resolveAtomicfsBinary()
  const result = await runProcess({
    command: binary,
    args: [...(options.prefixArgs ?? []), ...args],
    stdin,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  })

  if (result.exitCode !== 0) {
    const detail = parseError(result.stderr)
    if (detail !== undefined) {
      throw new AtomicfsError(detail.message, {
        code: detail.code,
        errno: detail.errno,
        exitCode: result.exitCode,
        stderr: result.stderr,
      })
    }
    throw new AtomicfsError(
      result.stderr.trim() === ''
        ? `pmh-atomicfs endete mit Exit ${result.exitCode} ohne Fehlerbericht`
        : result.stderr.trim(),
      { code: 'ERR_ATOMICFS_EXIT', exitCode: result.exitCode, stderr: result.stderr },
    )
  }

  const report = parseJsonObject(result.stdout)
  if (report === undefined) {
    throw new AtomicfsError(
      `pmh-atomicfs lieferte keine JSON-Zeile auf stdout: ${JSON.stringify(result.stdout.slice(0, 200))}`,
      { code: 'ERR_ATOMICFS_PROTOCOL', exitCode: result.exitCode, stderr: result.stderr },
    )
  }
  return report
}

/** Quellen des neuen Inhalts für {@link writeFileAtomic}. */
export type AtomicWriteSource =
  | { readonly text: string }
  | { readonly bytes: Uint8Array }
  /** Inhalt aus einer Datei lesen lassen (`--from <file>`); der Kern hält sie nicht offen. */
  | { readonly fromFile: string }

/** Ein dauerhafter, atomarer Schreibvorgang. */
export interface AtomicWriteOptions extends AtomicfsRunOptions {
  readonly source: AtomicWriteSource
  /** `--json` an das Binary durchreichen. */
  readonly json?: boolean
}

/**
 * Schreibt `source` dauerhaft und atomar nach `path`.
 *
 * Garantien liegen beim Binary: nie eine zerrissene Datei, Bytes auf dem Medium
 * vor der Erfolgsmeldung, dauerhaftes Umbenennen, berichtbare Identität. Hier
 * wird nur der Vertrag eingehalten und das Ergebnis geprüft.
 */
export async function writeFileAtomic(path: string, options: AtomicWriteOptions): Promise<AtomicWriteReport> {
  const args = ['write', path]
  let stdin: string | undefined
  const source = options.source

  if ('fromFile' in source) {
    args.push('--from', source.fromFile)
  }
  else {
    args.push('--stdin')
    stdin = 'text' in source ? source.text : new TextDecoder().decode(source.bytes)
  }
  if (options.json === true) args.push('--json')

  const report = await invoke(args, options, stdin)
  const bytes = report['bytes']
  const synced = report['synced']
  const replaced = report['replaced']
  if (typeof bytes !== 'number' || typeof synced !== 'number' || typeof replaced !== 'boolean') {
    throw new AtomicfsError('`write`-Report braucht `bytes`, `synced` und `replaced`', {
      code: 'ERR_ATOMICFS_PROTOCOL',
    })
  }
  return {
    version: typeof report['version'] === 'number' ? report['version'] : 1,
    path: requireString(report, 'path'),
    bytes,
    synced,
    replaced,
    identity: requireIdentity(report),
  }
}

/** Liest die Bytes einer Datei **unverändert** (die Ausgabe ist pipbar). */
export async function readFileBytes(path: string, options: AtomicfsRunOptions = {}): Promise<Uint8Array> {
  const binary = options.binary ?? resolveAtomicfsBinary()
  const result = await runProcess({
    command: binary,
    args: [...(options.prefixArgs ?? []), 'read', path],
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  })
  if (result.exitCode !== 0) {
    const detail = parseError(result.stderr)
    throw new AtomicfsError(detail?.message ?? `read endete mit Exit ${result.exitCode}`, {
      code: detail?.code ?? 'ERR_ATOMICFS_EXIT',
      errno: detail?.errno,
      exitCode: result.exitCode,
      stderr: result.stderr,
    })
  }
  return new TextEncoder().encode(result.stdout)
}

/** Gerät + Inode, **ohne** zu schreiben. */
export async function identity(path: string, options: AtomicfsRunOptions = {}): Promise<AtomicfsIdentityReport> {
  const report = await invoke(['identity', path], options)
  return {
    version: typeof report['version'] === 'number' ? report['version'] : 1,
    path: requireString(report, 'path'),
    identity: requireIdentity(report),
  }
}

/** Entfernt eine liegengebliebene temporäre Datei eines abgestürzten Schreibers. */
export async function cleanup(path: string, options: AtomicfsRunOptions = {}): Promise<AtomicfsCleanupReport> {
  const report = await invoke(['cleanup', path], options)
  const removed = report['removed']
  if (typeof removed !== 'boolean') {
    throw new AtomicfsError('`cleanup`-Report braucht das Feld `removed`', { code: 'ERR_ATOMICFS_PROTOCOL' })
  }
  return {
    version: typeof report['version'] === 'number' ? report['version'] : 1,
    path: requireString(report, 'path'),
    removed,
  }
}

/** Fähigkeiten dieses Builds. */
export async function probe(options: AtomicfsRunOptions = {}): Promise<AtomicfsCapabilities> {
  const report = await invoke(['probe'], options)
  if (typeof report['version'] !== 'number') {
    throw new AtomicfsError('`probe`-Report braucht das Feld `version`', { code: 'ERR_ATOMICFS_PROTOCOL' })
  }
  const { version, platform, writeThrough, directorySync, identity: identityField, ...rest } = report
  return {
    version,
    platform: typeof platform === 'string' ? platform : process.platform,
    writeThrough: writeThrough === true,
    directorySync: directorySync === true,
    identity: identityField === true,
    extra: rest,
  }
}

/** Synchrone Verfügbarkeitsprüfung — für Test-Gates ohne Top-Level-`await`. */
export function atomicfsAvailableSync(binary = resolveAtomicfsBinary()): boolean {
  try {
    return Bun.file(binary).size > 0
  }
  catch {
    return false
  }
}
