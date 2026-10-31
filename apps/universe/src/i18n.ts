/**
 * Sprache — der Kern.
 *
 * **Was der Betreiber will:** „sprache nicht vergessen das wir auf englisch standard und deutsch
 * unterstuetzen diese sprache fuer den harness wird durch eine language package/plugin
 * implementiert, wie beim Visual studio code extension verstehst du?"
 *
 * Genau so ist es hier gebaut, und zwar aus **zwei** Teilen:
 *
 *   1. **`i18n.ts` (diese Datei)** — der Kern. Er kennt **keine** Sprache. Er kennt nur
 *      Schluessel, eine aktive Sprache und eine Liste von Paketen. Er haelt keinen einzigen
 *      deutschen oder englischen Satz.
 *
 *   2. **Die Sprachpakete** (`locales/de.ts`, `locales/en.ts`) — reine Daten, eingetragen als
 *      **Plugins** (`locale-de`, `locale-en`). Wer Japanisch will, schreibt `locales/ja.ts` und
 *      traegt ein Plugin ein; am Kern aendert sich **nichts**.
 *
 * **Warum nicht die Saetze direkt in den Bauteilen.** Ein Satz im Code ist eine Sprache im Code.
 * Mit dem Aufruf `t('panel.search')` steht im Bauteil **was** es bedeutet, nicht **wie** es
 * klingt — und ein fehlender Satz ist kein Absturz, sondern ein sichtbarer Schluessel.
 *
 * **Warum die Standardsprache Englisch ist.** Der Betreiber hat es festgelegt: „englisch
 * standard und deutsch unterstuetzen". Wer nichts gesetzt hat, bekommt Englisch.
 *
 * **Fallback ist keine Ausnahme, sondern der Normalfall.** Ein Paket wird nie vollstaendig sein
 * (siehe Skizze, siehe Harness). Fehlt ein Schluessel, wird in der **Standardsprache** gesucht;
 * fehlt er auch dort, kommt der Schluessel selbst zurueck. Ein leeres Feld waere schlimmer: man
 * saehe nicht, dass etwas fehlt.
 */

/** Der Standard, wenn nichts gesetzt ist. */
export const DEFAULT_LOCALE = 'en'

/**
 * Ein Sprachpaket.
 *
 * `messages` ist **flach** — `'panel.search': 'Search'`, nicht verschachtelt. Ein flacher Schluessel
 * ist im Terminal lesbar (`lang missing`), diffbar und ohne Laufzeit-Rekursion. Wer Gliederung
 * will, gliedert mit Punkten im Namen.
 */
export interface LocalePack {
  /** Z. B. `de`, `en`, `de-CH`. */
  readonly id: string
  /** Der Name **in dieser Sprache** — so sucht man sich eine Sprache aus. */
  readonly label: string
  /** Englischer Name, damit man ein Paket auch aus fremder Sicht erkennt. */
  readonly english: string
  readonly messages: Readonly<Record<string, string>>
}

/** Ein Ort, an dem Werte eingesetzt werden: `t('hits', { n: 3 })` → `3 Treffer`. */
export type Vars = Readonly<Record<string, string | number>>

export interface Translator {
  /** Die aktive Sprache. */
  readonly locale: string
  /** Uebersetzt. Fehlt der Schluessel, kommt er selbst zurueck — nie `undefined`, nie leer. */
  readonly t: (key: string, vars?: Vars) => string
}

/**
 * Setzt `{name}`-Platzhalter ein.
 *
 * Bewusst **kein** `Intl.MessageFormat` und keine Mehrzahlregeln: das braucht eine Bibliothek und
 * eine Fehlerquelle mehr. Zwei Formen — Einzahl und Mehrzahl — deckt der Aufrufer ab, indem er
 * den passenden Schluessel waehlt (`hits.one`, `hits.many`). Das ist ehrlicher als eine Regel,
 * die fuer die naechste Sprache doch nicht stimmt.
 */
export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (ganz, name: string) => {
    const value = vars[name]
    return value === undefined ? ganz : String(value)
  })
}

/**
 * Die Sprachverwaltung.
 *
 * Sie ist **kein** Plugin, sondern der Kern, den die Sprachpakete bedienen. Ein Paket kennt nur
 * seine Saetze; wer sie findet, entscheidet diese Klasse. Damit kann ein Paket abgeschaltet
 * werden und die Oberflaeche faellt auf die Standardsprache zurueck — statt leer zu bleiben.
 */
export class Locales {
  private readonly packs = new Map<string, LocalePack>()
  private aktuelle: string = DEFAULT_LOCALE
  private readonly listeners = new Set<() => void>()

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Traegt ein Paket ein.
   *
   * Ein zweites Paket mit derselben Kennung **ersetzt** das erste: so kann ein Nutzer eine
   * Sprache ueberschreiben, ohne den Kern zu beruehren. Das ist der Unterschied zwischen einem
   * Paket und einer eingebauten Sprache.
   */
  register(pack: LocalePack): void {
    this.packs.set(pack.id, pack)
    this.emit()
  }

  /** Nimmt ein Paket heraus — z. B. wenn ein Sprach-Plugin abgeschaltet wird. */
  unregister(id: string): boolean {
    const hatte = this.packs.delete(id)
    // Faellt die aktive Sprache weg, muss die Standardsprache einspringen. Sonst zeigte die
    // Oberflaeche ploetzlich Schluessel, obwohl ein Paket vorhanden ist.
    if (hatte && this.aktuelle === id) this.set(DEFAULT_LOCALE)
    this.emit()
    return hatte
  }

  has(id: string): boolean {
    return this.packs.has(id)
  }

  /** Alle eingetragenen Pakete, Standardsprache zuerst — so steht die Auswahl ruhig. */
  list(): readonly LocalePack[] {
    return [...this.packs.values()].sort((a, b) => {
      if (a.id === DEFAULT_LOCALE) return -1
      if (b.id === DEFAULT_LOCALE) return 1
      return a.id.localeCompare(b.id)
    })
  }

  /** Die aktive Sprache. */
  get locale(): string {
    return this.aktuelle
  }

  /**
   * Setzt die Sprache.
   *
   * Eine unbekannte Sprache wird **nicht** gesetzt: wer `de` verlangt, wo kein Paket liegt,
   * bekommt nicht stillschweigend Englisch, sondern gar nichts — der Aufruf gibt `false` zurueck
   * und der Aufrufer kann es melden. Stillschweigend etwas anderes zu tun waere die unangenehmste
   * Form von Fehler.
   */
  set(id: string): boolean {
    if (!this.packs.has(id)) return false
    if (this.aktuelle === id) return true
    this.aktuelle = id
    this.emit()
    return true
  }

  /** Der Uebersetzer fuer die aktuelle Sprache. */
  translator(): Translator {
    const key = this.aktuelle
    return { locale: key, t: (schluessel, vars) => this.lookup(schluessel, vars, key) }
  }

  /**
   * Sucht einen Schluessel: aktive Sprache → Standardsprache → Schluessel selbst.
   *
   * Der letzte Schritt ist der wichtigste. Ohne ihn waere ein fehlender Satz ein leeres Feld,
   * und man wuerde den Fehler im Layout suchen statt im Paket.
   */
  lookup(schluessel: string, vars?: Vars, from: string = this.aktuelle): string {
    const eigen = this.packs.get(from)?.messages[schluessel]
    if (eigen !== undefined) return interpolate(eigen, vars)
    const standard = this.packs.get(DEFAULT_LOCALE)?.messages[schluessel]
    if (standard !== undefined) return interpolate(standard, vars)
    return schluessel
  }

  /**
   * Was fehlt — fuer den Befehl `lang missing`.
   *
   * **Warum das ein Befehl ist und keine Behauptung.** „Ist vollstaendig uebersetzt" laesst sich
   * nicht versprechen, aber **nachzaehlen**. Diese Liste ist die Wahrheit darueber, und sie
   * gehoert in einen Gesundheitsbericht, nicht in eine Fussnote.
   */
  missing(id: string = this.aktuelle): readonly string[] {
    const soll = this.packs.get(DEFAULT_LOCALE)?.messages ?? {}
    const ist = this.packs.get(id)?.messages ?? {}
    return Object.keys(soll)
      .filter((key) => ist[key] === undefined)
      .sort()
  }

  /** Schluessel, die es nur in dieser Sprache gibt — meist ein Tippfehler. */
  extra(id: string): readonly string[] {
    const soll = this.packs.get(DEFAULT_LOCALE)?.messages ?? {}
    const ist = this.packs.get(id)?.messages ?? {}
    return Object.keys(ist)
      .filter((key) => soll[key] === undefined)
      .sort()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

/**
 * Die Sprache, die zum Browser passt — als **Vorschlag**, nicht als Festlegung.
 *
 * `navigator.language` ist `de-CH` fuer die Schweiz; das Paket heisst `de`. Deshalb wird
 * zunaechst genau, dann auf der Hauptkennung gesucht. Wer eine Sprache gesetzt hat, behaelt sie:
 * diese Funktion entscheidet nur den **ersten** Start.
 */
export function detectLocale(candidates: readonly string[], fallback: string = DEFAULT_LOCALE): string {
  const sprachen: readonly string[] = [
    ...(globalThis.navigator?.languages ?? []),
    globalThis.navigator?.language ?? '',
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  for (const sprache of sprachen) {
    const genau = sprache.toLowerCase()
    if (candidates.includes(genau)) return genau
    const haupt = genau.split('-')[0]
    if (haupt && candidates.includes(haupt)) return haupt
  }
  return candidates.includes(fallback) ? fallback : (candidates[0] ?? fallback)
}
