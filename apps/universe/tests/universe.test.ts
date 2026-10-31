import { expect, test } from 'bun:test'
import { LEVELS, countBodies, exampleUniverse, rankHits, search } from '../src/universe'
import type { Body } from '../src/universe'

const universe = exampleUniverse()

test('das Beispiel-Universum hat fuenf Bezugsebenen uebereinander', () => {
  const ebenen = new Set<number>()
  const walk = (body: Body): void => {
    ebenen.add(body.level)
    for (const child of body.children ?? []) walk(child)
  }
  walk(universe)
  for (const level of LEVELS) expect(ebenen.has(level.level)).toBe(true)
})

test('jede Kennung ist eindeutig — sonst findet die Suche das falsche Objekt', () => {
  const ids = new Set<string>()
  const walk = (body: Body): void => {
    expect(ids.has(body.id)).toBe(false)
    ids.add(body.id)
    for (const child of body.children ?? []) walk(child)
  }
  walk(universe)
  expect(ids.size).toBeGreaterThan(18)
})

test('die Suche findet auch einen Planeten', () => {
  const hits = search(universe, 'Mars')
  expect(hits.length).toBeGreaterThan(0)
  expect(hits[0]?.body.kind).toBe('Planet')
})

test('ein Treffer kennt seinen Weg — man muss wissen, wohin man springt', () => {
  const hit = search(universe, 'apps')[0]
  expect(hit).toBeDefined()
  /*
   * **Der Weg ist mit der neuen Skala laenger geworden — und das ist richtig so.**
   *
   * Von aussen nach innen: Universum → Superhaufen → Galaxienhaufen → Galaxiengruppe → Welteninsel
   * → Sternhaufen → Sternsystem. Die Umschlaege (siehe `umschlag` in `universe.ts`) sind echte
   * Vorfahren: ihre Lage zaehlt zur Weltlage mit, und ohne sie waere ein Sprung ins Leere.
   */
  expect(hit?.path).toEqual([
    'kosmischer Überblick',
    'Laniakea',
    'Galaxienhaufen',
    'lokale Gruppe',
    'prometheus',
    'Sternhaufen',
    'projekt-stack',
  ])
})

test('die Weltkoordinaten eines Treffers zaehlen alle Vorfahren mit', () => {
  const hit = search(universe, 'apps')[0]
  expect(hit).toBeDefined()
  // Die Position des Kindes steht relativ zum Elternobjekt. Wird der Ursprung nicht
  // mitgefuehrt, liegt der Treffer faelschlich nahe dem Nullpunkt — und die Kamera
  // springt ins Leere. `projekt-stack` liegt bei [17000, 900, -11000].
  const entfernung = Math.hypot(...(hit?.world ?? [0, 0, 0]))
  expect(entfernung).toBeGreaterThan(5000)
})

test('das echte Sonnensystem ist da — mit Sonne und den acht Planeten', () => {
  // Der Betreiber wollte den Schauplatz sehen, nicht nur die Struktur: solange kein Projekt
  // angebunden ist, waere die Welt leer.
  const namen = search(universe, '').length // leer = keine Suche
  void namen
  for (const planet of ['Sonne', 'Merkur', 'Venus', 'Erde', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptun']) {
    expect(search(universe, planet).length).toBeGreaterThan(0)
  }
})

test('der Erdmond haengt an der Erde — nicht an der Sonne', () => {
  const mond = search(universe, 'Mond')[0]
  expect(mond).toBeDefined()
  // Weg: Überblick / prometheus / Sonnensystem / Erde
  expect(mond?.path.at(-1)).toBe('Erde')
})

test('die Planeten stehen in der richtigen Reihenfolge von der Sonne aus', () => {
  const reihenfolge = ['Merkur', 'Venus', 'Erde', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptun']
  const abstaende = reihenfolge.map((name) => {
    const hit = search(universe, name)[0]
    expect(hit).toBeDefined()
    const sonne = search(universe, 'Sonne')[0]
    expect(sonne).toBeDefined()
    const d = (hit?.world ?? [0, 0, 0]).map((n, i) => n - (sonne?.world[i] ?? 0))
    return Math.hypot(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0)
  })
  for (let i = 1; i < abstaende.length; i++) {
    expect(abstaende[i] ?? 0).toBeGreaterThan(abstaende[i - 1] ?? 0)
  }
})

test('die Suche ist unabhaengig von Gross- und Kleinschreibung', () => {
  expect(search(universe, 'WEB').length).toBe(search(universe, 'web').length)
})

test('leere Eingabe liefert nichts — nicht alles', () => {
  expect(search(universe, '')).toEqual([])
  expect(search(universe, '    ')).toEqual([])
})

test('die Rangfolge stellt den genauen Namen vor das Teilwort', () => {
  const hits = search(universe, 'erde')
  const sortiert = rankHits(hits, 'erde')
  expect(sortiert[0]?.body.name).toBe('Erde')
})

test('unbekannte Namen finden nichts, statt irgendetwas zu liefern', () => {
  expect(search(universe, 'gibtesnicht-xyz')).toEqual([])
})

test('die Objektzahl ist stabil und nicht null', () => {
  expect(countBodies(universe)).toBe(countBodies(exampleUniverse()))
  expect(countBodies(universe)).toBeGreaterThan(20)
})
