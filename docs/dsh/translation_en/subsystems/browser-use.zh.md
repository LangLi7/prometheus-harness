# Browser use

[English](browser-use.md) | 中文

Browser use lets a model inspect and operate web pages through a configured backend. DSH owns the task loop; the provider supplies browser operations and retains browser state across turns of one live Session.

## Choose a provider

Mount [`dsh-browser-use`](../../packages/browser-use/browser-use/README.zh.md) and one provider in the same composition. These providers are experimental public npm packages and require explicit activation. The browser engine they initially support is Chromium.

| Provider | Integration |
|---|---|
| [Playwright MCP](../../packages/experimental/browser-use-playwright-mcp/README.zh.md) | Playwright's browser-control MCP tools |
| [Chrome DevTools MCP](../../packages/experimental/browser-use-chrome-devtools-mcp/README.zh.md) | Chrome DevTools inspection and control through MCP |
| [Stagehand](../../packages/experimental/browser-use-stagehand-native/README.zh.md) | Native browser operations with AI-assisted act, observe, and extract |

The shared service registers only a name and rejects any second provider registration, including an instance with the same name. It contains no common browser-operation methods, browser resources, or model-controlled selector. Provider configuration in a profile or preset selects launch or attach mode for that activation.

## Session ownership

A launched browser belongs to the exact live Agent and Session that uses it. Calls across turns reuse that browser. Disposal of the Session runtime closes the resources it launched; reloading or forking a Session creates fresh browser state. Browser profile and login state are never restored from the Session log.

An attached browser stays externally owned. Within that provider instance the provider reserves the browser for one Session, preserves existing browser state, and rejects a second Session attaching at the same time. Cleanup disconnects and leaves the external browser running. Separate DSH processes and other clients are not bound by this reservation.

When a provider shuts down, it first stops accepting tool calls and waits for owned work and resource cleanup to finish before releasing the shared provider registration. Cancellation cannot undo browser operations already delivered.

## MCP initialization

An MCP provider initializes one client for every active Agent created after it loads. The existing serial `agent/created` event waits for connection and discovery to finish before create or resume completes, and queued input starts running only afterwards. The client is Session-owned across turns. Startup failure or cancellation rejects the create or resume and triggers client cleanup.

If the attach connection is already taken, this activation runs without a browser but keeps running, and later turns do not retry. Once the connection is released, a newly created or resumed activation can acquire it. Loading or reloading the provider does not take over an already active Session; the [shared runtime](../../packages/experimental/browser-use-runtime/README.zh.md) owns these initialization rules.

## Tools and logged results

Provider tools use the normal DSH execution pipeline and Session log. Providers own their own tool schemas, result rendering, image support, configuration, and upstream limitations; the shared service adds no model-visible content. Stagehand's AI-assisted operations use its explicitly configured native model, and DSH retains the task loop. DSH model routing, credential reuse, underlying inference request/response capture, and integration with Session usage metering are deferred work; returned SDK data and metadata are still logged as ordinary tool results.

Browser MCP connections also supply [resources and server instructions](mcp.zh.md). Resource calls to a browser server use that server's Session queue and reject requests from other Sessions; server instructions are assembled only into their owning Session's prompt.

The [decision record](../../.agents/notes/implemented/architecture/2026-09-12-browser-use-provider-registration.zh.md) explains the name-registration-only service and per-Session ownership.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbrowseruse--browseruseregistry"></a>

### `ctx.browserUse` — `BrowserUseRegistry`

Owns one optional provider registration in the shared browser-use service.

```ts cordis-catalog
/**
 * Reserve the sole provider slot until the contribution is disposed.
 * A second registration fails even when it repeats the current name. Providers
 * must stop their tools and await owned work before releasing this registration.
 * @param name - provider-owned name used in registration diagnostics.
 * @returns the effect disposer for this exact registration.
 */
register(name: BrowserUseProviderName): () => Promise<void>
```

Source: [`packages/browser-use/browser-use/src/index.ts`](../../packages/browser-use/browser-use/src/index.ts)
<!-- END GENERATED cordis-surface -->
