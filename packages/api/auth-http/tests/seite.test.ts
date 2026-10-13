/**
 * Die Anmeldeseite — über einen **echten** Socket.
 *
 * ## Warum ein echter Server und keine gerufene Funktion
 *
 * Dieselbe Begründung wie in `http-schicht.test.ts`: `macheWeg` prüft
 * `req.method` und schreibt auf `res`. Ob eine **falsche Methode** abgewiesen wird,
 * ob `HEAD` wie `GET` behandelt wird und ob die Kopfzeilen wirklich auf dem Draht
 * stehen, sieht man nur am Socket. Eine gerufene Funktion würde genau das
 * verbergen, was hier interessiert.
 *
 * ## Was hier bewiesen wird — und was nicht
 *
 * **Bewiesen:** die Seite wird ausgeliefert; die Kopfzeilen stehen so auf dem
 * Draht, wie sie gemeint sind; die falsche Methode wird abgewiesen; und die Seite
 * **verrät nichts** — kein Fremdaufruf, kein Speicher im Browser, keine zweite
 * Wahrheit über die Pfade.
 *
 * **Nicht bewiesen:** daß ein **Browser** die Seite bedienen kann. Dafür braucht es
 * einen laufenden Host und einen Browser — das ist ein eigener Nachweis und steht
 * nicht in dieser Datei.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { CSRF_COOKIE_NAME } from '@prometheus-harness/auth'
import { CSRF_KOPFZEILE, PFAD_ABMELDEN, PFAD_ANMELDEN, PFAD_ICH, PFAD_REGISTRIEREN } from '../src/wege.ts'
import { HTML, JS, CSP, PFAD_SEITE, PFAD_SEITE_API, PFAD_SEITE_JS, seitenWege } from '../src/seite.ts'

let server: Server
let basis: string

beforeAll(async () => {
  const wege = seitenWege()
  server = createServer((req, res) => {
    const pfad = (req.url ?? '/').split('?')[0] ?? '/'
    const treffer = wege.find((w) => w.path === pfad)
    if (treffer === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('nicht gefunden')
      return
    }
    void treffer.handler(req, res).catch(() => {
      try {
        res.writeHead(500)
        res.end()
      } catch {
        // Der Socket kann schon zu sein — dann ist nichts mehr zu tun.
      }
    })
  })
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig))
  const adresse = server.address() as AddressInfo
  basis = `http://127.0.0.1:${String(adresse.port)}`
})

afterAll(async () => {
  await new Promise<void>((fertig) => server.close(() => fertig()))
})

describe('Die Anmeldeseite wird ausgeliefert', () => {
  test('unter dem Pfad für Menschen und unter dem der Anmeldung — beide 200', async () => {
    for (const pfad of [PFAD_SEITE, PFAD_SEITE_API]) {
      const antwort = await fetch(`${basis}${pfad}`)
      expect(antwort.status).toBe(200)
      expect(antwort.headers.get('content-type')).toBe('text/html; charset=utf-8')
      const text = await antwort.text()
      expect(text).toContain('<!doctype html>')
      expect(text).toContain('Prometheus Harness')
    }
  })

  test('die Kopfzeilen stehen so auf dem Draht, wie sie gemeint sind', async () => {
    const antwort = await fetch(`${basis}${PFAD_SEITE}`)
    // **Wörtlich die Richtlinie, nicht „enthält default-src".** Eine aufgeweichte
    // Richtlinie soll auffallen und nicht durchgehen.
    expect(antwort.headers.get('content-security-policy')).toBe(CSP)
    expect(antwort.headers.get('x-content-type-options')).toBe('nosniff')
    expect(antwort.headers.get('x-frame-options')).toBe('DENY')
    expect(antwort.headers.get('referrer-policy')).toBe('no-referrer')
    expect(antwort.headers.get('cache-control')).toBe('no-store')
    // Kein Fremdaufruf, kein Einbetten, kein Formularziel nach außen.
    const csp = antwort.headers.get('content-security-policy') ?? ''
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain('frame-ancestors')
    expect(csp).not.toContain("script-src 'unsafe-inline'")
  })

  test('eine falsche Methode wird abgewiesen — POST auf die Seite ergibt 405', async () => {
    // **Der Grund, warum `macheWeg` überhaupt existiert.** Der Webserver des Kerns
    // gleicht nur den Pfad ab; ohne diese Prüfung liefe ein POST auf den
    // Seitenweg denselben Handler.
    const antwort = await fetch(`${basis}${PFAD_SEITE}`, { method: 'POST' })
    expect(antwort.status).toBe(405)
    expect(antwort.headers.get('allow')).toContain('GET')
    expect(antwort.headers.get('allow')).toContain('OPTIONS')
    await antwort.text()
  })

  test('OPTIONS gibt 204 mit Allow — die Auskunft vor einem Aufruf', async () => {
    const antwort = await fetch(`${basis}${PFAD_SEITE}`, { method: 'OPTIONS' })
    expect(antwort.status).toBe(204)
    expect(antwort.headers.get('allow')).toContain('GET')
    await antwort.text()
  })

  test('HEAD wird wie GET behandelt', async () => {
    const antwort = await fetch(`${basis}${PFAD_SEITE}`, { method: 'HEAD' })
    expect(antwort.status).toBe(200)
    expect(antwort.headers.get('content-type')).toBe('text/html; charset=utf-8')
    // `content-length` steht auch bei HEAD — sonst wäre die Auskunft wertlos.
    expect(Number(antwort.headers.get('content-length'))).toBeGreaterThan(0)
    await antwort.text()
  })

  test('das JavaScript kommt als eigene Datei mit eigenem Typ', async () => {
    const antwort = await fetch(`${basis}${PFAD_SEITE_JS}`)
    expect(antwort.status).toBe(200)
    expect(antwort.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(antwort.headers.get('cache-control')).toBe('no-store')
    await antwort.text()
  })
})

describe('Die Seite verrät nichts und hat keine zweite Wahrheit', () => {
  test('das HTML verweist auf das eigene JavaScript — und auf nichts Fremdes', () => {
    expect(HTML).toContain(`src="${PFAD_SEITE_JS}"`)
    // **Kein einziger Fremdaufruf.** Kein CDN, kein Zählpixel, keine Schriftart von
    // außen: wer die Seite öffnet, spricht mit einem Rechner.
    expect(HTML).not.toMatch(/https?:\/\//u)
    expect(JS).not.toMatch(/https?:\/\//u)
  })

  test('die Seite legt nichts im Browser ab', () => {
    // Kein `localStorage`, kein `sessionStorage`, kein Schreiben von Cookies aus
    // dem Skript. Ein Paßwort, das im Browserspeicher landet, steht dort, bis
    // jemand es löscht.
    for (const verboten of ['localStorage', 'sessionStorage', 'document.cookie =', 'indexedDB']) {
      expect(HTML).not.toContain(verboten)
      expect(JS).not.toContain(verboten)
    }
  })

  test('das JavaScript liest den CSRF-Wert aus dem Cookie — mit dem Namen des Kerns', () => {
    // **Keine zweite Wahrheit über den Namen.** Stünde hier ein abgeschriebener
    // Name, liefe er irgendwann auseinander — und das Abmelden ginge still kaputt.
    expect(JS).toContain(JSON.stringify(CSRF_COOKIE_NAME))
    expect(JS).toContain(JSON.stringify(CSRF_KOPFZEILE))
  })

  test('die Pfade im JavaScript sind die der Wege, nicht abgeschriebene', () => {
    // Derselbe Grund, eine Ebene höher: die Pfade werden eingesetzt, nicht getippt.
    for (const pfad of [PFAD_ANMELDEN, PFAD_REGISTRIEREN, PFAD_ABMELDEN, PFAD_ICH]) {
      expect(JS).toContain(JSON.stringify(pfad))
    }
  })

  test('die Seite enthält kein Geheimnis — kein Token, keinen Hash, kein Paßwort', () => {
    // **Der wichtigste Fall dieser Datei.** Eine Seite ist öffentlich: sie liegt im
    // Zwischenspeicher, im Verlauf, in jedem Protokoll.
    //
    // **Und der erste Entwurf dieser Zusicherung war falsch.** Er lautete
    // `expect(JS).not.toContain('pmh_')` und war rot — zu Recht: `pmh_` steckt
    // auch in `/api/pmh/auth/login` und im CSRF-Cookienamen `pmh_csrf`. Ein
    // Wortstumpf ist kein Geheimnis. Geprüft wird deshalb die **Form**, in der ein
    // Geheimnis aufträte:
    //   * ein API-Schlüssel `pmh_<12 Zeichen>_<43 Zeichen>`
    //   * ein Hash oder Token als 64 Hexzeichen
    //   * die Feldnamen dürfen vorkommen — sie tragen keinen Wert.
    const schluesselform = /pmh_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}/u
    expect(HTML).not.toMatch(schluesselform)
    expect(JS).not.toMatch(schluesselform)
    expect(HTML).not.toMatch(/[0-9a-f]{64}/u)
    expect(JS).not.toMatch(/[0-9a-f]{64}/u)
    expect(HTML).toContain('name="password"')
    // Und keine Zuweisung eines Wertes an ein Feld — nur die Feldnamen.
    expect(JS).not.toMatch(/password\s*[:=]\s*['"][^'"]+['"]/u)
  })

  test('die Wege der Seite sind genau drei, und alle sind `exact`', () => {
    const wege = seitenWege()
    expect(wege).toHaveLength(3)
    for (const weg of wege) {
      // Ein Präfixweg würde den Kern überschreiben; `exact` gewinnt gegen ihn.
      expect(weg.kind).toBe('exact')
      expect(weg.path.startsWith('/')).toBe(true)
    }
  })
})
