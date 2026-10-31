/**
 * Browser half of the PDF export: two entry points, one route.
 *
 * Both buttons open the authenticated Host route in a new tab. The browser does
 * no document work; it hands the session identity (and, for a single answer, the
 * message identity) to the Host and lets Typst produce the file.
 *
 * @module @prometheus-harness/pdf-export/client
 */

import type { Context } from '@deepseek-ai/cordis'
// Declares the slots this plugin registers into.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ReactElement } from 'react'

/** Services this plugin needs. */
export const inject = ['slots'] as const

const BUTTON: Record<string, string | number> = {
  appearance: 'none',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  borderRadius: '6px',
  padding: '2px 8px',
  font: 'inherit',
  fontSize: '11px',
  lineHeight: 1.6,
  cursor: 'pointer',
}

/** Open the PDF route for one session and mode. */
function download(sessionId: string, mode: 'chat' | 'message', messageId?: string, protocol = false): void {
  const query = `session=${encodeURIComponent(sessionId)}&mode=${mode}${
    messageId === undefined ? '' : `&message=${encodeURIComponent(messageId)}`
  }${protocol ? '&protocol=1' : ''}`
  window.open(`/api/chat.pdf?${query}`, '_blank', 'noopener')
}

/** Session-header entry: the whole transcript. */
export function SessionPdfAction({ sessionId }: { readonly sessionId: string }): ReactElement {
  return (
    <button
      type="button"
      style={BUTTON}
      title="Diese Sitzung als PDF exportieren"
      onClick={() => download(sessionId, 'chat')}
    >
      PDF
    </button>
  )
}

/** Session-header entry: the transcript plus the per-turn protocol appendix. */
export function SessionPdfProtocolAction({ sessionId }: { readonly sessionId: string }): ReactElement {
  return (
    <button
      type="button"
      style={BUTTON}
      title="Diese Sitzung mit Protokoll-Anhang exportieren"
      onClick={() => download(sessionId, 'chat', undefined, true)}
    >
      PDF+Log
    </button>
  )
}

/** Message action: this answer with its prompt. */
export function MessagePdfAction({ sessionId, messageId }: { readonly sessionId: string; readonly messageId: string }): ReactElement {
  return (
    <button
      type="button"
      style={BUTTON}
      title="Diese Antwort als PDF exportieren"
      aria-label="Diese Antwort als PDF exportieren"
      onClick={() => download(sessionId, 'message', messageId)}
    >
      PDF
    </button>
  )
}

/**
 * Register the entries: session PDF, session PDF with protocol, one answer.
 *
 * @param ctx - client plugin context.
 */
export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({ name: 'conversation.session.header.actions', id: 'pdf-export', order: 30 }, SessionPdfAction),
  )
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({ name: 'conversation.session.header.actions', id: 'pdf-export-protocol', order: 31 }, SessionPdfProtocolAction),
  )
  ctx.slots.inject('conversation.chat.assistant-actions', () =>
    ctx.slots.register({ name: 'conversation.chat.assistant-actions', id: 'pdf-export', order: 30 }, MessagePdfAction),
  )
}
