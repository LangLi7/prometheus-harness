/**
 * Meßsonde: **Startkosten** — im Prozeß gemessen, nicht von außen abgetastet.
 *
 * ## Warum diese Sonde existiert
 *
 * Der erste Versuch tastete den Kindprozeß von außen ab: alle **15 ms**
 * `WorkingSet64` lesen. Bei Prozessen von **70–120 ms** ist das zu grob — die
 * Spitze wird **verfehlt**, und ein einzelner Wert kann **unter** dem Grundwert
 * liegen. Genau das trat ein: „unser Speicherpaket" zeigte **14,8 MB**, „bun allein"
 * **24,2 MB**. Unplausibel, und **kein** Fehler im Import (nachgesehen: 23 Exporte,
 * stderr leer) — sondern **Rauschen meiner Methode**.
 *
 * **Die Antwort ist nicht eine zweite Abtastung, sondern eine Messung im Prozeß.**
 * Das Kind mißt sich **selbst** (`process.hrtime.bigint()`, `process.memoryUsage()`)
 * und schreibt **eine** JSON-Zeile. Der Elternprozeß sammelt nur ein.
 *
 * ## Was gemessen wird
 *
 * | Größe | Wie |
 * |---|---|
 * | **Importzeit** | `hrtime` um den `await import(...)` — das ist die **echte** Ladezeit |
 * | **RSS nach dem Laden** | `process.memoryUsage().rss` — der Speicher **nach** dem Import, kein Abtastwert |
 * | **Heap benutzt** | `process.memoryUsage().heapUsed` |
 *
 * **Kein Server, keine Datenbank, kein Modell.** Die Sonde lädt nur.
 *
 * @module docs/status/messsonden/startkosten
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Was geladen wird — von nichts bis zum Kern. */
export const ZIELE = [
  { name: 'nichts (nur der Laufzeitstart)', modul: undefined },
  { name: 'node:crypto', modul: 'node:crypto' },
  { name: 'postgres (SQL-Treiber)', modul: 'postgres' },
  { name: 'unser Speicherpaket', modul: './packages/auth/store-postgres/src/index.ts' },
  { name: 'Kern: Modellschicht', modul: '@deepseek-ai/dsh-llm' },
  { name: 'Kern: App-Boot', modul: '@deepseek-ai/dsh-app-boot' },
]

/** Der Quelltext, den das Kind ausführt — es mißt sich **selbst**. */
function kind(modul) {
  const laden =
    modul === undefined
      ? 'const t0 = process.hrtime.bigint()'
      : `const t0 = process.hrtime.bigint()\nawait import(${JSON.stringify(modul)})\nconst t1 = process.hrtime.bigint()`
  const dauer = modul === undefined ? '0n' : 't1 - t0'
  return `${laden}
const ms = Number(${dauer}) / 1e6
const m = process.memoryUsage()
process.stdout.write(JSON.stringify({ ms: Math.round(ms * 100) / 100, rss: m.rss, heap: m.heapUsed }) + '\\n')
process.exit(0)
`
}

const hier = process.cwd()
const bun = process.execPath
// **Das Kindskript liegt IM PROJEKT, nicht in einem Wegwerfordner.** Der erste
// Versuch schrieb es nach `%TEMP%` — und dort findet Bun **weder** `postgres`
// **noch** `./packages/...` **noch** `@deepseek-ai/...`: die Auflösung hängt am
// Verzeichnis. Gemessen wurde damit **nur** `node:crypto`; vier von sechs Zielen
// scheiterten, und die Sonde meldete trotzdem **Exit 0**. Genau die Sorte grün, die
// nichts bedeutet.
const skript = join(hier, '.pmh-startkosten-kind.mjs')

console.log(`Bun    ${bun}`)
console.log(`Ziele  ${String(ZIELE.length)}`)
console.log('')
console.log('  ' + 'Ziel'.padEnd(34) + 'Import'.padStart(9) + 'RSS'.padStart(10) + 'Heap'.padStart(10))

const ergebnisse = []
try {
  for (const ziel of ZIELE) {
    writeFileSync(skript, kind(ziel.modul), 'utf8')
    const r = spawnSync(bun, [skript], { cwd: hier, encoding: 'utf8', timeout: 60_000 })
    const zeile = (r.stdout ?? '').trim().split('\n').filter((z) => z.startsWith('{')).pop()
    if (zeile === undefined) {
      // **Ein Ziel, das sich nicht laden läßt, wird BENANNT** — nicht als 0 gezählt.
      console.log('  ' + ziel.name.padEnd(34) + 'NICHT GELADEN')
      // **Hier stand ein Filter über stderr — und ich habe ihn zuerst FALSCH
      // begründet.** Die Zeile lautete `filter((z) => !z.includes('[pmh]'))` und
      // zeigte die erste Zeile OHNE Vorladungspräfix. Ich hielt das für stumm:
      // „sind alle Zeilen `[pmh]`, steht unter NICHT GELADEN nichts".
      //
      // **Gemessen am 14.10.2026 — und damit widerlegt.** Ein echter Ladefehler
      // liefert sehr wohl Zeilen ohne das Präfix:
      //
      //   [pmh] Bun-Lücke ergänzt: PTC-Typentfernung …
      //   [pmh] Bun-Lücke ergänzt: Subprozess-argv …
      //   error: Cannot find package 'es-gibt-mich-nicht-xyz' from '…'
      //   Bun v1.4.0 (Windows x64)
      //
      // Der alte Filter zeigte also `error: Cannot find package …` — den Grund. Er
      // war NICHT stumm. Die Änderung bleibt, aber als **Verbesserung**, nicht als
      // Reparatur eines belegten Defekts: gezeigt werden jetzt bis zu sechs Zeilen
      // statt einer, und die Vorladungszeilen sind **gekennzeichnet statt entfernt**.
      //
      // Die Lehre, die bleibt: ich habe aus dem **Lesen** des Codes auf einen Defekt
      // geschlossen, ohne ihn zu messen. Ein Codebild ist kein Befund.
      const stderrZeilen = (r.stderr ?? '')
        .trim()
        .split('\n')
        .filter((z) => z.trim() !== '')
      if (stderrZeilen.length === 0) {
        console.log('      (stderr ist LEER — kein Anhaltspunkt vom Kind)')
      } else {
        for (const z of stderrZeilen.slice(0, 6)) {
          const marke = z.includes('[pmh]') ? '   [Vorladung]' : ''
          console.log('      ' + z.slice(0, 150) + marke)
        }
        if (stderrZeilen.length > 6) {
          console.log(`      … und ${String(stderrZeilen.length - 6)} weitere Zeilen`)
        }
      }
      continue
    }
    const w = JSON.parse(zeile)
    ergebnisse.push({ name: ziel.name, ...w })
    console.log(
      '  ' +
        ziel.name.padEnd(34) +
        `${String(w.ms)} ms`.padStart(9) +
        `${String(Math.round(w.rss / 1048576))} MB`.padStart(10) +
        `${String(Math.round(w.heap / 1048576))} MB`.padStart(10),
    )
  }
} finally {
  rmSync(skript, { force: true })
}

console.log('')
// **Ein Ziel, das nicht geladen wurde, ist ein Fehler — kein fehlender Wert.**
// Der erste Lauf meldete bei vier von sechs gescheiterten Zielen trotzdem Exit 0 und
// verglich „nichts" mit `node:crypto`. Eine Sonde, die ihr Ergebnis als Erfolg
// wertet, ist keine Messung.
if (ergebnisse.length < ZIELE.length) {
  console.log(
    `NICHT AUSWERTBAR: ${String(ZIELE.length - ergebnisse.length)} von ${String(ZIELE.length)} Zielen ` +
      'wurden NICHT geladen (siehe oben). Kein Vergleich, keine Zahl.',
  )
  process.exitCode = 2
} else {
  const nach = (name) => ergebnisse.find((e) => e.name.startsWith(name))
  const grund = nach('nichts')
  const kern = nach('Kern: App-Boot')
  if (grund === undefined || kern === undefined) {
    console.log('NICHT AUSWERTBAR: Grundlast oder Kern fehlt.')
    process.exitCode = 2
  } else {
    console.log(
      `Der Start kostet ${String(grund.ms)} ms und ${String(Math.round(grund.rss / 1048576))} MB, ` +
        'bevor IRGENDWAS geladen ist.',
    )
    console.log(
      `Mit dem Kern (App-Boot): ${String(kern.ms)} ms und ${String(Math.round(kern.rss / 1048576))} MB ` +
        `— der Kern legt ${String(Math.round((kern.rss - grund.rss) / 1048576))} MB und ` +
        `${String(Math.round((kern.ms - grund.ms) * 100) / 100)} ms Importzeit drauf.`,
    )
    process.exitCode = 0
  }
}
