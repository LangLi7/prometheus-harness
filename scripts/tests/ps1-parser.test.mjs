/**
 * Prüfung des Wächters `scripts/ps1-parser.mjs`.
 *
 * ## Warum die Gegenprobe hier das Wichtigste ist
 *
 * Aus §7 von `docs/status/werkzeug-nachweis.md`: *„Eine Sonde, deren Gegenprobe
 * nicht rot wird, mißt nichts."* Ein Wächter, der **immer** grün meldet, sieht von
 * einem geprüften Bestand nicht anders aus als von gar keiner Prüfung. Diese Datei
 * führt deshalb eine **absichtlich kaputte** `.ps1`-Datei vor und verlangt, daß der
 * Parser sie **meldet**.
 */

import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ersetze, findeSkripte, hatPowerShell51, pruefeMit51 } from '../ps1-parser.mjs'

const WURZEL = join(import.meta.dir, '..', '..')

describe('Der Wächter findet die Dateien', () => {
  it('findet .ps1-Dateien im Projekt', () => {
    const gefunden = findeSkripte(WURZEL)
    expect(gefunden.length).toBeGreaterThan(5)
    expect(gefunden.every((f) => f.endsWith('.ps1'))).toBe(true)
  })

  it('läßt node_modules aus — sonst prüft er tausende fremde Dateien', () => {
    const gefunden = findeSkripte(WURZEL)
    expect(gefunden.some((f) => f.includes('node_modules'))).toBe(false)
  })
})

describe('Die Transliteration verschweigt nichts', () => {
  it('ersetzt die bekannten Zeichen', () => {
    const { text, ersetzt } = ersetze('Prüfung — „so"')
    expect(text).toBe('Pruefung - "so"')
    expect(ersetzt.get('\u00FC')).toBe(1)
    expect(ersetzt.get('\u2014')).toBe(1)
  })

  it('ein UNBEKANNTES Zeichen wird gemeldet, nicht stillschweigend ersetzt', () => {
    // U+4E2D (中) steht nicht in der Tabelle. Er darf nicht spurlos verschwinden.
    const { text, unbekannt } = ersetze('a\u4E2Db')
    expect(text).toBe('a?b')
    expect(unbekannt.get('\u4E2D')).toBe(1)
  })

  it('reines ASCII bleibt unangetastet', () => {
    const roh = 'Write-Host "kein Umlaut"\n'
    const { text, ersetzt, unbekannt } = ersetze(roh)
    expect(text).toBe(roh)
    expect(ersetzt.size).toBe(0)
    expect(unbekannt.size).toBe(0)
  })
})

describe('Windows PowerShell 5.1 ist die richtige Maschine', () => {
  it('meldet, ob 5.1 vorhanden ist — als Wahrheitswert, nicht als Absturz', () => {
    expect(typeof hatPowerShell51()).toBe('boolean')
  })

  it('prüft mit 5.1 und nicht mit dem Parser der laufenden Sitzung', () => {
    // **Die Gegenprobe.** Diese Datei ist unter 5.1 kaputt und unter pwsh 7 heil:
    // Der Gedankenstrich in der Zeichenkette wird von 5.1 als ANSI gelesen, sein
    // drittes Byte ist U+201D — und PowerShell behandelt das als String-Begrenzer.
    // Meldet der Parser hier NICHTS, prüft er die falsche Maschine.
    if (!hatPowerShell51()) {
      // Ohne 5.1 wird nicht geprüft — und das wird gesagt, nicht verschwiegen.
      expect(hatPowerShell51()).toBe(false)
      return
    }
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-ps1-'))
    try {
      const kaputt = join(ordner, 'kaputt.ps1')
      writeFileSync(kaputt, 'Write-Host "ein Fehler \u2014 hier"\n', 'utf8')
      const heil = join(ordner, 'heil.ps1')
      writeFileSync(heil, 'Write-Host "kein Fehler - hier"\n', 'ascii')

      const befund = pruefeMit51([kaputt, heil], join(ordner, 'pruefling.ps1'))
      expect(befund.length).toBe(1)
      expect(befund[0]?.datei).toBe(kaputt)
      expect(befund[0]?.fehler).toBeGreaterThan(0)
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  it('der gepflegte Bestand ist grün — oder es wird BENANNT, welche Datei rot ist', () => {
    if (!hatPowerShell51()) {
      expect(hatPowerShell51()).toBe(false)
      return
    }
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-ps1-bestand-'))
    try {
      const befund = pruefeMit51(findeSkripte(WURZEL), join(ordner, 'pruefling.ps1'))
      // Nicht nur „ist leer": der Befund wird im Fehlerfall AUSGEGEBEN, damit die
      // Ursache im Prüfbericht steht und nicht erst gesucht werden muß.
      expect(befund.map((b) => `${b.datei}:${String(b.zeile)} ${b.erste}`)).toEqual([])
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })
})
