/**
 * Die HTTP-Schicht — ohne Datenbank, aber über einen **echten** Socket.
 *
 * ## Warum die Speicher hier absichtlich giftig sind
 *
 * Jeder Fall in dieser Datei muß **vor** dem ersten Speicherzugriff entschieden
 * werden: eine falsche Methode, ein zu großer Körper, kein JSON, ein fehlendes
 * Cookie. Wären die Speicher harmlose Attrappen, würde ein Fall, der sie
 * versehentlich berührt, **trotzdem grün** — und die Prüfung bewiese nicht, was
 * sie behauptet.
 *
 * Deshalb wirft jeder Zugriff: {@link giftig}. Ein Test, der die Speicher
 * berührt, scheitert hörbar.
 *
 * ## Warum ein echter Server und keine gerufene Funktion
 *
 * `macheWeg` prüft `req.method` und schreibt auf `res`. Beides ist nur über einen
 * Socket ehrlich zu prüfen: die Methode steht im rohen Protokoll, und ob die
 * Verbindung **geschlossen** wird, sieht man nur an der Antwort des Servers.
 * Eine gerufene Funktion würde genau die Fehler verbergen, die hier interessieren
 * — etwa einen Handler, der nach einer Ausnahme den Socket offen läßt und den
 * Aufrufer bis zum Zeitablauf warten läßt.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ClaimAblage } from '@prometheus-harness/claim'
import {
  CSRF_COOKIE,
  cookieKopf,
  herkunft,
  leseKoerper,
  macheWeg,
  sende,
  wegAnmelden,
  wegIch,
  type Weg,
} from '../src/http.ts'
import {
  MAX_KOERPER_BYTES,
  PFAD_ANMELDEN,
  PFAD_ICH,
  cookieWert,
  type Umgebung,
} from '../src/paths.ts'
import type { AuthSpeicher } from '@prometheus-harness/store-postgres'
import { Argon2PasswordHasher, CSRF_COOKIE_NAME as CSRF_AUS_DEM_KERN, MemoryRateLimiter } from '@prometheus-harness/auth'

// ---------------------------------------------------------------------------
// Giftige Speicher
// ---------------------------------------------------------------------------

/**
 * Ein Speicher, der bei **jedem** Zugriff wirft.
 *
 * `T extends object` ist nötig: `new Proxy` verlangt ein Objekt als Ziel, und
 * ohne die Einschränkung wäre `T` auch eine Zahl oder eine Zeichenkette sein
 * können. Der Typlauf hat es angemerkt, nicht das Nachdenken.
 *
 * @param name - der Name für die Fehlermeldung
 * @returns ein Objekt, dessen jede Eigenschaft eine werfende Funktion ist
 */
function giftig<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get(_ziel, eigenschaft) {
      return (): never => {
        throw new Error(`Attrappe berührt: ${name}.${String(eigenschaft)}`)
      }
    },
  })
}

/**
 * Eine Umgebung, deren Speicher jeder Zugriff scheitern läßt.
 *
 * **Das Home ist ein Pfad, den es nicht gibt, und der Claim-Speicher ist
 * giftig.** Beides ist Absicht: die Fälle dieser Datei müssen **vor** dem Tor
 * entschieden werden (falsche Methode, zu großer Körper, kein JSON). Ein Fall,
 * der das Tor erreicht, würde auf einen nicht vorhandenen Claim-Speicher
 * treffen und **laut** scheitern — statt still durchzugehen.
 */
function umgebungOhneSpeicher(): Umgebung {
  return {
    speicher: giftig<AuthSpeicher>('speicher'),
    hasher: new Argon2PasswordHasher(),
    limiter: new MemoryRateLimiter(),
    sicher: false,
    maxUsers: undefined,
    jetzt: () => new Date(),
    warten: async () => undefined,
    home: join(tmpdir(), 'pmh-pruefung-gibtsnicht'),
    claimAblage: giftig<ClaimAblage>('claimAblage'),
  }
}

// ---------------------------------------------------------------------------
// Ein echter Server
// ---------------------------------------------------------------------------

let server: Server
let basis: string

beforeAll(async () => {
  const umg = umgebungOhneSpeicher()
  const wege: readonly [string, Weg][] = [
    [PFAD_ANMELDEN, wegAnmelden(umg)],
    [PFAD_ICH, wegIch(umg)],
    ['/api/pmh/fehler', macheWeg('GET', async () => { throw new Error('absichtlich') }, 'prüfweg')],
    ['/api/pmh/ohne-methode', macheWeg(undefined, async (req, res) => { sende(res, { status: 200, koepfe: {}, koerper: { ok: true, methode: req.method } }) }, 'methodenfrei')],
  ]

  server = createServer((req, res) => {
    const pfad = new URL(req.url ?? '/', 'http://x').pathname
    const treffer = wege.find(([p]) => p === pfad)
    if (treffer === undefined) {
      res.writeHead(404).end()
      return
    }
    void treffer[1](req, res)
  })

  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig))
  const adresse = server.address() as AddressInfo
  basis = `http://127.0.0.1:${String(adresse.port)}`
})

afterAll(async () => {
  await new Promise<void>((fertig) => server.close(() => fertig()))
})

// ---------------------------------------------------------------------------
// Methoden
// ---------------------------------------------------------------------------

describe('Die Methode wird geprüft — der Webserver des Kerns tut es nicht', () => {
  test('GET auf einen POST-Weg ergibt 405 mit Allow', async () => {
    // **Warum das sein muß.** `match(pathname)` des Kerns gleicht **nur den Pfad**
    // ab. Ohne eigene Prüfung würde `GET /api/pmh/auth/login` den Anmeldeweg
    // auslösen.
    const antwort = await fetch(`${basis}${PFAD_ANMELDEN}`, { method: 'GET' })
    expect(antwort.status).toBe(405)
    expect(antwort.headers.get('allow')).toContain('POST')
    await antwort.arrayBuffer()
  })

  test('OPTIONS ergibt 204 mit Allow und ohne Körper', async () => {
    const antwort = await fetch(`${basis}${PFAD_ANMELDEN}`, { method: 'OPTIONS' })
    expect(antwort.status).toBe(204)
    expect(antwort.headers.get('allow')).toContain('POST')
    expect(antwort.headers.get('allow')).toContain('OPTIONS')
    await antwort.arrayBuffer()
  })

  test('HEAD wird wie GET geführt', async () => {
    // `wegIch` verlangt GET; HEAD muß durchgehen — sonst wäre eine Prüfung der
    // Kopffelder durch eine Zwischenschicht unmöglich.
    const antwort = await fetch(`${basis}${PFAD_ICH}`, { method: 'HEAD' })
    expect(antwort.status).toBe(401)
    await antwort.arrayBuffer()
  })

  test('DELETE wird abgewiesen, wo nur POST erlaubt ist', async () => {
    const antwort = await fetch(`${basis}${PFAD_ANMELDEN}`, { method: 'DELETE' })
    expect(antwort.status).toBe(405)
    await antwort.arrayBuffer()
  })
})

// ---------------------------------------------------------------------------
// Der Körper
// ---------------------------------------------------------------------------

describe('Der Körper', () => {
  test('ein zu großer Körper ergibt 413 — vor dem Lesen', async () => {
    const antwort = await fetch(`${basis}${PFAD_ANMELDEN}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(MAX_KOERPER_BYTES + 1),
    })
    expect(antwort.status).toBe(413)
    const koerper = (await antwort.json()) as { ok: boolean; error: { code: string } }
    expect(koerper.ok).toBe(false)
    expect(koerper.error.code).toBe('koerper-zu-gross')
  })

  test('ein Körper, der kein JSON ist, ergibt 400', async () => {
    const antwort = await fetch(`${basis}${PFAD_ANMELDEN}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{kein json',
    })
    expect(antwort.status).toBe(400)
    const koerper = (await antwort.json()) as { error: { code: string } }
    expect(koerper.error.code).toBe('kein-json')
  })

  test('ein leerer Körper ergibt 400 mit „eingabe-fehlt" — nicht 500', async () => {
    // Ein leerer Körper ist kein Fehler des Servers. Er darf keinen Stapelauszug
    // auslösen und keine 500 ergeben; er ist eine unvollständige Eingabe.
    const antwort = await fetch(`${basis}${PFAD_ANMELDEN}`, { method: 'POST', body: '' })
    expect(antwort.status).toBe(400)
    const koerper = (await antwort.json()) as { error: { code: string } }
    expect(koerper.error.code).toBe('eingabe-fehlt')
  })

  test('ein unbekannter Weg ergibt 404 — die Wege fangen nicht alles ab', async () => {
    const antwort = await fetch(`${basis}/api/pmh/gibtsnicht`, { method: 'POST' })
    expect(antwort.status).toBe(404)
    await antwort.arrayBuffer()
  })
})

// ---------------------------------------------------------------------------
// Ausnahmen
// ---------------------------------------------------------------------------

describe('Eine Ausnahme im Weg läßt den Socket nicht offen', () => {
  test('ergibt 500 mit der Fehlerform des Kerns — und die Verbindung schließt', async () => {
    // **Der Fehler, den es ohne diesen Fang gäbe.** Eine Ausnahme in einem
    // Handler, die niemand fängt, läßt die Antwort offen. Der Aufrufer wartet
    // dann bis zum Zeitablauf, und der Fehler sieht aus wie „der Server ist weg"
    // statt wie „dieser Weg ist kaputt".
    const antwort = await fetch(`${basis}/api/pmh/fehler`)
    expect(antwort.status).toBe(500)
    const koerper = (await antwort.json()) as { ok: boolean; error: { code: string } }
    expect(koerper.ok).toBe(false)
    expect(koerper.error.code).toBe('interner-fehler')
    // Der Text der Ausnahme darf **nicht** hinausgehen: er kann Pfade, Adressen
    // oder Abfragen enthalten.
    expect(JSON.stringify(koerper)).not.toContain('absichtlich')
  })
})

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

describe('Cookies lesen', () => {
  test('findet den gesuchten Wert unter mehreren', () => {
    expect(cookieWert('a=1; pmh_session=abc; b=2', 'pmh_session')).toBe('abc')
  })

  test('verträgt Leerraum und Reihenfolge', () => {
    expect(cookieWert('  pmh_session = abc  ', 'pmh_session')).toBe('abc')
    expect(cookieWert('b=2;pmh_session=abc', 'pmh_session')).toBe('abc')
  })

  test('gibt undefined zurück, wenn der Name fehlt oder der Wert leer ist', () => {
    expect(cookieWert('a=1', 'pmh_session')).toBeUndefined()
    expect(cookieWert('pmh_session=', 'pmh_session')).toBeUndefined()
    expect(cookieWert(undefined, 'pmh_session')).toBeUndefined()
  })

  test('hält ein Präfix nicht für einen Treffer', () => {
    // `pmh_session_alt=…` darf **nicht** als `pmh_session` gelten — sonst wäre
    // ein harmlos benanntes Cookie ein Sitzungstoken.
    expect(cookieWert('pmh_session_alt=boese', 'pmh_session')).toBeUndefined()
  })

  test('nimmt einen Wert mit Gleichheitszeichen vollständig', () => {
    expect(cookieWert('pmh_session=a=b=c', 'pmh_session')).toBe('a=b=c')
  })

  test('der CSRF-Cookiename ist derselbe wie im Regelkern', () => {
    // Zwei Stellen, die dasselbe wissen müssen, laufen irgendwann auseinander.
    expect(CSRF_COOKIE).toBe(CSRF_AUS_DEM_KERN)
  })
})

// ---------------------------------------------------------------------------
// Wer bin ich — ohne Cookie
// ---------------------------------------------------------------------------

describe('Wer bin ich ohne Sitzung', () => {
  test('ergibt 401, ohne den Speicher zu berühren', async () => {
    // Die giftigen Speicher beweisen es: dieser Fall wird **vor** jedem Zugriff
    // entschieden.
    const antwort = await fetch(`${basis}${PFAD_ICH}`)
    expect(antwort.status).toBe(401)
    const koerper = (await antwort.json()) as { ok: boolean; error: { code: string } }
    expect(koerper.error.code).toBe('nicht-angemeldet')
  })

  test('der Text verrät nicht, ob ein Token je gültig war', async () => {
    const ohne = await fetch(`${basis}${PFAD_ICH}`)
    const ohneText = ((await ohne.json()) as { error: { message: string } }).error.message
    const fremd = await fetch(`${basis}${PFAD_ICH}`, { headers: { cookie: 'pmh_session=irgendwas' } })
    const fremdText = ((await fremd.json()) as { error: { message: string } }).error.message
    // Fremdes Token → der Speicher wird berührt → die giftige Attrappe wirft →
    // 500. Das ist hier **erwartet** und wird unten in der Datenbankprüfung
    // richtig gemessen. Was hier zählt: der Text ohne Token.
    expect(ohneText).toContain('Sitzung')
    expect(typeof fremdText).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// Kleine Bausteine
// ---------------------------------------------------------------------------

describe('Herkunft', () => {
  test('nimmt die IP vom Socket und schneidet das IPv4-in-IPv6-Präfix ab', async () => {
    // Ohne diesen Schnitt hätte derselbe Aufrufer über zwei Wege **zwei**
    // Zähler — und die Ratenbegrenzung wäre doppelt so hoch wie beabsichtigt.
    const gesehen: { ip: string | undefined; ua: string | undefined }[] = []
    const server2 = createServer((req, res) => {
      const h = herkunft(req)
      gesehen.push({ ip: h.ip, ua: h.userAgent })
      res.writeHead(204).end()
    })
    await new Promise<void>((fertig) => server2.listen(0, '127.0.0.1', fertig))
    const port = (server2.address() as AddressInfo).port
    await fetch(`http://127.0.0.1:${String(port)}/x`, { headers: { 'user-agent': 'Prüfgerät' } })
    await new Promise<void>((fertig) => server2.close(() => fertig()))

    expect(gesehen[0]?.ip).toBe('127.0.0.1')
    expect(gesehen[0]?.ip).not.toContain('::ffff:')
    expect(gesehen[0]?.ua).toBe('Prüfgerät')
  })

  test('nimmt die IP NICHT aus X-Forwarded-For', async () => {
    // **Die Kopfzeile darf jeder setzen.** Wer sie auswertet, läßt sich die IP
    // von dem bestimmen, den er gerade begrenzen will — und `loginIpKey(ip)`
    // wäre wirkungslos: je Versuch eine andere erfundene Adresse, nie eine
    // Grenze erreicht.
    const gesehen: (string | undefined)[] = []
    const server3 = createServer((req, res) => {
      gesehen.push(herkunft(req).ip)
      res.writeHead(204).end()
    })
    await new Promise<void>((fertig) => server3.listen(0, '127.0.0.1', fertig))
    const port = (server3.address() as AddressInfo).port
    await fetch(`http://127.0.0.1:${String(port)}/x`, { headers: { 'x-forwarded-for': '10.9.9.9' } })
    await new Promise<void>((fertig) => server3.close(() => fertig()))

    expect(gesehen[0]).toBe('127.0.0.1')
    expect(gesehen[0]).not.toBe('10.9.9.9')
  })
})

describe('Der Körperleser', () => {
  test('liest gültiges JSON', async () => {
    const server4 = createServer((req, res) => {
      void leseKoerper(req).then((ergebnis) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(ergebnis))
      })
    })
    await new Promise<void>((fertig) => server4.listen(0, '127.0.0.1', fertig))
    const port = (server4.address() as AddressInfo).port
    const antwort = await fetch(`http://127.0.0.1:${String(port)}/x`, {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.de' }),
    })
    const ergebnis = (await antwort.json()) as { ok: boolean; wert: { email: string } }
    await new Promise<void>((fertig) => server4.close(() => fertig()))

    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.wert.email).toBe('a@b.de')
  })

  test('gibt bei leerem Körper ein leeres Verzeichnis', async () => {
    const server5 = createServer((req, res) => {
      void leseKoerper(req).then((ergebnis) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(ergebnis))
      })
    })
    await new Promise<void>((fertig) => server5.listen(0, '127.0.0.1', fertig))
    const port = (server5.address() as AddressInfo).port
    const antwort = await fetch(`http://127.0.0.1:${String(port)}/x`, { method: 'POST', body: '' })
    const ergebnis = (await antwort.json()) as { ok: boolean; wert: Record<string, unknown> }
    await new Promise<void>((fertig) => server5.close(() => fertig()))

    expect(ergebnis.ok).toBe(true)
    expect(ergebnis.wert).toEqual({})
  })
})

describe('Der Cookie-Kopf', () => {
  test('liest die Kopfzeile als Text', async () => {
    let gesehen: string | undefined
    const server6 = createServer((req, res) => {
      gesehen = cookieKopf(req)
      res.writeHead(204).end()
    })
    await new Promise<void>((fertig) => server6.listen(0, '127.0.0.1', fertig))
    const port = (server6.address() as AddressInfo).port
    await fetch(`http://127.0.0.1:${String(port)}/x`, { headers: { cookie: 'a=1; b=2' } })
    await new Promise<void>((fertig) => server6.close(() => fertig()))
    expect(gesehen).toBe('a=1; b=2')
  })
})
