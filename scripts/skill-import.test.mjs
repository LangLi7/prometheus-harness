/**
 * `scripts/skill-import.test.mjs` — Prüfung des Werkzeugs selbst.
 *
 * ## Warum gegen den echten Parser geprüft wird
 *
 * Ein Test, der nur meine eigene Erwartung an das Frontmatter wiederholt, wäre
 * blind für genau den Fehler, der die Sammlung unsichtbar machte: `name` da, aber
 * nicht in der Grammatik des Anbieters. Deshalb liest der dritte Fall das Ergebnis
 * mit `parseSkillText` aus `skill-filesystem` — demselben Code, der später den
 * Katalog füllt.
 */

import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseSkillText } from '../packages/skill/skill-filesystem/src/frontmatter.ts'
import { entschaerfe, importiere, uebersetze } from './skill-import.mjs'

/** Eine Claude-Datei, wie sie in der Sammlung steht. */
const CLAUDE = `# SKILL: Cross-Site Scripting (XSS)

## Metadata
- **Skill Name**: xss
- **Folder**: offensive-xss
- **Source**: https://example.invalid/xss.md

## Description
Testing checklist for stored, reflected and DOM XSS.

## Trigger Phrases
Use this skill when the conversation involves any of:
\`XSS, cross-site scripting\`

## Inhalt
Ein Absatz Methode.
`

describe('uebersetze', () => {
  test('liest Name, Beschreibung und Auslöser aus den Überschriften', () => {
    const ergebnis = uebersetze(CLAUDE, 'offensive-xss')
    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.name).toBe('offensive-xss')
    expect(ergebnis.description).toBe('Testing checklist for stored, reflected and DOM XSS.')
    expect(ergebnis.whenToUse).toContain('XSS, cross-site scripting')
  })

  test('entfernt die Claude-Blöcke aus dem Rumpf', () => {
    const ergebnis = uebersetze(CLAUDE, 'offensive-xss')
    expect(ergebnis.body).not.toContain('## Metadata')
    expect(ergebnis.body).not.toContain('Trigger Phrases')
    expect(ergebnis.body).toContain('## Inhalt')
  })

  test('meldet eine Datei ohne Beschreibung statt sie zu raten', () => {
    const ergebnis = uebersetze('# SKILL: leer\n\n## Metadata\n- **Skill Name**: leer\n', 'leer')
    expect(ergebnis.ok).toBe(false)
  })
})

describe('entschaerfe', () => {
  test('ersetzt einen Superglobal-Aufruf', () => {
    const { text, treffer } = entschaerfe("<?php echo shell_exec($_REQUEST['cmd']); ?>")
    expect(treffer).toHaveLength(1)
    expect(text).not.toContain("shell_exec($_REQUEST['cmd'])")
    expect(text).toContain('shell_exec(/* payload removed */)')
  })

  test('lässt ein Lehrbeispiel ohne Superglobal stehen', () => {
    const { text, treffer } = entschaerfe("shell_exec('id')")
    expect(treffer).toHaveLength(0)
    expect(text).toBe("shell_exec('id')")
  })
})

describe('importiere', () => {
  test('übernimmt eine Datei, die schon Frontmatter hat', () => {
    const wurzel = mkdtempSync(join(tmpdir(), 'skill-import-'))
    try {
      const quelle = join(wurzel, 'Skills', 'offensive-persistence')
      mkdirSync(quelle, { recursive: true })
      writeFileSync(
        join(quelle, 'SKILL.md'),
        `---\nname: offensive-persistence\ndescription: "Persistence tradecraft."\n---\n\n# Persistence\n\n<?php echo shell_exec($_REQUEST['cmd']); ?>\n`,
        'utf8',
      )
      const ziel = join(wurzel, 'ziel')

      const bericht = importiere(join(wurzel, 'Skills'), ziel)
      expect(bericht.importiert).toEqual(['offensive-persistence'])
      expect(bericht.entschaerft).toHaveLength(1)

      const roh = readFileSync(join(ziel, 'offensive-persistence', 'SKILL.md'), 'utf8')
      expect(roh).not.toContain("shell_exec($_REQUEST['cmd'])")
      const gelesen = parseSkillText(roh)
      expect(gelesen.ok).toBe(true)
    } finally {
      rmSync(wurzel, { recursive: true, force: true })
    }
  })

  test('schreibt eine Datei, die der Katalog-Parser annimmt', () => {
    const wurzel = mkdtempSync(join(tmpdir(), 'skill-import-'))
    try {
      const quelle = join(wurzel, 'Skills', 'web', 'offensive-xss')
      mkdirSync(quelle, { recursive: true })
      writeFileSync(join(quelle, 'SKILL.md'), CLAUDE, 'utf8')
      const ziel = join(wurzel, 'ziel')

      const bericht = importiere(join(wurzel, 'Skills'), ziel)
      expect(bericht.importiert).toEqual(['offensive-xss'])

      const gelesen = parseSkillText(readFileSync(join(ziel, 'offensive-xss', 'SKILL.md'), 'utf8'))
      expect(gelesen.ok).toBe(true)
      if (gelesen.ok) {
        expect(gelesen.skill.name).toBe('offensive-xss')
        expect(gelesen.skill.description).toContain('Testing checklist')
        expect(gelesen.skill.whenToUse).toContain('XSS')
      }
    } finally {
      rmSync(wurzel, { recursive: true, force: true })
    }
  })

  test('überschreibt ohne --force nicht, was schon liegt', () => {
    const wurzel = mkdtempSync(join(tmpdir(), 'skill-import-'))
    try {
      const quelle = join(wurzel, 'Skills', 'offensive-xss')
      mkdirSync(quelle, { recursive: true })
      writeFileSync(join(quelle, 'SKILL.md'), CLAUDE, 'utf8')
      const ziel = join(wurzel, 'ziel')

      importiere(join(wurzel, 'Skills'), ziel)
      const zweiter = importiere(join(wurzel, 'Skills'), ziel)
      expect(zweiter.importiert).toEqual([])
      expect(zweiter.uebersprungen).toHaveLength(1)
    } finally {
      rmSync(wurzel, { recursive: true, force: true })
    }
  })
})
