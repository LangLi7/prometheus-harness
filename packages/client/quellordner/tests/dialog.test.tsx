/**
 * Der Dialog — gerendert zu HTML, **ohne Browser** geprüft.
 *
 * ## Warum so und nicht am Bildschirm
 *
 * Auf diesem Rechner ist **kein Browser** installiert (gemessen: `chrome-devtools` meldet
 * *„Could not find Google Chrome executable"*; auch Edge und Firefox fehlen). Ein Bild ist hier
 * nicht zu bekommen — aber **Markup** ist zu bekommen: `react-dom/server` rendert dieselbe
 * Komponente zu HTML, und daran läßt sich jede Regel der Form prüfen.
 *
 * **Was das nicht beweist:** wie es **aussieht** — Farben, Abstände, Überlagerung über der Seite.
 * Das kann nur ein Bildschirm beurteilen. Hier steht, **was** da ist, nicht **wie** es wirkt.
 *
 * ## Die Regeln, die diese Prüfungen festhalten
 *
 * Der Arbeitsplatz ist primär und hat **keinen** Entfernen-Knopf und **keinen** Zugriffsschalter;
 * ein Zusatzordner hat beides. Wenn jemand später versehentlich den Knopf für alle zeigt, wird
 * diese Prüfung **rot** — sie ist keine Beschreibung, sondern ein Riegel.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuellordnerDialog, TEXTE, type Ordner } from '../src/dialog.tsx'

/** Der Arbeitsplatz. */
const PRIMAER: Ordner = {
  id: 'w1',
  pfad: 'C:\\Users\\Chang\\prometheus-harness',
  istPrimaer: true,
  zugriff: 'schreiben',
}

/** Ein Zusatzordner mit Schreibzugriff. */
const ZUSATZ: Ordner = {
  id: 'f1',
  pfad: 'C:\\Users\\Chang\\.pmh',
  istPrimaer: false,
  zugriff: 'schreiben',
  bezeichnung: 'Ablage',
}

/** Ein Zusatzordner, nur lesbar. */
const NUR_LESEN: Ordner = { id: 'f2', pfad: 'D:\\Bilder', istPrimaer: false, zugriff: 'lesen' }

/**
 * Rendert den Dialog zu HTML.
 *
 * @param eigenschaften - was der Dialog bekommt
 * @returns das HTML
 */
function html(eigenschaften: Partial<Parameters<typeof QuellordnerDialog>[0]> = {}): string {
  return renderToStaticMarkup(
    QuellordnerDialog({ name: 'Prüfbereich', ordner: [PRIMAER, ZUSATZ], ...eigenschaften }),
  )
}

// ---------------------------------------------------------------------------
// 1. Der Arbeitsplatz
// ---------------------------------------------------------------------------

describe('Der Arbeitsplatz', () => {
  test('ist als Primär gekennzeichnet', () => {
    const h = html()
    expect(h).toContain(TEXTE.primaer)
    expect(h).toContain('data-primaer="ja"')
  })

  test('hat KEINEN Entfernen-Knopf — und keinen Zugriffsschalter', () => {
    const h = html({ ordner: [PRIMAER] })
    // Der Arbeitsplatz läßt sich nicht entfernen: das steht im Schema, im Weg UND hier.
    expect(h).not.toContain('pmh-ordner-entfernen')
    expect(h).not.toContain('pmh-ordner-zugriff-schalten')
    // Und der Hinweis sagt, warum — die Oberfläche erklärt, statt nur abzuweisen.
    //
    // **Meine erste Fassung dieser Zeile verglich den Text MIT Anführungszeichen und war rot.**
    // Zu Recht: der Renderer **entschärft** sie zu `&quot;` (gemessen: `auf „nur lesen&quot;
    // stellen.`). Die Erwartung war falsch, nicht das Markup — und wer Markup mit rohem Text
    // vergleicht, vergleicht zwei verschiedene Dinge.
    expect(h).toContain('Der Arbeitsplatz läßt sich weder entfernen')
    expect(h).toContain('&quot;')
  })

  test('steht zuerst — auch wenn er in den Daten zuletzt kommt', () => {
    const h = html({ ordner: [ZUSATZ, PRIMAER, NUR_LESEN] })
    const stellePrimaer = h.indexOf(PRIMAER.pfad)
    const stelleZusatz = h.indexOf(ZUSATZ.pfad)
    expect(stellePrimaer).toBeGreaterThan(-1)
    expect(stelleZusatz).toBeGreaterThan(-1)
    expect(stellePrimaer).toBeLessThan(stelleZusatz)
  })
})

// ---------------------------------------------------------------------------
// 2. Die Zusatzordner
// ---------------------------------------------------------------------------

describe('Die Zusatzordner', () => {
  test('haben einen Entfernen-Knopf und einen Zugriffsschalter', () => {
    const h = html()
    expect(h).toContain('pmh-ordner-entfernen')
    expect(h).toContain('pmh-ordner-zugriff-schalten')
  })

  test('der Zugriff steht dabei — lesen oder schreiben', () => {
    expect(html({ ordner: [PRIMAER, NUR_LESEN] })).toContain(TEXTE.lesen)
    expect(html({ ordner: [PRIMAER, ZUSATZ] })).toContain(TEXTE.schreiben)
  })

  test('der Schalter bietet das jeweils ANDERE an', () => {
    // Bei Schreibzugriff heißt der Knopf „Nur lesen" und umgekehrt. Sonst wüßte niemand, was
    // ein Druck tut.
    const beiSchreiben = html({ ordner: [PRIMAER, ZUSATZ] })
    expect(beiSchreiben).toContain(`>${TEXTE.lesen}</button>`)
    const beiLesen = html({ ordner: [PRIMAER, NUR_LESEN] })
    expect(beiLesen).toContain(`>${TEXTE.schreiben}</button>`)
  })

  test('der PFAD steht immer da — auch wenn es einen Namen gibt', () => {
    // Ohne den Pfad weiß niemand, welcher Ordner gemeint ist; zwei Ordner können gleich heißen.
    const h = html()
    expect(h).toContain('C:\\Users\\Chang\\.pmh')
    expect(h).toContain('Ablage')
  })

  test('ein Ordner ohne Bezeichnung kommt ohne aus — kein leeres Feld', () => {
    const h = html({ ordner: [PRIMAER, NUR_LESEN] })
    expect(h).toContain('D:\\Bilder')
    expect(h).not.toContain('pmh-ordner-bezeichnung')
  })
})

// ---------------------------------------------------------------------------
// 3. Rahmen, Name, Fehler, Sperre
// ---------------------------------------------------------------------------

describe('Rahmen und Zustände', () => {
  test('der Dialog hat einen Titel und einen Schließen-Knopf', () => {
    const h = html()
    expect(h).toContain(TEXTE.titel)
    expect(h).toContain('role="dialog"')
    expect(h).toContain('pmh-quellordner-schliessen')
  })

  test('der Name steht im Feld', () => {
    expect(html({ name: 'Mein Bereich' })).toContain('value="Mein Bereich"')
  })

  test('ein Fehler wird gemeldet, nicht verschwiegen', () => {
    const h = html({ fehler: 'Der Pfad ist schon eingetragen.' })
    expect(h).toContain('role="alert"')
    expect(h).toContain('Der Pfad ist schon eingetragen.')
  })

  test('ohne Fehler steht kein leerer Warnkasten da', () => {
    expect(html()).not.toContain('role="alert"')
  })

  test('bei einem laufenden Vorgang sind die Knöpfe gesperrt', () => {
    const h = html({ beschaeftigt: true })
    const gesperrt = (h.match(/disabled=""/gu) ?? []).length
    // Schließen, Zugriffsschalter, Entfernen, Hinzufügen — alle vier.
    expect(gesperrt).toBeGreaterThanOrEqual(4)
  })

  test('ohne laufenden Vorgang ist nichts gesperrt', () => {
    expect(html()).not.toContain('disabled=""')
  })
})
