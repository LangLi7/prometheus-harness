# User approval

[English](approval.md) | 中文

The user-approval seam of [dsh-user-approval](../../packages/interaction/user-approval) answers one question: may this concrete operation proceed? It owns the shared request/result vocabulary, the `ctx.approval` dispatch service, the `approval/request` answerer waterfall, the log-only audit event pair, and the per-session `ask`/`never` policy. UI channels can supply human answerers; the [ACP (Agent Client Protocol) automation bridge](../../packages/acp/acp) supplies one-shot machine decisions for the agents it owns. Callers such as [dsh-tools](../../packages/core/tools) and [dsh-tool-bash](../../packages/shell/tool-bash) consume the closed outcome and reject unless it is `allowed-once`.

Source: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

## Identity and outcomes

Every request receives a fresh `ApprovalRequestId`. The branded type pairs an `approval/asked` with its `approval/decided` audit event, without letting an approval id be interchanged with a tool call id or an agent/session id.

```ts type-equiv
/**
 * Pairs one `approval/asked` audit event with its `approval/decided`.
 * Service-issued (one fresh id per {@link ApprovalService.request} call).
 */
type ApprovalRequestId = Branded<'ApprovalRequestId'>
```

`ApprovalOutcome` is closed and fails closed. `allowed-once` authorizes only the one operation that was asked about; callers reject on `rejected`, `cancelled`, and `unavailable` alike. A missing answerer, one not responsible for the request, a throwing answerer, or a non-conforming one produces `unavailable` instead of a grant.

```ts type-equiv
/**
 * Closed approval outcomes: a one-shot grant, explicit rejection, withdrawn
 * request, or unavailable answerer. Callers fail closed on `unavailable`.
 */
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
```

## Per-session policy

`ApprovalPolicy` decides what happens before an interactive answerer runs. `ask` delegates to the composed answerer chain, whose no-answerer default is `unavailable`; `never` returns `rejected` deterministically and dispatches no answerer. The effective value is the last `approval/policy` event in the session log, falling back to service configuration. Consumers read it through `ctx.approval.effectivePolicy(session)`; `setApprovalPolicy(session, policy)` is the only write path, so replay rebuilds the override.

```ts type-equiv
/**
 * A session's approval policy — what happens to an {@link ApprovalService}
 * ask BEFORE any interactive answerer sees it:
 *
 * - `'ask'` (the default) — delegate to the composed answerers; with none
 *   composed the chain falls through to the fail-closed `'unavailable'`.
 * - `'never'` — never prompt anyone: every ask resolves `'rejected'`
 *   deterministically. The strict headless stance (CI, unattended runs) and
 *   the policy whose outcome is knowable without asking.
 */
type ApprovalPolicy = 'ask' | 'never'
```

Both policies contribute their complete current meaning to the cache-safe runtime-context snapshot. A sourced `user/message` is durable, model-visible input; when approval state changes, a new complete snapshot is appended after the retained history, without touching the `system/message` node that carries the rendered system prompt.

## Approval requests

`ApprovalRequest` identifies the agent and tool operation precisely enough to route and audit the question. It deliberately omits tool arguments: an answerer attaches the prompt to the already-streamed tool call through `callId`, rather than rendering another copy that could drift. The optional `displayReason` passes a caller-provided localized string to the interface; `reason` remains the audit text.

```ts type-equiv
/**
 * Readonly same-process permission question. `callId` links to an already
 * presented tool call, so arguments are not duplicated here.
 */
interface ApprovalRequest extends ApprovalRequestEvent {
  /**
   * The agent on whose behalf the question is asked. Routes the question (a
   * UI answerer only answers for agents it owns) and receives the audit
   * events on its session log.
   */
  readonly agent: Agent
  /** The tool the question is about (presentation and audit). */
  readonly toolName: string
  /**
   * The exact tool call being decided, when the asker has one — lets a UI
   * attach the prompt to the tool call it already streamed.
   */
  readonly callId?: ToolCallId
  /** The asker's human-readable explanation of WHY it is asking. */
  readonly reason?: string
  /**
   * Aborting withdraws the question: the request settles `'cancelled'`
   * immediately and a late answer from a still-pending answerer is discarded.
   */
  readonly signal?: AbortSignal
}
```

## Dispatch and audit

`ctx.approval.request(req)` requires the requesting session to be inside a turn that has not yet ended. It appends `approval/asked`, obtains an outcome, appends the matching `approval/decided`, and then fulfills with that outcome. The `never` policy is enforced inside the service, before waterfall dispatch, so even an answerer registered later with `prepend` cannot bypass it. An answerer returns an outcome when it handles the request and otherwise calls `next()` to delegate; the first answerer takes the single decision slot.

Audit events are log-only and never enter the model transcript. The model-visible behavior is the caller-derived tool result and the current runtime-context snapshot. When the service is disposed it removes its context contribution; answerer listeners are bound to their owning plugin by their own effects.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxapproval--approvalservice"></a>

### `ctx.approval` — `ApprovalService`

Approval service that applies session policy before answerers and logs every ask/outcome pair to the requesting session. It exposes deterministic policy changes to the model through the runtime-context snapshot and switch notices.

```ts cordis-catalog
/**
 * Switch one live agent's policy and queue the transition for its next model
 * step. Session initialization uses {@link setApprovalPolicy} directly
 * because there is no previously visible policy to change.
 * @param agent - the live agent whose policy is changing.
 * @param policy - the new effective policy.
 */
setPolicy(agent: Agent, policy: ApprovalPolicy): void

/**
 * Ask the composed answerers to decide one readonly same-process request.
 * The service borrows the request, agent, session, and live signal directly.
 * The request requires an open turn because the audit pair must be enclosed
 * by the durable log's commit/replay boundary; an idle ask rejects before
 * appending anything. The answerer phase always produces an outcome: an
 * aborted signal yields `'cancelled'`, a missing or throwing answerer yields
 * `'unavailable'` (fail closed), and a rogue non-vocabulary return value is
 * normalized to `'unavailable'`. A failure that prevents either audit append
 * from committing still rejects because returning an unlogged decision would
 * violate the pair. Session contains post-commit observer failures, so an
 * authoritative append cannot reject the request or suppress its matching
 * audit event.
 * @param req - the pending decision (agent, tool identity, reason, signal).
 * @returns the closed outcome; `'allowed-once'` is the only grant.
 * @throws when no turn is open or either audit event fails before the session
 *   append commit point.
 */
async request(req: ApprovalRequest): Promise<ApprovalOutcome>

/**
 * Read the session override without applying the configured default.
 * @param session - session whose log supplies the override.
 * @returns the last logged policy, or `undefined` without one.
 */
overrideOf(session: Session): ApprovalPolicy | undefined
```

Types: [Agent](core.zh.md) · [Session](session.zh.md)

Source: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

<a id="approval-events"></a>

### `approval/*` events

<a id="approvalrequest--waterfall"></a>

#### `approval/request` — waterfall

Ask composed answerers for one decision. Return an outcome to claim the request or call `next()` to delegate. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.

```ts cordis-catalog
/**
 * Ask composed answerers for one decision. Return an outcome to claim the
 * request or call `next()` to delegate. Scope-filtered dispatch
 * (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @param req - pending approval request.
 * @mode waterfall
 */
'approval/request'( this: Scoped<Agent>, req: ApprovalRequestEvent, next: () => Promise<ApprovalOutcome>, ): Promise<ApprovalOutcome>
```

Types: [Agent](core.zh.md) · [Scoped](scope.zh.md)

Source: [`packages/interaction/user-approval/src/types.ts`](../../packages/interaction/user-approval/src/types.ts)
<!-- END GENERATED cordis-surface -->
