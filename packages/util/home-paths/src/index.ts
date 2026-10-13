/**
 * Auflösung des Harness-Home.
 *
 * Die Vorlage (`packages/util/home-paths` der DeepSeek-Harness) liest `DSH_HOME`
 * und fällt sonst auf `~/.dsh` zurück. Dieses Paket erweitert die Kette um einen
 * eigenen Namen **vorne** und einen eigenen Default **hinten**:
 *
 *     PMH_HOME  →  DSH_HOME  →  ~/.pmh
 *
 * Warum `DSH_HOME` in der Mitte steht: eine bestehende Installation unter
 * `~/.dsh` bzw. unter dem dort gesetzten `DSH_HOME` bleibt ohne Änderung
 * auffindbar. Wer `DSH_HOME` gesetzt hat, bekommt genau dieses Verzeichnis —
 * es sei denn, er setzt ausdrücklich `PMH_HOME`. Damit sind `~/.dsh` und
 * `~/.pmh` zwei getrennte Installationen, ohne dass ein Kernstück angepasst
 * werden muss (MAPPING.md §6.3, §7 „Home-Verzeichnis").
 *
 * Der Auflösungsalgorithmus ist der der Vorlage, nur mit zwei Env-Stufen:
 *   1. das explizite `configured`-Argument gewinnt immer, sobald es nicht
 *      `null`/`undefined` ist (ein expliziter Leerstring gewinnt also und
 *      löst gegen das aktuelle Arbeitsverzeichnis auf),
 *   2. sonst die erste Env-Variable der Kette mit nicht-leerem, nicht nur aus
 *      Leerzeichen bestehendem Wert,
 *   3. sonst `defaultPmhHome()` = `join(homedir(), '.pmh')`.
 * Das Ergebnis läuft durch `expandHomePath` und danach durch `resolve`, ist
 * also immer ein absoluter, normalisierter Pfad.
 *
 * Kein XDG-Pfad, keine Plattformverzweigung — wie in der Vorlage.
 */

import { opendir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'

/** Verzeichnisname der Prometheus-Harness-Installation unterhalb des OS-Home. */
export const PMH_HOME_DIR_NAME = '.pmh'

/** Anzeigeform des Standard-Home — nie ein absoluter Pfad. */
export const DEFAULT_PMH_HOME_DISPLAY = '~/.pmh'

/** Eigener Override, höchste Priorität. */
export const PMH_HOME_ENV = 'PMH_HOME'

/** Override der Vorlage; bleibt gültig, damit die bestehende Installation gefunden wird. */
export const DSH_HOME_ENV = 'DSH_HOME'

/**
 * Die Home-Kette in Prüfreihenfolge. Exportiert, damit Aufrufer und
 * Dokumentation dieselbe Reihenfolge lesen statt sie abzuschreiben.
 */
export const HOME_ENV_CHAIN = [PMH_HOME_ENV, DSH_HOME_ENV] as const

/** Ein Eintrag der Home-Kette. */
export type HomeEnvName = (typeof HOME_ENV_CHAIN)[number]

/** Umgebung als reine Lesesicht — erlaubt Tests ohne `process.env`-Mutation. */
export type HomeEnv = Record<string, string | undefined>

/** Ergebnis einer Auflösung samt Herkunft der Entscheidung. */
export interface ResolvedHome {
  /** Absoluter, normalisierter Pfad. */
  readonly path: string
  /** Woher der Pfad stammt. */
  readonly origin: 'configured' | HomeEnvName | 'default'
  /** Anzeigeform ohne absoluten Pfad. */
  readonly display: string
}

/** Standard-Home: `<OS-Home>/.pmh`. */
export function defaultPmhHome(): string {
  return join(homedir(), PMH_HOME_DIR_NAME)
}

/**
 * Tilde-Expansion — genau drei Fälle, wie in der Vorlage:
 * `'~'` → Home, Präfix `'~/'` oder `'~\\'` → `join(home, rest)`, sonst unverändert.
 * Benannte Nutzerformen wie `~alice/…`, `$VAR` und Shell-Ausdrücke bleiben unangetastet.
 */
export function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0
}

/**
 * Auflösung mit Herkunft. `configured` gewinnt immer (auch als Leerstring);
 * ein blanker Env-Wert gilt als nicht gesetzt.
 */
export function resolveHomeDetailed(configured?: string, env: HomeEnv = process.env): ResolvedHome {
  if (configured !== undefined) {
    const path = resolve(expandHomePath(configured))
    return { path, origin: 'configured', display: displayFor(configured, path) }
  }

  for (const name of HOME_ENV_CHAIN) {
    const fromEnv = env[name]
    if (fromEnv === undefined || isBlank(fromEnv)) continue
    const path = resolve(expandHomePath(fromEnv))
    return { path, origin: name, display: displayFor(fromEnv, path) }
  }

  const path = resolve(defaultPmhHome())
  return { path, origin: 'default', display: DEFAULT_PMH_HOME_DISPLAY }
}

/**
 * Anzeigeform, die die Herkunft sichtbar hält: der Default erscheint als
 * `~/.pmh`, ein relativer Wert als `./…`, alles andere als `$PMH_HOME`.
 * Die Env-Kette allein kennt den Variablennamen nicht mehr — dafür gibt es
 * {@link ResolvedHome.origin}.
 */
function displayFor(raw: string, resolvedPath: string): string {
  if (resolvedPath === resolve(defaultPmhHome()) && raw === DEFAULT_PMH_HOME_DISPLAY) {
    return DEFAULT_PMH_HOME_DISPLAY
  }
  if (!isAbsolute(raw) && !raw.startsWith('~')) return `./${raw}`
  return `$${PMH_HOME_ENV}`
}

/**
 * Das aufgelöste Harness-Home: `PMH_HOME` → `DSH_HOME` → `~/.pmh`.
 *
 * @param configured explizite Konfiguration; gewinnt gegen jede Env-Variable.
 * @param env Umgebungsquelle; standardmäßig `process.env`.
 */
export function resolvePmhHome(configured?: string, env: HomeEnv = process.env): string {
  return resolveHomeDetailed(configured, env).path
}

/**
 * Unser Home — **ohne** Rückfall auf `DSH_HOME`.
 *
 * ## Warum es diese zweite Auflösung gibt
 *
 * `resolvePmhHome` folgt der Kette `PMH_HOME → DSH_HOME → ~/.pmh`. Das ist für
 * einen Umzug aus einem bestehenden DeepSeek-Harness sinnvoll: wer dort schon ein
 * Home hat, soll es weiterbenutzen.
 *
 * **Für eigene Dateien ist dieser Rückfall aber falsch** — und am 13.10.2026 ist
 * genau das passiert, gemessen:
 *
 * ```
 * PMH_HOME = (leer)
 * DSH_HOME = C:\Users\Chang\.dsh
 * scripts/claim.mjs -> "Home: C:\Users\Chang\.dsh"
 * ```
 *
 * Das Skript legte `claim.txt`, `claim-ablage.json` und `geraet` in **`~/.dsh`** an.
 * `~/.dsh` gehört dem **anderen** Harness und ist als „niemals verändern"
 * gekennzeichnet — ein Werkzeug, das dorthin schreibt, weil eine Umgebungsvariable
 * gesetzt ist, verletzt diese Grenze **ohne Absicht und ohne Warnung**.
 *
 * ## Die Regel
 *
 * `PMH_HOME`, sonst `~/.pmh`. **Kein `DSH_HOME`.** Und eine harte Sperre: liegt
 * das Ergebnis auf dem DSH-Home oder endet es auf `.dsh`, wird **geworfen** statt
 * geschrieben. Eine Konvention, die man brechen kann, ist keine Grenze; ein
 * Fehler, der den Lauf abbricht, ist eine.
 *
 * @param configured explizite Konfiguration; gewinnt gegen die Env-Variable.
 * @param env Umgebungsquelle; standardmäßig `process.env`.
 * @returns der Pfad unseres Homes
 * @throws Error, wenn der Pfad auf ein DSH-Home zeigt
 */
export function resolveEigenesHome(configured?: string, env: HomeEnv = process.env): string {
  let pfad: string
  if (configured !== undefined) {
    pfad = resolve(expandHomePath(configured))
  } else {
    const ausEnv = env[PMH_HOME_ENV]
    pfad = ausEnv !== undefined && !isBlank(ausEnv) ? resolve(expandHomePath(ausEnv)) : resolve(defaultPmhHome())
  }

  // Die harte Sperre. Verglichen wird gegen `DSH_HOME` **und** gegen den
  // Verzeichnisnamen — wer `DSH_HOME` nicht gesetzt hat, aber auf `~/.dsh` zeigt,
  // soll genauso abgewiesen werden.
  const dshAusEnv = env[DSH_HOME_ENV]
  const dshHome = dshAusEnv !== undefined && !isBlank(dshAusEnv) ? resolve(expandHomePath(dshAusEnv)) : undefined
  const namensTreffer = basename(pfad) === '.dsh'

  if (namensTreffer || (dshHome !== undefined && pfad === dshHome)) {
    throw new Error(
      `ABBRUCH: das eigene Home zeigt auf „${pfad}" — das Home des DeepSeek Harness. ` +
        'Dorthin schreibt dieses Projekt nicht. Setze PMH_HOME auf ein eigenes Verzeichnis ' +
        '(Vorgabe: ~/.pmh) oder übergib einen Pfad ausdrücklich.',
    )
  }
  return pfad
}

/** Der zweite Root der Vorlage, unverändert übernommen: `~/.agents` bzw. `$DSH_AGENTS_HOME`. */
export const AGENTS_HOME_DIR_NAME = '.agents'

/** Anzeigeform des geteilten Agent-Root. */
export const DEFAULT_AGENTS_HOME_DISPLAY = '~/.agents'

/** Override des geteilten Agent-Root. */
export const AGENTS_HOME_ENV = 'DSH_AGENTS_HOME'

/** Standard des geteilten Agent-Root: `<OS-Home>/.agents`. */
export function defaultAgentsHome(): string {
  return join(homedir(), AGENTS_HOME_DIR_NAME)
}

/** Geteilter Agent-Root: `configured` → `$DSH_AGENTS_HOME` → `~/.agents`. */
export function resolveAgentsHome(configured?: string, env: HomeEnv = process.env): string {
  if (configured !== undefined) return resolve(expandHomePath(configured))
  const fromEnv = env[AGENTS_HOME_ENV]
  if (fromEnv !== undefined && !isBlank(fromEnv)) return resolve(expandHomePath(fromEnv))
  return resolve(defaultAgentsHome())
}

/** Ein Pfad unterhalb des Harness-Home: `join(resolvePmhHome(configured), ...segments)`. */
export function pmhHomePath(...segments: string[]): string {
  return join(resolvePmhHome(), ...segments)
}

/** Optionen der Cache-Pfad-Form. */
export interface PmhCachePathOptions {
  /** Explizites Home; sonst greift die Kette. */
  readonly pmhHome?: string
}

/**
 * Cache-Wurzel unterhalb des Home: `<home>/cache/...`.
 * Erzeugt **keine** Verzeichnisse. Zwei Aufrufformen wie in der Vorlage:
 * `pmhCachePath('attachments')` oder `pmhCachePath({ pmhHome }, 'attachments')`.
 */
export function pmhCachePath(
  optionsOrSegment?: PmhCachePathOptions | string,
  ...segments: string[]
): string {
  if (typeof optionsOrSegment === 'string' || optionsOrSegment === undefined) {
    return pmhHomePath('cache', ...(optionsOrSegment === undefined ? [] : [optionsOrSegment]), ...segments)
  }
  return join(resolvePmhHome(optionsOrSegment.pmhHome), 'cache', ...segments)
}

/**
 * Anzeigeform eines aufgelösten Home — nie ein absoluter Pfad.
 * Der Default erscheint als `~/.pmh`; ein aus `DSH_HOME` stammender Pfad als
 * `$DSH_HOME`, damit die Herkunft sichtbar bleibt; alles andere als `$PMH_HOME`.
 */
export function homeDisplay(resolvedHome: string): string {
  if (resolvedHome === resolve(defaultPmhHome())) return DEFAULT_PMH_HOME_DISPLAY
  return `$${PMH_HOME_ENV}`
}

/** Anzeigeform des geteilten Agent-Root. */
export function agentsHomeDisplay(resolvedHome: string): string {
  if (resolvedHome === resolve(defaultAgentsHome())) return DEFAULT_AGENTS_HOME_DISPLAY
  return `$${AGENTS_HOME_ENV}`
}

/**
 * Kanonisiert einen Pfad für einen Watcher: `realpath` des tiefsten
 * existierenden Vorfahren plus das fehlende Suffix. Beweist bei fehlendem
 * Suffix, dass der aufgelöste Vorfahre ein *enumerierbares Verzeichnis* ist;
 * Fehler außer `ENOENT` werden weitergereicht, ein regulärer Datei-Vorfahre
 * ergibt `ENOTDIR`.
 */
export async function canonicalizeWatchPath(path: string): Promise<string> {
  const absolute = resolve(expandHomePath(path))
  let current = absolute
  const missing: string[] = []

  for (;;) {
    try {
      const handle = await opendir(current)
      await handle.close()
      return missing.length === 0 ? current : join(current, ...missing)
    }
    catch (error) {
      const code = errorCode(error)
      if (code === 'ENOTDIR') {
        throw withCode(new Error(`ENOTDIR: not a directory: ${current}`), 'ENOTDIR')
      }
      if (code !== 'ENOENT') throw error

      const parent = dirname(current)
      // Wurzel erreicht: der Pfad ist nirgends enumerierbar.
      if (parent === current) {
        throw withCode(new Error(`ENOENT: no such file or directory: ${absolute}`), 'ENOENT')
      }
      missing.unshift(current.slice(parent.length + sep.length))
      current = parent
    }
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function withCode(error: Error, code: string): Error {
  Object.defineProperty(error, 'code', { value: code, enumerable: false })
  return error
}
