/**
 * `@prometheus-harness/db-schema` — das PostgreSQL-Schema als versionierte Migrationen.
 *
 * **Warum SQL und nicht ein ORM.** Ein ORM versteckt genau die Dinge, die bei
 * Sicherheit und Skalierung entscheiden: Indizes, Teilindizes, `ON DELETE`,
 * Prüfregeln, Zeilensperren. Wer sie nicht schreibt, bekommt sie zufällig. Hier
 * steht das Schema als **SQL in eigenen Dateien** — lesbar, prüfbar mit jedem
 * Werkzeug, und für einen Datenbankfachmann in fünf Minuten beurteilbar.
 *
 * **Warum eigene `.sql`-Dateien und nicht Zeichenketten im Code.** Der Text ist
 * ein Artefakt für sich: er hat eine andere Syntax, andere Fehlermeldungen und
 * andere Prüfwerkzeuge. In einer TypeScript-Datei wäre er ein Zitat; in einer
 * `.sql`-Datei ist er das, was er ist. Bun lädt `.sql` direkt als Text
 * (`import sql from './x.sql'`).
 *
 * **Warum Migrationen mit Prüfsumme.** Eine Migration, die nachträglich geändert
 * wird, ist die häufigste Ursache für „bei mir läuft es, bei dir nicht": zwei
 * Datenbanken behaupten, dieselbe Fassung zu haben, und haben verschiedene
 * Spalten. Die Prüfsumme macht daraus einen **Fehler statt einer Überraschung** —
 * der Läufer verweigert die Arbeit, wenn eine angewandte Migration sich geändert
 * hat.
 *
 * **Die Liste wird nur erweitert, nie umgeschrieben.** Eine neue Migration kommt
 * **hinten** dazu.
 *
 * @module @prometheus-harness/db-schema
 */

import m0001 from '../migrations/0001_identitaet.sql' with { type: 'text' }
import m0002 from '../migrations/0002_workspaces_chats.sql' with { type: 'text' }
import m0003 from '../migrations/0003_sitzungen_und_gespraeche.sql' with { type: 'text' }
import m0004 from '../migrations/0004_mandantentrennung.sql' with { type: 'text' }
import m0005 from '../migrations/0005_benutzerprofile.sql' with { type: 'text' }
import m0006 from '../migrations/0006_wissensspeicher.sql' with { type: 'text' }
import m0007 from '../migrations/0007_obsidian.sql' with { type: 'text' }
import m0008 from '../migrations/0008_sitzungsprotokoll.sql' with { type: 'text' }

// ---------------------------------------------------------------------------
// Migrationstyp
// ---------------------------------------------------------------------------

/** Eine Migration: eine Nummer, ein Name, ein SQL-Text. */
export interface Migration {
  /** Fortlaufende Nummer ab 1. Bestimmt die Reihenfolge. */
  readonly version: number
  /** Kurzer Name für Protokoll und Fehlersuche. */
  readonly name: string
  /** Das SQL. Mehrere Anweisungen sind erlaubt. */
  readonly sql: string
}

/**
 * Alle Migrationen in Anwendungsreihenfolge.
 *
 * **Diese Liste wird nur erweitert, nie umgeschrieben.** Der Läufer prüft die
 * Prüfsumme jeder bereits angewandten Migration; eine Änderung führt zu einem
 * **Fehler**, nicht zu einer stillen Abweichung zwischen zwei Datenbanken.
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'identitaet-benutzer-sitzungen-api-schluessel', sql: m0001 },
  { version: 2, name: 'workspaces-chats-nachrichten', sql: m0002 },
  { version: 3, name: 'anmeldesitzungen-umbenannt-gespraechssitzungen', sql: m0003 },
  // Die Mandantentrennung sitzt in der STRUKTUR, nicht in einer Abfrage: jede
  // Zeile traegt einen Mandanten, und die Datenbank lehnt einen Widerspruch ab.
  // Begruendung und der Fallstrick mit `ON DELETE SET NULL` stehen im Kopf der
  // Datei; die Probe ist `tests/proben/mandantentrennung.sql`.
  { version: 4, name: 'mandantentrennung-an-fremdschluesseln', sql: m0004 },
  // Die Isolation je Benutzer wird dauerhaft. Die Bedingungen spiegeln
  // `SandboxPolicy::validate()` aus `services/pmh-sandbox` — ein hier
  // gespeichertes Profil darf der Dienst nicht ablehnen.
  { version: 5, name: 'benutzerprofile-isolation-je-benutzer', sql: m0005 },
  // D1: der Wissensspeicher. Beide Tabellen tragen den Mandanten **von Anfang
  // an**, und jeder Verweis ist zusammengesetzt — ein Stueck von B kann
  // strukturell nicht an einem Dokument von A haengen. Was das NICHT leistet
  // (Leseabfragen ohne Filter), steht im Kopf der Datei.
  { version: 6, name: 'wissensspeicher-dokumente-und-textstuecke', sql: m0006 },
  // D2: Obsidian. **Entscheidet NICHT, wer gewinnt** — die Tabellen tragen, was
  // ein Abgleich in BEIDE Richtungen braucht. Die Regel, welcher Benutzer welchen
  // Vault-Pfad bekommt, ist offen und steht in
  // `docs/decisions/obsidian-gedaechtnis-oder-ansicht.md`.
  { version: 7, name: 'obsidian-vaults-notizen-etiketten-verweise', sql: m0007 },
  // **Das Sitzungsprotokoll.** Der Kern speichert Sitzungen heute als Dateien
  // (`session.v4.jsonl.zstd`, gemessen 88 Ordner im Bau-Home). Diese Migration
  // macht die Datenbank faehig, das Protokoll aufzunehmen: die Spalten, die die
  // Naht `ctx.sessionPersistence` braucht (Vererbungsschnitt, Schreibherrschaft),
  // die Tabelle `session_events` — und **Row Level Security mit der LAUTEN Form**
  // der Bedingung (ohne `missing_ok`), damit ein fehlender Mandant den Fehler
  // `42704` wirft statt still null Zeilen zu liefern.
  { version: 8, name: 'sitzungsprotokoll-und-schreibherrschaft', sql: m0008 },
]

/** Die Fassung, die dieses Paket erzeugt — die höchste Migrationsnummer. */
export const SCHEMA_VERSION = MIGRATIONS.reduce((max, migration) => Math.max(max, migration.version), 0)

// ---------------------------------------------------------------------------
// Prüfsumme
// ---------------------------------------------------------------------------

/**
 * Bildet die Prüfsumme eines Migrations-SQL.
 *
 * **Warum SHA-256 über den SQL-Text und nicht über die Datei.** Der Text ist die
 * Wahrheit; Zeilenenden, Kodierung und der Dateiname sind Beiwerk. Die
 * Normalisierung der Zeilenenden ist nötig, weil Git auf Windows `CRLF` und auf
 * Linux `LF` auscheckt — ohne sie hätten dieselben Migrationen auf zwei Rechnern
 * verschiedene Prüfsummen.
 *
 * @param sql - der Migrations-Text
 * @returns die Prüfsumme als Hexadezimaltext
 */
export function checksumOf(sql: string): string {
  const normalized = sql.replace(/\r\n/g, '\n').trim()
  return new Bun.CryptoHasher('sha256').update(normalized).digest('hex')
}

// ---------------------------------------------------------------------------
// Läufer-Schnittstelle
// ---------------------------------------------------------------------------

/**
 * Der Zugang zur Datenbank, den der Läufer braucht.
 *
 * **Warum eine eigene Schnittstelle und kein `postgres`-Typ.** Damit der Läufer
 * **ohne eine laufende Datenbank** geprüft werden kann: die Tests setzen eine
 * Attrappe ein und prüfen Reihenfolge, Prüfsummenprüfung und Fehlerfälle. Ein
 * Läufer, der nur gegen eine echte Datenbank prüfbar ist, wird nicht geprüft.
 */
export interface MigrationTarget {
  /** Führt SQL aus, ohne etwas zurückzugeben. */
  exec(sql: string): Promise<void>
  /** Führt SQL aus und liefert die Zeilen. */
  query<T>(sql: string, params?: readonly unknown[]): Promise<readonly T[]>
}

/** Eine Zeile der Migrationstabelle. */
export interface AppliedMigration {
  readonly version: number
  readonly name: string
  readonly checksum: string
  readonly applied_at: string
}

/** Was ein Lauf getan hat. */
export interface MigrationReport {
  /** Die angewandten Fassungen, aufsteigend. Leer heißt: nichts zu tun. */
  readonly applied: readonly number[]
  /** Die Fassung der Datenbank **nach** dem Lauf. */
  readonly version: number
  /** Ob die Datenbank vor dem Lauf leer war. */
  readonly fresh: boolean
}

/** Ein Befund, der den Lauf abbricht. */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

const MIGRATION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    integer PRIMARY KEY,
  name       text NOT NULL,
  checksum   text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`

/**
 * Wendet alle fehlenden Migrationen an — in Reihenfolge, jede in einer eigenen
 * Transaktion.
 *
 * **Warum jede Migration eine eigene Transaktion bekommt.** PostgreSQL kann DDL
 * transaktional ausführen; eine Migration, die mittendrin scheitert, wird damit
 * vollständig zurückgerollt. Alle Migrationen in **einer** Transaktion
 * zusammenzufassen würde dagegen bei einem Fehler in Nummer 5 auch die Nummern
 * 1–4 zurücknehmen. Getrennt gilt: was gelungen ist, bleibt gelungen; was
 * scheitert, wird benannt.
 *
 * **Was bei einer geänderten Migration geschieht: Abbruch.** Nicht „erneut
 * anwenden", nicht „überspringen". Zwei Datenbanken mit derselben Fassungsnummer
 * und verschiedenen Spalten sind schlimmer als ein Fehlschlag, der auffällt.
 *
 * @param target - der Datenbankzugang
 * @param migrations - die Migrationen; Vorgabe ist {@link MIGRATIONS}
 * @returns der Bericht
 * @throws MigrationError bei geänderter Prüfsumme, Lücke in der Liste oder
 *   fehlgeschlagener Migration
 */
export async function migrate(
  target: MigrationTarget,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationReport> {
  assertWellFormed(migrations)

  await target.exec(MIGRATION_TABLE)
  const rows = await target.query<AppliedMigration>(
    'SELECT version, name, checksum, applied_at::text AS applied_at FROM schema_migrations ORDER BY version',
  )
  const applied = new Map(rows.map((row) => [row.version, row]))

  // Erst prüfen, dann anwenden: eine Abweichung soll auffallen, **bevor**
  // irgendetwas verändert wird.
  for (const migration of migrations) {
    const previous = applied.get(migration.version)
    if (previous === undefined) continue
    const expected = checksumOf(migration.sql)
    if (previous.checksum !== expected) {
      throw new MigrationError(
        `Migration ${migration.version} (${migration.name}) wurde nach dem Anwenden geändert: ` +
          `erwartete Prüfsumme ${expected}, in der Datenbank steht ${previous.checksum}. ` +
          'Eine angewandte Migration wird nie umgeschrieben — eine neue kommt hinten dazu.',
      )
    }
  }

  const fresh = rows.length === 0
  const done: number[] = []
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue
    const checksum = checksumOf(migration.sql)
    try {
      await target.exec(migration.sql)
      await target.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
        migration.version,
        migration.name,
        checksum,
      ])
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      throw new MigrationError(
        `Migration ${migration.version} (${migration.name}) ist gescheitert: ${message}`,
      )
    }
    done.push(migration.version)
  }

  const highest = migrations.reduce((max, migration) => Math.max(max, migration.version), 0)
  return { applied: done, version: done.length > 0 ? highest : currentVersion(rows), fresh }
}

/**
 * Prüft die Migrationsliste auf Formfehler, **bevor** die Datenbank angefasst wird.
 *
 * Geprüft wird: Nummern lückenlos ab 1, aufsteigend, keine Doppelten, kein
 * leerer Name, kein leeres SQL. Eine Lücke in der Liste ist kein
 * Schönheitsfehler: sie bedeutet, dass eine Migration fehlt — und dann ist die
 * Datenbank an einer Stelle, die niemand vorgesehen hat.
 *
 * @param migrations - die zu prüfende Liste
 * @throws MigrationError bei einem Formfehler
 */
export function assertWellFormed(migrations: readonly Migration[]): void {
  if (migrations.length === 0) throw new MigrationError('Die Migrationsliste ist leer')
  let expected = 1
  for (const migration of migrations) {
    if (migration.version !== expected) {
      throw new MigrationError(
        `Migrationsnummern müssen bei 1 beginnen und lückenlos aufsteigen: erwartet ${expected}, gefunden ${migration.version}`,
      )
    }
    if (migration.name.trim() === '') {
      throw new MigrationError(`Migration ${migration.version} hat keinen Namen`)
    }
    if (migration.sql.trim() === '') {
      throw new MigrationError(`Migration ${migration.version} hat kein SQL`)
    }
    expected += 1
  }
}

/** Die höchste angewandte Fassung aus den gelesenen Zeilen. */
function currentVersion(rows: readonly AppliedMigration[]): number {
  return rows.reduce((max, row) => Math.max(max, row.version), 0)
}

/**
 * Liest die Fassung einer Datenbank, ohne etwas zu verändern.
 *
 * @param target - der Datenbankzugang
 * @returns die höchste angewandte Fassung; `0` heißt „noch keine Migration"
 */
export async function currentSchemaVersion(target: MigrationTarget): Promise<number> {
  const rows = await target
    .query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .catch((): readonly { version: number }[] => [])
  return rows[0]?.version ?? 0
}
