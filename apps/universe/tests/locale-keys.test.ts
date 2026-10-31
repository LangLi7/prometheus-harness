/**
 * Jeder im Code benutzte Sprachschluessel **existiert**.
 *
 * **Warum das ein Test ist und kein Gefuehl.** Ein Tippfehler in einem Schluessel ist unsichtbar:
 * `tr('panel.suche')` statt `tr('panel.search')` zeigt nicht etwa nichts, sondern **`panel.suche`** —
 * und in einer Oberflaeche sieht das aus wie ein Platzhalter, den man spaeter fuellt. Man sucht ihn
 * dort, wo er angezeigt wird, statt dort, wo er steht.
 *
 * **Was hier gelesen wird.** Der Quelltext selbst: jeder Aufruf `tr('…')` und jeder Schluessel in
 * `settings`-Beschreibungen. Beides sind **Zeichenketten im Code**, also ist es ein Textvergleich und
 * keine Typfrage — der Compiler kann ihn nicht leisten.
 *
 * Die Schluessel mit Platzhaltern in der Mitte (`setting.${feld.key}.label`) werden bewusst
 * uebersprungen: sie sind zur Uebersetzungszeit nicht bekannt. Fuer sie gibt es den
 * Vollstaendigkeitstest in `i18n.test.ts`.
 */
import { expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { de } from '../src/locales/de'
import { en } from '../src/locales/en'

const SRC = join(import.meta.dir, '..', 'src')

/** Alle `.ts`-Dateien unter `src/`, rekursiv — Unterordner eingeschlossen. */
function quelldateien(dir: string): readonly string[] {
  const out: string[] = []
  for (const eintrag of readdirSync(dir, { withFileTypes: true })) {
    const pfad = join(dir, eintrag.name)
    if (eintrag.isDirectory()) out.push(...quelldateien(pfad))
    else if (eintrag.name.endsWith('.ts')) out.push(pfad)
  }
  return out
}

/**
 * Schluessel, die **benutzt, aber vom Muster nicht gefunden** werden.
 *
 * **Warum eine Liste und keine schlauere Regel.** Jeder Eintrag hier hat einen echten Grund, und der
 * steht daneben — sonst waere die Liste ein Ort, an dem man unliebsame Befunde versteckt. Wer etwas
 * hinzufuegt, nennt den Grund; wer keinen nennen kann, hat einen toten Schluessel gefunden.
 */
const AUSNAHMEN: Readonly<Record<string, string>> = {
  'health.ok': 'Marke im Bericht — der Aufruf steht in `terminal.ts` unter dem Namen `sagen`',
  'health.fail': 'dieselbe Marke, negativ',
  'health.locale': 'Berichtsname des Sprach-Plugins — der Aufruf steht in `locale-plugins.ts`',
}

/**
 * Schluessel, die im Text als **vollstaendige Zeichenkette** vorkommen.
 *
 * **Drei Formen, und die zweite und dritte waren der Grund fuer fehlende Treffer.** Uebersetzt wird
 * nicht nur mit `tr('…')`:
 *
 *   1. **Der Aufruf:** `tr('…')`, `lookup('…')`, `t('…')`.
 *   2. **Das Datenfeld:** ein Insel-Eintrag traegt `labelKey` und `badgeKey`, eine Gruppe `titleKey`.
 *      Diese Werte gehen spaeter durch `tr()` — ein Muster, das nur den Aufruf kennt, haelt sie fuer
 *      unbenutzt.
 *   3. **Der lokale Name:** manche Stellen geben dem Uebersetzer einen **sprechenden** Namen
 *      (`sagen` im Terminal, `label` im Dock). Das ist Absicht — `label('dock.detach')` liest sich
 *      besser als `tr('dock.detach')` —, und der Test muss ihn kennen, sonst meldet er benutzte
 *      Schluessel als tot. Die Liste ist **kurz und ausdruecklich**: wer einen weiteren Namen
 *      einfuehrt, traegt ihn hier ein, und das ist die eine Zeile Arbeit, die dieser Genauigkeit
 *      entspricht.
 *
 * Was **nicht** zaehlt: eine Zeichenkette mit `${…}` darin. Solche Schluessel entstehen erst zur
 * Laufzeit (`setting.${key}.label`); fuer sie gibt es den Vollstaendigkeitstest in `i18n.test.ts`.
 */
const UEBERSETZER = ['tr', 'lookup', 't', 'sagen', 'label', 'titleOf']

function benutzteSchluessel(text: string): readonly string[] {
  const gefunden = new Set<string>()
  const namen = UEBERSETZER.join('|')
  // 1. Der Aufruf: `tr('…')`, `sagen('…')`, `label('…')`.
  const AUFRUF = new RegExp(`\\b(?:${namen})\\(\\s*(['"\`])([^'"\`$]+)\\1`, 'g')
  // 2. Das Datenfeld: `labelKey: '…'`, `titleKey: '…'`, `badgeKey: '…'`.
  //
  // **`[A-Za-z]+Key`, nicht `\w*Key`.** Ein blankes `key:` heisst in diesem Projekt **etwas
  // anderes**: `key: 'language.locale'` ist eine **Einstellung**, kein Sprachschluessel. Das
  // breitere Muster zog sie herein und meldete sie als fehlenden Satz — ein Test, der recht hat und
  // die falsche Sache prueft, ist schlimmer als keiner.
  const FELD = /\b[A-Za-z]+Key:\s*(['"`])([^'"`$]+)\1/g
  for (const muster of [AUFRUF, FELD]) {
    for (const treffer of text.matchAll(muster)) {
      const key = treffer[2]
      // Nur echte Schluessel: sie haben einen Punkt (`panel.search`). Ein `key: 'list'` aus einem
      // Befehl ist keiner.
      if (key && key.includes('.')) gefunden.add(key)
    }
  }
  return [...gefunden]
}

test('jeder im Quelltext benutzte Schluessel steht im englischen Paket', () => {
  const fehlend: string[] = []
  for (const datei of quelldateien(SRC)) {
    const text = readFileSync(datei, 'utf8')
    for (const key of benutzteSchluessel(text)) {
      if (!(key in en.messages)) fehlend.push(`${key}  (${datei.replace(SRC, 'src')})`)
    }
  }
  // Die Ausgabe nennt Datei und Schluessel: eine blosse Zahl sagt nicht, wo man suchen muss.
  expect(fehlend.join('\n')).toBe('')
})

test('jeder benutzte Schluessel steht auch im deutschen Paket', () => {
  const fehlend: string[] = []
  for (const datei of quelldateien(SRC)) {
    const text = readFileSync(datei, 'utf8')
    for (const key of benutzteSchluessel(text)) {
      if (!(key in de.messages)) fehlend.push(`${key}  (${datei.replace(SRC, 'src')})`)
    }
  }
  expect(fehlend.join('\n')).toBe('')
})

test('die Suche findet ueberhaupt Schluessel — sonst pruefen die Tests nichts', () => {
  // **Der wichtigste Test von allen.** Ein Muster, das nie trifft, laesst die beiden Tests darueber
  // gruen aussehen, ohne etwas zu pruefen. Hier wird nachgezaehlt, dass wirklich Schluessel gefunden
  // werden — und dass es genug sind, um von Deckung zu sprechen.
  const alle = quelldateien(SRC).flatMap((datei) => benutzteSchluessel(readFileSync(datei, 'utf8')))
  expect(alle.length).toBeGreaterThan(60)
  expect(alle).toContain('panel.search')
  expect(alle).toContain('island.action.settings')
  expect(alle).toContain('axes.caption')
  // **Und einer aus einem Datenfeld.** Ohne ihn wuerde die zweite Form des Musters nicht geprueft —
  // und genau die fehlte im ersten Anlauf.
  expect(alle).toContain('island.item.solar')
})

test('kein Paket hat einen Schluessel, den niemand benutzt — bis auf die begruendeten', () => {
  const benutzt = new Set(quelldateien(SRC).flatMap((datei) => benutzteSchluessel(readFileSync(datei, 'utf8'))))
  // Schluessel, die **im Sprachpaket** benutzt werden: `setting.<key>.label` und `category.<id>`
  // werden aus dem Schema zusammengesetzt, nicht im Code hingeschrieben. Deshalb werden sie hier
  // ausgenommen — sonst waere der Test falsch, nicht das Paket.
  const zusammengesetzt = /^(setting\.|category\.)/
  const ueberzaehlig = Object.keys(en.messages).filter(
    (key) => !benutzt.has(key) && !zusammengesetzt.test(key) && !(key in AUSNAHMEN),
  )
  // Die Ausgabe nennt sie: ein toter Schluessel ist meist ein Tippfehler im Code, kein Zuviel im Paket.
  expect(ueberzaehlig.join(', ')).toBe('')
})

test('jede Ausnahme nennt einen Grund — sonst ist sie ein Versteck', () => {
  for (const [key, grund] of Object.entries(AUSNAHMEN)) {
    // Der Schluessel muss **existieren**: eine Ausnahme fuer etwas, das es nicht mehr gibt, ist eine
    // Zeile, die nur noch alt aussieht.
    expect(key in en.messages, `${key} steht in keiner Mappe`).toBe(true)
    expect(key in de.messages, `${key} fehlt im deutschen Paket`).toBe(true)
    // Und der Grund muss ein Satz sein, kein Stichwort.
    expect(grund.length).toBeGreaterThan(20)
  }
})
