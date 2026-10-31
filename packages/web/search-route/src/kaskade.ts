/**
 * Die Kette: welche Wege in welcher Reihenfolge versucht werden.
 *
 * ## Die Ordnung
 *
 * 1. **Gratis zuerst.** Ein Weg, der jetzt 0 kostet, steht vor jedem, der jetzt Geld kostet.
 * 2. **Mehr Deckung gewinnt.** Unter gleich teuren Wegen steht der, der den Bedarf voll deckt,
 *    vor dem, der ihn nur teilweise deckt (Treffer statt Antwort).
 * 3. **Dann der Rang.** Er trägt zwei Dinge zugleich: Qualität (Antwort vor Treffern) und
 *    Vorratsschutz. Ein **knappes** Freikontingent steht hinter den unbegrenzt freien Wegen —
 *    es wird für den Fall aufgehoben, in dem lokal nichts geht.
 * 4. **Bezahlt nur mit Rückfrage.** Der erste Schritt, der jetzt Geld kostet, ist markiert; der
 *    Aufrufer fragt vorher — oder startet die lokalen Dienste.
 *
 * ## Was „kostenbewusst" hier nicht heißt
 *
 * Der Planer optimiert nicht den Preis einer einzelnen Anfrage, sondern den Preis eines
 * **Ergebnisses**. Ein Weg, der Treffer liefert, aber drei weitere Abrufe nach sich zieht, ist
 * nicht billig. Deshalb zählt `deckung` mit: der Weg, der den Bedarf voll deckt, steht vor dem,
 * der ihn nur halb deckt — auch wenn beide 0 kosten.
 *
 * ## Was „Lage" heißt
 *
 * Erreichbarkeit wird hereingereicht, nicht erfragt. Dieses Modul öffnet keine Verbindung; es
 * plant nur. Wer die Kette ausführt, prüft vorher und reicht das Ergebnis als `Lage` herein.
 *
 * @module @prometheus-harness/search-route/kaskade
 */

import { FIRECRAWL_FREI_SUCHEN, STICHTAG, WEGE, type Bedarf, type Weg, type WegId, type Zustand } from './routen.ts'

/** Was jetzt erreichbar ist. */
export interface Lage {
  readonly searxng: boolean
  readonly firecrawl: boolean
  /** Die Cloud-Variante — nur sinnvoll, wenn ein Schlüssel hinterlegt ist. */
  readonly firecrawlCloud: boolean
  readonly deepseek: boolean
}

/** Ein Schritt der Kette. */
export interface Schritt {
  readonly weg: WegId
  readonly kostenUsd: number
  /** Kostet dieser Schritt **jetzt** Geld? Nur dann ist eine Rückfrage nötig. */
  readonly bezahlt: boolean
  readonly grund: string
}

/** Das Ergebnis der Planung. */
export interface Kette {
  readonly schritte: readonly Schritt[]
  /** Index des ersten bezahlten Schritts, sonst `null`. */
  readonly bezahltAb: number | null
  /** Was zu tun ist, wenn nichts Gratis erreichbar ist. */
  readonly hinweis: string | null
}

/** Ob ein Bedarf auch von einem schwächeren Weg bedient werden darf. */
export interface Kettenregel {
  /**
   * Darf `answer` von einem Weg bedient werden, der nur Treffer liefert?
   *
   * `true` heißt: notfalls Treffer statt Antwort. `false` heißt: nur der Weg, der eine Antwort
   * liefert, kommt in Frage.
   */
  readonly darfDegradieren: boolean
}

/**
 * Unter gleich teuren Wegen: Qualität und Vorratsschutz. Kleiner ist besser.
 *
 * Die Reihenfolge ist Absicht: das Werkzeug mit Antwort und Quellen zuerst, dann die unbegrenzt
 * freien lokalen Wege, dann der knappe Cloud-Vorrat, zuletzt der Browser.
 */
const RANG: Record<WegId, number> = {
  'deepseek-server': 0,
  searxng: 1,
  firecrawl: 2,
  'firecrawl-cloud': 3,
  browser: 4,
}

/** Welche Wege für den Bedarf in Frage kommen — mit Degradierung für `answer`. */
function kandidaten(bedarf: Bedarf, regel: Kettenregel): Weg[] {
  const direkt = WEGE.filter((weg) => weg.deckt.includes(bedarf))
  if (bedarf !== 'answer' || !regel.darfDegradieren) return direkt
  const ersatz = WEGE.filter((weg) => weg.deckt.includes('links'))
  return [...new Set([...direkt, ...ersatz])]
}

/** Ist der Weg in dieser Lage erreichbar? */
function erreichbar(weg: Weg, lage: Lage): boolean {
  if (weg.id === 'searxng') return lage.searxng
  if (weg.id === 'firecrawl') return lage.firecrawl
  if (weg.id === 'firecrawl-cloud') return lage.firecrawlCloud
  if (weg.id === 'deepseek-server') return lage.deepseek
  return true
}

/** Deckt dieser Weg den Bedarf voll (0) oder nur teilweise (1)? */
function deckung(weg: Weg, bedarf: Bedarf): number {
  return weg.deckt.includes(bedarf) ? 0 : 1
}

/** Warum dieser Weg an dieser Stelle steht. */
function begruende(weg: Weg, jetzt: Date, zustand: Zustand, bedarf: Bedarf): string {
  if (weg.id === 'searxng') return 'lokal, gratis und unbegrenzt'
  if (weg.id === 'firecrawl') return 'lokal betrieben, gratis und unbegrenzt'
  if (weg.id === 'firecrawl-cloud') {
    return zustand.firecrawlCloudGenutzt < FIRECRAWL_FREI_SUCHEN
      ? 'Cloud, im Freikontingent — wird geschont'
      : 'Cloud, Freikontingent erschöpft, kostenpflichtig'
  }
  if (weg.id === 'deepseek-server') {
    return jetzt < STICHTAG ? 'gratis bis zum Stichtag, liefert Antwort und Quellen' : 'bezahlt, letzter Ausweg'
  }
  return bedarf === 'render' ? 'rendert JavaScript-Seiten' : ''
}

/**
 * Die Reihenfolge der Versuche für einen Bedarf.
 *
 * Ein nicht erreichbarer Weg verschwindet aus der Kette — die Kette ist genau dafür da, ihn zu
 * überspringen. Ist der erste Schritt bezahlt, muss der Aufrufer vorher fragen.
 *
 * @param bedarf - was gebraucht wird
 * @param lage - was gerade erreichbar ist
 * @param zustand - Verbrauch des knappen Vorrats
 * @param jetzt - die Uhr
 * @param regel - ob `answer` degradieren darf
 * @returns die Kette mit Schritten, Rückfrage-Index und Hinweis
 */
export function kaskade(
  bedarf: Bedarf,
  lage: Lage,
  zustand: Zustand,
  jetzt: Date,
  regel: Kettenregel = { darfDegradieren: true },
): Kette {
  const geplant = kandidaten(bedarf, regel)
    .filter((weg) => erreichbar(weg, lage))
    .map((weg) => ({ weg, kostenUsd: weg.kosten(zustand, jetzt), deckung: deckung(weg, bedarf) }))
    .sort((a, b) => {
      const aUnbekannt = Number.isNaN(a.kostenUsd)
      const bUnbekannt = Number.isNaN(b.kostenUsd)
      if (aUnbekannt !== bUnbekannt) return aUnbekannt ? 1 : -1
      if (a.kostenUsd !== b.kostenUsd) return a.kostenUsd - b.kostenUsd
      if (a.deckung !== b.deckung) return a.deckung - b.deckung
      return RANG[a.weg.id] - RANG[b.weg.id]
    })

  const schritte = geplant.map((eintrag) => ({
    weg: eintrag.weg.id,
    kostenUsd: eintrag.kostenUsd,
    bezahlt: eintrag.kostenUsd > 0,
    grund: begruende(eintrag.weg, jetzt, zustand, bedarf),
  }))

  const treffer = schritte.findIndex((schritt) => schritt.bezahlt)
  const bezahltAb = treffer === -1 ? null : treffer
  const hinweis =
    schritte.length === 0
      ? 'keine Quelle erreichbar'
      : bezahltAb === 0
        ? 'keine gratis Quelle erreichbar: lokale Dienste starten oder bezahlte Suche freigeben'
        : null

  return { schritte, bezahltAb, hinweis }
}

/** Der erste Schritt je Bedarf — für die Anzeige. */
export interface Empfehlung {
  readonly bedarf: Bedarf
  readonly weg: WegId | null
  readonly kostenUsd: number
  readonly grund: string
}

/**
 * Der erste Schritt je Bedarf.
 *
 * @param lage - was gerade erreichbar ist
 * @param zustand - Verbrauch des knappen Vorrats
 * @param jetzt - die Uhr
 * @param regel - ob `answer` degradieren darf
 * @returns eine Zeile je Bedarf, in fester Reihenfolge
 */
export function proBedarf(
  lage: Lage,
  zustand: Zustand,
  jetzt: Date,
  regel: Kettenregel = { darfDegradieren: true },
): Empfehlung[] {
  const bedarfe: Bedarf[] = ['answer', 'links', 'extract', 'render']
  return bedarfe.map((bedarf) => {
    const erster = kaskade(bedarf, lage, zustand, jetzt, regel).schritte[0]
    if (erster === undefined) {
      return { bedarf, weg: null, kostenUsd: Number.NaN, grund: 'kein Weg deckt diesen Bedarf' }
    }
    return { bedarf, weg: erster.weg, kostenUsd: erster.kostenUsd, grund: erster.grund }
  })
}
