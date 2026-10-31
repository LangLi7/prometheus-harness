/**
 * Host half of the PDF export: one authenticated download route.
 *
 * The route reads a stored session through the persistence seam, folds it into
 * the document model, renders Typst, compiles with the installed binary and
 * returns the PDF. Nothing is written to disk beyond the compiler's temporary
 * directory, and the session log is never mutated.
 *
 * @module @prometheus-harness/pdf-export
 */

import type { Context } from '@deepseek-ai/cordis'
import { compileDocument, disposeDocument, findTypst } from './compile.ts'
import { installTypst } from './install.ts'
import { foldTranscript, sliceAtTurn } from './model.ts'
import type { SessionHeaderLike, Transcript } from './model.ts'
import { documentFileName, renderDocument } from './typst.ts'

/** Plugin identity. */
export const name = 'pdf-export'

/** Without the connection service there is no route, without persistence no session to read. */
export const inject = ['connection', 'sessionPersistence'] as const

/** Where the browser asks for a document. */
export const EXPORT_PATH = '/api/chat.pdf'

/** Longest accepted session identity; the brand type is a short string. */
const MAX_ID_LENGTH = 200

/** Minimal persistence handle surface this plugin relies on. */
interface PersistenceHandle {
  readonly header: SessionHeaderLike
  read(offset: number, limit?: number): Promise<{ readonly events: readonly EventLike[] }>
  close(): Promise<void>
}

interface EventLike {
  readonly type?: string
  readonly data?: Record<string, unknown>
}

interface PersistenceService {
  open(id: string, mode: 'read'): Promise<PersistenceHandle>
}

/** Query the export understands. */
export interface ExportQuery {
  readonly sessionId: string
  readonly mode: 'chat' | 'message' | 'last'
  readonly messageId?: string
  /** Append the per-turn protocol table. */
  readonly protocol: boolean
}

/**
 * Parse and validate the request query.
 *
 * @param url - request URL.
 * @returns the export query, or a readable error.
 */
export function readExportQuery(url: string): { readonly ok: true; readonly query: ExportQuery } | { readonly ok: false; readonly error: string } {
  const parameters = new URL(url).searchParams
  const sessionId = parameters.get('session')?.trim() ?? ''
  if (sessionId === '' || sessionId.length > MAX_ID_LENGTH) return { ok: false, error: 'missing or invalid session parameter' }
  const rawMode = parameters.get('mode') ?? 'chat'
  if (rawMode !== 'chat' && rawMode !== 'message' && rawMode !== 'last') {
    return { ok: false, error: 'mode must be chat, message, or last' }
  }
  const messageId = parameters.get('message')?.trim() ?? undefined
  if (rawMode === 'message' && (messageId === undefined || messageId === '')) {
    return { ok: false, error: 'message is required for mode=message' }
  }
  const protocol = parameters.get('protocol') === '1' || parameters.get('protocol') === 'true'
  return {
    ok: true,
    query: { sessionId, mode: rawMode, ...(messageId === undefined ? {} : { messageId }), protocol },
  }
}

/** Find the turn that owns one assistant message id. */
function turnOfMessage(events: readonly EventLike[], messageId: string): number | undefined {
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    const message = event.data?.['message'] as Record<string, unknown> | undefined
    if (message?.['id'] === messageId) {
      const turn = event.data?.['turn']
      return typeof turn === 'number' ? turn : undefined
    }
  }
  return undefined
}

/** Select the requested part of the transcript. */
function selectTranscript(transcript: Transcript, events: readonly EventLike[], query: ExportQuery): Transcript | undefined {
  if (query.mode === 'chat') return transcript
  if (query.mode === 'last') {
    const assistantTurns = transcript.blocks.flatMap((block) => (block.kind === 'assistant' && block.turn !== undefined ? [block.turn] : []))
    const last = assistantTurns.at(-1)
    return last === undefined ? undefined : sliceAtTurn(transcript, last)
  }
  const turn = query.messageId === undefined ? undefined : turnOfMessage(events, query.messageId)
  return turn === undefined ? undefined : sliceAtTurn(transcript, turn)
}

/**
 * Build an ASCII-only `Content-Disposition` value.
 *
 * HTTP header values cannot carry non-ASCII bytes; the fetch layer rejects the
 * whole response with `invalid value` (an umlaut in the title is enough). The
 * file-name helper already transliterates; this guard makes the header safe even
 * for a name produced elsewhere.
 *
 * @param fileName - suggested name.
 * @returns a header-safe attachment value.
 */
export function attachmentHeader(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/gu, '-').replace(/["\\]/gu, '')
  return `attachment; filename="${ascii === '' ? 'chat.pdf' : ascii}"`
}

/**
 * Build the PDF answer for one request.
 *
 * @param ctx - Host context carrying `sessionPersistence`.
 * @param query - validated export query.
 * @param signal - request cancellation.
 * @returns the PDF response.
 */
export async function exportResponse(ctx: Context, query: ExportQuery, signal: AbortSignal): Promise<Response> {
  const persistence = Reflect.get(ctx, 'sessionPersistence') as PersistenceService | undefined
  if (persistence === undefined) return new Response('session persistence is unavailable', { status: 500 })

  let binary = await findTypst()
  if (binary === undefined && installPolicy === 'auto') {
    // First export is the consent: nobody installs a compiler at boot, but a
    // clicked "PDF" may use the package manager the machine already has.
    const installed = await installTypst()
    if (installed.ok) binary = await findTypst()
    if (binary === undefined) {
      return new Response(
        `typst is not installed and could not be installed (${installed.method}):\n${installed.output}`,
        { status: 503 },
      )
    }
  }
  if (binary === undefined) {
    return new Response('typst is not installed; set PMH_TYPST or install the typst CLI', { status: 503 })
  }

  let handle: PersistenceHandle
  try {
    handle = await persistence.open(query.sessionId, 'read')
  } catch {
    return new Response('session not found', { status: 404 })
  }

  let header: SessionHeaderLike
  let events: readonly EventLike[]
  try {
    header = handle.header
    events = (await handle.read(0)).events
  } finally {
    await handle.close()
  }
  signal.throwIfAborted()

  const transcript = foldTranscript(events, header)
  if (transcript.blocks.length === 0) return new Response('session has no exportable content', { status: 422 })

  const selected = selectTranscript(transcript, events, query)
  if (selected === undefined || selected.blocks.length === 0) {
    return new Response('the requested message is not part of this session', { status: 404 })
  }

  const source = renderDocument(selected, new Date().toISOString(), { protocol: query.protocol })
  let compiled
  try {
    compiled = await compileDocument(source, binary)
  } catch (error) {
    return new Response(`typst failed: ${error instanceof Error ? error.message.slice(0, 500) : 'unknown error'}`, { status: 500 })
  }

  try {
    const bytes = await Bun.file(compiled.pdf).arrayBuffer()
    return new Response(bytes, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': attachmentHeader(documentFileName(selected)),
        'cache-control': 'no-store',
      },
    })
  } finally {
    await disposeDocument(compiled)
  }
}

/** Whether a missing Typst may be installed on first export. */
let installPolicy: 'auto' | 'never' = 'auto'

/**
 * Register the download route.
 *
 * @param ctx - Host context.
 * @param config - loader options; `install: 'never'` disables the first-use install.
 */
export function apply(ctx: Context, config?: { readonly install?: 'auto' | 'never' }): void {
  if (config?.install === 'never') installPolicy = 'never'
  const connection = Reflect.get(ctx, 'connection') as
    | { fetch: { register(route: { path: string; methods: readonly string[]; requestBody: 'buffered'; fetch: (request: Request) => Promise<Response> }): void } }
    | undefined
  if (connection === undefined) return

  connection.fetch.register({
    path: EXPORT_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request: Request) => {
      const parsed = readExportQuery(request.url)
      if (!parsed.ok) return new Response(parsed.error, { status: 400 })
      try {
        return await exportResponse(ctx, parsed.query, request.signal)
      } catch (error) {
        return new Response(`export failed: ${error instanceof Error ? error.message.slice(0, 500) : 'unknown error'}`, { status: 500 })
      }
    },
  })
}
