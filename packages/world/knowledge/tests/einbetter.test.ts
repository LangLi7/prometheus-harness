/**
 * **Die Einbetter — geprüft mit Attrappe und, wenn erreichbar, gegen echtes Ollama.**
 *
 * Die drei Dinge, die hier falsch sein können: die Dimension (der Speicher hat
 * `vector(768)`), der Preis (er entscheidet, ob gefragt wird), und die Auswahl
 * (der Vorgabeweg darf nichts kosten).
 *
 * **Der echte Aufruf überspringt sich**, wenn Ollama nicht läuft — wie die
 * Datenbank-Prüfungen. Eine Prüfung, die einen Dienst braucht, darf die Suite
 * nicht auf jedem Rechner rot machen; sie muß es aber **sagen**.
 */
import { describe, expect, test } from 'bun:test'
import {
  EinbetterFehler,
  googleEinbetter,
  kostet,
  ollamaEinbetter,
  openaiEinbetter,
  SPEICHER_DIM,
  waehleEinbetter,
} from '../src/einbetter.ts'

/** Antwortet Ollama? — mit kurzem Zeitlimit, damit die Suite nicht hängt. */
async function ollamaErreichbar(): Promise<boolean> {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1500) })
    return r.ok
  } catch {
    return false
  }
}

/** Ein `fetch`, der eine feste Antwort gibt und den Rumpf mitschreibt. */
function attrappe(koerper: unknown, status = 200) {
  const gesehen: { url?: string; body?: unknown } = {}
  const abrufen = (async (url: string | URL | Request, init?: RequestInit) => {
    gesehen.url = String(url)
    gesehen.body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
    return new Response(JSON.stringify(koerper), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return { abrufen, gesehen }
}

// ── Der Vertrag: Dimension und Preis ─────────────────────────────────────────────────────────

describe('Der Vertrag', () => {
  test('jeder Einbetter nennt seine Dimension und seinen Preis', () => {
    const ollama = ollamaEinbetter()
    expect(ollama.dim).toBe(SPEICHER_DIM)
    expect(ollama.dim).toBe(768)
    expect(ollama.kostenProMio).toBe(0)
    expect(kostet(ollama)).toBe(false)
  })

  test('ein kostenloser Weg wird nicht als kostenpflichtig gemeldet — und umgekehrt', () => {
    expect(kostet(ollamaEinbetter())).toBe(false)
    expect(kostet(openaiEinbetter({ apiKey: 'x' }))).toBe(true)
    expect(kostet(googleEinbetter({ apiKey: 'x' }))).toBe(true)
  })

  test('die ungeprüften Wege sagen, daß sie ungeprüft sind', () => {
    expect(ollamaEinbetter().geprueft).toBe(true)
    expect(openaiEinbetter({ apiKey: 'x' }).geprueft).toBe(false)
    expect(googleEinbetter({ apiKey: 'x' }).geprueft).toBe(false)
  })

  test('ein Schlüssel ist Pflicht — der Fehler nennt den Grund', () => {
    expect(() => openaiEinbetter({ apiKey: '' })).toThrow('Schlüssel')
    expect(() => googleEinbetter({ apiKey: '' })).toThrow('Schlüssel')
  })

  test('ein Vektor mit falscher Länge wird abgewiesen, nicht gekürzt', async () => {
    // 3 Dimensionen statt 768 — genau der Fall, den ein stilles `slice` verstecken würde.
    const { abrufen } = attrappe({ embeddings: [[0.1, 0.2, 0.3]] })
    const better = ollamaEinbetter({ abrufen })

    await expect(better.einbetten(['eins'])).rejects.toThrow('768')
  })

  test('zu wenige Vektoren sind ein Fehler, kein stilles Auffüllen', async () => {
    const { abrufen } = attrappe({ embeddings: [] })
    const better = ollamaEinbetter({ abrufen })

    await expect(better.einbetten(['a', 'b'])).rejects.toThrow('0 Vektoren für 2 Texte')
  })
})

// ── Die Auswahl: der Vorgabeweg kostet nichts ───────────────────────────────────────────────

describe('waehleEinbetter', () => {
  test('ohne Angabe gewinnt der kostenlose Weg', () => {
    const better = waehleEinbetter({})
    expect(better.art).toBe('ollama')
    expect(kostet(better)).toBe(false)
  })

  test('ein bezahlter Weg ohne Schlüssel wird abgewiesen — nicht stillschweigend lokal', () => {
    expect(() => waehleEinbetter({ PMH_EINBETTER: 'openai' })).toThrow('Schlüssel')
    expect(() => waehleEinbetter({ PMH_EINBETTER: 'google' })).toThrow('Schlüssel')
  })

  test('ein bezahlter Weg MIT Schlüssel wird gewählt', () => {
    const better = waehleEinbetter({ PMH_EINBETTER: 'openai', OPENAI_API_KEY: 'sk-test' })
    expect(better.art).toBe('openai')
    expect(kostet(better)).toBe(true)
  })

  test('ein unbekannter Name nennt die bekannten — statt zu raten', () => {
    expect(() => waehleEinbetter({ PMH_EINBETTER: 'zenmux' })).toThrow('ollama')
    expect(() => waehleEinbetter({ PMH_EINBETTER: 'zenmux' })).toThrow(EinbetterFehler)
  })

  test('Modell und Adresse kommen aus der Umgebung', () => {
    const better = waehleEinbetter({
      PMH_EINBETTER: 'ollama',
      PMH_OLLAMA_MODELL: 'multilingual-e5-base',
      PMH_OLLAMA_URL: 'http://127.0.0.1:9999',
    })
    expect(better.modell).toBe('multilingual-e5-base')
  })
})

// ── Der echte Lauf: lokaler Einbetter gegen echtes Ollama ───────────────────────────────────

describe('ollama, echt', () => {
  test('liefert 768 Dimensionen für zwei Texte', async () => {
    if (!(await ollamaErreichbar())) {
      process.stderr.write(
        '\nHINWEIS: Ollama nicht erreichbar — der echte Einbetter-Test wurde ÜBERSPRUNGEN.\n' +
          '         Abhilfe: ollama serve, dann ollama pull nomic-embed-text.\n',
      )
      return
    }
    const better = ollamaEinbetter()
    const vektoren = await better.einbetten(['Der Mandant steht im Filter.', 'Zweiter Text.'])

    expect(vektoren).toHaveLength(2)
    expect(vektoren[0]).toHaveLength(SPEICHER_DIM)
    expect(vektoren[1]).toHaveLength(SPEICHER_DIM)
    // Ein Vektor aus lauter Nullen wäre formal richtig und inhaltlich wertlos.
    expect(vektoren[0]?.some((w) => w !== 0)).toBe(true)
  }, 60_000)
})
