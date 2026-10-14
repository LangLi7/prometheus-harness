/**
 * Meßsonde: **Unter welchem Namen registriert der Client seine Sprachpakete?**
 *
 * ## Warum diese Sonde nötig war
 *
 * Der Trichter (`scripts/sprachtrichter.mjs`) liest die Schlüssel aus den
 * `locales*.d.ts`-Dateien des Kerns und nennt ein Fach nach `export declare const NS`.
 * **Fehlt** diese Zeile, fällt er auf den **Paketnamen** zurück — und der Paketname ist
 * **kein** Laufzeit-Namensraum.
 *
 * Gemessen am 14.10.2026 in `dsh-client-ui-layout/lib/client.js`:
 *
 * ```js
 * ctx.locale.register("shortcuts.layout", { zh, en })
 * ```
 *
 * Das Paket heißt `dsh-client-ui-layout`, der Namensraum heißt `shortcuts.layout`. Ein
 * deutsches Paket, das unter `dsh-client-ui-layout` registriert, **übersetzt nichts** — es
 * legt einen Namensraum an, den niemand abfragt.
 *
 * ## Der Weg, der NICHT funktioniert hat (erste Fassung dieser Sonde)
 *
 * Nur nach `"<literal>"` als erstem Argument zu suchen. Gemessen: **14** Namensraum-Literale
 * für **39** Fächer, und `common` fehlte ganz. Der Schluß „die Extraktion ist kaputt" war
 * richtig — die Ursache aber eine andere als vermutet: der Kern übergibt meist eine
 * **Konstante**:
 *
 * ```js
 * const NS = "chat";            // @307341 im Chat-Bündel
 * ctx.locale.register(NS, { zh, en })
 * ```
 *
 * Deshalb löst diese Fassung eine **Konstantentabelle** auf. Und deshalb ist die alte
 * Gegenprobe („`common` muß als Literal vorkommen") **falsch** gewesen: `common` legt der
 * Sprach-Plugin-Kern selbst an, es steht in keinem Paket-Bündel. Eine Gegenprobe, deren
 * Erwartung nicht unabhängig belegt ist, meldet einen Befund über sich selbst.
 *
 * ## Gegenproben (Regel 5)
 *
 *   1. Es muß mindestens ein `register(...)`-Aufruf aufgelöst werden (sonst ist die
 *      Extraktion kaputt, nicht der Kern).
 *   2. **Positivkontrolle `chat`**: `const NS = "chat"` steht belegt im Chat-Bündel
 *      (Fundstelle @307341) und `chat` ist ein Namensraum des Gesprächs-Registers. Fehlt
 *      `chat` im Ergebnis, ist die Auflösung kaputt.
 *   3. Jeder aufgelöste Namensraum muß nichtleer sein; unauflösbare Bezeichner werden
 *      **gezählt und benannt**, nicht verschwiegen.
 *
 * @module docs/status/messsonden/sprachnamensraum-sonde
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const KERN = 'node_modules/@deepseek-ai'
const FACH_DATEI = 'docs/status/sprachumfang.json'

/** Alle Paketverzeichnisse des Kerns. */
function pakete(wurzel) {
  const raus = []
  let eintraege
  try {
    eintraege = readdirSync(join(wurzel, KERN), { withFileTypes: true })
  } catch {
    return raus
  }
  for (const e of eintraege) if (e.isDirectory()) raus.push(e.name)
  return raus.sort()
}

/** Die `locales*.d.ts` eines Pakets. */
function sprachdateien(paketPfad) {
  const raus = []
  const gehe = (dir, tief) => {
    if (tief > 3) return
    let eintraege
    try {
      eintraege = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of eintraege) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.bin') continue
        gehe(p, tief + 1)
      } else if (/-?locales?\.d\.ts$/u.test(e.name)) raus.push(p)
    }
  }
  gehe(paketPfad, 0)
  return raus
}

/** Der `NS` aus einer Typdeklaration, oder `undefined`. */
function nsAus(text) {
  return /export\s+declare\s+const\s+NS\s*=\s*"([^"]+)"/u.exec(text)?.[1]
}

/**
 * Alle `const NAME = "wert"` eines Bündels (erster Treffer gewinnt).
 *
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function konstanteTabelle(text) {
  const raus = new Map()
  for (const m of text.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*"([^"]*)"/gu)) {
    if (m[1] !== undefined && m[2] !== undefined && !raus.has(m[1])) raus.set(m[1], m[2])
  }
  return raus
}

/**
 * Die Namensräume, die ein Bündel zur Laufzeit registriert oder bindet.
 *
 * **Dritter Anlauf, dritte Korrektur (gemessen):** Das Muster `.locale.register(` verlangt
 * einen Punkt **vor** `locale`. Der Kern schreibt aber meist **bar**:
 *
 * ```js
 * locale.register("chat", { zh, en })      // dsh-client-ui-chat
 * ctx.locale.register("shortcuts.layout", { zh, en })   // dsh-client-ui-layout
 * ```
 *
 * Beide Formen sind echt, also ist der Besitzer **optional**: `(?:^|[^\w$])locale` trifft
 * beide und nicht `meinelocale`.
 *
 * **Vierter Anlauf, vierte Korrektur (gemessen):** Die Ergebnistafel ist nach Namensraum
 * gekeyt, und die **letzte** Nennung hat gewonnen. Im Chat-Bündel steht beides:
 *
 * ```js
 * locale.register("chat", { zh, en })   // @… zuerst
 * locale.bind("chat")                   // @… danach
 * ```
 *
 * Gemessen wurde dadurch `chat (bind)` — obwohl `register("chat", { zh, en })` **direkt
 * belegt** ist (eigene Sonde über drei Pakete). Deshalb gewinnt jetzt **register** gegen
 * **bind**.
 *
 * @param {string} text
 * @returns {{namen: Map<string, {art: string, quelle: string}>, offen: string[]}}
 */
export function namensraeumeAusBuendel(text) {
  const tabelle = konstanteTabelle(text)
  const namen = new Map()
  const offen = []
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
      const wert = tabelle.get(bezeichner)
      if (wert === undefined) {
        offen.push(bezeichner)
        continue
      }
      ns = wert
      quelle = 'konstante'
    } else {
      continue
    }
    const alt = namen.get(ns)
    if (alt === undefined || (art === 'register' && alt.art !== 'register')) {
      namen.set(ns, { art, quelle })
    }
  }
  return { namen, offen }
}

function haupt() {
  const wurzel = process.cwd()
  if (!existsSync(join(wurzel, FACH_DATEI))) {
    console.log(`BEFUND: ${FACH_DATEI} fehlt — erst \`bun scripts/sprachtrichter.mjs --umfang\` laufen lassen.`)
    process.exit(1)
  }
  const umfang = JSON.parse(readFileSync(join(wurzel, FACH_DATEI), 'utf8'))
  const fachListe = new Set(Object.keys(umfang.namensraeume ?? {}))

  const zeilen = []
  let registerAufrufe = 0
  const alleOffen = new Map()
  for (const paket of pakete(wurzel)) {
    const paketPfad = join(wurzel, KERN, paket)
    const buendelPfad = join(paketPfad, 'lib', 'client.js')
    const hatBuendel = existsSync(buendelPfad)
    const nsDeklariert = []
    for (const d of sprachdateien(paketPfad)) {
      const ns = nsAus(readFileSync(d, 'utf8'))
      if (ns !== undefined && !nsDeklariert.includes(ns)) nsDeklariert.push(ns)
    }
    let laufzeit = new Map()
    const offen = []
    if (hatBuendel) {
      const { namen, offen: o } = namensraeumeAusBuendel(readFileSync(buendelPfad, 'utf8'))
      laufzeit = namen
      offen.push(...o)
      for (const n of namen.values()) if (n.art === 'register') registerAufrufe += 1
      for (const b of o) alleOffen.set(b, paket)
    }
    zeilen.push({ paket, nsDeklariert, laufzeit, offen, buendel: hatBuendel })
  }

  const alleLaufzeit = new Set()
  for (const z of zeilen) for (const n of z.laufzeit.keys()) alleLaufzeit.add(n)

  // ---- Gegenprobe 1: überhaupt Aufrufe aufgelöst? ----
  if (registerAufrufe === 0 || alleLaufzeit.size === 0) {
    console.log('BEFUND: KEIN `locale.register(...)`-Aufruf aufgelöst.')
    console.log('Das ist ein Befund über die SONDE (Auflösung kaputt), nicht über den Kern.')
    console.log('UNGÜLTIGER LAUF — Abbruch.')
    process.exit(1)
  }

  // ---- Gegenprobe 2: Positivkontrolle `chat` ----
  const hatChat = alleLaufzeit.has('chat')

  console.log(`== Pakete des Kerns: ${String(zeilen.length)}, davon mit Bündel: ${String(zeilen.filter((z) => z.buendel).length)}`)
  console.log(`== aufgelöste register-Aufrufe: ${String(registerAufrufe)}`)
  console.log(`== verschiedene Namensräume (register + bind): ${String(alleLaufzeit.size)}`)
  console.log(`== Gegenprobe \`chat\`: ${hatChat ? 'gefunden' : 'NICHT GEFUNDEN'}`)
  console.log(`== unauflösbare Bezeichner: ${String(alleOffen.size)}${alleOffen.size === 0 ? '' : ` — ${[...alleOffen.entries()].map(([b, p]) => `${b}@${p}`).join(', ')}`}`)
  console.log('')

  const mehrfach = zeilen.filter((z) => z.laufzeit.size > 1)
  console.log(`== Pakete mit mehr als einem Namensraum: ${String(mehrfach.length)}`)
  for (const z of mehrfach) {
    console.log(`   ${z.paket}`)
    for (const [ns, info] of [...z.laufzeit].sort()) console.log(`      ${ns}  (${info.art})`)
  }
  console.log('')

  const abweichung = zeilen.filter(
    (z) => z.laufzeit.size > 0 && !z.laufzeit.has(z.paket) && z.nsDeklariert.length === 0,
  )
  console.log(
    `== Pakete OHNE deklarierten NS, deren Laufzeitname nicht der Paketname ist: ${String(abweichung.length)}`,
  )
  for (const z of abweichung) {
    console.log(`   ${z.paket}  →  ${[...z.laufzeit.keys()].sort().join(', ')}`)
  }
  console.log('')

  const nurDeklariert = [...fachListe].filter((f) => !alleLaufzeit.has(f)).sort()
  console.log(`== Fächer in ${FACH_DATEI}: ${String(fachListe.size)}`)
  console.log(`== davon KEIN Namensraum aus einem Bündel: ${String(nurDeklariert.length)}`)
  for (const f of nurDeklariert) console.log(`   ${f}`)
  console.log('')

  const nurLaufzeit = [...alleLaufzeit].filter((n) => !fachListe.has(n)).sort()
  console.log(`== Namensräume aus Bündeln, die in keiner Fachliste stehen: ${String(nurLaufzeit.length)}`)
  for (const n of nurLaufzeit) console.log(`   ${n}`)
  console.log('')

  let code = 0
  if (!hatChat) {
    console.log('BEFUND: Positivkontrolle `chat` fehlt — die Auflösung ist kaputt, kein Kernbefund.')
    code = 1
  } else if (nurDeklariert.length > 0) {
    console.log(
      `BEFUND: ${String(nurDeklariert.length)} Fachnamen aus ${FACH_DATEI} sind kein Namensraum, den ein Bündel registriert.`,
    )
    console.log('Ein Sprachpaket darf nur unter den Laufzeit-Namen registrieren.')
    code = 1
  } else {
    console.log('BEFUND: Jeder Fachname der Liste ist ein Namensraum, den ein Bündel registriert.')
  }
  process.exit(code)
}

if (import.meta.main === true) haupt()
