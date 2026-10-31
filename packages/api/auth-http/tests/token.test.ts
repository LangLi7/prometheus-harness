/**
 * **API-Token — die Regeln, die ohne Datenbank prüfbar sind.**
 *
 * Was hier **nicht** geprüft wird: das Speichern selbst. Das braucht Postgres und
 * den Hauptschlüssel; die Kette dafür ist in `docs/status/geheimnisse-ablage.md`
 * mit einem echten Lauf belegt. Hier stehen die drei Aussagen, die davor liegen:
 *
 *   1. Die Anbieterliste ist **eindeutig** — zwei Anbieter mit derselben `ref`
 *      würden denselben Schlüssel überschreiben, und niemand sähe es.
 *   2. Ein Schlüssel wird **getrimmt**, aber nicht **repariert**: Leerraum in der
 *      Mitte ist ein Fehler, kein Zeichen zum Entfernen.
 *   3. Die Grenzen sind **benannt** (8 … 4096 Zeichen), nicht geraten.
 */
import { describe, expect, test } from 'bun:test'
import { PFAD_TOKEN, TOKEN_ANBIETER, alsToken, anbieterMit, tokenWege } from '../src/token.ts'
import type { Umgebung } from '../src/paths.ts'
import type { SqlZugang } from '@prometheus-harness/store-postgres'

describe('die Wege', () => {
  test('ein Pfad, ein Eintrag — drei Einträge würden beim Start werfen', () => {
    /*
     * **Der gemessene Fehler, der diese Prüfung erzwungen hat.** Der Webserver
     * schlüsselt seine Routen über `(kind, path)` und wirft bei einem doppelten
     * Eintrag. Drei Wege für `GET`, `POST` und `DELETE` auf demselben Pfad sahen
     * richtig aus und hätten den Host **beim Start** beendet. Jetzt gibt es einen
     * Eintrag, der nach der Methode verteilt.
     */
    const wege = tokenWege({} as Umgebung, {} as SqlZugang)
    expect(wege).toHaveLength(1)
    expect(wege[0]?.path).toBe(PFAD_TOKEN)
    expect(wege[0]?.kind).toBe('exact')
  })
})

describe('die Anbieterliste', () => {
  test('jede Kennung und jede ref ist genau einmal da', () => {
    const ids = TOKEN_ANBIETER.map((anbieter) => anbieter.id)
    const refs = TOKEN_ANBIETER.map((anbieter) => anbieter.ref)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(refs).size).toBe(refs.length)
  })

  test('jede ref sieht aus wie eine Umgebungsvariable — so findet sie das Skript wieder', () => {
    for (const anbieter of TOKEN_ANBIETER) {
      expect(anbieter.ref).toMatch(/^[A-Z][A-Z0-9_]*_API_KEY$/u)
    }
  })

  test('ein unbekannter Anbieter ist kein Anbieter', () => {
    expect(anbieterMit('openrouter')?.name).toBe('OpenRouter')
    expect(anbieterMit('gibtsnicht')).toBeUndefined()
    expect(anbieterMit('')).toBeUndefined()
  })
})

describe('ein eingegebener Schlüssel', () => {
  test('wird getrimmt — ein versehentlicher Umbruch am Rand ist kein Fehler', () => {
    const geprueft = alsToken('  sk-or-v1-abcdefgh  ')
    expect(geprueft.ok).toBe(true)
    if (geprueft.ok) expect(geprueft.token).toBe('sk-or-v1-abcdefgh')
  })

  test('Leerraum in der Mitte wird abgelehnt, nicht still entfernt', () => {
    const geprueft = alsToken('sk-or v1 abcdefgh')
    expect(geprueft.ok).toBe(false)
    if (!geprueft.ok) expect(geprueft.message).toContain('Leerraum')
  })

  test('zu kurz, zu lang und kein Text sind benannte Fälle', () => {
    for (const [wert, erwartet] of [
      ['kurz', 'zu kurz'],
      ['x'.repeat(4097), 'zu lang'],
      [42, 'kein Text'],
      ['', 'zu kurz'],
    ] as const) {
      const geprueft = alsToken(wert)
      expect(geprueft.ok, `${String(wert).slice(0, 12)} wurde angenommen`).toBe(false)
      if (!geprueft.ok) expect(geprueft.message).toContain(erwartet)
    }
  })

  test('die Untergrenze ist wirklich acht Zeichen', () => {
    expect(alsToken('1234567').ok).toBe(false)
    expect(alsToken('12345678').ok).toBe(true)
  })
})
