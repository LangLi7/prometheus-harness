/**
 * Frontmatter und Aufruf-Schalter einer Fähigkeitsdatei.
 *
 * **Warum das ein eigenes Modul ist.** Die Datei ist die Schnittstelle zum Autor der
 * Fähigkeit: sie entscheidet, was als Name gilt, was als Beschreibung und welche Schalter
 * gelten. Fehler hier sind **Inhaltsfehler**, keine Abstürze — eine kaputte Datei wird
 * gemeldet und übersprungen, damit eine falsche Fähigkeit nicht den ganzen Katalog kostet.
 *
 * @module @prometheus-harness/skill-filesystem/frontmatter
 */

import { isSkillName, type SkillInvocationPolicy } from '@prometheus-harness/skill'
import { parse as parseYaml } from 'yaml'

/** Eine gelesene Fähigkeit ohne Herkunft und Anbieter — die trägt der Aufrufer bei. */
export interface ParsedSkill {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly invocation: SkillInvocationPolicy
  readonly metadata?: Record<string, unknown>
  readonly content: string
}

/** Das Ergebnis einer Prüfung: entweder eine Fähigkeit oder ein benannter Grund. */
export type ParsedSkillResult =
  | { readonly ok: true; readonly skill: ParsedSkill }
  | { readonly ok: false; readonly reason: string }

/**
 * Liest eine Fähigkeitsdatei.
 *
 * Die Regeln, die aus der Vorlage übernommen sind:
 *
 * | Regel | Warum |
 * |---|---|
 * | erste Zeile **genau** `---` | ohne Frontmatter gibt es keinen Namen und keine Beschreibung |
 * | `name` und `description` sind Pflicht und nicht leer | ein Katalog ohne Beschreibung ist wertlos |
 * | Name in Kebab-Case | er ist ein Adressbestandteil, kein Anzeigename |
 * | `disable-model-invocation` und `user-invocable` | die zwei **unabhängigen** Schalter |
 * | alte Schlüssel (`disableModelInvocation`, `modelInvocable`) werden **abgelehnt** | sie sehen richtig aus und wirken nicht — genau der stille Ausfall, den man vermeiden will |
 * | `metadata` bleibt ein Objekt, unverändert | anbieterspezifische Angaben gehören nicht in das Domänenmodell |
 *
 * @param raw - der vollständige Dateitext
 * @returns die Fähigkeit oder ein Grund; wirft nur bei einem unlesbaren YAML-Dokument nicht
 */
export function parseSkillText(raw: string): ParsedSkillResult {
  const frontmatter = splitFrontmatter(raw)
  if (frontmatter === undefined) {
    return { ok: false, reason: 'fehlendes YAML-Frontmatter' }
  }

  let data: unknown
  try {
    data = parseYaml(frontmatter.yaml)
  } catch (error) {
    return { ok: false, reason: `ungültiges YAML-Frontmatter: ${describe(error)}` }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, reason: 'Frontmatter ist kein Objekt' }
  }
  const fields = data as Record<string, unknown>

  const name = nonEmptyString(fields['name'])
  const description = nonEmptyString(fields['description'])
  if (name === undefined || description === undefined) {
    return { ok: false, reason: 'Frontmatter verlangt name und description' }
  }
  if (!isSkillName(name)) {
    return { ok: false, reason: `ungültiger Fähigkeitsname "${name}"` }
  }

  let invocation: SkillInvocationPolicy
  try {
    invocation = parseInvocationPolicy(fields)
  } catch (error) {
    return { ok: false, reason: `ungültige Aufruf-Angabe im Frontmatter: ${describe(error)}` }
  }

  const result: ParsedSkill = {
    name,
    description,
    ...optionalString(fields, 'whenToUse'),
    invocation,
    ...optionalMetadata(fields),
    content: frontmatter.body.trim(),
  }
  return { ok: true, skill: result }
}

interface FrontmatterParts {
  readonly yaml: string
  readonly body: string
}

/**
 * Zerlegt `---` / YAML / `---` / Rumpf.
 *
 * Bewusst zeilenweise und ohne Regex: eine Regex über eine große Datei ist der teurere und
 * schwerer nachvollziehbare Weg, und die Regel ist einfach genug für eine Schleife.
 */
function splitFrontmatter(raw: string): FrontmatterParts | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  const firstLine = raw.slice(0, firstLineEnd).replace(/\r$/, '')
  if (firstLine !== '---') return undefined

  const start = firstLineEnd + 1
  let lineStart = start
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    const line = raw.slice(lineStart, lineEnd).replace(/\r$/, '')
    if (line === '---') {
      return {
        yaml: raw.slice(start, lineStart),
        body: raw.slice(nextNewline < 0 ? raw.length : nextNewline + 1),
      }
    }
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
  return undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalString(data: Record<string, unknown>, key: string): { [K in typeof key]?: string } {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? { [key]: value } : {}
}

function optionalMetadata(data: Record<string, unknown>): { metadata?: Record<string, unknown> } {
  const value = data['metadata']
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return { metadata: value as Record<string, unknown> }
  }
  return {}
}

/**
 * Die zwei Schalter, mit den Vertretern der Vorlage.
 *
 * `disable-model-invocation: true` heißt „nur der Mensch darf sie aufrufen";
 * `user-invocable: false` heißt „nur das Modell darf sie aufrufen". Fehlt ein Feld, ist der
 * Weg erlaubt.
 */
function parseInvocationPolicy(data: Record<string, unknown>): SkillInvocationPolicy {
  rejectLegacyKey(data, 'disableModelInvocation', 'disable-model-invocation')
  rejectLegacyKey(data, 'modelInvocable', 'disable-model-invocation')
  rejectLegacyKey(data, 'userInvocable', 'user-invocable')
  const disableModelInvocation = frontmatterBoolean(data, 'disable-model-invocation')
  const userInvocable = frontmatterBoolean(data, 'user-invocable')
  return {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  }
}

function rejectLegacyKey(data: Record<string, unknown>, legacy: string, canonical: string): void {
  if (Object.hasOwn(data, legacy)) {
    throw new Error(`Feld "${legacy}" wird nicht unterstützt; benutze "${canonical}"`)
  }
}

/**
 * Liest einen Wahrheitswert so, wie YAML ihn schreiben kann.
 *
 * YAML 1.2 kennt `true`/`false`; ältere Autoren schreiben `yes`, `on`, `1`. Alle werden
 * angenommen, **weil sie im Bestand vorkommen** — aber ein anderer Wert ist ein Fehler und
 * keine stillschweigende Vorgabe.
 */
function frontmatterBoolean(data: Record<string, unknown>, key: string): boolean | undefined {
  if (!Object.hasOwn(data, key)) return undefined
  const value = data[key]
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    switch (value.toLowerCase()) {
      case 'true':
      case 'yes':
      case 'on':
        return true
      case 'false':
      case 'no':
      case 'off':
        return false
      default:
        break
    }
  }
  throw new TypeError(`Feld "${key}" muss ein Wahrheitswert sein`)
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
