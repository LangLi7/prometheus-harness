/**
 * Prüfungen für die sechs Personas.
 *
 * **Was hier belegt wird.** Dass jede Persona einen vollständigen Prompt hat, dass der
 * gemeinsame Kopf in **jedem** Prompt steht (die Memory-Grenze ist keine Verzierung), dass das
 * Ausgabeschema für alle dasselbe ist und dass die Besetzung der Sitze stimmt.
 *
 * **Was hier NICHT geprüft wird.** Ob eine Persona bessere Ergebnisse liefert. Das ist keine
 * Eigenschaft des Prompts — das misst der Eval mit den vier Armen.
 */
import { describe, expect, test } from 'bun:test'

import {
  CREW_PERSONAS,
  PERSONA_AUSGABE,
  PERSONA_KOPF,
  PERSONA_VORLAGEN,
  istPersona,
  personaPrompt,
  personenAm,
} from '../src/personas.ts'

describe('Personas', () => {
  test('jede Kennung hat eine vollständige Vorlage', () => {
    for (const persona of CREW_PERSONAS) {
      const vorlage = PERSONA_VORLAGEN[persona]
      expect(vorlage.id).toBe(persona)
      expect(vorlage.name.length).toBeGreaterThan(2)
      // Die Textfelder tragen den Prüfauftrag; ein Kurzsatz wäre keine Vorlage.
      for (const feld of ['prueft', 'stimme', 'beanstandung', 'grenze'] as const) {
        expect(vorlage[feld].length).toBeGreaterThan(30)
      }
    }
  })

  test('der gemeinsame Kopf steht in JEDEM Prompt', () => {
    // **Warum das die wichtigste Prüfung ist.** Die Memory-Grenze („keine Diagnose") ist die
    // Bedingung, unter der die neurodivergenten Perspektiven vertretbar sind. Fehlt sie in
    // einem Prompt, ist genau dieser Prompt übergriffig — und niemand merkt es.
    for (const persona of CREW_PERSONAS) {
      const prompt = personaPrompt(persona)
      expect(prompt).toContain(PERSONA_KOPF)
      expect(prompt).toContain('KEINE DIAGNOSE')
      expect(prompt).toContain('GEGEN DIE SACHE, NICHT GEGEN DIE PERSON')
    }
  })

  test('jeder Prompt trägt Prüfauftrag, Stimme und Ausgabeschema', () => {
    for (const persona of CREW_PERSONAS) {
      const prompt = personaPrompt(persona)
      expect(prompt).toContain('## Dein Prüfauftrag')
      expect(prompt).toContain('## Deine Stimme')
      expect(prompt).toContain('## Ausgabe')
      expect(prompt).toContain(PERSONA_AUSGABE)
      expect(prompt).toContain('"beanstandungen"')
      expect(prompt).toContain('"schwere"')
    }
  })

  test('eine unbekannte Persona wirft, statt still einen leeren Prompt zu bauen', () => {
    expect(() => personaPrompt('gibtsnicht' as never)).toThrow(/Unbekannte Persona/)
  })

  test('die Sitze sind besetzt: 3 Macher, 3 Rat, 2 Meta', () => {
    expect(personenAm('macher')).toEqual(['sprinter', 'praezision', 'doppelprofil'])
    expect(personenAm('rat')).toEqual(['grabstein', 'butler', 'finanz'])
    expect(personenAm('meta')).toEqual(['kritiker', 'ueberwacher'])
  })

  test('istPersona erkennt nur bekannte Kennungen', () => {
    expect(istPersona('butler')).toBe(true)
    expect(istPersona('planner')).toBe(false)
    expect(istPersona(42)).toBe(false)
  })

  test('keine Persona behauptet eine Diagnose', () => {
    // Die Grenze steht als Text in jeder Vorlage; hier wird zusätzlich geprüft, dass keine
    // Formulierung sie stillschweigend aufhebt.
    for (const persona of CREW_PERSONAS) {
      const vorlage = PERSONA_VORLAGEN[persona]
      expect(vorlage.grenze.toLowerCase()).not.toContain('diagnostiziert dich')
      expect(vorlage.grenze.length).toBeGreaterThan(20)
    }
  })
})
