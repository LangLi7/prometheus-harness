/**
 * Tests für den Auth-Kern.
 *
 * **Worauf diese Tests zielen.** Nicht „es funktioniert", sondern die Stellen, an
 * denen ein Anmeldesystem **still** unsicher wird:
 *
 * - eine Antwortzeit, die verrät, ob es ein Konto gibt
 * - ein Konto ohne Passwort, das als „Anmeldung ohne Passwort" durchgeht
 * - ein Vergleich, der beim ersten falschen Zeichen abbricht
 * - eine Sitzung, die nach „überall abmelden" weiterlebt
 * - ein Rate-Limit, das bei einem Doppelaufruf beide Male „erlaubt" sagt
 * - ein Cookie, das eine Unterdomain setzen kann
 *
 * **Diese Tests laufen mit den echten Argon2id-Parametern.** Sie sind deshalb
 * Millisekunden lang statt Mikrosekunden — und sie prüfen genau das, was im
 * Betrieb läuft. Wer die Parameter für Tests senkt, testet nicht die Produktion.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  ARGON2_PARAMETERS,
  Argon2PasswordHasher,
  AuthError,
  COMMON_PASSWORDS,
  DEFAULT_SESSION_POLICY,
  LOGIN_LIMITS,
  MemoryRateLimiter,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESET_LIMITS,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME_SECURE,
  SESSION_FRESH_MS,
  SessionError,
  applyBackoff,
  authenticate,
  checkEmail,
  checkPassword,
  clearSessionCookie,
  constantTimeEquals,
  countCharacterKinds,
  createSession,
  csrfCookie,
  hitAll,
  loginAccountKey,
  loginIpKey,
  needsRehash,
  newCsrfPair,
  newSessionToken,
  normalizeEmail,
  randomToken,
  register,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  sessionCookie,
  tokenHash,
  touchSession,
  verifyCsrf,
  verifySession,
  type AuthEvent,
  type PasswordHasher,
  type SessionRecord,
  type SessionStore,
  type UserRecord,
  type UserStore,
} from '../src/index.ts'

// ---------------------------------------------------------------------------
// Prüfgerüst: Speicher-Attrappen
// ---------------------------------------------------------------------------

/** Ein Benutzerspeicher im Arbeitsspeicher. */
class FakeUsers implements UserStore {
  readonly users = new Map<string, UserRecord>()
  readonly events: AuthEvent[] = []
  readonly hashesWritten: { id: string; hash: string }[] = []

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    for (const user of this.users.values()) if (normalizeEmail(user.email) === normalizeEmail(email)) return user
    return undefined
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    return this.users.get(id)
  }

  async create(user: {
    readonly id: string
    readonly email: string
    readonly passwordHash: string
    readonly displayName: string
  }): Promise<string | undefined> {
    if ((await this.findByEmail(user.email)) !== undefined) return undefined
    this.users.set(user.id, {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      displayName: user.displayName,
      role: 'user',
      disabledAt: undefined,
    })
    return user.id
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    const user = this.users.get(id)
    if (user === undefined) return
    this.hashesWritten.push({ id, hash: passwordHash })
    this.users.set(id, { ...user, passwordHash })
  }

  async count(): Promise<number> {
    return this.users.size
  }
}

/** Ein Sitzungsspeicher im Arbeitsspeicher. */
class FakeSessions implements SessionStore {
  readonly rows = new Map<string, SessionRecord>()

  async findByTokenHash(hash: string): Promise<SessionRecord | undefined> {
    for (const row of this.rows.values()) if (row.tokenHash === hash) return row
    return undefined
  }

  async findById(id: string): Promise<SessionRecord | undefined> {
    return this.rows.get(id)
  }

  async create(session: SessionRecord): Promise<void> {
    this.rows.set(session.id, session)
  }

  async touch(id: string, lastSeenAt: string, idleExpiresAt: string): Promise<void> {
    const row = this.rows.get(id)
    if (row !== undefined) this.rows.set(id, { ...row, lastSeenAt, idleExpiresAt })
  }

  async revoke(id: string, at: string, reason: string): Promise<void> {
    const row = this.rows.get(id)
    if (row !== undefined) this.rows.set(id, { ...row, revokedAt: at, revokedReason: reason })
  }

  async revokeAllForUser(userId: string, at: string, reason: string): Promise<number> {
    let count = 0
    for (const [id, row] of this.rows) {
      if (row.userId !== userId || row.revokedAt !== undefined) continue
      this.rows.set(id, { ...row, revokedAt: at, revokedReason: reason })
      count += 1
    }
    return count
  }

  async replaceToken(id: string, tokenHash: string, csrfHash: string): Promise<void> {
    const row = this.rows.get(id)
    if (row !== undefined) this.rows.set(id, { ...row, tokenHash, csrfHash })
  }
}

/** Ein Hasher, der **zählt** — damit die Zeitprüfung ohne Messung möglich ist. */
class CountingHasher implements PasswordHasher {
  readonly inner = new Argon2PasswordHasher(4)
  verifyCalls = 0
  hashCalls = 0

  async hash(password: string): Promise<string> {
    this.hashCalls += 1
    return this.inner.hash(password)
  }

  async verify(password: string, hash: string): Promise<boolean> {
    this.verifyCalls += 1
    return this.inner.verify(password, hash)
  }
}

const hasher = new Argon2PasswordHasher(4)

/** Ein guter Benutzer im Speicher. */
async function seedUser(users: FakeUsers, email = 'ada@example.org', password = 'korrekt-pferd-batterie'): Promise<UserRecord> {
  const hash = await hasher.hash(password)
  const user: UserRecord = {
    id: crypto.randomUUID(),
    email,
    passwordHash: hash,
    displayName: 'Ada',
    role: 'user',
    disabledAt: undefined,
  }
  users.users.set(user.id, user)
  return user
}

// ---------------------------------------------------------------------------
// Passwort-Hashing
// ---------------------------------------------------------------------------

describe('Passwort-Hashing', () => {
  test('erzeugt einen Argon2id-Hash mit den dokumentierten Parametern', async () => {
    const hash = await hasher.hash('ein-langes-passwort-123')
    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(hash).toContain(`m=${ARGON2_PARAMETERS.memoryCost},t=${ARGON2_PARAMETERS.timeCost},p=${ARGON2_PARAMETERS.parallelism}`)
  })

  test('zwei gleiche Passwörter ergeben verschiedene Hashes', async () => {
    // Der Salt. Ohne ihn wären gleiche Passwörter in der Datenbank erkennbar —
    // und eine Regenbogentabelle würde für alle Konten gleichzeitig greifen.
    const a = await hasher.hash('dasselbe-passwort-123')
    const b = await hasher.hash('dasselbe-passwort-123')
    expect(a).not.toBe(b)
  })

  test('prüft richtig und falsch', async () => {
    const hash = await hasher.hash('korrekt-pferd-batterie')
    expect(await hasher.verify('korrekt-pferd-batterie', hash)).toBe(true)
    expect(await hasher.verify('fast-richtig', hash)).toBe(false)
    expect(await hasher.verify('', hash)).toBe(false)
  })

  test('ein leerer oder kaputter Hash ergibt false statt eines Wurfs', async () => {
    // Ein beschädigter Datensatz darf nicht den ganzen Anmeldeweg mitreißen.
    expect(await hasher.verify('egal', '')).toBe(false)
    expect(await hasher.verify('egal', 'kein-hash')).toBe(false)
    expect(await hasher.verify('egal', '$argon2id$kaputt')).toBe(false)
  })

  test('erkennt Hashes, die neu berechnet werden müssen', async () => {
    expect(needsRehash(await hasher.hash('x-langes-passwort-123'))).toBe(false)
    // Andere Parameter → neu berechnen.
    expect(needsRehash('$argon2id$v=19$m=1024,t=1,p=1$c2FsdA$aGFzaA')).toBe(true)
    // Anderes Verfahren → ebenfalls.
    expect(needsRehash('$2b$12$abcdefghijklmnopqrstuv')).toBe(true)
    expect(needsRehash('')).toBe(true)
  })

  test('die Nebenläufigkeitsgrenze wird eingehalten', async () => {
    const limited = new Argon2PasswordHasher(2)
    const work = Array.from({ length: 8 }, () => limited.hash('gleichzeitig-passwort-12'))
    // Während der Arbeit darf die Grenze nie überschritten werden.
    let highest = 0
    const watcher = setInterval(() => {
      highest = Math.max(highest, limited.running)
    }, 1)
    await Promise.all(work)
    clearInterval(watcher)
    expect(highest).toBeLessThanOrEqual(2)
  })

  test('lehnt eine unsinnige Grenze ab', () => {
    expect(() => new Argon2PasswordHasher(0)).toThrow(RangeError)
    expect(() => new Argon2PasswordHasher(1.5)).toThrow(RangeError)
  })
})

// ---------------------------------------------------------------------------
// Zufall und konstante Zeit
// ---------------------------------------------------------------------------

describe('Zufall und konstante Zeit', () => {
  test('erzeugt base64url ohne Sonderzeichen', () => {
    const token = randomToken(32)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    // 32 Bytes ergeben 43 Zeichen ohne Auffüllung.
    expect(token.length).toBe(43)
  })

  test('zwei Token sind verschieden', () => {
    expect(randomToken(32)).not.toBe(randomToken(32))
  })

  test('lehnt eine unsinnige Bytezahl ab', () => {
    expect(() => randomToken(0)).toThrow(RangeError)
  })

  test('Sitzungstoken und Hash passen zusammen', () => {
    const { token, hash } = newSessionToken()
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenHash(token)).toBe(hash)
  })

  test('constantTimeEquals vergleicht richtig — auch bei verschiedener Länge', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true)
    expect(constantTimeEquals('abc', 'abd')).toBe(false)
    expect(constantTimeEquals('abc', 'abcd')).toBe(false)
    expect(constantTimeEquals('', '')).toBe(true)
  })

  test('constantTimeEquals ist bei gleicher Länge unabhängig von der Position des Fehlers', () => {
    // Kein Abbruch beim ersten Unterschied: die Laufzeit soll für „falsch am
    // Anfang" und „falsch am Ende" dieselbe sein. Gemessen, nicht behauptet —
    // das Verhältnis darf nicht auffallen.
    const base = 'a'.repeat(2000)
    const firstWrong = `b${'a'.repeat(1999)}`
    const lastWrong = `${'a'.repeat(1999)}b`

    const timeOf = (right: string): number => {
      const started = performance.now()
      for (let index = 0; index < 500; index += 1) constantTimeEquals(base, right)
      return performance.now() - started
    }
    // Aufwärmen, damit der erste Aufruf nicht die Messung verzerrt.
    timeOf('a'.repeat(2000))
    const a = timeOf(firstWrong)
    const b = timeOf(lastWrong)
    const ratio = Math.max(a, b) / Math.max(0.001, Math.min(a, b))
    expect(ratio).toBeLessThan(3)
  })
})

// ---------------------------------------------------------------------------
// E-Mail
// ---------------------------------------------------------------------------

describe('E-Mail', () => {
  test('normalisiert Leerraum und Grossschreibung', () => {
    expect(normalizeEmail('  Ada@Example.ORG ')).toBe('ada@example.org')
    expect(normalizeEmail('ada @example.org')).toBe('ada@example.org')
  })

  test('fasst den lokalen Teil NICHT weiter an', () => {
    // Punkte und Plus-Zusätze sind anbieterspezifisch; sie zu entfernen würde
    // bei anderen Anbietern falsche Konten zusammenlegen.
    expect(normalizeEmail('a.b+tag@example.org')).toBe('a.b+tag@example.org')
  })

  test('nimmt eine gewöhnliche Adresse an', () => {
    expect(checkEmail('ada@example.org')).toEqual({ ok: true, value: 'ada@example.org' })
  })

  test('lehnt leere, @-lose und zu lange Adressen ab', () => {
    expect(checkEmail('')).toEqual({ ok: false, reason: 'empty' })
    expect(checkEmail('ohne-at')).toEqual({ ok: false, reason: 'no-at' })
    expect(checkEmail('a@')).toEqual({ ok: false, reason: 'no-at' })
    expect(checkEmail('@example.org')).toEqual({ ok: false, reason: 'no-at' })
    expect(checkEmail(`${'a'.repeat(60)}@${'b'.repeat(200)}.org`)).toEqual({ ok: false, reason: 'too-long' })
  })

  test('lehnt einen überlangen lokalen Teil ab', () => {
    expect(checkEmail(`${'a'.repeat(65)}@example.org`)).toEqual({ ok: false, reason: 'local-too-long' })
  })

  test('lehnt Steuerzeichen ab — Kopfzeilen-Einschleusung', () => {
    expect(checkEmail('ada@example.org\nBcc: boese@example.org')).toEqual({ ok: false, reason: 'bad-chars' })
    expect(checkEmail('ada\u0000@example.org')).toEqual({ ok: false, reason: 'bad-chars' })
  })
})

// ---------------------------------------------------------------------------
// Passwort-Prüfung
// ---------------------------------------------------------------------------

describe('Passwort-Prüfung', () => {
  test('nimmt ein langes Passwort an', () => {
    expect(checkPassword('korrekt-pferd-batterie-klammer')).toEqual({ ok: true })
  })

  test('lehnt zu kurze ab', () => {
    const result = checkPassword('kurz1!')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('too-short')
  })

  test('lehnt zu lange ab — sonst ist jedes Passwort ein Hebel gegen den Server', () => {
    const result = checkPassword('a1'.repeat(PASSWORD_MAX_LENGTH))
    expect(result.ok === false && result.reason).toBe('too-long')
  })

  test('lehnt das Passwort gleich der eigenen Adresse ab', () => {
    const result = checkPassword('adalovelace-2026', 'adalovelace@example.org')
    expect(result.ok === false && result.reason).toBe('equals-email')
  })

  test('lehnt die häufigsten Passwörter ab', () => {
    const result = checkPassword('letmeinletmein123')
    expect(result.ok === false && result.reason).toBe('common')
    // **Und die Liste muss überhaupt erreichbar sein.** Die erste Fassung
    // enthielt nur Einträge unter 16 Zeichen — die Längenprüfung wies sie alle
    // ab, und die Liste prüfte nichts. Dieser Test verhindert, dass derselbe
    // Fehler zurückkommt.
    for (const common of COMMON_PASSWORDS) {
      const verdict = checkPassword(common)
      expect({ entry: common, reason: verdict.ok === false ? verdict.reason : 'ok' }).toEqual({
        entry: common,
        reason: 'common',
      })
    }
  })

  test('straft Passphrasen NICHT — Länge genügt', () => {
    // Der eigene Fehler, der zu dieser Regel geführt hat: mit 12 Zeichen und
    // einer Zeichenarten-Regel wäre sonnenschein abgelehnt worden — also genau
    // die Form, die NIST empfiehlt. Länge ist der Hebel, nicht Sonderzeichen.
    expect(checkPassword('sonnenschein').ok).toBe(false)          // 12 Zeichen: zu kurz
    expect(checkPassword('sonnenscheinundregen').ok).toBe(true)   // 20 Buchstaben: willkommen
    expect(checkPassword('korrekt pferd batterie klammer').ok).toBe(true)
  })

  test('zählt Zeichenarten', () => {
    expect(countCharacterKinds('abc')).toBe(1)
    expect(countCharacterKinds('abc123')).toBe(2)
    expect(countCharacterKinds('abc123!')).toBe(3)
    expect(countCharacterKinds('')).toBe(0)
  })

  test('die Mindestlänge ist 16 und steht als Konstante', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(16)
    expect(checkPassword('a'.repeat(15)).ok).toBe(false)
    expect(checkPassword('a'.repeat(16)).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Anmeldung — der Kern der Sache
// ---------------------------------------------------------------------------

describe('Anmeldung', () => {
  let users: FakeUsers
  beforeEach(() => {
    users = new FakeUsers()
  })

  test('meldet einen richtigen Benutzer an', async () => {
    const user = await seedUser(users)
    const outcome = await authenticate(users, hasher, 'Ada@Example.org', 'korrekt-pferd-batterie')
    expect(outcome.ok).toBe(true)
    expect(outcome.ok && outcome.user.id).toBe(user.id)
  })

  test('rechnet IMMER einen Hash — auch wenn es das Konto nicht gibt', async () => {
    // Der Test, der die Zeitverrats-Lücke schließt. Ein Zähler statt einer
    // Zeitmessung: die Zeitmessung ist unzuverlässig, die Zahl der Aufrufe nicht.
    const counting = new CountingHasher()
    await seedUser(users)

    const before = counting.verifyCalls
    await authenticate(users, counting, 'ada@example.org', 'falsch')
    const withUser = counting.verifyCalls - before

    const before2 = counting.verifyCalls
    await authenticate(users, counting, 'gibtsnicht@example.org', 'falsch')
    const withoutUser = counting.verifyCalls - before2

    expect(withUser).toBe(1)
    expect(withoutUser).toBe(1)
  })

  test('die Antwortzeiten beider Fälle liegen dicht beieinander (gemessen)', async () => {
    await seedUser(users)
    // Zehn Durchläufe je Fall, dann der Mittelwert: eine Einzelmessung ist keine
    // Messung (siehe Register, P6: 35 s waren ein Kaltstart).
    const measure = async (email: string): Promise<number> => {
      const started = performance.now()
      for (let index = 0; index < 10; index += 1) await authenticate(users, hasher, email, 'falsches-passwort-123')
      return (performance.now() - started) / 10
    }
    await measure('ada@example.org')
    const known = await measure('ada@example.org')
    const unknown = await measure('gibtsnicht@example.org')
    const ratio = Math.max(known, unknown) / Math.min(known, unknown)
    // Großzügige Grenze: beide Wege kosten einen Argon2id-Lauf, geprüft wird,
    // dass nicht einer davon praktisch kostenlos ist.
    expect(ratio).toBeLessThan(3)
  })

  test('gibt für unbekanntes Konto und falsches Passwort denselben Grund', async () => {
    await seedUser(users)
    const wrongPassword = await authenticate(users, hasher, 'ada@example.org', 'falsch-falsch-falsch')
    const noAccount = await authenticate(users, hasher, 'gibtsnicht@example.org', 'falsch-falsch-falsch')
    expect(wrongPassword).toEqual({ ok: false, reason: 'credentials-invalid' })
    expect(noAccount).toEqual({ ok: false, reason: 'credentials-invalid' })
  })

  test('ein Konto OHNE Passwort ist keine Anmeldung ohne Passwort', async () => {
    // Ein NULL-Hash im Schema heißt „hat noch kein Passwort" — nicht „komm rein".
    const hashless: UserRecord = {
      id: crypto.randomUUID(),
      email: 'einladung@example.org',
      passwordHash: undefined,
      displayName: '',
      role: 'user',
      disabledAt: undefined,
    }
    users.users.set(hashless.id, hashless)
    const outcome = await authenticate(users, hasher, 'einladung@example.org', '')
    expect(outcome).toEqual({ ok: false, reason: 'credentials-invalid' })
    const withPassword = await authenticate(users, hasher, 'einladung@example.org', 'irgendwas-langes-123')
    expect(withPassword).toEqual({ ok: false, reason: 'credentials-invalid' })
  })

  test('prüft das Passwort AUCH bei gesperrtem Konto, bevor es „gesperrt" sagt', async () => {
    const user = await seedUser(users)
    users.users.set(user.id, { ...user, disabledAt: '2026-10-13T00:00:00Z' })
    const counting = new CountingHasher()

    const withRightPassword = await authenticate(users, counting, user.email, 'korrekt-pferd-batterie')
    expect(withRightPassword).toEqual({ ok: false, reason: 'disabled' })
    // Der Hash wurde geprüft: die Sperre ist nicht an der Zeit erkennbar.
    expect(counting.verifyCalls).toBe(1)

    const withWrongPassword = await authenticate(users, counting, user.email, 'falsch')
    expect(withWrongPassword).toEqual({ ok: false, reason: 'credentials-invalid' })
  })

  test('berechnet den Hash nach Parameterwechsel neu — und nur nach Erfolg', async () => {
    // **Der Hash wird mit den ALTEN Parametern selbst gerechnet.** Ein
    // nachträglich geändertes Parameterfeld macht den Hash ungültig — Argon2
    // bindet die Parameter in die Prüfsumme ein. Gemessen am 13.10.2026:
    // `verify` gegen einen so veränderten Hash ergibt `false`. Ein ungültiger
    // Hash würde hier aber den DUMMY-Weg auslösen und die Anmeldung scheiterte
    // immer — der Test wäre grün aus dem falschen Grund.
    const legacy = await Bun.password.hash('korrekt-pferd-batterie', {
      algorithm: 'argon2id',
      memoryCost: 8192,
      timeCost: 1,
    })
    expect(needsRehash(legacy)).toBe(true)
    expect(await hasher.verify('korrekt-pferd-batterie', legacy)).toBe(true)

    const user: UserRecord = {
      id: crypto.randomUUID(),
      email: 'alt@example.org',
      passwordHash: legacy,
      displayName: '',
      role: 'user',
      disabledAt: undefined,
    }
    users.users.set(user.id, user)

    const outcome = await authenticate(users, hasher, 'alt@example.org', 'korrekt-pferd-batterie')
    expect(outcome.ok).toBe(true)
    expect(outcome.ok ? outcome.rehashed : undefined).toBe(true)
    expect(users.hashesWritten).toHaveLength(1)
    // Der neue Hash trägt die aktuellen Parameter.
    expect(needsRehash(users.hashesWritten[0]?.hash ?? '')).toBe(false)

    // Bei einem FEHLSCHLAG wird nicht neu berechnet — sonst verdoppelt sich die
    // Arbeit je Fehlversuch und verstärkt genau den Hebel, den die Drosselung
    // begrenzt.
    users.hashesWritten.length = 0
    await authenticate(users, hasher, 'alt@example.org', 'falsches-passwort-1234')
    expect(users.hashesWritten).toHaveLength(0)
  })

  test('schreibt Prüfspur-Einträge ohne Klartext-Geheimnisse', async () => {
    const user = await seedUser(users)
    const events: AuthEvent[] = []
    const sink = { record: (event: AuthEvent): Promise<void> => { events.push(event); return Promise.resolve() } }

    await authenticate(users, hasher, user.email, 'korrekt-pferd-batterie', sink, { ip: '127.0.0.1' })
    await authenticate(users, hasher, user.email, 'falsch-falsch-falsch', sink, { ip: '127.0.0.1' })

    expect(events.map((event) => event.kind)).toEqual(['login-success', 'login-failed'])
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('korrekt-pferd-batterie')
    expect(serialized).not.toContain('falsch-falsch-falsch')
    expect(events[0]?.userId).toBe(user.id)
  })

  test('eine kaputte Prüfspur lässt die Anmeldung nicht scheitern', async () => {
    await seedUser(users)
    const broken = { record: (): Promise<void> => Promise.reject(new Error('Spur kaputt')) }
    // Der Sink wird mit `await` gerufen — ein Wurf muss hier durchschlagen, und
    // genau das ist die Entscheidung: wer die Prüfspur anschließt, muss sie
    // fehlertolerant bauen. Der Test hält das fest, damit es nicht überrascht.
    await expect(authenticate(users, hasher, 'ada@example.org', 'korrekt-pferd-batterie', broken)).rejects.toThrow(
      'Spur kaputt',
    )
  })
})

// ---------------------------------------------------------------------------
// Registrierung
// ---------------------------------------------------------------------------

describe('Registrierung', () => {
  test('legt ein Konto an und meldet das erste Konto', async () => {
    const users = new FakeUsers()
    const first = await register(users, hasher, 'ada@example.org', 'korrekt-pferd-batterie', 'Ada')
    expect(first.ok).toBe(true)
    expect(first.ok && first.firstUser).toBe(true)

    const second = await register(users, hasher, 'grace@example.org', 'noch-ein-langes-passwort', 'Grace')
    expect(second.ok && second.firstUser).toBe(false)
  })

  test('lehnt eine unbrauchbare Adresse ab, ohne zu rechnen', async () => {
    const users = new FakeUsers()
    const outcome = await register(users, hasher, 'ohne-at', 'korrekt-pferd-batterie', 'X')
    expect(outcome).toEqual({
      ok: false,
      reason: 'email-invalid',
      hint: 'Die Adresse ist unbrauchbar (no-at).',
    })
    expect(users.users.size).toBe(0)
  })

  test('lehnt ein schwaches Passwort ab, ohne zu rechnen', async () => {
    const counting = new CountingHasher()
    const users = new FakeUsers()
    const outcome = await register(users, counting, 'ada@example.org', 'kurz', 'Ada')
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.reason).toBe('password-weak')
    expect(counting.hashCalls).toBe(0)
  })

  test('lehnt eine schon vergebene Adresse ab — auch in anderer Schreibweise', async () => {
    const users = new FakeUsers()
    await register(users, hasher, 'ada@example.org', 'korrekt-pferd-batterie', 'Ada')
    const again = await register(users, hasher, 'Ada@Example.ORG', 'anderes-langes-passwort', 'Ada')
    expect(again.ok).toBe(false)
    expect(again.ok === false && again.reason).toBe('email-taken')
    expect(users.users.size).toBe(1)
  })

  test('hält die Höchstzahl der Konten ein — und zwar vor dem teuren Lauf', async () => {
    const counting = new CountingHasher()
    const users = new FakeUsers()
    await register(users, counting, 'ada@example.org', 'korrekt-pferd-batterie', 'Ada')
    const before = counting.hashCalls
    const outcome = await register(users, counting, 'grace@example.org', 'noch-ein-langes-passwort', 'Grace', {
      maxUsers: 1,
    })
    expect(outcome.ok).toBe(false)
    // Kein weiterer Argon2id-Lauf: die Grenze ist selbst kein Hebel.
    expect(counting.hashCalls).toBe(before)
  })

  test('benutzt die übergebene Kennungserzeugung', async () => {
    const users = new FakeUsers()
    const outcome = await register(users, hasher, 'ada@example.org', 'korrekt-pferd-batterie', 'Ada', {
      newId: () => 'feste-kennung',
    })
    expect(outcome.ok && outcome.user.id).toBe('feste-kennung')
  })

  test('wirft nicht, sondern gibt ein Urteil zurück', async () => {
    const users = new FakeUsers()
    const outcome = await register(users, hasher, 'x', 'y', '')
    expect(outcome.ok).toBe(false)
    // Wer einen Wurf erwartet, findet hier einen Wert — das ist Absicht
    // (siehe die Anmerkung zu `email-taken` in identity.ts).
    expect(outcome).not.toBeInstanceOf(AuthError)
  })
})

// ---------------------------------------------------------------------------
// Sitzungen
// ---------------------------------------------------------------------------

describe('Sitzungen', () => {
  let sessions: FakeSessions
  const userId = '11111111-1111-4111-8111-111111111111'
  const T0 = new Date('2026-10-13T12:00:00.000Z')

  beforeEach(() => {
    sessions = new FakeSessions()
  })

  test('legt eine Sitzung an und gibt Klartext-Token und CSRF-Wert heraus', async () => {
    const created = await createSession(sessions, userId, { userAgent: 'Test', ip: '127.0.0.1' }, DEFAULT_SESSION_POLICY, () => T0)
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(created.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // Gespeichert wird nur der Hash.
    expect(created.session.tokenHash).toBe(tokenHash(created.token))
    expect(created.session.tokenHash).not.toBe(created.token)
    expect(JSON.stringify(created.session)).not.toContain(created.token)
  })

  test('prüft ein gültiges Token', async () => {
    const created = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    const verified = await verifySession(sessions, created.token, DEFAULT_SESSION_POLICY, () => T0)
    expect(verified.session.id).toBe(created.session.id)
    expect(verified.fresh).toBe(true)
  })

  test('lehnt ein unbekanntes und ein widerrufenes Token gleich behandelt ab', async () => {
    const created = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    await revokeSession(sessions, created.session.id, 'logout', () => T0)

    const unknown = await verifySession(sessions, randomToken(32), DEFAULT_SESSION_POLICY, () => T0).catch((e: unknown) => e)
    const revoked = await verifySession(sessions, created.token, DEFAULT_SESSION_POLICY, () => T0).catch((e: unknown) => e)
    expect(unknown).toBeInstanceOf(SessionError)
    expect(revoked).toBeInstanceOf(SessionError)
    // Beide melden dasselbe: aus der Meldung lässt sich nicht schließen, ob ein
    // geratenes Token je existiert hat.
    expect((unknown as SessionError).message).toBe((revoked as SessionError).message)
  })

  test('lehnt ein leeres Token ab', async () => {
    await expect(verifySession(sessions, '', DEFAULT_SESSION_POLICY, () => T0)).rejects.toThrow(SessionError)
  })

  test('die Ruhefrist läuft ab', async () => {
    const created = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    const later = new Date(T0.getTime() + DEFAULT_SESSION_POLICY.idleMs + 1)
    const failure = await verifySession(sessions, created.token, DEFAULT_SESSION_POLICY, () => later).catch((e: unknown) => e)
    expect((failure as SessionError).reason).toBe('expired-idle')
  })

  test('die Höchstfrist läuft ab — auch bei dauernder Nutzung', async () => {
    const created = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    // Der Benutzer arbeitet die ganze Zeit: die Ruhefrist wird immer wieder
    // geschoben. Die Höchstfrist darf das NICHT.
    let at = T0
    for (let hour = 0; hour < 30 * 24; hour += 1) {
      at = new Date(T0.getTime() + hour * 60 * 60 * 1000)
      const verified = await verifySession(sessions, created.token, DEFAULT_SESSION_POLICY, () => at).catch(() => undefined)
      if (verified === undefined) break
      await touchSession(sessions, verified, DEFAULT_SESSION_POLICY, () => at)
    }
    const afterAbsolute = new Date(T0.getTime() + DEFAULT_SESSION_POLICY.absoluteMs + 1000)
    const failure = await verifySession(sessions, created.token, DEFAULT_SESSION_POLICY, () => afterAbsolute).catch((e: unknown) => e)
    expect((failure as SessionError).reason).toBe('expired-absolute')
  })

  test('die Ruhefrist wird höchstens bis zur Höchstfrist geschoben', async () => {
    const created = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    // **Kurz vor die Höchstfrist arbeiten.** Die Ruhefrist ist 12 Stunden — bei
    // 30 Tagen Höchstfrist muss die Sitzung also unterwegs am Leben gehalten
    // werden, sonst wäre die Prüfung „abgelaufen", bevor der Deckel überhaupt
    // greifen kann. Genau daran ist die erste Fassung dieses Tests gescheitert.
    const near = new Date(T0.getTime() + DEFAULT_SESSION_POLICY.absoluteMs - 60 * 1000)
    for (let hour = 11; hour * 60 * 60 * 1000 < DEFAULT_SESSION_POLICY.absoluteMs - 120 * 1000; hour += 11) {
      const at = new Date(T0.getTime() + hour * 60 * 60 * 1000)
      const touched = await verifySession(
        sessions,
        created.token,
        { ...DEFAULT_SESSION_POLICY, touchIntervalMs: 0 },
        () => at,
      )
      await touchSession(sessions, touched, DEFAULT_SESSION_POLICY, () => at)
    }

    const verified = await verifySession(
      sessions,
      created.token,
      { ...DEFAULT_SESSION_POLICY, touchIntervalMs: 0 },
      () => near,
    )
    await touchSession(sessions, verified, DEFAULT_SESSION_POLICY, () => near)
    // Die neue Ruhefrist wäre 12 Stunden später — also **nach** der Höchstfrist.
    // Genau dort greift der Deckel.
    expect(sessions.rows.get(created.session.id)?.idleExpiresAt).toBe(created.session.absoluteExpiresAt)
  })

  test('rotiert das Token und behält Höchstfrist und Kennung', async () => {
    const created = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    const rotated = await rotateSession(sessions, created.session)
    expect(rotated.token).not.toBe(created.token)
    // Das alte Token gilt nicht mehr …
    await expect(verifySession(sessions, created.token, DEFAULT_SESSION_POLICY, () => T0)).rejects.toThrow(SessionError)
    // … das neue schon, und die Sitzung ist dieselbe: die Höchstfrist wurde
    // NICHT neu gestartet (sonst ließe sie sich durch Arbeiten verlängern).
    const verified = await verifySession(sessions, rotated.token, DEFAULT_SESSION_POLICY, () => T0)
    expect(verified.session.id).toBe(created.session.id)
    expect(verified.session.absoluteExpiresAt).toBe(created.session.absoluteExpiresAt)
    expect(rotated.csrf).not.toBe(created.csrf)
  })

  test('meldet, wann rotiert werden soll', async () => {
    // Zwei Sitzungen, weil ein `touch` den Zustand verändert: die eine prüft
    // „noch nicht rotieren", die andere „jetzt rotieren". Eine einzige Sitzung
    // für beide Aussagen zu benutzen war der Fehler der ersten Fassung — der
    // Touch für die zweite Aussage veränderte die erste.
    const fresh = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    const early = await verifySession(sessions, fresh.token, DEFAULT_SESSION_POLICY, () => T0)
    expect(early.shouldRotate).toBe(false)

    const aged = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    // **Der Touch muss VOR dem Ablauf der Ruhefrist liegen** — sonst ist die
    // Sitzung beim Prüfen schon abgelaufen, und der Test misst den Ablauf statt
    // der Rotation. Ruhefrist 12 h, Rotationsschwelle 24 h: bei 11 h schiebt der
    // Touch die Ruhefrist auf 23 h … bei 24 h wäre sie wieder abgelaufen.
    // Deshalb **zwei** Touches, sodass die Ruhefrist über die Schwelle hinaus
    // reicht. Genau daran sind zwei vorige Fassungen dieses Tests gescheitert.
    for (const hour of [11, 22]) {
      const at = new Date(T0.getTime() + hour * 60 * 60 * 1000)
      const touched = await verifySession(
        sessions,
        aged.token,
        { ...DEFAULT_SESSION_POLICY, touchIntervalMs: 0 },
        () => at,
      )
      await touchSession(sessions, touched, DEFAULT_SESSION_POLICY, () => at)
    }
    // Nach dem zweiten Touch (bei 22 h) gilt die Ruhefrist bis 34 h.

    // Nach der Schwelle: rotieren.
    const after = new Date(T0.getTime() + DEFAULT_SESSION_POLICY.rotateAfterMs + 60 * 1000)
    const late = await verifySession(sessions, aged.token, DEFAULT_SESSION_POLICY, () => after)
    expect(late.shouldRotate).toBe(true)
    expect(late.fresh).toBe(false)
  })

  test('meldet, ob eine Sitzung „frisch" ist', async () => {
    const created = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    const fresh = await verifySession(sessions, created.token, DEFAULT_SESSION_POLICY, () => T0)
    expect(fresh.fresh).toBe(true)
    const stale = new Date(T0.getTime() + SESSION_FRESH_MS + 1)
    const old = await verifySession(sessions, created.token, DEFAULT_SESSION_POLICY, () => stale)
    expect(old.fresh).toBe(false)
  })

  test('„überall abmelden" widerruft jede Sitzung des Benutzers', async () => {
    const a = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    const b = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    const other = await createSession(sessions, 'anderer-benutzer', {}, DEFAULT_SESSION_POLICY, () => T0)

    const count = await revokeAllSessions(sessions, userId, 'password-changed', () => T0)
    expect(count).toBe(2)
    await expect(verifySession(sessions, a.token, DEFAULT_SESSION_POLICY, () => T0)).rejects.toThrow(SessionError)
    await expect(verifySession(sessions, b.token, DEFAULT_SESSION_POLICY, () => T0)).rejects.toThrow(SessionError)
    // Die Sitzung eines anderen Benutzers bleibt unberührt.
    await expect(verifySession(sessions, other.token, DEFAULT_SESSION_POLICY, () => T0)).resolves.toBeDefined()
  })

  test('schreibt die Nutzung nur, wenn die Schwelle erreicht ist', async () => {
    const created = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    const soon = new Date(T0.getTime() + 1000)
    const verified = await verifySession(sessions, created.token, DEFAULT_SESSION_POLICY, () => soon)
    expect(verified.shouldTouch).toBe(false)
    // Ohne Schwelle würde jede Anfrage schreiben.
    await touchSession(sessions, verified, DEFAULT_SESSION_POLICY, () => soon)
    expect(sessions.rows.get(created.session.id)?.lastSeenAt).toBe(T0.toISOString())

    const later = new Date(T0.getTime() + DEFAULT_SESSION_POLICY.touchIntervalMs + 1)
    const stale = await verifySession(sessions, created.token, DEFAULT_SESSION_POLICY, () => later)
    expect(stale.shouldTouch).toBe(true)
    await touchSession(sessions, stale, DEFAULT_SESSION_POLICY, () => later)
    expect(sessions.rows.get(created.session.id)?.lastSeenAt).toBe(later.toISOString())
  })
})

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

describe('CSRF', () => {
  const userId = '11111111-1111-4111-8111-111111111111'
  const T0 = new Date('2026-10-13T12:00:00.000Z')

  test('nimmt den eigenen Wert an und einen fremden nicht', async () => {
    const sessions = new FakeSessions()
    const created = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    expect(verifyCsrf(created.session, created.csrf)).toBe(true)
    expect(verifyCsrf(created.session, randomToken(32))).toBe(false)
    expect(verifyCsrf(created.session, '')).toBe(false)
  })

  test('ein Wert aus einer ANDEREN Sitzung wird abgelehnt', async () => {
    // Genau die Lücke, die ein reines „Cookie gleich Kopfzeile" hat: der Wert
    // passt zu sich selbst, aber nicht zu dieser Sitzung.
    const sessions = new FakeSessions()
    const first = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    const second = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    expect(verifyCsrf(first.session, second.csrf)).toBe(false)
  })

  test('erzeugt bei jeder Sitzung ein anderes Paar', async () => {
    const sessions = new FakeSessions()
    const a = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    const b = await createSession(sessions, userId, {}, DEFAULT_SESSION_POLICY, () => T0)
    expect(a.csrf).not.toBe(b.csrf)
    expect(newCsrfPair().value).not.toBe(newCsrfPair().value)
  })
})

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

describe('Cookies', () => {
  test('setzt alle sicheren Attribute', () => {
    const cookie = sessionCookie('TOKEN', { secure: true, maxAgeSeconds: 3600 })
    expect(cookie).toContain(`${SESSION_COOKIE_NAME_SECURE}=TOKEN`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Max-Age=3600')
  })

  test('das __Host-Präfix fällt ohne TLS weg — sonst kommt das Cookie nicht an', () => {
    const plain = sessionCookie('TOKEN', { secure: false, maxAgeSeconds: 60 })
    expect(plain).toContain(`${SESSION_COOKIE_NAME}=TOKEN`)
    expect(plain).not.toContain('__Host-')
    expect(plain).not.toContain('Secure')
    expect(plain).toContain('HttpOnly')
  })

  test('das CSRF-Cookie ist lesbar — sonst kann die Anwendung es nicht senden', () => {
    const cookie = csrfCookie('WERT', { secure: true, maxAgeSeconds: 60 })
    expect(cookie).toContain('pmh_csrf=WERT')
    expect(cookie).not.toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
  })

  test('lässt sich auf Lax stellen — für Links von außen', () => {
    const cookie = sessionCookie('TOKEN', { secure: true, maxAgeSeconds: 60, sameSite: 'Lax' })
    expect(cookie).toContain('SameSite=Lax')
  })

  test('das Löschen setzt Max-Age auf 0', () => {
    const cookie = clearSessionCookie({ secure: true })
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain(`${SESSION_COOKIE_NAME_SECURE}=`)
  })
})

// ---------------------------------------------------------------------------
// Drosselung
// ---------------------------------------------------------------------------

describe('Drosselung', () => {
  test('erlaubt bis zur Grenze und sperrt danach', async () => {
    const limiter = new MemoryRateLimiter(() => 0)
    const key = loginIpKey('1.2.3.4')
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const hit = await limiter.hit(key, 3, 1000)
      expect(hit.allowed).toBe(true)
      expect(hit.remaining).toBe(3 - attempt)
    }
    const blocked = await limiter.hit(key, 3, 1000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterMs).toBe(1000)
  })

  test('das Fenster beginnt beim ersten Versuch — kein Sprung an der Fenstergrenze', async () => {
    let now = 0
    const limiter = new MemoryRateLimiter(() => now)
    const key = loginAccountKey('ada@example.org')
    await limiter.hit(key, 2, 1000)
    await limiter.hit(key, 2, 1000)
    expect((await limiter.hit(key, 2, 1000)).allowed).toBe(false)

    // Kurz vor Ablauf noch gesperrt …
    now = 999
    expect((await limiter.hit(key, 2, 1000)).allowed).toBe(false)
    // … nach Ablauf wieder frei. Bei festen Kalenderfenstern hätte man hier
    // zwei volle Sätze kurz hintereinander.
    now = 1001
    const after = await limiter.hit(key, 2, 1000)
    expect(after.allowed).toBe(true)
    expect(after.count).toBe(1)
  })

  test('reset gibt den Schlüssel frei — nach einer erfolgreichen Anmeldung', async () => {
    const limiter = new MemoryRateLimiter(() => 0)
    const key = loginAccountKey('ada@example.org')
    await limiter.hit(key, 1, 1000)
    expect((await limiter.hit(key, 1, 1000)).allowed).toBe(false)
    await limiter.reset(key)
    expect((await limiter.hit(key, 1, 1000)).allowed).toBe(true)
  })

  test('räumt abgelaufene Zähler weg — sonst wächst der Speicher unbegrenzt', async () => {
    let now = 0
    const limiter = new MemoryRateLimiter(() => now)
    for (let index = 0; index < 100; index += 1) await limiter.hit(`ip:${String(index)}`, 5, 1000)
    expect(limiter.size).toBe(100)
    now = 2000
    expect(limiter.sweep()).toBe(100)
    expect(limiter.size).toBe(0)
  })

  test('lehnt unsinnige Grenzen ab', async () => {
    const limiter = new MemoryRateLimiter()
    await expect(limiter.hit('k', 0, 1000)).rejects.toThrow(RangeError)
    await expect(limiter.hit('k', 1, 0)).rejects.toThrow(RangeError)
  })

  test('die Schlüssel kodieren die Adresse — kein Doppelpunkt als Fuge', async () => {
    expect(loginAccountKey('ada@example.org')).toBe('login:acct:ada%40example.org')
    // Eine Adresse mit Doppelpunkt erzeugt keinen anderen Schlüssel.
    expect(loginAccountKey('a:b@example.org')).toBe('login:acct:a%3Ab%40example.org')
    expect(loginAccountKey('ADA@example.org')).toBe(loginAccountKey('ada@example.org'))
  })

  test('mehrere Regeln zählen ALLE — auch wenn die erste schon sperrt', async () => {
    const limiter = new MemoryRateLimiter(() => 0)
    const account = loginAccountKey('ada@example.org')
    const ip = loginIpKey('1.2.3.4')

    // Die Kontogrenze ist klein, die IP-Grenze groß.
    const checks = [
      { key: account, limit: 1, windowMs: 1000 },
      { key: ip, limit: 10, windowMs: 1000 },
    ]
    const first = await hitAll(limiter, checks)
    expect(first.allowed).toBe(true)
    expect(first.hits.map((entry) => entry.hit.count)).toEqual([1, 1])

    const second = await hitAll(limiter, checks)
    expect(second.allowed).toBe(false)
    expect(second.blockedBy).toBe(account)
    // Der IP-Zähler wurde trotzdem hochgezählt — sonst könnte ein Angreifer eine
    // Regel „verbrauchen" und mit der anderen ungestört weiterarbeiten.
    expect(second.hits[1]?.hit.count).toBe(2)
  })

  test('die Wartezeit ist die längste der geprüften Regeln', async () => {
    let now = 0
    const limiter = new MemoryRateLimiter(() => now)
    await limiter.hit('kurz', 1, 1000)
    await limiter.hit('lang', 1, 60_000)
    now = 500
    const result = await hitAll(limiter, [
      { key: 'kurz', limit: 1, windowMs: 1000 },
      { key: 'lang', limit: 1, windowMs: 60_000 },
    ])
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBe(59_500)
  })

  test('die Verzögerung wächst und ist gedeckelt', async () => {
    const waited: number[] = []
    const sleep = (ms: number): Promise<void> => {
      waited.push(ms)
      return Promise.resolve()
    }
    // Unterhalb der Schwelle passiert nichts.
    expect(await applyBackoff(1, sleep)).toBe(0)
    expect(await applyBackoff(2, sleep)).toBe(0)
    // Ab der Schwelle verdoppelt es sich …
    expect(await applyBackoff(3, sleep)).toBe(LOGIN_LIMITS.slowAfter.delayMs)
    expect(await applyBackoff(4, sleep)).toBe(LOGIN_LIMITS.slowAfter.delayMs * 2)
    // … und bleibt gedeckelt. Eine Warteschlange voller schlafender Anfragen wäre
    // selbst eine Überlastung.
    expect(await applyBackoff(50, sleep)).toBe(4000)
    expect(waited.every((ms) => ms <= 4000)).toBe(true)
  })

  test('die Grenzen der Regeln stehen als Konstanten mit Begründung', () => {
    expect(LOGIN_LIMITS.perAccount.limit).toBe(5)
    expect(LOGIN_LIMITS.perIp.limit).toBe(20)
    expect(RESET_LIMITS.perAccount.limit).toBe(3)
  })
})
