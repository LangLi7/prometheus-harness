# How-to guide: live configuration forms

[English](adding-a-settings-card.md) | 中文

Declare live fields in a plugin Config schema and offer an editing entry point through the settings card the product owns. The exported `Config` interface describes the value the plugin receives, including every `Volatile<T>` reference.

## 1. Declare live fields

```ts
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export interface Config {
  endpoint: Volatile<string | undefined>
  retries: Volatile<number>
}

export const Config = z.object({
  endpoint: z.string().volatile(),
  retries: z.number().step(1).min(0).default(3).volatile(),
})

export function apply(ctx: Context, config: Config): void {
  ctx.on('loader/volatile-update', () => {
    ctx.logger.info('Retry limit: %d', config.retries.get())
  })
}
```

Read `.get()` at the start of an operation. A request that needs a consistent snapshot captures the values it needs once. Use `.check()` for cross-field Config validation; those checks run in the Host before persistence and do not enter the serialized form schema.

## 2. Compose the plugin

Give every instance a unique profile entry id. The base composition bundle mounts settings and config-editor. Read the respective package READMEs before a custom profile mounts those services.

`role('secret')` keeps a value out of form responses. For a value managed by a credential domain, use a credential reference. Ordinary fields do not enter the settings schema.

## 3. Verify an edit

Change a field on the plugin page and save. Verify the profile patch, the consumer's next operation, an unchanged plugin instance identity, and restoration after a restart. Submit an invalid value and confirm that neither the file nor the live value changed.

A custom plugin page receives `form.state` and `form.mutate(operations, expectedRevision)` from the Plugins page owner. The Host validates the complete Config and applies the change through ConfigEditor and volatile HMR. The [plugin settings package](../../packages/client/ui-settings-plugins/README.zh.md) provides existing card examples.

## 4. Contribute to another plugin's page

A plugin that has something to say about a bundle, row, or official plugin it does not own registers into `plugins.detail.actions` (controls in the page header), `plugins.detail.badge` (a label beside the title), or `plugins.detail.section` (blocks below the page's own content). Every entry renders against the page's `subject` — `{ kind: 'bundle', pkg }`, `{ kind: 'row', pkg, row }`, or `{ kind: 'item', id }` — and returns null for a subject it has nothing to say about:

```tsx ignore-check
ctx.slots.inject('plugins.detail.badge', () => ctx.slots.register({
  name: 'plugins.detail.badge',
  id: 'acme-update',
  locale: 'acmeUpdate',
}, ({ t, subject }) => subject.kind === 'bundle' && hasUpdate(subject.pkg) ? <Tag tone="info">{t('update')}</Tag> : null))
```

## 5. Where the browser half hangs

The [client module system](../../packages/client/modules) delivers the browser half to the page: it scans enabled Loader entries, finds packages that declare `dsh.client`, and ships each package's built `./client` export — but it hangs a package's half only on the line whose specifier is exactly the bare package name. A line mounted from a subpath export never carries a half, so for a composition bundle split across several lines the half stays on the root line, and every page it registered disappears when the root line closes. A subplugin whose page must survive the closing of other lines should ship as a separate package.

The built `./client` file must be in the client module system's lazy-CJS factory format: a script that registers the package name and a `factory(require)` with the page's module loader, as described in the [client module system README](../../packages/client/modules/README.zh.md). The `clientBundle` tsdown preset that produces it lives in `packages/client/tsdown.client.ts`, not in any published package, so a package outside this repository must replicate that build step itself.

```jsonc
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings"] } }
}
```

A companion package for a built-in namespace is that same browser half placed in a purely client-side package, with an empty host `apply`, listed in the Web composition's plugin roster ([`packages/bundle/web-app/cordis.patch.yml`](../../packages/bundle/web-app/cordis.patch.yml)), and registered into `plugins.item` through `ctx.configForms.whileServed`, so the page exists exactly while the Host serves that namespace.
