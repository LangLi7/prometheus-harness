# Spill storage

[English](spill.md) | 中文

Spill storage is a [capability seam](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.zh.md) that persists caller-provided text and returns a model-facing locator plus retrieval guidance. Its Service Definition is [dsh-spill](../../packages/spill/spill) (`ctx.spillStore`) and its local Service Provider is [dsh-spill-local](../../packages/spill/spill-local). Consumers include the [tool-result policy](../../packages/spill/spill-policy) and [session references](../../packages/context/session-reference/README.zh.md). Spill is an optional capability and not part of the [agent loop trunk](core.zh.md); previews and spill decisions belong to consumers, while the store persists the supplied text verbatim.

Source: [`packages/spill/spill/src/types.ts`](../../packages/spill/spill/src/types.ts)

## Save requests

`saveText` is the only service operation: it persists `content` verbatim and returns an opaque locator, a backend-provided retrieval hint, and the exact byte count. The request carries the save-time storage namespace (`owner`), a descriptive producer source (`source`, never access control), and a `suggestedName` that the backend uses as a naming hint, never as a path. A tool source identifies the actual tool call; a session-reference source identifies the captured source session, while its ownership is the destination session of the receiving context.

```ts type-equiv
/** One request to persist text to a spill artifact. */
interface SaveTextSpill {
  owner: SpillOwner
  source: SpillSource
  /**
   * A caller-suggested base name (e.g. `web_fetch.txt`). The backend sanitizes
   * it to a single safe path segment before use — it is a hint, never a path.
   */
  suggestedName: string
  /** The full text to persist (UTF-8). */
  content: string
}
```

```ts type-equiv
/**
 * Save-time storage namespace for a spilled artifact. The session id lets a
 * backend group storage under the producing session, but the returned
 * {@link SpillLocator} is the model-facing handle. Forked sessions inherit
 * locators already present in the seeded log; those artifacts are not copied or
 * re-owned, and spills produced after the fork use the child session id.
 */
interface SpillOwner {
  sessionId: SessionId
}
```

Retention cleanup can invalidate old locators together with other artifacts of old sessions; the spill seam defines no per-session cleanup policy.

```ts type-equiv
/**
 * Producer of a spilled artifact. Tool results carry their model-issued call id;
 * session references identify the captured source session instead. Descriptive
 * source description only, never access control.
 */
type SpillSource = {
  kind: 'tool'
  /** The tool whose result was spilled (e.g. `web_fetch`). */
  toolName: string
  /** The model-issued call id the result belongs to. */
  callId: ToolCallId
  /** A short human label for the artifact (e.g. `result`). */
  label: string
} | {
  kind: 'session-reference'
  /** Session whose projected conversation was captured. */
  sessionId: SessionId
  /** Host-provided label for the referenced session. */
  label: string
}
```

## Results

```ts type-equiv
/** A saved spill artifact: its locator, byte length, and backend-specific retrieval guidance. */
interface SpillRef {
  locator: SpillLocator
  bytes: number
  retrievalHint: string
}
```

`SpillLocator` is the backend-returned [branded](core.zh.md#branded-ids) model-facing handle. The local backend renders it as a filesystem path; a remote or database backend may render a URI, key, or command token. Consumers treat it as an opaque value and render it with `retrievalHint` instead of assuming `read` is always the right retrieval mechanism.

```ts type-equiv
/**
 * Opaque model-facing handle for one spilled artifact. A local backend may use a
 * filesystem path; a remote or database backend may use a URI or key. Consumers
 * render it with {@link SpillRef.retrievalHint}, but do not parse it.
 */
type SpillLocator = Branded<'SpillLocator'>
```

## Service

`SpillStore` (`ctx.spillStore`, defined in [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)) is an abstract service with a single method: `saveText(input) → Promise<SpillRef>`. It persists the full `content` and rejects on a real storage failure (permissions, ENOSPC, backend unavailable). The seam owns storage only: not retention policy, tool-result replacement, or a retrieval/search API.

The local backend ([dsh-spill-local](../../packages/spill/spill-local)) writes `<root>/session-<hash>/<random>-<safeName>`: the root is a configured or lazily created private (0700) directory, the session subdirectory uses `sha256(sessionId)`, and an exclusive owner-only write (`open(path, 'wx', 0o600)`) prevents a pre-planted symlink from redirecting the write. Its `locator` is a local path and its `retrievalHint` tells the model to use `read` or `grep` on that path. The policy consumer ([dsh-spill-policy](../../packages/spill/spill-policy)) replaces image and text results beyond `maxInlineTokens` with head and tail content preserved in the original order plus the spill address; the process is best-effort: when saving fails, the original inline result is kept and a successful call does not become `isError`.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxspillstore--spillstore-abstract-seam"></a>

### `ctx.spillStore` — `SpillStore` (abstract seam)

Abstract spill storage service. Subclass, implement saveText, and load the subclass as a plugin — it registers as `ctx.spillStore` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior).

Semantics every implementation must honor:

- saveText persists the FULL `content` verbatim and returns an opaque locator, exact byte length, and model-facing retrieval guidance.
- Storage is scoped by the request's SaveTextSpill.owner session; the backend chooses a private (not world-readable) location and a collision-free name derived from — never equal to — the caller's `suggestedName`.
- `saveText` REJECTS on a real storage failure (permissions, ENOSPC, backend unavailable); the caller decides how to degrade (the spill policy treats a rejection as best-effort and keeps the inline result).

```ts cordis-catalog
/**
 * Persist `input.content` to a session-scoped spill artifact.
 * @param input - the owner, caller-supplied source fields, suggested name, and full text to save.
 * @returns the saved artifact's {@link SpillRef}; rejects on a storage failure.
 */
abstract saveText(input: SaveTextSpill): Promise<SpillRef>
```

Source: [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)
<!-- END GENERATED cordis-surface -->
