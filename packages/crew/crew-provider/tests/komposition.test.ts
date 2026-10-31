/**
 * Zusammensetzung: **alle** Fähigkeiten in einem Loop, für **einen** Nutzer.
 *
 * Das ist die Prüfung, die „installiert" belegen soll: nicht fünf Bausteine einzeln, sondern eine
 * Sitzung, in der ein Modell plant (Crew), im Netz sucht (direkter Weg, bezahlt), ein Bild liest
 * (modlens) — und in der jede Rolle bezahlt wird, auf dem Konto **dieses** Nutzers.
 *
 * Der Anbieter ist ein **Skript**, kein Modell: die Kette wird geprüft, nicht das Können eines
 * Modells. Kein Netz, kein Schlüssel, keine Kosten.
 */

import { describe, expect, test } from 'bun:test'

import { AgentLoop } from '@prometheus-harness/agent-loop'
import { Tools } from '@prometheus-harness/agent-tools'
import { CrewZustandSpeicher, projektbereich } from '@prometheus-harness/crew-plan'
import type { CompletionRequest, CompletionResult, LlmProvider } from '@prometheus-harness/llm'
import type { Tarifeintrag } from '@prometheus-harness/tariffs'
import { Verbrauchsspeicher } from '@prometheus-harness/usage-budget'
import { Aufzeichner, messenderAnbieter } from '@prometheus-harness/usage-recorder'
import { modlensWerkzeug } from '@prometheus-harness/modlens'
import { PREIS_JE_ANFRAGE_USD, suchWerkzeuge } from '@prometheus-harness/deepseek-search-tools'

import { crewAnbieter, crewWerkzeuge, type CrewDefinition } from '../src/index.ts'

const JETZT = new Date('2026-10-18T12:00:00.000Z')

/** Der Tarif aller Rollen: 0,15 / 0,60 USD je 1 Mio Token. */
const TARIFE: readonly Tarifeintrag[] = [{
  familie: 'deepseek-official',
  modell: 'deepseek-flash',
  preis: { hinein: 0.15, heraus: 0.6 },
  stand: '2026-10-15',
  quelle: 'Test',
  herkunft: 'tabelle',
}]

/** Eine Crew mit einem Executor. */
const CREW: CrewDefinition = {
  id: 'crew-1',
  rollen: { executor: { familie: 'deepseek-official', modell: 'deepseek-flash' } },
}

/** Eine Antwort der Search-API (eine Anfrage, ein Treffer → abrechenbar). */
const SUCHANTWORT = JSON.stringify({
  results: [{ title: 'Harness', url: 'https://example.com/h', snippet: 'x', summary: 'y', content: '' }],
})

/** Eine gültige Antwort der Bildbrücke. */
const BILDANTWORT = JSON.stringify({
  image: 'C:/bild.png',
  provider: 'openai',
  result: {
    summary: 'Ein Bild mit einem Schild.',
    ocr: { full_text: 'HALLO' },
    layout: { regions: [{ type: 'title', reading_order: 1, text: 'HALLO' }] },
    semantics: { scene: 'schild' },
    visual: {},
    uncertainty: [],
  },
  meta: { model: 'deepseek-flash', warnings: [] },
})

/** Ein Anbieter mit Skript: plant, sucht, liest ein Bild, antwortet. */
const skript = (): LlmProvider => {
  let ruf = 0
  return {
    name: 'deepseek-official',
    complete: async (request: CompletionRequest): Promise<CompletionResult> => {
      ruf += 1
      const antwort = (teil: Partial<CompletionResult>): CompletionResult => ({
        text: '',
        toolCalls: [],
        finishReason: 'stop',
        model: request.model,
        usage: { inputTokens: 100, outputTokens: 50 },
        ...teil,
      })
      if (ruf === 1) {
        return antwort({
          toolCalls: [{
            id: 'c1',
            name: 'crew_plan',
            arguments: { action: 'set', role: 'executor', goal: 'Bericht schreiben', goal_status: 'active' },
          }],
          finishReason: 'tool-calls',
        })
      }
      if (ruf === 2) {
        return antwort({
          toolCalls: [{ id: 'c2', name: 'tools_search', arguments: { query: 'deepseek harness', count: 3 } }],
          finishReason: 'tool-calls',
        })
      }
      if (ruf === 3) {
        return antwort({
          toolCalls: [{ id: 'c3', name: 'modlens_read_image', arguments: { path: 'C:/bild.png' } }],
          finishReason: 'tool-calls',
        })
      }
      return antwort({ text: 'Fertig: geplant, gesucht, gelesen.' })
    },
  }
}

describe('Eine Sitzung, alle Fähigkeiten', () => {
  test('planen, suchen, Bild lesen — und alles auf dem Konto eines Nutzers', async () => {
    const speicher = new Verbrauchsspeicher({ jetzt: () => JETZT })
    const zeichner = new Aufzeichner({ speicher, tarife: TARIFE, jetzt: () => JETZT })
    const plan = new CrewZustandSpeicher({ jetzt: () => JETZT })
    const bereich = projektbereich({ nutzer: 'anna', pfad: 'C:/projekt' })

    // **Der Haken**: jede Rolle des Loops wird gebucht.
    // **Eine** Instanz, nicht eine je Aufruf: ein neuer Skript-Anbieter je Aufruf beginnt wieder
    // bei Schritt 1 und meldet dieselbe Werkzeugkennung — der Loop weist den Verlauf dann zu Recht
    // als nicht zuordenbar ab (gemessen in dieser Pruefung).
    const antworter = skript()
    // **Die Reihenfolge der Hüllen ist bindend.** Der messende Anbieter liegt INNEN, um den echten
    // Anbieter der Rolle — nicht um die Crew-Hülle. Aussen gebucht, waere die Route `crew:crew-1`,
    // die kein Tarif kennt: vier Aufrufe, alle unbepreist. Genau dieses Doppelzaehlen entfernt der
    // Harness aus seinen Daten (`dropCrewShells`).
    const gemessen = crewAnbieter(CREW, {
      anbieter: () => messenderAnbieter(antworter, { aufzeichner: zeichner, nutzer: 'anna' }),
    })

    const hole = async (): Promise<{ status: number; text: string }> => ({ status: 200, text: SUCHANTWORT })
    const bildAusfuehren = async (): Promise<{ stdout: string; stderr: string; code: number }> =>
      ({ stdout: BILDANTWORT, stderr: '', code: 0 })

    const werkzeuge = new Tools([
      ...crewWerkzeuge({ crew: 'crew-1', bereich, aufrufer: 'executor', speicher: plan }),
      ...suchWerkzeuge({ apiKey: 'sk-TEST', hole }),
      modlensWerkzeug({ cliPfad: 'main.js', ausfuehren: bildAusfuehren }),
    ])

    const loop = new AgentLoop({ provider: gemessen, tools: werkzeuge, model: 'crew-1' })
    const ergebnisse: string[] = []
    const generator = loop.run('Bitte plane, suche und lies das Bild.')
    let schritt = await generator.next()
    while (!schritt.done) {
      if (schritt.value.type === 'tool-result') ergebnisse.push(schritt.value.content)
      schritt = await generator.next()
    }
    const turn = schritt.value

    // Der Turn endet sauber, in vier Schritten (drei Werkzeugrunden + Antwort).
    expect(turn.reason).toBe('stop')
    expect(turn.text).toBe('Fertig: geplant, gesucht, gelesen.')
    expect(turn.steps).toBe(4)
    expect(ergebnisse).toHaveLength(3)

    // Die Werkzeuge haben geliefert, was sie sollen.
    expect(ergebnisse[0]).toContain('Bericht schreiben')
    expect(JSON.parse(ergebnisse[1] ?? '{}').abrechenbar).toBe(true)
    expect(JSON.parse(ergebnisse[2] ?? '{}').evidenz.ocr.full_text).toBe('HALLO')

    // Der Plan liegt beim Nutzer.
    const zustand = await plan.lesen('crew-1', bereich)
    expect(zustand.nutzer).toBe('anna')
    expect(zustand.rollen.executor?.ziel?.text).toBe('Bericht schreiben')

    // Vier Modellaufrufe à 100/50 Token sind gebucht — 4 × (100 × 0,15 + 50 × 0,60) / 1e6
    const konto = await zeichner.konto('anna')
    expect(konto.zeilen).toBe(4)
    expect(konto.uebersicht.token).toEqual({ hinein: 400, heraus: 200 })
    expect(konto.stand.gesamt.kostenUsd).toBe(0.00018)
    expect(konto.stand.schluessel[0]?.name).toBe('DEEPSEEK_API_KEY')

    // Die Suche meldet ihren Preis selbst — er steht im Werkzeugergebnis, nicht im Konto.
    expect(JSON.parse(ergebnisse[1] ?? '{}').kostenUsd).toBe(PREIS_JE_ANFRAGE_USD)
  })

  test('ein zweiter Nutzer sieht nichts vom ersten', async () => {
    const speicher = new Verbrauchsspeicher({ jetzt: () => JETZT })
    const zeichner = new Aufzeichner({ speicher, tarife: TARIFE, jetzt: () => JETZT })
    const gemessen = crewAnbieter(CREW, {
      anbieter: () => messenderAnbieter(skript(), { aufzeichner: zeichner, nutzer: 'bernd' }),
    })
    const loop = new AgentLoop({
      provider: gemessen,
      tools: new Tools(crewWerkzeuge({
        crew: 'crew-1',
        bereich: projektbereich({ nutzer: 'bernd', pfad: 'C:/projekt' }),
        aufrufer: 'executor',
        speicher: new CrewZustandSpeicher({ jetzt: () => JETZT }),
      })),
      model: 'crew-1',
    })
    const generator = loop.run('Bitte plane das.')
    let schritt = await generator.next()
    while (!schritt.done) schritt = await generator.next()

    expect((await zeichner.konto('anna')).zeilen).toBe(0)
    expect((await zeichner.konto('bernd')).zeilen).toBeGreaterThan(0)
  })
})
