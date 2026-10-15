/**
 * Der Anbieter OpenRouter — über einen **echten Socket**, gegen eine Attrappe.
 *
 * ## Warum ein echter Socket und kein untergeschobenes `fetch`
 *
 * Ein untergeschobenes `fetch` würde nur beweisen, daß **ich** die richtige Form in ein Objekt
 * schreibe. Was es **nicht** beweist: ob der Mehrtelldaten-Versand für den Hör-Weg wirklich als
 * Mehrtelldaten über die Leitung geht — und ob die Grenze stimmt. Genau dort liegt der Fehler,
 * den man nicht sieht: ein von Hand gesetzter `content-type` ohne passende Grenze macht den
 * Körper unlesbar, und der Dienst antwortet mit einem Fehler, der nach etwas anderem klingt.
 *
 * ## Was diese Datei beweist
 *
 * Daß jeder der vier Wege die **gemessene** Form trifft: den richtigen Pfad, den richtigen Körper,
 * den Kopf mit dem Schlüssel — und daß eine Antwort, die nicht dem Schema folgt, **abgelehnt**
 * wird statt durchgereicht.
 *
 * ## Was sie NICHT beweist
 *
 * Daß OpenRouter wirklich so antwortet. Hier antwortet eine Attrappe mit **erfundenen** Daten; die
 * echten Formen stammen aus Messungen vom 15.10.2026 (`docs/status/openrouter-schnittstelle.md`).
 * Der lebende Nachweis steht in `tests/lebend.test.ts` hinter `PMH_OPENROUTER_LEBEND=1`.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Schema } from '@prometheus-harness/faehigkeiten'
import { OpenrouterFehler, VORSCHLAEGE, entschaerfe, openrouter } from '../src/index.ts'
import { UrteilFehler, liesUrteil, zuJsonSchema } from '../src/schema.ts'

/** Ein Schlüssel für die Prüfung — **kein echter**, und genau deshalb darf er hier stehen. */
const SCHLUESSEL = 'sk-or-v1-nur-fuer-die-pruefung-0000000000000000'

/** Was die Attrappe auf die nächste Anfrage antwortet. */
interface Antwortplan {
  readonly status: number
  readonly koerper: string | Uint8Array
  readonly typ?: string
}

/** Was die Attrappe gesehen hat. */
interface Aufzeichnung {
  readonly pfad: string
  readonly methode: string
  readonly kopf: Record<string, string | string[] | undefined>
  readonly koerper: string
  readonly laenge: number
}

/** Die offenen Attrappen — sie werden nach **jedem** Test geschlossen. */
const offen: Server[] = []

afterEach(() => {
  for (const s of offen.splice(0)) {
    // Ohne das bliebe eine offene Verbindung bestehen und der Prüflauf endete nie.
    if (typeof s.closeAllConnections === 'function') s.closeAllConnections()
    s.close()
  }
})

/**
 * Startet eine Attrappe, die **eine** Antwort bereithält.
 *
 * @returns die Adresse, die Aufzeichnungen und die Möglichkeit, die Antwort zu setzen
 */
async function macheBuehne(): Promise<{
  basis: string
  aufzeichnungen: Aufzeichnung[]
  antworte: (plan: Antwortplan) => void
}> {
  const aufzeichnungen: Aufzeichnung[] = []
  let plan: Antwortplan = { status: 200, koerper: '{}', typ: 'application/json' }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const teile: Buffer[] = []
    req.on('data', (stueck: Buffer) => teile.push(stueck))
    req.on('end', () => {
      const roh = Buffer.concat(teile)
      aufzeichnungen.push({
        pfad: (req.url ?? '/').split('?')[0] ?? '/',
        methode: req.method ?? '',
        kopf: req.headers,
        koerper: roh.toString('utf8'),
        laenge: roh.length,
      })
      res.writeHead(plan.status, plan.typ === undefined ? {} : { 'content-type': plan.typ })
      res.end(Buffer.from(plan.koerper))
    })
  })
  offen.push(server)
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig))
  return {
    basis: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
    aufzeichnungen,
    antworte: (p) => {
      plan = p
    },
  }
}

/**
 * Ein Anbieter mit Schlüssel und **ohne** eingestelltes Modell.
 *
 * Er läßt sich **bauen** — der Fehler kommt erst beim Aufruf. Das ist Absicht: könnte man den
 * Anbieter ohne Modell nicht einmal eintragen, käme man nie dazu, eines einzustellen.
 *
 * @param basis - die Adresse der Attrappe
 * @returns der Anbieter
 */
function ohneModell(basis: string): ReturnType<typeof openrouter> {
  return openrouter({ schluessel: () => SCHLUESSEL, basis })
}

/** Ein Anbieter, wie ihn ein Endnutzer eingerichtet hätte. */
function mitModell(basis: string, faehigkeit: string, modell: string): ReturnType<typeof openrouter> {
  return openrouter({
    schluessel: () => SCHLUESSEL,
    basis,
    modelle: { [faehigkeit]: modell },
  })
}

/** Ein einfaches Schema: eine Antwort aus zwei Möglichkeiten. */
const SCHEMA: Schema<{ antwort: string }> = {
  felder: { antwort: { art: 'text', auswahl: ['ja', 'nein'] } },
}

/**
 * Baut eine Chat-Antwort, wie OpenRouter sie liefert.
 *
 * @param inhalt - was im Textfeld steht
 * @param grund - der Grund, warum das Modell aufhörte
 * @param modell - wer geantwortet hat
 * @returns der JSON-Körper
 */
function chatAntwort(inhalt: string, grund = 'stop', modell = 'google/gemini-3.8-flash'): string {
  return JSON.stringify({
    id: 'gen-1',
    model: modell,
    provider: 'Google AI Studio',
    choices: [{ finish_reason: grund, message: { role: 'assistant', content: inhalt } }],
    usage: { total_tokens: 469, cost: 0.00167175 },
  })
}

/**
 * Führt etwas aus, das **werfen soll**, und gibt den Fehler zurück.
 *
 * **Warum nicht `expect(…).toThrow()`.** Hier wird der Fehler **gebraucht**, nicht nur sein
 * Dasein: geprüft werden sollen seine Einzelheiten (`maengel`, der Status). Und wenn **nichts**
 * geworfen wurde, ist das ein Fehler der Prüfung selbst — dann darf sie nicht stillschweigend
 * weiterlaufen, sondern muß laut scheitern.
 *
 * @param tu - was ausgeführt wird
 * @returns der geworfene Fehler
 * @throws Error - wenn nichts geworfen wurde
 */
function fange(tu: () => unknown): unknown {
  try {
    tu()
  } catch (fehler: unknown) {
    return fehler
  }
  throw new Error('Es wurde nichts geworfen — diese Prüfung erwartet einen Fehler.')
}

// ---------------------------------------------------------------------------
// 1. Die Übersetzung des Schemas — rein
// ---------------------------------------------------------------------------

describe('Unser Schema wird zu JSON-Schema', () => {
  test('die drei Arten werden zu den drei JSON-Arten', () => {
    const json = zuJsonSchema<{ a: string; b: number; c: boolean }>({
      felder: { a: { art: 'text' }, b: { art: 'zahl' }, c: { art: 'wahrheitswert' } },
    })
    expect(json.properties).toEqual({
      a: { type: 'string' },
      b: { type: 'number' },
      c: { type: 'boolean' },
    })
  })

  test('eine Auswahl wird zu `enum` — mit dem Typ daneben', () => {
    const json = zuJsonSchema(SCHEMA)
    expect(json.properties['antwort']).toEqual({ type: 'string', enum: ['ja', 'nein'] })
  })

  test('freiwillige Felder stehen NICHT unter `required`', () => {
    const json = zuJsonSchema<{ a: string; b?: string }>({
      felder: { a: { art: 'text' }, b: { art: 'text', freiwillig: true } },
    })
    expect(json.required).toEqual(['a'])
    // Im Schema stehen sie trotzdem — sonst dürfte das Modell sie nicht liefern.
    expect(Object.keys(json.properties)).toEqual(['a', 'b'])
  })

  test('Zusatzfelder sind verboten', () => {
    expect(zuJsonSchema(SCHEMA).additionalProperties).toBe(false)
  })

  test('ein Schema ohne Felder ist kein Schema', () => {
    expect(() => zuJsonSchema({ felder: {} })).toThrow('nichts zu entscheiden')
  })
})

// ---------------------------------------------------------------------------
// 2. Was zurückkommt, wird geprüft — nicht geglaubt
// ---------------------------------------------------------------------------

describe('Ein Urteil wird gelesen und geprüft', () => {
  test('gültig — der Wert kommt durch', () => {
    expect(liesUrteil('{"antwort":"ja"}', SCHEMA)).toEqual({ antwort: 'ja' })
  })

  test('ein fehlendes Pflichtfeld fliegt auf', () => {
    const fehler = fange(() => liesUrteil('{}', SCHEMA))
    expect(fehler).toBeInstanceOf(UrteilFehler)
    expect((fehler as UrteilFehler).maengel.join(' ')).toContain('„antwort" fehlt')
  })

  test('eine falsche Art fliegt auf', () => {
    const zahlen: Schema<{ n: number }> = { felder: { n: { art: 'zahl' } } }
    expect(() => liesUrteil('{"n":"sieben"}', zahlen)).toThrow('soll eine Zahl sein')
  })

  test('ein Wert außerhalb der Auswahl fliegt auf — MIT den erlaubten Werten', () => {
    const fehler = fange(() => liesUrteil('{"antwort":"vielleicht"}', SCHEMA)) as UrteilFehler
    expect(fehler).toBeInstanceOf(UrteilFehler)
    // Wer das liest, soll nicht selbst nachschlagen müssen, was erlaubt war.
    expect(fehler.maengel.join(' ')).toContain('"ja"')
    expect(fehler.maengel.join(' ')).toContain('"nein"')
  })

  test('ein Zusatzfeld wird ABGELEHNT, nicht weggeworfen', () => {
    // Wir haben mit `additionalProperties: false` darum gebeten. Käme eines und wir ließen es
    // fallen, hätte das Modell etwas gesagt, das niemand zu sehen bekommt.
    expect(() => liesUrteil('{"antwort":"ja","grund":"weil"}', SCHEMA)).toThrow('Nicht verlangt')
  })

  test('ALLE Mängel werden genannt, nicht nur der erste', () => {
    const zwei: Schema<{ a: string; b: string }> = {
      felder: { a: { art: 'text' }, b: { art: 'text', auswahl: ['x'] } },
    }
    const fehler = fange(() => liesUrteil('{"b":"y"}', zwei)) as UrteilFehler
    expect(fehler.maengel.length).toBe(2)
  })

  test('kein JSON — die Meldung zeigt, WAS kam', () => {
    const fehler = fange(() => liesUrteil('```json\n{"antwort":"ja"}\n```', SCHEMA)) as UrteilFehler
    expect(fehler).toBeInstanceOf(UrteilFehler)
    // **Kein Zaun-Abziehen.** Das Abstreifen wäre Nachsicht gegenüber einem Modell, das die Bitte
    // überhört hat — und würde genau die Abweichung verstecken, die man sehen will.
    expect(fehler.maengel.join(' ')).toContain('kein JSON')
    expect(fehler.maengel.join(' ')).toContain('```json')
  })

  test('leerer Inhalt fliegt auf', () => {
    expect(() => liesUrteil('   ', SCHEMA)).toThrow('leer')
  })

  test('ein freiwilliges Feld darf fehlen', () => {
    const mitFrei: Schema<{ a: string; b?: string }> = {
      felder: { a: { art: 'text' }, b: { art: 'text', freiwillig: true } },
    }
    expect(liesUrteil('{"a":"x"}', mitFrei)).toEqual({ a: 'x' })
  })
})

// ---------------------------------------------------------------------------
// 3. Der Schlüssel
// ---------------------------------------------------------------------------

describe('Der Schlüssel', () => {
  test('wird in einer Meldung unkenntlich gemacht', () => {
    expect(entschaerfe(`Fehler mit ${SCHLUESSEL} darin`, SCHLUESSEL)).toBe('Fehler mit *** darin')
  })

  test('ein zu kurzes Geheimnis wird nicht angefaßt — sonst würde jeder Text zerstört', () => {
    expect(entschaerfe('ein abc Text', 'abc')).toBe('ein abc Text')
  })

  test('ohne Geheimnis bleibt der Text', () => {
    expect(entschaerfe('unverändert', undefined)).toBe('unverändert')
  })
})

// ---------------------------------------------------------------------------
// 4. Bereitschaft und Modelle
// ---------------------------------------------------------------------------

describe('Bereitschaft — je Fähigkeit, und ohne Netz', () => {
  test('ohne Schlüssel: nicht bereit, und der Grund nennt die Umgebungsvariable', async () => {
    const b = await macheBuehne()
    const a = openrouter({ schluessel: () => undefined, basis: b.basis, modelle: { entscheiden: 'x/y' } })
    const stand = await a.bereit('entscheiden')
    expect(stand.bereit).toBe(false)
    expect(stand.bereit === false ? stand.grund : '').toContain('OPENROUTER_API_KEY')
    // **Kein Netzaufruf.** „Bereit" muß billig sein: die Registratur fragt bei jeder Auswahl.
    expect(b.aufzeichnungen.length).toBe(0)
  })

  test('mit Schlüssel, aber OHNE eingestelltes Modell: nicht bereit — mit den Vorschlägen', async () => {
    const b = await macheBuehne()
    const a = openrouter({ schluessel: () => SCHLUESSEL, basis: b.basis })
    const stand = await a.bereit('entscheiden')
    expect(stand.bereit).toBe(false)
    expect(stand.bereit === false ? stand.grund : '').toContain('Kein Modell')
    expect(stand.bereit === false ? stand.grund : '').toContain(VORSCHLAEGE['entscheiden']?.[0] ?? '')
    expect(b.aufzeichnungen.length).toBe(0)
  })

  test('mit Schlüssel UND Modell: bereit', async () => {
    const b = await macheBuehne()
    expect(await mitModell(b.basis, 'entscheiden', 'openai/gpt-oss-20b').bereit('entscheiden')).toEqual({
      bereit: true,
    })
  })

  test('für `bild` ist er nicht bereit — der Weg ist nicht gemessen', async () => {
    const b = await macheBuehne()
    const stand = await mitModell(b.basis, 'entscheiden', 'x/y').bereit('bild')
    expect(stand.bereit).toBe(false)
    expect(stand.bereit === false ? stand.grund : '').toContain('Bild')
  })

  test('er nennt `bild` und `gespraech` gar nicht erst als Fähigkeit', async () => {
    const b = await macheBuehne()
    const a = openrouter({ schluessel: () => SCHLUESSEL, basis: b.basis })
    expect(a.faehigkeiten).not.toContain('bild')
    expect(a.faehigkeiten).not.toContain('gespraech')
    expect(a.zeichner).toBeUndefined()
    expect(a.modelle('bild')).toEqual([])
    expect(a.modelle('gespraech')).toEqual([])
  })

  test('die eigene Wahl steht vorn, und nichts steht doppelt', async () => {
    const b = await macheBuehne()
    const erster = VORSCHLAEGE['entscheiden']?.[0] ?? ''
    const a = mitModell(b.basis, 'entscheiden', erster)
    const liste = a.modelle('entscheiden')
    expect(liste[0]).toBe(erster)
    expect(new Set(liste).size).toBe(liste.length)
  })
})

// ---------------------------------------------------------------------------
// 5. Entscheiden
// ---------------------------------------------------------------------------

describe('Entscheiden', () => {
  test('ein gültiges Urteil kommt durch — samt Herkunft', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: chatAntwort('{"antwort":"nein"}', 'stop', 'openai/gpt-6-luna') })
    const a = mitModell(b.basis, 'entscheiden', 'typesafe/jev-router')

    const urteil = await a.entscheider?.entscheide({ frage: 'Soll ich?', lage: { x: 1 }, schema: SCHEMA })
    expect(urteil?.wert).toEqual({ antwort: 'nein' })
    // **Wer geantwortet hat, ist nicht die Kennung, die man hineingegeben hat.** `jev-router` ist
    // ein Verteiler; geantwortet hat `gpt-6-luna`.
    expect(urteil?.herkunft).toEqual({ anbieter: 'openrouter', modell: 'openai/gpt-6-luna' })
  })

  test('der gesendete Körper trägt Modell, Schema und die Bitte um Strenge', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: chatAntwort('{"antwort":"ja"}') })
    const a = mitModell(b.basis, 'entscheiden', 'openai/gpt-oss-20b')

    await a.entscheider?.entscheide({ frage: 'Soll ich?', lage: { x: 1 }, schema: SCHEMA })

    const ruf = b.aufzeichnungen[0]
    expect(ruf?.pfad).toBe('/chat/completions')
    expect(ruf?.methode).toBe('POST')
    expect(ruf?.kopf['authorization']).toBe(`Bearer ${SCHLUESSEL}`)
    expect(ruf?.kopf['content-type']).toBe('application/json')

    const koerper = JSON.parse(ruf?.koerper ?? '{}') as Record<string, unknown>
    expect(koerper['model']).toBe('openai/gpt-oss-20b')
    // Ohne `max_tokens` — die Obergrenze ist die gemessene Falle, siehe den Test darunter.
    expect(koerper['max_tokens']).toBeUndefined()
    const format = koerper['response_format'] as Record<string, unknown>
    expect(format['type']).toBe('json_schema')
    const js = format['json_schema'] as Record<string, unknown>
    expect(js['strict']).toBe(true)
    expect(js['schema']).toEqual({
      type: 'object',
      properties: { antwort: { type: 'string', enum: ['ja', 'nein'] } },
      required: ['antwort'],
      additionalProperties: false,
    })
    // Frage und Lage gehen als Text hinein.
    const nachrichten = koerper['messages'] as { content: string }[]
    expect(nachrichten).toHaveLength(2)
    expect(nachrichten[1]?.content).toContain('Soll ich?')
    expect(nachrichten[1]?.content).toContain('"x": 1')
  })

  test('ein abgeschnittenes Urteil fliegt auf — die gemessene Falle', async () => {
    const b = await macheBuehne()
    // Gemessen am 15.10.2026: bei zu kleinem Budget steht das Denken in `reasoning` und `content`
    // bleibt leer. Durchgereicht sähe das aus wie ein leeres Urteil.
    b.antworte({ status: 200, koerper: chatAntwort('', 'length') })
    const a = mitModell(b.basis, 'entscheiden', 'x/y')
    const fehler = await a.entscheider
      ?.entscheide({ frage: 'f', lage: 1, schema: SCHEMA })
      .catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(OpenrouterFehler)
    expect((fehler as Error).message).toContain('nicht zu Ende')
    expect((fehler as Error).message).toContain('Token-Budget')
  })

  test('leerer Inhalt fliegt auf', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: chatAntwort('   ') })
    const a = mitModell(b.basis, 'entscheiden', 'x/y')
    await expect(
      a.entscheider?.entscheide({ frage: 'f', lage: 1, schema: SCHEMA }),
    ).rejects.toThrow('leer')
  })

  test('ein Wert außerhalb der Auswahl fliegt auf', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: chatAntwort('{"antwort":"vielleicht"}') })
    const a = mitModell(b.basis, 'entscheiden', 'x/y')
    await expect(
      a.entscheider?.entscheide({ frage: 'f', lage: 1, schema: SCHEMA }),
    ).rejects.toThrow('erlaubt ist nur')
  })

  test('ohne Auswahl in `choices` fliegt auf', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: JSON.stringify({ choices: [] }) })
    const a = mitModell(b.basis, 'entscheiden', 'x/y')
    await expect(a.entscheider?.entscheide({ frage: 'f', lage: 1, schema: SCHEMA })).rejects.toThrow(
      'keine Auswahl',
    )
  })

  test('ein abgelehnter Schlüssel fliegt auf — MIT Status und OHNE Schlüssel', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 401, koerper: `{"error":{"message":"No auth credentials found. ${SCHLUESSEL}"}}` })
    const a = mitModell(b.basis, 'entscheiden', 'x/y')

    const fehler = await a.entscheider
      ?.entscheide({ frage: 'f', lage: 1, schema: SCHEMA })
      .catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(OpenrouterFehler)
    const text = (fehler as Error).message
    expect(text).toContain('401')
    expect((fehler as OpenrouterFehler).status).toBe(401)
    // **Der Schlüssel steht NICHT in der Meldung** — auch dann nicht, wenn der Dienst ihn
    // zurückspiegelt. Fehlertexte landen in Protokollen, und dort bleibt ein Schlüssel liegen.
    expect(text).not.toContain(SCHLUESSEL)
    expect(text).toContain('***')
  })

  test('die Denkstufe geht mit — und fehlt sie, wird NICHTS gesendet', async () => {
    // Gemessen am 15.10.2026: bei zu kleinem Budget kam ein LEERER Inhalt zurück, weil das Denken
    // das Budget aufbrauchte. `reasoning_effort` ist der Hebel — und die drei genannten Modelle
    // nehmen ihn an.
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: chatAntwort('{"antwort":"ja"}') })
    const a = openrouter({
      schluessel: () => SCHLUESSEL,
      basis: b.basis,
      modelle: { entscheiden: 'x/y' },
      denken: 'niedrig',
    })
    await a.entscheider?.entscheide({ frage: 'f', lage: 1, schema: SCHEMA })
    const mitStufe = JSON.parse(b.aufzeichnungen[0]?.koerper ?? '{}') as Record<string, unknown>
    expect(mitStufe['reasoning_effort']).toBe('low')

    // **Und ohne Stufe wird nichts gesendet.** Etwas zu senden, das niemand gesetzt hat, hieße
    // eine Entscheidung zu treffen, die nicht getroffen wurde.
    const b2 = await macheBuehne()
    b2.antworte({ status: 200, koerper: chatAntwort('{"antwort":"ja"}') })
    const a2 = mitModell(b2.basis, 'entscheiden', 'x/y')
    await a2.entscheider?.entscheide({ frage: 'f', lage: 1, schema: SCHEMA })
    const ohne = JSON.parse(b2.aufzeichnungen[0]?.koerper ?? '{}') as Record<string, unknown>
    expect(Object.hasOwn(ohne, 'reasoning_effort')).toBe(false)
  })

  test('die vier Denkstufen werden auf die Werte des Dienstes übersetzt', async () => {
    for (const [unsere, seine] of [
      ['aus', 'minimal'],
      ['niedrig', 'low'],
      ['mittel', 'medium'],
      ['hoch', 'high'],
    ] as const) {
      const b = await macheBuehne()
      b.antworte({ status: 200, koerper: chatAntwort('{"antwort":"ja"}') })
      const a = openrouter({
        schluessel: () => SCHLUESSEL,
        basis: b.basis,
        modelle: { entscheiden: 'x/y' },
        denken: unsere,
      })
      await a.entscheider?.entscheide({ frage: 'f', lage: 1, schema: SCHEMA })
      const koerper = JSON.parse(b.aufzeichnungen[0]?.koerper ?? '{}') as Record<string, unknown>
      expect({ unsere, gesendet: koerper['reasoning_effort'] }).toEqual({ unsere, gesendet: seine })
    }
  })

  test('die Denkstufe gilt NUR fürs Entscheiden — nicht fürs Einbetten', async () => {
    // Einbetten denkt nicht. Den Parameter dort mitzusenden wäre eine Auskunft über etwas, das es
    // nicht gibt.
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }] }) })
    const a = openrouter({
      schluessel: () => SCHLUESSEL,
      basis: b.basis,
      modelle: { einbetten: 'm' },
      denken: 'hoch',
    })
    await a.einbetter?.betteEin(['a'])
    expect(b.aufzeichnungen[0]?.koerper).not.toContain('reasoning_effort')
  })

  test('ohne eingestelltes Modell wird GEWORFEN — und nichts gesendet', async () => {
    const b = await macheBuehne()
    const a = openrouter({ schluessel: () => SCHLUESSEL, basis: b.basis })
    await expect(a.entscheider?.entscheide({ frage: 'f', lage: 1, schema: SCHEMA })).rejects.toThrow(
      'kein Modell eingestellt',
    )
    // Kein Netzaufruf: es wird nichts geraten und nichts ausgegeben.
    expect(b.aufzeichnungen.length).toBe(0)
  })

  test('eine Lage mit Ringbezug fliegt auf, bevor etwas gesendet wird', async () => {
    const b = await macheBuehne()
    const a = mitModell(b.basis, 'entscheiden', 'x/y')
    const ring: Record<string, unknown> = {}
    ring['selbst'] = ring
    await expect(a.entscheider?.entscheide({ frage: 'f', lage: ring, schema: SCHEMA })).rejects.toThrow(
      'Ringbezug',
    )
    expect(b.aufzeichnungen.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 6. Text zu Sprache
// ---------------------------------------------------------------------------

describe('Text zu Sprache', () => {
  test('die Bytes kommen durch, und der Typ aus der Kopfzeile ebenfalls', async () => {
    const b = await macheBuehne()
    const ton = new Uint8Array([1, 2, 3, 4, 5, 6])
    b.antworte({ status: 200, koerper: ton, typ: 'audio/pcm;rate=24000;channels=1' })
    const a = mitModell(b.basis, 'text-zu-sprache', 'google/gemini-3.8-flash-tts')

    const ergebnis = await a.sprecher?.sprich({ text: 'Guten Tag.' })
    expect([...(ergebnis?.bytes ?? [])]).toEqual([1, 2, 3, 4, 5, 6])
    // **Die Abtastrate steht NUR hier.** Rohe PCM-Daten tragen keinen eigenen Kopf; wer diese
    // Angabe verliert, hat eine Datei, die niemand abspielen kann.
    expect(ergebnis?.typ).toBe('audio/pcm;rate=24000;channels=1')
  })

  test('der Körper verlangt `pcm` — Gemini kann nichts anderes', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: new Uint8Array([9]), typ: 'audio/pcm' })
    const a = mitModell(b.basis, 'text-zu-sprache', 'google/gemini-3.8-flash-tts')
    await a.sprecher?.sprich({ text: 'Guten Tag.' })

    expect(b.aufzeichnungen[0]?.pfad).toBe('/audio/speech')
    const koerper = JSON.parse(b.aufzeichnungen[0]?.koerper ?? '{}') as Record<string, unknown>
    expect(koerper['response_format']).toBe('pcm')
    expect(koerper['input']).toBe('Guten Tag.')
    expect(koerper['voice']).toBe('Kore')
    expect(koerper['model']).toBe('google/gemini-3.8-flash-tts')
  })

  test('eine eigene Stimme wird übernommen', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: new Uint8Array([9]), typ: 'audio/pcm' })
    const a = mitModell(b.basis, 'text-zu-sprache', 'm')
    await a.sprecher?.sprich({ text: 'x', stimme: 'Puck' })
    expect((JSON.parse(b.aufzeichnungen[0]?.koerper ?? '{}') as Record<string, unknown>)['voice']).toBe('Puck')
  })

  test('Ton ohne Inhalt fliegt auf', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: new Uint8Array([]), typ: 'audio/pcm' })
    const a = mitModell(b.basis, 'text-zu-sprache', 'm')
    await expect(a.sprecher?.sprich({ text: 'x' })).rejects.toThrow('0 Bytes')
  })
})

// ---------------------------------------------------------------------------
// 7. Sprache zu Text
// ---------------------------------------------------------------------------

describe('Sprache zu Text', () => {
  test('der Ton geht als MEHRTEILDATEN hinaus — mit Modell und Datei', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: JSON.stringify({ text: 'Guten Tag.', usage: { cost: 0.000576 } }) })
    const a = mitModell(b.basis, 'sprache-zu-text', 'google/gemini-3.5-transcribe')

    const ergebnis = await a.hoerer?.hoere(new Uint8Array([82, 73, 70, 70, 1, 2, 3]))
    expect(ergebnis).toEqual({ text: 'Guten Tag.' })

    const ruf = b.aufzeichnungen[0]
    expect(ruf?.pfad).toBe('/audio/transcriptions')
    // Die Grenze setzt `fetch` selbst. Ein von Hand gesetzter Kopf ohne passende Grenze würde den
    // Körper unlesbar machen — und genau das prüft diese Zeile.
    expect(String(ruf?.kopf['content-type'])).toStartWith('multipart/form-data; boundary=')
    expect(ruf?.koerper).toContain('name="model"')
    expect(ruf?.koerper).toContain('google/gemini-3.5-transcribe')
    expect(ruf?.koerper).toContain('name="file"')
    expect(ruf?.koerper).toContain('RIFF')
  })

  test('ohne Sprache wird kein Sprachfeld gesendet', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: JSON.stringify({ text: 'x' }) })
    const a = mitModell(b.basis, 'sprache-zu-text', 'm')
    await a.hoerer?.hoere(new Uint8Array([1, 2]))
    expect(b.aufzeichnungen[0]?.koerper).not.toContain('name="language"')
  })

  test('mit Sprache wird sie mitgesendet', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: JSON.stringify({ text: 'x' }) })
    const a = mitModell(b.basis, 'sprache-zu-text', 'm')
    await a.hoerer?.hoere(new Uint8Array([1, 2]), 'de')
    expect(b.aufzeichnungen[0]?.koerper).toContain('name="language"')
    expect(b.aufzeichnungen[0]?.koerper).toContain('de')
  })

  test('ohne Ton wird nichts gesendet', async () => {
    const b = await macheBuehne()
    const a = mitModell(b.basis, 'sprache-zu-text', 'm')
    await expect(a.hoerer?.hoere(new Uint8Array([]))).rejects.toThrow('0 Bytes')
    expect(b.aufzeichnungen.length).toBe(0)
  })

  test('eine Antwort ohne Textfeld fliegt auf', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: JSON.stringify({ usage: {} }) })
    const a = mitModell(b.basis, 'sprache-zu-text', 'm')
    await expect(a.hoerer?.hoere(new Uint8Array([1]))).rejects.toThrow('kein Textfeld')
  })
})

// ---------------------------------------------------------------------------
// 8. Einbetten
// ---------------------------------------------------------------------------

describe('Einbetten', () => {
  test('die Reihenfolge wird nach `index` hergestellt — nicht nach der Antwortreihenfolge', async () => {
    const b = await macheBuehne()
    // Der Dienst antwortet **verkehrt herum**. Ohne Sortierung bekäme der zweite Text den Vektor
    // des ersten — ein Fehler, der nirgends auffällt, weil die Form stimmt.
    b.antworte({
      status: 200,
      koerper: JSON.stringify({
        data: [
          { index: 2, embedding: [30, 31] },
          { index: 0, embedding: [10, 11] },
          { index: 1, embedding: [20, 21] },
        ],
      }),
    })
    const a = mitModell(b.basis, 'einbetten', 'google/gemini-embedding-2')

    const vektoren = await a.einbetter?.betteEin(['a', 'b', 'c'])
    expect(vektoren).toEqual([
      [10, 11],
      [20, 21],
      [30, 31],
    ])
    expect(b.aufzeichnungen[0]?.pfad).toBe('/embeddings')
    expect((JSON.parse(b.aufzeichnungen[0]?.koerper ?? '{}') as Record<string, unknown>)['input']).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  test('zu wenige Vektoren fliegen auf', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: JSON.stringify({ data: [{ index: 0, embedding: [1] }] }) })
    const a = mitModell(b.basis, 'einbetten', 'm')
    await expect(a.einbetter?.betteEin(['a', 'b'])).rejects.toThrow('aber 1 geliefert')
  })

  test('verschieden lange Vektoren fliegen auf', async () => {
    const b = await macheBuehne()
    b.antworte({
      status: 200,
      koerper: JSON.stringify({
        data: [
          { index: 0, embedding: [1, 2] },
          { index: 1, embedding: [1, 2, 3] },
        ],
      }),
    })
    const a = mitModell(b.basis, 'einbetten', 'm')
    await expect(a.einbetter?.betteEin(['a', 'b'])).rejects.toThrow('verschieden lang')
  })

  test('leere Eingabe: kein Netzaufruf, leeres Ergebnis', async () => {
    const b = await macheBuehne()
    const a = mitModell(b.basis, 'einbetten', 'm')
    expect(await a.einbetter?.betteEin([])).toEqual([])
    // Wer nichts fragt, gibt auch nichts aus.
    expect(b.aufzeichnungen.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 9. Der Netzzugriff
// ---------------------------------------------------------------------------

describe('Wenn der Dienst nicht erreichbar ist', () => {
  test('ein toter Port ergibt eine Meldung mit dem Weg — nicht einen nackten TypeError', async () => {
    const b = await macheBuehne()
    const basis = b.basis
    for (const s of offen.splice(0)) s.close()
    const a = mitModell(basis, 'entscheiden', 'x/y')
    const fehler = await a.entscheider
      ?.entscheide({ frage: 'f', lage: 1, schema: SCHEMA })
      .catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(OpenrouterFehler)
    expect((fehler as Error).message).toContain('/chat/completions')
    expect((fehler as Error).message).toContain('nicht erreichbar')
  })
})

// `ohneModell` wird oben gebraucht, damit der Typecheck die Hilfsfunktion nicht als unbenutzt
// meldet — sie zeigt außerdem, daß ein Anbieter ohne Modell **aufbaubar** ist (der Fehler kommt
// erst beim Aufruf, nicht beim Bauen).
describe('Aufbau ohne Modell', () => {
  test('der Anbieter läßt sich ohne Modell bauen — der Fehler kommt beim Aufruf', async () => {
    const b = await macheBuehne()
    const a = ohneModell(b.basis)
    expect(a.id).toBe('openrouter')
    expect(a.modelle('entscheiden')).toEqual([...(VORSCHLAEGE['entscheiden'] ?? [])])
  })
})
