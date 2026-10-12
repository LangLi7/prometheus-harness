# Webhook runtime

[English](webhook.md) | 中文

The Webhook subsystem turns authenticated external deliveries into optional ordinary root Sessions. Provider adapters own authentication and generic JSON intake; trusted programmatic rules own conditions and external calls; `ctx.webhookRuntime` owns callback lifetime and Workspace-based Session creation. The [historical implemented decision](../../.agents/notes/archived/feature/2026-08-22-fire-and-forget-webhook-sessions.md) records why the runtime retains no delivery or completion state.

## Shared values

`WebhookRuleId`, `WebhookSourceId`, and `WebhookDeliveryId` are opaque strings. The delivery id serves as source information only: the runtime neither stores nor deduplicates on it.

`WebhookEventMap` can be extended by declaration merging per provider kind. `WebhookEventOf<K>` selects a known provider event and otherwise admits generic lossless JSON, so out-of-tree adapters need no change to the runtime package.

`VerifiedWebhookDelivery<K>` carries the `kind`, the configured `source`, the provider `deliveryId`, the normalized `event`, and a non-negative safe-integer `receivedAt`. The runtime verifies, detaches, and freezes the complete value before handing it to multiple rules.

`WebhookRule<K>` carries a unique id, a provider kind, and `run(delivery, signal)`. A callback may execute arbitrary trusted code. It returns `null` or a `WebhookSessionRequest`, and asynchronous work that should stop on registration unload must observe the signal.

`WebhookSessionRequest` requires an absolute `workspacePath`, a title, a text prompt, an agent preset, and a permission preset. The optional `model` names an explicit provider/model route with an optional output token ceiling and uses that adapter's default reasoning effort. Omission snapshots the complete current deployment selection including reasoning effort until the first request records the durable header.

## Fire-and-forget dispatch

`dispatch()` snapshots the matching rules, schedules each rule independently, and returns before any callback settles. Throws and rejections are contained per rule. The registration disposer removes the rule first, then aborts and drains active calls, so later deliveries cannot enter code that is unloading.

The runtime has no queue, retry, deduplication, execution state, crash replay, Agent state listener, or completion result. A repeated delivery can create a duplicate Session. The only live-operation table is private teardown bookkeeping that disappears with the process.

## Session creation

A non-`null` result produces a snapshot before the asynchronous preflight. The runtime validates the permission and agent presets, resolves or creates the canonical Workspace, creates the Agent whose Session cwd equals the Workspace path, mounts the selected agent preset before publication, and durably appends the Session before applying permissions, title, and the initial follow-up.

The follow-up is an ordinary durable user-role message with `source.kind: "webhook"` that carries provider/source/delivery/rule source information. Committing its inbox insertion commits the webhook operation. The runtime performs no special flush and does not await the turn; ordinary Session persistence and Agent lifecycle apply afterwards.

An append failure releases the new Agent before the prompt appears. A failure after appending but before prompt admission attempts to detach from the Workspace and releases the Agent without replacing the original error. A Workspace created automatically during preflight is retained, because another concurrent caller may already use it.

## GitHub adapter

`@deepseek-ai/dsh-webhook-github` registers exact routes on the injected WebServer, resolves the credential reference per request, verifies an unmodified `application/json` body before parsing, and returns `202` immediately after in-memory dispatch. Its normalized event is guaranteed to be a signed lossless JSON object; rules validate the event-specific fields they consume.

The [GitHub review guide](../user/guide/github-review.zh.md) mounts that route on a second, isolated WebServer, so exposing the webhook entry point does not expose the browser API.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxwebhookruntime--webhookruntime"></a>

### `ctx.webhookRuntime` — `WebhookRuntime`

Fire-and-forget rule runtime. Session creation is the only built-in action.

```ts cordis-catalog
/**
 * Register one trusted programmatic rule.
 * @param rule - unique id, provider kind, and arbitrary callback.
 * @returns awaitable effect disposer that aborts and drains this rule's active callbacks.
 */
register<K extends string>(rule: WebhookRule<K>): () => Promise<void>

/**
 * Start every currently matching rule and return before any callback settles.
 * @param delivery - authenticated provider data; snapshotted before dispatch.
 * @throws synchronously when the runtime is closing or the delivery is malformed.
 */
dispatch<K extends string>(delivery: VerifiedWebhookDelivery<K>): void
```

Source: [`packages/experimental/webhook/src/index.ts`](../../packages/experimental/webhook/src/index.ts)
<!-- END GENERATED cordis-surface -->
