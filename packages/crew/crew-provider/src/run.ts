/**
 * Die Ausführung: aus einem Ziel wird über den echten Seam ein Lauf.
 *
 * ## Was hier zusammengesetzt wird
 *
 * `crew-plan` weiß, **wie** geplant und abgearbeitet wird (Zerlegung, Wellen, Prüfschleife) — aber
 * nicht, **wer** die Rollen ausführt. Dieses Modul reicht die eine Funktion nach, die dem Kern
 * fehlt: `rufeRolle`, gebaut aus einem `Anbieterwahl` und den Rollenbindungen. Damit ist die Kette
 * vollständig — Ziel → Plan → Wellen → Rolle → Anbieter → Antwort → Prüfung — ohne daß eines der
 * beiden Pakete das andere kennt.
 *
 * ## Was der Lauf **nicht** tut
 *
 * - Er **plant nicht neu**, wenn die Prüfung beanstandet: dieselbe Tabelle läuft mit den Mängeln
 *   erneut (wie im Harness, `tool.ts:597-645`).
 * - Er **versteckt fehlende Token nicht**: meldet ein Anbieter kein `usage`, zählt der Schritt mit
 *   0 — und das ist eine Untergrenze, keine Messung.
 * - Er **kennt kein Bild**, weil der Seam keins trägt. Eine Bildbeschreibung kommt als **Text**
 *   herein (`bildBeschreibung`) und steht dann in jedem Auftrag.
 *
 * @module @prometheus-harness/crew-provider/run
 */

import { textMessage, type LlmProvider } from '@prometheus-harness/llm'
import {
  fuehreAus,
  zerlegePlan,
  type CrewPersona,
  type CrewRolle,
  type Lauf,
  type PlanSchritt,
  type Rollenaufruf,
} from '@prometheus-harness/crew-plan'

import {
  pruefeCrew,
  type Anbieterwahl,
  type CrewDefinition,
  type Rollenbindung,
} from './adapter.ts'

/** Was zum Ausführen eines Laufs nötig ist. */
export interface CrewLaufOptionen {
  /** Die Crew mit ihren Rollenbindungen. */
  crew: CrewDefinition
  /** Wie der Seam einen Anbieter zu einer Route findet. */
  anbieter: Anbieterwahl
  /** Das Ziel. */
  ziel: string
  /** Eine bereits vorhandene Antwort des Planers; fehlt sie, wird der Planer gefragt. */
  planerAntwort?: string
  /** Wie viele Runden höchstens (Vorgabe 3). */
  maxVersuche?: number
  /** Kumulatives Token-Budget (0 oder fehlend heißt unbegrenzt). */
  maxTokens?: number
  /** Die Beschreibung eines Bildes als **Text** — der Seam trägt keine Bilder. */
  bildBeschreibung?: string
  /** Die prüfende Rolle; `null` heißt: keine Prüfung. Vorgabe `reviewer`, wenn gebunden. */
  pruefer?: CrewRolle | null
  /**
   * Die Personas des Rats; leer oder fehlend heißt: keine Ratssitzung.
   *
   * **Was sich dadurch ändert.** Ohne Rat läuft die Prüfschleife wie bisher. Mit Rat prüfen
   * alle genannten Personas den Entwurf, und der Richter entscheidet.
   */
  rat?: readonly CrewPersona[]
  /** Die Prüfkriterien für Rat und Richter. Ohne sie entscheidet der Richter gröber. */
  rubric?: string
  /** Die Rolle des Richters (Vorgabe `reviewer`); `null` heißt: der Rat entscheidet selbst. */
  richter?: CrewRolle | null
  /**
   * Ein zusätzlicher Prüfmaßstab für den Richter — etwa der Text einer Skill.
   *
   * **Warum das kein Werkzeugaufruf ist.** Der Richter prüft; er handelt nicht. Eine Skill wie
   * „Sicherheitsprüfung" liefert Kriterien, gegen die er prüft. Der Text steht im Auftrag und
   * damit im Protokoll — nachvollziehbar, statt versteckt.
   */
  richterSkill?: string
  /**
   * Welche Rolle eine Persona bedient.
   *
   * **Warum das eine Zuordnung ist und keine Ableitung.** Aus dem Tier (`billig`, `mittel`,
   * `stark`) auf eine Rolle zu schließen wäre eine Annahme über Modellpreise, die niemand
   * geprüft hat. Ohne Angabe prüft eine Persona mit der Rolle `reviewer` — der Rolle, die
   * ohnehin prüft.
   */
  personaRollen?: Partial<Record<CrewPersona, CrewRolle>>
  /** Wohin Fehler der Anbieter gehen (sie werden weitergeworfen). */
  melde?: (fehler: unknown) => void
}

/** Was ein Lauf vorzuweisen hat. */
export interface CrewErgebnis {
  /** Der Lauf aus dem Kern. */
  lauf: Lauf
  /** Der Plan, mit dem gearbeitet wurde. */
  plan: PlanSchritt[]
  /** Die Rolle, die geplant hat (oder `null`, wenn der Plan hereingereicht wurde). */
  planerRolle: CrewRolle | null
}

/**
 * Löst eine Rolle in ihren Anbieter und ihr Modell auf.
 *
 * @param crew - die Crew
 * @param anbieter - die Anbieterwahl
 * @param rolle - die Rolle
 * @returns Anbieter und Modell
 * @throws Error wenn die Rolle nicht gebunden ist oder ihre Route keinen Anbieter hat
 */
function loeseRolle(
  crew: CrewDefinition,
  anbieter: Anbieterwahl,
  rolle: CrewRolle,
): { ziel: LlmProvider; bindung: Rollenbindung } {
  const bindung = crew.rollen[rolle]
  if (bindung === undefined) {
    throw new Error(`Crew "${crew.id}": Rolle "${rolle}" ist nicht gebunden`)
  }
  const ziel = anbieter(bindung.familie)
  if (ziel === undefined) {
    throw new Error(
      `Crew "${crew.id}": für Rolle "${rolle}" gibt es keinen Anbieter unter "${bindung.familie}"`,
    )
  }
  return { ziel, bindung }
}

/**
 * Führt ein Ziel durch die Crew: Planen, Wellen, Prüfen.
 *
 * @param optionen - Crew, Anbieterwahl, Ziel und Grenzen
 * @returns der Lauf und der benutzte Plan
 * @throws Error wenn die Crew unbrauchbar ist oder eine Rolle keinen Anbieter hat
 */
export async function crewLauf(optionen: CrewLaufOptionen): Promise<CrewErgebnis> {
  const befunde = pruefeCrew(optionen.crew)
  if (befunde.length > 0) {
    throw new Error(`Crew "${optionen.crew.id}" ist nicht benutzbar: ${befunde.join('; ')}`)
  }
  const melde = optionen.melde ?? (() => {})

  /** Ruft eine Rolle über den Seam und liefert Text und Token. */
  const rufeRolle = async (rolle: CrewRolle, auftrag: string): Promise<Rollenaufruf> => {
    const { ziel, bindung } = loeseRolle(optionen.crew, optionen.anbieter, rolle)
    const mitBild = optionen.bildBeschreibung === undefined
      ? auftrag
      : `Bildbeschreibung: ${optionen.bildBeschreibung}\n\n${auftrag}`
    try {
      const antwort = await ziel.complete({ model: bindung.modell, messages: [textMessage('user', mitBild)] })
      return {
        text: antwort.text,
        tokens: {
          hinein: antwort.usage?.inputTokens ?? 0,
          heraus: antwort.usage?.outputTokens ?? 0,
        },
      }
    } catch (fehler) {
      melde(fehler)
      throw fehler
    }
  }

  /** Ruft eine Persona über den Seam — mit ihrem Prompt als System-Anweisung. */
  const rufePersona = async (
    persona: CrewPersona,
    auftrag: string,
    system: string,
  ): Promise<Rollenaufruf> => {
    const rolle = optionen.personaRollen?.[persona] ?? 'reviewer'
    const { ziel, bindung } = loeseRolle(optionen.crew, optionen.anbieter, rolle)
    try {
      const antwort = await ziel.complete({
        model: bindung.modell,
        messages: [textMessage('system', system), textMessage('user', auftrag)],
      })
      return {
        text: antwort.text,
        tokens: {
          hinein: antwort.usage?.inputTokens ?? 0,
          heraus: antwort.usage?.outputTokens ?? 0,
        },
      }
    } catch (fehler) {
      melde(fehler)
      throw fehler
    }
  }

  /**
   * Startet einen Lauf mit denselben Grenzen.
   *
   * **Warum eine Funktion.** Die beiden Wege (Plan hereingereicht oder Planer gefragt)
   * unterschieden sich nur im Plan; die Grenzen waren zweimal abgeschrieben. Eine Stelle ist
   * eine Stelle zu viel, wenn eine Option hinzukommt — wie jetzt.
   */
  const starte = async (plan: PlanSchritt[]): Promise<Lauf> => await fuehreAus({
    crew: optionen.crew.id,
    ziel: optionen.ziel,
    plan,
    rufe: rufeRolle,
    ...(optionen.maxVersuche === undefined ? {} : { maxVersuche: optionen.maxVersuche }),
    ...(optionen.maxTokens === undefined ? {} : { maxTokens: optionen.maxTokens }),
    pruefer: optionen.pruefer === undefined ? 'reviewer' : optionen.pruefer,
    ...(optionen.rat === undefined ? {} : { rat: optionen.rat }),
    ...(optionen.rubric === undefined ? {} : { rubric: optionen.rubric }),
    ...(optionen.richter === undefined ? {} : { richter: optionen.richter }),
    ...(optionen.richterSkill === undefined ? {} : { richterZusatz: optionen.richterSkill }),
    ...(optionen.rat === undefined || optionen.rat.length === 0 ? {} : { rufePersona }),
  })

  const vorhandene = optionen.planerAntwort
  if (vorhandene !== undefined) {
    const plan = zerlegePlan(vorhandene, optionen.ziel)
    return { lauf: await starte(plan), plan, planerRolle: null }
  }

  // Den Planer fragen — die Rolle `planner`, ersatzweise der `executor` (wie im Harness).
  const planerRolle: CrewRolle = optionen.crew.rollen.planner !== undefined ? 'planner' : 'executor'
  const planAntwort = await rufeRolle(
    planerRolle,
    `Ziel: ${optionen.ziel}\n\n`
      + 'Zerlege das Ziel in Schritte. Antworte NUR mit JSON: '
      + '{"steps":[{"id":"t1","instruction":"...","dependsOn":[],"role":"executor"}]}',
  )
  const plan = zerlegePlan(planAntwort.text, optionen.ziel)
  const lauf = await starte(plan)
  return { lauf, plan, planerRolle }
}
