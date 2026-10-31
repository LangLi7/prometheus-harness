/**
 * `@prometheus-harness/ranking` — die bevorzugte Liste.
 *
 * Verbindet die drei Teile, die bis zum 15.10.2026 nebeneinander standen:
 *
 * ```
 *   provider-directory ─┐
 *   directory-curator ──┼──►  ranking  ──►  die bevorzugte Wahl je Fähigkeit
 *   tariffs ────────────┤                   (mit Begründung, ohne Netzzugriff)
 *   capabilities ───────┘
 * ```
 *
 * **Die Ordnung in einem Satz:** erst die Verdrahtung, dann der gemessene Befund, dann der Preis,
 * zuletzt der Name. Und ein unbekannter Preis steht **hinten**, nicht vorn.
 *
 * @module @prometheus-harness/ranking
 */

export {
  FUNKTIONS_RANG,
  GRUENDE_KURZ,
  alsListe,
  baueRangliste,
  zaehle,
  type Faehigkeitsliste,
  type Funktionsstand,
  type Rangliste,
  type Ranglisteneintrag,
  type Rangoptionen,
} from './rang.ts'
