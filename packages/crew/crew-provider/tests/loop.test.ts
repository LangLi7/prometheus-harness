/**
 * Der ganze Weg: Loop → Crew-Anbieter → Crew-Werkzeug → Plan-Dokument.
 *
 * Das ist die Prüfung, die zählt, wenn „installiert" behauptet wird: kein Baustein einzeln, sondern
 * die Kette. Ein `AgentLoop` bekommt die Crew als **Anbieter** und die vier Werkzeuge als
 * **Registry**; das Modell verlangt `crew_plan`, der Loop führt es aus, und danach steht das Ziel im
 * Plandokument. Nichts davon braucht Netz, Schlüssel oder Host.
 */

import { describe, expect, test } from 'bun:test'

import { AgentLoop } from '@prometheus-harness/agent-loop'
import { Tools } from '@prometheus-harness/agent-tools'
import { CrewZustandSpeicher, projektbereich } from '@prometheus-harness/crew-plan'
import type { CompletionRequest, CompletionResult, LlmProvider } from '@prometheus-harness/llm'

import { crewAnbieter, crewWerkzeuge, type CrewDefinition } from '../src/index.ts'

const JETZT = new Date('2026-10-18T12:00:00.000Z')

/** Eine Crew mit einem Executor. */
const CREW: CrewDefinition = {
  id: 'crew-1',
  rollen: { executor: { familie: 'deepseek-official', modell: 'deepseek-flash' } },
}

/**
 * Ein Anbieter mit Skript: erst ein Werkzeugaufruf, dann eine Antwort.
 *
 * **Warum ein Skript und kein Modell.** Der Beleg gilt für die **Kette**, nicht für das Können eines
 * Modells. Ein echtes Modell würde die Prüfung von Wetter und Laune abhängig machen.
 */
const skriptAnbieter = (): { anbieter: LlmProvider; anfragen: CompletionRequest[] } => {
  const anfragen: CompletionRequest[] = []
  const anbieter: LlmProvider = {
    name: 'deepseek-official',
    complete: async (request: CompletionRequest): Promise<CompletionResult> => {
      anfragen.push(request)
      if (anfragen.length === 1) {
        return {
          text: '',
          toolCalls: [{
            id: 'c1',
            name: 'crew_plan',
            arguments: { action: 'set', role: 'executor', goal: 'Schreiben', goal_status: 'active' },
          }],
          finishReason: 'tool-calls',
          model: request.model,
          usage: { inputTokens: 100, outputTokens: 20 },
        }
      }
      return {
        text: 'Fertig',
        toolCalls: [],
        finishReason: 'stop',
        model: request.model,
        usage: { inputTokens: 50, outputTokens: 10 },
      }
    },
  }
  return { anbieter, anfragen }
}

describe('Loop mit Crew', () => {
  test('das Modell verlangt crew_plan, der Loop führt es aus, das Ziel steht im Dokument', async () => {
    const speicher = new CrewZustandSpeicher({ jetzt: () => JETZT })
    const bereich = projektbereich({ nutzer: 'anna', pfad: 'C:/projekt' })
    const { anbieter, anfragen } = skriptAnbieter()

    const loop = new AgentLoop({
      provider: crewAnbieter(CREW, { anbieter: () => anbieter }),
      tools: new Tools(crewWerkzeuge({ crew: 'crew-1', bereich, aufrufer: 'executor', speicher })),
      model: 'crew-1',
    })

    const ergebnisse: string[] = []
    const generator = loop.run('Bitte plane das.')
    let schritt = await generator.next()
    while (!schritt.done) {
      const ereignis = schritt.value
      if (ereignis.type === 'tool-result') ergebnisse.push(ereignis.content)
      schritt = await generator.next()
    }
    const turn = schritt.value

    expect(turn.reason).toBe('stop')
    expect(turn.text).toBe('Fertig')
    expect(turn.steps).toBe(2)
    // Der Werkzeugaufruf ging durch die Crew an den Anbieter (Modell der Rolle).
    expect(anfragen[0]?.model).toBe('deepseek-flash')
    // Das Ergebnis des Werkzeugs ist JSON der Auskunft.
    expect(ergebnisse[0]).toContain('Schreiben')
    // Und es steht im Plandokument — je Nutzer.
    const zustand = await speicher.lesen('crew-1', bereich)
    expect(zustand.nutzer).toBe('anna')
    expect(zustand.rollen.executor?.ziel?.text).toBe('Schreiben')
  })

  test('ein Werkzeugfehler beendet den Turn nicht — das Modell kann weitermachen', async () => {
    const speicher = new CrewZustandSpeicher({ jetzt: () => JETZT })
    const bereich = projektbereich({ nutzer: 'anna', pfad: 'C:/projekt' })
    // Ein Anbieter, der das verbotene Werkzeug verlangt, dann antwortet.
    let anfragen = 0
    const verboten: LlmProvider = {
      name: 'deepseek-official',
      complete: async (request: CompletionRequest): Promise<CompletionResult> => {
        anfragen += 1
        if (anfragen === 1) {
          return {
            text: '',
            toolCalls: [{ id: 'c1', name: 'crew_workspace', arguments: { action: 'set_goal', goal: 'X' } }],
            finishReason: 'tool-calls',
            model: request.model,
          }
        }
        return { text: 'Weitergemacht', toolCalls: [], finishReason: 'stop', model: request.model }
      },
    }
    const zweiter = new AgentLoop({
      provider: crewAnbieter(CREW, { anbieter: () => verboten }),
      tools: new Tools(crewWerkzeuge({ crew: 'crew-1', bereich, aufrufer: 'executor', speicher })),
      model: 'crew-1',
    })
    const ergebnisse: string[] = []
    const generator = zweiter.run('Versuch es.')
    let schritt = await generator.next()
    while (!schritt.done) {
      const ereignis = schritt.value
      if (ereignis.type === 'tool-result') ergebnisse.push(ereignis.content)
      schritt = await generator.next()
    }
    expect(schritt.value.reason).toBe('stop')
    expect(schritt.value.text).toBe('Weitergemacht')
    expect(ergebnisse[0]).toContain('Planer')
    // Nichts wurde geschrieben.
    expect((await speicher.lesen('crew-1', bereich)).rollen).toEqual({})
  })
})
