# 4. Events

[English](04-events.md) | 中文

Services support direct calls; **events** let a plugin emit a notification without knowing which plugins are listening. The harness uses events for interactions such as tool results, model requests, and approval decisions.

## Declaring, emitting, and listening

Create `stats.ts` and put it in `tmp/cordis-tutorial`. It is a service that counts and emits a notification on every change:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    stats: StatsService
  }
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}

export class StatsService extends Service {
  private counts = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'stats')
  }

  bump(name: string) {
    const next = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, next)
    this.ctx.emit('stats/report', name, next)
  }
}

export const name = 'stats'

export function apply(ctx: Context) {
  ctx.plugin(StatsService)
}
```

The `interface Events` merge mirrors the `interface Context` merge from chapter 3 in the event system: it declares event names and their listener signatures, so both `ctx.emit` and `ctx.on` are fully typed. The `namespace/action` naming convention keeps the flat event namespace readable.

Create `reporter.ts`:

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from './stats.ts'

export const name = 'reporter'
export const inject = ['stats']

export function apply(ctx: Context) {
  ctx.on('stats/report', (name, count) => {
    console.log(`[stats] ${name} -> ${count}`)
  })
  ctx.stats.bump('tool_call')
  ctx.stats.bump('tool_call')
  ctx.stats.bump('prompt')
}
```

The line `import type {} from './stats.ts'` imports nothing at runtime; its purpose is to let TypeScript see the declaration merge. Compose and run:

```yaml
- name: './stats.ts'
- name: './reporter.ts'
```

```
[stats] tool_call -> 1
[stats] tool_call -> 2
[stats] prompt -> 1
```

Because `ctx.on()` is an effect, the listener disappears with the plugin, and you never maintain a `removeListener` by hand.

## Dispatch modes

`emit` is one of five dispatch modes. Which mode an event uses is part of its contract, and it decides whether listeners can return values, run concurrently, or short-circuit one another:

| Mode | Call | Semantics |
|---|---|---|
| emit | `ctx.emit(name, ...args)` | Synchronous broadcast; returned promises and values are neither awaited nor collected. |
| parallel | `await ctx.parallel(name, ...args)` | All listeners run concurrently and are awaited together. |
| serial | `await ctx.serial(name, ...args)` | Listeners run and are awaited in order; the first non-`null`/`false`/`undefined` return value wins and stops the remaining listeners. |
| bail | `ctx.bail(name, ...args)` | The synchronous version of serial. |
| waterfall | `ctx.waterfall(name, ...args, next)` | Middleware wrapping, described below. |

Every harness event records its mode in the generated reference on the [subsystem page](../subsystems/core.zh.md) that owns it.

## waterfall: transform or short-circuit

waterfall is the mode for interception. Each listener receives the arguments plus a `next()` continuation; it can transform the return value of `next()`, or return without calling `next()` to short-circuit the rest of the chain. The Cordis documentation calls the latter behavior vetoing. Create `waterfall-demo.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
  }
}

export const name = 'waterfall-demo'

export function apply(ctx: Context) {
  // Listener 1: wrap the downstream result.
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()
  })

  // Listener 2: short-circuit when it owns the decision.
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'
    return next()
  })

  void (async () => {
    console.log(await ctx.waterfall('demo/transform', 'hello', async () => 'hello'))
    console.log(await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words'))
  })()
}
```

Point `cordis.yml` at that file alone and run it:

```
HELLO
** BLOCKED **
```

Follow how the second line comes about, in order: listener 1 runs first and calls `next()`, which calls listener 2; listener 2 sees `blocked`, returns directly, and does not call `next()`, so the innermost default logic (the function passed to `ctx.waterfall`) never runs; on the way back, listener 1 uppercases the replacement message.

That yields a discipline: **a waterfall listener that only observes or annotates must call `next()`**; returning without calling it means a deliberate short-circuit. A logging listener that forgets to call `next()` silently swallows all downstream default behavior. This is a standing rule in this repository ([waterfall semantics](../cordis-primer.zh.md#cordis-waterfall-semantics)).

The harness uses waterfall for decisions that cooperating plugins can wrap or answer: [`agent/request`](../subsystems/core.zh.md#agentrequest--waterfall) lets a plugin replace the model call configuration, and [`approval/request`](../subsystems/approval.zh.md#approvalrequest--waterfall) lets a policy answer in place of the user.

Next: [Configuration](05-config.zh.md) — plugin options from `cordis.yml`.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
