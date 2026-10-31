/**
 * `scripts/plugin-sync.mjs` — **die zwei Kopien des Obsidian-Plugins kurz halten.**
 *
 * ## Warum es das gibt
 *
 * Seit dem Export liegen die vier Pakete **zweimal**: in `packages/…` (dort wird
 * entwickelt) und in `dist/obsidian-plugin/packages/…` (das ist das
 * veröffentlichte Repo). Zwei Kopien ohne Werkzeug sind zwei Wahrheiten, und die
 * laufen auseinander — genau der Fehler, den dieses Projekt sonst vermeidet.
 *
 * ## Was „synchron" heißt — und was nicht
 *
 * Kopiert werden **nur** die Paketordner. Was zum veröffentlichten Repo gehört,
 * aber nicht aus `packages/` stammt (Wurzel-`package.json`, `README.md`, CI),
 * bleibt unangetastet: es ist Handarbeit, kein Ableitungsprodukt.
 *
 * **Der Schnitt am Einleser steht hier, nicht in einer Anleitung.**
 * `packages/web/world-obsidian/src/einleser.ts` zieht `store-postgres` nach —
 * die ganze Datenbankschicht. Im Export darf sie nicht liegen; würde der Sync sie
 * nur „vergessen", käme sie beim nächsten Lauf zurück. Deshalb wird sie beim
 * Kopieren **ausgelassen** und ihre Exportzeile aus `package.json` entfernt.
 *
 * ## Aufruf
 *
 * ```powershell
 * bun scripts/plugin-sync.mjs            # kopieren und Abweichungen zeigen
 * bun scripts/plugin-sync.mjs --pruefen  # nur prüfen, nichts schreiben
 * ```
 *
 * Beide Wege enden mit **einem Fingerabdruck** über alle Dateien (Pfad + SHA-256,
 * sortiert). Zwei gleiche Fingerabdrücke heißen: gleicher Inhalt. Ein
 * unterschiedlicher sagt, **welche** Dateien abweichen — und das ist die
 * Auskunft, die man beim Veröffentlichen braucht.
 *
 * Exit-Code 1 bei `--pruefen` mit Abweichungen, sonst 0.
 *
 * @module scripts/plugin-sync
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Die Wurzel des Projekts, aus dem Modulpfad — nie aus dem Aufrufort. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Das veröffentlichte Repo. */
const ZIEL = join(ROOT, 'dist', 'obsidian-plugin')

/** Die vier Pakete, die das Plugin ausmachen. */
const PAKETE = [
  'packages/plugin/obsidian',
  'packages/world/obsidian',
  'packages/world/graph',
  'packages/web/world-obsidian',
]

/** Was nicht mit darf: der Einleser zieht die Datenbank nach. */
const AUSGESCHLOSSEN = new Set(['packages/web/world-obsidian/src/einleser.ts'])

/** Der Leser verliert dabei eine Abhängigkeit und einen Ausfuhrweg. */
const LESER = 'packages/web/world-obsidian/package.json'

/**
 * Rechnet den Inhalt eines Baumes zu einem Fingerabdruck.
 *
 * @param wurzel - wo die Dateien liegen
 * @param pakete - welche Ordner zählen (relativ zur Wurzel)
 * @param umbauen - wird auf (relativer Pfad, Inhalt) angewandt, bevor gehasht wird
 * @returns Pfad → SHA-256, sortiert nach Pfad
 */
function fingerabdruck(wurzel, pakete, umbauen) {
  const karte = new Map()
  for (const paket of pakete) {
    const basis = join(wurzel, paket)
    if (!existsSync(basis)) continue
    const lauf = (ordner) => {
      for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
        const voll = join(ordner, eintrag.name)
        const rel = relative(wurzel, voll).replaceAll('\\', '/')
        if (eintrag.isDirectory()) {
          if (eintrag.name === 'node_modules' || eintrag.name === 'tests') continue
          lauf(voll)
          continue
        }
        if (AUSGESCHLOSSEN.has(rel)) continue
        const roh = umbauen(rel, readFileSync(voll))
        karte.set(rel, createHash('sha256').update(roh).digest('hex'))
      }
    }
    lauf(basis)
  }
  return new Map([...karte.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Entfernt die Datenbank-Abhängigkeit aus dem Leser-Manifest.
 *
 * @param rel - der relative Pfad
 * @param roh - der Dateiinhalt
 * @returns der Inhalt, wie er im Export stehen soll
 */
function schneideLeser(rel, roh) {
  if (rel !== LESER) return roh
  const paket = JSON.parse(roh.toString('utf8'))
  if (paket.dependencies !== undefined) delete paket.dependencies['@prometheus-harness/store-postgres']
  if (paket.exports !== undefined) delete paket.exports['./einleser']
  return Buffer.from(`${JSON.stringify(paket, null, 2)}\n`, 'utf8')
}

/**
 * Schreibt eine Datei und legt fehlende Ordner an.
 *
 * @param ziel - der Zielpfad
 * @param inhalt - die Bytes
 */
function schreibe(ziel, inhalt) {
  mkdirSync(dirname(ziel), { recursive: true })
  writeFileSync(ziel, inhalt)
}

/**
 * Meldet die Unterschiede zweier Fingerabdrücke.
 *
 * @param quelle - der Stand in `packages/…`
 * @param ziel - der Stand im veröffentlichten Repo
 * @returns je Zeile eine Abweichung; leer heißt gleich
 */
function unterschiede(quelle, ziel) {
  const zeilen = []
  for (const [pfad, hash] of quelle) {
    const drueben = ziel.get(pfad)
    if (drueben === undefined) zeilen.push(`  fehlt drüben   ${pfad}`)
    else if (drueben !== hash) zeilen.push(`  abweichend     ${pfad}`)
  }
  for (const pfad of ziel.keys()) {
    if (!quelle.has(pfad)) zeilen.push(`  nur drüben     ${pfad}`)
  }
  return zeilen
}

/**
 * Führt den Lauf aus.
 *
 * @param pruefen - nur prüfen, nicht schreiben
 * @returns der Exit-Code
 */
function haupt(pruefen) {
  if (!existsSync(ZIEL)) {
    process.stderr.write(`[plugin-sync] ${ZIEL} fehlt — das veröffentlichte Repo ist nicht da.\n`)
    return 1
  }
  const quelle = fingerabdruck(ROOT, PAKETE, schneideLeser)
  if (!pruefen) {
    for (const paket of PAKETE) {
      const von = join(ROOT, paket)
      const nach = join(ZIEL, paket)
      if (existsSync(nach)) rmSync(nach, { recursive: true, force: true })
      const lauf = (ordner) => {
        for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
          const voll = join(ordner, eintrag.name)
          const rel = relative(ROOT, voll).replaceAll('\\', '/')
          if (eintrag.isDirectory()) {
            if (eintrag.name === 'node_modules' || eintrag.name === 'tests') continue
            lauf(voll)
            continue
          }
          if (AUSGESCHLOSSEN.has(rel)) continue
          schreibe(join(ZIEL, rel), schneideLeser(rel, readFileSync(voll)))
        }
      }
      if (existsSync(von)) lauf(von)
    }
  }
  const ziel = fingerabdruck(ZIEL, PAKETE, schneideLeser)
  const liste = unterschiede(quelle, ziel)
  const gleich = liste.length === 0
  process.stdout.write(`[plugin-sync] ${quelle.size} Dateien je Seite\n`)
  process.stdout.write(`[plugin-sync] Quelle  ${kurz(quelle)}\n`)
  process.stdout.write(`[plugin-sync] Export  ${kurz(ziel)}\n`)
  if (gleich) {
    process.stdout.write('[plugin-sync] Gleichstand — nichts zu tun.\n')
  } else {
    process.stdout.write(`[plugin-sync] ${liste.length} Abweichung(en):\n${liste.join('\n')}\n`)
  }
  if (pruefen && !gleich) return 1
  if (!pruefen) {
    const nach = fingerabdruck(ZIEL, PAKETE, schneideLeser)
    process.stdout.write(`[plugin-sync] Export nach dem Lauf  ${kurz(nach)}\n`)
    if (unterschiede(quelle, nach).length > 0) {
      process.stderr.write('[plugin-sync] Nach dem Kopieren weichen die Seiten noch ab — abbrechen.\n')
      return 1
    }
  }
  return 0
}

/**
 * Kürzt einen Fingerabdruck auf zwölf Zeichen.
 *
 * @param karte - Pfad → Hash
 * @returns der kurze Fingerabdruck
 */
function kurz(karte) {
  const h = createHash('sha256')
  for (const [pfad, hash] of karte) h.update(`${pfad}\u0000${hash}\n`)
  return h.digest('hex').slice(0, 12)
}

process.exitCode = haupt(process.argv.includes('--pruefen'))
