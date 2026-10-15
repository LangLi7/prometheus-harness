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
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ENGLISCHE_PFLICHTNAMEN,
  WURZELN,
  gegenprobe,
  pruefeBaum,
  pruefeName,
  sammleVerstoesse,
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
      'login.test.ts',
      '0001_identity.sql',
    ]) {
      expect(pruefeName(name)).toEqual({ ok: true })
    }
  })

  test('die drei Wörter, die Zug 2 nachgetragen hat — der Wächter hätte sie vorher NICHT gesehen', () => {
    // Gemessen am 15.10.2026: `claim-ablage.ts`, `erstlogin.test.ts` und `http-schicht.test.ts`
    // standen in keiner Liste. Sie sind inzwischen umbenannt; diese Prüfung hält fest, daß die
    // LISTE sie jetzt kennt — sonst wäre der Nachtrag eine Behauptung ohne Gegenprobe.
    expect(pruefeName('claim-ablage.ts').segment).toBe('ablage')
    expect(pruefeName('erstlogin.test.ts').segment).toBe('erstlogin')
    expect(pruefeName('http-schicht.test.ts').segment).toBe('schicht')
  })

  test('dasselbe zum dritten Mal in Zug 3b: rls-verhalten', () => {
    // Gefunden hat das nicht der Wächter, sondern das AUFZÄHLEN der Dateien im Fixture-Ordner.
    // Genau deshalb steht in naming-rest.md: der Umfang wächst mit jedem Zug.
    expect(pruefeName('rls-verhalten.sql').segment).toBe('verhalten')
    expect(pruefeName('rls-behavior.sql')).toEqual({ ok: true })
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

describe('Unter docs/ zählt CODE, eine Notiz nicht', () => {
  /** Baut einen künstlichen docs-Baum. @param teile - Pfadteile, die angelegt werden */
  function mitDocs(teile) {
    const haus = mkdtempSync(join(tmpdir(), 'pmh-docs-'))
    for (const t of teile) {
      const pfad = join(haus, 'docs', t)
      mkdirSync(join(pfad, '..'), { recursive: true })
      writeFileSync(pfad, '')
    }
    return haus
  }

  test('eine Codedatei mit deutschem Namen wird rot, eine Notiz NICHT', () => {
    const haus = mitDocs(['status/sonde.mjs', 'status/arbeitsweise.md'])
    try {
      const b = sammleVerstoesse(join(haus, 'docs'), { nurCode: true, ausgenommen: [] })
      expect(b.verstoesse.map((v) => v.name)).toEqual(['sonde.mjs'])
    } finally {
      rmSync(haus, { recursive: true, force: true })
    }
  })

  test('ein CODeordner zählt, ein Notizordner nicht', () => {
    const haus = mitDocs(['messsonden/strom-sonde.mjs', 'notizen/aufsatz.md'])
    try {
      const b = sammleVerstoesse(join(haus, 'docs'), { nurCode: true, ausgenommen: [] })
      const namen = b.verstoesse.map((v) => v.name)
      expect(namen).toContain('messsonden')
      expect(namen).toContain('strom-sonde.mjs')
      expect(namen).not.toContain('notizen')
    } finally {
      rmSync(haus, { recursive: true, force: true })
    }
  })

  test('OHNE den Code-Modus zählt dieselbe Notiz sehr wohl — der Unterschied ist die Einstellung', () => {
    // Die Gegenprobe zur Gegenprobe: ohne `nurCode` wäre die Notiz ein Verstoß, und der Wächter
    // würde jede Notiz melden. **Der Name muß ein Wort aus der LISTE tragen** — `arbeitsweise.md`
    // wäre ein schlechtes Beispiel: „arbeitsweise" steht nicht in der Liste, die Notiz wäre also
    // auch ohne den Code-Modus grün. (Das war der erste Fehler dieser Prüfung.)
    const haus = mitDocs(['status/protokoll.md'])
    try {
      const mit = sammleVerstoesse(join(haus, 'docs'), { nurCode: true, ausgenommen: [] })
      const ohne = sammleVerstoesse(join(haus, 'docs'), { ausgenommen: [] })
      expect(mit.verstoesse).toHaveLength(0)
      expect(ohne.verstoesse.map((v) => v.name)).toEqual(['protokoll.md'])
    } finally {
      rmSync(haus, { recursive: true, force: true })
    }
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
