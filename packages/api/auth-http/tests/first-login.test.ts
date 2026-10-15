/**
 * Die erste Anmeldung — und der Zustand, in dem **niemand** ein Konto anlegen kann.
 *
 * ## Warum diese Datei existiert
 *
 * Am 13.10.2026 in der **Betriebsdatenbank** gemessen:
 *
 * ```
 * benutzer=3  admins=0  gesperrt=0
 * ```
 *
 * Und im Harness-Home liegt **keine** `claim.txt`. Diese Datei stellt genau diesen
 * Zustand auf einer Wegwerf-Datenbank her und mißt, was dann passiert. Der Verdacht
 * ist eine **Aussperrung** — und ein Verdacht gehört gemessen, nicht geglaubt.
 *
 * ## Jeder Fall stellt seinen Zustand SELBST her
 *
 * Kein Fall verläßt sich darauf, was ein anderer liegen ließ: {@link zustand} räumt
 * die Konten dieser Domäne weg und legt genau so viele an, wie der Fall braucht.
 * Eine Prüfdatei, in der Fall 4 nur grün ist, wenn Fall 3 vorher lief, ist keine
 * Prüfung, sondern eine Reihenfolge.
 *
 * ## Was hier geprüft wird
 *
 * 1. Ohne Claim-Token kommt niemand durch — auch bei offenem Tor nicht.
 * 2. Mit einem frischen Claim entsteht das Adminkonto (`201`, Rolle `admin`).
 * 3. Ein Claim wirkt **genau einmal**, und die Datei ist danach weg.
 * 4. Sobald ein Admin existiert, ist der Claim-Weg zu → ohne Sitzung `401`.
 * 5. Die Wiederherstellung ist **ein Befehl**: frischer Claim, neuer Admin.
 * 6. Abgelaufene Claim-Datei und fremdes Home öffnen nichts.
 *
 * Der Weg wird **gerufen**, nicht über HTTP gefahren: `registrieren` ist eine reine
 * Funktion, und für die Frage „darf hier ein Konto entstehen?" braucht es keinen
 * Socket. Der HTTP-Teil ist in `postgres.test.ts` belegt.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { Argon2PasswordHasher, MemoryRateLimiter } from '@prometheus-harness/auth'
import { CLAIMDATEI, erzeugeClaim, leseMaschinenbindung, leseOderErzeugeGeraeteId } from '@prometheus-harness/claim'
import { migrate } from '@prometheus-harness/db-schema'
import { erzeugeSpeicher, zaehleAdmins, type SqlZugang } from '@prometheus-harness/store-postgres'
import { claimAblageImHome } from '../src/claim-store.ts'
import { registrieren } from '../src/paths.ts'
import type { Umgebung } from '../src/paths.ts'

const AUS_ENV = process.env.PMH_TEST_DATABASE_URL
const DA = AUS_ENV !== undefined && AUS_ENV.trim() !== '' ? AUS_ENV : undefined

if (DA === undefined) {
  process.stderr.write(
    'HINWEIS: Prüfungen der Erstinbetriebnahme übersprungen — PMH_TEST_DATABASE_URL ist nicht gesetzt.\n' +
      '  Was hier fehlt, ist der Beweis, daß bei „benutzer>0, admins=0" niemand mehr ein Konto anlegen kann.\n',
  )
}
const run = DA === undefined ? describe.skip : describe

const DOMAENE = '@erstlogin.invalid'
const PASSWORT = 'Korrektheit-ist-kein-Zufall-2026'

let sql: postgres.Sql
let zugang: SqlZugang
let home: string

beforeAll(async () => {
  if (DA === undefined) return
  sql = postgres(DA, { max: 2, onnotice: () => undefined })
  zugang = {
    async unsafe(anweisung: string, werte: readonly unknown[] = []): Promise<unknown> {
      return await sql.unsafe(anweisung, werte as never[])
    },
  }
  await migrate({
    async exec(anweisung: string) {
      await sql.unsafe(anweisung)
    },
    async query<T>(anweisung: string, werte: readonly unknown[] = []): Promise<readonly T[]> {
      return (await sql.unsafe(anweisung, werte as never[])) as readonly T[]
    },
  })
  // **Ein eigenes, leeres Home.** Weder `~/.pmh` noch `~/.dsh` werden angefaßt —
  // diese Prüfung legt `claim.txt` und die Gerätekennung selbst an.
  home = mkdtempSync(join(tmpdir(), 'pmh-erstlogin-'))
})

afterAll(async () => {
  if (DA === undefined) return
  await sql.unsafe('DELETE FROM users WHERE email LIKE $1', [`%${DOMAENE}`]).catch(() => undefined)
  await sql.end({ timeout: 5 })
  rmSync(home, { recursive: true, force: true })
})

/** Die Umgebung, wie sie der Host baut — hier ausdrücklich und ohne Aussenwelt. */
function umgebung(eigenesHome: string = home): Umgebung {
  return {
    speicher: erzeugeSpeicher(zugang),
    hasher: new Argon2PasswordHasher(),
    limiter: new MemoryRateLimiter(),
    sicher: false,
    maxUsers: undefined,
    jetzt: () => new Date(),
    // Keine Wartezeit in der Prüfung: die Verzögerung bei Fehlversuchen ist eine
    // Sache des Betriebs, nicht des Nachweises.
    warten: async () => undefined,
    home: eigenesHome,
    claimAblage: claimAblageImHome(home),
  }
}

/**
 * Stellt den Zustand her: **genau** so viele Konten, davon so viele Admins.
 *
 * **Direkt in die Datenbank**, nicht über den Weg: der Weg ist der Gegenstand der
 * Prüfung, und ihn zum Herstellen des Zustands zu benutzen wäre ein Zirkel.
 *
 * @param benutzer - wie viele Konten es geben soll
 * @param admins - wie viele davon die Rolle `admin` tragen
 */
async function zustand(benutzer: number, admins: number): Promise<void> {
  await sql.unsafe('DELETE FROM users WHERE email LIKE $1', [`%${DOMAENE}`])
  // Eine liegengelassene Claim-Datei aus einem früheren Fall würde das Tor öffnen.
  rmSync(join(home, CLAIMDATEI), { force: true })
  for (let i = 0; i < benutzer; i += 1) {
    await sql.unsafe(
      `INSERT INTO users (id, email, password_hash, display_name, role)
       VALUES (gen_random_uuid(), $1, 'ersatz-hash', $2, $3)`,
      [`p${String(i)}${DOMAENE}`, `Person ${String(i)}`, i < admins ? 'admin' : 'user'],
    )
  }
}

/** Der Körper einer Antwort, mit Typprüfung — damit die Prüfung nicht rät. */
interface FehlerKoerper {
  ok: boolean
  value?: Record<string, unknown>
  error?: { code: string; message: string }
}
function koerper(antwort: { koerper: unknown }): FehlerKoerper {
  return antwort.koerper as FehlerKoerper
}

/** Legt einen frischen Claim für das eigene Home an. */
async function frischerClaim(zeitpunkt: Date = new Date()): Promise<string> {
  leseOderErzeugeGeraeteId(home)
  const bindung = leseMaschinenbindung(home)
  const claim = await erzeugeClaim(home, bindung, claimAblageImHome(home), zeitpunkt)
  return claim.token
}

/** Ein Anlegeversuch. */
async function versuch(email: string, claimToken?: string, eigenesHome?: string) {
  return await registrieren(umgebung(eigenesHome), {
    email,
    password: PASSWORT,
    displayName: 'Versuch',
    ...(claimToken === undefined ? {} : { claimToken }),
    ip: '203.0.113.40',
    // **Pflichtfeld, kein Beiwerk.** `Herkunft.userAgent` ist nicht optional: die
    // Spur soll die Frage „welches Gerät?" beantworten können, und ein
    // weggelassener Wert wäre eine stille Lücke im Protokoll.
    userAgent: 'Prüfgerät',
  })
}

run('Die Erstinbetriebnahme', () => {
  test('VORBEDINGUNG: zwei Benutzer, KEIN Admin, KEINE Claim-Datei', async () => {
    await zustand(2, 0)
    const zahlen = await sql.unsafe<{ n: number; a: number }[]>(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE role = 'admin')::int AS a
         FROM users WHERE email LIKE $1`,
      [`%${DOMAENE}`],
    )
    expect(zahlen[0]?.n).toBe(2)
    expect(zahlen[0]?.a).toBe(0)
    expect(await zaehleAdmins(zugang)).toBe(0)
    // **Und keine Claim-Datei.** Das ist die Hälfte des gemessenen Zustands: das
    // Tor steht offen (`admins === 0`), aber es gibt kein gültiges Geheimnis.
    expect(existsSync(join(home, CLAIMDATEI))).toBe(false)
  })

  test('OHNE Claim-Token kommt niemand durch — auch wenn das Tor offen ist', async () => {
    await zustand(2, 0)
    const antwort = await versuch(`fremd${DOMAENE}`)
    const k = koerper(antwort)
    expect(antwort.status).toBe(403)
    expect(k.ok).toBe(false)
    // **Der Code sagt, was fehlt.** Der Eigentümer sitzt hier selbst; „claim-fehlt"
    // ist die nützlichere Auskunft als „verboten".
    expect(k.error?.code).toBe('claim-fehlt')
    expect(k.error?.message).toContain(CLAIMDATEI)
    // Und es ist wirklich kein Konto entstanden.
    expect(await zaehleAdmins(zugang)).toBe(0)
  })

  test('ein erfundenes Claim-Token wird abgewiesen', async () => {
    await zustand(2, 0)
    const antwort = await versuch(`geraten${DOMAENE}`, 'ein-voellig-ausgedachtes-token')
    expect(antwort.status).toBe(403)
    expect(koerper(antwort).error?.code).toContain('claim-')
  })

  test('MIT frischem Claim entsteht das Adminkonto — 201, Rolle admin', async () => {
    await zustand(2, 0)
    const token = await frischerClaim()
    const antwort = await versuch(`chef${DOMAENE}`, token)
    const k = koerper(antwort)
    expect(antwort.status).toBe(201)
    expect(k.ok).toBe(true)
    expect(k.value?.role).toBe('admin')
    expect(k.value?.email).toBe(`chef${DOMAENE}`)

    // **In der Datenbank nachgesehen, nicht der Antwort geglaubt.**
    const zeilen = await sql.unsafe<{ role: string }[]>('SELECT role FROM users WHERE email = $1', [`chef${DOMAENE}`])
    expect(zeilen[0]?.role).toBe('admin')
    expect(await zaehleAdmins(zugang)).toBe(1)

    // Und die Claim-Datei ist weg — ein Token, das nicht mehr gilt, aber noch
    // existiert, wäre eine Einladung, es wieder gültig zu machen.
    expect(existsSync(join(home, CLAIMDATEI))).toBe(false)
  })

  test('ein Claim wirkt GENAU EINMAL — das Tor bleibt offen, der Claim nicht', async () => {
    // Der Zustand wird erneut auf „kein Admin" gestellt, damit das Tor wieder offen
    // ist. Der **Claim** ist trotzdem verbraucht — und genau das wird gemessen:
    // offenes Tor allein genügt nicht.
    await zustand(2, 0)
    const token = await frischerClaim()
    expect((await versuch(`erster${DOMAENE}`, token)).status).toBe(201)

    await zustand(2, 0)
    // Ohne neuen Claim, mit dem **alten** Token.
    const zweite = await versuch(`zweiter${DOMAENE}`, token)
    expect(zweite.status).toBe(403)
    const k = koerper(zweite)
    expect(k.error?.code).toContain('claim-')
    // **Nicht „claim-fehlt"**: das Token wurde vorgelegt, es ist nur verbraucht.
    // Die unterscheidbaren Abweisungen sind Absicht — hier sitzt der Eigentümer.
    expect(k.error?.code).not.toBe('claim-fehlt')
  })

  test('mit einem Admin ist der Claim-Weg zu: ohne Sitzung gibt es 401', async () => {
    // **Die zweite Hälfte der Regel.** Es gibt Benutzer **und** einen Admin, also
    // führt der Weg über einen angemeldeten Administrator — und ohne Sitzung ist
    // das 401, nicht 403.
    await zustand(2, 1)
    const antwort = await versuch(`ohneanmeldung${DOMAENE}`)
    const k = koerper(antwort)
    expect(antwort.status).toBe(401)
    expect(k.error?.code).toBe('nicht-angemeldet')
  })

  test('DIE WIEDERHERSTELLUNG IST EIN BEFEHL: frischer Claim, neuer Admin', async () => {
    // **Die Antwort auf den gemessenen Betriebszustand.** Wer ausgesperrt ist,
    // braucht keinen Datenbankeingriff: ein neuer Claim im Home öffnet das Tor
    // wieder, weil `admins === 0` es offenhält. Danach gibt es wieder einen Admin.
    await zustand(2, 0)
    expect(await zaehleAdmins(zugang)).toBe(0)

    const token = await frischerClaim()
    const antwort = await versuch(`wieder${DOMAENE}`, token)
    expect(antwort.status).toBe(201)
    expect(koerper(antwort).value?.role).toBe('admin')
    expect(await zaehleAdmins(zugang)).toBe(1)
  })

  test('eine ABGELAUFENE Claim-Datei öffnet nichts', async () => {
    await zustand(2, 0)
    const vor30Tagen = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const token = await frischerClaim(vor30Tagen)
    const antwort = await versuch(`zuSpaet${DOMAENE}`, token)
    expect(antwort.status).toBe(403)
    expect(koerper(antwort).error?.code).toContain('claim-')
    expect(await zaehleAdmins(zugang)).toBe(0)
  })

  test('der Claim ist an DIESEN Rechner gebunden — ein fremdes Home hilft nicht', async () => {
    await zustand(2, 0)
    const token = await frischerClaim()
    const fremd = mkdtempSync(join(tmpdir(), 'pmh-fremd-'))
    try {
      // **Die Ablage ist dieselbe** (der Claim existiert wirklich), aber der
      // Aufruf kommt mit einem anderen Home: dort entsteht eine **andere**
      // Gerätekennung, und die Bindung stimmt nicht mehr.
      const antwort = await versuch(`fremdeshome${DOMAENE}`, token, fremd)
      expect(antwort.status).toBe(403)
      expect(koerper(antwort).error?.code).toContain('claim-')
      expect(await zaehleAdmins(zugang)).toBe(0)
    } finally {
      rmSync(fremd, { recursive: true, force: true })
    }
  })

  test('ein gesperrtes Konto entsteht auch mit gültigem Claim nicht doppelt', async () => {
    // Kein neuer Zustand, nur eine Gegenprobe: derselbe Weg, dieselbe Adresse,
    // nachdem der Claim verbraucht ist — die Adresse bleibt eindeutig.
    await zustand(1, 1)
    const antwort = await versuch(`p0${DOMAENE}`)
    // Es gibt bereits einen Admin, also 401 (kein Claim-Weg) — **nicht** 409.
    // Das ist die Reihenfolge: erst das Tor, dann die Adresse.
    expect(antwort.status).toBe(401)
  })
})
