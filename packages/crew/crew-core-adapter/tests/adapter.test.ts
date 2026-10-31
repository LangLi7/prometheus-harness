/**
 * Der Adapter am Kern-Seam: Rollenwahl, Weitergabe, **Bild an die vision-Rolle**.
 *
 * Festgenagelt wird: der Strom wird **nicht kopiert**, sondern mit umgeschriebener Route und
 * umgeschriebenem Modell an den Ziel-Anbieter gereicht; eine Anfrage **mit Bild** geht an `vision`;
 * der Katalog meldet `image` **nur**, wenn eine Bildrolle gebunden ist; und eine unbekannte Crew
 * wirft mit Kennung und Liste, statt still woanders hinzulaufen.
 */

import { describe, expect, test } from 'bun:test'

import { LlmError, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

import { CrewAdapter, pruefeCrew, type CrewEintrag } from '../src/index.ts'

/** Eine Crew mit drei Rollen. */
const CREW: CrewEintrag = {
  id: 'crew-1',
  name: 'Test-Crew',
  rollen: {
    planner: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
    executor: { familie: 'deepseek-official', modell: 'deepseek-flash' },
    vision: { familie: 'openrouter', modell: 'google/gemini-3.8-flash' },
  },
}

/** Ein Versand, der jede Anfrage mitschreibt und einen leeren Strom zurückgibt. */
const versand = (): { llm: { stream: (options: GenerateOptions) => AsyncIterable<StreamChunk> }; anfragen: GenerateOptions[] } => {
  const anfragen: GenerateOptions[] = []
  const llm = {
    stream: (options: GenerateOptions): AsyncIterable<StreamChunk> => {
      anfragen.push(options)
      return (async function* () {})()
    },
  }
  return { llm, anfragen }
}

/** Eine Anfrage ohne Bild. */
const anfrage = (feld: Partial<GenerateOptions> = {}): GenerateOptions => ({
  provider: 'crew',
  model: 'crew-1',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Bitte arbeiten.' }] }],
  ...feld,
})

/** Eine Anfrage mit einem Bildblock. */
const mitBild = (): GenerateOptions => ({
  provider: 'crew',
  model: 'crew-1',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Was steht hier?' },
      { type: 'image', attachment: {} },
    ] as unknown as GenerateOptions['messages'][number]['content'],
  }],
})

describe('Prüfung', () => {
  test('eine saubere Crew ist benutzbar', () => {
    expect(pruefeCrew(CREW)).toEqual([])
  })

  test('Rekursion, halbe Bindung und leere Crew sind Befunde', () => {
    expect(pruefeCrew({ id: 'x', rollen: { executor: { familie: 'crew', modell: 'x' } } })[0]).toContain('Crew in einer Crew')
    expect(pruefeCrew({ id: 'x', rollen: { executor: { familie: 'a', modell: ' ' } } })).toHaveLength(1)
    expect(pruefeCrew({ id: 'x', rollen: {} })).toContain('die Crew bindet keine Rolle')
  })

  test('der Adapter verweigert eine unbrauchbare Crew beim Bau', () => {
    const { llm } = versand()
    expect(() => new CrewAdapter(llm, [{ id: 'crew-1', rollen: { executor: { familie: 'crew', modell: 'crew-1' } } }]))
      .toThrow(/Crew in einer Crew/)
    expect(() => new CrewAdapter(llm, [CREW, CREW])).toThrow(/doppelt/)
  })
})

describe('Weitergabe', () => {
  test('Text geht an den Executor — Route und Modell umgeschrieben', () => {
    const { llm, anfragen } = versand()
    const adapter = new CrewAdapter(llm, [CREW])
    void adapter.stream(anfrage())
    expect(anfragen[0]?.provider).toBe('deepseek-official')
    expect(anfragen[0]?.model).toBe('deepseek-flash')
    // Die Nachrichten bleiben unangetastet — der Adapter ist eine Weiche, keine Kopie.
    expect(anfragen[0]?.messages).toEqual(anfrage().messages)
  })

  test('ein Bild geht an die vision-Rolle — der Kern-Seam kann das', () => {
    const { llm, anfragen } = versand()
    const adapter = new CrewAdapter(llm, [CREW])
    void adapter.stream(mitBild())
    expect(anfragen[0]?.provider).toBe('openrouter')
    expect(anfragen[0]?.model).toBe('google/gemini-3.8-flash')
  })

  test('ohne Bildrolle geht ein Bild an den Executor — kein stilles Scheitern', () => {
    const { llm, anfragen } = versand()
    const ohneBild: CrewEintrag = { id: 'crew-2', rollen: { executor: { familie: 'a', modell: 'b' } } }
    const adapter = new CrewAdapter(llm, [ohneBild])
    void adapter.stream({ ...mitBild(), model: 'crew-2' })
    expect(anfragen[0]?.provider).toBe('a')
  })

  test('eine unbekannte Crew wirft mit Kennung und Liste', () => {
    const { llm } = versand()
    const adapter = new CrewAdapter(llm, [CREW])
    expect(() => adapter.stream(anfrage({ model: 'gibt-es-nicht' }))).toThrow(/nicht eingerichtet/)
    expect(() => adapter.stream(anfrage({ model: 'gibt-es-nicht' }))).toThrow(LlmError)
  })
})

describe('Katalog', () => {
  test('providerInfo nennt die Route', () => {
    const { llm } = versand()
    const adapter = new CrewAdapter(llm, [CREW])
    expect(adapter.providerInfo('crew')).toEqual({ id: 'crew', name: 'Crew' })
  })

  test('listModels liefert je Crew einen Eintrag, Bild nur mit Bildrolle', async () => {
    const { llm } = versand()
    const ohneBild: CrewEintrag = { id: 'crew-2', rollen: { executor: { familie: 'a', modell: 'b' } } }
    const adapter = new CrewAdapter(llm, [CREW, ohneBild])
    const modelle = await adapter.listModels('crew')
    expect(modelle).toHaveLength(2)
    expect(modelle[0]).toEqual({
      provider: 'crew',
      id: 'crew-1',
      name: 'Test-Crew',
      inputModalities: ['text', 'image'],
    })
    expect(modelle[1]?.inputModalities).toEqual(['text'])
  })

  test('resolveModel findet die Crew und nennt sie beim Namen', async () => {
    const { llm } = versand()
    const adapter = new CrewAdapter(llm, [CREW])
    const modell = await adapter.resolveModel('crew', 'crew-1')
    expect(modell.id).toBe('crew-1')
    expect(modell.name).toBe('Test-Crew')
    await expect(adapter.resolveModel('crew', 'weg')).rejects.toThrow(/nicht eingerichtet/)
  })
})
