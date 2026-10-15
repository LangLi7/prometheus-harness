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
 * Anbieter falsch. Deshalb steht hier, je Familie und je Fähigkeit: **welcher Pfad, welche
 * Feldnamen, welches Antwortfeld**.
 *
 * ## Der wichtigste Wert ist der, der FEHLT
 *
 * Eine Fähigkeit, die in {@link Familie.wege} nicht steht, kann diese Familie **nach unserem
 * Wissen** nicht. Das ist eine Aussage über unser Wissen, nicht über die Welt — deshalb steht in
 * {@link Familie.stand} daneben, was gemessen ist und was nicht. Und deshalb gibt es
 * {@link Weg.gemessenAm}: fehlt es, ist der Weg **unbestätigt** und die Sonde muß ihn prüfen.
 *
 * @module @prometheus-harness/verzeichnis/familien
 */

import type { Faehigkeit } from '@prometheus-harness/faehigkeiten'

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
   * Das ist die eigentliche Übersetzungstabelle: `text` heißt bei OpenRouter `input`, die Stimme
   * heißt `voice`, das Tonformat heißt `response_format`. Wer das errät, schickt einen Körper, den
   * der Dienst nicht versteht — und bekommt eine Fehlermeldung, die nach etwas anderem klingt.
   */
  readonly felder: Readonly<Record<string, string>>
  /** Wo die Antwort steht — in Worten, weil sie von Fähigkeit zu Fähigkeit verschieden ist. */
  readonly aus: string
  /**
   * Wann dieser Weg **lebend gemessen** wurde (`2026-10-15`) — oder `undefined`.
   *
   * Fehlt der Wert, ist der Weg **unbestätigt**: er stammt aus Dokumentation oder Vermutung.
   * Ein unbestätigter Weg darf benutzt werden, aber niemand darf sich darauf verlassen — die
   * Sonde macht daraus ein „gemessen".
   */
  readonly gemessenAm?: string
}

/** Eine Familie von APIs — OpenAI-kompatibel, Google AI Studio, was auch immer. */
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
   * Als Funktion, damit der Schlüssel nie in der Tabelle steht — die Tabelle ist Daten und wird
   * angezeigt; ein Schlüssel darin wäre in jeder Anzeige mit dabei.
   *
   * @param schluessel - der Schlüssel
   * @returns die Kopfzeilen
   */
  readonly kopf: (schluessel: string) => Record<string, string>
  /** Der Weg, der die Modelle nennt — die „Models API". */
  readonly modellWeg: string
  /** Je Fähigkeit der Weg. **Fehlt eine, kann die Familie sie nach unserem Wissen nicht.** */
  readonly wege: Partial<Record<Faehigkeit, Weg>>
  /** Was gemessen ist und was nicht — in Worten, für den Menschen. */
  readonly stand: string
}

/**
 * OpenRouter — **vier Fähigkeiten, alle vier lebend gemessen**.
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
    entscheiden: {
      pfad: '/chat/completions',
      art: 'json',
      felder: { modell: 'model', nachrichten: 'messages', schema: 'response_format' },
      aus: 'choices[0].message.content — und NUR dort; das Denken steht in message.reasoning',
      gemessenAm: '2026-10-15',
    },
    'text-zu-sprache': {
      pfad: '/audio/speech',
      art: 'json',
      // `response_format: 'pcm'` ist kein Geschmack: gemessen kann Gemini **nur** pcm.
      felder: { modell: 'model', text: 'input', stimme: 'voice', format: 'response_format' },
      aus: 'rohe Bytes; der Typ kommt aus der Kopfzeile (audio/pcm;rate=24000;channels=1)',
      gemessenAm: '2026-10-15',
    },
    'sprache-zu-text': {
      pfad: '/audio/transcriptions',
      art: 'mehrtelldaten',
      felder: { modell: 'model', ton: 'file', sprache: 'language' },
      aus: 'text',
      gemessenAm: '2026-10-15',
    },
    einbetten: {
      pfad: '/embeddings',
      art: 'json',
      felder: { modell: 'model', texte: 'input' },
      aus: 'data[].embedding — nach index zu ordnen, nicht nach Reihenfolge',
      gemessenAm: '2026-10-15',
    },
  },
  stand:
    'Vier Fähigkeiten lebend aufgerufen (Ton 140160 Bytes, Transkription mit Kosten, Einbettung ' +
    '3072 Dimensionen). `bild`: der Weg /images/generations EXISTIERT — gemessen am 15.10.2026 ' +
    'gibt er 400 auf einen leeren Auftrag, während ein erfundener Pfad 404 gibt. Die FORM des ' +
    'Auftrags ist aber UNGEMESSEN, deshalb steht die Fähigkeit hier NICHT: ein vorhandener Weg ' +
    'ist nicht dasselbe wie eine wirkende Fähigkeit. Die Modellliste nennt 462 Einträge und ' +
    'verschweigt darin TTS, Transkription und Einbetten.',
}

/**
 * DeepSeek — **nur Chat**, und das ist gemessen.
 *
 * `POST /embeddings`, `POST /audio/speech` und `POST /audio/transcriptions` geben dort **404**.
 */
export const DEEPSEEK: Familie = {
  id: 'deepseek',
  name: 'DeepSeek',
  basis: 'https://api.deepseek.com',
  kopf: (schluessel) => ({ authorization: `Bearer ${schluessel}` }),
  modellWeg: '/models',
  wege: {
    entscheiden: {
      pfad: '/chat/completions',
      art: 'json',
      felder: { modell: 'model', nachrichten: 'messages', schema: 'response_format' },
      aus: 'choices[0].message.content',
      // **Kein `gemessenAm` — und das ist Absicht.** Gemessen ist: die drei Nicht-Chat-Wege geben
      // 404, und `/models` nennt deepseek-flash und deepseek-v4-pro. Ob DeepSeek strukturierte
      // Ausgabe über `json_schema` kann oder nur über `json_object`, ist **nicht** gemessen.
      // Also gilt der Weg als unbestätigt, bis die Sonde ihn prüft.
    },
  },
  stand:
    'Gemessen am 15.10.2026: nur Chat. /embeddings, /audio/speech, /audio/transcriptions und ' +
    '/images/generations geben 404, während der Chat-Weg auf einen leeren Auftrag mit 422 ' +
    'antwortet (nicht 400) — die Sonde deutet beides als „vorhanden". Ein erfundener Pfad gibt ' +
    '404, die Unterscheidung ist also geprüft. Modelle: deepseek-flash, deepseek-v4-pro. ' +
    'Die Form der strukturierten Ausgabe ist UNGEMESSEN.',
}

/** Alle bekannten Familien. */
export const FAMILIEN: readonly Familie[] = [OPENROUTER, DEEPSEEK]

/**
 * Sucht eine Familie.
 *
 * @param id - die Kennung
 * @returns die Familie oder `undefined`
 */
export function familieMit(id: string): Familie | undefined {
  return FAMILIEN.find((f) => f.id === id)
}
