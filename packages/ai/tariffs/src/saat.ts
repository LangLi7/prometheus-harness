/**
 * Die Saat — die eingetragenen Preise, jeder mit Datum und Fundstelle.
 *
 * ## Warum überhaupt eine Tabelle, wo es doch eine Models-API gibt
 *
 * Weil die Liste auch dann etwas sagen soll, wenn niemand messen kann: ohne Netz, ohne Schlüssel,
 * beim ersten Start. Die Tabelle ist der **Anfangswert**, nicht das Ziel — sobald eine Models-API
 * einen Preis nennt, schlägt sie die Tabelle ({@link verschmelze}).
 *
 * ## Was hier NICHT steht, und warum das die wichtigere Hälfte ist
 *
 * **Kein Gratis-Tarif ist eingetragen.** Kein einziger. Nicht, weil es keine gäbe — sondern weil
 * **keiner gemessen** ist. Eine Liste, die einen Freibetrag behauptet, den niemand geprüft hat,
 * schickt den Betreiber in eine Grenze hinein, die er erst beim Überschreiten bemerkt.
 *
 * Wo ein Freibetrag **gemessen** wird, entsteht er als Eintrag mit `freibetrag` und Beleg. Bis
 * dahin gilt: unbekannt ist unbekannt.
 *
 * ## Die Zahlen, und woher sie kommen
 *
 * Alle Preise unten sind am **15.10.2026** über die Einzelabfrage
 * `GET /api/v1/models/<kennung>/endpoints` gemessen und stehen im Wortlaut in
 * `packages/ai/openrouter/src/index.ts`. Sie sind **nicht** neu gemessen worden — dieses Paket
 * erfindet keine Zahl und schreibt keine um.
 *
 * @module @prometheus-harness/tariffs/saat
 */

import { PREIS_UNBEKANNT, type Preis } from './preis.ts'
import type { Tarifeintrag } from './tarif.ts'

/** Der Tag, an dem die Zahlen dieses Pakets gemessen wurden. */
export const SAAT_STAND = '2026-10-15'

/** Die Fundstelle der eingetragenen Preise — eine Stelle, damit sie nachprüfbar bleibt. */
export const SAAT_QUELLE =
  'gemessen am 15.10.2026 über GET /api/v1/models/<kennung>/endpoints; ' +
  'im Wortlaut in packages/ai/openrouter/src/index.ts'

/** Baut einen Eintrag der Saat — damit kein Feld vergessen wird. */
function eintrag(modell: string, preis: Preis): Tarifeintrag {
  return {
    familie: 'openrouter',
    modell,
    preis,
    stand: SAAT_STAND,
    quelle: SAAT_QUELLE,
    herkunft: 'tabelle',
  }
}

/**
 * Die eingetragenen Tarife.
 *
 * Die Reihenfolge ist die der Fundstelle und hat keine Bedeutung; sortiert wird in
 * {@link verschmelze}.
 */
export const SAAT: readonly Tarifeintrag[] = [
  // --- Entscheiden -----------------------------------------------------------
  eintrag('openai/gpt-oss-20b', { hinein: 0.02, heraus: 0.09 }),
  eintrag('inclusionai/ling-3.0-flash', { hinein: 0.02, heraus: 0.06 }),
  eintrag('google/gemini-3.8-flash', { hinein: 0.75, heraus: 3.75 }),
  // --- Text zu Sprache ------------------------------------------------------
  // **Der teuerste Posten der ganzen Tabelle.** 9,00 USD je 1 Mio heraus — und bei Sprache ist
  // „heraus" der Ton. Wer eine lange Antwort vorlesen lässt, merkt das.
  eintrag('google/gemini-3.8-flash-tts', { hinein: 0.5, heraus: 9 }),
  // --- Sprache zu Text ------------------------------------------------------
  eintrag('google/gemini-3.5-transcribe', { hinein: 2, heraus: 12 }),
  // --- Einbetten ------------------------------------------------------------
  // Der einzige Eintrag mit einer Null: heraus wird nichts abgerechnet, weil eine Einbettung
  // keine Antwort im Sinne eines Textes hat. Die **Summe** ist damit trotzdem größer als null —
  // `kostenlos` ist das Modell also nicht.
  eintrag('google/gemini-embedding-2', { hinein: 0.2, heraus: 0 }),
  // --- Ausdrücklich unbekannt ------------------------------------------------
  // Gemessen: `GET /api/v1/models` nennt den Preis `-1`, und die Einzelabfrage nennt **gar
  // keinen**. Der Eintrag steht hier, damit die Liste zeigen kann, **daß** jemand nachgesehen hat
  // — ein fehlender Eintrag wäre von „nie geprüft" nicht zu unterscheiden.
  {
    familie: 'openrouter',
    modell: 'typesafe/jev-router',
    preis: PREIS_UNBEKANNT,
    stand: SAAT_STAND,
    quelle: 'gemessen am 15.10.2026: Preis -1 über GET /api/v1/models, kein Preis über die Einzelabfrage',
    herkunft: 'tabelle',
  },
]

/**
 * Die Familien, über die **nichts** eingetragen ist.
 *
 * **Warum das eine eigene Liste ist und keine Leerstelle.** `provider-directory` kennt sieben
 * Familien; in {@link SAAT} steht nur eine davon. Wer nur die Tabelle liest, könnte schließen, die
 * anderen seien gratis. Diese Liste sagt das Gegenteil: über sie ist **nichts** bekannt, und die
 * Rangliste muß sie als `unbekannt` führen.
 */
export const OHNE_PREIS: readonly string[] = ['deepseek', 'anthropic', 'zai', 'zenmux', 'nous', 'opencode']
