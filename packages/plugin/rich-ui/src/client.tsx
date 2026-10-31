/**
 * Browser half of the rich answer UI.
 *
 * ## What it adds
 *
 * A model answer can carry a component row next to its prose: a headline with
 * key numbers, a categorical chart, a table, or an image. The model describes the
 * component through the `render_ui` tool; this plugin renders that call as a
 * first-class Chat node instead of a folded tool row, so the row keeps its place
 * between the paragraphs.
 *
 * ## Why a Definition and not only a tool view
 *
 * Tool rows belong to the Turn process and collapse behind "Worked for …" once a
 * Turn settles. A component that is part of the answer must stay visible, so the
 * call is matched by a Conversation Definition and published as a `rich-ui` node.
 * The ordinary tool row is registered empty: it would otherwise repeat the call
 * as a line of text above the card.
 *
 * @module @prometheus-harness/rich-ui
 */

import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEventLike } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ChatNode, TurnTailOwnerProps, UseChat } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {
  ConversationLocation,
  ConversationMatch,
  ConversationMatchHandler,
  ConversationNodeContext,
  ConversationNodeDefinition,
  ConversationStartMatch,
  ConversationViewNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
// The renderer declares the `slots` service on Context; without this type import
// `ctx.slots` is not part of the plugin's contract.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { RichCard, RichError } from './card.tsx'
import { parseRichArguments, TOOL_NAME } from './spec.ts'
import type { RichSpec } from './spec.ts'
import { CARD_CSS } from './style.ts'

/** Services this plugin needs. */
export const inject = ['slots', 'uiConversation']

/** Payload a `rich-ui` node carries into the Turn-tail renderer. */
export interface RichUiState {
  readonly callId: string
  readonly spec: RichSpec | null
  readonly error: string | null
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    'rich-ui': RichUiState
  }
}

/**
 * Final Chat node with the fields the Chat target requires.
 *
 * The node stays **visible**: it is the card at the tool call, inside the process
 * fold. The same data is also read by the Turn tail below, so the answer ends
 * with the card as well — the process copy documents *when* the component was
 * produced, the tail copy makes it part of the answer.
 */
interface RichChatNode extends ConversationViewNode {
  readonly anchorSeq: number
  readonly location: ConversationLocation
  readonly visibility: 'visible'
}

function eventSeq(event: SessionEventLike): number {
  const seq = (event as { seq?: unknown }).seq
  return typeof seq === 'number' ? seq : 0
}

/** Read this plugin's tool call out of one history event. */
function richCall(event: SessionEventLike): { readonly callId: string; readonly json: string } | null {
  if (event.type !== 'tool/call') return null
  const data = (event as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  if (record['name'] !== TOOL_NAME) return null
  const callId = record['callId']
  if (typeof callId !== 'string' || callId.length === 0) return null
  const args = record['arguments']
  return { callId, json: typeof args === 'string' ? args : '' }
}

const matchRichCall: ConversationMatchHandler = (event) => {
  const call = richCall(event)
  return call === null ? null : { id: call.callId, role: 'start' }
}

/** One definition per tool call; the call identity is the definition identity. */
const richUiDefinition: ConversationNodeDefinition<RichUiState> = {
  kind: 'rich-ui',
  target: 'chat',
  match: matchRichCall,

  start(_context: ConversationNodeContext<RichUiState>, match: ConversationStartMatch): RichUiState {
    const call = richCall(match.event)
    const result = parseRichArguments(call?.json)
    const callId = call?.callId ?? 'unknown'
    return result.ok
      ? { callId, spec: result.spec, error: null }
      : { callId, spec: null, error: result.error }
  },

  update(context: ConversationNodeContext<RichUiState> & { readonly state: RichUiState }, _match: ConversationMatch): RichUiState {
    return context.state
  },

  buildViewNode(context: ConversationNodeContext<RichUiState>): ConversationViewNode | null {
    if (context.state === undefined) return null
    const node: RichChatNode = {
      key: context.key,
      kind: 'rich-ui',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start === undefined ? 0 : eventSeq(context.start.event),
      location: context.start?.location ?? { kind: 'unresolved' },
      visibility: 'visible',
      data: context.state,
    }
    return node
  },
}

/**
 * The card at the tool call, visible when the process fold is open.
 *
 * The props stay narrow on purpose: the keyed slot hands the whole owner share
 * down, and declaring only what this renderer reads keeps the registration free
 * of the session-bound `inject` face. A surface without a file opener simply
 * omits it, and a file list then renders plain paths instead of dead buttons.
 */
function RichUiNodeView({
  node,
  openFile,
}: {
  readonly node: ChatNode<'rich-ui'>
  readonly openFile?: ((path: string) => void) | undefined
}): ReactElement | null {
  const state = node.data
  if (state.spec === null) return state.error === null ? null : <RichError message={state.error} />
  return <RichCard spec={state.spec} onOpenFile={openFile} />
}

/**
 * The cards of one completed Turn, rendered after the answer.
 *
 * The Chat store exposes exactly this query: `turnDataSource(turn, kind)` yields
 * the Turn's nodes of one kind — hidden ones included — in anchor order, and its
 * array identity changes only when its members do. That keeps the entry inert for
 * Turns without a card and avoids subscribing the whole transcript to every
 * streamed token.
 */
export function RichTurnTail({
  turn,
  openFile,
  useChat,
}: TurnTailOwnerProps & { readonly useChat: UseChat }): ReactElement | null {
  const cards = useChat((snapshot) => snapshot.nodes.turnDataSource(turn.turn, 'rich-ui').getSnapshot())
  /*
   * Only representable components belong to the answer. A rejected call is a
   * failed attempt, not a result: it stays in the process fold where the model
   * made it, and does not put a yellow notice under the finished answer.
   */
  const visible = cards.filter((state): state is RichUiState & { readonly spec: RichSpec } => state.spec !== null)
  if (visible.length === 0) return null
  return (
    <div className="pmh-rich-stack" data-pmh-rich-stack="">
      {visible.map((state) => (
        <RichCard key={state.callId} spec={state.spec} onOpenFile={openFile} />
      ))}
    </div>
  )
}

/** First text block of a failed tool result, for the inline notice. */
function failureText(props: Extract<ToolCallViewProps, { readonly phase: 'result' }>): string {
  const blocks = props.block.content as readonly { readonly type?: string; readonly text?: string }[]
  const text = blocks.find((block) => block.type === 'text' && typeof block.text === 'string' && block.text.length > 0)
  return text?.text ?? 'Der Aufruf ist fehlgeschlagen.'
}

/**
 * The ordinary tool row for `render_ui`.
 *
 * It stays empty while the call runs and after it settles, because the card is
 * already the answer. A failed call keeps its reason visible.
 */
function RichToolRow(props: ToolCallViewProps): ReactElement | null {
  if (props.phase !== 'result' || !props.block.isError) return null
  return <RichError message={failureText(props)} />
}

/** Inject the card styles once per plugin lifetime. */
function installStyle(): () => void {
  const style = document.createElement('style')
  style.dataset.pmhRichUi = ''
  style.textContent = CARD_CSS
  document.head.append(style)
  return () => style.remove()
}

/**
 * Wire the Definition, the two slot entries, and the stylesheet.
 *
 * @param ctx - the client plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => installStyle(), 'rich-ui: style')
  ctx.effect(() => ctx.uiConversation.events.register(richUiDefinition), 'rich-ui: node definition')

  // Two placements, one description: the card at the call (process fold, shows
  // when it was produced) and again at the answer's end (the Turn tail, the same
  // surface as the changed-files card).
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register({ name: 'conversation.chat.node', key: 'rich-ui' }, RichUiNodeView),
  )
  ctx.slots.inject('conversation.chat.turnTail', () =>
    ctx.slots.register({ name: 'conversation.chat.turnTail', id: 'rich-ui', order: 20 }, RichTurnTail),
  )
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: TOOL_NAME }, RichToolRow),
  )
}

