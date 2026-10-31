/**
 * The document model behind the export.
 *
 * A session log is event-sourced: user messages, assistant messages, tool calls,
 * results, boundaries. A document wants none of that machinery — it wants
 * ordered blocks a reader recognizes. This module is the one place that decides
 * what belongs in the export:
 *
 * * user text yes, runtime reminders and approval notices no;
 * * assistant prose yes, reasoning and tool bookkeeping no;
 * * `render_ui` calls become their card again, with the same validation the chat
 *   uses — an unrepresentable call is skipped, not printed as JSON.
 *
 * @module @prometheus-harness/pdf-export/model
 */

import { readRichSpec } from '../../rich-ui/src/spec.ts'
import type { RichSpec } from '../../rich-ui/src/spec.ts'

/** One rendered card inside the document. */
export interface CardBlock {
  readonly kind: 'card'
  readonly spec: RichSpec
}

/** One speaker block. */
export interface TextBlock {
  readonly kind: 'user' | 'assistant'
  readonly text: string
  /** Turn that produced the block, when the log records one. */
  readonly turn?: number
}

/** Ordered document content. */
export type DocumentBlock = TextBlock | CardBlock

/** What the protocol appendix says about one Turn. */
export interface TurnStat {
  readonly turn: number
  /** Wall-clock milliseconds between `turn/start` and `turn/end`. */
  readonly durationMs: number | null
  /** Tool names with their call count, in first-use order. */
  readonly tools: readonly { readonly name: string; readonly count: number }[]
  readonly tokens: number
  readonly errors: number
}

/** Everything the template needs. */
export interface Transcript {
  readonly title: string
  readonly workspace: string
  readonly startedAt: string | null
  readonly blocks: readonly DocumentBlock[]
  readonly protocol: readonly TurnStat[]
}

/** Minimal shape of one event line; the Host owns the full session types. */
interface EventLike {
  readonly seq?: number
  readonly type?: string
  readonly data?: Record<string, unknown>
  readonly time?: number
}

/** The session header carry-over used for the cover page. */
export interface SessionHeaderLike {
  readonly id?: string
  readonly cwd?: string
  readonly createdAt?: number | string
}

const REMINDER_PREFIXES = [
  '<system-reminder>',
  'Current runtime context.',
  'The approval policy changed',
  'A skill is a reusable set',
]

function isNoise(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return true
  return REMINDER_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
}

/** Read the text of one message content array, skipping non-text blocks. */
function contentText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const record = block as Record<string, unknown>
    if (record['type'] === 'text' && typeof record['text'] === 'string') parts.push(record['text'])
  }
  return parts.join('\n').trim()
}

/** User events store `content` at the top level; assistant events wrap it in a message. */
function eventText(data: Record<string, unknown>): string {
  const direct = contentText(data['content'])
  if (direct !== '') return direct
  const message = data['message'] as Record<string, unknown> | undefined
  return contentText(message?.['content'])
}

/** Append a block, merging consecutive blocks of the same speaker in the same Turn. */
function appendBlock(
  blocks: DocumentBlock[],
  kind: 'user' | 'assistant',
  text: string,
  turn: number,
  lastTurn: Map<string, number>,
): void {
  const previous = blocks.at(-1)
  if (previous?.kind === kind && lastTurn.get(kind) === turn) {
    blocks[blocks.length - 1] = { kind, text: `${previous.text}\n\n${text}`, ...(turn >= 0 ? { turn } : {}) }
  } else {
    blocks.push({ kind, text, ...(turn >= 0 ? { turn } : {}) })
  }
  lastTurn.set(kind, turn)
}

/**
 * Fold a stored session into reading order.
 *
 * @param events - validated session events, in seq order.
 * @param header - the session header, for cover metadata.
 * @returns the document model.
 */
export function foldTranscript(events: readonly EventLike[], header: SessionHeaderLike = {}): Transcript {
  const blocks: DocumentBlock[] = []
  const lastTurn = new Map<string, number>()
  const turnStart = new Map<number, number>()
  const turnEnd = new Map<number, number>()
  const tools = new Map<number, Map<string, number>>()
  const tokens = new Map<number, number>()
  const errors = new Map<number, number>()
  let title = ''
  let workspace = header.cwd ?? ''

  for (const event of events) {
    const data = event.data
    if (data === undefined) continue
    const type = event.type
    const turn = typeof data['turn'] === 'number' ? data['turn'] : -1

    if (type === 'turn/start' && typeof event.time === 'number') {
      turnStart.set(turn, event.time)
      continue
    }
    if (type === 'turn/end' && typeof event.time === 'number') {
      turnEnd.set(turn, event.time)
      continue
    }
    if (type === 'tool/call' && turn >= 0 && typeof data['name'] === 'string') {
      const byName = tools.get(turn) ?? new Map<string, number>()
      byName.set(data['name'], (byName.get(data['name']) ?? 0) + 1)
      tools.set(turn, byName)
    }
    if (type === 'tool/result' && turn >= 0) {
      const message = data['message'] as Record<string, unknown> | undefined
      if (message?.['isError'] === true) errors.set(turn, (errors.get(turn) ?? 0) + 1)
    }
    if (type === 'assistant/message' && turn >= 0) {
      /*
       * `totalTokens` includes the cached prompt on every step, so summing it
       * reports tens of millions for one Turn. New input plus output is the
       * number a reader can interpret.
       */
      const usage = data['usage'] as Record<string, unknown> | undefined
      const input = usage?.['inputTokens']
      const output = usage?.['outputTokens']
      const fresh = (typeof input === 'number' ? input : 0) + (typeof output === 'number' ? output : 0)
      const total = usage?.['totalTokens']
      const counted = fresh > 0 ? fresh : typeof total === 'number' ? total : 0
      if (counted > 0) tokens.set(turn, (tokens.get(turn) ?? 0) + counted)
    }

    if (type === 'user/message') {
      /*
       * Only what the person typed. The same event type carries injected context
       * — workspace instructions, runtime snapshots, the skill catalog, and the
       * compaction summary — and none of that belongs in a transcript the user
       * sends to someone else.
       */
      const source = data['source'] as Record<string, unknown> | undefined
      if (source?.['kind'] !== 'user') continue
      const text = eventText(data)
      if (isNoise(text)) continue
      if (title === '') {
        const firstLine = text.split('\n').find((line) => line.trim().length > 0) ?? ''
        title = firstLine.replace(/[#*_`]/gu, '').slice(0, 80)
      }
      appendBlock(blocks, 'user', text, turn, lastTurn)
      continue
    }

    if (type === 'assistant/message') {
      const text = eventText(data)
      if (isNoise(text)) continue
      appendBlock(blocks, 'assistant', text, turn, lastTurn)
      continue
    }

    if (type === 'tool/call' && data['name'] === 'render_ui' && typeof data['arguments'] === 'string') {
      let parsed: unknown
      try {
        parsed = JSON.parse(data['arguments'])
      } catch {
        continue
      }
      const result = readRichSpec(parsed)
      if (result.ok) blocks.push({ kind: 'card', spec: result.spec })
    }
  }

  if (title === '') title = 'Sitzung'
  if (workspace === '') workspace = 'Unbekannter Arbeitsbereich'

  const createdAt = header.createdAt
  const startedAt = typeof createdAt === 'number'
    ? new Date(createdAt).toISOString()
    : typeof createdAt === 'string'
      ? createdAt
      : null

  const protocol: TurnStat[] = [...new Set([...turnStart.keys(), ...turnEnd.keys(), ...tools.keys(), ...tokens.keys()])]
    .filter((turn) => turn >= 0)
    .sort((left, right) => left - right)
    .map((turn) => {
      const start = turnStart.get(turn)
      const end = turnEnd.get(turn)
      return {
        turn,
        durationMs: start !== undefined && end !== undefined ? Math.max(0, end - start) : null,
        tools: [...(tools.get(turn) ?? new Map<string, number>())].map(([name, count]) => ({ name, count })),
        tokens: tokens.get(turn) ?? 0,
        errors: errors.get(turn) ?? 0,
      }
    })

  return { title, workspace, startedAt, blocks, protocol }
}

/**
 * Keep one Turn: its user prompt, its assistant answer, and its cards.
 *
 * @param transcript - complete transcript.
 * @param turn - owning Turn number.
 * @returns the cut transcript, or an empty one when the Turn is absent.
 */
export function sliceAtTurn(transcript: Transcript, turn: number): Transcript {
  const target = transcript.blocks.findIndex((block) => block.kind === 'assistant' && block.turn === turn)
  if (target < 0) return { ...transcript, blocks: [] }
  let start = target
  while (start > 0 && transcript.blocks[start - 1]?.kind !== 'user') start -= 1
  if (transcript.blocks[start - 1]?.kind === 'user') start -= 1
  // A Turn can interleave prose and cards; the next user message closes it.
  let end = target + 1
  while (end < transcript.blocks.length && transcript.blocks[end]?.kind !== 'user') end += 1
  return { ...transcript, blocks: transcript.blocks.slice(start, end) }
}
