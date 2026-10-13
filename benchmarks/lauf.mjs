/**
 * `benchmarks/lauf.mjs` — alle Benchmarks, die **heute laufen können**.
 *
 * ## Warum es einen Sammelläufer gibt
 *
 * 10 Ordner liegen in `benchmarks/`, davon sind 9 Gates und 1 Werkzeugordner
 * (`support`). Von den 9 Gates laufen 3, die übrigen 6 brauchen den **laufenden
 * Agenten**. Ein Sammelläufer, der trotzdem alle 9 aufriefe, würde 6 Fehler
 * melden und die 3 echten Befunde darin begraben. Deshalb führt er **nur die
 * lauffähigen** aus und **nennt die übrigen mit ihrem Grund**.
 *
 * **Warum die leeren nicht stillschweigend fehlen.** Wer `bun run bench` aufruft
 * und nur die laufenden Zeilen sieht, hält das für Vollständigkeit. Eine fehlende
 * Messung muß als fehlend erscheinen — das ist dieselbe Regel wie bei
 * übersprungenen Tests.
 *
 * **Die Zahlen oben sind nachgezählt, nicht geschätzt — und sie sind einmal
 * veraltet gewesen.** Als das Gate `messtechnik` dazukam, wurde `GATES` ergänzt,
 * aber dieser Kopf stand weiter auf „Acht Ordner … sieben davon leer". Genau das
 * findet niemand, der den Code liest; es fällt nur auf, wenn jemand die Ordner
 * **zählt**. Deshalb prüft `benchmarks/support/tests/lauf.test.mjs` jetzt, daß
 * `GATES` und die Ordner auf der Platte übereinstimmen **und** daß die hier
 * genannten Zahlen stimmen. Ein Kommentar, der zählen soll, braucht einen Zähler.
 *
 * ## Aufruf
 *
 * ```sh
 * bun benchmarks/lauf.mjs
 * bun benchmarks/lauf.mjs --nur=session-open
 * ```
 *
 * Der Exit-Code ist **1**, sobald **ein** Gate einen Befund hat.
 *
 * @module benchmarks/lauf
 */

import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Wurzel des Benchmark-Verzeichnisses. */
export const HIER = dirname(fileURLToPath(import.meta.url))

/**
 * Die Gates und ihre Lage.
 *
 * **Warum hier eine Liste steht und nicht `readdirSync`.** Ein Verzeichnis zu
 * finden heißt nicht, daß es etwas messen kann. Diese Liste sagt zu jedem Gate,
 * **ob** es läuft und **was fehlt**, wenn nicht — das ist die Auskunft, die ein
 * Leser braucht.
 */
export const GATES = [
  { ordner: 'session-open', laeuft: true, was: 'Sitzung schreiben, lesen, falten' },
  {
    ordner: 'messtechnik',
    laeuft: true,
    was: 'den Meßaufbau selbst: Skalierung, Auflösungsgrenze, Aufwärmphase, Statistik, Schreibarten',
  },
  {
    ordner: 'db-last',
    laeuft: true,
    was: 'die Schreiblast des PostgreSQL-Schemas: Kosten des Zähler-UPDATE je Nachricht',
  },
  {
    ordner: 'conversation-fold',
    laeuft: false,
    was: 'langen Verlauf in der Oberfläche falten',
    fehlt: 'braucht die Gesprächsoberfläche',
  },
  {
    ordner: 'agent-continuation',
    laeuft: false,
    was: 'einen unterbrochenen Agenten-Turn fortsetzen',
    fehlt: 'braucht die in eine Anwendung verdrahtete Kette',
  },
  {
    ordner: 'active-stream-reconnect',
    laeuft: false,
    was: 'einen Strom nach Verbindungsverlust wiederaufnehmen',
    fehlt: 'braucht einen laufenden Remote-Strom',
  },
  {
    ordner: 'long-session-browser',
    laeuft: false,
    was: 'die Oberfläche mit einer sehr langen Sitzung',
    fehlt: 'braucht den Browser-Prüfstand',
  },
  {
    ordner: 'session-corpus',
    laeuft: false,
    was: 'einen Bestand vieler Sitzungen lesen',
    fehlt: 'braucht einen Sitzungsbestand',
  },
  { ordner: 'terminal-io', laeuft: false, was: 'Terminal-Rundläufe', fehlt: 'braucht die Terminal-Fläche' },
]

/**
 * Findet den Einstieg eines Gates.
 *
 * @param {string} ordner - der Ordnername
 * @returns {string | undefined} der Pfad, falls vorhanden
 */
export function einstiegVon(ordner) {
  const pfad = join(HIER, ordner, 'lauf.mjs')
  return existsSync(pfad) ? pfad : undefined
}

/**
 * Führt die Gates aus.
 *
 * @param {{nur?: string, schreibe?: (t: string) => void}} [optionen]
 * @returns {Promise<number>} die Zahl der Gates mit Befund
 */
export async function laufeAlle(optionen = {}) {
  const schreibe = optionen.schreibe ?? ((t) => process.stdout.write(t))
  const gewaehlt = optionen.nur === undefined ? GATES : GATES.filter((g) => g.ordner === optionen.nur)
  if (gewaehlt.length === 0) {
    schreibe(`Kein Gate namens "${String(optionen.nur)}". Vorhanden: ${GATES.map((g) => g.ordner).join(', ')}\n`)
    return 1
  }

  let rot = 0
  let gelaufen = 0
  for (const gate of gewaehlt) {
    if (!gate.laeuft) {
      // **Sichtbar übersprungen, mit Grund.** Ein leerer Ordner, der nicht
      // genannt wird, sieht aus wie ein bestandener.
      schreibe(`\n=== ${gate.ordner} ===\nübersprungen — ${gate.fehlt ?? 'kein Einstieg'}\n`)
      continue
    }
    const pfad = einstiegVon(gate.ordner)
    if (pfad === undefined) {
      schreibe(`\n=== ${gate.ordner} ===\nFEHLT — als lauffähig geführt, aber ${gate.ordner}/lauf.mjs gibt es nicht\n`)
      rot += 1
      continue
    }
    // **Als eigener Prozeß, nicht als Import.** Zwei Gründe: ein Gate, das den
    // Speicher zumißt, braucht einen unberührten Prozess; und ein Absturz in
    // einem Gate darf die übrigen nicht mitreißen.
    const { spawn } = await import('node:child_process')
    const code = await new Promise((fertig) => {
      const kind = spawn(process.execPath, [pfad], { stdio: 'inherit', windowsHide: true })
      kind.on('error', () => fertig(-1))
      kind.on('exit', (c) => fertig(c ?? -1))
    })
    gelaufen += 1
    if (code !== 0) rot += 1
  }

  const uebersprungen = gewaehlt.length - gelaufen
  schreibe(
    `\n${String(gelaufen)} Gate(s) gelaufen, ${String(uebersprungen)} übersprungen, ` +
      `${String(rot)} mit Befund.\n`,
  )
  return rot
}

/**
 * Liest `--nur=<name>` aus der Kommandozeile.
 *
 * @param {readonly string[]} argv
 * @returns {string | undefined}
 */
export function nurAusArgumenten(argv) {
  for (const arg of argv) {
    if (arg.startsWith('--nur=')) return arg.slice('--nur='.length)
  }
  return undefined
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = (await laufeAlle({ nur: nurAusArgumenten(process.argv.slice(2)) })) === 0 ? 0 : 1
}
