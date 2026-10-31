/**
 * Der Prüfrahmen — ein kleiner HTTP-Rahmen, in den Plugins ihre Wege legen.
 *
 * **Was das ist und was es nicht ist.** Es ist **kein** Ersatz für den
 * Webserver des Cores und **kein** Produktionsserver. Es ist der Rahmen, in dem
 * ein Plugin-Unit **ohne den Core** beweisbar läuft: dieselbe Form von Vertrag
 * (`services.routen` mit `registriere` → Abmelde-Funktion), derselbe Weg über
 * echtes HTTP. Damit ist „das Plugin hängt sich ein und bietet etwas an" eine
 * messbare Aussage und nicht eine Behauptung über einen Prozess, den niemand
 * gestartet hat.
 *
 * **Vier Eigenschaften, die bewußt so sind:**
 *
 *  - **Nur `127.0.0.1`.** Ein Rahmen, der auf `0.0.0.0` lauscht, ist ein offenes
 *    Tor mit einem Prüfprotokoll daneben.
 *  - **Nur genaue Wege, keine Muster.** Ein Muster-Abgleich (`/api/*`) wäre eine
 *    zweite Zuständigkeitsregel neben der des Cores — und die erste, die
 *    jemand falsch versteht.
 *  - **Jede Antwort ist JSON, jede Ablehnung nennt einen Grund.** Ein leerer
 *    404 ohne Körper ist eine Auskunft über nichts.
 *  - **Port 0 heißt: das Betriebssystem wählt.** Für Prüfungen und für den
 *    Schattenport eines kalten Wechsels (harness-generationen.md §4.2).
 *
 * @module @prometheus-harness/unit-system/rahmen
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

/** Was ein Weg an Anfrage sieht. */
export interface RahmenAnfrage {
  readonly method: string
  readonly pfad: string
  readonly query: Readonly<Record<string, string>>
}

/** Was ein Weg zurückgibt. */
export interface RahmenAntwort {
  readonly status: number
  readonly koerper?: unknown
  readonly kopfzeilen?: Readonly<Record<string, string>>
}

/** Ein Weg-Handler. */
export type RahmenHandler = (anfrage: RahmenAnfrage) => RahmenAntwort | Promise<RahmenAntwort>

/** Das Register, in das Plugins ihre Wege legen. */
export interface Routenregister {
  /**
   * Meldet einen Weg an und liefert die Abmelde-Funktion.
   *
   * Ein zweiter Eintrag auf denselben Weg ist **ein Fehler** und kein
   * Überschreiben: zwei Plugins, die dieselbe Zeile bedienen, sind ein Konflikt
   * und keine Priorisierung.
   */
  registriere(pfad: string, handler: RahmenHandler): () => void
  /** Die belegten Wege, sortiert. */
  liste(): readonly string[]
  /** Der Handler eines Weges, falls belegt. */
  finde(pfad: string): RahmenHandler | undefined
}

/** Ein laufender Rahmen. */
export interface Rahmen {
  readonly routen: Routenregister
  readonly port: number
  readonly url: string
  /** Beendet den Rahmen. Idempotent. */
  stoppe(): Promise<void>
}

/** Ein leeres Register. */
export function erstelleRouten(): Routenregister {
  const wege = new Map<string, RahmenHandler>()
  return {
    registriere(pfad, handler) {
      if (pfad.length === 0 || !pfad.startsWith('/')) {
        throw new Error(`Ein Weg muß mit "/" beginnen, bekommen: "${pfad}".`)
      }
      if (wege.has(pfad)) {
        throw new Error(`Der Weg "${pfad}" ist bereits belegt. Zwei Plugins auf einer Zeile sind ein Konflikt.`)
      }
      wege.set(pfad, handler)
      return () => {
        // Nur abmelden, was **dieser** Aufruf angemeldet hat: hat inzwischen ein
        // anderer den Weg belegt, darf die alte Abmelde-Funktion ihn nicht
        // mitnehmen. Das ist der Unterschied zwischen Aufräumen und Kahlschlag.
        if (wege.get(pfad) === handler) wege.delete(pfad)
      }
    },
    liste() {
      return [...wege.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    },
    finde(pfad) {
      return wege.get(pfad)
    },
  }
}

function zerlegeQuery(url: string): { readonly pfad: string; readonly query: Readonly<Record<string, string>> } {
  const fragezeichen = url.indexOf('?')
  const pfad = fragezeichen === -1 ? url : url.slice(0, fragezeichen)
  const query: Record<string, string> = {}
  if (fragezeichen !== -1) {
    for (const paar of url.slice(fragezeichen + 1).split('&')) {
      if (paar.length === 0) continue
      const gleich = paar.indexOf('=')
      const schluessel = decodeURIComponent(gleich === -1 ? paar : paar.slice(0, gleich))
      const wert = gleich === -1 ? '' : decodeURIComponent(paar.slice(gleich + 1))
      query[schluessel] = wert
    }
  }
  return { pfad, query }
}

function sende(response: ServerResponse, antwort: RahmenAntwort): void {
  const koerper = antwort.koerper === undefined ? '' : `${JSON.stringify(antwort.koerper)}\n`
  response.writeHead(antwort.status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...antwort.kopfzeilen,
  })
  response.end(koerper)
}

/**
 * Startet den Prüfrahmen.
 *
 * @param optionen - Port (0 = das Betriebssystem wählt) und Adresse
 * @returns der laufende Rahmen; `stoppe()` gibt den Port wieder frei
 */
export async function starteRahmen(optionen: { readonly port?: number; readonly adresse?: string } = {}): Promise<Rahmen> {
  const routen = erstelleRouten()
  const adresse = optionen.adresse ?? '127.0.0.1'

  const server: Server = createServer((anfrage: IncomingMessage, antwort: ServerResponse) => {
    void (async () => {
      try {
        const { pfad, query } = zerlegeQuery(anfrage.url ?? '/')
        const handler = routen.finde(pfad)
        if (handler === undefined) {
          sende(antwort, {
            status: 404,
            koerper: { fehler: 'kein-weg', pfad, belegt: routen.liste() },
          })
          return
        }
        sende(antwort, await handler({ method: anfrage.method ?? 'GET', pfad, query }))
      }
      catch (fehler) {
        sende(antwort, {
          status: 500,
          koerper: { fehler: 'handler', meldung: (fehler as Error).message },
        })
      }
    })()
  })

  await new Promise<void>((fertig, scheitern) => {
    server.once('error', scheitern)
    server.listen(optionen.port ?? 0, adresse, () => {
      server.removeListener('error', scheitern)
      fertig()
    })
  })

  const griff = server.address()
  const port = typeof griff === 'object' && griff !== null ? griff.port : 0
  let gestoppt = false

  return {
    routen,
    port,
    url: `http://${adresse}:${String(port)}`,
    async stoppe() {
      if (gestoppt) return
      gestoppt = true
      await new Promise<void>((fertig) => server.close(() => fertig()))
    },
  }
}
