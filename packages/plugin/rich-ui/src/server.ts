/**
 * Host half of the rich answer UI: one model-facing tool.
 *
 * The tool does no I/O and renders nothing here. It validates the description the
 * model produced and tells it whether the component is representable; the browser
 * half owns the drawing. Keeping validation on both sides is deliberate: the Host
 * answer teaches the model what went wrong, and the browser still refuses garbage
 * that arrives through an older transcript.
 *
 * @module @prometheus-harness/rich-ui
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
// Declares `ctx.systemPrompt`; the section is registered only when the service is
// present, so a headless composition without a model face still gets the tool.
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { describeSpec, readRichSpec, TOOL_NAME } from './spec.ts'

/** Plugin identity. */
export const name = 'rich-ui'

/** Without the tool registry there is nothing to register. */
export const inject = ['tools'] as const

/**
 * Loader configuration.
 *
 * `offerTool: false` keeps the plugin installed and the cards in old transcripts
 * visible, but stops the model from seeing the tool — the per-request schema cost
 * disappears while the history stays intact. The whole plugin switch in
 * Settings → Plugins is coarser: it also removes the renderer, and existing cards
 * then have no occupant.
 */
export interface Config {
  readonly offerTool?: boolean
}

/** What the model sees before it calls the tool. */
const DESCRIPTION = [
  'Show one visual component beside your text: key numbers (stats), a small line or bar chart (chart),',
  'a compact table (table), an image from a known http(s) URL (image), a highlighted note (note),',
  'a paragraph with one image the text is set around (prose), an excerpt of a file (code),',
  'or a list of the files a change touched (files).',
  'Send data only; the client draws axes, colours, and layout. Keep the surrounding prose short.',
].join(' ')

/**
 * Parameter schema. It mirrors {@link readRichSpec} but stays JSON-Schema strict.
 *
 * Every request carries this object, so it is written with token cost in mind:
 * field names explain themselves, `required` and the enums do the guiding, and
 * only constraints that change a model decision keep a description. Bounds that
 * matter for output quality stay; purely cosmetic `maxLength` values were dropped
 * because the Host validates them anyway.
 */
const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['stats', 'chart', 'table', 'image', 'note', 'prose', 'code', 'files'] },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    footer: { type: 'string', description: 'Source or caveat, e.g. "Example data".' },
    note: { type: 'string', description: 'Required for kind note.' },
    stats: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      description: 'Required for kind stats.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'value'],
        properties: {
          label: { type: 'string' },
          value: { type: 'string', description: 'Formatted, e.g. "1.284" or "12,5 %".' },
          hint: { type: 'string' },
        },
      },
    },
    chart: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'labels', 'series'],
      description: 'Required for kind chart.',
      properties: {
        type: { type: 'string', enum: ['line', 'bar'] },
        unit: { type: 'string', description: 'Appended to values, e.g. "€".' },
        labels: {
          type: 'array',
          minItems: 1,
          maxItems: 60,
          items: { type: 'string', maxLength: 80 },
        },
        series: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['key', 'label', 'values'],
            properties: {
              key: { type: 'string', description: 'Unique within the chart.' },
              label: { type: 'string', description: 'Legend text.' },
              values: {
                type: 'array',
                items: { type: 'number' },
                description: 'One number per label, in order.',
              },
            },
          },
        },
      },
    },
    table: {
      type: 'object',
      additionalProperties: false,
      required: ['columns', 'rows'],
      description: 'Required for kind table.',
      properties: {
        caption: { type: 'string' },
        columns: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['key', 'label'],
            properties: {
              key: { type: 'string' },
              label: { type: 'string' },
              align: { type: 'string', enum: ['left', 'right'] },
            },
          },
        },
        rows: {
          type: 'array',
          maxItems: 50,
          description: 'One array per row, one cell per column.',
          items: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    image: {
      type: 'object',
      additionalProperties: false,
      required: ['src'],
      description: 'Required for kind image.',
      properties: {
        src: { type: 'string', description: 'http(s) URL or data:image/…' },
        alt: { type: 'string', description: 'Accessible description.' },
        caption: { type: 'string' },
      },
    },
    prose: {
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      description: 'Required for kind prose.',
      properties: {
        text: { type: 'string', description: 'The paragraph the image sits in.' },
        image: {
          type: 'object',
          additionalProperties: false,
          required: ['src'],
          description: 'One image the text is set around.',
          properties: {
            src: { type: 'string', description: 'http(s) URL or data:image/…' },
            alt: { type: 'string', description: 'Accessible description.' },
            boxWidth: { type: 'number', description: 'Display width in px, 40–320.' },
          },
        },
      },
    },
    code: {
      type: 'object',
      additionalProperties: false,
      required: ['content'],
      description: 'Required for kind code.',
      properties: {
        content: { type: 'string', description: 'Source text, at most 60 lines.' },
        language: { type: 'string', description: 'Short tag, e.g. "ts".' },
        filename: { type: 'string', description: 'Where the excerpt comes from.' },
        startLine: { type: 'number', description: 'Number of the first line.' },
      },
    },
    files: {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      description: 'Required for kind files.',
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 40,
          description: 'One entry per file.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['path'],
            properties: {
              path: { type: 'string', description: 'Path relative to the workspace.' },
              change: { type: 'string', enum: ['added', 'modified', 'deleted', 'renamed'] },
              added: { type: 'number', description: 'Added lines.' },
              removed: { type: 'number', description: 'Removed lines.' },
            },
          },
        },
        more: { type: 'number', description: 'Entries not listed.' },
      },
    },
  },
} as const

/** The one tool this plugin registers. */
const tool: ToolDefinition = {
  name: TOOL_NAME,
  description: DESCRIPTION,
  parameters: PARAMETERS as unknown as ToolDefinition['parameters'],
  output: {
    schema: { type: 'object' } as ToolDefinition['output']['schema'],
    /*
     * The result is a plain-text copy of the component. In the chat it stays
     * invisible: the tool row hides itself once the client renderer owns the
     * node. Where that renderer is missing — an older tab, a client composition
     * without the plugin — this text is what the user sees, so the data is never
     * lost behind the word "Rendered".
     */
    render: (args, value) => {
      const spec = readRichSpec(args)
      if (spec.ok) {
        const body = describeSpec(spec.spec)
        return [{ type: 'text', text: body.length > 0 ? body : `Rendered ${spec.spec.kind}.` }] as ReturnType<ToolDefinition['output']['render']>
      }
      const record = (typeof value === 'object' && value !== null ? value : {}) as { readonly error?: unknown }
      const reason = typeof record.error === 'string' ? record.error : spec.error
      return [{ type: 'text', text: `Not rendered: ${reason}` }] as ReturnType<ToolDefinition['output']['render']>
    },
  },
  execute: async (args: unknown) => {
    const result = readRichSpec(args)
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, kind: result.spec.kind }
  },
}

/**
 * Guidance for using the tool, not for describing it.
 *
 * This is the part that makes the feature *apply* by default: the tool schema
 * says what can be rendered, this section says when it should be. It is written
 * as four rules because a longer text would be paid on every request and then
 * ignored. An empty string removes it from the assembly without unregistering the
 * section, which is how `/ui off` saves the tokens as well.
 */
export const GUIDANCE = [
  'Visual components: an answer that carries structured results — key figures, a trend over time,',
  'a comparison across categories, a compact dataset, or an image whose URL you know — must call',
  '`render_ui` before finishing, and the prose then stays a short reading of the card.',
  'Use prose for an image that carries an explanation, code for an excerpt of a file, and files to list what a change touched.',
  'Do not restate the card in text, do not attach a card to a one-line answer, and use prose when the numbers are incidental.',
].join(' ')

/** Sorts after the computer-use tool guidance and before the MCP server list. */
const GUIDANCE_ORDER = 3050

/** Announcement is a diagnostic, not a per-request message. */
let announced = false

/**
 * Register the tool, the guidance section, and the `/ui` command.
 *
 * The tool and the guidance are one offer: `/ui off` withdraws the registration
 * and empties the section, so an off plugin costs no tool schema and no guidance
 * text. The browser half keeps rendering old cards either way.
 *
 * @param ctx - the Host plugin context.
 * @param config - optional loader configuration; omitted means "offer the tool".
 */
export function apply(ctx: Context, config?: Config): void {
  let offered = config?.offerTool !== false
  let disposeTool: (() => void) | undefined

  const offer = (): void => {
    offered = true
    disposeTool ??= ctx.tools.register(tool)
    if (!announced) {
      announced = true
      console.log(`[rich-ui] render_ui offered (${String(GUIDANCE.length)} chars of guidance); /ui off withdraws it`)
    }
  }

  const withdraw = (): void => {
    offered = false
    disposeTool?.()
    disposeTool = undefined
  }

  ctx.inject(['systemPrompt'], (scope) => {
    scope.effect(
      () =>
        scope.systemPrompt.section({
          name: 'ui:rich-components',
          order: GUIDANCE_ORDER,
          text: () => (offered ? GUIDANCE : ''),
          interpolate: false,
        }),
      'rich-ui: guidance',
    )
  })

  ctx.effect(() => {
    if (offered) offer()
    return () => withdraw()
  }, 'rich-ui: render_ui')

  ctx.inject(['commands'], (scope) => {
    scope.effect(
      () =>
        scope.commands.register({
          name: 'ui',
          description: 'Visuelle Karten im Chat ein- oder ausschalten.',
          input: { hint: 'on | off | status' },
          handler: (invocation): CommandResult => {
            const argument = invocation.rawInput.trim().toLowerCase()
            if (argument === '' || argument === 'status') {
              return { kind: 'success', text: offered ? 'Visuelle Karten: an.' : 'Visuelle Karten: aus.' }
            }
            if (argument === 'on' || argument === 'an') {
              offer()
              return { kind: 'success', text: 'Visuelle Karten: an.' }
            }
            if (argument === 'off' || argument === 'aus') {
              withdraw()
              return { kind: 'success', text: 'Visuelle Karten: aus.' }
            }
            return { kind: 'error', text: 'Nutzung: /ui on | off | status' }
          },
        }),
      'rich-ui: /ui',
    )
  })
}

export default apply
