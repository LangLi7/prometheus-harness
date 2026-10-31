/**
 * `@prometheus-harness/skill-filesystem` — Fähigkeiten von der Platte.
 *
 * **Was dieser Anbieter tut.** Er sucht in einer festen, ranggeordneten Menge von Wurzeln nach
 * direkten Kindern: ein Verzeichnis `<name>/SKILL.md` oder eine flache Datei `<name>.md`. Er
 * liest das YAML-Frontmatter, prüft Name und Aufruf-Schalter und liefert der Registry
 * Kandidaten. Den Rumpf liest er **erst beim Laden** — zwischen Katalog und Ladung kann sich
 * die Datei geändert haben, und dann gilt die neue Fassung.
 *
 * **Die Rangordnung** (kleiner gewinnt), unverändert aus der Vorlage:
 *
 * | Rang | Quelle | Wurzel |
 * |---|---|---|
 * | 100 | `project-dsh` | `<projekt>/.dsh/skills` |
 * | 200 | `project-agents` | `<projekt>/.agents/skills` |
 * | 300 | `custom` | `customSkillDirs` |
 * | 400 | `user-dsh` | `<home>/skills` (ohne `.system`) |
 * | 500 | `user-agents` | `<agents-home>/skills` |
 * | 600 | `bundled` | `bundledSkillDir` |
 *
 * **Warum die Projektwurzel über `.git` gesucht wird.** Ein Aufruf aus `src/tief/` soll die
 * Fähigkeiten des Projekts sehen, nicht die eines zufälligen Unterverzeichnisses. Ohne `.git`
 * gilt das Arbeitsverzeichnis selbst — die einzige ehrliche Annahme, wenn es kein Projekt gibt.
 *
 * **Was dieser Anbieter bewußt nicht tut.** Er kennt keinen Dateidienst des Hosts: er liest
 * über `node:fs`. Damit ist er ohne Cordis prüfbar; die Sandbox-Grenze des Hosts gilt für ihn
 * nicht automatisch. Wer ihn in einem gesperrten Arbeitsbereich einsetzt, muß die Wurzeln
 * entsprechend wählen. Diese Grenze steht in der README und ist keine Auslassung.
 *
 * @module @prometheus-harness/skill-filesystem
 */

import { access, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { resolveAgentsHome, resolvePmhHome } from '@prometheus-harness/home-paths'
import {
  BUNDLED_SKILL_RANK,
  isSkillName,
  type SkillCandidate,
  type SkillDefinition,
  type SkillLookupOptions,
  type SkillLogger,
  type SkillProvider,
  type SkillProviderControl,
  type SkillProviderObservation,
  type SkillRegistry,
  type SkillSource,
} from '@prometheus-harness/skill'

import { parseSkillText, type ParsedSkill } from './frontmatter.ts'
import { RootWatcher } from './watch.ts'

/** Rang der Projekt-Wurzel `.dsh/skills`. */
export const PROJECT_DSH_RANK = 100
/** Rang der Projekt-Wurzel `.agents/skills`. */
export const PROJECT_AGENTS_RANK = 200
/** Rang eigener Wurzeln aus der Konfiguration. */
export const CUSTOM_RANK = 300
/** Rang der Benutzer-Wurzel `<home>/skills`. */
export const USER_DSH_RANK = 400
/** Rang der gemeinsamen Agenten-Wurzel `<agents-home>/skills`. */
export const USER_AGENTS_RANK = 500

/** Einstellungen des lokalen Anbieters. */
export interface FilesystemSkillConfig {
  /** Anbietername in der Registry. Vorgabe `filesystem`; die Host-Brücke setzt `pmh-filesystem`. */
  readonly providerName?: string
  /** Ob Projekt- und Benutzer-Wurzeln gelesen werden. Vorgabe `true`. */
  readonly includeDefaultRoots?: boolean
  /** Home der Harness. Vorgabe: `PMH_HOME → DSH_HOME → ~/.pmh`. */
  readonly dshHome?: string
  /** Gemeinsames Agenten-Home. Vorgabe `DSH_AGENTS_HOME` oder `~/.agents`. */
  readonly agentsHome?: string
  /** Zusätzliche Wurzeln zwischen Projekt- und Benutzer-Wurzeln. */
  readonly customSkillDirs?: readonly string[]
  /** Gebündelte Wurzel; Vorgabe `DSH_BUNDLED_SKILL_DIR`, wenn die Standardwurzeln gelesen werden. */
  readonly bundledSkillDir?: string
  /** Ob die Wurzeln beobachtet werden. Vorgabe `true`. */
  readonly watch?: boolean
  /** Höchstzahl beobachteter Wurzeln. Vorgabe 128. */
  readonly watchMaxProjects?: number
  /** Protokoll für übersprungene Dateien. Vorgabe: still. */
  readonly logger?: SkillLogger
}

/** Eine Wurzel, aus der Fähigkeiten gelesen werden. */
interface SkillRoot {
  readonly path: string
  readonly source: SkillSource
  readonly rank: number
  /** `.system` unter dieser Wurzel überspringen (Benutzer-Home). */
  readonly skipSystem?: boolean
}

/** Ein Verzeichniseintrag, soweit er für die Entdeckung zählt. */
interface RootEntry {
  readonly name: string
  readonly kind: 'directory' | 'file' | 'other'
  readonly path: string
}

/** Was ein Kandidat zum Laden braucht. */
interface LocalLocator {
  readonly path: string
  readonly directory: string
}

/**
 * Der lokale Anbieter.
 *
 * Er ist ein gewöhnliches Objekt: die Registry ruft `list` und `get`, und die Beobachtung
 * meldet Änderungen über die Steuerung der Registrierung. Ohne Steuerung (`control` fehlt)
 * liest der Anbieter trotzdem — nur Änderungen meldet er dann niemandem.
 */
export class FilesystemSkillProvider implements SkillProvider {
  readonly name: string
  readonly #config: FilesystemSkillConfig
  readonly #dshHome: string
  readonly #agentsHome: string
  readonly #customSkillDirs: readonly string[]
  readonly #bundledSkillDir: string | undefined
  readonly #watcher: RootWatcher | undefined
  readonly #logger: SkillLogger | undefined
  #disposed = false

  /**
   * @param config - Wurzeln, Home und Beobachtung
   * @param control - die Steuerung aus der Registry; fehlt sie, wird nichts gemeldet
   * @throws RangeError oder Error bei einer unbrauchbaren Konfiguration
   */
  constructor(config: FilesystemSkillConfig = {}, control?: SkillProviderControl) {
    const providerName = config.providerName ?? 'filesystem'
    if (providerName.trim() === '') throw new Error('skill-filesystem: providerName darf nicht leer sein')
    this.name = providerName
    this.#config = config
    this.#dshHome = resolvePmhHome(config.dshHome)
    this.#agentsHome = resolveAgentsHome(config.agentsHome)
    this.#customSkillDirs = (config.customSkillDirs ?? []).map((root) => resolve(root))
    this.#logger = config.logger
    this.#bundledSkillDir = resolveBundledRoot(config)

    if (config.watch ?? true) {
      const invalidate = control?.invalidate ?? ((): void => {})
      this.#watcher = new RootWatcher(invalidate, {
        enabled: true,
        ...(config.watchMaxProjects === undefined ? {} : { maxRoots: config.watchMaxProjects }),
        onError: (message) => { this.#warn(message) },
      })
    }
    control?.signal.addEventListener('abort', () => { this.dispose() }, { once: true })
  }

  /**
   * Listet die Kandidaten.
   *
   * Ein Beobachtungsfehler macht die Erfassung **unvollständig**, versteckt aber die lesbaren
   * Kandidaten nicht: der Verbraucher behält seine letzte gute Sicht und versucht es später
   * erneut.
   */
  async list(options: SkillLookupOptions): Promise<readonly SkillCandidate[] | SkillProviderObservation> {
    this.#throwIfDisposed(options.signal)
    const roots = await this.#roots(options.cwd)
    let complete = true
    try {
      this.#watcher?.observe(roots.map((root) => root.path))
    } catch (error) {
      this.#warn(describe(error))
      complete = false
    }

    const candidates: SkillCandidate[] = []
    for (const root of roots) {
      this.#throwIfDisposed(options.signal)
      candidates.push(...(await this.#discoverRoot(root, options.signal)))
    }
    return complete ? candidates : { candidates, complete }
  }

  /**
   * Lädt den Rumpf eines Kandidaten neu von der Platte.
   *
   * @returns die vollständige Fähigkeit, oder `undefined`, wenn die Datei verschwunden ist
   */
  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    this.#throwIfDisposed(options.signal)
    const locator = candidate.locator as LocalLocator
    options.signal?.throwIfAborted()
    const parsed = await this.#parseFile(locator.path)
    if (parsed === undefined) return undefined
    return {
      name: parsed.name,
      description: parsed.description,
      ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
      invocation: parsed.invocation,
      source: candidate.source,
      provider: this.name,
      resourceBase: { kind: 'directory', path: locator.directory },
      path: locator.path,
      ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
      content: parsed.content,
    }
  }

  /**
   * Meldet eine Schreibbeobachtung des Hosts.
   *
   * @param path - der geschriebene Pfad
   * @returns ob er in einer Wurzel lag
   */
  observeHostMutation(path: string): boolean {
    const roots = this.#staticRoots()
    return this.#watcher?.observeHostMutation(path, roots.map((root) => root.path)) ?? false
  }

  /** Schließt die Beobachtung; mehrfach aufrufbar. */
  dispose(): void {
    this.#disposed = true
    this.#watcher?.dispose()
  }

  /** Ob der Anbieter abgemeldet ist. */
  get disposed(): boolean {
    return this.#disposed
  }

  async #roots(cwd: string | undefined): Promise<SkillRoot[]> {
    const roots: SkillRoot[] = []
    if ((this.#config.includeDefaultRoots ?? true) && cwd !== undefined) {
      const projectRoot = await findProjectRoot(resolve(cwd))
      roots.push(
        { path: join(projectRoot, '.dsh', 'skills'), source: 'project-dsh', rank: PROJECT_DSH_RANK },
        {
          path: join(projectRoot, '.agents', 'skills'),
          source: 'project-agents',
          rank: PROJECT_AGENTS_RANK,
        },
      )
    }
    roots.push(
      ...this.#customSkillDirs.map((path) => ({ path, source: 'custom' as const, rank: CUSTOM_RANK })),
    )
    if (this.#config.includeDefaultRoots ?? true) {
      roots.push(
        {
          path: join(this.#dshHome, 'skills'),
          source: 'user-dsh',
          rank: USER_DSH_RANK,
          skipSystem: true,
        },
        { path: join(this.#agentsHome, 'skills'), source: 'user-agents', rank: USER_AGENTS_RANK },
      )
    }
    if (this.#bundledSkillDir !== undefined) {
      roots.push({ path: this.#bundledSkillDir, source: 'bundled', rank: BUNDLED_SKILL_RANK })
    }
    return roots
  }

  /** Wurzeln ohne cwd — für die Schreibbeobachtung. */
  #staticRoots(): SkillRoot[] {
    return [
      ...this.#customSkillDirs.map((path) => ({ path, source: 'custom' as const, rank: CUSTOM_RANK })),
      ...(this.#config.includeDefaultRoots ?? true
        ? [
            {
              path: join(this.#dshHome, 'skills'),
              source: 'user-dsh' as const,
              rank: USER_DSH_RANK,
              skipSystem: true,
            },
            { path: join(this.#agentsHome, 'skills'), source: 'user-agents' as const, rank: USER_AGENTS_RANK },
          ]
        : []),
      ...(this.#bundledSkillDir === undefined
        ? []
        : [{ path: this.#bundledSkillDir, source: 'bundled' as const, rank: BUNDLED_SKILL_RANK }]),
    ]
  }

  async #discoverRoot(root: SkillRoot, signal: AbortSignal | undefined): Promise<SkillCandidate[]> {
    const entries = await listRootEntries(root.path)
    entries.sort((left, right) => compareCodePoints(left.name, right.name))
    const candidates: SkillCandidate[] = []
    for (const entry of entries) {
      signal?.throwIfAborted()
      if (root.skipSystem === true && entry.name === '.system') continue
      const locator = this.#locatorFor(root, entry)
      if (locator === undefined) continue
      const parsed = await this.#parseFile(locator.path)
      if (parsed === undefined) continue
      candidates.push({
        name: parsed.name,
        description: parsed.description,
        ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
        invocation: parsed.invocation,
        source: root.source,
        provider: this.name,
        rank: root.rank,
        locator,
        resourceBase: { kind: 'directory', path: locator.directory },
        path: locator.path,
        ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
      })
    }
    return candidates
  }

  #locatorFor(root: SkillRoot, entry: RootEntry): LocalLocator | undefined {
    if (entry.kind === 'directory') {
      return { path: join(entry.path, 'SKILL.md'), directory: entry.path }
    }
    if (entry.kind === 'file' && entry.name.endsWith('.md')) {
      return { path: entry.path, directory: root.path }
    }
    return undefined
  }

  async #parseFile(path: string): Promise<ParsedSkill | undefined> {
    const raw = await readTextIfPresent(path)
    if (raw === undefined) return undefined
    const result = parseSkillText(raw)
    if (!result.ok) {
      this.#warn(`Fähigkeitsdatei ${path} ignoriert: ${result.reason}`)
      return undefined
    }
    return result.skill
  }

  #warn(message: string): void {
    try {
      this.#logger?.warn(message)
    } catch {
      // Ein Protokoll, das selbst scheitert, darf die Entdeckung nicht anhalten.
    }
  }

  #throwIfDisposed(signal: AbortSignal | undefined): void {
    if (this.#disposed) throw new Error('skill-filesystem: der Anbieter ist abgemeldet')
    signal?.throwIfAborted()
  }
}

/**
 * Hängt den lokalen Anbieter an eine Registry.
 *
 * @param registry - die Registry
 * @param config - Wurzeln und Beobachtung
 * @returns die Rücknahme; sie meldet den Anbieter ab und schließt die Beobachtung
 */
export function registerFilesystemSkills(
  registry: SkillRegistry,
  config: FilesystemSkillConfig = {},
): () => void {
  return registry.registerProvider((control) => new FilesystemSkillProvider(config, control))
}

function resolveBundledRoot(config: FilesystemSkillConfig): string | undefined {
  if (config.bundledSkillDir !== undefined) return resolve(config.bundledSkillDir)
  const fromEnvironment = process.env['DSH_BUNDLED_SKILL_DIR']
  if ((config.includeDefaultRoots ?? true) && fromEnvironment !== undefined && fromEnvironment !== '') {
    return resolve(fromEnvironment)
  }
  return undefined
}

async function listRootEntries(root: string): Promise<RootEntry[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true, encoding: 'utf8' })
  } catch (error) {
    if (isAbsentPathError(error)) return []
    throw error
  }

  const result: RootEntry[] = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    const kind = await entryKind(path, entry)
    result.push({ name: entry.name, kind, path })
  }
  return result
}

async function entryKind(
  path: string,
  entry: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean },
): Promise<'directory' | 'file' | 'other'> {
  if (entry.isDirectory()) return 'directory'
  if (entry.isFile()) return 'file'
  if (!entry.isSymbolicLink()) return 'other'
  try {
    const info = await stat(path)
    if (info.isDirectory()) return 'directory'
    if (info.isFile()) return 'file'
    return 'other'
  } catch {
    return 'other'
  }
}

async function readTextIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, { encoding: 'utf8' })
  } catch (error) {
    if (isAbsentPathError(error)) return undefined
    throw error
  }
}

async function findProjectRoot(cwd: string): Promise<string> {
  let current = cwd
  while (true) {
    if (await pathExists(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return cwd
    current = parent
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function isAbsentPathError(error: unknown): boolean {
  return hasCode(error, 'ENOENT') || hasCode(error, 'ENOTDIR') || hasCode(error, 'EISDIR')
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function compareCodePoints(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Die Rangkonstanten als eine Tabelle — für Prüfungen und Dokumentation. */
export const SKILL_ROOT_RANKS = {
  'project-dsh': PROJECT_DSH_RANK,
  'project-agents': PROJECT_AGENTS_RANK,
  custom: CUSTOM_RANK,
  'user-dsh': USER_DSH_RANK,
  'user-agents': USER_AGENTS_RANK,
  bundled: BUNDLED_SKILL_RANK,
} as const

/** Prüft nur den Namen — für Aufrufer, die keinen Kandidaten bauen wollen. */
export function isValidSkillName(name: string): boolean {
  return isSkillName(name)
}

/** Re-Export der Rangkonstante für Aufrufer, die nur dieses Paket importieren. */
export { BUNDLED_SKILL_RANK }
