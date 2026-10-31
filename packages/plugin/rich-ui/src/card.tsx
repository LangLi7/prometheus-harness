/**
 * The React card that turns one {@link RichSpec} into a chat row.
 *
 * Presentation only: no stores, no Host access. Everything comes from the
 * validated description, so the same component renders a live answer, a restored
 * transcript, and a test fixture identically.
 *
 * Two bodies are the exception, and they are separate modules on purpose: a code
 * excerpt needs a copy button and a prose card measures its own width, so each
 * brings its own hook — `code-block.tsx` and `prose.tsx`. This module keeps no
 * state of its own, and the shared frame lives in `frame.tsx` so both paths
 * render the same markup.
 */

import type { ReactElement } from 'react'
import { chartGeometry } from './chart.ts'
import type { BarGeometry, ChartPoint, LineSeriesGeometry } from './chart.ts'
import { CodeBlock } from './code-block.tsx'
import { CardFrame } from './frame.tsx'
import { ProseCard } from './prose.tsx'
import { formatNumber } from './spec.ts'
import type { ChartSpec, FileChange, FilesSpec, ImageSpec, RichSpec, StatItem, TableSpec } from './spec.ts'
import { labelWidth } from './measure.ts'

/**
 * Series colours, in order. They use theme tokens, so light and dark mode keep
 * the same contrast without a second palette.
 */
const SERIES_COLORS = [
  'var(--dsw-alias-brand-primary)',
  'var(--dsw-alias-state-business-primary)',
  'var(--dsw-alias-state-warn-primary)',
  'var(--dsw-alias-label-secondary)',
] as const

function colorOf(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0]
}

/** A short, human-readable summary used as the accessible name of the figure. */
function chartSummary(chart: ChartSpec, title: string | undefined): string {
  const series = chart.series.map((entry) => entry.label).join(', ')
  const kind = chart.type === 'line' ? 'Liniendiagramm' : 'Balkendiagramm'
  return `${title ?? kind}: ${series} über ${String(chart.labels.length)} Kategorien`
}

function Legend({ chart }: { readonly chart: ChartSpec }): ReactElement | null {
  if (chart.series.length < 2) return null
  return (
    <ul className="pmh-rich-legend" aria-label="Legende">
      {chart.series.map((series, index) => (
        <li key={series.key} className="pmh-rich-legend__item">
          <span className="pmh-rich-legend__swatch" style={{ background: colorOf(index) }} aria-hidden="true" />
          {series.label}
        </li>
      ))}
    </ul>
  )
}

function Tooltip({ series, point, unit }: { readonly series: string; readonly point: ChartPoint; readonly unit: string | undefined }): ReactElement {
  const suffix = unit === undefined ? '' : ` ${unit}`
  return <title>{`${series} · ${point.label}: ${formatNumber(point.value)}${suffix}`}</title>
}

function LineSeries({ line, unit }: { readonly line: LineSeriesGeometry; readonly unit: string | undefined }): ReactElement {
  const color = colorOf(line.colorIndex)
  return (
    <g>
      <path d={line.area} fill={color} opacity={0.12} />
      <path d={line.path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {line.points.map((point) => (
        <circle key={`${line.key}:${point.label}`} cx={point.x} cy={point.y} r={3.2} fill={color} stroke="var(--dsw-alias-bg-layer-1)" strokeWidth={1.5}>
          <Tooltip series={line.label} point={point} unit={unit} />
        </circle>
      ))}
    </g>
  )
}

function Bars({ bars, unit }: { readonly bars: readonly BarGeometry[]; readonly unit: string | undefined }): ReactElement {
  const suffix = unit === undefined ? '' : ` ${unit}`
  return (
    <g>
      {bars.map((bar) => (
        <rect
          key={`${bar.seriesLabel}:${bar.label}`}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          rx={3}
          fill={colorOf(bar.colorIndex)}
        >
          <title>{`${bar.seriesLabel} · ${bar.label}: ${formatNumber(bar.value)}${suffix}`}</title>
        </rect>
      ))}
    </g>
  )
}

function ChartBody({ chart, title }: { readonly chart: ChartSpec; readonly title: string | undefined }): ReactElement {
  const geometry = chartGeometry(chart, { measure: labelWidth })
  return (
    <figure className="pmh-rich-figure">
      <Legend chart={chart} />
      <svg
        className="pmh-rich-chart"
        viewBox={`0 0 ${String(geometry.width)} ${String(geometry.height)}`}
        role="img"
        aria-label={chartSummary(chart, title)}
      >
        <g aria-hidden="true">
          {geometry.ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={geometry.plot.x}
                x2={geometry.plot.x + geometry.plot.width}
                y1={tick.y}
                y2={tick.y}
                stroke="var(--dsw-alias-border-l2)"
                strokeWidth={1}
                strokeDasharray={tick.value === 0 ? undefined : '3 4'}
              />
              <text x={geometry.plot.x - 8} y={tick.y + 3.5} textAnchor="end" className="pmh-rich-axis">
                {tick.text}
              </text>
            </g>
          ))}
          {geometry.categories.filter((category) => category.visible).map((category) => (
            <text
              key={`${category.full}:${String(category.x)}`}
              x={category.x}
              y={geometry.height - 8}
              textAnchor="middle"
              className="pmh-rich-axis"
            >
              {category.text}
              {category.text === category.full ? null : <title>{category.full}</title>}
            </text>
          ))}
          {geometry.lines.map((line) => (
            <LineSeries key={line.key} line={line} unit={chart.unit} />
          ))}
          {geometry.bars.length === 0 ? null : <Bars bars={geometry.bars} unit={chart.unit} />}
        </g>
      </svg>
      <table className="pmh-rich-vh">
        <caption>{chartSummary(chart, title)}</caption>
        <thead>
          <tr>
            <th scope="col">Kategorie</th>
            {chart.series.map((series) => (
              <th key={series.key} scope="col">{series.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.labels.map((label, index) => (
            <tr key={`${label}:${String(index)}`}>
              <th scope="row">{label}</th>
              {chart.series.map((series) => (
                <td key={series.key}>{formatNumber(series.values[index] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function StatGrid({ stats }: { readonly stats: readonly StatItem[] }): ReactElement {
  return (
    <dl className="pmh-rich-stats">
      {stats.map((stat) => (
        <div key={stat.label} className="pmh-rich-stat">
          <dt className="pmh-rich-stat__label">{stat.label}</dt>
          <dd className="pmh-rich-stat__value">{stat.value}</dd>
          {stat.hint === undefined ? null : <dd className="pmh-rich-stat__hint">{stat.hint}</dd>}
        </div>
      ))}
    </dl>
  )
}

function DataTable({ table }: { readonly table: TableSpec }): ReactElement {
  return (
    <div className="pmh-rich-tablewrap">
      <table className="pmh-rich-table">
        {table.caption === undefined ? null : <caption>{table.caption}</caption>}
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column.key} scope="col" className={column.align === 'right' ? 'pmh-rich-num' : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={String(rowIndex)}>
              {table.columns.map((column, columnIndex) => (
                <td key={column.key} className={column.align === 'right' ? 'pmh-rich-num' : undefined}>
                  {row[columnIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ImageFigure({ image }: { readonly image: ImageSpec }): ReactElement {
  return (
    <figure className="pmh-rich-figure">
      <img
        className="pmh-rich-image"
        src={image.src}
        alt={image.alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
      {image.caption === undefined ? null : <figcaption className="pmh-rich-caption">{image.caption}</figcaption>}
    </figure>
  )
}

/** The change of one file, in the words the card uses. */
const CHANGE_LABELS: Readonly<Record<FileChange, string>> = {
  added: 'neu',
  modified: 'geändert',
  deleted: 'gelöscht',
  renamed: 'umbenannt',
}

/**
 * One file list.
 *
 * The path is a button only when the host handed a file opener down — a card
 * rendered in a context without one stays a plain list rather than showing a
 * button that does nothing.
 */
function FileList({
  files,
  onOpenFile,
}: {
  readonly files: FilesSpec
  readonly onOpenFile?: ((path: string) => void) | undefined
}): ReactElement {
  return (
    <div className="pmh-rich-files">
      <ul className="pmh-rich-files__list">
        {files.items.map((file) => (
          <li key={file.path} className="pmh-rich-file">
            {file.change === undefined ? null : (
              <span className={`pmh-rich-file__badge pmh-rich-file__badge--${file.change}`}>
                {CHANGE_LABELS[file.change]}
              </span>
            )}
            {onOpenFile === undefined ? (
              <span className="pmh-rich-file__path" title={file.path}>
                {file.path}
              </span>
            ) : (
              <button
                type="button"
                className="pmh-rich-file__path pmh-rich-file__path--action"
                title={file.path}
                onClick={() => onOpenFile(file.path)}
              >
                {file.path}
              </button>
            )}
            <span className="pmh-rich-file__counts">
              {file.added === undefined ? null : (
                <span className="pmh-rich-file__add">+{String(file.added)}</span>
              )}
              {file.removed === undefined ? null : (
                <span className="pmh-rich-file__remove">−{String(file.removed)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {files.more === undefined ? null : (
        <p className="pmh-rich-files__more">und {String(files.more)} weitere</p>
      )}
    </div>
  )
}

/**
 * Render one component.
 *
 * @param spec - validated component description.
 * @param onOpenFile - host file opener; omitted where the surface has none.
 * @returns the chat row.
 */
export function RichCard({
  spec,
  onOpenFile,
}: {
  readonly spec: RichSpec
  readonly onOpenFile?: ((path: string) => void) | undefined
}): ReactElement {
  // A prose card measures itself, so it owns the frame it puts that width on.
  if (spec.kind === 'prose' && spec.prose !== undefined) return <ProseCard spec={spec} prose={spec.prose} />

  const body = ((): ReactElement => {
    if (spec.kind === 'chart' && spec.chart !== undefined) return <ChartBody chart={spec.chart} title={spec.title} />
    if (spec.kind === 'stats' && spec.stats !== undefined) return <StatGrid stats={spec.stats} />
    if (spec.kind === 'table' && spec.table !== undefined) return <DataTable table={spec.table} />
    if (spec.kind === 'image' && spec.image !== undefined) return <ImageFigure image={spec.image} />
    if (spec.kind === 'code' && spec.code !== undefined) return <CodeBlock code={spec.code} />
    if (spec.kind === 'files' && spec.files !== undefined) return <FileList files={spec.files} onOpenFile={onOpenFile} />
    return <div className="pmh-rich-note" role="note">{spec.note ?? 'Kein Inhalt.'}</div>
  })()

  return <CardFrame spec={spec}>{body}</CardFrame>
}

/**
 * Render the failure state of a malformed component call.
 *
 * @param message - readable rejection reason.
 * @returns a compact notice that keeps the transcript intact.
 */
export function RichError({ message }: { readonly message: string }): ReactElement {
  return (
    <section className="pmh-rich pmh-rich--error" data-pmh-rich="error" role="status">
      <header className="pmh-rich__head">
        <h3 className="pmh-rich__title">Komponente nicht darstellbar</h3>
      </header>
      <p className="pmh-rich__subtitle">{message}</p>
    </section>
  )
}
