/**
 * Vertragsprüfung der Migration 8 — **das Sitzungsprotokoll gegen eine echte PostgreSQL**.
 *
 * ## Was hier geprüft wird
 *
 * Die Migration behauptet drei Dinge. Jedes wird **ausgeführt**, nicht gelesen:
 *
 * | Behauptung | Prüfung |
 * |---|---|
 * | Das Protokoll ist anhängend und lückenlos adressierbar | zweimal dasselbe `(session_id, seq)` → Verstoß |
 * | Ein Ereignis kann nicht am fremden Mandanten hängen | Einfügen mit fremder `user_id` → Verstoß |
 * | Die Trennung ist **laut**, nicht still | Abfrage **ohne** Mandant → **42704**, nicht 0 Zeilen |
 *
 * Dazu die Gegenprobe zur Trennung: mit Mandant A sieht man **genau** die Zeilen von A.
 *
 * ## Warum alles in einer Transaktion mit RÜCKWÄRTSLAUF
 *
 * Diese Prüfung darf **nichts** hinterlassen. Sie läuft gegen die Datenbank des Betreibers;
 * jede Zeile, die sie anlegt, verschwindet mit dem `ROLLBACK`. Deshalb auch kein `DROP` und
 * kein `TRUNCATE` — die Prüfung ist **lesend bis auf ihre eigene, zurückgenommene Arbeit**.
 *
 * ## Zwei Rollen, zwei Absichten
 *
 * `MIGRATION_DATABASE_URL` ist `pmh_owner` (Eigentümerin, umgeht die Bedingungen),
 * `DATABASE_URL` ist `pmh_app` (Anwendung, wird gefiltert). Genau dieser Unterschied ist der
 * Gegenstand der Prüfung — mit nur einer Rolle wäre sie wertlos.
 *
 * ```powershell
 * bun test packages/auth/db-schema/tests/session-log.test.ts
 * ```
 *
 * @module @prometheus-harness/db-schema/tests/sitzungsprotokoll
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
    'HINWEIS: Prüfungen des Sitzungsprotokolls übersprungen — MIGRATION_DATABASE_URL oder DATABASE_URL fehlt.',
  )
}

/**
 * Führt `arbeit` in einer Transaktion aus und nimmt sie **immer** zurück.
 *
 * **Warum die Typen vom Treiber kommen und nicht aus `Parameters<…>`.** Der erste Entwurf
 * schrieb `Parameters<Parameters<typeof sql.begin>[0]>[0]` — und der Typlauf wurde rot:
 * `begin` ist **überladen** (`begin`, `begin(options, …)`), und `Parameters` greift sich eine
 * davon. Der Typ `postgres.TransactionSql` steht im Treiber selbst; ihn zu benutzen ist kürzer
 * **und** richtig (`node_modules/postgres/types/index.d.ts:723`).
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

describe.skipIf(!bereit)('Sitzungsprotokoll (Migration 8)', () => {
  const eigentuemer = bereit ? postgres(URL_EIGENTUEMER, { max: 1 }) : undefined
  const anwendung = bereit ? postgres(URL_ANWENDUNG, { max: 1 }) : undefined

  /**
   * Legt **zwei Mandanten selbst an** und gibt ihre Kennungen zurück.
   *
   * **Warum nicht aus dem Bestand gelesen.** Der erste Entwurf las zwei Benutzer aus
   * `pmh.users`. Auf der Betriebsdatenbank ging das gut — dort liegen drei. Gegen eine
   * **frische** Datenbank fiel die Prüfung um (gemessen am 14.10.2026: 3 pass, 5 fail),
   * weil es keine Benutzer gab. Das Haus hat die Regel längst: *„Jeder Fall stellt seinen
   * Zustand SELBST her"* (`erstlogin.test.ts`). Diese Prüfung hielt sich nicht daran.
   *
   * Alles geschieht **innerhalb** der Transaktion, die ohnehin zurückgenommen wird.
   *
   * @param tx - die Transaktion
   * @returns zwei Kennungen (Mandant A und B) samt ihrer Arbeitsbereiche
   */
  const zweiMandanten = async (tx: postgres.TransactionSql) => {
    const a = crypto.randomUUID()
    const b = crypto.randomUUID()
    await tx`insert into pmh.users (id, email, password_hash, display_name, role)
             values (${a}, ${'sitzung-a-' + a + '@probe.invalid'}, null, 'A', 'user'),
                    (${b}, ${'sitzung-b-' + b + '@probe.invalid'}, null, 'B', 'user')`
    return { a, b }
  }

  test('die Tabelle und die Spalten sind da, RLS ist eingeschaltet', async () => {
    const t = await eigentuemer!`
      select c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'pmh' and c.relname = 'session_events'`
    expect(t.length).toBe(1)
    expect(t[0]?.rls).toBe(true)

    const s = await eigentuemer!`
      select column_name from information_schema.columns
      where table_schema = 'pmh' and table_name = 'conversation_sessions'
        and column_name in ('inherited_event_count', 'owner_token', 'owner_since')`
    expect(s.length).toBe(3)

    const p = await eigentuemer!`
      select policyname, qual from pg_policies
      where schemaname = 'pmh' and tablename = 'session_events'`
    expect(p.length).toBe(1)
    // **Die laute Form**: kein `missing_ok`.
    expect(String(p[0]?.qual)).toContain('current_setting')
    expect(String(p[0]?.qual)).not.toContain('missing_ok')
  })

  test('OHNE Mandant ist die Abfrage LAUT — 42704, nicht null Zeilen', async () => {
    const code = await fehlercode(async () => inTransaktion(anwendung!, async (tx) => tx`select 1 from pmh.session_events`))
    expect(code).toBe('42704')
  })

  test('MIT Mandant sieht die ANWENDUNG genau die eigenen Zeilen — und die fremden nicht', async () => {
    // **Als Anwendung, nicht als Eigentümerin.** Der erste Entwurf dieser Prüfung lief über
    // die Eigentümerin — und die **umgeht** die Bedingung (kein `FORCE`), also sah sie mit
    // Mandant B weiterhin beide Zeilen und die Prüfung wurde rot. Der Fehler lag im **Test**:
    // er maß die falsche Rolle. Die Trennung gilt für `pmh_app`.
    //
    // **Und alles in EINER Transaktion**: die Mandanten entstehen darin, sonst sähe die
    // Anwendung sie nicht (zwei Sitzungen sehen die Arbeit der anderen nicht, solange nichts
    // bestätigt ist).
    const ergebnis = await inTransaktion(anwendung!, async (tx) => {
      const { a, b } = await zweiMandanten(tx)
      const kennung = `probe-${String(Date.now())}`
      await tx`select set_config('pmh.user_id', ${a}, true)`

      // Kopf und zwei Ereignisse für Mandant A — als Anwendung, mit gesetztem Mandanten.
      await tx`insert into pmh.conversation_sessions (id, version, created_at, revision, user_id, is_seeded, inherited_event_count)
               values (${kennung}, 4, now(), 'probe', ${a}::uuid, false, 0)`
      await tx`insert into pmh.session_events (session_id, seq, user_id, value)
               values (${kennung}, 0, ${a}::uuid, '{"type":"probe","seq":0}'::jsonb),
                      (${kennung}, 1, ${a}::uuid, '{"type":"probe","seq":1}'::jsonb)`
      const eigene = await tx`select count(*)::int as n from pmh.session_events where session_id = ${kennung}`

      // Dieselbe Abfrage mit Mandant B — andere Sicht.
      await tx`select set_config('pmh.user_id', ${b}, true)`
      const fremde = await tx`select count(*)::int as n from pmh.session_events where session_id = ${kennung}`
      const fremderKopf = await tx`select count(*)::int as n from pmh.conversation_sessions where id = ${kennung}`

      return { eigene: eigene[0]?.n, fremde: fremde[0]?.n, fremderKopf: fremderKopf[0]?.n }
    })

    expect(ergebnis.eigene).toBe(2)
    expect(ergebnis.fremde).toBe(0)
    expect(ergebnis.fremderKopf).toBe(0)
  })

  test('die Eigentümerin sieht ALLES — kein FORCE, und das ist Absicht', async () => {
    // Die Umkehrung des vorigen Falls: dieselbe Zeile, andere Rolle. Die Eigentümerin legt
    // die Migrationen und muß alles sehen dürfen; die Anwendung wird gefiltert.
    const ergebnis = await inTransaktion(eigentuemer!, async (tx) => {
      const { a, b } = await zweiMandanten(tx)
      const kennung = `probe-eigentuemer-${String(Date.now())}`
      await tx`insert into pmh.conversation_sessions (id, version, created_at, revision, user_id, is_seeded, inherited_event_count)
               values (${kennung}, 4, now(), 'probe', ${a}::uuid, false, 0)`
      // Die Eigentümerin liest **ohne** Mandanten — und sieht die Zeile trotzdem.
      const ohneMandant = await tx`select count(*)::int as n from pmh.conversation_sessions where id = ${kennung}`
      const fremdGezaehlt = await tx`select count(*)::int as n from pmh.session_events where user_id = ${b}::uuid`
      return { ohneMandant: ohneMandant[0]?.n, fremdGezaehlt: fremdGezaehlt[0]?.n }
    })
    expect(ergebnis.ohneMandant).toBe(1)
    // Und für den Mandanten B gibt es keine Ereignisse — der Zähler läuft nur durch.
    expect(ergebnis.fremdGezaehlt).toBe(0)
  })

  test('zweimal dasselbe (session_id, seq) verstößt — anhängend, nicht überschreibbar', async () => {
    const code = await fehlercode(async () =>
      inTransaktion(eigentuemer!, async (tx) => {
        const { a } = await zweiMandanten(tx)
        const kennung = `probe-doppelt-${String(Date.now())}`
        await tx`insert into pmh.conversation_sessions (id, version, created_at, revision, user_id, is_seeded, inherited_event_count)
                 values (${kennung}, 4, now(), 'probe', ${a}::uuid, false, 0)`
        await tx`insert into pmh.session_events (session_id, seq, user_id, value)
                 values (${kennung}, 0, ${a}::uuid, '{"seq":0}'::jsonb)`
        await tx`insert into pmh.session_events (session_id, seq, user_id, value)
                 values (${kennung}, 0, ${a}::uuid, '{"seq":0,"nochmal":true}'::jsonb)`
      }),
    )
    expect(code).toBe('23505')
  })

  test('ein Ereignis am FREMDEN Mandanten wird abgelehnt', async () => {
    const code = await fehlercode(async () =>
      inTransaktion(anwendung!, async (tx) => {
        const { a, b } = await zweiMandanten(tx)
        await tx`select set_config('pmh.user_id', ${a}, true)`
        // Der Kopf gehört A, das Ereignis soll B gehören — die Bedingung lehnt das ab.
        const kennung = `probe-fremd-${String(Date.now())}`
        await tx`insert into pmh.conversation_sessions (id, version, created_at, revision, user_id, is_seeded, inherited_event_count)
                 values (${kennung}, 4, now(), 'probe', ${a}::uuid, false, 0)`
        await tx`insert into pmh.session_events (session_id, seq, user_id, value)
                 values (${kennung}, 0, ${b}::uuid, '{"seq":0}'::jsonb)`
      }),
    )
    // 42501 = die Bedingung selbst wehrt ab; 23503 = der zusammengesetzte Verweis.
    // Beides ist eine Abwehr — welcher zuerst greift, wird gemessen, nicht geraten.
    expect(['42501', '23503']).toContain(code)
  })

  test('Gabelung ohne Schnitt wird abgelehnt (die Prüfregel greift)', async () => {
    const code = await fehlercode(async () =>
      inTransaktion(eigentuemer!, async (tx) => {
        const { a } = await zweiMandanten(tx)
        await tx`insert into pmh.conversation_sessions (id, version, created_at, revision, user_id, is_seeded, inherited_event_count)
                 values (${`probe-seed-${String(Date.now())}`}, 4, now(), 'probe', ${a}::uuid, true, 0)`
      }),
    )
    expect(code).toBe('23514')
  })
})

if (bereit) {
  // Verbindungen schließen, damit der Testlauf endet.
  test('aufräumen', async () => {
    await postgres(URL_EIGENTUEMER, { max: 1 }).end()
    await postgres(URL_ANWENDUNG, { max: 1 }).end()
  })
}
