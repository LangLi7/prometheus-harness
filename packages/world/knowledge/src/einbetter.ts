/**
 * **Die Einbetter — austauschbar, mit Preis, und ohne stille Kosten.**
 *
 * ## Warum das eine eigene Datei ist
 *
 * Der Betreiber, 27.10.2026: *„ich würde sagen alle — und den User für die Auswahl
 * lassen, ob er es nutzen will, um Kosten zu sparen."*
 *
 * Daraus folgen zwei Dinge, die hier stehen und nicht in der Verdrahtung:
 *
 * 1. **Der Preis ist eine Eigenschaft des Einbetters**, nicht eine Angabe im Aufruf.
 *    `kostenProMio === 0` heißt *kostenlos und ohne Rückfrage*; jeder andere Wert
 *    heißt *vorher fragen*. Wer den Preis im Aufruf mitgäbe, könnte ihn vergessen.
 * 2. **Die Dimension ist eine Zusage.** Der Speicher hat `vector(768)`; ein Modell
 *    mit 1024 Dimensionen paßt nicht hinein, und ein stilles Kürzen wäre ein
 *    anderer Vektor. Deshalb wird beim Bau geprüft, nicht beim ersten Treffer.
 *
 * ## Was geprüft ist und was nicht
 *
 * | Einbetter | Stand |
 * |---|---|
 * | `ollama` | **gegen echtes Ollama gemessen** (27.10.2026) |
 * | `openai` | Form gebaut, **nicht** gegen den Dienst gemessen — kein Schlüssel |
 * | `google` | Form gebaut, **nicht** gegen den Dienst gemessen — kein Schlüssel |
 *
 * Ein ungeprüfter Adapter ist besser als keiner, solange er es sagt: `geprueft`
 * steht in jedem Einbetter und geht in die Antwort des Werkzeugs.
 *
 * @module @prometheus-harness/world-knowledge/einbetter
 */

/** Die Dimension, die der Speicher verlangt (`chunks.embedding vector(768)`). */
export const SPEICHER_DIM = 768

/** Ein Fehler, den der Aufrufer sehen soll — kein Absturz, eine Auskunft. */
export class EinbetterFehler extends Error {
  override readonly name = 'EinbetterFehler'
}

/** Ein Einbetter: Texte rein, Vektoren raus — mit Preis und Dimension. */
export interface Einbetter {
  /** Kurzname für Auswahl und Anzeige (`ollama`, `openai`, `google`). */
  readonly art: string
  /** Das Modell, wie der Dienst es nennt — gehört in `chunks.embedding_model`. */
  readonly modell: string
  /** Die Dimension, die dieses Modell liefert. Muß {@link SPEICHER_DIM} sein. */
  readonly dim: number
  /** USD je 1 Mio Eingabe-Token. **0 heißt kostenlos und ohne Rückfrage.** */
  readonly kostenProMio: number
  /** Ob dieser Weg gegen den echten Dienst gemessen wurde. */
  readonly geprueft: boolean
  /** Rechnet Texte in Vektoren um, in derselben Reihenfolge. */
  einbetten(texte: readonly string[]): Promise<readonly (readonly number[])[]>
}

/** Ob dieser Einbetter Geld kostet — die Frage, die vor dem Aufruf steht. */
export function kostet(better: Einbetter): boolean {
  return better.kostenProMio > 0
}

/** Prüft, daß jeder Vektor die erwartete Länge hat — sonst hat der Dienst gelogen. */
function pruefeVektoren(art: string, vektoren: readonly (readonly number[])[], erwartet: number): void {
  for (const [i, v] of vektoren.entries()) {
    if (v.length !== erwartet) {
      throw new EinbetterFehler(
        `der Einbetter „${art}" lieferte für Text ${String(i)} einen Vektor mit ` +
          `${String(v.length)} statt ${String(erwartet)} Werten.`,
      )
    }
  }
}

/** Was der Ollama-Einbetter braucht. */
export interface OllamaOptionen {
  /** Vorgabe: `http://127.0.0.1:11434`. */
  readonly basisUrl?: string | undefined
  /** Vorgabe: `nomic-embed-text` (768 Dimensionen). */
  readonly modell?: string | undefined
  /** Für Prüfungen austauschbar. */
  readonly abrufen?: typeof fetch
}

/**
 * Der lokale Einbetter über Ollama.
 *
 * **Kostenlos und ohne Schlüssel** — der einzige Weg, der ohne Beschaffung
 * funktioniert. Deshalb ist er der Vorgabeweg.
 *
 * @param optionen - Adresse, Modell, Abrufer
 * @returns der Einbetter
 */
export function ollamaEinbetter(optionen: OllamaOptionen = {}): Einbetter {
  const basis = (optionen.basisUrl ?? 'http://127.0.0.1:11434').replace(/\/+$/u, '')
  const modell = optionen.modell ?? 'nomic-embed-text'
  const abrufen = optionen.abrufen ?? fetch

  return {
    art: 'ollama',
    modell,
    dim: SPEICHER_DIM,
    kostenProMio: 0,
    geprueft: true,
    async einbetten(texte) {
      if (texte.length === 0) return []
      const antwort = await abrufen(`${basis}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: modell, input: [...texte] }),
      })
      if (!antwort.ok) {
        throw new EinbetterFehler(
          `Ollama antwortete ${String(antwort.status)}. Läuft der Dienst, und ist „${modell}" ` +
            `gezogen? (ollama pull ${modell})`,
        )
      }
      const koerper = (await antwort.json()) as { embeddings?: readonly (readonly number[])[] }
      const vektoren = koerper.embeddings ?? []
      if (vektoren.length !== texte.length) {
        throw new EinbetterFehler(
          `Ollama lieferte ${String(vektoren.length)} Vektoren für ${String(texte.length)} Texte.`,
        )
      }
      pruefeVektoren('ollama', vektoren, SPEICHER_DIM)
      return vektoren
    },
  }
}

/** Was der OpenAI-Einbetter braucht. */
export interface OpenAiOptionen {
  readonly apiKey: string
  /** Vorgabe: `text-embedding-3-small` — kann auf 768 gekürzt werden. */
  readonly modell?: string | undefined
  readonly abrufen?: typeof fetch
}

/**
 * Der Einbetter über OpenAI.
 *
 * **Nicht gegen den Dienst gemessen** — es lag kein Schlüssel vor. Die Form folgt
 * der dokumentierten Schnittstelle; `dimensions: 768` ist die ausdrückliche Kürzung,
 * die OpenAI dafür anbietet (kein `slice` hier).
 *
 * @param optionen - Schlüssel, Modell, Abrufer
 * @returns der Einbetter
 */
export function openaiEinbetter(optionen: OpenAiOptionen): Einbetter {
  const modell = optionen.modell ?? 'text-embedding-3-small'
  const abrufen = optionen.abrufen ?? fetch
  if (optionen.apiKey.length === 0) throw new EinbetterFehler('OpenAI braucht einen Schlüssel.')

  return {
    art: 'openai',
    modell,
    dim: SPEICHER_DIM,
    // Bekannter Preis, **nicht hier gemessen**: 0,02 USD je 1 Mio Token für 3-small.
    kostenProMio: 0.02,
    geprueft: false,
    async einbetten(texte) {
      if (texte.length === 0) return []
      const antwort = await abrufen('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { authorization: `Bearer ${optionen.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: modell, input: [...texte], dimensions: SPEICHER_DIM }),
      })
      if (!antwort.ok) {
        throw new EinbetterFehler(`OpenAI antwortete ${String(antwort.status)}.`)
      }
      const koerper = (await antwort.json()) as {
        data?: readonly { embedding: readonly number[]; index: number }[]
      }
      const daten = koerper.data ?? []
      // **Nach `index` ordnen, nicht nach Reihenfolge** — dieselbe Regel wie in
      // `packages/ai/openrouter/src/index.ts`. Der Dienst darf umsortieren.
      const sortiert = [...daten].sort((a, b) => a.index - b.index)
      const vektoren = sortiert.map((d) => d.embedding)
      pruefeVektoren('openai', vektoren, SPEICHER_DIM)
      return vektoren
    },
  }
}

/** Was der Google-Einbetter braucht. */
export interface GoogleOptionen {
  readonly apiKey: string
  /** Vorgabe: `text-embedding-004` (768 Dimensionen). */
  readonly modell?: string | undefined
  readonly abrufen?: typeof fetch
}

/**
 * Der Einbetter über Google.
 *
 * **Nicht gegen den Dienst gemessen** — es lag kein Schlüssel vor.
 *
 * @param optionen - Schlüssel, Modell, Abrufer
 * @returns der Einbetter
 */
export function googleEinbetter(optionen: GoogleOptionen): Einbetter {
  const modell = optionen.modell ?? 'text-embedding-004'
  const abrufen = optionen.abrufen ?? fetch
  if (optionen.apiKey.length === 0) throw new EinbetterFehler('Google braucht einen Schlüssel.')

  return {
    art: 'google',
    modell,
    dim: SPEICHER_DIM,
    // Bekannter Preis, **nicht hier gemessen**: 0,20 USD je 1 Mio Token für `gemini-embedding-2`.
    kostenProMio: 0.2,
    geprueft: false,
    async einbetten(texte) {
      if (texte.length === 0) return []
      // Ein Aufruf je Text: `batchEmbedContents` deckelt bei 100 und die Antwortform
      // weicht ab. Für Stücke einer Notiz ist der Einzelweg ausreichend und einfacher.
      const vektoren: (readonly number[])[] = []
      for (const text of texte) {
        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${modell}:embedContent` +
          `?key=${encodeURIComponent(optionen.apiKey)}`
        const antwort = await abrufen(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: `models/${modell}`,
            content: { parts: [{ text }] },
            outputDimensionality: SPEICHER_DIM,
          }),
        })
        if (!antwort.ok) {
          throw new EinbetterFehler(`Google antwortete ${String(antwort.status)}.`)
        }
        const koerper = (await antwort.json()) as { embedding?: { values?: readonly number[] } }
        vektoren.push(koerper.embedding?.values ?? [])
      }
      pruefeVektoren('google', vektoren, SPEICHER_DIM)
      return vektoren
    },
  }
}

/**
 * Wählt einen Einbetter aus einer Angabe — oder sagt, warum nicht.
 *
 * **Der Vorgabeweg ist der kostenlose.** Wer `PMH_EINBETTER` nicht setzt, bekommt
 * Ollama; wer einen bezahlten Weg will, muß ihn benennen **und** einen Schlüssel
 * mitbringen. Damit kostet nichts versehentlich Geld.
 *
 * @param env - die Umgebung (für Prüfungen austauschbar)
 * @returns der gewählte Einbetter
 * @throws {EinbetterFehler} wenn ein bezahlter Weg ohne Schlüssel verlangt wird
 */
export function waehleEinbetter(env: Readonly<Record<string, string | undefined>> = process.env): Einbetter {
  const art = (env['PMH_EINBETTER'] ?? 'ollama').trim().toLowerCase()
  if (art === '' || art === 'ollama') {
    return ollamaEinbetter({
      basisUrl: env['PMH_OLLAMA_URL'],
      modell: env['PMH_OLLAMA_MODELL'],
    })
  }
  if (art === 'openai') {
    return openaiEinbetter({
      apiKey: env['OPENAI_API_KEY'] ?? '',
      modell: env['PMH_EINBETTER_MODELL'],
    })
  }
  if (art === 'google') {
    return googleEinbetter({
      apiKey: env['GOOGLE_API_KEY'] ?? env['GEMINI_API_KEY'] ?? '',
      modell: env['PMH_EINBETTER_MODELL'],
    })
  }
  throw new EinbetterFehler(
    `unbekannter Einbetter „${art}". Bekannt: ollama (kostenlos), openai, google.`,
  )
}
