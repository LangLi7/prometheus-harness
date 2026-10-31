/**
 * Die HTTP-Schicht — der einzige Ort, an dem ein Socket vorkommt.
 *
 * ## Warum so dünn
 *
 * Hier wird **nichts entschieden**: kein Status, kein Grund, keine Regel. Diese
 * Datei liest einen Körper, holt die Herkunft, ruft einen Weg aus `paths.ts` und
 * schreibt die Antwort. Alle Entscheidungen liegen in `paths.ts` und sind dort
 * ohne Server prüfbar.
 *
 * ## Die zwei Fallen, die hier lauern
 *
 * | Falle | Was hier geschieht |
 * |---|---|
 * | **Eine Ausnahme im Handler läßt den Socket offen** | {@link macheWeg} fängt **jede** Ausnahme und antwortet mit 500. Ohne das bliebe die Verbindung hängen, und der Aufrufer wartete bis zum Zeitablauf — ein Fehler, der wie „der Server ist weg" aussieht |
 * | **Die IP aus einer Kopfzeile** | {@link herkunft} nimmt `req.socket.remoteAddress`, **niemals** `X-Forwarded-For`. Siehe unten |
 *
 * ## Warum die IP **nicht** aus `X-Forwarded-For` kommt
 *
 * Diese Kopfzeile darf **jeder** Aufrufer setzen. Wer sie auswertet, läßt sich die
 * IP von dem bestimmen, den er gerade begrenzen will — und die Ratenbegrenzung
 * `loginIpKey(ip)` wäre damit **wirkungslos**: ein Angreifer schickt je Versuch
 * eine andere erfundene Adresse und hat nie eine Grenze erreicht.
 *
 * Die Kopfzeile wäre erst dann brauchbar, wenn ein **vertrauenswürdiger** Proxy
 * davorsteht, der sie setzt und weitergibt — und dann müßte man wissen, **welcher**
 * das ist, und alles andere verwerfen. Solange es keinen gibt, ist der Socket die
 * einzige Angabe, die der Aufrufer nicht fälschen kann.
 *
 * @module @prometheus-harness/auth-http/http
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { CSRF_COOKIE_NAME } from '@prometheus-harness/auth'
import {
  abmelden,
  anmelden,
  benutzerAnlegen,
  benutzerListe,
  benutzerLoeschen,
  benutzerRolle,
  benutzerSperren,
  betreiberAnmelden,
  cookieWert,
  CSRF_KOPFZEILE,
  einladungAnlegen,
  einladungenListe,
  einladungZurueckziehen,
  MAX_KOERPER_BYTES,
  passwortLinkErzeugen,
  passwortSetzen,
  registrieren,
  sitzungsCookieName,
  werBinIch,
  type Antwort,
  type Herkunft,
  type Umgebung,
} from './paths.ts'

/** Liest die `Cookie`-Kopfzeile. */
export function cookieKopf(req: IncomingMessage): string | undefined {
  const wert = req.headers.cookie
  return typeof wert === 'string' ? wert : undefined
}

/**
 * **Kommt die Anfrage vom selben Rechner?**
 *
 * Verglichen wird die IP **vom Socket**, nach derselben Normalisierung, die {@link herkunft}
 * ohnehin vornimmt (`::ffff:127.0.0.1` → `127.0.0.1`). Kein Präfixvergleich, kein
 * `X-Forwarded-For`: was der Aufrufer behaupten kann, zählt hier nicht.
 *
 * @param req - die Anfrage
 * @returns ob der Socket auf demselben Rechner liegt
 */
export function istLoopback(req: IncomingMessage): boolean {
  const ip = herkunft(req).ip
  return ip === '127.0.0.1' || ip === '::1'
}

/**
 * Woher die Anfrage kommt.
 *
 * @param req - die Anfrage
 * @returns IP und Client-Kennung; die IP **vom Socket**
 */
export function herkunft(req: IncomingMessage): Herkunft {
  const adresse = req.socket.remoteAddress
  const userAgent = req.headers['user-agent']
  return {
    // `::ffff:127.0.0.1` (IPv4 in IPv6) wird auf die schlichte Form gebracht:
    // sonst hätte derselbe Aufrufer über zwei Wege zwei verschiedene Zähler, und
    // die Grenze wäre doppelt so hoch wie beabsichtigt.
    ip: adresse === undefined ? undefined : adresse.replace(/^::ffff:/u, ''),
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 500) : undefined,
  }
}

/** Das Ergebnis des Körperlesens. */
export type KoerperErgebnis =
  | { readonly ok: true; readonly wert: unknown }
  | { readonly ok: false; readonly status: number; readonly code: string; readonly message: string }

/**
 * Liest den Körper und deutet ihn als JSON.
 *
 * **Warum die Länge vorher geprüft wird.** Steht `Content-Length` da und ist zu
 * groß, wird die Verbindung **sofort** abgewiesen — dann wandern gar keine Bytes
 * erst in den Speicher. Ohne Vorabprüfung müßte man erst alles lesen, um
 * festzustellen, daß es zu viel war; genau das ist der Angriff.
 *
 * **Warum trotzdem mitgezählt wird.** `Content-Length` kann fehlen (bei
 * `Transfer-Encoding: chunked`) und kann **falsch** sein. Die harte Grenze ist
 * deshalb die mitgezählte Menge, nicht die angekündigte.
 *
 * @param req - die Anfrage
 * @param maxBytes - die Obergrenze
 * @returns der gelesene Wert oder ein Fehler
 */
export async function leseKoerper(req: IncomingMessage, maxBytes: number = MAX_KOERPER_BYTES): Promise<KoerperErgebnis> {
  const angekuendigt = req.headers['content-length']
  if (typeof angekuendigt === 'string' && Number(angekuendigt) > maxBytes) {
    return { ok: false, status: 413, code: 'koerper-zu-gross', message: 'Die Anfrage ist zu groß.' }
  }

  const stuecke: Buffer[] = []
  let gelesen = 0
  try {
    for await (const stueck of req) {
      const puffer = stueck as Buffer
      gelesen += puffer.byteLength
      if (gelesen > maxBytes) {
        // **Abbrechen, nicht weiterlesen.** Wer weiterliest, hat den Speicher
        // schon belegt — die Grenze wäre dann nur eine Meldung.
        req.destroy()
        return { ok: false, status: 413, code: 'koerper-zu-gross', message: 'Die Anfrage ist zu groß.' }
      }
      stuecke.push(puffer)
    }
  } catch {
    return { ok: false, status: 400, code: 'koerper-unlesbar', message: 'Der Körper konnte nicht gelesen werden.' }
  }

  const roh = Buffer.concat(stuecke).toString('utf8').trim()
  if (roh === '') return { ok: true, wert: {} }

  try {
    return { ok: true, wert: JSON.parse(roh) }
  } catch {
    return { ok: false, status: 400, code: 'kein-json', message: 'Der Körper ist kein gültiges JSON.' }
  }
}

/** Schreibt eine Antwort auf den Socket. */
export function sende(res: ServerResponse, antwort: Antwort): void {
  const koepfe: Record<string, string | string[]> = { 'cache-control': 'no-store' }
  for (const [name, wert] of Object.entries(antwort.koepfe)) {
    koepfe[name] = typeof wert === 'string' ? wert : [...wert]
  }

  const hatKoerper = antwort.koerper !== undefined
  if (hatKoerper) {
    const text = JSON.stringify(antwort.koerper)
    koepfe['content-type'] = 'application/json; charset=utf-8'
    koepfe['content-length'] = String(Buffer.byteLength(text))
    res.writeHead(antwort.status, koepfe)
    res.end(text)
    return
  }
  res.writeHead(antwort.status, koepfe)
  res.end()
}

/** Ein Weg aus `paths.ts`, auf einen Socket gebracht. */
export type Weg = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/**
 * Macht aus einem Weg einen Handler für den Webserver.
 *
 * **Die Methodenprüfung gehört hierher, nicht in den Weg.** Der Webserver des
 * Kerns gleicht **nur den Pfad** ab (`dsh-host-webserver/lib/index.js`,
 * `match(pathname)`) — eine Methode kennt er nicht. Ohne diese Prüfung würde
 * `GET /api/pmh/auth/login` denselben Weg auslösen wie `POST`.
 *
 * `HEAD` wird wie `GET` behandelt und `OPTIONS` mit **204** und `Allow`
 * beantwortet: das ist die Auskunft, die ein Aufrufer vor einem `POST` mit
 * fremder Herkunft braucht.
 *
 * @param methode - die erlaubte Methode, oder `undefined` für jede
 * @param weg - der auszuführende Weg
 * @param label - ein Name für die Fehlersuche
 * @returns der Handler
 */
export function macheWeg(
  methode: 'GET' | 'POST' | 'DELETE' | readonly ('GET' | 'POST' | 'DELETE')[] | undefined,
  weg: Weg,
  label: string,
): Weg {
  const basis =
    methode === undefined
      ? (['GET', 'POST', 'PUT', 'DELETE'] as const)
      : Array.isArray(methode)
        ? [...methode]
        : methode === 'GET'
          ? (['GET', 'HEAD'] as const)
          : [methode]
  /*
   * **Ein Weg mit `GET` kann auch `HEAD`.** Der Server darf den Körper dann
   * weglassen; die Kopffelder sind dieselben. Bei der Mehrweg-Form wird `HEAD`
   * deshalb ergänzt, nicht vorausgesetzt — sonst müßte jeder Aufrufer daran
   * denken, und der erste, der es vergißt, bekommt ein 405 auf `HEAD`.
   */
  const erlaubt: readonly string[] =
    basis.includes('GET') && !basis.includes('HEAD') ? [...basis, 'HEAD'] : basis
  return async (req, res) => {
    const tatsaechlich = (req.method ?? 'GET').toUpperCase()

    if (tatsaechlich === 'OPTIONS') {
      res.writeHead(204, { allow: [...erlaubt, 'OPTIONS'].join(', '), 'cache-control': 'no-store' })
      res.end()
      return
    }

    // `HEAD` wird wie `GET` geführt: der Server darf den Körper dann weglassen,
    // aber die Kopffelder müssen dieselben sein.
    const vergleich = tatsaechlich === 'HEAD' ? 'GET' : tatsaechlich
    if (!erlaubt.includes(vergleich)) {
      res.writeHead(405, { allow: [...erlaubt, 'OPTIONS'].join(', '), 'cache-control': 'no-store' })
      res.end()
      return
    }

    try {
      await weg(req, res)
    } catch (fehler) {
      // **Der letzte Fang.** Ohne ihn bliebe die Verbindung offen und der
      // Aufrufer wartete bis zum Zeitablauf. Der Text der Ausnahme geht **nicht**
      // an den Aufrufer — er kann Pfade, Adressen oder Abfragen enthalten.
      const text = fehler instanceof Error ? fehler.message : String(fehler)
      process.stderr.write(`[pmh] ${label}: unbehandelter Fehler — ${text}\n`)
      if (!res.headersSent) {
        sende(res, {
          status: 500,
          koepfe: {},
          koerper: { ok: false, error: { code: 'interner-fehler', message: 'Unerwarteter Fehler.' } },
        })
      } else {
        res.end()
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Die vier Wege, fertig verdrahtet
// ---------------------------------------------------------------------------

/** `POST /api/pmh/auth/register` */
export function wegRegistrieren(umg: Umgebung): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const koerper = await leseKoerper(req)
      if (!koerper.ok) {
        sende(res, { status: koerper.status, koepfe: {}, koerper: { ok: false, error: { code: koerper.code, message: koerper.message } } })
        return
      }
      const daten = (koerper.wert ?? {}) as Record<string, unknown>
      const csrf = req.headers[CSRF_KOPFZEILE]
      sende(
        res,
        await registrieren(umg, {
          ...herkunft(req),
          email: daten['email'],
          password: daten['password'],
          displayName: daten['displayName'],
          claimToken: daten['claimToken'],
          // **Das Einladungs-Token aus dem Körper.** Es ist kein Sitzungsnachweis,
          // sondern das Geheimnis des Links selbst — es gehört dorthin, wo der
          // Link es hergibt. Ohne diese Zeile kam die Einladung nie beim Tor an:
          // der Weg fiel auf den Admin-Zweig zurück und antwortete `401`, obwohl
          // der Link gültig war. Gefunden hat das erst der echte Browser.
          einladungToken: daten['einladungToken'],
          // **Der Nachweis kommt aus dem KOPF, nicht aus dem Körper.** Ein
          // Sitzungstoken oder ein CSRF-Wert im Körper wäre bei einer
          // protokollierten Anfrage im Klartext mitgeschrieben; im Kopf steht er
          // ohnehin. Und ein Körperfeld könnte von einer fremden Seite gesetzt
          // werden — ein Kopf mit diesem Namen nicht ohne Weiteres.
          token: cookieWert(cookieKopf(req), sitzungsCookieName(umg)),
          csrfKopf: typeof csrf === 'string' ? csrf : undefined,
        }),
      )
    },
    'auth/register',
  )
}

/** `POST /api/pmh/auth/login` */
export function wegAnmelden(umg: Umgebung): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const koerper = await leseKoerper(req)
      if (!koerper.ok) {
        sende(res, { status: koerper.status, koepfe: {}, koerper: { ok: false, error: { code: koerper.code, message: koerper.message } } })
        return
      }
      const daten = (koerper.wert ?? {}) as Record<string, unknown>
      sende(res, await anmelden(umg, { ...herkunft(req), email: daten['email'], password: daten['password'] }))
    },
    'auth/login',
  )
}

/** `POST /api/pmh/auth/logout` */
export function wegAbmelden(umg: Umgebung): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const kopf = cookieKopf(req)
      const csrf = req.headers['x-pmh-csrf']
      sende(
        res,
        await abmelden(umg, {
          token: cookieWert(kopf, sitzungsCookieName(umg)),
          csrfKopf: typeof csrf === 'string' ? csrf : undefined,
        }),
      )
    },
    'auth/logout',
  )
}

/** `GET /api/pmh/auth/me` */
export function wegIch(umg: Umgebung): Weg {
  return macheWeg(
    'GET',
    async (req, res) => {
      sende(res, await werBinIch(umg, { token: cookieWert(cookieKopf(req), sitzungsCookieName(umg)) }))
    },
    'auth/me',
  )
}

/** Der CSRF-Cookiename, damit die Aufruferseite ihn kennt. */
export const CSRF_COOKIE = CSRF_COOKIE_NAME

// ---------------------------------------------------------------------------
// Die Wege der Einladungen
// ---------------------------------------------------------------------------

/**
 * Liest den Körper und antwortet bei einem Fehler schon selbst.
 *
 * **Warum als eigene Funktion.** Drei Wege brauchen denselben vierzeiligen
 * Ablauf. Dreimal abgeschrieben wäre dreimal die Gelegenheit, den Status oder den
 * Code zu vergessen — und ein vergessener Code sieht nicht wie ein Fehler aus,
 * sondern wie ein 200 mit leerem Körper.
 */
async function koerperOderAntwort(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | undefined> {
  const koerper = await leseKoerper(req)
  if (!koerper.ok) {
    sende(res, {
      status: koerper.status,
      koepfe: {},
      koerper: { ok: false, error: { code: koerper.code, message: koerper.message } },
    })
    return undefined
  }
  return (koerper.wert ?? {}) as Record<string, unknown>
}

/** `POST /api/pmh/auth/einladungen/neu` — ein Administrator erzeugt einen Link. */
export function wegEinladungNeu(umg: Umgebung): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const daten = await koerperOderAntwort(req, res)
      if (daten === undefined) return
      const csrf = req.headers[CSRF_KOPFZEILE]
      sende(
        res,
        await einladungAnlegen(umg, {
          token: cookieWert(cookieKopf(req), sitzungsCookieName(umg)),
          csrfKopf: typeof csrf === 'string' ? csrf : undefined,
          dauerSekunden: daten['dauerSekunden'],
          notiz: daten['notiz'],
        }),
      )
    },
    'auth/einladung-neu',
  )
}

/** `GET /api/pmh/auth/einladungen` — die offenen (und vergangenen) Einladungen. */
export function wegEinladungen(umg: Umgebung): Weg {
  return macheWeg(
    'GET',
    async (req, res) => {
      sende(res, await einladungenListe(umg, { token: cookieWert(cookieKopf(req), sitzungsCookieName(umg)) }))
    },
    'auth/einladungen',
  )
}

/** `POST /api/pmh/auth/einladungen/zuruecknehmen` — ein Link wird tot. */
export function wegEinladungZurueck(umg: Umgebung): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const daten = await koerperOderAntwort(req, res)
      if (daten === undefined) return
      const csrf = req.headers[CSRF_KOPFZEILE]
      sende(
        res,
        await einladungZurueckziehen(umg, {
          token: cookieWert(cookieKopf(req), sitzungsCookieName(umg)),
          csrfKopf: typeof csrf === 'string' ? csrf : undefined,
          id: daten['id'],
        }),
      )
    },
    'auth/einladung-zurueck',
  )
}

// ---------------------------------------------------------------------------
// Die Konten — die Verwaltung
// ---------------------------------------------------------------------------

/** `GET /api/pmh/auth/benutzer` — alle Konten, nur für einen Administrator. */
export function wegBenutzer(umg: Umgebung): Weg {
  return macheWeg(
    'GET',
    async (req, res) => {
      sende(res, await benutzerListe(umg, { token: cookieWert(cookieKopf(req), sitzungsCookieName(umg)) }))
    },
    'auth/benutzer',
  )
}

/** `POST /api/pmh/auth/benutzer/status` — ein Konto sperren oder freigeben. */
export function wegBenutzerStatus(umg: Umgebung): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const daten = await koerperOderAntwort(req, res)
      if (daten === undefined) return
      const csrf = req.headers[CSRF_KOPFZEILE]
      sende(
        res,
        await benutzerSperren(umg, {
          token: cookieWert(cookieKopf(req), sitzungsCookieName(umg)),
          csrfKopf: typeof csrf === 'string' ? csrf : undefined,
          id: daten['id'],
          gesperrt: daten['gesperrt'],
        }),
      )
    },
    'auth/benutzer-status',
  )
}

/**
 * `POST /api/pmh/auth/betreiber` — aus der Token-Tür eine Sitzung.
 *
 * **Warum der Beweis hereingereicht wird.** Ob eine Anfrage den Token des Wirts
 * trägt, weiß nur die Verbindung des Kerns (`authorizeIndex`, siehe
 * `access.ts`). Diese Datei kennt keinen Kontext — sie bekommt die Antwort auf
 * die Frage als Funktion. Das hält den Weg socketfrei prüfbar und den Ring
 * `http.ts` ↔ `access.ts` geschlossen.
 *
 * **Warum `userId` im Körper steht.** Gibt es mehrere Administratorkonten, ist
 * „wer gemeint ist" keine Frage, die der Server raten darf — sie gehört dem
 * Menschen vor dem Bildschirm. Der Weg nimmt die Wahl entgegen und prüft sie
 * (`betreiberAnmelden`); ohne Wahl antwortet er mit der Liste statt mit einer
 * Vermutung.
 *
 * @param umg - die Umgebung
 * @param beweis - prüft, ob die Anfrage den Token des Wirts trägt
 * @returns der Weg
 */
export function wegBetreiber(umg: Umgebung, beweis: (req: IncomingMessage) => boolean): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const koerper = await leseKoerper(req)
      if (!koerper.ok) {
        sende(res, {
          status: koerper.status,
          koepfe: {},
          koerper: { ok: false, error: { code: koerper.code, message: koerper.message } },
        })
        return
      }
      const daten = (koerper.wert ?? {}) as Record<string, unknown>
      const gewaehlt = daten['userId']
      sende(
        res,
        await betreiberAnmelden(umg, {
          ...herkunft(req),
          beweis: beweis(req),
          ...(typeof gewaehlt === 'string' && gewaehlt.trim() !== '' ? { userId: gewaehlt.trim() } : {}),
        }),
      )
    },
    'auth/betreiber',
  )
}

// ---------------------------------------------------------------------------
// Anlegen, Löschen, Rolle, Passwort-Link
// ---------------------------------------------------------------------------

/** Der CSRF-Wert aus dem Kopf — einmal, statt in jedem Weg. */
function csrfKopf(req: IncomingMessage): string | undefined {
  const wert = req.headers[CSRF_KOPFZEILE]
  return typeof wert === 'string' ? wert : undefined
}

/**
 * `POST /api/pmh/auth/benutzer/neu` — Konto anlegen, Link zurück.
 *
 * Der Körper wird **ungeprüft** durchgereicht: welche Felder Pflicht sind und
 * was eine brauchbare Adresse ist, entscheidet `paths.ts` (und damit der
 * Regelkern), nicht die HTTP-Schicht. Sonst gäbe es zwei Wahrheiten über die
 * Eingabe — und die zweite wäre die falsche.
 */
export function wegBenutzerNeu(umg: Umgebung): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const daten = await koerperOderAntwort(req, res)
      if (daten === undefined) return
      sende(
        res,
        await benutzerAnlegen(umg, {
          token: cookieWert(cookieKopf(req), sitzungsCookieName(umg)),
          csrfKopf: csrfKopf(req),
          email: daten['email'],
          displayName: daten['displayName'],
          rolle: daten['rolle'],
        }),
      )
    },
    'auth/benutzer-neu',
  )
}

/** `POST /api/pmh/auth/benutzer/loeschen` — Konto endgültig entfernen. */
export function wegBenutzerLoeschen(umg: Umgebung): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const daten = await koerperOderAntwort(req, res)
      if (daten === undefined) return
      sende(
        res,
        await benutzerLoeschen(umg, {
          token: cookieWert(cookieKopf(req), sitzungsCookieName(umg)),
          csrfKopf: csrfKopf(req),
          id: daten['id'],
        }),
      )
    },
    'auth/benutzer-loeschen',
  )
}

/** `POST /api/pmh/auth/benutzer/rolle` — zum Administrator machen oder zurück. */
export function wegBenutzerRolle(umg: Umgebung): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const daten = await koerperOderAntwort(req, res)
      if (daten === undefined) return
      sende(
        res,
        await benutzerRolle(umg, {
          token: cookieWert(cookieKopf(req), sitzungsCookieName(umg)),
          csrfKopf: csrfKopf(req),
          id: daten['id'],
          rolle: daten['rolle'],
        }),
      )
    },
    'auth/benutzer-rolle',
  )
}

/** `POST /api/pmh/auth/passwort/link` — Einmal-Link zum Passwortsetzen. */
export function wegPasswortLink(umg: Umgebung): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const daten = await koerperOderAntwort(req, res)
      if (daten === undefined) return
      sende(
        res,
        await passwortLinkErzeugen(umg, {
          token: cookieWert(cookieKopf(req), sitzungsCookieName(umg)),
          csrfKopf: csrfKopf(req),
          id: daten['id'],
        }),
      )
    },
    'auth/passwort-link',
  )
}

/**
 * `POST /api/pmh/auth/passwort/setzen` — der Link wird eingelöst.
 *
 * **Ohne Sitzung und ohne CSRF.** Wer den Link hat, hat den Nachweis; ein
 * CSRF-Wert setzt eine Sitzung voraus, die es hier gerade nicht gibt.
 */
export function wegPasswortSetzen(umg: Umgebung): Weg {
  return macheWeg(
    'POST',
    async (req, res) => {
      const daten = await koerperOderAntwort(req, res)
      if (daten === undefined) return
      sende(
        res,
        await passwortSetzen(umg, {
          ...herkunft(req),
          resetToken: daten['resetToken'],
          passwort: daten['passwort'],
        }),
      )
    },
    'auth/passwort-setzen',
  )
}
