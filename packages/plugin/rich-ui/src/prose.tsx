/**
 * The prose card: a paragraph with one image, the text set around it.
 *
 * ## Two libraries, one job each
 *
 * `prejs` answers *how big is the image* — it loads through `new Image()` before
 * the card paints, so `naturalWidth` is known instead of guessed. Pretext
 * (`@chenglou/pretext/rich-inline`) answers *how wide does the paragraph want to
 * be* once the image occupies part of its first lines.
 *
 * ## What is measured, what is painted
 *
 * Pretext decides the two numbers that prevent a jump: the card's width and the
 * space the image needs. The browser paints with a normal float and normal text
 * flow, so the text stays selectable, searchable, and readable by a screen
 * reader. Positioning the measured fragments by hand would buy pixel equality
 * and cost all three — the trade the plugin's README already rejects for the
 * transcript, and it is just as wrong inside a card.
 *
 * If measurement is impossible (no Canvas: a server render, a test) or the
 * numbers disagree with the browser, the browser wins: width is only a maximum,
 * and nothing here sets a height the text could overflow.
 *
 * ## Why not `layoutNextLineRange`
 *
 * That call lays out one line at a time at a width *you* choose, which is the
 * right tool for text wrapping around a floated block in a *manual* layout. This
 * card does not lay out manually, so `rich-inline` — which takes the image as a
 * box inside the paragraph and reports the whole paragraph's tightest width — is
 * the call that matches the question being asked.
 *
 * @module @prometheus-harness/rich-ui/prose
 */

import { measureRichInlineStats, prepareRichInline } from '@chenglou/pretext/rich-inline'
import type { RichInlineBox, RichInlineItem } from '@chenglou/pretext/rich-inline'
import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { CardFrame } from './frame.tsx'
import { cardFont } from './measure.ts'
import { PENDING_PROBE, preloadImage } from './preload.ts'
import type { ImageProbe } from './preload.ts'
import type { ProseSpec, RichSpec } from './spec.ts'

/** Narrower than this a card looks like an accident, so short text stops here. */
const MIN_CARD_WIDTH = 260

/**
 * Matches `.pmh-rich`'s `max-width`.
 *
 * The card does not set `box-sizing`, so this bounds the *content* box — the
 * same coordinate the measurement works in. An earlier version added the padding
 * here, which made every card 34px wider than measured and pushed it past its own
 * maximum; the browser reported 716px for a 680px card.
 */
const MAX_CARD_WIDTH = 680

/** Widest an inline image gets when neither the model nor the file says. */
const DEFAULT_IMAGE_BOX = 180

/** Narrowest width the search may return; below it a card stops being a card. */
const SEARCH_FLOOR = MIN_CARD_WIDTH

/**
 * The narrowest width that still keeps the paragraph's line count.
 *
 * `measureRichInlineStats` alone reports how wide the *widest line* is at the
 * given width — and for wrapped text that is nearly the full width, because the
 * first line fills up. A card that used it would look exactly like the full-width
 * card this feature is supposed to replace.
 *
 * What a chat bubble actually does is keep the line count and shrink the width
 * around it, which is the binary search the library documents: the answer is the
 * smallest width whose line count equals the count at the maximum. Nine to ten
 * probes, no text allocation, and the result is the tightest box the text still
 * needs — 349px instead of 680 for a two-line paragraph on this machine.
 *
 * @param prepared - the paragraph, prepared once.
 * @param limit - widest allowed content width.
 * @returns the content width in CSS px, never below {@link SEARCH_FLOOR}.
 */
function tightLineWidth(
  prepared: ReturnType<typeof prepareRichInline>,
  limit: number,
): number {
  const target = measureRichInlineStats(prepared, limit).lineCount
  let low = Math.min(SEARCH_FLOOR, limit)
  let high = limit
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (measureRichInlineStats(prepared, middle).lineCount <= target) high = middle
    else low = middle
  }
  return high
}

/**
 * Render one prose card.
 *
 * @param spec - the whole description, for the frame's head and footer.
 * @param prose - the validated paragraph and its optional image.
 * @returns the card.
 */
export function ProseCard({ spec, prose }: { readonly spec: RichSpec; readonly prose: ProseSpec }): ReactElement {
  const image = prose.image
  const source = image?.src
  const [probe, setProbe] = useState<ImageProbe>(PENDING_PROBE)

  /*
   * `prejs` has no `off()`, so the handler outlives the mount by design. The
   * `live` flag is what keeps a late callback from writing into an unmounted
   * card; the loader itself is left to the browser cache.
   */
  useEffect(() => {
    if (source === undefined) return
    let live = true
    setProbe(PENDING_PROBE)
    preloadImage(source, (next) => {
      if (live) setProbe(next)
    })
    return () => {
      live = false
    }
  }, [source])

  const intrinsic = probe.status === 'ready' && probe.width > 0 ? probe.width : 0
  const boxWidth = image?.boxWidth ?? Math.min(intrinsic > 0 ? intrinsic : DEFAULT_IMAGE_BOX, DEFAULT_IMAGE_BOX)
  const boxHeight =
    intrinsic > 0 && probe.height > 0 ? Math.round(boxWidth * (probe.height / intrinsic)) : undefined

  /*
   * Measured during render, not in an effect: an effect would paint the wide
   * card first and then shrink it, which is the jump this card exists to avoid.
   * Without a Canvas the font is `null` and the card simply keeps the CSS width.
   */
  const width = useMemo(() => {
    const font = cardFont()
    if (font === null) return null
    try {
      const items: (RichInlineItem | RichInlineBox)[] = image === undefined ? [] : [{ width: boxWidth }]
      items.push({ text: prose.text, font })
      const prepared = prepareRichInline(items, { whiteSpace: 'pre-wrap' })
      const content = tightLineWidth(prepared, MAX_CARD_WIDTH)
      return Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, content))
    } catch {
      return null
    }
  }, [prose.text, image, boxWidth])

  return (
    <CardFrame spec={spec} {...(width === null ? {} : { width })}>
      <div className="pmh-rich-prose">
        {image === undefined ? null : (
          <img
            className="pmh-rich-prose__image"
            src={image.src}
            alt={image.alt}
            width={boxWidth}
            {...(boxHeight === undefined ? {} : { height: boxHeight })}
            decoding="async"
            referrerPolicy="no-referrer"
          />
        )}
        <p className="pmh-rich-prose__text">{prose.text}</p>
      </div>
    </CardFrame>
  )
}
