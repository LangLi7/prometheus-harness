/**
 * Migration 9 — **ein Arbeitsbereich mit mehreren Quellordnern**, gegen eine echte PostgreSQL.
 *
 * ## Was hier geprüft wird
 *
 * | Behauptung | Prüfung |
 * |---|---|
 * | Genau **ein** Primärordner je Arbeitsbereich | zweiter primärer Ordner → Verstoß (23505) |
 * | Derselbe Ordner nicht zweimal **im selben** Arbeitsbereich | gleicher Pfad nochmal → Verstoß |
 * | … aber **über zwei** Arbeitsbereiche erlaubt | gleicher Pfad, anderer Arbeitsbereich → geht |
 * | Ein Ordner hängt nie am fremden Mandanten | Einfügen am fremden Arbeitsbereich → Verstoß |
 * | Die Trennung ist **laut** | Abfrage ohne Mandant → **42704**, nicht 0 Zeilen |
 * | Mit dem Arbeitsbereich verschwinden seine Ordner | Löschen → Kaskade |
 * | `workspaces.root_path` ist **weg** | Spalte in `information_schema` → 0 |
 *
 * ## Warum alles in einer Transaktion mit RÜCKWÄRTSLAUF
 *
 * Dieselbe Begründung wie in `sitzungsprotokoll.test.ts`: die Prüfung darf **nichts**
 * hinterlassen. Sie läuft gegen eine Wegwerf-Datenbank, und jede Zeile, die sie anlegt,
 * verschwindet mit dem `ROLLBACK`.
 *
 * ## Zwei Rollen, zwei Absichten
 *
 * `MIGRATION_DATABASE_URL` ist `pmh_owner` (Eigentümerin, umgeht die Bedingungen),
 * `DATABASE_URL` ist `pmh_app` (Anwendung, wird gefiltert). Nur mit beiden ist die Trennung
 * überhaupt prüfbar.
 *
 * @module @prometheus-harness/db-schema/tests/arbeitsbereich-ordner
 */

import { describe, expect, test } from 'bun:test'
import postgres from 'postgres'

const URL_EIGENTUEMER = process.env.MIGRATION_DATABASE_URL
const URL_ANWENDUNG = process.env.DATABASE_URL

/** Ist eine Adresse brauchbar — nicht nur „vorhanden"? */
function brauchbar(adresse: string | undefined): adresse is string {
  return adresse !== undefined && adresse.trim() !== ''
}

const bereit = brauchbar(URL_EIGENTUEMER) && brauchbar(URL_ANWENDUNG)

if (!bereit) {
  console.log(
    'HINWEIS: Prüfungen der Quellordner übersprungen — MIGRATION_DATABASE_URL oder DATABASE_URL fehlt.',
  )
}

/**
 * Führt `arbeit` in einer Transaktion aus und nimmt sie **immer** zurück.
 *
 * @param sql - der Zugang
 * @param arbeit - die Arbeit **innerhalb** der Transaktion
 * @returns was `arbeit` zurückgibt, nach dem Rückwärtslauf
 */
async function inTransaktion<T>(
  sql: postgres.Sql,
  arbeit: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  let ergebnis: T | undefined
  try {
    await sql.begin(async (tx) => {
      ergebnis = await arbeit(tx)
      throw new Error('__ROLLBACK__')
    })
  } catch (f) {
    if (!(f instanceof Error) || f.message !== '__ROLLBACK__') throw f
  }
  return ergebnis as T
}

/** Fängt den Fehlercode einer Anweisung ab. */
async function fehlercode(arbeit: () => Promise<unknown>): Promise<string> {
  try {
    await arbeit()
    return 'KEIN FEHLER'
  } catch (f) {
    return String((f as { code?: string }).code ?? f)
  }
}

describe.skipIf(!bereit)('Quellordner (Migration 9)', () => {
  const eigentuemer = bereit ? postgres(URL_EIGENTUEMER, { max: 1 }) : undefined
  const anwendung = bereit ? postgres(URL_ANWENDUNG, { max: 1 }) : undefined

  /**
   * Legt zwei Mandanten mit je einem Arbeitsbereich an und gibt die Kennungen zurück.
   *
   * **Immer innerhalb der Transaktion** — nichts davon bleibt in der Datenbank.
   *
   * @param tx - die Transaktion
   * @returns die Kennungen
   */
  const zweiMandanten = async (tx: postgres.TransactionSql) => {
    const a = crypto.randomUUID()
    const b = crypto.randomUUID()
    await tx`insert into pmh.users (id, email, password_hash, display_name, role)
             values (${a}, ${'ordner-a-' + a + '@probe.invalid'}, null, 'A', 'user'),
                    (${b}, ${'ordner-b-' + b + '@probe.invalid'}, null, 'B', 'user')`
    const wa = crypto.randomUUID()
    const wb = crypto.randomUUID()
    await tx`insert into pmh.workspaces (id, user_id, name)
             values (${wa}, ${a}, 'Werkstatt A'), (${wb}, ${b}, 'Werkstatt B')`
    return { a, b, wa, wb }
  }

  test('die Tabelle, die Spalten und die Bedingungen sind da', async () => {
    const t = await eigentuemer!`
      select c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'pmh' and c.relname = 'workspace_folders'`
    expect(t.length).toBe(1)
    expect(t[0]?.rls).toBe(true)

    const s = await eigentuemer!`
      select column_name from information_schema.columns
      where table_schema = 'pmh' and table_name = 'workspace_folders'
        and column_name in ('pfad', 'ist_primaer', 'sortierung', 'bezeichnung', 'workspace_id', 'user_id')`
    expect(s.length).toBe(6)

    const p = await eigentuemer!`
      select qual from pg_policies
      where schemaname = 'pmh' and tablename = 'workspace_folders'`
    expect(p.length).toBe(1)
    // **Die laute Form**: kein `missing_ok`.
    expect(String(p[0]?.qual)).toContain('current_setting')
    expect(String(p[0]?.qual)).not.toContain('missing_ok')
  })

  test('`workspaces.root_path` ist WEG — sonst gäbe es zwei Orte für denselben Pfad', async () => {
    const c = await eigentuemer!`
      select count(*)::int as n from information_schema.columns
      where table_schema = 'pmh' and table_name = 'workspaces' and column_name = 'root_path'`
    expect(c[0]?.n).toBe(0)
  })

  test('genau EIN Primärordner — ein zweiter ist ein Verstoß', async () => {
    const ergebnis = await inTransaktion(eigentuemer!, async (tx) => {
      const m = await zweiMandanten(tx)
      await tx`insert into pmh.workspace_folders (id, workspace_id, user_id, pfad, ist_primaer)
               values (${crypto.randomUUID()}, ${m.wa}, ${m.a}, 'C:\\ordner\\eins', true)`
      return await fehlercode(async () => {
        await tx`insert into pmh.workspace_folders (id, workspace_id, user_id, pfad, ist_primaer)
                 values (${crypto.randomUUID()}, ${m.wa}, ${m.a}, 'C:\\ordner\\zwei', true)`
      })
    })
    // 23505 = eindeutiger Schlüssel verletzt (der Teilindex für den einen Primärordner).
    expect(ergebnis).toBe('23505')
  })

  test('mehrere NICHT-primäre Ordner sind erlaubt — das ist der Sinn der Migration', async () => {
    const n = await inTransaktion(eigentuemer!, async (tx) => {
      const m = await zweiMandanten(tx)
      await tx`insert into pmh.workspace_folders (id, workspace_id, user_id, pfad, ist_primaer, sortierung)
               values (${crypto.randomUUID()}, ${m.wa}, ${m.a}, 'C:\\ordner\\haupt', true, 0),
                      (${crypto.randomUUID()}, ${m.wa}, ${m.a}, 'C:\\ordner\\zweite', false, 1),
                      (${crypto.randomUUID()}, ${m.wa}, ${m.a}, 'C:\\ordner\\dritte', false, 2)`
      const r = await tx`select count(*)::int as n from pmh.workspace_folders where workspace_id = ${m.wa}`
      return r[0]?.n
    })
    expect(n).toBe(3)
  })

  test('derselbe Ordner zweimal im SELBEN Arbeitsbereich ist ein Verstoß', async () => {
    const ergebnis = await inTransaktion(eigentuemer!, async (tx) => {
      const m = await zweiMandanten(tx)
      await tx`insert into pmh.workspace_folders (id, workspace_id, user_id, pfad)
               values (${crypto.randomUUID()}, ${m.wa}, ${m.a}, 'C:\\ordner\\gleich')`
      return await fehlercode(async () => {
        await tx`insert into pmh.workspace_folders (id, workspace_id, user_id, pfad, ist_primaer)
                 values (${crypto.randomUUID()}, ${m.wa}, ${m.a}, 'C:\\ordner\\gleich', false)`
      })
    })
    expect(ergebnis).toBe('23505')
  })

  test('GEGENPROBE: derselbe Ordner in einem ZWEITEN Arbeitsbereich ist erlaubt', async () => {
    // Zwei Projekte können denselben Ordner betrachten wollen. Was ich nicht begründen kann,
    // verbiete ich nicht — die Eindeutigkeit gilt nur **je** Arbeitsbereich.
    const n = await inTransaktion(eigentuemer!, async (tx) => {
      const m = await zweiMandanten(tx)
      await tx`insert into pmh.workspace_folders (id, workspace_id, user_id, pfad)
               values (${crypto.randomUUID()}, ${m.wa}, ${m.a}, 'C:\\ordner\\geteilt'),
                      (${crypto.randomUUID()}, ${m.wb}, ${m.b}, 'C:\\ordner\\geteilt')`
      const r = await tx`select count(*)::int as n from pmh.workspace_folders where pfad = 'C:\\ordner\\geteilt'`
      return r[0]?.n
    })
    expect(n).toBe(2)
  })

  test('ein Ordner kann nicht am Arbeitsbereich eines FREMDEN Mandanten hängen', async () => {
    const ergebnis = await inTransaktion(eigentuemer!, async (tx) => {
      const m = await zweiMandanten(tx)
      // Arbeitsbereich von A, Mandant von B — der zusammengesetzte Verweis muß greifen.
      return await fehlercode(async () => {
        await tx`insert into pmh.workspace_folders (id, workspace_id, user_id, pfad)
                 values (${crypto.randomUUID()}, ${m.wa}, ${m.b}, 'C:\\ordner\\fremd')`
      })
    })
    // 23503 = Fremdschlüssel verletzt (das Paar existiert nicht).
    expect(ergebnis).toBe('23503')
  })

  test('ein relativer Pfad und einer mit Aufstieg werden abgewiesen', async () => {
    // **Jeder Fall in einer EIGENEN Transaktion.** Der erste Entwurf prüfte alle drei in
    // einer — und die zweite und dritte Antwort war dann **25P02**
    // (`in_failed_sql_transaction`): nach dem ersten Verstoß ist die Transaktion abgebrochen,
    // jede weitere Anweisung scheitert an ihr. Die Prüfung hätte also nie die **Prüfregel**
    // gemessen, sondern nur den Abbruch.
    const faelle: readonly (readonly [string, string])[] = [
      ['relativ', 'ordner/relativ'],
      ['aufstieg', 'C:\\ordner\\..\\geheim'],
      ['leer', '   '],
    ]
    const ergebnis: Record<string, string> = {}
    for (const [name, pfad] of faelle) {
      ergebnis[name] = await inTransaktion(eigentuemer!, async (tx) => {
        const m = await zweiMandanten(tx)
        return await fehlercode(async () => {
          await tx`insert into pmh.workspace_folders (id, workspace_id, user_id, pfad)
                   values (${crypto.randomUUID()}, ${m.wa}, ${m.a}, ${pfad})`
        })
      })
    }
    // 23514 = Prüfregel verletzt.
    expect(ergebnis).toEqual({ relativ: '23514', aufstieg: '23514', leer: '23514' })
  })

  test('OHNE Mandant ist die Abfrage LAUT — 42704, nicht null Zeilen (als Anwendung)', async () => {
    const code = await fehlercode(async () =>
      inTransaktion(anwendung!, async (tx) => tx`select 1 from pmh.workspace_folders`),
    )
    expect(code).toBe('42704')
  })

  test('MIT Mandant sieht die ANWENDUNG genau die eigenen Ordner — und die fremden nicht', async () => {
    // **Alles in EINER Transaktion** — und zwar mit der **Anwendung**. Zwei Transaktionen
    // wären zwei Sitzungen, und die zweite sähe die noch nicht bestätigten Zeilen der ersten
    // nicht: die Prüfung wäre dann grün, ohne etwas geprüft zu haben (der erste Entwurf hatte
    // genau diesen Fehler).
    const gesehen = await inTransaktion(anwendung!, async (tx) => {
      const a = crypto.randomUUID()
      const b = crypto.randomUUID()
      const wa = crypto.randomUUID()
      const wb = crypto.randomUUID()

      await tx`select set_config('pmh.user_id', ${a}, true)`
      await tx`insert into pmh.users (id, email, password_hash, display_name, role)
               values (${a}, ${'ordner-a-' + a + '@probe.invalid'}, null, 'A', 'user')`
      await tx`insert into pmh.workspaces (id, user_id, name) values (${wa}, ${a}, 'Werkstatt A')`
      await tx`insert into pmh.workspace_folders (id, workspace_id, user_id, pfad, ist_primaer)
               values (${crypto.randomUUID()}, ${wa}, ${a}, ${'C:\\ordner\\a'}, true)`

      const meins = await tx`select count(*)::int as n from pmh.workspace_folders where pfad = ${'C:\\ordner\\a'}`

      // **Mandant B, dieselbe Abfrage.** Die Zeile ist da — er sieht sie trotzdem nicht.
      await tx`select set_config('pmh.user_id', ${b}, true)`
      await tx`insert into pmh.users (id, email, password_hash, display_name, role)
               values (${b}, ${'ordner-b-' + b + '@probe.invalid'}, null, 'B', 'user')`
      await tx`insert into pmh.workspaces (id, user_id, name) values (${wb}, ${b}, 'Werkstatt B')`
      const fremd = await tx`select count(*)::int as n from pmh.workspace_folders where pfad = ${'C:\\ordner\\a'}`

      return { meins: meins[0]?.n, fremd: fremd[0]?.n }
    })
    expect(gesehen.meins).toBe(1)
    expect(gesehen.fremd).toBe(0)
  })

  test('mit dem Arbeitsbereich verschwinden seine Ordner', async () => {
    const n = await inTransaktion(eigentuemer!, async (tx) => {
      const m = await zweiMandanten(tx)
      await tx`insert into pmh.workspace_folders (id, workspace_id, user_id, pfad, ist_primaer)
               values (${crypto.randomUUID()}, ${m.wa}, ${m.a}, 'C:\\ordner\\kaskade', true)`
      await tx`delete from pmh.workspaces where id = ${m.wa}`
      const r = await tx`select count(*)::int as n from pmh.workspace_folders where workspace_id = ${m.wa}`
      return r[0]?.n
    })
    expect(n).toBe(0)
  })
})
