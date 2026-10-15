/**
 * `scripts/readme-pairing.mjs` — hält die beiden README-Fassungen beieinander.
 *
 * ## Warum es das geben muß
 *
 * Zwei Sprachfassungen derselben Datei gehen auseinander. Nicht auf einmal,
 * sondern in kleinen Schritten: eine Zeile wird ergänzt, ein Abschnitt
 * umgeschrieben, eine Zahl korrigiert — und die andere Fassung bleibt zurück.
 * Nach drei Änderungen behauptet die deutsche etwas anderes als die englische,
 * und niemand merkt es, weil niemand beide liest.
 *
 * **Die Vorlage hat genau dafür einen Prüfer.** Gemessen am 13.10.2026:
 * `@deepseek-ai/dsh-web-app` führt neben `README.md` und `README.zh.md` eine
 * `README.i18n.yaml` mit einem **Hash je Abschnitt und Sprache**:
 *
 * ```yaml
 * # Bilingual-pair consistency record for README.md (docs/i18n/README.md):
 * # per heading section, a hash of its English and Chinese blocks outside code
 * # blocks and generated regions.
 * # After editing either side, bring the other along and re-record with:
 * #   pnpm run verify-translation-pairing --write packages/bundle/web-app/README.md
 * /deepseek-ai-dsh-web-app/summary:
 *   en: 0a2a9876194543e5
 *   zh: ff472776a44ae260
 * ```
 *
 * **Warum hier keine Hashes stehen.** Ein Hash sagt nur „hat sich geändert", und
 * er verlangt eine Datei, die bei jeder Änderung nachgeführt werden muß — also
 * genau die Arbeit, die man vergißt. Hier wird stattdessen **Struktur**
 * verglichen: Anzahl und Ebene der Überschriften, die Zahl der Code-Blöcke, die
 * Ziele der Links. Das ist ohne Nebenbuch prüfbar, und es findet den Fehler, der
 * wirklich passiert: ein Abschnitt in einer Fassung, der in der anderen fehlt.
 *
 * **Was es nicht kann.** Ob die deutsche Fassung **dasselbe sagt**. Das kann
 * keine Maschine. Was sie kann: zeigen, **wo** nachzusehen ist.
 *
 * @module scripts/readme-pairing
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Wurzel des Projekts, abgeleitet aus dem Modulpfad. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Zerlegt ein Markdown in seine prüfbaren Bestandteile.
 *
 * **Warum Code-Blöcke ausgenommen werden.** In ihnen steht Programmtext, und der
 * ist in beiden Fassungen **gleich** — er darf nicht übersetzt werden. Ein
 * Inhaltsverzeichnis-Eintrag innerhalb eines Code-Blocks wäre außerdem kein
 * Eintrag, sondern ein Beispiel.
 *
 * @param {string} text - der Inhalt einer Markdown-Datei
 * @returns {{ueberschriften: {ebene: number, text: string}[], codeBloecke: number, linkziele: string[], anker: string[]}}
 */
export function zerlege(text) {
  const ueberschriften = []
  const linkziele = []
  const anker = []
  const sprungmarken = []
  let codeBloecke = 0
  let imBlock = false

  for (const zeile of text.split('\n')) {
    // Ein Zaun öffnet und schließt. ``` und ~~~ sind beide erlaubt.
    if (/^\s*(```|~~~)/u.test(zeile)) {
      if (!imBlock) codeBloecke += 1
      imBlock = !imBlock
      continue
    }
    if (imBlock) continue

    const ueberschrift = /^(#{1,6})\s+(.*)$/u.exec(zeile)
    if (ueberschrift !== null) {
      ueberschriften.push({ ebene: ueberschrift[1].length, text: ueberschrift[2].trim() })
      continue
    }
    // `<a id="…">` — die Ziele des Inhaltsverzeichnisses.
    for (const treffer of zeile.matchAll(/<a id="([^"]+)">/gu)) anker.push(treffer[1])
    // `](#…)` — die Verweise. Sie müssen auf ein Ziel **in derselben** Datei
    // zeigen; das prüft {@link pruefeSprungmarken}.
    for (const treffer of zeile.matchAll(/\]\(#([^)\s]+)\)/gu)) sprungmarken.push(treffer[1])
    // Relative Links; absolute und reine Sprungmarken zählen nicht.
    for (const treffer of zeile.matchAll(/\]\(([^)\s]+)\)/gu)) {
      const ziel = treffer[1]
      if (ziel.startsWith('#') || ziel.startsWith('http://') || ziel.startsWith('https://')) continue
      linkziele.push(ziel)
    }
  }
  return {
    ueberschriften,
    codeBloecke,
    linkziele: [...new Set(linkziele)].sort(),
    anker: [...new Set(anker)].sort(),
    sprungmarken: [...new Set(sprungmarken)].sort(),
  }
}

/**
 * Vergleicht zwei Fassungen und liefert die Unterschiede.
 *
 * **Warum nur die Struktur und nicht der Text.** Übersetzungen sind keine
 * Abbildungen. „Summary" und „Zusammenfassung" sind beide richtig, und ein
 * Vergleich der Wörter ergäbe bei jedem Lauf Fehlalarme — die Prüfung würde
 * abgeschaltet, und dann fände sie auch den echten Fehler nicht mehr.
 *
 * @param {ReturnType<typeof zerlege>} a - die eine Fassung
 * @param {ReturnType<typeof zerlege>} b - die andere
 * @returns {string[]} die Befunde, leer heißt „gekoppelt"
 */
export function vergleiche(a, b) {
  const befunde = []

  if (a.ueberschriften.length !== b.ueberschriften.length) {
    befunde.push(
      `Anzahl der Überschriften verschieden: ${String(a.ueberschriften.length)} gegen ${String(b.ueberschriften.length)}`,
    )
  }
  const gleichViele = Math.min(a.ueberschriften.length, b.ueberschriften.length)
  for (let i = 0; i < gleichViele; i += 1) {
    const x = a.ueberschriften[i]
    const y = b.ueberschriften[i]
    if (x.ebene !== y.ebene) {
      befunde.push(
        `Überschrift ${String(i + 1)}: Ebene ${String(x.ebene)} gegen ${String(y.ebene)} — „${x.text}" gegen „${y.text}"`,
      )
    }
  }
  if (a.codeBloecke !== b.codeBloecke) {
    befunde.push(`Anzahl der Code-Blöcke verschieden: ${String(a.codeBloecke)} gegen ${String(b.codeBloecke)}`)
  }
  if (a.anker.join('|') !== b.anker.join('|')) {
    const nurA = a.anker.filter((x) => !b.anker.includes(x))
    const nurB = b.anker.filter((x) => !a.anker.includes(x))
    if (nurA.length > 0) befunde.push(`Anker nur in der ersten Fassung: ${nurA.join(', ')}`)
    if (nurB.length > 0) befunde.push(`Anker nur in der zweiten Fassung: ${nurB.join(', ')}`)
  }
  // Die Linkziele MÜSSEN gleich sein — sie zeigen auf dieselben Dateien.
  //
  // **Mit einer Ausnahme, und sie ist Absicht.** Die Sprachumschaltung jeder
  // Fassung zeigt auf die **andere** Fassung: `README.md` enthält
  // `README.de.md` und umgekehrt. Das ist der einzige Link, der sich
  // unterscheiden **darf** — und er muß es sogar.
  const ohneSprachwechsel = (ziele, eigene) => ziele.filter((z) => z !== eigene)
  const zieleA = ohneSprachwechsel(a.linkziele, 'README.de.md')
  const zieleB = ohneSprachwechsel(b.linkziele, 'README.md')
  if (zieleA.join('|') !== zieleB.join('|')) {
    const nurA = zieleA.filter((x) => !zieleB.includes(x))
    const nurB = zieleB.filter((x) => !zieleA.includes(x))
    if (nurA.length > 0) befunde.push(`Linkziel nur in der ersten Fassung: ${nurA.join(', ')}`)
    if (nurB.length > 0) befunde.push(`Linkziel nur in der zweiten Fassung: ${nurB.join(', ')}`)
  }
  return befunde
}

/**
 * Prüft **innerhalb** einer Fassung, ob jede Sprungmarke ein Ziel hat.
 *
 * ## Der Fehler, der diese Funktion erzwungen hat
 *
 * Der Paarungsvergleich stellt fest, ob die **Ankerziele** zweier Fassungen
 * gleich sind. Er sagt **nichts** darüber, ob die Verweise **innerhalb** einer
 * Fassung auf ein vorhandenes Ziel zeigen.
 *
 * Gemessen am 13.10.2026, nachdem die Anker auf sprachneutrale Namen umgestellt
 * wurden: die deutsche Fassung enthielt noch
 * `[Bekannte Grenzen](#bekannte-grenzen-und-offene-arbeit)`, während das Ziel
 * längst `known-limitations-and-deferred-work` hieß. **Der Paarungsprüfer meldete
 * „ok"** — die Ankerziele beider Dateien waren ja gleich. Der Link war trotzdem
 * tot.
 *
 * Eine Prüfung, die die richtige Frage an der falschen Stelle stellt, ist genau
 * die Sorte grüner Prüfung, die nichts prüft.
 *
 * @param {ReturnType<typeof zerlege>} zerlegt - das Ergebnis von {@link zerlege}
 * @returns {string[]} die Befunde
 */
export function pruefeSprungmarken(zerlegt) {
  const ziele = new Set(zerlegt.anker)
  const tot = zerlegt.sprungmarken.filter((s) => !ziele.has(s))
  return tot.length === 0 ? [] : [`Sprungmarke ohne Ziel: ${tot.join(', ')}`]
}

/**
 * Prüft eine Paarung aus zwei Dateien.
 *
 * @param {string} dateiA - Pfad der ersten Fassung
 * @param {string} dateiB - Pfad der zweiten Fassung
 * @returns {{befunde: string[], fehlend: string[]}}
 */
export function pruefePaarung(dateiA, dateiB) {
  const fehlend = [dateiA, dateiB].filter((p) => !existsSync(p))
  if (fehlend.length > 0) return { befunde: [], fehlend }
  const a = zerlege(readFileSync(dateiA, 'utf8'))
  const b = zerlege(readFileSync(dateiB, 'utf8'))
  return {
    befunde: [
      ...vergleiche(a, b),
      // Innerhalb **jeder** Fassung: zeigt jeder Verweis auf ein Ziel?
      ...pruefeSprungmarken(a).map((x) => `${dateiA}: ${x}`),
      ...pruefeSprungmarken(b).map((x) => `${dateiB}: ${x}`),
    ],
    fehlend: [],
  }
}

/** Die Paarungen dieses Projekts. */
export const PAARUNGEN = [['README.md', 'README.de.md']]

/**
 * Prüft alle Paarungen und meldet das Ergebnis.
 *
 * @param {{schreibe?: (t: string) => void, wurzel?: string}} [optionen]
 * @returns {number} die Zahl der Befunde
 */
export function pruefeAlle(optionen = {}) {
  const schreibe = optionen.schreibe ?? ((t) => process.stdout.write(t))
  const wurzel = optionen.wurzel ?? ROOT
  let gesamt = 0
  for (const [a, b] of PAARUNGEN) {
    const { befunde, fehlend } = pruefePaarung(join(wurzel, a), join(wurzel, b))
    if (fehlend.length > 0) {
      schreibe(`  FEHLT  ${fehlend.join(', ')}\n`)
      gesamt += fehlend.length
      continue
    }
    if (befunde.length === 0) {
      schreibe(`  ok     ${a} ↔ ${b}\n`)
    } else {
      schreibe(`  BEFUND ${a} ↔ ${b}\n`)
      for (const befund of befunde) schreibe(`         ${befund}\n`)
      gesamt += befunde.length
    }
  }
  return gesamt
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`README-Paarung (${String(PAARUNGEN.length)} Paar)\n`)
  const befunde = pruefeAlle()
  process.stdout.write(befunde === 0 ? 'Alle Paare gekoppelt.\n' : `${String(befunde)} Befund(e).\n`)
  process.exitCode = befunde === 0 ? 0 : 1
}
