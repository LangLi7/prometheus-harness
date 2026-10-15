/**
 * Das Tor über **echtes HTTP** gegen die **echte Datenbank**.
 *
 * ## Was hier bewiesen wird
 *
 * Daß die Erstinbetriebnahme und die Rechte **wirken** — nicht, daß sie
 * existieren. `@prometheus-harness/claim` und `@prometheus-harness/permissions`
 * hatten 21 bzw. 30 eigene Prüfungen und **keinen Aufrufer**. Diese Datei ist der
 * Aufrufer.
 *
 * Die Kette, die hier durchlaufen wird:
 *
 * ```
 * ohne Claim        -> 403 claim-fehlt          (kein Adminkonto für den ersten Fremden)
 * falscher Claim    -> 403 claim-token-falsch   (und der echte lebt weiter)
 * richtiger Claim   -> 201, Rolle ADMIN         (und die Claim-Datei ist weg)
 * zweiter Versuch   -> 401 nicht-angemeldet     (der Weg über den Claim ist zu)
 * als Admin ohne CSRF -> 403 csrf-fehlt
 * als Admin mit CSRF  -> 201, Rolle user
 * als BENUTZER        -> 403 recht-admin-erforderlich
 * ```
 *
 * ## Warum gegen einen echten Socket UND eine echte Datenbank
 *
 * Der Claim ist an **Rechner, lokalen Nutzer und eine Gerätekennung** gebunden —
 * drei Dinge, die es nur wirklich gibt. Die Rechte hängen an der **Rolle in der
 * Datenbank**. Beides nachzubilden hieße, die eigene Nachbildung zu prüfen.
 *
 * ## Die Sicherung: niemals gegen die Betriebsdatenbank
 *
 * Dieselbe wie in `store-postgres` (Befund vom 13.10.2026): der Test vergleicht
 * `current_database()` mit dem Namen aus `DATABASE_URL`. **Und er löscht alle
 * Benutzer** — er braucht eine leere Tabelle, sonst ist die Erstinbetriebnahme
 * nicht offen. Das ist auf einer Wegwerf-Datenbank richtig und auf der
 * Betriebsdatenbank ein Datenverlust; die Sicherung ist deshalb keine Höflichkeit,
 * sondern die Bedingung.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer, type Server } from 'node:http'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { Argon2PasswordHasher, CSRF_COOKIE_NAME, MemoryRateLimiter } from '@prometheus-harness/auth'
import { erzeugeClaim, erstinbetriebnahmeOffen, leseMaschinenbindung, leseOderErzeugeGeraeteId } from '@prometheus-harness/claim'
import { migrate, betriebsdatenbankNamen, type MigrationTarget } from '@prometheus-harness/db-schema'
import { erzeugeSpeicher, speichereProfil, type SqlZugang } from '@prometheus-harness/store-postgres'
import { wegAbmelden, wegAnmelden, wegIch, wegRegistrieren, type Weg } from '../src/http.ts'
import { claimAblageImHome } from '../src/claim-store.ts'
import {
  PFAD_ABMELDEN,
  PFAD_ANMELDEN,
  PFAD_ICH,
  PFAD_REGISTRIEREN,
  type Umgebung,
} from '../src/paths.ts'

// ---------------------------------------------------------------------------
// Zugang und Sicherung
// ---------------------------------------------------------------------------

const URL_FROM_ENV = process.env.PMH_TEST_DATABASE_URL

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
    `HINWEIS: Tor-Prüfungen übersprungen — ${OHNE_ZUGANG}.\n` +
      '  Was hier fehlt, ist der Beweis, daß Claim und Rechte WIRKEN.\n',
  )
}

const run = adresseGesetzt(URL_FROM_ENV) ? describe : describe.skip

const ADMIN_MAIL = 'admin@torpruefung.invalid'
const NUTZER_MAIL = 'nutzer@torpruefung.invalid'
const PASSWORT = 'Ein-langes-Pruefpasswort-2026'

let sql: postgres.Sql
let server: Server
let basis: string
let home: string
let umg: Umgebung
/**
 * Derselbe Zugang, den die Umgebung benutzt — hier zusätzlich für die Prüfung.
 *
 * **Warum nicht `umg.speicher` dafür.** Der Speicher reicht für das Lesen, aber
 * das **Schreiben** eines Profils ist eine eigene Funktion (`speichereProfil`),
 * und die bekommt den Zugang, nicht den Speicher — wer ein Profil setzt, tut das
 * ausdrücklich und nicht über die Speicher-Fassade.
 */
let zugang: SqlZugang

/** Führt einen POST mit JSON-Körper aus und gibt Status und Körper zurück. */
async function post(
  pfad: string,
  koerper: unknown,
  kopf: Record<string, string> = {},
): Promise<{ status: number; koerper: Record<string, unknown>; cookies: string[] }> {
  const antwort = await fetch(`${basis}${pfad}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'torpruefung/1.0', ...kopf },
    body: JSON.stringify(koerper),
  })
  const text = await antwort.text()
  return {
    status: antwort.status,
    koerper: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>),
    cookies: antwort.headers.getSetCookie(),
  }
}

/** Holt einen Cookie-Wert aus einem `Set-Cookie`-Feld. */
function cookieAus(cookies: readonly string[], name: string): string {
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) return cookie.slice(name.length + 1).split(';')[0] ?? ''
  }
  return ''
}

/** Meldet an und gibt Sitzungstoken und CSRF-Wert zurück. */
async function anmelden(email: string): Promise<{ token: string; csrf: string; status: number }> {
  const antwort = await post(PFAD_ANMELDEN, { email, password: PASSWORT })
  return {
    token: cookieAus(antwort.cookies, 'pmh_session'),
    csrf: cookieAus(antwort.cookies, CSRF_COOKIE_NAME),
    status: antwort.status,
  }
}

beforeAll(async () => {
  if (!adresseGesetzt(URL_FROM_ENV)) return
  sql = postgres(URL_FROM_ENV, { max: 4, onnotice: () => undefined })

  // -------------------------------------------------------------------------
  // DIE SICHERUNG
  // -------------------------------------------------------------------------
  const angabe = await sql.unsafe<{ db: string }[]>('SELECT current_database() AS db')
  const hier = angabe[0]?.db ?? '?'
  // **Die Datei, nicht die Sitzung.** Siehe `packages/auth/db-schema/src/betriebsdatenbank.ts`.
  const betriebe = betriebsdatenbankNamen(new URL('.', import.meta.url))
  if (betriebe.includes(hier)) {
    await sql.end({ timeout: 5 })
    throw new Error(
      `ABBRUCH: dieser Test LÖSCHT ALLE BENUTZER und zeigt auf „${hier}" — dieselbe Datenbank wie die ` +
        `Anwendung (DATABASE_URL in .env). Er ist für eine Wegwerf-Datenbank gedacht: ` +
        `setze PMH_TEST_DATABASE_URL auf eine andere Datenbank.`,
    )
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

  // -------------------------------------------------------------------------
  // Die RECHTE wie im Betrieb
  // -------------------------------------------------------------------------
  // **Gemessen in `pmh` (der Betriebsdatenbank), nicht erfunden:**
  //
  //   pmh_app      : USAGE auf das Schema + SELECT/INSERT/UPDATE/DELETE auf alle Tabellen
  //   pmh_readonly : USAGE + SELECT
  //   beide        : KEIN `CREATE` auf dem Schema
  //
  // **Warum das hier steht.** Eine Wegwerf-Datenbank ist nur dann ein Abbild der
  // Betriebsdatenbank, wenn auch die Rechte stimmen. Gemessen war das nicht so:
  // in `pmh_test` hatte `pmh_app` **gar keine** Rechte — die Vergabe geschieht in
  // den Init-Skripten des Containers, und die laufen nur beim ersten Start eines
  // leeren Datenverzeichnisses. Eine Prüfung der Anwendungsrechte hätte dort eine
  // Umgebung geprüft, die es nirgends gibt.
  //
  // **Und bei JEDEM Lauf**, nicht einmalig: der Integrationstest des Schemas
  // wirft die Tabellen weg und legt sie neu an — Tabellenrechte sind danach fort.
  await sql.unsafe('GRANT USAGE ON SCHEMA pmh TO pmh_app, pmh_readonly')
  await sql.unsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pmh TO pmh_app')
  await sql.unsafe('GRANT SELECT ON ALL TABLES IN SCHEMA pmh TO pmh_readonly')
  await sql.unsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pmh TO pmh_app')

  // **Leer machen, damit die Erstinbetriebnahme offen ist.** Nur auf einer
  // Wegwerf-Datenbank — die Sicherung oben hat das geprüft. Die Sitzungen und
  // Spuren hängen per `ON DELETE CASCADE` bzw. `SET NULL` daran.
  await sql.unsafe('DELETE FROM users')

  const zugangLokal: SqlZugang = {
    async unsafe(anweisung: string, werte: readonly unknown[] = []): Promise<unknown> {
      return await sql.unsafe(anweisung, werte as never[])
    },
  }
  zugang = zugangLokal

  home = mkdtempSync(join(tmpdir(), 'pmh-tor-home-'))
  leseOderErzeugeGeraeteId(home)

  umg = {
    speicher: erzeugeSpeicher(zugang),
    hasher: new Argon2PasswordHasher(),
    limiter: new MemoryRateLimiter(),
    sicher: false,
    maxUsers: undefined,
    jetzt: () => new Date(),
    warten: async () => undefined,
    home,
    claimAblage: claimAblageImHome(home),
  }

  const wege: readonly [string, Weg][] = [
    [PFAD_REGISTRIEREN, wegRegistrieren(umg)],
    [PFAD_ANMELDEN, wegAnmelden(umg)],
    [PFAD_ABMELDEN, wegAbmelden(umg)],
    [PFAD_ICH, wegIch(umg)],
  ]
  server = createServer((req, res) => {
    const pfad = new URL(req.url ?? '/', 'http://x').pathname
    const treffer = wege.find(([p]) => p === pfad)
    if (treffer === undefined) {
      res.writeHead(404).end()
      return
    }
    void treffer[1](req, res)
  })
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig))
  basis = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
})

afterAll(async () => {
  if (!adresseGesetzt(URL_FROM_ENV)) return
  await new Promise<void>((fertig) => server.close(() => fertig()))
  // **Kein Aufräumen der Benutzer hier.** Das `beforeAll` leert die Tabelle
  // ohnehin, bevor es losgeht — ein zweiter Löschvorgang am Ende bringt nichts
  // und nimmt die Möglichkeit, nach einem roten Lauf **nachzusehen**, was
  // tatsächlich in der Datenbank steht. Auf einer Wegwerf-Datenbank ist das
  // Beobachten mehr wert als die leere Tabelle.
  await sql.end({ timeout: 5 })
  if (home !== undefined && existsSync(home)) rmSync(home, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Die Erstinbetriebnahme
// ---------------------------------------------------------------------------

run('Erstinbetriebnahme: ohne Claim kein Adminkonto', () => {
  test('ohne Claim-Token wird abgewiesen — und zwar deutlich', async () => {
    // **Der Fall, der vorher fehlte.** Bis zum 13.10.2026 konnte jeder, der den
    // Port erreichte, ein Konto anlegen. Jetzt ist der erste Weg zu.
    await umg.limiter.clear()
    const antwort = await post(PFAD_REGISTRIEREN, {
      email: ADMIN_MAIL,
      password: PASSWORT,
      displayName: 'Erster',
    })
    expect(antwort.status).toBe(403)
    const fehler = antwort.koerper['error'] as { code: string; message: string }
    expect(fehler.code).toBe('claim-fehlt')
    // Der Text nennt die Datei, in der das Token steht — der Eigentümer sitzt hier.
    expect(fehler.message).toContain('claim.txt')

    // Und es ist wirklich **kein** Benutzer entstanden.
    expect(await umg.speicher.benutzer.count()).toBe(0)
  })

  test('mit einem falschen Token wird abgewiesen — der echte Claim lebt weiter', async () => {
    await umg.limiter.clear()
    const bindung = leseMaschinenbindung(home)
    const claim = await erzeugeClaim(home, bindung, umg.claimAblage, new Date())

    const falsch = await post(PFAD_REGISTRIEREN, {
      email: ADMIN_MAIL,
      password: PASSWORT,
      displayName: 'Erster',
      claimToken: 'ein-voellig-anderes-token',
    })
    expect(falsch.status).toBe(403)
    expect(((falsch.koerper['error'] as { code: string }).code)).toBe('claim-token-falsch')

    // **Der echte Claim ist noch gültig.** Sonst hätte ein Rateversuch den
    // Eigentümer ausgesperrt — genau die Falle, die `verbrauche` nicht hat.
    expect((await umg.claimAblage.liesJüngsten())?.verbraucht).toBe(false)
    expect(claim.token).not.toBe('')
  })

  test('mit dem richtigen Token entsteht ein ADMIN — und die Claim-Datei verschwindet', async () => {
    await umg.limiter.clear()
    const bindung = leseMaschinenbindung(home)
    const ablage = umg.claimAblage
    const claim = await erzeugeClaim(home, bindung, ablage, new Date())

    const antwort = await post(PFAD_REGISTRIEREN, {
      email: ADMIN_MAIL,
      password: PASSWORT,
      displayName: 'Erster',
      claimToken: claim.token,
    })
    expect(antwort.status).toBe(201)
    const wert = antwort.koerper['value'] as { id: string; role: string }
    // **Die Rolle ist der Kern.** Nicht „der erste wird irgendwie benannt",
    // sondern: lokaler Zugang ist die Vertrauenswurzel, und daraus folgt Admin.
    expect(wert.role).toBe('admin')

    // **Und jetzt der Blick in die ZEILE, nicht in die Antwort.**
    //
    // Genau hier steckte der Fehler, den diese Prüfung gefunden hat: der Weg
    // meldete `"role":"admin"`, und in `pmh.users` stand `role='user'` — der
    // Regelkern gab die Rolle nur **zurück** und übergab sie nie an
    // `store.create`. Wer nur die Antwort prüft, sieht davon nichts.
    const zeile = await sql.unsafe<{ role: string }[]>('SELECT role FROM users WHERE email = $1', [ADMIN_MAIL])
    expect(zeile[0]?.role).toBe('admin')

    // Die Notizdatei ist weg — ein Token, das nicht mehr gilt, aber noch
    // existiert, wäre eine Einladung, es wieder gültig zu machen.
    expect(existsSync(join(home, 'claim.txt'))).toBe(false)
    // Und der Claim ist als verbraucht markiert.
    expect((await ablage.liesJüngsten())?.verbraucht).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Danach: nur noch ein Admin
// ---------------------------------------------------------------------------

run('Danach: nur ein angemeldeter Admin legt Konten an', () => {
  test('ohne Sitzung ergibt 401 — nicht 403', async () => {
    // **Der Unterschied ist Absicht.** „Du bist nicht angemeldet" und „du darfst
    // nicht" sind zwei verschiedene Auskünfte; wer nicht angemeldet ist, soll das
    // erfahren und nicht über Rechte nachdenken.
    await umg.limiter.clear()
    const antwort = await post(PFAD_REGISTRIEREN, {
      email: NUTZER_MAIL,
      password: PASSWORT,
      displayName: 'Zweiter',
    })
    expect(antwort.status).toBe(401)
    expect((antwort.koerper['error'] as { code: string }).code).toBe('nicht-angemeldet')
  })

  test('als Admin OHNE CSRF-Wert ergibt 403', async () => {
    await umg.limiter.clear()
    const sitzung = await anmelden(ADMIN_MAIL)
    expect(sitzung.status).toBe(200)

    const antwort = await post(
      PFAD_REGISTRIEREN,
      { email: NUTZER_MAIL, password: PASSWORT, displayName: 'Zweiter' },
      { cookie: `pmh_session=${sitzung.token}` },
    )
    expect(antwort.status).toBe(403)
    expect((antwort.koerper['error'] as { code: string }).code).toBe('csrf-fehlt')
  })

  test('als Admin MIT CSRF-Wert entsteht ein gewöhnlicher Benutzer', async () => {
    await umg.limiter.clear()
    const sitzung = await anmelden(ADMIN_MAIL)
    const antwort = await post(
      PFAD_REGISTRIEREN,
      { email: NUTZER_MAIL, password: PASSWORT, displayName: 'Zweiter' },
      { cookie: `pmh_session=${sitzung.token}`, 'x-pmh-csrf': sitzung.csrf },
    )
    expect(antwort.status).toBe(201)
    const wert = antwort.koerper['value'] as { role: string }
    // **Ein Admin legt keine Admins an** — jedenfalls nicht über diesen Weg.
    // Wer einen zweiten Admin will, braucht eine bewusste Handlung; sonst wird
    // aus einer versehentlichen Freigabe still eine zweite Vollmacht.
    expect(wert.role).toBe('user')
  })

  test('ein gewöhnlicher Benutzer wird vom RECHT abgewiesen — nicht vom CSRF', async () => {
    // **Das ist die Prüfung, auf die es ankommt.** Alles davor könnte auch ohne
    // `permissions` funktionieren — dieser Fall nicht: der Benutzer ist korrekt
    // angemeldet, hat einen gültigen CSRF-Wert, und trotzdem sagt `darfAusfuehren`
    // nein. Der Grund ist `admin-erforderlich`, und der kommt aus dem Paket.
    await umg.limiter.clear()
    const sitzung = await anmelden(NUTZER_MAIL)
    expect(sitzung.status).toBe(200)
    expect(sitzung.csrf).not.toBe('')

    const antwort = await post(
      PFAD_REGISTRIEREN,
      { email: 'dritter@torpruefung.invalid', password: PASSWORT, displayName: 'Dritter' },
      { cookie: `pmh_session=${sitzung.token}`, 'x-pmh-csrf': sitzung.csrf },
    )
    expect(antwort.status).toBe(403)
    const fehler = antwort.koerper['error'] as { code: string; message: string }
    expect(fehler.code).toBe('recht-admin-erforderlich')
    expect(fehler.message.length).toBeGreaterThan(0)

    // Und es ist wirklich niemand entstanden.
    expect(await umg.speicher.benutzer.count()).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Der Zustand, den die erste Fassung des Tores übersah
// ---------------------------------------------------------------------------

run('Konten ohne Administrator: das Tor öffnet wieder', () => {
  test('ein Claim führt aus der Aussperrung heraus — gemessen an genau diesem Zustand', async () => {
    // **Der Zustand.** Am 13.10.2026 in der Betriebsdatenbank gemessen:
    // `benutzer=4  davon_admins=0`. Vor der Verdrahtung des Tores konnte dort
    // jeder ein Konto anlegen; **mit** dem Tor in der ersten Fassung
    // (`erstinbetriebnahmeOffen(anzahl)`, also „keine Konten") konnte es
    // **niemand** mehr — die Erstinbetriebnahme war zu, und einen Admin, der
    // hätte anlegen dürfen, gab es nicht.
    //
    // **Nachgestellt wird genau das:** der Admin wird zum gewöhnlichen Benutzer
    // gemacht. Danach gibt es Konten, aber keinen Administrator.
    await sql.unsafe(`UPDATE users SET role = 'user' WHERE email = $1`, [ADMIN_MAIL])
    expect(await umg.speicher.anzahlAdmins()).toBe(0)
    expect(await umg.speicher.benutzer.count()).toBeGreaterThan(0)
    // Die erste Bedingung des Tores ist damit **zu** — die zweite muß greifen.
    expect(erstinbetriebnahmeOffen(await umg.speicher.benutzer.count())).toBe(false)

    // Ohne Claim bleibt es zu: niemand kommt hinein.
    await umg.limiter.clear()
    const ohneClaim = await post(PFAD_REGISTRIEREN, {
      email: 'neuer-admin@torpruefung.invalid',
      password: PASSWORT,
      displayName: 'Neuer Admin',
    })
    expect(ohneClaim.status).toBe(403)
    expect((ohneClaim.koerper['error'] as { code: string }).code).toBe('claim-fehlt')

    // Mit Claim geht es — und der Neue ist **Admin**, sonst wäre die Aussperrung
    // nur um eine Runde verschoben.
    await umg.limiter.clear()
    const bindung = leseMaschinenbindung(home)
    const claim = await erzeugeClaim(home, bindung, umg.claimAblage, new Date())
    const mitClaim = await post(PFAD_REGISTRIEREN, {
      email: 'neuer-admin@torpruefung.invalid',
      password: PASSWORT,
      displayName: 'Neuer Admin',
      claimToken: claim.token,
    })
    expect(mitClaim.status).toBe(201)
    expect((mitClaim.koerper['value'] as { role: string }).role).toBe('admin')

    // **Und die Zeile in der Datenbank.** Nicht die Antwort — die Zeile.
    const zeile = await sql.unsafe<{ role: string }[]>('SELECT role FROM users WHERE email = $1', [
      'neuer-admin@torpruefung.invalid',
    ])
    expect(zeile[0]?.role).toBe('admin')
    expect(await umg.speicher.anzahlAdmins()).toBe(1)

    // **Und jetzt ist es wieder zu** — ein zweiter Claim führt nicht noch einmal
    // hinein, denn es gibt nun einen Administrator.
    await umg.limiter.clear()
    const zweiterVersuch = await post(PFAD_REGISTRIEREN, {
      email: 'dritter-admin@torpruefung.invalid',
      password: PASSWORT,
      displayName: 'Dritter',
    })
    expect(zweiterVersuch.status).toBe(401)

    // **Zustand zurückgeben.** Dieser Test hat den ursprünglichen Admin zum
    // gewöhnlichen Benutzer gemacht — eine Änderung an **geteiltem** Zustand.
    // Ohne diese Zeile hinge der nächste Test davon ab, daß er **nach** diesem
    // läuft: er meldet sich als `ADMIN_MAIL` an und erwartete einen Admin. Genau
    // so ist es beim ersten Lauf gescheitert — und ein Test, der seine Nachbarn
    // von der Reihenfolge abhängig macht, ist ein Test, der irgendwann grundlos
    // rot wird.
    await sql.unsafe(`UPDATE users SET role = 'admin' WHERE email = $1`, [ADMIN_MAIL])
  })
})

// ---------------------------------------------------------------------------
// Wer bin ich: die Isolation
// ---------------------------------------------------------------------------

run('Wer bin ich liefert die Isolation', () => {
  test('der Admin darf das Home schreiben, der Benutzer nur seinen Bereich', async () => {
    const alsAdmin = await anmelden(ADMIN_MAIL)
    const antwortAdmin = await fetch(`${basis}${PFAD_ICH}`, {
      headers: { cookie: `pmh_session=${alsAdmin.token}` },
    })
    expect(antwortAdmin.status).toBe(200)
    const adminWert = (await antwortAdmin.json()) as {
      value: { role: string; isolation: { schreibwurzeln: string[]; dateizugriff: string } }
    }
    expect(adminWert.value.role).toBe('admin')
    expect(adminWert.value.isolation.schreibwurzeln.length).toBeGreaterThan(0)

    const alsNutzer = await anmelden(NUTZER_MAIL)
    const antwortNutzer = await fetch(`${basis}${PFAD_ICH}`, {
      headers: { cookie: `pmh_session=${alsNutzer.token}` },
    })
    expect(antwortNutzer.status).toBe(200)
    const nutzerWert = (await antwortNutzer.json()) as {
      value: { role: string; isolation: { schreibwurzeln: string[] } }
    }
    expect(nutzerWert.value.role).toBe('user')

    // **Der Unterschied, gemessen statt behauptet.** Die Wurzeln sind
    // unterschiedlich — und die des Benutzers ist eine **echte** Teilmenge (er
    // darf in seinem Bereich schreiben, nicht daneben).
    const adminWurzeln = new Set(adminWert.value.isolation.schreibwurzeln.map((w) => w.replaceAll('\\', '/')))
    const nutzerWurzeln = nutzerWert.value.isolation.schreibwurzeln.map((w) => w.replaceAll('\\', '/'))
    expect(nutzerWurzeln.length).toBeGreaterThan(0)
    for (const wurzel of nutzerWurzeln) {
      expect(adminWurzeln.has(wurzel)).toBe(false)
    }
  })

  test('ein gespeichertes Profil erscheint in der Antwort von /me', async () => {
    // **Der Beweis, daß Migration 0005 nicht nur eine Tabelle ist.** Die Kette:
    // Profil in die Datenbank schreiben → anmelden → `GET /me` → die Isolation
    // in der Antwort kommt **von dort** und nicht aus der Ableitung.
    //
    // Ohne diesen Test wäre die Tabelle ein Regal ohne Leser — genau das Muster,
    // das wir an `claim` und `permissions` beklagt haben.
    const sitzung = await anmelden(NUTZER_MAIL)
    expect(sitzung.status).toBe(200)

    // Vorher: die abgeleitete Isolation. Ein gewöhnlicher Benutzer darf schreiben
    // — aber nur in SEINEM Bereich unter dem Home.
    const vorher = await fetch(`${basis}${PFAD_ICH}`, { headers: { cookie: `pmh_session=${sitzung.token}` } })
    const vorherWert = (await vorher.json()) as { value: { isolation: { schreibwurzeln: string[]; netz: boolean } } }
    const abgeleitet = vorherWert.value.isolation.schreibwurzeln
    expect(abgeleitet.length).toBeGreaterThan(0)
    expect(vorherWert.value.isolation.netz).toBe(false)

    // Jetzt ein eigenes Profil — deutlich enger als die Ableitung.
    const userId = (await umg.speicher.benutzer.findByEmail(NUTZER_MAIL))?.id ?? ''
    expect(userId).not.toBe('')
    await speichereProfil(zugang, userId, {
      dateizugriff: 'read-only',
      lesewurzeln: ['/nur-hier'],
      schreibwurzeln: [],
      netz: false,
      prozesse: false,
    })

    const nachher = await fetch(`${basis}${PFAD_ICH}`, { headers: { cookie: `pmh_session=${sitzung.token}` } })
    expect(nachher.status).toBe(200)
    const nachherWert = (await nachher.json()) as {
      value: { isolation: { dateizugriff: string; lesewurzeln: string[]; schreibwurzeln: string[] } }
    }
    // **Die Werte kommen wörtlich aus der Zeile.** Nicht abgeleitet, nicht
    // gemischt: `read-only`, genau eine Lesewurzel, keine Schreibwurzel.
    expect(nachherWert.value.isolation.dateizugriff).toBe('read-only')
    expect(nachherWert.value.isolation.lesewurzeln).toEqual(['/nur-hier'])
    expect(nachherWert.value.isolation.schreibwurzeln).toEqual([])
  })

  test('die Anwendungsrolle darf Daten schreiben und KEIN Schema anlegen', async () => {
    // **Eine Prüfung der Umgebung, nicht des Codes — und sie ist nötig.**
    // Liefe die Anwendung als Eigentümer, hätte sie DDL-Rechte, und jede
    // Rechteprüfung wäre eine Behauptung über Rechte, die niemand hat. Gemessen
    // wird deshalb die Rolle, die in `DATABASE_URL` steht: `pmh_app`.
    const rechte = await sql.unsafe<{ usage: boolean; create: boolean; schreiben: boolean }[]>(
      `SELECT has_schema_privilege('pmh_app', 'pmh', 'USAGE')   AS usage,
              has_schema_privilege('pmh_app', 'pmh', 'CREATE')  AS create,
              has_table_privilege('pmh_app', 'pmh.users', 'INSERT') AS schreiben`,
    )
    expect(rechte[0]?.usage).toBe(true)
    expect(rechte[0]?.schreiben).toBe(true)
    // **Kein `CREATE`.** Wer das ändert, hebt das Rechtemodell auf, ohne daß es
    // auffällt — und ein Angreifer mit einer Datenbankschwachstelle könnte
    // Tabellen anlegen statt nur Zeilen zu schreiben.
    expect(rechte[0]?.create).toBe(false)
  })
})
