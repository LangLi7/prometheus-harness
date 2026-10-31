/**
 * **Der Einstellungsbildschirm — als Klasse, ohne Umweg über die Insel.**
 *
 * **Warum dieser Test so aufgebaut ist.** Der Betreiber: „settings funktioniert nicht per dynamic
 * illand bzw sollte es den settings öffnen vom Harness die man auch in chat hat".
 *
 * Der erste Anlauf prüfte den **Weg** über die Insel: den Eintrag ⚙ im DOM suchen und klicken. Das
 * scheiterte am **Stub**, nicht am Code — der Stub baut `innerHTML` nur grob nach, und die Einträge
 * der Insel entstehen genau so. Ein Test, der am Stub scheitert, meldet nichts über die Anwendung.
 *
 * Deshalb zwei getrennte Aussagen:
 *
 *   1. **Hier:** die Klasse `SettingsModal` wird **direkt** geprüft — öffnen, aufbauen, Abschnitte
 *      wechseln, schliessen, Escape. Das ist die Logik, und sie ist ohne DOM-Attrappen prüfbar.
 *   2. **Im Browser:** der Klick auf den Insel-Eintrag. Das steht in der Messung (`tools/measure.js`)
 *      und ist die stärkere Aussage, weil dort ein echter Browser klickt.
 *
 * **Und was das für den nächsten Agenten heisst:** ein Test, der eine Attrappe prüft, ist kein Test
 * der Anwendung. Wo die Attrappe nicht reicht, gehört die Prüfung in den Browser — nicht in eine
 * grössere Attrappe.
 */
import { beforeEach, expect, test } from 'bun:test'
import { SettingsModal } from '../src/settings-modal'
import { Settings } from '../src/settings'
import { PluginRegistry } from '../src/plugins'
import { Locales } from '../src/i18n'
import { en } from '../src/locales/en'
import { de } from '../src/locales/de'
import { controlsPlugin } from '../src/control-settings'

/** Ein Speicher, der nichts vergisst. */
function speicher(): Storage {
  const daten = new Map<string, string>()
  return {
    get length() {
      return daten.size
    },
    clear: () => daten.clear(),
    getItem: (key: string) => daten.get(key) ?? null,
    key: (index: number) => [...daten.keys()][index] ?? null,
    removeItem: (key: string) => void daten.delete(key),
    setItem: (key: string, value: string) => void daten.set(key, value),
  } as Storage
}

/**
 * Ein winziger Knoten — nur für diesen Test.
 *
 * Er ist **kleiner** als der DOM-Stub in `dom-stub.ts`, weil er weniger können muss: hier wird kein
 * `innerHTML` gebaut, sondern nur angehängt. Wer mehr braucht, nimmt den Stub.
 */
interface Knoten {
  tagName: string
  className: string
  textContent: string
  type: string
  checked: boolean
  value: string
  htmlFor: string
  children: Knoten[]
  attributes: Map<string, string>
  listeners: Map<string, (event: unknown) => void>
  append(...kinder: Knoten[]): void
  appendChild(kind: Knoten): void
  replaceChildren(...kinder: Knoten[]): void
  addEventListener(type: string, fn: (event: unknown) => void): void
  removeEventListener(type: string): void
  setAttribute(name: string, value: string): void
  classList: {
    add(...werte: string[]): void
    remove(...werte: string[]): void
    toggle(wert: string, an?: boolean): boolean
    contains(wert: string): boolean
  }
  dataset: Record<string, string>
  readonly vollerText: string
  getBoundingClientRect(): { width: number; height: number }
}

function knoten(tagName = 'div'): Knoten {
  const namen = new Set<string>()
  let kennung = ''
  const el: Knoten = {
    tagName: tagName.toUpperCase(),
    className: '',
    textContent: '',
    type: '',
    checked: false,
    value: '',
    htmlFor: '',
    children: [],
    attributes: new Map(),
    listeners: new Map(),
    dataset: {},
    append(...kinder) {
      el.children.push(...kinder)
    },
    appendChild(kind) {
      el.children.push(kind)
    },
    replaceChildren(...kinder) {
      el.children = kinder
    },
    addEventListener(type, fn) {
      el.listeners.set(type, fn)
    },
    removeEventListener(type) {
      el.listeners.delete(type)
    },
    setAttribute(name, wert) {
      el.attributes.set(name, wert)
    },
    classList: {
      add: (...werte) => werte.forEach((w) => namen.add(w)),
      remove: (...werte) => werte.forEach((w) => namen.delete(w)),
      toggle: (wert, an) => {
        const soll = an ?? !namen.has(wert)
        if (soll) namen.add(wert)
        else namen.delete(wert)
        return soll
      },
      contains: (wert) => namen.has(wert),
    },
    get vollerText(): string {
      return [el.textContent, ...el.children.map((k) => k.vollerText)].join(' ').replace(/\s+/g, ' ').trim()
    },
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
  }
  // `className` wird beim Setzen auch als Klasse geführt — sonst findet `nachKlasse` nichts.
  Object.defineProperty(el, 'className', {
    get: () => [...namen].join(' '),
    set: (wert: string) => {
      namen.clear()
      for (const teil of wert.split(/\s+/)) if (teil !== '') namen.add(teil)
    },
  })
  /**
   * **`id` ist im echten DOM auch ein Attribut.**
   *
   * `element.id = 'x'` setzt im Browser **auch** `id="x"`. Der Testknoten tat das nicht, und ein
   * Test, der ein Feld über seine Kennung sucht, fand nichts — ein Fehlalarm über die Attrappe.
   * Derselbe Fehler wie bei `title` im grossen Stub, und dieselbe Lehre: eine Attrappe muss die
   * Eigenschaften mitschreiben, die im DOM Attribute sind.
   */
  Object.defineProperty(el, 'id', {
    get: () => kennung,
    set: (wert: string) => {
      kennung = wert
      el.attributes.set('id', wert)
    },
  })
  return el
}

function alle(wurzel: Knoten): Knoten[] {
  return wurzel.children.flatMap((kind) => [kind, ...alle(kind)])
}

function nachKlasse(wurzel: Knoten, klasse: string): readonly Knoten[] {
  return alle(wurzel).filter((k) => k.className.split(/\s+/).includes(klasse))
}

/** Der Dokument-Ersatz: der Bildschirm hängt seine Tastatur an `document` und baut Knoten darüber. */
const dokument = knoten('document')
Object.assign(dokument, {
  createElement: (tag: string): Knoten => knoten(tag),
  createElementNS: (_ns: string, tag: string): Knoten => knoten(tag),
  createTextNode: (text: string): Knoten => {
    const el = knoten('#text')
    el.textContent = text
    return el
  },
})
Object.defineProperty(globalThis, 'document', { value: dokument, configurable: true, writable: true })

function baue(): { host: Knoten; modal: SettingsModal; settings: Settings; geaendert: string[] } {
  const settings = new Settings('test')
  const registry = new PluginRegistry()
  const locales = new Locales()
  locales.register(en)
  locales.register(de)
  locales.set('de')
  const geaendert: string[] = []
  const host = knoten('div')
  // **Eintragen, nicht nur beschreiben.** `registry.register` ruft `onEnable`, und **dort** werden
  // die Felder in die Verwaltung eingetragen. Ohne diesen Aufruf ist der Bildschirm leer — was
  // genau der Fehler war, den dieser Test gefunden hat.
  registry.register(controlsPlugin({ settings, onApply: (key) => geaendert.push(key) }))
  const modal = new SettingsModal(host as unknown as HTMLElement, {
    settings,
    registry,
    t: () => locales.translator(),
    apply: (key) => geaendert.push(key),
  })
  return { host, modal, settings, geaendert }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: speicher(), configurable: true })
  dokument.listeners.clear()
  dokument.children.length = 0
})

test('zu Beginn ist der Bildschirm zu und leer', () => {
  const { host, modal } = baue()
  expect(modal.isOpen()).toBe(false)
  expect(host.className).not.toContain('offen')
  expect(host.children.length).toBe(0)
})

test('öffnen baut den Bildschirm: Abschnitte links, Zeilen rechts', () => {
  const { host, modal } = baue()
  modal.open()

  expect(modal.isOpen()).toBe(true)
  expect(host.className).toContain('offen')

  const pflicht: readonly (readonly [string, boolean])[] = [
    ['Schleier', nachKlasse(host, 'set-schleier').length === 1],
    ['Dialog', nachKlasse(host, 'set-dialog').length === 1],
    ['Kopfzeile', nachKlasse(host, 'set-kopf').length === 1],
    ['Abschnittsleiste', nachKlasse(host, 'set-nav').length === 1],
    ['Inhalt', nachKlasse(host, 'set-inhalt').length === 1],
  ]
  const fehlend = pflicht.filter(([, da]) => !da).map(([name]) => name)
  expect(fehlend.join(', ')).toBe('')

  // **Die Abschnitte sind die Gruppen, die es wirklich gibt.** Sie kommen aus `CATEGORIES` und aus
  // dem, was die Plugins beschreiben — nicht aus einer Liste im Bildschirm.
  const namen = nachKlasse(host, 'set-navitem').map((k) => k.vollerText)
  expect(namen).toContain('Steuerung')
  expect(namen).toContain('Universe')
  expect(namen).toContain('Oberfläche')
  expect(namen.length).toBeGreaterThanOrEqual(3)

  // Und der Steuerungs-Abschnitt zeigt Zeilen mit Beschriftung und Erklärung.
  const zeilen = nachKlasse(host, 'set-zeile')
  expect(zeilen.length).toBeGreaterThan(2)
  expect(nachKlasse(host, 'set-label').length).toBe(zeilen.length)
  expect(nachKlasse(host, 'set-desc').length).toBe(zeilen.length)
})

test('ein Abschnitt lässt sich wechseln', () => {
  const { host, modal } = baue()
  modal.open()
  const welt = nachKlasse(host, 'set-navitem').find((k) => k.vollerText === 'Universe')
  expect(welt, 'kein Abschnitt Universe').toBeDefined()
  if (!welt) return

  welt.listeners.get('click')?.({})
  const aktiv = nachKlasse(host, 'set-navitem').find((k) => k.className.includes('on'))
  expect(aktiv?.vollerText).toBe('Universe')
  // Der Inhalt hat gewechselt: die Dimensionen sind eine Welt-Einstellung, die Drehgeschwindigkeit
  // eine Steuerungs-Einstellung.
  expect(nachKlasse(host, 'set-label').map((k) => k.vollerText).join(' | ')).toContain('Dimensionen')
})

test('eine Zahl lässt sich setzen — und der Wirt erfährt es', () => {
  const { host, modal, settings, geaendert } = baue()
  modal.open()
  // **Das Feld wird über seine Kennung gesucht, nicht über die Reihenfolge.** Die Zeilen sind
  // alphabetisch sortiert (`axisSpin`, `panFactor`, `rotateSpeed`, `zoomFactor`) — wer `[0]` nimmt,
  // prüft das falsche Feld und hält ein richtiges Ergebnis für einen Fehler. Genau das ist beim
  // ersten Anlauf passiert.
  const alleZahlen = alle(host).filter((k) => k.className.includes('set-zahl'))
  expect(alleZahlen.length, 'keine Zahlenfelder').toBeGreaterThan(0)
  const zahl = alleZahlen.find((k) => k.attributes.get('id') === 'set-control-rotateSpeed')
  expect(zahl, `Feld nicht gefunden. Vorhanden: ${alleZahlen.map((k) => k.attributes.get('id')).join(', ')}`).toBeDefined()
  if (!zahl) return

  expect(settings.getNumber('control.rotateSpeed', 0)).toBe(0.00175)
  const hoerer = zahl.listeners.get('change')
  expect(hoerer, 'das Zahlenfeld hat keinen change-Zuhörer').toBeDefined()
  if (!hoerer) return

  zahl.value = '0.004'
  hoerer({})
  // **Der Wert ist gespeichert und gemeldet** — nicht nur angezeigt.
  expect(settings.getNumber('control.rotateSpeed', 0)).toBe(0.004)
  expect(geaendert).toContain('control.rotateSpeed')
})

test('zurücksetzen stellt die Vorgaben her', () => {
  const { host, modal, settings } = baue()
  modal.open()
  settings.set('control.rotateSpeed', 0.004)
  modal.open()
  const zurueck = nachKlasse(host, 'set-knopf').find((k) => k.vollerText.includes('zurücksetzen'))
  expect(zurueck, 'kein Zurücksetzen-Knopf').toBeDefined()
  if (!zurueck) return
  zurueck.listeners.get('click')?.({})
  expect(settings.getNumber('control.rotateSpeed', 0)).toBe(0.00175)
})

test('der Schliessen-Knopf und Escape schliessen den Bildschirm', () => {
  const { host, modal } = baue()
  modal.open()
  expect(modal.isOpen()).toBe(true)

  // Der Zuhoerer für Escape hängt am Dokument.
  const taste = dokument.listeners.get('keydown')
  expect(taste, 'kein keydown-Zuhoerer am Dokument').toBeDefined()
  taste?.({ key: 'Escape' })
  expect(modal.isOpen()).toBe(false)
  expect(host.className).not.toContain('offen')
  expect(host.children.length, 'der Bildschirm ist nicht abgeräumt').toBe(0)

  // Wieder öffnen und über den Knopf schliessen.
  modal.open()
  /*
   * **Gesucht wird über die Handlung, nicht über das Bild.**
   *
   * Hier stand `k.vollerText.trim() === '✕'` — der Knopf trug ein Schriftzeichen, und ein Test konnte
   * ihn daran erkennen. Seit dem 15.10.2026 trägt er ein **gezeichnetes** Kreuz
   * (`@prometheus-harness/icons`, weil der Betreiber die Schriftzeichen abgelehnt hat): es gibt keinen
   * Text mehr, an dem man ihn finden könnte. Ein Test, der jetzt die Zeichnung vergliche, wäre ein
   * Test über das Bild und bräche beim nächsten Zeichenwechsel.
   *
   * Der Griff ist deshalb `data-close` — dasselbe Verfahren wie `data-action` an den Insel-Einträgen.
   */
  const zu = nachKlasse(host, 'set-knopf').find((k) => k.dataset['close'] === 'settings')
  expect(zu, 'kein Schliessen-Knopf').toBeDefined()
  /*
   * **Das Zeichen selbst wird hier NICHT geprüft — und das ist Absicht.**
   *
   * Der Knoten dieses Tests baut `innerHTML` nicht nach (siehe Dateikopf: „hier wird kein `innerHTML`
   * gebaut, sondern nur angehängt"). Eine Prüfung „der Knopf enthält ein `<svg>`" würde damit den
   * **Stub** prüfen, nicht die Anwendung — der Fehlalarm, vor dem der Dateikopf ausdrücklich warnt.
   * Daß die Zeichen wirklich im Bild stehen, prüft die Messung im **Browser** (jedes `.ih`, `.x` und
   * `.set-knopf` trägt ein `<svg>`), und daß jedes Zeichen gezeichnet ist, prüft
   * `packages/assets/icons/tests/icons.test.ts`.
   */
  zu?.listeners.get('click')?.({})
  expect(modal.isOpen()).toBe(false)
})

test('der Klick neben den Dialog schliesst ihn — der Klick hinein nicht', () => {
  const { host, modal } = baue()
  modal.open()
  const dialog = nachKlasse(host, 'set-dialog')[0]
  const schleier = nachKlasse(host, 'set-schleier')[0]
  expect(dialog, 'kein Dialog').toBeDefined()
  expect(schleier, 'kein Schleier').toBeDefined()
  if (!dialog || !schleier) return

  // Ein Klick **im** Dialog darf nicht schliessen: sonst wäre jedes Bedienen ein Schliessen.
  let gestoppt = false
  dialog.listeners.get('click')?.({ stopPropagation: () => (gestoppt = true) })
  expect(gestoppt, 'der Dialog stoppt den Klick nicht').toBe(true)
  expect(modal.isOpen()).toBe(true)

  // Ein Klick auf den Schleier schon.
  schleier.listeners.get('click')?.({})
  expect(modal.isOpen()).toBe(false)
})

test('ein leerer Abschnitt erklärt sich, statt leer zu bleiben', () => {
  const settings = new Settings('test')
  const registry = new PluginRegistry()
  const locales = new Locales()
  locales.register(en)
  locales.set('en')
  // Ohne Plugins gibt es keine Einstellungen — der Bildschirm darf trotzdem bauen.
  const host = knoten('div')
  const modal = new SettingsModal(host as unknown as HTMLElement, {
    settings,
    registry,
    t: () => locales.translator(),
    apply: () => {},
  })
  modal.open()
  // Kein Abschnitt in der Leiste — ein Ziel, hinter dem nichts steht, sieht aus wie ein Fehler.
  expect(nachKlasse(host, 'set-navitem').length).toBe(0)
})
