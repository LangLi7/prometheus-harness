/**
 * `@prometheus-harness/usage-budget` — Kosten und Budget **je Nutzer und je Schlüssel**.
 *
 * ## Die Lücke, die dieses Paket füllt
 *
 * Prometheus zählt Token (`packages/llm/token-meter`) und kennt Preise (`packages/ai/tariffs`) —
 * die **Multiplikation** fehlte. Gemessen am 18.10.2026: `tokenMeter` in 45 Stellen unter
 * `packages/`, davon **keine** in `ai/tariffs`, `ai/ranking` oder `api/ai-ranking`. Ein Geldbudget
 * gab es nicht.
 *
 * ## Drei Entscheidungen, die dieses Paket trägt
 *
 * 1. **Ein Aufruf ohne bekannten Preis kostet nicht null.** Er trägt `kosten: undefined` und
 *    `kostenart: 'unbekannt'`; jede Summe nennt zusätzlich, wie viele Aufrufe unbepreist waren.
 * 2. **Der Nutzer steht im Datensatz und im Pfad.** Der Harness teilt eine Datei je Rechner; hier
 *    hat jede Person ihre eigene — unerreichbar für die andere durch den Pfad, nicht durch einen
 *    Filter.
 * 3. **Eine Grenze meldet, sie blockiert nicht.** Der Harness-Schalter `blockOnExhausted` war nie
 *    verdrahtet; ein Schalter, der nichts schaltet, ist schlimmer als keiner.
 *
 * ## Kein Netz, keine Harness, kein Modell
 *
 * Preise kommen gereicht (`tariffs`), Token kommen gereicht (`token-meter` liefert
 * `inputTokens`/`outputTokens`), Guthaben sind eine Angabe und keine Abfrage. Damit ist jede Regel
 * hier ohne Schlüssel und ohne Verbindung prüfbar.
 *
 * @module @prometheus-harness/usage-budget
 */

export {
  STANDARDBUDGET,
  type Budget,
  type Budgetstand,
  type Herkunft,
  type Kostenzeile,
  type Postenstand,
  type Saldo,
  type Schwelle,
  type Tagesreihe,
  type Verbrauch,
  type Warnung,
  type Zusammenfassung,
  type Zweck,
} from './types.ts'

export { aufCent, preiseAlle, preiseAufruf, summe, zuKostenzeile, type Preisauskunft } from './price.ts'

export { TAG_MS, budgetstand, zusammenfassung, warnungFuer, zeitfenster } from './budget.ts'

export {
  FASSUNG,
  HOECHSTZAHL_STANDARD,
  NUTZER_MUSTER,
  Verbrauchsspeicher,
  istBrauchbar,
  type Aufnahme,
  type Speicheroptionen,
} from './store.ts'
