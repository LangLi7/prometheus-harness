/**
 * `@prometheus-harness/auth` — der Auth-Kern.
 *
 * **Was dieses Paket ist.** Die Regeln der Anmeldung als prüfbarer Code:
 * Passwörter hashen und prüfen, Sitzungstoken und CSRF-Paare erzeugen, Adressen
 * normalisieren, und die Anmeldung so durchführen, dass ein Angreifer aus der
 * **Antwortzeit** nichts lernt.
 *
 * **Was dieses Paket ausdrücklich NICHT ist.** Es kennt **keine** Datenbank, kein
 * HTTP, kein Cookie und kein Redis. Der Speicher kommt als Schnittstelle herein
 * ({@link UserStore}), das Protokoll entscheidet der Host. Damit ist jede Regel
 * hier **ohne** laufende Infrastruktur prüfbar — ein Sicherheitskern, der nur
 * gegen eine echte Datenbank prüfbar ist, wird nicht geprüft.
 *
 * **Und was es nicht erfindet.** Kryptografie wird **nicht** selbst gebaut: es
 * gibt kein eigenes AES, kein eigenes Argon2, kein eigenes Zufallsverfahren. Die
 * Primitive kommen aus der Laufzeit (`Bun.password`, `Bun.CryptoHasher`,
 * `crypto.getRandomValues`), die **Parameter** kommen aus einer Empfehlung
 * ({@link ARGON2_PARAMETERS}) — und die Begründung steht jeweils daneben.
 *
 * **Das Modell, an dem sich alles ausrichtet:**
 *
 * | Geheimnis | Wie es liegt | Warum |
 * |---|---|---|
 * | Passwort | Argon2id-Hash, gesalzen | aus einem Hash lässt sich das Passwort nicht zurückrechnen; Argon2id ist speicherhart und damit gegen Grafikkarten teuer |
 * | Sitzungstoken | 32 Zufallsbytes; gespeichert wird nur der SHA-256-Hash | ein Datenbankleck ist kein Sitzungsdiebstahl — und 32 Zufallsbytes sind nicht zu erraten, also genügt hier ein schneller Hash |
 * | CSRF-Wert | 32 Zufallsbytes je Sitzung; gespeichert nur der Hash | der Wert steht im Cookie und muss von der Anwendung gelesen werden können; die Zuordnung zur Sitzung liegt serverseitig |
 * | API-Schlüssel | 12 Zeichen Kennung + 32 Zufallsbytes; gespeichert nur der Hash | wie beim Sitzungstoken: die Datenbank enthält kein Geheimnis |
 *
 * @module @prometheus-harness/auth
 */

export {
  API_KEY_LIMITS,
  LOGIN_LIMITS,
  MemoryRateLimiter,
  REGISTER_LIMITS,
  RESET_LIMITS,
  apiKeyKey,
  applyBackoff,
  hitAll,
  loginAccountKey,
  loginIpKey,
  registerIpKey,
  resetAccountKey,
  resetIpKey,
  type CompoundLimitHit,
  type RateLimitHit,
  type RateLimiter,
} from './rate-limit.ts'

export {
  AuthError,
  authenticate,
  register,
  type AuthEvent,
  type AuthEventSink,
  type LoginOutcome,
  // **`NewUser` steht hier seit dem 13.10.2026 — und fehlte vorher.** Die
  // Schnittstelle kommt in der **öffentlichen** Signatur von `UserStore.create`
  // vor. Wer `UserStore` nachbauen will, muß den Parametertyp nennen können;
  // ohne Ausfuhr muß er ihn abschreiben. Gefunden hat es der Typlauf von
  // `@prometheus-harness/store-postgres`, nicht das Lesen:
  // `error TS2305: Module '"@prometheus-harness/auth"' has no exported member 'NewUser'`.
  type NewUser,
  type RegisterOptions,
  type RegisterOutcome,
  type UserRecord,
  type UserStore,
} from './identity.ts'

export {
  CSRF_COOKIE_NAME,
  DEFAULT_SESSION_POLICY,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME_SECURE,
  SESSION_FRESH_MS,
  // **`SESSION_NOT_USABLE` steht hier seit dem 13.10.2026 — und fehlte vorher.**
  // Der Kommentar an der Konstante begründet, warum sie überhaupt existiert:
  // ein unbekanntes und ein widerrufenes Token dürfen **wörtlich dieselbe**
  // Meldung bekommen, damit die Antwort nicht verrät, ob ein geratenes Token je
  // existiert hat. Eine Konstante, die der Aufrufer nicht importieren kann,
  // zwingt ihn, den Text **abzuschreiben** — und genau dann laufen die beiden
  // Fassungen auseinander, wogegen sie da ist.
  // Gefunden hat es der Ladelauf von `@prometheus-harness/auth-http`:
  // `SyntaxError: Export named 'SESSION_NOT_USABLE' not found`.
  SESSION_NOT_USABLE,
  SessionError,
  clearSessionCookie,
  cookieNameFor,
  createSession,
  csrfCookie,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  sessionCookie,
  touchSession,
  verifyCsrf,
  verifySession,
  type CookieOptions,
  type CreatedSession,
  type SessionErrorReason,
  type SessionPolicy,
  type SessionRecord,
  type SessionStore,
  type VerifiedSession,
} from './session.ts'

// ---------------------------------------------------------------------------
// Passwort-Hashing
// ---------------------------------------------------------------------------

/**
 * Die Argon2id-Parameter, mit denen neue Hashes erzeugt werden.
 *
 * **Woher die Zahlen kommen.** Es ist die Empfehlung aus dem OWASP Password
 * Storage Cheat Sheet für Argon2id in der **ersten** der dort genannten
 * Konfigurationen: 19 MiB Speicher, 2 Durchgänge, 1 Grad Parallelität. Die
 * zweite dort genannte Variante (46 MiB, 1 Durchgang) ist speicherhärter, kostet
 * aber bei jedem Anmeldeversuch das Doppelte an Speicher — bei einem Dienst, der
 * viele Anmeldungen gleichzeitig bedient, ist das der Unterschied, ob 100
 * gleichzeitige Anmeldungen 2 GB oder 5 GB belegen. Genau deshalb steht die
 * Nebenläufigkeitsgrenze in {@link DEFAULT_CONCURRENCY}.
 *
 * **Gemessen auf diesem Rechner (13.10.2026):** 20 ms für einen Hash, 16 ms für
 * eine Prüfung bei diesen Parametern. Bei 16 ms sind rund 60 Prüfungen je Sekunde
 * und CPU-Kern möglich — der Angreifer zahlt also 16 ms **je Versuch**, und genau
 * das ist der Sinn eines langsamen Hashverfahrens.
 *
 * **Diese Werte werden nicht gesenkt, um Tests schneller zu machen.** Wer die
 * Parameter für Tests ändert, testet nicht die Produktionsparameter. Die Tests
 * hier laufen mit diesen Werten; sie dauern dafür Millisekunden statt
 * Mikrosekunden.
 */
export const ARGON2_PARAMETERS = {
  algorithm: 'argon2id',
  /** 19 MiB — die OWASP-Empfehlung. */
  memoryCost: 19_456,
  /** 2 Durchgänge. */
  timeCost: 2,
  /** 1 Grad Parallelität. */
  parallelism: 1,
} as const

/**
 * Wie viele Passwort-Prüfungen gleichzeitig laufen dürfen. Vorgabe 4.
 *
 * **Warum das eine Sicherheitsgrenze ist und nicht nur eine Optimierung.** Jede
 * Prüfung belegt {@link ARGON2_PARAMETERS}`.memoryCost` — 19 MiB. Ohne Grenze
 * genügen **100 gleichzeitige Anmeldeversuche**, um rund 1,9 GB zu belegen, und
 * **1000** genügen, um den Prozess umzubringen. Ein Angreifer muss dafür keine
 * Passwörter kennen: es reicht, Anfragen zu schicken. Diese Grenze und das
 * Rate-Limit davor ({@link RateLimiter}) sind die beiden Riegel dagegen.
 *
 * Der Wert 4 ist bewusst niedrig: Anmeldungen sind **selten**, und es ist besser,
 * der hundertste Anmeldeversuch wartet eine Sekunde, als dass der Dienst
 * umfällt.
 */
export const DEFAULT_CONCURRENCY = 4

/**
 * Ein Hasher — die eine Stelle, an der Passwörter gehasht und geprüft werden.
 *
 * **Warum eine Schnittstelle und nicht direkte Aufrufe.** Damit die
 * Nebenläufigkeitsgrenze **nicht umgangen** werden kann: der Produktions-Hasher
 * und der Test-Hasher gehen durch dieselbe Tür. Wer `Bun.password.hash` direkt
 * aufruft, hat die Grenze umgangen — und das fällt in keinem Test auf, weil es
 * keinen gibt, der die Umgehung bemerkt.
 */
export interface PasswordHasher {
  /**
   * Hasht ein Passwort.
   *
   * @param password - das Klartext-Passwort; verlässt diesen Prozess nicht
   * @returns der Hash im PHC-Format
   */
  hash(password: string): Promise<string>
  /**
   * Prüft ein Passwort gegen einen Hash.
   *
   * @param password - das Klartext-Passwort
   * @param hash - der gespeicherte Hash
   * @returns `true`, wenn es passt; niemals ein Wurf bei einem kaputten Hash,
   *   sondern `false`
   */
  verify(password: string, hash: string): Promise<boolean>
}

/** Ein Hasher mit begrenzter Nebenläufigkeit über `Bun.password`. */
export class Argon2PasswordHasher implements PasswordHasher {
  readonly #limit: number
  #running = 0
  readonly #waiting: (() => void)[] = []

  /**
   * @param concurrency - höchste Zahl gleichzeitiger Prüfungen; Vorgabe
   *   {@link DEFAULT_CONCURRENCY}
   * @throws RangeError bei einer Grenze unter 1
   */
  constructor(concurrency: number = DEFAULT_CONCURRENCY) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError(`Nebenläufigkeitsgrenze muss eine ganze Zahl ≥ 1 sein, ist ${String(concurrency)}`)
    }
    this.#limit = concurrency
  }

  /** Wie viele Prüfungen gerade laufen — für Diagnose und Tests. */
  get running(): number {
    return this.#running
  }

  /** {@inheritDoc PasswordHasher.hash} */
  async hash(password: string): Promise<string> {
    return this.#exclusive(() =>
      Bun.password.hash(password, {
        algorithm: 'argon2id',
        memoryCost: ARGON2_PARAMETERS.memoryCost,
        timeCost: ARGON2_PARAMETERS.timeCost,
      }),
    )
  }

  /** {@inheritDoc PasswordHasher.verify} */
  async verify(password: string, hash: string): Promise<boolean> {
    if (hash === '') return false
    return this.#exclusive(async () => {
      try {
        return await Bun.password.verify(password, hash)
      } catch {
        // Ein unlesbarer Hash ist kein Grund zu werfen: die Anmeldung scheitert,
        // mehr nicht. Ein Wurf würde bei einem beschädigten Datensatz den
        // Anmeldeweg für alle anderen mitreißen.
        return false
      }
    })
  }

  /**
   * Führt eine Arbeit aus, aber höchstens `#limit` gleichzeitig.
   *
   * **Warum das Warten fair ist.** Die Wartenden kommen in eine Schlange und
   * werden in ihrer Reihenfolge bedient. Ein „wer zuerst kommt"-Verfahren ohne
   * Schlange (`Promise.race`) würde einzelne Anfragen **verhungern** lassen —
   * und genau die, die am längsten warten, gehören zu einem Menschen, der vor
   * dem Bildschirm sitzt.
   */
  async #exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.#running >= this.#limit) {
      await new Promise<void>((resolve) => {
        this.#waiting.push(resolve)
      })
    }
    this.#running += 1
    try {
      return await work()
    } finally {
      this.#running -= 1
      const next = this.#waiting.shift()
      if (next !== undefined) next()
    }
  }
}

/**
 * Ein Hash, gegen den geprüft wird, wenn es den Benutzer **nicht** gibt.
 *
 * **Der Angriff, den das abwehrt — und er ist real.** Wer sich mit einer Adresse
 * anmeldet, erfährt aus der Antwortzeit, ob es dieses Konto gibt:
 *
 * ```
 * Konto vorhanden:  Argon2id rechnen            16 ms  →  „Passwort falsch"
 * Konto fehlt:      sofort zurück                0 ms  →  „Passwort falsch"
 * ```
 *
 * Beide Antworten sagen dasselbe, aber eine braucht 16 ms. Damit lässt sich eine
 * Benutzerliste erstellen — und die ist die Voraussetzung für gezieltes
 * Credential Stuffing. Deshalb prüft {@link authenticate} **immer** gegen einen
 * echten Argon2id-Hash: gegen den des Benutzers oder gegen diesen.
 *
 * **Was dieser Wert NICHT ist:** das Passwort irgendeines Benutzers. Er ist ein
 * Hash eines zufälligen, nirgends gespeicherten Werts. Ein Treffer wäre
 * bedeutungslos — und das ist Absicht.
 *
 * **Er wird beim ersten Start einmal berechnet** ({@link DummyHash}), nicht
 * fest verdrahtet: ein fest verdrahteter Hash würde bei einem Wechsel der
 * Argon2-Parameter nicht mehr zu den echten passen — und der Zeitunterschied
 * wäre wieder da, genau in der Situation, in der niemand mehr hinnsieht.
 */
let dummyHashPromise: Promise<string> | undefined

/**
 * Liefert den Vergleichs-Hash, berechnet mit den **aktuellen** Parametern.
 *
 * @param hasher - der Hasher; das Ergebnis wird je Prozess einmal berechnet
 * @returns der Hash eines Zufallswerts
 */
export function DummyHash(hasher: PasswordHasher): Promise<string> {
  dummyHashPromise ??= hasher.hash(randomToken(32))
  return dummyHashPromise
}

/** Setzt den berechneten Vergleichs-Hash zurück — nur für Tests. */
export function resetDummyHash(): void {
  dummyHashPromise = undefined
}

/**
 * Prüft, ob ein gespeicherter Hash mit den **aktuellen** Parametern erzeugt wurde.
 *
 * **Wozu das gut ist.** Wenn die Parameter steigen (etwa auf 46 MiB), bleiben
 * alte Hashes gültig — sie werden beim nächsten **erfolgreichen** Anmelden neu
 * berechnet. Ohne diese Prüfung müsste man entweder alle Hashes auf einmal
 * erneuern (was die Anmeldung für alle blockiert) oder für immer bei den alten
 * Parametern bleiben.
 *
 * Gelesen wird `m=` aus dem PHC-Feld. Ein Hash **ohne** dieses Feld (also kein
 * Argon2id) gilt als „neu zu berechnen" — was auch für einen Wechsel des
 * Verfahrens richtig ist.
 *
 * @param hash - der gespeicherte Hash
 * @returns `true`, wenn er mit den heutigen Parametern erzeugt wurde
 */
export function needsRehash(hash: string): boolean {
  if (!hash.startsWith('$argon2id$')) return true
  const match = /\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(hash)
  if (match === null) return true
  return (
    Number(match[1]) !== ARGON2_PARAMETERS.memoryCost ||
    Number(match[2]) !== ARGON2_PARAMETERS.timeCost ||
    Number(match[3]) !== ARGON2_PARAMETERS.parallelism
  )
}

// ---------------------------------------------------------------------------
// Zufall und Hashing von Token
// ---------------------------------------------------------------------------

/**
 * Erzeugt `bytes` zufällige Bytes als base64url.
 *
 * **Warum `crypto.getRandomValues` und nicht `Math.random`.** `Math.random` ist
 * ein **vorhersagbarer** Zufallsgenerator. Wer den Zustand kennt — und bei
 * genug gesehenen Ausgaben lässt er sich rekonstruieren — kann jedes
 * Sitzungstoken vorhersagen, das danach erzeugt wird. Ein Sitzungstoken muss
 * kryptografisch zufällig sein; alles andere ist Dekoration.
 *
 * **Die Kodierung kommt aus der Laufzeit, nicht aus eigener Rechnung.** Die erste
 * Fassung dieser Funktion hat die Bits von Hand auf base64url verteilt — und war
 * falsch: sie erzeugte je Byte vier Zeichen statt der richtigen zwei bis drei,
 * aus 32 Bytes wurden **125** Zeichen statt 43. Das fiel im Test auf (`erwartet
 * 43, bekommen 125`) und wäre sonst nie jemandem aufgefallen: das Token wäre
 * gültig, nur dreimal so lang. Eigene Bit-Arithmetik für eine Kodierung zu
 * schreiben, die die Laufzeit beherrscht, ist genau die Art Erfindung, die
 * dieses Projekt vermeidet.
 *
 * @param bytes - Zahl der Zufallsbytes; Vorgabe 32
 * @returns der base64url-kodierte Wert ohne Auffüllzeichen
 */
export function randomToken(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 1) {
    throw new RangeError(`Zufallsbytes müssen eine ganze Zahl ≥ 1 sein, ist ${String(bytes)}`)
  }
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return Buffer.from(buffer).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

/**
 * Bildet den SHA-256-Hash eines Tokens als Hexadezimaltext.
 *
 * **Warum SHA-256 genügt, obwohl Passwörter Argon2id bekommen.** Der Unterschied
 * ist die **Entropie**, nicht die Wichtigkeit. Ein Passwort hat oft 30 Bit
 * Entropie — ein Angreifer kann Millionen Kandidaten je Sekunde durchprobieren,
 * deshalb muss das Verfahren langsam sein. Ein Sitzungstoken hat **256 Bit**:
 * Durchprobieren ist physikalisch ausgeschlossen, gleichgültig wie schnell das
 * Verfahren ist. Ein langsames Verfahren hier wäre reine Verschwendung — es
 * würde bei jeder einzelnen Anfrage 16 ms kosten.
 *
 * @param token - der Klartextwert
 * @returns 64 hexadezimale Zeichen
 */
export function tokenHash(token: string): string {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex')
}

/** Ein Sitzungstoken-Paar: der Klartext für das Cookie, der Hash für die Datenbank. */
export interface SessionToken {
  /** Der Klartextwert. Geht **nur** ins Cookie und wird nie gespeichert. */
  readonly token: string
  /** Der SHA-256-Hash. Geht in die Datenbank. */
  readonly hash: string
}

/**
 * Erzeugt ein neues Sitzungstoken.
 *
 * 32 Zufallsbytes = 256 Bit. Der Klartext verlässt diese Funktion genau einmal
 * (in die Antwort) und wird danach nicht mehr gebraucht.
 *
 * @returns Klartext und Hash
 */
export function newSessionToken(): SessionToken {
  const token = randomToken(32)
  return { token, hash: tokenHash(token) }
}

/** Ein CSRF-Paar: der Wert für das Cookie, der Hash für die Sitzungszeile. */
export interface CsrfPair {
  readonly value: string
  readonly hash: string
}

/** Erzeugt ein CSRF-Paar. Gleiche Größe und gleiche Regel wie beim Sitzungstoken. */
export function newCsrfPair(): CsrfPair {
  const value = randomToken(32)
  return { value, hash: tokenHash(value) }
}

/**
 * Vergleicht zwei Zeichenketten in **konstanter Zeit**.
 *
 * **Warum `===` hier falsch wäre.** Ein normaler Vergleich bricht beim ersten
 * unterschiedlichen Zeichen ab. Aus der Laufzeit lässt sich damit Zeichen für
 * Zeichen erraten („Zeichen 1 stimmt, es dauerte länger"). Für Geheimnisse ist
 * das ein Angriff: aus einem unmöglichen (2^256) wird ein machbarer
 * (256 × 64). Deshalb wird **immer** über die ganze Länge verglichen.
 *
 * Die Länge wird vorher geprüft — das ist kein Leck, weil die Länge eines
 * Sitzungstokens bekannt und fest ist.
 *
 * @param a - erster Wert
 * @param b - zweiter Wert
 * @returns `true` bei Gleichheit
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

// ---------------------------------------------------------------------------
// E-Mail
// ---------------------------------------------------------------------------

/**
 * Normalisiert eine E-Mail-Adresse für Vergleich und Eindeutigkeit.
 *
 * **Was normalisiert wird:** umgebender Leerraum, Kleinschreibung, und ein
 * Leerzeichen vor dem `@`.
 *
 * **Was ausdrücklich NICHT gemacht wird — und warum.** Der lokale Teil einer
 * Adresse (vor dem `@`) darf laut RFC **case-sensitiv** sein: `Ada@x.org` und
 * `ada@x.org` könnten zwei verschiedene Postfächer sein. In der Praxis sind sie
 * es fast nie, und die Grossschreibung ist meist ein Tippfehler. Wer sie
 * **nicht** normalisiert, erzeugt zwei Konten für einen Menschen.
 *
 * Der übliche Kompromiss — auch hier — ist deshalb: **kleinschreiben**, aber
 * **nichts weiter anfassen**. Insbesondere wird der lokale Teil **nicht** nach
 * Gmail-Art von Punkten befreit und **nicht** von einem `+`-Zusatz getrennt: das
 * ist anbieterspezifisch und würde bei anderen Anbietern falsche Konten
 * zusammenlegen.
 *
 * **Und was noch fehlt:** das Entfernen von Unicode-Tarnungen („homoglyph"
 * attacks: kyrillisches `а` statt lateinischem `a`). Das gehört in die
 * Registrierung als **eigene** Prüfung, nicht hierher — eine Normalisierung, die
 * Zeichen ersetzt, würde legitime Adressen verändern.
 *
 * @param email - die rohe Adresse
 * @returns die normalisierte Form
 */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at === -1) return trimmed
  return `${trimmed.slice(0, at).trimEnd()}@${trimmed.slice(at + 1)}`
}

/** Warum eine Adresse als unbrauchbar gilt. */
export type EmailRejection = 'empty' | 'no-at' | 'too-long' | 'local-too-long' | 'domain-too-long' | 'bad-chars'

/** Das Urteil über eine Adresse. */
export type EmailCheck = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: EmailRejection }

/**
 * Prüft eine Adresse auf **Brauchbarkeit**, nicht auf Zustellbarkeit.
 *
 * **Was hier bewusst nicht passiert: keine „vollständige" RFC-5322-Prüfung.** Der
 * vollständige Ausdruck ist notorisch und prüft trotzdem nicht, ob es die Adresse
 * gibt. Geprüft wird, was **sicher** falsch ist: leer, kein `@`, zu lang, ein
 * Steuerzeichen. Ob eine Adresse existiert, beantwortet nur eine Mail — und die
 * kommt später.
 *
 * **Die Längen nach RFC 5321:** höchstens 254 Zeichen gesamt, 64 im lokalen Teil,
 * 255 in der Domain. Diese Grenzen sind echt: ein Postfach, das sie überschreitet,
 * ist nicht erreichbar, und ein Angreifer kann mit sehr langen Adressen
 * Speicherverbrauch treiben.
 *
 * @param email - die rohe Adresse
 * @returns das Urteil mit der normalisierten Form
 */
export function checkEmail(email: string): EmailCheck {
  const value = normalizeEmail(email)
  if (value === '') return { ok: false, reason: 'empty' }
  const at = value.lastIndexOf('@')
  if (at <= 0 || at === value.length - 1) return { ok: false, reason: 'no-at' }
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  if (value.length > 254) return { ok: false, reason: 'too-long' }
  if (local.length > 64) return { ok: false, reason: 'local-too-long' }
  if (domain.length > 255) return { ok: false, reason: 'domain-too-long' }
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    // Steuerzeichen und Leerraum: eine Adresse mit einem Zeilenumbruch ist
    // entweder ein Fehler oder ein Versuch, in eine Kopfzeile einzuschleusen.
    if (code < 0x21 || code === 0x7f || character === ' ') return { ok: false, reason: 'bad-chars' }
  }
  return { ok: true, value }
}

// ---------------------------------------------------------------------------
// Passwort-Prüfung
// ---------------------------------------------------------------------------

/** Warum ein Passwort abgelehnt wird. */
export type PasswordRejection =
  | 'too-short'
  | 'too-long'
  | 'equals-email'
  | 'common'
  | 'needs-more-variety'

/** Das Urteil über ein neues Passwort. */
export type PasswordCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: PasswordRejection; readonly hint: string }

/**
 * Die Mindest- und Höchstlänge.
 *
 * **Warum mindestens 16 Zeichen.** NIST SP 800-63B verlangt mindestens 8 und
 * empfiehlt ausdrücklich, **Länge über Zeichenklassen** zu stellen. Für einen
 * Dienst, an dem **API-Schlüssel, Chats und Workspaces** hängen, sind 16 die
 * vertretbare Untergrenze — und sie erlaubt es, auf eine Zeichenarten-Regel
 * **ganz** zu verzichten (siehe {@link checkPassword}). Damit ist eine
 * Passphrase wie `korrekt pferd batterie klammer` genau so willkommen wie
 * `X7#qL9$vB2!mN4`.
 *
 * **Warum eine Obergrenze — und warum sie kein Widerspruch ist.** Ein Passwort
 * von einem Megabyte wäre ein kostenloser Hebel, um den Server mit
 * Argon2id-Berechnungen zu belasten: **jeder** Anmeldeversuch rechnet über die
 * **Die Untergrenze ist 8, nicht 16 (geändert 14.10.2026).** 8 ist die
 * Untergrenze, die NIST SP 800-63B selbst nennt; 16 war **strenger als der
 * Standard**. Wer auf 8 geht, muß aber die **zweite Hälfte** der NIST-Regel
 * mitnehmen — den Abgleich gegen geleakte Paßwörter —, sonst ist es eine
 * Lockerung ohne die Gegenmaßnahme, für die NIST sie erlaubt. Genau das war der
 * Anlaß für {@link COMMON_PASSWORDS} in der erweiterten Fassung: **mit der
 * Untergrenze 8 fallen `password`, `passwort` und `12345678` nicht mehr durch die
 * Länge** — sie müssen von der Liste gefangen werden.
 *
 * **Die Obergrenze ist 1024, nicht 128 (geändert 14.10.2026).** Der Betreiber
 * wollte „danach solange es will". Eine echte Unbegrenztheit wäre eine
 * **Angriffsfläche**: jede Anmeldung rechnet Argon2id über die Eingabe. 1024
 * Zeichen sind praktisch „solange es will" (eine Passphrase liegt bei 20–60) und
 * trotzdem eine Schranke. `random_hex` in `native/crypto` begrenzt aus demselben
 * Grund auf 4096 Byte.
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 1024

/**
 * Die häufigsten Passwörter, gegen die geprüft wird.
 *
 * ## Zwei eigene Fehler, die hier schon passiert sind
 *
 * **1. Die Liste war unerreichbar (13.10.2026).** Die erste Fassung enthielt
 * `password`, `passwort`, `letmeinletmein` und ähnliche — **alle unter 16
 * Zeichen**. Seit {@link PASSWORD_MIN_LENGTH} 16 betrug, wies die Längenprüfung
 * jede davon ab, **bevor** die Liste überhaupt gefragt wurde: sie prüfte nichts.
 * Aufgefallen ist es, weil der Test auf `reason: 'common'` stattdessen
 * `'too-short'` bekam.
 *
 * **2. Und dann drohte dasselbe von der anderen Seite (14.10.2026).** Mit der
 * Untergrenze **8** fällt `password` (8 Zeichen) **nicht mehr** durch die Länge —
 * die kurzen Klassiker wären also wieder **offen** gewesen, wenn die Liste sie
 * nicht enthielte. Deshalb steht sie jetzt **an beiden Enden**: die kurzen fängt
 * sie, die langen auch.
 *
 * **Alles ab 8 Zeichen.** Wer einen kürzeren Eintrag aufnimmt, baut Fehler 1
 * wieder ein; der Test prüft ausdrücklich, daß **jeder** Eintrag die
 * Längenprüfung besteht.
 *
 * ## Was diese Liste ist und was nicht
 *
 * Sie ist ein **kleiner** Riegel gegen die offensichtlichsten Fälle — ein
 * **Anfang**, keine Breach-Liste. Eine echte Liste hat Millionen Einträge und
 * gehört **nicht** in den Quelltext: sie ist selbst ein Artefakt, das gepflegt
 * werden muß, und ein veralteter Auszug erzeugt falsche Sicherheit.
 *
 * **Was stattdessen gehört:** eine Prüfung gegen eine **Breach-Liste** über
 * k-Anonymität (HIBP Pwned Passwords, die ersten fünf Zeichen des SHA-1-Hashes) —
 * der Server sieht dabei nie das Passwort. Das ist ein eigener Schritt mit einer
 * **Netzabhängigkeit** und steht als offener Punkt im Bericht.
 */
export const COMMON_PASSWORDS: readonly string[] = [
  // Kurz — ab der Untergrenze 8. Diese fängt die Länge NICHT mehr.
  'password',
  'passwort',
  'password1',
  'passwort1',
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '00000000',
  'aaaaaaaa',
  'qwertyuiop',
  'qwertzuiop',
  'letmein1',
  'iloveyou',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'superman',
  'trustno1',
  'welcome1',
  'willkommen',
  'hallo123',
  'geheim123',
  'schalke04',
  'administrator',
  'sommersonne',
  'winter2026',
  'sommer2026',
  // Lang — ab 16. Diese fängt die Länge ebenfalls nicht.
  'passwordpassword',
  'passwortpasswort',
  '1234567890123456',
  'qwertyuiop123456',
  'qwertzuiop123456',
  'administrator123',
  'letmeinletmein123',
  'iloveyouiloveyou',
  'passwort12345678',
  'password12345678',
  'sommersonne2026!',
  'willkommen2026!!',
]

/**
 * Prüft ein neues Passwort.
 *
 * **Die Regeln und ihre Begründung:**
 *
 * | Regel | Warum |
 * |---|---|
 * | Länge 8–1024 | siehe {@link PASSWORD_MIN_LENGTH}. **8 ist die NIST-Untergrenze** (vorher 16 — strenger als der Standard); **1024 als Obergrenze** (vorher 128), damit „solange es will" keine Angriffsfläche wird |
 * | nicht gleich der Adresse oder ihr ähnlich | ein Passwort, das aus dem Benutzernamen besteht, ist in jeder Wörterbuchliste |
 * | nicht in {@link COMMON_PASSWORDS} | die häufigsten Passwörter werden zuerst probiert |
 *
 * **Was hier ausdrücklich NICHT geprüft wird:** „Sonderzeichen erforderlich",
 * „Großbuchstabe erforderlich", Ablauf nach 90 Tagen. Das sind die Regeln, die
 * zu `Passwort1!` führen — sie machen Passwörter schlechter, nicht besser. NIST
 * SP 800-63B rät ausdrücklich davon ab.
 *
 * **Der eigene Fehler, der zu dieser Fassung führte (13.10.2026).** Die erste
 * Fassung verlangte 12 Zeichen **und** mindestens zwei Zeichenarten. Der Test
 * `checkPassword('a'.repeat(12))` auf `ok: true` schlug fehl — und der Test hatte
 * recht: `sonnenschein` (12 Buchstaben) wäre abgelehnt worden. Eine Regel gegen
 * Passphrasen ist eine Regel gegen Sicherheit. Länge ist der Hebel, den ein
 * Angreifer am teuersten bezahlt.
 *
 * @param password - das neue Passwort
 * @param email - die Adresse des Kontos, falls schon bekannt
 * @returns das Urteil mit einem Hinweis für den Benutzer
 */
export function checkPassword(password: string, email = ''): PasswordCheck {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      reason: 'too-short',
      hint: `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen. Ein Satz ist besser als ein Wort mit Sonderzeichen.`,
    }
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      reason: 'too-long',
      hint: `Höchstens ${PASSWORD_MAX_LENGTH} Zeichen.`,
    }
  }

  const lowered = password.toLowerCase()
  const localPart = normalizeEmail(email).split('@')[0] ?? ''
  if (localPart.length >= 4 && lowered.includes(localPart)) {
    return {
      ok: false,
      reason: 'equals-email',
      hint: 'Das Passwort darf nicht aus der eigenen Adresse bestehen.',
    }
  }
  if (COMMON_PASSWORDS.includes(lowered)) {
    return { ok: false, reason: 'common', hint: 'Dieses Passwort steht in jeder Liste ganz oben.' }
  }
  // **Auch der Kern zählt.** `password123` ist nicht `password` — aber es wird
  // genauso zuerst probiert. Deshalb wird zusätzlich der Rest **ohne Ziffern und
  // Sonderzeichen am Ende** geprüft. Nur am Ende: `meinpassword` soll ein
  // zulässiges Paßwort bleiben, `password1` nicht.
  const kern = lowered.replace(/[^a-z]+$/u, '')
  if (kern.length >= PASSWORD_MIN_LENGTH && COMMON_PASSWORDS.includes(kern)) {
    return {
      ok: false,
      reason: 'common',
      hint: 'Dieses Passwort steht in jeder Liste ganz oben — der Zusatz am Ende hilft nicht.',
    }
  }

  return { ok: true }
}

/** Zählt, wie viele Arten von Zeichen vorkommen: Buchstabe, Ziffer, anderes. */
export function countCharacterKinds(password: string): number {
  let letters = false
  let digits = false
  let others = false
  for (const character of password) {
    if (/[a-zA-Z]/.test(character)) letters = true
    else if (/[0-9]/.test(character)) digits = true
    else others = true
  }
  return (letters ? 1 : 0) + (digits ? 1 : 0) + (others ? 1 : 0)
}
