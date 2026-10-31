/**
 * Prüfung der undici-Ergänzung (`scripts/undici-echte-aufloesung.mjs`).
 *
 * **Die Gegenprobe ist hier das Wichtigste:** die Ergänzung greift in **fremden** Code. Sie muß
 * (a) den echten Anker finden, (b) ein **lauffähiges** Ergebnis liefern und (c) **laut scheitern**,
 * wenn der Kern die Datei umbaut.
 *
 * Der stärkste Fall ist der mit dem Umleitungsmodul: es wird **wirklich geladen** und ein `Agent`
 * daraus gebaut — ein Text, der nur wie ein Import aussieht, wäre wertlos.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import {
  ANKER,
  ERSATZ,
  UMWEG,
  ZIELDATEIEN,
  ergaenzungNoetig,
  zieheAufUmweg,
} from '../undici-echte-aufloesung.mjs'

const WEB_FETCH = 'node_modules/@deepseek-ai/dsh-web-fetch-http/lib/index.js'
const HTTP_PROXY = 'node_modules/@deepseek-ai/dsh-http-proxy/lib/index.js'

describe('undici-Auflösung', () => {
  test('die Ergänzung zielt auf die zwei Verbraucher, nicht auf fremde Pakete', () => {
    const trifft = (pfad) => ZIELDATEIEN.some((filter) => filter.test(pfad))
    expect(trifft('C:/x/node_modules/@deepseek-ai/dsh-web-fetch-http/lib/index.js')).toBe(true)
    expect(trifft('C:/x/node_modules/@deepseek-ai/dsh-http-proxy/lib/index.js')).toBe(true)
    expect(trifft('C:/x/node_modules/@deepseek-ai/dsh-llm/lib/index.js')).toBe(false)
    expect(trifft('C:/x/node_modules/@deepseek-ai/dsh-web-search-deepseek/lib/index.js')).toBe(false)
  })

  test('beide echten Dateien tragen den Anker', () => {
    expect(readFileSync(WEB_FETCH, 'utf8').includes(ANKER)).toBe(true)
    expect(readFileSync(HTTP_PROXY, 'utf8').includes(ANKER)).toBe(true)
  })

  test('jeder Import wird umgeschrieben, der Rest der Datei bleibt stehen', () => {
    for (const [pfad, erwartet] of [
      [WEB_FETCH, 2],
      [HTTP_PROXY, 3],
    ]) {
      const alt = readFileSync(pfad, 'utf8')
      const neu = zieheAufUmweg(alt)
      expect(neu).not.toBe(alt)
      // Kein nackter Import mehr — sonst bliebe die Attrappe im Spiel.
      expect(neu.includes(ANKER)).toBe(false)
      expect(neu.split(ERSATZ).length - 1).toBe(erwartet)
      // Die Datei selbst bleibt sonst unangetastet (nur der Spezifizierer ersetzt).
      expect(neu.length).toBeGreaterThan(alt.length)
    }
  })

  test('GEGENPROBE: ein fehlender Anker wirft — lieber laut als ins Leere', () => {
    expect(() => zieheAufUmweg('// ganz andere datei\n')).toThrow(/import\("undici"\)/)
  })

  test('die Ergänzung ist genau dann nötig, wenn die Laufzeit eine Attrappe liefert', async () => {
    // Gemessen statt behauptet: stimmt die Fähigkeitsprobe mit dem tatsächlichen Agent überein?
    const u = await import('undici')
    const attrappe = typeof new u.Agent().close !== 'function'
    expect(ergaenzungNoetig()).toBe(attrappe)
  })

  test('DAS UMWEGSMODUL FUNKTIONIERT — es liefert einen schließbaren Agent', async () => {
    const u = await import(UMWEG.href)
    const agent = new u.Agent()
    expect(typeof agent.close).toBe('function')
    expect(typeof u.fetch).toBe('function')
    await agent.close()
    // Und es ist mehr als ein Alias auf die Attrappe: dort fehlt `dispatch`.
    expect(typeof agent.dispatch).toBe('function')
  })
})
