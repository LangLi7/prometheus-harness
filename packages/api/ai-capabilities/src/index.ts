/**
 * `@prometheus-harness/ai-capabilities` — die KI-Fähigkeiten **als Host-Plugin**.
 *
 * ## Was dieses Plugin schließt
 *
 * Bis zum 19.10.2026 waren die Fähigkeiten **gebaut und geprüft**, aber im laufenden Host
 * **nicht angeschlossen**: `openrouter` konnte fünf Fähigkeiten, und niemand konnte sie aufrufen.
 * Genau diese Lücke schließt dieses Paket — mit zwei Flächen aus **einer** Kette:
 *
 * | Fläche | Für wen | Wo |
 * |---|---|---|
 * | HTTP | Oberfläche und andere Dienste | `GET /api/ai/capabilities`, `POST /api/ai/{decide,speak,transcribe,embed,draw}` |
 * | Werkzeuge | das Modell im Gespräch | `image_generate`, `speech_speak`, `speech_transcribe`, `text_embed`, `ai_decide` |
 *
 * ## Warum zwei Flächen und nicht eine
 *
 * Ein Endpunkt ist für einen Browser: er braucht Statuscodes, Bytes und eine Sperre. Ein Werkzeug
 * ist für ein Modell: es braucht einen Namen, ein Parameterschema und einen Bericht. Beides über
 * **dieselbe** Kette zu führen heißt: eine Einstellung, ein Schlüssel, ein Verhalten. Zwei Wege mit
 * zwei Wahrheiten wären der Fehler, den dieses Projekt an anderer Stelle schon einmal hatte.
 *
 * ## Der Schlüssel kommt aus dem Speicher, nicht aus dem Quelltext
 *
 * Gelesen wird über `ctx.credentials.resolve('OPENROUTER_API_KEY')` — derselbe Speicher, den die
 * Modelle-Seite benutzt — und nur, wenn es ihn nicht gibt, aus der Umgebung. Der Wert erscheint in
 * **keiner** Antwort und in **keiner** Meldung; die Auskunft nennt nur „gesetzt" oder „nicht
 * gesetzt".
 *
 * ## Was beim Start NICHT passiert
 *
 * Kein Netzaufruf, kein Dateizugriff. Die Kette wird **je Anfrage** gebaut, damit eine geänderte
 * Einstellungsdatei sofort wirkt — ein Neustart wäre genau der Moment, in dem ein Nutzer glaubt,
 * seine Wahl sei verloren.
 *
 * @module @prometheus-harness/ai-capabilities
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

import type { AgentTool } from '@prometheus-harness/agent-tools'
import { UMWELT_SCHLUESSEL as UMWELT_TYPESAFE } from '@prometheus-harness/typesafe'

import { UMWELT_SCHLUESSEL, baueKette, type Kette } from './kette.ts'
import {
  macheAuskunftHandler,
  macheBildHandler,
  macheEinbettHandler,
  macheEntscheidHandler,
  macheHoerHandler,
  macheSprachHandler,
  type Flaechenkontext,
} from './flaechen.ts'
import {
  bildWerkzeug,
  entscheidWerkzeug,
  einbettWerkzeug,
  hoerWerkzeug,
  sprachWerkzeug,
} from './werkzeuge.ts'

// ---------------------------------------------------------------------------
// Kennungen
// ---------------------------------------------------------------------------

/** Der stabile Plugin-Name — er steht in der Patch-Zeile und in jeder Meldung. */
export const name = 'pmh-ai-capabilities'

/**
 * Dienste, die vor dem Einhängen da sein müssen.
 *
 * **Nur `webServer`.** `credentials` und `tools` werden **zur Laufzeit** geholt: fehlt `credentials`,
 * fällt der Schlüssel auf die Umgebung zurück; fehlt `tools`, gibt es eben keine Werkzeuge — aber
 * die Endpunkte sollen deswegen nicht ausfallen. Ein hartes `inject` würde das Plugin gar nicht
 * erst einhängen und damit auch die Endpunkte mitnehmen.
 */
export const inject = ['webServer']

/** Die Adressen, die dieses Plugin einträgt. */
export const ROUTEN = {
  auskunft: '/api/ai/capabilities',
  decide: '/api/ai/decide',
  speak: '/api/ai/speak',
  transcribe: '/api/ai/transcribe',
  embed: '/api/ai/embed',
  draw: '/api/ai/draw',
} as const

/** Die Fassung dieses Pakets. */
export const SERVICE_VERSION = '0.1.0'

// ---------------------------------------------------------------------------
// Der Schlüssel
// ---------------------------------------------------------------------------

/** Was der Anmeldedienst können muß — strukturell, damit dieses Paket ihn nicht importiert. */
interface Anmeldedienst {
  readonly resolve?: (ref: string) => Promise<{ readonly value: string } | undefined>
}

/**
 * Baut eine Schlüsselquelle: erst der Speicher, dann die Umgebung.
 *
 * **Warum der Speicher vorgeht.** Er ist der Ort, den die Modelle-Seite schreibt, und er ist der
 * Ort, an dem der Nutzer seinen Schlüssel erwartet. Die Umgebung ist der Ausweichweg für Container
 * und CI — dort steht der Schlüssel absichtlich und lesbar.
 *
 * **Warum der Name ein Parameter ist.** Jeder Dienst hat seinen eigenen Schlüssel. Eine Quelle,
 * die immer denselben Namen auflöst, würde beim zweiten Dienst den Schlüssel des ersten
 * hinterlegen — und der Fehler käme erst als HTTP 401 zurück, an einer Stelle, die nichts mit
 * der Ursache zu tun hat.
 *
 * @param ctx - der Plugin-Kontext
 * @param name - der Name im Speicher und in der Umgebung (`OPENROUTER_API_KEY`)
 * @returns die Quelle
 */
export function schluesselquelleFuer(ctx: Context, name: string): () => Promise<string | undefined> {
  return async () => {
    const speicher = ctx.get('credentials') as Anmeldedienst | undefined
    if (speicher !== undefined && typeof speicher.resolve === 'function') {
      try {
        const gelesen = await speicher.resolve(name)
        if (gelesen !== undefined && gelesen.value.trim() !== '') return gelesen.value
      } catch {
        // **Kein Wurf nach außen.** Ein unlesbarer Speicher ist ein Grund für den Ausweichweg,
        // kein Grund, die ganze Fähigkeit aufzugeben.
      }
    }
    return process.env[name]
  }
}

/**
 * Baut die Schlüsselquelle für OpenRouter.
 *
 * @param ctx - der Plugin-Kontext
 * @returns die Quelle
 */
export function schluesselquelle(ctx: Context): () => Promise<string | undefined> {
  return schluesselquelleFuer(ctx, UMWELT_SCHLUESSEL)
}

// ---------------------------------------------------------------------------
// Die Sperre
// ---------------------------------------------------------------------------

/**
 * Fragt die Anmelde- und Zaunprüfung des Hosts.
 *
 * Fehlt der Verbindungsdienst, wird **verweigert** (503): die Endpunkte geben Bilder und Ton aus
 * und kosten Geld — ein ungeschützter Endpunkt wäre der teurere Fehler.
 *
 * @param ctx - der Plugin-Kontext
 * @param headers - die Kopfdaten
 * @returns `undefined`, wenn erlaubt — sonst der Status
 */
export function abweisung(ctx: Context, headers: IncomingMessage['headers']): number | undefined {
  const verbindung = ctx.get('connection') as
    | { requestRejection?: (request: { headers: IncomingMessage['headers'] }) => number | undefined }
    | undefined
  if (verbindung === undefined || typeof verbindung.requestRejection !== 'function') return 503
  return verbindung.requestRejection({ headers })
}

// ---------------------------------------------------------------------------
// Die Werkzeugbrücke
// ---------------------------------------------------------------------------

/**
 * Macht aus einem `AgentTool` eine `ToolDefinition` des Kerns.
 *
 * **Dieselbe Brücke wie in `@prometheus-harness/crew-plugin`** — hier bewußt noch einmal, statt
 * quer zu importieren: dieses Paket soll nicht das ganze Crew-Plugin mitziehen, nur um ein paar
 * Zeilen zu teilen. Die Form ist dort dokumentiert; sie ist kurz genug, um sie zu wiederholen.
 *
 * @param werkzeug - das Werkzeug aus unserem Seam
 * @returns die Definition für `ctx.tools.register`
 * @throws Error wenn das Werkzeug keinen Namen trägt
 */
export function alsKernWerkzeug(werkzeug: AgentTool): ToolDefinition {
  if (werkzeug.name.trim() === '') throw new Error('ein Werkzeug ohne Namen laesst sich nicht anmelden')
  return {
    name: werkzeug.name,
    description: werkzeug.description,
    parameters: werkzeug.parameters as Record<string, unknown>,
    output: {
      schema: { type: 'object' } as unknown as ToolDefinition['output']['schema'],
      render: (_args: unknown, value: unknown): ContentBlock[] =>
        [
          { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) },
        ] as unknown as ContentBlock[],
    },
    execute: async (args: unknown, exec: ToolRunContext): Promise<unknown> => {
      const text = await werkzeug.execute(
        (typeof args === 'object' && args !== null ? args : {}) as Readonly<Record<string, unknown>>,
        { signal: exec.signal, step: 1, callId: String(exec.rootCallId) },
      )
      try {
        return JSON.parse(text) as unknown
      } catch {
        return text
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Einhängen
// ---------------------------------------------------------------------------

/** Was der Kontext nach dem Einhängen anbietet. */
export interface Flaechen {
  /** Baut die Kette frisch — für andere Plugins und für Prüfungen. */
  readonly kette: () => Promise<Kette>
}

/**
 * Hängt Endpunkte und Werkzeuge ein.
 *
 * @param ctx - der Plugin-Kontext
 */
export function apply(ctx: Context): void {
  const kette = (): Promise<Kette> =>
    baueKette({
      schluessel: schluesselquelle(ctx),
      // **Der zweite Dienst, dieselbe Regel.** Auch der TypeSafe-Schlüssel kommt zuerst aus dem
      // Speicher; die Umgebung bleibt der Ausweichweg.
      schluesselTypesafe: schluesselquelleFuer(ctx, UMWELT_TYPESAFE),
    })
  const kontext: Flaechenkontext = {
    kette,
    abweisung: (headers) => abweisung(ctx, headers),
  }

  ctx.effect(() => {
    const routen: readonly WebRoute[] = [
      { kind: 'exact', path: ROUTEN.auskunft, handler: macheAuskunftHandler(kontext) },
      { kind: 'exact', path: ROUTEN.decide, handler: macheEntscheidHandler(kontext) },
      { kind: 'exact', path: ROUTEN.speak, handler: macheSprachHandler(kontext) },
      { kind: 'exact', path: ROUTEN.transcribe, handler: macheHoerHandler(kontext) },
      { kind: 'exact', path: ROUTEN.embed, handler: macheEinbettHandler(kontext) },
      { kind: 'exact', path: ROUTEN.draw, handler: macheBildHandler(kontext) },
    ]
    const abgemeldet = routen.map((route) => ctx.webServer.register(route))

    // **Die Werkzeuge sind freiwillig.** Fehlt der Werkzeugdienst (etwa in einem Host ohne
    // Agenten), bleiben die Endpunkte trotzdem stehen — ein Plugin, das deswegen gar nicht lädt,
    // nähme sie mit.
    const werkzeuge: readonly AgentTool[] = [
      bildWerkzeug(kette),
      sprachWerkzeug(kette),
      hoerWerkzeug(kette),
      entscheidWerkzeug(kette),
      einbettWerkzeug(kette),
    ]
    const dienst = ctx.get('tools') as { register?: (definition: ToolDefinition) => () => void } | undefined
    if (dienst !== undefined && typeof dienst.register === 'function') {
      for (const werkzeug of werkzeuge) abgemeldet.push(dienst.register(alsKernWerkzeug(werkzeug)))
    }

    return () => {
      for (const ab of [...abgemeldet].reverse()) ab()
    }
  }, `${name} ${Object.values(ROUTEN).join(' ')}`)
}

export default apply

// --- Was andere Pakete brauchen --------------------------------------------
export { ANBIETER_ID, baueKette, type Kette, type KetteOptionen } from './kette.ts'
export { FLAECHEN_FAEHIGKEITEN } from './kette.ts'
export { auskunft, alsWav, liesTonformat, type Auskunft, type Faehigkeitszeile } from './flaechen.ts'
export { zielPfad, endungFuer } from './werkzeuge.ts'
