/**
 * `scripts/maschinenpfade.mjs` — Prüfung des Werkzeugs selbst (E4).
 *
 * ## Warum die Muster ALLGEMEIN sein müssen — und wie das geprüft wird
 *
 * Eine Prüfung, die `Chang` sucht, wäre **selbst maschinengebunden** und auf dem
 * nächsten Rechner blind. Deshalb wird hier mit **erfundenen** Benutzernamen
 * gearbeitet: `erika`, `otto`. Findet das Werkzeug die, ist es nicht auf einen
 * Namen gemünzt.
 */

import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ausgenommen, fuehreAus, sammle, untersuche } from './maschinenpfade.mjs'

/** Ein Wegwerf-Baum mit Fixtures. */
function baum() {
  const wurzel = mkdtempSync(join(tmpdir(), 'pmh-pfade-'))
  writeFileSync(join(wurzel, 'mit.mjs'), "const A = 'C:\\\\Users\\\\erika\\\\repo'\nconst B = '/home/otto/repo'\n", 'utf8')
  writeFileSync(join(wurzel, 'ohne.mjs'), "const A = '<repo>'\nconst B = '%PMH_HOME%'\n", 'utf8')
  mkdirSync(join(wurzel, 'node_modules'))
  writeFileSync(join(wurzel, 'node_modules', 'fremd.mjs'), "const A = 'C:\\\\Users\\\\erika\\\\x'\n", 'utf8')
  mkdirSync(join(wurzel, 'docs'))
  mkdirSync(join(wurzel, 'docs', 'dsh'))
  writeFileSync(join(wurzel, 'docs', 'dsh', 'kern.md'), 'Pfad: C:\\Users\\erika\\upstream\n', 'utf8')
  return wurzel
}

describe('Das Werkzeug findet die FORMEN, nicht einen Namen', () => {
  test('Windows-Profil und POSIX-Home werden gefunden — mit erfundenen Namen', () => {
    const wurzel = baum()
    try {
      const funde = untersuche(wurzel, 'mit.mjs')
      expect(funde).toHaveLength(2)
      expect(funde.map((f) => f.form).sort()).toEqual(['POSIX-Home', 'Windows-Benutzerprofil'])
      expect(funde[0]?.zeile).toBe(1)
      expect(funde[1]?.zeile).toBe(2)
    } finally {
      rmSync(wurzel, { recursive: true, force: true })
    }
  })

  test('Platzhalter sind KEIN Fund', () => {
    const wurzel = baum()
    try {
      expect(untersuche(wurzel, 'ohne.mjs')).toHaveLength(0)
    } finally {
      rmSync(wurzel, { recursive: true, force: true })
    }
  })

  test('node_modules und die kopierte Core-Doku werden übersprungen', () => {
    // **Rauschen wird ignoriert — also muß es wegbleiben.** Die Pfade in
    // `docs/dsh/` gehören zum Upstream und sind nicht unsere.
    const wurzel = baum()
    try {
      const dateien = sammle(wurzel)
      expect(dateien).toContain('mit.mjs')
      expect(dateien).toContain('ohne.mjs')
      expect(dateien).not.toContain('node_modules/fremd.mjs')
      expect(dateien).not.toContain('docs/dsh/kern.md')
    } finally {
      rmSync(wurzel, { recursive: true, force: true })
    }
  })

  test('die Ausnahmeliste greift auch für verschachtelte Pfade', () => {
    expect(ausgenommen('node_modules/x/y.mjs')).toBe(true)
    expect(ausgenommen('docs/dsh/original/a.md')).toBe(true)
    expect(ausgenommen('docs/status/b.md')).toBe(false)
  })
})

describe('Die Befehle', () => {
  test('berichten ergibt Exit 0, --streng bei Fund Exit 1', () => {
    const wurzel = baum()
    try {
      const aus = []
      const schreibe = (t) => aus.push(t)
      expect(fuehreAus(['pruefen', wurzel], process.env, schreibe)).toBe(0)
      expect(aus.join('')).toContain('MASCHINENGEBUNDENE PFADE')
      expect(aus.join('')).toContain('mit.mjs')
      const aus2 = []
      expect(fuehreAus(['pruefen', wurzel, '--streng'], process.env, (t) => aus2.push(t))).toBe(1)
    } finally {
      rmSync(wurzel, { recursive: true, force: true })
    }
  })

  test('ohne Befehl: Exit 1 und der Aufruf', () => {
    const aus = []
    expect(fuehreAus([], process.env, (t) => aus.push(t))).toBe(1)
    expect(aus.join('')).toContain('Aufruf:')
  })

  test('ein Verzeichnis, das es nicht gibt: Exit 2', () => {
    expect(fuehreAus(['pruefen', 'gibt-es-sicher-nicht-12345'], process.env, () => undefined)).toBe(2)
  })
})
