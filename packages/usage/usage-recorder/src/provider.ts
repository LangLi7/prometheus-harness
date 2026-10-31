/**
 * Der messende Anbieter — der Haken, ohne den Kern anzufassen.
 *
 * ## Warum eine Hülle und kein Umbau
 *
 * Der Seam von Prometheus ist kleiner als der des Harness: **eine** Methode,
 * `complete(request) → CompletionResult`, und die Antwort trägt ihre Token (`usage`). Es gibt keinen
 * Waterfall und keine Streaming-Chunks — also braucht die Abrechnung auch keinen Eingriff in den
 * Kern: ein Anbieter, der einen anderen Anbieter **umhüllt**, ruft ihn, liest die Token und bucht.
 * Das ist Komposition, nicht Umbau — der Kern bleibt unberührt, und die Hülle ist ohne Host, ohne
 * Netz und ohne Modell prüfbar.
 *
 * ## Warum ein Abrechnungsfehler die Antwort nicht verhindert
 *
 * Die Antwort ist das Ergebnis, die Buchung ist das Protokoll. Wenn das Protokoll scheitert (Platte
 * voll, Rechte, kaputte Datei), darf der Benutzer trotzdem seine Antwort bekommen — aber niemand
 * darf es verschweigen. Deshalb geht jeder Fehler an `melde`, und `complete` liefert weiter.
 *
 * ## Warum der Nutzer hereingereicht wird
 *
 * `CompletionRequest` trägt **keinen** Nutzer. Wer die Hülle baut, kennt ihn (aus der Sitzung) —
 * und genau diese Kenntnis ist die Voraussetzung, nicht die Antwort. Eine Hülle, die sich den
 * Nutzer selbst sucht, würde raten.
 *
 * @module @prometheus-harness/usage-recorder/provider
 */

import type { CompletionRequest, CompletionResult, LlmProvider } from '@prometheus-harness/llm'
import type { Zweck } from '@prometheus-harness/usage-budget'

import { Aufzeichner } from './recorder.ts'
import type { Zaehlungsart } from './record.ts'

/** Wie die messende Hülle gebaut wird. */
export interface MessendeOptionen {
  /** Der Aufzeichner, der bucht (Kasse und Konto). */
  aufzeichner: Aufzeichner
  /** Der Nutzer, dessen Konto belastet wird. */
  nutzer: string
  /**
   * Die Route, unter der der Verbrauch erscheint.
   *
   * Ohne Angabe der **Name des umhüllten Anbieters** — das ist die ehrlichste Zuordnung: der
   * Anbieter, der geantwortet hat. Wer eine andere Route führen will (etwa `crew`, weil die Hülle
   * eine Crew ist), gibt sie hier an.
   */
  familie?: string
  /** Ein ausdrücklicher Schlüsselname; sonst aus der Route bestimmt. */
  schluessel?: string
  /** Wie die Token-Zahl zustande kam; Vorgabe `reported`. */
  zaehlung?: Zaehlungsart
  /** Wofür die Aufrufe sind; Vorgabe: keiner. */
  zweck?: Zweck
  /**
   * Wird bei einem Buchungsfehler gerufen.
   *
   * **Warum kein stilles `catch`.** Ein verschluckter Abrechnungsfehler bedeutet: die Anzeige
   * meldet Kosten, die niemand gebucht hat — und niemand weiß es.
   */
  melde?: (fehler: unknown) => void
}

/**
 * Umhüllt einen Anbieter so, daß jeder Aufruf mit Token gebucht wird.
 *
 * @param anbieter - der umhüllte Anbieter
 * @param optionen - Aufzeichner, Nutzer und Zuordnung
 * @returns ein Anbieter mit demselben Vertrag
 */
export function messenderAnbieter(anbieter: LlmProvider, optionen: MessendeOptionen): LlmProvider {
  if (optionen.nutzer.trim() === '') {
    throw new Error('ein messender Anbieter ohne Nutzer wuerde fremde Kosten buchen')
  }
  const familie = optionen.familie ?? anbieter.name
  const melde = optionen.melde ?? (() => {})

  return {
    name: `${anbieter.name}+messend`,
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const antwort = await anbieter.complete(request)
      const verbrauch = antwort.usage
      if (verbrauch === undefined) {
        // Kein `usage` heißt: der Anbieter meldet die Token nicht. **Keine** Buchung aus einer
        // erfundenen Zahl — die Lücke ist sichtbar, nicht zugedeckt.
        melde(new Error(`${anbieter.name}: die Antwort trug keine Token — nicht gebucht`))
        return antwort
      }
      try {
        await optionen.aufzeichner.verbuchen({
          nutzer: optionen.nutzer,
          familie,
          modell: antwort.model === '' ? request.model : antwort.model,
          tokens: { inputTokens: verbrauch.inputTokens, outputTokens: verbrauch.outputTokens },
          ...(optionen.zaehlung === undefined ? {} : { zaehlung: optionen.zaehlung }),
          ...(optionen.zweck === undefined ? {} : { zweck: optionen.zweck }),
          ...(optionen.schluessel === undefined ? {} : { schluessel: optionen.schluessel }),
        })
      } catch (fehler) {
        melde(fehler)
      }
      return antwort
    },
  }
}
