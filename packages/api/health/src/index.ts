/**
 * `@prometheus-harness/health` — der **erste eigene Endpunkt** im Host.
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
 * `ctx.webServer.register`, nicht über eine eigene Serverinstanz. Damit ist
 * bewiesen:
 *
 * 1. Der Loader des Hosts lädt **unser** Paket aus dem Projektbaum.
 * 2. Der Cordis-Dienst `webServer` ist für uns erreichbar (`inject`).
 * 3. Eine Anfrage von außen erreicht **unseren** Code.
 *
 * Ein eigener Server auf einem eigenen Port hätte Punkt 1 und 2 **nicht**
 * gezeigt und wäre außerdem eine zweite Wahrheit über Adresse und Anmeldung —
 * genau die Sorte Abweichung, die später niemand mehr zusammenführt.
 *
 * ## Was dieser Endpunkt **nicht** ist
 *
 * Er ist **keine** Zustandsprüfung. Er prüft nicht die Datenbank, nicht Redis,
 * nicht die LLM-Anbindung. Er beantwortet die eine Frage, die vor allen anderen
 * kommt: *läuft unser Code im Host?* Ein `/api/health`, das „ok" sagt, obwohl
 * die Datenbank liegt, wäre schlimmer als keines — es würde Vertrauen erzeugen,
 * das nicht gedeckt ist. Sobald es echte Abhängigkeiten zu prüfen gibt, bekommt
 * jede ihre eigene ehrliche Antwort (`degraded` mit Grund), statt hier still
 * hineinzuwachsen.
 *
 * ## Die Anmeldung — und warum sie hier nicht geprüft wird
 *
 * Gemessen am 13.10.2026: `GET /` **ohne** Token antwortet **401**, `GET /api/*`
 * antwortet **404** — die 404 kommt vom Auffang-Platz, nicht von einer
 * Anmeldesperre. Der Token schützt also die **Oberfläche**, nicht die API-Fläche.
 *
 * Diese Route ist damit **ohne Token erreichbar**. Das ist für eine
 * Zustandsauskunft vertretbar, solange sie nichts preisgibt und der Lauscher auf
 * `127.0.0.1` gebunden ist — aber es ist eine **Entscheidung, keine
 * Selbstverständlichkeit**, und sie gehört ausgesprochen. Wenn hier je etwas
 * Sensibles dazukommt, braucht es eine Prüfung **vor** dem Handler; das ist
 * Aufgabe des Endpunktwegs (siehe `docs/decisions/eigener-endpunktweg.md`), nicht
 * dieses Pakets.
 *
 * @module @prometheus-harness/health
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
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
 * `webServer` ist der Dienst aus `@deepseek-ai/dsh-host-webserver`, der die
 * Routen hält. Ohne ihn gäbe es nichts zu registrieren — der Loader wartet
 * deshalb mit dem Einhängen, bis er existiert, statt uns mit einem
 * `undefined`-Zugriff scheitern zu lassen.
 */
export const inject = ['webServer']

/** Der Pfad dieses Endpunkts. Als Konstante, damit Tests ihn nicht abschreiben. */
export const HEALTH_PATH = '/api/health'

/** Der Name, den die Antwort über sich selbst nennt. */
export const SERVICE_NAME = '@prometheus-harness/health'

/**
 * Die Fassung dieses Pakets.
 *
 * **Warum sie hier als Zahl steht und nicht aus `package.json` gelesen wird.**
 * Ein Lesezugriff zur Laufzeit könnte fehlschlagen (anderer Aufbau nach einem
 * Bündeln) und würde den Endpunkt von einer Datei abhängig machen, die er nicht
 * braucht. Stattdessen vergleicht eine Prüfung diesen Wert mit `package.json` —
 * dann fällt ein Auseinanderlaufen beim Testen auf, nicht im Betrieb.
 */
export const SERVICE_VERSION = '0.1.0'

/**
 * Der Augenblick, in dem dieses Modul geladen wurde.
 *
 * Die Laufzeit ist damit die Laufzeit **des Plugins im Host**, nicht des
 * Rechners — genau das, was hier interessiert.
 */
const START = Date.now()

/** Wie die Antwort aussieht. Ein Typ, damit die Prüfung dieselbe Form benutzt. */
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

/**
 * Baut den Antwortkörper.
 *
 * Als eigene Funktion, damit Prüfungen sie **ohne** HTTP aufrufen können: dann
 * prüft der Test die Form, und der HTTP-Aufruf prüft die Anbindung. Zwei
 * getrennte Fragen, zwei getrennte Prüfungen — statt einer Prüfung, die beides
 * halb beantwortet.
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
 * Schreibt eine JSON-Antwort und **beendet sie ausdrücklich**.
 *
 * **Warum `Content-Length` und nicht `res.end(text)`.** Der Webserver des Cores
 * verdichtet Antworten ab 1.024 Byte (`compression: gzip`, gemessen in
 * `cordis.patch.yml`). Eine Antwort ohne Längenangabe gilt dort als
 * „unbekannte Länge" und wird **verdichtet** — für ein paar Dutzend Byte
 * unnötige Arbeit und ein `Content-Encoding`, das ein Aufrufer ohne
 * gzip-Unterstützung nicht lesen kann. Mit Längenangabe bleibt die Antwort, was
 * sie ist: ein paar Byte JSON.
 *
 * **Warum `Cache-Control: no-store`.** Eine zwischengespeicherte
 * Zustandsauskunft ist eine falsche Zustandsauskunft.
 *
 * @param res - die Antwort des Webservers
 * @param status - HTTP-Statuscode
 * @param body - der Körper, wird als JSON geschrieben
 * @param head - ob nur die Kopfdaten gesendet werden (HEAD)
 */
function sendJson(res: ServerResponse, status: number, body: unknown, head = false): void {
  const text = JSON.stringify(body)
  const raw = Buffer.from(text, 'utf8')
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(raw.byteLength))
  res.setHeader('Cache-Control', 'no-store')
  if (head) res.end()
  else res.end(raw)
}

/**
 * Der Handler — er besitzt den **vollen** Lebenszyklus der Antwort.
 *
 * Der Vertrag von {@link WebRoute} sagt das ausdrücklich: der Handler antwortet,
 * niemand sonst. Deshalb wird hier **jeder** Ausgang beschrieben: `GET` und
 * `HEAD` antworten, alles andere bekommt **405** mit `Allow`.
 *
 * **Warum 405 und nicht 404.** Ein Aufruf mit der falschen Methode ist ein
 * anderer Fehler als ein Aufruf an der falschen Adresse. Wer `POST /api/health`
 * schickt, hat den Pfad richtig und die Methode falsch — das gehört gesagt, sonst
 * sucht man an der Adresse.
 *
 * @param req - die Anfrage
 * @param res - die Antwort
 */
export function handleHealth(req: IncomingMessage, res: ServerResponse): void {
  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    sendJson(res, 405, { status: 'error', error: 'method_not_allowed', allow: ['GET', 'HEAD'] })
    return
  }
  sendJson(res, 200, healthBody(), method === 'HEAD')
}

/**
 * Hängt den Endpunkt ein.
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
 * `ctx.effect(körper)` führt den Körper **sofort** aus und sammelt die
 * Disposer, die er zurückgibt. Sie laufen in umgekehrter Reihenfolge, wenn der
 * Effekt selbst entsorgt wird **oder** wenn das Plugin abgehängt wird — was
 * zuerst kommt. Der Loader kann ein Plugin also neu laden, ohne eine tote Route
 * zu hinterlassen.
 *
 * @param ctx - der Plugin-Kontext mit dem `webServer`-Dienst
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const route: WebRoute = { kind: 'exact', path: HEALTH_PATH, handler: handleHealth }
    return ctx.webServer.register(route)
  }, `${name} ${HEALTH_PATH}`)
}

export default apply
