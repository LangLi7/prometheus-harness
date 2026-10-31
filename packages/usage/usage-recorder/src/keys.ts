/**
 * Welcher **Schlüsselname** gehört zu einer Route — und warum das eine Tabelle ist.
 *
 * ## Das Problem in einem Satz
 *
 * Ein Modellaufruf führt seinen Schlüssel **nicht** mit: der Adapter löst ihn erst beim Versand auf.
 * Der Verbrauch kennt also die Route (`deepseek-official`, `openrouter`) und das Modell — aber nicht
 * den Schlüssel. Für „wer hat das bezahlt" braucht es eine Zuordnung von der Route auf den **Namen**
 * der Credential-Ref. Der **Wert** wird nie gelesen und nie gespeichert.
 *
 * ## Woher die Namen kommen — gemessen, nicht erfunden
 *
 * | Route | Schlüsselname | Quelle |
 * |---|---|---|
 * | `deepseek-official` | `DEEPSEEK_API_KEY` | `node_modules/@deepseek-ai/dsh-llm-deepseek-api-key/lib/index.js:7-10` (Vorgabe `apiKeyEnv`) |
 * | `openrouter` | `OPENROUTER_API_KEY` | `packages/ai/openrouter/src/index.ts:122` (`UMWELT_SCHLUESSEL`) |
 * | übrige | `ZAI_API_KEY`, `ZENMUX_API_KEY`, `NOUS_API_KEY`, `OPENCODE_API_KEY`, … | Tabelle des Harness-Plugins `dsh-usage-budget`, `lib/usage.js:97-113` |
 *
 * ## Warum die Suche in Stufen läuft
 *
 * Ein exakter Treffer gewinnt. Danach wird **klein** verglichen (`DeepSeek-Official`), dann über den
 * **Präfix** (`deepseek-account` → `deepseek`). Findet sich nichts, ist die Route **selbst** der
 * Schlüsselname: eine erfundene Zuordnung wäre schlimmer als eine sichtbare Lücke — sie verbuchte
 * fremde Kosten auf einen Schlüssel, den es nicht gibt.
 *
 * @module @prometheus-harness/usage-recorder/keys
 */

/**
 * Die Zuordnung Route → Schlüsselname, wie sie gemessen ist.
 *
 * **Die Reihenfolge hat keine Bedeutung**; gesucht wird in Stufen (exakt, klein, Präfix). Die
 * Tabelle wächst nur mit einer Quelle: ein Name ohne Beleg wäre eine Behauptung über fremde Kosten.
 */
export const SCHLUESSEL_JE_ROUTE: Readonly<Record<string, string>> = {
  'deepseek-official': 'DEEPSEEK_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  'deepseek-account': 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  zai: 'ZAI_API_KEY',
  'zai-coding-plan': 'ZAI_API_KEY',
  zenmux: 'ZENMUX_API_KEY',
  groq: 'GROQ_API_KEY',
  nous: 'NOUS_API_KEY',
  'nous-portal': 'NOUS_API_KEY',
  ollama: 'OLLAMA_CLOUD_API_KEY',
  'ollama-cloud': 'OLLAMA_CLOUD_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  'opencode-go': 'OPENCODE_GO_API_KEY',
  crew: 'DEEPSEEK_API_KEY',
}

/**
 * Bestimmt den Schlüsselnamen zu einer Route.
 *
 * @param route - die Provider-Route (`deepseek-official`)
 * @returns der Name der Credential-Ref; ohne Treffer die Route selbst
 */
export function schluesselFuerRoute(route: string): string {
  const sauber = route.trim()
  if (sauber === '') return 'UNBEKANNT'
  const exakt = SCHLUESSEL_JE_ROUTE[sauber]
  if (exakt !== undefined) return exakt
  const klein = sauber.toLowerCase()
  const direkt = SCHLUESSEL_JE_ROUTE[klein]
  if (direkt !== undefined) return direkt
  for (const [eintrag, name] of Object.entries(SCHLUESSEL_JE_ROUTE)) {
    if (klein.startsWith(`${eintrag}-`) || klein.startsWith(`${eintrag}_`)) return name
  }
  // Kein erfundener Name: die Route ist die ehrlichste Kennung, die es gibt.
  return sauber
}
