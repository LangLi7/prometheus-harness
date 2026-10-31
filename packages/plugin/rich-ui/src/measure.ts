/**
 * Text width for the chart's axis labels.
 *
 * The axis needs to know how wide a label is to decide which labels fit and where
 * to cut one with an ellipsis. Measuring it in the DOM would force a layout read
 * on every render, so this module measures with Canvas through
 * [`@chenglou/pretext`](https://github.com/chenglou/pretext): the same font
 * string, the same line breaking, no reflow.
 *
 * Outside a browser — Bun tests, a future server render — there is no Canvas 2D
 * context, and `prepare()` throws. That is not an error path worth surfacing: the
 * estimator below keeps the chart readable, just not pixel-exact.
 *
 * @module @prometheus-harness/rich-ui/measure
 */

import { measureNaturalWidth, prepare } from '@chenglou/pretext'

/** Measures one line of text in the axis font and returns its width in CSS px. */
export type TextMeasurer = (text: string) => number

/**
 * Approximate the axis font when no Canvas is available.
 *
 * Digits and letters get a slightly different weight so a label of numbers does
 * not come out too narrow; the values are deliberately conservative, because an
 * over-estimate hides one label, while an under-estimate lets two collide.
 *
 * @param text - label text.
 * @returns estimated width in CSS px.
 */
export function estimateTextWidth(text: string): number {
  let width = 0
  for (const character of text) {
    if (character === ' ') width += 3.2
    else if (/[0-9]/u.test(character)) width += 6.2
    else if (/[.,:;!'’|]/u.test(character)) width += 3.4
    else width += 6.3
  }
  return width
}

/** Width of the axis labels; the CSS sets `11px` on `.pmh-rich-axis`. */
const AXIS_FONT_SIZE = 11

/** Size of the card body text; `.pmh-rich` sets `13px`. */
export const CARD_FONT_SIZE = 13

const widths = new Map<string, number>()
const fonts = new Map<number, string | null>()
let measurer: TextMeasurer | null | undefined

/**
 * The Canvas font string a measurement must use, or `null` without a Canvas.
 *
 * A measurement is only as good as the font it was taken in: the family comes
 * from the interface rather than a guess, so a card measured on a machine with
 * a different UI font still wraps the way the browser will. `prepare()` is
 * called once as a probe, because that is what fails when there is no Canvas —
 * a check that keeps the failure at one place instead of at every caller.
 *
 * @param sizePx - CSS font size the text will be painted at.
 * @returns the font string, or `null` when measuring is impossible.
 */
export function cardFont(sizePx: number = CARD_FONT_SIZE): string | null {
  const cached = fonts.get(sizePx)
  if (cached !== undefined) return cached

  let resolved: string | null = null
  if (typeof document !== 'undefined' && typeof getComputedStyle === 'function') {
    try {
      const family = getComputedStyle(document.body).fontFamily.trim() || 'sans-serif'
      const font = `${String(sizePx)}px ${family}`
      prepare('Wg', font)
      resolved = font
    } catch {
      resolved = null
    }
  }
  fonts.set(sizePx, resolved)
  return resolved
}

/**
 * Build the Canvas-backed measurer once.
 *
 * `getComputedStyle(document.body)` supplies the inherited family, so the card
 * follows the interface font instead of guessing one. A failure at any step —
 * missing document, missing Canvas, an unparsable font string — disables the
 * measurer for the whole session rather than throwing on every label.
 */
function canvasMeasurer(): TextMeasurer | null {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return null
  try {
    const family = getComputedStyle(document.body).fontFamily.trim() || 'sans-serif'
    const font = `${String(AXIS_FONT_SIZE)}px ${family}`
    prepare('Wg', font)
    return (text) => {
      const cached = widths.get(text)
      if (cached !== undefined) return cached
      const measured = measureNaturalWidth(prepare(text, font))
      widths.set(text, measured)
      return measured
    }
  } catch {
    return null
  }
}

/**
 * Measure one axis label.
 *
 * @param text - label text.
 * @returns width in CSS px, exactly when Canvas is available and estimated otherwise.
 */
export function labelWidth(text: string): number {
  if (measurer === undefined) measurer = canvasMeasurer()
  if (measurer === null) return estimateTextWidth(text)
  try {
    return measurer(text)
  } catch {
    return estimateTextWidth(text)
  }
}

/** Drop the measurement cache; used by tests and after a font change. */
export function clearLabelCache(): void {
  widths.clear()
  fonts.clear()
  measurer = undefined
}
