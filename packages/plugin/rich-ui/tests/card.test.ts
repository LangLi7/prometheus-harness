import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RichCard, RichError } from '../src/card.tsx'
import { RichTurnTail } from '../src/client.tsx'
import { readRichSpec } from '../src/spec.ts'
import type { RichSpec } from '../src/spec.ts'

function html(raw: unknown): string {
  const result = readRichSpec(raw)
  if (!result.ok) throw new Error(result.error)
  return renderToStaticMarkup(createElement(RichCard, { spec: result.spec }))
}

describe('RichCard', () => {
  test('renders a chart with axes, legend, and an accessible data table', () => {
    const markup = html({
      kind: 'chart',
      title: 'Umsatzentwicklung',
      subtitle: 'Demonstrationsdaten',
      footer: 'Beispieldaten',
      chart: {
        type: 'line',
        unit: '€',
        labels: ['Jan', 'Feb', 'Mär', 'Apr'],
        series: [{ key: 'revenue', label: 'Umsatz', values: [120, 180, 150, 240] }],
      },
    })
    expect(markup).toContain('Umsatzentwicklung')
    expect(markup).toContain('Demonstrationsdaten')
    expect(markup).toContain('Beispieldaten')
    expect(markup).toContain('<svg')
    expect(markup).toContain('role="img"')
    expect(markup).toContain('Umsatzentwicklung: Umsatz über 4 Kategorien')
    expect(markup).toContain('Umsatz · Apr: 240 €')
    expect(markup).toContain('<table')
    expect(markup).toContain('Mär')
  })

  test('shortens a long category label but keeps the full text in the tooltip', () => {
    const labels = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'September 2026 mit einem sehr langen Zusatz']
    const markup = html({
      kind: 'chart',
      chart: {
        type: 'line',
        labels,
        series: [{ key: 'x', label: 'X', values: labels.map((_, index) => index + 1) }],
      },
    })
    expect(markup).toContain('…')
    expect(markup).toContain('<title>September 2026 mit einem sehr langen Zusatz</title>')
  })

  test('renders a grouped bar chart', () => {
    const markup = html({
      kind: 'chart',
      chart: {
        type: 'bar',
        labels: ['Q1', 'Q2'],
        series: [
          { key: 'a', label: 'A', values: [10, 20] },
          { key: 'b', label: 'B', values: [5, 15] },
        ],
      },
    })
    expect(markup).toContain('Balkendiagramm')
    expect(markup).toContain('A · Q2: 20')
    expect((markup.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  test('renders statistic tiles', () => {
    const markup = html({
      kind: 'stats',
      title: 'Kennzahlen',
      stats: [
        { label: 'Nutzer', value: '2.000', hint: 'aktiv' },
        { label: 'Sitzungen', value: '5.000' },
      ],
    })
    expect(markup).toContain('<dl')
    expect(markup).toContain('2.000')
    expect(markup).toContain('aktiv')
  })

  test('renders a table with captions, alignment, and escaped text', () => {
    const markup = html({
      kind: 'table',
      table: {
        caption: 'Umsatz je Monat',
        columns: [
          { key: 'month', label: 'Monat' },
          { key: 'revenue', label: 'Umsatz', align: 'right' },
        ],
        rows: [
          ['Jan', 120],
          ['Feb', 180],
        ],
      },
    })
    expect(markup).toContain('Umsatz je Monat')
    expect(markup).toContain('class="pmh-rich-num"')
    expect(markup).toContain('180')
  })

  test('renders an image with alt text and caption', () => {
    const markup = html({
      kind: 'image',
      image: { src: 'https://example.com/ball.png', alt: 'Glaskugel', caption: 'Titelbild' },
    })
    expect(markup).toContain('src="https://example.com/ball.png"')
    expect(markup).toContain('alt="Glaskugel"')
    expect(markup).toContain('Titelbild')
    expect(markup).toContain('loading="lazy"')
  })

  test('renders a note preserving line breaks', () => {
    const markup = html({ kind: 'note', note: 'Zeile eins\nZeile zwei' })
    expect(markup).toContain('Zeile eins')
    expect(markup).toContain('role="note"')
  })

  test('renders the error notice', () => {
    const markup = renderToStaticMarkup(createElement(RichError, { message: 'chart.labels is missing.' }))
    expect(markup).toContain('Komponente nicht darstellbar')
    expect(markup).toContain('chart.labels is missing.')
    expect(markup).toContain('role="status"')
  })

  test('keeps the spec kind on the section for styling', () => {
    const spec: RichSpec = { kind: 'note', note: 'x' }
    const markup = renderToStaticMarkup(createElement(RichCard, { spec }))
    expect(markup).toContain('pmh-rich--note')
    expect(markup).toContain('data-pmh-rich="note"')
  })

  test('renders a prose card with the image before the text', () => {
    const markup = html({
      kind: 'prose',
      title: 'Befund',
      prose: {
        text: 'Der Screenshot zeigt die Zeitleiste.\nDie Karte misst den Umbruch.',
        image: { src: 'https://example.com/shot.png', alt: 'Screenshot', boxWidth: 160 },
      },
    })
    expect(markup).toContain('pmh-rich--prose')
    expect(markup).toContain('class="pmh-rich-prose__image"')
    expect(markup).toContain('width="160"')
    expect(markup).toContain('Die Karte misst den Umbruch.')
    expect(markup.indexOf('pmh-rich-prose__image')).toBeLessThan(markup.indexOf('pmh-rich-prose__text'))
  })

  test('renders a prose card without an image as bare text', () => {
    const markup = html({ kind: 'prose', prose: { text: 'Nur Text.' } })
    expect(markup).toContain('Nur Text.')
    expect(markup).not.toContain('pmh-rich-prose__image')
  })

  test('renders a code card with filename, line numbers, and a copy button', () => {
    const markup = html({
      kind: 'code',
      code: { filename: 'src/spec.ts', language: 'ts', content: 'const a = 1\nconst b = 2', startLine: 7 },
    })
    expect(markup).toContain('src/spec.ts')
    expect(markup).toContain('>ts<')
    expect(markup).toContain('Kopieren')
    expect(markup).toContain('>7<')
    expect(markup).toContain('>8<')
    expect(markup).toContain('const b = 2')
  })

  test('renders a file list with change badges and line counts', () => {
    const markup = html({
      kind: 'files',
      files: {
        items: [
          { path: 'src/a.ts', change: 'modified', added: 12, removed: 3 },
          { path: 'src/b.ts', change: 'added' },
        ],
        more: 4,
      },
    })
    expect(markup).toContain('src/a.ts')
    expect(markup).toContain('geändert')
    expect(markup).toContain('neu')
    expect(markup).toContain('+12')
    expect(markup).toContain('−3')
    expect(markup).toContain('und 4 weitere')
  })

  test('renders a file path as a button only when an opener exists', () => {
    const result = readRichSpec({ kind: 'files', files: { items: [{ path: 'src/a.ts' }] } })
    if (!result.ok) throw new Error(result.error)

    const plain = renderToStaticMarkup(createElement(RichCard, { spec: result.spec }))
    expect(plain).not.toContain('<button')

    const clickable = renderToStaticMarkup(createElement(RichCard, { spec: result.spec, onOpenFile: () => undefined }))
    expect(clickable).toContain('<button')
  })

  test('marks a truncated code card instead of pretending', () => {
    const content = Array.from({ length: 70 }, (_, index) => `line ${String(index)}`).join('\n')
    const markup = html({ kind: 'code', code: { content } })
    expect(markup).toContain('gekürzt')
  })
})

describe('RichTurnTail', () => {
  const spec: RichSpec = { kind: 'note', note: 'Am Ende der Antwort.' }

  function tail(states: readonly unknown[]): string {
    const snapshot = {
      nodes: {
        turnDataSource: () => ({ getSnapshot: () => states }),
      },
    }
    const useChat = (selector: (value: typeof snapshot) => unknown): unknown => selector(snapshot)
    return renderToStaticMarkup(
      createElement(RichTurnTail as never, {
        turn: { turn: 3 },
        useChat,
      } as never),
    )
  }

  test('renders the cards of the completed Turn', () => {
    const markup = tail([{ callId: 'c1', spec, error: null }])
    expect(markup).toContain('Am Ende der Antwort.')
    expect(markup).toContain('data-pmh-rich-stack')
  })

  test('renders each call once and keeps their order', () => {
    const markup = tail([
      { callId: 'c1', spec: { kind: 'note', note: 'Erste' }, error: null },
      { callId: 'c2', spec: { kind: 'note', note: 'Zweite' }, error: null },
    ])
    expect(markup.indexOf('Erste')).toBeLessThan(markup.indexOf('Zweite'))
  })

  test('stays empty without cards', () => {
    expect(tail([])).toBe('')
  })

  test('shows a rejected call as a notice', () => {
    const markup = tail([{ callId: 'c1', spec: null, error: 'chart.labels missing' }])
    expect(markup).toBe('')
    expect(markup).not.toContain('chart.labels missing')
  })

  test('keeps a rejected call out of the answer but renders the valid one', () => {
    const markup = tail([
      { callId: 'c1', spec: null, error: 'table is required for kind "table".' },
      { callId: 'c2', spec, error: null },
    ])
    expect(markup).toContain('Am Ende der Antwort.')
    expect(markup).not.toContain('Komponente nicht darstellbar')
  })
})
