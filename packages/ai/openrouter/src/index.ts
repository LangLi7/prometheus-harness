/**
 * `@prometheus-harness/openrouter` — der **Anbieter** OpenRouter.
 *
 * Er erfüllt fünf der sechs Fähigkeiten aus `@prometheus-harness/capabilities`, jede über ihren
 * **eigenen** Weg. Daß es nicht *ein* Weg ist, ist keine Unordnung, sondern gemessen: der
 * Chat-Weg **weist ein Sprachmodell ab** und nennt den richtigen Weg.
 *
 * | Fähigkeit | Weg | Antwort |
 * |---|---|---|
 * | `entscheiden` | `POST /chat/completions` | JSON **im Textfeld** `content` |
 * | `text-zu-sprache` | `POST /audio/speech` | **rohe Bytes** |
 * | `sprache-zu-text` | `POST /audio/transcriptions` | `{text}` (Mehrtelldaten hinein) |
 * | `einbetten` | `POST /embeddings` | Vektoren, **nach `index` zu ordnen** |
 * | `bild` | `POST /images/generations` | **Base64 im JSON** (`data[0].b64_json`) |
 *
 * Alle Einzelheiten samt Fehlermeldungen und Kosten: `docs/status/openrouter-schnittstelle.md`.
 *
 * ## Was dieser Anbieter NICHT nennt, und warum
 *
 * **Nur `gespraech` fehlt.** Das ist kein Mangel: das Gespräch führt der Kern selbst
 * (`@prometheus-harness/llm`); der Vertrag `Anbieter` hat dafür kein Feld. Eine Fähigkeit zu
 * nennen, für die es keine Schnittstelle gibt, wäre ein Eintrag ohne Wirkung.
 *
 * ## `bild` — gemessen am 19.10.2026, nach einem Fehlschlag
 *
 * Der Weg war seit dem 15.10. nur als **Pfad** bestätigt. Die erste Messung mit
 * `google/gemini-nano-banana-2.1` gab **429** (Google-Kontingent erschöpft, kein Formfehler).
 * Erst `google/gemini-2.5-flash-image` antwortete mit **200** und einem Bild — Form:
 * `{model, prompt, n, response_format:'b64_json'}`, Antwort `data[0].b64_json`.
 *
 * **Und der Befund, der eine Falle schließt:** die Sonde schrieb die Daten nach `….png` — das war
 * eine **Annahme der Endung**, kein Wissen über den Behälter. Die Bytes entschieden: PNG. Der Typ
 * wird deshalb aus den **ersten Bytes** gelesen, nicht aus dem Wunsch — dieselbe Regel wie beim
 * Ton, wo er aus der Kopfzeile kommt.
 *
 * **`gespraech`.** Das Gespräch führt der Kern selbst (`@prometheus-harness/llm`); der Vertrag
 * `Anbieter` hat dafür kein Feld. Eine Fähigkeit zu nennen, für die es keine Schnittstelle gibt,
 * wäre ein Eintrag ohne Wirkung.
 *
 * ## Der Schlüssel wird hineingereicht
 *
 * Der Anbieter **verwahrt** den Schlüssel nicht: er bekommt eine **Quelle** — eine Funktion, die
 * ihn liefert. Damit steht er nie in einer Einstellung, nie in einer Ausgabe und nie in einem
 * Fehlertext; {@link entschaerfe} sorgt zusätzlich dafür, daß er auch nicht **versehentlich** in
 * einer Meldung landet, falls ihn eine Antwort zurückwirft.
 *
 * @module @prometheus-harness/openrouter
 */

import {
  NAME_DER_FAEHIGKEIT,
  type Anbieter,
  type Bereitschaft,
  type Einbetter,
  type Entscheider,
  type EntscheidungsEingabe,
  type Faehigkeit,
  type Hoerer,
  type Sprecher,
  type Urteil,
  type ZeichenOptionen,
  type Zeichner,
  type GezeichnetesBild,
} from '@prometheus-harness/capabilities'
import { liesUrteil, zuJsonSchema, type JsonSchema } from './schema.ts'

// ---------------------------------------------------------------------------
// Die gemessenen Wege
// ---------------------------------------------------------------------------

/** Die Vorgabe-Adresse — der Weg, den der Schlüssel aus `~/.dsh` bedient. */
export const BASIS = 'https://openrouter.ai/api/v1'

/** Chat — trägt auch das Schema-Urteil. */
export const WEG_GESPRAECH = '/chat/completions'
/** Text zu Sprache. **Nicht** der Chat-Weg: der weist ein Sprachmodell ab. */
export const WEG_SPRACHE = '/audio/speech'
/** Sprache zu Text — Mehrtelldaten. */
export const WEG_HOEREN = '/audio/transcriptions'
/** Einbetten. */
export const WEG_EINBETTEN = '/embeddings'
/** Text zu Bild — JSON hinein, Base64 im JSON heraus. */
export const WEG_BILD = '/images/generations'

/**
 * Das Antwortformat für `bild` — **gemessen** am 19.10.2026.
 *
 * Ohne dieses Feld antwortet der Dienst mit einem **Verweis** (`url`), und der Verweis ist eine
 * zweite Adresse, die niemand prüft. Mit ihm kommen die Bytes selbst; der Aufrufer hat das Bild,
 * ohne es nachzuladen.
 */
export const BILD_FORMAT = 'b64_json'

/**
 * Die Modellkennungen, die dieser Anbieter **vorschlägt** — mit gemessenem Preis.
 *
 * ## Warum das Vorschläge sind und keine Vorgaben
 *
 * **Welches Modell läuft, entscheidet der Endnutzer.** Eine Vorgabe im Quelltext wäre eine
 * Entscheidung, die niemand getroffen hat: sie liefe still, und die Rechnung käme später.
 * Ohne eingestelltes Modell ist dieser Anbieter deshalb für die Fähigkeit **nicht bereit** —
 * und die Registratur geht weiter, bis jemand da ist, der es wirklich kann. Im äußersten Fall
 * der Mensch.
 *
 * ## Warum `typesafe/jev-router` NICHT hier steht
 *
 * Sein Preis ist **`-1`** — gemessen am 15.10.2026 über `GET /api/v1/models`, und die
 * Einzelabfrage `GET /api/v1/models/typesafe/jev-router/endpoints` liefert **gar keinen** Preis.
 * `-1` heißt „unbekannt": wer ihn als Vorgabe setzt, gibt Geld aus, ohne den Preis zu kennen.
 * Er bleibt wählbar — aber nur, wenn ein Mensch ihn wählt.
 *
 * ## Die Preise (USD je 1 Mio Token, gemessen über die Einzelabfrage)
 *
 * | Fähigkeit | Vorschlag | hinein | heraus |
 * |---|---|---|---|
 * | `entscheiden` | `openai/gpt-oss-20b` | 0,02 | 0,09 |
 * | `entscheiden` | `inclusionai/ling-3.0-flash` | 0,02 | 0,06 |
 * | `entscheiden` | `google/gemini-3.8-flash` | 0,75 | 3,75 |
 * | `text-zu-sprache` | `google/gemini-3.8-flash-tts` | 0,50 | 9,00 |
 * | `sprache-zu-text` | `google/gemini-3.5-transcribe` | 2,00 | 12,00 |
 * | `einbetten` | `google/gemini-embedding-2` | 0,20 | 0 |
 * | `bild` | `google/gemini-2.5-flash-image` | 0,30 | 2,50 |
 *
 * **Die Bildzeile ist nicht vergleichbar.** Sie stammt aus derselben Liste
 * (`architecture.output_modalities` nennt `image`) und ist der **Token**preis des Modells, nicht
 * der Preis je Bild — ein Bild kostet viele Ausgabe-Token. Wer sie liest, soll das wissen.
 * Am 19.10.2026 gemessen: `GET /models` nennt **12 von 471** Modellen mit Bildausgabe.
 *
 * Die Reihenfolge ist Absicht: **das Billigste zuerst.** Ein Vorschlag ist eine Empfehlung —
 * und eine Empfehlung, die mit dem Teuren anfängt, ist keine.
 *
 * **Für `text-zu-sprache` und `sprache-zu-text` gibt es nur je einen Vorschlag**: mehr ist am
 * 15.10.2026 nicht gemessen. Eine erfundene Alternative wäre schlimmer als eine kurze Liste.
 */
export const VORSCHLAEGE: Readonly<Record<string, readonly string[]>> = {
  entscheiden: ['openai/gpt-oss-20b', 'inclusionai/ling-3.0-flash', 'google/gemini-3.8-flash'],
  'text-zu-sprache': ['google/gemini-3.8-flash-tts'],
  'sprache-zu-text': ['google/gemini-3.5-transcribe'],
  einbetten: ['google/gemini-embedding-2'],
  // **Die Reihenfolge ist auch hier eine Empfehlung.** `gemini-2.5-flash-image` ist das Modell,
  // mit dem die Form am 19.10.2026 gemessen wurde — und das billigste der zwölf. Die anderen
  // stehen daneben, weil nano-banana an diesem Tag mit 429 antwortete: ein Vorschlag, der nur
  // ein Modell nennt, ist bei einem erschöpften Kontingent kein Vorschlag mehr.
  bild: ['google/gemini-2.5-flash-image', 'google/gemini-3.1-flash-image', 'openai/gpt-5-image-mini'],
}

/**
 * Die Fähigkeiten, die dieser Anbieter **belegen** kann.
 *
 * `bild` steht seit dem 19.10.2026 dabei — der Weg ist mit einem echten Auftrag gemessen, nicht
 * nur als Pfad bestätigt. `gespraech` fehlt weiter mit Absicht: dafür hat der Vertrag kein Feld.
 */
export const FAEHIGKEITEN_OPENROUTER: readonly Faehigkeit[] = [
  'entscheiden',
  'text-zu-sprache',
  'sprache-zu-text',
  'einbetten',
  'bild',
]

/** Die Umgebungsvariable, aus der der Schlüssel kommt, wenn keine Quelle gesetzt ist. */
export const UMWELT_SCHLUESSEL = 'OPENROUTER_API_KEY'

/** Die Vorgabe-Stimme — gemessen: `Kore` liefert bei `google/gemini-3.8-flash-tts` Ton. */
export const VORGABE_STIMME = 'Kore'

/**
 * Unsere Denkstufen als die Werte, die der Dienst kennt.
 *
 * **Warum übersetzt und nicht durchgereicht.** Unsere Wörter stehen in den Einstellungen und in der
 * Oberfläche; die Werte des Dienstes sind seine Sache. Eine Zwischenschicht heißt: wenn ein Dienst
 * `reasoning_effort` anders schreibt, ändert sich **eine** Zeile — nicht jede Einstellung.
 */
const DENKSTUFEN: Readonly<Record<'aus' | 'niedrig' | 'mittel' | 'hoch', string>> = {
  // `'aus'` wird als `'minimal'` gesendet — **gemessen ist das nicht.** Daß die drei genannten
  // Modelle den Parameter annehmen, steht in der Modellliste; welchen Wert sie als „kein Denken"
  // lesen, nicht. Wer `'aus'` setzt, soll das wissen.
  aus: 'minimal',
  niedrig: 'low',
  mittel: 'medium',
  hoch: 'high',
}

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

/**
 * Ersetzt ein Geheimnis durch `***`, falls es im Text vorkommt.
 *
 * **Warum das nicht übertrieben ist.** Fehlertexte werden protokolliert und angezeigt. Ein
 * Anbieter, der eine Anfrage zurückspiegelt, kann dabei den Kopf `Authorization` mitführen. Ohne
 * diese Zeile stünde der Schlüssel dann in einem Protokoll — und ein Protokoll ist genau der Ort,
 * an dem er jahrelang liegenbleibt.
 *
 * @param text - der Text
 * @param geheim - das Geheimnis
 * @returns der entschärfte Text
 */
export function entschaerfe(text: string, geheim: string | undefined): string {
  if (geheim === undefined || geheim.length < 8) return text
  return text.split(geheim).join('***')
}

/** Ein Fehler im Umgang mit OpenRouter — mit Status, aber **ohne** Schlüssel. */
export class OpenrouterFehler extends Error {
  /**
   * @param meldung - was schiefging
   * @param status - der HTTP-Status, wenn es einen gab
   * @param auszug - der Anfang der Antwort, entschärft
   */
  constructor(
    meldung: string,
    readonly status?: number,
    readonly auszug?: string,
  ) {
    super(meldung)
    this.name = 'OpenrouterFehler'
  }
}

// ---------------------------------------------------------------------------
// Die Einstellungen
// ---------------------------------------------------------------------------

/** Ein austauschbarer Netzzugriff — für die Prüfung, und um nichts zu verstecken. */
export type Abruf = (adresse: string, einstellung: RequestInit) => Promise<Response>

/** Was der Anbieter beim Aufbau wissen muß. */
export interface OpenrouterOptionen {
  /**
   * Woher der Schlüssel kommt. Fehlt sie, wird {@link UMWELT_SCHLUESSEL} gelesen.
   *
   * **Warum eine Funktion und kein Text.** So kann der Schlüssel aus einem Speicher kommen, der
   * ihn erst auf Anfrage herausgibt — er liegt dann nie als Feld im Anbieter und taucht in keiner
   * Abbildung des Objekts auf.
   */
  readonly schluessel?: () => string | undefined | Promise<string | undefined>
  /** Woraus {@link UMWELT_SCHLUESSEL} gelesen wird. Nur für die Prüfung gedacht. */
  readonly umgebung?: Readonly<Record<string, string | undefined>>
  /** Die Adresse ohne Schrägstrich am Ende. Vorgabe: {@link BASIS}. */
  readonly basis?: string
  /** Abweichende Modellkennungen je Fähigkeit — die Einstellung des Nutzers. */
  readonly modelle?: Partial<Record<Faehigkeit, string>>
  /** Der Netzzugriff. Vorgabe: das eingebaute `fetch`. */
  readonly abruf?: Abruf
  /** Die Frist für **einen** Aufruf in Millisekunden. Vorgabe: 120 000. */
  readonly fristMs?: number
  /** Die Stimme für `text-zu-sprache`. Vorgabe: {@link VORGABE_STIMME}. */
  readonly stimme?: string
  /** Das Tonformat für `text-zu-sprache`. Vorgabe: `pcm` — siehe {@link WEG_SPRACHE}. */
  readonly sprachformat?: 'pcm' | 'mp3'
  /**
   * Eine Obergrenze für die Antwortlänge beim Entscheiden.
   *
   * **Vorgabe: nicht gesetzt — und das ist eine Lehre.** Gemessen am 15.10.2026 kam bei
   * `max_tokens: 300` ein **leerer** Inhalt zurück: die Zwischenschritte des Modells hatten das
   * Budget aufgebraucht. Wer hier eine Zahl einträgt, muß sie großzügig wählen.
   */
  readonly hoechstToken?: number
  /**
   * Wie stark das Modell **denken** darf.
   *
   * ## Warum das hier steht — gemessen am 15.10.2026
   *
   * Der Befund: bei `max_tokens: 300` kam ein **leerer** Inhalt zurück. Die Zwischenschritte des
   * Modells hatten das Budget aufgebraucht; das Urteil stand nie in `content`. Bezahlt für nichts
   * Brauchbares.
   *
   * Und die Auskunft, die den Ausweg zeigt: `google/gemini-3.8-flash`, `openai/gpt-oss-20b` und
   * `typesafe/jev-router` nennen **alle** `reasoning_effort` unter ihren Parametern; **332 von 462**
   * Modellen der Liste nennen `reasoning`. Der Weg, das Denken zu begrenzen, ist also ein
   * **Parameter** — kein zweites Modell und kein Plugin.
   *
   * **Der zweite Hebel gehört daneben:** ein Modell zu wählen, das **gar nicht** denkt
   * (`ibm-granite/granite-4.0-h-micro` kennt `reasoning` nicht). Bei einer Entscheidung aus einer
   * festen Auswahl ist Nachdenken oft nur teuer.
   *
   * **`'aus'` ist ehrlich benannt, aber nicht gemessen.** Daß diese drei Modelle das Denken
   * *abschalten* lassen, steht **nicht** in meiner Messung — nur, daß sie den Parameter
   * `reasoning_effort` annehmen. Wer `'aus'` setzt, soll wissen, daß es ein Versuch ist.
   */
  readonly denken?: 'aus' | 'niedrig' | 'mittel' | 'hoch'
}

// ---------------------------------------------------------------------------
// Kleinkram
// ---------------------------------------------------------------------------

/** Die Vorgabe-Frist: großzügig, weil ein Sprachmodell Zeit braucht. */
const FRIST_MS = 120_000

/** Wie viel der Antwort in einer Meldung erscheinen darf. */
const AUSZUG_MAX = 400

/**
 * Prüft, ob ein Wert ein Feld mit Text ist.
 *
 * @param wert - der Wert
 * @returns ob es Text ist
 */
function istText(wert: unknown): wert is string {
  return typeof wert === 'string' && wert.trim() !== ''
}

/**
 * Erkennt den **Behälter** von Ton an seinen ersten Bytes.
 *
 * ## Warum das nötig ist — gemessen am 19.10.2026
 *
 * Der Hör-Weg wurde mit `file: 'ton'` und `application/octet-stream` aufgerufen. Der Dienst
 * antwortete **200** und `{"text":""}` — ein leerer Text, der wie „nichts verstanden" aussieht.
 * Mit `ton.wav` und `audio/wav` kam derselbe Satz vollständig zurück:
 *
 * | Auftrag | Antwort |
 * |---|---|
 * | `ton` + `application/octet-stream` | `200`, `text: ""` |
 * | `ton.wav` + `audio/wav` | `200`, der gesprochene Satz |
 *
 * **Der Fehler war still.** Kein Statuscode, keine Meldung — nur ein leerer Text. Deshalb wird der
 * Behälter jetzt aus den Bytes gelesen und der Dateiname trägt seine Endung.
 *
 * @param bytes - die Bytes
 * @returns Inhaltstyp und Endung; unbekannt ergibt `application/octet-stream` und `bin`
 */
export function tonArt(bytes: Uint8Array): { readonly typ: string; readonly endung: string } {
  const b = (i: number): number => bytes[i] ?? -1
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x41) {
    return { typ: 'audio/wav', endung: 'wav' }
  }
  if (b(0) === 0x49 && b(1) === 0x44 && b(2) === 0x33) return { typ: 'audio/mpeg', endung: 'mp3' }
  if (b(0) === 0xff && (b(1) === 0xfb || b(1) === 0xf3 || b(1) === 0xf2)) return { typ: 'audio/mpeg', endung: 'mp3' }
  if (b(0) === 0x4f && b(1) === 0x67 && b(2) === 0x67 && b(3) === 0x53) return { typ: 'audio/ogg', endung: 'ogg' }
  if (b(0) === 0x66 && b(1) === 0x4c && b(2) === 0x61 && b(3) === 0x43) return { typ: 'audio/flac', endung: 'flac' }
  if (b(0) === 0x1a && b(1) === 0x45 && b(2) === 0xdf && b(3) === 0xa3) return { typ: 'audio/webm', endung: 'webm' }
  if (b(4) === 0x66 && b(5) === 0x74 && b(6) === 0x79 && b(7) === 0x70) return { typ: 'audio/mp4', endung: 'm4a' }
  return { typ: 'application/octet-stream', endung: 'bin' }
}

/**
 * Erkennt den **Behälter** eines Bildes an seinen ersten Bytes.
 *
 * ## Warum das nötig ist
 *
 * Ein Bild kommt als Base64 ohne Dateinamen. Wer den Typ aus dem **Wunsch** ableitet („ich habe
 * `.png` gesagt"), behauptet etwas über Daten, die er nicht gelesen hat; ein falscher
 * `Content-Type` ergibt im Browser ein leeres Feld. Am 19.10.2026 war das Ergebnis ein PNG — die
 * Sonde hatte die Datei trotzdem `.png` genannt, und **das war Glück, kein Wissen**.
 *
 * Dieselbe Regel gilt hier wie beim Ton: **der Typ kommt aus den Daten**, nicht aus dem Auftrag.
 *
 * @param bytes - die Bytes
 * @returns der Inhaltstyp, oder `application/octet-stream`, wenn keiner erkannt wurde
 */
export function bildArt(bytes: Uint8Array): string {
  const b = (i: number): number => bytes[i] ?? -1
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png'
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg'
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return 'image/gif'
  if (
    b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
    b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50
  ) {
    return 'image/webp'
  }
  return 'application/octet-stream'
}

/**
 * Macht aus einer Lage den Text, der an das Modell geht.
 *
 * @param lage - die Lage
 * @returns der Text
 * @throws OpenrouterFehler - wenn sich die Lage nicht als JSON schreiben läßt (etwa ein Ringbezug)
 */
function lageAlsText(lage: unknown): string {
  if (typeof lage === 'string') return lage
  try {
    return JSON.stringify(lage, null, 2) ?? String(lage)
  } catch {
    throw new OpenrouterFehler(
      'Die Lage läßt sich nicht als JSON schreiben — sie enthält vermutlich einen Ringbezug.',
    )
  }
}

// ---------------------------------------------------------------------------
// Der Anbieter
// ---------------------------------------------------------------------------

/**
 * Baut den Anbieter OpenRouter.
 *
 * @param optionen - die Einstellungen; ohne Angabe kommt der Schlüssel aus der Umgebung
 * @returns der Anbieter
 */
export function openrouter(optionen: OpenrouterOptionen = {}): Anbieter {
  const basis = (optionen.basis ?? BASIS).replace(/\/+$/u, '')
  const abruf: Abruf =
    optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung))
  const fristMs = optionen.fristMs ?? FRIST_MS
  const stimme = optionen.stimme ?? VORGABE_STIMME
  const sprachformat = optionen.sprachformat ?? 'pcm'
  const umgebung = optionen.umgebung ?? process.env

  /**
   * Holt den Schlüssel.
   *
   * @returns der Schlüssel oder `undefined`
   */
  async function holeSchluessel(): Promise<string | undefined> {
    if (optionen.schluessel !== undefined) {
      const wert = await optionen.schluessel()
      return istText(wert) ? wert.trim() : undefined
    }
    const ausUmgebung = umgebung[UMWELT_SCHLUESSEL]
    return istText(ausUmgebung) ? ausUmgebung.trim() : undefined
  }

  /**
   * Die **eingestellte** Modellkennung für eine Fähigkeit.
   *
   * **Es gibt keine Vorgabe.** Siehe {@link VORSCHLAEGE}: welches Modell läuft, entscheidet der
   * Endnutzer. Ohne seine Wahl ist hier nichts — und der Anbieter ist für diese Fähigkeit
   * **nicht bereit**. Das ist kein Mangel, sondern die Absicht: eine Vorgabe im Quelltext wäre
   * eine Entscheidung, die niemand getroffen hat, und die Rechnung käme später.
   *
   * @param faehigkeit - die Fähigkeit
   * @returns die Kennung oder `undefined`, wenn keine eingestellt ist
   */
  function modellFuer(faehigkeit: Faehigkeit): string | undefined {
    const gesetzt = optionen.modelle?.[faehigkeit]
    return istText(gesetzt) ? gesetzt : undefined
  }

  /**
   * Die eingestellte Modellkennung — oder ein Fehler, der sagt, was zu tun ist.
   *
   * @param faehigkeit - die Fähigkeit
   * @returns die Kennung
   * @throws OpenrouterFehler - wenn keine eingestellt ist
   */
  function modellOderFehler(faehigkeit: Faehigkeit): string {
    const modell = modellFuer(faehigkeit)
    if (modell !== undefined) return modell
    const vorschlaege = VORSCHLAEGE[faehigkeit] ?? []
    throw new OpenrouterFehler(
      `Für „${NAME_DER_FAEHIGKEIT[faehigkeit]}" ist kein Modell eingestellt.` +
        (vorschlaege.length === 0 ? '' : ` Vorschläge: ${vorschlaege.join(', ')}.`) +
        ' Ohne Wahl wird nichts geraten — ist kein anderer Anbieter bereit, entscheidet der Mensch.',
    )
  }

  /**
   * Ruft einen Weg auf und liefert die Antwort — oder wirft mit Status und Auszug.
   *
   * @param weg - der Weg
   * @param koerper - der Körper, wenn es einer ist
   * @param schluessel - der Schlüssel
   * @returns die Antwort
   * @throws OpenrouterFehler - bei Status außerhalb 2xx, bei Fristablauf, bei Netzfehler
   */
  async function rufe(
    weg: string,
    koerper: string | FormData | undefined,
    schluessel: string,
    kopfZusatz: Record<string, string>,
  ): Promise<Response> {
    let antwort: Response
    try {
      antwort = await abruf(`${basis}${weg}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${schluessel}`, ...kopfZusatz },
        ...(koerper === undefined ? {} : { body: koerper }),
        signal: AbortSignal.timeout(fristMs),
      })
    } catch (fehler) {
      const grund = fehler instanceof Error ? fehler.message : String(fehler)
      // Der Name des Abbruchs verrät nicht, wie lange gewartet wurde — deshalb steht die Frist
      // in der Meldung. Ein „aborted" ohne Zahl läßt den Leser raten.
      const frist = fehler instanceof Error && fehler.name === 'TimeoutError'
      throw new OpenrouterFehler(
        entschaerfe(
          frist
            ? `OpenRouter antwortete nicht innerhalb von ${String(Math.round(fristMs / 1000))} s (${weg}).`
            : `OpenRouter war nicht erreichbar (${weg}): ${grund}`,
          schluessel,
        ),
      )
    }
    if (!antwort.ok) {
      const roh = await antwort.text().catch(() => '')
      const auszug = entschaerfe(roh.slice(0, AUSZUG_MAX), schluessel)
      throw new OpenrouterFehler(
        `OpenRouter antwortete auf ${weg} mit Status ${String(antwort.status)}` +
          (auszug.trim() === '' ? '.' : `: ${auszug.trim()}`),
        antwort.status,
        auszug,
      )
    }
    return antwort
  }

  /**
   * Holt den JSON-Körper einer Antwort.
   *
   * @param antwort - die Antwort
   * @param weg - der Weg, für die Meldung
   * @param schluessel - der Schlüssel, zum Entschärfen
   * @returns der Körper
   * @throws OpenrouterFehler - wenn kein JSON kommt
   */
  async function alsJson(antwort: Response, weg: string, schluessel: string): Promise<Record<string, unknown>> {
    const roh = entschaerfe(await antwort.text(), schluessel)
    let gelesen: unknown
    try {
      gelesen = JSON.parse(roh)
    } catch {
      throw new OpenrouterFehler(
        `Die Antwort auf ${weg} war kein JSON. Sie begann mit: ${roh.slice(0, AUSZUG_MAX)}`,
      )
    }
    if (gelesen === null || typeof gelesen !== 'object' || Array.isArray(gelesen)) {
      throw new OpenrouterFehler(`Die Antwort auf ${weg} war kein Objekt.`)
    }
    return gelesen as Record<string, unknown>
  }

  // -------------------------------------------------------------------------
  // entscheiden
  // -------------------------------------------------------------------------

  /** Der Auftrag an das Modell — kurz, weil das Schema die Form schon vorgibt. */
  const SYSTEM_ENTSCHEIDEN =
    'Du fällst ein Urteil nach dem vorgegebenen Schema. ' +
    'Antworte ausschließlich mit dem JSON-Objekt: kein Text davor oder danach, keine Erklärung, ' +
    'keine Code-Umrandung. Alle Pflichtfelder sind gesetzt, und jeder Wert hält sich an die ' +
    'erlaubte Auswahl.'

  const entscheider: Entscheider = {
    // Die Eingabeform wird **ausgeschrieben**: bei einer generischen Methode in einem Objekt-
    // Literal leitet TypeScript den Parameter nicht zuverlässig aus dem Vertrag ab.
    async entscheide<T>(eingabe: EntscheidungsEingabe<T>): Promise<Urteil<T>> {
      const schluessel = await holeSchluessel()
      if (schluessel === undefined) {
        throw new OpenrouterFehler(
          `Es ist kein Schlüssel hinterlegt. Für OpenRouter kommt er aus $${UMWELT_SCHLUESSEL} ` +
            'oder aus der übergebenen Quelle.',
        )
      }
      const modell = modellOderFehler('entscheiden')
      const schema: JsonSchema = zuJsonSchema(eingabe.schema)
      const koerper = {
        model: modell,
        messages: [
          { role: 'system', content: SYSTEM_ENTSCHEIDEN },
          { role: 'user', content: `${eingabe.frage}\n\nLage:\n${lageAlsText(eingabe.lage)}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'urteil', strict: true, schema },
        },
        ...(optionen.hoechstToken === undefined ? {} : { max_tokens: optionen.hoechstToken }),
        // **Der Hebel gegen das volle Denk-Budget.** Gemessen: die drei genannten Modelle nehmen
        // `reasoning_effort` an. Fehlt der Wert, wird **nichts** gesendet — der Anbieter entscheidet
        // dann wie bisher, und wir tun nicht so, als hätten wir es begrenzt.
        ...(optionen.denken === undefined ? {} : { reasoning_effort: DENKSTUFEN[optionen.denken] }),
      }
      const antwort = await rufe(
        WEG_GESPRAECH,
        JSON.stringify(koerper),
        schluessel,
        { 'content-type': 'application/json' },
      )
      const koerperAntwort = await alsJson(antwort, WEG_GESPRAECH, schluessel)

      const wahlen = koerperAntwort['choices']
      if (!Array.isArray(wahlen) || wahlen.length === 0) {
        throw new OpenrouterFehler('Die Antwort enthielt keine Auswahl (`choices` war leer).')
      }
      const erste = wahlen[0] as Record<string, unknown>

      // **Die gemessene Falle.** Bei zu kleinem Budget steht das Denken in `reasoning` und
      // `content` bleibt leer; `finish_reason` ist dann nicht `stop`. Wird das durchgereicht,
      // sieht der Aufrufer ein leeres Urteil, das wie eine Antwort aussieht.
      const grund = erste['finish_reason']
      if (grund !== 'stop') {
        throw new OpenrouterFehler(
          `Das Modell hat nicht zu Ende geantwortet (finish_reason: ${JSON.stringify(grund) ?? 'fehlt'}). ` +
            'Vermutlich war das Token-Budget zu klein — das Denken steht in `reasoning`, das Urteil in `content`.',
        )
      }
      const nachricht = erste['message']
      if (nachricht === null || typeof nachricht !== 'object' || Array.isArray(nachricht)) {
        throw new OpenrouterFehler('Die Antwort enthielt keine Nachricht (`message` fehlte).')
      }
      const inhalt = (nachricht as Record<string, unknown>)['content']
      if (typeof inhalt !== 'string') {
        throw new OpenrouterFehler(
          `Der Inhalt war kein Text, sondern ${inhalt === undefined ? 'nicht vorhanden' : typeof inhalt}.`,
        )
      }

      const wert = liesUrteil<T>(inhalt, eingabe.schema)
      // Wer geantwortet hat — **nur**, wenn die Antwort es sagt. Bei einem Verteiler wie
      // `typesafe/jev-router` ist das gerade nicht die Kennung, die man hineingegeben hat.
      const geantwortetVon = koerperAntwort['model']
      return {
        wert,
        ...(istText(geantwortetVon)
          ? { herkunft: { anbieter: 'openrouter', modell: geantwortetVon } }
          : {}),
      }
    },
  }

  // -------------------------------------------------------------------------
  // text-zu-sprache
  // -------------------------------------------------------------------------

  const sprecher: Sprecher = {
    async sprich(eingabe): Promise<{ readonly bytes: Uint8Array; readonly typ: string }> {
      const schluessel = await holeSchluessel()
      if (schluessel === undefined) {
        throw new OpenrouterFehler('Es ist kein Schlüssel hinterlegt — ohne ihn kann nichts sprechen.')
      }
      const modell = modellOderFehler('text-zu-sprache')
      // `sprache` wird **nicht** gesetzt: der gemessene Vertrag hat kein Sprachfeld. Die
      // gemessenen Gemini-Stimmen nehmen die Sprache aus dem Text. Ein Feld zu erfinden, von dem
      // niemand weiß, ob es wirkt, wäre schlimmer als es wegzulassen — hier steht es deshalb.
      const koerper = {
        model: modell,
        input: eingabe.text,
        voice: eingabe.stimme ?? stimme,
        response_format: sprachformat,
      }
      const antwort = await rufe(WEG_SPRACHE, JSON.stringify(koerper), schluessel, {
        'content-type': 'application/json',
      })
      const bytes = new Uint8Array(await antwort.arrayBuffer())
      if (bytes.length === 0) {
        throw new OpenrouterFehler('OpenRouter lieferte Ton ohne Inhalt (0 Bytes).')
      }
      // **Der Typ kommt aus der Kopfzeile, nicht aus dem Wunsch.** Gemessen:
      // `audio/pcm;rate=24000;channels=1` — rohe PCM-Daten tragen keinen eigenen Kopf, und wer
      // diese Angabe verliert, hat eine Datei, die niemand abspielen kann.
      const typ = antwort.headers.get('content-type')
      return { bytes, typ: istText(typ) ? typ : 'application/octet-stream' }
    },
  }

  // -------------------------------------------------------------------------
  // sprache-zu-text
  // -------------------------------------------------------------------------

  const hoerer: Hoerer = {
    async hoere(ton, sprache): Promise<{ readonly text: string; readonly sprache?: string }> {
      const schluessel = await holeSchluessel()
      if (schluessel === undefined) {
        throw new OpenrouterFehler('Es ist kein Schlüssel hinterlegt — ohne ihn kann nichts hören.')
      }
      const modell = modellOderFehler('sprache-zu-text')
      if (ton.length === 0) {
        throw new OpenrouterFehler('Es wurde kein Ton übergeben (0 Bytes).')
      }
      const daten = new FormData()
      daten.append('model', modell)
      // **Der Dateiname trägt die Endung des Behälters.** Ohne sie antwortet der Dienst mit 200
      // und leerem Text — gemessen am 19.10.2026, siehe {@link tonArt}.
      const art = tonArt(ton)
      daten.append('file', new Blob([ton], { type: art.typ }), `ton.${art.endung}`)
      if (istText(sprache)) daten.append('language', sprache)

      // **Kein `content-type` von Hand.** Bei Mehrtelldaten setzt `fetch` die Grenze selbst; ein
      // eigener Kopf ohne passende Grenze macht den Körper unlesbar.
      const antwort = await rufe(WEG_HOEREN, daten, schluessel, {})
      const koerper = await alsJson(antwort, WEG_HOEREN, schluessel)
      const text = koerper['text']
      if (typeof text !== 'string') {
        throw new OpenrouterFehler('Die Antwort auf den Hör-Weg enthielt kein Textfeld.')
      }
      // **Keine Sprache zurückgeben.** Die gemessene Antwort trug nur `text` und `usage`. Eine
      // Sprache zu behaupten, die niemand geliefert hat, wäre geraten — und der Vertrag erlaubt
      // das Fehlen ausdrücklich.
      return { text }
    },
  }

  // -------------------------------------------------------------------------
  // einbetten
  // -------------------------------------------------------------------------

  const einbetter: Einbetter = {
    async betteEin(texte): Promise<readonly (readonly number[])[]> {
      if (texte.length === 0) return []
      const schluessel = await holeSchluessel()
      if (schluessel === undefined) {
        throw new OpenrouterFehler('Es ist kein Schlüssel hinterlegt — ohne ihn wird nichts eingebettet.')
      }
      const modell = modellOderFehler('einbetten')
      const antwort = await rufe(
        WEG_EINBETTEN,
        JSON.stringify({ model: modell, input: [...texte] }),
        schluessel,
        { 'content-type': 'application/json' },
      )
      const koerper = await alsJson(antwort, WEG_EINBETTEN, schluessel)
      const daten = koerper['data']
      if (!Array.isArray(daten)) {
        throw new OpenrouterFehler('Die Antwort auf den Einbettungs-Weg enthielt kein `data`-Feld.')
      }
      if (daten.length !== texte.length) {
        throw new OpenrouterFehler(
          `Es wurden ${String(texte.length)} Vektoren verlangt, aber ${String(daten.length)} geliefert.`,
        )
      }
      // **Nach `index` ordnen, nicht nach der Reihenfolge im Feld.** Ein Dienst darf antworten,
      // wie er will; ohne diese Zeile bekäme der zweite Text den Vektor des ersten — ein Fehler,
      // der nirgends auffällt, weil die Form stimmt.
      const geordnet = daten.map((eintrag, stelle) => {
        if (eintrag === null || typeof eintrag !== 'object' || Array.isArray(eintrag)) {
          throw new OpenrouterFehler(`Der Eintrag ${String(stelle)} war kein Objekt.`)
        }
        const satz = eintrag as Record<string, unknown>
        const index = satz['index']
        const vektor = satz['embedding']
        if (!Array.isArray(vektor) || vektor.some((z) => typeof z !== 'number' || !Number.isFinite(z))) {
          throw new OpenrouterFehler(`Der Eintrag ${String(stelle)} trug keinen Vektor aus Zahlen.`)
        }
        return { index: typeof index === 'number' ? index : stelle, vektor: vektor as number[] }
      })
      geordnet.sort((a, b) => a.index - b.index)
      const laengen = new Set(geordnet.map((e) => e.vektor.length))
      if (laengen.size > 1) {
        throw new OpenrouterFehler(
          `Die Vektoren sind verschieden lang (${[...laengen].join(', ')}) — sie lassen sich nicht vergleichen.`,
        )
      }
      return geordnet.map((e) => e.vektor)
    },
  }

  // -------------------------------------------------------------------------
  // bild
  // -------------------------------------------------------------------------

  const zeichner: Zeichner = {
    async zeichne(beschreibung: string, optionen: ZeichenOptionen = {}): Promise<GezeichnetesBild> {
      if (!istText(beschreibung)) {
        throw new OpenrouterFehler('Es wurde kein Bildauftrag übergeben (leere Beschreibung).')
      }
      const schluessel = await holeSchluessel()
      if (schluessel === undefined) {
        throw new OpenrouterFehler('Es ist kein Schlüssel hinterlegt — ohne ihn wird nichts gezeichnet.')
      }
      const modell = modellOderFehler('bild')
      // **Die gemessene Form, Feld für Feld.** `response_format` erzwingt die Bytes statt eines
      // Verweises. Die übrigen Felder sind die der Bild-API (gelesen am 21.10.2026 aus
      // `GET /api/v1/images/models`); **welche** ein Modell kennt, entscheidet der Dienst und
      // antwortet sonst mit 400 — geraten wird hier nichts.
      const koerper: Record<string, unknown> = {
        model: modell,
        prompt: beschreibung,
        n: optionen.anzahl ?? 1,
        response_format: BILD_FORMAT,
      }
      if (istText(optionen.seitenverhaeltnis)) koerper['aspect_ratio'] = optionen.seitenverhaeltnis
      if (istText(optionen.aufloesung)) koerper['resolution'] = optionen.aufloesung
      if (optionen.qualitaet !== undefined) koerper['quality'] = optionen.qualitaet
      if (optionen.format !== undefined) koerper['output_format'] = optionen.format
      if (optionen.hintergrund !== undefined) koerper['background'] = optionen.hintergrund
      const referenzen = optionen.referenzen ?? []
      if (referenzen.length > 0) {
        koerper['input_references'] = referenzen.map((url) => ({
          type: 'image_url',
          image_url: { url },
        }))
      }
      const antwort = await rufe(WEG_BILD, JSON.stringify(koerper), schluessel, {
        'content-type': 'application/json',
      })
      const gelesen = await alsJson(antwort, WEG_BILD, schluessel)
      const daten = gelesen['data']
      if (!Array.isArray(daten) || daten.length === 0) {
        throw new OpenrouterFehler('Die Antwort auf den Bild-Weg enthielt kein `data`-Feld mit einem Bild.')
      }
      const erstes = daten[0]
      if (erstes === null || typeof erstes !== 'object') {
        throw new OpenrouterFehler('Der erste Eintrag der Bild-Antwort war kein Objekt.')
      }
      const satz = erstes as Record<string, unknown>
      const base64 = satz['b64_json']
      let bytes: Uint8Array
      if (typeof base64 === 'string' && base64 !== '') {
        bytes = new Uint8Array(Buffer.from(base64, 'base64'))
      } else {
        // **Der Verweis ist der zweite Weg — und der einzige, den diese Fassung noch nicht
        // gemessen hat.** Kommt er, wird er geholt statt geraten: ein `url`-Feld zu ignorieren
        // hieße, ein Bild zu verwerfen, das der Dienst geliefert hat.
        const verweis = satz['url']
        if (typeof verweis !== 'string' || verweis.trim() === '') {
          throw new OpenrouterFehler(
            'Die Bild-Antwort trug weder `b64_json` noch `url` — es ist nicht zu sehen, wo das Bild liegt.',
          )
        }
        const geholt = await abruf(verweis, { method: 'GET', signal: AbortSignal.timeout(fristMs) })
        if (!geholt.ok) {
          throw new OpenrouterFehler(
            `Das Bild unter dem Verweis war nicht abrufbar (Status ${String(geholt.status)}).`,
            geholt.status,
          )
        }
        bytes = new Uint8Array(await geholt.arrayBuffer())
      }
      if (bytes.length === 0) {
        throw new OpenrouterFehler('OpenRouter lieferte ein Bild ohne Inhalt (0 Bytes).')
      }
      // **Der Typ kommt zuerst aus `media_type`** — die Bild-API nennt ihn, wenn sie ihn kennt.
      // Fehlt er, entscheiden die Bytes (`bildArt`); eine Endung entscheidet nie.
      const gemeldet = satz['media_type']
      const typ = typeof gemeldet === 'string' && gemeldet !== '' ? gemeldet : bildArt(bytes)
      // **Der Preis, wenn der Dienst ihn nennt.** `usage.cost` steht in der Antwort; ihn zu
      // verschweigen hieße, dem Aufrufer die einzige Zahl vorzuenthalten, die er wirklich braucht.
      const nutzung = gelesen['usage']
      const kosten =
        nutzung !== null && typeof nutzung === 'object' && typeof (nutzung as Record<string, unknown>)['cost'] === 'number'
          ? ((nutzung as Record<string, unknown>)['cost'] as number)
          : undefined
      return { bytes, typ, ...(kosten === undefined ? {} : { kostenUsd: kosten }) }
    },
  }

  // -------------------------------------------------------------------------
  // Der Anbieter
  // -------------------------------------------------------------------------

  return {
    id: 'openrouter',
    name: 'OpenRouter',
    faehigkeiten: FAEHIGKEITEN_OPENROUTER,
    schluessel: 'schluessel-noetig',
    modelle(faehigkeit: Faehigkeit): readonly string[] {
      if (!FAEHIGKEITEN_OPENROUTER.includes(faehigkeit)) return []
      const gewaehlt = modellFuer(faehigkeit)
      const vorschlaege = VORSCHLAEGE[faehigkeit] ?? []
      // **Die eigene Wahl steht vorn.** Sie ist die, die gerade gilt — und wer eine Liste zu sehen
      // bekommt, soll die geltende Einstellung nicht suchen müssen.
      return gewaehlt === undefined
        ? [...vorschlaege]
        : [gewaehlt, ...vorschlaege.filter((m) => m !== gewaehlt)]
    },
    /**
     * Ist er **für diese Fähigkeit** einsatzbereit?
     *
     * **Warum hier NICHT ins Netz gefragt wird.** „Bereit" muß billig und schnell sein: die
     * Registratur fragt jeden Anbieter bei jeder Auswahl. Ein Netzzugriff an dieser Stelle würde
     * jede Anfrage verdoppeln — und bei fehlender Verbindung die Auswahl blockieren, statt sie
     * einem anderen Anbieter zu überlassen.
     *
     * Geprüft wird deshalb, was **ohne Netz** entscheidbar ist: kann er die Fähigkeit überhaupt,
     * ist ein Schlüssel da, und ist ein Modell **eingestellt**.
     *
     * @param faehigkeit - die Fähigkeit, für die gefragt wird
     * @returns die Auskunft
     */
    async bereit(faehigkeit: Faehigkeit): Promise<Bereitschaft> {
      if (!FAEHIGKEITEN_OPENROUTER.includes(faehigkeit)) {
        return { bereit: false, grund: `OpenRouter kann „${NAME_DER_FAEHIGKEIT[faehigkeit]}" nicht.` }
      }
      const schluessel = await holeSchluessel()
      if (schluessel === undefined) {
        return {
          bereit: false,
          grund: `Kein Schlüssel hinterlegt (${UMWELT_SCHLUESSEL} oder übergebene Quelle).`,
        }
      }
      const modell = modellFuer(faehigkeit)
      if (modell === undefined) {
        const vorschlaege = VORSCHLAEGE[faehigkeit] ?? []
        return {
          bereit: false,
          grund:
            `Kein Modell für „${NAME_DER_FAEHIGKEIT[faehigkeit]}" eingestellt` +
            (vorschlaege.length === 0 ? '.' : ` (Vorschläge: ${vorschlaege.join(', ')}).`),
        }
      }
      return { bereit: true }
    },
    entscheider,
    sprecher,
    hoerer,
    einbetter,
    zeichner,
  }
}
