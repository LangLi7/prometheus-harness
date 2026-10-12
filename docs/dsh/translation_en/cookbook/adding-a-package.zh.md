# Cookbook: adding a workspace package

[English](adding-a-package.md) | 中文

A file-by-file checklist for a new `@deepseek-ai/dsh-<name>` package. It is validated against the bash and adapter packages as templates; where the checklist and the templates disagree, fix it here.

## 1. Create the package

```
packages/<group>/<pkg>/
  package.json     # copy from packages/core/tools, adjust name/description/deps
  tsconfig.json    # extends ../../../tsconfig.base.json, rootDir src,
                   # outDir lib/types, references: ../../../vendor/cosmokit,
                   # ../../../vendor/cordis (+ ../../../vendor/schemastery if
                   # you use Config, + ../../<group>/<dep> for each dsh dep)
  src/index.ts     # service default export or plugin (name/inject/apply/Config)
  locale/en.json   # optional display metadata: meta.title and meta.description
  locale/zh.json   # translations using the same fields
  README.md        # service API, events, extension points, design notes,
                   # + gated Model Experience context blocks or short form
                   # + the gated "Known Limitations and Deferred Work" section
                   # (or a whitelist entry in scripts/verify-package-readme-limitations.ts)
```

Choose an existing group when its role matches the package (`core`, `llm`, `shell`, `compaction`, `subagent`, `todo`, `session`, `client`/`host`, `util`, or `test-support`). A new group is allowed, but a group is a pure container: no `package.json`, no source files, and packages still sit exactly one level below it.

package.json invariants (enforced by `pnpm run constraints` / `scripts/check-workspace-constraints.ts`): `private: true`, `version` matching the root `package.json`, `type: module`, `main: "lib/index.js"`, `types: "lib/types/index.d.ts"`, `exports["."].types: "./lib/types/index.d.ts"`, `exports["."].default: "./lib/index.js"`, and `@deepseek-ai/cordis` in both peerDependencies and devDependencies (same range). Mirror every dsh peer dependency (peer dependency) in devDependencies. Put `@deepseek-ai/schemastery` in `dependencies` (it is a runtime validator), consistent with agent-loop. The `files` list contains exactly `lib/index.js`, `lib/types/**/*.d.ts`, and the gate-approved package-specific runtime artifacts. If the package's runtime export points into the output tree, also include `lib/types/**/*.js`. Do not publish `src`, declaration maps, JS maps, or stale root declaration files. A CLI application package with a `bin` lists `lib/bin.js` immediately after `lib/index.js` in `files`.

Relative imports inside the package use an explicit `.ts` suffix in source (for example `export * from './types.ts'`). The compiler rewrites it to `.js` in the emitted JS and keeps the explicit `.ts` suffix in declaration files; standard NodeNext/Node16 TypeScript consumers resolve it to the sibling `.d.ts` file.

## 2. Register it in the root configuration

| File | Change |
|---|---|
| `tsconfig.base.json` | No edit for an existing group; a new group needs a `./packages/<group>/*/src` candidate path for the `@deepseek-ai/dsh-*` wildcard |
| `tsconfig.host.json` (Host packages) or `tsconfig.client.json` (Client packages) | Add `{ "path": "./packages/<group>/<pkg>" }` to `references`: an ordinary package belongs to exactly one aggregate, never both. `api/remotes` uses a repository-specific split because of an ordering dependency between the Host generation convention and the Client consumption convention; new packages must not copy it ([layout](../development.zh.md#typescript-project-layout)) |

Packages under `packages/client/*` extend `tsconfig.base.client.json` instead (not `tsconfig.base.json`); a client plugin package also declares `dsh.client` in package.json, exports `./client`, and calls the shared tsdown preset (`packages/client/tsdown.client.ts`) — see [packages/client/AGENTS.md](../../packages/client/AGENTS.md) for the client side.

The following are covered automatically by glob or by package manifest (metadata manifest) discovery and need no manual edit: the root `package.json` workspaces, `scripts/publint-all.ts`, `tsdown.config.ts`, `.oxlintrc.json`, `scripts/check-workspace-constraints.ts`.

## 3. Decide the package topology

For a replaceable capability, split the Service Definition / Service Provider / Consumer roles into separate packages when they need to evolve independently (see docs/architecture.md § "Capability seams" — the three shell components are the template). A single-purpose plugin stays one package.

### Use role names that match reality

A name must describe the current stable responsibility. Do not name a package after its first implementation, a possible future extension, or a Cordis base class. An interface package uses the capability name. An implementation package adds the mechanism, protocol, environment, or vendor qualifier that distinguishes the implementation. Use `local` only when same-host execution is the convention.

An engine, runtime, policy, controller, resolver, store, or current config uses a singular `ctx` key. A registry or a service that owns several named members uses a plural key. A class's role and its key's number must agree. Do not let incompatible host and client declarations share one Cordis `Context` key. Even when the two use separate runtime contexts, TypeScript declaration merging still sees both types at once. If the natural plural already belongs to another side of the boundary, add a responsibility suffix.

| Word | Applies when | Does not apply when |
|---|---|---|
| `Controller` | It accepts a command or user intent and changes an existing domain or presentation state. | It performs arbitrary work, owns a set of providers, or only converts a value into presentation form. |
| `Store` | It owns a set of data and mainly offers CRUD, snapshot, or subscription operations over it. | It validates a state machine, adjudicates authority, dispatches work, or owns provider priority. A map in the class does not make it a store. |
| `Directory` | It exposes entries and their metadata for discovery or selection. | Producers register arbitrary implementations into it, or callers perform work through it. |
| `Presenter` | It purely converts domain values or tool arguments into render intents. | It performs I/O, subscribes, mutates state, or owns a lifecycle. |
| `Registry` | It owns a set of dynamic named registrations plus lookup, duplicate or priority rules, lifecycle, and release. | The primary convention is dispatch, execution, cancellation, policy, or orchestration. |
| `Runtime` | It runs live work and, across calls, owns dispatch, cancellation, provider coordination, or operation lifecycle. | It only stores records, returns a directory, resolves one value, or holds configuration. |
| `Resolver` | It computes or locates an answer from its input without owning that answer's lifecycle. | It owns a mutable collection or a long-running execution. |
| `Binder` | It binds a declared interface to the caller's context or lifecycle and returns the bound value. | It holds that value as a collection, controls its domain state, or only converts data. |
| `Engine` | It implements a domain algorithm or a stateful execution model. | It only selects a provider or forwards requests across a protocol boundary. |
| `Policy` | It decides what is allowed, chosen, restricted, or observed. | It executes the mechanism that the decision permits. |
| `Executor` | It runs one explicit request or resolved spec within one capability. | It owns a broad application lifecycle or a provider directory. |
| `Gateway` | It adapts a process, network, RPC, or API boundary. | It only registers in-process services or stores metadata. |
| `Provider` | It supplies one implementation of a capability definition. When several implementations exist, add the mechanism or vendor qualifier. | It represents the capability definition, a provider registry, or a consumer runtime. |
| `Backend` | It implements replaceable underlying persistence, transport, or execution behind a defined interface. | It represents a user-facing service or a returned live resource reference. |
| `Handle` | It references one live resource and controls or observes that resource. | It creates and manages a whole resource pool. |
| `Config` | It owns one resolved config value, or a tightly scoped config record and its update convention. | It stores general collections, performs work, or exposes unrelated settings. |
| `Service` | It owns a cohesive domain service that no more precise role above can describe honestly. | The name is used only because the class extends Cordis `Service`. |

Use `SDK` only for the JSON-RPC client/server protocol used by the supported Python and TypeScript SDKs. DeepSeek Harness itself is an agent harness, not an SDK project. Spell the product `Typert`, never `TypeRT` or `typeRT`.

<a id="4-write-the-package-readme"></a>

## 4. Write the package README

Lead with the package-specific service API, configuration, events, extension points, and design notes. Choose the frontmatter `kind` from the four kind labels in the [dsh-doc metadata reference](../../.agents/skills/dsh-doc/references/metadata-links-i18n.md#the-kind-system) — group, reference, library, or bundle — so it matches the package's position in the repository and its entrypoint shape; each kind corresponds to exactly one README template. The limitations section records durable consumer-visible gaps and non-obvious maintainer constraints this package owns; routine cleanup items stay in a source TODO or an Agent Note. An indirect Model Experience statement may name the consumer that exposes this package's contribution, but must not restate that consumer's implementation. A package README ends with this canonical sequence:

````markdown
## Model Experience

### Request context and condition

#### What the model sees

The exact data-dependent fields, an anchored generated-catalog link, or an introduction to the verbatim literal below.

##### Verbatim text for this field, when needed

```markdown
Stable system-prompt prose of any length, or another long non-generated literal, copied exactly from source.
```

#### Token effect

Fixed, conditional, retained, replaced, capped, or zero-direct token effect.

#### KV Cache effect

Append-only, prefix-stable, replacing, or independent behavior, including the exact conditions that may invalidate reuse.

## Known Limitations and Deferred Work

- **Consumer-visible gap** — exact missing operation or case, its consequence, and any maintainer constraint.
````

Fill in Model Experience from the implementation. Use one H3 per direct, conditional, capped, lifecycle, or auxiliary model-context entry, with the three ordered H4 fields above and one body paragraph under each. Quote stable text the package owns: put system-prompt prose under the field that introduces it, shown as a titled H5 with a `markdown` fence, normally under `What the model sees`; inline other short text as a named placeholder, and use the same nested form for other long text. Only summarize data-dependent or provider-owned text. A tool schema entry links to the matching anchored section in the generated [tool catalog](../tool-catalog.zh.md) and states only the difference that is missing there. Separate prompt and schema when the scope can hide one without affecting the other. When filling in `KV Cache effect`, distinguish append-only growth, a stable repeated prefix, replacement of existing request tokens, and an independent model request, and list the changes this package owns that invalidate cache reuse. "Does not invalidate the cache" means only that this package preserves the existing reusable prefix; whether the cache is available and when it is evicted is not part of this package's contract. The [prose standard](../../.agents/skills/dsh-prose-standard/SKILL.md) governs completeness and ownership; the verifier enforces the required section structure.

A package with no context effect or with only consumer-owned paths uses the audited `None, as ` or `Indirectly, through ` statement in [`SENTENCE_MODEL_EXPERIENCE`](../../scripts/verify-package-readme-model-experience.ts), then adds a `KV Cache effect` H4 and a non-empty body paragraph; a general-purpose, model-independent package may instead add `NO_MODEL_EXPERIENCE_SECTION`. Neither case expands into a description of another package's work. The limitations [allowlist](../../scripts/verify-package-readme-limitations.ts) is managed separately. The [archived Model Experience Agent Note](../../.agents/notes/archived/process/2026-07-12-package-model-experience-contract.md) records the design rationale.

<a id="plugin-display-metadata"></a>

## 5. Add optional plugin display metadata

For an npm package plugin, define the title and description in `locale/en.json`. Other language files, such as `locale/zh.json`, use the same fields:

```json
{
  "meta": {
    "title": "Workspace Tools",
    "description": "Tools for your workspace."
  }
}
```

Merge the following entries into `package.json`, keeping the existing runtime exports and published files:

```json
{
  "exports": {
    "./package.json": "./package.json",
    "./locale/*.json": "./locale/*.json"
  },
  "files": ["locale/*.json"]
}
```

Keep language files together under `locale/` and keep `en.json` as the discovery entry. Fields are optional and must be non-empty strings when present. A missing file or field allows fallback; corrupt JSON or an invalid field produces a single-plugin diagnostic.

Each field falls back independently, and technical names are then formatted by the page's rules; fallback first goes through the existing locale language chain:

- Title: locale `meta.title` → `package.json.name` of the package root plugin → the full Cordis plugin name.
- Description: locale `meta.description` → `package.json.description` of the package root plugin → no description shown.

Export `<package-name>/locale/en.json` for locale lookup; when package-field fallback or a declared icon is needed, expose `<package-name>/package.json`. A subpath plugin such as `<package-name>/search` is not a package and never reads `package.json`, even if `./search/package.json` is exported; it supplies text through `./search/locale/*.json` and images through `./search/icon`.

To show an image in bundle cards, details, and component rows, the package root plugin sets `"icon": "./icon.svg"` at the top level of its export manifest, or exports `./icon` when the field is omitted. A subpath plugin exports its own icon, for example `"./search/icon": "./search.svg"`. Add every image to `files`. The manifest `icon` is relative to the manifest's directory; absolute paths, URLs, paths outside the directory, and symlinks resolving outside it are all rejected. Exported icons resolve through Node exports like locale resources and must live inside the owning package. SVG, PNG, JPEG (`.jpg`/`.jpeg`), and WebP files up to 256 KiB are supported. An image must be self-contained; SVG renders as an image, not as inline HTML. The Host returns a data URL and does not activate the plugin. When the declaration is invalid or a file is unreadable, show a metadata diagnostic and keep the valid text, without trying the exported icon; when an image is missing or cannot be decoded, use the panel's default illustration.

Cards and details for installed bundles, component lists and config details, and the plugin inventory in settings all show this metadata, including disabled plugins and plugins inside presets. Reading it does not activate a plugin.

Only the settings page strips the npm scope and the Cordis/DSH prefixes from literal package and module name fallback values; the plugin management page keeps the full name. Locale titles and descriptions stay as they are. When a plugin shows no description, a row config page may use the summary of a registered component.

The Install surface still uses the npm registry information returned by `pnpm view` and does not replace it with locale metadata.

Verify the result:

1. Run `pnpm run verify-package-meta` at the repository root to check fields, resource exports, and published-file coverage.
2. For an installed plugin, switch between English and Chinese on the applicable plugin management page and settings entry and check the title, the description, per-field fallback, and the technical short name that only the settings page uses.

## 6. Verify

```sh
pnpm install        # registers the workspace
pnpm run doc-sync
pnpm run constraints && pnpm run typecheck && pnpm run lint
pnpm run build && pnpm run hygiene
```

Follow the [repository testing policy](../testing.zh.md), run the behavior-specific checks a new package requires, and reach the corresponding coverage.
