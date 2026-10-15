/**
 * `@prometheus-harness/composition` — die Teile zusammenfügen.
 *
 * ## Warum es dieses Paket gibt
 *
 * Nach dem Bau der Teile standen sie **nebeneinander**: `einstellungen` kennt die Wahl des
 * Endnutzers, `openrouter` kann vier Fähigkeiten, `faehigkeiten` hat die Registratur und die
 * Eskalation, `waechter` prüft vor der Tat, `verwalter` hält den Katalog frisch, `lokal` verwahrt
 * Gewichte. **Niemand baute daraus etwas, das man benutzen kann.**
 *
 * Hier steht dieses Zusammenfügen — an **einer** Stelle, damit die drei Regeln, auf die es
 * ankommt, nicht an fünf Stellen nachgebaut werden:
 *
 * | Regel | Warum |
 * |---|---|
 * | Der **Mensch** wird **zuletzt** eingetragen | Der erste einsatzbereite Anbieter gewinnt. Stünde er vorn, entschiede er über alles |
 * | Eine Wahl auf einen **unbekannten Anbieter** wird **gemeldet** | Sonst wählte jemand `zai` für das Einbetten, und nichts geschähe — lautlos |
 * | Ein Anbieter **ohne jede Wahl** wird **nicht** eingetragen | Sonst stünde in der Eskalationsmeldung ein Anbieter, den der Nutzer nie benutzen wollte |
 *
 * **Kein Netz, kein Dateisystem.** Die Anbieter werden **hereingereicht** — dieses Paket baut nur
 * zusammen. Damit ist es ohne Schlüssel und ohne Verbindung prüfbar.
 *
 * @module @prometheus-harness/composition
 */

import {
  Faehigkeiten,
  NAME_DER_FAEHIGKEIT,
  type Anbieter,
  type Faehigkeit,
  type Stufen,
} from '@prometheus-harness/capabilities'
import type { Einstellungen } from '@prometheus-harness/settings'

/**
 * Die Vorgabe-Schwellen, wenn der Endnutzer keine gesetzt hat.
 *
 * **Warum 0,9 und 0,5 und nicht 0,5 und 0,2.** Eine **höhere** Schwelle heißt: es wird seltener
 * gehandelt und **öfter gefragt**. Diese Vorgabe ist damit die **vorsichtige** — sie geht in
 * Richtung „lieber den Menschen fragen". Die andere Richtung still zu wählen, hieße eine
 * Risikotoleranz zu unterstellen, die niemand beschlossen hat.
 *
 * **Sie ist ein Anfang, keine Entscheidung.** Der Aufrufer soll sie in den Einstellungen
 * festlegen; {@link Aufbau.hinweise} sagt es ihm.
 */
export const STUFEN_VORSICHTIG: Stufen = { automatisch: 0.9, rueckfrage: 0.5 }

/** Was zum Aufbau hineingegeben wird. */
export interface Aufbauoptionen {
  /** Die Einstellungen des Endnutzers. */
  readonly einstellungen: Einstellungen
  /** Die Anbieter, die zur Verfügung stehen. */
  readonly anbieter: readonly Anbieter[]
  /**
   * Der menschliche Anbieter — **wird zuletzt eingetragen**.
   *
   * Fehlt er, gibt es keine letzte Instanz: kann kein Anbieter, **wirft** die Registratur. Das ist
   * Absicht — eine Meldung ist besser als ein geratenes Urteil.
   */
  readonly mensch?: Anbieter
}

/** Was der Aufbau ergeben hat. */
export interface Aufbau {
  /** Die einsatzbereite Registratur. */
  readonly faehigkeiten: Faehigkeiten
  /** Die Schwellen, mit denen gearbeitet wird. */
  readonly stufen: Stufen
  /** Welche Anbieter eingetragen wurden, in Eintragsreihenfolge. */
  readonly eingetragen: readonly string[]
  /** Welche Fähigkeiten der Endnutzer gewählt hat. */
  readonly gewaehlt: readonly Faehigkeit[]
  /**
   * Was zu sagen ist — Zeile für Zeile.
   *
   * Hier stehen die drei Fälle, die sonst **lautlos** blieben: eine Wahl auf einen unbekannten
   * Anbieter, ein Anbieter ohne jede Wahl, und fehlende Schwellen.
   */
  readonly hinweise: readonly string[]
}

/**
 * Baut die Registratur aus Einstellungen und Anbietern.
 *
 * @param optionen - Einstellungen, Anbieter und der Mensch
 * @returns der Aufbau
 */
export function baueAuf(optionen: Aufbauoptionen): Aufbau {
  const { einstellungen } = optionen
  const hinweise: string[] = []
  const registratur = new Faehigkeiten()
  const eingetragen: string[] = []

  // Die Kennungen, die der Endnutzer gewählt hat — je Anbieter gesammelt.
  const gewaehltJeAnbieter = new Map<string, Faehigkeit[]>()
  const gewaehlt: Faehigkeit[] = []
  for (const [faehigkeit, wahl] of Object.entries(einstellungen.wahl)) {
    const f = faehigkeit as Faehigkeit
    gewaehlt.push(f)
    const bisher = gewaehltJeAnbieter.get(wahl.anbieter) ?? []
    bisher.push(f)
    gewaehltJeAnbieter.set(wahl.anbieter, bisher)
  }

  // Die angebotenen Anbieter eintragen — aber nur die, für die etwas gewählt wurde.
  for (const anbieter of optionen.anbieter) {
    const fuer = gewaehltJeAnbieter.get(anbieter.id) ?? []
    if (fuer.length === 0) {
      // **Nicht eintragen.** Ein Anbieter ohne jede Wahl meldete für alles „nicht bereit" — und
      // stünde damit in jeder Eskalationsmeldung, obwohl der Nutzer ihn nie benutzen wollte.
      hinweise.push(
        `Der Anbieter „${anbieter.id}" wurde NICHT eingetragen: für ihn ist keine Fähigkeit gewählt.`,
      )
      continue
    }
    registratur.anbieten(anbieter)
    eingetragen.push(anbieter.id)
  }

  // **Und jetzt die Meldung, die sonst fehlt.** Wer `zai` wählt, für den es (noch) keinen Anbieter
  // gibt, bekäme sonst gar nichts: die Wahl wäre gespeichert, und nichts geschähe.
  const angeboten = new Set(optionen.anbieter.map((a) => a.id))
  for (const [id, faehigkeiten] of gewaehltJeAnbieter) {
    if (angeboten.has(id)) continue
    const namen = faehigkeiten.map((f) => NAME_DER_FAEHIGKEIT[f]).join(', ')
    hinweise.push(
      `Für „${id}" ist eine Fähigkeit gewählt (${namen}) — aber es gibt KEINEN Anbieter mit dieser ` +
        'Kennung. Die Wahl bleibt gespeichert und wirkt nicht.',
    )
  }

  // Der Mensch ZULETZT. Der erste einsatzbereite gewinnt; stünde er vorn, entschiede er über alles.
  if (optionen.mensch !== undefined) {
    registratur.anbieten(optionen.mensch)
    eingetragen.push(optionen.mensch.id)
  } else {
    hinweise.push(
      'Es ist KEIN menschlicher Anbieter eingetragen. Kann kein Anbieter eine Fähigkeit bedienen, ' +
        'wirft die Registratur — es wird nichts geraten.',
    )
  }

  const stufen =
    einstellungen.stufen ??
    (() => {
      hinweise.push(
        `Es sind keine Schwellen eingestellt — es gilt die vorsichtige Vorgabe ` +
          `(handeln ab ${String(STUFEN_VORSICHTIG.automatisch)}, nachfragen ab ` +
          `${String(STUFEN_VORSICHTIG.rueckfrage)}). Sie gehören in die Einstellungen.`,
      )
      return STUFEN_VORSICHTIG
    })()

  if (gewaehlt.length === 0) {
    hinweise.push(
      'Es ist für KEINE Fähigkeit ein Modell gewählt. Jede Anfrage geht damit an den Menschen — ' +
        'das ist die vorgesehene Folge, kein Fehler.',
    )
  }

  return { faehigkeiten: registratur, stufen, eingetragen, gewaehlt, hinweise }
}
