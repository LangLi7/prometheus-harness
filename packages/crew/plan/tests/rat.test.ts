/**
 * Prüfungen für den Rat im Ausführungsweg.
 *
 * **Was hier belegt wird.** Dass der alte Weg ohne Rat unverändert läuft, dass mit Rat alle
 * Personas gerufen werden, dass der Richter entscheidet, dass eine unlesbare Persona-Antwort
 * nicht als Zustimmung durchgeht und dass ein gesetzter Rat ohne `rufePersona` fail-closed ist.
 *
 * **Was hier NICHT geprüft wird.** Ob der Rat bessere Ergebnisse liefert. Das ist keine
 * Eigenschaft des Codes — das misst der Eval.
 */
import { describe, expect, test } from 'bun:test'

import { fuehreAus, type Ausfuehrung } from '../src/plan.ts'

const PLAN = [{ id: 't1', auftrag: 'schreibe', abhaengigVon: [], rolle: 'executor' as const }]

/** Ein Lauf, bei dem der Prüfer zustimmt — der alte Weg. */
function ohneRat(ueber: Partial<Ausfuehrung> = {}): Ausfuehrung {
  return {
    crew: 'c',
    ziel: 'z',
    plan: PLAN,
    rufe: async (rolle) => ({
      text: rolle === 'reviewer' ? 'pass' : 'ergebnis',
      tokens: { hinein: 1, heraus: 1 },
    }),
    ...ueber,
  }
}

/** Eine Persona, die zustimmt. */
function zustimmendePersona() {
  return async () => ({
    text: JSON.stringify({ beanstandungen: [], urteil: 'pass', begruendung: 'traegt' }),
    tokens: { hinein: 2, heraus: 2 },
  })
}

describe('Rat im Ausführungsweg', () => {
  test('ohne Rat läuft der alte Weg unverändert', async () => {
    // Die wichtigste Prüfung: Ein Lauf, der heute funktioniert, funktioniert weiter.
    const lauf = await fuehreAus(ohneRat())
    expect(lauf.urteil).toBe('pass')
    expect(lauf.rat).toEqual([])
    expect(lauf.richter).toBeNull()
    expect(lauf.versuche).toBe(1)
  })

  test('mit Rat prüfen alle Personas, der Richter entscheidet', async () => {
    const gerufen: string[] = []
    const lauf = await fuehreAus(ohneRat({
      rat: ['grabstein', 'finanz'],
      rubric: 'Belege jede Zahl.',
      rufePersona: async (persona, auftrag, system) => {
        gerufen.push(persona)
        // Der Prompt muss ankommen — sonst prüft die Persona ohne ihren Auftrag.
        expect(system).toContain('KEINE DIAGNOSE')
        expect(auftrag).toContain('Belege jede Zahl.')
        return { text: JSON.stringify({ beanstandungen: [], urteil: 'pass', begruendung: 'ok' }), tokens: { hinein: 2, heraus: 2 } }
      },
      rufe: async (rolle) => ({
        text: rolle === 'reviewer'
          ? JSON.stringify({ urteil: 'pass', begruendung: 'alle einig', maengel: [] })
          : 'ergebnis',
        tokens: { hinein: 1, heraus: 1 },
      }),
    }))
    expect(gerufen).toEqual(['grabstein', 'finanz'])
    expect(lauf.urteil).toBe('pass')
    expect(lauf.richter).toEqual({ urteil: 'pass', begruendung: 'alle einig' })
    expect(lauf.rat.map((s) => s.persona)).toEqual(['grabstein', 'finanz'])
    // Token: 2 Personas × 2 + Richter 1 + Schritt 1
    expect(lauf.tokens.hinein).toBe(6)
  })

  test('ein „revise" des Richters beendet den Lauf nicht mit pass', async () => {
    const lauf = await fuehreAus(ohneRat({
      maxVersuche: 2,
      rat: ['kritiker'],
      rufePersona: zustimmendePersona(),
      rufe: async (rolle) => ({
        text: rolle === 'reviewer'
          ? JSON.stringify({ urteil: 'revise', begruendung: 'zu duenn', maengel: ['Zahl belegen'] })
          : 'ergebnis',
        tokens: { hinein: 1, heraus: 1 },
      }),
    }))
    expect(lauf.urteil).toBe('fail')
    expect(lauf.versuche).toBe(2)
    expect(lauf.maengel).toEqual(['Zahl belegen'])
    expect(lauf.richter?.urteil).toBe('revise')
  })

  test('eine unlesbare Persona-Antwort ist keine Zustimmung', async () => {
    const lauf = await fuehreAus(ohneRat({
      maxVersuche: 1,
      rat: ['praezision'],
      // Absichtlich kein JSON: Die Persona hat nicht geprüft.
      rufePersona: async () => ({ text: 'Ich finde das gut.', tokens: { hinein: 1, heraus: 1 } }),
      rufe: async (rolle) => ({
        text: rolle === 'reviewer'
          ? JSON.stringify({ urteil: 'revise', begruendung: 'nicht auswertbar', maengel: ['Antwort war kein JSON'] })
          : 'ergebnis',
        tokens: { hinein: 1, heraus: 1 },
      }),
    }))
    const sitzung = lauf.rat[0]
    expect(sitzung?.urteil).toBe('revise')
    expect(sitzung?.beanstandungen[0]?.schwere).toBe('wichtig')
    expect(sitzung?.beanstandungen[0]?.befund).toContain('kein JSON')
    expect(lauf.urteil).toBe('fail')
  })

  test('ein Rat ohne rufePersona ist fail-closed', async () => {
    await expect(fuehreAus(ohneRat({ rat: ['butler'] }))).rejects.toThrow(/rufePersona/)
  })

  test('ohne Richter entscheidet der Rat selbst — nur einstimmig pass', async () => {
    const einstimmig = await fuehreAus(ohneRat({
      rat: ['sprinter', 'praezision'],
      richter: null,
      rufePersona: zustimmendePersona(),
    }))
    expect(einstimmig.urteil).toBe('pass')
    expect(einstimmig.richter).toBeNull()

    const uneinig = await fuehreAus(ohneRat({
      maxVersuche: 1,
      rat: ['sprinter', 'grabstein'],
      richter: null,
      rufePersona: async () => ({
        text: JSON.stringify({
          beanstandungen: [{ fundstelle: 'Abschnitt 2', befund: 'Zahl fehlt', beleg: 'keine Quelle', schwere: 'blocker' }],
          urteil: 'fail',
          begruendung: 'nicht belegt',
        }),
        tokens: { hinein: 1, heraus: 1 },
      }),
    }))
    expect(uneinig.urteil).toBe('fail')
    expect(uneinig.maengel[0]).toContain('Zahl fehlt')
  })
})
