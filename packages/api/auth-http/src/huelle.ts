/**
 * `@prometheus-harness/auth-http/huelle` — **die Oberfläche unter einem Pfad**.
 *
 * ## Warum es diese Datei gibt
 *
 * Der Wirt liefert die gebaute Oberfläche nur auf `/` (und auf seinem `distIndex`) aus. Der
 * SPA-Server, der den Fallback hält, sagt das selbst: *„Pathname routing is explicit — the current
 * client enters through the root or configured index path and has no History API pathname routes.
 * Adding one requires an explicit server rule and real-composition coverage rather than a broad
 * fallback for every miss."* (`dsh-host-frontend-static`, README.)
 *
 * Gemessen am 28.10.2026 gegen den laufenden Wirt: `/w` → **404**, `/c/abc` → **404**. Deshalb
 * hatte ich die Adresse in eine Abfrage gelegt (`?w`, `?s=…`) — und das war falsch: eine Abfrage
 * ist keine Adresse. Hier entsteht die **explizite Regel**, die dem SPA-Server fehlt.
 *
 * ## Was eine Pfad-Seite von `/` unterscheidet
 *
 * | Punkt | `/` (SPA-Server) | `/c/<Sitzung>` (hier) |
 * |---|---|---|
 * | Index-Body | `renderIndex(index.html)` | derselbe Aufruf — sonst fehlt der Boot-Manifest |
 * | Basis | `<base href="./">` | **`<base href="/">`** — `./assets/…` löst sonst auf `/c/…` auf |
 * | Anmeldung | Sperre des Kerns | unsere Sitzung, Umleitung auf `/anmeldung/` |
 *
 * Das Basis-Tag ist der Punkt, den man übersieht: die ausgelieferte `index.html` lädt
 * `./assets/index-*.js`. Mit `href="./"` unter `/c/abc` würde daraus `/c/assets/…` — die Seite
 * bliebe leer. Deshalb absolut.
 *
 * @module @prometheus-harness/auth-http/huelle
 */

import { readFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pruefeSitzung } from './sitzung.ts'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { macheWeg, type Weg } from './http.ts'
import { PFAD_ANMELDUNG } from './login.ts'
import type { Umgebung } from './paths.ts'

/**
 * Ein Chat unter seiner Adresse — **Prefix ohne Schrägstrich am Ende**.
 *
 * Der Vertrag des Wirtes sagt: *„Absolute pathname, no trailing slash"*, und die Auflösung prüft
 * `pathname === prefix || pathname.startsWith(prefix + '/')`
 * (`dsh-host-webserver/lib/index.js:472`). `/c` deckt damit `/c` und `/c/<Sitzung>` ab — und
 * **nicht** `/config`.
 */
export const PFAD_CHAT = '/c'

/** Die Übersicht der Arbeitsbereiche. */
export const PFAD_UEBERSICHT = '/w'

/** Was der Dienst des Wirts können muß — **nur diese eine Methode**. */
export interface IndexRenderer {
  /**
   * Rendert die strukturierten Einschübe in den Index.
   *
   * **Gemessen:** `renderIndex(html: string): string` steht im Dienst `WebServer`
   * (`dsh-host-webserver/lib/types/index.d.ts:206`). Ohne diesen Aufruf fehlt der Boot-Manifest
   * und die Seite bleibt leer.
   */
  renderIndex: (html: string) => string
}

/**
 * Wo die gebaute `index.html` liegt.
 *
 * **Nachgesehen, nicht geraten:** `resolveDistIndex()` in `packages/bundle/web-app/src/index.ts`
 * löst auf `join(dirname(require.resolve('@deepseek-ai/dsh-web-frontend/package.json')), 'dist',
 * 'index.html')` auf. Dieselbe Auflösung hier — eine zweite, abweichende wäre eine zweite Wahrheit.
 *
 * @returns der absolute Pfad, oder `undefined`, wenn das Paket nicht auflösbar ist
 */
export function distIndex(): string | undefined {
  try {
    const gebraucht = createRequire(import.meta.url)
    return join(dirname(gebraucht.resolve('@deepseek-ai/dsh-web-frontend/package.json')), 'dist', 'index.html')
  } catch {
    return undefined
  }
}

/**
 * Setzt die Wurzel als Basis in den Index.
 *
 * Ein schon vorhandenes `<base>` wird **nicht** überschrieben: der Wirt setzt seine eigene Basis,
 * wenn er den Index selbst ausliefert, und zwei Basis-Tags wären ein Fehler, den der Browser
 * stillschweigend auflöst.
 *
 * @param html - der gerenderte Index
 * @returns derselbe Index mit `<base href="/">` direkt nach `<head>`
 */
export function mitWurzelBasis(html: string): string {
  if (/<base\s/i.test(html)) return html
  return html.replace(/<head(\s[^>]*)?>/i, (treffer) => `${treffer}<base href="/" />`)
}

/** Leitet auf die Anmeldeseite — **303, kein 401**: das ist eine Seite, keine Schnittstelle. */
function zurAnmeldung(res: ServerResponse): void {
  res.writeHead(303, { location: PFAD_ANMELDUNG, 'cache-control': 'no-store', 'content-length': '0' })
  res.end()
}

/**
 * Beantwortet einen Seitenpfad mit der Hülle.
 *
 * @param umg - die Umgebung
 * @param dienst - der Web-Server des Wirts (für `renderIndex`)
 * @returns der Weg
 */
/**
 * Baut den Körper der Hülle aus einer Datei: lesen, rendern, Basis setzen.
 *
 * **Warum das eine eigene, ausgelagerte Funktion ist.** Die Reihenfolge ist die Stelle, an der
 * dieser Weg bei einem Paket-Update still kaputtgeht: fällt `renderIndex` weg, fehlt der
 * Boot-Manifest, und die Seite bleibt **leer** — ohne Fehlermeldung. Als eigene Funktion ist genau
 * das prüfbar (`tests/huelle.test.ts`), ohne eine Sitzung in der Datenbank zu brauchen.
 *
 * @param datei - der absolute Pfad der gebauten `index.html`
 * @param dienst - der Web-Server des Wirts, oder `undefined` in einer Umgebung ohne ihn
 * @returns der fertige HTML-Körper
 */
export async function huelleInhalt(
  datei: string,
  dienst: () => IndexRenderer | undefined,
): Promise<string> {
  const roh = await readFile(datei, 'utf8')
  const gerendert = dienst()?.renderIndex(roh) ?? roh
  return mitWurzelBasis(gerendert)
}

export function wegHuelle(umg: Umgebung, dienst: () => IndexRenderer | undefined): Weg {
  return async (req, res) => {
    /*
     * **Nur eine echte Sitzung.** `pruefeSitzung` hat eine zweite Tür (Loopback, nur lesend) —
     * die ist für Notizen gedacht und wäre hier falsch: die Hülle ist die ganze Anwendung, nicht
     * ein Blick in Daten. Deshalb wird ausdrücklich der Sitzungskeks geprüft, nicht der Weg.
     */
    const geprueft = await pruefeSitzung(umg, req)
    if (!geprueft.ok) {
      /*
       * **Dieselbe Prüfung wie `/` — und das ist die Korrektur.**
       *
       * Vorher stand hier ausschließlich der Sitzungskeks. Damit war die Hülle für einen Browser
       * auf demselben Rechner **strenger als die Startseite**: `/` kam über die Loopback-Tür
       * herein, `/c/<Sitzung>` leitete auf die Anmeldung. Ein Link in einen neuen Tab konnte so
       * niemals funktionieren. Wer `/` bekommt, bekommt auch die Hülle — es ist dieselbe Anwendung.
       */
      zurAnmeldung(res)
      return
    }
    const datei = distIndex()
    if (datei === undefined) {
      // **Kein Bau, keine Seite.** Ein leerer 404 wäre hier eine Lüge — die Ursache ist die
      // Zusammensetzung, nicht der Pfad.
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end('Kein Bau der Oberfläche gefunden.\n')
      return
    }
    try {
      const inhalt = await huelleInhalt(datei, dienst)
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': String(Buffer.byteLength(inhalt)),
      })
      res.end(req.method === 'HEAD' ? undefined : inhalt)
    } catch (fehler) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end(`Die Oberfläche ließ sich nicht lesen: ${fehler instanceof Error ? fehler.message : 'unbekannt'}\n`)
    }
  }
}

/**
 * Die Hüllen-Wege, fertig für `ctx.webServer.register`.
 *
 * **Prefix für Chats, exakt für die Übersicht.** Ein Prefix auf `/c` deckt jede Sitzungskennung ab;
 * `/w` ist genau ein Pfad und soll keiner werden. Die Auflösung des Wirtes ist
 * exakt → längster Prefix → Fallback; beide hier gewinnen also vor dem SPA-Server.
 *
 * @param umg - die Umgebung
 * @param dienst - der Web-Server des Wirts
 * @returns die Wege
 */
export function huelleWege(umg: Umgebung, dienst: () => IndexRenderer | undefined): readonly WebRoute[] {
  const seite = macheWeg('GET', wegHuelle(umg, dienst), 'huelle-seite')
  return [
    { kind: 'prefix', path: PFAD_CHAT, handler: seite },
    { kind: 'exact', path: PFAD_UEBERSICHT, handler: seite },
  ]
}
