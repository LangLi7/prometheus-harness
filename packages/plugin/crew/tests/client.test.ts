/**
 * The browser half of the crew plugin — **executed**, not just inspected.
 *
 * ## The defect this guards
 *
 * `web boot: 1 entry did not activate — @prometheus-harness/crew: failed`. The panel never appeared
 * and the plugin manager listed it as off. The cause was one line at the end of `index.tsx`:
 * `export default apply`.
 *
 * The client runner treats a module's **default export** as the plugin. A bare function carries no
 * `inject`, so the first `ctx.locale` threw *"cannot get property \"locale\" without inject"* — and
 * with it the whole entry failed: panel, rail button, settings tab, everything.
 *
 * Every other client plugin in this repo exports `apply` and `inject` as **named** exports and no
 * default. This test holds that line, and the registrations that follow from it.
 *
 * @module @prometheus-harness/crew/tests/client
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** One slot registration, as the client accepts it. */
interface SlotDefinition {
  readonly name: string
  readonly key?: string
  readonly id?: string
  readonly order?: number
  readonly locale?: string
}

/** The loaded module. */
interface Loaded {
  readonly apply: (ctx: unknown) => void
  readonly inject: readonly string[]
  readonly PANEL_ID: string
  /** Present only when the module wrongly exports a default (the defect). */
  readonly default?: unknown
}

/** A style element as `document.createElement('style')` returns it. */
interface StyleElement {
  textContent: string
  readonly dataset: Record<string, string>
  readonly remove: () => void
}

/**
 * Evaluates the built bundle with fake `window` and `document`.
 *
 * @returns the module, the slot registrations and the style elements
 */
function loadBundle(): {
  readonly module: Loaded
  readonly slots: SlotDefinition[]
  readonly styles: StyleElement[]
} {
  const text = readFileSync(join(import.meta.dir, '..', 'lib', 'client.js'), 'utf8')
  const holder: { definition?: { id: string; factory: (load: (name: string) => unknown) => Loaded } } = {}
  const window = {
    __ModuleLoader__: {
      load: (definition: { id: string; factory: (load: (name: string) => unknown) => Loaded }) => {
        holder.definition = definition
      },
    },
  }
  const styles: StyleElement[] = []
  const document = {
    createElement: (): StyleElement => {
      const element: StyleElement = {
        textContent: '',
        dataset: {},
        remove: () => {
          const at = styles.indexOf(element)
          if (at >= 0) styles.splice(at, 1)
        },
      }
      return element
    },
    head: {
      append: (element: StyleElement) => {
        styles.push(element)
      },
    },
    title: 'test',
  }
  new Function('window', 'document', text)(window, document)
  const definition = holder.definition
  if (definition === undefined) throw new Error('the bundle does not register at __ModuleLoader__')

  // What `react` supplies is only needed for rendering, which never happens here.
  const react = {
    useState: <T,>(initial: T): [T, () => void] => [initial, () => undefined],
    useEffect: () => undefined,
    useCallback: <T,>(fn: T): T => fn,
    jsx: () => null,
    jsxs: () => null,
    Fragment: null,
    createElement: () => null,
  }

  const module = definition.factory(() => react)
  const slots: SlotDefinition[] = []
  const ctx = {
    locale: {
      bind: () => (key: string) => key,
      register: () => () => undefined,
      getLocale: () => ({ active: 'de' }),
    },
    effect: (fn: () => () => void) => {
      fn()
    },
    layout: { selectPanel: () => undefined },
    // The display block reads the entry's settings; an empty value means "all defaults".
    configForms: {
      get: () => ({
        getSnapshot: () => ({ value: {} }),
        subscribe: () => () => undefined,
      }),
    },
    slots: {
      inject: (_name: string, fn: () => unknown) => {
        const result = fn()
        // The main slot is registered with a generator, the others with a function.
        if (result !== null && typeof result === 'object' && 'next' in result) {
          ;(result as { next: () => unknown }).next()
        }
      },
      register: (entry: SlotDefinition) => {
        slots.push(entry)
        return () => {
          const at = slots.indexOf(entry)
          if (at >= 0) slots.splice(at, 1)
        }
      },
    },
    get: () => undefined,
  }
  module.apply(ctx)
  return { module, slots, styles }
}

describe('The crew client bundle', () => {
  test('exports no default — the runner would take it and drop `inject`', () => {
    const { module } = loadBundle()
    // This is the regression: `export default apply` fails the whole entry.
    expect(module.default).toBeUndefined()
    expect(typeof module.apply).toBe('function')
    expect(module.inject).toContain('slots')
    expect(module.inject).toContain('locale')
    expect(module.inject).toContain('layout')
  })

  test('registers panel, rail button and the settings tab', () => {
    const { slots } = loadBundle()
    const names = slots.map((entry) => entry.name).sort()
    expect(names).toEqual(['main', 'settings.plugins.tab', 'sidebar.panellist'])
    const panel = slots.find((entry) => entry.name === 'main')
    expect(panel?.key).toBe('crew')
    const tab = slots.find((entry) => entry.name === 'settings.plugins.tab')
    // The plugin manager keys its tabs by id; without one the tab would not render.
    expect(tab?.id).toBe('pmh-crew')
    expect(tab?.order).toBe(30)
  })

  test('injects its stylesheet once', () => {
    const { styles } = loadBundle()
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toContain('.pmh-cr')
  })
})
