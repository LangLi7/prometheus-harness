/**
 * Die vier Arme des Evals — als Fabriken über einem `LlmProvider`.
 *
 * **Warum Fabriken und keine festen Klassen.** Ein Arm ist eine Antwortstrategie, kein Objekt mit
 * Zustand. Wer einen anderen Anbieter oder ein anderes Modell testen will, baut den Arm neu —
 * ohne den Eval anzufassen.
 *
 * @module @prometheus-harness/crew-provider/arme
 */

import { textMessage, type CompletionResult, type LlmProvider } from '@prometheus-harness/llm'

import { mehrheit, type Beantworte, type Bewerte, type EvalAufgabe } from './eval.ts'
import { crewLauf, type CrewLaufOptionen } from './run.ts'

/** Der Preis je 1 000 Token. */
export interface Preis {
  /** Preis je 1 000 Eingabe-Token. */
  hinein: number
  /** Preis je 1 000 Ausgabe-Token. */
  heraus: number
}

/**
 * Rechnet die Kosten einer Antwort.
 *
 * @param nutzung - die gemeldete Nutzung (oder `undefined`)
 * @param preis - der Preis je 1 000 Token
 * @returns die Kosten in US-Dollar
 */
function kosten(nutzung: CompletionResult['usage'], preis: Preis): number {
  if (nutzung === undefined) return 0
  return (nutzung.inputTokens / 1000) * preis.hinein + (nutzung.outputTokens / 1000) * preis.heraus
}

/**
 * Arm A/B: ein Modell, ein Aufruf.
 *
 * @param anbieter - der Anbieter
 * @param modell - das Modell
 * @param preis - der Preis je 1 000 Token
 * @returns die Antwortstrategie
 */
export function armEinzelmodell(anbieter: LlmProvider, modell: string, preis: Preis): Beantworte {
  return async (aufgabe: EvalAufgabe) => {
    const antwort = await anbieter.complete({
      model: modell,
      messages: [textMessage('user', aufgabe.auftrag)],
    })
    return { antwort: antwort.text, usd: kosten(antwort.usage, preis) }
  }
}

/**
 * Arm D: mehrere Samples desselben Modells, Mehrheitsentscheid.
 *
 * **Warum das die unbequeme Baseline ist.** Sampling ist billig, parallel und braucht keinen
 * Richter. Wenn der Rat das nicht schlägt, ist er teurer Zierrat.
 *
 * @param anbieter - der Anbieter
 * @param modell - das Modell
 * @param preis - der Preis je 1 000 Token
 * @param anzahl - wie viele Samples (Vorgabe 5)
 * @returns die Antwortstrategie
 */
export function armSampling(
  anbieter: LlmProvider,
  modell: string,
  preis: Preis,
  anzahl = 5,
): Beantworte {
  if (!Number.isSafeInteger(anzahl) || anzahl < 1) {
    throw new Error(`anzahl muss eine positive ganze Zahl sein, war ${String(anzahl)}`)
  }
  return async (aufgabe: EvalAufgabe) => {
    const antworten = await Promise.all(
      Array.from({ length: anzahl }, async () => {
        const antwort = await anbieter.complete({
          model: modell,
          // Temperatur ist Teil des Seams; ohne sie wären fünf Samples identisch.
          temperature: 0.7,
          messages: [textMessage('user', aufgabe.auftrag)],
        })
        return antwort
      }),
    )
    const usd = antworten.reduce((summe, antwort) => summe + kosten(antwort.usage, preis), 0)
    return { antwort: mehrheit(antworten.map((antwort) => antwort.text)), usd }
  }
}

/**
 * Arm C: der Rat über `crewLauf`.
 *
 * **Was hier gemessen wird.** Nicht das Urteil des Rats, sondern sein **Entwurf** — die Summe der
 * Schrittergebnisse. Bewertet wird er danach vom Richter (`bewerteMitRichter`), also von einem
 * Modell, das nicht am Entwurf beteiligt war.
 *
 * @param optionen - Crew, Anbieter, Rat und Rubric
 * @param preis - der Preis je 1 000 Token (Durchschnitt über die Rollen)
 * @returns die Antwortstrategie
 */
export function armRat(
  optionen: Omit<CrewLaufOptionen, 'ziel' | 'planerAntwort'>,
  preis: Preis,
): Beantworte {
  return async (aufgabe: EvalAufgabe) => {
    const ergebnis = await crewLauf({ ...optionen, ziel: aufgabe.auftrag })
    const antwort = ergebnis.lauf.ergebnisse
      .map((eintrag) => eintrag.ergebnis)
      .join('\n\n')
    const { hinein, heraus } = ergebnis.lauf.tokens
    return { antwort, usd: (hinein / 1000) * preis.hinein + (heraus / 1000) * preis.heraus }
  }
}

/**
 * Der Richter, der eine Antwort gegen den Rubric bewertet.
 *
 * **Warum ein eigenes Modell und nicht der Rat selbst.** Ein Rat, der seine eigene Arbeit bewertet,
 * belohnt sich. Der Richter sieht Aufgabe, Rubric und Antwort — er hat den Entwurf nicht
 * geschrieben.
 *
 * @param anbieter - der Anbieter
 * @param modell - das Modell
 * @param preis - der Preis je 1 000 Token
 * @returns die Bewertungsfunktion
 */
export function bewerteMitRichter(anbieter: LlmProvider, modell: string, preis: Preis): Bewerte {
  return async (aufgabe: EvalAufgabe, antwort: string) => {
    const auftrag = [
      `Aufgabe: ${aufgabe.auftrag}`,
      `Rubric: ${aufgabe.rubric}`,
      `Antwort:\n${antwort}`,
      'Erfüllt die Antwort den Rubric? Antworte ausschließlich mit JSON: '
        + '{"pass":true|false,"begruendung":"ein Satz"}',
    ].join('\n\n')
    const ergebnis = await anbieter.complete({
      model: modell,
      temperature: 0,
      messages: [textMessage('user', auftrag)],
    })
    void kosten(ergebnis.usage, preis)
    const roh = ergebnis.text.trim()
    const treffer = /\{[\s\S]*\}/u.exec(roh)
    if (treffer === null) {
      // **Kein JSON heißt nicht bestanden.** Sonst wird eine kaputte Bewertung zur Zustimmung.
      return { pass: false, begruendung: 'Richter lieferte kein JSON' }
    }
    try {
      const gelesen = JSON.parse(treffer[0]) as Record<string, unknown>
      return {
        pass: gelesen['pass'] === true,
        begruendung: typeof gelesen['begruendung'] === 'string' ? gelesen['begruendung'] : '',
      }
    } catch {
      return { pass: false, begruendung: 'Richter-JSON war unlesbar' }
    }
  }
}
