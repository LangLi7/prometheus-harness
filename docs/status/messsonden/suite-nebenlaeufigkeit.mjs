/**
 * Meßsonde: **laufen Testdateien nebenläufig?**
 *
 * ## Warum diese Sonde existiert
 *
 * `docs/status/suite-flatterigkeit.md` hält einen Verdacht fest: acht Prüfungen
 * kippen zwischen grün und rot, und die Ursache soll sein, daß alle
 * Datenbank-Prüfungen **eine** Datenbank teilen, während
 * `db-schema/tests/postgres.test.ts` **alle Tabellen löscht**. Dann träfe dieser
 * `DROP` andere Prüfungen mitten im Lauf — **aber nur, wenn Dateien nebenläufig
 * ausgeführt werden**.
 *
 * Genau das war **nicht gemessen**. Diese Sonde mißt es, und zwar **ohne** die
 * echte Suite: zwei winzige Testdateien schreiben je einen Anfang und ein Ende in
 * **eine** Protokolldatei, dazwischen warten sie. Aus der **Reihenfolge** der
 * Zeilen folgt die Antwort eindeutig:
 *
 * ```
 * a-start, a-ende, b-start, b-ende    ->  nacheinander
 * a-start, b-start, …                 ->  NEBENLÄUFIG
 * ```
 *
 * ## Warum die Dateien IM Projekt liegen
 *
 * Bun liest `bunfig.toml` (und damit die Vorladung `scripts/bun-gap-preload.mjs`)
 * abhängig vom Ort. Ein Meßaufbau außerhalb des Projekts hätte eine **andere**
 * Umgebung als die echte Suite — und eine Messung, die etwas anderes mißt als das
 * Gemeinte, ist keine. Das Verzeichnis wird danach wieder entfernt.
 *
 * ## Was diese Sonde NICHT sagt
 *
 * Sie sagt **nichts** darüber, ob die echte Suite deshalb flattert. Sie beantwortet
 * **eine** Vorfrage. Der Rest steht in `suite-flatterigkeit.md` §2 als nächster
 * Schritt.
 *
 * @module docs/status/messsonden/suite-nebenlaeufigkeit
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const hier = process.cwd()
const ordner = join(hier, '.pmh-nebenlaeufigkeit-probe')
const protokoll = join(ordner, 'protokoll.txt')
const bun = process.execPath

/**
 * Eine Testdatei, die ihren Anfang, ihr Ende und dazwischen eine Pause protokolliert.
 *
 * **Keine Typangaben.** Diese Datei ist eine `.mjs` und wird als JavaScript
 * ausgeführt; `function testdatei(name: string): string` ist dort ein Syntaxfehler
 * (`Expected ")" but found ":"`). Dieselbe Falle steht in `scripts/migrate.mjs` und
 * in `scripts/reset.test.mjs` beschrieben — und ich bin trotzdem wieder
 * hineingelaufen, weil die Zeichenkette im Rumpf TypeScript ist und die Hand sie
 * mitnimmt.
 *
 * @param name - der Name im Protokoll
 * @param pauseMs - wie lange die Prüfung warten soll
 * @returns den Quelltext der Testdatei
 */
function testdatei(name, pauseMs) {
  return `import { test, expect } from 'bun:test'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

const protokoll = join(import.meta.dir, 'protokoll.txt')
const schreib = (was: string): void => appendFileSync(protokoll, was + '\\n', 'utf8')

test('${name} laeuft', async () => {
  schreib('${name}-start')
  // **Die Pause ist der Kern.** Ohne sie wären beide Dateien so schnell fertig,
  // daß die Reihenfolge nichts beweist: auch zwei nebenläufige Läufe könnten
  // hintereinander aussehen.
  await new Promise((fertig) => setTimeout(fertig, ${String(pauseMs)}))
  schreib('${name}-ende')
  expect(1 + 1).toBe(2)
})
`
}

rmSync(ordner, { recursive: true, force: true })
mkdirSync(ordner, { recursive: true })
// **Die Anzahl ist ein Argument.** Der erste Lauf hatte nur **zwei** Dateien und
// zeigte „nacheinander". Vielleicht schaltet Bun erst ab einer gewissen Zahl um —
// eine Messung mit zwei Dateien beweist nichts über neunundvierzig. Deshalb:
// `bun docs/status/messsonden/suite-nebenlaeufigkeit.mjs 8`.
const anzahl = Number(process.argv[2] ?? '2')
const namen = []
for (let i = 0; i < anzahl; i += 1) {
  const name = `d${String(i)}`
  namen.push(name)
  writeFileSync(join(ordner, `${name}.test.ts`), testdatei(name, 700), 'utf8')
}
writeFileSync(protokoll, '', 'utf8')

console.log(`Bun     ${bun}`)
console.log(`Aufbau  ${ordner.replace(hier + '\\', '')}  (${String(anzahl)} Dateien, je 700 ms Pause)`)
console.log('')

// **`--timeout` wird mitgegeben, damit die Messung nicht an einer Vorgabe
// scheitert.** Bun führt die Dateien so aus, wie es sie auch in der echten Suite
// ausführt — keine zusätzlichen Schalter, die das Ergebnis verfälschen könnten.
const lauf = spawnSync(bun, ['test', '--timeout', '20000', ordner], { cwd: hier, encoding: 'utf8', timeout: 60_000 })

const roh = existsSync(protokoll) ? readFileSync(protokoll, 'utf8') : ''
const zeilen = roh
  .split('\n')
  .map((z) => z.trim())
  .filter((z) => z !== '')

console.log('Protokoll (in dieser Reihenfolge geschrieben):')
for (const z of zeilen) console.log(`  ${z}`)
console.log('')

const ersteEnde = zeilen.findIndex((z) => z.endsWith('-ende'))
const letzterStart = zeilen.reduce((letzter, z, i) => (z.endsWith('-start') ? i : letzter), -1)
const angefangen = zeilen.filter((z) => z.endsWith('-start')).length
const nebenlaeufig = angefangen === anzahl && letzterStart < ersteEnde

console.log(`Testlauf exit=${String(lauf.status)}`)
console.log(`Dateien, die angefangen haben: ${String(angefangen)} von ${String(anzahl)}`)
console.log(
  `Antwort: ${nebenlaeufig ? 'NEBENLÄUFIG — eine Datei startet, während eine andere noch läuft' : 'nacheinander — jede Datei endet, bevor die nächste startet'}`,
)

rmSync(ordner, { recursive: true, force: true })
console.log(`Aufbau entfernt: ${!existsSync(ordner) ? 'ja' : 'NEIN'}`)

// Der Exit-Code sagt, ob die Sonde eine **Antwort** bekommen hat — nicht, welche.
// Eine Sonde, die ihr Ergebnis als Erfolg wertet, ist keine Messung.
process.exitCode = angefangen === anzahl ? 0 : 1
