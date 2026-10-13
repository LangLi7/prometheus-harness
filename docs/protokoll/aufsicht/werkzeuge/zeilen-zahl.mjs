/**
 * zeilen-zahl.mjs — Wächter-Werkzeug (Aufsicht): Zeilen und Dateien zählen, **ehrlich**.
 *
 * WARUM. Eine Zeilenzahl ist nur so gut wie die Zählung. Der erste Versuch der Aufsicht lief über
 * `Get-Content | Measure-Object -Line` mit `-ErrorAction SilentlyContinue` — eine Datei, die nicht
 * gelesen werden kann, trug damit **still 0 Zeilen** bei, und das Ergebnis sah trotzdem wie eine
 * Messung aus. Genau der Fehler, den diese Rolle bei anderen beanstandet.
 *
 * Dieses Werkzeug zählt deshalb:
 *   * nur Dateien, die git kennt (`git ls-files`) — kein Cache, keine Generationsartefakte
 *   * per Byte-Puffer, nicht per Zeilenstrom
 *   * und es **meldet jede Datei, die es nicht lesen konnte**, mit Namen
 *
 * Aufruf:
 *   node zeilen-zahl.mjs <repo> <endung> [<endung> ...]
 *   node zeilen-zahl.mjs C:\Users\Chang\prometheus-harness rs md
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [repo, ...extensions] = process.argv.slice(2)
if (repo === undefined || extensions.length === 0) {
  throw new Error('usage: node zeilen-zahl.mjs <repo> <endung...>')
}

const tracked = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n')
  .map((entry) => entry.trim())
  .filter((entry) => entry !== '')

for (const extension of extensions) {
  const suffix = extension.startsWith('.') ? extension : `.${extension}`
  const files = tracked.filter((entry) => entry.toLowerCase().endsWith(suffix))
  let lines = 0
  let bytes = 0
  const unreadable = []
  let ohneSchlusszeile = 0
  for (const relative of files) {
    let buffer
    try {
      buffer = readFileSync(join(repo, relative))
    } catch (error) {
      unreadable.push(`${relative} (${error.code ?? error.message})`)
      continue
    }
    bytes += buffer.length
    const text = buffer.toString('utf8')
    // Zeilen = Anzahl der Zeilenumbrüche; eine Datei ohne Schlussumbrüchigkeit zählt ihre letzte Zeile mit.
    const umbrueche = text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
    if (!text.endsWith('\n') && text.length > 0) ohneSchlusszeile += 1
    lines += umbrueche
  }
  console.log(`${suffix.padEnd(6)} ${String(files.length).padStart(5)} Dateien · ${String(lines).padStart(9)} Zeilen · ${(bytes / 1024 / 1024).toFixed(1)} MB`)
  if (ohneSchlusszeile > 0) console.log(`       (${ohneSchlusszeile} Datei(en) ohne Schlussumbrüchigkeit gezählt)`)
  if (unreadable.length > 0) {
    console.log(`       NICHT LESBAR (${unreadable.length}) — diese Dateien fehlen in der Summe:`)
    for (const entry of unreadable.slice(0, 20)) console.log(`         ${entry}`)
    if (unreadable.length > 20) console.log(`         … und ${unreadable.length - 20} weitere`)
  }
}

// Gegenprobe mit git selbst: für Textdateien stimmt `git ls-files -z | wc -l` nicht, aber
// `git diff --numstat` gegen den leeren Baum zählt hinzugefügte Zeilen je Datei — das ist die
// unabhängige zweite Methode.
console.log('\nGegenprobe über git selbst (nur für die erste Endung):')
const suffix = extensions[0].startsWith('.') ? extensions[0] : `.${extensions[0]}`
const numstat = execFileSync('git', ['diff', '--numstat', '--no-renames', '4b825dc642cb6eb9a060e54bf8d69288fbee4904', 'HEAD', '--', `*${suffix}`], {
  cwd: repo,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
let summe = 0
let dateien = 0
for (const zeile of numstat.split('\n')) {
  const [hinzu] = zeile.split('\t')
  if (/^\d+$/.test(hinzu ?? '')) {
    summe += Number(hinzu)
    dateien += 1
  }
}
console.log(`  ${suffix}: ${dateien} Dateien · ${summe} Zeilen (aus HEAD, ohne Umbenennungen)`)
