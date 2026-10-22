/**
 * **Die zwei HTTP-Handgriffe dieses Pakets** — eine JSON-Antwort schreiben und
 * einen JSON-Körper lesen.
 *
 * ## Warum das eine eigene Datei ist
 *
 * Beide Funktionen sind **ohne Host** prüfbar: `json` bekommt eine Antwort,
 * `readJson` eine Anfrage, und keiner der beiden braucht einen laufenden
 * Webserver. Genau deshalb stehen sie hier und nicht zwischen den Routen — ein
 * Fehler in der Körperprüfung ist ein Fehler **dieser** Datei, nicht des
 * Graphify-Lesers.
 *
 * ## Die Kopfzeilen sind Absicht
 *
 * * `no-store` — eine Statusauskunft, die den vorigen Lauf zeigt, ist eine
 *   falsche Auskunft. Es gibt keinen Zwischenspeicher, der hier etwas sparen
 *   würde.
 * * `nosniff` — die Antwort ist JSON und soll auch als JSON gelesen werden.
 *
 * @module @prometheus-harness/world-graphify/http
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** Die Kopfzeilen **jeder** Antwort dieses Pakets. */
export const JSON_KOPF: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

/**
 * Schreibt eine JSON-Antwort — und beendet sie ausdrücklich.
 *
 * `Content-Length` steht dabei: der Webserver des Kerns verdichtet sonst ab
 * 1.024 Byte, und eine Antwort ohne Längenangabe gilt dort als „unbekannte
 * Länge".
 *
 * @param res - die Antwort
 * @param status - der Statuscode
 * @param wert - der Wert, der als JSON geschrieben wird
 */
export function json(res: ServerResponse, status: number, wert: unknown): void {
  const koerper = Buffer.from(JSON.stringify(wert), 'utf8')
  res.statusCode = status
  for (const [name, wertDesKopfs] of Object.entries(JSON_KOPF)) res.setHeader(name, wertDesKopfs)
  res.setHeader('Content-Length', String(koerper.byteLength))
  res.end(koerper)
}

/** Die Grenze eines JSON-Körpers, wenn der Aufrufer keine nennt. */
export const MAX_JSON_BYTES = 64 * 1024

/** Das Ergebnis von {@link readJson}. */
export type JsonErgebnis =
  | { readonly ok: true; readonly wert: unknown }
  | { readonly ok: false; readonly status: 400 | 413; readonly error: string }

/**
 * Liest den Körper einer Anfrage als JSON.
 *
 * **Die Grenze wird beim Lesen geprüft, nicht erst danach.** `Content-Length`
 * ist ein Hinweis und keine Zusage; ein Körper ohne Längenangabe (chunked)
 * könnte beliebig groß sein. Deshalb zählt die Schleife selbst mit und bricht
 * ab, sobald {@link MAX_JSON_BYTES} überschritten ist — ein Wirt, der erst
 * alles einliest und dann ablehnt, hat schon zu viel gelesen.
 *
 * Ein **leerer** Körper gilt als `{}`: beide POST-Routen haben ausschließlich
 * optionale Felder, und „nichts gesagt" ist dort ein gültiger Satz.
 *
 * @param req - die Anfrage
 * @param maxBytes - die Obergrenze in Bytes
 * @returns der Wert oder der Grund der Ablehnung
 */
export async function readJson(req: IncomingMessage, maxBytes: number = MAX_JSON_BYTES): Promise<JsonErgebnis> {
  const angekuendigt = req.headers['content-length']
  if (typeof angekuendigt === 'string') {
    const laenge = Number.parseInt(angekuendigt, 10)
    if (Number.isFinite(laenge) && laenge > maxBytes) {
      return { ok: false, status: 413, error: `Der Körper ist größer als ${maxBytes} Bytes.` }
    }
  }
  const teile: Buffer[] = []
  let gesamt = 0
  const strom: AsyncIterable<unknown> = req
  try {
    for await (const stueck of strom) {
      if (typeof stueck === 'string') {
        const puffer = Buffer.from(stueck, 'utf8')
        gesamt += puffer.byteLength
        if (gesamt > maxBytes) return { ok: false, status: 413, error: `Der Körper ist größer als ${maxBytes} Bytes.` }
        teile.push(puffer)
        continue
      }
      if (stueck instanceof Uint8Array) {
        gesamt += stueck.byteLength
        if (gesamt > maxBytes) return { ok: false, status: 413, error: `Der Körper ist größer als ${maxBytes} Bytes.` }
        teile.push(Buffer.from(stueck))
        continue
      }
      return { ok: false, status: 400, error: 'Der Körper enthält einen unbekannten Datentyp.' }
    }
  } catch {
    return { ok: false, status: 400, error: 'Der Körper konnte nicht gelesen werden.' }
  }
  const text = Buffer.concat(teile).toString('utf8').trim()
  if (text === '') return { ok: true, wert: {} }
  try {
    return { ok: true, wert: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, status: 400, error: 'Der Körper ist kein gültiges JSON.' }
  }
}

/**
 * Normalisiert eine Peer-Adresse: `::ffff:127.0.0.1` wird zu `127.0.0.1`.
 *
 * **Warum das nötig ist.** Ein IPv6-Socket meldet einen IPv4-Client als
 * *mapped* Adresse. Ohne Normalisierung sähe `127.0.0.1` wie eine fremde
 * Adresse aus, und die Routen dieses Pakets antworteten auf jedem Rechner mit
 * 403 — auch auf dem, auf dem sie laufen.
 *
 * @param adresse - die rohe Adresse aus `req.socket.remoteAddress`
 * @returns die normalisierte Adresse in Kleinschreibung
 */
export function normalisiereAdresse(adresse: string): string {
  const klein = adresse.trim().toLowerCase()
  return klein.startsWith('::ffff:') ? klein.slice('::ffff:'.length) : klein
}

/**
 * Kommt die Anfrage von **diesem** Rechner?
 *
 * Erlaubt ist der gesamte Loopback-Bereich: `127.0.0.0/8` und `::1`, jeweils
 * auch in der IPv4-gemappten Form. Alles andere wird abgewiesen — die Routen
 * lesen Dateien, starten ein Programm und schreiben eine Konfiguration; das
 * gehört nicht ins Netz.
 *
 * @param req - die Anfrage
 * @returns ob die Peer-Adresse loopback ist
 */
export function istLokal(req: IncomingMessage): boolean {
  const adresse = req.socket.remoteAddress
  if (adresse === undefined) return false
  const normal = normalisiereAdresse(adresse)
  return normal === '::1' || normal === '127.0.0.1' || normal.startsWith('127.')
}
