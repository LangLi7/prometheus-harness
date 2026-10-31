import { describe, expect, test } from 'bun:test'
import { installPlan } from '../src/install.ts'
import { latexToTypst } from '../src/math.ts'
import { escapeTypst, inlineToTypst, markdownToTypst } from '../src/markdown.ts'
import { foldTranscript, sliceAtTurn } from '../src/model.ts'
import { attachmentHeader, readExportQuery } from '../src/server.ts'
import { documentFileName } from '../src/typst.ts'

describe('latexToTypst', () => {
  test('translates fractions, roots, and Greek letters', () => {
    expect(latexToTypst('\\frac{a}{b}')).toBe('frac(a, b)')
    expect(latexToTypst('\\sqrt{x^2 + 1}')).toBe('sqrt(x^2 + 1)')
    expect(latexToTypst('\\alpha \\le \\beta')).toBe('alpha <= beta')
  })

  test('translates text and operators', () => {
    expect(latexToTypst('\\text{km/h}')).toBe('"km/h"')
    expect(latexToTypst('a \\cdot b')).toBe('a dot b')
  })

  test('fails closed on an unknown command', () => {
    expect(latexToTypst('\\foo{x}')).toBeNull()
    expect(latexToTypst('\\begin{matrix}')).toBeNull()
  })
})

describe('markdownToTypst', () => {
  test('escapes Typst markup in plain text', () => {
    expect(escapeTypst('a # b *c* _d_')).toBe('a \\# b \\*c\\* \\_d\\_')
  })

  test('keeps emphasis and inline code', () => {
    expect(inlineToTypst('**fett** und `code`')).toBe('*fett* und #raw("code")')
  })

  test('turns headings, lists, and fences into Typst', () => {
    const typst = markdownToTypst('## Titel\n\n- eins\n- zwei\n\n```ts\nconst x = 1\n```')
    expect(typst).toContain('== Titel')
    expect(typst).toContain('- eins')
    expect(typst).toContain('#raw("const x = 1", lang: "ts", block: true)')
  })

  test('renders a pipe table', () => {
    const typst = markdownToTypst('| A | B |\n| --- | --- |\n| 1 | 2 |')
    expect(typst).toContain('#table(')
    expect(typst).toContain('table.header([*A*], [*B*])')
    expect(typst).toContain('[1], [2],')
  })

  test('keeps math through the translator', () => {
    expect(inlineToTypst('x = $\\frac{1}{2}$')).toBe('x = $frac(1, 2)$')
  })
})

describe('foldTranscript', () => {
  const events = [
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Frage?' }] } },
    { type: 'user/message', data: { source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'Current runtime context. …' }] } },
    { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'reasoning', text: 'denken' }, { type: 'text', text: 'Antwort.' }] } } },
    { type: 'tool/call', data: { turn: 1, name: 'render_ui', callId: 'c1', arguments: '{"kind":"note","note":"Karte"}' } },
  ]

  test('keeps authored messages and drops injected context', () => {
    const transcript = foldTranscript(events, { cwd: 'C:/x/repo' })
    expect(transcript.title).toBe('Frage?')
    expect(transcript.blocks.map((block) => block.kind)).toEqual(['user', 'assistant', 'card'])
  })

  test('ignores an invalid card instead of printing JSON', () => {
    const transcript = foldTranscript([
      { type: 'tool/call', data: { name: 'render_ui', arguments: '{"kind":"table"}' } },
    ])
    expect(transcript.blocks).toEqual([])
  })

  test('summarizes each turn for the protocol appendix', () => {
    const transcript = foldTranscript([
      { type: 'turn/start', data: { turn: 1 }, time: 1000 },
      { type: 'tool/call', data: { turn: 1, name: 'read' } },
      { type: 'tool/call', data: { turn: 1, name: 'read' } },
      { type: 'tool/result', data: { turn: 1, message: { isError: true } } },
      { type: 'assistant/message', data: { turn: 1, usage: { inputTokens: 100, outputTokens: 20, totalTokens: 9999 }, message: { content: [{ type: 'text', text: 'Antwort' }] } } },
      { type: 'turn/end', data: { turn: 1 }, time: 61000 },
    ])
    expect(transcript.protocol).toEqual([
      { turn: 1, durationMs: 60000, tools: [{ name: 'read', count: 2 }], tokens: 120, errors: 1 },
    ])
  })

  test('keeps one turn with its prompt, answer, and cards', () => {
    const transcript = foldTranscript([
      { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Erste Frage' }] } },
      { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: 'Erste Antwort' }] } } },
      { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Zweite Frage' }] } },
      { type: 'assistant/message', data: { turn: 2, message: { content: [{ type: 'text', text: 'Zweite Antwort' }] } } },
      { type: 'tool/call', data: { turn: 2, name: 'render_ui', arguments: '{"kind":"note","note":"Karte"}' } },
    ])
    const sliced = sliceAtTurn(transcript, 2)
    expect(sliced.blocks.map((block) => block.kind)).toEqual(['user', 'assistant', 'card'])
    expect(sliced.blocks[0]?.kind === 'user' ? sliced.blocks[0].text : '').toBe('Zweite Frage')
  })
})

describe('installPlan', () => {
  test('uses the platform package manager', () => {
    expect(installPlan('win32').method).toBe('winget')
    expect(installPlan('win32').command).toContain('Typst.Typst')
    expect(installPlan('darwin').method).toBe('brew')
    expect(installPlan('darwin').command).toEqual(['brew', 'install', 'typst'])
    expect(installPlan('linux').method).toBe('cargo')
  })
})

describe('readExportQuery', () => {
  test('accepts the three modes', () => {
    expect(readExportQuery('http://x/api/chat.pdf?session=s1').ok).toBe(true)
    expect(readExportQuery('http://x/api/chat.pdf?session=s1&mode=last').ok).toBe(true)
    expect(readExportQuery('http://x/api/chat.pdf?session=s1&mode=message&message=m1').ok).toBe(true)
  })

  test('rejects a missing session or message', () => {
    expect(readExportQuery('http://x/api/chat.pdf').ok).toBe(false)
    expect(readExportQuery('http://x/api/chat.pdf?session=s1&mode=message').ok).toBe(false)
    expect(readExportQuery('http://x/api/chat.pdf?session=s1&mode=video').ok).toBe(false)
  })
})

describe('attachmentHeader', () => {
  test('keeps the header ASCII and drops quotes', () => {
    const header = attachmentHeader('ich-möchte-"x".pdf')
    expect(/^[\x20-\x7e]*$/u.test(header)).toBe(true)
    expect(header).toBe('attachment; filename="ich-m-chte-x.pdf"')
  })

  test('falls back for an empty name', () => {
    expect(attachmentHeader('')).toBe('attachment; filename="chat.pdf"')
  })
})

describe('documentFileName', () => {
  test('stays ASCII for a German title with a pasted URL', () => {
    const transcript = {
      title: 'ich möchte das http://127.0.0.1:3080/api/chat.pdf?session=abc',
      workspace: '',
      startedAt: null,
      blocks: [],
      protocol: [],
    }
    const name = documentFileName(transcript)
    expect(/^[\x20-\x7e]+$/u.test(name)).toBe(true)
    expect(name).not.toContain('Ã')
    expect(name).toBe('ich-moechte-das.pdf')
  })

  test('falls back to chat when the title has no usable characters', () => {
    expect(documentFileName({ title: '???', workspace: '', startedAt: null, blocks: [], protocol: [] })).toBe('chat.pdf')
  })
})
