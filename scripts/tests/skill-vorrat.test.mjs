/**
 * Prüfungen für {@link module:scripts/skill-vorrat}.
 *
 * **Warum hier mehr steht als „die Datei kommt an".** Der Vorrat wird bei **jedem**
 * Start angefaßt, und drei seiner Fehler sind still:
 *
 * 1. **Nie kopiert.** Ein falscher Quellpfad macht aus „bereitgestellt" ein
 *    „unverändert" — der Start meldet Erfolg, und im Home liegt nichts.
 * 2. **Bei jedem Start kopiert.** Ein Vergleich über Zeitstempel statt Inhalt
 *    schreibt einen Baum neu, den der Host beim Start gerade liest.
 * 3. **Veraltet.** Wird additiv kopiert, bleibt eine im Repo gelöschte Datei im
 *    Home liegen; der Skill läuft dann mit einem Rumpf, den niemand mehr findet.
 *
 * Fall 2 und 3 werden an entgegengesetzten Enden geprüft: **nicht angefaßt** heißt
 * gleicher Inhalt **und** gleicher Zeitstempel (geprüft nach einer Pause, damit ein
 * Schreibvorgang ihn sicher bewegt hätte); **ersetzt** heißt, eine Markierungsdatei
 * im Ziel ist danach weg. Die Markierung liegt nur im Ziel, nicht in der Quelle.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { fingerabdruck, stelleBereit, vorratBereitstellen } from '../skill-vorrat.mjs'

/** Angelegte Bäume, die nach jedem Fall wieder weg müssen. */
const baeume = []

afterEach(() => {
  for (const baum of baeume.splice(0)) rmSync(baum, { recursive: true, force: true })
})

/**
 * Legt einen Baum aus `{ relativer Pfad: Inhalt }` an.
 *
 * @param {Record<string, string>} dateien
 * @returns {string} absoluter Pfad
 */
function baum(dateien) {
  const wurzel = mkdtempSync(join(tmpdir(), 'pmh-vorrat-'))
  baeume.push(wurzel)
  for (const [pfad, inhalt] of Object.entries(dateien)) {
    const ziel = join(wurzel, pfad)
    mkdirSync(join(ziel, '..'), { recursive: true })
    writeFileSync(ziel, inhalt)
  }
  return wurzel
}

/** Zwei Bäume für Quelle und Ziel, mit einer Datei als Inhalt. */
function paar(inhalt = 'rumpf') {
  const quelle = baum({ 'SKILL.md': inhalt })
  const ziel = baum({})
  return { quelle, ziel }
}

describe('fingerabdruck', () => {
  test('gleicher Inhalt ergibt denselben Abdruck, egal welcher Baum', () => {
    const a = baum({ 'SKILL.md': 'x', 'references/tief.md': 'y' })
    const b = baum({ 'SKILL.md': 'x', 'references/tief.md': 'y' })
    expect(fingerabdruck(a)).toBe(fingerabdruck(b))
  })

  test('ein geänderter Buchstabe ergibt einen anderen Abdruck', () => {
    const a = baum({ 'SKILL.md': 'x' })
    const b = baum({ 'SKILL.md': 'X' })
    expect(fingerabdruck(a)).not.toBe(fingerabdruck(b))
  })

  test('ein fehlendes Verzeichnis ergibt null', () => {
    expect(fingerabdruck(join(tmpdir(), 'pmh-gibt-es-nicht-4f2a'))).toBeNull()
  })
})

describe('stelleBereit', () => {
  test('erster Lauf kopiert den Baum samt Unterverzeichnis', () => {
    const quelle = baum({ 'SKILL.md': 'rumpf', 'references/tief.md': 'tief' })
    const ziel = join(baum({}), 'design-taste-frontend')

    const ergebnis = stelleBereit({ name: 'design-taste-frontend', quelle, ziel })

    expect(ergebnis.grund).toBe('kopiert')
    expect(ergebnis.geaendert).toBe(true)
    expect(readFileSync(join(ziel, 'SKILL.md'), 'utf8')).toBe('rumpf')
    expect(readFileSync(join(ziel, 'references', 'tief.md'), 'utf8')).toBe('tief')
  })

  test('zweiter Lauf faßt den Zielbaum nicht an', async () => {
    const { quelle, ziel } = paar()
    stelleBereit({ name: 'x', quelle, ziel })
    const vorher = statSync(join(ziel, 'SKILL.md')).mtimeMs

    // Zwanzig Millisekunden: ein Schreibvorgang hätte den Zeitstempel sicher bewegt,
    // ein unangetasteter Baum behält ihn auf die Millisekunde genau.
    await new Promise((fertig) => setTimeout(fertig, 20))
    const ergebnis = stelleBereit({ name: 'x', quelle, ziel })

    expect(ergebnis.geaendert).toBe(false)
    expect(ergebnis.grund).toBe('unveraendert')
    expect(statSync(join(ziel, 'SKILL.md')).mtimeMs).toBe(vorher)
  })

  test('geänderter Inhalt wird übernommen und ersetzt das Ziel', () => {
    const { quelle, ziel } = paar('alt')
    stelleBereit({ name: 'x', quelle, ziel })
    writeFileSync(join(ziel, 'nur-im-ziel.md'), 'steht hier')
    writeFileSync(join(quelle, 'SKILL.md'), 'neu')

    const ergebnis = stelleBereit({ name: 'x', quelle, ziel })

    expect(ergebnis.grund).toBe('kopiert')
    expect(readFileSync(join(ziel, 'SKILL.md'), 'utf8')).toBe('neu')
    expect(existsSync(join(ziel, 'nur-im-ziel.md'))).toBe(false)
  })

  test('eine im Repo gelöschte Datei verschwindet auch im Ziel', () => {
    const quelle = baum({ 'SKILL.md': 'rumpf', 'references/alt.md': 'alt' })
    const ziel = join(baum({}), 'skill')
    stelleBereit({ name: 'skill', quelle, ziel })
    expect(existsSync(join(ziel, 'references', 'alt.md'))).toBe(true)

    rmSync(join(quelle, 'references', 'alt.md'))
    const ergebnis = stelleBereit({ name: 'skill', quelle, ziel })

    expect(ergebnis.grund).toBe('kopiert')
    expect(existsSync(join(ziel, 'references', 'alt.md'))).toBe(false)
  })

  test('fehlende Quelle ist kein Wurf, sondern ein Befund', () => {
    const ziel = join(baum({}), 'skill')
    const ergebnis = stelleBereit({ name: 'skill', quelle: join(tmpdir(), 'pmh-fehlt-9c1b'), ziel })
    expect(ergebnis.grund).toBe('quelle-fehlt')
    expect(ergebnis.geaendert).toBe(false)
    expect(existsSync(ziel)).toBe(false)
  })
})

describe('vorratBereitstellen', () => {
  test('legt den Vorrat unter <home>/skills ab', () => {
    const wurzel = baum({ '.agents/skills/design-taste-frontend/SKILL.md': 'rumpf' })
    const home = baum({})

    const ergebnisse = vorratBereitstellen(home, { wurzel })

    expect(ergebnisse).toHaveLength(1)
    expect(ergebnisse[0].name).toBe('design-taste-frontend')
    expect(ergebnisse[0].ziel).toBe(join(home, 'skills', 'design-taste-frontend'))
    expect(readFileSync(join(home, 'skills', 'design-taste-frontend', 'SKILL.md'), 'utf8')).toBe('rumpf')
  })

  test('zwei Läufe hintereinander ergeben beim zweiten „unverändert"', () => {
    const wurzel = baum({ '.agents/skills/design-taste-frontend/SKILL.md': 'rumpf' })
    const home = baum({})

    vorratBereitstellen(home, { wurzel })
    const zweiter = vorratBereitstellen(home, { wurzel })

    expect(zweiter[0].grund).toBe('unveraendert')
  })
})
