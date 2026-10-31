/**
 * Die Naht: eine Crew als Anbieter — und zwei Fehler des Harness, die hier nicht mitkommen.
 *
 * ## Was die Naht tut
 *
 * Sie hängt sich als **ein** `LlmProvider` in den Seam, unter dem Namen `crew:<id>`. Jede Anfrage
 * wird nach derselben Regel einer Rolle zugeordnet (`routen` aus `crew-plan`), und die Anfrage geht
 * mit dem **Modell dieser Rolle** an den Anbieter, der die Rolle bedient. Der Kern bleibt
 * unberührt: er sieht einen Anbieter wie jeden anderen.
 *
 * ## Fehler 1 — die Bildrolle hat keinen Weg
 *
 * Der Seam von Prometheus kennt **keine** Bildteile: `MessagePart` ist `TextPart |
 * ToolResultPart | ToolCallPart` (`packages/llm/llm/src/index.ts:80`). Der Harness konnte ein Bild
 * an die `vision`-Rolle reichen, weil seine Nachrichten Bildinhalte tragen. Hier ist das
 * **strukturell unmöglich**: eine Anfrage kommt ohne Bild an, also gibt es nichts zu erkennen. Die
 * `vision`-Rolle ist damit nur über eine **Beschreibung als Text** erreichbar (`crewLauf` nimmt
 * dafür `bildBeschreibung`) — und das steht als Grenze, nicht als Behauptung.
 *
 * ## Fehler 2 — die Rekursion, die im Harness nur die Oberfläche verhinderte
 *
 * Der Harness prüft **nicht**, daß eine Rolle auf die Crew-Route selbst zeigt (`adapter.ts:264-267`
 * ist ein Kommentar, keine Prüfung; die Sperre saß nur im Modellwähler). Eine handgeschriebene
 * Einstellung konnte damit eine Crew in sich selbst schicken. `pruefeCrew` lehnt das hier **im
 * Host** ab — fail-closed, weil eine Rekursion nicht „ein bißchen" passiert.
 *
 * @module @prometheus-harness/crew-provider/adapter
 */

import {
  LlmError,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
} from '@prometheus-harness/llm'
import { CREW_ROLLEN, istRolle, routen, type CrewRolle } from '@prometheus-harness/crew-plan'

/** Wohin eine Rolle zeigt: eine Route im Seam und ein Modell. */
export interface Rollenbindung {
  /** Die Route (`deepseek-official`), unter der der Seam den Anbieter kennt. */
  familie: string
  /** Die Modellkennung, wie der Anbieter sie nennt. */
  modell: string
}

/** Eine Crew: ein Name, ein Satz Rollen. */
export interface CrewDefinition {
  /** Die Kennung — sie erscheint als Modellname im Seam. */
  id: string
  /** Der Name für Menschen; fehlt er, gilt die Kennung. */
  name?: string
  /** Die gebundenen Rollen; eine fehlende Rolle ist „nicht gebunden". */
  rollen: Partial<Record<CrewRolle, Rollenbindung>>
}

/** Wie der Seam einen Anbieter zu einer Route findet. */
export type Anbieterwahl = (familie: string) => LlmProvider | undefined

/** Die Route, unter der eine Crew selbst erscheint — nie ein Ziel einer Rolle. */
export const CREW_ROUTE = 'crew'

/**
 * Prüft eine Crew, bevor sie benutzt wird.
 *
 * **Warum das der Host tun muß.** Die Rollen kommen aus einer Einstellung — also aus einem
 * Dokument, das jemand von Hand schreiben kann. Eine Rolle, die auf `crew` zeigt, schickt eine
 * Crew-Anfrage in eine Crew; der Harness hatte dafür nur eine Sperre in der Oberfläche.
 *
 * @param crew - die Crew
 * @returns die Befunde; leer heißt „benutzbar"
 */
export function pruefeCrew(crew: CrewDefinition): string[] {
  const befund: string[] = []
  if (crew.id.trim() === '') befund.push('die Crew braucht eine Kennung')
  if (crew.id === CREW_ROUTE) befund.push('eine Crew darf nicht "crew" heissen — das ist die Route selbst')
  for (const [rolle, bindung] of Object.entries(crew.rollen)) {
    if (!istRolle(rolle)) {
      befund.push(`unbekannte Rolle "${rolle}" (bekannt: ${CREW_ROLLEN.join(', ')})`)
      continue
    }
    if (bindung === undefined) continue
    if (bindung.familie.trim() === '' || bindung.modell.trim() === '') {
      befund.push(`Rolle "${rolle}" ist halb gebunden (Route und Modell muessen stehen)`)
    }
    if (bindung.familie === CREW_ROUTE) {
      befund.push(
        `Rolle "${rolle}" zeigt auf die Route "${CREW_ROUTE}" — das waere eine Crew in einer Crew `
          + '(der Harness liess das zu, hier nicht)',
      )
    }
  }
  if (Object.keys(crew.rollen).length === 0) befund.push('die Crew bindet keine Rolle')
  return befund
}

/**
 * Baut aus einer Crew einen Anbieter für den Seam.
 *
 * @param crew - die Crew
 * @param optionen - wie ein Anbieter zu einer Route gefunden wird, und wohin Meldungen gehen
 * @returns ein `LlmProvider` namens `crew:<id>`
 * @throws Error wenn die Crew die Prüfung nicht besteht
 */
export function crewAnbieter(
  crew: CrewDefinition,
  optionen: { anbieter: Anbieterwahl; melde?: (fehler: unknown) => void },
): LlmProvider {
  const befunde = pruefeCrew(crew)
  if (befunde.length > 0) {
    throw new Error(`Crew "${crew.id}" ist nicht benutzbar: ${befunde.join('; ')}`)
  }
  const melde = optionen.melde ?? (() => {})
  const gebunden = Object.keys(crew.rollen).filter((rolle) => istRolle(rolle)) as CrewRolle[]

  return {
    name: `${CREW_ROUTE}:${crew.id}`,
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const rolle = routen({ bild: false, gebunden })
      const bindung = crew.rollen[rolle]
      if (bindung === undefined) {
        // Kann nach `routen` nicht eintreten; trotzdem kein `!` auf eine Einstellung.
        throw new LlmError('rejected', `Rolle "${rolle}" ist nicht gebunden`)
      }
      const ziel = optionen.anbieter(bindung.familie)
      if (ziel === undefined) {
        throw new LlmError(
          'credentials',
          `für die Rolle "${rolle}" gibt es keinen Anbieter unter der Route "${bindung.familie}"`,
        )
      }
      try {
        const antwort = await ziel.complete({ ...request, model: bindung.modell })
        if (antwort.model === '') return { ...antwort, model: bindung.modell }
        return antwort
      } catch (fehler) {
        melde(fehler)
        throw fehler
      }
    },
  }
}

/**
 * Nennt die Rollen einer Crew mit ihren Zielen — für eine Anzeige oder einen Bericht.
 *
 * @param crew - die Crew
 * @returns je Rolle Route und Modell (nur gebundene Rollen)
 */
export function crewModelle(crew: CrewDefinition): { rolle: CrewRolle; familie: string; modell: string }[] {
  const liste: { rolle: CrewRolle; familie: string; modell: string }[] = []
  for (const rolle of CREW_ROLLEN) {
    const bindung = crew.rollen[rolle]
    if (bindung === undefined) continue
    liste.push({ rolle, familie: bindung.familie, modell: bindung.modell })
  }
  return liste
}
