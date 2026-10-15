/**
 * Werkszeug: **die englischen Wörterbücher des Kerns aus den Bündeln lesen.**
 *
 * ## Warum es das gibt
 *
 * Ein deutsches Sprachpaket braucht je Namensraum die **Schlüssel** und die **englischen
 * Texte**. Beides steht im gebündelten `lib/client.js` — und zwar an einer Stelle, die den
 * Namensraum **selbst nennt**:
 *
 * ```js
 * const NS = "chat";
 * locale.register(NS, { zh, en });
 * ```
 *
 * Damit braucht dieses Werkszeug **keine** Vermutung darüber, welcher Objektblock zu
 * welchem Namen gehört: der Aufruf liefert das Paar (Namensraum, Wörterbuch) selbst.
 *
 * ## Was vorher schiefging (gemessen, vier Anläufe)
 *
 * 1. **Nur Literale als erstes Argument** → 14 Namensräume statt 56. Der Kern übergibt
 *    meist eine **Konstante** (`locale.register(NS, …)`).
 * 2. **`.locale.register(`** verlangt einen Punkt vor `locale` → der Kern schreibt oft
 *    **bar** (`locale.register("chat", …)`).
 * 3. **Ergebnistafel nach Namensraum gekeyt, letzte Nennung gewinnt** → `bind("chat")` nach
 *    `register("chat", …)` machte `chat` zum bloßen Leser.
 * 4. **Objektblock mit den meisten Treffern** → Englisch und Chinesisch haben **denselben**
 *    Schlüsselsatz, also gewann der erste Block, und das war `zh`.
 *
 * Alle vier sind in `sprachnamensraum-sonde.mjs` und hier behoben. Die Lehre steht in
 * `docs/status/arbeitsweise.md`: **JSON und Code werden geparst, nicht gemustert** — und eine
 * Zählung ohne zweite, unabhängige Quelle ist eine Vermutung.
 *
 * ## Gegenprobe
 *
 * Für `chat` gibt die Typdeklaration des Kerns **190** Schlüssel. Liefert dieses Werkszeug
 * eine **andere** Zahl, ist die Extraktion kaputt — dann endet es mit 1, egal wie plausibel
 * die Ausgabe aussieht.
 *
 * ```powershell
 * bun scripts/language-source.mjs                 # Übersicht je Namensraum
 * bun scripts/language-source.mjs --json <datei>  # Quelltext-Datei schreiben
 * bun scripts/language-source.mjs --fach chat     # ein Fach vollständig ausgeben
 * ```
 *
 * @module scripts/language-source
 */

import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const KERN = 'node_modules/@deepseek-ai'

/** Erwartete Schlüsselzahl je Namensraum, aus den Typdeklarationen des Kerns. */
export const GEGENPROBEN = { chat: 190, conversation: 371, cordis: 51, deliverables: 60 }

/** Alle `const NAME = "wert"` eines Bündels — mit Zählung, damit Doppeldeutigkeiten auffallen. */
function konstanteTabelle(text) {
  const raus = new Map()
  for (const m of text.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*"([^"]*)"/gu)) {
    const name = m[1]
    const wert = m[2]
    if (name === undefined || wert === undefined) continue
    const alt = raus.get(name)
    if (alt === undefined) raus.set(name, { wert, anzahl: 1 })
    else alt.anzahl += 1
  }
  return raus
}

/**
 * Der Inhalt eines Objektliterals ab `index` (dort muß `{` stehen).
 *
 * @param {string} text
 * @param {number} index
 * @returns {{koerper: string, ende: number} | undefined}
 */
function objektAb(text, index) {
  if (text[index] !== '{') return undefined
  let tiefe = 0
  let i = index
  for (; i < text.length; i++) {
    const c = text[i]
    if (c === '{') tiefe += 1
    else if (c === '}') {
      tiefe -= 1
      if (tiefe === 0) return { koerper: text.slice(index + 1, i), ende: i }
    }
  }
  return undefined
}

/**
 * Die erste Ebene eines Objektkörpers.
 *
 * Drei Formen sind gemessen und werden **alle** gebraucht — die erste Fassung kannte nur die
 * erste und verwarf damit 54 von 56 Wörterbüchern:
 *
 * ```js
 * { "key": "text" }          → texte
 * { en, zh }                 → kurz      (Kurzschreibweise, kein Doppelpunkt)
 * { zh: zh$1, en: en$1 }     → aliase    (Name zeigt auf einen Bezeichner)
 * { "key": { … } }           → verschachtelt (zählt als EIN Schlüssel)
 * ```
 *
 * @param {string} koerper
 * @returns {{texte: Map<string, string>, kurz: Set<string>, aliase: Map<string, string>, verschachtelt: string[], ausdruecke: string[]}}
 */
function ersteEbene(koerper) {
  const texte = new Map()
  const kurz = new Set()
  const aliase = new Map()
  const verschachtelt = []
  const ausdruecke = []
  let tiefe = 0
  for (const zeile of koerper.split('\n')) {
    const vorher = tiefe
    for (const c of zeile) {
      if (c === '{') tiefe += 1
      else if (c === '}') tiefe -= 1
    }
    if (vorher !== 0) continue
    // Kurzschreibweise: `en,` oder `en`
    const k = /^\s*([A-Za-z_$][\w$]*)\s*,?\s*$/u.exec(zeile)
    if (k !== null && k[1] !== undefined) {
      kurz.add(k[1])
      continue
    }
    const m = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*(.*?)\s*,?\s*$/u.exec(zeile)
    if (m === null) continue
    const name = m[1] ?? m[2] ?? m[3]
    const rest = m[4] ?? ''
    if (name === undefined) continue
    const str = /^"((?:[^"\\]|\\.)*)"$/u.exec(rest) ?? /^'((?:[^'\\]|\\.)*)'$/u.exec(rest)
    if (str !== null) texte.set(name, str[1] ?? '')
    else if (rest.startsWith('{')) verschachtelt.push(name)
    else if (/^[A-Za-z_$][\w$]*$/u.test(rest)) aliase.set(name, rest)
    else if (rest.length > 0 && !rest.startsWith('//')) ausdruecke.push(`${name}: ${rest.slice(0, 40)}`)
  }
  return { texte, kurz, aliase, verschachtelt, ausdruecke }
}

/**
 * Alle Wörterbuch-Registrierungen eines Bündels.
 *
 * @param {string} text
 * @returns {{ns: string, art: string, quelle: string, eintraege: {texte: Map<string,string>, verschachtelt: string[], ausdruecke: string[]} | undefined, rohform: string}[]}
 */
export function registrierungen(text) {
  const tabelle = konstanteTabelle(text)
  const raus = []
  const muster =
    /(?:^|[^\w$])locale\s*\.\s*(register|bind)\s*\(\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z_$][\w$]*))/gu
  for (const m of text.matchAll(muster)) {
    const art = m[1] ?? '?'
    const literal = m[2] ?? m[3]
    const bezeichner = m[4]
    let ns
    let quelle
    if (literal !== undefined) {
      ns = literal
      quelle = 'literal'
    } else if (bezeichner !== undefined) {
      const eintrag = tabelle.get(bezeichner)
      if (eintrag === undefined) {
        raus.push({ ns: `?${bezeichner}`, art, quelle: 'unaufgeloest', eintraege: undefined, rohform: bezeichner })
        continue
      }
      ns = eintrag.wert
      quelle = eintrag.anzahl > 1 ? `konstante(${String(eintrag.anzahl)}x deklariert)` : 'konstante'
    } else {
      continue
    }
    // Das zweite Argument lesen — nur wenn es ein Objektliteral ist, gibt es ein Wörterbuch.
    // Achtung: `m[0]` endet **hinter** dem Namensraum-Bezeichner. Ein Suchlauf nach dem
    // nächsten Komma ab hier trifft das Komma **zwischen den Argumenten**, nicht das im
    // Objektliteral — das war der Fehler der ersten Fassung (`indexOf(',')` ab `m[0].length`
    // lief in `{ zh, en }` hinein und meldete „zweites Argument ist kein Objektliteral").
    let eintraege
    let rohform = ''
    let j = m.index + m[0].length
    while (j < text.length && /\s/u.test(text[j] ?? '')) j += 1
    if (text[j] !== ',') {
      rohform = `kein Komma hinter dem Namensraum: ${text.slice(j, j + 40).replace(/\s+/gu, ' ')}`
    } else {
      j += 1
      while (j < text.length && /\s/u.test(text[j] ?? '')) j += 1
      if (text[j] !== '{') {
        // **Listenform** (gemessen in `dsh-client-ui-directory-picker-browse`):
        //
        // ```js
        // const dictionaries = [["zh", { … }], ["en", { … }]];
        // for (const [locale, dict] of dictionaries) disposers.push(ctx.locale.register(LOCALE_NS, locale, dict))
        // ```
        //
        // Hier ist das zweite Argument die **Laufzeitvariable** `locale`, das Wörterbuch steht
        // im dritten. Der englische Eintrag ist der Block hinter `["en", {`.
        const liste = /\[\s*"en"\s*,\s*\{/u.exec(text)
        if (liste !== null) {
          const o = objektAb(text, text.indexOf('{', liste.index + liste[0].length - 1))
          if (o !== undefined) {
            eintraege = ersteEbene(o.koerper)
            rohform = 'Listenform [["en", {…}]]'
          } else {
            rohform = 'Listenform erkannt, aber der englische Block ist nicht lesbar'
          }
        } else {
          rohform = `zweites Argument ist kein Objektliteral und keine Listenform: ${text.slice(j, j + 40).replace(/\s+/gu, ' ')}`
        }
      } else {
        const objekt = objektAb(text, j)
        if (objekt !== undefined) {
          const kopf = ersteEbene(objekt.koerper)
          // Der englische Zweig heißt immer `en` — als Kurzschreibweise (`{ zh, en }`), als
          // Alias (`en: en$1`) oder als Zeichenkette. Kein anderer Zweig darf gewinnen.
          const kandidat = kopf.aliase.get('en') ?? kopf.texte.get('en') ?? (kopf.kurz.has('en') ? 'en' : undefined)
          if (kandidat !== undefined) {
            const start = text.indexOf(`const ${kandidat} = {`)
            if (start >= 0) {
              const o = objektAb(text, start + `const ${kandidat} = `.length)
              if (o !== undefined) eintraege = ersteEbene(o.koerper)
              rohform = `const ${kandidat}`
            } else {
              rohform = `const ${kandidat} NICHT GEFUNDEN`
            }
          } else {
            rohform = `Objektliteral ohne englischen Zweig: ${objekt.koerper.replace(/\s+/gu, ' ').slice(0, 60)}`
          }
        }
      }
    }
    // Alias-Werte auflösen. Gemessen in `dsh-client-ui-conversation`: zwei Einträge zeigen
    // auf eine Konstante statt auf eine Zeichenkette —
    //
    // ```js
    // "hint.plan": PLAN_NEXT_ACTION_EN,
    // ```
    //
    // Ohne Auflösung fehlten genau diese zwei Schlüssel (369 statt 371) und die Gegenprobe
    // schlug an. Der Fehler war damit **sichtbar**, nicht still.
    if (eintraege !== undefined) {
      for (const [name, ident] of eintraege.aliase) {
        const eintrag = tabelle.get(ident)
        if (eintrag !== undefined) eintraege.texte.set(name, eintrag.wert)
        else eintraege.ausdruecke.push(`${name}: ${ident} (nicht auflösbar)`)
      }
    }
    raus.push({ ns, art, quelle, eintraege, rohform })
  }
  return raus
}

function haupt() {
  const wurzel = process.cwd()
  const args = process.argv.slice(2)
  const jsonZiel = args.includes('--json') ? args[args.indexOf('--json') + 1] : undefined
  const nurFach = args.includes('--fach') ? args[args.indexOf('--fach') + 1] : undefined

  /** @type {Map<string, {paket: string, schluessel: Map<string,string>, verschachtelt: string[], ausdruecke: string[]}>} */
  const faecher = new Map()
  const anmerkungen = []

  for (const paket of readdirSync(join(wurzel, KERN)).sort()) {
    const buendel = join(wurzel, KERN, paket, 'lib', 'client.js')
    if (!existsSync(buendel)) continue
    const text = readFileSync(buendel, 'utf8')
    for (const r of registrierungen(text)) {
      if (r.art !== 'register') continue
      if (r.eintraege === undefined) {
        anmerkungen.push(`${paket}: ${r.ns} — ${r.rohform}`)
        continue
      }
      if (faecher.has(r.ns)) {
        anmerkungen.push(`${paket}: ${r.ns} ist bereits von ${faecher.get(r.ns)?.paket} registriert (übersprungen)`)
        continue
      }
      faecher.set(r.ns, {
        paket,
        schluessel: r.eintraege.texte,
        verschachtelt: r.eintraege.verschachtelt,
        ausdruecke: r.eintraege.ausdruecke,
      })
    }
  }

  const gesamt = [...faecher.values()].reduce((s, f) => s + f.schluessel.size, 0)

  // ---- Gegenprobe ----
  let gegenprobeOk = true
  console.log('== Gegenprobe gegen die Typdeklarationen des Kerns ==')
  for (const [ns, erwartet] of Object.entries(GEGENPROBEN)) {
    const f = faecher.get(ns)
    const ist = f === undefined ? -1 : f.schluessel.size
    const passt = ist === erwartet
    if (!passt) gegenprobeOk = false
    console.log(`   ${ns.padEnd(14)} erwartet ${String(erwartet).padStart(4)}  gemessen ${String(ist).padStart(4)}  ${passt ? 'OK' : 'ABWEICHUNG'}`)
  }
  console.log('')

  if (nurFach !== undefined) {
    const f = faecher.get(nurFach)
    if (f === undefined) {
      console.log(`Fach \`${nurFach}\` nicht gefunden.`)
      process.exit(1)
    }
    console.log(`== ${nurFach} ==  (${f.paket})  ${String(f.schluessel.size)} Texte`)
    for (const k of [...f.schluessel.keys()].sort()) console.log(`${k}\t${f.schluessel.get(k) ?? ''}`)
    process.exit(0)
  }

  console.log(`== Namensräume mit englischem Wörterbuch: ${String(faecher.size)}`)
  console.log(`== Texte insgesamt: ${String(gesamt)}`)
  console.log('')
  const sortiert = [...faecher.entries()].sort((a, b) => b[1].schluessel.size - a[1].schluessel.size)
  for (const [ns, f] of sortiert) {
    const extra = f.verschachtelt.length > 0 ? `  +${String(f.verschachtelt.length)} verschachtelt` : ''
    const ausd = f.ausdruecke.length > 0 ? `  !${String(f.ausdruecke.length)} Ausdruck` : ''
    console.log(`   ${String(f.schluessel.size).padStart(4)}  ${ns.padEnd(24)} ${f.paket}${extra}${ausd}`)
  }
  console.log('')

  if (anmerkungen.length > 0) {
    console.log(`== Anmerkungen (${String(anmerkungen.length)}):`)
    for (const a of anmerkungen) console.log(`   ${a}`)
    console.log('')
  }

  if (jsonZiel !== undefined) {
    const inhalt = {
      _hinweis:
        'Quelltexte der englischen Wörterbücher, gelesen aus den Registrierungsaufrufen der Kern-Bündel. Erzeugt von scripts/language-source.mjs.',
      faecher: Object.fromEntries(
        sortiert.map(([ns, f]) => [ns, { paket: f.paket, englisch: Object.fromEntries(f.schluessel) }]),
      ),
    }
    writeFileSync(jsonZiel, `${JSON.stringify(inhalt, null, 2)}\n`, 'utf8')
    console.log(`Quelltexte geschrieben: ${jsonZiel}`)
  }

  if (!gegenprobeOk) {
    console.log('BEFUND: Die Gegenprobe stimmt nicht — die Extraktion ist verdächtig. Abbruch.')
    process.exit(1)
  }
  console.log(`BEFUND: ${String(faecher.size)} Namensräume mit ${String(gesamt)} englischen Texten gelesen, Gegenprobe stimmt.`)
}

if (import.meta.main === true) haupt()
