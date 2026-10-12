/**
 * Export, Import, Inspection und Installationsplan — die Oberflächen, die die
 * Harness selbst aufruft.
 *
 * Beide Richtungen folgen demselben Gedanken: **erst prüfen, dann schreiben.**
 * Ein Import schreibt in einen Nebenordner der Zielwurzel, rechnet dort alles
 * nach und schiebt erst dann um; scheitert ein Schritt, laufen die erledigten
 * Schritte rückwärts und die vorherige Fassung wird zurückgeschoben. Ein halb
 * installiertes Unit darf es nicht geben.
 */

import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import {
  buildBundle,
  loadBundleFile,
  planExtract,
  writeBundleFile,
  type BundleFile,
  type BundleManifest,
  type BundleUnit,
  type BuildBundleOptions,
} from './bundle.ts'
import { unitError, type UnitError } from './errors.ts'
import { directoryNameFor, readManifest, type UnitManifest } from './manifest.ts'
import {
  PROVENANCE_FILE,
  checkCompatibility,
  findUnit,
  planInstall,
  resolveDependencies,
  scanRegistry,
  type HostContract,
  type Installability,
  type Registry,
  type RegistryEntry,
  type RegistryRoot,
} from './registry.ts'

/** Ein Fehler mit mehreren Befunden; die Kurzform für Aufrufer, die nicht selbst berichten. */
export class UnitExportFailure extends Error {
  readonly errors: readonly UnitError[]

  constructor(message: string, errors: readonly UnitError[]) {
    super(errors.length === 0
      ? message
      : `${message}\n${errors.map((entry, index) => `  ${index + 1}. [${entry.code}] ${entry.at === undefined ? '' : `${entry.at}: `}${entry.message}`).join('\n')}`)
    this.name = 'UnitExportFailure'
    this.errors = errors
  }
}

/** Was ein Export zurückgibt. */
export interface ExportResult {
  readonly unit: string
  readonly version: string
  readonly out: string
  /** Bündeldigest über Manifest und Nutzlast. */
  readonly digest: string
  /** Inhaltsdigest ohne Zeitstempel — die Vergleichsgröße. */
  readonly contentDigest: string
  /** Alle Units im Bündel, das Quell-Unit zuerst. */
  readonly closure: readonly string[]
  readonly files: number
  readonly bytes: number
  readonly bundle: BundleManifest
}

/** Was `inspect` zurückgibt. */
export interface InspectResult {
  readonly path: string
  readonly format: number
  readonly createdAt: string
  readonly createdBy: string
  readonly entrypoint: string
  readonly source: { readonly unit: string; readonly version: string }
  readonly digest: string
  readonly computedDigest: string
  /** `true`, wenn der eingebettete Digest zu den Bytes passt. */
  readonly digestVerified: boolean
  readonly contentDigest: string
  readonly units: readonly BundleUnit[]
  readonly files: readonly BundleFile[]
  readonly bytes: number
  readonly payloadBytes: number
}

/** Ein Befund beim Import oder in einem Installationsplan. */
export interface ImportFailure extends UnitError {
  readonly unit?: string
}

/** Was ein Import zurückgibt. */
export interface ImportResult {
  readonly digest: string
  readonly contentDigest: string
  readonly into: string
  readonly installed: readonly {
    readonly name: string
    readonly version: string
    readonly directory: string
    readonly files: number
  }[]
  /** `true`, wenn nichts geschrieben wurde. */
  readonly rolledBack: boolean
}

/** Was `planInstall` für ein Bündel zurückgibt. */
export interface BundleInstallPlan {
  readonly path: string
  readonly digest: string
  readonly unit: { readonly name: string; readonly version: string; readonly kind: string }
  readonly into: string
  readonly installable: boolean
  readonly alreadyInstalled: readonly string[]
  readonly wouldWrite: readonly string[]
  readonly reasons: readonly ImportFailure[]
}

/** Optionen für {@link exportUnit}. */
export interface ExportUnitRequest {
  /** Der Unit-Ordner. */
  readonly unit: string
  /** Zieldatei des Bündels. */
  readonly out: string
  /** Wurzeln, in denen Abhängigkeiten gesucht werden; Default: der Unit-Ordner. */
  readonly roots?: readonly (string | RegistryRoot)[]
  readonly host?: HostContract
  /** Prüft die Verträglichkeit gegen `host`. Default: `true`, wenn `host` gesetzt ist. */
  readonly checkHost?: boolean
  /** Zeitstempel des Bündels; fest setzbar für reproduzierbare Läufe. */
  readonly createdAt?: string
  readonly createdBy?: string
  /** Zusätzlich aufzunehmende Dateien, relativ zum Unit-Ordner. */
  readonly include?: readonly string[]
}

/** Woher ein Bündel kam — wandert in die Herkunftsdatei des installierten Units. */
export interface BundleSource {
  readonly path?: string
}

/** Optionen für {@link importBundle}. */
export interface ImportBundleRequest {
  /** Die Bündeldatei. */
  readonly bundle: string
  /** Zielwurzel, unter der die Units als Ordner landen. */
  readonly into: string
  /** `fail` (Default) oder `overwrite`. */
  readonly ifExists?: 'fail' | 'overwrite'
  readonly host?: HostContract
  /** Zeitstempel der Installation; fest setzbar für reproduzierbare Läufe. */
  readonly installedAt?: string
  /** Herkunft, etwa die Bezugsquelle des Bündels. */
  readonly source?: BundleSource
}

/** Optionen für {@link scanRegistry}. */
export interface ScanRegistryRequest {
  readonly roots: readonly (string | RegistryRoot)[]
  readonly host?: HostContract
  readonly maxDepth?: number
}

/** Erzeugt einen eindeutigen Nebenordner für einen Import. */
async function makeStageDirectory(targetRoot: string): Promise<string> {
  await mkdir(targetRoot, { recursive: true })
  return await mkdtemp(join(targetRoot, '.pmh-import-'))
}

async function removeQuietly(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true }).catch(() => undefined)
}

/**
 * Verschiebt `from` nach `to`; fällt auf Kopieren zurück.
 *
 * `rename` scheitert über Dateisystemgrenzen hinweg mit `EXDEV` — genau der
 * Fall, in dem ein Bündel aus einem Cache auf ein anderes Laufwerk installiert
 * wird. Unter Windows kann zusätzlich ein Virenscanner das Umbenennen kurz
 * sperren (`EPERM`/`EACCES`); dann wird kopiert und die Quelle gelöscht.
 */
async function movePath(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
    return
  }
  catch (error) {
    const code = (error as { code?: string }).code
    if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'EACCES') throw error
  }
  await cp(from, to, { recursive: true, force: true })
  await removeQuietly(from)
}

/**
 * Gibt ein Unit als **eine** weitergebbare Datei aus.
 *
 * Das Unit und sein aufgelöster Abhängigkeitsabschluss landen in einem Bündel.
 * Eine fehlende Abhängigkeit ist ein Befund, kein stiller Teil-Export: ein
 * Bündel, das sich nicht installieren lässt, ist die schlechtere Antwort.
 */
export async function exportUnit(request: ExportUnitRequest): Promise<ExportResult> {
  const directory = resolve(request.unit)
  const manifestResult = await readManifest(directory)
  if (!manifestResult.ok) {
    throw new UnitExportFailure(`Unit in "${directory}" ist nicht gültig`, manifestResult.errors)
  }
  const manifest = manifestResult.value

  const roots = request.roots ?? [directory]
  const registry = await scanRegistry({ roots, ...(request.host === undefined ? {} : { host: request.host }) })

  if (request.host !== undefined && request.checkHost !== false) {
    const reasons = checkCompatibility(manifest, request.host)
    if (reasons.length > 0) {
      throw new UnitExportFailure(`"${manifest.name}" ist mit diesem Host nicht verträglich`, reasons)
    }
  }

  const resolution = resolveDependencies(registry, manifest.name)
  if (resolution.missing.length > 0) {
    throw new UnitExportFailure(
      `"${manifest.name}" hat unaufgelöste Abhängigkeiten`,
      resolution.missing.map((node) => unitError(
        'registry_dependency_missing',
        `"${node.name}", gebraucht von ${node.requiredBy.join(', ')}, fehlt in den Wurzeln ${roots.map((root) => typeof root === 'string' ? root : root.path).join(', ')}.`,
      )),
    )
  }

  const dependencies: { manifest: UnitManifest; directory: string }[] = []
  for (const node of resolution.order) {
    if (node.depth === 0) continue
    const found = findUnit(registry, node.name)
    if (found === undefined) continue
    dependencies.push({ manifest: found.manifest, directory: found.directory })
  }

  const buildOptions: BuildBundleOptions = {
    ...(request.createdAt === undefined ? {} : { createdAt: request.createdAt }),
    ...(request.createdBy === undefined ? {} : { createdBy: request.createdBy }),
    ...(request.include === undefined ? {} : { include: request.include }),
  }
  const built = await buildBundle(manifest, directory, dependencies, buildOptions)
  const written = await writeBundleFile(request.out, built)

  return {
    unit: manifest.name,
    version: manifest.version,
    out: resolve(request.out),
    digest: built.manifest.digest,
    contentDigest: built.manifest.contentDigest,
    closure: built.manifest.closure,
    files: built.manifest.files.length,
    bytes: written.bytes,
    bundle: built.manifest,
  }
}

/**
 * Prüft ein Bündel und berichtet, ohne etwas zu schreiben.
 *
 * Wirft nicht, wenn das Bündel inhaltlich falsch ist — ein defektes Bündel ist
 * ein Bericht mit Befunden. Nur so kann eine Oberfläche alle Gründe auf einmal
 * zeigen, statt einen nach dem anderen.
 */
export async function inspectBundle(path: string): Promise<InspectResult> {
  const check = await loadBundleFile(path)
  if (!check.ok || check.bundle === undefined) {
    throw new UnitExportFailure(`Bündel "${resolve(path)}" ist nicht lesbar`, check.errors)
  }
  const loaded = check.bundle
  const manifest = loaded.manifest
  return {
    path: resolve(path),
    format: manifest.format,
    createdAt: manifest.createdAt,
    createdBy: manifest.createdBy,
    entrypoint: manifest.entrypoint,
    source: { unit: manifest.source.unit, version: manifest.source.version },
    digest: manifest.digest,
    computedDigest: loaded.computedDigest,
    digestVerified: manifest.digest === loaded.computedDigest,
    contentDigest: manifest.contentDigest,
    units: manifest.units,
    files: manifest.files,
    bytes: (await stat(resolve(path))).size,
    payloadBytes: manifest.payloadBytes,
  }
}

/** Ein einzelner Schritt, der rückgängig gemacht werden kann. */
interface JournalEntry {
  undo(): Promise<void>
}

/**
 * Installiert ein Bündel — oder nichts.
 *
 * Ablauf: prüfen (Format, Digest, Hashes, Pfade, Vertrag), in einen
 * Nebenordner der Zielwurzel schreiben, dort erneut Hash für Hash nachrechnen,
 * Herkunft schreiben, erst dann je Unit umschieben und die vorherige Fassung
 * als Sicherung behalten. Scheitert ein Schritt, laufen alle erledigten
 * Schritte rückwärts und die Sicherung wandert zurück.
 */
export async function importBundle(request: ImportBundleRequest): Promise<ImportResult> {
  const targetRoot = resolve(request.into)
  const check = await loadBundleFile(request.bundle)
  if (!check.ok || check.bundle === undefined) {
    throw new UnitExportFailure(`Bündel "${resolve(request.bundle)}" ist nicht lesbar`, check.errors)
  }
  const loaded = check.bundle
  const manifest = loaded.manifest

  const reasons: ImportFailure[] = []
  if (request.host !== undefined) {
    for (const unit of manifest.units) {
      for (const reason of checkCompatibility(unit.manifest, request.host)) reasons.push(reason)
    }
  }
  if (!manifest.units.some((unit) => unit.name.toLowerCase() === manifest.source.unit.toLowerCase())) {
    reasons.push(unitError('bundle_source_manifest_invalid', `Das Quell-Unit "${manifest.source.unit}" steht nicht im Bündel.`, 'bundle:source'))
  }
  if (reasons.length > 0) throw new UnitExportFailure('Bündel ist mit diesem Host nicht installierbar', reasons)

  const plan = planExtract(loaded, targetRoot)
  if (!plan.ok) throw new UnitExportFailure('Bündel enthält unsichere Pfade', plan.errors)

  // Vorhandene Fassungen nur mit `overwrite`.
  const overwrite = request.ifExists === 'overwrite'
  const conflicts: ImportFailure[] = []
  for (const unit of manifest.units) {
    const directory = join(targetRoot, directoryNameFor(unit.name))
    try {
      const info = await stat(directory)
      if (!info.isDirectory()) {
        conflicts.push(unitError('install_target_not_directory', `"${directory}" ist kein Verzeichnis.`, unit.name))
        continue
      }
      if (!overwrite) {
        conflicts.push(unitError('install_target_exists', `"${unit.name}" ist unter "${targetRoot}" schon installiert; "overwrite" nötig.`, unit.name))
      }
    }
    catch {
      continue
    }
  }
  if (conflicts.length > 0) throw new UnitExportFailure('Zielordner steht im Weg', conflicts)

  await mkdir(targetRoot, { recursive: true })
  const stageRoot = await makeStageDirectory(targetRoot)
  const stageRootPath = join(stageRoot, 'staged')
  const journal: JournalEntry[] = []

  try {
    // 1. Alles in den Nebenordner schreiben.
    for (const item of plan.plan) {
      const stagedPath = join(stageRootPath, directoryNameFor(item.unit), item.path)
      await mkdir(dirname(stagedPath), { recursive: true })
      await writeFile(stagedPath, item.bytes)
    }

    // 2. Dort nachrechnen, was im Bündel steht.
    const stagedErrors = await verifyStaged(stageRootPath, manifest.units, manifest.files)
    if (stagedErrors.length > 0) {
      throw new UnitExportFailure('Die geschriebenen Dateien stimmen nicht mit dem Bündel überein', stagedErrors)
    }

    // 3. Herkunft je Unit schreiben. Sie steht bewusst nicht im Bündel: so ist
    //    ein Re-Export byte-gleich, und die Herkunft beschreibt nur die hiesige Installation.
    const installedAt = request.installedAt ?? new Date().toISOString()
    for (const unit of manifest.units) {
      const provenance = {
        format: manifest.format,
        bundleDigest: manifest.digest,
        contentDigest: manifest.contentDigest,
        source: {
          unit: manifest.source.unit,
          version: manifest.source.version,
          ...(request.source?.path === undefined ? {} : { path: request.source.path }),
        },
        createdBy: manifest.createdBy,
        installedAt,
      }
      await writeFile(
        join(stageRootPath, directoryNameFor(unit.name), PROVENANCE_FILE),
        `${JSON.stringify(provenance, null, 2)}\n`,
        'utf8',
      )
    }

    // 4. Erst jetzt umschieben, mit Rückweg für jeden Schritt.
    const installed: { name: string; version: string; directory: string; files: number }[] = []
    for (const unit of manifest.units) {
      const from = join(stageRootPath, directoryNameFor(unit.name))
      const to = join(targetRoot, directoryNameFor(unit.name))
      let backup: string | undefined
      try {
        if ((await stat(to)).isDirectory()) {
          backup = `${to}.pmh-backup-${Date.now().toString(36)}`
          await movePath(to, backup)
        }
      }
      catch {
        backup = undefined
      }
      if (backup !== undefined) {
        const restore = backup
        journal.push({ undo: async () => { await movePath(restore, to) } })
      }
      await movePath(from, to)
      journal.push({ undo: async () => { await removeQuietly(to) } })
      installed.push({
        name: unit.name,
        version: unit.version,
        directory: to,
        files: manifest.files.filter((file) => file.unit === unit.name).length,
      })
    }

    // 5. Erfolg: Sicherungen entfernen.
    for (const backupDirectory of await listBackups(targetRoot)) {
      await removeQuietly(backupDirectory)
    }

    return {
      digest: manifest.digest,
      contentDigest: manifest.contentDigest,
      into: targetRoot,
      installed,
      rolledBack: false,
    }
  }
  catch (error) {
    // Rückwärts laufen lassen; ein misslungener Rückweg darf den Bericht nicht verdecken.
    for (const step of [...journal].reverse()) {
      await step.undo().catch(() => undefined)
    }
    if (error instanceof UnitExportFailure) {
      throw new UnitExportFailure(`${error.message}\nRückweg ausgeführt: es wurde nichts halb installiert.`, error.errors)
    }
    throw error
  }
  finally {
    await removeQuietly(stageRoot)
  }
}

async function listBackups(targetRoot: string): Promise<string[]> {
  try {
    return (await readdir(targetRoot))
      .filter((name) => name.includes('.pmh-backup-'))
      .map((name) => join(targetRoot, name))
  }
  catch {
    return []
  }
}

/**
 * Rechnet die geschriebenen Dateien gegen das Bündel nach.
 *
 * Das ist die zweite Prüfung derselben Sache: das Bündel beschreibt Hashes,
 * der Import hat Bytes geschrieben. Zwischen beiden liegt das Dateisystem —
 * und genau dort kann etwas schiefgehen (voller Datenträger, abgebrochene
 * Schreibung). Die Prüfung ist der Grund, warum der Import „fail closed" ist.
 */
async function verifyStaged(
  stageRoot: string,
  units: readonly BundleUnit[],
  files: readonly BundleFile[],
): Promise<UnitError[]> {
  const errors: UnitError[] = []
  for (const unit of units) {
    const directory = join(stageRoot, directoryNameFor(unit.name))
    const readBack = await readManifest(directory)
    if (!readBack.ok) {
      for (const error of readBack.errors) errors.push({ ...error, at: `stage:${unit.name}` })
      continue
    }
    if (readBack.value.name !== unit.name) {
      errors.push(unitError('install_manifest_name_mismatch', `In "${directoryNameFor(unit.name)}" steht "${readBack.value.name}".`, `stage:${unit.name}`))
    }
    if (readBack.value.version !== unit.version) {
      errors.push(unitError('install_manifest_name_mismatch', `In "${directoryNameFor(unit.name)}" steht Version "${readBack.value.version}" statt "${unit.version}".`, `stage:${unit.name}`))
    }
  }
  for (const file of files) {
    const path = join(stageRoot, directoryNameFor(file.unit), file.path)
    try {
      const bytes = await readFile(path)
      const actual = createHash('sha256').update(bytes).digest('hex')
      if (actual !== file.sha256) {
        errors.push(unitError('bundle_file_digest_mismatch', `"${file.unit}/${file.path}" hat nach dem Schreiben ${actual}, im Bündel steht ${file.sha256}.`, `stage:${file.unit}`))
      }
    }
    catch (error) {
      errors.push(unitError('bundle_missing', `"${file.unit}/${file.path}" fehlt nach dem Schreiben: ${(error as Error).message}`, `stage:${file.unit}`))
    }
  }
  return errors
}

/** Prüft ein Bündel gegen einen Zielordner, ohne zu schreiben. */
export async function planBundleInstall(
  request: { readonly bundle: string; readonly into: string; readonly host?: HostContract },
): Promise<BundleInstallPlan> {
  const targetRoot = resolve(request.into)
  const check = await loadBundleFile(request.bundle)
  if (!check.ok || check.bundle === undefined) {
    throw new UnitExportFailure(`Bündel "${resolve(request.bundle)}" ist nicht lesbar`, check.errors)
  }
  const manifest = check.bundle.manifest
  const reasons: ImportFailure[] = []
  const alreadyInstalled: string[] = []

  const source = manifest.units.find((unit) => unit.name.toLowerCase() === manifest.source.unit.toLowerCase())
  if (source === undefined) {
    reasons.push(unitError('bundle_source_manifest_invalid', `Das Quell-Unit "${manifest.source.unit}" steht nicht im Bündel.`, 'bundle:source'))
  }
  if (request.host !== undefined) {
    for (const unit of manifest.units) {
      for (const reason of checkCompatibility(unit.manifest, request.host)) reasons.push(reason)
    }
  }

  const plan = planExtract(check.bundle, targetRoot)
  reasons.push(...plan.errors)

  for (const unit of manifest.units) {
    const directory = join(targetRoot, directoryNameFor(unit.name))
    try {
      if ((await stat(directory)).isDirectory()) alreadyInstalled.push(unit.name)
    }
    catch {
      continue
    }
  }

  return {
    path: resolve(request.bundle),
    digest: manifest.digest,
    unit: { name: manifest.source.unit, version: manifest.source.version, kind: source?.kind ?? 'unknown' },
    into: targetRoot,
    installable: reasons.length === 0,
    alreadyInstalled,
    wouldWrite: plan.plan.map((item) => item.absolute),
    reasons,
  }
}

/** Registriert installierte Units aus den konfigurierten Wurzeln. */
export async function listRegistry(request: ScanRegistryRequest): Promise<Registry> {
  return await scanRegistry(request)
}

/** Die Installierbarkeit eines **schon installierten** Units. */
export function planInstalledUnit(registry: Registry, name: string): Installability {
  return planInstall(registry, name)
}

/** Die Einträge eines Units, das schon installiert ist — mit Herkunft. */
export function installedEntry(registry: Registry, name: string): RegistryEntry | undefined {
  return findUnit(registry, name)
}
