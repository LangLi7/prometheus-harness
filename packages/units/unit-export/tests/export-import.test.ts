/**
 * Export und Import über die Harness: Rundlauf, Fail-closed, Herkunft.
 *
 * Der Rundlauf ist der eigentliche Nachweis: ein Unit verlässt den Rechner als
 * **eine** Datei und kommt als Ordner zurück — ohne dass jemand von Hand
 * kopiert.
 */

import { describe, expect, test } from 'bun:test'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { encodeBundle, loadBundleFile } from '../src/bundle.ts'
import { importBundle, inspectBundle, listRegistry, planBundleInstall, UnitExportFailure, exportUnit } from '../src/operations.ts'
import { PROVENANCE_FILE, findUnit, planInstall, scanRegistry } from '../src/registry.ts'
import { FROZEN_TIMESTAMP, tempRoot, writeStandardTree, writeUnit } from './fixtures.ts'

const HOST = { coreVersion: '0.2.5', defaultContract: '^0.2.0' } as const

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch {
    return false
  }
}

describe('exportUnit', () => {
  test('gibt ein Unit mit seinem Abschluss als eine Datei aus', async () => {
    const root = await tempRoot()
    try {
      await writeStandardTree(root.path)
      const result = await exportUnit({
        unit: root.child('pmh-test-router'),
        out: root.child('router.pmhunit'),
        roots: [root.path],
        createdAt: FROZEN_TIMESTAMP,
      })
      expect(result.unit).toBe('pmh-test-router')
      expect(result.closure).toEqual(['pmh-test-router', 'pmh-test-base'])
      expect(result.files).toBeGreaterThan(3)
      expect(await exists(result.out)).toBe(true)

      const inspection = await inspectBundle(result.out)
      expect(inspection.digestVerified).toBe(true)
      expect(inspection.units.map((unit) => unit.name).sort()).toEqual(['pmh-test-base', 'pmh-test-router'])
      expect(inspection.digest).toBe(result.digest)
    }
    finally {
      await root.cleanup()
    }
  })

  test('bricht bei fehlender Abhängigkeit ab, statt ein halbes Bündel zu schreiben', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-einsam', requires: ['pmh-fehlt'] })
      const out = root.child('einsam.pmhunit')
      let failure: UnitExportFailure | undefined
      try {
        await exportUnit({ unit: root.child('pmh-einsam'), out, roots: [root.path] })
      }
      catch (error) {
        failure = error as UnitExportFailure
      }
      expect(failure?.errors.map((error) => error.code)).toContain('registry_dependency_missing')
      expect(await exists(out)).toBe(false)
    }
    finally {
      await root.cleanup()
    }
  })

  test('bricht bei unverträglichem Core-Vertrag ab', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-alt', contract: '^0.2.0' })
      let failure: UnitExportFailure | undefined
      try {
        await exportUnit({ unit: root.child('pmh-alt'), out: root.child('alt.pmhunit'), roots: [root.path], host: { coreVersion: '1.0.0' } })
      }
      catch (error) {
        failure = error as UnitExportFailure
      }
      expect(failure?.errors.map((error) => error.code)).toContain('registry_core_contract_incompatible')
    }
    finally {
      await root.cleanup()
    }
  })

  test('nimmt ein ungültiges Unit nicht an', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-kaputt', kind: 'binary' })
      let failure: UnitExportFailure | undefined
      try {
        await exportUnit({ unit: root.child('pmh-kaputt'), out: root.child('kaputt.pmhunit') })
      }
      catch (error) {
        failure = error as UnitExportFailure
      }
      expect(failure?.errors.map((error) => error.code)).toContain('unit_kind_unknown')
    }
    finally {
      await root.cleanup()
    }
  })
})

describe('inspectBundle', () => {
  test('berichtet Format, Quelle, Einstiegspunkt und Dateien', async () => {
    const root = await tempRoot()
    try {
      await writeStandardTree(root.path)
      const out = root.child('store.pmhunit')
      await exportUnit({ unit: root.child('pmh-test-store'), out, roots: [root.path], createdAt: FROZEN_TIMESTAMP })
      const result = await inspectBundle(out)
      expect(result.format).toBe(1)
      expect(result.source).toEqual({ unit: 'pmh-test-store', version: '0.3.0' })
      expect(result.entrypoint).toBe('pmh-test-store')
      expect(result.createdBy).toContain('unit-export')
      expect(result.digestVerified).toBe(true)
      expect(result.files.length).toBeGreaterThan(0)
    }
    finally {
      await root.cleanup()
    }
  })

  test('wirft bei einem defekten Bündel mit allen Befunden', async () => {
    const root = await tempRoot()
    try {
      await writeStandardTree(root.path)
      const out = root.child('store.pmhunit')
      await exportUnit({ unit: root.child('pmh-test-store'), out, roots: [root.path] })
      const bytes = await readFile(out)
      bytes[bytes.byteLength - 1] = (bytes[bytes.byteLength - 1] ?? 0) ^ 0x01
      await writeFile(out, bytes)
      let failure: UnitExportFailure | undefined
      try {
        await inspectBundle(out)
      }
      catch (error) {
        failure = error as UnitExportFailure
      }
      const codes = failure?.errors.map((error) => error.code) ?? []
      expect(codes).toContain('bundle_file_digest_mismatch')
      expect(codes).toContain('bundle_digest_mismatch')
    }
    finally {
      await root.cleanup()
    }
  })
})

describe('importBundle', () => {
  test('installiert ein Bündel in eine frische Wurzel und registriert es dort', async () => {
    const source = await tempRoot()
    const target = await tempRoot()
    try {
      await writeStandardTree(source.path)
      const out = source.child('router.pmhunit')
      const exported = await exportUnit({ unit: source.child('pmh-test-router'), out, roots: [source.path], createdAt: FROZEN_TIMESTAMP })

      const result = await importBundle({ bundle: out, into: target.path, installedAt: FROZEN_TIMESTAMP })
      expect(result.digest).toBe(exported.digest)
      expect(result.rolledBack).toBe(false)
      expect(result.installed.map((unit) => unit.name).sort()).toEqual(['pmh-test-base', 'pmh-test-router'])

      const registry = await listRegistry({ roots: [target.path], host: HOST })
      expect(registry.diagnostics).toEqual([])
      expect(registry.units.map((entry) => entry.manifest.name)).toEqual(['pmh-test-base', 'pmh-test-router'])
      expect(planInstall(registry, 'pmh-test-router').installable).toBe(true)
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })

  test('schreibt die Herkunft in das installierte Unit', async () => {
    const source = await tempRoot()
    const target = await tempRoot()
    try {
      await writeStandardTree(source.path)
      const out = source.child('store.pmhunit')
      const exported = await exportUnit({ unit: source.child('pmh-test-store'), out, roots: [source.path], createdAt: FROZEN_TIMESTAMP })
      await importBundle({ bundle: out, into: target.path, installedAt: FROZEN_TIMESTAMP, source: { path: out } })

      const provenance = JSON.parse(await readFile(join(target.path, 'pmh-test-store', PROVENANCE_FILE), 'utf8')) as Record<string, unknown>
      expect(provenance.bundleDigest).toBe(exported.digest)
      expect(provenance.installedAt).toBe(FROZEN_TIMESTAMP)
      expect((provenance.source as Record<string, unknown>).unit).toBe('pmh-test-store')
      expect((provenance.source as Record<string, unknown>).path).toBe(out)

      const registry = await scanRegistry({ roots: [target.path] })
      expect(findUnit(registry, 'pmh-test-store')?.provenance?.digest).toBe(exported.digest)
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })

  test('die Herkunftsdatei wandert nicht in ein neues Bündel', async () => {
    const source = await tempRoot()
    const target = await tempRoot()
    try {
      await writeStandardTree(source.path)
      const out = source.child('store.pmhunit')
      await exportUnit({ unit: source.child('pmh-test-store'), out, roots: [source.path], createdAt: FROZEN_TIMESTAMP })
      await importBundle({ bundle: out, into: target.path, installedAt: FROZEN_TIMESTAMP })

      const again = await exportUnit({
        unit: join(target.path, 'pmh-test-store'),
        out: target.child('wieder.pmhunit'),
        roots: [target.path],
        createdAt: FROZEN_TIMESTAMP,
      })
      expect(again.bundle.files.some((file) => file.path === PROVENANCE_FILE)).toBe(false)
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })

  test('verweigert die Installation, wenn der Zielordner belegt ist', async () => {
    const source = await tempRoot()
    const target = await tempRoot()
    try {
      await writeStandardTree(source.path)
      const out = source.child('store.pmhunit')
      await exportUnit({ unit: source.child('pmh-test-store'), out, roots: [source.path], createdAt: FROZEN_TIMESTAMP })
      await importBundle({ bundle: out, into: target.path, installedAt: FROZEN_TIMESTAMP })

      await writeFile(join(target.path, 'pmh-test-store', 'eigene-notiz.txt'), 'bleibt\n', 'utf8')

      let failure: UnitExportFailure | undefined
      try {
        await importBundle({ bundle: out, into: target.path, installedAt: FROZEN_TIMESTAMP })
      }
      catch (error) {
        failure = error as UnitExportFailure
      }
      expect(failure?.errors.map((error) => error.code)).toContain('install_target_exists')
      // Fail closed: die vorhandene Fassung ist unangetastet.
      expect(await readFile(join(target.path, 'pmh-test-store', 'eigene-notiz.txt'), 'utf8')).toBe('bleibt\n')
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })

  test('overwrite ersetzt die vorhandene Fassung und räumt die Sicherung weg', async () => {
    const source = await tempRoot()
    const target = await tempRoot()
    try {
      await writeStandardTree(source.path)
      const out = source.child('store.pmhunit')
      await exportUnit({ unit: source.child('pmh-test-store'), out, roots: [source.path], createdAt: FROZEN_TIMESTAMP })
      await importBundle({ bundle: out, into: target.path, installedAt: FROZEN_TIMESTAMP })
      await writeFile(join(target.path, 'pmh-test-store', 'eigene-notiz.txt'), 'weg damit\n', 'utf8')

      const result = await importBundle({ bundle: out, into: target.path, ifExists: 'overwrite', installedAt: FROZEN_TIMESTAMP })
      expect(result.rolledBack).toBe(false)
      expect(await exists(join(target.path, 'pmh-test-store', 'eigene-notiz.txt'))).toBe(false)
      const leftovers = (await readdir(target.path)).filter((name) => name.includes('.pmh-backup-'))
      expect(leftovers).toEqual([])
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })

  test('ein defektes Bündel wird abgelehnt und hinterlässt nichts', async () => {
    const source = await tempRoot()
    const target = await tempRoot()
    try {
      await writeStandardTree(source.path)
      const out = source.child('router.pmhunit')
      await exportUnit({ unit: source.child('pmh-test-router'), out, roots: [source.path], createdAt: FROZEN_TIMESTAMP })
      const bytes = await readFile(out)
      bytes[bytes.byteLength - 2] = (bytes[bytes.byteLength - 2] ?? 0) ^ 0xff
      await writeFile(out, bytes)

      let failure: UnitExportFailure | undefined
      try {
        await importBundle({ bundle: out, into: target.path, installedAt: FROZEN_TIMESTAMP })
      }
      catch (error) {
        failure = error as UnitExportFailure
      }
      expect(failure?.errors.length).toBeGreaterThan(0)
      expect((await readdir(target.path)).filter((name) => name.startsWith('.pmh-import-'))).toEqual([])
      expect(await exists(join(target.path, 'pmh-test-router'))).toBe(false)
      expect(await exists(join(target.path, 'pmh-test-base'))).toBe(false)
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })

  test('ein Unit mit unverträglichem Vertrag wird nicht installiert', async () => {
    const source = await tempRoot()
    const target = await tempRoot()
    try {
      await writeUnit(source.path, { name: 'pmh-neu', contract: '^1.0.0' })
      const out = source.child('neu.pmhunit')
      await exportUnit({ unit: source.child('pmh-neu'), out, roots: [source.path], createdAt: FROZEN_TIMESTAMP })

      let failure: UnitExportFailure | undefined
      try {
        await importBundle({ bundle: out, into: target.path, host: { coreVersion: '0.2.5' } })
      }
      catch (error) {
        failure = error as UnitExportFailure
      }
      expect(failure?.errors.map((error) => error.code)).toContain('registry_core_contract_incompatible')
      expect(await exists(join(target.path, 'pmh-neu'))).toBe(false)
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })

  test('ein Bündel mit einem Pfad-Ausbruch wird abgelehnt, nichts landet daneben', async () => {
    const source = await tempRoot()
    const target = await tempRoot()
    try {
      await writeUnit(source.path, { name: 'pmh-boese', files: { 'harmlos.txt': 'x\n' } })
      const out = source.child('boese.pmhunit')
      await exportUnit({ unit: source.child('pmh-boese'), out, roots: [source.path], createdAt: FROZEN_TIMESTAMP })

      // Nutzlast unverändert lassen, nur den Pfad im Manifest verbiegen und
      // den Digest neu rechnen — genau das, was ein Angreifer täte.
      const check = await loadBundleFile(out)
      expect(check.ok).toBe(true)
      const loaded = check.bundle as NonNullable<typeof check.bundle>
      const forged = {
        ...loaded.manifest,
        files: loaded.manifest.files.map((file, index) => index === 0 ? { ...file, path: '../../../entwischt.txt' } : file),
      }
      const { bundleDigestOf, DIGEST_PLACEHOLDER } = await import('../src/bundle.ts')
      const digest = bundleDigestOf({ ...forged, digest: DIGEST_PLACEHOLDER }, loaded.payload)
      const forgedFile = join(source.path, 'gefaelscht.pmhunit')
      await writeFile(forgedFile, encodeBundle({ ...forged, digest }, loaded.payload))

      let failure: UnitExportFailure | undefined
      try {
        await importBundle({ bundle: forgedFile, into: target.path })
      }
      catch (error) {
        failure = error as UnitExportFailure
      }
      expect(failure).toBeDefined()
      expect(failure?.errors.map((error) => error.code)).toContain('path_traversal')
      expect(await exists(join(source.path, 'entwischt.txt'))).toBe(false)
      expect(await exists(join(target.path, 'entwischt.txt'))).toBe(false)
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })
})

describe('planBundleInstall', () => {
  test('sagt vorher, was geschrieben würde — und schreibt nichts', async () => {
    const source = await tempRoot()
    const target = await tempRoot()
    try {
      await writeStandardTree(source.path)
      const out = source.child('router.pmhunit')
      await exportUnit({ unit: source.child('pmh-test-router'), out, roots: [source.path], createdAt: FROZEN_TIMESTAMP })

      const plan = await planBundleInstall({ bundle: out, into: target.path, host: HOST })
      expect(plan.installable).toBe(true)
      expect(plan.alreadyInstalled).toEqual([])
      expect(plan.wouldWrite.length).toBeGreaterThan(0)
      expect(plan.unit).toEqual({ name: 'pmh-test-router', version: '2.0.1', kind: 'plugin' })
      expect(await exists(join(target.path, 'pmh-test-router'))).toBe(false)
      expect(await readdir(target.path)).toEqual([])
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })

  test('nennt den Vertragsbruch als Grund', async () => {
    const source = await tempRoot()
    const target = await tempRoot()
    try {
      await writeUnit(source.path, { name: 'pmh-neu', contract: '^1.0.0' })
      const out = source.child('neu.pmhunit')
      await exportUnit({ unit: source.child('pmh-neu'), out, roots: [source.path], createdAt: FROZEN_TIMESTAMP })
      const plan = await planBundleInstall({ bundle: out, into: target.path, host: { coreVersion: '0.2.5' } })
      expect(plan.installable).toBe(false)
      expect(plan.reasons.map((reason) => reason.code)).toContain('registry_core_contract_incompatible')
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })

  test('nennt bereits installierte Units', async () => {
    const source = await tempRoot()
    const target = await tempRoot()
    try {
      await writeStandardTree(source.path)
      const out = source.child('store.pmhunit')
      await exportUnit({ unit: source.child('pmh-test-store'), out, roots: [source.path], createdAt: FROZEN_TIMESTAMP })
      await importBundle({ bundle: out, into: target.path, installedAt: FROZEN_TIMESTAMP })
      const plan = await planBundleInstall({ bundle: out, into: target.path })
      expect(plan.alreadyInstalled).toEqual(['pmh-test-store'])
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })
})

describe('listRegistry', () => {
  test('liefert Wurzeln, Units und Befunde in einem Bericht', async () => {
    const root = await tempRoot()
    const empty = await tempRoot()
    try {
      await writeStandardTree(root.path)
      const registry = await listRegistry({ roots: [{ path: root.path, label: 'test' }, { path: empty.child('weg'), label: 'fehlt' }], host: HOST })
      expect(registry.roots.length).toBe(2)
      expect(registry.units.length).toBe(3)
      expect(registry.diagnostics.map((error) => error.code)).toContain('registry_root_missing')
    }
    finally {
      await root.cleanup()
      await empty.cleanup()
    }
  })
})

describe('Einzeldateien', () => {
  test('ein Bündel ohne Abhängigkeiten enthält nur das Unit selbst', async () => {
    const root = await tempRoot()
    try {
      await mkdir(root.child('nur'), { recursive: true })
      await writeUnit(root.path, { name: 'pmh-einzeln', files: { 'src/a.ts': 'export const a = 1\n' } })
      const result = await exportUnit({ unit: root.child('pmh-einzeln'), out: root.child('einzeln.pmhunit'), roots: [root.path], createdAt: FROZEN_TIMESTAMP })
      expect(result.closure).toEqual(['pmh-einzeln'])
      const names = result.bundle.units.map((unit) => unit.name)
      expect(names).toEqual(['pmh-einzeln'])
    }
    finally {
      await root.cleanup()
    }
  })
})
