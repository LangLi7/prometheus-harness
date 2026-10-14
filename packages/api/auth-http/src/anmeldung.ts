/**
 * `@prometheus-harness/auth-http/anmeldung` — die Anmeldeseite **am Ursprung des Hosts**
 * und die **Schnittstelle danach**.
 *
 * ## Warum die Seite vom Host selbst kommen muß
 *
 * Unsere Anmeldung setzt ihre Kekse mit **`SameSite=Strict`** (gemessen an `Set-Cookie`).
 * Ein solcher Keks wird **nur** bei Anfragen an **dieselbe Herkunft** mitgeschickt. Kam die
 * Seite bisher von einem Entwicklungsserver auf einem anderen Port (`:5180`), ist das eine
 * **andere Herkunft** — der Keks kommt nie an, und die Anmeldung ist **still wirkungslos**.
 * Im Entwicklungsserver fällt das nicht auf, weil dort ein Proxy `/api` weiterleitet; im
 * Betrieb gibt es diesen Proxy nicht.
 *
 * Deshalb liefert **der Host** die gebaute Seite aus — unter **seinem** Port, **seinem**
 * Ursprung. Der Entwicklungsserver bleibt, was er ist: ein Werkzeug zum Arbeiten.
 *
 * ## Die Schnittstelle danach: `/start`
 *
 * Nach der Anmeldung geht es hierher. Die Seite ist **serverseitig gerendert**: sie liest die
 * Sitzung über **dieselbe** Funktion wie `GET /api/pmh/auth/me` ({@link werBinIch}) und zeigt,
 * wer angemeldet ist. Kein JavaScript — deshalb kommt die Richtlinie ohne `script-src` aus,
 * und es gibt nichts, was ein eingeschmuggeltes Skript ausführen könnte.
 *
 * **Was sie ausdrücklich NICHT tut: die zweite Tür öffnen.** Der Harness verlangt für seine
 * Oberfläche einen **Token** aus der Konsole des Hosts. Diese Seite zeigt den Weg dorthin an
 * und **sagt auf der Seite selbst**, daß dafür der Token nötig ist. Ein Token, der hier
 * ausgegeben würde, wäre in der Adreßzeile, im Verlauf und im Zugriffsprotokoll — und er gilt
 * für **alles**, nicht nur für diese Sitzung. Die Verbindung der beiden Türen ist ein eigener
 * Schritt mit eigener Entscheidung, kein Nebenbei.
 *
 * ## Warum die Kontodaten **entschärft** werden
 *
 * `displayName` und `email` sind **Benutzereingabe**. Wer sie ungeprüft in HTML setzt, baut
 * ein XSS-Einfallstor in genau die Seite, die vor der Anmeldung steht. Die bestehende Seite
 * (`seite.ts`) brauchte keinen Entschärfer, weil sie alles im Browser mit `textContent` setzt;
 * diese hier rendert serverseitig und braucht einen ({@link entschaerfe}).
 *
 * ## Wenn kein Bau da ist
 *
 * Dann wird **nicht** auf einen Fehler umgeleitet, sondern auf die **eingebaute** Seite
 * (`/pmh/anmelden`). Sie ist geprüft, braucht keinen Bau und kann dieselben vier Wege
 * bedienen. Ein 503 wäre die schlechtere Antwort: die Anmeldung wäre dann wegen eines
 * fehlenden `bun run build` unmöglich. Beim Einbinden steht der Hinweis im Protokoll, damit
 * die Ursache auffindbar bleibt.
 *
 * @module @prometheus-harness/auth-http/anmeldung
 */

import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import type { ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
// **`sende` wird umbenannt hereingeholt.** Diese Datei hat ein **eigenes** `sende` für HTML
// (es setzt die Kopfzeilen der Seite); `sende` aus `http.ts` schreibt eine JSON-Antwort.
// Zwei Funktionen mit demselben Namen wären ein Namensstreit, den der Typlauf gewinnt.
import { macheWeg, sende as sendeAntwort, type Weg } from './http.ts'
import { PFAD_SEITE } from './seite.ts'
import { gut, cookieWert, sitzungsCookieName, werBinIch, type Umgebung } from './wege.ts'
// **Die Sprachtabelle.** Dieselbe Tabelle benutzt die Seite im Browser (`apps/login_web`) —
// eine Abschrift auf jeder Seite wäre eine zweite Wahrheit.
import {
  KEKS_SPRACHE,
  SPRACHEN,
  VORGABE_SPRACHE,
  istSprache,
  spracheAusKeks,
  texteFuer,
  type Texte,
} from '@prometheus-harness/sprachen'

/** Der Ort der gebauten Anmeldeseite — **am Ursprung des Hosts**, nicht auf einem eigenen Port. */
export const PFAD_ANMELDUNG = '/anmeldung'

/** Die Schnittstelle **nach** der Anmeldung. */
export const PFAD_START = '/start'

/** Die angebotenen Sprachen — die Seite im Browser holt sie hier. */
export const PFAD_SPRACHEN = '/api/pmh/auth/sprachen'

/** Der Name des Parameters, mit dem `/start` die Sprache wechselt (`?sprache=en`). */
export const PARAMETER_SPRACHE = 'sprache'

/**
 * Die Umgebungsangabe, mit der der Bau woanders liegen darf.
 *
 * Nötig für die Prüfungen (sie legen einen Bau in ein Wegwerf-Verzeichnis) und für den
 * Betrieb, wenn der Host aus einem anderen Verzeichnis gestartet wird.
 */
export const ANGABE_BAU = 'PMH_ANMELDUNG_BAU'

/**
 * Die Dateitypen, die ausgeliefert werden.
 *
 * **Warum eine feste Tabelle und kein Ratewerkzeug.** Was nicht in der Tabelle steht, wird
 * als `application/octet-stream` geschickt — **plus** `x-content-type-options: nosniff`.
 * Damit kann der Browser es nicht als Skript oder HTML **umdeuten**. Ein geratener Typ wäre
 * genau der Weg, auf dem aus einer Textdatei ausführbarer Code wird.
 */
const TYPEN: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

/** Der Typ für einen Dateinamen. */
function typFuer(name: string): string {
  return TYPEN[extname(name).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Die Richtlinie für den **Bau** (React-Anwendung).
 *
 * `script-src 'self'` und `style-src 'self'` — die Anwendung lädt ihre Bündel von **unserem**
 * Ursprung, und nichts von fremden. `connect-src 'self'` erlaubt die Aufrufe an die vier
 * Wege und keine nach außen. `img-src 'self' data:` wegen eingebetteter Symbole.
 */
const CSP_BAU =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
  "connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"

/** Die Richtlinie für die Schnittstelle — **ohne** `script-src`, weil sie kein Skript hat. */
const CSP_HUB = "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"

/** Die Kopfzeilen, die **jede** Antwort dieser Datei trägt. */
function kopffelder(csp: string, typ: string): Record<string, string> {
  return {
    'content-type': typ,
    'content-security-policy': csp,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    // **Kein Zwischenspeicher.** Der Bau liegt lokal, die Dateinamen tragen den Inhalt,
    // und ein alter Stand im Zwischenspeicher wäre genau der Fehler, den niemand sieht.
    'cache-control': 'no-store',
  }
}

/**
 * Entschärft Text für HTML.
 *
 * **Fünf Zeichen, und jedes hat einen Grund:** `&` zuerst (sonst würden die eigenen
 * Ersetzungen noch einmal ersetzt), dann `<` und `>` (Tags), `"` und `'` (sie beenden ein
 * Attribut, auch wenn der Wert in Anführungszeichen steht).
 *
 * @param text - der rohe Text (darf `undefined` sein)
 * @returns Text, der in HTML nur als Text wirkt
 */
export function entschaerfe(text: string | undefined): string {
  if (text === undefined) return ''
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Wo der Bau der Anmeldeseite liegt.
 *
 * Vorgabe: `apps/login_web/dist` **unter dem Arbeitsverzeichnis**. Der Host wird aus der
 * Projektwurzel gestartet (`scripts/start.mjs`), dort liegt der Bau.
 *
 * @param umgebung - die Umgebung (für die Prüfungen ersetzbar)
 * @returns der aufgelöste, absolute Pfad
 */
export function bauVerzeichnis(umgebung: NodeJS.ProcessEnv = process.env): string {
  const eigenes = umgebung[ANGABE_BAU]
  if (eigenes !== undefined && eigenes.trim() !== '') return resolve(eigenes)
  return resolve(process.cwd(), 'apps', 'login_web', 'dist')
}

/**
 * Liegt ein brauchbarer Bau vor?
 *
 * Geprüft wird die **eine** Datei, ohne die nichts geht: `index.html`. Ein Verzeichnis mit
 * losen Dateien wäre kein Bau.
 *
 * @param bau - das Bauverzeichnis
 * @returns ob `index.html` lesbar ist
 */
export async function bauVorhanden(bau: string): Promise<boolean> {
  try {
    await readFile(resolve(bau, 'index.html'))
    return true
  } catch {
    return false
  }
}

/** Schreibt eine Weiterleitung ohne Körper. */
function leiteUm(res: ServerResponse, ziel: string): void {
  res.writeHead(303, { location: ziel, 'cache-control': 'no-store', 'content-length': '0' })
  res.end()
}

/** Schreibt eine kurze Antwort mit den Kopfzeilen dieser Datei. */
function sende(res: ServerResponse, csp: string, typ: string, koerper: string, status = 200): void {
  const bytes = Buffer.byteLength(koerper)
  res.writeHead(status, { ...kopffelder(csp, typ), 'content-length': String(bytes) })
  res.end(koerper)
}

/**
 * Der Weg, der die **gebaute** Anmeldeseite ausliefert.
 *
 * **Die Pfadprüfung ist der Kern.** Ein Auslieferer statischer Dateien ist der klassische Ort
 * für einen Ausbruch aus dem Verzeichnis (`../../…`). Abgewehrt wird **doppelt**: erstens
 * werden Rückstriche und Nullbytes abgelehnt, zweitens wird der aufgelöste Pfad gegen das
 * Bauverzeichnis geprüft — `resolve` räumt `..` auf, und was danach nicht **innerhalb** liegt,
 * wird nicht gelesen. Ein Bau, der auf einem Windows-Rechner mit anderen Trennzeichen
 * ankommt, fällt durch dieselbe Prüfung.
 *
 * @param bau - das Bauverzeichnis
 * @returns der Weg
 */
export function wegBau(bau: string): Weg {
  const wurzel = resolve(bau)
  return async (req, res) => {
    const pfad = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const rest = pfad.startsWith(PFAD_ANMELDUNG) ? pfad.slice(PFAD_ANMELDUNG.length) : pfad

    let rel: string
    try {
      rel = decodeURIComponent(rest).replace(/^\/+/, '')
    } catch {
      // Ein kaputter Prozentcode (`%zz`) ist keine Auskunft über Dateien, sondern Müll.
      sende(res, CSP_BAU, 'text/plain; charset=utf-8', 'Ungültiger Pfad.\n', 400)
      return
    }

    if (rel.includes('\0') || rel.includes('\\')) {
      sende(res, CSP_BAU, 'text/plain; charset=utf-8', 'Nicht gefunden.\n', 404)
      return
    }

    // **Der Bau selbst ist die Wurzel.** `/anmeldung` und `/anmeldung/` sind `index.html`.
    const datei = rel === '' ? 'index.html' : rel
    const ziel = resolve(wurzel, datei)
    if (ziel !== wurzel && !ziel.startsWith(wurzel + sep)) {
      sende(res, CSP_BAU, 'text/plain; charset=utf-8', 'Nicht gefunden.\n', 404)
      return
    }

    try {
      const inhalt = await readFile(ziel)
      const typ = typFuer(ziel)
      res.writeHead(200, { ...kopffelder(CSP_BAU, typ), 'content-length': String(inhalt.byteLength) })
      res.end(inhalt)
      return
    } catch {
      // **Kein Bau da?** Dann die eingebaute Seite. Sie ist geprüft und braucht keinen Bau —
      // ein 404 oder 503 würde die Anmeldung wegen einer fehlenden Bauausgabe unmöglich machen.
      if (datei === 'index.html' || !datei.includes('.')) {
        leiteUm(res, PFAD_SEITE)
        return
      }
      sende(res, CSP_BAU, 'text/plain; charset=utf-8', 'Nicht gefunden.\n', 404)
    }
  }
}

/**
 * Das HTML der Schnittstelle.
 *
 * **Ausgeführt, nicht nur gerufen:** die Prüfung ruft diese Funktion **direkt** mit einem
 * Namen, der HTML enthält, und verlangt, daß er entschärft ankommt. Über den Socket allein
 * ließe sich das nur mit einem echten Konto prüfen — und dann hinge die Sicherheitsprüfung an
 * einer Datenbank.
 *
 * **Kein Skript auf dieser Seite.** Deshalb kommt die Richtlinie ohne `script-src` aus, und
 * deshalb ist der Sprachumschalter aus **Links** gebaut: `?sprache=en` setzt den Keks und
 * leitet zurück. Ein Auswahlfeld hätte JavaScript gebraucht.
 *
 * @param konto - die gemessene Sitzung
 * @param texte - die Texte der gewählten Sprache
 * @param sprache - die Kennung der gewählten Sprache (für `lang` im HTML)
 * @returns die Seite
 */
export function schnittstelleHtml(
  konto: { readonly email?: string; readonly displayName?: string; readonly role?: string },
  texte: Texte = texteFuer(VORGABE_SPRACHE),
  sprache: string = VORGABE_SPRACHE,
): string {
  const name = entschaerfe(konto.displayName ?? konto.email ?? texte.rolleKonto)
  const adresse = entschaerfe(konto.email)
  const rolle = entschaerfe(konto.role)
  // Die **angebotene** Sprache steht als Text da, die andere als Link. Der Name jeder Sprache
  // kommt aus der Tabelle und ist damit ebenfalls entschärft.
  const wahl = SPRACHEN.map((eine) =>
    eine.id === sprache
      ? `<strong>${entschaerfe(eine.label)}</strong>`
      : `<a href="${PFAD_START}?${PARAMETER_SPRACHE}=${encodeURIComponent(eine.id)}">${entschaerfe(eine.label)}</a>`,
  ).join(' · ')
  return `<!doctype html>
<html lang="${entschaerfe(sprache)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${texte.startTitel}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 2rem 1rem; font: 16px/1.5 system-ui, sans-serif;
         background: Canvas; color: CanvasText; display: flex; justify-content: center; }
  main { width: 100%; max-width: 34rem; }
  h1 { font-size: 1.35rem; margin: 0 0 .25rem; }
  .konto { border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
           border-radius: .75rem; padding: 1rem; margin: 1rem 0; }
  .rolle { font-size: .8rem; opacity: .75; text-transform: uppercase; letter-spacing: .05em; }
  ul { list-style: none; padding: 0; margin: 1.5rem 0 0; }
  li { margin: 0 0 .6rem; }
  a { color: inherit; }
  .hinweis { font-size: .9rem; opacity: .8; border-left: 3px solid currentColor; padding-left: .75rem; }
  .sprache { font-size: .85rem; opacity: .8; margin: 0 0 1rem; }
  code { font-family: ui-monospace, monospace; font-size: .9em; }
</style>
</head>
<body>
<main>
  <p class="sprache">${texte.spracheLabel}: ${wahl}</p>
  <h1>${texte.startUeberschrift}</h1>
  <p class="rolle">${rolle === '' ? texte.rolleKonto : rolle}</p>
  <div class="konto">
    <strong>${name}</strong><br>
    <span>${adresse}</span>
  </div>

  <h2 style="font-size:1rem">${texte.startWeiter}</h2>
  <ul>
    <li><a href="/">${texte.startOberflaeche}</a> — ${texte.startOberflaecheHinweis}</li>
    <li><a href="${PFAD_ANMELDUNG}/">${texte.startAnmeldeseite}</a> — ${texte.startAnmeldeseiteHinweis}</li>
    <li><a href="${PFAD_SEITE}">${texte.startEingebaut}</a> — ${texte.startEingebautHinweis}</li>
    <li><a href="/api/ready">${texte.startZustand}</a> — ${texte.startZustandHinweis}</li>
  </ul>

  <p class="hinweis"><strong>${texte.zweiTuerenTitel}</strong> ${texte.zweiTueren}</p>
</main>
</body>
</html>
`
}

/**
 * Der Weg der Schnittstelle **nach** der Anmeldung.
 *
 * Ohne gültige Sitzung wird auf die Anmeldeseite umgeleitet — **303**, damit ein Neuladen
 * nicht den `GET` auf `/start` wiederholt, sondern der Adreßzeile folgt.
 *
 * **Der Sprachwechsel geht über die Adresse**: `?sprache=en` setzt den Keks und leitet auf
 * `/start` **ohne** Parameter zurück. So braucht der Umschalter kein Skript. Der Keks ist
 * **nicht** `HttpOnly` — die Seite im Browser muß ihn lesen und setzen können, genau wie den
 * CSRF-Keks. Er enthält auch nichts Geheimes: eine Sprache ist keine Berechtigung.
 *
 * @param umg - die Umgebung (Sitzungsspeicher)
 * @returns der Weg
 */
export function wegStart(umg: Umgebung): Weg {
  return async (req, res) => {
    const adresse = new URL(req.url ?? '/', 'http://127.0.0.1')
    const gewuenscht = adresse.searchParams.get(PARAMETER_SPRACHE)
    const ausKeks = spracheAusKeks(req.headers.cookie)
    const gilt = gewuenscht !== null && istSprache(gewuenscht) ? gewuenscht : ausKeks

    if (gewuenscht !== null && istSprache(gewuenscht) && gewuenscht !== ausKeks) {
      res.writeHead(303, {
        location: PFAD_START,
        'set-cookie': `${KEKS_SPRACHE}=${encodeURIComponent(gewuenscht)}; Path=/; SameSite=Strict`,
        'cache-control': 'no-store',
        'content-length': '0',
      })
      res.end()
      return
    }

    const geprueft = await werBinIch(umg, { token: cookieWert(req.headers.cookie, sitzungsCookieName(umg)) })
    if (geprueft.status !== 200 || geprueft.koerper === undefined) {
      leiteUm(res, `${PFAD_ANMELDUNG}/`)
      return
    }
    // **Dieselbe Quelle wie `/me`.** Die Antwort des Weges wird gelesen, nicht die Sitzung
    // ein zweites Mal ausgewertet: zwei Auswertungen wären zwei Wahrheiten.
    const koerper = geprueft.koerper as { readonly ok?: boolean; readonly value?: Record<string, unknown> }
    const wert = koerper.value ?? {}
    const konto = {
      ...(typeof wert.email === 'string' ? { email: wert.email } : {}),
      ...(typeof wert.displayName === 'string' ? { displayName: wert.displayName } : {}),
      ...(typeof wert.role === 'string' ? { role: wert.role } : {}),
    }
    sende(res, CSP_HUB, 'text/html; charset=utf-8', schnittstelleHtml(konto, texteFuer(gilt), gilt))
  }
}

/**
 * Der Weg, der die **angebotenen Sprachen** nennt.
 *
 * **Warum der Rechner das sagt und nicht die Seite.** Die Seite im Browser könnte die Liste
 * mitbündeln — dann stünde sie aber an zwei Stellen, und eine neue Sprache müßte zweimal
 * eingetragen werden. Hier ist der Rechner die Quelle: die Seite holt die Liste und fällt auf
 * die mitgebündelte zurück, falls der Aufruf scheitert.
 *
 * @returns der Weg
 */
export function wegSprachen(): Weg {
  return async (_req, res) => {
    sendeAntwort(
      res,
      gut({ sprachen: SPRACHEN.map((sprache) => ({ id: sprache.id, label: sprache.label })), vorgabe: VORGABE_SPRACHE }),
    )
  }
}

/**
 * Alle Wege dieses Moduls, fertig für `ctx.webServer.register`.
 *
 * **`prefix` für die Anmeldeseite**, weil sie ihre Bündel unter `/anmeldung/assets/…` lädt:
 * `prefix p` trifft `p` **und** `p/<beliebiges>` (gemessen am Kern,
 * `dsh-host-webserver/lib/types/index.d.ts`: *„prefix p matches p and p/<anything>"*).
 *
 * @param umg - die Umgebung
 * @param bau - das Bauverzeichnis
 * @returns die Wege
 */
export function anmeldungsWege(umg: Umgebung, bau: string): readonly WebRoute[] {
  return [
    { kind: 'prefix', path: PFAD_ANMELDUNG, handler: macheWeg('GET', wegBau(bau), 'anmeldung-bau') },
    { kind: 'exact', path: PFAD_START, handler: macheWeg('GET', wegStart(umg), 'anmeldung-start') },
    { kind: 'exact', path: PFAD_SPRACHEN, handler: macheWeg('GET', wegSprachen(), 'anmeldung-sprachen') },
  ]
}
