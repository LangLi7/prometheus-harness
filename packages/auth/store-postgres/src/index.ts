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
import type { NeuerEintrag, SchluesselAblage, SchluesselEintrag } from '@prometheus-harness/apikey'

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
// Der Mandant — der Aufrufer, der `pmh.user_id` setzt
// ---------------------------------------------------------------------------

/**
 * Ein Zugang, der **Transaktionen** kann. Der echte Treiber (`postgres`) erfüllt das;
 * eine Attrappe ohne `begin` erfüllt es **nicht** — und das ist Absicht.
 *
 * **Warum `begin` nicht in {@link SqlZugang} steht.** Jede bestehende Attrappe und jeder
 * Aufrufer bliebe sonst gezwungen, eine Transaktion nachzubilden, die er nicht braucht.
 * Der Mandant ist der **einzige** Vorgang, der sie wirklich verlangt.
 */
export interface TransaktionsZugang extends SqlZugang {
  begin<T>(arbeit: (innerhalb: SqlZugang) => Promise<T>): Promise<T>
}

/**
 * Führt `arbeit` in **einer** Transaktion aus, mit gesetztem Mandanten.
 *
 * ## Warum es das gibt
 *
 * Die Mandantentrennung ist auf der Struktur belegt (zusammengesetzte Fremdschlüssel,
 * Migration 0004) und das **Verhalten** von Row Level Security ist gemessen
 * (`docs/status/mandantentrennung.md` §13, `tests/fixtures/rls-behavior.sql`):
 * mit Mandant sieht eine Rolle **nur** ihre Zeilen, ohne Mandant **keine**.
 *
 * **Aber es gab keinen Aufrufer, der den Mandanten setzt.** Genau deshalb blieb RLS aus:
 * ohne Aufrufer filtert es still alles weg. Diese Funktion ist dieser Aufrufer.
 *
 * ## Der Wert heißt `true` — und das ist der ganze Punkt
 *
 * ```sql
 * select set_config('pmh.user_id', $1, true)   -- drittes Argument: is_local
 * ```
 *
 * `true` bindet den Wert an die **Transaktion**. Ohne ihn bliebe der Mandant in der
 * **Verbindung** stehen — und weil Verbindungen aus einem Vorrat wiederverwendet werden,
 * liefe die nächste Abfrage unter dem **vorigen** Benutzer. Das wäre schlimmer als kein
 * Mandant: es wäre ein **fremder**.
 *
 * ## Ohne Transaktion wird **geworfen**, nicht geschwiegen
 *
 * Fehlt `begin`, bricht die Funktion mit einer Begründung ab. Ein stiller Rückfall — etwa
 * „dann setzen wir ihn eben sitzungsweit" — würde genau das Leck erzeugen, das diese
 * Funktion verhindern soll.
 *
 * @param sql - Zugang **mit** `begin` (der echte Treiber).
 * @param userId - der Mandant; die Policy castet ihn auf `uuid`.
 * @param arbeit - was innerhalb der Transaktion geschehen soll. **Jede** Abfrage darin
 *   läuft unter dem Mandanten — auch die, die ihn vergessen würde.
 */
export async function mitMandant<T>(
  sql: SqlZugang,
  userId: string,
  arbeit: (innerhalb: SqlZugang) => Promise<T>,
): Promise<T> {
  const kandidat = sql as Partial<TransaktionsZugang>
  if (typeof kandidat.begin !== 'function') {
    throw new Error(
      'mitMandant braucht einen Zugang mit `begin` (Transaktion). Ohne Transaktion wäre ' +
        '`set_config(…, true)` nicht auf sie begrenzt; der Mandant bliebe in der Verbindung ' +
        'stehen und die nächste Abfrage liefe unter einem anderen Benutzer.',
    )
  }
  return await kandidat.begin(async (innerhalb) => {
    await innerhalb.unsafe(`select set_config('pmh.user_id', $1, true)`, [userId])
    return await arbeit(innerhalb)
  })
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
  // gibt — und die Probe `tests/fixtures/user-profiles.sql` weist nach, daß sie
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

// ---------------------------------------------------------------------------
// API-Schlüssel
// ---------------------------------------------------------------------------

/**
 * Die Ablage für `api_keys`.
 *
 * ## Warum der Suchweg über `key_id` geht und nicht über den Hash
 *
 * Ein HMAC läßt sich nicht indizieren, ohne ihn zu berechnen. Der Schlüssel
 * **nennt** seine Kennung selbst (`pmh_<key_id>_<secret>`), und das Schema hat
 * dafür einen eigenen Index: `api_keys_live_idx ON api_keys (key_id) WHERE
 * revoked_at IS NULL`. Die Prüfung ist damit **ein** Zugriff über einen Index und
 * nicht ein Durchlauf über alle Schlüssel.
 *
 * **Was die Kennung nicht ist: ein Geheimnis.** Sie steht im Klartext in der
 * Tabelle und im Anzeigepräfix — sie dient dem Finden und dem Unterschieden, nicht
 * dem Beweisen. Das beweist das Geheimnis, und das steht nirgends.
 *
 * ## Warum `id` hier vergeben wird
 *
 * `gen_random_uuid()` und nicht vom Aufrufer: der Primärschlüssel ist die Sache
 * der Tabelle. Bei den Einmal-Token ist es umgekehrt, und das hat einen Grund —
 * `verbrauche` führt die Kennung als Bedingung.
 *
 * @param sql - der Datenbankzugang
 * @returns die Ablage
 */
export function erzeugeApiKeyAblage(sql: SqlZugang): SchluesselAblage {
  return {
    async legeAb(eintrag: NeuerEintrag): Promise<void> {
      await ausfuehren(
        sql,
        `INSERT INTO api_keys (id, user_id, key_id, token_hash, display_prefix, name, scopes, expires_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)`,
        [
          eintrag.userId,
          eintrag.keyId,
          eintrag.tokenHash,
          eintrag.displayPrefix,
          eintrag.name,
          eintrag.scopes,
          eintrag.laeuftAb,
        ],
      )
    },

    async finde(keyId: string): Promise<SchluesselEintrag | undefined> {
      const gefunden = await zeilen<{
        id: string
        user_id: string
        key_id: string
        token_hash: string
        display_prefix: string
        name: string
        scopes: string[]
        expires_at: unknown
        revoked_at: unknown
      }>(
        sql,
        `SELECT id, user_id, key_id, token_hash, display_prefix, name, scopes, expires_at, revoked_at
           FROM api_keys WHERE key_id = $1`,
        [keyId],
      )
      const zeile = gefunden[0]
      if (zeile === undefined) return undefined
      // **`undefined` und nicht `null`, und das Feld wird nur gesetzt, wenn es
      // etwas zu setzen gibt.** Die Schnittstelle fragt `widerrufenAm !==
      // undefined`; ein `null` wäre ein zweiter Zustand für dieselbe Sache. Und
      // `exactOptionalPropertyTypes` läßt `widerrufenAm: undefined` nicht zu —
      // das ist gut so: „das Feld fehlt" und „das Feld ist leer" sind zwei
      // Aussagen, und der Typprüfer zwingt zur Entscheidung.
      const widerrufenAm =
        zeile.revoked_at === null || zeile.revoked_at === undefined ? undefined : new Date(alsIso(zeile.revoked_at))
      return {
        id: zeile.id,
        userId: zeile.user_id,
        keyId: zeile.key_id,
        tokenHash: zeile.token_hash,
        displayPrefix: zeile.display_prefix,
        name: zeile.name,
        scopes: zeile.scopes,
        laeuftAb: new Date(alsIso(zeile.expires_at)),
        ...(widerrufenAm === undefined ? {} : { widerrufenAm }),
      }
    },

    async merkeBenutzt(keyId: string, at: Date): Promise<void> {
      await ausfuehren(sql, `UPDATE api_keys SET last_used_at = $2 WHERE key_id = $1`, [keyId, at.toISOString()])
    },
  }
}

/**
 * Widerruft einen Schlüssel.
 *
 * **Wiederholbar und ohne Wirkung auf einen bereits widerrufenen:** die Bedingung
 * `revoked_at IS NULL` sorgt dafür, daß der **erste** Widerruf gewinnt und der
 * Grund nicht später überschrieben wird. Sonst könnte ein zweiter Aufruf die
 * Begründung des ersten verwischen — und die Begründung ist das, was nach einem
 * Vorfall zählt.
 *
 * @param sql - der Datenbankzugang
 * @param keyId - die Kennung des Schlüssels
 * @param grund - warum; landet in `revoked_reason`
 * @param at - der Zeitpunkt
 * @returns ob **dieser** Aufruf widerrufen hat
 */
export async function widerrufeApiSchluessel(
  sql: SqlZugang,
  keyId: string,
  grund: string,
  at: Date,
): Promise<boolean> {
  const getroffen = await zeilen<{ id: string }>(
    sql,
    `UPDATE api_keys SET revoked_at = $2, revoked_reason = $3
      WHERE key_id = $1 AND revoked_at IS NULL
      RETURNING id`,
    [keyId, at.toISOString(), grund],
  )
  return getroffen.length === 1
}

/** Eine Zeile für die Anzeige — **ohne** Hash und ohne Geheimnis. */
export interface SchluesselAnzeige {
  readonly keyId: string
  readonly displayPrefix: string
  readonly name: string
  readonly scopes: readonly string[]
  readonly erstelltAm: string
  readonly laeuftAb: string
  readonly benutztAm?: string
  readonly widerrufenAm?: string
  readonly widerrufenGrund?: string
}

/**
 * Listet die Schlüssel eines Benutzers auf.
 *
 * **Ohne `token_hash`.** Diese Auskunft soll man zeigen können; ein Hash in einer
 * Bildschirmausgabe ist ein Geheimnis an einer Stelle, an der es nichts zu suchen
 * hat. Wer den Hash braucht, holt ihn über {@link erzeugeApiKeyAblage}.
 *
 * @param sql - der Datenbankzugang
 * @param userId - wessen Schlüssel
 * @returns die Zeilen, neueste zuerst
 */
export async function listeApiSchluessel(sql: SqlZugang, userId: string): Promise<readonly SchluesselAnzeige[]> {
  const gefunden = await zeilen<{
    key_id: string
    display_prefix: string
    name: string
    scopes: string[]
    created_at: unknown
    expires_at: unknown
    last_used_at: unknown
    revoked_at: unknown
    revoked_reason: string | null
  }>(
    sql,
    `SELECT key_id, display_prefix, name, scopes, created_at, expires_at, last_used_at, revoked_at, revoked_reason
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  )
  const zeit = (w: unknown): string | undefined => (w === null || w === undefined ? undefined : alsIso(w))
  // **Die Felder werden nur gesetzt, wenn es sie gibt.** `exactOptionalPropertyTypes`
  // verbietet `benutztAm: undefined` — und das ist kein Formalismus: „nie benutzt"
  // und „Feld nicht mitgeschickt" sind zwei Aussagen, und der Typprüfer zwingt
  // hier zur Entscheidung, statt beide zu vermischen.
  return gefunden.map((z) => {
    const zeile: {
      keyId: string
      displayPrefix: string
      name: string
      scopes: readonly string[]
      erstelltAm: string
      laeuftAb: string
      benutztAm?: string
      widerrufenAm?: string
      widerrufenGrund?: string
    } = {
      keyId: z.key_id,
      displayPrefix: z.display_prefix,
      name: z.name,
      scopes: z.scopes,
      erstelltAm: alsIso(z.created_at),
      laeuftAb: alsIso(z.expires_at),
    }
    const benutzt = zeit(z.last_used_at)
    if (benutzt !== undefined) zeile.benutztAm = benutzt
    const widerrufen = zeit(z.revoked_at)
    if (widerrufen !== undefined) zeile.widerrufenAm = widerrufen
    if (z.revoked_reason !== null) zeile.widerrufenGrund = z.revoked_reason
    return zeile
  })
}

// ---------------------------------------------------------------------------
// Der Wissensspeicher (D1)
// ---------------------------------------------------------------------------

/**
 * Der Zugang zu `documents` und `chunks`.
 *
 * ## Die eine Regel, die diesen Speicher ausmacht: `user_id` ist immer dabei
 *
 * **Jede** Abfrage in dieser Datei trägt `user_id` in der WHERE-Klausel — auch
 * die Suche. Der zusammengesetzte Fremdschlüssel aus Migration 0006 verhindert
 * Übergriffe beim **Schreiben**; beim **Lesen** verhindert er **nichts**. Genau
 * deshalb steht der Mandant hier in jeder Abfrage und nicht in der Verantwortung
 * des Aufrufers: was nicht abgefragt werden kann, kann auch nicht vergessen
 * werden.
 *
 * **Und deshalb nimmt keine Funktion dieser Datei eine Kennung ohne den
 * Mandanten entgegen.** Wer ein Dokument lesen will, nennt **beides**.
 *
 * ## Was hier NICHT passiert
 *
 * **Kein Zerlegen und kein Einbetten.** Wie ein Text in Stücke geschnitten wird,
 * ist eine eigene Entscheidung (Überlappung, Größe, Grenzen an Absätzen), und ein
 * Modell wird hier nicht gerufen. Diese Datei **legt ab**, was ihr gegeben wird,
 * und **sucht** darin.
 *
 * @param sql - der Datenbankzugang
 * @returns der Speicher
 */
export function erzeugeWissensspeicher(sql: SqlZugang): Wissensspeicher {
  return {
    async legeDokumentAb(eintrag: NeuesDokument): Promise<string> {
      // **`angelegt` und nicht `zeilen`.** Der erste Entwurf hieß `zeilen` — und
      // damit wie die Modul-Hilfsfunktion, die er aufruft. Der Aufruf traf die
      // eigene, noch nicht initialisierte Variable:
      // `ReferenceError: Cannot access 'zeilen' before initialization`. Ein Name,
      // der eine Funktion verdeckt, die man in derselben Zeile braucht.
      const angelegt = await zeilen<{ id: string }>(
        sql,
        `INSERT INTO documents (id, user_id, workspace_id, kind, source_path, title, content_hash, bytes)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          eintrag.userId,
          eintrag.workspaceId ?? null,
          eintrag.art,
          eintrag.herkunft ?? null,
          eintrag.titel,
          eintrag.inhaltsHash ?? null,
          eintrag.bytes ?? null,
        ],
      )
      const neu = angelegt[0]?.id
      if (neu === undefined) throw new Error('das Dokument wurde nicht angelegt')
      return neu
    },

    async legeStueckeAb(userId: string, stuecke: readonly NeuesStueck[]): Promise<number> {
      if (stuecke.length === 0) return 0
      // **EIN `INSERT` mit mehreren Zeilen — und das ist der Punkt.**
      //
      // Der erste Entwurf schickte `BEGIN`, dann einen `INSERT` je Stück, dann
      // `COMMIT` — und bekam vom Treiber:
      //
      //     UNSAFE_TRANSACTION: Only use sql.begin, sql.reserved or max: 1
      //
      // postgres.js **verbietet** ein von Hand gesetztes `BEGIN` auf einem Pool,
      // und es hat recht: die drei Anweisungen könnten auf drei verschiedenen
      // Verbindungen landen, und die Transaktion wäre keine. Ein einzelner
      // `INSERT` mit mehreren `VALUES`-Zeilen ist dagegen **von sich aus** atomar
      // — ganz ohne Transaktion.
      //
      // **Die Grenze, die dabeisteht:** PostgreSQL nimmt höchstens 65 535
      // Parameter je Anweisung; hier sind es sechs je Stück, also rund 10 900
      // Stücke in einem Aufruf. Wer mehr ablegen will, ruft mehrfach auf — dann
      // ist der Aufruf die Einheit, nicht das Dokument.
      const platzhalter: string[] = []
      const werte: unknown[] = []
      for (const [i, stueck] of stuecke.entries()) {
        const b = i * 6
        platzhalter.push(
          `(gen_random_uuid(), $${String(b + 1)}, $${String(b + 2)}, $${String(b + 3)}, ` +
            `$${String(b + 4)}, $${String(b + 5)}, $${String(b + 6)})`,
        )
        werte.push(
          userId,
          stueck.dokumentId,
          stueck.ordnung,
          stueck.inhaltVerschluesselt,
          stueck.token ?? null,
          // **Der Vektor ist hier immer `NULL`** — ein Stück entsteht ohne
          // Einbettung und wird später eingebettet (`setzeEinbettung`). Das ist
          // kein Mangel, sondern die Reihenfolge: erst der Text, dann das Modell.
          null,
        )
      }
      await ausfuehren(
        sql,
        `INSERT INTO chunks (id, user_id, document_id, ordinal, content_cipher, tokens, embedding)
         VALUES ${platzhalter.join(', ')}`,
        werte,
      )
      return stuecke.length
    },

    async findeDokument(userId: string, dokumentId: string): Promise<DokumentZeile | undefined> {
      const gefunden = await zeilen<{
        id: string
        workspace_id: string | null
        kind: string
        source_path: string | null
        title: string
        content_hash: string | null
        bytes: number | null
        created_at: unknown
      }>(
        sql,
        `SELECT id, workspace_id, kind, source_path, title, content_hash, bytes, created_at
           FROM documents
          WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [dokumentId, userId],
      )
      const z = gefunden[0]
      if (z === undefined) return undefined
      // **Die wahlfreien Felder werden nur gesetzt, wenn es sie gibt.**
      // `exactOptionalPropertyTypes` läßt `workspaceId: undefined` nicht zu — und
      // das ist richtig so: „gehört zu keinem Arbeitsbereich" und „das Feld wurde
      // nicht mitgeschickt" sind zwei Aussagen. Derselbe Fall wie bei den
      // API-Schlüsseln; er schlägt hier auf **zwei** Pakete durch, weil
      // `api/auth-http` den Speicher mittypprüft.
      return {
        id: z.id,
        art: z.kind,
        titel: z.title,
        erstelltAm: alsIso(z.created_at),
        ...(z.workspace_id === null ? {} : { workspaceId: z.workspace_id }),
        ...(z.source_path === null ? {} : { herkunft: z.source_path }),
        ...(z.content_hash === null ? {} : { inhaltsHash: z.content_hash }),
        ...(z.bytes === null ? {} : { bytes: z.bytes }),
      }
    },

    async offeneStuecke(userId: string, grenze: number): Promise<readonly OffenesStueck[]> {
      // **Die Nacharbeit.** `embedding IS NULL` heißt „noch nicht eingebettet";
      // der Teilindex `chunks_offen_idx` ist genau für diese Abfrage da.
      const gefunden = await zeilen<{ id: string; document_id: string; ordinal: number; content_cipher: unknown }>(
        sql,
        `SELECT id, document_id, ordinal, content_cipher
           FROM chunks
          WHERE user_id = $1 AND embedding IS NULL
          ORDER BY document_id, ordinal
          LIMIT $2`,
        [userId, grenze],
      )
      return gefunden.map((z) => ({
        id: z.id,
        dokumentId: z.document_id,
        ordnung: z.ordinal,
        inhaltVerschluesselt: Buffer.isBuffer(z.content_cipher)
          ? new Uint8Array(z.content_cipher)
          : new Uint8Array(),
      }))
    },

    async setzeEinbettung(
      userId: string,
      stueckId: string,
      vektor: readonly number[],
      modell: string,
      at: Date,
    ): Promise<boolean> {
      if (vektor.length === 0) throw new Error('ein leerer Vektor ist keine Einbettung')
      const getroffen = await zeilen<{ id: string }>(
        sql,
        `UPDATE chunks
            SET embedding = $3::vector, embedding_model = $4, embedded_at = $5
          WHERE id = $1 AND user_id = $2
          RETURNING id`,
        [stueckId, userId, vektorZuText(vektor), modell, at.toISOString()],
      )
      return getroffen.length === 1
    },

    async suche(userId: string, anfrage: SucheAnfrage): Promise<readonly Treffer[]> {
      if (anfrage.vektor.length === 0) throw new Error('ein leerer Vektor kann nichts finden')
      const grenze = anfrage.grenze ?? 10
      // **Der Mandant steht in der WHERE-Klausel, nicht in der ORDER BY.** Er
      // schränkt die Kandidaten ein, bevor sortiert wird — nachträglich zu filtern
      // hieße, fremde Zeilen zu lesen und dann wegzuwerfen.
      const gefunden = await zeilen<{
        id: string
        document_id: string
        ordinal: number
        aehnlichkeit: number
      }>(
        sql,
        `SELECT c.id, c.document_id, c.ordinal,
                1 - (c.embedding <=> $2::vector) AS aehnlichkeit
           FROM chunks c
          WHERE c.user_id = $1 AND c.embedding IS NOT NULL
          ORDER BY c.embedding <=> $2::vector
          LIMIT $3`,
        [userId, vektorZuText(anfrage.vektor), grenze],
      )
      return gefunden.map((z) => ({
        stueckId: z.id,
        dokumentId: z.document_id,
        ordnung: z.ordinal,
        aehnlichkeit: z.aehnlichkeit,
      }))
    },
  }
}

/**
 * Wandelt Zahlen in die Textform, die pgvector versteht.
 *
 * **Warum Text und kein Array.** Der Treiber schickt ein JavaScript-Array als
 * `numeric[]`; pgvector erwartet seine eigene Eingabeform `[1,2,3]`. Ein Cast
 * `$1::vector` auf einem Array scheitert — gemessen wird das nicht hier, sondern
 * in der Prüfung, die die Suche gegen die echte Datenbank fährt.
 *
 * **Kein `toFixed` und keine Rundung.** Was hereinkommt, geht hinaus; eine
 * stillschweigende Rundung wäre eine Änderung am Vektor.
 *
 * @param vektor - die Zahlen
 * @returns die Textform
 */
export function vektorZuText(vektor: readonly number[]): string {
  return `[${vektor.map((x) => String(x)).join(',')}]`
}

/** Ein neues Dokument. */
export interface NeuesDokument {
  readonly userId: string
  readonly workspaceId?: string
  readonly art: string
  readonly herkunft?: string
  readonly titel: string
  readonly inhaltsHash?: string
  readonly bytes?: number
}

/** Ein neues Textstück. */
export interface NeuesStueck {
  readonly dokumentId: string
  readonly ordnung: number
  /** **Verschlüsselt.** Der Speicher sieht keinen Klartext — siehe `content_cipher`. */
  readonly inhaltVerschluesselt: Uint8Array
  readonly token?: number
}

/** Ein gelesenes Dokument. */
export interface DokumentZeile {
  readonly id: string
  readonly workspaceId?: string
  readonly art: string
  readonly herkunft?: string
  readonly titel: string
  readonly inhaltsHash?: string
  readonly bytes?: number
  readonly erstelltAm: string
}

/** Ein Stück, das noch keine Einbettung hat. */
export interface OffenesStueck {
  readonly id: string
  readonly dokumentId: string
  readonly ordnung: number
  readonly inhaltVerschluesselt: Uint8Array
}

/** Eine Suchanfrage. */
export interface SucheAnfrage {
  readonly vektor: readonly number[]
  readonly grenze?: number
}

/** Ein Treffer. */
export interface Treffer {
  readonly stueckId: string
  readonly dokumentId: string
  readonly ordnung: number
  /** Kosinus-Ähnlichkeit: `1 - Abstand`, also 1 = gleich, 0 = orthogonal. */
  readonly aehnlichkeit: number
}

/** Der Wissensspeicher. */
export interface Wissensspeicher {
  legeDokumentAb(eintrag: NeuesDokument): Promise<string>
  legeStueckeAb(userId: string, stuecke: readonly NeuesStueck[]): Promise<number>
  findeDokument(userId: string, dokumentId: string): Promise<DokumentZeile | undefined>
  offeneStuecke(userId: string, grenze: number): Promise<readonly OffenesStueck[]>
  setzeEinbettung(userId: string, stueckId: string, vektor: readonly number[], modell: string, at: Date): Promise<boolean>
  suche(userId: string, anfrage: SucheAnfrage): Promise<readonly Treffer[]>
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

// ---------------------------------------------------------------------------
// Die Zugriffspfade eines Arbeitsbereichs
// ---------------------------------------------------------------------------
// **Eigene Datei, hier nur ausgeführt.** `ladeWurzeln` übersetzt `workspace_folders` in die
// Form, die der Sandkasten versteht: **eine** Hauptwurzel und die Zusatzordner, getrennt nach
// Lesen und Schreiben.
//
// **Der Ringbezug ist Absicht und harmlos.** `roots.ts` holt `mitMandant` von hier, und hier
// wird `ladeWurzeln` von dort geholt. In ES-Modulen sind **Funktionsdeklarationen** gehoben und
// stehen damit auch während des Ladens bereit — geprüft wird das von
// `tests/roots.test.ts`, das über den Paketeingang importiert.
export { ladeWurzeln, schreibbareWurzeln, type Wurzeln } from './roots.ts'

// ---------------------------------------------------------------------------
// Quellordner ändern
// ---------------------------------------------------------------------------
// **Auch nur ausgeführt.** `folders.ts` benutzt die Regeln der Datenbank (genau ein
// Arbeitsplatz, der Arbeitsplatz ist schreibbar) und die Naht `mitMandant`.
export {
  entferneOrdner,
  ladeZugriffspfade,
  legeOrdnerAn,
  listeOrdner,
  setzeZugriff,
  type Ordner,
  type Zugriff,
} from './folders.ts'
