/**
 * terminal-sonde.mjs — warum das Terminal in Prometheus „Prozess beendet
 * (-1073741502)" meldet, und was stattdessen trägt.
 *
 * ## Die drei Behauptungen, die hier gemessen werden
 *
 * | # | Behauptung | Erwartung |
 * |---|---|---|
 * | 1 | `node-pty` unter **Node** startet eine Shell | Exit 0, Marker kommt an |
 * | 2 | `node-pty` unter **Bun** startet **keine** Shell | kein Marker, toter Prozeß |
 * | 3 | **Buns eigenes PTY** unter Bun trägt | Exit 0, Marker kommt an, `isTTY=ja` |
 *
 * Aus 1 und 2 folgt der Ausfall; aus 3 folgt der Ersatz
 * (`packages/terminal/terminal-pty`). Wer die Sonden des Projekts liest, soll den
 * Befund **nachmessen** können statt ihn zu glauben.
 *
 * ## Warum die Sonde sich selbst startet
 *
 * Die Behauptung ist ein **Vergleich zweier Laufzeiten**. Ein einzelner Prozeß
 * kann nur eine davon sein — also startet die Sonde einen kleinen Kindprozeß
 * einmal unter `node` und einmal unter `bun`. Das Kind probiert `node-pty`, die
 * Sonde probiert zusätzlich Buns PTY im eigenen Prozeß.
 *
 * ## Warum `node -e` und nicht eine zweite Datei
 *
 * Eine zweite Datei wäre ein zweiter Messweg, der veralten kann. Der Kindtext
 * steht hier als Zeichenkette und wird über `--eval` übergeben — eine Quelle.
 *
 * Aufruf:  `bun docs/status/messsonden/terminal-sonde.mjs`
 * Exit:    0 = Erwartung erfüllt · 1 = mindestens eine Probe weicht ab
 */

import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MARKER = 'SONDE-TERMINAL-OK'

const SHELL = process.platform === 'win32' ? (process.env.ComSpec ?? 'C:\\WINDOWS\\system32\\cmd.exe') : '/bin/sh'
const SHELL_ARGS = process.platform === 'win32' ? ['/c', `echo ${MARKER}`] : ['-c', `echo ${MARKER}`]

/** Der Kindtext: startet eine Shell über `node-pty` und meldet das Ergebnis als JSON-Zeile. */
const KIND = `
const melde = (daten) => { process.stdout.write(JSON.stringify(daten) + '\\n'); process.exit(0) }
let pty
try { pty = require(process.env.SONDE_PTY) } catch (fehler) { melde({ ladeFehler: String(fehler && fehler.message) }) }
let daten = ''
try {
  const p = pty.spawn(process.env.SONDE_SHELL, JSON.parse(process.env.SONDE_ARGS), {
    name: 'xterm-color', cols: 80, rows: 24, cwd: process.cwd(), env: process.env,
  })
  p.onData((stueck) => { daten += stueck })
  p.onExit((ereignis) => melde({ exitCode: ereignis.exitCode, bytes: daten.length, marker: daten.includes(process.env.SONDE_MARKER) }))
  setTimeout(() => melde({ frist: true, bytes: daten.length }), 6000)
} catch (fehler) {
  melde({ startFehler: String(fehler && fehler.message) })
}
`

/**
 * Führt den Kindtext unter einer Laufzeit aus.
 *
 * **Warum der Kindtext in eine Datei geht und nicht über `--eval`.** Gemessen:
 * `bun` verweigert Argumente mit Zeilenumbrüchen, sobald die gefundene
 * ausführbare Datei ein `.cmd`-Vermittler ist (`ERR_INVALID_ARG_VALUE`, „contains
 * a cmd.exe special character"); auf diesem Rechner liegt `node` als
 * `%APPDATA%\npm\node.cmd`. Eine Datei als Argument ist davon nicht betroffen und
 * funktioniert unter beiden Laufzeiten gleich.
 *
 * @param {string} laufzeit - `node` oder `bun`
 * @returns {{text: string, code: number}}
 */
function kindLauf(laufzeit) {
  const datei = join(tmpdir(), `terminal-sonde-${String(process.pid)}.cjs`)
  writeFileSync(datei, KIND, 'utf8')
  // **Der Addon-Pfad wird HIER aufgelöst.** Die Kinddatei liegt in `%TEMP%`;
  // `require('node-pty')` fände von dort kein `node_modules`. Ein absoluter Pfad
  // macht das Kind unabhängig davon, wo es liegt.
  const ptyPfad = Bun.resolveSync('node-pty', process.cwd())
  try {
    const lauf = Bun.spawnSync({
      cmd: [laufzeit, datei],
      cwd: process.cwd(),
      env: {
        ...process.env,
        SONDE_PTY: ptyPfad,
        SONDE_SHELL: SHELL,
        SONDE_ARGS: JSON.stringify(SHELL_ARGS),
        SONDE_MARKER: MARKER,
      },
      stdout: 'pipe',
      stderr: 'ignore',
      timeout: 30_000,
    })
    return { text: new TextDecoder().decode(lauf.stdout ?? new Uint8Array()), code: lauf.exitCode ?? -1 }
  } finally {
    rmSync(datei, { force: true })
  }
}

/** Zieht die JSON-Zeile aus der Ausgabe des Kindes. */
function jsonAus(text) {
  for (const zeile of text.trim().split(/\r?\n/u).reverse()) {
    const knapp = zeile.trim()
    if (!knapp.startsWith('{')) continue
    try {
      return JSON.parse(knapp)
    } catch {
      // Eine Zeile, die nur so aussieht — weitersuchen.
    }
  }
  return undefined
}

console.log(`Plattform: ${process.platform} · Bun ${globalThis.Bun?.version ?? '?'} · Shell: ${SHELL}\n`)

// --- 1 und 2: node-pty unter beiden Laufzeiten -------------------------------
const ergebnisse = {}
for (const laufzeit of ['node', 'bun']) {
  const { text, code } = kindLauf(laufzeit)
  const befund = jsonAus(text) ?? { unlesbar: text.slice(0, 160), code }
  ergebnisse[laufzeit] = befund
  const kurz = befund.marker === true
    ? `Exit ${befund.exitCode}, Marker angekommen (${befund.bytes} Bytes)`
    : `kein Marker (${befund.bytes ?? 0} Bytes, exit ${befund.exitCode ?? code})`
  console.log(`1/2  node-pty unter ${laufzeit.padEnd(4)}: ${kurz}`)
}

// --- 3: Buns eigenes PTY ------------------------------------------------------
let bunPty = { marker: false }
try {
  let ausgabe = ''
  const proc = Bun.spawn({
    cmd: [SHELL, ...SHELL_ARGS],
    cwd: process.cwd(),
    terminal: {
      cols: 100,
      rows: 30,
      data: (_terminal, stueck) => { ausgabe += new TextDecoder().decode(stueck) },
    },
  })
  const code = await proc.exited
  bunPty = { exitCode: code, bytes: ausgabe.length, marker: ausgabe.includes(MARKER) }
  console.log(`3    Bun.spawn terminal : ${bunPty.marker ? `Exit ${code}, Marker angekommen (${bunPty.bytes} Bytes)` : `kein Marker (${bunPty.bytes} Bytes, exit ${code})`}`)
} catch (fehler) {
  console.log(`3    Bun.spawn terminal : STARTFEHLER ${String(fehler && fehler.message)}`)
}

// --- Urteil -------------------------------------------------------------------
const nodeTraegt = ergebnisse.node?.marker === true
const bunNodePtyTraegt = ergebnisse.bun?.marker === true
const bunPtyTraegt = bunPty.marker === true

const erwartung =
  nodeTraegt && !bunNodePtyTraegt && bunPtyTraegt
    ? 'ERWARTUNG ERFÜLLT: node-pty trägt unter Node, nicht unter Bun — Buns PTY trägt.'
    : nodeTraegt && !bunNodePtyTraegt && bunPtyTraegt === false
      ? 'ABWEICHUNG: node-pty fehlt unter Bun, aber Buns PTY trägt hier AUCH nicht.'
      : bunNodePtyTraegt
        ? 'LAGE GEÄNDERT: node-pty trägt unter Bun. Der Austausch ist nicht mehr nötig — prüfen und zurücknehmen.'
        : 'ABWEICHUNG: node-pty trägt hier auch unter Node nicht — die Ursache liegt woanders.'

console.log(`\n${erwartung}`)
process.exitCode = erwartung.startsWith('ERWARTUNG ERFÜLLT') ? 0 : 1
