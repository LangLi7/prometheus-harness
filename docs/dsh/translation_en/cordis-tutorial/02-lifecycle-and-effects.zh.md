# 2. Lifecycle and effects

[English](02-lifecycle-and-effects.md) | 中文

A Cordis plugin can unload because its config changed, because of a hot reload, because of an explicit dispose, or because a required service disappeared. Registrations made through the Cordis API are effects and are undone when their plugin unloads; resources managed outside those APIs must be wrapped in `ctx.effect()`.

## Effect

For resources Cordis does not manage yet, such as timers, connections, or watchers, wrap them in `ctx.effect()` and return a disposer:

Create `lifecycle.ts` and put it in `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // Mount a child plugin and keep its fiber to dispose it later.
  const fiber = ctx.plugin(heartbeat)
  // The demo timer is itself an effect: if THIS plugin is unloaded first,
  // the pending callback is cancelled instead of firing on a dead app.
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
```

Point `cordis.yml` at that file:

```yaml
- name: './lifecycle.ts'
```

Running it (`node --import tsx ../../vendor/cordis/bin.js`) gives:

```
heartbeat plugin loading
tick
tick
tick
heartbeat cleaned up
disposed
```

Note three things:

- `ctx.plugin(heartbeat)` mounts a function **from code** as a plugin, which is exactly what the YAML loader does for each entry. A function plugin does not need an `apply` method: Cordis calls the function directly, and its name serves only diagnostics. Only the object shape requires an `apply` method, for example `ctx.plugin({ apply(ctx) { /* ... */ } })`. The call returns a **fiber**, the runtime handle of one loaded plugin instance.
- The effect body runs during loading; the disposer it returns runs during unloading. For a resource whose lifetime matches the plugin's, you never need to call the disposer yourself.
- `fiber.dispose()` finishes only after all of that plugin's cleanup work, including async disposers, and recursively unloads every child plugin it mounted.

## The fiber state machine

Every loaded plugin instance owns a fiber and moves between these states:

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

- **PENDING**: declared, but a required service ([chapter 3](03-services.zh.md)) is not available yet.
- **LOADING / ACTIVE**: `apply` is running / has finished.
- **FAILED**: `apply` or config validation threw.
- **UNLOADING / DISPOSED**: disposers are running / everything has been torn down.

You will meet PENDING again in [chapter 6](06-composition-and-hmr.zh.md), where it is usually the answer to "why does my plugin print nothing".

## Operations that are already effects

You will rarely need to write `ctx.effect()` yourself, because the built-in registration APIs are effects already:

- `ctx.on(event, listener)`: the listener is removed on unload ([chapter 4](04-events.zh.md)).
- `ctx.plugin(child)`: the child plugin is disposed together with its parent.
- Service registration is an effect. Harness registries such as `ctx.tools.register(...)` also attach the returned disposer to the calling plugin, so they are undone automatically ([chapter 7](07-into-the-harness.zh.md)).

For a resource Cordis does not manage, acquire it inside `ctx.effect()` and return the disposer that releases it. Cordis then calls that release logic during unloading, hot reload included.

One ordering caveat: disposers start in reverse registration order, but several **async** disposers run concurrently. If teardown steps must run in order, put them in a single disposer and await each step in turn inside it.

Next: [Services](03-services.zh.md) — how plugins share functionality.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
