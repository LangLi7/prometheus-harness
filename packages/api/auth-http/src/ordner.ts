/**
 * `@prometheus-harness/auth-http/ordner` — die Wege für die **Quellordner** eines Arbeitsbereichs.
 *
 * ## Was hier durchgeht
 *
 * | Weg | Was er tut |
 * |---|---|
 * | `GET  /api/pmh/ordner?workspace=<id>` | die Ordner **und** die Zugriffspfade |
 * | `POST /api/pmh/ordner/anlegen` | einen Ordner eintragen (`istPrimaer`, `zugriff`) |
 * | `POST /api/pmh/ordner/zugriff` | Lesen/Schreiben umstellen |
 * | `POST /api/pmh/ordner/entfernen` | einen Zusatzordner entfernen |
 *
 * **Drei Wege zum Ändern statt eines mit `aktion`-Feld.** Jeder Weg tut genau eine Sache; ein
 * Sammelweg mit einer Zeichenkette darin wäre eine Weiche, die man falsch beschriften kann.
 * Und alle drei gehen über **POST**, weil unser Weg-Macher nur `GET` und `POST` kennt
 * (`http.ts`: `macheWeg`) — ein `PATCH` wäre hier eine Ausnahme ohne Gewinn.
 *
 * ## Zwei Türen, beide nötig
 *
 * 1. **Die Sitzung** (`pmh_session`): ohne sie **401**. Der Mandant kommt **aus der Sitzung**,
 *    nicht aus dem Körper — sonst könnte jeder Aufrufer einen fremden Mandanten nennen.
 * 2. **Der CSRF-Wert** (`x-pmh-csrf`) für die drei ändernden Wege: ohne ihn **403**. Ein
 *    Formular auf einer fremden Seite könnte sonst in unserem Namen Ordner eintragen.
 *
 * ## Warum Datenbankfehler übersetzt werden
 *
 * Der Dialog zeigt an, was der Rechner sagt. Ein roher `PostgresError` wäre für einen Menschen
 * unbrauchbar — und ein `23505` sagt ihm nichts. Deshalb: die drei Fehler, die hier
 * vorkommen können, bekommen deutschen Text; alles andere wird **nicht** beschönigt, sondern
 * als `unerwartet` gemeldet.
 *
 * @module @prometheus-harness/auth-http/ordner
 */

import type { IncomingMessage } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { verifyCsrf, verifySession } from '@prometheus-harness/auth'
import {
  entferneOrdner,
  ladeZugriffspfade,
  legeOrdnerAn,
  listeOrdner,
  setzeZugriff,
  type SqlZugang,
  type Zugriff,
} from '@prometheus-harness/store-postgres'
import { leseKoerper, macheWeg, sende, type Weg } from './http.ts'
import { cookieWert, gut, schlecht, sitzungsCookieName, type Antwort, type Umgebung } from './wege.ts'

/** Die Sammlung der Ordner eines Arbeitsbereichs. */
export const PFAD_ORDNER = '/api/pmh/ordner'

/** Einen Ordner eintragen. */
export const PFAD_ORDNER_ANLEGEN = '/api/pmh/ordner/anlegen'

/** Lesen/Schreiben umstellen. */
export const PFAD_ORDNER_ZUGRIFF = '/api/pmh/ordner/zugriff'

/** Einen Zusatzordner entfernen. */
export const PFAD_ORDNER_ENTFERNEN = '/api/pmh/ordner/entfernen'

/** Der CSRF-Kopf, wie überall. */
const CSRF_KOPFZEILE = 'x-pmh-csrf'

/** Was ein angemeldeter Aufrufer ist. */
interface Handelnder {
  readonly userId: string
  readonly csrfKopf: string | undefined
  /** Der Sitzungsdatensatz — für `verifyCsrf`. */
  readonly session: Parameters<typeof verifyCsrf>[0]
}

/**
 * Prüft die Sitzung.
 *
 * @param umg - die Umgebung
 * @param req - die Anfrage
 * @returns der Handelnde oder die Antwort, die statt seiner geht
 */
async function angemeldet(
  umg: Umgebung,
  req: IncomingMessage,
): Promise<{ readonly ok: true; readonly wer: Handelnder } | { readonly ok: false; readonly antwort: Antwort }> {
  const token = cookieWert(req.headers.cookie, sitzungsCookieName(umg))
  if (token === undefined || token === '') {
    return { ok: false, antwort: schlecht(401, 'nicht-angemeldet', 'Nicht angemeldet.') }
  }
  const geprueft = await verifySession(umg.speicher.sitzungen, token).catch(() => undefined)
  if (geprueft === undefined) {
    return { ok: false, antwort: schlecht(401, 'nicht-angemeldet', 'Nicht angemeldet.') }
  }
  const kopf = req.headers[CSRF_KOPFZEILE]
  return {
    ok: true,
    wer: {
      userId: geprueft.session.userId,
      csrfKopf: typeof kopf === 'string' ? kopf : undefined,
      session: geprueft.session,
    },
  }
}

/**
 * Prüft den CSRF-Wert.
 *
 * @param wer - der Handelnde
 * @returns die Antwort, wenn der Wert fehlt oder nicht stimmt
 */
function csrfFehlt(wer: Handelnder): Antwort | undefined {
  if (verifyCsrf(wer.session, wer.csrfKopf ?? '')) return undefined
  return schlecht(403, 'csrf-fehlt', 'Der CSRF-Wert fehlt oder stimmt nicht.')
}

/**
 * Übersetzt einen Datenbankfehler in eine Meldung für Menschen.
 *
 * @param fehler - was die Datenbank geworfen hat
 * @returns die Antwort
 */
function fehlerAntwort(fehler: unknown): Antwort {
  const code = (fehler as { code?: string }).code ?? ''
  if (code === '23505') {
    return schlecht(409, 'pfad-schon-da', 'Dieser Ordner ist in diesem Arbeitsbereich schon eingetragen.')
  }
  if (code === '23514') {
    return schlecht(400, 'pfad-unbrauchbar', 'Der Pfad muß absolut sein und darf kein „.." enthalten.')
  }
  if (code === '23503') {
    return schlecht(404, 'arbeitsbereich-unbekannt', 'Diesen Arbeitsbereich gibt es nicht.')
  }
  if (code === '42501' || code === '42704') {
    // Die Bedingungen der Datenbank haben abgewehrt — das ist kein Fehler des Aufrufers,
    // aber es gehört gemeldet und nicht beschönigt.
    return schlecht(403, 'nicht-erlaubt', 'Dieser Ordner gehört nicht zu diesem Konto.')
  }
  return schlecht(500, 'unerwartet', 'Der Ordner konnte nicht geändert werden.')
}

/**
 * `GET /api/pmh/ordner` — die Ordner und die Zugriffspfade eines Arbeitsbereichs.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegOrdnerListe(umg: Umgebung, sql: SqlZugang): Weg {
  return async (req, res) => {
    const wer = await angemeldet(umg, req)
    if (!wer.ok) {
      sende(res, wer.antwort)
      return
    }
    const adresse = new URL(req.url ?? '/', 'http://127.0.0.1')
    const workspaceId = adresse.searchParams.get('workspace') ?? ''
    if (workspaceId.trim() === '') {
      sende(res, schlecht(400, 'eingabe-fehlt', 'Es fehlt der Arbeitsbereich.'))
      return
    }
    try {
      const ordner = await listeOrdner(sql, wer.wer.userId, workspaceId)
      const wurzeln = await ladeZugriffspfade(sql, wer.wer.userId, workspaceId)
      sende(res, gut({ ordner, wurzeln: wurzeln ?? null }))
    } catch (fehler) {
      sende(res, fehlerAntwort(fehler))
    }
  }
}

/**
 * `POST /api/pmh/ordner/anlegen` — einen Ordner eintragen.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegOrdnerAnlegen(umg: Umgebung, sql: SqlZugang): Weg {
  return async (req, res) => {
    const wer = await angemeldet(umg, req)
    if (!wer.ok) {
      sende(res, wer.antwort)
      return
    }
    const ohneCsrf = csrfFehlt(wer.wer)
    if (ohneCsrf !== undefined) {
      sende(res, ohneCsrf)
      return
    }

    const koerper = await leseKoerper(req)
    if (!koerper.ok) {
      sende(res, schlecht(koerper.status, koerper.code, koerper.message))
      return
    }
    const daten = koerper.wert as {
      readonly workspaceId?: unknown
      readonly pfad?: unknown
      readonly istPrimaer?: unknown
      readonly zugriff?: unknown
      readonly bezeichnung?: unknown
    }
    const workspaceId = typeof daten.workspaceId === 'string' ? daten.workspaceId.trim() : ''
    const pfad = typeof daten.pfad === 'string' ? daten.pfad.trim() : ''
    if (workspaceId === '' || pfad === '') {
      sende(res, schlecht(400, 'eingabe-fehlt', 'Es fehlen der Arbeitsbereich oder der Pfad.'))
      return
    }
    const zugriff: Zugriff | undefined =
      daten.zugriff === 'schreiben' ? 'schreiben' : daten.zugriff === 'lesen' ? 'lesen' : undefined
    if (daten.zugriff !== undefined && zugriff === undefined) {
      sende(res, schlecht(400, 'eingabe-unbrauchbar', 'Die Zugriffsart muß „lesen" oder „schreiben" sein.'))
      return
    }

    try {
      const ordner = await legeOrdnerAn(sql, wer.wer.userId, {
        workspaceId,
        pfad,
        istPrimaer: daten.istPrimaer === true,
        ...(zugriff !== undefined ? { zugriff } : {}),
        ...(typeof daten.bezeichnung === 'string' && daten.bezeichnung.trim() !== ''
          ? { bezeichnung: daten.bezeichnung.trim() }
          : {}),
      })
      sende(res, gut({ ordner }))
    } catch (fehler) {
      sende(res, fehlerAntwort(fehler))
    }
  }
}

/**
 * `POST /api/pmh/ordner/zugriff` — Lesen/Schreiben umstellen.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegOrdnerZugriff(umg: Umgebung, sql: SqlZugang): Weg {
  return async (req, res) => {
    const wer = await angemeldet(umg, req)
    if (!wer.ok) {
      sende(res, wer.antwort)
      return
    }
    const ohneCsrf = csrfFehlt(wer.wer)
    if (ohneCsrf !== undefined) {
      sende(res, ohneCsrf)
      return
    }
    const koerper = await leseKoerper(req)
    if (!koerper.ok) {
      sende(res, schlecht(koerper.status, koerper.code, koerper.message))
      return
    }
    const daten = koerper.wert as { readonly id?: unknown; readonly zugriff?: unknown }
    const id = typeof daten.id === 'string' ? daten.id.trim() : ''
    const zugriff: Zugriff | undefined =
      daten.zugriff === 'schreiben' ? 'schreiben' : daten.zugriff === 'lesen' ? 'lesen' : undefined
    if (id === '' || zugriff === undefined) {
      sende(res, schlecht(400, 'eingabe-unbrauchbar', 'Es fehlen die Kennung oder eine gültige Zugriffsart.'))
      return
    }
    try {
      const geaendert = await setzeZugriff(sql, wer.wer.userId, id, zugriff)
      if (!geaendert) {
        // Entweder gibt es den Ordner nicht — oder er ist der **Arbeitsplatz**, und der bleibt
        // schreibbar. Beides führt zu derselben Meldung: hier ist nichts zu ändern.
        sende(res, schlecht(404, 'nicht-aenderbar', 'Diesen Ordner gibt es nicht, oder er ist der Arbeitsplatz.'))
        return
      }
      sende(res, gut({ id, zugriff }))
    } catch (fehler) {
      sende(res, fehlerAntwort(fehler))
    }
  }
}

/**
 * `POST /api/pmh/ordner/entfernen` — einen Zusatzordner entfernen.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegOrdnerEntfernen(umg: Umgebung, sql: SqlZugang): Weg {
  return async (req, res) => {
    const wer = await angemeldet(umg, req)
    if (!wer.ok) {
      sende(res, wer.antwort)
      return
    }
    const ohneCsrf = csrfFehlt(wer.wer)
    if (ohneCsrf !== undefined) {
      sende(res, ohneCsrf)
      return
    }
    const koerper = await leseKoerper(req)
    if (!koerper.ok) {
      sende(res, schlecht(koerper.status, koerper.code, koerper.message))
      return
    }
    const daten = koerper.wert as { readonly id?: unknown }
    const id = typeof daten.id === 'string' ? daten.id.trim() : ''
    if (id === '') {
      sende(res, schlecht(400, 'eingabe-fehlt', 'Es fehlt die Kennung des Ordners.'))
      return
    }
    try {
      const entfernt = await entferneOrdner(sql, wer.wer.userId, id)
      if (!entfernt) {
        // **Der Arbeitsplatz wird nicht entfernt.** Die Speicher-Funktion lehnt ihn ab
        // (`and not ist_primaer`) — hier steht die Meldung dafür, neben dem Fall „gibt es nicht".
        sende(res, schlecht(404, 'nicht-entfernbar', 'Diesen Ordner gibt es nicht, oder er ist der Arbeitsplatz.'))
        return
      }
      sende(res, gut({ id }))
    } catch (fehler) {
      sende(res, fehlerAntwort(fehler))
    }
  }
}

/**
 * Alle Wege dieses Moduls, fertig für `ctx.webServer.register`.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns die Wege
 */
export function ordnerWege(umg: Umgebung, sql: SqlZugang): readonly WebRoute[] {
  const liste = macheWeg('GET', wegOrdnerListe(umg, sql), 'ordner-liste')
  const anlegen = macheWeg('POST', wegOrdnerAnlegen(umg, sql), 'ordner-anlegen')
  const zugriff = macheWeg('POST', wegOrdnerZugriff(umg, sql), 'ordner-zugriff')
  const entfernen = macheWeg('POST', wegOrdnerEntfernen(umg, sql), 'ordner-entfernen')
  const wege: readonly WebRoute[] = [
    { kind: 'exact', path: PFAD_ORDNER, handler: liste },
    { kind: 'exact', path: PFAD_ORDNER_ANLEGEN, handler: anlegen },
    { kind: 'exact', path: PFAD_ORDNER_ZUGRIFF, handler: zugriff },
    { kind: 'exact', path: PFAD_ORDNER_ENTFERNEN, handler: entfernen },
  ]
  return wege
}
