# Conversation assembly

[English](conversation.md) | 中文

Conversation is the target-neutral assembly layer between the Client's `SessionEventLikeEntry` window and browser views. [`ui-conversation`](../../packages/client/ui-conversation/README.zh.md) owns the event and view registries, one identity-stable binding per `SessionBinding`, Turn/Step Location, incremental Context assembly, target sources, the shared shell, and input orchestration. Target packages such as [`ui-chat`](../../packages/client/ui-chat/README.zh.md) and [`ui-trajectory`](../../packages/client/ui-trajectory/README.zh.md) own their own Definitions, final snapshots, and rendering.

This page defines the data model and the extension path for business-owned Conversation nodes. [Web Client architecture](web-client.zh.md) explains where this subsystem sits between the Client model and Slots; the [Conversation Node assembly decision](../../.agents/notes/implemented/architecture/2026-08-09-client-conversation-node-assembly.zh.md) records its rationale.

## Data model and ownership

The Session Controller owns the contiguous loaded logical event window. Every `SessionEventLikeEntry` is either `{ type: 'event', event: SessionEvent }`, representing one durable event, or `{ type: 'transient', event: AssistantLiveChunkEvent }`, representing one Client-only `assistant/live-chunk` presentation; both inner events expose `type`, `seq`, `time`, and `data`. `ui-conversation` hands these entries straight to the assembler and opens no separate history stream. Each Session has one `ConversationNodeAssembler` that applies every registered Definition and publishes an independent source per registered view target.

| Concept | Owner and purpose |
|---|---|
| Event Definition | A business package matches one durable or Client-only transient event at a time, correlates input by a stable `(kind, id)`, folds deterministic State, and may materialize one target node. |
| Context | The ordered Matches and current State the Engine owns for one `(kind, id)`. Durable and transient events can both serve as a start. The earliest current start initializes State and later Matches update it. While only update evidence exists, the Context stays pending until its start loads. |
| Location | The Session, Turn, or Step coordinate the Engine derives from durable boundary events. A Definition can publish typed data onto one Turn or Step. |
| View Definition | A target package creates one incremental builder per Session and owns that target's final snapshot type. |
| Group Definition | A business package derives one target's root references and group snapshots from materialized Nodes, owning member attribution, segmentation, summaries, and incremental caches. |
| View | A Slot entry such as Chat or Trajectory reads only its own target snapshot and renders target-owned nodes. |

Chat and Trajectory can recognize the same durable event family while keeping their own Definition State and final node payload. The shared target-neutral mechanism covers only identity routing, ordered replay, Location data, predecessor dependency, and publication cadence.

## Target activation

Every Session keeps a monotonically growing set of active targets. Creating or reading a target source does not activate it. The shell explicitly activates a persisted or newly selected View, while other consumers activate a target through the target source's first subscription. First activation creates that target's builder and calls `replace()` once from the current target-indexed Context. Later flushes call `apply()` for every active target, and unsubscribing does not remove a target.

The shell owns View selection and, when a binding is created, made current, or the View roster changes, resolves the registered preferred View or the Chat fallback before rendering. The assembler receives only the resolved target id and never picks Chat or another default target itself. Third-party Views use the same selection and activation operations. A View Definition can provide `toolCallFocus(callId)`; the shell offers Inspect only for declared, visible targets that have this capability, and the target maps the call id to its own focus identity.

<a id="group-definitions"></a>
## Group Definitions

The optional `ctx.uiConversation.groups.register(definition)` contribution reuses the effect lifetime of event and view registration. It requires an existing View target, rejects a duplicate target registration, and constructs no Builder. Each Session creates its own Group context only when the target is active. A registration replacement discards the old context through the existing registration rebuild flow and clears the groups it observed.

[Group types](../../packages/client/ui-conversation/src/client/contract/groups.ts) define the complete protocol:

| Type | Meaning |
|---|---|
| `ConversationGroupDefinition<Node, State, Data>` | `create()` initializes State inside the Session; `update(context, input)` returns the next State; `buildGroups(context)` returns the output to publish or `null`. A replacement input requires output entries and a complete group replacement. |
| `ConversationGroupInput<Node>` | `replace` supplies target order, the timeline, and synchronous `readNode`, `readTurn`, and `readPosition` readers. `apply` adds projected `previous`/`current` node changes plus the lifecycle `changedTurns` and `changedTurnOrders`. Do not keep readers in State. |
| `GroupNodePosition` | The containing Turn, if any, and the visible Node keys immediately before and after. Adjacency preserves separators that keying by Turn alone would miss. |
| `NodeReference` / `GroupReference` | Branded `NodeKey` or `GroupKey` distinguished by `kind`. A Node reference may carry a renderer-owned `groupPart`; omission means the whole Node. |
| `GroupSnapshot<Data>` | Immutable group key, business data, and ordered Node references. A Group contains no other Group and owns no original Node data. |
| `GroupUpdate<Data>` | `entries` replaces the complete root sequence, and only an apply input may omit it to keep the original sequence. A replacement input must supply both `entries` and `groups.replace`. `groups.replace.snapshots` replaces all groups; `groups.apply.upserts/removes` updates only the named group records. Removing a group does not remove Nodes. |
| `ConversationGroupDataMap` | Associates targets with data types through declaration merging, shared by registration and `views.grouped(target)`. An undeclared target has no group payload type. |
| `ConversationGroupedView<Data>` | Stable root `entries` plus a by-key `groupSource(key)` reader; a removed group returns `undefined`. |

A Builder that registers groups must provide `groupInput()`; a missing input method throws on first activation. It records its own projected node values and preserves ordered array identity when only the body updates. The assembler supplies the changed turns on every update, and callers that invoke an ungrouped Builder directly may omit them. A Builder with an independent source defers notification until `publish()`. First activation and an ordinary flush share one order: materialize Location data and Nodes, update Builders, call Group Definitions, validate and install groups, then publish every affected target and Location source. The group phase reuses the existing publication cadence.

The target position index supplies these readers and identifies the Turns whose visible keys or adjacency changed. `changedTurnOrders` contains the old and new containing turns of a moved Node, plus the turns affected by inserting or removing an adjacent out-of-turn Node; lifecycle-only changes still come from `changedTurns`. A business Definition may regroup only these turns and refresh only the groups containing changed content. Structural output still replaces the complete root reference array without re-reading unchanged Node content.

Group storage validates the complete commit before installation: root Group references correspond one-to-one with records, every referenced Node exists, and each `(NodeKey, groupPart)` occupies at most one position across root and member positions. A whole Node cannot coexist with any of its own parts. A duplicate upsert, a duplicate removal, and an upsert and removal of the same group in one update all throw. A data-only upsert preserves the root and member arrays, reads no Node, and notifies only the changed groups' sources; a full replacement revalidates every reference.

Renderers switch on the two reference kinds, with the containing View choosing the component rather than a renderer field in the group data. Root Node references plus the members of referenced groups form the complete render list; a target Node that no group references stays in storage but is not rendered. Group bodies read member and summary data separately. The presentation mode must preserve component types, keys, and member parents; when business data changes member attribution, moved members can remount normally. The framework does not interpret partial-content completeness, segmentation, or presentation policy.

## Replayable event families

Choose a stable business id before writing a Definition. Every event composing one Node must carry that id, or derive it independently from its own payload alone; the Client must never guess that an update belongs to "the most recent unfinished" Context.

Taking a review job as an example, the event contract could be:

| Event | Role | Facts that must be durable |
|---|---|---|
| `review/start` | Sole start | `reviewId`, Turn/Step coordinates, title |
| `review/progress` | update | Same `reviewId`, coordinates, replayable progress |
| `review/end` | update | Same `reviewId`, coordinates, final summary |

Across a process boundary, use a producer-owned branded id type. Keep the `SessionEventMap` merge and the payload types in the producer's pure type exports, and have the Client package import that export through a type-only side-effect import. A `(kind, id)` may have at most one start event. A single-event business can use the event's own stable identity (for example `event.seq`) as the Definition-internal id.

The system supports incremental events. When a producer can emit a whole-value checkpoint cheaply, prefer that, because it still works directly when the start lies outside the loaded window. Every delta must carry a stable id and produce State deterministically when replayed in ascending log `seq` order; it must not depend on state that exists only in live memory. When the current history window holds only updates, the Assembler retains a pending Context and constructs no State until earlier pagination supplies the start. When a product must render before the start is loaded, terminal or checkpoint events must carry enough complete fallback state for the Definition to construct the result directly; do not recover it by scanning unrelated events.

Live Assistant deltas arrive as Client-only `assistant/live-chunk` events. A reconnect baseline expands the active in-process compact stream into the same transient events, while durable `assistant/message` and `assistant/attempt` events embed the complete compact stream for history replay. A transient event can initialize a Context. Every tool delta and the later `tool/call` can match as a start under the same callId even before the name arrives; only the earliest Match calls `start()`, and later Matches call `update()`. A provisional Tool node appears only once the name is available. History pagination does not expand settled messages into live deltas. A Definition consuming Assistant output handles live chunks and durable settlement through the same match and update interface, and other Definitions return `null` directly without expanding the stream.

## Definitions and typed Chat payloads

To show the correlations completely, the producer declaration and the Client contribution appear in one code block below. In the real package family, the branded id and the `SessionEventMap` declaration stay with the event producer, while the Definition, the Chat data merge, and the renderer stay in the Client plugin.

```ts ignore-check
import { createElement } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  ConversationLocation, ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'

type ReviewId = Branded<'ReviewId'>

interface ReviewStartData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly title: string
}

interface ReviewProgressData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly completed: number
}

interface ReviewEndData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly summary: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Opens one durable review job.
     * @mode emit
     * @param data - stable identity, location, and initial display state.
     */
    'review/start': ReviewStartData
    /**
     * Records replayable progress for one review job.
     * @mode emit
     * @param data - stable identity, location, and latest progress.
     */
    'review/progress': ReviewProgressData
    /**
     * Closes one review job with its final summary.
     * @mode emit
     * @param data - stable identity, location, and final display state.
     */
    'review/end': ReviewEndData
  }
}

interface ReviewChatData {
  readonly title: string
  readonly completed: number
  readonly status: 'running' | 'completed'
  readonly summary?: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    'review-job': ReviewChatData
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationStepDataMap {
    'review-job': ReviewChatData
  }
}

interface ReviewState extends ReviewChatData {
  readonly turn: number
  readonly step: number
}

function locationOf(context: ConversationNodeContext): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

function viewData(state: ReviewState): ReviewChatData {
  return {
    title: state.title,
    completed: state.completed,
    status: state.status,
    ...state.summary === undefined ? {} : { summary: state.summary },
  }
}

const reviewDefinition: ConversationNodeDefinition<ReviewState> = {
  kind: 'review-job',
  target: 'chat',
  match: (event) => {
    if (event.type === 'review/start') {
      return { id: String(event.data.reviewId), role: 'start' }
    }
    if (event.type === 'review/progress' || event.type === 'review/end') {
      return { id: String(event.data.reviewId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'review/start') throw new Error('review-job requires review/start')
    return {
      turn: match.event.data.turn,
      step: match.event.data.step,
      title: match.event.data.title,
      completed: 0,
      status: 'running',
    }
  },
  update: (context, match) => {
    if (match.event.type === 'review/progress') {
      return { ...context.state, completed: match.event.data.completed }
    }
    if (match.event.type === 'review/end') {
      return { ...context.state, completed: 100, status: 'completed', summary: match.event.data.summary }
    }
    return context.state
  },
  publication: match => match.event.type === 'review/progress'
    ? 'animation-frame'
    : 'immediate',
  buildLocationData: (context, scope) => {
    if (scope !== 'step' || context.state === undefined) return null
    return {
      kind: 'step',
      turn: context.state.turn,
      step: context.state.step,
      key: 'review-job',
      value: viewData(context.state),
    }
  },
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'review-job',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
      location: locationOf(context),
      visibility: 'visible',
      data: viewData(context.state),
    }
  },
}

function ReviewNodeView({ node }: ChatNodeViewProps<'review-job'>) {
  const text = node.data.summary ?? `${node.data.title}: ${node.data.completed}%`
  return createElement('p', null, text)
}

export const inject = ['uiConversation', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(reviewDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'review-job',
  }, ReviewNodeView))
}
```

`match(event)` is an identity extractor, not a fold: it receives only the current `SessionEventLike` and returns the Definition-internal id and the lifecycle role. On a hit the Assembler locates the Context by `(kind, id)`; the earliest current start initializes State, whether it is a durable or a transient event. Every later Match, including other starts, calls `update`. After a transient Match is removed, the start is reselected from the remaining events and State is recomputed; State is undefined when no start remains. Both functions must return the State the engine then adopts; returning a new immutable value is recommended, but in-place mutation that returns the same object has identical adoption semantics.

`ConversationNodeDefinitionInput` accepts the functions above, or a readonly table from event type to match function. A function-form registration receives all events; the table form receives only the listed types. The registry copies table entries and precomputes ordered candidate Sets when the registration relationship changes, and never builds candidate collections during per-event dispatch. Replacing a table unregisters first and registers again. A `ConversationNodeDefinition` resolved from either form keeps a callable `match(event)`.

`buildLocationData(context, scope)` can publish Definition-owned data onto an engine-owned Turn or Step. Declaration merging assigns the exact value type per key. Another Node in the same Location can read that value through a scoped slot hook (for example `useTurnData(key)`) without obtaining the Session and without scanning `snapshot.chat.nodes`.

`target` and `buildViewNode(context)` must both declare one render contribution owned by a target. Keep `context.key` as the React-side identity, choose `anchorSeq` from durable ordering evidence, and return only data a renderer can use directly. Once a target Node is published, keep returning the same key; to leave the visible stream temporarily, use `visibility: 'hidden'` rather than returning `null` to withdraw it.

## Predecessor read

Some Definitions need the latest State of another business kind before the current position. `start` receives a `ConversationContextReader`; call `reader.previous<State>(kind)` there rather than accepting a Context collection or scanning events. The reader returns the readonly data of the most recent started Context before the current start `seq`.

The Assembler records this dependency. When a later older prepend brings a nearer predecessor Context, fills a previously unknown window gap, or revises a predecessor State, the engine re-runs the dependent Context from `start` and replays its updates in ascending `seq` order. The queried Definition still owns writing useful information into its own State; the reader offers no business-specific query method and grants no permission to modify other Contexts.

## Window update paths

History may be requested page by page from the tail backwards. The Session journal first validates non-overlapping logical seq ranges, and the Assembler then orders accepted inputs by their first `seq` and enters State replay.

| Path | Engine work | Definition-observable behavior |
|---|---|---|
| replace on open, resync, or gap repair | Rebuild the loaded window, match every standard event or packed run once per Definition, then replay every existing start's Context | `start` runs first, then its updates in ascending logical `seq`; an update-only pending Context still has no State |
| prepend one page of earlier history | Match only the newly added earlier input, merge it into Contexts by `(kind, id)`, keep existing keyed nodes, and replay only affected Contexts and dependencies | A newly discovered scalar start activates the collected scalar and packed updates; a Location or predecessor dependency change can also re-run a Context |
| append one live event | Call `match` once per Definition, look up the hit Context by key, and update only that Context | Run one scalar `update` for matched events after the start and request one publication; no scan of existing Contexts |

With `D` registered Definitions, one new scalar event or packed run performs `D` current-input-only matches; the post-hit Context key lookup is constant time. Definition code must preserve this property: the normal append hot path must not traverse the complete event window, all Contexts, `context.matches`, or the rendered Node set. Keep accumulated facts in State, same-Turn/Step shared information in Location data, and indexed predecessor dependencies behind `reader.previous()`.

`publication` controls when materialization happens after a State change. Use `immediate` for structural or terminal changes, `animation-frame` for high-frequency visible deltas, and `none` when State is only accumulating for a later publication. The engine applies every scalar update in log order and applies one packed run with a single batch update; the option only coalesces view publication frequency.

## Verification requirements

Add focused tests proving these results:

1. A complete window through replace produces the expected final State, Location data, Node payload, and `anchorSeq`.
2. An update-only tail window stays pending; after prepending its start, the result matches a complete replace.
3. Continuing with live appends after initial history yields the same result as replaying the merged complete window.
4. Prepending earlier pages only adds earlier rows; the value of an existing keyed Node whose data did not change is not replaced.
5. Repeated visible deltas keep `context.key` and publish at most once per frame when `animation-frame` is requested.
6. A keyed renderer consumes only `node.data` and scoped Location hooks, without scanning the Session event window, Contexts, or Chat Nodes.
7. Scalar and packed Assistant history produce the same final State, timing boundaries, and target snapshot; one packed run keeps exactly one Match across replace, prepend, Location replay, and registry rebuild.
8. Creating a target source performs no builder work; explicit selection or the first subscription performs one complete replace, later updates reach all active targets, and repeated activation does not replace again.

For streaming and interruption handling see [`packages/client/ui-chat/src/client/conversation-nodes/assistant.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/assistant.ts); for predecessor queries see [`inbox.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/inbox.ts) and [`message.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/message.ts); for an example that publishes only Turn data without creating its own Node see [`packages/client/ui-deliverables`](../../packages/client/ui-deliverables).
