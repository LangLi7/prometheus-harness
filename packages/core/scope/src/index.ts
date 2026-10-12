/**
 * Scope-Primitiv des Kerns.
 *
 * Ein **Scope** ist eine benannte Ebene, in der Registrierungen sichtbar sind
 * und außerhalb derer sie es nicht sind. Die Vorlage nutzt das an vielen
 * Stellen: ein Scoped-Wert gilt für einen Agenten, eine Session oder eine
 * Anfrage, nicht global. Dieses Paket liefert nur das Primitiv — wer Scopes
 * *bildet* (Agent, Session, Turn), liegt in `core/agent` und `core/session`.
 *
 * Zwei Dinge sind hier bewusst getrennt:
 *
 *  - **Identität** (`ScopeKey`): ein Symbol. Zwei gleichnamige Scopes sind
 *    verschieden. Ein Scope, der sich über seinen Namen vergleichen ließe,
 *    würde bei zwei gleichnamigen Agenten stillschweigend Werte teilen.
 *  - **Anzeige** (`ScopeName`): der Name für Logs, Fehlermeldungen und Tests.
 *
 * `Scoped<T>` hängt einen Wert an genau einen Scope. `ScopeCarrier` ist ein
 * Objekt, das einen Scope trägt und ihn vererbbar weitergibt — der Grund, warum
 * ein untergeordneter Dienst denselben Scope sieht wie sein Elternteil.
 */

/** Anzeigename eines Scope — für Logs und Fehlermeldungen, nie für Vergleiche. */
export type ScopeName = string

/** Undurchsichtiger Identitätsschlüssel eines Scope. */
export interface ScopeKey {
  readonly name: ScopeName
  /** Nur zur Identität; nicht serialisierbar und nicht für Anzeigen gedacht. */
  readonly token: symbol
}

/** Ein aufgelöster Scope. */
export interface Scope {
  readonly key: ScopeKey
  readonly name: ScopeName
  /** Der umgebende Scope, oder `undefined` für einen Wurzel-Scope. */
  readonly parent: Scope | undefined
  /** Alle Ebenen von der Wurzel bis hierher, Wurzel zuerst. */
  readonly chain: readonly Scope[]
  /** Ist `candidate` dieser Scope oder ein Vorfahre davon? */
  isAncestorOf(candidate: Scope): boolean
  /** Ist `candidate` dieser Scope oder ein Nachfahre davon? */
  isDescendantOf(candidate: Scope): boolean
}

/** Ein Wert, der an genau einen Scope gebunden ist. */
export interface Scoped<T> {
  readonly scope: Scope
  readonly value: T
}

/** Ein Objekt, das einen Scope trägt. */
export interface ScopeCarrier {
  readonly scope: Scope
}

/** Vergleich zweier Scope-Schlüssel — nur Identität, nie der Name. */
export function sameScope(a: ScopeKey, b: ScopeKey): boolean {
  return a.token === b.token
}

function makeScope(name: ScopeName, parent: Scope | undefined): Scope {
  const key: ScopeKey = { name, token: Symbol(name) }
  const scope = {
    key,
    name,
    parent,
    chain: [] as readonly Scope[],
    isAncestorOf(candidate: Scope): boolean {
      for (let current: Scope | undefined = candidate; current !== undefined; current = current.parent) {
        if (sameScope(current.key, key)) return true
      }
      return false
    },
    isDescendantOf(candidate: Scope): boolean {
      return candidate.isAncestorOf(scope)
    },
  } satisfies Scope
  // Die Kette enthält diesen Scope selbst — Wurzel zuerst, dieser Scope zuletzt.
  Object.defineProperty(scope, 'chain', {
    value: Object.freeze([...(parent?.chain ?? []), scope]),
    enumerable: true,
  })
  return scope
}

/**
 * Erzeugt einen Scope.
 *
 * @param name Anzeigename; darf sich wiederholen, die Identität bleibt getrennt.
 * @param parent umgebender Scope; die Kette wird kopiert, nicht verlinkt.
 */
export function createScope(name: ScopeName, parent?: Scope): Scope {
  if (name.trim().length === 0) throw new TypeError('createScope braucht einen nicht-leeren Namen')
  return makeScope(name, parent)
}

/** Bindet `value` an `scope`. */
export function scoped<T>(scope: Scope, value: T): Scoped<T> {
  return { scope, value }
}

/**
 * Ein Bereich, der einen Scope für einen Rückruf bereitstellt.
 *
 * Das ist die Form, die der Kern wirklich braucht: nicht „welcher Scope gilt
 * gerade global", sondern „innerhalb dieses Rückrufs gilt dieser Scope". Der
 * Scope wird über `AsyncLocalStorage`-freie Weitergabe geführt — der Aufrufer
 * übergibt ihn ausdrücklich.
 */
export function runInScope<T>(scope: Scope, body: (scope: Scope) => T): T {
  return body(scope)
}

/** Asynchrone Variante von {@link runInScope}. */
export async function runInScopeAsync<T>(scope: Scope, body: (scope: Scope) => Promise<T>): Promise<T> {
  return await body(scope)
}

/** Ein Träger mit Scope und Wert — die kleinste nützliche Kombination. */
export interface ScopedCarrier<T> extends ScopeCarrier {
  readonly value: T
}

/** Erzeugt einen Träger. */
export function carrier<T>(scope: Scope, value: T): ScopedCarrier<T> {
  return { scope, value }
}

/**
 * Löst einen Träger auf einen Vorfahren-Scope auf: der Wert gehört dem Träger,
 * aber der gesuchte Scope kann weiter oben liegen. Das ist die Operation, mit
 * der ein übergeordneter Dienst die Registrierungen seiner Kinder findet.
 */
export function belongsTo(scope: Scope, carrierScope: Scope): boolean {
  return scope.isAncestorOf(carrierScope)
}

/** Eine Registrierung in einem Scope, mit ihrer Rücknahme. */
export interface ScopedRegistration<T> {
  readonly scope: Scope
  readonly value: T
  /** Nimmt die Registrierung zurück; mehrfach aufrufbar. */
  dispose(): void
}

/**
 * Eine Registrierungstabelle, die nach Scope trennt.
 *
 * Der Zweck ist die Shadowing-Regel der Vorlage: ein **näherer** Scope
 * verdeckt einen weiter entfernten Eintrag gleichen Namens, globale Einträge
 * bleiben daneben sichtbar. Deshalb liefert {@link ScopedRegistry.lookup} den
 * am nächsten gelegenen Eintrag und {@link ScopedRegistry.all} alle Ebenen.
 */
export interface ScopedRegistry<T> {
  /** Registriert `value` in `scope` und liefert die Rücknahme. */
  register(scope: Scope, name: string, value: T): ScopedRegistration<T>
  /** Der am nächsten gelegene Eintrag für `name`, von `scope` aus gesehen. */
  lookup(scope: Scope, name: string): ScopedRegistration<T> | undefined
  /** Alle Einträge für `name`, nächster Scope zuerst. */
  all(scope: Scope, name: string): readonly ScopedRegistration<T>[]
  /** Jeder sichtbare Eintrag: pro Name gewinnt der nächste Scope. */
  entries(scope: Scope): ReadonlyMap<string, ScopedRegistration<T>>
  /** Alle Registrierungen eines Scope. */
  of(scope: Scope): readonly ScopedRegistration<T>[]
  readonly size: number
}

/** Standardimplementierung von {@link ScopedRegistry}. */
export function createScopedRegistry<T>(): ScopedRegistry<T> {
  interface Entry {
    readonly scope: Scope
    readonly name: string
    readonly value: T
    alive: boolean
    order: number
  }

  const entries: Entry[] = []
  let sequence = 0

  const visible = (scope: Scope): Entry[] =>
    entries.filter((entry) => entry.alive && scope.isDescendantOf(entry.scope))

  const adjacent = (scope: Scope, name: string): Entry[] =>
    visible(scope)
      .filter((entry) => entry.name === name)
      .sort((a, b) => depth(b.scope) - depth(a.scope) || b.order - a.order)

  return {
    register(scope: Scope, name: string, value: T): ScopedRegistration<T> {
      if (name.trim().length === 0) throw new TypeError('register braucht einen nicht-leeren Namen')
      const entry: Entry = { scope, name, value, alive: true, order: sequence++ }
      entries.push(entry)
      return toRegistration(entry)
    },

    lookup(scope: Scope, name: string): ScopedRegistration<T> | undefined {
      return adjacent(scope, name).map(toRegistration)[0]
    },

    all(scope: Scope, name: string): readonly ScopedRegistration<T>[] {
      return adjacent(scope, name).map(toRegistration)
    },

    entries(scope: Scope): ReadonlyMap<string, ScopedRegistration<T>> {
      const result = new Map<string, ScopedRegistration<T>>()
      const candidates = visible(scope).sort((a, b) => depth(b.scope) - depth(a.scope) || b.order - a.order)
      for (const entry of candidates) {
        if (!result.has(entry.name)) result.set(entry.name, toRegistration(entry))
      }
      return result
    },

    of(scope: Scope): readonly ScopedRegistration<T>[] {
      return entries.filter((entry) => entry.alive && sameScope(entry.scope.key, scope.key)).map(toRegistration)
    },

    get size(): number {
      return entries.filter((entry) => entry.alive).length
    },
  }

  function toRegistration(entry: Entry): ScopedRegistration<T> {
    return {
      scope: entry.scope,
      value: entry.value,
      dispose(): void {
        entry.alive = false
        const index = entries.indexOf(entry)
        if (index >= 0) entries.splice(index, 1)
      },
    }
  }

  function depth(scope: Scope): number {
    return scope.chain.length
  }
}
