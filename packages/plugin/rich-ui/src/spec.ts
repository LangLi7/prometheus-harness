/**
 * The wire format of one rendered answer component.
 *
 * The model does not draw pixels. It describes a component — a headline, a few
 * statistics, a chart's numbers, a table, an image — and the browser decides how
 * that looks. Everything in this module is pure: it validates untrusted tool
 * arguments and returns either a frozen description or one readable error. No
 * React, no DOM, no I/O.
 *
 * Limits are deliberately small. A chat card is a summary, not a data dump: a
 * hundred-row table belongs in a file, not in a transcript.
 */

/** Tool name shared by the Host half and the browser half. */
export const TOOL_NAME = 'render_ui'

/** Longest accepted label list. */
export const MAX_LABELS = 60

/** Most series one chart may carry. */
export const MAX_SERIES = 4

/** Most statistic tiles one card may show. */
export const MAX_STATS = 4

/** Most rows one table may show. */
export const MAX_TABLE_ROWS = 50

/** Most columns one table may show. */
export const MAX_TABLE_COLUMNS = 8

/** Longest accepted string of any single field. */
export const MAX_TEXT = 400

/**
 * Longest accepted image address.
 *
 * Generous on purpose: a signed CDN URL is routinely longer than 2 000
 * characters, and cutting one produces a broken address rather than a shorter
 * one. See {@link readImageSource} for why this is a rejection limit, not a
 * truncation limit.
 */
export const MAX_IMAGE_SOURCE = 8192

/** Longest accepted prose paragraph. */
export const MAX_PROSE = 800

/** Most lines one code card may carry. */
export const MAX_CODE_LINES = 60

/** Longest accepted code body, before the line cap applies. */
export const MAX_CODE_CHARS = 8000

/** Narrowest box an inline image may occupy, in CSS px. */
export const MIN_IMAGE_BOX = 40

/** Widest box an inline image may occupy, in CSS px. */
export const MAX_IMAGE_BOX = 320

/** Most file entries one card may list. */
export const MAX_FILE_ITEMS = 40

/** The component kinds the renderer knows. */
export type RichKind = 'stats' | 'chart' | 'table' | 'image' | 'note' | 'prose' | 'code' | 'files'

/** One statistic tile. `value` is already formatted by the model or its caller. */
export interface StatItem {
  readonly label: string
  readonly value: string
  readonly hint?: string
}

/** One named, coloured line or bar group. */
export interface ChartSeries {
  readonly key: string
  readonly label: string
  readonly values: readonly number[]
}

/** A categorical chart description. */
export interface ChartSpec {
  readonly type: 'line' | 'bar'
  readonly labels: readonly string[]
  readonly series: readonly ChartSeries[]
  readonly unit?: string
}

/** One table column. */
export interface TableColumn {
  readonly key: string
  readonly label: string
  readonly align?: 'left' | 'right'
}

/** A plain table description. Cells are strings so the wire stays lossless. */
export interface TableSpec {
  readonly caption?: string
  readonly columns: readonly TableColumn[]
  readonly rows: readonly (readonly string[])[]
}

/** One image. Only HTTP(S) and inline image data are accepted. */
export interface ImageSpec {
  readonly src: string
  readonly alt: string
  readonly caption?: string
}

/**
 * The image of a prose card: one box the text flows around.
 *
 * `boxWidth` is the width the model asked for, already clamped to
 * {@link MIN_IMAGE_BOX}–{@link MAX_IMAGE_BOX}. When it is absent the renderer
 * takes the image's intrinsic width, capped at the same maximum.
 */
export interface ProseImage {
  readonly src: string
  readonly alt: string
  readonly boxWidth?: number
}

/** A paragraph with at most one image, the text set around it. */
export interface ProseSpec {
  readonly text: string
  readonly image?: ProseImage
}

/** A code excerpt with its provenance. */
export interface CodeSpec {
  /** Newline-separated source, already cut to the card's limits. */
  readonly content: string
  /** Lower-case language tag for the badge, e.g. `ts`. */
  readonly language?: string
  /** File the excerpt came from. */
  readonly filename?: string
  /** Number of the first line, for excerpts that do not start at 1. */
  readonly startLine?: number
  /** Set when the excerpt was cut; the card says so instead of pretending. */
  readonly truncated?: boolean
}

/**
 * The change a file entry reports.
 *
 * Deliberately not "status": the card lists what happened to a file, and
 * `renamed` only tells the reader that the path is new, not where it came from.
 */
export type FileChange = 'added' | 'modified' | 'deleted' | 'renamed'

/** One row of a file list. Counts are line counts, omitted when unknown. */
export interface FileEntry {
  readonly path: string
  readonly change?: FileChange
  readonly added?: number
  readonly removed?: number
}

/** A list of files a change touched. */
export interface FilesSpec {
  readonly items: readonly FileEntry[]
  /** Entries the author did not list, so the card can say "… und n weitere". */
  readonly more?: number
}

/** The normalized description handed to the browser renderer. */
export interface RichSpec {
  readonly kind: RichKind
  readonly title?: string
  readonly subtitle?: string
  readonly footer?: string
  readonly stats?: readonly StatItem[]
  readonly chart?: ChartSpec
  readonly table?: TableSpec
  readonly image?: ImageSpec
  readonly note?: string
  readonly prose?: ProseSpec
  readonly code?: CodeSpec
  readonly files?: FilesSpec
}

/** Validation outcome. */
export type SpecResult = { readonly ok: true; readonly spec: RichSpec } | { readonly ok: false; readonly error: string }

/** Format a number the way the German UI shows it: `1.234,5`. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '–'
  const rounded = Math.round(value * 100) / 100
  const [integer = '0', fraction = ''] = Math.abs(rounded).toFixed(2).split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/gu, '.')
  const trimmed = fraction.replace(/0+$/u, '')
  const sign = rounded < 0 ? '-' : ''
  return trimmed.length > 0 ? `${sign}${grouped},${trimmed}` : `${sign}${grouped}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown, maximum = MAX_TEXT): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  return trimmed.length > maximum ? trimmed.slice(0, maximum) : trimmed
}

/**
 * Read a label that must never be cut silently.
 *
 * A title can lose its tail without losing its meaning; a category or a legend
 * entry cannot. An over-long label is rejected so the model learns the limit,
 * instead of publishing a shortened value as if it were authored.
 *
 * @param value - untrusted field.
 * @param maximum - longest accepted length.
 * @returns the label, or `undefined` when it is absent, empty, or too long.
 */
function readLabel(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > maximum) return undefined
  return trimmed
}

function readFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readCell(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 500 ? `${trimmed.slice(0, 497)}…` : trimmed
  }
  if (typeof value === 'number' && Number.isFinite(value)) return formatNumber(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return undefined
}

/**
 * Accept only addresses the browser may load without opening a new attack surface.
 *
 * @param source - authored image address.
 * @returns whether the address is HTTP(S) or inline image data.
 */
export function isSafeImageSource(source: string): boolean {
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/iu.test(source)) return true
  try {
    const parsed = new URL(source)
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname.length > 0
  } catch {
    return false
  }
}

/**
 * Read one image address, refusing an over-long one instead of cutting it.
 *
 * A cut URL is not a shorter URL, it is a broken one: the browser requests a
 * resource that does not exist and the card shows a missing image with nothing
 * to explain it. Rejecting turns that silent breakage into an answer the model
 * can act on — and this is why the limit is applied as a refusal here, while
 * display text elsewhere is still trimmed.
 *
 * @param value - untrusted field.
 * @param field - field name used in the error message.
 * @returns the address, or the reason it was refused.
 */
function readImageSource(value: unknown, field: string): { readonly src: string } | { readonly error: string } {
  if (typeof value !== 'string') return { error: `${field} must be a string.` }
  const trimmed = value.trim()
  if (trimmed.length === 0) return { error: `${field} is required.` }
  if (trimmed.length > MAX_IMAGE_SOURCE) {
    return {
      error: `${field} is longer than ${String(MAX_IMAGE_SOURCE)} characters; pass a URL, not embedded bytes.`,
    }
  }
  if (!isSafeImageSource(trimmed)) return { error: `${field} must be an http(s) URL or inline image data.` }
  return { src: trimmed }
}

/**
 * Accept the flattened shape models sometimes send.
 *
 * The schema nests the payload (`chart`, `table`, `image`). A model occasionally
 * puts the fields at the top level instead — `{ "kind": "table", "columns": … }` —
 * and a strict reader rejects a description that is otherwise complete. Lifting
 * those fields costs one pass and turns a failed call into the card it meant.
 *
 * @param value - untrusted description.
 * @param kind - already validated component kind.
 * @returns the description with its payload nested, or the input unchanged.
 */
function liftPayload(value: Record<string, unknown>, kind: string): Record<string, unknown> {
  if (kind === 'table' && !isRecord(value['table']) && (value['columns'] !== undefined || value['rows'] !== undefined)) {
    return {
      ...value,
      table: {
        columns: value['columns'],
        rows: value['rows'],
        ...(value['caption'] === undefined ? {} : { caption: value['caption'] }),
      },
    }
  }
  if (kind === 'chart' && !isRecord(value['chart']) && (value['labels'] !== undefined || value['series'] !== undefined)) {
    return {
      ...value,
      chart: {
        type: value['chartType'] ?? value['type'],
        labels: value['labels'],
        series: value['series'],
        ...(value['unit'] === undefined ? {} : { unit: value['unit'] }),
      },
    }
  }
  if (kind === 'image' && !isRecord(value['image']) && typeof value['src'] === 'string') {
    return {
      ...value,
      image: {
        src: value['src'],
        ...(value['alt'] === undefined ? {} : { alt: value['alt'] }),
        ...(value['caption'] === undefined ? {} : { caption: value['caption'] }),
      },
    }
  }
  if (kind === 'code' && !isRecord(value['code']) && typeof value['content'] === 'string') {
    return {
      ...value,
      code: {
        content: value['content'],
        ...(value['language'] === undefined ? {} : { language: value['language'] }),
        ...(value['filename'] === undefined ? {} : { filename: value['filename'] }),
        ...(value['startLine'] === undefined ? {} : { startLine: value['startLine'] }),
      },
    }
  }
  if (kind === 'prose' && !isRecord(value['prose']) && typeof value['text'] === 'string') {
    return {
      ...value,
      prose: {
        text: value['text'],
        ...(value['image'] === undefined ? {} : { image: value['image'] }),
      },
    }
  }
  if (kind === 'files' && !isRecord(value['files']) && Array.isArray(value['items'])) {
    return {
      ...value,
      files: {
        items: value['items'],
        ...(value['more'] === undefined ? {} : { more: value['more'] }),
      },
    }
  }
  return value
}

/**
 * Normalize one untrusted component description.
 *
 * @param value - parsed tool arguments or any untrusted JSON value.
 * @returns the frozen description, or one readable reason for rejection.
 */
export function readRichSpec(value: unknown): SpecResult {
  if (!isRecord(value)) return { ok: false, error: 'The component description must be a JSON object.' }

  const kind = readText(value['kind'], 16)?.toLowerCase()
  if (
    kind !== 'stats' &&
    kind !== 'chart' &&
    kind !== 'table' &&
    kind !== 'image' &&
    kind !== 'note' &&
    kind !== 'prose' &&
    kind !== 'code' &&
    kind !== 'files'
  ) {
    return { ok: false, error: 'kind must be one of stats, chart, table, image, note, prose, code, files.' }
  }

  const payload = liftPayload(value, kind)
  const title = readText(payload['title'], 120)
  const subtitle = readText(payload['subtitle'], 200)
  const footer = readText(payload['footer'], 200)
  const head: CardHead = {
    ...(title === undefined ? {} : { title }),
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(footer === undefined ? {} : { footer }),
  }

  if (kind === 'note') {
    const note = readText(payload['note'], 800)
    if (note === undefined) return { ok: false, error: 'note is required for kind "note".' }
    return { ok: true, spec: { kind, note, ...(title ? { title } : {}), ...(footer ? { footer } : {}) } }
  }

  if (kind === 'prose') return readProse(payload, head)
  if (kind === 'code') return readCode(payload, head)
  if (kind === 'files') return readFiles(payload, head)
  if (kind === 'image') return readImage(payload, head)
  if (kind === 'stats') return readStats(payload, head)
  if (kind === 'table') return readTable(payload, head)
  return readChart(payload, head)
}

interface CardHead {
  readonly title?: string
  readonly subtitle?: string
  readonly footer?: string
}

function readStats(value: Record<string, unknown>, head: CardHead): SpecResult {
  const raw = value['stats']
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'stats must list at least one tile.' }
  if (raw.length > MAX_STATS) return { ok: false, error: `stats accepts at most ${String(MAX_STATS)} tiles.` }

  const stats: StatItem[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) return { ok: false, error: 'Each statistic needs a label and a value.' }
    const label = readLabel(entry['label'], 60)
    const value = readLabel(entry['value'], 60)
    const hint = readText(entry['hint'], 120)
    if (label === undefined || value === undefined) {
      return { ok: false, error: 'Each statistic needs a label and a value of at most 60 characters.' }
    }
    stats.push({ label, value, ...(hint ? { hint } : {}) })
  }
  return { ok: true, spec: { kind: 'stats', ...head, stats } }
}

function readChart(value: Record<string, unknown>, head: CardHead): SpecResult {
  const raw = value['chart']
  if (!isRecord(raw)) return { ok: false, error: 'chart is required for kind "chart".' }

  const type = readText(raw['type'], 8)?.toLowerCase()
  if (type !== 'line' && type !== 'bar') return { ok: false, error: 'chart.type must be "line" or "bar".' }

  const rawLabels = raw['labels']
  if (!Array.isArray(rawLabels) || rawLabels.length === 0) return { ok: false, error: 'chart.labels must list at least one category.' }
  if (rawLabels.length > MAX_LABELS) return { ok: false, error: `chart.labels accepts at most ${String(MAX_LABELS)} categories.` }
  const labels: string[] = []
  for (const entry of rawLabels) {
    const label = readLabel(entry, 80)
    if (label === undefined) {
      return { ok: false, error: 'Every chart label must be a non-empty string of at most 80 characters.' }
    }
    labels.push(label)
  }

  const rawSeries = raw['series']
  if (!Array.isArray(rawSeries) || rawSeries.length === 0) return { ok: false, error: 'chart.series must list at least one series.' }
  if (rawSeries.length > MAX_SERIES) return { ok: false, error: `chart.series accepts at most ${String(MAX_SERIES)} series.` }

  const seen = new Set<string>()
  const series: ChartSeries[] = []
  for (const entry of rawSeries) {
    if (!isRecord(entry)) return { ok: false, error: 'Each series needs a key, a label, and values.' }
    const key = readLabel(entry['key'], 40)
    const label = readLabel(entry['label'], 40)
    if (key === undefined || label === undefined) {
      return { ok: false, error: 'Each series needs a key and a label of at most 40 characters.' }
    }
    if (seen.has(key)) return { ok: false, error: `Duplicate series key "${key}".` }
    seen.add(key)

    const rawValues = entry['values']
    if (!Array.isArray(rawValues)) return { ok: false, error: `Series "${key}" needs a values array.` }
    if (rawValues.length !== labels.length) {
      return { ok: false, error: `Series "${key}" has ${String(rawValues.length)} values for ${String(labels.length)} labels.` }
    }
    const values: number[] = []
    for (const item of rawValues) {
      const number = readFinite(item)
      if (number === undefined) return { ok: false, error: `Series "${key}" contains a non-numeric value.` }
      values.push(number)
    }
    series.push({ key, label, values })
  }

  const unit = readText(raw['unit'], 16)
  return { ok: true, spec: { kind: 'chart', ...head, chart: { type, labels, series, ...(unit ? { unit } : {}) } } }
}

function readTable(value: Record<string, unknown>, head: CardHead): SpecResult {
  const raw = value['table']
  if (!isRecord(raw)) return { ok: false, error: 'table is required for kind "table".' }

  const rawColumns = raw['columns']
  if (!Array.isArray(rawColumns) || rawColumns.length === 0) return { ok: false, error: 'table.columns must list at least one column.' }
  if (rawColumns.length > MAX_TABLE_COLUMNS) return { ok: false, error: `table.columns accepts at most ${String(MAX_TABLE_COLUMNS)} columns.` }

  const columns: TableColumn[] = []
  for (const entry of rawColumns) {
    if (!isRecord(entry)) return { ok: false, error: 'Each column needs a key and a label.' }
    const key = readLabel(entry['key'], 40)
    const label = readLabel(entry['label'], 60)
    if (key === undefined || label === undefined) {
      return { ok: false, error: 'Each column needs a key and a label of at most 60 characters.' }
    }
    const align = readText(entry['align'], 8)
    columns.push({ key, label, ...(align === 'left' || align === 'right' ? { align } : {}) })
  }

  const rawRows = raw['rows']
  if (!Array.isArray(rawRows)) return { ok: false, error: 'table.rows must be an array of rows.' }
  if (rawRows.length > MAX_TABLE_ROWS) return { ok: false, error: `table.rows accepts at most ${String(MAX_TABLE_ROWS)} rows.` }

  const rows: string[][] = []
  for (const entry of rawRows) {
    if (!Array.isArray(entry)) return { ok: false, error: 'Every table row must be an array of cells.' }
    if (entry.length !== columns.length) {
      return { ok: false, error: `A row has ${String(entry.length)} cells for ${String(columns.length)} columns.` }
    }
    const cells: string[] = []
    for (const cell of entry) {
      const text = readCell(cell)
      if (text === undefined) return { ok: false, error: 'Table cells must be strings, numbers, or booleans.' }
      cells.push(text)
    }
    rows.push(cells)
  }

  const caption = readText(raw['caption'], 160)
  return { ok: true, spec: { kind: 'table', ...head, table: { columns, rows, ...(caption ? { caption } : {}) } } }
}

function readImage(value: Record<string, unknown>, head: CardHead): SpecResult {
  const raw = value['image']
  if (!isRecord(raw)) return { ok: false, error: 'image is required for kind "image".' }

  const source = readImageSource(raw['src'], 'image.src')
  if ('error' in source) return { ok: false, error: source.error }
  const src = source.src

  const alt = readText(raw['alt'], 200) ?? ''
  const caption = readText(raw['caption'], 160)
  return { ok: true, spec: { kind: 'image', ...head, image: { src, alt, ...(caption ? { caption } : {}) } } }
}

function readProse(value: Record<string, unknown>, head: CardHead): SpecResult {
  const raw = value['prose']
  if (!isRecord(raw)) return { ok: false, error: 'prose is required for kind "prose".' }

  const text = readText(raw['text'], MAX_PROSE)
  if (text === undefined) return { ok: false, error: `prose.text is required (up to ${String(MAX_PROSE)} characters).` }

  const rawImage = raw['image']
  let image: ProseImage | undefined
  if (isRecord(rawImage)) {
    const source = readImageSource(rawImage['src'], 'prose.image.src')
    if ('error' in source) return { ok: false, error: source.error }
    const src = source.src

    const alt = readText(rawImage['alt'], 200) ?? ''
    const requested = readFinite(rawImage['boxWidth'])
    const boxWidth =
      requested === undefined ? undefined : Math.min(MAX_IMAGE_BOX, Math.max(MIN_IMAGE_BOX, Math.round(requested)))
    image = { src, alt, ...(boxWidth === undefined ? {} : { boxWidth }) }
  }

  return { ok: true, spec: { kind: 'prose', ...head, prose: { text, ...(image === undefined ? {} : { image }) } } }
}

function readCode(value: Record<string, unknown>, head: CardHead): SpecResult {
  const raw = value['code']
  if (!isRecord(raw)) return { ok: false, error: 'code is required for kind "code".' }

  const authored = typeof raw['content'] === 'string' ? raw['content'] : undefined
  if (authored === undefined || authored.trim().length === 0) return { ok: false, error: 'code.content is required.' }

  let content = authored.replace(/\r\n?/gu, '\n')
  let truncated = false
  if (content.length > MAX_CODE_CHARS) {
    content = content.slice(0, MAX_CODE_CHARS)
    truncated = true
  }
  const allLines = content.split('\n')
  if (allLines.length > MAX_CODE_LINES) {
    content = allLines.slice(0, MAX_CODE_LINES).join('\n')
    truncated = true
  }

  const requestedLanguage = readText(raw['language'], 24)
  const language =
    requestedLanguage !== undefined && /^[a-z0-9+#.-]+$/iu.test(requestedLanguage)
      ? requestedLanguage.toLowerCase()
      : undefined
  const filename = readText(raw['filename'], 120)
  const requestedStart = readFinite(raw['startLine'])
  const startLine =
    requestedStart === undefined ? undefined : Math.min(100_000, Math.max(1, Math.round(requestedStart)))

  return {
    ok: true,
    spec: {
      kind: 'code',
      ...head,
      code: {
        content,
        ...(language === undefined ? {} : { language }),
        ...(filename === undefined ? {} : { filename }),
        ...(startLine === undefined ? {} : { startLine }),
        ...(truncated ? { truncated: true } : {}),
      },
    },
  }
}

/**
 * Parse the raw `tool/call` argument string.
 *
 * @param raw - the model-produced JSON, possibly absent or truncated.
 * @returns the normalized description, or one readable reason.
 */
/** Non-negative integer or nothing; used for line counts and the omitted tally. */
function readCount(value: unknown): number | undefined {
  const number = readFinite(value)
  if (number === undefined || number < 0) return undefined
  return Math.min(100_000, Math.round(number))
}

/**
 * Read a file list.
 *
 * A path is a label, not prose: an over-long one is rejected instead of cut,
 * because a shortened path names a different file. Change and line counts stay
 * optional — a plain listing is a complete answer too.
 *
 * @param value - untrusted description.
 * @param head - title, subtitle, footer.
 * @returns the validated list, or one readable reason.
 */
function readFiles(value: Record<string, unknown>, head: CardHead): SpecResult {
  const raw = value['files']
  if (!isRecord(raw)) return { ok: false, error: 'files is required for kind "files".' }

  const rawItems = raw['items']
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'files.items must list at least one file.' }
  }
  if (rawItems.length > MAX_FILE_ITEMS) {
    return { ok: false, error: `files.items accepts at most ${String(MAX_FILE_ITEMS)} entries.` }
  }

  const items: FileEntry[] = []
  for (const entry of rawItems) {
    if (!isRecord(entry)) return { ok: false, error: 'Each file entry needs a path.' }
    const path = readLabel(entry['path'], 200)
    if (path === undefined) {
      return { ok: false, error: 'Every file path must be a non-empty string of at most 200 characters.' }
    }

    const requested = readText(entry['change'], 12)?.toLowerCase()
    const change: FileChange | undefined =
      requested === 'added' || requested === 'modified' || requested === 'deleted' || requested === 'renamed'
        ? requested
        : undefined
    const added = readCount(entry['added'])
    const removed = readCount(entry['removed'])

    items.push({
      path,
      ...(change === undefined ? {} : { change }),
      ...(added === undefined ? {} : { added }),
      ...(removed === undefined ? {} : { removed }),
    })
  }

  const more = readCount(raw['more'])
  return { ok: true, spec: { kind: 'files', ...head, files: { items, ...(more === undefined ? {} : { more }) } } }
}

/**
 * Parse the raw `tool/call` argument string.
 *
 * @param raw - the model-produced JSON, possibly absent or truncated.
 * @returns the normalized description, or one readable reason.
 */
export function parseRichArguments(raw: string | null | undefined): SpecResult {
  if (typeof raw !== 'string' || raw.trim().length === 0) return { ok: false, error: 'No component arguments were recorded.' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return { ok: false, error: 'The component arguments are not valid JSON.' }
  }
  return readRichSpec(parsed)
}

/** Longest plain-text fallback the Host writes into a tool result. */
export const MAX_FALLBACK_TEXT = 700

/**
 * Plain-text form of one component.
 *
 * The browser card is the intended presentation. This text is what remains when
 * the browser half is missing or a tab predates the plugin: the tool row then
 * shows the data instead of the word "Rendered". It is capped so a wide table
 * cannot flood the transcript or the next request.
 *
 * @param spec - validated component description.
 * @returns a compact, readable summary.
 */
export function describeSpec(spec: RichSpec): string {
  const lines: string[] = []
  if (spec.title !== undefined) lines.push(spec.title)
  if (spec.subtitle !== undefined) lines.push(spec.subtitle)

  if (spec.kind === 'stats' && spec.stats !== undefined) {
    for (const stat of spec.stats) {
      lines.push(`${stat.label}: ${stat.value}${stat.hint === undefined ? '' : ` (${stat.hint})`}`)
    }
  } else if (spec.kind === 'chart' && spec.chart !== undefined) {
    const chart = spec.chart
    for (const series of chart.series) {
      const points = chart.labels
        .map((label, index) => `${label} ${formatNumber(series.values[index] ?? 0)}`)
        .slice(0, 8)
        .join(', ')
      lines.push(`${series.label}: ${points}${chart.labels.length > 8 ? ', …' : ''}${chart.unit === undefined ? '' : ` ${chart.unit}`}`)
    }
  } else if (spec.kind === 'table' && spec.table !== undefined) {
    const table = spec.table
    lines.push(table.columns.map((column) => column.label).join(' | '))
    for (const row of table.rows.slice(0, 6)) lines.push(row.join(' | '))
    if (table.rows.length > 6) lines.push(`… ${String(table.rows.length - 6)} more rows`)
  } else if (spec.kind === 'image' && spec.image !== undefined) {
    lines.push(spec.image.alt.length > 0 ? spec.image.alt : 'Image')
    lines.push(spec.image.src)
  } else if (spec.kind === 'prose' && spec.prose !== undefined) {
    lines.push(spec.prose.text)
    if (spec.prose.image !== undefined) {
      const image = spec.prose.image
      lines.push(`Image: ${image.alt.length > 0 ? image.alt : image.src}`)
    }
  } else if (spec.kind === 'code' && spec.code !== undefined) {
    const code = spec.code
    lines.push(`${code.filename ?? code.language ?? 'Code'}${code.truncated === true ? ' (truncated)' : ''}`)
    for (const line of code.content.split('\n').slice(0, 6)) lines.push(line)
  } else if (spec.kind === 'files' && spec.files !== undefined) {
    for (const file of spec.files.items.slice(0, 10)) {
      const added = file.added === undefined ? '' : ` +${String(file.added)}`
      const removed = file.removed === undefined ? '' : ` -${String(file.removed)}`
      lines.push(`${file.path}${added}${removed}`)
    }
    if (spec.files.items.length > 10) lines.push(`… ${String(spec.files.items.length - 10)} more files`)
    if (spec.files.more !== undefined) lines.push(`… ${String(spec.files.more)} not listed`)
  } else if (spec.note !== undefined) {
    lines.push(spec.note)
  }

  if (spec.footer !== undefined) lines.push(spec.footer)
  const text = lines.join('\n')
  return text.length > MAX_FALLBACK_TEXT ? `${text.slice(0, MAX_FALLBACK_TEXT - 1)}…` : text
}
