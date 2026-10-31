/**
 * `@prometheus-harness/login-web/api` — der Vertrag mit unseren Anmeldewegen.
 *
 * ## Was hier gemessen ist (am lebenden Host, 14.10.2026)
 *
 * | Weg | Eingabe | Antwort |
 * |---|---|---|
 * | `POST /api/pmh/auth/login` | `{email, password}` | 401 `zugangsdaten-falsch`, 400 `eingabe-fehlt` |
 * | `POST /api/pmh/auth/register` | `{email, password, displayName?, claimToken?}` | 403 `claim-fehlt`, 401 `nicht-angemeldet`, 403 `csrf-fehlt` |
 * | `POST /api/pmh/auth/logout` | Kopf `x-pmh-csrf` | **204**, löscht `pmh_session` und `pmh_csrf` |
 * | `GET /api/pmh/auth/me` | — | 401 `nicht-angemeldet`, sonst `{ok:true, value:…}` |
 *
 * Fehler kommen **immer** als `{ok:false, error:{code, message}}` — mit **deutschen**
 * Meldungen, die diese Seite **wörtlich** anzeigt. Sie neu zu formulieren wäre eine zweite
 * Wahrheit: der Server weiß, welcher Fall vorliegt, die Seite nicht.
 *
 * Erfolg kommt als `{ok:true, value:…}` (englischer Schlüssel — gemessen, nicht gewählt).
 *
 * ## Zwei Fallen, die hier geschlossen sind
 *
 * 1. **`credentials: 'include'`.** Ohne das legt der Browser die Kekse nicht ab, die
 *    Anmeldung wäre still wirkungslos.
 * 2. **Der CSRF-Wert kommt aus einem Keks, den die Seite lesen darf** (`pmh_csrf`, nicht
 *    `HttpOnly`). Das ist der Sinn des zweiten Kekses: das Sitzungskek ist `HttpOnly`,
 *    der Wert für den Kopf muß lesbar sein.
 *
 * @module @prometheus-harness/login-web/api
 */

/** Die Herkunft ist **dieselbe**: im Entwicklungsbetrieb über den Proxy, in Produktion über den Host. */
const BASIS = ''

/** Der Name des CSRF-Kekses — gemessen an `Set-Cookie`. */
export const CSRF_KEKS = 'pmh_csrf'

/** Der Name des Sitzungskekses — `HttpOnly`, die Seite kann ihn **nicht** lesen. */
export const SITZUNGS_KEKS = 'pmh_session'

/** Der Kopf, den unser Server für Zustandsänderungen verlangt — gemessen in `http.ts`. */
export const CSRF_KOPF = 'x-pmh-csrf'

/** Ein Fehler in der Form, die unser Server schickt. */
export interface AuthFehler {
  readonly code: string
  readonly message: string
}

/** Das Ergebnis eines Aufrufs. */
export type Ergebnis<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AuthFehler }

/** Wer angemeldet ist — die Felder, die `/me` zurückgibt. */
export interface Konto {
  readonly id?: string
  readonly email?: string
  readonly displayName?: string | null
  readonly role?: string
}

/** Eingabe der Registrierung. */
export interface Registrierung {
  readonly email: string
  readonly password: string
  readonly displayName?: string
  /**
   * Das **Claim-Token** aus `claim.txt` im Harness-Home.
   *
   * Gemessen: solange **kein Admin** existiert, verlangt die Registrierung es — und das
   * erste so angelegte Konto wird **`admin`**. Es ist der Riegel davor, daß „wer den Port
   * zuerst erreicht" das Adminkonto bekommt.
   */
  readonly claimToken?: string
  /**
   * Das **Einladungs-Token** aus dem Link (`?token=…`).
   *
   * Der dritte Weg zu einem Konto: er braucht weder Claim noch Sitzung. Wer den
   * Link hat, legt **ein** Konto an — und setzt dabei sein eigenes Paßwort, das
   * niemand sonst kennt. Siehe `packages/api/auth-http/src/einladung.ts`.
   */
  readonly einladungToken?: string
}

/** Eine Einladung, wie sie der Server zurückgibt. */
export interface EinladungZeile {
  readonly id: string
  readonly note: string
  readonly zustand: 'offen' | 'eingeloest' | 'abgelaufen' | 'zurueckgezogen'
  readonly erstelltAm: string
  readonly laeuftAb: string
  readonly eingeloestAm?: string
}

/** Das Ergebnis des Anlegens — der Klartext-Token kommt **genau einmal**. */
export interface NeueEinladung {
  readonly id: string
  readonly token: string
  readonly note: string
  readonly laeuftAb: string
  readonly dauerSekunden: number
}

/** Liest einen Kekswert; leer, wenn er fehlt. */
export function keksWert(name: string): string {
  if (typeof document === 'undefined') return ''
  for (const stueck of document.cookie.split(';')) {
    const [k, ...rest] = stueck.trim().split('=')
    if (k === name) return rest.join('=')
  }
  return ''
}

/**
 * Ruft einen Weg auf und **übersetzt nichts**: die Antwort wird so zurückgegeben, wie sie
 * ankommt.
 *
 * @param pfad - der Weg, z. B. `/api/pmh/auth/login`
 * @param koerper - der Rumpf; fehlt er, wird `GET` benutzt
 * @param kopf - zusätzliche Köpfe (etwa der CSRF-Wert)
 * @returns das Ergebnis in der Form unseres Servers
 */
async function ruf<T>(pfad: string, koerper?: unknown, kopf: Record<string, string> = {}): Promise<Ergebnis<T>> {
  let antwort: Response
  try {
    /**
     * **Der Rumpf wird bedingt gesetzt, nicht auf `undefined` gesetzt.**
     *
     * Das Haus schaltet `exactOptionalPropertyTypes` ein (`tsconfig.base.json`). Danach ist
     * `{ body: undefined }` **nicht** dasselbe wie „kein `body`" — der Typlauf lehnt es ab, und
     * zwar zu Recht: ein ausdrückliches `undefined` überschreibt einen Vorgabewert, ein
     * fehlendes Feld läßt ihn stehen. Beim `GET` darf gar kein Rumpf entstehen.
     */
    const optionen: RequestInit = {
      method: koerper === undefined ? 'GET' : 'POST',
      // **Ohne das kommt kein Keks an.**
      credentials: 'include',
      headers: koerper === undefined ? kopf : { 'content-type': 'application/json', ...kopf },
      ...(koerper === undefined ? {} : { body: JSON.stringify(koerper) }),
    }
    antwort = await fetch(BASIS + pfad, optionen)
  } catch (f) {
    return {
      ok: false,
      error: { code: 'netz', message: `Der Server ist nicht erreichbar: ${f instanceof Error ? f.message : String(f)}` },
    }
  }

  // `logout` antwortet mit 204 und **ohne** Rumpf — gemessen.
  if (antwort.status === 204) return { ok: true, value: undefined as T }

  const text = await antwort.text()
  try {
    return JSON.parse(text) as Ergebnis<T>
  } catch {
    return {
      ok: false,
      error: { code: 'unlesbar', message: `Die Antwort war kein JSON (HTTP ${String(antwort.status)}).` },
    }
  }
}

/** Meldet an. Bei Erfolg setzt der Server die beiden Kekse. */
export function anmelden(email: string, password: string): Promise<Ergebnis<unknown>> {
  return ruf('/api/pmh/auth/login', { email, password })
}

/** Legt ein Konto an. Ohne Admin im Bestand braucht es das Claim-Token. */
export function registrieren(daten: Registrierung): Promise<Ergebnis<unknown>> {
  return ruf('/api/pmh/auth/register', daten)
}

/** Wer bin ich? */
export function ich(): Promise<Ergebnis<Konto>> {
  return ruf<Konto>('/api/pmh/auth/me')
}

/**
 * Setzt ein Passwort über einen Einmal-Link.
 *
 * **Ohne Sitzung.** Wer den Link hat, hat den Nachweis; der Server legt danach
 * eine Sitzung an und schickt beide Kekse — man ist also sofort angemeldet.
 */
export function passwortSetzen(resetToken: string, passwort: string): Promise<Ergebnis<Konto>> {
  return ruf<Konto>('/api/pmh/auth/passwort/setzen', { resetToken, passwort })
}

/** Meldet ab — mit dem CSRF-Wert aus dem lesbaren Keks. */
export function abmelden(): Promise<Ergebnis<unknown>> {
  return ruf('/api/pmh/auth/logout', {}, { [CSRF_KOPF]: keksWert(CSRF_KEKS) })
}

/**
 * Holt die Adresse der Oberfläche des Rechners.
 *
 * **Nur ein Administrator bekommt sie** (der Server antwortet sonst 403 `kein-admin`). Die
 * Adresse trägt den Zugangsschlüssel, deshalb wird sie **nicht** angezeigt, sondern nur
 * geöffnet.
 */
export function zugang(): Promise<Ergebnis<{ readonly url?: string }>> {
  return ruf<{ readonly url?: string }>('/api/pmh/auth/zugang')
}

// ---------------------------------------------------------------------------
// Einladungen — der Administrator lädt Menschen ein
// ---------------------------------------------------------------------------

/**
 * Erzeugt eine Einladung.
 *
 * **Nur ein Administrator.** Der Server antwortet sonst 403 `kein-admin`, und
 * ohne CSRF-Wert 403 `csrf-fehlt` — beides kommt hier unverändert an.
 *
 * @param dauerSekunden - die gewünschte Gültigkeit (60 … 30 Tage)
 * @param notiz - ein Merker für den Admin
 * @returns die Einladung **mit** dem Klartext-Token (einmalig)
 */
export function einladungAnlegen(dauerSekunden: number, notiz: string): Promise<Ergebnis<NeueEinladung>> {
  return ruf<NeueEinladung>(
    '/api/pmh/auth/einladungen/neu',
    { dauerSekunden, notiz },
    { [CSRF_KOPF]: keksWert(CSRF_KEKS) },
  )
}

/** Die Einladungen des angemeldeten Administrators. */
export function einladungen(): Promise<Ergebnis<{ readonly einladungen?: readonly EinladungZeile[] }>> {
  return ruf<{ readonly einladungen?: readonly EinladungZeile[] }>('/api/pmh/auth/einladungen')
}

/** Zieht eine Einladung zurück — der Link ist danach tot. */
export function einladungZuruecknehmen(id: string): Promise<Ergebnis<unknown>> {
  return ruf('/api/pmh/auth/einladungen/zuruecknehmen', { id }, { [CSRF_KOPF]: keksWert(CSRF_KEKS) })
}
