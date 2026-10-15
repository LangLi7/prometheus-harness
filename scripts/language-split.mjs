/**
 * Werkszeug: **den Übersetzungsauftrag in Teile schneiden und wieder zusammensetzen.**
 *
 * ## Warum es das gibt
 *
 * 2374 englische Texte in 56 Namensräumen sind zu viel für einen Durchgang. Sie werden
 * deshalb aufgeteilt. Eine Aufteilung von Hand ist aber genau die Stelle, an der still
 * Schlüssel verschwinden: der eine Teil zählt 300, der andere 298, und niemand merkt, welche
 * zwei fehlen.
 *
 * Deshalb rechnet dieses Werkszeug die Aufteilung **und** die Vereinigung:
 *
 * ```powershell
 * bun scripts/language-split.mjs --schreiben      # Teile anlegen + Aufteilung.json
 * bun scripts/language-split.mjs --vereinigen     # Teile zu de.json zusammensetzen
 * bun scripts/language-split.mjs --nachsehen      # nur prüfen, was fehlt (ohne Schreiben)
 * ```
 *
 * Die Vereinigung prüft **jeden** Schlüssel der Quelle gegen die Teile und nennt fehlende
 * beim Namen. Sie schreibt nur, wenn **nichts** fehlt.
 *
 * @module scripts/language-split
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const QUELLE = 'docs/status/sprachquelle.json'
const ORDNER = 'docs/status/uebersetzung'
const ZIEL = 'packages/client/locale/de.json'
/** Zielgröße eines Teils in Schlüsseln — klein genug für einen Durchgang, groß genug für wenige Teile. */
const PORTION = 300

/**
 * Die größten Fächer zuerst, dann gierig füllen. `common` bleibt außen vor: es ist bereits
 * vollständig (41 von 41) und dient als grüne Vorlage der Prüfung.
 *
 * @param {Record<string, {paket: string, englisch: Record<string, string>}>} faecher
 * @returns {{namen: string[], schluessel: number}[][]}
 */
export function teile(faecher) {
  const eintraege = Object.entries(faecher)
    .filter(([ns]) => ns !== 'common')
    .sort((a, b) => Object.keys(b[1].englisch).length - Object.keys(a[1].englisch).length || a[0].localeCompare(b[0]))
  const raus = []
  let aktuell = []
  let zaehler = 0
  for (const [ns, f] of eintraege) {
    const anzahl = Object.keys(f.englisch).length
    if (zaehler > 0 && zaehler + anzahl > PORTION) {
      raus.push(aktuell)
      aktuell = []
      zaehler = 0
    }
    aktuell.push({ namen: [ns], schluessel: anzahl })
    zaehler += anzahl
  }
  if (aktuell.length > 0) raus.push(aktuell)
  return raus
}

function haupt() {
  const args = process.argv.slice(2)
  const quelle = JSON.parse(readFileSync(QUELLE, 'utf8'))
  const faecher = quelle.faecher
  const gruppen = teile(faecher)

  /** @type {{teil: number, namensraeume: string[], schluessel: number, quelle: string, ziel: string}[]} */
  const aufteilung = gruppen.map((gruppe, i) => ({
    teil: i + 1,
    namensraeume: gruppe.flatMap((g) => g.namen),
    schluessel: gruppe.reduce((s, g) => s + g.schluessel, 0),
    quelle: `${ORDNER}/quelle-${String(i + 1)}.json`,
    ziel: `${ORDNER}/teil-${String(i + 1)}.json`,
  }))

  const gesamt = aufteilung.reduce((s, a) => s + a.schluessel, 0)
  const alleNamen = aufteilung.flatMap((a) => a.namensraeume)
  console.log(`== Teile: ${String(aufteilung.length)}   Schlüssel im Auftrag: ${String(gesamt)}`)
  console.log(`== Namensräume: ${String(alleNamen.length)}   verschiedene: ${String(new Set(alleNamen).size)}`)
  const ohneCommon = Object.keys(faecher).filter((n) => n !== 'common').length
  console.log(`== Gegenprobe: Fächer ohne common = ${String(ohneCommon)}, in Teilen = ${String(new Set(alleNamen).size)} → ${ohneCommon === new Set(alleNamen).size ? 'OK' : 'ABWEICHUNG'}`)
  console.log('')

  if (args.includes('--schreiben')) {
    mkdirSync(ORDNER, { recursive: true })
    for (const a of aufteilung) {
      /** @type {Record<string, {paket: string, englisch: Record<string, string>}>} */
      const inhalt = {}
      for (const ns of a.namensraeume) inhalt[ns] = faecher[ns] ?? { paket: '?', englisch: {} }
      writeFileSync(a.quelle, `${JSON.stringify(inhalt, null, 2)}\n`, 'utf8')
      console.log(`   geschrieben: ${a.quelle}  (${String(a.schluessel)} Texte, ${a.namensraeume.join(', ')})`)
    }
    writeFileSync(`${ORDNER}/aufteilung.json`, `${JSON.stringify({ erzeugt: new Date().toISOString(), portion: PORTION, teile: aufteilung }, null, 2)}\n`, 'utf8')
    console.log('')
    console.log(`Aufteilung geschrieben: ${ORDNER}/aufteilung.json`)
    process.exit(0)
  }

  // ---- Vereinigen oder nachsehen ----
  //
  // **Alle gelieferten Teile zählen, nicht nur die aus der Aufteilung.** Gemessen am
  // 14.10.2026: mit dem Sprachbündel der Vorlage kam ein **neues Fach** dazu (`voice-input`,
  // 109 Texte). Der erste Entwurf las nur die Dateien, die in `aufteilung.json` stehen — das
  // neue Fach hätte keinen Platz gehabt, und die Vereinigung hätte 109 Schlüssel als „fehlend"
  // gemeldet, obwohl die Übersetzung fertig war. Jetzt zählt jede `teil-*.json` im Ordner.
  const teilDateien = existsSync(ORDNER)
    ? readdirSync(ORDNER)
        .filter((n) => /^teil-.*\.json$/u.test(n))
        .sort()
    : []
  const teileInhalt = teilDateien.map((n) => JSON.parse(readFileSync(join(ORDNER, n), 'utf8')))
  const ausserhalbDerAufteilung = teilDateien.filter((n) => !aufteilung.some((a) => a.ziel.endsWith(n)))

  // Vorhandene Übersetzungen werden **übernommen**, nicht weggeworfen. Der erste Entwurf
  // übernahm nur `common` — und hätte damit den bereits richtigen Text von
  // `settings.locale` als „fehlt" gemeldet und das Schreiben verweigert. Die Herkunft wird
  // mitgezählt: „aus Teilen" und „aus der alten Datei" sind verschiedene Aussagen.
  // **Ein leerer Wert ist ein Wert.** Der erste Entwurf verlangte `!== ''` und hätte damit
  // genau die eine Stelle verworfen, die leer sein **muß**
  // (`chat · message.stepProcess.sharedPrefix`): sie wäre als „fehlt" gemeldet worden und das
  // Schreiben hätte sich verweigert. Verworfen wird nur, was **fehlt** (`undefined`).
  const alt = existsSync(ZIEL) ? JSON.parse(readFileSync(ZIEL, 'utf8')) : {}

  const fehlend = []
  let ausTeilen = 0
  let ausAlt = 0
  /** @type {Record<string, Record<string, string>>} */
  const ergebnis = {}
  for (const [ns, f] of Object.entries(faecher)) {
    ergebnis[ns] = {}
    for (const schluessel of Object.keys(f.englisch)) {
      let gefunden
      for (const inhalt of teileInhalt) {
        if (inhalt !== undefined && inhalt[ns] !== undefined && inhalt[ns][schluessel] !== undefined) {
          gefunden = inhalt[ns][schluessel]
          ausTeilen += 1
          break
        }
      }
      if (gefunden === undefined) {
        const altWert = alt[ns]?.[schluessel]
        if (typeof altWert === 'string') {
          gefunden = altWert
          ausAlt += 1
        }
      }
      if (gefunden === undefined) {
        fehlend.push(`${ns} · ${schluessel}`)
        continue
      }
      ergebnis[ns][schluessel] = gefunden
    }
  }
  const uebersetzt = ausTeilen + ausAlt

  console.log(`== übersetzt: ${String(uebersetzt)} von ${String(Object.keys(faecher).reduce((s, n) => s + Object.keys(faecher[n].englisch).length, 0))}`)
  console.log(`   davon aus Teilen: ${String(ausTeilen)}   aus der alten Datei: ${String(ausAlt)}`)
  // **Der Bericht zeigt, was in den GELIEFERTEN Dateien steht — nicht, was die Aufteilung
  // vorhätte.** Gemessen am 14.10.2026: als mit `voice-input` ein Fach dazukam, rechnete dieser
  // Bericht die Aufteilung **neu** (jetzt 10 Teile) und schrieb die neuen Fächergruppen neben
  // die alten Dateinamen — „Teil 6 … settings.models, voice-input", während in `teil-6.json`
  // in Wahrheit `settings.models, settings.account, deliverables` stehen. Die Vereinigung war
  // richtig, der Bericht war falsch. Jetzt werden die Dateien gelesen und ihre Fächer genannt.
  console.log('== Gelieferte Teile ==')
  for (const [i, name] of teilDateien.entries()) {
    const inhalt = teileInhalt[i] ?? {}
    const namen = Object.keys(inhalt)
    const anzahl = namen.reduce((s, ns) => s + Object.keys(inhalt[ns] ?? {}).length, 0)
    const nachzuegler = ausserhalbDerAufteilung.includes(name) ? '   (nach der Aufteilung)' : ''
    console.log(`   ${name.padEnd(18)} ${String(anzahl).padStart(4)} Texte   ${namen.join(', ')}${nachzuegler}`)
  }
  console.log('')
  if (fehlend.length > 0) {
    console.log(`== FEHLEND: ${String(fehlend.length)}`)
    for (const f of fehlend.slice(0, 20)) console.log(`   ${f}`)
    if (fehlend.length > 20) console.log(`   … und ${String(fehlend.length - 20)} weitere`)
  } else {
    console.log('== FEHLEND: nichts — jeder Schlüssel der Quelle ist da.')
  }
  console.log('')

  if (args.includes('--vereinigen')) {
    if (fehlend.length > 0) {
      console.log(`BEFUND: ${String(fehlend.length)} Schlüssel fehlen — es wird NICHTS geschrieben.`)
      process.exit(2)
    }
    // `_faecher` wird GERECHNET, nicht von Hand gepflegt: je Fach „x von y — VOLLSTÄNDIG".
    const faecherStand = {}
    for (const [ns, f] of Object.entries(faecher)) {
      const soll = Object.keys(f.englisch).length
      const ist = Object.keys(ergebnis[ns] ?? {}).length
      faecherStand[ns] = `${String(ist)} von ${String(soll)}${ist === soll ? ' — VOLLSTÄNDIG' : ''}`
    }
    const inhalt = {
      _hinweis:
        'Sprachpaket Deutsch. Ein Fach je LAUFZEIT-Namensraum (gemessen aus den Registrierungsaufrufen der Kern-Bündel, siehe docs/status/sprachquelle.json). Die Schlüssel sind die des Kerns und dürfen NICHT umbenannt werden. Platzhalter in geschweiften Klammern müssen erhalten bleiben.',
      _stand: new Date().toISOString().slice(0, 10),
      _faecher: faecherStand,
      _pruefen: 'bun scripts/language-checker.mjs --paket packages/client/locale/de.json',
      ...Object.fromEntries(Object.entries(ergebnis).filter(([, v]) => Object.keys(v).length > 0)),
    }
    writeFileSync(ZIEL, `${JSON.stringify(inhalt, null, 2)}\n`, 'utf8')
    const vollstaendig = Object.values(faecherStand).filter((s) => s.includes('VOLLSTÄNDIG')).length
    console.log(`Geschrieben: ${ZIEL}`)
    console.log(`BEFUND: ${String(uebersetzt)} Texte, ${String(vollstaendig)} von ${String(Object.keys(faecher).length)} Fächern VOLLSTÄNDIG.`)
    process.exit(0)
  }
  process.exit(fehlend.length > 0 ? 1 : 0)
}

if (import.meta.main === true) haupt()
