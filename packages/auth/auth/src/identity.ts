/**
 * Identität: Registrierung, Anmeldung, Speicher-Schnittstelle.
 *
 * **Die eine Regel, die dieses Modul trägt.** Eine fehlgeschlagene Anmeldung
 * sagt **nie**, ob es das Konto gibt. Nicht in der Meldung — und nicht in der
 * **Antwortzeit**. Dieselbe Meldung für beide Fälle, dieselbe Arbeit für beide
 * Fälle ({@link authenticate} rechnet immer einen Argon2id-Hash) und dieselbe
 * Zählung für beide Fälle.
 *
 * **Warum das so wichtig ist.** Wer erfährt, welche Adressen registriert sind,
 * hat die halbe Arbeit eines Einbruchs schon getan: aus „irgendwer" wird eine
 * Liste konkreter Konten, und aus einem breiten Angriff wird ein gezielter. Die
 * Zeitmessung ist dabei der Punkt, den fast jede Implementierung übersieht —
 * „die Meldungen sind gleich" genügt nicht, wenn eine Antwort 16 ms und die
 * andere 0 ms braucht.
 *
 * @module @prometheus-harness/auth/identity
 */

import {
  DummyHash,
  checkEmail,
  checkPassword,
  needsRehash,
  normalizeEmail,
  type PasswordCheck,
  type PasswordHasher,
} from './index.ts'

// ---------------------------------------------------------------------------
// Speicher-Schnittstelle
// ---------------------------------------------------------------------------

/** Ein Benutzer, wie ihn der Auth-Kern sieht. */
export interface UserRecord {
  readonly id: string
  readonly email: string
  /**
   * Der Passwort-Hash — oder `undefined`.
   *
   * `undefined` heißt: dieses Konto hat kein Passwort gesetzt (Einladung,
   * Einmal-Anmeldung). Das ist **kein** Freibrief: {@link authenticate} gibt in
   * diesem Fall `credentials-invalid` zurück, genau wie bei einem falschen
   * Passwort. Wer das anders implementiert, baut eine Anmeldung ohne Passwort.
   */
  readonly passwordHash: string | undefined
  readonly displayName: string
  readonly role: 'user' | 'admin'
  /** Gesetzt heißt: das Konto ist gesperrt. */
  readonly disabledAt: string | undefined
}

/** Ein neuer Benutzer, wie ihn der Speicher aufnehmen soll. */
export interface NewUser {
  readonly id: string
  readonly email: string
  /**
   * Der Passwort-Hash — oder `null`.
   *
   * **`null` ist kein Versehen, sondern ein Zustand:** das Konto existiert, hat
   * aber noch kein Passwort. Genau so entsteht es, wenn ein Administrator es
   * anlegt und der Mensch es erst über einen Link setzt. Die Spalte ist in der
   * Datenbank dafür `NULL`-fähig; gelesen wird sie als `undefined` (siehe
   * {@link UserRecord.passwordHash}).
   *
   * **Warum nicht der leere Text.** `''` wäre ein Hash, der nie paßt — und
   * `authenticate` könnte ihn nicht von einem echten Hash unterscheiden. `null`
   * ist dagegen dieselbe Aussage wie `undefined`: kein Passwort gesetzt.
   */
  readonly passwordHash: string | null
  readonly displayName: string
  /**
   * Die Rolle des neuen Kontos; ohne Angabe `user`.
   *
   * **Warum das Feld hier steht — und vorher fehlte.** `RegisterOptions` hatte
   * schon ein `role`, und `register` schrieb es in den **Rückgabewert**:
   *
   * ```ts
   * user: { …, role: options.role ?? 'user' }
   * ```
   *
   * An `store.create` wurde es aber **nicht** übergeben — es konnte nicht, denn
   * dieses Feld gab es nicht. Am 13.10.2026 gemessen:
   *
   * ```
   * Antwort des Weges:  {"role":"admin"}
   * Zeile in der Datenbank: rolle=user
   * ```
   *
   * Der Aufrufer bekam also **gesagt**, es sei ein Admin — und die Datenbank
   * hielt einen gewöhnlichen Benutzer. Das ist schlimmer als ein ignoriertes
   * Feld: der Erstlogin hätte ein „Admin"-Konto gemeldet, mit dem sich nichts
   * verwalten läßt, und die Ursache läge drei Schichten entfernt.
   */
  readonly role?: 'user' | 'admin'
}

/** Ein Eintrag der Prüfspur. **Ohne** Klartext-Geheimnisse und ohne Nachrichteninhalte. */
export interface AuthEvent {
  readonly kind:
    | 'register'
    | 'login-success'
    | 'login-failed'
    | 'login-disabled'
    | 'logout'
    | 'session-revoked'
    | 'password-reset-requested'
    | 'password-changed'
    | 'api-key-created'
    | 'api-key-revoked'
    | 'rate-limited'
  readonly userId?: string
  readonly email?: string
  readonly ip?: string
  readonly userAgent?: string
  readonly detail?: Readonly<Record<string, unknown>>
}

/**
 * Die eine Stelle, an der Prüfspur-Ereignisse landen.
 *
 * **Warum das sein darf, ohne zu werfen.** Eine Prüfspur, deren Schreiben die
 * Anmeldung abbrechen kann, ist ein Ausfallgrund: ist die Tabelle voll oder der
 * Dienst langsam, kann sich niemand mehr anmelden. Deshalb **darf** ein Sink
 * still scheitern — aber er darf nicht schweigen: die Umsetzung soll den Fehler
 * protokollieren. Diese Entscheidung gehört dokumentiert, weil sie wie
 * Nachlässigkeit aussieht und keine ist.
 */
export interface AuthEventSink {
  record(event: AuthEvent): Promise<void>
}

/**
 * Der Speicher hinter dem Auth-Kern.
 *
 * **Warum eine Schnittstelle und keine SQL-Aufrufe hier.** Damit dieser Kern
 * ohne Datenbank prüfbar ist — und damit die Datenbank austauschbar bleibt. Die
 * Regeln der Anmeldung sind Logik; wo die Zeilen liegen, ist eine andere Frage.
 * Die Umsetzung gegen PostgreSQL steht in `@prometheus-harness/auth-postgres`.
 */
export interface UserStore {
  /** Sucht einen Benutzer über die **normalisierte** Adresse. */
  findByEmail(email: string): Promise<UserRecord | undefined>
  /** Sucht einen Benutzer über die Kennung. */
  findById(id: string): Promise<UserRecord | undefined>
  /**
   * Legt einen Benutzer an.
   *
   * @returns die Kennung — oder `undefined`, wenn die Adresse **schon vergeben**
   *   ist. Das ist kein Fehler, sondern ein erwarteter Ausgang: zwei gleichzeitige
   *   Registrierungen derselben Adresse sind möglich, und die Datenbank entscheidet,
   *   welche gewinnt. Wer hier `undefined` nicht behandelt, baut ein Zeitfenster,
   *   in dem zwei Konten entstehen.
   */
  create(user: NewUser): Promise<string | undefined>
  /** Schreibt einen neuen Hash — für die Neuberechnung nach Parameterwechsel. */
  updatePasswordHash(id: string, passwordHash: string): Promise<void>
  /**
   * Zählt die Benutzer.
   *
   * **Wozu der Kern das braucht.** Für zwei Dinge: die Grenze
   * {@link RegisterOptions.maxUsers} (eine Registrierung, die niemanden
   * hineinlässt, soll das **vor** dem teuren Argon2id-Lauf sagen) und die
   * Feststellung, ob ein Konto das **erste** ist. Das erste Konto ist ein
   * Sonderfall: es gibt niemanden, der es freischalten oder Rechte vergeben
   * könnte — diese Entscheidung gehört dem Aufrufer, nicht diesem Modul.
   */
  count(): Promise<number>
}

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

/** Warum eine Anfrage abgelehnt wurde. */
export type AuthErrorReason =
  | 'email-invalid'
  | 'password-weak'
  | 'email-taken'
  | 'store-failed'

/** Ein Fehler des Auth-Kerns, mit unterscheidbarem Grund. */
export class AuthError extends Error {
  readonly reason: AuthErrorReason
  /** Der Hinweis für den Benutzer, sofern es einen gibt. */
  readonly hint: string | undefined

  constructor(reason: AuthErrorReason, message: string, hint?: string) {
    super(message)
    this.name = 'AuthError'
    this.reason = reason
    this.hint = hint
  }
}

// ---------------------------------------------------------------------------
// Anmeldung
// ---------------------------------------------------------------------------

/** Warum eine Anmeldung nicht gelungen ist. */
export type LoginOutcome =
  /** Erfolgreich. */
  | { readonly ok: true; readonly user: UserRecord; readonly rehashed: boolean }
  /**
   * Nicht gelungen.
   *
   * **Ein einziger Wert für drei Ursachen:** falsche Adresse, falsches Passwort,
   * Konto ohne Passwort. Das ist Absicht: der Aufrufer **kann** nicht
   * unterscheiden, also kann er es auch nicht versehentlich verraten.
   */
  | { readonly ok: false; readonly reason: 'credentials-invalid' }
  /** Das Konto ist gesperrt. */
  | { readonly ok: false; readonly reason: 'disabled' }

/**
 * Führt eine Anmeldung durch — **in gleichbleibender Arbeit**.
 *
 * **Der Ablauf, und warum er genau so aussieht:**
 *
 * ```
 * 1. Adresse normalisieren und prüfen     (billig, immer gleich)
 * 2. Benutzer laden                       (schnell)
 * 3. Argon2id prüfen — IMMER              ← der Kern
 *       Konto da?    → gegen seinen Hash
 *       Konto fehlt? → gegen den Vergleichs-Hash
 * 4. Ergebnis                               (eine Meldung für alle Fälle)
 * ```
 *
 * Schritt 3 ist der Punkt. Ohne ihn braucht „Konto fehlt" 0 ms und „Passwort
 * falsch" 16 ms — und aus dieser Differenz lässt sich eine Benutzerliste
 * erstellen. Der Vergleichs-Hash wird **mit den aktuellen Parametern** erzeugt
 * ({@link DummyHash}), damit beide Wege gleich viel kosten.
 *
 * **Was hier nicht geprüft wird: die Drosselung.** Sie gehört **vor** diesen
 * Aufruf (siehe `rate-limit.ts`) — sonst wäre der Angriff schon bezahlt. Diese
 * Funktion rechnet; sie zählt nicht.
 *
 * **Was bei einem gesperrten Konto geschieht:** das Passwort wird **trotzdem**
 * geprüft, bevor „gesperrt" gemeldet wird. Sonst wäre die Sperre an der
 * Antwortzeit erkennbar, noch bevor jemand ein Passwort kennt — und ein
 * gesperrtes Konto würde verraten, dass es existiert.
 *
 * @param store - der Speicher
 * @param hasher - der Passwort-Hasher
 * @param email - die eingegebene Adresse
 * @param password - das eingegebene Passwort
 * @param sink - die Prüfspur, falls vorhanden
 * @param context - IP und Client-Kennung für die Prüfspur
 * @returns das Ergebnis
 */
export async function authenticate(
  store: UserStore,
  hasher: PasswordHasher,
  email: string,
  password: string,
  sink?: AuthEventSink,
  context: { readonly ip?: string; readonly userAgent?: string } = {},
): Promise<LoginOutcome> {
  const normalized = normalizeEmail(email)
  const user = normalized === '' ? undefined : await store.findByEmail(normalized)

  // **Immer rechnen.** Bei fehlendem Konto gegen den Vergleichs-Hash, bei einem
  // Konto ohne Passwort ebenfalls — ein Konto ohne Passwort darf keine
  // Abkürzung sein.
  const hash = user?.passwordHash ?? (await DummyHash(hasher))
  const matches = await hasher.verify(password, hash)

  if (user === undefined || user.passwordHash === undefined || !matches) {
    await sink?.record({
      kind: 'login-failed',
      ...(user === undefined ? {} : { userId: user.id }),
      email: normalized,
      ...(context.ip === undefined ? {} : { ip: context.ip }),
      userAgent: context.userAgent ?? '',
    })
    return { ok: false, reason: 'credentials-invalid' }
  }

  if (user.disabledAt !== undefined) {
    await sink?.record({
      kind: 'login-disabled',
      userId: user.id,
      email: normalized,
      ...(context.ip === undefined ? {} : { ip: context.ip }),
      userAgent: context.userAgent ?? '',
    })
    return { ok: false, reason: 'disabled' }
  }

  // **Die Neuberechnung geschieht nach der erfolgreichen Prüfung, nie davor.**
  // Ein neuer Hash ist teuer (ein zweiter Argon2id-Lauf); ihn vor der Prüfung zu
  // berechnen würde jedem Fehlversuch die doppelte Arbeit aufbürden und damit
  // genau den Hebel verstärken, gegen den die Drosselung schützt.
  //
  // Und sie darf die Anmeldung **nicht** scheitern lassen: der Benutzer ist
  // angemeldet, der Hash ist gültig. Ein fehlgeschlagenes Neuberechnen ist ein
  // Hinweis für die Wartung, kein Grund, jemanden abzuweisen.
  let rehashed = false
  if (needsRehash(user.passwordHash)) {
    try {
      await store.updatePasswordHash(user.id, await hasher.hash(password))
      rehashed = true
    } catch {
      rehashed = false
    }
  }

  await sink?.record({
    kind: 'login-success',
    userId: user.id,
    email: normalized,
    ...(context.ip === undefined ? {} : { ip: context.ip }),
    userAgent: context.userAgent ?? '',
    detail: { rehashed },
  })
  return { ok: true, user, rehashed }
}

// ---------------------------------------------------------------------------
// Registrierung
// ---------------------------------------------------------------------------

/** Einstellungen der Registrierung. */
export interface RegisterOptions {
  /** Wie viele Benutzer es höchstens geben darf. `undefined` heißt: keine Grenze. */
  readonly maxUsers?: number
  /** Rolle des neuen Kontos; Vorgabe `user`. */
  readonly role?: 'user' | 'admin'
  /** Prüfspur. */
  readonly sink?: AuthEventSink
  readonly ip?: string
  readonly userAgent?: string
  /** Erzeugt eine neue Kennung; austauschbar, damit Tests feste Kennungen haben. */
  readonly newId?: () => string
}

/** Das Ergebnis einer Registrierung. */
export type RegisterOutcome =
  | {
      readonly ok: true
      readonly user: UserRecord
      /**
       * Ob **dieser** Aufruf das erste Konto erzeugt hat.
       *
       * **Warum das zurückkommt.** Das erste Konto ist ein Sonderfall: es gibt
       * niemanden, der es freischalten könnte, und niemanden, der Rechte vergeben
       * könnte. Wer den ersten Benutzer anlegt, entscheidet damit über die
       * Vergabe der ersten Administratorrechte — eine Entscheidung, die der
       * Aufrufer treffen muss, nicht dieses Modul.
       */
      readonly firstUser: boolean
    }
  | { readonly ok: false; readonly reason: AuthErrorReason; readonly hint: string | undefined }

/**
 * Legt ein Konto an.
 *
 * **Reihenfolge der Prüfungen, und warum sie so ist.** Erst die Adresse, dann das
 * Passwort, dann der Speicher. Die Reihenfolge spart Arbeit bei offensichtlich
 * falschen Eingaben — und, wichtiger: der teure Argon2id-Lauf beginnt erst, wenn
 * die Eingabe es überhaupt wert ist. Eine Anmeldung mit leerem Passwort soll
 * nicht 20 ms Speicher belegen.
 *
 * **Warum das genommene Konto nicht als Fehler geworfen wird.** Ein `AuthError`
 * mit `email-taken` ist ein **erwarteter** Ausgang bei einer Registrierung, kein
 * Ausnahmefall. Der Aufrufer muss ihn ohnehin behandeln — und eine Ausnahme, die
 * zum normalen Ablauf gehört, wird irgendwann versehentlich verschluckt.
 *
 * **Die Zeitangabe, die es nicht verrät.** `email-taken` **verrät** die Existenz
 * eines Kontos — das ist bei einer Registrierung unvermeidlich (wer sich
 * registriert, muss erfahren, dass die Adresse schon da ist). Deshalb gehört
 * davor eine **Drosselung je IP** ({@link REGISTER_LIMITS}) — sonst ist die
 * Registrierung die Hintertür zur Benutzerliste, die die Anmeldung sorgfältig
 * verschließt.
 *
 * @param store - der Speicher
 * @param hasher - der Hasher
 * @param email - die gewünschte Adresse
 * @param password - das gewünschte Passwort
 * @param displayName - Anzeigename
 * @param options - Grenzen, Prüfspur, Kennungserzeugung
 * @returns das Ergebnis
 */
export async function register(
  store: UserStore,
  hasher: PasswordHasher,
  email: string,
  password: string,
  displayName: string,
  options: RegisterOptions = {},
): Promise<RegisterOutcome> {
  const emailCheck = checkEmail(email)
  if (!emailCheck.ok) {
    return { ok: false, reason: 'email-invalid', hint: `Die Adresse ist unbrauchbar (${emailCheck.reason}).` }
  }
  const passwordCheck: PasswordCheck = checkPassword(password, emailCheck.value)
  if (!passwordCheck.ok) {
    return { ok: false, reason: 'password-weak', hint: passwordCheck.hint }
  }

  // Die Grenze **vor** dem teuren Lauf prüfen: eine Registrierung, die niemanden
  // hineinlässt, soll nicht 19 MiB und 16 ms kosten — sonst ist die Grenze selbst
  // ein Hebel für eine Überlastung.
  const existing = await store.count()
  if (options.maxUsers !== undefined && existing >= options.maxUsers) {
    return {
      ok: false,
      reason: 'store-failed',
      hint: 'Auf dieser Instanz ist die Höchstzahl der Konten erreicht.',
    }
  }

  const newId = options.newId ?? ((): string => crypto.randomUUID())
  const passwordHash = await hasher.hash(password)
  // **Die Rolle geht MIT.** Sie wurde vorher nur im Rückgabewert behauptet —
  // siehe die Begründung an `NewUser.role`.
  const role = options.role ?? 'user'
  const id = await store.create({
    id: newId(),
    email: emailCheck.value,
    passwordHash,
    displayName: displayName.trim(),
    role,
  })

  if (id === undefined) {
    return {
      ok: false,
      reason: 'email-taken',
      hint: 'Für diese Adresse gibt es schon ein Konto. Melde dich an oder setze das Passwort zurück.',
    }
  }

  await options.sink?.record({
    kind: 'register',
    userId: id,
    email: emailCheck.value,
    ...(options.ip === undefined ? {} : { ip: options.ip }),
    userAgent: options.userAgent ?? '',
  })

  return {
    ok: true,
    firstUser: existing === 0,
    user: {
      id,
      email: emailCheck.value,
      passwordHash,
      displayName: displayName.trim(),
      role: options.role ?? 'user',
      disabledAt: undefined,
    },
  }
}
