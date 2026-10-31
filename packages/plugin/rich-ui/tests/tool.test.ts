import { describe, expect, test } from 'bun:test'
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandResult } from '@deepseek-ai/dsh-commands'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { apply, inject, name } from '../src/server.ts'
import type { Config } from '../src/server.ts'

interface Harness {
  readonly definition: () => ToolDefinition | undefined
  readonly guidance: () => string
  readonly command: () => CommandDefinition | undefined
  readonly run: (input: string) => CommandResult
  readonly offered: () => boolean
}

function harness(config?: Config): Harness {
  let definition: ToolDefinition | undefined
  let section: { readonly text: string | (() => string) } | undefined
  let command: CommandDefinition | undefined

  const services = {
    tools: {
      register: (value: ToolDefinition) => {
        definition = value
        return () => {
          definition = undefined
        }
      },
    },
    systemPrompt: {
      section: (value: { readonly text: string | (() => string) }) => {
        section = value
        return () => {
          section = undefined
        }
      },
    },
    commands: {
      register: (value: CommandDefinition) => {
        command = value
        return () => {
          command = undefined
        }
      },
    },
  }

  const base = {
    ...services,
    effect: (fn: () => unknown) => fn(),
  }
  const ctx = {
    ...base,
    inject: (_deps: readonly string[], callback: (scope: typeof base) => void) => callback(base),
  }
  apply(ctx as unknown as Context, config)

  return {
    definition: () => definition,
    // The guidance is a provider evaluated at each assembly; calling it again
    // after `/ui off` mirrors what the next request would see.
    guidance: () => {
      const text = section?.text
      if (text === undefined) return ''
      return typeof text === 'string' ? text : text()
    },
    command: () => command,
    offered: () => definition !== undefined,
    run: (input: string): CommandResult => {
      const handler = command?.handler
      if (handler === undefined) throw new Error('no command registered')
      return handler({ rawInput: input } as never) as CommandResult
    },
  }
}

describe('render_ui tool', () => {
  test('declares its identity and the tool registry', () => {
    expect(name).toBe('rich-ui')
    expect(inject).toEqual(['tools'])
  })

  test('registers one tool named render_ui with a strict kind enum', () => {
    const definition = harness().definition()
    expect(definition?.name).toBe('render_ui')
    expect(definition?.description).toContain('chart')
    const parameters = definition?.parameters as unknown as {
      required: string[]
      properties: { kind: { enum: string[] } }
    }
    expect(parameters.required).toContain('kind')
    expect(parameters.properties.kind.enum).toEqual([
      'stats',
      'chart',
      'table',
      'image',
      'note',
      'prose',
      'code',
      'files',
    ])
  })

  test('accepts a valid chart and reports its kind', async () => {
    const definition = harness().definition()
    const value = await definition?.execute(
      {
        kind: 'chart',
        chart: {
          type: 'bar',
          labels: ['A', 'B'],
          series: [{ key: 'x', label: 'X', values: [1, 2] }],
        },
      },
      {} as never,
    )
    expect(value).toEqual({ ok: true, kind: 'chart' })
  })

  test('reports an invalid description without throwing', async () => {
    const definition = harness().definition()
    const value = (await definition?.execute({ kind: 'chart', chart: { type: 'pie', labels: [], series: [] } }, {} as never)) as {
      ok: boolean
      error: string
    }
    expect(value.ok).toBe(false)
    expect(value.error.length).toBeGreaterThan(0)
  })

  test('renders a plain-text fallback for a client without the renderer', () => {
    const definition = harness().definition()
    const args = {
      kind: 'chart',
      title: 'Umsatz',
      chart: { type: 'line', unit: '€', labels: ['Jan', 'Feb'], series: [{ key: 'x', label: 'Wert', values: [1, 2] }] },
    }
    const ok = definition?.output.render(args as never, { ok: true, kind: 'chart' } as never) as { type: string; text: string }[]
    expect(ok[0]?.type).toBe('text')
    expect(ok[0]?.text).toContain('Umsatz')
    expect(ok[0]?.text).toContain('Jan 1, Feb 2 €')

    const failed = definition?.output.render({ kind: 'chart' } as never, { ok: false, error: 'bad labels' } as never) as { type: string; text: string }[]
    expect(failed[0]?.text).toBe('Not rendered: bad labels')
  })
})

describe('guidance section', () => {
  test('tells the model when to use the tool and when not to', () => {
    const guidance = harness().guidance()
    expect(guidance).toContain('render_ui')
    expect(guidance).toContain('Do not restate the card')
  })

  test('is empty while the tool is withdrawn', () => {
    const testHarness = harness()
    expect(testHarness.guidance().length).toBeGreaterThan(0)
    testHarness.run('off')
    expect(testHarness.offered()).toBe(false)
    // The section stays registered; its provider now yields an empty string.
    expect(testHarness.guidance().length).toBe(0)
  })
})

describe('/ui command', () => {
  test('registers a command with an input hint', () => {
    const command = harness().command()
    expect(command?.name).toBe('ui')
    expect(command?.input?.hint).toContain('on')
  })

  test('turns the offer off and on again', () => {
    const testHarness = harness()
    expect(testHarness.offered()).toBe(true)

    const off = testHarness.run('off')
    expect(off).toEqual({ kind: 'success', text: 'Visuelle Karten: aus.' })
    expect(testHarness.offered()).toBe(false)

    const on = testHarness.run(' on ')
    expect(on).toEqual({ kind: 'success', text: 'Visuelle Karten: an.' })
    expect(testHarness.offered()).toBe(true)
  })

  test('reports status and rejects unknown input', () => {
    const testHarness = harness()
    expect(testHarness.run('status')).toEqual({ kind: 'success', text: 'Visuelle Karten: an.' })
    testHarness.run('off')
    expect(testHarness.run('')).toEqual({ kind: 'success', text: 'Visuelle Karten: aus.' })

    const invalid = testHarness.run('vielleicht')
    expect(invalid.kind).toBe('error')
  })

  test('starts withdrawn when the loader config disables the offer', () => {
    const testHarness = harness({ offerTool: false })
    expect(testHarness.offered()).toBe(false)
    expect(testHarness.guidance().length).toBe(0)
    expect(testHarness.run('status')).toEqual({ kind: 'success', text: 'Visuelle Karten: aus.' })

    testHarness.run('on')
    expect(testHarness.offered()).toBe(true)
  })
})
