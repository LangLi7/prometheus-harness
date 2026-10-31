/**
 * `@prometheus-harness/deepseek-search-tools` — Suche und Abruf über die **direkten** Endpunkte.
 *
 * ## Der Satz, um den es geht
 *
 * DeepSeek bietet Suche und Abruf als **zwei rohe Endpunkte** (`/v1/tools/search`,
 * `/v1/tools/fetch`, je 0,75 USD per 1 000 **erfolgreiche** Anfragen). Der Harness nutzt sie
 * **nicht** — er geht über `/anthropic/v1/messages` mit dem Server-Werkzeug `web_search_20250305`,
 * und genau dieser serverseitige Weg ist bis **2026-10-31 16:00 UTC** kostenfrei. Ein Wechsel auf
 * die direkten Endpunkte ist damit **sofort kostenpflichtig**. Dieses Paket macht den Preis sichtbar
 * (`kostenUsd`, `abrechenbar` in jedem Ergebnis) statt ihn zu verstecken.
 *
 * ## Was es liefert
 *
 * - `suche(...)` und `abruf(...)` — Anfrage bauen, Antwort lesen, Abrechenbarkeit bestimmen.
 * - `kostenFuer(n)` — die Kosten einer Anzahl erfolgreicher Anfragen.
 * - `suchWerkzeuge(...)` — `tools_search` und `tools_fetch` als `AgentTool` für den Loop.
 * - `SERVER_TOOL_FREI_BIS` — das Datum, an dem der **bestehende** Weg nicht mehr kostenfrei ist.
 *
 * ## Was es ausdrücklich nicht tut
 *
 * Kein Netz (`hole` wird gereicht), kein Schlüssel im Log (`entschaerfe`), keine Wiederholung
 * (QPS 5/s je Konto — ein Wiederholer müsste drosseln, nicht hämmern), und **keine** Entscheidung
 * über den Anbieterwechsel: die steht beim Betreiber.
 *
 * @module @prometheus-harness/deepseek-search-tools
 */

export {
  BASIS,
  PREIS_JE_ANFRAGE_USD,
  SERVER_TOOL_FREI_BIS,
  Suchfehler,
  WEG_ABRUF,
  WEG_SUCHE,
  abruf,
  entschaerfe,
  kostenFuer,
  netzHole,
  suche,
  type Abrufergebnis,
  type Hole,
  type Suchkosten,
  type Suchergebnis,
  type Treffer,
} from './client.ts'

export { ABRUFWERKZEUG, SUCHWERKZEUG, suchWerkzeuge, type WerkzeugOptionen } from './tools.ts'
