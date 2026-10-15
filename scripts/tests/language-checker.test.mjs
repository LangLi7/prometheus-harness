/**
 * Test des Sprachprüfers — **die Prüfung muß rot werden können**.
 *
 * Arbeitsweise Regel 5: „Ein Wächter, dessen Gegenprobe nicht rot werden kann, mißt nichts."
 * Dieser Test baut deshalb fünf absichtlich kaputte Pakete und verlangt, daß **genau** der
 * erwartete Fehler gemeldet wird — und einen sauberen Fall, der **keinen** Fehler ergibt.
 *
 * Die grüne Vorlage ist echt: `common` aus `packages/client/locale/de.json` (41 Texte,
 * gemessen vollständig gegen `docs/status/sprachquelle.json`).
 *
 * ```powershell
 * bun test scripts/tests/language-checker.test.mjs
 * ```
 *
 * @module scripts/tests/sprachpruefer.test
 */

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { pruefe } from '../sprachpruefer.mjs'

const quelle = JSON.parse(readFileSync('docs/status/sprachquelle.json', 'utf8'))
const paket = JSON.parse(readFileSync('packages/client/locale/de.json', 'utf8'))

/** Eine tiefe Kopie eines Faches, damit ein Test das Original nicht verändert. */
function kopie(ns) {
  return JSON.parse(JSON.stringify({ [ns]: paket[ns] }))
}

describe('Sprachprüfer', () => {
  test('die echte Vorlage `common` ist fehlerfrei', () => {
    const { fehler, geprueft } = pruefe(quelle, kopie('common'), ['common'])
    expect(fehler).toEqual([])
    expect(geprueft).toBe(41)
  })

  test('fehlender Schlüssel wird als Fehler gemeldet', () => {
    const p = kopie('common')
    delete p.common.ok
    const { fehler } = pruefe(quelle, p, ['common'])
    expect(fehler.length).toBe(1)
    expect(fehler[0]).toContain('ok')
    // Seit der Trennung von „fehlt" und „ist leer" lautet die Meldung hier nur „fehlt".
    expect(fehler[0]).toContain('fehlt')
  })

  test('leerer Wert wird als Fehler gemeldet', () => {
    const p = kopie('common')
    p.common.cancel = ''
    const { fehler } = pruefe(quelle, p, ['common'])
    expect(fehler.length).toBe(1)
    expect(fehler[0]).toContain('fehlt oder ist leer')
  })

  test('verlorener Platzhalter wird als Fehler gemeldet', () => {
    const p = kopie('common')
    // Englisch: "… at {total} characters"; der Platzhalter darf nicht verschwinden.
    const schluessel = 'markdown.truncatedCharacters'
    expect(p.common[schluessel]).toContain('{total}')
    p.common[schluessel] = '… bei Zeichen abgeschnitten'
    const { fehler } = pruefe(quelle, p, ['common'])
    expect(fehler.length).toBe(1)
    expect(fehler[0]).toContain('Platzhalter')
    expect(fehler[0]).toContain('{total}')
  })

  test('ein zweiter Platzhalter derselben Art wird bemerkt (Anzahl, nicht nur Menge)', () => {
    const p = kopie('common')
    const schluessel = 'markdown.truncatedCharacters'
    p.common[schluessel] = '… bei {total} von {total} Zeichen abgeschnitten'
    const { fehler } = pruefe(quelle, p, ['common'])
    expect(fehler.length).toBe(1)
    expect(fehler[0]).toContain('Platzhalter')
  })

  test('erfundener Schlüssel wird als Fehler gemeldet', () => {
    const p = kopie('common')
    p.common['gibt.es.nicht'] = 'erfunden'
    const { fehler } = pruefe(quelle, p, ['common'])
    expect(fehler.length).toBe(1)
    expect(fehler[0]).toContain('gibt.es.nicht')
    expect(fehler[0]).toContain('NICHT in der Quelle')
  })

  test('erfundener Namensraum wird als Fehler gemeldet', () => {
    const { fehler } = pruefe(quelle, { 'dsh-client-ui-layout': { toggle: 'Umschalten' } }, ['dsh-client-ui-layout'])
    expect(fehler.length).toBe(1)
    expect(fehler[0]).toContain('kennt die Quelle NICHT')
  })

  test('verschobenes Leerzeichen am Rand wird gemeldet', () => {
    const p = kopie('common')
    p.common['copy.optionsHint'] = ' {action}; Rechtsklick für Kopieroptionen'
    const { fehler } = pruefe(quelle, p, ['common'])
    expect(fehler.length).toBe(1)
    expect(fehler[0]).toContain('Leerzeichen am Rand')
  })

  test('unverändert englischer Text ist Verdacht, kein Fehler', () => {
    const p = kopie('common')
    p.common.cancel = 'Cancel'
    const { fehler, verdacht } = pruefe(quelle, p, ['common'])
    expect(fehler).toEqual([])
    expect(verdacht.length).toBe(1)
    expect(verdacht[0]).toContain('unverändert englisch')
    expect(verdacht[0]).toContain('Cancel')
  })

  test('Kürzel wie JSON gelten NICHT als unübersetzt (Lehre aus dem ersten Lauf)', () => {
    // `json.label` heißt im Englischen wie im Deutschen „JSON". Die erste Fassung meldete das
    // als Verdacht; der Test hält fest, daß es das nicht mehr tut.
    const { verdacht } = pruefe(quelle, kopie('common'), ['common'])
    expect(verdacht.filter((v) => v.includes('json.label'))).toEqual([])
  })

  test('ein fehlendes Fach ist Verdacht, kein Fehler', () => {
    const { fehler, verdacht } = pruefe(quelle, {}, ['common', 'chat'])
    expect(fehler).toEqual([])
    expect(verdacht.length).toBe(2)
    expect(verdacht[1]).toContain('chat')
    expect(verdacht[1]).toContain('190 Texte offen')
  })

  // ---------------------------------------------------------------------------
  // Leere Werte. **Diese vier Prüfungen entstanden aus einem eigenen Fehler:**
  // die Regel „kein Wert ist leer" hatte einen Übersetzer gezwungen, für
  // `chat · message.stepProcess.sharedPrefix` (englisch `""`) das Wort „Erledigt"
  // zu erfinden — und damit das Verhalten der Oberfläche zu ändern.
  // ---------------------------------------------------------------------------
  const leereQuelle = { faecher: { x: { englisch: { leer: '', nurLeerzeichen: ' ', wort: 'Word' } } } }

  test('leerer englischer Wert darf und muß leer bleiben', () => {
    const { fehler } = pruefe(leereQuelle, { x: { leer: '', nurLeerzeichen: ' ', wort: 'Wort' } }, ['x'])
    expect(fehler).toEqual([])
  })

  test('ein gefüllter leerer Wert wird als Fehler gemeldet', () => {
    const { fehler } = pruefe(leereQuelle, { x: { leer: 'Erledigt', nurLeerzeichen: ' ', wort: 'Wort' } }, ['x'])
    expect(fehler.length).toBe(1)
    expect(fehler[0]).toContain('englischer Wert ist leer')
    expect(fehler[0]).toContain('Erledigt')
  })

  test('ein nur aus Leerzeichen bestehender Wert bleibt genau so', () => {
    const { fehler } = pruefe(leereQuelle, { x: { leer: '', nurLeerzeichen: '  ', wort: 'Wort' } }, ['x'])
    expect(fehler.length).toBe(1)
    expect(fehler[0]).toContain('Leerraum weicht ab')
  })

  test('ein leerer deutscher Wert bei gefülltem englischen ist ein Fehler', () => {
    const { fehler } = pruefe(leereQuelle, { x: { leer: '', nurLeerzeichen: ' ', wort: '' } }, ['x'])
    expect(fehler.length).toBe(1)
    expect(fehler[0]).toContain('fehlt oder ist leer')
  })

  test('der eine echte leere Wert der Quelle ist bekannt und bleibt leer', () => {
    const schluessel = 'message.stepProcess.sharedPrefix'
    const en = quelle.faecher.chat?.englisch[schluessel]
    expect(en).toBe('')
    // Und die Prüfung verlangt für ihn Leere, nicht Text.
    const { fehler } = pruefe(quelle, { chat: { [schluessel]: 'Erledigt' } }, ['chat'])
    expect(fehler.some((f) => f.includes('englischer Wert ist leer'))).toBe(true)
  })

  test('die Quelle führt die Laufzeit-Namensräume — Untergrenze statt festem Wert', () => {
    // Hier stand `toBe(56)`. Mit dem Sprachbündel der Vorlage kam am 14.10.2026 das Fach
    // `voice-input` dazu (57 Fächer, 2483 Texte) — und der Test wurde rot, obwohl nichts
    // kaputt war. Eine Menge, die **wächst**, wird gegen eine **Untergrenze** geprüft.
    expect(Object.keys(quelle.faecher).length).toBeGreaterThanOrEqual(57)
    // Die vier unabhängigen Gegenproben bleiben dagegen **exakt**: sie sind der eigentliche
    // Beweis, daß die Extraktion stimmt.
    expect(Object.keys(quelle.faecher.chat.englisch).length).toBe(190)
    expect(Object.keys(quelle.faecher.conversation.englisch).length).toBe(371)
    expect(Object.keys(quelle.faecher.cordis.englisch).length).toBe(51)
    expect(Object.keys(quelle.faecher.deliverables.englisch).length).toBe(60)
  })
})
