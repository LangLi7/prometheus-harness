/**
 * Das Modellkatalog-Plugin — **der Katalog des Anbieters statt der Katalog im Paket**.
 *
 * ## Warum es dieses Plugin gibt
 *
 * `llm-pi-ai` führt je Route genau die Modelle, die in `providers.<id>.models` stehen — und wenn
 * dort nichts steht, die Modelle aus seinem npm-Paket. Das Paket ist eine Momentaufnahme: am
 * 26.10.2026 fehlte darin `recursive/flint-v1.0:free`, obwohl OpenRouter es seit dem 21.10. führt.
 * In der Modellauswahl war das Modell damit nicht nur nicht auffindbar, es war **nicht wählbar**:
 * die Liste zeigte nur, was die Route anbietet.
 *
 * Dieses Plugin hält den Katalog der Anbieter **lebend**: es holt `GET /models` je Anbieter, hält
 * die Antwort eine Weile und schreibt die Vereinigungsmenge in die Route. Was der Adapter schon
 * führt, behält seinen Namen; was der Anbieter zusätzlich nennt, kommt dazu.
 *
 * ## Warum geschrieben und nicht nur gelesen wird
 *
 * Der Kompromiß ist bewußt und hat einen Preis: die Liste steht danach **in den Einstellungen**
 * (`llm-pi-ai.providers.<id>.models`) und ersetzt dort den Paketkatalog. Das ist keine zweite
 * Wahrheit, sondern die Form, die der Adapter versteht — und sie wird bei jedem Lauf aus dem
 * Anbieter neu gebildet. Wer die Zeile löscht, bekommt den Paketkatalog zurück.
 *
 * ## Warum die Routen gesperrt sind
 *
 * Die Statusroute nennt, welche Schlüssel hinterlegt sind; die Aktualisierungsroute **schreibt
 * Einstellungen**. Beides gehört nicht in ein offenes Netz. Die Entscheidung, ob eine Anfrage
 * angemeldet ist, trifft der Verbindungsdienst des Hosts — hier wird sie über `abweisung`
 * **gefragt**, nicht getroffen (dieselbe Naht wie im Usage-Plugin).
 *
 * ## Was dieses Plugin nicht tut
 *
 * Es schreibt **keine** Modelle in eine Route, die es nicht kennt, und es erfindet keine
 * Kapazitäten: was der Katalog nicht nennt, bleibt offen und fällt auf die Vorgabe des Adapters
 * zurück.
 *
 * @module @prometheus-harness/model-catalog/server
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import { abweisung } from '@prometheus-harness/ai-capabilities'

import {
  DEFAULT_PROVIDERS,
  DEFAULT_TTL_MINUTES,
  PROVIDERS,
  familyFor,
  mergeModels,
  modelsUrl,
  profileFor,
  providerRule,
  readModels,
  type CatalogModel,
  type ManagedModel,
  type ProviderRule,
} from './catalog.ts'

/**
 * Der stabile Plugin-Name.
 *
 * **Warum der Name am Paket hängt.** Cordis führt Einträge über den **exportierten** Namen; er ist
 * zugleich der Eintrag in der Patch-Schicht des Profils. Beides auseinanderzuhalten wäre ein zweiter
 * Name für dieselbe Sache.
 */
export const name = 'pmh-model-catalog'

/** Ohne Webserver keine Routen, ohne Einstellungen kein Ziel, ohne `llm` keine geführte Liste. */
export const inject = ['webServer', 'settings', 'llm']

/** Die Einstellungssektion, in die geschrieben wird — die des pi-ai-Adapters. */
export const SETTINGS_NAMESPACE = 'llm-pi-ai'

/** Der Weg, der den Stand nennt. */
export const STATUS_PATH = '/api/pmh/model-catalog/status'

/** Der Weg, der einen Lauf erzwingt. */
export const REFRESH_PATH = '/api/pmh/model-catalog/refresh'

/**
 * Die Einstellungen des Plugins.
 *
 * **Warum `create` ein Feld ist.** Eine Route anzulegen, für die kein Schlüssel hinterlegt ist,
 * erzeugt in der Auswahl eine Gruppe, die beim ersten Auftrag scheitert. Die Vorgabe legt deshalb
 * nur an, was auch benutzbar ist; wer die Gruppen trotzdem sehen will, sagt es.
 */
export const Config = z.object({
  providers: z.array(z.string()).default([...DEFAULT_PROVIDERS]),
  ttlMinutes: z.natural().default(DEFAULT_TTL_MINUTES),
  create: z.string().default('key-only'),
  write: z.boolean().default(true),
})

/** Die gelesenen Einstellungen. */
export interface CatalogSettings {
  /** Die Anbieterkennungen, die gepflegt werden. */
  readonly providers?: readonly string[]
  /** Wie lange ein geholter Katalog gilt. */
  readonly ttlMinutes?: number
  /** `never`, `key-only` oder `always`. */
  readonly create?: string
  /** Ob die Liste geschrieben wird. */
  readonly write?: boolean
}

/** Was ein Lauf über einen Anbieter weiß. */
export interface ProviderState {
  /** Die Kennung (`openrouter`). */
  readonly provider: string
  /** Die Credential-Referenz, unter der der Schlüssel liegt. */
  readonly credentialRef: string
  /** Wie viele Modelle die Route danach führt. */
  readonly models: number
  /** Wie viele davon **neu** sind — also nur der Anbieter kennt. */
  readonly added: number
  /** Ob geschrieben wurde (`false` bei „unverändert" oder wenn nicht geschrieben wird). */
  readonly written: boolean
  /** Wann der Katalog geholt wurde (ISO 8601) — oder `null`. */
  readonly fetchedAt: string | null
  /** Warum dieser Anbieter nichts beigetragen hat — **nie** stillschweigend. */
  readonly error?: string
}

/** Der Stand eines Laufs. */
export interface CatalogReport {
  /** Wann der Lauf endete (ISO 8601). */
  readonly time: string
  /** Die Frist in Minuten, die für den nächsten Lauf gilt. */
  readonly ttlMinutes: number
  /** Je Anbieter ein Stand, in der Reihenfolge der Regeln. */
  readonly providers: readonly ProviderState[]
}

/**
 * Die Naht, über die dieses Plugin mit der Welt redet.
 *
 * **Warum sie als Objekt hereinkommt.** Ein Lauf braucht Netz, Schlüssel, den Adapter und die
 * Einstellungen. Alle vier im Test durch Attrappen zu ersetzen ist der einzige Weg, die Regeln
 * („kein Schlüssel, kein Abruf") ohne Host zu prüfen.
 */
export interface Deps {
  /** Die Uhr. */
  readonly now: () => Date
  /** Der Abruf. */
  readonly fetch: typeof fetch
  /** Liest einen Schlüssel anhand seiner Referenz. */
  readonly readKey: (ref: string) => Promise<string | undefined>
  /** Was die Route heute führt. */
  readonly managed: (provider: string) => Promise<readonly ManagedModel[]>
  /** Schreibt das Profil in die Einstellungen. */
  readonly writeProfile: (
    provider: string,
    profile: Record<string, unknown>,
  ) => Promise<'written' | 'unchanged'>
  /** Ein Protokolleintrag. */
  readonly log: (text: string) => void
}

/**
 * Liest die Regeln zu den eingestellten Kennungen.
 *
 * **Unbekannte Kennungen fallen heraus, und das steht im Protokoll.** Ein Tippfehler in der
 * Anbieterliste führte sonst zu einem stillen Nichts.
 *
 * @param configured - die Kennungen aus den Einstellungen
 * @param log - der Protokollschreiber
 * @returns die Regeln in der Reihenfolge der Eingabe
 */
export function rulesFor(configured: readonly string[], log: (text: string) => void): ProviderRule[] {
  const rules: ProviderRule[] = []
  for (const provider of configured) {
    const rule = providerRule(provider.trim())
    if (rule === undefined) {
      log(
        `unknown provider "${provider}" skipped (known: ${PROVIDERS.map((entry) => entry.provider).join(', ')})`,
      )
      continue
    }
    rules.push(rule)
  }
  return rules
}

/**
 * Ein Lauf über alle eingestellten Anbieter.
 *
 * **Kein Wurf nach außen.** Ein Anbieter, der nicht antwortet, ist ein Befund je Anbieter und kein
 * Grund, die anderen zu überspringen — sonst kostete ein toter Nebenschauplatz den ganzen Katalog.
 *
 * @param rules - die zu pflegenden Anbieter
 * @param deps - Netz, Schlüssel, Adapter, Einstellungen
 * @param options - `write`, `create` und `ttlMinutes`
 * @returns der Bericht
 */
export async function runCatalog(
  rules: readonly ProviderRule[],
  deps: Deps,
  options: { readonly write: boolean; readonly create: string; readonly ttlMinutes: number },
): Promise<CatalogReport> {
  const states: ProviderState[] = []

  for (const rule of rules) {
    const family = familyFor(rule.provider)
    if (family === undefined) {
      states.push({
        provider: rule.provider,
        credentialRef: rule.credentialRef,
        models: 0,
        added: 0,
        written: false,
        fetchedAt: null,
        error: 'provider missing from the provider directory',
      })
      continue
    }

    const key = await deps.readKey(rule.credentialRef)
    if (key === undefined) {
      states.push({
        provider: rule.provider,
        credentialRef: rule.credentialRef,
        models: 0,
        added: 0,
        written: false,
        fetchedAt: null,
        error: `no credential configured (${rule.credentialRef})`,
      })
      continue
    }

    let live: CatalogModel[]
    let fetchedAt: string
    try {
      const response = await deps.fetch(modelsUrl(family), {
        headers: { accept: 'application/json', ...family.kopf(key) },
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
      live = readModels((await response.json()) as unknown)
      fetchedAt = deps.now().toISOString()
    } catch (problem) {
      const reason = problem instanceof Error ? problem.message : String(problem)
      states.push({
        provider: rule.provider,
        credentialRef: rule.credentialRef,
        models: 0,
        added: 0,
        written: false,
        fetchedAt: null,
        error: `catalog unreachable: ${reason}`,
      })
      continue
    }

    if (live.length === 0) {
      states.push({
        provider: rule.provider,
        credentialRef: rule.credentialRef,
        models: 0,
        added: 0,
        written: false,
        fetchedAt,
        error: 'catalog named no text-capable model',
      })
      continue
    }

    let managed: readonly ManagedModel[] = []
    try {
      managed = await deps.managed(rule.provider)
    } catch (problem) {
      // Eine Route, die es noch nicht gibt, ist kein Fehler — sie wird gleich angelegt.
      deps.log(
        `"${rule.provider}" serves no models yet (${problem instanceof Error ? problem.message : String(problem)})`,
      )
    }

    if (managed.length === 0 && options.create === 'never') {
      states.push({
        provider: rule.provider,
        credentialRef: rule.credentialRef,
        models: 0,
        added: 0,
        written: false,
        fetchedAt,
        error: 'route not configured (create = never)',
      })
      continue
    }

    const models = mergeModels(managed, live)
    const known = new Set(managed.map((entry) => entry.id))
    const added = models.filter((model) => !known.has(model.id)).length

    if (!options.write) {
      states.push({
        provider: rule.provider,
        credentialRef: rule.credentialRef,
        models: models.length,
        added,
        written: false,
        fetchedAt,
        error: 'not written (write = false)',
      })
      continue
    }

    try {
      const result = await deps.writeProfile(rule.provider, profileFor(rule, family, models))
      states.push({
        provider: rule.provider,
        credentialRef: rule.credentialRef,
        models: models.length,
        added,
        written: result === 'written',
        fetchedAt,
      })
    } catch (problem) {
      states.push({
        provider: rule.provider,
        credentialRef: rule.credentialRef,
        models: models.length,
        added,
        written: false,
        fetchedAt,
        error: `not written: ${problem instanceof Error ? problem.message : String(problem)}`,
      })
    }
  }

  return { time: deps.now().toISOString(), ttlMinutes: options.ttlMinutes, providers: states }
}

/**
 * Liest die Modelle, die eine Route heute führt, aus einem Einstellungswert.
 *
 * **Warum aus den Einstellungen und nicht aus dem Adapter.** Der Vergleich „hat sich etwas
 * geändert" muß vor dem Schreiben stehen; der Adapter kennt den Stand von *vor* dem Schreiben.
 *
 * @param value - der Einstellungswert der Sektion
 * @param provider - die Anbieterkennung
 * @returns die Modelle oder `undefined`
 */
export function existingModels(value: unknown, provider: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  const providers = (value as { providers?: unknown }).providers
  if (typeof providers !== 'object' || providers === null) return undefined
  const profile = (providers as Record<string, unknown>)[provider]
  if (typeof profile !== 'object' || profile === null) return undefined
  return (profile as { models?: unknown }).models
}

/**
 * Vergleicht zwei Modellisten so, wie es für „unverändert" zählt.
 *
 * @param left - die geschriebene Liste
 * @param right - die neue Liste
 * @returns `true`, wenn sie gleich sind
 */
export function sameList(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Antwortet mit JSON.
 *
 * @param res - die Antwort
 * @param status - der Statuscode
 * @param body - der Körper
 */
function respond(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

/**
 * Weist eine Anfrage ab, die nicht angemeldet ist.
 *
 * @param ctx - der Plugin-Kontext
 * @param req - die Anfrage
 * @param res - die Antwort
 * @returns `true`, wenn schon geantwortet wurde
 */
function rejectUnauthorized(ctx: Context, req: IncomingMessage, res: ServerResponse): boolean {
  const status = abweisung(ctx, req.headers)
  if (status === undefined) return false
  respond(res, status, { error: status === 401 ? 'not signed in' : 'no connection service' })
  return true
}

/**
 * Liest einen Schlüssel über den Credential-Speicher, mit der Umgebung als Ausweichweg.
 *
 * **Warum der Ausweichweg bleiben darf.** Ein Kopfstart mit `OPENROUTER_API_KEY` in der Umgebung
 * ist die übliche Form für einen Host ohne Anmeldung; ihn zu ignorieren hieße, den Katalog dort
 * grundlos leer zu lassen.
 *
 * @param ctx - der Plugin-Kontext
 * @param ref - die Referenz (`OPENROUTER_API_KEY`)
 * @returns der Schlüssel oder `undefined`
 */
export async function keyFromContext(ctx: Context, ref: string): Promise<string | undefined> {
  const store = ctx.get('credentials') as
    | { resolve?: (name: string) => Promise<{ readonly value: string } | undefined> }
    | undefined
  if (store !== undefined && typeof store.resolve === 'function') {
    try {
      const read = await store.resolve(ref)
      if (read !== undefined && read.value.trim() !== '') return read.value
    } catch {
      // Ein unlesbarer Speicher ist ein Grund für den Ausweichweg, kein Grund aufzugeben.
    }
  }
  const fromEnvironment = process.env[ref]
  return fromEnvironment !== undefined && fromEnvironment.trim() !== '' ? fromEnvironment : undefined
}

/**
 * Hängt Routen, Takt und Schreibweg ein.
 *
 * @param ctx - der Plugin-Kontext
 * @param settings - die Einstellungen des Eintrags
 */
export function apply(ctx: Context, settings: CatalogSettings = {}): void {
  const ttlMinutes =
    typeof settings.ttlMinutes === 'number' && settings.ttlMinutes > 0
      ? settings.ttlMinutes
      : DEFAULT_TTL_MINUTES
  const createMode = typeof settings.create === 'string' ? settings.create : 'key-only'
  const write = settings.write !== false
  const configured =
    Array.isArray(settings.providers) && settings.providers.length > 0 ? settings.providers : DEFAULT_PROVIDERS

  /**
   * Die Dienste, die der Host zusammensetzt — an **einer** Stelle typisiert.
   *
   * **Warum ein Cast hier und nicht überall.** `Context` ist im Kern ein offenes Objekt; `settings`
   * und `llm` tragen erst die Pakete der Zusammensetzung ein. Ohne deren Typ-Augmentierung im
   * Modulgraph bliebe jeder Zugriff untypisiert. Die Form steht deshalb einmal hier, statt an drei
   * Stellen mit drei Wahrheiten.
   */
  const services = ctx as unknown as {
    readonly settings: {
      describe: (options?: { redactSecrets?: boolean }) => readonly {
        ns: string
        revision: number
        value: unknown
      }[]
      update: (ns: string, patch: unknown, revision: number) => Promise<void>
    }
    readonly llm: {
      listModels: (
        provider: string,
      ) => Promise<readonly { id: string; name: string; inputModalities?: readonly string[] }[]>
    }
    readonly logger?: { info?: (text: string) => void }
  }

  const log = (text: string): void => {
    services.logger?.info?.(`${name}: ${text}`)
  }

  const rules = rulesFor(configured, log)

  let lastReport: CatalogReport | undefined
  let running: Promise<CatalogReport> | undefined

  /**
   * Der Schreibweg in die Einstellungen.
   *
   * **Warum mit Wiederholung.** Zwischen `describe` und `update` kann die Models-Seite schreiben;
   * die Revision paßt dann nicht mehr und der Seam weist ab. Ein zweiter Versuch mit frischer
   * Revision ist die richtige Antwort — kein Verzicht auf den Schreibvorgang.
   *
   * @param provider - die Anbieterkennung
   * @param profile - die Felder, die geschrieben werden sollen
   * @returns ob geschrieben wurde
   */
  const writeProfile = async (
    provider: string,
    profile: Record<string, unknown>,
  ): Promise<'written' | 'unchanged'> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const section = services.settings
        .describe({ redactSecrets: true })
        .find((entry) => entry.ns === SETTINGS_NAMESPACE)
      if (section === undefined) throw new Error(`settings section ${SETTINGS_NAMESPACE} is not loaded`)
      if (sameList(existingModels(section.value, provider), profile['models'])) return 'unchanged'
      try {
        await services.settings.update(
          SETTINGS_NAMESPACE,
          { providers: { [provider]: profile } },
          section.revision,
        )
        return 'written'
      } catch (problem) {
        const text = problem instanceof Error ? problem.message : String(problem)
        if (attempt === 0 && text.includes('changed since it was read')) continue
        throw problem
      }
    }
    return 'unchanged'
  }

  const deps: Deps = {
    now: () => new Date(),
    fetch,
    readKey: (ref) => keyFromContext(ctx, ref),
    managed: async (provider) => {
      const models = await services.llm.listModels(provider)
      return models.map((model) => ({
        id: model.id,
        name: model.name,
        ...(model.inputModalities === undefined ? {} : { inputModalities: model.inputModalities }),
      }))
    },
    writeProfile,
    log,
  }

  /**
   * Ein Lauf; parallele Aufrufe teilen sich den laufenden.
   *
   * @returns der Bericht
   */
  const run = async (): Promise<CatalogReport> => {
    if (running !== undefined) return running
    running = runCatalog(rules, deps, { write, create: createMode, ttlMinutes })
    try {
      const report = await running
      lastReport = report
      const written = report.providers.filter((state) => state.written)
      if (written.length > 0) {
        log(
          `catalog written: ${written
            .map((state) => `${state.provider} ${String(state.models)} models (${String(state.added)} new)`)
            .join(', ')}`,
        )
      }
      return report
    } finally {
      running = undefined
    }
  }

  ctx.effect(() => {
    const unregister: (() => void)[] = [
      ctx.webServer.register({
        kind: 'exact',
        path: STATUS_PATH,
        handler: async (req, res) => {
          if (rejectUnauthorized(ctx, req, res)) return
          if (lastReport === undefined && running === undefined) void run()
          respond(res, 200, {
            ...(lastReport ?? { time: new Date().toISOString(), ttlMinutes, providers: [] }),
            running: running !== undefined,
            configured,
          })
        },
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: REFRESH_PATH,
        handler: async (req, res) => {
          if (rejectUnauthorized(ctx, req, res)) return
          try {
            respond(res, 200, await run())
          } catch (problem) {
            respond(res, 500, { error: problem instanceof Error ? problem.message : String(problem) })
          }
        },
      }),
    ]
    return () => {
      for (const dispose of unregister) dispose()
    }
  }, `${name} routes`)

  ctx.effect(() => {
    const ticker = setInterval(() => {
      void run()
    }, ttlMinutes * 60_000)
    ticker.unref?.()
    return () => {
      clearInterval(ticker)
    }
  }, `${name} ticker`)

  ctx.effect(() => {
    // **Nicht sofort.** Beim Start ist der Einstellungsseam noch nicht eingeschwungen; ein Lauf
    // nach drei Sekunden sieht die Sektion, die der Host inzwischen geschrieben hat.
    const kickoff = setTimeout(() => {
      void run()
    }, 3_000)
    kickoff.unref?.()
    return () => {
      clearTimeout(kickoff)
    }
  }, `${name} kickoff`)
}

export default apply
