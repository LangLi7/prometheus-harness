# Session references

[English](session-reference.md) | 中文

Host-backed file discovery, plus structured cross-session reference requests and prepared message context. The [file-reference contract](../../packages/context/file-reference) owns path-only completion records and syntax; the [session-reference contract](../../packages/context/session-reference) defines the canonical URI, the current surface projection, label-safe JSON and byte retention, stable errors, and the untrusted model prompt. Host adapters use these types instead of passing their own UI mention syntax into the agent core.

Sources: [`packages/context/file-reference/src/types.ts`](../../packages/context/file-reference/src/types.ts) · [`packages/context/session-reference/src/types.ts`](../../packages/context/session-reference/src/types.ts)

## File candidates

`FileReferenceCandidate` is a path-only discovery result. The addressed agent supplies the working-directory scope; the provider owns ranking and namespace access but never reads file contents.

```ts type-equiv
/** One path-only completion candidate inside the target session cwd. */
interface FileReferenceCandidate {
  /** User-facing path accepted by normal prompts and filesystem tools. */
  path: string
  /** Directories keep completion open; files finish the mention. */
  kind: 'file' | 'directory'
}
```

## Inputs and candidates

`SessionReferenceInput` is the host-independent selection. The id is authoritative; the label is display metadata carried along with the snapshot.

```ts type-equiv
/** One source session selected by a host. */
interface SessionReferenceInput {
  /** Opaque source session identity. */
  sessionId: SessionId
  /** Optional user-facing mention label. */
  label?: string
}
```

`SessionReferenceCandidate` is the host-facing discovery output. When a latest Session title exists, its `label` uses that title; the optional display text instead prefers a subagent's durable creation label. Filtering searches both, plus Session id and cwd, and never the transcript. A Remote candidate uses `displayTitle`, when present, to mark the canonical mention.

```ts type-equiv
/** One host-facing candidate from exact session metadata. */
interface SessionReferenceCandidate {
  /** Opaque source session identity. */
  sessionId: SessionId
  /** Latest log-backed title, falling back to the opaque session id. */
  label: string
  /** Display and canonical-mention text, preferring a subagent's durable creation label over {@link label}. */
  displayTitle?: string
  /** Source session working directory, when recorded. */
  cwd?: string
  /**
   * True when {@link SessionReferenceCandidate.cwd} is recorded and equals the
   * requesting agent's. Hosts that only surface a distinguishing location
   * read this instead of comparing paths they never received.
   */
  sameWorkspace: boolean
  /** Source session creation time in Unix epoch milliseconds. */
  createdAt: number
}
```

The `sessionReferenceResolver/candidates` Remote method exposes the same discovery capability to browser consumers and attaches the canonical prompt mention to every candidate.

```ts type-equiv
/** One discovery candidate carrying its canonical prompt mention. */
interface SessionReferenceMentionCandidate extends SessionReferenceCandidate {
  /** Canonical `@[label](dsh-session:…)` mention serialized into the prompt draft. */
  mention: string
}
```

## Prepared messages

Preparation keeps the readable current message content and returns at most one aggregated context. Its durable source record keeps `capturedThroughSeq` as a coordinate in the referenced Session's original generation and never reinterprets it as a seq of the containing Session. `capturedFormatVersion` records that generation; absence means the released format v0.

```ts type-equiv
/** Durable source session, cited event seqs, and snapshot facts for prepared cross-session context. */
interface SessionReferenceSource {
  kind: 'session-reference'
  /** Material lifted out of another session's log (`recall` context form). */
  form: 'recall'
  version: 1
  references: {
    sessionId: string
    label: string
    /** Source Session format generation; absence identifies version 0. */
    capturedFormatVersion?: number
    capturedThroughSeq: OptionalSessionSeq
    compacted: boolean
    originalMessages: number
    retainedMessages: number
    omittedMessages: number
    omittedBytes: number
    truncated: boolean
    inputIndex: number
  }[]
}
```

```ts type-equiv
/** Direct message content and optional referenced-session context. */
interface PreparedReferencedMessage {
  /** Readable message content after host mention tokens are removed. */
  content: ContentBlock[]
  /** Aggregated untrusted snapshot, absent when the message has no references. */
  additionalContext?: UserMessage
}
```

## Errors

`SessionReferenceError.code` distinguishes invalid configuration or input, self-reference, count limits, source read failure, budget failure, and cancellation. Host protocols map these codes onto their own error wrappers without inspecting prompt bytes.

```ts type-equiv
/** Stable failure codes exposed to host adapters. */
type SessionReferenceErrorCode =
  | 'SESSION_REFERENCE_INVALID_CONFIG'
  | 'SESSION_REFERENCE_INVALID_REFERENCE'
  | 'SESSION_REFERENCE_SELF_REFERENCE'
  | 'SESSION_REFERENCE_TOO_MANY'
  | 'SESSION_REFERENCE_READ_FAILED'
  | 'SESSION_REFERENCE_BUDGET_EXCEEDED'
  | 'SESSION_REFERENCE_CANCELLED'
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxfilereferences--filereferenceservice-abstract-seam"></a>

### `ctx.fileReferences` — `FileReferenceService` (abstract seam)

Host capability for cancellable file-reference discovery.

```ts cordis-catalog
/**
 * List file and directory candidates for one agent's working directory.
 * @param agent - target agent whose session cwd bounds discovery.
 * @param query - path text following `@` or `@"`.
 * @param signal - caller cancellation.
 * @returns deterministic path-only candidates.
 */
abstract list( agent: Agent, query: string, signal: AbortSignal, ): Promise<FileReferenceCandidate[]>
```

Types: [Agent](core.zh.md)

Source: [`packages/context/file-reference/src/index.ts`](../../packages/context/file-reference/src/index.ts)

<a id="ctxsessionfilereferences--sessionfilereferences"></a>

### `ctx.sessionFileReferences` — `SessionFileReferences`

Host Remote adapter over the composed file-reference provider.

```ts cordis-catalog
/**
 * List file and directory candidates for one Agent's working directory.
 * @param agent - target Agent resolved from the Session identity on the wire.
 * @param query - path text following `@` or `@"`.
 * @param signal - caller cancellation.
 * @returns deterministic path-only candidates from the composed provider.
 */
@Remote list( agent: Agent, query: string, signal: AbortSignal, ): Promise<FileReferenceCandidate[]>
```

Types: [Agent](core.zh.md)

Source: [`packages/api/session-controller/src/file-references.ts`](../../packages/api/session-controller/src/file-references.ts)

<a id="ctxsessionreferenceresolver--sessionreferenceresolver"></a>

### `ctx.sessionReferenceResolver` — `SessionReferenceResolver`

Exact-read consumer that prepares immutable cross-session message context.

```ts cordis-catalog
/**
 * List reference candidates, ranked by working-directory affinity.
 *
 * Discovery runs at keystroke rate, so titles and subagent labels only ever
 * come from projection reads; sessions without either fall back to their id.
 * @param agent - target agent; self is excluded and its cwd drives ranking.
 * @param query - optional case-insensitive session-id/cwd/title/display-title substring.
 * @param limit - optional positive result cap.
 * @param signal - optional cancellation boundary for host autocomplete teardown.
 * @returns candidates with canonical mention labels and presentation titles.
 */
async listCandidates( agent: Agent, query: string = '', limit: number = this.config.candidateLimit, signal?: AbortSignal, ): Promise<SessionReferenceCandidate[]>

/**
 * Remote face of {@link listCandidates}: the configured candidate limit
 * applies, and every candidate carries the canonical mention a host inserts
 * into the prompt draft.
 * @param agent - target agent; self is excluded and its cwd drives ranking.
 * @param query - optional case-insensitive session-id/cwd/title substring.
 * @param signal - caller cancellation.
 * @returns mention-carrying candidates in rank order.
 */
@Remote('candidates') async remoteExportCandidates( agent: Agent, query: string, signal: AbortSignal, ): Promise<SessionReferenceMentionCandidate[]>

/**
 * Snapshot all references for one accepted direct message and return one aggregated durable context.
 * Automatic budgets use the last assembled route, or agent options before any assembly.
 * Missing model capacity or adapter uses 64 KiB; other metadata lookup failures and cancellation reject preparation.
 * Truncated previews include omission facts and a full-snapshot spill locator, or an explicit unavailable notice.
 * Cancellation prevents context publication, including when storage completes after cancellation.
 * @param agent - target agent; references to it are rejected.
 * @param content - already host-normalized readable message content.
 * @param references - structured source sessions in mention order.
 * @param signal - optional cancellation boundary for the active turn.
 * @returns detached content and optional referenced-session context.
 */
async prepare( agent: Agent, content: ContentBlock[], references: SessionReferenceInput[], signal?: AbortSignal, ): Promise<PreparedReferencedMessage>
```

Types: [Agent](core.zh.md) · [ContentBlock](llm-streaming.zh.md)

Source: [`packages/context/session-reference/src/index.ts`](../../packages/context/session-reference/src/index.ts)
<!-- END GENERATED cordis-surface -->
