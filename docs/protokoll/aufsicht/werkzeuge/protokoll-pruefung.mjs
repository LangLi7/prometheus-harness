/**
 * protokoll-pruefung.mjs — Wächter-Werkzeug (Aufsicht): prüft das **eigene** Protokoll.
 *
 * WARUM. Am 13.10.2026 zählte meine Regel W30 „B-Zeilen der Offen-Tabelle" **22** statt 16 — weil sie
 * jede Zeile zählte, die mit einem B-Label beginnt, und die Tabellen **in meinen Berichten** mitzählte.
 * Ein Instrument, das nicht sagt, **was** es gemessen hat, hat den falschen Wert geliefert. Genau der
 * Fehler, den diese Rolle bei anderen sucht.
 *
 * Dieses Werkzeug prüft deshalb **vier Dinge**, die zusammen stimmen müssen:
 *
 *   1. Die Offen-Tabelle nennt jede Befundnummer **genau einmal** und **aufsteigend**.
 *   2. Zu jeder Nummer in der Tabelle gibt es einen **Abschnitt** in `befunde.md` — und umgekehrt.
 *   3. `protokoll.jsonl` ist **zeilenweise gültiges JSON** (append-only heißt: nie eine kaputte Zeile).
 *   4. Jede Datei des Ordners ist **versioniert** — ein nicht versioniertes Protokoll ist nicht
 *      nachprüfbar.
 *
 * Aufruf:  node protokoll-pruefung.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const ORDNER = join(HIER, '..')
const REPO = join(ORDNER, '..', '..', '..')

const lies = (pfad) => readFileSync(pfad, 'utf8')
let fehler = 0
const melde = (ok, text) => {
  console.log(`  ${ok ? 'ok    ' : 'FEHLER'}  ${text}`)
  if (!ok) fehler += 1
}

console.log('=== Prüfung des eigenen Protokolls ===\n')

/** 1. Die Offen-Tabelle */
const protokoll = lies(join(ORDNER, 'protokoll.md')).split(/\r?\n/)
const start = protokoll.findIndex((zeile) => zeile.startsWith('## Offen'))
if (start === -1) {
  melde(false, 'der Abschnitt „## Offen / nächster Takt" fehlt in protokoll.md')
} else {
  const zeilen = protokoll.slice(start).filter((zeile) => /^\| \*\*B\d+\*\*/.test(zeile))
  const nummern = zeilen.map((zeile) => Number((zeile.match(/\*\*B(\d+)\*\*/) ?? [])[1]))
  const eindeutig = new Set(nummern).size === nummern.length
  const aufsteigend = nummern.every((n, i) => i === 0 || nummern[i - 1] < n)
  melde(zeilen.length > 0, `Offen-Tabelle: ${zeilen.length} Befundzeilen (${nummern.join(', ')})`)
  melde(eindeutig, 'jede Nummer genau einmal')
  melde(aufsteigend, 'aufsteigend sortiert')

  /** 2. Gegenprobe gegen befunde.md */
  const befunde = lies(join(ORDNER, 'befunde.md'))
  const imText = [...befunde.matchAll(/^## (B\d+) —/gm)].map((treffer) => Number(treffer[1].slice(1)))
  const fehlendeAbschnitte = nummern.filter((n) => !imText.includes(n))
  const fehlendeZeilen = imText.filter((n) => !nummern.includes(n))
  melde(fehlendeAbschnitte.length === 0, `Befundabschnitte in befunde.md vorhanden${fehlendeAbschnitte.length > 0 ? ` — fehlt: ${fehlendeAbschnitte.join(', ')}` : ''}`)
  melde(fehlendeZeilen.length === 0, `kein Abschnitt ohne Tabellenzeile${fehlendeZeilen.length > 0 ? ` — ohne Zeile: ${fehlendeZeilen.join(', ')}` : ''}`)
}

/** 3. Die JSONL-Datei */
const jsonlPfad = join(ORDNER, 'protokoll.jsonl')
const jsonlZeilen = lies(jsonlPfad).trim().split(/\r?\n/)
let kaputt = 0
for (const [index, zeile] of jsonlZeilen.entries()) {
  try {
    JSON.parse(zeile)
  } catch {
    kaputt += 1
    console.log(`         Zeile ${index + 1} ist kein gültiges JSON`)
  }
}
melde(kaputt === 0, `protokoll.jsonl: ${jsonlZeilen.length} Zeilen, ${kaputt} ungültig`)

/** 4. Versionierung */
const alle = []
const sammle = (pfad) => {
  for (const eintrag of readdirSync(pfad, { withFileTypes: true })) {
    const voll = join(pfad, eintrag.name)
    if (eintrag.isDirectory()) sammle(voll)
    else alle.push(voll)
  }
}
sammle(ORDNER)
const relativ = (pfad) => pfad.replace(REPO, '').replace(/\\/g, '/').replace(/^\//, '')
let nichtVersioniert = []
try {
  const versioniert = new Set(
    execFileSync('git', ['ls-files', 'docs/protokoll'], { cwd: REPO, encoding: 'utf8' }).split('\n').map((z) => z.trim()),
  )
  nichtVersioniert = alle.map(relativ).filter((pfad) => !versioniert.has(pfad))
} catch (error) {
  melde(false, `git ls-files nicht ausführbar: ${error.message}`)
}
melde(
  nichtVersioniert.length === 0,
  `Versionierung: ${alle.length - nichtVersioniert.length}/${alle.length} Dateien verfolgt` +
    (nichtVersioniert.length > 0 ? ` — offen: ${nichtVersioniert.join(', ')}` : ''),
)

console.log(`\nGesamtgröße der Spur: ${(alle.reduce((summe, pfad) => summe + statSync(pfad).size, 0) / 1024).toFixed(0)} KB in ${alle.length} Dateien`)
console.log(fehler === 0 ? 'ERGEBNIS: das Protokoll ist in sich stimmig.' : `ERGEBNIS: ${fehler} Abweichung(en) — siehe oben.`)
process.exit(fehler === 0 ? 0 : 1)
