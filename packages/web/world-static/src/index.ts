/**
 * `@prometheus-harness/world-static` — **die Welt auf demselben Port wie der Chat.**
 *
 * ## Der Auftrag (Betreiber, 14.10.2026)
 *
 * > *„der ganze port ist mir bisschen zu piss 2 port offen zu haben ich möchte es als ein port haben
 * > und im folder: apps/universe anstatt in snapshoot, dann alles in einem port."*
 *
 * Bis dahin hatte die Welt einen **eigenen** Entwicklungsserver (`vite` auf `:5176`). Zwei Adressen
 * heißen zwei Herkünfte, und das hatte Folgen, die man einzeln reparieren musste: zwei
 * Keks-Speicher, zwei Namen (`127.0.0.1` und `localhost`), ein Umschalter, der eine **fremde**
 * Adresse kennen und mitschicken musste — und ein Port, der beim Start belegt sein konnte.
 *
 * Jetzt gibt es **einen** Port. Dieses Paket registriert eine Route am Webserver des Kerns
 * (`ctx.webServer.register`, derselbe Dienst, den `@prometheus-harness/health` benutzt) und liefert
 * die **gebaute** Welt aus `apps/universe/dist` unter {@link WORLD_PATH} aus.
 *
 * ## Was dieses Paket bewusst **nicht** tut
 *
 * * **Es baut nicht.** Bauen ist ein eigener Schritt (`vite build` in `apps/universe`), und
 *   `scripts/start.mjs` ruft ihn beim Start auf. Ein Auslieferer, der nebenbei baut, wäre ein
 *   Auslieferer mit Meinung über den Quelltext.
 * * **Es prüft keine Anmeldung.** Die Welt ist ein **Prototyp aus Beispieldaten** — sie enthält
 *   nichts, was dem Harness gehört: keine Sitzung, keine Datei, keinen Schlüssel. Wer die
 *   Chat-Oberfläche erreicht, ist angemeldet; die Welt daneben ist eine Anschauung. Das steht hier,
 *   damit es eine **Entscheidung** ist und kein Versehen — wer sie schützen will, hängt
 *   `ctx.get('connection')?.requestRejection(…)` davor, genau wie `@prometheus-harness/health` es
 *   für `/api/ready` tut.
 * * **Es liefert nichts außerhalb von `dist/` aus** — kein Verzeichnis, keine Datei, kein Pfad, der
 *   aus dem Zielbaum zeigt ({@link zieldatei}).
 *
 * ## Warum `no-store`
 *
 * Ein Prototyp, der beim Nachsehen die **alte** Fassung zeigt, kostet mehr Zeit als ein zweiter
 * Download: man sucht den Fehler im Code, während der Browser den vorigen Bau zeigt. Die Dateien
 * sind klein genug (die Schriftdateien ausgenommen), und auf einem lokalen Rechner ist der
 * Unterschied nicht zu messen.
 *
 * @module @prometheus-harness/world-static
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Stabiler Cordis-Plugin-Name — er steht in der Patch-Zeile und in jeder Meldung. */
export const name = 'pmh-world-static'

/**
 * Der Dienst, ohne den es nichts zu registrieren gibt.
 *
 * **Warum nur `webServer`.** Ein `inject` auf `connection` war schon einmal ein Fehler
 * (`@prometheus-harness/health`, dort nachzulesen): fehlt der Dienst, hängt der Loader das Plugin
 * **nie** ein, und die Route antwortet **404** statt zu sagen, was fehlt. Ein Ausfall, der
 * verschwindet, ist der teurere Fehler.
 */
export const inject = ['webServer']

/**
 * **Der Pfad, unter dem die Welt liegt** — ohne Schlußstrich, so verlangt es die Route des Kerns
 * (`WebRoute.path`: *„Absolute pathname, no trailing slash"*).
 *
 * Derselbe Wert steht in zwei weiteren Dateien: im Umschalter des Chats
 * (`packages/client/world-switch/src/index.ts`) und in `scripts/world-path.mjs`. Drei Nennungen
 * derselben Sache sind zwei zu viel — deshalb **vergleicht** der Buendel-Pruefer sie
 * (`scripts/client-buendel.mjs`, Art `verhalten`): driftet eine, faellt der Bau rot aus, statt dass
 * der Umschalter ins Leere zeigt.
 */
export const WORLD_PATH = '/universe'

/**
 * Das Verzeichnis der gebauten Welt.
 *
 * **Warum der Weg aus dem Modulpfad kommt und nicht aus dem Arbeitsverzeichnis.** Ein
 * Auslieferer, dessen Ziel davon abhängt, **wo** jemand den Host startet, liefert je nach
 * Aufrufort etwas anderes aus — und im schlimmsten Fall ein leeres Verzeichnis unter demselben
 * Pfad. `import.meta.url` ist dagegen der Ort **dieser** Datei.
 *
 * **Vier Ebenen, nicht drei** — und das war ein gemessener Fehler, kein Zählfehler auf dem Papier:
 * der erste Anlauf stieg drei Ebenen auf und landete bei
 * `…/packages/apps/universe/dist`. Der Host antwortete auf jede Anfrage mit **503** und dem Pfad,
 * den er suchte — genau so soll ein fehlender Bau aussehen (sichtbar, mit dem Ort). Die Kette ist:
 *
 * ```
 * …/packages/web/world-static/src/index.ts
 *        ↑      ↑          ↑    ↑
 *        │      │          │    └── src
 *        │      │          └─────── world-static
 *        │      └────────────────── web
 *        └───────────────────────── packages   → dann apps/universe/dist
 * ```
 */
export const WORLD_DIR = fileURLToPath(new URL('../../../../apps/universe/dist', import.meta.url))

/**
 * Der Inhaltstyp zu einer Dateiendung.
 *
 * **Warum eine feste Tabelle und kein Blick in `mime-db`.** Es sind sechs Endungen, die diese Welt
 * erzeugt (HTML, JS, CSS, zwei Schriftformate, SVG). Eine Abhängigkeit für sechs Zeilen wäre teurer
 * als die Tabelle — und die Tabelle ist **nachprüfbar** (`tests/world-static.test.ts`).
 *
 * Die Schriftformate müssen dabei sein: die Marken-Schrift (Montserrat) liegt als `.woff2` neben
 * dem CSS. Fehlt der Typ, liefert der Browser die Datei zwar aus, verwirft sie aber — und die
 * Oberfläche fällt **still** auf die Systemschrift zurück. Genau dieser Fall ist in diesem Projekt
 * schon einmal aufgetreten (siehe `apps/universe/src/design-system.css`, Abschnitt über die
 * Schriften).
 */
export const TYPEN: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Der Inhaltstyp zu einem Dateinamen.
 *
 * @param datei - der Dateiname (oder Pfad)
 * @returns der Inhaltstyp; unbekannte Endungen werden als Binärdaten ausgeliefert
 */
export function typFuer(datei: string): string {
  return TYPEN[extname(datei).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * **Der Pfad der Anfrage als Datei im Zielbaum — oder `undefined`.**
 *
 * Das ist die **eine** Stelle, an der eine Adresse aus dem Netz zu einem Dateipfad wird, und sie ist
 * absichtlich streng. Abgelehnt wird:
 *
 * | Eingabe | Warum |
 * |---|---|
 * | ein Pfad, der nicht mit {@link WORLD_PATH} beginnt | diese Route ist nicht zuständig |
 * | `..` in irgendeiner Form (`%2e%2e`, `..\\`) | **Ausbruch** aus dem Zielbaum — der klassische Fehler |
 * | ein Null-Zeichen oder eine Steuerzeichenfolge | im Dateisystem nicht darstellbar, in manchen Kernen ein Abschneiden |
 * | ein Ziel, das nach dem Auflösen **nicht** unter dem Zielbaum liegt | die letzte Prüfung, die auch dann greift, wenn eine Regel oben übersehen wurde |
 *
 * **Warum die letzte Prüfung `resolve` benutzt und nicht `startsWith` auf der Zeichenkette.** Ein
 * Vergleich zweier Zeichenketten hält `…/dist-anderes/x` für „innerhalb von `…/dist`", weil der
 * Präfix passt. `resolve` macht daraus einen **kanonischen** Pfad, und der Vergleich mit
 * `basis + sep` ist dann eine Aussage über das Verzeichnis, nicht über den Text.
 *
 * @param basis - das Wurzelverzeichnis der Auslieferung
 * @param anfrage - `req.url` (mit Abfrageteil, wie er kommt)
 * @returns der absolute Dateipfad oder `undefined`, wenn die Anfrage nicht hierher gehört
 */
export function zieldatei(basis: string, anfrage: string): string | undefined {
  const roh = anfrage.split('?')[0] ?? ''
  /*
   * **Die Grenze des Präfixes — und der Fehler, den die Prüfung gefunden hat.**
   *
   * Hier stand `roh.startsWith(WORLD_PATH)`. Das lässt **`/universeX/index.html`** durch: der Text
   * beginnt mit dem Pfad, gehört aber nicht dazu. Ein Präfix ist eine **Verzeichnisgrenze**, keine
   * Zeichenkette — richtig ist „gleich" **oder** „mit Schrägstrich danach".
   *
   * (Der Kern würde `/universeX` gar nicht an diese Route geben — seine Präfix-Regel lautet „p und
   * p/<anything>". Diese Prüfung ist die **zweite** Zaunlatte, und eine zweite Latte, die zu weit
   * greift, ist keine.)
   */
  if (roh !== WORLD_PATH && !roh.startsWith(`${WORLD_PATH}/`)) return undefined
  const rest = roh === WORLD_PATH || roh === `${WORLD_PATH}/` ? '/' : roh.slice(WORLD_PATH.length)
  if (rest === '' || rest.includes('..')) return undefined
  if (/[\u0000-\u001f\u007f]/u.test(rest)) return undefined
  let zerlegt: string
  try {
    zerlegt = decodeURIComponent(rest)
  } catch {
    // Eine kaputte Prozentfolge (`%zz`) ist keine Adresse, die man auflösen kann.
    return undefined
  }
  if (zerlegt.includes('..') || zerlegt.includes('\u0000')) return undefined
  const wurzel = resolve(basis)
  const ziel = resolve(wurzel, `.${zerlegt.startsWith('/') ? zerlegt : `/${zerlegt}`}`)
  if (ziel !== wurzel && !ziel.startsWith(wurzel + sep)) return undefined
  return ziel
}

/**
 * Eine Antwort mit Text — und **ausdrücklich** beendet.
 *
 * `Content-Length` steht dabei: der Webserver des Kerns verdichtet sonst ab 1.024 Byte, und eine
 * Antwort ohne Längenangabe gilt dort als „unbekannte Länge".
 *
 * @param res - die Antwort
 * @param status - der Statuscode
 * @param text - der Text
 * @param kopf - weitere Kopfdaten
 * @param nurKopf - ob nur die Kopfdaten gesendet werden (HEAD)
 */
function sendeText(
  res: ServerResponse,
  status: number,
  text: string,
  kopf: Readonly<Record<string, string>> = {},
  nurKopf = false,
): void {
  const roh = Buffer.from(text, 'utf8')
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Length', String(roh.byteLength))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  for (const [k, w] of Object.entries(kopf)) res.setHeader(k, w)
  if (nurKopf) res.end()
  else res.end(roh)
}

/**
 * Baut den Handler der Route.
 *
 * **Warum als eigene Funktion mit übergebenem Verzeichnis.** Damit ist er **ohne** Host prüfbar:
 * `tests/world-static.test.ts` legt ein Wegwerf-Verzeichnis an, legt Dateien hinein und stellt
 * Anfragen — inklusive der Anfragen, die **abgelehnt** werden müssen. Wer den Handler erst im
 * laufenden Host prüfen kann, prüft ihn nie.
 *
 * @param basis - das Verzeichnis der gebauten Welt
 * @returns der Handler
 */
export function macheWeltHandler(basis: string): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const methode = req.method ?? 'GET'
    if (methode !== 'GET' && methode !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      sendeText(res, 405, 'Nur GET und HEAD.\n')
      return
    }
    const nurKopf = methode === 'HEAD'
    const ziel = zieldatei(basis, req.url ?? '')
    if (ziel === undefined) {
      sendeText(res, 404, 'Nicht gefunden.\n')
      return
    }
    // **Ohne Bau gibt es nichts auszuliefern — und das wird gesagt.**
    if (!existsSync(basis)) {
      sendeText(
        res,
        503,
        'Die Welt ist nicht gebaut.\n' +
          `Erwartet: ${basis}\n` +
          'Bauen: `bun run build` in apps/universe — `bun run start` tut das beim Start von selbst.\n',
        { 'Retry-After': '5' },
      )
      return
    }
    const datei = statSync(ziel, { throwIfNoEntry: false })
    if (datei === undefined || datei.isDirectory()) {
      /*
       * **Der Schlußstrich gehört an den PFAD, nicht an die Adresse — und das war ein echter Fehler.**
       *
       * Hier stand `${req.url}/`. Das hängt den Strich an die **ganze** Adresse, also auch hinter den
       * Abfrageteil: aus `/universe/?room=alice` wurde `/universe/?room=alice/`.
       *
       * **Gemessen am 16.10.2026, an der Stilvorlage.** Die Umschaltung wird über `?stil=…` geprüft
       * (siehe `apps/universe/src/stil.ts`). Die Seite sah `?room=stilprobe&stil=prometheus/` — der
       * Wert hieß also `prometheus/`, war damit **unbekannt**, wurde verworfen, und die Vorlage
       * schaltete **nicht** um. Ohne Fehlermeldung, ohne roten Test: die Einstellung speicherte, das
       * Attribut stand im Dokument, und das Bild blieb.
       *
       * **Warum es bis dahin niemandem auffiel.** Der Raum ist der einzige Abfragewert, den es vorher
       * gab — und `normalizeRoom` (`apps/universe/src/room.ts`) schneidet Sonderzeichen weg:
       * `alice/` wird zu `alice`. Die Bereinigung hat den Fehler **verdeckt**. Ein Wert, der genau
       * stimmen muß, deckt ihn auf — und genau so einen gibt es jetzt.
       *
       * Die Prüfung sitzt deshalb **auf dem Pfad** (ein `/` im Abfrageteil darf keine Umleitung
       * auslösen) und der Abfrageteil wird unverändert mitgenommen.
       */
      const [pfad = WORLD_PATH, abfrage] = (req.url ?? WORLD_PATH).split('?')
      if (datei?.isDirectory() === true && !pfad.endsWith('/')) {
        const zielAdresse = `${pfad}/${abfrage === undefined ? '' : `?${abfrage}`}`
        sendeText(res, 301, 'Weiterleitung.\n', { Location: zielAdresse })
        return
      }
      const index = join(ziel, 'index.html')
      if (existsSync(index)) {
        sendeDatei(res, index, nurKopf)
        return
      }
      sendeText(res, 404, 'Nicht gefunden.\n')
      return
    }
    sendeDatei(res, ziel, nurKopf)
  }
}

/**
 * Sendet eine Datei aus dem Zielbaum.
 *
 * @param res - die Antwort
 * @param datei - der absolute Pfad
 * @param nurKopf - ob nur die Kopfdaten gesendet werden (HEAD)
 */
function sendeDatei(res: ServerResponse, datei: string, nurKopf: boolean): void {
  const inhalt = readFileSync(datei)
  res.statusCode = 200
  res.setHeader('Content-Type', typFuer(datei))
  res.setHeader('Content-Length', String(inhalt.byteLength))
  // Siehe Dateikopf: ein Prototyp, der die alte Fassung zeigt, kostet mehr Zeit, als er spart.
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (nurKopf) res.end()
  else res.end(inhalt)
}

/**
 * Hängt die Route ein.
 *
 * **Eine** Route, `kind: 'prefix'` — sie deckt `/universe` **und** `/universe/<alles>` ab. Zwei
 * getrennte Routen (eine exakte für den Ordner, eine Präfix-Route für den Rest) wären zwei Stellen,
 * an denen dasselbe entschieden wird.
 *
 * @param ctx - der Plugin-Kontext mit dem Webserver
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const route: WebRoute = {
      kind: 'prefix',
      path: WORLD_PATH,
      handler: macheWeltHandler(WORLD_DIR),
    }
    const ab = ctx.webServer.register(route)
    return () => {
      ab()
    }
  }, `${name} ${WORLD_PATH}`)
}

export default apply
