/**
 * Die Sonde — sie prüft einen Eintrag gegen die **lebende** Schnittstelle.
 *
 * ## Warum es sie geben muß
 *
 * Gemessen am 15.10.2026: `POST /embeddings` auf `api.deepseek.com` gibt **404** — DeepSeek kann
 * nicht einbetten. Dieselbe Frage an OpenRouter: **3072 Dimensionen**. Diese beiden Antworten sehen
 * von außen gleich aus („ein Dienst, ein Schlüssel") und sind doch verschiedene Welten.
 *
 * Wer einen Anbieter einträgt, soll das **nicht raten** müssen — und wer eine Tabelle von Hand
 * pflegt, soll sie **nachmessen** können. Das ist der Zweck: aus „unbestätigt" wird „gemessen",
 * durch einen Aufruf statt durch eine Meinung.
 *
 * ## Warum die Sonde KOSTENLOS ist
 *
 * Sie schickt **absichtlich unbrauchbare** Aufträge: einen leeren Körper. Der Dienst antwortet mit
 * **400** — und eine abgewiesene Anfrage erzeugt keine Antwort und damit keine Rechnung. Der
 * Statuscode verrät trotzdem alles, was die Sonde wissen will: **404 heißt „diesen Weg gibt es
 * nicht"**, 400 heißt „diesen Weg gibt es, dein Auftrag war nur falsch".
 *
 * **Was die Sonde NICHT tut: eine Fähigkeit wirklich aufrufen.** Sie würde sonst Geld ausgeben,
 * nur um zu sehen, ob etwas geht.
 *
 * ## Warum ein 401 NICHT als „vorhanden" zählt
 *
 * Ein Tor, das alles mit 401 beantwortet, sagt nichts über den Weg dahinter. Wer 401 als Beweis
 * nimmt, hält jeden Pfad für vorhanden — und trägt einen Anbieter ein, der nichts kann.
 *
 * @module @prometheus-harness/provider-directory/probe
 */

import { entschaerfeText, findeBekannte } from '@prometheus-harness/guard'
import type { Faehigkeit } from '@prometheus-harness/faehigkeiten'
import type { Familie, Weg, Wegart } from './families.ts'

/** Ein austauschbarer Netzzugriff — für die Prüfung. */
export type Abruf = (adresse: string, einstellung: RequestInit) => Promise<Response>

/** Was der Aufruf der Sonde braucht. */
export interface SondeOptionen {
  /** Der Schlüssel. Fehlt er, wird nur die Modellliste versucht — und der Rest bleibt offen. */
  readonly schluessel?: string
  /** Der Netzzugriff. Vorgabe: das eingebaute `fetch`. */
  readonly abruf?: Abruf
  /** Die Frist je Aufruf in Millisekunden. Vorgabe: 20 000. */
  readonly fristMs?: number
}

/** Ein Fehler im Umgang mit dem Verzeichnis — mit Status, aber **ohne** Schlüssel. */
export class VerzeichnisFehler extends Error {
  /**
   * @param meldung - was schiefging
   * @param status - der HTTP-Status, wenn es einen gab
   */
  constructor(
    meldung: string,
    readonly status?: number,
  ) {
    super(meldung)
    this.name = 'VerzeichnisFehler'
  }
}

/** Was eine Prüfung eines Weges ergeben kann. */
export type Wegbefund =
  /** Der Weg ist da: der Dienst hat ihn angenommen und den Auftrag abgewiesen. */
  | 'vorhanden'
  /** Der Weg ist nicht da: **404**. */
  | 'fehlt'
  /** Der Weg konnte nicht beurteilt werden — Tor, Netzfehler, oder kein Weg bekannt. */
  | 'unbekannt'

/** Was die Sonde über eine Familie ergibt. */
export interface Sondebefund {
  /** Die Kennung der Familie. */
  readonly familie: string
  /** Die Modelle, die die Models-API genannt hat. */
  readonly modelle: readonly string[]
  /** Je Fähigkeit der Befund. */
  readonly wege: Readonly<Record<string, Wegbefund>>
  /** Ob die Modellliste überhaupt zu bekommen war. */
  readonly modelleErreichbar: boolean
  /** Was sonst zu sagen ist — **ohne** Schlüssel. */
  readonly bemerkung: string
}

/**
 * Der übliche Pfad je Fähigkeit, wenn die Familie keinen nennt.
 *
 * **Warum das nötig ist.** Die Sonde soll auch dann messen können, wenn die Tabelle einen Weg
 * **nicht** kennt — sonst könnte sie einen Irrtum der Tabelle nie aufdecken. Diese Pfade sind die
 * verbreiteten (OpenAI-kompatiblen), und genau mit ihnen habe ich am 15.10.2026 festgestellt, daß
 * DeepSeek sie mit **404** beantwortet.
 */
export const VERSUCHSPFAD: Readonly<Record<Faehigkeit, { readonly pfad: string; readonly art: Wegart }>> = {
  gespraech: { pfad: '/chat/completions', art: 'json' },
  entscheiden: { pfad: '/chat/completions', art: 'json' },
  'text-zu-sprache': { pfad: '/audio/speech', art: 'json' },
  'sprache-zu-text': { pfad: '/audio/transcriptions', art: 'mehrtelldaten' },
  einbetten: { pfad: '/embeddings', art: 'json' },
  bild: { pfad: '/images/generations', art: 'json' },
}

/** Die Frist, wenn keine genannt wird. */
const FRIST_MS = 20_000

/**
 * Macht einen Schlüssel unkenntlich, falls er in einem Text steht.
 *
 * **Warum hier keine eigene Umsetzung steht.** Der Wächter hat bereits eine geprüfte Entschärfung;
 * eine zweite zu schreiben hieße, dieselbe Regel an zwei Stellen zu pflegen — und irgendwann an
 * einer davon falsch.
 *
 * @param text - der Text
 * @param geheim - der Schlüssel
 * @returns der entschärfte Text
 */
function entschaerfe(text: string, geheim: string | undefined): string {
  if (geheim === undefined) return text
  return entschaerfeText(text, findeBekannte(text, [{ name: 'schluessel', wert: geheim }]))
}

/**
 * Holt die Kopfzeilen für eine Familie.
 *
 * @param familie - die Familie
 * @param schluessel - der Schlüssel, wenn es einen gibt
 * @returns die Kopfzeilen
 */
function kopfFuer(familie: Familie, schluessel: string | undefined): Record<string, string> {
  return schluessel === undefined ? {} : familie.kopf(schluessel)
}

/**
 * Fragt die **Models API** — und liefert die Kennungen.
 *
 * **Warum das allein nicht reicht.** Gemessen: die Liste von OpenRouter nennt 462 Einträge und
 * **verschweigt** darin `gemini-3.8-flash-tts`, `gemini-3.5-transcribe` und `gemini-embedding-2`.
 * Eine Liste ist kein Beweis für Abwesenheit — und aus ihr allein läßt sich keine Fähigkeit
 * ableiten.
 *
 * @param familie - die Familie
 * @param optionen - Schlüssel, Netzzugriff, Frist
 * @returns die Modellkennungen, in der Reihenfolge der Antwort
 * @throws VerzeichnisFehler - wenn der Dienst nicht antwortet oder keine Liste liefert
 */
export async function frageModelle(
  familie: Familie,
  optionen: SondeOptionen = {},
): Promise<readonly string[]> {
  const abruf: Abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung))
  const adresse = `${familie.basis}${familie.modellWeg}`
  let antwort: Response
  try {
    antwort = await abruf(adresse, {
      method: 'GET',
      headers: kopfFuer(familie, optionen.schluessel),
      signal: AbortSignal.timeout(optionen.fristMs ?? FRIST_MS),
    })
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler)
    throw new VerzeichnisFehler(
      entschaerfe(`Die Models-API von „${familie.name}" war nicht erreichbar: ${grund}`, optionen.schluessel),
    )
  }
  if (!antwort.ok) {
    throw new VerzeichnisFehler(
      `Die Models-API von „${familie.name}" antwortete mit Status ${String(antwort.status)}.`,
      antwort.status,
    )
  }
  const roh = entschaerfe(await antwort.text(), optionen.schluessel)
  let gelesen: unknown
  try {
    gelesen = JSON.parse(roh)
  } catch {
    throw new VerzeichnisFehler(
      `Die Models-API von „${familie.name}" lieferte kein JSON: ${roh.slice(0, 200)}`,
    )
  }
  const daten = (gelesen as { data?: unknown }).data
  if (!Array.isArray(daten)) {
    // **Kein Raten.** Manche Dienste nennen das Feld `models`. Es zu erraten hieße, eine leere
    // Liste als „kann nichts" zu lesen — und einen Anbieter zu verwerfen, der alles kann.
    throw new VerzeichnisFehler(
      `Die Models-API von „${familie.name}" hatte kein Feld „data" mit einer Liste — die Form ist unbekannt.`,
    )
  }
  const kennungen: string[] = []
  for (const eintrag of daten) {
    if (eintrag !== null && typeof eintrag === 'object' && typeof (eintrag as { id?: unknown }).id === 'string') {
      kennungen.push((eintrag as { id: string }).id)
    }
  }
  return kennungen
}

/**
 * Prüft **einen** Weg, ohne ihn zu benutzen.
 *
 * Schickt einen absichtlich unbrauchbaren Auftrag und liest **nur den Status**. Der Körper der
 * Antwort wird nicht angesehen — deshalb kann in einer Meldung auch kein Geheimnis stehen.
 *
 * @param familie - die Familie
 * @param faehigkeit - die Fähigkeit
 * @param optionen - Schlüssel, Netzzugriff, Frist
 * @returns der Befund
 */
export async function pruefeWeg(
  familie: Familie,
  faehigkeit: Faehigkeit,
  optionen: SondeOptionen = {},
): Promise<Wegbefund> {
  const ausTabelle: Weg | undefined = familie.wege[faehigkeit]
  const weg = ausTabelle ?? VERSUCHSPFAD[faehigkeit]
  const abruf: Abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung))

  // Der leere Auftrag: bei Mehrtelldaten eine leere Form, sonst ein leeres Objekt. Beides ist
  // unbrauchbar — und genau deshalb kostenlos.
  const mehrtelldaten = weg.art === 'mehrtelldaten'
  const koerper: string | FormData = mehrtelldaten ? new FormData() : '{}'
  const kopf: Record<string, string> = {
    ...kopfFuer(familie, optionen.schluessel),
    ...(mehrtelldaten ? {} : { 'content-type': 'application/json' }),
  }

  try {
    const antwort = await abruf(`${familie.basis}${weg.pfad}`, {
      method: 'POST',
      headers: kopf,
      body: koerper,
      signal: AbortSignal.timeout(optionen.fristMs ?? FRIST_MS),
    })
    return deuteStatus(antwort.status)
  } catch {
    // Ein Netzfehler sagt nichts über den Weg.
    return 'unbekannt'
  }
}

/**
 * Deutet einen Statuscode.
 *
 * | Status | Deutung | Warum |
 * |---|---|---|
 * | 200, 201 | vorhanden | Der Dienst hat geantwortet |
 * | 400, 405, 415, 422 | vorhanden | Der Weg wurde **angenommen** und der Auftrag abgewiesen |
 * | 404 | fehlt | Der Weg ist nicht da |
 * | 401, 403 | unbekannt | Ein Tor beantwortet **alles** so — es sagt nichts über den Weg |
 * | sonst | unbekannt | Nicht gedeutet |
 *
 * @param status - der HTTP-Status
 * @returns der Befund
 */
function deuteStatus(status: number): Wegbefund {
  if (status === 200 || status === 201) return 'vorhanden'
  if (status === 404) return 'fehlt'
  if (status === 400 || status === 405 || status === 415 || status === 422) return 'vorhanden'
  return 'unbekannt'
}

/**
 * Prüft eine ganze Familie: die Models-API und jeden Weg.
 *
 * @param familie - die Familie
 * @param optionen - Schlüssel, Netzzugriff, Frist
 * @returns der Befund
 */
export async function sonde(
  familie: Familie,
  optionen: SondeOptionen = {},
): Promise<Sondebefund> {
  let modelle: readonly string[] = []
  let modelleErreichbar = false
  const bemerkungen: string[] = []

  try {
    modelle = await frageModelle(familie, optionen)
    modelleErreichbar = true
    if (modelle.length === 0) {
      bemerkungen.push('Die Models-API antwortete mit einer LEEREN Liste.')
    }
  } catch (fehler) {
    bemerkungen.push(fehler instanceof Error ? fehler.message : String(fehler))
  }

  const wege: Record<string, Wegbefund> = {}
  for (const faehigkeit of Object.keys(VERSUCHSPFAD) as Faehigkeit[]) {
    wege[faehigkeit] = await pruefeWeg(familie, faehigkeit, optionen)
  }

  const fehlend = Object.entries(wege)
    .filter(([, befund]) => befund === 'vorhanden')
    .map(([f]) => f)
  bemerkungen.push(
    fehlend.length === 0
      ? 'Kein Weg war als vorhanden zu erkennen.'
      : `Als vorhanden erkannt: ${fehlend.join(', ')}.`,
  )
  bemerkungen.push(
    'Die Sonde RUFT KEINE Fähigkeit wirklich auf — sie kostet deshalb nichts.',
  )

  return {
    familie: familie.id,
    modelle,
    wege,
    modelleErreichbar,
    bemerkung: bemerkungen.join(' '),
  }
}
