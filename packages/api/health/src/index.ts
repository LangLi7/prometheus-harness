/**
 * `@prometheus-harness/health` — Zustandsauskunft **und** die Anmeldesperre für
 * unsere eigene API-Fläche.
 *
 * ## Warum dieses Paket existiert
 *
 * Am 13.10.2026 war der Stand: der Kern des Projekts ist gebaut (14 Pakete,
 * 262 + 108 Tests grün), aber **kein einziges Paket davon ist angeschlossen**.
 * Der Host liefert die Oberfläche des Cores aus; unser eigener Code lief nur in
 * `bun test`. Eine Kette, die nur im Test läuft, ist keine Kette.
 *
 * Dieses Paket ist der kleinste Schritt, der das ändert: eine Route, die
 * **unser** Handler beantwortet — registriert über den offiziellen Dienst
 * `ctx.webServer.register`, nicht über eine eigene Serverinstanz.
 *
 * ## Die zwei Endpunkte — und warum es zwei sind
 *
 * | Pfad | Anmeldung | Frage |
 * |---|---|---|
 * | `GET /api/health` | **nein** | *läuft der Prozeß?* |
 * | `GET /api/ready` | **ja** | *ist die Anwendung dahinter ansprechbar?* |
 *
 * Das ist der übliche Schnitt, und er ist keine Pedanterie: eine
 * Erreichbarkeitsprüfung, die eine Anmeldung verlangt, kann nicht melden, daß
 * die Anmeldung kaputt ist. `/api/health` ist deshalb absichtlich offen — und
 * deshalb sagt er auch **nichts** außer „dieser Handler läuft".
 *
 * ## Die Anmeldesperre — gemessen, nicht angenommen
 *
 * `GET /api/*` **ohne** Cookie antwortet mit **401**, **mit** Cookie mit **404**
 * (gemessen am 13.10.2026). Die 401 kommt also **vor** der Zustellung: es gibt
 * bereits eine Sperre für die API-Fläche.
 *
 * Eine eigene Route, die über `ctx.webServer.register` eingehängt wird, geht
 * **an dieser Sperre vorbei** — der Webserver verteilt zuerst an benannte Routen
 * und erst danach an den Auffang-Platz. Das war im ersten Entwurf so: `/api/health`
 * antwortete **ohne** Anmeldung mit 200. Für eine Zustandsauskunft vertretbar —
 * für jeden weiteren Endpunkt gefährlich, und die Gefahr wäre **still** gewesen.
 *
 * Deshalb ruft {@link istAbgewiesen} die **vorhandene** Prüfung des Hosts auf,
 * statt eine eigene zu bauen: `ctx.connection.requestRejection`. Sie prüft
 * zuerst den Host/Origin-Zaun und danach die Browsersitzung:
 *
 * | Ergebnis | Bedeutung |
 * |---|---|
 * | `undefined` | erlaubt |
 * | `403` | der Aufrufer ist nicht der Host, für den wir gebaut sind |
 * | `401` | nicht angemeldet |
 *
 * **Warum die Prüfung des Cores und keine eigene.** Eine zweite Meinung darüber,
 * was eine gültige Anmeldung ist, geht irgendwann auseinander. Das Cookie ist mit
 * einem 32 Byte langen Geheimnis unterschrieben; wer das nachbaut, baut es
 * falsch nach — und merkt es nicht, weil beide Seiten „funktionieren".
 *
 * ## Was dieses Paket **nicht** ist
 *
 * Keine Zustandsprüfung der Datenbank. `/api/ready` sagt, daß die Anwendung
 * antwortet; ob PostgreSQL erreichbar ist, sagt es **nicht**. Ein `/api/ready`,
 * das „ok" sagt, obwohl die Datenbank liegt, wäre schlimmer als keines — es
 * würde Vertrauen erzeugen, das nicht gedeckt ist.
 *
 * @module @prometheus-harness/health
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

/**
 * Stabiler Cordis-Plugin-Name.
 *
 * **Warum er nicht beliebig ist.** Der Loader führt Plugins unter diesem Namen:
 * die Ausgabe der Entry-Prüfung, Abschaltungen und Fehlermeldungen nennen ihn.
 * Steht hier etwas anderes als in der Patch-Zeile, sucht man den Fehler an der
 * falschen Stelle. Er ist deshalb derselbe Name wie in
 * `profiles/web/cordis.patch.yml`.
 */
export const name = 'pmh-health'

/**
 * Dienste, die vor dem Einhängen da sein müssen.
 *
 * `webServer` hält die Routen; ohne ihn gäbe es nichts zu registrieren.
 *
 * ## Warum `connection` hier **nicht** steht — mit dem Fehler, der dazu führte
 *
 * Der erste Entwurf forderte auch `connection`. Der Gedanke war: ohne den
 * Verbindungsdienst können wir `/api/ready` nicht absichern, also soll der Loader
 * uns gar nicht erst einhängen.
 *
 * **Das war falsch, und die Prüfung hat es gezeigt:** in einem Aufbau ohne
 * Verbindungsdienst hing der Loader das Plugin **nie** ein — beide Endpunkte
 * antworteten **404**. Ein Endpunkt, der wegen einer fehlenden Prüfung
 * verschwindet, kann nicht melden, **daß** die Prüfung fehlt. Er verschwindet
 * still, und ein stiller Ausfall ist genau das, was Regel 3 dieses Projekts
 * verbietet.
 *
 * **Jetzt gilt:** das Plugin hängt sich immer ein. Fehlt der Verbindungsdienst
 * zur Laufzeit, antwortet `/api/ready` mit **503** und dem Grund `unavailable`
 * (siehe {@link abweisung}) — sichtbar, statt still. `/api/health` bleibt offen
 * und meldet weiterhin, daß der Prozeß lebt.
 *
 * Kein Ausfall wird dadurch still: die Verweigerung ist eine **Antwort**, und
 * eine Antwort kann man prüfen.
 */
export const inject = ['webServer']

/** Der Pfad der offenen Erreichbarkeitsprüfung. */
export const HEALTH_PATH = '/api/health'

/** Der Pfad der geschützten Bereitschaftsauskunft. */
export const READY_PATH = '/api/ready'

/** Der Name, den die Antworten über sich selbst nennen. */
export const SERVICE_NAME = '@prometheus-harness/health'

/**
 * Die Fassung dieses Pakets.
 *
 * **Warum sie hier als Zeichenkette steht und nicht aus `package.json` gelesen
 * wird.** Ein Lesezugriff zur Laufzeit könnte fehlschlagen (anderer Aufbau nach
 * einem Bündeln) und würde die Endpunkte von einer Datei abhängig machen, die sie
 * nicht brauchen. Stattdessen vergleicht eine Prüfung diesen Wert mit
 * `package.json` — dann fällt ein Auseinanderlaufen **beim Testen** auf, nicht im
 * Betrieb.
 */
export const SERVICE_VERSION = '0.2.0'

/**
 * Der Augenblick, in dem dieses Modul geladen wurde.
 *
 * Die Laufzeit ist damit die Laufzeit **des Plugins im Host**, nicht des Rechners.
 */
const START = Date.now()

/** Wie die offene Auskunft aussieht. */
export interface HealthBody {
  /** Immer `'ok'` — solange dieser Handler läuft. */
  status: 'ok'
  /** Wer antwortet. */
  service: string
  /** Welche Fassung. */
  version: string
  /** Seit wann dieses Plugin geladen ist, in Millisekunden. */
  uptimeMs: number
  /** Die Fassung der Laufzeit, in der der Host läuft. */
  runtime: string
}

/** Wie die geschützte Auskunft aussieht. Sie sagt **mehr**, weil sie geschützt ist. */
export interface ReadyBody extends HealthBody {
  /** `zustand` statt `status`, damit die beiden Antworten nicht verwechselt werden. */
  bereit: true
  /** Seit wann der Prozeß läuft, in Sekunden — gröber, weil es hier nicht auf Millisekunden ankommt. */
  prozessSekunden: number
  /** Die Plattform, auf der der Host läuft. */
  plattform: string
}

/**
 * Baut den Antwortkörper der offenen Auskunft.
 *
 * Als eigene Funktion, damit Prüfungen sie **ohne** HTTP aufrufen können: dann
 * prüft der Test die Form, und der HTTP-Aufruf prüft die Anbindung. Zwei
 * getrennte Fragen, zwei getrennte Prüfungen.
 *
 * @param now - der jetzige Augenblick (übergebbar, damit die Laufzeit prüfbar ist)
 * @returns der Antwortkörper
 */
export function healthBody(now: number = Date.now()): HealthBody {
  return {
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    // Nie negativ: eine Uhr, die während des Starts zurückgestellt wird, würde
    // sonst eine unsinnige Laufzeit melden.
    uptimeMs: Math.max(0, now - START),
    runtime: `bun ${process.versions.bun ?? '?'}`,
  }
}

/**
 * Baut den Antwortkörper der geschützten Auskunft.
 *
 * @param now - der jetzige Augenblick
 * @returns der Antwortkörper
 */
export function readyBody(now: number = Date.now()): ReadyBody {
  return {
    ...healthBody(now),
    bereit: true,
    prozessSekunden: Math.round(process.uptime()),
    plattform: process.platform,
  }
}

/**
 * Fragt die Anmelde- und Zaunprüfung des Hosts.
 *
 * **Der Vertrag wird hier nicht nachgebaut, sondern aufgerufen.** Siehe
 * Dateikopf: `requestRejection` prüft den Host/Origin-Zaun und danach die
 * Browsersitzung und antwortet `undefined`, `403` oder `401`.
 *
 * **Warum der Dienst über `ctx.get` geholt wird und nicht über `ctx.connection`.**
 * Beide Wege sind öffentlich. `ctx.get` liefert `undefined`, wenn der Dienst
 * fehlt — damit ist der Fall „kein Verbindungsdienst" ein **beschriebener
 * Ausgang** (Verweigerung) statt eines Absturzes beim Zugriff auf eine leere
 * Eigenschaft. Ob der Dienst da ist, sichert zusätzlich `inject` ab; diese Zeile
 * ist der zweite Boden unter dem ersten.
 *
 * @param ctx - der Plugin-Kontext
 * @param headers - die Kopfdaten der Anfrage
 * @returns `undefined`, wenn erlaubt — sonst der HTTP-Status der Verweigerung
 */
export function abweisung(
  ctx: Context,
  headers: IncomingHttpHeaders | Readonly<Record<string, string | readonly string[] | undefined>>,
): number | undefined {
  const verbindung = ctx.get('connection') as
    | { requestRejection?: (request: { headers: typeof headers }) => number | undefined }
    | undefined
  if (verbindung === undefined || typeof verbindung.requestRejection !== 'function') {
    // **Verweigern statt durchlassen.** Fehlt die Prüfung, ist die sichere
    // Annahme „nicht erlaubt": ein ungeschützter Endpunkt ist der teurere Fehler.
    return 503
  }
  return verbindung.requestRejection({ headers })
}

/**
 * Schreibt eine JSON-Antwort und **beendet sie ausdrücklich**.
 *
 * **Warum `Content-Length` und nicht `res.end(text)`.** Der Webserver des Cores
 * verdichtet Antworten ab 1.024 Byte (`compression: gzip`, siehe
 * `cordis.patch.yml`). Eine Antwort ohne Längenangabe gilt dort als „unbekannte
 * Länge" und wird **verdichtet** — für ein paar Dutzend Byte unnötige Arbeit und
 * ein `Content-Encoding`, das ein Aufrufer ohne gzip-Unterstützung nicht lesen
 * kann. Mit Längenangabe bleibt die Antwort, was sie ist: ein paar Byte JSON.
 *
 * **Warum `Cache-Control: no-store`.** Eine zwischengespeicherte
 * Zustandsauskunft ist eine falsche Zustandsauskunft.
 *
 * @param res - die Antwort des Webservers
 * @param status - HTTP-Statuscode
 * @param body - der Körper, wird als JSON geschrieben
 * @param extraKopf - weitere Kopfdaten (etwa `WWW-Authenticate`)
 * @param head - ob nur die Kopfdaten gesendet werden (HEAD)
 */
function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraKopf: Record<string, string> = {},
  head = false,
): void {
  const raw = Buffer.from(JSON.stringify(body), 'utf8')
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(raw.byteLength))
  res.setHeader('Cache-Control', 'no-store')
  for (const [k, v] of Object.entries(extraKopf)) res.setHeader(k, v)
  if (head) res.end()
  else res.end(raw)
}

/**
 * Beantwortet eine Anfrage mit der Methode `GET` oder `HEAD`.
 *
 * **Warum 405 und nicht 404.** Ein Aufruf mit der falschen Methode ist ein
 * anderer Fehler als ein Aufruf an der falschen Adresse. Wer `POST /api/health`
 * schickt, hat den Pfad richtig und die Methode falsch — das gehört gesagt, sonst
 * sucht man an der Adresse.
 *
 * @param req - die Anfrage
 * @param res - die Antwort
 * @param körper - der zu sendende Körper
 * @returns ob geantwortet wurde
 */
function nurLesend(req: IncomingMessage, res: ServerResponse, körper: () => unknown): boolean {
  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    sendJson(res, 405, { status: 'error', error: 'method_not_allowed', allow: ['GET', 'HEAD'] })
    return true
  }
  sendJson(res, 200, körper(), {}, method === 'HEAD')
  return true
}

/**
 * Der Handler der **offenen** Erreichbarkeitsprüfung.
 *
 * Er prüft **nichts** außer der Methode. Genau das ist sein Zweck: melden, daß der
 * Prozeß lebt und Routen bedient. Deshalb nennt er auch keine Einzelheiten, die
 * einem Fremden nützen könnten — Fassung, Laufzeit und Laufzeitdauer sind
 * öffentlich bekanntes Beiwerk, keine Innensicht.
 *
 * @param req - die Anfrage
 * @param res - die Antwort
 */
export function handleHealth(req: IncomingMessage, res: ServerResponse): void {
  nurLesend(req, res, () => healthBody())
}

/**
 * Der Handler der **geschützten** Bereitschaftsauskunft.
 *
 * **Hier greift die Anmeldesperre.** Ohne sie wäre dieser Endpunkt offen, und
 * weil die Route am Auffang-Platz vorbeigeht (siehe Dateikopf), würde es niemand
 * bemerken. Die Prüfung kommt **vor** jeder inhaltlichen Arbeit.
 *
 * @param ctx - der Plugin-Kontext mit dem Verbindungsdienst
 * @returns der Handler
 */
export function macheReadyHandler(ctx: Context): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const abgelehnt = abweisung(ctx, req.headers)
    if (abgelehnt !== undefined) {
      // **Warum dieselben Status wie der Core.** Die Oberfläche kennt 401 und
      // 403 bereits und weiß, was zu tun ist. Ein eigener Status (etwa 418)
      // wäre eine zweite Sprache für dieselbe Sache.
      sendJson(
        res,
        abgelehnt,
        {
          status: 'error',
          error: abgelehnt === 401 ? 'unauthenticated' : abgelehnt === 403 ? 'untrusted_origin' : 'unavailable',
        },
        abgelehnt === 401 ? { 'WWW-Authenticate': 'Cookie' } : {},
      )
      return
    }
    nurLesend(req, res, () => readyBody())
  }
}

/**
 * Hängt beide Endpunkte ein.
 *
 * ## Der Fehler, der hier zuerst stand — und warum er gefährlich war
 *
 * Die erste Fassung hing den Disposer an `ctx.on('dispose', …)`. Das sah richtig
 * aus, **feuerte aber nie**: Cordis kennt kein `dispose`-**Ereignis**. Der
 * Listener wurde beim Abhängen nur mitentsorgt — das Aufräumen, das er hätte
 * auslösen sollen, lief nie mit.
 *
 * Die Prüfung hat es gefunden, nicht das Nachdenken: nach `fiber.dispose()`
 * antwortete die Route weiter mit **200**. Ohne diese Prüfung wäre eine Route
 * zurückgeblieben, die auf einen toten Kontext zeigt — und zwar still.
 *
 * ## Wie es richtig geht
 *
 * `ctx.effect(körper)` führt den Körper **sofort** aus und sammelt die Disposer,
 * die er zurückgibt. Sie laufen in umgekehrter Reihenfolge, wenn der Effekt
 * selbst entsorgt wird **oder** wenn das Plugin abgehängt wird — was zuerst
 * kommt. Der Loader kann ein Plugin also neu laden, ohne eine tote Route zu
 * hinterlassen.
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const offen: WebRoute = { kind: 'exact', path: HEALTH_PATH, handler: handleHealth }
    const geschützt: WebRoute = { kind: 'exact', path: READY_PATH, handler: macheReadyHandler(ctx) }
    const ab = [ctx.webServer.register(offen), ctx.webServer.register(geschützt)]
    return () => {
      for (const einer of ab.reverse()) einer()
    }
  }, `${name} ${HEALTH_PATH} ${READY_PATH}`)
}

export default apply
