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

import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import {
  entferneOrdner,
  ladeZugriffspfade,
  legeOrdnerAn,
  listeOrdner,
  setzeZugriff,
  stelleBereit,
  type SqlZugang,
  type Zugriff,
} from '@prometheus-harness/store-postgres'
import { leseKoerper, macheWeg, sende, type Weg } from './http.ts'
import { gut, schlecht, type Antwort, type Umgebung } from './paths.ts'
import { csrfFehlt, pruefeSitzung as angemeldet } from './sitzung.ts'

/** Die Sammlung der Ordner eines Arbeitsbereichs. */
export const PFAD_ORDNER = '/api/pmh/ordner'

/**
 * Den Arbeitsbereich für diesen Mandanten anlegen — **die Brücke zum Host**.
 *
 * **Warum es diesen Weg gibt.** Der Host führt seine Arbeitsbereiche selbst; unsere Datenbank
 * kannte sie nicht, und `workspace_folders` verweist auf `workspaces (id, user_id)`. Ohne diese
 * Zeile lief jeder Ordner in einen Fremdschlüssel-Fehler (23503). Der Dialog ruft diesen Weg
 * **vor** dem Lesen der Liste — danach steht der Arbeitsplatz als erster Ordner da.
 */
export const PFAD_ORDNER_BEREICH = '/api/pmh/ordner/bereich'

/** Einen Ordner eintragen. */
export const PFAD_ORDNER_ANLEGEN = '/api/pmh/ordner/anlegen'

/** Lesen/Schreiben umstellen. */
export const PFAD_ORDNER_ZUGRIFF = '/api/pmh/ordner/zugriff'

/** Einen Zusatzordner entfernen. */
export const PFAD_ORDNER_ENTFERNEN = '/api/pmh/ordner/entfernen'

// **Die Sitzungs- und CSRF-Prüfung liegt in `sitzung.ts`** — eine Wahrheit für alle Wege dieses
// Pakets, seit die Notizen dazukamen. Sie wird hier unter dem Namen `angemeldet` benutzt, damit
// die Wege darunter unverändert lesbar bleiben.

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
 * `POST /api/pmh/ordner/bereich` — den Arbeitsbereich für diesen Mandanten anlegen.
 *
 * **Die Brücke.** Der Host kennt den Arbeitsbereich (Kennung, Titel, Pfad), unsere Datenbank nicht.
 * Ohne diese Zeile schlüge jeder Ordner mit **23503** fehl. Der Weg ist **idempotent** und
 * **schreibend** — deshalb POST mit CSRF, nicht GET.
 *
 * @param umg - die Umgebung
 * @param sql - der Datenbankzugang
 * @returns der Weg
 */
export function wegOrdnerBereich(umg: Umgebung, sql: SqlZugang): Weg {
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
      readonly name?: unknown
      readonly pfad?: unknown
    }
    const workspaceId = typeof daten.workspaceId === 'string' ? daten.workspaceId.trim() : ''
    if (workspaceId === '') {
      sende(res, schlecht(400, 'eingabe-fehlt', 'Es fehlt der Arbeitsbereich.'))
      return
    }
    try {
      await stelleBereit(sql, wer.wer.userId, {
        workspaceId,
        name: typeof daten.name === 'string' ? daten.name : '',
        ...(typeof daten.pfad === 'string' && daten.pfad.trim() !== '' ? { pfad: daten.pfad.trim() } : {}),
      })
      sende(res, gut({ workspaceId }))
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
  const bereich = macheWeg('POST', wegOrdnerBereich(umg, sql), 'ordner-bereich')
  const liste = macheWeg('GET', wegOrdnerListe(umg, sql), 'ordner-liste')
  const anlegen = macheWeg('POST', wegOrdnerAnlegen(umg, sql), 'ordner-anlegen')
  const zugriff = macheWeg('POST', wegOrdnerZugriff(umg, sql), 'ordner-zugriff')
  const entfernen = macheWeg('POST', wegOrdnerEntfernen(umg, sql), 'ordner-entfernen')
  const wege: readonly WebRoute[] = [
    { kind: 'exact', path: PFAD_ORDNER_BEREICH, handler: bereich },
    { kind: 'exact', path: PFAD_ORDNER, handler: liste },
    { kind: 'exact', path: PFAD_ORDNER_ANLEGEN, handler: anlegen },
    { kind: 'exact', path: PFAD_ORDNER_ZUGRIFF, handler: zugriff },
    { kind: 'exact', path: PFAD_ORDNER_ENTFERNEN, handler: entfernen },
  ]
  return wege
}
