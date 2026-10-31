/**
 * Prüfung der Beobachtungs-Lebensdauer (`scripts/fs-beobachtung-lebensdauer.mjs`).
 *
 * **Was hier geprüft wird und was nicht.** Diese Datei prüft die **Umformung**: daß die Anker
 * stehen, daß danach die Sitzungs-`id` der Schlüssel ist und keine `WeakMap` mehr übrig bleibt,
 * und daß eine fehlende Ankerstelle **laut** scheitert (Arbeitsweise Regel 5: die Ergänzung greift
 * in fremden Code).
 *
 * **Was hier NICHT geprüft werden kann.** Der Ende-zu-Ende-Fall — zwei Sitzungs-Objekte mit
 * derselben `id` — braucht die **geladene**, ergänzte Datei. Unter `bun test` greift der
 * `onLoad`-Filter für dieses Paket aber nicht (gemessen am 18.10.2026: der Filter feuert nicht,
 * die Datei wird unverändert geladen). Der Nachweis liegt deshalb als Sonde vor:
 * `docs/status/messsonden/beobachtung-lebensdauer.mjs` — als **Skript** mit Vorladung läuft er.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import {
  SCHLUESSEL,
  SCHLUESSEL_NEU,
  SCHWACH,
  SCHWACH_CLEAR,
  ZIELDATEI,
  zieheAufSitzungsId,
} from '../fs-beobachtung-lebensdauer.mjs'

const POLICY = 'node_modules/@deepseek-ai/dsh-fs-observation-policy/lib/index.js'

describe('Beobachtungs-Lebensdauer', () => {
  test('die Ergänzung zielt auf die Policy, nicht auf fremde Pakete', () => {
    expect(ZIELDATEI.test('C:/x/node_modules/@deepseek-ai/dsh-fs-observation-policy/lib/index.js')).toBe(true)
    expect(ZIELDATEI.test('C:/x/node_modules/@deepseek-ai/dsh-tool-fs/lib/index.js')).toBe(false)
    expect(ZIELDATEI.test('C:/x/node_modules/@deepseek-ai/dsh-fs-sandbox/lib/index.js')).toBe(false)
  })

  test('die echte Datei trägt alle drei Anker', () => {
    const alt = readFileSync(POLICY, 'utf8')
    expect(alt.includes(SCHWACH)).toBe(true)
    expect(alt.includes(SCHWACH_CLEAR)).toBe(true)
    expect(alt.includes(SCHLUESSEL)).toBe(true)
  })

  test('der Schlüssel ist danach die Sitzungs-id, und keine WeakMap mehr', () => {
    const neu = zieheAufSitzungsId(readFileSync(POLICY, 'utf8'))
    expect(neu).toContain(SCHLUESSEL_NEU)
    expect(neu.includes('new WeakMap()')).toBe(false)
    expect(neu.includes('new Map()')).toBe(true)
    // Die Prüfung selbst bleibt stehen — nur der Schlüssel ändert sich.
    expect(neu).toContain('"FS_NOT_OBSERVED"')
    expect(neu).toContain('prior.kind === "absent"')
    expect(neu).toContain('"FS_NOT_FOUND"')
  })

  test('die Umformung ist stabil: zweimal angewandt ändert sich nichts mehr', () => {
    // Ein zweiter Lauf findet den Anker nicht mehr — er wirft. Das ist die gewollte Grenze
    // und zugleich der Beweis, daß die Umformung nicht versehentlich doppelt greift.
    const einmal = zieheAufSitzungsId(readFileSync(POLICY, 'utf8'))
    expect(() => zieheAufSitzungsId(einmal)).toThrow(/Anker/)
  })

  test('GEGENPROBE: ein fehlender Anker wirft — lieber laut als ins Leere', () => {
    expect(() => zieheAufSitzungsId('// ganz andere datei\n')).toThrow(/Anker/)
  })
})
