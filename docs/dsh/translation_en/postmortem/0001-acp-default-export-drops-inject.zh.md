# Postmortem 0001: ACP (Agent Client Protocol) server crashes on connect — `export default` drops the plugin's `inject`

[English](0001-acp-default-export-drops-inject.md) | 中文

Status: resolved; fix in PR (Pull Request) #41 `feat/acp-2-bridge`

## Summary

Two integration bugs crashed ACP despite full unit-test coverage: a default export made the Loader drop `inject`, and an optional service lookup through a traceable proxy failed at a shadow boundary. Hand-mounted tests bypassed both paths. The fix added real, key-free Loader test coverage and package-level rules for plugin exports and optional service access.

## Overview

The ACP server (`dsh --profile acp`, `@deepseek-ai/dsh-acp`) crashed the instant a real editor (Zed) connected: the first `session/new` request returned `Internal error: cannot get property "agents" without inject`, and `session/load` returned the same error for `sessionPersistence`. Despite 178 green unit tests and 100% line coverage, the bridge did not work at all in production. Two separate bugs hid behind the same error string, and the test suite caught neither for the same reason: every test mounted the plugin through a path that never touched how the plugin is really loaded or how services are really resolved.

## Impact

The ACP server could not create or load a single session — and those are the first two RPCs an editor calls. Anyone connecting an agent to Zed hit a hard failure immediately. No data was lost (nothing had been persisted before the crash); the cost was entirely "the feature does not work" plus two rounds of debugging to locate the cause.

## Timeline

- The bridge (RFC 010) landed with a full unit-test suite covering the codec, the in-memory transport, generated protocol messages, failure paths, and HMR (hot module replacement), plus a real API e2e test that needs a key and a key-free stdout-purity e2e test. All green, 100% coverage.
- A real Zed session failed immediately on `session/new` with `cannot get property "agents" without inject`.
- The investigation first followed a Cordis "traceable/shadow" theory (plausible, and the mechanism does exist — see Bug #2), then instrumented the actual fiber walk in `reflect.ts` under the vendor directory and ran a real subprocess. The trace showed the exception thrown in `apply()` at line 179, *at plugin load time*, on the ROOT fiber with no shadow — which refuted the shadow theory as the explanation for `session/new`.
- Root cause #1 found: one superfluous `export default apply`. Removing it fixed `session/new`.
- Removing it exposed Bug #2: `session/load` still threw on `sessionPersistence` — a genuinely different mechanism (shadow traversal), confirmed by fixing it in isolation and re-running the real subprocess.

## Root cause #1 — `export default apply` drops the plugin's `inject` (crashes `session/new`)

`packages/acp/acp/src/index.ts` is a *namespace plugin*: it exposes `name`, `inject`, `Config`, and `apply` as separate named exports, as every other plugin in the repository does (`invariants`, `llm-deepseek`, `tool-bash`, `tui`, and so on). But it *also* carried one line no other plugin has:

```ts ignore-check
export const name = 'acp'
export const inject = ['agents', 'sessions', 'sessionPersistence']
export function apply(ctx: Context, config: AcpConfig): void { /* … */ }
// …
export default apply   // ← the bug
```

When a plugin is loaded from `cordis.yml`, the Cordis Loader normalizes the imported module through `Loader.unwrapExports` (`vendor/loader/src/index.ts`):

```ts ignore-check
unwrapExports(exports: any) {
  if (isNullable(exports)) return exports
  exports = exports.default ?? exports        // ← prefers `.default`
  if (!exports.__esModule) return exports
  return exports.default ?? exports
}
```

With a default export present, `exports.default ?? exports` resolves to the **bare `apply` function**. A bare function has no `inject`, no `name`, and no `Config` property — those live on the module namespace as *sibling* named exports, and unwrapping to `.default` discards the whole namespace. The Loader then built the plugin's fiber from an empty `inject`.

So `apply` ran in a fiber **with no services injected**. Its first line, `const agents = ctx.agents`, walked the fiber tree (ROOT → Include → Loader → ROOT), found `agents` in no fiber's store, and, on reaching the root fiber (`runtime === null`), threw `cannot get property "agents" without inject`. The crash happened *at load time*, not in a later request handler — the request merely happened to trigger the load.

**Fix:** delete `export default apply`. The Loader then uses the module namespace, correctly recognizes `inject`/`name`/`Config`, and `apply` runs in a fiber that really has the declared services injected.

## Root cause #2 — an optional service read trips the inject guard through a traceable shadow (crashes `session/load`)

After fix #1, `session/new` worked, but `session/load` still threw `cannot get property "sessionPersistence" without inject`. This one *does* come from Cordis's traceable-proxy/shadow mechanism, and it deserves a precise understanding.

`session/load` calls `agents.resume(...)`, which delegates to `AgentLoop.resume()`, which reads `this.ctx.sessionPersistence`. `AgentLoop`'s `static inject` deliberately omits `sessionPersistence` — injecting it would make a non-persistent demo hang forever waiting for a backend that never loads. The service is provided by a separate sibling plugin/fiber and read opportunistically.

Service access in Cordis goes through the context proxy (`vendor/cordis/src/reflect.ts`). When a service method is called through a *traceable proxy* obtained from another fiber (here: the bridge fiber calls `ctx.agents.resume`, and the registry returns `this.factory` — that is, `AgentLoop` — re-wrapped into a new traceable proxy bound to the caller), `createShadowMethod` (`vendor/cordis/src/utils.ts`) rebinds `this` to a *shadow* object whose `ctx` carries `[symbols.shadow]` pointing at `AgentLoop`'s own construction context. Inside `resume`, resolution of `this.ctx.sessionPersistence` starts walking from the shadow's fiber:

```ts ignore-check
// reflect.ts get handler
let fiber = (ctx[symbols.shadow] as Context ?? ctx).fiber   // ← starts at AgentLoop's fiber
while (true) {
  const impl = fiber.store?.[prop]
  if (impl) return getTraceable(ctx, impl.value)
  if (prop in fiber.inject) { /* inactive-context error */ }
  if (!fiber.runtime) throw error                            // ← reached root, throw
  if (fiber.parent[symbols.isolate][prop] !== key) throw error
  fiber = fiber.parent.fiber                                 // ← ancestor-only
}
```

The walk goes **ancestors only**. `sessionPersistence` is neither in `AgentLoop`'s fiber store (it is not in its `static inject`) nor on any ancestor up to the root (it lives on a *sibling* branch), so the walk reaches the root fiber and throws.

Why did the in-memory `AgentLoop` resume tests not catch this? Because they call `ctx.agents.resume(...)` directly from test code — *outside any plugin fiber*. There `ctx.fiber.runtime` is `null`, and the proxy handler takes an early bypass path:

```ts ignore-check
if (!ctx.fiber.runtime) return ctx.reflect.get(prop, false)   // ← direct global-store lookup, no fiber walk
```

`ctx.reflect.get(name, false)` is a direct lookup in the global isolate-symbol-keyed service store — it ignores fiber topology entirely and finds the service. So the read succeeds from a top-level test and throws when reached from inside a real plugin fiber through a shadow. The bridge was exactly the latter.

**Fix:** read optional services with `ctx.get('sessionPersistence')`, which uses the global isolate-keyed store while keeping the active-state check. For services in a plugin's declared inject set, a direct property read still applies.

## Why every test missed it (the real failure)

Both bugs come from the same underlying process gap: **no test drove the plugin through its real loading path or its real call topology.**

- The in-memory harness mounted the bridge by hand-building the plugin object: `ctx.plugin({ name, inject, apply })`. That supplies `inject` by hand, so it could never reproduce Bug #1 — `unwrapExports` is called only by the *Loader*, never by `ctx.plugin`. Even `ctx.plugin(NamespaceImport)` would not catch it.
- The same harness mounted everything flat on one root context, so an `AgentLoop` resume reached from it either ran at top level (the `!runtime` bypass) or ran through a shadow whose origin still resolved to the root — masking Bug #2's ancestor-walk failure.
- The only key-free e2e sends `initialize` and checks stdout purity. `initialize` never reaches the factory, so both bugs sailed through.
- The only test that drives `session/new`/`session/load` needs a key to run, so CI (key-free) skipped it — and locally it "passed" only because a stale built `lib/` (containing the old code) happened to satisfy module resolution.

100% line coverage held throughout. Coverage proves lines were *executed*; it says nothing about whether the feature *works as delivered*.

## Guards added

- **Deleted `export default apply`** (`packages/acp/acp/src/index.ts`) — the fix for Bug #1.
- **`AgentLoop.resume` uses `this.ctx.get('sessionPersistence')`** (`packages/core/agent-loop/src/index.ts`) — the fix for Bug #2, with a comment explaining the shadow-traversal trap.
- **A key-free `session/new` e2e that runs over real stdio** (`apps/cli/tests/profiles/acp/tests/acp.e2e.ts`): it starts the profile as a subprocess through the real Loader and asserts that `session/new` returns normally. It exposes Bug #1 plainly without an API key. Restoring `export default apply` was verified to fail the test.
- **`TSX_TSCONFIG_PATH` set in the e2e spawn**: the subprocess runs from a temporary cwd, and tsx cannot find the repository-root tsconfig `paths` mapping by searching upward — so dsh-* imports silently fell back to the built `lib/`. Pointing tsx at the repository tsconfig makes resolution independent of cwd, ensuring the test runs the *source* rather than a possibly stale build artifact.
- **[docs/testing.md](../testing.zh.md) rule**: "test the real entry path" — line coverage is not behavior coverage — codifying the lesson as a rule for all future plugins.

## Lessons

- Namespace plugins and a default export are mutually exclusive under the Cordis Loader. Choose the namespace form (`name`/`inject`/`Config`/`apply`) and do not add `export default` — `unwrapExports` will discard the namespace.
- For a service a plugin reads opportunistically but does not declare in `static inject`, use `ctx.get(name)`, never `ctx.<name>`. The property proxy resolves through an ancestor-only fiber walk and fails when reached via an outside shadow; `ctx.get(name)` is a topology-independent lookup (and is strict by default — an inactive backend reads as `undefined` instead of still handing that backend to the caller during teardown).
- A test that hand-builds the plugin object cannot validate how the plugin is loaded. At least one test must drive the real Loader/export path end to end. When the core operation does not call a model, that test needs no API key — so it belongs in CI, not behind a key gate.
- Trust the trace, not the theory. The elegant shadow explanation was real, but it was the *second* bug; the *first* was a one-line export error that a single `console.error` in a fiber walk located in minutes, after hours of plausible but wrong reasoning.
