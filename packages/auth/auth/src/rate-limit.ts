/**
 * Drosselung (Rate Limiting) — der Riegel **vor** der teuren Arbeit.
 *
 * **Warum das überhaupt nötig ist.** Jede Passwortprüfung kostet 16 ms und 19 MiB
 * (siehe `@prometheus-harness/auth`). Ein Angreifer muss dafür **kein** Passwort
 * kennen: es genügt, Anmeldungen zu schicken. Ohne Drosselung ist der billigste
 * Angriff auf diesen Dienst kein Einbruch, sondern eine Überlastung — und die
 * trifft alle Benutzer.
 *
 * **Die Reihenfolge, die den Unterschied macht:**
 *
 * ```
 * Anfrage → 1. Drosselung (billig, im Speicher) → 2. Argon2id (teuer, 19 MiB)
 * ```
 *
 * Wer erst rechnet und dann zählt, hat den Angriff bereits bezahlt.
 *
 * **Was dieses Modul nicht ist.** Es ist keine Firewall und kein Ersatz für
 * Schutz gegen verteilte Angriffe. Eine Drosselung **je IP** lässt sich mit vielen
 * Adressen umgehen; deshalb wird hier zusätzlich **je Konto** gedrosselt. Beides
 * ist nötig, keines genügt.
 *
 * @module @prometheus-harness/auth/rate-limit
 */

/** Ein Zähler, der bis zum Ablauf hochzählt. */
export interface RateLimitHit {
  /** Ob die Handlung erlaubt ist. */
  readonly allowed: boolean
  /** Wie viele Versuche im aktuellen Fenster gezählt wurden (einschließlich diesem). */
  readonly count: number
  /** Die Grenze, gegen die gezählt wurde. */
  readonly limit: number
  /** Wie viele Versuche noch bleiben; `0`, wenn gesperrt. */
  readonly remaining: number
  /**
   * Wann wieder Platz ist, in Millisekunden. `0`, wenn nicht gesperrt.
   *
   * Der Wert gehört in die Antwort an den Client (`Retry-After`) — und er ist
   * auch für den Benutzer wichtig: „in 45 Sekunden nochmal" ist eine Auskunft,
   * „zu viele Versuche" ist keine.
   */
  readonly retryAfterMs: number
}

/**
 * Ein Zähler je Schlüssel.
 *
 * **Warum eine Schnittstelle und nicht direkt Redis.** Damit die
 * Drosselungsregeln ohne laufenden Redis geprüft werden können — und damit ein
 * einzelner Prozess sie ohne Abhängigkeit benutzen kann. Die Redis-Umsetzung
 * kommt in `@prometheus-harness/auth-redis`; sie ist die richtige Wahl, sobald
 * **mehr als ein Prozess** läuft, weil ein Zähler im Speicher eines Prozesses
 * bei zwei Prozessen doppelt so viele Versuche erlaubt.
 */
export interface RateLimiter {
  /**
   * Zählt einen Versuch und sagt, ob er erlaubt ist.
   *
   * Der erste Aufruf **zählt** bereits: „fragen, ob erlaubt" und „zählen" sind
   * hier eine Handlung. Getrennte Aufrufe würden bei einem gleichzeitigen
   * Doppelaufruf beide „erlaubt" hören.
   *
   * @param key - der Schlüssel, z. B. `login:ip:1.2.3.4`
   * @param limit - die Grenze im Fenster
   * @param windowMs - die Fensterlänge in Millisekunden
   * @returns das Urteil samt Rest und Wartezeit
   */
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitHit>
  /** Setzt einen Schlüssel zurück — nach einer erfolgreichen Anmeldung. */
  reset(key: string): Promise<void>
  /** Löscht alles. Nur für Tests. */
  clear(): Promise<void>
}

/**
 * Eine Regel: wie oft, in welchem Fenster, und wofür.
 *
 * **Die Zahlen sind eine Abwägung, keine Messung.** Sie müssen es auch sein:
 * „richtig" gibt es hier nicht, nur „zu locker" und „zu streng, sodass Menschen
 * ausgesperrt werden". Die Begründung je Regel:
 *
 * | Regel | Zahl | Warum genau so |
 * |---|---|---|
 * | {@link LOGIN_LIMITS.perAccount} | 5 je 15 min | ein Mensch vertippt sich zwei-, dreimal. Fünf ist großzügig; danach ist es kein Tippen mehr |
 * | {@link LOGIN_LIMITS.perIp} | 20 je 15 min | hinter einer IP können mehrere Menschen sitzen (Büro, Familie). Die IP-Grenze fängt den **Streu**-Angriff über viele Konten, die Kontogrenze den gezielten |
 * | {@link LOGIN_LIMITS.slowAfter} | Verzögerung statt Sperre | eine harte Sperre je IP trifft Unbeteiligte. Wenn eine IP auffällt, wird sie **langsam** statt abgewiesen |
 * | {@link REGISTER_LIMITS.perIp} | 3 je Stunde | Konten anlegen ist teuer (Argon2id) und selten nötig |
 */
export const LOGIN_LIMITS = {
  perAccount: { limit: 5, windowMs: 15 * 60 * 1000 },
  perIp: { limit: 20, windowMs: 15 * 60 * 1000 },
  slowAfter: { failures: 3, delayMs: 500 },
} as const

/** Grenzen für die Registrierung. */
export const REGISTER_LIMITS = {
  perIp: { limit: 3, windowMs: 60 * 60 * 1000 },
} as const

/** Grenzen für den Passwort-Reset. */
export const RESET_LIMITS = {
  perAccount: { limit: 3, windowMs: 60 * 60 * 1000 },
  perIp: { limit: 10, windowMs: 60 * 60 * 1000 },
} as const

/** Grenzen für Anfragen mit einem API-Schlüssel. */
export const API_KEY_LIMITS = {
  perKey: { limit: 600, windowMs: 60 * 1000 },
} as const

/**
 * Die Schlüssel, unter denen gedrosselt wird.
 *
 * **Warum das eigene Funktionen sind.** Ein Schlüssel, der aus Benutzereingaben
 * gebaut wird, ist eine Fuge: eine Adresse mit einem Doppelpunkt darin könnte
 * einen anderen Schlüssel erzeugen und damit eine fremde Grenze verbrauchen — oder
 * die eigene umgehen. Hier wird deshalb **jeder** Bestandteil kodiert.
 *
 * **Der eigene Fehler, der beim Testen auffiel (13.10.2026).** Die erste Fassung
 * schrieb `encodeURIComponent(email).toLowerCase()` — also **erst kodieren, dann
 * kleinschreiben**. Damit wurde aus `%3A` ein `%3a`, und dieselbe Adresse in
 * verschiedener Schreibweise erzeugte **zwei verschiedene Schlüssel**:
 *
 * ```
 * a:b@example.org  →  login:acct:a%3Ab%40example.org
 * A:B@example.org  →  login:acct:a%3ab%40example.org   ← anderer Zähler!
 * ```
 *
 * Die Folge wäre gewesen, dass ein Angreifer die Kontogrenze durch
 * Gross-/Kleinschreibung **verdoppelt** — und genau das soll die Grenze
 * verhindern. Richtig ist: **erst normalisieren, dann kodieren.**
 */
function encodedEmail(email: string): string {
  return encodeURIComponent(email.trim().toLowerCase())
}

export function loginAccountKey(email: string): string {
  return `login:acct:${encodedEmail(email)}`
}

export function loginIpKey(ip: string): string {
  return `login:ip:${ip}`
}

export function registerIpKey(ip: string): string {
  return `register:ip:${ip}`
}

export function resetAccountKey(email: string): string {
  return `reset:acct:${encodedEmail(email)}`
}

export function resetIpKey(ip: string): string {
  return `reset:ip:${ip}`
}

export function apiKeyKey(keyId: string): string {
  return `apikey:${keyId}`
}

// ---------------------------------------------------------------------------
// Zähler im Speicher
// ---------------------------------------------------------------------------

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Ein Zähler im Arbeitsspeicher — **nur für einen Prozess**.
 *
 * **Wann das genügt und wann nicht.** Genügt: bei einem einzelnen Prozess in der
 * Entwicklung und in Tests. Genügt **nicht**: sobald zwei Prozesse laufen, hat
 * jeder seinen eigenen Zähler — wer die Last verteilt, verdoppelt, verdreifacht
 * die erlaubten Versuche. Deshalb ist die Redis-Umsetzung die richtige für den
 * Betrieb, und dieser Zähler trägt eine ausdrückliche Warnung statt einer
 * stillen Annahme.
 *
 * **Warum ein gleitendes Fenster und kein fester Zähler je Kalenderminute.** Bei
 * festen Fenstern gibt es einen Sprung um die Fenstergrenze: um 14:59 fünf
 * Versuche, um 15:00 fünf weitere — zehn in zwei Sekunden. Das ist der
 * klassische Fehler, gegen den die Drosselung gerade helfen sollte.
 * Das Fenster hier **beginnt beim ersten Versuch** und läuft dann ab; damit gibt
 * es keinen Sprung.
 */
export class MemoryRateLimiter implements RateLimiter {
  readonly #buckets = new Map<string, Bucket>()
  readonly #now: () => number

  /**
   * @param now - Zeitquelle in Millisekunden; austauschbar, damit Tests die Uhr
   *   stellen können, statt zu warten
   */
  constructor(now: () => number = () => Date.now()) {
    this.#now = now
  }

  /** {@inheritDoc RateLimiter.hit} */
  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitHit> {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit muss ≥ 1 sein, ist ${String(limit)}`)
    if (!Number.isInteger(windowMs) || windowMs < 1) throw new RangeError(`windowMs muss ≥ 1 sein, ist ${String(windowMs)}`)

    const now = this.#now()
    const bucket = this.#buckets.get(key)
    if (bucket === undefined || bucket.resetAt <= now) {
      const fresh: Bucket = { count: 1, resetAt: now + windowMs }
      this.#buckets.set(key, fresh)
      return { allowed: true, count: 1, limit, remaining: limit - 1, retryAfterMs: 0 }
    }

    bucket.count += 1
    const allowed = bucket.count <= limit
    return {
      allowed,
      count: bucket.count,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterMs: allowed ? 0 : bucket.resetAt - now,
    }
  }

  /** {@inheritDoc RateLimiter.reset} */
  async reset(key: string): Promise<void> {
    this.#buckets.delete(key)
  }

  /** {@inheritDoc RateLimiter.clear} */
  async clear(): Promise<void> {
    this.#buckets.clear()
  }

  /**
   * Entfernt abgelaufene Zähler.
   *
   * **Warum das nötig ist.** Ohne Aufräumen wächst die Karte mit jedem Schlüssel,
   * der je gesehen wurde — bei einem Angriff über viele IP-Adressen ist das ein
   * **Speicherleck**, das der Angreifer steuert. Wer den Angriff über die Anzahl
   * der Anfragen führt, kann so den Prozess umbringen.
   *
   * @returns die Zahl der entfernten Zähler
   */
  sweep(): number {
    const now = this.#now()
    let removed = 0
    for (const [key, bucket] of this.#buckets) {
      if (bucket.resetAt <= now) {
        this.#buckets.delete(key)
        removed += 1
      }
    }
    return removed
  }

  /** Wie viele Schlüssel gerade verfolgt werden — für Tests und Diagnose. */
  get size(): number {
    return this.#buckets.size
  }
}

// ---------------------------------------------------------------------------
// Verbund mehrerer Regeln
// ---------------------------------------------------------------------------

/** Das Urteil über mehrere Regeln: die strengste gewinnt. */
export interface CompoundLimitHit {
  readonly allowed: boolean
  /** Die Regel, die zugeschlagen hat — `undefined`, wenn keine. */
  readonly blockedBy: string | undefined
  /** Die längste genannte Wartezeit aller geprüften Regeln. */
  readonly retryAfterMs: number
  /** Die Einzelurteile, in Prüfreihenfolge. */
  readonly hits: readonly { readonly key: string; readonly hit: RateLimitHit }[]
}

/**
 * Prüft mehrere Regeln und lässt **alle** zählen.
 *
 * **Warum alle zählen müssen, auch wenn die erste schon sperrt.** Würde nach dem
 * ersten Treffer abgebrochen, könnte ein Angreifer eine einzelne Regel
 * „verbrauchen" und dann mit der anderen **ungestört** weiterarbeiten: die
 * IP-Grenze sperrt, aber der Kontozähler bleibt bei 0 — obwohl gerade zwanzig
 * Versuche auf dasselbe Konto liefen. Alle Zähler mitzuzählen ist die einzige
 * Form, in der die Grenzen zusammen wirken statt nacheinander.
 *
 * @param limiter - der Zähler
 * @param checks - die Regeln mit ihrem Schlüssel
 * @returns das strengste Urteil
 */
export async function hitAll(
  limiter: RateLimiter,
  checks: readonly { readonly key: string; readonly limit: number; readonly windowMs: number }[],
): Promise<CompoundLimitHit> {
  const hits: { key: string; hit: RateLimitHit }[] = []
  let blockedBy: string | undefined
  let retryAfterMs = 0

  for (const check of checks) {
    const hit = await limiter.hit(check.key, check.limit, check.windowMs)
    hits.push({ key: check.key, hit })
    if (!hit.allowed && blockedBy === undefined) blockedBy = check.key
    if (hit.retryAfterMs > retryAfterMs) retryAfterMs = hit.retryAfterMs
  }

  return { allowed: blockedBy === undefined, blockedBy, retryAfterMs, hits }
}

/**
 * Wartet eine steigende Verzögerung ab, abhängig von der Zahl der Fehlversuche.
 *
 * **Warum Verzögerung statt harter Sperre.** Eine harte Sperre je IP trifft
 * Unbeteiligte: in einem Büro sitzen viele Menschen hinter einer Adresse. Eine
 * Verzögerung trifft nur den, der weiter probiert — und sie wächst, sodass
 * Durchprobieren unrentabel wird, ohne je ganz zu blockieren.
 *
 * **Was hier ausdrücklich nicht passiert:** die Verzögerung **verrät nichts**.
 * Sie hängt an der Zahl der Fehlversuche für diese Kombination, nicht daran, ob
 * das Konto existiert — und sie wird nur bei einem Fehlversuch angewandt, nie bei
 * einem Treffer.
 *
 * @param failures - Zahl der Fehlversuche bisher
 * @param sleep - Wartefunktion; austauschbar, damit Tests nicht warten
 * @returns die tatsächlich gewartete Zeit in Millisekunden
 */
export async function applyBackoff(
  failures: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<number> {
  if (failures < LOGIN_LIMITS.slowAfter.failures) return 0
  const steps = failures - LOGIN_LIMITS.slowAfter.failures + 1
  // Gedeckelt, damit ein Angreifer den Server nicht mit Wartezeiten zusetzt:
  // eine Warteschlange voller schlafender Anfragen ist selbst eine Überlastung.
  const delay = Math.min(LOGIN_LIMITS.slowAfter.delayMs * 2 ** (steps - 1), 4000)
  await sleep(delay)
  return delay
}
