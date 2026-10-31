/**
 * Die Flächen — ohne Host, ohne Netz, aber mit echtem `IncomingMessage` und `ServerResponse`.
 *
 * ## Warum die Attrappe ein echter Anbieter ist und kein Mock des Handlers
 *
 * Geprüft werden soll, was der Handler **tut**: Status wählen, Bytes schreiben, Fehler
 * durchreichen. Ein untergeschobener Handler würde nur beweisen, daß der Test seinen eigenen
 * Wunsch erfüllt. Der Anbieter hier ist echt — nur seine Fähigkeiten sind Attrappen.
 *
 * @module @prometheus-harness/ai-capabilities/tests/flaechen
 */

import { describe, expect, test } from 'bun:test'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { baueAuf } from '@prometheus-harness/composition'
import { VORGABE, mitWahl } from '@prometheus-harness/settings'
import type { Anbieter, Faehigkeit } from '@prometheus-harness/capabilities'

import {
  alsWav,
  auskunft,
  liesTonformat,
  macheAuskunftHandler,
  macheBildHandler,
  macheEinbettHandler,
  macheEntscheidHandler,
  macheHoerHandler,
  macheSprachHandler,
  type Flaechenkontext,
} from '../src/flaechen.ts'
import type { Kette } from '../src/kette.ts'

/** Ein winziges JPEG — die ersten drei Bytes sind der Behälter. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02])

/** Ein Anbieter, dessen fünf Fähigkeiten Attrappen sind. */
function anbieterMit(faehigkeiten: readonly Faehigkeit[], zeichne?: () => Promise<{ bytes: Uint8Array; typ: string }>): Anbieter {
  return {
    id: 'attrappe',
    name: 'Attrappe',
    faehigkeiten,
    schluessel: 'kein-schluessel',
    modelle: () => ['m'],
    bereit: async () => ({ bereit: true }),
    ...(faehigkeiten.includes('entscheiden')
      ? {
          entscheider: {
            entscheide: async <T,>() => ({ wert: { antwort: 'ja' } as T, sicherheit: 0.95 }),
          },
        }
      : {}),
    ...(faehigkeiten.includes('text-zu-sprache')
      ? { sprecher: { sprich: async () => ({ bytes: new Uint8Array([1, 2, 3, 4]), typ: 'audio/pcm;rate=24000;channels=1' }) } }
      : {}),
    ...(faehigkeiten.includes('sprache-zu-text')
      ? { hoerer: { hoere: async () => ({ text: 'Guten Tag.' }) } }
      : {}),
    ...(faehigkeiten.includes('einbetten')
      ? { einbetter: { betteEin: async (texte: readonly string[]) => texte.map((_, i) => [i, i + 1, i + 2]) } }
      : {}),
    ...(faehigkeiten.includes('bild')
      ? { zeichner: { zeichne: zeichne ?? (async () => ({ bytes: JPEG, typ: 'image/jpeg' })) } }
      : {}),
  }
}

/** Baut eine Kette um einen Anbieter — mit einer Wahl für jede Fähigkeit. */
function ketteMit(anbieter: Anbieter): Kette {
  let einstellungen = VORGABE
  for (const faehigkeit of anbieter.faehigkeiten) {
    if (faehigkeit === 'gespraech') continue
    einstellungen = mitWahl(einstellungen, faehigkeit, { anbieter: anbieter.id, modell: 'm' })
  }
  return {
    aufbau: baueAuf({ einstellungen, anbieter: [anbieter] }),
    einstellungen,
    anbieter,
    weitere: [],
    pfad: '/tmp/einstellungen.json',
    hatSchluessel: async () => true,
    hatSchluesselTypesafe: async () => false,
  }
}

/** Ein Kontext mit erlaubter (oder verweigerter) Anfrage. */
function kontext(kette: Kette, verweigerung?: number): Flaechenkontext {
  return { kette: async () => kette, abweisung: () => verweigerung }
}

interface Antwort {
  status: number
  kopf: Record<string, string>
  koerper: Buffer
}

/** Eine Antwort, die man nach dem `await` lesen kann. */
function fakeRes(): { res: ServerResponse; lies: () => Antwort } {
  const zustand: Antwort = { status: 0, kopf: {}, koerper: Buffer.alloc(0) }
  const res = {
    set statusCode(wert: number) {
      zustand.status = wert
    },
    get statusCode(): number {
      return zustand.status
    },
    setHeader(name: string, wert: string): void {
      zustand.kopf[name.toLowerCase()] = wert
    },
    end(koerper?: string | Buffer): void {
      zustand.koerper = koerper === undefined ? Buffer.alloc(0) : Buffer.from(koerper)
    },
  }
  return { res: res as unknown as ServerResponse, lies: () => zustand }
}

/** Eine Anfrage mit Körper — ein echter `Readable`, damit `for await` greift. */
function fakeReq(methode: string, koerper?: unknown, kopf: Record<string, string> = {}): IncomingMessage {
  const text = koerper === undefined ? '' : JSON.stringify(koerper)
  const strom = Readable.from(text === '' ? [] : [Buffer.from(text)])
  return Object.assign(strom, {
    method: methode,
    url: '/api/ai/x',
    headers: { 'content-length': String(Buffer.byteLength(text)), ...kopf },
  }) as unknown as IncomingMessage
}

const ALLE: readonly Faehigkeit[] = ['entscheiden', 'text-zu-sprache', 'sprache-zu-text', 'einbetten', 'bild']

describe('Die Auskunft', () => {
  test('jede Fähigkeit bekommt eine Zeile — auch die, die der Kern führt', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const a = await auskunft(kette)
    expect(a.schluessel).toBe(true)
    expect(a.eingetragen).toEqual(['attrappe'])
    expect(a.faehigkeiten).toHaveLength(6)
    const bild = a.faehigkeiten.find((z) => z.faehigkeit === 'bild')
    expect(bild?.bereit).toBe(true)
    expect(bild?.modell).toBe('m')
    const gespraech = a.faehigkeiten.find((z) => z.faehigkeit === 'gespraech')
    expect(gespraech?.bereit).toBe(false)
    expect(gespraech?.grund).toContain('Kern')
  })

  test('ohne Wahl ist keine Zeile bereit — mit Grund', async () => {
    const kette = ketteMit(anbieterMit([]))
    const a = await auskunft(kette)
    expect(a.faehigkeiten.every((z) => !z.bereit)).toBe(true)
    // `FAEHIGKEITEN[0]` ist `gespraech` — die führt der Kern. Der Grund, der hier zählt, steht bei
    // einer Fähigkeit, die dieses Plugin wirklich bedienen könnte.
    expect(a.faehigkeiten.find((z) => z.faehigkeit === 'bild')?.grund).toContain('keine Wahl')
  })

  test('der Schlüssel wird NICHT ausgegeben — nur ob es einen gibt', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const a = await auskunft(kette)
    expect(JSON.stringify(a)).not.toContain('sk-')
    expect(typeof a.schluessel).toBe('boolean')
  })

  test('der GET-Handler antwortet 200 mit JSON', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    await macheAuskunftHandler(kontext(kette))(fakeReq('GET'), res)
    expect(lies().status).toBe(200)
    expect(lies().kopf['content-type']).toContain('application/json')
    const antwort = JSON.parse(lies().koerper.toString('utf8')) as { service: string; faehigkeiten: unknown[] }
    expect(antwort.service).toBe('@prometheus-harness/ai-capabilities')
    expect(antwort.faehigkeiten).toHaveLength(6)
  })
})

describe('Die Sperre', () => {
  test('ohne Anmeldung: 401 — und der Handler arbeitet nicht', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    await macheBildHandler(kontext(kette, 401))(fakeReq('POST', { beschreibung: 'x' }), res)
    expect(lies().status).toBe(401)
  })

  test('die falsche Methode: 405 mit Allow', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    await macheBildHandler(kontext(kette))(fakeReq('GET'), res)
    expect(lies().status).toBe(405)
    expect(lies().kopf['allow']).toBe('POST')
  })
})

describe('Bild', () => {
  test('die Bytes kommen mit dem Typ aus den Bytes', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    await macheBildHandler(kontext(kette))(fakeReq('POST', { beschreibung: 'ein Avatar' }), res)
    expect(lies().status).toBe(200)
    expect(lies().kopf['content-type']).toBe('image/jpeg')
    expect(Buffer.from(lies().koerper).equals(Buffer.from(JPEG))).toBe(true)
  })

  test('mit `json: true` kommt Base64 statt Bytes', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    await macheBildHandler(kontext(kette))(fakeReq('POST', { beschreibung: 'x', json: true }), res)
    expect(lies().status).toBe(200)
    const antwort = JSON.parse(lies().koerper.toString('utf8')) as { base64: string; typ: string }
    expect(antwort.typ).toBe('image/jpeg')
    expect(Buffer.from(antwort.base64, 'base64').equals(Buffer.from(JPEG))).toBe(true)
  })

  test('ohne Beschreibung: 400', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    await macheBildHandler(kontext(kette))(fakeReq('POST', { beschreibung: '   ' }), res)
    expect(lies().status).toBe(400)
  })
})

describe('Ton', () => {
  test('aus PCM wird eine WAV-Datei', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    await macheSprachHandler(kontext(kette))(fakeReq('POST', { text: 'Guten Tag.' }), res)
    expect(lies().status).toBe(200)
    expect(lies().kopf['content-type']).toBe('audio/wav')
    expect(lies().koerper.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(lies().koerper.subarray(8, 12).toString('ascii')).toBe('WAVE')
  })

  test('der WAV-Kopf trägt Rate, Kanäle und Länge', () => {
    const wav = alsWav(new Uint8Array([1, 2, 3, 4]), 24_000, 1)
    expect(wav.byteLength).toBe(48)
    const kopf = Buffer.from(wav)
    expect(kopf.readUInt32LE(4)).toBe(36 + 4)
    expect(kopf.readUInt16LE(22)).toBe(1)
    expect(kopf.readUInt32LE(24)).toBe(24_000)
    expect(kopf.readUInt32LE(40)).toBe(4)
  })

  test('`liesTonformat` liest den gemessenen Typ', () => {
    expect(liesTonformat('audio/pcm;rate=24000;channels=1')).toEqual({ rate: 24_000, kanaele: 1 })
    expect(liesTonformat('audio/pcm')).toEqual({ rate: 24_000, kanaele: 1 })
  })

  test('Text zu Text: die Transkription kommt als JSON', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    await macheHoerHandler(kontext(kette))(
      fakeReq('POST', { audioBase64: Buffer.from('ton').toString('base64') }),
      res,
    )
    expect(lies().status).toBe(200)
    expect(JSON.parse(lies().koerper.toString('utf8'))).toEqual({ status: 'ok', text: 'Guten Tag.' })
  })
})

describe('Entscheiden und Einbetten', () => {
  test('ein Urteil kommt mit Sicherheit', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    await macheEntscheidHandler(kontext(kette))(
      fakeReq('POST', { frage: 'Soll ich?', lage: { x: 1 }, schema: { felder: { antwort: { art: 'text' } } } }),
      res,
    )
    expect(lies().status).toBe(200)
    const antwort = JSON.parse(lies().koerper.toString('utf8')) as { urteil: { wert: unknown } }
    expect(antwort.urteil.wert).toEqual({ antwort: 'ja' })
  })

  test('Vektoren kommen mit ihrer Länge', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    await macheEinbettHandler(kontext(kette))(fakeReq('POST', { texte: ['a', 'b'] }), res)
    expect(lies().status).toBe(200)
    const antwort = JSON.parse(lies().koerper.toString('utf8')) as { vektoren: number[][]; dimensionen: number }
    expect(antwort.vektoren).toHaveLength(2)
    expect(antwort.dimensionen).toBe(3)
  })
})

describe('Der Körper', () => {
  test('kein JSON: 400', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    const req = Object.assign(Readable.from([Buffer.from('{ kaputt')]), {
      method: 'POST',
      url: '/x',
      headers: {},
    }) as unknown as IncomingMessage
    await macheBildHandler(kontext(kette))(req, res)
    expect(lies().status).toBe(400)
  })

  test('zu groß: 413 — schon an `content-length`, vor dem Lesen', async () => {
    const kette = ketteMit(anbieterMit(ALLE))
    const { res, lies } = fakeRes()
    await macheBildHandler(kontext(kette))(
      fakeReq('POST', { beschreibung: 'x' }, { 'content-length': String(10 * 1024 * 1024) }),
      res,
    )
    expect(lies().status).toBe(413)
  })
})
