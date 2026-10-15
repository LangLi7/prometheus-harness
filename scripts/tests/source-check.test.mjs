/**
 * Prüfungen für {@link module:scripts/source-check}.
 *
 * **Warum es diese Datei gibt.** Im Quelltext standen **zwei** Zeichen, die kein
 * Mensch sieht: an der Stelle des `f` in `flushEvery` stand ein **Seitenvorschub**
 * (Zeichen 12). Aus `flushEvery` wurde `lushEvery` — in einem Kommentar, den
 * jemand liest, um den Namen einer Vorgabe zu erfahren. Wer ihn abschreibt,
 * schreibt etwas, das es nicht gibt.
 *
 * **Wie der Fehler gefunden wurde.** Nicht durch Lesen — gelesen sieht die Zeile
 * richtig aus. Gefunden wurde er, weil beim Nachzählen einer Zahl in derselben
 * Datei ein Zeichen **code 12** im Umfeld auftauchte. Genau solche Fehler findet
 * nur ein Zähler.
 *
 * **Warum der Fehler überhaupt entstehen konnte.** Ein Werkzeug hat den Text
 * geschrieben und dabei `\f` als **Escape** gedeutet statt als zwei Zeichen. Das
 * Ergebnis ist gültiges UTF-8, gültiges Markdown und ein gültiger Kommentar — nur
 * mit einem Steuerzeichen darin. Deshalb ist er still.
 */
import { describe, expect, test } from 'bun:test'

import { findeSteuerzeichen, pruefeQuelltext } from '../source-check.mjs'

describe('findeSteuerzeichen', () => {
  test('findet Zeichen 12 und nennt Datei, Zeile und Umfeld', () => {
    const treffer = findeSteuerzeichen('probe.js', 'const a = 1\nconst b = "\fx"\n')
    expect(treffer).toHaveLength(1)
    expect(treffer[0]?.datei).toBe('probe.js')
    expect(treffer[0]?.zeile).toBe(2)
    expect(treffer[0]?.code).toBe(12)
  })

  test('Tabulator, Zeilenumbruch und Wagenrücklauf sind ERLAUBT', () => {
    // **Der Unterschied, auf den es ankommt.** Diese drei sind Steuerzeichen und
    // trotzdem in Ordnung — sie strukturieren den Text. Sie mitzuzählen machte
    // die Prüfung auf jeder Datei rot und damit wertlos.
    expect(findeSteuerzeichen('probe.js', 'a\tb\r\nc\n')).toEqual([])
  })

  test('findet jedes verbotene Steuerzeichen, nicht nur den Seitenvorschub', () => {
    const treffer = findeSteuerzeichen('probe.js', 'a\x00b\x07c\x1bd\x7f')
    expect(treffer.map((t) => t.code)).toEqual([0, 7, 27, 127])
  })

  test('findet auch das Nullbyte mitten in einer Zeile', () => {
    expect(findeSteuerzeichen('probe.js', 'kon\rstante\x00 = 1')[0]?.code).toBe(0)
  })
})

describe('pruefeQuelltext', () => {
  test('der eigene Quelltext ist frei von verbotenen Steuerzeichen', () => {
    // **Die Prüfung, die den Fehler künftig fängt.** Läuft über das ganze
    // Projekt, ohne `node_modules`, `target`, `.git`, `.pmh-build`, `docs/dsh`
    // und `website` — fremde Kopien und Bauergebnisse.
    const bericht = pruefeQuelltext()
    const beschreibung = bericht.treffer
      .map((t) => `${t.datei}:${String(t.zeile)} Code ${String(t.code)} (${t.umfeld})`)
      .join('\n')
    expect({ treffer: beschreibung, anzahl: bericht.treffer.length }).toEqual({
      treffer: '',
      anzahl: 0,
    })
  })

  test('der Bericht nennt, wie viele Dateien geprüft wurden', () => {
    // Eine Prüfung, die nichts geprüft hat und „sauber" meldet, ist schlimmer als
    // keine. Die Zahl macht sichtbar, daß wirklich gelesen wurde.
    const bericht = pruefeQuelltext()
    expect(bericht.gepruefteDateien).toBeGreaterThan(200)
  })
})
