# Product telemetry

[English](product-telemetry.md) | 中文

The [product telemetry plugin](../../packages/host/product-telemetry-otel/README.zh.md) sends explicitly selected analytics events over OTLP/HTTP. The `productTelemetry` service only submits; product consumers decide when an event happens and which fields may be collected. The exporter collects no Session data or identity automatically. The [Desktop analytics consumer](../../packages/client/product-analytics/README.zh.md) selects interaction and live-compaction events, adds an available signed-in identity, and honors the collection switch at Desktop startup. Ordinary Web clients collect no product events.

`ProductTelemetryRecord` requires an event name, a string body, and a Unix millisecond timestamp. Attributes accept string, number, and boolean scalars, plus a single-level object of those values (`ProductTelemetryScalar`). The optional severity uses OTel severity numbers and defaults to INFO. The observation time is filled in when the record is enqueued.

Enqueueing is synchronous and is not a delivery acknowledgement. The SDK owns batching and retries; a failed send produces a local diagnostic. Configuration, shutdown, and loss limits live in the package README.

## Record types

```ts type-equiv
/** Scalar values accepted in product attributes. */
type ProductTelemetryScalar = OTelEventScalar
```

```ts type-equiv
/** Caller-selected ordinary analytics record. */
type ProductTelemetryRecord = OTelEventRecord
```

Source: [`packages/host/product-telemetry-otel/src/index.ts`](../../packages/host/product-telemetry-otel/src/index.ts)

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxproductanalytics--productanalytics"></a>

### `ctx.productAnalytics` — `ProductAnalytics`

Authenticated event intake; disabled instances do not inspect identity or accept new events.

```ts cordis-catalog
/**
 * Read the collection policy.
 * @returns whether this Host currently accepts Desktop analytics.
 */
@Remote enabled(): boolean

/**
 * Stream the effective policy initially and after live configuration edits.
 * @param signal - subscriber lifetime.
 * @returns current policy values until cancellation or service disposal.
 */
@Remote({ mode: 'stream' }) async *watchPolicy(signal: AbortSignal): AsyncIterable<boolean>

/**
 * Submit selected Desktop fields; missing identity is omitted and never generated.
 * @param event - typed product event without message contents or credentials.
 * @returns after local submission; no delivery or warehouse acknowledgement.
 */
@Remote async report(event: ProductEvent): Promise<void>
```

Source: [`packages/client/product-analytics/src/index.ts`](../../packages/client/product-analytics/src/index.ts)

<a id="ctxproducttelemetry--producttelemetry"></a>

### `ctx.productTelemetry` — `ProductTelemetry`

Host analytics sender. Mounting alone sends nothing; the owning fiber drains it on unload.

```ts cordis-catalog
/**
 * Enqueue one selected product event without waiting for network delivery.
 * Queue admission and shutdown completion are not collector or warehouse acknowledgements.
 * @param record - caller-owned event containing only approved analytics fields.
 */
emit(record: ProductTelemetryRecord): void
```

Source: [`packages/host/product-telemetry-otel/src/index.ts`](../../packages/host/product-telemetry-otel/src/index.ts)
<!-- END GENERATED cordis-surface -->
