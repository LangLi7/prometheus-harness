/**
 * Wer da klopft — Sitzung und CSRF an **einer** Stelle.
 *
 * ## Warum das eine eigene Datei ist
 *
 * Die Prüfung stand zuerst privat in `folders.ts`. Als die Notizen dazukamen,
 * wäre sie ein zweites Mal entstanden — und damit zwei Stellen, an denen ein
 * Fehler im Sitzungstoken stecken könnte. Ein Sicherheitsfehler, der an einer
 * von zwei Stellen behoben wird, ist die schlechteste Art von Fehler: er sieht
 * behoben aus.
 *
 * ## Was hier **nicht** passiert
 *
 * Keine Regel darüber, wem was gehört. Diese Datei sagt nur, **wer** ruft. Ob
 * der Aufrufer einen Datensatz sehen darf, entscheidet der Speicher — jede
 * Abfrage trägt die `user_id` aus dieser Prüfung als Bedingung.
 *
 * ## Warum das nicht in `http.ts` steht
 *
 * `http.ts` entscheidet nach eigener Ansage nichts: kein Status, kein Grund.
 * Hier wird ein Status entschieden (401, 403) — also gehört es nicht dorthin.
 * Und nicht in `paths.ts`, weil dort kein Socket vorkommen soll; der
 * Sitzungscookie kommt aber aus einer Anfrage.
 *
 * @module @prometheus-harness/auth-http/sitzung
 */

import type { IncomingMessage } from 'node:http'
import { verifyCsrf, verifySession } from '@prometheus-harness/auth'
import { cookieWert, schlecht, sitzungsCookieName, type Antwort, type Umgebung } from './paths.ts'

/** Der CSRF-Kopf, wie überall. */
const CSRF_KOPFZEILE = 'x-pmh-csrf'

/** Was ein angemeldeter Aufrufer ist. */
export interface Handelnder {
  /** Die Kennung aus der Sitzung — die einzige Herkunft der Mandantengrenze. */
  readonly userId: string
  /** Der CSRF-Wert aus dem Kopf, roh. */
  readonly csrfKopf: string | undefined
  /** Der Sitzungsdatensatz — für `verifyCsrf`. Beim Token-Weg **fehlt** er. */
  readonly session: Parameters<typeof verifyCsrf>[0] | undefined
  /** Woher die Kennung stammt. `token` heißt: der Wirt hat die Anfrage schon erlaubt. */
  readonly quelle: 'konto' | 'token'
}

/**
 * Was eine Anfrage **außer** einem Konto-Keks noch ausweisen kann.
 *
 * Beides ist nötig, und beide Teile sind voneinander unabhängig: der Token beweist, **daß** die
 * Anfrage vom Besitzer der Maschine kommt; das Verwalterkonto sagt, **wer** das ist. Fehlt einer
 * von beiden, gibt es keinen Token-Weg — dann bleibt es beim Konto.
 */
export interface SitzungsZusatz {
  /**
   * Kommt die Anfrage **aus dem Haus** — also vom selben Rechner über Loopback?
   *
   * **Warum das reicht, und warum es nicht mehr ist.** Jede Anfrage an `/api/…` passiert vorher
   * den Trust-Fence des Kerns (`api-request-trust`: Host-Bindung gegen DNS-Rebinding, Origin- und
   * Fetch-Metadata-Prüfung gegen fremde Seiten). Eine **fremde Webseite** kann diese Anfrage also
   * nicht lesen. Was bleibt, ist ein **anderer lokaler Benutzer** auf derselben Maschine — der
   * erreicht aber ohnehin `/universe/` (gemessen: die Welt lädt ohne Anmeldung) und die Datenbank.
   * Deshalb gilt die Erleichterung nur für Loopback **und** nur bei **genau einem** Verwalterkonto
   * **und** nur lesend.
   */
  readonly kommtAusDemHaus?: ((req: IncomingMessage) => boolean) | undefined
  /** Die Kennung des **einzigen** Verwalterkontos; `undefined`, wenn es nicht genau eines gibt. */
  readonly verwalterKonto?: (() => Promise<string | undefined>) | undefined
}

/**
 * Prüft die Sitzung aus dem Cookie — und, wenn es keinen gibt, den Token des Wirts.
 *
 * **Reihenfolge mit Absicht.** Zuerst das Konto: es ist die genauere Auskunft und trägt den
 * CSRF-Wert. Erst wenn keins da ist, wird der Token gefragt. Umgekehrt könnte ein Konto nie
 * schreiben.
 *
 * @param umg - die Umgebung
 * @param req - die Anfrage
 * @param zusatz - Token-Prüfung und Verwalterkonto (fehlt beides, bleibt es beim Konto)
 * @returns der Handelnde oder die Antwort, die statt seiner geht
 */
export async function pruefeSitzung(
  umg: Umgebung,
  req: IncomingMessage,
  zusatz: SitzungsZusatz = {},
): Promise<{ readonly ok: true; readonly wer: Handelnder } | { readonly ok: false; readonly antwort: Antwort }> {
  const token = cookieWert(req.headers.cookie, sitzungsCookieName(umg))
  if (token !== undefined && token !== '') {
    const geprueft = await verifySession(umg.speicher.sitzungen, token).catch(() => undefined)
    if (geprueft !== undefined) {
      const kopf = req.headers[CSRF_KOPFZEILE]
      return {
        ok: true,
        wer: {
          userId: geprueft.session.userId,
          csrfKopf: typeof kopf === 'string' ? kopf : undefined,
          session: geprueft.session,
          quelle: 'konto',
        },
      }
    }
  }

  // ── Die zweite Tür ───────────────────────────────────────────────────────────────────────
  //
  // **Nur lesen.** Wer vom selben Rechner kommt, ist der Besitzer dieser Maschine; er soll für ein
  // Notizfenster kein zweites Konto aufmachen (der Betreiber: *„ich bin ja schon im Harness drinn
  // warum nochmals ein login?"*). Die Zuordnung gilt nur bei **genau einem** Verwalterkonto — bei
  // zweien könnte jeder lokale Aufrufer die Notizen des anderen lesen. Schreibende Wege bleiben
  // der Konto-Sitzung vorbehalten (siehe {@link csrfFehlt}), denn ohne Sitzungsdatensatz läßt sich
  // kein CSRF-Wert prüfen.
  if (zusatz.kommtAusDemHaus?.(req) === true) {
    const userId = await zusatz.verwalterKonto?.().catch(() => undefined)
    if (userId !== undefined) {
      return { ok: true, wer: { userId, csrfKopf: undefined, session: undefined, quelle: 'token' } }
    }
  }

  return { ok: false, antwort: schlecht(401, 'nicht-angemeldet', 'Nicht angemeldet.') }
}

/**
 * Prüft den CSRF-Wert eines ändernden Aufrufs.
 *
 * Ein Aufrufer, der nur den Token des Wirts hat, bekommt hier **403 `nur-mit-konto`** — nicht
 * `csrf-fehlt`. Der Unterschied ist die Auskunft: es fehlt nicht der Wert, es fehlt die Sitzung,
 * gegen die er zu prüfen wäre.
 *
 * @param wer - der Handelnde
 * @returns die Antwort, wenn der Wert fehlt oder nicht stimmt
 */
export function csrfFehlt(wer: Handelnder): Antwort | undefined {
  if (wer.session === undefined) {
    return schlecht(
      403,
      'nur-mit-konto',
      'Änderungen brauchen die Konto-Sitzung. Der Token des Wirts genügt zum Lesen, nicht zum Schreiben.',
    )
  }
  if (verifyCsrf(wer.session, wer.csrfKopf ?? '')) return undefined
  return schlecht(403, 'csrf-fehlt', 'Der CSRF-Wert fehlt oder stimmt nicht.')
}
