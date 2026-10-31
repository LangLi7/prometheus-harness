/**
 * Das Verzeichnis — Familien, Adressen und die Sonde.
 *
 * **Kein echter Socket.** Die Sonde bekommt einen `Abruf`, der nur den Pfad ansieht; damit ist
 * geprüft, was das Plugin aus einem Status macht — und nicht, ob dieser Rechner gerade Netz hat.
 *
 * @module @prometheus-harness/zugaenge/tests/verzeichnis
 */

import { describe, expect, test } from 'bun:test'

import type { Abruf } from '@prometheus-harness/provider-directory'

import { alsZugang, type Zugang, type ZugangEingabe } from '../src/vertrag.ts'
import {
  OFFENE_FAMILIE,
  PruefFehler,
  anbieterAusZugang,
  familienAuswahl,
  familieFuer,
  mitWeg,
  ohneWeg,
  sondeFuer,
} from '../src/verzeichnis.ts'

/** Eine brauchbare Eingabe. */
const EINGABE: ZugangEingabe = {
  name: 'Prüfzugang',
  familie: 'openrouter',
  art: 'fern',
  schluessel: 'noetig',
  modelle: { gespraech: 'm' },
}

/** Baut einen Zugang. */
function zugang(teil: Partial<ZugangEingabe> = {}): Zugang {
  return alsZugang({ ...EINGABE, ...teil }, new Date('2026-10-21T12:00:00.000Z'))
}

/**
 * Ein Abruf, der nach Pfad antwortet.
 *
 * `GET /models` nennt zwei Modelle; der Chat nimmt den Auftrag an und weist ihn ab (400); der Bild-
 * Weg fehlt (404); alles andere antwortet 405 — also „vorhanden".
 */
const abruf: Abruf = async (adresse, einstellung) => {
  const pfad = new URL(adresse).pathname
  if (einstellung.method === 'GET') {
    return Response.json({ data: [{ id: 'm-eins' }, { id: 'm-zwei' }] })
  }
  const status = pfad.endsWith('/chat/completions') ? 400 : pfad.endsWith('/images/generations') ? 404 : 405
  return new Response(null, { status })
}

describe('Die Familien', () => {
  test('eine bekannte Familie kommt aus der Tabelle', () => {
    const familie = familieFuer(zugang())
    expect(familie?.id).toBe('openrouter')
    expect(familie?.basis).toBe('https://openrouter.ai/api/v1')
  })

  test('eine eigene Basis überschreibt die Tabelle — ohne Schrägstrich am Ende', () => {
    const familie = familieFuer(zugang({ basis: 'http://127.0.0.1:11434/v1/' }))
    expect(familie?.basis).toBe('http://127.0.0.1:11434/v1')
  })

  test('ein unbekannter Name mit Basis wird zu einer offenen Familie OHNE Wege', () => {
    const familie = familieFuer(
      zugang({ familie: 'mein-server', art: 'lokal', basis: 'http://127.0.0.1:8080' }),
    )
    expect(familie?.id).toBe('mein-server')
    expect(familie?.wege).toEqual({})
    expect(familie?.basis).toBe('http://127.0.0.1:8080')
  })

  test('ein unbekannter Name ohne Basis ergibt keine Familie', () => {
    expect(familieFuer(zugang({ familie: 'mein-server', art: 'lokal' }))).toBeUndefined()
  })

  test('TypeSafe steht in der Auswahl — mit der Adresse aus der Dokumentation', () => {
    const auswahl = familienAuswahl()
    const ts = auswahl.find((eintrag) => eintrag.id === 'typesafe')
    expect(ts).toBeDefined()
    expect(ts?.basis).toBe('https://api.typesafe.ai')
    expect(ts?.basisNoetig).toBe(false)
    // **Kein Messdatum.** Der Pfad stammt aus der Dokumentation, nicht aus einem Aufruf.
    expect(ts?.stand).toContain('nicht selbst gemessen')
  })

  test('die Auswahl nennt den eigenen Endpunkt zuletzt und mit „Basis nötig"', () => {
    const auswahl = familienAuswahl()
    expect(auswahl.length).toBeGreaterThan(1)
    const letzte = auswahl[auswahl.length - 1]
    expect(letzte?.id).toBe(OFFENE_FAMILIE)
    expect(letzte?.basisNoetig).toBe(true)
  })
})

describe('Der Anbieter', () => {
  test('ein OpenRouter-Eintrag wird zu einem Anbieter mit der Kennung des EINTRAGS', () => {
    const anbieter = anbieterAusZugang(zugang(), () => 'key')
    expect(anbieter?.id).toBe('pruefzugang')
    expect(anbieter?.name).toBe('Prüfzugang')
    expect(anbieter?.faehigkeiten).toContain('entscheiden')
    // `gespraech` gehört der Chat-Naht des Kerns (`@prometheus-harness/llm`), nicht diesem Anbieter.
  })

  test('ohne gemessene Umsetzung gibt es keinen Anbieter — statt eines geratenen', () => {
    expect(anbieterAusZugang(zugang({ familie: 'deepseek' }), () => 'key')).toBeUndefined()
    expect(anbieterAusZugang(zugang({ familie: 'openai-kompatibel', basis: 'http://127.0.0.1:1' }), () => 'key')).toBeUndefined()
  })

  test('ein TypeSafe-Eintrag kann NUR entscheiden', () => {
    const anbieter = anbieterAusZugang(
      zugang({ familie: 'typesafe', modelle: { entscheiden: 'jev-1.14.0' } }),
      () => 'key',
    )
    expect(anbieter?.id).toBe('pruefzugang')
    expect(anbieter?.faehigkeiten).toEqual(['entscheiden'])
    expect(anbieter?.modelle('entscheiden')).toEqual(['jev-1.14.0'])
    // **Der Unterschied zu OpenRouter.** Dort ist `sicherheit` ein Schema-Feld, das das Modell
    // schätzt; hier kommt sie aus `confidence`. Das ist der Grund für die eigene Umsetzung.
    expect(anbieter?.entscheider).toBeDefined()
  })
})

describe('Die Sonde', () => {
  test('liest Modelle und deutet jeden Weg', async () => {
    const befund = await sondeFuer(zugang(), { abruf, jetzt: new Date('2026-10-21T12:00:00.000Z') })
    expect(befund.modelleErreichbar).toBe(true)
    expect(befund.modellAnzahl).toBe(2)
    expect(befund.modelle).toEqual(['m-eins', 'm-zwei'])
    expect(befund.wege['gespraech']).toBe('vorhanden')
    expect(befund.wege['entscheiden']).toBe('vorhanden')
    expect(befund.wege['bild']).toBe('fehlt')
    expect(befund.wege['text-zu-sprache']).toBe('vorhanden')
    expect(befund.geprueftAm).toBe('2026-10-21T12:00:00.000Z')
  })

  test('der Schlüssel steht in KEINER Antwort', async () => {
    const befund = await sondeFuer(zugang(), {
      abruf,
      schluessel: 'geheim-123',
      jetzt: new Date('2026-10-21T12:00:00.000Z'),
    })
    const text = JSON.stringify(befund)
    expect(text).not.toContain('geheim-123')
  })

  test('ohne Adresse sagt sie, warum sie nicht prüfen kann', async () => {
    const ohne = zugang({ familie: 'mein-server', art: 'lokal' })
    await expect(sondeFuer(ohne, { abruf })).rejects.toBeInstanceOf(PruefFehler)
  })

  test('„vorhanden" und „fehlt" werden getrennt ausgewertet', async () => {
    const befund = await sondeFuer(zugang(), { abruf })
    expect([...mitWeg(befund)].sort()).toEqual(['einbetten', 'entscheiden', 'gespraech', 'sprache-zu-text', 'text-zu-sprache'])
    const ohne = ohneWeg(befund)
    expect(ohne).toEqual([{ faehigkeit: 'bild', befund: 'fehlt' }])
  })
})
