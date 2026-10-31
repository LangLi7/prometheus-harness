/**
 * Die vier Routen — ohne Host, aber mit einem Kontext, der **mitschreibt**.
 *
 * ## Was diese Prüfung beweist
 *
 * Daß die Sperre greift, daß der CSRF-Kopf verlangt wird, daß ein Schlüssel **nie** in einer
 * Antwort steht, daß die Kennung nicht überschrieben wird — und daß die Sonde gegen einen echten
 * lokalen Dienst läuft. Was sie **nicht** beweist: daß der echte Loader das Plugin lädt; das steht
 * erst nach einem Neustart des Hosts fest.
 *
 * @module @prometheus-harness/zugaenge/tests/server
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import type { Context } from '@deepseek-ai/cordis'
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

import { ROUTEN, apply, csrfGrund, freieKennung, geltung, name } from '../src/server.ts'
import { FASSUNG, alsZugang } from '../src/vertrag.ts'

/** Ein Verzeichnis je Test. */
let verzeichnis = ''
let pfad = ''

beforeEach(() => {
  verzeichnis = mkdtempSync(join(tmpdir(), 'pmh-zugaenge-server-'))
  pfad = join(verzeichnis, 'zugaenge.json')
  process.env['PMH_ZUGAENGE_DATEI'] = pfad
})

afterEach(() => {
  delete process.env['PMH_ZUGAENGE_DATEI']
  delete process.env['PMH_BENUTZER']
  rmSync(verzeichnis, { recursive: true, force: true })
})

/** Eine geschriebene Antwort. */
interface Antwort {
  status: number
  koerper: string
  kopf: Record<string, unknown>
}

/**
 * Baut eine Anfrage, die sich wie ein `IncomingMessage` lesen läßt.
 *
 * @param methode - die Methode
 * @param koerper - der Rumpf (wird JSON-kodiert)
 * @param kopf - die Kopfzeilen
 * @returns die Anfrage
 */
function anfrage(methode: string, koerper?: unknown, kopf: Record<string, string> = {}): IncomingMessage {
  const text = koerper === undefined ? undefined : JSON.stringify(koerper)
  const strom = Readable.from(text === undefined ? [] : [Buffer.from(text, 'utf8')])
  return Object.assign(strom, { method: methode, headers: kopf, url: '/' }) as unknown as IncomingMessage
}

/** Baut eine Antwort, die mitschreibt. */
function antwort(): { res: ServerResponse; gelesen: Antwort } {
  const gelesen: Antwort = { status: 0, koerper: '', kopf: {} }
  const res = {
    writeHead: (status: number, kopf?: Record<string, unknown>) => {
      gelesen.status = status
      if (kopf !== undefined) gelesen.kopf = kopf
    },
    setHeader: (schluessel: string, wert: unknown) => {
      gelesen.kopf[schluessel] = wert
    },
    end: (koerper?: string) => {
      gelesen.koerper = koerper ?? ''
    },
  } as unknown as ServerResponse
  return { res, gelesen }
}

/** Ein Credential-Dienst im Speicher. */
function macheCredentials(): {
  readonly werte: Map<string, string>
  readonly dienst: Record<string, unknown>
} {
  const werte = new Map<string, string>()
  return {
    werte,
    dienst: {
      async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
        const wert = werte.get(String(key))
        return wert === undefined ? undefined : { kind: 'api-key', key: wert }
      },
      async describeRecord(key: CredentialKey): Promise<{ configured: boolean; writable: boolean }> {
        return { configured: werte.has(String(key)), writable: true }
      },
      async modifyRecord(
        key: CredentialKey,
        mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
      ): Promise<CredentialRecord | undefined> {
        const alt = werte.get(String(key))
        const neu = await mutate(alt === undefined ? undefined : { kind: 'api-key', key: alt })
        if (neu !== undefined && neu.kind === 'api-key' && typeof neu.key === 'string') {
          werte.set(String(key), neu.key)
        }
        return neu
      },
      async deleteRecord(key: CredentialKey): Promise<void> {
        werte.delete(String(key))
      },
    },
  }
}

/** Was ein Fake-Kontext mitschreibt. */
interface Fake {
  readonly ctx: Context
  readonly routen: WebRoute[]
  readonly wirkungen: (() => void)[]
  readonly dienste: Map<string, unknown>
  readonly abmelden: () => void
}

/**
 * Baut einen Kontext, der nur das kann, was `apply` verlangt.
 *
 * @param optionen - Anmeldung erlaubt? Credential-Dienst vorhanden?
 * @returns der Fake
 */
function macheFake(optionen: { erlaubt?: boolean; mitVerbindung?: boolean; credentials?: unknown } = {}): Fake {
  const routen: WebRoute[] = []
  const wirkungen: (() => void)[] = []
  const dienste = new Map<string, unknown>()
  const mitVerbindung = optionen.mitVerbindung ?? true
  const erlaubt = optionen.erlaubt ?? true
  const ctx = {
    get: (dienst: string) => {
      if (dienst === 'connection') {
        return mitVerbindung ? { requestRejection: () => (erlaubt ? undefined : 401) } : undefined
      }
      if (dienst === 'credentials') return optionen.credentials
      return undefined
    },
    provide: (name0: string, wert: unknown) => {
      dienste.set(name0, wert)
      return () => {
        dienste.delete(name0)
      }
    },
    webServer: {
      register: (route: WebRoute) => {
        routen.push(route)
        return () => {
          const at = routen.indexOf(route)
          if (at >= 0) routen.splice(at, 1)
        }
      },
    },
    effect: (fn: () => () => void) => {
      wirkungen.push(fn())
    },
  } as unknown as Context
  return {
    ctx,
    routen,
    wirkungen,
    dienste,
    abmelden: () => {
      for (const ab of wirkungen.splice(0).reverse()) ab()
    },
  }
}

/**
 * Ruft eine Route auf.
 *
 * @param route - die Route
 * @param methode - die Methode
 * @param koerper - der Rumpf
 * @param kopf - die Kopfzeilen
 * @returns Status, Körper und Kopf
 */
async function rufe(
  route: WebRoute,
  methode: string,
  koerper?: unknown,
  kopf: Record<string, string> = {},
): Promise<Antwort> {
  const { res, gelesen } = antwort()
  await route.handler(anfrage(methode, koerper, kopf), res)
  return gelesen
}

/** Die Routen nach Pfad. */
function route(fake: Fake, pfad0: string): WebRoute {
  const gefunden = fake.routen.find((eintrag) => eintrag.path === pfad0)
  if (gefunden === undefined) throw new Error(`Route fehlt: ${pfad0}`)
  return gefunden
}

/** Der CSRF-Kopf für schreibende Aufrufe. */
const CSRF = { 'x-pmh-csrf': 'test-wert' }

/** Eine brauchbare Eingabe für die Route. */
function eingabe(name0 = 'OpenRouter privat', familie = 'openrouter'): Record<string, unknown> {
  return {
    name: name0,
    familie,
    art: 'fern',
    schluessel: 'noetig',
    modelle: { gespraech: 'openai/gpt-oss-20b' },
  }
}

describe('Das Plugin', () => {
  test('trägt vier Adressen ein und stellt den Dienst bereit', () => {
    const fake = macheFake()
    apply(fake.ctx)
    expect(fake.routen.map((eintrag) => eintrag.path).sort()).toEqual(Object.values(ROUTEN).sort())
    expect(fake.routen.every((eintrag) => eintrag.kind === 'exact')).toBe(true)
    expect(fake.dienste.has('zugaenge')).toBe(true)
    const dienst = fake.dienste.get('zugaenge') as { anbieter?: unknown } | undefined
    expect(typeof dienst?.anbieter).toBe('function')
  })

  test('beim Abhängen verschwinden die Routen — und der Dienst, sonst stirbt das zweite Laden', () => {
    const fake = macheFake()
    apply(fake.ctx)
    fake.abmelden()
    expect(fake.routen).toHaveLength(0)
    expect(fake.dienste.has('zugaenge')).toBe(false)
  })

  test('der Plugin-Name ist stabil — er ist zugleich der Record-Scope', () => {
    expect(name).toBe('pmh-zugaenge')
  })

  test('der Geltungsbereich kommt aus PMH_BENUTZER', () => {
    expect(geltung({})).toEqual({ art: 'host', nutzer: null })
    process.env['PMH_BENUTZER'] = ' chang '
    expect(geltung({ PMH_BENUTZER: ' chang ' })).toEqual({ art: 'host', nutzer: 'chang' })
  })
})

describe('Die Sperre', () => {
  test('ohne Anmeldung antworten alle vier Routen 401', async () => {
    const fake = macheFake({ erlaubt: false })
    apply(fake.ctx)
    for (const eintrag of fake.routen) {
      const gelesen = await rufe(eintrag, 'GET')
      expect(gelesen.status).toBe(401)
      expect(JSON.parse(gelesen.koerper).fehler).toBe('nicht angemeldet')
    }
  })

  test('ohne Verbindungsdienst antworten alle vier Routen 503 — nicht 200', async () => {
    const fake = macheFake({ mitVerbindung: false })
    apply(fake.ctx)
    for (const eintrag of fake.routen) {
      const gelesen = await rufe(eintrag, 'GET')
      expect(gelesen.status).toBe(503)
      expect(JSON.parse(gelesen.koerper).fehler).toBe('kein Verbindungsdienst')
    }
  })

  test('die falsche Methode gibt 405 mit Allow', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const gelesen = await rufe(route(fake, ROUTEN.liste), 'POST', {})
    expect(gelesen.status).toBe(405)
    expect(JSON.parse(gelesen.koerper).erlaubt).toEqual(['GET'])
  })

  test('der CSRF-Kopf fehlt: 403', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const gelesen = await rufe(route(fake, ROUTEN.speichern), 'POST', { zugang: eingabe() })
    expect(gelesen.status).toBe(403)
    expect(JSON.parse(gelesen.koerper).fehler).toBe('csrf-fehlt')
  })

  test('CSRF-Kopf und Keks widersprechen sich: 403', () => {
    const req = anfrage('POST', {}, { 'x-pmh-csrf': 'a', cookie: 'pmh_csrf=b' })
    expect(csrfGrund(req)).toBeDefined()
    const passt = anfrage('POST', {}, { 'x-pmh-csrf': 'a', cookie: 'pmh_csrf=a' })
    expect(csrfGrund(passt)).toBeUndefined()
  })
})

describe('Die Liste', () => {
  test('leer, aber mit Familien und Datei', async () => {
    const fake = macheFake()
    apply(fake.ctx)
    const gelesen = await rufe(route(fake, ROUTEN.liste), 'GET')
    expect(gelesen.status).toBe(200)
    const koerper = JSON.parse(gelesen.koerper) as {
      datei: string
      familien: unknown[]
      zugaenge: unknown[]
    }
    expect(koerper.datei).toBe(pfad)
    expect(koerper.familien.length).toBeGreaterThan(0)
    expect(koerper.zugaenge).toEqual([])
  })
})

describe('Anlegen und Ändern', () => {
  test('legt an — der Stand ist „kein Schlüssel", nicht „bereit"', async () => {
    const { dienst } = macheCredentials()
    const fake = macheFake({ credentials: dienst })
    apply(fake.ctx)
    const gelesen = await rufe(route(fake, ROUTEN.speichern), 'POST', { zugang: eingabe() }, CSRF)
    expect(gelesen.status).toBe(200)
    const koerper = JSON.parse(gelesen.koerper) as {
      zugang: { id: string; stand: string; schluesselstand: { gesetzt: boolean } }
    }
    expect(koerper.zugang.id).toBe('openrouter-privat')
    expect(koerper.zugang.schluesselstand.gesetzt).toBe(false)
    expect(koerper.zugang.stand).toBe('kein-schluessel')
    expect(existsSync(pfad)).toBe(true)
  })

  test('legt den Schlüssel ab — und gibt ihn NICHT zurück', async () => {
    const { werte, dienst } = macheCredentials()
    const fake = macheFake({ credentials: dienst })
    apply(fake.ctx)
    const gelesen = await rufe(
      route(fake, ROUTEN.speichern),
      'POST',
      { zugang: eingabe(), wert: 'geheim-123' },
      CSRF,
    )
    expect(gelesen.status).toBe(200)
    expect(gelesen.koerper).not.toContain('geheim-123')
    expect([...werte.values()]).toEqual(['geheim-123'])

    const liste = await rufe(route(fake, ROUTEN.liste), 'GET')
    expect(liste.koerper).not.toContain('geheim-123')
    const koerper = JSON.parse(liste.koerper) as {
      zugaenge: { stand: string; schluesselstand: { gesetzt: boolean; schreibbar: boolean; quelle: string } }[]
    }
    expect(koerper.zugaenge[0]?.schluesselstand).toEqual({
      gesetzt: true,
      schreibbar: true,
      quelle: 'ablage',
    })
    expect(koerper.zugaenge[0]?.stand).toBe('bereit')
  })

  test('wer den Bedarf auf „kein" stellt, verliert den hinterlegten Schlüssel', async () => {
    const { werte, dienst } = macheCredentials()
    const fake = macheFake({ credentials: dienst })
    apply(fake.ctx)
    await rufe(route(fake, ROUTEN.speichern), 'POST', { zugang: eingabe(), wert: 'geheim' }, CSRF)
    expect(werte.size).toBe(1)

    const ohne = { ...eingabe(), id: 'openrouter-privat', schluessel: 'kein' }
    const gelesen = await rufe(route(fake, ROUTEN.speichern), 'POST', { zugang: ohne }, CSRF)
    expect(gelesen.status).toBe(200)
    expect(werte.size).toBe(0)
  })

  test('zwei gleiche Namen überschreiben sich nicht — die Kennung wird durchnumeriert', async () => {
    const { dienst } = macheCredentials()
    const fake = macheFake({ credentials: dienst })
    apply(fake.ctx)
    const erste = await rufe(route(fake, ROUTEN.speichern), 'POST', { zugang: eingabe() }, CSRF)
    const zweite = await rufe(route(fake, ROUTEN.speichern), 'POST', { zugang: eingabe() }, CSRF)
    expect((JSON.parse(erste.koerper) as { zugang: { id: string } }).zugang.id).toBe('openrouter-privat')
    expect((JSON.parse(zweite.koerper) as { zugang: { id: string } }).zugang.id).toBe('openrouter-privat-2')

    const liste = JSON.parse((await rufe(route(fake, ROUTEN.liste), 'GET')).koerper) as {
      zugaenge: unknown[]
    }
    expect(liste.zugaenge).toHaveLength(2)
  })

  test('eine Änderung behält Kennung und Anlagedatum', async () => {
    const { dienst } = macheCredentials()
    const fake = macheFake({ credentials: dienst })
    apply(fake.ctx)
    const erste = await rufe(route(fake, ROUTEN.speichern), 'POST', { zugang: eingabe() }, CSRF)
    const alt = (JSON.parse(erste.koerper) as { zugang: { id: string; angelegt: string } }).zugang
    await Bun.sleep(2)
    const neu = await rufe(
      route(fake, ROUTEN.speichern),
      'POST',
      { zugang: { ...eingabe('OpenRouter geschäftlich'), id: alt.id } },
      CSRF,
    )
    const jetzt = (JSON.parse(neu.koerper) as { zugang: { id: string; angelegt: string; geaendert: string } }).zugang
    expect(jetzt.id).toBe(alt.id)
    expect(jetzt.angelegt).toBe(alt.angelegt)
    expect(jetzt.geaendert >= alt.angelegt).toBe(true)
  })

  test('ein leerer Rumpf wird abgelehnt, nicht als „nichts" gespeichert', async () => {
    const { dienst } = macheCredentials()
    const fake = macheFake({ credentials: dienst })
    apply(fake.ctx)
    const gelesen = await rufe(route(fake, ROUTEN.speichern), 'POST', {}, CSRF)
    expect(gelesen.status).toBe(400)
    expect((JSON.parse(gelesen.koerper) as { fehler: string }).fehler).toBe('unbrauchbar')
  })

  test('freieKennung zählt hoch, statt zu überschreiben', () => {
    const eintrag = alsZugang(
      { name: 'x', familie: 'openrouter', art: 'fern', schluessel: 'noetig', modelle: { gespraech: 'm' } },
      new Date('2026-10-21T12:00:00.000Z'),
    )
    const datei = { fassung: FASSUNG, zugaenge: [eintrag] }
    expect(freieKennung(datei, 'x')).toBe('x-2')
    expect(freieKennung({ fassung: FASSUNG, zugaenge: [] }, 'y')).toBe('y')
  })
})

describe('Entfernen', () => {
  test('entfernt Eintrag und Schlüssel', async () => {
    const { werte, dienst } = macheCredentials()
    const fake = macheFake({ credentials: dienst })
    apply(fake.ctx)
    await rufe(route(fake, ROUTEN.speichern), 'POST', { zugang: eingabe(), wert: 'geheim' }, CSRF)
    expect(werte.size).toBe(1)

    const gelesen = await rufe(route(fake, ROUTEN.entfernen), 'POST', { id: 'openrouter-privat' }, CSRF)
    expect(gelesen.status).toBe(200)
    expect(werte.size).toBe(0)

    const liste = JSON.parse((await rufe(route(fake, ROUTEN.liste), 'GET')).koerper) as {
      zugaenge: unknown[]
    }
    expect(liste.zugaenge).toEqual([])
  })

  test('ein unbekannter Eintrag ist 404', async () => {
    const { dienst } = macheCredentials()
    const fake = macheFake({ credentials: dienst })
    apply(fake.ctx)
    const gelesen = await rufe(route(fake, ROUTEN.entfernen), 'POST', { id: 'gibt-es-nicht' }, CSRF)
    expect(gelesen.status).toBe(404)
  })
})

describe('Die Sonde', () => {
  let lokal: ReturnType<typeof Bun.serve> | undefined

  beforeAll(() => {
    lokal = Bun.serve({
      port: 0,
      fetch: (req) => {
        const weg = new URL(req.url).pathname
        if (req.method === 'GET') return Response.json({ data: [{ id: 'm-eins' }] })
        const status = weg.endsWith('/chat/completions') ? 400 : weg.endsWith('/images/generations') ? 404 : 405
        return new Response(null, { status })
      },
    })
  })

  afterAll(() => {
    lokal?.stop(true)
    lokal = undefined
  })

  test('prüft gegen einen lokalen Dienst — ohne Schlüssel, ohne Kosten', async () => {
    const { dienst } = macheCredentials()
    const fake = macheFake({ credentials: dienst })
    apply(fake.ctx)
    const port = lokal?.port ?? 0
    const zugang = {
      name: 'Lokal',
      familie: 'openai-kompatibel',
      art: 'lokal',
      schluessel: 'kein',
      basis: `http://127.0.0.1:${String(port)}`,
      modelle: { gespraech: 'm-eins' },
    }
    await rufe(route(fake, ROUTEN.speichern), 'POST', { zugang }, CSRF)

    const gelesen = await rufe(route(fake, ROUTEN.pruefen), 'POST', { id: 'lokal' }, CSRF)
    expect(gelesen.status).toBe(200)
    const befund = (JSON.parse(gelesen.koerper) as { befund: { wege: Record<string, string>; modellAnzahl: number } })
      .befund
    expect(befund.modellAnzahl).toBe(1)
    expect(befund.wege['gespraech']).toBe('vorhanden')
    expect(befund.wege['bild']).toBe('fehlt')
  })

  test('ein unbekannter Eintrag ist 404', async () => {
    const { dienst } = macheCredentials()
    const fake = macheFake({ credentials: dienst })
    apply(fake.ctx)
    const gelesen = await rufe(route(fake, ROUTEN.pruefen), 'POST', { id: 'gibt-es-nicht' }, CSRF)
    expect(gelesen.status).toBe(404)
  })
})
