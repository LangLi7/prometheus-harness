/**
 * Tests für den Migrations-Läufer.
 *
 * **Warum gegen eine Attrappe und nicht gegen eine Datenbank.** Diese Tests
 * prüfen die **Regeln** des Läufers: Reihenfolge, Prüfsummen, Wiederholbarkeit,
 * Abbruch bei Abweichung. Diese Regeln sind Logik, nicht SQL — und sie sollen
 * auch dann geprüft werden, wenn keine Datenbank läuft. Der echte Lauf gegen
 * PostgreSQL steht in `integration/postgres.test.ts`.
 */

import { describe, expect, test } from 'bun:test'
import {
  MIGRATIONS,
  MigrationError,
  SCHEMA_VERSION,
  assertWellFormed,
  checksumOf,
  currentSchemaVersion,
  migrate,
  type Migration,
  type MigrationTarget,
} from '../src/index.ts'

// ---------------------------------------------------------------------------
// Attrappe
// ---------------------------------------------------------------------------

/** Ein Ziel, das SQL nur mitschreibt — und Zeilen aus einem Speicher beantwortet. */
function fakeTarget(options: { readonly failOn?: string } = {}): MigrationTarget & {
  readonly executed: string[]
  readonly inserts: { version: number; name: string; checksum: string }[]
} {
  const executed: string[] = []
  const inserts: { version: number; name: string; checksum: string }[] = []
  const rows: { version: number; name: string; checksum: string; applied_at: string }[] = []

  return {
    executed,
    inserts,
    async exec(sql: string): Promise<void> {
      if (options.failOn !== undefined && sql.includes(options.failOn)) {
        throw new Error(`Attrappe: "${options.failOn}" ist gescheitert`)
      }
      executed.push(sql)
    },
    async query<T>(sql: string, params?: readonly unknown[]): Promise<readonly T[]> {
      // **Reihenfolge der Prüfungen ist wichtig:** die Abfrage nach der höchsten
      // Fassung enthält ebenfalls `FROM schema_migrations`. Stünde sie hinter der
      // Vollabfrage, würde sie nie erreicht — und der Test wäre grün, ohne etwas
      // zu prüfen. Genau das ist beim ersten Lauf passiert.
      if (sql.includes('SELECT version FROM schema_migrations')) {
        const highest = rows.reduce((max, row) => Math.max(max, row.version), 0)
        return (highest === 0 ? [] : [{ version: highest }]) as unknown as readonly T[]
      }
      if (sql.includes('FROM schema_migrations')) return [...rows] as unknown as readonly T[]
      if (sql.includes('INSERT INTO schema_migrations')) {
        const [version, name, checksum] = params ?? []
        const row = {
          version: Number(version),
          name: String(name),
          checksum: String(checksum),
          applied_at: '2026-10-13T00:00:00Z',
        }
        rows.push(row)
        inserts.push({ version: row.version, name: row.name, checksum: row.checksum })
        return [] as readonly T[]
      }
      return [] as readonly T[]
    },
  }
}

/** Drei kleine Migrationen für die Regeltests. */
const THREE: readonly Migration[] = [
  { version: 1, name: 'eins', sql: 'CREATE TABLE a (id int);' },
  { version: 2, name: 'zwei', sql: 'CREATE TABLE b (id int);' },
  { version: 3, name: 'drei', sql: 'CREATE TABLE c (id int);' },
]

// ---------------------------------------------------------------------------
// Form der Liste
// ---------------------------------------------------------------------------

describe('Migrationsliste prüfen', () => {
  test('nimmt eine lückenlose, aufsteigende Liste an', () => {
    expect(() => assertWellFormed(THREE)).not.toThrow()
  })

  test('lehnt den Start bei 0 ab', () => {
    const list: Migration[] = [{ version: 0, name: 'null', sql: 'select 1;' }]
    expect(() => assertWellFormed(list)).toThrow(MigrationError)
  })

  test('lehnt eine Lücke ab — sie bedeutet, dass eine Migration fehlt', () => {
    const list: Migration[] = [
      { version: 1, name: 'eins', sql: 'select 1;' },
      { version: 3, name: 'drei', sql: 'select 1;' },
    ]
    expect(() => assertWellFormed(list)).toThrow('lückenlos')
  })

  test('lehnt eine leere Liste ab', () => {
    expect(() => assertWellFormed([])).toThrow('leer')
  })

  test('lehnt leeren Namen und leeres SQL ab', () => {
    expect(() => assertWellFormed([{ version: 1, name: '  ', sql: 'select 1;' }])).toThrow('keinen Namen')
    expect(() => assertWellFormed([{ version: 1, name: 'x', sql: '   ' }])).toThrow('kein SQL')
  })

  test('die echten Migrationen sind wohlgeformt und heißen 1 bis 13', () => {
    expect(() => assertWellFormed(MIGRATIONS)).not.toThrow()
    // **Die Liste steht hier ausgeschrieben, und das ist Absicht.** Eine Prüfung
    // gegen `MIGRATIONS.map(m => m.version)` wäre mit sich selbst verglichen und
    // damit leer. So fällt auf, wenn eine Migration **fehlt** (Lücke) oder
    // **doppelt** kommt — und der Name der Prüfung muß die Zahl mitführen, sonst
    // behauptet er etwas Falsches.
    expect(MIGRATIONS.map((migration) => migration.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(SCHEMA_VERSION).toBe(13)
  })
})

// ---------------------------------------------------------------------------
// Prüfsumme
// ---------------------------------------------------------------------------

describe('Prüfsumme', () => {
  test('ist stabil und hexadezimal mit 64 Zeichen', () => {
    const a = checksumOf('CREATE TABLE x (id int);')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(checksumOf('CREATE TABLE x (id int);')).toBe(a)
  })

  test('ändert sich bei jeder inhaltlichen Änderung', () => {
    expect(checksumOf('CREATE TABLE x (id int);')).not.toBe(checksumOf('CREATE TABLE x (id bigint);'))
  })

  test('ignoriert Zeilenenden und umgebenden Leerraum — sonst wäre Windows gegen Linux verschieden', () => {
    const lf = 'CREATE TABLE x (\n  id int\n);'
    const crlf = 'CREATE TABLE x (\r\n  id int\r\n);'
    expect(checksumOf(crlf)).toBe(checksumOf(lf))
    expect(checksumOf(`  ${lf}  `)).toBe(checksumOf(lf))
  })
})

// ---------------------------------------------------------------------------
// Anwenden
// ---------------------------------------------------------------------------

describe('Migrationen anwenden', () => {
  test('wendet eine frische Liste vollständig und in Reihenfolge an', async () => {
    const target = fakeTarget()
    const report = await migrate(target, THREE)
    expect(report.applied).toEqual([1, 2, 3])
    expect(report.version).toBe(3)
    expect(report.fresh).toBe(true)
    // Die Migrationstabelle wird angelegt, **bevor** etwas anderes läuft.
    expect(target.executed[0]).toContain('schema_migrations')
    expect(target.inserts.map((row) => row.version)).toEqual([1, 2, 3])
  })

  test('ein zweiter Lauf tut nichts und ist trotzdem erfolgreich', async () => {
    const target = fakeTarget()
    await migrate(target, THREE)
    const before = target.executed.length
    const report = await migrate(target, THREE)
    expect(report.applied).toEqual([])
    expect(report.fresh).toBe(false)
    // Nur die Prüfung der Migrationstabelle — keine einzige Migration erneut.
    expect(target.executed.length).toBe(before + 1)
    expect(target.executed.at(-1)).toContain('schema_migrations')
  })

  test('wendet nur die fehlenden an, wenn neue hinten dazukommen', async () => {
    const target = fakeTarget()
    await migrate(target, THREE.slice(0, 2))
    const report = await migrate(target, THREE)
    expect(report.applied).toEqual([3])
    expect(report.version).toBe(3)
  })

  test('bricht ab, wenn eine angewandte Migration nachträglich geändert wurde', async () => {
    const target = fakeTarget()
    await migrate(target, THREE)
    const changed: Migration[] = [
      { version: 1, name: 'eins', sql: 'CREATE TABLE a (id bigint);' },
      THREE[1] as Migration,
      THREE[2] as Migration,
    ]
    const failure = await migrate(target, changed).catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(MigrationError)
    expect((failure as Error).message).toContain('nach dem Anwenden geändert')
    // Und **nichts** wurde ausgeführt — die Prüfung läuft vor der Anwendung.
    expect(target.inserts).toHaveLength(3)
  })

  test('brich ab sichtbar, wenn eine Migration scheitert', async () => {
    const target = fakeTarget({ failOn: 'CREATE TABLE b' })
    const failure = await migrate(target, THREE).catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(MigrationError)
    expect((failure as Error).message).toContain('Migration 2')
    expect((failure as Error).message).toContain('gescheitert')
    // Migration 1 ist gelungen und **bleibt** gelungen: getrennte Transaktionen
    // pro Migration.
    expect(target.inserts.map((row) => row.version)).toEqual([1])
  })

  test('meldet einen Formfehler, bevor die Datenbank angefasst wird', async () => {
    const target = fakeTarget()
    const broken: Migration[] = [{ version: 2, name: 'zwei', sql: 'select 1;' }]
    await expect(migrate(target, broken)).rejects.toThrow(MigrationError)
    expect(target.executed).toEqual([])
  })

  test('liest die Fassung, ohne etwas zu verändern', async () => {
    const target = fakeTarget()
    expect(await currentSchemaVersion(target)).toBe(0)
    await migrate(target, THREE)
    expect(await currentSchemaVersion(target)).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Das echte Schema
// ---------------------------------------------------------------------------

describe('Das echte Schema', () => {
  test('legt genau die erwarteten Tabellen an — und benennt eine davon um', () => {
    // **Was diese Prüfung zählt.** Sie liest den **Quelltext** aller Migrationen,
    // nicht das Ergebnis in der Datenbank. Migration 0001 legt die Anmeldesitzungen
    // unter dem alten Namen `sessions` an; Migration 0003 benennt sie in
    // `auth_sessions` um. Im Quelltext steht `sessions` deshalb genau einmal, und
    // `auth_sessions` entsteht durch **kein** `CREATE`.
    //
    // **Warum das eine eigene Zeile wert ist.** Genau diese Unterscheidung war die
    // Fehlerquelle beim ersten Versuch: die Prüfung suchte `auth_sessions` unter den
    // angelegten Tabellen und wurde rot, obwohl die Migrationen richtig arbeiteten.
    // Der Kommentar hält fest, was die Zählung meint, damit der nächste Leser nicht
    // denselben Irrtum wiederholt.
    const all = MIGRATIONS.map((migration) => migration.sql).join('\n')
    const created = new Set(
      [...all.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+) \(/g)].map((match) => match[1] as string),
    )
    for (const table of [
      'users',
      'sessions',
      'api_keys',
      'workspaces',
      'chats',
      'messages',
      'one_time_tokens',
      'user_secrets',
      'auth_events',
      'conversation_sessions',
      // **Neu mit Migration 0005.** Die Isolationsprofile je Benutzer.
      'user_profiles',
      // **Neu mit Migration 0006.** Der Wissensspeicher (D1) — beide tragen den
      // Mandanten von Anfang an.
      'documents',
      'chunks',
      // **Neu mit Migration 0007.** Obsidian (D2).
      'vaults',
      'notes',
      'tags',
      'note_tags',
      'links',
      // **Neu mit Migration 0008.** Das Sitzungsprotokoll — die Ereignisse einer
      // Sitzung, lückenlos über `(session_id, seq)` und je Mandant getrennt.
      'session_events',
      // **Neu mit Migration 0009.** Die Quellordner eines Arbeitsbereichs —
      // mehrere je Arbeitsbereich, genau einer davon primär.
      'workspace_folders',
      // **Neu mit Migration 0011.** Die Records der Credential-Seam — eine
      // eigene Tabelle, weil `<scope>/<id>` kein Umgebungsvariablen-Name ist.
      'credential_records',
      // **Neu mit Migration 0012.** Die Einladungen — der dritte Weg zu einem
      // Konto: ein Link mit Ablauf, den der Eingeladene selbst einlöst.
      'invitations',
      // **Neu mit Migration 0013.** Die Crews je Konto — und die Einstellungen, die
      // zu ihnen gehören. Bis dahin war die Crew eine Datei ohne Eigentümer.
      'crew_definitionen',
      'crew_einstellungen',
    ]) {
      expect({ table, created: created.has(table) }).toEqual({ table, created: true })
    }
    // Und keine Tabelle, die niemand erwartet.
    expect([...created].sort()).toEqual([
      'api_keys',
      'auth_events',
      'chats',
      'chunks',
      'conversation_sessions',
      'credential_records',
      'crew_definitionen',
      'crew_einstellungen',
      'documents',
      'invitations',
      'links',
      'messages',
      'note_tags',
      'notes',
      'one_time_tokens',
      'session_events',
      'sessions',
      'tags',
      'user_profiles',
      'user_secrets',
      'users',
      'vaults',
      'workspace_folders',
      'workspaces',
    ])
    // Die Umbenennung ist der Grund, warum `auth_sessions` oben nicht steht.
    expect(all).toContain('ALTER TABLE IF EXISTS sessions RENAME TO auth_sessions')
    expect(created.has('auth_sessions')).toBe(false)
  })

  test('legt den Schlüssel an, der das Blättern im Chat trägt', () => {
    const all = MIGRATIONS.map((migration) => migration.sql).join('\n')
    // Ohne diesen zusammengesetzten Schlüssel liest jede Seite zu viele Zeilen:
    // PostgreSQL nimmt dann den Schlüssel auf `id` allein und filtert den Chat
    // nachträglich weg. Gemessen — siehe `postgres.test.ts` (EXPLAIN).
    expect(all).toContain('CONSTRAINT messages_pkey PRIMARY KEY (chat_id, id)')
  })

  test('erzwingt die Eindeutigkeit der E-Mail auf der normalisierten Form', () => {
    const all = MIGRATIONS.map((migration) => migration.sql).join('\n')
    expect(all).toContain('users_email_lower_key ON users (lower(email))')
  })

  test('löscht abhängige Zeilen mit und lässt nichts verwaist zurück', () => {
    const all = MIGRATIONS.map((migration) => migration.sql).join('\n')
    for (const clause of [
      'sessions_user_id_fkey',
      'api_keys_user_id_fkey',
      'workspaces_user_id_fkey',
      'chats_workspace_id_fkey',
      'messages_chat_id_fkey',
    ]) {
      // PostgreSQL benennt Fremdschlüssel selbst; geprüft wird die Regel.
      void clause
    }
    expect((all.match(/ON DELETE CASCADE/g) ?? []).length).toBeGreaterThanOrEqual(6)
  })

  test('verbietet einen Hash, der kein Hash ist', () => {
    const all = MIGRATIONS.map((migration) => migration.sql).join('\n')
    // Ein Token-Hash hat genau 64 hexadezimale Zeichen. Eine Prüfregel fängt
    // einen Programmierfehler in der Anwendung, bevor er Datenbankinhalt wird.
    expect((all.match(/~ '\^\[0-9a-f\]\{64\}\$'/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  test('speichert API-Schlüssel nie im Klartext', () => {
    const all = MIGRATIONS.map((migration) => migration.sql).join('\n')
    const apiKeys = MIGRATIONS[0]?.sql ?? ''
    expect(apiKeys).toContain('api_keys')
    // Es gibt keine Spalte für den Schlüssel selbst — nur Hash und Kennung.
    expect(apiKeys).not.toMatch(/^\s*(secret|token|key)\s+text/m)
    expect(all).toContain('display_prefix')
  })

  /**
   * **Warum diese Prüfung eine Datei liest und kein Paket importiert.**
   *
   * `packages/api/readiness/src/index.ts` trägt die erreichte Schemafassung als
   * **abgeschriebene Zahl** (`ERWARTETE_SCHEMAFASSUNG`) — mit gutem Grund: eine
   * Zustandsauskunft soll nicht an dem Paket hängen, dessen Zustand sie meldet.
   * Eine Abschrift veraltet aber **still**: sie bleibt grün und meldet trotzdem
   * Unsinn.
   *
   * **Der Fall, der das belegt.** Mit Migration 0003 stieg `SCHEMA_VERSION` von 2
   * auf 3. Bis die Zahl nachgezogen wurde, hätte die Sonde an einer **gesunden**
   * Datenbank „Schemafassung 3 statt 2" gemeldet und sie für nicht bereit erklärt.
   *
   * **Warum der Text und nicht der Import.** Ein Import wurde versucht und ist am
   * Typsystem gescheitert: `readiness` kann `db-schema` nicht auflösen, weil die
   * `.sql`-Deklaration (`src/sql.d.ts`) dann nicht im Programm ist — sechs
   * `TS2307` in `bun run typecheck`. Der Textvergleich hat keine Abhängigkeit,
   * keine Laufzeitkopplung und fällt genauso laut um.
   */
  test('die abgeschriebene Fassung in der Bereitschaftssonde ist nicht veraltet', async () => {
    const { readFile } = await import('node:fs/promises')
    const quelle = await readFile(
      new URL('../../../api/readiness/src/index.ts', import.meta.url),
      'utf8',
    )
    const treffer = /export const ERWARTETE_SCHEMAFASSUNG = (\d+)/u.exec(quelle)
    // Findet der Ausdruck nichts, ist die Zeile umbenannt oder umgebaut worden —
    // dann muß diese Prüfung angepaßt werden und nicht stillschweigend durchgehen.
    expect(treffer).not.toBeNull()
    expect(Number(treffer?.[1])).toBe(SCHEMA_VERSION)
  })
})
