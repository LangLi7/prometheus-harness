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

const run = URL_FROM_ENV === undefined ? describe.skip : describe

if (URL_FROM_ENV === undefined) {
  // **Deutlich melden statt still überspringen.** Ein übersprungener Test ist
  // kein Beweis; wer den Bericht liest, muss das sehen.
  process.stderr.write(
    'HINWEIS: PostgreSQL-Test übersprungen — PMH_TEST_DATABASE_URL ist nicht gesetzt.\n' +
      'Start:  docker run -d --name pmh-postgres -e POSTGRES_PASSWORD=pmh-dev-only \\\n' +
      '          -e POSTGRES_USER=pmh -e POSTGRES_DB=pmh -p 5432:5432 postgres:17-alpine\n',
  )
}

let sql: postgres.Sql

beforeAll(() => {
  if (URL_FROM_ENV === undefined) return
  sql = postgres(URL_FROM_ENV, { max: 2, onnotice: () => undefined })
})

afterAll(async () => {
  if (URL_FROM_ENV === undefined) return
  await sql.end({ timeout: 5 })
})

run('PostgreSQL: Migrationen gegen eine echte Datenbank', () => {
  test('wendet das Schema auf eine frische Datenbank an', async () => {
    const target = targetOf(sql)
    // Sauberer Anfang: die Tabellen dieses Schemas werden entfernt, damit der
    // Test wiederholbar ist. `CASCADE` nimmt die Fremdschlüssel mit.
    await target.exec(`
      DROP TABLE IF EXISTS auth_events, user_secrets, one_time_tokens, messages,
        chats, workspaces, api_keys, sessions, users, schema_migrations CASCADE;
    `)

    const report = await migrate(target)
    expect(report.applied).toEqual([1, 2])
    expect(report.version).toBe(SCHEMA_VERSION)
    expect(report.fresh).toBe(true)
  })

  test('legt alle neun Tabellen an', async () => {
    const rows = await targetOf(sql).query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    )
    const tables = rows.map((row) => row.table_name)
    for (const table of [
      'api_keys',
      'auth_events',
      'chats',
      'messages',
      'one_time_tokens',
      'sessions',
      'user_secrets',
      'users',
      'workspaces',
    ]) {
      expect(tables).toContain(table)
    }
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
        INSERT INTO sessions (id, user_id, token_hash, csrf_hash, idle_expires_at, absolute_expires_at)
        VALUES ('33333333-3333-4333-8333-333333333333',
                '11111111-1111-4111-8111-111111111111',
                'kein-hash', repeat('a', 64), now() + interval '1 hour', now() + interval '1 day');
      `)
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause)
    }
    expect(message).toContain('sessions_token_hash_hex')
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
      INSERT INTO messages (id, chat_id, role, content_cipher) VALUES
        ('01JC0000000000000000000001', '66666666-6666-4666-8666-666666666666', 'user', '\\x01'::bytea),
        ('01JC0000000000000000000002', '66666666-6666-4666-8666-666666666666', 'assistant', '\\x02'::bytea);
    `)
    // Der Benutzer verschwindet — und mit ihm Workspace, Chat und Nachrichten.
    await target.exec(`DELETE FROM users WHERE id = '11111111-1111-4111-8111-111111111111';`)

    const counts = await target.query<{ table_name: string; n: string }>(`
      SELECT 'workspaces' AS table_name, count(*)::text AS n FROM workspaces
      UNION ALL SELECT 'chats', count(*)::text FROM chats
      UNION ALL SELECT 'messages', count(*)::text FROM messages
      UNION ALL SELECT 'sessions', count(*)::text FROM sessions;
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
      INSERT INTO messages (chat_id, id, role, content_cipher)
      SELECT ('99999999-9999-4999-8999-' || lpad(c::text, 12, '0'))::uuid,
             '01JC' || lpad(c::text, 4, '0') || lpad(g::text, 18, '0'),
             'user', '\\x01'::bytea
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
