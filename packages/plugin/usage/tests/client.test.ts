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
 * ausgewertet, die beide nur mitschreiben, und `apply` gegen einen Kontext gerufen, der die drei
 * Dienste nachbildet. Was dabei herauskommt, ist der **Vertrag** der Browser-Hälfte.
 *
 * **Was hier nicht geprüft wird:** das Aussehen. Dafür braucht es einen Browser und einen Host, der
 * das Bündel ausliefert.
 *
 * @module @prometheus-harness/usage/tests/client
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'

/** Eine Slot-Anmeldung, so wie sie der Client entgegennimmt. */
interface SlotDefinition {
  readonly name: string
  readonly key?: string
  readonly id?: string
  readonly order?: number
  readonly label?: () => string
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
 * @param config - der Abschnitt, den der Host für den Eintrag meldet; leer heißt „noch nichts
 *   eingestellt" und muß deshalb die Vorgaben ergeben
 * @returns das Modul, die Attrappen und die Anmeldungen
 */
function ladeBuendel(config: Record<string, unknown> = {}): {
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
    // **Der Dienst, aus dem die Anzeige kommt.** `subscribe` meldet in dieser Attrappe nichts:
    // geprüft wird der erste Schnappschuss, nicht eine spätere Änderung.
    configForms: {
      get: () => ({
        getSnapshot: () => ({ status: 'ready', value: config }),
        subscribe: () => () => undefined,
      }),
    },
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
        //
        // **Rückgabe wie beim echten Dienst.** `slots.inject` liefert den Abmelder der Anmeldung;
        // das Plugin verwahrt ihn und ruft ihn beim Abmelden. Eine Attrappe ohne Rückgabe hätte
        // genau diesen Weg ungeprüft gelassen — und beim Abbau wäre `undefined()` geworfen worden.
        if (ergebnis !== null && typeof ergebnis === 'object' && 'next' in ergebnis) {
          const generator = ergebnis as { next: () => { value?: unknown } }
          const schritt = generator.next()
          return typeof schritt?.value === 'function' ? (schritt.value as () => void) : () => undefined
        }
        return typeof ergebnis === 'function' ? (ergebnis as () => void) : () => undefined
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
    expect(modul.PANEL_ID).toBe('usage')
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
    expect(main?.key).toBe('usage')
    expect(sidebar?.id).toBe('usage')
    expect(sidebar?.order).toBe(13)
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
    expect(typ?.guide?.[0]?.id).toBe('usage')
    expect(typ?.guide?.[0]?.order).toBe(36)
  })

  /*
   * **Die Anzeige-Einstellungen — der eigentliche Punkt dieser Runde.**
   *
   * Vier Fälle, und jeder prüft genau eine Zusage aus `src/server.ts`: `surface` bestimmt den Ort,
   * `order` den Platz, `label` die Beschriftung (leer = Sprachpaket), `guide` die Kachel.
   */
  test('ohne Einstellungen bleibt es bei der Seitenleiste — wie vor dem Feld', () => {
    const { slots } = ladeBuendel()
    expect(slots.filter((eintrag) => eintrag.name === 'plugins.item')).toHaveLength(0)
    expect(slots.find((eintrag) => eintrag.name === 'sidebar.panellist')?.order).toBe(13)
  })

  test('surface "plugins" meldet nur die Plugin-Liste an, nicht die Seitenleiste', () => {
    const { slots } = ladeBuendel({ surface: 'plugins' })
    expect(slots.find((eintrag) => eintrag.name === 'sidebar.panellist')).toBeUndefined()
    const karte = slots.find((eintrag) => eintrag.name === 'plugins.item')
    expect(karte?.id).toBe('usage')
  })

  test('surface "both" meldet beide Orte an', () => {
    const { slots } = ladeBuendel({ surface: 'both' })
    expect(slots.find((eintrag) => eintrag.name === 'sidebar.panellist')).toBeDefined()
    expect(slots.find((eintrag) => eintrag.name === 'plugins.item')).toBeDefined()
  })

  test('surface "none" meldet keinen Ort an — die Tab-Slots und der Stil bleiben', () => {
    const { slots } = ladeBuendel({ surface: 'none' })
    expect(slots.map((eintrag) => eintrag.name).sort()).toEqual([
      'main',
      'sidebar.right.pane.tab',
      'sidebar.right.pane.tab.title',
    ])
  })

  test('order und label kommen aus den Einstellungen; ein leeres label bleibt beim Sprachpaket', () => {
    const eigen = ladeBuendel({ surface: 'sidebar', order: 25, label: 'Budget' })
    const eintrag = eigen.slots.find((kandidat) => kandidat.name === 'sidebar.panellist')
    expect(eintrag?.order).toBe(25)
    expect(eintrag?.label?.()).toBe('Budget')

    const leer = ladeBuendel({ label: '   ' })
    expect(leer.slots.find((kandidat) => kandidat.name === 'sidebar.panellist')?.label?.()).toBe('panel')
  })

  test('guide: false nimmt die Start-Kachel weg, läßt den Tab-Typ aber stehen', () => {
    const { tabTypen } = ladeBuendel({ guide: false })
    expect(tabTypen).toHaveLength(1)
    expect(tabTypen[0]?.guide).toHaveLength(0)
  })

  test('hängt einen Stil ein und räumt ihn beim Abmelden wieder weg', () => {
    const { head, abmelden } = ladeBuendel()
    expect(head).toHaveLength(1)
    expect(head[0]?.textContent).toContain('.pmh-us')
    expect(head[0]?.dataset).toEqual({ pmhUsage: '' })
    abmelden()
    expect(head).toHaveLength(0)
  })
})
