/**
 * `pmh-status` — das erste echte Plugin-Unit.
 *
 * **Was es tut.** Es hängt sich in die Laufzeit ein und legt zwei **lesende**
 * Wege an: den Zustand der aktiven Generation und seine eigene Auskunft. Beim
 * Abstecken meldet es beide wieder ab.
 *
 * **Warum genau das der richtige erste Test ist.** Ein Plugin, das nur „Hallo"
 * sagt, beweist das Laden, aber nicht das Abstecken. Ein Plugin, das einen
 * **Seiteneffekt** anlegt und ihn in einer Absteck-Funktion wieder entfernt,
 * beweist beides — und ist damit der einzige ehrliche Beleg für den Takt `hot`
 * (siehe `unit.json` und `docs/design/harness-generationen.md` §2.3).
 *
 * **Warum keine `import`-Anweisung auf ein anderes Paket.** `units/` steht
 * **nicht** im Bun-Arbeitsbereich (`units/README.md`), und ein Plugin, das fremde
 * Pakete braucht, wäre beim Empfänger nicht lauffähig. Dieses Unit trägt sich
 * selbst: es beschreibt die Fläche, die es erwartet, strukturell und in
 * `README.md`.
 *
 * @module units/pmh-status
 */

/** Was eine Anfrage an einen Weg mitbringt. */
export interface WegAnfrage {
  readonly method: string
  readonly pfad: string
  readonly query: Readonly<Record<string, string>>
}

/** Was ein Weg zurückgibt. `koerper` wird als JSON ausgeliefert. */
export interface WegAntwort {
  readonly status: number
  readonly koerper?: unknown
}

/** Ein Weg-Handler. */
export type WegHandler = (anfrage: WegAnfrage) => WegAntwort | Promise<WegAntwort>

/**
 * Das Register, in das ein Plugin seine Wege einträgt.
 *
 * **Der Vertrag, den der Host schuldet:** `registriere` liefert eine Funktion,
 * die den Weg wieder abmeldet. Ohne diese Rückgabe wäre ein Plugin nicht
 * absteckbar — und `reload: "hot"` eine Behauptung.
 */
export interface Wegregister {
  registriere(pfad: string, handler: WegHandler): () => void
}

/** Die Fläche, die der Host dem Plugin reicht. */
export interface HostFlaeche {
  readonly contract: string
  readonly services: Readonly<Record<string, unknown>>
}

/** Der Name, unter dem dieses Plugin in der Buchführung steht. */
export const NAME = 'pmh-status'

/** Die Fassung dieses Plugins — unabhängig von `unit.json` nachprüfbar. */
export const VERSION = '0.1.0'

/** Wo die beiden Wege liegen. */
export const WEG_ZUSTAND = '/api/pmh/gen/status'
export const WEG_AUSKUNFT = '/api/pmh/plugin/info'

/**
 * Liest den Generationszustand aus den Diensten des Hosts.
 *
 * Fehlt der Dienst, wird das **gesagt** und nicht erfunden: ein Plugin, das einen
 * leeren Zustand als Erfolg ausgibt, macht aus einer fehlenden Verdrahtung eine
 * grüne Antwort.
 */
async function zustandLesen(host: HostFlaeche): Promise<unknown> {
  const dienst = host.services.zustand
  if (typeof dienst !== 'function') {
    return {
      fehlt: 'dienst',
      hinweis: 'Der Host hat keinen Dienst "zustand" gereicht; der Generationszustand ist damit unbekannt.',
    }
  }
  try {
    return await (dienst as () => unknown | Promise<unknown>)()
  }
  catch (fehler) {
    return { fehler: (fehler as Error).message }
  }
}

/**
 * Hängt das Plugin ein.
 *
 * **Fail-closed beim Einhängen, fail-open beim Anfragen.** Fehlt das Register,
 * wirft `apply` — ein eingehängtes Plugin, das nichts anbietet, wäre schlimmer
 * als ein abgewiesenes. Scheitert dagegen später die Auskunft, antwortet der Weg
 * mit einem Fehler **im Körper** und nicht mit einem Absturz.
 *
 * @param host - die Fläche des Hosts
 * @returns die Absteck-Funktion, die beide Wege wieder abmeldet
 */
export function apply(host: HostFlaeche): () => void {
  const register = host.services.routen
  if (register === undefined || register === null || typeof (register as Wegregister).registriere !== 'function') {
    throw new Error(
      `${NAME}: der Host hat kein Dienst-Register "routen" gereicht. Ohne Register kann dieses Plugin nichts anbieten — ` +
        'und ein eingehängtes Plugin ohne Angebot ist schlimmer als ein abgewiesenes.',
    )
  }
  const routen = register as Wegregister

  const abmelden = [
    routen.registriere(WEG_ZUSTAND, async () => ({
      status: 200,
      koerper: {
        plugin: NAME,
        generation: await zustandLesen(host),
      },
    })),
    routen.registriere(WEG_AUSKUNFT, () => ({
      status: 200,
      koerper: {
        plugin: NAME,
        version: VERSION,
        vertrag: host.contract,
        wege: [WEG_ZUSTAND, WEG_AUSKUNFT],
      },
    })),
  ]

  // Die Absteck-Funktion: sie meldet **beide** Wege ab. Wird einer davon nicht
  // abgemeldet, bliebe nach einem Wechsel ein Weg stehen, den niemand mehr
  // bedient — und genau das ist der Unterschied zwischen "hot" und "behauptet hot".
  return () => {
    for (const funktion of abmelden) funktion()
  }
}
