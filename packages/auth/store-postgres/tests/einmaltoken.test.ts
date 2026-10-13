/**
 * Das Einmal-Token gegen die **echte** Datenbank.
 *
 * ## Warum diese Datei neben den Regeln steht
 *
 * `packages/auth/reset` prüft die Regeln gegen eine Attrappe. Eine Attrappe kann
 * aber niemals belegen, was hier bewiesen werden soll:
 *
 * | Behauptung | warum die Attrappe sie nicht belegen kann |
 * |---|---|
 * | In der Spalte steht **nur der Hash** | die Attrappe ist meine eigene Erfindung; erst `one_time_tokens.token_hash`, der `CHECK` auf 64 Hexzeichen und die Zeile selbst sind die Tatsache |
 * | `verbrauche` ist **atomar** | eine Attrappe hat kein Nebenläufigkeitsproblem — sie ist ein `Set` im selben Thread |
 * | ein Reset widerruft **alle** Sitzungen | das ist eine Aussage über `auth_sessions`, nicht über eine Liste im Speicher |
 *
 * ## Die Sicherung
 *
 * Dieselbe wie in `postgres.test.ts` und aus demselben Grund: dieser Test
 * **schreibt** und **löscht**. Er vergleicht vor dem ersten Schreiben, worauf die
 * Verbindung zeigt — mit `DATABASE_URL`, also derselben Angabe, die die
 * Anwendung benutzt. Siehe `docs/status/mandantentrennung.md` §10.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import postgres from 'postgres'
import {
  Argon2PasswordHasher,
  authenticate,
  createSession,
  register,
  tokenHash,
} from '@prometheus-harness/auth'
import { migrate, type MigrationTarget } from '@prometheus-harness/db-schema'
import { erzeugeResetToken, loeseResetTokenEin, RESET_ZWECK } from '@prometheus-harness/reset'
import { erzeugeSpeicher, erzeugeTokenAblage, type SqlZugang } from '../src/index.ts'

const URL_FROM_ENV = process.env.PMH_TEST_DATABASE_URL

/** Siehe die Begründung in `postgres.test.ts`: ein **leerer** Wert ist nicht `undefined`. */
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
    `HINWEIS: Einmal-Token-Prüfungen übersprungen — ${OHNE_ZUGANG}.\n` +
      '  Die Regeln des Zurücksetzens sind davon unberührt (eigene Prüfungen in packages/auth/reset).\n' +
      '  Was hier fehlt, ist der Beweis gegen echte Spalten, echte Nebenbedingungen und echte Nebenläufigkeit.\n',
  )
}

const run = adresseGesetzt(URL_FROM_ENV) ? describe : describe.skip

/** Die Adressendung, mit der diese Datei ihre Daten wiederfindet. */
const TESTDOMAENE = '@einmaltoken.invalid'
const PASSWORT = 'Korrektheit-ist-kein-Zufall-2026'
const NEUES = 'Ein-ganz-neues-Passwort-2026'

let sql: postgres.Sql
let zugang: SqlZugang

beforeAll(async () => {
  if (!adresseGesetzt(URL_FROM_ENV)) return
  // **Vier Verbindungen statt zwei.** Die Nebenläufigkeitsprüfung unten muß zwei
  // Anweisungen wirklich **gleichzeitig** abschicken können. Mit `max: 1` würde
  // der Treiber sie hintereinander abarbeiten, und die Prüfung wäre grün, ohne
  // je eine Gleichzeitigkeit gesehen zu haben.
  sql = postgres(URL_FROM_ENV, { max: 4, onnotice: () => undefined })

  const angabe = await sql.unsafe<{ db: string }[]>('SELECT current_database() AS db')
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
      return await sql.unsafe(anweisung, werte as never[])
    },
  }

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
  // Nur die eigenen Daten — die Token hängen per `ON DELETE CASCADE` mit dran.
  await sql.unsafe(`DELETE FROM users WHERE email LIKE $1`, [`%${TESTDOMAENE}`]).catch(() => undefined)
  await sql.end({ timeout: 5 })
})

/** Legt ein Konto an und gibt es zurück. */
async function konto(name: string): Promise<{ id: string; email: string }> {
  const speicher = erzeugeSpeicher(zugang)
  const angelegt = await register(
    speicher.benutzer,
    new Argon2PasswordHasher(),
    `${name}${TESTDOMAENE}`,
    PASSWORT,
    'Einmaltoken',
    { maxUsers: 100_000, sink: speicher.spur },
  )
  if (!angelegt.ok) throw new Error(`Konto ${name} ließ sich nicht anlegen: ${angelegt.reason}`)
  return { id: angelegt.user.id, email: `${name}${TESTDOMAENE}` }
}

run('Einmal-Token gegen die echte Datenbank', () => {
  test('in der Zeile steht der Hash — das Klartext-Token ist nirgends', async () => {
    const wer = await konto('ablage')
    const ablage = erzeugeTokenAblage(zugang)
    const { token, id } = await erzeugeResetToken(ablage, wer.id, new Date())

    const roh = await sql.unsafe<{ token_hash: string; purpose: string; consumed_at: string | null }[]>(
      `SELECT token_hash, purpose, consumed_at FROM one_time_tokens WHERE id = $1`,
      [id],
    )
    expect(roh).toHaveLength(1)
    // **Der Hash und nichts anderes.** 64 Hexzeichen — genau das, was der
    // `CHECK` des Schemas verlangt, und genau das, was `tokenHash` liefert.
    expect(roh[0]?.token_hash).toBe(tokenHash(token))
    expect(roh[0]?.token_hash).toHaveLength(64)
    expect(roh[0]?.token_hash).not.toBe(token)
    expect(roh[0]?.purpose).toBe(RESET_ZWECK)
    expect(roh[0]?.consumed_at).toBeNull()

    // **Das Klartext-Token steht in keiner Spalte.** Nicht in `token_hash`, nicht
    // sonst irgendwo in der Zeile — geprüft über die ganze Zeile als Text.
    const ganzeZeile = await sql.unsafe<{ text: string }[]>(
      `SELECT one_time_tokens::text AS text FROM one_time_tokens WHERE id = $1`,
      [id],
    )
    expect(ganzeZeile[0]?.text).not.toContain(token)
  })

  test('finde sucht über den Hash — das Klartext-Token findet nichts', async () => {
    const wer = await konto('suche')
    const ablage = erzeugeTokenAblage(zugang)
    const { token, id, laeuftAb } = await erzeugeResetToken(ablage, wer.id, new Date())

    // Mit dem Token (Klartext) als Suchschlüssel darf nichts kommen.
    expect(await ablage.finde(token, RESET_ZWECK)).toBeUndefined()
    // Mit dem Hash kommt der Eintrag — und `expires_at` überlebt die Runde als Zeitpunkt.
    const gefunden = await ablage.finde(tokenHash(token), RESET_ZWECK)
    expect(gefunden?.id).toBe(id)
    expect(gefunden?.userId).toBe(wer.id)
    expect(gefunden?.verbraucht).toBe(false)
    // Auf die Sekunde genau: die Datenbank rundet nicht ab, was sie bekommt.
    expect(Math.abs((gefunden?.laeuftAb.getTime() ?? 0) - laeuftAb.getTime())).toBeLessThan(1000)
    // Und der Zweck trennt: derselbe Hash unter einem anderen Zweck findet nichts.
    expect(await ablage.finde(tokenHash(token), 'invite')).toBeUndefined()
  })

  test('verbrauche trifft genau einmal — hintereinander', async () => {
    const wer = await konto('nacheinander')
    const ablage = erzeugeTokenAblage(zugang)
    const { token, id } = await erzeugeResetToken(ablage, wer.id, new Date())

    expect(await ablage.verbrauche(id, new Date())).toBe(true)
    expect(await ablage.verbrauche(id, new Date())).toBe(false)
    expect(await ablage.verbrauche(id, new Date())).toBe(false)

    const gefunden = await ablage.finde(tokenHash(token), RESET_ZWECK)
    expect(gefunden?.verbraucht).toBe(true)
  })

  test('verbrauche trifft genau einmal — GLEICHZEITIG', async () => {
    // **Der eigentliche Grund für dieses UPDATE mit Bedingung.** Zwei Anfragen
    // mit demselben Token gleichzeitig: gelesen-und-dann-geschrieben hätten
    // **beide** „noch offen" gesehen und beide ein Paßwort setzen dürfen. Hier
    // muß genau einer gewinnen — und zwar meßbar, nicht behauptet.
    const wer = await konto('gleichzeitig')
    const ablage = erzeugeTokenAblage(zugang)
    const { id } = await erzeugeResetToken(ablage, wer.id, new Date())

    const ergebnisse = await Promise.all([
      ablage.verbrauche(id, new Date()),
      ablage.verbrauche(id, new Date()),
    ])
    expect(ergebnisse.filter((x) => x).length).toBe(1)
    expect(ergebnisse.filter((x) => !x).length).toBe(1)

    // **Und die Datenbank sagt dasselbe.** Ein `consumed_at`, nicht zwei.
    const roh = await sql.unsafe<{ n: number; gesetzt: number }[]>(
      `SELECT count(*)::int AS n, count(consumed_at)::int AS gesetzt
         FROM one_time_tokens WHERE id = $1`,
      [id],
    )
    expect(roh[0]?.n).toBe(1)
    expect(roh[0]?.gesetzt).toBe(1)
  })

  test('ein eingelöstes Token ist in der Datenbank als verbraucht markiert', async () => {
    const wer = await konto('eingeloest')
    const speicher = erzeugeSpeicher(zugang)
    const ablage = erzeugeTokenAblage(zugang)
    const { token, id } = await erzeugeResetToken(ablage, wer.id, new Date())

    const urteil = await loeseResetTokenEin(
      { ablage, benutzer: speicher.benutzer, sitzungen: speicher.sitzungen, hasher: new Argon2PasswordHasher() },
      token,
      NEUES,
      new Date(),
    )
    expect(urteil.ok).toBe(true)

    const roh = await sql.unsafe<{ consumed_at: string | null }[]>(
      `SELECT consumed_at FROM one_time_tokens WHERE id = $1`,
      [id],
    )
    // Ein **Zeitpunkt**, kein Schalter. Wann verbraucht wurde, ist die nützlichere
    // Angabe — und sie steht wirklich in der Zeile.
    //
    // **Gemessen (13.10.2026):** der Treiber liefert `timestamptz` bei `unsafe`
    // als **`Date`**, nicht als Zeichenkette. Genau dafür gibt es `alsIso` im
    // Speicher: die Umdeutung steht an einer Stelle, und der Speicher hat sie
    // oben in `finde` auch gebraucht (`laeuftAb` kam richtig heraus). Eine
    // Zusicherung auf `'string'` wäre hier meine Erwartung gewesen, nicht die
    // Tatsache — sie war rot, und zwar zu Recht.
    const wert = roh[0]?.consumed_at
    expect(wert).not.toBeNull()
    expect(wert).toBeInstanceOf(Date)
    const alsZeit = new Date(wert as unknown as string)
    expect(Number.isNaN(alsZeit.getTime())).toBe(false)
    // Und zwar **jetzt** — nicht irgendwann.
    expect(Math.abs(Date.now() - alsZeit.getTime())).toBeLessThan(60_000)
  })

  test('ein Reset widerruft ALLE Sitzungen — und nur das neue Paßwort gilt', async () => {
    // **Die Prüfung, auf die es ankommt.** Eine Paßwortänderung, die die alten
    // Sitzungen am Leben läßt, sperrt einen Angreifer **nicht** aus: er sitzt in
    // einer Sitzung, die er beim Einbruch erbeutet hat, und die ist weiter gültig.
    const wer = await konto('sitzungen')
    const speicher = erzeugeSpeicher(zugang)
    const ablage = erzeugeTokenAblage(zugang)
    const hasher = new Argon2PasswordHasher()

    const eins = await createSession(speicher.sitzungen, wer.id, { userAgent: 'Prüfgerät', ip: '203.0.113.11' })
    const zwei = await createSession(speicher.sitzungen, wer.id, { userAgent: 'Prüfgerät', ip: '203.0.113.12' })

    const { token } = await erzeugeResetToken(ablage, wer.id, new Date())
    const urteil = await loeseResetTokenEin(
      { ablage, benutzer: speicher.benutzer, sitzungen: speicher.sitzungen, hasher, spur: speicher.spur },
      token,
      NEUES,
      new Date(),
    )
    expect(urteil.ok).toBe(true)
    if (!urteil.ok) return
    expect(urteil.sitzungenWiderrufen).toBe(2)

    // **In der Tabelle nachgesehen, nicht der Rückgabe geglaubt.** Und zwar für
    // **beide** Sitzungen einzeln über ihre Kennung.
    const sitzungen = await sql.unsafe<{ id: string; revoked_at: string | null }[]>(
      `SELECT id, revoked_at FROM auth_sessions WHERE id = ANY($1::uuid[])`,
      [[eins.session.id, zwei.session.id]],
    )
    expect(sitzungen).toHaveLength(2)
    for (const zeile of sitzungen) {
      expect(zeile.revoked_at).not.toBeNull()
    }

    // Das alte Paßwort gilt nicht mehr …
    const alt = await authenticate(speicher.benutzer, hasher, wer.email, PASSWORT, speicher.spur, {
      ip: '203.0.113.7',
    })
    expect(alt.ok).toBe(false)

    // … das neue sehr wohl.
    const neu = await authenticate(speicher.benutzer, hasher, wer.email, NEUES, speicher.spur, {
      ip: '203.0.113.7',
    })
    expect(neu.ok).toBe(true)
    if (neu.ok) expect(neu.user.id).toBe(wer.id)
  })

  test('die Ratenbegrenzung zählt nur das Fenster', async () => {
    const wer = await konto('fenster')
    const ablage = erzeugeTokenAblage(zugang)
    const jetzt = new Date()

    await erzeugeResetToken(ablage, wer.id, jetzt)
    await erzeugeResetToken(ablage, wer.id, jetzt)
    expect(await ablage.zaehleSeit(wer.id, RESET_ZWECK, new Date(jetzt.getTime() - 60 * 60 * 1000))).toBe(2)
    // Ein Fenster, das **erst noch beginnt**, zählt nichts.
    expect(await ablage.zaehleSeit(wer.id, RESET_ZWECK, new Date(jetzt.getTime() + 60 * 1000))).toBe(0)
    // Und ein anderer Zweck zählt nichts.
    expect(await ablage.zaehleSeit(wer.id, 'invite', new Date(jetzt.getTime() - 60 * 60 * 1000))).toBe(0)

    // Das dritte Token innerhalb der Grenze von zwei ist verboten.
    const fehler = await erzeugeResetToken(ablage, wer.id, jetzt, 2).catch((u: unknown) => u)
    expect(fehler).toBeInstanceOf(Error)
    expect((fehler as Error).message).toContain('zu viele Reset-Anfragen')
  })
})
