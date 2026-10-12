# OTel Reporting

[English](otel.md) | 中文

The [OTel plugin](../../packages/telemetry/otel/README.zh.md) registers `ctx.otel` as the shared factory for both the independent ordinary-event channel and the Session log channel. It owns the transport and the SDK aggregation implementation. Business callers inject the service, supply transport, resource, and scope options explicitly, and own closing the returned channel.

UI feedback reaches the Session feedback service through the existing Remote API. Only after the feedback is recorded does the Session adapter receive capture authorization for the canonical log prefix, and after redaction it reports through the OTel channel. Ordinary product callers submit selected fields through the product adapter. The shared service has no automatic identity or capture policy, and channels share neither queue nor request.

The [product adapter](../../packages/host/product-telemetry-otel/README.zh.md) and the [Session adapter](../../packages/session/session-telemetry-otel/README.zh.md) retain their own deployment configuration and disposal deadline. Callers must not reuse a channel after it closes. Mounting the OTel service alone allocates no provider or transport.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxotel--otel"></a>

### `ctx.otel` — `OTel`

Shared transport provider. Mounting creates no queue, identity, or network connection.

```ts cordis-catalog
/**
 * Create an independent ordinary-event channel with count-based batching.
 * The injected consumer must drain it during its fiber disposal.
 * @param options - transport, scope, resource, queue, and diagnostic settings selected by the consumer.
 * @returns the caller-owned channel; no state is shared with other channels.
 */
createEventReporter(options: EventLogOptions): EventLogReporter

/**
 * Create an independent byte-bounded Session-log channel.
 * Authorization and redaction precede reporting; the consumer owns shutdown and its outer deadline.
 * @param options - transport, scope, resource, queue, and diagnostic settings selected by the consumer.
 * @returns the caller-owned channel, preserving complete accepted events within the request byte ceiling.
 */
createSessionLogReporter(options: SessionLogOptions): SessionLogReporter
```

Source: [`packages/telemetry/otel/src/index.ts`](../../packages/telemetry/otel/src/index.ts)
<!-- END GENERATED cordis-surface -->
