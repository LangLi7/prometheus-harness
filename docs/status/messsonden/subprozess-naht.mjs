/**
 * Meßsonde: die **Naht** des Subprozesses — und die Falle, in die ich gelaufen bin.
 *
 * ## Was ich messen wollte
 *
 * `docs/status/werkzeug-nachweis.md` §2 läßt eine Frage offen:
 *
 * > *„Ein Werkzeug, das einmal rot und zweimal grün ist, ist nicht als grün
 * > belegt, sondern als sprunghaft. […] Was fehlt: mehrere Läufe mit gezielter
 * > Wiederholung, um die Häufigkeit zu bestimmen."*
 *
 * Der Plan: den Suchanbieter **ohne Modell** wiederholt fahren und zählen. Immerhin
 * steht die Herkunft der Meldung fest —
 * `dsh-tool-fs-search/lib/index.js:194` wirft `ripgrep provider failure`, wenn
 * `handle.done` verwirft, und das ist der **Subprozess-Runner**.
 *
 * ## Die erste Fassung dieser Sonde maß NICHTS
 *
 * Sie startete `node_modules/…/lib/runner-launch-*.js` **fünfzigmal je Form** und
 * meldete **150/150 gut**. Das war **leer**:
 *
 * | Datei | Was sie ist | Was beim Starten geschieht |
 * |---|---|---|
 * | `runner-launch-<hash>.js` | die **Bibliothek** — Funktionen, keine Handlung | lädt und endet, **exit 0** |
 * | `runner.js` | der **Eingang** — `if (import.meta.main) …` | verlangt eine *Selection*, sonst **exit 127** |
 *
 * Gestartet wurde die Bibliothek. Sie tut **nichts**, und „nichts" ist von „hat
 * funktioniert" nicht zu unterscheiden, solange man nur den Exit-Code ansieht.
 * Die auffällig gleichmäßigen 43 ms waren reine Bun-Startzeit.
 *
 * **Gefunden hat es die Gegenprobe**, die ich eingebaut hatte, um die Sonde zu
 * prüfen: sie sollte **ohne** Vorladung scheitern und **scheiterte nicht**. Eine
 * Sonde, deren Gegenprobe nicht rot wird, mißt nichts.
 *
 * ## Was diese Fassung wirklich feststellt
 *
 * 1. Bun verschluckt den `--`-Trenner, Node nicht (der Befund, auf dem die
 *    Ergänzung beruht).
 * 2. Die Bibliothek zu starten ergibt **0** — und beweist damit **nichts**.
 * 3. Den Eingang zu starten ergibt **127** — der Runner verlangt eine
 *    **Selection**, die nur der Aufrufer setzt (`SUBPROCESS_RUNNER_ENV`), und
 *    berichtet sein Ergebnis über einen **IPC-Kanal**, nicht über die Ausgabe.
 *
 * **Und daraus folgt der ehrliche Schluß:** die Häufigkeit des `glob`-Ausfalls ist
 * auf diesem Weg **nicht** zu bestimmen. Ein nackter Start kann die Naht nicht
 * fahren; dafür muß der Aufrufer sie benutzen — also der Host mit einer Sitzung.
 * Die Frage bleibt **offen** und steht weiter so im Nachweis.
 *
 * @module docs/status/messsonden/subprozess-naht
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const hier = process.cwd()
const bun = process.execPath
const libVerzeichnis = join(hier, 'node_modules/@deepseek-ai/dsh-subprocess-local/lib')

const bibliothek = join(
  libVerzeichnis,
  readdirSync(libVerzeichnis).find((n) => n.startsWith('runner-launch-') && n.endsWith('.js')) ?? '',
)
const eingang = join(libVerzeichnis, 'runner.js')
const { rgPath } = await import('@vscode/ripgrep')

/** Fährt einen Befehl und gibt das Wesentliche zurück. */
function fahre(datei, rest, optionen = {}) {
  const r = spawnSync(bun, [datei, ...rest], { cwd: hier, encoding: 'utf8', timeout: 30_000, ...optionen })
  return {
    status: r.status,
    signal: r.signal,
    stdout: (r.stdout ?? '').slice(0, 160),
    stderr: (r.stderr ?? '').replace(/\s+/gu, ' ').trim().slice(0, 200),
  }
}

console.log(`Bun        ${bun}`)
console.log(`Bibliothek ${bibliothek.replace(hier + '\\', '')}`)
console.log(`Eingang    ${eingang.replace(hier + '\\', '')}`)
console.log(`ripgrep    ${String(rgPath)}`)
console.log('')

// ---------------------------------------------------------------------------
// 1. Der Trenner: Bun gegen Node
// ---------------------------------------------------------------------------
const probe = mkdtempSync(join(tmpdir(), 'pmh-argv-'))
try {
  const skript = join(probe, 'zeige-argv.mjs')
  writeFileSync(skript, 'console.log(JSON.stringify(process.argv.slice(2)))\n', 'utf8')
  const b = spawnSync(bun, [skript, '--', 'zielprogramm', 'arg1'], { encoding: 'utf8', timeout: 20_000 })
  console.log('1. Der --Trenner')
  console.log(`   bun  script.mjs -- zielprogramm arg1  ->  ${(b.stdout ?? '').trim()}`)
  const n = spawnSync('node', [skript, '--', 'zielprogramm', 'arg1'], { encoding: 'utf8', timeout: 20_000 })
  console.log(
    `   node script.mjs -- zielprogramm arg1  ->  ${n.status === 0 ? (n.stdout ?? '').trim() : 'node nicht verfügbar'}`,
  )
  console.log('   Ohne Ergänzung schlägt die Prüfung des Runners unter Bun also IMMER fehl.')
} finally {
  rmSync(probe, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------
// 2. Die Falle: Bibliothek gegen Eingang
// ---------------------------------------------------------------------------
console.log('')
console.log('2. Die Falle — und warum die erste Fassung dieser Sonde nichts maß')
const alsBib = fahre(bibliothek, ['--', rgPath, '--version'])
console.log(`   Bibliothek starten          status=${String(alsBib.status)}  stdout=${JSON.stringify(alsBib.stdout)}`)
console.log('     -> exit 0, aber es GESCHIEHT NICHTS. Nicht von Erfolg zu unterscheiden.')
const alsEingang = fahre(eingang, ['--', rgPath, '--version'])
console.log(`   Eingang ohne Selection      status=${String(alsEingang.status)}  stderr=${JSON.stringify(alsEingang.stderr)}`)
console.log('     -> 127: der Runner verlangt eine Selection, die nur der Aufrufer setzt.')

// Wie heißt die Variable, die er liest?
// **Nicht durch Import ermittelt, sondern durch Lesen der Exportliste** — der
// direkte Import der Datei scheitert an der Paketgrenze (`exports` in der
// `package.json`), und ein `catch(() => undefined)` hätte daraus ein stilles
// „undefined" gemacht. Der Name steht in
// `runner-launch-<hash>.js:1529` als `SUBPROCESS_RUNNER_ENV as t`.
console.log('   Die Selection-Variable heißt: SUBPROCESS_RUNNER_ENV (Exportliste als `t`)')

// ---------------------------------------------------------------------------
// 3. Was daraus folgt
// ---------------------------------------------------------------------------
console.log('')
console.log('3. Schluß')
console.log('   Die Häufigkeit des glob-Ausfalls ist SO nicht zu bestimmen: ein nackter')
console.log('   Start fährt die Naht nicht. Dafür muß der Aufrufer sie benutzen — also')
console.log('   der Host mit einer Sitzung. Die Frage bleibt offen.')
process.exitCode = alsBib.status === 0 && alsEingang.status === 127 ? 0 : 1
