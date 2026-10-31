/**
 * `@prometheus-harness/skill-marketplace/adapter` — Claude-Komponenten nutzbar machen.
 *
 * **Das Problem.** Ein Claude-Plugin bringt vier Komponenten mit: Skills, Commands,
 * Agents und Hooks. Der Harness kennt nur Skills. Bisher wurden Commands und Agents
 * mitkopiert und waren damit toter Ballast — die README sagte das auch so.
 *
 * **Die Übersetzung.** Commands und Agents werden zu **Skills**:
 *
 * | Claude | Prometheus | Warum |
 * |---|---|---|
 * | `commands/status.md` | `SKILL.md` mit `name: <plugin>-status` | Ein Command ist ein Prompt mit Beschreibung — genau die Form einer Fähigkeit. |
 * | `agents/reviewer.md` | `SKILL.md` mit `name: <plugin>-agent-reviewer` | Eine Agenten-Rolle ist eine Anweisung. Fehlt die Isolation, sagt der Rumpf, wann ein Subagent nötig ist. |
 *
 * **Was nicht übersetzt wird.** Hooks brauchen einen Laufzeit-Haken vor/nach
 * Werkzeugaufrufen, LSP einen Sprachserver-Client. Beides gibt es im Harness
 * nicht; der Adapter **meldet** sie, statt sie stillschweigend zu verschlucken.
 *
 * @module @prometheus-harness/skill-marketplace/adapter
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { discoverPlugin, parsePluginManifest } from './manifest.ts'
import { sanitizeSkillName } from './names.ts'
import type { PluginManifest } from './types.ts'

/** Eine übersetzte Komponente. */
export interface AdaptedSkill {
  readonly kind: 'command' | 'agent'
  readonly name: string
  /** Pfad im Plugin, aus dem sie entstand. */
  readonly source: string
}

/** Ergebnis einerAdapterung. */
export interface AdapterResult {
  readonly adapted: readonly AdaptedSkill[]
  /** Was nicht übersetzt werden konnte. */
  readonly skipped: ReadonlyArray<{ readonly path: string; readonly reason: string }>
  /** Komponenten, für die der Harness keine Laufzeit hat. */
  readonly unsupported: readonly ('hooks' | 'lsp')[]
  readonly warnings: readonly string[]
}

/** Optionen derAdapterung. */
export interface AdaptOptions {
  /** Zielwurzel; Vorgabe `<pluginRoot>/../../..` ist falsch — immer ausdrücklich setzen. */
  readonly skillsRoot: string
  /** Vorhandene Ziele überschreiben; Vorgabe `true`, weil das Plugin sie besitzt. */
  readonly overwrite?: boolean
  /** Name des Plugins, wenn kein Manifest vorliegt. */
  readonly pluginName?: string
}

/**
 * Übersetzt Commands und Agents eines Plugin-Verzeichnisses in Skills.
 *
 * @param pluginRoot - installiertes Plugin
 * @param pluginId - `name@marketplace`, für Herkunft und Namen
 * @param options - Zielwurzel und Überschreibschalter
 * @returns was entstand und was fehlt
 */
export async function adaptPlugin(
  pluginRoot: string,
  pluginId: string,
  options: AdaptOptions,
): Promise<AdapterResult> {
  const manifest = await readManifest(pluginRoot)
  const components = await discoverPlugin(pluginRoot, manifest)
  const pluginName = sanitizeSkillName(options.pluginName ?? manifest?.name ?? pluginId.split('@')[0] ?? 'plugin')
  const adapted: AdaptedSkill[] = []
  const skipped: Array<{ path: string; reason: string }> = []
  const warnings: string[] = []

  for (const path of components.commands) {
    const result = await adaptFile(pluginRoot, path, {
      kind: 'command',
      pluginName,
      skillsRoot: options.skillsRoot,
      overwrite: options.overwrite ?? true,
    })
    if (result === undefined) skipped.push({ path, reason: 'nicht lesbar oder ohne Inhalt' })
    else adapted.push(result)
  }

  for (const path of components.agents) {
    const result = await adaptFile(pluginRoot, path, {
      kind: 'agent',
      pluginName,
      skillsRoot: options.skillsRoot,
      overwrite: options.overwrite ?? true,
    })
    if (result === undefined) skipped.push({ path, reason: 'nicht lesbar oder ohne Inhalt' })
    else adapted.push(result)
  }

  const unsupported: Array<'hooks' | 'lsp'> = []
  if (components.hooks.length > 0) unsupported.push('hooks')
  if (components.lsp.length > 0) unsupported.push('lsp')
  if (components.hooks.length > 0) {
    warnings.push(
      'Hooks sind vorhanden, laufen aber nur nach ausdrücklicher Freigabe: '
      + `\`pmh plugin hooks enable ${pluginId}\` (wirksam nach einem Neustart).`,
    )
  }
  if (components.lsp.length > 0) {
    warnings.push('LSP-Konfiguration wird nicht ausgeführt — der Harness hat keinen Sprachserver-Client.')
  }
  return { adapted, skipped, unsupported, warnings }
}

/**
 * Übersetzt eine einzelne Markdown-Datei.
 *
 * @param root - Plugin-Wurzel
 * @param relativePath - Pfad der Datei
 * @param options - Art, Plugin-Name, Zielwurzel
 * @returns die übersetzte Komponente, oder `undefined`
 */
async function adaptFile(
  root: string,
  relativePath: string,
  options: {
    kind: 'command' | 'agent'
    pluginName: string
    skillsRoot: string
    overwrite: boolean
  },
): Promise<AdaptedSkill | undefined> {
  let text: string
  try {
    text = await readFile(join(root, relativePath), { encoding: 'utf8' })
  } catch {
    return undefined
  }
  const { frontmatter, body } = split(text)
  const base = basename(relativePath).replace(/\.md$/i, '')
  const rawName = options.kind === 'command' ? `${options.pluginName}-${base}` : `${options.pluginName}-agent-${base}`
  const name = sanitizeSkillName(rawName).slice(0, 64).replace(/-+$/, '')
  if (name === '') return undefined

  const description = firstLine(frontmatter['description']) ?? firstLine(body) ?? `${options.kind} from ${options.pluginName}`
  const target = join(options.skillsRoot, name)
  if (options.overwrite !== false) await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })

  const preface = options.kind === 'agent'
    ? 'Apply these agent instructions when this role is requested. Delegate to a subagent when the task needs isolation.\n\n'
    : ''
  const argumentHint = firstLine(frontmatter['argument-hint'])
  const hint = argumentHint === undefined ? '' : `\nArgument hint: ${argumentHint}\n`
  const content = [
    '---',
    `name: ${name}`,
    `description: ${escapeYaml(description)}`,
    '---',
    '',
    preface + body.trim(),
    hint,
    '',
  ].join('\n')
  await writeFile(join(target, 'SKILL.md'), content, { encoding: 'utf8' })
  return { kind: options.kind, name, source: relativePath }
}

/** Zerlegt Frontmatter und Rumpf. */
function split(text: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (match === null) return { frontmatter: {}, body: text }
  let frontmatter: Record<string, unknown> = {}
  try {
    const parsed: unknown = parseYaml(match[1] ?? '')
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>
    }
  } catch {
    // Ein kaputtes Frontmatter macht den Command nicht unbrauchbar; der Rumpf zählt.
  }
  return { frontmatter, body: text.slice(match[0].length) }
}

function firstLine(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const line = value.split(/\r?\n/).map((part) => part.trim()).find((part) => part !== '')
  return line === undefined || line === '' ? undefined : line
}

function escapeYaml(value: string): string {
  return /[:#{}[\],&*?|<>=!%@`]/.test(value) ? JSON.stringify(value) : value
}

async function readManifest(root: string): Promise<PluginManifest | undefined> {
  try {
    const text = await readFile(join(root, '.claude-plugin', 'plugin.json'), { encoding: 'utf8' })
    return parsePluginManifest(text)
  } catch {
    return undefined
  }
}
