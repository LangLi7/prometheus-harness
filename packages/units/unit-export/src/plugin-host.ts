/**
 * Plugin-Host — laden, prüfen, einhängen, abstecken.
 *
 * **Warum dieses Modul die schwierigste Stelle von t14 ist.** Bis hierher war
 * „Plugin-Export" eine Dateioperation: ein Unit wird zu einem Bündel, ein Bündel
 * wieder zu Dateien. Der Export allein macht aber noch keinen Harness, in dem
 * Plugins **laufen**. Dafür braucht es die andere Hälfte: etwas, das ein
 * installiertes Unit **lädt**, gegen sein Manifest und den Core-Vertrag
 * **prüft**, **einhängt** und wieder **absteckt**.
 *
 * **Die Randbedingung, die den Entwurf bestimmt.** Der Upstream-Harness hängt
 * Plugins über `PluginPackages` ein — dieses Plugin braucht den Laufzeit-
 * Interzeptor `node-addon-require-builtin`, um bare Modulnamen im laufenden
 * Prozess umzubiegen. Dieses native Addon ist **unter Bun nicht ladbar**
 * (gemessen: `Unsupported/no-context`, `has_v8_context: false`, Bun 1.4.0;
 * festgehalten in `docs/risks.md` §6). Dieser Host stützt sich deshalb
 * **ausdrücklich nicht** darauf:
 *
 * | Upstream-Weg | Weg dieses Hosts |
 * |---|---|
 * | Interzeptor biegt `import 'x'` im Prozess um | **dynamischer Import über einen absoluten URL-Pfad** — kein Interzeptor, keine Umbiegung |
 * | beliebige Modulnamen auflösbar | **nur der Einstiegspunkt des Unit**, und nur aus dem Einhänge-Verzeichnis oder der Registry |
 * | Auflösung ist unsichtbar | **Whitelist**: jeder Ein-/Ausstiegspunkt wird gegen die Liste geprüft, protokolliert und ist damit prüfbar |
 *
 * **Native Addons werden abgelehnt, nicht umgangen.** Ein Unit, dessen Manifest
 * ein natives Addon nennt, wird **fail-closed** abgewiesen (`plugin-native-addon`).
 * Ein stiller Rückfall auf ein anderes Modul wäre schlimmer als ein klarer
 * Fehler: der Benutzer glaubt sonst, sein Plugin laufe.
 *
 * @module @prometheus-harness/unit-export/plugin-host
 */

import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { unitError, UnitFailure, type UnitError, type UnitErrorCode } from './errors.ts'
import { MANIFEST_FILE, parseManifest, satisfiesContract, type UnitManifest } from './manifest.ts'
import { PROVENANCE_FILE, scanRegistry, type Provenance, type Registry } from './registry.ts'

// ---------------------------------------------------------------------------
// Öffentliche Typen
// ---------------------------------------------------------------------------

/** Ein Einhängepunkt: der Vertrag, den der Host einem Plugin anbietet. */
export interface HostApi {
  /** Stabile Kennung dieses Hosts, wie sie das Plugin im Manifest verlangt. */
  readonly contract: string
  /** Freier Platz für das, was der Host dem Plugin reicht (Log, Dienste, …). */
  readonly services: Readonly<Record<string, unknown>>
}

/** Was ein Plugin-Modul bereitstellen muss. */
export interface PluginModule {
  /** Name des Plugins, wie im Manifest deklariert. */
  readonly name?: string
  /**
   * Wird beim Einhängen aufgerufen. Bekommt die Host-Fläche und gibt
   * optional eine Absteck-Funktion zurück.
   */
  readonly apply?: (host: HostApi, config?: unknown) => void | Promise<void> | (() => void | Promise<void>)
}

/** Wie ein Plugin geladen wird. */
export type Loader = (entryUrl: string) => Promise<unknown>

/** Zustand eines eingehängten Plugins. */
export type MountState = 'eingehaengt' | 'abgesteckt'

/** Warum ein Plugin abgewiesen wurde. */
export interface Rejection extends UnitError {
  /** Der Name des abgewiesenen Units, sofern bekannt. */
  readonly unit?: string
}

/** Ein geprüftes, aber noch nicht eingehängtes Plugin. */
export interface PreparedPlugin {
  /** Manifest, gegen das geprüft wurde. */
  readonly manifest: UnitManifest
  /** Absolute URL des Einstiegspunkts (für den dynamischen Import). */
  readonly entryUrl: string
  /** Absolute Pfade, die dieses Plugin öffnen darf (Whitelist). */
  readonly allowedPaths: readonly string[]
  /** Herkunft aus dem Bündel, falls das Unit aus einem Import stammt. */
  readonly provenance?: Provenance
}

/** Ein eingehängtes Plugin. */
export interface MountedPlugin {
  readonly name: string
  readonly version: string
  readonly state: MountState
  readonly entryUrl: string
  /** Was das Plugin beim Einhängen hinterlassen hat, falls es etwas hinterließ. */
  readonly unmount?: () => void | Promise<void>
}

/** Ergebnis einer Prüfung. */
export interface PrepareResult {
  readonly ok: boolean
  readonly prepared?: PreparedPlugin
  readonly errors: readonly UnitError[]
}

/** Buchführung des Hosts — kein versteckter Zustand, alles nachlesbar. */
export interface HostLedger {
  /** Reihenfolge des Einhängens (für das Abstecken in umgekehrter Folge). */
  readonly mounted: readonly string[]
  /** Jede abgewiesene Einhängung mit Grund. */
  readonly rejected: readonly Rejection[]
}

// ---------------------------------------------------------------------------
// Fehlerkennungen dieses Moduls
// ---------------------------------------------------------------------------

/** Fehlercode: das Unit verlangt ein natives Addon, das unter Bun nicht trägt. */
export const ERROR_NATIVE_ADDON: UnitErrorCode = 'plugin-native-addon'
/** Fehlercode: Einstiegspunkt fehlt, liegt außerhalb oder ist kein Modul. */
export const ERROR_ENTRY: UnitErrorCode = 'plugin-einstieg'
/** Fehlercode: Modul geladen, aber es ist kein Plugin (kein `apply`). */
export const ERROR_NOT_A_PLUGIN: UnitErrorCode = 'plugin-kein-plugin'
/** Fehlercode: Vertrag des Hosts und Anforderung des Units passen nicht. */
export const ERROR_CONTRACT: UnitErrorCode = 'plugin-vertrag'
/** Fehlercode: Abhängigkeit eines Plugins ist nicht eingehängt. */
export const ERROR_DEPENDENCY: UnitErrorCode = 'plugin-abhaengigkeit'
/** Fehlercode: Plugin wirft beim Einhängen oder Abstecken. */
export const ERROR_LIFECYCLE: UnitErrorCode = 'plugin-lebenszyklus'
/** Fehlercode: Manifest nicht lesbar oder ungültig. */
export const ERROR_MANIFEST: UnitErrorCode = 'plugin-manifest'

/**
 * Muster, mit denen ein natives Addon erkannt wird.
 *
 * **Woher die Liste kommt:** Der Referenz-Harness baut zwei native Addons aus
 * dem Quellcode (`koffi`, `node-pty`) und benutzt ein drittes
 * (`node-addon-require-builtin`). Alle drei sind unter Bun ungeprüft oder, im
 * dritten Fall, gemessen unbrauchbar. Die Erkennung ist deshalb **absichtlich
 * breit**: lieber ein fälschlich abgewiesenes Plugin als ein stillschweigend
 * nicht laufendes.
 */
export const NATIVE_ADDON_MARKERS: readonly string[] = [
  'node-addon-require-builtin',
  'node-gyp-build',
  'node-gyp',
  'node-pty',
  'koffi',
  '.node',
  'napi-rs',
  '@napi-rs/',
  'prebuild-install',
]

/**
 * Dateien, die ein Unit als Beleg führen darf, ohne dass sie als Einstiegspunkt
 * oder natives Addon gelten.
 */
export const NON_CODE_FILES: readonly string[] = [MANIFEST_FILE, PROVENANCE_FILE, 'README.md']

// ---------------------------------------------------------------------------
// Der Host
// ---------------------------------------------------------------------------

/** Baut eine Host-Fläche mit Vertragskennung. */
export function createHostApi(contract: string, services: Readonly<Record<string, unknown>> = {}): HostApi {
  return { contract, services }
}

/**
 * Prüft ein Manifest auf Eigenschaften, die unter Bun nicht tragen.
 *
 * Getrennt von {@link prepare}, damit die Ablehnungsregeln **einzeln** prüfbar
 * sind und nicht in einem großen Ablauf verschwinden.
 *
 * @param manifest - das zu prüfende Manifest
 * @param raw - der rohe Manifest-Text (für die Textsuche nach Addon-Namen)
 * @returns die Befunde; leer heißt „unbedenklich"
 */
export function checkNativeAddons(manifest: UnitManifest, raw: string): UnitError[] {
  const found = new Set<string>()
  const haystack = raw.toLowerCase()
  for (const marker of NATIVE_ADDON_MARKERS) {
    if (haystack.includes(marker.toLowerCase())) found.add(marker)
  }
  if (found.size === 0) return []
  return [
    unitError(
      ERROR_NATIVE_ADDON,
      `Das Unit nennt ein natives Addon (${[...found].join(', ')}). Unter Bun tragen native Addons nicht ` +
        `(belegt: node-addon-require-builtin, docs/risks.md §6). Ein solches Plugin wird abgewiesen statt ` +
        `stillschweigend nicht zu laufen.`,
      `${MANIFEST_FILE}`,
      { unit: manifest.name, marker: [...found].join(', ') },
    ),
  ]
}

/**
 * Prüft, ob ein Pfad innerhalb eines erlaubten Wurzelverzeichnisses liegt.
 *
 * Das ist eine **Sicherheitsgrenze**, keine Formalie: ohne sie könnte ein
 * Manifest einen Einstiegspunkt wie `../../../../etc/passwd` oder einen
 * absoluten Pfad außerhalb der Registry nennen und der Host würde ihn laden.
 *
 * @param root - erlaubtes Wurzelverzeichnis (absolut)
 * @param candidate - zu prüfender Pfad
 * @returns `true`, wenn der Pfad innerhalb von `root` liegt
 */
export function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate))
  if (rel === '') return true
  if (isAbsolute(rel)) return false
  return !rel.startsWith(`..${sep}`) && rel !== '..'
}

/** Zerlegt den Einstiegspunkt eines Manifests in Datei und Argumente. */
export function splitEntry(entry: string): { readonly file: string; readonly args: readonly string[] } {
  const [file = '', ...args] = entry.trim().split(/\s+/u)
  return { file, args }
}

/**
 * Bereitet ein Unit zum Einhängen vor: Manifest lesen, prüfen, Einstiegspunkt
 * gegen die Whitelist auflösen.
 *
 * **Was hier absichtlich NICHT geschieht:** es wird nichts importiert. Die
 * Vorbereitung ist rein lesend; ein Modul wird erst in {@link mount} geladen.
 * Damit ist „prüfen" von „ausführen" getrennt — und ein abgewiesenes Plugin
 * wurde nie ausgeführt.
 *
 * @param unitDir - Verzeichnis des installierten Units
 * @param options - Host-Vertrag und erlaubte Wurzelverzeichnisse
 * @returns Prüfergebnis mit vorbereitetem Plugin oder Befunden
 */
export async function prepare(
  unitDir: string,
  options: {
    readonly hostContract: string
    /** Spanne, die gilt, wenn das Unit selbst keine nennt. */
    readonly defaultContract?: string
    readonly allowedRoots?: readonly string[]
    readonly allowedEntryExtensions?: readonly string[]
  },
): Promise<PrepareResult> {
  const dir = resolve(unitDir)
  const manifestPath = join(dir, MANIFEST_FILE)

  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf8')
  } catch (cause) {
    return {
      ok: false,
      errors: [
        unitError(ERROR_MANIFEST, `Manifest nicht lesbar: ${MANIFEST_FILE} fehlt oder ist nicht zugänglich.`, MANIFEST_FILE, {
          dir: dir.split(sep).slice(-2).join('/'),
          cause: cause instanceof Error ? cause.name : 'unbekannt',
        }),
      ],
    }
  }

  const parsed = parseManifest({ json: JSON.parse(raw) as unknown, directory: dir })
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors }
  }
  const manifest = parsed.value

  // --- Vertrag ---
  // `manifest.core` sagt nur, OB das Unit den Core braucht (`optional` /
  // `required_core`); die verlangte Vertrags-SPANNE steht in `manifest.contract`.
  // Verglichen wird deshalb die Spanne des Units mit der Version, die dieser Host
  // anbietet — nicht die Core-Angabe. Reihenfolge wie in der Registry:
  // satisfiesContract(gebotene Version, verlangte Spanne).
  const errors: UnitError[] = []
  const requiredRange = manifest.contract ?? options.defaultContract
  if (requiredRange !== undefined && !satisfiesContract(options.hostContract, requiredRange)) {
    errors.push(
      unitError(
        ERROR_CONTRACT,
        `Das Unit verlangt den Core-Vertrag "${requiredRange}", dieser Host bietet "${options.hostContract}".`,
        `${MANIFEST_FILE}#/contract`,
        { unit: manifest.name, gefordert: requiredRange, geboten: options.hostContract },
      ),
    )
  }
  if (manifest.core === 'required_core' && requiredRange === undefined) {
    // Fail-closed: ein Unit, das den Core ausdrücklich verlangt, aber keine
    // Spanne nennt, lässt sich nicht prüfen. Es durchzuwinken wäre die stille
    // Annahme, die dieses Modul gerade vermeiden will.
    errors.push(
      unitError(
        ERROR_CONTRACT,
        'Das Unit verlangt den Core ("required_core"), nennt aber keinen Vertrag; ohne Spanne ist nicht prüfbar, ob dieser Host passt.',
        `${MANIFEST_FILE}#/contract`,
        { unit: manifest.name, geboten: options.hostContract },
      ),
    )
  }

  // --- Native Addons ---
  errors.push(...checkNativeAddons(manifest, raw))

  // --- Einstiegspunkt ---
  const { file } = splitEntry(manifest.entry?.command ?? '')
  const hostRoots = options.allowedRoots ?? [dir]
  let entryUrl = ''
  if (file === '') {
    errors.push(
      unitError(ERROR_ENTRY, 'Das Unit nennt keinen Einstiegspunkt.', `${MANIFEST_FILE}#/entry`, { unit: manifest.name }),
    )
  } else {
    const candidate = isAbsolute(file) ? file : resolve(dir, file)
    const inside = hostRoots.some((root) => isInside(root, candidate))
    if (!inside) {
      errors.push(
        unitError(
          ERROR_ENTRY,
          'Der Einstiegspunkt liegt außerhalb der erlaubten Wurzelverzeichnisse und wird nicht geladen.',
          `${MANIFEST_FILE}#/entry/command`,
          { unit: manifest.name, erlaubteWurzeln: hostRoots.length },
        ),
      )
    } else {
      try {
        const info = await stat(candidate)
        if (!info.isFile()) {
          errors.push(
            unitError(ERROR_ENTRY, 'Der Einstiegspunkt ist keine Datei.', `${MANIFEST_FILE}#/entry/command`, {
              unit: manifest.name,
            }),
          )
        } else {
          entryUrl = pathToFileURL(candidate).href
        }
      } catch {
        errors.push(
          unitError(ERROR_ENTRY, 'Der Einstiegspunkt existiert nicht.', `${MANIFEST_FILE}#/entry/command`, {
            unit: manifest.name,
            datei: file,
          }),
        )
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  const provenance = await readProvenanceIfPresent(dir)
  const prepared: PreparedPlugin = {
    manifest,
    entryUrl,
    allowedPaths: hostRoots.map((root) => resolve(root)),
    ...(provenance === undefined ? {} : { provenance }),
  }
  return { ok: true, prepared, errors: [] }
}

/** Liest die Herkunftsdatei, wenn sie da ist. Fehlen ist kein Fehler. */
async function readProvenanceIfPresent(dir: string): Promise<Provenance | undefined> {
  try {
    const raw = await readFile(join(dir, PROVENANCE_FILE), 'utf8')
    return JSON.parse(raw) as Provenance
  } catch {
    return undefined
  }
}

/**
 * Der Plugin-Host: hält die eingehängten Plugins und steckt sie in umgekehrter
 * Reihenfolge wieder ab.
 *
 * **Warum umgekehrt abgesteckt wird:** Ein Plugin B kann auf Diensten eines
 * vorher eingehängten Plugins A aufbauen. Steckt man A zuerst ab, arbeitet B
 * kurz gegen einen halb abgebauten Zustand. Umgekehrt ist die einzige
 * Reihenfolge, die für beide Fälle stimmt.
 */
export class PluginHost {
  readonly #api: HostApi
  readonly #loader: Loader
  readonly #mounted: MountedPlugin[] = []
  readonly #rejected: Rejection[] = []

  /**
   * @param api - die Fläche, die Plugins bekommen
   * @param loader - wie Module geladen werden; ersetzbar, damit Tests ohne
   *   echtes dynamisches Importieren auskommen und die Ladewege prüfbar sind
   */
  constructor(api: HostApi, loader?: Loader) {
    this.#api = api
    this.#loader = loader ?? (async (entryUrl: string) => await import(entryUrl))
  }

  /** Die eingehängten Plugins in Einhänge-Reihenfolge. */
  get mounted(): readonly MountedPlugin[] {
    return this.#mounted
  }

  /** Was abgewiesen wurde, mit Grund — die Negativspur des Hosts. */
  get rejected(): readonly Rejection[] {
    return this.#rejected
  }

  /** Die Buchführung als Ganzes. */
  get ledger(): HostLedger {
    return { mounted: this.#mounted.map((p) => p.name), rejected: this.#rejected }
  }

  /**
   * Hängt ein vorbereitetes Plugin ein.
   *
   * Reihenfolge der Prüfungen ist bindend und wird **vor** dem Laden
   * abgeschlossen, soweit möglich:
   *   1. Abhängigkeiten sind eingehängt
   *   2. Modul laden (dynamischer Import — **kein** Interzeptor)
   *   3. Modul ist ein Plugin (hat `apply`)
   *   4. `apply` ausführen, Absteck-Funktion merken
   *
   * @param prepared - Ergebnis von {@link prepare}
   * @returns das eingehängte Plugin
   * @throws UnitFailure, wenn eine Stufe scheitert; der Grund steht in `rejected`
   */
  async mount(prepared: PreparedPlugin, config?: unknown): Promise<MountedPlugin> {
    const { manifest } = prepared

    // 1. Abhängigkeiten — vor dem Laden, damit kein fremder Code läuft, dessen
    //    Voraussetzungen fehlen.
    const missing = manifest.requires.filter((dep) => !this.#mounted.some((m) => m.name === dep))
    if (missing.length > 0) {
      const rejection = unitError(
        ERROR_DEPENDENCY,
        `Nicht eingehängte Abhängigkeiten: ${missing.join(', ')}.`,
        `${MANIFEST_FILE}#/dependencies`,
        { unit: manifest.name, fehlend: missing.join(', ') },
      ) as Rejection
      this.#rejected.push({ ...rejection, unit: manifest.name })
      throw new UnitFailure(rejection)
    }

    // 2. Laden — über den absoluten URL-Pfad, ohne Modul-Interzeptor.
    let loaded: unknown
    try {
      loaded = await this.#loader(prepared.entryUrl)
    } catch (cause) {
      const rejection = unitError(
        ERROR_LIFECYCLE,
        `Modul konnte nicht geladen werden: ${cause instanceof Error ? cause.message : String(cause)}`,
        prepared.entryUrl,
        { unit: manifest.name },
      ) as Rejection
      this.#rejected.push({ ...rejection, unit: manifest.name })
      throw new UnitFailure(rejection)
    }

    // 3. Ist es ein Plugin?
    const module = loaded as PluginModule
    if (typeof module.apply !== 'function') {
      const rejection = unitError(
        ERROR_NOT_A_PLUGIN,
        'Das geladene Modul stellt keine apply-Funktion bereit und ist damit kein Plugin.',
        prepared.entryUrl,
        { unit: manifest.name },
      ) as Rejection
      this.#rejected.push({ ...rejection, unit: manifest.name })
      throw new UnitFailure(rejection)
    }

    // 4. Einhängen.
    try {
      const returned = await module.apply(this.#api, config)
      const mounted: MountedPlugin = {
        name: manifest.name,
        version: manifest.version,
        state: 'eingehaengt',
        entryUrl: prepared.entryUrl,
        ...(typeof returned === 'function' ? { unmount: returned } : {}),
      }
      this.#mounted.push(mounted)
      return mounted
    } catch (cause) {
      const rejection = unitError(
        ERROR_LIFECYCLE,
        `apply hat geworfen: ${cause instanceof Error ? cause.message : String(cause)}`,
        prepared.entryUrl,
        { unit: manifest.name },
      ) as Rejection
      this.#rejected.push({ ...rejection, unit: manifest.name })
      throw new UnitFailure(rejection)
    }
  }

  /**
   * Steckt ein Plugin ab — in umgekehrter Einhänge-Reihenfolge, wenn kein Name
   * genannt wird.
   *
   * Ein Plugin, das beim Einhängen eine Absteck-Funktion zurückgegeben hat,
   * wird darüber abgesteckt; sonst wird es nur aus der Buchführung entfernt.
   * Beides ist **Erfolg** — der Unterschied steht in `unmount`, nicht in einem
   * Fehler: ein Plugin ohne Aufräumbedarf ist kein Mangel.
   *
   * @param name - Name des abzusteckenden Plugins; ohne Angabe das zuletzt eingehängte
   * @returns das abgesteckte Plugin
   */
  async unmount(name?: string): Promise<MountedPlugin> {
    const index = name === undefined ? this.#mounted.length - 1 : this.#mounted.findIndex((p) => p.name === name)
    const target = this.#mounted[index]
    if (index < 0 || target === undefined) {
      throw new UnitFailure(
        unitError(ERROR_LIFECYCLE, `Kein eingehängtes Plugin namens "${name ?? '(zuletzt)'}".`, 'host', {
          einghaengt: this.#mounted.length,
        }),
      )
    }

    if (target.unmount) {
      await target.unmount()
    }
    this.#mounted.splice(index, 1)
    return { ...target, state: 'abgesteckt' }
  }

  /** Steckt alles ab, in umgekehrter Einhänge-Reihenfolge. */
  async unmountAll(): Promise<readonly MountedPlugin[]> {
    const done: MountedPlugin[] = []
    while (this.#mounted.length > 0) {
      done.push(await this.unmount())
    }
    return done
  }
}

/**
 * Findet ein Unit in einer Registry und bereitet es vor.
 *
 * Damit schließt sich der Kreis zu t14: der Weg
 * **Bündel → Import → Registry → Host** läuft ohne Handarbeit.
 *
 * @param registry - Ergebnis von `scanRegistry`
 * @param name - Name des Units
 * @param options - Host-Vertrag und erlaubte Wurzeln
 * @returns Prüfergebnis
 */
export async function prepareFromRegistry(
  registry: Registry,
  name: string,
  options: { readonly hostContract: string; readonly allowedRoots?: readonly string[] },
): Promise<PrepareResult> {
  const entry = registry.units.find((candidate) => candidate.manifest.name === name)
  if (entry === undefined) {
    return {
      ok: false,
      errors: [
        unitError(ERROR_MANIFEST, `Kein Unit namens "${name}" in der Registry.`, 'registry', {
          vorhanden: registry.units.length,
        }),
      ],
    }
  }
  return await prepare(entry.directory, options)
}

/** Lädt eine Registry und bereitet ein Unit daraus vor — die kurze Fassung. */
export async function prepareInstalled(
  roots: readonly string[],
  name: string,
  options: { readonly hostContract: string },
): Promise<PrepareResult> {
  const registry = await scanRegistry({ roots })
  return await prepareFromRegistry(registry, name, options)
}
