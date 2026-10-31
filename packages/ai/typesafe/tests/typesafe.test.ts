/**
 * Der Anbieter TypeSafe — über einen **echten Socket**, gegen eine Attrappe.
 *
 * ## Warum ein echter Socket
 *
 * Ein untergeschobenes `fetch` würde nur beweisen, daß **ich** die richtige Form in ein Objekt
 * schreibe. Was es nicht beweist: daß der Körper als JSON über die Leitung geht, daß der Kopf
 * den Schlüssel trägt und der Pfad stimmt. Genau dort liegt der Fehler, den man nicht sieht.
 *
 * ## Was diese Datei beweist
 *
 * Daß ein Schema-Feld die **richtige Frage** ergibt, daß mehrere Felder in **einem** Aufruf
 * gehen, daß `confidence` zur Sicherheit wird, daß `noul` über den Abstand zur Mitte eine
 * Sicherheit bekommt — und daß ein Feld, das Jev nicht kann, **vor** dem Aufruf abgelehnt wird.
 *
 * ## Was sie NICHT beweist
 *
 * Daß TypeSafe wirklich so antwortet. Hier antwortet eine Attrappe mit erfundenen Daten; die
 * Formen stammen aus `docs.typesafe.ai/api/system-one` (gelesen 28.10.2026). Ein lebender
 * Nachweis gehört hinter eine Umgebungsvariable, nicht in den gewöhnlichen Prüflauf.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Schema } from '@prometheus-harness/capabilities'
import { TypesafeFehler, UMWELT_MODELL, typesafe, uebersetze } from '../src/index.ts'

/** Ein Schlüssel für die Prüfung — **kein echter**, und genau deshalb darf er hier stehen. */
const SCHLUESSEL = 'ts-nur-fuer-die-pruefung-0000000000000000'

/** Ein festes Modell, damit die Umgebungsvariable den Lauf nicht beeinflußt. */
const MODELL = 'jev-1.14.0'

/** Was die Attrappe auf die nächste Anfrage antwortet. */
interface Antwortplan {
  readonly status: number
  readonly koerper: string
}

/** Was die Attrappe gesehen hat. */
interface Aufzeichnung {
  readonly pfad: string
  readonly methode: string
  readonly kopf: Record<string, string | string[] | undefined>
  readonly koerper: string
}

/** Die offenen Attrappen — sie werden nach **jedem** Test geschlossen. */
const offen: Server[] = []

/** Der frühere Wert der Modellvariable — wird nach jedem Test zurückgesetzt. */
let modellVorher: string | undefined

beforeEach(() => {
  modellVorher = process.env[UMWELT_MODELL]
  // **Weg damit.** Sonst hinge der Lauf an der Maschine, auf der er stattfindet.
  delete process.env[UMWELT_MODELL]
})

afterEach(() => {
  if (modellVorher === undefined) delete process.env[UMWELT_MODELL]
  else process.env[UMWELT_MODELL] = modellVorher
  for (const s of offen.splice(0)) {
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
  let plan: Antwortplan = { status: 200, koerper: '{}' }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const teile: Buffer[] = []
    req.on('data', (stueck: Buffer) => teile.push(stueck))
    req.on('end', () => {
      aufzeichnungen.push({
        pfad: (req.url ?? '/').split('?')[0] ?? '/',
        methode: req.method ?? '',
        kopf: req.headers,
        koerper: Buffer.concat(teile).toString('utf8'),
      })
      res.writeHead(plan.status, { 'content-type': 'application/json' })
      res.end(plan.koerper)
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
 * Ein eingerichteter Anbieter gegen die Attrappe.
 *
 * @param basis - die Adresse der Attrappe
 * @param mehr - zusätzliche Optionen
 * @returns der Anbieter
 */
function anbieter(
  basis: string,
  mehr: { readonly langKontext?: boolean } = {},
): ReturnType<typeof typesafe> {
  return typesafe({
    schluessel: () => SCHLUESSEL,
    basis,
    modell: MODELL,
    ...(mehr.langKontext === true ? { langKontext: true } : {}),
  })
}

/** Ein Schema mit einem Wahrheitswert. */
const WAHRHEIT: Schema<{ geheimnis: boolean }> = {
  felder: { geheimnis: { art: 'wahrheitswert', beschreibung: 'Enthält der Text ein Geheimnis?' } },
}

/** Ein Schema mit einer Auswahl. */
const AUSWAHL: Schema<{ abteilung: string }> = {
  felder: {
    abteilung: {
      art: 'text',
      auswahl: ['rechnung', 'technik', 'konto'],
      beschreibung: 'Welche Abteilung bearbeitet die Anfrage?',
    },
  },
}

/** Baut eine Noul-Antwort. */
function noulAntwort(p: number, modell = MODELL): string {
  return JSON.stringify({
    model: modell,
    answers: { geheimnis: { type: 'noul', noul: p } },
    usage: { input_tokens: 120, output_tokens: 4 },
  })
}

/** Baut eine Choice-Antwort. */
function choiceAntwort(wahl: string, confidence: number, modell = MODELL): string {
  return JSON.stringify({
    model: modell,
    answers: { abteilung: { type: 'choice', choice: wahl, confidence, probabilities: { [wahl]: confidence } } },
    usage: { input_tokens: 120, output_tokens: 6 },
  })
}

describe('die Form des Aufrufs', () => {
  test('geht an /v1/systemone und trägt den Schlüssel im Kopf', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: noulAntwort(0.9) })

    await anbieter(b.basis).entscheider?.entscheide({
      frage: 'Enthält `text` ein Geheimnis?',
      lage: 'Der Schlüssel lautet sk-123.',
      schema: WAHRHEIT,
    })

    const auf = b.aufzeichnungen[0]
    expect(auf?.pfad).toBe('/v1/systemone')
    expect(auf?.methode).toBe('POST')
    expect(auf?.kopf['authorization']).toBe(`Bearer ${SCHLUESSEL}`)
  })

  test('schickt Modell, Lage und Fragen — die Lage unverändert', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: noulAntwort(0.9) })

    await anbieter(b.basis).entscheider?.entscheide({
      frage: 'Enthält `text` ein Geheimnis?',
      lage: { text: 'Der Schlüssel lautet sk-123.', quelle: 'ticket' },
      schema: WAHRHEIT,
    })

    const koerper = JSON.parse(b.aufzeichnungen[0]?.koerper ?? '{}') as Record<string, unknown>
    expect(koerper['model']).toBe(MODELL)
    expect(koerper['state']).toEqual({ text: 'Der Schlüssel lautet sk-123.', quelle: 'ticket' })
    const fragen = koerper['questions'] as Record<string, Record<string, unknown>>
    expect(fragen['geheimnis']?.['type']).toBe('noul')
  })

  test('setzt den Lang-Kontext-Kopf nur, wenn er verlangt ist', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: noulAntwort(0.9) })

    await anbieter(b.basis, { langKontext: true }).entscheider?.entscheide({
      frage: 'Enthält `text` ein Geheimnis?',
      lage: 'egal',
      schema: WAHRHEIT,
    })

    expect(b.aufzeichnungen[0]?.kopf['typesafe-danger-zone-long-context']).toBe('true')
  })

  test('macht aus mehreren Feldern EINEN Aufruf', async () => {
    const b = await macheBuehne()
    b.antworte({
      status: 200,
      koerper: JSON.stringify({
        model: MODELL,
        answers: {
          geheimnis: { type: 'noul', noul: 0.1 },
          abteilung: { type: 'choice', choice: 'technik', confidence: 0.8, probabilities: { technik: 0.8 } },
        },
        usage: { input_tokens: 200, output_tokens: 8 },
      }),
    })

    const schema: Schema<{ geheimnis: boolean; abteilung: string }> = {
      felder: { ...WAHRHEIT.felder, ...AUSWAHL.felder },
    }
    const urteil = await anbieter(b.basis).entscheider?.entscheide({
      frage: 'Ordne die Anfrage ein.',
      lage: 'Bitte prüft den Zugang.',
      schema,
    })

    expect(b.aufzeichnungen).toHaveLength(1)
    const koerper = JSON.parse(b.aufzeichnungen[0]?.koerper ?? '{}') as Record<string, unknown>
    expect(Object.keys(koerper['questions'] as object).sort()).toEqual(['abteilung', 'geheimnis'])
    expect(urteil?.wert).toEqual({ geheimnis: false, abteilung: 'technik' })
  })
})

describe('die Sicherheit', () => {
  test('kommt bei einer Choice aus der confidence des Modells', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: choiceAntwort('technik', 0.82) })

    const urteil = await anbieter(b.basis).entscheider?.entscheide({
      frage: 'Welche Abteilung?',
      lage: 'Der Drucker geht nicht.',
      schema: AUSWAHL,
    })

    expect(urteil?.wert).toEqual({ abteilung: 'technik' })
    expect(urteil?.sicherheit).toBe(0.82)
  })

  test('kommt bei einem Noul aus dem Abstand zur Mitte', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: noulAntwort(0.98) })

    const urteil = await anbieter(b.basis).entscheider?.entscheide({
      frage: 'Enthält `text` ein Geheimnis?',
      lage: 'egal',
      schema: WAHRHEIT,
    })

    expect(urteil?.wert).toEqual({ geheimnis: true })
    // |2 · 0,98 − 1| = 0,96
    expect(urteil?.sicherheit).toBeCloseTo(0.96, 10)
  })

  test('fehlt, wenn das Modell keine nennt — sie wird nicht erfunden', async () => {
    const b = await macheBuehne()
    b.antworte({
      status: 200,
      koerper: JSON.stringify({
        model: MODELL,
        answers: { abteilung: { type: 'choice', choice: 'konto', probabilities: { konto: 0.6 } } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    })

    const urteil = await anbieter(b.basis).entscheider?.entscheide({
      frage: 'Welche Abteilung?',
      lage: 'egal',
      schema: AUSWAHL,
    })

    expect(urteil?.sicherheit).toBeUndefined()
  })

  test('ist bei mehreren Feldern die schwächste Teilantwort', async () => {
    const b = await macheBuehne()
    b.antworte({
      status: 200,
      koerper: JSON.stringify({
        model: MODELL,
        answers: {
          geheimnis: { type: 'noul', noul: 0.99 },
          abteilung: { type: 'choice', choice: 'konto', confidence: 0.4, probabilities: { konto: 0.4 } },
        },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    })

    const schema: Schema<{ geheimnis: boolean; abteilung: string }> = {
      felder: { ...WAHRHEIT.felder, ...AUSWAHL.felder },
    }
    const urteil = await anbieter(b.basis).entscheider?.entscheide({
      frage: 'Ordne ein.',
      lage: 'egal',
      schema,
    })

    // Nicht der Durchschnitt (0,68), sondern das Minimum.
    expect(urteil?.sicherheit).toBe(0.4)
  })
})

describe('das Sicherheitsfeld', () => {
  test('wird aus der confidence gefüllt, nicht gefragt — so braucht es der Wächter', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: noulAntwort(0.95) })

    const schema: Schema<{ geheimnis: boolean; sicherheit: number }> = {
      felder: { geheimnis: { art: 'wahrheitswert' }, sicherheit: { art: 'zahl' } },
    }
    const urteil = await anbieter(b.basis).entscheider?.entscheide({
      frage: 'Enthält der Text ein Geheimnis?',
      lage: 'Der Schlüssel lautet sk-123.',
      schema,
    })

    // |2 · 0,95 − 1| = 0,9
    expect(urteil?.wert.geheimnis).toBe(true)
    expect(urteil?.wert.sicherheit).toBeCloseTo(0.9, 10)

    // **Der Beweis, daß es nicht gefragt wurde.** Ginge `sicherheit` als Frage hinaus, wäre der
    // Aufruf an der API gescheitert — sie nimmt keine freie Zahl.
    const koerper = JSON.parse(b.aufzeichnungen[0]?.koerper ?? '{}') as Record<string, unknown>
    expect(Object.keys(koerper['questions'] as object)).toEqual(['geheimnis'])
  })

  test('fehlt sie, wird das gemeldet — statt eine Sicherheit zu erfinden', async () => {
    const b = await macheBuehne()

    // Ein Noul trägt immer eine Sicherheit (|2p−1|) — deshalb der Weg über eine Wahl ohne
    // `confidence`, wie ihn ein Anbieter liefern könnte, der sie nicht angibt.
    const schema: Schema<{ abteilung: string; sicherheit: number }> = {
      felder: {
        abteilung: { art: 'text', auswahl: ['a', 'b'] },
        sicherheit: { art: 'zahl' },
      },
    }
    b.antworte({
      status: 200,
      koerper: JSON.stringify({
        model: MODELL,
        answers: { abteilung: { type: 'choice', choice: 'a', probabilities: { a: 0.6, b: 0.4 } } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    })

    await expect(
      anbieter(b.basis).entscheider?.entscheide({ frage: 'Welche?', lage: 'egal', schema }),
    ).rejects.toThrow(/keine Sicherheit/)
  })
})

describe('die Herkunft', () => {
  test('nennt TypeSafe und die Fassung, die geantwortet hat', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: noulAntwort(0.9, 'jev-1.14.0') })

    const urteil = await anbieter(b.basis).entscheider?.entscheide({
      frage: 'Enthält `text` ein Geheimnis?',
      lage: 'egal',
      schema: WAHRHEIT,
    })

    expect(urteil?.herkunft).toEqual({ anbieter: 'typesafe', modell: 'jev-1.14.0' })
  })
})

describe('was Jev nicht kann, wird abgelehnt', () => {
  test('freier Text ohne Auswahl — vor dem Aufruf', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: noulAntwort(0.9) })

    const schema: Schema<{ zusammenfassung: string }> = {
      felder: { zusammenfassung: { art: 'text' } },
    }

    await expect(
      anbieter(b.basis).entscheider?.entscheide({
        frage: 'Fasse zusammen.',
        lage: 'egal',
        schema,
      }),
    ).rejects.toThrow(/freien Text/)
    // Der Beweis, daß nichts hinausging: kein Aufruf.
    expect(b.aufzeichnungen).toHaveLength(0)
  })

  test('freie Zahl ohne Auswahl — vor dem Aufruf', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 200, koerper: noulAntwort(0.9) })

    const schema: Schema<{ betrag: number }> = {
      felder: { betrag: { art: 'zahl' } },
    }

    await expect(
      anbieter(b.basis).entscheider?.entscheide({ frage: 'Wie hoch?', lage: 'egal', schema }),
    ).rejects.toThrow(/freie Zahlen/)
    expect(b.aufzeichnungen).toHaveLength(0)
  })

  test('eine Auswahl mit nur einem Wert ist keine Frage', () => {
    const schema: Schema<{ ja: string }> = {
      felder: { ja: { art: 'text', auswahl: ['nur'] } },
    }
    expect(() => uebersetze(schema as unknown as Schema<unknown>, 'Frage?')).toThrow(
      /mindestens zwei/,
    )
  })

  test('eine Zahl MIT Auswahl geht — der Rückweg stellt den Wert wieder her', () => {
    const schema: Schema<{ stufe: number }> = {
      felder: { stufe: { art: 'zahl', auswahl: [1, 2, 3] } },
    }
    const uebersetzt = uebersetze(schema as unknown as Schema<unknown>, 'Welche Stufe?')
    expect(uebersetzt.abbildungen[0]?.frage.type).toBe('choice')
    const zurueck = uebersetzt.abbildungen[0]?.wert({ choice: '2' })
    expect(zurueck).toBe(2)
  })

  test('`sicherheit` wird NICHT gefragt — der Anbieter beantwortet es selbst', () => {
    const schema: Schema<{ geheimnis: boolean; sicherheit: number }> = {
      felder: { geheimnis: { art: 'wahrheitswert' }, sicherheit: { art: 'zahl' } },
    }
    const uebersetzt = uebersetze(schema as unknown as Schema<unknown>, 'Enthält der Text ein Geheimnis?')
    expect(uebersetzt.abbildungen).toHaveLength(1)
    expect(uebersetzt.abbildungen[0]?.name).toBe('geheimnis')
    expect(uebersetzt.sicherheitsfelder).toEqual(['sicherheit'])
  })

  test('ein Schema aus NUR `sicherheit` ist keine Frage', () => {
    const schema: Schema<{ sicherheit: number }> = { felder: { sicherheit: { art: 'zahl' } } }
    expect(() => uebersetze(schema as unknown as Schema<unknown>, 'Frage?')).toThrow(
      /nichts zu entscheiden/,
    )
  })
})

describe('die Bereitschaft', () => {
  test('ohne Schlüssel: nicht bereit, und der Grund nennt die Variable', async () => {
    const a = typesafe({ schluessel: () => undefined, modell: MODELL })
    const stand = await a.bereit('entscheiden')
    expect(stand.bereit).toBe(false)
    expect(stand.bereit === false ? stand.grund : '').toContain('TYPESAFE_API_KEY')
  })

  test('ohne Modell: nicht bereit, und der Grund nennt den Vorschlag', async () => {
    const a = typesafe({ schluessel: () => SCHLUESSEL })
    const stand = await a.bereit('entscheiden')
    expect(stand.bereit).toBe(false)
    expect(stand.bereit === false ? stand.grund : '').toContain('jev-1.14.0')
  })

  test('nennt beide Gründe, wenn beide fehlen — nicht nur den ersten', async () => {
    const a = typesafe({ schluessel: () => undefined })
    const stand = await a.bereit('entscheiden')
    expect(stand.bereit).toBe(false)
    const grund = stand.bereit === false ? stand.grund : ''
    expect(grund).toContain('TYPESAFE_API_KEY')
    expect(grund).toContain('MODELL')
  })

  test('mit Schlüssel und Modell: bereit', async () => {
    const a = typesafe({ schluessel: () => SCHLUESSEL, modell: MODELL })
    expect(await a.bereit('entscheiden')).toEqual({ bereit: true })
  })

  test('für eine andere Fähigkeit: nicht bereit', async () => {
    const a = typesafe({ schluessel: () => SCHLUESSEL, modell: MODELL })
    const stand = await a.bereit('einbetten')
    expect(stand.bereit).toBe(false)
  })

  test('das Modell aus der Umgebung zählt — als Entscheidung des Betreibers', async () => {
    process.env[UMWELT_MODELL] = 'jev-1.13.0'
    const a = typesafe({ schluessel: () => SCHLUESSEL })
    expect(await a.bereit('entscheiden')).toEqual({ bereit: true })
    expect(a.modelle('entscheiden')).toEqual(['jev-1.13.0'])
  })
})

describe('die Fehler', () => {
  test('ein HTTP-Fehler wird mit Status gemeldet', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 401, koerper: '{"detail":"invalid api key"}' })

    await expect(
      anbieter(b.basis).entscheider?.entscheide({
        frage: 'Enthält `text` ein Geheimnis?',
        lage: 'egal',
        schema: WAHRHEIT,
      }),
    ).rejects.toThrow(/HTTP 401/)
  })

  test('der Fehler ist ein TypesafeFehler mit Status', async () => {
    const b = await macheBuehne()
    b.antworte({ status: 429, koerper: '{}' })

    try {
      await anbieter(b.basis).entscheider?.entscheide({
        frage: 'Enthält `text` ein Geheimnis?',
        lage: 'egal',
        schema: WAHRHEIT,
      })
      throw new Error('Es hätte werfen müssen.')
    } catch (fehler) {
      expect(fehler).toBeInstanceOf(TypesafeFehler)
      expect((fehler as TypesafeFehler).status).toBe(429)
    }
  })

  test('eine fehlende Antwort auf ein Pflichtfeld wird gemeldet', async () => {
    const b = await macheBuehne()
    b.antworte({
      status: 200,
      koerper: JSON.stringify({ model: MODELL, answers: {}, usage: { input_tokens: 1, output_tokens: 0 } }),
    })

    await expect(
      anbieter(b.basis).entscheider?.entscheide({
        frage: 'Enthält `text` ein Geheimnis?',
        lage: 'egal',
        schema: WAHRHEIT,
      }),
    ).rejects.toThrow(/geheimnis/)
  })

  test('ein freiwilliges Feld darf fehlen, ohne zu werfen', async () => {
    const b = await macheBuehne()
    b.antworte({
      status: 200,
      koerper: JSON.stringify({
        model: MODELL,
        answers: { geheimnis: { type: 'noul', noul: 0.9 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    })

    const schema: Schema<{ geheimnis: boolean; notiz?: string }> = {
      felder: {
        geheimnis: { art: 'wahrheitswert' },
        notiz: { art: 'text', auswahl: ['a', 'b'], freiwillig: true },
      },
    }

    const urteil = await anbieter(b.basis).entscheider?.entscheide({
      frage: 'Prüfe.',
      lage: 'egal',
      schema,
    })

    expect(urteil?.wert).toEqual({ geheimnis: true })
  })
})
