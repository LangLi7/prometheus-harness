/**
 * Prüfungen des Katalogs und des Werkzeugs `skill`.
 *
 * Der Schwerpunkt liegt auf den zwei Zusagen, die dieses Paket gibt: der Katalog zeigt
 * **nichts**, was das Modell nicht laden darf, und das Werkzeug liefert **genau** den Rumpf,
 * den die Registry für diesen Namen gewählt hat.
 */

import { describe, expect, test } from 'bun:test'

import { SkillRegistry, type SkillSummary } from '@prometheus-harness/skill'
import {
  aufgerufeneSkills,
  benutzerSkills,
  beschreibungKuerzen,
  katalogDigest,
  katalogEintraege,
  katalogErsetzung,
  katalogText,
  skillWerkzeug,
} from '../src/index.ts'

function zusammenfassung(
  name: string,
  description = `Beschreibung von ${name}`,
  modelInvocable = true,
  userInvocable = true,
): SkillSummary {
  return {
    name,
    description,
    invocation: { modelInvocable, userInvocable },
    source: 'custom',
    provider: 'test',
  }
}

function werkzeugMit(skills: Record<string, string>, schalter: { modelInvocable: boolean } = { modelInvocable: true }) {
  const registry = new SkillRegistry()
  for (const [name, content] of Object.entries(skills)) {
    registry.register({
      name,
      description: `Beschreibung von ${name}`,
      source: 'runtime',
      content,
      invocation: { modelInvocable: schalter.modelInvocable, userInvocable: true },
    })
  }
  return { registry, werkzeug: skillWerkzeug(registry) }
}

const kontext = { signal: undefined, step: 1, callId: 'call-1' }

describe('Werkzeug skill', () => {
  test('trägt den Namen, eine Beschreibung und ein Parameterschema', () => {
    const { werkzeug } = werkzeugMit({})
    expect(werkzeug.name).toBe('skill')
    expect(werkzeug.description).toContain('Fähigkeit')
    const parameter = werkzeug.parameters as {
      required?: string[]
      properties?: Record<string, { type?: string }>
    }
    expect(parameter.required).toEqual(['name'])
    expect(parameter.properties?.['name']?.type).toBe('string')
  })

  test('lädt den Rumpf als <skill_content>', async () => {
    const { werkzeug } = werkzeugMit({ 'code-review': 'Prüfe den Code.' })
    const ergebnis = await werkzeug.execute({ name: 'code-review' }, kontext)
    expect(ergebnis).toContain('<skill_content name="code-review">')
    expect(ergebnis).toContain('Prüfe den Code.')
    expect(ergebnis).toContain('</skill_content>')
  })

  test('unbekannter und ungültiger Name werden zum Fehler, den der Loop abfängt', async () => {
    const { werkzeug } = werkzeugMit({ bekannt: 'x' })
    await expect(werkzeug.execute({ name: 'fehlt' }, kontext)).rejects.toThrow('unbekannt')
    await expect(werkzeug.execute({ name: 'Gross' }, kontext)).rejects.toThrow('ungültiger')
    await expect(werkzeug.execute({}, kontext)).rejects.toThrow('fehlt')
    await expect(werkzeug.execute({ name: 42 }, kontext)).rejects.toThrow('kein Text')
  })

  test('eine Fähigkeit ohne Modell-Freigabe wird auch beim Werkzeug abgelehnt', async () => {
    const { werkzeug } = werkzeugMit({ 'nur-mensch': 'x' }, { modelInvocable: false })
    await expect(werkzeug.execute({ name: 'nur-mensch' }, kontext)).rejects.toThrow('nicht freigegeben')
  })

  test('ein Abbruch verhindert das Laden', async () => {
    const { werkzeug } = werkzeugMit({ langsam: 'x' })
    const controller = new AbortController()
    controller.abort(new Error('genug'))
    await expect(
      werkzeug.execute({ name: 'langsam' }, { ...kontext, signal: controller.signal }),
    ).rejects.toThrow('genug')
  })
})

describe('Katalog', () => {
  test('filtert Modell-Freigabe, sortiert und läßt Felder weg', () => {
    const eintraege = katalogEintraege([
      zusammenfassung('zweit'),
      zusammenfassung('nur-mensch', 'x', false),
      zusammenfassung('erst'),
    ])
    expect(eintraege.map((entry) => entry.name)).toEqual(['erst', 'zweit'])
    expect(Object.keys(eintraege[0] ?? {})).toEqual(['name', 'description'])
  })

  test('ein leerer Katalog ergibt keinen Text', () => {
    expect(katalogText([])).toBe('')
    expect(katalogText([zusammenfassung('nur-mensch', 'x', false)])).toBe('')
  })

  test('rendert die Rahmung mit Namen und entschärfter Beschreibung', () => {
    const text = katalogText([zusammenfassung('review', 'Prüft <Code> & Regeln')])
    expect(text).toContain('<system-reminder>')
    expect(text).toContain('<available_skills>')
    expect(text).toContain('- `review`: Prüft &lt;Code&gt; &amp; Regeln')
    expect(text).toContain('Werkzeug `skill`')
    expect(text.endsWith('</system-reminder>')).toBe(true)
  })

  test('kürzt Beschreibungen auf die Grenze einschließlich der Punkte', () => {
    expect(beschreibungKuerzen('  a   b  ')).toBe('a b')
    const gekuerzt = beschreibungKuerzen('x'.repeat(20), 10)
    expect(gekuerzt).toBe('xxxxxxx...')
    expect(gekuerzt).toHaveLength(10)
    expect(() => beschreibungKuerzen('x', 2)).toThrow('≥ 3')
  })

  test('der Ersatzkatalog sagt, daß er ersetzt — auch wenn er leer ist', () => {
    const voll = katalogErsetzung([zusammenfassung('neu')])
    expect(voll).toContain('ersetzt jede frühere Liste')
    expect(voll).toContain('- `neu`')

    const leer = katalogErsetzung([])
    expect(leer).toContain('keine Fähigkeiten')
    expect(leer).toContain('keine Namen aus früheren Katalogen')
  })
})

describe('Digest', () => {
  test('gleiche Einträge ergeben denselben Wert, andere einen anderen', () => {
    const eins = katalogEintraege([zusammenfassung('a', 'x'), zusammenfassung('b', 'y')])
    const zwei = katalogEintraege([zusammenfassung('a', 'x'), zusammenfassung('b', 'y')])
    expect(katalogDigest(eins)).toBe(katalogDigest(zwei))
    expect(katalogDigest(eins)).not.toBe(katalogDigest(katalogEintraege([zusammenfassung('a', 'x'), zusammenfassung('b', 'z')])))
  })

  test('eine Beschreibung mit Zeilenumbruch und eine mit Leerzeichen sind gleich', () => {
    const eins = katalogEintraege([zusammenfassung('a', 'zwei\nzeilen')])
    const zwei = katalogEintraege([zusammenfassung('a', 'zwei zeilen')])
    expect(katalogDigest(eins)).toBe(katalogDigest(zwei))
  })
})

describe('Aufruf-Gesten', () => {
  test('findet /name nur an Wortgrenzen und ohne Doppel', () => {
    expect(aufgerufeneSkills('Bitte /code-review und /code-review nutzen')).toEqual(['code-review'])
    expect(aufgerufeneSkills('/usr/bin ist kein Skill')).toEqual([])
    expect(aufgerufeneSkills('5/8 der Strecke')).toEqual([])
    // Eine Klammer ist keine Wortgrenze — die Vorlage bindet die Geste an Weißraum.
    expect(aufgerufeneSkills('(/security-audit)')).toEqual([])
    expect(aufgerufeneSkills(' /security-audit ')).toEqual(['security-audit'])
  })

  test('benutzerSkills filtert auf den menschlichen Weg', () => {
    const liste = [
      zusammenfassung('beide'),
      zusammenfassung('nur-modell', 'x', true, false),
      zusammenfassung('nur-mensch', 'x', false, true),
    ]
    expect(benutzerSkills(liste).map((entry) => entry.name)).toEqual(['beide', 'nur-mensch'])
  })
})
