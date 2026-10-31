/**
 * Ein **winziges DOM** — nur so viel, dass `main.ts` laden kann.
 *
 * **Wozu das gut ist.** Der teuerste Fehler dieser Runde war kein Rechenfehler, sondern ein
 * `ReferenceError` beim Laden: `relabel()` griff auf `dock` zu, bevor `dock` deklariert war. Das
 * Modul starb, `requestAnimationFrame(loop)` wurde nie erreicht — und das Ergebnis war keine
 * Fehlermeldung, sondern ein **leeres Bild**. Der Betreiber hat es gesehen („komplett leer"), und
 * keine der 120 Pruefungen hat es gemerkt, weil keine die Huelle **lud**.
 *
 * **Was hier bewusst NICHT steht.** Kein WebGL, kein Layout, kein Styling, kein three.js. Der Stub
 * beantwortet genau die Fragen, die die Huelle beim Start stellt:
 *
 *   `getElementById`, `querySelector`, `createElement`, `createElementNS`, `classList`, `dataset`,
 *   `style`, `addEventListener`, `append`
 *
 * **Was er nicht kann, darf er nicht vortaeuschen.** Wo ein Wert gebraucht wird, den ein echtes DOM
 * berechnet (Groesse, Position), liefert er eine **Zahl** statt `undefined` — sonst faellt der Test
 * an einer Stelle um, die mit der Sache nichts zu tun hat. Und `requestAnimationFrame` **tut
 * nichts**: der Bildlauf braucht eine Grafikkarte, und hier wird nur der **Start** geprueft.
 */

/*
 * **Die Zeichen sind auch hier dieselben.** Das Gerüst baut die Marke der Kopfzeile mit
 * iconMarkup auf — mit **derselben** Funktion wie die Hülle. Eine Nachbildung, die ihr eigenes
 * Zeichen malt, wäre eine zweite Wahrheit (siehe egistriere()).
 */
import { iconMarkup } from '@prometheus-harness/icons'

class FakeClassList {
  private readonly namen = new Set<string>()
  add(...werte: string[]): void {
    for (const wert of werte) this.namen.add(wert)
  }
  remove(...werte: string[]): void {
    for (const wert of werte) this.namen.delete(wert)
  }
  toggle(wert: string, an?: boolean): boolean {
    const soll = an ?? !this.namen.has(wert)
    if (soll) this.namen.add(wert)
    else this.namen.delete(wert)
    return soll
  }
  contains(wert: string): boolean {
    return this.namen.has(wert)
  }
  get value(): string {
    return [...this.namen].join(' ')
  }
}

class FakeStyle {
  private readonly werte = new Map<string, string>()
  setProperty(name: string, value: string): void {
    this.werte.set(name, value)
  }
  getPropertyValue(name: string): string {
    return this.werte.get(name) ?? ''
  }
}

/** Ein Knoten, der alles kann, was die Huelle von ihm verlangt. */
class FakeElement {
  readonly tagName: string
  readonly children: FakeElement[] = []
  readonly style = new FakeStyle()
  readonly dataset: Record<string, string> = {}
  readonly attributes = new Map<string, string>()

  /**
   * **`className` und `classList` sind EINE Sache** — wie im Browser.
   *
   * **Der Befund, der das erzwungen hat.** Hier standen zwei getrennte Felder: `className = ''` und
   * `classList = new FakeClassList()`. Wer `element.className = 'full'` setzte (das tut die Huelle
   * ueberall), aenderte damit **nicht** die `classList` — und `querySelector('.full')` fand nichts.
   * Zwei Folgen, beide gemessen:
   *
   *   1. Ein Test scheiterte an einer Suche nach `.wm`, obwohl das Element im Baum stand.
   *   2. **Schlimmer:** die Aufraeum-Logik der Insel (`isl.querySelector('.full')?.remove()` vor dem
   *      Neuaufbau) lief im Test **ins Leere** — nach zwoelf Aufbauten lagen zwoelf Staende im Baum,
   *      und eine Pruefung las die Beschriftung von vorhin. Im Browser raeumt dieselbe Zeile auf.
   *      *Ein Stub, der zwei Wahrheiten ueber dieselbe Sache fuehrt, verdeckt genau die Logik, die
   *      man pruefen will.*
   */
  private klassen = new FakeClassList()

  get classList(): FakeClassList {
    return this.klassen
  }

  get className(): string {
    return this.klassen.value
  }

  set className(wert: string) {
    this.klassen = new FakeClassList()
    for (const name of wert.split(/\s+/)) {
      if (name !== '') this.klassen.add(name)
    }
    this.attributes.set('class', wert)
  }

  id = ''
  textContent = ''
  value = ''
  type = ''
  placeholder = ''
  checked = false
  isConnected = true
  /**
   * **Der Elternteil** — gebraucht fuer `remove()`.
   *
   * Ohne ihn kann ein Knoten sich nicht austragen; im echten DOM weiss er, wo er haengt.
   */
  eltern: FakeElement | null = null
  scrollTop = 0
  scrollHeight = 0
  offsetWidth = 300
  offsetHeight = 200

  /**
   * **Eigenschaften, die im echten DOM auch ein Attribut sind.**
   *
   * `element.title = 'x'` setzt im Browser **auch** das `title`-Attribut; `element.value` ebenso.
   * Der Stub tat das nicht, und ein Test, der `attributes.get('title')` prüft, fand nichts — ein
   * Fehlalarm, der genauso irreführt wie ein falsches Grün. Deshalb werden diese vier Namen
   * mitgeschrieben.
   */
  private titel = ''

  get title(): string {
    return this.titel
  }

  set title(wert: string) {
    this.titel = wert
    this.attributes.set('title', wert)
  }

  /** Die Zuhoerer — sie werden **nicht** ausgeloest, aber ihr Vorhandensein wird geprueft. */
  readonly listeners = new Map<string, (event: unknown) => void>()

  private eigenerText = ''

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
  }

  /**
   * **`innerHTML` wird wirklich ausgewertet, nicht nur gespeichert.**
   *
   * **Warum das noetig war.** Der Stub merkte sich die Zeichenkette und tat sonst nichts. Damit hatte
   * ein Element, dessen Inhalt per `innerHTML` gesetzt wird, **keine Kinder** — und
   * `querySelector('input')` fand nichts. Ein Test, der auf dieser Grundlage „Eingabefeld fehlt"
   * meldet, hat nicht den Code geprueft, sondern den Stub: ein Fehlalarm, der genauso irrefuehrend
   * ist wie ein falsches Gruen.
   *
   * Der Parser ist absichtlich **klein**: oeffnende und schliessende Marken, Attribute mit und ohne
   * Wert, Selbstschliesser, Text dazwischen. Das ist genau die Form, die der Code schreibt — kein
   * Kommentar, kein CDATA, kein Namensraum.
   */
  set innerHTML(markup: string) {
    this.children.length = 0
    this.eigenerText = ''
    const wurzel: FakeElement = this
    const stapel: FakeElement[] = [wurzel]
    const teile = /\{\{[^}]*\}\}|<[^>]+>|[^<]+/g
    for (const stueck of markup.matchAll(teile)) {
      const text = stueck[0]
      const oben = stapel[stapel.length - 1]
      if (!oben) continue
      if (text.startsWith('</')) {
        if (stapel.length > 1) stapel.pop()
        continue
      }
      if (text.startsWith('<')) {
        if (text.startsWith('<!')) continue
        const selbstschliesser = text.endsWith('/>')
        const inhalt = text.slice(1, selbstschliesser ? -2 : -1)
        const name = inhalt.split(/[\s/]/)[0] ?? 'div'
        const kind = new FakeElement(name)
        for (const treffer of inhalt.matchAll(/([A-Za-z-]+)(?:="([^"]*)")?/g)) {
          const attribut = treffer[1]
          const wert = treffer[2] ?? ''
          if (!attribut || attribut === name) continue
          if (attribut === 'class') kind.className = wert
          else if (attribut === 'id') kind.id = wert
          else if (attribut === 'type') kind.type = wert
          else if (attribut === 'value') kind.value = wert
          else if (attribut === 'placeholder') kind.placeholder = wert
          kind.attributes.set(attribut, wert)
        }
        oben.children.push(kind)
        if (!selbstschliesser && !['input', 'br', 'hr', 'img', 'meta', 'link'].includes(name.toLowerCase())) {
          stapel.push(kind)
        }
        continue
      }
      // Text. Ein `{{…}}`-Rest aus einem Template-Literal wird **sichtbar** gemacht, damit ein
      // vergessener Platzhalter nicht als leerer Text durchgeht.
      oben.eigenerText += text
    }
    this.eigenerText = this.eigenerText.replace(/\{\{[^}]*\}\}/g, '(platzhalter)')
  }

  get innerHTML(): string {
    return this.eigenerText
  }

  /** Der Text dieses Knotens **und** aller Kinder — wie `textContent` im echten DOM. */
  get vollerText(): string {
    return `${this.eigenerText} ${this.textContent} ${this.children.map((kind) => kind.vollerText).join(' ')}`
      .replace(/\s+/g, ' ')
      .trim()
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
    if (name === 'id') this.id = value
    if (name === 'class') this.className = value
    if (name === 'value') this.value = value
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }
  appendChild<T extends FakeElement>(kind: T): T {
    this.children.push(kind)
    kind.eltern = this
    return kind
  }
  append(...kinder: FakeElement[]): void {
    for (const kind of kinder) {
      this.children.push(kind)
      kind.eltern = this
    }
  }
  replaceChildren(...kinder: FakeElement[]): void {
    for (const alt of this.children) alt.eltern = null
    this.children.length = 0
    this.eigenerText = ''
    for (const kind of kinder) {
      this.children.push(kind)
      kind.eltern = this
    }
  }
  /**
   * **Nimmt den Knoten wirklich aus dem Baum** — wie das echte DOM.
   *
   * **Der Befund, der das erzwungen hat.** Hier stand nur `this.isConnected = false`; der Knoten
   * blieb in `children` seines Elternteils stehen. Das ist keine Kleinigkeit, sondern eine
   * Attrappe, die **Logik verdeckt**: die Insel baut sich bei jedem Oeffnen und bei jedem
   * Ansichtswechsel neu (`isl.querySelector('.full')?.remove()` und danach anhaengen). Mit dem
   * alten Stub **blieben alle alten Staende im Baum**, und eine Suche fand den **ersten** —
   * also den veralteten. Genau das passierte: eine Pruefung las die Beschriftung von vorhin und
   * meldete „Chat" statt „Prometheus-Chat", obwohl der Aufbau das Richtige gebaut hatte.
   *
   * Ein Stub, der Abgeloestes stehen laesst, prueft das Aufraeumen nicht — und Aufraeumen ist die
   * Haelfte jeder Neuaufbau-Logik.
   */
  remove(): void {
    this.isConnected = false
    const eltern = this.eltern
    if (eltern === null) return
    const stelle = eltern.children.indexOf(this)
    if (stelle >= 0) eltern.children.splice(stelle, 1)
    this.eltern = null
  }
  addEventListener(type: string, fn: (event: unknown) => void): void {
    this.listeners.set(type, fn)
  }
  removeEventListener(type: string): void {
    this.listeners.delete(type)
  }
  querySelector(selector: string): FakeElement | null {
    return finde(this, selector)
  }
  querySelectorAll(selector: string): FakeElement[] {
    const treffer: FakeElement[] = []
    suche(this, selector, treffer)
    return treffer
  }
  /** Ein echtes DOM rechnet hier Layout. Der Stub liefert eine Zahl — siehe Kopfkommentar. */
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 1280, height: 720 }
  }
  getContext(): null {
    return null
  }
  setPointerCapture(): void {}
  releasePointerCapture(): void {}
  focus(): void {}
  closest(): null {
    return null
  }
  /** Die Kinder als Text — fuer Zusicherungen wie „die Ueberschrift ist da". */
  get textInhalt(): string {
    return this.vollerText
  }
}

/**
 * Sehr einfache Auswahl — **genug fuer die Formen, die der Code benutzt**:
 *
 *   `#id`, `.klasse`, `tag`, `tag.klasse`, `tag[attribut]`
 *
 * **Was bewusst fehlt:** Nachfahrenketten (`.a .b`), Kindselektoren (`>`), Pseudoklassen (`:hover`)
 * und Attributvergleiche (`[x="y"]`). Wer davon eines braucht, findet hier nichts — und das ist
 * besser, als eine halbe Auswahl zu haben, die manchmal trifft.
 */
function passt(element: FakeElement, selector: string): boolean {
  let rest = selector.trim()
  const attribut = rest.match(/\[([A-Za-z-]+)\]/)
  if (attribut) {
    if (!element.attributes.has(attribut[1] ?? '')) return false
    rest = rest.replace(attribut[0], '')
  }
  if (rest.startsWith('#')) return element.id === rest.slice(1)
  if (rest.startsWith('.')) return element.classList.contains(rest.slice(1))
  const [tag, klasse] = rest.split('.')
  if (tag && element.tagName !== tag.toUpperCase()) return false
  if (klasse && !element.classList.contains(klasse)) return false
  return true
}

function finde(wurzel: FakeElement, selector: string): FakeElement | null {
  for (const kind of wurzel.children) {
    if (passt(kind, selector)) return kind
    const tiefer = finde(kind, selector)
    if (tiefer) return tiefer
  }
  return null
}

function suche(wurzel: FakeElement, selector: string, out: FakeElement[]): void {
  for (const kind of wurzel.children) {
    if (passt(kind, selector)) out.push(kind)
    suche(kind, selector, out)
  }
}

/**
 * Das Dokument.
 *
 * **`#root` gibt es wirklich** — und die Huelle schreibt ihr Geruest als `innerHTML` hinein. Ein
 * Stub, der HTML nicht versteht, haette danach **keine** Kinder, und `must('#world')` wuerde werfen.
 * Deshalb werden die IDs und Klassen aus dem Markup **ausgelesen**: genau die Elemente, die die
 * Huelle danach sucht.
 */
class FakeDocument {
  readonly body = new FakeElement('body')
  readonly documentElement = new FakeElement('html')
  private readonly nachId = new Map<string, FakeElement>()

  constructor() {
    this.registriere('root', new FakeElement('div'))
  }

  registriere(id: string, element: FakeElement): FakeElement {
    element.id = id
    this.nachId.set(id, element)
    return element
  }

  getElementById(id: string): FakeElement | null {
    return this.nachId.get(id) ?? null
  }

  querySelector(selector: string): FakeElement | null {
    if (selector.startsWith('#')) return this.nachId.get(selector.slice(1)) ?? null
    return null
  }

  querySelectorAll(): FakeElement[] {
    return []
  }

  createElement(tag: string): FakeElement {
    return new FakeElement(tag)
  }

  createElementNS(_ns: string, tag: string): FakeElement {
    return new FakeElement(tag)
  }

  createTextNode(text: string): FakeElement {
    const knoten = new FakeElement('#text')
    knoten.textContent = text
    return knoten
  }

  /**
   * Die Zuhoerer am **Dokument**.
   *
   * **Warum sie festgehalten werden.** Escape-Zuhoerer und Klicks ausserhalb haengen am Dokument,
   * nicht an einem Element. Der Stub tat sie mit einem leeren `addEventListener` ab — und ein Test,
   * der prueft, ob Escape schliesst, fand nichts und meldete „kein Zuhoerer". Das war ein Fehlalarm
   * ueber den Stub, kein Befund ueber den Code.
   */
  readonly listeners = new Map<string, (event: unknown) => void>()

  addEventListener(type: string, fn: (event: unknown) => void): void {
    this.listeners.set(type, fn)
  }
  removeEventListener(type: string): void {
    this.listeners.delete(type)
  }
}

/** Baut das Geruest der Huelle nach: dieselben IDs, die `main.ts` als `innerHTML` schreibt. */
function geruest(): FakeDocument {
  const doc = new FakeDocument()
  const root = doc.getElementById('root')
  if (!root) throw new Error('Stub ohne #root')
  // Die IDs aus dem Geruest von `main.ts`. Sie werden **hier** wiederholt, damit der Test sagt,
  // welche fehlen — statt an `must()` zu sterben und den Grund zu verschweigen.
  for (const id of [
    'screen-chat',
    'screen-os',
    'screen-web',
    'world',
    'labels',
    'axes',
    'isl',
    'islMini',
    'islWeb',
    'miniTxt',
    'hud',
    'hudLine',
    'dockhost',
    'settingsOverlay',
    'mobileNote',
    'mobileText',
    'mobileSwitch',
    /*
     * **Die Kernfläche und ihre Felder.**
     *
     * `#core` kam dazu, als die Ansichts-Leiste eingebaut wurde (`view-controls.ts` hängt sich dort
     * ein). Der Stub hat sie **nicht**, und der Start starb an `must('#core')` — der Test hat es
     * gemeldet, statt still zu bleiben. Genau dafür steht diese Liste hier.
     */
    'core',
    'hudLevel',
    'hudEcht',
    'hudDist',
    'hudFps',
    /*
     * **Die Himmelsschicht.**
     *
     * Sie kam am 15.10.2026 dazu, als der Sternenhimmel von einem Hintergrundbild zu einer eigenen
     * Lage wurde (`sky.ts`): `main.ts` füllt sie beim Start (`must('#himmel')`) und schiebt sie danach
     * je Bild. Ohne diese Zeile starb **jeder** Test am Start — mit „Element #himmel fehlt", und das
     * ist genau die Meldung, die man dafür haben will.
     */
    'himmel',
  ]) {
    doc.registriere(id, new FakeElement('div'))
  }
  // `innerHTML` wird nicht ausgewertet: der Stub kennt die IDs direkt. Das ist die eine Stelle, an
  // der er sich vom echten DOM unterscheidet — und sie ist harmlos, weil die Huelle danach nur noch
  // ueber `must('#…')` sucht.
  root.innerHTML = '(Geruest — siehe registriere())'

  /*
   * **Die Marke der Kopfzeile — und warum sie hier stehen MUSS.**
   *
   * Seit dem 14.10.2026 ist `◆ PROMETHEUS` oben links ein Bedienelement; die Huelle sucht es mit
   * `must('.wm', hud)`. Ein Geruest aus lauter leeren `div`s hat **kein** Kind mit dieser Klasse —
   * `must` wirft, und der Start stirbt mit „Element .wm fehlt". Genau dieselbe Ursache wie bei
   * `#core` (siehe die Liste oben): der Stub wiederholt, was das Markup der Huelle anlegt, sonst
   * prueft der Test den Stub statt den Code.
   *
   * Der Text steht mit dabei, damit ein Test belegen kann, **dass** der Umschalter die Marke ist und
   * nicht irgendein Span daneben.
   */
  const marke = new FakeElement('span')
  /*
   * **Beides setzen — `className` UND `classList`.**
   *
   * Der Stub fuehrt die Klasse zweimal: `className` ist die Zeichenkette, die die Tests lesen
   * (`chat-dom.test.ts`), `classList` ist die Menge, in der `querySelector('.…')` sucht. Wer nur
   * eines setzt, hat ein Element, das je nach Zugriffsweg existiert oder nicht — und genau das ist
   * beim ersten Anlauf passiert: die Marke stand im Baum, und `must('.wm', hud)` fand sie nicht.
   */
  marke.className = 'wm'
  marke.classList.add('wm')
  /*
   * **Die Marke trägt jetzt ein ZEICHEN, keinen Buchstaben.**
   *
   * Hier stand `marke.textContent = '◆ PROMETHEUS'` — das Gerüst war damit **nicht** dasselbe wie das
   * Markup der Hülle, und ein Test über die Marke hätte etwas anderes geprüft als den Betrieb. Seit
   * dem 15.10.2026 steht in `main.ts` die Flamme aus `@prometheus-harness/icons`; das Gerüst baut sie
   * mit **derselben** Funktion auf — so bleibt es eine Nachbildung und wird keine zweite Wahrheit.
   */
  marke.innerHTML = `${iconMarkup('prometheus', 'marke')}PROMETHEUS`
  doc.getElementById('hud')?.appendChild(marke)

  return doc
}

/**
 * **Die angesteuerten Adressen** — die Huelle verlaesst sich mit `location.assign`.
 *
 * Ohne diesen Mitschreiber liesse sich der Weg **aus** der Welt heraus nicht pruefen: „die Marke
 * fuehrt in den Harness-Chat" ist eine Aussage ueber eine Navigation, nicht ueber ein Attribut.
 *
 * **Warum das stehen darf, obwohl sich alle Testdateien dieses Modul teilen** (gemessen: die Kennung
 * des Moduls ist in jeder Datei dieselbe, es gibt also **einen** Import von `main.ts`): gelesen wird
 * diese Liste **unmittelbar nach** dem Klick, den dieselbe Datei ausgeloest hat. Wer sie leert und
 * dann klickt, sieht seine eigene Navigation.
 */
const ziele: string[] = []
export const navigation = {
  /** Wohin navigiert wurde, in der Reihenfolge. */
  ziele,
  /** Leert die Liste — fuer den naechsten Fall. */
  leeren: (): void => {
    ziele.length = 0
  },
}

/**
 * Der Ort der Seite — **ein** Objekt fuer `window.location` und `location`, wie im Browser.
 *
 * **`search` ist veraenderbar, und das ist Absicht.** Die Huelle liest den Raum aus der Adresse
 * (`?room=`). Ein zweiter Start mit einer anderen Adresse waere hier **nicht** moeglich: das Modul
 * wird einmal geladen.
 *
 * **Und `origin` — es ist zuerst LEER, und auch das ist Absicht.** Die Marke oben links fuehrt nur
 * dann **in den Chat**, wenn es eine Herkunft gibt (`chatZiel()` → `chatUrl(location.origin)`, siehe
 * `entry.ts`). Eine leere Herkunft ist genau der Fall **ohne Webserver** (ein `file://`-Dokument hat
 * `origin === 'null'`): dann bleibt die Marke der Umschalter der Ansicht, und der Klick blendet auf
 * den Platzhalter um — dieser Fall ist der Vorgabefall der Testhuelle.
 *
 * Wer den **anderen** Fall pruefen will (die Welt laeuft auf einem Server, die Marke navigiert),
 * setzt `location.origin` — `switch.test.ts` tut das ueber `setzeHerkunft`. Frueher stand hier die
 * Herkunft als Zusatz in der Adresse (`?chat=…`); seit Chat und Welt auf **einem** Port liegen, ist
 * die Adresse des Chats die **eigene** Herkunft und damit keine Angabe von aussen mehr.
 */
function ort(search: string): Record<string, unknown> {
  return {
    search,
    origin: '',
    href: '',
    assign: (ziel: string): void => {
      ziele.push(ziel)
    },
  }
}

/** Das `window` der Huelle. */
function fenster(): Record<string, unknown> {
  return {
    location: ort('?room=test'),
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  }
}

/** Das Geruest selbst — die Huelle sucht ihre Elemente darin. */
export const document_ = geruest()

// ── Die globalen Namen, die die Huelle erwartet ─────────────────────────────────────────

/**
 * Setzt **alle** globalen Namen, die die Huelle beim Start und beim Bedienen erwartet.
 *
 * **Warum das eine Funktion ist und nicht ein Block beim Laden.** Bun faehrt die Testdateien in
 * **einem** Prozesz und **ineinander** — jede Datei bringt ihre eigenen globalen Namen mit, und wer
 * zuletzt kommt, gewinnt. `settings-modal.test.ts` setzt zum Beispiel ein eigenes `document`.
 *
 * **Der Befund, der es erzwungen hat.** Die Pruefung „ein Klick auf die Marke wechselt in den Chat"
 * lief **allein** gruen und im ganzen Lauf **rot**:
 *
 * ```
 * TypeError: within.querySelector is not a function
 *     at must (src/main.ts:2795)  ← within = globalThis.document
 *     at setMode (src/main.ts:1282)
 *     at wechsleAnsicht (src/view-switch.ts)
 * ```
 *
 * `main.ts` liest `document` **zur Laufzeit** (es hat keine eigene Referenz). Wer nach dem Start
 * noch in die Huelle hineingreift, muss deshalb **vorher** sein Geruest wieder aufstellen — sonst
 * greift er in ein fremdes Dokument. Das ist kein Fehler der Huelle, sondern die Folge geteilter
 * globaler Namen; die ehrliche Antwort ist, sie ausdruecklich zu setzen.
 */
export function aktiviereGeruest(): void {
  Object.defineProperty(globalThis, 'document', { value: document_, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    },
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: 'de-CH', languages: ['de-CH', 'de', 'en'] },
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'window', {
    value: fenster(),
    configurable: true,
    writable: true,
  })
  // **Und der Ort.** Die Huelle navigiert ueber `location.assign`; im Browser ist `location` dieselbe
  // Sache wie `window.location`, hier stehen deshalb beide auf **einem** Objekt mit dem Mitscheriber.
  Object.defineProperty(globalThis, 'location', {
    value: (globalThis as unknown as { window: { location: unknown } }).window.location,
    configurable: true,
    writable: true,
  })
  // **Der Bildlauf tut nichts.** Er braucht eine Grafikkarte; dieser Test prueft den **Start**, nicht
  // das Zeichnen. Ein Stub, der ihn ausfuehren wuerde, haette drei.js nötig — und damit eine
  // WebGL-Attrappe, die mehr vortaeuscht als prueft.
  Object.defineProperty(globalThis, 'requestAnimationFrame', { value: () => 0, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { value: () => {}, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'MutationObserver', { value: FakeMutationObserver, configurable: true, writable: true })
}

/*
 * **`MutationObserver` — ein fehlender Baustein, und er hat einen Test gerettet.**
 *
 * Die Anwendung benutzt ihn an zwei Stellen (`builtin-plugins.ts`, die Panels `health-check` und
 * `device-info`), um einen Zuhörer abzulösen, wenn das Panel aus dem Baum verschwindet. In Bun gibt es
 * ihn **nicht** — er ist Teil des DOM.
 *
 * **Warum das auffiel, und was es über die Tests sagt.** Sichtbar wurde es erst, als die Panels
 * `closed` starteten statt offen (`zone: 'closed'`): vorher legte der Start die Panels gar nicht an,
 * und der Fehler blieb verborgen. Der Test „die Hülle lädt ohne Absturz" hat ihn sofort gemeldet.
 * Ein Test, der den **Startweg** prüft, findet so etwas; einer, der nur Elemente zählt, nicht.
 *
 * Der Stub beobachtet **nichts** — er merkt sich die Rückrufe und ruft sie nie. Das ist ehrlich: ein
 * Stub, der Änderungen erfindet, würde Verhalten vortäuschen, das es in diesem Test nicht gibt.
 */
class FakeMutationObserver {
  private readonly rueckruf: () => void
  constructor(rueckruf: () => void) {
    this.rueckruf = rueckruf
  }
  observe(): void {}
  disconnect(): void {}
  takeRecords(): readonly unknown[] {
    return []
  }
  /** Nur damit der Rückruf „benutzt" ist — aufgerufen wird er nie. */
  _rueckruf(): void {
    this.rueckruf()
  }
}
Object.defineProperty(globalThis, 'MutationObserver', {
  value: FakeMutationObserver,
  configurable: true,
  writable: true,
})

/*
 * **Und jetzt aufstellen — am ENDE der Datei, nicht oben.**
 *
 * `aktiviereGeruest()` nennt `FakeMutationObserver`, und eine `class` ist erst ab ihrer Zeile
 * benutzbar (zeitliche Todeszone, wie bei `let`). Ein Aufruf weiter oben haette beim Import geworfen
 * — „Cannot access 'FakeMutationObserver' before initialization" — und damit jede Testdatei, die
 * dieses Geruest laedt. Die Reihenfolge ist hier also keine Geschmacksfrage.
 */
aktiviereGeruest()

