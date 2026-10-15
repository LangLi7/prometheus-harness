/**
 * Prüfungen für {@link module:scripts/readme-paarung}.
 *
 * **Warum diese Datei mehr prüft als „zwei Dateien haben gleich viele
 * Überschriften".** Der Prüfer ist die einzige Maschine, die merkt, wenn die
 * englische und die deutsche Fassung auseinandergehen. Fällt er selbst aus —
 * weil er Code-Blöcke falsch erkennt oder Anker verwechselt —, dann **meldet er
 * „gekoppelt" und die Fassungen driften trotzdem**. Genau die Sorte grüner
 * Prüfung, die nichts prüft.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  PAARUNGEN,
  pruefeAlle,
  pruefePaarung,
  pruefeSprungmarken,
  vergleiche,
  zerlege,
} from '../readme-paarung.mjs'

const WURZEL = join(import.meta.dir, '..', '..')

describe('zerlege', () => {
  test('zählt Überschriften mit ihrer Ebene', () => {
    const r = zerlege('# A\n## B\n### C')
    expect(r.ueberschriften).toEqual([
      { ebene: 1, text: 'A' },
      { ebene: 2, text: 'B' },
      { ebene: 3, text: 'C' },
    ])
  })

  test('Überschriften INNERHALB eines Code-Blocks zählen nicht', () => {
    // **Der Fehler, der hier verhindert wird.** In den READMEs stehen
    // JSON-Antworten in Code-Blöcken, und die beginnen mit `#`-Kommentaren —
    // gemessen: drei Zeilen der englischen Fassung sahen wie eine Überschrift
    // aus. Würden sie mitgezählt, hinge die Zahl davon ab, was im Beispiel steht.
    const r = zerlege('# Echt\n\n```jsonc\n# kein Titel\n# auch nicht\n```\n\n## Noch echt')
    expect(r.ueberschriften).toHaveLength(2)
    expect(r.codeBloecke).toBe(1)
  })

  test('zählt Code-Blöcke, auch mehrere', () => {
    expect(zerlege('```\na\n```\n\n```sh\nb\n```').codeBloecke).toBe(2)
  })

  test('~~~ zählt als Code-Block wie ```', () => {
    const r = zerlege('# A\n~~~\n# kein Titel\n~~~\n## B')
    expect(r.ueberschriften).toHaveLength(2)
    expect(r.codeBloecke).toBe(1)
  })

  test('Links innerhalb eines Code-Blocks zählen nicht', () => {
    // Ein Beispiel-Link in einem Code-Block zeigt nicht auf eine Datei dieses
    // Projekts — er darf die Paarung nicht stören.
    const r = zerlege('# A\n\n```\n[siehe](gibt-es-nicht.md)\n```\n\n[echt](docs/concept.md)')
    expect(r.linkziele).toEqual(['docs/concept.md'])
  })

  test('nimmt relative Linkziele, nicht absolute und nicht Sprungmarken', () => {
    const r = zerlege('[a](docs/x.md) [b](https://example.com) [c](#anker) [d](README.de.md)')
    expect(r.linkziele).toEqual(['README.de.md', 'docs/x.md'])
  })

  test('entdoppelt Linkziele und sortiert sie', () => {
    // Zweimal derselbe Link ist keine zweite Aussage.
    const r = zerlege('[a](x.md) [b](x.md) [c](a.md)')
    expect(r.linkziele).toEqual(['a.md', 'x.md'])
  })

  test('findet die Ankerziele `<a id="…">`', () => {
    const r = zerlege('<a id="eins"></a>\n## A\n<a id="zwei"></a>\n## B')
    expect(r.anker).toEqual(['eins', 'zwei'])
  })

  test('ein leerer Text ergibt leere Listen', () => {
    const r = zerlege('')
    expect(r.ueberschriften).toEqual([])
    expect(r.codeBloecke).toBe(0)
    expect(r.linkziele).toEqual([])
    expect(r.anker).toEqual([])
  })
})

describe('vergleiche', () => {
  const A = zerlege('# Titel\n## Summary\n### Detail\n\n[x](docs/a.md)\n\n```sh\nls\n```')
  const B = zerlege('# Titel\n## Zusammenfassung\n### Einzelheit\n\n[y](docs/a.md)\n\n```sh\nls\n```')

  test('gleiche Struktur mit anderem Text ist gekoppelt', () => {
    // **Der Kern der Sache.** Übersetzungen sind keine Abbildungen: „Summary" und
    // „Zusammenfassung" sind beide richtig. Ein Wortvergleich ergäbe bei jedem
    // Lauf Fehlalarme, die Prüfung würde abgeschaltet — und dann fände sie den
    // echten Fehler nicht mehr.
    expect(vergleiche(A, B)).toEqual([])
  })

  test('eine fehlende Überschrift wird gemeldet', () => {
    const kurz = zerlege('# Titel\n## Summary')
    const befunde = vergleiche(A, kurz)
    expect(befunde.some((b) => b.includes('Anzahl der Überschriften'))).toBe(true)
  })

  test('eine falsche Ebene wird gemeldet', () => {
    const falsch = zerlege('# Titel\n## Summary\n## Detail\n\n[x](docs/a.md)\n\n```sh\nls\n```')
    const befunde = vergleiche(A, falsch)
    expect(befunde.some((b) => b.includes('Ebene'))).toBe(true)
  })

  test('ein fehlender Code-Block wird gemeldet', () => {
    const ohne = zerlege('# Titel\n## Summary\n### Detail\n\n[x](docs/a.md)')
    expect(vergleiche(A, ohne).some((b) => b.includes('Code-Blöcke'))).toBe(true)
  })

  test('ein anderes Linkziel wird gemeldet — es zeigt auf eine andere Datei', () => {
    const anders = zerlege('# Titel\n## Summary\n### Detail\n\n[x](docs/b.md)\n\n```sh\nls\n```')
    const befunde = vergleiche(A, anders)
    expect(befunde.some((b) => b.includes('Linkziel nur in der ersten'))).toBe(true)
    expect(befunde.some((b) => b.includes('Linkziel nur in der zweiten'))).toBe(true)
  })

  test('ein fehlender Anker wird gemeldet', () => {
    const mitAnker = zerlege('<a id="eins"></a>\n# Titel\n## Summary\n### Detail\n\n[x](docs/a.md)\n\n```sh\nls\n```')
    const befunde = vergleiche(A, mitAnker)
    expect(befunde.some((b) => b.includes('Anker nur in der zweiten'))).toBe(true)
  })
})

describe('pruefeSprungmarken', () => {
  test('ein Verweis auf ein vorhandenes Ziel ist in Ordnung', () => {
    expect(pruefeSprungmarken(zerlege('<a id="ziel"></a>\n## A\n\n[siehe](#ziel)'))).toEqual([])
  })

  test('ein Verweis ohne Ziel wird gemeldet', () => {
    // **Der Fehler, den der Paarungsvergleich NICHT findet.** Er stellt fest, ob
    // die Ankerziele zweier Fassungen gleich sind — nicht, ob die Verweise
    // innerhalb einer Fassung auf ein Ziel zeigen. Gemessen am 13.10.2026: die
    // deutsche Fassung verwies noch auf einen Anker, den es nicht mehr gab, und
    // der Prüfer meldete „ok".
    const befunde = pruefeSprungmarken(zerlege('<a id="ziel"></a>\n## A\n\n[siehe](#gibt-es-nicht)'))
    expect(befunde).toHaveLength(1)
    expect(befunde[0]).toContain('gibt-es-nicht')
  })

  test('Verweise in Code-Blöcken zählen nicht', () => {
    const r = zerlege('```\n[a](#kein-ziel)\n```\n<a id="ziel"></a>\n[x](#ziel)')
    expect(r.sprungmarken).toEqual(['ziel'])
  })

  test('mehrfach derselbe tote Verweis wird einmal gemeldet', () => {
    const befunde = pruefeSprungmarken(zerlege('[a](#tot) [b](#tot)'))
    expect(befunde).toHaveLength(1)
  })
})

describe('pruefePaarung', () => {
  test('meldet fehlende Dateien, statt zu werfen', () => {
    const { befunde, fehlend } = pruefePaarung(join(WURZEL, 'gibt-es-nicht.md'), join(WURZEL, 'README.md'))
    expect(fehlend).toHaveLength(1)
    expect(befunde).toEqual([])
  })

  test('die echten READMEs sind gekoppelt', () => {
    // **Die Prüfung, um die es geht.** Läuft eine Änderung nur in einer Fassung
    // ein, wird dieser Fall rot — und zwar im Testlauf, nicht erst beim Lesen.
    for (const [a, b] of PAARUNGEN) {
      const { befunde, fehlend } = pruefePaarung(join(WURZEL, a), join(WURZEL, b))
      expect(fehlend, `${a} oder ${b} fehlt`).toEqual([])
      expect(befunde, befunde.join('; ')).toEqual([])
    }
  })

  test('pruefeAlle zählt null Befunde für dieses Projekt', () => {
    const gesammelt = []
    const befunde = pruefeAlle({ schreibe: (t) => gesammelt.push(t), wurzel: WURZEL })
    expect(befunde).toBe(0)
    expect(gesammelt.join('')).toContain('ok')
  })
})

describe('die READMEs selbst', () => {
  const en = readFileSync(join(WURZEL, 'README.md'), 'utf8')
  const de = readFileSync(join(WURZEL, 'README.de.md'), 'utf8')

  test('beide nennen die andere Fassung', () => {
    // Ohne diesen Hinweis findet niemand die zweite Sprache — und eine
    // unauffindbare Übersetzung ist keine.
    expect(en).toContain('README.de.md')
    expect(de).toContain('README.md')
  })

  test('beide tragen den Kopfblock der Vorlage', () => {
    // Gemessen an `@deepseek-ai/dsh-web-app/README.md`: Frontmatter mit
    // `description` und `kind`.
    for (const text of [en, de]) {
      expect(text.startsWith('---\n')).toBe(true)
      expect(text).toMatch(/^description: "/mu)
      expect(text).toMatch(/^kind: "/mu)
    }
  })

  test('beide haben ein Inhaltsverzeichnis mit Ankern', () => {
    // **Der eigene Fehler, der hier stand.** Die Prüfung erwartete in beiden
    // Fassungen „Table of Contents" — die deutsche schreibt aber
    // „Inhaltsverzeichnis", und das ist richtig. Eine Prüfung, die eine
    // Übersetzung erzwingt, ist keine Kopplungsprüfung, sondern ein Wortverbot.
    expect(en).toContain('Table of Contents')
    expect(de).toContain('Inhaltsverzeichnis')
    for (const text of [en, de]) {
      // `[^"]+` und nicht `\<a` — in einem Regex-Literal mit dem `u`-Schalter ist
      // `\<` ein ungültiges Escape-Zeichen, und der Test scheiterte am Muster
      // statt an der Sache.
      expect(/<a id="[^"]+"><\/a>/u.test(text)).toBe(true)
    }
  })

  test('die Abschnitte der Vorlage sind vorhanden', () => {
    // Die Struktur ist die der Vorlage: Summary, Table of Contents, Use,
    // Implementation, Further Exploration, Model Experience, Known Limitations.
    for (const text of [en, de]) {
      for (const wort of ['## Summary', '## Table of Contents', '## Known Limitations']) {
        const deutsch = { '## Summary': '## Zusammenfassung', '## Table of Contents': '## Inhaltsverzeichnis', '## Known Limitations': '## Bekannte Grenzen' }[wort]
        expect(text.includes(wort) || text.includes(deutsch), `${wort} fehlt`).toBe(true)
      }
    }
  })

  test('keine erfundene Zahl ohne Befehl', () => {
    // **Die Hausregel.** Jede Zahl nennt den Befehl, der sie gemessen hat.
    //
    // **Geändert am 14.10.2026 — und der Grund ist die Lehre selbst.** Hier stand
    // `expect(text).toMatch(/826/)`. Die Zahl war einmal gemessen und dann
    // **falsch geworden**: 826 Prüfungen und 18 Pakete waren der Stand, bevor die
    // Suite auf 55 Dateien und 25 Pakete wuchs. Die Prüfung nagelte damit eine
    // **veraltete** Zahl fest und **verhinderte ihre Korrektur** — ein Wächter,
    // der die Wahrheit blockiert, und der Betreiber hat genau das an der README
    // bemerkt (sie widersprach dem Code).
    //
    // Jetzt pinnt sie die **aktuelle** Messung. Wer sie ändert, muß sie erneut
    // nachziehen — das ist die Absicht. Aber sie schützt ab hier **nur noch
    // Zahlen, die jemand gemessen hat**, nicht Zahlen, die einmal galten.
    for (const text of [en, de]) {
      expect(text).toMatch(/1189/)
      expect(text).toContain('bun run typecheck')
      expect(text).toContain('bun test packages scripts apps')
    }
  })
})
