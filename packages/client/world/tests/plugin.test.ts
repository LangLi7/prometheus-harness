import { describe, expect, test } from 'bun:test'
import { apply, inject, PANEL_ID } from '../src/index.tsx'

/** Ein Slot-Eintrag, wie ihn `apply` an den Kern gibt. */
interface Eintrag {
  readonly name: string
  readonly key?: string
  readonly id?: string
  readonly inject?: () => { readonly close: () => void }
}

describe('client-world', () => {
  test('inject nennt layout — ohne ihn wirft der Rückweg', () => {
    expect(inject).toContain('slots')
    expect(inject).toContain('locale')
    expect(inject).toContain('layout')
  })

  test('registriert main:world und sidebar.panellist:world', () => {
    const eintraege: Eintrag[] = []
    const auswahl: (string | null)[] = []
    const vorher = globalThis.document

    globalThis.document = {
      createElement: () => ({ dataset: {}, textContent: '', remove: () => undefined }),
      head: { append: () => undefined },
    } as unknown as Document

    try {
      const ctx = {
        effect: (f: () => unknown) => {
          f()
          return () => undefined
        },
        locale: {
          bind: () => (schluessel: string) => schluessel,
          register: () => () => undefined,
        },
        layout: {
          selectPanel: (id: string | null) => auswahl.push(id),
        },
        slots: {
          inject: (_name: string, f: () => unknown) => {
            const ergebnis = f()
            if (ergebnis !== null && typeof ergebnis === 'object' && 'next' in ergebnis) {
              ;(ergebnis as Generator).next()
            }
            return () => undefined
          },
          register: (eintrag: Eintrag) => {
            eintraege.push(eintrag)
            return () => undefined
          },
        },
      }
      apply(ctx as unknown as Parameters<typeof apply>[0])
    } finally {
      globalThis.document = vorher
    }

    expect(eintraege.map((e) => `${e.name}:${e.key ?? e.id}`)).toEqual([
      'main:world',
      'sidebar.panellist:world',
    ])
    expect(PANEL_ID).toBe('world')

    const main = eintraege[0]
    expect(main?.inject).toBeDefined()
    const verbunden = main?.inject?.()
    verbunden?.close()
    expect(auswahl).toEqual([null])
  })
})
