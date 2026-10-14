/**
 * Integrationstest gegen ein **echtes** PostgreSQL.
 *
 * **Warum das ein eigener Test ist.** Die Attrappen-Tests prüfen die Regeln des
 * Läufers. Ob das SQL **läuft**, kann nur PostgreSQL beantworten — ein
 * Tippfehler in einer Prüfregel, ein Index auf einer Spalte, die es nicht gibt,
 * oder ein `ON DELETE` auf einen falschen Verweis fällt erst hier auf.
 *
 * **Der Test läuft nur, wenn eine Datenbank erreichbar ist.** Ohne
 * `PMH_TEST_DATABASE_URL` wird er **übersprungen** — und meldet das. Ein Test,
 * der ohne Infrastruktur „grün" ist, ohne etwas geprüft zu haben, ist schlimmer
 * als kein Test.
 *
 * Aufruf:
 * ```
 * $env:PMH_TEST_DATABASE_URL = 'postgres://pmh:pmh-dev-only@127.0.0.1:5432/pmh'
 * bun test packages/auth/db-schema/tests/postgres.test.ts
 * ```
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import postgres from 'postgres'
import {
  MIGRATIONS,
  MigrationError,
  SCHEMA_VERSION,
  checksumOf,
  currentSchemaVersion,
  migrate,
  type MigrationTarget,
} from '../src/index.ts'

const URL_FROM_ENV = process.env.PMH_TEST_DATABASE_URL

/**
 * Ist eine Testadresse **brauchbar** — nicht nur „vorhanden"?
 *
 * **Warum nicht `=== undefined`.** Der erste Entwurf prüfte genau das, an **vier**
 * Stellen (Zeilen 101, 115, 127, 132 der alten Fassung). Ein **leerer** Wert
 * (`PMH_TEST_DATABASE_URL=''`) ist aber nicht `undefined`. Die Absicht der Zeile
 * („nur mit einer brauchbaren Adresse verbinden") stand damit nirgends — und vier
 * Abschriften derselben Regel sind vier Gelegenheiten, sie verschieden zu ändern.
 *
 * **Was gemessen ist — und was ich zuerst FALSCH behauptet habe.** Ich schrieb, der
 * zerstörende Test „liefe" mit leerem Wert weiter. Das ist **widerlegt**: mit
 * `PMH_TEST_DATABASE_URL=''` überspringt die Datei alle 15 Prüfungen (0 pass,
 * 15 skip, Exit 0), weil die Verbindung scheitert und `VERBINDUNG?.ok === false`
 * greift.
 *
 * **Was trotzdem stimmt und der Grund für diese Funktion ist.** Ein leerer Wert ist
 * **nicht wirkungslos**: `postgres('')` fällt auf die Umgebungsvorgaben zurück und
 * baut einen **echten** Verbindungsversuch. Gemessen auf diesem Rechner:
 *
 * ```
 * postgres("") → VERBINDUNG SCHEITERT: password authentication failed for user "Chang"
 * ```
 *
 * Der Treiber nahm also den **Windows-Benutzer** als Datenbankbenutzer und die
 * Vorgaben für Wirt und Datenbank. Daß nichts geschah, lag allein daran, daß es
 * keine Rolle `Chang` gibt — **nicht** daran, daß der Schutz gegriffen hätte. Gäbe
 * es sie, liefe der zerstörende Test gegen die Datenbank, die die Vorgaben nennen.
 *
 * Das ist ein **latenter** Fehler, kein wirkender: er hängt an der Umgebung. Genau
 * deshalb steht die Entscheidung jetzt an einer Stelle und prüft die Absicht.
 *
 * @param adresse - der Wert aus der Umgebung
 * @returns ob eine Verbindung überhaupt versucht werden darf
 */
function adresseGesetzt(adresse: string | undefined): adresse is string {
  return adresse !== undefined && adresse.trim() !== ''
}

/** Ein Ziel über den echten Treiber; jede Migration in eigener Transaktion. */
function targetOf(sql: postgres.Sql): MigrationTarget {
  return {
    async exec(statement: string): Promise<void> {
      await sql.unsafe(statement)
    },
    async query<T>(statement: string, params?: readonly unknown[]): Promise<readonly T[]> {
      const rows = await sql.unsafe(statement, (params ?? []) as never[])
      return rows as unknown as readonly T[]
    },
  }
}

/**
 * Ob die Datenbank **wirklich** erreichbar ist — nicht nur, ob eine Adresse
 * dasteht.
 *
 * ## Der Befund, der diese Prüfung erzwungen hat
 *
 * Bis hierher galt: `PMH_TEST_DATABASE_URL` gesetzt → prüfen. Gemessen am
 * 13.10.2026 fiel das um:
 *
 * 1. **Bun lädt `.env` von selbst.** Ein Lauf ohne gesetzte Umgebungsvariable
 *    hatte die Variable trotzdem — aus der Datei. Nachgemessen:
 *    `bun -e "process.env.PMH_TEST_DATABASE_URL"` → `GESETZT`.
 * 2. **Bun ersetzt `process.env`-Werte durch die aus `.env`.** Ein
 *    ausdrücklich exportierter Wert gewinnt also **nicht**. Wer die Adresse in
 *    der Shell setzt, um gegen eine andere Datenbank zu prüfen, prüft
 *    weiterhin gegen die aus der Datei.
 * 3. `scripts/install.mjs` erzeugt `.env` mit **neuen** Kennwörtern. Läuft der
 *    Stapel noch mit den alten, scheitert jede Verbindung mit
 *    `password authentication failed`.
 *
 * Ergebnis: **14 rote Prüfungen**, und die Ursache stand nirgends. Die Tests
 * waren von der Umgebung abhängig, ohne es zu sagen.
 *
 * ## Was jetzt gilt
 *
 * Geprüft wird **nicht die Variable, sondern der Zugang.** Ein `select 1` gegen
 * die echte Datenbank entscheidet. Gelingt es nicht, werden die Prüfungen
 * **übersprungen** — mit dem Grund im Bericht, nicht still.
 *
 * **Warum überspringen und nicht rot.** Eine Datenbank, die nicht da ist, ist
 * kein Fehler des Codes. Aber ein **stilles** Überspringen wäre schlimmer als
 * ein roter Test — deshalb steht der Grund in der Ausgabe.
 */
const VERBINDUNG = URL_FROM_ENV === undefined ? undefined : await pruefeZugang(URL_FROM_ENV)

/** Versucht eine echte Verbindung und meldet, was dabei herauskam. */
async function pruefeZugang(adresse: string): Promise<{ ok: true } | { ok: false; grund: string }> {
  const { default: postgres } = await import('postgres')
  let verbindung: postgres.Sql | undefined
  try {
    verbindung = postgres(adresse, { max: 1, connect_timeout: 3, onnotice: () => undefined })
    await verbindung`select 1`
    return { ok: true }
  } catch (fehler) {
    const roh = fehler instanceof Error ? fehler.message : String(fehler)
    // **Zugangsdaten gehören nicht in eine Fehlermeldung.** Ein
    // Verbindungsfehler nennt oft den Benutzer oder die halbe Adresse.
    return { ok: false, grund: roh.replace(/([a-zA-Z][\w+.-]*:\/\/)[^/@\s]*@/gu, '$1***@') }
  } finally {
    await verbindung?.end({ timeout: 2 }).catch(() => undefined)
  }
}

// Die Meldung unterscheidet „nicht gesetzt" von „leer gesetzt": beides führt zum
// selben Überspringen, aber nur der zweite Fall ist ein Fehler des Aufrufers, und
// wer die Meldung liest, soll das sehen.
const OHNE_ZUGANG =
  URL_FROM_ENV === undefined
    ? 'PMH_TEST_DATABASE_URL ist nicht gesetzt'
    : URL_FROM_ENV.trim() === ''
      ? 'PMH_TEST_DATABASE_URL ist gesetzt, aber LEER'
      : undefined

if (VERBINDUNG !== undefined && !VERBINDUNG.ok) {
  // **Deutlich melden statt still überspringen.** Ein übersprungener Test ist
  // kein Beweis; wer den Bericht liest, muss das sehen.
  process.stderr.write(
    `HINWEIS: PostgreSQL-Prüfungen übersprungen — keine Verbindung.\n` +
      `  Adresse: ${URL_FROM_ENV?.replace(/([a-zA-Z][\w+.-]*:\/\/)[^/@\s]*@/gu, '$1***@') ?? '—'}\n` +
      `  Grund:   ${VERBINDUNG.grund}\n` +
      `  Läuft der Stapel?  docker compose ps\n` +
      `  Passen die Kennwörter?  bun scripts/install.mjs\n`,
  )
}

const run = adresseGesetzt(URL_FROM_ENV) && VERBINDUNG?.ok !== false ? describe : describe.skip

if (OHNE_ZUGANG !== undefined) {
  process.stderr.write(
    `HINWEIS: PostgreSQL-Prüfungen übersprungen — ${OHNE_ZUGANG}.\n` +
      'Start:  docker compose up -d   (siehe docker-compose.yml)\n',
  )
}

let sql: postgres.Sql

beforeAll(async () => {
  if (!adresseGesetzt(URL_FROM_ENV) || VERBINDUNG?.ok === false) return
  sql = postgres(URL_FROM_ENV, { max: 2, onnotice: () => undefined })

  // ---------------------------------------------------------------------------
  // DIE SICHERUNG: niemals gegen die Betriebsdatenbank
  // ---------------------------------------------------------------------------
  // **Warum sie hier stehen MUSS — und warum sie zuerst fehlte.**
  //
  // Dieser Test beginnt mit `DROP TABLE … CASCADE`. Er ist damit der einzige
  // Test im Projekt, der eine Datenbank **abräumt**. Eine Sicherung gab es nur in
  // `packages/auth/store-postgres/tests/postgres.test.ts` — dort greift sie, denn
  // dieser Test bricht ab. **Der zerstörende Test hatte keine.**
  //
  // **Am 13.10.2026 ist genau das passiert.** Ein Aufruf von `bun test <datei>`
  // aus dem Wurzelverzeichnis ohne gesetzte Umgebungsvariable: Bun lädt `.env`
  // aus dem Arbeitsverzeichnis, darin zeigt `PMH_TEST_DATABASE_URL` auf die
  // **Betriebsdatenbank** `pmh`. Gemessen danach:
  //
  //   auth_events   12  ->  0
  //   auth_sessions  1  ->  0
  //
  // Verloren waren die Prüfspur und ein Prüfbenutzer — **Testdaten und eigene
  // Nachweise, keine Betriebsdaten**. Der Schaden war klein, die Ursache nicht:
  // derselbe Aufruf hätte alles abgeräumt, was je in dieser Datenbank steht.
  //
  // **Warum der Vergleich mit `DATABASE_URL` und nicht mit einem Namensmuster.**
  // `_test` im Namen ist eine Konvention, die man bricht. `DATABASE_URL` ist
  // **dieselbe Angabe, die die Anwendung benutzt** — zeigt sie auf dieselbe
  // Datenbank, ist der Lauf ein Fehler und kein Testlauf.
  const angabe = await sql.unsafe<{ db: string }[]>('SELECT current_database() AS db')
  const hier = angabe[0]?.db ?? '?'
  const betrieb = process.env.DATABASE_URL
  if (adresseGesetzt(betrieb)) {
    const nameDerAnwendung = new URL(betrieb).pathname.replace(/^\//u, '')
    if (nameDerAnwendung !== '' && nameDerAnwendung === hier) {
      await sql.end({ timeout: 5 })
      throw new Error(
        `ABBRUCH: dieser Test LÖSCHT ALLE TABELLEN und zeigt auf „${hier}" — dieselbe Datenbank wie die ` +
          `Anwendung (DATABASE_URL). Er ist für eine Wegwerf-Datenbank gedacht: ` +
          `setze PMH_TEST_DATABASE_URL auf eine andere Datenbank (siehe docs/status/mandantentrennung.md §10).`,
      )
    }
  }
})

afterAll(async () => {
  if (!adresseGesetzt(URL_FROM_ENV) || VERBINDUNG?.ok === false) return
  await sql.end({ timeout: 5 })
})

run('PostgreSQL: Migrationen gegen eine echte Datenbank', () => {
  test('wendet das Schema auf eine frische Datenbank an', async () => {
    const target = targetOf(sql)
    // Sauberer Anfang: die Tabellen dieses Schemas werden entfernt, damit der
    // Test wiederholbar ist. `CASCADE` nimmt die Fremdschlüssel mit.
    await target.exec(`
      DROP TABLE IF EXISTS auth_events, user_secrets, one_time_tokens, messages,
        chats, workspaces, api_keys, auth_sessions, conversation_sessions, users, schema_migrations CASCADE;
      -- Der Wissensspeicher haengt an users und faellt mit CASCADE mit; er steht
      -- trotzdem ausdruecklich hier, damit die Liste vollstaendig ist und niemand
      -- sie fuer abschliessend haelt. (Keine Backticks in diesem Kommentar: er
      -- steht in einem Template-Literal, und ein Backtick beendet es.)
      DROP TABLE IF EXISTS chunks, documents, note_tags, links, tags, notes, vaults CASCADE;
    `)

    const report = await migrate(target)
    expect(report.applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(report.version).toBe(SCHEMA_VERSION)
    expect(report.fresh).toBe(true)
  })

  test('legt alle Tabellen im Schema `pmh` an — und keine in `public`', async () => {
    // **Warum `pmh` und nicht `public`.** Der Stack legt ein eigenes Schema an
    // (`docker/postgres-init/02-roles.sh`) und setzt den Suchpfad der Rollen auf
    // `pmh, public`. `public` ist in PostgreSQL der Ort, an dem jedes
    // Fremdwerkzeug ohne Schema-Angabe sucht — die eigenen Objekte gehören dort
    // nicht hin. Die Migration legt ihre Tabellen deshalb ohne Präfix an, und
    // der Suchpfad entscheidet, wo sie landen.
    //
    // **Der Test hat das gefunden, nicht die Doku:** er suchte zuerst in
    // `public` und schlug fehl. Genau so soll es sein — eine Annahme, die im
    // Test steht und nicht in der Wirklichkeit, ist ein Befund.
    //
    // **Warum hier keine Zahl im Namen steht.** In `migrate.test.ts` trägt der
    // Name die Zahl, weil dort die Liste **ausgeschrieben** gegen den Quelltext
    // geprüft wird. Hier steht die Zahl „achtzehn" noch im Namen, als längst
    // zwanzig Tabellen da waren — Migration 0008 kam dazu, und der Name log
    // weiter. Statt die Zahl zu pflegen, prüft diese Fassung die **Menge**:
    // eine fehlende Tabelle fällt durch die Schleife, eine überzählige durch den
    // Vergleich darunter. Ein Name ohne Zahl kann nicht veralten.
    const rows = await targetOf(sql).query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'pmh' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    )
    const tables = rows.map((row) => row.table_name)
    const erwartet = [
      'api_keys',
      'auth_events',
      'auth_sessions',
      'chats',
      'conversation_sessions',
      'messages',
      'one_time_tokens',
      'user_secrets',
      'users',
      'workspaces',
      // **Neu mit Migration 0005.** Die Isolationsprofile je Benutzer.
      'user_profiles',
      // **Neu mit Migration 0006.** Der Wissensspeicher (D1). Beide Tabellen
      // tragen den Mandanten von Anfang an — siehe die Probe
      // `tests/proben/wissensspeicher.sql`.
      'documents',
      'chunks',
      'vaults',
      'notes',
      'tags',
      'note_tags',
      'links',
      // **Neu mit Migration 0008.** Das Sitzungsprotokoll.
      'session_events',
      // **Kein `CREATE TABLE` in einer Migration.** Diese Tabelle legt der
      // Migrationsläufer selbst an — deshalb steht sie in `migrate.test.ts`
      // nicht in der Liste und hier doch.
      'schema_migrations',
    ]
    for (const table of erwartet) {
      expect(tables).toContain(table)
    }
    // Und **keine** darüber hinaus. Am 14.10.2026 fehlten hier zwei: der Name
    // sagte achtzehn, die Datenbank hatte zwanzig.
    expect(tables).toEqual([...erwartet].sort())
  })

  test('das Schema `pmh` ist der Suchpfad der Rollen, `public` bleibt leer', async () => {
    const rows = await targetOf(sql).query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    )
    // Nichts in `public`. Ohne diese Prüfung könnte eine spätere Migration
    // versehentlich dorthin schreiben, und niemand würde es bemerken.
    expect(rows[0]?.n).toBe('0')
  })

  test('legt den zusammengesetzten Schlüssel an, der das Blättern trägt', async () => {
    const rows = await targetOf(sql).query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'messages' ORDER BY indexname`,
    )
    const definitions = rows.map((row) => row.indexdef).join('\n')
    // **Der Befund, der zu dieser Form geführt hat:** mit einem Schlüssel auf
    // `id` allein wählte PostgreSQL für die Blätterabfrage den Primärschlüssel
    // (Rückwärts-Scan plus Filter) statt eines Index auf `(chat_id, id DESC)` —
    // gemessen 39.25 gegen 4.18 Kosteneinheiten, und mit wachsendem Chat wird es
    // schlechter. Der zusammengesetzte Schlüssel kann nicht umgangen werden.
    expect(definitions).toMatch(/messages_pkey.*\((chat_id, id)\)/)
  })

  test('erzwingt die Eindeutigkeit der E-Mail ohne Rücksicht auf Gross- und Kleinschreibung', async () => {
    const target = targetOf(sql)
    await target.exec(`
      INSERT INTO users (id, email, password_hash) VALUES
        ('11111111-1111-4111-8111-111111111111', 'Ada@example.org', NULL);
    `)
    let message = ''
    try {
      await target.exec(`
        INSERT INTO users (id, email, password_hash) VALUES
          ('22222222-2222-4222-8222-222222222222', 'ada@example.org', NULL);
      `)
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause)
    }
    expect(message).toContain('users_email_lower_key')
  })

  test('weist einen Hash zurück, der kein Hash ist', async () => {
    let message = ''
    try {
      await targetOf(sql).exec(`
        INSERT INTO auth_sessions (id, user_id, token_hash, csrf_hash, idle_expires_at, absolute_expires_at)
        VALUES ('33333333-3333-4333-8333-333333333333',
                '11111111-1111-4111-8111-111111111111',
                'kein-hash', repeat('a', 64), now() + interval '1 hour', now() + interval '1 day');
      `)
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause)
    }
    expect(message).toContain('auth_sessions_token_hash_hex')
  })

  test('weist eine Rolle zurück, die es nicht gibt', async () => {
    let message = ''
    try {
      await targetOf(sql).exec(`
        INSERT INTO users (id, email, role) VALUES
          ('44444444-4444-4444-8444-444444444444', 'root@example.org', 'superuser');
      `)
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause)
    }
    expect(message).toContain('users_role_known')
  })

  test('löscht abhängige Zeilen mit — nichts bleibt verwaist zurück', async () => {
    const target = targetOf(sql)
    await target.exec(`
      INSERT INTO workspaces (id, user_id, name) VALUES
        ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'Test');
      INSERT INTO chats (id, workspace_id, user_id, title) VALUES
        ('66666666-6666-4666-8666-666666666666',
         '55555555-5555-4555-8555-555555555555',
         '11111111-1111-4111-8111-111111111111', 'Chat');
      INSERT INTO messages (id, chat_id, role, content_cipher, user_id) VALUES
        ('01JC0000000000000000000001', '66666666-6666-4666-8666-666666666666', 'user', '\\x01'::bytea,
         '11111111-1111-4111-8111-111111111111'),
        ('01JC0000000000000000000002', '66666666-6666-4666-8666-666666666666', 'assistant', '\\x02'::bytea,
         '11111111-1111-4111-8111-111111111111');
    `)
    // Der Benutzer verschwindet — und mit ihm Workspace, Chat und Nachrichten.
    await target.exec(`DELETE FROM users WHERE id = '11111111-1111-4111-8111-111111111111';`)

    const counts = await target.query<{ table_name: string; n: string }>(`
      SELECT 'workspaces' AS table_name, count(*)::text AS n FROM workspaces
      UNION ALL SELECT 'chats', count(*)::text FROM chats
      UNION ALL SELECT 'messages', count(*)::text FROM messages
      UNION ALL SELECT 'auth_sessions', count(*)::text FROM auth_sessions
        UNION ALL SELECT 'conversation_sessions', count(*)::text FROM conversation_sessions;
    `)
    for (const row of counts) expect({ table: row.table_name, count: row.n }).toEqual({ table: row.table_name, count: '0' })
  })

  test('ein zweiter Lauf ist folgenlos', async () => {
    const target = targetOf(sql)
    const report = await migrate(target)
    expect(report.applied).toEqual([])
    expect(report.version).toBe(SCHEMA_VERSION)
    expect(await currentSchemaVersion(target)).toBe(SCHEMA_VERSION)
  })

  test('eine nachträglich geänderte Migration wird erkannt — an der echten Datenbank', async () => {
    const target = targetOf(sql)
    const changed = [
      { version: 1, name: MIGRATIONS[0]?.name ?? '', sql: `${MIGRATIONS[0]?.sql ?? ''}\n-- nachträglich geändert\n` },
      MIGRATIONS[1] as (typeof MIGRATIONS)[number],
    ]
    const failure = await migrate(target, changed).catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(MigrationError)
    expect((failure as Error).message).toContain('nach dem Anwenden geändert')
  })

  test('die Prüfsumme in der Datenbank stimmt mit der berechneten überein', async () => {
    const rows = await targetOf(sql).query<{ version: number; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version',
    )
    for (const row of rows) {
      const migration = MIGRATIONS.find((entry) => entry.version === row.version)
      expect(migration).toBeDefined()
      expect(row.checksum).toBe(checksumOf(migration?.sql ?? ''))
    }
    expect(rows).toHaveLength(MIGRATIONS.length)
  })

  test('weist einen fremden Mandanten an der echten Datenbank ab (Migration 0004)', async () => {
    // **Warum das hier steht und nicht nur in der SQL-Probe.** Die Probe unter
    // `tests/proben/mandantentrennung.sql` ist Handarbeit: sie muss jemand
    // aufrufen, und sie laeuft nicht mit der Suite. Eine Trennung, die niemand
    // nachprueft, ist eine Absicht — dieser Test macht aus der Absicht eine
    // Bedingung, die bei jeder Aenderung mitgeprueft wird.
    //
    // **Warum vier Faelle und nicht einer.** Die Mandantentrennung haengt an
    // vier zusammengesetzten Fremdschluesseln. Einer allein beweist nichts ueber
    // die anderen drei — und ein spaeterer Umbau koennte genau einen entfernen.
    const target = targetOf(sql)
    await target.exec(`
      INSERT INTO users (id, email) VALUES
        ('aaaaaaaa-0000-4000-8000-000000000001', 'trennung-a@example.org'),
        ('bbbbbbbb-0000-4000-8000-000000000002', 'trennung-b@example.org');
      INSERT INTO workspaces (id, user_id, name) VALUES
        ('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'Werkstatt A'),
        ('bbbbbbbb-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'Werkstatt B');
      INSERT INTO chats (id, workspace_id, user_id, title) VALUES
        ('bbbbbbbb-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000004',
         'bbbbbbbb-0000-4000-8000-000000000002', 'Chat von B');
      INSERT INTO conversation_sessions (id, version, created_at, revision, user_id) VALUES
        ('trennung-sitzung-b', 1, now(), 'r1', 'bbbbbbbb-0000-4000-8000-000000000002');
    `)

    /** Ein Uebergriff, der abgelehnt werden MUSS — mit `23503`, nicht irgendwie. */
    const uebergriffe: readonly { readonly was: string; readonly sql: string }[] = [
      {
        was: 'Chat von A in der Werkstatt von B',
        sql: `INSERT INTO chats (id, workspace_id, user_id, title) VALUES
                ('aaaaaaaa-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000004',
                 'aaaaaaaa-0000-4000-8000-000000000001', 'A in B')`,
      },
      {
        was: 'Sitzung von A im Arbeitsbereich von B',
        sql: `INSERT INTO conversation_sessions (id, version, created_at, revision, user_id, workspace_id) VALUES
                ('trennung-a-in-b', 1, now(), 'r1', 'aaaaaaaa-0000-4000-8000-000000000001',
                 'bbbbbbbb-0000-4000-8000-000000000004')`,
      },
      {
        was: 'Unteragent von A unter dem Elternteil von B',
        sql: `INSERT INTO conversation_sessions (id, version, created_at, revision, user_id, parent_session) VALUES
                ('trennung-a-kind', 1, now(), 'r1', 'aaaaaaaa-0000-4000-8000-000000000001',
                 'trennung-sitzung-b')`,
      },
      {
        was: 'Nachricht von A im Chat von B',
        sql: `INSERT INTO messages (chat_id, id, role, user_id) VALUES
                ('bbbbbbbb-0000-4000-8000-000000000005', 'trennung-n1', 'user',
                 'aaaaaaaa-0000-4000-8000-000000000001')`,
      },
    ]

    for (const uebergriff of uebergriffe) {
      let code = ''
      try {
        await target.exec(uebergriff.sql)
      } catch (cause) {
        // **Nur `23503` zaehlt.** Der erste Entwurf der SQL-Probe haette jeden
        // Fehler als Ablehnung gewertet und waere damit gruen geworden, weil die
        // Spalte `user_id` vor der Migration gar nicht existierte (`42703`). Ein
        // Fehler ist kein Beweis fuer eine Regel, die es nicht gibt.
        code = (cause as { code?: string }).code ?? ''
      }
      expect({ was: uebergriff.was, code }).toEqual({ was: uebergriff.was, code: '23503' })
    }
  })

  test('RLS filtert je Mandant — und ein fehlender Mandant ist LAUT (Probe: rls-verhalten.sql)', async () => {
    // ---------------------------------------------------------------------------
    // **Warum dieser Test existiert.**
    // ---------------------------------------------------------------------------
    // `docs/status/mandantentrennung.md` §8 haelt fest, dass RLS **aus** bleibt,
    // weil ein fehlender Mandant „still null Zeilen" liefert und der Fehler dann
    // wie „Tabelle leer" aussaehe statt wie „Zugriff verweigert".
    //
    // Gemessen gilt das nur fuer **eine** der beiden moeglichen Policy-Formen:
    //
    //   using (user_id = current_setting('pmh.user_id', true)::uuid)  -- still: 0 Zeilen
    //   using (user_id = current_setting('pmh.user_id')::uuid)        -- LAUT: 42704
    //
    // `missing_ok = true` macht aus dem fehlenden Parameter `null`, und `null` in
    // einem `using` filtert alles weg. Ohne `missing_ok` ist es ein Fehler.
    // Dieser Test haelt **beide** Formen fest, damit die Entscheidung aus §8 nicht
    // auf einer Annahme ruht.
    //
    // **Warum FORCE ROW LEVEL SECURITY und kein Rollenwechsel.** Der Test
    // verbindet als `pmh_owner` — die **Eigentuemerin** aller Tabellen. Eigentuemer
    // umgehen RLS, solange `FORCE` fehlt; gemessen sieht der Eigentuemer ohne
    // FORCE **alle** Zeilen und wuerde „RLS wirkt nicht" melden, obwohl es wirkt.
    // Der andere Weg — `SET LOCAL ROLE pmh_app` — scheitert, weil `pmh_owner` kein
    // Mitglied von `pmh_app` ist. Die Anwendungsrolle bleibt die richtige Wahl fuer
    // den Betrieb; hier wird die Eigentuemer-Ausnahme mit `FORCE` aufgehoben.
    //
    // **Warum SAVEPOINTs.** In PostgreSQL bricht ein Fehler die **ganze**
    // Transaktion ab (`25P02`); jede weitere Anweisung scheitert dann an der
    // abgebrochenen Transaktion statt an der Sache. Der erwartete `42704` wird
    // deshalb in einen SAVEPOINT gelegt und danach zurueckgerollt — sonst koennte
    // der Test die folgenden Faelle nicht mehr messen.
    //
    // Alles geschieht in **einer** Transaktion und wird **zurueckgerollt**.
    const A = 'aaaaaaaa-0000-4000-8000-0000000000a1'
    const B = 'bbbbbbbb-0000-4000-8000-0000000000b1'

    /** Traegt das Ergebnis aus der Transaktion heraus, die zurueckgerollt werden MUSS. */
    class Ruecknahme extends Error {
      constructor(readonly werte: { laut: string; mitA: number; mitB: number; still: number }) {
        super('Ruecknahme')
      }
    }

    const werte = await sql
      .begin(async (tx) => {
        await tx.unsafe(`
          CREATE TABLE rls_probe (id int PRIMARY KEY, user_id uuid NOT NULL);
          INSERT INTO rls_probe (id, user_id) VALUES
            (1, '${A}'), (2, '${A}'), (3, '${A}'), (4, '${B}');
          ALTER TABLE rls_probe ENABLE ROW LEVEL SECURITY;
          ALTER TABLE rls_probe FORCE ROW LEVEL SECURITY;
          CREATE POLICY rls_probe_laut ON rls_probe
            USING (user_id = current_setting('pmh.user_id')::uuid);
        `)

        // 1) Ohne Mandant: die LAUTE Form. Erwartet wird `42704`, nicht 0 Zeilen.
        await tx.unsafe('SAVEPOINT s1')
        let laut = ''
        try {
          await tx.unsafe('SELECT count(*) FROM rls_probe')
        } catch (cause) {
          laut = (cause as { code?: string }).code ?? ''
        } finally {
          await tx.unsafe('ROLLBACK TO SAVEPOINT s1')
        }

        // 2) Die STILLE Form — und zwar ZUERST, denn der Parameter ist in dieser
        //    Sitzung bis hierher noch NIE gesetzt worden. Nur so wird der wirklich
        //    abwesende Fall gemessen.
        //
        // **Zwei eigene Befunde stecken in dieser Reihenfolge.**
        // (a) `set_config('pmh.user_id', NULL, true)` setzt den Parameter auf den
        //     **leeren String**, nicht auf „ungesetzt". `''::uuid` wirft dann
        //     `22P02 invalid input syntax for type uuid: ""` — das war mein erster
        //     Entwurf, und er scheiterte genau daran.
        // (b) `RESET pmh.user_id` hilft **nicht**: fuer einen eigenen Parameter ist
        //     der Vorgabewert der leere String. Nach einem `set_config` laesst sich
        //     der abwesende Zustand in derselben Sitzung nicht wiederherstellen.
        //
        // Es gibt deshalb **drei** Verhaltensfaelle, nicht zwei:
        //
        //   Parameter nie gesetzt + missing_ok=true -> NULL  -> 0 Zeilen (still)
        //   Parameter nie gesetzt + ohne missing_ok -> 42704 (laut)
        //   Parameter ist LEER                      -> 22P02 (laut, auch mit missing_ok)
        await tx.unsafe(`ALTER POLICY rls_probe_laut ON rls_probe
          USING (user_id = current_setting('pmh.user_id', true)::uuid)`)
        const zeilenStill = await tx.unsafe<{ n: number }[]>('SELECT count(*)::int AS n FROM rls_probe')

        // 3) Mit Mandant A: nur die eigenen Zeilen.
        await tx.unsafe(`SELECT set_config('pmh.user_id', '${A}', true)`)
        const zeilenA = await tx.unsafe<{ n: number }[]>('SELECT count(*)::int AS n FROM rls_probe')

        // 4) Mit Mandant B: die andere Seite. Erst A und B ZUSAMMEN beweisen, dass
        //    gefiltert wird und nichts verlorengeht — eine Zahl allein waere auch
        //    mit einem kaputten Filter vereinbar.
        await tx.unsafe(`SELECT set_config('pmh.user_id', '${B}', true)`)
        const zeilenB = await tx.unsafe<{ n: number }[]>('SELECT count(*)::int AS n FROM rls_probe')

        throw new Ruecknahme({
          laut,
          still: zeilenStill[0]?.n ?? -1,
          mitA: zeilenA[0]?.n ?? -1,
          mitB: zeilenB[0]?.n ?? -1,
        })
      })
      .catch((cause: unknown) => {
        if (cause instanceof Ruecknahme) return cause.werte
        throw cause
      })

    // **Nur `42704` zaehlt.** Ein beliebiger Fehler waere kein Beweis: ohne
    // `ENABLE ROW LEVEL SECURITY` gaebe es die Policy gar nicht, und ein Fehler
    // ueber eine fehlende Spalte saehe genauso aus wie eine Abweisung.
    expect({ laut: werte.laut }).toEqual({ laut: '42704' })
    // Eingefuegt wurden 3 Zeilen fuer A und 1 fuer B. A+B MUSS 4 ergeben — das
    // ist der Beweis, dass die Policy trennt und nicht bloß alles wegfiltert.
    expect({ mitA: werte.mitA, mitB: werte.mitB, summe: werte.mitA + werte.mitB }).toEqual({
      mitA: 3,
      mitB: 1,
      summe: 4,
    })
    expect({ ohneMandantStill: werte.still }).toEqual({ ohneMandantStill: 0 })
  })

  test('das Blättern über den Zeiger benutzt den Schluessel (EXPLAIN, 20 Chats × 500 Nachrichten)', async () => {
    const target = targetOf(sql)
    // Ein realistischer Bestand: ein Benutzer, ein Workspace, zwanzig Chats mit
    // je 500 Nachrichten — also 10.000 Zeilen. Genug, dass der Planer einen
    // Tabellenscan nicht mehr als billig ansieht.
    await target.exec(`
      INSERT INTO users (id, email) VALUES ('77777777-7777-4777-8777-777777777777', 'index@example.org');
      INSERT INTO workspaces (id, user_id, name) VALUES
        ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', 'W');
      INSERT INTO chats (id, workspace_id, user_id, title)
      SELECT ('99999999-9999-4999-8999-' || lpad(c::text, 12, '0'))::uuid,
             '88888888-8888-4888-8888-888888888888',
             '77777777-7777-4777-8777-777777777777',
             'Chat ' || c::text
        FROM generate_series(1, 20) AS c;
      INSERT INTO messages (chat_id, id, role, content_cipher, user_id)
      SELECT ('99999999-9999-4999-8999-' || lpad(c::text, 12, '0'))::uuid,
             '01JC' || lpad(c::text, 4, '0') || lpad(g::text, 18, '0'),
             'user', '\\x01'::bytea,
             -- **Der Mandant ist seit Migration 0004 Pflicht.** Vorher kam er nur
             -- ueber chat_id herein. Ohne diese Spalte scheitert das Saen mit
             -- 23502 — genau das ist beim ersten Lauf nach der Migration
             -- passiert, und der Integrationstest hat es gefunden.
             '77777777-7777-4777-8777-777777777777'
        FROM generate_series(1, 20) AS c, generate_series(1, 500) AS g;
      ANALYZE messages;
    `)

    const plan = await target.query<{ 'QUERY PLAN': string }>(`
      EXPLAIN (FORMAT TEXT)
      SELECT id, role FROM messages
       WHERE chat_id = '99999999-9999-4999-8999-000000000007'
         AND id < '01JC0007000000000000000500'
       ORDER BY id DESC LIMIT 50;
    `)
    const text = plan.map((row) => row['QUERY PLAN']).join('\n')
    // Der Beweis, dass die Paginierung skaliert: der zusammengesetzte Schlüssel
    // wird benutzt, es gibt keinen Tabellenscan.
    expect(text).toContain('messages_pkey')
    expect(text).not.toContain('Seq Scan on messages')
    expect(text).not.toContain('Filter:')
  })

  test('die Chat-Liste kommt ohne die Nachrichtentabelle aus (EXPLAIN)', async () => {
    const plan = await targetOf(sql).query<{ 'QUERY PLAN': string }>(`
      EXPLAIN (FORMAT TEXT)
      SELECT id, title, last_message_at FROM chats
       WHERE user_id = '77777777-7777-4777-8777-777777777777' AND deleted_at IS NULL
       ORDER BY updated_at DESC LIMIT 30;
    `)
    const text = plan.map((row) => row['QUERY PLAN']).join('\n')
    // Genau der Punkt aus dem Schema-Kommentar: die Liste der Chats fasst
    // `messages` nicht an — auch nicht als Index-Scan.
    expect(text).not.toContain('messages')
    expect(text).toContain('chats_user_recent_idx')
  })

  test('die Seite liefert genau die angefragte Zahl und ist stabil', async () => {
    const target = targetOf(sql)
    const page = await target.query<{ id: string }>(`
      SELECT id FROM messages
       WHERE chat_id = '99999999-9999-4999-8999-000000000007'
       ORDER BY id DESC LIMIT 50;
    `)
    expect(page).toHaveLength(50)
    // Die erste Seite beginnt bei der jüngsten Nachricht dieses Chats.
    expect(page[0]?.id).toBe('01JC0007000000000000000500')

    const next = await target.query<{ id: string }>(
      `SELECT id FROM messages
        WHERE chat_id = '99999999-9999-4999-8999-000000000007' AND id < $1
        ORDER BY id DESC LIMIT 50`,
      [page[49]?.id],
    )
    expect(next).toHaveLength(50)
    // Keine Überlappung: die Zeiger-Paginierung ist lückenlos und wiederholungsfrei.
    const seen = new Set([...page, ...next].map((row) => row.id))
    expect(seen.size).toBe(100)
    expect(next[0]?.id).toBe('01JC0007000000000000000450')
  })
})
