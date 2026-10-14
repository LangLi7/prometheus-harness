/**
 * Sprachtrichter: **wie groß ist der Übersetzungsauftrag wirklich?**
 *
 * ## Warum diese Datei existiert
 *
 * Der Kern bietet den Erweiterungspunkt für Sprachpakete (`ctx.locale.addLanguage` /
 * `register`), und die Fallback-Kette muß bei `en` enden. Ein Sprachpaket `de` zu bauen
 * beginnt aber nicht mit dem Schreiben von Sätzen, sondern mit einer **Zahl**: welche
 * Namensräume gibt es, und wie viele Schlüssel hat jeder.
 *
 * **Diese Zahl ist gemessen, nicht geschätzt.** Wer sie schätzt, baut entweder zuwenig
 * oder übersetzt, was niemand liest.
 *
 * ## Woher die Schlüssel kommen — und warum aus den TYPEN
 *
 * Zum Kern gehören 50 `locales.*`-Dateien. Die **Werte** stehen im gebündelten
 * `lib/client.js` (gemessen: `//#region lib/types/client/locales.js`, darunter
 * `const en = {…}`), die **Schlüssel** aber stehen als Zeichenketten-Union in den
 * `.d.ts`-Dateien:
 *
 * ```ts
 * export type AgentPresetSettingsKey = PresetGuideKey | 'builtInGroup' | 'customGroup' | …
 * export declare const en: Record<AgentPresetSettingsKey, string>
 * ```
 *
 * **Aus den Typen zu lesen ist der robustere Weg.** Ein Bundel ist minifiziert und
 * verschachtelt; ein Typ ist eine Liste. Und die Liste ist die **Zusage** des Kerns, was
 * ein Sprachpaket abdecken muß.
 *
 * ## Was diese Sonde NICHT kann — offen benannt
 *
 * * **Verschachtelte Wörterbücher** (`{ a: { b: 'x' } }`) erscheinen als **ein** Schlüssel.
 *   Das ist eine **Untergrenze**: die wirkliche Zahl kann höher sein.
 * * **Werte aus Einbindungen** (`...guideEn`) zählen nur, wenn ihr eigener Typ gefunden
 *   wird. Der Trichter folgt Verweisen **einen** Schritt.
 * * Sie prüft **nicht**, ob ein Schlüssel zur Laufzeit wirklich gelesen wird. Der Kern
 *   kann Schlüssel führen, die keine Oberfläche mehr zeigt.
 *
 * ## Aufruf
 *
 * ```powershell
 * bun scripts/sprachtrichter.mjs            # Umfang messen
 * bun scripts/sprachtrichter.mjs --pruefen <datei.json>   # ein Paket gegen den Umfang prüfen
 * ```
 *
 * @module scripts/sprachtrichter
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const KERN = 'node_modules/@deepseek-ai'

/** Findet alle `locales.d.ts` und `*-locales.d.ts` des Kerns. */
export function findeSprachdateien(wurzel) {
  const raus = []
  const gehe = (dir) => {
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
        gehe(p)
      } else if (/-?locales?\.d\.ts$/u.test(e.name)) {
        raus.push(p)
      }
    }
  }
  gehe(wurzel)
  return raus
}

/**
 * Zieht aus einer Typdeklaration die Schlüssel heraus — **zwei Formen**, gemessen.
 *
 * **Form A — das Wörterbuch als Objekttyp** (die großen Pakete):
 *
 * ```ts
 * export declare const NS = "conversation";
 * export declare const zh: { 'shortcut.newline': string; … }   // „key-set source of truth"
 * export type ConversationKey = keyof typeof zh;
 * ```
 *
 * Hier sind die Schlüssel die **Eigenschaftsnamen** des Objekttyps.
 *
 * **Form B — eine Union** (die kleinen Pakete):
 *
 * ```ts
 * export type AgentPresetSettingsKey = PresetGuideKey | 'builtInGroup' | …
 * export declare const en: Record<AgentPresetSettingsKey, string>
 * ```
 *
 * **Warum beide.** Mein erster Entwurf kannte nur Form B und fand **10 von 56** Dateien —
 * `dsh-client-ui-conversation` mit 26 kB fiel völlig durch. Die Zahl wäre eine
 * **falsche Untergrenze** gewesen, und ich hätte sie als Umfang gemeldet.
 *
 * @param {string} text
 * @returns {{namespace: string|undefined, schluessel: string[], form: 'objekt'|'union'|'keine'}}
 */
export function leseSchluessel(text) {
  const ns = /export\s+declare\s+const\s+NS\s*=\s*"([^"]+)"/u.exec(text)

  // ---- Form A: `const zh: { … }` oder `const en: { … }` ----
  const kopf = /export\s+declare\s+const\s+(?:zh|en)\s*:\s*\{/u.exec(text)
  if (kopf !== null) {
    const ab = kopf.index + kopf[0].length
    let tiefe = 1
    let i = ab
    for (; i < text.length && tiefe > 0; i++) {
      const c = text[i]
      if (c === '{') tiefe += 1
      else if (c === '}') tiefe -= 1
    }
    const koerper = text.slice(ab, i - 1)
    const schluessel = new Set()
    // Eigenschaftsnamen der ERSTEN Ebene: `'a.b': string;` oder `name: string;`
    let ebene = 0
    for (const zeile of koerper.split('\n')) {
      const vorher = ebene
      for (const c of zeile) {
        if (c === '{') ebene += 1
        else if (c === '}') ebene -= 1
      }
      if (vorher !== 0) continue
      const m = /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*[?:]/u.exec(zeile)
      const name = m?.[1] ?? m?.[2] ?? m?.[3]
      if (name !== undefined && name !== 'readonly') schluessel.add(name)
    }
    return { namespace: ns?.[1], schluessel: [...schluessel], form: 'objekt' }
  }

  // ---- Form B: `export type …Key = 'a' | 'b' | …` ----
  const schluessel = new Set()
  for (const m of text.matchAll(/export\s+type\s+\w*Key\s*=([^\n]*(?:\n\s*\|[^\n]*)*)/gu)) {
    for (const k of (m[1] ?? '').matchAll(/'([^']+)'/gu)) if (k[1] !== undefined) schluessel.add(k[1])
  }
  return {
    namespace: ns?.[1],
    schluessel: [...schluessel],
    form: schluessel.size > 0 ? 'union' : 'keine',
  }
}

/** Der Paketname aus einem Pfad unterhalb von node_modules/@deepseek-ai. */
export function paketAus(pfad) {
  const teile = pfad.replace(/\\/gu, '/').split('/')
  const i = teile.lastIndexOf('@deepseek-ai')
  return i >= 0 && teile[i + 1] !== undefined ? teile[i + 1] : '(unbekannt)'
}

/**
 * Die Wörterbücher, die das **Sprach-Plugin selbst** anlegt — und die deshalb in
 * **keiner** `locales.d.ts` stehen.
 *
 * ## Der Fehler, der das nötig machte
 *
 * Der Trichter las nur die 56 `locales.*`-Dateien des Kerns. Gemessen am 14.10.2026:
 *
 * ```
 * Fach 'common' in der Maßlatte:        NEIN
 * 'codeBlock.wrap' kommt in KEINEM Fach vor
 * ```
 *
 * `common` wird im **Bündel** von `dsh-client-locale` registriert
 * (`locale.register(COMMON_NS, { zh, en })`), ebenso `settings.locale`. Und `common` ist
 * genau das **gemeinsame Vokabular**, auf das jede Fläche zurückfällt, wenn ihr eigener
 * Namensraum einen Schlüssel nicht hat. **Die Maßlatte war an der wichtigsten Stelle
 * unvollständig** — aufgefallen ist das erst, als ich sie **benutzen** wollte.
 *
 * ## Warum mit Klammerntiefe und nicht mit einem Muster
 *
 * Die Werte im Bündel sind **minifiziert** und laufen teils über mehrere Zeilen.
 * `/"([^"]+)"\s*:\s*"([^"]*)"/` findet deshalb nicht alle Paare — gemessen: es fand 14,
 * während direkt darüber ein weiterer Schlüssel (`copy.optionsHint`) mit mehrzeiligem Wert
 * stand. Deshalb wird der Objektkörper **bis zur passenden schließenden Klammer** gelesen
 * und darin nach `"schlüssel":` auf der **ersten Ebene** gesucht.
 *
 * @param {string} text - Inhalt des Bündels
 * @returns {Record<string, string[]>} Fach → Schlüssel
 */
export function lesePluginWoerterbuecher(text) {
  const raus = {}
  const fachVon = { en$1: 'common', zh$1: 'common', en: 'settings.locale', zh: 'settings.locale' }
  for (const [variable, fach] of Object.entries(fachVon)) {
    const kopf = new RegExp(`const\\s+${variable.replace('$', '\\$')}\\s*=\\s*\\{`, 'u').exec(text)
    if (kopf === null) continue
    const ab = kopf.index + kopf[0].length
    let tiefe = 1
    let i = ab
    for (; i < text.length && tiefe > 0; i++) {
      const c = text[i]
      if (c === '{') tiefe += 1
      else if (c === '}') tiefe -= 1
    }
    const koerper = text.slice(ab, i - 1)
    // Schlüssel auf der ERSTEN Ebene: `"a.b": …` — Tiefe wird zeilenweise mitgeführt.
    const schluessel = new Set()
    let ebene = 0
    for (const zeile of koerper.split('\n')) {
      const vorher = ebene
      for (const c of zeile) {
        if (c === '{') ebene += 1
        else if (c === '}') ebene -= 1
      }
      if (vorher !== 0) continue
      const m = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/u.exec(zeile)
      const name = m?.[1] ?? m?.[2] ?? m?.[3]
      if (name !== undefined) schluessel.add(name)
    }
    const bisher = new Set(raus[fach] ?? [])
    for (const s of schluessel) bisher.add(s)
    raus[fach] = [...bisher]
  }
  return raus
}

/**
 * **Die Selbstprüfung des Trichters.** In jedem Fach müssen `en` und `zh` **dieselbe**
 * Schlüsselmenge tragen — es sind zwei Sprachen **desselben** Wörterbuchs.
 *
 * ## Warum das nötig war
 *
 * Ich hatte in Runde 70 gemeldet, `settings.locale` habe **1** Schlüssel, und das als
 * **verdächtig** markiert. Nachgeprüft am 14.10.2026:
 *
 * ```
 * en$1 (common):         41 Schlüssel
 * zh$1 (common):         41 Schlüssel     <- gleich
 * en  (settings.locale):  1 Schlüssel     language.title
 * zh  (settings.locale):  1 Schlüssel     <- gleich
 * ```
 *
 * **Der Verdacht war unbegründet** — das Fach trägt wirklich nur `language.title`.
 * Und die Zahlen liefern die Prüfung gleich mit: **weichen `en` und `zh` ab, ist die
 * Extraktion kaputt**, nicht das Wörterbuch. Das ist eine Gegenprobe, die ohne
 * Zusatzaufwand mitläuft — und ein Wächter, dessen Gegenprobe nicht rot werden kann,
 * mißt nichts.
 *
 * @param {string} text - Inhalt des Bündels
 * @returns {Array<{fach: string, nurEn: number, nurZh: number}>} leere Liste = Paarung stimmt
 */
export function pruefeWoerterbuchPaarung(text) {
  const hol = (variable) => {
    const kopf = new RegExp(`const\\s+${variable.replace('$', '\\$')}\\s*=\\s*\\{`, 'u').exec(text)
    if (kopf === null) return null
    const ab = kopf.index + kopf[0].length
    let tiefe = 1
    let i = ab
    for (; i < text.length && tiefe > 0; i++) {
      const c = text[i]
      if (c === '{') tiefe += 1
      else if (c === '}') tiefe -= 1
    }
    const koerper = text.slice(ab, i - 1)
    const raus = new Set()
    let ebene = 0
    for (const zeile of koerper.split('\n')) {
      const vorher = ebene
      for (const c of zeile) {
        if (c === '{') ebene += 1
        else if (c === '}') ebene -= 1
      }
      if (vorher !== 0) continue
      const m = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:/u.exec(zeile)
      const n = m?.[1] ?? m?.[2] ?? m?.[3]
      if (n !== undefined) raus.add(n)
    }
    return raus
  }

  const abweichungen = []
  for (const [fach, enVar, zhVar] of [
    ['common', 'en$1', 'zh$1'],
    ['settings.locale', 'en', 'zh'],
  ]) {
    const en = hol(enVar)
    const zh = hol(zhVar)
    if (en === null || zh === null) continue
    const nurEn = [...en].filter((k) => !zh.has(k)).length
    const nurZh = [...zh].filter((k) => !en.has(k)).length
    if (nurEn > 0 || nurZh > 0) abweichungen.push({ fach, nurEn, nurZh })
  }
  return abweichungen
}

function haupt() {
  const wurzel = process.cwd()
  const iPruefen = process.argv.indexOf('--pruefen')
  const pruefen = iPruefen >= 0 ? (process.argv[iPruefen + 1] ?? null) : null
  const dateien = findeSprachdateien(join(wurzel, KERN))

  const jePaket = new Map()
  const jeNamensraum = new Map()
  const echteNs = new Set()
  const alleSchluessel = new Set()
  const namensraeume = new Map()
  const formen = { objekt: 0, union: 0, keine: 0 }
  for (const d of dateien) {
    let text
    try {
      text = readFileSync(d, 'utf8')
    } catch {
      continue
    }
    const { namespace, schluessel, form } = leseSchluessel(text)
    formen[form] += 1
    const paket = paketAus(relative(wurzel, d))
    if (namespace !== undefined) {
      namensraeume.set(namespace, paket)
      echteNs.add(namespace)
    }
    if (schluessel.length === 0) continue
    // **Die Maßlatte wird JE NAMENSRAUM geführt**, nicht je Paket — denn ein Sprachpaket
    // liefert Wörterbücher je Namensraum, nicht je Paket. Pakete ohne `NS` bekommen ihren
    // Paketnamen als Behelfsnamen; das wird im Bericht sichtbar, weil der Name dann so heißt.
    const ns = namespace ?? paket
    const bisherNs = jeNamensraum.get(ns) ?? new Set()
    for (const s of schluessel) bisherNs.add(s)
    jeNamensraum.set(ns, bisherNs)
    const bisher = jePaket.get(paket) ?? { dateien: 0, schluessel: new Set() }
    bisher.dateien += 1
    for (const s of schluessel) {
      bisher.schluessel.add(s)
      alleSchluessel.add(s)
    }
    jePaket.set(paket, bisher)
  }

  // ---------------------------------------------------------------------------
  // Die Wörterbücher des Sprach-Plugins selbst — sie stehen in KEINER locales.d.ts.
  // ---------------------------------------------------------------------------
  const buendelPfad = join(wurzel, KERN, 'dsh-client-locale', 'lib', 'client.js')
  let ausBuendel = {}
  let buendelText = ''
  try {
    buendelText = readFileSync(buendelPfad, 'utf8')
    ausBuendel = lesePluginWoerterbuecher(buendelText)
  } catch {
    ausBuendel = {}
  }
  let buendelSchluessel = 0
  for (const [fach, schluessel] of Object.entries(ausBuendel)) {
    const bisher = jeNamensraum.get(fach) ?? new Set()
    const vorher = bisher.size
    for (const s of schluessel) {
      bisher.add(s)
      alleSchluessel.add(s)
    }
    jeNamensraum.set(fach, bisher)
    buendelSchluessel += bisher.size - vorher
  }

  console.log('Sprachtrichter — der Umfang des Übersetzungsauftrags')
  console.log(`  Sprachdateien des Kerns gefunden: ${String(dateien.length)}`)
  console.log(`  davon Form A (Objekt):  ${String(formen.objekt)}`)
  console.log(`  davon Form B (Union):   ${String(formen.union)}`)
  console.log(`  ohne erkennbare Schlüssel: ${String(formen.keine)}`)
  console.log(`  Pakete mit Schlüsseln:  ${String(jePaket.size)}`)
  console.log(`  Namensräume echt (NS):  ${String(echteNs.size)}`)
  console.log(`  Fächer insgesamt:       ${String(jeNamensraum.size)}  (die übrigen sind Behelfsnamen aus Paketnamen — Pakete ohne eigenes NS)`)
  console.log(`  davon aus dem BÜNDEL des Sprach-Plugins: ${String(buendelSchluessel)} Schlüssel in ${String(Object.keys(ausBuendel).length)} Fächern`)
  console.log(`    (${Object.keys(ausBuendel).join(', ')}) — sie stehen in KEINER locales.d.ts`)
  // **Die Selbstprüfung**, die ohne Zusatzaufwand mitläuft: en und zh müssen je Fach
  // dieselbe Schlüsselmenge tragen. Weichen sie ab, ist die Extraktion kaputt.
  const abweichungen = pruefeWoerterbuchPaarung(buendelText)
  if (abweichungen.length === 0) {
    console.log('  Selbstprüfung: en und zh tragen in jedem Fach dieselbe Schlüsselmenge — grün')
  } else {
    console.log('  SELBSTPRÜFUNG ROT — die Extraktion ist zweifelhaft:')
    for (const a of abweichungen) {
      console.log(`    ${a.fach}: ${String(a.nurEn)} nur in en, ${String(a.nurZh)} nur in zh`)
    }
    console.log('    Ein Wörterbuch hat in beiden Sprachen dieselben Schlüssel. Eine Abweichung')
    console.log('    heißt: der Trichter liest falsch. Seine Zahlen sind dann NICHT zu brauchen.')
  }
  console.log('')
  console.log(`  **Die Zahl, auf die es ankommt, ist die der FÄCHER: ${String(jeNamensraum.size)}.** Ein Sprachpaket`)
  console.log('  liefert Wörterbücher je Namensraum; ein Paket ohne `NS` bildet einen eigenen.')
  console.log('  Und: gleichlautende Schlüssel in verschiedenen Fächern zählen je Fach — deshalb')
  console.log(`  ist die Summe der Fächer (${String([...jeNamensraum.values()].reduce((s, set) => s + set.size, 0))}) größer als die Zahl`)
  console.log(`  VERSCHIEDENER Schlüssel (${String(alleSchluessel.size)}). Beide Zahlen stehen hier, weil beide stimmen.`)
  console.log('')
  console.log('== Je Paket (die größten zuerst) ==')
  const sortiert = [...jePaket.entries()].sort((a, b) => b[1].schluessel.size - a[1].schluessel.size)
  for (const [paket, info] of sortiert.slice(0, 20)) {
    console.log(`  ${String(info.schluessel.size).padStart(5)}  ${paket}`)
  }
  if (sortiert.length > 20) console.log(`  … und ${String(sortiert.length - 20)} weitere Pakete`)
  console.log('')
  console.log('== Die Namensräume ==')
  for (const [ns, paket] of [...namensraeume.entries()].sort()) {
    console.log(`  ${ns.padEnd(28)} ${paket}`)
  }
  console.log('')
  console.log('== Der Umfang ==')
  console.log(`  Schlüssel VERSCHIEDEN (über alle Fächer): ${String(alleSchluessel.size)}`)
  // **Über die FÄCHER summieren, nicht über die Pakete.** Hier stand `sortiert` — die
  // Paketliste. Die Wörterbücher aus dem BÜNDEL des Sprach-Plugins gehören zu keinem Paket
  // und fehlten damit in der Summe: sie zeigte 1744, während die Fächer 1786 trugen.
  console.log(`  Schlüssel-Nennungen (mit Doppelungen):    ${String([...jeNamensraum.values()].reduce((s, set) => s + set.size, 0))}`)
  console.log('')
  console.log('  UNTERGRENZE: verschachtelte Wörterbücher zählen als EIN Schlüssel. Die')
  console.log('  wirkliche Zahl kann höher sein.')

  // ---------------------------------------------------------------------------
  // `--umfang` schreibt den gemessenen Umfang als JSON — die Vergleichsmaßlatte
  // für `--pruefen`. **Gemessenes wird festgehalten, nicht erinnert.**
  // ---------------------------------------------------------------------------
  if (pruefen === null && process.argv.includes('--umfang')) {
    const ziel = 'docs/status/sprachumfang.json'
    const inhalt = {
      gemessenAm: new Date().toISOString(),
      sprachdateien: dateien.length,
      formen,
      namensraeume: Object.fromEntries(
        [...jeNamensraum.entries()].sort().map(([ns, s]) => [ns, [...s].sort()]),
      ),
    }
    writeFileSync(join(wurzel, ziel), `${JSON.stringify(inhalt, null, 2)}\n`, 'utf8')
    console.log('')
    console.log(`Umfang geschrieben: ${ziel}`)
    console.log(`  Namensräume: ${String(jeNamensraum.size)}   Schlüssel: ${String([...alleSchluessel].length)}`)
    process.exitCode = 0
    return
  }

  // ---------------------------------------------------------------------------
  // `--pruefen <datei>` vergleicht ein Sprachpaket gegen den Umfang.
  // ---------------------------------------------------------------------------
  if (pruefen !== null) {
    let paket
    try {
      paket = JSON.parse(readFileSync(pruefen, 'utf8'))
    } catch (f) {
      console.log('')
      console.log(`ABBRUCH: das Sprachpaket ist nicht lesbar: ${pruefen}`)
      console.log(`  ${f instanceof Error ? f.message : String(f)}`)
      process.exitCode = 2
      return
    }
    const umfangPfad = join(wurzel, 'docs/status/sprachumfang.json')
    let umfang
    try {
      umfang = JSON.parse(readFileSync(umfangPfad, 'utf8'))
    } catch {
      console.log('')
      console.log(`ABBRUCH: keine Vergleichsmaßlatte: docs/status/sprachumfang.json fehlt.`)
      console.log('  Anlegen mit:  bun scripts/sprachtrichter.mjs --umfang')
      process.exitCode = 2
      return
    }

    console.log('')
    console.log(`== Vollständigkeit: ${pruefen}`)
    let fehlendGesamt = 0
    let vorhandenGesamt = 0
    let umfangGesamt = 0
    for (const [ns, schluessel] of Object.entries(umfang.namensraeume)) {
      const haben = paket[ns] ?? {}
      const fehlend = schluessel.filter((s) => haben[s] === undefined)
      umfangGesamt += schluessel.length
      vorhandenGesamt += schluessel.length - fehlend.length
      fehlendGesamt += fehlend.length
      const quote = schluessel.length === 0 ? 100 : Math.round(((schluessel.length - fehlend.length) / schluessel.length) * 100)
      const marke = fehlend.length === 0 ? 'VOLLSTÄNDIG' : `${String(quote)} %`
      console.log(`  ${ns.padEnd(26)} ${String(schluessel.length - fehlend.length).padStart(4)}/${String(schluessel.length).padStart(4)}  ${marke}`)
      if (fehlend.length > 0 && fehlend.length <= 4) {
        for (const f of fehlend) console.log(`        fehlt: ${f}`)
      } else if (fehlend.length > 4) {
        for (const f of fehlend.slice(0, 2)) console.log(`        fehlt u. a.: ${f}`)
        console.log(`        … und ${String(fehlend.length - 2)} weitere`)
      }
    }
    // Namensräume, die das Paket führt und der Umfang nicht kennt — auch ein Befund.
    const unbekannt = Object.keys(paket).filter((ns) => umfang.namensraeume[ns] === undefined)
    console.log('')
    console.log(`  zusammen: ${String(vorhandenGesamt)} von ${String(umfangGesamt)} Schlüsseln`)
    if (unbekannt.length > 0) {
      console.log(`  Namensräume im Paket, die der Kern NICHT kennt: ${unbekannt.join(', ')}`)
    }
    console.log('')
    if (fehlendGesamt === 0 && unbekannt.length === 0) {
      console.log('VOLLSTÄNDIG: jeder Schlüssel des Kerns ist übersetzt.')
      process.exitCode = 0
    } else {
      console.log(`UNVOLLSTÄNDIG: ${String(fehlendGesamt)} Schlüssel fehlen.`)
      console.log('Das ist kein Fehler des Pakets, sondern sein STAND — die Zahl nennt ihn.')
      process.exitCode = 1
    }
    return
  }

  process.exitCode = 0
}

if (import.meta.main === true) haupt()
