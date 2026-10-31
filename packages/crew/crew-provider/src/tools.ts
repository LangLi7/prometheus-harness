/**
 * Die vier Zustandswerkzeuge — angemeldet beim Loop, nicht nur vorhanden.
 *
 * ## Was hier passiert
 *
 * `crew-plan` kennt die vier Werkzeuge als **Funktionen** (`crewPlan`, `crewTodo`,
 * `crewTodoStatus`, `crewWorkspace`) — mit Rollenrecht, Prüfungen und einem Ergebnisobjekt. Der
 * Loop kennt **Werkzeuge** als `AgentTool`: Name, Beschreibung, Parameterschema und eine
 * `execute`, die **Text** liefert. Dieses Modul ist die Übersetzung zwischen beiden — und der
 * Grund, warum die Planung im Chat ankommt statt nur in einem Test.
 *
 * ## Warum der Aufrufer im Bau steht und nicht in den Argumenten
 *
 * Ein Werkzeugaufruf des Modells ist Text; er kann behaupten, der Planer zu sein. Hier wird die
 * Rolle beim **Bau** der Werkzeuge festgelegt (`aufrufer`) und nicht aus den Argumenten gelesen —
 * damit kann ein Executor nicht per Argument zum Planer werden. Genau diese Grenze trägt das
 * Rechte-Modell aus `crew-plan`.
 *
 * ## Warum das Ergebnis JSON ist
 *
 * Der Loop reicht Text an das Modell. Ein Bericht in Prosa wäre bequem für Menschen und schlecht
 * für ein Modell, das die Kennungen der Aufgaben weiterverwenden soll. Deshalb: **JSON**, mit
 * denselben Feldnamen wie die Funktionen in `crew-plan`.
 *
 * @module @prometheus-harness/crew-provider/tools
 */

import type { AgentTool } from '@prometheus-harness/agent-tools'
import {
  CREW_ROLLEN,
  crewPlan,
  crewTodo,
  crewTodoStatus,
  crewWorkspace,
  istRolle,
  type Aufgabeneintrag,
  type CrewRolle,
  type CrewZustandSpeicher,
  type Projektbereich,
  type Zustandsauskunft,
} from '@prometheus-harness/crew-plan'

/** Was die Werkzeuge über den Aufruf wissen — beim **Bau** festgelegt. */
export interface CrewWerkzeugKontext {
  /** Die Crew, um die es geht. */
  crew: string
  /** Nutzer und Projekt (der Plan liegt je Nutzer). */
  bereich: Projektbereich
  /** Die Rolle, in deren Namen gehandelt wird — nicht aus den Argumenten. */
  aufrufer: CrewRolle
  /** Der Speicher der Plandokumente. */
  speicher: CrewZustandSpeicher
}

/** Das Parameterschema für `crew_plan` und `crew_workspace`. */
const ZIELFELDER: Readonly<Record<string, unknown>> = {
  goal: { type: 'string', description: 'Das Ziel im Klartext.' },
  goal_status: { type: 'string', enum: ['pending', 'active', 'done'], description: 'Stand des Ziels.' },
}

/**
 * Liest einen Text aus den Argumenten des Modells.
 *
 * @param args - die Argumente
 * @param name - der Feldname
 * @returns der Text oder `undefined`
 */
function text(args: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const wert = args[name]
  if (typeof wert !== 'string') return undefined
  const sauber = wert.trim()
  return sauber === '' ? undefined : sauber
}

/**
 * Liest eine Rolle aus den Argumenten des Modells.
 *
 * @param args - die Argumente
 * @returns die Rolle oder `undefined`
 * @throws Error wenn der Wert keine bekannte Rolle ist
 */
function rolle(args: Readonly<Record<string, unknown>>): CrewRolle | undefined {
  const wert = args['role']
  if (wert === undefined) return undefined
  if (!istRolle(wert)) {
    throw new Error(`unbekannte Rolle "${String(wert)}" (bekannt: ${CREW_ROLLEN.join(', ')})`)
  }
  return wert
}

/**
 * Liest die Aufgabenliste aus den Argumenten.
 *
 * @param args - die Argumente
 * @returns die Liste (leer, wenn keine genannt ist)
 */
function aufgaben(args: Readonly<Record<string, unknown>>): Aufgabeneintrag[] {
  const wert = args['todos']
  if (!Array.isArray(wert)) return []
  const liste: Aufgabeneintrag[] = []
  for (const eintrag of wert) {
    if (typeof eintrag !== 'object' || eintrag === null) continue
    const feld = eintrag as Record<string, unknown>
    const beschreibung = typeof feld['text'] === 'string' ? feld['text'].trim() : ''
    if (beschreibung === '') continue
    const neu: Aufgabeneintrag = { text: beschreibung }
    if (typeof feld['id'] === 'string' && feld['id'].trim() !== '') neu.id = feld['id'].trim()
    const stand = feld['status']
    if (stand === 'pending' || stand === 'in_progress' || stand === 'completed') neu.stand = stand
    liste.push(neu)
  }
  return liste
}

/**
 * Prüft, ob ein Text als Zielstand taugt.
 *
 * @param wert - der Wert
 * @returns der Zielstand oder `undefined`
 */
function zielstand(wert: unknown): 'pending' | 'active' | 'done' | undefined {
  return wert === 'pending' || wert === 'active' || wert === 'done' ? wert : undefined
}

/**
 * Prüft, ob ein Text als Aufgabenzustand taugt.
 *
 * @param wert - der Wert
 * @returns der Zustand oder `undefined`
 */
function aufgabenstand(wert: unknown): 'pending' | 'in_progress' | 'completed' | undefined {
  return wert === 'pending' || wert === 'in_progress' || wert === 'completed' ? wert : undefined
}

/**
 * Das Ergebnis eines Werkzeugs als Text für das Modell.
 *
 * @param auskunft - die Auskunft aus `crew-plan`
 * @returns JSON
 */
function alsText(auskunft: Zustandsauskunft): string {
  return JSON.stringify(auskunft)
}

/**
 * Baut die vier Zustandswerkzeuge für den Loop.
 *
 * @param kontext - Crew, Nutzer/Projekt, aufrufende Rolle und Speicher
 * @returns die Werkzeuge in stabiler Reihenfolge
 */
export function crewWerkzeuge(kontext: CrewWerkzeugKontext): AgentTool[] {
  const plan: AgentTool = {
    name: 'crew_plan',
    description:
      'Lies den dauerhaften Plan dieser Crew (Ziele und Aufgaben je Rolle) oder setze das Ziel EINER '
      + 'Rolle. Nur der Planer darf fremde Rollen setzen; jede andere Rolle nur ihre eigene.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['view', 'set'], description: 'view = lesen, set = Ziel setzen.' },
        role: { type: 'string', enum: [...CREW_ROLLEN], description: 'Die Rolle, deren Ziel gesetzt wird.' },
        ...ZIELFELDER,
      },
      required: [],
    },
    execute: async (args) => {
      const aktion = args['action'] === 'set' ? 'set' : 'view'
      const gewaehlt = rolle(args)
      const ziel = text(args, 'goal')
      const stand = zielstand(args['goal_status'])
      const auskunft = await crewPlan(kontext, {
        aktion,
        ...(gewaehlt === undefined ? {} : { rolle: gewaehlt }),
        ...(ziel === undefined ? {} : { ziel }),
        ...(stand === undefined ? {} : { stand }),
      })
      return alsText(auskunft)
    },
  }

  const todo: AgentTool = {
    name: 'crew_todo',
    description:
      'Schreibe die VOLLSTAENDIGE Aufgabenliste einer Rolle. Kennungen, die es schon gibt, behalten '
      + 'ihren Stand; erledigte Aufgaben, die fehlen, bleiben erhalten (behalte_erledigte steuert das).',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: [...CREW_ROLLEN], description: 'Die Rolle.' },
        todos: {
          type: 'array',
          description: 'Die vollständige Liste.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Stabile Kennung; fehlt sie, wird eine vergeben.' },
              text: { type: 'string', description: 'Was zu tun ist.' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            },
            required: ['text'],
          },
        },
        behalte_erledigte: { type: 'boolean', description: 'Erledigte behalten (Vorgabe ja).' },
      },
      required: ['role', 'todos'],
    },
    execute: async (args) => {
      const gewaehlt = rolle(args)
      const auskunft = await crewTodo(kontext, {
        ...(gewaehlt === undefined ? {} : { rolle: gewaehlt }),
        aufgaben: aufgaben(args),
        ...(args['behalte_erledigte'] === undefined ? {} : { behalteErledigte: args['behalte_erledigte'] === true }),
      })
      return alsText(auskunft)
    },
  }

  const status: AgentTool = {
    name: 'crew_todo_status',
    description:
      'Lege EINE Aufgabe an, stelle ihren Stand um, benenne sie um oder entferne sie. Zum Anlegen '
      + 'einen Text mitgeben; ohne Text muss die Kennung schon existieren.',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: [...CREW_ROLLEN] },
        id: { type: 'string', description: 'Die Kennung der Aufgabe.' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
        text: { type: 'string', description: 'Ein neuer Text (auch zum Anlegen).' },
        remove: { type: 'boolean', description: 'Die Aufgabe entfernen.' },
      },
      required: ['role', 'id'],
    },
    execute: async (args) => {
      const gewaehlt = rolle(args)
      const kennung = text(args, 'id')
      const stand = aufgabenstand(args['status'])
      const inhalt = text(args, 'text')
      const auskunft = await crewTodoStatus(kontext, {
        ...(gewaehlt === undefined ? {} : { rolle: gewaehlt }),
        ...(kennung === undefined ? {} : { id: kennung }),
        ...(stand === undefined ? {} : { stand }),
        ...(inhalt === undefined ? {} : { text: inhalt }),
        ...(args['remove'] === undefined ? {} : { entfernen: args['remove'] === true }),
      })
      return alsText(auskunft)
    },
  }

  const workspace: AgentTool = {
    name: 'crew_workspace',
    description:
      'Die Projektebene: das Ziel des Projekts und seine benannten Arbeitsstroeme. Lesen darf jede '
      + 'Rolle, schreiben nur der Planer.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['view', 'set_goal', 'add_project', 'rename_project', 'write_project', 'set_project_status', 'remove_project'],
        },
        ...ZIELFELDER,
        project: { type: 'string', description: 'Die Kennung des Arbeitsstroms.' },
        name: { type: 'string', description: 'Der Anzeigename des Arbeitsstroms.' },
        todos: {
          type: 'array',
          description: 'Aufgaben des Arbeitsstroms.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            },
            required: ['text'],
          },
        },
        behalte_erledigte: { type: 'boolean' },
      },
      required: [],
    },
    execute: async (args) => {
      const aktion = args['action']
      const erlaubt = [
        'view',
        'set_goal',
        'add_project',
        'rename_project',
        'write_project',
        'set_project_status',
        'remove_project',
      ] as const
      const gewaehlt = erlaubt.find((wert) => wert === aktion) ?? 'view'
      const ziel = text(args, 'goal')
      const stand = zielstand(args['goal_status'])
      const projekt = text(args, 'project')
      const name = text(args, 'name')
      const liste = aufgaben(args)
      const auskunft = await crewWorkspace(kontext, {
        aktion: gewaehlt,
        ...(ziel === undefined ? {} : { ziel }),
        ...(stand === undefined ? {} : { stand }),
        ...(projekt === undefined ? {} : { projekt }),
        ...(name === undefined ? {} : { name }),
        ...(liste.length === 0 ? {} : { aufgaben: liste }),
        ...(args['behalte_erledigte'] === undefined ? {} : { behalteErledigte: args['behalte_erledigte'] === true }),
      })
      return alsText(auskunft)
    },
  }

  return [plan, todo, status, workspace]
}
