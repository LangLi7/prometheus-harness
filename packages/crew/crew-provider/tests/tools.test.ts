/**
 * Die vier Zustandswerkzeuge im Loop: Anmeldung, Recht, Ausführung.
 *
 * Festgenagelt wird: **sie erscheinen als Werkzeugliste beim Anbieter** (`toolSpecs`), **die Rolle
 * steht im Bau und nicht in den Argumenten** (ein Executor wird durch kein Argument zum Planer),
 * und **das Ergebnis ist JSON**, mit den Kennungen, die das Modell weiterverwenden soll.
 */

import { describe, expect, test } from 'bun:test'

import { Tools, toolSpecs } from '@prometheus-harness/agent-tools'
import { CrewZustandSpeicher, projektbereich, type CrewRolle } from '@prometheus-harness/crew-plan'

import { crewWerkzeuge, type CrewWerkzeugKontext } from '../src/index.ts'

const JETZT = '2026-10-18T12:00:00.000Z'

/** Ein Kontext im Arbeitsspeicher. */
const kontext = (aufrufer: CrewRolle): CrewWerkzeugKontext => ({
  crew: 'crew-1',
  bereich: projektbereich({ nutzer: 'anna', pfad: 'C:/projekt' }),
  aufrufer,
  speicher: new CrewZustandSpeicher({ jetzt: () => new Date(JETZT) }),
})

/** Führt ein Werkzeug über die Registry aus — derselbe Weg wie im Loop. */
const rufe = async (
  ctx: CrewWerkzeugKontext,
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> => {
  const registry = new Tools(crewWerkzeuge(ctx))
  const werkzeug = registry.get(name)
  if (werkzeug === undefined) throw new Error(`Werkzeug "${name}" fehlt`)
  return werkzeug.execute(args, { signal: undefined, step: 1, callId: 'c1' })
}

describe('Anmeldung beim Loop', () => {
  test('die vier Werkzeuge stehen in der Liste, die der Anbieter sieht', () => {
    const registry = new Tools(crewWerkzeuge(kontext('planner')))
    expect(registry.list().map((werkzeug) => werkzeug.name)).toEqual([
      'crew_plan',
      'crew_todo',
      'crew_todo_status',
      'crew_workspace',
    ])
    const specs = toolSpecs(registry)
    expect(specs).toHaveLength(4)
    for (const spec of specs) {
      expect(spec.description.length).toBeGreaterThan(20)
      expect((spec.parameters as { type?: string }).type).toBe('object')
    }
  })

  test('die Reihenfolge ist stabil — zweimal gebaut, zweimal gleich', () => {
    const ctx = kontext('planner')
    const eins = new Tools(crewWerkzeuge(ctx)).list().map((werkzeug) => werkzeug.name)
    const zwei = new Tools(crewWerkzeuge(ctx)).list().map((werkzeug) => werkzeug.name)
    expect(eins).toEqual(zwei)
  })
})

describe('Recht — die Rolle steht im Bau', () => {
  test('der Planer setzt das Ziel einer fremden Rolle', async () => {
    const auskunft = JSON.parse(await rufe(kontext('planner'), 'crew_plan', {
      action: 'set',
      role: 'executor',
      goal: 'Schreiben',
      goal_status: 'active',
    }))
    expect(auskunft.geaendert).toBe(true)
    expect(auskunft.rollen[0]).toEqual({ rolle: 'executor', ziel: { text: 'Schreiben', stand: 'active' }, aufgaben: [] })
  })

  test('ein Executor wird durch kein Argument zum Planer', async () => {
    const ctx = kontext('executor')
    expect(await rufe(ctx, 'crew_plan', { action: 'set', role: 'executor', goal: 'Eigenes' })).toContain('Eigenes')
    await expect(rufe(ctx, 'crew_plan', { action: 'set', role: 'planner', goal: 'Fremdes' }))
      .rejects.toThrow(/Planer/)
    await expect(rufe(ctx, 'crew_workspace', { action: 'set_goal', goal: 'X' }))
      .rejects.toThrow(/Planer/)
  })

  test('eine unbekannte Rolle in den Argumenten wird abgewiesen', async () => {
    await expect(rufe(kontext('planner'), 'crew_plan', { role: 'kaiser' })).rejects.toThrow(/unbekannte Rolle/)
  })
})

describe('Ausführung', () => {
  test('die Liste schreiben, einen Stand setzen und entfernen', async () => {
    const ctx = kontext('planner')
    const geschrieben = JSON.parse(await rufe(ctx, 'crew_todo', {
      role: 'executor',
      todos: [
        { id: 'a', text: 'Recherche', status: 'completed' },
        { id: 'b', text: 'Schreiben' },
      ],
    }))
    expect(geschrieben.rollen[0].aufgaben.map((aufgabe: { id: string; stand: string }) => [aufgabe.id, aufgabe.stand]))
      .toEqual([['a', 'completed'], ['b', 'pending']])

    const erledigt = JSON.parse(await rufe(ctx, 'crew_todo_status', { role: 'executor', id: 'b', status: 'completed' }))
    expect(erledigt.rollen[0].aufgaben.find((aufgabe: { id: string }) => aufgabe.id === 'b').stand).toBe('completed')

    const weg = JSON.parse(await rufe(ctx, 'crew_todo_status', { role: 'executor', id: 'b', remove: true }))
    expect(weg.rollen[0].aufgaben.map((aufgabe: { id: string }) => aufgabe.id)).toEqual(['a'])
  })

  test('die Projektebene: Ziel setzen, Arbeitsstrom schreiben, lesen', async () => {
    const ctx = kontext('planner')
    await rufe(ctx, 'crew_workspace', { action: 'set_goal', goal: 'Shop bauen', goal_status: 'active' })
    const geschrieben = JSON.parse(await rufe(ctx, 'crew_workspace', {
      action: 'write_project',
      project: 'p1',
      name: 'Bestellung',
      todos: [{ id: 'a', text: 'Warenkorb' }],
    }))
    expect(geschrieben.projektebene.ziel.text).toBe('Shop bauen')
    expect(geschrieben.projektebene.projekte[0].name).toBe('Bestellung')

    const gelesen = JSON.parse(await rufe(ctx, 'crew_workspace', { action: 'view' }))
    expect(gelesen.projektebene.projekte).toHaveLength(1)
    expect(gelesen.geaendert).toBe(false)
  })

  test('ein fehlendes Pflichtfeld wird als Werkzeugfehler gemeldet, nicht geschluckt', async () => {
    await expect(rufe(kontext('planner'), 'crew_plan', { action: 'set' })).rejects.toThrow(/Rolle/)
    await expect(rufe(kontext('planner'), 'crew_workspace', { action: 'set_goal' })).rejects.toThrow(/set_goal/)
  })
})
