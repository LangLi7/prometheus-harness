/**
 * Die Bildbrücke: Ausstattung ohne Schlüssel, Aufruf, Antwort, Werkzeug.
 *
 * Festgenagelt wird: der **Schlüssel verlässt die Ausstattung nicht**, die Antwort ohne `result`
 * ist **kein** Leseergebnis, ein **Fehlschlag wird geworfen** (der Loop macht daraus ein
 * Werkzeugergebnis), und das Werkzeug steht als `AgentTool` in der Registry, die der Anbieter sieht.
 */

import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Tools, toolSpecs } from '@prometheus-harness/agent-tools'

import {
  WERKZEUGNAME,
  baueAufruf,
  entschaerfe,
  liesAntwort,
  liesAusstattung,
  modlensWerkzeug,
  type Ausfuehren,
} from '../src/index.ts'

/** Eine gültige Antwort der CLI (gekürzt aus dem Vertrag). */
const ANTWORT = JSON.stringify({
  image: 'C:/bilder/schild.png',
  provider: 'openai',
  result: {
    summary: 'Ein blaues Schild mit weisser Aufschrift.',
    ocr: { full_text: 'HALLO', lines: [{ text: 'HALLO', language: 'de' }] },
    layout: { regions: [{ type: 'title', reading_order: 1, text: 'HALLO' }] },
    semantics: { scene: 'schild', entities: [{ name: 'Schild', type: 'objekt' }] },
    visual: { dominant_colors: ['blau'], style: 'flach' },
    uncertainty: [],
  },
  meta: { model: 'deepseek-flash', durationSeconds: 2.5, warnings: [] },
})

describe('Ausstattung', () => {
  test('eine fehlende Konfiguration ist kein Fehler, sondern gefunden=false', async () => {
    const ausstattung = liesAusstattung(join(tmpdir(), 'gibt-es-nicht-12345.json'))
    expect(ausstattung.gefunden).toBe(false)
    expect(ausstattung.hatSchluessel).toBe(false)
  })

  test('der Schlüssel wird gelesen, aber NICHT weitergegeben', async () => {
    const verzeichnis = await mkdtemp(join(tmpdir(), 'pmh-modlens-'))
    try {
      const pfad = join(verzeichnis, 'config.json')
      await writeFile(pfad, JSON.stringify({
        provider: 'openai',
        providers: { openai: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'sk-GEHEIM-123' } },
      }), 'utf8')
      const ausstattung = liesAusstattung(pfad)
      expect(ausstattung.gefunden).toBe(true)
      expect(ausstattung.hatSchluessel).toBe(true)
      expect(ausstattung.provider).toBe('openai')
      expect(ausstattung.modell).toBe('deepseek-flash')
      expect(ausstattung.basis).toBe('https://api.deepseek.com')
      // Der eine Satz, der zählt: der Wert steht nirgends im Ergebnis.
      expect(JSON.stringify(ausstattung)).not.toContain('GEHEIM')
    } finally {
      await rm(verzeichnis, { recursive: true, force: true })
    }
  })

  test('kaputtes JSON ergibt keine Auskunft', async () => {
    const verzeichnis = await mkdtemp(join(tmpdir(), 'pmh-modlens-'))
    try {
      const pfad = join(verzeichnis, 'config.json')
      await writeFile(pfad, 'kein json', 'utf8')
      expect(liesAusstattung(pfad).gefunden).toBe(false)
    } finally {
      await rm(verzeichnis, { recursive: true, force: true })
    }
  })

  test('Meldungen entschärfen Schlüsselwerte', () => {
    expect(entschaerfe('apiKey: sk-123 bitte pruefen')).toBe('apiKey: *** bitte pruefen')
    expect(entschaerfe('"api_key": "abc"')).toBe('"api_key": "***"')
    expect(entschaerfe('kein Geheimnis hier')).toBe('kein Geheimnis hier')
  })
})

describe('Aufruf und Antwort', () => {
  test('der Aufruf ruft die CLI mit Bild und Zeitlimit', () => {
    const aufruf = baueAufruf('C:/modlens/dist/main.js', { bild: 'C:/bilder/a.png', timeoutMs: 5000 }, 'node.exe')
    expect(aufruf.programm).toBe('node.exe')
    expect(aufruf.argumente).toEqual(['C:/modlens/dist/main.js', '-i', 'C:/bilder/a.png', '--timeout', '5000'])
  })

  test('Fokus, Anbieter und Modell kommen als Flaggen dazu', () => {
    const aufruf = baueAufruf('main.js', {
      bild: 'https://example.com/a.png',
      prompt: 'achte auf die Achsen',
      provider: 'openai',
      modell: 'deepseek-flash',
    })
    expect(aufruf.argumente).toContain('--prompt')
    expect(aufruf.argumente).toContain('openai')
    expect(aufruf.argumente).toContain('deepseek-flash')
  })

  test('ein leerer Pfad oder ein leeres Bild wird abgewiesen', () => {
    expect(() => baueAufruf(' ', { bild: 'a.png' })).toThrow(/Pfad/)
    expect(() => baueAufruf('main.js', { bild: ' ' })).toThrow(/Bildauftrag/)
    expect(() => baueAufruf('main.js', { bild: 'a.png', timeoutMs: 0 })).toThrow(/timeoutMs/)
  })

  test('eine gültige Antwort wird gelesen', () => {
    const antwort = liesAntwort(ANTWORT)
    expect(antwort.provider).toBe('openai')
    expect(antwort.model).toBe('deepseek-flash')
    expect(antwort.evidenz.summary).toContain('Schild')
    expect(antwort.evidenz.ocr.full_text).toBe('HALLO')
    expect(antwort.dauerSekunden).toBe(2.5)
  })

  test('was kein Leseergebnis ist, wird geworfen', () => {
    expect(() => liesAntwort('')).toThrow(/nichts aus/)
    expect(() => liesAntwort('kein json')).toThrow(/kein JSON/)
    expect(() => liesAntwort('"nur text"')).toThrow(/kein Objekt/)
    expect(() => liesAntwort('{"image":"a.png"}')).toThrow(/kein "result"/)
    expect(() => liesAntwort('{"result":{"ocr":{}}}')).toThrow(/summary/)
  })
})

describe('Werkzeug im Loop', () => {
  const lauf = (stdout: string, code = 0, stderr = ''): Ausfuehren => async () => ({ stdout, stderr, code })

  test('das Werkzeug steht in der Registry mit Pflichtfeld path', () => {
    const werkzeug = modlensWerkzeug({ cliPfad: 'main.js', ausfuehren: lauf(ANTWORT) })
    expect(werkzeug.name).toBe(WERKZEUGNAME)
    const registry = new Tools([werkzeug])
    const specs = toolSpecs(registry)
    expect(specs[0]?.name).toBe('modlens_read_image')
    expect((specs[0]?.parameters as { required?: string[] }).required).toEqual(['path'])
  })

  test('die Ausführung liefert die Evidenz als JSON', async () => {
    const werkzeug = modlensWerkzeug({ cliPfad: 'main.js', ausfuehren: lauf(ANTWORT) })
    const text = await werkzeug.execute({ path: 'C:/bilder/schild.png' }, { signal: undefined, step: 1, callId: 'c1' })
    const wert = JSON.parse(text)
    expect(wert.provider).toBe('openai')
    expect(wert.evidenz.layout.regions[0].type).toBe('title')
    expect(wert.evidenz.uncertainty).toEqual([])
  })

  test('ein Fehlschlag wird geworfen und der Schlüssel bleibt aus der Meldung', async () => {
    const werkzeug = modlensWerkzeug({
      cliPfad: 'main.js',
      ausfuehren: lauf('', 3, 'Aufruf fehlgeschlagen: apiKey: sk-ECHT-9 abgelehnt'),
    })
    await expect(werkzeug.execute({ path: 'a.png' }, { signal: undefined, step: 1, callId: 'c1' }))
      .rejects.toThrow(/Code 3/)
    await expect(werkzeug.execute({ path: 'a.png' }, { signal: undefined, step: 1, callId: 'c1' }))
      .rejects.not.toThrow(/ECHT/)
  })

  test('ein fehlendes path-Argument nennt sich beim Namen', async () => {
    const werkzeug = modlensWerkzeug({ cliPfad: 'main.js', ausfuehren: lauf(ANTWORT) })
    await expect(werkzeug.execute({}, { signal: undefined, step: 1, callId: 'c1' })).rejects.toThrow(/"path"/)
  })

  test('ohne CLI-Pfad wird kein Werkzeug gebaut', () => {
    expect(() => modlensWerkzeug({ cliPfad: '  ', ausfuehren: lauf(ANTWORT) })).toThrow(/CLI/)
  })
})
