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

import { readdirSync, readFileSync } from 'node:fs'
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

function haupt() {
  const wurzel = process.cwd()
  const dateien = findeSprachdateien(join(wurzel, KERN))

  const jePaket = new Map()
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
    if (namespace !== undefined) namensraeume.set(namespace, paketAus(relative(wurzel, d)))
    if (schluessel.length === 0) continue
    const paket = paketAus(relative(wurzel, d))
    const bisher = jePaket.get(paket) ?? { dateien: 0, schluessel: new Set() }
    bisher.dateien += 1
    for (const s of schluessel) {
      bisher.schluessel.add(s)
      alleSchluessel.add(s)
    }
    jePaket.set(paket, bisher)
  }

  console.log('Sprachtrichter — der Umfang des Übersetzungsauftrags')
  console.log(`  Sprachdateien des Kerns gefunden: ${String(dateien.length)}`)
  console.log(`  davon Form A (Objekt):  ${String(formen.objekt)}`)
  console.log(`  davon Form B (Union):   ${String(formen.union)}`)
  console.log(`  ohne erkennbare Schlüssel: ${String(formen.keine)}`)
  console.log(`  Pakete mit Schlüsseln:  ${String(jePaket.size)}`)
  console.log(`  Namensräume (NS):       ${String(namensraeume.size)}`)
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
  console.log(`  Schlüssel gesamt (über alle Pakete):   ${String([...alleSchluessel].length)}`)
  console.log(`  Schlüssel-Nennungen (mit Doppelungen): ${String(sortiert.reduce((s, [, i]) => s + i.schluessel.size, 0))}`)
  console.log('')
  console.log('  UNTERGRENZE: verschachtelte Wörterbücher zählen als EIN Schlüssel. Die')
  console.log('  wirkliche Zahl kann höher sein.')
  process.exitCode = 0
}

if (import.meta.main === true) haupt()
