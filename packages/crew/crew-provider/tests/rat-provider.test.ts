/**
 * Die Naht für den Rat: Persona → Rolle → Modell, und der Prompt als System-Anweisung.
 *
 * **Was hier belegt wird.** Dass eine Persona über die **ihr zugeordnete** Rolle läuft (nicht
 * über die Rolle des Aufrufers), dass ihr Prompt als `system`-Nachricht ankommt und dass der
 * Rubric im Prüfauftrag steht. Ohne diese drei wäre der Rat nur ein weiterer Prüfer.
 */
import { describe, expect, test } from 'bun:test'

import { messageText, type CompletionRequest, type LlmProvider } from '@prometheus-harness/llm'

import { crewLauf, type CrewDefinition } from '../src/index.ts'

/** Eine Crew mit drei Rollen und zwei Modellen. */
const CREW: CrewDefinition = {
  id: 'crew-rat',
  name: 'Rat-Crew',
  rollen: {
    planner: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
    executor: { familie: 'deepseek-official', modell: 'deepseek-flash' },
    reviewer: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
  },
}

describe('Rat über den Seam', () => {
  test(' jede Persona geht an ihre Rolle, ihr Prompt als system, der Rubric im Auftrag', async () => {
    const anfragen: CompletionRequest[] = []
    const anbieter: LlmProvider = {
      name: 'deepseek-official',
      complete: async (request) => {
        anfragen.push(request)
        const system = request.messages[0]?.role === 'system'
        const text = request.messages.map((nachricht) => messageText(nachricht)).join('\n')
        const antwort = system
          ? JSON.stringify({ beanstandungen: [], urteil: 'pass', begruendung: 'ok' })
          : text.includes('Entscheide')
            ? JSON.stringify({ urteil: 'pass', begruendung: 'einig', maengel: [] })
            : 'ergebnis'
        return {
          text: antwort,
          toolCalls: [],
          finishReason: 'stop',
          model: request.model,
          usage: { inputTokens: 3, outputTokens: 2 },
        }
      },
    }

    const ergebnis = await crewLauf({
      crew: CREW,
      anbieter: () => anbieter,
      ziel: 'Belege den Plan',
      planerAntwort: '{"steps":[{"id":"t1","instruction":"schreibe","dependsOn":[],"role":"executor"}]}',
      rat: ['grabstein', 'finanz'],
      personaRollen: { grabstein: 'reviewer', finanz: 'executor' },
      rubric: 'Jede Zahl braucht eine Quelle.',
    })

    const personaAnfragen = anfragen.filter((anfrage) => anfrage.messages[0]?.role === 'system')
    expect(personaAnfragen).toHaveLength(2)
    for (const anfrage of personaAnfragen) {
      const system = anfrage.messages[0]
      const auftrag = anfrage.messages[1]
      expect(system).toBeDefined()
      expect(auftrag).toBeDefined()
      // Der gemeinsame Kopf muss ankommen — sonst prüft die Persona ohne ihre Grenzen.
      expect(messageText(system!)).toContain('KEINE DIAGNOSE')
      expect(messageText(auftrag!)).toContain('Jede Zahl braucht eine Quelle.')
    }

    // Zuordnung: grabstein → reviewer (stark), finanz → executor (billig).
    expect(personaAnfragen.map((anfrage) => anfrage.model).sort()).toEqual([
      'deepseek-flash',
      'deepseek-v4-pro',
    ])
    expect(ergebnis.lauf.urteil).toBe('pass')
    expect(ergebnis.lauf.rat.map((sitzung) => sitzung.persona).sort()).toEqual(['finanz', 'grabstein'])
    expect(ergebnis.lauf.richter?.urteil).toBe('pass')
  })

  test('ohne personaRollen prüft jede Persona mit der reviewer-Rolle', async () => {    const anfragen: CompletionRequest[] = []
    const anbieter: LlmProvider = {
      name: 'deepseek-official',
      complete: async (request) => {
        anfragen.push(request)
        const system = request.messages[0]?.role === 'system'
        const text = request.messages.map((nachricht) => messageText(nachricht)).join('\n')
        // **Der Richter braucht JSON.** Ein bloßes „pass" liest `liesRichter` als „revise" —
        // dann liefe der Test drei Runden und zählte drei Persona-Aufrufe.
        const antwort = system
          ? JSON.stringify({ beanstandungen: [], urteil: 'pass', begruendung: 'ok' })
          : text.includes('Entscheide')
            ? JSON.stringify({ urteil: 'pass', begruendung: 'einig', maengel: [] })
            : 'ergebnis'
        return {
          text: antwort,
          toolCalls: [],
          finishReason: 'stop',
          model: request.model,
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      },
    }

    const ergebnis = await crewLauf({
      crew: CREW,
      anbieter: () => anbieter,
      ziel: 'z',
      planerAntwort: '{"steps":[{"id":"t1","instruction":"x","dependsOn":[],"role":"executor"}]}',
      rat: ['kritiker'],
    })

    const personaAnfragen = anfragen.filter((anfrage) => anfrage.messages[0]?.role === 'system')
    expect(personaAnfragen).toHaveLength(1)
    expect(personaAnfragen[0]?.model).toBe('deepseek-v4-pro')
    expect(ergebnis.lauf.urteil).toBe('pass')
  })

  test('der Richter bekommt den Skill-Text als Prüfmaßstab', async () => {
    const anfragen: CompletionRequest[] = []
    const anbieter: LlmProvider = {
      name: 'deepseek-official',
      complete: async (request) => {
        anfragen.push(request)
        const system = request.messages[0]?.role === 'system'
        const text = request.messages.map((nachricht) => messageText(nachricht)).join('\n')
        return {
          text: system
            ? JSON.stringify({ beanstandungen: [], urteil: 'pass', begruendung: 'ok' })
            : text.includes('Entscheide')
              ? JSON.stringify({ urteil: 'pass', begruendung: 'einig', maengel: [] })
              : 'ergebnis',
          toolCalls: [],
          finishReason: 'stop',
          model: request.model,
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      },
    }

    await crewLauf({
      crew: CREW,
      anbieter: () => anbieter,
      ziel: 'z',
      planerAntwort: '{"steps":[{"id":"t1","instruction":"x","dependsOn":[],"role":"executor"}]}',
      rat: ['kritiker'],
      richterSkill: 'Sicherheitspruefung: pruefe auf Injection und fehlende Validierung.',
    })

    const richterAnfrage = anfragen.find((anfrage) =>
      anfrage.messages.map((nachricht) => messageText(nachricht)).join('\n').includes('Entscheide'),
    )
    expect(richterAnfrage).toBeDefined()
    const richterText = richterAnfrage!.messages.map((nachricht) => messageText(nachricht)).join('\n')
    // Der Maßstab steht im Auftrag — nicht nur in einer Option, die nirgends ankommt.
    expect(richterText).toContain('Zusätzlicher Prüfmaßstab')
    expect(richterText).toContain('Sicherheitspruefung')
  })
})
