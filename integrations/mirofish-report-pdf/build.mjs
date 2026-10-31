#!/usr/bin/env node
/**
 * Render a MiroFish report as a PDF.
 *
 * The backend already stores everything the layout needs:
 *   uploads/reports/<report_id>/outline.json  { title, summary, sections[{title, content}] }
 *   uploads/reports/<report_id>/meta.json     { report_id, simulation_id, ... }
 *
 * `content` is Markdown, so this script converts the small subset MiroFish
 * emits (headings, bold, blockquotes, bullet lists, paragraphs) to Typst markup
 * and compiles it with the template in report-pdf.typ.
 *
 * Usage:
 *   node build.mjs                    # newest completed report
 *   node build.mjs report_abc123      # one specific report
 *   node build.mjs --copy             # also copy the PDF into the report folder
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(here, 'out')
const CONTAINER = process.env.MIROFISH_CONTAINER ?? 'mirofish'
const REPORTS_ROOT = '/app/backend/uploads/reports'

function sh(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function catInContainer(path) {
  return sh('docker', ['exec', CONTAINER, 'cat', path])
}

/** Escape text for Typst content mode. */
function escapeTypst(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([#$*_@<>[\]`~])/g, '\\$1')
}

function escapeQuoted(text) {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')
}

/** Convert one line of Markdown inline markup to Typst. */
function inline(text) {
  const parts = text.split('**')
  return parts
    .map((part, index) => {
      const escaped = escapeTypst(part)
      // Odd segments sit between a ** pair.
      return index % 2 === 1 ? `*${escaped}*` : escaped
    })
    .join('')
}

/** Convert a section body from Markdown to Typst content markup. */
function convertMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let current = []

  const flush = () => {
    if (current.length) {
      blocks.push(current)
      current = []
    }
  }

  for (const line of lines) {
    if (line.trim() === '') {
      flush()
      continue
    }
    current.push(line)
  }
  flush()

  const out = []
  for (const block of blocks) {
    const first = block[0].trim()

    if (/^#{1,2}\s+/.test(first)) continue // the section title is rendered above
    if (/^###\s+/.test(first)) {
      out.push(`#block(below: 6pt)[#text(weight: "bold")[${inline(first.replace(/^###\s+/, ''))}]]`)
      const rest = block.slice(1).join(' ').trim()
      if (rest) out.push(inline(rest))
      continue
    }
    if (block.every((line) => /^>\s?/.test(line.trim()))) {
      const quoted = block.map((line) => line.trim().replace(/^>\s?/, '')).join(' ')
      out.push(
        `#block(stroke: (left: 2pt + rgb("#c9c9c9")), inset: (left: 10pt, top: 2pt, bottom: 2pt), ` +
          `text(style: "italic", fill: rgb("#3a3a3a"))[${inline(quoted)}])`,
      )
      continue
    }
    if (block.every((line) => /^[-*]\s+/.test(line.trim()))) {
      const items = block.map((line) => `[${inline(line.trim().replace(/^[-*]\s+/, ''))}]`)
      out.push(`#list(${items.join(', ')})`)
      continue
    }
    out.push(inline(block.join(' ').trim()))
  }

  return out.join('\n\n')
}

/** Find the newest report folder that has an outline. */
function newestReportId() {
  const listing = sh('docker', [
    'exec',
    CONTAINER,
    'sh',
    '-lc',
    `ls -1t ${REPORTS_ROOT} | head -20`,
  ])
  for (const name of listing.split('\n').map((n) => n.trim()).filter(Boolean)) {
    const probe = sh('docker', [
      'exec',
      CONTAINER,
      'sh',
      '-lc',
      `test -f ${REPORTS_ROOT}/${name}/outline.json && test -f ${REPORTS_ROOT}/${name}/full_report.md && echo yes || echo no`,
    ]).trim()
    if (probe === 'yes') return name
  }
  throw new Error('no completed report found in the container')
}

function main() {
  const args = process.argv.slice(2)
  const copyBack = args.includes('--copy')
  const explicit = args.find((a) => !a.startsWith('--'))

  const reportId = explicit ?? newestReportId()
  const base = `${REPORTS_ROOT}/${reportId}`

  const outline = JSON.parse(catInContainer(`${base}/outline.json`))
  let meta = {}
  try {
    meta = JSON.parse(catInContainer(`${base}/meta.json`))
  } catch {
    meta = {}
  }

  const sections = (outline.sections ?? []).map((section, index) => ({
    number: String(index + 1).padStart(2, '0'),
    title: section.title ?? '',
    body: convertMarkdown(section.content ?? ''),
  }))

  mkdirSync(OUT_DIR, { recursive: true })
  const typPath = join(OUT_DIR, `${reportId}.typ`)
  const pdfPath = join(OUT_DIR, `${reportId}.pdf`)

  const sectionLiterals = sections
    .map(
      (s) => `  (
    title: "${escapeQuoted(s.title)}",
    body: [
${s.body}
    ],
  ),`,
    )
    .join('\n')

  const source = `// Generated by build.mjs for ${reportId}. Do not edit by hand.
#import "../report-pdf.typ": build

#show: doc => build(
  title: "${escapeQuoted(outline.title ?? reportId)}",
  summary: "${escapeQuoted(outline.summary ?? '')}",
  report_id: "${escapeQuoted(reportId)}",
  simulation_id: "${escapeQuoted(meta.simulation_id ?? '')}",
  sections: (
${sectionLiterals}
  ),
)
`
  writeFileSync(typPath, source, 'utf8')

  sh('typst', ['compile', '--root', here, typPath, pdfPath])

  if (copyBack) {
    sh('docker', ['cp', pdfPath, `${CONTAINER}:${base}/${reportId}.pdf`])
  }

  if (!existsSync(pdfPath)) throw new Error(`typst did not write ${pdfPath}`)
  console.log(`[report-pdf] ${reportId}`)
  console.log(`[report-pdf] typst source ${typPath}`)
  console.log(`[report-pdf] pdf          ${pdfPath}`)
}

main()
