/**
 * Prüfgerüst: ein Wegwerf-Projekt auf der Platte.
 *
 * **Warum eine echte Platte und kein Attrappen-Objektsystem.** Die Fragen, um die
 * es hier geht, sind Fragen an das Dateisystem: Wird ein Zeiger atomar ersetzt?
 * Bleibt eine Generation nach `prune` liegen? Trägt eine Datei nach dem Kopieren
 * noch denselben Hash? Ein Speicher-Attrappen beantwortet keine davon — es
 * beantwortet nur, ob der Kode seine eigenen Annahmen wiederholt.
 *
 * @module tests/fixtures
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Ein Unit, wie es für eine Prüfung gebraucht wird. */
export interface TestUnit {
  readonly name: string
  readonly version?: string
  readonly kind?: 'plugin' | 'service'
  readonly requires?: readonly string[]
  readonly reload?: 'hot' | 'idle' | 'boot'
  readonly irreversible?: boolean
  /** Der Einstiegspunkt — nötig, damit `prepare` das Unit einhängen kann. */
  readonly entry?: string
  /** Dateien im Unit-Ordner; der Inhalt entscheidet über den Inhaltsdigest. */
  readonly files?: Readonly<Record<string, string>>
}

/** Ein Wegwerf-Projekt samt Deklaration. */
export interface TestProjekt {
  readonly root: string
  /** Räumt das Verzeichnis weg. */
  readonly aufraeumen: () => Promise<void>
}

/**
 * Baut ein Projekt: `units/<name>/unit.json` je Unit, dazu `harness/units.json`.
 *
 * Die Deklaration wird aus den Units abgeleitet, damit eine Prüfung nicht
 * versehentlich an einer vergessenen Zeile scheitert statt an der Sache.
 */
export async function baueProjekt(
  units: readonly TestUnit[],
  optionen: { readonly declaration?: unknown; readonly wurzel?: string; readonly dateien?: Readonly<Record<string, string>> } = {},
): Promise<TestProjekt> {
  const root = await mkdtemp(join(tmpdir(), 'pmh-gen-'))
  const wurzel = optionen.wurzel ?? 'units'

  for (const unit of units) {
    const ordner = join(root, wurzel, unit.name)
    await mkdir(ordner, { recursive: true })
    const manifest = {
      name: unit.name,
      version: unit.version ?? '0.1.0',
      kind: unit.kind ?? 'plugin',
      language: 'typescript',
      description: `Testunit ${unit.name}`,
      core: 'optional' as const,
      ...(unit.entry === undefined ? {} : { entry: { command: unit.entry, args: [] } }),
      ...(unit.requires === undefined ? {} : { requires: [...unit.requires] }),
      ...(unit.reload === undefined ? {} : { reload: unit.reload }),
      ...(unit.irreversible === undefined ? {} : { irreversible: unit.irreversible }),
    }
    await writeFile(join(ordner, 'unit.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    const dateien = unit.files ?? { 'index.ts': `export const name = '${unit.name}'\n` }
    for (const [pfad, inhalt] of Object.entries(dateien)) {
      const ziel = join(ordner, pfad)
      await mkdir(dirname(ziel), { recursive: true })
      await writeFile(ziel, inhalt, 'utf8')
    }
  }

  for (const [pfad, inhalt] of Object.entries(optionen.dateien ?? {})) {
    const ziel = join(root, pfad)
    await mkdir(dirname(ziel), { recursive: true })
    await writeFile(ziel, inhalt, 'utf8')
  }

  const declaration = optionen.declaration ?? {
    format: 1,
    core: { version: '0.2.1-alpha.2', contract: '^0.2.0' },
    roots: [wurzel],
    units: units.map((unit) => ({ name: unit.name })),
    // **`requireCheck: false` in der Vorgabe der Prüfvorlage.** Fast alle
    // Prüfungen hier interessieren sich für Bauen, Zeiger und Rückweg, nicht für
    // das Tor. Wer das Tor prüfen will, setzt es ausdrücklich — dann steht in der
    // Prüfung selbst, worum es geht.
    policy: { requireCheck: false },
  }
  await mkdir(join(root, 'harness'), { recursive: true })
  await writeFile(join(root, 'harness', 'units.json'), `${JSON.stringify(declaration, null, 2)}\n`, 'utf8')

  return {
    root,
    aufraeumen: async () => {
      await rm(root, { recursive: true, force: true })
    },
  }
}

/** Schreibt eine Datei im Projekt, mit angelegten Ordnern. */
export async function schreibe(root: string, pfad: string, inhalt: string): Promise<void> {
  const ziel = join(root, pfad)
  await mkdir(join(ziel, '..'), { recursive: true })
  await writeFile(ziel, inhalt, 'utf8')
}
