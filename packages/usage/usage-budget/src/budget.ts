/**
 * Grenzen, Warnschwellen und die Zusammenfassung für eine Anzeige.
 *
 * ## Warum die Grenze eine Grenze bleibt und nicht blockiert
 *
 * Der DeepSeek-Harness hatte dafür einen Schalter (`blockOnExhausted`) und eine Prüfung
 * (`budgetCheck`) — **die nie aufgerufen wurde** (`index.js:729-749`, gemessen: keine Aufrufstelle).
 * Ein Schalter, der nichts schaltet, ist schlimmer als keiner: er verspricht eine Sperre, die es
 * nicht gibt. Dieses Paket **meldet** deshalb — `ueberschritten` oder `warnschwelle` — und
 * blockiert nichts. Wer sperren will, entscheidet es an der Naht und sagt es dort.
 *
 * ## Warum die Warnschwelle je Posten überschreibbar ist
 *
 * Ein Schlüssel mit kleinem Limit braucht eine andere Warnung als das Gesamtbudget: 80 Prozent von
 * 5 USD ist ein anderer Betrag als 80 Prozent von 500. Die Schwelle steht deshalb **je Posten**,
 * und das Budget liefert nur die Vorgabe.
 *
 * @module @prometheus-harness/usage-budget/budget
 */

import { summe as summeZeilen } from './price.ts'
import type {
  Budget,
  Budgetstand,
  Kostenzeile,
  Postenstand,
  Schwelle,
  Tagesreihe,
  Warnung,
  Zusammenfassung,
} from './types.ts'

/** Ein Tag in Millisekunden — die Einheit, in der ein Zeitfenster rechnet. */
export const TAG_MS = 86_400_000

/**
 * Bestimmt die Meldung eines Postens.
 *
 * @param kostenUsd - die bekannten Kosten
 * @param limitUsd - die Grenze, falls es eine gibt
 * @param warnProzent - die Warnschwelle in Prozent
 * @returns die Meldung
 */
export function warnungFuer(kostenUsd: number, limitUsd: number | undefined, warnProzent: number): Warnung {
  if (limitUsd === undefined || limitUsd <= 0) return 'keine'
  const prozent = (kostenUsd / limitUsd) * 100
  if (prozent >= 100) return 'ueberschritten'
  if (prozent >= warnProzent) return 'warnschwelle'
  return 'keine'
}

/**
 * Baut den Stand eines Postens.
 *
 * @param name - der Name des Postens
 * @param zeilen - die Zeilen dieses Postens
 * @param schwelle - die Grenze, falls es eine gibt
 * @param warnProzent - die Warnschwelle in Prozent
 * @returns der Stand
 */
function posten(name: string, zeilen: readonly Kostenzeile[], schwelle: Schwelle | undefined, warnProzent: number): Postenstand {
  const gesamt = summeZeilen(zeilen)
  const limitUsd = schwelle?.limitUsd
  const wirksam = schwelle?.warnProzent ?? warnProzent
  const stand: Postenstand = {
    name,
    kostenUsd: gesamt.kostenUsd,
    anfragen: zeilen.length,
    unbepreist: gesamt.unbepreist,
    warnung: warnungFuer(gesamt.kostenUsd, limitUsd, wirksam),
  }
  if (limitUsd !== undefined) {
    stand.limitUsd = limitUsd
    stand.prozent = Math.round((gesamt.kostenUsd / limitUsd) * 1000) / 10
  }
  return stand
}

/**
 * Schneidet ein Zeitfenster aus den Zeilen.
 *
 * @param zeilen - die Kostenzeilen
 * @param feld - wie viele Tage rückwärts und welcher Zeitpunkt „jetzt" ist
 * @returns die Zeilen im Fenster, in der Reihenfolge der Eingabe
 */
export function zeitfenster(zeilen: readonly Kostenzeile[], feld: { tage: number; jetzt: Date }): Kostenzeile[] {
  if (!Number.isFinite(feld.tage) || feld.tage < 0) {
    throw new Error(`Tage muessen eine Zahl >= 0 sein, war ${String(feld.tage)}`)
  }
  const grenze = feld.jetzt.getTime() - feld.tage * TAG_MS
  return zeilen.filter((zeile) => {
    const zeit = Date.parse(zeile.zeit)
    return Number.isFinite(zeit) && zeit >= grenze
  })
}

/**
 * Rechnet den Stand eines Budgets.
 *
 * @param zeilen - die Kostenzeilen
 * @param budget - das Budget (Vorgabe: keine Grenzen, Warnung bei 80 Prozent)
 * @returns der Stand für Gesamt, je Schlüssel und je Modell
 */
export function budgetstand(zeilen: readonly Kostenzeile[], budget: Budget): Budgetstand {
  const jeSchluessel = new Map<string, Kostenzeile[]>()
  const jeModell = new Map<string, Kostenzeile[]>()
  for (const zeile of zeilen) {
    const schluessel = jeSchluessel.get(zeile.schluessel) ?? []
    schluessel.push(zeile)
    jeSchluessel.set(zeile.schluessel, schluessel)
    const kennung = `${zeile.familie}/${zeile.modell}`
    const modell = jeModell.get(kennung) ?? []
    modell.push(zeile)
    jeModell.set(kennung, modell)
  }

  const schluessel: Postenstand[] = []
  for (const [name, liste] of jeSchluessel) {
    schluessel.push(posten(name, liste, budget.schluessel[name], budget.warnProzent))
  }
  const modelle: Postenstand[] = []
  for (const [kennung, liste] of jeModell) {
    const erste = liste[0]
    const kurz = erste === undefined ? kennung : erste.modell
    const schwelle = budget.modelle[kennung] ?? budget.modelle[kurz]
    modelle.push(posten(kennung, liste, schwelle, budget.warnProzent))
  }

  const gesamtSchwelle: Schwelle = budget.gesamtUsd === undefined ? {} : { limitUsd: budget.gesamtUsd }
  return {
    gesamt: posten('gesamt', zeilen, gesamtSchwelle, budget.warnProzent),
    schluessel: schluessel.sort((a, b) => b.kostenUsd - a.kostenUsd),
    modelle: modelle.sort((a, b) => b.kostenUsd - a.kostenUsd),
  }
}

/**
 * Fasst einen Zeitraum für eine Anzeige zusammen.
 *
 * @param zeilen - die Kostenzeilen
 * @returns Kosten, Anfragen, Token, Anteil unbepreister Aufrufe und die Aufteilungen
 */
export function zusammenfassung(zeilen: readonly Kostenzeile[]): Zusammenfassung {
  let hinein = 0
  let heraus = 0
  const jeSchluessel = new Map<string, { kostenUsd: number; anfragen: number; unbepreist: number }>()
  const jeModell = new Map<string, { familie: string; modell: string; kostenUsd: number; anfragen: number; unbepreist: number }>()
  const jeTag = new Map<string, { kostenUsd: number; anfragen: number }>()

  for (const zeile of zeilen) {
    hinein += zeile.hinein + (zeile.cacheGelesen ?? 0) + (zeile.cacheGeschrieben ?? 0)
    heraus += zeile.heraus
    const unbepreist = zeile.kosten === undefined ? 1 : 0
    const kostenUsd = zeile.kosten ?? 0

    const s = jeSchluessel.get(zeile.schluessel) ?? { kostenUsd: 0, anfragen: 0, unbepreist: 0 }
    s.kostenUsd += kostenUsd
    s.anfragen += 1
    s.unbepreist += unbepreist
    jeSchluessel.set(zeile.schluessel, s)

    const mKennung = `${zeile.familie}/${zeile.modell}`
    const m = jeModell.get(mKennung) ?? { familie: zeile.familie, modell: zeile.modell, kostenUsd: 0, anfragen: 0, unbepreist: 0 }
    m.kostenUsd += kostenUsd
    m.anfragen += 1
    m.unbepreist += unbepreist
    jeModell.set(mKennung, m)

    const tag = zeile.zeit.slice(0, 10)
    const t = jeTag.get(tag) ?? { kostenUsd: 0, anfragen: 0 }
    t.kostenUsd += kostenUsd
    t.anfragen += 1
    jeTag.set(tag, t)
  }

  const gesamt = summeZeilen(zeilen)
  const jeTagListe: Tagesreihe[] = [...jeTag.entries()]
    .map(([tag, wert]) => ({ tag, kostenUsd: Math.round(wert.kostenUsd * 1e8) / 1e8, anfragen: wert.anfragen }))
    .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))

  return {
    kostenUsd: gesamt.kostenUsd,
    anfragen: zeilen.length,
    token: { hinein, heraus },
    unbepreistProzent: zeilen.length === 0 ? 0 : Math.round((gesamt.unbepreist / zeilen.length) * 1000) / 10,
    jeSchluessel: [...jeSchluessel.entries()]
      .map(([schluessel, wert]) => ({ schluessel, ...wert, kostenUsd: Math.round(wert.kostenUsd * 1e8) / 1e8 }))
      .sort((a, b) => b.kostenUsd - a.kostenUsd),
    jeModell: [...jeModell.values()]
      .map((wert) => ({ ...wert, kostenUsd: Math.round(wert.kostenUsd * 1e8) / 1e8 }))
      .sort((a, b) => b.kostenUsd - a.kostenUsd),
    jeTag: jeTagListe,
  }
}
