/**
 * Rundlauf mit einem **echten** Unit aus diesem Projekt.
 *
 * Die Vorlagen der anderen Tests sind erfunden. Dieser Test nimmt ein
 * vorhandenes `unit.json` aus dem Baum, gibt es aus, prüft das Bündel,
 * installiert es in eine frische Wurzel und vergleicht den Rückexport. Damit
 * hängt der Nachweis an dem, was wirklich im Baum liegt, nicht an einer
 * Testvorlage.
 *
 * **`units/` zuerst.** Der Auftrag nennt `units/` als Quelle. Dort liegt aber
 * (Stand dieses Pakets) nur die `README.md` — kein `units/<name>/unit.json`.
 * Die Suche ist deshalb eine Kette, keine Annahme: sie geht `units/` zuerst
 * durch, dann die Sprachbäume `services/` und `native/`, und **sagt an, was sie
 * benutzt hat**. Sobald ein echtes Unit unter `units/` liegt, greift dieser
 * Test es automatisch auf, ohne dass hier etwas geändert werden muss.
 */

import { describe, expect, test } from 'bun:test'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { parseManifest, readManifest } from '../src/manifest.ts'
import { findUnit, resolveDependencies, scanRegistry } from '../src/registry.ts'
import { importBundle, inspectBundle, exportUnit } from '../src/operations.ts'
import { tempRoot } from './fixtures.ts'

const FROZEN = '2026-10-12T00:00:00.000Z'

/** Die Wurzel des Projekts, in dem dieses Paket liegt. */
function projectRoot(): string {
  return resolve(import.meta.dir, '..', '..', '..', '..')
}

/**
 * Die Verzeichnisse, in denen echte Units liegen können, in Prüfreihenfolge.
 *
 * `units/` steht zuerst: das ist der Ort, den `units/README.md` für Plugins und
 * Skills ohne eigenen Sprachbaum vorsieht und den der Auftrag als Quelle nennt.
 * `services/` und `native/` folgen, weil ihre `unit.json` laut demselben README
 * ebenfalls Deklarationen sind — nur eben in ihrem Sprachbaum.
 */
const UNIT_SPACES = ['units', 'services', 'native'] as const

/** Findet echte Unit-Ordner mit `unit.json` — per Glob, nicht angenommen. */
async function findRealUnitsIn(space: string): Promise<string[]> {
  const directory = join(projectRoot(), space)
  try {
    if (!(await stat(directory)).isDirectory()) return []
  }
  catch {
    return []
  }
  const found: string[] = []
  const glob = new Bun.Glob('*/unit.json')
  for await (const match of glob.scan({ cwd: directory, absolute: true })) {
    found.push(dirname(match))
  }
  return found.sort()
}

/** Alle echten Units im Baum, in Prüfreihenfolge der Sprachbäume. */
async function findRealUnits(): Promise<string[]> {
  const found: string[] = []
  for (const space of UNIT_SPACES) found.push(...await findRealUnitsIn(space))
  return found
}

/** Ein gefundenes Unit samt dem Sprachbaum, in dem es liegt. */
interface RealUnit {
  readonly directory: string
  readonly space: string
}

/**
 * Das bevorzugte echte Unit: abhängigkeitsfrei, ohne Befunde — und aus dem
 * **ersten** Sprachbaum, der eines anbietet.
 */
async function pickSelfContainedUnit(): Promise<RealUnit> {
  for (const space of UNIT_SPACES) {
    for (const directory of await findRealUnitsIn(space)) {
      const manifest = await readManifest(directory)
      if (!manifest.ok) continue
      const registry = await scanRegistry({ roots: [join(projectRoot(), space)] })
      const resolution = resolveDependencies(registry, manifest.value.name)
      if (resolution.missing.length === 0 && resolution.order.length === 1 && registry.diagnostics.length === 0) {
        return { directory, space }
      }
    }
  }
  throw new Error('Kein abhängigkeitsfreies echtes Unit gefunden — der Test ist aussagelos, bitte prüfen.')
}

describe('Rundlauf mit einem echten Unit', () => {
  test('der Fundort ist `units/`, sobald dort ein Unit liegt — sonst der nächste Sprachbaum', async () => {
    const underUnits = await findRealUnitsIn('units')
    const picked = await pickSelfContainedUnit()
    if (underUnits.length > 0) {
      // Der Auftrag nennt `units/` als Quelle: liegt dort etwas Geeignetes,
      // muss es auch genommen werden.
      const fromUnits = []
      for (const directory of underUnits) {
        const manifest = await readManifest(directory)
        if (!manifest.ok) continue
        const registry = await scanRegistry({ roots: [join(projectRoot(), 'units')] })
        const resolution = resolveDependencies(registry, manifest.value.name)
        if (resolution.missing.length === 0 && resolution.order.length === 1 && registry.diagnostics.length === 0) {
          fromUnits.push(directory)
        }
      }
      if (fromUnits.length > 0) {
        expect(picked.space).toBe('units')
        expect(fromUnits).toContain(picked.directory)
      }
    }
    else {
      // Heute der Fall: `units/` enthält nur README.md. Der Test sagt an, woher
      // er genommen hat, statt es zu verschweigen.
      expect(picked.space).not.toBe('units')
      expect(['services', 'native']).toContain(picked.space)
      console.info(`[unit-export] Rundlauf-Quelle: ${picked.space}/${picked.directory.split(/[\\/]/).pop()} (units/ enthält noch kein Unit)`)
    }
  })

  test('mindestens ein echtes Unit ist vorhanden und gültig', async () => {
    const units = await findRealUnits()
    expect(units.length).toBeGreaterThan(0)
    for (const directory of units) {
      const result = await readManifest(directory)
      if (!result.ok) {
        // Ein ungültiges echtes Unit ist ein Befund für sich — hier sichtbar machen.
        throw new Error(`${directory}: ${result.errors.map((error) => `${error.code} ${error.message}`).join(' | ')}`)
      }
    }
  })

  test('exportieren, prüfen, importieren, rückexportieren — Inhalt stimmt überein', async () => {
    const unit = await pickSelfContainedUnit()
    // Der Fundort steht im Testnamen: wer den Nachweis liest, sieht, welches
    // echte Unit geprüft wurde und aus welchem Sprachbaum es kam.
    console.info(`[unit-export] Rundlauf über ${unit.space}/${unit.directory.split(/[\\/]/).pop()}`)
    const root = projectRoot()
    const source = await tempRoot('pmh-roundtrip-')
    const target = await tempRoot('pmh-roundtrip-ziel-')
    try {
      // 1. Export aus dem echten Baum.
      const firstPath = source.child('erst.pmhunit')
      const first = await exportUnit({
        unit: unit.directory,
        out: firstPath,
        roots: [join(root, unit.space)],
        createdAt: FROZEN,
      })
      expect(first.closure).toEqual([first.unit])
      expect(first.files).toBeGreaterThanOrEqual(2)

      // 2. Prüfen.
      const inspection = await inspectBundle(firstPath)
      expect(inspection.digestVerified).toBe(true)
      expect(inspection.source.unit).toBe(first.unit)
      expect(inspection.units.length).toBe(1)

      // 3. Import in eine frische Wurzel.
      const imported = await importBundle({
        bundle: firstPath,
        into: target.path,
        installedAt: FROZEN,
        source: { path: firstPath },
      })
      expect(imported.digest).toBe(first.digest)
      expect(imported.rolledBack).toBe(false)

      const installed = join(target.path, first.unit)
      const readBack = await readManifest(installed)
      expect(readBack.ok).toBe(true)
      expect(readBack.value?.name).toBe(first.unit)
      expect(readBack.value?.version).toBe(first.version)

      // 4. Rückexport aus der Installation — Inhalt und Nutzlast müssen gleich sein.
      const secondPath = source.child('zurueck.pmhunit')
      const second = await exportUnit({
        unit: installed,
        out: secondPath,
        roots: [target.path],
        createdAt: FROZEN,
      })

      expect(second.unit).toBe(first.unit)
      expect(second.version).toBe(first.version)
      expect(second.contentDigest).toBe(first.contentDigest)
      expect(second.bundle.files).toEqual(first.bundle.files)
      expect(second.bundle.closure).toEqual(first.bundle.closure)

      const firstBytes = await readFile(firstPath)
      const secondBytes = await readFile(secondPath)
      // Der Bündeldigest deckt das Manifest mit ab; das Manifest nennt die
      // Quelldatei (`createdAt` ist festgehalten, der Exportpfad nicht).
      // Deshalb wird hier die Nutzlast verglichen — sie ist der Inhalt.
      const firstPayload = firstBytes.subarray(firstBytes.byteLength - first.bundle.payloadBytes)
      const secondPayload = secondBytes.subarray(secondBytes.byteLength - second.bundle.payloadBytes)
      expect(secondPayload.equals(firstPayload)).toBe(true)
      expect(second.digest).toBe(second.bundle.digest)
    }
    finally {
      await source.cleanup()
      await target.cleanup()
    }
  })

  test('zweimal exportieren aus derselben Quelle ergibt byte-gleiche Bündel', async () => {
    const unit = await pickSelfContainedUnit()
    const root = projectRoot()
    const work = await tempRoot('pmh-bytegleich-')
    try {
      const first = work.child('a.pmhunit')
      const second = work.child('b.pmhunit')
      const options = {
        unit: unit.directory,
        roots: [join(root, unit.space)],
        createdAt: FROZEN,
      } as const
      const one = await exportUnit({ ...options, out: first })
      const two = await exportUnit({ ...options, out: second })
      expect(two.digest).toBe(one.digest)
      const oneBytes = await readFile(first)
      const twoBytes = await readFile(second)
      expect(twoBytes.equals(oneBytes)).toBe(true)
    }
    finally {
      await work.cleanup()
    }
  })

  test('die Registry findet das echte Unit wieder', async () => {
    const unit = await pickSelfContainedUnit()
    const root = projectRoot()
    const registry = await scanRegistry({ roots: [join(root, unit.space)] })
    const entry = findUnit(registry, unit.directory.split(/[\\/]/).pop() ?? '')
    expect(entry).toBeDefined()
    const manifestResult = await parseManifest({ json: JSON.parse(await readFile(join(unit.directory, 'unit.json'), 'utf8')) as unknown, directory: unit.directory })
    expect(manifestResult.ok).toBe(true)
    expect(entry?.manifest.version).toBe(manifestResult.value?.version)
  })
})
