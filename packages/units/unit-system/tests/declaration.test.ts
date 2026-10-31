/**
 * Prüfungen der Deklaration.
 *
 * Der Maßstab ist nicht „gültige Eingabe wird angenommen", sondern: **jede
 * Ablehnung hat einen Grund, und der Grund ist der richtige.** Ein Validator,
 * der alles ablehnt, wäre ebenso grün wie einer, der alles annimmt — deshalb
 * steht zu jeder abgelehnten Form auch eine **angenommene**.
 */

import { describe, expect, test } from 'bun:test'

import { parseDeclaration } from '../src/declaration.ts'

const gueltig = {
  format: 1,
  core: { version: '0.2.1-alpha.2', contract: '^0.2.0' },
  roots: ['units'],
  units: [{ name: 'pmh-attach' }],
}

function pruefe(json: unknown) {
  return parseDeclaration({ json })
}

/**
 * Holt den Wert aus einem gültigen Ergebnis.
 *
 * `expect(ergebnis.ok).toBe(true)` verengt den Typ für den Übersetzer **nicht** —
 * eine Prüfung ist keine Typaussage. Wer sie als solche behandelt, schreibt
 * Prüfungen, die grün sind und trotzdem nicht übersetzen.
 */
function wert(json: unknown) {
  const ergebnis = pruefe(json)
  if (!ergebnis.ok) throw new Error(`erwartet gültig, bekommen: ${ergebnis.errors.map((e) => e.code).join(', ')}`)
  return ergebnis.value
}

describe('Deklaration — gültige Form', () => {
  test('nimmt die schmale Form an und füllt Vorgaben', () => {
    const declaration = wert(gueltig)
    expect(declaration.units[0]?.enabled).toBe(true)
    expect(declaration.core.version).toBe('0.2.1-alpha.2')
  })

  test('ohne "roots" gilt der Bestand dieses Projekts, nicht ein leerer', () => {
    const declaration = wert({ ...gueltig, roots: undefined })
    expect(declaration.roots).toEqual(['units', 'services', 'native'])
  })

  test('eine Datei darf als Zeichenkette geschrieben werden — das ist die Form, die man tippt', () => {
    const declaration = wert({ ...gueltig, files: ['docker-compose.yml', { path: 'x.yml', required: false }] })
    expect(declaration.files).toEqual([
      { path: 'docker-compose.yml', required: true },
      { path: 'x.yml', required: false },
    ])
  })

  test('schema und reason werden getragen', () => {
    const declaration = wert({ ...gueltig, schema: 7, reason: 'weil' })
    expect(declaration.schema).toBe(7)
    expect(declaration.reason).toBe('weil')
  })
})

describe('Deklaration — Ablehnungen mit Grund', () => {
  test('ein unbekanntes Feld ist ein Befund, kein stiller Durchlauf', () => {
    const ergebnis = pruefe({ ...gueltig, wunschzettel: true })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.map((e) => e.code)).toContain('generation_declaration_unknown_field')
  })

  test('ein höheres Format wird abgelehnt statt geraten', () => {
    const ergebnis = pruefe({ ...gueltig, format: 2 })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.map((e) => e.code)).toContain('generation_declaration_format_unsupported')
  })

  test('ein fehlendes "core" wird gemeldet', () => {
    const ergebnis = pruefe({ ...gueltig, core: undefined })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.map((e) => e.code)).toContain('generation_declaration_field_missing')
  })

  test('eine leere Wurzelliste ist ein Fehler, kein leeres Ergebnis', () => {
    const ergebnis = pruefe({ ...gueltig, roots: [] })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.map((e) => e.code)).toContain('generation_declaration_field_value')
  })

  test('ein Unit, das zweimal dasteht, wird gemeldet', () => {
    const ergebnis = pruefe({ ...gueltig, units: [{ name: 'a' }, { name: 'A' }] })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.map((e) => e.code)).toContain('generation_declaration_unit_duplicate')
  })

  test('ein unbekannter Takt wird gemeldet', () => {
    const ergebnis = pruefe({ ...gueltig, units: [{ name: 'a', reload: 'lauwarm' }] })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.map((e) => e.code)).toContain('generation_declaration_field_value')
  })

  test('ein negatives schema wird gemeldet', () => {
    const ergebnis = pruefe({ ...gueltig, schema: -1 })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.map((e) => e.code)).toContain('generation_declaration_field_type')
  })

  test('alle Befunde kommen zusammen, nicht nur der erste', () => {
    const ergebnis = pruefe({ format: 9, unknownFeld: 1, units: 'nein' })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.length).toBeGreaterThanOrEqual(3)
  })

  test('ein Prüfschritt wird gelesen — mit Vorgaben', () => {
    const declaration = wert({
      ...gueltig,
      checks: [{ name: 'typen', command: 'bun', args: ['run', 'typecheck'] }],
    })
    expect(declaration.checks).toHaveLength(1)
    expect(declaration.checks[0]?.timeoutMs).toBe(300_000)
    expect(declaration.checks[0]?.required).toBe(true)
    // Ohne Angabe gilt das Tor als scharf — die vorsichtige Annahme.
    expect(declaration.policy.requireCheck).toBe(true)
  })

  test('ein absolutes Arbeitsverzeichnis wird abgelehnt — es wäre maschinengebunden', () => {
    const ergebnis = pruefe({
      ...gueltig,
      checks: [{ name: 'x', command: 'go', cwd: 'C:\\Users\\wer\\projekt' }],
    })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.map((e) => e.code)).toContain('generation_declaration_field_value')
  })

  test('ein Arbeitsverzeichnis mit ".." wird abgelehnt', () => {
    const ergebnis = pruefe({ ...gueltig, checks: [{ name: 'x', command: 'go', cwd: '../../aussen' }] })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.map((e) => e.code)).toContain('generation_declaration_field_value')
  })

  test('Umgebungswerte werden getragen, ein falscher Typ wird gemeldet', () => {
    const declaration = wert({ ...gueltig, checks: [{ name: 'x', command: 'go', env: { GOCACHE: '.pmh-build/go-cache' } }] })
    expect(declaration.checks[0]?.env).toEqual({ GOCACHE: '.pmh-build/go-cache' })

    const ergebnis = pruefe({ ...gueltig, checks: [{ name: 'x', command: 'go', env: { GOCACHE: 7 } }] })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.map((e) => e.code)).toContain('generation_declaration_field_type')
  })

  test('zwei Prüfschritte mit demselben Namen sind ein Befund', () => {
    const ergebnis = pruefe({ ...gueltig, checks: [{ name: 'x', command: 'a' }, { name: 'x', command: 'b' }] })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.errors.some((e) => e.message.includes('mehrfach'))).toBe(true)
  })
})
