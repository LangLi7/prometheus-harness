/**
 * Die vier Zustandswerkzeuge — was der Planer schreibt und jede Rolle liest.
 *
 * ## Warum der Aufrufer im Auftrag steht
 *
 * Die Werkzeugschnittstelle des Modells kennt **keine** Identität: ein Werkzeugaufruf sagt „schreib
 * die Liste der Rolle executor", nicht „ich bin der executor". Im Harness ist deshalb die Rolle ein
 * Parameter, den der Aufrufer *behauptet*. Hier steht sie im Kontext, den die Naht setzt — der
 * Planer darf jede Rolle schreiben, jede andere **nur ihre eigene**. Damit kann ein Worker den
 * Plan nicht umschreiben, an dem er gemessen wird; er kann nur melden, was er getan hat.
 *
 * ## Warum die Projektebene dem Planer vorbehalten ist
 *
 * Die Projektebene ist das Archiv der Vorhaben — sie entscheidet, *was* gearbeitet wird. Wer
 * gleichzeitig arbeitet und die Liste der Vorhaben ändert, kann sich seine eigene Messung
 * herstellen. Deshalb: schreiben nur `planner`, lesen alle.
 *
 * @module @prometheus-harness/crew-plan/tools
 */

import type { Projektbereich } from './scope.ts'
import type { CrewZustandSpeicher } from './state.ts'
import {
  benenneProjektliste,
  entferneAufgabe,
  entferneProjektliste,
  setzeAufgaben,
  setzeAufgabenstand,
  setzeProjektstand,
  setzeWorkspaceZiel,
  setzeZiel,
  schreibeProjektliste,
  type Aufgabeneintrag,
} from './state.ts'
import { istRolle, type Aufgabenstand, type CrewRolle, type CrewZustand, type Zielstand } from './types.ts'

/** Was ein Werkzeug über den Aufruf weiß. */
export interface Werkzeugkontext {
  /** Die Crew, um die es geht. */
  crew: string
  /** Nutzer und Projekt. */
  bereich: Projektbereich
  /** Die Rolle, in deren Namen gehandelt wird. */
  aufrufer: CrewRolle
  /** Der Speicher. */
  speicher: CrewZustandSpeicher
}

/** Was ein Werkzeug über eine Rolle zurückgibt. */
export interface Rollenauskunft {
  /** Die Rolle. */
  rolle: CrewRolle
  /** Das Ziel, wenn eins gesetzt ist. */
  ziel?: { text: string; stand: Zielstand }
  /** Die Aufgaben. */
  aufgaben: { id: string; text: string; stand: Aufgabenstand }[]
}

/** Was ein Werkzeug insgesamt zurückgibt. */
export interface Zustandsauskunft {
  /** Die Crew. */
  crew: string
  /** Der Nutzer — steht im Ergebnis, damit ein Aufruf nicht versehentlich fremd wirkt. */
  nutzer: string
  /** Das Projekt. */
  projekt: string
  /** Der Pfad des Dokuments, wenn es einen gibt. */
  pfad?: string
  /** Ob dieser Aufruf etwas geschrieben hat. */
  geaendert: boolean
  /** Der Stand je Rolle. */
  rollen: Rollenauskunft[]
  /** Die Projektebene, wenn sie beschrieben ist. */
  projektebene?: {
    ziel?: { text: string; stand: Zielstand }
    projekte: { id: string; name: string; aufgaben: { id: string; text: string; stand: Aufgabenstand }[] }[]
  }
}

/**
 * Prüft, ob die aufrufende Rolle eine fremde Rolle schreiben darf.
 *
 * @param kontext - der Auftrag
 * @param ziel - die Rolle, die geschrieben werden soll
 * @throws Error wenn eine Nicht-Planer-Rolle eine fremde Rolle schreiben will
 */
function pruefeSchreibrecht(kontext: Werkzeugkontext, ziel: CrewRolle): void {
  if (kontext.aufrufer === 'planner' || kontext.aufrufer === ziel) return
  throw new Error(
    `Rolle "${kontext.aufrufer}" darf nur den eigenen Stand schreiben, nicht den von "${ziel}" — `
      + 'das darf nur der Planer',
  )
}

/**
 * Baut die Auskunft aus einem Dokument.
 *
 * @param zustand - das Dokument
 * @param pfad - der Pfad, wenn es einen gibt
 * @param geaendert - ob geschrieben wurde
 * @returns die Auskunft
 */
function auskunft(zustand: CrewZustand, pfad: string | undefined, geaendert: boolean): Zustandsauskunft {
  const rollen: Rollenauskunft[] = []
  for (const [name, stand] of Object.entries(zustand.rollen)) {
    if (stand === undefined || !istRolle(name)) continue
    const eintrag: Rollenauskunft = {
      rolle: name,
      aufgaben: stand.aufgaben.map((aufgabe) => ({ id: aufgabe.id, text: aufgabe.text, stand: aufgabe.stand })),
    }
    if (stand.ziel !== undefined) eintrag.ziel = { text: stand.ziel.text, stand: stand.ziel.stand }
    rollen.push(eintrag)
  }
  const ergebnis: Zustandsauskunft = {
    crew: zustand.crew,
    nutzer: zustand.nutzer,
    projekt: zustand.projekt,
    geaendert,
    rollen,
  }
  if (pfad !== undefined) ergebnis.pfad = pfad
  if (zustand.workspace !== undefined) {
    const ebene: NonNullable<Zustandsauskunft['projektebene']> = {
      projekte: zustand.workspace.projekte.map((liste) => ({
        id: liste.id,
        name: liste.name,
        aufgaben: liste.aufgaben.map((aufgabe) => ({ id: aufgabe.id, text: aufgabe.text, stand: aufgabe.stand })),
      })),
    }
    if (zustand.workspace.ziel !== undefined) {
      ebene.ziel = { text: zustand.workspace.ziel.text, stand: zustand.workspace.ziel.stand }
    }
    ergebnis.projektebene = ebene
  }
  return ergebnis
}

/**
 * `crew_plan` — den Stand lesen oder das Ziel **einer** Rolle setzen.
 *
 * @param kontext - der Auftrag
 * @param args - Aktion, Rolle, Ziel und Zielstand
 * @returns die Auskunft
 */
export async function crewPlan(
  kontext: Werkzeugkontext,
  args: { aktion?: 'view' | 'set'; rolle?: CrewRolle; ziel?: string; stand?: Zielstand } = {},
): Promise<Zustandsauskunft> {
  const aktion = args.aktion ?? 'view'
  if (aktion === 'view') {
    const zustand = await kontext.speicher.lesen(kontext.crew, kontext.bereich)
    return auskunft(zustand, kontext.speicher.pfadVon(kontext.crew, kontext.bereich), false)
  }
  const rolle = args.rolle
  if (rolle === undefined) throw new Error('crew_plan: Aktion "set" braucht die Rolle')
  if (!istRolle(rolle)) throw new Error(`crew_plan: unbekannte Rolle "${String(rolle)}"`)
  pruefeSchreibrecht(kontext, rolle)
  const ziel = args.ziel
  if (ziel === undefined) throw new Error('crew_plan: Aktion "set" braucht das Ziel')
  const aenderung = await kontext.speicher.aendern(kontext.crew, kontext.bereich, (zustand, jetzt) =>
    setzeZiel(zustand, rolle, ziel, args.stand ?? 'active', jetzt),
  )
  return auskunft(aenderung.zustand, kontext.speicher.pfadVon(kontext.crew, kontext.bereich), aenderung.geaendert)
}

/**
 * `crew_todo` — die **vollständige** Aufgabenliste einer Rolle schreiben.
 *
 * @param kontext - der Auftrag
 * @param args - Rolle, Liste und ob erledigte bleiben
 * @returns die Auskunft
 */
export async function crewTodo(
  kontext: Werkzeugkontext,
  args: { rolle?: CrewRolle; aufgaben?: Aufgabeneintrag[]; behalteErledigte?: boolean },
): Promise<Zustandsauskunft> {
  const rolle = args.rolle
  if (rolle === undefined) throw new Error('crew_todo: die Rolle fehlt')
  if (!istRolle(rolle)) throw new Error(`crew_todo: unbekannte Rolle "${String(rolle)}"`)
  pruefeSchreibrecht(kontext, rolle)
  const aufgaben = args.aufgaben ?? []
  const aenderung = await kontext.speicher.aendern(kontext.crew, kontext.bereich, (zustand, jetzt) =>
    setzeAufgaben(zustand, rolle, aufgaben, jetzt, args.behalteErledigte ?? true),
  )
  return auskunft(aenderung.zustand, kontext.speicher.pfadVon(kontext.crew, kontext.bereich), aenderung.geaendert)
}

/**
 * `crew_todo_status` — **eine** Aufgabe anlegen, umstellen, umbenennen oder entfernen.
 *
 * @param kontext - der Auftrag
 * @param args - Rolle, Kennung, neuer Stand, neuer Text, Entfernen
 * @returns die Auskunft
 */
export async function crewTodoStatus(
  kontext: Werkzeugkontext,
  args: {
    rolle?: CrewRolle
    id?: string
    stand?: Aufgabenstand
    text?: string
    entfernen?: boolean
  },
): Promise<Zustandsauskunft> {
  const rolle = args.rolle
  if (rolle === undefined) throw new Error('crew_todo_status: die Rolle fehlt')
  if (!istRolle(rolle)) throw new Error(`crew_todo_status: unbekannte Rolle "${String(rolle)}"`)
  pruefeSchreibrecht(kontext, rolle)
  const kennung = args.id
  if (kennung === undefined || kennung.trim() === '') throw new Error('crew_todo_status: die Kennung fehlt')
  const aenderung = await kontext.speicher.aendern(kontext.crew, kontext.bereich, (zustand, jetzt) => {
    if (args.entfernen === true) return entferneAufgabe(zustand, rolle, kennung)
    return setzeAufgabenstand(zustand, rolle, kennung, args.stand, jetzt, args.text)
  })
  return auskunft(aenderung.zustand, kontext.speicher.pfadVon(kontext.crew, kontext.bereich), aenderung.geaendert)
}

/**
 * `crew_workspace` — die Projektebene: Ziel und benannte Arbeitsströme.
 *
 * @param kontext - der Auftrag
 * @param args - Aktion und ihre Felder
 * @returns die Auskunft
 */
export async function crewWorkspace(
  kontext: Werkzeugkontext,
  args: {
    aktion?:
      | 'view'
      | 'set_goal'
      | 'add_project'
      | 'rename_project'
      | 'write_project'
      | 'set_project_status'
      | 'remove_project'
    ziel?: string
    stand?: Zielstand
    projekt?: string
    name?: string
    aufgaben?: Aufgabeneintrag[]
    behalteErledigte?: boolean
  } = {},
): Promise<Zustandsauskunft> {
  const aktion = args.aktion ?? 'view'
  if (aktion === 'view') {
    const zustand = await kontext.speicher.lesen(kontext.crew, kontext.bereich)
    return auskunft(zustand, kontext.speicher.pfadVon(kontext.crew, kontext.bereich), false)
  }
  if (kontext.aufrufer !== 'planner') {
    throw new Error(
      `Rolle "${kontext.aufrufer}" darf die Projektebene nicht schreiben — das darf nur der Planer`,
    )
  }
  const aenderung = await kontext.speicher.aendern(kontext.crew, kontext.bereich, (zustand, jetzt) => {
    switch (aktion) {
      case 'set_goal': {
        if (args.ziel === undefined) throw new Error('crew_workspace: Aktion "set_goal" braucht das Ziel')
        return setzeWorkspaceZiel(zustand, args.ziel, args.stand ?? 'active', jetzt)
      }
      case 'add_project':
      case 'write_project': {
        if (args.projekt === undefined || args.projekt.trim() === '') {
          throw new Error(`crew_workspace: Aktion "${aktion}" braucht ein Projekt`)
        }
        if (args.name === undefined && args.aufgaben === undefined) {
          throw new Error(`crew_workspace: Aktion "${aktion}" braucht einen Namen oder Aufgaben`)
        }
        return schreibeProjektliste(
          zustand,
          args.projekt,
          args.name,
          args.aufgaben ?? [],
          jetzt,
          args.behalteErledigte ?? true,
        )
      }
      case 'rename_project': {
        if (args.projekt === undefined) throw new Error('crew_workspace: Aktion "rename_project" braucht ein Projekt')
        if (args.name === undefined) throw new Error('crew_workspace: Aktion "rename_project" braucht einen Namen')
        return benenneProjektliste(zustand, args.projekt, args.name)
      }
      case 'set_project_status': {
        if (args.projekt === undefined) throw new Error('crew_workspace: Aktion "set_project_status" braucht ein Projekt')
        if (args.stand === undefined) throw new Error('crew_workspace: Aktion "set_project_status" braucht einen Stand')
        const stand: Aufgabenstand = args.stand === 'done' ? 'completed' : args.stand === 'pending' ? 'pending' : 'in_progress'
        return setzeProjektstand(zustand, args.projekt, stand, jetzt)
      }
      case 'remove_project': {
        if (args.projekt === undefined) throw new Error('crew_workspace: Aktion "remove_project" braucht ein Projekt')
        return entferneProjektliste(zustand, args.projekt)
      }
      default: {
        const erschopfend: never = aktion
        throw new Error(`crew_workspace: unbekannte Aktion "${String(erschopfend)}"`)
      }
    }
  })
  return auskunft(aenderung.zustand, kontext.speicher.pfadVon(kontext.crew, kontext.bereich), aenderung.geaendert)
}
