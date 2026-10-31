/**
 * Die vier Zustandswerkzeuge — und das Recht, das sie tragen.
 *
 * Die Eigenschaft, die hier zählt: **der Planer schreibt jede Rolle, jede andere nur ihre eigene.**
 * Ohne diese Grenze kann ein Worker den Plan umschreiben, an dem er gemessen wird — und die
 * Messung ist wertlos, ohne daß jemand es merkt.
 */

import { describe, expect, test } from 'bun:test'

import { CrewZustandSpeicher } from '../src/state.ts'
import { projektbereich } from '../src/scope.ts'
import { crewPlan, crewTodo, crewTodoStatus, crewWorkspace, type Werkzeugkontext } from '../src/tools.ts'
import type { CrewRolle } from '../src/types.ts'

const JETZT = '2026-10-19T09:00:00.000Z'

/** Ein Kontext im Arbeitsspeicher, je Test frisch. */
const kontext = (aufrufer: CrewRolle): Werkzeugkontext => ({
  crew: 'crew-1',
  bereich: projektbereich({ nutzer: 'benutzer-1', pfad: 'C:/projekt' }),
  aufrufer,
  speicher: new CrewZustandSpeicher({ jetzt: () => new Date(JETZT) }),
})

describe('crew_plan', () => {
  test('view liest und schreibt nichts', async () => {
    const ctx = kontext('executor')
    const auskunft = await crewPlan(ctx, { aktion: 'view' })
    expect(auskunft.geaendert).toBe(false)
    expect(auskunft.nutzer).toBe('benutzer-1')
    expect(auskunft.rollen).toEqual([])
  })

  test('der Planer setzt das Ziel einer fremden Rolle', async () => {
    const ctx = kontext('planner')
    const auskunft = await crewPlan(ctx, { aktion: 'set', rolle: 'executor', ziel: 'Schreiben', stand: 'active' })
    expect(auskunft.geaendert).toBe(true)
    expect(auskunft.rollen).toEqual([
      { rolle: 'executor', ziel: { text: 'Schreiben', stand: 'active' }, aufgaben: [] },
    ])
  })

  test('eine andere Rolle darf ihr eigenes Ziel setzen, kein fremdes', async () => {
    const ctx = kontext('executor')
    await crewPlan(ctx, { aktion: 'set', rolle: 'executor', ziel: 'Eigenes', stand: 'active' })
    await expect(crewPlan(ctx, { aktion: 'set', rolle: 'planner', ziel: 'Fremdes', stand: 'active' }))
      .rejects.toThrow(/Planer/)
  })

  test('set ohne Rolle oder Ziel wird abgewiesen', async () => {
    const ctx = kontext('planner')
    await expect(crewPlan(ctx, { aktion: 'set', ziel: 'x' })).rejects.toThrow(/Rolle/)
    await expect(crewPlan(ctx, { aktion: 'set', rolle: 'executor' })).rejects.toThrow(/Ziel/)
  })
})

describe('crew_todo', () => {
  test('der Planer schreibt die vollständige Liste einer Rolle', async () => {
    const ctx = kontext('planner')
    const auskunft = await crewTodo(ctx, {
      rolle: 'executor',
      aufgaben: [
        { id: 'a', text: 'Recherche', stand: 'completed' },
        { id: 'b', text: 'Umsetzen' },
      ],
    })
    expect(auskunft.rollen[0]?.aufgaben.map((eintrag) => [eintrag.id, eintrag.stand])).toEqual([
      ['a', 'completed'],
      ['b', 'pending'],
    ])
  })

  test('ein Executor schreibt nicht die Liste des Planers', async () => {
    const ctx = kontext('executor')
    await expect(crewTodo(ctx, { rolle: 'planner', aufgaben: [{ text: 'x' }] })).rejects.toThrow(/nur den eigenen/)
  })
})

describe('crew_todo_status', () => {
  test('eine Aufgabe anlegen, erledigen und entfernen', async () => {
    const ctx = kontext('executor')
    await crewTodoStatus(ctx, { rolle: 'executor', id: 'a', text: 'Anlegen' })
    const erledigt = await crewTodoStatus(ctx, { rolle: 'executor', id: 'a', stand: 'completed' })
    expect(erledigt.rollen[0]?.aufgaben).toEqual([{ id: 'a', text: 'Anlegen', stand: 'completed' }])
    const weg = await crewTodoStatus(ctx, { rolle: 'executor', id: 'a', entfernen: true })
    expect(weg.rollen[0]?.aufgaben).toEqual([])
  })

  test('ohne Kennung wird nichts geraten', async () => {
    await expect(crewTodoStatus(kontext('executor'), { rolle: 'executor' })).rejects.toThrow(/Kennung/)
  })
})

describe('crew_workspace', () => {
  test('nur der Planer schreibt die Projektebene', async () => {
    await expect(crewWorkspace(kontext('executor'), { aktion: 'set_goal', ziel: 'x' })).rejects.toThrow(/Planer/)
  })

  test('der Planer legt das Projektziel an, schreibt, benennt, stellt um und entfernt', async () => {
    const ctx = kontext('planner')
    await crewWorkspace(ctx, { aktion: 'set_goal', ziel: 'Shop bauen', stand: 'active' })
    const geschrieben = await crewWorkspace(ctx, {
      aktion: 'write_project',
      projekt: 'p1',
      name: 'Bestellung',
      aufgaben: [{ id: 'a', text: 'Warenkorb' }],
    })
    expect(geschrieben.projektebene?.ziel?.text).toBe('Shop bauen')
    expect(geschrieben.projektebene?.projekte[0]?.name).toBe('Bestellung')

    await crewWorkspace(ctx, { aktion: 'rename_project', projekt: 'p1', name: 'Checkout' })
    const umgestellt = await crewWorkspace(ctx, { aktion: 'set_project_status', projekt: 'p1', stand: 'done' })
    expect(umgestellt.projektebene?.projekte[0]?.aufgaben[0]?.stand).toBe('completed')

    const entfernt = await crewWorkspace(ctx, { aktion: 'remove_project', projekt: 'p1' })
    expect(entfernt.projektebene?.projekte).toEqual([])
  })

  test('fehlende Pflichtfelder nennen sich beim Namen', async () => {
    const ctx = kontext('planner')
    await expect(crewWorkspace(ctx, { aktion: 'set_goal' })).rejects.toThrow(/set_goal/)
    await expect(crewWorkspace(ctx, { aktion: 'add_project' })).rejects.toThrow(/Projekt/)
    await expect(crewWorkspace(ctx, { aktion: 'rename_project', projekt: 'p1' })).rejects.toThrow(/Namen/)
  })
})
