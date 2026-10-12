/**
 * Registry: welche Units liegen wo, was brauchen sie, und läuft das hier?
 *
 * Die Registry **erfindet keinen Zustand**: sie liest `unit.json` aus
 * konfigurierten Wurzeln. Damit gibt es keine zweite Wahrheit, die veralten
 * kann — der Ordner ist die Installation.
 *
 * Zwei Eigenschaften sind bindend:
 *
 *  - **Determinismus.** Wurzeln behalten ihre Reihenfolge, Verzeichnisse
 *    werden sortiert durchlaufen, jede Ausgabe ist stabil sortiert. Zwei
 *    Aufrufe auf derselben Platte liefern dieselbe Liste.
 *  - **Kein stiller Erfolg.** Jede Unverträglichkeit hat einen eigenen Code
 *    (siehe `errors.ts`) und einen Satz, der den Grund nennt.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'


import { unitError, type UnitError } from './errors.ts'
import {
  compareVersions,
  isContractRange,
  readManifest,
  satisfiesContract,
  type UnitKind,
  type UnitLanguage,
  type UnitManifest,
  type UnitPlatform,
} from './manifest.ts'

/** Der Name der optionalen Herkunftsdatei, die ein Import hinterlässt. */
export const PROVENANCE_FILE = '.pmh-export.json'

/** Verzeichnisse, die beim Scannen nie betreten werden. */
export const SCAN_PRUNE_DIRECTORIES: readonly string[] = [
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'target',
  'dist',
  'build',
  'vendor',
  '.venv',
  '__pycache__',
]

/** Eine Wurzel, in der Units gesucht werden. */
export interface RegistryRoot {
  /** Absoluter oder relativer Pfad; wird aufgelöst. */
  readonly path: string
  /** Anzeigename der Wurzel (Default: `path`). Auch die Priorität: früher = gewinnt. */
  readonly label?: string
}

/** Der Host, gegen den die Verträglichkeit geprüft wird. */
export interface HostContract {
  /** Version des Core-Vertrags (z. B. `0.2.1-alpha.2`). */
  readonly coreVersion: string
  /**
   * Vertragsspanne, die gilt, wenn ein Unit kein `contract` deklariert.
   * Ohne Angabe: der Vertrag ist unbekannt und wird als solcher gemeldet,
   * statt still zu bestehen.
   */
  readonly defaultContract?: string
  /** Plattform des Hosts (`process.platform`), für die `platforms`-Prüfung. */
  readonly platform?: string
  /** Laufzeitumgebungen des Hosts: `typescript`, `go`, `rust`. */
  readonly runtimes?: readonly UnitLanguage[]
}

/** Die Herkunft eines installierten Units. */
export interface Provenance {
  /** Bündelformat, aus dem installiert wurde. */
  readonly format: number
  /** Bündeldigest (`sha256:…`) des Bündels. */
  readonly digest: string
  /** Zeitpunkt der Installation (ISO-8601). */
  readonly installedAt: string
  /** Name des Units im Bündel. */
  readonly sourceName?: string
  /** Version des Units im Bündel. */
  readonly sourceVersion?: string
  /** Werkzeug, das exportiert hat. */
  readonly createdBy?: string
  /** Digest des Unit-Inhalts (nur Dateien, ohne Zeitstempel) zum Vergleich. */
  readonly contentDigest?: string
}

/** Ein gefundenes Unit. */
export interface RegistryEntry {
  readonly manifest: UnitManifest
  /** Anzeigename der Wurzel, in der es gefunden wurde. */
  readonly rootLabel: string
  /** Der Wurzelpfad, aufgelöst. */
  readonly rootPath: string
  /** Der Unit-Ordner, absolut. */
  readonly directory: string
  /** Die Herkunft, falls ein Import sie hinterlassen hat. */
  readonly provenance?: Provenance
}

/** Ein Befund beim Scannen, mit dem Ort, an dem er auftrat. */
export interface RegistryDiagnostic extends UnitError {
  /** Der Ordner, in dem der Befund auftrat. */
  readonly directory: string
  /**
   * `error` heißt: dieses Unit ist nicht nutzbar (es fehlt deshalb in `units`).
   * `warning` heißt: das Unit ist nutzbar, aber etwas soll sichtbar sein —
   * etwa ein Ordnername, der vom Unit-Namen abweicht.
   */
  readonly severity: 'error' | 'warning'
}

/** Das Ergebnis eines Scans. */
export interface Registry {
  readonly roots: readonly { readonly label: string; readonly path: string; readonly exists: boolean }[]
  readonly host?: HostContract
  /** Alle gefundenen Units, stabil sortiert: Wurzel, dann Name, dann Version. */
  readonly units: readonly RegistryEntry[]
  /** Alle Befunde; ein Befund hier heißt nicht, dass der Scan abgebrochen wurde. */
  readonly diagnostics: readonly RegistryDiagnostic[]
}

/** Ein Abhängigkeitsknoten der transitiven Auflösung. */
export interface DependencyNode {
  readonly name: string
  /** `0` = das Unit selbst, `1` = direkte Abhängigkeit, … */
  readonly depth: number
  /** Wer es braucht: `[]` für das Unit selbst, sonst die Namen. */
  readonly requiredBy: readonly string[]
  readonly version?: string
}

/** Der Auflösungsbericht einer Abhängigkeitsabfrage. */
export interface DependencyResolution {
  readonly root: string
  /** `root` zuerst, dann Abhängigkeiten in Tiefe-und-Name-Reihenfolge. */
  readonly order: readonly DependencyNode[]
  readonly missing: readonly DependencyNode[]
  /** Ein Zyklus, falls einer gefunden wurde (Namen in Durchlaufreihenfolge). */
  readonly cycle?: readonly string[]
}

/** Warum ein Unit hier nicht installierbar ist. */
export interface InstallabilityReason extends UnitError {
  /** Die betroffene Unit, soweit bekannt. */
  readonly unit?: string
}

/** Das Ergebnis der Frage „ist dieses Unit hier installierbar?". */
export interface Installability {
  readonly unit: string | undefined
  readonly installable: boolean
  readonly reasons: readonly InstallabilityReason[]
}

/** Konfiguration eines Scans. */
export interface ScanRegistryConfig {
  /** Die Wurzeln; ein String gilt als Wurzel ohne eigenen Anzeigenamen. */
  readonly roots: readonly (string | RegistryRoot)[]
  readonly host?: HostContract
  /** Tiefe der Suche nach `unit.json` unterhalb jeder Wurzel (Default: 3). */
  readonly maxDepth?: number
}

function toRoot(root: string | RegistryRoot): RegistryRoot {
  return typeof root === 'string' ? { path: root } : root
}

/** Ist ein Verzeichnis eines der bekannten Rauschverzeichnisse? */
function isPruned(name: string): boolean {
  return SCAN_PRUNE_DIRECTORIES.includes(name.toLowerCase())
}

/**
 * Sortiert zwei Zeichenketten nach Code-Einheit.
 *
 * Absichtlich **nicht** `localeCompare`: dessen Reihenfolge hängt von der
 * ICU-Version und der Systemsprache ab, und `-` sortiert dort je nach Umgebung
 * vor oder nach `.`. Die Registry verspricht aber eine Reihenfolge, die zwei
 * Aufrufe auf zwei Rechnern gleich liefert — also wird nach Bytes verglichen.
 */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  }
  catch {
    return false
  }
}

/** Liest die Herkunft aus einem Unit-Ordner, ohne zu werfen. */
export async function readProvenance(directory: string): Promise<Provenance | undefined> {
  let text: string
  try {
    text = await readFile(join(directory, PROVENANCE_FILE), 'utf8')
  }
  catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  }
  catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  const digest = typeof record.bundleDigest === 'string' ? record.bundleDigest : undefined
  const installedAt = typeof record.installedAt === 'string' ? record.installedAt : undefined
  if (digest === undefined || installedAt === undefined) return undefined

  const source = typeof record.source === 'object' && record.source !== null ? record.source as Record<string, unknown> : {}
  return {
    format: typeof record.format === 'number' ? record.format : 0,
    digest,
    installedAt,
    ...(typeof source.unit === 'string' ? { sourceName: source.unit } : {}),
    ...(typeof source.version === 'string' ? { sourceVersion: source.version } : {}),
    ...(typeof record.createdBy === 'string' ? { createdBy: record.createdBy } : {}),
    ...(typeof record.contentDigest === 'string' ? { contentDigest: record.contentDigest } : {}),
  }
}

/**
 * Durchläuft eine Wurzel und sammelt Unit-Ordner.
 *
 * Die Wurzel selbst zählt mit. Ein Ordner, der ein `unit.json` enthält, ist ein
 * Unit — darunter wird nicht weiter gesucht (verschachtelte Units wären ein
 * Fehler, keine Absicht). `readdir` wird sortiert ausgewertet, damit die
 * Fundreihenfolge plattformunabhängig dieselbe ist.
 */
async function collectUnitDirectories(rootPath: string, maxDepth: number): Promise<string[]> {
  const found: string[] = []
  const walk = async (directory: string, depth: number): Promise<void> => {
    let names: string[]
    try {
      names = await readdir(directory)
    }
    catch {
      return
    }
    names.sort((a, b) => byName(a, b))
    if (names.includes('unit.json')) {
      found.push(directory)
      return
    }
    if (depth >= maxDepth) return
    for (const name of names) {
      if (isPruned(name)) continue
      const child = join(directory, name)
      if (!(await isDirectory(child))) continue
      await walk(child, depth + 1)
    }
  }
  await walk(rootPath, 0)
  return found
}

/** Sucht unter den schon gefundenen Units eines mit gleichem Namen (case-insensitiv). */
function findCollision(units: readonly RegistryEntry[], name: string): RegistryEntry | undefined {
  const key = name.toLowerCase()
  return units.find((entry) => entry.manifest.name.toLowerCase() === key)
}

/**
 * Scannt die Wurzeln und liefert die Registry.
 *
 * Wirft nicht: ein defektes `unit.json` wird zu einem Befund, alle anderen
 * Units bleiben nutzbar. Ein unlesbares Unit ist kein Grund, die ganze
 * Installation für unbrauchbar zu erklären.
 * Alle Units bleiben erhalten, auch mehrere Fassungen desselben Namens; die
 * *Auswahl* trifft {@link findUnit}.
 */
export async function scanRegistry(config: ScanRegistryConfig): Promise<Registry> {
  const roots = config.roots.map(toRoot)
  const maxDepth = config.maxDepth ?? 3
  const units: RegistryEntry[] = []
  const diagnostics: RegistryDiagnostic[] = []
  const rootReports: { label: string; path: string; exists: boolean }[] = []

  for (const root of roots) {
    const path = resolve(root.path)
    const label = root.label ?? path
    const exists = await isDirectory(path)
    rootReports.push({ label, path, exists })
    if (!exists) {
      diagnostics.push({
        ...unitError('registry_root_missing', 'Die Registry-Wurzel existiert nicht oder ist kein Verzeichnis.', label),
        directory: path,
        severity: 'error',
      })
      continue
    }

    for (const directory of await collectUnitDirectories(path, maxDepth)) {
      const result = await readManifest(directory)
      if (!result.ok) {
        for (const error of result.errors) diagnostics.push({ ...error, directory, severity: 'error' })
        continue
      }
      const manifest = result.value
      // Warnungen sind Befunde ohne Wirkung auf die Installation — ein
      // abweichender Ordnername etwa. Sie sollen sichtbar sein, aber nicht
      // als Fehler gelesen werden, und sie nehmen das Unit nicht aus dem Bestand.
      for (const warning of result.warnings) diagnostics.push({ ...warning, directory, severity: 'warning' })
      const provenance = await readProvenance(directory)
      const colliding = findCollision(units, manifest.name)
      units.push({
        manifest,
        rootLabel: label,
        rootPath: path,
        directory,
        ...(provenance === undefined ? {} : { provenance }),
      })

      // Namenskollision sofort melden: die Auswahl in findUnit würde sonst
      // still eine der beiden Fassungen verwerfen.
      if (colliding !== undefined) {
        const exact = colliding.manifest.name === manifest.name
        diagnostics.push({
          ...unitError(
            exact ? 'registry_duplicate_name' : 'registry_duplicate_name_case',
            exact
              ? `"${manifest.name}" ist in dieser Wurzel mehrfach installiert (${colliding.directory} und ${directory}).`
              : `"${manifest.name}" und "${colliding.manifest.name}" unterscheiden sich nur in der Groß-/Kleinschreibung; auf Windows ist das derselbe Ordner.`,
            directory,
          ),
          directory,
          severity: 'error',
        })
      }
    }
  }

  units.sort((a, b) =>
    byName(a.rootLabel, b.rootLabel)
    || byName(a.manifest.name, b.manifest.name)
    || compareVersions(b.manifest.version, a.manifest.version)
    || byName(a.directory, b.directory))

  diagnostics.sort((a, b) =>
    byName(a.code, b.code)
    || byName(a.directory, b.directory)
    || byName(a.at ?? '', b.at ?? ''))

  return {
    roots: rootReports,
    ...(config.host === undefined ? {} : { host: config.host }),
    units,
    diagnostics,
  }
}

/** Wie ein Name in der Registry gefunden wird. */
export interface FindOptions {
  /** Version oder Spanne; ohne Angabe gewinnt die höchste Version. */
  readonly version?: string
}

/**
 * Sucht ein Unit nach Namen.
 *
 * Mehrere Wurzeln dürfen dasselbe Unit in verschiedenen Versionen führen —
 * das ist der Sinn mehrerer Wurzeln. Die Auswahl ist deshalb festgelegt und
 * nicht zufällig: erst die Wurzelreihenfolge, dann die höchste passende
 * Version, dann der Pfad.
 */
export function findUnit(registry: Registry, name: string, options: FindOptions = {}): RegistryEntry | undefined {
  return pickPreferred(registry, registry.units.filter((entry) =>
    entry.manifest.name.toLowerCase() === name.toLowerCase()
    && (options.version === undefined || satisfiesContract(entry.manifest.version, options.version))))
}

/**
 * Wählt aus mehreren Kandidaten desselben Namens den bevorzugten.
 *
 * Die Reihenfolge der Wurzeln ist die Priorität, danach die höchste Version,
 * danach der Pfad. Die Funktion ist absichtlich total: sie liefert für eine
 * nicht-leere Liste immer genau ein Ergebnis.
 */
function pickPreferred(registry: Registry, candidates: readonly RegistryEntry[]): RegistryEntry | undefined {
  if (candidates.length === 0) return undefined
  const order = new Map(registry.roots.map((root, index) => [root.label, index]))
  const rank = (entry: RegistryEntry): number => order.get(entry.rootLabel) ?? Number.MAX_SAFE_INTEGER
  let best = candidates[0] as RegistryEntry
  for (const candidate of candidates) {
    const comparison = rank(candidate) - rank(best)
      || compareVersions(candidate.manifest.version, best.manifest.version)
      || byName(best.directory, candidate.directory)
    if (comparison < 0) best = candidate
  }
  return best
}

/** Alle Fassungen eines Namens, stabil sortiert. */
export function findAllVersions(registry: Registry, name: string): readonly RegistryEntry[] {
  return registry.units.filter((entry) => entry.manifest.name.toLowerCase() === name.toLowerCase())
}

/**
 * Löst die transitiven Abhängigkeiten eines Units auf.
 *
 * Tiefensuche mit Namenssortierung je Ebene (deterministisch), Zyklusprüfung
 * über den Pfadstapel. Fehlende Units landen in `missing` und brechen die
 * Auflösung **nicht** ab — ein Bericht ist nützlicher als ein Wurf.
 */
export function resolveDependencies(registry: Registry, name: string): DependencyResolution {
  const order: DependencyNode[] = []
  const missing: DependencyNode[] = []
  const requiredBy = new Map<string, Set<string>>()
  const depthOf = new Map<string, number>()
  const visited = new Set<string>()
  let cycle: readonly string[] | undefined

  const rootEntry = findUnit(registry, name)
  const rootName = rootEntry?.manifest.name ?? name
  order.push({
    name: rootName,
    depth: 0,
    requiredBy: [],
    ...(rootEntry === undefined ? {} : { version: rootEntry.manifest.version }),
  })
  visited.add(rootName.toLowerCase())
  depthOf.set(rootName.toLowerCase(), 0)

  const walk = (entry: RegistryEntry, entryDepth: number, stack: readonly string[]): void => {
    const requires = [...entry.manifest.requires].sort((a, b) => byName(a, b))
    for (const required of requires) {
      const key = required.toLowerCase()
      const parents = requiredBy.get(key) ?? new Set<string>()
      parents.add(entry.manifest.name)
      requiredBy.set(key, parents)

      if (stack.some((element) => element.toLowerCase() === key)) {
        cycle ??= [...stack, required]
        continue
      }
      const depth = entryDepth + 1
      if (visited.has(key)) {
        const known = depthOf.get(key) ?? 0
        if (depth > known) {
          depthOf.set(key, depth)
          const index = order.findIndex((node) => node.name.toLowerCase() === key)
          const node = order[index]
          if (index >= 0 && node !== undefined) order[index] = { ...node, depth }
        }
        continue
      }

      const dependency = findUnit(registry, required)
      visited.add(key)
      depthOf.set(key, depth)
      if (dependency === undefined) {
        missing.push({ name: required, depth, requiredBy: [entry.manifest.name] })
        continue
      }
      order.push({
        name: dependency.manifest.name,
        depth,
        requiredBy: [entry.manifest.name],
        version: dependency.manifest.version,
      })
      walk(dependency, depth, [...stack, dependency.manifest.name])
    }
  }

  if (rootEntry !== undefined) walk(rootEntry, 0, [rootName])

  // `requiredBy` ist erst nach dem Durchlauf vollständig: jetzt sortiert einsetzen.
  const complete = order
    .map((node) => ({
      ...node,
      requiredBy: [...(requiredBy.get(node.name.toLowerCase()) ?? new Set<string>())].sort((a, b) => byName(a, b)),
    }))
    .sort((a, b) => a.depth - b.depth || byName(a.name, b.name))

  return {
    root: rootName,
    order: complete,
    missing: [...missing].sort((a, b) => a.depth - b.depth || byName(a.name, b.name)),
    ...(cycle === undefined ? {} : { cycle }),
  }
}

/** Die Verträglichkeit eines Units mit dem Host. */
export function checkCompatibility(manifest: UnitManifest, host: HostContract): InstallabilityReason[] {
  const reasons: InstallabilityReason[] = []
  const range = manifest.contract ?? host.defaultContract

  if (range === undefined) {
    reasons.push({
      ...unitError(
        'registry_core_contract_unknown',
        `"${manifest.name}" deklariert keinen Core-Vertrag und der Host nennt keinen Default; die Verträglichkeit mit Core ${host.coreVersion} ist damit unbelegt.`,
        manifest.name,
      ),
      unit: manifest.name,
    })
  }
  else if (!isContractRange(range)) {
    reasons.push({
      ...unitError('unit_contract_range_invalid', `"contract" ist keine gültige Spanne: "${range}".`, manifest.name),
      unit: manifest.name,
    })
  }
  else if (!satisfiesContract(host.coreVersion, range)) {
    reasons.push({
      ...unitError(
        'registry_core_contract_incompatible',
        `"${manifest.name}" verlangt Core-Vertrag "${range}", der Host bietet "${host.coreVersion}".`,
        manifest.name,
        { required: range, host: host.coreVersion },
      ),
      unit: manifest.name,
    })
  }

  if (manifest.platforms.length > 0 && host.platform !== undefined && !manifest.platforms.includes(host.platform as UnitPlatform)) {
    reasons.push({
      ...unitError(
        'registry_platform_unsupported',
        `"${manifest.name}" läuft auf ${manifest.platforms.join(', ')}, der Host ist ${host.platform}.`,
        manifest.name,
      ),
      unit: manifest.name,
    })
  }

  if (host.runtimes !== undefined && !host.runtimes.includes(manifest.language)) {
    reasons.push({
      ...unitError(
        'registry_platform_unsupported',
        `"${manifest.name}" ist in ${manifest.language} geschrieben, der Host führt ${host.runtimes.join(', ')} aus.`,
        manifest.name,
        { language: manifest.language },
      ),
      unit: manifest.name,
    })
  }

  return reasons
}

/**
 * Beantwortet: „ist dieses Unit hier installierbar, und wenn nicht, warum genau?"
 *
 * Geprüft werden **alle** Gründe, nicht nur der erste — fehlende Abhängigkeit,
 * Vertragsbruch, Plattform, Fähigkeitskollision und Zyklus sind unabhängige
 * Aussagen über dasselbe Unit.
 */
export function planInstall(registry: Registry, name: string): Installability {
  const entry = findUnit(registry, name)
  if (entry === undefined) {
    return {
      unit: undefined,
      installable: false,
      reasons: [{
        ...unitError('registry_dependency_missing', `"${name}" ist in keiner Registry-Wurzel installiert.`, name),
        unit: name,
      }],
    }
  }

  const reasons: InstallabilityReason[] = []
  const resolution = resolveDependencies(registry, entry.manifest.name)
  for (const missing of resolution.missing) {
    reasons.push({
      ...unitError('registry_dependency_missing', `"${missing.name}" fehlt; gebraucht von ${missing.requiredBy.join(', ')}.`, missing.name),
      unit: missing.name,
    })
  }
  if (resolution.cycle !== undefined) {
    reasons.push({
      ...unitError('registry_dependency_cycle', `Abhängigkeitszyklus: ${resolution.cycle.join(' -> ')}.`, entry.manifest.name),
      unit: entry.manifest.name,
    })
  }
  if (registry.host !== undefined) {
    reasons.push(...checkCompatibility(entry.manifest, registry.host))
  }

  // Zwei Units mit derselben Fähigkeit: sichtbar machen, nicht verbieten.
  for (const provided of entry.manifest.provides) {
    const others = registry.units
      .filter((candidate) => candidate.manifest.name !== entry.manifest.name && candidate.manifest.provides.includes(provided))
      .map((candidate) => candidate.manifest.name)
      .sort((a, b) => byName(a, b))
    if (others.length > 0) {
      reasons.push({
        ...unitError(
          'registry_provides_collision',
          `"${provided}" wird auch von ${others.join(', ')} bereitgestellt.`,
          entry.manifest.name,
          { capability: provided },
        ),
        unit: entry.manifest.name,
      })
    }
  }

  return { unit: entry.manifest.name, installable: reasons.length === 0, reasons }
}

/** Nur die Units einer bestimmten Art, stabil sortiert. */
export function unitsOfKind(registry: Registry, kind: UnitKind): readonly RegistryEntry[] {
  return registry.units.filter((entry) => entry.manifest.kind === kind)
}