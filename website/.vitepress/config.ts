/**
 * VitePress-Konfiguration der Dokumentationsseite.
 *
 * Rollenverteilung wie in der Core-Vorlage
 * (`C:\Users\Chang\harness\prometheus-harness\website\.vitepress\config.ts`):
 *
 *   `srcDir: '.generated'`  ← nur der projizierte Baum wird gelesen
 *   `outDir: '.dist'`       ← Bauausgabe, nicht im Quellbaum
 *
 * Die Markdown-Dokumente bleiben in `docs/` liegen; `project.ts` kopiert sie nach
 * `.generated/`, und `docs.ts` liefert die Routen und Beschriftungen. Diese Datei
 * enthält deshalb keine Seitenliste, nur die Darstellung.
 */

import { resolve } from 'node:path'
import { defineConfig } from 'vitepress'
import type { DefaultTheme } from 'vitepress'
import { docsPages, docsSections, routeLink, sectionLabel } from '../docs.ts'

/** Seitenleiste: ein Block je Abschnitt, Einträge in Manifest-Reihenfolge. */
const sidebar: DefaultTheme.SidebarItem[] = docsSections.map((section) => ({
  text: sectionLabel(section),
  collapsed: section !== 'overview',
  items: docsPages
    .filter((page) => page.section === section)
    .map((page) => ({ text: page.label, link: routeLink(page.route) })),
}))

const nav: DefaultTheme.NavItem[] = [
  { text: 'Katalog', link: '/' },
  { text: 'Ausrichtung', link: routeLink('vision.md') },
  { text: 'Technik', link: routeLink('stack.md') },
  { text: 'Entscheidungen', link: routeLink('decisions/open-questions.md') },
  { text: 'Gestaltung', link: routeLink('design/ui-keep-cut.md') },
  { text: 'Oberfläche', link: routeLink('reference/web-frontend.md') },
]

export default defineConfig({
  title: 'Prometheus Harness',
  description: 'Dokumentation des Prometheus Harness — Ausrichtung, Technik, Entscheidungen',
  lang: 'de-DE',
  srcDir: '.generated',
  outDir: '.dist',
  cleanUrls: true,

  // Der Katalog ist die Startseite. Die Datei behält ihren Namen `INDEX.md`, damit die
  // vielen Verweise `../INDEX.md` in den Dokumenten gültig bleiben; nur die Route wird
  // zu `/`. Eine zweite Datei `index.md` wäre unter Windows dieselbe Datei wie `INDEX.md`.
  rewrites: { 'INDEX.md': 'index.md' },

  head: [['link', { rel: 'icon', href: '/favicon.svg' }]],

  vite: {
    // VitePress sucht `public/` sonst unterhalb von `srcDir`, also in `.generated/public`.
    // Dort liegt nichts, deshalb lieferte `/favicon.svg` die HTML-Hülle statt des Bildes
    // (im Test: Status 200 mit `text/html`). Die Core-Vorlage setzt für dieselbe Lage
    // (`srcDir: '.generated'`) denselben Wert in `website/.vitepress/config.ts`.
    publicDir: resolve(import.meta.dirname, '../public'),
  },

  themeConfig: {
    nav,
    sidebar,
    outline: { level: [2, 3], label: 'Auf dieser Seite' },
    search: { provider: 'local' },
    docFooter: { prev: 'Zurück', next: 'Weiter' },
    returnToTopLabel: 'Nach oben',
    sidebarMenuLabel: 'Inhalt',
    darkModeSwitchLabel: 'Darstellung',
  },
})
