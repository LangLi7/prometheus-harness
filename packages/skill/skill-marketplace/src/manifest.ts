/**
 * `@prometheus-harness/skill-marketplace/manifest` — fremde Manifeste lesen.
 *
 * **Warum hier fast nichts erfunden wird.** `marketplace.json` und `plugin.json`
 * gehören Claude Code. Wer ihre Felder umbenennt, ist nicht kompatibel. Gelesen
 * wird deshalb genau die veröffentlichte Form; unbekannte Felder werden
 * **gemeldet, nicht verworfen** — sie können in einer neueren Fassung Bedeutung
 * haben.
 *
 * **Warum die Erkennung der Bestandteile tolerant ist.** Ein Plugin ohne Manifest
 * ist gültig: Claude Code lädt dann die Standardordner. Diese Datei sucht
 * dieselben Ordner und meldet, was sie findet, statt Vollständigkeit zu behaupten.
 *
 * @module @prometheus-harness/skill-marketplace/manifest
 */

import { access, readFile, readdir } from 'node:fs/promises'
import { basename, join, posix } from 'node:path'

import { parse as parseYaml } from 'yaml'

import {
  MarketplaceError,
  type Marketplace,
  type MarketplaceEntry,
  type McpServerSpec,
  type PluginComponents,
  type PluginManifest,
  type PluginSkill,
  type PluginSource,
} from './types.ts'

/** Die Standardordner eines Plugins. */
const DEFAULT_DIRS = {
  skills: 'skills',
  commands: 'commands',
  agents: 'agents',
  hooks: 'hooks',
  mcp: '.mcp.json',
  lsp: '.lsp.json',
} as const

/**
 * Liest und prüft eine `marketplace.json`.
 *
 * @param text - Dateiinhalt
 * @returns der Marketplace
 * @throws MarketplaceError bei fehlenden Pflichtfeldern
 */
export function parseMarketplaceJson(text: string): Marketplace {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new MarketplaceError(`marketplace.json ist kein gültiges JSON: ${messageOf(error)}`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new MarketplaceError('marketplace.json muss ein Objekt sein')
  }
  const record = data as Record<string, unknown>
  const name = nonEmpty(record['name'])
  if (name === undefined) throw new MarketplaceError('marketplace.json braucht ein nicht-leeres "name"')

  const warnings: string[] = []
  const rawPlugins = record['plugins']
  if (!Array.isArray(rawPlugins)) throw new MarketplaceError('marketplace.json braucht ein "plugins"-Array')

  const plugins: MarketplaceEntry[] = []
  const seen = new Set<string>()
  for (const raw of rawPlugins) {
    if (typeof raw !== 'object' || raw === null) {
      warnings.push('Ein Eintrag in "plugins" ist kein Objekt und wurde übersprungen.')
      continue
    }
    const entry = raw as Record<string, unknown>
    const pluginName = nonEmpty(entry['name'])
    if (pluginName === undefined) {
      warnings.push('Ein Plugin-Eintrag ohne "name" wurde übersprungen.')
      continue
    }
    if (seen.has(pluginName)) {
      warnings.push(`Plugin "${pluginName}" ist doppelt eingetragen; der erste Eintrag gilt.`)
      continue
    }
    seen.add(pluginName)
    let source: PluginSource
    try {
      source = parseSource(entry['source'])
    } catch (error) {
      warnings.push(`Plugin "${pluginName}": ${messageOf(error)}`)
      continue
    }
    plugins.push({
      name: pluginName,
      source,
      ...stringField('description', entry['description']),
      ...stringField('version', entry['version']),
      ...(typeof entry['strict'] === 'boolean' ? { strict: entry['strict'] } : {}),
    })
  }

  const owner = parseOwner(record['owner'])
  return {
    name,
    ...stringField('description', record['description']),
    ...(owner === undefined ? {} : { owner }),
    plugins,
    warnings,
  }
}

/**
 * Übersetzt das `source`-Feld eines Plugin-Eintrags.
 *
 * @param value - Rohwert aus JSON
 * @returns die Quelle
 * @throws MarketplaceError bei unbekannter Form
 */
export function parseSource(value: unknown): PluginSource {
  if (typeof value === 'string') {
    if (value.trim() === '') throw new MarketplaceError('"source" ist leer')
    if (value.includes('..')) throw new MarketplaceError(`"source" enthält "..": ${value}`)
    return { kind: 'path', path: value }
  }
  if (typeof value !== 'object' || value === null) throw new MarketplaceError('"source" fehlt')
  const record = value as Record<string, unknown>
  const kind = record['source']
  switch (kind) {
    case 'github': {
      const repo = nonEmpty(record['repo'])
      if (repo === undefined) throw new MarketplaceError('github-Quelle braucht "repo"')
      return { kind: 'github', repo, ...refOf(record) }
    }
    case 'git-subdir': {
      const url = nonEmpty(record['url'])
      const path = nonEmpty(record['path'])
      if (url === undefined || path === undefined) throw new MarketplaceError('git-subdir braucht "url" und "path"')
      return { kind: 'git-subdir', url, path, ...refOf(record) }
    }
    case 'url': {
      const url = nonEmpty(record['url'])
      if (url === undefined) throw new MarketplaceError('url-Quelle braucht "url"')
      return { kind: 'url', url, ...refOf(record) }
    }
    case 'archive': {
      const url = nonEmpty(record['url'])
      if (url === undefined) throw new MarketplaceError('archive-Quelle braucht "url"')
      return { kind: 'archive', url }
    }
    case 'npm': {
      const pkg = nonEmpty(record['package'])
      if (pkg === undefined) throw new MarketplaceError('npm-Quelle braucht "package"')
      return {
        kind: 'npm',
        package: pkg,
        ...stringField('version', record['version']),
      }
    }
    case 'command': {
      const command = nonEmpty(record['command'])
      if (command === undefined) throw new MarketplaceError('command-Quelle braucht "command"')
      return { kind: 'command', command }
    }
    default:
      throw new MarketplaceError(`unbekannte Quelle "${String(kind)}"`)
  }
}

/**
 * Liest ein `plugin.json`.
 *
 * @param text - Dateiinhalt
 * @returns das Manifest
 * @throws MarketplaceError, wenn kein Name vorhanden ist
 */
export function parsePluginManifest(text: string): PluginManifest {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new MarketplaceError(`plugin.json ist kein gültiges JSON: ${messageOf(error)}`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new MarketplaceError('plugin.json muss ein Objekt sein')
  }
  const record = data as Record<string, unknown>
  const name = nonEmpty(record['name'])
  if (name === undefined) throw new MarketplaceError('plugin.json braucht ein nicht-leeres "name"')

  const warnings: string[] = []
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) warnings.push(`Plugin-Name "${name}" ist nicht kebab-case.`)
  if (record['version'] === undefined) warnings.push('plugin.json hat keine "version".')
  if (record['description'] === undefined) warnings.push('plugin.json hat keine "description".')
  if (record['author'] === undefined) warnings.push('plugin.json hat keinen "author".')

  const author = parseOwner(record['author'])
  return {
    name,
    ...stringField('displayName', record['displayName']),
    ...stringField('version', record['version']),
    ...stringField('description', record['description']),
    ...(author === undefined ? {} : { author }),
    ...stringField('homepage', record['homepage']),
    ...stringField('repository', record['repository']),
    ...stringField('license', record['license']),
    ...(Array.isArray(record['keywords']) ? { keywords: record['keywords'].filter(isString) } : {}),
    ...(typeof record['defaultEnabled'] === 'boolean' ? { defaultEnabled: record['defaultEnabled'] } : {}),
    ...(Array.isArray(record['dependencies']) ? { dependencies: record['dependencies'] } : {}),
    ...(record['skills'] === undefined ? {} : { skills: pathField(record['skills']) }),
    ...(record['commands'] === undefined ? {} : { commands: record['commands'] }),
    ...(record['agents'] === undefined ? {} : { agents: pathField(record['agents']) }),
    ...(record['hooks'] === undefined ? {} : { hooks: record['hooks'] }),
    ...(record['mcpServers'] === undefined ? {} : { mcpServers: record['mcpServers'] }),
    ...(record['lspServers'] === undefined ? {} : { lspServers: record['lspServers'] }),
    ...(typeof record['userConfig'] === 'object' && record['userConfig'] !== null
      ? { userConfig: record['userConfig'] as Record<string, unknown> }
      : {}),
    warnings,
  }
}

/**
 * Liest einen Marketplace von der Platte.
 *
 * @param root - Verzeichnis, das `.claude-plugin/marketplace.json` enthält
 * @returns der Marketplace
 */
export async function readMarketplace(root: string): Promise<Marketplace> {
  const path = join(root, '.claude-plugin', 'marketplace.json')
  let text: string
  try {
    text = await readFile(path, { encoding: 'utf8' })
  } catch {
    throw new MarketplaceError(`kein Marketplace: ${path} fehlt`)
  }
  return parseMarketplaceJson(text)
}

/**
 * Liest das Manifest eines Plugin-Verzeichnisses, falls vorhanden.
 *
 * @param root - Plugin-Wurzel
 * @returns das Manifest oder `undefined`
 */
export async function readPluginManifest(root: string): Promise<PluginManifest | undefined> {
  const path = join(root, '.claude-plugin', 'plugin.json')
  try {
    return parsePluginManifest(await readFile(path, { encoding: 'utf8' }))
  } catch (error) {
    if (error instanceof MarketplaceError && error.message.includes('kein gültiges JSON')) throw error
    return undefined
  }
}

/**
 * Ermittelt die Bestandteile eines Plugin-Verzeichnisses.
 *
 * @param root - Plugin-Wurzel
 * @param manifest - bereits gelesenes Manifest
 * @returns Bestandteile und Warnungen
 */
export async function discoverPlugin(
  root: string,
  manifest?: PluginManifest,
): Promise<PluginComponents> {
  const warnings: string[] = []
  const skills: PluginSkill[] = []
  const commands: string[] = []
  const agents: string[] = []
  const hooks: string[] = []
  const mcpServers: McpServerSpec[] = []
  const lsp: string[] = []

  const addSkill = async (path: string, fallbackName: string): Promise<void> => {
    const skillPath = posix.join(path, 'SKILL.md')
    const absolute = join(root, skillPath)
    if (!(await exists(absolute))) return
    if (skills.some((skill) => skill.path === skillPath)) return
    const name = (await readSkillName(absolute)) ?? fallbackName
    skills.push({ name, path: skillPath })
  }

  const scanSkillDir = async (directory: string): Promise<void> => {
    const absolute = join(root, directory)
    if (!(await exists(absolute))) return
    if (await exists(join(absolute, 'SKILL.md'))) {
      await addSkill(directory, basename(directory) || manifest?.name || 'skill')
      return
    }
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      await addSkill(posix.join(directory, entry.name), entry.name)
    }
  }

  // `skills` ergänzt den Standardordner, es ersetzt ihn nicht.
  const declaredSkills = manifest?.skills
  if (declaredSkills !== undefined) {
    for (const raw of toArray(declaredSkills)) {
      if (typeof raw !== 'string') continue
      if (raw === '.' || raw === './') {
        await addSkill('.', manifest?.name ?? 'skill')
        continue
      }
      await scanSkillDir(normalizeRelative(raw))
    }
  }
  await scanSkillDir(DEFAULT_DIRS.skills)

  // Ein Plugin mit SKILL.md an der Wurzel, ohne skills/, ist ein einzelnes Skill.
  if (skills.length === 0 && (await exists(join(root, 'SKILL.md')))) {
    await addSkill('.', manifest?.name ?? basename(root))
  }

  // Kommandos
  const declaredCommands = manifest?.commands
  if (declaredCommands !== undefined) {
    for (const entry of commandPaths(declaredCommands)) {
      if (await exists(join(root, entry))) commands.push(entry)
      else warnings.push(`command-Pfad fehlt: ${entry}`)
    }
  } else {
    commands.push(...(await readdirIfPresent(join(root, DEFAULT_DIRS.commands), '.md')))
  }

  // Agenten
  const declaredAgents = manifest?.agents
  if (declaredAgents !== undefined) {
    for (const raw of toArray(declaredAgents)) {
      if (typeof raw === 'string') agents.push(normalizeRelative(raw))
    }
  } else {
    agents.push(...(await readdirIfPresent(join(root, DEFAULT_DIRS.agents), '.md')))
  }

  // Hooks: Standarddatei plus Manifestangabe.
  if (await exists(join(root, DEFAULT_DIRS.hooks, 'hooks.json'))) hooks.push('hooks/hooks.json')
  if (typeof manifest?.hooks === 'string') hooks.push(normalizeRelative(manifest.hooks))
  else if (Array.isArray(manifest?.hooks)) {
    for (const entry of manifest.hooks) if (typeof entry === 'string') hooks.push(normalizeRelative(entry))
  }

  // MCP: `.mcp.json` zuerst, dann Manifest (später gewinnt).
  const mcpPath = join(root, DEFAULT_DIRS.mcp)
  if (await exists(mcpPath)) {
    try {
      mcpServers.push(...parseMcpConfig(await readFile(mcpPath, { encoding: 'utf8' }), 'json'))
    } catch (error) {
      warnings.push(`.mcp.json nicht lesbar: ${messageOf(error)}`)
    }
  }
  if (manifest?.mcpServers !== undefined) {
    mcpServers.push(...(await mcpFromManifest(root, manifest.mcpServers, warnings)))
  }
  if (await exists(join(root, DEFAULT_DIRS.lsp))) lsp.push(DEFAULT_DIRS.lsp)
  if (await exists(join(root, 'CLAUDE.md'))) {
    warnings.push('CLAUDE.md wird von Claude Code nicht als Kontext geladen; nutze ein Skill.')
  }

  return {
    skills,
    commands: dedupe(commands),
    agents: dedupe(agents),
    hooks: dedupe(hooks),
    mcpServers: dedupeServers(mcpServers),
    lsp: dedupe(lsp),
    warnings,
  }
}

/**
 * Übersetzt eine MCP-Konfiguration in Serverbeschreibungen.
 *
 * Unterstützt die Claude-Form (`mcpServers`), die Codex-Form (`mcp_servers`) und
 * TOML mit `[mcp_servers.<name>]`. Eine unbekannte Form ist ein Fehler, kein
 * stilles Leerergeben.
 *
 * @param text - Dateiinhalt
 * @param format - `json`, `toml` oder `auto`
 * @returns die Server
 */
export function parseMcpConfig(text: string, format: 'json' | 'toml' | 'auto' = 'auto'): McpServerSpec[] {
  const chosen = format === 'auto' ? (text.trimStart().startsWith('{') ? 'json' : 'toml') : format
  if (chosen === 'toml') {
    const parsed = parseTomlLite(text)
    const servers = (parsed['mcp_servers'] ?? parsed['mcpServers']) as unknown
    if (servers === undefined) throw new MarketplaceError('TOML enthält keine [mcp_servers.*]-Tabelle')
    return serversFromMap(servers)
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new MarketplaceError(`MCP-Konfiguration ist kein gültiges JSON: ${messageOf(error)}`)
  }
  if (typeof data !== 'object' || data === null) throw new MarketplaceError('MCP-Konfiguration muss ein Objekt sein')
  const record = data as Record<string, unknown>
  const servers = record['mcpServers'] ?? record['mcp_servers'] ?? record
  return serversFromMap(servers)
}

/**
 * Übersetzt eine Map von Serverkonfigurationen.
 *
 * @param value - Rohwert
 * @returns die Server
 */
export function serversFromMap(value: unknown): McpServerSpec[] {
  if (typeof value !== 'object' || value === null) return []
  const servers: McpServerSpec[] = []
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue
    const spec = serverFromConfig(name, raw as Record<string, unknown>)
    if (spec !== undefined) servers.push(spec)
  }
  return servers
}

/** Baut eine Serverbeschreibung aus einer Rohkonfiguration. */
function serverFromConfig(name: string, config: Record<string, unknown>): McpServerSpec | undefined {
  const url = nonEmpty(config['url']) ?? nonEmpty(config['serverUrl'])
  const command = nonEmpty(config['command'])
  const warnings: string[] = []
  if (url !== undefined) {
    const declaredType = nonEmpty(config['type']) ?? nonEmpty(config['transport'])
    if (declaredType === 'sse') warnings.push('SSE wird als Streamable HTTP eingetragen.')
    if (url.startsWith('http://') && !/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])/.test(url)) {
      warnings.push('Unverschlüsselter Endpunkt außerhalb von localhost.')
    }
    if (url.includes('${')) warnings.push('URL enthält einen Platzhalter, der beim Start ersetzt werden muss.')
    return {
      name,
      transport: 'streamable-http',
      url,
      ...(isRecord(config['headers']) ? { headers: stringMap(config['headers']) } : {}),
      ...(warnings.length === 0 ? {} : { warnings }),
    }
  }
  if (command !== undefined) {
    if (command.includes('${')) warnings.push('Befehl enthält einen Platzhalter, der beim Start ersetzt werden muss.')
    return {
      name,
      transport: 'stdio',
      command,
      args: Array.isArray(config['args']) ? config['args'].filter(isString) : [],
      ...(isRecord(config['env']) ? { env: stringMap(config['env']) } : {}),
      ...stringField('cwd', config['cwd']),
      ...(warnings.length === 0 ? {} : { warnings }),
    }
  }
  return undefined
}

async function mcpFromManifest(
  root: string,
  value: unknown,
  warnings: string[],
): Promise<McpServerSpec[]> {
  const result: McpServerSpec[] = []
  for (const entry of toArray(value)) {
    if (typeof entry === 'string') {
      const path = join(root, normalizeRelative(entry))
      if (!(await exists(path))) {
        warnings.push(`mcpServers-Datei fehlt: ${entry}`)
        continue
      }
      try {
        result.push(...parseMcpConfig(await readFile(path, { encoding: 'utf8' }), 'json'))
      } catch (error) {
        warnings.push(`mcpServers-Datei nicht lesbar: ${messageOf(error)}`)
      }
      continue
    }
    result.push(...serversFromMap(entry))
  }
  return result
}

/** Liest den Namen aus dem Frontmatter einer `SKILL.md`. */
async function readSkillName(path: string): Promise<string | undefined> {
  try {
    const text = await readFile(path, { encoding: 'utf8' })
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
    if (match === null) return undefined
    const data: unknown = parseYaml(match[1] ?? '')
    if (typeof data !== 'object' || data === null) return undefined
    return nonEmpty((data as Record<string, unknown>)['name'])
  } catch {
    return undefined
  }
}

/**
 * Ein sehr kleiner TOML-Leser für Codex-Konfigurationen.
 *
 * **Warum kein vollständiger TOML-Parser.** Gebraucht werden Tabellen
 * (`[mcp_servers.name]`), Zeichenketten, Arrays und Inline-Tabellen. Alles andere
 * (Datumsangaben, Mehrzeiler, Escapes jenseits von `\"`) wird nicht gebraucht und
 * bleibt ungelesen — ein halber Parser, der seine Grenze kennt, ist besser als ein
 * Paket für 40 Zeilen Anforderung.
 *
 * @param text - TOML-Text
 * @returns verschachtelte Objekte
 */
export function parseTomlLite(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  let current: Record<string, unknown> = root
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim()
    if (line === '') continue
    if (line.startsWith('[') && line.endsWith(']')) {
      const path = line.slice(1, -1).trim().split('.').map((part) => part.trim().replace(/^"|"$/g, ''))
      current = ensureTable(root, path)
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().replace(/^"|"$/g, '')
    const value = parseTomlValue(line.slice(eq + 1).trim())
    current[key] = value
  }
  return root
}

function ensureTable(root: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
  let current = root
  for (const part of path) {
    const next = current[part]
    if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
      current = next as Record<string, unknown>
    } else {
      const created: Record<string, unknown> = {}
      current[part] = created
      current = created
    }
  }
  return current
}

function stripComment(line: string): string {
  let inString = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"' && line[index - 1] !== '\\') inString = !inString
    if (char === '#' && !inString) return line.slice(0, index)
  }
  return line
}

function parseTomlValue(raw: string): unknown {
  if (raw.startsWith('"') && raw.endsWith('"')) return unescapeToml(raw.slice(1, -1))
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1)
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim()
    if (inner === '') return []
    return splitTopLevel(inner).map((part) => parseTomlValue(part.trim()))
  }
  if (raw.startsWith('{') && raw.endsWith('}')) {
    const inner = raw.slice(1, -1).trim()
    const table: Record<string, unknown> = {}
    if (inner === '') return table
    for (const pair of splitTopLevel(inner)) {
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      table[pair.slice(0, eq).trim().replace(/^"|"$/g, '')] = parseTomlValue(pair.slice(eq + 1).trim())
    }
    return table
  }
  if (raw === 'true') return true
  if (raw === 'false') return false
  const number = Number(raw)
  return Number.isNaN(number) ? raw : number
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inString = false
  let start = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"' && text[index - 1] !== '\\') inString = !inString
    if (inString) continue
    if (char === '[' || char === '{') depth += 1
    if (char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

function unescapeToml(text: string): string {
  return text.replace(/\\(["\\nrt])/g, (_all, char: string) =>
    char === 'n' ? '\n' : char === 'r' ? '\r' : char === 't' ? '\t' : char,
  )
}

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------

function parseOwner(value: unknown): { name: string; email?: string; url?: string } | undefined {
  if (typeof value === 'string' && value.trim() !== '') return { name: value.trim() }
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const name = nonEmpty(record['name'])
  if (name === undefined) return undefined
  return {
    name,
    ...stringField('email', record['email']),
    ...stringField('url', record['url']),
  }
}

/**
 * Ein optionales Textfeld als Spread — der Typ bleibt dabei exakt.
 *
 * Der doppelte `nonEmpty`-Aufruf in einem Ternär ist für TypeScript kein Beweis;
 * diese Funktion prüft einmal und liefert den passenden Teil.
 */
function stringField<K extends string>(key: K, value: unknown): { [P in K]?: string } {
  const text = nonEmpty(value)
  return (text === undefined ? {} : { [key]: text }) as { [P in K]?: string }
}

function pathField(value: unknown): string | readonly string[] {
  return typeof value === 'string' ? value : toArray(value).filter(isString)
}

function commandPaths(value: unknown): string[] {
  if (typeof value === 'string') return [normalizeRelative(value)]
  if (Array.isArray(value)) return value.filter(isString).map(normalizeRelative)
  if (typeof value === 'object' && value !== null) {
    const result: string[] = []
    for (const config of Object.values(value as Record<string, unknown>)) {
      if (typeof config === 'object' && config !== null) {
        const source = (config as Record<string, unknown>)['source']
        if (typeof source === 'string') result.push(normalizeRelative(source))
      }
    }
    return result
  }
  return []
}

function normalizeRelative(path: string): string {
  return posix.normalize(path.replace(/\\/g, '/')).replace(/^\.\//, '')
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return value === undefined ? [] : [value]
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function dedupeServers(servers: readonly McpServerSpec[]): McpServerSpec[] {
  const byName = new Map<string, McpServerSpec>()
  for (const server of servers) byName.set(server.name, server)
  return [...byName.values()]
}

async function readdirIfPresent(directory: string, extension: string): Promise<string[]> {
  try {
    const base = basename(directory)
    const entries = await readdir(directory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
      .map((entry) => posix.join(base, entry.name))
  } catch {
    return []
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringMap(value: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry
    else if (typeof entry === 'number' || typeof entry === 'boolean') result[key] = String(entry)
  }
  return result
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function refOf(record: Record<string, unknown>): { ref?: string } {
  const ref = nonEmpty(record['ref']) ?? nonEmpty(record['sha'])
  return ref === undefined ? {} : { ref }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
