/**
 * Der Richter über Jev — ein typisiertes Urteil statt Prosa.
 *
 * ## Warum das den Richter robuster macht
 *
 * Der LLM-Richter liefert JSON, und JSON kann ausbleiben: Ein Modell antwortet in Prosa, das
 * Parsing scheitert, und der Lauf dreht eine Runde, bis das Budget endet (genau das ist im Test
 * aufgefallen). Jev liefert **keinen Text**, sondern eine Wahrscheinlichkeit für „ja" — die Form
 * kann nicht kaputtgehen, nur der Wert.
 *
 * ## Was hier bewusst **nicht** passiert
 *
 * - **Kein HTTP.** Dieses Modul kennt keinen Endpunkt und keinen Schlüssel. `JevClient` ist die
 *   Naht; wer die API anbindet, implementiert sie. Ohne Client gibt es kein Urteil.
 * - **Kein „vielleicht" als Bestehen.** Liegt `p` im Unsicherheitsband um 0,5 oder ist der Wert
 *   unbrauchbar, gilt der Rubric als **nicht erfüllt**. Ein unsicheres Ja ist kein Ja.
 *
 * ## Die Grenze, die bleibt
 *
 * Jev ist ein kleines Modell. Ob es fremde Antworten gegen einen Rubric zuverlässig bewertet, ist
 * **nicht belegt** — es ist eine Annahme, die der Eval prüfen muss. Die Typisierung garantiert die
 * Form, nicht die Wahrheit.
 *
 * @module @prometheus-harness/crew-provider/jev
 */

import type { Bewerte, EvalAufgabe } from './eval.ts'

/** Ein Urteil von Jev. */
export interface JevUrteil {
  /** Die Wahrscheinlichkeit für „ja" (0 bis 1). */
  p: number
}

/**
 * Die Naht zur Jev-API.
 *
 * **Warum nur `noul`.** Für den Richter ist die Frage binär: Erfüllt die Antwort den Rubric?
 * Dafür ist Noul das passende Primitiv (Wahrscheinlichkeit für eine Bedingung). Choice und Score
 * wären für andere Fragen richtig — hier wären sie Umwege.
 */
export interface JevClient {
  /**
   * Stellt eine Noul-Frage über einem Zustand.
   *
   * @param frage - die Frage in natürlicher Sprache
   * @param state - der Zustand (Rubric, Aufgabe, Antwort)
   * @returns die Wahrscheinlichkeit für „ja"
   */
  noul(frage: string, state: Record<string, unknown>): Promise<JevUrteil>
}

/** Die Schwellen, an denen aus einer Wahrscheinlichkeit ein Urteil wird. */
export interface JevSchwellen {
  /** Ab welchem `p` der Rubric als erfüllt gilt (Vorgabe 0,7). */
  pass: number
  /** Wie breit das Unsicherheitsband um 0,5 ist (Vorgabe 0,15). */
  band: number
}

/** Die Vorgaben — vor dem Lauf festgelegt, nicht nachträglich angepasst. */
export const JEV_SCHWELLEN: JevSchwellen = { pass: 0.7, band: 0.15 }

/**
 * Baut die Bewertungsfunktion über einem Jev-Client.
 *
 * @param client - die Naht zur API
 * @param schwellen - die Schwellen (Vorgabe `JEV_SCHWELLEN`)
 * @returns die Bewertungsfunktion für den Eval
 */
export function bewerteMitJev(client: JevClient, schwellen: Partial<JevSchwellen> = {}): Bewerte {
  const pass = schwellen.pass ?? JEV_SCHWELLEN.pass
  const band = schwellen.band ?? JEV_SCHWELLEN.band
  if (!Number.isFinite(pass) || pass <= 0 || pass >= 1) {
    throw new Error(`pass muss zwischen 0 und 1 liegen, war ${String(pass)}`)
  }
  if (!Number.isFinite(band) || band < 0 || band >= 0.5) {
    throw new Error(`band muss in [0, 0.5) liegen, war ${String(band)}`)
  }

  return async (aufgabe: EvalAufgabe, antwort: string) => {
    const urteil = await client.noul(
      'Erfüllt die Antwort den Rubric?',
      { aufgabe: aufgabe.auftrag, rubric: aufgabe.rubric, antwort },
    )
    // **Unbrauchbare Werte sind kein Bestehen — und nicht dasselbe wie „nein".** Ein NaN aus der
    // API ist ein Dienstfehler; ihn als 0 zu lesen würde ihn mit einer echten Ablehnung verwechseln.
    if (!Number.isFinite(urteil.p)) {
      return { pass: false, begruendung: 'unbrauchbarer Wert (kein endliches p)' }
    }
    const p = Math.min(1, Math.max(0, urteil.p))
    if (Math.abs(p - 0.5) < band) {
      return { pass: false, begruendung: `unsicher (p=${p.toFixed(2)}) — nicht bestanden` }
    }
    return {
      pass: p >= pass,
      begruendung: `p=${p.toFixed(2)} (Schwelle ${String(pass)})`,
    }
  }
}

/**
 * Ein Client für Tests und für den Fall, dass Jev nicht erreichbar ist.
 *
 * **Warum das nicht der Produktionsweg ist.** Ein fester Wert macht den Eval zu einer
 * Selbstbestätigung. Der Client existiert, damit die Naht ohne API prüfbar ist — nicht, damit man
 * ihn im Betrieb einsetzt.
 *
 * @param p - die feste Wahrscheinlichkeit
 * @returns ein Client, der immer `p` liefert
 */
export function festerJevClient(p: number): JevClient {
  return {
    noul: async () => ({ p }),
  }
}
