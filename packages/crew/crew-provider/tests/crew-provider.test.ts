/**
 * Die Naht: Rollenwahl, Delegation, Prüfung — und der Lauf über den echten Seam.
 *
 * Festgenagelt wird: **die Anfrage geht an das Modell der Rolle** (nicht an das der Anfrage),
 * **eine Crew in einer Crew wird im Host abgewiesen** (der Harness verhinderte das nur in der
 * Oberfläche), und **der Lauf führt wirklich aus** — Planer, Wellen, Prüfer, über `complete`.
 */

import { describe, expect, test } from 'bun:test'

import { LlmError, type CompletionRequest, type CompletionResult, type LlmProvider } from '@prometheus-harness/llm'

import {
  crewAnbieter,
  crewLauf,
  crewModelle,
  pruefeCrew,
  type CrewDefinition,
} from '../src/index.ts'

/** Eine Crew mit drei Rollen. */
const CREW: CrewDefinition = {
  id: 'crew-1',
  name: 'Test-Crew',
  rollen: {
    planner: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
    executor: { familie: 'deepseek-official', modell: 'deepseek-flash' },
    reviewer: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
  },
}

/** Ein Anbieter, der jede Anfrage mitschreibt. */
const anbieterMit = (antwort: (request: CompletionRequest) => string | CompletionResult): {
  anbieter: LlmProvider
  anfragen: CompletionRequest[]
} => {
  const anfragen: CompletionRequest[] = []
  const anbieter: LlmProvider = {
    name: 'deepseek-official',
    complete: async (request) => {
      anfragen.push(request)
      const roh = antwort(request)
      if (typeof roh !== 'string') return roh
      return {
        text: roh,
        toolCalls: [],
        finishReason: 'stop',
        model: request.model,
        usage: { inputTokens: 10, outputTokens: 5 },
      }
    },
  }
  return { anbieter, anfragen }
}

/** Eine Anbieterwahl, die alles auf einen Anbieter schickt. */
const wahl = (anbieter: LlmProvider) => (): LlmProvider => anbieter

describe('Prüfung der Crew', () => {
  test('eine saubere Crew ist benutzbar', () => {
    expect(pruefeCrew(CREW)).toEqual([])
  })

  test('eine leere Kennung, keine Rolle und eine halbe Bindung sind Befunde', () => {
    expect(pruefeCrew({ id: ' ', rollen: { executor: { familie: 'a', modell: 'b' } } }).length).toBeGreaterThan(0)
    expect(pruefeCrew({ id: 'x', rollen: {} })).toContain('die Crew bindet keine Rolle')
    expect(pruefeCrew({ id: 'x', rollen: { executor: { familie: 'a', modell: ' ' } } }).length).toBe(1)
    expect(pruefeCrew({ id: 'crew', rollen: { executor: { familie: 'a', modell: 'b' } } })).toContain(
      'eine Crew darf nicht "crew" heissen — das ist die Route selbst',
    )
  })

  test('eine Rolle auf der Crew-Route wird im Host abgewiesen — der Harness liess das zu', () => {
    const rekursiv: CrewDefinition = {
      id: 'crew-1',
      rollen: { executor: { familie: 'crew', modell: 'crew-1' } },
    }
    const befunde = pruefeCrew(rekursiv)
    expect(befunde).toHaveLength(1)
    expect(befunde[0]).toContain('Crew in einer Crew')
    expect(() => crewAnbieter(rekursiv, { anbieter: wahl(anbieterMit(() => 'x').anbieter) })).toThrow(/nicht benutzbar/)
  })

  test('die Rollenübersicht nennt Route und Modell', () => {
    expect(crewModelle(CREW)).toEqual([
      { rolle: 'planner', familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
      { rolle: 'executor', familie: 'deepseek-official', modell: 'deepseek-flash' },
      { rolle: 'reviewer', familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
    ])
  })
})

describe('Crew als Anbieter', () => {
  test('Text geht an den Executor, mit dessen Modell', async () => {
    const { anbieter, anfragen } = anbieterMit(() => 'Antwort')
    const crew = crewAnbieter(CREW, { anbieter: wahl(anbieter) })
    expect(crew.name).toBe('crew:crew-1')
    const ergebnis = await crew.complete({ model: 'crew-1', messages: [] })
    expect(ergebnis.text).toBe('Antwort')
    expect(anfragen[0]?.model).toBe('deepseek-flash')
  })

  test('ohne Executor übernimmt der Planer', async () => {
    const { anbieter, anfragen } = anbieterMit(() => 'Antwort')
    const crew = crewAnbieter(
      { id: 'c2', rollen: { planner: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' } } },
      { anbieter: wahl(anbieter) },
    )
    await crew.complete({ model: 'c2', messages: [] })
    expect(anfragen[0]?.model).toBe('deepseek-v4-pro')
  })

  test('ohne gebundene Rolle wirft schon der Bau', () => {
    expect(() => crewAnbieter({ id: 'c3', rollen: {} }, { anbieter: wahl(anbieterMit(() => 'x').anbieter) }))
      .toThrow(/keine Rolle/)
  })

  test('eine Route ohne Anbieter ist ein Zugangsfehler, kein Absturz', async () => {
    const crew = crewAnbieter(CREW, { anbieter: () => undefined })
    await expect(crew.complete({ model: 'crew-1', messages: [] })).rejects.toBeInstanceOf(LlmError)
    await expect(crew.complete({ model: 'crew-1', messages: [] })).rejects.toThrow(/keinen Anbieter/)
  })

  test('ein Fehler des Rollen-Anbieters wird gemeldet und weitergereicht', async () => {
    const meldungen: unknown[] = []
    const scheiternd: LlmProvider = {
      name: 'deepseek-official',
      complete: async () => {
        throw new LlmError('unavailable', 'überlastet')
      },
    }
    const crew = crewAnbieter(CREW, { anbieter: wahl(scheiternd), melde: (fehler) => meldungen.push(fehler) })
    await expect(crew.complete({ model: 'crew-1', messages: [] })).rejects.toThrow(/überlastet/)
    expect(meldungen).toHaveLength(1)
  })

  test('meldet der Anbieter kein Modell, steht das Modell der Rolle', async () => {
    const ohneModell: LlmProvider = {
      name: 'deepseek-official',
      complete: async () => ({ text: 'x', toolCalls: [], finishReason: 'stop', model: '' }),
    }
    const crew = crewAnbieter(CREW, { anbieter: wahl(ohneModell) })
    const ergebnis = await crew.complete({ model: 'crew-1', messages: [] })
    expect(ergebnis.model).toBe('deepseek-flash')
  })
})

describe('Lauf über den Seam', () => {
  const PLAN_JSON = JSON.stringify({
    steps: [
      { id: 'a', instruction: 'Recherchieren', role: 'executor' },
      { id: 'b', instruction: 'Schreiben', dependsOn: ['a'], role: 'executor' },
    ],
  })

  test('der Lauf plant, arbeitet die Wellen ab und prüft', async () => {
    const { anbieter, anfragen } = anbieterMit((request) => {
      const text = request.messages.map((message) => (message.parts ?? []).map((part) => ('text' in part ? part.text : '')).join('')).join('\n')
      if (text.startsWith('Ziel:') && text.includes('Zerlege')) return PLAN_JSON
      if (text.includes('Pruefe')) return '{"pass":true}'
      return 'Ergebnis'
    })
    const ergebnis = await crewLauf({ crew: CREW, anbieter: wahl(anbieter), ziel: 'Bericht', maxVersuche: 2 })

    expect(ergebnis.planerRolle).toBe('planner')
    expect(ergebnis.plan.map((schritt) => schritt.id)).toEqual(['a', 'b'])
    expect(ergebnis.lauf.urteil).toBe('pass')
    // Planer (v4-pro), zwei Schritte am Executor (flash), Prüfer (v4-pro)
    expect(anfragen.map((anfrage) => anfrage.model)).toEqual([
      'deepseek-v4-pro',
      'deepseek-flash',
      'deepseek-flash',
      'deepseek-v4-pro',
    ])
    // Der zweite Schritt kennt das Ergebnis des ersten
    const zweiter = anfragen[2]
    const text = (zweiter?.messages ?? []).map((message) => (message.parts ?? []).map((part) => ('text' in part ? part.text : '')).join('')).join('\n')
    expect(text).toContain('Ergebnis')
  })

  test('ein hereingereichter Plan spart den Planer-Aufruf', async () => {
    const { anbieter, anfragen } = anbieterMit((request) => {
      const text = request.messages.map((message) => (message.parts ?? []).map((part) => ('text' in part ? part.text : '')).join('')).join('\n')
      return text.includes('Pruefe') ? '{"pass":true}' : 'Ergebnis'
    })
    const ergebnis = await crewLauf({
      crew: CREW,
      anbieter: wahl(anbieter),
      ziel: 'Bericht',
      planerAntwort: PLAN_JSON,
      maxVersuche: 1,
    })
    expect(ergebnis.planerRolle).toBeNull()
    expect(ergebnis.lauf.versuche).toBe(1)
    expect(anfragen).toHaveLength(3) // zwei Schritte + Prüfer
  })

  test('die Bildbeschreibung steht als Text in jedem Auftrag', async () => {
    const { anbieter, anfragen } = anbieterMit((request) => {
      const text = request.messages.map((message) => (message.parts ?? []).map((part) => ('text' in part ? part.text : '')).join('')).join('\n')
      return text.includes('Pruefe') ? '{"pass":true}' : 'Ergebnis'
    })
    await crewLauf({
      crew: CREW,
      anbieter: wahl(anbieter),
      ziel: 'Was steht auf dem Schild?',
      planerAntwort: PLAN_JSON,
      bildBeschreibung: 'Ein blaues Schild mit der Aufschrift HALLO',
      maxVersuche: 1,
    })
    const erster = (anfragen[0]?.messages[0]?.parts ?? []).map((part) => ('text' in part ? part.text : '')).join('')
    expect(erster).toContain('Ein blaues Schild')
  })

  test('ein unbrauchbarer Plan wird ein Ein-Schritt-Lauf, kein Fehler', async () => {
    const { anbieter } = anbieterMit((request) => {
      const text = request.messages.map((message) => (message.parts ?? []).map((part) => ('text' in part ? part.text : '')).join('')).join('\n')
      return text.includes('Pruefe') ? '{"pass":true}' : 'Ich mache das einfach.'
    })
    const ergebnis = await crewLauf({ crew: CREW, anbieter: wahl(anbieter), ziel: 'X', maxVersuche: 1 })
    expect(ergebnis.plan).toHaveLength(1)
    expect(ergebnis.lauf.urteil).toBe('pass')
  })

  test('eine unbenutzbare Crew scheitert vor dem ersten Aufruf', async () => {
    const { anfragen } = anbieterMit(() => 'x')
    await expect(
      crewLauf({
        crew: { id: 'crew-1', rollen: { executor: { familie: 'crew', modell: 'crew-1' } } },
        anbieter: wahl(anbieterMit(() => 'x').anbieter),
        ziel: 'X',
      }),
    ).rejects.toThrow(/nicht benutzbar/)
    expect(anfragen).toHaveLength(0)
  })

  test('die geprüfte Rolle ist wählbar, und `null` prüft nicht', async () => {
    const { anbieter, anfragen } = anbieterMit(() => 'Ergebnis')
    const ergebnis = await crewLauf({
      crew: CREW,
      anbieter: wahl(anbieter),
      ziel: 'X',
      planerAntwort: JSON.stringify([{ id: 'a', instruction: 'tun' }]),
      pruefer: null,
    })
    expect(ergebnis.lauf.urteil).toBe('pass')
    expect(anfragen).toHaveLength(1)
  })
})
