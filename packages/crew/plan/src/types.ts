/**
 * Rollen und Dokumente — die Form, an der alles andere hängt.
 *
 * ## Warum fünf Rollen aus dem Harness und eine sechste hier
 *
 * Der Harness kennt `planner`, `executor`, `reviewer`, `vision`, `helper`. Fünf davon sind Rollen
 * mit einer Aufgabe im Ablauf; `helper` ist im Harness deklariert, wird aber **von keiner Zeile
 * aufgerufen** (gemessen am Crew-Bericht: `config.ts:40` gegen 0 Aufrufstellen). Eine tote Rolle
 * wird hier nicht mitgeschleppt — sie wird auch nicht stillschweigend gestrichen, sondern
 * **benannt**: `helper` bleibt wählbar, weil eine Crew sie binden darf, aber kein Ablauf schickt
 * ihr etwas.
 *
 * Die sechste Rolle ist Prometheus-eigen: **`search`**. Der Betreiber will eine Crew, die „starkes
 * Modell, Bildmodell **oder Browser-Suche**" je nach Aufgabe einsetzt. Der Harness hat dafür
 * nichts — dort darf ein Worker nur zufällig registrierte Werkzeuge aufrufen. Hier ist die Suche
 * ein **Ziel einer Rolle**: der Planer kann einen Schritt der Rolle `search` zuweisen, und die
 * Naht gibt dieser Rolle die Suchwerkzeuge.
 *
 * ## Warum die Zustände drei und nicht zwei sind
 *
 * `pending`, `in_progress`, `completed` — ein zweiter Zustand („läuft gerade") ist der Unterschied
 * zwischen „der Plan ist abgearbeitet" und „der Plan hängt". Ohne ihn sieht ein abgebrochener
 * Schritt wie ein offener aus, und beim nächsten Lauf beginnt er wieder von vorn.
 *
 * @module @prometheus-harness/crew-plan/types
 */

/** Die Rollen einer Crew, in Anzeigereihenfolge. */
export const CREW_ROLLEN = ['planner', 'executor', 'reviewer', 'vision', 'search', 'helper'] as const

/** Eine Rolle einer Crew. */
export type CrewRolle = (typeof CREW_ROLLEN)[number]

/** Die Zustände einer Aufgabe. */
export const AUFGABEN_STAENDE = ['pending', 'in_progress', 'completed'] as const

/** Der Zustand einer Aufgabe. */
export type Aufgabenstand = (typeof AUFGABEN_STAENDE)[number]

/** Die Zustände eines Ziels. */
export const ZIEL_STAENDE = ['pending', 'active', 'done'] as const

/** Der Zustand eines Ziels. */
export type Zielstand = (typeof ZIEL_STAENDE)[number]

/**
 * Höchstzahl gehaltener Aufgaben je Rolle.
 *
 * **Warum eine Grenze und nicht unbegrenzt.** Das Dokument wird als Ganzes gelesen und geschrieben;
 * ein Plan mit tausenden Aufgaben wird bei jedem Zugriff kopiert. Der Harness nimmt dieselbe Zahl
 * (200, `state.ts:136`). Beim Überschreiten fällt die **älteste erledigte** Aufgabe heraus — nie
 * eine offene.
 */
export const MAX_AUFGABEN_JE_ROLLE = 200

/** Das dauerhafte Ziel einer Rolle oder des Projekts. */
export interface CrewZiel {
  /** Was erreicht werden soll. */
  text: string
  /** Wo es steht. */
  stand: Zielstand
  /** Wann es zuletzt gesetzt wurde (ISO 8601). */
  aktualisiert: string
}

/** Eine Aufgabe: eine Zeile des Plans, die abgehakt werden kann. */
export interface CrewAufgabe {
  /** Stabile Kennung innerhalb der Rolle — der Planer schreibt sie, der Worker meldet sie zurück. */
  id: string
  /** Was zu tun ist. */
  text: string
  /** Wo sie steht. */
  stand: Aufgabenstand
  /** Wann sie angelegt wurde (ISO 8601). */
  erstellt: string
  /** Wann sie zuletzt geändert wurde (ISO 8601). */
  aktualisiert: string
}

/** Der Stand **einer** Rolle in **einem** Projekt. */
export interface Rollenzustand {
  /** Das dauerhafte Ziel dieser Rolle; fehlt, solange keins gesetzt ist. */
  ziel?: CrewZiel
  /** Die Aufgaben dieser Rolle, in Planreihenfolge. */
  aufgaben: CrewAufgabe[]
}

/** Ein benannter Arbeitsstrom auf Projektebene („Archiv" der Vorhaben). */
export interface Projektliste {
  /** Stabile Kennung des Arbeitsstroms. */
  id: string
  /** Anzeigename. */
  name: string
  /** Die Aufgaben dieses Arbeitsstroms. */
  aufgaben: CrewAufgabe[]
}

/** Die Projektebene: das Ziel des Projekts und seine Arbeitsströme. */
export interface Workspacezustand {
  /** Das Ziel des ganzen Projekts; fehlt, solange keins gesetzt ist. */
  ziel?: CrewZiel
  /** Die Arbeitsströme, in Anlage-Reihenfolge. */
  projekte: Projektliste[]
}

/**
 * Ein Plandokument — **ein** Dokument je Crew, Nutzer und Projekt.
 *
 * `nutzer` und `projekt` stehen **im** Dokument, nicht nur im Pfad: wer ein Dokument ohne seinen
 * Pfad liest, sieht trotzdem, wem es gehört. Der Pfad allein wäre eine Behauptung über das
 * Dateisystem.
 */
export interface CrewZustand {
  /** Fassung des Formats. `1` heute — ein anderes Feld als diese Zahl wird nicht gelesen. */
  fassung: 1
  /** Die Crew, zu der der Plan gehört. */
  crew: string
  /** Der Nutzer, dem der Plan gehört. */
  nutzer: string
  /** Das Projekt (das Etikett aus dem Pfad). */
  projekt: string
  /** Wann das Dokument angelegt wurde (ISO 8601). */
  erstellt: string
  /** Wann es zuletzt geändert wurde (ISO 8601). */
  aktualisiert: string
  /** Der Stand je Rolle; eine nicht beteiligte Rolle fehlt. */
  rollen: Partial<Record<CrewRolle, Rollenzustand>>
  /** Die Projektebene; fehlt, solange niemand sie beschrieben hat. */
  workspace?: Workspacezustand
}

/**
 * Ein leeres Dokument für genau eine Crew, einen Nutzer und ein Projekt.
 *
 * @param feld - Crew, Nutzer, Projekt und der Zeitpunkt
 * @returns ein Dokument ohne Rollen und ohne Projektebene
 */
export function leererZustand(feld: {
  crew: string
  nutzer: string
  projekt: string
  jetzt: string
}): CrewZustand {
  return {
    fassung: 1,
    crew: feld.crew,
    nutzer: feld.nutzer,
    projekt: feld.projekt,
    erstellt: feld.jetzt,
    aktualisiert: feld.jetzt,
    rollen: {},
  }
}

/**
 * Der Stand einer Rolle, angelegt wenn es noch keinen gibt.
 *
 * **Warum angelegt und nicht `undefined` zurück.** Jeder Aufrufer will entweder lesen oder
 * schreiben; ein `undefined` zwingt jeden von ihnen zu derselben Prüfung. Der leere Stand ist die
 * Antwort, die immer stimmt.
 *
 * @param zustand - das Dokument
 * @param rolle - die Rolle
 * @returns der Stand der Rolle (bei Bedarf neu angelegt)
 */
export function rollenstand(zustand: CrewZustand, rolle: CrewRolle): Rollenzustand {
  const vorhanden = zustand.rollen[rolle]
  if (vorhanden !== undefined) return vorhanden
  const neu: Rollenzustand = { aufgaben: [] }
  zustand.rollen[rolle] = neu
  return neu
}

/**
 * Ist dieser Text eine bekannte Rolle?
 *
 * @param wert - der geprüfte Text
 * @returns ob er eine Rolle nennt
 */
export function istRolle(wert: unknown): wert is CrewRolle {
  return typeof wert === 'string' && (CREW_ROLLEN as readonly string[]).includes(wert)
}

/**
 * Ist dieser Text ein bekannter Aufgabenzustand?
 *
 * @param wert - der geprüfte Text
 * @returns ob er einen Aufgabenzustand nennt
 */
export function istAufgabenstand(wert: unknown): wert is Aufgabenstand {
  return typeof wert === 'string' && (AUFGABEN_STAENDE as readonly string[]).includes(wert)
}

/**
 * Ist dieser Text ein bekannter Zielzustand?
 *
 * @param wert - der geprüfte Text
 * @returns ob er einen Zielzustand nennt
 */
export function istZielstand(wert: unknown): wert is Zielstand {
  return typeof wert === 'string' && (ZIEL_STAENDE as readonly string[]).includes(wert)
}

/**
 * Der Fehler, wenn eine Rolle mehr **offene** Aufgaben hätte, als das Dokument trägt.
 *
 * **Warum ein eigener Fehler und kein stilles Abschneiden.** Eine abgeschnittene offene Aufgabe
 * ist Arbeit, die verschwindet, ohne daß jemand es merkt. Lieber ein Lauf, der scheitert und den
 * Grund nennt.
 */
export class Aufgabengrenze extends Error {
  /**
   * @param rolle - die Rolle, deren Grenze erreicht war
   * @param zahl - wie viele offene Aufgaben es geworden wären
   */
  constructor(rolle: CrewRolle, zahl: number) {
    super(
      `Rolle "${rolle}": ${String(zahl)} offene Aufgaben — hoechstens ${String(MAX_AUFGABEN_JE_ROLLE)} `
        + 'werden getragen; erst erledigen, dann erweitern',
    )
    this.name = 'Aufgabengrenze'
  }
}
