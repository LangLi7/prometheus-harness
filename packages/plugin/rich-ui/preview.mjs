/**
 * Renders the cards into one static HTML page for a visual check.
 *
 * `bun packages/plugin/rich-ui/preview.mjs`
 *
 * The page uses the same components and the same stylesheet as the chat. Only the
 * `--dsw-*` tokens are pinned to the dark theme, because a page opened outside the
 * app has no theme provider. Open the file in a browser or screenshot it; nothing
 * here is part of the shipped bundle.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RichCard, RichError } from './src/card.tsx'
import { readRichSpec } from './src/spec.ts'
import { CARD_CSS } from './src/style.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const TARGET = join(ROOT, '.pmh-build', 'rich-ui-preview.html')
const FIGURE = join(ROOT, '.pmh-build', 'preview-figure.png')

/**
 * A real screenshot for the prose sample, embedded so the page needs no network.
 *
 * A card accepts an http(s) URL or `data:image/…` and nothing else, so the bytes
 * are inlined instead of referenced by path — the sample goes through the same
 * validation a model's call does. Without the file the sample is left out rather
 * than rendering a broken image.
 */
const figureSource = (() => {
  try {
    return `data:image/png;base64,${readFileSync(FIGURE).toString('base64')}`
  } catch {
    return null
  }
})()

const samples = [
  {
    kind: 'chart',
    title: 'Umsatzentwicklung',
    subtitle: 'Demonstrationsdaten · keine realen Geschäftsdaten',
    footer: 'Beispieldaten',
    chart: {
      type: 'line',
      unit: '€',
      labels: ['Jan', 'Feb', 'Mär', 'Apr'],
      series: [{ key: 'revenue', label: 'Umsatz', values: [120, 180, 150, 240] }],
    },
  },
  {
    kind: 'stats',
    title: 'Kennzahlen der Woche',
    stats: [
      { label: 'Nachrichten', value: '2.148', hint: 'gegenüber 1.902' },
      { label: 'Sitzungen', value: '316', hint: '12 laufen' },
      { label: 'Kosten', value: '4,82 $', hint: 'Schätzung' },
    ],
  },
  {
    kind: 'chart',
    title: 'Zwei Reihen, Balken',
    chart: {
      type: 'bar',
      unit: 'Stk.',
      labels: ['Mo', 'Di', 'Mi', 'Do', 'Fr'],
      series: [
        { key: 'a', label: 'Anfragen', values: [12, 18, 9, 22, 17] },
        { key: 'b', label: 'Fehler', values: [1, 2, 0, 3, 1] },
      ],
    },
  },
  {
    kind: 'chart',
    title: 'Lange Kategorien',
    subtitle: 'Beschriftungen werden gemessen, ausgedünnt und gekürzt',
    chart: {
      type: 'line',
      labels: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'September 2026'],
      series: [{ key: 'x', label: 'Wert', values: [12, 15, 9, 18, 22, 19, 25, 28] }],
    },
  },
  {
    kind: 'table',
    title: 'Modelle im Vergleich',
    table: {
      caption: 'Messung vom 21.10.2026',
      columns: [
        { key: 'model', label: 'Modell' },
        { key: 'speed', label: 'Tokens/s', align: 'right' },
        { key: 'cost', label: 'Kosten', align: 'right' },
      ],
      rows: [
        ['deepseek-flash', '182', '0,14 $'],
        ['deepseek-v4-pro', '74', '0,61 $'],
        ['openrouter/free', '41', '0,00 $'],
      ],
    },
  },
  {
    kind: 'note',
    note: 'Hinweis: Die Zahlen sind Beispieldaten.\nDer Renderer übernimmt Achsen, Farben und Skalierung.',
  },
  {
    kind: 'prose',
    title: 'Ohne Bild: die Karte schrumpft',
    prose: {
      text: 'Ein kurzer Absatz belegt nicht die volle Breite. Pretext misst die breiteste Zeile und die Karte zieht sich darauf zusammen — wie eine Sprechblase statt einer Wand.',
    },
  },
  {
    kind: 'files',
    title: 'Was der Durchstich angefasst hat',
    subtitle: 'Ein Pfad ist ein Knopf, sobald der Host einen Öffner mitgibt',
    files: {
      items: [
        { path: 'packages/plugin/rich-ui/src/prose.tsx', change: 'added', added: 148 },
        { path: 'packages/plugin/rich-ui/src/preload.ts', change: 'added', added: 104 },
        { path: 'packages/plugin/rich-ui/src/spec.ts', change: 'modified', added: 96, removed: 8 },
        { path: 'packages/plugin/rich-ui/src/card.tsx', change: 'modified', added: 62, removed: 21 },
        { path: 'packages/plugin/rich-ui/src/server.ts', change: 'modified', added: 34, removed: 3 },
      ],
      more: 2,
    },
  },
  {
    kind: 'code',
    title: 'Ausschnitt mit Herkunft',
    subtitle: 'Dateiname, Zeilennummern, Kopieren — kein Syntax-Highlighting',
    code: {
      filename: 'packages/plugin/rich-ui/src/preload.ts',
      language: 'ts',
      startLine: 70,
      content: [
        "preloader.on('loaded', (item) => {",
        '  const asset = item.asset',
        '  if (asset instanceof HTMLImageElement) {',
        "    settle({ status: 'ready', width: asset.naturalWidth, height: asset.naturalHeight })",
        '  }',
        '})',
      ].join('\n'),
    },
  },
  ...(figureSource === null
    ? []
    : [
        {
          kind: 'prose',
          title: 'Mit Bild: der Text läuft daneben',
          subtitle: 'prejs kennt die Breite, bevor gemalt wird',
          prose: {
            text: 'Der Absatz beginnt neben dem Bild und bricht darunter um. Weil prejs das Bild vor dem ersten Layout lädt, steht seine Breite fest, bevor die Zeilen entstehen — die Karte kann ihre Breite also messen, ohne zu raten und ohne zu springen. Gemalt wird mit einem gewöhnlichen Float: der Text bleibt auswählbar, durchsuchbar und für Vorleser lesbar.',
            image: { src: figureSource, alt: 'Kleines Balkenschaubild', boxWidth: 220 },
          },
        },
      ]),
]

function card(raw) {
  const result = readRichSpec(raw)
  if (!result.ok) throw new Error(result.error)
  return renderToStaticMarkup(createElement(RichCard, { spec: result.spec }))
}

const body = samples.map(card).join('\n')
const broken = renderToStaticMarkup(createElement(RichError, { message: 'chart.series: a series needs a values array.' }))

const page = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prometheus — reiche Antworten</title>
<style>
:root{
  color-scheme: dark;
  --dsw-alias-bg-base:#131315;
  --dsw-alias-bg-layer-1:#1a1a1d;
  --dsw-alias-bg-layer-2:#232327;
  --dsw-alias-border-l2:#34343b;
  --dsw-alias-label-primary:#f3f3f6;
  --dsw-alias-label-secondary:#c6c8d0;
  --dsw-alias-label-tertiary:#8e919c;
  --dsw-alias-brand-primary:#4f8cff;
  --dsw-alias-state-business-primary:#8b6cff;
  --dsw-alias-state-warn-primary:#e8a33d;
}
html,body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
body{font-family:"Segoe UI Variable","Segoe UI",system-ui,sans-serif;font-size:15px;line-height:1.55}
.page{max-width:760px;margin:0 auto;padding:36px 24px 64px}
.lead{color:var(--dsw-alias-label-secondary);margin:0 0 22px;font-size:14px}
h1{font-size:20px;font-weight:600;margin:0 0 6px}
${CARD_CSS}
</style>
</head>
<body>
<div class="page">
  <h1>Reiche Antworten im Chat</h1>
  <p class="lead">Statisch gerendert aus denselben Komponenten wie im Verlauf — Format, Geometrie und Stil sind die des Plugins <code>@prometheus-harness/rich-ui</code>.</p>
  ${body}
  ${broken}
</div>
</body>
</html>
`

mkdirSync(dirname(TARGET), { recursive: true })
writeFileSync(TARGET, page, 'utf8')
console.log(`Preview: ${TARGET} (${String(Buffer.byteLength(page))} B)`)
