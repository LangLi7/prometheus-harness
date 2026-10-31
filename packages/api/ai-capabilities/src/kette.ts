/**
 * Die Kette: Einstellungen + Schlüssel + OpenRouter → eine einsatzbereite Registratur.
 *
 * ## Warum das eine eigene Datei ist
 *
 * Der Aufbau braucht **drei** Dinge, die aus drei verschiedenen Orten kommen: die Wahl des
 * Endnutzers aus einer Datei, den Schlüssel aus dem Schlüsselspeicher, und die Fähigkeiten aus dem
 * Anbieter. Diese Datei fügt sie zusammen — **ohne HTTP und ohne Host**, damit sie ohne laufenden
 * Server prüfbar ist.
 *
 * ## Was sie NICHT tut
 *
 * Kein Netz. `baueAuf` und `openrouter` rufen beim Bauen nichts auf; „bereit" ist eine Auskunft
 * über Schlüssel und Modell, nicht über die Erreichbarkeit. Ein Aufruf entsteht erst, wenn ein
 * Endpunkt oder ein Werkzeug wirklich etwas verlangt.
 *
 * @module @prometheus-harness/ai-capabilities/kette
 */

import type { Anbieter, Faehigkeit } from '@prometheus-harness/capabilities'
import { baueAuf, type Aufbau } from '@prometheus-harness/composition'
import { openrouter } from '@prometheus-harness/openrouter'
import {
  ladeEinstellungen,
  modelleFuer,
  unserPfad,
  type Einstellungen,
} from '@prometheus-harness/settings'
import { UMWELT_SCHLUESSEL as UMWELT_TYPESAFE, typesafe } from '@prometheus-harness/typesafe'

/** Die Umgebungsvariable, aus der der Schlüssel kommt, wenn keine Quelle gesetzt ist. */
export const UMWELT_SCHLUESSEL = 'OPENROUTER_API_KEY'

/**
 * Die Kennung des zweiten Anbieters — **derselbe Vertrag, eine andere Form**.
 *
 * **Warum er neben OpenRouter steht und nicht statt seiner.** Die beiden können dieselbe
 * Fähigkeit (`entscheiden`), aber nicht dasselbe: OpenRouter liefert ein JSON-Objekt nach
 * Schema und **keine** Sicherheit; TypeSafe liefert die Verteilung und die `confidence`
 * daraus. Welcher der beiden läuft, entscheidet die Wahl des Endnutzers — nicht dieser Code.
 */
export const ANBIETER_TYPESAFE = 'typesafe'

/**
 * Die Anbieterkennung, die dieses Plugin bedient.
 *
 * **Warum nur eine.** Weitere Anbieter (Google AI Studio direkt, OpenAI direkt) gibt es im
 * Verzeichnis nicht — ihre Modelle sind über OpenRouter erreichbar. Ein zweiter Anbieter wäre eine
 * zweite Schlüsselquelle und eine zweite Form; er kommt erst, wenn er gemessen ist.
 */
export const ANBIETER_ID = 'openrouter'

/** Was zum Bauen der Kette hineingegeben wird. */
export interface KetteOptionen {
  /** Wo die Einstellungen liegen. Vorgabe: `unserPfad()` (also `~/.pmh/einstellungen.json`). */
  readonly einstellungenPfad?: string
  /** Woher der Schlüssel kommt. Vorgabe: die Umgebungsvariable {@link UMWELT_SCHLUESSEL}. */
  readonly schluessel?: () => string | undefined | Promise<string | undefined>
  /**
   * Woher der TypeSafe-Schlüssel kommt. Vorgabe: `$TYPESAFE_API_KEY`.
   *
   * **Warum eine eigene Quelle.** Es sind zwei Dienste mit zwei Schlüsseln. Eine gemeinsame
   * Quelle würde beim einen Dienst einen Schlüssel des anderen hinterlegen — und der Fehler
   * käme erst als HTTP 401 zurück.
   */
  readonly schluesselTypesafe?: () => string | undefined | Promise<string | undefined>
}

/** Was die Kette ergeben hat. */
export interface Kette {
  /** Die Registratur samt Hinweisen — der Mensch zuletzt ist hier **nicht** eingetragen. */
  readonly aufbau: Aufbau
  /** Die gelesenen Einstellungen. */
  readonly einstellungen: Einstellungen
  /** Der Anbieter, roh — für Auskünfte über Vorschläge und Fähigkeiten. */
  readonly anbieter: Anbieter
  /**
   * Die weiteren Anbieter neben {@link Kette.anbieter}.
   *
   * **Warum das eine Liste ist und nicht ein Feld je Anbieter.** Mit jedem neuen Anbieter ein
   * Feld zu ergänzen, wäre eine Aufzählung, die mitwächst — und jede Stelle, die sie liest,
   * müßte mitwachsen. Für die Oberfläche zählt: **welche** eingetragen wurden, steht in
   * `aufbau.eingetragen`.
   */
  readonly weitere: readonly Anbieter[]
  /** Wo die Einstellungen gelesen wurden. */
  readonly pfad: string
  /**
   * Ob ein Schlüssel hinterlegt ist — **ohne ihn auszugeben**.
   *
   * **Warum das eine eigene Auskunft ist.** „Nicht bereit" kann zwei Ursachen haben: kein
   * Schlüssel oder keine Modellwahl. Die Oberfläche muß sie unterscheiden können, sonst schickt
   * sie den Nutzer an die falsche Stelle. Der Wert selbst bleibt hier — nur sein Dasein geht hinaus.
   *
   * @returns ob die Schlüsselquelle einen nicht-leeren Wert liefert
   */
  readonly hatSchluessel: () => Promise<boolean>
  /**
   * Ob ein TypeSafe-Schlüssel hinterlegt ist — **ohne ihn auszugeben**.
   *
   * @returns ob die Quelle einen nicht-leeren Wert liefert
   */
  readonly hatSchluesselTypesafe: () => Promise<boolean>
}

/**
 * Baut die Kette.
 *
 * **Warum bei jedem Aufruf neu.** Die Einstellungen sind eine Datei; ein Mensch darf sie ändern,
 * während der Host läuft. Sie bei jedem Aufruf zu lesen kostet einen Dateizugriff und erspart einen
 * Neustart — und ein Neustart ist genau der Moment, in dem ein Nutzer glaubt, seine Wahl sei
 * verloren.
 *
 * @param optionen - Pfad und Schlüsselquelle
 * @returns die Kette
 * @throws EinstellungenFehler - wenn die Datei da, aber unbrauchbar ist
 */
export async function baueKette(optionen: KetteOptionen = {}): Promise<Kette> {
  const pfad = optionen.einstellungenPfad ?? unserPfad()
  const einstellungen = await ladeEinstellungen(pfad)
  const schluessel = optionen.schluessel ?? (() => process.env[UMWELT_SCHLUESSEL])
  const anbieter = openrouter({
    schluessel,
    modelle: modelleFuer(einstellungen, ANBIETER_ID),
  })

  // **Der zweite Anbieter — und warum er ohne Wahl trotzdem gebaut wird.** Er wird gebaut,
  // damit die Oberfläche seine Vorschläge und seine Bereitschaft zeigen kann. In die
  // Registratur kommt er nur, wenn für ihn eine Fähigkeit gewählt wurde (`baueAuf` entscheidet
  // das) — sonst stünde er in jeder Eskalationsmeldung, obwohl ihn niemand benutzen wollte.
  const schluesselTypesafe =
    optionen.schluesselTypesafe ?? (() => process.env[UMWELT_TYPESAFE])
  const typesafeModell = modelleFuer(einstellungen, ANBIETER_TYPESAFE)['entscheiden']
  const typesafeAnbieter = typesafe({
    schluessel: schluesselTypesafe,
    ...(typesafeModell === undefined ? {} : { modell: typesafeModell }),
  })

  const aufbau = baueAuf({ einstellungen, anbieter: [anbieter, typesafeAnbieter] })
  return {
    aufbau,
    einstellungen,
    anbieter,
    weitere: [typesafeAnbieter],
    pfad,
    hatSchluessel: async () => {
      const wert = await schluessel()
      return typeof wert === 'string' && wert.trim() !== ''
    },
    hatSchluesselTypesafe: async () => {
      const wert = await schluesselTypesafe()
      return typeof wert === 'string' && wert.trim() !== ''
    },
  }
}

/** Die Fähigkeiten, die dieses Plugin überhaupt bedienen kann — ohne `gespraech`. */
export const FLAECHEN_FAEHIGKEITEN: readonly Faehigkeit[] = [
  'entscheiden',
  'text-zu-sprache',
  'sprache-zu-text',
  'einbetten',
  'bild',
]
