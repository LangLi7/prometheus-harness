/**
 * Tests für die Wiederholung hinter dem LLM-Seam.
 *
 * **Warum diese Tests ohne Netz und ohne Wartezeit laufen.** Zwei Dinge sind in
 * diesem Paket austauschbar: der umschlossene Anbieter und der Schlaf. Damit
 * wird jede Regel prüfbar, ohne dass ein Test eine Sekunde steht — und ohne
 * dass ein Test von der Uhr des Rechners abhängt. Ein Test, der 15 Sekunden
 * wartet, wird beim ersten Fehlschlag abgeschaltet.
 *
 * **Was hier bewusst geprüft wird.** Nicht „es wiederholt", sondern die
 * Stellen, an denen eine naive Wiederholung Schaden anrichtet: ein Abbruch, der
 * trotzdem wiederholt wird; eine Wartezeit ohne Deckel; ein Fehler, der fünfmal
 * wiederholt wird, obwohl er nie gelingen kann; ein Abbruch während der
 * Wartezeit, der den Prozess stehen lässt.
 */

import { describe, expect, test } from 'bun:test'
import { LlmError, type CompletionRequest, type CompletionResult, type LlmProvider } from '@prometheus-harness/llm'
import {
  DEFAULT_RETRY_POLICY,
  RetryProvider,
  asLlmError,
  defaultProviderHint,
  defaultSleep,
  delayForAttempt,
  isRetryableNow,
  resolveRetryPolicy,
  withRetry,
} from '../src/index.ts'

// ---------------------------------------------------------------------------
// Prüfgerüst
// ---------------------------------------------------------------------------

/**
 * Ein Anbieter, der eine vorgegebene Folge von Ausgängen liefert.
 *
 * `null` steht für „Erfolg", ein `LlmError` für „Fehler". Nach dem Ende der
 * Folge wird der letzte Eintrag wiederholt — so lässt sich „scheitert immer"
 * mit einem einelementigen Feld schreiben.
 */
class ScriptedProvider implements LlmProvider {
  readonly name = 'scripted'
  readonly seen: CompletionRequest[] = []
  #index = 0
  readonly #script: readonly (LlmError | null)[]

  constructor(script: readonly (LlmError | null)[]) {
    this.#script = script
  }

  get calls(): number {
    return this.seen.length
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    this.seen.push(request)
    const entry = this.#script[Math.min(this.#index, this.#script.length - 1)] ?? null
    this.#index += 1
    if (entry !== null) throw entry
    return {
      text: `Antwort ${this.calls}`,
      toolCalls: [],
      finishReason: 'stop',
      model: 'scripted-1',
    }
  }
}

/** Eine Wartefunktion, die nichts tut, aber jede Wartezeit festhält. */
function recordingSleep(): { readonly waits: number[]; readonly fn: (ms: number) => Promise<void> } {
  const waits: number[] = []
  return {
    waits,
    fn: (ms: number): Promise<void> => {
      waits.push(ms)
      return Promise.resolve()
    },
  }
}

/** Liest die angehängte Zahl der Versuche, falls vorhanden. */
function attemptsOf(error: unknown): number | undefined {
  return (error as { readonly attempts?: number }).attempts
}

/**
 * Führt ein Versprechen aus und gibt den Fehler zurück.
 *
 * **Warum ein eigener Helfer und kein `.catch(cause => cause as LlmError)`.**
 * Der Typ von `.catch(...)` ist die **Vereinigung** aus Ergebnis und
 * Rückgabewert der Funktion; `error.kind` wäre darauf nicht lesbar. Dieser
 * Helfer gibt `unknown` aus und zwingt jeden Test, den Fehler ausdrücklich zu
 * behandeln — genau das, was ein Test über Fehler tun soll.
 */
async function asError(promise: Promise<unknown>): Promise<LlmError> {
  try {
    await promise
  } catch (cause) {
    if (cause instanceof LlmError) return cause
    throw new Error(`Erwartet war ein LlmError, gefangen wurde: ${String(cause)}`)
  }
  throw new Error('Erwartet war ein Fehler, der Aufruf ist aber gelungen')
}

/** Der Standard-Anfragetext; sein Inhalt ist für diese Tests bedeutungslos. */
const REQUEST: CompletionRequest = {
  model: 'deepseek-chat',
  messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hallo' }] }],
}

/** Eine Richtlinie ohne Streuung, damit Wartezeiten exakt prüfbar sind. */
const NO_JITTER = { jitter: 'none' } as const

/** Ein wiederholbarer Fehler, wie ihn der Adapter bei 429 liefert. */
function unavailable(): LlmError {
  return new LlmError('unavailable', 'überlastet', { providerCode: '429', retryable: true })
}

// ---------------------------------------------------------------------------
// Richtlinie prüfen und vervollständigen
// ---------------------------------------------------------------------------

describe('Richtlinie auflösen', () => {
  test('setzt fehlende Felder auf die Vorgaben', () => {
    const policy = resolveRetryPolicy()
    expect(policy.maxAttempts).toBe(3)
    expect(policy.baseDelayMs).toBe(500)
    expect(policy.multiplier).toBe(2)
    expect(policy.maxDelayMs).toBe(15_000)
    expect(policy.jitter).toBe('full')
    expect(policy.providerHint).toBe(defaultProviderHint)
  })

  test('übernimmt gesetzte Felder und lässt die übrigen auf der Vorgabe', () => {
    const policy = resolveRetryPolicy({ maxAttempts: 5, baseDelayMs: 10 })
    expect(policy.maxAttempts).toBe(5)
    expect(policy.baseDelayMs).toBe(10)
    expect(policy.multiplier).toBe(DEFAULT_RETRY_POLICY.multiplier)
  })

  test('lehnt maxAttempts 0 ab, statt still einmal zu versuchen', () => {
    expect(() => resolveRetryPolicy({ maxAttempts: 0 })).toThrow(RangeError)
  })

  test('lehnt eine gebrochene Zahl als maxAttempts ab', () => {
    expect(() => resolveRetryPolicy({ maxAttempts: 2.5 })).toThrow(RangeError)
  })

  test('lehnt multiplier unter 1 ab — das wäre ein Schrumpfen', () => {
    expect(() => resolveRetryPolicy({ multiplier: 0.5 })).toThrow(RangeError)
  })

  test('lehnt eine negative Wartezeit ab', () => {
    expect(() => resolveRetryPolicy({ baseDelayMs: -1 })).toThrow(RangeError)
    expect(() => resolveRetryPolicy({ maxDelayMs: -1 })).toThrow(RangeError)
  })

  test('erlaubt maxDelayMs 0 — dann wird sofort wiederholt', () => {
    const policy = resolveRetryPolicy({ maxDelayMs: 0 })
    expect(policy.maxDelayMs).toBe(0)
    expect(delayForAttempt(policy, 3, unavailable(), () => 0.5)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Wartezeit berechnen
// ---------------------------------------------------------------------------

describe('Wartezeit berechnen', () => {
  test('wächst exponentiell und bleibt unter dem Deckel', () => {
    const policy = resolveRetryPolicy({ baseDelayMs: 100, multiplier: 3, maxDelayMs: 1000, ...NO_JITTER })
    expect(delayForAttempt(policy, 1, unavailable())).toBe(100)
    expect(delayForAttempt(policy, 2, unavailable())).toBe(300)
    expect(delayForAttempt(policy, 3, unavailable())).toBe(900)
    // Der vierte Versuch würde 2700 ms ergeben — der Deckel greift.
    expect(delayForAttempt(policy, 4, unavailable())).toBe(1000)
    expect(delayForAttempt(policy, 9, unavailable())).toBe(1000)
  })

  test('ein genanntes Anbieter-Fenster schlägt die eigene Rechnung', () => {
    const policy = resolveRetryPolicy({ baseDelayMs: 100, ...NO_JITTER })
    const error = unavailable()
    Object.defineProperty(error, 'retryAfterSeconds', { value: 7, enumerable: true })
    expect(delayForAttempt(policy, 1, error)).toBe(7000)
    // Auch bei einem späteren Versuch bleibt es das Fenster, nicht die Rechnung.
    expect(delayForAttempt(policy, 5, error)).toBe(7000)
  })

  test('ein genanntes Fenster wird trotzdem gedeckelt', () => {
    const policy = resolveRetryPolicy({ maxDelayMs: 2000, ...NO_JITTER })
    const error = unavailable()
    Object.defineProperty(error, 'retryAfterSeconds', { value: 3600, enumerable: true })
    // Ohne Deckel stünde der Loop eine Stunde.
    expect(delayForAttempt(policy, 1, error)).toBe(2000)
  })

  test('liest retryAfterMs und retryAfter, wenn Sekunden fehlen', () => {
    const policy = resolveRetryPolicy({ ...NO_JITTER })
    const asMs = unavailable()
    Object.defineProperty(asMs, 'retryAfterMs', { value: 250, enumerable: true })
    expect(delayForAttempt(policy, 1, asMs)).toBe(250)

    const bare = unavailable()
    Object.defineProperty(bare, 'retryAfter', { value: 42, enumerable: true })
    expect(delayForAttempt(policy, 1, bare)).toBe(42)
  })

  test('ignoriert einen unbrauchbaren Anbieterwert statt NaN zu rechnen', () => {
    const error = unavailable()
    Object.defineProperty(error, 'retryAfterSeconds', { value: Number.NaN, enumerable: true })
    expect(defaultProviderHint(error)).toBeUndefined()
  })

  test('streut nach oben, nie nach unten', () => {
    const policy = resolveRetryPolicy({ baseDelayMs: 100, multiplier: 2, maxDelayMs: 10_000, jitter: 'full' })
    // Zufall am unteren Rand: die halbe berechnete Wartezeit.
    expect(delayForAttempt(policy, 1, unavailable(), () => 0)).toBe(50)
    // Zufall bei 0,25: ein Viertel des Wegs zwischen 50 und 100.
    expect(delayForAttempt(policy, 1, unavailable(), () => 0.25)).toBe(62.5)
    // Zufall knapp unter 1: knapp unter der vollen berechneten Wartezeit —
    // niemals darüber, das ist die Zusage.
    const high = delayForAttempt(policy, 1, unavailable(), () => 0.999_999)
    expect(high).toBeLessThan(100)
    expect(high).toBeGreaterThan(99)
  })

  test('half-Jitter liegt in der oberen Hälfte', () => {
    const policy = resolveRetryPolicy({ baseDelayMs: 100, multiplier: 2, maxDelayMs: 10_000, jitter: 'half' })
    expect(delayForAttempt(policy, 1, unavailable(), () => 0)).toBe(50)
    expect(delayForAttempt(policy, 1, unavailable(), () => 1)).toBe(100)
  })

  test('bleibt auch mit Streuung innerhalb der Grenzen und wächst monoton', () => {
    const policy = resolveRetryPolicy({ baseDelayMs: 500, multiplier: 2, maxDelayMs: 15_000, jitter: 'full' })
    let previousLow = -1
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const low = delayForAttempt(policy, attempt, unavailable(), () => 0)
      const high = delayForAttempt(policy, attempt, unavailable(), () => 0.999_999)
      expect(low).toBeGreaterThanOrEqual(0)
      expect(high).toBeLessThanOrEqual(15_000)
      expect(low).toBeLessThanOrEqual(high)
      expect(low).toBeGreaterThanOrEqual(previousLow)
      previousLow = low
    }
  })

  test('eine eigene Hinweis-Funktion ersetzt die Vorgabe', () => {
    const policy = resolveRetryPolicy({ providerHint: () => 123, ...NO_JITTER })
    expect(delayForAttempt(policy, 1, unavailable())).toBe(123)
  })
})

// ---------------------------------------------------------------------------
// Entscheiden, ob wiederholt werden darf
// ---------------------------------------------------------------------------

describe('Wiederholung entscheiden', () => {
  test('wiederholt unavailable, transport und timeout', () => {
    for (const kind of ['unavailable', 'transport', 'timeout'] as const) {
      expect(isRetryableNow(new LlmError(kind, 'x'))).toBe(true)
    }
  })

  test('wiederholt rejected, credentials und malformed nicht', () => {
    for (const kind of ['rejected', 'credentials', 'malformed', 'aborted'] as const) {
      expect(isRetryableNow(new LlmError(kind, 'x'))).toBe(false)
    }
  })

  test('wiederholt einen Abbruch nicht, auch wenn ein Anbieter ihn als wiederholbar meldet', () => {
    // Ein fremder Adapter, der sich nicht an die Regel hält.
    const wrong = new LlmError('aborted', 'x', { retryable: true })
    expect(wrong.retryable).toBe(true)
    expect(isRetryableNow(wrong)).toBe(false)
  })

  test('wiederholt nicht, wenn der Aufrufer abgebrochen hat', () => {
    const controller = new AbortController()
    controller.abort()
    expect(isRetryableNow(unavailable(), controller.signal)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Der wiederholende Anbieter
// ---------------------------------------------------------------------------

describe('Anbieter mit Wiederholung', () => {
  test('reicht eine erfolgreiche Antwort unverändert durch, ohne zu warten', async () => {
    const inner = new ScriptedProvider([null])
    const sleep = recordingSleep()
    const provider = new RetryProvider({ inner, sleep: sleep.fn })
    const result = await provider.complete(REQUEST)
    expect(result.text).toBe('Antwort 1')
    expect(inner.calls).toBe(1)
    expect(sleep.waits).toEqual([])
  })

  test('nennt sich nach dem umschlossenen Anbieter', () => {
    expect(withRetry(new ScriptedProvider([null])).name).toBe('scripted+retry')
  })

  test('erlaubt einen eigenen Namen', () => {
    const provider = new RetryProvider({ inner: new ScriptedProvider([null]), name: 'llm-http-mit-wiederholung' })
    expect(provider.name).toBe('llm-http-mit-wiederholung')
  })

  test('wiederholt und liefert das Ergebnis des späteren Versuchs', async () => {
    const inner = new ScriptedProvider([unavailable(), null])
    const sleep = recordingSleep()
    const provider = new RetryProvider({ inner, sleep: sleep.fn, policy: NO_JITTER })
    const result = await provider.complete(REQUEST)
    expect(result.text).toBe('Antwort 2')
    expect(inner.calls).toBe(2)
    expect(sleep.waits).toEqual([500])
  })

  test('wiederholt höchstens maxAttempts mal und wirft den letzten Fehler', async () => {
    const inner = new ScriptedProvider([unavailable()])
    const sleep = recordingSleep()
    const provider = new RetryProvider({ inner, sleep: sleep.fn, policy: { maxAttempts: 3, ...NO_JITTER } })
    const error = await asError(provider.complete(REQUEST))
    expect(error).toBeInstanceOf(LlmError)
    expect(error.kind).toBe('unavailable')
    expect(inner.calls).toBe(3)
    expect(sleep.waits).toEqual([500, 1000])
    // Die Zahl der Versuche steht am Fehler — sonst ist „sofort gescheitert" von
    // „nach zwei Wiederholungen gescheitert" nicht zu unterscheiden.
    expect(attemptsOf(error)).toBe(3)
  })

  test('hängt keine Versuchszahl an, wenn der erste Versuch schon endgültig scheitert', async () => {
    const inner = new ScriptedProvider([new LlmError('rejected', 'falsche Anfrage', { retryable: false })])
    const sleep = recordingSleep()
    const provider = new RetryProvider({ inner, sleep: sleep.fn })
    const error = await asError(provider.complete(REQUEST))
    expect(error.kind).toBe('rejected')
    expect(inner.calls).toBe(1)
    expect(sleep.waits).toEqual([])
    expect(attemptsOf(error)).toBeUndefined()
  })

  test('wiederholt einen abgelehnten Aufruf nicht — auch mit vielen Versuchen', async () => {
    const inner = new ScriptedProvider([new LlmError('rejected', '400', { retryable: false })])
    const provider = withRetry(inner, { maxAttempts: 10 })
    await expect(provider.complete(REQUEST)).rejects.toThrow(LlmError)
    expect(inner.calls).toBe(1)
  })

  test('wiederholt Zugangsdaten-Fehler nicht', async () => {
    const inner = new ScriptedProvider([new LlmError('credentials', '401', { retryable: false })])
    const provider = withRetry(inner, { maxAttempts: 5 })
    await expect(provider.complete(REQUEST)).rejects.toThrow(LlmError)
    expect(inner.calls).toBe(1)
  })

  test('maxAttempts 1 schaltet die Wiederholung ab, ohne Fehler', async () => {
    const inner = new ScriptedProvider([unavailable()])
    const sleep = recordingSleep()
    const provider = new RetryProvider({ inner, sleep: sleep.fn, policy: { maxAttempts: 1 } })
    const error = await asError(provider.complete(REQUEST))
    expect(error.kind).toBe('unavailable')
    expect(inner.calls).toBe(1)
    expect(sleep.waits).toEqual([])
    // Ein einziger Versuch ist kein „wiederholtes Scheitern" — die Zahl der
    // Versuche bleibt deshalb weg.
    expect(attemptsOf(error)).toBeUndefined()
  })

  test('geht bei bereits abgebrochenem Aufruf gar nicht erst hinaus', async () => {
    const inner = new ScriptedProvider([null])
    const provider = withRetry(inner)
    const controller = new AbortController()
    controller.abort()
    const error = await asError(provider.complete({ ...REQUEST, signal: controller.signal }))
    expect(error.kind).toBe('aborted')
    expect(inner.calls).toBe(0)
  })

  test('bricht die Wiederholung ab, wenn der Aufrufer während der Wartezeit abbricht', async () => {
    const inner = new ScriptedProvider([unavailable()])
    const controller = new AbortController()
    // Der Schlaf bricht den Aufruf ab, statt zu warten — genau der Fall, den
    // ein nacktes setTimeout nicht bemerkt.
    const sleep = (): Promise<void> => {
      controller.abort()
      return Promise.resolve()
    }
    const provider = new RetryProvider({ inner, sleep, policy: { maxAttempts: 5, ...NO_JITTER } })
    const error = await asError(provider.complete({ ...REQUEST, signal: controller.signal }))
    expect(error.kind).toBe('aborted')
    // Kein zweiter Versuch: der Abbruch ist die neuere Tatsache.
    expect(inner.calls).toBe(1)
  })

  test('reicht die Anfrage unverändert durch — jeder Versuch ist identisch', async () => {
    const inner = new ScriptedProvider([new LlmError('transport', 'x'), null])
    // Ohne Streuung **und** ohne Wartezeit: kein Test darf stehen.
    const provider = withRetry(inner, { baseDelayMs: 0, ...NO_JITTER })
    await provider.complete(REQUEST)
    expect(inner.seen).toHaveLength(2)
    expect(inner.seen[0]).toEqual(REQUEST)
    expect(inner.seen[1]).toEqual(REQUEST)
  })

  test('berichtet jeden gescheiterten Versuch mit Nummer und Wartezeit', async () => {
    const inner = new ScriptedProvider([unavailable()])
    const sleep = recordingSleep()
    const reports: { attempt: number; delayMs: number; kind: string; code: string | undefined }[] = []
    const provider = new RetryProvider({
      inner,
      policy: { maxAttempts: 3, baseDelayMs: 10, ...NO_JITTER },
      sleep: sleep.fn,
      onRetry: (report) => {
        reports.push({
          attempt: report.attempt,
          delayMs: report.delayMs,
          kind: report.error.kind,
          code: report.error.providerCode,
        })
      },
    })
    await provider.complete(REQUEST).catch(() => {})
    expect(reports).toEqual([
      { attempt: 1, delayMs: 10, kind: 'unavailable', code: '429' },
      { attempt: 2, delayMs: 20, kind: 'unavailable', code: '429' },
    ])
    // Der Bericht läuft **vor** der Wartezeit — die Reihenfolge ist dieselbe.
    expect(sleep.waits).toEqual([10, 20])
  })

  test('ein werfender Bericht beendet die Wiederholung sichtbar', async () => {
    const inner = new ScriptedProvider([unavailable()])
    const provider = new RetryProvider({
      inner,
      policy: { maxAttempts: 5, ...NO_JITTER },
      sleep: recordingSleep().fn,
      onRetry: () => {
        throw new Error('Bericht gescheitert')
      },
    })
    await expect(provider.complete(REQUEST)).rejects.toThrow('Bericht gescheitert')
    expect(inner.calls).toBe(1)
  })

  test('hüllt einen anbieterfremden Fehler in malformed und wiederholt ihn nicht', async () => {
    const inner: LlmProvider = {
      name: 'kaputt',
      complete: (): Promise<CompletionResult> => Promise.reject(new TypeError('x ist kein Feld')),
    }
    const provider = withRetry(inner, { maxAttempts: 4 })
    const error = await asError(provider.complete(REQUEST))
    expect(error.kind).toBe('malformed')
    expect(error.retryable).toBe(false)
    expect(error.message).toContain('x ist kein Feld')
  })

  test('gibt einen unveränderten Seam-Fehler weiter, wenn er schon einer ist', () => {
    const original = new LlmError('timeout', 'zu spät')
    expect(asLlmError(original)).toBe(original)
  })

  test('gibt die aufgelöste Richtlinie bekannt', () => {
    const provider = withRetry(new ScriptedProvider([null]), { maxAttempts: 7 })
    expect(provider.policy.maxAttempts).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// Die Wartefunktion selbst
// ---------------------------------------------------------------------------

describe('Wartefunktion', () => {
  test('wartet nicht, wenn das Signal schon abgebrochen ist', async () => {
    const controller = new AbortController()
    controller.abort()
    const started = performance.now()
    await defaultSleep(5000, controller.signal)
    // Gemessen, nicht behauptet: die Wartezeit muss praktisch null sein.
    expect(performance.now() - started).toBeLessThan(200)
  })

  test('kehrt bei 0 ms sofort zurück', async () => {
    const started = performance.now()
    await defaultSleep(0)
    expect(performance.now() - started).toBeLessThan(200)
  })

  test('weckt bei einem Abbruch während der Wartezeit', async () => {
    const controller = new AbortController()
    const started = performance.now()
    const waiting = defaultSleep(60_000, controller.signal)
    setTimeout(() => { controller.abort() }, 20)
    await waiting
    expect(performance.now() - started).toBeLessThan(5000)
  })

  test('wartet wirklich, wenn niemand abbricht', async () => {
    const started = performance.now()
    await defaultSleep(60)
    expect(performance.now() - started).toBeGreaterThanOrEqual(50)
  })
})
