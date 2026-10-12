# Gescoptes Registrieren

English | [中文](scope.zh.md)

Das [scope-Paket](../../packages/core/scope) liefert das Vokabular für Identität, Carrier und gescopte Schichten, durch das ein Registrierungskontext sowohl Sichtbarkeit pro Agent als auch gemeinsame Lebensdauer-Ownership bedeutet. Es ist ein Bibliotheksprimitiv und kein Cordis-Dienst; die [Referenz zum Runtime-Design des Agent-Scopes](../../packages/core/agent-loop/README.md) besitzt die Lifecycle-Begründung, und das Paket-[README](../../packages/core/scope/README.md) besitzt die aufrufbare API und die Filterungssemantik.

Quellen: [`packages/core/scope/src/index.ts`](../../packages/core/scope/src/index.ts) und [`packages/core/scope/src/store.ts`](../../packages/core/scope/src/store.ts).

## Identität und Dispatch-Carrier

`ScopeKey` ist eine undurchsichtige Objektidentität. Der ausgelieferte Loop verwendet das lebende `Agent`-Objekt als eigenen Schlüssel, aber das Primitiv inspiziert das Objekt nie.

```ts type-equiv
/** An opaque, identity-compared scope key. */
type ScopeKey = object
```

`Scoped<T>` ist das Compile-Time-Brand auf dem undurchsichtigen Routing-Empfänger, den `scopeTarget(base, key)` zurückgibt. Scope-gefilterte Event-Deklarationen erfordern diesen Carrier als ihren `this`-Typ, während das eigentliche Event-Subjekt ein explizites Argument bleibt.

```ts type-equiv
/**
 * A routing-only event receiver built by {@link scopeTarget}. The type
 * parameter records the subject type for dispatch checking; the carrier does
 * not expose the subject's properties. Event payloads carry the real subject.
 */
type Scoped<T extends object> = object & { readonly [ScopedBrand]: T }
```

## Besessener Registrierungskontext

`Scope` paart den getaggten Registrierungskontext mit zwei Teardown-Pfaden. `rawDispose` bewahrt die exakte Cordis-Disposer-Identität, die ein geordneter zusammengesetzter Effekt benötigt; `dispose()` ist die öffentliche gemeinsame Quieszenzgrenze für direkte und konkurrierende Aufrufer.

```ts type-equiv
/** A minted registration scope and its quiescent disposal boundaries. */
interface Scope {
  /** Context through which scope-owned registrations are made. */
  ctx: Context
  /** Exact Cordis disposer, used when nesting this scope in an ordered composite effect. */
  rawDispose: () => Promise<void> | void
  /** Dispose every scope-owned registration; racing calls await the same completion. */
  dispose(): Promise<void>
}
```

## Gescopte Registry-Schicht

`ScopeLayer` repräsentiert den vollständigen Beitrag einer Registry auf globaler Ebene oder auf Ebene eines exakten Scopes. Eine konkrete Schicht kann mehrere benannte und anonyme Tabellen aggregieren; die Leerheit der ganzen Schicht erlaubt es `ScopedLayers`, gescopten Zustand zurückzugewinnen, ohne eine Schwestertabelle zu verwerfen.

```ts type-equiv
/** One scope's aggregate contribution to a registry. */
interface ScopeLayer {
  /** Whether every table in this layer is empty. */
  isEmpty(): boolean
}
```

`ScopedLayers<L>` besitzt die eifrige globale Schicht und die träge erzeugten Schichten exakter Scopes. Lesevorgänge erzeugen keine Schichten: `peek(undefined)` bedeutet keine Overlay, während `merge()` einfügungsgeordnete globale benannte Einträge gefolgt von gescopten Überschreibungen materialisiert. Registrierungen verwenden einen Kontext sowohl für Sichtbarkeit als auch für Cordis-Effekt-Ownership, sammeln ein synchrones Undo vor einer optionalen Benachrichtigung, geben den exakten Disposer von Cordis zurück und gewinnen eine gescopte Schicht nur zurück, wenn ihre vollständige `ScopeLayer` leer ist.

`NamedEntries<V>` liefert einfügungsgeordnete Suche und lebende Iteration mit vom Aufrufer besessenen Duplikatfehlern. `AnonymousEntries<V>` gibt jedem Anhängen eine eindeutige Identität, sodass gleiche Werte unabhängig bleiben. Die Iteration bleibt innerhalb einer nicht leeren Tabellen-Generation lebend; das Leeren der Tabelle löst bestehende Iteratoren von späteren Einfügungen. Beide geben idempotente Undos für exakte Einträge zurück; die gemeinsame Implementierungsschnittstelle `EntryValues` ist nicht öffentlich.
