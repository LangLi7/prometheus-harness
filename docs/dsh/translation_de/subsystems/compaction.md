# Compaction

English | [中文](compaction.zh.md)

Die Compaction-Naht — eine [Capability-Naht](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md), aufgeteilt wie bash: Service Definition ([dsh-compaction](../../packages/compaction/compaction), `ctx.compaction`), Service Provider (ein Backend wie [dsh-compaction-basic](../../packages/compaction/compaction-basic)) und menschlicher Consumer ([dsh-command-compact](../../packages/compaction/command-compact)). Compaction ist **eine optionale Fähigkeit**, nicht Teil des Agent-Loop-Rückgrats — deshalb lebt ihr Vokabular hier und nicht in [core.md](core.md). Ein tokenizer- oder templatebasiertes Backend ist ein Geschwisterpaket, das dieselbe Schnittstelle implementiert. Anders als bei bash hängt die Schnittstelle notwendigerweise von `dsh-session` und `dsh-llm` ab: ihre Verben wirken auf eine agent-eigene `Session`, und ihr dauerhaftes Summary-Event verwendet das `ContentBlock`-Vokabular (siehe die [Referenz zur Compaction-Capability-Naht](../../packages/compaction/compaction/README.md)).

Source: [`packages/compaction/compaction/src/types.ts`](../../packages/compaction/compaction/src/types.ts)

## Die `compaction/*`-Session-Events

Compaction erweitert [`SessionEventMap`](session.md) per Declaration Merging um drei Event-Typen. Alle drei sind **nur protokolliert** — sie zeichnen Lock, Summary, gewählten Bereich, überschattete Event-Seqs, Token-Anzahl und Modellaufruf auf, ohne in die Surface einzutreten. `SurfaceEventType` wird bewusst NICHT erweitert (nur nachrichtenerzeugende Events erreichen das Modell), sodass die Summary selbst auf einer separaten `user/message` mit `surfaceOp: { op: 'replace', startSeq, endSeq }` reitet — die einzige Surface-Mutation, die die Summary-Compaction vornimmt. Die [historische Agent Note](../../.agents/notes/archived/feature/2026-06-18-compaction-capability-seam.md) hält die Begründung für die Wiederverwendung von `user/message` fest.

| Event | Payload | Rolle |
|---|---|---|
| `compaction/start` | `{ turn }` | erwirbt das im Log aufgezeichnete Lock; eine Zahl identifiziert den offenen automatischen Turn, während `null` einen eigenständigen manuellen Versuch identifiziert |
| `compaction/summary` | `{ summary, rawOutput?, llmStreamCall?, shadowedRange, shadowedSeqs, shadowedTokenCount, provider, model, maxTokens?, usage? }` | die sichere Summary-Projektion, optionale vollständige Provider-Ausgabe und Nutzung, ein Marker `llmStreamCall: true`, wenn die Erzeugung des Ergebnisses genau einen Aufruf über `ctx.llm.stream()` dieses Kontexts konsumierte (was vollständiges `rawOutput` erfordert), das überschattete Surface-Grenzpaar (`start`/`end`-Seqs — eine Positionsspanne, kein numerisches Intervall), die überschatteten Seqs in Surface-Reihenfolge, die geschätzte Token-Anzahl und die Envelope des Summarize-Aufrufs (`provider`, `model`, plus ihr Generierungslimit, wenn eines galt) — protokolliert, damit die Einmalanfrage aus Log + Code rekonstruierbar ist (die Rekonstruierbarkeits-Agent-Note); unmarkiertes `rawOutput` identifiziert den Aufrufpfad nicht |
| `compaction/end` | `{ turn, error? }` | gibt das Lock mit demselben numerischen oder null-wertigen Owner frei (`error` zeichnet einen erfolglosen Versuch auf) |

Das Lock umschließt die **gesamte** Operation: zuerst wird `compaction/start` angehängt, dann landen Summarisierung, der `compaction/summary`-Record und die `user/message`-Ersetzung, und erst danach `compaction/end`. Die Freigabe des Locks zuletzt macht einen Absturz mitten in der Operation zu einem erkennbaren verwaisten Lock (ein `compaction/start` ohne passendes `compaction/end`) statt zu einem `compaction/end`, das fälschlich behauptet, die Compaction sei abgeschlossen.

Die Marker sind Lock-Zeitpunkte, kein exklusiver Container. Eine unabhängige Idle-Injektion kann zwischen einem eigenständigen manuellen Start und Ende erscheinen, während die Summarisierung aussteht. Der manuelle Pfad revalidiert nur seine gewählte positionale Spanne, sodass dieser injizierte Kontext nach dem Ersetzungs-Checkpoint überlebt. Ein laufender unpassender Start blockiert jeden Einstiegspunkt; ein unpassender Start vor einem neueren `session/end-seed` ist veralteter Nachweis aus einem früheren Lebenszyklus und wird ignoriert.

Diese Varianten werden innerhalb eines `declare module '@deepseek-ai/dsh-session/types'`-Blocks zusammengeführt, sodass sie — anders als die Top-Level-Typen auf den anderen Subsystem-Seiten — nicht als drift-geprüfter ` ```ts type-equiv `-Block eingefügt sind (der `verify-type-equiv`-Extraktor gleicht nur Top-Level-Deklarationen nach Namen ab). Die Payload-Tabelle oben ist der Katalogeintrag; für die autoritativen Felder dem Source-Link folgen.

<a id="image-offload"></a>
## Image Offload

`compaction-image-offload` besitzt die Deklaration `image/offload` und ihre reine Nachrichtenprojektion. Jedes Ziel identifiziert einen aktuellen Eingabeknoten und exakte tiefensuchende Bildvorkommen. Das Event bewahrt Knoten- und Nachrichtenidentitäten und trägt kein `surfaceOp`. Das [Paket-README](../../packages/compaction/compaction-image-offload/README.md) besitzt Wiederherstellungs-Policy, Registrierung und abgelöstes Replay.

```ts type-equiv
/** Exact input-image occurrences selected by one durable offload decision. */
interface ImageOffloadTarget {
  /** Current message-producing event containing these occurrences. */
  seq: SessionSeq
  /** Zero-based depth-first image indexes within the immutable message. */
  imageIndexes: number[]
}
```

## `CompactionResult`

Was eine erfolgreiche Compaction an ihren Aufrufer zurückgibt: die Seqs der Buchhaltungs-Events, die sichere Summary-Projektion, den überschatteten Bereich und die überschatteten Seqs sowie die geschätzte Token-Anzahl.

```ts type-equiv
/** Result of a successful compaction operation. */
interface CompactionResult {
  /** Stable identity shared by this compaction's complete durable lifecycle. */
  compactionId: CompactionId
  /** Human command that initiated this compaction, when it was manual. */
  sourceCommandId?: CommandId
  /** The seq of the appended `compaction/start` event. */
  startSeq: SessionSeq
  /** The seq of the appended `compaction/summary` event. */
  summarySeq: SessionSeq
  /** The seq of the appended `compaction/end` event. */
  endSeq: SessionSeq
  /** The summary content blocks produced by the backend. */
  summary: ContentBlock[]
  /**
   * The surface-boundary pair that was shadowed: the seqs of the first
   * (`start`) and last (`end`) surface nodes of the replaced range. A
   * surface-POSITION span, not a numeric seq interval — after a prior replace
   * lands a fresh high-seq summary node at an older range's position, `start`
   * can be GREATER than `end`. {@link CompactionResult.shadowedSeqs} is the
   * authoritative set of shadowed nodes, in surface order.
   */
  shadowedRange: { start: SessionSeq; end: SessionSeq }
  /** The seqs of all shadowed surface nodes, in surface order. */
  shadowedSeqs: SessionSeq[]
  /** Estimated token count of the shadowed content. */
  shadowedTokenCount: number
}
```

## Der Service

Automatische Aufrufer geben an, warum die Policy läuft; Implementierungen dürfen bestätigten Überlauf aggressiver behandeln als gewöhnlichen Druck.

```ts type-equiv
/** Why automatic policy is asking a backend to consider compaction. */
type CompactionTrigger = 'pressure' | 'context-overflow'
```

`CompactionEngine` legt `compactIfNeeded(agent, trigger, signal)` für die automatische `pressure`- oder `context-overflow`-Policy offen, `compactNow(agent, signal)` für eine nützliche Verringerung einer Idle-Session auch unterhalb von Druck sowie `compactRegion(...)` für einen expliziten inklusiven Surface-Bereich. `compactNow()` läuft als Agent-Wartung zwischen Turns, gibt `null` ohne Schreiben zurück, wenn kein nützlicher Bereich existiert, zeichnet vor der Summarisierung eine eigenständige Klammer mit `turn: null` auf und flusht einen abgeschlossenen Versuch, bevor spätere eingereihte Prompts aus der neuen Surface abgeleitet werden dürfen. Jedes Backend erzeugt seine ersetzende `user/message`-Quelle mit `compactCheckpointSource(compactionId, sourceCommandId?)`; Client- und Wire-Consumer importieren diesen Konstruktor, `CompactionCheckpointSource` und `isCompactCheckpointSource()` aus dem cordis-freien Subpfad `@deepseek-ai/dsh-compaction/checkpoint`, während das Paket-Root sie für Host-Consumer re-exportiert. Die erforderliche Transaktionsidentität korreliert den Ersetzungs-Checkpoint, während das Prädikat die Erkennung unabhängig von einem einzelnen Backend hält. Implementierungen müssen das übergebene Signal an die Summarisierung weiterreichen. Die Naht besitzt keine Preising-API: das Singleton [`ctx.tokenMeter`](token-meter.md) besitzt Schätzung und Replay direkt, während `dsh-compaction-basic` Retention, Event-Sequenzierung, geroutete Summarize-Aufrufe und deren Konfiguration besitzt.

Erwartete manuelle Fehler verwenden `ManualCompactionErrorCode`:

```ts type-equiv
/** Expected failure classes for an explicit idle-session compaction request. */
type ManualCompactionErrorCode =
  | 'busy'
  | 'cancelled'
  | 'changed'
  | 'summary'
  | 'commit'
  | 'persistence'
```

`changed` und `summary` schließen den fehlgeschlagenen Versuch und persistieren ihn ohne Summary-Ersetzung; Bildauslassungen, die während der Wiederherstellung aufgezeichnet wurden, bleiben wirksam. `commit` kann einer teilweisen Mutation folgen; `persistence` bedeutet, dass die In-Memory-Klammer geschlossen wurde, ihr Flush aber fehlschlug. Die Stornierung bleibt getrennt und wirft nach der erforderlichen Bereinigung den exakten Abbruchgrund.

Pressure-Compaction läuft im `agent/pre-step`-Waterfall vor der Request-Ableitung. Sobald Druck oder kanonischer Überlauf qualifiziert, ruft compaction-basic vor der Bereichsauswahl den optionalen [`ctx.toolResultPruner`](../../packages/compaction/compaction-tool-result-pruner/README.md) auf, misst über `ctx.tokenMeter` neu und kann die Surface ohne Summary voranbringen. Die Wiederherstellung nach fehlgeschlagener Anfrage läuft über `agent/request-error`, nachdem der fehlgeschlagene Step schließt, und gibt nur dann eine Retry-Aktion zurück, wenn die Generierung der Surface-Ersetzung voranschreitet, selbst wenn spätere Summary-Arbeit nach dem Pruning wirft; die Stornierung gewinnt weiterhin. Bereichsgrenzen bewahren die Paarung von Tool-Aufruf und Ergebnis, aber nicht ganze Turns, sodass frühe geschlossene Steps eines überdimensionierten Turns kompaktiert werden können. `dsh-compaction-basic` besitzt Schwellen, die Policy für den beibehaltenen Schwanz, Überlaufobergrenzen und Fehlerbehandlung.

Die Service Definition exportiert `toolPairingBalancedBefore(session, seq)` und `toolPairingBalancedAfter(session, seq)` für die Prüfungen der Tool-Aufruf-/Ergebnis-Paarung vor und nach einer Seq. Beide validieren die aktuelle Surface-Mitgliedschaft und weisen fehlende Seqs und verwaiste Ergebnisse zurück; der [Paketvertrag](../../packages/compaction/compaction/README.md#tool-pairing-boundaries) definiert ihr Cache-Verhalten.

## Ergebnisse des Tool-Ergebnis-Prunings

Der optionale Service für Tool-Ergebnis-Pruning meldet jede dauerhafte Inhaltsersetzung und die aggregierte Verringerung an Unicode-Codepunkten. Seine öffentlichen Ergebnistypen liegen in [`compaction-tool-result-pruner/src/types.ts`](../../packages/compaction/compaction-tool-result-pruner/src/types.ts).

```ts type-equiv
/** Cited source event and size accounting for one landed surface replacement. */
interface PrunedEntry {
  /** Full-fidelity tool-result event shadowed by the replacement. */
  readonly originalSeq: SessionSeq
  /** Newly appended pruned tool-result event. */
  readonly replacementSeq: SessionSeq
  /** Tool call shared by the original and replacement. */
  readonly callId: ToolCallId
  /** Original text size in Unicode code points. */
  readonly charsBefore: number
  /** Replacement text size in Unicode code points. */
  readonly charsAfter: number
}
```

```ts type-equiv
/** Aggregate outcome of one stable-surface pruning pass. */
interface PruneResult {
  /** Replacements in the snapshotted surface order. */
  readonly pruned: readonly PrunedEntry[]
  /** Total Unicode code points removed across replacements. */
  readonly charsRemoved: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcompaction--compactionengine-abstract-seam"></a>

### `ctx.compaction` — `CompactionEngine` (abstract seam)

Abstrakter Compaction-Service. Implementierungen besitzen Trigger-Policy, Retention und Summarisierung und dürfen einen separaten Messservice konsumieren. Ein erfolgreicher Lauf ersetzt die gewählte Surface-Spanne durch einen Summary-Knoten und verhindert gleichzeitige Compaction derselben Session. Die ersetzende Nutzernachricht verwendet compactCheckpointSource mit der Transaktionsidentität, damit Consumer sie unabhängig vom Backend erkennen und korrelieren können. Eine Implementierung pro Kontext als `ctx.compaction` laden.

```ts cordis-catalog
/**
 * Consider automatic compaction for one explicit trigger. Pressure policy
 * uses the latest durable routed request, while context-overflow policy may
 * force a useful balanced reduction even below the normal threshold. Return
 * `null` when no safe range can be compacted. A single oversized retained
 * unit or request envelope cannot be repaired through surface compaction.
 *
 * @param agent - agent context owning the session surface and routing options.
 * @param trigger - normal pressure or provider-confirmed context overflow.
 * @param signal - cancellation signal; model-backed implementations must forward it.
 * @returns the compaction result, or `null` if no compaction was needed.
 */
abstract compactIfNeeded( agent: CompactionAgentContext, trigger: CompactionTrigger, signal: AbortSignal, ): Promise<CompactionResult | null>

/**
 * Explicitly compact useful history even below automatic pressure thresholds.
 * Implementations synchronously start an idle task before any asynchronous
 * work, select a useful range without writing on a no-op, then
 * append a standalone `compaction/start` before summarization. That durable
 * marker is the compaction lock until one `compaction/end` attempt. Later waking
 * prompts remain accepted in FIFO order and start only after the optional
 * durability checkpoint and idle-task settlement. Context injected while the
 * summary runs may sit between the marker pair; only the selected span must
 * remain stable.
 *
 * @param agent - idle agent whose durable history should be compacted.
 * @param signal - cancellation scoped to this compaction request.
 * @param sourceCommandId - initiating command identity for a manual compaction.
 * @returns the compaction result, or `null` when no safe useful range exists.
 * @throws {@link ManualCompactionError} for expected busy, agent-cancellation,
 * changed-span, summarization/shrink, commit-stage, or persistence failures;
 * an aborted request preserves its exact abort reason. Failed attempts remain
 * visible in the log.
 */
abstract compactNow( agent: ManualCompactAgentContext, signal: AbortSignal, sourceCommandId?: CommandId, ): Promise<CompactionResult | null>

/**
 * Forcibly compact a range of surface nodes into a single summary node.
 * `start` and `end` name an inclusive span by surface position, not numeric seq
 * order; replacements can make visible seqs non-monotonic. Both edges must be
 * balanced so assistant tool calls remain paired with their results. A model-
 * backed implementation forwards cancellation and rejects active, missing,
 * reversed, or unbalanced ranges. The target session is `agent.session`.
 * Its replacement user message must use {@link compactCheckpointSource} with
 * the transaction's `CompactionId`.
 * Use {@link toolPairingBalancedBefore} and {@link toolPairingBalancedAfter}
 * for the edge checks.
 *
 * @param start - first surface seq, inclusive.
 * @param end - last surface seq, inclusive.
 * @param agent - context whose session is mutated and whose routing options guide summarization.
 * @param signal - optional cancellation; model-backed implementations must forward it.
 * @throws when compaction is active or the range is missing, reversed, or unbalanced.
 * @returns the appended event seqs, summary, replaced range, and token accounting.
 */
abstract compactRegion( start: SessionSeq, end: SessionSeq, agent: CompactionAgentContext, signal?: AbortSignal, ): Promise<CompactionResult>
```

Types: [CommandId](commands.md) · [SessionSeq](session.md)

Source: [`packages/compaction/compaction/src/index.ts`](../../packages/compaction/compaction/src/index.ts)

<a id="ctxtoolresultpruner--toolresultpruner"></a>

### `ctx.toolResultPruner` — `ToolResultPruner`

Deterministisches Head/Middle/Tail-Pruning für aktuelle Tool-Ergebnis-Surface-Knoten.

```ts cordis-catalog
/**
 * Measure text content in Unicode code points; non-text blocks cost zero.
 * @param blocks - tool-result content to measure.
 * @returns total Unicode code points across text blocks.
 */
measureContent(blocks: readonly ContentBlock[]): number

/**
 * Replace an over-budget text middle while retaining rich-block order.
 * Text slicing is by Unicode code point, not UTF-16 code unit, so a retained
 * boundary cannot split a surrogate pair. Grapheme clusters may still split.
 * @param blocks - original tool-result content.
 * @returns pruned content, or `null` when the text is within budget.
 */
pruneContent(blocks: readonly ContentBlock[]): ContentBlock[] | null

/**
 * Prune every over-budget tool result from one stable current-surface snapshot.
 * Each replacement preserves the complete event data except for `content`,
 * cites the shadowed node so replay can recover the replacement input, and is
 * immediately preceded by a `compaction/prune` shadow-price event pricing the
 * shadowed node through the injected token meter, so pure consumers can
 * subtract it without per-node state.
 * @param session - session whose current surface is rewritten.
 * @returns landed replacements and aggregate Unicode-code-point savings.
 * @throws when the session rejects a replacement; replacements committed
 * earlier in the pass remain durable.
 */
pruneSession(session: Session): PruneResult
```

Types: [ContentBlock](llm-streaming.md) · [Session](session.md)

Source: [`packages/compaction/compaction-tool-result-pruner/src/index.ts`](../../packages/compaction/compaction-tool-result-pruner/src/index.ts)

<a id="compaction-events"></a>

### `compaction/*` events

<a id="compactionsummary-error--waterfall"></a>

#### `compaction/summary-error` — waterfall

Eine fehlgeschlagene Summary-Anfrage wiederherstellen, indem synchron eine dauerhafte Änderung an ihrer gewählten Eingabe aufgezeichnet wird. Nur nach Fortschritt true zurückgeben; der Provider leitet die Auswahl erneut ab und bepreist sie neu, bevor er es wiederholt. `next()` aufrufen, wenn der Fehler nicht wiederhergestellt werden kann. Entscheidungen überleben einen späteren Summary-Fehler oder eine Stornierung.

```ts cordis-catalog
/**
 * Recover a failed summary request by synchronously recording a durable
 * change to its selected input. Return true only after making progress;
 * the provider re-derives and re-prices the selection before retrying.
 * Call next() when the failure cannot be recovered. Decisions survive a
 * later summary failure or cancellation.
 * @param payload.session - session containing the selected input.
 * @param payload.sourceEventSeqs - selected message events in request order.
 * @param payload.error - failure thrown by the summarizer.
 * @param payload.signal - optional compaction cancellation signal.
 * @param next - delegate to the next recovery listener.
 * @mode waterfall
 */
'compaction/summary-error'(payload: { session: Session; sourceEventSeqs: readonly SessionSeq[]; error: unknown; signal?: AbortSignal }, next: () => boolean): boolean
```

Types: [Session](session.md) · [SessionSeq](session.md)

Source: [`packages/compaction/compaction/src/index.ts`](../../packages/compaction/compaction/src/index.ts)
<!-- END GENERATED cordis-surface -->
