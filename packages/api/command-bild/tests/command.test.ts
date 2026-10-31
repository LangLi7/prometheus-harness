/**
 * Der Befehl `/bild` — geprüft wird das **Lesen der Zeile**, nicht das Zeichnen.
 *
 * Ein Test, der ein Bild erzeugt, kostet Geld und prüft den Dienst, nicht den Befehl. Was hier
 * geprüft wird, ist die Stelle, an der ein Tippfehler teuer wird: aus einer Zeile muß genau das
 * werden, was der Mensch gemeint hat — oder ein Fehler.
 *
 * @module @prometheus-harness/command-bild/tests/command
 */

import { describe, expect, test } from 'bun:test'

import { STILZUSATZ, liesAuftrag, promptFuer } from '../src/index.ts'

describe('Die Zeile lesen', () => {
  test('nur Text ergibt nur Text', () => {
    const gelesen = liesAuftrag('ein Fuchs im Schnee')
    expect(gelesen.ok).toBe(true)
    if (gelesen.ok) expect(gelesen.auftrag).toEqual({ text: 'ein Fuchs im Schnee' })
  })

  test('--stil wird gelesen und aus dem Text entfernt', () => {
    const gelesen = liesAuftrag('--stil icon ein Flammenlogo')
    expect(gelesen.ok).toBe(true)
    if (gelesen.ok) {
      expect(gelesen.auftrag.stil).toBe('icon')
      expect(gelesen.auftrag.text).toBe('ein Flammenlogo')
    }
  })

  test('--format und --auflösung (mit Umlaut) werden gelesen', () => {
    const gelesen = liesAuftrag('--format 16:9 --auflösung 2K ein Fuchs')
    expect(gelesen.ok).toBe(true)
    if (gelesen.ok) {
      expect(gelesen.auftrag.seitenverhaeltnis).toBe('16:9')
      expect(gelesen.auftrag.aufloesung).toBe('2K')
      expect(gelesen.auftrag.text).toBe('ein Fuchs')
    }
  })

  test('--aufloesung ohne Umlaut zählt genauso', () => {
    const gelesen = liesAuftrag('--aufloesung 4K ein Fuchs')
    expect(gelesen.ok).toBe(true)
    if (gelesen.ok) expect(gelesen.auftrag.aufloesung).toBe('4K')
  })

  test('ein UNBEKANNTES Flag ist ein Fehler — kein stiller Text', () => {
    const gelesen = liesAuftrag('--bild gros ein Fuchs')
    expect(gelesen.ok).toBe(false)
    if (!gelesen.ok) expect(gelesen.fehler).toContain('Unbekanntes Flag')
  })

  test('ein unbekannter Stil ist ein Fehler — mit den erlaubten', () => {
    const gelesen = liesAuftrag('--stil comic ein Fuchs')
    expect(gelesen.ok).toBe(false)
    if (!gelesen.ok) expect(gelesen.fehler).toContain('foto, illustration, icon')
  })

  test('ein Flag ohne Wert ist ein Fehler', () => {
    const gelesen = liesAuftrag('ein Fuchs --stil')
    expect(gelesen.ok).toBe(false)
    if (!gelesen.ok) expect(gelesen.fehler).toContain('fehlt der Wert')
  })

  test('ohne Beschreibung wird nichts gezeichnet', () => {
    const gelesen = liesAuftrag('--stil icon')
    expect(gelesen.ok).toBe(false)
    if (!gelesen.ok) expect(gelesen.fehler).toContain('Ohne Beschreibung')
  })

  test('--pfad wird übernommen', () => {
    const gelesen = liesAuftrag('--pfad assets/logo/neu.png ein Dreieck')
    expect(gelesen.ok).toBe(true)
    if (gelesen.ok) expect(gelesen.auftrag.pfad).toBe('assets/logo/neu.png')
  })
})

describe('Der Prompt', () => {
  test('ohne Stil bleibt der Text unverändert', () => {
    expect(promptFuer({ text: 'ein Fuchs' })).toBe('ein Fuchs')
  })

  test('mit Stil wird der Zusatz ANGEFÜGT — das Motiv bleibt vorn', () => {
    const prompt = promptFuer({ text: 'ein Fuchs', stil: 'foto' })
    expect(prompt.startsWith('ein Fuchs')).toBe(true)
    expect(prompt).toContain(STILZUSATZ.foto)
  })

  test('jeder Stil hat einen eigenen Zusatz', () => {
    const alle = new Set([STILZUSATZ.foto, STILZUSATZ.illustration, STILZUSATZ.icon])
    expect(alle.size).toBe(3)
  })
})
