/**
 * Die Browser-Hälfte — **ausgeführt**, nicht nur gebaut.
 *
 * ## Warum diese Prüfung über den Bau hinausgeht
 *
 * `build.mjs` prüft die Form: Kennung, `apply`, `inject`, `PANEL_ID`. Es prüft **nicht**, was
 * `apply` mit dem Client macht: welchen Slot es anmeldet, mit welcher Kennung, und ob das Panel
 * überhaupt ohne Absturz rendert. Genau dort liegt das Risiko — ein Slot-Name, der nicht existiert,
 * oder eine Kennung, die von der Seitenleiste abweicht, fiele sonst erst im Browser auf.
 *
 * Deshalb wird `lib/client.js` hier mit einem `window` und einem `document` ausgewertet, die nur
 * mitschreiben, und `apply` gegen einen Kontext gerufen, der die Dienste nachbildet — samt
 * `configForms`, denn aus ihm kommt seit den Anzeige-Einstellungen der Ort der Anmeldung.
 *
 * **Was hier nicht geprüft wird:** das Aussehen und die echten Daten. Dafür braucht es einen
 * Browser und einen Host, der das Bündel ausliefert.
 *
 * @module @prometheus-harness/zugaenge/tests/client
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'

/** Eine Slot-Anmeldung, wie sie der Client entgegennimmt. */
interface SlotDefinition {
  readonly name: string
  readonly key?: string
  readonly id?: string
  readonly order?: number
  readonly label?: () => string
  readonly locale?: string
}

/** Ein Stilelement. */
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
  readonly ZugaengePanel: (props: { readonly t: (schluessel: string) => string }) => unknown
}

/**
 * Wertet das gebaute Bündel aus.
 *
 * @param config - der Abschnitt, den der Host für den Eintrag meldet; leer heißt „noch nichts
 *   eingestellt" und muß deshalb die Vorgaben ergeben
 * @returns das Modul, die Anmeldungen, der Stil und die Abmeldung
 */
function ladeBuendel(config: Record<string, unknown> = {}): {
  readonly modul: Geladen
  readonly slots: SlotDefinition[]
  readonly head: Stilelement[]
  readonly wirkungen: (() => void)[]
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
    cookie: '',
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

  // **React wird nur nachgebildet, nicht ersetzt.** `useState` gibt seinen Anfangswert zurück,
  // `useEffect` läuft nicht (kein Netz im Test), JSX ergibt `null`. Damit rendert das Panel seinen
  // Leerzustand — und genau der darf nicht werfen.
  const react = {
    useState: <T,>(anfang: T): [T, (wert: T) => void] => [anfang, () => undefined],
    useEffect: () => undefined,
    useCallback: (f: unknown) => f,
    jsx: () => null,
    jsxs: () => null,
    Fragment: null,
    createElement: () => null,
  }
  const modul = definition.factory(() => react)

  const slots: SlotDefinition[] = []
  const wirkungen: (() => void)[] = []
  const ctx = {
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
        // Der main-Slot wird mit einem Generator angemeldet (`function*`), die übrigen mit einer
        // Funktion. Beide werden hier zu Ende geführt — dann steht die Anmeldung da.
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
  return { modul, slots, head, wirkungen }
}

describe('Die Browser-Hälfte', () => {
  test('meldet sich unter der Kennung an und nennt ihre Dienste', () => {
    const { modul } = ladeBuendel()
    expect(modul.PANEL_ID).toBe('zugaenge')
    expect(modul.inject).toContain('slots')
    expect(modul.inject).toContain('locale')
    expect(modul.inject).toContain('layout')
    // Ohne diesen Dienst gäbe es keine Anzeige-Einstellungen — und das Plugin stürbe beim Laden.
    expect(modul.inject).toContain('configForms')
  })

  test('ohne Einstellungen bleibt es bei den zwei Slots main und sidebar.panellist', () => {
    const { slots } = ladeBuendel()
    expect(slots).toHaveLength(2)
    const main = slots.find((eintrag) => eintrag.name === 'main')
    const sidebar = slots.find((eintrag) => eintrag.name === 'sidebar.panellist')
    expect(main?.key).toBe('zugaenge')
    expect(sidebar?.id).toBe('zugaenge')
    expect(sidebar?.order).toBe(14)
    expect(slots.every((eintrag) => eintrag.locale === 'zugaenge')).toBe(true)
  })

  /*
   * **Die Anzeige-Einstellungen.** Drei Fälle, und jeder prüft genau eine Zusage aus
   * `src/server.ts`: `surface` bestimmt den Ort, `order` den Platz, `label` die Beschriftung
   * (leer = Sprachpaket). Ein Feld für eine Start-Kachel gibt es nicht — dieses Plugin meldet keine
   * an.
   */
  test('surface "plugins" meldet nur die Plugin-Liste an, nicht die Seitenleiste', () => {
    const { slots } = ladeBuendel({ surface: 'plugins' })
    expect(slots.find((eintrag) => eintrag.name === 'sidebar.panellist')).toBeUndefined()
    expect(slots.find((eintrag) => eintrag.name === 'plugins.item')?.id).toBe('zugaenge')
  })

  test('surface "both" meldet beide Orte an', () => {
    const { slots } = ladeBuendel({ surface: 'both' })
    expect(slots.find((eintrag) => eintrag.name === 'sidebar.panellist')).toBeDefined()
    expect(slots.find((eintrag) => eintrag.name === 'plugins.item')).toBeDefined()
  })

  test('surface "none" läßt nur das main-Panel stehen', () => {
    const { slots } = ladeBuendel({ surface: 'none' })
    expect(slots.map((eintrag) => eintrag.name)).toEqual(['main'])
  })

  test('order und label kommen aus den Einstellungen; ein leeres label bleibt beim Sprachpaket', () => {
    const eigen = ladeBuendel({ surface: 'sidebar', order: 25, label: 'Zugänge privat' })
    const eintrag = eigen.slots.find((kandidat) => kandidat.name === 'sidebar.panellist')
    expect(eintrag?.order).toBe(25)
    expect(eintrag?.label?.()).toBe('Zugänge privat')

    const leer = ladeBuendel({ label: '   ' })
    expect(leer.slots.find((kandidat) => kandidat.name === 'sidebar.panellist')?.label?.()).toBe('panel')
  })

  test('hängt einen Stil ein und räumt ihn beim Abmelden weg', () => {
    const { head, wirkungen } = ladeBuendel()
    expect(head).toHaveLength(1)
    expect(head[0]?.textContent).toContain('.pmh-zu')
    expect(head[0]?.dataset).toEqual({ pmhZugaenge: '' })
    for (const ab of wirkungen.splice(0).reverse()) ab()
    expect(head).toHaveLength(0)
  })

  test('das Panel rendert seinen Leerzustand ohne Absturz', () => {
    const { modul } = ladeBuendel()
    expect(() => modul.ZugaengePanel({ t: (schluessel: string) => schluessel })).not.toThrow()
  })
})
