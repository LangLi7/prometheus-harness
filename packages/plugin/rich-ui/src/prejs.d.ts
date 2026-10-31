/**
 * Types for `prejs@1.2.6`.
 *
 * The package ships no declaration file, and its build predates ES modules
 * (`exports.default`, `__esModule`). The shape below is read from
 * `dist/loader.js`, not guessed:
 *
 * - `load()` accepts a single URL or a list, and a loader name, a custom
 *   function, or nothing (the extension decides).
 * - `on()` appends a handler. There is no `off()`, so a handler list only dies
 *   with its instance — create one per mount, never reuse it.
 * - An item that fails still reports progress `1`, so `complete` fires for a
 *   group that had errors; `error` is the signal, not the missing progress.
 */
declare module 'prejs' {
  /** One URL the loader is tracking. */
  export interface PreloadItem {
    /** The URL as given to `load()`. */
    readonly url: string
    /** `0` until the element has loaded or failed, then `1`. */
    progress: number
    /** The element the loader created; `false` before the loader ran. */
    asset: HTMLImageElement | HTMLAudioElement | HTMLVideoElement | false
  }

  /** The loader name, a custom per-item loader, or nothing to guess by extension. */
  export type PreloadLoader = 'image' | 'audio' | 'video' | ((item: PreloadItem) => void)

  export default class PreJS {
    /**
     * Start loading.
     *
     * @param urls - one URL or a list of them.
     * @param loader - which loader to use; omitted means "guess by extension".
     */
    load(urls: string | readonly string[], loader?: PreloadLoader): void

    /** Report one item as finished, for a custom loader. */
    loaded(item: PreloadItem): void

    on(event: 'loaded' | 'error' | 'loading', callback: (item: PreloadItem) => void): void
    on(event: 'progress', callback: (progress: number) => void): void
    on(event: 'complete', callback: (items: readonly PreloadItem[]) => void): void
    on(event: 'start', callback: (urls: readonly string[]) => void): void
  }
}
