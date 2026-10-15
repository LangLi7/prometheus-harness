/**
 * Die Wege der Quellordner — über einen **echten Socket**.
 *
 * ## Zwei Teile
 *
 * **Ohne Datenbank:** die vier Wege ohne Sitzung müssen **401** geben — und die Datenbank
 * dabei **nicht anfassen**. Das ist prüfbar, ohne eine zu haben: der Zugang dieser Prüfung
 * **wirft**, wenn ihn jemand benutzt. Käme eine 500 statt der 401, hätte der Weg zuerst
 * gefragt und danach erst geprüft — die Reihenfolge wäre falsch.
 *
 * **Mit Datenbank:** die ganze Kette: Konto anlegen, anmelden, Ordner eintragen, Zugriff
 * umstellen, entfernen. Und die zwei Fälle, die **nicht** gehen dürfen: der Arbeitsplatz läßt
 * sich weder entfernen noch auf „lesen" stellen.
 *
 * ## Warum der Mandant aus der Sitzung kommt und nicht aus dem Körper
 *
 * Der Weg liest `userId` aus der **Sitzung**. Ein Körper-Feld dafür wäre eine Einladung: jeder
 * Aufrufer könnte einen fremden Mandanten nennen. Geprüft wird das hier indirekt — der Weg
 * kennt gar kein solches Feld.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { Argon2PasswordHasher, MemoryRateLimiter } from '@prometheus-harness/auth'
import { betriebsdatenbankNamen } from '@prometheus-harness/db-schema'
import { erzeugeSpeicher, type SqlZugang, type TransaktionsZugang } from '@prometheus-harness/store-postgres'
import postgres from 'postgres'
import { claimAblageImHome } from '../src/claim-store.ts'
import { PFAD_ORDNER, PFAD_ORDNER_ANLEGEN, PFAD_ORDNER_ENTFERNEN, PFAD_ORDNER_ZUGRIFF, ordnerWege } from '../src/folders.ts'
import { anmelden, type Umgebung } from '../src/paths.ts'

/** Ein Verzeichnis für die Claim-Ablage — es wird nichts hineingeschrieben. */
const HOME = mkdtempSync(join(tmpdir(), 'pmh-ordner-'))

/** Ein Zugang, der **wirft**, sobald ihn jemand benutzt. */
const nieBeruehrt: TransaktionsZugang = {
  async unsafe(): Promise<unknown> {
    throw new Error('Diese Prüfung darf die Datenbank nicht anfassen.')
  },
  async begin(): Promise<never> {
    throw new Error('Diese Prüfung darf die Datenbank nicht anfassen.')
  },
}

/** Eine Umgebung ohne Speicher — sie wird nur für die Sitzungsprüfung gebraucht. */
function umgebung(speicher: Umgebung['speicher']): Umgebung {
  return {
    speicher,
    hasher: new Argon2PasswordHasher(),
    limiter: new MemoryRateLimiter(),
    sicher: false,
    maxUsers: undefined,
    jetzt: () => new Date(),
    warten: async () => undefined,
    home: HOME,
    claimAblage: claimAblageImHome(HOME),
  }
}

/**
 * Sucht den Weg wie der Kern: erst die genaue Tabelle, dann das längste Präfix.
 *
 * @param wege - die angemeldeten Wege
 * @param pfad - der angefragte Pfad
 * @returns der zuständige Weg oder `undefined`
 */
function findeWeg(wege: readonly WebRoute[], pfad: string): WebRoute | undefined {
  const genau = wege.find((w) => w.kind === 'exact' && w.path === pfad)
  if (genau !== undefined) return genau
  return wege
    .filter((w) => w.kind === 'prefix' && (pfad === w.path || pfad.startsWith(`${w.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

/** Startet einen Server mit diesen Wegen. */
async function starteServer(wege: readonly WebRoute[]): Promise<{ server: Server; basis: string }> {
  const s = createServer((req: IncomingMessage, res: ServerResponse) => {
    const pfad = (req.url ?? '/').split('?')[0] ?? '/'
    const treffer = findeWeg(wege, pfad)
    if (treffer === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('nicht gefunden')
      return
    }
    void Promise.resolve(treffer.handler(req, res)).catch(() => {
      try {
        res.writeHead(500)
        res.end()
      } catch {
        // Der Socket kann schon zu sein.
      }
    })
  })
  await new Promise<void>((fertig) => s.listen(0, '127.0.0.1', fertig))
  return { server: s, basis: `http://127.0.0.1:${String((s.address() as AddressInfo).port)}` }
}

// ---------------------------------------------------------------------------
// 1. Ohne Sitzung — und ohne die Datenbank anzufassen
// ---------------------------------------------------------------------------

describe('Die Ordnerwege ohne Sitzung', () => {
  let server: Server
  let basis: string

  beforeAll(async () => {
    const gebaut = await starteServer(ordnerWege(umgebung(undefined as never), nieBeruehrt))
    server = gebaut.server
    basis = gebaut.basis
  })

  afterAll(async () => {
    await new Promise<void>((fertig) => server.close(() => fertig()))
    rmSync(HOME, { recursive: true, force: true })
  })

  test('die Liste gibt 401 — nicht 500', async () => {
    const antwort = await fetch(`${basis}${PFAD_ORDNER}?workspace=egal`)
    expect(antwort.status).toBe(401)
    expect(((await antwort.json()) as { error?: { code?: string } }).error?.code).toBe('nicht-angemeldet')
  })

  test('die drei ändernden Wege geben 401 — die Sitzung wird ZUERST geprüft', async () => {
    // Wäre die Reihenfolge anders (erst Datenbank, dann Sitzung), käme hier eine 500: der
    // Zugang dieser Prüfung wirft.
    for (const pfad of [PFAD_ORDNER_ANLEGEN, PFAD_ORDNER_ZUGRIFF, PFAD_ORDNER_ENTFERNEN]) {
      const antwort = await fetch(`${basis}${pfad}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect({ pfad, status: antwort.status }).toEqual({ pfad, status: 401 })
    }
  })

  test('eine falsche Methode wird abgewiesen — POST auf die Liste ergibt 405', async () => {
    const antwort = await fetch(`${basis}${PFAD_ORDNER}`, { method: 'POST' })
    expect(antwort.status).toBe(405)
  })
})

// ---------------------------------------------------------------------------
// 2. Mit Datenbank — die ganze Kette
// ---------------------------------------------------------------------------

const DA = process.env.PMH_TEST_DATABASE_URL
const bereit = DA !== undefined && DA.trim() !== ''
const mitDatenbank = bereit ? describe : describe.skip

if (!bereit) {
  process.stderr.write(
    'HINWEIS: die Ordnerprüfungen mit Datenbank sind übersprungen — PMH_TEST_DATABASE_URL fehlt.\n' +
      '  Was fehlt, ist der Beweis, daß die Kette wirklich schreibt und liest.\n',
  )
}

mitDatenbank('Die Ordnerwege mit Datenbank', () => {
  let sql: postgres.Sql
  let zugang: TransaktionsZugang
  let umg: Umgebung
  let einer: { server: Server; basis: string }
  let token = ''
  let csrf = ''
  let benutzerId = ''
  let arbeitsbereichId = ''

  beforeAll(async () => {
    if (!bereit) return
    sql = postgres(DA, { max: 2, onnotice: () => undefined })

    // -------------------------------------------------------------------------
    // DER RIEGEL — er fehlte hier, und das war ein Fehler
    // -------------------------------------------------------------------------
    // **Gemessen am 15.10.2026:** der erste Lauf dieser Prüfdatei ging gegen die
    // **Betriebsdatenbank**, weil `PMH_TEST_DATABASE_URL` aus `.env` dorthin zeigt und hier
    // kein Riegel stand. Sie hat aufgeräumt (Konto und Arbeitsbereich am Ende gelöscht), aber
    // **zwei Prüfspur-Einträge** (`auth_events`) blieben stehen: 16 → 18.
    //
    // Dieselbe Regel wie in `packages/auth/db-schema/src/betriebsdatenbank.ts`: verglichen wird
    // mit der **Datei** `.env`, nicht mit der Sitzung.
    const angabe = await sql.unsafe<{ db: string }[]>('select current_database() as db')
    const hier = angabe[0]?.db ?? '?'
    if (betriebsdatenbankNamen(new URL('.', import.meta.url)).includes(hier)) {
      await sql.end({ timeout: 5 })
      throw new Error(
        `ABBRUCH: diese Prüfung legt Konten an und schreibt Ordner und zeigt auf „${hier}" — dieselbe ` +
          `Datenbank wie die Anwendung (DATABASE_URL in .env). Sie ist für eine Wegwerf-Datenbank gedacht.`,
      )
    }

    zugang = {
      async unsafe(anweisung: string, werte: readonly unknown[] = []): Promise<unknown> {
        return await sql.unsafe(anweisung, werte as never[])
      },
      async begin<T>(arbeit: (innerhalb: SqlZugang) => Promise<T>): Promise<T> {
        // **Der Treiber hüllt das Ergebnis anders ein**, als unser `TransaktionsZugang` es
        // zusagt (`UnwrapPromiseArray<T>` gegen `T`). Der Wert ist derselbe; die Zusicherung
        // steht hier, damit der Typlauf nicht über die Hülle des Treibers stolpert.
        return (await sql.begin(async (tx) =>
          arbeit({
            async unsafe(a: string, w: readonly unknown[] = []): Promise<unknown> {
              return await tx.unsafe(a, w as never[])
            },
          }),
        )) as T
      },
    }
    umg = umgebung(erzeugeSpeicher(zugang))

    // **Der Zustand wird selbst hergestellt** — Konto, Arbeitsbereich, Anmeldung.
    benutzerId = crypto.randomUUID()
    arbeitsbereichId = crypto.randomUUID()
    const hash = await umg.hasher.hash('Ordner-ist-kein-Zufall-2026')
    await sql.unsafe(`insert into pmh.users (id, email, password_hash, display_name, role)
                      values ($1, $2, $3, 'Ordner', 'user')`, [benutzerId, `ordner-${benutzerId}@probe.invalid`, hash])
    await sql.unsafe(`insert into pmh.workspaces (id, user_id, name) values ($1, $2, 'Ordnerprobe')`, [
      arbeitsbereichId,
      benutzerId,
    ])

    const antwort = await anmelden(umg, {
      email: `ordner-${benutzerId}@probe.invalid`,
      password: 'Ordner-ist-kein-Zufall-2026',
      userAgent: 'pruefung',
      ip: '127.0.0.1',
    })
    expect(antwort.status).toBe(200)
    const kekse = antwort.koepfe['set-cookie']
    const liste = Array.isArray(kekse) ? kekse : [kekse ?? '']
    token = (liste.find((k) => k.startsWith('pmh_session=')) ?? '').split(';')[0]?.slice('pmh_session='.length) ?? ''
    csrf = (liste.find((k) => k.startsWith('pmh_csrf=')) ?? '').split(';')[0]?.slice('pmh_csrf='.length) ?? ''
    expect(token).not.toBe('')
    expect(csrf).not.toBe('')

    einer = await starteServer(ordnerWege(umg, zugang))
  })

  afterAll(async () => {
    // Der Riegel fragt den GEGENSTAND: `bereit` fragt die Umgebung (Regel 33), und ohne
    // laufende Datenbank baute `beforeAll` nichts — der Haken schloß dann einen Server,
    // den es nie gab. Gemessen am 15.10.2026 (docs/status/naming-rest.md §7).
    const e: typeof einer | undefined = einer
    const db: postgres.Sql | undefined = sql
    if (e === undefined || db === undefined) return
    await new Promise<void>((fertig) => e.server.close(() => fertig()))
    await db.unsafe('delete from pmh.users where id = $1', [benutzerId]).catch(() => undefined)
    await db.end({ timeout: 5 })
    rmSync(HOME, { recursive: true, force: true })
  })

  /** Ruft einen Weg mit Sitzung und CSRF auf. */
  const ruf = async (
    pfad: string,
    koerper?: unknown,
  ): Promise<{ status: number; koerper: { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } }> => {
    const antwort = await fetch(`${einer.basis}${pfad}`, {
      method: koerper === undefined ? 'GET' : 'POST',
      headers: {
        cookie: `pmh_session=${token}; pmh_csrf=${csrf}`,
        'x-pmh-csrf': csrf,
        ...(koerper === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(koerper === undefined ? {} : { body: JSON.stringify(koerper) }),
    })
    return { status: antwort.status, koerper: (await antwort.json()) as never }
  }

  test('leer am Anfang — und ohne Arbeitsplatz gibt es keine Zugriffspfade', async () => {
    const a = await ruf(`${PFAD_ORDNER}?workspace=${arbeitsbereichId}`)
    expect(a.status).toBe(200)
    const wert = a.koerper.value as { ordner?: unknown[]; wurzeln?: unknown }
    expect(wert.ordner).toEqual([])
    expect(wert.wurzeln).toBeNull()
  })

  test('der Arbeitsplatz wird eingetragen — und ist immer schreibbar', async () => {
    const a = await ruf(PFAD_ORDNER_ANLEGEN, {
      workspaceId: arbeitsbereichId,
      pfad: 'D:\\Ordnerprobe\\Arbeit',
      istPrimaer: true,
      // **„lesen" wird verlangt — und abgelehnt.** Der Arbeitsplatz ist der Ort, an dem
      // gearbeitet wird; die Prüfregel der Datenbank sagt dasselbe.
      zugriff: 'lesen',
    })
    expect(a.status).toBe(200)
    const ordner = (a.koerper.value as { ordner?: { istPrimaer?: boolean; zugriff?: string } }).ordner
    expect(ordner?.istPrimaer).toBe(true)
    expect(ordner?.zugriff).toBe('schreiben')
  })

  test('ein Zusatzordner wird eingetragen — Vorgabe LESEN', async () => {
    const a = await ruf(PFAD_ORDNER_ANLEGEN, { workspaceId: arbeitsbereichId, pfad: 'D:\\Ordnerprobe\\Daten' })
    expect(a.status).toBe(200)
    expect((a.koerper.value as { ordner?: { zugriff?: string } }).ordner?.zugriff).toBe('lesen')

    const b = await ruf(`${PFAD_ORDNER}?workspace=${arbeitsbereichId}`)
    const wert = b.koerper.value as { ordner?: { pfad: string }[]; wurzeln?: { hauptwurzel?: string; weitereLesbar?: string[] } }
    expect(wert.ordner?.length).toBe(2)
    expect(wert.wurzeln?.hauptwurzel).toBe('D:\\Ordnerprobe\\Arbeit')
    expect(wert.wurzeln?.weitereLesbar).toEqual(['D:\\Ordnerprobe\\Daten'])
  })

  test('derselbe Pfad zweimal ergibt 409 mit deutschem Text', async () => {
    const a = await ruf(PFAD_ORDNER_ANLEGEN, { workspaceId: arbeitsbereichId, pfad: 'D:\\Ordnerprobe\\Daten' })
    expect(a.status).toBe(409)
    expect(a.koerper.error?.code).toBe('pfad-schon-da')
    expect(a.koerper.error?.message ?? '').toContain('schon eingetragen')
  })

  test('ein relativer Pfad wird mit deutschem Text abgewiesen', async () => {
    const a = await ruf(PFAD_ORDNER_ANLEGEN, { workspaceId: arbeitsbereichId, pfad: 'kein/absoluter/pfad' })
    expect(a.status).toBe(400)
    expect(a.koerper.error?.code).toBe('pfad-unbrauchbar')
  })

  test('der Zusatzordner bekommt Schreibrecht — und wieder Lesen', async () => {
    const liste = await ruf(`${PFAD_ORDNER}?workspace=${arbeitsbereichId}`)
    const ordner = (liste.koerper.value as { ordner?: { id: string; pfad: string }[] }).ordner ?? []
    const daten = ordner.find((o) => o.pfad === 'D:\\Ordnerprobe\\Daten')
    expect(daten).toBeDefined()

    const auf = await ruf(PFAD_ORDNER_ZUGRIFF, { id: daten?.id, zugriff: 'schreiben' })
    expect(auf.status).toBe(200)
    const zu = await ruf(PFAD_ORDNER_ZUGRIFF, { id: daten?.id, zugriff: 'lesen' })
    expect(zu.status).toBe(200)

    const nach = await ruf(`${PFAD_ORDNER}?workspace=${arbeitsbereichId}`)
    const wurzeln = (nach.koerper.value as { wurzeln?: { weitereSchreibbar?: string[]; weitereLesbar?: string[] } }).wurzeln
    expect(wurzeln?.weitereSchreibbar).toEqual([])
    expect(wurzeln?.weitereLesbar).toEqual(['D:\\Ordnerprobe\\Daten'])
  })

  test('der Arbeitsplatz läßt sich NICHT auf Lesen stellen', async () => {
    const liste = await ruf(`${PFAD_ORDNER}?workspace=${arbeitsbereichId}`)
    const haupt = ((liste.koerper.value as { ordner?: { id: string; istPrimaer: boolean }[] }).ordner ?? []).find(
      (o) => o.istPrimaer,
    )
    const a = await ruf(PFAD_ORDNER_ZUGRIFF, { id: haupt?.id, zugriff: 'lesen' })
    expect(a.status).toBe(404)
    expect(a.koerper.error?.code).toBe('nicht-aenderbar')
  })

  test('der Arbeitsplatz läßt sich NICHT entfernen — der Zusatzordner schon', async () => {
    const liste = await ruf(`${PFAD_ORDNER}?workspace=${arbeitsbereichId}`)
    const alle = (liste.koerper.value as { ordner?: { id: string; istPrimaer: boolean }[] }).ordner ?? []
    const haupt = alle.find((o) => o.istPrimaer)
    const zusatz = alle.find((o) => !o.istPrimaer)

    const nein = await ruf(PFAD_ORDNER_ENTFERNEN, { id: haupt?.id })
    expect(nein.status).toBe(404)
    expect(nein.koerper.error?.code).toBe('nicht-entfernbar')

    const ja = await ruf(PFAD_ORDNER_ENTFERNEN, { id: zusatz?.id })
    expect(ja.status).toBe(200)

    const nach = await ruf(`${PFAD_ORDNER}?workspace=${arbeitsbereichId}`)
    expect((nach.koerper.value as { ordner?: unknown[] }).ordner?.length).toBe(1)
  })

  test('OHNE CSRF-Wert wird nichts geändert — 403', async () => {
    const vorher = await ruf(`${PFAD_ORDNER}?workspace=${arbeitsbereichId}`)
    const anzahlVorher = (vorher.koerper.value as { ordner?: unknown[] }).ordner?.length

    const antwort = await fetch(`${einer.basis}${PFAD_ORDNER_ANLEGEN}`, {
      method: 'POST',
      headers: { cookie: `pmh_session=${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: arbeitsbereichId, pfad: 'D:\\Ordnerprobe\\Ohne-Csrf' }),
    })
    expect(antwort.status).toBe(403)
    expect(((await antwort.json()) as { error?: { code?: string } }).error?.code).toBe('csrf-fehlt')

    const nachher = await ruf(`${PFAD_ORDNER}?workspace=${arbeitsbereichId}`)
    expect((nachher.koerper.value as { ordner?: unknown[] }).ordner?.length).toBe(anzahlVorher)
  })
})
