/**
 * Der Stand — **rein** geprüft, ohne Browser und ohne Host.
 *
 * ## Warum diese beiden Funktionen eigene Prüfungen verdienen
 *
 * Beide waren schon einmal **falsch**, und beide Fehler waren **still**:
 *
 * 1. Ich las den CSRF-Wert aus einem **Meta-Feld**, das niemand setzt. Das Ergebnis wäre gewesen:
 *    kein CSRF-Wert → kein ändernder Aufruf. Und der Fehler hätte wie ein Rechteproblem
 *    ausgesehen. Gemessen steht er in einem **Keks** (`pmh_csrf`).
 * 2. Ein Keks wird als **Teil** eines anderen Namens gefunden, wenn man mit `includes` sucht. Wer
 *    `pmh_csrf` sucht, findet auch `xpmh_csrf` — und sendet einen fremden Wert.
 */

import { describe, expect, test } from 'bun:test'
import { CSRF_KEKS, arbeitsbereichId, csrfWert, wertAusKeks, type Arbeitsbereichsstand } from '../src/state.ts'

// ---------------------------------------------------------------------------
// 1. Der Keks
// ---------------------------------------------------------------------------

describe('Der CSRF-Wert aus dem Keks', () => {
  test('der gemessene Name ist pmh_csrf', () => {
    // Die Fundstelle steht im Dateikopf: packages/auth/auth/src/session.ts:450.
    expect(CSRF_KEKS).toBe('pmh_csrf')
  })

  test('findet den Wert zwischen anderen Keksen', () => {
    expect(wertAusKeks('a=1; pmh_csrf=abc123; b=2', 'pmh_csrf')).toBe('abc123')
  })

  test('DER STILLE FALL: ein Keks, der den Namen nur ENTHÄLT, zählt nicht', () => {
    // Mit `includes` fände man hier „xpmh_csrf" und sendete dessen Wert — einen fremden.
    expect(wertAusKeks('xpmh_csrf=fremd; b=2', 'pmh_csrf')).toBeUndefined()
    expect(wertAusKeks('mein_pmh_csrf=fremd', 'pmh_csrf')).toBeUndefined()
  })

  test('der erste Treffer gewinnt', () => {
    expect(wertAusKeks('pmh_csrf=erst; pmh_csrf=zweit', 'pmh_csrf')).toBe('erst')
  })

  test('ein leerer Wert ist KEIN Wert', () => {
    // Ein leerer Text als CSRF-Kopf gäbe 403 `csrf-fehlt` — und sähe wie ein Rechteproblem aus.
    expect(wertAusKeks('pmh_csrf=; b=2', 'pmh_csrf')).toBeUndefined()
    expect(wertAusKeks('pmh_csrf=   ', 'pmh_csrf')).toBeUndefined()
  })

  test('ein kodierter Wert wird aufgelöst', () => {
    expect(wertAusKeks('pmh_csrf=a%20b', 'pmh_csrf')).toBe('a b')
  })

  test('ein unlesbarer Wert kommt unverändert durch — statt alles fallen zu lassen', () => {
    expect(wertAusKeks('pmh_csrf=%E0%A4%A', 'pmh_csrf')).toBe('%E0%A4%A')
  })

  test('ohne Kekse gibt es nichts', () => {
    expect(wertAusKeks('', 'pmh_csrf')).toBeUndefined()
    expect(wertAusKeks('a=1', 'pmh_csrf')).toBeUndefined()
  })

  test('csrfWert nimmt die übergebene Zeichenkette — und ohne Dokument nichts', () => {
    expect(csrfWert('pmh_csrf=xyz')).toBe('xyz')
    // Im Prüflauf gibt es kein `document`; die Vorgabe liefert dann `undefined` statt zu werfen.
    expect(csrfWert()).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. Der Arbeitsbereich
// ---------------------------------------------------------------------------

describe('Der Arbeitsbereich', () => {
  const A: Arbeitsbereichsstand = { workspaceId: 'w-a', sessionIds: ['s-1', 's-2'] }
  const B: Arbeitsbereichsstand = { workspaceId: 'w-b', sessionIds: ['s-3'] }

  test('die SITZUNG gewinnt', () => {
    expect(arbeitsbereichId([A, B], 's-3')).toBe('w-b')
  })

  test('ohne passende Sitzung gilt der ERSTE', () => {
    expect(arbeitsbereichId([A, B], 's-999')).toBe('w-a')
  })

  test('ohne Sitzung gilt der ERSTE — der Fall mit genau einem Projekt', () => {
    expect(arbeitsbereichId([A, B], undefined)).toBe('w-a')
  })

  test('eine Sitzung in einem späteren Bereich gewinnt gegen den ersten', () => {
    // Sonst zeigte der Dialog den falschen Bereich an — und der Nutzer änderte Ordner, die er
    // nicht meinte.
    expect(arbeitsbereichId([A, B], 's-3')).not.toBe('w-a')
  })

  test('OHNE Bereiche gibt es NICHTS — kein leerer Text', () => {
    // Ein leerer Text wäre eine Kennung, die es nicht gibt: der Weg antwortete mit
    // `arbeitsbereich-unbekannt`, und niemand erführe, daß es gar keinen Bereich gibt.
    expect(arbeitsbereichId([], undefined)).toBeUndefined()
    expect(arbeitsbereichId([], 's-1')).toBeUndefined()
  })

  test('eine Sitzung, die zu keinem Bereich gehört, fällt auf den ersten zurück', () => {
    const ohne: Arbeitsbereichsstand = { workspaceId: 'w-c', sessionIds: [] }
    expect(arbeitsbereichId([ohne, A], 's-1')).toBe('w-a')
  })
})
