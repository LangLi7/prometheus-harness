/**
 * Die Browser-Hälfte — **ausgeführt**, nicht nur betrachtet.
 *
 * ## Warum diese Prüfung über den Bau hinausgeht
 *
 * `build.mjs` prüft die Form: Kennung, `apply`, `inject`, `PANEL_ID`. Es prüft **nicht**, was `apply`
 * mit dem Client macht. Genau dort liegt das Risiko: ein Slot-Name, der nicht existiert, oder eine
 * Kennung, die von der Sidebar abweicht, fällt sonst erst im Browser auf — also erst nach einem
 * Neustart des Hosts, den man dafür nicht machen will.
 *
 * Deshalb wird das erzeugte `lib/client.js` hier mit einem `window` und einem `document`
 * ausgewertet, die beide nur mitschreiben, und `apply` gegen einen Kontext gerufen, der die Dienste
 * nachbildet. Was dabei herauskommt, ist der **Vertrag** der Browser-Hälfte.
 *
 * @module @prometheus-harness/git/tests/client
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as jsxRuntime from 'react/jsx-runtime'

import type { Context } from '@deepseek-ai/cordis'

/** Eine Slot-Anmeldung, so wie sie der Client entgegennimmt. */
interface SlotDefinition {
  readonly name: string
  readonly key?: string
  readonly id?: string
  readonly order?: number
  readonly locale?: string
}

/** Ein Stilelement, wie es `document.createElement('style')` liefert. */
interface Stilelement {
  textContent: string
  readonly dataset: Record<string, string>
  readonly remove: () => void
}

/** Das geladene Modul. */
interface Geladen {
  readonly apply: (ctx: Context) => void
  readonly inject: readonly string[]
  readonly PANEL_ID: string
  readonly TAB_ID: string
  readonly TAB_KIND: string
}

/** Das Panel, wie es das Bündel exportiert. */
interface Panelmodul extends Geladen {
  readonly GitPanel: (props: { readonly t: (schluessel: string) => string }) => unknown
}

/**
 * Lädt das Bündel mit **echtem** React.
 *
 * **Warum getrennt von {@link ladeBuendel}.** Dort wird React nur attrappiert, weil nie gerendert
 * wird. Hier wird gerendert: ein Panel, das im ersten Durchlauf ohne Daten steht — genau der
 * Zustand, den jeder Nutzer beim Öffnen sieht. Ein Fehler in JSX oder in einem Pflichtfeld fällt
 * damit hier auf und nicht erst im Browser.
 *
 * @returns das Modul mit `GitPanel`
 */
function ladeMitReact(): Panelmodul {
  const text = readFileSync(join(import.meta.dir, '..', 'lib', 'client.js'), 'utf8')
  const halter: { definition?: { id: string; factory: (lade: (name: string) => unknown) => Panelmodul } } = {}
  const fenster = {
    __ModuleLoader__: {
      load: (definition: { id: string; factory: (lade: (name: string) => unknown) => Panelmodul }) => {
        halter.definition = definition
      },
    },
  }
  new Function('window', text)(fenster)
  const definition = halter.definition
  if (definition === undefined) throw new Error('das Bündel meldet sich nicht am __ModuleLoader__ an')
  return definition.factory((name) =>
    name === 'react' ? React : name === 'react/jsx-runtime' ? jsxRuntime : {},
  )
}

/** Ein Tab-Typ, wie ihn die rechte Leiste entgegennimmt. */
interface TabTyp {
  readonly id: string
  readonly kind: string
  readonly multiple?: boolean
  readonly keepMounted?: boolean
  readonly priority?: string
  readonly title: () => string
  readonly guide?: readonly { readonly id: string; readonly order: number; readonly title: () => string }[]
}

/**
 * Wertet das gebaute Bündel aus — mit Attrappen für `window` und `document`.
 *
 * @returns das Modul, die Attrappen und die Anmeldungen
 */
function ladeBuendel(): {
  readonly modul: Geladen
  readonly slots: SlotDefinition[]
  readonly tabTypen: TabTyp[]
  readonly head: Stilelement[]
  readonly abmelden: () => void
} {
  const text = readFileSync(join(import.meta.dir, '..', 'lib', 'client.js'), 'utf8')
  const halter: { definition?: { id: string; factory: (lade: (name: string) => unknown) => Geladen } } = {}
  const fenster = {
    __ModuleLoader__: {
      load: (definition: { id: string; factory: (lade: (name: string) => unknown) => Geladen }) => {
        halter.definition = definition
      },
    },
  }
  const head: Stilelement[] = []
  const dokument = {
    createElement: (): Stilelement => {
      const element: Stilelement = {
        textContent: '',
        dataset: {},
        remove: () => {
          const at = head.indexOf(element)
          if (at >= 0) head.splice(at, 1)
        },
      }
      return element
    },
    head: {
      append: (element: Stilelement) => {
        head.push(element)
      },
    },
  }
  new Function('window', 'document', text)(fenster, dokument)
  const definition = halter.definition
  if (definition === undefined) throw new Error('das Bündel meldet sich nicht am __ModuleLoader__ an')
  // Was `react` liefert, wird nur gebraucht, wenn gerendert wird — hier nie.
  const react = {
    useState: <T,>(anfang: T): [T, () => void] => [anfang, () => undefined],
    useEffect: () => undefined,
    useCallback: <T,>(f: T): T => f,
    jsx: () => null,
    jsxs: () => null,
    Fragment: null,
    createElement: () => null,
  }
  const modul = definition.factory(() => react)
  const slots: SlotDefinition[] = []
  const tabTypen: TabTyp[] = []
  const wirkungen: (() => void)[] = []
  const leiste = {
    register: (definition2: unknown) => {
      tabTypen.push(definition2 as TabTyp)
      return () => {
        const at = tabTypen.indexOf(definition2 as TabTyp)
        if (at >= 0) tabTypen.splice(at, 1)
      }
    },
  }
  const ctx = {
    // Der Dienst steht dem Plugin bereit, weil es ihn im `inject` nennt — der Loader löst die
    // Reihenfolge auf, nicht dieses Plugin. Die Attrappe bildet genau diesen Zustand nach.
    sidebarRightTabs: leiste,
    locale: {
      bind: () => (schluessel: string) => schluessel,
      register: () => () => undefined,
    },
    effect: (fn: () => () => void) => {
      wirkungen.push(fn())
    },
    layout: { selectPanel: () => undefined },
    slots: {
      inject: (_name: string, fn: () => unknown) => {
        const ergebnis = fn()
        // Der main-Slot wird mit einem Generator angemeldet (`function*`), die übrigen mit
        // einer Funktion. Beide werden hier zu Ende geführt — dann steht die Anmeldung da.
        if (ergebnis !== null && typeof ergebnis === 'object' && 'next' in ergebnis) {
          const generator = ergebnis as { next: () => unknown }
          generator.next()
        }
      },
      register: (eintrag: SlotDefinition) => {
        slots.push(eintrag)
        return () => {
          const at = slots.indexOf(eintrag)
          if (at >= 0) slots.splice(at, 1)
        }
      },
    },
  } as unknown as Context
  modul.apply(ctx)
  return {
    modul,
    slots,
    tabTypen,
    head,
    abmelden: () => {
      for (const ab of wirkungen.splice(0).reverse()) ab()
    },
  }
}

describe('Die Browser-Hälfte', () => {
  test('meldet sich unter der Kennung an und nennt die rechte Leiste im inject', () => {
    const { modul } = ladeBuendel()
    expect(modul.PANEL_ID).toBe('git')
    expect(modul.inject).toContain('slots')
    // Ohne diesen Dienst liefe die Anmeldung des Tab-Typs ins Leere — er muss im `inject` stehen,
    // damit der Loader `ui-sidebar-right` vorher lädt.
    expect(modul.inject).toContain('sidebarRightTabs')
  })

  test('registriert vier Slots: main, sidebar.panellist und die zwei Tab-Slots', () => {
    const { slots, modul } = ladeBuendel()
    expect(slots).toHaveLength(4)
    const main = slots.find((eintrag) => eintrag.name === 'main')
    const sidebar = slots.find((eintrag) => eintrag.name === 'sidebar.panellist')
    const rumpf = slots.find((eintrag) => eintrag.name === 'sidebar.right.pane.tab')
    const titel = slots.find((eintrag) => eintrag.name === 'sidebar.right.pane.tab.title')
    expect(main?.key).toBe('git')
    expect(sidebar?.id).toBe('git')
    expect(sidebar?.order).toBe(14)
    // Beide Tab-Slots hängen unter der Kennung des Typs — so findet die Leiste den Rumpf.
    expect(rumpf?.key).toBe(modul.TAB_ID)
    expect(titel?.key).toBe(modul.TAB_ID)
  })

  test('meldet einen Tab-Typ für die rechte Leiste an — mit Guide-Eintrag', () => {
    const { tabTypen, modul } = ladeBuendel()
    expect(tabTypen).toHaveLength(1)
    const typ = tabTypen[0]
    expect(typ?.id).toBe(modul.TAB_ID)
    expect(typ?.kind).toBe(modul.TAB_KIND)
    expect(typ?.keepMounted).toBe(true)
    expect(typ?.multiple).toBe(false)
    expect(typ?.title()).toBe('panel')
    expect(typ?.guide?.[0]?.id).toBe('git')
    expect(typ?.guide?.[0]?.order).toBe(37)
  })

  test('hängt einen Stil ein und räumt ihn beim Abmelden wieder weg', () => {
    const { head, abmelden } = ladeBuendel()
    expect(head).toHaveLength(1)
    expect(head[0]?.textContent).toContain('.pmh-git')
    expect(head[0]?.dataset).toEqual({ pmhGit: '' })
    abmelden()
    expect(head).toHaveLength(0)
  })
})

describe('Das Panel rendert', () => {
  test('der erste Durchlauf ohne Daten zeigt Kopf, Leiste und Ladehinweis', () => {
    const modul = ladeMitReact()
    const html = renderToStaticMarkup(
      React.createElement(modul.GitPanel as never, { t: (schluessel: string) => schluessel }),
    )
    expect(html).toContain('pmh-git')
    expect(html).toContain('pmh-git__head')
    // Die drei Modi stehen als Segmente da — der Umschalter ist der Kern der Ansicht. Die Attrappe
    // gibt die Übersetzungsschlüssel zurück, also heißen sie hier wie ihre Schlüssel.
    expect(html).toContain('pmh-git__segmente')
    expect(html).toContain('working')
    expect(html).toContain('branch')
    expect(html).toContain('round')
    expect(html).toContain('unified')
    expect(html).toContain('split')
    expect(html).toContain('loading')
    expect(html).not.toContain('pmh-git__fehler')
  })
})
