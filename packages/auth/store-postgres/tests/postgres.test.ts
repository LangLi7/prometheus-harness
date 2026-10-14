/**
 * Integrationstest gegen ein **echtes** PostgreSQL.
 *
 * ## Was hier bewiesen wird
 *
 * Dieser Test führt die **Regeln des Regelkerns** (`@prometheus-harness/auth`)
 * gegen **unser Schema** aus. Bis heute lag beides getrennt: 51 Prüfungen im
 * Regelkern, eine Datenbank mit 11 Tabellen — und **kein Stück Code, das beides
 * verbindet**. Ein Regelkern ohne Aufrufer ist eine Behauptung.
 *
 * Geprüft wird die **ganze Kette**: anmelden → Sitzung anlegen → prüfen →
 * fortschreiben → rotieren → abmelden, jedes Mal mit einem Blick in die
 * Datenbank. Was ein Attrappentest nicht zeigen kann, steht hier: ob die
 * Spaltennamen stimmen, ob `inet` das annimmt, was wir schicken, und ob die
 * Fremdschlüssel greifen.
 *
 * ## Warum er nur mit einer Datenbank läuft — und das meldet
 *
 * Ohne `PMH_TEST_DATABASE_URL` wird er **übersprungen** und sagt das. Ein Test,
 * der ohne Infrastruktur „grün" ist, ohne etwas geprüft zu haben, ist schlimmer
 * als kein Test.
 *
 * ## Warum er die Tabellen **nicht** wegwirft
 *
 * Anders als der Integrationstest des Schemas (`packages/auth/db-schema`) räumt
 * dieser Test nichts ab. Er legt seine eigenen Benutzer unter einer eigenen
 * Adressendung an (`@storetest.invalid`) und löscht **nur diese** wieder. Der
 * Unterschied ist Absicht: ein Test, der `DROP TABLE` braucht, kann nicht gegen
 * dieselbe Datenbank laufen wie ein zweiter — und dann laufen beide nicht.
 *
 * ## Die Adresse gehört auf eine **Wegwerf-Datenbank**
 *
 * Aufruf (die Datenbank `pmh_test` wird von `packages/auth/db-schema` mit
 * angelegt; siehe `docs/status/mandantentrennung.md` §10):
 *
 * ```
 * $env:PMH_TEST_DATABASE_URL = 'postgres://pmh_owner:…@127.0.0.1:5432/pmh_test'
 * bun test packages/auth/store-postgres/tests/postgres.test.ts
 * ```
 *
 * **Warum das wichtig ist.** Der Integrationstest des Schemas beginnt mit
 * `DROP TABLE … CASCADE`. Läuft er gegen die Betriebsdatenbank, räumt er sie ab —
 * Befund **M-1** in `docs/status/mandantentrennung.md`.
 *
 * ## Der Hinweis, der hier stehen muß: dieselbe Prüfung gibt es zweimal
 *
 * Die Bedingung „ist eine brauchbare Adresse gesetzt" steht hier **und** in
 * `packages/auth/db-schema/tests/postgres.test.ts`. Das ist eine Doppelung, und
 * sie ist nicht schön. Sie ist hingenommen, weil es zwischen zwei Testordnern
 * zweier Pakete keinen Aufhängepunkt gibt, den man importieren könnte, ohne ein
 * eigenes Hilfspaket anzulegen. **Offener Punkt:** ein gemeinsames Prüfhilfspaket
 * für die Integrationstests.
 *
 * @module @prometheus-harness/store-postgres/tests
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import postgres from 'postgres'
import {
  Argon2PasswordHasher,
  authenticate,
  createSession,
  register,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  SessionError,
  touchSession,
  verifySession,
  type SessionRecord,
} from '@prometheus-harness/auth'
import { migrate, type MigrationTarget } from '@prometheus-harness/db-schema'
import { erzeugeSpeicher, mitMandant, type SqlZugang } from '../src/index.ts'

// ---------------------------------------------------------------------------
// Zugang
// ---------------------------------------------------------------------------

const URL_FROM_ENV = process.env.PMH_TEST_DATABASE_URL

/**
 * Ist eine Testadresse **brauchbar** — nicht nur „vorhanden"?
 *
 * `=== undefined` genügt **nicht**: ein **leerer** Wert ist nicht `undefined`.
 * Gemessen (Befund M-2): `postgres("")` ist nicht wirkungslos — der Treiber fällt
 * auf die Umgebungsvorgaben zurück und baut einen **echten** Verbindungsversuch
 * mit dem Windows-Benutzer als Datenbankbenutzer.
 */
function adresseGesetzt(adresse: string | undefined): adresse is string {
  return adresse !== undefined && adresse.trim() !== ''
}

const OHNE_ZUGANG = adresseGesetzt(URL_FROM_ENV)
  ? undefined
  : URL_FROM_ENV === undefined
    ? 'PMH_TEST_DATABASE_URL ist nicht gesetzt'
    : 'PMH_TEST_DATABASE_URL ist gesetzt, aber LEER'

if (OHNE_ZUGANG !== undefined) {
  process.stderr.write(
    `HINWEIS: Speicher-Prüfungen übersprungen — ${OHNE_ZUGANG}.\n` +
      '  Die Regeln der Anmeldung sind davon unberührt (sie haben eigene Prüfungen).\n' +
      '  Was hier fehlt, ist der Beweis gegen echte Spalten und echte Fremdschlüssel.\n',
  )
}

const run = adresseGesetzt(URL_FROM_ENV) ? describe : describe.skip

/** Die Adressendung, mit der dieser Test seine Daten wiederfindet. */
const TESTDOMAENE = '@storetest.invalid'

/** Ein kräftiges Passwort, das die Regeln des Kerns bestehen. */
const PASSWORT = 'Korrektheit-ist-kein-Zufall-2026'

let sql: postgres.Sql
let zugang: SqlZugang

beforeAll(async () => {
  if (!adresseGesetzt(URL_FROM_ENV)) return
  sql = postgres(URL_FROM_ENV, { max: 2, onnotice: () => undefined })

  // ---------------------------------------------------------------------------
  // DIE SICHERUNG: niemals gegen die Betriebsdatenbank
  // ---------------------------------------------------------------------------
  // **Warum sie hier steht und nicht in einer Anleitung.**
  //
  // Am 13.10.2026 gemessen: in `pmh.auth_events` standen drei Zeilen, die
  // **beweisbar** aus diesem Test stammen — `user_agent = 'Prüfgerät'`,
  // `ip = 203.0.113.7` und `203.0.113.9`. Dieser Test sollte gegen `pmh_test`
  // laufen. Mindestens ein Lauf hat also in die **Betriebsdatenbank**
  // geschrieben.
  //
  // ```
  // docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc \
  //   "select kind, host(ip), user_agent from pmh.auth_events where user_agent='Prüfgerät';"
  // ```
  //
  // **Die Ursache ist nicht belegt** — und sie muß es auch nicht sein. Der
  // Schaden wäre nicht das Schreiben, sondern das **Löschen**: der
  // Integrationstest des Schemas beginnt mit `DROP TABLE … CASCADE` (Befund
  // **M-1**), und dieselbe Verwechslung hätte die Betriebsdatenbank abgeräumt.
  //
  // Deshalb wird hier **vor** allem anderen geprüft, worauf die Verbindung
  // zeigt. Der Vergleich ist nicht „heißt die Datenbank `_test`?" — eine
  // Namensregel ist eine Konvention, die jemand brechen kann. Verglichen wird
  // mit **derselben Angabe, die die Anwendung benutzt**: `DATABASE_URL`. Zeigen
  // beide auf dieselbe Datenbank, ist der Lauf ein Fehler und kein Testlauf.
  const angabe = await sql.unsafe<{ db: string; benutzer: string }[]>(
    'SELECT current_database() AS db, current_user AS benutzer',
  )
  const hier = angabe[0]?.db ?? '?'

  const betrieb = process.env.DATABASE_URL
  if (adresseGesetzt(betrieb)) {
    const nameDerAnwendung = new URL(betrieb).pathname.replace(/^\//u, '')
    if (nameDerAnwendung !== '' && nameDerAnwendung === hier) {
      await sql.end({ timeout: 5 })
      throw new Error(
        `ABBRUCH: dieser Test schreibt Daten und zeigt auf „${hier}" — dieselbe Datenbank wie die Anwendung ` +
          `(DATABASE_URL). Er ist für eine Wegwerf-Datenbank gedacht: ` +
          `setze PMH_TEST_DATABASE_URL auf eine andere Datenbank (siehe docs/status/mandantentrennung.md §10).`,
      )
    }
  }

  zugang = {
    async unsafe(anweisung: string, werte: readonly unknown[] = []): Promise<unknown> {
      // Die Umdeutung steht hier, weil der Treiber `ParameterOrJSON<never>[]`
      // verlangt und diese Datei mit `unknown` arbeitet. `never[]` ist die
      // Verengung, die der Treiber sehen will — und sie steht an **einer** Stelle.
      return await sql.unsafe(anweisung, werte as never[])
    },
  }
  // **Erst das Schema, dann die Prüfung.** Dieser Test darf nicht davon abhängen,
  // ob ein anderer Test vorher gelaufen ist — die Reihenfolge der Dateien in einem
  // Suite-Lauf ist nicht zugesichert. `migrate` ist wiederholbar: ist alles
  // angewendet, tut es nichts.
  //
  // **Zwei verschiedene Schnittstellen, und das ist Absicht.** Der Migrationsläufer
  // braucht `exec` **und** `query` (er liest die Fassungstabelle und schreibt in
  // sie); der Speicher braucht nur `unsafe`. Sie zusammenzulegen hieße, dem
  // Speicher Fähigkeiten zu geben, die er nicht hat.
  const migrationsZiel: MigrationTarget = {
    async exec(anweisung: string): Promise<void> {
      await sql.unsafe(anweisung)
    },
    async query<T>(anweisung: string, werte: readonly unknown[] = []): Promise<readonly T[]> {
      return (await sql.unsafe(anweisung, werte as never[])) as readonly T[]
    },
  }
  await migrate(migrationsZiel)
  await sql.unsafe(`DELETE FROM users WHERE email LIKE $1`, [`%${TESTDOMAENE}`])
})

afterAll(async () => {
  if (!adresseGesetzt(URL_FROM_ENV)) return
  // Nur die eigenen Daten. Alles andere in dieser Datenbank gehört einem anderen
  // Test, und ein Test, der fremde Daten abräumt, macht den anderen unbrauchbar.
  await sql.unsafe(`DELETE FROM users WHERE email LIKE $1`, [`%${TESTDOMAENE}`]).catch(() => undefined)
  await sql.end({ timeout: 5 })
})

// ---------------------------------------------------------------------------
// Die Kette
// ---------------------------------------------------------------------------

run('Anmeldung gegen die echte Datenbank', () => {
  test('registriert, meldet an und legt eine Sitzung an — die ganze Kette', async () => {
    const speicher = erzeugeSpeicher(zugang)
    const hasher = new Argon2PasswordHasher()

    // 1. Registrieren. `maxUsers` ausdrücklich hoch: diese Datenbank teilt sich
    //    dieser Test mit anderen, und eine Vorgabe wie „nur der erste Benutzer"
    //    machte den Test von der Reihenfolge der Testdateien abhängig.
    const angelegt = await register(speicher.benutzer, hasher, `ada${TESTDOMAENE}`, PASSWORT, 'Ada', {
      maxUsers: 100_000,
      sink: speicher.spur,
    })
    expect(angelegt.ok).toBe(true)
    if (!angelegt.ok) return

    // 2. Die Zeile steht wirklich in der Datenbank — mit Hash und ohne Klartext.
    const roh = await sql.unsafe<{ password_hash: string; display_name: string; role: string }[]>(
      `SELECT password_hash, display_name, role FROM users WHERE id = $1`,
      [angelegt.user.id],
    )
    expect(roh).toHaveLength(1)
    expect(roh[0]?.password_hash).toStartWith('$argon2id$')
    expect(roh[0]?.password_hash).not.toContain(PASSWORT)
    expect(roh[0]?.display_name).toBe('Ada')
    expect(roh[0]?.role).toBe('user')

    // 3. Anmelden.
    const anmeldung = await authenticate(
      speicher.benutzer,
      hasher,
      `ada${TESTDOMAENE}`,
      PASSWORT,
      speicher.spur,
      { ip: '203.0.113.7', userAgent: 'Prüfgerät' },
    )
    expect(anmeldung.ok).toBe(true)
    if (!anmeldung.ok) return
    expect(anmeldung.user.id).toBe(angelegt.user.id)

    // 4. Sitzung anlegen.
    const angelegteSitzung = await createSession(speicher.sitzungen, anmeldung.user.id, {
      userAgent: 'Prüfgerät',
      ip: '203.0.113.7',
    })
    expect(angelegteSitzung.token).not.toBe('')

    // **Was in der Datenbank stehen darf und was nicht.** Der Token geht ins
    // Cookie; in der Zeile steht **nur sein Hash**. Ein Datenbankleck ist damit
    // kein Sitzungsdiebstahl.
    const sitzungszeile = await sql.unsafe<{ token_hash: string; ip_first_seen: string }[]>(
      `SELECT token_hash, host(ip_first_seen) AS ip_first_seen FROM auth_sessions WHERE id = $1`,
      [angelegteSitzung.session.id],
    )
    expect(sitzungszeile[0]?.token_hash).not.toBe(angelegteSitzung.token)
    expect(sitzungszeile[0]?.token_hash).toHaveLength(64)

    // **Der `inet`-Übergang, am echten Server.** Die Adresse muß **genau** so
    // zurückkommen, wie sie hineinging. Mit `::text` kam hier `203.0.113.7/32`
    // zurück — die Netzmaske hängt an der Ausgabe. `host()` schneidet sie ab.
    expect(sitzungszeile[0]?.ip_first_seen).toBe('203.0.113.7')

    // 5. Prüfen. Und: alle Zeitpunkte sind **Text**, nicht `Date`.
    const geprueft = await verifySession(speicher.sitzungen, angelegteSitzung.token)
    expect(geprueft.session.id).toBe(angelegteSitzung.session.id)
    expect(typeof geprueft.session.createdAt).toBe('string')
    expect(geprueft.session.createdAt).toEndWith('Z')
    expect(geprueft.session.ipFirstSeen).toBe('203.0.113.7')
    expect(geprueft.session.revokedAt).toBeUndefined()
  })

  test('weist ein unbekanntes Passwort ab — und schreibt die Spur', async () => {
    const speicher = erzeugeSpeicher(zugang)
    const hasher = new Argon2PasswordHasher()
    await register(speicher.benutzer, hasher, `bob${TESTDOMAENE}`, PASSWORT, 'Bob', { maxUsers: 100_000 })

    const abgewiesen = await authenticate(
      speicher.benutzer,
      hasher,
      `bob${TESTDOMAENE}`,
      'falsch-aber-lang-genug-2026',
      speicher.spur,
      { ip: '203.0.113.9' },
    )
    expect(abgewiesen.ok).toBe(false)
    if (abgewiesen.ok) return
    expect(abgewiesen.reason).toBe('credentials-invalid')

    // Die Spur ist der Grund, warum es die Senke gibt: nach einem Vorfall läßt
    // sich die Frage „wurde ein Konto durchprobiert?" **abfragen**.
    const spur = await sql.unsafe<{ kind: string; ip: string | null }[]>(
      `SELECT kind, host(ip) AS ip FROM auth_events
        WHERE email = $1 AND kind = 'login-failed'
        ORDER BY id DESC LIMIT 1`,
      [`bob${TESTDOMAENE}`],
    )
    expect(spur).toHaveLength(1)
    expect(spur[0]?.ip).toBe('203.0.113.9')
  })

  test('legt keinen zweiten Benutzer mit derselben Adresse an', async () => {
    const speicher = erzeugeSpeicher(zugang)
    const hasher = new Argon2PasswordHasher()
    const erste = await register(speicher.benutzer, hasher, `cara${TESTDOMAENE}`, PASSWORT, 'Cara', {
      maxUsers: 100_000,
    })
    expect(erste.ok).toBe(true)

    const zweite = await register(speicher.benutzer, hasher, `cara${TESTDOMAENE}`, PASSWORT, 'Cara Zwei', {
      maxUsers: 100_000,
    })
    // Der Speicher schluckt **nur** die Eindeutigkeitsverletzung und gibt
    // `undefined` zurück — der Regelkern macht daraus seine eigene Antwort.
    expect(zweite.ok).toBe(false)

    const anzahl = await sql.unsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM users WHERE lower(email) = $1`,
      [`cara${TESTDOMAENE}`],
    )
    expect(anzahl[0]?.n).toBe(1)
  })

  test('findet einen Benutzer auch bei anderer Schreibweise der Adresse', async () => {
    // Der eindeutige Index liegt auf `lower(email)`. Wer gegen `email` sucht,
    // benutzt ihn nicht — und findet bei zwei Schreibweisen nichts, obwohl die
    // Datenbank sie als eine ansieht.
    const speicher = erzeugeSpeicher(zugang)
    const hasher = new Argon2PasswordHasher()
    await register(speicher.benutzer, hasher, `dora${TESTDOMAENE}`, PASSWORT, 'Dora', { maxUsers: 100_000 })

    const gefunden = await speicher.benutzer.findByEmail(`DORA${TESTDOMAENE}`)
    expect(gefunden).toBeDefined()
    expect(gefunden?.displayName).toBe('Dora')
  })

  test('läßt eine Sitzung für einen unbekannten Benutzer nicht zu', async () => {
    // Die Kette „Sitzung → Benutzer" ist ein Fremdschlüssel. Damit kann keine
    // Sitzung ohne Benutzer entstehen — und der Fehler ist **kein** stiller.
    const speicher = erzeugeSpeicher(zugang)
    const fehler = await createSession(
      speicher.sitzungen,
      '00000000-0000-4000-8000-0000000000ff',
    ).catch((ursache: unknown) => ursache)
    expect((fehler as { code?: string }).code).toBe('23503')
  })

  test('schreibt die Nutzung fort, ohne die Höchstfrist zu verschieben', async () => {
    const speicher = erzeugeSpeicher(zugang)
    const hasher = new Argon2PasswordHasher()
    const angelegt = await register(speicher.benutzer, hasher, `emil${TESTDOMAENE}`, PASSWORT, 'Emil', {
      maxUsers: 100_000,
    })
    if (!angelegt.ok) throw new Error('Registrierung mißlang')
    const sitzung = await createSession(speicher.sitzungen, angelegt.user.id)

    // **Die Ruhefrist wird fortgeschrieben, die Höchstfrist nicht.** Sonst ließe
    // sich die Höchstfrist durch bloßes Arbeiten unbegrenzt verlängern — und
    // genau dagegen ist sie da.
    const spaeter = () => new Date(Date.now() + 2 * 60 * 1000)
    const geprueft = await verifySession(speicher.sitzungen, sitzung.token, undefined, spaeter)
    expect(geprueft.shouldTouch).toBe(true)
    await touchSession(speicher.sitzungen, geprueft, undefined, spaeter)

    const nachher = await speicher.sitzungen.findById(sitzung.session.id)
    expect(new Date(nachher?.lastSeenAt ?? 0).getTime()).toBeGreaterThan(
      new Date(sitzung.session.lastSeenAt).getTime(),
    )
    expect(nachher?.absoluteExpiresAt).toBe(sitzung.session.absoluteExpiresAt)
  })

  test('macht beim Rotieren das alte Token ungültig und das neue gültig', async () => {
    const speicher = erzeugeSpeicher(zugang)
    const hasher = new Argon2PasswordHasher()
    const angelegt = await register(speicher.benutzer, hasher, `finn${TESTDOMAENE}`, PASSWORT, 'Finn', {
      maxUsers: 100_000,
    })
    if (!angelegt.ok) throw new Error('Registrierung mißlang')
    const alt = await createSession(speicher.sitzungen, angelegt.user.id)

    const neu = await rotateSession(speicher.sitzungen, alt.session)

    // Das **alte** Token gilt nicht mehr. Wer es trotzdem benutzt, ist der Fall
    // „gestohlenes Token" — und die Meldung darf sich nicht von „unbekannt"
    // unterscheiden, sonst verrät sie, daß es das Token einmal gab.
    const abgelehnt = await verifySession(speicher.sitzungen, alt.token).catch((u: unknown) => u)
    expect(abgelehnt).toBeInstanceOf(SessionError)

    const geprueft = await verifySession(speicher.sitzungen, neu.token)
    // Die **Kennung bleibt**; sonst wäre die Anzeige „wo bin ich angemeldet"
    // nach jeder Rotation eine andere Sitzung.
    expect(geprueft.session.id).toBe(alt.session.id)
  })

  test('widerruft eine Sitzung und alle Sitzungen eines Benutzers', async () => {
    const speicher = erzeugeSpeicher(zugang)
    const hasher = new Argon2PasswordHasher()
    const angelegt = await register(speicher.benutzer, hasher, `greta${TESTDOMAENE}`, PASSWORT, 'Greta', {
      maxUsers: 100_000,
    })
    if (!angelegt.ok) throw new Error('Registrierung mißlang')

    const eins = await createSession(speicher.sitzungen, angelegt.user.id)
    const zwei = await createSession(speicher.sitzungen, angelegt.user.id)

    await revokeSession(speicher.sitzungen, eins.session.id)
    const abgelehnt = await verifySession(speicher.sitzungen, eins.token).catch((u: unknown) => u)
    expect(abgelehnt).toBeInstanceOf(SessionError)

    // Die zweite lebt noch — sonst wäre aus „abmelden" ein „überall abmelden"
    // geworden, und niemand hätte es bemerkt.
    expect((await verifySession(speicher.sitzungen, zwei.token)).session.id).toBe(zwei.session.id)

    // „Überall abmelden" trifft dann genau eine: die zweite. Die erste ist schon
    // widerrufen, und **nur Offene werden gezählt**.
    const getroffen = await revokeAllSessions(speicher.sitzungen, angelegt.user.id, 'password-changed')
    expect(getroffen).toBe(1)

    const dritte = await createSession(speicher.sitzungen, angelegt.user.id)
    expect(await revokeAllSessions(speicher.sitzungen, angelegt.user.id)).toBe(1)
    const alleWeg = await verifySession(speicher.sitzungen, dritte.token).catch((u: unknown) => u)
    expect(alleWeg).toBeInstanceOf(SessionError)
  })

  test('der Widerrufszeitpunkt bleibt der erste', async () => {
    // Wird dieselbe Sitzung zweimal widerrufen, ist der **erste** Zeitpunkt der
    // aussagekräftige. Ein Überschreiben machte aus „wann wurde sie beendet" ein
    // „wann hat jemand zuletzt auf Abmelden gedrückt".
    const speicher = erzeugeSpeicher(zugang)
    const hasher = new Argon2PasswordHasher()
    const angelegt = await register(speicher.benutzer, hasher, `hugo${TESTDOMAENE}`, PASSWORT, 'Hugo', {
      maxUsers: 100_000,
    })
    if (!angelegt.ok) throw new Error('Registrierung mißlang')
    const sitzung = await createSession(speicher.sitzungen, angelegt.user.id)

    const frueh = new Date('2026-10-13T10:00:00.000Z')
    const spaet = new Date('2026-10-13T18:00:00.000Z')
    await revokeSession(speicher.sitzungen, sitzung.session.id, 'logout', () => frueh)
    await revokeSession(speicher.sitzungen, sitzung.session.id, 'logout', () => spaet)

    const gelesen: SessionRecord | undefined = await speicher.sitzungen.findById(sitzung.session.id)
    expect(gelesen?.revokedAt).toBe(frueh.toISOString())
  })

  test('legt kein Geheimnis in die Prüfspur', async () => {
    // Die Spalte `detail` ist ein freies JSON-Feld und damit die naheliegende
    // Stelle für genau diesen Fehler. Geprüft wird die **ganze Zeile** als Text,
    // nicht nur die eine Spalte, die man im Verdacht hat.
    const speicher = erzeugeSpeicher(zugang)
    const hasher = new Argon2PasswordHasher()
    const angelegt = await register(speicher.benutzer, hasher, `ida${TESTDOMAENE}`, PASSWORT, 'Ida', {
      maxUsers: 100_000,
      sink: speicher.spur,
    })
    if (!angelegt.ok) throw new Error('Registrierung mißlang')
    const sitzung = await createSession(speicher.sitzungen, angelegt.user.id)
    await authenticate(speicher.benutzer, hasher, `ida${TESTDOMAENE}`, 'falsch-aber-lang-genug-2026', speicher.spur)

    const zeilen = await sql.unsafe<{ alles: string }[]>(
      `SELECT (id::text || '|' || coalesce(kind,'') || '|' || coalesce(email,'') || '|' ||
               coalesce(ip::text,'') || '|' || coalesce(user_agent,'') || '|' ||
               coalesce(detail::text,'')) AS alles
         FROM auth_events`,
    )
    expect(zeilen.length).toBeGreaterThan(0)
    for (const zeile of zeilen) {
      expect(zeile.alles).not.toContain(PASSWORT)
      expect(zeile.alles).not.toContain(sitzung.token)
      expect(zeile.alles).not.toContain('$argon2id$')
    }
  })

  test('zählt die Benutzer über den echten Server', async () => {
    const speicher = erzeugeSpeicher(zugang)
    const vorher = await speicher.benutzer.count()
    const hasher = new Argon2PasswordHasher()
    await register(speicher.benutzer, hasher, `jonas${TESTDOMAENE}`, PASSWORT, 'Jonas', { maxUsers: 100_000 })
    expect(await speicher.benutzer.count()).toBe(vorher + 1)
  })

  test('mitMandant setzt den Mandanten TRANSAKTIONSLOKAL — er läuft nicht aus (B4)', async () => {
    // ---------------------------------------------------------------------------
    // **Die Frage, die dieser Test beantwortet.**
    // ---------------------------------------------------------------------------
    // `select set_config('pmh.user_id', $1, true)` — das dritte Argument `is_local`
    // bindet den Wert an die **Transaktion**. Stünde dort `false`, bliebe der Mandant
    // in der **Verbindung** stehen. Und weil Verbindungen aus einem Vorrat
    // wiederverwendet werden, liefe die **nächste** Abfrage unter dem **vorigen**
    // Benutzer. Das wäre schlimmer als kein Mandant: es wäre ein **fremder**.
    //
    // **Warum auf EINER Verbindung gemessen wird.** Über den Vorrat (`max: 2`) könnte
    // die Abfrage „außen" auf einer **anderen** Verbindung landen — dann belegte der
    // Test nur, daß ein zweiter Kanal nichts weiß, und **nicht**, daß der Wert
    // verschwunden ist. Deshalb wird eine Verbindung mit `reserve()` festgehalten und
    // beides darüber gefahren.
    //
    // **Was hier NICHT geprüft wird.** Daß Row Level Security danach filtert. Das ist
    // eine Eigenschaft von PostgreSQL und steht gemessen in
    // `packages/auth/db-schema/tests/proben/rls-verhalten.sql` und in
    // `docs/status/mandantentrennung.md` §13.
    const A = 'aaaaaaaa-0000-4000-8000-0000000000c1'

    const lese = async (s: SqlZugang): Promise<string | null> => {
      const zeilen = (await s.unsafe(`select current_setting('pmh.user_id', true) as wert`)) as {
        wert: string | null
      }[]
      return zeilen[0]?.wert ?? null
    }

    // ---- Teil 1: mitMandant arbeitet mit dem ECHTEN Treiber ----
    // Der Treiber wird als `SqlZugang` übergeben; die Umdeutung steht hier, weil die
    // Schnittstelle absichtlich nur `unsafe` verlangt. Daß `begin` vorhanden ist,
    // prüft `mitMandant` zur Laufzeit selbst — und wirft, wenn nicht.
    const echt = sql as unknown as SqlZugang
    expect(await mitMandant(echt, A, lese)).toBe(A)

    // ---- Teil 2: die Transaktionslokalität, auf EINER Verbindung ----
    // **Warum das getrennt gemessen wird.** Über den Vorrat (`max: 2`) könnte die
    // Abfrage „außen" auf einer **anderen** Verbindung landen — dann belegte der Test
    // nur, daß ein zweiter Kanal nichts weiß, und **nicht**, daß der Wert
    // verschwunden ist. `reserve()` hält eine Verbindung fest.
    //
    // **Warum hier rohes SQL steht.** `reserviert.begin` gibt es in dieser Fassung des
    // Treibers **nicht** (gemessen: `TypeError: reserviert.begin is not a function`).
    // Deshalb wird die Transaktion über `begin`/`commit` gefahren — und damit genau
    // das geprüft, was `mitMandant` innen tut: **`true` als drittes Argument**.
    const reserviert = await sql.reserve()
    try {
      await reserviert.unsafe('begin')
      try {
        await reserviert.unsafe(`select set_config('pmh.user_id', $1, true)`, [A] as never[])
        const innen = (await reserviert.unsafe(`select current_setting('pmh.user_id', true) as wert`)) as {
          wert: string | null
        }[]
        expect(innen[0]?.wert ?? null).toBe(A)
        await reserviert.unsafe('commit')
      } catch (fehler) {
        await reserviert.unsafe('rollback')
        throw fehler
      }

      // Dieselbe Verbindung, Transaktion beendet. **Gemessen: der Wert ist `''`, nicht
      // `NULL`.** Ein eigener Parameter, der einmal gesetzt wurde, **existiert** danach
      // mit leerem Wert weiter — `is_local` nimmt den Wert zurück, nicht den Parameter.
      //
      // **Das ist eine gute Nachricht, und sie gehört benannt.** Ohne Mandant ergibt
      // `current_setting('pmh.user_id', true)` hier `''`, und `''::uuid` wirft
      // **`22P02`** — also **laut**. Nur auf einer Verbindung, die den Parameter **nie**
      // gesetzt hat, liefert `missing_ok = true` ein `NULL` und damit **still null
      // Zeilen**. Beides ist gemessen; siehe `docs/status/mandantentrennung.md` §13.4a.
      //
      // Geprüft wird deshalb: **der Mandant ist weg** (`''` oder `NULL`, nie `A`).
      const aussen = (await reserviert.unsafe(`select current_setting('pmh.user_id', true) as wert`)) as {
        wert: string | null
      }[]
      const draussen = aussen[0]?.wert ?? null
      expect(draussen).not.toBe(A)
      expect(draussen ?? '').toBe('')
    } finally {
      await reserviert.release()
    }
  })
})
