/**
 * Zusammensetzung: ein Crew-Lauf, dessen Rollen **gebucht** werden.
 *
 * Der Beleg, um den es geht: die beiden Einheiten sind nicht nur einzeln grün, sondern **zusammen**
 * wirksam. `crewLauf` schickt die Schritte an ihre Rollen, `messenderAnbieter` hängt davor und
 * bucht, was jede Rolle verbraucht hat — je Nutzer, je Schlüssel, je Modell. Das ist der Satz
 * „Kosten je Crew-Lauf je Nutzer", den vorher keine der beiden Hälften sagen konnte.
 */

import { describe, expect, test } from 'bun:test'

import type { CompletionRequest, CompletionResult, LlmProvider } from '@prometheus-harness/llm'
import type { Tarifeintrag } from '@prometheus-harness/tariffs'
import { Verbrauchsspeicher } from '@prometheus-harness/usage-budget'
import { Aufzeichner, messenderAnbieter } from '@prometheus-harness/usage-recorder'

import { crewLauf, type CrewDefinition } from '../src/index.ts'

const JETZT = new Date('2026-10-18T12:00:00.000Z')

/** Tarife für beide Modelle der Crew. */
const TARIFE: readonly Tarifeintrag[] = [
  {
    familie: 'deepseek-official',
    modell: 'deepseek-flash',
    preis: { hinein: 0.15, heraus: 0.6 },
    stand: '2026-10-15',
    quelle: 'Test',
    herkunft: 'tabelle',
  },
  {
    familie: 'deepseek-official',
    modell: 'deepseek-v4-pro',
    preis: { hinein: 0.66, heraus: 1.98 },
    stand: '2026-10-15',
    quelle: 'Test',
    herkunft: 'tabelle',
  },
]

/** Eine Crew: billiger Executor, teurer Planer. */
const CREW: CrewDefinition = {
  id: 'crew-1',
  rollen: {
    planner: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
    executor: { familie: 'deepseek-official', modell: 'deepseek-flash' },
    reviewer: { familie: 'deepseek-official', modell: 'deepseek-v4-pro' },
  },
}

/** Ein Anbieter, der feste Token meldet. */
const anbieter = (text: string, token: { hinein: number; heraus: number }): LlmProvider => ({
  name: 'deepseek-official',
  complete: async (request: CompletionRequest): Promise<CompletionResult> => ({
    text,
    toolCalls: [],
    finishReason: 'stop',
    model: request.model,
    usage: { inputTokens: token.hinein, outputTokens: token.heraus },
  }),
})

/** Text einer Anfrage — damit der Anbieter Plan und Prüfung unterscheiden kann. */
const anfrageText = (request: CompletionRequest): string =>
  request.messages.map((message) => message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')).join('\n')

describe('Crew-Lauf mit Buchung', () => {
  test('was die Rollen verbrauchen, steht danach im Konto des Nutzers', async () => {
    const speicher = new Verbrauchsspeicher({ jetzt: () => JETZT })
    const zeichner = new Aufzeichner({ speicher, tarife: TARIFE, jetzt: () => JETZT })

    // Ein Anbieter, der Plan, Arbeit und Prüfung bedient — und dabei Token meldet.
    const rolle: LlmProvider = {
      name: 'deepseek-official',
      complete: async (request: CompletionRequest): Promise<CompletionResult> => {
        const text = anfrageText(request)
        const antwort = text.includes('Pruefe')
          ? '{"pass":true}'
          : JSON.stringify([{ id: 'a', instruction: 'arbeiten' }])
        return {
          text: antwort,
          toolCalls: [],
          finishReason: 'stop',
          model: request.model,
          usage: { inputTokens: 1_000, outputTokens: 500 },
        }
      },
    }
    // **Der Haken vor dem Seam**: jede Rolle wird gebucht.
    const gemessen = messenderAnbieter(rolle, { aufzeichner: zeichner, nutzer: 'anna' })

    const ergebnis = await crewLauf({
      crew: CREW,
      anbieter: () => gemessen,
      ziel: 'Bericht',
      planerAntwort: JSON.stringify([{ id: 'a', instruction: 'arbeiten' }]),
      pruefer: 'reviewer',
    })
    expect(ergebnis.lauf.urteil).toBe('pass')

    const konto = await zeichner.konto('anna')
    // Ein Schritt + Prüfung = 2 Aufrufe (der Plan kam herein; die Prüfung läuft am Reviewer).
    expect(konto.zeilen).toBe(2)
    expect(konto.uebersicht.token).toEqual({ hinein: 2_000, heraus: 1_000 })
    // Schritt am Executor: (1000 × 0,15 + 500 × 0,60) / 1e6 = 0,00045
    // Prüfung am Reviewer: (1000 × 0,66 + 500 × 1,98) / 1e6 = 0,00165
    expect(konto.stand.gesamt.kostenUsd).toBe(0.0021)
    expect(konto.stand.schluessel[0]?.name).toBe('DEEPSEEK_API_KEY')
  })

  test('der Planer wird teurer gebucht als der Executor — die Rolle zählt, nicht das Modell im Namen', async () => {
    const speicher = new Verbrauchsspeicher({ jetzt: () => JETZT })
    const zeichner = new Aufzeichner({ speicher, tarife: TARIFE, jetzt: () => JETZT })
    const rolle = anbieter('{"pass":true}', { hinein: 1_000, heraus: 1_000 })
    const gemessen = messenderAnbieter(rolle, { aufzeichner: zeichner, nutzer: 'bernd' })

    await crewLauf({
      crew: CREW,
      anbieter: () => gemessen,
      ziel: 'Bericht',
      planerAntwort: JSON.stringify([{ id: 'a', instruction: 'tun' }]),
      pruefer: null,
    })
    // Plan kam herein, ein Schritt am Executor; der Prüfer ist `null`.
    const konto = await zeichner.konto('bernd')
    expect(konto.zeilen).toBe(1)
    expect(konto.stand.modelle[0]?.name).toBe('deepseek-official/deepseek-flash')
    expect(konto.stand.gesamt.kostenUsd).toBe(0.00075)
  })

  test('ohne Token im Ergebnis bleibt das Konto leer — mit einer Meldung', async () => {
    const speicher = new Verbrauchsspeicher({ jetzt: () => JETZT })
    const zeichner = new Aufzeichner({ speicher, tarife: TARIFE, jetzt: () => JETZT })
    const ohneToken: LlmProvider = {
      name: 'deepseek-official',
      complete: async (): Promise<CompletionResult> => ({
        text: '{"pass":true}',
        toolCalls: [],
        finishReason: 'stop',
        model: '',
      }),
    }
    const meldungen: unknown[] = []
    const gemessen = messenderAnbieter(ohneToken, {
      aufzeichner: zeichner,
      nutzer: 'carla',
      melde: (fehler) => meldungen.push(fehler),
    })
    await crewLauf({
      crew: CREW,
      anbieter: () => gemessen,
      ziel: 'X',
      planerAntwort: JSON.stringify([{ id: 'a', instruction: 'tun' }]),
      pruefer: null,
    })
    expect((await zeichner.konto('carla')).zeilen).toBe(0)
    expect(meldungen.length).toBeGreaterThan(0)
  })

  test('zwei Nutzer, zwei Crew-Läufe, zwei getrennte Konten', async () => {
    const speicher = new Verbrauchsspeicher({ jetzt: () => JETZT })
    const zeichner = new Aufzeichner({ speicher, tarife: TARIFE, jetzt: () => JETZT })
    const rolle = anbieter('{"pass":true}', { hinein: 100, heraus: 50 })
    const plan = JSON.stringify([{ id: 'a', instruction: 'tun' }])

    for (const nutzer of ['anna', 'bernd']) {
      await crewLauf({
        crew: CREW,
        anbieter: () => messenderAnbieter(rolle, { aufzeichner: zeichner, nutzer }),
        ziel: 'X',
        planerAntwort: plan,
        pruefer: null,
      })
    }
    expect((await zeichner.konto('anna')).zeilen).toBe(1)
    expect((await zeichner.konto('bernd')).zeilen).toBe(1)
  })
})
