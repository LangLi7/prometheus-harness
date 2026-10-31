/**
 * Der gespeicherte Vault und seine Prüfung.
 *
 * Ablage: `$DSH_HOME/world/obsidian.json` mit `{ "vault": "…" }`. `DSH_HOME`
 * kommt aus der Umgebung, sonst `~/.dsh`. Geschrieben wird nur auf ausdrückliche
 * Anfrage (`POST /vault`), nie beim Lesen.
 *
 * @module @prometheus-harness/world-obsidian-provider/config
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** Umgebung als reine Lesesicht — prüfbar ohne `process.env`-Mutation. */
export type HomeEnv = Readonly<Record<string, string | undefined>>

/** Unterordner im Harness-Home. */
export const CONFIG_UNTERORDNER = 'world'

/** Dateiname der Vault-Ablage. */
export const CONFIG_DATEINAME = 'obsidian.json'

/**
 * Das Harness-Home: `DSH_HOME` (nicht leer), sonst `~/.dsh`.
 *
 * @param env - die Umgebung
 * @returns der absolute Pfad
 */
export function dshHome(env: HomeEnv = process.env): string {
  const roh = env['DSH_HOME']
  return roh !== undefined && roh.trim() !== '' ? resolve(roh.trim()) : join(homedir(), '.dsh')
}

/**
 * Der Pfad der Vault-Ablage.
 *
 * @param env - die Umgebung
 * @returns `…/world/obsidian.json`
 */
export function configPfad(env: HomeEnv = process.env): string {
  return join(dshHome(env), CONFIG_UNTERORDNER, CONFIG_DATEINAME)
}

/** Die gespeicherte Einstellung. */
export interface VaultConfig {
  readonly vault: string
}

/**
 * Liest die gespeicherte Einstellung.
 *
 * Fehlende oder kaputte Datei ist kein Fehler, sondern „nichts gespeichert".
 *
 * @param env - die Umgebung
 * @returns die Einstellung oder `undefined`
 */
export function leseVaultConfig(env: HomeEnv = process.env): VaultConfig | undefined {
  try {
    const roh: unknown = JSON.parse(readFileSync(configPfad(env), 'utf8'))
    if (roh === null || typeof roh !== 'object') return undefined
    const vault = (roh as { vault?: unknown }).vault
    return typeof vault === 'string' && vault.trim() !== '' ? { vault: resolve(vault) } : undefined
  } catch {
    return undefined
  }
}

/**
 * Schreibt die Einstellung und legt das Verzeichnis an.
 *
 * @param vault - der geprüfte Vault-Pfad
 * @param env - die Umgebung
 * @returns der Pfad der geschriebenen Datei
 */
export function schreibeVaultConfig(vault: string, env: HomeEnv = process.env): string {
  const datei = configPfad(env)
  mkdirSync(dirname(datei), { recursive: true })
  writeFileSync(datei, `${JSON.stringify({ vault }, null, 2)}\n`, 'utf8')
  return datei
}

/** Ein abgelehnter Vault-Pfad samt HTTP-Status. */
export interface VaultFehler {
  readonly ok: false
  readonly status: 400 | 404
  readonly code: string
  readonly message: string
}

/** Ergebnis der Prüfung. */
export type VaultErgebnis = { readonly ok: true; readonly vault: string } | VaultFehler

/**
 * Prüft einen vom Aufrufer genannten Vault-Pfad.
 *
 * Gefordert: nicht leer, keine `..`-Stufe, absolut, vorhanden, ein Verzeichnis.
 * Der zurückgegebene Pfad ist kanonisch (`resolve`).
 *
 * @param roh - der rohe Wert aus dem Rumpf
 * @returns das Ergebnis
 */
export function pruefeVaultPfad(roh: unknown): VaultErgebnis {
  if (typeof roh !== 'string' || roh.trim() === '') {
    return { ok: false, status: 400, code: 'ungueltig', message: 'Erwartet wird ein nicht-leerer Pfad.' }
  }
  const text = roh.trim()
  if (/[\u0000-\u001f\u007f]/u.test(text)) {
    return { ok: false, status: 400, code: 'ungueltig', message: 'Der Pfad enthält Steuerzeichen.' }
  }
  if (text.split(/[\\/]/u).includes('..')) {
    return { ok: false, status: 400, code: 'rueckweg', message: 'Der Pfad darf kein ".." enthalten.' }
  }
  if (!isAbsolute(text)) {
    return { ok: false, status: 400, code: 'nicht-absolut', message: `Der Pfad ist nicht absolut: ${text}` }
  }
  if (!existsSync(text)) {
    return { ok: false, status: 404, code: 'nicht-gefunden', message: `Der Pfad existiert nicht: ${text}` }
  }
  const werte = statSync(text, { throwIfNoEntry: false })
  if (werte === undefined) {
    return { ok: false, status: 404, code: 'nicht-gefunden', message: `Der Pfad existiert nicht: ${text}` }
  }
  if (!werte.isDirectory()) {
    return { ok: false, status: 400, code: 'kein-verzeichnis', message: `Der Pfad ist kein Verzeichnis: ${text}` }
  }
  return { ok: true, vault: resolve(text) }
}
