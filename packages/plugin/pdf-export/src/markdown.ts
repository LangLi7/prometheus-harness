/**
 * Markdown → Typst markup.
 *
 * The chat writes GFM-ish Markdown. Typst is a markup language too, but its
 * escape rules differ and a few constructs (`#table`, `#raw`, `#link`) are code
 * calls. This converter handles the subset a chat answer actually uses —
 * headings, paragraphs, lists, quotes, fenced code, pipe tables, inline code,
 * emphasis, links, and math — and nothing else. Anything it does not understand
 * prints as text, never as broken Typst.
 *
 * @module @prometheus-harness/pdf-export/markdown
 */

import { latexToTypst } from './math.ts'

/** Characters Typst would read as markup if they appeared bare. */
const SPECIAL = /[\\#$*_@<>`]/gu

/**
 * Escape literal text for Typst content.
 *
 * @param text - plain text run.
 * @returns the escaped run.
 */
export function escapeTypst(text: string): string {
  return text.replace(SPECIAL, (character) => `\\${character}`)
}

/**
 * Escape a string for a Typst string literal.
 *
 * @param text - source text.
 * @returns the quoted literal.
 */
export function typstString(text: string): string {
  return `"${text.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"').replace(/\r?\n/gu, '\\n')}"`
}

/**
 * Convert inline Markdown to Typst content.
 *
 * @param source - one line or paragraph.
 * @returns inline Typst markup.
 */
export function inlineToTypst(source: string): string {
  let out = ''
  let index = 0
  const plain: string[] = []
  const flush = (): void => {
    if (plain.length === 0) return
    out += escapeTypst(plain.join(''))
    plain.length = 0
  }

  while (index < source.length) {
    const character = source[index] ?? ''

    if (character === '\\' && index + 1 < source.length) {
      plain.push(source[index + 1] ?? '')
      index += 2
      continue
    }

    if (character === '`') {
      let run = 1
      while (source[index + run] === '`') run += 1
      const marker = '`'.repeat(run)
      const end = source.indexOf(marker, index + run)
      if (end > index) {
        flush()
        out += `#raw(${typstString(source.slice(index + run, end).trim())})`
        index = end + run
        continue
      }
      // An unbalanced backtick run stays text; escapeTypst turns it literal.
    }

    if (character === '$') {
      const end = source.indexOf('$', index + 1)
      if (end > index) {
        flush()
        const latex = source.slice(index + 1, end)
        const typst = latexToTypst(latex)
        out += typst === null ? `#raw(${typstString(latex)})` : `$${typst}$`
        index = end + 1
        continue
      }
    }

    if (character === '*' || character === '_') {
      const double = source.startsWith(character + character, index)
      const marker = double ? character + character : character
      const end = source.indexOf(marker, index + marker.length)
      if (end > index + marker.length) {
        flush()
        const inner = inlineToTypst(source.slice(index + marker.length, end))
        out += double || character === '*' ? `*${inner}*` : `_${inner}_`
        index = end + marker.length
        continue
      }
    }

    // `![alt](src)` — a local file cannot be embedded from stdin, and a bare
    // `!` in front of a link is noise. Keep the label, link the source.
    if (source.startsWith('![', index)) {
      const match = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/u.exec(source.slice(index))
      if (match !== null) {
        flush()
        const label = (match[1] ?? '').trim() || 'Bild'
        const url = match[2] ?? ''
        out += /^https?:/u.test(url)
          ? `#link(${typstString(url)})[${inlineToTypst(label)}]`
          : `#text(fill: ${'rgb("#6b7280")'})[Bild: ${inlineToTypst(label)}]`
        index += match[0].length
        continue
      }
    }

    if (character === '[') {
      const match = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/u.exec(source.slice(index))
      if (match !== null) {
        flush()
        out += `#link(${typstString(match[2] ?? '')})[${inlineToTypst(match[1] ?? '')}]`
        index += match[0].length
        continue
      }
    }

    plain.push(character)
    index += 1
  }

  flush()
  return out
}

interface TableRow {
  readonly cells: readonly string[]
}

/** Split one pipe-table line into trimmed cells. */
function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/u, '').replace(/\|$/u, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

/** Whether a table's separator line (`|---|:--:|`) is valid. */
function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/u.test(line)
}

function renderTable(rows: readonly TableRow[]): string {
  const header = rows[0]
  if (header === undefined) return ''
  const columnCount = header.cells.length
  const body = rows.slice(1)
  const lines = [
    `#table(`,
    `  columns: ${String(columnCount)},`,
    `  inset: (x: 7pt, y: 5pt),`,
    `  stroke: (x: 0pt, y: 0.5pt + luma(214)),`,
    `  table.header(${header.cells.map((cell) => (cell.trim() === '' ? '[]' : `[*${inlineToTypst(cell)}*]`)).join(', ')}),`,
  ]
  for (const row of body) {
    const cells = Array.from({ length: columnCount }, (_, index) => row.cells[index] ?? '')
    lines.push(`  ${cells.map((cell) => `[${inlineToTypst(cell)}]`).join(', ')},`)
  }
  lines.push(`)`)
  return lines.join('\n')
}

/**
 * Convert one Markdown document to Typst markup.
 *
 * @param markdown - message body.
 * @param headingShift - levels to promote, so the document outline starts at 1.
 * @returns Typst markup for the document body (no page setup).
 */
export function markdownToTypst(markdown: string, headingShift = 0): string {
  const lines = markdown.replace(/\r\n/gu, '\n').split('\n')
  const out: string[] = []
  let index = 0

  const flushParagraph = (paragraph: string[]): void => {
    if (paragraph.length === 0) return
    out.push(inlineToTypst(paragraph.join(' ').trim()))
    out.push('')
    paragraph.length = 0
  }
  const paragraph: string[] = []

  while (index < lines.length) {
    const line = lines[index] ?? ''

    const fence = /^\s*(```+|~~~+)\s*([A-Za-z0-9_+-]*)\s*$/u.exec(line)
    if (fence !== null) {
      flushParagraph(paragraph)
      const marker = fence[1] ?? '```'
      const language = fence[2] ?? ''
      const body: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith(marker)) {
        body.push(lines[index] ?? '')
        index += 1
      }
      index += 1
      const raw = body.join('\n')
      // The document template styles block raw; the converter only emits it.
      out.push(`#raw(${typstString(raw)}${language === '' ? '' : `, lang: ${typstString(language)}`}, block: true)`)
      out.push('')
      continue
    }

    if (line.trim().startsWith('|') && isTableSeparator(lines[index + 1] ?? '')) {
      flushParagraph(paragraph)
      const rows: TableRow[] = [{ cells: tableCells(line) }]
      index += 2
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('|')) {
        rows.push({ cells: tableCells(lines[index] ?? '') })
        index += 1
      }
      out.push(renderTable(rows))
      out.push('')
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/u.exec(line)
    if (heading !== null) {
      flushParagraph(paragraph)
      const level = (heading[1] ?? '#').length
      out.push(`${'='.repeat(Math.max(1, level - headingShift))} ${inlineToTypst(heading[2] ?? '')}`)
      out.push('')
      index += 1
      continue
    }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/u.test(line)) {
      flushParagraph(paragraph)
      out.push('#line(length: 100%, stroke: 0.5pt + luma(210))')
      out.push('')
      index += 1
      continue
    }

    const orderedItem = /^\s*(\d+)[.)]\s+(.*)$/u.exec(line)
    if (orderedItem !== null) {
      flushParagraph(paragraph)
      const run: { number: number; text: string }[] = [{ number: Number(orderedItem[1]), text: orderedItem[2] ?? '' }]
      let probe = index + 1
      while (probe < lines.length) {
        const next = /^\s*(\d+)[.)]\s+(.*)$/u.exec(lines[probe] ?? '')
        if (next === null) break
        const number = Number(next[1])
        if (number !== (run.at(-1)?.number ?? 0) + 1) break
        run.push({ number, text: next[2] ?? '' })
        probe += 1
      }
      /*
       * A numbered line followed by prose is a single authored step, not a list.
       * Rendering every isolated "1." as a Typst enum restarted the counter and
       * produced three "1." in a row; a contiguous 1,2,3 run is a real list.
       */
      if (run.length > 1 && run[0]?.number === 1) {
        for (const item of run) out.push(`+ ${inlineToTypst(item.text)}`)
        index = probe
      } else {
        for (const item of run) out.push(`${String(item.number)}. ${inlineToTypst(item.text)}`)
        index = probe
      }
      out.push('')
      continue
    }

    const listItem = /^\s*[-*+]\s+(.*)$/u.exec(line)
    if (listItem !== null) {
      flushParagraph(paragraph)
      out.push(`- ${inlineToTypst(listItem[1] ?? '')}`)
      index += 1
      while (index < lines.length && /^\s{2,}[-*+]\s+/u.test(lines[index] ?? '')) {
        const nested = /^\s{2,}[-*+]\s+(.*)$/u.exec(lines[index] ?? '')
        if (nested !== null) out.push(`  - ${inlineToTypst(nested[1] ?? '')}`)
        index += 1
      }
      if (index >= lines.length || !/^\s*([-*+]|\d+[.)])\s+/u.test(lines[index] ?? '')) out.push('')
      continue
    }

    if (/^\s*>\s?/u.test(line)) {
      flushParagraph(paragraph)
      const quoted: string[] = []
      while (index < lines.length && /^\s*>\s?/u.test(lines[index] ?? '')) {
        quoted.push((lines[index] ?? '').replace(/^\s*>\s?/u, ''))
        index += 1
      }
      out.push('#block(inset: (left: 10pt), stroke: (left: 2pt + luma(200)), above: 6pt, below: 10pt)[')
      out.push(`  ${inlineToTypst(quoted.join(' '))}`)
      out.push(']')
      out.push('')
      continue
    }

    if (line.trim() === '') {
      flushParagraph(paragraph)
      index += 1
      continue
    }

    paragraph.push(line.trim())
    index += 1
  }

  flushParagraph(paragraph)
  return out.join('\n').trim()
}
