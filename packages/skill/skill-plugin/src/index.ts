/**
 * `@prometheus-harness/skill-plugin` — die Brücke in den laufenden Host.
 *
 * **Was hier passiert.** Der Host führt einen Cordis-Dienst `ctx.skills`. Dieses Plugin meldet
 * ihm einen **Anbieter** an — den lokalen Anbieter aus `skill-filesystem`, der die
 * Prometheus-Fähigkeiten liest. Der Kern-Katalog und das Kern-Werkzeug `skill` führen sie dann
 * ohne eine Zeile Kernänderung; die Registry-Logik des Kerns bleibt die, die sie ist.
 *
 * **Warum nicht der volle Ersatz des Kern-Dienstes.** Die Kern-Registry ist ein Cordis-Dienst
 * mit Schichtung, Scope und Wasserfällen. Sie durch eine eigene zu ersetzen hieße, dieselbe
 * Semantik noch einmal zu bauen und gegen jede Kernänderung nachzuziehen — genau die doppelte
 * Semantik, die dieses Projekt ablehnt. Ein **Anbieter** ist die vorgesehene Erweiterung; er
 * liefert nur Kandidaten und Rümpfe.
 *
 * **Welche Wurzeln gelesen werden.** Vorgabe ist **nur** `<PMH_HOME>/skills` (plus
 * ausdrücklich konfigurierte Verzeichnisse). Damit entstehen keine Doppelnamen mit dem
 * Anbieter des Kerns, der bereits `.agents/skills` und `~/.dsh/skills` liest. Wer die
 * DSH-Wurzeln zusätzlich will, setzt `includeDefaultRoots: true` — dann entscheidet der Rang,
 * und der Kern-Anbieter gewinnt Gleichstände.
 *
 * **Was das Plugin nicht tut.** Es schreibt keine Katalog-Nachrichten und hängt sich in keinen
 * Step: der Kern besitzt beides bereits. Es meldet nur einen Anbieter an und wieder ab.
 *
 * @module @prometheus-harness/skill-plugin
 */

import { join } from 'node:path'

import type { SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { resolvePmhHome } from '@prometheus-harness/home-paths'
import type { SkillLogger } from '@prometheus-harness/skill'
import { FilesystemSkillProvider } from '@prometheus-harness/skill-filesystem'

/** Der Name des Cordis-Eintrags. */
export const name = 'pmh-skill'

/**
 * Die Dienste, ohne die das Plugin nicht einhängt.
 *
 * `skills` ist der Kern-Dienst; ohne ihn gibt es keinen Katalog, an den man einen Anbieter
 * hängen könnte.
 */
export const inject = ['skills'] as const

/** Die Konfiguration des Plugins. */
export interface Konfiguration {
  /** Anbietername im Kern-Katalog. Vorgabe `pmh-filesystem`. */
  readonly providerName?: string
  /** Eigenes Home für `<home>/skills`; Vorgabe `PMH_HOME → DSH_HOME → ~/.pmh`. */
  readonly home?: string
  /** Zusätzliche Wurzeln, die gelesen werden. */
  readonly verzeichnisse?: readonly string[]
  /** Ob die DSH-Standardwurzeln zusätzlich gelesen werden. Vorgabe `false`. */
  readonly includeDefaultRoots?: boolean
  /** DSH-Home für die Standardwurzeln; nur bei `includeDefaultRoots` wirksam. */
  readonly dshHome?: string
  /** Agenten-Home für die Standardwurzeln; nur bei `includeDefaultRoots` wirksam. */
  readonly agentsHome?: string
  /** Ob die Wurzeln beobachtet werden. Vorgabe `true`. */
  readonly watch?: boolean
}

/**
 * Der strukturelle Ausschnitt des Host-Kontexts, den dieses Plugin braucht.
 *
 * Bewußt strukturell und nicht `Context` aus Cordis: so ist das Plugin ohne laufenden Host
 * prüfbar, und der Typecheck erzwingt trotzdem die Form des Kern-Vertrags — die Anbieter-Fabrik
 * nimmt eine {@link SkillProviderControl} und muß einen {@link SkillProvider} liefern.
 */
export interface HostKontext {
  readonly skills: {
    registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void
  }
  /** Cordis-Effekt: die Rücknahme läuft beim Abmelden des Eintrags. */
  effect?(setup: () => () => void, label?: string): void
  /** Der Kern-Logger; im Betrieb oft unsichtbar, siehe {@link protokollAus}. */
  logger?: unknown
}

/** Das Protokoll, das dieses Plugin schreibt. */
export interface Protokoll {
  info(meldung: string): void
  warn(meldung: string): void
}

/** Das Präfix jeder Zeile — dieselbe Form wie die übrigen Prometheus-Plugins. */
const PRAEFIX = '[pmh] pmh-skill: '

/**
 * Holt ein Protokoll, das im Betrieb **ankommt**.
 *
 * Dieselbe Messung wie bei `pmh-crew`: der Kern-Logger sammelt nur `warn`/`error` für
 * fehlgeschlagene Einträge, ein gelungenes Einhängen bleibt darin unsichtbar. Deshalb geht
 * jede Zeile zusätzlich auf `stderr`.
 */
export function protokollAus(ctx: HostKontext): Protokoll {
  const dienst = ctx.logger as
    | ((name?: string) => Partial<Protokoll> | undefined)
    | Partial<Protokoll>
    | undefined
  const ziel: Partial<Protokoll> | undefined = dienst === undefined
    ? undefined
    : typeof dienst === 'function' ? (dienst(name) ?? undefined) : dienst
  const schreibe = (art: 'info' | 'warn', meldung: string): void => {
    process.stderr.write(`${PRAEFIX}${meldung}\n`)
    if (ziel === undefined) return
    const methode = ziel[art] ?? ziel.warn
    if (methode !== undefined) methode.call(ziel, meldung)
  }
  return {
    info: (meldung: string): void => { schreibe('info', meldung) },
    warn: (meldung: string): void => { schreibe('warn', meldung) },
  }
}

/**
 * Meldet den Prometheus-Anbieter am Kern-Katalog an.
 *
 * @param ctx - der Host-Kontext mit `ctx.skills`
 * @param konfiguration - Wurzeln, Name und Beobachtung
 * @returns die Abmeldung; sie nimmt den Anbieter zurück und schließt die Beobachtung
 */
export function applyMitKonfiguration(
  ctx: HostKontext,
  konfiguration: Konfiguration = {},
): () => void {
  const protokoll = protokollAus(ctx)
  const logger: SkillLogger = { warn: (text) => { protokoll.warn(text) } }
  const verzeichnisse = standardVerzeichnisse(konfiguration)

  let anbieter: FilesystemSkillProvider | undefined
  const abmelden = ctx.skills.registerProvider((control) => {
    anbieter = new FilesystemSkillProvider(
      {
        providerName: konfiguration.providerName ?? 'pmh-filesystem',
        includeDefaultRoots: konfiguration.includeDefaultRoots ?? false,
        ...(konfiguration.dshHome === undefined ? {} : { dshHome: konfiguration.dshHome }),
        ...(konfiguration.agentsHome === undefined ? {} : { agentsHome: konfiguration.agentsHome }),
        customSkillDirs: verzeichnisse,
        watch: konfiguration.watch ?? true,
        logger,
      },
      control,
    )
    return anbieter
  })

  let abgemeldet = false
  const zuruecknehmen = (): void => {
    if (abgemeldet) return
    abgemeldet = true
    try {
      anbieter?.dispose()
    } catch (fehler) {
      protokoll.warn(fehler instanceof Error ? fehler.message : String(fehler))
    }
    abmelden()
  }
  ctx.effect?.(() => zuruecknehmen, 'pmh-skill: Anbieter abmelden')

  protokoll.info(
    `eingehaengt — Anbieter "${konfiguration.providerName ?? 'pmh-filesystem'}", `
    + `${verzeichnisse.length} eigene Wurzel(n)${verzeichnisse.length === 0 ? ' — der Katalog bleibt vorerst leer' : ''}`,
  )
  return zuruecknehmen
}

/**
 * Der Einstieg, den der Loader ruft.
 *
 * Eine leere Konfiguration ist gültig: sie liest `<PMH_HOME>/skills`. Fehlt das Verzeichnis,
 * ist der Katalog leer, und eine später angelegte Fähigkeit erscheint, sobald die Beobachtung
 * greift — kein Grund, den Boot abzubrechen.
 *
 * @param ctx - der Host-Kontext
 * @param konfiguration - die Konfiguration aus der Eintragszeile, falls es eine gibt
 * @returns die Abmeldung
 */
export function apply(ctx: HostKontext, konfiguration: Partial<Konfiguration> = {}): () => void {
  return applyMitKonfiguration(ctx, konfiguration as Konfiguration)
}

/**
 * Die Wurzeln, die das Plugin liest.
 *
 * Immer enthalten ist `<PMH_HOME>/skills`; die ausdrücklich genannten Verzeichnisse kommen
 * dahinter. Doppelte Pfade werden entfernt, damit derselbe Skill nicht zweimal mit demselben
 * Rang kandididiert.
 */
function standardVerzeichnisse(konfiguration: Konfiguration): string[] {
  const verzeichnisse = [join(konfiguration.home ?? resolvePmhHome(), 'skills')]
  for (const pfad of konfiguration.verzeichnisse ?? []) {
    if (pfad.trim() !== '' && !verzeichnisse.includes(pfad)) verzeichnisse.push(pfad)
  }
  return verzeichnisse
}
