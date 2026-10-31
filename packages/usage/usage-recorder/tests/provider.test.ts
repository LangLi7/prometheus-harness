/**
 * Der messende Anbieter: eine Hülle um den Seam, die bucht, was der Aufruf gekostet hat.
 *
 * Festgenagelt wird: **die Token kommen aus der Antwort** (nicht aus einer Schätzung), **eine
 * Antwort ohne Token wird nicht gebucht und nicht verschwiegen**, und **ein Buchungsfehler
 * verhindert die Antwort nicht** — er wird gemeldet.
 */

import { describe, expect, test } from 'bun:test'

import type { CompletionRequest, CompletionResult, LlmProvider } from '@prometheus-harness/llm'
import { Verbrauchsspeicher } from '@prometheus-harness/usage-budget'
import type { Tarifeintrag } from '@prometheus-harness/tariffs'

import { Aufzeichner, messenderAnbieter } from '../src/index.ts'

const JETZT = new Date('2026-10-18T12:00:00.000Z')

/** Der Tarif: 0,15 / 0,60 USD je 1 Mio Token. */
const TARIFE: readonly Tarifeintrag[] = [{
  familie: 'deepseek-official',
  modell: 'deepseek-flash',
  preis: { hinein: 0.15, heraus: 0.6 },
  stand: '2026-10-15',
  quelle: 'Test',
  herkunft: 'tabelle',
}]

/** Eine Anfrage. */
const anfrage: CompletionRequest = { model: 'deepseek-flash', messages: [] }

/** Ein Anbieter, der eine feste Antwort liefert. */
const anbieterMit = (antwort: CompletionResult, name = 'deepseek-official'): LlmProvider => ({
  name,
  complete: async () => antwort,
})

/** Ein Aufzeichner im Arbeitsspeicher. */
const aufzeichner = (): Aufzeichner =>
  new Aufzeichner({ speicher: new Verbrauchsspeicher({ jetzt: () => JETZT }), tarife: TARIFE, jetzt: () => JETZT })

/** Eine Antwort mit Token. */
const antwort = (teil: Partial<CompletionResult> = {}): CompletionResult => ({
  text: 'Antwort',
  toolCalls: [],
  finishReason: 'stop',
  model: 'deepseek-flash',
  usage: { inputTokens: 1_200, outputTokens: 300 },
  ...teil,
})

/** Eine Antwort **ohne** Token — der Anbieter meldet sie nicht. */
const ohneToken = (): CompletionResult => ({
  text: 'Antwort',
  toolCalls: [],
  finishReason: 'stop',
  model: 'deepseek-flash',
})

describe('Messender Anbieter', () => {
  test('der Vertrag bleibt derselbe, der Name sagt die Hülle', async () => {
    const zeichner = aufzeichner()
    const umhuellt = messenderAnbieter(anbieterMit(antwort()), { aufzeichner: zeichner, nutzer: 'anna' })
    expect(umhuellt.name).toBe('deepseek-official+messend')
    const ergebnis = await umhuellt.complete(anfrage)
    expect(ergebnis.text).toBe('Antwort')
  })

  test('die Token aus der Antwort werden gepreist und gebucht', async () => {
    const zeichner = aufzeichner()
    const umhuellt = messenderAnbieter(anbieterMit(antwort()), { aufzeichner: zeichner, nutzer: 'anna' })
    await umhuellt.complete(anfrage)
    const konto = await zeichner.konto('anna')
    expect(konto.zeilen).toBe(1)
    expect(konto.uebersicht.token).toEqual({ hinein: 1_200, heraus: 300 })
    // 1200 × 0,15 / 1e6 + 300 × 0,60 / 1e6 = 0,00036
    expect(konto.stand.gesamt.kostenUsd).toBe(0.00036)
    expect(konto.stand.schluessel[0]?.name).toBe('DEEPSEEK_API_KEY')
  })

  test('die Route läßt sich überschreiben — etwa für eine Crew-Hülle', async () => {
    const zeichner = aufzeichner()
    const umhuellt = messenderAnbieter(anbieterMit(antwort()), {
      aufzeichner: zeichner,
      nutzer: 'anna',
      familie: 'deepseek-official',
      zweck: 'crew',
    })
    await umhuellt.complete(anfrage)
    const konto = await zeichner.konto('anna')
    expect(konto.zeilen).toBe(1)
  })

  test('das Modell der Antwort zählt, nicht das der Anfrage', async () => {
    const zeichner = aufzeichner()
    const umhuellt = messenderAnbieter(anbieterMit(antwort({ model: 'deepseek-v4-pro' })), {
      aufzeichner: zeichner,
      nutzer: 'anna',
    })
    await umhuellt.complete(anfrage)
    const konto = await zeichner.konto('anna')
    expect(konto.stand.modelle[0]?.name).toBe('deepseek-official/deepseek-v4-pro')
  })

  test('ohne Token wird nicht gebucht — und nicht geschwiegen', async () => {
    const zeichner = aufzeichner()
    const meldungen: unknown[] = []
    const umhuellt = messenderAnbieter(anbieterMit(ohneToken()), {
      aufzeichner: zeichner,
      nutzer: 'anna',
      melde: (fehler) => meldungen.push(fehler),
    })
    const ergebnis = await umhuellt.complete(anfrage)
    expect(ergebnis.text).toBe('Antwort')
    expect((await zeichner.konto('anna')).zeilen).toBe(0)
    expect(meldungen).toHaveLength(1)
    expect(String(meldungen[0])).toContain('keine Token')
  })

  test('ein Buchungsfehler verhindert die Antwort nicht, wird aber gemeldet', async () => {
    const zeichner = aufzeichner()
    const kaputt: Aufzeichner = Object.create(zeichner) as Aufzeichner
    kaputt.verbuchen = async () => {
      throw new Error('Platte voll')
    }
    const meldungen: unknown[] = []
    const umhuellt = messenderAnbieter(anbieterMit(antwort()), {
      aufzeichner: kaputt,
      nutzer: 'anna',
      melde: (fehler) => meldungen.push(fehler),
    })
    const ergebnis = await umhuellt.complete(anfrage)
    expect(ergebnis.text).toBe('Antwort')
    expect(String(meldungen[0])).toContain('Platte voll')
  })

  test('eine Hülle ohne Nutzer wird abgewiesen', () => {
    expect(() => messenderAnbieter(anbieterMit(antwort()), { aufzeichner: aufzeichner(), nutzer: ' ' }))
      .toThrow(/ohne Nutzer/)
  })

  test('ein Fehler des Anbieters wird durchgereicht, nicht verbucht', async () => {
    const zeichner = aufzeichner()
    const scheiternd: LlmProvider = {
      name: 'deepseek-official',
      complete: async () => {
        throw new Error('Anbieter nicht erreichbar')
      },
    }
    const umhuellt = messenderAnbieter(scheiternd, { aufzeichner: zeichner, nutzer: 'anna' })
    await expect(umhuellt.complete(anfrage)).rejects.toThrow(/nicht erreichbar/)
    expect((await zeichner.konto('anna')).zeilen).toBe(0)
  })
})
