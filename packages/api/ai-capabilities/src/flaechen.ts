/**
 * Die HTTP-Flächen des Plugins — `GET /api/ai/capabilities` und fünf POST-Wege.
 *
 * ## Warum die Flächen getrennt von der Kette stehen
 *
 * Die Kette weiß, **wer** etwas kann; eine Fläche weiß, **wie** man danach fragt. Diese Trennung
 * ist der Grund, warum die Handler ohne Host prüfbar sind: sie bekommen eine Funktion, die eine
 * Kette liefert, und ein `IncomingMessage`/`ServerResponse`-Paar — mehr nicht.
 *
 * ## Die Reihenfolge jeder Anfrage
 *
 * 1. **Die Sperre** (`abweisung`) — wer nicht angemeldet ist, erfährt nicht, welche Methoden die
 *    Adresse kennt.
 * 2. **Die Methode** — alles außer POST ergibt 405 mit `Allow`.
 * 3. **Der Körper** — mit Obergrenze, damit ein großer Körper nicht den Speicher füllt.
 * 4. **Die Arbeit** — und ein Fehler des Anbieters wird **mit seinem Status** durchgereicht
 *    (429 bleibt 429), damit der Aufrufer den Unterschied zwischen „falsch gefragt" und „Grenze
 *    erreicht" sieht.
 *
 * ## Warum die Handler `async` sind
 *
 * Der Webserver ignoriert den Rückgabewert; für die Prüfung ist er Gold: ein Test kann
 * `await handler(req, res)` schreiben und danach die Antwort lesen. Ohne das müßte er raten, wann
 * die innere Zusage fertig ist — und ein Test, der auf `setTimeout` wartet, ist ein Test, der
 * gelegentlich falsch grün ist.
 *
 * @module @prometheus-harness/ai-capabilities/flaechen
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  FAEHIGKEITEN,
  KeinAnbieterError,
  NAME_DER_FAEHIGKEIT,
  type Faehigkeit,
  type Schema,
} from '@prometheus-harness/capabilities'
import { OpenrouterFehler } from '@prometheus-harness/openrouter'

import { FLAECHEN_FAEHIGKEITEN, type Kette } from './kette.ts'

/** Was die Handler brauchen. */
export interface Flaechenkontext {
  /** Baut die Kette — bei jedem Aufruf, damit eine geänderte Datei sofort wirkt. */
  readonly kette: () => Promise<Kette>
  /** Die Anmelde- und Zaunprüfung des Hosts: `undefined` heißt erlaubt. */
  readonly abweisung: (headers: IncomingMessage['headers']) => number | undefined
}

/** Der Name, den die Antworten über sich selbst nennen. */
export const SERVICE_NAME = '@prometheus-harness/ai-capabilities'

/** Die Fassung dieses Pakets. */
export const SERVICE_VERSION = '0.1.0'

/** Die Obergrenze für einen Textkörper — 1 MiB ist für Frage, Lage und Schema reichlich. */
export const TEXT_MAX = 1024 * 1024

/** Die Obergrenze für Ton — Base64 eines längeren Diktats braucht Platz. */
export const TON_MAX = 32 * 1024 * 1024

// ---------------------------------------------------------------------------
// Antworten
// ---------------------------------------------------------------------------

/**
 * Schreibt JSON mit Länge und ohne Zwischenspeicher.
 *
 * @param res - die Antwort
 * @param status - der Statuscode
 * @param wert - der Körper
 */
function sendeJson(res: ServerResponse, status: number, wert: unknown): void {
  const roh = Buffer.from(JSON.stringify(wert, null, 2), 'utf8')
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(roh.byteLength))
  res.setHeader('Cache-Control', 'no-store')
  res.end(roh)
}

/**
 * Schreibt Bytes — ein Bild oder Ton.
 *
 * @param res - die Antwort
 * @param status - der Statuscode
 * @param bytes - die Bytes
 * @param typ - der Inhaltstyp
 */
function sendeBytes(res: ServerResponse, status: number, bytes: Uint8Array, typ: string): void {
  res.statusCode = status
  res.setHeader('Content-Type', typ)
  res.setHeader('Content-Length', String(bytes.byteLength))
  // Ein Bild ist teuer und ändert sich nicht: eine Stunde Zwischenspeicher ist hier richtig.
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.end(Buffer.from(bytes))
}

/** Der Status einer Verweigerung als Fehlertext. */
const ABWEISUNGSTEXT: Readonly<Record<number, string>> = {
  401: 'unauthenticated',
  403: 'untrusted_origin',
  503: 'unavailable',
}

/**
 * Prüft die Sperre und antwortet, wenn sie greift.
 *
 * @param ctx - der Kontext
 * @param req - die Anfrage
 * @param res - die Antwort
 * @returns ob bereits geantwortet wurde
 */
function verweigert(ctx: Flaechenkontext, req: IncomingMessage, res: ServerResponse): boolean {
  const status = ctx.abweisung(req.headers)
  if (status === undefined) return false
  sendeJson(res, status, {
    status: 'error',
    error: ABWEISUNGSTEXT[status] ?? 'unavailable',
  })
  return true
}

/**
 * Prüft die Methode.
 *
 * @param req - die Anfrage
 * @param res - die Antwort
 * @param erlaubt - die erlaubten Methoden
 * @returns ob bereits geantwortet wurde
 */
function falscheMethode(req: IncomingMessage, res: ServerResponse, erlaubt: readonly string[]): boolean {
  const methode = req.method ?? 'GET'
  if (erlaubt.includes(methode)) return false
  res.setHeader('Allow', erlaubt.join(', '))
  sendeJson(res, 405, { status: 'error', error: 'method_not_allowed', allow: erlaubt })
  return true
}

// ---------------------------------------------------------------------------
// Der Körper
// ---------------------------------------------------------------------------

/** Was beim Lesen des Körpers herauskam. */
type Koerper =
  | { readonly ok: true; readonly wert: Record<string, unknown> }
  | { readonly ok: false; readonly status: number; readonly fehler: string }

/**
 * Liest einen JSON-Körper mit Obergrenze.
 *
 * **Warum die Grenze schon an `content-length` geprüft wird.** Ein Körper, der erst nach dem
 * Einlesen abgelehnt wird, hat den Speicher bereits belegt — die Grenze muß **vor** dem Lesen
 * greifen. Und ein fehlendes `content-length` ist kein Freibrief: dann zählt die Summe der Stücke.
 *
 * @param req - die Anfrage
 * @param max - die Obergrenze in Bytes
 * @returns der gelesene Körper
 */
export async function liesJson(req: IncomingMessage, max: number): Promise<Koerper> {
  const angegeben = Number(req.headers['content-length'] ?? Number.NaN)
  if (Number.isFinite(angegeben) && angegeben > max) {
    return {
      ok: false,
      status: 413,
      fehler: `Der Körper ist zu groß (${String(angegeben)} Bytes, Grenze ${String(max)}).`,
    }
  }
  const stuecke: Buffer[] = []
  let summe = 0
  for await (const stueck of req) {
    const puffer = Buffer.isBuffer(stueck) ? stueck : Buffer.from(stueck as Uint8Array)
    summe += puffer.byteLength
    if (summe > max) {
      return { ok: false, status: 413, fehler: `Der Körper ist zu groß (Grenze ${String(max)} Bytes).` }
    }
    stuecke.push(puffer)
  }
  const roh = Buffer.concat(stuecke).toString('utf8').trim()
  if (roh === '') return { ok: false, status: 400, fehler: 'Der Körper ist leer — es wurde nichts gefragt.' }
  let gelesen: unknown
  try {
    gelesen = JSON.parse(roh)
  } catch {
    return { ok: false, status: 400, fehler: 'Der Körper ist kein JSON.' }
  }
  if (gelesen === null || typeof gelesen !== 'object' || Array.isArray(gelesen)) {
    return { ok: false, status: 400, fehler: 'Der Körper ist kein JSON-Objekt.' }
  }
  return { ok: true, wert: gelesen as Record<string, unknown> }
}

/** Ein Textfeld aus einem Körper — mit sprechender Prüfung, wenn es fehlt. */
function textFeld(wert: Record<string, unknown>, name: string): string | undefined {
  const roh = wert[name]
  return typeof roh === 'string' && roh.trim() !== '' ? roh : undefined
}

// ---------------------------------------------------------------------------
// Fehler → Status
// ---------------------------------------------------------------------------

/**
 * Macht aus einem Fehler eine Antwort.
 *
 * **Warum der Status des Anbieters durchgereicht wird.** Ein 429 ist kein Fehler des Aufrufers; wer
 * ihn als 500 bekommt, sucht an der falschen Stelle. Nur wenn der Anbieter keinen Status nannte
 * (Netzfehler, fehlendes Modell), wird 502 — die Fähigkeit ist dann gerade nicht bedienbar.
 *
 * @param res - die Antwort
 * @param fehler - was geworfen wurde
 * @param faehigkeit - wofür gefragt wurde
 */
function sendeFehler(res: ServerResponse, fehler: unknown, faehigkeit: Faehigkeit): void {
  if (fehler instanceof KeinAnbieterError) {
    sendeJson(res, 503, {
      status: 'error',
      error: 'kein_anbieter',
      faehigkeit,
      gruende: fehler.gruende,
      hinweis:
        'Für diese Fähigkeit ist kein Anbieter einsatzbereit. Entweder fehlt der Schlüssel oder ' +
        `die Wahl in der Einstellungsdatei (Fähigkeit „${NAME_DER_FAEHIGKEIT[faehigkeit]}").`,
    })
    return
  }
  if (fehler instanceof OpenrouterFehler) {
    const status = fehler.status !== undefined && fehler.status >= 400 ? fehler.status : 502
    sendeJson(res, status, { status: 'error', error: 'anbieter', faehigkeit, meldung: fehler.message })
    return
  }
  sendeJson(res, 500, {
    status: 'error',
    error: 'intern',
    faehigkeit,
    meldung: fehler instanceof Error ? fehler.message : String(fehler),
  })
}

/** Schreibt einen Körperfehler. */
function sendeKoerperfehler(res: ServerResponse, koerper: { status: number; fehler: string }): void {
  sendeJson(res, koerper.status, { status: 'error', error: 'koerper', meldung: koerper.fehler })
}

// ---------------------------------------------------------------------------
// GET /api/ai/capabilities
// ---------------------------------------------------------------------------

/** Was eine Zeile der Auskunft trägt. */
export interface Faehigkeitszeile {
  readonly faehigkeit: Faehigkeit
  readonly name: string
  readonly anbieter?: string
  readonly modell?: string
  readonly bereit: boolean
  readonly grund?: string
}

/** Was die Auskunft ausgibt. */
export interface Auskunft {
  readonly status: 'ok'
  readonly service: string
  readonly version: string
  /** Wo die Einstellungen gelesen wurden — **der Pfad**, nicht der Inhalt. */
  readonly einstellungen: string
  /** Ob ein Schlüssel hinterlegt ist. **Nicht** der Schlüssel. */
  readonly schluessel: boolean
  readonly eingetragen: readonly string[]
  readonly hinweise: readonly string[]
  readonly faehigkeiten: readonly Faehigkeitszeile[]
}

/**
 * Baut die Auskunft über alle Fähigkeiten — **ohne Netz**.
 *
 * **Warum jede Fähigkeit eine Zeile bekommt, auch die nicht bedienbare.** „Es geht nicht" ist eine
 * Auskunft; ein fehlender Eintrag ist keine. Wer eine leere Liste sieht, sucht den Fehler beim
 * Plugin statt bei seinem Schlüssel.
 *
 * @param kette - die gebaute Kette
 * @returns die Auskunft
 */
export async function auskunft(kette: Kette): Promise<Auskunft> {
  const wahl = kette.einstellungen.wahl
  const zeilen: Faehigkeitszeile[] = []
  for (const faehigkeit of FAEHIGKEITEN) {
    const anbieter = kette.aufbau.faehigkeiten.fuer(faehigkeit)[0]
    if (anbieter === undefined) {
      zeilen.push({
        faehigkeit,
        name: NAME_DER_FAEHIGKEIT[faehigkeit],
        bereit: false,
        grund: FLAECHEN_FAEHIGKEITEN.includes(faehigkeit)
          ? 'Kein Anbieter eingetragen — für diese Fähigkeit ist keine Wahl gesetzt.'
          : 'Diese Fähigkeit führt der Kern selbst; sie gehört nicht zu diesem Plugin.',
      })
      continue
    }
    const stand = await anbieter.bereit(faehigkeit)
    const gewaehlt = wahl[faehigkeit]
    zeilen.push({
      faehigkeit,
      name: NAME_DER_FAEHIGKEIT[faehigkeit],
      anbieter: anbieter.id,
      ...(gewaehlt === undefined ? {} : { modell: gewaehlt.modell }),
      bereit: stand.bereit,
      ...(stand.bereit ? {} : { grund: stand.grund }),
    })
  }
  // **Die Schlüsselauskunft ist ein Wahrheitswert.** Den Schlüssel selbst auszugeben wäre das
  // Leck, das dieses Projekt schon einmal hatte.
  return {
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    einstellungen: kette.pfad,
    schluessel: await kette.hatSchluessel(),
    eingetragen: kette.aufbau.eingetragen,
    hinweise: kette.aufbau.hinweise,
    faehigkeiten: zeilen,
  }
}

// ---------------------------------------------------------------------------
// Die Handler
// ---------------------------------------------------------------------------

/**
 * Der Handler der Auskunft.
 *
 * @param ctx - der Kontext
 * @returns der Handler
 */
export function macheAuskunftHandler(
  ctx: Flaechenkontext,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (verweigert(ctx, req, res)) return
    if (falscheMethode(req, res, ['GET', 'HEAD'])) return
    try {
      sendeJson(res, 200, await auskunft(await ctx.kette()))
    } catch (fehler) {
      sendeJson(res, 500, {
        status: 'error',
        error: 'einstellungen',
        meldung: fehler instanceof Error ? fehler.message : String(fehler),
      })
    }
  }
}

/**
 * Der Handler für ein Urteil.
 *
 * @param ctx - der Kontext
 * @returns der Handler
 */
export function macheEntscheidHandler(
  ctx: Flaechenkontext,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (verweigert(ctx, req, res)) return
    if (falscheMethode(req, res, ['POST'])) return
    const koerper = await liesJson(req, TEXT_MAX)
    if (!koerper.ok) {
      sendeKoerperfehler(res, koerper)
      return
    }
    const frage = textFeld(koerper.wert, 'frage')
    const schema = koerper.wert['schema']
    if (frage === undefined) {
      sendeJson(res, 400, { status: 'error', error: 'koerper', meldung: 'Das Feld „frage" fehlt.' })
      return
    }
    if (schema === null || typeof schema !== 'object') {
      sendeJson(res, 400, { status: 'error', error: 'koerper', meldung: 'Das Feld „schema" fehlt.' })
      return
    }
    try {
      const kette = await ctx.kette()
      const entscheider = await kette.aufbau.faehigkeiten.entscheider()
      const urteil = await entscheider.entscheide<unknown>({
        frage,
        lage: koerper.wert['lage'],
        schema: schema as Schema<unknown>,
      })
      sendeJson(res, 200, { status: 'ok', urteil })
    } catch (fehler) {
      sendeFehler(res, fehler, 'entscheiden')
    }
  }
}

// ---------------------------------------------------------------------------
// Ton
// ---------------------------------------------------------------------------

/**
 * Packt rohe PCM-Daten in einen WAV-Kopf.
 *
 * **Warum das hier geschieht und nicht beim Anbieter.** Gemini liefert `audio/pcm;rate=24000` —
 * rohe Bytes ohne Kopf. Ein Browser kann das **nicht** abspielen; ein WAV-Kopf sind 44 Bytes und
 * macht aus denselben Daten eine Datei. Die Annahme „16 Bit, ein Kanal" steht dabei: sie ist für
 * Gemini-TTS gemessen, und wer sie ändert, muß sie neu messen.
 *
 * @param pcm - die rohen Bytes
 * @param rate - die Abtastrate in Hz
 * @param kanaele - die Zahl der Kanäle
 * @returns die WAV-Datei
 */
export function alsWav(pcm: Uint8Array, rate: number, kanaele = 1): Uint8Array {
  const bits = 16
  const block = (kanaele * bits) / 8
  const kopf = Buffer.alloc(44)
  kopf.write('RIFF', 0, 'ascii')
  kopf.writeUInt32LE(36 + pcm.byteLength, 4)
  kopf.write('WAVE', 8, 'ascii')
  kopf.write('fmt ', 12, 'ascii')
  kopf.writeUInt32LE(16, 16)
  kopf.writeUInt16LE(1, 20) // PCM
  kopf.writeUInt16LE(kanaele, 22)
  kopf.writeUInt32LE(rate, 24)
  kopf.writeUInt32LE(rate * block, 28)
  kopf.writeUInt16LE(block, 32)
  kopf.writeUInt16LE(bits, 34)
  kopf.write('data', 36, 'ascii')
  kopf.writeUInt32LE(pcm.byteLength, 40)
  const datei = new Uint8Array(44 + pcm.byteLength)
  datei.set(kopf, 0)
  datei.set(pcm, 44)
  return datei
}

/**
 * Liest Rate und Kanäle aus dem gemessenen Inhaltstyp.
 *
 * @param typ - der Typ, etwa `audio/pcm;rate=24000;channels=1`
 * @returns Rate und Kanäle
 */
export function liesTonformat(typ: string): { readonly rate: number; readonly kanaele: number } {
  const rate = /rate=(\d+)/u.exec(typ)?.[1]
  const kanaele = /channels=(\d+)/u.exec(typ)?.[1]
  return {
    rate: rate === undefined ? 24_000 : Number(rate),
    kanaele: kanaele === undefined ? 1 : Number(kanaele),
  }
}

/**
 * Der Handler für Text zu Sprache.
 *
 * @param ctx - der Kontext
 * @returns der Handler
 */
export function macheSprachHandler(
  ctx: Flaechenkontext,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (verweigert(ctx, req, res)) return
    if (falscheMethode(req, res, ['POST'])) return
    const koerper = await liesJson(req, TEXT_MAX)
    if (!koerper.ok) {
      sendeKoerperfehler(res, koerper)
      return
    }
    const text = textFeld(koerper.wert, 'text')
    if (text === undefined) {
      sendeJson(res, 400, { status: 'error', error: 'koerper', meldung: 'Das Feld „text" fehlt.' })
      return
    }
    const stimme = textFeld(koerper.wert, 'stimme')
    const sprache = textFeld(koerper.wert, 'sprache')
    try {
      const kette = await ctx.kette()
      const sprecher = await kette.aufbau.faehigkeiten.sprecher()
      const ton = await sprecher.sprich({
        text,
        ...(stimme === undefined ? {} : { stimme }),
        ...(sprache === undefined ? {} : { sprache }),
      })
      if (ton.typ.startsWith('audio/pcm')) {
        const { rate, kanaele } = liesTonformat(ton.typ)
        sendeBytes(res, 200, alsWav(ton.bytes, rate, kanaele), 'audio/wav')
        return
      }
      sendeBytes(res, 200, ton.bytes, ton.typ)
    } catch (fehler) {
      sendeFehler(res, fehler, 'text-zu-sprache')
    }
  }
}

/**
 * Der Handler für Sprache zu Text.
 *
 * @param ctx - der Kontext
 * @returns der Handler
 */
export function macheHoerHandler(
  ctx: Flaechenkontext,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (verweigert(ctx, req, res)) return
    if (falscheMethode(req, res, ['POST'])) return
    const koerper = await liesJson(req, TON_MAX)
    if (!koerper.ok) {
      sendeKoerperfehler(res, koerper)
      return
    }
    const base64 = textFeld(koerper.wert, 'audioBase64')
    if (base64 === undefined) {
      sendeJson(res, 400, { status: 'error', error: 'koerper', meldung: 'Das Feld „audioBase64" fehlt.' })
      return
    }
    const sprache = textFeld(koerper.wert, 'sprache')
    try {
      const kette = await ctx.kette()
      const hoerer = await kette.aufbau.faehigkeiten.hoerer()
      const ergebnis = await hoerer.hoere(new Uint8Array(Buffer.from(base64, 'base64')), sprache)
      sendeJson(res, 200, { status: 'ok', ...ergebnis })
    } catch (fehler) {
      sendeFehler(res, fehler, 'sprache-zu-text')
    }
  }
}

/**
 * Der Handler für Einbetten.
 *
 * @param ctx - der Kontext
 * @returns der Handler
 */
export function macheEinbettHandler(
  ctx: Flaechenkontext,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (verweigert(ctx, req, res)) return
    if (falscheMethode(req, res, ['POST'])) return
    const koerper = await liesJson(req, TEXT_MAX)
    if (!koerper.ok) {
      sendeKoerperfehler(res, koerper)
      return
    }
    const texte = koerper.wert['texte']
    if (!Array.isArray(texte) || texte.length === 0 || texte.some((t) => typeof t !== 'string' || t.trim() === '')) {
      sendeJson(res, 400, {
        status: 'error',
        error: 'koerper',
        meldung: 'Das Feld „texte" muß eine nicht-leere Liste nicht-leerer Zeichenketten sein.',
      })
      return
    }
    try {
      const kette = await ctx.kette()
      const anbieter = await kette.aufbau.faehigkeiten.waehle('einbetten')
      const einbetter = anbieter.einbetter
      if (einbetter === undefined) {
        throw new Error(`Der Anbieter „${anbieter.id}" nennt „einbetten", liefert aber keinen Einbetter.`)
      }
      const vektoren = await einbetter.betteEin(texte as string[])
      sendeJson(res, 200, { status: 'ok', vektoren, dimensionen: vektoren[0]?.length ?? 0 })
    } catch (fehler) {
      sendeFehler(res, fehler, 'einbetten')
    }
  }
}

/**
 * Der Handler für Bilder.
 *
 * **Zwei Formen, ein Weg.** Ohne `json` kommen die Bytes (`image/jpeg` oder `image/png`), mit
 * `json: true` kommt Base64 im JSON. Die Bytes sind für ein `<img>` richtig; das JSON ist für
 * einen Aufrufer, der das Bild weiterreicht, ohne einen zweiten Abruf zu wollen.
 *
 * @param ctx - der Kontext
 * @returns der Handler
 */
export function macheBildHandler(
  ctx: Flaechenkontext,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (verweigert(ctx, req, res)) return
    if (falscheMethode(req, res, ['POST'])) return
    const koerper = await liesJson(req, TEXT_MAX)
    if (!koerper.ok) {
      sendeKoerperfehler(res, koerper)
      return
    }
    const beschreibung = textFeld(koerper.wert, 'beschreibung')
    if (beschreibung === undefined) {
      sendeJson(res, 400, { status: 'error', error: 'koerper', meldung: 'Das Feld „beschreibung" fehlt.' })
      return
    }
    try {
      const kette = await ctx.kette()
      const anbieter = await kette.aufbau.faehigkeiten.waehle('bild')
      if (anbieter.zeichner === undefined) {
        throw new Error(`Der Anbieter „${anbieter.id}" nennt „bild", liefert aber keinen Zeichner.`)
      }
      const bild = await anbieter.zeichner.zeichne(beschreibung)
      if (koerper.wert['json'] === true) {
        sendeJson(res, 200, {
          status: 'ok',
          typ: bild.typ,
          base64: Buffer.from(bild.bytes).toString('base64'),
        })
        return
      }
      sendeBytes(res, 200, bild.bytes, bild.typ)
    } catch (fehler) {
      sendeFehler(res, fehler, 'bild')
    }
  }
}
