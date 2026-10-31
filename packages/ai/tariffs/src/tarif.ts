/**
 * Der Tarif — was ein Modell kostet, und **woher das bekannt ist**.
 *
 * ## Warum „Kostenart" eine eigene Aussage ist und nicht bloß ein Preis
 *
 * Ein Preis von `0` und ein **fehlender** Preis sind zwei verschiedene Welten, und beide sind von
 * „kostet Geld" verschieden. Diese drei zu einer Zahl zu verschmelzen ist der Fehler, der eine
 * Liste unbrauchbar macht: das Modell mit dem unbekannten Preis rutschte nach vorn.
 *
 * Deshalb steht die **Kostenart** als eigenes Feld — und sie wird **ausgerechnet**, nicht
 * behauptet:
 *
 * | Kostenart | Wann | Was sie heißt |
 * |---|---|---|
 * | `kostenlos` | Preis bekannt **und** Summe `0` | Der Aufruf kostet nichts |
 * | `freibetrag` | Ein Kontingent ist **benannt** | Ein Teil ist frei, danach wird abgerechnet |
 * | `kostenpflichtig` | Preis bekannt **und** Summe `> 0` | Es kostet, und wir wissen wieviel |
 * | `unbekannt` | Kein Preis | **Nicht** billig — nur unbekannt |
 *
 * ## Warum die Tabelle eine Saat ist und nicht die Wahrheit
 *
 * Ein eingetragener Preis ist eine **Messung von gestern**. Er bleibt stehen, damit die Liste auch
 * ohne Netz etwas sagen kann — aber sobald eine Models-API einen Preis nennt, **schlägt die
 * Messung die Tabelle**. Was dabei überschrieben wurde, steht im Bericht; eine stille Korrektur
 * wäre von einer Bestätigung nicht zu unterscheiden.
 *
 * @module @prometheus-harness/tariffs/tarif
 */

import {
  PREIS_UNBEKANNT,
  alsText,
  preisBekannt,
  summe,
  type Preis,
} from './preis.ts'

/**
 * Wie ein Modell abgerechnet wird.
 *
 * **Die Reihenfolge der Werte ist die Rangfolge** — von „am günstigsten" nach „am wenigsten
 * bekannt". {@link KOSTEN_RANG} macht sie sortierbar.
 */
export type Kostenart =
  /** Der Preis ist bekannt und beträgt null. */
  | 'kostenlos'
  /** Ein begrenztes Kontingent ist frei; danach gilt der Preis. */
  | 'freibetrag'
  /** Der Preis ist bekannt und größer als null. */
  | 'kostenpflichtig'
  /** **Kein** Preis bekannt. Nicht günstig — nur unbekannt. */
  | 'unbekannt'

/**
 * Die Rangfolge der Kostenarten als Zahlen — kleiner ist besser.
 *
 * **Warum `unbekannt` den höchsten Wert hat.** Wer nach „billig zuerst" sortiert und den
 * unbekannten Preis nicht behandelt, bekommt ihn automatisch ganz vorn — weil ein fehlender Wert
 * in den meisten Sprachen als kleinster durchgeht. Diese Tabelle kehrt das ausdrücklich um.
 */
export const KOSTEN_RANG: Readonly<Record<Kostenart, number>> = {
  kostenlos: 0,
  freibetrag: 1,
  kostenpflichtig: 2,
  unbekannt: 3,
}

/** Ein benanntes Gratis-Kontingent — nur, wenn jemand Menge und Einheit nennt. */
export interface Freibetrag {
  /** Die Einheit (`Anfragen/Tag`, `Token/Monat`). */
  readonly einheit: string
  /** Die Menge in dieser Einheit. */
  readonly menge: number
  /** Woher die Angabe stammt. */
  readonly beleg: string
}

/** Woher ein Preis stammt. */
export type Herkunft =
  /** Aus einer Models-API gelesen — die frischeste Form. */
  | 'gemessen'
  /** Aus der Tabelle dieses Pakets — eine Messung von einem genannten Tag. */
  | 'tabelle'

/** Ein Tarif: was **ein** Modell bei **einer** Familie kostet. */
export interface Tarifeintrag {
  /** Die Kennung der Familie (`openrouter`). */
  readonly familie: string
  /** Die Modellkennung, wie der Dienst sie nennt. */
  readonly modell: string
  /** Der Preis. Unbekannt ist erlaubt — aber dann steht es auch da. */
  readonly preis: Preis
  /** Wann diese Zahl gilt (`2026-10-15`) — **ohne Datum altert ein Preis nie**. */
  readonly stand: string
  /** Woher die Zahl stammt, in Worten. */
  readonly quelle: string
  /** Woher sie **zuletzt** kam. */
  readonly herkunft: Herkunft
  /** Ein benanntes Kontingent, falls eines bekannt ist. */
  readonly freibetrag?: Freibetrag
}

/**
 * Rechnet die Kostenart aus — statt sie zu behaupten.
 *
 * Die Reihenfolge der Prüfungen ist bindend: ein Preis von null **bleibt** kostenlos, auch wenn ein
 * Kontingent genannt ist (dann ist das Kontingent bedeutungslos). Sonst gewinnt der Freibetrag,
 * weil er die Frage „geht das umsonst?" beantwortet.
 *
 * @param eintrag - der Tarif
 * @returns die Kostenart
 */
export function kostenartFuer(eintrag: Tarifeintrag): Kostenart {
  const gesamt = summe(eintrag.preis)
  if (gesamt === 0) return 'kostenlos'
  if (eintrag.freibetrag !== undefined) return 'freibetrag'
  if (gesamt !== undefined && gesamt > 0) return 'kostenpflichtig'
  return 'unbekannt'
}

/**
 * Sucht den Tarif zu einer Familie und einem Modell.
 *
 * **Warum die Suche die Familie mitprüft.** Dieselbe Modellkennung kann bei zwei Familien
 * vorkommen — `google/gemini-3.8-flash` bei OpenRouter und (als `gemini-3.8-flash`) bei Google
 * direkt. Ein Preis, der nur über den Modellnamen gefunden wird, wäre irgendwann der Preis des
 * anderen Anbieters.
 *
 * @param tarife - die Tarife
 * @param familie - die Kennung der Familie
 * @param modell - die Modellkennung
 * @returns der Tarif oder `undefined`
 */
export function tarifFuer(
  tarife: readonly Tarifeintrag[],
  familie: string,
  modell: string,
): Tarifeintrag | undefined {
  return tarife.find((eintrag) => eintrag.familie === familie && eintrag.modell === modell)
}

/** Was eine Verschmelzung geändert hat. */
export interface Verschmelzung {
  /** Die Tarife, wobei die Messung die Tabelle geschlagen hat. */
  readonly tarife: readonly Tarifeintrag[]
  /** Zeilen für den Bericht — **ohne** Geheimnisse. */
  readonly bericht: readonly string[]
  /** Wie viele Einträge die Messung überschrieben hat. */
  readonly ueberschrieben: number
  /** Wie viele Einträge die Messung neu hinzugefügt hat. */
  readonly ergaenzt: number
}

/**
 * Verschmilzt die Tabelle mit dem, was gemessen wurde.
 *
 * ## Die Regel, in einem Satz
 *
 * **Die Messung schlägt die Tabelle; wo nichts gemessen ist, bleibt die Tabelle.**
 *
 * ## Warum ein gemessener `-1` die Tabelle NICHT überschreibt
 *
 * `-1` heißt „diese API nennt keinen Preis" — nicht „dieser Anbieter kostet nichts". Beides als
 * Überschreibung zu lesen hieße: eine API ohne Preisfeld löschte jeden eingetragenen Preis, und
 * die Liste verlöre genau das Wissen, für das die Tabelle da ist.
 *
 * @param tabelle - die Saat aus {@link SAAT}
 * @param gemessen - die gelesenen Tarife
 * @param stand - der Tag der Messung
 * @returns die verschmolzenen Tarife und was geschah
 */
export function verschmelze(
  tabelle: readonly Tarifeintrag[],
  gemessen: readonly Tarifeintrag[],
  stand: string,
): Verschmelzung {
  const bericht: string[] = []
  const nach = new Map<string, Tarifeintrag>()
  const schluessel = (familie: string, modell: string): string => `${familie}\u0000${modell}`

  for (const eintrag of tabelle) nach.set(schluessel(eintrag.familie, eintrag.modell), eintrag)

  let ueberschrieben = 0
  let ergaenzt = 0
  for (const frisch of gemessen) {
    const alt = nach.get(schluessel(frisch.familie, frisch.modell))
    if (!preisBekannt(frisch.preis)) {
      // **Nicht überschreiben.** Siehe die Begründung an dieser Funktion.
      if (alt === undefined) {
        bericht.push(
          `${frisch.familie}/${frisch.modell}: gemessen, aber der Preis ist unbekannt — ` +
            'nicht aufgenommen (ein Eintrag ohne Preis trägt nichts).',
        )
      }
      continue
    }
    const neu: Tarifeintrag = { ...frisch, stand, herkunft: 'gemessen' }
    if (alt === undefined) {
      ergaenzt += 1
      bericht.push(`${frisch.familie}/${frisch.modell}: NEU aufgenommen — ${alsText(frisch.preis)} USD je 1 Mio Token.`)
    } else {
      ueberschrieben += 1
      bericht.push(
        `${frisch.familie}/${frisch.modell}: gemessen ${alsText(frisch.preis)} ` +
          `schlägt die Tabelle ${alsText(alt.preis)} (Stand ${alt.stand}).`,
      )
    }
    nach.set(schluessel(frisch.familie, frisch.modell), neu)
  }

  const tarife = [...nach.values()].sort((a, b) =>
    a.familie < b.familie ? -1 : a.familie > b.familie ? 1 : a.modell < b.modell ? -1 : a.modell > b.modell ? 1 : 0)

  bericht.push(
    `Verschmelzung: ${String(tarife.length)} Tarife, davon ${String(ueberschrieben)} von der Messung ` +
      `überschrieben und ${String(ergaenzt)} neu.`,
  )
  return { tarife, bericht, ueberschrieben, ergaenzt }
}

/** Ein Tarif mit unbekanntem Preis — für Kennungen, über die nichts bekannt ist. */
export function unbekannterTarif(familie: string, modell: string, stand: string, quelle: string): Tarifeintrag {
  return { familie, modell, preis: PREIS_UNBEKANNT, stand, quelle, herkunft: 'tabelle' }
}
