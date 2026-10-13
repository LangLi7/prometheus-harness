/**
 * `scripts/schema-stand.mjs` — Prüfung der **reinen** Teile.
 *
 * ## Was hier geht und was nicht
 *
 * `zahlAus` ist rein: sie liest eine Zahl aus einer Datei und braucht kein Docker.
 * Sie wird hier mit **Wegwerf-Dateien** geprüft.
 *
 * **`fassungAus` ist NICHT geprüft** — sie ruft `docker exec psql`. Beide Zweige
 * (erreichbar / nicht erreichbar) ließen sich nur mit einem **Einschub** fahren, und
 * den gibt es noch nicht. Das steht hier, damit die Lücke nicht als Deckung
 * durchgeht: **der Nachweis für die Datenbankhälfte ist bislang der Lauf von Hand**
 * (gemessen: `pmh` 5, `pmh_test` 7, Exit 1) — nicht eine Prüfung.
 */

import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QUELLEN, zahlAus } from './schema-stand.mjs'

/** Ein Wegwerf-Verzeichnis mit einer Datei. */
function mit(inhalt) {
  const dir = mkdtempSync(join(tmpdir(), 'pmh-stand-'))
  writeFileSync(join(dir, 'q.ts'), inhalt, 'utf8')
  return dir
}

describe('zahlAus — die Zahl aus dem Quelltext', () => {
  test('liest die Zahl aus einem Muster', () => {
    const dir = mit('export const ERWARTETE_SCHEMAFASSUNG = 7\n')
    try {
      expect(zahlAus(dir, 'q.ts', /ERWARTETE_SCHEMAFASSUNG = (\d+)/u)).toBe(7)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('ohne Treffer gibt es undefined — nicht 0', () => {
    // **Der Unterschied ist wichtig.** `0` wäre eine gültige Fassung („noch keine
    // Migration"); `undefined` heißt „nicht gelesen". Wer beides gleich behandelt,
    // meldet eine leere Datenbank als in Ordnung.
    const dir = mit('export const ETWAS_ANDERES = 7\n')
    try {
      expect(zahlAus(dir, 'q.ts', /ERWARTETE_SCHEMAFASSUNG = (\d+)/u)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('eine fehlende Datei gibt undefined statt eines Wurfs', () => {
    const dir = mit('egal\n')
    try {
      expect(zahlAus(dir, 'gibt-es-nicht.ts', /(\d+)/u)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('kein Zahlenwert gibt undefined', () => {
    const dir = mit('export const X = sieben\n')
    try {
      expect(zahlAus(dir, 'q.ts', /X = (\w+)/u)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('die zwei Quellen, die das Skript liest, gibt es wirklich', () => {
    // **Eine Prüfung gegen den Baum, nicht gegen eine Attrappe.** Wird eine der
    // Dateien umbenannt, findet das Skript seine Zahlen nicht mehr — und meldete
    // dann „nicht gelesen", was wie ein Datenbankproblem aussähe.
    const { existsSync } = require('node:fs')
    expect(existsSync(join(process.cwd(), QUELLEN.schema))).toBe(true)
    expect(existsSync(join(process.cwd(), QUELLEN.readiness))).toBe(true)
    // Und die Sonde trägt die Zeile, die das Muster sucht.
    expect(zahlAus(process.cwd(), QUELLEN.readiness, /ERWARTETE_SCHEMAFASSUNG = (\d+)/u)).toBeGreaterThan(0)
  })
})
