/**
 * Die lebenden Salden — **die drei Antworten, die der Betreiber beanstandet hat**.
 *
 * ## Was hier geprüft wird
 *
 * Daß `total_credits − total_usage` wirklich 19,7733 ergibt (der Betreiber nannte „rund 19,77"),
 * daß `total_balance` und nicht `topped_up_balance` genommen wird (48,49 statt 5,98), und daß die
 * Schlüssel **beim richtigen Anbieter** landen — der Fehler, den `schluesselquelle` aus
 * `ai-capabilities` still gemacht hätte, weil sie keinen Ref kennt.
 *
 * Die Zahlen sind die **gemessenen** Antworten vom 21.10.2026, gekürzt auf das, was zählt.
 *
 * @module @prometheus-harness/usage/tests/salden
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  fehlerInWorten,
  holeLebendeSalden,
  liesCredits,
  liesDeepseekstand,
  liesSchluesselstand,
  schluesselAusContext,
  verfuegbarkeitAusContext,
} from '../src/salden.ts'
import type { Context } from '@deepseek-ai/cordis'

/** Eine erfundene Antwort im Gewand einer `Response`. */
function antwort(koerper: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => koerper,
  } as unknown as Response
}

/** Die gemessene Antwort von `GET /api/v1/credits`. */
const CREDITS = { data: { total_credits: 40.49, total_usage: 20.716706529 } }

/** Die gemessene Antwort von `GET /api/v1/key` (gekürzt). */
const SCHLUESSEL = { data: { limit: 5, limit_reset: 'monthly', limit_remaining: 4.504052525 } }

/** Die gemessene Antwort von `GET /user/balance`. */
const BALANCE = {
  is_available: true,
  balance_infos: [
    { currency: 'USD', total_balance: '48.49', granted_balance: '42.50', topped_up_balance: '5.98' },
  ],
}

/** Der Schlüssel, den die Umgebung trägt — hier ausdrücklich leer. */
const UMWELT = ['OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY'] as const
let gerettet: Record<string, string | undefined> = {}

beforeEach(() => {
  gerettet = {}
  for (const name of UMWELT) {
    gerettet[name] = process.env[name]
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of UMWELT) {
    const wert = gerettet[name]
    if (wert === undefined) delete process.env[name]
    else process.env[name] = wert
  }
})

describe('Guthaben rechnen', () => {
  test('OpenRouter: 40,49 − 20,7167 = 19,7733', () => {
    const gelesen = liesCredits(CREDITS)
    expect(gelesen.guthabenUsd).toBeCloseTo(19.7733, 4)
    expect(gelesen.detail).toContain('40.49 eingezahlt')
    expect(gelesen.detail).toContain('20.72 verbraucht')
  })

  test('Einzahlung und Verbrauch sind eigene Zahlen — nicht nur der Text', () => {
    const gelesen = liesCredits(CREDITS)
    expect(gelesen.eingezahltUsd).toBe(40.49)
    expect(gelesen.verbrauchtGesamtUsd).toBeCloseTo(20.716706529, 9)
  })

  test('fehlt eine der beiden Zahlen, gibt es KEIN Guthaben — statt 0', () => {
    expect(liesCredits({ data: { total_credits: 40.49 } })).toEqual({})
    expect(liesCredits({ data: { total_usage: 1 } })).toEqual({})
    expect(liesCredits({})).toEqual({})
    expect(liesCredits(null)).toEqual({})
  })

  test('Limit und Rest ergeben den Verbrauch', () => {
    const gelesen = liesSchluesselstand(SCHLUESSEL)
    expect(gelesen.limitUsd).toBe(5)
    expect(gelesen.limitRestUsd).toBeCloseTo(4.504052525, 9)
    expect(gelesen.verbrauchtUsd).toBeCloseTo(0.495947475, 9)
  })

  test('der Zeitraum des Limits wird mitgelesen — sonst sähe das Limit wie das Guthaben aus', () => {
    expect(liesSchluesselstand(SCHLUESSEL).zeitraum).toBe('monthly')
    // Kein `limit_reset` in der Antwort: dann gibt es keinen Zeitraum, aber auch keinen erfundenen.
    expect(liesSchluesselstand({ data: { limit: 5 } })).toEqual({ limitUsd: 5 })
  })

  test('DeepSeek: die GESAMTE Balance, nicht der aufgeladene Teil', () => {
    const gelesen = liesDeepseekstand(BALANCE)
    expect(gelesen.guthabenUsd).toBeCloseTo(48.49, 2)
    expect(gelesen.detail).toBe('42.50 gewährt + 5.98 aufgeladen')
  })

  test('ohne `balance_infos` gibt es keine Zahl', () => {
    expect(liesDeepseekstand({ balance_infos: [] })).toEqual({})
    expect(liesDeepseekstand({})).toEqual({})
  })
})

describe('Die Abfrage', () => {
  /** Ein Abruf, der die Tabelle beantwortet und **mitschreibt**, was gefragt wurde. */
  function abrufMit(tabelle: Record<string, unknown>, gesehen: { weg: string; auth: string }[] = []): typeof fetch {
    return (async (weg: string, optionen: { headers?: Record<string, string> }) => {
      gesehen.push({ weg, auth: optionen.headers?.['authorization'] ?? '' })
      const antwort0 = tabelle[weg]
      return antwort0 === undefined ? antwort({}, 404) : antwort(antwort0)
    }) as unknown as typeof fetch
  }

  test('fragt beide Anbieter, jeden mit SEINEM Schlüssel', async () => {
    const gesehen: { weg: string; auth: string }[] = []
    const abruf = abrufMit(
      {
        'https://openrouter.ai/api/v1/credits': CREDITS,
        'https://openrouter.ai/api/v1/key': SCHLUESSEL,
        'https://api.deepseek.com/user/balance': BALANCE,
      },
      gesehen,
    )
    const gefragt: string[] = []
    const aus = await holeLebendeSalden({
      schluessel: async (ref) => {
        gefragt.push(ref)
        return ref === 'OPENROUTER_API_KEY' ? 'sk-or-KEY' : 'sk-ds-KEY'
      },
      jetzt: new Date('2026-10-21T14:00:00.000Z'),
      abruf,
    })

    expect(gefragt.sort()).toEqual(['DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY'])
    expect(aus.get('OPENROUTER_API_KEY')?.guthabenUsd).toBeCloseTo(19.7733, 4)
    expect(aus.get('DEEPSEEK_API_KEY')?.guthabenUsd).toBeCloseTo(48.49, 2)
    expect(aus.get('OPENROUTER_API_KEY')?.quelle).toBe('live')

    // **Der eigentliche Punkt:** DeepSeek bekam den DeepSeek-Schlüssel.
    const deepseek = gesehen.find((eintrag) => eintrag.weg.includes('deepseek.com'))
    expect(deepseek?.auth).toBe('Bearer sk-ds-KEY')
    for (const eintrag of gesehen.filter((e) => e.weg.includes('openrouter.ai'))) {
      expect(eintrag.auth).toBe('Bearer sk-or-KEY')
    }
  })

  test('ohne Schlüssel wird nicht gefragt', async () => {
    let gefragt = 0
    const aus = await holeLebendeSalden({
      schluessel: async () => undefined,
      jetzt: new Date(),
      abruf: (async () => {
        gefragt += 1
        return antwort({})
      }) as unknown as typeof fetch,
    })
    expect(aus.size).toBe(0)
    expect(gefragt).toBe(0)
  })

  test('ein Fehler bleibt sichtbar und erfindet kein Guthaben', async () => {
    const aus = await holeLebendeSalden({
      schluessel: async (ref) => (ref === 'OPENROUTER_API_KEY' ? 'sk-or-KEY' : undefined),
      jetzt: new Date(),
      abruf: (async () => antwort({}, 401)) as unknown as typeof fetch,
    })
    const saldo = aus.get('OPENROUTER_API_KEY')
    expect(saldo?.guthabenUsd).toBeUndefined()
    expect(saldo?.fehler).toContain('HTTP 401')
  })
})

describe('Die Schlüsselquelle', () => {
  test('fragt den Speicher mit dem Namen — nicht mit einem festen Umweltschlüssel', async () => {
    const gefragt: string[] = []
    const ctx = {
      get: () => ({
        resolve: async (name: string) => {
          gefragt.push(name)
          return { value: `wert-${name}` }
        },
      }),
    } as unknown as Context
    const quelle = schluesselAusContext(ctx)
    expect(await quelle('DEEPSEEK_API_KEY')).toBe('wert-DEEPSEEK_API_KEY')
    expect(await quelle('OPENROUTER_API_KEY')).toBe('wert-OPENROUTER_API_KEY')
    expect(gefragt).toEqual(['DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY'])
  })

  test('ohne Speicher gilt die Umgebung; ein leerer Wert zählt nicht', async () => {
    const ctx = { get: () => undefined } as unknown as Context
    process.env['DEEPSEEK_API_KEY'] = 'aus-der-umgebung'
    expect(await schluesselAusContext(ctx)('DEEPSEEK_API_KEY')).toBe('aus-der-umgebung')
    process.env['DEEPSEEK_API_KEY'] = '   '
    expect(await schluesselAusContext(ctx)('DEEPSEEK_API_KEY')).toBeUndefined()
  })
})

describe('Was hinterlegt ist', () => {
  test('fragt den Speicher, ohne den Wert zu nennen', async () => {
    const gefragt: string[] = []
    const ctx = {
      get: () => ({
        describe: async (ref: string) => {
          gefragt.push(ref)
          return { configured: ref === 'OPENROUTER_API_KEY', writable: true }
        },
      }),
    } as unknown as Context
    const da = verfuegbarkeitAusContext(ctx)
    expect(await da('OPENROUTER_API_KEY')).toBe(true)
    expect(await da('ZAI_API_KEY')).toBe(false)
    expect(gefragt).toEqual(['OPENROUTER_API_KEY', 'ZAI_API_KEY'])
  })

  test('ohne Speicher wird nichts ausgeblendet', async () => {
    const ctx = { get: () => undefined } as unknown as Context
    expect(await verfuegbarkeitAusContext(ctx)('irgendwas')).toBe(true)
  })

  test('ein unlesbarer Speicher blendet NICHT aus', async () => {
    const ctx = {
      get: () => ({
        describe: async () => {
          throw new Error('Datenbank weg')
        },
      }),
    } as unknown as Context
    // Eine Zeile zu viel ist ein Ärgernis; eine zu wenig ist ein verschwiegener Schlüssel.
    expect(await verfuegbarkeitAusContext(ctx)('OPENROUTER_API_KEY')).toBe(true)
  })
})

describe('Was ein Fehler im Panel sagen darf', () => {
  test('ein DNS-Fehler wird zu einem Satz — die Rohmeldung bleibt daneben', () => {
    // So wirft `fetch` wirklich: der Name, um den es geht, steckt erst in `cause`.
    const problem = new TypeError('fetch failed', {
      cause: new Error('getaddrinfo ENOTFOUND openrouter.ai'),
    })
    const { text, technisch } = fehlerInWorten(problem)
    expect(text).toBe('Name nicht auflösbar')
    expect(technisch).toContain('getaddrinfo ENOTFOUND openrouter.ai')
    // Der Satz darf die Rohmeldung nicht wiederholen, sonst sieht die Zeile wie ein Absturz aus.
    expect(text).not.toContain('getaddrinfo')
  })

  test('eine gerissene Frist heißt Zeitüberschreitung', () => {
    const problem = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    expect(fehlerInWorten(problem).text).toBe('Zeitüberschreitung')
  })

  test('durch den Abruf: Satz in `fehler`, Beleg in `fehlerTechnisch`', async () => {
    const aus = await holeLebendeSalden({
      schluessel: async (ref) => (ref === 'OPENROUTER_API_KEY' ? 'sk-or-KEY' : undefined),
      jetzt: new Date('2026-10-28T16:20:00.000Z'),
      abruf: (async () => {
        throw new TypeError('fetch failed', {
          cause: new Error('getaddrinfo ENOTFOUND openrouter.ai'),
        })
      }) as unknown as typeof fetch,
    })
    const saldo = aus.get('OPENROUTER_API_KEY')
    // Beide Wege (Guthaben und Limit) scheitern gleich — und werden beide benannt.
    expect(saldo?.fehler).toContain('Guthaben: Name nicht auflösbar')
    expect(saldo?.fehler).toContain('Limit: Name nicht auflösbar')
    expect(saldo?.fehler).not.toContain('getaddrinfo')
    expect(saldo?.fehlerTechnisch).toContain('getaddrinfo ENOTFOUND openrouter.ai')
    // Ein Fehler erfindet kein Guthaben.
    expect(saldo?.guthabenUsd).toBeUndefined()
  })
})
