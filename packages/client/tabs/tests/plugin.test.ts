import { afterEach, describe, expect, test } from 'bun:test'
import { apply, inject, name } from '../src/index.tsx'

/** Ein Slot-Eintrag, wie ihn `apply` an den Kern gibt. */
interface Eintrag {
  readonly name: string
  readonly key?: string
  readonly id?: string
}

/** Die Bühne: ein Kern, der nichts tut, aber alles mitschreibt. */
function buehne(
  optionen: {
    pathname?: string
    search?: string
    byId?: Record<string, { sessionId: string; retainedBy?: Record<string, number> }>
  } = {},
) {
  const eintraege: Eintrag[] = []
  const panelAufrufe: (string | null)[] = []
  const geoeffnet: string[] = []
  const gestartet: string[] = []
  const geschrieben: string[] = []
  const panelListeners = new Set<() => void>()
  const listeListeners = new Set<() => void>()
  const byId = optionen.byId ?? {}
  let panelId: string | null = null

  const ort = { pathname: optionen.pathname ?? '/', search: optionen.search ?? '' }
  /**
   * Der Verlauf schreibt die Adresse **zurück in die Attrappe**.
   *
   * Seit der Umstellung auf Pfade muß auch `pathname` mitwandern; sonst verglichen die Prüfungen
   * eine Adresse, die die Oberfläche nie gesehen hat.
   */
  const setze = (url: string): void => {
    const frage = url.indexOf('?')
    ort.pathname = frage >= 0 ? url.slice(0, frage) : url
    ort.search = frage >= 0 ? url.slice(frage) : ''
  }
  const verlauf = {
    replaceState: (_zustand: unknown, _titel: string, url: string) => {
      geschrieben.push(`R:${url}`)
      setze(url)
    },
    pushState: (_zustand: unknown, _titel: string, url: string) => {
      geschrieben.push(`P:${url}`)
      setze(url)
    },
  }

  const ctx = {
    effect: (f: () => unknown) => {
      const ab = f()
      return typeof ab === 'function' ? ab : () => undefined
    },
    locale: {
      bind: () => (schluessel: string) => schluessel,
      register: () => () => undefined,
    },
    layout: {
      panelInfo: {
        getSnapshot: () => ({ activePanelId: panelId }),
        subscribe: (f: () => void) => {
          panelListeners.add(f)
          return () => panelListeners.delete(f)
        },
      },
      selectPanel: (id: string | null) => {
        panelAufrufe.push(id)
        panelId = id
        for (const f of [...panelListeners]) f()
      },
    },
    sessions: {
      list: {
        getSnapshot: () => ({ ids: [], byId, phase: 'ready', projectionsBySession: {} }),
        subscribe: (f: () => void) => {
          listeListeners.add(f)
          return () => listeListeners.delete(f)
        },
      },
    },
    uiWorkspace: {
      openSession: (id: string) => {
        geoeffnet.push(id)
        // **Der Kern hält immer nur eine Sitzung.** Ohne dieses Löschen trügen zwei Zeilen das
        // Merkmal, `mainSessionId` gäbe die erste zurück — und der Test prüfte eine Lage, die es
        // nicht gibt.
        for (const andere of Object.values(byId)) delete andere.retainedBy
        const zeile = byId[id]
        if (zeile !== undefined) zeile.retainedBy = { mainView: 1 }
        for (const f of [...listeListeners]) f()
      },
      startSession: (id: string) => {
        gestartet.push(id)
      },
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

  return { ctx, eintraege, meldeListe: () => { for (const f of [...listeListeners]) f() }, panelAufrufe, geoeffnet, gestartet, geschrieben, ort, verlauf }
}

/**
 * Die globalen Attrappen: `location`, `history`, `document`, `addEventListener`.
 *
 * @param ort - die Adresse
 * @param verlauf - der Verlauf
 * @param arbeit - was mit den Attrappen laufen soll
 * @param zuhoerer - sammelt angemeldete Zuhörer **mit Namen** (für `popstate`)
 * @returns was `arbeit` zurückgibt
 */
function mitUmgebung<T>(
  ort: { pathname: string; search: string },
  verlauf: unknown,
  arbeit: () => T,
  zuhoerer?: { typ: string; ruf: () => void }[],
): T {
  const vorher = {
    location: Reflect.get(globalThis, 'location'),
    history: Reflect.get(globalThis, 'history'),
    document: Reflect.get(globalThis, 'document'),
    addEventListener: Reflect.get(globalThis, 'addEventListener'),
    removeEventListener: Reflect.get(globalThis, 'removeEventListener'),
  }
  Reflect.set(globalThis, 'location', ort)
  Reflect.set(globalThis, 'history', verlauf)
  Reflect.set(globalThis, 'document', {
    createElement: () => ({
      dataset: {},
      textContent: '',
      style: {},
      remove: () => undefined,
      setAttribute: () => undefined,
      append: () => undefined,
      addEventListener: () => undefined,
    }),
    head: { append: () => undefined },
    body: { append: () => undefined },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })
  /*
   * **Zuhörer werden gesammelt, nicht verschluckt.** `popstate` ist der Weg, auf dem „Zurück" und
   * „Vorwärts" die Adresse wieder anwenden; ohne Aufzeichnung ließe sich das nicht prüfen.
   */
  Reflect.set(globalThis, 'addEventListener', (typ: string, ruf: () => void) => {
    zuhoerer?.push({ typ, ruf })
  })
  Reflect.set(globalThis, 'removeEventListener', () => undefined)
  try {
    return arbeit()
  } finally {
    Reflect.set(globalThis, 'location', vorher.location)
    Reflect.set(globalThis, 'history', vorher.history)
    Reflect.set(globalThis, 'document', vorher.document)
    Reflect.set(globalThis, 'addEventListener', vorher.addEventListener)
    Reflect.set(globalThis, 'removeEventListener', vorher.removeEventListener)
  }
}

const echteZeitgeber = globalThis.setTimeout

afterEach(() => {
  globalThis.setTimeout = echteZeitgeber
})

describe('client-tabs', () => {
  test('die Dienste stehen in inject', () => {
    for (const dienst of ['slots', 'locale', 'layout', 'sessions', 'uiWorkspace']) {
      expect(inject).toContain(dienst)
    }
    expect(name).toBe('tabs')
  })

  test('registriert Panel und Menüeintrag — aber keinen Sidebar-Eintrag', () => {
    const b = buehne()
    mitUmgebung(b.ort, b.verlauf, () => apply(b.ctx as unknown as Parameters<typeof apply>[0]))

    expect(b.eintraege.map((e) => `${e.name}:${e.key ?? e.id}`)).toEqual([
      'main:workspaces',
      'sidebar.workspaces.session.menu.item:pmh.open-in-new-tab',
    ])
  })

  test('/w öffnet die Workspaces', () => {
    const b = buehne({ pathname: '/w' })
    mitUmgebung(b.ort, b.verlauf, () => apply(b.ctx as unknown as Parameters<typeof apply>[0]))
    expect(b.panelAufrufe).toContain('workspaces')
    // Die Adresse war schon richtig — sie wird nicht neu geschrieben.
    expect(b.geschrieben).toEqual([])
  })

  test('/c/… öffnet genau diese Sitzung', () => {
    const b = buehne({ pathname: '/c/ses_1', byId: { ses_1: { sessionId: 'ses_1' } } })
    mitUmgebung(b.ort, b.verlauf, () => apply(b.ctx as unknown as Parameters<typeof apply>[0]))
    expect(b.geoeffnet).toEqual(['ses_1'])
    expect(b.ort.pathname).toBe('/c/ses_1')
  })

  test('die alte Abfrage wird auf den Pfad umgeschrieben — ohne Verlaufseintrag', () => {
    const b = buehne({ search: '?s=ses_1', byId: { ses_1: { sessionId: 'ses_1' } } })
    mitUmgebung(b.ort, b.verlauf, () => apply(b.ctx as unknown as Parameters<typeof apply>[0]))
    expect(b.geoeffnet).toEqual(['ses_1'])
    expect(b.geschrieben[0]).toBe('R:/c/ses_1')
    expect(b.ort.pathname).toBe('/c/ses_1')
    expect(b.ort.search).toBe('')
  })

  test('ein Panelwechsel schreibt die Adresse — und der Rückweg nimmt sie zurück', () => {
    const b = buehne({ byId: { ses_1: { sessionId: 'ses_1', retainedBy: {} } } })
    mitUmgebung(b.ort, b.verlauf, () => apply(b.ctx as unknown as Parameters<typeof apply>[0]))

    // Der Start: der Kern stellt seine zuletzt gehaltene Sitzung wieder her.
    // Der **erste** Schreibvorgang ersetzt die Adresse, jeder weitere schiebt.
    b.ctx.uiWorkspace.openSession('ses_1')
    expect(b.geschrieben.at(-1)).toBe('R:/c/ses_1')

    b.ctx.layout.selectPanel('workspaces')
    expect(b.geschrieben.at(-1)).toBe('P:/w')

    b.ctx.layout.selectPanel(null)
    expect(b.geschrieben.at(-1)).toBe('P:/c/ses_1')
  })

  test('eine gehaltene Sitzung wird zur Adresse', () => {
    const b = buehne({ byId: { ses_1: { sessionId: 'ses_1', retainedBy: {} } } })
    mitUmgebung(b.ort, b.verlauf, () => apply(b.ctx as unknown as Parameters<typeof apply>[0]))

    b.ctx.uiWorkspace.openSession('ses_1')
    expect(b.ort.pathname).toBe('/c/ses_1')
    expect(b.geschrieben.at(-1)).toBe('R:/c/ses_1')
  })

  test('eine unbekannte Sitzung in der Adresse gibt auf — die Adresse folgt wieder der Oberfläche', () => {
    // Der Katalog ist **fertig** (phase: 'ready') und kennt die Kennung nicht: gelöschte Sitzung
    // oder Tippfehler. Ohne den Abbruch bliebe die Adresse für immer auf /c/gibtsnicht stehen.
    const b = buehne({ pathname: '/c/gibtsnicht' })
    mitUmgebung(b.ort, b.verlauf, () => apply(b.ctx as unknown as Parameters<typeof apply>[0]))

    // **Ein einzelner fertiger Katalog ist kein Beweis.** Er meldet `ready` auch, bevor alle
    // Sitzungen darin stehen (erste Seite, anderer Arbeitsbereich) — deshalb wird dreimal
    // nachgesehen, erst dann wird aufgegeben.
    expect(b.geoeffnet).toEqual([])
    expect(b.ort.pathname).toBe('/c/gibtsnicht')

    for (let i = 0; i < 3; i++) b.meldeListe()

    expect(b.geschrieben.at(-1)).toBe('R:/')
    expect(b.ort.pathname).toBe('/')
  })

  test('ein neuer Tab öffnet die Sitzung aus dem Pfad — auch wenn der Kern eine andere wiederherstellt', () => {
    /*
     * **Der gemeldete Fehler.** Der Kern stellt beim Start `ses_1` her; die Adresse sagt `ses_2`.
     * Vorher galt die wiederhergestellte Sitzung als Wahl des Nutzers, und der neue Tab landete im
     * Chat, in dem man ohnehin war. Jetzt zählt nur eine Änderung **nach** dem Start als Wahl.
     */
    const b = buehne({
      pathname: '/c/ses_2',
      byId: { ses_1: { sessionId: 'ses_1', retainedBy: { mainView: 1 } }, ses_2: { sessionId: 'ses_2' } },
    })
    mitUmgebung(b.ort, b.verlauf, () => apply(b.ctx as unknown as Parameters<typeof apply>[0]))

    expect(b.geoeffnet).toEqual(['ses_2'])
    expect(b.ort.pathname).toBe('/c/ses_2')
  })

  test('Zurück und Vorwärts wenden die Adresse wieder an', () => {
    const zuhoerer: { typ: string; ruf: () => void }[] = []
    const b = buehne({ byId: { ses_1: { sessionId: 'ses_1' }, ses_2: { sessionId: 'ses_2' } } })
    mitUmgebung(b.ort, b.verlauf, () => apply(b.ctx as unknown as Parameters<typeof apply>[0]), zuhoerer)

    const zurueck = zuhoerer.find((z) => z.typ === 'popstate')
    expect(zurueck).toBeDefined()

    // Vorwärts in die Übersicht: der Pfad gewinnt, das Panel wird gewählt.
    b.ort.pathname = '/w'
    zurueck?.ruf()
    expect(b.panelAufrufe.at(-1)).toBe('workspaces')

    // Zurück in einen Chat: das Panel wird verlassen, die Sitzung geöffnet.
    b.ort.pathname = '/c/ses_2'
    zurueck?.ruf()
    expect(b.panelAufrufe.at(-1)).toBeNull()
    expect(b.geoeffnet).toContain('ses_2')
  })

  test('eine Seite außerhalb von / bleibt unberührt', () => {
    const b = buehne()
    b.ort.pathname = '/anmeldung/'
    mitUmgebung(b.ort, b.verlauf, () => apply(b.ctx as unknown as Parameters<typeof apply>[0]))
    b.ctx.layout.selectPanel('workspaces')
    expect(b.geschrieben).toEqual([])
  })
})
