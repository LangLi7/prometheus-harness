/**
 * Prüfungen für den Jev-Richter.
 *
 * **Was hier belegt wird.** Dass aus einer Wahrscheinlichkeit ein Urteil wird, dass das
 * Unsicherheitsband **nicht** als Bestehen durchgeht, dass ein unbrauchbarer Wert (NaN) kein
 * Bestehen ist und dass die Schwelle vor dem Lauf festliegt.
 */
import { describe, expect, test } from 'bun:test'

import { EVAL_AUFGABEN, bewerteMitJev, festerJevClient } from '../src/index.ts'

const AUFGABE = EVAL_AUFGABEN[0]!

describe('Jev als Richter', () => {
  test('p über der Schwelle besteht, p darunter nicht', async () => {
    const sicher = bewerteMitJev(festerJevClient(0.9))
    expect((await sicher(AUFGABE, 'antwort')).pass).toBe(true)

    const unsicher = bewerteMitJev(festerJevClient(0.3))
    expect((await unsicher(AUFGABE, 'antwort')).pass).toBe(false)
  })

  test('p nahe 0,5 ist ein „unsicher" und besteht nicht', async () => {
    const bewerten = bewerteMitJev(festerJevClient(0.5))
    const urteil = await bewerten(AUFGABE, 'antwort')
    expect(urteil.pass).toBe(false)
    expect(urteil.begruendung).toContain('unsicher')
  })

  test('ein unbrauchbarer Wert ist kein Bestehen', async () => {
    const bewerten = bewerteMitJev({ noul: async () => ({ p: Number.NaN }) })
    const urteil = await bewerten(AUFGABE, 'antwort')
    expect(urteil.pass).toBe(false)
    // Ein NaN ist ein Dienstfehler, nicht eine Ablehnung — die Begründung sagt das.
    expect(urteil.begruendung).toContain('unbrauchbarer Wert')
  })

  test('die Schwelle ist einstellbar — aber der Wert bleibt begrenzt', async () => {
    const bewerten = bewerteMitJev(festerJevClient(0.8), { pass: 0.5 })
    expect((await bewerten(AUFGABE, 'antwort')).pass).toBe(true)

    expect(() => bewerteMitJev(festerJevClient(0.9), { pass: 1.5 })).toThrow(/pass muss/)
    expect(() => bewerteMitJev(festerJevClient(0.9), { band: 0.6 })).toThrow(/band muss/)
  })

  test('der Client bekommt Aufgabe, Rubric und Antwort als Zustand', async () => {
    const gesehen: Record<string, unknown>[] = []
    const bewerten = bewerteMitJev({
      noul: async (_frage, state) => {
        gesehen.push(state)
        return { p: 0.9 }
      },
    })
    await bewerten(AUFGABE, 'die antwort')
    expect(gesehen).toHaveLength(1)
    expect(gesehen[0]?.['rubric']).toBe(AUFGABE.rubric)
    expect(gesehen[0]?.['antwort']).toBe('die antwort')
  })
})
