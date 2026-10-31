/**
 * Die Schnittstelle: Anmelden, Abmelden, Rechnen und die Fläche.
 *
 * Drei Eigenschaften werden hier festgenagelt: **eine doppelte Anmeldung wirft** (statt die Liste
 * still zu verdoppeln), **die Sperre kommt vor der Methode** (ein Fremder erfährt nicht, welche
 * Methoden die Adresse kennt), und **eine leere Antwort ist erklärbar** — die Quellenzahlen stehen
 * dabei.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Anbieter, Faehigkeit } from '@prometheus-harness/capabilities'
import { FAMILIEN, type Familie } from '@prometheus-harness/provider-directory'
import type { Katalog, Katalogeintrag } from '@prometheus-harness/directory-curator'
import { SAAT, type Tarifeintrag } from '@prometheus-harness/tariffs'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

import {
  DIENST,
  RANKING_PATH,
  SERVICE_NAME,
  SERVICE_VERSION,
  apply,
  macheRangHandler,
  meldeStandardquellen,
  name as pluginName,
  rangantwort,
  erzeugeRegister,
  type Rangregister,
} from '../src/index.ts'

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

function familie(id: string, faehigkeiten: readonly Faehigkeit[], name = id): Familie {
  const wege: Familie['wege'] = {}
  for (const faehigkeit of faehigkeiten) {
    wege[faehigkeit] = { pfad: `/x/${faehigkeit}`, art: 'json', gemessenAm: '2026-10-15' }
  }
  return {
    id,
    name,
    basis: `https://${id}.invalid/v1`,
    kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
    modellWeg: '/models',
    wege,
    stand: 'Test',
  }
}

function anbieter(id: string, faehigkeiten: readonly Faehigkeit[]): Anbieter {
  return {
    id,
    name: id,
    faehigkeiten,
    schluessel: 'schluessel-noetig',
    modelle: () => [],
    bereit: async () => ({ bereit: true }),
  }
}

function katalogEintrag(id: string, wege: Record<string, string>): Katalogeintrag {
  return {
    familie: id,
    geprueftAm: '2026-10-15T00:00:00.000Z',
    modelleErreichbar: true,
    modelle: [],
    wege: wege as Katalogeintrag['wege'],
    bemerkung: 'Test',
  }
}

function katalog(eintraege: readonly Katalogeintrag[]): Katalog {
  const nach: Record<string, Katalogeintrag> = {}
  for (const eintrag of eintraege) nach[eintrag.familie] = eintrag
  return { fassung: 1, eintraege: nach }
}

function tarif(familieId: string, modell: string, hinein: number, heraus: number): Tarifeintrag {
  return {
    familie: familieId,
    modell,
    preis: { hinein, heraus },
    stand: '2026-10-01',
    quelle: 'Tabelle',
    herkunft: 'tabelle',
  }
}

// ---------------------------------------------------------------------------
// Fälschungen für die Fläche
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

/** Ein Kontext, dessen Verbindungsdienst eine feste Entscheidung trifft. */
function fakeCtx(erlaubt: number | undefined, vorhanden = true): Context {
  return {
    get: (name: string) =>
      name === 'connection' && vorhanden
        ? { requestRejection: () => erlaubt }
        : undefined,
  } as unknown as Context
}

// ---------------------------------------------------------------------------
// Das Register
// ---------------------------------------------------------------------------

describe('Das Register', () => {
  test('leer heißt leer — und die Quellenzahlen sagen es', () => {
    const register = erzeugeRegister()
    const quellen = register.quellen()
    expect(quellen.familien).toEqual([])
    expect(quellen.anbieter).toEqual([])
    expect(quellen.katalog).toBeUndefined()
    expect(register.liste().listen.every((liste) => liste.eintraege.length === 0)).toBe(true)
  })

  test('angemeldet ergibt eine Empfehlung', () => {
    const register = erzeugeRegister()
    register.meldeFamilie(familie('a', ['entscheiden']))
    register.meldeAnbieter(anbieter('a', ['entscheiden']))
    register.meldeKatalog(katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]))
    register.meldeTarife([tarif('a', 'm', 0, 0)])

    const liste = register.liste({ faehigkeiten: ['entscheiden'] }).listen[0]
    expect(liste?.empfehlung?.familie).toBe('a')
    expect(liste?.empfehlung?.kostenart).toBe('kostenlos')
  })

  test('zweimal dieselbe Familie anmelden wirft', () => {
    const register = erzeugeRegister()
    register.meldeFamilie(familie('a', ['entscheiden']))
    expect(() => register.meldeFamilie(familie('a', ['entscheiden']))).toThrow('bereits angemeldet')
  })

  test('zweimal denselben Anbieter anmelden wirft', () => {
    const register = erzeugeRegister()
    register.meldeAnbieter(anbieter('a', ['entscheiden']))
    expect(() => register.meldeAnbieter(anbieter('a', ['entscheiden']))).toThrow('bereits angemeldet')
  })

  test('der Rücknehmer nimmt genau seine Anmeldung zurück', () => {
    const register = erzeugeRegister()
    const ab = register.meldeFamilie(familie('a', ['entscheiden']))
    register.meldeFamilie(familie('b', ['entscheiden']))
    expect(register.quellen().familien.map((f) => f.id)).toEqual(['a', 'b'])

    ab()
    expect(register.quellen().familien.map((f) => f.id)).toEqual(['b'])
  })

  test('ein Katalog ersetzt den früheren — und der Rücknehmer stellt ihn her', () => {
    const register = erzeugeRegister()
    const erster = katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })])
    const zweiter = katalog([katalogEintrag('a', { entscheiden: 'fehlt' })])
    register.meldeKatalog(erster)

    const ab = register.meldeKatalog(zweiter)
    expect(register.quellen().katalog?.eintraege['a']?.wege['entscheiden']).toBe('fehlt')

    ab()
    expect(register.quellen().katalog?.eintraege['a']?.wege['entscheiden']).toBe('vorhanden')
  })

  test('Modelllisten werden je Familie gesetzt und wieder entfernt', () => {
    const register = erzeugeRegister()
    register.meldeFamilie(familie('a', ['entscheiden']))
    const ab = register.meldeModelle('a', [{ kennung: 'm', preis: { hinein: 0, heraus: 0 } }])
    expect(register.quellen().modelle['a']?.length).toBe(1)

    ab()
    expect(register.quellen().modelle['a']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Die Antwort
// ---------------------------------------------------------------------------

describe('Die Antwort', () => {
  test('nennt die Quellenzahlen, damit ein leeres Ergebnis erklärbar ist', () => {
    const register = erzeugeRegister()
    const leer = rangantwort(register)
    expect(leer.quellen).toEqual({
      familien: 0,
      anbieter: 0,
      tarife: 0,
      hatKatalog: false,
      familienMitModellen: 0,
    })

    register.meldeFamilie(familie('a', ['entscheiden']))
    register.meldeKatalog(katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]))
    const voll = rangantwort(register)
    expect(voll.quellen.familien).toBe(1)
    expect(voll.quellen.hatKatalog).toBe(true)
    // Die beiden Fälle sind unterscheidbar — und das ist der Zweck der Zahlen.
    expect(JSON.stringify(leer.quellen)).not.toBe(JSON.stringify(voll.quellen))
  })

  test('die Zählung stimmt mit der Liste überein', () => {
    const register = erzeugeRegister()
    register.meldeFamilie(familie('a', ['entscheiden']))
    register.meldeAnbieter(anbieter('a', ['entscheiden']))
    register.meldeKatalog(katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]))
    register.meldeTarife([tarif('a', 'm', 0, 0)])

    const antwort = rangantwort(register, { faehigkeiten: ['entscheiden'] })
    expect(antwort.zahlen.eintraege).toBe(1)
    expect(antwort.zahlen.verdrahtet).toBe(1)
    expect(antwort.zahlen.gemessen).toBe(1)
    expect(antwort.zahlen.kostenlos).toBe(1)
    expect(antwort.status).toBe('ok')
  })
})

// ---------------------------------------------------------------------------
// Die Fläche
// ---------------------------------------------------------------------------

describe('Die Fläche', () => {
  const register = erzeugeRegister()
  register.meldeFamilie(familie('a', ['entscheiden'], 'Alpha'))
  register.meldeAnbieter(anbieter('a', ['entscheiden']))
  register.meldeKatalog(katalog([katalogEintrag('a', { entscheiden: 'vorhanden' })]))
  register.meldeTarife([tarif('a', 'm', 0, 0)])

  test('ohne Anmeldung wird verweigert — und zwar mit 401', () => {
    const { res, ergebnis } = fakeRes()
    macheRangHandler(fakeCtx(401), register)(fakeReq('GET', RANKING_PATH), res)
    expect(ergebnis().statusCode).toBe(401)
    expect(JSON.parse(ergebnis().body).error).toBe('unauthenticated')
  })

  test('ohne Verbindungsdienst wird verweigert — 503, nicht 200', () => {
    const { res, ergebnis } = fakeRes()
    macheRangHandler(fakeCtx(undefined, false), register)(fakeReq('GET', RANKING_PATH), res)
    expect(ergebnis().statusCode).toBe(503)
  })

  test('die Sperre kommt VOR der Methode — ein Fremder erfährt nichts', () => {
    const { res, ergebnis } = fakeRes()
    macheRangHandler(fakeCtx(401), register)(fakeReq('POST', RANKING_PATH), res)
    // 401, nicht 405: sonst wäre jede Antwort eine Auskunft über die erlaubten Methoden.
    expect(ergebnis().statusCode).toBe(401)
    expect(ergebnis().headers['allow']).toBeUndefined()
  })

  test('eine fremde Methode ergibt 405 mit Allow', () => {
    const { res, ergebnis } = fakeRes()
    macheRangHandler(fakeCtx(undefined), register)(fakeReq('POST', RANKING_PATH), res)
    expect(ergebnis().statusCode).toBe(405)
    expect(ergebnis().headers['allow']).toBe('GET, HEAD')
  })

  test('GET liefert JSON mit Liste und Zahlen', () => {
    const { res, ergebnis } = fakeRes()
    macheRangHandler(fakeCtx(undefined), register)(fakeReq('GET', RANKING_PATH), res)
    expect(ergebnis().statusCode).toBe(200)
    expect(ergebnis().headers['content-type']).toContain('application/json')
    // Eine zwischengespeicherte Preisliste wäre eine falsche Preisliste.
    expect(ergebnis().headers['cache-control']).toBe('no-store')

    const koerper = JSON.parse(ergebnis().body)
    expect(koerper.service).toBe(SERVICE_NAME)
    // **Nicht `listen[0]`.** Die erste Liste ist `gespraech` — für sie ist nichts angemeldet.
    // Der Test muß die Fähigkeit nennen, für die er etwas erwartet.
    const entscheiden = koerper.rangliste.listen.find(
      (liste: { faehigkeit: string }) => liste.faehigkeit === 'entscheiden',
    )
    expect(entscheiden.empfehlung.familie).toBe('a')
  })

  test('die Länge steht im Kopf — der Kern verdichtet sonst', () => {
    const { res, ergebnis } = fakeRes()
    macheRangHandler(fakeCtx(undefined), register)(fakeReq('GET', RANKING_PATH), res)
    expect(Number(ergebnis().headers['content-length'])).toBe(Buffer.byteLength(ergebnis().body, 'utf8'))
  })

  test('?text=1 liefert die lesbare Form', () => {
    const { res, ergebnis } = fakeRes()
    macheRangHandler(fakeCtx(undefined), register)(fakeReq('GET', `${RANKING_PATH}?text=1`), res)
    expect(ergebnis().headers['content-type']).toContain('text/plain')
    expect(ergebnis().body).toContain('Bevorzugt: Alpha')
  })

  test('?faehigkeit=… schränkt ein', () => {
    const { res, ergebnis } = fakeRes()
    macheRangHandler(fakeCtx(undefined), register)(fakeReq('GET', `${RANKING_PATH}?faehigkeit=bild`), res)
    expect(ergebnis().statusCode).toBe(200)
    const koerper = JSON.parse(ergebnis().body)
    expect(koerper.rangliste.listen.length).toBe(1)
    expect(koerper.rangliste.listen[0].faehigkeit).toBe('bild')
  })

  test('HEAD sendet nur die Kopfdaten', () => {
    const { res, ergebnis } = fakeRes()
    macheRangHandler(fakeCtx(undefined), register)(fakeReq('HEAD', RANKING_PATH), res)
    expect(ergebnis().statusCode).toBe(200)
    expect(ergebnis().body).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Das Einhängen — die Quellen melden sich wirklich an
// ---------------------------------------------------------------------------

/** Ein Host, der nur mitschreibt: Dienst, Effekt und eine Route. */
function fakeHost(): { ctx: Context; dienst: () => Rangregister; routen: WebRoute[]; abmelden: () => void } {
  let dienst: unknown
  const routen: WebRoute[] = []
  const abnehmer: (() => void)[] = []
  const ctx = {
    provide: (name: string, wert: unknown): void => {
      if (name === DIENST) dienst = wert
    },
    effect: (koerper: () => (() => void) | void): void => {
      const ab = koerper()
      if (typeof ab === 'function') abnehmer.push(ab)
    },
    // **Ein Verbindungsdienst, der durchläßt.** Ohne ihn antwortet der Handler **503** — richtig
    // so, aber dann prüfte dieser Test die Verweigerung statt der Liste.
    get: (name: string) =>
      name === 'connection' ? { requestRejection: () => undefined } : undefined,
    webServer: {
      register: (route: WebRoute): (() => void) => {
        routen.push(route)
        return () => {
          const at = routen.indexOf(route)
          if (at >= 0) routen.splice(at, 1)
        }
      },
    },
  } as unknown as Context
  return {
    ctx,
    dienst: () => dienst as Rangregister,
    routen,
    abmelden: () => {
      for (const ab of [...abnehmer].reverse()) ab()
    },
  }
}

describe('Das Einhängen', () => {
  test('apply meldet Verzeichnis und Saat an — der Endpunkt ist NICHT leer', () => {
    const host = fakeHost()
    apply(host.ctx)

    const register = host.dienst()
    const quellen = register.quellen()
    // **Die Zahl kommt aus dem Verzeichnis, nicht aus dem Kopf.** TypeSafe kam am
    // 31.10.2026 als achte Familie dazu; eine feste 7 wäre beim nächsten Zuwachs
    // wieder falsch.
    expect(quellen.familien.length).toBe(FAMILIEN.length)
    expect(quellen.tarife.length).toBe(SAAT.length)
    // **Kein Katalog** — er kommt aus einem Verwalterlauf und wird gereicht, nicht erfunden.
    expect(quellen.katalog).toBeUndefined()
    // **Zwei Routen, nicht eine.** Seit dem 18.10.2026 hängt dasselbe Plugin zwei Endpunkte ein:
    // die Rangliste und die Auskunft über den Stapel. Beide teilen Anmeldung und Abschaltung.
    expect(host.routen.length).toBe(2)
    expect(host.routen[0]?.path).toBe(RANKING_PATH)
    expect(host.routen[1]?.path).toBe('/api/ai/stack')
  })

  test('die Liste trägt danach den GEMESSENEN Preis für Text zu Sprache', () => {
    // Die ganze Kette in einem Test: Verzeichnis + Saat → Rangfolge → Antwort.
    const host = fakeHost()
    apply(host.ctx)

    const { res, ergebnis } = fakeRes()
    const route = host.routen[0]
    expect(route).toBeDefined()
    route?.handler(fakeReq('GET', RANKING_PATH), res)

    const koerper = JSON.parse(ergebnis().body)
    expect(koerper.zahlen.eintraege).toBeGreaterThan(0)

    const tts = koerper.rangliste.listen.find(
      (liste: { faehigkeit: string }) => liste.faehigkeit === 'text-zu-sprache',
    )
    const mitPreis = tts.eintraege.find(
      (eintrag: { modell?: string }) => eintrag.modell === 'google/gemini-3.8-flash-tts',
    )
    expect(mitPreis).toBeDefined()
    expect(mitPreis.preis).toEqual({ hinein: 0.5, heraus: 9 })
    expect(mitPreis.kostenart).toBe('kostenpflichtig')
  })

  test('die Antwort nennt den Quellenbericht — damit eine Leere erklärbar ist', () => {
    const host = fakeHost()
    apply(host.ctx)

    const { res, ergebnis } = fakeRes()
    host.routen[0]?.handler(fakeReq('GET', RANKING_PATH), res)
    const koerper = JSON.parse(ergebnis().body)
    expect(koerper.quellenbericht.length).toBeGreaterThan(0)
    expect(koerper.quellenbericht.join(' ')).toContain(`${FAMILIEN.length} Familien`)
    expect(koerper.quellenbericht.join(' ')).toContain('KEIN Katalog')
  })

  test('abmelden nimmt Route UND Quellen zurück', () => {
    const host = fakeHost()
    apply(host.ctx)
    expect(host.routen.length).toBe(2)

    host.abmelden()
    expect(host.routen.length).toBe(0)
    expect(host.dienst().quellen().familien).toEqual([])
  })

  test('meldeStandardquellen läßt sich einschränken', () => {
    const register = erzeugeRegister()
    meldeStandardquellen(register, { tarife: [] })
    expect(register.quellen().familien.length).toBe(FAMILIEN.length)
    expect(register.quellen().tarife).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Die Zusagen des Pakets
// ---------------------------------------------------------------------------

describe('Zusagen', () => {
  test('die Fassung im Code stimmt mit package.json überein', () => {
    const datei = join(import.meta.dir, '..', 'package.json')
    const paket = JSON.parse(readFileSync(datei, 'utf8')) as { version: string }
    expect(SERVICE_VERSION).toBe(paket.version)
  })

  test('der Dienstname ist der des Hauses', () => {
    expect(DIENST).toBe('aiRanking')
    expect(pluginName).toBe('pmh-ai-ranking')
  })

  test('ein unbekannter Fähigkeitsname ist 400, nicht die volle Liste', () => {
    const eigenes = erzeugeRegister()
    eigenes.meldeFamilie(familie('a', ['entscheiden']))
    const { res, ergebnis } = fakeRes()
    macheRangHandler(fakeCtx(undefined), eigenes)(fakeReq('GET', `${RANKING_PATH}?faehigkeit=quatsch`), res)
    expect(ergebnis().statusCode).toBe(400)
    const koerper = JSON.parse(ergebnis().body)
    expect(koerper.error).toBe('unknown_capability')
    expect(koerper.unbekannt).toBe('quatsch')
    expect(koerper.erlaubt).toContain('text-zu-sprache')
  })

  test('der Pfad liegt unter /api', () => {
    expect(RANKING_PATH.startsWith('/api/')).toBe(true)
  })
})
