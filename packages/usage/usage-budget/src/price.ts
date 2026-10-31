/**
 * Token × Tarif — die Rechnung, die bis hierher fehlte.
 *
 * ## Drei Fälle, die auseinandergehalten werden müssen
 *
 * | Fall | Ergebnis | Warum |
 * |---|---|---|
 * | kein Tarif eingetragen | `kostenart: 'unbekannt'`, **keine** Kosten | Ein Preis, den niemand kennt, ist nicht null |
 * | Tarif mit unbekanntem Preis (`-1`) | `kostenart: 'unbekannt'`, **keine** Kosten | Dieselbe Aussage, anderer Weg dorthin |
 * | Tarif mit Preis | Kosten **und** `kostenart` (`kostenlos`/`freibetrag`/`kostenpflichtig`) | Eine Null ist eine Aussage, ein Fehlen nicht |
 *
 * ## Warum die Cache-Token zum Hinein-Preis gerechnet werden — und was daran falsch ist
 *
 * Die Tarife dieses Projekts kennen **zwei** Preise: hinein und heraus (`packages/ai/tariffs`).
 * Der DeepSeek-Harness preist gelesene und geschriebene Zwischenspeicher-Token dagegen
 * **getrennt** (`pricing.js:249-267`) — er hat dafür vier Beträge. Solange die Preise hier nur zwei
 * kennen, werden Zwischenspeicher-Token dem **Hinein**-Preis zugeschlagen. Das ist bei
 * Zwischenspeicher-Lesen zu hoch angesetzt; die Zahl steht deshalb hier und nicht im Ergebnis als
 * Nebensatz: **der Betrag ist eine Obergrenze.** Wer genauer rechnen will, trägt Cache-Preise in
 * `tariffs` ein — dann fällt der Zuschlag hier weg, statt still falsch zu bleiben.
 *
 * @module @prometheus-harness/usage-budget/price
 */

import { kostenartFuer, preisBekannt, tarifFuer, type Kostenart, type Tarifeintrag } from '@prometheus-harness/tariffs'

import type { Kostenzeile, Verbrauch } from './types.ts'

/** Was die Preisrechnung zu einem Aufruf sagt. */
export interface Preisauskunft {
  /** Die Kosten in USD; fehlt, wenn kein bekannter Tarif vorliegt. */
  kosten?: number
  /** Wie das Modell abgerechnet wird. */
  kostenart: Kostenart
  /** Der Stand des benutzten Tarifs. */
  tarifStand?: string
  /** Ein Satz für den Bericht — ohne Geheimnisse. */
  beleg: string
}

/**
 * Rundet einen Geldbetrag auf acht Nachkommastellen.
 *
 * **Warum überhaupt gerundet wird.** `0.66 / 1_000_000 * 1_000` ergibt in IEEE-754 nicht zwingend
 * `0.00066`, sondern je nach Bitmuster `0.0006599999999999999`. Ein solcher Wert summiert sich
 * über zehntausend Aufrufe zu einem Cent-Betrag, den niemand zuordnen kann. Acht Stellen USD sind
 * für Token-Abrechnung reichlich.
 *
 * @param betrag - der ungerundete Betrag
 * @returns der gerundete Betrag
 */
export function aufCent(betrag: number): number {
  return Math.round(betrag * 1e8) / 1e8
}

/**
 * Preist einen Aufruf.
 *
 * @param tarife - die Tarife (Tabelle, gemessen oder verschmolzen)
 * @param verbrauch - der Aufruf
 * @returns Kosten und Kostenart; ohne bekannten Tarif **keine** Kosten
 */
export function preiseAufruf(tarife: readonly Tarifeintrag[], verbrauch: Verbrauch): Preisauskunft {
  const eintrag = tarifFuer(tarife, verbrauch.familie, verbrauch.modell)
  if (eintrag === undefined) {
    return {
      kostenart: 'unbekannt',
      beleg: `kein Tarif fuer ${verbrauch.familie}/${verbrauch.modell}`,
    }
  }
  if (!preisBekannt(eintrag.preis)) {
    return {
      kostenart: 'unbekannt',
      tarifStand: eintrag.stand,
      beleg:
        `Tarif vom ${eintrag.stand} nennt keinen Preis (${eintrag.quelle}) — die Kosten sind `
        + 'unbekannt, nicht null',
    }
  }
  const zwischen = (verbrauch.cacheGelesen ?? 0) + (verbrauch.cacheGeschrieben ?? 0)
  const hinein = verbrauch.hinein + zwischen
  const kosten = aufCent(
    (hinein * eintrag.preis.hinein) / 1_000_000 + (verbrauch.heraus * eintrag.preis.heraus) / 1_000_000,
  )
  return {
    kosten,
    kostenart: kostenartFuer(eintrag),
    tarifStand: eintrag.stand,
    beleg: `Tarif vom ${eintrag.stand}: ${String(eintrag.preis.hinein)} / ${String(eintrag.preis.heraus)} USD je 1 Mio Token`,
  }
}

/**
 * Macht aus einem Aufruf eine Kostenzeile.
 *
 * @param tarife - die Tarife
 * @param verbrauch - der Aufruf
 * @returns die Zeile mit Kosten und Kostenart
 */
export function zuKostenzeile(tarife: readonly Tarifeintrag[], verbrauch: Verbrauch): Kostenzeile {
  const auskunft = preiseAufruf(tarife, verbrauch)
  const zeile: Kostenzeile = { ...verbrauch, kostenart: auskunft.kostenart }
  if (auskunft.kosten !== undefined) zeile.kosten = auskunft.kosten
  if (auskunft.tarifStand !== undefined) zeile.tarifStand = auskunft.tarifStand
  return zeile
}

/**
 * Läuft eine ganze Liste durch die Preisrechnung.
 *
 * @param tarife - die Tarife
 * @param verbraeuche - die Aufrufe
 * @returns die Kostenzeilen
 */
export function preiseAlle(tarife: readonly Tarifeintrag[], verbraeuche: readonly Verbrauch[]): Kostenzeile[] {
  return verbraeuche.map((verbrauch) => zuKostenzeile(tarife, verbrauch))
}

/**
 * Zählt bekannte Kosten und unbepreiste Aufrufe einer Liste.
 *
 * @param zeilen - die Kostenzeilen
 * @returns die Summe der bekannten Kosten und die Zahl der unbepreisten Aufrufe
 */
export function summe(zeilen: readonly Kostenzeile[]): { kostenUsd: number; unbepreist: number } {
  let kostenUsd = 0
  let unbepreist = 0
  for (const zeile of zeilen) {
    if (zeile.kosten === undefined) unbepreist += 1
    else kostenUsd += zeile.kosten
  }
  return { kostenUsd: aufCent(kostenUsd), unbepreist }
}
