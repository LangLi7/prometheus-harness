/**
 * Der Abschluß — welche Units gelten, wenn diese Deklaration gilt.
 *
 * **Was hier passiert, in einem Satz:** die Deklaration nennt Wünsche, die
 * Registry nennt Wirklichkeit, und dieses Modul entscheidet, ob beides
 * zusammenpaßt — mit **allen** Befunden, nicht mit dem ersten.
 *
 * **Die drei Fehler, die man hier leicht macht.**
 *
 *  1. **Den Abschluß nur aus der Deklaration lesen.** Dann fehlt jede
 *     Abhängigkeit, die ein Unit in seinem `unit.json` nennt, und die Generation
 *     ist unvollständig, ohne daß es jemand merkt. Deshalb wird `requires`
 *     transitiv aufgelöst — über dieselbe Registry-Auflösung, die schon
 *     `unit-export` benutzt.
 *  2. **Ein abgeschaltetes Unit stillschweigend mitnehmen.** Wer A abschaltet
 *     und B behält, das A braucht, bekommt sonst eine Generation, die beim Start
 *     scheitert — und zwar später, an anderer Stelle. Deshalb ist das ein
 *     Befund `generation_declaration_unit_disabled`.
 *  3. **Einen Takt raten.** Der Takt eines Units ist eine behauptete
 *     Eigenschaft; die Vorgabe ist `boot`, weil das die einzige Annahme ist, die
 *     niemanden täuscht.
 *
 * @module @prometheus-harness/unit-system/closure
 */

import { join, relative, resolve } from 'node:path'

import {
  findUnit,
  hoechsterTakt,
  scanRegistry,
  unitError,
  type HostContract,
  type Registry,
  type RegistryEntry,
  type UnitError,
  type UnitKind,
  type UnitLanguage,
  type UnitReload,
} from '@prometheus-harness/unit-export'

import type { Declaration } from './declaration.ts'
import { hashFile, inhaltsDigest, sammleDateien, zuPosix, type DateiAbdruck } from './hash.ts'

/** Ein Unit, wie es in einer Generation steht. */
export interface ClosureUnit {
  readonly name: string
  readonly version: string
  readonly kind: UnitKind
  readonly language: UnitLanguage
  /** Der Takt, mit dem dieses Unit gewechselt werden kann. */
  readonly reload: UnitReload
  /** Woher der Takt stammt: aus der Deklaration oder aus `unit.json`. */
  readonly reloadSource: 'declaration' | 'manifest' | 'default'
  /** `true` = Einbahnstraße; verlangt ausdrückliche Freigabe. */
  readonly irreversible: boolean
  /** Inhaltsdigest über alle Dateien des Unit-Ordners. */
  readonly contentDigest: string
  /** Der Unit-Ordner, relativ zur Projektwurzel wenn möglich, sonst absolut. */
  readonly directory: string
  /**
   * Der deklarierte Einstiegspunkt, falls es einen gibt.
   *
   * **Er entscheidet, ob ein `plugin`-Unit einhängbar ist.** Ein Unit ohne
   * Einstiegspunkt ist eine **Bibliothek**, kein Plugin: es stellt eine Fläche
   * bereit, aber nichts, was ein Host aufrufen könnte. Ohne dieses Feld müßte die
   * Laufzeit das am Fehlschlag von `prepare` erraten — und würde dabei einen
   * Ausbruch aus der Wurzel mit einer Bibliothek verwechseln.
   */
  readonly einstieg?: string
  /** Die Registry-Wurzel, in der es gefunden wurde. */
  readonly rootLabel: string
  readonly provides: readonly string[]
  readonly requires: readonly string[]
  /** Ob die Deklaration es ausdrücklich genannt hat (sonst: Abhängigkeit). */
  readonly declared: boolean
}

/** Eine Datei der Implementierung (Schicht, Pin, Vorlage). */
export interface ClosureFile {
  readonly path: string
  readonly sha256: string
  readonly size: number
  readonly required: boolean
}

/** Das Ergebnis der Abschlußauflösung. */
export interface Closure {
  readonly units: readonly ClosureUnit[]
  readonly files: readonly ClosureFile[]
  /** Der teuerste Takt im ganzen Abschluß. */
  readonly takt: UnitReload
  /** `true`, wenn irgendein Unit eine Einbahnstraße ist. */
  readonly irreversible: boolean
  /** Befunde, die **nicht** blockieren (Warnungen, Hinweise). */
  readonly warnings: readonly UnitError[]
}

/** Das Ergebnis einer Prüfung: entweder ein Abschluß oder Befunde. */
export type ClosureResult =
  | { readonly ok: true; readonly closure: Closure; readonly registry: Registry }
  | { readonly ok: false; readonly errors: readonly UnitError[]; readonly warnings: readonly UnitError[]; readonly registry: Registry }

/** Wie der Abschluß aufgelöst wird. */
export interface ClosureRequest {
  readonly projectRoot: string
  readonly declaration: Declaration
  readonly host?: HostContract
}

function rel(projectRoot: string, path: string): string {
  const absolut = resolve(path)
  const relativ = relative(projectRoot, absolut)
  if (relativ.length === 0) return '.'
  return relativ.startsWith('..') ? zuPosix(absolut) : zuPosix(relativ)
}

/**
 * Löst den Abschluß auf.
 *
 * Wirft nicht: jeder Grund, warum die Generation nicht baubar ist, kommt als
 * Befund zurück. Ein Wurf nach dem ersten Fehler würde den Menschen zwingen,
 * die Deklaration in mehreren Runden zu reparieren.
 */
export async function loeseAbschluss(request: ClosureRequest): Promise<ClosureResult> {
  const projectRoot = resolve(request.projectRoot)
  const declaration = request.declaration
  const errors: UnitError[] = []
  const warnings: UnitError[] = []

  const registry = await scanRegistry({
    roots: declaration.roots.map((pfad) => ({ path: join(projectRoot, pfad), label: pfad })),
    ...(request.host === undefined ? {} : { host: request.host }),
  })

  // Fehlende Wurzeln sind ein Fehler, kein Hinweis: wer eine Wurzel deklariert,
  // erwartet dort Units. Eine stumm leere Wurzel ist die häufigste Ursache
  // einer Generation, die „erfolgreich" nichts enthält.
  for (const wurzel of registry.roots) {
    if (!wurzel.exists) {
      errors.push(unitError(
        'generation_declaration_root_missing',
        `Die deklarierte Wurzel "${wurzel.label}" existiert nicht (${wurzel.path}).`,
        `units.json#/roots`,
      ))
    }
  }
  // Registry-Befunde blockieren hier nicht: ein defektes `unit.json` in einer
  // nicht deklarierten Ecke soll sichtbar sein, aber nicht die Generation sperren.
  // Es kommt ohnehin nicht in den Abschluß — es ist nicht auffindbar.
  for (const befund of registry.diagnostics) {
    warnings.push(befund)
  }

  // --- 1. Deklarierte Units auflösen -------------------------------------
  const enabled = new Map<string, { entry: RegistryEntry; declared: true; reload?: UnitReload }>()
  const disabled = new Set<string>()

  for (const deklariert of declaration.units) {
    const eintrag = findUnit(registry, deklariert.name, deklariert.version === undefined ? {} : { version: deklariert.version })
    if (eintrag === undefined) {
      errors.push(unitError(
        'generation_declaration_unit_unknown',
        `"${deklariert.name}" ist in keiner Wurzel installiert${deklariert.version === undefined ? '' : ` (verlangt: ${deklariert.version})`}.`,
        `units.json#/units`,
        { unit: deklariert.name },
      ))
      continue
    }
    const schluessel = eintrag.manifest.name.toLowerCase()
    if (!deklariert.enabled) {
      disabled.add(schluessel)
      continue
    }
    enabled.set(schluessel, {
      entry: eintrag,
      declared: true,
      ...(deklariert.reload === undefined ? {} : { reload: deklariert.reload }),
    })
  }

  // --- 2. `requires` transitiv schließen ---------------------------------
  const besucht = new Set<string>()
  const reihenfolge: RegistryEntry[] = []
  const taktAusDeklaration = new Map<string, UnitReload>()

  const lauf = (eintrag: RegistryEntry, pfad: readonly string[]): void => {
    const schluessel = eintrag.manifest.name.toLowerCase()
    if (besucht.has(schluessel)) return
    if (pfad.some((element) => element.toLowerCase() === schluessel)) {
      errors.push(unitError(
        'registry_dependency_cycle',
        `Abhängigkeitszyklus: ${[...pfad, eintrag.manifest.name].join(' -> ')}.`,
        eintrag.manifest.name,
      ))
      return
    }
    besucht.add(schluessel)
    reihenfolge.push(eintrag)
    const sortiert = [...eintrag.manifest.requires].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    for (const bedarf of sortiert) {
      const abhaengig = findUnit(registry, bedarf)
      if (abhaengig === undefined) {
        errors.push(unitError(
          'registry_dependency_missing',
          `"${bedarf}" fehlt; gebraucht von "${eintrag.manifest.name}".`,
          eintrag.manifest.name,
          { unit: bedarf },
        ))
        continue
      }
      const abhaengigSchluessel = abhaengig.manifest.name.toLowerCase()
      if (disabled.has(abhaengigSchluessel)) {
        errors.push(unitError(
          'generation_declaration_unit_disabled',
          `"${abhaengig.manifest.name}" ist abgeschaltet, wird aber von "${eintrag.manifest.name}" gebraucht.`,
          'units.json#/units',
          { unit: abhaengig.manifest.name },
        ))
        continue
      }
      lauf(abhaengig, [...pfad, eintrag.manifest.name])
    }
  }

  for (const { entry, reload } of enabled.values()) {
    if (reload !== undefined) taktAusDeklaration.set(entry.manifest.name.toLowerCase(), reload)
    lauf(entry, [])
  }

  // --- 3. Units abdrucken ------------------------------------------------
  const units: ClosureUnit[] = []
  for (const eintrag of reihenfolge) {
    const schluessel = eintrag.manifest.name.toLowerCase()
    const dateien = await sammleDateien(eintrag.directory)
    const ausDeklaration = taktAusDeklaration.get(schluessel)
    const ausManifest = eintrag.manifest.reload
    const reload: UnitReload = ausDeklaration ?? ausManifest ?? 'boot'
    const reloadSource: ClosureUnit['reloadSource'] = ausDeklaration !== undefined
      ? 'declaration'
      : ausManifest !== undefined ? 'manifest' : 'default'
    units.push({
      name: eintrag.manifest.name,
      version: eintrag.manifest.version,
      kind: eintrag.manifest.kind,
      language: eintrag.manifest.language,
      reload,
      reloadSource,
      irreversible: eintrag.manifest.irreversible === true,
      contentDigest: inhaltsDigest(eintrag.manifest.name, dateien),
      directory: rel(projectRoot, eintrag.directory),
      ...(eintrag.manifest.entry === undefined ? {} : { einstieg: eintrag.manifest.entry.command }),
      rootLabel: eintrag.rootLabel,
      provides: [...eintrag.manifest.provides],
      requires: [...eintrag.manifest.requires],
      declared: enabled.has(schluessel),
    })
  }
  units.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  // --- 4. Dateien der Implementierung ------------------------------------
  const files: ClosureFile[] = []
  for (const datei of declaration.files) {
    const absolut = join(projectRoot, datei.path)
    try {
      const { sha256, size } = await hashFile(absolut)
      files.push({ path: zuPosix(datei.path), sha256, size, required: datei.required })
    }
    catch (error) {
      const code = (error as { code?: string }).code
      const fehlt = code === 'ENOENT' || code === 'EISDIR'
      if (datei.required || !fehlt) {
        errors.push(unitError(
          'generation_declaration_file_missing',
          `Die deklarierte Datei "${datei.path}" ist nicht lesbar: ${(error as Error).message}`,
          `units.json#/files`,
          { path: datei.path },
        ))
      }
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  // --- 5. Takt und Einbahnstraße -----------------------------------------
  let takt: UnitReload = 'hot'
  let irreversible = false
  for (const unit of units) {
    takt = hoechsterTakt(takt, unit.reload)
    irreversible ||= unit.irreversible
  }

  if (errors.length > 0) return { ok: false, errors, warnings, registry }

  return {
    ok: true,
    registry,
    closure: { units, files, takt, irreversible, warnings },
  }
}

/** Die Abdrücke eines Abschlusses als einfache Liste — für das Bündel. */
export function abdrueckeDerDateien(files: readonly ClosureFile[]): readonly DateiAbdruck[] {
  return files.map((datei) => ({ path: datei.path, sha256: datei.sha256, size: datei.size }))
}
