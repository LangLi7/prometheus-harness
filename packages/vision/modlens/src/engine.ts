/**
 * Die Engine: Kommando bauen, Antwort lesen — zwei kleine Funktionen mit harter Kante.
 *
 * ## Warum nicht HTTP
 *
 * Die modlens-CLI wird als **Kindprozeß** gerufen (`process.execPath` + `dist/main.js`), nicht über
 * eine Bibliothek und nicht über `npx`. Das ist nicht Bequemlichkeit: das Paket bringt seine Engine
 * selbst mit, und `npx` würde bei jedem Aufruf eine Auflösung im Netz versuchen. Der Pfad zum
 * Einstieg ist eine **Angabe** (`cliPfad`) und keine Annahme — dieses Paket kennt kein Benutzerhome.
 *
 * ## Warum die Antwort geprüft und nicht geglaubt wird
 *
 * Die CLI gibt **ein** JSON-Objekt aus: `{ image, provider, result, meta }`. `result` ist die
 * Evidenz (OCR, Layout, Semantik, Unsicherheiten). Fehlt `result` oder `summary`, ist die Antwort
 * kein Leseergebnis — dann wird **geworfen**, statt ein leeres Ergebnis an das Modell zu reichen.
 * Ein leeres Ergebnis würde wie „das Bild ist leer" aussehen.
 *
 * @module @prometheus-harness/modlens/engine
 */

/** Ein Bildauftrag. */
export interface Bildauftrag {
  /** Lokaler Pfad oder `http(s)`-URL. */
  bild: string
  /** Zusätzlicher Fokus für das Modell. */
  prompt?: string
  /** Zeitlimit in Millisekunden (Vorgabe 180 000 — wie die CLI). */
  timeoutMs?: number
  /** Ein Anbieter, festgelegt statt der Kette. */
  provider?: string
  /** Ein Modell, festgelegt. */
  modell?: string
}

/** Ein fertiger Aufruf. */
export interface Aufruf {
  /** Das Programm (`process.execPath`). */
  programm: string
  /** Die Argumente, in Reihenfolge. */
  argumente: string[]
}

/** Ein Layout-Bereich der Evidenz. */
export interface Region {
  /** Die Art (`title`, `paragraph`, `table`, …) — eine **offene** Menge. */
  type: string
  /** Die Lesereihenfolge, ab 1. */
  reading_order: number
  /** Der Text dieses Bereichs. */
  text: string
}

/** Die strukturierte Evidenz — der Vertrag der CLI (Fassung 2). */
export interface Evidenz {
  /** Kurzfassung. */
  summary: string
  /** Der erkannte Text. */
  ocr: { full_text: string; lines?: { text: string; language?: string }[] }
  /** Die Anordnung. */
  layout: { regions: Region[] }
  /** Was zu sehen ist und wie es zusammenhängt. */
  semantics: {
    scene: string
    intent?: string
    entities?: { name: string; type: string; evidence?: string }[]
    relations?: { subject: string; predicate: string; object: string }[]
  }
  /** Gestalt: Farben, Stil, Notizen (alle Felder optional, aber der Block ist Pflicht). */
  visual?: { dominant_colors?: string[]; style?: string; notes?: string[] }
  /** Was unsicher bleibt. */
  uncertainty: string[]
}

/** Eine gelesene Antwort. */
export interface Antwort {
  /** Das Bild, das gelesen wurde. */
  bild: string
  /** Wer es gelesen hat. */
  provider: string
  /** Welches Modell geantwortet hat (`null`, wenn der Anbieter keins nennt). */
  model: string | null
  /** Die Evidenz. */
  evidenz: Evidenz
  /** Hinweise, etwa ein Wechsel im Anbieter. */
  warnungen: string[]
  /** Wie lange es dauerte, falls gemeldet. */
  dauerSekunden?: number
}

/** Das Standard-Zeitlimit der CLI. */
export const STANDARD_ZEITLIMIT_MS = 180_000

/**
 * Baut den Aufruf der CLI.
 *
 * @param cliPfad - der Pfad zu `dist/main.js` der modlens-CLI
 * @param auftrag - das Bild und die Grenzen
 * @param programm - das Programm, das die CLI startet (Vorgabe: `process.execPath`)
 * @returns Programm und Argumente
 */
export function baueAufruf(cliPfad: string, auftrag: Bildauftrag, programm: string = process.execPath): Aufruf {
  if (cliPfad.trim() === '') throw new Error('ohne Pfad zur modlens-CLI gibt es keinen Aufruf')
  if (auftrag.bild.trim() === '') throw new Error('ein Bildauftrag ohne Bild wird nicht gebaut')
  const zeitlimit = auftrag.timeoutMs ?? STANDARD_ZEITLIMIT_MS
  if (!Number.isSafeInteger(zeitlimit) || zeitlimit < 1) {
    throw new Error(`timeoutMs muss eine ganze Zahl >= 1 sein, war ${String(zeitlimit)}`)
  }
  const argumente = [cliPfad, '-i', auftrag.bild, '--timeout', String(zeitlimit)]
  if (auftrag.prompt !== undefined && auftrag.prompt.trim() !== '') {
    argumente.push('--prompt', auftrag.prompt)
  }
  if (auftrag.provider !== undefined && auftrag.provider.trim() !== '') {
    argumente.push('-p', auftrag.provider)
  }
  if (auftrag.modell !== undefined && auftrag.modell.trim() !== '') {
    argumente.push('-m', auftrag.modell)
  }
  return { programm, argumente }
}

/**
 * Liest die Antwort der CLI.
 *
 * @param stdout - die Ausgabe
 * @returns Bild, Anbieter, Modell, Evidenz und Warnungen
 * @throws Error wenn die Ausgabe kein Leseergebnis ist
 */
export function liesAntwort(stdout: string): Antwort {
  const text = stdout.trim()
  if (text === '') throw new Error('die modlens-CLI gab nichts aus')
  let gelesen: unknown
  try {
    gelesen = JSON.parse(text)
  } catch {
    throw new Error(`die Ausgabe der modlens-CLI ist kein JSON (Anfang: ${text.slice(0, 120)})`)
  }
  if (typeof gelesen !== 'object' || gelesen === null) {
    throw new Error('die Ausgabe der modlens-CLI ist JSON, aber kein Objekt')
  }
  const feld = gelesen as Record<string, unknown>
  const ergebnis = feld['result']
  if (typeof ergebnis !== 'object' || ergebnis === null) {
    throw new Error('die modlens-Antwort traegt kein "result" — das ist kein Leseergebnis')
  }
  const evidenz = ergebnis as Record<string, unknown>
  if (typeof evidenz['summary'] !== 'string' || evidenz['summary'].trim() === '') {
    throw new Error('die modlens-Evidenz traegt keine "summary"')
  }
  const meta = typeof feld['meta'] === 'object' && feld['meta'] !== null
    ? feld['meta'] as Record<string, unknown>
    : {}
  const antwort: Antwort = {
    bild: typeof feld['image'] === 'string' ? feld['image'] : '',
    provider: typeof feld['provider'] === 'string' ? feld['provider'] : '',
    model: typeof meta['model'] === 'string' ? meta['model'] : null,
    evidenz: ergebnis as Evidenz,
    warnungen: Array.isArray(meta['warnings'])
      ? meta['warnings'].filter((warnung): warnung is string => typeof warnung === 'string')
      : [],
  }
  if (typeof meta['durationSeconds'] === 'number') antwort.dauerSekunden = meta['durationSeconds']
  return antwort
}
