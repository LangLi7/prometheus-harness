/**
 * Der Speicher je Nutzer — eine Datei pro Person, nie eine pro Rechner.
 *
 * ## Warum das der eigentliche Unterschied zum Harness ist
 *
 * Der Harness schreibt **alle** Aufrufe in `$DSH_HOME/usage-budget/usage.json` (5 835 545 B,
 * 17 812 Datensätze am 18.10.2026) und teilt sie über den Schlüsselnamen auf. Bei einem Benutzer je
 * Rechner trägt das; bei mehreren nicht. Hier liegt der Verbrauch unter
 * `<verzeichnis>/<nutzer>/usage.json` — **eine** Datei je Person. Ein fremder Verbrauch ist durch
 * den Pfad unerreichbar, nicht durch eine Abfrage.
 *
 * ## Warum die Zahl der Datensätze begrenzt ist
 *
 * Die Datei wird als Ganzes gelesen und geschrieben. Der Harness kappt bei 20 000 (`MAX_RECORDS`,
 * `index.js:47`) und verwirft die **ältesten**. Dieselbe Grenze hier: sie ist billig, nachprüfbar,
 * und ihr Überschreiten ist ein benannter Verlust statt eines wachsenden Lesewegs.
 *
 * ## Was passiert, wenn die Datei kaputt ist
 *
 * Ein abgebrochener Schreibvorgang hinterläßt entweder die alte oder die neue Datei (temporär +
 * umbenennen). Ist die Datei trotzdem kein JSON — etwa von Hand verändert —, wird sie **leer**
 * gelesen, und der nächste Schreibvorgang legt sie sauber an. Ein JSON-Dokument, das kein Objekt
 * ist, wird dagegen **abgewiesen**: es sieht aus wie Verbrauch und ist keiner.
 *
 * @module @prometheus-harness/usage-budget/store
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { Verbrauch } from './types.ts'

/**
 * Was ein Nutzername im Pfad sein darf.
 *
 * Dieselbe Form wie in `packages/crew/plan/src/scope.ts` — bewusst hier noch einmal, weil eine
 * gemeinsame Hilfsdatei zwischen zwei Paketen, die nichts voneinander wissen müssen, mehr Kopplung
 * wäre als Nutzen. Wer sie ändert, ändert beide.
 */
export const NUTZER_MUSTER = /^[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$/

/** Wie viele Datensätze je Nutzer gehalten werden, wenn niemand etwas anderes sagt. */
export const HOECHSTZAHL_STANDARD = 20_000

/** Die Fassung des Dateiformats. */
export const FASSUNG = 1

/** Wie der Speicher gebaut wird. */
export interface Speicheroptionen {
  /** Das Verzeichnis der Verbrauchsdateien; fehlt es, bleibt alles im Arbeitsspeicher. */
  verzeichnis?: string
  /** Die Uhr; im Test setzbar. */
  jetzt?: () => Date
  /** Wie viele Datensätze je Nutzer gehalten werden. */
  hoechstzahl?: number
}

/** Was ein Anhängen bewirkt hat. */
export interface Aufnahme {
  /** Wie viele Datensätze übernommen wurden. */
  aufgenommen: number
  /** Wie viele verworfen wurden, weil sie keine brauchbaren Zahlen trugen. */
  verworfen: number
  /** Wie viele **alte** Datensätze der Grenze zum Opfer fielen. */
  verdraengt: number
  /** Wie viele Datensätze der Nutzer danach hat. */
  gesamt: number
}

/**
 * Der Speicher für Verbrauchszeilen.
 *
 * **Ein Speicher je Verzeichnis.** Zwei Speicher auf demselben Verzeichnis hätten zwei Ketten und
 * würden einander überschreiben; der Aufrufer hält deshalb **einen**.
 */
export class Verbrauchsspeicher {
  private readonly wurzel: string | undefined
  private readonly jetzt: () => Date
  private readonly hoechstzahl: number
  private readonly kette = new Map<string, Promise<unknown>>()
  private readonly imSpeicher = new Map<string, Verbrauch[]>()

  /**
   * @param optionen - Verzeichnis, Uhr und Grenze
   */
  constructor(optionen: Speicheroptionen = {}) {
    this.wurzel = optionen.verzeichnis
    this.jetzt = optionen.jetzt ?? (() => new Date())
    this.hoechstzahl = optionen.hoechstzahl ?? HOECHSTZAHL_STANDARD
    if (!Number.isSafeInteger(this.hoechstzahl) || this.hoechstzahl < 1) {
      throw new Error(`hoechstzahl muss eine ganze Zahl >= 1 sein, war ${String(optionen.hoechstzahl)}`)
    }
  }

  /** Das Verzeichnis der Dateien; `undefined` heißt „nur im Arbeitsspeicher". */
  get verzeichnis(): string | undefined {
    return this.wurzel
  }

  /** Die Grenze, ab der alte Datensätze verdrängt werden. */
  get grenze(): number {
    return this.hoechstzahl
  }

  /**
   * Der Pfad der Datei eines Nutzers.
   *
   * @param nutzer - der Nutzer
   * @returns `<verzeichnis>/<nutzer>/usage.json` oder `undefined` ohne Verzeichnis
   * @throws Error wenn der Name nicht als Pfadsegment taugt
   */
  pfadVon(nutzer: string): string | undefined {
    if (!NUTZER_MUSTER.test(nutzer)) {
      throw new Error(`Nutzername "${nutzer}" taugt nicht als Pfadsegment (erlaubt: Buchstaben, Ziffern, - _ .)`)
    }
    if (this.wurzel === undefined) return undefined
    return join(this.wurzel, nutzer, 'usage.json')
  }

  /**
   * Liest den Verbrauch eines Nutzers.
   *
   * @param nutzer - der Nutzer
   * @returns die Zeilen in der Reihenfolge der Ablage (nie `undefined`)
   */
  async lesen(nutzer: string): Promise<Verbrauch[]> {
    const pfad = this.pfadVon(nutzer)
    if (pfad === undefined) return this.imSpeicher.get(nutzer) ?? []
    let roh: string
    try {
      roh = await readFile(pfad, 'utf8')
    } catch {
      return []
    }
    let gelesen: unknown
    try {
      gelesen = JSON.parse(roh)
    } catch {
      return []
    }
    if (typeof gelesen !== 'object' || gelesen === null || Array.isArray(gelesen)) {
      throw new Error(`${pfad}: die Datei ist JSON, aber kein Verbrauchsobjekt`)
    }
    const form = gelesen as { fassung?: unknown; nutzer?: unknown; verbrauch?: unknown }
    if (form.fassung !== FASSUNG) {
      throw new Error(`${pfad}: unbekannte Fassung (${String(form.fassung)})`)
    }
    if (typeof form.nutzer === 'string' && form.nutzer !== nutzer) {
      throw new Error(`${pfad}: die Datei gehoert "${form.nutzer}", nicht "${nutzer}"`)
    }
    return Array.isArray(form.verbrauch) ? form.verbrauch.filter(istBrauchbar) : []
  }

  /**
   * Hängt Verbrauch an — atomar und je Nutzer serialisiert.
   *
   * @param nutzer - der Nutzer
   * @param verbraeuche - die neuen Zeilen
   * @returns was das Anhängen bewirkt hat
   */
  async anhaengen(nutzer: string, verbraeuche: readonly Verbrauch[]): Promise<Aufnahme> {
    const lauf = this.reiht(nutzer, async (): Promise<Aufnahme> => {
      const bisher = await this.lesen(nutzer)
      const brauchbar: Verbrauch[] = []
      let verworfen = 0
      for (const verbrauch of verbraeuche) {
        if (istBrauchbar(verbrauch) && verbrauch.nutzer === nutzer) brauchbar.push(verbrauch)
        else verworfen += 1
      }
      const alle = [...bisher, ...brauchbar].sort((a, b) => (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0))
      const verdraengt = Math.max(0, alle.length - this.hoechstzahl)
      const behalten = verdraengt > 0 ? alle.slice(verdraengt) : alle
      await this.schreibe(nutzer, behalten)
      return { aufgenommen: brauchbar.length, verworfen, verdraengt, gesamt: behalten.length }
    })
    return lauf
  }

  private reiht<T>(nutzer: string, lauf: () => Promise<T>): Promise<T> {
    const vorher = this.kette.get(nutzer) ?? Promise.resolve()
    const naechste = vorher.then(lauf, lauf)
    this.kette.set(
      nutzer,
      naechste.then(
        () => {
          if (this.kette.get(nutzer) === naechste) this.kette.delete(nutzer)
        },
        () => {
          if (this.kette.get(nutzer) === naechste) this.kette.delete(nutzer)
        },
      ),
    )
    return naechste
  }

  private async schreibe(nutzer: string, zeilen: Verbrauch[]): Promise<void> {
    const pfad = this.pfadVon(nutzer)
    if (pfad === undefined) {
      this.imSpeicher.set(nutzer, zeilen)
      return
    }
    await mkdir(dirname(pfad), { recursive: true })
    const zwischen = `${pfad}.${String(process.pid)}.tmp`
    const inhalt = JSON.stringify({ fassung: FASSUNG, nutzer, geschriebenAm: this.jetzt().toISOString(), verbrauch: zeilen })
    await writeFile(zwischen, inhalt, 'utf8')
    await rename(zwischen, pfad)
  }
}

/**
 * Prüft, ob ein Eintrag als Verbrauch brauchbar ist.
 *
 * **Warum geprüft und nicht geglaubt.** Eine Zeile ohne Zahl oder ohne Zeit ist kein Verbrauch; sie
 * stillschweigend zu übernehmen verfälschte die Summe, sie zu verwerfen und zu **zählen** ist die
 * ehrliche Hälfte.
 *
 * @param wert - der geprüfte Wert
 * @returns ob er als Verbrauch brauchbar ist
 */
export function istBrauchbar(wert: unknown): wert is Verbrauch {
  if (typeof wert !== 'object' || wert === null) return false
  const feld = wert as Record<string, unknown>
  return typeof feld['zeit'] === 'string'
    && Number.isFinite(Date.parse(feld['zeit']))
    && typeof feld['nutzer'] === 'string'
    && feld['nutzer'] !== ''
    && typeof feld['schluessel'] === 'string'
    && typeof feld['familie'] === 'string'
    && typeof feld['modell'] === 'string'
    && typeof feld['hinein'] === 'number'
    && Number.isFinite(feld['hinein'])
    && typeof feld['heraus'] === 'number'
    && Number.isFinite(feld['heraus'])
    && (feld['herkunft'] === 'gemessen' || feld['herkunft'] === 'geschaetzt' || feld['herkunft'] === 'gemischt')
}
