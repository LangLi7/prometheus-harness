/**
 * `@prometheus-harness/skill-marketplace/mcp` — MCP-Server in den Host eintragen.
 *
 * **Was hier passiert.** Ein `McpServerSpec` wird zu einer Zeile in
 * `cordis.patch.yml`: `mcp-client` mit `transport`, `serverName` und entweder
 * `command`/`args`/`env` oder `url`/`headers`. Das ist genau die Form, die
 * `@deepseek-ai/dsh-mcp-client` liest.
 *
 * **Warum die Patch-Datei und nicht eine eigene Konfiguration.** Der Host kennt
 * genau einen Weg, Dienste zu starten: den Loader-Baum. Eine zweite
 * Konfigurationsdatei wäre eine zweite Wahrheit, die niemand lädt.
 *
 * **Warum die Datei als YAML-Dokument bearbeitet wird.** Ein textuelles Anhängen
 * zerstört `[]` und bestehende Kommentare. Über den Dokumentbaum bleiben
 * Kommentare und Reihenfolge erhalten, und derselbe Servername wird beim zweiten
 * Lauf **ersetzt**, nicht verdoppelt.
 *
 * @module @prometheus-harness/skill-marketplace/mcp
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { resolvePmhHome } from '@prometheus-harness/home-paths'
import { isMap, isSeq, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml'

import { MarketplaceError, type McpServerSpec } from './types.ts'

/** Die Kennung des `mcp-client`-Eintrags im Loader. */
export const MCP_PLUGIN_NAME = '@deepseek-ai/dsh-mcp-client'

/** Das Protokoll eines Schreibvorgangs. */
export interface McpApplyResult {
  readonly path: string
  readonly added: readonly string[]
  readonly updated: readonly string[]
  readonly skipped: readonly string[]
}

/**
 * Die Eintrags-Kennung für einen Server.
 *
 * @param serverName - Name des Servers
 * @returns eine Loader-taugliche Kennung
 */
export function patchEntryId(serverName: string): string {
  const slug = serverName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `pmh-mcp-${slug === '' ? 'server' : slug}`
}

/**
 * Baut die Konfiguration für `mcp-client`.
 *
 * @param server - die Serverbeschreibung
 * @param pluginRoot - Wurzel eines Plugins, für `${CLAUDE_PLUGIN_ROOT}`
 * @returns die Konfiguration
 */
export function mcpClientConfig(server: McpServerSpec, pluginRoot?: string): Record<string, unknown> {
  const substitute = (value: string): string =>
    pluginRoot === undefined ? value : value.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot)
  /** Der Host begrenzt `serverName` auf `[A-Za-z0-9_-]{1,32}`. */
  const serverName = server.name.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32)
  if (server.transport === 'streamable-http') {
    if (server.url === undefined) throw new MarketplaceError(`MCP-Server "${server.name}" hat keine URL`)
    return {
      transport: 'streamable-http',
      serverName,
      url: substitute(server.url),
      ...(server.headers === undefined ? {} : { headers: server.headers }),
      ...(server.optional === true ? { failOnStartupError: false } : {}),
    }
  }
  if (server.command === undefined) throw new MarketplaceError(`MCP-Server "${server.name}" hat keinen Befehl`)
  return {
    transport: 'stdio',
    serverName,
    command: substitute(server.command),
    args: (server.args ?? []).map(substitute),
    ...(server.env === undefined ? {} : { env: server.env }),
    ...(server.cwd === undefined ? {} : { cwd: substitute(server.cwd) }),
    ...(server.optional === true ? { failOnStartupError: false } : {}),
  }
}

/**
 * Trägt Server in die Patch-Datei eines Profils ein.
 *
 * @param servers - die Server
 * @param options - Home, Profil, Plugin-Wurzel
 * @returns was geschrieben wurde
 */
export async function applyMcpServers(
  servers: readonly McpServerSpec[],
  options: { home?: string; profile?: string; pluginRoot?: string } = {},
): Promise<McpApplyResult> {
  const home = options.home ?? resolvePmhHome()
  const path = join(home, 'profiles', options.profile ?? 'pmh', 'cordis.patch.yml')
  let text = ''
  try {
    text = await readFile(path, { encoding: 'utf8' })
  } catch {
    text = '# Patch-Schicht des Profils.\n[]\n'
  }

  let document = parseDocument(text)
  if (document.errors.length > 0) {
    throw new MarketplaceError(`cordis.patch.yml ist kein gültiges YAML: ${document.errors[0]?.message ?? ''}`)
  }
  if (document.contents === null || document.contents === undefined) {
    document = parseDocument('[]\n')
  }
  if (!isSeq(document.contents)) {
    throw new MarketplaceError('cordis.patch.yml muss eine YAML-Liste sein')
  }

  const root = document.contents as YAMLSeq
  // Blockstil statt `[{...}]`: die Datei wird von Menschen gelesen und in
  // Differences geprüft. Ein frisch geparster leerer Patch bringt Flow-Stil mit,
  // der sich auf alle neuen Knoten vererbt.
  root.flow = false
  const added: string[] = []
  const updated: string[] = []
  const skipped: string[] = []

  for (const server of servers) {
    const id = patchEntryId(server.name)
    const config = mcpClientConfig(server, options.pluginRoot)
    const existing = findInsertEntry(root, id)
    if (existing !== undefined) {
      existing.set('config', document.createNode(config))
      existing.set('name', MCP_PLUGIN_NAME)
      updated.push(server.name)
      continue
    }
    const entry = document.createNode({ id, name: MCP_PLUGIN_NAME, config }) as YAMLMap
    entry.flow = false
    const insert = firstInsert(root)
    if (insert !== undefined) insert.add(entry)
    else {
      const wrapper = document.createNode({ insert: [entry] }) as YAMLMap
      wrapper.flow = false
      root.add(wrapper)
    }
    added.push(server.name)
  }

  if (added.length === 0 && updated.length === 0) {
    return { path, added, updated, skipped }
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, String(document), { encoding: 'utf8' })
  return { path, added, updated, skipped }
}

/**
 * Entfernt einen Server aus der Patch-Datei.
 *
 * @param serverName - Name des Servers
 * @param options - Home und Profil
 * @returns ob etwas entfernt wurde
 */
export async function removeMcpServer(
  serverName: string,
  options: { home?: string; profile?: string } = {},
): Promise<boolean> {
  const home = options.home ?? resolvePmhHome()
  const path = join(home, 'profiles', options.profile ?? 'pmh', 'cordis.patch.yml')
  let text: string
  try {
    text = await readFile(path, { encoding: 'utf8' })
  } catch {
    return false
  }
  const document = parseDocument(text)
  if (!isSeq(document.contents)) return false
  const root = document.contents as YAMLSeq
  const id = patchEntryId(serverName)
  let removed = false
  for (const item of [...root.items]) {
    if (!isMap(item)) continue
    const insert = item.get('insert', true)
    if (!isSeq(insert)) continue
    const index = insert.items.findIndex((candidate) => {
      if (!isMap(candidate)) return false
      return candidate.get('id') === id
    })
    if (index >= 0) {
      insert.items.splice(index, 1)
      removed = true
    }
    if (insert.items.length === 0) {
      const rootIndex = root.items.indexOf(item)
      if (rootIndex >= 0) root.items.splice(rootIndex, 1)
    }
  }
  if (removed) await writeFile(path, String(document), { encoding: 'utf8' })
  return removed
}

/**
 * Liest die Server, die die Patch-Datei bereits einträgt.
 *
 * @param options - Home und Profil
 * @returns Server samt Kennung
 */
export async function listMcpServers(
  options: { home?: string; profile?: string } = {},
): Promise<Array<{ id: string; serverName?: string; transport?: string }>> {
  const home = options.home ?? resolvePmhHome()
  const path = join(home, 'profiles', options.profile ?? 'pmh', 'cordis.patch.yml')
  let text: string
  try {
    text = await readFile(path, { encoding: 'utf8' })
  } catch {
    return []
  }
  const document = parseDocument(text)
  if (!isSeq(document.contents)) return []
  const result: Array<{ id: string; serverName?: string; transport?: string }> = []
  for (const item of document.contents.items) {
    if (!isMap(item)) continue
    const insert = item.get('insert', true)
    if (!isSeq(insert)) continue
    for (const candidate of insert.items) {
      if (!isMap(candidate)) continue
      if (candidate.get('name') !== MCP_PLUGIN_NAME) continue
      const id = candidate.get('id')
      if (typeof id !== 'string') continue
      const config = candidate.get('config')
      if (!isMap(config)) {
        result.push({ id })
        continue
      }
      const serverName = config.get('serverName')
      const transport = config.get('transport')
      result.push({
        id,
        ...(typeof serverName === 'string' ? { serverName } : {}),
        ...(typeof transport === 'string' ? { transport } : {}),
      })
    }
  }
  return result
}

function findInsertEntry(root: YAMLSeq, id: string): YAMLMap | undefined {
  for (const item of root.items) {
    if (!isMap(item)) continue
    const insert = item.get('insert', true)
    if (!isSeq(insert)) continue
    for (const candidate of insert.items) {
      if (!isMap(candidate)) continue
      if (candidate.get('id') === id) return candidate
    }
  }
  return undefined
}

function firstInsert(root: YAMLSeq): YAMLSeq | undefined {
  for (const item of root.items) {
    if (!isMap(item)) continue
    const insert = item.get('insert', true)
    if (isSeq(insert)) return insert
  }
  return undefined
}
