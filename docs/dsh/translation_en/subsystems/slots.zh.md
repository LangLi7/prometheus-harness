# Web Client Slots

[English](slots.md) | 中文

Slots are the Web Client's typed React composition system. [`dsh-client-ui-slots`](../../packages/client/ui-slots/README.zh.md) defines the React-free registry and type algebra; [`dsh-client-ui-renderer`](../../packages/client/ui-renderer/README.zh.md) binds observable sources into hooks, renders the whole tree, and internally owns the React context. Feature plugins contribute UI through `ctx.slots.register()` and never import another feature plugin's component.

This page documents slot ownership, component inputs, the extension API, and the current hierarchy. The surrounding boot, Remote, Client model, and Conversation data paths are in [Web Client architecture](web-client.zh.md).

`plugins.bundle.config` provides Bundle detail configuration keyed by npm package name. `plugins.bundle.activation` renders optional guidance after explicit user enablement, with the owner providing callbacks to dismiss the guidance and to open that Bundle's details. `conversation.input.activity` provides a single activity control between the model selector and the send button, which can expand a toolbar and releases the expanded state on unmount.

The plugin catalog declares `plugins.add.actions`, a root-scoped list that provides `MenuItemButton` rows after the install entry in the add-plugin menu. The owner provides `onDismiss()`, used to close the menu before an action starts. This slot follows the lifecycle of the owning plugins page declaration.

## Declaration and lifecycle

`SlotMap` is the compile-time registry. A package writes the key, cardinality, scope, owner props, keyed props, and optional slot-level inject face through declaration merging. The runtime declaration is the corresponding entry the component owning that render location gives in `children`.

Declaring a child has three effects at once: it makes that child key live, authorizes the parent entry to call `renderSlot` or `renderSlotChain`, and records the runtime dispatch specification. Each declaration can have only one live owner. Registering into an undeclared slot, or declaring a child already owned by another entry, fails during plugin activation.

`root` is the only built-in declaration and the only key rendered by the Cordis service itself. `ui-renderer` calls `ctx.slots.renderSlot('root', {})`; every other descendant is rendered through the `renderSlot` or `renderSlotChain` prop the entry that declared it receives.

Registrations and declarations follow Cordis effect lifetimes. Disposing an entry removes its contribution and recursively collapses the child slots it declared. To contribute functionality into another package's slot, therefore, use `ctx.slots.inject(key, callback)`: the callback runs within each declaration lifetime, its effects are removed when the owner collapses, and it runs again when the owner is mounted again.

```tsx ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

type HeaderActionProps = PropsRuntime<'conversation.session.header.actions'>

function HeaderAction({ useSession }: HeaderActionProps) {
  const running = useSession(snapshot => snapshot.running)
  return <button disabled={running}>Review</button>
}

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'review',
      order: 100,
    }, HeaderAction))
}
```

## Cardinality and scope

A slot declaration fixes two mutually independent axes.

| Axis | Value | Meaning |
|---|---|---|
| cardinality | `single` | A single cell, rendering the current priority winner; when parallel content is needed, declare a child slot instead of treating it as a list. |
| cardinality | `list` | Cells are addressed by the required `id`, ordered first by `order` and then by registration order. |
| cardinality | `keyed` | The owner passes an `entryKey`; the matching cell renders with the props for that key. |
| cardinality | `chain` | Each entry provides a pure `select(owner)` function; the first non-null result in priority order is selected and passed to the component as `matched`; when all decline, the owner fallback renders. |
| scope | `root` | One root-scoped component and store instance. |
| scope | `session-maybe` | Inherits the surrounding Provider binding but stays renderable without one; Session values are optional. |
| scope | `session` | Requires a resolvable surrounding Provider binding and receives Session values that definitely exist. |

For `single`, `list`, and `keyed` cells, `priority` is a shadowing rank; for `chain`, it is the election order. Smaller values run or render first. Ordinary additive contributions should choose a fresh list `id` or keyed `key`; reusing an existing cell means intentionally replacing its presentation.

## Component inputs

A registered component receives the assembled inputs at its binding location. Components should derive props from these types rather than re-copying the members.

| Input | Declared by | Component type |
|---|---|---|
| owner values and standard scope values | the `SlotMap` entry and installed scope adapters | `PropsRuntime<K>` |
| authorized child renderers | the registration's `children` keys | `PropsRenderSlots<S>` |
| selector hook and mutation callbacks for shared view state | the registration's `store` | `PropsStore<H>` |
| private data, callbacks, and observable hooks | the registration's `inject` factory | `InjectFace<I>` |
| localized `t` function | the registration's `locale` namespace | `PropsLocale<N>` |
| the value selected by the chain | the registration's `select` result | `matched` provided through `ComposedProps` |

When an entry declares a `session` or `session-maybe` child, `PropsRenderSlots` also provides `SessionProvider`. Without a `session` prop it inherits the surrounding binding; an explicit `SessionReference` or `undefined` overrides only that subtree. The Provider does not set a key for the whole body. A strict `session` entry remounts when its binding generation changes. A blank `session-maybe` entry accepts the first binding without remounting, and remounts only on a later generation change or a return to the absent state.

Components never receive `ctx`. Values the parent already knows at one render enter through the owner argument of `renderSlot`; shared view state uses a declared store; services and model objects stay in the `apply` closure and project only callbacks or observable sources into components.

## Framework-provided hooks

The adapters in the current composition add the following standard props. They are provided according to the target slot's scope, regardless of which package the registered component comes from.

| Availability | Props | Owner |
|---|---|---|
| all scope | `useSessions`, `useSessionStatus`, `useSessionRetainInfo` | `ui-session` |
| all scope | `useWorkspaces` | `ui-workspace` |
| all scopes | `usePanelInfo` | `ui-layout` |
| `session` | `sessionId`, `useSession`, `useProjection` | `ui-session` |
| `session-maybe` | `sessionId`, `useSession`, `useProjection` with optional results | `ui-session` |
| `session` | `useConversation`, `useInput`, `inputActions` | `ui-conversation` |
| `session-maybe` | `useConversation`, `useInput`, `inputActions` with optional results | `ui-conversation` |
| `session` | `useChat` | `ui-chat` |
| `session` | `useTrajectory` | `ui-trajectory` |

The Renderer also creates `useStore` from a declared store, and `t` from a declared locale namespace. These are props derived from the registration, not global standard props.

Framework and domain adapter owners may extend the standard set through `ctx.slots.provideRoot()` or `ctx.uiSession.provide()`, supplying the corresponding `GlobalStandardProps`, `SessionStandardProps`, or `SessionMaybeStandardProps` declaration merge at the same time. An ordinary feature component should not create a React hook prop itself, nor add a global standard prop for entry-private data.

## Developer-provided injection

The `inject` option on a registration is the usual feature-private injection point. Its factory runs in the plugin's `apply` world, may close over already-injected Cordis services, and returns only the data and callbacks the component needs. For a `session` slot it receives `sessionId`; for `session-maybe` it receives `sessionId | undefined`; once a store is declared it also receives that store's bound actions.

The reserved `hooks` object in the return value accepts bare `getSnapshot`/`subscribe` sources. The Renderer converts `hooks: { status }` into the component prop `useStatus(selector)` and caches the binding by source identity. Components do not receive the source itself and do not call `useSyncExternalStore` directly.

When every occupant needs the same capability, the slot owner may place an `inject` face in the child declaration. Plain members are passed unchanged to all occupants; function members in its `hooks` object are hook factories, which receive the slot's standard props and an optional per-render `hookContext`, and then return the constrained hook provided to the occupant. `conversation.chat.node` uses exactly this mechanism to provide `useTurnData(key)` for the node currently being rendered.

Values the owner already knows at one render go through owner props; the callbacks and private observables of a single entry go through the registration's `inject`; a capability controlled by the slot owner and shared by all occupants goes through slot-level `inject`; mutable view state that must be shared across entries or preserved across remounts goes through a declared store. React nodes compose through child slots, not through injected values.

## Current hierarchy

The figure below is the declaration tree of the current shipped composition. A child exists only while its named parent entry is mounted; an optional feature entry can therefore make an entire subtree appear or disappear as one lifecycle unit.

```text
root
├─ sidebar
│  ├─ sidebar.brand.mark
│  ├─ sidebar.brand.name
│  ├─ sidebar.panellist
│  ├─ sidebar.footer.action
│  ├─ sidebar.workspaces
│  │  ├─ sidebar.workspaces.directoryFlow
│  │  ├─ sidebar.workspaces.session.menu.item
│  │  └─ sidebar.workspaces.session.row.action
│  └─ sidebar.settings
│     ├─ settings.trigger
│     ├─ settings.header
│     ├─ settings.action
│     ├─ settings.close
│     ├─ settings.onboarding
│     └─ settings.section
│        ├─ settings.general.item
│        ├─ settings.models.provider-card
│        ├─ settings.models.footer
│        └─ settings.plugins.tab
├─ main
│  ├─ plugins.add.actions
│  ├─ plugins.item
│  ├─ plugins.bundle.config
│  ├─ plugins.row.config
│  ├─ plugins.detail.actions
│  ├─ plugins.detail.badge
│  ├─ plugins.detail.section
│  └─ main.conversation
│     ├─ conversation.session
│     │  └─ conversation.view
│     │     ├─ conversation.chat.flow
│     │     │  ├─ conversation.chat.node
│     │     │  │  ├─ conversation.chat.assistant-actions
│     │     │  │  ├─ conversation.chat.reasoning.body
│     │     │  │  ├─ conversation.chat.commandview
│     │     │  │  ├─ conversation.chat.turnTail
│     │     │  │  └─ tool.call.toolview
│     │     │  │     ├─ tool.call.images
│     │     │  │     └─ tool.view.cordis
│     │     │  └─ conversation.message.images
│     │     └─ conversation.trajectory.images
│     ├─ conversation.header
│     │  ├─ conversation.header.leading
│     │  └─ conversation.session.header
│     │     ├─ conversation.session.header.lineage
│     │     ├─ conversation.session.header.actions
│     │     ├─ conversation.session.header.utilities
│     │     └─ conversation.session.header.corner
│     ├─ conversation.composer
│     │  ├─ conversation.approval.detail
│     │  └─ conversation.plan-review.actions
│     ├─ conversation.composer.bar
│     │  ├─ conversation.input.attachments
│     │  ├─ conversation.input.permission
│     │  ├─ conversation.input.plan
│     │  └─ conversation.input.model
│     ├─ conversation.input.overlay
│     ├─ conversation.input.dock
│     ├─ conversation.composer.dock
│     ├─ conversation.input.left
│     ├─ conversation.input.right
│     ├─ conversation.hero.brand.mark
│     ├─ conversation.hero.workspace
│     │  └─ conversation.hero.workspace.directoryFlow
│     └─ conversation.hero.agentPreset
├─ rightbar
│  └─ rightbar.session
│     ├─ sidebar.right.pane.tab
│     │  ├─ sidebar.right.tab.guide
│     │  └─ sidebar.right.tab.guide.entry
│     ├─ sidebar.right.pane.tab.title
│     └─ sidebar.right.tab.menu.item
├─ shell.bottom
├─ shell.leading
└─ shell.overlay
   └─ shell.quota-notice
```

The generated Client inspect catalog is the complete reference for each key: cardinality, scope, owner props, standard props, current occupants, declaring owner, and replacement risk. A running dynamic package can query the live tree and one exact key with `cordis_inspect what:"client"`; the source catalog is generated from `SlotMap` declarations and `slots.register()` call sites by `pnpm run gen-client-catalog`.

## Extension rules

- Import another feature package only for declarations, through `import type`; never import or re-export its runtime values.
- Declare a new child slot only in the component that owns and renders that location. Other packages wait through `ctx.slots.inject()` and then contribute through `ctx.slots.register()`.
- Keep business and transport state in the owning Cordis service or Client model. A slot store carries only shared view and interaction state.
- Keep observable sources and their snapshot identities stable until the value changes; publish through the same source whenever the value changes.
- Pass only JSON-compatible data and callbacks between UI domains. The `hooks` compartment is the sole exception for bare observables; React content travels through slots.
- Treat `single` and a keyed cell that already has an occupant as replacement points. Use a list id or an unoccupied key for additive extensions.
