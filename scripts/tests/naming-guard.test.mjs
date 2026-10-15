#!/usr/bin/env bun
/**
 * Prüfungen für `scripts/naming-guard.mjs` — den Wächter über Regel 42.
 *
 * ## Worauf diese Prüfungen zielen
 *
 * **Nicht „der Wächter läuft", sondern: wird er rot, wo er rot werden muß?** Ein Wächter, dessen
 * Gegenprobe nicht rot wird, mißt nichts (Regel 5). Deshalb steht hier **jedes** Signal einmal
 * als Fund und einmal als Nicht-Fund — und der wichtigste Fall ist der, den ein naiver Bau
 * falsch macht: `standard` enthält `stand`.
 *
 * ## Der zweite Teil: der Baum wird befragt, nicht der Wächter geglaubt
 *
 * Die acht umbenannten Pakete sind der **Vollzug** von Regel 42. Wenn eines davon wieder
 * auftaucht, war die Umbenennung nicht vollständig — das ist eine Aussage über den **Baum**, und
 * sie wird hier gegen den echten Baum geprüft, nicht gegen eine Erinnerung.
 *
 * @module scripts/tests/naming-guard
 */

import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  ENGLISCHE_PFLICHTNAMEN,
  WURZELN,
  gegenprobe,
  pruefeBaum,
  pruefeName,
} from '../naming-guard.mjs'

const WURZEL = join(import.meta.dir, '..', '..')

describe('Ein einzelner Name', () => {
  test('englische Namen gehen durch — auch mit Bindestrich, Unterstrich und Endung', () => {
    for (const name of [
      'provider-directory',
      'families.ts',
      'naming-guard.mjs',
      'probe.ts',
      'build.mjs',
      '0001_identitaet.sql'.replace('identitaet', 'identity'),
    ]) {
      expect(pruefeName(name)).toEqual({ ok: true })
    }
  })

  test('ein deutsches Segment wird rot — als ganzes Segment', () => {
    const befund = pruefeName('verzeichnis.ts')
    expect(befund.ok).toBe(false)
    expect(befund.art).toBe('wort')
    expect(befund.segment).toBe('verzeichnis')
  })

  test('auch ein deutscher ORDNERNAME wird rot', () => {
    expect(pruefeName('sprachen').ok).toBe(false)
    expect(pruefeName('messsonden').segment).toBe('messsonden')
  })

  test('Nicht-ASCII wird rot, ohne daß ein Wörterbuch nötig wäre', () => {
    const befund = pruefeName('prüfung.mjs')
    expect(befund.ok).toBe(false)
    expect(befund.art).toBe('nicht-ascii')
    expect(befund.segment).toBe('ü')
  })

  test('DER FALL, an dem ein Teilstringvergleich scheitert: standard enthält stand', () => {
    // Wäre hier ein `includes` statt eines Segmentvergleichs gebaut, stünde `standard` als
    // deutscher Name im Bericht — und der Wächter wäre unglaubwürdig.
    expect(pruefeName('standard.ts')).toEqual({ ok: true })
    expect(pruefeName('schema-stand.mjs').ok).toBe(false)
  })

  test('ein leerer Name ist ein Aufruffehler, kein stilles Ja', () => {
    expect(() => pruefeName('')).toThrow(TypeError)
  })
})

describe('Die Gegenprobe im Speicher', () => {
  test('schmutziger Baum wird rot, sauberer bleibt grün, Ausnahme greift statt Verstoß', () => {
    const g = gegenprobe()
    expect(g.rotWird).toBe(true)
    expect(g.gruenBleibt).toBe(true)
    expect(g.ausnahmeGreift).toBe(true)
    expect(g.schmutzig.verstoesse).toHaveLength(2)
    expect(g.sauber.verstoesse).toHaveLength(0)
  })

  test('der ausgenommene Pfad wird GEZÄHLT, nicht verschwiegen', () => {
    const g = gegenprobe()
    expect(g.schmutzig.mitGrund).toHaveLength(1)
    expect(g.schmutzig.mitGrund[0]?.warum).toContain('Schemafassung')
  })
})

describe('Der echte Baum', () => {
  test('jede geprüfte Wurzel ist vorhanden — sonst prüfte der Wächter weniger, als er sagt', () => {
    for (const name of WURZELN) {
      expect(existsSync(join(WURZEL, name))).toBe(true)
    }
  })

  test('die acht Pflichtnamen stehen als Ordner im Baum — Regel 42 auf Paketebene', () => {
    const orte = [
      'packages/ai/capabilities',
      'packages/ai/provider-directory',
      'packages/ai/directory-curator',
      'packages/ai/settings',
      'packages/ai/guard',
      'packages/ai/local',
      'packages/ai/composition',
      'packages/client/source-folders',
    ]
    expect(ENGLISCHE_PFLICHTNAMEN).toHaveLength(orte.length)
    for (const ort of orte) {
      expect(existsSync(join(WURZEL, ort))).toBe(true)
    }
  })

  test('keiner der acht alten Namen steht mehr als Ordner im Baum', () => {
    // Das ist die Gegenrichtung: die Umbenennung ist erst dann vollzogen, wenn das ALTE fehlt.
    for (const alt of [
      'packages/ai/faehigkeiten',
      'packages/ai/verzeichnis',
      'packages/ai/verwalter',
      'packages/ai/einstellungen',
      'packages/ai/waechter',
      'packages/client/quellordner',
    ]) {
      expect(existsSync(join(WURZEL, alt))).toBe(false)
    }
  })

  test('der Prüflauf zählt mehr als 1000 Namen — eine leere Prüfung wäre kein Beweis', () => {
    const lauf = pruefeBaum(WURZEL)
    expect(lauf.geprueft).toBeGreaterThan(1000)
    // **Der Befund wird als Zahl festgehalten, nicht als Erwartung „null".** Am 15.10.2026 waren
    // es 82 (docs/status/naming-rest.md). Diese Prüfung hält fest, daß der Wächter sie FINDET;
    // sie behauptet nicht, daß es keine gibt.
    expect(lauf.verstoesse.length).toBeGreaterThan(0)
    expect(lauf.mitGrund.length).toBeGreaterThan(0)
  })

  test('jeder Verstoß nennt einen Grund — ein Fund ohne Grund ist keine Auskunft', () => {
    const lauf = pruefeBaum(WURZEL)
    for (const v of lauf.verstoesse) {
      expect(v.grund.length).toBeGreaterThan(0)
      expect(v.segment.length).toBeGreaterThan(0)
    }
    for (const a of lauf.mitGrund) {
      expect(a.warum.length).toBeGreaterThan(0)
    }
  })
})
