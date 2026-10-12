# 3. Services

[English](03-services.md) | 中文

A **service** is a named capability that one plugin provides and other plugins consume through `ctx`. In the harness, `ctx.tools`, `ctx.llm`, and `ctx.agents` are all services. A consumer names the capability, such as `'tools'`, without importing its provider, so the configuration can choose the provider without modifying the consumer.

## Providing a service

Create `greeter.ts` and put it in `tmp/cordis-tutorial`:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return `Hello, ${who}!`
  }
}

export const name = 'greeter'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```

Two parts work together:

- **Runtime**: `super(ctx, 'greeter')` registers the instance under the name `greeter`. After that, any plugin can reach it through `ctx.greeter`. The registration is an effect, so unloading the provider removes the service.
- **Compile time**: the `declare module '@deepseek-ai/cordis'` block uses TypeScript declaration merging to add `greeter` to the `Context` interface, so `ctx.greeter` type-checks everywhere. It generates no code; without that declaration the service still works at runtime, but consumers lose type safety.

A `Service` subclass is itself a plugin (the class shape from chapter 1), so `ctx.plugin(GreeterService)` mounts it like any other plugin.

## Consuming a service with `inject`

Create `consumer.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
```

`inject` lists the services this plugin needs. Cordis keeps the plugin PENDING until every listed service exists, so inside `apply`, `ctx.greeter` is guaranteed to be ready. Load order in `cordis.yml` does not matter: dependencies decide when a plugin starts, not file order.

Compose and run:

```yaml
- name: './greeter.ts'
- name: './consumer.ts'
```

```
Hello, world!
```

Swap the two lines in `cordis.yml` and run again: the output is unchanged. Try removing `./greeter.ts` entirely: the consumer stays PENDING, prints nothing, does not crash, and does not run partially. A fiber in PENDING also does not keep the Node event loop alive, so if nothing else in the composition is running, the process exits silently with status code 0. [Chapter 6](06-composition-and-hmr.zh.md) covers how to diagnose that state.

## Dependencies stay tracked after load

`inject` is not a one-time startup check. If a required service disappears while the application runs, for example because its provider was unloaded or hot-replaced, every dependent plugin unloads with it and loads again once the service returns. Combined with effects ([chapter 2](02-lifecycle-and-effects.zh.md)), this keeps a running consumer from holding a reference to an unavailable service: when the dependency goes away, its own registrations are undone too.

This is also why configuration can swap services: unload the `dsh-bash-local` Cordis entry, mount a different `shell` provider, and every plugin that injects `'shell'` restarts against the new implementation.

## Optional dependencies

`inject` is for hard dependencies. If the plugin can still run when a capability is missing, skip `inject` and probe at the point of use:

```ts ignore-check
export function apply(ctx: Context) {
  // undefined when no provider is loaded; the plugin still runs.
  const greeter = ctx.get('greeter')
  console.log(greeter?.greet('maybe') ?? 'no greeter available')
}
```

## Naming

Service names share one flat namespace per application. Give your own services a distinctive prefix or namespace (the harness already occupies plain names such as `tools` and `llm`); the generated `cordis-surface` regions on the [subsystem pages](../subsystems/core.zh.md) list every name the harness registers.

Next: [Events](04-events.zh.md) — communicating without a shared service.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
