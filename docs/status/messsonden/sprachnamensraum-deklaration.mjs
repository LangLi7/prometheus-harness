/**
 * Meßsonde: **die deklarierte Namensraum-Landkarte des Kerns** — die unabhängige zweite Quelle.
 *
 * ## Warum es diese Sonde gibt
 *
 * `sprachnamensraum-sonde.mjs` mißt die Namensräume an der **Aufrufstelle** in den Bündeln
 * (`locale.register(NS, { zh, en })`). Das ist die Laufzeit-Wahrheit, aber es ist **eine**
 * Quelle. Arbeitsweise Regel 18 verlangt für eine Gegenprobe eine Erwartung, die **woanders**
 * belegt ist.
 *
 * Diese andere Stelle gibt es: der Kern typisiert seine Namensräume. Jedes Paket erweitert
 * eine Schnittstelle:
 *
 * ```ts
 * declare module '@deepseek-ai/dsh-client-locale' {
 *   interface LocaleNamespaceMap {
 *     approval: ApprovalLocaleKey;
 *   }
 * }
 * ```
 *
 * Der zugehörige Vertrag steht in `dsh-client-locale/lib/types/client/index.d.ts:199`:
 *
 * ```ts
 * register<N extends Extract<keyof LocaleNamespaceMap, string>>(ns: N, dicts: …): () => void;
 * ```
 *
 * **Wenn Bundles und Deklarationen dieselbe Menge nennen, ist die Messung zweifach belegt.**
 * Weichen sie ab, ist genau das der Befund — und dann wird **nicht** geraten, welche Seite
 * recht hat, sondern beide werden genannt.
 *
 * ## Abgrenzung
 *
 * Gelesen werden nur **`.d.ts`-Dateien** (nicht die Bündel, die dieselben Texte als
 * `declaration:`-Zeichenketten mitschleppen — sie wären keine zweite Quelle, sondern
 * dieselbe). Die Schnittstelle `LocaleNamespaceMap` **ohne** Rumpf
 * (`export interface LocaleNamespaceMap {\n}`, im Cordis-Client-Runner) ist die
 * Grunddeklaration und trägt nichts bei; sie wird gezählt und gemeldet.
 *
 * @module docs/status/messsonden/sprachnamensraum-deklaration
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { registrierungen } from '../../../scripts/language-source.mjs'

const KERN = 'node_modules/@deepseek-ai'
const QUELLE = 'docs/status/sprachquelle.json'

/**
 * Zieht die Namensräume aus allen `interface LocaleNamespaceMap`-Rümpfen einer Datei.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function namensraeumeAusDeklaration(text) {
  const raus = []
  const muster = /interface\s+LocaleNamespaceMap\s*\{/gu
  for (const m of text.matchAll(muster)) {
    const ab = m.index + m[0].length
    let tiefe = 1
    let i = ab
    for (; i < text.length && tiefe > 0; i++) {
      const c = text[i]
      if (c === '{') tiefe += 1
      else if (c === '}') tiefe -= 1
    }
    const koerper = text.slice(ab, i - 1)
    // Erste Ebene: `approval: ApprovalKey;` / `"settings.plugins": X;`
    let ebene = 0
    for (const zeile of koerper.split('\n')) {
      const vorher = ebene
      for (const c of zeile) {
        if (c === '{') ebene += 1
        else if (c === '}') ebene -= 1
      }
      if (vorher !== 0) continue
      const feld = /^\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*[?:]/u.exec(zeile)
      const name = feld?.[1] ?? feld?.[2] ?? feld?.[3]
      if (name === undefined) continue
      if (name === 'readonly') continue
      if (!raus.includes(name)) raus.push(name)
    }
  }
  return raus
}

function alleDts(wurzel) {
  const raus = []
  const gehe = (dir, tief) => {
    if (tief > 6) return
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
      } else if (e.name.endsWith('.d.ts')) raus.push(p)
    }
  }
  gehe(join(wurzel, KERN), 0)
  return raus
}

function haupt() {
  const wurzel = process.cwd()
  const dateien = alleDts(wurzel)

  /** @type {Map<string, string[]>} */
  const deklariert = new Map()
  let rumpfe = 0
  let leereRumpfe = 0
  for (const d of dateien) {
    let text
    try {
      text = readFileSync(d, 'utf8')
    } catch {
      continue
    }
    if (!text.includes('LocaleNamespaceMap')) continue
    const namen = namensraeumeAusDeklaration(text)
    rumpfe += (text.match(/interface\s+LocaleNamespaceMap\s*\{/gu) ?? []).length
    if (namen.length === 0) leereRumpfe += 1
    const paket = d.replace(/\\/gu, '/').split('/').slice(-4)[0] ?? '?'
    for (const n of namen) {
      if (!deklariert.has(n)) deklariert.set(n, [])
      const liste = deklariert.get(n)
      if (liste !== undefined && !liste.includes(paket)) liste.push(paket)
    }
  }

  console.log(`== .d.ts-Dateien im Kern: ${String(dateien.length)}`)
  console.log(`== Rümpfe von \`LocaleNamespaceMap\`: ${String(rumpfe)}  (davon ohne Felder: ${String(leereRumpfe)})`)
  console.log(`== deklarierte Namensräume: ${String(deklariert.size)}`)
  console.log('')

  // ---- Gegenprobe 1: gibt es überhaupt eine nennenswerte Zahl? ----
  if (deklariert.size < 10) {
    console.log('BEFUND: weniger als 10 deklarierte Namensräume — das ist ein Befund über die SONDE.')
    console.log(`   gefunden: ${[...deklariert.keys()].join(', ')}`)
    process.exit(1)
  }

  if (!existsSync(join(wurzel, QUELLE))) {
    console.log(`Ohne ${QUELLE} kein Vergleich. Anlegen: bun scripts/language-source.mjs --json ${QUELLE}`)
    process.exit(2)
  }
  const quelle = JSON.parse(readFileSync(join(wurzel, QUELLE), 'utf8'))
  const gemessen = new Set(Object.keys(quelle.faecher))

  const nurDeklariert = [...deklariert.keys()].filter((n) => !gemessen.has(n)).sort()
  const nurGemessen = [...gemessen].filter((n) => !deklariert.has(n)).sort()
  const beide = [...gemessen].filter((n) => deklariert.has(n)).length

  console.log(`== Vergleich mit ${QUELLE} (aus den Bündeln gemessen): ${String(gemessen.size)} Namensräume`)
  console.log(`   in BEIDEN Quellen:        ${String(beide)}`)
  console.log(`   nur deklariert:           ${String(nurDeklariert.length)}${nurDeklariert.length === 0 ? '' : ` — ${nurDeklariert.join(', ')}`}`)
  console.log(`   nur im Bündel gemessen:   ${String(nurGemessen.length)}${nurGemessen.length === 0 ? '' : ` — ${nurGemessen.join(', ')}`}`)
  console.log('')

  const gleich = nurDeklariert.length === 0 && nurGemessen.length === 0
  if (gleich) {
    console.log(`BEFUND: Beide Quellen nennen dieselben ${String(gemessen.size)} Namensräume — zweifach belegt.`)
    console.log('   Quelle A: `locale.register(NS, { zh, en })` in `lib/client.js` (Laufzeit).')
    console.log('   Quelle B: `interface LocaleNamespaceMap` in `*.d.ts` (Vertrag).')
    process.exit(0)
  }

  // ---- Der Unterschied hat eine Ursache, und die ist meßbar ----
  //
  // Der Vertrag führt **zwei** Überladungen (`dsh-client-locale/lib/types/client/index.d.ts`):
  //
  //   Zeile 199:  register<N extends keyof LocaleNamespaceMap>(ns: N, dicts: Record<…>)   ← typisiert
  //   Zeile 209:  register(ns: string, locale: string, dict: LocaleDict)                  ← untypisiert
  //
  // Nur die **typisierte** Form verlangt einen Eintrag in `LocaleNamespaceMap`. Ein
  // Namensraum, der über die untypisierte Form angemeldet wird, ist damit **erwartbar**
  // undeklariert. Ob das die Ursache ist, wird nachgesehen — nicht angenommen.
  const formen = new Map()
  for (const paket of readdirSync(join(wurzel, KERN))) {
    const buendel = join(wurzel, KERN, paket, 'lib', 'client.js')
    if (!existsSync(buendel)) continue
    for (const r of registrierungen(readFileSync(buendel, 'utf8'))) {
      if (r.art !== 'register' || formen.has(r.ns)) continue
      formen.set(r.ns, r.rohform)
    }
  }

  console.log('== Ursache je Abweichung (nachgesehen, nicht angenommen):')
  let alleErklaert = nurDeklariert.length === 0
  for (const ns of nurGemessen) {
    const form = formen.get(ns) ?? '(keine Registrierung gefunden)'
    const untypisiert = form.startsWith('Listenform')
    if (!untypisiert) alleErklaert = false
    console.log(
      `   ${ns.padEnd(24)} Anmeldeform: ${form}${untypisiert ? '  → untypisierte Überladung (Zeile 209), Deklaration nicht nötig' : '  → NICHT erklärt'}`,
    )
  }
  for (const ns of nurDeklariert) {
    console.log(`   ${ns.padEnd(24)} deklariert, aber in keinem Bündel registriert — offen`)
  }
  console.log('')

  if (alleErklaert) {
    console.log(
      `BEFUND: ${String(beide)} von ${String(gemessen.size)} Namensräumen sind zweifach belegt; der eine Unterschied ist erklärt (untypisierte Überladung).`,
    )
    process.exit(0)
  }
  console.log('BEFUND: Die Quellen weichen ab, und die Abweichung ist NICHT durch die Anmeldeform erklärt.')
  console.log('Es wird nicht geraten, welche Seite recht hat — beide Mengen stehen oben.')
  process.exit(1)
}

if (import.meta.main === true) haupt()
