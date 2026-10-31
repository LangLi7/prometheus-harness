/**
 * Prüfungen der Hüllen-Wege (`/c/<Sitzung>`, `/w`).
 *
 * **Was hier beweisbar ist und was nicht.** Die Wege hängen an einer Sitzung in der Datenbank;
 * ein glücklicher Aufruf bräuchte ein Konto. Geprüft wird deshalb, was **ohne** Datenbank
 * entscheidbar ist — und das ist der Teil, der beim Bauen schiefgehen kann:
 *
 * 1. Die Wege sind überhaupt da (ohne sie antwortet der SPA-Server mit **404**).
 * 2. Ohne Sitzung geht es auf `/anmeldung/` — **nicht** auf 404 und **nicht** auf die Seite.
 * 3. Das Basis-Tag steht absolut im Kopf (sonst lädt die Seite ihre `./assets/…` unter `/c/`).
 * 4. Die gebaute `index.html` ist auflösbar.
 *
 * Der gerenderte Index (`renderIndex`) wird dabei **nicht** durchlaufen: er hängt am Dienst des
 * Wirts. Das ist die Grenze dieser Datei und steht im Bericht als „nicht geprüft".
 *
 * @module @prometheus-harness/auth-http/tests/huelle
 */

import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, test } from 'bun:test'
import { sitzungsCookieName, type Umgebung } from '../src/paths.ts'
import { distIndex, huelleInhalt, huelleWege, mitWurzelBasis, PFAD_CHAT, PFAD_UEBERSICHT, wegHuelle } from '../src/huelle.ts'
import { PFAD_ANMELDUNG } from '../src/login.ts'

/** Was eine Attrappe der Antwort mitschreibt. */
interface Aufgezeichnet {
  status: number | undefined
  kopf: Record<string, string>
  koerper: string | undefined
}

/**
 * Eine Antwort-Attrappe.
 *
 * @returns die Aufzeichnung und das Objekt, das der Weg beschreibt
 */
function antwortAttrappe(): { aufgezeichnet: Aufgezeichnet; res: ServerResponse } {
  const aufgezeichnet: Aufgezeichnet = { status: undefined, kopf: {}, koerper: undefined }
  const res = {
    writeHead(status: number, kopf?: Record<string, string>) {
      aufgezeichnet.status = status
      Object.assign(aufgezeichnet.kopf, kopf ?? {})
      return res
    },
    end(koerper?: string) {
      aufgezeichnet.koerper = koerper
      return res
    },
  }
  return { aufgezeichnet, res: res as unknown as ServerResponse }
}

/**
 * Eine Umgebung, die **keine** Sitzung kennt.
 *
 * Der Speicher wird nur berührt, wenn ein Keks da ist; hier ist keiner da. Die Attrappe trägt
 * deshalb nur das Feld, das der Keksname braucht, und wird einmal an der Typgrenze gegossen —
 * mit diesem Absatz als Begründung.
 *
 * @returns die Umgebung
 */
function umgebungOhneSitzung(): Umgebung {
  return { sicher: false, speicher: {} } as unknown as Umgebung
}

/**
 * Eine Anfrage ohne Keks.
 *
 * @returns die Anfrage
 */
function anfrage(methode = 'GET'): IncomingMessage {
  return { method: methode, headers: {}, url: '/' } as unknown as IncomingMessage
}

describe('Die Hülle unter einem Pfad', () => {
  test('die Wege sind da: Prefix /c und exakt /w', () => {
    const wege = huelleWege(umgebungOhneSitzung(), () => undefined)
    expect(wege.map((weg) => `${weg.kind}:${weg.path}`)).toEqual([`prefix:${PFAD_CHAT}`, `exact:${PFAD_UEBERSICHT}`])
  })

  test('ohne Sitzung geht es auf die Anmeldung — 303, nicht 404', async () => {
    const { aufgezeichnet, res } = antwortAttrappe()
    await wegHuelle(umgebungOhneSitzung(), () => undefined)(anfrage(), res)
    expect(aufgezeichnet.status).toBe(303)
    // **Gegen die Konstante, nicht gegen einen abgeschriebenen Text.** Sonst prüft der Test eine
    // zweite Wahrheit über den Pfad der Anmeldung.
    expect(aufgezeichnet.kopf['location']).toBe(PFAD_ANMELDUNG)
    // **Die Seite selbst darf nicht im Körper stehen.** Sonst wäre die Prüfung nur Zierde.
    expect(aufgezeichnet.koerper).toBeUndefined()
  })

  test('das Basis-Tag ist absolut — sonst lädt die Seite unter /c/ ihre Assets falsch', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body></body></html>'
    const mit = mitWurzelBasis(html)
    expect(mit).toContain('<base href="/" />')
    expect(mit.indexOf('<base')).toBeGreaterThan(mit.indexOf('<head'))
    expect(mit.indexOf('<base')).toBeLessThan(mit.indexOf('</head>'))
  })

  test('ein vorhandenes Basis-Tag wird nicht verdoppelt', () => {
    const html = '<html><head><base href="./" /></head></html>'
    expect(mitWurzelBasis(html)).toBe(html)
  })

  test('der Bau der Oberfläche ist auflösbar und lädt seine Assets relativ', async () => {
    const datei = distIndex()
    expect(datei).toBeDefined()
    expect(existsSync(String(datei))).toBe(true)
    const inhalt = await Bun.file(String(datei)).text()
    // **Der Grund für das Basis-Tag.** Wären die Pfade absolut, wäre die Regel unnötig.
    expect(inhalt).toContain('./assets/')
  })
})

describe('Der Körper der Hülle', () => {
  test('renderIndex läuft — ohne ihn bleibt die Seite leer', async () => {
    const datei = join(tmpdir(), `pmh-huelle-${String(Date.now())}.html`)
    await Bun.write(datei, '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>')
    let gesehen = ''
    const inhalt = await huelleInhalt(datei, () => ({
      renderIndex: (html: string) => {
        gesehen = html
        // Genau das tut der Wirt: Einschübe in den Körper schreiben.
        return html.replace('<body>', '<body><script id="boot">window.__DSH_BOOT__={}</script>')
      },
    }))
    // **Der Beweis, daß der Renderer den rohen Index bekommt** — nicht den schon basierten.
    expect(gesehen).toContain('<head>')
    expect(gesehen).not.toContain('<base')
    expect(inhalt).toContain('__DSH_BOOT__')
    // **Und die Basis sitzt hinter dem Kopf**, nicht davor.
    expect(inhalt).toContain('<base href="/" />')
    expect(inhalt.indexOf('<base')).toBeGreaterThan(inhalt.indexOf('<head'))
    await rm(datei, { force: true })
  })

  test('ohne Dienst bleibt der Index unverändert — die Basis kommt trotzdem', async () => {
    const datei = join(tmpdir(), `pmh-huelle-${String(Date.now())}-b.html`)
    await Bun.write(datei, '<html><head><title>y</title></head><body></body></html>')
    const inhalt = await huelleInhalt(datei, () => undefined)
    expect(inhalt).not.toContain('__DSH_BOOT__')
    expect(inhalt).toContain('<base href="/" />')
    await rm(datei, { force: true })
  })
})

describe('Mit Sitzung', () => {
  /**
   * Eine Umgebung mit einer **gültigen** Sitzung.
   *
   * Der Speicher wird nur für `findByTokenHash` gebraucht; die Sitzung darin ist die, die
   * `verifySession` erwartet (Fristen in der Zukunft, kein Widerruf). Die Attrappe wird an der
   * Typgrenze gegossen — der Grund steht hier, damit niemand rätselt.
   */
  function umgebungMitSitzung(): Umgebung {
    const jetzt = new Date()
    const spaeter = new Date(jetzt.getTime() + 3_600_000)
    const sitzung = {
      id: 's-1',
      userId: 'u-1',
      csrfHash: 'hash',
      createdAt: jetzt.toISOString(),
      lastSeenAt: jetzt.toISOString(),
      idleExpiresAt: spaeter.toISOString(),
      absoluteExpiresAt: spaeter.toISOString(),
      revokedAt: undefined,
    }
    return {
      sicher: false,
      speicher: { sitzungen: { findByTokenHash: async () => sitzung } },
    } as unknown as Umgebung
  }

  test('die Hülle kommt mit 200, gerendert und mit absoluter Basis', async () => {
    const datei = join(tmpdir(), `pmh-huelle-${String(Date.now())}-s.html`)
    await Bun.write(datei, '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>')
    const { aufgezeichnet, res } = antwortAttrappe()
    const anfrageMitKeks = {
      method: 'GET',
      headers: { cookie: `${sitzungsCookieName(umgebungMitSitzung())}=gut` },
      url: '/c/ses_1',
    } as unknown as IncomingMessage

    /*
     * **Der Weg liest die echte `index.html`** — die Datei wird nicht umgelenkt. Deshalb wird hier
     * nur geprüft, was der Weg selbst entscheidet: die Sitzung, `renderIndex`, die Basis und die
     * Kopfzeilen. Der ausgelieferte Bau ist derselbe, den `distIndex()` nennt.
     */
    const dienst = {
      renderIndex: (html: string) => html.replace('<body>', '<body><script>window.__DSH_BOOT__=1</script>'),
    }
    await wegHuelle(umgebungMitSitzung(), () => dienst)(anfrageMitKeks, res)
    expect(aufgezeichnet.status).toBe(200)
    expect(aufgezeichnet.kopf['content-type']).toBe('text/html; charset=utf-8')
    expect(aufgezeichnet.koerper).toContain('__DSH_BOOT__')
    expect(aufgezeichnet.koerper).toContain('<base href="/" />')
    await rm(datei, { force: true })
  })
})
