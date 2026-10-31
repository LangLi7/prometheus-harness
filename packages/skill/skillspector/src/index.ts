/**
 * `@prometheus-harness/skillspector` — der Scanner.
 *
 * **Was hier passiert.** Dateien hinein, Befunde hinaus. Der Scanner führt die
 * Regeln aus `rules.ts` aus, unterdrückt Baseline-Treffer, rechnet den Score nach
 * dem Modell von NVIDIA SkillSpector und liefert einen Bericht, den Gate, CLI und
 * SARIF-Ausgabe gemeinsam lesen.
 *
 * **Das Risikomodell** (unverändert übernommen, damit Zahlen vergleichbar bleiben):
 *
 * | Schweregrad | Punkte |
 * |---|---|
 * | CRITICAL | +50 |
 * | HIGH | +25 |
 * | MEDIUM | +10 |
 * | LOW | +5 |
 *
 * Ausführbare Bestandteile multiplizieren mit 1,3. Der Score ist bei 100 gedeckelt.
 * `0–20 → LOW/SAFE`, `21–50 → MEDIUM/CAUTION`, `51+ → DO_NOT_INSTALL`.
 *
 * **Warum der Scanner nichts ausführt.** Er liest Text. Kein `eval`, kein
 * Subprozess, kein Netz. Ein Sicherheitswerkzeug, das den verdächtigen Code startet,
 * ist kein Sicherheitswerkzeug.
 *
 * @module @prometheus-harness/skillspector
 */

import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'

import { parse as parseYaml } from 'yaml'

import { RULES, type RuleHit } from './rules.ts'
import {
  componentTypeOf,
  digestOf,
  fingerprintOf,
  isExecutable,
  looksBinary,
  normalizeEvidence,
} from './text.ts'
import type {
  Baseline,
  BaselineEntry,
  BaselineRule,
  Coverage,
  Finding,
  GateDecision,
  Recommendation,
  RiskAssessment,
  ScanComponent,
  ScanFile,
  ScanMetadata,
  ScanOptions,
  ScanReport,
  ScannedSkill,
  Severity,
  SkippedFile,
} from './types.ts'

export * from './types.ts'
export * from './output.ts'
export { RULES, RULES_BY_ID, RULE_IDS } from './rules.ts'
export type { Rule, RuleContext, RuleHit } from './rules.ts'

/** Fassung des Scanners; erscheint im Bericht. */
export const SCANNER_VERSION = '0.1.0'

/** Anzeigename des Scanners. */
export const SCANNER_NAME = 'pmh-skillspector'

/** Punkte je Schweregrad — das Modell des Vorbilds. */
const SEVERITY_POINTS: Readonly<Record<Severity, number>> = {
  CRITICAL: 50,
  HIGH: 25,
  MEDIUM: 10,
  LOW: 5,
}

/** Rangfolge für die Sortierung der Befunde. */
const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

/** Höchstgröße einer Datei, die geprüft wird. */
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024

/** Verzeichnisse, die nie mitgeprüft werden. */
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build'])

/**
 * Prüft eine Dateimenge und liefert einen Bericht.
 *
 * @param files - die zu prüfenden Dateien
 * @param options - Name, Quelle, Ausschlüsse, Baseline
 * @returns der Bericht
 */
export function scanFiles(
  files: readonly ScanFile[],
  options: ScanOptions = {},
): ScanReport {
  const excluded = options.exclude ?? []
  const { included, skipped } = partitionFiles(files, excluded)
  const prepared = included.map((file) => ({
    ...file,
    executable: file.executable ?? isExecutable(file.path, file.text),
  }))

  const rawFindings: Finding[] = []
  for (const rule of RULES) {
    if (rule.scope === 'skill') {
      const first = prepared[0]
      if (first === undefined) continue
      for (const hit of rule.find({ file: first, files: prepared })) {
        rawFindings.push(toFinding(rule.id, rule.category, rule.severity, rule.confidence, hit, first.path))
      }
      continue
    }
    for (const file of prepared) {
      for (const hit of rule.find({ file, files: prepared })) {
        rawFindings.push(toFinding(rule.id, rule.category, rule.severity, rule.confidence, hit, file.path))
      }
    }
  }

  const baseline = options.baseline
  const baselineFile = baseline === undefined ? [] : baseline.entries
  const baselineRules = baseline?.rules ?? []
  const kept: Finding[] = []
  let suppressed = 0
  for (const finding of rawFindings) {
    if (isSuppressed(finding, baselineFile, baselineRules)) suppressed += 1
    else kept.push(finding)
  }

  const issues = dedupeAndSort(kept)
  const components: ScanComponent[] = prepared.map((file) => ({
    path: file.path,
    type: componentTypeOf(file.path),
    lines: file.text.length === 0 ? 0 : file.text.split('\n').length,
    executable: file.executable === true,
    sizeBytes: Buffer.byteLength(file.text, 'utf8'),
  }))
  const executableComponents = components.filter((component) => component.executable).length

  const coverage: Coverage = {
    complete: skipped.length === 0 && excluded.length === 0,
    scannedFiles: prepared.length,
    skippedFiles: skipped,
  }

  const risk = assess(issues, executableComponents, coverage)
  const skill: ScannedSkill = {
    name: options.name ?? nameFromFiles(prepared),
    source: options.source ?? 'inline',
    scannedAt: (options.now ?? new Date()).toISOString(),
    digest: digestOf(prepared),
  }
  const metadata: ScanMetadata = {
    scanner: SCANNER_NAME,
    version: SCANNER_VERSION,
    llmRequested: false,
    llmAvailable: false,
    executableComponents,
    ...(baseline === undefined ? {} : { baseline: options.baselineLabel ?? 'baseline' }),
  }

  return {
    skill,
    risk,
    components,
    issues,
    suppressed,
    coverage,
    metadata,
  }
}

/**
 * Prüft ein Verzeichnis.
 *
 * @param directory - absolute Wurzel
 * @param options - Name, Quelle, Ausschlüsse, Baseline
 * @returns der Bericht
 */
export async function scanDirectory(
  directory: string,
  options: ScanOptions = {},
): Promise<ScanReport> {
  const root = resolve(directory)
  const { files, skipped } = await readTree(root, options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES, options.exclude ?? [])
  const report = scanFiles(files, {
    ...options,
    // Ein `SKILL.md`-Frontmatter gewinnt gegen den Verzeichnisnamen; ohne Manifest
    // ist der Verzeichnisname die einzige ehrliche Bezeichnung.
    ...(options.name === undefined ? {} : { name: options.name }),
    source: options.source ?? root,
  })
  const skippedAll = [...skipped, ...report.coverage.skippedFiles]
  const complete = skippedAll.length === 0 && (options.exclude ?? []).length === 0
  const coverage: Coverage = {
    complete,
    scannedFiles: report.coverage.scannedFiles,
    skippedFiles: skippedAll,
  }
  const name = options.name ?? (report.skill.name === 'skill' ? basename(root) : report.skill.name)
  return {
    ...report,
    skill: { ...report.skill, name },
    coverage,
    risk: assess(report.issues, report.metadata.executableComponents, coverage),
  }
}

/**
 * Prüft eine Quelle: Verzeichnis, Datei oder Dateimenge.
 *
 * @param source - die Quelle
 * @param options - Scanoptionen
 * @returns der Bericht
 */
export async function scanSkill(
  source:
    | { readonly kind: 'directory'; readonly path: string }
    | { readonly kind: 'file'; readonly path: string }
    | { readonly kind: 'files'; readonly files: readonly ScanFile[] },
  options: ScanOptions = {},
): Promise<ScanReport> {
  if (source.kind === 'files') return scanFiles(source.files, options)
  if (source.kind === 'file') {
    const text = await readFile(source.path, { encoding: 'utf8' })
    return scanFiles([{ path: basename(source.path), text }], {
      ...options,
      name: options.name ?? basename(source.path).replace(/\.[^.]+$/, ''),
      source: options.source ?? resolve(source.path),
    })
  }
  return scanDirectory(source.path, options)
}

/**
 * Die Gate-Politik.
 *
 * `strict` bildet die Empfehlung des Vorbilds eins zu eins ab (`HIGH` blockt).
 * `balanced` unterscheidet **Absicht** von **Fähigkeit**: eine Anweisung, die den
 * Agenten umlenkt, blockt weiterhin; ein `eval` in einem Entwicklungswerkzeug
 * warnt nur. Ohne diese Unterscheidung blockiert jeder Scanner, der
 * Werkzeuge prüft, die selbst Werkzeuge bauen — und wird umgangen.
 */
export type GatePolicy = 'strict' | 'balanced'

/** Kategorien, die in `balanced` schon bei `HIGH` blocken. */
const INTENT_CATEGORIES: ReadonlySet<Finding['category']> = new Set([
  'prompt-injection',
  'anti-refusal',
  'data-exfiltration',
  'supply-chain',
  'memory-poisoning',
  'trigger-abuse',
  'rogue-agent',
  'system-prompt-leakage',
  'taint-tracking',
])

/**
 * Leitet aus einem Bericht die Gate-Entscheidung ab.
 *
 * @param report - der Bericht
 * @param policy - `strict` (Vorbild) oder `balanced` (Absicht blockt, Fähigkeit warnt)
 * @returns die Entscheidung samt Begründung
 */
export function gate(report: ScanReport, policy: GatePolicy = 'strict'): GateDecision {
  const recommendation = report.risk.recommendation
  const blocking = report.issues.some(
    (issue) =>
      issue.severity === 'CRITICAL'
      || (policy === 'strict' && issue.severity === 'HIGH')
      || (policy === 'balanced' && issue.severity === 'HIGH' && INTENT_CATEGORIES.has(issue.category)),
  )
  const action: GateDecision['action'] = blocking
    ? 'block'
    : recommendation === 'SAFE'
      ? 'allow'
      : 'warn'
  const worst = report.issues[0]
  const reason = blocking
    ? `nicht installieren (Score ${report.risk.score}/100)${worst === undefined ? '' : `: ${worst.id} ${worst.message}`}`
    : action === 'warn'
      ? `prüfen (Score ${report.risk.score}/100)${worst === undefined ? '' : `: ${worst.id} ${worst.message}`}`
      : `unauffällig (Score ${report.risk.score}/100)`
  return { allowed: action !== 'block', action, report, reason }
}

/**
 * Baut eine Baseline aus einem Bericht.
 *
 * @param report - der Bericht
 * @param reason - optionale Begründung für alle Einträge
 * @returns die Baseline
 */
export function baselineFrom(report: ScanReport, reason?: string): Baseline {
  const acceptedAt = new Date().toISOString()
  const entries: BaselineEntry[] = report.issues.map((issue) => ({
    fingerprint: issue.fingerprint,
    ruleId: issue.id,
    file: issue.file,
    ...(reason === undefined ? {} : { reason }),
    acceptedAt,
  }))
  return { version: 1, scanner: SCANNER_NAME, entries }
}

/**
 * Liest eine Baseline aus YAML oder JSON.
 *
 * @param text - Dateiinhalt
 * @returns die Baseline
 * @throws Error bei falscher Form — eine kaputte Baseline darf nicht stillschweigend alles unterdrücken
 */
export function parseBaseline(text: string): Baseline {
  const data: unknown = parseYaml(text)
  if (typeof data !== 'object' || data === null) throw new Error('Baseline ist kein Objekt')
  const record = data as Record<string, unknown>
  if (record['version'] !== 1) throw new Error('Baseline braucht version: 1')
  if (record['scanner'] !== SCANNER_NAME) throw new Error(`Baseline gehört nicht zu ${SCANNER_NAME}`)
  const rawEntries = record['entries']
  if (!Array.isArray(rawEntries)) throw new Error('Baseline braucht entries')
  const entries: BaselineEntry[] = []
  for (const raw of rawEntries) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Record<string, unknown>
    const fingerprint = entry['fingerprint']
    const ruleId = entry['ruleId']
    const file = entry['file']
    if (typeof fingerprint !== 'string' || typeof ruleId !== 'string' || typeof file !== 'string') continue
    entries.push({
      fingerprint,
      ruleId,
      file,
      ...(typeof entry['reason'] === 'string' ? { reason: entry['reason'] } : {}),
      ...(typeof entry['acceptedAt'] === 'string' ? { acceptedAt: entry['acceptedAt'] } : {}),
    })
  }
  const rawRules = record['rules']
  const rules: BaselineRule[] = []
  if (Array.isArray(rawRules)) {
    for (const raw of rawRules) {
      if (typeof raw !== 'object' || raw === null) continue
      const rule = raw as Record<string, unknown>
      rules.push({
        ...(typeof rule['ruleId'] === 'string' ? { ruleId: rule['ruleId'] } : {}),
        ...(typeof rule['path'] === 'string' ? { path: rule['path'] } : {}),
        ...(typeof rule['message'] === 'string' ? { message: rule['message'] } : {}),
      })
    }
  }
  return { version: 1, scanner: SCANNER_NAME, entries, ...(rules.length === 0 ? {} : { rules }) }
}

/**
 * Schreibt eine Baseline als YAML.
 *
 * @param baseline - die Baseline
 * @returns YAML-Text
 */
export function serializeBaseline(baseline: Baseline): string {
  const head = `# SkillSpector-Baseline (${SCANNER_NAME}).\n# Akzeptierte Befunde werden beim nächsten Lauf unterdrückt.\n`
  const body = JSON.stringify(baseline, null, 2)
  return `${head}${body}\n`
}

// ---------------------------------------------------------------------------
// Interna
// ---------------------------------------------------------------------------

function toFinding(
  ruleId: string,
  category: Finding['category'],
  severity: Severity,
  baseConfidence: number,
  hit: RuleHit,
  fallbackFile: string,
): Finding {
  const file = hit.file ?? fallbackFile
  return {
    id: ruleId,
    category,
    severity,
    confidence: hit.confidence ?? baseConfidence,
    message: hit.message ?? RULES.find((rule) => rule.id === ruleId)?.title ?? ruleId,
    file,
    line: hit.line,
    evidence: normalizeEvidence(hit.evidence),
    fingerprint: fingerprintOf(ruleId, file, normalizeEvidence(hit.evidence)),
  }
}

function isSuppressed(
  finding: Finding,
  entries: readonly BaselineEntry[],
  rules: readonly BaselineRule[],
): boolean {
  if (entries.some((entry) => entry.fingerprint === finding.fingerprint)) return true
  for (const rule of rules) {
    if (rule.ruleId !== undefined && rule.ruleId !== finding.id) continue
    if (rule.path !== undefined && !globMatch(rule.path, finding.file)) continue
    if (rule.message !== undefined && !finding.message.toLowerCase().includes(rule.message.toLowerCase())) continue
    if (rule.ruleId === undefined && rule.path === undefined && rule.message === undefined) continue
    return true
  }
  return false
}

function globMatch(glob: string, path: string): boolean {
  let pattern = '^'
  for (const char of glob) {
    if (char === '*') pattern += '.*'
    else if (char === '?') pattern += '.'
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`${pattern}$`).test(path)
}

function dedupeAndSort(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>()
  const unique: Finding[] = []
  for (const finding of findings) {
    const key = `${finding.id}\u0000${finding.file}\u0000${finding.fingerprint}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(finding)
  }
  return unique.sort((left, right) => {
    const severity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    if (severity !== 0) return severity
    const file = left.file.localeCompare(right.file)
    if (file !== 0) return file
    return left.line - right.line
  })
}

function assess(
  issues: readonly Finding[],
  executableComponents: number,
  coverage: Coverage,
): RiskAssessment {
  let points = 0
  for (const issue of issues) points += SEVERITY_POINTS[issue.severity]
  const score = Math.min(100, Math.round(executableComponents > 0 ? points * 1.3 : points))
  const severity: Severity = score <= 20 ? 'LOW' : score <= 50 ? 'MEDIUM' : score <= 80 ? 'HIGH' : 'CRITICAL'
  // Unvollständige Abdeckung darf nie als „sauber“ gelesen werden.
  const recommendation: Recommendation =
    severity === 'LOW' ? (coverage.complete ? 'SAFE' : 'CAUTION') : severity === 'MEDIUM' ? 'CAUTION' : 'DO_NOT_INSTALL'
  return { score, severity, recommendation }
}

function nameFromFiles(files: readonly ScanFile[]): string {
  const manifest = files.find((file) => file.path === 'SKILL.md' || file.path.endsWith('/SKILL.md'))
  if (manifest !== undefined) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(manifest.text)
    if (match !== null) {
      try {
        const data: unknown = parseYaml(match[1] ?? '')
        if (typeof data === 'object' && data !== null) {
          const name = (data as Record<string, unknown>)['name']
          if (typeof name === 'string' && name.trim() !== '') return name.trim()
        }
      } catch {
        // Ein kaputtes Frontmatter ist ein Befund, kein Grund ohne Namen zu bleiben.
      }
    }
    const parts = manifest.path.split('/')
    return parts.length > 1 ? (parts[parts.length - 2] ?? 'skill') : 'skill'
  }
  return 'skill'
}

function partitionFiles(
  files: readonly ScanFile[],
  exclude: readonly string[],
): { included: ScanFile[]; skipped: SkippedFile[] } {
  const included: ScanFile[] = []
  const skipped: SkippedFile[] = []
  for (const file of files) {
    if (file.path === 'SKILL.md' || file.path.endsWith('/SKILL.md')) {
      // Der Anweisungsträger wird nie ausgeschlossen; das Vorbild lehnt solche Muster ab.
      included.push(file)
      continue
    }
    if (exclude.some((pattern) => globMatch(pattern, file.path))) continue
    if (looksBinary(file.text)) {
      skipped.push({ path: file.path, reason: 'binary' })
      continue
    }
    included.push(file)
  }
  return { included, skipped }
}

async function readTree(
  root: string,
  maxFileBytes: number,
  exclude: readonly string[],
): Promise<{ files: ScanFile[]; skipped: SkippedFile[] }> {
  const files: ScanFile[] = []
  const skipped: SkippedFile[] = []
  const rootReal = await realpath(root).catch(() => root)

  const walk = async (directory: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      const relativePath = relative(root, path).split(sep).join('/')
      if (exclude.some((pattern) => globMatch(pattern, relativePath))) continue
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue
        await walk(path)
        continue
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue
      if (entry.isSymbolicLink()) {
        const real = await realpath(path).catch(() => undefined)
        if (real === undefined || !real.startsWith(rootReal)) {
          skipped.push({ path: relativePath, reason: 'symlink-escape' })
          continue
        }
      }
      const info = await stat(path).catch(() => undefined)
      if (info === undefined) {
        skipped.push({ path: relativePath, reason: 'unreadable' })
        continue
      }
      if (info.size > maxFileBytes) {
        skipped.push({ path: relativePath, reason: 'too-large' })
        continue
      }
      let text: string
      try {
        text = await readFile(path, { encoding: 'utf8' })
      } catch {
        skipped.push({ path: relativePath, reason: 'unreadable' })
        continue
      }
      if (looksBinary(text)) {
        skipped.push({ path: relativePath, reason: 'binary' })
        continue
      }
      files.push({ path: relativePath, text })
    }
  }

  await walk(root)
  files.sort((left, right) => left.path.localeCompare(right.path))
  return { files, skipped }
}
