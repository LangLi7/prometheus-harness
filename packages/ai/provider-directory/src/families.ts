/**
 * Die API-Familien — **Daten, kein Code**.
 *
 * ## Warum das eine Tabelle sein muß und keine Klasse je Anbieter
 *
 * Gemessen am 15.10.2026: **dieselbe Fähigkeit hat je API eine andere Form.** `text-zu-sprache`
 * läuft bei OpenRouter über `/audio/speech` — der Chat-Weg **weist ein Sprachmodell ab** und nennt
 * den richtigen Weg in der Fehlermeldung. Bei DeepSeek gibt es `/audio/speech` **gar nicht** (404).
 *
 * Wer das je Anbieter neu programmiert, schreibt dieselbe Erkenntnis fünfmal — und beim sechsten
 * Anbieter falsch.
 *
 * ## Drei Zustände eines Weges, und warum sie getrennt stehen
 *
 * Ein Weg kann **benutzbar** sein, nur **als Pfad bestätigt**, oder **unbestätigt**. Diese drei zu
 * einer Aussage zu verschmelzen war der Fehler, den Regel 37 beschreibt: „der Weg ist da" ist
 * **nicht** „die Fähigkeit wirkt". Deshalb steht der Zustand in den Feldern selbst und wird von
 * {@link standDesWeges} ausgerechnet — nicht geraten.
 *
 * | Zustand | `gemessenAm` | `felder` | Was er heißt |
 * |---|---|---|---|
 * | `benutzbar` | gesetzt | gesetzt | Pfad **und** Form sind gemessen |
 * | `pfad-bestaetigt` | gesetzt | fehlt | Der Pfad antwortet; **wie** der Auftrag aussehen muß, ist unbekannt |
 * | `unbestaetigt` | fehlt | — | Weder Pfad noch Form sind geprüft |
 *
 * **Was ein Eintrag in {@link Familie.wege} NICHT behauptet:** daß die Fähigkeit *wirkt*. Er
 * behauptet: **wir kennen einen Weg dorthin.** Ob er trägt, sagt der Zustand.
 *
 * @module @prometheus-harness/provider-directory/families
 */

import type { Faehigkeit } from '@prometheus-harness/capabilities'

/** Wie ein Weg den Auftrag entgegennimmt. */
export type Wegart =
  /** JSON im Körper — der übliche Fall. */
  | 'json'
  /** Mehrtelldaten (`multipart/form-data`) — der Hör-Weg. */
  | 'mehrtelldaten'

/** Ein Weg zu **einer** Fähigkeit bei **einer** Familie. */
export interface Weg {
  /** Der Pfad, angehängt an die Basisadresse. */
  readonly pfad: string
  /** Wie der Auftrag hineingeht. */
  readonly art: Wegart
  /**
   * Wie die Felder heißen — **unser** Name auf **deren** Namen.
   *
   * Das ist die Übersetzungstabelle: `text` heißt bei OpenRouter `input`, die Stimme `voice`, das
   * Tonformat `response_format`. Wer das errät, schickt einen Körper, den der Dienst nicht versteht.
   *
   * **Fehlt dieses Feld, ist die Form UNGEMESSEN.** Dann stehen hier **keine** erfundenen Namen,
   * sondern gar keine — und {@link standDesWeges} sagt `pfad-bestaetigt`.
   */
  readonly felder?: Readonly<Record<string, string>>
  /** Wo die Antwort steht — **nur**, wenn das gemessen ist. */
  readonly aus?: string
  /**
   * Wann dieser **Pfad** lebend gemessen wurde (`2026-10-15`) — oder `undefined`.
   *
   * Gemessen heißt hier: die Sonde hat mit einem leeren Auftrag geprüft, daß der Pfad antwortet,
   * während ein erfundener Pfad **404** gibt.
   */
  readonly gemessenAm?: string
  /**
   * Wann die **Form** (`felder`, `aus`) lebend gemessen wurde — oder `undefined`.
   *
   * **Warum das getrennt vom Pfad steht.** Beim Bild-Weg lagen beide Messungen vier Tage
   * auseinander: der Pfad antwortete schon am 15.10. auf einen leeren Auftrag, die Feldnamen
   * kannte erst die Messung vom 19.10. Ein gemeinsames Datum wäre für eines von beiden falsch —
   * und „der Weg ist da" ist nicht „die Fähigkeit wirkt" (Regel 37).
   */
  readonly formGemessenAm?: string
}

/** Wie weit ein Weg belegt ist. */
export type Wegstand =
  /** Pfad **und** Form sind gemessen — der Weg ist benutzbar. */
  | 'benutzbar'
  /** Der Pfad ist bestätigt, die Form nicht. */
  | 'pfad-bestaetigt'
  /** Weder noch. */
  | 'unbestaetigt'

/** Der Tag, an dem die Wege dieses Verzeichnisses gemessen wurden. */
export const GEMESSEN_AM = '2026-10-15'

/**
 * Rechnet den Zustand eines Weges aus — statt ihn zu behaupten.
 *
 * @param weg - der Weg
 * @returns der Zustand
 */
export function standDesWeges(weg: Weg): Wegstand {
  if (weg.gemessenAm === undefined) return 'unbestaetigt'
  return weg.felder === undefined ? 'pfad-bestaetigt' : 'benutzbar'
}

/** Eine Familie von APIs — OpenAI-kompatibel, Google AI Studio, Anthropic, was auch immer. */
export interface Familie {
  /** Kurzname, stabil (`openrouter`). */
  readonly id: string
  /** Der Name für Menschen. */
  readonly name: string
  /** Die Basisadresse **ohne** Schrägstrich am Ende. */
  readonly basis: string
  /**
   * Wie der Schlüssel in den Kopf kommt.
   *
   * **Warum eine Funktion und keine Zeichenkette — gemessen.** Anthropic antwortet **nur** mit
   * `x-api-key` **und** `anthropic-version` (200, 14 Modelle); mit `Authorization: Bearer` wäre es
   * ein Fehler. Eine Zeichenkette könnte das nicht ausdrücken.
   *
   * @param schluessel - der Schlüssel
   * @returns die Kopfzeilen
   */
  readonly kopf: (schluessel: string) => Record<string, string>
  /** Der Weg, der die Modelle nennt — die „Models API". */
  readonly modellWeg: string
  /** Je Fähigkeit der **bekannte Weg**. Fehlt eine, kennen wir keinen. */
  readonly wege: Partial<Record<Faehigkeit, Weg>>
  /** Was gemessen ist und was nicht — in Worten, für den Menschen. */
  readonly stand: string
}

/**
 * OpenRouter — **vier Fähigkeiten benutzbar**, alle lebend aufgerufen.
 *
 * Ein Schlüssel bedient alle vier; die Modellkennung ist je Fähigkeit eine andere.
 */
export const OPENROUTER: Familie = {
  id: 'openrouter',
  name: 'OpenRouter',
  basis: 'https://openrouter.ai/api/v1',
  kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
  modellWeg: '/models',
  wege: {
    gespraech: {
      pfad: '/chat/completions',
      art: 'json',
      felder: { modell: 'model', nachrichten: 'messages' },
      aus: 'choices[0].message.content',
      gemessenAm: GEMESSEN_AM,
    },
    entscheiden: {
      pfad: '/chat/completions',
      art: 'json',
      felder: { modell: 'model', nachrichten: 'messages', schema: 'response_format' },
      aus: 'choices[0].message.content — und NUR dort; das Denken steht in message.reasoning',
      gemessenAm: GEMESSEN_AM,
    },
    'text-zu-sprache': {
      pfad: '/audio/speech',
      art: 'json',
      // `response_format: 'pcm'` ist kein Geschmack: gemessen kann Gemini **nur** pcm.
      felder: { modell: 'model', text: 'input', stimme: 'voice', format: 'response_format' },
      aus: 'rohe Bytes; der Typ kommt aus der Kopfzeile (audio/pcm;rate=24000;channels=1)',
      gemessenAm: GEMESSEN_AM,
    },
    'sprache-zu-text': {
      pfad: '/audio/transcriptions',
      art: 'mehrtelldaten',
      felder: { modell: 'model', ton: 'file', sprache: 'language' },
      aus: 'text',
      gemessenAm: GEMESSEN_AM,
    },
    einbetten: {
      pfad: '/embeddings',
      art: 'json',
      felder: { modell: 'model', texte: 'input' },
      aus: 'data[].embedding — nach index zu ordnen, nicht nach Reihenfolge',
      gemessenAm: GEMESSEN_AM,
    },
    bild: {
      // **Seit dem 19.10.2026 ist auch die FORM gemessen** — und zwar mit einem echten Auftrag:
      // `google/gemini-2.5-flash-image` antwortete mit 200 und einem Bild. Der erste Versuch
      // (`nano-banana`) gab 429, also einen Fehler des Anbieters und keinen der Form.
      //
      // **Der Befund, der die Feldnamen rechtfertigt:** die Antwort steht in `data[0].b64_json`.
      // Der Behälter war ein **PNG** — die Sonde hatte die Datei nur `.png` genannt, und das war
      // eine Annahme der Endung. Der Typ gehört deshalb aus den Bytes gelesen; im Anbieter tut
      // `bildArt` das.
      pfad: '/images/generations',
      art: 'json',
      felder: { modell: 'model', beschreibung: 'prompt', anzahl: 'n', format: 'response_format' },
      aus: 'data[0].b64_json (Base64) oder data[0].url — der Typ kommt aus den ersten Bytes',
      gemessenAm: GEMESSEN_AM,
      formGemessenAm: '2026-10-19',
    },
  },
  stand:
    'Fünf Fähigkeiten lebend aufgerufen (Ton 140160 Bytes, Transkription mit Kosten, Einbettung ' +
    '3072 Dimensionen, Bild als JPEG aus Base64). `bild`: Pfad UND Form sind gemessen (19.10.2026, ' +
    '`gemini-2.5-flash-image`) — der erste Versuch mit `nano-banana` gab 429, das war ein ' +
    'Kontingent und kein Formfehler. Die Modellliste nennt 462 Einträge und verschweigt darin TTS, ' +
    'Transkription, Einbetten und Bild: eine Liste ist kein Beweis für Abwesenheit.',
}

/**
 * DeepSeek — **nur Chat**, und das ist gemessen.
 *
 * **Der Betreiber nutzt DeepSeek als Verwalter** des Verzeichnisses, wegen des
 * Preis-Leistungs-Verhältnisses. Die vier 404-Wege sind für diese Rolle **kein** Mangel: ein
 * Verwalter muß lesen und auslegen, nicht sprechen oder zeichnen.
 */
export const DEEPSEEK: Familie = {
  id: 'deepseek',
  name: 'DeepSeek',
  basis: 'https://api.deepseek.com',
  kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
  modellWeg: '/models',
  wege: {
    gespraech: {
      pfad: '/chat/completions',
      art: 'json',
      felder: { modell: 'model', nachrichten: 'messages' },
      aus: 'choices[0].message.content',
      gemessenAm: GEMESSEN_AM,
    },
    entscheiden: {
      pfad: '/chat/completions',
      art: 'json',
      // **Der Pfad ist gemessen** (422 auf einen leeren Auftrag, 404 auf einen erfundenen).
      // **Die Form ist es nicht**: ob DeepSeek strukturierte Ausgabe über `json_schema` kann oder
      // nur über `json_object`, hat niemand geprüft. Deshalb steht hier kein `felder` — der
      // Zustand ist `pfad-bestaetigt`, und das ist ehrlicher als ein geratener Feldname.
      gemessenAm: GEMESSEN_AM,
    },
  },
  stand:
    'Gemessen: nur Chat. /embeddings, /audio/speech, /audio/transcriptions und ' +
    '/images/generations geben 404, während der Chat-Weg auf einen leeren Auftrag mit 422 ' +
    'antwortet (nicht 400). Ein erfundener Pfad gibt 404 — die Unterscheidung ist geprüft. ' +
    'Modelle: deepseek-flash, deepseek-v4-pro. Die Form der strukturierten Ausgabe ist UNGEMESSEN.',
}

/**
 * Anthropic — **ein anderer Kopf und ein anderer Chat-Weg**.
 *
 * Der gemessene Beweis dafür, daß eine Familie nicht „OpenAI-kompatibel" ist: mit `x-api-key`
 * **und** `anthropic-version` gibt es 200 mit 14 Modellen; der Chat läuft über `/messages`.
 */
export const ANTHROPIC: Familie = {
  id: 'anthropic',
  name: 'Anthropic',
  basis: 'https://api.anthropic.com/v1',
  kopf: (schluessel) => ({ 'x-api-key': schluessel, 'anthropic-version': '2023-06-01' }),
  modellWeg: '/models',
  wege: {
    gespraech: {
      pfad: '/messages',
      art: 'json',
      // Die Form von Anthropics `/messages` weicht ab (`max_tokens` ist Pflicht, `system` ist ein
      // eigenes Feld, `response_format` gibt es so nicht). **Ungemessen** — also keine Feldnamen.
      gemessenAm: GEMESSEN_AM,
    },
    entscheiden: {
      pfad: '/messages',
      art: 'json',
      gemessenAm: GEMESSEN_AM,
    },
  },
  stand:
    'Models-API mit x-api-key + anthropic-version: 200, 14 Modelle. Chat über /messages ' +
    '(gemessen: 400 auf einen leeren Auftrag). Einbettung, Ton und Bild: 404 — es gibt sie dort ' +
    'nicht. **Der Chat-Weg /chat/completions antwortet ebenfalls mit 400** — gemessen und unerklärt; ' +
    'ich schreibe es hin, statt es wegzuerklären. Die FORM beider Wege ist ungemessen.',
}

/**
 * Z.ai (Zhipu / BigModel).
 *
 * **Der Befund, der zur Vorsicht zwingt:** alle fünf Wege antworten auf einen **leeren** Auftrag
 * mit **200**. Das ist **nicht** dasselbe wie „funktioniert" — ein leerer Auftrag, der mit 200
 * beantwortet wird, riecht nach einer Fehlerhülle mit falschem Status. Der Pfad ist damit bestätigt,
 * die Wirkung **nicht**.
 */
export const ZAI: Familie = {
  id: 'zai',
  name: 'Z.ai',
  basis: 'https://api.z.ai/api/paas/v4',
  kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
  modellWeg: '/models',
  wege: {
    gespraech: { pfad: '/chat/completions', art: 'json', gemessenAm: GEMESSEN_AM },
    entscheiden: { pfad: '/chat/completions', art: 'json', gemessenAm: GEMESSEN_AM },
    'text-zu-sprache': { pfad: '/audio/speech', art: 'json', gemessenAm: GEMESSEN_AM },
    'sprache-zu-text': { pfad: '/audio/transcriptions', art: 'mehrtelldaten', gemessenAm: GEMESSEN_AM },
    einbetten: { pfad: '/embeddings', art: 'json', gemessenAm: GEMESSEN_AM },
    bild: { pfad: '/images/generations', art: 'json', gemessenAm: GEMESSEN_AM },
  },
  stand:
    'Models-API: 200, 11 Modelle (api.z.ai und open.bigmodel.cn sind dieselbe Sache). Alle fünf ' +
    'Wege sind als PFAD bestätigt — mit einer Warnung: sie antworten auf einen LEEREN Auftrag mit ' +
    '200, und ein erfundener Pfad gibt 404. Die Unterscheidung ist also echt, aber 200 auf einen ' +
    'leeren Auftrag bedeutet NICHT, daß es funktioniert. Alle Formen sind ungemessen.',
}

/**
 * ZenMux — **mit diesem Schlüssel nicht prüfbar**.
 *
 * `GET /models` gibt 200 mit 207 Modellen, aber **jeder** POST gibt 403 — auch der erfundene Pfad
 * (der gibt 500). Hier lernt man **nichts** über Wege. Genau dafür steht in der Sonde die Regel
 * „TOR → unbekannt": wer 403 als „vorhanden" liest, trägt einen Anbieter ein, der nichts kann.
 */
export const ZENMUX: Familie = {
  id: 'zenmux',
  name: 'ZenMux',
  basis: 'https://zenmux.ai/api/v1',
  kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
  modellWeg: '/models',
  // **Leer, und das ist die ehrliche Antwort.** Kein Weg ist mit diesem Schlüssel prüfbar.
  wege: {},
  stand:
    'Models-API: 200, 207 Modelle. Jeder POST gibt 403 — auch ein erfundener Pfad (500). POSTs ' +
    'sind mit diesem Schlüssel NICHT prüfbar; über Wege ist nichts bekannt. Kein Eintrag ist ' +
    'besser als ein geratener.',
}

/**
 * Nous Research — Chat, sonst nichts.
 */
export const NOUS: Familie = {
  id: 'nous',
  name: 'Nous Research',
  basis: 'https://inference-api.nousresearch.com/v1',
  kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
  modellWeg: '/models',
  wege: {
    gespraech: { pfad: '/chat/completions', art: 'json', gemessenAm: GEMESSEN_AM },
    entscheiden: { pfad: '/chat/completions', art: 'json', gemessenAm: GEMESSEN_AM },
  },
  stand:
    'Models-API: 200, 423 Modelle. Chat über /chat/completions (400 auf leeren Auftrag). ' +
    'Einbettung, Ton und Bild: 404. **/messages antwortet ebenfalls mit 400** — gemessen und ' +
    'unerklärt. Formen ungemessen.',
}

/**
 * OpenCode Zen — der Chat-Weg **antwortet mit 500**.
 *
 * Der Pfad **ist** da (der erfundene Pfad gibt 404), aber der Dienst scheitert an einem leeren
 * Auftrag. Die Sonde deutet 500 als **unbekannt** — die vorsichtige Lesart.
 */
export const OPENCODE: Familie = {
  id: 'opencode',
  name: 'OpenCode Zen',
  basis: 'https://opencode.ai/zen/v1',
  kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
  modellWeg: '/models',
  wege: {
    gespraech: { pfad: '/chat/completions', art: 'json', gemessenAm: GEMESSEN_AM },
    entscheiden: { pfad: '/chat/completions', art: 'json', gemessenAm: GEMESSEN_AM },
  },
  stand:
    'Models-API: 200, 86 Modelle. Der Chat-Weg gibt auf einen leeren Auftrag 500 — der Pfad ist ' +
    'da, der Dienst scheitert aber daran. Einbettung, Ton und Bild: 404. Formen ungemessen.',
}

/**
 * TypeSafe (Jev) — **kein Chat, sondern typisierte Fragen**.
 *
 * ## Warum diese Familie anders aussieht als die übrigen
 *
 * Alle anderen Familien sprechen über `messages`/`input` und antworten mit **Text**. TypeSafe
 * nimmt einen `state` und benannte `questions` entgegen und antwortet mit `answers` — je Frage
 * ein typisierter Wert samt `confidence`. Das ist der Grund, aus dem es einen eigenen Anbieter
 * gibt (`@prometheus-harness/typesafe`) und nicht der OpenAI-kompatible Weg genügt: über
 * `response_format` käme das JSON, aber **nicht** die `confidence`.
 *
 * ## Warum hier KEIN `gemessenAm` steht
 *
 * Der Pfad stammt aus der Dokumentation (`docs.typesafe.ai/api/system-one`, gelesen am
 * 28.10.2026) — **nicht** aus einem eigenen Aufruf. Ein Datum daranzuschreiben wäre die
 * Behauptung einer Messung, die nicht stattgefunden hat. Der Weg ist damit `unbestaetigt`, und
 * das ist die ehrliche Auskunft.
 */
export const TYPESAFE: Familie = {
  id: 'typesafe',
  name: 'TypeSafe (Jev)',
  basis: 'https://api.typesafe.ai',
  kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
  modellWeg: '/v1/models',
  wege: {
    entscheiden: { pfad: '/v1/systemone', art: 'json' },
  },
  stand:
    'Pfad aus der Dokumentation, nicht selbst gemessen — kein Datum daran. Besonderheit: die ' +
    'Antwort ist kein Text, sondern typisierte Antworten mit `confidence`; `sicherheit` kommt von ' +
    'dort und wird nicht erfragt. Freier Text und freie Zahlen gehen NICHT (Jev generiert nicht). ' +
    'Preis (Dokumentation): $42 pro Milliarde Input-Token, Output kostenlos. Kontext 64k je ' +
    'Anfrage / 32k je Frage, per Kopf auf 262k erhöhbar.',
}

/** Alle bekannten Familien. */
export const FAMILIEN: readonly Familie[] = [
  OPENROUTER,
  DEEPSEEK,
  ANTHROPIC,
  ZAI,
  ZENMUX,
  NOUS,
  OPENCODE,
  TYPESAFE,
]

/**
 * Sucht eine Familie.
 *
 * @param id - die Kennung
 * @returns die Familie oder `undefined`
 */
export function familieMit(id: string): Familie | undefined {
  return FAMILIEN.find((f) => f.id === id)
}
