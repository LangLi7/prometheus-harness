/**
 * Der Bildmodell-Katalog — **mehr als die vier Anker**.
 *
 * Der Betreiber sah vier Modelle zur Auswahl und fragte: *„sollte es nicht mehr geben?"* Der
 * offene Katalog nennt am 21.10.2026 468 Modelle, davon 12 mit Bild-Ausgabe. Diese Prüfung hält
 * fest, **welche** davon hier hereinkommen: die mit Bild-Ausgabe, ohne die `openrouter/auto`-
 * Weiterleitungen (die sind keine Modelle), und ohne Doppelte.
 *
 * @module @prometheus-harness/usage/tests/katalog
 */

import { describe, expect, test } from 'bun:test'

import { Katalog, liesBildmodelle } from '../src/katalog.ts'

/** Ein Katalog-Ausschnitt in der Form, die openrouter.ai liefert (gekürzt). */
const KATALOG = {
  data: [
    {
      id: 'google/gemini-3.1-flash-image',
      name: 'Google: Gemini 3.1 Flash Image',
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['image', 'text'] },
    },
    {
      id: 'openai/gpt-5-image',
      name: 'OpenAI: GPT-5 Image',
      architecture: { input_modalities: ['text'], output_modalities: ['image'] },
    },
    {
      id: 'deepseek/deepseek-flash',
      name: 'DeepSeek: Flash',
      architecture: { input_modalities: ['text'], output_modalities: ['text'] },
    },
    {
      id: 'openrouter/auto',
      name: 'Auto',
      architecture: { input_modalities: ['text'], output_modalities: ['image'] },
    },
    {
      id: 'kaputt',
    },
  ],
}

describe('Den Katalog lesen', () => {
  test('nur Modelle mit Bild-Ausgabe', () => {
    const modelle = liesBildmodelle(KATALOG)
    expect(modelle.map((m) => m.modell)).toEqual(['google/gemini-3.1-flash-image', 'openai/gpt-5-image'])
    expect(modelle[0]?.name).toBe('Google: Gemini 3.1 Flash Image')
  })

  test('die auto-Weiterleitungen sind keine Modelle', () => {
    expect(liesBildmodelle(KATALOG).some((m) => m.modell.startsWith('openrouter/'))).toBe(false)
  })

  test('Unsinn ergibt eine leere Liste, keinen Wurf', () => {
    expect(liesBildmodelle(null)).toEqual([])
    expect(liesBildmodelle('kaputt')).toEqual([])
    expect(liesBildmodelle({ data: 'nein' })).toEqual([])
  })
})

describe('Der Zwischenspeicher', () => {
  test('holt einmal und beantwortet den zweiten Aufruf ohne Netz', async () => {
    let abrufe = 0
    const katalog = new Katalog({
      abruf: (async () => {
        abrufe += 1
        return { ok: true, status: 200, json: async () => KATALOG } as unknown as Response
      }) as unknown as typeof fetch,
    })
    const erst = await katalog.hole()
    const zweit = await katalog.hole()
    expect(abrufe).toBe(1)
    expect(zweit).toEqual(erst)
    expect(erst.modelle).toHaveLength(2)
    expect(erst.geholtAm).not.toBeNull()
  })

  test('`frisch` erzwingt einen neuen Abruf', async () => {
    let abrufe = 0
    const katalog = new Katalog({
      abruf: (async () => {
        abrufe += 1
        return { ok: true, status: 200, json: async () => KATALOG } as unknown as Response
      }) as unknown as typeof fetch,
    })
    await katalog.hole()
    await katalog.hole(true)
    expect(abrufe).toBe(2)
  })

  test('ein Fehler nennt den Grund und behält keinen erfundenen Stand', async () => {
    const katalog = new Katalog({
      abruf: (async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch,
    })
    const stand = await katalog.hole()
    expect(stand.modelle).toEqual([])
    expect(stand.geholtAm).toBeNull()
    expect(stand.fehler).toContain('HTTP 503')
  })

  test('nach einem Fehler gelingt der nächste Versuch', async () => {
    let versuch = 0
    const katalog = new Katalog({
      abruf: (async () => {
        versuch += 1
        if (versuch === 1) return { ok: false, status: 500, json: async () => ({}) } as unknown as Response
        return { ok: true, status: 200, json: async () => KATALOG } as unknown as Response
      }) as unknown as typeof fetch,
    })
    expect((await katalog.hole()).modelle).toEqual([])
    const zweit = await katalog.hole()
    expect(zweit.modelle).toHaveLength(2)
    expect(zweit.fehler).toBeUndefined()
  })
})
