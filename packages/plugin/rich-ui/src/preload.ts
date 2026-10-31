/**
 * Preload one image and report its intrinsic size.
 *
 * ## Why preload at all
 *
 * A prose card lays out text around an image, so it needs the image's width
 * *before* the first paint. `naturalWidth` only exists after the browser has
 * decoded the image; without it the card would either guess a width and then
 * jump, or reserve room it does not need. [`prejs`](https://github.com/hparton/prejs)
 * does the one thing that solves this: it loads through `new Image()` and hands
 * back the element, so the later `<img>` in the card is served from the same
 * cache entry with its size already known.
 *
 * ## Why the module shape is resolved by hand
 *
 * `prejs@1.2.6` is a Babel-compiled ES5 module: `Object.defineProperty(exports,
 * "__esModule", …)` plus `exports.default = PreJS`. That shape survives as a
 * bundler interop question, not a fact: in one bundle `import PreJS from 'prejs'`
 * gives the class, in another it gives `{ default: { default: PreJS } }`. The
 * second case throws `default is not a constructor` inside an effect and takes
 * the whole card down with it — measured in a browser, not assumed. Unwrapping
 * until a function appears costs three lines and removes the coin flip.
 *
 * ## What it does not do
 *
 * A single image reports progress `0` or `1` — there is no partial progress to
 * show. A progress bar only becomes honest for a group of images, which is a
 * different surface (the message gallery), not this card.
 *
 * @module @prometheus-harness/rich-ui/preload
 */

import * as prejsModule from 'prejs'
import type PreJS from 'prejs'

/** What the card knows about its image at one moment. */
export interface ImageProbe {
  /** `pending` until `prejs` settles the load, then `ready` or `failed`. */
  readonly status: 'pending' | 'ready' | 'failed'
  /** Intrinsic width in CSS px; `0` while pending or failed. */
  readonly width: number
  /** Intrinsic height in CSS px; `0` while pending or failed. */
  readonly height: number
}

/** The state before anything has been loaded. */
export const PENDING_PROBE: ImageProbe = { status: 'pending', width: 0, height: 0 }

const FAILED_PROBE: ImageProbe = { status: 'failed', width: 0, height: 0 }

/** The constructor behind however the bundler shaped the module. */
type PreloaderConstructor = new () => PreJS

let resolved: PreloaderConstructor | null | undefined

/** Peel `default` wrappers until a plain value is left. */
function unwrapDefault(value: unknown): unknown {
  let current = value
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== 'object' || current === null || !('default' in current)) return current
    current = (current as { default: unknown }).default
  }
  return current
}

/**
 * The `prejs` constructor, or `null` when this bundle exposed something else.
 *
 * Resolved once: the module shape cannot change while the page lives.
 */
function preloaderConstructor(): PreloaderConstructor | null {
  if (resolved !== undefined) return resolved
  const candidate = unwrapDefault(prejsModule)
  resolved = typeof candidate === 'function' ? (candidate as PreloaderConstructor) : null
  return resolved
}

/**
 * Load one image and call back once, with its size or with the failure.
 *
 * The callback runs at most once, and it may run synchronously when the module
 * or the loader turns out to be unusable — the caller only loses the exact
 * aspect ratio, never the card.
 *
 * @param source - an http(s) URL or inline image data, already validated.
 * @param onSettled - receives the probe exactly once.
 */
export function preloadImage(source: string, onSettled: (probe: ImageProbe) => void): void {
  const Constructor = preloaderConstructor()
  if (Constructor === null) {
    onSettled(FAILED_PROBE)
    return
  }

  let preloader: PreJS
  try {
    preloader = new Constructor()
  } catch {
    onSettled(FAILED_PROBE)
    return
  }

  let settled = false
  const settle = (probe: ImageProbe): void => {
    if (settled) return
    settled = true
    onSettled(probe)
  }

  preloader.on('loaded', (item) => {
    const asset = item.asset
    if (typeof HTMLImageElement !== 'undefined' && asset instanceof HTMLImageElement) {
      settle({ status: 'ready', width: asset.naturalWidth, height: asset.naturalHeight })
      return
    }
    settle(FAILED_PROBE)
  })
  preloader.on('error', () => settle(FAILED_PROBE))

  try {
    preloader.load([source], 'image')
  } catch {
    settle(FAILED_PROBE)
  }
}
