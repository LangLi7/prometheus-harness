/**
 * Die Brücke zur Token-Tür — geprüft ohne Rechner und ohne Datenbank.
 *
 * ## Was hier geprüft wird
 *
 * 1. **Aus der 401 des Kerns wird die Anmeldeseite.** Der Kern schreibt seine 401 selbst
 *    (`dsh-client-connection/lib/index.js:495-501`: `writeHead(401, {content-type: text/plain})`
 *    und dann den Text als Körper). Die Attrappe unten schreibt **genau das** — sonst prüfte
 *    diese Datei eine erfundene Wirklichkeit.
 * 2. **Die Umbiegung ist rücknehmbar** und hinterläßt keinen Dauerzustand.
 * 3. **Ist der Kern anders, wird nichts getan** — kein Werfen, keine halbe Verdrahtung.
 * 4. **Die eigene Adresse kommt aus der Konfiguration**, nicht aus einem Kopf.
 * 5. **Ohne Sitzung gibt es keine Adresse** (401) — der Fall braucht keine Datenbank, weil
 *    `werBinIch` ohne Keks antwortet, bevor es den Speicher fragt.
 */

import { describe, expect, test } from 'bun:test'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { PFAD_ANMELDUNG } from '../src/anmeldung.ts'
import { PFAD_ZUGANG, eigeneAdresse, sperreUmbiegen, wegZugang } from '../src/zugang.ts'
import type { Umgebung } from '../src/wege.ts'

/** Ein Aufruf, wie ihn der Kern entgegennimmt. */
function anfrage(url = '/'): IncomingMessage {
  return { url, method: 'GET', headers: { host: '127.0.0.1:3081' } } as unknown as IncomingMessage
}

/** Eine Antwort, die mitschreibt, was auf sie geschrieben wird. */
interface Aufzeichnung {
  res: ServerResponse
  readonly status: number[]
  readonly koepfe: Record<string, unknown>[]
  koerper: string
}

function antwort(): Aufzeichnung {
  const status: number[] = []
  const koepfe: Record<string, unknown>[] = []
  const aufzeichnung: Aufzeichnung = {
    res: undefined as unknown as ServerResponse,
    status,
    koepfe,
    koerper: '',
  }
  const res = {
    writeHead(erster: number, zweiter?: unknown) {
      status.push(erster)
      if (zweiter !== undefined && typeof zweiter === 'object') koepfe.push(zweiter as Record<string, unknown>)
      return res
    },
    end(koerper?: unknown) {
      if (typeof koerper === 'string') aufzeichnung.koerper = koerper
      return res
    },
  }
  aufzeichnung.res = res as unknown as ServerResponse
  return aufzeichnung
}

/**
 * Die Sperre des Kerns — **abgeschrieben aus dem Quelltext**, damit die Attrappe nicht
 * freundlicher ist als die Wirklichkeit.
 *
 * @returns `false`, wenn die Anfrage abgewiesen wurde (der Kern schreibt die Antwort selbst)
 */
function kernSperre(): { authorizeIndex: (req: IncomingMessage, res: ServerResponse) => boolean } {
  return {
    authorizeIndex(_req, res) {
      res.writeHead(401, { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' })
      res.end('dsh web authentication required; reopen the URL printed by dsh web.\n')
      return false
    },
  }
}

/** Ein Kontext, wie ihn `apply` bekommt — nur die Felder, die die Brücke anfaßt. */
function kontext(dienst: unknown, adresse = { protocol: 'http:', host: '127.0.0.1', port: 3081 }): Context {
  return {
    webServer: adresse,
    // **`reflect.get`, nicht `get`.** Genau hier lag der Fehler, der den ersten Live-Versuch
    // scheitern ließ: der Dienst ist in cordis nur über `reflect` erreichbar, wenn das Plugin
    // ihn nicht in `inject` angemeldet hat. Die Attrappe bildet das nach.
    reflect: { get: (name: string) => (name === 'connection' ? dienst : undefined) },
  } as unknown as Context
}

describe('Die 401 des Kerns wird zur Anmeldeseite', () => {
  test('statt der Textzeile kommt eine Weiterleitung', () => {
    const verbindung = kernSperre()
    const zurueck = sperreUmbiegen(kontext(verbindung))
    expect(zurueck).toBeDefined()

    const a = antwort()
    const weiter = verbindung.authorizeIndex(anfrage(), a.res)

    expect(weiter).toBe(false)
    expect(a.status).toEqual([303])
    expect(a.koepfe[0]?.['location']).toBe(`${PFAD_ANMELDUNG}/`)
    // **Der Text der 401 darf nicht mitkommen.** Sonst stünde er im Körper der Weiterleitung.
    expect(a.koerper).not.toContain('authentication required')
    expect(a.koerper).toBe('')
    zurueck?.()
  })

  test('nach dem Rücknehmen ist alles wie vorher', () => {
    const verbindung = kernSperre()
    const vorher = verbindung.authorizeIndex
    const zurueck = sperreUmbiegen(kontext(verbindung))
    expect(verbindung.authorizeIndex).not.toBe(vorher)
    zurueck?.()
    expect(verbindung.authorizeIndex).toBe(vorher)

    const a = antwort()
    verbindung.authorizeIndex(anfrage(), a.res)
    expect(a.status).toEqual([401])
    expect(a.koerper).toContain('authentication required')
  })

  test('eine ANDERE Antwort wird nicht angefaßt', () => {
    // Nur die 401 ist der Anlaß. Eine 200 oder 404 muß durchgehen, wie sie ist.
    const verbindung = {
      authorizeIndex(_req: IncomingMessage, res: ServerResponse) {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('nicht gefunden')
        return false
      },
    }
    const zurueck = sperreUmbiegen(kontext(verbindung))
    const a = antwort()
    verbindung.authorizeIndex(anfrage(), a.res)
    expect(a.status).toEqual([404])
    expect(a.koerper).toBe('nicht gefunden')
    zurueck?.()
  })

  test('fehlt der Dienst, wird NICHTS getan — und nicht geworfen', () => {
    expect(sperreUmbiegen(kontext(undefined))).toBeUndefined()
  })

  test('hat der Dienst die Methode nicht, wird NICHTS getan', () => {
    expect(sperreUmbiegen(kontext({}))).toBeUndefined()
    expect(sperreUmbiegen(kontext({ authenticatedUrl: () => 'http://x/' }))).toBeUndefined()
  })

  test('ein Dienst, der Zuweisungen verwirft, meldet sich als „nicht umgebogen"', () => {
    // Ein Stellvertreter kann Zuweisungen schlucken. Dann bliebe die Textzeile stehen, und
    // niemand wüßte warum — deshalb sieht die Funktion nach, ob es wirklich gegriffen hat.
    const echt = kernSperre()
    const starr = Object.freeze({ authorizeIndex: echt.authorizeIndex })
    expect(sperreUmbiegen(kontext(starr))).toBeUndefined()
  })
})

describe('Die eigene Adresse', () => {
  test('kommt aus der Konfiguration', () => {
    expect(eigeneAdresse(kontext(undefined))).toBe('http://127.0.0.1:3081/')
  })

  test('mit TLS und anderem Port', () => {
    expect(eigeneAdresse(kontext(undefined, { protocol: 'https:', host: '127.0.0.1', port: 4443 }))).toBe(
      'https://127.0.0.1:4443/',
    )
  })

  test('ein IPv6-Literal bekommt eckige Klammern — sonst ist die Adresse unlesbar', () => {
    expect(eigeneAdresse(kontext(undefined, { protocol: 'http:', host: '::1', port: 3081 }))).toBe('http://[::1]:3081/')
  })
})

describe('Ohne Sitzung gibt es keine Adresse', () => {
  test('der Weg antwortet 401, ohne den Speicher zu fragen', async () => {
    // **Kein Keks heißt: `werBinIch` antwortet, bevor es den Speicher anfaßt.** Deshalb
    // braucht dieser Fall keine Datenbank.
    const umg = { speicher: undefined as never, jetzt: () => new Date() } as unknown as Umgebung
    const a = antwort()
    await wegZugang(umg, kontext(kernSperre()))(anfrage(PFAD_ZUGANG), a.res)
    expect(a.status).toEqual([401])
    expect(a.koerper).toContain('nicht-angemeldet')
  })
})
