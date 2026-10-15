/**
 * Der Verwalter — er hält den Katalog aktuell.
 *
 * ## Wann er läuft
 *
 * Der Betreiber hat drei Anlässe festgelegt: **beim Start**, **zu festen Zeitpunkten**, und **wenn
 * ein Schlüssel fehlt**. Dazu einen vierten, den ein Mensch auslöst.
 *
 * | Anlass | Läuft er? | Warum |
 * |---|---|---|
 * | `start` | **immer** | Ein Start ist der Moment, in dem der Katalog gebraucht wird |
 * | `zeitplan` | nur, wenn der Eintrag **nicht mehr frisch** ist | Sonst liefe er endlos |
 * | `schluessel-fehlt` | **immer** | Ein fehlender Schlüssel ändert, was nutzbar ist |
 * | `von-hand` | **immer** | Wer ihn anstößt, will ihn |
 *
 * **Warum `start` immer läuft, obwohl die Sonde kostenlos ist.** Kostenlos ist nicht dasselbe wie
 * umsonst: sieben Familien mit sieben Wegen sind rund fünfzig Aufrufe. Das ist kein Preis, aber
 * Zeit. Wer das nicht will, nimmt `zeitplan` mit einer Frist — und bekommt dann beim Start einen
 * Katalog, der **alt** sein kann. Das ist eine Entscheidung des Aufrufers, keine dieses Codes.
 *
 * ## Was er NICHT tut
 *
 * **Er löscht keinen Eintrag, weil ein Dienst nicht antwortet.** Ein Netzfehler hat nichts
 * widerlegt. Der alte Eintrag bleibt, und der Bericht sagt, daß er alt ist. Wissen wegen eines
 * Aussetzers wegzuwerfen wäre der teuerste Fehler, den dieser Code machen könnte.
 *
 * @module @prometheus-harness/directory-curator/verwalter
 */

import type { Familie, Sondebefund } from '@prometheus-harness/verzeichnis'
import type { Auslegeergebnis } from './interpreter.ts'
import { messbar } from './interpreter.ts'
import {
  TAKT_TAG,
  eintragAus,
  eintragFuer,
  istFrisch,
  mitEintrag,
  type Katalog,
  type Katalogeintrag,
  type Takt,
} from './catalog.ts'

/** Warum der Verwalter läuft. */
export type Anlass =
  /** Beim Start des Harness. */
  | 'start'
  /** Zu festen Zeitpunkten. */
  | 'zeitplan'
  /** Weil ein Schlüssel fehlt — dann ändert sich, was nutzbar ist. */
  | 'schluessel-fehlt'
  /** Weil ein Mensch ihn angestoßen hat. */
  | 'von-hand'

/**
 * Soll der Verwalter für **diese** Familie laufen?
 *
 * @param anlass - warum er laufen soll
 * @param eintrag - der vorhandene Eintrag, wenn es einen gibt
 * @param jetzt - der jetzige Zeitpunkt
 * @param takt - wie lange ein Eintrag gilt
 * @returns ob geprüft werden soll
 */
export function sollLaufen(
  anlass: Anlass,
  eintrag: Katalogeintrag | undefined,
  jetzt: Date,
  takt: Takt = TAKT_TAG,
): boolean {
  switch (anlass) {
    case 'start':
    case 'schluessel-fehlt':
    case 'von-hand':
      return true
    case 'zeitplan':
      return !istFrisch(eintrag, jetzt, takt)
  }
}

/** Was der Verwalter braucht. */
export interface Verwalteroptionen {
  /** Die Familien, die verwaltet werden. */
  readonly familien: readonly Familie[]
  /**
   * Die Sonde — **hereingereicht**.
   *
   * Damit ist dieser Ablauf **ohne Netz** prüfbar. Und es steht genau eine Stelle fest, die
   * hinausruft: `sonde` aus `@prometheus-harness/verzeichnis`.
   *
   * @param familie - die zu prüfende Familie
   * @returns der Befund
   */
  readonly sonde: (familie: Familie) => Promise<Sondebefund>
  /** Der Zeitpunkt. Vorgabe: jetzt. */
  readonly jetzt?: () => Date
  /**
   * Der Ausleger — oder `undefined`, wenn nicht ausgelegt werden soll.
   *
   * Er läuft **nur**, wenn die Models-API etwas genannt hat. Ohne Kennungen gibt es nichts
   * auszulegen, und ein Modellaufruf wäre verschwendet.
   *
   * @param familie - die Familie
   * @param befund - was die Sonde ergeben hat
   * @returns das Auslegeergebnis
   */
  readonly ausleger?: (familie: Familie, befund: Sondebefund) => Promise<Auslegeergebnis>
  /** Warum gelaufen wird. */
  readonly anlass: Anlass
  /** Wie lange ein Eintrag gilt. */
  readonly takt?: Takt
}

/** Was ein Verwalterlauf ergeben hat. */
export interface Verwalterlauf {
  /** Der neue Katalog. */
  readonly katalog: Katalog
  /** Was geschehen ist, Zeile für Zeile — **ohne** Geheimnisse. */
  readonly bericht: readonly string[]
  /** Welche Familien wirklich geprüft wurden. */
  readonly geprueft: readonly string[]
  /** Welche übersprungen wurden, weil sie frisch waren. */
  readonly uebersprungen: readonly string[]
  /** Welche nicht geprüft werden konnten — mit Grund. */
  readonly gescheitert: readonly string[]
}

/**
 * Führt einen Verwalterlauf aus.
 *
 * @param katalog - der bisherige Katalog
 * @param optionen - Familien, Sonde, Ausleger und Anlaß
 * @returns der Lauf
 */
export async function verwalte(
  katalog: Katalog,
  optionen: Verwalteroptionen,
): Promise<Verwalterlauf> {
  const jetzt = optionen.jetzt?.() ?? new Date()
  const takt = optionen.takt ?? TAKT_TAG
  const bericht: string[] = [`Verwalterlauf (${optionen.anlass}), ${jetzt.toISOString()}`]
  const geprueft: string[] = []
  const uebersprungen: string[] = []
  const gescheitert: string[] = []
  let neu = katalog

  for (const familie of optionen.familien) {
    const alt = eintragFuer(katalog, familie.id)
    if (!sollLaufen(optionen.anlass, alt, jetzt, takt)) {
      uebersprungen.push(familie.id)
      bericht.push(
        `  ${familie.name}: übersprungen — der Eintrag ist frisch (geprüft ${alt?.geprueftAm ?? 'nie'}).`,
      )
      continue
    }

    let befund: Sondebefund
    try {
      befund = await optionen.sonde(familie)
    } catch (fehler) {
      // **Kein Löschen.** Ein Aussetzer widerlegt nichts; der alte Eintrag bleibt stehen.
      const grund = fehler instanceof Error ? fehler.message : String(fehler)
      gescheitert.push(familie.id)
      bericht.push(
        `  ${familie.name}: NICHT geprüft (${grund}). ` +
          (alt === undefined
            ? 'Es gibt noch keinen Eintrag.'
            : `Der Eintrag vom ${alt.geprueftAm} bleibt stehen — ein Aussetzer widerlegt nichts.`),
      )
      continue
    }

    const eintrag = eintragAus(familie.id, befund, jetzt)
    let fertig: Katalogeintrag = eintrag

    if (optionen.ausleger !== undefined) {
      if (befund.modelle.length === 0) {
        fertig = { ...eintrag, auslegungOffen: 'Die Models-API hat keine Kennung genannt.' }
        bericht.push(`  ${familie.name}: nichts auszulegen (keine Kennung genannt).`)
      } else if (!messbar(befund.wege)) {
        // **Ohne Meßwert wird NICHT gefragt.** Alle Wege `unbekannt` heißt: das Tor war zu oder das
        // Netz antwortete nicht. Ein Modell zu fragen, was ein Dienst könne, wenn nichts gemessen
        // ist, heißt nach einer **Meinung** zu fragen — und Meinungen gehören nicht in einen
        // Katalog, der sich als gemessen ausgibt.
        //
        // Gemessen am 15.10.2026 an ZenMux: 403 auf jeden POST, und das Modell behauptete mit 0,95
        // alle sechs Fähigkeiten. Jetzt entfällt der Aufruf — und der Grund steht im Katalog.
        const offen =
          'KEIN Weg war meßbar (alle unbekannt: Tor oder Netzfehler). Es wurde deshalb GAR NICHT ' +
          'ausgelegt — ohne Meßwert wäre jede Auslegung eine Meinung.'
        fertig = { ...eintrag, auslegungOffen: offen }
        bericht.push(`  ${familie.name}: ${offen}`)
      } else {
        try {
          const ergebnis = await optionen.ausleger(familie, befund)
          if (ergebnis.widerspruch !== undefined) {
            // **Der Widerspruch steht im Katalog, nicht die Auslegung.** Hier hat jemand etwas
            // behauptet und die Messung sagt das Gegenteil — das ist eine eigene Lage, und wer sie
            // später liest, soll sie erkennen.
            fertig = { ...eintrag, widerspruch: ergebnis.widerspruch, auslegungOffen: ergebnis.wegen }
          } else if (ergebnis.nichtBelegt !== undefined || ergebnis.faehigkeiten === undefined || !ergebnis.angenommen) {
            // „Nicht belegt" ist **kein** Widerspruch: die Messung sagt nicht nein, sie sagt
            // nichts. Beides gehört in `auslegungOffen`, aber die Begründung unterscheidet sich.
            fertig = { ...eintrag, auslegungOffen: ergebnis.wegen }
          } else {
            fertig = {
              ...eintrag,
              auslegung: {
                faehigkeiten: ergebnis.faehigkeiten,
                ...(ergebnis.sicherheit === undefined ? {} : { sicherheit: ergebnis.sicherheit }),
                ...(ergebnis.herkunft === undefined ? {} : { herkunft: ergebnis.herkunft }),
              },
            }
          }
          bericht.push(`  ${familie.name}: ${ergebnis.wegen}`)
        } catch (fehler) {
          const grund = fehler instanceof Error ? fehler.message : String(fehler)
          fertig = { ...eintrag, auslegungOffen: `Der Ausleger scheiterte: ${grund}` }
          bericht.push(`  ${familie.name}: Ausleger gescheitert — ${grund}`)
        }
      }
    }

    neu = mitEintrag(neu, fertig)
    geprueft.push(familie.id)
    const gefunden = Object.entries(befund.wege)
      .filter(([, b]) => b === 'vorhanden')
      .map(([f]) => f)
    bericht.push(
      `  ${familie.name}: geprüft — ${String(befund.modelle.length)} Kennung(en), ` +
        `Wege vorhanden: ${gefunden.length === 0 ? 'keine' : gefunden.join(', ')}.`,
    )
  }

  bericht.push(
    `Ergebnis: ${String(geprueft.length)} geprüft, ${String(uebersprungen.length)} übersprungen, ` +
      `${String(gescheitert.length)} gescheitert.`,
  )
  return { katalog: neu, bericht, geprueft, uebersprungen, gescheitert }
}
