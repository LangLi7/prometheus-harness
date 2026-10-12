/**
 * Veröffentlichungs-Manifest der Dokumentationsseite.
 *
 * Vorbild ist `website/docs.ts` der Core-Vorlage
 * (`C:\Users\Chang\harness\prometheus-harness\website\docs.ts`). Dort gilt der Grundsatz:
 * **Markdown bleibt in seiner Ebene liegen** — die Seite projiziert es nur in Routen.
 * Hier ist das genauso: Quelle ist `../docs`, Ziel ist der generierte Baum `.generated/`,
 * den `project.ts` schreibt und den VitePress als `srcDir` liest.
 *
 * Was **nicht** veröffentlicht wird: `docs/dsh/` (der gespiegelte Doku-Bestand der
 * Core-Vorlage, 692 Dateien je Sprachfassung) und `docs/source/` (Rohmaterial). Diese
 * Bäume sind Nachschlagewerk für die Arbeit, nicht Inhalt der Projektseite.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export interface DocsPage {
  /** Route im VitePress-Baum, einschließlich `.md`. */
  readonly route: string
  /** Quellpfad, relativ zum Projektwurzelverzeichnis. */
  readonly source: string
  /** Beschriftung in der Seitenleiste (erste Überschrift des Dokuments). */
  readonly label: string
  /** Abschnitt der Seitenleiste. */
  readonly section: string
}

/** Wurzel der Dokumente, die veröffentlicht werden. */
export const DOCS_ROOT = resolve(import.meta.dirname, '..', 'docs')

/** Zielbaum, den VitePress als `srcDir` liest. */
export const GENERATED_ROOT = resolve(import.meta.dirname, '.generated')

/** Ordner unterhalb von `docs/`, die nicht auf die Seite kommen. */
const EXCLUDED_DIRS = new Set(['dsh', 'source', 'node_modules', 'verify'])

/** Abschnittsbeschriftungen je Ordner. */
const SECTION_LABELS: Record<string, string> = {
  overview: 'Überblick',
  decisions: 'Entscheidungen',
  design: 'Gestaltung',
  reference: 'Nachschlagewerk',
  subsystems: 'Subsysteme',
  user: 'Benutzerhandbuch',
  cookbook: 'Cookbook',
  i18n: 'Übersetzungen',
  postmortem: 'Nachbetrachtung',
  'upgrade-guide': 'Upgrade-Leitfaden',
  'cordis-api': 'Cordis-API',
  'cordis-tutorial': 'Cordis-Tutorial',
  'persistence-changes': 'Persistenz-Änderungen',
}

function firstHeading(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^#\s+(.+?)\s*$/.exec(line)
    if (match?.[1] !== undefined) return match[1].replace(/[`*]/g, '').trim()
  }
  return undefined
}

function collectMarkdown(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      collectMarkdown(full, found)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    if (entry.name.endsWith('.zh.md')) continue // chinesische Fassungen der Core-Dokumente
    if (statSync(full).size === 0) continue
    found.push(full)
  }
  return found
}

function buildPages(): DocsPage[] {
  const pages: DocsPage[] = []
  for (const file of collectMarkdown(DOCS_ROOT)) {
    const relativePath = relative(DOCS_ROOT, file).split('\\').join('/')
    const topLevel = relativePath.includes('/') ? relativePath.split('/')[0] ?? '' : ''
    const markdown = readFileSync(file, 'utf8')
    pages.push({
      // Der Katalog ist zugleich Startseite. VitePress bekommt die Zuordnung als
      // `rewrites`: die Datei behält ihren Namen, nur die Route wird zu `/`.
      route: relativePath,
      source: `docs/${relativePath}`,
      label: firstHeading(markdown) ?? relativePath,
      section: topLevel === '' ? 'overview' : topLevel,
    })
  }
  return pages.sort((a, b) => {
    if (a.section !== b.section) {
      if (a.section === 'overview') return -1
      if (b.section === 'overview') return 1
      return a.section.localeCompare(b.section, 'de')
    }
    return a.label.localeCompare(b.label, 'de')
  })
}

/** Alle Seiten, die die Seite zeigt. */
export const docsPages: readonly DocsPage[] = buildPages()

/** Abschnittsbeschriftung für die Seitenleiste. */
export function sectionLabel(section: string): string {
  return SECTION_LABELS[section] ?? section.charAt(0).toUpperCase() + section.slice(1)
}

/** Abschnitte in Reihenfolge ihres ersten Auftretens. */
export const docsSections: readonly string[] = [...new Set(docsPages.map((page) => page.section))]

/** Site-Pfad einer Route — `/` für die Startseite. */
export function routeLink(route: string): string {
  if (route === 'INDEX.md') return '/'
  return `/${route.replace(/\.md$/, '')}`
}
