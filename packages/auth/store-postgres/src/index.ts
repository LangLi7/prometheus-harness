/**
 * `@prometheus-harness/auth-store-postgres` — der Speicher hinter der Anmeldung.
 *
 * ## Warum es dieses Paket gibt
 *
 * `@prometheus-harness/auth` ist der **Regelkern** der Anmeldung: Passwörter
 * hashen und prüfen, Sitzungstoken erzeugen, Adressen normalisieren, und das
 * alles so, daß ein Angreifer aus der **Antwortzeit** nichts lernt. Dieses Paket
 * kennt **keine** dieser Regeln — es kennt nur SQL.
 *
 * Die Trennung ist Absicht und steht so im Kopf des Regelkerns: dort kommen
 * Speicher (`UserStore`, `SessionStore`) und Spurensenke (`AuthEventSink`) als
 * **Schnittstellen** herein, damit jede Regel **ohne laufende Infrastruktur**
 * prüfbar bleibt. Wer die Regeln prüfen will, braucht keine Datenbank; wer sie
 * benutzen will, braucht diesen Speicher.
 *
 * **Vorher war beides nicht verbunden.** 51 Prüfungen lagen im Regelkern, und
 * kein Stück Code rief sie auf. Ein Regelkern ohne Aufrufer ist eine Behauptung.
 *
 * ## Die vier Übergänge, an denen Fehler entstehen — und wie sie hier liegen
 *
 * | Übergang | Die Falle | Was hier geschieht |
 * |---|---|---|
 * | Zeitpunkte | der Treiber liefert `Date`, die Schnittstelle verlangt **ISO-8601-Text** | {@link alsIso} wandelt an **jeder** Lesestelle; ein `Date` dort, wo ein Text erwartet wird, vergleicht später falsch und fällt nicht auf |
 * | `inet` | `ip_first_seen` ist `inet`, nicht `text` — ein leerer Text ist **kein** gültiger Wert, `NULL` schon | {@link alsIp} macht aus `undefined` ein `NULL` und aus dem Rest einen Text; gelesen wird mit `::text`, damit nichts Halbtypisiertes zurückkommt |
 * | `jsonb` | ein Parameter ohne Typangabe wird nicht als JSON erkannt | `detail` geht als **Text** mit `::jsonb` in die Anweisung |
 * | doppelte Adresse | der Regelkern erwartet bei einer vergebenen Adresse `undefined`, **keinen** Fehler | {@link erzeugeUserStore} fängt **nur** `23505` und reicht alles andere weiter |
 *
 * ## Was dieses Paket ausdrücklich nicht tut
 *
 * Es **normalisiert keine Adresse** und **prüft kein Passwort**. Wer hier
 * `findByEmail('Ada@Example.org')` aufruft, bekommt nichts — die Normalisierung
 * gehört in den Regelkern, und die Abfrage vergleicht gegen `lower(email)`, also
 * gegen genau den Ausdruck, auf dem der eindeutige Index liegt.
 *
 * @module @prometheus-harness/auth-store-postgres
 */

import type {
  AuthEvent,
  AuthEventSink,
  NewUser,
  SessionRecord,
  SessionStore,
  UserRecord,
  UserStore,
} from '@prometheus-harness/auth'
// **Die Isolation kommt aus `permissions`.** Sie ist genau die Form der Spalten
// dieser Tabelle — und `Isolation` sagt über sich selbst, es seien „genau die
// Felder von `SandboxPolicy`" aus `services/pmh-sandbox`. Ein eigener,
// gleich aussehender Typ hier wäre eine zweite Wahrheit über dieselbe Sache.
import type { Dateizugriff, Isolation } from '@prometheus-harness/permissions'
// **Die Kryptographie kommt aus `secrets`.** Der Speicher entscheidet nicht, wie
// verschlüsselt wird — aber die Umschlag-Ebene (`speichereGeheimnis`) verpackt,
// damit ein Aufrufer das Verschlüsseln nicht vergessen kann. Die Byte-Ebene
// (`speichereUmschlag`) tut es ausdrücklich nicht; siehe deren Begründung.
import { entpacke, verpacke, type Hauptschluessel } from '@prometheus-harness/secrets'
import type { TokenAblage, TokenEintrag } from '@prometheus-harness/reset'

// ---------------------------------------------------------------------------
// Der Datenbankzugang
// ---------------------------------------------------------------------------

/**
 * Der Zugang, den dieses Paket braucht — **nicht** der ganze Treiber.
 *
 * **Warum eine eigene Schnittstelle und nicht `postgres.Sql`.** Damit dieses
 * Paket **ohne** laufende Datenbank prüfbar bleibt: die Prüfungen setzen eine
 * Attrappe ein und sehen sich die Anweisungen an. Ein Speicher, der nur gegen
 * eine echte Datenbank prüfbar ist, wird nicht geprüft.
 *
 * Der Rückgabetyp ist bewusst `unknown`: der echte Treiber liefert eine
 * Zeilenliste **mit** `count` und `command` anhängend. Wer ihn hier auf einen
 * genauen Typ festnagelt, prüft die Launen des Treibers statt die eigene Arbeit.
 * {@link zeilen} ist die **einzige** Stelle, an der umgedeutet wird.
 */
export interface SqlZugang {
  unsafe(anweisung: string, werte?: readonly unknown[]): PromiseLike<unknown>
}

/** Führt eine Anweisung aus und deutet die Zeilen an **einer** Stelle um. */
async function zeilen<T>(
  sql: SqlZugang,
  anweisung: string,
  werte: readonly unknown[] = [],
): Promise<readonly T[]> {
  return (await sql.unsafe(anweisung, werte)) as readonly T[]
}

/** Führt eine Anweisung aus, ohne die Zeilen zu lesen. */
async function ausfuehren(
  sql: SqlZugang,
  anweisung: string,
  werte: readonly unknown[] = [],
): Promise<void> {
  await sql.unsafe(anweisung, werte)
}

// ---------------------------------------------------------------------------
// Die vier Übergänge
// ---------------------------------------------------------------------------

/**
 * Wandelt einen gelesenen Zeitpunkt in **ISO-8601-Text**.
 *
 * **Warum das nicht weggelassen werden darf.** Der Treiber liefert für
 * `timestamptz` ein `Date`. Die Schnittstellen `UserRecord` und `SessionRecord`
 * verlangen einen **Text**. Bliebe das `Date` stehen, sähe der Rückgabewert
 * richtig aus — bis jemand ihn mit einem Text vergleicht oder in JSON schreibt.
 * Ein `Date` in einem Feld namens `…At`, das ein Text sein soll, fällt nirgends
 * auf und vergleicht still falsch.
 */
export function alsIso(wert: unknown): string {
  if (wert instanceof Date) return wert.toISOString()
  return String(wert)
}

/** Dasselbe, aber `null` bleibt `undefined` — so verlangt es die Schnittstelle. */
export function alsIsoOderNichts(wert: unknown): string | undefined {
  if (wert === null || wert === undefined) return undefined
  return alsIso(wert)
}

/**
 * Macht aus einem optionalen Wert einen gültigen `inet`-Parameter.
 *
 * **Warum `null` und nicht `''`.** Die Spalte ist `inet`. Ein leerer Text ist
 * dort **kein gültiger Wert** — PostgreSQL weist ihn ab —, `NULL` dagegen ist
 * genau das Gemeinte: „nicht bekannt". Wer hier den leeren Text durchreicht,
 * bekommt einen Fehler beim Anlegen der Sitzung, und zwar erst dann.
 */
export function alsIp(wert: string | undefined): string | null {
  if (wert === undefined) return null
  const sauber = wert.trim()
  return sauber === '' ? null : sauber
}

/**
 * Macht aus einem optionalen Text einen gültigen `jsonb`-Parameter.
 *
 * **Warum als Text.** Der Parameter geht ohne Typangabe an den Server; ein
 * JavaScript-Objekt würde dort nicht als JSON erkannt. Die Anweisung gießt ihn
 * mit `::jsonb`. `undefined` wird `NULL`.
 */
export function alsJson(wert: Readonly<Record<string, unknown>> | undefined): string | null {
  if (wert === undefined) return null
  return JSON.stringify(wert)
}

/** Ist der Fehler eine Verletzung der Eindeutigkeit? */
export function istDoppelt(fehler: unknown): boolean {
  return (fehler as { code?: string } | undefined)?.code === '23505'
}

// ---------------------------------------------------------------------------
// Zeilen, wie sie aus der Datenbank kommen
// ---------------------------------------------------------------------------

interface BenutzerZeile {
  readonly id: string
  readonly email: string
  readonly password_hash: string | null
  readonly display_name: string
  readonly role: string
  readonly disabled_at: unknown
}

interface SitzungZeile {
  readonly id: string
  readonly user_id: string
  readonly token_hash: string
  readonly csrf_hash: string
  readonly user_agent: string
  readonly ip_first_seen: string | null
  readonly idle_expires_at: unknown
  readonly absolute_expires_at: unknown
  readonly created_at: unknown
  readonly last_seen_at: unknown
  readonly revoked_at: unknown
  readonly revoked_reason: string | null
}

/** Aus einer Benutzerzeile den Datensatz machen, den der Regelkern verlangt. */
function alsBenutzer(zeile: BenutzerZeile): UserRecord {
  return {
    id: zeile.id,
    email: zeile.email,
    passwordHash: zeile.password_hash ?? undefined,
    displayName: zeile.display_name,
    // Die Prüfregel `users_role_known` läßt genau zwei Werte zu. Kommt etwas
    // anderes, ist es kein Benutzer, den wir bedienen können — dann soll es
    // auffallen und nicht als 'user' durchgehen.
    role: zeile.role === 'admin' ? 'admin' : 'user',
    disabledAt: alsIsoOderNichts(zeile.disabled_at),
  }
}

/** Aus einer Sitzungszeile den Datensatz machen, den der Regelkern verlangt. */
function alsSitzung(zeile: SitzungZeile): SessionRecord {
  return {
    id: zeile.id,
    userId: zeile.user_id,
    tokenHash: zeile.token_hash,
    csrfHash: zeile.csrf_hash,
    userAgent: zeile.user_agent,
    ipFirstSeen: zeile.ip_first_seen ?? undefined,
    idleExpiresAt: alsIso(zeile.idle_expires_at),
    absoluteExpiresAt: alsIso(zeile.absolute_expires_at),
    createdAt: alsIso(zeile.created_at),
    lastSeenAt: alsIso(zeile.last_seen_at),
    revokedAt: alsIsoOderNichts(zeile.revoked_at),
    revokedReason: zeile.revoked_reason ?? undefined,
  }
}

/**
 * Die Spalten einer Sitzung, in **einer** Liste.
 *
 * **Warum als Konstante.** Sie stehen an drei Stellen (Suche über den Token-Hash,
 * Suche über die Kennung, und die Prüfung danach). Dreimal abgeschrieben wäre die
 * Spaltenliste dreimal zu ändern — und eine vergessene Spalte liefert still
 * `undefined`, statt zu scheitern.
 *
 * **`host(...)` und nicht `::text` — das war ein gemessener Fehler.** Der erste
 * Entwurf las die IP mit `ip_first_seen::text` und begründete das damit, daß so
 * „ein schlichter Text" zurückkomme. Das ist **falsch**: PostgreSQL hängt an eine
 * `inet`-Ausgabe die **Netzmaske** an.
 *
 * ```
 * select ('203.0.113.7'::inet)::text;   →  203.0.113.7/32
 * select host('203.0.113.7'::inet);     →  203.0.113.7
 * select ('2001:db8::1'::inet)::text;   →  2001:db8::1/128
 * select host('2001:db8::1'::inet);     →  2001:db8::1
 * ```
 *
 * Der Integrationstest hat es gefunden, nicht das Nachdenken: die Sitzung wurde
 * mit `203.0.113.7` angelegt und kam als `203.0.113.7/32` zurück. Wer das
 * durchgehen läßt, hat in `SessionRecord.ipFirstSeen` einen Wert, der **nicht
 * gleich** dem ist, der hineinging — und jede spätere Gegenüberstellung („ist das
 * dieselbe Adresse wie beim Anlegen?") vergleicht still falsch.
 *
 * `host()` gibt genau den Adressteil zurück, ohne Netzmaske.
 */
const SITZUNG_SPALTEN = `
  id, user_id, token_hash, csrf_hash, user_agent,
  host(ip_first_seen) AS ip_first_seen,
  idle_expires_at, absolute_expires_at, created_at, last_seen_at,
  revoked_at, revoked_reason
`

// ---------------------------------------------------------------------------
// Der Benutzerspeicher
// ---------------------------------------------------------------------------

/**
 * Der Benutzerspeicher über PostgreSQL.
 *
 * @param sql - der Datenbankzugang
 * @returns der Speicher, den `authenticate` und `register` verlangen
 */
export function erzeugeUserStore(sql: SqlZugang): UserStore {
  return {
    async findByEmail(email: string): Promise<UserRecord | undefined> {
      // **Gegen `lower(email)`, nicht gegen `email`.** Der eindeutige Index heißt
      // `users_email_lower_key ON users (lower(email))`. Eine Abfrage mit
      // `where email = $1` würde ihn **nicht** benutzen und bei zwei
      // Schreibweisen derselben Adresse zwei Zeilen finden — obwohl die
      // Datenbank sie als eine ansieht.
      //
      // **Und der Parameter muß ebenfalls kleingeschrieben werden.** Das war ein
      // gemessener Fehler: die erste Fassung verglich `lower(email) = $1` und
      // reichte die Adresse **wie hereingereicht** durch. `findByEmail('DORA@…')`
      // fand damit **nichts**, obwohl die Zeile `dora@…` in der Tabelle stand —
      // links klein, rechts groß, kein Treffer. Der Integrationstest hat es
      // gefunden.
      //
      // `lower($1)` ist dabei **nicht** indexfeindlich: der Ausdruck ist eine
      // Konstante je Abfrage, der Index auf `lower(email)` bleibt benutzbar.
      //
      // **Warum hier und nicht „das macht der Regelkern".** Der Regelkern
      // normalisiert tatsächlich (`authenticate` ruft `findByEmail` mit der
      // normalisierten Adresse auf) — aber der Speicher ist eine **öffentliche
      // Schnittstelle**. Eine Abfrage, die nur bei richtiger Schreibweise des
      // Aufrufers funktioniert, ist eine Falle, die beim ersten anderen Aufrufer
      // zuschnappt.
      const gefunden = await zeilen<BenutzerZeile>(
        sql,
        'SELECT id, email, password_hash, display_name, role, disabled_at FROM users WHERE lower(email) = lower($1)',
        [email],
      )
      const zeile = gefunden[0]
      return zeile === undefined ? undefined : alsBenutzer(zeile)
    },

    async findById(id: string): Promise<UserRecord | undefined> {
      const gefunden = await zeilen<BenutzerZeile>(
        sql,
        'SELECT id, email, password_hash, display_name, role, disabled_at FROM users WHERE id = $1',
        [id],
      )
      const zeile = gefunden[0]
      return zeile === undefined ? undefined : alsBenutzer(zeile)
    },

    async create(user: NewUser): Promise<string | undefined> {
      try {
        // `RETURNING id`, damit die Kennung aus der Datenbank kommt und nicht
        // aus der Annahme, daß sie so geschrieben wurde, wie sie hereinkam.
        //
        // **`role` gehört in die Anweisung.** Vorher fehlte die Spalte hier, und
        // `register` konnte die Rolle deshalb gar nicht durchreichen — sie landete
        // im Rückgabewert und nicht in der Zeile (gemessen am 13.10.2026:
        // Antwort `"role":"admin"`, Datenbank `rolle=user`). Die Vorgabe `user`
        // entspricht der Spaltenvorgabe des Schemas: wer nichts sagt, bekommt
        // keinen Admin.
        const angelegt = await zeilen<{ id: string }>(
          sql,
          `INSERT INTO users (id, email, password_hash, display_name, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [user.id, user.email, user.passwordHash, user.displayName, user.role ?? 'user'],
        )
        return angelegt[0]?.id
      } catch (fehler) {
        // **Nur die Eindeutigkeit wird geschluckt.** Der Regelkern erwartet bei
        // einer vergebenen Adresse `undefined` und macht daraus seine eigene
        // Antwort. Alles andere — Verbindung weg, Prüfregel verletzt, Spalte
        // fehlt — muß **fliegen**. Wer hier pauschal `undefined` zurückgibt,
        // verwandelt einen Ausfall in „diese Adresse gibt es schon", und der
        // Benutzer sucht den Fehler bei sich.
        if (istDoppelt(fehler)) return undefined
        throw fehler
      }
    },

    async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
      await ausfuehren(
        sql,
        'UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1',
        [id, passwordHash],
      )
    },

    async count(): Promise<number> {
      // `::int` und nicht `count(*)` blank: `count` kommt als **Text** zurück
      // (bigint paßt nicht in eine JavaScript-Zahl), und `Number('3')` wäre eine
      // Umdeutung an der falschen Stelle.
      const gefunden = await zeilen<{ n: number }>(sql, 'SELECT count(*)::int AS n FROM users')
      return gefunden[0]?.n ?? 0
    },
  }
}

// ---------------------------------------------------------------------------
// Der Sitzungsspeicher
// ---------------------------------------------------------------------------

/**
 * Der Sitzungsspeicher über PostgreSQL.
 *
 * @param sql - der Datenbankzugang
 * @returns der Speicher, den `createSession`, `verifySession`,
 *   `rotateSession`, `touchSession` und `revokeSession` verlangen
 */
export function erzeugeSessionStore(sql: SqlZugang): SessionStore {
  return {
    async findByTokenHash(tokenHash: string): Promise<SessionRecord | undefined> {
      const gefunden = await zeilen<SitzungZeile>(
        sql,
        `SELECT ${SITZUNG_SPALTEN} FROM auth_sessions WHERE token_hash = $1`,
        [tokenHash],
      )
      const zeile = gefunden[0]
      return zeile === undefined ? undefined : alsSitzung(zeile)
    },

    async findById(id: string): Promise<SessionRecord | undefined> {
      const gefunden = await zeilen<SitzungZeile>(
        sql,
        `SELECT ${SITZUNG_SPALTEN} FROM auth_sessions WHERE id = $1`,
        [id],
      )
      const zeile = gefunden[0]
      return zeile === undefined ? undefined : alsSitzung(zeile)
    },

    async create(session: SessionRecord): Promise<void> {
      await ausfuehren(
        sql,
        `INSERT INTO auth_sessions
           (id, user_id, token_hash, csrf_hash, user_agent, ip_first_seen,
            idle_expires_at, absolute_expires_at, created_at, last_seen_at,
            revoked_at, revoked_reason)
         VALUES ($1, $2, $3, $4, $5, $6::inet, $7, $8, $9, $10, $11, $12)`,
        [
          session.id,
          session.userId,
          session.tokenHash,
          session.csrfHash,
          session.userAgent,
          alsIp(session.ipFirstSeen),
          session.idleExpiresAt,
          session.absoluteExpiresAt,
          session.createdAt,
          session.lastSeenAt,
          session.revokedAt ?? null,
          session.revokedReason ?? null,
        ],
      )
    },

    async touch(id: string, lastSeenAt: string, idleExpiresAt: string): Promise<void> {
      await ausfuehren(
        sql,
        'UPDATE auth_sessions SET last_seen_at = $2, idle_expires_at = $3 WHERE id = $1',
        [id, lastSeenAt, idleExpiresAt],
      )
    },

    async revoke(id: string, at: string, reason: string): Promise<void> {
      // **Nur setzen, wenn noch nicht widerrufen.** Wird dieselbe Sitzung zweimal
      // widerrufen, soll der **erste** Zeitpunkt stehenbleiben — er ist der
      // aussagekräftige. Ein Überschreiben machte aus „wann wurde sie beendet"
      // ein „wann hat jemand zuletzt auf Abmelden gedrückt".
      await ausfuehren(
        sql,
        `UPDATE auth_sessions SET revoked_at = $2, revoked_reason = $3
          WHERE id = $1 AND revoked_at IS NULL`,
        [id, at, reason],
      )
    },

    async revokeAllForUser(userId: string, at: string, reason: string): Promise<number> {
      const getroffen = await zeilen<{ id: string }>(
        sql,
        `UPDATE auth_sessions SET revoked_at = $2, revoked_reason = $3
          WHERE user_id = $1 AND revoked_at IS NULL
          RETURNING id`,
        [userId, at, reason],
      )
      // **Gezählt wird, was tatsächlich getroffen wurde** — nicht, was es gibt.
      // Die Zahl geht an den Aufrufer zurück und landet später in einer Spur;
      // eine Zahl, die „alle" bedeutet, obwohl nur die offenen gemeint sind,
      // wäre dort falsch.
      return getroffen.length
    },

    async replaceToken(id: string, tokenHash: string, csrfHash: string): Promise<void> {
      await ausfuehren(
        sql,
        'UPDATE auth_sessions SET token_hash = $2, csrf_hash = $3 WHERE id = $1',
        [id, tokenHash, csrfHash],
      )
    },
  }
}

// ---------------------------------------------------------------------------
// Die Spurensenke
// ---------------------------------------------------------------------------

/**
 * Die Prüfspur über PostgreSQL.
 *
 * **Warum eine Senke und nicht ein Protokoll in eine Datei.** Die Spur beantwortet
 * die Frage, die nach einem Vorfall gestellt wird: *wurde ein Konto durchprobiert?*
 * Dafür müssen die Ereignisse **abfragbar** sein — nach Adresse, nach Zeitraum,
 * nach Art. In einer Textdatei ist das eine Suche; in `auth_events` ist es eine
 * Abfrage.
 *
 * **Was hier nicht hineingehört.** Kein Passwort, kein Token, kein Hash. Die
 * Spalte `detail` ist ein freies JSON-Feld und damit die naheliegende Stelle für
 * genau diesen Fehler — deshalb steht es hier.
 *
 * @param sql - der Datenbankzugang
 * @returns die Senke, die `authenticate` und `register` verlangen
 */
export function erzeugeSpurensenke(sql: SqlZugang): AuthEventSink {
  return {
    async record(event: AuthEvent): Promise<void> {
      await ausfuehren(
        sql,
        `INSERT INTO auth_events (user_id, kind, email, ip, user_agent, detail)
         VALUES ($1, $2, $3, $4::inet, $5, $6::jsonb)`,
        [
          event.userId ?? null,
          event.kind,
          event.email ?? null,
          alsIp(event.ip),
          event.userAgent ?? '',
          alsJson(event.detail),
        ],
      )
    },
  }
}

// ---------------------------------------------------------------------------
// Alles zusammen
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Das Isolationsprofil
// ---------------------------------------------------------------------------

/**
 * Liest das Isolationsprofil eines Benutzers.
 *
 * **Warum `undefined` ein gültiges Ergebnis ist.** Ein Benutzer **ohne** Profil
 * ist der Normalfall — die Tabelle wird nur gefüllt, wenn jemand eine andere
 * Isolation braucht als die Vorgabe. Wer kein Profil hat, bekommt das
 * Vorgabeprofil; das entscheidet der Aufrufer, nicht der Speicher.
 *
 * @param sql - der Datenbankzugang
 * @param userId - der Benutzer
 * @returns das Profil oder `undefined`
 */
export async function ladeProfil(sql: SqlZugang, userId: string): Promise<Isolation | undefined> {
  const gefunden = await zeilen<{
    dateizugriff: string
    lesewurzeln: string[]
    schreibwurzeln: string[]
    netz: boolean
    prozesse: boolean
  }>(
    sql,
    `SELECT dateizugriff, lesewurzeln, schreibwurzeln, netz, prozesse
       FROM user_profiles WHERE user_id = $1`,
    [userId],
  )
  const zeile = gefunden[0]
  if (zeile === undefined) return undefined

  // **Die Werte kommen aus einer Spalte mit Prüfregel.** `dateizugriff` ist durch
  // `user_profiles_dateizugriff_known` auf die drei Langformen festgelegt, die
  // `FileAccess::parse` annimmt. Ein `as` an dieser Stelle ist deshalb keine
  // Behauptung, sondern die Fortsetzung einer Zusicherung, die die Datenbank
  // gibt — und die Probe `tests/proben/benutzerprofile.sql` weist nach, daß sie
  // wirklich greift.
  return {
    dateizugriff: zeile.dateizugriff as Dateizugriff,
    lesewurzeln: zeile.lesewurzeln,
    schreibwurzeln: zeile.schreibwurzeln,
    netz: zeile.netz,
    prozesse: zeile.prozesse,
  }
}

/**
 * Schreibt das Isolationsprofil eines Benutzers — anlegend oder ersetzend.
 *
 * **Warum ein `UPSERT` und kein getrenntes Anlegen/Ändern.** Der Aufrufer will
 * eine Sache: „dieser Benutzer soll **so** isoliert sein". Ob das Profil schon
 * existierte, ist für ihn ohne Belang — und zwei Wege hieße, daß ein Aufrufer den
 * falschen erwischt und dabei einen Fehler bekommt, der nach einem Rechteproblem
 * aussieht.
 *
 * **Was der Dienst dazu sagt.** Die Prüfregeln der Tabelle spiegeln
 * `SandboxPolicy::validate()`; ein widersprüchliches Profil wird hier
 * **abgelehnt**, nicht gespeichert. Der Fehler kommt damit von der Stelle, die
 * ihn verursacht hat.
 *
 * @param sql - der Datenbankzugang
 * @param userId - der Benutzer
 * @param isolation - das Profil
 */
export async function speichereProfil(sql: SqlZugang, userId: string, isolation: Isolation): Promise<void> {
  await ausfuehren(
    sql,
    `INSERT INTO user_profiles (user_id, dateizugriff, lesewurzeln, schreibwurzeln, netz, prozesse)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE
       SET dateizugriff = EXCLUDED.dateizugriff,
           lesewurzeln = EXCLUDED.lesewurzeln,
           schreibwurzeln = EXCLUDED.schreibwurzeln,
           netz = EXCLUDED.netz,
           prozesse = EXCLUDED.prozesse,
           updated_at = now()`,
    [
      userId,
      isolation.dateizugriff,
      [...isolation.lesewurzeln],
      [...isolation.schreibwurzeln],
      isolation.netz,
      isolation.prozesse,
    ],
  )
}

// ---------------------------------------------------------------------------
// Die Geheimnisse des Benutzers
// ---------------------------------------------------------------------------

/**
 * Legt einen **Umschlag** ab — die Bytes, ohne Kryptographie.
 *
 * ## Warum es zwei Ebenen gibt
 *
 * Diese Funktion nimmt fertige Bytes. Sie **entscheidet nichts** und
 * **verschlüsselt nichts** — sie schreibt, was hereinkommt. Darüber liegt
 * {@link speichereGeheimnis}, das den Klartext verpackt.
 *
 * **Warum trotzdem beide Ebenen nötig sind.** Die Byte-Ebene ist die, die eine
 * Prüfung ansprechen kann, ohne einen Hauptschlüssel zu brauchen — und die, die
 * eine **Rotation** benutzt: sie schreibt einen neuen Umschlag mit **demselben**
 * `value_cipher`. Die Umschlag-Ebene ist die, die ein Aufrufer benutzt, damit er
 * das Verschlüsseln nicht **vergessen** kann.
 *
 * Der Name sagt, was hereinkommt: `Umschlag`, nicht `Geheimnis`.
 *
 * @param sql - der Datenbankzugang
 * @param userId - der Benutzer
 * @param ref - der Name des Geheimnisses, in der Schreibweise der Umgebungsvariablen
 * @param umschlag - die vier Werte aus `verpacke`
 */
export async function speichereUmschlag(
  sql: SqlZugang,
  userId: string,
  ref: string,
  umschlag: {
    readonly valueCipher: Uint8Array
    readonly wrappedKey: Uint8Array
    readonly masterKeyVersion: number
    readonly keyHint: string
  },
): Promise<void> {
  await ausfuehren(
    sql,
    `INSERT INTO user_secrets (id, user_id, ref, value_cipher, wrapped_key, master_key_version, key_hint)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, ref) DO UPDATE
       SET value_cipher = EXCLUDED.value_cipher,
           wrapped_key = EXCLUDED.wrapped_key,
           master_key_version = EXCLUDED.master_key_version,
           key_hint = EXCLUDED.key_hint,
           updated_at = now()`,
    [
      userId,
      ref,
      // **`Buffer.from` und kein direktes Uint8Array.** Der Treiber schreibt
      // `bytea` aus einem Puffer; ein `Uint8Array` ohne Umweg über den Puffer
      // kann je nach Fassung als Liste von Zahlen ankommen.
      Buffer.from(umschlag.valueCipher),
      Buffer.from(umschlag.wrappedKey),
      umschlag.masterKeyVersion,
      umschlag.keyHint,
    ],
  )
}

/**
 * Liest einen **Umschlag** — die Bytes, ohne Kryptographie.
 *
 * @param sql - der Datenbankzugang
 * @param userId - der Benutzer
 * @param ref - der Name
 * @returns der Umschlag oder `undefined`
 */
export async function ladeUmschlag(
  sql: SqlZugang,
  userId: string,
  ref: string,
): Promise<
  | {
      readonly valueCipher: Uint8Array
      readonly wrappedKey: Uint8Array
      readonly masterKeyVersion: number
      readonly keyHint: string
    }
  | undefined
> {
  const gefunden = await zeilen<{
    value_cipher: Uint8Array
    wrapped_key: Uint8Array
    master_key_version: number
    key_hint: string
  }>(
    sql,
    `SELECT value_cipher, wrapped_key, master_key_version, key_hint
       FROM user_secrets WHERE user_id = $1 AND ref = $2`,
    [userId, ref],
  )
  const zeile = gefunden[0]
  if (zeile === undefined) return undefined
  return {
    valueCipher: zeile.value_cipher,
    wrappedKey: zeile.wrapped_key,
    masterKeyVersion: zeile.master_key_version,
    keyHint: zeile.key_hint,
  }
}

/** Ein Geheimnis, **ohne** seinen Inhalt: nur Name, Fassung und Hinweis. */
export interface GeheimnisAnzeige {
  readonly ref: string
  readonly masterKeyVersion: number
  readonly keyHint: string
  readonly updatedAt: string
}

/**
 * Listet die Geheimnisse eines Benutzers — **ohne Klartext und ohne Geheimtext**.
 *
 * **Warum das eine eigene Funktion ist.** „Welche Geheimnisse liegen hier?" ist
 * eine Frage, die ein Bediener ständig hat, und sie braucht **keinen**
 * Hauptschlüssel. Wer sie über `ladeUmschlag` beantwortet, holt jedes Geheimnis
 * einzeln — und hat dann Klartext im Speicher, den niemand braucht.
 *
 * @param sql - der Datenbankzugang
 * @param userId - der Benutzer
 * @returns die Anzeigen, nach Name sortiert
 */
export async function listeGeheimnisse(sql: SqlZugang, userId: string): Promise<readonly GeheimnisAnzeige[]> {
  const gefunden = await zeilen<{
    ref: string
    master_key_version: number
    key_hint: string
    updated_at: unknown
  }>(
    sql,
    `SELECT ref, master_key_version, key_hint, updated_at
       FROM user_secrets WHERE user_id = $1 ORDER BY ref`,
    [userId],
  )
  return gefunden.map((zeile) => ({
    ref: zeile.ref,
    masterKeyVersion: zeile.master_key_version,
    keyHint: zeile.key_hint,
    updatedAt: alsIso(zeile.updated_at),
  }))
}

/**
 * Legt ein Geheimnis ab — und **verpackt es dabei**.
 *
 * **Warum diese Ebene existiert.** Sie ist die, die ein Aufrufer benutzt. Er
 * übergibt Klartext und Hauptschlüssel und kann das Verschlüsseln nicht
 * vergessen: es gibt keinen Weg durch diese Funktion, der Klartext in die Spalte
 * `value_cipher` schreibt.
 *
 * @param sql - der Datenbankzugang
 * @param haupt - der Hauptschlüssel
 * @param eingabe - Benutzer, Name und Klartext
 */
export async function speichereGeheimnis(
  sql: SqlZugang,
  haupt: Hauptschluessel,
  eingabe: { readonly userId: string; readonly ref: string; readonly klartext: Uint8Array },
): Promise<void> {
  await speichereUmschlag(sql, eingabe.userId, eingabe.ref, verpacke(eingabe.klartext, haupt))
}

/**
 * Liest ein Geheimnis — und **entpackt es dabei**.
 *
 * @param sql - der Datenbankzugang
 * @param haupt - der Hauptschlüssel
 * @param eingabe - Benutzer und Name
 * @returns der Klartext oder `undefined`, wenn kein solches Geheimnis liegt
 */
export async function ladeGeheimnis(
  sql: SqlZugang,
  haupt: Hauptschluessel,
  eingabe: { readonly userId: string; readonly ref: string },
): Promise<Uint8Array | undefined> {
  const umschlag = await ladeUmschlag(sql, eingabe.userId, eingabe.ref)
  if (umschlag === undefined) return undefined
  return entpacke(umschlag, haupt)
}

// ---------------------------------------------------------------------------
// Einmal-Token (Passwort-Reset)
// ---------------------------------------------------------------------------

/**
 * Die Ablage für `one_time_tokens`.
 *
 * ## Warum `verbrauche` ein einziges UPDATE mit Bedingung ist
 *
 * Die Marke „verbraucht" entscheidet, ob ein Token ein zweites Mal wirkt. Wäre
 * sie ein Lesen und danach ein Schreiben, könnten zwei gleichzeitige Anfragen
 * **beide** „noch offen" lesen und **beide** ein Passwort setzen. Die Bedingung
 * gehört deshalb in die Anweisung selbst:
 *
 * ```sql
 * UPDATE … SET consumed_at = $2 WHERE id = $1 AND consumed_at IS NULL RETURNING id
 * ```
 *
 * Der erste Aufruf bekommt eine Zeile zurück, der zweite keine. Das ist dieselbe
 * Bauform wie beim `revoke` der Sitzungen — und aus demselben Grund.
 *
 * @param sql - der Datenbankzugang
 * @returns die Ablage
 */
export function erzeugeTokenAblage(sql: SqlZugang): TokenAblage {
  return {
    async legeAb(eintrag: TokenEintrag): Promise<void> {
      await ausfuehren(
        sql,
        `INSERT INTO one_time_tokens (id, user_id, purpose, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [eintrag.id, eintrag.userId, eintrag.zweck, eintrag.tokenHash, eintrag.laeuftAb],
      )
    },

    async finde(
      tokenHash: string,
      zweck: string,
    ): Promise<{ readonly id: string; readonly userId: string; readonly laeuftAb: Date; readonly verbraucht: boolean } | undefined> {
      const gefunden = await zeilen<{
        id: string
        user_id: string
        expires_at: unknown
        consumed_at: unknown
      }>(
        sql,
        `SELECT id, user_id, expires_at, consumed_at
           FROM one_time_tokens WHERE token_hash = $1 AND purpose = $2`,
        [tokenHash, zweck],
      )
      const zeile = gefunden[0]
      if (zeile === undefined) return undefined
      return {
        id: zeile.id,
        userId: zeile.user_id,
        laeuftAb: new Date(alsIso(zeile.expires_at)),
        // `consumed_at IS NOT NULL` — die Spalte ist ein Zeitpunkt, kein Schalter.
        // **Wann** verbraucht wurde, ist die nützlichere Angabe.
        verbraucht: zeile.consumed_at !== null && zeile.consumed_at !== undefined,
      }
    },

    async verbrauche(id: string, at: Date): Promise<boolean> {
      const getroffen = await zeilen<{ id: string }>(
        sql,
        `UPDATE one_time_tokens SET consumed_at = $2
          WHERE id = $1 AND consumed_at IS NULL
          RETURNING id`,
        [id, at.toISOString()],
      )
      // **Genau eine Zeile heißt: DIESER Aufruf war der erste.** Keine Zeile
      // heißt: ein anderer war schneller. Siehe die Begründung oben.
      return getroffen.length === 1
    },

    async zaehleSeit(userId: string, zweck: string, seit: Date): Promise<number> {
      const gefunden = await zeilen<{ n: number }>(
        sql,
        `SELECT count(*)::int AS n FROM one_time_tokens
          WHERE user_id = $1 AND purpose = $2 AND created_at >= $3`,
        [userId, zweck, seit.toISOString()],
      )
      return gefunden[0]?.n ?? 0
    },
  }
}

/** Die drei Speicher, die der Regelkern braucht. */
export interface AuthSpeicher {
  readonly benutzer: UserStore
  readonly sitzungen: SessionStore
  readonly spur: AuthEventSink
  /**
   * Wie viele Administratoren es gibt.
   *
   * **Warum das hier steht und nicht im Regelkern.** `UserStore.count()` zählt
   * **alle** Konten. Für die Frage „ist die Erstinbetriebnahme noch offen?"
   * genügt das nicht: eine Datenbank mit fünf Benutzern und **keinem** Admin ist
   * genauso ausgesperrt wie eine leere — nur schlimmer, weil Daten darin liegen.
   * Gemessen am 13.10.2026 in der Betriebsdatenbank:
   *
   * ```
   * benutzer=4  davon_admins=0
   * ```
   *
   * Dort konnte danach **niemand** mehr ein Konto anlegen. `UserStore` hat keine
   * Methode dafür, und der Regelkern soll auch keine bekommen: „wie viele Admins
   * gibt es" ist eine Frage an den **Speicher**, nicht eine Regel der Anmeldung.
   */
  readonly anzahlAdmins: () => Promise<number>
  /**
   * Liest das Isolationsprofil eines Benutzers.
   *
   * **Warum `undefined` und kein Vorgabeprofil.** Der Speicher kennt kein
   * Harness-Home und soll keines kennen — das Vorgabeprofil hängt am Home
   * (`vorgabeProfil(home)`) und ist damit eine Entscheidung des Aufrufers.
   * Ein Speicher, der bei fehlendem Profil selbst eines erfindet, hätte eine
   * Meinung, die ihm nicht gehört.
   */
  readonly ladeProfil: (userId: string) => Promise<Isolation | undefined>
}

/**
 * Zählt die Administratoren.
 *
 * Siehe die Begründung an {@link AuthSpeicher.anzahlAdmins}: die Frage „ist noch
 * jemand da, der verwalten darf?" ist nicht dieselbe wie „gibt es Konten?".
 *
 * @param sql - der Datenbankzugang
 * @returns die Zahl der Konten mit der Rolle `admin`
 */
export async function zaehleAdmins(sql: SqlZugang): Promise<number> {
  // `::int` und nicht blank: `count` kommt als **Text** zurück (bigint paßt nicht
  // in eine JavaScript-Zahl), und `Number('3')` wäre eine Umdeutung an der
  // falschen Stelle.
  const gefunden = await zeilen<{ n: number }>(
    sql,
    `SELECT count(*)::int AS n FROM users WHERE role = 'admin'`,
  )
  return gefunden[0]?.n ?? 0
}

/**
 * Baut alle drei Speicher über **einem** Zugang.
 *
 * **Warum eine gemeinsame Erzeugung.** So gibt es genau eine Stelle, an der
 * festgelegt ist, daß Benutzer, Sitzungen und Spur **dieselbe** Datenbank sind.
 * Drei getrennt gebaute Speicher über drei Zugänge wären drei Gelegenheiten,
 * versehentlich in zwei Datenbanken zu schreiben — und eine Anmeldung, deren
 * Sitzung in einer anderen Datenbank liegt als ihr Benutzer, fällt erst beim
 * nächsten Neustart auf.
 *
 * @param sql - der Datenbankzugang
 * @returns die drei Speicher
 */
export function erzeugeSpeicher(sql: SqlZugang): AuthSpeicher {
  return {
    benutzer: erzeugeUserStore(sql),
    sitzungen: erzeugeSessionStore(sql),
    spur: erzeugeSpurensenke(sql),
    anzahlAdmins: () => zaehleAdmins(sql),
    ladeProfil: (userId) => ladeProfil(sql, userId),
  }
}
