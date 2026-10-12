/**
 * Manifest-Prüfung: jeder Verstoß muss einen **eigenen** Code tragen.
 *
 * Die Tests prüfen die Codes, nicht die Botschaften — die Botschaften dürfen
 * sich ändern, die Codes sind die Schnittstelle.
 */

import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { parseManifest, readManifest, validateUnitName, directoryNameFor, compareVersions, satisfiesContract } from '../src/manifest.ts'
import { FROZEN_TIMESTAMP, tempRoot, writeUnit } from './fixtures.ts'

const base = {
  name: 'pmh-test-plugin',
  version: '1.0.0',
  kind: 'plugin',
  language: 'typescript',
  description: 'Ein Testunit.',
  core: 'required_core',
}

function codes(json: unknown): string[] {
  const result = parseManifest({ json })
  return result.errors.map((error) => error.code)
}

describe('parseManifest', () => {
  test('nimmt ein vollständiges Manifest an', () => {
    const result = parseManifest({ json: { ...base, requires: ['pmh-andere'], provides: ['x'], platforms: ['linux'], notes: ['n'] } })
    expect(result.ok).toBe(true)
    expect(result.value?.name).toBe('pmh-test-plugin')
    expect(result.value?.requires).toEqual(['pmh-andere'])
  })

  test('nimmt das optionale Feld contract als Core-Vertragsversion', () => {
    const result = parseManifest({ json: { ...base, contract: '^0.2.0' } })
    expect(result.ok).toBe(true)
    expect(result.value?.contract).toBe('^0.2.0')
  })

  test('lehnt eine unbekannte Art mit eigenem Code ab', () => {
    expect(codes({ ...base, kind: 'binary' })).toContain('unit_kind_unknown')
  })

  test('lehnt eine unbekannte Sprache mit eigenem Code ab', () => {
    expect(codes({ ...base, language: 'python' })).toContain('unit_language_unknown')
  })

  test('meldet jedes fehlende Pflichtfeld einzeln', () => {
    const found = codes({})
    expect(found).toContain('manifest_field_missing')
    const missing = parseManifest({ json: {} }).errors.filter((error) => error.code === 'manifest_field_missing')
    expect(missing.length).toBeGreaterThanOrEqual(5)
    expect(missing.map((error) => error.at).sort()).toEqual([
      'unit.json#/core',
      'unit.json#/description',
      'unit.json#/kind',
      'unit.json#/language',
      'unit.json#/name',
      'unit.json#/version',
    ])
  })

  test('lehnt ein unbekanntes Feld ab, statt es zu ignorieren', () => {
    expect(codes({ ...base, dependencies: ['x'] })).toContain('manifest_unknown_field')
  })

  test('lehnt Selbstabhängigkeit ab', () => {
    expect(codes({ ...base, requires: ['pmh-test-plugin'] })).toContain('unit_self_dependency')
  })

  test('lehnt Selbstabhängigkeit auch in anderer Schreibweise ab', () => {
    expect(codes({ ...base, requires: ['PMH-Test-Plugin'] })).toContain('unit_self_dependency')
  })

  test('lehnt doppelte Abhängigkeiten ab', () => {
    expect(codes({ ...base, requires: ['a', 'a'] })).toContain('unit_dependency_duplicate')
  })

  test('verschachtelte requires mit falschem Typ ergeben Feldbefunde', () => {
    const found = codes({ ...base, requires: ['ok', 7, ''] })
    expect(found).toContain('manifest_field_type')
    expect(found).toContain('manifest_field_value')
  })

  test('verlangt entry für kind=service', () => {
    expect(codes({ ...base, kind: 'service' })).toContain('manifest_field_missing')
    const result = parseManifest({ json: { ...base, kind: 'service', entry: { command: 'x', args: [] } } })
    expect(result.ok).toBe(true)
  })

  test('lehnt ungültige Versionen ab', () => {
    expect(codes({ ...base, version: '1.0' })).toContain('unit_version_not_semver')
    expect(codes({ ...base, version: 'v1.0.0' })).toContain('unit_version_not_semver')
    expect(codes({ ...base, version: '1.0.0-alpha.2' })).not.toContain('unit_version_not_semver')
  })

  test('lehnt eine ungültige Vertragsspanne ab', () => {
    expect(codes({ ...base, contract: 'latest' })).toContain('unit_contract_range_invalid')
    expect(codes({ ...base, contract: '^0.2.0' })).not.toContain('unit_contract_range_invalid')
  })

  test('ein abweichender Ordnername ist eine Warnung, kein Ablehnungsgrund', () => {
    // `units/README.md` sagt „entspricht dem Ordnernamen", die vorhandenen
    // Units halten das nicht immer ein (`native/atomicfs` heißt `pmh-atomicfs`).
    const result = parseManifest({ json: base, directory: '/tmp/woanders' })
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings.map((error) => error.code)).toContain('unit_name_directory_mismatch')
  })

  test('passender Ordnername ergibt keine Warnung', () => {
    const result = parseManifest({ json: base, directory: '/tmp/pmh-test-plugin' })
    expect(result.warnings).toEqual([])
  })

  test('akzeptiert eine npm-Form @scope/name, wenn der Ordner das letzte Segment ist', () => {
    const result = parseManifest({ json: { ...base, name: '@prometheus-harness/unit-export' }, directory: '/tmp/unit-export' })
    expect(result.ok).toBe(true)
    expect(directoryNameFor('@prometheus-harness/unit-export')).toBe('unit-export')
  })

  test('Befunde sind stabil sortiert', () => {
    const first = parseManifest({ json: { name: 'A', kind: 'x' } }).errors.map((error) => `${error.code}:${error.at}`)
    const second = parseManifest({ json: { kind: 'x', name: 'A' } }).errors.map((error) => `${error.code}:${error.at}`)
    expect(first).toEqual(second)
  })
})

describe('validateUnitName', () => {
  test('lehnt Großbuchstaben ab (Windows-Kollision)', () => {
    expect(validateUnitName('PMH-Test').map((error) => error.code)).toContain('unit_name_uppercase')
  })

  test('lehnt reservierte Windows-Gerätenamen ab', () => {
    for (const name of ['con', 'nul', 'aux', 'prn', 'com1', 'lpt9']) {
      expect(validateUnitName(name).map((error) => error.code)).toContain('unit_name_reserved_device')
    }
    expect(validateUnitName('nul.backup').map((error) => error.code)).toContain('unit_name_reserved_device')
    expect(validateUnitName('console').map((error) => error.code)).not.toContain('unit_name_reserved_device')
  })

  test('lehnt abschließenden Punkt oder Leerzeichen ab', () => {
    expect(validateUnitName('name.').map((error) => error.code)).toContain('unit_name_trailing_dot')
    expect(validateUnitName('name ').map((error) => error.code)).toContain('unit_name_trailing_dot')
  })

  test('lehnt unzulässige Zeichen ab', () => {
    for (const name of ['a:b', 'a\\b', 'a*b', 'a?b', 'a|b', 'a<b', 'a>b', 'a"b', 'a b', 'a/../b', 'ä']) {
      const found = validateUnitName(name).map((error) => error.code)
      expect(found.length).toBeGreaterThan(0)
    }
  })

  test('lehnt leeren Namen und führenden Punkt ab', () => {
    expect(validateUnitName('').map((error) => error.code)).toContain('unit_name_empty')
    expect(validateUnitName('.hidden').map((error) => error.code)).toContain('unit_name_leading_dot')
  })

  test('nimmt die üblichen Namen an', () => {
    for (const name of ['pmh-supervisor', 'unit-export', 'multi-model-router', 'a', 'pmh-atomicfs']) {
      expect(validateUnitName(name)).toEqual([])
    }
  })
})

describe('Versionen und Vertragsspannen', () => {
  test('vergleicht Versionen', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.2.1-alpha.2', '0.2.1')).toBeLessThan(0)
  })

  test('prüft Spannen', () => {
    expect(satisfiesContract('0.2.1', '0.2.1')).toBe(true)
    expect(satisfiesContract('0.2.2', '0.2.1')).toBe(false)
    expect(satisfiesContract('0.2.5', '^0.2.0')).toBe(true)
    expect(satisfiesContract('0.3.0', '^0.2.0')).toBe(false)
    expect(satisfiesContract('1.5.0', '^1.0.0')).toBe(true)
    expect(satisfiesContract('2.0.0', '^1.0.0')).toBe(false)
    expect(satisfiesContract('0.2.9', '~0.2.1')).toBe(true)
    expect(satisfiesContract('0.3.0', '~0.2.1')).toBe(false)
    expect(satisfiesContract('9.9.9', '*')).toBe(true)
    expect(satisfiesContract('0.2.1', 'latest')).toBe(false)
  })
})

describe('readManifest', () => {
  test('liest ein Unit aus dem Ordner', async () => {
    const root = await tempRoot()
    try {
      const directory = await writeUnit(root.path, { name: 'pmh-lese-test' })
      const result = await readManifest(directory)
      expect(result.ok).toBe(true)
      expect(result.value?.directory).toBe(directory)
    }
    finally {
      await root.cleanup()
    }
  })

  test('meldet einen fehlenden unit.json als Befund, nicht als Wurf', async () => {
    const root = await tempRoot()
    try {
      const result = await readManifest(join(root.path, 'gibtsnicht'))
      expect(result.ok).toBe(false)
      expect(result.errors[0]?.code).toBe('manifest_missing')
    }
    finally {
      await root.cleanup()
    }
  })

  test('meldet defektes JSON als eigenen Befund', async () => {
    const root = await tempRoot()
    try {
      const directory = await writeUnit(root.path, { name: 'pmh-kaputt', rawManifest: '{ "name": ' })
      const result = await readManifest(directory)
      expect(result.ok).toBe(false)
      expect(result.errors[0]?.code).toBe('manifest_not_json')
    }
    finally {
      await root.cleanup()
    }
  })

  test('die Testvorlage bleibt mit festgehaltenem Zeitstempel reproduzierbar', () => {
    expect(FROZEN_TIMESTAMP.endsWith('Z')).toBe(true)
  })
})
