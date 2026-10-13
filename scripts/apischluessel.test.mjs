/**
 * `scripts/apischluessel.mjs` gegen eine echte Datenbank.
 *
 * ## Die drei Zusicherungen, die nur hier zu haben sind
 *
 * 1. **In `api_keys` steht ein HMAC und kein SHA-256.** Beides sind 64 Hexzeichen
 *    — der Unterschied ist von außen **nicht** zu sehen. Er läßt sich nur
 *    nachrechnen: der Eintrag muß dem HMAC **mit dem Pfeffer** entsprechen und
 *    dem bloßen SHA-256 des Tokens **widersprechen**.
 * 2. **Der Pfeffer wird wirklich gebraucht.** Derselbe Schlüssel, dieselbe
 *    Datenbank, derselbe Eintrag — aber ein **anderer Hauptschlüssel** in der
 *    Umgebung: die Prüfung muß fehlschlagen. Genau darin besteht der Wert des
 *    Pfeffers, und ohne diesen Lauf wäre er eine Behauptung.
 * 3. **Ein widerrufener Schlüssel ist sofort ungültig** — und ein zweiter
 *    Widerruf ändert die Begründung des ersten nicht.
 *
 * Die Umgebung wird als **Parameter** übergeben, nicht aus `process.env` gelesen:
 * die Betriebsdatenbank wird von dieser Datei nicht einmal gesehen. Der
 * Hauptschlüssel ist ein **eigener** (64 Hexzeichen) — nicht der des Betreibers.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import postgres from 'postgres'
import { migrate } from '../packages/auth/db-schema/src/index.ts'
import { zerlegeToken } from '../packages/auth/apikey/src/index.ts'
import { fuehreAus } from './apischluessel.mjs'

const AUS_ENV = process.env.PMH_TEST_DATABASE_URL
const DA = AUS_ENV !== undefined && AUS_ENV.trim() !== '' ? AUS_ENV : undefined

if (DA === undefined) {
  process.stderr.write(
    'HINWEIS: Prüfungen von scripts/apischluessel.mjs übersprungen — PMH_TEST_DATABASE_URL ist nicht gesetzt.\n' +
      '  Die Regeln des Schlüssels sind davon unberührt (packages/auth/apikey, 20 Prüfungen).\n' +
      '  Was hier fehlt, ist der Beweis gegen echte Spalten und den echten Pfeffer.\n',
  )
}
const run = DA === undefined ? describe.skip : describe

const DOMAENE = '@apischluessel.invalid'
/** Zwei Hauptschlüssel für die Prüfung — 32 Byte als Hex. */
const HAUPT_A = '11'.repeat(32)
const HAUPT_B = '22'.repeat(32)

let sql

beforeAll(async () => {
  if (DA === undefined) return
  sql = postgres(DA, { max: 2, onnotice: () => undefined })
  await migrate({
    async exec(anweisung) {
      await sql.unsafe(anweisung)
    },
    async query(anweisung, werte = []) {
      return await sql.unsafe(anweisung, werte)
    },
  })
  await sql.unsafe('DELETE FROM users WHERE email LIKE $1', [`%${DOMAENE}`])
})

afterAll(async () => {
  if (DA === undefined) return
  await sql.unsafe('DELETE FROM users WHERE email LIKE $1', [`%${DOMAENE}`]).catch(() => undefined)
  await sql.end({ timeout: 5 })
})

/** Die Umgebung, die das Skript sieht. */
function umgebung(hauptschluessel = HAUPT_A) {
  return { DATABASE_URL: DA, PMH_MASTER_KEY: hauptschluessel, PMH_HOME: '' }
}

/** Fährt das Skript und sammelt die Ausgabe. */
async function fahre(argumente, hauptschluessel) {
  const aus = []
  const code = await fuehreAus(argumente, umgebung(hauptschluessel), (t) => aus.push(t))
  return { code, text: aus.join('') }
}

/** Legt ein Konto an und gibt seine Kennung zurück. */
async function konto(name, gesperrt = false) {
  const zeilen = await sql.unsafe(
    `INSERT INTO users (id, email, password_hash, display_name, role, disabled_at)
     VALUES (gen_random_uuid(), $1, 'ersatz-hash', 'Schluessel', 'user', $2)
     RETURNING id`,
    [`${name}${DOMAENE}`, gesperrt ? new Date().toISOString() : null],
  )
  return { id: zeilen[0].id, email: `${name}${DOMAENE}` }
}

/** Holt das Token aus der Ausgabe. */
function tokenAus(text) {
  const treffer = /^\s{4}(pmh_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43})$/mu.exec(text)
  if (treffer === null) throw new Error(`kein Token in der Ausgabe:\n${text}`)
  return treffer[1]
}

/**
 * Holt die Kennung aus dem Token — **mit dem Zerleger der Sache**, nicht mit `split`.
 *
 * **Der Fund, der diese Zeile nötig machte.** `base64url` enthält `_` und `-`.
 * Beginnt eine Kennung mit `_`, sieht das Token so aus:
 *
 * ```
 * pmh__aBcDeFgHiJkL_<43 Zeichen>
 *     ^^ die Kennung beginnt mit einem Unterstrich
 * ```
 *
 * `kennungAus(token)` liefert dann den **leeren** Text — und ein Aufruf mit
 * einer leeren Kennung bricht ab, statt zu widerrufen. Genau das ist in der ersten
 * Fassung dieser Datei passiert (Exit 1 statt 0), und zwar **selten**: nur wenn die
 * Zufallskennung mit `_` beginnt. Eindeutig ist das Format nur mit **festen
 * Längen** — `zerlegeToken` macht das, ein `split` nicht.
 */
function kennungAus(token) {
  const teile = zerlegeToken(token)
  if (teile === undefined) throw new Error(`die Form stimmt nicht: ${token}`)
  return teile.keyId
}

/** Der Pfeffer, wie ihn das Skript bildet — hier unabhängig nachgerechnet. */
function pfeffer(hauptschluesselHex) {
  return createHmac('sha256', Buffer.from(hauptschluesselHex, 'hex'))
    .update('pmh-api-schluessel-pfeffer')
    .digest()
}

/** Der HMAC über das ganze Token. */
function hmac(hauptschluesselHex, token) {
  return createHmac('sha256', pfeffer(hauptschluesselHex)).update(token, 'utf8').digest('hex')
}

run('scripts/apischluessel.mjs', () => {
  test('ohne Befehl: Aufrufhinweis und Exit 1', async () => {
    const { code, text } = await fahre([])
    expect(code).toBe(1)
    expect(text).toContain('Aufruf:')
    expect(text).toContain('EINMAL')
  })

  test('anlegen ohne --benutzer: Exit 1', async () => {
    const { code, text } = await fahre(['anlegen'])
    expect(code).toBe(1)
    expect(text).toContain('--benutzer')
  })

  test('anlegen für eine unbekannte Adresse: Exit 1', async () => {
    const { code, text } = await fahre(['anlegen', '--benutzer', `gibtsnicht${DOMAENE}`])
    expect(code).toBe(1)
    expect(text).toContain('kein Benutzer')
  })

  test('anlegen für ein gesperrtes Konto: Exit 1 — und KEIN Schlüssel', async () => {
    const wer = await konto('gesperrt', true)
    const { code, text } = await fahre(['anlegen', '--benutzer', wer.email])
    expect(code).toBe(1)
    expect(text).toContain('gesperrt')
    const zeilen = await sql.unsafe('SELECT count(*)::int AS n FROM api_keys WHERE user_id = $1', [wer.id])
    expect(zeilen[0]?.n).toBe(0)
  })

  test('anlegen mit --tage 0: Exit 1 (die Tabelle würde es sonst abweisen)', async () => {
    const wer = await konto('tage0')
    const { code, text } = await fahre(['anlegen', '--benutzer', wer.email, '--tage', '0'])
    expect(code).toBe(1)
    expect(text).toContain('Geltungsdauer')
  })

  test('anlegen mit leeren --scopes: Exit 1', async () => {
    const wer = await konto('scopes')
    const { code, text } = await fahre(['anlegen', '--benutzer', wer.email, '--scopes', ','])
    expect(code).toBe(1)
    expect(text).toContain('Umfang')
  })

  test('anlegen: das Token wird EINMAL gezeigt, in der Datenbank steht nur der HMAC', async () => {
    const wer = await konto('anlegen')
    const { code, text } = await fahre(['anlegen', '--benutzer', wer.email, '--name', 'Mein Schlüssel', '--tage', '30'])
    expect(code).toBe(0)
    const token = tokenAus(text)
    expect(text).toContain(wer.email)
    expect(text).toContain('Mein Schlüssel')

    const zeilen = await sql.unsafe(
      'SELECT key_id, token_hash, display_prefix, name, scopes, expires_at FROM api_keys WHERE user_id = $1',
      [wer.id],
    )
    expect(zeilen).toHaveLength(1)
    const zeile = zeilen[0]
    expect(zeile.key_id).toMatch(/^[A-Za-z0-9_-]{12}$/u)
    expect(zeile.key_id).toBe(kennungAus(token))
    expect(zeile.display_prefix).toBe(`pmh_${zeile.key_id.slice(0, 8)}`)
    expect(zeile.name).toBe('Mein Schlüssel')
    expect(zeile.scopes).toEqual(['chat'])
    expect(zeile.token_hash).toHaveLength(64)

    // **Die scharfe Unterscheidung: HMAC ja, SHA-256 nein.** Beides sind 64
    // Hexzeichen; nur das Nachrechnen trennt sie. Ohne den Pfeffer wäre der
    // Eintrag der bloße SHA-256 des Tokens — und dann könnte jeder, der die
    // Datenbank hat, einen vorgelegten Schlüssel selbst prüfen und raten.
    expect(zeile.token_hash).toBe(hmac(HAUPT_A, token))
    const blankerSha = await sql.unsafe(`SELECT encode(sha256($1::bytea), 'hex') AS h`, [token])
    expect(zeile.token_hash).not.toBe(blankerSha[0].h)

    // Und das Klartext-Token steht in keiner Spalte.
    const ganzeZeile = await sql.unsafe('SELECT api_keys::text AS text FROM api_keys WHERE user_id = $1', [wer.id])
    expect(ganzeZeile[0]?.text).not.toContain(token)
  })

  test('anlegen gibt bei --scopes eine Liste weiter', async () => {
    const wer = await konto('mehrfach')
    const { code } = await fahre(['anlegen', '--benutzer', wer.email, '--scopes', 'chat, search ,files'])
    expect(code).toBe(0)
    const zeilen = await sql.unsafe('SELECT scopes FROM api_keys WHERE user_id = $1', [wer.id])
    expect(zeilen[0]?.scopes).toEqual(['chat', 'search', 'files'])
  })

  test('liste zeigt Kennung und Anzeigepräfix — aber kein Token und keinen Hash', async () => {
    const wer = await konto('liste')
    const erst = await fahre(['anlegen', '--benutzer', wer.email])
    const token = tokenAus(erst.text)
    const { code, text } = await fahre(['liste', '--benutzer', wer.email])
    expect(code).toBe(0)
    expect(text).toContain(wer.email)
    expect(text).toContain(kennungAus(token))
    expect(text).toContain('gültig bis')
    expect(text).toContain('nie')
    expect(text).not.toContain(token)
    // Und kein Hash (64 Hexzeichen am Stück).
    expect(text).not.toMatch(/[0-9a-f]{64}/u)
  })

  test('pruefe gilt, vermerkt die Benutzung — und weist ein falsches Geheimnis ab', async () => {
    const wer = await konto('pruefe')
    const erst = await fahre(['anlegen', '--benutzer', wer.email])
    const token = tokenAus(erst.text)

    const gut = await fahre(['pruefe', token])
    expect(gut.code).toBe(0)
    expect(gut.text).toContain(wer.email)
    expect(gut.text).toContain('chat')

    // `last_used_at` ist jetzt gesetzt — in der Tabelle nachgesehen.
    //
    // **Und die Zusicherung ist scharf gestellt.** `expect(x).not.toBeNull()`
    // hätte hier **auch für `undefined`** gegolten: hätte die Suche die Zeile
    // nicht gefunden, wäre die Prüfung trotzdem grün gewesen. Gemessen ist der
    // Treiber hier `Date` (wie bei `timestamptz` üblich), also wird genau das
    // verlangt.
    const benutzt = await sql.unsafe('SELECT last_used_at FROM api_keys WHERE key_id = $1', [kennungAus(token)])
    expect(benutzt).toHaveLength(1)
    expect(benutzt[0]?.last_used_at).toBeInstanceOf(Date)

    // Falsches Geheimnis, richtige Kennung.
    const falsch = `pmh_${kennungAus(token)}_${'A'.repeat(43)}`
    const abgewiesen = await fahre(['pruefe', falsch])
    expect(abgewiesen.code).toBe(2)
    // Unbekannte Kennung.
    const unbekannt = await fahre(['pruefe', `pmh_zzzzzzzzzzzz_${'B'.repeat(43)}`])
    expect(unbekannt.code).toBe(2)
    // **Dieselbe Meldung.** Ein Unterschied wäre ein Orakel.
    const satz = /: (.+)$/mu
    expect(satz.exec(abgewiesen.text)?.[1]).toBe(satz.exec(unbekannt.text)?.[1])
  })

  test('DER PFEFFER WIRD WIRKLICH GEBRAUCHT: anderer Hauptschlüssel → abgewiesen', async () => {
    // **Die Prüfung, um derentwillen der Pfeffer existiert.** Derselbe Schlüssel,
    // dieselbe Datenbank, derselbe Eintrag — nur der Hauptschlüssel ist ein
    // anderer. Wäre der Eintrag ein blanker SHA-256, ginge die Prüfung durch.
    const wer = await konto('pfeffer')
    const erst = await fahre(['anlegen', '--benutzer', wer.email])
    const token = tokenAus(erst.text)
    expect((await fahre(['pruefe', token])).code).toBe(0)

    const mitAnderem = await fahre(['pruefe', token], HAUPT_B)
    expect(mitAnderem.code).toBe(2)
    expect(mitAnderem.text).toContain('gilt nicht')

    // Gegenprobe: der Eintrag gehört wirklich zu HAUPT_A.
    const zeilen = await sql.unsafe('SELECT token_hash FROM api_keys WHERE key_id = $1', [kennungAus(token)])
    expect(zeilen[0]?.token_hash).toBe(hmac(HAUPT_A, token))
    expect(zeilen[0]?.token_hash).not.toBe(hmac(HAUPT_B, token))
  })

  test('widerrufen wirkt sofort — und ein zweiter Widerruf ändert den Grund nicht', async () => {
    const wer = await konto('widerruf')
    const erst = await fahre(['anlegen', '--benutzer', wer.email])
    const token = tokenAus(erst.text)
    const keyId = kennungAus(token)

    expect((await fahre(['pruefe', token])).code).toBe(0)

    const widerrufen = await fahre(['widerrufen', keyId, '--grund', 'Rechner verloren'])
    expect(widerrufen.code).toBe(0)
    expect(widerrufen.text).toContain('Rechner verloren')

    // Sofort ungültig — mit derselben Meldung wie alles andere.
    const danach = await fahre(['pruefe', token])
    expect(danach.code).toBe(2)
    expect(danach.text).toContain('(widerrufen)')
    expect(danach.text).toContain('unbekannt, abgelaufen, widerrufen oder falsch')

    // Der zweite Widerruf trifft nichts und läßt den Grund stehen.
    const zweite = await fahre(['widerrufen', keyId, '--grund', 'etwas anderes'])
    expect(zweite.code).toBe(2)

    const zeilen = await sql.unsafe('SELECT revoked_reason, revoked_at FROM api_keys WHERE key_id = $1', [keyId])
    expect(zeilen[0]?.revoked_reason).toBe('Rechner verloren')
    expect(zeilen[0]?.revoked_at).not.toBeNull()
  })

  test('ein widerrufener Schlüssel steht in liste als WIDERRUFEN', async () => {
    const wer = await konto('listewiderruf')
    const erst = await fahre(['anlegen', '--benutzer', wer.email])
    const keyId = kennungAus(tokenAus(erst.text))
    await fahre(['widerrufen', keyId, '--grund', 'Prüfung'])
    const { text } = await fahre(['liste', '--benutzer', wer.email])
    expect(text).toContain('WIDERRUFEN')
    expect(text).toContain('Prüfung')
  })
})
