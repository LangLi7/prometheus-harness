import { expect, test } from 'bun:test'
import { YEAR_SECONDS, angularSpeed, buildScene, orbitPosition } from '../src/scene'
import { exampleUniverse, search } from '../src/universe'

const universe = exampleUniverse()
const center: readonly [number, number, number] = [100, 20, -50]

// ── Die Bahnrechnung: eine reine Funktion, deshalb pruefbar ──────────────────────────────

test('ein Koerper liegt immer auf seinem Ring — nie daneben', () => {
  // Das war ein echter Fehler: die Bahn lag in einer Ebene, der Koerper lief auf einer
  // geneigten Bahn — er sauste **neben** seinem eigenen Ring her.
  const orbit = 700
  const plane = 12
  for (let i = 0; i < 200; i++) {
    const seconds = i * 1.7
    const p = orbitPosition(center, orbit, plane, 0.4, 0.3, seconds)
    const dx = p[0] - center[0]
    const dz = p[2] - center[2]
    expect(Math.abs(Math.hypot(dx, dz) - orbit)).toBeLessThan(1e-9)
    // Und die Hoehe ist die der Bahnebene — nicht irgendetwas.
    expect(Math.abs(p[1] - (center[1] + plane))).toBeLessThan(1e-12)
  }
})

test('eine volle Umdrehung kommt zum Ausgangspunkt zurueck', () => {
  const omega = 0.5
  const start = orbitPosition(center, 400, 0, 0.9, omega, 0)
  const nach = orbitPosition(center, 400, 0, 0.9, omega, (Math.PI * 2) / omega)
  for (let i = 0; i < 3; i++) {
    expect(Math.abs((nach[i] ?? 0) - (start[i] ?? 0))).toBeLessThan(1e-9)
  }
})

test('die Kreisfrequenz folgt der Umlaufzeit: laenger heisst langsamer', () => {
  const merkur = angularSpeed(0.241)
  const erde = angularSpeed(1)
  const neptun = angularSpeed(164.8)
  expect(merkur).toBeGreaterThan(erde)
  expect(erde).toBeGreaterThan(neptun)
})

test('das Verhaeltnis ist sichtbar gestaucht — rund 26 : 1', () => {
  // **Warum das geprueft wird:** echte Zeit (`ω ∝ 1/T`) liesse Neptun bei
  // 120 s je Erdenjahr stehen, während Merkur alle 29 s vorbeizieht. Die
  // Stauchung `T^−0,5` ist eine Darstellungsentscheidung; der Test haelt die
  // Groessenordnung fest, nicht die exakte Zahl.
  const verhaeltnis = angularSpeed(0.241) / angularSpeed(164.8)
  expect(verhaeltnis).toBeCloseTo(Math.sqrt(164.8 / 0.241), 6)
  expect(verhaeltnis).toBeGreaterThan(20)
  expect(verhaeltnis).toBeLessThan(35)
})

test('eine Umlaufzeit von null oder weniger wird abgelehnt — sie dreht nicht', () => {
  expect(() => angularSpeed(0)).toThrow(/größer als null/)
  expect(() => angularSpeed(-3)).toThrow(/größer als null/)
})

test('in einem Erdenjahr laeuft die Erde einmal herum und Merkur oefter', () => {
  /*
   * **Die Dauer kommt aus dem Code, nicht aus einer zweiten Zahl.**
   *
   * Hier stand `const jahr = 24` — eine **Kopie** von `YEAR_SECONDS` aus `scene.ts`. Der Betreiber hat
   * gemeldet, dass sich alles zu schnell bewegt („**es bewegt sich zu schnell ;D**"), die Grunddauer
   * ist deshalb von 24 auf 70 Sekunden gestiegen — und dieser Test wurde rot, obwohl er die **Beziehung**
   * prüfen soll („die Erde einmal, der Merkur öfter") und nicht eine Zahl.
   *
   * Genau das ist die Fehlerklasse, die heute schon zweimal zugeschlagen hat: **eine zweite Kopie einer
   * Zahl ist eine zweite Wahrheit.** Der Test liest sie jetzt aus demselben Modul, das sie benutzt.
   */
  const jahr = YEAR_SECONDS
  const erde = angularSpeed(1) * jahr
  const merkur = angularSpeed(0.241) * jahr
  expect(Math.abs(erde - Math.PI * 2)).toBeLessThan(1e-9)
  expect(merkur).toBeGreaterThan(Math.PI * 2)
  // Und der Takt ist wirklich der ruhige: ein Erdenjahr dauert über eine Minute.
  expect(jahr).toBeGreaterThan(60)
})

// ── Die Daten: echte Umlaufzeiten ────────────────────────────────────────────────────────

test('jeder Planet hat eine echte Umlaufzeit in Erdjahren', () => {
  const erwartet: Readonly<Record<string, number>> = {
    Merkur: 0.241,
    Venus: 0.615,
    Erde: 1.0,
    Mars: 1.881,
    Jupiter: 11.86,
    Saturn: 29.46,
    Uranus: 84.01,
    Neptun: 164.8,
  }
  for (const [name, jahre] of Object.entries(erwartet)) {
    const hit = search(universe, name).find((h) => h.path.includes('Sonnensystem'))
    expect(hit).toBeDefined()
    expect(hit?.body.period).toBeCloseTo(jahre, 3)
  }
})

test('die Umlaufzeiten wachsen mit dem Bahnradius — Keplers drittes Gesetz in Zahlen', () => {
  const reihenfolge = ['Merkur', 'Venus', 'Erde', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptun']
  const perioden = reihenfolge.map((name) => {
    const hit = search(universe, name).find((h) => h.path.includes('Sonnensystem'))
    return hit?.body.period ?? 0
  })
  for (let i = 1; i < perioden.length; i++) {
    expect(perioden[i] ?? 0).toBeGreaterThan(perioden[i - 1] ?? 0)
  }
})

test('der Mond hat eine eigene, viel kuerzere Umlaufzeit als die Erde', () => {
  const mond = search(universe, 'Mond')[0]
  expect(mond?.body.period).toBeCloseTo(0.0748, 4)
  expect(mond?.body.period ?? 1).toBeLessThan(1)
})

test('die Szene traegt die Bewegung: jedes kreisende Kind hat einen Bahnradius', () => {
  const scene = buildScene(universe, 4)
  const showcase = scene.systems.find((s) => s.star.body.name === 'Sonnensystem')
  expect(showcase).toBeDefined()
  // Acht Planeten kreisen; die Sonne steht im Zentrum (Radius 0).
  const mitBahn = (showcase?.orbits ?? []).filter((r) => r > 0)
  expect(mitBahn).toHaveLength(8)
  expect(showcase?.orbits[0]).toBe(0)
})
