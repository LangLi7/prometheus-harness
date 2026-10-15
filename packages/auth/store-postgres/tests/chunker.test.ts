/**
 * Der Zerleger — geprüft, und zwar an den **Entscheidungen**, nicht an der Länge.
 *
 * ## Warum diese Prüfungen so aussehen
 *
 * Ein Zerleger, der „irgendwie Stücke macht", ist leicht grün zu bekommen. Die
 * Fragen, die zählen, sind andere: **bleibt der Sinn zusammen**, **findet man einen
 * Satz an einer Grenze noch**, **wird ein zu langer Satz hart geschnitten oder
 * zerrissen**, und **was passiert mit leerem Text**.
 *
 * **Und der Fall, der am leichtesten durchrutscht:** eine Überlappung von 1 (oder
 * mehr) ergäbe eine **Endlosschleife** — jedes Stück enthielte den ganzen
 * Vorgänger. Deshalb wird der Anteil **abgewiesen** statt zurechtgebogen.
 */

import { describe, expect, test } from 'bun:test'
import { ZERLEGER_VORGABEN, zerlege } from '../src/chunker.ts'

/** Ein Absatz mit n Sätzen. */
function absatz(saetze: number, laenge = 40): string {
  return Array.from({ length: saetze }, (_, i) => `Satz Nummer ${String(i)} ${'x'.repeat(laenge)}.`).join(' ')
}

describe('Die Grundfälle', () => {
  test('leerer Text und reine Leerzeichen geben KEINE Stücke', () => {
    // **Kein Stück für nichts.** Ein leeres Stück wäre eine Zeile in `chunks` ohne
    // Inhalt — und die Vektorsuche fände einen Treffer, der nichts bedeutet.
    expect(zerlege('')).toHaveLength(0)
    expect(zerlege('   \n\n  \t ')).toHaveLength(0)
  })

  test('ein kurzer Text gibt genau EIN Stück mit Ordnung 0', () => {
    const s = zerlege('Ein kurzer Absatz.')
    expect(s).toHaveLength(1)
    expect(s[0]?.ordnung).toBe(0)
    expect(s[0]?.text).toBe('Ein kurzer Absatz.')
    expect(s[0]?.zeichen).toBe(18)
    expect(s[0]?.token).toBe(5) // ceil(18/4)
  })

  test('die Ordnung ist lückenlos und beginnend bei 0', () => {
    // `chunks_ordinal_eindeutig` verlangt Eindeutigkeit je Dokument; die Suche
    // verläßt sich auf die Reihenfolge.
    const s = zerlege(Array.from({ length: 6 }, () => absatz(3)).join('\n\n'), { maxZeichen: 300 })
    expect(s.length).toBeGreaterThan(1)
    expect(s.map((x) => x.ordnung)).toEqual(s.map((_, i) => i))
  })

  test('`token` ist eine Schätzung — und das steht auch so da', () => {
    const s = zerlege('x'.repeat(400))
    expect(s[0]?.token).toBe(100)
    // Der Name der Vorgabe sagt es: es ist ein Zerleger, kein Tokenizer.
    expect(ZERLEGER_VORGABEN.maxZeichen).toBe(1200)
    expect(ZERLEGER_VORGABEN.ueberlappung).toBe(0.15)
  })
})

describe('Absätze sind die erste Grenze', () => {
  test('zwei Absätze werden ZWEI Stücke — nicht eines', () => {
    // **Der Sinn bleibt zusammen.** Wären sie eines, stünde der Anfang des zweiten
    // Absatzes in einem Stück, das vom ersten handelt.
    const s = zerlege('Erster Absatz.\n\nZweiter Absatz.', { ueberlappung: 0 })
    expect(s).toHaveLength(2)
    expect(s[0]?.text).toBe('Erster Absatz.')
    expect(s[1]?.text).toBe('Zweiter Absatz.')
  })

  test('\\r\\n zählt wie \\n, und mehrere Leerzeilen wie eine', () => {
    const s = zerlege('Eins.\r\n\r\nZwei.\n\n\n\nDrei.', { ueberlappung: 0 })
    expect(s.map((x) => x.text)).toEqual(['Eins.', 'Zwei.', 'Drei.'])
  })
})

describe('Die Überlappung', () => {
  test('ein Satz an der Grenze ist im NÄCHSTEN Stück vollständig zu finden', () => {
    // **Der Zweck der Überlappung, und der einzige Grund, sie zu zahlen.** Der Text
    // wird so gebaut, daß der letzte Satz eines Stücks genau an der Grenze liegt.
    const text = `${absatz(4)}\n\n${absatz(4)}`
    const ohne = zerlege(text, { maxZeichen: 200, ueberlappung: 0 })
    const mit = zerlege(text, { maxZeichen: 200, ueberlappung: 0.2 })
    expect(mit.length).toBe(ohne.length)
    // Mit Überlappung ist jedes Stück ab dem zweiten LÄNGER als ohne.
    expect((mit[1]?.zeichen ?? 0)).toBeGreaterThan(ohne[1]?.zeichen ?? 0)
    // Und der Anfang des zweiten Stücks steht im ersten noch einmal.
    const schwanzDesErsten = (mit[0]?.text ?? '').slice(-40)
    expect(mit[1]?.text).toContain(schwanzDesErsten.trim().slice(0, 20))
  })

  test('das ERSTE Stück hat keine Überlappung — es gibt keinen Vorgänger', () => {
    const s = zerlege(`${absatz(4)}\n\n${absatz(4)}`, { maxZeichen: 200, ueberlappung: 0.5 })
    expect(s[0]?.text.startsWith('…')).toBe(false)
    expect(s[1]?.text.startsWith('…')).toBe(true)
  })

  test('eine Überlappung von 1 oder mehr wird ABGEWIESEN', () => {
    // **Die Endlosschleife, die es sonst gäbe.** Bei Anteil 1 enthielte jedes Stück
    // den ganzen Vorgänger; der Text wüchse bei jedem Schritt — eine Schleife ohne
    // Ende. Deshalb wird abgewiesen statt zurechtgebogen.
    expect(() => zerlege('Text', { ueberlappung: 1 })).toThrow(/zwischen 0 und 1/u)
    expect(() => zerlege('Text', { ueberlappung: 1.5 })).toThrow(/zwischen 0 und 1/u)
    expect(() => zerlege('Text', { ueberlappung: -0.1 })).toThrow(/zwischen 0 und 1/u)
    // 0 ist erlaubt: keine Überlappung.
    expect(zerlege('Text', { ueberlappung: 0 })).toHaveLength(1)
  })

  test('eine unsinnige Höchstlänge wird abgewiesen', () => {
    expect(() => zerlege('Text', { maxZeichen: 0 })).toThrow(/positive ganze Zahl/u)
    expect(() => zerlege('Text', { maxZeichen: -5 })).toThrow(/positive ganze Zahl/u)
    expect(() => zerlege('Text', { maxZeichen: 2.5 })).toThrow(/positive ganze Zahl/u)
  })
})

describe('Zu lange Absätze: Sätze, dann hart', () => {
  test('ein langer Absatz wird an SATZENDEN geteilt', () => {
    const text = absatz(20, 60) // rund 1.300 Zeichen
    const s = zerlege(text, { maxZeichen: 300, ueberlappung: 0 })
    expect(s.length).toBeGreaterThan(1)
    // **Jedes Stück endet auf einem Satzzeichen** — außer dem letzten, und das ist
    // der Beweis, daß an Sätzen geteilt wurde und nicht hart.
    for (const stueck of s.slice(0, -1)) {
      expect(/[.!?]$/u.test(stueck.text.trim())).toBe(true)
    }
  })

  test('ein EINZELNER zu langer Satz wird hart geschnitten — und nichts geht verloren', () => {
    // Die letzte Möglichkeit. Geprüft wird, daß sie **greift** und daß der Text
    // dabei vollständig bleibt: aus den Stücken läßt sich der Satz zurückgewinnen.
    const satz = `Ein Satz ohne Punkt ${'y'.repeat(500)}`
    const s = zerlege(satz, { maxZeichen: 100, ueberlappung: 0 })
    expect(s.length).toBeGreaterThan(1)
    expect(s.every((x) => x.zeichen <= 100)).toBe(true)
    expect(s.map((x) => x.text).join('')).toBe(satz)
  })

  test('kein Stück überschreitet die Höchstlänge — bei vielen Absätzen', () => {
    const text = Array.from({ length: 12 }, () => absatz(5, 50)).join('\n\n')
    const s = zerlege(text, { maxZeichen: 400, ueberlappung: 0 })
    for (const stueck of s) expect(stueck.zeichen).toBeLessThanOrEqual(400)
  })
})
