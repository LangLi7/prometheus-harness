/**
 * Der lebende Modellkatalog — **welche Modelle eine Route führt**, statt welche im Paket stehen.
 *
 * ## Warum es dieses Modul gibt
 *
 * Der Betreiber am 26.10.2026, mit einem Bildschirmfoto der Modellsuche: *„wo ist
 * `recursive/flint-v1.0:free`?"* — das Modell stand bei OpenRouter, aber nicht in der Suche des
 * Composers. Die Ursache war nicht die Suche, sondern eine **Härtung**: `llm-pi-ai` liest seinen
 * Katalog aus dem npm-Paket (`@earendil-works/pi-ai`, `models.generated.js`). Was nach dessen
 * Veröffentlichungslauf erschien, fehlt dort. Bei Flint waren es fünf Tage, und es wären bei jedem
 * neuen Modell wieder Tage.
 *
 * ## Warum das ein Zwischenspeicher ist und keine zweite Liste
 *
 * Der **Anbieter** ist die Wahrheit: `GET /models` nennt, was er führt. Diese Antwort ist für
 * Minuten gültig und danach wertlos — deshalb wird sie geholt, kurz gehalten und danach erneuert.
 * Eine eingecheckte Liste wäre am Tag nach dem Einchecken falsch, und sie wäre wieder eine
 * Härtung, nur an anderer Stelle.
 *
 * ## Was hier NICHT passiert
 *
 * Kein Netzzugriff beim Import und kein Schreiben. Dieses Modul rechnet nur: aus einer
 * Katalogantwort werden Modelle, aus Modellen wird das Profil, das `llm-pi-ai` erwartet. Ob und
 * wohin geschrieben wird, entscheidet `server.ts` — diese Trennung ist der Grund, warum die
 * Regeln hier ohne Host prüfbar sind.
 *
 * @module @prometheus-harness/model-catalog/catalog
 */

import { familieMit, type Familie } from '@prometheus-harness/provider-directory'

/**
 * Wie lange ein geholter Katalog gilt.
 *
 * **Warum zehn Minuten.** Der Takt läuft im Hintergrund, nicht im Klickpfad. Zehn Minuten sind kurz
 * genug, daß ein am selben Tag erschienenes Modell auftaucht, und lang genug, daß niemand den
 * Anbieter mit Abrufen belastet. Derselbe Wert wie im Bildmodell-Katalog des Usage-Plugins
 * (`packages/plugin/usage/src/katalog.ts`) — eine Zahl, die an zwei Stellen steht, muß begründet
 * sein, nicht zufällig gleich.
 */
export const DEFAULT_TTL_MINUTES = 10

/** Das Protokoll, das `llm-pi-ai` für eine Route sprechen soll. */
export type Protocol = 'openai-completions' | 'anthropic-messages'

/**
 * Eine Regel je Anbieter: Credential-Referenz, Protokoll und — wo nötig — die Basisadresse.
 *
 * **Warum die Basisadresse hier steht und nicht nur im Verzeichnis.** Das Verzeichnis
 * (`@prometheus-harness/provider-directory`) nennt die Basis **je Familie** so, wie die Sonde sie
 * gemessen hat. Für Anthropic ist das `https://api.anthropic.com/v1` — das SDK von
 * `anthropic-messages` hängt aber selbst `/v1/messages` an, sodass die mitgeschriebene Basis
 * `…/v1/v1/messages` ergäbe. Die Ausnahme steht deshalb als Feld hier, mit Grund, statt als
 * Sonderfall im Code zu verschwinden.
 */
export interface ProviderRule {
  /** Die Anbieterkennung — zugleich der Schlüssel unter `providers` in `llm-pi-ai`. */
  readonly provider: string
  /** Die Credential-Referenz, unter der der Schlüssel liegt (`OPENROUTER_API_KEY`). */
  readonly credentialRef: string
  /** Das Protokoll, das die Route sprechen soll. */
  readonly protocol: Protocol
  /** Überschreibt die Basis des Verzeichnisses — nur, wenn es einen Grund gibt. */
  readonly baseUrl?: string
  /** Warum diese Zeile so aussieht, wie sie aussieht. */
  readonly note?: string
}

/**
 * Die bekannten Routing-Anbieter.
 *
 * **DeepSeek steht dabei, aber nicht in der Vorgabe.** Der Kern bedient `deepseek-official` bereits
 * über `llm-deepseek`; eine zweite Route desselben Namens erzeugte eine zweite Gruppe mit
 * denselben Modellen in der Auswahl. Wer sie will, trägt sie ein — die Vorgabe tut es nicht.
 */
export const PROVIDERS: readonly ProviderRule[] = [
  {
    provider: 'openrouter',
    credentialRef: 'OPENROUTER_API_KEY',
    protocol: 'openai-completions',
  },
  {
    provider: 'zenmux',
    credentialRef: 'ZENMUX_API_KEY',
    protocol: 'openai-completions',
    note:
      'ZenMux ist im Katalog von pi-ai nicht beschrieben — Protokoll und Basis kommen deshalb aus ' +
      'dem Verzeichnis. Die Sonde hat dort nur `GET /models` als prüfbar gemeldet (jeder POST gibt ' +
      '403); ob der Chat-Weg trägt, ist mit diesem Schlüssel nicht gemessen.',
  },
  {
    provider: 'nous',
    credentialRef: 'NOUS_API_KEY',
    protocol: 'openai-completions',
  },
  {
    provider: 'opencode',
    credentialRef: 'OPENCODE_API_KEY',
    protocol: 'openai-completions',
  },
  {
    provider: 'zai',
    credentialRef: 'ZAI_API_KEY',
    protocol: 'openai-completions',
  },
  {
    provider: 'anthropic',
    credentialRef: 'ANTHROPIC_API_KEY',
    protocol: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com',
    note:
      'Die Basis steht ohne `/v1`: das Protokoll `anthropic-messages` hängt `/v1/messages` selbst ' +
      'an. Mit der Basis aus dem Verzeichnis käme `…/v1/v1/messages` heraus.',
  },
  {
    provider: 'deepseek',
    credentialRef: 'DEEPSEEK_API_KEY',
    protocol: 'openai-completions',
    note:
      'In der Vorgabe nicht enthalten: `deepseek-official` wird bereits von `llm-deepseek` ' +
      'bedient. Eine zweite Route zeigte dieselben Modelle ein zweites Mal.',
  },
]

/** Die Vorgabe: alle Regeln, die keine zweite Gruppe erzeugen. */
export const DEFAULT_PROVIDERS: readonly string[] = PROVIDERS.filter(
  (rule) => rule.provider !== 'deepseek',
).map((rule) => rule.provider)

/**
 * Sucht die Regel zu einer Anbieterkennung.
 *
 * @param provider - die Kennung (`openrouter`)
 * @returns die Regel oder `undefined`
 */
export function providerRule(provider: string): ProviderRule | undefined {
  return PROVIDERS.find((rule) => rule.provider === provider)
}

/** Ein Modell, wie es der Anbieter nennt — die Felder, die `llm-pi-ai` versteht. */
export interface CatalogModel {
  /** Die Kennung, wie der Anbieter sie im Auftrag erwartet. */
  readonly id: string
  /** Der Anzeigename — **nicht** die Kennung: die Suche der Auswahl trifft Namen. */
  readonly name: string
  /** Das Kontextfenster in Token, wenn der Katalog eines nennt. */
  readonly contextWindow?: number
  /** Die größte Ausgabe in Token, wenn der Katalog eine nennt. */
  readonly maxTokens?: number
  /** Die Eingabearten — nur `text` und `image`, weil `llm-pi-ai` nur diese kennt. */
  readonly input?: readonly string[]
}

/** Ein Modell, das die Route **schon** führt — die Sicht des Adapters, ohne Kapazitäten. */
export interface ManagedModel {
  /** Die Kennung. */
  readonly id: string
  /** Der Anzeigename des Adapters. */
  readonly name: string
  /** Die Eingabearten des Adapters, wenn er welche nennt. */
  readonly inputModalities?: readonly string[]
}

/** Was `llm-pi-ai` je Modell kennt. */
const MODALITIES: readonly string[] = ['text', 'image']

/**
 * Die Ausgabegrenze, die der Adapter ohne Angabe ohnehin annimmt (`DEFAULT_MAX_TOKENS` in
 * `@deepseek-ai/dsh-llm-pi-ai`).
 *
 * **Warum das eine Obergrenze für unser Schreiben ist.** Der Katalog nennt die *maximale* Ausgabe
 * eines Modells — Flint etwa 235 929 Token bei 262 144 Kontext. Diese Zahl ins Profil zu schreiben
 * wäre ein Eigentor: `max_tokens` und der Prompt teilen sich dasselbe Fenster. Mit 235 929 blieben
 * 26 215 Token für den Auftrag; allein der Systemprompt dieses Harness samt Werkzeugen ist größer.
 * Der Anbieter antwortet dann mit einem Fehler, den niemand als Kapazitätsproblem erkennt.
 *
 * Deshalb wird eine Ausgabe nur geschrieben, wenn sie **kleiner** ist als das, was der Adapter ohne
 * Angabe täte. Kleiner heißt: das Modell kann wirklich nicht mehr. Größer heißt nur: wir nehmen dem
 * Prompt Platz weg.
 */
export const ADAPTER_DEFAULT_MAX_TOKENS = 32_768

/**
 * Liest eine positive ganze Zahl oder gibt `undefined` zurück.
 *
 * @param value - der Rohwert
 * @returns die Zahl oder `undefined`
 */
function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return undefined
  return value
}

/**
 * Liest die Liste aus einer Katalogantwort.
 *
 * **Zwei Formen, ein Leser.** OpenRouter und die OpenAI-kompatible Familie antworten mit
 * `{ data: […] }`; eine nackte Liste ist derselbe Inhalt ohne Hülle. Beides wird gelesen, weil
 * beide vorkommen.
 *
 * @param raw - die gelesene Antwort
 * @returns die Listenzeilen, oder eine leere Liste
 */
function rowsOf(raw: unknown): readonly unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'object' || raw === null) return []
  const data = (raw as { data?: unknown }).data
  return Array.isArray(data) ? data : []
}

/**
 * Liest die Eingabearten eines Katalogeintrags.
 *
 * @param architecture - das Feld `architecture` des Eintrags
 * @returns die Arten, die `llm-pi-ai` kennt — oder `undefined`
 */
function inputModalitiesOf(architecture: unknown): readonly string[] | undefined {
  if (typeof architecture !== 'object' || architecture === null) return undefined
  const raw = (architecture as { input_modalities?: unknown }).input_modalities
  if (!Array.isArray(raw)) return undefined
  const kept = MODALITIES.filter((modality) => raw.includes(modality))
  return kept.length === 0 ? undefined : kept
}

/**
 * Prüft, ob ein Eintrag Text ausgeben kann.
 *
 * **Warum das gefiltert wird.** Der Katalog nennt auch Modelle, die **nur** Bilder oder Ton
 * ausgeben. In der Modellauswahl des Chats wären sie Angebote, die beim ersten Auftrag scheitern.
 * Fehlt die Angabe ganz (die OpenAI-Form nennt sie nicht), bleibt der Eintrag stehen — Unwissen ist
 * kein Ausschluß.
 *
 * @param architecture - das Feld `architecture` des Eintrags
 * @returns `true`, wenn Text als Ausgabe genannt ist oder nichts genannt ist
 */
function outputsText(architecture: unknown): boolean {
  if (typeof architecture !== 'object' || architecture === null) return true
  const raw = (architecture as { output_modalities?: unknown }).output_modalities
  if (!Array.isArray(raw)) return true
  return raw.includes('text')
}

/**
 * Liest die Modelle aus einer Katalogantwort.
 *
 * **Was hier aussortiert wird, und warum:**
 *
 * | Fall | Grund |
 * |---|---|
 * | leere oder fehlende Kennung | ohne Kennung läßt sich nichts aufrufen |
 * | `openrouter/…` | das sind **Weiterleitungen** (`auto`), keine Modelle |
 * | nur Bild- oder Tonausgabe | die Chat-Auswahl böte sie an, der Auftrag scheiterte |
 * | Doppelte | zwei Zeilen mit derselben Kennung wären zwei Einträge, von denen einer nie greift |
 *
 * Der **Name** fällt auf die Kennung zurück, wenn der Katalog keinen nennt: `llm-pi-ai` weist ein
 * Modell ohne Namen als `INVALID_CATALOG` ab, und die Suche der Auswahl braucht ihn.
 *
 * @param raw - die gelesene Antwort
 * @returns die Modelle in Katalogreihenfolge
 */
export function readModels(raw: unknown): CatalogModel[] {
  const seen = new Set<string>()
  const models: CatalogModel[] = []
  for (const row of rowsOf(raw)) {
    if (typeof row !== 'object' || row === null) continue
    const fields = row as Record<string, unknown>
    const id = typeof fields['id'] === 'string' ? fields['id'].trim() : ''
    if (id === '' || id.startsWith('openrouter/')) continue
    if (seen.has(id)) continue
    const architecture = fields['architecture']
    if (!outputsText(architecture)) continue

    const rawName = typeof fields['name'] === 'string' ? fields['name'].trim() : ''
    const name = rawName === '' ? id : rawName
    const contextWindow = positiveInteger(fields['context_length'])
    const topProvider = fields['top_provider']
    const capped =
      typeof topProvider === 'object' && topProvider !== null
        ? positiveInteger((topProvider as { max_completion_tokens?: unknown }).max_completion_tokens)
        : undefined
    const declared = positiveInteger(fields['max_completion_tokens']) ?? capped
    // **Nie mehr Ausgabe als Kontext.** Der Katalog nennt beides unabhängig; eine Ausgabe über dem
    // Fenster wäre eine Zusage, die der Anbieter nicht halten kann.
    const available =
      declared === undefined
        ? undefined
        : contextWindow === undefined
          ? declared
          : Math.min(declared, contextWindow)
    // **Und nie mehr als der Adapter ohnehin annähme.** Eine große Ausgabegrenze ist keine
    // Information, sondern ein Abzug vom Prompt-Budget — siehe {@link ADAPTER_DEFAULT_MAX_TOKENS}.
    const maxTokens =
      available === undefined || available >= ADAPTER_DEFAULT_MAX_TOKENS ? undefined : available
    const input = inputModalitiesOf(architecture)

    seen.add(id)
    models.push({
      id,
      name,
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
      ...(input === undefined ? {} : { input }),
    })
  }
  return models
}

/**
 * Legt den geführten Katalog und den geholten zusammen.
 *
 * **Die Regel: der Adapter behält den Namen, der Anbieter liefert die Kapazitäten.** Der Adapter
 * kennt die Route (er bedient sie), der Anbieter kennt die Zahlen. Wo beide dasselbe Modell
 * nennen, gewinnt also der Name des Adapters und die Zahl des Anbieters — und wo nur der Anbieter
 * das Modell kennt, ist es **neu** und wird angehängt.
 *
 * **Warum die Reihenfolge zählt.** Die Auswahl zeigt die Modelle in Katalogreihenfolge; die
 * geführten zuerst zu nennen hält die gewohnte Ordnung, und die neuen stehen dahinter, statt sie
 * umzusortieren.
 *
 * @param managed - was die Route heute führt
 * @param live - was der Anbieter heute nennt
 * @returns die Vereinigungsmenge, geführte zuerst
 */
export function mergeModels(
  managed: readonly ManagedModel[],
  live: readonly CatalogModel[],
): CatalogModel[] {
  const byId = new Map(live.map((model) => [model.id, model]))
  const merged: CatalogModel[] = []
  const seen = new Set<string>()

  for (const entry of managed) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    const fresh = byId.get(entry.id)
    const fromAdapter = entry.inputModalities?.filter((modality) => MODALITIES.includes(modality))
    const input = fromAdapter !== undefined && fromAdapter.length > 0 ? fromAdapter : fresh?.input
    merged.push({
      id: entry.id,
      name: entry.name,
      ...(fresh?.contextWindow === undefined ? {} : { contextWindow: fresh.contextWindow }),
      ...(fresh?.maxTokens === undefined ? {} : { maxTokens: fresh.maxTokens }),
      ...(input === undefined || input.length === 0 ? {} : { input }),
    })
  }

  for (const fresh of live) {
    if (seen.has(fresh.id)) continue
    seen.add(fresh.id)
    merged.push(fresh)
  }
  return merged
}

/**
 * Baut die Felder, die `llm-pi-ai` für eine Route braucht.
 *
 * **Warum hier `api` und `baseURL` immer stehen.** `llm-pi-ai` kann beides aus seinem Paketkatalog
 * nehmen — aber nur für Anbieter, die dort beschrieben sind. ZenMux und Nous sind es nicht; ohne
 * die beiden Felder würde deren Route beim Laden abgewiesen („needs a baseURL"). Eine Regel für
 * alle ist ehrlicher als eine Verzweigung, die beim nächsten unbekannten Anbieter wieder falsch
 * ist.
 *
 * @param rule - die Anbieterregel
 * @param family - die Familie aus dem Verzeichnis
 * @param models - die Modelle, die die Route führen soll
 * @returns das Profil, gemerged in die Einstellungen
 */
export function profileFor(
  rule: ProviderRule,
  family: Familie,
  models: readonly CatalogModel[],
): Record<string, unknown> {
  return {
    apiKeyEnv: rule.credentialRef,
    api: rule.protocol,
    baseURL: rule.baseUrl ?? family.basis,
    models,
  }
}

/**
 * Baut die Adresse, unter der ein Anbieter seine Modelle nennt.
 *
 * @param family - die Familie aus dem Verzeichnis
 * @returns die vollständige Adresse
 */
export function modelsUrl(family: Familie): string {
  const base = family.basis.endsWith('/') ? family.basis.slice(0, -1) : family.basis
  const path = family.modellWeg.startsWith('/') ? family.modellWeg : `/${family.modellWeg}`
  return `${base}${path}`
}

/**
 * Sucht die Familie zu einer Anbieterkennung.
 *
 * @param provider - die Kennung (`openrouter`)
 * @returns die Familie oder `undefined`
 */
export function familyFor(provider: string): Familie | undefined {
  return familieMit(provider)
}
