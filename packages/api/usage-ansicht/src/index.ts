/**
 * **Verbrauch und Schätzung** — wieviel Geld ist weg, und was kostet das nächste Bild?
 *
 * ## Warum das ein eigenes Plugin ist
 *
 * Der Betreiber kennt „Usage" aus dem alten Harness: *„dort zeigt es an wie viel budget nutzung ect
 * … das würde ich zb hier auch nutzen das es als skill oder bzw der harness eine kosten schätzung
 * macht wie viel ein bild generierung kostet"* (21.10.2026).
 *
 * Drei Fragen, drei Antworten — **eine** Umsetzung:
 *
 * 1. **`GET /api/ai/usage`** — der Verbrauch des Schlüssels als JSON (gesperrt wie die übrigen
 *    KI-Flächen: ohne Anmeldung 401).
 * 2. **Werkzeug `ai_usage`** — damit ich selbst fragen kann, ohne einen HTTP-Aufruf zu bauen.
 * 3. **Befehl `/verbrauch` (de) bzw. `/usage` (en)** — für den Menschen.
 *
 * ## Was „gemessen" hier heißt
 *
 * Der Verbrauch kommt **vom Anbieter** (`GET /api/v1/key`): `usage`, `usage_daily`, `limit`,
 * `limit_remaining`. Das ist keine Schätzung, das ist die Abrechnung.
 *
 * Die **Kostenschätzung** ist dagegen eine Schätzung und steht als solche im Text: sie stützt sich
 * auf **eine** gemessene Zahl (0,0387 USD für ein Bild 1344 × 768 mit `gemini-2.5-flash-image`)
 * und skaliert über die Pixelzahl. Was nicht gemessen ist, wird nicht behauptet.
 *
 * @module @prometheus-harness/usage-ansicht
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Context } from '@deepseek-ai/cordis'

import { abweisung, alsKernWerkzeug, schluesselquelle } from '@prometheus-harness/ai-capabilities'

/** Der stabile Plugin-Name. */
export const name = 'pmh-usage'

/** Ohne Webserver gibt es keine Fläche zu bedienen. */
export const inject = ['webServer']

/** Wo der Verbrauch steht. */
export const WEG_NUTZUNG = '/api/ai/usage'

/** Der Weg zum Schlüssel beim Anbieter. */
export const WEG_SCHLUESSEL = 'https://openrouter.ai/api/v1/key'

/** Was ein Schlüssel verbraucht hat. */
export interface Verbrauch {
  /** Was insgesamt abgerechnet wurde, in USD. */
  readonly verbrauchtUsd?: number
  /** Was heute abgerechnet wurde. */
  readonly heuteUsd?: number
  /** Das Monatslimit des Schlüssels, wenn gesetzt. */
  readonly limitUsd?: number
  /** Was davon übrig ist. */
  readonly restUsd?: number
}

/**
 * Liest den Verbrauch aus der Antwort des Anbieters.
 *
 * **Warum das eine eigene Funktion ist.** Die Form der Antwort ist die Stelle, an der ein Fehler
 * still bliebe: fehlt `data`, sähe alles nach 0 $ aus. Hier wird geprüft, und was fehlt, fehlt.
 *
 * @param json - der gelesene Körper
 * @returns der Verbrauch, soweit er dasteht
 */
export function liesVerbrauch(json: unknown): Verbrauch {
  if (json === null || typeof json !== 'object') return {}
  const daten = (json as Record<string, unknown>)['data']
  if (daten === null || typeof daten !== 'object') return {}
  const satz = daten as Record<string, unknown>
  const zahl = (feld: string): number | undefined => {
    const wert = satz[feld]
    return typeof wert === 'number' && Number.isFinite(wert) ? wert : undefined
  }
  const verbrauchtUsd = zahl('usage')
  const heuteUsd = zahl('usage_daily')
  const limitUsd = zahl('limit')
  const restUsd = zahl('limit_remaining')
  return {
    ...(verbrauchtUsd === undefined ? {} : { verbrauchtUsd }),
    ...(heuteUsd === undefined ? {} : { heuteUsd }),
    ...(limitUsd === undefined ? {} : { limitUsd }),
    ...(restUsd === undefined ? {} : { restUsd }),
  }
}

/**
 * Holt den Verbrauch beim Anbieter.
 *
 * @param schluessel - der Schlüssel
 * @param abruf - der HTTP-Abruf (für Prüfungen ersetzbar)
 * @returns der Verbrauch
 */
export async function holeVerbrauch(
  schluessel: string,
  abruf: typeof fetch = fetch,
): Promise<Verbrauch> {
  const antwort = await abruf(WEG_SCHLUESSEL, {
    headers: { authorization: `Bearer ${schluessel}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!antwort.ok) {
    throw new Error(`Der Anbieter nannte seinen Verbrauch nicht (HTTP ${String(antwort.status)}).`)
  }
  return liesVerbrauch(await antwort.json())
}

/**
 * Was ein Bild voraussichtlich kostet — **eine Schätzung mit genannter Grundlage**.
 *
 * **Die gemessene Zahl:** 0,0387 USD für 1344 × 768 mit `google/gemini-2.5-flash-image`
 * (21.10.2026, `usage.cost` aus der Antwort). Sie ist der Anker; alles andere wird daraus
 * abgeleitet und heißt deshalb „abgeleitet".
 */
const ANKER: Readonly<Record<string, { usd: number; herkunft: 'gemessen' | 'abgeleitet' }>> = {
  'google/gemini-2.5-flash-image': { usd: 0.0387, herkunft: 'gemessen' },
  // Doppelter Tokenpreis laut Modellliste (0,00006 gegen 0,00003 $/Token) — gerechnet, nicht gemessen.
  'google/gemini-3.1-flash-image': { usd: 0.0774, herkunft: 'abgeleitet' },
  'google/gemini-nano-banana-2.1': { usd: 0.0387, herkunft: 'abgeleitet' },
  'google/gemini-3-pro-image': { usd: 0.1548, herkunft: 'abgeleitet' },
}

/** Die Pixelzahl je Auflösungsstufe — Grundlage der Skalierung. */
const PIXEL: Readonly<Record<string, number>> = {
  '512': 512 * 512,
  '768': 768 * 768,
  '1K': 1024 * 1024,
  '1.5K': 1536 * 1536,
  '2K': 2048 * 2048,
  '4K': 4096 * 4096,
}

/** Die gemessene Grundfläche: 1344 × 768. */
const ANKER_PIXEL = 1344 * 768

/**
 * Die Modelle, deren Preis bekannt ist — für Anzeigen, die eine Auswahl brauchen.
 *
 * **Warum das hier steht und nicht im Panel.** Die Anker sind die eine Wahrheit über Bildpreise.
 * Eine zweite Liste in der Oberfläche wäre eine zweite Wahrheit — und die wäre irgendwann falsch.
 */
export const BILDPREISE: readonly {
  readonly modell: string
  readonly usd: number
  readonly herkunft: 'gemessen' | 'abgeleitet'
}[] = Object.entries(ANKER).map(([modell, anker]) => ({
  modell,
  usd: anker.usd,
  herkunft: anker.herkunft,
}))

/** Die Auflösungsstufen, die die Schätzung kennt — in der Reihenfolge der Anzeige. */
export const PIXELSTUFEN: readonly string[] = Object.keys(PIXEL)

/** Eine Schätzung — mit Grundlage, nie ohne. */
export interface Schaetzung {
  /** Die geschätzten Kosten in USD, oder `undefined`, wenn es keinen Anker gibt. */
  readonly usd?: number
  /** Worauf die Zahl beruht — in einem Satz, den man lesen kann. */
  readonly grund: string
}

/**
 * Schätzt die Kosten eines Bildauftrags.
 *
 * @param modell - die Modellkennung
 * @param optionen - Anzahl und Auflösung
 * @returns die Schätzung
 */
export function schaetzeBildkosten(
  modell: string,
  optionen: { readonly anzahl?: number; readonly aufloesung?: string } = {},
): Schaetzung {
  const anker = ANKER[modell]
  if (anker === undefined) {
    return { grund: `Für „${modell}" ist kein Preis gemessen — keine Schätzung ohne Grundlage.` }
  }
  const anzahl = optionen.anzahl ?? 1
  const pixel = optionen.aufloesung === undefined ? ANKER_PIXEL : (PIXEL[optionen.aufloesung] ?? ANKER_PIXEL)
  const usd = anker.usd * anzahl * (pixel / ANKER_PIXEL)
  return {
    usd,
    grund:
      `Basis: ${String(anker.usd)} USD für 1344 × 768 (${anker.herkunft})` +
      `, × ${String(anzahl)} Bild(er) à ${String(pixel)} Pixel. Eine Schätzung, keine Messung.`,
  }
}

/** Wo die Sprache des Menschen herkommt. */
type Sprache = 'de' | 'en'

/**
 * Liest die eingestellte Sprache.
 *
 * **Die Reihenfolge:** der Einstellungsdienst des Hosts, dann `PMH_SPRACHE`, dann Deutsch. Eine
 * fehlende Einstellung ist kein Fehler — sie ist „noch nichts gewählt".
 *
 * @param ctx - der Plugin-Kontext
 * @returns die Sprache
 */
function sprache(ctx: Context): Sprache {
  const dienst = ctx.get('settings') as { get?: (schluessel: string) => unknown } | undefined
  for (const feld of ['locale', 'language', 'sprache']) {
    const wert = dienst?.get?.(feld)
    if (typeof wert === 'string' && wert.trim() !== '') {
      return wert.toLowerCase().startsWith('en') ? 'en' : 'de'
    }
  }
  const ausUmgebung = process.env['PMH_SPRACHE']
  return ausUmgebung !== undefined && ausUmgebung.toLowerCase().startsWith('en') ? 'en' : 'de'
}

/** Die Texte in beiden Sprachen — bewußt neben dem Code, nicht in einer Datei. */
const TEXTE = {
  de: {
    befehl: 'verbrauch',
    beschreibung: 'Zeigt, wieviel der KI-Schlüssel verbraucht hat und was das nächste Bild schätzt.',
    werkzeug: 'Fragt den Verbrauch des KI-Schlüssels ab (USD, heute, Limit, Rest).',
    titel: 'Verbrauch',
  },
  en: {
    befehl: 'usage',
    beschreibung: 'Shows how much the AI key has spent and what the next image would cost.',
    werkzeug: 'Reports the AI key usage (USD, today, limit, remaining).',
    titel: 'Usage',
  },
} as const

/**
 * Formt den Verbrauch als Text — für Befehl und Werkzeug.
 *
 * @param verbrauch - der Verbrauch
 * @param sprache - die Sprache
 * @returns der Text
 */
export function alsText(verbrauch: Verbrauch, sprache: Sprache = 'de'): string {
  const teil = (wert: number | undefined): string => (wert === undefined ? '—' : `${wert.toFixed(4)} USD`)
  if (sprache === 'en') {
    return [
      `Spent: ${teil(verbrauch.verbrauchtUsd)}`,
      `Today: ${teil(verbrauch.heuteUsd)}`,
      `Limit: ${teil(verbrauch.limitUsd)}`,
      `Remaining: ${teil(verbrauch.restUsd)}`,
    ].join('\n')
  }
  return [
    `Verbraucht: ${teil(verbrauch.verbrauchtUsd)}`,
    `Heute: ${teil(verbrauch.heuteUsd)}`,
    `Limit: ${teil(verbrauch.limitUsd)}`,
    `Rest: ${teil(verbrauch.restUsd)}`,
  ].join('\n')
}

/**
 * Macht den Handler für `GET /api/ai/usage`.
 *
 * @param ctx - der Plugin-Kontext
 * @returns der Handler
 */
function macheHandler(ctx: Context): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const status = abweisung(ctx, req.headers)
    if (status !== undefined) {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ fehler: status === 401 ? 'nicht angemeldet' : 'kein Verbindungsdienst' }))
      return
    }
    const schluessel = await schluesselquelle(ctx)()
    if (schluessel === undefined) {
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ fehler: 'kein Schlüssel hinterlegt' }))
      return
    }
    try {
      const verbrauch = await holeVerbrauch(schluessel)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ verbrauch }))
    } catch (fehler) {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ fehler: fehler instanceof Error ? fehler.message : String(fehler) }))
    }
  }
}

/**
 * Hängt Fläche, Werkzeug und Befehl ein — jedes nur, wenn der Dienst da ist.
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  const spracheJetzt = sprache(ctx)
  const texte = TEXTE[spracheJetzt]
  // **Eine laute Zeile beim Laden** — siehe die Begründung in `command-bild`: ohne sie ist
  // „nicht angezeigt" nicht von „nicht geladen" zu unterscheiden.
  console.log(`[${name}] geladen (Sprache: ${spracheJetzt}, Befehl: /${TEXTE[spracheJetzt].befehl})`)

  ctx.effect(() => {
    const abgemeldet: (() => void)[] = [ctx.webServer.register({ kind: 'exact', path: WEG_NUTZUNG, handler: macheHandler(ctx) })]

    const werkzeuge = ctx.get('tools') as
      | { register?: (definition: unknown) => () => void }
      | undefined
    if (werkzeuge !== undefined && typeof werkzeuge.register === 'function') {
      abgemeldet.push(
        // **Über die Brücke, nicht von Hand.** Ein Werkzeug des Kerns verlangt
        // `output { schema, render }`; eine Registrierung ohne dieses Feld wirft beim Einhängen
        // („tool \"ai_usage\" must declare output …") und nimmt dabei **die ganze Datei** mit —
        // also auch die Route und den Befehl. Gemessen am 21.10.2026 im Schattenstart. Die Brücke
        // in `ai-capabilities` erzeugt genau diese Form; sie hier nachzubauen wäre eine zweite
        // Wahrheit über denselben Vertrag.
        werkzeuge.register(
          alsKernWerkzeug({
            name: 'ai_usage',
            description: texte.werkzeug,
            parameters: { type: 'object', properties: {}, required: [] },
            execute: async (): Promise<string> => {
              const schluessel = await schluesselquelle(ctx)()
              if (schluessel === undefined) throw new Error('Kein Schlüssel hinterlegt.')
              return alsText(await holeVerbrauch(schluessel), spracheJetzt)
            },
          }),
        ),
      )
    }

    const befehle = ctx.get('commands') as
      | { register?: (definition: unknown) => () => void }
      | undefined
    if (befehle !== undefined && typeof befehle.register === 'function') {
      // **Beide Namen** — aus demselben Grund wie bei `/bild`: die Sprache des Browsers und die
      // des Servers sind nicht dasselbe, und ein Befehl, den man tippt und der nicht existiert,
      // ist schlimmer als zwei Einträge im Menü.
      for (const s of ['de', 'en'] as const) {
        abgemeldet.push(
          befehle.register({
            name: TEXTE[s].befehl,
            description: TEXTE[s].beschreibung,
            handler: async () => {
              const schluessel = await schluesselquelle(ctx)()
              if (schluessel === undefined) return { kind: 'error', text: 'Kein Schlüssel hinterlegt.' }
              try {
                return { kind: 'success', text: alsText(await holeVerbrauch(schluessel), spracheJetzt) }
              } catch (fehler) {
                return { kind: 'error', text: fehler instanceof Error ? fehler.message : String(fehler) }
              }
            },
          }),
        )
      }
    }

    return () => {
      for (const ab of abgemeldet) ab()
    }
  }, `${name} ${texte.titel}`)
}

export default apply
