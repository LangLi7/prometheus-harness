/**
 * Die Datenschicht des Ordnerdialogs — die vier Wege, **rein** und ohne Host.
 *
 * ## Der Vertrag, nachgesehen statt erfunden
 *
 * Alle Angaben stammen aus `packages/api/auth-http/src/folders.ts` und `paths.ts`:
 *
 * | Weg | Körper | Antwort |
 * |---|---|---|
 * | `GET  /api/pmh/ordner?workspace=<id>` | — | die Ordner **und** die Zugriffspfade |
 * | `POST /api/pmh/ordner/anlegen` | `workspaceId`, `pfad`, `zugriff?`, `bezeichnung?` | der neue Ordner |
 * | `POST /api/pmh/ordner/zugriff` | `id`, `zugriff` | `{id, zugriff}` |
 * | `POST /api/pmh/ordner/entfernen` | `id` | — |
 *
 * Hülle: Erfolg `{ok: true, value: …}`, Fehler `{ok: false, error: {code, message}}`.
 * Die drei **ändernden** Wege verlangen den Kopf `x-pmh-csrf` — ohne ihn **403 `csrf-fehlt`**.
 *
 * ## Warum der CSRF-Wert eine FUNKTION ist
 *
 * Ein Wert, der beim Aufbau einmal gelesen wird, veraltet: nach einer neuen Anmeldung ist der alte
 * falsch, und **jeder** ändernde Aufruf scheitert mit 403 — an einer Stelle, die niemand mit der
 * Anmeldung in Verbindung bringt. Als Funktion wird er **bei jedem Aufruf** geholt.
 *
 * ## Warum der Netzzugriff hereingereicht wird
 *
 * Damit diese Datei **ohne** Server prüfbar ist: die Prüfung schiebt einen Abruf unter, der
 * mitschreibt, was gesendet wurde. Was hier geprüft wird, ist genau das — der gesendete Auftrag.
 *
 * @module @prometheus-harness/client-source-folders/wege
 */

import type { Ordner } from './dialog.tsx'

/** Die Wege, wie sie der Server führt. */
export const PFAD_ORDNER = '/api/pmh/ordner'
export const PFAD_ORDNER_ANLEGEN = '/api/pmh/ordner/anlegen'
export const PFAD_ORDNER_ZUGRIFF = '/api/pmh/ordner/zugriff'
export const PFAD_ORDNER_ENTFERNEN = '/api/pmh/ordner/entfernen'

/** Der Kopf, den die drei ändernden Wege verlangen. */
export const CSRF_KOPF = 'x-pmh-csrf'

/** Ein austauschbarer Netzzugriff. */
export type Abruf = (adresse: string, einstellung: RequestInit) => Promise<Response>

/** Was die Wege brauchen. */
export interface WegeOptionen {
  /** Woher der CSRF-Wert kommt — **bei jedem Aufruf** neu. */
  readonly csrf: () => string | undefined
  /** Der Netzzugriff. Vorgabe: das eingebaute `fetch`. */
  readonly abruf?: Abruf
}

/** Ein Fehler eines Weges — mit dem **Code des Servers**, nicht mit einem geratenen. */
export class QuellordnerFehler extends Error {
  /**
   * @param meldung - was der Server gesagt hat
   * @param code - sein Fehlercode (`csrf-fehlt`, `pfad-schon-da`, …)
   * @param status - der HTTP-Status
   */
  constructor(
    meldung: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(meldung)
    this.name = 'QuellordnerFehler'
  }
}

/** Was die Liste ergibt: die Ordner und die Pfade, auf die zugegriffen werden darf. */
export interface Ordnerliste {
  readonly ordner: readonly Ordner[]
  readonly wurzeln: readonly string[]
}

/**
 * Liest die Hülle aus — und wirft bei einem Fehler.
 *
 * @param antwort - die Antwort des Servers
 * @param weg - der Weg, für die Meldung
 * @returns der Wert
 * @throws QuellordnerFehler - wenn der Server abgelehnt hat oder die Hülle fremd ist
 */
async function liesHuelle(antwort: Response, weg: string): Promise<unknown> {
  let koerper: unknown
  try {
    koerper = await antwort.json()
  } catch {
    throw new QuellordnerFehler(`${weg}: Die Antwort war kein JSON.`, 'kein-json', antwort.status)
  }
  const huelle = koerper as { ok?: unknown; value?: unknown; error?: { code?: unknown; message?: unknown } }
  if (huelle.ok === true) return huelle.value
  const code = typeof huelle.error?.code === 'string' ? huelle.error.code : 'unbekannt'
  const meldung =
    typeof huelle.error?.message === 'string' ? huelle.error.message : `${weg}: Der Server hat abgelehnt.`
  throw new QuellordnerFehler(meldung, code, antwort.status)
}

/**
 * Baut den Kopf für einen ändernden Aufruf.
 *
 * @param optionen - die Quellen
 * @returns die Kopfzeilen
 * @throws QuellordnerFehler - wenn kein CSRF-Wert da ist (dann wird **gar nicht** gesendet)
 */
function kopfMitCsrf(optionen: WegeOptionen): Record<string, string> {
  const wert = optionen.csrf()
  if (wert === undefined || wert.trim() === '') {
    // **Nicht senden.** Ein Aufruf ohne CSRF gibt 403, und der Fehler sähe wie ein Rechteproblem
    // aus. Hier steht die wahre Ursache.
    throw new QuellordnerFehler(
      'Es ist kein CSRF-Wert da — der ändernde Aufruf wird GAR NICHT gesendet.',
      'csrf-fehlt',
      0,
    )
  }
  return { [CSRF_KOPF]: wert, 'content-type': 'application/json' }
}

/**
 * Die Ordner eines Arbeitsbereichs.
 *
 * @param workspaceId - der Arbeitsbereich
 * @param optionen - CSRF-Quelle und Netzzugriff
 * @returns die Liste
 */
export async function listeOrdner(workspaceId: string, optionen: WegeOptionen): Promise<Ordnerliste> {
  const abruf: Abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung))
  const antwort = await abruf(`${PFAD_ORDNER}?workspace=${encodeURIComponent(workspaceId)}`, {
    method: 'GET',
  })
  const wert = (await liesHuelle(antwort, PFAD_ORDNER)) as {
    ordner?: readonly Ordner[]
    wurzeln?: readonly string[]
  }
  return { ordner: wert.ordner ?? [], wurzeln: wert.wurzeln ?? [] }
}

/**
 * Trägt einen Ordner ein.
 *
 * @param eingabe - Arbeitsbereich, Pfad und was dazugehört
 * @param optionen - CSRF-Quelle und Netzzugriff
 * @returns der neue Ordner
 */
export async function legeOrdnerAn(
  eingabe: {
    readonly workspaceId: string
    readonly pfad: string
    readonly zugriff?: 'lesen' | 'schreiben'
    readonly bezeichnung?: string
  },
  optionen: WegeOptionen,
): Promise<Ordner> {
  const abruf: Abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung))
  const koerper: Record<string, unknown> = { workspaceId: eingabe.workspaceId, pfad: eingabe.pfad }
  // **Fehlendes wird weggelassen, nicht als `undefined` gesendet.** Der Server prüft
  // `daten.zugriff !== undefined` — ein ausdrückliches `undefined` wäre dort nicht zu unterscheiden.
  if (eingabe.zugriff !== undefined) koerper['zugriff'] = eingabe.zugriff
  if (eingabe.bezeichnung !== undefined && eingabe.bezeichnung.trim() !== '') {
    koerper['bezeichnung'] = eingabe.bezeichnung.trim()
  }
  const antwort = await abruf(PFAD_ORDNER_ANLEGEN, {
    method: 'POST',
    headers: kopfMitCsrf(optionen),
    body: JSON.stringify(koerper),
  })
  return (await liesHuelle(antwort, PFAD_ORDNER_ANLEGEN)) as Ordner
}

/**
 * Stellt den Zugriff eines Ordners um.
 *
 * @param id - der Ordner
 * @param zugriff - was gelten soll
 * @param optionen - CSRF-Quelle und Netzzugriff
 * @returns die Bestätigung des Servers
 */
export async function setzeZugriff(
  id: string,
  zugriff: 'lesen' | 'schreiben',
  optionen: WegeOptionen,
): Promise<{ readonly id: string; readonly zugriff: string }> {
  const abruf: Abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung))
  const antwort = await abruf(PFAD_ORDNER_ZUGRIFF, {
    method: 'POST',
    headers: kopfMitCsrf(optionen),
    body: JSON.stringify({ id, zugriff }),
  })
  return (await liesHuelle(antwort, PFAD_ORDNER_ZUGRIFF)) as { id: string; zugriff: string }
}

/**
 * Entfernt einen Zusatzordner.
 *
 * @param id - der Ordner
 * @param optionen - CSRF-Quelle und Netzzugriff
 */
export async function entferneOrdner(id: string, optionen: WegeOptionen): Promise<void> {
  const abruf: Abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung))
  const antwort = await abruf(PFAD_ORDNER_ENTFERNEN, {
    method: 'POST',
    headers: kopfMitCsrf(optionen),
    body: JSON.stringify({ id }),
  })
  await liesHuelle(antwort, PFAD_ORDNER_ENTFERNEN)
}
