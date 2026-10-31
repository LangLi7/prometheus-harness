/**
 * `@prometheus-harness/plugin-hooks/hooks` — Claude-Hooks lesen und ausführen.
 *
 * **Was ein Claude-Hook ist.** Eine `hooks/hooks.json` im Plugin nennt Ereignisse
 * (`PreToolUse`, `PostToolUse`, …), je Ereignis einen Matcher auf den Werkzeugnamen
 * und je Matcher Befehle. Claude Code führt den Befehl aus, schreibt den Aufruf als
 * JSON auf stdin und liest die Entscheidung von stdout bzw. dem Exit-Code.
 *
 * **Was hier übernommen wird.** `PreToolUse` und `PostToolUse`, Matcher mit `|`
 * und regulärem Ausdruck, Exit-Code 2 als Blockade, `permissionDecision: "deny"`,
 * `decision: "block"` und `$CLAUDE_PLUGIN_ROOT`/`$CLAUDE_PROJECT_DIR`.
 *
 * **Was bewusst fehlt.** `prompt`-Hooks (sie brauchen ein Modell), `Stop`/`SessionEnd`
 * (der Host hat dafür andere Lebenszyklen) und jede Ausführung ohne ausdrückliche
 * Freigabe. Ein Hook ist fremder Code, der bei **jedem** Werkzeugaufruf läuft; das
 * ist eine Entscheidung des Betreibers, keine Vorgabe.
 *
 * @module @prometheus-harness/plugin-hooks/hooks
 */

import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { resolvePmhHome } from '@prometheus-harness/home-paths'

/** Ein einzelner Hook-Befehl. */
export interface HookCommand {
  readonly command: string
  readonly timeoutMs: number
}

/** Eine Matcher-Gruppe. */
export interface HookGroup {
  readonly matcher: string
  readonly commands: readonly HookCommand[]
}

/** Alle Hooks eines Plugins. */
export interface HookSet {
  readonly plugin: string
  readonly root: string
  readonly pre: readonly HookGroup[]
  readonly post: readonly HookGroup[]
}

/** Ergebnis des Ladens. */
export interface LoadedHooks {
  readonly sets: readonly HookSet[]
  readonly warnings: readonly string[]
}

/** Die Eingabe, die ein Hook auf stdin sieht. */
export interface HookInput {
  readonly hook_event_name: 'PreToolUse' | 'PostToolUse'
  readonly tool_name: string
  readonly tool_input: unknown
  readonly cwd: string
}

/** Eine Entscheidung aus einem Pre-Hook. */
export interface PreHookDecision {
  readonly block: boolean
  readonly reason?: string
}

/** Der Zustand der Freigaben. */
export interface HooksEnabled {
  readonly version: 1
  readonly enabled: readonly string[]
}

/** Pfad der Freigabedatei. */
export function enabledPath(home?: string): string {
  return join(home ?? resolvePmhHome(), 'hooks-enabled.json')
}

/**
 * Liest die freigegebenen Plugin-Ids.
 *
 * Fehlt die Datei oder ist sie kaputt, ist **nichts** freigegeben — der sichere
 * Zustand, nicht der bequeme.
 *
 * @param home - Harness-Home
 * @returns die Freigaben
 */
export async function readEnabled(home?: string): Promise<HooksEnabled> {
  try {
    const data: unknown = JSON.parse(await readFile(enabledPath(home), { encoding: 'utf8' }))
    if (typeof data !== 'object' || data === null) return { version: 1, enabled: [] }
    const enabled = (data as Record<string, unknown>)['enabled']
    return {
      version: 1,
      enabled: Array.isArray(enabled) ? enabled.filter((value): value is string => typeof value === 'string') : [],
    }
  } catch {
    return { version: 1, enabled: [] }
  }
}

/**
 * Schreibt die Freigaben.
 *
 * @param enabled - Plugin-Ids
 * @param home - Harness-Home
 */
export async function writeEnabled(enabled: readonly string[], home?: string): Promise<void> {
  const path = enabledPath(home)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    `${JSON.stringify({ version: 1, enabled: [...new Set(enabled)].sort() }, undefined, 2)}\n`,
    { encoding: 'utf8' },
  )
}

/**
 * Lädt die Hooks der freigegebenen Plugins.
 *
 * @param home - Harness-Home
 * @param enabled - Freigaben; ohne Angabe aus `hooks-enabled.json`
 * @returns Hook-Sätze und Warnungen
 */
export async function loadHooks(home?: string, enabled?: readonly string[]): Promise<LoadedHooks> {
  const h = home ?? resolvePmhHome()
  const ids = enabled ?? (await readEnabled(h)).enabled
  const sets: HookSet[] = []
  const warnings: string[] = []
  for (const id of ids) {
    const root = await pluginRoot(h, id)
    if (root === undefined) {
      warnings.push(`Hook-Plugin "${id}" ist nicht installiert.`)
      continue
    }
    const loaded = await readPluginHooks(root, id)
    warnings.push(...loaded.warnings)
    if (loaded.pre.length + loaded.post.length > 0) sets.push(loaded)
  }
  return { sets, warnings }
}

/**
 * Liest die Hooks eines Plugin-Verzeichnisses.
 *
 * @param root - Plugin-Wurzel
 * @param plugin - Plugin-Id
 * @returns der Hook-Satz
 */
export async function readPluginHooks(root: string, plugin: string): Promise<HookSet & { warnings: string[] }> {
  const warnings: string[] = []
  const files: string[] = []
  const manifest = await readJson(join(root, '.claude-plugin', 'plugin.json'))
  const declared = manifest?.['hooks']
  for (const entry of Array.isArray(declared) ? declared : declared === undefined ? [] : [declared]) {
    if (typeof entry === 'string') files.push(entry)
  }
  try {
    await readFile(join(root, 'hooks', 'hooks.json'))
    files.push('hooks/hooks.json')
  } catch {
    // Kein Standard-Hook; das ist normal.
  }

  const pre: HookGroup[] = []
  const post: HookGroup[] = []
  for (const file of [...new Set(files)]) {
    const data = await readJson(join(root, file))
    if (data === undefined) {
      warnings.push(`Hook-Datei fehlt oder ist kein JSON: ${file}`)
      continue
    }
    const hooks = (data['hooks'] ?? data) as unknown
    if (typeof hooks !== 'object' || hooks === null) continue
    const record = hooks as Record<string, unknown>
    collect(record['PreToolUse'], pre, warnings, file)
    collect(record['PostToolUse'], post, warnings, file)
  }
  return { plugin, root, pre, post, warnings }
}

function collect(value: unknown, target: HookGroup[], warnings: string[], file: string): void {
  if (!Array.isArray(value)) return
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue
    const group = raw as Record<string, unknown>
    const matcher = typeof group['matcher'] === 'string' ? group['matcher'] : ''
    const commands: HookCommand[] = []
    for (const item of Array.isArray(group['hooks']) ? group['hooks'] : []) {
      if (typeof item !== 'object' || item === null) continue
      const hook = item as Record<string, unknown>
      if (hook['type'] !== undefined && hook['type'] !== 'command') {
        warnings.push(`${file}: Hook-Typ "${String(hook['type'])}" wird nicht ausgeführt.`)
        continue
      }
      if (typeof hook['command'] !== 'string' || hook['command'].trim() === '') continue
      const timeout = typeof hook['timeout'] === 'number' && Number.isFinite(hook['timeout'])
        ? Math.min(120_000, Math.max(1_000, hook['timeout']))
        : 10_000
      commands.push({ command: hook['command'], timeoutMs: timeout })
    }
    if (commands.length > 0) target.push({ matcher, commands })
  }
}

/**
 * Ob ein Matcher einen Werkzeugnamen trifft.
 *
 * Leer trifft alles. `Bash|Write` sind Alternativen. Ein Ausdruck mit
 * Regex-Zeichen wird als solcher versucht; scheitert er, gilt Wortgleichheit.
 *
 * @param matcher - der Matcher
 * @param name - der Werkzeugname
 * @returns ob er trifft
 */
export function matchesTool(matcher: string, name: string): boolean {
  const value = matcher.trim()
  if (value === '' || value === '*') return true
  if (value.includes('|')) return value.split('|').some((part) => matchesTool(part, name))
  if (value === name) return true
  try {
    return new RegExp(`^(?:${value})$`).test(name)
  } catch {
    return false
  }
}

/**
 * Führt die Pre-Hooks aus. Der erste Block gewinnt.
 *
 * @param input - der Werkzeugaufruf
 * @param sets - die Hook-Sätze
 * @param cwd - Projektverzeichnis
 * @returns die Entscheidung
 */
export async function runPreToolHooks(
  input: HookInput,
  sets: readonly HookSet[],
  cwd: string,
): Promise<PreHookDecision> {
  for (const set of sets) {
    for (const group of set.pre) {
      if (!matchesTool(group.matcher, input.tool_name)) continue
      for (const command of group.commands) {
        const result = await execute(command, input, set.root, cwd)
        if (result.block) return { block: true, reason: result.reason ?? `Blockiert durch ${set.plugin}` }
      }
    }
  }
  return { block: false }
}

/**
 * Führt die Post-Hooks aus und sammelt Block-Rückmeldungen.
 *
 * @param input - der Werkzeugaufruf
 * @param sets - die Hook-Sätze
 * @param cwd - Projektverzeichnis
 * @returns Rückmeldungen
 */
export async function runPostToolHooks(
  input: HookInput,
  sets: readonly HookSet[],
  cwd: string,
): Promise<readonly string[]> {
  const feedback: string[] = []
  for (const set of sets) {
    for (const group of set.post) {
      if (!matchesTool(group.matcher, input.tool_name)) continue
      for (const command of group.commands) {
        const result = await execute(command, input, set.root, cwd)
        if (result.block && result.reason !== undefined) feedback.push(result.reason)
      }
    }
  }
  return feedback
}

interface CommandResult {
  readonly block: boolean
  readonly reason?: string
}

/**
 * Die Umgebung, die ein Hook sieht.
 *
 * **Nicht `...process.env`.** Der Host trägt `DATABASE_URL`, `PMH_MASTER_KEY` und
 * Anbieterschlüssel. Ein Hook ist fremder Code; gäbe man ihm die volle Umgebung,
 * könnte er jede Zeile in `user_secrets` entschlüsseln. Er bekommt nur, was ein
 * Shell-Befehl zum Starten braucht, plus die drei `CLAUDE_*`-Variablen.
 *
 * @param pluginRoot - Plugin-Wurzel
 * @param cwd - Projektverzeichnis
 * @param toolName - Werkzeugname
 * @returns die gefilterte Umgebung
 */
export function hookEnvironment(pluginRoot: string, cwd: string, toolName: string): NodeJS.ProcessEnv {
  const allowed = [
    'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP',
    'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'HOME',
    'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA', 'NUMBER_OF_PROCESSORS',
    'OS', 'PROCESSOR_ARCHITECTURE', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'no_proxy',
  ]
  const env: NodeJS.ProcessEnv = {}
  for (const name of allowed) {
    const value = process.env[name]
    if (value !== undefined) env[name] = value
  }
  env.CLAUDE_PLUGIN_ROOT = pluginRoot
  env.CLAUDE_PROJECT_DIR = cwd
  env.CLAUDE_TOOL_NAME = toolName
  return env
}

async function execute(
  hook: HookCommand,
  input: HookInput,
  pluginRoot: string,
  cwd: string,
): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (result: CommandResult): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      resolve(result)
    }
    const child = spawn(hook.command, {
      cwd,
      env: hookEnvironment(pluginRoot, cwd, input.tool_name),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
    })
    timer = setTimeout(() => {
      child.kill()
      finish({ block: true, reason: `Hook überschritt ${hook.timeoutMs} ms` })
    }, hook.timeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < 1_000_000) stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 1_000_000) stderr += chunk.toString('utf8')
    })
    child.on('error', () => finish({ block: false }))
    child.on('close', (code) => {
      if (code === 2) {
        finish({ block: true, reason: stderr.trim() === '' ? 'Hook-Exit 2' : stderr.trim() })
        return
      }
      const parsed = parseDecision(stdout)
      finish(parsed ?? { block: false })
    })
    child.stdin?.end(`${JSON.stringify(input)}\n`)
  })
}

function parseDecision(stdout: string): CommandResult | undefined {
  const text = stdout.trim()
  if (text === '') return undefined
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data !== 'object' || data === null) return undefined
    const record = data as Record<string, unknown>
    const specific = record['hookSpecificOutput']
    if (typeof specific === 'object' && specific !== null) {
      const output = specific as Record<string, unknown>
      if (output['permissionDecision'] === 'deny') {
        const reason = output['permissionDecisionReason']
        return { block: true, reason: typeof reason === 'string' ? reason : 'Hook hat abgelehnt' }
      }
    }
    if (record['decision'] === 'block') {
      const reason = record['reason']
      return { block: true, reason: typeof reason === 'string' ? reason : 'Hook hat blockiert' }
    }
    return undefined
  } catch {
    return undefined
  }
}

async function pluginRoot(home: string, id: string): Promise<string | undefined> {
  const state = await readJson(join(home, 'marketplaces', 'state.json'))
  const plugins = state?.['plugins']
  if (typeof plugins === 'object' && plugins !== null) {
    const record = (plugins as Record<string, unknown>)[id]
    if (typeof record === 'object' && record !== null) {
      const path = (record as Record<string, unknown>)['path']
      if (typeof path === 'string') return join(home, path)
    }
  }
  const [name, marketplace] = id.split('@')
  if (name === undefined || marketplace === undefined) return undefined
  return join(home, 'plugins', marketplace, name)
}

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const data: unknown = JSON.parse(await readFile(path, { encoding: 'utf8' }))
    return typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** Nur für Prüfungen: listet Plugin-Verzeichnisse, ohne Zustand zu lesen. */
export async function listPluginDirectories(home: string): Promise<string[]> {
  const root = join(home, 'plugins')
  const result: string[] = []
  for (const marketplace of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!marketplace.isDirectory()) continue
    for (const plugin of await readdir(join(root, marketplace.name), { withFileTypes: true }).catch(() => [])) {
      if (plugin.isDirectory()) result.push(join(root, marketplace.name, plugin.name))
    }
  }
  return result
}
