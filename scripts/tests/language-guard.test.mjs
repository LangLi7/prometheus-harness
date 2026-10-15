/**
 * Prüfung des Sprachwächters `scripts/language-guard.mjs`.
 *
 * ## Warum die Gegenprobe hier das Wichtigste ist
 *
 * Ein Wächter, der **immer** „keine Zunahme" meldet, sieht von einem geprüften Bestand
 * nicht anders aus als von gar keiner Prüfung. Diese Datei legt deshalb einen **neuen**
 * deutschen Ausgabesatz vor und verlangt, daß er **auffällt**.
 */

import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NICHT_BENUTZERNAH, sammle, siehtDeutschAus, trenne, zuwachs } from '../language-guard.mjs'

describe('Der Umfang: was zählt als Benutzerausgabe?', () => {
  it('Meßsonden und fremde Momentaufnahmen werden abgetrennt', () => {
    const { benutzernah, uebersprungen, zahlUebersprungen } = trenne({
      'scripts/install.mjs': 5,
      'docs/status/messsonden/strom-sonde.mjs': 15,
      'snapshots/web/src/rotation.ts': 3,
      'services/pmh-nix/api/api.go': 20,
    })
    expect(Object.keys(benutzernah).sort()).toEqual(['scripts/install.mjs', 'services/pmh-nix/api/api.go'])
    expect(zahlUebersprungen).toBe(18)
    expect(Object.keys(uebersprungen).length).toBe(2)
  })

  it('die Gegenprobe: ein BENUTZERNAHER Pfad darf NICHT übersprungen werden', () => {
    // Ohne diesen Fall könnte die Liste jeden Pfad schlucken und der Wächter wäre blind.
    const { benutzernah } = trenne({ 'scripts/install.mjs': 5, 'packages/api/health/src/index.ts': 7 })
    expect(Object.keys(benutzernah).length).toBe(2)
  })

  it('die übersprungenen Pfade sind benannt und nicht bloß ein Muster', () => {
    expect(NICHT_BENUTZERNAH).toContain('docs/status/messsonden/')
    expect(NICHT_BENUTZERNAH).toContain('snapshots/')
    // `scripts/` steht NICHT darin: dort liegen die Ausgaben für den Betreiber.
    expect(NICHT_BENUTZERNAH).not.toContain('scripts/')
  })
})

describe('Deutsch erkennen', () => {
  it('Umlaute und ß genügen', () => {
    expect(siehtDeutschAus('Prüfung fehlgeschlagen')).toBe(true)
    expect(siehtDeutschAus('die Größe')).toBe(true)
    expect(siehtDeutschAus('Straße')).toBe(true)
  })

  it('deutsche Wörter ohne Umlaut werden erkannt', () => {
    expect(siehtDeutschAus('der Wert wurde nicht gesetzt')).toBe(true)
    expect(siehtDeutschAus('keine Zeile gefunden')).toBe(true)
  })

  it('Englisch wird NICHT gemeldet', () => {
    expect(siehtDeutschAus('the value has not been set')).toBe(false)
    expect(siehtDeutschAus('connection refused')).toBe(false)
    expect(siehtDeutschAus('')).toBe(false)
  })
})

describe('Ausgaben im Baum finden', () => {
  it('findet deutsche Ausgaben — und ignoriert Nicht-Ausgaben', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-sprach-'))
    try {
      writeFileSync(join(ordner, 'a.mjs'), "console.log('die Datei fehlt')\nconst x = 'die Datei fehlt'\n", 'utf8')
      writeFileSync(join(ordner, 'b.mjs'), "console.log('file missing')\n", 'utf8')
      const gefunden = sammle(ordner)
      // Nur `a.mjs` — und dort nur **ein** Literal: die Zuweisung ist keine Ausgabe.
      expect(gefunden).toEqual({ 'a.mjs': 1 })
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  it('findet auch in Unterordnern und in Hüllen', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-sprach-'))
    try {
      mkdirSync(join(ordner, 'tief', 'tiefer'), { recursive: true })
      writeFileSync(join(ordner, 'tief', 'tiefer', 'c.mjs'), "process.stderr.write('kein Beleg')\n", 'utf8')
      writeFileSync(join(ordner, 'd.ps1'), 'Write-Host "der Pfad fehlt"\n', 'utf8')
      const gefunden = sammle(ordner)
      expect(Object.keys(gefunden).sort()).toEqual(['d.ps1', 'tief/tiefer/c.mjs'])
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  it('Testdateien zählen NICHT — sonst wächst die Zahl mit jeder Prüfung', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pmh-sprach-'))
    try {
      writeFileSync(join(ordner, 'e.test.mjs'), "console.log('die Prüfung schlug fehl')\n", 'utf8')
      expect(sammle(ordner)).toEqual({})
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })
})

describe('Die Gegenprobe: eine NEUE Ausgabe MUSS auffallen', () => {
  it('meldet die Zunahme mit Datei und Zahl', () => {
    const befund = zuwachs({ 'a.mjs': 4 }, { 'a.mjs': 1 })
    expect(befund).toEqual([{ datei: 'a.mjs', alt: 1, neu: 4, dazu: 3 }])
  })

  it('eine ganz neue Datei zählt als Zunahme ab null', () => {
    expect(zuwachs({ 'neu.mjs': 2 }, {})).toEqual([{ datei: 'neu.mjs', alt: 0, neu: 2, dazu: 2 }])
  })

  it('Gleichstand ist KEINE Zunahme', () => {
    expect(zuwachs({ 'a.mjs': 3 }, { 'a.mjs': 3 })).toEqual([])
  })

  it('eine ABNEHME wird NICHT gemeldet — sie ist der Fortschritt', () => {
    expect(zuwachs({ 'a.mjs': 1 }, { 'a.mjs': 5 })).toEqual([])
  })

  it('sortiert die größte Zunahme nach vorn', () => {
    const befund = zuwachs({ a: 3, b: 10 }, { a: 0, b: 9 })
    expect(befund.map((b) => b.datei)).toEqual(['a', 'b'])
  })
})
