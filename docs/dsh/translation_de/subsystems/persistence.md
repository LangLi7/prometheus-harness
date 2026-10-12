# Session-Persistenz

English | [中文](persistence.zh.md)

Der **Durability-Seam** für das Event-Log. [session.md](session.md) beschreibt die im Speicher gehaltene `Session` — das append-only `SessionEvent`-Log, das die Quelle der Wahrheit ist. Diese Seite beschreibt, wie dieses Log dauerhaft gemacht wird: den abstrakten Dienst `SessionPersistence`, sein Provider-Modell und das ausgelieferte JSONL-Backend, den Flush-Checkpoint, die Crash-Wiederherstellung und den Metadaten-Header, der neben dem Log mitgeführt wird. Das Event-Vokabular, das das Log trägt, ist im generierten [Katalog der Persistenz-Log-Events](../persistence-catalog.md) Member für Member aufgelistet.

Der Seam ist ein [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md): ein abstrakter Dienst ([dsh-session-persistence](../../packages/session/session-persistence), `ctx.sessionPersistence`), der `create`/`open`/`stat`/`list` über dem bestehenden `SessionEvent` offenlegt — **kein paralleler persistierter Event-Typ** —, wobei `create` und `open` ein `SessionHandle` pro Session (`read`/`append`/`flush`/`close`) zurückgeben, das den gesamten Log-Zugriff und die Single-Writer-Ownership trägt. Das Repository liefert [dsh-session-persistence-jsonl](../../packages/session/session-persistence-jsonl) als Provider aus; Provider außerhalb des Baums können denselben Dienstvertrag implementieren. Siehe die [Agent Note zur handle-basierten Persistenz](../../.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.md) und die [session-persistence-Referenz](../../packages/session/session-persistence/README.md).

## `SessionHandle` — ein offener Kanal auf eine gespeicherte Session

Jeder Log-Lese- und -Schreibvorgang läuft über ein Handle, niemals über id-adressierte Dienstmethoden: das Handle ist die einzige Tür, die das prozessübergreifende Write-Lease bewacht. Ein Lesevorgang gibt einen vom Aufrufer besessenen äußeren Slice und den vom Produzenten hergestellten Aliasing-Zustand seiner Event-Werte zurück. Ein Handle-Typ bedient beide Zugriffe — eine Mutation auf einem `read`-Handle ist ein Laufzeit-`SessionReadOnlyError` statt einer typisierten Trennung —, und die Single-Writer-Ownership innerhalb des Prozesses lässt ein zweites `open(id, 'write')` mit `SessionAlreadyOwnedError` zurückweisen, solange ein Eigentümer aktiv ist.

```ts type-equiv
/** One persistence event slice returned by {@link SessionHandle.read}. */
interface SessionHandleReadResult {
  /**
   * Whether event values are exclusively owned or shared only after deep
   * freezing. Slicing preserves the producer's state even when no events remain.
   */
  readonly eventState: SessionSeedEventState
  /** Event values in a caller-owned outer array. */
  readonly events: readonly SessionEvent[]
}
```

```ts type-equiv
/**
 * One open channel onto a stored session. A handle is single-owner state, not
 * a shared service: `read` never backtracks below what this handle already
 * observed, a `write` handle reads its own successful appends, and `close()`
 * is the one teardown (idempotent, uncancellable; `Symbol.asyncDispose`
 * delegates to it). Every operation on a closed handle rejects with
 * `SessionHandleClosedError`.
 *
 * Freshness across handles: once an `append` or `flush` resolves on a write
 * handle, every read STARTED afterwards on the same backend instance — on any
 * handle, or through `stat`/`list` — observes at least that prefix.
 * Reads concurrent with a mutation carry no ordering promise beyond the valid
 * contiguous prefix.
 */
interface SessionHandle extends AsyncDisposable {
  /** The stored session this handle addresses. */
  readonly id: SessionId
  /** The immutable stored header, fixed at `create`/`open`. */
  readonly header: SessionHeader
  /**
   * Exact fork-inherited prefix length stored with the log; `0` when
   * `header.isSeeded` is false. Storage metadata paired with the header for
   * every body read, never part of the replayable event log.
   */
  readonly inheritedEventCount: SessionLogOffset
  /** Whether this handle may mutate the log. */
  readonly access: SessionAccess

  /**
   * Read a slice of the valid contiguous logical log. The slice is a legal log
   * prefix segment: a torn physical tail is never returned, and repeated reads
   * on this handle never observe an older state than a prior read.
   * @param offset - first logical event seq to include; defaults to `0`.
   * @param length - maximum number of events to return; defaults to the rest
   *   of the log. An offset at or past the end returns an empty list.
   * @param options - optional cancellation.
   * @returns the caller-owned outer slice plus the ownership state of its event values.
   */
  read(offset?: number, length?: number, options?: SessionHandleReadOptions): Promise<SessionHandleReadResult>

  /**
   * Append a contiguous batch continuing the current logical end. The first
   * event's `seq` MUST equal the stored next-seq; committed events are never
   * rewritten. Persistence is best-effort: on resolution the batch is
   * accepted, ordered, and visible to reads on this backend instance, but
   * only a resolved {@link flush} promises it survives a crash — a backend
   * may buffer or batch physical writes behind append. Rejects with
   * `SessionReadOnlyError` on a read handle and `SessionOwnershipLostError`
   * when write ownership is gone.
   * @param events - the contiguous batch, in seq order.
   * @param options - optional cancellation observed before the write starts.
   */
  append(events: readonly SessionEvent[], options?: SessionHandleAppendOptions): Promise<void>

  /**
   * The durability barrier — the one operation that promises storage: on
   * resolution every acknowledged append is durable and the session is
   * materialized for other processes; an empty created session becomes
   * durably listable here. Callers that must survive a crash flush; a backend
   * whose `append` already persists on resolution treats this as
   * materialize-if-needed. Rejects with `SessionReadOnlyError` on a read
   * handle.
   * @param options - optional cancellation observed before the barrier starts.
   */
  flush(options?: SessionHandleFlushOptions): Promise<void>

  /**
   * Release the handle: a read handle frees local resources; a write handle
   * completes pending durability and releases write ownership. Idempotent,
   * asynchronous, and deliberately not cancellable.
   */
  close(): Promise<void>
}
```

Eine erzeugte Session ist in diesem Prozess ab dem Moment beobachtbar, in dem `create` aufgelöst wird, während ein Backend die physische Materialisierung (eine reine Optimierung) bis zum ersten `append` oder `flush` aufschieben kann; andere Prozesse sehen nur materialisierte Sessions, und eine Session, die vor einem Crash nie materialisiert wurde, hat nie existiert.

## Der Flush-Checkpoint

`session/event` ist eine *synchrone* Benachrichtigung; das gemountete Backend leitet sie nach Session-Id in das begrenzte Write-Behind-Fenster des aktiven Write-Handles, ohne den Produzenten zu blockieren (das Backend installiert diese Listener einmal, weil die Persistenz bereits ein aktives Write-Handle pro Id erzwingt). Das erste ausstehende Event startet ein festes internes Batching-Fenster, und spätere Events treten bei, ohne dessen Deadline zurückzusetzen. Der Ablauf startet ein dauerhaftes `append` über das Write-Handle der Session; Events, die während dieses Schreibvorgangs zugelassen werden, erhalten ihre eigene Deadline und bilden einen Folge-Batch. `session/flush` bricht das Warten ab und leert bis zur Quieszenz, sodass der Loop es weiterhin als Ordnungs- und Fehlerbeobachtungs-Checkpoint verwendet, bevor er den nächsten gewöhnlichen Turn beansprucht. Ein zurückgewiesener Hintergrund-Schreibvorgang behält seine Events in Reihenfolge, pausiert den automatischen Pfad und wird über den Logger gemeldet; der nächste explizite Flush wiederholt den Versuch und weist gegenüber seinem Aufrufer laut zurück. `session/disposed` führt denselben finalen Drain aus und schließt das Handle, und `close()` selbst leert den geleiteten Puffer durch den noch offenen Speicher, sodass der Close-Sweep des Backend-Teardowns nichts verliert. Das Fenster begrenzt nur die beabsichtigte Batching-Wartezeit, nicht die Event-Loop-Planung oder die Durability-Latenz des Backends.

## Die Crash-Wiederherstellung bewahrt einen unterbrochenen Turn

Ein Log, das mitten in einem Turn abstürzt, endet mit einem offenen `turn/start` und ohne `turn/end`. Die Persistenz **kürzt oder repariert es nicht** — ein einzelner Turn kann in einer langfristigen Aufgabe riesig sein (viele Schritte, große Tool-Ausgabe), und diese Events wurden vor dem Crash dauerhaft angehängt. Sie gibt das physisch gültige zusammenhängende Log zurück; nur das unvollständige Fragment eines zerrissenen physischen Endes, das zu einem nie aufgelösten Append gehört, wird verworfen — vollständige daraus wiedergewonnene Datensätze (das JSONL-Backend dekodiert einen zerrissenen Zstandard-Frame teilweise) werden vom Schreibpfad dauerhaft neu geschrieben, bevor das Handle seinen ersten neuen Append ausführt. Die Reparatur ist Aufgabe des Lesers: Resume (agent-loop) liest das gespeicherte Log über sein Write-Handle, berechnet `interruptedTurnClosers` — fehlende Tool-Fehler, jedes offene `step/end` und ein synthetisches `turn/end { reason: { kind: 'interrupted' } }` — und hängt sie über dasselbe Handle als gewöhnlichen Batch an, bevor die Session veröffentlicht wird. `interrupted` ist der eine `TurnEndReason`, den kein Loop ausgibt (siehe [session.md](session.md#why-a-turn-ended-turnendreasonmap)).

Die Reparatur schreibt daher nur unter Write-Ownership: Das Write-Handle einer laufenden Session wird von ihrem Lifecycle-Owner gehalten, sodass ein gleichzeitiges `open(id, 'write')` mit `SessionAlreadyOwnedError` zurückweist, statt die Reparatur gegen einen laufenden Turn zu rennen. Read-only-Beobachter (session-query) gleichen ein unterbrochenes kaltes Log mit denselben Closern nur im Speicher aus und schreiben nichts zurück.

Read-only-Beobachtung ist `open(id, 'read')`: Das Handle bedient validierte zusammenhängende Präfix-Slices, niemals ein zerrissenes Ende, und wiederholte Lesevorgänge auf einem Handle beobachten nie einen älteren Zustand als ein vorheriger Lesevorgang. Es gibt keinen Persistenz-seitigen Cache vorbereiteter Sessions: session-query besitzt seinen Kaltlese-Cache, verschlüsselt eine ausgeglichene kalte Session pro Id mit dem Änderungstoken `stat().revision` und liest nur neu, wenn sich das Token ändert. Die [Agent Note zur handle-basierten Persistenz](../../.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.md) besitzt diesen Lifecycle; der archivierte [Session preparation record](../../.agents/notes/archived/architecture/2026-08-05-session-preparation.md) dokumentiert die ursprüngliche Entscheidung zu `SessionPreparation` an der Veröffentlichungsgrenze.

## `SessionLocation` — Zielartefakt der Verweigerungsdiagnose

`SessionLocation` ist keine konsumentengerichtete Abfrage: Der Log-Zugriff läuft über das `read` eines Session-Handles. Es überlebt nur als Verweigerungsdiagnose und erlaubt einem `SessionFormatUnsupportedError`, das rohe Log zu benennen, dessen Interpretation ein Build verweigert hat. JSONL liefert den absoluten Transkriptpfad innerhalb seines Projekt-/Session-Verzeichnisses; ein Backend ohne ein Artefakt pro Session liefert nichts.

```ts type-equiv
/**
 * A backend-resolved, per-session local artifact location. Carried only by
 * refusal diagnostics ({@link SessionFormatUnsupportedError}) so a user can
 * find the raw log a build refused to interpret; it is not a consumer-facing
 * query — log access goes through a session handle's `read`.
 */
interface SessionLocation {
  /** Backend-specific artifact kind, for example `jsonl`. */
  readonly kind: string
  /** Absolute path to this session's backend-owned artifact. */
  readonly path: string
}
```

<a id="sessionheader--metadata-beside-the-log"></a>

## `SessionHeader` — Metadaten neben dem Log

Metadaten pro Session werden **getrennt** vom Event-Log geführt: Der Header trägt Formatversion, cwd und das Lineage-Bit `isSeeded`, während körperhaltige Speicherwerte daneben den exakten geerbten Schnitt tragen. Keines von beiden gehört zu `SessionEventMap` oder erreicht `deriveMessages()`. Der logische Header wird über `session.header` angehängt; die Session legt ihren Schnitt als `inheritedEventCount` offen.

Quelle: [`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

```ts type-equiv
/**
 * Immutable validated storage metadata, kept outside the conversation event log.
 */
interface SessionHeader {
  /**
   * Current logical format version, stamped from {@link SESSION_FORMAT_VERSION}.
   * Historical physical headers are translated before entering this interface.
   */
  readonly version: typeof SESSION_FORMAT_VERSION
  /** The session's id (mirrors the {@link Session}'s id). */
  readonly id: SessionId
  /** Non-negative safe-integer Unix epoch milliseconds when the session was created. */
  readonly createdAt: number
  /** Absolute working directory the session was created in (if any). */
  readonly cwd?: string
  /** The session this one was forked from (seed lineage), if any. */
  readonly parentSession?: SessionId
  /**
   * Whether this Session contains a fork-inherited event prefix. The exact prefix
   * length is Session state rather than ordinary header metadata.
   */
  readonly isSeeded: boolean
  /**
   * Coarse product classification for a session created as a subagent child.
   * This is presentation metadata, not proof that the child is continuable.
   */
  readonly origin?: 'subagent'
  /**
   * Delegation depth: absent (zero) for a top-level session, parent depth + 1
   * for a subagent child. Persisted so a recursion budget survives restart and
   * resume — a runtime-only depth would reset a resumed child to top-level.
   */
  readonly delegationDepth?: number
  /**
   * Id of the agent preset this session's agent was composed from, when the
   * deployment composes per session. Durable because the preset decides the
   * session's tools and prompt: a resume that restored a different composition
   * would replay history the model can no longer act on.
   */
  readonly agentPreset?: string
}
```

## Formatverweigerung — Logs, die ein Build nicht getreu lesen kann

Ein Backend verweigert ein Log, das es nicht getreu interpretieren kann, mit `SessionFormatUnsupportedError`, unterschieden von `SessionPersistenceCorruptionError`, weil nichts beschädigt ist. `stat` und `list` klassifizieren die höchste kanonische Generation und übersetzen einen unterstützten historischen Header, ohne dessen Körper zu lesen oder zu verändern. Historische `open`-Aufrufe teilen sich eine Migrationsvorbereitung pro Session, bevor sie aktuelle logische Werte zurückgeben, und lassen jeden Quellpfad, jedes Byte und jeden Inode unverändert. Der JSONL-Provider gibt aus diesem In-Memory-Ergebnis ein Read-Handle zurück, ohne zu veröffentlichen; ein Write-Open hält seinen Single-Writer-Anspruch und sein Datei-Lease, während es die Vorbereitung wiederverwendet, veröffentlicht ausschließlich die finale aktuelle Generation und gibt erst dann das beschreibbare Handle zurück. Eine künftige höchste Generation wird selbst dann verweigert, wenn eine ältere lesbare Generation verbleibt. Die Wiederherstellung des aktuellen Formats behält installierte Erweiterungen und unbekannte Events mit `ignorable: true`; die Migration historischer v0/v1/v2 verweigert einen unbekannten Typ selbst dann, wenn er als ignorierbar markiert ist. Die Meldung hängt den ausgewählten rohen Log-Pfad an, wenn das Backend ein Artefakt pro Session führt. Ein Backend außerhalb des Baums muss an seinem physischen Format-Einstieg gleichwertige Handle-Werte nur für das aktuelle Format und richtungsbewusste Verweigerungen durchsetzen. Die [Entscheidung zur Migration ausgelieferter Formate](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md) besitzt die Kette und die Regeln unveränderlicher Veröffentlichung.

## `CreateSessionOptions` — Seeding und Metadaten

Das Erzeugen einer `Session` über den Store nimmt einen `seed` (initiale Replay- oder Fork-Historie), einen optionalen exakten `inheritedEventCount` und `meta` (die Speicherebenen-Felder, die der Store zu einem `SessionHeader` faltet). Der Store füllt `version`/`id` ein und belegt `createdAt` mit einem Standardwert; der Aufrufer kann das validierte absolute `cwd`, die `parentSession`-Lineage, das Lineage-Bit `isSeeded`, ein optionales grobes `origin`, `delegationDepth`, `agentPreset` und ein bestehendes `createdAt` liefern. Eine geseedete Erzeugung erfordert einen expliziten Seed, der seinem geerbten Präfix und einem exakten Schnitt entspricht; der Konstruktor hängt den vom Kind besessenen getaggten End-Seed-Marker an diesem Schnitt an, bevor das Setup vom Kind besessene Events hinzufügt. `origin: 'subagent'` erlaubt es der Produktnavigation, doppelte Kind-Zeilen auszublenden; es beweist nicht, dass ein Deskriptor gültig ist oder dass das Kind fortsetzen kann.

```ts type-equiv
/**
 * Options for creating a {@link Session} via the store. `seed` replays/forks
 * an existing event log; `meta` carries the caller-supplied storage fields the
 * store folds into a {@link SessionHeader}.
 */
interface CreateSessionOptions {
  /** Initial replay or fork history supplied at construction. */
  readonly seed?: readonly SessionEvent[]
  /**
   * Exact fork-inherited prefix length when `meta.isSeeded` is true. The
   * constructor appends the child-owned tagged marker at the cut unless
   * the seed already includes it followed by child-owned fork closers.
   */
  readonly inheritedEventCount?: SessionLogOffset
  /**
   * Storage metadata read once before publication. `isSeeded` marks fork
   * lineage; supplying replay history alone does not make it inherited.
   */
  readonly meta?: {
    readonly cwd?: string
    readonly parentSession?: SessionId
    readonly createdAt?: number
    readonly isSeeded?: boolean
    readonly origin?: 'subagent'
    readonly delegationDepth?: number
    readonly agentPreset?: string
  }
}
```

Replay/Fork ist daher `ctx.agents.create({ sessionId, seed, meta })` — ein Fork liefert zusätzlich `inheritedEventCount` mit `meta.isSeeded: true`, und nur von agent-loop veröffentlichte Sessions werden persistiert, und der Loop speichert den Seed über das Write-Handle der neuen Session vor der Veröffentlichung; das Fortsetzen einer *persistierten* Session in einen lebenden Agent ist `ctx.agents.resume({ resumeSessionId })`.

## Ownership von Vorbereitung und Wiederherstellung

`SessionStore.prepare()` akzeptiert gewöhnliche Erzeugungsoptionen oder einen übernehmbaren Seed über `RestoredSessionOptions`. Sein `eventState` sagt, ob Event-Werte unabhängig besessen oder erst nach tiefem Einfrieren geteilt werden; der Produzent stellt diesen Zustand her, und das Slicing leitet aus der Ergebnislänge keinen anderen Zustand ab. Die Wiederherstellung validiert und übernimmt diese Werte ohne weitere Kopie oder weiteren Freeze-Durchlauf. `SessionPreparation` besitzt dann die exakte unveröffentlichte Session bis zur Veröffentlichung oder zum Rollback; die Entsorgung ist synchron und idempotent. Der Resume von agent-loop liest dieses Ergebnis über das Write-Handle der Session und hängt unabhängig besessene `interruptedTurnClosers` vor der Vorbereitung an.

```ts type-equiv
/**
 * Aliasing state of an adoptable Session seed. `shared-frozen` permits deeply
 * frozen aliases plus independently owned unfrozen values in the same seed.
 */
type SessionSeedEventState = 'detached' | 'shared-frozen'
```

```ts type-equiv
/**
 * Adoptable storage values transferred to {@link SessionStore.prepare}
 * without another copy or freeze pass.
 */
interface RestoredSessionOptions {
  /** Events that are independently owned or already deeply frozen. */
  readonly seed: SessionEvent[]
  /** Independently owned storage metadata to validate and freeze in place. */
  readonly meta: SessionHeader
  /** Exact number of fork-inherited leading events decoded from storage. */
  readonly inheritedEventCount: SessionLogOffset
  /** Aliasing state carried from the operation that produced the seed. */
  readonly eventState: SessionSeedEventState
}
```

```ts type-equiv
/** Inputs accepted while constructing an unpublished Session. */
type PrepareSessionOptions =
  | (CreateSessionOptions & { readonly eventState?: undefined })
  | RestoredSessionOptions
```

```ts type-equiv
/** Options for a preparation whose provider retains unpublished state. */
interface SessionPreparationOptions {
  /** Release provider-owned state when the Session was not published. */
  readonly release?: () => void
}
```

```ts public-api
/**
 * One exact unpublished Session and the provider state that keeps it usable.
 * Disposal is synchronous and idempotent. Providers decide whether release
 * returns the Session to a cache or discards it; publication may consume that
 * state before disposal, making the callback a no-op.
 */
declare class SessionPreparation implements Disposable {
  /** The exact Session to use for setup and publication. */
  readonly session: Session;
  /**
   * Wrap an unpublished Session in one preparation lifetime.
   * @param session - exact unpublished Session.
   * @param options - optional provider release behavior.
   * @returns a preparation disposed after publication or rollback.
   */
  static create(session: Session, options?: SessionPreparationOptions): SessionPreparation;
  /** Release provider state once when this preparation leaves its caller. */
  [Symbol.dispose](): void;
}
```

## Leichtgewichtige Quellrevisionen

Consumer abgeleiteter Lesemodelle vergleichen eine günstige undurchsichtige Revision, bevor sie ein vollständiges Event-Log laden. Die Revision ist ein Änderungstoken pro Backend-Instanz aus `stat`/`list`: gleiche Revisionen dürfen als unverändertes Log behandelt werden; ungleiche Revisionen versprechen nichts, und Write-Ownership-Wechsel ändern eine Revision nie. session-query verschlüsselt seinen Kaltlese-Cache damit; das Token spielt bei Open, Read oder Resume keine Rolle.

```ts type-equiv
/**
 * Backend-owned token that identifies both one storage source and one revision
 * of a persisted session log.
 */
type SessionPersistenceRevision = Branded<'SessionPersistenceRevision'>
```

```ts type-equiv
/**
 * Lightweight stored-session observation returned by {@link SessionPersistence.stat}
 * and {@link SessionPersistence.list} without reading the full event log.
 */
interface SessionPersistenceSnapshot {
  /** Detached metadata for one stored session. */
  readonly header: SessionHeader
  /** Header-only format classification; absent without versioned artifact metadata. */
  readonly formatStatus?: 'current' | 'migration-required'
  /** Opaque change token; see {@link SessionPersistence.stat}. */
  readonly revision: SessionPersistenceRevision
  /** Logical event count, when the backend can provide it cheaply from metadata; otherwise absent. */
  readonly eventCount?: number
  /** Physical artifact byte size, when the backend can provide it cheaply (JSONL); otherwise absent. */
  readonly sizeBytes?: number
}
```

Die optionalen Felder `eventCount`/`sizeBytes` bleiben günstige Backend-Beobachtungen für Consumer, die sie ausdrücklich benötigen. Das Auflisten von Sessions nutzt keines der beiden Felder, um kalte Logs zu öffnen: Es liest nur Header plus identitätsgeprüfte Hinweise aus dem Projektions-Cache, sodass ein Cache- oder Session-Format-Upgrade den Start nie in einen Körper-Scan verwandelt.

## Das Backend

Der ausgelieferte Provider implementiert den abstrakten `SessionPersistence`-Vertrag (`create`/`open`/`stat`/`list`, mit `SessionHandle`s pro Session, die `read`/`append`/`flush`/`close` und durchgängig optionalen Abbruch tragen) und besteht die gemeinsame Persistenz-Vertragssuite:

- **[dsh-session-persistence-jsonl](../../packages/session/session-persistence-jsonl)** — ein append-only logisches JSONL-Log pro Session, standardmäßig als geprüfsummte verkettete Zstandard-Frames gespeichert oder per Konfiguration als rohe Zeilen, mit crash-sicherer atomarer Materialisierung, `fsync`-Appends pro Batch und Kürzung des zerrissenen Endes vor dem ersten neuen Append. `stat`/`list` tragen `sizeBytes` und eine nach bestem Bemühen aus `fs.stat` abgeleitete Revision.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generiert aus dem Quellcode durch `scripts/gen-cordis-catalog.ts` (per `pnpm run verify-cordis-catalog` in doc-sync auf Aktualität geprüft; Neugenerierung mit `pnpm run gen-cordis-catalog`) — die Sprachseiten unterscheiden sich nur in lokalspezifischen gepaarten Dokumentpfaden. Signaturblöcke verwenden einen `ts cordis-catalog`-Fence und behalten das ursprüngliche Quell-JSDoc; Dispatch-Modi sind im [primer](../cordis-primer.md#dispatch-modes) definiert, und die vom Framework geerbte `ctx`-API liegt in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionpersistence--sessionpersistence-abstract-seam"></a>

### `ctx.sessionPersistence` — `SessionPersistence` (abstrakter Seam)

Dauerhafter append-only Session-Speicher, adressiert über Handles pro Session.

Speichersemantik, die jedes Backend teilt: Events sind ab seq 0 zusammenhängend und werden nie neu geschrieben; ein zerrissenes physisches Ende wird einem Leser nie zurückgegeben und vom Schreibpfad vor seinem ersten Append gekürzt; Lesevorgänge validieren nur Datensätze des aktuellen Formats und verweigern unbekanntes Vokabular fail-closed. `append` persistiert nach bestem Bemühen; `flush` — pro Handle oder dienstweit — ist die Durability-Barriere.

Sichtbarkeit: Eine erzeugte Session ist über `stat`/`list`/`open` in diesem Prozess ab dem Moment beobachtbar, in dem `create` aufgelöst wird, selbst während ein Backend die physische Materialisierung aufschiebt (eine reine Optimierung); andere Prozesse sehen die Session erst, wenn sie materialisiert, und eine Session, die vor einem Crash nie materialisiert wurde, hat nie existiert. `SessionHandle.flush` erzwingt die Materialisierung.

Aktualität: Sobald ein `append` oder `flush` aufgelöst wird, beobachten danach gestartete Lesevorgänge auf dieser Backend-Instanz mindestens dieses Präfix.

```ts cordis-catalog
/**
 * Create a new stored session and take its write ownership.
 * @param header - the immutable header (id, version, cwd, lineage) to store.
 * @param options - optional cancellation.
 * @returns a `write` handle owned by the caller; close it to release ownership.
 * @throws {SessionAlreadyExistsError} when the id already exists.
 */
abstract create(header: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle>

/**
 * Open an existing stored session.
 *
 * `read` never takes ownership and works while another handle (or process)
 * holds write ownership. `write` atomically claims single-writer ownership;
 * an existing active owner rejects.
 * @param id - the stored session to open.
 * @param access - `read` or `write`.
 * @param options - optional cancellation.
 * @returns the open handle.
 * @throws {SessionPersistenceNotFoundError} when the session does not exist.
 * @throws {SessionAlreadyOwnedError} for `write` when ownership is taken.
 */
abstract open(id: SessionId, access: SessionAccess, options?: SessionPersistenceOpenOptions): Promise<SessionHandle>

/**
 * Flush every active write handle owned by this service instance in one
 * durability barrier: each handle's routed live events drain durably and
 * its session materializes, exactly as that handle's own
 * `SessionHandle.flush` would. Read handles buffer nothing and are
 * untouched. A handle closed concurrently counts as flushed — close itself
 * drains durably.
 * @returns resolution once every write handle active at the call has flushed.
 * @throws {AggregateError} naming each session whose flush failed; the
 *   remaining handles still flush.
 */
abstract flush(): Promise<void>

/**
 * Observe one stored session without reading its event log or taking
 * ownership.
 *
 * The snapshot's `revision` is an opaque change token comparable only
 * against revisions from the same service instance and session id: equal
 * revisions may be treated as an unchanged log; unequal revisions promise
 * nothing. Write-ownership churn does not change a revision. It exists for
 * derived read-model caches keyed off `stat`/`list`; it plays no part in
 * open, read, or resume.
 * @param id - the stored session to observe.
 * @param options - optional cancellation.
 * @returns the snapshot, or `undefined` when the session does not exist.
 */
abstract stat(id: SessionId, options?: SessionPersistenceStatOptions): Promise<SessionPersistenceSnapshot | undefined>

/**
 * List every stored session visible to this process, in no promised order.
 * @param options - optional cancellation.
 * @returns one snapshot per stored session.
 */
abstract list(options?: SessionPersistenceListOptions): Promise<readonly SessionPersistenceSnapshot[]>
```

Types: [SessionId](core.md)

Quelle: [`packages/session/session-persistence/src/index.ts`](../../packages/session/session-persistence/src/index.ts)
<!-- END GENERATED cordis-surface -->
