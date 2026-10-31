/**
 * Prüfungen für den Eval: Zählung, Mehrheit, Abbruchkriterium, Richter.
 *
 * **Was hier belegt wird.** Dass der Eval rechnet und nicht schätzt; dass die Mehrheit normalisiert;
 * dass das Abbruchkriterium **hart** ist (gleiche Kosten, doppelter Standardfehler) und dass ein
 * Richter ohne JSON nicht als Zustimmung durchgeht.
 *
 * **Was hier NICHT geprüft wird.** Ob der Rat tatsächlich besser ist. Das ist der Lauf, nicht der
 * Test — und er braucht einen erreichbaren LLM-Endpunkt.
 */
import { describe, expect, test } from 'bun:test'

import type { CompletionRequest, CompletionResult, LlmProvider } from '@prometheus-harness/llm'

import {
  EVAL_AUFGABEN,
  EVAL_KATEGORIEN,
  armSampling,
  bewerteMitRichter,
  fuehreEval,
  mehrheit,
  pruefeKriterium,
  type ArmErgebnis,
  type EvalAufgabe,
} from '../src/index.ts'

/** Ein Anbieter, der jede Anfrage beantwortet und mitschreibt. */
const anbieter = (antwort: string): LlmProvider & { anfragen: CompletionRequest[] } => {
  const anfragen: CompletionRequest[] = []
  return {
    name: 'test',
    anfragen,
    complete: async (request): Promise<CompletionResult> => {
      anfragen.push(request)
      return {
        text: antwort,
        toolCalls: [],
        finishReason: 'stop',
        model: request.model,
        usage: { inputTokens: 100, outputTokens: 50 },
      }
    },
  }
}

/** Ein Arm-Ergebnis mit gegebener Pass-Rate und Kosten. */
function arm(name: string, passRate: number, usd: number, anzahl = 24): ArmErgebnis {
  return {
    arm: name,
    aufgaben: Array.from({ length: anzahl }, (_, index) => ({
      id: `a${String(index)}`,
      pass: index < Math.round(passRate * anzahl),
      begruendung: '',
      usd: usd / anzahl,
    })),
    passRate,
    usd,
    dauerMs: 0,
  }
}

describe('Der Eval', () => {
  test('die 24 Aufgaben sind vollständig und eindeutig', () => {
    expect(EVAL_AUFGABEN).toHaveLength(24)
    for (const kategorie of EVAL_KATEGORIEN) {
      expect(EVAL_AUFGABEN.filter((aufgabe) => aufgabe.kategorie === kategorie)).toHaveLength(6)
    }
    expect(new Set(EVAL_AUFGABEN.map((aufgabe) => aufgabe.id)).size).toBe(24)
    for (const aufgabe of EVAL_AUFGABEN) {
      expect(aufgabe.rubric.length).toBeGreaterThan(20)
      expect(aufgabe.auftrag.length).toBeGreaterThan(20)
    }
  })

  test('fuehreEval zählt Pass-Rate und Kosten', async () => {
    const aufgaben: EvalAufgabe[] = EVAL_AUFGABEN.slice(0, 2)
    const ergebnis = await fuehreEval(
      'A',
      aufgaben,
      async () => ({ antwort: 'antwort', usd: 0.01 }),
      async (_aufgabe, antwort) => ({ pass: antwort === 'antwort', begruendung: '' }),
    )
    expect(ergebnis.passRate).toBe(1)
    expect(ergebnis.usd).toBeCloseTo(0.02, 6)
    expect(ergebnis.aufgaben).toHaveLength(2)
  })

  test('mehrheit normalisiert Leerzeichen und Groß-/Kleinschreibung', () => {
    expect(mehrheit(['Ja', ' ja ', 'NEIN'])).toBe('Ja')
    expect(mehrheit(['a', 'b'])).toBe('a')
    expect(mehrheit([])).toBe('')
  })

  test('das Abbruchkriterium ist hart: C muss D bei gleichen Kosten deutlich schlagen', () => {
    // 80 % gegen 50 % bei 24 Aufgaben: Differenz 0,30 > Schwelle 0,26.
    const urteil = pruefeKriterium(arm('C', 0.8, 1.0), arm('D', 0.5, 1.0))
    expect(urteil.gerechtfertigt).toBe(true)
    expect(urteil.begruendung).toContain('schlägt')

    // **Der unangenehme Befund**: 75 % gegen 50 % reicht bei 24 Aufgaben nicht.
    // Differenz 0,25, Schwelle 0,27 — der Unterschied könnte Zufall sein.
    expect(pruefeKriterium(arm('C', 0.75, 1.0), arm('D', 0.5, 1.0)).gerechtfertigt).toBe(false)

    // Gleiche Leistung → nicht gerechtfertigt, egal wie gut die Formulierung klingt.
    expect(pruefeKriterium(arm('C', 0.5, 1.0), arm('D', 0.5, 1.0)).gerechtfertigt).toBe(false)

    // Doppelt so teuer → nicht gerechtfertigt, selbst bei besserer Leistung.
    expect(pruefeKriterium(arm('C', 0.9, 2.0), arm('D', 0.5, 1.0)).gerechtfertigt).toBe(false)
  })

  test('der Richter wertet fehlendes JSON nicht als Bestehen', async () => {
    const bewerten = bewerteMitRichter(anbieter('Ich finde das gut.'), 'modell', { hinein: 1, heraus: 2 })
    const urteil = await bewerten(EVAL_AUFGABEN[0]!, 'antwort')
    expect(urteil.pass).toBe(false)
    expect(urteil.begruendung).toContain('kein JSON')
  })

  test('der Richter liest ein JSON-Urteil', async () => {
    const bewerten = bewerteMitRichter(
      anbieter('{"pass":true,"begruendung":"erfuellt"}'),
      'modell',
      { hinein: 1, heraus: 2 },
    )
    const urteil = await bewerten(EVAL_AUFGABEN[0]!, 'antwort')
    expect(urteil.pass).toBe(true)
    expect(urteil.begruendung).toBe('erfuellt')
  })

  test('armSampling ruft fünfmal und entscheidet per Mehrheit', async () => {
    const fake = anbieter('gleich')
    const beantworte = armSampling(fake, 'modell', { hinein: 1, heraus: 1 }, 5)
    const ergebnis = await beantworte(EVAL_AUFGABEN[0]!)
    expect(fake.anfragen).toHaveLength(5)
    expect(ergebnis.antwort).toBe('gleich')
    // 5 × (100/1000 × 1 + 50/1000 × 1) = 0,75
    expect(ergebnis.usd).toBeCloseTo(0.75, 6)
  })
})
