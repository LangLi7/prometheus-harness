/**
 * `@prometheus-harness/tariffs` — was ein Modell kostet, und **woher das bekannt ist**.
 *
 * ## Die Lücke, die dieses Paket füllt
 *
 * Gemessen am 15.10.2026 über `packages/ai`: eine Suche nach `kostenlos|gratis|free|tier|tarif|preis`
 * findet **keinen** Preis als Daten. `provider-directory` kennt die **Wege** zu sieben Familien,
 * `directory-curator` führt einen Katalog mit Meßdatum — aber **was ein Aufruf kostet, steht
 * nirgends**. Die Preise lagen bis hierher als Tabelle in einem Kommentar
 * (`packages/ai/openrouter/src/index.ts`), unerreichbar für jede Sortierung.
 *
 * Dieses Paket macht daraus Daten: einen Preis je Familie und Modell, eine **Kostenart**, die
 * ausgerechnet statt behauptet wird, und eine Verschmelzungsregel für den Fall, daß eine
 * Models-API einen frischeren Preis nennt.
 *
 * ## Kein Netzzugriff
 *
 * Dieses Paket **liest nichts**. Es rechnet mit dem, was ihm gereicht wird. Das Lesen gehört zu
 * `provider-directory` (der Sonde), das Sortieren zu `ranking`. Damit ist jede Regel hier ohne
 * Schlüssel und ohne Verbindung prüfbar.
 *
 * ## Drei Zustände, die getrennt bleiben
 *
 * `kostenlos`, `kostenpflichtig` und `unbekannt` sind **drei** Aussagen, nicht zwei. Wer
 * „unbekannt" als `0` führt, sortiert das unbekannte Modell nach vorn — und empfiehlt genau das,
 * dessen Rechnung niemand kennt.
 *
 * @module @prometheus-harness/tariffs
 */

export {
  PREIS_UNBEKANNT,
  UNBEKANNT,
  alsText,
  alsZahl,
  istBekannt,
  jeMioToken,
  preisBekannt,
  summe,
  type Preis,
} from './preis.ts'

export {
  KOSTEN_RANG,
  kostenartFuer,
  tarifFuer,
  unbekannterTarif,
  verschmelze,
  type Freibetrag,
  type Herkunft,
  type Kostenart,
  type Tarifeintrag,
  type Verschmelzung,
} from './tarif.ts'

export { OHNE_PREIS, SAAT, SAAT_QUELLE, SAAT_STAND } from './saat.ts'
