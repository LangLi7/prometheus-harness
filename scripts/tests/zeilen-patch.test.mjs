/**
 * Der **Wächter für den Patch** an der Sitzungszeile.
 *
 * ## Warum diese Prüfung existiert
 *
 * Am 28.10.2026 ist die Sitzungszeile von `@deepseek-ai/dsh-client-ui-workspace` von einem
 * `<div role="treeitem">` zu einem `<a href="/c/<Sitzung>">` geworden — per Patch, weil der Kern
 * für die Projektzeile keine Naht anbietet und ein `div` im Browser kein Ziel hat (deshalb gab es
 * dort kein „In neuem Tab öffnen").
 *
 * **Ein Patch auf eine gepinnte Fremddatei ist still.** Steigt die Fassung des Pakets, greift er
 * nicht mehr oder passt nicht mehr — und die Zeile ist wieder ein `div`, ohne daß irgendetwas
 * scheitert. Genau das prüft diese Datei: die installierte Datei **und** die Erklärung in
 * `package.json` **und** die Patch-Datei selbst.
 *
 * Ein Nebeneffekt ist Absicht: die Prüfung liest den **installierten** Stand, nicht den Patch. Wer
 * am Patch vorbei die Datei ändert, fällt hier auf.
 *
 * @module scripts/tests/zeilen-patch
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const wurzel = join(import.meta.dir, '..', '..')
const paket = 'node_modules/@deepseek-ai/dsh-client-ui-workspace'
const quelle = join(wurzel, paket, 'lib/client.js')
const manifest = join(wurzel, 'package.json')

/** Die Fassung, gegen die der Patch geschrieben wurde — steht im Schlüssel von `patchedDependencies`. */
const FASSUNG = JSON.parse(readFileSync(join(wurzel, paket, 'package.json'), 'utf8')).version

describe('Der Patch an der Sitzungszeile', () => {
  test('die installierte Zeile ist ein Link auf /c/<Sitzung>', () => {
    const text = readFileSync(quelle, 'utf8')
    // **Der Anker selbst.** Ohne ihn ist die Zeile wieder ein `div` — und der Browser bietet dort
    // kein „In neuem Tab öffnen" an.
    expect(text).toContain('anchor: (0, react_jsx_runtime.jsxs)("a", {')
    expect(text).toContain('href: `/c/${encodeURIComponent(node.id)}`,')
    // **Und der einfache Klick bleibt bei der Anwendung.** Ohne `preventDefault` würde ein Klick
    // zusätzlich navigieren (die Seite lüde neu); mit `preventDefault` bei Zusatztaste verlöre man
    // den zweiten Tab.
    expect(text).toContain('onClick: (e) => {')
    expect(text).toContain('if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;')
    expect(text).toContain('e.preventDefault();')
  })

  test('package.json erklärt den Patch für genau diese Fassung', () => {
    const inhalt = JSON.parse(readFileSync(manifest, 'utf8'))
    const eintraege = inhalt.patchedDependencies ?? {}
    const pfad = eintraege[`@deepseek-ai/dsh-client-ui-workspace@${FASSUNG}`]
    // **Der Schlüssel trägt die Fassung.** Steigt das Paket, muß der Patch neu geschrieben werden —
    // hier fällt es auf, statt in einer stillen Regression.
    expect(typeof pfad).toBe('string')
    expect(existsSync(join(wurzel, String(pfad)))).toBe(true)
  })

  test('der Patch betrifft genau drei Stellen — und nur diese Datei', () => {
    const inhalt = JSON.parse(readFileSync(manifest, 'utf8'))
    const pfad = inhalt.patchedDependencies[`@deepseek-ai/dsh-client-ui-workspace@${FASSUNG}`]
    const patch = readFileSync(join(wurzel, String(pfad)), 'utf8')
    const hunks = patch.split('\n').filter((zeile) => zeile.startsWith('@@'))
    // **Kleinster Schnitt, prüfbar.** Drei Stellen: der Anker der Zeile, der Menüposten und seine
    // Auswahl — mehr darf es nicht werden, ohne daß es hier auffällt.
    expect(hunks).toHaveLength(3)
    expect(patch).toContain('--- a/lib/client.js')
    expect(patch).toContain('+++ b/lib/client.js')
    // Die Gegenprobe: der Patch darf **keine** andere Datei nennen.
    expect(patch).not.toContain('a/lib/index.js')
  })
})


describe('Das Projektmenü', () => {
  test('hat den Eintrag Quellordner — als Ereignis, nicht als Navigation', async () => {
    const text = await Bun.file(quelle).text()
    expect(text).toContain('id: "pmh-ordner"')
    expect(text).toContain('Quellordner…')
    expect(text).toContain('pmh:quellordner')
    /*
     * **Kein `location.assign`, kein `href` im Menüposten.** Der Eintrag darf nicht navigieren:
     * sonst hinge er an einer Seite, die der Wirt erst nach einem Neustart ausliefert — und der
     * Dialog wäre bis dahin unerreichbar.
     */
    expect(text).not.toContain('location.assign')
  })
})

describe('Der Anker läßt den Kindern ihren Klick', () => {
  test('die Navigation wird in der Einfangphase verhindert', async () => {
    const text = await Bun.file(quelle).text()
    /*
     * **Warum die Einfangphase.** Der "…"-Knopf und die Menüeinträge liegen im Anker und rufen
     * stopPropagation; ein onClick am Anker läuft dann nie — und ohne preventDefault folgt der
     * Browser dem href. Genau das war der Fehler: statt des Menüs öffnete sich die Sitzung.
     */
    expect(text).toContain('onClickCapture: (e) => {')
    expect(text).toContain('e.preventDefault();')
  })
})
