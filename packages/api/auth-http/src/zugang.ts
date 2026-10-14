/**
 * `@prometheus-harness/auth-http/zugang` — die Brücke zwischen der Konto-Tür und der
 * Token-Tür.
 *
 * ## Warum es die braucht
 *
 * Der Rechner hat zwei Türen. Die **Konto-Tür** (`/anmeldung`, `/start`) gehört uns. Die
 * **Token-Tür** (`/`) gehört dem Kern: wer sie ohne Token öffnet, bekommt eine Textzeile —
 * *„dsh web authentication required; reopen the URL printed by dsh web."* Keine Seite, kein
 * Weg hinein. Der Betreiber hat genau das gemeldet.
 *
 * Diese Datei macht zwei Dinge.
 *
 * 1. **Aus der Textzeile wird die Anmeldeseite.** Die Sperre des Kerns schreibt ihre 401
 *    selbst, in `authorizeIndex`. Wir ersetzen **diese eine Eigenschaft** und beantworten die
 *    401 mit **303 auf die Anmeldeseite**. Der Kern bleibt unangetastet — keine Datei in
 *    `node_modules` wird geändert.
 * 2. **Nach der Anmeldung öffnet sich die Token-Tür.**
 *    `GET /api/pmh/auth/zugang` gibt einem **angemeldeten Administrator** die Token-Adresse
 *    des Rechners. Der Browser folgt ihr einmal, bekommt den signierten Keks und ist drin.
 *
 * ## Was das kostet
 *
 * Wer sich anmelden kann, kommt an den **ganzen** Rechner: Dateien, Prozesse, Werkzeuge. Die
 * Konto-Tür wird damit so stark wie die Token-Tür. Deshalb gilt:
 *
 * - **Nur `admin`** bekommt die Adresse; jeder andere bekommt 403 `kein-admin`.
 * - Die Adresse kommt aus der **Konfiguration** des Rechners (`ctx.webServer`: `protocol`,
 *   `host`, `port`) und **nicht** aus dem `Host`-Kopf. Den setzt jeder Aufrufer selbst; wer ihn
 *   fälschte, bekäme den echten Token in einer Adresse seiner Wahl — der Token stünde im Körper
 *   der Antwort.
 * - Der Token steht beim Weiterleiten **einmal** in der Adreßzeile. Das ist der Preis dieser
 *   Brücke; ohne eine Änderung am Kern gibt es keinen anderen Weg an den signierten Keks.
 *
 * ## Wenn der Kern anders wird
 *
 * Fehlt `ctx.connection`, fehlt `authorizeIndex`, oder läßt sich die Eigenschaft nicht setzen,
 * dann wird **nichts** umgebogen und der Grund **laut** gemeldet. Ein Paket, das den Rechner
 * lahmlegt, weil ein Fremdteil sich geändert hat, wäre schlimmer als die Textzeile.
 *
 * @module @prometheus-harness/auth-http/zugang
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { sende, macheWeg, type Weg } from './http.ts'
import { PFAD_ANMELDUNG } from './anmeldung.ts'
import { cookieWert, gut, schlecht, sitzungsCookieName, werBinIch, type Umgebung } from './wege.ts'

/** Wo es nach der Anmeldung zur Oberfläche geht. */
export const PFAD_ZUGANG = '/api/pmh/auth/zugang'

/**
 * Der Teil des Kerns, den wir anfassen — genau diese zwei Methoden.
 *
 * **So eng wie möglich.** Was hier nicht steht, wird auch nicht benutzt.
 */
interface Verbindung {
  authorizeIndex?: ((req: IncomingMessage, res: ServerResponse) => boolean) | undefined
  authenticatedUrl?: ((basis: string) => string) | undefined
}

/**
 * Holt den Verbindungsdienst aus einem Kontext.
 *
 * **Zwei Wege, und beide werden gebraucht.**
 *
 * 1. `ctx.reflect.get` liest einen Dienst **ohne** die Anmeldung in `inject`
 *    (`cordis/lib/types/reflect.d.ts:114-122`: *„Read a service from the store without the
 *    inject requirement."*). Das braucht der Weg `/api/pmh/auth/zugang` — er läuft zur
 *    Anfragezeit, da ist der Dienst längst da.
 * 2. `ctx.connection` steht zur Verfügung, wenn der Kontext den Dienst **angemeldet** hat
 *    (`ctx.inject(['connection'], …)`). Das ist der Weg beim Laden — siehe `index.ts`.
 *
 * @param ctx - der Plugin-Kontext
 * @returns der Dienst oder `undefined`
 */
export function verbindungAus(ctx: Context): Verbindung | undefined {
  const spiegeln = (ctx as { reflect?: { get?: (name: string) => unknown } }).reflect
  const ausSpiegel = spiegeln?.get?.call(spiegeln, 'connection')
  if (ausSpiegel !== undefined && ausSpiegel !== null) return ausSpiegel as Verbindung
  const direkt = (ctx as { connection?: unknown }).connection
  return direkt === undefined || direkt === null ? undefined : (direkt as Verbindung)
}

/**
 * Die eigene Adresse des Rechners.
 *
 * **Aus der Konfiguration, nicht aus einem Kopf.** `ctx.webServer` nennt `protocol`, `host`
 * und `port`; das sind Angaben des Rechners, die kein Aufrufer beeinflussen kann
 * (`dsh-host-webserver/lib/types/index.d.ts:141-150`).
 *
 * @param ctx - der Plugin-Kontext
 * @returns eine Adresse mit Schrägstrich am Ende, z. B. `http://127.0.0.1:3081/`
 */
export function eigeneAdresse(ctx: Context): string {
  const server = (ctx as { webServer?: { protocol?: string; host?: string; port?: number } }).webServer
  const protokoll = server?.protocol ?? 'http:'
  const rechner = server?.host ?? '127.0.0.1'
  const port = server?.port ?? 0
  // Ein IPv6-Literal braucht eckige Klammern, sonst ist die Adresse nicht lesbar.
  const huelle = rechner.includes(':') ? `[${rechner}]` : rechner
  return `${protokoll}//${huelle}:${String(port)}/`
}

/**
 * Biegt die 401 der Sperre auf die Anmeldeseite um.
 *
 * **Wie das ohne Kernänderung geht.** `dsh-host-frontend-static` ruft
 * `ctx.connection.authorizeIndex(req, res)` **bei jeder Anfrage** über die Eigenschaft
 * (`lib/index.js:95`) — keine feste Bindung. Wir legen eine eigene Funktion darüber, fangen
 * die 401 ab und antworten mit 303 auf die Anmeldeseite. Nach der Anfrage stellen wir die
 * Eigenschaft wieder her: kein Dauerzustand, keine Nebenwirkung für andere.
 *
 * @param ctx - der Plugin-Kontext
 * @returns der Rücknehmer; `undefined`, wenn der Kern anders ist als erwartet
 */
export function sperreUmbiegen(ctx: Context): (() => void) | undefined {
  return sperreUmbiegenAn(verbindungAus(ctx))
}

/**
 * Biegt die 401 einer **gegebenen** Verbindung um.
 *
 * **Getrennt von der Suche, damit beides prüfbar ist**: die Suche nach dem Dienst und die
 * Umbiegung selbst. (Der erste Live-Versuch scheiterte an der Suche: unser Paket lädt früher,
 * als der Dienst bereitsteht — deshalb steht sie in `index.ts` jetzt in einem `ctx.inject`.)
 *
 * @param verbindung - der Dienst (darf fehlen)
 * @returns der Rücknehmer; `undefined`, wenn der Dienst anders ist als erwartet
 */
export function sperreUmbiegenAn(verbindung: Verbindung | undefined): (() => void) | undefined {
  if (verbindung === undefined) return undefined
  const original = verbindung.authorizeIndex
  if (typeof original !== 'function') return undefined
  const gebunden = original.bind(verbindung)

  const ersatz = (req: IncomingMessage, res: ServerResponse): boolean => {
    const echtesWriteHead = res.writeHead
    const echtesEnd = res.end
    let umgebogen = false

    res.writeHead = ((status: number, ...rest: unknown[]) => {
      if (status === 401 && !umgebogen) {
        umgebogen = true
        // **Kein Text, sondern der Weg zur Anmeldung.** Der Kern wollte eine 401 schreiben;
        // wir schreiben stattdessen eine Weiterleitung.
        return (echtesWriteHead as unknown as (s: number, h: Record<string, string>) => ServerResponse).call(res, 303, {
          location: `${PFAD_ANMELDUNG}/`,
          'cache-control': 'no-store',
          'content-length': '0',
        })
      }
      return (echtesWriteHead as unknown as (...a: unknown[]) => ServerResponse).apply(res, [status, ...rest])
    }) as ServerResponse['writeHead']

    res.end = ((...args: unknown[]) => {
      // Der Körper der 401 darf nicht in der Weiterleitung landen.
      if (umgebogen) return (echtesEnd as unknown as () => ServerResponse).call(res)
      return (echtesEnd as unknown as (...a: unknown[]) => ServerResponse).apply(res, args)
    }) as ServerResponse['end']

    try {
      return gebunden(req, res)
    } finally {
      res.writeHead = echtesWriteHead
      res.end = echtesEnd
    }
  }

  try {
    // **Auf den PROTOTYP schreiben, nicht auf die Ausprägung.** (Gemessen am 14.10.2026: die
    // Zuweisung an `verbindung.authorizeIndex` wirkte zwar — die Weiterleitung stand —, aber das
    // **Zurücklesen** zeigte sie nicht: „Dienst gefunden: ja, authorizeIndex: ja" stand im
    // Protokoll, obwohl die Brücke arbeitete. Der Dienst kommt durch einen Stellvertreter, der
    // Schreiben weiterreicht und Lesen nicht zurückspiegelt.) Der Prototyp der Klasse ist ein
    // gewöhnliches Objekt: dort greift Schreiben **und** Lesen, und die Prüfung darunter sagt
    // die Wahrheit.
    const prototyp = Object.getPrototypeOf(verbindung) as Record<string, unknown> | null
    const ziel =
      prototyp !== null && typeof prototyp['authorizeIndex'] === 'function'
        ? prototyp
        : (verbindung as unknown as Record<string, unknown>)
    ziel['authorizeIndex'] = ersatz
    // **Nachsehen, ob es wirklich gegriffen hat.**
    if (ziel['authorizeIndex'] !== ersatz) return undefined
    return () => {
      try {
        ziel['authorizeIndex'] = original
      } catch {
        // Beim Rücknehmen kann nichts mehr schiefgehen, was jemanden retten müßte.
      }
    }
  } catch {
    // Ein eingefrorener oder abgeschirmter Dienst wirft. (Gefunden von der Prüfung: bei
    // `Object.freeze` kommt `TypeError: Attempted to assign to readonly property`.) Dann bleibt
    // die Textzeile stehen — laut gemeldet, nicht halb verdrahtet.
    return undefined
  }
}

/**
 * `GET /api/pmh/auth/zugang` — die Token-Adresse für einen angemeldeten Administrator.
 *
 * @param umg - die Umgebung (Sitzungsspeicher)
 * @param ctx - der Plugin-Kontext (für die eigene Adresse)
 * @returns der Weg
 */
export function wegZugang(umg: Umgebung, ctx: Context): Weg {
  return async (req, res) => {
    const geprueft = await werBinIch(umg, { token: cookieWert(req.headers.cookie, sitzungsCookieName(umg)) })
    if (geprueft.status !== 200 || geprueft.koerper === undefined) {
      sende(res, geprueft)
      return
    }
    const koerper = geprueft.koerper as { readonly value?: { readonly role?: string } }
    if (koerper.value?.role !== 'admin') {
      sende(res, schlecht(403, 'kein-admin', 'Nur ein Administrator darf die Oberfläche öffnen.'))
      return
    }
    const verbindung = verbindungAus(ctx)
    if (verbindung === undefined || typeof verbindung.authenticatedUrl !== 'function') {
      sende(res, schlecht(503, 'kein-zugang', 'Dieser Rechner kennt keine Token-Adresse.'))
      return
    }
    sende(res, gut({ url: verbindung.authenticatedUrl(eigeneAdresse(ctx)) }))
  }
}

/** Der Weg, fertig für `ctx.webServer.register`. */
export function zugangsWege(umg: Umgebung, ctx: Context): readonly { readonly kind: 'exact'; readonly path: string; readonly handler: Weg }[] {
  return [{ kind: 'exact', path: PFAD_ZUGANG, handler: macheWeg('GET', wegZugang(umg, ctx), 'anmeldung-zugang') }]
}
