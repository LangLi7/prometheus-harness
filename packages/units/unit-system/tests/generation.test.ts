/**
 * Prüfungen der Buchführung: Fingerabdruck, Generation, Zeiger, Journal,
 * Aufräumen, Vergleich.
 *
 * Der Satz, an dem hier alles hängt: **zwei Generationen sind genau dann gleich,
 * wenn ihr Inhalt gleich ist.** Nicht ihr Zeitpunkt, nicht ihre Nummer. Wer das
 * verletzt, kann „hat sich etwas geändert?" nicht mehr beantworten — und dann
 * wächst die Liste bei jedem Bau.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { readFile, writeFile } from 'node:fs/promises'

import type { ClosureUnit } from '../src/closure.ts'
import {
  fingerabdruck,
  journalAnhaengen,
  journalLesen,
  layoutFor,
  legeLayoutAn,
  leseGeneration,
  leseZeiger,
  listGenerationen,
  naechsteNummer,
  ordnerName,
  raeumeAuf,
  schreibeGeneration,
  schreibeZeiger,
  vergleiche,
  type GenerationInhalt,
} from '../src/generation.ts'
import { baueProjekt, type TestProjekt } from './fixtures.ts'

let projekt: TestProjekt | undefined

afterEach(async () => {
  await projekt?.aufraeumen()
  projekt = undefined
})

function unit(name: string, ueberschreiben: Partial<ClosureUnit> = {}): ClosureUnit {
  return {
    name,
    version: '0.1.0',
    kind: 'plugin',
    language: 'typescript',
    reload: 'boot',
    reloadSource: 'default',
    irreversible: false,
    contentDigest: `sha256:${'a'.repeat(64)}`,
    directory: `units/${name}`,
    rootLabel: 'units',
    provides: [],
    requires: [],
    declared: true,
    ...ueberschreiben,
  }
}

function inhalt(units: readonly ClosureUnit[], ueberschreiben: Partial<GenerationInhalt> = {}): GenerationInhalt {
  return {
    core: { version: '0.2.1-alpha.2', contract: '^0.2.0' },
    platform: 'linux',
    schema: null,
    units,
    files: [],
    takt: 'boot',
    irreversible: false,
    declarationDigest: 'sha256:decl',
    requireCheck: false,
    checks: [],
    ...ueberschreiben,
  }
}

describe('Fingerabdruck', () => {
  test('derselbe Inhalt ergibt denselben Fingerabdruck — auch bei anderer Reihenfolge', () => {
    const a = fingerabdruck(inhalt([unit('a'), unit('b')]))
    const b = fingerabdruck(inhalt([unit('b'), unit('a')]))
    expect(a).toBe(b)
  })

  test('eine geänderte Fassung ändert ihn', () => {
    const a = fingerabdruck(inhalt([unit('a')]))
    const b = fingerabdruck(inhalt([unit('a', { version: '0.2.0' })]))
    expect(a).not.toBe(b)
  })

  test('ein anderer Inhaltsdigest ändert ihn', () => {
    const a = fingerabdruck(inhalt([unit('a')]))
    const b = fingerabdruck(inhalt([unit('a', { contentDigest: `sha256:${'b'.repeat(64)}` })]))
    expect(a).not.toBe(b)
  })

  test('der Takt eines Units geht ein — sonst wäre „nur der Takt geändert" unsichtbar', () => {
    const a = fingerabdruck(inhalt([unit('a', { reload: 'hot' })]))
    const b = fingerabdruck(inhalt([unit('a', { reload: 'boot' })]))
    expect(a).not.toBe(b)
  })

  test('er hat die Form sha256:<64 hex>', () => {
    expect(fingerabdruck(inhalt([unit('a')]))).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})

describe('Nummern', () => {
  test('sechs Stellen, führende Nullen', () => {
    expect(ordnerName(1)).toBe('000001')
    expect(ordnerName(42)).toBe('000042')
  })

  test('0 und negative Zahlen sind ungültig — Generation 0 ist der Zustand ohne Generation', () => {
    expect(() => ordnerName(0)).toThrow()
    expect(() => ordnerName(-1)).toThrow()
  })
})

describe('Ablage, Zeiger, Journal', () => {
  test('eine Generation wird geschrieben und byte-gleich zurückgelesen', async () => {
    projekt = await baueProjekt([])
    const layout = layoutFor(projekt.root)
    await legeLayoutAn(layout)

    const geschrieben = await schreibeGeneration(layout, inhalt([unit('a')]), '2026-10-16T00:00:00.000Z')
    expect(geschrieben.number).toBe(1)
    expect(geschrieben.fingerprint).toBe(fingerabdruck(inhalt([unit('a')])))

    const gelesen = await leseGeneration(layout, 1)
    expect(gelesen).toEqual(geschrieben)
  })

  test('Nummern werden nicht wiederverwendet, auch nach dem Aufräumen nicht', async () => {
    projekt = await baueProjekt([])
    const layout = layoutFor(projekt.root)
    await schreibeGeneration(layout, inhalt([unit('a')]))
    await schreibeGeneration(layout, inhalt([unit('b')]))
    expect(await listGenerationen(layout)).toEqual([1, 2])
    await raeumeAuf(layout, 0)
    expect(await naechsteNummer(layout)).toBe(3)
  })

  test('der Zeiger trägt eine Zahl, sonst nichts', async () => {
    projekt = await baueProjekt([])
    const layout = layoutFor(projekt.root)
    expect(await leseZeiger(layout, 'current')).toBeUndefined()
    await schreibeZeiger(layout, 'current', 3)
    expect(await leseZeiger(layout, 'current')).toBe(3)
    expect((await readFile(layout.currentFile, 'utf8')).trim()).toBe('3')
  })

  test('ein unlesbarer Zeiger wird gemeldet, nicht geraten', async () => {
    projekt = await baueProjekt([])
    const layout = layoutFor(projekt.root)
    await legeLayoutAn(layout)
    await writeFile(layout.currentFile, 'drei\n', 'utf8')
    await expect(leseZeiger(layout, 'current')).rejects.toThrow()
  })

  test('das Journal ist append-only und behält die Reihenfolge', async () => {
    projekt = await baueProjekt([])
    const layout = layoutFor(projekt.root)
    await journalAnhaengen(layout, { at: '2026-10-16T00:00:01.000Z', event: 'build', generation: 1 })
    await journalAnhaengen(layout, { at: '2026-10-16T00:00:02.000Z', event: 'switch', generation: 1 })
    const alle = await journalLesen(layout)
    expect(alle.map((eintrag) => eintrag.event)).toEqual(['build', 'switch'])
    const letzte = await journalLesen(layout, 1)
    expect(letzte).toHaveLength(1)
    expect(letzte[0]?.event).toBe('switch')
  })

  test('eine kaputte Journalzeile macht den Rest nicht unlesbar', async () => {
    projekt = await baueProjekt([])
    const layout = layoutFor(projekt.root)
    await legeLayoutAn(layout)
    await writeFile(layout.journalFile, '{"at":"x","event":"build"}\nkeine-json-zeile\n', 'utf8')
    const alle = await journalLesen(layout)
    expect(alle).toHaveLength(2)
  })
})

describe('Aufräumen', () => {
  test('die aktive, die vorgemerkte und die neueste Generation bleiben immer', async () => {
    projekt = await baueProjekt([])
    const layout = layoutFor(projekt.root)
    await schreibeGeneration(layout, inhalt([unit('a')]))
    await schreibeGeneration(layout, inhalt([unit('b')]))
    await schreibeGeneration(layout, inhalt([unit('c')]))
    await schreibeGeneration(layout, inhalt([unit('d')]))
    await schreibeZeiger(layout, 'current', 2)

    const ergebnis = await raeumeAuf(layout, 0)
    expect(ergebnis.behalten).toEqual([2, 4])
    expect(ergebnis.entfernt).toEqual([1, 3])
    expect(await listGenerationen(layout)).toEqual([2, 4])
  })
})

describe('Vergleich zweier Generationen', () => {
  const basis = (units: readonly ClosureUnit[], schema: number | null = null): GenerationInhalt =>
    inhalt(units, { schema })

  function record(number: number, units: readonly ClosureUnit[], schema: number | null = null) {
    const inhaltEines = basis(units, schema)
    return {
      format: 1 as const,
      number,
      createdAt: '2026-10-16T00:00:00.000Z',
      fingerprint: fingerabdruck(inhaltEines),
      ...inhaltEines,
    }
  }

  test('erkennt ein hinzugefügtes Unit', () => {
    const vergleich = vergleiche(record(1, [unit('a')]), record(2, [unit('a'), unit('b')]))
    expect(vergleich.aenderungen).toEqual([
      { name: 'b', art: 'hinzugefuegt', nach: '0.1.0', reload: 'boot', irreversible: false },
    ])
  })

  test('erkennt ein entferntes Unit', () => {
    const vergleich = vergleiche(record(1, [unit('a'), unit('b')]), record(2, [unit('a')]))
    expect(vergleich.aenderungen[0]?.art).toBe('entfernt')
    expect(vergleich.aenderungen[0]?.name).toBe('b')
  })

  test('unterscheidet Fassung von Inhalt', () => {
    const fassung = vergleiche(record(1, [unit('a')]), record(2, [unit('a', { version: '0.2.0' })]))
    expect(fassung.aenderungen[0]?.art).toBe('fassung')
    const inhaltGeaendert = vergleiche(
      record(1, [unit('a')]),
      record(2, [unit('a', { contentDigest: `sha256:${'c'.repeat(64)}` })]),
    )
    expect(inhaltGeaendert.aenderungen[0]?.art).toBe('inhalt')
  })

  test('nur ein geänderter Takt ist ebenfalls eine Änderung', () => {
    const vergleich = vergleiche(record(1, [unit('a', { reload: 'boot' })]), record(2, [unit('a', { reload: 'hot' })]))
    expect(vergleich.aenderungen[0]?.art).toBe('takt')
  })

  test('gleiche Inhalte sind identisch', () => {
    const vergleich = vergleiche(record(1, [unit('a')]), record(2, [unit('a')]))
    expect(vergleich.identisch).toBe(true)
    expect(vergleich.benoetigt).toBe('hot')
  })

  test('der höchste Takt der Änderungen gewinnt', () => {
    const vergleich = vergleiche(
      record(1, [unit('a', { reload: 'hot' })]),
      record(2, [unit('a', { reload: 'hot', contentDigest: `sha256:${'d'.repeat(64)}` }), unit('b', { reload: 'boot' })]),
    )
    expect(vergleich.benoetigt).toBe('boot')
  })

  test('ein Wechsel der Datenbankfassung ist eine Einbahnstraße und verlangt einen neuen Prozeß', () => {
    const vergleich = vergleiche(record(1, [unit('a')], 6), record(2, [unit('a')], 7))
    expect(vergleich.irreversible).toBe(true)
    expect(vergleich.benoetigt).toBe('boot')
  })

  test('von „nicht deklariert" auf „deklariert" ist KEINE Migration', () => {
    const vergleich = vergleiche(record(1, [unit('a')], null), record(2, [unit('a')], 7))
    expect(vergleich.irreversible).toBe(false)
    expect(vergleich.identisch).toBe(true)
  })
})
