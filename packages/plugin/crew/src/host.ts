/**
 * Die Host-Verdrahtung — aus dem gespeicherten Stand wird der laufende Adapter.
 *
 * ## Warum das eine eigene Datei ist
 *
 * `server.ts` spricht HTTP: Status, Rumpf, Kekse. Hier wird **nichts** beantwortet, hier wird
 * eingehängt. Getrennt ist das prüfbar: ein nachgebauter Kontext genügt, um zu sehen, welche
 * Crews der Adapter bekommt und ob die Werkzeuge an- oder abgemeldet werden.
 *
 * ## Woher der Betriebsnutzer kommt
 *
 * Der Kern reicht einem Werkzeug **keine** Sitzung und **keinen** Nutzer
 * (`ToolRunContext.agent.id` ist eine Sitzungskennung, die heute auf kein Konto zeigt). Werkzeuge
 * und Buchung brauchen aber genau ein Konto. Deshalb gilt dieselbe Regel wie im alten Plugin:
 * **ein** Konto, sonst nichts — bei mehreren wäre jede Wahl geraten.
 *
 * ## Was der Adapter bekommt, wenn es mehrere Konten gibt
 *
 * **Nichts.** Nicht „irgendein" Konto: die Buchung liefe auf einen Namen, der nicht der Aufrufer
 * ist. Die Oberfläche bleibt in diesem Fall stehen (jedes Konto sieht seine Crews), der Host
 * bedient sie nicht. Das steht als Grund im Protokoll und in der Antwort der Route.
 *
 * @module @prometheus-harness/crew/verdrahtung
 */

import { join } from 'node:path'

import { applyMitKonfiguration, type HostKontext, type Konfiguration } from '@prometheus-harness/crew-plugin'
import type { Crewdatensatz, Nutzerstand } from '@prometheus-harness/crew-store'
import { projektbereich, CrewZustandSpeicher, type CrewZustand } from '@prometheus-harness/crew-plan'

/**
 * Was der Kern an Diensten reicht.
 *
 * **Warum nur ein anderer Name.** Die Form ist die von `crew-plugin` — dieselbe Naht, dieselben
 * Dienste. Zwei Deklarationen derselben Form wären zwei Stellen, an denen ein neuer Dienst fehlt.
 */
export type Hostschicht = HostKontext

/** Das Feld, aus dem die Konfiguration gebaut wird. */
export interface Betriebsfeld {
  /** Das eine Konto, dem Werkzeuge und Buchung gehören; `null` heißt: nur Modelle. */
  readonly nutzer: string | null
  /** Die Wurzel der Plandokumente (das `crew`-Verzeichnis). */
  readonly verzeichnis: string
  /** Die Crews **aller** aktiven Konten — die Modellliste des einen Adapters. */
  readonly crews: readonly Crewdatensatz[]
  /** Der Stand des Betriebskontos (Standard-Crew und Projekt). */
  readonly stand: Nutzerstand
}

/**
 * Baut die Konfiguration für den Adapter.
 *
 * **Ohne Betriebskonto bleiben die Modelle.** Der Adapter bekommt alle aktiven Crews; Werkzeuge
 * und Buchung entfallen (`nurAdapter`). Das ist die ehrliche Antwort auf „mehrere Konten, keine
 * Sitzung im Werkzeug": die Modelle sind für alle da, die Abrechnung nicht für einen geratenen.
 *
 * @param feld - Betriebskonto (oder `null`), Crews und Stand
 * @returns die Konfiguration, oder `undefined`, wenn keine Crew übrig bleibt
 */
export function konfigurationAus(feld: Betriebsfeld): Konfiguration | undefined {
  if (feld.crews.length === 0) return undefined
  const standard = feld.stand.standard !== null && feld.crews.some((crew) => crew.id === feld.stand.standard)
    ? feld.stand.standard
    : feld.crews[0]?.id
  if (standard === undefined) return undefined
  const crews = feld.crews.map((crew) => ({ ...crew, rollen: { ...crew.rollen } }))
  if (feld.nutzer === null) {
    return { crews, crew: standard, nutzer: '', verzeichnis: feld.verzeichnis, nurAdapter: true }
  }
  return {
    crews,
    crew: standard,
    nutzer: feld.nutzer,
    verzeichnis: feld.verzeichnis,
    ...(feld.stand.projekt === null ? {} : { projekt: feld.stand.projekt }),
  }
}

/**
 * Hängt Adapter, Werkzeuge und Buchung ein — und meldet zurück, ob es geschah.
 *
 * **Ein Wurf wird zur Meldung, nicht zum Absturz.** Der Loader läßt den Host weiterlaufen, wenn
 * ein Eintrag nicht aktiviert; hier ist das Plugin aber schon aktiv. Eine unbrauchbare Crew beim
 * **Umschalten** soll die laufende Verdrahtung nicht mitnehmen — die alte bleibt stehen.
 *
 * @param ctx - der Kern-Kontext
 * @param konfiguration - das, was eingehängt werden soll
 * @param melde - wohin ein Fehler geht
 * @returns die Abmelde-Funktion, oder `undefined`, wenn nichts eingehängt wurde
 */
export function haengeEin(
  ctx: Hostschicht,
  konfiguration: Konfiguration | undefined,
  melde: (meldung: string) => void,
): (() => void) | undefined {
  if (konfiguration === undefined) return undefined
  // **Ohne `effect`.** `applyMitKonfiguration` meldet seine Abmeldung sonst selbst am Kontext an —
  // und bei jedem Speichern entstünde ein weiterer Zuhörer, der nie zurückgenommen wird. Die
  // Abmeldung gehört hierher: eine Verdrahtung, die ersetzt wird, wird vorher abgemeldet.
  const ohneEffekt: Hostschicht = {
    llm: ctx.llm,
    tools: ctx.tools,
    on: (event, listener) => ctx.on(event, listener),
    ...(ctx.logger === undefined ? {} : { logger: ctx.logger }),
  }
  try {
    return applyMitKonfiguration(ohneEffekt, konfiguration)
  } catch (fehler) {
    melde(`die Crew wurde nicht eingehaengt: ${fehler instanceof Error ? fehler.message : String(fehler)}`)
    return undefined
  }
}

/** Der Plan eines Kontos, wie ihn die Oberfläche zeigt. */
export interface Plansicht {
  readonly crew: string
  readonly rollen: readonly {
    readonly rolle: string
    readonly ziel?: { readonly text: string; readonly stand: string }
    readonly aufgaben: readonly { readonly text: string; readonly stand: string }[]
  }[]
}

/**
 * Liest den Plan eines Kontos aus demselben Speicher, in den die Werkzeuge schreiben.
 *
 * **Warum derselbe Speicher.** Zwei Leser mit zwei Wurzeln wären zwei Wahrheiten. Die Wurzel ist
 * `<crew-Verzeichnis>/<nutzer>/<crew>/<projekt>.json`; der Nutzer ist die Kontokennung (eine UUID
 * erfüllt das Muster für ein Pfadsegment), das Projekt kommt aus den Einstellungen.
 *
 * @param verzeichnis - die Wurzel
 * @param nutzer - das Konto (uuid)
 * @param crew - die Crew, deren Plan gelesen wird
 * @param projekt - der Projektpfad aus den Einstellungen
 * @returns die Sicht; leer, wenn noch kein Plan geschrieben wurde
 */
export async function planLesen(
  verzeichnis: string,
  nutzer: string,
  crew: string,
  projekt: string | null,
): Promise<Plansicht> {
  const speicher = new CrewZustandSpeicher({ verzeichnis })
  const bereich = projektbereich({
    nutzer,
    ...(projekt === null ? {} : { pfad: projekt }),
  })
  const zustand: CrewZustand = await speicher.lesen(crew, bereich)
  const rollen = Object.entries(zustand.rollen).flatMap(([rolle, feld]) =>
    feld === undefined
      ? []
      : [{
          rolle,
          ...(feld.ziel === undefined
            ? {}
            : { ziel: { text: feld.ziel.text, stand: feld.ziel.stand } }),
          aufgaben: feld.aufgaben.map((aufgabe) => ({ text: aufgabe.text, stand: aufgabe.stand })),
        }],
  )
  return { crew, rollen }
}

/**
 * Die Wurzel der Plandokumente zu einem Home.
 *
 * @param home - das Harness-Home
 * @returns `<home>/crew`
 */
export function planwurzel(home: string): string {
  return join(home, 'crew')
}
