/**
 * `@prometheus-harness/llm-retry` — die zweite Sprosse der kleinsten Kette.
 *
 * **Was dieses Paket tut.** Es umschließt einen {@link LlmProvider} mit einem
 * zweiten {@link LlmProvider}, der bei einem **wiederholbaren** Fehler erneut
 * anfragt — mit begrenztem Rückzug. Nach außen ist nichts zu sehen: der
 * Agent-Loop ruft `complete()` auf und bekommt entweder eine Antwort oder den
 * Fehler des letzten Versuchs.
 *
 * **Warum das ein eigener Anbieter ist und keine Schleife im Loop.** Drei
 * Gründe, jeder mit Folgen:
 *   1. **Der Loop bleibt lesbar.** Seine Zustandsmaschine soll Turns und Steps
 *      führen, nicht Rückzugszeiten. Eine Wiederholungsschleife darin vermischt
 *      zwei Zeitbegriffe.
 *   2. **Die Entscheidung ist prüfbar.** Weil dieses Paket ein Anbieter ist,
 *      lässt es sich **ohne Netz und ohne Wartezeit** prüfen: der Schlaf und
 *      der Zufall sind austauschbare Argumente. Eine Schleife im Loop wäre nur
 *      über die ganze Kette prüfbar.
 *   3. **Sie ist absteckbar.** Wer die Wiederholung weglassen will, hängt den
 *      nackten Anbieter ein. Kein Codepfad ändert sich.
 *
 * **Wer entscheidet, was wiederholbar ist.** Der Adapter liefert die
 * **Tatsache** ({@link LlmError.kind} plus {@link LlmError.retryable}), dieses
 * Paket die **Entscheidung** (Zahl der Versuche, Wartezeit). Es gibt
 * genau **eine** Ausnahme von `retryable`, und sie steht im Adapter:
 * `aborted` ist immer `false`. Hier wird zusätzlich **hart** geprüft — ein
 * Abbruch wird nie wiederholt, auch wenn ein fremder Anbieter `retryable: true`
 * dazu sagt. Ein abgebrochener Aufruf ist ein Wunsch des Benutzers, keine
 * Störung.
 *
 * **Was dieses Paket bewusst NICHT tut:** es zählt keine Token (das ist
 * `token-meter`), es kennt keinen Anbieter, es liest keine Umgebung, es
 * protokolliert nichts von sich aus, und es **ändert die Anfrage nicht** — der
 * Strom geht unverändert hinaus. Eine Wiederholung, die den Prompt umschreibt
 * (etwa „versuch es nochmal"), ist eine andere Sache und gehört nicht hierher.
 *
 * @module @prometheus-harness/llm-retry
 */

import {
  LlmError,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
} from '@prometheus-harness/llm'

// ---------------------------------------------------------------------------
// Richtlinie
// ---------------------------------------------------------------------------

/**
 * Wann und wie lange gewartet wird.
 *
 * **Alle Felder sind optional, jede Vorgabe ist begründet** — nicht geraten:
 *
 * | Feld | Vorgabe | Grund |
 * |---|---|---|
 * | `maxAttempts` | 3 | ein erster Versuch plus zwei Wiederholungen. Fünf Versuche bei einer Störung kosten mehr Zeit, als ein sichtbarer Fehler kostet |
 * | `baseDelayMs` | 500 | lang genug, dass eine kurze Überlastung vorbei ist; kurz genug, dass ein Benutzer nicht auf einen Fehler wartet |
 * | `multiplier` | 2 | verdoppelt: 500 → 1000 |
 * | `maxDelayMs` | 15 000 | Obergrenze. **Ohne sie wächst der Rückzug unbegrenzt** — der klassische Fehler, der aus einer Störung eine Viertelstunde macht |
 * | `jitter` | `'full'` | ohne Streuung wiederholen mehrere gleichzeitige Aufrufe im **Gleichschritt** und erzeugen dieselbe Überlastung erneut |
 */
export interface RetryPolicy {
  /**
   * Versuche **einschließlich** des ersten. `1` schaltet die Wiederholung ab.
   *
   * Muss eine ganze Zahl ≥ 1 sein. `0` wird beim Bauen abgelehnt statt still
   * zu „einmal versuchen" zu werden: wer 0 schreibt, meint etwas anderes, als
   * er bekommt.
   */
  readonly maxAttempts?: number
  /** Wartezeit vor dem zweiten Versuch, in Millisekunden. */
  readonly baseDelayMs?: number
  /** Wachstumsfaktor je weiterem Versuch; `1` heißt konstante Wartezeit. */
  readonly multiplier?: number
  /** Obergrenze der Wartezeit, in Millisekunden. */
  readonly maxDelayMs?: number
  /**
   * Streuung der Wartezeit.
   *
   * - `'full'` — die Wartezeit liegt gleichverteilt in `[untergrenze, gedeckelt]`
   * - `'none'` — exakt die berechnete Zeit (für Messungen und Tests)
   * - `'half'` — in `[gedeckelt / 2, gedeckelt]`
   *
   * **Warum die Untergrenze bei `'full'` berechnet wird und nicht 0 ist:**
   * eine Wartezeit von 0 ms wiederholt sofort und erzeugt genau die Last, die
   * den Anbieter überlastet hat. Die Untergrenze ist die halbe berechnete
   * Wartezeit — Streuung nach oben, nie nach unten.
   */
  readonly jitter?: 'none' | 'half' | 'full'
  /**
   * Ein vom Anbieter genanntes Fenster (Sekunden), falls der Fehler eines trägt.
   *
   * **Woher der Wert kommt.** `Retry-After` ist kein OpenAI-Standardfeld, aber
   * `429`-Antworten tragen es häufig. Der Adapter darf es an den Fehler hängen;
   * dieses Paket liest es dann **bevorzugt** — eine Zahl des Anbieters schlägt
   * jede eigene Rechnung. Der Wert wird trotzdem auf `maxDelayMs` gedeckelt:
   * ein Anbieter, der 3600 Sekunden verlangt, lähmt den Loop sonst für eine
   * Stunde.
   *
   * Die Vorgabe liest `retryAfterSeconds`, `retryAfterMs` und `retryAfter` in
   * dieser Reihenfolge, sofern der Wert eine endliche Zahl ≥ 0 ist.
   */
  readonly providerHint?: (error: LlmError) => number | undefined
}

/** Die vollständig aufgelöste Richtlinie — jedes Feld gesetzt. */
export interface ResolvedRetryPolicy {
  readonly maxAttempts: number
  readonly baseDelayMs: number
  readonly multiplier: number
  readonly maxDelayMs: number
  readonly jitter: 'none' | 'half' | 'full'
  readonly providerHint: ((error: LlmError) => number | undefined) | undefined
}

/** Vorgaben der Richtlinie, an **einer** Stelle — damit Doku und Code nicht auseinanderlaufen. */
export const DEFAULT_RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 500,
  multiplier: 2,
  maxDelayMs: 15_000,
  jitter: 'full',
} as const satisfies Required<Omit<RetryPolicy, 'providerHint'>>

/**
 * Prüft und vervollständigt eine Richtlinie.
 *
 * **Warum beim Bauen geprüft wird und nicht beim Wiederholen.** Eine
 * Richtlinie mit `maxAttempts: 0` oder `multiplier: 0` ergibt entweder eine
 * Endlosschleife oder einen sofortigen Abbruch. Beides soll **vor** dem ersten
 * Netzaufruf auffallen, nicht danach.
 *
 * @param policy - die Richtlinie des Aufrufers; fehlende Felder werden ergänzt
 * @returns die vollständige Richtlinie
 * @throws RangeError bei einem Wert, der keine sinnvolle Wiederholung ergibt
 */
export function resolveRetryPolicy(policy: RetryPolicy = {}): ResolvedRetryPolicy {
  const maxAttempts = policy.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts
  const baseDelayMs = policy.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs
  const multiplier = policy.multiplier ?? DEFAULT_RETRY_POLICY.multiplier
  const maxDelayMs = policy.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs
  const jitter = policy.jitter ?? DEFAULT_RETRY_POLICY.jitter

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError(`maxAttempts muss eine ganze Zahl ≥ 1 sein, ist ${String(maxAttempts)}`)
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs muss eine endliche Zahl ≥ 0 sein, ist ${String(baseDelayMs)}`)
  }
  if (!Number.isFinite(multiplier) || multiplier < 1) {
    throw new RangeError(`multiplier muss eine endliche Zahl ≥ 1 sein, ist ${String(multiplier)}`)
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
    throw new RangeError(`maxDelayMs muss eine endliche Zahl ≥ 0 sein, ist ${String(maxDelayMs)}`)
  }

  return {
    maxAttempts,
    baseDelayMs,
    multiplier,
    // Der Deckel darf unter der Grundwartezeit liegen — dann gewinnt der Deckel.
    // Das ist keine Fehlkonfiguration, sondern die kürzeste sinnvolle Lesart.
    maxDelayMs,
    jitter,
    providerHint: policy.providerHint ?? defaultProviderHint,
  }
}

/**
 * Liest ein vom Anbieter genanntes Wiederholungsfenster aus einem Fehler.
 *
 * **Warum geduldet und nicht typisiert.** {@link LlmError} gehört dem Seam;
 * ein Feld „Sekunden bis zum nächsten Versuch" dort hinein wäre eine
 * Anbieter-Eigenheit im Seam. Deshalb liest diese Funktion die Form **am
 * Fehler**, wenn ein Adapter sie angehängt hat — und sonst nichts.
 *
 * @param error - der Fehler des letzten Versuchs
 * @returns Millisekunden, oder `undefined`, wenn der Fehler nichts nennt
 */
export function defaultProviderHint(error: LlmError): number | undefined {
  const carrier = error as unknown as {
    readonly retryAfterSeconds?: unknown
    readonly retryAfterMs?: unknown
    readonly retryAfter?: unknown
  }

  const seconds = carrier.retryAfterSeconds
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }
  const millis = carrier.retryAfterMs
  if (typeof millis === 'number' && Number.isFinite(millis) && millis >= 0) {
    return millis
  }
  const raw = carrier.retryAfter
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw
  return undefined
}

/**
 * Berechnet die Wartezeit **vor** einem erneuten Versuch.
 *
 * **Zwei Quellen, eine Rangfolge:** nennt der Anbieter ein Fenster, gewinnt es
 * (gedeckelt). Sonst wird exponentiell gewachsen und gestreut.
 *
 * `attempt` ist die Nummer des **gerade gescheiterten** Versuchs: nach dem
 * ersten Fehlschlag ist es 1, und die Wartezeit ist die Grundwartezeit.
 *
 * @param policy - die aufgelöste Richtlinie
 * @param attempt - Nummer des gescheiterten Versuchs, ab 1
 * @param error - der Fehler, der die Wiederholung auslöst
 * @param random - Zufallsquelle in `[0, 1)`; austauschbar für Messungen
 * @returns die Wartezeit in Millisekunden, immer ≥ 0 und ≤ `maxDelayMs`
 */
export function delayForAttempt(
  policy: ResolvedRetryPolicy,
  attempt: number,
  error: LlmError,
  random: () => number = Math.random,
): number {
  const hint = policy.providerHint?.(error)
  if (hint !== undefined) return Math.min(hint, policy.maxDelayMs)

  const grown = policy.baseDelayMs * policy.multiplier ** (attempt - 1)
  const ceiling = Math.min(grown, policy.maxDelayMs)
  if (policy.jitter === 'none') return ceiling

  // Untergrenze: die halbe berechnete Wartezeit, aber nie über dem Deckel.
  const floor = policy.jitter === 'full' ? Math.min(ceiling, grown / 2) : ceiling / 2
  const spread = ceiling - floor
  if (spread <= 0) return ceiling
  return floor + random() * spread
}

// ---------------------------------------------------------------------------
// Der umschlossene Anbieter
// ---------------------------------------------------------------------------

/** Ein Bericht über einen gescheiterten Versuch — für Diagnose und Tests. */
export interface RetryAttemptReport {
  /** Nummer des gescheiterten Versuchs, ab 1. */
  readonly attempt: number
  /** Der Fehler dieses Versuchs. */
  readonly error: LlmError
  /** Wartezeit bis zum nächsten Versuch, in Millisekunden. */
  readonly delayMs: number
}

/** Einstellungen des wiederholenden Anbieters. */
export interface RetryProviderOptions {
  /** Der Anbieter, der tatsächlich angefragt wird. */
  readonly inner: LlmProvider
  /** Die Richtlinie; fehlende Felder werden aus den Vorgaben ergänzt. */
  readonly policy?: RetryPolicy
  /**
   * Wartefunktion. **Austauschbar, damit kein Test wirklich wartet.**
   *
   * Die Signatur bekommt das Abbruchsignal mit: ein Schlaf, der einen Abbruch
   * nicht bemerkt, hält den Loop bis zu 15 Sekunden fest, nachdem der Benutzer
   * gestoppt hat. Die Vorgabe weckt bei Abbruch sofort.
   */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Zufallsquelle für die Streuung, in `[0, 1)`. Vorgabe `Math.random`. */
  readonly random?: () => number
  /** Wird **vor** jeder Wartezeit gerufen. Wirft es, endet die Wiederholung. */
  readonly onRetry?: (report: RetryAttemptReport) => void
  /** Name des umschlossenen Anbieters; Vorgabe `<inner.name>+retry`. */
  readonly name?: string
}

/**
 * Wartet, weckt aber sofort bei Abbruch.
 *
 * **Warum das nicht `setTimeout` allein ist.** Ein Abbruch während der Wartezeit
 * ist der Normalfall: der Benutzer drückt Stopp, und die Wiederholung wartet
 * gerade 15 Sekunden. Ohne diese Funktion bleibt der Prozess so lange stehen.
 * Ein bereits abgebrochenes Signal wartet **gar nicht**.
 *
 * @param ms - Wartezeit in Millisekunden
 * @param signal - Abbruchsignal des Aufrufers
 * @returns ein Versprechen, das nach `ms` oder beim Abbruch erfüllt wird
 */
export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  if (signal?.aborted === true) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Ein Anbieter, der bei wiederholbaren Fehlern erneut anfragt.
 *
 * **Der Vertrag nach außen ist unverändert:** `complete()` liefert entweder ein
 * Ergebnis oder wirft {@link LlmError}. Neu ist nur, dass der geworfene Fehler
 * der des **letzten** Versuchs ist — mit dem Feld `attempts`, das die Zahl der
 * unternommenen Versuche nennt. Ohne diese Zahl könnte ein Aufrufer nicht
 * unterscheiden, ob ein Fehler sofort oder nach zwei Minuten kam.
 */
export class RetryProvider implements LlmProvider {
  readonly name: string
  readonly #inner: LlmProvider
  readonly #policy: ResolvedRetryPolicy
  readonly #sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  readonly #random: () => number
  readonly #onRetry: ((report: RetryAttemptReport) => void) | undefined

  /**
   * @param options - der umschlossene Anbieter, die Richtlinie und die
   *   austauschbaren Seiteneffekte (Schlaf, Zufall, Bericht)
   * @throws RangeError bei einer Richtlinie ohne sinnvolle Wiederholung
   */
  constructor(options: RetryProviderOptions) {
    this.#inner = options.inner
    this.#policy = resolveRetryPolicy(options.policy ?? {})
    this.#sleep = options.sleep ?? defaultSleep
    this.#random = options.random ?? Math.random
    this.#onRetry = options.onRetry
    this.name = options.name ?? `${options.inner.name}+retry`
  }

  /** Die aufgelöste Richtlinie — damit ein Aufrufer weiß, was gilt. */
  get policy(): ResolvedRetryPolicy {
    return this.#policy
  }

  /** {@inheritDoc LlmProvider.complete} */
  async complete(request: CompletionRequest): Promise<CompletionResult> {
    // Ein bereits abgebrochener Aufruf geht gar nicht erst hinaus. Ein Versuch
    // würde beim Anbieter als Anfrage ankommen, die niemand mehr will.
    if (request.signal?.aborted === true) {
      throw new LlmError('aborted', 'Anfrage wurde abgebrochen', { retryable: false })
    }

    let attempt = 1
    for (;;) {
      try {
        return await this.#inner.complete(request)
      } catch (cause) {
        const error = asLlmError(cause)
        const canRetry = attempt < this.#policy.maxAttempts && isRetryableNow(error, request.signal)
        if (!canRetry) {
          if (attempt > 1) attachAttempts(error, attempt)
          throw error
        }

        const delayMs = delayForAttempt(this.#policy, attempt, error, this.#random)
        this.#onRetry?.({ attempt, error, delayMs })
        await this.#sleep(delayMs, request.signal)

        // Nach dem Schlaf kann der Aufrufer abgebrochen haben. Dann ist der
        // nächste Versuch verboten — und zwar mit einem `aborted`, nicht mit
        // dem alten Fehler: der Abbruch ist die neuere Tatsache.
        //
        // Gelesen über eine Funktion: eine direkte Prüfung an dieser Stelle
        // verengt der Typechecker auf `never`, weil er den Schlaf oben als
        // „kehrt nur ohne Abbruch zurück" liest. Das ist eine Annahme über
        // fremden Code — die Vorgabe weckt bei Abbruch, eine eingesetzte
        // Wartefunktion muss das nicht tun.
        if (abortedNow(request.signal)) {
          throw new LlmError('aborted', 'Anfrage wurde während der Wartezeit abgebrochen', {
            retryable: false,
            cause: error,
          })
        }

        attempt += 1
        continue
      }
    }
  }
}

/**
 * Liest den Abbruchzustand eines Signals.
 *
 * **Warum das eine Funktion ist.** Ein direkter Zugriff auf `signal.aborted`
 * wird vom Typechecker über den umgebenden Ablauf verengt; hinter einem
 * `await` auf eine Wartefunktion leitet er daraus ab, ein Abbruch sei dort
 * unmöglich. Diese Ableitung ist eine Annahme über **fremden** Code: die
 * Vorgabe {@link defaultSleep} weckt bei Abbruch, eine eingesetzte
 * Wartefunktion muss das nicht tun. Die Funktion macht die Prüfung von dieser
 * Annahme unabhängig.
 *
 * @param signal - das Abbruchsignal, falls eines gesetzt ist
 * @returns `true`, wenn abgebrochen wurde
 */
function abortedNow(signal: AbortSignal | undefined): boolean {
  const aborted: boolean = signal?.aborted === true
  return aborted
}

/**
 * Entscheidet, ob ein Fehler **jetzt** wiederholt werden darf.
 *
 * Die Prüfung ist absichtlich eng: `retryable` **und** keine Abbruchart. Ein
 * fremder Anbieter, der `aborted` fälschlich als wiederholbar markiert, wird
 * hier gestoppt — die Regel „ein Abbruch wird nie wiederholt" ist keine
 * Empfehlung an Adapter, sondern eine Zusage dieses Pakets.
 *
 * @param error - der Fehler des Versuchs
 * @param signal - das Abbruchsignal des Aufrufers
 * @returns `true`, wenn ein weiterer Versuch erlaubt ist
 */
export function isRetryableNow(error: LlmError, signal?: AbortSignal): boolean {
  // Das Signal zuerst: ein Abbruch des Aufrufers ist die neuere und stärkere
  // Tatsache als jede Fehlerart.
  if (signal?.aborted === true) return false
  // Danach die harte Regel. Sie gilt auch dann, wenn ein fremder Anbieter
  // `retryable: true` zu `aborted` sagt.
  if (error.kind === 'aborted') return false
  // Über den Typ gelesen, nicht über die Verengung: `LlmError` ist eine Klasse,
  // keine unterscheidbare Vereinigung — der Typechecker leitet aus dem `kind`
  // oben sonst ab, `retryable` könne hier nur `false` sein.
  const retryable: boolean = error.retryable
  return retryable
}

/**
 * Hängt die Zahl der Versuche an einen Fehler — ohne {@link LlmError} zu ändern.
 *
 * **Warum angehängt und nicht im Konstruktor.** Der Seam-Typ gehört dem Seam;
 * ein Feld „Versuche" dort wäre eine Eigenschaft der Wiederholung. Ein Adapter
 * weiß nichts von Versuchen. Angehängt wird deshalb hier, an der Stelle, die
 * die Zahl kennt.
 *
 * @param error - der Fehler des letzten Versuchs
 * @param attempts - die Zahl der unternommenen Versuche
 */
function attachAttempts(error: LlmError, attempts: number): void {
  Object.defineProperty(error, 'attempts', {
    value: attempts,
    enumerable: true,
    configurable: true,
    writable: false,
  })
}

/**
 * Macht aus einem gefangenen Wert einen {@link LlmError}.
 *
 * **Warum das nötig ist.** Der Vertrag des Seams sagt „wirft `LlmError`". Ein
 * Anbieter, der sich nicht daran hält (ein roher `TypeError` aus einem
 * Programmierfehler), würde hier sonst als „nicht wiederholbar" durchfallen —
 * und das ist die richtige Lesart: einen Programmierfehler wiederholt man
 * nicht. Er wird aber in einen `LlmError` der Art `malformed` gehüllt, damit
 * der Loop **einen** Typ sieht.
 *
 * @param cause - der gefangene Wert
 * @returns ein `LlmError`
 */
export function asLlmError(cause: unknown): LlmError {
  if (cause instanceof LlmError) return cause
  const message = cause instanceof Error ? cause.message : String(cause)
  return new LlmError('malformed', `Anbieter warf einen Fehler außerhalb des Seams: ${message}`, {
    retryable: false,
    cause,
  })
}

// ---------------------------------------------------------------------------
// Kurzform
// ---------------------------------------------------------------------------

/**
 * Umschließt einen Anbieter mit einer Richtlinie.
 *
 * @param inner - der Anbieter
 * @param policy - die Richtlinie; ohne Angabe gelten die Vorgaben
 * @returns der wiederholende Anbieter
 */
export function withRetry(inner: LlmProvider, policy?: RetryPolicy): RetryProvider {
  return new RetryProvider(policy === undefined ? { inner } : { inner, policy })
}
