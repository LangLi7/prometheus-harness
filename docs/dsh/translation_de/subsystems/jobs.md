# Hintergrund-Job-Laufzeit

English | [中文](jobs.zh.md)

Typen, die von lang laufenden Produzenten, `ctx.jobs` und Job-Steuerung gemeinsam genutzt werden. Die [seam consolidation Agent Note](../../.agents/notes/implemented/architecture/2026-09-03-jobs-seam-consolidation.md) besitzt das aktuelle Design und die [runtime reference](../../packages/jobs/jobs/README.md) dessen Ursprung; diese Seite hält die exakten Felder und Varianten aus [`packages/jobs/jobs/src/types.ts`](../../packages/jobs/jobs/src/types.ts) und dem client-sicheren Blatt [`view.ts`](../../packages/jobs/jobs/src/view.ts) fest.

## Ids und Status

`JobId` ist eine [branded id](core.md#branded-ids), die als `<kind>-N` erzeugt wird. Zugriffskontrolle beruht auf der Autorisierung des Eigentümers, nicht auf der Geheimhaltung der Id. `JobKind` leitet sich aus einer merge-erweiterbaren Map ab; die Registry behandelt Kinds als undurchsichtige Id-Namensräume.

```ts type-equiv
/**
 * Producer-defined job kinds. Plugins extend this map by declaration merging;
 * the registry treats every value as an opaque id namespace.
 */
interface JobKindMap {
  bash: 'bash'
}
```

`JobStatus` ist `'running' | 'stopping' | 'completed' | 'killed' | 'failed'`; produzentenspezifische Fakten gehören in `JobView.progress`, während der Job läuft, und in `JobView.detail`, sobald er abgeschlossen ist.

## Produzentenvertrag

Ein `JobSpec` deklariert Identität, die besitzende Session, optionale Pull-`output`-Quellen und einen Starter. Die Laufzeit schließt das Preflight ab, bevor sie `run()` mit dem `JobHandle` des Jobs aufruft, und committet ohne einen späteren fehlschlagbaren Schritt. Produzenten besitzen Ausführungsressourcen; die Laufzeit besitzt Identität, Zugriff, Lifecycle-Zustand und den Output-Ring.

```ts type-equiv
/**
 * Producer declaration passed to {@link JobRegistry.start}. The runtime
 * preflights access and cleanup before invoking {@link run}; the producer owns
 * execution resources while the runtime owns identity, lifecycle state, and
 * the output ring.
 */
interface JobSpec {
  /** Producer kind — also the id prefix (`bash`, …). */
  kind: JobKind
  /** One-line model-facing label (the command; the delegation description). */
  label: string
  /**
   * Owning session. Access is fenced by it, and the owner's live Agent must be
   * the one currently registered under that id: its disposal cancels and
   * awaits the job. Omitting the owner creates an unowned job, open to any
   * caller until service disposal.
   */
  owner?: SessionId
  /**
   * Optional UTF-8 byte cap for each complete model-facing completion notice or
   * output read, including controller status metadata. Independent of ring
   * retention: it bounds the consuming model surface, never observers.
   */
  outputLimitBytes?: number
  /**
   * Pull sources the registry pumps into the ring at its own cadence.
   * Producers that narrate their own progress use {@link JobHandle.append}
   * instead; a job may use both.
   */
  output?: readonly JobOutputSource[]
  /**
   * Start the work after preflight and synchronously return its hooks. Called
   * once with the job's producer face; a throw leaves nothing registered (the
   * spent ordinal is skipped), and the producer must clean up any partially
   * started resources.
   * @param job - the issued id plus the ring append and progress writers.
   */
  run(job: JobHandle): JobHooks
}
```

```ts type-equiv
/**
 * Producer face of one registered job, handed to {@link JobSpec.run} and
 * valid for the job's whole life. All methods are synchronous. Writes staged
 * inside the starter call are retained and become visible with the
 * registration commit; after settlement — the producer's own outcome, a kill,
 * or a registry-forced teardown end — writes log and drop instead of
 * throwing, so a producer's trailing flush cannot break its own teardown path.
 */
interface JobHandle {
  /** The registry-issued id (`<kind>-N`). */
  readonly id: JobId
  /**
   * Append one chunk to the output ring. Offsets advance by the chunk's UTF-8
   * byte length; an empty chunk is dropped without waking observers.
   * @param text - the chunk text, exactly as produced.
   * @param options - stream label and gap marker.
   */
  append(text: string, options?: JobAppendOptions): void
  /**
   * Replace the live progress line (`3/10`, the current phase). Settlement
   * clears it; the terminal reason travels in {@link JobOutcome.detail}.
   * @param line - the new progress line.
   */
  updateProgress(line: string): void
}
```

`JobHooks.done` wird aufgelöst, nachdem der Produzent seine Ressourcen freigegeben hat, nicht bloß, wenn die Arbeit beendet ist. Ein Job, dessen Ergebnis ein Wert statt eines Streams ist — das gerenderte Ergebnis eines Workflows —, gibt es als `JobOutcome.result` zurück; der erste Lesevorgang des Modells nach dem Abschluss trägt es einmal.

```ts type-equiv
/** Hooks through which the runtime controls and observes producer work. */
interface JobHooks {
  /**
   * Request termination. Must be synchronous, idempotent, and eventually settle
   * {@link done}; throws propagate. The optional reason is forwarded verbatim.
   */
  cancel(reason?: string): void
  /**
   * Resolves after the producer releases its resources, not merely when work
   * finishes. Must not reject; the runtime converts a rejection to `failed`.
   * If teardown cancellation throws, the runtime may force-fail only the
   * registry record without claiming that the work stopped.
   */
  done: Promise<JobOutcome>
}
```

```ts type-equiv
/** Terminal result supplied by a producer through {@link JobHooks.done}. */
interface JobOutcome {
  /** How the job ended: finished (`completed`), cancelled (`killed`), or broke (`failed`). */
  status: 'completed' | 'killed' | 'failed'
  /**
   * Terminal reason rendered into status lines (`exit code: 3`, `max-tokens`).
   * When the job settles `killed` after a {@link JobRegistry.kill} with a
   * reason, the registry appends that reason.
   */
  detail?: string
  /**
   * Return value for jobs whose result is a value rather than a stream (a
   * workflow's rendered result, a subagent's report). The output ring carries
   * the stream; this is handed out once by the model's next {@link JobRegistry.read}.
   */
  result?: string
}
```

Eine Pull-Quelle übergibt der Registry einen nicht konsumierenden Offset-Leser — die `readFrom`-Familie des Subprozesses. Die Registry pumpt jede Quelle in ihrer eigenen Kadenz (`pumpPollMs` auf `dsh-jobs-local`) und leert sie ein letztes Mal, bevor der Abschluss den Ring schließt, sodass Produzenten nichts in `done` einfalten.

```ts type-equiv
/**
 * A pull source the registry pumps into the job's output ring — the subprocess
 * `readFrom` family. The registry owns the cadence and drains every source one
 * last time before settlement closes the ring, so a producer folds nothing
 * into its `done`.
 */
interface JobOutputSource {
  /** Stream label attached to every chunk this source yields. */
  channel?: JobChannel
  /**
   * Read everything captured since `fromByte` without consuming it.
   * @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 first).
   * @returns the delta text, the next offset, the lossy flag, and the spill path the source currently keeps.
   */
  read(fromByte: number): JobSourceRead
}
```

```ts type-equiv
/** One incremental read from a {@link JobOutputSource}. */
interface JobSourceRead {
  /** Text captured since the requested offset (the whole retained tail when lossy). */
  text: string
  /** Whole-stream offset to resume from on the next read. */
  nextOffset: number
  /** True when the requested offset slid out of the source's retained window. */
  lossy: boolean
  /**
   * Host path of a file holding the complete stream, when the source
   * currently keeps an intact one. Reported on every read, so the registry
   * tracks it as source metadata: a later read without it withdraws the file.
   */
  spillPath?: string
}
```

## Der Output-Ring

Jeder Job besitzt einen begrenzten Ring. Pull-Quellen werden hineingepumpt und `JobHandle.append`-Pushes landen vollständig; das Modell konsumiert den Ring über einen von der Registry geführten Cursor (`JobRegistry.read`), beliebig viele Beobachter lesen ihn an absoluten Byte-Offsets (`JobRegistry.readAt`), und keiner stört den anderen. `JobChannel` beschriftet `stdout`, `stderr` und `log`; `log` ist Produzentenerzählung, die nur Beobachter erreicht, niemals den konsumierenden Lesevorgang des Modells. Der Abschluss beendet den Stream und kürzt die Aufbewahrung auf die Cap für abgeschlossene Jobs — der Ring hat keinen eigenen Lifecycle. Die Spill-Datei, die eine Pull-Quelle führt, ist Job-Metadaten (`JobView.output.spillPaths`, bei jedem Pump-Lesevorgang aktualisiert), nicht Metadaten pro Chunk, sodass der Hinweis auf verworfene Ausgabe des Modells sie benennt, nachdem der Ring die Bytes verdrängt hat und selbst nachdem der Gap-Chunk selbst verschwunden ist. Browser erreichen das Roster und den Ring über `job.list` und `job.follow`, die Remote-Streams von [`dsh-api-job-controller`](../../packages/api/job-controller/README.md), deren Frames weiter unten im Abschnitt zu dessen Cordis API aufgelistet sind.

```ts type-equiv
/** One chunk of a job's output ring: absolute offset, text, channel, and loss marker. */
interface JobChunk {
  /** Absolute offset of the chunk's first byte; offsets never move once assigned. */
  readonly at: number
  /** Chunk text exactly as appended (possibly tail-trimmed by retention). */
  readonly text: string
  /** Stream label, when the producer supplied one. */
  readonly channel?: JobChannel
  /** Bytes immediately before this chunk were lost, at the producer or to retention. */
  readonly gapBefore?: true
}
```

```ts type-equiv
/** Result of one non-consuming {@link JobRegistry.readAt}. */
interface JobOutputRead {
  /** Retained chunks overlapping `[from, total)`, in offset order. */
  chunks: readonly JobChunk[]
  /**
   * Offset to resume from — the ring's current `total`. Always a chunk
   * boundary: appends land whole and trimming only advances chunk starts, and
   * consumers concatenate `chunks` under that assumption, so a provider
   * serving partial chunks would silently duplicate text.
   */
  next: number
  /** True when `from` fell below the oldest retained byte, so bytes are missing before `chunks`. */
  lossy: boolean
}
```

## Konsumentenansichten

`JobView` ist die eine Projektion, die jeder Leser konsumiert: die Modell-Tools, das Browser-Roster und der Beobachtungs-Stream. `owner` trägt die Session-Id, die den Zugriff abschirmt; die Registry löst den dahinterstehenden lebenden `Agent` für die Lifecycle-Bereinigung auf und gibt das Objekt niemals heraus. `progress` ist die Live-Zeile des Produzenten und wird beim Abschluss geleert; `detail` ist der terminale Grund, in den ein aufgezeichneter Kill-Grund eingefügt ist.

```ts type-equiv
/**
 * Read-only projection of one job — a fresh object per call, never live
 * registry state. The model tools, the browser roster, and the observation
 * stream all consume this one shape.
 */
interface JobView {
  /** The registry-issued id (`<kind>-N`). */
  readonly id: JobId
  /**
   * The producer kind the job was registered with: a Host-registered
   * `JobKind`, carried as an open string because a browser bundle or a Remote
   * codec sees only the `JobKindMap` merges its own program compiles.
   */
  readonly kind: string
  /** The producer-supplied one-line label. */
  readonly label: string
  /** Owning session; absent for an unowned job, which every caller can see. */
  readonly owner?: SessionId
  /** Producer-owned cap for complete model-facing notices and reads, in UTF-8 bytes. */
  readonly outputLimitBytes?: number
  /** Current lifecycle state. */
  readonly status: JobStatus
  /** The producer's live progress line (`3/10`, the current phase); cleared at settlement. */
  readonly progress?: string
  /** Terminal reason (`exit code: 3`); a recorded kill reason is merged in. */
  readonly detail?: string
  /** Epoch ms when the job was registered. */
  readonly startedAt: number
  /** Epoch ms when the job settled; absent while live. */
  readonly finishedAt?: number
  /**
   * The output ring's absolute coordinates and the complete-stream files
   * behind it. `total` is the offset the next chunk starts at (0 while
   * nothing was written); `earliest` is the oldest retained byte, greater
   * than zero exactly when retention dropped the head. `spillPaths` lists the
   * spill files the job's pull sources currently keep, in source order and
   * deduplicated, and is absent while no source keeps one: it outlives any
   * chunk, so a reader below `earliest` can still name where the bytes went.
   */
  readonly output: { readonly total: number; readonly earliest: number; readonly spillPaths?: readonly string[] }
}
```

`JobRegistry.list`, `get`, `read`, `readAt`, `kill` und `wait` akzeptieren jeweils die `SessionId` des Aufrufers; ihr Fehlen erlaubt nur eigene Jobs, während eine Session auch auf ihre eigenen Jobs zugreifen kann.

```ts type-equiv
/** Output and post-read state returned by the consuming {@link JobRegistry.read}. */
interface JobRead {
  /** Ring chunks appended since the model cursor, in offset order; every channel included. */
  chunks: readonly JobChunk[]
  /** True when the cursor fell below the oldest retained byte, so bytes are missing before `chunks`. */
  lossy: boolean
  /** The producer's {@link JobOutcome.result}, handed out by the first read after settlement only. */
  result?: string
  /** The job's state at read time. */
  job: JobView
}
```

## Events

Die Registry kündigt jeden Commit über einen gefilterten Stream an. Lifecycle-Events tragen die Projektion nach dem Commit, den sie ankündigen; `settled` benennt seine Ursache, damit ein Abschluss-Reporter einen Teardown überspringen kann; `output` trägt nur die Id und das neue Total, sodass Beobachter von ihrem eigenen Cursor aus lesen und die Registry niemals Nutzlasten pusht.

```ts type-equiv
/**
 * One lifecycle or output event. Lifecycle events carry the job's projection
 * after the commit they announce; `output` carries only the id and the new
 * total, so an observer schedules a {@link JobRegistry.readAt} from its own
 * cursor and the registry never pushes payloads.
 */
type JobEvent =
  | {
    /** Registration commit, progress line change, stopping transition, or removal from the visible set. */
    readonly type: 'registered' | 'progress' | 'stopping' | 'removed'
    readonly job: JobView
  }
  | {
    readonly type: 'settled'
    readonly job: JobView
    readonly cause: JobSettleCause
    /**
     * Whether this settlement released a live {@link JobRegistry.wait}. That
     * waiter's caller receives the terminal projection as its own result, so
     * a completion reporter treats an awaited settlement as already delivered
     * and reports only the unawaited ones. A wait that timed out or was
     * aborted before the settlement does not count.
     */
    readonly awaited: boolean
  }
  | {
    readonly type: 'output'
    readonly id: JobId
    /** Owning session, absent for an unowned job. */
    readonly owner?: SessionId
    /** The ring's total after the append (or at settlement, which ends the stream). */
    readonly total: number
  }
```

```ts type-equiv
/**
 * Who a subscription hears about. `{ owner }` delivers that session's jobs
 * plus every unowned job (the set that session can see). `{ owners: 'scope' }`
 * delivers the owners composed under the subscribing context — one registry
 * serves every composition in the process, and a mount under one preset must
 * not hear another preset's agents. `{ owners: 'all' }` delivers everything.
 */
type JobEventFilter =
  | { readonly owner: SessionId }
  | { readonly owners: 'all' | 'scope' }
```

## Dienstverhalten

Die abstrakte Service Definition [`JobRegistry`](../../packages/jobs/jobs/src/index.ts) spezifiziert atomares `start`, aufruferbezogenes `list`, `get`, konsumierendes `read`, nicht konsumierendes `readAt`, `kill` und begrenztes `wait`, den gefilterten `events`-Stream und `attachController`; [`LocalJobRegistry`](../../packages/jobs/jobs-local/src/index.ts) ist der prozesslokale Service Provider. Die Autorisierung vergleicht Eigentümer-Sessions; Eigentümer-Bereinigung und Zulassung nutzen den lebenden `Agent`, der unter der Eigentümer-Session registriert ist, wenn der Job startet. Die Konfiguration `maxConcurrentJobsPerOwner` des lokalen Providers (positive safe integer) hat den Standardwert `10` und zählt `running`- plus `stopping`-Einträge pro exaktem Eigentümer, mit einem gemeinsamen Bucket für Jobs ohne Eigentümer; der terminale Produzentenabschluss gibt Kapazität frei; `retainBytes` (Standard 262144) und `settledRetainBytes` (Standard 16384) begrenzen die Live- und Abschluss-Aufbewahrung jedes Rings, und `pumpPollMs` (Standard 150) ist die Pull-Kadenz. Siehe [`dsh-jobs`](../../packages/jobs/jobs/README.md) für den Vertrag der Service Definition, [`dsh-jobs-local`](../../packages/jobs/jobs-local/README.md) für den Registry-Lifecycle und die Zulassungsrichtlinie und [`dsh-tool-jobs`](../../packages/jobs/tool-jobs/README.md) für den modellzugewandten Consumer.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generiert aus dem Quellcode durch `scripts/gen-cordis-catalog.ts` (per `pnpm run verify-cordis-catalog` in doc-sync auf Aktualität geprüft; Neugenerierung mit `pnpm run gen-cordis-catalog`) — die Sprachseiten unterscheiden sich nur in lokalspezifischen gepaarten Dokumentpfaden. Signaturblöcke verwenden einen `ts cordis-catalog`-Fence und behalten das ursprüngliche Quell-JSDoc; Dispatch-Modi sind im [primer](../cordis-primer.md#dispatch-modes) definiert, und die vom Framework geerbte `ctx`-API liegt in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxjobcontroller--jobcontroller"></a>

### `ctx.jobController` — `JobController`

Host-Dienst, der den generierten `ctx.remote.job`-Namensraum stützt.

```ts cordis-catalog
/**
 * Stream the jobs one session can see — its own plus every unowned job —
 * as whole-set frames: one on open, then one after each coalesced burst of
 * lifecycle commits. The stream has no natural end; the carrier closes it.
 * @param request - the session whose visible set to mirror.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns the roster frames.
 */
@Remote({ mode: 'stream' }) list(request: JobListRequest, signal: AbortSignal): AsyncIterable<JobListFrame>

/**
 * Stream one job's retained output from an absolute byte offset, then its
 * terminal projection once settled and drained. Non-consuming: the
 * model-facing cursor and notice state never observe these reads. The
 * request's session is the fenced read's caller; the registry rejects a
 * job the session cannot see and an unknown job.
 * @param request - target job, owning session, and optional resume offset.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns anchor, coalesced output frames, and the terminal status.
 */
@Remote({ mode: 'stream' }) follow(request: JobFollowRequest, signal: AbortSignal): AsyncIterable<JobFollowFrame>

/**
 * Kill one background job on a human's behalf. The request's session is
 * the fenced read's caller, so the job must be one that session can see:
 * the registry's owner fence is the only access rule, and a child session's
 * own jobs are killable from its list like any other. The kill records
 * `cancelled by the user` as its reason; it is not one the model requested,
 * so the owning agent still receives the completion notice, and a shell
 * tool waiting on that job reads the reason in its own result.
 * @param request - Session whose job list carries the job, and the job id.
 * @returns the registry's admission of the kill request.
 */
@Remote('kill') kill(request: JobKillRequest): JobKillValue
```

Quelle: [`packages/api/job-controller/src/index.ts`](../../packages/api/job-controller/src/index.ts)

<a id="ctxjobs--jobregistry-abstract-seam"></a>

### `ctx.jobs` — `JobRegistry` (abstrakter Seam)

Abstrakte Registry für Hintergrund-Jobs. Ableiten, die abstrakten Member implementieren und die Subklasse als Plugin laden — sie registriert sich als `ctx.jobs` (eine Implementierung pro Kontext; das Laden einer zweiten wirft, was das Standardverhalten von cordis bei doppeltem Dienst ist).

Implementierungen müssen diese Semantik einhalten:

- Registrierungen überleben Produzenten- und Controller-Fasern. Eigentümer- und Dienst-Entsorgung brechen laufende Arbeit ab und warten auf konforme Produzenten; ein werfendes Teardown-Cancel lässt nur den Eintrag zwangsweise fehlschlagen. Solche Abschlüsse kündigen `cause: 'teardown'` an, weil ein Job, dessen Eigentümer zerstört wird, keinen Leser mehr hat.
- Der Zugriff auf Jobs mit Eigentümer ist durch die Session-Id des Eigentümers abgeschirmt. Ids sind vorhersagbar, daher ist die Autorisierung — nicht die Geheimhaltung — die Grenze.
- Der Abschluss folgt dem First-Wins-Prinzip: ein terminaler Eintrag, freigegebene Wartende, dann eine Runde eingedämmter Event-Zustellung, auch gegenüber einem verspäteten Produzentenergebnis. Das `settled`-Event folgt jedem freigegebenen Wartenden und berichtet, ob es einen freigegeben hat (`awaited`), damit ein Abschluss-Reporter Abschlüsse überspringen kann, die ein wartender Aufrufer bereits eingesammelt hat.
- Ein abgeschlossener Eintrag bleibt gelistet bis zur Entsorgung seines Eigentümers, zur Dienst-Entsorgung oder bis zu einem expliziten Entfernen durch einen Aufrufer, der den terminalen Zustand selbst eingesammelt und die Id nie herausgegeben hat.
- start verweigert Arbeit, solange kein angehängter Job-Controller den Eigentümer der Spec bedient, sodass ein Produzent keine Arbeit starten kann, die jener Eigentümer nicht einsammeln oder stoppen kann. Eine Registry bedient jede Komposition im Prozess, daher ist diese Frage — und die Event-Zustellung unter `{ owners: 'scope' }` — eigentümerrelativ statt prozessweit: Registrierungen aus einem ungescopten Kontext bedienen jeden Eigentümer, und Registrierungen unter dem Scope einer Agent-Komposition bedienen genau die darunter komponierten Agents.
- Jeder Job besitzt einen Output-Ring. Von der Spec benannte Pull-Quellen werden von der Registry gepumpt und vor dem Abschluss ein letztes Mal geleert; gepushte Appends landen vollständig. Der konsumierende Cursor des Modells und die absoluten Offsets der Beobachter lesen dieselben Bytes und stören einander nie.
- Die Ring-Aufbewahrung ist begrenzt. Appends über die Live-Cap hinaus verwerfen die ältesten aufbewahrten Bytes; ein Leser unterhalb des aufbewahrten Fensters erhält einen verlustbehafteten Lesevorgang, nie einen Fehler. Der Abschluss kürzt die Aufbewahrung auf die Abschluss-Cap und beendet den Stream; der Ring hat keinen eigenen Lifecycle.

```ts cordis-catalog
/**
 * Preflight access, validation, owner cleanup, and implementation-owned
 * admission before starting and atomically registering work. Any preflight
 * rejection leaves no job id or execution resource. A throwing starter
 * leaves nothing registered; after it returns, registration cannot fail.
 * @param spec - job identity, owner, output sources, and synchronous starter.
 * @returns the registry-issued `<kind>-N` id.
 */
abstract start(spec: JobSpec): JobId

/**
 * List caller-owned and unowned jobs in registration order.
 * @param caller - reading session; omission sees only unowned jobs.
 * @returns fresh projections.
 */
abstract list(caller?: SessionId): JobView[]

/**
 * Project one job without changing its cursor. Throws for an unknown or
 * foreign job.
 * @param id - job to look up.
 * @param caller - reading session checked against the owner.
 * @returns a fresh projection.
 */
abstract get(id: JobId, caller?: SessionId): JobView

/**
 * Consume the ring from the model cursor and advance it to the current
 * total. After settlement the first read also carries the producer's
 * result. Throws for an unknown or foreign job.
 * @param id - job to read.
 * @param caller - reading session checked against the owner.
 * @returns the chunks since the cursor, the lossy flag, the result once, and the post-read projection.
 */
abstract read(id: JobId, caller?: SessionId): JobRead

/**
 * Read retained ring output without moving the model cursor. Resume with
 * a previous read's `next`; an offset inside a retained chunk returns the
 * whole chunk (its `at` may precede `from`). Throws for a negative or
 * non-integer offset, or an unknown or foreign job.
 * @param id - job to read.
 * @param from - absolute byte offset to read from (0 for the retained head).
 * @param caller - reading session checked against the owner.
 * @returns retained chunks overlapping `[from, total)`, the resume offset, and the lossy flag.
 */
abstract readAt(id: JobId, from: number, caller?: SessionId): JobOutputRead

/**
 * Request cancellation, then mark the job stopping. A producer throw
 * propagates without changing job state. A supplied reason is merged into
 * terminal `detail` when the job settles `killed`. Throws for an unknown
 * or foreign job.
 * @param id - job to cancel.
 * @param caller - killing session checked against the owner.
 * @param reason - cancellation reason forwarded verbatim to the producer.
 * @returns `requested` for live work, otherwise `already-finished`.
 */
abstract kill(id: JobId, caller?: SessionId, reason?: string): 'requested' | 'already-finished'

/**
 * Wait for settlement or timeout without cancelling the job. Caller abort
 * rejects only while the job is live; after settlement the terminal
 * projection wins. Rejects for an invalid timeout or an unknown or foreign
 * job.
 * @param id - job to wait for.
 * @param timeoutMs - positive finite wait bound in milliseconds.
 * @param caller - waiting session checked against the owner.
 * @param signal - optional cancellation of the wait itself.
 * @returns projection at settlement or timeout.
 */
abstract wait(id: JobId, timeoutMs: number, caller?: SessionId, signal?: AbortSignal): Promise<JobView>

/**
 * Drop one settled job's record from the visible set and announce
 * `removed`. For a caller that collected the terminal state through its own
 * {@link wait} and never handed the id to the model, such as a shell tool's
 * foreground call. Throws for a job that is still live, unknown, or foreign.
 * @param id - settled job to drop.
 * @param caller - removing session checked against the owner.
 */
abstract remove(id: JobId, caller?: SessionId): void

/**
 * Attach an effect-scoped controller that can read and stop jobs. It serves the
 * owners its registering context's scope covers, and {@link start} refuses an
 * owner no attached controller serves.
 * @param name - diagnostic label; duplicate names remain independent.
 * @returns disposer that detaches this controller.
 */
abstract attachController(name: string): () => void
```

Types: [SessionId](core.md)

Quelle: [`packages/jobs/jobs/src/index.ts`](../../packages/jobs/jobs/src/index.ts)
<!-- END GENERATED cordis-surface -->
