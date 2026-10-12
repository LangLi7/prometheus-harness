/**
 * Testgerüst: baut Unit-Bäume in einem temporären Ordner.
 *
 * Die Vorlagen sind absichtlich klein, aber formatgenau — `unit.json` nach
 * `units/README.md`, `README.md` als Pflichtdatei, dazu Umsetzungsdateien.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Ein Unit, wie es im Test gebraucht wird. */
export interface FixtureUnit {
  readonly name: string
  readonly version?: string
  readonly kind?: string
  readonly language?: string
  readonly description?: string
  readonly core?: string
  readonly contract?: string
  readonly provides?: readonly string[]
  readonly requires?: readonly string[]
  readonly platforms?: readonly string[]
  readonly entry?: { readonly command: string; readonly args: readonly string[] }
  readonly notes?: readonly string[]
  /** Zusätzliche Dateien: relativer Pfad → Inhalt. */
  readonly files?: Readonly<Record<string, string>>
  /** Überschreibt den rohen Inhalt von `unit.json`. */
  readonly rawManifest?: string
  /** Ordner, in dem das Unit liegt; Default: `name` im Zielordner. */
  readonly directory?: string
}

/** Ein temporärer Wurzelordner, der am Ende wieder verschwindet. */
export interface TempRoot {
  readonly path: string
  child(...segments: readonly string[]): string
  cleanup(): Promise<void>
}

/** Legt einen temporären Ordner an. */
export async function tempRoot(prefix = 'pmh-unit-export-'): Promise<TempRoot> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  return {
    path,
    child: (...segments) => join(path, ...segments),
    cleanup: async () => { await rm(path, { recursive: true, force: true }).catch(() => undefined) },
  }
}

/** Schreibt ein Unit als Ordner. */
export async function writeUnit(root: string, unit: FixtureUnit): Promise<string> {
  const directory = join(root, unit.directory ?? unit.name)
  await mkdir(directory, { recursive: true })

  const manifest = unit.rawManifest ?? `${JSON.stringify({
    name: unit.name,
    version: unit.version ?? '0.1.0',
    kind: unit.kind ?? 'plugin',
    language: unit.language ?? 'typescript',
    description: unit.description ?? `Testunit ${unit.name}`,
    ...(unit.entry === undefined ? {} : { entry: { command: unit.entry.command, args: [...unit.entry.args] } }),
    core: unit.core ?? 'required_core',
    ...(unit.contract === undefined ? {} : { contract: unit.contract }),
    provides: [...(unit.provides ?? [])],
    requires: [...(unit.requires ?? [])],
    platforms: [...(unit.platforms ?? [])],
    ...(unit.notes === undefined ? {} : { notes: [...unit.notes] }),
  }, null, 2)}\n`
  await writeFile(join(directory, 'unit.json'), manifest, 'utf8')
  await writeFile(join(directory, 'README.md'), `# ${unit.name}\n\nTestunit.\n`, 'utf8')
  await writeFile(join(directory, 'index.ts'), `export const name = '${unit.name}'\n`, 'utf8')
  await writeFile(join(directory, 'src.ts'), `// ${unit.name}\nexport const version = '${unit.version ?? '0.1.0'}'\n`, 'utf8')

  for (const [path, content] of Object.entries(unit.files ?? {})) {
    const absolute = join(directory, path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, content, 'utf8')
  }
  return directory
}

/**
 * Der Standardbestand für Tests: ein Plugin mit einer Abhängigkeit und einem
 * Service mit `entry`.
 */
export async function writeStandardTree(root: string): Promise<void> {
  await writeUnit(root, {
    name: 'pmh-test-base',
    version: '1.2.0',
    kind: 'plugin',
    provides: ['base-capability'],
    contract: '^0.2.0',
  })
  await writeUnit(root, {
    name: 'pmh-test-router',
    version: '2.0.1',
    kind: 'plugin',
    requires: ['pmh-test-base'],
    provides: ['model-routing'],
    contract: '^0.2.0',
    files: { 'src/router.ts': 'export const route = (x: string) => x\n' },
  })
  await writeUnit(root, {
    name: 'pmh-test-store',
    version: '0.3.0',
    kind: 'service',
    language: 'go',
    core: 'optional',
    contract: '^0.2.0',
    entry: { command: 'pmh-test-store', args: ['--config', 'store.yaml'] },
  })
}

/** Ein festgehaltener Zeitstempel, damit Bündel byte-gleich vergleichbar sind. */
export const FROZEN_TIMESTAMP = '2026-10-12T00:00:00.000Z'
