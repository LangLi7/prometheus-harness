/**
 * `scripts/reset.mjs` gegen eine echte Datenbank — und **nur** gegen die Wegwerf-Datenbank.
 *
 * ## Warum dieses Skript eine Prüfung braucht
 *
 * `fuehreAus` ist in allen Skripten dieses Repos exportiert, damit man es fahren
 * kann — und **kein** Skript wird gefahren: `grep` über `*.ts` findet keinen
 * einzigen Aufruf von `geheimnis.mjs` oder `claim.mjs` in einer Prüfung. Ein
 * Ausgang ohne Aufrufer ist dasselbe Muster wie ein Verfahren ohne Aufrufer, nur
 * eine Ebene höher. Hier wird es geschlossen.
 *
 * ## Wie die Betriebsdatenbank aus dem Spiel bleibt
 *
 * **Nicht** über `process.env`, sondern über den **Parameter**: `fuehreAus`
 * bekommt die Umgebung ausdrücklich als zweites Argument. Diese Datei übergibt
 * eine Umgebung, in der `DATABASE_URL` auf die Wegwerf-Datenbank zeigt — die
 * Betriebsdatenbank wird von diesem Test also nicht einmal **gesehen**, und zwar
 * unabhängig davon, was in `.env` steht.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import postgres from 'postgres'
import { migrate } from '../packages/auth/db-schema/src/index.ts'
import { Argon2PasswordHasher, authenticate, createSession, register } from '../packages/auth/auth/src/index.ts'
import { erzeugeSpeicher } from '../packages/auth/store-postgres/src/index.ts'
import { fuehreAus } from './reset.mjs'

const URL_AUS_ENV = process.env.PMH_TEST_DATABASE_URL
const DA = URL_AUS_ENV !== undefined && URL_AUS_ENV.trim() !== '' ? URL_AUS_ENV : undefined

if (DA === undefined) {
  process.stderr.write(
    'HINWEIS: Prüfungen von scripts/reset.mjs übersprungen — PMH_TEST_DATABASE_URL ist nicht gesetzt.\n' +
      '  Die Regeln des Zurücksetzens sind davon unberührt (packages/auth/reset, 15 Prüfungen).\n' +
      '  Was hier fehlt, ist der Beweis, daß der AUFRUFER die Regeln richtig bedient.\n',
  )
}
const run = DA === undefined ? describe.skip : describe

const TESTDOMAENE = '@resetcli.invalid'
const ALT = 'Korrektheit-ist-kein-Zufall-2026'
const NEU = 'Ein-ganz-neues-Passwort-2026'

let sql
let zugang
/** Die Umgebung, die das Skript sieht — **nie** `process.env`. */
let umgebung

beforeAll(async () => {
  if (DA === undefined) return
  sql = postgres(DA, { max: 4, onnotice: () => undefined })
  zugang = {
    async unsafe(anweisung, werte = []) {
      return await sql.unsafe(anweisung, werte)
    },
  }
  const ziel = {
    async exec(anweisung) {
      await sql.unsafe(anweisung)
    },
    async query(anweisung, werte = []) {
      return await sql.unsafe(anweisung, werte)
    },
  }
  await migrate(ziel)
  await sql.unsafe('DELETE FROM users WHERE email LIKE $1', [`%${TESTDOMAENE}`])
  umgebung = { DATABASE_URL: DA, PMH_HOME: process.env.PMH_HOME ?? '' }
})

afterAll(async () => {
  if (DA === undefined) return
  await sql.unsafe('DELETE FROM users WHERE email LIKE $1', [`%${TESTDOMAENE}`]).catch(() => undefined)
  await sql.end({ timeout: 5 })
})

/** Fährt das Skript und sammelt die Ausgabe ein. */
async function fahre(argumente, eingabe) {
  const aus = []
  // **`lese` wird eingespeist, nicht getauscht.** Deshalb ist der vierte Parameter
  // von `fuehreAus` da: die Prüfung darf die Standardeingabe nicht anfassen.
  let reste = eingabe
  const lese = async () => {
    const wert = reste ?? ''
    reste = null
    return wert
  }
  const code = await fuehreAus(argumente, umgebung, (t) => aus.push(t), lese)
  return { code, text: aus.join('') }
}

/** Legt ein Konto an. */
async function konto(name) {
  const speicher = erzeugeSpeicher(zugang)
  const angelegt = await register(
    speicher.benutzer,
    new Argon2PasswordHasher(),
    `${name}${TESTDOMAENE}`,
    ALT,
    'ResetCLI',
    { maxUsers: 100_000, sink: speicher.spur },
  )
  if (!angelegt.ok) throw new Error(`Konto ${name} ließ sich nicht anlegen: ${angelegt.reason}`)
  return angelegt.user
}

/** Holt das Token aus der Ausgabe — die eine Zeile mit 43 Zeichen. */
function tokenAus(text) {
  const treffer = /^\s{4}([A-Za-z0-9_-]{43})$/mu.exec(text)
  if (treffer === null) throw new Error(`kein Token in der Ausgabe:\n${text}`)
  return treffer[1]
}

run('scripts/reset.mjs', () => {
  test('ohne Befehl: Aufrufhinweis und Exit 1', async () => {
    const { code, text } = await fahre([], undefined)
    expect(code).toBe(1)
    expect(text).toContain('Aufruf:')
    expect(text).toContain('STDIN')
  })

  test('anfordern ohne --benutzer: Fehler, Exit 1', async () => {
    const { code, text } = await fahre(['anfordern'], undefined)
    expect(code).toBe(1)
    expect(text).toContain('--benutzer')
  })

  test('anfordern für eine unbekannte Adresse: Fehler, Exit 1', async () => {
    const { code, text } = await fahre(['anfordern', '--benutzer', `gibtsnicht${TESTDOMAENE}`], undefined)
    expect(code).toBe(1)
    expect(text).toContain('kein Benutzer')
  })

  test('anfordern für ein gesperrtes Konto: Fehler, Exit 1 — und KEIN Token', async () => {
    const wer = await konto('gesperrt')
    await sql.unsafe('UPDATE users SET disabled_at = now() WHERE id = $1', [wer.id])
    const { code, text } = await fahre(['anfordern', '--benutzer', wer.email], undefined)
    expect(code).toBe(1)
    expect(text).toContain('gesperrt')
    // Und in der Datenbank steht kein Token für dieses Konto.
    const zeilen = await sql.unsafe('SELECT count(*)::int AS n FROM one_time_tokens WHERE user_id = $1', [wer.id])
    expect(zeilen[0]?.n).toBe(0)
  })

  test('anfordern gibt das Token aus — in der Datenbank steht nur der Hash', async () => {
    const wer = await konto('anfordern')
    const { code, text } = await fahre(['anfordern', '--benutzer', wer.email], undefined)
    expect(code).toBe(0)
    const token = tokenAus(text)
    expect(text).toContain(wer.email)
    // Die Gültigkeit steht in der Ausgabe.
    expect(text).toContain('Minuten')

    // **Und die Gegenprobe in der Datenbank.** Das Klartext-Token steht in keiner
    // Spalte — geprüft über die ganze Zeile als Text.
    const roh = await sql.unsafe(
      'SELECT id, token_hash, one_time_tokens::text AS text FROM one_time_tokens WHERE user_id = $1',
      [wer.id],
    )
    expect(roh).toHaveLength(1)
    expect(roh[0].token_hash).not.toBe(token)
    expect(roh[0].token_hash).toHaveLength(64)
    expect(roh[0].text).not.toContain(token)

    // Und der Hash ist wirklich der des Tokens — nachgerechnet in der Datenbank.
    const nach = await sql.unsafe(`SELECT encode(sha256($1::bytea), 'hex') AS h`, [token])
    expect(roh[0].token_hash).toBe(nach[0].h)
  })

  test('pruefen verbraucht nichts — zweimal aufrufbar', async () => {
    const wer = await konto('pruefen')
    const erst = await fahre(['anfordern', '--benutzer', wer.email], undefined)
    const token = tokenAus(erst.text)

    for (let i = 0; i < 2; i += 1) {
      const { code, text } = await fahre(['pruefen', token], undefined)
      expect(code).toBe(0)
      expect(text).toContain(wer.email)
      expect(text).toContain('NICHT verbraucht')
    }
    // Und der Eintrag ist in der Datenbank unverbraucht.
    const zeilen = await sql.unsafe(
      'SELECT count(consumed_at)::int AS verbraucht FROM one_time_tokens WHERE user_id = $1',
      [wer.id],
    )
    expect(zeilen[0]?.verbraucht).toBe(0)
  })

  test('pruefen mit einem falschen Token: Exit 2', async () => {
    const { code, text } = await fahre(['pruefen', 'voellig-ausgedacht-aber-lang-genug'], undefined)
    expect(code).toBe(2)
    expect(text).toContain('gilt nicht')
    expect(text).toContain('unbekannt, abgelaufen oder wurde bereits eingelöst')
  })

  test('einloesen mit zu schwachem Passwort: Exit 3, und das Token BLEIBT gültig', async () => {
    const wer = await konto('schwach')
    const erst = await fahre(['anfordern', '--benutzer', wer.email], undefined)
    const token = tokenAus(erst.text)

    const { code, text } = await fahre(['einloesen', token], 'kurz\n')
    expect(code).toBe(3)
    expect(text).toContain('passwort-zu-schwach')
    expect(text).toContain('WEITER gültig')

    // **Der Kern dieser Prüfung:** das Token ist danach noch da.
    const danach = await fahre(['pruefen', token], undefined)
    expect(danach.code).toBe(0)

    // Und das alte Paßwort gilt weiterhin — es wurde nichts geschrieben.
    const speicher = erzeugeSpeicher(zugang)
    const alt = await authenticate(speicher.benutzer, new Argon2PasswordHasher(), wer.email, ALT, speicher.spur, {
      ip: '203.0.113.7',
    })
    expect(alt.ok).toBe(true)
  })

  test('einloesen setzt das Passwort, widerruft ALLE Sitzungen, verbraucht das Token', async () => {
    const wer = await konto('einloesen')
    const speicher = erzeugeSpeicher(zugang)
    const eins = await createSession(speicher.sitzungen, wer.id, { userAgent: 'Prüfgerät', ip: '203.0.113.21' })
    const zwei = await createSession(speicher.sitzungen, wer.id, { userAgent: 'Prüfgerät', ip: '203.0.113.22' })

    const erst = await fahre(['anfordern', '--benutzer', wer.email], undefined)
    const token = tokenAus(erst.text)

    const { code, text } = await fahre(['einloesen', token], `${NEU}\n`)
    expect(code).toBe(0)
    expect(text).toContain('Passwort neu gesetzt')
    expect(text).toContain('Sitzungen widerrufen: 2')

    // **In der Tabelle nachgesehen, nicht der Ausgabe geglaubt.**
    const sitzungen = await sql.unsafe('SELECT id, revoked_at FROM auth_sessions WHERE id = ANY($1::uuid[])', [
      [eins.session.id, zwei.session.id],
    ])
    expect(sitzungen).toHaveLength(2)
    for (const zeile of sitzungen) expect(zeile.revoked_at).not.toBeNull()

    // Das Token wirkt kein zweites Mal — auch nicht über das Skript.
    const zweite = await fahre(['einloesen', token], `${NEU}\n`)
    expect(zweite.code).toBe(2)
    expect(zweite.text).toContain('verbraucht')

    // Das alte Paßwort gilt nicht mehr, das neue schon.
    const hasher = new Argon2PasswordHasher()
    const alt = await authenticate(speicher.benutzer, hasher, wer.email, ALT, speicher.spur, { ip: '203.0.113.7' })
    expect(alt.ok).toBe(false)
    const neu = await authenticate(speicher.benutzer, hasher, wer.email, NEU, speicher.spur, { ip: '203.0.113.7' })
    expect(neu.ok).toBe(true)
  })

  test('einloesen ohne Eingabe: Fehler, Exit 1 — das Token bleibt gültig', async () => {
    const wer = await konto('leer')
    const erst = await fahre(['anfordern', '--benutzer', wer.email], undefined)
    const token = tokenAus(erst.text)

    const { code, text } = await fahre(['einloesen', token], '\n')
    expect(code).toBe(1)
    expect(text).toContain('leer')
    expect((await fahre(['pruefen', token], undefined)).code).toBe(0)
  })

  test('die Grenze von fünf Anforderungen je Stunde greift', async () => {
    const wer = await konto('grenze')
    for (let i = 0; i < 5; i += 1) {
      const { code } = await fahre(['anfordern', '--benutzer', wer.email], undefined)
      expect(code).toBe(0)
    }
    const sechste = await fahre(['anfordern', '--benutzer', wer.email], undefined)
    expect(sechste.code).toBe(1)
    expect(sechste.text).toContain('zu viele Reset-Anfragen')

    const zeilen = await sql.unsafe('SELECT count(*)::int AS n FROM one_time_tokens WHERE user_id = $1', [wer.id])
    expect(zeilen[0]?.n).toBe(5)
  })

  test('das Passwort steht in keiner Ausgabe — auch nicht im Fehlerfall', async () => {
    // **H4: keine Geheimwerte ausgeben.** Ein Paßwort, das in der Ausgabe landet,
    // steht im Verlauf, in der Bildschirmaufnahme und in jedem Protokoll.
    const wer = await konto('keinausgabe')
    const erst = await fahre(['anfordern', '--benutzer', wer.email], undefined)
    const token = tokenAus(erst.text)
    const geheim = `${NEU}-niemals-ausgeben`
    const { text } = await fahre(['einloesen', token], `${geheim}\n`)
    expect(text).not.toContain(geheim)
    expect(text).not.toContain('niemals-ausgeben')
  })
})
