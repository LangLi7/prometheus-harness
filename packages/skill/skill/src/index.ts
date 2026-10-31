/**
 * `@prometheus-harness/skill` — die Registry der Fähigkeiten.
 *
 * **Was eine Fähigkeit ist.** Ein Name, eine Kurzbeschreibung und ein Markdown-Rumpf mit
 * Anweisungen, die das Modell erst dann sieht, wenn es sie braucht. Der Rumpf ist der teure
 * Teil: er gehört nicht in jede Anfrage. Deshalb gibt es zwei Stufen — einen **Katalog** aus
 * Namen und Beschreibungen, der immer mitgeht, und ein **Laden** des Rumpfes auf Abruf.
 *
 * **Die drei Rollen, die dieses Paket trennt.**
 *
 * | Rolle | Wer | Was |
 * |---|---|---|
 * | **Anbieter** | `skill-filesystem`, `skill-office`, ein Fernanbieter | findet Kandidaten und lädt einen Rumpf |
 * | **Registry** | dieses Paket | mischt Anbieter je Scope, entscheidet den Gewinner je Name, cached den Katalog |
 * | **Verbraucher** | `tool-skill`, eine Oberfläche | wendet die Aufrufrichtlinie an und rendert |
 *
 * **Warum die Registry schichtet.** Ein Projekt darf eine Fähigkeit überschreiben, ohne die
 * des Benutzers zu löschen; ein Agent-Preset darf eine eigene Sicht haben. Die Regel ist die
 * des Werkzeug-Registers: **der nächste Scope gewinnt**, global bleibt daneben sichtbar.
 * Innerhalb **einer** Schicht entscheidet der Rang, dann die Anbieter-Reihenfolge, dann die
 * Reihenfolge des Anbieters selbst.
 *
 * **Der eine Unterschied zur Vorlage.** Die Vorlage hängt die Registry als Cordis-Dienst
 * (`ctx.skills`) ein und nimmt den Scope aus dem aufrufenden Kontext. Hier ist die Registry
 * ein gewöhnliches Objekt: der Scope wird **übergeben** — beim Registrieren und beim Lesen.
 * Das ist keine Vereinfachung aus Bequemlichkeit, sondern die Bedingung dafür, dass die
 * Regeln ohne laufenden Host prüfbar bleiben. Die Brücke zum Cordis-Dienst ist ein eigenes
 * Paket (`skill-plugin`).
 *
 * @module @prometheus-harness/skill
 */

import type { Scope, ScopeKey } from '@prometheus-harness/scope'

/** Die Grammatik eines Fähigkeitsnamens: Kebab-Case, klein, ohne Sonderzeichen. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Vorgabe für die Zahl der zwischengespeicherten Kataloge. */
const DEFAULT_COLLECT_CACHE_ENTRIES = 128

/** Wie oft eine Erfassung wiederholt wird, wenn sich der Katalog währenddessen ändert. */
const MAX_COLLECT_ATTEMPTS = 2

/** Der Anbietername, den die Registry für Laufzeit-Fähigkeiten selbst führt. */
const RUNTIME_PROVIDER = 'runtime'

/** Der Rang einer Laufzeit-Fähigkeit: hinter Projekt-Einträgen, vor Benutzer-Einträgen. */
const RUNTIME_RANK = 250

/** Standardrang für mitgelieferte Anbieter und gebündelte Wurzelverzeichnisse. */
export const BUNDLED_SKILL_RANK = 600

/**
 * Ist `name` ein gültiger Fähigkeitsname?
 *
 * @param name - der zu prüfende Name
 * @returns ob er der öffentlichen Grammatik entspricht
 */
export function isSkillName(name: string): boolean {
  return SKILL_NAME.test(name)
}

/** Herkunft einer Fähigkeit. Der Wert ist sichtbare Beschreibung, **keine** Vorrangregel. */
export type SkillSource =
  | 'project-dsh'
  | 'project-agents'
  | 'runtime'
  | 'user-dsh'
  | 'user-agents'
  | 'custom'
  | 'bundled'
  | (string & {})

/** Anbieter-spezifische Basis, gegen die ein geladener Rumpf relative Pfade auflöst. */
export type SkillResourceBase =
  | { readonly kind: 'directory'; readonly path: string }
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'opaque'; readonly description: string }

/** Die zwei unabhängigen Aufruf-Schalter einer Fähigkeit. */
export interface SkillInvocationPolicy {
  /** Ob der Modell-Katalog und der Lader diese Fähigkeit führen. */
  readonly modelInvocable: boolean
  /** Ob ein menschlicher Befehlsweg diese Fähigkeit führen darf. */
  readonly userInvocable: boolean
}

/** Die aufrufneutrale Kurzfassung, die {@link SkillRegistry.list} liefert. */
export interface SkillSummary {
  /** Absoluter Pfad der Anweisungsdatei, wenn der Anbieter einen hat. */
  readonly path?: string
  /** Kebab-Case-Name, unter dem die Fähigkeit adressiert wird. */
  readonly name: string
  /** Kurze Wegbeschreibung für den Katalog. */
  readonly description: string
  /** Zusätzliche Wegweisung, wann die Fähigkeit paßt. */
  readonly whenToUse?: string
  /** Aufgelöste Aufruf-Schalter. */
  readonly invocation: SkillInvocationPolicy
  /** Herkunft, die diesen Gewinner erzeugt hat. */
  readonly source: SkillSource
  /** Anbieter, dem der Rumpf gehört. */
  readonly provider: string
  /** Basis für relative Verweise im Rumpf. */
  readonly resourceBase?: SkillResourceBase
}

/** Ein Kandidat, wie ihn ein Anbieter liefert und die Registry später lädt. */
export interface SkillCandidate extends SkillSummary {
  /** Kleinerer Rang gewinnt einen Namensstreit **innerhalb einer Schicht** zuerst. */
  readonly rank: number
  /** Undurchsichtiger Griff des Anbieters; die Registry reicht ihn nur zurück. */
  readonly locator: unknown
  /** Geparste Zusatzangaben aus dem Frontmatter, unverändert. */
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** Die vollständige Fähigkeit samt Rumpf, wie {@link SkillRegistry.get} sie liefert. */
export interface SkillDefinition extends SkillSummary {
  /** Markdown-Rumpf nach Entfernen des Frontmatters. */
  readonly content: string
  /** Geparste Zusatzangaben aus dem Frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** Eine Laufzeit-Fähigkeit, wie sie {@link SkillRegistry.register} annimmt. */
export type SkillRegistration = Omit<SkillDefinition, 'invocation' | 'provider'> & {
  /** Aufruf-Schalter; fehlen sie, sind **beide** Wege erlaubt. */
  readonly invocation?: SkillInvocationPolicy
  /** Anbietername; fehlt er, gilt `runtime`. */
  readonly provider?: string
}

/** Der Kontext einer Suche: Arbeitsverzeichnis und Abbruchsignal. */
export interface SkillLookupOptions {
  /** Arbeitsverzeichnis; Anbieter dürfen daran ihre Projektwurzeln wählen. */
  readonly cwd?: string | undefined
  /** Abbruchsignal des Aufrufers. */
  readonly signal?: AbortSignal | undefined
}

/** Leseoptionen der Registry: Suchkontext plus der betrachtende Scope. */
export interface SkillViewOptions extends SkillLookupOptions {
  /** Betrachtender Scope; fehlt er, wird nur die globale Schicht gelesen. */
  readonly scope?: Scope | undefined
}

/** Ist die Fähigkeit für das Modell aufrufbar? */
export function isModelInvocable(skill: Pick<SkillSummary, 'invocation'>): boolean {
  return skill.invocation.modelInvocable
}

/** Ist die Fähigkeit für einen menschlichen Befehlsweg aufrufbar? */
export function isUserInvocable(skill: Pick<SkillSummary, 'invocation'>): boolean {
  return skill.invocation.userInvocable
}

/** Eine beobachtete Katalogfassung samt Vollständigkeit. */
export interface SkillCatalogSnapshot {
  /** Sortierte, aufrufneutrale Kurzfassungen dieser Beobachtung. */
  readonly skills: SkillSummary[]
  /** Ob jeder Anbieter ohne gleichzeitige Katalogänderung fertig wurde. */
  readonly complete: boolean
}

/** Kandidaten eines Anbieters plus die Aussage, ob die Erfassung maßgeblich ist. */
export interface SkillProviderObservation {
  /** Die Kandidaten der aktuellen Erfassung. */
  readonly candidates: readonly SkillCandidate[]
  /** Ob die Erfassung vollständig ist und zwischengespeichert werden darf. */
  readonly complete: boolean
}

/** Ein Anbieter von Fähigkeiten — lokale Verzeichnisse, ein Paket oder ein Fernverzeichnis. */
export interface SkillProvider {
  /** Eindeutiger Name **innerhalb einer Schicht**. */
  readonly name: string
  /**
   * Liefert die Kandidaten für einen Suchkontext.
   *
   * Ein einfaches Feld ist die Kurzform „vollständig"; wer unvollständig entdeckt hat, liefert
   * ausdrücklich eine {@link SkillProviderObservation} mit `complete: false`. Dann bleibt der
   * Katalog ungecacht, und der Verbraucher behält seine letzte gute Sicht.
   */
  readonly list: (
    options: SkillLookupOptions,
  ) => Promise<readonly SkillCandidate[] | SkillProviderObservation>
  /** Lädt den Rumpf eines zuvor gelisteten Kandidaten, oder `undefined`, wenn er weg ist. */
  readonly get: (
    candidate: SkillCandidate,
    options: SkillLookupOptions,
  ) => Promise<SkillDefinition | undefined>
}

/** Die registrierungsgebundene Steuerung, die ein Anbieter aus seiner Fabrik erhält. */
export interface SkillProviderControl {
  /** Wird abgebrochen, wenn die Registrierung scheitert oder zurückgenommen wird. */
  readonly signal: AbortSignal
  /** Verwirft fertige Kataloge — nur solange **genau diese** Registrierung lebt. */
  readonly invalidate: () => void
}

/** Meldungen, die die Registry abgibt. Vorgabe: keine. */
export interface SkillLogger {
  warn(message: string): void
}

/** Einstellungen der Registry. */
export interface SkillRegistryOptions {
  /** Höchstzahl fertiger Kataloge im Speicher. Vorgabe 128, mindestens 1. */
  readonly collectCacheMaxEntries?: number
  /** Protokoll für enthaltene Anbieter- und Doppelnamen-Fehler. */
  readonly logger?: SkillLogger
}

/** Ein Kandidat mit allem, was die Registry zum Sortieren braucht. */
interface IndexedCandidate {
  readonly candidate: SkillCandidate
  readonly provider: SkillProvider
  readonly providerOrder: number
  readonly localOrder: number
  /** Die Schicht, damit eine veraltete Ladung genau diese Registrierung prüfen kann. */
  readonly layer: SkillLayer
}

/** Eine Anbieter-Registrierung samt ihrer Reihenfolge. */
interface RegisteredProvider {
  readonly provider: SkillProvider
  readonly order: number
}

interface LayerCollectResult {
  readonly entries: IndexedCandidate[]
  readonly cacheable: boolean
}

interface CollectResult {
  readonly entries: Map<string, IndexedCandidate>
  readonly cacheable: boolean
}

/** Der Beitrag **eines** Scope zur Registry. */
class SkillLayer {
  /** Anbieter in Registrierungsreihenfolge. */
  readonly providers = new Map<string, RegisteredProvider>()
  /** Laufzeit-Fähigkeiten, nach Name. */
  readonly runtime = new Map<string, SkillDefinition>()
}

/**
 * Die geschichtete Registry.
 *
 * Eine Registrierung landet in der Schicht des **übergebenen** Scope; ohne Scope global.
 * Ein Lesen mischt die globale Schicht mit der Kette des betrachtenden Scope — die nächste
 * Schicht gewinnt einen Namensstreit, der Rang entscheidet nur **innerhalb** einer Schicht.
 */
export class SkillRegistry {
  readonly #options: SkillRegistryOptions
  readonly #global = new SkillLayer()
  readonly #layers = new Map<ScopeKey, SkillLayer>()
  readonly #collectCache = new Map<string, Map<string, IndexedCandidate>>()
  readonly #listeners = new Set<() => void>()
  readonly #scopeIds = new WeakMap<ScopeKey, number>()
  #revision = 0
  #nextProviderOrder = 0
  #nextScopeId = 1

  /**
   * @param options - Cachegrenze und Protokoll
   * @throws RangeError bei einer Cachegrenze unter 1
   */
  constructor(options: SkillRegistryOptions = {}) {
    const max = options.collectCacheMaxEntries ?? DEFAULT_COLLECT_CACHE_ENTRIES
    if (!Number.isInteger(max) || max < 1) {
      throw new RangeError(`skill: collectCacheMaxEntries muss eine ganze Zahl ≥ 1 sein, ist ${String(max)}`)
    }
    this.#options = { ...options, collectCacheMaxEntries: max }
  }

  /** Meldet jede Katalogänderung; die Rückgabe meldet ab. */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * Registriert einen Anbieter.
   *
   * Die Fabrik ist **synchron**: ein Anbieter, der erst Netzarbeit braucht, tut sie in
   * `list()`. Ein doppelter Name in derselben Schicht und der reservierte Name `runtime`
   * werfen — das sind Programmierfehler, keine Modellfehler.
   *
   * @param create - Fabrik, die die registrierungsgebundene Steuerung erhält
   * @param options - die Zielschicht; ohne `scope` global
   * @returns die Rücknahme; mehrfach aufrufbar
   * @throws Error bei doppeltem oder reserviertem Namen
   */
  registerProvider(
    create: (control: SkillProviderControl) => SkillProvider,
    options: { readonly scope?: Scope } = {},
  ): () => void {
    const lifecycle = new AbortController()
    const layer = this.#layerFor(options.scope, true)
    let registration: { readonly layer: SkillLayer; readonly name: string } | undefined
    let provider: SkillProvider
    const control: SkillProviderControl = {
      signal: lifecycle.signal,
      invalidate: () => {
        const active = registration
        if (active !== undefined && active.layer.providers.get(active.name)?.provider === provider) {
          this.#invalidate()
        }
      },
    }
    try {
      provider = create(control)
      const name = provider.name
      if (name === RUNTIME_PROVIDER) {
        throw new Error(`"${RUNTIME_PROVIDER}" ist für Laufzeit-Fähigkeiten reserviert`)
      }
      if (name.trim() === '') throw new Error('Ein Skill-Anbieter ohne Namen ist nicht adressierbar')
      if (layer.providers.has(name)) {
        throw new Error(
          options.scope === undefined
            ? `Ein Skill-Anbieter "${name}" ist bereits registriert`
            : `Ein Skill-Anbieter "${name}" ist in diesem Scope bereits registriert`,
        )
      }
      const order = this.#nextProviderOrder
      this.#nextProviderOrder += 1
      layer.providers.set(name, { provider, order })
      registration = { layer, name }
      this.#invalidate()
    } catch (error) {
      lifecycle.abort(error)
      throw error
    }
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      registration = undefined
      layer.providers.delete(provider.name)
      lifecycle.abort(new Error(`Skill-Anbieter "${provider.name}" abgemeldet`))
      this.#invalidate()
    }
  }

  /**
   * Registriert eine Laufzeit-Fähigkeit.
   *
   * Gleicher Name in derselben Schicht: der **erste** gewinnt, der zweite wird verworfen und
   * gemeldet. Eine stillschweigend überschriebene Fähigkeit wäre ein Verlust, den niemand
   * sieht.
   *
   * @param skill - die Fähigkeit; fehlende Aufruf-Schalter erlauben beide Wege
   * @param options - die Zielschicht; ohne `scope` global
   * @returns die Rücknahme; bei einem Doppelnamen eine, die nichts tut
   */
  register(skill: SkillRegistration, options: { readonly scope?: Scope } = {}): () => void {
    validateRuntimeSkill(skill)
    const layer = this.#layerFor(options.scope, true)
    if (layer.runtime.has(skill.name)) {
      this.#warn(`Laufzeit-Fähigkeit "${skill.name}" ignoriert: sie ist bereits registriert`)
      return () => {}
    }
    const definition: SkillDefinition = {
      ...skill,
      invocation: skill.invocation ?? { modelInvocable: true, userInvocable: true },
      provider: skill.provider ?? RUNTIME_PROVIDER,
    }
    layer.runtime.set(definition.name, definition)
    this.#invalidate()
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      layer.runtime.delete(definition.name)
      this.#invalidate()
    }
  }

  /** Katalog-Kurzfassungen für einen Suchkontext, nach Namen sortiert. */
  async list(options: SkillViewOptions = {}): Promise<SkillSummary[]> {
    return (await this.snapshot(options)).skills
  }

  /** Beobachtet den Katalog und ob die Erfassung vollständig war. */
  async snapshot(options: SkillViewOptions = {}): Promise<SkillCatalogSnapshot> {
    const collected = await this.#collect(options)
    return {
      skills: [...collected.entries.values()]
        .map((entry) => toSummary(entry.candidate))
        .sort(compareSkillSummary),
      complete: collected.cacheable,
    }
  }

  /**
   * Lädt den Gewinner eines Namens.
   *
   * Der Name wird **vor** jeder Arbeit geprüft; ein unbekannter oder ungültiger Name ist
   * `undefined` und kein Wurf. Nach der Auswahl wird der Abbruch erneut geprüft, und das
   * Laden wird gegen das Signal gerannt, damit ein nicht kooperierender Anbieter den Aufrufer
   * nicht hängen läßt.
   *
   * @param name - Kebab-Case-Name
   * @param options - Suchkontext und betrachtender Scope
   * @returns die vollständige Fähigkeit oder `undefined`
   */
  async get(name: string, options: SkillViewOptions = {}): Promise<SkillDefinition | undefined> {
    if (!isSkillName(name)) return undefined
    const collected = await this.#collect(options)
    throwIfAborted(options.signal)
    const match = collected.entries.get(name)
    if (match === undefined) return undefined
    const definition = await waitWithAbort(
      match.provider.get(match.candidate, options),
      options.signal,
    )
    if (definition === undefined) return undefined
    validateDefinition(definition)
    if (definition.name !== match.candidate.name) {
      this.#invalidateEntry(match)
      return undefined
    }
    return definition
  }

  async #collect(options: SkillViewOptions): Promise<CollectResult> {
    throwIfAborted(options.signal)
    let attempt = 1
    for (;;) {
      const revision = this.#revision
      const key = this.#cacheKey(options.cwd, options.scope, revision)
      const cached = this.#collectCache.get(key)
      if (cached !== undefined) return { entries: cached, cacheable: true }

      const result = await this.#collectFresh(options)
      throwIfAborted(options.signal)
      if (revision !== this.#revision) {
        if (attempt < MAX_COLLECT_ATTEMPTS) {
          attempt += 1
          continue
        }
        return { entries: result.entries, cacheable: false }
      }
      if (result.cacheable) {
        this.#collectCache.set(key, result.entries)
        const bound = this.#options.collectCacheMaxEntries ?? DEFAULT_COLLECT_CACHE_ENTRIES
        while (this.#collectCache.size > bound) {
          const oldest = this.#collectCache.keys().next()
          if (oldest.done === true) break
          this.#collectCache.delete(oldest.value)
        }
      }
      return result
    }
  }

  async #collectFresh(options: SkillViewOptions): Promise<CollectResult> {
    // Global zuerst, dann die Kette von der entferntesten zur nächsten Schicht: ein
    // gleichnamiger Eintrag der nächsten Schicht ersetzt den ferneren.
    const layers = [this.#global, ...this.#chainLayers(options.scope)]
    const merged = new Map<string, IndexedCandidate>()
    let cacheable = true
    for (const layer of layers) {
      const collected = await this.#collectLayer(layer, options)
      if (!collected.cacheable) cacheable = false
      for (const entry of collected.entries) merged.set(entry.candidate.name, entry)
    }
    return { entries: merged, cacheable }
  }

  async #collectLayer(layer: SkillLayer, options: SkillLookupOptions): Promise<LayerCollectResult> {
    const collected = await this.#listLayerCandidates(layer, options)
    collected.entries.sort(compareIndexedCandidates)
    const seen = new Set<string>()
    const result: IndexedCandidate[] = []
    for (const entry of collected.entries) {
      const skill = entry.candidate
      if (seen.has(skill.name)) {
        this.#warn(
          `Fähigkeit "${skill.name}" aus ${skill.source} ignoriert: eine höher priorisierte Fähigkeit besteht bereits`,
        )
        continue
      }
      seen.add(skill.name)
      result.push(entry)
    }
    return { entries: result, cacheable: collected.cacheable }
  }

  async #listLayerCandidates(layer: SkillLayer, options: SkillLookupOptions): Promise<LayerCollectResult> {
    throwIfAborted(options.signal)
    const candidates: IndexedCandidate[] = []
    let cacheable = true
    let runtimeOrder = 0
    for (const skill of [...layer.runtime.values()].sort((a, b) => compareCodePoints(a.name, b.name))) {
      candidates.push({
        candidate: runtimeCandidate(skill),
        provider: RUNTIME_SKILL_PROVIDER,
        providerOrder: -1,
        localOrder: runtimeOrder,
        layer,
      })
      runtimeOrder += 1
    }
    for (const { provider, order } of layer.providers.values()) {
      let localOrder = 0
      let output: readonly SkillCandidate[] | SkillProviderObservation
      try {
        output = await waitWithAbort(provider.list(options), options.signal)
      } catch (error) {
        if (options.signal?.aborted === true) throw toError(options.signal.reason)
        cacheable = false
        this.#warn(`Skill-Anbieter "${provider.name}" übersprungen: ${errorMessage(error)}`)
        continue
      }
      const observation = normalizeProviderObservation(output, provider.name)
      if (!observation.complete) cacheable = false
      for (const candidate of observation.candidates) {
        validateCandidate(candidate, provider.name)
        candidates.push({ candidate, provider, providerOrder: order, localOrder, layer })
        localOrder += 1
      }
    }
    return { entries: candidates, cacheable }
  }

  #layerFor(scope: Scope | undefined, create: boolean): SkillLayer {
    if (scope === undefined) return this.#global
    const existing = this.#layers.get(scope.key)
    if (existing !== undefined) return existing
    const layer = new SkillLayer()
    if (create) this.#layers.set(scope.key, layer)
    return layer
  }

  #chainLayers(scope: Scope | undefined): SkillLayer[] {
    if (scope === undefined) return []
    const layers: SkillLayer[] = []
    for (const entry of scope.chain) {
      const layer = this.#layers.get(entry.key)
      if (layer !== undefined && !layers.includes(layer)) layers.push(layer)
    }
    return layers
  }

  #invalidate(): void {
    this.#revision += 1
    this.#collectCache.clear()
    this.#notifyChange()
  }

  #invalidateEntry(entry: IndexedCandidate): void {
    if (entry.layer.providers.get(entry.provider.name)?.provider === entry.provider) this.#invalidate()
  }

  #scopeId(key: ScopeKey): number {
    let id = this.#scopeIds.get(key)
    if (id === undefined) {
      id = this.#nextScopeId
      this.#nextScopeId += 1
      this.#scopeIds.set(key, id)
    }
    return id
  }

  #cacheKey(cwd: string | undefined, scope: Scope | undefined, revision: number): string {
    const chain = scope?.chain.map((entry) => this.#scopeId(entry.key)) ?? []
    return JSON.stringify({ cwd, scopes: chain, revision })
  }

  #notifyChange(): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener()
      } catch (error) {
        this.#warn(`skills/change-Zuhörer scheiterte: ${errorMessage(error)}`)
      }
    }
  }

  #warn(message: string): void {
    const logger = this.#options.logger
    if (logger === undefined) return
    try {
      logger.warn(message)
    } catch {
      // Ein Protokoll, das selbst scheitert, darf die Registry nicht anhalten.
    }
  }
}

function normalizeProviderObservation(
  output: readonly SkillCandidate[] | SkillProviderObservation,
  providerName: string,
): SkillProviderObservation {
  if (Array.isArray(output)) return { candidates: output as readonly SkillCandidate[], complete: true }
  if (output === null || typeof output !== 'object') {
    throw invalidProviderObservation(providerName)
  }
  const observation = output as Partial<SkillProviderObservation>
  if (!Array.isArray(observation.candidates) || typeof observation.complete !== 'boolean') {
    throw invalidProviderObservation(providerName)
  }
  return observation as SkillProviderObservation
}

function invalidProviderObservation(providerName: string): TypeError {
  return new TypeError(
    `Skill-Anbieter "${providerName}": list() muss ein Feld oder { candidates, complete } liefern`,
  )
}

const RUNTIME_SKILL_PROVIDER: SkillProvider = {
  name: RUNTIME_PROVIDER,
  list() {
    return Promise.resolve([])
  },
  get(candidate) {
    return Promise.resolve(candidate.locator as SkillDefinition)
  },
}

function runtimeCandidate(skill: SkillDefinition): SkillCandidate {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
    invocation: skill.invocation,
    source: skill.source,
    provider: skill.provider,
    ...(skill.resourceBase !== undefined ? { resourceBase: skill.resourceBase } : {}),
    rank: RUNTIME_RANK,
    locator: skill,
    ...(skill.path !== undefined ? { path: skill.path } : {}),
    ...(skill.metadata !== undefined ? { metadata: skill.metadata } : {}),
  }
}

function validateCandidate(candidate: SkillCandidate, providerName: string): void {
  if (typeof candidate.name !== 'string') {
    throw new TypeError(`Skill-Anbieter "${providerName}" lieferte einen nicht-textuellen Namen`)
  }
  if (!SKILL_NAME.test(candidate.name)) {
    throw new Error(`Skill-Anbieter "${providerName}" lieferte den ungültigen Namen "${candidate.name}"`)
  }
  if (typeof candidate.description !== 'string') {
    throw new TypeError(
      `Skill-Anbieter "${providerName}" lieferte "${candidate.name}" mit nicht-textueller Beschreibung`,
    )
  }
  if (candidate.description.length === 0) {
    throw new Error(`Skill-Anbieter "${providerName}" lieferte "${candidate.name}" ohne Beschreibung`)
  }
  validateInvocation(candidate.invocation, `Skill-Anbieter "${providerName}", Fähigkeit "${candidate.name}"`)
  if (candidate.whenToUse !== undefined && typeof candidate.whenToUse !== 'string') {
    throw new TypeError(
      `Skill-Anbieter "${providerName}" lieferte "${candidate.name}" mit nicht-textuellem whenToUse`,
    )
  }
  if (typeof candidate.source !== 'string') {
    throw new TypeError(`Skill-Anbieter "${providerName}" lieferte "${candidate.name}" ohne Text als Quelle`)
  }
  if (typeof candidate.rank !== 'number' || !Number.isFinite(candidate.rank)) {
    throw new Error(`Skill-Anbieter "${providerName}" lieferte "${candidate.name}" mit ungültigem Rang`)
  }
  if (typeof candidate.provider !== 'string') {
    throw new TypeError(`Skill-Anbieter "${providerName}" lieferte "${candidate.name}" ohne Anbieternamen`)
  }
  if (candidate.provider !== providerName) {
    throw new Error(
      `Skill-Anbieter "${providerName}" lieferte "${candidate.name}" für Anbieter "${candidate.provider}"`,
    )
  }
  if (candidate.path !== undefined && typeof candidate.path !== 'string') {
    throw new TypeError(`Skill-Anbieter "${providerName}" lieferte "${candidate.name}" mit nicht-textuellem Pfad`)
  }
}

function validateRuntimeSkill(skill: SkillRegistration): void {
  if (!SKILL_NAME.test(skill.name)) throw new Error(`Ungültiger Fähigkeitsname "${skill.name}"`)
  if (skill.description.length === 0) throw new Error(`Fähigkeit "${skill.name}" braucht eine Beschreibung`)
  validateInvocation(skill.invocation, `Laufzeit-Fähigkeit "${skill.name}"`)
}

function validateDefinition(skill: SkillDefinition): void {
  const name = skill.name
  if (typeof name !== 'string') throw new TypeError('Geladene Fähigkeit: name muss Text sein')
  if (!SKILL_NAME.test(name)) throw new Error(`Geladene Fähigkeit hat den ungültigen Namen "${name}"`)
  if (typeof skill.description !== 'string') {
    throw new TypeError(`Geladene Fähigkeit "${name}": description muss Text sein`)
  }
  if (skill.description.length === 0) {
    throw new Error(`Geladene Fähigkeit "${name}" braucht eine Beschreibung`)
  }
  validateInvocation(skill.invocation, `Geladene Fähigkeit "${name}"`)
  if (skill.whenToUse !== undefined && typeof skill.whenToUse !== 'string') {
    throw new TypeError(`Geladene Fähigkeit "${name}": whenToUse muss Text sein`)
  }
  if (typeof skill.source !== 'string') {
    throw new TypeError(`Geladene Fähigkeit "${name}": source muss Text sein`)
  }
  if (typeof skill.provider !== 'string') {
    throw new TypeError(`Geladene Fähigkeit "${name}": provider muss Text sein`)
  }
  if (typeof skill.content !== 'string') {
    throw new TypeError(`Geladene Fähigkeit "${name}": content muss Text sein`)
  }
  if (skill.path !== undefined && typeof skill.path !== 'string') {
    throw new TypeError(`Geladene Fähigkeit "${name}": path muss Text sein`)
  }
}

function toSummary(skill: SkillCandidate | SkillDefinition): SkillSummary {
  const { name, description, whenToUse, invocation, source, provider, resourceBase } = skill
  return {
    name,
    description,
    ...(whenToUse !== undefined ? { whenToUse } : {}),
    invocation,
    source,
    provider,
    ...(resourceBase !== undefined ? { resourceBase } : {}),
  }
}

function validateInvocation(invocation: unknown, subject: string): void {
  if (invocation === undefined) return
  if (typeof invocation !== 'object' || invocation === null || Array.isArray(invocation)) {
    throw new TypeError(`${subject}: invocation muss ein Objekt sein`)
  }
  const policy = invocation as Record<string, unknown>
  if (typeof policy.modelInvocable !== 'boolean') {
    throw new TypeError(`${subject}: invocation.modelInvocable muss ein Wahrheitswert sein`)
  }
  if (typeof policy.userInvocable !== 'boolean') {
    throw new TypeError(`${subject}: invocation.userInvocable muss ein Wahrheitswert sein`)
  }
}

function compareSkillSummary(left: SkillSummary, right: SkillSummary): number {
  return compareCodePoints(left.name, right.name)
}

function compareCodePoints(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function compareIndexedCandidates(left: IndexedCandidate, right: IndexedCandidate): number {
  return (
    left.candidate.rank - right.candidate.rank ||
    left.providerOrder - right.providerOrder ||
    left.localOrder - right.localOrder
  )
}

function waitWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise
  throwIfAborted(signal)
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      cleanup()
      reject(toError(signal.reason))
    }
    const cleanup = (): void => {
      signal.removeEventListener('abort', onAbort)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error: unknown) => {
        cleanup()
        reject(toError(error))
      },
    )
  })
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw toError(signal.reason)
}

function toError(error: unknown): Error {
  try {
    if (error instanceof Error) return error
  } catch {
    // Ein feindlicher Proxy kann schon bei instanceof werfen.
  }
  return new Error(errorMessage(error))
}

function errorMessage(error: unknown): string {
  try {
    return String(error)
  } catch {
    return '[unlesbarer Fehlerwert]'
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Rendert eine geladene Fähigkeit für das Modell.
 *
 * Dieselbe Form benutzen der `skill`-Werkzeugaufruf und eine ausdrückliche
 * Benutzer-Invokation — das Modell sieht auf beiden Wegen **eine** Gestalt. Der Name steht in
 * einem entschärften Attribut, der Rumpf unverändert: Fähigkeiten sind vertrauter lokaler
 * Inhalt; der Text des Benutzers bleibt außerhalb dieses Rahmens.
 *
 * @param skill - Name, Anbieter, optionale Ressourcenbasis und Rumpf
 * @returns der vollständige `<skill_content>`-Block
 */
export function renderSkillContent(
  skill: Pick<SkillDefinition, 'name' | 'provider' | 'resourceBase' | 'content'>,
): string {
  return [
    `<skill_content name="${escapeAttr(skill.name)}">`,
    '<skill_resources>',
    ...renderResourceHint(skill),
    '</skill_resources>',
    '',
    '<skill_instructions>',
    skill.content,
    '</skill_instructions>',
    '</skill_content>',
  ].join('\n')
}

function renderResourceHint(skill: Pick<SkillDefinition, 'provider' | 'resourceBase'>): string[] {
  const base = skill.resourceBase
  if (base === undefined) {
    return [
      `Ressourcen dieser Fähigkeit verwaltet der Anbieter "${escapeText(skill.provider)}".`,
      'Lade verwiesene Ressourcen nur bei Bedarf.',
    ]
  }
  switch (base.kind) {
    case 'directory':
      return [
        `Basisverzeichnis dieser Fähigkeit: ${escapeText(base.path)}`,
        'Löse relative Pfade aus dieser Fähigkeit gegen das Basisverzeichnis auf, bevor du sie benutzt. Lade verwiesene Ressourcen nur bei Bedarf.',
      ]
    case 'url':
      return [
        `Basis-URL dieser Fähigkeit: ${escapeText(base.url)}`,
        'Löse relative URLs aus dieser Fähigkeit gegen die Basis-URL auf, bevor du sie benutzt. Lade verwiesene Ressourcen nur bei Bedarf.',
      ]
    case 'opaque':
      return [
        `Ressourcen dieser Fähigkeit: ${escapeText(base.description)}`,
        'Lade verwiesene Ressourcen nur bei Bedarf.',
      ]
    default:
      return assertNever(base, 'SkillResourceBase.kind')
  }
}

/** Entschärft Text für ein Attribut. */
function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

/**
 * Entschärft Text, der in der Modell-Rahmung steht, damit Anbietertext den Rahmen nicht
 * öffnen oder schließen kann.
 *
 * @param value - der rohe Text
 * @returns der entschärfte Text
 */
export function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function assertNever(value: never, subject: string): never {
  throw new Error(`Unbekannter Fall für ${subject}: ${String(value)}`)
}
