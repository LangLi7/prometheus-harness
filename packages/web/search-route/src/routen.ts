/**
 * Die Wege, ihre Preise und der Stichtag.
 *
 * ## Zwei Arten von „gratis"
 *
 * Lokal betriebene Dienste kosten je Suche nichts — unbegrenzt. Ein Freikontingent (Firecrawl
 * Cloud: 500 Suchen im Monat) kostet heute auch nichts, ist aber **knapp**: Ist es aufgebraucht,
 * kostet jede weitere Suche 0,0064 USD. Der Planer behandelt die beiden deshalb nicht gleich —
 * ein Vorrat wird geschont, indem er hinter die unbegrenzt freien Wege gelegt wird.
 *
 * @module @prometheus-harness/search-route
 */

/** Ab hier kostet der serverseitige Suchaufruf (2026-11-01 00:00 Beijing). */
export const STICHTAG = new Date('2026-10-31T16:00:00Z')

/** DeepSeek Search: 0,75 USD je 1 000 erfolgreiche Anfragen. */
export const PREIS_DEEPSEEK_USD = 0.75 / 1000

/** Firecrawl Cloud: 500 Suchen im Monat frei, danach Hobby-Tarif (16 USD / 2 500 Suchen). */
export const FIRECRAWL_FREI_SUCHEN = 500
export const PREIS_FIRECRAWL_CLOUD_USD = 16 / 2500

/** Was ein Aufrufer von einer Suche braucht. */
export type Bedarf = 'answer' | 'links' | 'extract' | 'render'

/** Die Kennung eines Wegs. */
export type WegId = 'searxng' | 'deepseek-server' | 'firecrawl' | 'firecrawl-cloud' | 'browser'

/** Grobe Ordnung; nur die Anzeige nutzt sie. */
export type Latenz = 'niedrig' | 'mittel' | 'hoch'

/** Was der Aufrufer über knappe Vorräte weiß. */
export interface Zustand {
  /** Wie viele Cloud-Suchen dieser Monat schon verbraucht hat. */
  readonly firecrawlCloudGenutzt: number
}

/** Ein Weg, den der Harness erreicht. */
export interface Weg {
  readonly id: WegId
  readonly label: string
  /** Der Vertrag: nur wenn der Bedarf hier steht, ist der Weg ein Kandidat. */
  readonly deckt: readonly Bedarf[]
  readonly latenz: Latenz
  /** Muss rein bleiben: gleicher Zustand und gleiche Uhr ergeben denselben Preis. */
  readonly kosten: (zustand: Zustand, jetzt: Date) => number
  readonly hinweis: string
}

/** Die Wege mit ihrem Preismodell. */
export const WEGE: readonly Weg[] = [
  {
    id: 'searxng',
    label: 'SearXNG',
    deckt: ['links'],
    latenz: 'niedrig',
    kosten: () => 0,
    hinweis: 'lokal, gratis und unbegrenzt, kein Modell-Turn, nur Snippets',
  },
  {
    id: 'deepseek-server',
    label: 'DeepSeek Server-Tool',
    deckt: ['answer', 'links'],
    latenz: 'mittel',
    kosten: (_zustand, jetzt) => (jetzt < STICHTAG ? 0 : PREIS_DEEPSEEK_USD),
    hinweis: 'ein Modell-Turn je Suche; liefert Antwort und Quellen',
  },
  {
    id: 'firecrawl',
    label: 'Firecrawl (lokal)',
    deckt: ['links', 'extract'],
    latenz: 'hoch',
    kosten: () => 0,
    hinweis: 'lokal betrieben, gratis und unbegrenzt, langsamer, liefert Markdown',
  },
  {
    id: 'firecrawl-cloud',
    label: 'Firecrawl (Cloud)',
    deckt: ['links', 'extract'],
    latenz: 'hoch',
    kosten: (zustand) =>
      zustand.firecrawlCloudGenutzt < FIRECRAWL_FREI_SUCHEN ? 0 : PREIS_FIRECRAWL_CLOUD_USD,
    hinweis: 'knapper Vorrat: 500 Suchen im Monat frei, danach kostenpflichtig',
  },
  {
    id: 'browser',
    label: 'Browser-Use',
    deckt: ['render'],
    latenz: 'hoch',
    kosten: () => Number.NaN,
    hinweis: 'kein Preis je Suche; jeder Schritt ist ein Modell-Turn',
  },
]

/**
 * Der Weg zu einer Kennung.
 *
 * @param id - die Kennung
 * @returns der Weg; wirft, wenn die Kennung unbekannt ist
 */
export function wegNach(id: WegId): Weg {
  const gefunden = WEGE.find((weg) => weg.id === id)
  if (gefunden === undefined) throw new Error(`unbekannter Weg: ${id}`)
  return gefunden
}

/** Ein frischer Zustand: noch kein knapper Vorrat verbraucht. */
export function leererZustand(): Zustand {
  return { firecrawlCloudGenutzt: 0 }
}
