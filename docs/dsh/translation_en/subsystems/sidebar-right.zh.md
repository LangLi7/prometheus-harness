# 右侧 Sidebar

[English](sidebar-right.md) | 中文

The right Sidebar is the Web Client's per-session docking surface: a column of panes and tabs beside the conversation in which addressed content — workspace files, directory trees, the product's own pages — opens, splits, floats, and closes. [`dsh-client-ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.zh.md) owns this surface, the tab-type registry, and the navigation service; [`dsh-client-ui-dockkit`](../../packages/client/ui-dockkit/README.zh.md) is its internal layout engine; [`dsh-client-resources`](../../packages/client/resources/README.zh.md) turns addresses into live data any component can read; [`dsh-api-workspace-files`](../../packages/api/workspace-files/README.zh.md) provides both the Host workspace file service and the Client `file` resource provider.

This page is the reference for the subsystem's contracts: addresses, tab-type registration, the navigation service, the extension slots and their owner props, the resource model, the Workspace Files service, the built-in types, and what is explicitly not done. How the layout engine, the frame, and the docking surface fit together is in the [Agent Note](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md); slot mechanics are in the [Slots reference](slots.zh.md).

## Position and ownership

Exactly one docking surface exists per session, kept in a session-scoped slot store and drawn by `rightbar.session`. The root-scoped `rightbar` controller keeps separate seats for the selected Session and for background Sessions with initialized `keepMounted` bodies; only the foreground Conversation is visible. A reload restores the saved layout ([state](../../packages/client/ui-sidebar-right/README.zh.md#state)). Every change to the surface is one history record computed by the kit's pure planners; a docked pane is never left empty, and an empty root pane receives the default page selected from the registered guide entries.

A tab type is two registrations that share the definition's `id`: a static definition in `ctx.sidebarRightTabs` stating which addresses its `kind` opens, and one keyed slot registration supplying its body. The framework injects `useTabInfo()` to read live Sidebar, pane, and tab information; each type keeps its own state in the slot store. Packages reference each other's declarations only as types.

| Package | Responsibility |
|---|---|
| [`client/ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.zh.md) | The panel and rail seats, the layout store, `ctx.sidebarRightTabs`, `ctx.sidebarRight`, the Tab domain, the guide type |
| [`client/ui-dockkit`](../../packages/client/ui-dockkit/README.zh.md) | Pure layout engine and React surface; an internal dependency of `ui-sidebar-right`, not a stable interface |
| [`client/resources`](../../packages/client/resources/README.zh.md) | `ctx.resources`, `useResource`, the protocol → value-type roster `ResourceProtocolMap` |
| [`api/workspace-files`](../../packages/api/workspace-files/README.zh.md) | Host `ctx.workspaceFiles`, the `workspaceFiles` Remote namespace, and the Client `file` resource provider |
| [`util/workspace-path`](../../packages/util/workspace-path/README.zh.md) | File address grammar: `fileAddressFor`, `parseFileAddress` |
| [`client/ui-sidebar-documentpreview`](../../packages/client/ui-sidebar-documentpreview/README.zh.md), [`client/ui-sidebar-files`](../../packages/client/ui-sidebar-files/README.zh.md), [`client/ui-sidebar-browser`](../../packages/client/ui-sidebar-browser/README.zh.md) | The built-in `text`, `files`, and `browser` types |

## Addresses

Every tab is opened by an address string, and the address is the tab's content identity. Addresses come in two families.

A **resource address** is a URL of the form `dsh-resource://<type>/…`. The host names the resource protocol — the key of `ResourceProtocolMap` — and everything after it is that protocol's own path; all protocols share one scheme, so adding a protocol adds a host, never a scheme. The `file` protocol's path opens with its scope: `session/<sessionId>` followed by the path relative to that session's workspace root (`dsh-resource://file/session/abc/src/notes.txt`), or `absolute` followed by the absolute path with its leading `/` removed (`dsh-resource://file/absolute/home/ys/notes.txt`, or `dsh-resource://file/absolute/C:/x/y.txt` on Windows). Every id and path segment is component-encoded, with `:` kept literal for drive letters. `fileAddressFor(sessionId, cwd, path)` builds one — a relative path or an absolute path inside the workspace becomes a `session`-relative address, any other absolute path becomes an `absolute` address — and `parseFileAddress(address)` reads the parts back or returns `undefined` ([grammar](../../packages/util/workspace-path/README.zh.md)).

A **page address** is what the Sidebar records for a tab opened by kind rather than by resource: `sidebar://<kind>`, written by the Sidebar itself when `openTab(kind)` runs. Callers never build one — the guide page and the file tree open as `openTab('guide')` and `openTab('files')` — and no other navigation address exists ([not built](#not-built)).

Tab identity is the pair `(kind, address)`: the registry's claim uses the address verbatim as the record's `contentId`, so the same address opened through the same type finds the existing tab, and the same address opened through two types is two tabs.

## Tab-type registration

`ctx.sidebarRightTabs.register(definition)` registers one implementation of a type for the caller's lifetime and returns the disposer; the caller holds it in its own `ctx.effect`, so an implementation lives exactly as long as the plugin that contributes it, and a second registration of the same `id` throws ([extension seats](../../packages/client/ui-sidebar-right/README.zh.md#extension-seats)). The definition is static: no runtime hook, nothing per tab or per session.

| Field | Meaning |
|---|---|
| `id` | The implementation's identity, unique across all registrations; a package name is the natural value (`@deepseek-ai/dsh-client-ui-sidebar-files`). The body and title seats register under it. |
| `kind` | The type's discriminator: what its tabs are, and what `openTab` names. Not unique — an extension may take over a builtin's kind. The built-in kinds are `guide`, `text`, and `files`. |
| `patterns` | Optional resource-address globs; a page type opened by kind omits them. A pattern containing `:` matches the whole address (`dsh-resource://file/**`); one without matches the URL's path part at any depth (`*.md`), and an address that is not a URL never matches such a pattern. Matching is case-insensitive and does not hide dotfiles; the syntax is picomatch's POSIX dialect. |
| `priority` | One of three literal bands: `extension` (the default and the highest: a type from outside the product outranks every built-in viewer), `builtin` (types shipped with the product), `fallback` (plain-content viewers that anything more specific should beat). |
| `canOpen(address)` | Optional synchronous veto applied to glob matches; it runs on every routing decision. |
| `title(address)` | The chip text, captured into the layout record when the tab opens and never rewritten afterwards. |
| `keepMounted` | Optional lazy retention of visited bodies across hiding, Session switches, and docking switches, with the owning View holding the Session reference. |
| `guide` | Optional entry boxes for the guide page: `{ order, title(), description?(), icon? }`. Picking a box opens the contributing type as a page; omit it to stay off the guide page. |

Routing is a ranked claim. `candidates(address)` ranks the types whose patterns match and that `canOpen` did not veto: first by band, then by the length of the longest matched pattern, and finally by registration order. `claim(address, kind?)` takes the first candidate, or the named `kind` directly — its globs are skipped, but `canOpen` still applies — and returns `{ kind, contentId: address, title }`. An address no type claims throws: this is a wiring error, not a user error.

One `kind` may carry one `builtin` and one `extension` registration at the same time. The extension is the one in force for claims, `get(kind)`, `openTab(kind)`, and the guide page, and the seat finds a tab's body and title under the `id` of the definition in force, so no slot priority is involved; when the extension unregisters, the builtin resumes. Any other collision on a kind, and any duplicate `id`, throws.

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

export const inject = ['sidebarRightTabs', 'slots']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: '@acme/dsh-client-ui-image',
    kind: 'image',
    patterns: ['*.png', '*.jpg', '*.gif', '*.svg'],
    canOpen: address => address.startsWith('dsh-resource://file/'),
    title: address => address.slice(address.lastIndexOf('/') + 1),
  }), 'image type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: '@acme/dsh-client-ui-image' },
    ImageBody,
  )), 'image body')
}
```

## Navigation: `ctx.sidebarRight`

Two open operations form the navigation controller, and every way into this column calls one of them: `openResource(address, options?)` opens a `dsh-resource://` address — the conversation's file links, a tool row's line reference, a file tree's rows; `openTab(kind, options?)` opens a page — the tab strip's add control, a guide entry box, or an HTTP(S) link in Assistant Markdown. Both walk four steps as one history record — claim (the registry ranks a resource's candidates, or the named `kind`'s implementation in force answers); focus a tab already showing the same `(kind, address)`; otherwise seat a new tab; expand the column — and then record the navigation in the Tab domain ([service](../../packages/client/ui-sidebar-right/README.zh.md#ctxsidebarright)). Content the user cannot see does not count as opened, so a collapsed column expands in the same step. `openResource` throws for an address outside `dsh-resource://` or one no type claims; `openTab` throws for a kind nothing registered: both are wiring errors, not user errors.

| Option | Meaning |
|---|---|
| `paneId` | Land the new tab in this pane; the default is the active docked pane (the first docked pane when the active one is a float). |
| `replaceTab` | Take this tab's pane and strip position and close it in the same step; a tab in a float yields no position, so the new tab lands as if unplaced. |
| `revealIfOpened` | Default `true`: a tab already showing the same `(kind, address)` is focused and receives `params`. `false` opens another one regardless. |
| `preferNewPane` | Prefer creating a new docked pane under the ordinary pane-count budget and space rules; fall back to the target pane when splitting is impossible. Ignored when used with `replaceTab`. |
| `kind` (`openResource` only) | Name the opening type instead of ranking candidates; that kind's implementation in force opens the address, and its `canOpen` still applies. |
| `params` | Navigation parameters for the body, delivered as `navigation.params`. `openResource` types them by resource type through the declaration-merged `SidebarRightResourceParamsMap` (the text preview declares `{ line?: number }`); `openTab<K>` types them by kind through `SidebarRightTabParamsMap`, `undefined` for a kind that declares none; a body reads the union of both, `SidebarRightNavigationParams`. Values are JSON-shaped by convention and are not validated at run time. |

Placement is the caller's option, never a type's property. The conversation area calls `openResource(fileAddressFor(sessionId, cwd, path))`, and a `read` tool row additionally passes `{ params: { line } }` (from the call's 1-based `offset`); a guide page entry box calls `tab.actions.openTab(entry.kind, { replaceTab: true })`; a file tree row calls `tab.actions.openResource(address)`; the tab strip's add control calls `openTab('guide', { paneId, revealIfOpened: false })`.

`close(tabId)` closes a tab; `active()` returns the active pane's active tab; `isExpanded()` and `toggleExpanded()` read and flip the column, with the flip recorded in the sequence. With no session, reads return `undefined` or `false`; writes require a mounted session surface and throw without one rather than write into a surface nobody draws.

`focus(tabId)` makes a tab its pane's active tab; `split(paneId?)` splits the active docked pane or the named one and returns the new pane's id — or `undefined` without recording anything when the pane-count budget or the column width forbids a split; `float(tabId, rect?)` floats a tab out into a floating pane; `dock(paneId)` returns a floating pane to the docked area. All four go through the store's existing actions and each records one history entry; a target that does not exist or is already in the requested state is a no-op, and like `open` they throw when no session surface is mounted. `TabId`, `PaneId`, `TabRecord`, and `FloatRect` are re-exported from this package's `/client` entry, so callers need not import dockkit.

`focusedTarget(element?)` captures the visible page under live DOM focus, including an embedded iframe; sidebar markup outside the sidebar or stale markup yields no target. `commandTarget(element?)` also allows an open initiated outside the sidebar to use the mounted Session's active docked pane. A `SidebarRightTarget` captures the Session, pane, host, tab occurrence, and navigation revision. `isTargetCurrent(target)` checks that identity before execution, so reopening a record or navigating it again invalidates a captured action; it never retargets to another page. See the [controller methods](../../packages/client/ui-sidebar-right/src/client/service.ts) for close and placement outcomes.

## Slots and owner props

The Sidebar declares four extension slots; its document tab additionally declares the keyed document body slot in the table below ([hierarchy](slots.zh.md)).

| Slot | Cardinality | Purpose |
|---|---|---|
| `sidebar.right.pane.tab` | keyed by the definition's `id`, session scope | One tab's body. The seat dispatches a tab to the `id` of its kind's implementation in force, so the registrant receives every tab of that kind, docked or floating. A kind whose implementation registered no body renders the owner's "cannot view this content" notice. |
| `sidebar.right.pane.tab.title` | keyed by the definition's `id`, session scope | The chip's title, with the same owner share as the body. Optional: without an entry the chip shows the `title(address)` text captured at open time; a type with a live title reads its own store here. |
| `sidebar.right.tab.guide` | chain, session scope | Replaces the guide tab's contents without replacing the tab; the first entry that does not decline takes the body, otherwise the built-in guide renders. |
| `sidebar.right.tab.menu.item` | list, session scope | Content-level actions appended after the kit's own layout actions. An entry that performs an action must call the owner's `dismiss()`. |
| `sidebar.right.tab.document` | keyed by the document implementation's `id`, session scope | The file renderer selected inside the document tab; the parent owns the shared loading and toolbar controls. |

A body, title, and guide replacement receive the framework-injected `useTabInfo()`. It returns `{ sidebar, panel, tab }`: `sidebar` contains `expanded` and `fullscreen`, `panel.id` identifies the containing pane, and `tab` contains its record fields plus `visible`, `navigation`, `signal`, and `actions`. All tabs require the Session to be in the foreground. Docked bodies also require expansion and selection; docked titles require expansion; foreground floats do not collapse with the whole column. `signal` aborts when the record disappears or the plugin unloads, not when it is hidden or the Session switches. `tab.actions` provides `openResource`, `openTab`, and `close`, bound to the tab's own Session. The open placement defaults to its current pane; `revealIfOpened` defaults to `true`, and `replaceTab: true` replaces this record in the same history entry. Menu entries keep the ordinary `tab` and `dismiss` owner parameters.

`navigation.revision` increments on every navigation to that tab, including when `params` did not change, so a body can act on "navigated again" alone; it is `1` for a tab opened by address and `0` for a record nobody opened by address — a seeded guide, or a tab restored by undo. The Tab domain keeps one occurrence per open record: once a record appears it is pinned in the resource model, so switching tabs unmounts a body without losing its content; a record that disappears is aborted and dropped; a record restored by undo is a new occurrence ([Tab domain](../../packages/client/ui-sidebar-right/README.zh.md#the-tab-domain)).

`tab.actions.bindCommands(commands)` provides `SidebarRightTabCommands`, currently an optional `refresh` callback, for the mounted body. Omitted operations are unavailable; the returned disposer releases this registration without removing a newer body's commands. The tab's lifetime ending also releases these commands. `tab.refreshShortcut` provides the effective refresh catalog entry for page controls; the field may be omitted when no entry is available. These fields are declared in the [slot owner types](../../packages/client/ui-sidebar-right/src/client/contract/slots.ts).

## Document renderers

The `text` tab is the shared Document Preview owner. Its [root registration](../../packages/client/ui-sidebar-documentpreview/src/client/index.ts) declares `sidebar.right.tab.document` and provides `ctx.documentPreviews`. A renderer registers `DocumentPreviewDefinition` metadata in its own effect, then waits for the slot through `ctx.slots.inject('sidebar.right.tab.document', ...)` and registers its component with `key: definition.id` and its own locale namespace. A renderer registers its own body and can reuse the shared presentation through child slots. Changing the renderer does not change the tab or the resource address; the [extension decision](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.zh.md) separates preview policy from resource ownership.

The [registry](../../packages/client/ui-sidebar-documentpreview/src/client/document/registry.ts) records a unique `id`, `extensions`, a localized `title()`, `loading`, and optional `priority` and `wrap`. Case-insensitive suffix matching ranks `extension` (the default) before `builtin`, then compares suffix length (longer first) and registration order. Unlike tab-kind replacement, the registry keeps all implementations; the toolbar lists the matching candidates and remembers the selection per tab. Unknown extensions use plain text. Suffixes declared in `binaryExtensions` get no plain-text alternative, as described in the [package README](../../packages/client/ui-sidebar-documentpreview/README.zh.md#what-it-registers). `loading` is `text-pages`, `bytes-complete`, or `renderer`; `wrap` declares whether the shared source wrap control is supported.

[`DocumentPreviewProps`](../../packages/client/ui-sidebar-documentpreview/src/client/document/contract.ts) derives from `PropsRuntime<'sidebar.right.tab.document'>`. The owner provides the original `resourceAddress`, `content`, the current `wrap`, and the dependency-declaring `addResource` / `setResources` callbacks: text content is `{ kind: 'text', text, pages: [{ offset, text, lines }], eof }`, where `text` is the accumulated text; complete bytes are `{ kind: 'bytes', data }`, where `data` is `Uint8Array<ArrayBuffer>`. These transient buffers are borrowed read-only and must not enter durable layout or Session JSON. PDF copies the bytes before transferring them to the Worker, preserving the owner's buffer. The child receives the same framework-bound `useTabInfo`, plus the globally shared, metadata-only `useResource`. The parent reads text through `remote.workspaceFiles.read` and bytes through `remote.workspaceFiles.readBytes`, and owns page appends, per-tab refresh, and loading status. HTML passes `baseFile` to the same byte reader; paths are resolved by Host code. Markdown and code keep the same incremental renderer across appends and finalize at EOF; HTML and PDF receive complete bytes.

Preview records the loaded version and the version observed when a read started. Automatic refresh is on by default; a member's first metadata only establishes the baseline, and later changes reload the tab. A refresh rereads only the current tab and does not change shared metadata or another tab's content. Reads are not transactional; versions are opaque equality tokens, not sortable timestamps ([resource observation and Preview RPC](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.zh.md)).

A renderer that loads itself receives `{ kind: 'renderer', revision, loaded, failed, reload }` instead of file bytes. The body invokes its own injected face, cancels the request on revision changes and unmount, and reports the source version it displayed through `loaded(version)`. A failed load calls `failed()` so that a later file change can trigger a retry. The parent ignores stale reports and keeps the shared reload and source-change controls. Office uses this mode to request [Host-rendered PDFs](office-to-pdf.zh.md); its face writes converted bytes, font metadata, and failures to its own store, while the body renders a nested PDF view. `OfficeFontAction` shows the missing-font warning before the reload button through `sidebar.right.tab.document.action`. The [package README](../../packages/client/ui-sidebar-documentpreview/README.zh.md#what-it-registers) defines the loading lifecycle.

## Resource model

The model itself is in [Client Resources](client-resources.zh.md); this section covers only what the Sidebar relies on. A resource is one address, and a resource address is a URL of the form `dsh-resource://<type>/…`, whose lower-cased host is the protocol key. The client package owning the protocol registers exactly one provider with `ctx.resources.register(provider)` for its own lifetime; a second provider for the same protocol throws ([provide a protocol](../../packages/client/resources/README.zh.md#provide-a-protocol)). A provider is `{ protocol, open(address, { signal }) }`: `open` yields `RemoteResult` frames — the current state first, then one frame per change — and stops when `signal` aborts; a failure is an `{ ok: false, error }` frame rather than a throw, and anything thrown inside the stream is a programming error the model does not catch.

`useResource<P>(address)` is a global standard prop on every slot component, whatever its scope. It returns `{ status, value, failure }`: `none` when the address's protocol has no provider or the address is not a resource address (`sidebar://guide` points at no resource), `loading` before the first frame, `live` carrying the latest `ok` value, and `failed` carrying the latest frame's failure beside the last value. ([read a resource](../../packages/client/resources/README.zh.md#read-a-resource)).

A resource stays open as long as it has a holder — a subscribed `useResource` or a `ctx.resources.pin(address, signal)`; the first holder opens the provider's stream, later holders share it and immediately read the latest value, and the last release aborts the stream and discards the value. Streams push metadata, not content: the `file` value is `{ absolutePath, version, bytes? }`, and a consumer reads file text itself, page by page, through the Workspace Files service ([lifecycle](../../packages/client/resources/README.zh.md#lifecycle)).

## Workspace Files

The Host's `ctx.workspaceFiles` service and the generated `workspaceFiles` Remote namespace read files the Session filesystem backend allows: `stat(path)` returns `{ absolutePath, version, bytes? }`; `read(path, { offset?, limit? })` returns one page of lines (`offset` 1-based, `limit` bounded by the configured page size) shaped as `{ …stat, offset, text, eof }`; `readBytes(path, { range?, baseFile? })` returns a complete file within `maxFileBytes` or a byte window within `maxBytes`, shaped as `{ …stat, offset, data, eof }`, where `data` is a native `Uint8Array`. The optional `range` uses a 0-based `offset` and a byte `length`; `baseFile` resolves the relative target from the directory of another file. `list(path)` stays inside the workspace root and returns a directory's direct children (`name`, `type: 'file' | 'directory' | 'other'`, `size?`), truncated to the configured cap with `truncated` set. `changes(path)` watches one target; the Host determines the target type and confines directories to the workspace. After the subscription is ready it yields `{ kind: 'ready' }`, then `{ kind: 'change', change }` frames whose payload is `{ absolutePath, version }` or `{ absolutePath, absent: true }` ([README](../../packages/api/workspace-files/README.zh.md#use-this-package)). File reads reject trailing symlinks and enforce transfer caps; `read` additionally requires UTF-8 text. Failures use `workspace-file/*` error codes ([failures](../../packages/api/workspace-files/README.zh.md)).

[`dsh-api-workspace-files`](../../packages/api/workspace-files/README.zh.md) registers the `file` provider, with `ResourceProtocolMap.file` being `WorkspaceFileStat` directly. A Session address carries the authorizing Session and a relative or absolute path, which the Host receives verbatim and resolves. The provider waits for the Host's `ready` frame before stat, and filters changes by `stat.absolutePath`. Bare `absolute` addresses have no authorizing Session, fail with `workspace-file/unknown-workspace`, and do not borrow the current or Tab Session. Any UI (including Global) that accesses the same complete address shares the observation. Preview's Remote callbacks use the Session in the address; `remote.workspaceFiles.readBytes` returns native bytes through Connection's binary RPC transport.

## Built-in types

- **`guide`** — `builtin`, opened as `openTab('guide')`. A muted compass sits above one capsule per contributed `guide` entry, ordered by `order`; with few entries the registered descriptions are shown, and entries without an icon all use the built-in placeholder. Picking a capsule opens the contributing type as a page in the guide tab's place. Each pane holds at most one guide tab, and the tab strip's add control appears only while this pane has none. A new pane uses the registered default page: the sole guide entry directly when there is exactly one, otherwise the guide page ([guide](../../packages/client/ui-sidebar-right/README.zh.md#the-guide)).
- **`text`** — `fallback`, `dsh-resource://file/**`, claiming Session addresses only. Document Preview observes metadata through `useResource<'file'>`, loads content through Remote callbacks, and owns renderer selection, the toolbar, per-tab refresh, scrolling, and source navigation; unknown extensions render as plain text ([README](../../packages/client/ui-sidebar-documentpreview/README.zh.md)).
- **`files`** — `builtin`, opened as `openTab('files')`. The workspace directory tree, loaded lazily through `list` and watched per expanded directory, opening a file with `tab.actions.openResource(fileAddressFor(sessionId, root, path))` in its own pane ([README](../../packages/client/ui-sidebar-files/README.zh.md)).
- **`browser`** — multi-instance `builtin`, opened as `openTab('browser', { params: { url? } })`. Chat's [link preference](../../packages/client/ui-chat/README.zh.md) decides whether Assistant Markdown opens HTTP(S) links here. It accepts public and loopback HTTP(S) targets under the default sandbox, redirects local files to Document Preview, and uses application-known iframe history ([README](../../packages/client/ui-sidebar-browser/README.zh.md)).
- **`subagentchat`** — `builtin`, `dsh-resource://subagentchat/session/<child>?parent=<parent>&mode=<mode>`. The resource provider retains one explicitly addressed subagent Conversation and renders it through the shared Conversation Factory ([README](../../packages/client/ui-subagent/README.zh.md)).

<a id="not-built"></a>
## Not done

- Persistence: layout state is memory-only; after a reload every session starts collapsed, and no session's tabs appear in another session.
- A read-only layout snapshot or subscription on `ctx.sidebarRight`: the service exposes operations only, and dockkit's `LayoutState`/`LayoutOp` are internal.
- A capability-discovery array (`features`) on the service.
- An `option` priority band for tab types: nothing lists a tab type while forbidding it to claim.
- Rewriting a record's title: `title(address)` is captured once; a live chip comes from the title slot, not from the record.
- Naming a tab implementation when opening: `openResource` names at most a kind; the document renderer is chosen by the file tab's toolbar.
- An address lookup (`find`) on the service: callers open with `revealIfOpened` and let the docking surface de-duplicate.
- Navigation addresses beyond the Sidebar's own `sidebar://<kind>` bookkeeping; their grammar waits until the navigation controller is built as a whole.
- User-facing undo and a general cross-type content navigation stack ([deferred](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md#deferred)); Browser owns only its own page history.
