#!/usr/bin/env bun
/**
 * Prüfungen für `scripts/reference-guard.mjs` — den Wächter über tote Verweise.
 *
 * ## Worauf diese Prüfungen zielen
 *
 * **Nicht „der Wächter läuft", sondern: erfindet er Befunde?** Ein Wächter, der eine Adresse
 * meldet, die es sehr wohl gibt, ist schlimmer als keiner: er wird abgeschaltet. Deshalb steht hier
 * **jede** Fehlerquelle, die der Bau dieses Werkzeugs am 15.10.2026 wirklich gehabt hat, als eigene
 * Prüfung:
 *
 * * `tests/lebend.test.ts` — im Paket **paketlokal** gemeint, von der Wurzel aus falsch. Der erste
 *   Lauf meldete das als tot.
 * * `packages/*` — ein **Muster**, keine Adresse.
 * * `../migrations/…` — **relativ**, ohne Basis nicht prüfbar.
 * * ein Verweis in einem **datierten Bericht** — Geschichte, kein Defekt.
 *
 * @module scripts/tests/reference-guard
 */

import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  gegenprobe,
  istDokument,
  lebendig,
  pruefeVerweise,
  verfolgteDateien,
  zieheAdressen,
} from '../reference-guard.mjs'

const WURZEL = join(import.meta.dir, '..', '..')

describe('Adressen aus einem Text ziehen', () => {
  test('eine Adresse mit Endung wird erkannt, Satzzeichen am Ende fallen weg', () => {
    const b = zieheAdressen('Siehe `scripts/typecheck.mjs`, und dann docs/status/naming-plan.md.')
    expect(b.adressen).toContain('scripts/typecheck.mjs')
    expect(b.adressen).toContain('docs/status/naming-plan.md')
  })

  test('ein MUSTER ist keine Adresse und wird nur gezählt', () => {
    const b = zieheAdressen('gilt für packages/*/* und docs/**')
    expect(b.adressen).toHaveLength(0)
    expect(b.muster).toBeGreaterThan(0)
  })

  test('eine RELATIVE Angabe wird gezählt, nicht geprüft', () => {
    const b = zieheAdressen("import m from '../migrations/0004_mandantentrennung.sql'")
    expect(b.adressen).toHaveLength(0)
    expect(b.relativ).toBe(1)
  })

  test('eine Angabe OHNE Endung ist ein Name, keine Adresse', () => {
    const b = zieheAdressen('das Paket packages/ai/capabilities und nichts weiter')
    expect(b.adressen).toHaveLength(0)
    expect(b.ohneEndung).toBeGreaterThan(0)
  })
})

describe('Dokument oder Code', () => {
  test('md, txt und jsonl sind überall Dokumente', () => {
    expect(istDokument('docs/status/naming-plan.md')).toBe(true)
    expect(istDokument('README.md')).toBe(true)
    expect(istDokument('docs/protokoll/aufsicht/protokoll.jsonl')).toBe(true)
  })

  test('json ist NUR unter docs ein Dokument', () => {
    expect(istDokument('docs/status/sprachbasis.json')).toBe(true)
    expect(istDokument('package.json')).toBe(false)
    expect(istDokument('apps/login_web/package.json')).toBe(false)
  })

  test('ein ausführbares Meßwerkzeug unter docs ist CODE — es ist kein Bericht', () => {
    expect(istDokument('docs/status/messsonden/startkosten.mjs')).toBe(false)
  })
})

describe('Von welcher Basis aus lebt eine Adresse', () => {
  test('paketlokal: tests/… wird über die Elternstufe gefunden', () => {
    // Der Fall, der den ersten Lauf falsch gemacht hat.
    const haus = mkdtempSync(join(tmpdir(), 'pmh-lebendig-'))
    try {
      mkdirSync(join(haus, 'paket', 'src'), { recursive: true })
      mkdirSync(join(haus, 'paket', 'tests'), { recursive: true })
      writeFileSync(join(haus, 'paket', 'tests', 'da.test.ts'), '')
      expect(lebendig(haus, 'paket/src/x.ts', 'tests/da.test.ts')).toBe(true)
    } finally {
      rmSync(haus, { recursive: true, force: true })
    }
  })

  test('von der Wurzel aus: scripts/… wird über die Wurzel gefunden', () => {
    expect(lebendig(WURZEL, 'package.json', 'scripts/typecheck.mjs')).toBe(true)
  })

  test('eine erfundene Adresse bleibt tot — auch über alle Elternstufen', () => {
    expect(lebendig(WURZEL, 'package.json', 'scripts/gibt-es-nicht.mjs')).toBe(false)
  })
})

describe('Die Gegenprobe im Speicher', () => {
  test('rot wo rot, grün wo grün, Dokument zählt nicht, paketlokal wird erkannt', () => {
    const g = gegenprobe()
    expect(g.rotWird).toBe(true)
    expect(g.gruenBleibt).toBe(true)
    expect(g.dokumentZaehltNicht).toBe(true)
    expect(g.paketlokalErkannt).toBe(true)
  })

  test('die Gegenprobe ist scharf: der tote Verweis hat einen Namen', () => {
    const g = gegenprobe()
    expect(g.schmutzig.tote).toHaveLength(1)
    expect(g.schmutzig.tote[0]?.adresse).toBe('scripts/weg.mjs')
    expect(g.schmutzig.tote[0]?.istCode).toBe(true)
  })
})

describe('Der echte Baum', () => {
  test('die Dateiliste kommt aus git — das ist unsere Menge', () => {
    const m = verfolgteDateien(WURZEL)
    expect(m.quelle).toBe('git')
    expect(m.dateien.length).toBeGreaterThan(500)
  })

  test('der Prüflauf nennt Zahlen, keine Behauptungen', () => {
    const lauf = pruefeVerweise(WURZEL)
    expect(lauf.geprueftDateien).toBeGreaterThan(500)
    expect(lauf.adressen.length).toBeGreaterThan(500)
    // **Kein „null" als Erwartung.** Am 15.10.2026 waren es 48 im Code (docs/status/reference-lauf.txt).
    // Diese Prüfung hält fest, daß der Wächter sie FINDET — sie behauptet nicht, daß es keine gibt.
    expect(lauf.tote.filter((t) => t.istCode).length).toBeGreaterThan(0)
  })

  test('jeder Fund nennt Adresse und Quelle — ein Fund ohne Ort ist keine Auskunft', () => {
    const lauf = pruefeVerweise(WURZEL)
    for (const t of lauf.tote) {
      expect(t.adresse.length).toBeGreaterThan(0)
      expect(t.quelle.length).toBeGreaterThan(0)
      expect(typeof t.istCode).toBe('boolean')
    }
  })
})
