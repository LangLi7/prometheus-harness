import { expect, test } from 'bun:test'
import {
  activatePanel,
  activeIn,
  initialLayout,
  moveFloating,
  movePanel,
  panelsIn,
  resizePanel,
} from '../src/docking'
import type { PanelSpec } from '../src/docking'

const specs: readonly PanelSpec[] = [
  { id: 'search', title: 'Suche', zone: 'left', size: 280, render: () => {} },
  { id: 'ruler', title: 'Koordinatensystem', zone: 'right', size: 260, render: () => {} },
  { id: 'status', title: 'Zustand', zone: 'right', size: 260, render: () => {} },
  { id: 'found', title: 'Sichtbare Objekte', zone: 'bottom', size: 210, render: () => {} },
]

test('die Anfangsanordnung uebernimmt die Zonen der Angebote', () => {
  const layout = initialLayout(specs)
  expect(panelsIn(layout, 'left').map((p) => p.id)).toEqual(['search'])
  expect(panelsIn(layout, 'right').map((p) => p.id)).toEqual(['ruler', 'status'])
  expect(panelsIn(layout, 'bottom').map((p) => p.id)).toEqual(['found'])
  expect(panelsIn(layout, 'closed')).toEqual([])
})

test('in einer Zone steht genau ein Panel vorne — das erste', () => {
  const layout = initialLayout(specs)
  expect(activeIn(layout, 'right')?.id).toBe('ruler')
})

test('Verschieben in eine andere Zone nimmt das Panel aus der alten', () => {
  const layout = movePanel(initialLayout(specs), 'search', 'right')
  expect(panelsIn(layout, 'left')).toEqual([])
  // Die Zone enthaelt jetzt alle drei. Die Reihenfolge folgt der Panel-Liste, nicht der
  // Reihenfolge des Ziehens — wer im Code die Zone liest, bekommt eine stabile Ordnung.
  expect([...panelsIn(layout, 'right').map((p) => p.id)].sort()).toEqual(['ruler', 'search', 'status'])
})

test('das verschobene Panel steht in der neuen Zone vorne — man will es sehen', () => {
  const layout = movePanel(initialLayout(specs), 'search', 'right')
  expect(activeIn(layout, 'right')?.id).toBe('search')
})

test('Abstecken loescht nichts — die Groesse bleibt erhalten', () => {
  const resized = resizePanel(initialLayout(specs), 'search', 340)
  const closed = movePanel(resized, 'search', 'closed')
  const panel = panelsIn(closed, 'closed')[0]
  expect(panel?.size).toBe(340)
  // Und wieder einhaengen stellt genau diese Groesse wieder her.
  const back = movePanel(closed, 'search', 'left')
  expect(activeIn(back, 'left')?.size).toBe(340)
})

test('eine Zone, deren vorne stehendes Panel wegzieht, faellt auf ein vorhandenes zurueck', () => {
  const layout = movePanel(initialLayout(specs), 'ruler', 'bottom')
  // `status` war nicht vorne; ohne den Rueckfall waere die rechte Zone sichtbar leer,
  // obwohl `status` noch darin liegt.
  expect(activeIn(layout, 'right')?.id).toBe('status')
})

test('Groessen werden begrenzt statt uebernommen', () => {
  const layout = initialLayout(specs)
  expect(panelsIn(resizePanel(layout, 'search', 5, { min: 160, max: 720 }), 'left')[0]?.size).toBe(160)
  expect(panelsIn(resizePanel(layout, 'search', 5000, { min: 160, max: 720 }), 'left')[0]?.size).toBe(720)
})

test('Reiterwechsel aendert nur die Auswahl, nicht die Anordnung', () => {
  const layout = activatePanel(initialLayout(specs), 'right', 'status')
  expect(activeIn(layout, 'right')?.id).toBe('status')
  expect(panelsIn(layout, 'right').map((p) => p.id)).toEqual(['ruler', 'status'])
})

test('schwebende Panels lassen sich verschieben, ohne die Zone zu wechseln', () => {
  const floating = movePanel(initialLayout(specs), 'status', 'floating')
  const moved = moveFloating(floating, 'status', 120, 340)
  const panel = panelsIn(moved, 'floating')[0]
  expect(panel?.zone).toBe('floating')
  expect(panel?.floating.x).toBe(120)
  expect(panel?.floating.y).toBe(340)
})
