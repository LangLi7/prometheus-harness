import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import ChannelsIsland from '../src/lib/ChannelsIsland'
import type { IslandGroup } from '../src/lib/island-data'

/**
 * Struktur-Abnahme der Insel.
 *
 * Die Insel selbst hat **keinen** festen Inhalt mehr — die Belegung kommt von außen. Damit
 * die Struktur trotzdem geprüft bleibt, bringt dieser Test seine eigenen Beispieldaten mit.
 * Sie sind aus dem Beispiel-Markup der Vorlage entnommen
 * (H:\Projekt\Programmieren\Prometheus\webui\src\App.svelte, Zeilen 319–336) und liegen
 * ausschließlich hier im Test, nicht im Produktivcode.
 */

const FIXTURE: readonly IslandGroup[] = [
  {
    title: '# channels',
    items: [
      { id: 'main', label: 'main', kind: 'channel', sigil: '#', badge: 'live' },
      { id: 'memory-review', label: 'memory-review', kind: 'channel', sigil: '#' },
    ],
  },
  {
    title: '⌥ branches',
    items: [{ id: 'session-alpha', label: 'session-alpha', kind: 'branch', sigil: '⌥', badge: '7d' }],
  },
  {
    title: '◉ tools',
    items: [{ id: 'browser', label: 'browser', kind: 'tool', sigil: '◉' }],
  },
]

interface RenderOptions {
  readonly open?: boolean
  readonly activeId?: string | null
  readonly groups?: readonly IslandGroup[]
}

function render({ open = true, activeId = 'main', groups = FIXTURE }: RenderOptions = {}): string {
  return renderToStaticMarkup(
    <ChannelsIsland
      project="prometheus"
      groups={groups}
      activeId={activeId}
      summary="#main · ornith-9b"
      defaultOpen={open}
      onSelect={() => {}}
    />,
  )
}

test('Kopf zeigt Titel, Projekt und Schließen-Knopf', () => {
  const html = render()
  expect(html).toContain('<b>◆ CHANNELS</b>')
  expect(html).toContain('<span>projekt: prometheus</span>')
  expect(html).toContain('aria-label="Insel schließen"')
})

test('die Gruppen erscheinen in gelieferter Reihenfolge', () => {
  const groups = [...render().matchAll(/<div class="grp">([^<]*)<\/div>/g)].map((m) => m[1])
  expect(groups).toEqual(['# channels', '⌥ branches', '◉ tools'])
})

test('Einträge tragen Sigil und Marke', () => {
  const html = render()
  const labels = [...html.matchAll(/<span class="sigil">(.*?)<\/span>(.*?)(?:<span|<\/button>)/g)].map((m) => ({
    sigil: m[1],
    label: m[2],
  }))
  expect(labels).toEqual([
    { sigil: '#', label: 'main' },
    { sigil: '#', label: 'memory-review' },
    { sigil: '⌥', label: 'session-alpha' },
    { sigil: '◉', label: 'browser' },
  ])
  expect([...html.matchAll(/<span class="badge">([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(['live', '7d'])
})

test('genau der aktive Eintrag trägt `on` und aria-current', () => {
  const html = render({ activeId: 'session-alpha' })
  expect([...html.matchAll(/class="item on"/g)]).toHaveLength(1)
  expect(html).toContain('class="item on" aria-current="true"')
  expect([...html.matchAll(/aria-current="true"/g)]).toHaveLength(1)
})

test('die Klassen der Vorlage bleiben erhalten', () => {
  const html = render()
  for (const cls of ['isl max', 'full', 'head', 'x', 'ch', 'grp', 'item', 'sigil', 'badge']) {
    expect(html).toContain(`class="${cls}"`)
  }
})

test('ohne Belegung bleibt die Liste leer — nur die Gruppenköpfe fehlen, nichts ist erfunden', () => {
  const html = render({ groups: [], activeId: null })
  expect(html).toContain('class="isl max"')
  expect(html).toContain('<b>◆ CHANNELS</b>')
  expect(html).not.toContain('class="grp"')
  expect(html).not.toContain('class="item')
})

test('eingeklappt zeigt die Pille wie in der Vorlage', () => {
  const html = render({ open: false })
  expect(html).toContain('class="isl"')
  expect(html).not.toContain('isl max')
  expect(html).not.toContain('class="full"')
  expect(html).toContain('<span class="dot"></span><b>PROMETHEUS</b><span>#main · ornith-9b</span>')
})

test('die Pille ist per Tastatur erreichbar und meldet ihren Zustand', () => {
  const html = render({ open: false })
  expect(html).toContain('class="mini"')
  expect(html).toContain('role="button"')
  expect(html).toContain('tabindex="0"')
  expect(html).toContain('aria-expanded="false"')
  expect(html).toContain('aria-label="Kanäle öffnen"')
})
