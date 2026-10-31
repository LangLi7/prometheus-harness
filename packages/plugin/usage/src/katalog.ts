/**
 * Der Bildmodell-Katalog — **welche** Modelle es gibt, nicht nur die vier mit Preis.
 *
 * ## Warum das nötig wurde
 *
 * Der Betreiber am 21.10.2026, mit einem Bildschirmfoto der Auswahlliste: *„hmm beim bilder ist es
 * nur das, sollte es nicht mehr geben?"* Er hatte recht: die Liste kam aus den vier **Ankern** in
 * `@prometheus-harness/usage-ansicht` — also aus den Modellen, für die ein Preis gemessen ist.
 * Das ist die falsche Menge: sie beantwortet „wofür kenne ich den Preis", nicht „was kann ich
 * wählen".
 *
 * Der offene Katalog von OpenRouter nennt am 21.10.2026 **468** Modelle, davon **12** mit
 * Bild-Ausgabe (10 echte und 2 `auto`-Varianten).
 *
 * ## Warum der Katalog den Preis nicht ersetzt
 *
 * `pricing.image` ist im Katalog meist **nicht** gesetzt, und wo es steht, ist es ein Token-Preis
 * (0,0000003 USD) und kein Preis je Bild. Ein daraus gerechneter Bildpreis wäre erfunden. Der
 * Katalog liefert deshalb **die Auswahl**; der Preis kommt weiter aus dem gemessenen Anker — und
 * wo kein Anker ist, gibt es **keine Zahl**, sondern den Grund.
 *
 * @module @prometheus-harness/usage/katalog
 */

/** Der offene Modellkatalog. */
export const WEG_KATALOG = 'https://openrouter.ai/api/v1/models'

/** Wie lange ein geholter Katalog gilt. */
export const KATALOG_FRIST_MS = 10 * 60_000

/** Ein Modell, das Bilder ausgeben kann. */
export interface Bildmodell {
  /** Die Kennung, wie der Anbieter sie nennt. */
  readonly modell: string
  /** Der Anzeigename, wenn der Katalog einen nennt. */
  readonly name?: string
}

/**
 * Liest die Bildmodelle aus dem Katalog.
 *
 * **Nur `output_modalities`.** Ein Modell, das Bilder *versteht* (Eingabe), aber Text ausgibt, ist
 * kein Bildmodell. Die Liste der Ausgaben ist die einzige ehrliche Antwort auf die Frage.
 *
 * Die `auto`-Varianten (`openrouter/auto`, `openrouter/auto-beta`) fliegen heraus: sie sind keine
 * Modelle, sondern eine Weiterleitung — als Zeile in einer Preistabelle wären sie eine Lüge.
 *
 * @param json - die gelesene Antwort
 * @returns die Modelle in Katalogreihenfolge, ohne Doppelte
 */
export function liesBildmodelle(json: unknown): Bildmodell[] {
  if (typeof json !== 'object' || json === null) return []
  const liste = (json as { data?: unknown }).data
  if (!Array.isArray(liste)) return []
  const gesehen = new Set<string>()
  const aus: Bildmodell[] = []
  for (const eintrag of liste) {
    if (typeof eintrag !== 'object' || eintrag === null) continue
    const feld = eintrag as Record<string, unknown>
    const kennung = feld['id']
    if (typeof kennung !== 'string' || kennung.trim() === '') continue
    if (kennung.startsWith('openrouter/')) continue
    const architektur = feld['architecture']
    if (typeof architektur !== 'object' || architektur === null) continue
    const ausgaben = (architektur as { output_modalities?: unknown }).output_modalities
    if (!Array.isArray(ausgaben) || !ausgaben.includes('image')) continue
    if (gesehen.has(kennung)) continue
    gesehen.add(kennung)
    const name = feld['name']
    aus.push({
      modell: kennung,
      ...(typeof name === 'string' && name.trim() !== '' ? { name } : {}),
    })
  }
  return aus
}

/** Was ein Katalogabruf ergeben hat. */
export interface Katalogstand {
  readonly modelle: readonly Bildmodell[]
  /** Wann der Katalog geholt wurde (ISO 8601) oder `null`. */
  readonly geholtAm: string | null
  /** Warum der Katalog fehlt — **nie** stillschweigend. */
  readonly fehler?: string
}

/**
 * Holt den Katalog und hält ihn eine Weile.
 *
 * **Warum ein Zwischenspeicher.** Die Route wird bei jedem Öffnen des Panels gerufen; ein Abruf
 * von 468 Modellen je Klick wäre eine Last ohne Gewinn. Zehn Minuten sind kurz genug, daß ein
 * neues Modell am selben Tag erscheint, und lang genug, daß niemand es merkt.
 */
export class Katalog {
  private stand: Katalogstand = { modelle: [], geholtAm: null }
  private geholt = 0
  private lauf: Promise<Katalogstand> | undefined
  private readonly abruf: typeof fetch
  private readonly jetzt: () => Date
  private readonly weg: string

  /**
   * @param optionen - Abruf, Uhr und Adresse (im Test setzbar)
   */
  constructor(optionen: { abruf?: typeof fetch; jetzt?: () => Date; weg?: string } = {}) {
    this.abruf = optionen.abruf ?? fetch
    this.jetzt = optionen.jetzt ?? (() => new Date())
    this.weg = optionen.weg ?? WEG_KATALOG
  }

  /**
   * Der aktuelle Stand; holt nur, wenn er alt ist oder `frisch` es verlangt.
   *
   * @param frisch - erzwingt einen Abruf
   * @returns der Stand
   */
  async hole(frisch = false): Promise<Katalogstand> {
    const jetzt = this.jetzt().getTime()
    if (!frisch && this.stand.geholtAm !== null && jetzt - this.geholt < KATALOG_FRIST_MS) {
      return this.stand
    }
    if (this.lauf !== undefined) return this.lauf
    this.lauf = this.erneuere()
    try {
      return await this.lauf
    } finally {
      this.lauf = undefined
    }
  }

  /** Ein Abruf; ein Fehler läßt den alten Stand stehen und nennt den Grund. */
  private async erneuere(): Promise<Katalogstand> {
    try {
      const antwort = await this.abruf(this.weg, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      })
      if (!antwort.ok) throw new Error(`HTTP ${String(antwort.status)}`)
      const modelle = liesBildmodelle((await antwort.json()) as unknown)
      if (modelle.length === 0) throw new Error('der Katalog nannte kein Bildmodell')
      this.stand = { modelle, geholtAm: this.jetzt().toISOString() }
      this.geholt = this.jetzt().getTime()
    } catch (problem) {
      const fehler = problem instanceof Error ? problem.message : String(problem)
      // Der alte Stand bleibt — aber der Fehler steht daneben.
      this.stand = { ...this.stand, fehler: `Katalog nicht erreichbar: ${fehler}` }
    }
    return this.stand
  }
}
