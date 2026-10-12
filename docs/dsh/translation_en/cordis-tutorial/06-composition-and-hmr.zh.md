# 6. Composition and HMR (hot module replacement)

[English](06-composition-and-hmr.md) | 中文

Every capability built so far is a plugin, and `cordis.yml` selects the application's plugin tree. This chapter changes that composition, hot-reloads one plugin, and diagnoses a plugin that never loads.

## Cordis entries carry more than a name

Besides `name` and `config`, a Cordis entry accepts other metadata:

```yaml
- id: greeter          # stable identity for this entry
  name: './greeter.ts'
- id: consumer
  name: './consumer.ts'
  disabled: true       # keep the entry, skip mounting it
```

`id` gives a Cordis entry a stable identity, letting the loader tell apart modifying an existing Cordis entry from deleting one and adding another. `disabled: true` unloads the plugin without deleting its Cordis entry; restoring the value loads the plugin again, along with every plugin left PENDING on a service it provides.

A group can nest a sub-list of Cordis entries and load and unload it as one unit; `isolate` gives a group its own instance of a service name, so two groups can each see a differently configured `shell` provider without affecting each other. The [Cordis primer](../cordis-primer.zh.md) and the [service isolation example](../user/develop/framework/service.zh.md#service-isolation) cover the details.

## Hot module replacement

Unloading releases effects ([chapter 2](02-lifecycle-and-effects.zh.md)), and loading follows dependencies ([chapter 3](03-services.zh.md)), so HMR can unload and then load to replace a running plugin. The `@deepseek-ai/dsh-hmr` plugin watches files and performs that on save.

In `tmp/cordis-tutorial`, write `cordis.yml`:

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  config:
    root: ['.']
- id: hello
  name: './hello.ts'
```

The list gains two helper plugins: HMR logs through the Cordis logger service, so its messages are invisible without a console exporter; it also `inject`s the `timer` service to debounce, and without `@deepseek-ai/cordis-plugin-timer` it stays PENDING forever without emitting any hint. The next section covers that silent state.

HMR reads Node's loader internals through a native helper of the Loader. Run Cordis under tsx:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Now edit `hello.ts`, change the log message, and save:

```
hello from my first plugin
2026-07-22 15:44:36 [I] hmr watching [ '.' ]
2026-07-22 15:44:39 [I] hmr reload plugin at hello.ts
hello from my EDITED plugin
```

The old instance unloads first (all of its effects roll back), the new code loads afterwards, and `apply` runs again. Press Ctrl-C to stop the process. Editing `cordis.yml` itself also triggers an update: the loader compares Cordis entries by `id` and only mounts, unmounts, or reconfigures the parts that changed. That is why the Cordis entries above carry an explicit `id`: a Cordis entry without one receives a freshly generated id on every read, so any edit to the config file, even one that leaves its own text unchanged, treats it as deleted and re-added and re-mounts it.

## Diagnosing a plugin that never loads

Dependency-driven loading has another side: if a plugin's `inject` names a service nobody provides, the plugin waits forever and prints nothing. This is not an error, because PENDING is a legitimate state and a provider may mount later.

You can inspect those states directly. Every context can enumerate the plugin registry; create `diagnose.ts`:

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
```

Also create `needs-timer.ts`, a plugin whose dependency cannot be satisfied:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'needs-timer'
export const inject = ['timer']

export function apply(ctx: Context) {
  console.log('needs-timer loaded')
}
```

```yaml
- name: './needs-timer.ts'
- name: './diagnose.ts'
```

Run it (`node --import tsx ../../vendor/cordis/bin.js` directly, Ctrl-C to stop):

```
needs-timer is PENDING — a required service is missing
```

`inject: ['timer']` has no provider. Add `- name: '@deepseek-ai/cordis-plugin-timer'` to the list and the plugin loads. If a plugin neither does anything nor reports anything, check its fiber state. Iterating without the PENDING filter also shows the loader's own plugins (Loader, Include) as ACTIVE, because the config file itself is mounted through a plugin as well.

Next: [Into the harness](07-into-the-harness.zh.md) — applying the same patterns to real harness services.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
