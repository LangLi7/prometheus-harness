/**
 * `apps/cli/src/commands` — die Verwaltungskommandos.
 *
 * **Warum diese Kommandos vor dem Boot laufen.** Ein Marketplace-Befehl braucht
 * keinen Agenten, keinen Webserver und kein Profil. Ihn durch den Boot zu
 * schicken hieße, einen Baum zu starten, um eine Datei zu kopieren. Die
 * Erkennung steht deshalb **vor** `main()`; `pmh web` bleibt unverändert.
 *
 * **Die Form ist die von Claude Code.** `plugin marketplace add`, `plugin install`,
 * `plugin list`, `plugin uninstall` — wer das eine kennt, findet das andere. Die
 * Befehle, die Claude Code nicht hat (`skill install`, `skill scan`, `mcp add`),
 * folgen derselben Grammatik.
 *
 * @module @prometheus-harness/cli/commands
 */

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { resolveAgentsHome, resolvePmhHome } from '@prometheus-harness/home-paths'
import { readEnabled, writeEnabled } from '@prometheus-harness/plugin-hooks'

import {
  adaptInstalledPlugin,
  addMarketplace,
  applyMcpServers,
  installPlugin,
  installSkills,
  listMarketplaces,
  listMcpServers,
  listPlugins,
  listSkills,
  parseSourceSpec,
  removeMarketplace,
  removeMcpServer,
  removePlugin,
  scanPath,
  type McpServerSpec,
} from '@prometheus-harness/skill-marketplace'
import {
  baselineFrom,
  formatReport,
  gate,
  parseBaseline,
  serializeBaseline,
  type OutputFormat,
} from '@prometheus-harness/skillspector'

/** Was ein Befehl zurückgibt. */
interface CommandOutcome {
  readonly code: number
}

/** Ein zerlegter Aufruf. */
interface Parsed {
  readonly positionals: readonly string[]
  readonly flags: Readonly<Record<string, string | true>>
  /** Alles nach einem nackten `--`. */
  readonly rest: readonly string[]
}

/**
 * Erkennt und führt ein Verwaltungskommando aus.
 *
 * @param argv - `process.argv` ohne die ersten beiden Einträge
 * @returns `true`, wenn das Argument ein verwaltetes Kommando war
 */
export async function maybeRunCommand(argv: readonly string[]): Promise<boolean> {
  const first = argv[0]
  if (first !== 'plugin' && first !== 'marketplace' && first !== 'skill' && first !== 'mcp') return false
  try {
    const outcome = await dispatch(first, argv.slice(1))
    process.exitCode = outcome.code
  } catch (error) {
    process.stderr.write(`pmh: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
  return true
}

async function dispatch(group: string, argv: readonly string[]): Promise<CommandOutcome> {
  if (group === 'marketplace') return marketplaceCommand(argv)
  if (group === 'plugin') {
    const [sub, ...rest] = argv
    if (sub === 'marketplace') return marketplaceCommand(rest)
    if (sub === 'install') return pluginInstall(rest)
    if (sub === 'adapt') return pluginAdapt(rest)
    if (sub === 'hooks') return pluginHooks(rest)
    if (sub === 'list' || sub === undefined) return pluginList()
    if (sub === 'uninstall' || sub === 'remove') return pluginUninstall(rest)
    throw new Error(`unbekannt: pmh plugin ${sub}`)
  }
  if (group === 'skill') {
    const [sub, ...rest] = argv
    if (sub === 'install' || sub === 'add') return skillInstall(rest)
    if (sub === 'list' || sub === undefined) return skillList()
    if (sub === 'scan') return skillScan(rest)
    throw new Error(`unbekannt: pmh skill ${sub}`)
  }
  const [sub, ...rest] = argv
  if (sub === 'add') return mcpAdd(rest)
  if (sub === 'list' || sub === undefined) return mcpList()
  if (sub === 'remove' || sub === 'rm') return mcpRemove(rest)
  throw new Error(`unbekannt: pmh mcp ${sub}`)
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

async function marketplaceCommand(argv: readonly string[]): Promise<CommandOutcome> {
  const [sub, ...rest] = argv
  if (sub === 'add') {
    const parsed = parse(rest)
    const source = parsed.positionals[0]
    if (source === undefined) throw new Error('pmh plugin marketplace add <quelle> [--name <name>]')
    const name = typeof parsed.flags['name'] === 'string' ? parsed.flags['name'] : undefined
    const result = await addMarketplace(source, {
      ...(name === undefined ? {} : { name }),
      log: (message) => { process.stderr.write(`pmh: ${message}\n`) },
    })
    process.stdout.write(
      `Marketplace "${result.record.name}" hinzugefügt (${result.marketplace.plugins.length} Plugins, ${result.path}).\n`,
    )
    for (const warning of result.marketplace.warnings) process.stderr.write(`pmh: Warnung: ${warning}\n`)
    return { code: 0 }
  }
  if (sub === 'list' || sub === undefined) {
    const entries = await listMarketplaces()
    if (entries.length === 0) {
      process.stdout.write('Keine Marketplaces eingetragen.\n')
      return { code: 0 }
    }
    for (const entry of entries) {
      process.stdout.write(`${entry.name}\t${entry.pluginCount} Plugins\t${entry.source}\n`)
    }
    return { code: 0 }
  }
  if (sub === 'remove' || sub === 'rm') {
    const name = parse(rest).positionals[0]
    if (name === undefined) throw new Error('pmh plugin marketplace remove <name>')
    const removed = await removeMarketplace(name)
    process.stdout.write(`Marketplace "${name}" entfernt${removed.length === 0 ? '' : ` (${removed.length} Plugins)`}.\n`)
    return { code: 0 }
  }
  throw new Error(`unbekannt: pmh plugin marketplace ${sub}`)
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

async function pluginInstall(argv: readonly string[]): Promise<CommandOutcome> {
  const parsed = parse(argv)
  const id = parsed.positionals[0]
  if (id === undefined) throw new Error('pmh plugin install <name>@<marketplace> [--force] [--mcp]')
  const result = await installPlugin(id, {
    force: parsed.flags['force'] === true,
    strict: parsed.flags['strict'] === true,
    adapter: parsed.flags['no-adapter'] !== true,
    applyMcp: parsed.flags['mcp'] === true,
    ...(typeof parsed.flags['home'] === 'string' ? { home: parsed.flags['home'] } : {}),
    ...(typeof parsed.flags['profile'] === 'string' ? { profile: parsed.flags['profile'] } : {}),
    log: (message) => { process.stderr.write(`pmh: ${message}\n`) },
  })
  const plugin = result.plugin
  process.stdout.write(
    `Plugin "${id}" installiert (${result.scan.score}/100 ${result.scan.severity}, ${result.scan.recommendation}).\n`,
  )
  for (const skill of result.skills) process.stdout.write(`  Skill: ${skill.name}\n`)
  for (const warning of result.warnings) process.stderr.write(`pmh: Warnung: ${warning}\n`)
  if (plugin === undefined) return { code: 1 }
  return { code: 0 }
}

async function pluginAdapt(argv: readonly string[]): Promise<CommandOutcome> {
  const parsed = parse(argv)
  const all = parsed.flags['all'] === true
  const entries = await listPlugins()
  const targets = all ? entries : entries.filter((entry) => entry.id === parsed.positionals[0])
  if (!all && targets.length === 0) {
    throw new Error('pmh plugin adapt <name>@<marketplace> | --all')
  }
  let total = 0
  let commands = 0
  let agents = 0
  for (const entry of targets) {
    const result = await adaptInstalledPlugin(entry.id)
    total += result.skills.length
    commands += result.result.adapted.filter((item) => item.kind === 'command').length
    agents += result.result.adapted.filter((item) => item.kind === 'agent').length
    if (result.skills.length > 0) {
      process.stdout.write(`${entry.id}: ${result.skills.length} Skills\n`)
      for (const skill of result.skills) process.stdout.write(`  ${skill.name}\n`)
    }
    for (const warning of result.result.warnings) process.stderr.write(`pmh: ${warning}\n`)
    for (const skipped of result.result.skipped) {
      process.stderr.write(`pmh: übersprungen: ${skipped.path} (${skipped.reason})\n`)
    }
  }
  process.stdout.write(`Übersetzt: ${commands} Commands, ${agents} Agents, ${total} Skills.\n`)
  return { code: 0 }
}

async function pluginHooks(argv: readonly string[]): Promise<CommandOutcome> {
  const parsed = parse(argv)
  const action = parsed.positionals[0] ?? 'list'
  const id = parsed.positionals[1]
  const enabled = (await readEnabled()).enabled
  if (action === 'list') {
    if (enabled.length === 0) {
      process.stdout.write('Keine Hook-Freigaben. Aktivieren mit: pmh plugin hooks enable <id>\n')
      return { code: 0 }
    }
    for (const entry of enabled) process.stdout.write(`${entry}\n`)
    return { code: 0 }
  }
  if (action !== 'enable' && action !== 'disable') {
    throw new Error('pmh plugin hooks enable|disable|list [<name>@<marketplace>]')
  }
  if (id === undefined) throw new Error('pmh plugin hooks enable|disable <name>@<marketplace>')
  const installed = (await listPlugins()).some((entry) => entry.id === id)
  if (!installed) throw new Error(`Plugin "${id}" ist nicht installiert.`)
  if (action === 'enable') {
    if (enabled.includes(id)) {
      process.stdout.write(`"${id}" ist bereits freigegeben.\n`)
      return { code: 0 }
    }
    await writeEnabled([...enabled, id])
    process.stderr.write(
      `pmh: "${id}" darf jetzt Hooks ausführen — fremder Code bei jedem Werkzeugaufruf.\n`
      + 'pmh: Wirksam nach einem Neustart des Hosts.\n',
    )
    process.stdout.write(`Hook-Freigabe für "${id}" gesetzt.\n`)
    return { code: 0 }
  }
  await writeEnabled(enabled.filter((entry) => entry !== id))
  process.stdout.write(`Hook-Freigabe für "${id}" entfernt (wirksam nach Neustart).\n`)
  return { code: 0 }
}

async function pluginList(): Promise<CommandOutcome> {  const entries = await listPlugins()
  if (entries.length === 0) {
    process.stdout.write('Keine Plugins installiert.\n')
    return { code: 0 }
  }
  for (const entry of entries) {
    const action = entry.scan.action ?? (entry.scan.recommendation === 'SAFE' ? 'allow' : 'warn')
    process.stdout.write(
      `${entry.id}\t${entry.scan.score}/100 ${entry.scan.severity} ${action.toUpperCase()}`
      + `${entry.scan.recommendation === 'DO_NOT_INSTALL' && action !== 'block' ? ' (Empfehlung: DO_NOT_INSTALL)' : ''}`
      + `\t${entry.skills.join(', ') || '-'}\n`,
    )
  }
  return { code: 0 }
}

async function pluginUninstall(argv: readonly string[]): Promise<CommandOutcome> {
  const id = parse(argv).positionals[0]
  if (id === undefined) throw new Error('pmh plugin uninstall <name>@<marketplace>')
  await removePlugin(id)
  process.stdout.write(`Plugin "${id}" entfernt.\n`)
  return { code: 0 }
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

async function skillInstall(argv: readonly string[]): Promise<CommandOutcome> {
  const parsed = parse(argv)
  const source = parsed.positionals[0]
  if (source === undefined) throw new Error('pmh skill install <owner/repo | pfad> [--global] [--force]')
  const global = parsed.flags['global'] === true
  const skillsRoot = global
    ? join(resolveAgentsHome(), 'skills')
    : join(projectRoot(), '.agents', 'skills')
  // Ein `owner/repo`, das es lokal nicht gibt, ist eine Netzquelle; ein lokaler
  // Pfad wird von `parseSourceSpec` erkannt und bleibt lokal.
  const result = await installSkills(source, {
    skillsRoot,
    force: parsed.flags['force'] === true,
    strict: parsed.flags['strict'] === true,
    ...(typeof parsed.flags['prefix'] === 'string' ? { prefix: parsed.flags['prefix'] } : {}),
    ...(typeof parsed.flags['home'] === 'string' ? { home: parsed.flags['home'] } : {}),
    log: (message) => { process.stderr.write(`pmh: ${message}\n`) },
  })
  for (const skill of result.skills) process.stdout.write(`Skill "${skill.name}" -> ${join(skillsRoot, skill.name)}\n`)
  for (const warning of result.warnings) process.stderr.write(`pmh: Warnung: ${warning}\n`)
  return { code: result.skills.length === 0 ? 1 : 0 }
}

async function skillList(): Promise<CommandOutcome> {
  const entries = await listSkills()
  if (entries.length === 0) {
    process.stdout.write('Keine über pmh installierten Skills.\n')
    return { code: 0 }
  }
  for (const entry of entries) {
    process.stdout.write(`${entry.name}\t${entry.source}${entry.plugin === undefined ? '' : `\t<- ${entry.plugin}`}\n`)
  }
  return { code: 0 }
}

async function skillScan(argv: readonly string[]): Promise<CommandOutcome> {
  const parsed = parse(argv)
  const target = parsed.positionals[0]
  if (target === undefined) throw new Error('pmh skill scan <pfad> [--format terminal|json|markdown|sarif]')
  const format = typeof parsed.flags['format'] === 'string' ? parsed.flags['format'] : 'terminal'
  if (format !== 'terminal' && format !== 'json' && format !== 'markdown' && format !== 'sarif') {
    throw new Error(`unbekanntes Format "${format}"`)
  }
  const baselinePath = typeof parsed.flags['baseline'] === 'string' ? parsed.flags['baseline'] : undefined
  const baseline = baselinePath === undefined ? undefined : parseBaseline(await readFile(resolve(baselinePath), 'utf8'))
  const scanOptions = baseline === undefined || baselinePath === undefined
    ? {}
    : { baseline, baselineLabel: baselinePath }
  const report = await scanPath(resolve(target), scanOptions)
  process.stdout.write(formatReport(report, format as OutputFormat))

  const writeBaseline = typeof parsed.flags['write-baseline'] === 'string' ? parsed.flags['write-baseline'] : undefined
  if (writeBaseline !== undefined) {
    const path = resolve(writeBaseline)
    await writeFile(path, serializeBaseline(baselineFrom(report)), { encoding: 'utf8' })
    process.stderr.write(`pmh: Baseline mit ${report.issues.length} Befunden geschrieben: ${path}\n`)
  }

  const decision = gate(report)
  const failOn = typeof parsed.flags['fail-on'] === 'string' ? parsed.flags['fail-on'] : 'block'
  const failed = failOn === 'warn' ? decision.action !== 'allow' : decision.action === 'block'
  return { code: failed ? 1 : 0 }
}

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

async function mcpAdd(argv: readonly string[]): Promise<CommandOutcome> {
  const parsed = parse(argv)
  const separator = argv.indexOf('--')
  const name = parsed.positionals[0]
  if (name === undefined) {
    throw new Error('pmh mcp add <name> --url <url> [--header "Name: Wert"] [--optional] | -- <befehl> [argumente…]')
  }
  const url = typeof parsed.flags['url'] === 'string' ? parsed.flags['url'] : undefined
  const headers = collectHeaders(parsed.flags)
  const optional = parsed.flags['optional'] === true
  const command = separator >= 0 ? argv.slice(separator + 1) : []
  let server: McpServerSpec
  if (url !== undefined) {
    server = {
      name,
      transport: 'streamable-http',
      url,
      ...(Object.keys(headers).length === 0 ? {} : { headers }),
      ...(optional ? { optional } : {}),
    }
  } else if (command.length > 0) {
    const [binary, ...args] = command
    if (binary === undefined) throw new Error('hinter "--" fehlt der Befehl')
    server = { name, transport: 'stdio', command: binary, args, ...(optional ? { optional } : {}) }
  } else {
    throw new Error('entweder --url <url> oder -- <befehl> angeben')
  }
  const result = await applyMcpServers([server], {
    ...(typeof parsed.flags['home'] === 'string' ? { home: parsed.flags['home'] } : {}),
    ...(typeof parsed.flags['profile'] === 'string' ? { profile: parsed.flags['profile'] } : {}),
  })
  const action = result.added.length > 0 ? 'eingetragen' : 'aktualisiert'
  process.stdout.write(`MCP-Server "${name}" ${action} in ${result.path}.\n`)
  if (server.warnings !== undefined) for (const warning of server.warnings) process.stderr.write(`pmh: Warnung: ${warning}\n`)
  return { code: 0 }
}

async function mcpList(): Promise<CommandOutcome> {
  const servers = await listMcpServers()
  if (servers.length === 0) {
    process.stdout.write('Keine MCP-Server im Profil eingetragen.\n')
    return { code: 0 }
  }
  for (const server of servers) {
    process.stdout.write(`${server.serverName ?? server.id}\t${server.transport ?? '?'}\t${server.id}\n`)
  }
  return { code: 0 }
}

async function mcpRemove(argv: readonly string[]): Promise<CommandOutcome> {
  const name = parse(argv).positionals[0]
  if (name === undefined) throw new Error('pmh mcp remove <name>')
  const removed = await removeMcpServer(name)
  process.stdout.write(removed ? `MCP-Server "${name}" entfernt.\n` : `MCP-Server "${name}" war nicht eingetragen.\n`)
  return { code: removed ? 0 : 1 }
}

// ---------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------

/**
 * Zerlegt `--flag`, `--flag=wert` und nackte Wörter.
 *
 * @param argv - die Argumente
 * @returns Positionen, Schalter und alles nach `--`
 */
export function parse(argv: readonly string[]): Parsed {
  const positionals: string[] = []
  const flags: Record<string, string | true> = {}
  const rest: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) continue
    if (arg === '--') {
      rest.push(...argv.slice(index + 1))
      break
    }
    if (arg.startsWith('--')) {
      const equals = arg.indexOf('=')
      if (equals > 0) {
        flags[arg.slice(2, equals)] = arg.slice(equals + 1)
        continue
      }
      const key = arg.slice(2)
      const next = argv[index + 1]
      if (next !== undefined && !next.startsWith('-') && !isBooleanFlag(key)) {
        flags[key] = next
        index += 1
      } else {
        flags[key] = true
      }
      continue
    }
    positionals.push(arg)
  }
  return { positionals, flags, rest }
}

function isBooleanFlag(key: string): boolean {
  return key === 'force' || key === 'global' || key === 'mcp' || key === 'project' || key === 'json'
    || key === 'strict' || key === 'optional' || key === 'all' || key === 'no-adapter'
}

function collectHeaders(flags: Readonly<Record<string, string | true>>): Record<string, string> {
  const raw = flags['header']
  if (raw === undefined || raw === true) return {}
  const result: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const colon = part.indexOf(':')
    if (colon <= 0) continue
    result[part.slice(0, colon).trim()] = part.slice(colon + 1).trim()
  }
  return result
}

/** Die Projektwurzel: das nächste Verzeichnis mit `.git`, sonst das Arbeitsverzeichnis. */
function projectRoot(): string {
  // Kein `git`-Aufruf: der Installer soll ohne git funktionieren.
  let current = process.cwd()
  while (true) {
    if (existsSync(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return process.cwd()
    current = parent
  }
}

/** Nur für Prüfungen sichtbar. */
export const internals = { parse, resolvePmhHome, parseSourceSpec }
