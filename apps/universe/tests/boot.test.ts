/**
 * **Laedt die Huelle wirklich** — der Test, der das leere Bild verhindert haette.
 *
 * **Was hier passiert.** `main.ts` wird gegen ein winziges DOM (`dom-stub.ts`) **importiert**. Damit
 * laeuft der ganze Startweg ab: Sprachpakete eintragen, Einstellungen anwenden, Panels bauen,
 * Docking aufbauen, Ereignisse anhaengen — also alles **ausser** dem Zeichnen.
 *
 * **Warum das noetig ist.** Der teuerste Fehler dieser Runde war ein `ReferenceError` beim Laden:
 * `relabel()` griff auf `dock` zu, bevor `dock` deklariert war. Das Modul starb, der Bildlauf wurde
 * nie gestartet, und das Ergebnis war ein **leeres Bild** — ohne Fehlermeldung im Bild. Die
 * uebrigen Pruefungen fanden ihn nicht, weil **keine** die Huelle lud; sie prueften die Bausteine.
 *
 * **Was dieser Test nicht kann.** Er zeichnet nichts. Ob die Welt *sichtbar* ist, prueft
 * `opening-view.test.ts` mit echter Projektionsrechnung — die beiden Tests ergaenzen sich: dieser
 * sagt „die Huelle startet", der andere „der Blick zeigt etwas".
 */
import { expect, test } from 'bun:test'
// **Der Start laeuft genau einmal** — siehe `boot-once.ts`. Zwei Tests, die `main.ts` zweimal
// importieren, messen beim zweiten Mal den Zustand des ersten.
import { bootOnce, document_ } from './boot-once'

test('die Huelle laedt ohne Absturz — der Startweg laeuft durch', async () => {
  // **Der Beweis, dass der Start durchgelaufen ist.** Nicht „es wurde kein Fehler geworfen",
  // sondern „die Huelle hat **diese Zeile** erreicht". Genau daran ist der erste Anlauf gescheitert:
  // Das Modul starb an einem `ReferenceError`, der Test hielt ihn fuer einen erwarteten
  // three.js-Fehler und meldete Gruen. Ein Test, der den Fehler nicht faengt, ist schlimmer als
  // keiner — er erzeugt Vertrauen.
  const { gestartet, fehler } = await bootOnce()
  expect(
    gestartet,
    `Der Startweg wurde nicht erreicht. Fehler: ${fehler || '(keiner)'}`,
  ).toBe(true)
})

test('die Sprachpakete sind eingetragen, bevor die Auswahl sie braucht', async () => {
  // Der zweite Fehler dieser Runde war **still**: die Startsprache wurde gesetzt, bevor die Pakete
  // da waren. `Locales.set('de')` gab `false` zurueck, niemand sah es hin, und am Ende stand
  // Englisch da — was wie gewollt aussah.
  const { Locales } = await import('../src/i18n')
  const { de } = await import('../src/locales/de')
  const { en } = await import('../src/locales/en')
  const locales = new Locales()
  expect(locales.set('de')).toBe(false)
  locales.register(en)
  locales.register(de)
  // Jetzt greift es — und **das** ist die Reihenfolge, die `registerLocalePlugins` einhaelt.
  expect(locales.set('de')).toBe(true)
  expect(locales.locale).toBe('de')
})

test('das Geruest der Huelle hat die Elemente, die sie sucht', () => {
  // Der Stub wiederholt die IDs aus dem `innerHTML` der Huelle. Fehlt eine, faellt es hier auf —
  // und nicht als `Element #… fehlt` mitten im Start.
  for (const id of ['world', 'labels', 'axes', 'isl', 'hud', 'dockhost', 'screen-chat']) {
    expect(document_.getElementById(id), `#${id} fehlt im Geruest`).not.toBeNull()
  }
})
