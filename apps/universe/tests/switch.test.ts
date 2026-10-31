/**
 * **Die Marke oben links ist der Umschalter zum Chat — und sie ist bedienbar.**
 *
 * **Der Auftrag (Betreiber, 14.10.2026):** *„schaue dir eine moeglichkeit es einfacher in dem
 * Universe modus zu wechseln ich denke wir nutzen oben links den text … fuers wechseln"*, und auf die
 * Rueckfrage: *„ja genau … zur chat wechseln von universum zur chat ist das auch ein gute idee
 * ansonsten habe ich noch in dynamic illand die moeglichkeit es zu wechseln."*
 *
 * **Was dieser Test misst — und was nicht.**
 *
 * Gemessen wird: die Marke **ist** ein Bedienelement (Rolle, Fokus, Beschriftung, Zuhoerer), ein
 * Klick **wechselt wirklich** (die Bildschirme tauschen `hidden`), die Tastatur tut dasselbe, und die
 * Insel bleibt der zweite Weg. Gemessen wird auch, dass die Marke **die Marke bleibt** — derselbe
 * Knoten mit demselben Text, kein Etikett daneben.
 *
 * **Nicht** gemessen wird hier die Persistenz: der Stub hat keinen echten Speicher (`localStorage`
 * ist eine Attrappe, siehe `dom-stub.ts`). Dass der Wechsel **auch gemerkt** wird, prueft
 * `view-switch.test.ts` an der Funktion, durch die jeder Weg geht.
 */
import { expect, test } from 'bun:test'
import { aktiviereGeruest, document_, navigation } from './dom-stub'
import { bootOnce } from './boot-once'

/** Die Herkunft, unter der Chat und Welt liegen — dieselbe, weil **ein** Port beide ausliefert. */
const HARNESS = 'http://127.0.0.1:3081'

/**
 * **Setzt die Herkunft der Seite** — der Fall „die Welt laeuft auf einem Webserver".
 *
 * Die Huelle liest sie **beim Klick** (`chatZiel` → `chatUrl(location.origin)` in `entry.ts`), genau
 * deshalb ist dieser Fall ueberhaupt pruefbar: die Huelle wird in diesem Lauf **einmal** geladen (alle
 * Testdateien teilen sich ein Modul, gemessen), ein zweiter Start mit anderer Herkunft gibt es also
 * nicht.
 *
 * **Was hier frueher stand.** Die Adresse des Chats kam als Zusatz aus der Adreßzeile
 * (`?chat=http%3A%2F%2F…`) — noetig, solange die Welt auf einem **eigenen** Port lag. Der Betreiber:
 * *„der link ist nur zu lange so lol"*. Seit beide auf einem Port liegen, ist die Adresse des Chats
 * die **eigene** Herkunft; sie zu setzen ist derselbe Fall, nur ohne Adreßzeile.
 *
 * @param herkunft - `location.origin`, wie ein Browser sie liefert (`http://host:port`)
 */
function setzeHerkunft(herkunft: string): void {
  const ort = (globalThis as unknown as { location: { origin: string } }).location
  ort.origin = herkunft
}

interface Knoten {
  readonly tagName: string
  readonly className: string
  readonly textContent: string
  readonly children: readonly Knoten[]
  readonly attributes: Map<string, string>
  readonly listeners: Map<string, (event: unknown) => void>
  readonly classList: { contains(name: string): boolean }
  readonly dataset: Record<string, string>
  readonly vollerText: string
}

function alle(wurzel: Knoten): Knoten[] {
  return wurzel.children.flatMap((kind) => [kind, ...alle(kind)])
}

function alsKnoten(id: string): Knoten | null {
  const el = document_.getElementById(id)
  return el ? (el as unknown as Knoten) : null
}

/** Die Marke der Kopfzeile — `.wm` unterhalb von `#hud`. */
function marke(): Knoten | undefined {
  const hud = alsKnoten('hud')
  return hud ? alle(hud).find((k) => k.className.split(/\s+/).includes('wm')) : undefined
}

/** Ist diese Ansicht zu sehen? */
function sichtbar(id: string): boolean {
  const el = alsKnoten(id)
  return el !== null && !el.classList.contains('hidden')
}

/**
 * Der **Knoten** eines Insel-Eintrags — die Insel wird dafuer aufgeklappt.
 *
 * @param aktion - `data-action` des Eintrags (`chat`, `os`, `reset`, …)
 * @returns der Knopf oder `undefined`
 */
function inselEintrag(aktion: string): Knoten | undefined {
  alsKnoten('islMini')?.listeners.get('click')?.({})
  const isl = alsKnoten('isl')
  return isl ? alle(isl).find((k) => k.tagName === 'BUTTON' && k.dataset['action'] === aktion) : undefined
}

/**
 * Die **Beschriftung** eines Insel-Eintrags — der Text im Feld `.il`.
 *
 * Sie ist der Grund, warum es diese Pruefung gibt: der Eintrag muss **sagen**, wohin er fuehrt.
 * „Chat" fuer den Harness-Chat war genau die Verwechslung, die der Betreiber gemeldet hat.
 *
 * **Warum vorher geschlossen wird.** Eine **offene** Insel wird von `openIsland` nicht erneut
 * gebaut (`if (islandOpen) return`) — und dann laese man die Beschriftung von **vorhin**. Der erste
 * Anlauf dieses Tests ist genau darueber gestolpert: er meldete „Chat", obwohl der Aufbau mit
 * Adresse „Prometheus-Chat" ergeben haette. Geschlossen wird ueber den **✕-Knopf der Insel**, also
 * ueber ihren eigenen Zuhoerer — kein Eingriff in den Zustand von aussen.
 */
function beschriftungDesEintrags(aktion: string): string {
  const isl = alsKnoten('isl')
  const schliessen = isl
    ? alle(isl).find((k) => k.tagName === 'BUTTON' && k.className.split(/\s+/).includes('x'))
    : undefined
  schliessen?.listeners.get('click')?.({ stopPropagation: () => undefined })

  const knopf = inselEintrag(aktion)
  const il = knopf?.children.find((kind) => kind.className.split(/\s+/).includes('il'))
  return il?.vollerText.trim() ?? ''
}

/**
 * Der **zweite Weg** in die Welt: die Insel.
 *
 * Er wird hier nicht ausgeschmueckt, sondern **mitbenutzt**: wer pruefen will, dass die Tastatur der
 * Marke etwas bewirkt, braucht vorher die Gegenrichtung. Und dabei faellt gleich mit ab, dass der
 * Insel-Eintrag noch geht.
 */
function ueberDieInsel(aktion: string): void {
  alsKnoten('islMini')?.listeners.get('click')?.({})
  const isl = alsKnoten('isl')
  const knopf = isl
    ? alle(isl).find((k) => k.tagName === 'BUTTON' && k.dataset['action'] === aktion)
    : undefined
  expect(knopf, `die Insel hat keinen Eintrag „${aktion}"`).toBeDefined()
  knopf?.listeners.get('click')?.({ stopPropagation: () => undefined })
}

/** Ein Tastendruck, wie ihn ein Browser liefert — mehr braucht der Zuhoerer nicht. */
function taste(key: string): { key: string; preventDefault: () => void; verhindert: boolean } {
  const ereignis = {
    key,
    verhindert: false,
    preventDefault: () => {
      ereignis.verhindert = true
    },
  }
  return ereignis
}

test('die Marke ist ein Bedienelement mit Rolle, Fokusweg und Beschriftung', async () => {
  const { gestartet, fehler } = await bootOnce()
  expect(gestartet, `der Start ist nicht durchgelaufen: ${fehler}`).toBe(true)

  const m = marke()
  expect(m, 'die Marke (.wm) fehlt in der Kopfzeile').toBeDefined()
  if (!m) return

  // **Der Text bleibt der Text.** Der Umschalter ist die Marke — nicht ein Etikett daneben.
  expect(m.vollerText).toContain('PROMETHEUS')
  // Ohne Rolle und Fokusweg ist ein `<span>` im Browser nicht bedienbar: kein Tabstop, keine
  // Enter-Taste. Das war der Befund „Barrierefreiheit" in `docs/design/ui-keep-cut.md`.
  expect(m.attributes.get('role')).toBe('button')
  expect(m.attributes.get('tabindex')).toBe('0')
  // Die Beschriftung sagt, **was ein Klick tut** — „PROMETHEUS" allein sagt das nicht.
  expect(m.attributes.get('aria-label')).toBe('Zum Chat wechseln')
  expect(m.attributes.get('title')).toBe('Zum Chat wechseln')
  expect(m.listeners.has('click')).toBe(true)
  expect(m.listeners.has('keydown')).toBe(true)
})

test('ein Klick auf die Marke wechselt in den Chat', async () => {
  await bootOnce()
  /*
   * **Das Geruest unmittelbar vor dem Griff in die Huelle.**
   *
   * Bun faehrt die Testdateien in einem Prozesz und ineinander; jede bringt eigene globale Namen mit
   * (`settings-modal.test.ts` setzt ein eigenes `document`), und die Huelle liest `document` zur
   * Laufzeit. Zwischen `await bootOnce()` und dieser Zeile kann eine andere Datei ihre Namen gesetzt
   * haben — nach dem `await` gibt es keine Luecke mehr, weil die Zuhoerer synchron laufen.
   */
  aktiviereGeruest()

  // **Vorbedingung: die Welt steht da.** Ohne diese Zeile koennte der Test gruen sein, weil schon
  // vorher nichts zu sehen war — und genau das waere kein Nachweis.
  expect(sichtbar('screen-os'), 'die Welt ist beim Start nicht zu sehen').toBe(true)
  expect(sichtbar('screen-chat'), 'der Chat ist beim Start schon zu sehen').toBe(false)

  marke()?.listeners.get('click')?.({})

  expect(sichtbar('screen-chat'), 'der Klick hat den Chat nicht gezeigt').toBe(true)
  expect(sichtbar('screen-os'), 'der Klick hat die Welt nicht verdeckt').toBe(false)
})

test('die Tastatur tut dasselbe — Enter und Leertaste, wie bei jedem Knopf', async () => {
  await bootOnce()
  aktiviereGeruest()
  for (const key of ['Enter', ' ']) {
    // Ausgangslage: die Welt. Ueber die Insel, damit die Taste wirklich etwas zu tun hat — eine
    // Taste, die einen Zustand setzt, der schon gilt, beweist nichts.
    if (!sichtbar('screen-os')) ueberDieInsel('os')
    expect(sichtbar('screen-os'), `die Welt war vor „${key}" nicht zu sehen`).toBe(true)

    const ereignis = taste(key)
    marke()?.listeners.get('keydown')?.(ereignis)

    expect(sichtbar('screen-chat'), `„${key}" hat nicht in den Chat gewechselt`).toBe(true)
    // **Die Leertaste muss gebremst werden.** Ohne `preventDefault` scrollt der Browser die Seite —
    // ein Wechsel, bei dem die Ansicht wegspringt, sieht aus wie ein Fehler.
    expect(ereignis.verhindert, `„${key}" hat die Standardhandlung nicht gebremst`).toBe(true)
  }
})

test('eine andere Taste wechselt nicht', async () => {
  await bootOnce()
  aktiviereGeruest()
  if (!sichtbar('screen-os')) ueberDieInsel('os')
  const ereignis = taste('a')
  marke()?.listeners.get('keydown')?.(ereignis)
  expect(ereignis.verhindert, 'ein beliebiger Tastendruck wurde gebremst').toBe(false)
  expect(sichtbar('screen-os'), 'ein „a" hat die Ansicht gewechselt').toBe(true)
})

test('der Insel-Eintrag „Chat" bleibt der zweite Weg', async () => {
  await bootOnce()
  aktiviereGeruest()
  if (!sichtbar('screen-os')) ueberDieInsel('os')
  ueberDieInsel('chat')
  expect(sichtbar('screen-chat'), 'der Insel-Eintrag Chat wechselt nicht mehr').toBe(true)
})

test('mit Herkunft fuehrt die Marke DORTHIN in den Chat — und laesst die Welt stehen', async () => {
  await bootOnce()
  aktiviereGeruest()
  if (!sichtbar('screen-os')) ueberDieInsel('os')
  // **Die Welt laeuft auf einem Server** — also gibt es einen Chat an der Wurzel derselben Herkunft.
  setzeHerkunft(HARNESS)
  navigation.leeren()

  marke()?.listeners.get('click')?.({})

  // **Genau eine Navigation, und zwar dorthin.** Das ist der Weg zurueck in den echten
  // Prometheus-Chat — nicht in den Platzhalter dieses Prototyps.
  expect(navigation.ziele).toEqual([HARNESS])
  // **Und die Ansicht wechselt NICHT.** Genau das war der gemeldete Fehler: die Marke blendete
  // zusaetzlich auf den Platzhalter um, statt die Welt zu verlassen.
  expect(sichtbar('screen-os'), 'die Welt wurde verlassen, obwohl nur navigiert werden sollte').toBe(true)
  expect(sichtbar('screen-chat'), 'die Marke hat den Platzhalter gezeigt').toBe(false)
  /*
   * **Zurueckstellen, damit die Reihenfolge der Pruefungen gleichgueltig bleibt.**
   *
   * Die Herkunft gehoert dem **Lauf**, nicht dem einzelnen Test (alle Testdateien teilen sich dieses
   * Modul, gemessen) — und `aktiviereGeruest` am Anfang einer jeden Pruefung setzt sie ohnehin
   * zurueck. Diese Zeile steht hier, damit das auch dann gilt, wenn jemand die Reihenfolge aendert
   * und die Zuruecksetzung am Anfang weglaesst. Solche Reihenfolge-Abhaengigkeiten sind in diesem
   * Projekt schon einmal teuer geworden (`docs/status/suite-flatterigkeit.md`).
   */
  setzeHerkunft('')
})

test('ohne Herkunft bleibt es beim Weg in die eigene Chat-Ansicht', async () => {
  await bootOnce()
  aktiviereGeruest()
  // Ohne Webserver (`file://` hat `origin === 'null'`) gibt es keinen Chat in Reichweite.
  setzeHerkunft('')
  if (!sichtbar('screen-os')) ueberDieInsel('os')
  navigation.leeren()

  marke()?.listeners.get('click')?.({})

  // Kein Ortswechsel — nur die Ansicht.
  expect(navigation.ziele).toEqual([])
  expect(sichtbar('screen-chat'), 'die Marke hat den Chat nicht gezeigt').toBe(true)
})

test('der Insel-Eintrag „Chat" fuehrt DORTHIN, wo die Marke hinfuehrt', async () => {
  await bootOnce()
  aktiviereGeruest()
  if (!sichtbar('screen-os')) ueberDieInsel('os')
  setzeHerkunft(HARNESS)
  navigation.leeren()

  // **Dieselbe Verknuepfung, andere Stelle.** Der Betreiber: „kannst du noch den neue
  // implementierungsverknuepfung auch hier machen" — Gruppe „Ansichten", Eintrag `▤ Chat`.
  ueberDieInsel('chat')

  expect(navigation.ziele, 'der Insel-Eintrag navigiert nicht in den Harness-Chat').toEqual([HARNESS])
  expect(sichtbar('screen-os'), 'der Insel-Eintrag hat auf den Platzhalter umgeblendet').toBe(true)

  // Und der Eintrag **sagt** es auch: „Prometheus-Chat" statt „Chat".
  const beschriftung = beschriftungDesEintrags('chat')
  expect(beschriftung).toBe('Prometheus-Chat')

  setzeHerkunft('')
})

test('ohne Herkunft wechselt der Insel-Eintrag „Chat" nur die Ansicht', async () => {
  await bootOnce()
  aktiviereGeruest()
  setzeHerkunft('')
  if (!sichtbar('screen-os')) ueberDieInsel('os')

  /*
   * **Die Beschriftung wird VOR dem Klick gelesen** — und das ist kein Kunstgriff, sondern die
   * Ordnung der Sache: der Eintrag `Chat` hat `onlyIn: 'os'`, er **verschwindet** also, sobald man
   * im Chat ist. Wer ihn danach sucht, findet nichts (genau das hat der erste Anlauf gemeldet).
   */
  expect(beschriftungDesEintrags('chat')).toBe('Chat')

  navigation.leeren()
  ueberDieInsel('chat')

  expect(navigation.ziele, 'ohne Adresse darf nicht navigiert werden').toEqual([])
  expect(sichtbar('screen-chat'), 'der Insel-Eintrag Chat wechselt nicht mehr').toBe(true)
})
