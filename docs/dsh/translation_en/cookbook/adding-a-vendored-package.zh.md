# Cookbook: adding a vendored package

[English](adding-a-vendored-package.md) | 中文

When the harness needs another upstream Cordis package (such as `@cordisjs/plugin-http`), **vendor** it as pinned-version source under `vendor/` rather than adding it as an NPM dependency. [vendor/README.md](../../vendor/README.md) explains why and covers how to *update* an existing vendored package; this guide is the file-by-file checklist for adding a **new** vendored package. (Validated against the existing vendored set; where it disagrees, fix it here.)

## 1. Copy the source

```
vendor/<dir>/
  package.json     # from upstream; rescope the name, keep exports/type (publishable release member, no private flag)
  tsconfig.json    # extends ../../tsconfig.base.json (see configuration below)
  src/             # the upstream src/ verbatim
  README.md LICENSE # if upstream ships them
```

Keep `tsconfig.json` consistent with the other vendored packages: `rootDir: src`, `outDir: lib/types`, the strictness relaxations the upstream code needs, and a `references` entry for every other vendored package it imports:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src", "outDir": "lib/types",
    "noUncheckedIndexedAccess": false, "exactOptionalPropertyTypes": false,
    "noImplicitOverride": false, "noUnusedLocals": false, "noUnusedParameters": false
  },
  "include": ["src"],
  "references": [{ "path": "../cordis" }, { "path": "../cosmokit" }]
}
```

`package.json` invariants: rescope `name` ([mapping](../rescope.zh.md)) and keep the upstream `exports`/`type`; point declaration metadata at `lib/types`; publish the `.d.ts` and `.d.ts.map` declaration output; list its Cordis dependencies in `peerDependencies` (consistent with the upstream manifest (metadata manifest)). A vendored package is a publishable release member, so it must not set `private: true` and must set `publishConfig.access: public`; the `version` field follows the harness release series (see [vendor/README.md](../../vendor/README.md)). Transitive upstream dependencies must themselves be vendored or already present in the repository — vendoring one package often means vendoring its whole dependency tree (for example `@cordisjs/plugin-http` pulls in `@cordisjs/fetch-file`).

Local relative imports/exports in vendored TypeScript source use an explicit `.ts` suffix after copying. This is where the repository-local build differs from upstream: `rewriteRelativeImportExtensions` emits `.js` runtime imports while declaration files keep the explicit `.ts` suffix, so NodeNext/Node16 TypeScript consumers can resolve them.

## 2. Register it in the root configuration

| File | Change |
|---|---|
| `tsconfig.base.json` | Add `"<npm-name>": ["./vendor/<dir>/src"]` to `paths` |
| `tsconfig.host.json` | Add `{ "path": "./vendor/<dir>" }` to `references` (before the `packages/*` entries; vendored code enters the graph only through the host aggregate) |
| `vendor/README.md` | Add a manifest table row (dir, npm name, version, upstream repo, commit SHA) and record every local modification |
| `scripts/publint-all.ts` | Needed only when that vendored package is itself published from this repository (vendored dependencies usually are not — skip it) |

The following are covered automatically by glob and need no manual edit: the root `package.json` workspaces (`vendor/*`), `tsdown.config.ts`, `vitest.config.ts`, `.oxlintrc.json`. A separate `vendor/<dir>/tsdown.config.ts` is needed only when the build configuration differs from the root defaults (dual ESM/CJS or multiple entrypoints — see `vendor/schemastery` and `vendor/logger-console`); its entry should read the JS emitted under `lib/types`.

## 3. Mind the manifest guard

`scripts/check-vendor-manifest.sh` (a pre-commit hook) fails when `vendor/*/src` has staged changes but `vendor/README.md` is not staged alongside them. Stage the manifest update together with the source to pass the commit check.

## 4. Verify

```sh
pnpm install        # registers the workspace
pnpm run typecheck
pnpm run build && pnpm run constraints
```

Run the behavior checks the [testing policy](../testing.zh.md) selects. The source `paths` mapping exists in exactly one place, `tsconfig.base.json`, and serves every graph. The isolation boundary that matters is the project-reference graph: vendored source must be referenced through its own `vendor/<dir>/tsconfig.json` rather than pulled into an aggregate project's strict TypeScript program ([layout](../development.zh.md#typescript-project-layout)).
