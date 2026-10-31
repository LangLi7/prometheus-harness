/**
 * Die Crew am **Seam des Kerns** — der Weg, der im laufenden Host wirkt.
 *
 * ## Warum es diesen zweiten Adapter gibt
 *
 * Unsere Units sprechen Prometheus' eigenen Seam (`LlmProvider.complete`, `AgentTool`). Der Host
 * spricht einen anderen: `@deepseek-ai/dsh-llm` mit `LlmAdapter.stream(GenerateOptions)`. Gemessen
 * am 18.10.2026: `apps/cli/src/main.ts` baut **keinen** Loop, sondern ruft `boot()` des Kerns; die
 * eigene Kette hat außerhalb ihrer selbst keinen Verbraucher. Wer eine Crew im laufenden Host will,
 * braucht deshalb **diesen** Adapter — nicht den aus `crew-provider`.
 *
 * ## Was der Kern-Seam kann, was unserer nicht kann
 *
 * Der Kern trägt **Bildblöcke**: `ContentBlockMap` kennt `'image'`, `ModelModality` kennt `'image'`
 * (`dsh-llm` 0.2.1). Damit ist die Bildrolle hier **wirklich** erreichbar: eine Anfrage mit
 * Bildblock geht an die Rolle `vision`, alles andere an `executor`, ersatzweise `planner`. Im
 * eigenen Seam war das unmöglich — dort trägt `MessagePart` nur Text, Werkzeugergebnis und
 * Werkzeugaufruf. Das ist das stärkste Argument dafür, im Host **diesen** Weg zu nehmen.
 *
 * ## Was er nicht tut
 *
 * Er **baut keinen Strom um**: er wählt die Rolle, schreibt `provider` und `model` um und reicht den
 * Strom des Ziel-Anbieters unverändert zurück (`.replace`/Delegation statt Kopie). Damit gelten
 * Wiederholung, Bildprojektion und Abbruch des Kerns weiter — der Adapter ist eine Weiche, kein
 * zweiter Anbieter.
 *
 * @module @prometheus-harness/crew-core-adapter
 */

import {
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { CREW_ROLLEN, istRolle, routen, type CrewRolle } from '@prometheus-harness/crew-plan'

/** Wohin eine Rolle zeigt: eine Route im Kern und ein Modell. */
export interface Rollenbindung {
  /** Die Kern-Route (`deepseek-official`). */
  familie: string
  /** Die Modellkennung. */
  modell: string
}

/** Eine Crew am Kern-Seam. */
export interface CrewEintrag {
  /** Die Kennung — sie erscheint als Modellname. */
  id: string
  /** Der Name für Menschen; fehlt er, gilt die Kennung. */
  name?: string
  /** Die gebundenen Rollen. */
  rollen: Partial<Record<CrewRolle, Rollenbindung>>
}

/** Der Versand des Kerns, den der Adapter braucht — nur `stream`. */
export interface LlmVersand {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/** Die Route, unter der eine Crew erscheint. */
export const CREW_ROUTE = 'crew'

/**
 * Die Sprache eines Befunds.
 *
 * **Englisch ist die erste, Deutsch die zweite.** Die Texte der Oberfläche und der Wege sind
 * englisch geschrieben und ins Deutsche übersetzt — nicht umgekehrt. Der Vorgabewert bleibt `de`,
 * damit die vorhandenen Aufrufer und Prüfungen unverändert dieselben Sätze sehen.
 */
export type Sprache = 'de' | 'en'

/** Die Sätze, die {@link pruefeCrew} sprechen kann. */
interface Crewtexte {
  readonly kennungFehlt: string
  readonly kennungRoute: string
  readonly keineRolle: string
  readonly unbekannteRolle: (rolle: string) => string
  readonly routeAlsZiel: (rolle: string) => string
  readonly halbGebunden: (rolle: string) => string
}

/** Die zwei Fassungen — Englisch zuerst, Deutsch daneben. */
const CREWTEXTE: Readonly<Record<Sprache, Crewtexte>> = {
  en: {
    kennungFehlt: 'the crew needs an identifier',
    kennungRoute: 'a crew must not be called "crew" — that is the route itself',
    keineRolle: 'the crew binds no role',
    unbekannteRolle: (rolle) => `unknown role "${rolle}" (known: ${CREW_ROLLEN.join(', ')})`,
    routeAlsZiel: (rolle) =>
      `role "${rolle}" points at the route "${CREW_ROUTE}" — that would be a crew inside a crew`,
    halbGebunden: (rolle) => `role "${rolle}" is half-bound (route and model must both be set)`,
  },
  de: {
    kennungFehlt: 'die Crew braucht eine Kennung',
    kennungRoute: 'eine Crew darf nicht "crew" heissen — das ist die Route selbst',
    keineRolle: 'die Crew bindet keine Rolle',
    unbekannteRolle: (rolle) => `unbekannte Rolle "${rolle}" (bekannt: ${CREW_ROLLEN.join(', ')})`,
    routeAlsZiel: (rolle) =>
      `Rolle "${rolle}" zeigt auf die Route "${CREW_ROUTE}" — das waere eine Crew in einer Crew`,
    halbGebunden: (rolle) => `Rolle "${rolle}" ist halb gebunden (Route und Modell muessen stehen)`,
  },
}

/**
 * Prüft eine Crew, bevor der Adapter gebaut wird.
 *
 * **Warum der Host das prüfen muß.** Die Rollen kommen aus einer Einstellung. Eine Rolle, die auf
 * die Route `crew` zeigt, wäre eine Crew in einer Crew — der Harness verhinderte das nur im
 * Modellwähler (`ModelDropdown.tsx:86`), nicht im Host.
 *
 * @param crew - die Crew
 * @param sprache - die Sprache der Befunde (Vorgabe `de`)
 * @returns die Befunde; leer heißt „benutzbar"
 */
export function pruefeCrew(crew: CrewEintrag, sprache: Sprache = 'de'): string[] {
  const texte = CREWTEXTE[sprache]
  const befund: string[] = []
  if (crew.id.trim() === '') befund.push(texte.kennungFehlt)
  if (crew.id === CREW_ROUTE) befund.push(texte.kennungRoute)
  if (Object.keys(crew.rollen).length === 0) befund.push(texte.keineRolle)
  for (const [rolle, bindung] of Object.entries(crew.rollen)) {
    if (!istRolle(rolle)) {
      befund.push(texte.unbekannteRolle(rolle))
      continue
    }
    if (bindung === undefined) continue
    if (bindung.familie === CREW_ROUTE) {
      befund.push(texte.routeAlsZiel(rolle))
    }
    if (bindung.familie.trim() === '' || bindung.modell.trim() === '') {
      befund.push(texte.halbGebunden(rolle))
    }
  }
  return befund
}

/**
 * Prüft, ob eine Nachricht einen Bildblock trägt.
 *
 * @param content - der Inhalt einer Nachricht
 * @returns ob ein `image`-Block darin steht
 */
function traegtBild(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  return content.some((block) => typeof block === 'object' && block !== null
    && (block as { type?: unknown }).type === 'image')
}

/**
 * Prüft eine ganze Anfrage auf Bildblöcke.
 *
 * @param options - die Anfrage
 * @returns ob irgendeine Nachricht ein Bild trägt
 */
function anfrageTraegtBild(options: GenerateOptions): boolean {
  return options.messages.some((nachricht) => traegtBild((nachricht as { content?: unknown }).content))
}

/**
 * Der Adapter: eine Crew als ein Anbieter unter der Route `crew`.
 *
 * **Registrierung im Host:** `ctx.llm.registerAdapter(['crew'], new CrewAdapter(ctx.llm, crews))` —
 * ein Plugin, das der Loader einhängt. Der Adapter selbst kennt keinen Cordis-Kontext; er bekommt
 * nur den Versand.
 */
export class CrewAdapter extends LlmAdapter {
  readonly #llm: LlmVersand
  readonly #crews: readonly CrewEintrag[]

  /**
   * @param llm - der Versand des Kerns (in der Regel `ctx.llm`)
   * @param crews - die Crews; jede muß {@link pruefeCrew} bestehen
   * @throws Error wenn eine Crew unbrauchbar ist oder zwei dieselbe Kennung tragen
   */
  constructor(llm: LlmVersand, crews: readonly CrewEintrag[]) {
    super()
    const befunde: string[] = []
    const gesehen = new Set<string>()
    for (const crew of crews) {
      for (const befund of pruefeCrew(crew)) befunde.push(`Crew "${crew.id}": ${befund}`)
      if (gesehen.has(crew.id)) befunde.push(`Kennung "${crew.id}" ist doppelt`)
      gesehen.add(crew.id)
    }
    if (befunde.length > 0) throw new Error(`Crews sind nicht benutzbar: ${befunde.join('; ')}`)
    this.#llm = llm
    this.#crews = crews
  }

  /** {@inheritDoc LlmAdapter.providerInfo} */
  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Crew' }
  }

  /** {@inheritDoc LlmAdapter.listModels} */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return this.#crews.map((crew) => this.#modell(provider, crew))
  }

  /** {@inheritDoc LlmAdapter.resolveModel} */
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const crew = this.#crewFuer(model)
    return this.#modell(provider, crew)
  }

  /** {@inheritDoc LlmAdapter.stream} */
  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const crew = this.#crewFuer(options.model)
    const gebunden = Object.keys(crew.rollen).filter((rolle) => istRolle(rolle)) as CrewRolle[]
    const rolle = routen({ bild: anfrageTraegtBild(options), gebunden })
    const bindung = crew.rollen[rolle]
    if (bindung === undefined) {
      throw new LlmError(`die Rolle "${rolle}" ist in der Crew "${crew.id}" nicht gebunden`, 'NO_CREW_ROLE')
    }
    // Die Weiche: nur Route und Modell werden umgeschrieben, der Strom kommt vom Ziel-Anbieter.
    return this.#llm.stream({
      ...options,
      provider: bindung.familie,
      model: bindung.modell,
    })
  }

  /** Sucht eine Crew, oder wirft benannt. */
  #crewFuer(model: string): CrewEintrag {
    const crew = this.#crews.find((eintrag) => eintrag.id === model)
    if (crew === undefined) {
      const bekannt = this.#crews.map((eintrag) => eintrag.id).join(', ')
      throw new LlmError(`Crew "${model}" ist nicht eingerichtet; bekannt: ${bekannt}`, 'NO_CREW')
    }
    return crew
  }

  /** Baut den Katalogeintrag einer Crew. */
  #modell(provider: string, crew: CrewEintrag): LlmModelInfo {
    const modell: LlmModelInfo = {
      provider,
      id: crew.id,
      name: crew.name ?? crew.id,
      // **Bild nur, wenn eine Bildrolle gebunden ist** — sonst waere die Zusage falsch.
      inputModalities: crew.rollen.vision === undefined ? ['text'] : ['text', 'image'],
    }
    return modell
  }
}

