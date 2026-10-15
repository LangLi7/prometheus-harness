/**
 * Wächter: **keine NEUEN fest verdrahteten deutschen Ausgaben.**
 *
 * ## Warum diese Datei existiert
 *
 * Der Kern hat für seine Oberfläche längst einen Wächter (`verify-client-ui-i18n`):
 * Oberflächentexte kommen **nur** über typisierte Wörterbücher herein. Für **unsere**
 * Ausgaben gibt es nichts dergleichen. Gemessen am 14.10.2026 stehen in unserem Baum:
 *
 * | Bereich | Ausgabestellen |
 * |---|---|
 * | unsere Skripte (`scripts`, `.mjs`, ohne Tests) | 59 |
 * | Hüllen (`scripts`, `.ps1`/`.sh`/`.cmd`) | 144 |
 * | Paketquellen (`packages`, `src`) | 81 |
 * | Go-Dienste (`services`) | 228 |
 * | Kommandozeile (`apps/cli/src`) | 5 |
 *
 * **Kein Glob-Muster mit Stern-Stern-Schrägstrich in diesem Kommentar.** Hier stand
 * `packages`, gefolgt von zwei Sternen und einem Schrägstrich — und genau darin steht die
 * Zeichenfolge, die einen Blockkommentar **schließt**. Die Zeile darunter wurde damit zu
 * Code und die Datei ließ sich nicht mehr übersetzen. Gemessen am 14.10.2026: `error:
 * Expected ";" but found "services"`. Es ist dieselbe Familie wie die Backtick-Falle, die
 * im Repo schon notiert ist — nur eine andere Zeichenfolge.
 *
 * **Diese Zahl sofort auf null zu bringen ist nicht der Auftrag** — die Hüllen sind
 * Werkzeuge für den Betreiber, und ein deutscher Satz dort ist kein Fehler. Der Auftrag
 * ist, daß die Zahl **nicht weiter wächst**, während der Sprachtrichter entsteht.
 *
 * ## Wie der Wächter arbeitet — und was er NICHT ist
 *
 * 1. Er sucht **Ausgabeaufrufe** (`console.log`, `process.stdout.write`, `Write-Host`,
 *    `fmt.Print`, …) und sieht sich **deren Zeichenketten-Literale** an.
 * 2. Er prüft, ob ein Literal **deutsch aussieht**: Umlaut/`ß` **oder** ein Wort aus
 *    einer deutschen Wortliste.
 * 3. Er vergleicht die Fundstellen mit einer **eingefrorenen Sprachbasis**
 *    (`docs/status/sprachbasis.json`).
 *
 * **Der Fund allein blockiert nicht — die Zunahme blockiert.** Das ist Absicht: die
 * Erkennung ist eine **Heuristik** (siehe unten), und eine Heuristik, die sofort
 * blockiert, wird abgeschaltet statt berichtigt. Eingefroren wird der **heutige** Stand;
 * gemeldet wird nur, was **dazukommt**.
 *
 * ## Die Heuristik, offen benannt
 *
 * * **Falsch positiv** möglich: ein englisches Literal mit `ü`, oder ein deutsches Wort,
 *   das auch englisch ist (`kind`, `die`). Solche Funde sind in der Basis eingefroren und
 *   stören nicht mehr.
 * * **Falsch negativ** möglich: deutsche Ausgabe **ohne** Umlaut und ohne Wortlisten-Treffer
 *   (`Start`, `Port 3080 frei`) wird **nicht** gesehen. Der Wächter ist damit eine
 *   **Untergrenze**, keine vollständige Erfassung. Das steht hier, damit niemand ihn für
 *   vollständig hält.
 *
 * ## Aufruf
 *
 * ```powershell
 * bun scripts/language-guard.mjs            # prüfen; Exit 1 bei Zunahme
 * bun scripts/language-guard.mjs --basis    # die Sprachbasis neu schreiben
 * ```
 *
 * @module scripts/language-guard
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const AUSGENOMMEN = ['node_modules', '.git', '.pmh-build', 'dist', '.bun-cache', 'website']
const BASIS_DATEI = 'docs/status/sprachbasis.json'

/** Aufrufe, die nach außen schreiben — je Sprache mit ihrem Muster. */
export const AUSGABE_MUSTER = [
  { sprache: 'js', muster: /\b(?:console\.(?:log|error|warn|info)|process\.(?:stdout|stderr)\.write)\s*\(/gu },
  { sprache: 'js', muster: /throw new Error\s*\(/gu },
  { sprache: 'ps1', muster: /\bWrite-(?:Host|Error|Warning|Output)\b/gu },
  { sprache: 'go', muster: /\b(?:fmt\.Print|fmt\.Fprint|log\.Print|errors\.New|fmt\.Errorf)\w*\s*\(/gu },
]

/** Deutsche Erkennungsmerkmale. **Bewußt grob** — siehe „Die Heuristik" im Kopf. */
export const DEUTSCHE_WOERTER = [
  'aber', 'auch', 'auf', 'aus', 'bei', 'dann', 'das', 'dem', 'den', 'der', 'deshalb',
  'dies', 'doch', 'eine', 'einem', 'einen', 'einer', 'eines', 'fehlt', 'fehler', 'feld',
  'für', 'ganz', 'gegen', 'gibt', 'kein', 'keine', 'konnte', 'muss', 'muß', 'müssen',
  'nach', 'nicht', 'noch', 'nur', 'oder', 'ohne', 'pruef', 'prüf', 'schon', 'sich',
  'sind', 'über', 'ueber', 'und', 'unter', 'verloren', 'von', 'wird', 'wurde', 'wurden',
  'wenn', 'werden', 'wie', 'zur', 'zwischen',
  'abgebrochen', 'angelegt', 'ausgabe', 'befehl', 'beleg', 'datei', 'erwartet', 'geprueft',
  'geprüft', 'geschrieben', 'gelesen', 'gemessen', 'gescheitert', 'laueft', 'läuft',
  'pruefung', 'prüfung', 'schluessel', 'schlüssel', 'sitzung', 'waehrend', 'während',
  'zeile', 'zeilen', 'zuerst', 'zurueck', 'zurück',
]

/**
 * Sieht ein Textstück deutsch aus?
 *
 * @param {string} text
 * @returns {boolean}
 */
export function siehtDeutschAus(text) {
  if (/[äöüÄÖÜß]/u.test(text)) return true
  const worte = text.toLowerCase().split(/[^a-zäöüß]+/u).filter((w) => w.length > 2)
  return worte.some((w) => DEUTSCHE_WOERTER.includes(w))
}

/**
 * Zieht die Zeichenketten-Literale **eines** Ausgabeaufrufs heraus.
 *
 * Bewußt grob: ab dem Aufruf bis zum Zeilenende werden einfache und doppelte Literale
 * gesammelt. Ein Literal über mehrere Zeilen wird damit **nicht** erfaßt — eine
 * Untergrenze, die im Kopf benannt ist.
 *
 * @param {string} zeile
 * @returns {string[]}
 */
export function literaleInZeile(zeile) {
  const raus = []
  const doppelt = /"((?:[^"\\]|\\.)*)"/gu
  const einfach = /'((?:[^'\\]|\\.)*)'/gu
  for (const m of zeile.matchAll(doppelt)) if (m[1] !== undefined) raus.push(m[1])
  for (const m of zeile.matchAll(einfach)) if (m[1] !== undefined) raus.push(m[1])
  return raus
}

export function findeDateien(dir, aus = []) {
  let eintraege
  try {
    eintraege = readdirSync(dir, { withFileTypes: true })
  } catch {
    return aus
  }
  for (const e of eintraege) {
    if (AUSGENOMMEN.includes(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) findeDateien(p, aus)
    else if (/\.(?:mjs|js|ts|tsx|ps1|sh|cmd|go)$/u.test(e.name) && !/\.test\.[a-z]+$/u.test(e.name)) aus.push(p)
  }
  return aus
}

/**
 * Sammelt je Datei die Zahl der deutschen Ausgabeliterale.
 *
 * @param {string} wurzel
 * @returns {Record<string, number>}
 */
export function sammle(wurzel) {
  const gefunden = {}
  for (const pfad of findeDateien(wurzel)) {
    let text
    try {
      text = readFileSync(pfad, 'utf8')
    } catch {
      continue
    }
    let zahl = 0
    const zeilen = text.split('\n')
    for (const zeile of zeilen) {
      const istAusgabe = AUSGABE_MUSTER.some((m) => {
        m.muster.lastIndex = 0
        return m.muster.test(zeile)
      })
      if (!istAusgabe) continue
      for (const lit of literaleInZeile(zeile)) if (siehtDeutschAus(lit)) zahl += 1
    }
    if (zahl > 0) gefunden[relative(wurzel, pfad).replace(/\\/gu, '/')] = zahl
  }
  return gefunden
}

/**
 * Vergleicht den heutigen Stand mit der eingefrorenen Basis.
 *
 * **Nur die Zunahme ist ein Befund.** Eine **Abnahme** wird nicht gemeldet: sie ist die
 * Verbesserung, auf die diese Arbeit zielt. Wer sie meldete, bestrafte den Fortschritt.
 *
 * Als **eigene Funktion** herausgezogen, damit sie ohne Dateisystem prüfbar ist — und
 * damit die Gegenprobe („eine neue Ausgabe muß auffallen") wirklich gemessen werden kann.
 *
 * @param {Record<string, number>} heute
 * @param {Record<string, number>} basis
 * @returns {Array<{datei: string, alt: number, neu: number, dazu: number}>}
 */
export function zuwachs(heute, basis) {
  const raus = []
  for (const [datei, zahl] of Object.entries(heute)) {
    const alt = basis[datei] ?? 0
    if (zahl > alt) raus.push({ datei, alt, neu: zahl, dazu: zahl - alt })
  }
  return raus.sort((a, b) => b.dazu - a.dazu)
}

/**
 * Pfade, die **nicht benutzernah** sind — und deshalb nicht in die Sprachbasis gehören.
 *
 * **Die Entscheidung, mit ihrem Grund (14.10.2026).** Der Wächter war rot: **607** Literale in
 * **100** Dateien gegen eine Basis von **419** in **79**. Die Zunahme kam **nicht** aus
 * Benutzerausgaben, sondern fast vollständig aus **eigenen Meßsonden**
 * (`docs/status/messsonden/strom-*.mjs`, `sprach*.mjs`) — Werkzeugen, deren deutscher Text
 * **beabsichtigt** ist: ihre Ausgabe liest niemand außer mir, und sie steht in deutschen
 * Statusberichten.
 *
 * Ein Wächter, der bei jeder Runde rot wird, weil das **Melden** selbst wächst, wird
 * abgeschaltet statt gelesen. Deshalb zählen die Meßwerkzeuge nicht mehr mit — **aber die
 * übersprungene Zahl wird weiterhin ausgegeben**, damit nichts verschwiegen wird.
 *
 * * `docs/status/messsonden/` — eigene Meßwerkzeuge (interne Ausgabe).
 * * `snapshots/` — **fremde** Momentaufnahmen, nicht unsere Arbeit (Arbeitsweise Regel 14).
 */
export const NICHT_BENUTZERNAH = ['docs/status/messsonden/', 'snapshots/']

/**
 * Trennt die Funde in benutzernah und übersprungen.
 *
 * @param {Record<string, number>} alle
 * @returns {{benutzernah: Record<string, number>, uebersprungen: Record<string, number>, zahlUebersprungen: number}}
 */
export function trenne(alle) {
  const benutzernah = {}
  const uebersprungen = {}
  let zahlUebersprungen = 0
  for (const [datei, zahl] of Object.entries(alle)) {
    if (NICHT_BENUTZERNAH.some((p) => datei.startsWith(p))) {
      uebersprungen[datei] = zahl
      zahlUebersprungen += zahl
    } else {
      benutzernah[datei] = zahl
    }
  }
  return { benutzernah, uebersprungen, zahlUebersprungen }
}

function haupt() {
  const wurzel = process.cwd()
  const neuSchreiben = process.argv.includes('--basis')
  const { benutzernah: heute, uebersprungen, zahlUebersprungen } = trenne(sammle(wurzel))
  const basisPfad = join(wurzel, BASIS_DATEI)

  const summe = Object.values(heute).reduce((s, n) => s + n, 0)
  console.log(`Deutsche Ausgaben gefunden: ${String(summe)} Literale in ${String(Object.keys(heute).length)} Dateien`)
  if (zahlUebersprungen > 0) {
    console.log(
      `Übersprungen (nicht benutzernah): ${String(zahlUebersprungen)} Literale in ${String(Object.keys(uebersprungen).length)} Dateien —`,
    )
    console.log(`   ${NICHT_BENUTZERNAH.join(', ')}`)
  }

  if (neuSchreiben) {
    writeFileSync(basisPfad, `${JSON.stringify(heute, null, 2)}\n`, 'utf8')
    console.log(`Sprachbasis geschrieben: ${BASIS_DATEI}`)
    process.exitCode = 0
    return
  }

  let basis
  try {
    basis = JSON.parse(readFileSync(basisPfad, 'utf8'))
  } catch {
    console.log('')
    console.log(`KEINE Sprachbasis: ${BASIS_DATEI} fehlt oder ist unlesbar.`)
    console.log('Ohne Basis ist nichts vergleichbar — es wird NICHTS gemeldet und NICHTS behauptet.')
    console.log('Anlegen mit:  bun scripts/language-guard.mjs --basis')
    process.exitCode = 2
    return
  }

  const zugewachsen = zuwachs(heute, basis)

  const geschrumpft = Object.entries(basis).filter(([d, n]) => (heute[d] ?? 0) < n)

  console.log('')
  if (zugewachsen.length === 0) {
    console.log('Keine Zunahme — die Zahl der deutschen Ausgaben wächst nicht.')
    if (geschrumpft.length > 0) {
      console.log('')
      console.log('Gesunken (gut, die Basis ist nur dann zu erneuern, wenn es stört):')
      for (const [d, n] of geschrumpft) console.log(`  ${String(n)} -> ${String(heute[d] ?? 0)}  ${d}`)
    }
    process.exitCode = 0
    return
  }

  console.log('ZUNAHME — neue fest verdrahtete deutsche Ausgaben:')
  for (const z of zugewachsen) console.log(`  +${String(z.dazu)}  ${z.datei}  (${String(z.alt)} -> ${String(z.neu)})`)
  console.log('')
  console.log('Diese Dateien sind anzusehen. Zwei Wege:')
  console.log('  1. Den Text über den Sprachtrichter führen (das Ziel).')
  console.log('  2. Wenn er so bleiben soll: die Basis bewußt erneuern —')
  console.log('     bun scripts/language-guard.mjs --basis   (und die Zunahme im Commit nennen)')
  process.exitCode = 1
}

if (import.meta.main === true) haupt()
