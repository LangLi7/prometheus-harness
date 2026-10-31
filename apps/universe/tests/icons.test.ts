/**
 * **Die Oberfläche zeichnet ihre Zeichen — sie schreibt sie nicht.**
 *
 * ## Warum das geprüft wird
 *
 * Der Betreiber: *„emoji sieht schon scheisse aus und umprofessionell"*. Der erste Anlauf dieses
 * Umbaus hat **die Anzeige** umgestellt (aus `sigil: '#'` wurde `icon: 'place'`) — und genau **eine**
 * Stelle vergessen: die **Beschriftungen** trugen die Zeichen noch im Text
 * (`'island.group.objects': '⌥ objekte'`). Im Bild stand danach eine gezeichnete Kugel **und** ein
 * `⌥` daneben.
 *
 * Gefunden hat das nicht das Auge, sondern die Zählung im Browser: `document.querySelectorAll('*')`
 * nach Textknoten mit einem Zeichen aus der alten Menge. Diese Datei macht dieselbe Zählung **ohne**
 * Browser — am Quelltext, an den Sprachpaketen und an der Liste der Zeichen.
 *
 * ## Was hier NICHT geprüft wird
 *
 * Daß die Zeichen **im Bild** stehen (jedes `.ih`, `.x`, `.sigil` trägt ein `<svg>`) — das ist eine
 * Aussage über gerendertes DOM und steht in der Messung im Browser, nicht hier. Ein Test, der das
 * nachbauen wollte, prüfte den Stub.
 */
import { expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ICON_NAMES } from '@prometheus-harness/icons'
import { de } from '../src/locales/de'
import { en } from '../src/locales/en'

/**
 * **Die Zeichen, die hier einmal standen.**
 *
 * Es sind die der alten Oberfläche — und sie sind die **ganze** Liste: was nicht hier steht, war auch
 * vorher kein Zeichen. Ein neues Zeichen aufzunehmen heißt, es hier einzutragen; die Prüfung wird
 * dadurch nicht schwächer, sondern **genauer**.
 *
 * **`×` steht NICHT in der Liste — und das war ein Befund.** Der erste Anlauf hatte es aufgenommen,
 * weil es im CSS und in einem alten Knopf vorkam. Die Prüfung meldete daraufhin vier Stellen:
 * `` `${n}×${outer}` ``, `` `${window.innerWidth}×${window.innerHeight}` ``, „Die Matrix
 * (5×5 …)". Das ist ein **Malzeichen**, kein Zeichen der Oberfläche: es steht in einer Zahl, nicht
 * vor einer Beschriftung. Eine Liste, die Typografie und Bild nicht unterscheidet, zwingt den
 * nächsten, richtigen Text zu ändern — und wird deshalb zu Recht abgeschaltet.
 */
const ALTE_ZEICHEN = ['◆', '▤', '◉', '⟲', '⌥', '⚙', '✕', '❯', '▸', '▾', '↺']

const SRC = join(import.meta.dirname, '..', 'src')

/** Alle `.ts`-Dateien unter `src/`, auch in Unterordnern. */
function quelldateien(dir: string): readonly string[] {
  const raus: string[] = []
  for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
    const pfad = join(dir, eintrag.name)
    if (eintrag.isDirectory()) raus.push(...quelldateien(pfad))
    else if (eintrag.name.endsWith('.ts')) raus.push(pfad)
  }
  return raus
}

/**
 * **Nimmt die Erklärungen heraus** — und nur die.
 *
 * **Warum das nötig ist.** Die Geschichte dieses Umbaus **steht** in den Kommentaren: dort heisst es
 * „hier stand ein `◆`", und das ist keine Sünde, sondern die Begründung. Wer stumpf nach dem Zeichen
 * sucht, meldet die Dokumentation als Fehler und zwingt den nächsten, die Begründung zu löschen.
 *
 * **Und warum es genügt.** Gesucht wird nach einem Zeichen, das **als Wert** im Code steht
 * (`textContent = '✕'`, `'⌥ objekte'`). Ein Wert steht nie in einem Kommentar — also ist das
 * Entfernen der Kommentare genau die Grenze, die gebraucht wird. Der Entferner ist absichtlich grob:
 * er kennt keine Zeichenketten mit `//` darin, und das ist hier ohne Belang (kein Pfad und keine
 * Adresse in diesem Baum enthält `//`).
 *
 * @param text - der Quelltext
 * @returns derselbe Text ohne Kommentare
 */
function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

test('keine Beschriftung trägt ein Zeichen — in keiner Sprache', () => {
  const fehler: string[] = []
  for (const [sprache, paket] of [
    ['de', de],
    ['en', en],
  ] as const) {
    for (const [schluessel, satz] of Object.entries(paket.messages)) {
      for (const zeichen of ALTE_ZEICHEN) {
        if (satz.includes(zeichen)) fehler.push(`${sprache}.${schluessel}: ${JSON.stringify(satz)}`)
      }
    }
  }
  expect(fehler.join('\n')).toBe('')
})

test('kein Zeichen steht als WERT im Quelltext — nur in den Erklärungen', () => {
  const fehler: string[] = []
  for (const datei of quelldateien(SRC)) {
    const code = ohneKommentare(readFileSync(datei, 'utf8'))
    for (const zeichen of ALTE_ZEICHEN) {
      if (code.includes(zeichen)) {
        const stelle = code.indexOf(zeichen)
        fehler.push(`${datei.replace(SRC, 'src')}: ${JSON.stringify(code.slice(Math.max(0, stelle - 40), stelle + 20))}`)
      }
    }
  }
  expect(fehler.join('\n')).toBe('')
})

test('jedes im Code benutzte Zeichen gibt es wirklich', () => {
  /*
   * **Die Kopplung, die still driftet.** `iconMarkup('planet')` steht als **Zeichenkette** im Code;
   * ob es ein Zeichen mit diesem Namen gibt, weiss der Typlauf nur dort, wo der Name durchgereicht
   * wird (`IslandItem.icon: IconName`). In den Stellen, die direkt aufrufen (`iconMarkup('close')`),
   * steht ein blanker String — wird er umbenannt, gibt es ihn nicht mehr, und die Oberfläche wirft
   * erst beim Öffnen.
   */
  const bekannt = new Set<string>(ICON_NAMES)
  const fehler: string[] = []
  let geprueft = 0
  for (const datei of quelldateien(SRC)) {
    const code = ohneKommentare(readFileSync(datei, 'utf8'))
    for (const treffer of code.matchAll(/\biconMarkup\(\s*'([a-z0-9-]+)'/g)) {
      geprueft += 1
      const name = treffer[1] ?? ''
      if (!bekannt.has(name)) fehler.push(`${datei.replace(SRC, 'src')}: ${JSON.stringify(name)}`)
    }
  }
  // **Und die Prüfung sagt, daß sie etwas geprüft hat.** Ein Muster, das nie trifft, sieht grün aus.
  expect(geprueft).toBeGreaterThan(4)
  expect(fehler.join('\n')).toBe('')
})
