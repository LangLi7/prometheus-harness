/**
 * Registry: Auffinden, Abhängigkeiten, Verträglichkeit.
 *
 * Zwei Eigenschaften werden hier festgenagelt: **Determinismus** (zwei Scans
 * derselben Platte liefern dieselbe Reihenfolge) und **Begründung** (jede
 * Unverträglichkeit hat einen Code und einen Satz).
 */

import { describe, expect, test } from 'bun:test'

import { findUnit, planInstall, resolveDependencies, scanRegistry, unitsOfKind } from '../src/registry.ts'
import { tempRoot, writeStandardTree, writeUnit } from './fixtures.ts'

describe('scanRegistry', () => {
  test('findet alle Units einer Wurzel, stabil sortiert', async () => {
    const root = await tempRoot()
    try {
      await writeStandardTree(root.path)
      const registry = await scanRegistry({ roots: [root.path] })
      expect(registry.diagnostics).toEqual([])
      expect(registry.units.map((entry) => entry.manifest.name)).toEqual(['pmh-test-base', 'pmh-test-router', 'pmh-test-store'])
    }
    finally {
      await root.cleanup()
    }
  })

  test('zwei Scans liefern dieselbe Reihenfolge', async () => {
    const root = await tempRoot()
    try {
      await writeStandardTree(root.path)
      const first = await scanRegistry({ roots: [root.path] })
      const second = await scanRegistry({ roots: [root.path] })
      expect(JSON.stringify(first.units)).toBe(JSON.stringify(second.units))
    }
    finally {
      await root.cleanup()
    }
  })

  test('eine fehlende Wurzel ist ein Befund, kein Wurf', async () => {
    const root = await tempRoot()
    try {
      const registry = await scanRegistry({ roots: [{ path: root.child('gibtsnicht'), label: 'leer' }] })
      expect(registry.units).toEqual([])
      expect(registry.diagnostics.map((error) => error.code)).toContain('registry_root_missing')
    }
    finally {
      await root.cleanup()
    }
  })

  test('überspringt node_modules und .git', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-drin' })
      await writeUnit(root.path, { name: 'pmh-draussen', directory: 'node_modules/pmh-draussen' })
      await writeUnit(root.path, { name: 'pmh-git', directory: '.git/pmh-git' })
      const registry = await scanRegistry({ roots: [root.path] })
      expect(registry.units.map((entry) => entry.manifest.name)).toEqual(['pmh-drin'])
    }
    finally {
      await root.cleanup()
    }
  })

  test('ein defektes Manifest ist ein Befund, die anderen Units bleiben nutzbar', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-gut' })
      await writeUnit(root.path, { name: 'pmh-schlecht', rawManifest: '{"name":"pmh-schlecht","kind":"nope"}' })
      const registry = await scanRegistry({ roots: [root.path] })
      expect(registry.units.map((entry) => entry.manifest.name)).toEqual(['pmh-gut'])
      expect(registry.diagnostics.map((error) => error.code)).toContain('unit_kind_unknown')
    }
    finally {
      await root.cleanup()
    }
  })

  test('meldet einen Unit-Namen, der sich nur in der Groß-/Kleinschreibung unterscheidet', async () => {
    // Der Ordnername ist auf Windows nicht case-sensitiv unterscheidbar; die
    // Registry muss deshalb auch dann warnen, wenn die Ordner verschieden
    // heißen, die **Namen** aber kollidieren würden.
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-klein', directory: 'a' })
      await writeUnit(root.path, {
        name: 'PMH-Klein',
        directory: 'b',
        rawManifest: JSON.stringify({
          name: 'PMH-Klein',
          version: '1.0.0',
          kind: 'plugin',
          language: 'typescript',
          description: 'x',
          core: 'required_core',
        }),
      })
      const registry = await scanRegistry({ roots: [root.path] })
      const codes = registry.diagnostics.map((error) => error.code)
      // Der Großbuchstaben-Name wird abgelehnt …
      expect(codes).toContain('unit_name_uppercase')
      // … und die Registry findet das verbleibende Unit weiterhin, wenn auch
      // case-insensitiv gesucht wird.
      expect(findUnit(registry, 'PMH-KLEIN')?.manifest.name).toBe('pmh-klein')
      expect(findUnit(registry, 'pmh-klein')?.manifest.name).toBe('pmh-klein')
    }
    finally {
      await root.cleanup()
    }
  })

  test('zwei Ordner mit demselben Namen im selben Baum sind ein Befund', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-zwilling', directory: 'x/pmh-zwilling' })
      await writeUnit(root.path, { name: 'pmh-zwilling', directory: 'y/pmh-zwilling' })
      const registry = await scanRegistry({ roots: [root.path] })
      expect(registry.units.length).toBe(2)
      expect(registry.diagnostics.map((error) => error.code)).toContain('registry_duplicate_name')
    }
    finally {
      await root.cleanup()
    }
  })

  test('mehrere Wurzeln: die Wurzelreihenfolge entscheidet, welche Fassung gilt', async () => {
    const one = await tempRoot()
    const two = await tempRoot()
    try {
      await writeUnit(one.path, { name: 'pmh-doppelt', version: '1.0.0' })
      await writeUnit(two.path, { name: 'pmh-doppelt', version: '2.0.0' })
      const registry = await scanRegistry({
        roots: [{ path: one.path, label: 'erste' }, { path: two.path, label: 'zweite' }],
      })
      expect(registry.units.length).toBe(2)
      expect(findUnit(registry, 'pmh-doppelt')?.manifest.version).toBe('1.0.0')
      expect(findUnit(registry, 'pmh-doppelt', { version: '^2.0.0' })?.manifest.version).toBe('2.0.0')
    }
    finally {
      await one.cleanup()
      await two.cleanup()
    }
  })

  test('filtert nach Art', async () => {
    const root = await tempRoot()
    try {
      await writeStandardTree(root.path)
      const registry = await scanRegistry({ roots: [root.path] })
      expect(unitsOfKind(registry, 'service').map((entry) => entry.manifest.name)).toEqual(['pmh-test-store'])
      expect(unitsOfKind(registry, 'plugin').map((entry) => entry.manifest.name)).toEqual(['pmh-test-base', 'pmh-test-router'])
    }
    finally {
      await root.cleanup()
    }
  })
})

describe('resolveDependencies', () => {
  test('liefert den transitiven Abschluss, das Unit zuerst', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-ende' })
      await writeUnit(root.path, { name: 'pmh-mitte', requires: ['pmh-ende'] })
      await writeUnit(root.path, { name: 'pmh-start', requires: ['pmh-mitte'] })
      const registry = await scanRegistry({ roots: [root.path] })
      const resolution = resolveDependencies(registry, 'pmh-start')
      expect(resolution.order.map((node) => `${node.depth}:${node.name}`)).toEqual([
        '0:pmh-start',
        '1:pmh-mitte',
        '2:pmh-ende',
      ])
      expect(resolution.missing).toEqual([])
      const ende = resolution.order.find((node) => node.name === 'pmh-ende')
      expect(ende?.requiredBy).toEqual(['pmh-mitte'])
    }
    finally {
      await root.cleanup()
    }
  })

  test('meldet fehlende Abhängigkeiten mit dem, der sie braucht', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-braucht', requires: ['pmh-fehlt'] })
      const registry = await scanRegistry({ roots: [root.path] })
      const resolution = resolveDependencies(registry, 'pmh-braucht')
      expect(resolution.missing.map((node) => node.name)).toEqual(['pmh-fehlt'])
      expect(resolution.missing[0]?.requiredBy).toEqual(['pmh-braucht'])
    }
    finally {
      await root.cleanup()
    }
  })

  test('erkennt einen Zyklus und bricht nicht ab', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-a', requires: ['pmh-b'] })
      await writeUnit(root.path, { name: 'pmh-b', requires: ['pmh-a'] })
      const registry = await scanRegistry({ roots: [root.path] })
      const resolution = resolveDependencies(registry, 'pmh-a')
      expect(resolution.cycle).toBeDefined()
      expect(resolution.order.map((node) => node.name).sort()).toEqual(['pmh-a', 'pmh-b'])
    }
    finally {
      await root.cleanup()
    }
  })

  test('mehrere Eltern eines Knotens werden vollständig genannt', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-gemeinsam' })
      await writeUnit(root.path, { name: 'pmh-links', requires: ['pmh-gemeinsam'] })
      await writeUnit(root.path, { name: 'pmh-rechts', requires: ['pmh-gemeinsam'] })
      await writeUnit(root.path, { name: 'pmh-oben', requires: ['pmh-links', 'pmh-rechts'] })
      const registry = await scanRegistry({ roots: [root.path] })
      const resolution = resolveDependencies(registry, 'pmh-oben')
      const gemeinsam = resolution.order.find((node) => node.name === 'pmh-gemeinsam')
      expect(gemeinsam?.requiredBy).toEqual(['pmh-links', 'pmh-rechts'])
    }
    finally {
      await root.cleanup()
    }
  })
})

describe('planInstall (installiertes Unit)', () => {
  test('nicht installiert: genau ein Grund', async () => {
    const root = await tempRoot()
    try {
      const registry = await scanRegistry({ roots: [root.path] })
      const plan = planInstall(registry, 'pmh-nirgends')
      expect(plan.installable).toBe(false)
      expect(plan.reasons.map((reason) => reason.code)).toEqual(['registry_dependency_missing'])
    }
    finally {
      await root.cleanup()
    }
  })

  test('installierbar, wenn Vertrag und Abhängigkeiten passen', async () => {
    const root = await tempRoot()
    try {
      await writeStandardTree(root.path)
      const registry = await scanRegistry({ roots: [root.path], host: { coreVersion: '0.2.5' } })
      const plan = planInstall(registry, 'pmh-test-router')
      expect(plan.reasons).toEqual([])
      expect(plan.installable).toBe(true)
    }
    finally {
      await root.cleanup()
    }
  })

  test('unverträglicher Core-Vertrag nennt Soll und Ist', async () => {
    const root = await tempRoot()
    try {
      await writeStandardTree(root.path)
      const registry = await scanRegistry({ roots: [root.path], host: { coreVersion: '0.3.0' } })
      const plan = planInstall(registry, 'pmh-test-router')
      expect(plan.installable).toBe(false)
      const reason = plan.reasons.find((entry) => entry.code === 'registry_core_contract_incompatible')
      expect(reason?.message).toContain('^0.2.0')
      expect(reason?.message).toContain('0.3.0')
    }
    finally {
      await root.cleanup()
    }
  })

  test('fehlende Abhängigkeit und Vertragsbruch werden beide gemeldet', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-allein', requires: ['pmh-fehlt'], contract: '^0.2.0' })
      const registry = await scanRegistry({ roots: [root.path], host: { coreVersion: '1.0.0' } })
      const plan = planInstall(registry, 'pmh-allein')
      const codes = plan.reasons.map((reason) => reason.code)
      expect(codes).toContain('registry_dependency_missing')
      expect(codes).toContain('registry_core_contract_incompatible')
    }
    finally {
      await root.cleanup()
    }
  })

  test('ohne Vertragsangabe und ohne Host-Default ist der Vertrag unbelegt', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-ohne-vertrag' })
      const registry = await scanRegistry({ roots: [root.path], host: { coreVersion: '0.2.5' } })
      const plan = planInstall(registry, 'pmh-ohne-vertrag')
      expect(plan.reasons.map((reason) => reason.code)).toContain('registry_core_contract_unknown')
    }
    finally {
      await root.cleanup()
    }
  })

  test('ein Host-Default ersetzt die fehlende Angabe', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-ohne-vertrag' })
      const registry = await scanRegistry({
        roots: [root.path],
        host: { coreVersion: '0.2.5', defaultContract: '^0.2.0' },
      })
      const plan = planInstall(registry, 'pmh-ohne-vertrag')
      expect(plan.installable).toBe(true)
    }
    finally {
      await root.cleanup()
    }
  })

  test('nicht unterstützte Plattform wird gemeldet', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-nur-linux', platforms: ['linux'], contract: '*' })
      const registry = await scanRegistry({ roots: [root.path], host: { coreVersion: '1.0.0', platform: 'win32' } })
      const plan = planInstall(registry, 'pmh-nur-linux')
      expect(plan.reasons.map((reason) => reason.code)).toContain('registry_platform_unsupported')
    }
    finally {
      await root.cleanup()
    }
  })

  test('zwei Units mit derselben Fähigkeit werden sichtbar gemacht', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-router-a', provides: ['model-routing'], contract: '*' })
      await writeUnit(root.path, { name: 'pmh-router-b', provides: ['model-routing'], contract: '*' })
      const registry = await scanRegistry({ roots: [root.path], host: { coreVersion: '1.0.0' } })
      const plan = planInstall(registry, 'pmh-router-a')
      expect(plan.reasons.map((reason) => reason.code)).toContain('registry_provides_collision')
    }
    finally {
      await root.cleanup()
    }
  })

  test('Zyklus macht ein Unit nicht installierbar', async () => {
    const root = await tempRoot()
    try {
      await writeUnit(root.path, { name: 'pmh-a', requires: ['pmh-b'], contract: '*' })
      await writeUnit(root.path, { name: 'pmh-b', requires: ['pmh-a'], contract: '*' })
      const registry = await scanRegistry({ roots: [root.path], host: { coreVersion: '1.0.0' } })
      const plan = planInstall(registry, 'pmh-a')
      expect(plan.reasons.map((reason) => reason.code)).toContain('registry_dependency_cycle')
    }
    finally {
      await root.cleanup()
    }
  })
})
