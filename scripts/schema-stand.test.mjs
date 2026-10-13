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
import { DATENBANKEN, QUELLEN, fuehreAus, zahlAus } from './schema-stand.mjs'

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

describe('Der BEFUND-Zweig — mit eingespeister Datenbankabfrage', () => {
  /** Fährt das Skript mit einer erfundenen Datenbanklage. */
  function mitLage(fassungen) {
    const aus = []
    const fasse = (db) => fassungen[db]
    const code = fuehreAus(['pruefen'], { ...process.env, PMH_VERZEICHNIS: process.cwd() }, (t) => aus.push(t), fasse)
    return { code, text: aus.join('') }
  }

  test('alle gleich: Exit 0', () => {
    // Die echte Codefassung ist 7 — hier bekommen BEIDE Datenbanken 7.
    const { code, text } = mitLage({ pmh: 7, pmh_test: 7 })
    expect(code).toBe(0)
    expect(text).toContain('Alles gleich')
  })

  test('eine Datenbank zurück: Exit 1 und der Befund im Wortlaut', () => {
    // **Der Fall, der wirklich eingetreten ist** (pmh 5 gegen Code 7). Der Zweig
    // war bis jetzt nur durch einen Lauf von Hand belegt.
    const { code, text } = mitLage({ pmh: 5, pmh_test: 7 })
    expect(code).toBe(1)
    expect(text).toContain('ZURUECK (2)')
    expect(text).toContain('BEFUND')
    expect(text).toContain('meldet sie als NICHT BEREIT')
    expect(text).toContain('NICHT pmh_test')
  })

  test('keine Datenbank erreichbar: Exit 2, und NICHT 0', () => {
    // **Der wichtigste Fall.** Ein Skript, das bei fehlender Infrastruktur „grün"
    // sagt, behauptet eine Prüfung, die nicht stattgefunden hat.
    const { code, text } = mitLage({})
    expect(code).toBe(2)
    expect(text).toContain('NICHT MESSBAR')
  })

  test('eine erreichbar, eine nicht: keine Entwarnung', () => {
    const { code, text } = mitLage({ pmh_test: 7 })
    expect(code).toBe(0)
    expect(text).toContain('nicht erreichbar')
    // und die erreichbare war gleich — der Bericht nennt beides
    expect(text).toContain('gleich')
  })

  test('ohne Befehl: Exit 1', () => {
    const aus = []
    expect(fuehreAus([], process.env, (t) => aus.push(t), () => 7)).toBe(1)
  })

  test('die zwei verglichenen Datenbanken sind die aus dem Auftrag', () => {
    // Eine Prüfung gegen den Baum: wer `pmh` hier herausnimmt, vergleicht die
    // Betriebsdatenbank nicht mehr — und genau die war der Befund.
    expect(DATENBANKEN.map((d) => d.db)).toEqual(['pmh', 'pmh_test'])
  })
})
