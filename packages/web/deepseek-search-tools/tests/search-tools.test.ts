/**
 * Suche und Abruf: Anfrage, Antwort, Abrechenbarkeit, Werkzeuge.
 *
 * Festgenagelt wird: die Anfrage geht an den **richtigen Weg** mit `count` als echtem Knopf, die
 * Antwort wird auf **Treffer** geprüft, **abrechenbar ist nur 200 mit Ergebnis** (leer und Fehler
 * kosten nichts), der **Schlüssel erscheint in keiner Meldung**, und die Werkzeuge stehen mit
 * eigenem Namen in der Registry — damit das Modell den **bezahlten** Weg vom kostenfreien
 * Server-Werkzeug unterscheiden kann.
 */

import { describe, expect, test } from 'bun:test'

import { Tools, toolSpecs } from '@prometheus-harness/agent-tools'

import {
  ABRUFWERKZEUG,
  BASIS,
  PREIS_JE_ANFRAGE_USD,
  SUCHWERKZEUG,
  Suchfehler,
  abruf,
  entschaerfe,
  kostenFuer,
  netzHole,
  suche,
  suchWerkzeuge,
  type Hole,
} from '../src/index.ts'

/** Eine Antwort der Search-API. */
const SUCHANTWORT = JSON.stringify({
  results: [
    {
      rerank_score: 2.1,
      title: 'DeepSeek Search Guide',
      url: 'https://api-docs.deepseek.com/guides/search/',
      snippet: 'Search and fetch for agents.',
      summary: 'A guide describing the raw JSON search and fetch endpoints.',
      content: '',
      site_name: 'api-docs',
      date: '2026-10-01T00:00:00Z',
      authority: 4,
    },
    {
      title: 'Ohne Adresse',
      url: '',
      snippet: 'wird verworfen',
    },
  ],
})

/** Ein HTTP-Weg, der aufzeichnet und feste Antworten gibt. */
const holeMit = (status: number, text: string): { hole: Hole; aufrufe: { url: string; body: string; kopf: Readonly<Record<string, string>> }[] } => {
  const aufrufe: { url: string; body: string; kopf: Readonly<Record<string, string>> }[] = []
  const hole: Hole = async (url, optionen) => {
    aufrufe.push({ url, body: optionen.body, kopf: optionen.headers })
    return { status, text }
  }
  return { hole, aufrufe }
}

describe('Anfrage bauen', () => {
  test('die Suche geht an /v1/tools/search und trägt count als Knopf', async () => {
    const { hole, aufrufe } = holeMit(200, SUCHANTWORT)
    await suche(hole, { apiKey: 'sk-TEST', query: 'deepseek suche', count: 25 })
    expect(aufrufe[0]?.url).toBe(`${BASIS}/v1/tools/search`)
    const rumpf = JSON.parse(aufrufe[0]?.body ?? '{}')
    expect(rumpf.query).toBe('deepseek suche')
    expect(rumpf.count).toBe(25)
    // Ohne Angabe wird das Feld WEGGELASSEN — die API-Vorgabe ist `false`, und ein Feld, das
    // niemand gesetzt hat, gehört nicht in die Anfrage.
    expect(rumpf.need_content).toBeUndefined()
  })

  test('need_content und ori_question kommen nur dazu, wenn genannt', async () => {
    const { hole, aufrufe } = holeMit(200, SUCHANTWORT)
    await suche(hole, { apiKey: 'sk-TEST', query: 'x', needContent: true, oriQuestion: 'was sucht der nutzer' })
    const rumpf = JSON.parse(aufrufe[0]?.body ?? '{}')
    expect(rumpf.need_content).toBe(true)
    expect(rumpf.ori_question).toBe('was sucht der nutzer')
  })

  test('der Abruf geht an /v1/tools/fetch mit der Adresse', async () => {
    const { hole, aufrufe } = holeMit(200, JSON.stringify({ title: 'T', content: 'Inhalt' }))
    const ergebnis = await abruf(hole, { apiKey: 'sk-TEST', url: 'https://example.com/a' })
    expect(aufrufe[0]?.url).toBe(`${BASIS}/v1/tools/fetch`)
    expect(JSON.parse(aufrufe[0]?.body ?? '{}')).toEqual({ url: 'https://example.com/a' })
    expect(ergebnis.abrechenbar).toBe(true)
  })

  test('die Kopfzeilen tragen den Bearer, die Attrappe zeichnet sie auf', async () => {
    const { hole, aufrufe } = holeMit(200, SUCHANTWORT)
    await suche(hole, { apiKey: 'sk-TEST', query: 'x' })
    expect(aufrufe[0]?.kopf['authorization']).toBe('Bearer sk-TEST')
    expect(aufrufe[0]?.kopf['content-type']).toBe('application/json')
  })

  test('eine leere Anfrage und ein fehlender Schlüssel werden abgewiesen', async () => {
    const { hole } = holeMit(200, SUCHANTWORT)
    await expect(suche(hole, { apiKey: 'sk', query: '   ' })).rejects.toThrow(/leere Anfrage/)
    await expect(suche(hole, { apiKey: '  ', query: 'x' })).rejects.toThrow(/ohne Schluessel/)
    await expect(abruf(hole, { apiKey: 'sk', url: 'ftp://x' })).rejects.toThrow(/keine http/)
    await expect(abruf(hole, { apiKey: 'sk', url: 'https://x', })).resolves.toBeDefined()
  })

  test('count außerhalb 1–50 wird abgewiesen, statt still geklemmt', async () => {
    const { hole } = holeMit(200, SUCHANTWORT)
    await expect(suche(hole, { apiKey: 'sk', query: 'x', count: 51 })).rejects.toThrow(/1 bis 50/)
    await expect(suche(hole, { apiKey: 'sk', query: 'x', count: 0 })).rejects.toThrow(/1 bis 50/)
  })
})

describe('Antwort lesen', () => {
  test('Treffer ohne Adresse fallen weg, Felder kommen an', async () => {
    const { hole } = holeMit(200, SUCHANTWORT)
    const ergebnis = await suche(hole, { apiKey: 'sk', query: 'x' })
    expect(ergebnis.treffer).toHaveLength(1)
    expect(ergebnis.treffer[0]?.title).toBe('DeepSeek Search Guide')
    expect(ergebnis.treffer[0]?.rerankScore).toBe(2.1)
    expect(ergebnis.treffer[0]?.authority).toBe(4)
    expect(ergebnis.treffer[0]?.siteName).toBe('api-docs')
  })

  test('abrechenbar ist nur 200 MIT Ergebnis — leer kostet nichts', async () => {
    const leer = holeMit(200, JSON.stringify({ results: [] }))
    const treffer = await suche(leer.hole, { apiKey: 'sk', query: 'x' })
    expect(treffer.kosten).toEqual({ abrechenbar: false, kostenUsd: 0, treffer: 0 })

    const voll = holeMit(200, SUCHANTWORT)
    const mit = await suche(voll.hole, { apiKey: 'sk', query: 'x' })
    expect(mit.kosten.abrechenbar).toBe(true)
    expect(mit.kosten.kostenUsd).toBe(PREIS_JE_ANFRAGE_USD)
  })

  test('ein Abruf ohne Inhalt ist nicht abrechenbar', async () => {
    const { hole } = holeMit(200, JSON.stringify({ title: 'T', content: '' }))
    const ergebnis = await abruf(hole, { apiKey: 'sk', url: 'https://example.com/a' })
    expect(ergebnis.abrechenbar).toBe(false)
    expect(ergebnis.kostenUsd).toBe(0)
  })

  test('ein Status außerhalb 200 wird geworfen — mit Status, ohne Schlüssel', async () => {
    const { hole } = holeMit(429, 'rate limit exceeded apiKey: sk-GEHEIM')
    await expect(suche(hole, { apiKey: 'sk-GEHEIM', query: 'x' })).rejects.toThrow(/429/)
    await expect(suche(hole, { apiKey: 'sk-GEHEIM', query: 'x' })).rejects.not.toThrow(/GEHEIM/)
  })

  test('was kein JSON ist, wird geworfen', async () => {
    const { hole } = holeMit(200, 'kein json')
    await expect(suche(hole, { apiKey: 'sk', query: 'x' })).rejects.toBeInstanceOf(Suchfehler)
    await expect(suche(hole, { apiKey: 'sk', query: 'x' })).rejects.toThrow(/kein JSON/)
  })

  test('Kosten werden auf acht Stellen gerundet', () => {
    expect(kostenFuer(1)).toBe(0.00075)
    expect(kostenFuer(1_000)).toBe(0.75)
    expect(() => kostenFuer(-1)).toThrow(/>= 0/)
  })

  test('Meldungen entschärfen Schlüssel und Bearer', () => {
    expect(entschaerfe('apiKey: sk-1')).toBe('apiKey: ***')
    expect(entschaerfe('Bearer sk-abc')).toBe('Bearer ***')
  })
})

describe('Werkzeuge im Loop', () => {
  test('beide Werkzeuge stehen unter eigenem Namen in der Registry', () => {
    const { hole } = holeMit(200, SUCHANTWORT)
    const registry = new Tools(suchWerkzeuge({ apiKey: 'sk', hole }))
    expect(registry.list().map((werkzeug) => werkzeug.name)).toEqual([SUCHWERKZEUG, ABRUFWERKZEUG])
    const specs = toolSpecs(registry)
    expect((specs[0]?.parameters as { required?: string[] }).required).toEqual(['query'])
    expect((specs[1]?.parameters as { required?: string[] }).required).toEqual(['url'])
  })

  test('die Suche liefert Treffer und Kosten als JSON', async () => {
    const { hole } = holeMit(200, SUCHANTWORT)
    const [suchen] = suchWerkzeuge({ apiKey: 'sk', hole })
    const text = await suchen?.execute({ query: 'x', count: 3 }, { signal: undefined, step: 1, callId: 'c1' }) ?? ''
    const wert = JSON.parse(text)
    expect(wert.treffer).toHaveLength(1)
    expect(wert.abrechenbar).toBe(true)
    expect(wert.kostenUsd).toBe(PREIS_JE_ANFRAGE_USD)
  })

  test('ein fehlendes Argument nennt sich beim Namen', async () => {
    const { hole } = holeMit(200, SUCHANTWORT)
    const werkzeuge = suchWerkzeuge({ apiKey: 'sk', hole })
    await expect(werkzeuge[0]?.execute({}, { signal: undefined, step: 1, callId: 'c1' })).rejects.toThrow(/"query"/)
    await expect(werkzeuge[1]?.execute({}, { signal: undefined, step: 1, callId: 'c1' })).rejects.toThrow(/"url"/)
  })

  test('ohne Schlüssel werden keine Werkzeuge gebaut', () => {
    const { hole } = holeMit(200, SUCHANTWORT)
    expect(() => suchWerkzeuge({ apiKey: '  ', hole })).toThrow(/ohne Schluessel/)
  })
})

describe('Der echte Netzweg — gegen einen lokalen Server, ohne Kosten', () => {
  test('netzHole sendet wirklich: Methode, Kopf und Rumpf kommen an', async () => {
    const gesehen: { methode: string; auth: string; rumpf: string }[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(anfrage: Request) {
        gesehen.push({
          methode: anfrage.method,
          auth: anfrage.headers.get('authorization') ?? '',
          rumpf: await anfrage.text(),
        })
        return new Response(SUCHANTWORT, { status: 200, headers: { 'content-type': 'application/json' } })
      },
    })
    try {
      const adresse = `http://127.0.0.1:${String(server.port)}`
      const ergebnis = await suche(netzHole(), { apiKey: 'sk-TEST', query: 'deepseek', count: 2, basis: adresse })
      expect(gesehen).toHaveLength(1)
      expect(gesehen[0]?.methode).toBe('POST')
      expect(gesehen[0]?.auth).toBe('Bearer sk-TEST')
      expect(JSON.parse(gesehen[0]?.rumpf ?? '{}')).toEqual({ query: 'deepseek', count: 2 })
      expect(ergebnis.treffer).toHaveLength(1)
      expect(ergebnis.kosten.abrechenbar).toBe(true)
    } finally {
      await server.stop(true)
    }
  })

  test('ein 500 des Servers wird zur Meldung mit Status — und ohne Schlüssel im Text', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response('kaputt: api_key=sk-GEHEIM', { status: 500 })
      },
    })
    try {
      const adresse = `http://127.0.0.1:${String(server.port)}`
      let gefangen: unknown
      try {
        await suche(netzHole(), { apiKey: 'sk-TEST', query: 'x', basis: adresse })
      } catch (fehler) {
        gefangen = fehler
      }
      expect(gefangen).toBeInstanceOf(Suchfehler)
      expect((gefangen as Suchfehler).status).toBe(500)
      expect((gefangen as Suchfehler).message).not.toContain('sk-GEHEIM')
      expect((gefangen as Suchfehler).message).toContain('***')
    } finally {
      await server.stop(true)
    }
  })
})
