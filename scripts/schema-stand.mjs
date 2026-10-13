/**
 * `scripts/schema-stand.mjs` — hält **Code und Datenbanken** gegeneinander.
 *
 * ## Warum es das gibt: ein gemessener Fund vom 13.10.2026
 *
 * ```
 * packages/api/readiness  ERWARTETE_SCHEMAFASSUNG = 7
 * pmh      (Betrieb)      fassung = 5      <- zwei Fassungen zurück
 * pmh_test (Wegwerf)      fassung = 7
 * ```
 *
 * Die Migrationen 0006 und 0007 liefen **nur gegen die Wegwerf-Datenbank**. In der
 * Betriebsdatenbank fehlen `documents`, `chunks`, `vaults`, `notes`, `tags`,
 * `note_tags`, `links` — der ganze Wissensspeicher. Und die Folge: eine **gesunde**
 * Betriebsdatenbank meldet über `/api/ready` **nicht bereit**, weil die Sonde die
 * erwartete Fassung aus dem **Code** nimmt.
 *
 * **Das ist der Zustand, den dieses Skript sichtbar macht** — bevor jemand den Host
 * startet und sich über eine Meldung wundert, die völlig korrekt ist.
 *
 * ## Was es tut — und was nicht
 *
 * Es **liest**: die zwei Zahlen aus dem Quelltext und die Fassungen aus beiden
 * Datenbanken (`docker exec psql`, nur `SELECT`). Es **ändert nichts** und gibt
 * **keine** Anweisung zum Schreiben aus.
 *
 * **Die zwei Zahlen im Code werden NICHT importiert, sondern gelesen.** Ein Import
 * würde dieses Skript an die Pakete binden, die es prüft — und es soll gerade dann
 * noch laufen, wenn dort etwas im Umbau ist. Dasselbe Verfahren wie in
 * `packages/auth/db-schema/tests/migrate.test.ts` (dort mit Begründung).
 *
 * @module scripts/schema-stand
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Daß die Zahlen aus dem Quelltext gelesen werden, ist Absicht — siehe Kopf. */
export const QUELLEN = {
  schema: 'packages/auth/db-schema/src/index.ts',
  readiness: 'packages/api/readiness/src/index.ts',
}

/** Die beiden Datenbanken, die verglichen werden. */
export const DATENBANKEN = [
  { name: 'pmh (Betrieb)', db: 'pmh' },
  { name: 'pmh_test (Wegwerf)', db: 'pmh_test' },
]

/**
 * Liest eine Zahl aus einer Quelldatei.
 *
 * @param {string} wurzel - das Projektverzeichnis
 * @param {string} datei - der relative Pfad
 * @param {RegExp} muster - ein Muster mit einer Zahlengruppe
 * @returns {number | undefined} die Zahl, oder `undefined`
 */
export function zahlAus(wurzel, datei, muster) {
  try {
    const treffer = muster.exec(readFileSync(join(wurzel, datei), 'utf8'))
    if (treffer === null) return undefined
    const zahl = Number(treffer[1])
    return Number.isInteger(zahl) ? zahl : undefined
  } catch {
    return undefined
  }
}

/**
 * Fragt eine Datenbank nach ihrer Fassung — **nur lesend**.
 *
 * @param {string} db - der Datenbankname
 * @returns {number | undefined} die Fassung, oder `undefined` (nicht erreichbar)
 */
export function fassungAus(db) {
  const r = spawnSync(
    'docker',
    ['exec', 'pmh-postgres', 'psql', '-U', 'pmh_admin', '-d', db, '-tAc', 'SELECT max(version) FROM pmh.schema_migrations;'],
    { encoding: 'utf8', timeout: 30_000 },
  )
  if (r.status !== 0) return undefined
  const zahl = Number((r.stdout ?? '').trim())
  return Number.isInteger(zahl) ? zahl : undefined
}

/**
 * Führt den Befehl aus.
 *
 * @param {readonly string[]} argv - die Argumente ohne `node` und Skriptpfad
 * @param {Readonly<Record<string, string | undefined>>} umgebung - Umgebungsvariablen
 * @param {(text: string) => void} schreibe - Ausgabe
 * @returns {number} der Exit-Code
 */
export function fuehreAus(argv, umgebung = process.env, schreibe = (t) => process.stdout.write(t)) {
  if (argv[0] !== 'pruefen') {
    schreibe(
      'Aufruf:\n' +
        '  bun scripts/schema-stand.mjs pruefen\n' +
        '\n' +
        '  Vergleicht die Schemafassung im CODE mit der in den DATENBANKEN (nur lesend).\n' +
        '  Exit 0 = alles gleich. Exit 1 = eine Datenbank ist zurück. Exit 2 = nicht meßbar.\n',
    )
    return 1
  }

  const wurzel = umgebung.PMH_VERZEICHNIS?.trim() ?? process.cwd()
  const schema = zahlAus(wurzel, QUELLEN.schema, /export const SCHEMA_VERSION = .*?,\s*0\)/u) ?? zahlAus(wurzel, QUELLEN.schema, /version:\s*(\d+)\s*,\s*name:\s*'[^']*',\s*sql:\s*m(\d+)/u)
  const erwartet = zahlAus(wurzel, QUELLEN.readiness, /ERWARTETE_SCHEMAFASSUNG = (\d+)/u)
  // **Die höchste Migrationsnummer ist die Wahrheit des Codes.** `SCHEMA_VERSION`
  // ist eine Rechnung über die Liste; die letzte `version: N` ist die Quelle.
  const ausListe = [...readFileSync(join(wurzel, QUELLEN.schema), 'utf8').matchAll(/version:\s*(\d+)\s*,/gu)].map((m) => Number(m[1]))
  const codeFassung = ausListe.length > 0 ? Math.max(...ausListe) : schema

  schreibe('SCHEMA-STAND — Code gegen Datenbanken (nur lesend)\n\n')
  schreibe(`  Code: Migrationen bis Fassung   ${String(codeFassung)}\n`)
  schreibe(`  Sonde (readiness) erwartet      ${erwartet === undefined ? '(nicht gelesen)' : String(erwartet)}\n\n`)

  const zeilen = []
  let zurueck = 0
  let unerreichbar = 0
  for (const { name, db } of DATENBANKEN) {
    const fassung = fassungAus(db)
    if (fassung === undefined) {
      unerreichbar += 1
      zeilen.push(`  ${name.padEnd(22)} nicht erreichbar`)
      continue
    }
    const urteil = fassung === codeFassung ? 'gleich' : fassung < codeFassung ? `ZURUECK (${String(codeFassung - fassung)})` : 'WEITER als der Code'
    if (fassung !== codeFassung) zurueck += 1
    zeilen.push(`  ${name.padEnd(22)} ${String(fassung).padStart(3)}   ${urteil}`)
  }
  for (const z of zeilen) schreibe(`${z}\n`)

  if (erwartet !== undefined && erwartet !== codeFassung) {
    schreibe(
      `\nACHTUNG: die Sonde erwartet ${String(erwartet)}, der Code erzeugt ${String(codeFassung)}.\n` +
        '  Diese Abschrift ist veraltet — sie meldet eine gesunde Datenbank als nicht bereit.\n',
    )
    return 1
  }

  if (unerreichbar === DATENBANKEN.length) {
    schreibe('\nNICHT MESSBAR: keine der Datenbanken war erreichbar (läuft der Docker-Stapel?).\n')
    return 2
  }

  if (zurueck > 0) {
    schreibe(
      `\nBEFUND: ${String(zurueck)} Datenbank(en) liegen hinter dem Code.\n` +
        '  Folge: /api/ready meldet sie als NICHT BEREIT — und das ist korrekt, die\n' +
        '  Migration fehlt wirklich. Nachziehen (eine Entscheidung, kein Nebenbei):\n' +
        '\n' +
        '    $env:MIGRATION_DATABASE_URL = <die betroffene Datenbank>   # NICHT pmh_test\n' +
        '    bun scripts/migrate.mjs\n' +
        '\n' +
        '  Die Migrationen 0006/0007 legen NUR Neues an (CREATE, kein DROP, kein ALTER\n' +
        '  an bestehenden Spalten) — aber es ist eine Änderung an der Betriebsdatenbank.\n',
    )
    return 1
  }

  schreibe('\nAlles gleich: Code, Sonde und jede erreichbare Datenbank.\n')
  return 0
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('schema-stand.mjs')) {
  process.exitCode = fuehreAus(process.argv.slice(2))
}
