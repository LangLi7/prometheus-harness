/**
 * Der Aufzeichner — Kasse und Konto in einem Aufruf.
 *
 * ## Warum Kasse und Konto zusammen liegen
 *
 * Buchen, ohne ablesen zu können, ist ein Protokoll ohne Frage. Ablesen, ohne zu buchen, ist eine
 * Anzeige ohne Quelle. Beides gehört in **ein** Objekt, das einen Speicher und einen Tarifstand
 * hält — damit „was hat Nutzer X diese Woche ausgegeben" dieselbe Rechnung benutzt wie das Buchen
 * und nicht eine zweite.
 *
 * ## Was der Aufzeichner ausdrücklich nicht tut
 *
 * Er **hängt sich nicht** in den Modellstrom. Das ist die Naht, und die Naht braucht den Host: den
 * Waterfall `llm/stream`, die Sitzung, aus der der Nutzer kommt, und den Schlüsselnamen der Route.
 * Dieser Aufzeichner ist die **aufrufbare** Hälfte davon — geprüft ohne Host, ohne Netz, ohne
 * Modell. Wer die Naht baut, ruft `verbuchen` je `usage`-Chunk.
 *
 * @module @prometheus-harness/usage-recorder/recorder
 */

import type { Tarifeintrag } from '@prometheus-harness/tariffs'
import {
  budgetstand,
  preiseAlle,
  preiseAufruf,
  STANDARDBUDGET,
  Verbrauchsspeicher,
  zusammenfassung,
  zeitfenster,
  type Aufnahme,
  type Budget,
  type Budgetstand,
  type Kostenzeile,
  type Zusammenfassung,
} from '@prometheus-harness/usage-budget'

import { verbuche, type Aufruf } from './record.ts'

/** Was ein Aufzeichnen ergeben hat. */
export interface Aufzeichnung {
  /** Der Datensatz mit Kosten (oder ohne, wenn der Tarif fehlt). */
  zeile: Kostenzeile
  /** Was die Ablage getan hat. */
  aufnahme: Aufnahme
}

/** Was ein Konto aussagt. */
export interface Konto {
  /** Der Stand des Budgets (Gesamt, je Schlüssel, je Modell). */
  stand: Budgetstand
  /** Die Zusammenfassung des Zeitraums. */
  uebersicht: Zusammenfassung
  /** Wie viele Datensätze im Zeitraum lagen. */
  zeilen: number
}

/** Wie der Aufzeichner gebaut wird. */
export interface AufzeichnerOptionen {
  /** Der Speicher (eine Datei je Nutzer, oder nur Arbeitsspeicher). */
  speicher: Verbrauchsspeicher
  /** Die Tarife, mit denen gerechnet wird. */
  tarife: readonly Tarifeintrag[]
  /** Die Uhr; im Test setzbar. */
  jetzt?: () => Date
}

/**
 * Zeichnet Aufrufe auf und beantwortet, was sie gekostet haben.
 */
export class Aufzeichner {
  private readonly speicher: Verbrauchsspeicher
  private readonly tarife: readonly Tarifeintrag[]
  private readonly jetzt: () => Date

  /**
   * @param optionen - Speicher, Tarife und Uhr
   */
  constructor(optionen: AufzeichnerOptionen) {
    this.speicher = optionen.speicher
    this.tarife = optionen.tarife
    this.jetzt = optionen.jetzt ?? (() => new Date())
  }

  /**
   * Verbucht **einen** Aufruf: bilden, preisen, ablegen.
   *
   * @param aufruf - was der Aufruf hergibt
   * @returns der gepreiste Datensatz und was die Ablage getan hat
   */
  async verbuchen(aufruf: Aufruf): Promise<Aufzeichnung> {
    const verbrauch = verbuche(aufruf, this.jetzt)
    const auskunft = preiseAufruf(this.tarife, verbrauch)
    const zeile: Kostenzeile = { ...verbrauch, kostenart: auskunft.kostenart }
    if (auskunft.kosten !== undefined) zeile.kosten = auskunft.kosten
    if (auskunft.tarifStand !== undefined) zeile.tarifStand = auskunft.tarifStand
    const aufnahme = await this.speicher.anhaengen(verbrauch.nutzer, [verbrauch])
    return { zeile, aufnahme }
  }

  /**
   * Liest das Konto eines Nutzers.
   *
   * **Warum hier neu gepreist wird.** Der abgelegte Datensatz trägt Token, nicht Kosten. Ein Tarif,
   * der nach der Buchung dazukam, wirkt damit **rückwirkend** auf die Anzeige — und das ist
   * richtig so: die Kosten sind eine Aussage über die Token, nicht über den Zeitpunkt des Buches.
   *
   * @param nutzer - der Nutzer
   * @param feld - Zeitraum in Tagen und Budget (Vorgabe: alles, keine Grenzen)
   * @returns Stand, Zusammenfassung und Zahl der Datensätze
   */
  async konto(nutzer: string, feld: { tage?: number; budget?: Budget } = {}): Promise<Konto> {
    const gespeichert = await this.speicher.lesen(nutzer)
    const zeilen = this.preise(gespeichert)
    const imFenster = feld.tage === undefined ? zeilen : zeitfenster(zeilen, { tage: feld.tage, jetzt: this.jetzt() })
    return {
      stand: budgetstand(imFenster, feld.budget ?? STANDARDBUDGET),
      uebersicht: zusammenfassung(imFenster),
      zeilen: imFenster.length,
    }
  }

  /**
   * Der Tarifstand, mit dem dieser Aufzeichner rechnet.
   *
   * @returns die Tarife
   */
  get preisstand(): readonly Tarifeintrag[] {
    return this.tarife
  }

  /** Preist die abgelegten Datensätze. */
  private preise(verbraeuche: Parameters<typeof preiseAlle>[1]): Kostenzeile[] {
    return preiseAlle(this.tarife, verbraeuche)
  }
}
