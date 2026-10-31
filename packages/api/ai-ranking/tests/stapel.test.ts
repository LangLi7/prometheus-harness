/**
 * Der KI-Stapel: die Tabelle gegen die Wirklichkeit.
 *
 * Eine gepflegte Liste ist nur so gut wie die Prüfungen, die sie halten. Drei Dinge werden hier
 * festgenagelt: **jeder Ordner existiert**, **kein Eintrag behauptet eine Ladung, die nicht
 * stattfindet**, und **jedes Bündel deklariert seinen Marker**.
 */

import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  KI_STAPEL,
  STACK_PATH,
  macheStapelHandler,
  pluginPakete,
  stapelantwort,
  zaehleFormen,
} from '../src/index.ts'
import { KI_STAPEL as STAPEL } from '../src/stapel.ts'

/** Die Projektwurzel — vier Ebenen über dem Testordner. */
const WURZEL = join(import.meta.dir, '..', '..', '..', '..')

/**
 * Die Pakete, die in den Host eingetragen werden — aus **beiden** Quellen.
 *
 * (1) `scripts/profile-patch.mjs` schreibt seine Zeilen beim Start ins Profil.
 * (2) Ein **Bündel** trägt seine Zeilen über `cordis.patch.yml` ein — die schreibt der Start
 *     **nicht**. Am 18.10.2026 ist `ai-ranking` genau diesen Weg gegangen; die Profil-Zeile ist
 *     dafür entfallen. Wer nur (1) liest, behauptet danach, das Plugin sei nicht geladen.
 */
function eigenePakete(): readonly string[] {
  const gefunden = new Set<string>()
  const sammle = (text: string): void => {
    for (const treffer of text.matchAll(/'(?<paket>@prometheus-harness\/[a-z0-9-]+)'/gu)) {
      const paket = treffer.groups?.['paket']
      if (paket !== undefined) gefunden.add(paket)
    }
  }

  sammle(readFileSync(join(WURZEL, 'scripts', 'profile-patch.mjs'), 'utf8'))

  const buendel = join(WURZEL, 'packages', 'bundle')
  if (existsSync(buendel)) {
    for (const eintrag of readdirSync(buendel, { withFileTypes: true })) {
      if (!eintrag.isDirectory()) continue
      const patch = join(buendel, eintrag.name, 'cordis.patch.yml')
      if (existsSync(patch)) sammle(readFileSync(patch, 'utf8'))
    }
  }

  return [...gefunden].sort()
}

// ---------------------------------------------------------------------------
// Die Tabelle gegen die Platte
// ---------------------------------------------------------------------------

describe('Die Tabelle gegen die Platte', () => {
  test('jeder genannte Ordner EXISTIERT', () => {
    const fehlend = KI_STAPEL.filter((eintrag) => !existsSync(join(WURZEL, eintrag.pfad)))
    expect(fehlend.map((eintrag) => eintrag.pfad)).toEqual([])
  })

  test('jedes genannte Paket hat eine package.json mit dem passenden Namen', () => {
    for (const eintrag of KI_STAPEL) {
      const manifest = JSON.parse(readFileSync(join(WURZEL, eintrag.pfad, 'package.json'), 'utf8')) as {
        name?: string
      }
      expect(manifest.name).toBe(eintrag.paket)
    }
  })

  test('kein Eintrag behauptet eine Ladung, die nicht stattfindet', () => {
    // **Der wichtigste Fall dieser Datei.** `form: 'plugin'` heißt: der Host lädt das Paket. Steht
    // es nicht in `EIGENE_PAKETE`, ist das eine Behauptung ohne Deckung.
    const geladen = eigenePakete()
    for (const paket of pluginPakete()) expect(geladen).toContain(paket)
  })

  test('eine Bibliothek steht NICHT in der Ladungsliste', () => {
    const geladen = eigenePakete()
    const bibliotheken = KI_STAPEL.filter((eintrag) => eintrag.form === 'bibliothek').map((e) => e.paket)
    for (const paket of bibliotheken) expect(geladen).not.toContain(paket)
  })

  test('jedes Bündel deklariert dsh.bundle.patch — und die Datei gibt es', () => {
    const buendel = KI_STAPEL.filter((eintrag) => eintrag.form === 'buendel')
    expect(buendel.length).toBeGreaterThan(0)
    for (const eintrag of buendel) {
      const manifest = JSON.parse(readFileSync(join(WURZEL, eintrag.pfad, 'package.json'), 'utf8')) as {
        dsh?: { bundle?: { patch?: string } }
      }
      const patch = manifest.dsh?.bundle?.patch
      expect(patch).toBeDefined()
      expect(existsSync(join(WURZEL, eintrag.pfad, patch ?? ''))).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Die Zahlen
// ---------------------------------------------------------------------------

describe('Die Zahlen', () => {
  test('die Summe der Formen ist die Zahl der Einträge', () => {
    const zahlen = zaehleFormen()
    expect(zahlen.plugin + zahlen.bibliothek + zahlen.buendel).toBe(KI_STAPEL.length)
  })

  test('der Stapel hat alle drei Formen', () => {
    const zahlen = zaehleFormen()
    expect(zahlen.plugin).toBeGreaterThan(0)
    expect(zahlen.bibliothek).toBeGreaterThan(0)
    expect(zahlen.buendel).toBeGreaterThan(0)
  })

  test('die Mehrheit sind Bibliotheken — das ist die ehrliche Aussage', () => {
    // Wer eine Plugin-Liste erwartet und 13 Bibliotheken sieht, soll nicht denken, es fehle etwas.
    const zahlen = zaehleFormen()
    expect(zahlen.bibliothek).toBeGreaterThan(zahlen.plugin)
  })

  test('nur das Ranglisten-Paket nennt einen /api-Endpunkt', () => {
    const mitRoute = KI_STAPEL.filter((eintrag) => eintrag.route !== undefined)
    expect(mitRoute.map((eintrag) => eintrag.paket)).toEqual(['@prometheus-harness/ai-ranking'])
    expect(mitRoute[0]?.route).toContain('/api/ai/ranking')
    expect(mitRoute[0]?.route).toContain('/api/ai/stack')
  })

  test('die exportierte Liste ist dieselbe wie die interne', () => {
    expect(KI_STAPEL).toBe(STAPEL)
  })
})

// ---------------------------------------------------------------------------
// Die Fläche
// ---------------------------------------------------------------------------

interface Aufgezeichnet {
  statusCode: number
  headers: Record<string, string>
  body: string
}

function fakeRes(): { res: ServerResponse; ergebnis: () => Aufgezeichnet } {
  const zustand: Aufgezeichnet = { statusCode: 0, headers: {}, body: '' }
  const res = {
    set statusCode(wert: number) {
      zustand.statusCode = wert
    },
    get statusCode(): number {
      return zustand.statusCode
    },
    setHeader(kuerzel: string, wert: string): void {
      zustand.headers[kuerzel.toLowerCase()] = wert
    },
    end(koerper?: string | Buffer): void {
      zustand.body = koerper === undefined ? '' : koerper.toString()
    },
  }
  return { res: res as unknown as ServerResponse, ergebnis: () => zustand }
}

function fakeReq(method: string, url: string): IncomingMessage {
  return { method, url, headers: {} } as unknown as IncomingMessage
}

describe('Die Fläche', () => {
  test('der Pfad liegt unter /api', () => {
    expect(STACK_PATH).toBe('/api/ai/stack')
  })

  test('OHNE Anmeldung erreichbar — wie /api/health', () => {
    // **Die Entscheidung, die diesen Test ausmacht.** Eine Auskunft, die eine Anmeldung verlangt,
    // kann einem nicht sagen, was installiert ist, wenn die Anmeldung noch nicht steht (die erste
    // Sitzung ist ein Claim). Der Inhalt ist Paketnamen und je ein Satz — kein Preis, keine
    // Modellkennung, keine Zugangsdaten. Der Ranglisten-Endpunkt bleibt geschützt; dort steht das,
    // was nicht offen ist.
    const { res, ergebnis } = fakeRes()
    macheStapelHandler()(fakeReq('GET', STACK_PATH), res)
    expect(ergebnis().statusCode).toBe(200)
    expect(JSON.parse(ergebnis().body).status).toBe('ok')
  })

  test('die Auskunft braucht KEINEN Verbindungsdienst', () => {
    // Kein `ctx.get('connection')` — der Handler nimmt gar keinen Kontext. Damit antwortet er auch
    // auf einem Host ohne Anmeldeschicht, statt 503 zu melden.
    const { res, ergebnis } = fakeRes()
    macheStapelHandler()(fakeReq('GET', STACK_PATH), res)
    expect(ergebnis().statusCode).toBe(200)
  })

  test('POST ergibt 405 mit Allow — auch ohne Anmeldung', () => {
    const { res, ergebnis } = fakeRes()
    macheStapelHandler()(fakeReq('POST', STACK_PATH), res)
    expect(ergebnis().statusCode).toBe(405)
    expect(ergebnis().headers['allow']).toBe('GET, HEAD')
  })

  test('GET liefert die Einträge und die Formen', () => {
    const { res, ergebnis } = fakeRes()
    macheStapelHandler()(fakeReq('GET', STACK_PATH), res)
    expect(ergebnis().statusCode).toBe(200)
    const koerper = JSON.parse(ergebnis().body) as {
      status: string
      formen: Record<string, number>
      eintraege: { paket: string }[]
    }
    expect(koerper.status).toBe('ok')
    expect(koerper.eintraege.length).toBe(KI_STAPEL.length)
    expect(koerper.formen['bibliothek']).toBeGreaterThan(0)
  })

  test('die Auskunft ist nicht zwischengespeichert', () => {
    const { res, ergebnis } = fakeRes()
    macheStapelHandler()(fakeReq('GET', STACK_PATH), res)
    expect(ergebnis().headers['cache-control']).toBe('no-store')
    expect(Number(ergebnis().headers['content-length'])).toBe(Buffer.byteLength(ergebnis().body, 'utf8'))
  })

  test('HEAD sendet nur die Kopfdaten', () => {
    const { res, ergebnis } = fakeRes()
    macheStapelHandler()(fakeReq('HEAD', STACK_PATH), res)
    expect(ergebnis().statusCode).toBe(200)
    expect(ergebnis().body).toBe('')
  })

  test('stapelantwort() nennt die geladenen Pakete getrennt', () => {
    const antwort = stapelantwort()
    expect(antwort.geladen).toEqual(pluginPakete())
    expect(antwort.status).toBe('ok')
  })
})
