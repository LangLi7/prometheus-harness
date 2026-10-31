/**
 * **Der Obsidian-Leser — geprüft, ohne Vault und ohne Host.**
 *
 * Die Zerlegung einer Notiz (Kopfbereich, Marken, Verweise) ist eine **reine Rechnung auf Text**. Alles,
 * was schiefgehen kann, läßt sich hier zeigen: ein `---` mitten im Text, ein `#include` in einem
 * Codeblock, ein Verweis mit Anzeigetext, ein Verweis ins Leere.
 *
 * Der zweite Teil prüft das **Lesen** auf einem Wegwerf-Ordner — mit den Fällen, die sonst niemand
 * bedenkt: `.obsidian` wird übersprungen, `.canvas` ist keine Notiz, und eine Notiz, die auf sich selbst
 * zeigt, ist keine Kante.
 */
import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  graphAus,
  leseVault,
  noteAus,
  titelAus,
  trenneKopf,
  verweiseAus,
  type ObsidianNote,
} from '../src/index'

// ── Der Kopfbereich ───────────────────────────────────────────────────────────────────────────

test('ein Kopfbereich wird nur am ANFANG erkannt', () => {
  const mit = trenneKopf('---\ntags: [a, b]\n---\n# Titel\nText')
  expect(mit.kopf).toBe('tags: [a, b]')
  expect(mit.koerper).toBe('# Titel\nText')

  /*
   * **Der Fall, der eine naive Zerlegung bricht.** Ein `---` mitten im Text ist ein **Trennstrich**.
   * Wer „alles zwischen dem ersten und zweiten `---`" nimmt, schneidet hier den halben Text weg.
   */
  const ohne = trenneKopf('# Titel\n\n---\n\nText darunter')
  expect(ohne.kopf).toBe('')
  expect(ohne.koerper).toBe('# Titel\n\n---\n\nText darunter')
})

test('ein angefangener Kopfbereich ohne Ende schneidet nichts ab', () => {
  // Eine Datei, die mit `---` beginnt und kein zweites hat: ein Trennstrich, kein Kopf.
  const r = trenneKopf('---\n# Titel')
  expect(r.kopf).toBe('')
  expect(r.koerper).toBe('---\n# Titel')
})

test('der Titel kommt aus der Überschrift — sonst aus dem Dateinamen', () => {
  expect(titelAus('Ordner/Note.md', '# Meine Überschrift\nText')).toBe('Meine Überschrift')
  expect(titelAus('Ordner/Note.md', 'nur Text')).toBe('Note')
  // Die tiefste Überschrift ist auch eine: `###` ist ein Titel, wenn keiner darüber steht.
  expect(titelAus('x.md', '### Dritte Ebene')).toBe('Dritte Ebene')
})

// ── Marken ───────────────────────────────────────────────────────────────────────────────────

test('Marken kommen aus dem Kopfbereich UND aus dem Text', () => {
  const n = noteAus('a.md', '---\ntags: [projekt, ideen]\n---\n# A\nText mit #hier und #auch-hier.')
  expect(n.tags).toContain('projekt')
  expect(n.tags).toContain('ideen')
  expect(n.tags).toContain('hier')
  expect(n.tags).toContain('auch-hier')
})

test('Marken aus einer Liste im Kopfbereich', () => {
  const n = noteAus('a.md', '---\ntags:\n  - eins\n  - zwei\n---\n# A')
  expect(n.tags).toEqual(['eins', 'zwei'])
})

test('im Code ist keine Marke — `#include` und `#!/bin/bash` sind keine Tags', () => {
  /*
   * **Der Fehler, den jeder Vault-Leser einmal hat.** Ein C-Beispiel (`#include <stdio.h>`) und ein
   * Shell-Beispiel (`#!/bin/bash`) stehen in fast jedem technischen Vault. Wer Code nicht entfernt,
   * bekommt Marken wie `include` und `!/bin/bash`.
   */
  const n = noteAus('a.md', '# A\n\n```c\n#include <stdio.h>\n```\n\n`#inline`\n\n#echt')
  expect(n.tags).toContain('echt')
  expect(n.tags).not.toContain('include')
  expect(n.tags).not.toContain('inline')
})

test('eine Zahl ist keine Marke, ein Wort mit Raute davor schon', () => {
  // `#1` ist eine Aufzählung, `#2026` ein Jahr — beide keine Marken.
  const n = noteAus('a.md', '# T\n#1 erstens\n#2026\n#echt')
  expect(n.tags).toEqual(['echt'])
})

// ── Verweise ─────────────────────────────────────────────────────────────────────────────────

test('Verweise werden auf den Zielnamen vereinfacht', () => {
  const links = verweiseAus('[[Ziel]] und [[Ziel|Anzeigetext]] und [[Andere#Abschnitt]]')
  expect(links.map((l) => l.ziel)).toEqual(['Ziel', 'Andere'])
  // Zweimal dasselbe Ziel ist **eine** Kante.
  expect(links.length).toBe(2)
})

test('ein Verweis im Codeblock ist kein Verweis', () => {
  const links = verweiseAus('```\n[[im-code]]\n```\n[[echt]]')
  expect(links.map((l) => l.ziel)).toEqual(['echt'])
})

// ── Der Graph ────────────────────────────────────────────────────────────────────────────────

test('Kanten entstehen nur zwischen vorhandenen Notizen — und nie auf sich selbst', () => {
  const notizen: ObsidianNote[] = [
    { id: 'A.md', titel: 'A', text: '', tags: [], links: [{ ziel: 'B', offen: false }, { ziel: 'Gibtsnicht', offen: false }, { ziel: 'A', offen: false }], groesse: 0 },
    { id: 'B.md', titel: 'B', text: '', tags: [], links: [{ ziel: 'a', offen: false }], groesse: 0 },
  ]
  const g = graphAus(notizen)
  expect(g.kanten).toEqual([
    { von: 'A.md', nach: 'B.md' },
    { von: 'B.md', nach: 'A.md' },
  ])
  // Ein Verweis ins Leere ist **offen**, nicht verschwunden — und wird gezählt.
  expect(g.offeneVerweise).toBe(1)
  // **Die Schreibweise zählt nicht**: `[[a]]` findet `A.md`.
  expect(g.notizen[1]?.links[0]).toEqual({ ziel: 'A.md', offen: false })
})

// ── Das Lesen ────────────────────────────────────────────────────────────────────────────────

const ordner = mkdtempSync(join(tmpdir(), 'pmh-vault-'))
afterAll(() => rmSync(ordner, { recursive: true, force: true }))

test('der Leser überspringt .obsidian, .canvas und alles, was keine Notiz ist', () => {
  mkdirSync(join(ordner, '.obsidian'), { recursive: true })
  mkdirSync(join(ordner, 'Themen'), { recursive: true })
  writeFileSync(join(ordner, '.obsidian', 'workspace.json'), '{"x":1}')
  writeFileSync(join(ordner, 'Themen', 'Alpha.md'), '# Alpha\n\nSiehe [[Beta]].\n', 'utf8')
  writeFileSync(join(ordner, 'Beta.md'), '# Beta\n\n#marke\n', 'utf8')
  writeFileSync(join(ordner, 'Bild.canvas'), '{}', 'utf8')
  writeFileSync(join(ordner, 'Anhang.txt'), 'kein markdown', 'utf8')

  const g = leseVault(ordner)
  expect(g.notizen.map((n) => n.id).sort()).toEqual(['Beta.md', 'Themen/Alpha.md'])
  expect(g.kanten).toEqual([{ von: 'Themen/Alpha.md', nach: 'Beta.md' }])
  // **`.obsidian` ist kein Ordner im Graphen** — die Zahl zählt nur Inhaltsordner.
  expect(g.ordner).toBe(1)
  expect(g.notizen.find((n) => n.id === 'Beta.md')?.tags).toContain('marke')
})

test('ein fehlender Vault ist ein Fehler mit dem Pfad — kein leerer Graph', () => {
  /*
   * **Warum das wichtig ist.** Ein nicht vorhandener Vault und ein leerer Vault sähen sonst gleich aus:
   * „0 Notizen". Der eine ist ein Tippfehler im Pfad, der andere ein neuer Vault — und wer beides
   * verwechselt, sucht den Fehler in der Anzeige statt im Pfad.
   */
  expect(() => leseVault(join(ordner, 'gibtsnicht'))).toThrow(/nicht gefunden/u)
})
