/**
 * Verbrauch, Kosten und Grenzen — die Formen, an denen alles andere hängt.
 *
 * ## Die Lücke, die dieses Paket füllt
 *
 * Prometheus zählt Token (`packages/llm/token-meter`) und kennt Preise
 * (`packages/ai/tariffs`) — aber es gibt **keine Multiplikation**. Gemessen am 18.10.2026:
 * `tokenMeter` kommt in 45 Stellen unter `packages/` vor, in `ai/tariffs`, `ai/ranking` und
 * `api/ai-ranking` **keinmal**. Ein Geldbudget gab es nicht; `budget` hieß bis hierher
 * **Input-Token-Budget**.
 *
 * ## Warum der Nutzer Teil des Datensatzes ist
 *
 * Der DeepSeek-Harness schreibt seinen Verbrauch in **eine** Datei je Rechner
 * (`$DSH_HOME/usage-budget/usage.json`) und ordnet ihn über den **Namen** der Credential-Ref zu.
 * Bei zwei Menschen an einer Maschine ist damit „wer hat das ausgegeben" nicht beantwortbar, und
 * ein Budget wäre ein gemeinsames. Hier steht `nutzer` im Datensatz **und** im Pfad — ein fremder
 * Verbrauch ist strukturell unerreichbar, nicht durch einen Filter.
 *
 * ## Warum „unbekannter Preis" eine eigene Aussage bleibt
 *
 * Ein Aufruf ohne bekannten Tarif kostet **nicht** null. Er hat einen Preis, den niemand kennt.
 * Die Zeile trägt deshalb `kosten: undefined` **und** `kostenart: 'unbekannt'` — und jede Summe
 * nennt zusätzlich, wie viele Zeilen unbepreist waren. Wer das als `0` führt, meldet einen
 * Verbrauch von null für Arbeit, die Geld gekostet hat.
 *
 * @module @prometheus-harness/usage-budget/types
 */

import type { Kostenart } from '@prometheus-harness/tariffs'

/**
 * Woher die Token-Zahl stammt.
 *
 * Dieselbe Unterscheidung wie in `token-meter` (`UsageMethod`): eine **gemeldete** Zahl ist eine
 * Messung, eine **geschätzte** eine Rechnung. Ein Kostenbetrag aus einer Schätzung ist damit
 * ebenfalls eine Schätzung — und nicht mehr.
 */
export type Herkunft = 'gemessen' | 'geschaetzt' | 'gemischt'

/** Wofür ein Aufruf verbraucht wurde. */
export type Zweck = 'chat' | 'verdichtung' | 'titel' | 'crew' | 'sonstiges'

/** Ein Verbrauch: **ein** Modellaufruf, einem Nutzer und einem Schlüssel zugeordnet. */
export interface Verbrauch {
  /** Wann der Aufruf endete (ISO 8601). */
  zeit: string
  /** Der Nutzer, dessen Geld verbraucht wurde. */
  nutzer: string
  /**
   * Der **Name** der Credential-Ref (`DEEPSEEK_API_KEY`) — nie der Schlüsselwert.
   *
   * Das ist die Zuordnung, die der Harness ebenfalls wählt (`usage.js:97-135`), und sie hat einen
   * Grund: der Schlüssel wird erst beim Versand aufgelöst, der Aufruf führt ihn nicht mit.
   */
  schluessel: string
  /** Die Familie der Route (`deepseek-official`, `openrouter`). */
  familie: string
  /** Die Modellkennung, wie die Route sie nennt. */
  modell: string
  /** Token hinein (`inputTokens`). */
  hinein: number
  /** Token heraus (`outputTokens`). */
  heraus: number
  /** Aus dem Zwischenspeicher gelesene Token, wenn der Anbieter sie meldet. */
  cacheGelesen?: number
  /** In den Zwischenspeicher geschriebene Token, wenn der Anbieter sie meldet. */
  cacheGeschrieben?: number
  /** Woher die Token-Zahl stammt. */
  herkunft: Herkunft
  /** Wofür der Aufruf war; fehlt bei gewöhnlichen Chat-Aufrufen. */
  zweck?: Zweck
}

/** Ein Verbrauch **nach** der Preisrechnung. */
export interface Kostenzeile extends Verbrauch {
  /** Die Kosten in USD. Fehlt, wenn kein Tarif bekannt ist — dann ist sie **nicht** null. */
  kosten?: number
  /** Wie das Modell abgerechnet wird (`kostenlos`/`freibetrag`/`kostenpflichtig`/`unbekannt`). */
  kostenart: Kostenart
  /** Der Stand des benutzten Tarifs — ein Preis ohne Datum altert nie. */
  tarifStand?: string
}

/** Eine Grenze für einen Schlüssel oder ein Modell. */
export interface Schwelle {
  /** Die Grenze in USD; fehlt sie, gibt es keine Grenze. */
  limitUsd?: number
  /** Die Warnschwelle in Prozent; fehlt sie, gilt die des Budgets. */
  warnProzent?: number
}

/** Das Budget eines Nutzers. */
export interface Budget {
  /** Die Gesamtgrenze in USD; fehlt sie, gibt es keine. */
  gesamtUsd?: number
  /** Die Warnschwelle in Prozent (Vorgabe 80). */
  warnProzent: number
  /** Grenzen je Schlüsselname. */
  schluessel: Readonly<Record<string, Schwelle>>
  /** Grenzen je `familie/modell` **und** je Modellname. */
  modelle: Readonly<Record<string, Schwelle>>
}

/** Das Budget, mit dem ein Nutzer anfängt: keine Grenze, Warnung bei 80 Prozent. */
export const STANDARDBUDGET: Budget = { warnProzent: 80, schluessel: {}, modelle: {} }

/** Ein Guthaben, wie es ein Anbieter meldet. */
export interface Saldo {
  /** Der Schlüsselname, zu dem das Guthaben gehört. */
  schluessel: string
  /** Das Guthaben in USD; fehlt, wenn der Anbieter keins nennt. */
  guthabenUsd?: number
  /** Wann es abgefragt wurde (ISO 8601). */
  stand: string
  /** Warum kein Guthaben vorliegt — **nie** stillschweigend. */
  fehler?: string
}

/**
 * Warum eine Schwelle meldet.
 *
 * `ueberschritten` heißt: die Kosten liegen über der Grenze. `warnschwelle` heißt: die Grenze ist
 * noch nicht erreicht, aber der Anteil liegt über der Warnschwelle. `keine` heißt: beides nicht.
 */
export type Warnung = 'ueberschritten' | 'warnschwelle' | 'keine'

/** Der Stand eines Postens (Gesamt, ein Schlüssel, ein Modell). */
export interface Postenstand {
  /** Der Name des Postens (`gesamt`, der Schlüsselname oder `familie/modell`). */
  name: string
  /** Die bekannten Kosten in USD. */
  kostenUsd: number
  /** Wie viele Aufrufe zu diesem Posten gehören. */
  anfragen: number
  /** Wie viele dieser Aufrufe **keinen** bekannten Preis hatten. */
  unbepreist: number
  /** Die Grenze, wenn es eine gibt. */
  limitUsd?: number
  /** Der verbrauchte Anteil der Grenze in Prozent, wenn es eine gibt. */
  prozent?: number
  /** Die Meldung zu diesem Posten. */
  warnung: Warnung
}

/** Der Stand eines ganzen Budgets. */
export interface Budgetstand {
  /** Der Posten „alles zusammen". */
  gesamt: Postenstand
  /** Ein Posten je Schlüssel. */
  schluessel: Postenstand[]
  /** Ein Posten je Modell. */
  modelle: Postenstand[]
}

/** Eine Tagesreihe für eine Anzeige. */
export interface Tagesreihe {
  /** Der Tag (`2026-10-18`). */
  tag: string
  /** Die bekannten Kosten dieses Tages. */
  kostenUsd: number
  /** Die Anfragen dieses Tages. */
  anfragen: number
}

/** Die Zusammenfassung eines Zeitraums. */
export interface Zusammenfassung {
  /** Die bekannten Kosten in USD. */
  kostenUsd: number
  /** Die Anfragen. */
  anfragen: number
  /** Die Token. */
  token: { hinein: number; heraus: number }
  /** Der Anteil der Aufrufe ohne bekannten Preis, in Prozent (gerundet). */
  unbepreistProzent: number
  /** Die Posten je Schlüssel, nach Kosten absteigend. */
  jeSchluessel: { schluessel: string; kostenUsd: number; anfragen: number; unbepreist: number }[]
  /** Die Posten je Modell, nach Kosten absteigend. */
  jeModell: { familie: string; modell: string; kostenUsd: number; anfragen: number; unbepreist: number }[]
  /** Die Tagesreihe, nach Tag aufsteigend. */
  jeTag: Tagesreihe[]
}
