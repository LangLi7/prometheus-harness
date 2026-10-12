#!/usr/bin/env bun
/**
 * CLI des Unit-Exports — eine dünne Hülle über `src/index.ts`.
 *
 * Vier Kommandos, wörtlich so, wie die Entscheidung sie nennt
 * (`docs/decisions/hybrid-then-self-build.md` §3.2: „Export/Import über die
 * Harness-API — kein Kopieren von Ordnern von Hand"):
 *
 * ```
 * unit-export export  --unit <ordner>   --out <datei> [--root <pfad>]… [--include <pfad>]… [--created-at <iso>]
 * unit-export import  --bundle <datei>  --into <wurzel> [--force] [--core-version <v>] [--default-contract <spanne>]
 * unit-export inspect --bundle <datei>
 * unit-export list    --root <wurzel>  [--root <wurzel>]… [--detail] [--json]
 * ```
 *
 * Ausgabe ist Zeilenprotokoll auf stdout, Befunde auf stderr. Exit-Codes:
 * `0` Erfolg, `1` Befund (Validierung, Digest, Pfad, Konflikt), `2` Aufruffehler.
 */

import { resolve } from 'node:path'

import {
  UnitExportFailure,
  exportUnit,
  importBundle,
  inspectBundle,
  scanRegistry,
  type HostContract,
  type RegistryRoot,
} from './index.ts'

interface ParsedArgs {
  readonly command: string
  readonly flags: ReadonlyMap<string, readonly string[]>
  readonly positionals: readonly string[]
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command = '', ...rest] = argv
  const flags = new Map<string, string[]>()
  const positionals: string[] = []
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] ?? ''
    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }
    const equals = token.indexOf('=')
    if (equals > 2) {
      const key = token.slice(2, equals)
      flags.set(key, [...(flags.get(key) ?? []), token.slice(equals + 1)])
      continue
    }
    const key = token.slice(2)
    const next = rest[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(key, [...(flags.get(key) ?? []), next])
      index += 1
      continue
    }
    flags.set(key, [...(flags.get(key) ?? []), 'true'])
  }
  return { command, flags, positionals }
}

function flag(args: ParsedArgs, name: string): string | undefined {
  return args.flags.get(name)?.[0]
}

function has(args: ParsedArgs, name: string): boolean {
  return args.flags.has(name)
}

function all(args: ParsedArgs, name: string): readonly string[] {
  return args.flags.get(name) ?? []
}

function requireFlag(args: ParsedArgs, name: string): string {
  const value = flag(args, name)
  if (value === undefined || value.length === 0) {
    throw new UsageError(`--${name} fehlt`)
  }
  return value
}

class UsageError extends Error {}

function hostFrom(args: ParsedArgs): HostContract | undefined {
  const coreVersion = flag(args, 'core-version')
  if (coreVersion === undefined) return undefined
  const defaultContract = flag(args, 'default-contract')
  return {
    coreVersion,
    ...(defaultContract === undefined ? {} : { defaultContract }),
    platform: flag(args, 'platform') ?? process.platform,
  }
}

function rootsFrom(args: ParsedArgs, fallback: string): readonly RegistryRoot[] {
  const given = all(args, 'root')
  const list = given.length === 0 ? [fallback] : given
  return list.map((path, index) => ({ path, label: `root${index + 1}` }))
}

const USAGE = `unit-export — Units als Bündel ausgeben und annehmen

  export  --unit <ordner>  --out <datei> [--root <pfad>]… [--include <pfad>]… [--created-at <iso>]
  import  --bundle <datei> --into <wurzel> [--force] [--core-version <v>] [--default-contract <spanne>]
  inspect --bundle <datei>
  list    --root <wurzel> [--root <wurzel>]… [--detail] [--json]

Gemeinsame Flags:
  --core-version <v>        Version des Core-Vertrags, gegen die geprüft wird (z. B. 0.2.1)
  --default-contract <s>    Spanne für Units ohne eigenes "contract"; ohne Angabe wird
                            ein fehlender Vertrag als Befund gemeldet
  --platform <p>            Host-Plattform (Default: process.platform)

Exit-Codes: 0 Erfolg · 1 Befund · 2 Aufruffehler`

async function runExport(args: ParsedArgs): Promise<number> {
  const unit = resolve(requireFlag(args, 'unit'))
  const out = resolve(requireFlag(args, 'out'))
  const host = hostFrom(args)
  const createdAt = flag(args, 'created-at')
  const result = await exportUnit({
    unit,
    out,
    roots: rootsFrom(args, unit),
    ...(host === undefined ? {} : { host }),
    ...(createdAt === undefined ? {} : { createdAt }),
    include: all(args, 'include'),
  })
  console.log(`unit      ${result.unit} ${result.version}`)
  console.log(`bundle    ${result.out}`)
  console.log(`digest    ${result.digest}`)
  console.log(`content   ${result.contentDigest}`)
  console.log(`closure   ${result.closure.join(', ')}`)
  console.log(`files     ${result.files} (${result.bytes} Bytes)`)
  return 0
}

async function runImport(args: ParsedArgs): Promise<number> {
  const bundle = resolve(requireFlag(args, 'bundle'))
  const into = resolve(requireFlag(args, 'into'))
  const host = hostFrom(args)
  const installedAt = flag(args, 'installed-at')
  const result = await importBundle({
    bundle,
    into,
    ifExists: has(args, 'force') ? 'overwrite' : 'fail',
    ...(host === undefined ? {} : { host }),
    ...(installedAt === undefined ? {} : { installedAt }),
    source: { path: bundle },
  })
  console.log(`bundle    ${result.digest}`)
  console.log(`into      ${result.into}`)
  for (const unit of result.installed) {
    console.log(`installed ${unit.name} ${unit.version} -> ${unit.directory} (${unit.files} Dateien)`)
  }
  console.log(`rolled    ${result.rolledBack ? 'ja' : 'nein'}`)
  return 0
}

async function runInspect(args: ParsedArgs): Promise<number> {
  const bundle = resolve(requireFlag(args, 'bundle'))
  const result = await inspectBundle(bundle)
  console.log(`bundle    ${result.path}`)
  console.log(`format    ${result.format}`)
  console.log(`created   ${result.createdAt} von ${result.createdBy}`)
  console.log(`source    ${result.source.unit} ${result.source.version}`)
  console.log(`entry     ${result.entrypoint}`)
  console.log(`digest    ${result.digest}`)
  console.log(`computed  ${result.computedDigest}`)
  console.log(`content   ${result.contentDigest}`)
  console.log(`verified  ${result.digestVerified ? 'ja' : 'NEIN'}`)
  console.log(`units     ${result.units.map((unit) => `${unit.name}@${unit.version} (${unit.kind})`).join(', ')}`)
  console.log(`files     ${result.files.length} (${result.bytes} Bytes, Nutzlast ${result.payloadBytes})`)
  for (const file of result.files) {
    console.log(`  ${file.unit}/${file.path}  ${file.size} B  ${file.sha256.slice(0, 12)}…`)
  }
  return result.digestVerified ? 0 : 1
}

async function runList(args: ParsedArgs): Promise<number> {
  const roots = rootsFrom(args, '.')
  const host = hostFrom(args)
  const registry = await scanRegistry({ roots, ...(host === undefined ? {} : { host }) })

  if (has(args, 'json')) {
    console.log(JSON.stringify({
      roots: registry.roots,
      units: registry.units.map((entry) => ({
        name: entry.manifest.name,
        version: entry.manifest.version,
        kind: entry.manifest.kind,
        language: entry.manifest.language,
        core: entry.manifest.core,
        contract: entry.manifest.contract ?? null,
        requires: entry.manifest.requires,
        provides: entry.manifest.provides,
        directory: entry.directory,
        provenance: entry.provenance ?? null,
      })),
      diagnostics: registry.diagnostics,
    }, null, 2))
  }
  else {
    if (registry.units.length === 0) console.log('keine Units gefunden')
    for (const entry of registry.units) {
      const provenance = entry.provenance === undefined ? '' : `  herkunft ${entry.provenance.digest}`
      console.log(`${entry.manifest.name} ${entry.manifest.version}  ${entry.manifest.kind}/${entry.manifest.language}  ${entry.manifest.core}  ${entry.directory}${provenance}`)
      if (has(args, 'detail')) {
        console.log(`    beschreibung  ${entry.manifest.description}`)
        console.log(`    requires      ${entry.manifest.requires.length === 0 ? '—' : entry.manifest.requires.join(', ')}`)
        console.log(`    provides      ${entry.manifest.provides.length === 0 ? '—' : entry.manifest.provides.join(', ')}`)
        console.log(`    contract      ${entry.manifest.contract ?? '(Host-Default)'}`)
        if (entry.provenance !== undefined) {
          console.log(`    installiert   ${entry.provenance.installedAt} aus ${entry.provenance.sourceName ?? '?'} ${entry.provenance.sourceVersion ?? ''}`)
        }
      }
    }
  }

  for (const diagnostic of registry.diagnostics) {
    console.error(`${diagnostic.severity === 'warning' ? 'warnung  ' : 'befund   '} [${diagnostic.code}] ${diagnostic.directory}: ${diagnostic.message}`)
  }
  // Warnungen sind sichtbar, aber kein Fehlschlag: sie sagen etwas über den
  // Ablageort, nicht über die Nutzbarkeit.
  return registry.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 1 : 0
}

async function main(): Promise<number> {
  const args = parseArgs(Bun.argv.slice(2))
  switch (args.command) {
    case 'export': return await runExport(args)
    case 'import': return await runImport(args)
    case 'inspect': return await runInspect(args)
    case 'list': return await runList(args)
    case 'help':
    case '--help':
    case '-h':
    case '': {
      console.log(USAGE)
      return args.command === '' ? 2 : 0
    }
    default: {
      console.error(`unbekanntes Kommando "${args.command}"`)
      console.error(USAGE)
      return 2
    }
  }
}

try {
  process.exitCode = await main()
}
catch (error) {
  if (error instanceof UsageError) {
    console.error(`Aufruffehler: ${error.message}`)
    console.error(USAGE)
    process.exitCode = 2
  }
  else if (error instanceof UnitExportFailure) {
    console.error(`Befund: ${error.message}`)
    process.exitCode = 1
  }
  else {
    console.error(`Fehler: ${(error as Error).message}`)
    process.exitCode = 1
  }
}
