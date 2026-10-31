import { describe, expect, test } from 'bun:test'
import { chartGeometry } from '../src/chart.ts'
import type { ChartSpec } from '../src/spec.ts'

const line: ChartSpec = {
  type: 'line',
  labels: ['Jan', 'Feb', 'Mär', 'Apr'],
  series: [{ key: 'revenue', label: 'Umsatz', values: [120, 180, 150, 240] }],
}

const bars: ChartSpec = {
  type: 'bar',
  labels: ['Q1', 'Q2'],
  series: [
    { key: 'a', label: 'A', values: [10, 20] },
    { key: 'b', label: 'B', values: [5, 15] },
  ],
}

describe('chartGeometry', () => {
  test('projects one point per category and keeps the plot inside the canvas', () => {
    const geometry = chartGeometry(line)
    expect(geometry.lines).toHaveLength(1)
    expect(geometry.lines[0]?.points).toHaveLength(4)
    for (const point of geometry.lines[0]?.points ?? []) {
      expect(point.x).toBeGreaterThanOrEqual(geometry.plot.x)
      expect(point.x).toBeLessThanOrEqual(geometry.plot.x + geometry.plot.width)
      expect(point.y).toBeGreaterThanOrEqual(geometry.plot.y)
      expect(point.y).toBeLessThanOrEqual(geometry.plot.y + geometry.plot.height)
    }
  })

  test('keeps the largest value near the top of the plot', () => {
    const geometry = chartGeometry(line)
    const points = geometry.lines[0]?.points ?? []
    const highest = points.reduce((left, right) => (left.value >= right.value ? left : right))
    expect(highest.value).toBe(240)
    expect(highest.y - geometry.plot.y).toBeLessThan(geometry.plot.height * 0.1)
    expect(highest.y).toBeGreaterThanOrEqual(geometry.plot.y)
  })

  test('includes zero in the ticks and aligns the baseline with it', () => {
    const geometry = chartGeometry(line)
    const zero = geometry.ticks.find((tick) => tick.value === 0)
    expect(zero).toBeDefined()
    expect(zero?.y).toBeCloseTo(geometry.baseline, 5)
  })

  test('numbers the ticks upwards with negative space above zero', () => {
    const geometry = chartGeometry({ ...line, series: [{ key: 'x', label: 'X', values: [-10, 0, 10, 20] }] })
    const values = geometry.ticks.map((tick) => tick.value)
    expect(values).toContain(0)
    expect(Math.min(...values)).toBeLessThan(0)
    expect(Math.max(...values)).toBeGreaterThanOrEqual(20)
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index] ?? 0).toBeGreaterThan(values[index - 1] ?? 0)
    }
  })

  test('draws one bar per label and series', () => {
    const geometry = chartGeometry(bars)
    expect(geometry.bars).toHaveLength(4)
    expect(geometry.bars.filter((bar) => bar.colorIndex === 0)).toHaveLength(2)
    for (const bar of geometry.bars) {
      expect(bar.width).toBeGreaterThan(0)
      expect(bar.height).toBeGreaterThan(0)
    }
  })

  test('keeps a flat series visible', () => {
    const geometry = chartGeometry({ ...line, series: [{ key: 'x', label: 'X', values: [5, 5, 5, 5] }] })
    expect(geometry.maximum).toBeGreaterThan(geometry.minimum)
    expect(geometry.lines[0]?.points.every((point) => Number.isFinite(point.y))).toBe(true)
  })

  test('shows a single category in the middle', () => {
    const geometry = chartGeometry({ ...line, labels: ['nur'], series: [{ key: 'x', label: 'X', values: [3] }] })
    const point = geometry.lines[0]?.points[0]
    expect(point?.x).toBeCloseTo(geometry.plot.x + geometry.plot.width / 2, 6)
  })
})

describe('category label fitting', () => {
  const measure = (text: string): number => text.length * 10

  function labelsOf(texts: string[], width = 640): ReturnType<typeof chartGeometry> {
    return chartGeometry(
      { type: 'line', labels: texts, series: [{ key: 'x', label: 'X', values: texts.map(() => 1) }] },
      { measure, width },
    )
  }

  test('keeps every label when they fit', () => {
    const geometry = labelsOf(['Jan', 'Feb', 'Mär', 'Apr'])
    expect(geometry.categories.every((category) => category.visible)).toBe(true)
  })

  test('drops every n-th label when measured widths would touch', () => {
    const geometry = labelsOf(['a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20), 'd'.repeat(20)])
    const visible = geometry.categories.filter((category) => category.visible)
    expect(visible.length).toBeLessThan(4)
    expect(geometry.categories.at(-1)?.visible).toBe(true)
    for (const category of visible) {
      expect(category.x).toBeGreaterThanOrEqual(geometry.plot.x)
    }
  })

  test('shortens a label that is wider than its band and keeps the full text', () => {
    const full = 'September 2026 und ein langer Zusatz'
    const geometry = labelsOf([full, 'a', 'b', 'c'], 320)
    const category = geometry.categories[0]
    expect(category?.full).toBe(full)
    expect(category?.text.endsWith('…')).toBe(true)
    expect(measure(category?.text ?? '')).toBeLessThanOrEqual(measure(full))
  })

  test('never drops the last label even when it is close to the previous one', () => {
    const geometry = labelsOf(['kurz', 'kurz', 'kurz', 'ein sehr langer letzter Name'])
    const visible = geometry.categories.filter((category) => category.visible)
    expect(geometry.categories.at(-1)?.visible).toBe(true)
    for (const category of visible.slice(0, -1)) {
      expect(category.x + 10).toBeLessThan(geometry.categories.at(-1)?.x ?? 0)
    }
  })
})
