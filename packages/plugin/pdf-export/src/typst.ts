/**
 * The Typst document: cover, transcript, cards, colophon.
 *
 * Layout is a design decision, so it lives here in one readable template instead
 * of being assembled from options. The rules are simple: a quiet cover, a reading
 * column with a clear speaker label, cards that look like cards, and page numbers
 * a reader can cite.
 *
 * @module @prometheus-harness/pdf-export/typst
 */

import { markdownToTypst, escapeTypst, typstString } from './markdown.ts'
import type { CardBlock, DocumentBlock, Transcript } from './model.ts'
import type { RichSpec } from '../../rich-ui/src/spec.ts'

const ACCENT = 'rgb("#4f8cff")'
const INK = 'rgb("#17181c")'
const MUTED = 'rgb("#6b7280")'
const HAIRLINE = 'luma(224)'

function formatDate(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('de-CH', { dateStyle: 'long', timeStyle: 'short' }).format(date)
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '–'
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value)
}

/** Human duration: seconds under a minute, minutes and seconds above. */
function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return '—'
  const seconds = Math.round(milliseconds / 1000)
  if (seconds < 60) return `${String(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes)} min ${String(seconds % 60)} s`
}

function renderStats(spec: RichSpec): string {
  const stats = spec.stats ?? []
  const columns = Math.min(stats.length, 4)
  const tiles = stats
    .map((stat) => [
      `  [#block(fill: luma(247), radius: 4pt, inset: 9pt, width: 100%)[`,
      `    #text(size: 15pt, weight: "semibold")[${escapeTypst(stat.value)}]`,
      `    #v(2pt)`,
      `    #text(size: 8.5pt, fill: ${MUTED})[${escapeTypst(stat.label)}]`,
      stat.hint === undefined ? '' : `    #v(1pt) #text(size: 7.5pt, fill: ${MUTED})[${escapeTypst(stat.hint)}]`,
      `  ]]`,
    ].filter((line) => line !== '').join('\n'))
    .join(',\n')
  return `#grid(columns: (1fr,) * ${String(columns)}, gutter: 8pt,\n${tiles}\n)`
}

function renderTable(spec: RichSpec): string {
  const table = spec.table
  if (table === undefined) return ''
  const lines = [
    '#table(',
    `  columns: ${String(table.columns.length)},`,
    '  inset: (x: 7pt, y: 5pt),',
    `  stroke: (x: 0pt, y: 0.5pt + ${HAIRLINE}),`,
    `  table.header(${table.columns.map((column) => (column.label.trim() === '' ? '[]' : `[*${escapeTypst(column.label)}*]`)).join(', ')}),`,
  ]
  for (const row of table.rows) {
    lines.push(`  ${row.map((cell) => `[${escapeTypst(cell)}]`).join(', ')},`)
  }
  lines.push(')')
  return lines.join('\n')
}

/** Bar charts as bars; line charts as a value table — no drawing library in a PDF. */
function renderChart(spec: RichSpec): string {
  const chart = spec.chart
  if (chart === undefined) return ''
  const unit = chart.unit === undefined ? '' : ` ${chart.unit}`
  if (chart.type === 'bar') {
    const maximum = Math.max(1, ...chart.series.flatMap((series) => series.values))
    const seriesRows = chart.series.map((series) => {
      const bars = chart.labels
        .map((_label, index) => {
          const value = series.values[index] ?? 0
          const height = Math.max(2, Math.round((value / maximum) * 64))
          return `[#rect(width: 100%, height: ${String(height)}pt, fill: ${ACCENT})]`
        })
        .join(', ')
      const labels = chart.labels.map((label) => `[#text(size: 7pt, fill: ${MUTED})[${escapeTypst(label)}]]`).join(', ')
      return [
        `  #text(size: 8pt, fill: ${MUTED})[${escapeTypst(series.label)}${escapeTypst(unit)}]`,
        `  #grid(columns: (1fr,) * ${String(chart.labels.length)}, rows: 64pt, gutter: 3pt, align: bottom, ${bars})`,
        `  #grid(columns: (1fr,) * ${String(chart.labels.length)}, gutter: 3pt, ${labels})`,
        `  #v(6pt)`,
      ].join('\n')
    })
    return seriesRows.join('\n')
  }

  const header = ['[#text(size: 8pt)[Wert]]', ...chart.series.map((series) => `[#text(size: 8pt)[${escapeTypst(series.label)}]]`)].join(', ')
  const rows = chart.labels.map((label, index) => {
    const cells = chart.series.map((series) => `[${formatNumber(series.values[index] ?? 0)}${escapeTypst(unit)}]`)
    return `  [${escapeTypst(label)}], ${cells.join(', ')},`
  })
  return [
    '#table(',
    `  columns: ${String(chart.series.length + 1)},`,
    '  inset: (x: 6pt, y: 4pt),',
    `  stroke: (x: 0pt, y: 0.5pt + ${HAIRLINE}),`,
    `  table.header(${header}),`,
    ...rows,
    ')',
  ].join('\n')
}

function renderCard(card: CardBlock): string {
  const spec = card.spec
  const body = spec.kind === 'stats'
    ? renderStats(spec)
    : spec.kind === 'table'
      ? renderTable(spec)
      : spec.kind === 'chart'
        ? renderChart(spec)
        : spec.kind === 'image'
          ? `#text(size: 9pt, fill: ${MUTED})[Bild: ${escapeTypst(spec.image?.src ?? '')}]`
          : (spec.note ?? '').split('\n').map((line) => escapeTypst(line)).join('\n\n')

  const parts = [
    `#block(width: 100%, stroke: 0.6pt + ${HAIRLINE}, radius: 5pt, inset: 12pt, above: 9pt, below: 12pt)[`,
  ]
  if (spec.title !== undefined) parts.push(`  #text(size: 11pt, weight: "semibold")[${escapeTypst(spec.title)}]`, '  #v(2pt)')
  if (spec.subtitle !== undefined) parts.push(`  #text(size: 8.5pt, fill: ${MUTED})[${escapeTypst(spec.subtitle)}]`, '  #v(7pt)')
  parts.push(`  ${body.replace(/\n/gu, '\n  ')}`)
  if (spec.footer !== undefined) parts.push('  #v(6pt)', `  #text(size: 7.5pt, fill: ${MUTED})[${escapeTypst(spec.footer)}]`)
  parts.push(']')
  return parts.join('\n')
}

function renderBlock(block: DocumentBlock, headingShift: number): string {
  if (block.kind === 'card') return renderCard(block)
  const body = markdownToTypst(block.text, headingShift)
  /*
   * One speech treatment for both sides, separated by the rule colour: a grey
   * rule for the person, the accent for the assistant. A full tinted card behind
   * a pasted multi-page message turns the document into stacked boxes; the rule
   * keeps the speaker legible without competing with tables and cards.
   */
  const rule = block.kind === 'user' ? 'luma(185)' : ACCENT
  const label = block.kind === 'user' ? 'DU' : 'PROMETHEUS'
  return [
    `#block(width: 100%, inset: (left: 14pt), stroke: (left: 2.4pt + ${rule}), above: 14pt, below: 10pt)[`,
    `  #text(size: 8pt, fill: ${MUTED}, tracking: 1.1pt)[${label}]`,
    `  #v(5pt)`,
    `  ${body.replace(/\n/gu, '\n  ')}`,
    `]`,
  ].join('\n')
}

/**
 * Render the whole document.
 *
 * @param transcript - folded transcript.
 * @param generatedAt - ISO timestamp of the export.
 * @returns complete Typst source.
 */
export function renderDocument(
  transcript: Transcript,
  generatedAt: string,
  options: { readonly protocol?: boolean } = {},
): string {
  const date = formatDate(transcript.startedAt)
  const workspaceName = transcript.workspace.replace(/[\\/]+/gu, '/').split('/').filter((part) => part !== '').at(-1) ?? transcript.workspace
  const cover = [
    '#page(header: none, footer: none)[',
    '  #v(6.2cm)',
    `  #text(size: 8pt, fill: ${MUTED}, tracking: 2pt)[PROMETHEUS HARNESS]`,
    '  #v(10pt)',
    `  #text(size: 23pt, weight: "semibold")[${escapeTypst(transcript.title)}]`,
    '  #v(10pt)',
    `  #line(length: 2.6cm, stroke: 2.2pt + ${ACCENT})`,
    '  #v(18pt)',
    `  #text(size: 9.5pt, fill: ${MUTED})[${escapeTypst(workspaceName)}]`,
    date === '' ? '' : `  #v(3pt)\\  #text(size: 9.5pt, fill: ${MUTED})[${escapeTypst(date)}]`,
    ']',
    '#pagebreak()',
  ].filter((line) => line !== '')

  const levels = transcript.blocks.flatMap((block) =>
    block.kind === 'card'
      ? []
      : [...block.text.matchAll(/^(#{1,6})\s/gmu)].map((match) => (match[1] ?? '#').length),
  )
  // PDF/UA requires the first heading to be level 1; a chat answer often starts
  // at "##". Promote the shallowest used level instead of failing conformance.
  const headingShift = levels.length === 0 ? 0 : Math.max(0, Math.min(...levels) - 1)
  const body = transcript.blocks.map((block) => renderBlock(block, headingShift)).join('\n\n')

  const toc = levels.length === 0 ? '' : ['#outline(title: [Inhalt], depth: 2)', '#pagebreak()'].join('\n')

  const protocol = options.protocol === true && transcript.protocol.length > 0
    ? [
        '#pagebreak()',
        '#heading(level: 1, outlined: false)[Protokoll]',
        `#text(size: 9pt, fill: ${MUTED})[Dauer, Werkzeuge und Tokens je Turn, aus dem Sitzungslog.]`,
        '#v(8pt)',
        '#table(',
        '  columns: (auto, auto, 1fr, auto, auto),',
        '  inset: (x: 7pt, y: 5pt),',
        `  stroke: (x: 0pt, y: 0.5pt + ${HAIRLINE}),`,
        '  table.header([*Turn*], [*Dauer*], [*Werkzeuge*], [*Tokens*], [*Fehler*]),',
        ...transcript.protocol.map((stat) => {
          const toolText = stat.tools.length === 0
            ? '—'
            : stat.tools.map((tool) => `${tool.name}${tool.count > 1 ? ` ×${String(tool.count)}` : ''}`).join(', ')
          return `  [${String(stat.turn)}], [${formatDuration(stat.durationMs)}], [${escapeTypst(toolText)}], [${stat.tokens === 0 ? '—' : formatNumber(stat.tokens)}], [${stat.errors === 0 ? '—' : String(stat.errors)}],`
        }),
        ')',
      ].join('\n')
    : ''

  return `#set document(title: ${typstString(transcript.title)}, author: "Prometheus Harness")
#set page(
  paper: "a4",
  margin: (x: 2.6cm, y: 2.35cm),
  numbering: "1",
  footer: context grid(
    columns: (1fr, auto),
    [#text(size: 7.5pt, fill: ${MUTED})[Prometheus Harness]],
    [#text(size: 7.5pt, fill: ${MUTED})[#counter(page).display()]],
  ),
)
#set text(font: ("Segoe UI",), size: 10.5pt, fill: ${INK}, lang: "de")
#set par(leading: 0.66em, spacing: 1.1em)
#show raw: set text(font: ("Consolas", "Courier New"), size: 8.4pt)
#show raw.where(block: true): it => block(
  width: 100%,
  fill: luma(242),
  inset: (x: 11pt, y: 9pt),
  radius: 4pt,
  above: 8pt,
  below: 11pt,
  it,
)
#show link: it => [#text(fill: ${ACCENT})[#it]]
#show heading: it => block(breakable: false, above: 1.2em, below: 0.6em)[
  #text(size: if it.level == 1 { 16pt } else if it.level == 2 { 13pt } else { 11.5pt }, weight: "semibold")[#it.body]
]

${cover.join('\n')}
${toc}
${body}
${protocol}

#v(20pt)
#context [
  #line(length: 100%, stroke: 0.5pt + ${HAIRLINE})
  #v(5pt)
  #grid(columns: (1fr, auto),
    [#text(size: 7.5pt, fill: ${MUTED})[Exportiert am ${escapeTypst(formatDate(generatedAt))}]],
    [#text(size: 7.5pt, fill: ${MUTED})[#counter(page).final().at(0) Seiten]],
  )
]
`
}

/**
 * Suggested file name for the download.
 *
 * An HTTP header value must be ASCII: an umlaut in `Content-Disposition` is
 * rejected by the fetch layer (`invalid value`). Transliterate to ASCII, keep
 * only letters, digits, and single dashes, and cut at a readable length.
 *
 * @param transcript - exported document.
 * @returns a header-safe `.pdf` name.
 */
export function documentFileName(transcript: Transcript): string {
  const transliterated = transcript.title
    .toLowerCase()
    // A pasted URL is not a file name; dropping it leaves a readable stem.
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/ä/gu, 'ae')
    .replace(/ö/gu, 'oe')
    .replace(/ü/gu, 'ue')
    .replace(/ß/gu, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
  const slug = transliterated
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60)
    .replace(/-+$/gu, '')
  return `${slug === '' ? 'chat' : slug}.pdf`
}
