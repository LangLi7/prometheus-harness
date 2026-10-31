/**
 * Sprache — der Kern, die Pakete und der Rueckfall.
 *
 * **Was hier geprueft wird und warum.** Der Betreiber hat die Form vorgegeben: „englisch standard und
 * deutsch unterstuetzen, diese sprache fuer den harness wird durch eine language package/plugin
 * implementiert, wie beim Visual studio code extension". Das sind **vier** Zusagen, und jede einzelne
 * laesst sich nachzaehlen:
 *
 *   1. Englisch ist der **Standard**.
 *   2. Deutsch **liegt bei**.
 *   3. Ein fehlender Satz faellt auf die Standardsprache zurueck — **nicht** auf ein leeres Feld.
 *   4. Ein fehlender Schluessel **auch dort** wird sichtbar (der Schluessel selbst), statt zu
 *      verschwinden.
 *
 * Dazu kommt die Vollstaendigkeit: Deutsch muss jeden Schluessel haben, den Englisch hat. Ohne diesen
 * Test waere „vollstaendig uebersetzt" eine Behauptung; mit ihm ist es eine Zahl.
 */
import { expect, test } from 'bun:test'
import { DEFAULT_LOCALE, Locales, detectLocale, interpolate } from '../src/i18n'
import { de } from '../src/locales/de'
import { en } from '../src/locales/en'

test('Englisch ist der Standard — auch ohne Eintragen eines Pakets', () => {
  const locales = new Locales()
  expect(locales.locale).toBe(DEFAULT_LOCALE)
  expect(DEFAULT_LOCALE).toBe('en')
})

test('eine unbekannte Sprache wird abgelehnt, statt still etwas anderes zu tun', () => {
  const locales = new Locales()
  locales.register(en)
  expect(locales.set('ja')).toBe(false)
  // **Wichtig:** die Sprache bleibt, wie sie war. Stillschweigend auf Englisch zu wechseln waere die
  // unangenehmste Form von Fehler — man merkt nicht, dass die Wahl nicht angekommen ist.
  expect(locales.locale).toBe('en')
})

test('ein fehlender Satz faellt auf die Standardsprache zurueck, nicht auf ein leeres Feld', () => {
  const locales = new Locales()
  locales.register(en)
  locales.register({
    id: 'xx',
    label: 'Testsprache',
    english: 'Test',
    // `panel.search` fehlt absichtlich: genau das passiert bei jeder neuen Sprache.
    messages: { 'panel.status': 'Zustand (xx)' },
  })
  locales.set('xx')
  expect(locales.lookup('panel.status')).toBe('Zustand (xx)')
  expect(locales.lookup('panel.search')).toBe(en.messages['panel.search'] ?? '')
})

test('ein Schluessel, den es nirgends gibt, kommt sichtbar zurueck', () => {
  const locales = new Locales()
  locales.register(en)
  // Nicht `undefined`, nicht `''` — der Schluessel. Wer ihn sieht, weiss sofort, welcher Satz fehlt.
  expect(locales.lookup('gibt.es.nicht')).toBe('gibt.es.nicht')
})

test('Platzhalter werden eingesetzt — {n} wird zur Zahl, nicht zum Text', () => {
  expect(interpolate('{n} Treffer', { n: 3 })).toBe('3 Treffer')
  expect(interpolate('{key} = {value}', { key: 'a', value: 0.5 })).toBe('a = 0.5')
  // Ein Platzhalter ohne Wert bleibt **stehen**: so sieht man, dass einer fehlt, statt ein Loch zu
  // bekommen.
  expect(interpolate('{n} Treffer', {})).toBe('{n} Treffer')
})

test('ein Paket abzuschalten nimmt seine Saetze mit — und faellt auf den Standard zurueck', () => {
  const locales = new Locales()
  locales.register(en)
  locales.register(de)
  locales.set('de')
  expect(locales.locale).toBe('de')
  locales.unregister('de')
  // Wer `disable locale-de` tippt, sieht **wirklich** Englisch — nicht nur den Eintrag verschwinden.
  expect(locales.locale).toBe('en')
  expect(locales.lookup('panel.search')).toBe(en.messages['panel.search'] ?? '')
})

test('Englisch laesst sich nicht wegnehmen, ohne dass der Rueckfall verschwindet', () => {
  const locales = new Locales()
  locales.register(en)
  locales.register(de)
  // Ein Paket, das man entfernen kann, ist ein Paket. Englisch ist der **Rueckfall** — wer ihn
  // entfernt, bekommt an allen Stellen Schluesselnamen. Deshalb prueft dieser Test nur, dass der
  // Rueckfall danach noch da ist, wenn man ihn wieder eintraegt.
  locales.unregister('en')
  expect(locales.has('en')).toBe(false)
  locales.register(en)
  expect(locales.has('en')).toBe(true)
  expect(locales.lookup('panel.search')).toBe(en.messages['panel.search'] ?? '')
})

test('der Standard steht in der Liste zuerst', () => {
  const locales = new Locales()
  locales.register(de)
  locales.register(en)
  expect(locales.list()[0]?.id).toBe('en')
})

test('die Zahl der fehlenden Schluessel ist nachgezaehlt, nicht behauptet', () => {
  const locales = new Locales()
  locales.register(en)
  locales.register({ id: 'xx', label: 'X', english: 'X', messages: {} })
  expect(locales.missing('xx').length).toBe(Object.keys(en.messages).length)
  expect(locales.missing('en').length).toBe(0)
  // Und ein Schluessel, den nur diese Sprache hat, ist meist ein Tippfehler.
  expect(locales.extra('en').length).toBe(0)
})

test('Deutsch ist vollstaendig — jeder englische Schluessel hat einen deutschen', () => {
  const locales = new Locales()
  locales.register(en)
  locales.register(de)
  const fehlend = locales.missing('de')
  // Die Ausgabe nennt die Schluessel: ein fehlender Test waere ein Zahlenvergleich ohne Namen, und
  // dann sucht man.
  expect(fehlend.join(', ')).toBe('')
  expect(locales.extra('de').join(', ')).toBe('')
})

test('kein Sprachpaket enthaelt einen leeren Satz', () => {
  for (const pack of [en, de]) {
    const leer = Object.entries(pack.messages)
      .filter(([, satz]) => satz.trim() === '')
      .map(([key]) => key)
    // Ein leerer Satz ist schlimmer als ein fehlender: er faellt nicht auf.
    expect(leer.join(', ')).toBe('')
  }
})

test('beide Pakete beschriften sich selbst in ihrer eigenen Sprache', () => {
  // So sucht man sich eine Sprache aus: „Deutsch" und „English" — nicht „German" neben „Deutsch".
  expect(de.label).toBe('Deutsch')
  expect(en.label).toBe('English')
  expect(de.english).toBe('German')
})

/**
 * Die Browsersprache — mit einem **gesetzten** `navigator`.
 *
 * **Warum hier gestellt und nicht gelesen.** `detectLocale` liest `navigator.languages`, und die
 * Umgebung des Tests ist selbst eine Sprache (das DOM-Geruest in `boot.test.ts` setzt `de-CH`).
 * Ein Test, der die Umgebung liest, prueft die Umgebung — und wechselt sein Ergebnis, je nachdem,
 * welche Datei zuerst geladen wurde. Deshalb wird `navigator` hier **gesetzt** und danach
 * zurueckgegeben.
 */
function mitSprachen(sprachen: readonly string[], fn: () => void): void {
  const vorher = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: sprachen[0] ?? 'en', languages: sprachen },
    configurable: true,
    writable: true,
  })
  try {
    fn()
  } finally {
    if (vorher) Object.defineProperty(globalThis, 'navigator', vorher)
  }
}

test('die Hauptkennung greift, wenn es die genaue Sprache nicht gibt', () => {
  // `de-CH` gibt es nicht als Paket — `de` schon. Genau so sucht man eine Sprache aus.
  mitSprachen(['de-CH', 'de', 'en'], () => {
    expect(detectLocale(['en', 'de'])).toBe('de')
  })
})

test('ohne passendes Paket bleibt der Standard stehen', () => {
  mitSprachen(['ja', 'ko'], () => {
    // **Der Standard, nicht die erste Sprache.** Wer Japanisch spricht und kein Paket hat, bekommt
    // Englisch — nicht irgendeines.
    expect(detectLocale(['en', 'de'], 'en')).toBe('en')
  })
})

test('die Umgebung wird nicht befragt, wenn es den Navigator nicht gibt', () => {
  const vorher = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true, writable: true })
  try {
    expect(detectLocale(['en', 'de'], 'de')).toBe('de')
  } finally {
    if (vorher) Object.defineProperty(globalThis, 'navigator', vorher)
  }
})
