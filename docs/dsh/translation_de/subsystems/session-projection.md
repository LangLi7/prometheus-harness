# Session-Projektionen

English | [中文](session-projection.zh.md)

Der session-projection-Seam — ein [capability seam](../capability-seams.md), über den Domain-Host-Plugins ganze aktuelle Werte log-abgeleiteten Zustands pro Session an Client-Carrier liefern: die Service Definition und Registry ([dsh-session-projection](../../packages/session/session-projection), `ctx.sessionProjections`), Domain-Beitragende (die je eine reine Unit registrieren) und Carrier (die History-Tail-Seite von [dsh-session-controller](../../packages/api/session-controller) und der Push-Frame `session/projection`). Es ist eine optionale Capability, nicht Teil des Rückgrats des Agent-Loops. Das Framework treibt, die Domain rechnet: Die Registry abonniert `session/event` einmal und faltet jedes committete Event durch jede Unit; Domains halten keine Subscriptions, und Clients falten niemals Domain-Events — sie erhalten fertige Werte. Design-Autorität: die [session-projection-RFC](../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md); Verträge für Drive/Cache/Feed: das [Paket-README](../../packages/session/session-projection/README.md).

Quelle: [`packages/session/session-projection/src/index.ts`](../../packages/session/session-projection/src/index.ts)

## Die Unit

`SessionProjectionStateMap` ist die merge-erweiterbare Tabelle der Host-Faltzustände, während `SessionProjectionMap` die client-sichtbaren ganzen Werte behält. Eine Domain steuert eine `ProjectionDefinition` pro Zustandsschlüssel bei; ein `wire`-Block macht diesen Schlüssel client-sichtbar, und das Rendering gehört zum Slot-System, niemals zu dieser Schicht:

```ts type-equiv
/**
 * One domain's state-driven computation unit: a pure synchronous fold plus
 * declarations and an optional client view — never an opaque getter. The framework drives
 * `apply` on every committed session event; the domain holds no
 * subscriptions and owns only the computation. All functions MUST be
 * synchronous (an async unit would tear the carriers' consistency cut), and
 * `state` MUST be plain JSON (the persisted-cache precondition).
 */
interface ProjectionDefinition<
  K extends keyof SessionProjectionStateMap,
  S extends SessionProjectionStateMap[K] = SessionProjectionStateMap[K],
> {
  /** The projection key this unit owns (its `SessionProjectionStateMap` entry). */
  key: K
  /** Validates persisted state before it seeds a fold. */
  stateSchema: ZodType<S>
  /**
   * State for the empty log and its immutable Session metadata.
   * @param header - immutable metadata for the Session being projected.
   * @param inheritedEventCount - exact fork-inherited prefix length.
   * @returns the initial state.
   */
  init(header: SessionHeader, inheritedEventCount: SessionLogOffset): NoInfer<S>
  /**
   * Pure transition: previous state + one committed event → next state. A
   * unit uninterested in an event MUST return the same state reference — an
   * unchanged reference (`Object.is`) produces zero downstream work.
   * @param state - the state covering all prior events.
   * @param event - the next committed session event.
   * @returns the next state (same reference when the event is not the unit's).
   */
  apply(state: NoInfer<S>, event: SessionEvent): NoInfer<S>
  /** Client view. Omit for host-only units. */
  wire?: K extends keyof SessionProjectionMap ? {
    /** Validates the wire payload before it leaves the host. */
    viewSchema: ZodType<SessionProjectionMap[K]>
    /**
     * State → wire payload (the read-side projection). The live drive keeps
     * the two latest raw results and compares them with `Object.is`; an
     * object-valued view must reuse its reference to suppress publication
     * across internal-only state changes.
     * @param state - the current state.
     * @returns the whole current value for this unit's key.
     */
    view(state: NoInfer<S>): SessionProjectionMap[K]
  } : never
  /**
   * Persisted-cache invalidation version: bump whenever the serialized state fields or the
   * fold semantics change, so persisted `(sessionId, key, ver, seq, val)`
   * rows from an older unit are discarded instead of being forward-applied
   * into garbage. Non-negative integer.
   */
  stateVersion: number
}
```

Jeder ausgelieferte Projektionswert ist ein vollständiges Lesemodell. Ein Quell-Event kann einen ganzen Wert oder eine domain-eigene Operation tragen; das deterministische `apply` der Unit besitzt das Replay, und Checkpoint plus Vorwärts-Tail-Replay rekonstruieren denselben Zustand.

## Der Snapshot und der Change-Feed

```ts type-equiv
/**
 * One consistent read cut over every registered client-visible unit for one session.
 * `asOfSeq` is the shared watermark — the seq of the last event every value
 * reflects (`-1` for an empty log).
 */
interface ProjectionSnapshot {
  /** Seq of the last event the values reflect; -1 for an empty log. */
  asOfSeq: SessionSeqCursor
  /** Whole current client value per registered key. */
  values: Partial<SessionProjectionMap>
}
```

```ts type-equiv
/**
 * Change-feed listener: one unit's raw `view` result changed by `Object.is`
 * for one session. `value` is the schema-validated output; `seq` is the
 * unit's watermark at emission (the seq of the event that caused the change).
 */
type ProjectionChangeListener = (
  session: Session,
  key: Extract<keyof SessionProjectionMap, string>,
  value: unknown,
  seq: SessionSeq,
) => void
```

`snapshot(session)` ist vollständig synchron: Ein Carrier liest ihn im selben Tick wie seinen Seitenslice, sodass `asOfSeq` beide Lesevorgänge bei einer Sequenznummer abdeckt. Er gibt nur Client-Ansichten zurück, und jeder Wert passiert vor der Rückgabe das `viewSchema` seiner Unit. `stateOf(session, key)` liest einen lebenden Host-Zustand, ohne unabhängige Ansichten zu berechnen; Aufrufer dürfen die geliehene Referenz nicht mutieren. Eine Änderung der Zustandsreferenz berechnet eine gecachte Rohansicht, und der Change-Feed feuert nur, wenn sich dieses Ergebnis per `Object.is` ändert; eine objektwertige Ansicht muss ihre Referenz bewahren, um die Veröffentlichung über rein interne Zustandsänderungen hinweg zu unterdrücken.

## Die Registry: `ctx.sessionProjections`

`SessionProjectionRegistry` ([Signaturen](#ctxsessionprojections--sessionprojectionregistry)) besitzt den Drive: eine `session/event`-Subscription, eifriges `apply` über jede registrierte Unit und Watermark-Zellen pro Session und Unit. Zellen entstehen träge — eine Unit, die registriert wurde, nachdem Events geflossen sind, oder eine Session, die älter ist als die Registry, faltet `init` beim ersten Zugriff (Event oder Lesevorgang) über das In-Memory-Log. Die Registrierung ist ein Effekt, dessen Disposer an der aufrufenden Faser hängt: Der Schlüssel eines entladenen Domain-Plugins (mit seinen gecachten Zellen) verschwindet aus nachfolgenden Drives und Snapshots, und Clients lesen das als Fehlen der Capability; ein doppelter Schlüssel mit anderer `stateVersion` wirft, während Registranten derselben Version eine Unit teilen und gezählt werden. Domain-Plugins registrieren sich unter `ctx.inject(['sessionProjections'], …)`, damit headless Assemblies ohne die Registry unberührt bleiben.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generiert aus dem Quellcode durch `scripts/gen-cordis-catalog.ts` (per `pnpm run verify-cordis-catalog` in doc-sync auf Aktualität geprüft; Neugenerierung mit `pnpm run gen-cordis-catalog`) — die Sprachseiten unterscheiden sich nur in lokalspezifischen gepaarten Dokumentpfaden. Signaturblöcke verwenden einen `ts cordis-catalog`-Fence und behalten das ursprüngliche Quell-JSDoc; Dispatch-Modi sind im [primer](../cordis-primer.md#dispatch-modes) definiert, und die vom Framework geerbte `ctx`-API liegt in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionprojectioncache--sessionprojectioncache"></a>

### `ctx.sessionProjectionCache` — `SessionProjectionCache`

Der persistierte Projektions-Cache-Dienst. Er öffnet die Domain `session_projcache` beim Init, checkpunktet lebende Sessions über ein gedrosseltes Write-Behind (Zähl-/Intervall-Trigger aus der Config) plus drei Pflichtpunkte — Session-Erzeugung, `turn/end` und Session-Entsorgung (der Moment von live zu kalt) — und liefert die gecachten Zeilen für einen Session-Header. Jeder dauerhafte Schreibvorgang ist fail-soft: Fehler protokollieren eine Warnung, und der Cache heilt sich beim nächsten Schreibvorgang selbst.

```ts cordis-catalog
/**
 * The zero-I/O listing read: whole values viewed straight from the stored
 * rows (version-matching keys only) of the record bound to the caller's
 * lifecycle. The header is the only identity witness a listing holds, so
 * this face matches the lifecycle identity (`formatVersion`, `createdAt`,
 * `cwd`, `isSeeded`) and not the inherited cut: within one format
 * generation the cut is fixed at fork time, so it distinguishes no
 * lifecycle the other fields do not, and a viewed value never seeds a fold.
 * The view is as stale as the last durable checkpoint but never wrong and
 * never from an unrelated log. Its `asOfSeq` is the lowest watermark among
 * the served rows: the stored record's own position, which the header
 * cannot relate to the log the caller later opens. The Session list
 * therefore labels the block as cached, and the client lets every value the
 * connected Session produces supersede it whatever this number says.
 * @param meta - the listed session's header (identity witness; no log read).
 * @param keys - optional projection keys required by the caller's audience.
 * @returns the viewed block, or `undefined` when no usable row exists for
 *   this lifecycle at the current Session format.
 */
cachedSnapshot( meta: SessionHeader, keys?: readonly Extract<keyof SessionProjectionMap, string>[], ): ProjectionSnapshot | undefined

/**
 * Read only a predecessor checkpoint's title as a zero-I/O listing hint.
 *
 * The authoritative Session header supplies the lifecycle identity. A cache
 * checkpoint can lag that log but cannot lead it because writes flush the
 * log first, so a matching predecessor title is a genuine (possibly stale)
 * fact from this Session. The registry still requires the current title
 * projection's row version and schema. No other predecessor projection is
 * exposed: format normalization can change their current meaning, and the
 * {@link cachedSnapshot} / hydration paths continue to reject them.
 * @param meta - authoritative listed Session header.
 * @returns a title-only block at the stored title row's watermark, or
 *   `undefined` when the record is current, newer, unrelated, missing, or
 *   incompatible with the title unit.
 */
cachedPredecessorTitle(meta: SessionHeader): ProjectionSnapshot | undefined

/**
 * Hydrate projection cells for an already-prepared Session without another
 * persistence read. The cache seeds matching rows; the supplied exact log
 * advances every unit to the observation cut. No checkpoint is written
 * because the logical observation may contain recovery events not yet durable.
 * @param session - exact unpublished Session retained by persistence.
 * @param events - exact logical event prefix represented by the observation.
 * @returns all projection values at the event cut.
 */
hydratePrepared( session: Session, events: readonly SessionEvent[], ): ProjectionSnapshot

/**
 * Durably checkpoint one live session NOW (all mandatory points call
 * this; tests and carriers may too). The registry cut is snapshotted at
 * this boundary (states are live references), then the session's record is
 * replaced on the domain's write chain. NOT fail-soft — callers on the
 * fail-soft paths contain it.
 * @param session - the live session to checkpoint.
 * @returns resolution after durability and event emission.
 */
async write(session: Session): Promise<void>

/**
 * Cold-read one session's projections from its complete log. Each unit is
 * seeded from the identity-checked cached rows — the registry skips `apply`
 * for the already-folded prefix (events at or below the row's `seq`) — and
 * the refreshed checkpoint is written back (fail-soft, fire-and-forget), so
 * the first cold read creates the cache row and later ones seed from it.
 * The caller supplies the complete log in seq order: this service never
 * consults the persistence layer.
 * @param meta - the stored session header (identity witness).
 * @param inheritedEventCount - exact inherited prefix length for projection initialization and identity.
 * @param events - the session's complete log, in seq order.
 * @returns the projection cut at the log end.
 */
coldSnapshot( meta: SessionHeader, inheritedEventCount: SessionLogOffset, events: readonly SessionEvent[], ): ProjectionSnapshot
```

Types: [Session](session.md) · [SessionEvent](session.md) · [SessionHeader](persistence.md) · [SessionLogOffset](session.md)

Quelle: [`packages/session/session-projection-cache/src/index.ts`](../../packages/session/session-projection-cache/src/index.ts)

<a id="ctxsessionprojections--sessionprojectionregistry"></a>

### `ctx.sessionProjections` — `SessionProjectionRegistry`

`ctx.sessionProjections`: die Tabelle der Projektions-Units und ihr Drive. Der Dienst abonniert `session/event` einmal; jedes committete Event durchläuft das `apply` jeder registrierten Unit (eifriger Drive). Eine geänderte Zustandsreferenz berechnet die nächste Client-Ansicht; der Change-Feed wird nur benachrichtigt, wenn sich sein Rohergebnis per `Object.is` ändert. Zellen entstehen träge — eine Unit, die registriert wurde, nachdem Events geflossen sind, oder eine Session, die älter ist als die Registry, faltet `init` beim ersten Zugriff (Event oder Lesevorgang) über das In-Memory-Log. Die Registrierung ist ein Effekt (der Disposer hängt an der aufrufenden Faser): Der Schlüssel eines entladenen Domain-Plugins verschwindet aus Snapshots, und Clients lesen das als Fehlen der Capability. Ein Host-Leser deklariert `sessionProjections` entweder im `inject` seines Plugins oder schlägt ausdrücklich fehl, wenn die Registry oder ein benötigter Schlüssel fehlt. Beitragende können eine optionale Registrierung über `ctx.inject(['sessionProjections'], ...)` bewahren. Registranten, die einen Schlüssel teilen, teilen eine Unit und werden gezählt: Dasselbe Tool-Paket, in N Agent-Presets gemountet, registriert sich N-mal, und der Schlüssel überlebt, bis der letzte entladen wird.

```ts cordis-catalog
/**
 * Register one domain's unit. The registration is an effect on the calling
 * context's fiber: disposing the fiber (or calling the returned disposer)
 * removes the key — and the unit's cached cells — from subsequent drives
 * and snapshots.
 * @param definition - key, state schema, pure unit functions, and stateVersion.
 * @returns the exact disposer that unregisters this unit.
 */
register< K extends keyof SessionProjectionMap, S extends SessionProjectionStateMap[K], >( definition: Omit<ProjectionDefinition<K, S>, 'wire'> & { wire: NonNullable<ProjectionDefinition<K, S>['wire']> }, ): () => void

/**
 * Register one host-only unit. Its state is omitted from client snapshots
 * and always checkpointed like every other unit.
 * @param definition - key, state schema, pure unit functions, and stateVersion.
 * @returns the exact disposer that unregisters this unit.
 */
register< K extends Exclude<keyof SessionProjectionStateMap, keyof SessionProjectionMap>, S extends SessionProjectionStateMap[K], >( definition: Omit<ProjectionDefinition<K, S>, 'wire'>, ): () => void

/**
 * Subscribe to the change feed. The registration is an effect on the
 * calling context's fiber.
 * @param listener - called once per client-visible unit whose raw view changed by `Object.is`, per committed event.
 * @returns the exact disposer that unsubscribes.
 */
onChanged(listener: ProjectionChangeListener): () => void

/**
 * Read one unit's current host state after materializing every registered
 * unit at the Session cursor. Unrelated wire views are not produced.
 * The returned value is live; callers must not mutate it.
 * @param session - the session whose state is read.
 * @param key - the registered unit key.
 * @returns current state, or `undefined` when the key is not registered.
 */
stateOf<K extends keyof SessionProjectionStateMap>( session: Session, key: K, ): SessionProjectionStateMap[K] | undefined

/**
 * One consistent cut over every registered client-visible unit for one session, read from
 * the watermark cache (missing cells fold lazily over the in-memory log).
 * Fully synchronous — every value and `asOfSeq` reflect the same log
 * position. Each value passes its unit's `viewSchema` before leaving.
 * @param session - the session whose projection values are read.
 * @param keys - optional client-visible outputs; state materialization remains complete.
 * @returns the snapshot; `values` is empty when no selected client-visible unit is registered.
 */
snapshot( session: Session, keys?: readonly Extract<keyof SessionProjectionMap, string>[], ): ProjectionSnapshot

/**
 * Read only already-materialized client-visible cells without folding history.
 * Values may trail the live Session and are therefore hints, not a complete
 * baseline. Missing cells are omitted.
 * @param session - attached Session whose cached cells are inspected.
 * @param keys - optional wire keys to view.
 * @returns the lowest common cached cut, or `undefined` when no wire cell exists.
 */
cachedSnapshot( session: Session, keys?: readonly Extract<keyof SessionProjectionMap, string>[], ): ProjectionSnapshot | undefined

/**
 * State-level checkpoint of every persisted unit for one session, read
 * from the watermark cache (missing cells fold lazily over the in-memory
 * log). This is the write side of the persisted projection cache: the
 * returned rows are the `(key → {ver, seq, val})` part of the durable
 * `(sessionId, key, ver, seq, val)`
 * rows. Every `val` is a DETACHED structured clone — never the live
 * cell reference: the watermark cache is this registry's authoritative
 * mutable state, and a caller reaching the live reference could corrupt
 * every subsequent snapshot and frame through it (plain JSON by the unit
 * contract, so the clone is total).
 * @param session - the session whose unit states are checkpointed.
 * @returns one row per registered key.
 */
checkpoint(session: Session): ProjectionCheckpoint

/**
 * The stored seq a {@link restore} tail read over `checkpoint` must start
 * at: one event BELOW the lowest usable watermark (a row is usable when
 * its `ver` matches the live unit's `stateVersion`; an absent or mismatched row
 * pulls the floor to `0` — that key must refold the full log). The
 * one-below anchor is load-bearing: the tail then proves how far the
 * stored log still extends, so {@link restore} can detect a log that
 * shrank below a row's watermark (crash-repair truncation) instead of
 * serving the stale row as current — an empty tail read from the anchor
 * yields an end below every watermark and the restore rejects for a full
 * re-read.
 * @param checkpoint - persisted rows for one session (possibly stale or empty).
 * @returns the offset for the stored-log suffix read (`SessionHandle.read`),
 *   or `undefined` when no unit is registered (no read needed —
 *   {@link restore} would serve empty values regardless).
 */
restoreFloor(checkpoint: ProjectionCheckpoint): SessionLogOffset | undefined

/**
 * View a checkpoint's rows without any log read: for every registered
 * client-visible unit whose row's `ver` matches, serve the schema-validated
 * `view` of the schema-validated stored state; mismatched, malformed, or absent rows leave their key
 * absent (a cold or listing consumer treats it as not-yet-available and a
 * fuller read path refolds it). The zero-I/O rung of the read ladder —
 * values are as stale as their rows, never wrong.
 * @param checkpoint - persisted rows for one session (possibly stale or empty).
 * @param keys - optional wire keys to view.
 * @returns whole values per key with a usable row; empty when none.
 */
viewCheckpoint( checkpoint: ProjectionCheckpoint, keys?: readonly Extract<keyof SessionProjectionMap, string>[], ): Partial<SessionProjectionMap>

/**
 * Cold read: fold every persisted unit over a stored log suffix, seeding
 * each from its checkpoint row when usable — the one read recipe (cached
 * state + forward tail replay + `view`) applied without a live `Session`.
 * Call with the stored events at or past `restoreFloor(checkpoint)` (a
 * `SessionHandle.read` slice) and that same floor as
 * `baseSeq`; the floor's one-below anchor makes the supplied end honest,
 * so a shrunk log is detected here. A row is usable iff its
 * `ver` matches the live unit's `stateVersion`, it does not predate `baseSeq`
 * (`seq >= baseSeq - 1`), and it does not claim events past the
 * supplied end (`seq <= endSeq`); an unusable row is discarded
 * and its key refolds from `init` — which is only sound over the full
 * log, so a discarded row with `baseSeq > 0` throws (the caller re-reads
 * from seq 0, e.g. after a crash-repair truncation shrank the log below
 * a row's watermark).
 * @param checkpoint - persisted rows for one session (possibly stale or empty).
 * @param events - the stored events with `seq >= baseSeq`, in seq order.
 * @param baseSeq - the seq `events` starts at (its first event's seq when non-empty).
 * @param header - immutable metadata for the Session being restored.
 * @param inheritedEventCount - exact fork-inherited prefix length supplied to unit initialization.
 * @returns the snapshot cut at the supplied log end (`asOfSeq` is the last
 *   supplied event's seq, `baseSeq - 1` for an empty tail) plus the
 *   refreshed checkpoint rows at that cut, ready for a durable write-back.
 */
restore( checkpoint: ProjectionCheckpoint, events: readonly SessionEvent[], baseSeq: SessionLogOffset, header: SessionHeader, inheritedEventCount: SessionLogOffset, ): { snapshot: ProjectionSnapshot; checkpoint: ProjectionCheckpoint }

/**
 * Restore an exact cut and install its states on the supplied prepared Session.
 * A later publication reuses these cells; ordinary live reads and event drive
 * advance any constructor-owned suffix exactly once.
 * @param session - exact prepared Session that owns the restored log prefix.
 * @param checkpoint - persisted rows for this Session lifecycle.
 * @param events - exact events at the observation cut.
 * @param baseSeq - first supplied event sequence.
 * @returns all projection values at the supplied cut.
 */
hydrate( session: Session, checkpoint: ProjectionCheckpoint, events: readonly SessionEvent[], baseSeq: SessionLogOffset, ): ProjectionSnapshot
```

Types: [Session](session.md) · [SessionEvent](session.md) · [SessionHeader](persistence.md) · [SessionLogOffset](session.md)

Quelle: [`packages/session/session-projection/src/index.ts`](../../packages/session/session-projection/src/index.ts)
<!-- END GENERATED cordis-surface -->
