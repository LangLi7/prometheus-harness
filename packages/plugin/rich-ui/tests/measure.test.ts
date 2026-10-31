import { describe, expect, test } from 'bun:test'
import { clearLabelCache, estimateTextWidth, labelWidth } from '../src/measure.ts'

describe('labelWidth', () => {
  test('falls back to an estimate without a Canvas', () => {
    // Bun has no Canvas 2D context, so `prepare()` throws and the estimator runs.
    const width = labelWidth('Januar')
    expect(width).toBeGreaterThan(0)
    expect(width).toBe(estimateTextWidth('Januar'))
  })

  test('grows with the text and narrows for spaces', () => {
    expect(estimateTextWidth('Lang')).toBeGreaterThan(estimateTextWidth('La'))
    expect(estimateTextWidth('a a')).toBeLessThan(estimateTextWidth('aaa'))
  })

  test('stays positive for empty and unusual text', () => {
    expect(labelWidth('')).toBeGreaterThanOrEqual(0)
    expect(labelWidth('🚀')).toBeGreaterThan(0)
  })

  test('can drop its cache', () => {
    expect(() => clearLabelCache()).not.toThrow()
    expect(labelWidth('Apr')).toBeGreaterThan(0)
  })
})
