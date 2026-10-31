/**
 * Die Laufzeit — sie hängt die Plugin-Units **einer Generation** ein.
 *
 * **Was hier die Lücke schließt.** `plugin-host.ts` konnte seit dem 12.10.
 * laden, prüfen, einhängen und abstecken — aber **nichts rief ihn auf**. Ein
 * scharf geschalteter Zeiger war damit eine Absicht ohne Wirkung. Dieses Modul
 * ist der Aufrufer: es liest die aktive Generation, bereitet jedes Plugin darin
 * vor, hängt es in Abhängigkeitsreihenfolge ein und steckt alles wieder ab.
 *
 * **Die drei Entscheidungen, die den Entwurf bestimmen.**
 *
 *  1. **Ein defektes Plugin tötet die Laufzeit nicht.** Es wird **abgewiesen und
 *     genannt**; die übrigen hängen. Das ist die Umkehrung von „fail closed":
 *     hier ist fail-closed falsch, weil ein einziges fremdes Plugin sonst den
 *     ganzen Host verhindert — und dann schaltet niemand mehr etwas ab.
 *     Abgewiesen wird trotzdem **vor** dem Laden, wo es geht.
 *  2. **Nur `kind: 'plugin'` wird eingehängt.** Dienste startet der Supervisor,
 *     Skills gehören dem Agenten, Patches dem Core. Ein `service`-Unit hier
 *     einzuhängen wäre eine zweite Startart — und damit eine zweite Wahrheit.
 *  3. **Die Reihenfolge folgt `requires`.** Ein Plugin, das einen Dienst eines
 *     anderen braucht, hängt danach; abgesteckt wird umgekehrt. Dieselbe
 *     Reihenfolge, die `PluginHost` schon für das Abstecken erzwingt.
 *
 * @module @prometheus-harness/unit-system/runtime
 */

import { resolve } from 'node:path'

import {
  PluginHost,
  UnitFailure,
  createHostApi,
  prepare,
  type Loader,
  type MountedPlugin,
  type Rejection,
} from '@prometheus-harness/unit-export'

import { layoutFor, leseGeneration, leseZeiger, listGenerationen, type GenerationRecord } from './generation.ts'
import type { ClosureUnit } from './closure.ts'

/** Was die Laufzeit einhängen soll. */
export interface RuntimeAnfrage {
  readonly projectRoot: string
  readonly stateDir?: string
  /** Die Generation; ohne Angabe `current` → `next` → die neueste. */
  readonly generation?: number
  /** Der Vertrag, den dieser Host anbietet (die Core-Fassung). */
  readonly hostContract: string
  /** Optionale Spanne, die gilt, wenn ein Unit keine nennt. */
  readonly defaultContract?: string
  /** Was die Plugins bekommen — Kanäle, Dienste, Ablagen. */
  readonly services?: Readonly<Record<string, unknown>>
  /** Nur diese Units einhängen (für einen gezielten Wechsel). */
  readonly nur?: readonly string[]
  /** Wie geladen wird; ersetzbar für Prüfungen. */
  readonly loader?: Loader
}

/** Ein Unit, das absichtlich nicht eingehängt wurde. */
export interface Uebersprungen {
  readonly name: string
  readonly grund: string
}

/** Der Zustand der Laufzeit — vollständig nachlesbar, kein versteckter Zustand. */
export interface RuntimeZustand {
  readonly ok: boolean
  /** Die Generation, aus der eingehängt wurde. */
  readonly generation: number
  readonly fingerprint: string
  readonly eingehaengt: readonly { readonly name: string; readonly version: string }[]
  readonly abgewiesen: readonly Rejection[]
  readonly uebersprungen: readonly Uebersprungen[]
}

/**
 * Die laufende Einhängung.
 *
 * Wer sie erzeugt, **muss** sie wieder stoppen — `stoppe()` steckt in
 * umgekehrter Reihenfolge ab und ist idempotent.
 */
export class UnitRuntime {
  readonly #host: PluginHost
  readonly #zustand: RuntimeZustand
  #gestoppt = false

  private constructor(host: PluginHost, zustand: RuntimeZustand) {
    this.#host = host
    this.#zustand = zustand
  }

  /** Was eingehängt ist — und was nicht. */
  get zustand(): RuntimeZustand {
    return this.#zustand
  }

  /** Die eingehängten Plugins in Einhänge-Reihenfolge. */
  get mounted(): readonly MountedPlugin[] {
    return this.#host.mounted
  }

  /**
   * Hängt die Plugin-Units einer Generation ein.
   *
   * Liefert immer eine Laufzeit — auch dann, wenn **nichts** eingehängt wurde.
   * Der Grund: ein leerer Lauf ist eine Auskunft (`ok: false`, `abgewiesen`
   * gefüllt) und kein Wurf, den ein Aufrufer erst wieder einfangen müsste, um
   * dann doch dasselbe zu melden.
   */
  static async starte(anfrage: RuntimeAnfrage): Promise<UnitRuntime> {
    const layout = layoutFor(resolve(anfrage.projectRoot), anfrage.stateDir ?? undefined)
    const nummer = anfrage.generation ?? (await leseZeiger(layout, 'current'))
      ?? (await leseZeiger(layout, 'next'))
      ?? (await listGenerationen(layout).then((alle) => (alle.length === 0 ? undefined : alle[alle.length - 1])))

    if (nummer === undefined) {
      const leere: RuntimeZustand = {
        ok: false,
        generation: 0,
        fingerprint: '',
        eingehaengt: [],
        abgewiesen: [{
          code: 'plugin-manifest',
          message: 'Keine Generation vorhanden: es gibt nichts einzuhängen.',
        }],
        uebersprungen: [],
      }
      return new UnitRuntime(new PluginHost(createHostApi(anfrage.hostContract)), leere)
    }

    let generation: GenerationRecord
    try {
      generation = await leseGeneration(layout, nummer)
    }
    catch (error) {
      const befund = (error as { error?: Rejection }).error
      const leere: RuntimeZustand = {
        ok: false,
        generation: nummer,
        fingerprint: '',
        eingehaengt: [],
        abgewiesen: [befund ?? { code: 'plugin-manifest', message: `Generation ${String(nummer)} ist nicht lesbar.` }],
        uebersprungen: [],
      }
      return new UnitRuntime(new PluginHost(createHostApi(anfrage.hostContract)), leere)
    }

    const host = new PluginHost(createHostApi(anfrage.hostContract, anfrage.services ?? {}), anfrage.loader)
    const abgewiesen: Rejection[] = []
    const uebersprungen: Uebersprungen[] = []

    // --- 1. Auswahl und Reihenfolge ------------------------------------
    const gewaehlt = generation.units.filter((unit) => anfrage.nur === undefined || anfrage.nur.includes(unit.name))
    const plugins: ClosureUnit[] = []
    for (const unit of gewaehlt) {
      if (unit.kind !== 'plugin') {
        uebersprungen.push({
          name: unit.name,
          grund: `kind "${unit.kind}" wird nicht eingehängt — Dienste startet der Supervisor, Skills gehören dem Agenten, Patches dem Core.`,
        })
        continue
      }
      // Ein `plugin` ohne Einstiegspunkt ist eine **Bibliothek**: es stellt eine
      // Fläche bereit, aber nichts, was ein Host aufrufen könnte. Das ist kein
      // Fehler, sondern eine andere Art von Beitrag — und es wird gesagt, nicht
      // verschwiegen.
      if (unit.einstieg === undefined) {
        uebersprungen.push({
          name: unit.name,
          grund: 'kein Einstiegspunkt in "entry" — eine Bibliothek, kein einhängbares Plugin.',
        })
        continue
      }
      plugins.push(unit)
    }

    const reihenfolge = sortiereNachAbhaengigkeiten(plugins, uebersprungen)

    // --- 2. Vorbereiten und einhängen ----------------------------------
    for (const unit of reihenfolge) {
      const ordner = resolve(anfrage.projectRoot, unit.directory)
      const vorbereitet = await prepare(ordner, {
        hostContract: anfrage.hostContract,
        ...(anfrage.defaultContract === undefined ? {} : { defaultContract: anfrage.defaultContract }),
        allowedRoots: [resolve(anfrage.projectRoot)],
      })
      if (!vorbereitet.ok || vorbereitet.prepared === undefined) {
        for (const befund of vorbereitet.errors) abgewiesen.push({ ...befund, unit: unit.name })
        continue
      }
      try {
        await host.mount(vorbereitet.prepared)
      }
      catch (error) {
        if (error instanceof UnitFailure) {
          // `PluginHost` hat den Grund schon gebucht; hier nur weiterlaufen.
          continue
        }
        abgewiesen.push({
          code: 'plugin-lebenszyklus',
          message: `"${unit.name}" konnte nicht eingehängt werden: ${(error as Error).message}`,
          unit: unit.name,
        })
      }
    }

    const eingehaengt = host.mounted.map((plugin) => ({ name: plugin.name, version: plugin.version }))
    const zustand: RuntimeZustand = {
      // `ok` heißt **nichts wurde abgewiesen** — nicht „es wurde etwas
      // eingehängt". Eine Generation ohne Plugins ist kein Fehler, sondern eine
      // Generation ohne Plugins; wer das verwechselt, meldet einen guten Zustand
      // als Ausfall.
      ok: abgewiesen.length === 0 && host.rejected.length === 0,
      generation: generation.number,
      fingerprint: generation.fingerprint,
      eingehaengt,
      abgewiesen: [...abgewiesen, ...host.rejected],
      uebersprungen,
    }
    return new UnitRuntime(host, zustand)
  }

  /**
   * Steckt alles ab, in umgekehrter Einhänge-Reihenfolge.
   *
   * Idempotent: ein zweiter Aufruf steckt nichts mehr ab und ist kein Fehler.
   * Ein Aufräumpfad, der beim zweiten Mal wirft, wird beim ersten Mal
   * übersprungen.
   */
  async stoppe(): Promise<readonly MountedPlugin[]> {
    if (this.#gestoppt) return []
    this.#gestoppt = true
    return await this.#host.unmountAll()
  }
}

/**
 * Bringt die Plugin-Units in eine Reihenfolge, in der jede Abhängigkeit vor
 * ihrem Verbraucher steht.
 *
 * Zwei Fälle, die **nicht** zum Abbruch führen: ein Zyklus (dann bleibt die
 * alphabetische Reihenfolge und der Zyklus wird als übersprungen genannt) und
 * eine Abhängigkeit, die gar nicht eingehängt wird (dann meldet `PluginHost`
 * sie beim Einhängen, und zwar **vor** dem Laden).
 */
function sortiereNachAbhaengigkeiten(
  plugins: readonly ClosureUnit[],
  uebersprungen: Uebersprungen[],
): readonly ClosureUnit[] {
  const nachName = new Map(plugins.map((unit) => [unit.name, unit]))
  const plaziert = new Set<string>()
  const reihenfolge: ClosureUnit[] = []
  const imPfad = new Set<string>()

  const besuche = (unit: ClosureUnit): void => {
    if (plaziert.has(unit.name)) return
    if (imPfad.has(unit.name)) {
      uebersprungen.push({ name: unit.name, grund: 'Zyklus in "requires" — die Reihenfolge muß geraten werden.' })
      return
    }
    imPfad.add(unit.name)
    for (const bedarf of [...unit.requires].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      const abhaengig = nachName.get(bedarf)
      if (abhaengig !== undefined) besuche(abhaengig)
    }
    imPfad.delete(unit.name)
    if (plaziert.has(unit.name)) return
    plaziert.add(unit.name)
    reihenfolge.push(unit)
  }

  for (const unit of [...plugins].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) besuche(unit)
  return reihenfolge
}
