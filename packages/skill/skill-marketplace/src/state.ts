/**
 * `@prometheus-harness/skill-marketplace/state` — der Installationszustand.
 *
 * **Warum eine eigene Datei und keine Ableitung aus dem Verzeichnisbaum.** Was
 * installiert ist, woher es kam und wie der Sicherheitslauf ausging, lässt sich
 * nicht aus Dateinamen rekonstruieren. Der Zustand ist die einzige Stelle, die
 * das weiß; `list` liest ihn, `remove` schreibt ihn.
 *
 * **Warum atomar geschrieben wird.** Ein Abbruch mitten im Schreiben darf keinen
 * halben Zustand hinterlassen: sonst ist nach einem Stromausfall ein Plugin
 * „installiert“, dessen Verzeichnis fehlt. Geschrieben wird in eine
 * Nachbardatei, dann umbenannt.
 *
 * @module @prometheus-harness/skill-marketplace/state
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { resolvePmhHome } from '@prometheus-harness/home-paths'

import { MarketplaceError, type MarketplaceState } from './types.ts'

/** Der leere Zustand. */
export function emptyState(): MarketplaceState {
  return { version: 1, marketplaces: {}, plugins: {}, skills: {} }
}

/**
 * Pfad der Zustandsdatei.
 *
 * @param home - Harness-Home; Vorgabe `resolvePmhHome()`
 * @returns der Pfad
 */
export function statePath(home?: string): string {
  return join(home ?? resolvePmhHome(), 'marketplaces', 'state.json')
}

/**
 * Liest den Zustand; eine fehlende Datei ist der leere Zustand.
 *
 * @param home - Harness-Home
 * @returns der Zustand
 * @throws MarketplaceError bei kaputtem JSON
 */
export async function readState(home?: string): Promise<MarketplaceState> {
  const path = statePath(home)
  let text: string
  try {
    text = await readFile(path, { encoding: 'utf8' })
  } catch {
    return emptyState()
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new MarketplaceError(`Zustandsdatei ist kein gültiges JSON (${path}): ${messageOf(error)}`)
  }
  if (typeof data !== 'object' || data === null) throw new MarketplaceError(`Zustandsdatei hat keine Form: ${path}`)
  const record = data as Record<string, unknown>
  return {
    version: 1,
    marketplaces: asRecord(record['marketplaces']),
    plugins: asRecord(record['plugins']),
    skills: asRecord(record['skills']),
  } as MarketplaceState
}

/**
 * Schreibt den Zustand atomar.
 *
 * @param state - der Zustand
 * @param home - Harness-Home
 */
export async function writeState(state: MarketplaceState, home?: string): Promise<void> {
  const path = statePath(home)
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8' })
  try {
    await rename(temporary, path)
  } catch {
    // Windows kann ein vorhandenes Ziel beim Umbenennen ablehnen; dann ersetzen.
    await rm(path, { force: true })
    await rename(temporary, path)
  }
}

/**
 * Ändert den Zustand unter einer Sperre im Prozess.
 *
 * @param home - Harness-Home
 * @param change - die Änderung; liefert den neuen Zustand
 * @returns der geschriebene Zustand
 */
export async function mutateState(
  home: string | undefined,
  change: (state: MarketplaceState) => MarketplaceState,
): Promise<MarketplaceState> {
  const current = await readState(home)
  const next = change(current)
  await writeState(next, home)
  return next
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
