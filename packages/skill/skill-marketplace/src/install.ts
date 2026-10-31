/**
 * `@prometheus-harness/skill-marketplace/install` — installieren.
 *
 * **Die Reihenfolge ist die Sicherheitsregel.** Erst holen, dann lesen, dann
 * **prüfen**, dann kopieren. Ein Plugin, das `DO_NOT_INSTALL` bekommt, wird nicht
 * geschrieben — auch nicht „nur kurz“. `force` ist die einzige Ausnahme und muß
 * ausdrücklich gesetzt werden.
 *
 * **Warum Skills materialisiert werden.** Der Host liest Fähigkeiten aus
 * Verzeichnissen (`<name>/SKILL.md`). Einen zweiten Anbieter in den Kern zu
 * hängen wäre eine zweite Wahrheit; eine Kopie in eine gelesene Wurzel ist eine
 * Datei, die man sieht, prüfen und löschen kann.
 *
 * **Was nicht unterstützt wird.** `npm`- und `command`-Quellen. Die eine bräuchte
 * einen Paketmanager, die andere würde beim Installieren fremden Code ausführen —
 * genau das, was der Scanner verhindern soll.
 *
 * @module @prometheus-harness/skill-marketplace/install
 */

import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path'

import { resolvePmhHome } from '@prometheus-harness/home-paths'
import { gate, scanDirectory, scanSkill, type ScanOptions, type ScanReport } from '@prometheus-harness/skillspector'

import { adaptPlugin, type AdapterResult } from './adapter.ts'
import { discoverPlugin, readMarketplace, readPluginManifest } from './manifest.ts'
import { skillNameFor, sanitizeSkillName } from './names.ts'
import { applyMcpServers } from './mcp.ts'
import {
  copyTree,
  fetchArchive,
  fetchGitHubRepository,
  isDirectory,
  materialize,
  parseSourceSpec,
  withTempDir,
} from './remote.ts'
import { emptyState, readState, writeState } from './state.ts'
import {
  MarketplaceError,
  type InstallOptions,
  type InstallResult,
  type InstalledMarketplace,
  type InstalledPlugin,
  type InstalledSkill,
  type Marketplace,
  type MarketplaceEntry,
  type MarketplaceState,
  type PluginScanSummary,
} from './types.ts'

/** Ein installierter Marketplace samt gelesener Datei. */
export interface AddedMarketplace {
  readonly marketplace: Marketplace
  readonly record: InstalledMarketplace
  readonly path: string
}

/**
 * Trägt einen Marketplace ein.
 *
 * @param input - Pfad, `owner/repo`, GitHub-URL oder Archiv-URL
 * @param options - Home, Name, Protokoll
 * @returns der eingetragene Marketplace
 */
export async function addMarketplace(
  input: string,
  options: InstallOptions & { readonly name?: string } = {},
): Promise<AddedMarketplace> {
  const home = options.home ?? resolvePmhHome()
  const spec = parseSourceSpec(input)
  const log = options.log ?? ((): void => {})
  log(`Quelle: ${describeSource(input)}`)

  const loaded = await withTempDir(async (temp) => {
    let root: string
    if (spec.kind === 'path') {
      if (!(await isDirectory(spec.path))) throw new MarketplaceError(`Kein Verzeichnis: ${spec.path}`)
      root = spec.path
    } else if (spec.kind === 'github') {
      log(`Lade ${spec.repo}${spec.ref === undefined ? '' : `@${spec.ref}`} …`)
      const fetched = await fetchGitHubRepository(spec.repo, spec.ref)
      root = join(temp, 'repo')
      await materialize(fetched.entries, root)
    } else {
      log(`Lade Archiv ${spec.url} …`)
      const entries = await fetchArchive(spec.url)
      root = join(temp, 'repo')
      await materialize(entries, root)
    }

    const marketplace = await readMarketplace(root)
    const name = options.name ?? marketplace.name
    const destination = join(home, 'marketplaces', name)
    await rm(destination, { recursive: true, force: true })
    await copyTree(root, destination)
    const record: InstalledMarketplace = {
      name,
      path: join('marketplaces', name),
      source: input,
      addedAt: (options.now ?? new Date()).toISOString(),
      pluginCount: marketplace.plugins.length,
    }
    return { marketplace, record, path: destination }
  })

  const state = await readState(home)
  await writeState(
    {
      ...state,
      marketplaces: { ...state.marketplaces, [loaded.record.name]: loaded.record },
    },
    home,
  )
  log(`Marketplace "${loaded.record.name}" eingetragen (${loaded.record.pluginCount} Plugins).`)
  return loaded
}

/**
 * Listet eingetragene Marketplaces.
 *
 * @param options - Home
 * @returns die Einträge
 */
export async function listMarketplaces(options: { home?: string } = {}): Promise<InstalledMarketplace[]> {
  const state = await readState(options.home)
  return Object.values(state.marketplaces).sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Entfernt einen Marketplace samt seiner Plugins.
 *
 * @param name - Name des Marketplace
 * @param options - Home
 * @returns die entfernten Plugin-Ids
 */
export async function removeMarketplace(name: string, options: { home?: string } = {}): Promise<string[]> {
  const home = options.home ?? resolvePmhHome()
  const state = await readState(home)
  const record = state.marketplaces[name]
  if (record === undefined) throw new MarketplaceError(`Marketplace "${name}" ist nicht eingetragen`)
  const removed: string[] = []
  for (const plugin of Object.values(state.plugins)) {
    if (plugin.marketplace !== name) continue
    await removePlugin(plugin.id, { home })
    removed.push(plugin.id)
  }
  await rm(join(home, record.path), { recursive: true, force: true })
  const next = await readState(home)
  const marketplaces = { ...next.marketplaces }
  delete marketplaces[name]
  await writeState({ ...next, marketplaces }, home)
  return removed
}

/**
 * Installiert ein Plugin.
 *
 * @param id - `name@marketplace` oder ein eindeutiger Plugin-Name
 * @param options - Home, Force, MCP
 * @returns das Ergebnis
 */
export async function installPlugin(
  id: string,
  options: InstallOptions & { readonly applyMcp?: boolean; readonly profile?: string } = {},
): Promise<InstallResult> {
  const home = options.home ?? resolvePmhHome()
  const log = options.log ?? ((): void => {})
  const state = await readState(home)
  const { marketplaceName, entry, marketplaceRecord } = await resolveEntry(id, state, home)
  const marketplaceRoot = join(home, marketplaceRecord.path)
  const warnings: string[] = []

  const pluginId = `${entry.name}@${marketplaceName}`
  const destination = join(home, 'plugins', marketplaceName, entry.name)
  const skillsRoot = options.skillsRoot ?? join(home, 'skills')

  // Alles, was aus dem temporären Baum kopiert wird, muß **vor** dem Aufräumen
  // geschehen. `withTempDir` löscht beim Verlassen; ein Pfad daraus ist danach tot.
  const prepared = await withTempDir(async (temp) => {
    const root = await fetchPlugin(entry, marketplaceRoot, temp, log)
    const manifest = await readPluginManifest(root)
    const components = await discoverPlugin(root, manifest)
    warnings.push(...components.warnings)
    const name = manifest?.name ?? entry.name
    const report = await scanDirectory(root, { name, source: `plugin:${entry.name}` })
    const decision = gate(report, options.strict === true ? 'strict' : 'balanced')
    if (decision.action === 'block' && options.force !== true) {
      throw new MarketplaceError(
        `Plugin "${entry.name}" wurde nicht installiert: ${decision.reason}. `
        + `Bericht: ${report.risk.score}/100 ${report.risk.severity}. `
        + 'Mit --force überschreiben (nicht empfohlen).',
      )
    }
    if (decision.action === 'warn') log(`Warnung: ${decision.reason}`)

    await rm(destination, { recursive: true, force: true })
    await copyTree(root, destination)

    const installedSkills: InstalledSkill[] = []
    for (const skill of components.skills) {
      const directory = posix.dirname(skill.path)
      const sourceDirectory = directory === '.' ? root : join(root, directory)
      const skillName = skillNameFor(name, skill.name)
      const target = join(skillsRoot, skillName)
      const skillReport = await scanDirectory(sourceDirectory, { name: skillName, source: `plugin:${pluginId}` })
      if (gate(skillReport, options.strict === true ? 'strict' : 'balanced').action === 'block' && options.force !== true) {
        warnings.push(`Skill "${skillName}" wurde wegen Sicherheitsbefunden übersprungen.`)
        continue
      }
      await rm(target, { recursive: true, force: true })
      if (directory === '.') await copyRootSkill(root, target)
      else await copyTree(sourceDirectory, target)
      installedSkills.push({
        name: skillName,
        path: join('skills', skillName),
        source: `plugin:${pluginId}`,
        plugin: pluginId,
        installedAt: (options.now ?? new Date()).toISOString(),
        digest: skillReport.skill.digest,
      })
    }

    if (options.applyMcp === true && components.mcpServers.length > 0) {
      const result = await applyMcpServers(components.mcpServers, {
        home,
        ...(options.profile === undefined ? {} : { profile: options.profile }),
        pluginRoot: destination,
      })
      if (result.added.length + result.updated.length > 0) {
        log(`MCP-Server eingetragen: ${[...result.added, ...result.updated].join(', ')}`)
      }
    }

    return { manifest, report, skills: installedSkills }
  })

  // Commands und Agents werden zu Skills. Das ist der Unterschied zwischen
  // „mitkopiert“ und „benutzbar“: der Harness kennt keine Slash-Commands und
  // keine Agenten-Dateien, aber er kennt Fähigkeiten.
  const adapter = options.adapter === false
    ? undefined
    : await adaptPlugin(destination, pluginId, {
        skillsRoot,
        pluginName: prepared.manifest?.name ?? entry.name,
      })
  if (adapter !== undefined) warnings.push(...adapter.warnings)
  const adaptedSkills: InstalledSkill[] = []
  for (const adapted of adapter?.adapted ?? []) {
    const target = join(skillsRoot, adapted.name)
    const report = await scanDirectory(target, { name: adapted.name, source: `plugin-adapter:${pluginId}` })
    adaptedSkills.push({
      name: adapted.name,
      path: join('skills', adapted.name),
      source: `plugin-adapter:${pluginId}`,
      plugin: pluginId,
      installedAt: (options.now ?? new Date()).toISOString(),
      digest: report.skill.digest,
    })
  }
  const allSkills = [...prepared.skills, ...adaptedSkills]

  const record: InstalledPlugin = {
    id: pluginId,
    name: entry.name,
    marketplace: marketplaceName,
    ...(prepared.manifest?.version === undefined ? {} : { version: prepared.manifest.version }),
    path: join('plugins', marketplaceName, entry.name),
    installedAt: (options.now ?? new Date()).toISOString(),
    digest: prepared.report.skill.digest,
    skills: allSkills.map((skill) => skill.name),
    ...(adapter === undefined || adapter.adapted.length === 0
      ? {}
      : {
          adapted: {
            commands: adapter.adapted.filter((item) => item.kind === 'command').map((item) => item.name),
            agents: adapter.adapted.filter((item) => item.kind === 'agent').map((item) => item.name),
          },
        }),
    scan: summarize(prepared.report, options.strict === true ? 'strict' : 'balanced'),
  }

  const next = await readState(home)
  const skills = { ...next.skills }
  for (const skill of allSkills) skills[skill.name] = skill
  await writeState(
    {
      ...next,
      plugins: { ...next.plugins, [pluginId]: record },
      skills,
    },
    home,
  )
  log(
    `Plugin "${pluginId}" installiert (${prepared.skills.length} Skills`
    + `${adaptedSkills.length === 0 ? '' : `, ${adaptedSkills.length} aus Commands/Agents`}).`,
  )
  return { plugin: record, skills: allSkills, scan: record.scan, warnings }
}

/**
 * Übersetzt Commands und Agents eines bereits installierten Plugins.
 *
 * **Warum das ein eigener Befehl ist.** Plugins, die vor dem Adapter installiert
 * wurden, haben ihre Commands nur als Dateien. Sie neu zu installieren würde den
 * Sicherheitslauf und die Ablage wiederholen; dieser Weg liest nur das vorhandene
 * Plugin-Verzeichnis und schreibt die fehlenden Skills.
 *
 * @param id - `name@marketplace`
 * @param options - Home und Zielwurzel
 * @returns das Ergebnis samt geschriebener Skills
 */
export async function adaptInstalledPlugin(
  id: string,
  options: InstallOptions = {},
): Promise<{ plugin: InstalledPlugin; skills: InstalledSkill[]; result: AdapterResult }> {
  const home = options.home ?? resolvePmhHome()
  const skillsRoot = options.skillsRoot ?? join(home, 'skills')
  const state = await readState(home)
  const record = state.plugins[id]
  if (record === undefined) throw new MarketplaceError(`Plugin "${id}" ist nicht installiert`)
  const result = await adaptPlugin(join(home, record.path), id, { skillsRoot, pluginName: record.name })

  const skills: InstalledSkill[] = []
  for (const adapted of result.adapted) {
    const target = join(skillsRoot, adapted.name)
    const report = await scanDirectory(target, { name: adapted.name, source: `plugin-adapter:${id}` })
    skills.push({
      name: adapted.name,
      path: join('skills', adapted.name),
      source: `plugin-adapter:${id}`,
      plugin: id,
      installedAt: (options.now ?? new Date()).toISOString(),
      digest: report.skill.digest,
    })
  }

  const nextSkills = { ...state.skills }
  for (const skill of skills) nextSkills[skill.name] = skill
  const commands = [...new Set([
    ...(record.adapted?.commands ?? []),
    ...result.adapted.filter((item) => item.kind === 'command').map((item) => item.name),
  ])]
  const agents = [...new Set([
    ...(record.adapted?.agents ?? []),
    ...result.adapted.filter((item) => item.kind === 'agent').map((item) => item.name),
  ])]
  const plugin: InstalledPlugin = {
    ...record,
    skills: [...new Set([...record.skills, ...skills.map((skill) => skill.name)])],
    ...(commands.length + agents.length === 0 ? {} : { adapted: { commands, agents } }),
  }
  await writeState(
    { ...state, plugins: { ...state.plugins, [id]: plugin }, skills: nextSkills },
    home,
  )
  return { plugin, skills, result }
}

/**
 * Listet installierte Plugins.
 *
 * @param options - Home
 * @returns die Einträge
 */
export async function listPlugins(options: { home?: string } = {}): Promise<InstalledPlugin[]> {
  const state = await readState(options.home)
  return Object.values(state.plugins).sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * Entfernt ein installiertes Plugin samt seiner Skills.
 *
 * @param id - `name@marketplace`
 * @param options - Home
 */
export async function removePlugin(id: string, options: { home?: string } = {}): Promise<void> {
  const home = options.home ?? resolvePmhHome()
  const state = await readState(home)
  const record = state.plugins[id]
  if (record === undefined) throw new MarketplaceError(`Plugin "${id}" ist nicht installiert`)
  await rm(join(home, record.path), { recursive: true, force: true })
  const skills = { ...state.skills }
  for (const name of record.skills) {
    const skill = skills[name]
    if (skill === undefined) continue
    await rm(join(home, skill.path), { recursive: true, force: true })
    delete skills[name]
  }
  const plugins = { ...state.plugins }
  delete plugins[id]
  await writeState({ ...state, plugins, skills }, home)
}

/**
 * Installiert eigenständige Skills aus einem Repository oder Verzeichnis.
 *
 * @param input - Pfad, `owner/repo`, GitHub-URL oder Archiv
 * @param options - Home, Force, Zielwurzel
 * @returns die installierten Skills
 */
export async function installSkills(
  input: string,
  options: InstallOptions = {},
): Promise<{ skills: InstalledSkill[]; reports: ScanReport[]; warnings: string[] }> {
  const home = options.home ?? resolvePmhHome()
  const log = options.log ?? ((): void => {})
  const spec = parseSourceSpec(input)
  const skillsRoot = options.skillsRoot ?? join(home, 'skills')
  const warnings: string[] = []

  const skills: InstalledSkill[] = []
  const reports: ScanReport[] = []
  const state = await readState(home)

  // Kopieren und Prüfen müssen **im** temporären Fenster passieren: nach dem
  // Verlassen ist der Quellbaum gelöscht.
  await withTempDir(async (temp) => {
    let root: string
    if (spec.kind === 'path') {
      if (!(await isDirectory(spec.path))) throw new MarketplaceError(`Kein Verzeichnis: ${spec.path}`)
      root = spec.path
    } else if (spec.kind === 'github') {
      log(`Lade ${spec.repo} …`)
      const fetched = await fetchGitHubRepository(spec.repo, spec.ref)
      root = join(temp, 'repo')
      await materialize(fetched.entries, root)
    } else {
      const entries = await fetchArchive(spec.url)
      root = join(temp, 'repo')
      await materialize(entries, root)
    }
    const directories = await findSkillDirectories(root)
    if (directories.length === 0) throw new MarketplaceError(`Keine SKILL.md in ${input} gefunden`)
    log(`${directories.length} Skill(s) gefunden.`)

    for (const directory of directories) {
      const relativePath = relative(root, directory).split(sep).join('/') || '.'
      const report = await scanDirectory(directory, { source: `skills:${input}` })
      reports.push(report)
      const decision = gate(report, options.strict === true ? 'strict' : 'balanced')
      if (decision.action === 'block' && options.force !== true) {
        warnings.push(`"${report.skill.name}" übersprungen: ${decision.reason}`)
        continue
      }
      if (decision.action === 'warn') log(`Warnung: "${report.skill.name}": ${decision.reason}`)
      const fallback = relativePath.split('/').pop() ?? 'skill'
      const baseName = sanitizeSkillName(report.skill.name === 'skill' ? fallback : report.skill.name)
      const name = options.prefix === undefined || options.prefix.trim() === ''
        ? baseName
        : sanitizeSkillName(`${options.prefix}-${baseName}`)
      const target = join(skillsRoot, name)
      // Ein vorhandenes Verzeichnis, das **nicht** aus dieser Quelle stammt, ist
      // ein gepflegtes Projekt-Skill. Es wird nicht überschrieben — genau dieser
      // Fall hat am 26.10.2026 die Projektfassung von `design-taste-frontend`
      // ersetzt. Reinstall derselben Quelle bleibt erlaubt.
      if (await exists(target)) {
        const owner = state.skills[name]
        const sameSource = owner?.source === input
        if (!sameSource && options.force !== true) {
          warnings.push(`"${name}" existiert bereits aus anderer Quelle — übersprungen (--force überschreibt).`)
          continue
        }
      }
      await rm(target, { recursive: true, force: true })
      await copyTree(directory, target)
      if (name !== baseName) await renameSkill(target, name)
      skills.push({
        name,
        path: join('skills', name),
        source: input,
        installedAt: (options.now ?? new Date()).toISOString(),
        digest: report.skill.digest,
      })
      log(`Skill "${name}" installiert (${report.risk.score}/100 ${report.risk.recommendation}).`)
    }
  })

  const nextSkills = { ...state.skills }
  for (const skill of skills) nextSkills[skill.name] = skill
  await writeState({ ...state, skills: nextSkills }, home)
  return { skills, reports, warnings }
}

/**
 * Listet materialisierte Skills.
 *
 * @param options - Home
 * @returns die Einträge
 */
export async function listSkills(options: { home?: string } = {}): Promise<InstalledSkill[]> {
  const state = await readState(options.home)
  return Object.values(state.skills).sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Prüft ein Verzeichnis und liefert den Bericht — der Weg, den `skill scan` nimmt.
 *
 * @param path - Verzeichnis oder Datei
 * @param options - Name, Quelle, Ausschlüsse, Baseline
 * @returns der Bericht
 */
export async function scanPath(
  path: string,
  options: ScanOptions = {},
): Promise<ScanReport> {
  const resolved = resolve(path)
  if (await isDirectory(resolved)) return scanDirectory(resolved, options)
  return scanSkill({ kind: 'file', path: resolved }, options)
}

/**
 * Leitet aus einem Bericht die Kurzfassung für den Zustand ab.
 *
 * Die **Empfehlung** bleibt die des Scanners; die **Aktion** ist das, was der
 * Installer tatsächlich getan hat. Beides zu speichern verhindert die
 * Verwechslung „DO_NOT_INSTALL, aber installiert“ — die bei `--force` und bei der
 * balanced-Politik korrekt ist, aber erklärt werden muss.
 *
 * @param report - der Bericht
 * @param policy - die beim Installieren benutzte Politik
 * @returns die Kurzfassung
 */
export function summarize(report: ScanReport, policy: 'strict' | 'balanced' = 'balanced'): PluginScanSummary {
  return {
    score: report.risk.score,
    severity: report.risk.severity,
    recommendation: report.risk.recommendation,
    action: gate(report, policy).action,
    findings: report.issues.length,
  }
}

// ---------------------------------------------------------------------------
// Interna
// ---------------------------------------------------------------------------

async function resolveEntry(
  id: string,
  state: MarketplaceState,
  home: string,
): Promise<{ marketplaceName: string; entry: MarketplaceEntry; marketplaceRecord: InstalledMarketplace }> {
  const at = id.lastIndexOf('@')
  const pluginName = at > 0 ? id.slice(0, at) : id
  const explicitMarketplace = at > 0 ? id.slice(at + 1) : undefined

  const candidates: MarketplaceEntry[] = []
  const matches: string[] = []
  for (const record of Object.values(state.marketplaces)) {
    if (explicitMarketplace !== undefined && record.name !== explicitMarketplace) continue
    const marketplace = await readMarketplace(join(home, record.path))
    for (const entry of marketplace.plugins) {
      if (entry.name !== pluginName) continue
      candidates.push(entry)
      matches.push(record.name)
    }
  }
  if (candidates.length === 0) {
    throw new MarketplaceError(
      explicitMarketplace === undefined
        ? `Plugin "${pluginName}" ist in keinem eingetragenen Marketplace zu finden.`
        : `Plugin "${pluginName}" fehlt im Marketplace "${explicitMarketplace}".`,
    )
  }
  if (candidates.length > 1) {
    throw new MarketplaceError(
      `Plugin "${pluginName}" ist mehrdeutig: ${matches.join(', ')}. Nutze "${pluginName}@<marketplace>".`,
    )
  }
  const entry = candidates[0]
  const marketplaceName = matches[0]
  if (entry === undefined || marketplaceName === undefined) throw new MarketplaceError('Plugin-Eintrag fehlt')
  const marketplaceRecord = state.marketplaces[marketplaceName]
  if (marketplaceRecord === undefined) throw new MarketplaceError(`Marketplace "${marketplaceName}" fehlt im Zustand`)
  return { marketplaceName, entry, marketplaceRecord }
}

async function fetchPlugin(
  entry: MarketplaceEntry,
  marketplaceRoot: string,
  temp: string,
  log: (message: string) => void,
): Promise<string> {
  const source = entry.source
  switch (source.kind) {
    case 'path': {
      const candidate = resolve(marketplaceRoot, source.path)
      if (!inside(marketplaceRoot, candidate)) throw new MarketplaceError(`Plugin-Pfad bricht aus: ${source.path}`)
      if (!(await isDirectory(candidate))) throw new MarketplaceError(`Plugin-Verzeichnis fehlt: ${source.path}`)
      const target = join(temp, 'plugin')
      await copyTree(candidate, target)
      return target
    }
    case 'github': {
      log(`Lade ${source.repo}${source.ref === undefined ? '' : `@${source.ref}`} …`)
      const fetched = await fetchGitHubRepository(source.repo, source.ref)
      const target = join(temp, 'plugin')
      await materialize(fetched.entries, target)
      return target
    }
    case 'git-subdir': {
      const repo = githubRepoFrom(source.url)
      if (repo === undefined) {
        throw new MarketplaceError(`git-subdir braucht ein GitHub-Repository: ${source.url}`)
      }
      const fetched = await fetchGitHubRepository(repo, source.ref)
      const root = join(temp, 'repo')
      await materialize(fetched.entries, root)
      const target = join(root, source.path)
      if (!inside(root, target)) throw new MarketplaceError(`git-subdir-Pfad bricht aus: ${source.path}`)
      if (!(await isDirectory(target))) throw new MarketplaceError(`git-subdir-Pfad fehlt: ${source.path}`)
      return target
    }
    case 'archive': {
      const entries = await fetchArchive(source.url)
      const target = join(temp, 'plugin')
      await materialize(entries, target)
      return target
    }
    case 'url': {
      const repo = githubRepoFrom(source.url)
      if (repo === undefined) {
        throw new MarketplaceError(
          `"${source.url}" ist kein GitHub-Repository. Nutze für andere Hosts die Quelle "archive" mit einer Archiv-URL.`,
        )
      }
      const fetched = await fetchGitHubRepository(repo, source.ref)
      const target = join(temp, 'plugin')
      await materialize(fetched.entries, target)
      return target
    }
    case 'npm':
      throw new MarketplaceError('npm-Quellen werden nicht unterstützt: PMH verteilt keine Pakete über npm.')
    case 'command':
      throw new MarketplaceError('command-Quellen werden nicht unterstützt: der Installer führt keine Befehle aus.')
  }
}

async function findSkillDirectories(root: string): Promise<string[]> {
  const result: string[] = []
  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > 4) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')) result.push(directory)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.claude-plugin') continue
      await walk(join(directory, entry.name), depth + 1)
    }
  }
  await walk(root, 0)
  return result
}

async function copyRootSkill(root: string, target: string): Promise<void> {
  const ignored = new Set(['.claude-plugin', '.git', 'hooks', 'commands', 'agents', '.mcp.json'])
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const from = join(root, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) await copyTree(from, to)
    else if (entry.isFile()) await writeFile(to, await readFile(from))
  }
}

/**
 * Schreibt den Namen im Frontmatter einer materialisierten `SKILL.md` um.
 *
 * **Warum das nötig ist.** Der Katalog liest den Namen aus dem Frontmatter, nicht
 * aus dem Verzeichnis. Zwei Fassungen desselben Skills (Projektfassung und
 * Upstream) brauchen daher **zwei Namen im Frontmatter**; ein bloßes Präfix am
 * Verzeichnis würde nur eine Fassung gewinnen lassen. Nur die `name`-Zeile wird
 * ersetzt — Beschreibung und Rumpf bleiben unverändert.
 *
 * @param directory - das materialisierte Skill-Verzeichnis
 * @param name - der neue Name
 */
export async function renameSkill(directory: string, name: string): Promise<void> {
  const path = join(directory, 'SKILL.md')
  const text = await readFile(path, { encoding: 'utf8' })
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (match === null) return
  const frontmatter = match[1] ?? ''
  const updated = /^name:.*$/m.test(frontmatter)
    ? frontmatter.replace(/^name:.*$/m, `name: ${name}`)
    : `${frontmatter}\nname: ${name}`
  if (updated === frontmatter) return
  await writeFile(path, `---\n${updated}\n---${text.slice(match[0].length)}`, { encoding: 'utf8' })
}

function inside(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate))
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

/** Ob ein Pfad existiert — ohne Unterscheidung zwischen Datei und Verzeichnis. */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function githubRepoFrom(url: string): string | undefined {
  const match = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/?#].*)?$/.exec(url)
  if (match === null) return undefined
  const owner = match[1]
  const name = match[2]
  return owner === undefined || name === undefined ? undefined : `${owner}/${name}`
}

function describeSource(input: string): string {
  const spec = parseSourceSpec(input)
  if (spec.kind === 'path') return `Pfad ${spec.path}`
  if (spec.kind === 'github') return `GitHub ${spec.repo}${spec.ref === undefined ? '' : `@${spec.ref}`}`
  return `URL ${spec.url}`
}

/** Nur für Prüfungen: der leere Zustand als Export. */
export { emptyState }
