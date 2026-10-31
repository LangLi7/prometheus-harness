/**
 * Das Verzeichnis und seine Sonde — über einen **echten Socket**, gegen eine Attrappe.
 *
 * ## Der wichtigste Fall
 *
 * Die Sonde soll **nachmessen können**, was ich am 15.10.2026 von Hand gemessen habe: daß
 * `api.deepseek.com` auf `POST /embeddings` mit **404** antwortet. In dieser Prüfung ist der
 * Dienst eine Attrappe, die genau das tut — und die Sonde muß daraus „fehlt" machen.
 *
 * **Und zwar ohne die Tabelle zu fragen.** DeepSeek nennt in seiner Familie keinen Einbettungs-Weg;
 * die Sonde nimmt dann den verbreiteten Pfad aus {@link VERSUCHSPFAD}. Sonst könnte sie einen
 * Irrtum der Tabelle nie aufdecken — sie würde nur wiederholen, was ohnehin drinsteht.
 *
 * ## Was diese Datei NICHT beweist
 *
 * Daß OpenRouter und DeepSeek sich wirklich so verhalten. Die Attrappe antwortet mit **erfundenen**
 * Statuscodes. Die echten Messungen stehen in `docs/status/anbieter-kern.md` und
 * `docs/status/openrouter-schnittstelle.md`.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  ANTHROPIC,
  DEEPSEEK,
  FAMILIEN,
  GEMESSEN_AM,
  OPENROUTER,
  VERSUCHSPFAD,
  ZAI,
  ZENMUX,
  VerzeichnisFehler,
  familieMit,
  frageModelle,
  pruefeWeg,
  sonde,
  standDesWeges,
} from '../src/index.ts'

/** Der Schlüssel für die Prüfung — **kein echter**, und genau deshalb darf er hier stehen. */
const SCHLUESSEL = 'sk-or-v1-nur-fuer-die-pruefung-0000000000000000'

/** Die offenen Attrappen — nach **jedem** Test geschlossen. */
const offen: Server[] = []

afterEach(() => {
  for (const s of offen.splice(0)) {
    if (typeof s.closeAllConnections === 'function') s.closeAllConnections()
    s.close()
  }
})

/** Was die Attrappe gesehen hat. */
interface Aufzeichnung {
  readonly pfad: string
  readonly methode: string
  readonly kopf: Record<string, string | string[] | undefined>
  readonly koerper: string
  readonly typ: string | undefined
}

/**
 * Startet eine Attrappe, die **je Pfad** einen Status bereithält.
 *
 * @param antworten - Pfad auf Status und Körper; unbekannte Pfade geben **404**
 * @returns die Adresse, die Aufzeichnungen und das Setzen von Antworten
 */
async function macheBuehne(
  antworten: Readonly<Record<string, { readonly status: number; readonly koerper?: string }>> = {},
): Promise<{
  basis: string
  aufzeichnungen: Aufzeichnung[]
  setze: (pfad: string, status: number, koerper?: string) => void
}> {
  const aufzeichnungen: Aufzeichnung[] = []
  const plan = new Map<string, { status: number; koerper?: string }>(Object.entries(antworten))

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const teile: Buffer[] = []
    req.on('data', (stueck: Buffer) => teile.push(stueck))
    req.on('end', () => {
      const koerper = Buffer.concat(teile)
      const pfad = (req.url ?? '/').split('?')[0] ?? '/'
      aufzeichnungen.push({
        pfad,
        methode: req.method ?? '',
        kopf: req.headers,
        koerper: koerper.toString('utf8'),
        typ: req.headers['content-type'] === undefined ? undefined : String(req.headers['content-type']),
      })
      const eintrag = plan.get(pfad) ?? { status: 404 }
      res.writeHead(eintrag.status, { 'content-type': 'application/json' })
      res.end(eintrag.koerper ?? '{}')
    })
  })
  offen.push(server)
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig))
  return {
    basis: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
    aufzeichnungen,
    setze: (pfad, status, koerper) => {
      plan.set(pfad, koerper === undefined ? { status } : { status, koerper })
    },
  }
}

// ---------------------------------------------------------------------------
// 1. Die Tabelle — Daten, und die ehrliche Kennzeichnung
// ---------------------------------------------------------------------------

describe('Die Familien', () => {
  test('jede Familie ist vollständig und hat keine Adresse mit Schrägstrich am Ende', () => {
    for (const familie of FAMILIEN) {
      expect({
        id: familie.id.trim() !== '',
        name: familie.name.trim() !== '',
        basis: familie.basis.startsWith('https://') && !familie.basis.endsWith('/'),
        modellWeg: familie.modellWeg.startsWith('/'),
        stand: familie.stand.trim() !== '',
      }).toEqual({ id: true, name: true, basis: true, modellWeg: true, stand: true })
    }
  })

  test('eine unbekannte Kennung ergibt nichts — kein stiller Ersatz', () => {
    expect(familieMit('gibtsnicht')).toBeUndefined()
    expect(familieMit('openrouter')?.name).toBe('OpenRouter')
  })

  test('OpenRouter nennt sechs Wege — und jeder PFAD ist als gemessen gekennzeichnet', () => {
    const wege = OPENROUTER.wege
    expect(Object.keys(wege).sort()).toEqual([
      'bild',
      'einbetten',
      'entscheiden',
      'gespraech',
      'sprache-zu-text',
      'text-zu-sprache',
    ])
    for (const [faehigkeit, weg] of Object.entries(wege)) {
      expect({ faehigkeit, gemessen: weg?.gemessenAm }).toEqual({ faehigkeit, gemessen: GEMESSEN_AM })
    }
  })

  test('KORREKTUR: `bild` ist seit dem 19.10.2026 `benutzbar` — Pfad UND Form gemessen', () => {
    // **Die frühere Fassung dieser Prüfung hieß: „`bild` nennt KEINE Familie — der Weg ist bei
    // keiner gemessen."** Das war zu streng formuliert, und die Messung hat es überholt: der PFAD
    // ist inzwischen gemessen (400 auf einen leeren Auftrag, während ein erfundener Pfad 404 gibt).
    //
    // **Die zweite Fassung hieß `pfad-bestaetigt`** — richtig bis zum 19.10.2026. An diesem Tag
    // antwortete `google/gemini-2.5-flash-image` mit 200 und einem Bild, und damit sind auch die
    // Feldnamen belegt. Beide Aussagen bleiben hier stehen: wer die Geschichte löscht, lernt nichts
    // (Regel 12).
    const bild = OPENROUTER.wege.bild
    expect(bild?.pfad).toBe('/images/generations')
    expect(bild === undefined ? 'fehlt' : standDesWeges(bild)).toBe('benutzbar')
    // Die Form ist jetzt belegt — und zwar an einem ANDEREN Tag als der Pfad.
    expect(bild?.gemessenAm).toBe(GEMESSEN_AM)
    expect(bild?.formGemessenAm).toBe('2026-10-19')
    expect(bild?.felder).toEqual({
      modell: 'model',
      beschreibung: 'prompt',
      anzahl: 'n',
      format: 'response_format',
    })
  })

  test('DeepSeek: der Chat-Pfad ist gemessen, die FORM der strukturierten Ausgabe nicht', () => {
    // Auch hier eine Korrektur: die erste Fassung ließ `gemessenAm` weg. Der Pfad IST gemessen
    // (422 auf einen leeren Auftrag, 404 auf einen erfundenen) — ungemessen ist die Form.
    expect(Object.keys(DEEPSEEK.wege).sort()).toEqual(['entscheiden', 'gespraech'])
    const entscheiden = DEEPSEEK.wege.entscheiden
    expect(entscheiden?.gemessenAm).toBe(GEMESSEN_AM)
    expect(entscheiden?.felder).toBeUndefined()
    expect(entscheiden === undefined ? 'fehlt' : standDesWeges(entscheiden)).toBe('pfad-bestaetigt')
    expect(DEEPSEEK.stand).toContain('404')
  })

  test('die drei Zustände werden AUSGERECHNET, nicht behauptet', () => {
    expect(
      standDesWeges({ pfad: '/x', art: 'json', gemessenAm: GEMESSEN_AM, felder: { a: 'b' } }),
    ).toBe('benutzbar')
    expect(standDesWeges({ pfad: '/x', art: 'json', gemessenAm: GEMESSEN_AM })).toBe('pfad-bestaetigt')
    expect(standDesWeges({ pfad: '/x', art: 'json' })).toBe('unbestaetigt')
    // **Eine geratene Form ohne gemessenen Pfad bleibt unbestätigt.** Sie hilft niemandem: wer
    // Feldnamen kennt, aber nicht weiß, ob der Weg existiert, hat nichts.
    expect(standDesWeges({ pfad: '/x', art: 'json', felder: { a: 'b' } })).toBe('unbestaetigt')
  })

  test('die fünf neuen Familien sind eingetragen — mit gemessenem Pfad und OHNE erfundene Felder', () => {
    for (const id of ['anthropic', 'zai', 'zenmux', 'nous', 'opencode']) {
      const familie = familieMit(id)
      expect({ id, gefunden: familie !== undefined }).toEqual({ id, gefunden: true })
      expect({ id, basis: familie?.basis.startsWith('https://') }).toEqual({ id, basis: true })
      // **Keine erfundenen Feldnamen.** Bei keinem der neuen Anbieter ist die Form gemessen.
      for (const [faehigkeit, weg] of Object.entries(familie?.wege ?? {})) {
        expect({ id, faehigkeit, felder: weg?.felder }).toEqual({ id, faehigkeit, felder: undefined })
      }
    }
  })

  test('Anthropic braucht einen ANDEREN Kopf — der gemessene Beweis für die Funktion', () => {
    const kopf = ANTHROPIC.kopf('nur-ein-beispiel-1234')
    expect(kopf).toEqual({ 'x-api-key': 'nur-ein-beispiel-1234', 'anthropic-version': '2023-06-01' })
    expect(kopf['authorization']).toBeUndefined()
    // Und einen anderen Chat-Weg als alle anderen Familien.
    expect(ANTHROPIC.wege.entscheiden?.pfad).toBe('/messages')
  })

  test('ZenMux nennt KEINEN Weg — lieber leer als geraten', () => {
    // Jeder POST gibt 403, auch ein erfundener Pfad. Dort lernt man nichts über Wege.
    expect(ZENMUX.wege).toEqual({})
    expect(ZENMUX.stand).toContain('403')
  })

  test('Z.ai: der Pfad ist bestätigt, die WIRKUNG nicht — und genau das steht dabei', () => {
    expect(Object.keys(ZAI.wege).length).toBe(6)
    expect(ZAI.stand).toContain('200')
    expect(ZAI.stand).toContain('NICHT')
  })

  test('derselbe Fähigkeitsname, ein ANDERER Weg — die gemessene Lehre als Daten', () => {
    // `text-zu-sprache` läuft bei OpenRouter über /audio/speech. Genau das war die Messung, die
    // dem Chat-Weg widersprach: der weist ein Sprachmodell ab und nennt den richtigen Weg.
    expect(OPENROUTER.wege['text-zu-sprache']?.pfad).toBe('/audio/speech')
    expect(OPENROUTER.wege['text-zu-sprache']?.pfad).not.toBe('/chat/completions')
    expect(OPENROUTER.wege['sprache-zu-text']?.art).toBe('mehrtelldaten')
    expect(OPENROUTER.wege.einbetten?.pfad).toBe('/embeddings')
  })

  test('die Feldnamen tragen die gemessene Form', () => {
    // `text` heißt dort `input`, die Stimme `voice`, das Format `response_format`. Wer das errät,
    // schickt einen Körper, den der Dienst nicht versteht.
    expect(OPENROUTER.wege['text-zu-sprache']?.felder).toEqual({
      modell: 'model',
      text: 'input',
      stimme: 'voice',
      format: 'response_format',
    })
    expect(OPENROUTER.wege['sprache-zu-text']?.felder?.['ton']).toBe('file')
  })

  test('der Schlüssel steht NICHT in der Tabelle — er kommt aus der Funktion', () => {
    const kopf = OPENROUTER.kopf(SCHLUESSEL)
    expect(kopf['authorization']).toBe(`Bearer ${SCHLUESSEL}`)
    // Die Tabelle ist Daten und wird angezeigt; ein Schlüssel darin wäre in jeder Anzeige dabei.
    expect(JSON.stringify(OPENROUTER.wege)).not.toContain('Bearer')
  })
})

// ---------------------------------------------------------------------------
// 2. Die Models-API
// ---------------------------------------------------------------------------

describe('Die Models-API fragen', () => {
  test('die Kennungen werden gelesen', async () => {
    const b = await macheBuehne({
      '/models': { status: 200, koerper: JSON.stringify({ data: [{ id: 'a/erstes' }, { id: 'b/zweites' }] }) },
    })
    const familie = { ...OPENROUTER, basis: b.basis }
    expect(await frageModelle(familie, { schluessel: SCHLUESSEL })).toEqual(['a/erstes', 'b/zweites'])
    expect(b.aufzeichnungen[0]?.methode).toBe('GET')
    expect(b.aufzeichnungen[0]?.kopf['authorization']).toBe(`Bearer ${SCHLUESSEL}`)
  })

  test('ein Eintrag ohne `id` wird übersprungen, nicht als leerer Name geführt', async () => {
    const b = await macheBuehne({
      '/models': { status: 200, koerper: JSON.stringify({ data: [{ id: 'gut' }, { ohne: 'id' }, 'text'] }) },
    })
    expect(await frageModelle({ ...OPENROUTER, basis: b.basis }, {})).toEqual(['gut'])
  })

  test('ein abgelehnter Schlüssel ergibt einen Fehler MIT Status', async () => {
    const b = await macheBuehne({ '/models': { status: 401, koerper: '{"error":"no auth"}' } })
    const fehler = await frageModelle({ ...OPENROUTER, basis: b.basis }, { schluessel: SCHLUESSEL }).catch(
      (e: unknown) => e,
    )
    expect(fehler).toBeInstanceOf(VerzeichnisFehler)
    expect((fehler as VerzeichnisFehler).status).toBe(401)
  })

  test('KEIN `data`-Feld ist ein Fehler — nicht eine leere Liste', async () => {
    // Manche Dienste nennen das Feld `models`. Es zu erraten hieße, eine leere Liste als „kann
    // nichts" zu lesen — und einen Anbieter zu verwerfen, der alles kann.
    const b = await macheBuehne({ '/models': { status: 200, koerper: JSON.stringify({ models: ['x'] }) } })
    await expect(frageModelle({ ...OPENROUTER, basis: b.basis }, {})).rejects.toThrow('unbekannt')
  })

  test('kein JSON ergibt einen Fehler, der zeigt, WAS kam', async () => {
    const b = await macheBuehne({ '/models': { status: 200, koerper: '<html>Wartung</html>' } })
    await expect(frageModelle({ ...OPENROUTER, basis: b.basis }, {})).rejects.toThrow('kein JSON')
  })

  test('ein toter Port ergibt eine Meldung OHNE den Schlüssel', async () => {
    const b = await macheBuehne()
    const basis = b.basis
    for (const s of offen.splice(0)) s.close()
    const fehler = await frageModelle({ ...OPENROUTER, basis }, { schluessel: SCHLUESSEL }).catch((e: unknown) => e)
    expect(fehler).toBeInstanceOf(VerzeichnisFehler)
    const text = (fehler as Error).message
    expect(text).toContain('nicht erreichbar')
    expect(text).not.toContain(SCHLUESSEL)
  })
})

// ---------------------------------------------------------------------------
// 3. Einen Weg prüfen — die Statusdeutung
// ---------------------------------------------------------------------------

describe('Einen Weg prüfen', () => {
  test('404 heißt: den Weg gibt es NICHT — der DeepSeek-Fall', async () => {
    const b = await macheBuehne({ '/chat/completions': { status: 400 } })
    expect(await pruefeWeg({ ...DEEPSEEK, basis: b.basis }, 'einbetten', { schluessel: SCHLUESSEL })).toBe('fehlt')
  })

  test('400 heißt: den Weg gibt es, der Auftrag war nur falsch', async () => {
    const b = await macheBuehne({ '/embeddings': { status: 400 } })
    expect(await pruefeWeg({ ...OPENROUTER, basis: b.basis }, 'einbetten', {})).toBe('vorhanden')
  })

  test('401 heißt UNBEKANNT — ein Tor sagt nichts über den Weg', async () => {
    // Wer 401 als Beweis nimmt, hält jeden Pfad für vorhanden — und trägt einen Anbieter ein,
    // der nichts kann.
    const b = await macheBuehne({ '/embeddings': { status: 401 } })
    expect(await pruefeWeg({ ...OPENROUTER, basis: b.basis }, 'einbetten', { schluessel: SCHLUESSEL })).toBe(
      'unbekannt',
    )
  })

  test('405, 415 und 422 heißen: vorhanden', async () => {
    for (const status of [405, 415, 422]) {
      const b = await macheBuehne({ '/audio/speech': { status } })
      expect({ status, befund: await pruefeWeg({ ...OPENROUTER, basis: b.basis }, 'text-zu-sprache', {}) }).toEqual({
        status,
        befund: 'vorhanden',
      })
    }
  })

  test('500 und ein toter Port heißen: unbekannt', async () => {
    const b = await macheBuehne({ '/audio/speech': { status: 500 } })
    expect(await pruefeWeg({ ...OPENROUTER, basis: b.basis }, 'text-zu-sprache', {})).toBe('unbekannt')

    const b2 = await macheBuehne()
    const basis = b2.basis
    for (const s of offen.splice(0)) s.close()
    expect(await pruefeWeg({ ...OPENROUTER, basis }, 'text-zu-sprache', {})).toBe('unbekannt')
  })

  test('der gesendete Auftrag ist ABSICHTLICH unbrauchbar — deshalb kostenlos', async () => {
    const b = await macheBuehne({ '/audio/speech': { status: 400 } })
    await pruefeWeg({ ...OPENROUTER, basis: b.basis }, 'text-zu-sprache', { schluessel: SCHLUESSEL })
    const ruf = b.aufzeichnungen[0]
    expect(ruf?.methode).toBe('POST')
    // Ein leeres Objekt kann keine Antwort erzeugen — und ohne Antwort keine Rechnung.
    expect(ruf?.koerper).toBe('{}')
    expect(ruf?.kopf['content-type']).toBe('application/json')
    expect(ruf?.kopf['authorization']).toBe(`Bearer ${SCHLUESSEL}`)
  })

  test('der Hör-Weg geht als MEHRTEILDATEN hinaus', async () => {
    const b = await macheBuehne({ '/audio/transcriptions': { status: 400 } })
    await pruefeWeg({ ...OPENROUTER, basis: b.basis }, 'sprache-zu-text', {})
    const ruf = b.aufzeichnungen[0]
    expect(String(ruf?.typ)).toStartWith('multipart/form-data; boundary=')
    // **Kein `content-type` von Hand** — die Grenze setzt `fetch`. Ein eigener Kopf ohne passende
    // Grenze macht den Körper unlesbar.
    expect(ruf?.kopf['content-type']).not.toBe('application/json')
  })

  test('OHNE Weg in der Tabelle wird der verbreitete Pfad genommen — sonst prüfte die Sonde nichts', async () => {
    const b = await macheBuehne()
    b.setze('/embeddings', 404)
    b.setze('/audio/speech', 404)
    b.setze('/chat/completions', 400)
    // DeepSeek nennt keinen Einbettungs-Weg. Die Sonde nimmt /embeddings — und findet 404.
    await pruefeWeg({ ...DEEPSEEK, basis: b.basis }, 'einbetten', {})
    expect(b.aufzeichnungen[0]?.pfad).toBe('/embeddings')
    expect(VERSUCHSPFAD.einbetten.pfad).toBe('/embeddings')
  })
})

// ---------------------------------------------------------------------------
// 4. Die ganze Familie
// ---------------------------------------------------------------------------

describe('Eine Familie sondieren', () => {
  test('der DeepSeek-Fall wird NACHGEMESSEN: nur Chat, alles andere fehlt', async () => {
    const b = await macheBuehne({
      '/models': { status: 200, koerper: JSON.stringify({ data: [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }] }) },
      '/chat/completions': { status: 400 },
      // Alles andere bleibt bei 404 — so wie der echte Dienst geantwortet hat.
    })
    const befund = await sonde({ ...DEEPSEEK, basis: b.basis }, { schluessel: SCHLUESSEL })

    expect(befund.modelleErreichbar).toBe(true)
    expect(befund.modelle).toEqual(['deepseek-flash', 'deepseek-v4-pro'])
    expect(befund.wege['entscheiden']).toBe('vorhanden')
    expect(befund.wege['gespraech']).toBe('vorhanden')
    // **Drei 404 — genau die Messung von Hand.**
    expect(befund.wege['einbetten']).toBe('fehlt')
    expect(befund.wege['text-zu-sprache']).toBe('fehlt')
    expect(befund.wege['sprache-zu-text']).toBe('fehlt')
    expect(befund.bemerkung).toContain('Als vorhanden erkannt')
    expect(befund.bemerkung).toContain('kostet deshalb nichts')
  })

  test('eine leere Modellliste wird als solche BENANNT, nicht als „kann nichts"', async () => {
    const b = await macheBuehne({
      '/models': { status: 200, koerper: JSON.stringify({ data: [] }) },
      '/chat/completions': { status: 400 },
    })
    const befund = await sonde({ ...OPENROUTER, basis: b.basis }, {})
    expect(befund.modelleErreichbar).toBe(true)
    expect(befund.modelle).toEqual([])
    expect(befund.bemerkung).toContain('LEEREN Liste')
  })

  test('eine unerreichbare Models-API verhindert die Wegprüfung NICHT', async () => {
    const b = await macheBuehne({ '/models': { status: 500 }, '/chat/completions': { status: 400 } })
    const befund = await sonde({ ...OPENROUTER, basis: b.basis }, {})
    expect(befund.modelleErreichbar).toBe(false)
    expect(befund.bemerkung).toContain('500')
    // Die Wege werden trotzdem geprüft — die eine Auskunft hängt nicht an der anderen.
    expect(befund.wege['entscheiden']).toBe('vorhanden')
  })

  test('die Sonde ruft NICHTS wirklich auf — kein 200 auf einem Fähigkeitsweg', async () => {
    const b = await macheBuehne({
      '/models': { status: 200, koerper: JSON.stringify({ data: [{ id: 'x' }] }) },
    })
    await sonde({ ...OPENROUTER, basis: b.basis }, { schluessel: SCHLUESSEL })
    // Jede Anfrage außer der Modellliste trägt den leeren Auftrag.
    const faehigkeitswege = b.aufzeichnungen.filter((a) => a.pfad !== '/models')
    expect(faehigkeitswege.length).toBeGreaterThan(0)
    for (const ruf of faehigkeitswege) {
      expect({ pfad: ruf.pfad, koerper: ruf.koerper === '{}' || String(ruf.typ).startsWith('multipart/') }).toEqual({
        pfad: ruf.pfad,
        koerper: true,
      })
    }
  })

  test('der Befund trägt KEINEN Schlüssel', async () => {
    const b = await macheBuehne({
      '/models': { status: 401, koerper: `{"error":"no auth for ${SCHLUESSEL}"}` },
    })
    const befund = await sonde({ ...OPENROUTER, basis: b.basis }, { schluessel: SCHLUESSEL })
    expect(JSON.stringify(befund)).not.toContain(SCHLUESSEL)
  })
})
