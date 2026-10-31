import { describe, expect, test } from 'bun:test'
import {
  describeSpec,
  formatNumber,
  MAX_CODE_LINES,
  MAX_FALLBACK_TEXT,
  MAX_IMAGE_BOX,
  MAX_IMAGE_SOURCE,
  MAX_LABELS,
  MIN_IMAGE_BOX,
  parseRichArguments,
  readRichSpec,
} from '../src/spec.ts'

const chart = {
  kind: 'chart',
  title: 'Umsatzentwicklung',
  chart: {
    type: 'line',
    labels: ['Jan', 'Feb', 'Mär', 'Apr'],
    series: [{ key: 'revenue', label: 'Umsatz', values: [120, 180, 150, 240] }],
  },
}

describe('readRichSpec', () => {
  test('normalizes a chart with one series', () => {
    const result = readRichSpec(chart)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spec.kind).toBe('chart')
    expect(result.spec.title).toBe('Umsatzentwicklung')
    expect(result.spec.chart?.labels).toEqual(['Jan', 'Feb', 'Mär', 'Apr'])
    expect(result.spec.chart?.series[0]?.values).toEqual([120, 180, 150, 240])
  })

  test('rejects a series whose value count differs from the labels', () => {
    const result = readRichSpec({
      ...chart,
      chart: { ...chart.chart, series: [{ key: 'a', label: 'A', values: [1, 2] }] },
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('values for')
  })

  test('rejects duplicate series keys', () => {
    const result = readRichSpec({
      kind: 'chart',
      chart: {
        type: 'bar',
        labels: ['a'],
        series: [
          { key: 'x', label: 'A', values: [1] },
          { key: 'x', label: 'B', values: [2] },
        ],
      },
    })
    expect(result.ok).toBe(false)
  })

  test('rejects more labels than the card accepts', () => {
    const labels = Array.from({ length: MAX_LABELS + 1 }, (_, index) => `L${String(index)}`)
    const result = readRichSpec({
      kind: 'chart',
      chart: { type: 'line', labels, series: [{ key: 'a', label: 'A', values: labels.map(() => 1) }] },
    })
    expect(result.ok).toBe(false)
  })

  test('accepts statistics and formats table cells', () => {
    const stats = readRichSpec({ kind: 'stats', stats: [{ label: 'Nutzer', value: '2.000' }] })
    expect(stats.ok).toBe(true)

    const table = readRichSpec({
      kind: 'table',
      table: {
        columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', align: 'right' }],
        rows: [['Text', 1234.5], [true, 'x']],
      },
    })
    expect(table.ok).toBe(true)
    if (!table.ok) return
    expect(table.spec.table?.rows[0]).toEqual(['Text', '1.234,5'])
    expect(table.spec.table?.rows[1]).toEqual(['true', 'x'])
  })

  test('rejects a table row with the wrong cell count', () => {
    const result = readRichSpec({
      kind: 'table',
      table: { columns: [{ key: 'a', label: 'A' }], rows: [['x', 'y']] },
    })
    expect(result.ok).toBe(false)
  })

  test('accepts an https image and rejects a script URL', () => {
    const good = readRichSpec({ kind: 'image', image: { src: 'https://example.com/a.png', alt: 'A' } })
    expect(good.ok).toBe(true)

    for (const src of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html;base64,AAAA']) {
      const bad = readRichSpec({ kind: 'image', image: { src, alt: 'A' } })
      expect(bad.ok).toBe(false)
    }
  })

  test('accepts inline image data', () => {
    const result = readRichSpec({
      kind: 'image',
      image: { src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'pixel' },
    })
    expect(result.ok).toBe(true)
  })

  test('requires note text for kind "note"', () => {
    expect(readRichSpec({ kind: 'note', note: '  ' }).ok).toBe(false)
    expect(readRichSpec({ kind: 'note', note: 'Wichtig.' }).ok).toBe(true)
  })

  test('rejects an unknown kind', () => {
    const result = readRichSpec({ kind: 'video' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('kind')
  })

  test('lifts a flattened table payload', () => {
    const result = readRichSpec({ kind: 'table', columns: [{ key: 'a', label: 'A' }], rows: [['x']] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spec.table?.rows).toEqual([['x']])
  })

  test('lifts a flattened chart payload with chartType', () => {
    const result = readRichSpec({
      kind: 'chart',
      chartType: 'bar',
      labels: ['A', 'B'],
      series: [{ key: 'x', label: 'X', values: [1, 2] }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spec.chart?.type).toBe('bar')
  })

  test('lifts a flattened image payload', () => {
    const result = readRichSpec({ kind: 'image', src: 'https://example.com/a.png', alt: 'A' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spec.image?.src).toBe('https://example.com/a.png')
  })

  test('still rejects a table without any payload', () => {
    const result = readRichSpec({ kind: 'table' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('table')
  })
})

describe('prose and code', () => {
  test('requires prose text', () => {
    expect(readRichSpec({ kind: 'prose', prose: {} }).ok).toBe(false)
    expect(readRichSpec({ kind: 'prose', prose: { text: 'Hallo.' } }).ok).toBe(true)
  })

  test('rejects a script URL inside a prose image', () => {
    const result = readRichSpec({ kind: 'prose', prose: { text: 'x', image: { src: 'javascript:alert(1)' } } })
    expect(result.ok).toBe(false)
  })

  test('clamps the inline image box to the accepted range', () => {
    const wide = readRichSpec({
      kind: 'prose',
      prose: { text: 'x', image: { src: 'https://example.com/a.png', boxWidth: 9999 } },
    })
    expect(wide.ok).toBe(true)
    if (!wide.ok) return
    expect(wide.spec.prose?.image?.boxWidth).toBe(MAX_IMAGE_BOX)

    const narrow = readRichSpec({
      kind: 'prose',
      prose: { text: 'x', image: { src: 'https://example.com/a.png', boxWidth: 2 } },
    })
    expect(narrow.ok).toBe(true)
    if (!narrow.ok) return
    expect(narrow.spec.prose?.image?.boxWidth).toBe(MIN_IMAGE_BOX)
  })

  test('caps a code card at the line limit and says so', () => {
    const content = Array.from({ length: MAX_CODE_LINES + 10 }, (_, index) => `line ${String(index)}`).join('\n')
    const result = readRichSpec({ kind: 'code', code: { content } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spec.code?.truncated).toBe(true)
    expect(result.spec.code?.content.split('\n')).toHaveLength(MAX_CODE_LINES)
  })

  test('normalizes CRLF and keeps only a sane language tag', () => {
    const result = readRichSpec({ kind: 'code', code: { content: 'a\r\nb', language: 'TypeScript' } })
    if (!result.ok) throw new Error(result.error)
    expect(result.spec.code?.content).toBe('a\nb')
    expect(result.spec.code?.language).toBe('typescript')

    const bad = readRichSpec({ kind: 'code', code: { content: 'a', language: 'not a tag!' } })
    if (!bad.ok) throw new Error(bad.error)
    expect(bad.spec.code?.language).toBeUndefined()
  })

  test('lifts a flattened code payload', () => {
    const result = readRichSpec({ kind: 'code', content: 'x\ny' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spec.code?.content).toBe('x\ny')
  })

  test('refuses an over-long image address instead of cutting it', () => {
    const long = `https://example.com/${'a'.repeat(MAX_IMAGE_SOURCE)}.png`
    const result = readRichSpec({ kind: 'image', image: { src: long, alt: 'A' } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('longer than')
  })

  test('accepts an inline image that is large enough to matter', () => {
    const src = `data:image/png;base64,${'A'.repeat(4000)}`
    const result = readRichSpec({ kind: 'image', image: { src, alt: 'A' } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spec.image?.src).toBe(src)
  })

  test('reads a file list and keeps only known changes', () => {
    const result = readRichSpec({
      kind: 'files',
      files: {
        items: [
          { path: 'src/a.ts', change: 'modified', added: 3, removed: 1 },
          { path: 'src/b.ts', change: 'moved' },
        ],
        more: 2,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spec.files?.items).toHaveLength(2)
    expect(result.spec.files?.items[0]?.change).toBe('modified')
    expect(result.spec.files?.items[1]?.change).toBeUndefined()
    expect(result.spec.files?.more).toBe(2)
  })

  test('rejects an empty file list and an over-long path', () => {
    expect(readRichSpec({ kind: 'files', files: { items: [] } }).ok).toBe(false)
    expect(readRichSpec({ kind: 'files' }).ok).toBe(false)

    const longPath = `src/${'a'.repeat(220)}.ts`
    const result = readRichSpec({ kind: 'files', files: { items: [{ path: longPath }] } })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('200 characters')
  })

  test('lifts a flattened file payload', () => {
    const result = readRichSpec({ kind: 'files', items: [{ path: 'a.ts' }] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spec.files?.items[0]?.path).toBe('a.ts')
  })

  test('writes a file fallback with the first entries', () => {
    const result = readRichSpec({
      kind: 'files',
      files: { items: [{ path: 'a.ts', added: 4 }, { path: 'b.ts' }], more: 7 },
    })
    if (!result.ok) throw new Error(result.error)
    const text = describeSpec(result.spec)
    expect(text).toContain('a.ts +4')
    expect(text).toContain('7 not listed')
  })

  test('writes a code fallback with its name and first lines', () => {
    const result = readRichSpec({ kind: 'code', code: { content: 'a\nb', filename: 'f.ts' } })
    if (!result.ok) throw new Error(result.error)
    const text = describeSpec(result.spec)
    expect(text).toContain('f.ts')
    expect(text).toContain('a\nb')
  })
})

describe('parseRichArguments', () => {
  test('parses the recorded argument string', () => {
    const result = parseRichArguments(JSON.stringify(chart))
    expect(result.ok).toBe(true)
  })

  test('reports truncated JSON instead of throwing', () => {
    const result = parseRichArguments('{"kind":')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('JSON')
  })

  test('reports absent arguments', () => {
    expect(parseRichArguments(null).ok).toBe(false)
    expect(parseRichArguments('   ').ok).toBe(false)
  })
})

describe('formatNumber', () => {
  test('groups thousands and trims decimals', () => {
    expect(formatNumber(1234)).toBe('1.234')
    expect(formatNumber(1234.5)).toBe('1.234,5')
    expect(formatNumber(-12.25)).toBe('-12,25')
    expect(formatNumber(0)).toBe('0')
  })

  test('renders non-finite values as a dash', () => {
    expect(formatNumber(Number.NaN)).toBe('–')
  })
})

describe('describeSpec', () => {
  test('writes a readable chart line with its unit', () => {
    const result = readRichSpec(chart)
    if (!result.ok) throw new Error(result.error)
    const text = describeSpec(result.spec)
    expect(text).toContain('Umsatzentwicklung')
    expect(text).toContain('Umsatz: Jan 120, Feb 180, Mär 150, Apr 240')
  })

  test('caps the table fallback and names the omitted rows', () => {
    const rows = Array.from({ length: 9 }, (_, index) => [`Zeile ${String(index)}`])
    const result = readRichSpec({ kind: 'table', table: { columns: [{ key: 'a', label: 'A' }], rows } })
    if (!result.ok) throw new Error(result.error)
    const text = describeSpec(result.spec)
    expect(text).toContain('… 3 more rows')
  })

  test('never exceeds the fallback budget', () => {
    const rows = Array.from({ length: 50 }, (_, index) => [`${String(index)} ${'x'.repeat(40)}`])
    const result = readRichSpec({ kind: 'table', table: { columns: [{ key: 'a', label: 'A' }], rows } })
    if (!result.ok) throw new Error(result.error)
    expect(describeSpec(result.spec).length).toBeLessThanOrEqual(MAX_FALLBACK_TEXT)
  })

  test('keeps the note body', () => {
    const result = readRichSpec({ kind: 'note', note: 'Wichtig.' })
    if (!result.ok) throw new Error(result.error)
    expect(describeSpec(result.spec)).toBe('Wichtig.')
  })
})
