/**
 * `@prometheus-harness/skillspector/output` — Berichtsformate.
 *
 * **Vier Formate, eine Quelle.** `terminal` für den Menschen, `json` für das Gate,
 * `markdown` für die Dokumentation, `sarif` für CI und IDE. Jede Ausgabe liest
 * denselben {@link ScanReport}; keine Form berechnet etwas neu.
 *
 * @module @prometheus-harness/skillspector/output
 */

import { RULES } from './rules.ts'
import type { Finding, ScanReport, Severity } from './types.ts'

/** Die unterstützten Ausgabeformen. */
export type OutputFormat = 'terminal' | 'json' | 'markdown' | 'sarif'

/** Breite der Terminal-Tabelle. */
const WIDTH = 78

/**
 * Formatiert einen Bericht.
 *
 * @param report - der Bericht
 * @param format - Zielformat
 * @returns der Text
 */
export function formatReport(report: ScanReport, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return `${JSON.stringify(report, null, 2)}\n`
    case 'markdown':
      return renderMarkdown(report)
    case 'sarif':
      return `${JSON.stringify(toSarif(report), null, 2)}\n`
    case 'terminal':
      return renderTerminal(report)
  }
}

/**
 * Rendert die Terminalfassung.
 *
 * @param report - der Bericht
 * @returns der Text
 */
export function renderTerminal(report: ScanReport): string {
  const lines: string[] = []
  lines.push(` SkillSpector Security Report  v${report.metadata.version}`)
  lines.push('')
  lines.push(`Skill:  ${report.skill.name}`)
  lines.push(`Source: ${report.skill.source}`)
  lines.push(`Scanned: ${report.skill.scannedAt}`)
  lines.push(`Digest: ${report.skill.digest.slice(0, 16)}…`)
  lines.push('')
  lines.push(center('Risk Assessment'))
  lines.push(' Metric          Value')
  lines.push(` Score           ${report.risk.score}/100`)
  lines.push(` Severity        ${report.risk.severity}`)
  lines.push(` Recommendation  ${report.risk.recommendation}`)
  lines.push('')
  lines.push(center(`Components (${report.components.length})`))
  for (const component of report.components) {
    lines.push(
      ` ${pad(component.path, 40)} ${pad(component.type, 10)} ${pad(`${component.lines}`, 6)} ${component.executable ? 'exec' : '-'}`,
    )
  }
  if (report.coverage.skippedFiles.length > 0) {
    lines.push('')
    lines.push(center(`Not inspected (${report.coverage.skippedFiles.length})`))
    for (const skipped of report.coverage.skippedFiles) lines.push(` ${skipped.path} — ${skipped.reason}`)
  }
  lines.push('')
  if (report.issues.length === 0) {
    lines.push(center('No findings'))
  } else {
    lines.push(center(`Issues (${report.issues.length}${report.suppressed > 0 ? `, ${report.suppressed} suppressed` : ''})`))
    for (const issue of report.issues) {
      lines.push('')
      lines.push(`  ${issue.severity}: ${issue.message} (${issue.id})`)
      lines.push(`    Location: ${issue.file}:${issue.line}`)
      lines.push(`    Finding: ${issue.evidence}`)
      lines.push(`    Confidence: ${Math.round(issue.confidence * 100)}%`)
    }
  }
  lines.push('')
  lines.push('-'.repeat(WIDTH))
  if (!report.coverage.complete) {
    lines.push('Coverage is incomplete: this report is not evidence of a clean skill.')
  }
  return `${lines.join('\n')}\n`
}

/**
 * Rendert die Markdownfassung.
 *
 * @param report - der Bericht
 * @returns der Text
 */
export function renderMarkdown(report: ScanReport): string {
  const lines: string[] = []
  lines.push(`# SkillSpector report — ${report.skill.name}`)
  lines.push('')
  lines.push(`| Field | Value |`)
  lines.push(`|---|---|`)
  lines.push(`| Source | \`${report.skill.source}\` |`)
  lines.push(`| Scanned | ${report.skill.scannedAt} |`)
  lines.push(`| Digest | \`${report.skill.digest}\` |`)
  lines.push(`| Score | **${report.risk.score}/100** |`)
  lines.push(`| Severity | ${report.risk.severity} |`)
  lines.push(`| Recommendation | **${report.risk.recommendation}** |`)
  lines.push(`| Coverage | ${report.coverage.complete ? 'complete' : 'incomplete'} |`)
  lines.push('')
  if (report.issues.length === 0) {
    lines.push('No findings.')
  } else {
    lines.push('## Findings')
    lines.push('')
    lines.push('| Severity | Rule | Location | Finding |')
    lines.push('|---|---|---|---|')
    for (const issue of report.issues) {
      lines.push(
        `| ${issue.severity} | ${issue.id} | \`${issue.file}:${issue.line}\` | ${escapeCell(issue.message)} |`,
      )
    }
  }
  lines.push('')
  if (report.coverage.skippedFiles.length > 0) {
    lines.push('## Not inspected')
    lines.push('')
    for (const skipped of report.coverage.skippedFiles) lines.push(`- \`${skipped.path}\` — ${skipped.reason}`)
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

/**
 * Baut SARIF 2.1.0.
 *
 * @param report - der Bericht
 * @returns das SARIF-Dokument
 */
export function toSarif(report: ScanReport): Record<string, unknown> {
  const usedRules = new Set(report.issues.map((issue) => issue.id))
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'pmh-skillspector',
            informationUri: 'https://github.com/NVIDIA/SkillSpector',
            version: report.metadata.version,
            rules: RULES.filter((rule) => usedRules.has(rule.id)).map((rule) => ({
              id: rule.id,
              name: rule.title,
              shortDescription: { text: rule.title },
              properties: { category: rule.category, severity: rule.severity },
            })),
          },
        },
        results: report.issues.map((issue) => ({
          ruleId: issue.id,
          level: sarifLevel(issue.severity),
          message: { text: `${issue.message}: ${issue.evidence}` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: issue.file },
                region: { startLine: issue.line },
              },
            },
          ],
          properties: { confidence: issue.confidence, fingerprint: issue.fingerprint },
        })),
      },
    ],
  }
}

/**
 * Eine Kurzzeile für Werkzeugausgaben.
 *
 * @param report - der Bericht
 * @returns die Zeile
 */
export function summarize(report: ScanReport): string {
  const worst = report.issues[0]
  const suffix = worst === undefined ? '' : ` — ${worst.severity} ${worst.id}: ${worst.message}`
  return `${report.skill.name}: ${report.risk.score}/100 ${report.risk.severity} (${report.risk.recommendation})${suffix}`
}

/**
 * Der schlechteste Befund, oder `undefined`.
 *
 * @param issues - die Befunde
 * @returns der erste Befund in Berichtsreihenfolge
 */
export function worstFinding(issues: readonly Finding[]): Finding | undefined {
  return issues[0]
}

function sarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'error'
  if (severity === 'MEDIUM') return 'warning'
  return 'note'
}

function center(text: string): string {
  const left = Math.max(0, Math.floor((WIDTH - text.length) / 2))
  return `${' '.repeat(left)}${text}`
}

function pad(text: string, width: number): string {
  return text.length >= width ? `${text.slice(0, width - 1)}…` : text.padEnd(width)
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|')
}
