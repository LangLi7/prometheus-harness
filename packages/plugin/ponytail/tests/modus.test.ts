/**
 * Prüfungen für die reine Logik: Zustand, Übergang, Datei.
 *
 * Der Host läßt sich damit nicht beweisen — nur, daß der Schalter die vier Zustände richtig
 * dreht und eine fremde Datei nicht beschädigt.
 */

import { describe, expect, test } from 'bun:test'

import { MODI, STANDARD, istModus, leseModus, naechster, schreibeModus } from '../src/modus.ts'

describe('istModus', () => {
  test('accepts the four states', () => {
    for (const modus of MODI) expect(istModus(modus)).toBe(true)
  })

  test('rejects anything else', () => {
    for (const wert of ['', 'OFF', 'max', 1, null, undefined, {}]) expect(istModus(wert)).toBe(false)
  })
})

describe('naechster', () => {
  test('cycles off -> lite -> full -> ultra -> off', () => {
    expect(naechster('off')).toBe('lite')
    expect(naechster('lite')).toBe('full')
    expect(naechster('full')).toBe('ultra')
    expect(naechster('ultra')).toBe('off')
  })
})

describe('leseModus', () => {
  test('reads our own field', () => {
    expect(leseModus('{"modus":"ultra"}')).toBe('ultra')
  })

  test('reads the older enabled flag', () => {
    expect(leseModus('{"enabled":false,"skills":["ponytail"]}')).toBe('off')
    expect(leseModus('{"enabled":true}')).toBe('full')
  })

  test('falls back on a missing or broken file', () => {
    expect(leseModus('')).toBe(STANDARD)
    expect(leseModus('{')).toBe(STANDARD)
    expect(leseModus('null')).toBe(STANDARD)
    expect(leseModus('{"modus":"gibtsnicht"}')).toBe(STANDARD)
  })
})

describe('schreibeModus', () => {
  const jetzt = new Date('2026-10-21T12:00:00.000Z')

  test('keeps fields it does not own', () => {
    const text = schreibeModus('lite', '{"skills":["a"],"enabled":false}', jetzt)
    const gelesen = JSON.parse(text)
    expect(gelesen.modus).toBe('lite')
    expect(gelesen.skills).toEqual(['a'])
    expect(gelesen.enabled).toBe(false)
    expect(gelesen.updatedAt).toBe('2026-10-21T12:00:00.000Z')
  })

  test('writes a fresh object when there was nothing', () => {
    expect(JSON.parse(schreibeModus('off', undefined, jetzt))).toEqual({
      modus: 'off',
      updatedAt: '2026-10-21T12:00:00.000Z',
    })
  })

  test('survives a broken previous file', () => {
    expect(JSON.parse(schreibeModus('full', '{', jetzt)).modus).toBe('full')
  })

  test('round-trips through leseModus', () => {
    expect(leseModus(schreibeModus('ultra', undefined, jetzt))).toBe('ultra')
  })
})
