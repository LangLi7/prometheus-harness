/**
 * Meßsonde: **ist das deutsche Sprachpaket komponiert — und wird es ausgeliefert?**
 *
 * ## Die vier Stufen, jede einzeln gemessen
 *
 * Der Kern kennt vier Stufen (Arbeitsweise Regel 2): *installiert*, *komponiert*, *aktiv*,
 * *wirkt*. Diese Sonde mißt die ersten drei am **lebenden Host** und läßt die vierte dem
 * Browser (ein Bündel, das geladen wird, ist noch kein Beweis, daß deutsche Wörter auf dem
 * Schirm stehen).
 *
 * | Frage | wie gemessen |
 * |---|---|
 * | Steht die Zeile in der Patch-Schicht? | Datei lesen, Zeile suchen |
 * | Steht das Paket in der **Startliste** des Browsers? | `window.__DSH_BOOT__` aus der Seite **parsen** |
 * | Wird das **Bündel** ausgeliefert? | die `url` aus der Startliste holen, Status und Inhalt prüfen |
 * | Ist der **Inhalt** der richtige? | Umschlag, `inject`, deutscher Text |
 *
 * ## Warum geparst und nicht gemustert wird
 *
 * Der erste Versuch suchte `client-locale` im HTML mit `Select-String`. Das **traf** — aber
 * an einer Stelle der Combo-Liste, nicht in der Startliste. Eine Teilzeichenkette in einer
 * 36 kB großen Seite ist kein Nachweis (Arbeitsweise Regel 16). Deshalb wird hier
 * `window.__DSH_BOOT__` als JSON gelesen und der Eintrag **mit id und url** gesucht.
 *
 * ## Gegenprobe (Regel 5)
 *
 * Die Sonde verlangt, daß die Startliste **nicht leer** ist und daß **mindestens ein**
 * bekannter Kern-Eintrag (`@deepseek-ai/dsh-client-locale`) darin steht. Findet sie nichts,
 * ist nicht der Host stumm, sondern die Sonde kaputt — dann endet sie mit 1 und sagt das.
 *
 * ```powershell
 * bun docs/status/messsonden/client-komposition-sonde.mjs --url "http://127.0.0.1:3081/?token=…"
 * ```
 *
 * Der Token wird **nicht ausgegeben** — nur `host:port`.
 *
 * @module docs/status/messsonden/client-komposition-sonde
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Unser Paket, um das es geht. */
const UNSERES = '@prometheus-harness/client-locale'
/** Ein Kern-Eintrag, der in jeder Web-Komposition stehen muß — die Gegenprobe. */
const GEGENPROBE = '@deepseek-ai/dsh-client-locale'
/** Die Patch-Schicht des Profils im Bau-Home. */
const PATCH = join('.pmh-build', 'harness-home', 'profiles', 'web', 'cordis.patch.yml')

/** `host:port` ohne Token — für die Ausgabe. */
function ohneToken(url) {
  try {
    const u = new URL(url)
    return u.host
  } catch {
    return '(unlesbare Adresse)'
  }
}

/**
 * Liest `__DSH_BOOT__` aus dem HTML — **als JSON**, nicht als Zeichenkette.
 *
 * **Zwei Anläufe waren nötig, und beide Fehler waren meine:**
 *
 * 1. Gesucht wurde `window["__DSH_BOOT__"] = `. Gefunden wurde nichts (Index −1), weil der
 *    Host `globalThis[...]` schreibt.
 * 2. Die Startliste steht außerdem **in einem HTML-String** — die Seite trägt sie als
 *    `globalThis[\"__DSH_BOOT__\"] = {…}` mit **Backslashes**. Ein Parser über den rohen Text
 *    hätte die Anführungszeichen als String-Enden gelesen.
 *
 * Deshalb: die Marke ohne Besitzer suchen, das `= {` dahinter nehmen, die Klammern zählen und
 * den Ausschnitt **entschlüsseln**, wenn er maskiert ist. Beide Formen werden gelesen, damit
 * die Sonde nicht an einer Fassung des Hosts hängt.
 *
 * @param {string} html
 * @returns {{entries: {id: string, url: string, rev?: string, inject?: string[]}[]} | undefined}
 */
export function leseStartliste(html) {
  const marke = html.indexOf('__DSH_BOOT__')
  if (marke < 0) return undefined
  const gleich = html.indexOf('= {', marke)
  if (gleich < 0) return undefined
  const ab = gleich + 2
  let tiefe = 0
  let ende = -1
  for (let j = ab; j < html.length; j++) {
    const c = html[j]
    if (c === '{') tiefe += 1
    else if (c === '}') {
      tiefe -= 1
      if (tiefe === 0) {
        ende = j
        break
      }
    }
  }
  if (ende < 0) return undefined
  const roh = html.slice(ab, ende + 1)
  // Maskiert? Dann als JSON-Zeichenkette entschlüsseln.
  const text = roh.includes('\\"') ? JSON.parse(`"${roh}"`) : roh
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Eine Sitzung mit Cookie.
 *
 * **Der erste Anlauf scheiterte an HTTP 401** — und der Grund ist eine Eigenheit, die man
 * kennen muß: der Host tauscht den Token gegen ein **Cookie** ein (Weiterleitung), und
 * `fetch` in Bun behält bei einer Weiterleitung **kein** `set-cookie`. `Invoke-WebRequest`
 * tat es, deshalb sah es dort nach 200 aus. Hier wird der Keks von Hand mitgeführt; die
 * Weiterleitung wird ausdrücklich **nicht** automatisch verfolgt (`redirect: 'manual'`).
 *
 * @returns {{hole: (ziel: string) => Promise<{status: number, text: string, typ: string}>}}
 */
function sitzung() {
  let keks = ''
  return {
    async hole(ziel) {
      const hole1 = async (adresse) =>
        fetch(adresse, { redirect: 'manual', headers: keks.length > 0 ? { cookie: keks } : {} })
      let r = await hole1(ziel)
      const neu = r.headers.getSetCookie?.() ?? []
      if (neu.length > 0) keks = neu.map((c) => c.split(';')[0] ?? c).join('; ')
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const ort = r.headers.get('location')
        if (ort !== null && ort.length > 0) r = await hole1(new URL(ort, ziel).toString())
      }
      return { status: r.status, text: await r.text(), typ: r.headers.get('content-type') ?? '' }
    },
  }
}

async function haupt() {
  const args = process.argv.slice(2)
  const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : undefined
  const fehler = []

  if (url === undefined) {
    console.log('Aufruf: bun docs/status/messsonden/client-komposition-sonde.mjs --url "http://127.0.0.1:<port>/?token=…"')
    process.exit(2)
  }
  const basis = new URL(url)
  console.log(`== Host: ${ohneToken(url)}`)
  console.log('')

  // ---- 1. Die Patch-Schicht ----
  console.log('== 1. Patch-Schicht des Profils ==')
  if (!existsSync(PATCH)) {
    fehler.push(`Die Patch-Datei fehlt: ${PATCH} — der Host wurde noch nie aus diesem Baum gestartet.`)
    console.log(`   FEHLT: ${PATCH}`)
  } else {
    const text = readFileSync(PATCH, 'utf8')
    const drin = text.includes(UNSERES)
    console.log(`   ${PATCH}`)
    console.log(`   ${UNSERES}: ${drin ? 'steht darin' : 'FEHLT'}`)
    if (!drin) fehler.push(`Die Zeile für ${UNSERES} steht nicht in der Patch-Schicht.`)
  }
  console.log('')

  // ---- 2. Die Startliste des Browsers ----
  console.log('== 2. Startliste des Browsers (window.__DSH_BOOT__) ==')
  const s = sitzung()
  let seite
  try {
    // Zuerst die Token-Adresse: sie setzt das Cookie und leitet auf die Seite um.
    seite = await s.hole(url)
  } catch (f) {
    console.log(`   ABBRUCH: die Seite ist nicht erreichbar — ${f instanceof Error ? f.message : String(f)}`)
    process.exit(2)
  }
  if (seite.status === 401) {
    console.log('   ABBRUCH: HTTP 401 — der Token fehlt oder ist abgelaufen.')
    console.log('   Das ist ein Befund über den AUFRUF (Vorbedingung), nicht über die Komposition.')
    process.exit(2)
  }
  console.log(`   Seite: HTTP ${String(seite.status)}, ${String(seite.text.length)} Zeichen`)
  const liste = leseStartliste(seite.text)
  if (liste === undefined) {
    console.log('   ABBRUCH: `window.__DSH_BOOT__` ließ sich nicht als JSON lesen.')
    console.log('   Das ist ein Befund über die SONDE, nicht über die Komposition.')
    process.exit(1)
  }
  const eintraege = liste.entries ?? []
  console.log(`   Einträge: ${String(eintraege.length)}   Revision: ${String(liste.rev)}`)

  // ---- Gegenprobe: die Liste darf nicht leer sein und muß den Kern führen ----
  if (eintraege.length === 0) {
    console.log('   ABBRUCH: leere Startliste — die Sonde hat nichts zu prüfen.')
    process.exit(1)
  }
  const hatGegenprobe = eintraege.some((e) => e.id === GEGENPROBE)
  console.log(`   Gegenprobe ${GEGENPROBE}: ${hatGegenprobe ? 'gefunden' : 'FEHLT'}`)
  if (!hatGegenprobe) {
    console.log('   ABBRUCH: die Gegenprobe fehlt — die Auswertung ist verdächtig, kein Kompositionsbefund.')
    process.exit(1)
  }
  console.log('')

  const unser = eintraege.find((e) => e.id === UNSERES)
  if (unser === undefined) {
    fehler.push(`${UNSERES} steht NICHT in der Startliste des Browsers.`)
    console.log(`   ${UNSERES}: NICHT in der Startliste`)
  } else {
    console.log(`   ${UNSERES}:`)
    console.log(`      url    : ${unser.url}`)
    console.log(`      inject : ${JSON.stringify(unser.inject ?? [])}`)
    if (!(unser.inject ?? []).includes(GEGENPROBE)) {
      fehler.push(`Der Eintrag nennt ${GEGENPROBE} nicht in \`inject\` — die Ladereihenfolge ist damit nicht belegt.`)
    }
  }
  console.log('')

  // ---- 3. Das Bündel selbst ----
  console.log('== 3. Das ausgelieferte Bündel ==')
  if (unser !== undefined) {
    const bundUrl = new URL(unser.url, basis).toString()
    let bund
    try {
      bund = await s.hole(bundUrl)
    } catch (f) {
      fehler.push(`Das Bündel ist nicht abrufbar: ${f instanceof Error ? f.message : String(f)}`)
      bund = undefined
    }
    if (bund !== undefined) {
      console.log(`   HTTP ${String(bund.status)}  ${String(bund.text.length)} Zeichen  ${bund.typ}`)
      if (bund.status !== 200) fehler.push(`Das Bündel antwortet mit HTTP ${String(bund.status)}.`)
      const pruefungen = [
        ['Umschlag `__ModuleLoader__.load`', bund.text.includes('__ModuleLoader__.load(')],
        ['Kennung im Bündel', bund.text.includes(UNSERES)],
        ['`inject` vorhanden', /inject/.test(bund.text)],
        ['deutscher Text („Sitzung")', bund.text.includes('Sitzung')],
        ['Rückfall auf `en`', /"en"/.test(bund.text)],
      ]
      for (const [was, ok] of pruefungen) {
        console.log(`   ${ok ? 'ok  ' : 'FEHLT'} ${was}`)
        if (!ok) fehler.push(`Im ausgelieferten Bündel fehlt: ${was}`)
      }
    }
  }
  console.log('')

  if (fehler.length > 0) {
    console.log(`BEFUND: ${String(fehler.length)} Punkt(e) offen — das Sprachpaket ist NICHT vollständig komponiert:`)
    for (const f of fehler) console.log(`   ${f}`)
    process.exit(1)
  }
  console.log('BEFUND: Das Sprachpaket ist komponiert (Patch-Zeile, Startliste, ausgeliefertes Bündel).')
  console.log('NICHT gemessen: ob der Browser deutsche Wörter anzeigt — das ist Stufe „wirkt".')
  process.exit(0)
}

if (import.meta.main === true) await haupt()
