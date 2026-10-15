/**
 * Werkszeug: **den englischen Text eines Fachs ausgeben.**
 *
 * ## Warum es das gibt
 *
 * Ein Sprachpaket zu schreiben heißt, je Schlüssel den englischen Text zu kennen. Die
 * **Schlüssel** stehen in den `.d.ts`-Dateien des Kerns (der Trichter liest sie), die
 * **Werte** stehen im **gebündelten** `lib/client.js` — minifiziert, teils über mehrere
 * Zeilen.
 *
 * Dieses Werkszeug findet zu einem Fach das passende Paket, sucht dort den
 * Wörterbuch-Block und gibt `schlüssel<TAB>englischer Text` aus. Damit läßt sich ein Fach
 * übersetzen, **ohne** die Quelle von Hand zu durchsuchen.
 *
 * ## Der Weg, der NICHT funktioniert hat
 *
 * Ein Muster `/"([^"]+)"\s*:\s*"([^"]*)"/` über den Block: es findet **keine** Werte, die
 * über mehrere Zeilen laufen. Gemessen in Runde 70: **14 statt 41** Schlüssel. Deshalb wird
 * der Block über die **Klammerntiefe** gelesen und nur die **erste Ebene** ausgewertet.
 *
 * @module scripts/language-values
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findeSprachdateien, leseSchluessel, paketAus } from './language-funnel.mjs'

const KERN = 'node_modules/@deepseek-ai'

/** Findet zu jedem Fach das Paket, das es deklariert. */
export function faecherMitPaket(wurzel = process.cwd()) {
  const raus = new Map()
  for (const d of findeSprachdateien(join(wurzel, KERN))) {
    let text
    try {
      text = readFileSync(d, 'utf8')
    } catch {
      continue
    }
    const { namespace, schluessel } = leseSchluessel(text)
    if (namespace === undefined || schluessel.length === 0) continue
    raus.set(namespace, { paket: paketAus(d.replace(/\\/gu, '/')), schluessel })
  }
  return raus
}

/**
 * Liest die Paare `schlüssel: wert` eines Objektblocks — **erste Ebene**, Werte dürfen
 * mehrzeilig sein.
 *
 * @param {string} koerper - der Inhalt zwischen den äußeren Klammern
 * @returns {Map<string, string>}
 */
export function lesePaare(koerper) {
  const raus = new Map()
  let ebene = 0
  for (const zeile of koerper.split('\n')) {
    const vorher = ebene
    for (const c of zeile) {
      if (c === '{') ebene += 1
      else if (c === '}') ebene -= 1
    }
    if (vorher !== 0) continue
    const m = /^\s*(?:"([^"]+)"|'([^']+)')\s*:\s*"((?:[^"\\]|\\.)*)"/u.exec(zeile)
    if (m === null) continue
    const name = m[1] ?? m[2]
    const wert = m[3] ?? ''
    if (name !== undefined) raus.set(name, wert)
  }
  return raus
}

/**
 * Sammelt **alle** Objektblöcke des Bündels, die Schlüssel des Fachs tragen.
 *
 * **Befund (Runde 82):** Englisch und Chinesisch haben **denselben** Schlüsselsatz.
 * Die frühere Fassung nahm den Block mit den meisten Treffern — bei Gleichstand also den
 * **ersten**, und das war `zh`. Gemessen: `skill` lieferte `row.inspect → 查看` statt
 * `row.inspect → Inspect`. Deshalb wird jetzt der **Name** des Blocks mitgeführt; die
 * Auswahl passiert danach (siehe {@link waehleBlock}).
 *
 * @param {string} text - Inhalt des Bündels
 * @param {readonly string[]} erwartet - die Schlüssel des Fachs
 * @returns {{name: string, paare: Map<string, string>, treffer: number}[]} Kandidaten, bester zuerst
 */
export function findeBloecke(text, erwartet) {
  const wollen = new Set(erwartet)
  const raus = []
  // Alle `const <name> = {` im Bündel durchgehen.
  for (const kopf of text.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*\{/gu)) {
    const ab = kopf.index + kopf[0].length
    let tiefe = 1
    let i = ab
    for (; i < text.length && tiefe > 0; i++) {
      const c = text[i]
      if (c === '{') tiefe += 1
      else if (c === '}') tiefe -= 1
    }
    const paare = lesePaare(text.slice(ab, i - 1))
    let treffer = 0
    for (const k of paare.keys()) if (wollen.has(k)) treffer += 1
    if (treffer > 0) raus.push({ name: kopf[1] ?? '?', paare, treffer })
  }
  raus.sort((a, b) => b.treffer - a.treffer || a.name.localeCompare(b.name))
  return raus
}

/**
 * Wählt aus den Kandidaten den **englischen** Block.
 *
 * Reihenfolge: Name deutet auf Englisch (`en`) → Name deutet nicht auf Chinesisch/Zweite
 * Sprache (`zh`, `cn`) → sonst der erste. Wird **kein** englischer Block gefunden, gibt die
 * Funktion `undefined` zurück; der Aufrufer **muß** das melden und darf nicht den
 * chinesischen Text als englischen ausgeben.
 *
 * @param {readonly {name: string, paare: Map<string, string>, treffer: number}[]} kandidaten
 * @returns {{name: string, paare: Map<string, string>, treffer: number} | undefined}
 */
export function waehleBlock(kandidaten) {
  const englisch = kandidaten.find((k) => /(^|[^a-z])en([^a-z]|$)|englisch|english/iu.test(k.name))
  if (englisch !== undefined) return englisch
  return kandidaten.find((k) => !/zh|cn|chines/iu.test(k.name))
}

/**
 * Bequemer Weg für einen einzelnen Block (englisch bevorzugt).
 *
 * @param {string} text - Inhalt des Bündels
 * @param {readonly string[]} erwartet - die Schlüssel des Fachs
 * @returns {Map<string, string>} die gefundenen Paare (leer, wenn kein Block paßt)
 */
export function findeWoerterbuch(text, erwartet) {
  return waehleBlock(findeBloecke(text, erwartet))?.paare ?? new Map()
}

function haupt() {
  const wurzel = process.cwd()
  const faecher = faecherMitPaket(wurzel)
  const args = process.argv.slice(2)
  const zeigeBloecke = args.includes('--bloecke')
  const gewuenscht = args.filter((a) => !a.startsWith('-'))

  const liste = gewuenscht.length > 0 ? gewuenscht : [...faecher.keys()].sort()
  for (const fach of liste) {
    const info = faecher.get(fach)
    if (info === undefined) {
      console.log(`== ${fach} ==  UNBEKANNTES FACH — kein locales.d.ts nennt es`)
      continue
    }
    let buendel = ''
    try {
      buendel = readFileSync(join(wurzel, KERN, info.paket, 'lib', 'client.js'), 'utf8')
    } catch {
      console.log(`== ${fach} ==  kein Bündel: ${info.paket}/lib/client.js`)
      continue
    }
    const kandidaten = findeBloecke(buendel, info.schluessel)
    if (zeigeBloecke) {
      console.log(`== ${fach} ==  (${info.paket})  ${String(kandidaten.length)} Blöcke mit Fach-Schlüsseln`)
      for (const k of kandidaten) {
        const probe = [...k.paare.entries()][0]
        console.log(
          `   ${k.name.padEnd(24)} ${String(k.treffer).padStart(4)} Treffer  ${probe === undefined ? '' : `${probe[0]}=${probe[1].slice(0, 40)}`}`,
        )
      }
      console.log('')
      continue
    }
    const block = waehleBlock(kandidaten)
    if (block === undefined) {
      const namen = kandidaten.map((k) => k.name).join(', ')
      console.log(`== ${fach} ==  KEIN ENGLISCHER BLOCK (${info.paket}) — Kandidaten: ${namen}`)
      continue
    }
    const paare = block.paare
    const fehlend = info.schluessel.filter((k) => !paare.has(k))
    console.log(
      `== ${fach} ==  (${info.paket}, Block \`${block.name}\`)  ${String(paare.size)} Werte, ${String(fehlend.length)} ohne Text`,
    )
    for (const k of [...info.schluessel].sort()) {
      const wert = paare.get(k)
      console.log(`${k}\t${wert === undefined ? '(kein Text gefunden)' : wert.replace(/\n/gu, ' ')}`)
    }
    console.log('')
  }
}

if (import.meta.main === true) haupt()
