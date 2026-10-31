/**
 * Suche und Abruf bei DeepSeek — zwei **rohe** Endpunkte, kein Server-Werkzeug.
 *
 * ## Der Befund, der den Aufbau bestimmt
 *
 * Die Ankündigung spricht von „Websuche und Abruf über die DeepSeek-API". Gemeint sind **zwei
 * eigene Endpunkte**, die dieser Harness heute **nicht** ruft:
 *
 * | Weg | Endpunkt | Antwort |
 * |---|---|---|
 * | Suche | `POST https://api.deepseek.com/v1/tools/search` | `results[]` mit `title`, `url`, `snippet`, `summary`, `content`, `rerank_score`, `authority` … |
 * | Abruf | `POST https://api.deepseek.com/v1/tools/fetch` | `{ title, content }` (Markdown) |
 *
 * Der bestehende Weg des Kerns (`@deepseek-ai/dsh-web-search-deepseek`) geht über
 * `/anthropic/v1/messages` mit dem **Server-Werkzeug** `web_search_20250305`. Laut
 * DeepSeek-Abrechnungsnotiz treffen genau diese serverseitigen Aufrufe „already … the Search and
 * Fetch APIs" — und sind **bis 2026-11-01 00:00 Beijing (2026-10-31 16:00 UTC) kostenfrei**.
 *
 * ## Was daraus folgt — und was dieses Paket deshalb NICHT tut
 *
 * Ein direkter Aufruf der beiden Endpunkte ist **sofort kostenpflichtig**; ein kostenfreies Fenster
 * ist für diesen Weg **nicht belegt**. Der Wechsel ist damit kein Upgrade, sondern ein Wechsel in
 * den bezahlten Pfad. Dieses Paket macht den Preis deshalb **sichtbar**, statt ihn zu verstecken:
 * jede Anfrage trägt `abrechenbar` und einen Kostenbetrag, und die Summe steht im Ergebnis.
 *
 * ## Kein Netz im Paket
 *
 * `hole` wird gereicht (Tests, Host). Das Paket kennt nur die Form der Anfrage und der Antwort.
 *
 * @module @prometheus-harness/deepseek-search-tools/client
 */

/** Die Basisadresse der DeepSeek-API. */
export const BASIS = 'https://api.deepseek.com'

/** Der Suchweg. */
export const WEG_SUCHE = '/v1/tools/search'

/** Der Abrufweg. */
export const WEG_ABRUF = '/v1/tools/fetch'

/**
 * Der Preis je **erfolgreicher** Anfrage in USD.
 *
 * Gemessen aus der Preisliste: **0,75 USD je 1 000 erfolgreiche Anfragen** — 0,00075 USD je Anfrage.
 * Erfolgreich heißt: HTTP 200 **und** Ergebnis (bei der Suche ein nicht-leeres `results`, beim Abruf
 * gelieferter Inhalt). `count` ist ausdrücklich **preisneutral**; Fehler, leere Suchen und Timeouts
 * sind nicht abrechenbar.
 */
export const PREIS_JE_ANFRAGE_USD = 0.00075

/**
 * Bis wann die **serverseitigen** Aufrufe (über Harness, Claude Code, Codex) kostenfrei sind.
 *
 * **Für den direkten Weg gilt das nicht** — dort ist kein kostenfreies Fenster belegt. Die Marke
 * steht hier, damit die Entscheidung ein Datum hat und nicht in einem Kommentar verfällt.
 */
export const SERVER_TOOL_FREI_BIS = '2026-10-31T16:00:00.000Z'

/** Ein Treffer der Suche. */
export interface Treffer {
  /** Der Titel. */
  title: string
  /** Die Adresse. */
  url: string
  /** Kurzfassung für eine Anzeige (100–200 Zeichen). */
  snippet: string
  /** Die Zusammenfassung für ein Modell (600–800 Zeichen). */
  summary: string
  /** Der Seiteninhalt, wenn `needContent` gesetzt war. */
  content: string
  /** Die Relevanz (0–3; ab 1,5 gilt als hochwertig). */
  rerankScore?: number
  /** Die Autorität (0–4; `-1` heißt unbekannt, ab 3 gilt als hochautoritativ). */
  authority?: number
  /** Der Seitenname, falls genannt. */
  siteName?: string
  /** Das Datum (RFC 3339), falls genannt. */
  datum?: string
}

/** Was eine Suche gekostet hat. */
export interface Suchkosten {
  /** Ob die Anfrage abrechenbar war (200 **und** Ergebnisse). */
  abrechenbar: boolean
  /** Die Kosten in USD (0, wenn nicht abrechenbar). */
  kostenUsd: number
  /** Wie viele Treffer kamen. */
  treffer: number
}

/** Das Ergebnis einer Suche. */
export interface Suchergebnis {
  /** Die Treffer in der Reihenfolge der API. */
  treffer: Treffer[]
  /** Was die Anfrage gekostet hat. */
  kosten: Suchkosten
}

/** Das Ergebnis eines Abrufs. */
export interface Abrufergebnis {
  /** Der Titel (leer, wenn unbekannt). */
  title: string
  /** Der Inhalt als Markdown. */
  content: string
  /** Ob die Anfrage abrechenbar war (200 **und** Inhalt). */
  abrechenbar: boolean
  /** Die Kosten in USD. */
  kostenUsd: number
}

/** Wie ein HTTP-Aufruf aussieht — gereicht, damit das Paket kein Netz kennt. */
export type Hole = (
  url: string,
  optionen: {
    method: 'POST'
    headers: Readonly<Record<string, string>>
    body: string
    signal?: AbortSignal
  },
) => Promise<{ status: number; text: string }>

/**
 * Der **echte** HTTP-Weg: globales `fetch` mit Zeitlimit.
 *
 * **Warum das hier steht und nicht beim Aufrufer.** Bis zum 19.10.2026 mußte jeder Aufrufer `hole`
 * selbst reichen — auch der Host. Aus einer JSON-Konfigurationsdatei ist das unmöglich, und damit
 * war die Suche im laufenden Host **nicht** einschaltbar. Diese Vorgabe schließt die Lücke: sie
 * kennt kein Geheimnis (der Schlüssel steht im Kopf, den der Aufrufer baut) und keine Sonderfälle.
 *
 * @param zeitlimitMs - Zeitlimit je Anfrage (Vorgabe 30 s)
 * @returns ein `Hole`, das wirklich sendet
 */
export function netzHole(zeitlimitMs: number = 30_000): Hole {
  return async (url, optionen) => {
    const antwort = await fetch(url, {
      method: optionen.method,
      headers: optionen.headers,
      body: optionen.body,
      signal: optionen.signal ?? AbortSignal.timeout(zeitlimitMs),
    })
    return { status: antwort.status, text: await antwort.text() }
  }
}

/** Ein Fehler der Search-API — mit Status, **ohne** Schlüssel. */
export class Suchfehler extends Error {
  /** Der HTTP-Status. */
  readonly status: number

  /**
   * @param status - der HTTP-Status
   * @param meldung - eine Meldung ohne Geheimnisse
   */
  constructor(status: number, meldung: string) {
    super(meldung)
    this.name = 'Suchfehler'
    this.status = status
  }
}

/**
 * Nimmt Geheimwerte aus einem Text, bevor er in einer Meldung landet.
 *
 * @param text - der rohe Text
 * @returns derselbe Text mit ersetzten Werten
 */
export function entschaerfe(text: string): string {
  return text.replace(/(api[_-]?key["'\s:=]+)([^\s"',}]+)/giu, '$1***').replace(/(Bearer\s+)[A-Za-z0-9._-]+/gu, '$1***')
}

/**
 * Prüft die Antwort und liefert den Text — oder wirft mit dem Status.
 *
 * @param status - der HTTP-Status
 * @param text - der Antworttext
 * @returns der geparste Körper
 */
function koerper(status: number, text: string): Record<string, unknown> {
  if (status !== 200) {
    throw new Suchfehler(status, `DeepSeek antwortete mit ${String(status)}: ${entschaerfe(text).slice(0, 200)}`)
  }
  let gelesen: unknown
  try {
    gelesen = JSON.parse(text)
  } catch {
    throw new Suchfehler(status, `die Antwort ist kein JSON (Anfang: ${entschaerfe(text).slice(0, 120)})`)
  }
  if (typeof gelesen !== 'object' || gelesen === null) {
    throw new Suchfehler(status, 'die Antwort ist JSON, aber kein Objekt')
  }
  return gelesen as Record<string, unknown>
}

/**
 * Liest einen Text, wenn vorhanden.
 *
 * @param wert - der Wert
 * @returns der Text oder `''`
 */
function text(wert: unknown): string {
  return typeof wert === 'string' ? wert : ''
}

/**
 * Sucht im Web.
 *
 * @param hole - der HTTP-Weg
 * @param feld - Schlüssel, Anfrage und Optionen
 * @returns Treffer und Kosten
 * @throws Suchfehler bei Status außerhalb 200
 */
export async function suche(
  hole: Hole,
  feld: {
    apiKey: string
    query: string
    count?: number
    needContent?: boolean
    oriQuestion?: string
    localization?: string
    signal?: AbortSignal
    basis?: string
  },
): Promise<Suchergebnis> {
  const query = feld.query.trim()
  if (query === '') throw new Suchfehler(0, 'eine leere Anfrage wird nicht gesucht')
  if (feld.apiKey.trim() === '') throw new Suchfehler(401, 'ohne Schluessel wird nicht gesucht')
  const count = feld.count ?? 10
  if (!Number.isSafeInteger(count) || count < 1 || count > 50) {
    throw new Suchfehler(400, `count muss eine ganze Zahl von 1 bis 50 sein, war ${String(count)}`)
  }
  const rumpf: Record<string, unknown> = { query, count }
  if (feld.needContent !== undefined) rumpf['need_content'] = feld.needContent
  if (feld.oriQuestion !== undefined && feld.oriQuestion.trim() !== '') rumpf['ori_question'] = feld.oriQuestion
  if (feld.localization !== undefined && feld.localization.trim() !== '') rumpf['localization'] = feld.localization

  const antwort = await hole(`${feld.basis ?? BASIS}${WEG_SUCHE}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${feld.apiKey}`,
      accept: 'application/json',
    },
    body: JSON.stringify(rumpf),
    ...(feld.signal === undefined ? {} : { signal: feld.signal }),
  })
  const gelesen = koerper(antwort.status, antwort.text)
  const roh = Array.isArray(gelesen['results']) ? gelesen['results'] : []
  const treffer: Treffer[] = []
  for (const eintrag of roh) {
    if (typeof eintrag !== 'object' || eintrag === null) continue
    const feldEintrag = eintrag as Record<string, unknown>
    const url = text(feldEintrag['url'])
    if (url === '') continue
    const trefferEintrag: Treffer = {
      title: text(feldEintrag['title']),
      url,
      snippet: text(feldEintrag['snippet']),
      summary: text(feldEintrag['summary']),
      content: text(feldEintrag['content']),
    }
    if (typeof feldEintrag['rerank_score'] === 'number') trefferEintrag.rerankScore = feldEintrag['rerank_score']
    if (typeof feldEintrag['authority'] === 'number') trefferEintrag.authority = feldEintrag['authority']
    if (typeof feldEintrag['site_name'] === 'string') trefferEintrag.siteName = feldEintrag['site_name']
    if (typeof feldEintrag['date'] === 'string') trefferEintrag.datum = feldEintrag['date']
    treffer.push(trefferEintrag)
  }
  const abrechenbar = treffer.length > 0
  return {
    treffer,
    kosten: {
      abrechenbar,
      kostenUsd: abrechenbar ? PREIS_JE_ANFRAGE_USD : 0,
      treffer: treffer.length,
    },
  }
}

/**
 * Ruft eine Seite ab.
 *
 * @param hole - der HTTP-Weg
 * @param feld - Schlüssel und Adresse
 * @returns Titel, Inhalt und Kosten
 * @throws Suchfehler bei Status außerhalb 200
 */
export async function abruf(
  hole: Hole,
  feld: { apiKey: string; url: string; signal?: AbortSignal; basis?: string },
): Promise<Abrufergebnis> {
  const adresse = feld.url.trim()
  if (adresse === '') throw new Suchfehler(0, 'ein leerer Abruf wird nicht gesendet')
  if (!/^https?:\/\/[^\s]+$/u.test(adresse)) throw new Suchfehler(400, `keine http(s)-Adresse: ${adresse.slice(0, 120)}`)
  if (adresse.length > 8192) throw new Suchfehler(400, 'die Adresse ist länger als 8192 Zeichen')
  if (feld.apiKey.trim() === '') throw new Suchfehler(401, 'ohne Schluessel wird nicht abgerufen')

  const antwort = await hole(`${feld.basis ?? BASIS}${WEG_ABRUF}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${feld.apiKey}`,
      accept: 'application/json',
    },
    body: JSON.stringify({ url: adresse }),
    ...(feld.signal === undefined ? {} : { signal: feld.signal }),
  })
  const gelesen = koerper(antwort.status, antwort.text)
  const inhalt = text(gelesen['content'])
  return {
    title: text(gelesen['title']),
    content: inhalt,
    abrechenbar: inhalt !== '',
    kostenUsd: inhalt === '' ? 0 : PREIS_JE_ANFRAGE_USD,
  }
}

/**
 * Rechnet die Kosten einer Anzahl erfolgreicher Anfragen.
 *
 * @param erfolgreich - wie viele Anfragen erfolgreich waren
 * @returns die Kosten in USD, auf acht Stellen gerundet
 */
export function kostenFuer(erfolgreich: number): number {
  if (!Number.isFinite(erfolgreich) || erfolgreich < 0) {
    throw new Error(`Anfragen muessen eine Zahl >= 0 sein, war ${String(erfolgreich)}`)
  }
  return Math.round(erfolgreich * PREIS_JE_ANFRAGE_USD * 1e8) / 1e8
}
