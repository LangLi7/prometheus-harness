/**
 * Vom Aufruf zum Datensatz — die Zuordnung, die vorher niemand traf.
 *
 * ## Warum dieses Modul so klein ist
 *
 * Es macht **eine** Sache: aus dem, was der Aufruf hergibt (Nutzer, Route, Modell, Token, Zählart),
 * einen `Verbrauch` machen. Preis und Ablage sind getrennte Schritte (`usage-budget`), weil sie
 * getrennt prüfbar sein müssen: eine falsche Preisregel ist ein Rechenfehler, eine fehlende
 * Nutzerzuordnung ein Datenschutzfehler — zwei Befunde, die man nicht in einem Test verstecken
 * sollte.
 *
 * ## Warum die Zählart mitkommen muss
 *
 * `token-meter` unterscheidet `reported`, `estimated` und `mixed`. Ein Kostenbetrag aus einer
 * **geschätzten** Token-Zahl ist eine Rechnung, keine Messung. Wer beides als „gemessen" ablegt,
 * behauptet über den Verbrauch mehr, als er weiß.
 *
 * @module @prometheus-harness/usage-recorder/record
 */

import type { Herkunft, Verbrauch, Zweck } from '@prometheus-harness/usage-budget'

import { schluesselFuerRoute } from './keys.ts'

/** Wie eine Token-Zahl zustande kam — dieselben Worte wie in `token-meter`. */
export type Zaehlungsart = 'reported' | 'estimated' | 'mixed'

/** Was der Aufruf hergibt. */
export interface Aufruf {
  /** Der Nutzer, dessen Geld verbraucht wurde. */
  nutzer: string
  /** Die Provider-Route (`deepseek-official`). */
  familie: string
  /** Die Modellkennung. */
  modell: string
  /** Die Token, wie `token-meter` sie liefert (`Usage` hat genau die ersten beiden). */
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
  /** Wie die Token-Zahl zustande kam; ohne Angabe gilt `reported`. */
  zaehlung?: Zaehlungsart
  /** Wofür der Aufruf war. */
  zweck?: Zweck
  /** Wann er endete (ISO 8601); ohne Angabe jetzt. */
  zeit?: string
  /** Ein ausdrücklich genannter Schlüsselname; sonst aus der Route bestimmt. */
  schluessel?: string
}

/**
 * Übersetzt die Zählart in die Herkunft eines Datensatzes.
 *
 * @param zaehlung - die Zählart
 * @returns die Herkunft
 */
export function herkunftAus(zaehlung: Zaehlungsart): Herkunft {
  if (zaehlung === 'estimated') return 'geschaetzt'
  if (zaehlung === 'mixed') return 'gemischt'
  return 'gemessen'
}

/**
 * Prüft, ob eine Zahl als Token-Zahl taugt.
 *
 * @param wert - der geprüfte Wert
 * @returns ob er eine nicht-negative endliche Zahl ist
 */
function zaehlbar(wert: number): boolean {
  return Number.isFinite(wert) && wert >= 0
}

/**
 * Macht aus einem Aufruf einen Verbrauch.
 *
 * @param aufruf - was der Aufruf hergibt
 * @param jetzt - die Uhr (im Test setzbar)
 * @returns der Verbrauch
 * @throws Error wenn Nutzer oder Modell fehlen oder eine Token-Zahl unbrauchbar ist
 */
export function verbuche(aufruf: Aufruf, jetzt: () => Date = () => new Date()): Verbrauch {
  if (aufruf.nutzer.trim() === '') throw new Error('ein Aufruf ohne Nutzer wird nicht verbucht')
  if (aufruf.modell.trim() === '') {
    throw new Error(`Aufruf ohne Modell (Route "${aufruf.familie}") wird nicht verbucht`)
  }
  const { inputTokens, outputTokens } = aufruf.tokens
  if (!zaehlbar(inputTokens) || !zaehlbar(outputTokens)) {
    throw new Error(
      `unbrauchbare Token-Zahlen (${String(inputTokens)}/${String(outputTokens)}) — `
        + 'eine Schaetzung ist eine Rechnung, keine Messung, aber keine Zahl ist keine',
    )
  }
  const cacheGelesen = aufruf.tokens.cacheReadTokens
  const cacheGeschrieben = aufruf.tokens.cacheWriteTokens
  if (cacheGelesen !== undefined && !zaehlbar(cacheGelesen)) throw new Error('cacheReadTokens ist unbrauchbar')
  if (cacheGeschrieben !== undefined && !zaehlbar(cacheGeschrieben)) throw new Error('cacheWriteTokens ist unbrauchbar')

  const verbrauch: Verbrauch = {
    zeit: aufruf.zeit ?? jetzt().toISOString(),
    nutzer: aufruf.nutzer,
    schluessel: aufruf.schluessel ?? schluesselFuerRoute(aufruf.familie),
    familie: aufruf.familie,
    modell: aufruf.modell,
    hinein: inputTokens,
    heraus: outputTokens,
    herkunft: herkunftAus(aufruf.zaehlung ?? 'reported'),
  }
  if (cacheGelesen !== undefined) verbrauch.cacheGelesen = cacheGelesen
  if (cacheGeschrieben !== undefined) verbrauch.cacheGeschrieben = cacheGeschrieben
  if (aufruf.zweck !== undefined) verbrauch.zweck = aufruf.zweck
  return verbrauch
}
