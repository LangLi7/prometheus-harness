/**
 * `@prometheus-harness/waechter` — die Kontrolle **vor** der Tat.
 *
 * ## Was er beantwortet
 *
 * Eine Frage: *darf dieser Text hinaus?* — hinaus in eine Anzeige, in ein Protokoll, in eine
 * Anfrage an ein Modell, in eine Datei.
 *
 * ## Warum er zwei Stufen hat, und warum die Reihenfolge nicht beliebig ist
 *
 * | Stufe | Wie | Wann |
 * |---|---|---|
 * | 1 | **Regeln** — kein Netz, kein Modell | immer, zuerst |
 * | 2 | **Urteil** eines Modells | nur, wenn Stufe 1 **nichts** fand |
 *
 * **Stufe 2 wird bei einem Fund NICHT ausgeführt — und das ist der wichtigste Satz dieser Datei.**
 * Der Urteilende ist ein Modell bei einem Anbieter im Netz: ihm den Text zu schicken heißt, ihn
 * **hinauszuschicken**. Wer den Wächter bei einem Text mit Schlüssel fragt „ist da ein Schlüssel
 * drin?", hat den Schlüssel gerade selbst verschickt. Der Wächter hätte das Leck verursacht, das er
 * verhindern soll.
 *
 * ## Warum Stufe 1 gewinnt, obwohl ein Modell „klüger" klingt
 *
 * Weil eine Regel bei einer Form **gewiß** ist und ein Modell nur wahrscheinlich. `sk-or-v1-` mit 64
 * Zeichen ist ein Schlüssel. Für diese Frage ein Modell zu bezahlen wäre langsamer, teurer und
 * **unsicherer** — es könnte „harmlos" sagen.
 *
 * Das Modell kommt dort zum Zug, wo die Form nichts verrät: bei einem Geheimnis ohne bekannte Form,
 * das auch niemand eingetragen hat.
 *
 * ## Woher die Sicherheit für die Entscheidung kommt
 *
 * Nicht vom Anbieter — der meldet keine. Das **Schema verlangt sie**: das Urteil trägt ein Feld
 * `sicherheit` (Zahl zwischen 0 und 1), und das Modell füllt es aus. Was nicht im Feld steht, ist
 * keine Sicherheit; dann greift {@link umgangFuer} und schickt die Frage zum Menschen.
 *
 * @module @prometheus-harness/waechter
 */

import {
  umgangFuer,
  type Entscheider,
  type Herkunft,
  type Schema,
  type Stufen,
  type Umgang,
} from '@prometheus-harness/faehigkeiten'
import {
  entschaerfeText,
  findeBekannte,
  findeMitRegeln,
  type Regel,
  type Treffer,
} from './regeln.ts'

export {
  REGELN,
  entschaerfeText,
  findeBekannte,
  findeMitRegeln,
  type Regel,
  type Treffer,
} from './regeln.ts'

/** Ein eingetragener Wert — **mit Namen**, weil der Name kein Geheimnis ist und dem Menschen hilft. */
export interface Eintrag {
  readonly name: string
  readonly wert: string
}

/** Was der Wächter beim Aufbau braucht. */
export interface WaechterOptionen {
  /**
   * Die Werte, die **mit Gewißheit** nicht hinausgehen dürfen.
   *
   * Als Funktion, damit sie erst geholt werden, wenn geprüft wird — und damit der Wächter sie
   * **nicht verwahrt**. Ein Wächter, der die Schlüssel im Speicher hält, ist selbst ein Ort, an dem
   * sie stehen.
   */
  readonly bekannteWerte?: () => readonly Eintrag[]
  /** Abweichende Regeln. Vorgabe: {@link REGELN}. */
  readonly regeln?: readonly Regel[]
}

/** Das Ergebnis der **regelbasierten** Prüfung. */
export type Erlaubnis =
  | { readonly darfRaus: true }
  | {
      readonly darfRaus: false
      readonly treffer: readonly Treffer[]
      /** Warum — **ohne** den Wert. Die Fundstellen stehen in {@link Erlaubnis.treffer}. */
      readonly wegen: string
    }

/** Das Ergebnis der Prüfung **mit Urteil**. */
export interface Urteilsbefund {
  /** Was zu tun ist. */
  readonly umgang: Umgang
  /** Ob der Text hinausgehen darf — nur bei `handeln` und „kein Geheimnis". */
  readonly darfRaus: boolean
  /** Was das Modell sagte — `undefined`, wenn es gar nicht gefragt wurde. */
  readonly geheimnis?: boolean
  /** Wie sicher es war — `undefined`, wenn es nichts dazu sagte. */
  readonly sicherheit?: number
  /** Wer geantwortet hat, falls ein Modell geantwortet hat. */
  readonly herkunft?: Herkunft
  /** Warum so entschieden wurde. */
  readonly wegen: string
}

/** Der Wächter. */
export interface Waechter {
  /**
   * Stufe 1: prüft **ohne** Modell und **ohne** Netz.
   *
   * @param text - der zu prüfende Text
   * @returns die Erlaubnis samt Funden
   */
  pruefe(text: string): Erlaubnis
  /**
   * Ersetzt jeden Fund durch Sterne — gleiche Länge, damit die Stellen stimmen.
   *
   * @param text - der Text
   * @returns der entschärfte Text, die Funde und die Erlaubnis **des Originals**
   */
  entschaerfe(text: string): { readonly text: string; readonly treffer: readonly Treffer[]; readonly erlaubnis: Erlaubnis }
  /**
   * Stufe 2: fragt ein Modell — **nur**, wenn Stufe 1 nichts fand.
   *
   * @param text - der zu prüfende Text
   * @param auftrag - der Entscheider und die Schwellen des Aufrufers
   * @returns der Befund
   */
  pruefeMitUrteil(
    text: string,
    auftrag: { readonly entscheider: Entscheider; readonly stufen: Stufen },
  ): Promise<Urteilsbefund>
}

/** Das Schema für das Urteil — **die Sicherheit wird verlangt**, nicht erhofft. */
const SCHEMA: Schema<{ geheimnis: boolean; sicherheit: number }> = {
  felder: {
    geheimnis: { art: 'wahrheitswert' },
    sicherheit: { art: 'zahl' },
  },
}

/** Der Auftrag an das Modell. */
const FRAGE =
  'Enthält der folgende Text ein Geheimnis, das nicht hinausgehen darf? ' +
  'Gemeint sind: Zugangsschlüssel, Paßwörter, private Schlüssel, Sitzungs- und Zugangskennungen, ' +
  'Verbindungsadressen mit Paßwort. ' +
  'Antworte mit `geheimnis` (wahr oder falsch) und `sicherheit` (Zahl zwischen 0 und 1).'

/**
 * Baut den Wächter.
 *
 * @param optionen - die eingetragenen Werte und abweichende Regeln
 * @returns der Wächter
 */
export function waechter(optionen: WaechterOptionen = {}): Waechter {
  const regeln = optionen.regeln ?? undefined

  /**
   * Sammelt alle Funde: erst die eingetragenen Werte, dann die Formen.
   *
   * @param text - der Text
   * @returns die Funde, nach Stelle geordnet
   */
  function alleFunde(text: string): Treffer[] {
    const bekannt =
      optionen.bekannteWerte === undefined ? [] : findeBekannte(text, optionen.bekannteWerte())
    const geformt = regeln === undefined ? findeMitRegeln(text) : findeMitRegeln(text, regeln)
    // Ein Fund kann von beiden Stufen gefunden werden (ein eingetragener Schlüssel hat auch eine
    // Form). Doppelte Stellen würden beim Entschärfen übersprungen — hier werden sie vereinigt,
    // damit die Liste ehrlich ist und die Zahl der Funde der Zahl der Stellen entspricht.
    const alle = [...bekannt, ...geformt].sort((a, b) => a.stelle - b.stelle)
    const einmalig: Treffer[] = []
    for (const fund of alle) {
      const vorher = einmalig[einmalig.length - 1]
      if (vorher !== undefined && fund.stelle < vorher.stelle + vorher.laenge) {
        // Überschneidung: der eingetragene Wert gewinnt, weil er den Namen mitbringt.
        if (vorher.bezeichnung === undefined && fund.bezeichnung !== undefined) {
          einmalig[einmalig.length - 1] = fund
        }
        continue
      }
      einmalig.push(fund)
    }
    return einmalig
  }

  /**
   * Macht aus Funden eine Meldung — **ohne jeden Wert**.
   *
   * @param funde - die Funde
   * @returns die Meldung
   */
  function wegen(funde: readonly Treffer[]): string {
    const teile = funde.map((fund) => {
      const wer = fund.bezeichnung === undefined ? '' : ` (${fund.bezeichnung})`
      return `${fund.regel}${wer} an Stelle ${String(fund.stelle)}, ${String(fund.laenge)} Zeichen`
    })
    return `Nicht hinausgeben: ${String(funde.length)} Fund(e) — ${teile.join('; ')}.`
  }

  return {
    pruefe(text: string): Erlaubnis {
      const funde = alleFunde(text)
      return funde.length === 0 ? { darfRaus: true } : { darfRaus: false, treffer: funde, wegen: wegen(funde) }
    },

    entschaerfe(text: string) {
      const treffer = alleFunde(text)
      return {
        text: entschaerfeText(text, treffer),
        treffer,
        erlaubnis:
          treffer.length === 0 ? { darfRaus: true } : { darfRaus: false, treffer, wegen: wegen(treffer) },
      }
    },

    async pruefeMitUrteil(
      text: string,
      auftrag: { readonly entscheider: Entscheider; readonly stufen: Stufen },
    ): Promise<Urteilsbefund> {
      const funde = alleFunde(text)
      if (funde.length > 0) {
        // **Kein Modellaufruf.** Der Text trägt bereits ein Geheimnis; ihn zu einem Anbieter im
        // Netz zu schicken hieße, ihn hinauszuschicken. Der Wächter würde das Leck verursachen,
        // das er verhindern soll.
        return {
          umgang: 'mensch',
          darfRaus: false,
          wegen: `${wegen(funde)} Es wurde bewußt KEIN Modell gefragt: der Text hätte dabei das Haus verlassen.`,
        }
      }

      const urteil = await auftrag.entscheider.entscheide({
        frage: FRAGE,
        lage: { text },
        schema: SCHEMA,
      })

      const geheimnis = urteil.wert.geheimnis
      const sicherheit = urteil.wert.sicherheit
      const umgang = umgangFuer(
        {
          sicherheit,
          ...(urteil.herkunft === undefined ? {} : { herkunft: urteil.herkunft }),
        },
        auftrag.stufen,
      )
      const wer = urteil.herkunft === undefined ? 'ein Modell' : `„${urteil.herkunft.modell}"`
      const wieSicher =
        typeof sicherheit === 'number' ? ` mit Sicherheit ${sicherheit.toFixed(2)}` : ' ohne Angabe einer Sicherheit'

      return {
        umgang,
        // Nur wenn gehandelt werden darf **und** kein Geheimnis gemeldet wurde, geht der Text
        // hinaus. Bei `rueckfrage` und `mensch` bleibt er hier — bis jemand geantwortet hat.
        darfRaus: umgang === 'handeln' && geheimnis === false,
        geheimnis,
        ...(typeof sicherheit === 'number' ? { sicherheit } : {}),
        ...(urteil.herkunft === undefined ? {} : { herkunft: urteil.herkunft }),
        wegen: `${wer} sagt: ${geheimnis ? 'Geheimnis' : 'kein Geheimnis'}${wieSicher} → ${umgang}.`,
      }
    },
  }
}
