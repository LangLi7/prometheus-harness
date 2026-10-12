# 5. Configuration

[English](05-config.md) | 中文

Every Cordis entry in `cordis.yml` can carry a `config` block, and the plugin declares a schema that validates that block before `apply` runs. Bad config fails the load with an accurate error: a plugin never starts with incomplete configuration.

## A configurable plugin

Create `config-demo.ts` and put it in `tmp/cordis-tutorial`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'config-demo'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

export function apply(ctx: Context, config: Config) {
  for (const target of config.targets) {
    console.log(`${config.greeting}, ${target}!`)
  }
}
```

The exported `Config` is both a TypeScript interface and a runtime schema under the same name: consumers get the type, and Cordis gets the validator. This repository uses [Schemastery](https://github.com/shigma/schemastery) to define schemas; Cordis itself accepts any [Standard Schema](https://standardschema.dev/) validator, so exporting a plain object as `Config` does not work.

Configure it:

```yaml
- name: './config-demo.ts'
  config:
    targets: ['alpha', 'beta']
```

Run it:

```
Hello, alpha!
Hello, beta!
```

`greeting` was not supplied, so the schema default fills it in: `apply` always receives a complete, validated config.

## Failing loud

Now pass it something invalid:

```yaml
- name: './config-demo.ts'
  config:
    targets: 'not-an-array'
```

```
ValidationError: invalid config:
  - $.targets expected array but got not-an-array (at targets)
```

The plugin's fiber enters the FAILED state, and this tutorial's launcher prints the error and exits with status code 1. If a plugin's config passes schema validation but names a resource or provider that is unavailable, the plugin should likewise refuse as soon as it can resolve that reference.

<a id="volatile-fields"></a>
## Volatile fields

For fields a plugin reads on every operation, use `.volatile()`. A change to the field updates the stable reference without re-mounting the plugin. Read it through `.get()`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  greeting: Schema.string().default('Hello').volatile(),
})

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
  ctx.on('loader/volatile-update', () => {
    console.log(config.greeting.get())
  })
}
```

Calling `Config(raw)` directly also returns references. An optional field without a default still has a reference; when the field is absent, `.get()` returns `undefined`. You may keep the reference, or keep a read value for the duration of a single operation, including across an `await`, but not for later operations. Object and array values are plain data snapshots detached from the input and recursively frozen; functions, class instances, and circular references are rejected.

The Loader ignores schema-declared volatile fields when comparing raw config. A volatile-only change is resolved and validated through the target plugin's `internal/config` hook; when the effective values of all ordinary fields still match, the Loader commits the new value to the running reference and emits one `loader/volatile-update` to the owning instance, with the changed paths as an array of keys, without entering the target plugin's `internal/update`. Equal updates notify nothing. An invalid candidate is logged and the running reference stays unchanged until the next activation. Changes to the effective values of ordinary fields, including changes in expression evaluation results, and simultaneous changes to ordinary fields follow the original update flow, and the old references are neither updated nor notified. Group/Include still dispatches child-entry updates. A direct `fiber.update()`, a code replacement, and a dependency replacement keep their original lifecycles; `noSave` still controls persistence of a direct update. The notification uses a plain `emit` and does not wait for resource reconfiguration to finish.

Declare volatile fields at a fixed object path, or mark a whole object or array volatile. Standalone references inside arrays, dicts, union or intersect branches, lazy, transform, or another volatile value are rejected. Config files store plain values; `simplify()` unwraps references. The serialized schema keeps field types, defaults, roles, and the volatile marker for schema-driven forms. Existing settings consumers keep using the existing settings interface.

## Computed config values

The loader used by this repository supports the `!!js` tag for config values that must be computed at load time:

```yaml
- name: './config-demo.ts'
  config:
    greeting: !!js process.env.DEMO_GREETING ?? 'Hello'
```

`!!js` is valid only inside `config` and an entry's `disabled` field. `disabled: !!js ...` is evaluated against the loader context on every mount decision (this repository's extension) and can gate one line by platform or environment; all other metadata (`name`, `id`, `inject`, and so on) stays static, and an expression there is plain truthy data. See [loader configuration](../cordis-primer.zh.md#loader-configuration) for details.

Next: [Composition and HMR (hot module replacement)](06-composition-and-hmr.zh.md) — treating `cordis.yml` as the application.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
