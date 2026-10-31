/**
 * Die Preis-Lesung: aus einer Models-API-Antwort werden Tarife.
 *
 * Die Tests nageln fest, was **gemessen** ist (OpenRouter liefert `pricing.prompt` als
 * **Zeichenkette**, je einzelnem Token) und was **nicht** als Preis gelten darf: ein halber Preis,
 * ein fehlendes Feld, ein Text. Jeder dieser Fälle hat einen eigenen Test, weil jeder davon in der
 * Rangliste zu einem falsch einsortierten Modell führen würde.
 */

import { describe, expect, test } from 'bun:test'

import type { Familie } from '../src/families.ts'
import { frageModelle, frageModelleMitPreis, VerzeichnisFehler, type Abruf } from '../src/probe.ts'

/** Eine Attrappe der Familie — nur die Felder, die die Models-API braucht. */
function familie(): Familie {
  return {
    id: 'test',
    name: 'Test',
    basis: 'https://test.invalid/v1',
    kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
    modellWeg: '/models',
    wege: {},
    stand: 'Test',
  }
}

/** Ein Netzzugriff, der eine feste Antwort gibt — ohne Netz. */
function antwortMit(koerper: unknown, status = 200): Abruf {
  return async () => new Response(JSON.stringify(koerper), { status })
}

describe('Preise lesen', () => {
  test('Preise als Zeichenkette werden je Token gelesen und auf 1 Mio Token gerechnet', async () => {
    // Genau die Form, die OpenRouter liefert.
    const abruf = antwortMit({
      data: [{ id: 'google/gemini-3.8-flash-tts', pricing: { prompt: '0.0000005', completion: '0.000009' } }],
    })

    const modelle = await frageModelleMitPreis(familie(), { abruf })
    expect(modelle.length).toBe(1)
    expect(modelle[0]?.kennung).toBe('google/gemini-3.8-flash-tts')
    expect(modelle[0]?.preis).toEqual({ hinein: 0.5, heraus: 9 })
  })

  test('Preise als Zahl werden ebenso gelesen', async () => {
    const abruf = antwortMit({ data: [{ id: 'a', pricing: { prompt: 0.000002, completion: 0.000012 } }] })
    const modelle = await frageModelleMitPreis(familie(), { abruf })
    expect(modelle[0]?.preis).toEqual({ hinein: 2, heraus: 12 })
  })

  test('ein Preis von null ergibt einen Preis, nicht „unbekannt"', async () => {
    const abruf = antwortMit({ data: [{ id: 'gratis', pricing: { prompt: '0', completion: '0' } }] })
    const modelle = await frageModelleMitPreis(familie(), { abruf })
    expect(modelle[0]?.preis).toEqual({ hinein: 0, heraus: 0 })
  })

  test('ohne Preisfeld bleibt der Preis weg — nicht null', async () => {
    // **Das ist der Unterschied, an dem die Rangliste hängt.** Ein `preis: {0,0}` würde das Modell
    // als „kostenlos" ausgeben; „kein Preis" heißt unbekannt.
    const abruf = antwortMit({ data: [{ id: 'ohne' }] })
    const modelle = await frageModelleMitPreis(familie(), { abruf })
    expect(modelle[0]?.kennung).toBe('ohne')
    expect(modelle[0]?.preis).toBeUndefined()
    expect('preis' in (modelle[0] as object)).toBe(false)
  })

  test('ein HALBER Preis gilt als kein Preis', async () => {
    // Nur `prompt` genannt: die Frage „was kostet das" ist damit offen, nicht halb beantwortet.
    const abruf = antwortMit({ data: [{ id: 'halb', pricing: { prompt: '0.000001' } }] })
    const modelle = await frageModelleMitPreis(familie(), { abruf })
    expect(modelle[0]?.preis).toBeUndefined()
  })

  test('unlesbare Preise gelten als kein Preis', async () => {
    const abruf = antwortMit({
      data: [
        { id: 'text', pricing: { prompt: 'kostenlos', completion: '0' } },
        { id: 'leer', pricing: { prompt: '', completion: '' } },
        { id: 'keinobjekt', pricing: 'ja' },
        { id: 'null', pricing: null },
      ],
    })
    const modelle = await frageModelleMitPreis(familie(), { abruf })
    expect(modelle.map((m) => m.kennung)).toEqual(['text', 'leer', 'keinobjekt', 'null'])
    expect(modelle.every((m) => m.preis === undefined)).toBe(true)
  })

  test('Einträge ohne brauchbare Kennung werden übersprungen', async () => {
    const abruf = antwortMit({
      data: [
        { id: 'gut' },
        { id: '' },
        { id: 42 },
        null,
        'text',
        { ohneId: true },
      ],
    })
    const modelle = await frageModelleMitPreis(familie(), { abruf })
    expect(modelle.map((m) => m.kennung)).toEqual(['gut'])
  })
})

describe('Die alte Fläche bleibt unverändert', () => {
  test('frageModelle liefert weiterhin nur die Kennungen', async () => {
    const abruf = antwortMit({ data: [{ id: 'a', pricing: { prompt: '0.000001', completion: '0.000001' } }, { id: 'b' }] })
    expect(await frageModelle(familie(), { abruf })).toEqual(['a', 'b'])
  })

  test('ein 404 wirft — dieselbe Meldung wie vorher', async () => {
    const abruf: Abruf = async () => new Response('nope', { status: 404 })
    await expect(frageModelleMitPreis(familie(), { abruf })).rejects.toThrow(VerzeichnisFehler)
    await expect(frageModelleMitPreis(familie(), { abruf })).rejects.toThrow('404')
  })

  test('eine Antwort ohne `data`-Liste wirft, statt leer zu sein', async () => {
    // **Kein Raten.** Ein anderes Feldname dürfte nicht als „kann nichts" gelesen werden.
    const abruf = antwortMit({ models: [{ id: 'a' }] })
    await expect(frageModelleMitPreis(familie(), { abruf })).rejects.toThrow('kein Feld')
  })

  test('kein JSON wirft', async () => {
    const abruf: Abruf = async () => new Response('<html>', { status: 200 })
    await expect(frageModelleMitPreis(familie(), { abruf })).rejects.toThrow('kein JSON')
  })
})
