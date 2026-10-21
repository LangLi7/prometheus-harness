/**
 * `packages/plugin/git/install.mjs` — das Plugin frisch installieren.
 *
 * ## Warum es dieses Skript gibt
 *
 * Die Installation von Hand hat am 21.10.2026 **zwei** Fehler gekostet, und beide waren stumm:
 *
 * | Falle | Symptom | Ursache |
 * |---|---|---|
 * | Paket nicht im Wurzel-`node_modules` | `pmh-git (@prometheus-harness/git): failed to import` | der Cordis-Loader importiert unter Bun ohne `baseUrl` — vom Repo, nicht vom Profil |
 * | Profil-Eintrag fehlt | Plugin erscheint gar nicht | `dependencies` **und** `dsh.profile.bundles` |
 * | Client-Bündel fehlt | Host-Hälfte läuft, Panel fehlt | `lib/client.js` wird beim Start gelesen |
 *
 * Das Skript prüft und repariert genau diese drei Dinge. Es ist **idempotent**: ein zweiter Lauf
 * ändert nichts und sagt das auch.
 *
 * ## Aufruf
 *
 * ```powershell
 * bun run packages/plugin/git/install.mjs
 * ```
 *
 * Danach **muß der Host neu starten** — Server-Plugins und das Client-Bündel werden beim Start
 * gelesen. Das Skript sagt das am Ende noch einmal.
 *
 * @module @prometheus-harness/git/install
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const PAKET = '@prometheus-harness/git'
const RELATIV = 'packages/plugin/git'
const PROFIL = join(ROOT, '.pmh-build', 'harness-home', 'profiles', 'web')
const PROFILE_PAKET = join(PROFIL, 'package.json')
const CLIENT = join(ROOT, RELATIV, 'lib', 'client.js')

/** Zählt Befunde; der Exit-Code ist das Ergebnis. */
let fehlschlaege = 0

/**
 * Meldet eine Zeile.
 *
 * @param zeichen - `ok`, `rot` oder `info`
 * @param text - der Text
 */
function sage(zeichen, text) {
  const marke = zeichen === 'ok' ? '  ok  ' : zeichen === 'rot' ? '  ROT ' : '  …   '
  process.stdout.write(`${marke} ${text}\n`)
  if (zeichen === 'rot') fehlschlaege += 1
}

/**
 * Liest eine JSON-Datei.
 *
 * @param pfad - der Pfad
 * @returns der Inhalt
 */
function lies(pfad) {
  return JSON.parse(readFileSync(pfad, 'utf8'))
}

/**
 * Schreibt eine JSON-Datei mit zwei Leerzeichen Einrückung und Zeilenende.
 *
 * @param pfad - der Pfad
 * @param wert - der Inhalt
 */
function schreibe(pfad, wert) {
  writeFileSync(pfad, `${JSON.stringify(wert, null, 2)}\n`, 'utf8')
}

process.stdout.write(`\nGit-Plugin installieren — ${ROOT}\n\n`)

// --- 1. Das Paket im Wurzel-node_modules -----------------------------------
// Der Cordis-Loader importiert unter Bun ohne baseUrl; ohne diesen Eintrag
// scheitert der Import mit „failed to import" und nennt keine Ursache.
const wurzelLink = join(ROOT, 'node_modules', '@prometheus-harness', 'git')
if (existsSync(join(wurzelLink, 'package.json'))) {
  sage('ok', `Wurzel-Verknüpfung: node_modules/@prometheus-harness/git`)
} else {
  sage('rot', 'Wurzel-Verknüpfung fehlt — bitte `bun install` im Repo-Wurzelverzeichnis laufen lassen.')
}

// --- 2. Das Profil ----------------------------------------------------------
if (!existsSync(PROFILE_PAKET)) {
  sage('rot', `Kein Profil unter ${PROFIL} — der Host wurde hier nie gestartet.`)
} else {
  const profil = lies(PROFILE_PAKET)
  const vorher = JSON.stringify(profil)
  profil.dependencies = profil.dependencies ?? {}
  if (profil.dependencies[PAKET] === undefined) {
    profil.dependencies[PAKET] = `link:${join(ROOT, RELATIV).replace(/\\/gu, '/')}`
    sage('info', `Profil: "dependencies.${PAKET}" ergänzt`)
  } else {
    sage('ok', 'Profil: Abhängigkeit steht')
  }
  profil.dsh = profil.dsh ?? {}
  profil.dsh.profile = profil.dsh.profile ?? {}
  const bundles = Array.isArray(profil.dsh.profile.bundles) ? profil.dsh.profile.bundles : []
  if (!bundles.includes(PAKET)) {
    // **Vor `usage` einhängen**, damit die Reihenfolge lesbar bleibt.
    const stelle = bundles.indexOf('@prometheus-harness/usage')
    if (stelle >= 0) bundles.splice(stelle, 0, PAKET)
    else bundles.push(PAKET)
    profil.dsh.profile.bundles = bundles
    sage('info', `Profil: "${PAKET}" in dsh.profile.bundles eingetragen`)
  } else {
    sage('ok', 'Profil: Bündel steht')
  }
  if (JSON.stringify(profil) !== vorher) {
    schreibe(PROFILE_PAKET, profil)
    sage('ok', 'Profil geschrieben')
  } else {
    sage('ok', 'Profil unverändert — schon installiert')
  }
}

// --- 3. Das Client-Bündel ---------------------------------------------------
if (existsSync(CLIENT)) {
  const groesse = readFileSync(CLIENT).byteLength
  sage('ok', `Client-Bündel: lib/client.js (${String(groesse)} B)`)
} else {
  sage('rot', 'Client-Bündel fehlt — `bun run packages/plugin/git/build.mjs` ausführen.')
}

// --- 4. git selbst ----------------------------------------------------------
const gitPfad = Bun.which('git')
if (gitPfad === null) {
  sage('rot', 'git ist nicht im PATH — das Panel antwortet mit 503.')
} else {
  sage('ok', `git: ${gitPfad}`)
}
if (process.env['PMH_GIT'] !== undefined && process.env['PMH_GIT'].trim() !== '') {
  sage('info', `PMH_GIT übersteuert den Pfad: ${process.env['PMH_GIT'].trim()}`)
}

process.stdout.write('\n')
if (fehlschlaege > 0) {
  process.stdout.write(`${String(fehlschlaege)} Punkt(e) offen.\n`)
  process.exitCode = 1
} else {
  process.stdout.write('Installiert. **Host neu starten** — Server-Hälfte und Client-Bündel werden beim Start gelesen,\n')
  process.stdout.write('ein Neuladen der Seite genügt nicht.\n')
}
