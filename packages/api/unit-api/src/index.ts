/**
 * `@prometheus-harness/unit-api` — der **Bootstrap** des Plugin-Managers im Host.
 *
 * ## Warum es dieses Paket geben muß, und warum es so klein ist
 *
 * Der Core liest seine Komposition **ausschließlich** aus dem Profil
 * (`dsh.profile.bundles` + `cordis.patch.yml`). Ein Unit kann sich nicht selbst
 * eintragen — das steht wörtlich in `harness/pmh-plugins/README.md`
 * („Ein Plugin-Paket kann sich nicht selbst in ein Profil eintragen; es wird
 * eingetragen").
 *
 * Daraus folgt die eine Zeile, die keine Architektur wegzaubert: **irgend etwas
 * muß im Profil stehen, damit der Manager überhaupt startet.** NixOS hat
 * dasselbe Problem — der Bootloader ist nicht Teil einer Generation, sonst gäbe
 * es den Fall „niemand kann mehr umschalten"
 * (`docs/design/harness-generationen.md` §4.4).
 *
 * Dieses Paket ist diese eine Zeile. **Alles Weitere kommt aus `.pmh/`** und
 * nicht aus einer Liste im Code.
 *
 * ## Die zwei Entscheidungen, die den Entwurf bestimmen
 *
 * **1. Gelesen wird die Platte, nicht der Speicher.** Der Zustand liegt in
 * `.pmh/current`, `.pmh/next` und `.pmh/generations/*`. Ein Dienst, der ihn beim
 * Start in eine Variable liest, meldet nach dem ersten Wechsel den alten Stand —
 * und ein Endpunkt, der veraltete Zustände meldet, ist schlimmer als keiner.
 *
 * **2. Die teure Prüfung nur auf Anfrage.** `/status` liefert den
 * **gespeicherten** Stand (Zeiger, Fingerabdruck, Takt, Anzahl der Units) — das
 * sind ein paar Dateilesevorgänge. Die **Drift**-Prüfung dagegen löst den ganzen
 * Abschluß auf und hasht jeden Unit-Ordner. Sie läuft nur bei `?drift=1`, sonst
 * würde ein Endpunkt, den eine Oberfläche im Sekundentakt abfragt, genau die
 * Last erzeugen, deren Ergebnis er meldet.
 *
 * ## Was dieses Paket NICHT tut
 *
 * Es **schaltet nichts**. Kein `switch`, kein `rollback`, kein `build` über HTTP.
 * Ein schreibender Weg verlangt eine Freigabe (Einbahnstraßen, Schema-Wechsel)
 * und gehört hinter eine Oberfläche mit Bestätigung — nicht hinter einen
 * GET-Handler, den ein Agent versehentlich aufrufen kann.
 *
 * @module @prometheus-harness/unit-api
 */

import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'

import {
  layoutFor,
  leseGeneration,
  leseZeiger,
  liste,
  vergleiche,
  zustand,
  type GenerationRecord,
  type StateLayout,
} from '@prometheus-harness/unit-system'

/**
 * Der Cordis-Name dieses Plugins.
 *
 * Er steht in der Patch-Zeile des Profils. Steht hier etwas anderes, sucht man
 * den Fehler an der falschen Stelle — dieselbe Falle, die `health` im
 * Dateikopf beschreibt.
 */
export const name = 'pmh-unit-api'

/** Ohne den Webserver gäbe es nichts zu registrieren. */
export const inject = ['webServer']

/** Der lesende Weg zum Zustand. */
export const STATUS_PATH = '/api/pmh/gen/status'

/** Der lesende Weg zur Generationsliste. */
export const LIST_PATH = '/api/pmh/gen/list'

/** Der Name, den die Antworten über sich selbst nennen. */
export const SERVICE_NAME = '@prometheus-harness/unit-api'

/** Die Fassung dieses Pakets (eine Prüfung vergleicht sie mit `package.json`). */
export const SERVICE_VERSION = '0.1.0'

/** Woher das Projekt und der Zustandsordner kommen. */
export interface UnitApiOptionen {
  /** Die Projektwurzel; ohne Angabe `PMH_PROJECT_ROOT`, sonst das Arbeitsverzeichnis. */
  readonly projectRoot?: string
  /** Der Zustandsordner relativ zur Wurzel; Vorgabe `.pmh`. */
  readonly stateDir?: string
}

/**
 * Ermittelt die Projektwurzel — in **dieser** Reihenfolge und mit Absicht.
 *
 * `PMH_PROJECT_ROOT` steht vor dem Arbeitsverzeichnis, weil der Host aus einem
 * beliebigen Ordner gestartet werden kann; ein relativer Rückfall würde dann
 * einen **anderen** Zustand lesen und das Ergebnis sähe trotzdem richtig aus.
 */
export function projektWurzel(optionen: UnitApiOptionen = {}): string {
  if (optionen.projectRoot !== undefined) return resolve(optionen.projectRoot)
  const ausUmgebung = process.env['PMH_PROJECT_ROOT']
  if (ausUmgebung !== undefined && ausUmgebung.trim().length > 0) return resolve(ausUmgebung)
  return resolve(process.cwd())
}

/** Die Fassung des Zustands, die keine teure Prüfung braucht. */
export interface ZustandsAuszug {
  readonly dienst: string
  readonly fassung: string
  readonly projekt: string
  /** Die aktive Generation, `null` = Generation 0. */
  readonly current: AuszugsEintrag | null
  /** Die vorgemerkte Generation. */
  readonly next: AuszugsEintrag | null
  /** Was zwischen beiden liegt — leer, wenn beide gleich sind. */
  readonly ausstehend: readonly { readonly name: string; readonly art: string }[]
  /** Der Takt, den ein Wechsel auf `next` mindestens bräuchte. */
  readonly benoetigt: string
  /** `true`, wenn der Wechsel eine Einbahnstraße wäre. */
  readonly irreversible: boolean
  /** Der Drift-Befund — nur gefüllt, wenn er ausdrücklich gefragt wurde. */
  readonly drift?: { readonly angefragt: false } | { readonly angefragt: true; readonly hatDrift: boolean; readonly aenderungen: readonly { readonly name: string; readonly art: string }[] }
}

/** Die Kurzform einer Generation für die Auskunft. */
export interface AuszugsEintrag {
  readonly number: number
  readonly createdAt: string
  readonly fingerprint: string
  readonly takt: string
  readonly irreversible: boolean
  readonly schema: number | null
  readonly units: number
}

function auszug(generation: GenerationRecord | undefined): AuszugsEintrag | null {
  if (generation === undefined) return null
  return {
    number: generation.number,
    createdAt: generation.createdAt,
    fingerprint: generation.fingerprint,
    takt: generation.takt,
    irreversible: generation.irreversible,
    schema: generation.schema,
    units: generation.units.length,
  }
}

/**
 * Baut den Zustandsauszug aus der **Platte**.
 *
 * **Warum `leseGeneration` mit `.catch`:** eine Generation, deren Datei unlesbar
 * ist, darf den Endpunkt nicht umbringen — sie wird als `null` gemeldet, und die
 * Auskunft sagt damit die Wahrheit („ich kann sie nicht lesen") statt gar nichts.
 * Ein 500 an dieser Stelle wäre eine Auskunft über den Endpunkt, nicht über den
 * Zustand.
 */
export async function zustandsAuszug(
  layout: StateLayout,
  mitDrift: boolean,
): Promise<ZustandsAuszug> {
  const currentNummer = await leseZeiger(layout, 'current')
  const nextNummer = await leseZeiger(layout, 'next')
  const current = currentNummer === undefined ? undefined : await leseGeneration(layout, currentNummer).catch(() => undefined)
  const next = nextNummer === undefined ? undefined : await leseGeneration(layout, nextNummer).catch(() => undefined)
  const unterschied = vergleiche(current, next)

  const auszugEines: ZustandsAuszug = {
    dienst: SERVICE_NAME,
    fassung: SERVICE_VERSION,
    projekt: layout.projectRoot,
    current: auszug(current),
    next: auszug(next),
    ausstehend: unterschied.aenderungen.map((aenderung) => ({ name: aenderung.name, art: aenderung.art })),
    benoetigt: unterschied.benoetigt,
    irreversible: unterschied.irreversible,
  }

  if (!mitDrift) return { ...auszugEines, drift: { angefragt: false } }

  // **Die teure Prüfung.** Sie löst den Abschluß auf und hasht jeden Unit-Ordner.
  // Deshalb steht sie hinter einem eigenen Schalter und nicht im Vorgabeweg.
  const bericht = await zustand({ projectRoot: layout.projectRoot })
  return {
    ...auszugEines,
    drift: {
      angefragt: true,
      hatDrift: bericht.hatDrift,
      aenderungen: (bericht.drift?.aenderungen ?? []).map((aenderung) => ({ name: aenderung.name, art: aenderung.art })),
    },
  }
}

/**
 * Fragt die Anmelde- und Zaunprüfung des Hosts — dieselbe Form wie `health`.
 *
 * Fehlt der Verbindungsdienst, wird **verweigert** (503) und nicht durchgelassen:
 * ein Zustandsendpunkt ohne Anmeldung ist der teurere Fehler.
 */
export function abweisung(
  ctx: Context,
  headers: IncomingHttpHeaders,
): number | undefined {
  const verbindung = ctx.get('connection') as
    | { requestRejection?: (request: { headers: IncomingHttpHeaders }) => number | undefined }
    | undefined
  if (verbindung === undefined || typeof verbindung.requestRejection !== 'function') {
    return 503
  }
  return verbindung.requestRejection({ headers })
}

function sendJson(res: ServerResponse, status: number, koerper: unknown): void {
  const roh = Buffer.from(JSON.stringify(koerper), 'utf8')
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(roh.byteLength))
  res.setHeader('Cache-Control', 'no-store')
  res.end(roh)
}

/**
 * Der Handler von `/api/pmh/gen/status`.
 *
 * Reihenfolge: erst die Sperre, dann die Methode, dann die Arbeit. Wer nicht
 * angemeldet ist, erfährt nicht einmal, welche Methoden die Adresse kennt.
 */
export function macheStatusHandler(
  ctx: Context,
  layout: StateLayout,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const abgelehnt = abweisung(ctx, req.headers)
    if (abgelehnt !== undefined) {
      sendJson(res, abgelehnt, { fehler: abgelehnt === 401 ? 'unauthenticated' : abgelehnt === 403 ? 'untrusted_origin' : 'unavailable' })
      return
    }
    const methode = req.method ?? 'GET'
    if (methode !== 'GET' && methode !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      sendJson(res, 405, { fehler: 'method_not_allowed', allow: ['GET', 'HEAD'] })
      return
    }
    void (async () => {
      try {
        const frage = (req.url ?? '').includes('drift=1')
        sendJson(res, 200, await zustandsAuszug(layout, frage))
      }
      catch (fehler) {
        sendJson(res, 500, { fehler: 'zustand_nicht_lesbar', grund: (fehler as Error).message })
      }
    })()
  }
}

/** Der Handler von `/api/pmh/gen/list`. */
export function macheListenHandler(
  ctx: Context,
  layout: StateLayout,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const abgelehnt = abweisung(ctx, req.headers)
    if (abgelehnt !== undefined) {
      sendJson(res, abgelehnt, { fehler: abgelehnt === 401 ? 'unauthenticated' : abgelehnt === 403 ? 'untrusted_origin' : 'unavailable' })
      return
    }
    const methode = req.method ?? 'GET'
    if (methode !== 'GET' && methode !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      sendJson(res, 405, { fehler: 'method_not_allowed', allow: ['GET', 'HEAD'] })
      return
    }
    void (async () => {
      try {
        const eintraege = await liste({ projectRoot: layout.projectRoot })
        sendJson(res, 200, { dienst: SERVICE_NAME, generationen: eintraege })
      }
      catch (fehler) {
        sendJson(res, 500, { fehler: 'liste_nicht_lesbar', grund: (fehler as Error).message })
      }
    })()
  }
}

/**
 * Hängt die beiden lesenden Wege ein.
 *
 * **`ctx.effect` und nicht `ctx.on('dispose')`.** Cordis kennt kein
 * `dispose`-**Ereignis**; der Listener würde beim Abhängen bloß mitentsorgt, und
 * die Routen blieben stehen. Der Fehler steht ausgeschrieben in
 * `packages/api/health/src/index.ts` — er ist dort gemessen worden, nicht
 * vermutet.
 */
export function apply(ctx: Context, optionen: UnitApiOptionen = {}): void {
  const layout = layoutFor(projektWurzel(optionen), optionen.stateDir)

  ctx.effect(() => {
    const status: WebRoute = { kind: 'exact', path: STATUS_PATH, handler: macheStatusHandler(ctx, layout) }
    const listeWeg: WebRoute = { kind: 'exact', path: LIST_PATH, handler: macheListenHandler(ctx, layout) }
    const ab = [ctx.webServer.register(status), ctx.webServer.register(listeWeg)]
    return () => {
      for (const einer of ab.reverse()) einer()
    }
  }, `${name} ${STATUS_PATH} ${LIST_PATH}`)
}

export default apply
