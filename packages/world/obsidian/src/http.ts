/**
 * Kleine HTTP-Bausteine der Obsidian-Routen: JSON-Antwort, JSON-Rumpf, Ortsprüfung.
 *
 * Bewusst ohne Rahmenwerk — die vier Routen brauchen nicht mehr. Alle Antworten
 * tragen `no-store` und `nosniff`: der Vault ändert sich auf der Platte, eine
 * zwischengespeicherte Antwort wäre eine Behauptung über einen alten Stand.
 *
 * @module @prometheus-harness/world-obsidian-provider/http
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** Höchstgröße eines Rumpfs, wenn der Aufrufer keine nennt. */
export const MAX_RUMPF_BYTES = 64 * 1024

/**
 * Ein abgelehnter Rumpf mit dem Status, den die Route daraus macht.
 *
 * 400: leer oder kein JSON. 413: zu groß.
 */
export class BodyFehler extends Error {
  readonly status: 400 | 413
  readonly code: 'leer' | 'kein-json' | 'zu-gross'

  constructor(status: 400 | 413, code: 'leer' | 'kein-json' | 'zu-gross', message: string) {
    super(message)
    this.name = 'BodyFehler'
    this.status = status
    this.code = code
  }
}

/**
 * Schreibt eine JSON-Antwort und beendet sie.
 *
 * @param res - die Antwort
 * @param status - der Statuscode
 * @param wert - der Wert, der als JSON geschrieben wird
 */
export function json(res: ServerResponse, status: number, wert: unknown): void {
  const roh = Buffer.from(JSON.stringify(wert), 'utf8')
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(roh.byteLength))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(roh)
}

/**
 * Entfernt die IPv4-Zuordnung (`::ffff:127.0.0.1` → `127.0.0.1`).
 *
 * @param adresse - die rohe Adresse des Sockets
 * @returns die Adresse ohne Zuordnungspräfix
 */
export function normalisiereAdresse(adresse: string | undefined): string | undefined {
  if (adresse === undefined) return undefined
  const praefix = '::ffff:'
  return adresse.startsWith(praefix) ? adresse.slice(praefix.length) : adresse
}

/**
 * Ist die Anfrage von diesem Rechner gekommen?
 *
 * Nur `127.0.0.1` und `::1` gelten als lokal; die Zuordnung `::ffff:` wird
 * vorher entfernt. Alles andere wird abgewiesen.
 *
 * @param req - die Anfrage
 * @returns ob die Gegenstelle lokal ist
 */
export function istLokal(req: IncomingMessage): boolean {
  const adresse = normalisiereAdresse(req.socket?.remoteAddress)
  return adresse === '127.0.0.1' || adresse === '::1'
}

/**
 * Liest einen JSON-Rumpf mit Größenbegrenzung.
 *
 * @param req - die Anfrage (async iterable)
 * @param maxBytes - die Höchstgröße in Byte
 * @returns der geparste Wert
 * @throws {@link BodyFehler} bei leerem, zu großem oder ungültigem Rumpf
 */
export async function readJson(req: IncomingMessage, maxBytes: number = MAX_RUMPF_BYTES): Promise<unknown> {
  const stuecke: Buffer[] = []
  let gesamt = 0
  for await (const teil of req as AsyncIterable<unknown>) {
    const puffer =
      typeof teil === 'string'
        ? Buffer.from(teil, 'utf8')
        : teil instanceof Uint8Array
          ? Buffer.from(teil)
          : undefined
    if (puffer === undefined) continue
    gesamt += puffer.byteLength
    if (gesamt > maxBytes) {
      throw new BodyFehler(413, 'zu-gross', `Der Rumpf ist größer als ${maxBytes} Byte.`)
    }
    stuecke.push(puffer)
  }
  const text = Buffer.concat(stuecke).toString('utf8').trim()
  if (text === '') throw new BodyFehler(400, 'leer', 'Der Rumpf ist leer.')
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new BodyFehler(400, 'kein-json', 'Der Rumpf ist kein gültiges JSON.')
  }
}
