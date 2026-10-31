/**
 * Einstellungen — der Kern.
 *
 * **Der wichtigste Test ist der langweiligste:** ein Wert, der nicht da ist oder nicht passt, darf
 * die Ansicht nicht unbrauchbar machen. Eine Drehgeschwindigkeit von 0 waere eine Kamera, aus der
 * man nicht mehr herausfindet; ein Zoomfaktor von 0,9 waere kein Zoom, sondern eine Umkehrung. Genau
 * solche Werte entstehen, wenn ein Speicher beschädigt ist oder jemand von Hand hineinschreibt.
 */
import { beforeEach, expect, test } from 'bun:test'
import { Settings, degreesPerWidth, formatValue, notchesPerHalf, pixelsPerDegree } from '../src/settings'
import type { NumberField } from '../src/settings'

/** Ein Speicher, der nichts vergisst — und keiner, der etwas erfindet. */
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

function feld(over: Partial<NumberField> = {}): NumberField {
  return {
    kind: 'number',
    key: 'control.rotateSpeed',
    category: 'control',
    default: 0.00175,
    min: 0.0004,
    max: 0.008,
    step: 0.00005,
    unit: 'radPerPx',
    ...over,
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: speicher(), configurable: true })
})

test('ohne Beschreibung gibt es keine Einstellung — und `get` faellt auf die Vorgabe zurueck', () => {
  const s = new Settings('test')
  // **Kein Werfen.** Ein abgeschaltetes Plugin nimmt seine Beschreibung mit; die Oberflaeche muss
  // trotzdem starten.
  expect(s.getNumber('gibtsnicht', 42)).toBe(42)
  expect(s.has('gibtsnicht')).toBe(false)
})

test('eine Zahl ausserhalb der Grenzen wird auf die Grenze gezogen, nicht uebernommen', () => {
  const s = new Settings('test')
  s.describe(feld())
  s.set('control.rotateSpeed', 999)
  expect(s.getNumber('control.rotateSpeed', 0)).toBe(0.008)
  s.set('control.rotateSpeed', -5)
  expect(s.getNumber('control.rotateSpeed', 0)).toBe(0.0004)
})

test('ein Wert vom falschen Typ wird nicht umgewandelt, sondern verworfen', () => {
  const s = new Settings('test')
  s.describe(feld())
  // `"0.002"` ist eine Zeichenkette. Sie stillschweigend umzuwandeln waere bequem — und wuerde aus
  // `"abc"` ein `NaN` machen, das danach jede Rechnung vergiftet.
  s.set('control.rotateSpeed', '0.002')
  expect(s.getNumber('control.rotateSpeed', 0)).toBe(0.00175)
  s.set('control.rotateSpeed', true)
  expect(s.getNumber('control.rotateSpeed', 0)).toBe(0.00175)
})

test('eine unbekannte Kennung laesst sich nicht setzen — sie wird nicht erfunden', () => {
  const s = new Settings('test')
  expect(s.set('nix.da', 1)).toBe(false)
  expect(s.has('nix.da')).toBe(false)
})

test('eine geaenderte Grenze zieht einen gespeicherten Wert nach', () => {
  const s = new Settings('test')
  s.describe(feld())
  s.set('control.rotateSpeed', 0.008)
  // Jetzt wird die Grenze verschaerft — wie wenn ein Nutzer sie durch eine eigene Beschreibung
  // ersetzt. Der Wert darf nicht ausserhalb stehen bleiben.
  s.describe(feld({ max: 0.002 }))
  expect(s.getNumber('control.rotateSpeed', 0)).toBe(0.002)
})

test('zuruecksetzen stellt die Vorgabe her, und `changed` wird leer', () => {
  const s = new Settings('test')
  s.describe(feld())
  s.set('control.rotateSpeed', 0.004)
  expect(s.changed().length).toBe(1)
  s.reset('control.rotateSpeed')
  expect(s.getNumber('control.rotateSpeed', 0)).toBe(0.00175)
  expect(s.changed().length).toBe(0)
})

test('nur geaenderte Werte werden gespeichert — die Vorgabe ist kein Zustand', () => {
  const s = new Settings('test')
  s.describe(feld())
  s.set('control.rotateSpeed', 0.004)
  const neu = new Settings('test')
  neu.describe(feld())
  expect(neu.getNumber('control.rotateSpeed', 0)).toBe(0.004)
})

test('ein Zuhoerer wird bei jeder Aenderung gerufen, aber nicht bei derselben Aenderung zweimal', () => {
  const s = new Settings('test')
  s.describe(feld())
  const gerufen: string[] = []
  s.onChange((key) => gerufen.push(key))
  s.set('control.rotateSpeed', 0.004)
  s.set('control.rotateSpeed', 0.004)
  expect(gerufen).toEqual(['control.rotateSpeed'])
})

test('beschaedigter Speicher verhindert den Start nicht', () => {
  globalThis.localStorage.setItem('prometheus.test.settings.v1', '{kein json')
  const s = new Settings('test')
  s.describe(feld())
  expect(s.getNumber('control.rotateSpeed', 0)).toBe(0.00175)
})

// ── Anzeige ──────────────────────────────────────────────────────────────────────────────
//
// Diese Zahlen sind der Grund, warum es die Einstellung ueberhaupt gibt: der Betreiber hat sich
// beschwert, dass sich Drehen „zu fast" anfuehlt. „0,00175 rad/px" sagt das niemandem — „128° je
// Bildschirmbreite" schon. Deshalb wird die Umrechnung geprueft und nicht nur gemalt.
//
// **Und hier standen vorher zwei falsche Zahlen.** Der erste Anlauf nannte `0,00175 rad/px` „57 Pixel
// je Grad" und `0,0042` „24 Pixel je Grad". Der erste Korrekturversuch machte es nicht besser: erst
// „9,97 px/°", dann „32,7 px/°" — beide Male dieselbe Verwechslung von Grad und Radiant, einmal nach
// der einen, einmal nach der anderen Seite.
//
// Richtig ist **9,97 px/°** (alt: **4,15**). Der Test haelt jetzt die Zahl **und die Gegenprobe**
// fest: 10 Pixel Zug mal 0,00175 rad/px sind 0,0175 Radiant — also 1,0°. Damit ist die Umrechnung
// nachpruefbar und nicht bloss behauptet.

test('Pixel je Grad: der alte Wert war 2,4-mal so schnell wie der neue', () => {
  expect(pixelsPerDegree(0.00175)).toBeCloseTo(9.97, 1)
  expect(pixelsPerDegree(0.0042)).toBeCloseTo(4.15, 1)
  // Das Verhaeltnis ist die Aussage, nicht der Absolutwert: der neue Wert ist traeger, also
  // feinfuehliger.
  expect(pixelsPerDegree(0.00175) / pixelsPerDegree(0.0042)).toBeCloseTo(2.4, 1)
})

test('die Gegenprobe: 10 Pixel Zug drehen um ein Grad', () => {
  // `px/° · rad/px · 180/π` ergibt die Grad fuer einen Zug von `px` Pixeln.
  const grad = 10 * 0.00175 * (180 / Math.PI)
  expect(grad).toBeCloseTo(1.0, 1)
  // Und die Umkehrung: die Pixel je Grad sind genau der Kehrwert davon.
  expect(pixelsPerDegree(0.00175)).toBeCloseTo(10 / grad, 1)
})

test('Grad je Bildschirmbreite: der neue Wert braucht zwei Zuege, der alte einen', () => {
  // Der neue Wert: ein Zug quer ueber 1280 px dreht um 128° — zwei Zuege, einmal herum.
  expect(degreesPerWidth(0.00175, 1280)).toBeCloseTo(128, 0)
  // Der alte: 308°, also schon nach einem Zug mehr als einmal herum — genau das war „zu fast".
  expect(degreesPerWidth(0.0042, 1280)).toBeCloseTo(308, 0)
})

test('Pixel je Grad ist unendlich, wenn die Drehung stillsteht — nicht NaN', () => {
  // Eine Division durch 0 ergaebe `Infinity`; ein `NaN` waere in der Anzeige unsichtbar und wuerde
  // beim naechsten Vergleich stillschweigend falsch sein.
  expect(pixelsPerDegree(0)).toBe(Number.POSITIVE_INFINITY)
  expect(Number.isNaN(pixelsPerDegree(0))).toBe(false)
  expect(pixelsPerDegree(Number.NaN)).toBe(Number.POSITIVE_INFINITY)
})

test('Schritte je Halbierung: 1,25 sind drei, 1,12 sind sechs', () => {
  expect(notchesPerHalf(1.25)).toBeCloseTo(3.1, 0)
  expect(notchesPerHalf(1.12)).toBeCloseTo(6.1, 0)
  // Ein Faktor von 1 oder weniger halbiert nie — dann gibt es keine Zahl von Schritten.
  expect(notchesPerHalf(1)).toBe(Number.POSITIVE_INFINITY)
  expect(notchesPerHalf(0.9)).toBe(Number.POSITIVE_INFINITY)
})

test('formatValue zeigt BEIDE Zahlen — wie es sich anfuehlt und wie genau man zielt', () => {
  expect(formatValue(feld(), 0.00175, 'de')).toBe('128° je Bildschirmbreite · 10.0 px/°')
  // Die englische Fassung derselben Zahl.
  expect(formatValue(feld(), 0.00175, 'en')).toContain('per screen width')
  // Und die Hauptanzeige der Steuerung: eine Zahl, die man ohne Nachdenken liest.
  expect(
    formatValue(
      { kind: 'number', key: 'x', category: 'control', default: 0, min: 0, max: 1, step: 0.01, unit: 'anglePerWidth' },
      0.00175,
      'de',
    ),
  ).toBe('128° / Bildschirmbreite')
})

test('formatValue zeigt bei einem Schalter den Wert, nicht eine Einheit', () => {
  // Ein Schalter hat keine Einheit. Vorher haette der Aufruf hier `undefined` gelesen.
  expect(
    formatValue(
      { kind: 'boolean', key: 'x', category: 'control', default: true },
      true,
      'de',
    ),
  ).toBe('true')
})

/**
 * **Ein Feld kann seine ART wechseln — und der alte Wert darf nicht verlorengehen.**
 *
 * Der Anlaß: „Himmelskörper zeichnen" war ein **Schalter** (`boolean`). Am 15.10.2026 wurde daraus
 * eine **Auswahlliste** (`choice`: leer / nur Sterne / alles), weil der Betreiber die Sterne behalten
 * wollte. Ohne Übersetzung hätte `coerce` den gespeicherten Wert `true` verworfen — er ist kein
 * erlaubter Wert der Liste — und die Einstellung wäre **stillschweigend** auf die Vorgabe gefallen.
 * Der Nutzer hat sie gestern gesetzt und hält den Verlust für einen Fehler. Zu Recht.
 */
test('ein alter Schalterwert wird in die neue Auswahlliste übersetzt', () => {
  const alt = speicher()
  alt.setItem('prometheus.test.settings.v1', JSON.stringify({ 'universe.visuals': true, 'control.rotateSpeed': 0.002 }))
  Object.defineProperty(globalThis, 'localStorage', { value: alt, configurable: true })

  const s = new Settings('test')
  s.describe({
    kind: 'choice',
    key: 'universe.visuals',
    category: 'universe',
    default: 'none',
    options: () => [
      { value: 'none', label: 'Leer' },
      { value: 'stars', label: 'Nur Sternenhimmel' },
      { value: 'all', label: 'Körper und Sterne' },
    ],
    migrate: (wert) => (wert === true ? 'all' : wert === false ? 'none' : undefined),
  })
  // `true` war „Körper und Himmel" — dasselbe Bild wie vorher.
  expect(s.getString('universe.visuals', 'none')).toBe('all')
})

test('und `false` wird zu „leer" — die Vorgabe bleibt die Vorgabe', () => {
  const alt = speicher()
  alt.setItem('prometheus.test.settings.v1', JSON.stringify({ 'universe.visuals': false }))
  Object.defineProperty(globalThis, 'localStorage', { value: alt, configurable: true })

  const s = new Settings('test')
  s.describe({
    kind: 'choice',
    key: 'universe.visuals',
    category: 'universe',
    default: 'none',
    options: () => [
      { value: 'none', label: 'Leer' },
      { value: 'all', label: 'Körper und Sterne' },
    ],
    migrate: (wert) => (wert === true ? 'all' : wert === false ? 'none' : undefined),
  })
  expect(s.getString('universe.visuals', 'none')).toBe('none')
})

test('ohne Übersetzung gilt die Vorgabe — Unsinn wird nicht geraten', () => {
  const alt = speicher()
  alt.setItem('prometheus.test.settings.v1', JSON.stringify({ 'universe.visuals': 'galaxie' }))
  Object.defineProperty(globalThis, 'localStorage', { value: alt, configurable: true })

  const s = new Settings('test')
  s.describe({
    kind: 'choice',
    key: 'universe.visuals',
    category: 'universe',
    default: 'none',
    options: () => [
      { value: 'none', label: 'Leer' },
      { value: 'all', label: 'Körper und Sterne' },
    ],
  })
  expect(s.getString('universe.visuals', 'none')).toBe('none')
})

/**
 * **Die Sprachwahl meldet ihre Felder an — sonst ist sie ein Blindgänger.**
 *
 * ## Der Fehler, den diese Prüfung festhält (16.10.2026)
 *
 * `ui-language` **beschrieb** zwei Einstellungen und rief nie `describe`. Die Verwaltung kennt ein
 * Feld aber erst danach — und daraus folgte eine Kette, die im Quelltext nirgends stand:
 *
 *   * `Settings.set('language.locale', …)` gibt `false` zurück → der **Sprachbildschirm in der
 *     Insel tut nichts** (gemessen: Klick auf „English", die Oberfläche bleibt deutsch, `lang`
 *     bleibt `de`, im Browserspeicher entsteht kein Eintrag),
 *   * `Settings.get('language.locale', '')` beim Start liefert den Rückfall `''` → die Wahl ist
 *     **nicht gemerkt** (nach dem Neuladen entscheidet wieder der Browser),
 *   * der Abschnitt „Sprache" **fehlt** im Einstellungsbildschirm.
 *
 * **Warum `settings.has` die richtige Frage ist.** Nicht „gibt es das Feld im Plugin" — das stand
 * immer da und war die ganze Zeit wahr. Gefragt ist: **kennt die Verwaltung es.** Genau diese
 * Unterscheidung hat den Fehler bei `ui-controls` schon einmal aufgedeckt (dort steht dieselbe
 * Prüfung als Gesundheitsprüfung `ui-controls:eingetragen`).
 */
test('die Sprachwahl traegt ihre Felder in die Verwaltung ein', async () => {
  const { PluginRegistry } = await import('../src/plugins')
  const { Locales } = await import('../src/i18n')
  const { registerLocalePlugins } = await import('../src/locale-plugins')

  const settings = new Settings('sprachpruefung')
  const locales = new Locales()
  const registry = new PluginRegistry()
  registerLocalePlugins(
    registry,
    { locales, settings, onSwitch: () => {} },
    { hasSetup: () => true, markSetup: () => {} },
  )

  expect(settings.has('language.locale'), 'language.locale ist der Verwaltung unbekannt').toBe(true)
  expect(settings.has('language.chosen'), 'language.chosen ist der Verwaltung unbekannt').toBe(true)

  // **Und der Beweis, dass es wirkt:** auf ein unbekanntes Feld gibt `set` `false` zurück. Ein
  // `true` hier heißt „die Verwaltung kennt das Feld" — und damit, dass der Sprachbildschirm der
  // Insel die Sprache wirklich umstellt UND merkt.
  expect(settings.set('language.locale', 'de')).toBe(true)
  expect(settings.getString('language.locale', '')).toBe('de')
})
