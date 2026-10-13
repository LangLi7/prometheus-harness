/**
 * Sitzungen: erzeugen, prüfen, erneuern, widerrufen.
 *
 * **Die Bauform, und warum sie so ist.** Ein Sitzungstoken ist ein **opaques**
 * Zufallstoken, kein JWT. Der Grund ist nicht Geschmack:
 *
 * | | Opakes Token (hier) | JWT |
 * |---|---|---|
 * | Widerruf | **sofort** — ein Eintrag wird als widerrufen markiert | erst wenn er abläuft; bis dahin ist er gültig, auch nach „überall abmelden" |
 * | Sperre eines Kontos | wirkt sofort | wirkt **nicht** — das Token trägt die Rechte bis zum Ablauf weiter |
 * | Änderung der Rechte | wirkt sofort | wirkt erst beim nächsten Token |
 * | Kosten je Anfrage | **eine** Abfrage (Redis, im Speicher) | keine Abfrage — aber dafür Signaturprüfung, und die Sperre geht verloren |
 * | Länge | 43 Zeichen | mehrere hundert Byte in **jedem** Aufruf, in jedem Protokoll |
 *
 * Für eine Anwendung mit **Chats, API-Schlüsseln und Sperren** ist der sofortige
 * Widerruf keine Bequemlichkeit, sondern eine Sicherheitsanforderung. Ein
 * Anmeldesystem, in dem „alle Sitzungen beenden" fünf Minuten braucht, hat diesen
 * Knopf nicht verdient. JWTs sind richtig, wenn **niemand** widerrufen kann oder
 * muss (kurzlebige Dienst-zu-Dienst-Token) — hier nicht.
 *
 * **Zwei Fristen, und die zweite ist die wichtige.**
 *
 * | Frist | Verhalten | Warum |
 * |---|---|---|
 * | Ruhefrist ({@link SessionPolicy.idleMs}) | wird bei Aktivität nach vorn geschoben | ein Benutzer, der arbeitet, soll nicht hinausgeworfen werden |
 * | Höchstfrist ({@link SessionPolicy.absoluteMs}) | **nie** verschoben | ohne sie lebt eine gestohlene Sitzung **unbegrenzt**, solange sie benutzt wird — und ein Angreifer benutzt sie |
 *
 * **Warum die Rotation nicht nur beim Anmelden passiert.** Ein Token, das ein
 * ganzes Sitzungsleben gilt, ist ein Token, das lange genug zum Abgreifen
 * existiert. {@link rotateSession} gibt nach einer bestimmten Nutzungsdauer ein
 * **neues** Token aus und macht das alte ungültig: ein abgegriffenes Token ist
 * dann nur so lange nützlich, bis der rechtmäßige Benutzer das nächste Mal
 * arbeitet — und der Wechsel fällt auf, wenn das alte danach benutzt wird.
 *
 * @module @prometheus-harness/auth/session
 */

import { constantTimeEquals, newCsrfPair, newSessionToken, tokenHash } from './index.ts'

// ---------------------------------------------------------------------------
// Speicher-Schnittstelle
// ---------------------------------------------------------------------------

/** Eine Sitzung, wie sie im Speicher liegt. */
export interface SessionRecord {
  readonly id: string
  readonly userId: string
  /** Der SHA-256-Hash des Tokens — **nie** das Token selbst. */
  readonly tokenHash: string
  /** Der SHA-256-Hash des CSRF-Werts. */
  readonly csrfHash: string
  readonly userAgent: string
  readonly ipFirstSeen: string | undefined
  readonly idleExpiresAt: string
  readonly absoluteExpiresAt: string
  readonly createdAt: string
  readonly lastSeenAt: string
  readonly revokedAt: string | undefined
  readonly revokedReason: string | undefined
}

/**
 * Der Speicher hinter den Sitzungen.
 *
 * **Warum `touch` getrennt ist.** Die Aktualisierung von `last_seen_at` und der
 * Ruhefrist passiert bei **jeder** Anfrage. Sie getrennt zu halten erlaubt es,
 * sie zu **drosseln** (etwa höchstens einmal je Minute schreiben) — sonst
 * schreibt jede Anfrage in die Datenbank, und ein Benutzer mit einem offenen
 * Fenster, das jede Sekunde anfragt, erzeugt 86 400 Schreibvorgänge am Tag.
 */
export interface SessionStore {
  /** Sucht eine Sitzung über den Token-Hash. */
  findByTokenHash(tokenHash: string): Promise<SessionRecord | undefined>
  /** Sucht eine Sitzung über ihre Kennung. */
  findById(id: string): Promise<SessionRecord | undefined>
  /** Legt eine Sitzung an. */
  create(session: SessionRecord): Promise<void>
  /**
   * Schreibt den Nutzungszeitpunkt und die neue Ruhefrist fort.
   *
   * @param id - Sitzungskennung
   * @param lastSeenAt - Zeitpunkt der Nutzung, ISO-8601
   * @param idleExpiresAt - neue Ruhefrist, ISO-8601
   */
  touch(id: string, lastSeenAt: string, idleExpiresAt: string): Promise<void>
  /** Markiert eine Sitzung als widerrufen. */
  revoke(id: string, at: string, reason: string): Promise<void>
  /** Widerruft **alle** Sitzungen eines Benutzers; gibt die Zahl zurück. */
  revokeAllForUser(userId: string, at: string, reason: string): Promise<number>
  /** Ersetzt den Token-Hash (Rotation) und den CSRF-Hash. */
  replaceToken(id: string, tokenHash: string, csrfHash: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Richtlinie
// ---------------------------------------------------------------------------

/**
 * Die Fristen und die Rotationsschwelle.
 *
 * **Die Vorgaben und ihre Begründung:**
 *
 * | Wert | Vorgabe | Warum |
 * |---|---|---|
 * | `idleMs` | 12 Stunden | ein Arbeitstag. Wer abends aufhört und morgens weitermacht, soll sich nicht zweimal anmelden |
 * | `absoluteMs` | 30 Tage | die Obergrenze, auch bei dauernder Nutzung. Kürzer wäre für ein Werkzeug lästig, länger gibt einem gestohlenen Token zu viel Zeit |
 * | `rotateAfterMs` | 24 Stunden | siehe unten |
 * | `rotateAfterUses` | 500 | eine Rotation nach **Nutzung** fängt ein Token, das viel benutzt wird — also eines, das sich zu stehlen lohnt |
 * | `touchIntervalMs` | 60 Sekunden | siehe {@link SessionStore.touch} |
 *
 * **Warum Rotation überhaupt.** Ein Token mit 30 Tagen Höchstfrist existiert 30
 * Tage. Wer es einmal abgreift — aus einem Protokoll, einem geteilten Rechner,
 * einem Backup — hat 30 Tage Zugang. Mit Rotation nach 24 Stunden schrumpft das
 * auf „bis der rechtmäßige Benutzer das nächste Mal arbeitet". Und: wird das
 * **alte** Token danach benutzt, ist das ein **Diebstahlssignal** — der Speicher
 * kann es melden (siehe `reuseDetected` in {@link VerifiedSession}).
 */
export interface SessionPolicy {
  readonly idleMs: number
  readonly absoluteMs: number
  readonly rotateAfterMs: number
  readonly rotateAfterUses: number
  readonly touchIntervalMs: number
}

/** Die Vorgaben aus der Tabelle oben. */
export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  idleMs: 12 * 60 * 60 * 1000,
  absoluteMs: 30 * 24 * 60 * 60 * 1000,
  rotateAfterMs: 24 * 60 * 60 * 1000,
  rotateAfterUses: 500,
  touchIntervalMs: 60 * 1000,
}

/**
 * Ab wann eine Sitzung als „frisch" gilt.
 *
 * **Wozu das gut ist.** Für gefährliche Handlungen — Passwort ändern, Adresse
 * ändern, API-Schlüssel anzeigen, Konto löschen — soll ein **altes** Token nicht
 * genügen. Wer einen Rechner offen stehen lässt, soll nicht allein durch die
 * offene Sitzung das Passwort ändern können. In dieser Zeit verlangt die
 * Anwendung das Passwort erneut.
 *
 * Fünf Minuten: lang genug, dass ein Mensch, der sich gerade angemeldet hat,
 * nicht zweimal tippen muss — kurz genug, dass ein unbeaufsichtigter Rechner
 * nicht genügt.
 */
export const SESSION_FRESH_MS = 5 * 60 * 1000

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

/** Warum eine Sitzung nicht angenommen wurde. */
export type SessionErrorReason = 'expired-idle' | 'expired-absolute' | 'revoked'

/** Ein Fehler der Sitzungsprüfung. */
export class SessionError extends Error {
  readonly reason: SessionErrorReason
  constructor(reason: SessionErrorReason, message: string) {
    super(message)
    this.name = 'SessionError'
    this.reason = reason
  }
}

/**
 * Die eine Meldung für „dieses Token gilt nicht".
 *
 * **Warum eine Konstante und kein zweimal geschriebener Text.** Ein unbekanntes
 * und ein widerrufenes Token müssen **wörtlich** dieselbe Antwort erzeugen. Zwei
 * Textstellen laufen irgendwann auseinander — und dann verrät die Anmeldung
 * wieder, was sie nicht verraten darf. Eine Stelle, zwei Verwendungen.
 */
export const SESSION_NOT_USABLE = 'Sitzung ist unbekannt oder widerrufen'

// ---------------------------------------------------------------------------
// Erzeugen
// ---------------------------------------------------------------------------

/** Eine neu angelegte Sitzung. */
export interface CreatedSession {
  readonly session: SessionRecord
  /** Das Klartext-Token. Geht **nur** ins Cookie. */
  readonly token: string
  /** Der Klartext-CSRF-Wert. Geht ins lesbare Cookie. */
  readonly csrf: string
}

/**
 * Legt eine Sitzung an.
 *
 * @param store - der Speicher
 * @param userId - der Benutzer
 * @param context - Client-Kennung und IP, für die Anzeige „wo bin ich angemeldet"
 * @param policy - die Fristen; Vorgabe {@link DEFAULT_SESSION_POLICY}
 * @param now - Zeitquelle; Vorgabe ist jetzt
 * @returns die Sitzung samt Klartextwerten
 */
export async function createSession(
  store: SessionStore,
  userId: string,
  context: { readonly userAgent?: string; readonly ip?: string } = {},
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
  now: () => Date = () => new Date(),
): Promise<CreatedSession> {
  const at = now()
  const token = newSessionToken()
  const csrf = newCsrfPair()
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    userId,
    tokenHash: token.hash,
    csrfHash: csrf.hash,
    userAgent: (context.userAgent ?? '').slice(0, 500),
    ipFirstSeen: context.ip,
    idleExpiresAt: new Date(at.getTime() + policy.idleMs).toISOString(),
    absoluteExpiresAt: new Date(at.getTime() + policy.absoluteMs).toISOString(),
    createdAt: at.toISOString(),
    lastSeenAt: at.toISOString(),
    revokedAt: undefined,
    revokedReason: undefined,
  }
  await store.create(session)
  return { session, token: token.token, csrf: csrf.value }
}

// ---------------------------------------------------------------------------
// Prüfen
// ---------------------------------------------------------------------------

/** Das Ergebnis einer Prüfung. */
export interface VerifiedSession {
  readonly session: SessionRecord
  /** Ob eine neue Ruhefrist geschrieben werden muss. */
  readonly shouldTouch: boolean
  /** Ob **jetzt** rotiert werden soll. */
  readonly shouldRotate: boolean
  /**
   * Ob seit dem Anmelden weniger als {@link SESSION_FRESH_MS} vergangen sind.
   *
   * Für gefährliche Handlungen: wer hier `false` bekommt, muss das Passwort
   * erneut eingeben.
   */
  readonly fresh: boolean
}

/**
 * Prüft ein Token und gibt die Sitzung zurück.
 *
 * **Die Reihenfolge der Prüfungen, und warum sie so ist.** Erst Widerruf, dann
 * Fristen. Ein widerrufenes Token ist ein Sonderfall, der **gemeldet** werden
 * muss — es ist der Fall „nach dem Abmelden benutzt", und der ist ein Hinweis auf
 * einen Diebstahl. Wäre die Reihenfolge umgekehrt, würde ein widerrufenes,
 * abgelaufenes Token als „abgelaufen" gemeldet, und der Hinweis ginge verloren.
 *
 * **Der Zeitvergleich läuft gegen die Uhr des Servers**, nicht gegen eine aus dem
 * Token gelesene Zeit — bei einem opaken Token kann der Client keine Zeit
 * behaupten.
 *
 * @param store - der Speicher
 * @param token - das Klartext-Token aus dem Cookie
 * @param policy - die Fristen
 * @param now - Zeitquelle
 * @returns die geprüfte Sitzung
 * @throws SessionError, wenn sie nicht gilt
 */
export async function verifySession(
  store: SessionStore,
  token: string,
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
  now: () => Date = () => new Date(),
): Promise<VerifiedSession> {
  if (token === '') throw new SessionError('revoked', 'Kein Sitzungstoken')

  const session = await store.findByTokenHash(tokenHash(token))
  if (session === undefined) {
    // **Dieselbe Meldung wie bei einem widerrufenen Token — wörtlich.** Ein
    // unbekanntes und ein widerrufenes Token dürfen nicht unterscheidbar sein:
    // sonst verrät die Anmeldung, ob ein geratenes Token je existiert hat.
    // Deshalb steht die Meldung als Konstante an einer Stelle, statt zweimal
    // geschrieben zu werden — zweimal geschrieben laufen die beiden Fassungen
    // irgendwann auseinander, und niemand merkt es.
    throw new SessionError('revoked', SESSION_NOT_USABLE)
  }

  const at = now()
  if (session.revokedAt !== undefined) {
    // **Wörtlich dieselbe Meldung wie bei einem unbekannten Token.** Der Grund
    // des Widerrufs geht in die Prüfspur, nicht in die Antwort: „widerrufen
    // (logout)" gegen „unbekannt" wäre ein Unterschied, den ein Angreifer messen
    // kann.
    throw new SessionError('revoked', SESSION_NOT_USABLE)
  }
  if (new Date(session.absoluteExpiresAt).getTime() <= at.getTime()) {
    throw new SessionError('expired-absolute', 'Sitzung hat die Höchstfrist erreicht')
  }
  if (new Date(session.idleExpiresAt).getTime() <= at.getTime()) {
    throw new SessionError('expired-idle', 'Sitzung war zu lange unbenutzt')
  }

  const sinceTouch = at.getTime() - new Date(session.lastSeenAt).getTime()
  const lifetime = at.getTime() - new Date(session.createdAt).getTime()

  return {
    session,
    shouldTouch: sinceTouch >= policy.touchIntervalMs,
    shouldRotate: lifetime >= policy.rotateAfterMs,
    fresh: lifetime < SESSION_FRESH_MS,
  }
}

/**
 * Prüft den CSRF-Wert gegen die Sitzung — in konstanter Zeit.
 *
 * **Der doppelte Absende-Wert („double submit") in seiner belastbaren Form.** Der
 * Wert steht in einem **lesbaren** Cookie (`SameSite=Lax` genügt dann nicht
 * immer, siehe unten) und wird von der Anwendung in eine Kopfzeile geschrieben.
 * Der Server vergleicht ihn mit dem **an die Sitzung gebundenen** Hash.
 *
 * **Die belastbare Form ist die Bindung an die Sitzung.** Ein Verfahren, das nur
 * „Cookie-Wert gleich Kopfzeilen-Wert" prüft, hat eine Lücke: eine fremde Seite
 * kann ein Cookie setzen (Subdomain, erlaubtes Drittanbieter-Cookie) und beide
 * Werte gleich machen. Weil hier gegen den **serverseitigen** Hash der Sitzung
 * geprüft wird, muss der Angreifer den Wert einer **fremden** Sitzung kennen —
 * und das kann er nicht.
 *
 * **Warum der Vergleich in konstanter Zeit läuft.** Sonst ließe sich der Wert
 * Zeichen für Zeichen erraten (siehe `constantTimeEquals` in `index.ts`).
 *
 * @param session - die geprüfte Sitzung
 * @param value - der Wert aus der Kopfzeile
 * @returns `true`, wenn er zur Sitzung gehört
 */
export function verifyCsrf(session: SessionRecord, value: string): boolean {
  if (value === '') return false
  return constantTimeEquals(session.csrfHash, tokenHash(value))
}

/**
 * Rotiert das Token einer Sitzung.
 *
 * **Was erhalten bleibt und was nicht.** Erhalten bleibt die **Kennung** der
 * Sitzung (also die Zeile, die Anzeige „wo bin ich angemeldet" und die
 * Höchstfrist — sie wird **nicht** neu gestartet, sonst könnte man die
 * Höchstfrist durch bloßes Arbeiten unbegrenzt verlängern). Neu ist das Token und
 * der CSRF-Wert.
 *
 * @param store - der Speicher
 * @param session - die Sitzung
 * @returns das neue Token und der neue CSRF-Wert
 */
export async function rotateSession(
  store: SessionStore,
  session: SessionRecord,
): Promise<{ readonly token: string; readonly csrf: string }> {
  const token = newSessionToken()
  const csrf = newCsrfPair()
  await store.replaceToken(session.id, token.hash, csrf.hash)
  return { token: token.token, csrf: csrf.value }
}

/**
 * Schreibt die Nutzung fort, wenn die Schwelle erreicht ist.
 *
 * @param store - der Speicher
 * @param verified - das Ergebnis von {@link verifySession}
 * @param policy - die Fristen
 * @param now - Zeitquelle
 */
export async function touchSession(
  store: SessionStore,
  verified: VerifiedSession,
  policy: SessionPolicy = DEFAULT_SESSION_POLICY,
  now: () => Date = () => new Date(),
): Promise<void> {
  if (!verified.shouldTouch) return
  const at = now()
  const idle = Math.min(
    at.getTime() + policy.idleMs,
    new Date(verified.session.absoluteExpiresAt).getTime(),
  )
  await store.touch(verified.session.id, at.toISOString(), new Date(idle).toISOString())
}

/** Widerruft **eine** Sitzung — der „abmelden"-Knopf. */
export async function revokeSession(
  store: SessionStore,
  id: string,
  reason = 'logout',
  now: () => Date = () => new Date(),
): Promise<void> {
  await store.revoke(id, now().toISOString(), reason)
}

/**
 * Widerruft **alle** Sitzungen eines Benutzers — der „überall abmelden"-Knopf.
 *
 * **Warum das bei einer Passwortänderung Pflicht ist.** Ein Angreifer, der das
 * Passwort kennt und es ändert, hat sonst weiter Zugang über seine **alten**
 * Sitzungen — die Passwortänderung sperrt ihn nicht aus. Wer sein Passwort
 * ändert, erwartet das Gegenteil. Dieselbe Regel gilt nach einem Reset.
 *
 * @param store - der Speicher
 * @param userId - der Benutzer
 * @param reason - der Grund; erscheint in der Prüfspur
 * @param now - Zeitquelle
 * @returns die Zahl der widerrufenen Sitzungen
 */
export async function revokeAllSessions(
  store: SessionStore,
  userId: string,
  reason = 'password-changed',
  now: () => Date = () => new Date(),
): Promise<number> {
  return store.revokeAllForUser(userId, now().toISOString(), reason)
}

// ---------------------------------------------------------------------------
// Cookie
// ---------------------------------------------------------------------------

/**
 * Die Cookie-Attribute, und warum jedes einzelne da ist.
 *
 * | Attribut | Wert | Warum genau dieser Wert |
 * |---|---|---|
 * | `HttpOnly` | immer | **kein** JavaScript-Zugriff. Ohne das könnte jedes eingebundene Skript das Token lesen und wegschicken |
 * | `Secure` | bei TLS | ohne TLS ginge das Token im Klartext über die Leitung. Auf `http://127.0.0.1` (Entwicklung) verbietet der Browser `Secure`-Cookies — deshalb ist es umschaltbar |
 * | `SameSite` | `Strict` | bei `Lax` schickt der Browser das Cookie bei einer **Navigation** von außen mit; `Strict` nicht. Für eine Anwendung, die über einen Link erreichbar sein soll, wäre `Lax` bequemer — deshalb gibt es {@link sessionCookie}`.sameSite` |
 * | `Path` | `/` | die Sitzung gilt für die ganze Anwendung |
 * | `Max-Age` | Höchstfrist | der Browser soll das Cookie nicht länger behalten als die Sitzung gilt |
 * | **Name** | `__Host-`-Präfix bei TLS | siehe unten |
 *
 * **Das `__Host-`-Präfix ist kein Schmuck.** Ein Cookie mit diesem Präfix wird
 * vom Browser **nur** akzeptiert, wenn es `Secure` ist, `Path=/` hat und **keine**
 * `Domain` trägt. Damit kann eine **Unterdomain** — etwa ein kompromittiertes
 * `blog.example.org` — kein Sitzungscookie für `example.org` setzen. Ohne das
 * Präfix ist das Cookie-Setzen über eine Unterdomain der klassische Weg zur
 * Sitzungsübernahme.
 *
 * **Warum das Präfix bei `http://` wegfällt.** Browser verwerfen `__Host-`-Cookies
 * ohne `Secure` — das Cookie käme nicht an, und die Anmeldung würde „ohne Fehler"
 * nicht funktionieren. Deshalb: mit TLS das Präfix, ohne TLS der einfache Name.
 * Der Name wird **hier** entschieden, nicht vom Aufrufer — sonst gäbe es zwei
 * Stellen, die dasselbe wissen müssen.
 */
export const SESSION_COOKIE_NAME = 'pmh_session'
export const SESSION_COOKIE_NAME_SECURE = '__Host-pmh_session'
export const CSRF_COOKIE_NAME = 'pmh_csrf'

/** Was ein Cookie braucht. */
export interface CookieOptions {
  readonly secure: boolean
  /** Höchstfrist in Sekunden; Vorgabe aus der Richtlinie. */
  readonly maxAgeSeconds: number
  /**
   * `Strict` oder `Lax`.
   *
   * Vorgabe `Strict`. `Lax` ist nötig, wenn die Anwendung über einen **Link von
   * außen** erreichbar sein muss (etwa aus einer E-Mail): mit `Strict` schickt der
   * Browser das Cookie bei dieser Navigation nicht mit, und der Benutzer landet
   * auf der Anmeldeseite, obwohl er angemeldet ist.
   */
  readonly sameSite?: 'Strict' | 'Lax'
}

/** Baut den `Set-Cookie`-Wert für das Sitzungstoken. */
export function sessionCookie(token: string, options: CookieOptions): string {
  return serializeCookie(cookieNameFor(options.secure), token, options, true)
}

/** Baut den `Set-Cookie`-Wert für den CSRF-Wert — **ohne** `HttpOnly`. */
export function csrfCookie(value: string, options: CookieOptions): string {
  // Der CSRF-Wert **muss** für die Anwendung lesbar sein, sonst kann sie ihn nicht
  // in die Kopfzeile schreiben. Das ist kein Fehler: der Wert ist kein Geheimnis
  // gegenüber dem Benutzer, sondern gegenüber einer **fremden Seite** — und die
  // kann ihn nicht lesen (gleiche Herkunft).
  return serializeCookie(CSRF_COOKIE_NAME, value, options, false)
}

/** Baut den `Set-Cookie`-Wert, der ein Cookie löscht. */
export function clearSessionCookie(options: { readonly secure: boolean }): string {
  return serializeCookie(
    cookieNameFor(options.secure),
    '',
    { secure: options.secure, maxAgeSeconds: 0 },
    true,
  )
}

/** Der Name des Sitzungscookies, abhängig von TLS. */
export function cookieNameFor(secure: boolean): string {
  return secure ? SESSION_COOKIE_NAME_SECURE : SESSION_COOKIE_NAME
}

/**
 * Setzt ein Cookie zusammen.
 *
 * **Warum hier keine Zeichen geprüft werden.** Token und CSRF-Wert sind base64url
 * (`A–Z a–z 0–9 - _`) — es gibt kein Zeichen darin, das ein Cookie zerlegen
 * könnte. Eine Prüfung wäre toter Code, der den Eindruck erweckt, hier werde
 * etwas entschieden. Wer diese Funktion mit fremden Werten aufruft, hat das
 * Problem schon vorher.
 */
function serializeCookie(name: string, value: string, options: CookieOptions, httpOnly: boolean): string {
  const parts = [
    `${name}=${value}`,
    `Max-Age=${String(Math.max(0, Math.floor(options.maxAgeSeconds)))}`,
    'Path=/',
  ]
  if (httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  parts.push(`SameSite=${options.sameSite ?? 'Strict'}`)
  return parts.join('; ')
}
