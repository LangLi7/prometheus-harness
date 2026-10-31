/**
 * Geometry for the chart card.
 *
 * Pure arithmetic: a chart description goes in, coordinates come out. The
 * renderer never measures text or the DOM, so a chart looks the same in the
 * transcript, in a test, and after a history restore.
 */

import type { ChartSpec } from './spec.ts'
import type { TextMeasurer } from './measure.ts'

/** One point of a line series. */
export interface ChartPoint {
  readonly x: number
  readonly y: number
  readonly value: number
  readonly label: string
}

/** One drawn line with its filled area. */
export interface LineSeriesGeometry {
  readonly key: string
  readonly label: string
  readonly colorIndex: number
  readonly points: readonly ChartPoint[]
  readonly path: string
  readonly area: string
}

/** One drawn bar. */
export interface BarGeometry {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly colorIndex: number
  readonly label: string
  readonly value: number
  readonly seriesLabel: string
}

/** One horizontal grid line and its value. */
export interface AxisTick {
  readonly y: number
  readonly value: number
  readonly text: string
}

/** One category label under the plot. */
export interface CategoryLabel {
  readonly x: number
  readonly text: string
  /** The authored label, before any ellipsis. */
  readonly full: string
  readonly visible: boolean
}

/** Canvas size and the label measurement used to fit the categories. */
export interface ChartOptions {
  readonly width?: number
  readonly height?: number
  readonly measure?: TextMeasurer
}

/** Everything the SVG needs for one chart. */
export interface ChartGeometry {
  readonly width: number
  readonly height: number
  readonly plot: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly baseline: number
  readonly minimum: number
  readonly maximum: number
  readonly ticks: readonly AxisTick[]
  readonly categories: readonly CategoryLabel[]
  readonly lines: readonly LineSeriesGeometry[]
  readonly bars: readonly BarGeometry[]
}

const PADDING = { left: 46, right: 12, top: 14, bottom: 26 } as const

/** Round a raw step up to 1, 2, or 5 times a power of ten. */
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const exponent = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / exponent
  if (fraction <= 1) return exponent
  if (fraction <= 2) return 2 * exponent
  if (fraction <= 5) return 5 * exponent
  return 10 * exponent
}

/** Short number text for an axis, without trailing zeros. */
function axisText(value: number): string {
  if (Math.abs(value) >= 1000) {
    const thousands = value / 1000
    const text = Number.isInteger(thousands) ? String(thousands) : thousands.toFixed(1).replace(/\.0$/u, '')
    return `${text}k`
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/u, '')
}

/** Space between two neighbouring category labels. */
const LABEL_GAP = 8

/** A label wider than this share of a band is shortened before it is measured. */
const LABEL_FACTOR = 1.45

/**
 * Shorten one label to fit the given width, keeping whole graphemes.
 *
 * @param text - authored label.
 * @param limit - maximum measured width.
 * @param measure - width function.
 * @returns the shortened label, or `…` when even one character does not fit.
 */
function shorten(text: string, limit: number, measure: TextMeasurer): string {
  if (measure(text) <= limit) return text
  const characters = Array.from(text)
  let low = 1
  let high = characters.length - 1
  let best = ''
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const candidate = `${characters.slice(0, middle).join('')}…`
    if (measure(candidate) <= limit) {
      best = candidate
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return best === '' ? '…' : best
}

/**
 * Project a chart description onto a fixed-size SVG canvas.
 *
 * @param chart - validated chart description.
 * @param options - canvas size and the label measurement; defaults target a card.
 * @returns coordinates for the axes, the ticks, and every series.
 */
export function chartGeometry(chart: ChartSpec, options: ChartOptions = {}): ChartGeometry {
  const width = options.width ?? 640
  const height = options.height ?? 200
  const measure = options.measure ?? ((text: string) => text.length * 6.3)
  const plot = {
    x: PADDING.left,
    y: PADDING.top,
    width: Math.max(40, width - PADDING.left - PADDING.right),
    height: Math.max(40, height - PADDING.top - PADDING.bottom),
  }

  let lowest = 0
  let highest = 0
  for (const series of chart.series) {
    for (const value of series.values) {
      if (value < lowest) lowest = value
      if (value > highest) highest = value
    }
  }
  if (highest === lowest) highest = lowest + 1

  /*
   * Five intervals fill the plot better than four: a maximum of 240 then lands on
   * a 250 ceiling instead of a 300 one, so the tallest value keeps its distance
   * from the frame without a fifth of the plot staying empty.
   */
  const step = niceStep((highest - lowest) / 5)
  const minimum = Math.floor(lowest / step) * step
  const maximum = Math.ceil(highest / step) * step
  const span = maximum - minimum || 1
  const scaleY = (value: number): number => plot.y + plot.height - ((value - minimum) / span) * plot.height
  const baseline = scaleY(0)

  const ticks: AxisTick[] = []
  for (let value = minimum; value <= maximum + step / 2; value += step) {
    ticks.push({ y: scaleY(value), value, text: axisText(value) })
  }

  const count = chart.labels.length
  const band = plot.width / count
  const center = (index: number): number => (count === 1 ? plot.x + plot.width / 2 : plot.x + band * (index + 0.5))
  const spread = (index: number): number => (count === 1 ? plot.x + plot.width / 2 : plot.x + (plot.width * index) / (count - 1))

  /*
   * Fit the category labels by measured width, not by counting. A label that is
   * wider than the space between two categories is shortened; when even the
   * shortened labels would touch, the axis keeps every n-th one. The last label
   * always stays, and anything that would overlap it is dropped.
   */
  const limit = Math.max(48, band * LABEL_FACTOR)
  const shown = chart.labels.map((label) => (measure(label) > limit ? shorten(label, limit, measure) : label))
  const shownWidths = shown.map((label) => Math.min(limit, Math.max(1, measure(label))))
  const widest = Math.max(...shownWidths)
  const labelStep = Math.max(1, Math.ceil((widest + LABEL_GAP) / Math.max(1, band)))
  const lastIndex = count - 1
  const lastLeft = center(lastIndex) - (shownWidths[lastIndex] ?? 0) / 2

  const categories: CategoryLabel[] = shown.map((text, index) => {
    let visible = count === 1 || index % labelStep === 0 || index === lastIndex
    if (visible && index !== lastIndex) {
      const right = center(index) + (shownWidths[index] ?? 0) / 2
      if (right + LABEL_GAP > lastLeft) visible = false
    }
    return { x: center(index), text, full: chart.labels[index] ?? text, visible }
  })

  const lines: LineSeriesGeometry[] = []
  const bars: BarGeometry[] = []

  chart.series.forEach((series, seriesIndex) => {
    if (chart.type === 'line') {
      const points = series.values.map((value, index) => ({
        x: spread(index),
        y: scaleY(value),
        value,
        label: chart.labels[index] ?? '',
      }))
      const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
      const first = points[0]
      const last = points[points.length - 1]
      const area = first === undefined || last === undefined
        ? ''
        : `${path} L${last.x.toFixed(1)} ${baseline.toFixed(1)} L${first.x.toFixed(1)} ${baseline.toFixed(1)} Z`
      lines.push({ key: series.key, label: series.label, colorIndex: seriesIndex, points, path, area })
      return
    }

    const inner = band * 0.68
    const barWidth = inner / chart.series.length
    series.values.forEach((value, index) => {
      const x = plot.x + band * index + (band - inner) / 2 + seriesIndex * barWidth
      const y = Math.min(scaleY(value), baseline)
      bars.push({
        x,
        y,
        width: Math.max(2, barWidth - 2),
        height: Math.max(0.5, Math.abs(baseline - scaleY(value))),
        colorIndex: seriesIndex,
        label: chart.labels[index] ?? '',
        value,
        seriesLabel: series.label,
      })
    })
  })

  return {
    width,
    height,
    plot,
    baseline,
    minimum,
    maximum,
    ticks,
    categories,
    lines,
    bars,
  }
}
