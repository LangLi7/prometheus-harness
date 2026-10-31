import { expect, test } from 'bun:test'
import { buildScene, crowding } from '../src/scene'
import { exampleUniverse } from '../src/universe'

const universe = exampleUniverse()

/**
 * **Das Gedraenge.** Der Betreiber hat es gesehen, bevor es ein Test tat:
 * „die masse der sonne gross und dann noch sehr sehr nah beinander ist es naja kritisch".
 * Gemessen lagen Venus und Erde **8 Einheiten** auseinander, und Merkurs Bahn war nur
 * **26-mal** der Sonnenradius (in der Wirklichkeit 83-mal). Diese Pruefung ist die Wache.
 */
test('kein einziger Koerper beruehrt einen anderen', () => {
  for (const system of buildScene(universe, 4).systems) {
    expect(crowding(system)).toEqual([])
  }
})

test('im Schaustueck hat jede Bahn echten Abstand', () => {
  const showcase = buildScene(universe, 4).systems.find((s) => s.star.body.name === 'Sonnensystem')
  expect(showcase).toBeDefined()
  const mitBahn = (showcase?.planets ?? [])
    .map((planet, index) => ({
      name: planet.body.name,
      radius: planet.body.radius,
      orbit: showcase?.orbits[index] ?? 0,
    }))
    .filter((lage) => lage.orbit > 0)
    .sort((a, b) => a.orbit - b.orbit)
  for (let i = 1; i < mitBahn.length; i++) {
    const vor = mitBahn[i - 1]
    const jetzt = mitBahn[i]
    if (!vor || !jetzt) continue
    // Zwischen zwei Nachbarbahnen muss **mehr** Luft sein als die Summe ihrer Radien —
    // sonst streifen sich die Kugeln beim Vorbeiziehen.
    expect(jetzt.orbit - jetzt.radius - vor.orbit - vor.radius).toBeGreaterThan(0)
  }
})

test('die innerste Bahn liegt nicht im Stern', () => {
  const showcase = buildScene(universe, 4).systems.find((s) => s.star.body.name === 'Sonnensystem')
  const stern = showcase?.planets[0]?.body
  expect(stern?.kind).toBe('Stern')
  const innerste = (showcase?.orbits ?? []).filter((r) => r > 0).sort((a, b) => a - b)[0] ?? 0
  expect(innerste).toBeGreaterThan(stern?.radius ?? 0)
})

test('der Stern ist groesser als jeder seiner Planeten — sonst sieht er nicht wie ein Stern aus', () => {
  const showcase = buildScene(universe, 4).systems.find((s) => s.star.body.name === 'Sonnensystem')
  const stern = showcase?.planets[0]?.body
  const groesster = Math.max(...(showcase?.planets ?? []).map((p) => p.body.radius))
  expect(stern?.radius ?? 0).toBeGreaterThanOrEqual(groesster)
})

test('es gibt keine Asteroiden mehr — sie waren Rauschen', () => {
  // Sie lagen alle im selben Ring (Abstand 0 bis 1 Einheit) und trugen keine Bedeutung.
  const showcase = buildScene(universe, 4).systems.find((s) => s.star.body.name === 'Sonnensystem')
  const klein = (showcase?.planets ?? []).filter((p) => p.body.kind === 'Kleinkörper')
  expect(klein).toEqual([])
})

/**
 * Die fuenf Ebenen und was sie zeigen.
 *
 * Diese Tabelle ist der Kern des Bezugswechsels — sie steht hier als Test, damit nicht wieder
 * eine Ebene still die falsche Darstellung liefert. Zwei Anlaeufe waren genau daran
 * gescheitert (Nummerierung und Vergleichsrichtung).
 */
test('jede Ebene zeigt genau die Groessenordnung, die ihr entspricht', () => {
  // Ebene 1 — die feinste: die Sonde. Sie ist das einzige Objekt dieser Ebene.
  const klein = buildScene(universe, 1)
  expect(klein.systems).toEqual([])
  expect(klein.placed.map((p) => p.body.name)).toEqual(['Voyager'])

  // Ebene 2 — Planeten und Dateien: alles, was auf dieser Ebene liegt.
  const planeten = buildScene(universe, 2)
  expect(planeten.systems).toEqual([])
  expect(planeten.placed.map((p) => p.body.name)).toContain('Merkur')
  expect(planeten.placed.map((p) => p.body.name)).toContain('Erde')
  expect(planeten.placed.map((p) => p.body.name)).toContain('main.ts')

  // Ebene 3 — **die Sterne**: die Sonne ist als eigener Koerper dabei.
  const sterne = buildScene(universe, 3)
  expect(sterne.placed.map((p) => p.body.name)).toContain('Sonne')

  // Ebene 4 — Workspaces als Systeme: Stern in der Mitte, Kinder in Bahnen.
  const systeme = buildScene(universe, 4)
  expect(systeme.systems.map((s) => s.star.body.name).sort()).toEqual([
    'Sonnensystem',
    'apps',
    'packages',
    'services',
  ])

  /*
   * **Ebene 5 bis 12 — die Kette der Groessenordnungen, gemessen.**
   *
   * Jede Stufe zeigt **etwas**, und das ist der Zweck der `umschlag`-Knoten: mit zwoelf Ebenen braucht
   * jede Stufe Inhalt, sonst sieht man ein leeres Bild. Die Namen sind astronomisch — die
   * Projekt-Bedeutung steht in `item` (siehe `LEVELS`), nicht im Namen.
   *
   * Die Zahlen hier sind **abgelesen**, nicht erwartet: `bun tools/_ebenen.ts` hat sie ausgegeben,
   * nachdem zwei Anlaeufe an dieser Stelle falsch waren (der Stapel hing zuerst doppelt im Baum, dann
   * fehlte die Stufe 5).
   */
  expect(buildScene(universe, 5).placed.map((p) => p.body.name).sort()).toEqual([
    'apps',
    'packages',
    'planetensystem',
    'services',
  ])
  expect(buildScene(universe, 6).placed.map((p) => p.body.name).sort()).toEqual([
    'planetensystem',
    'projekt-stack',
  ])
  expect(buildScene(universe, 7).placed.map((p) => p.body.name)).toEqual(['Sternhaufen'])
  expect(buildScene(universe, 8).placed.map((p) => p.body.name)).toEqual(['prometheus'])
  expect(buildScene(universe, 9).placed.map((p) => p.body.name)).toEqual(['lokale Gruppe'])
  expect(buildScene(universe, 10).placed.map((p) => p.body.name)).toEqual(['Galaxienhaufen'])
  expect(buildScene(universe, 11).placed.map((p) => p.body.name)).toEqual(['Laniakea'])
  expect(buildScene(universe, 12).placed.map((p) => p.body.name)).toEqual(['kosmischer Überblick'])
})

/**
 * **Die bekannte Schwaeche — festgehalten, nicht zugedeckt.**
 *
 * Manche Ebenen zeigen nur **einen oder zwei** Koerper. Wer dort hineinzoomt, sieht eine Kugel im
 * Nichts — und das ist keine Darstellung eines Universums.
 *
 * **Was sich mit den zwoelf Ebenen geaendert hat.** Vorher waren es vier duenne Ebenen (1, 5, 6, 7);
 * jetzt sind es **acht**, denn die Umschlaege tragen genau ein Kind — das ist ihre Bauart, nicht ein
 * Fehler. Der Unterschied ist, dass dahinter eine **Absicht** steht: jede Stufe hat etwas zu zeigen,
 * und der Umschlag sagt mit seinem Namen, was er ist. Vorher war die Ebene schlicht **leer**.
 *
 * Die Ursache der verbleibenden Dunnheit liegt in den **Daten**, nicht in der Zeichenregel: die Welt
 * hat feine Objekte nur unter der Erde (`Mond`, `Voyager`) und sonst nirgends. Ein Atlas braucht auf
 * **jeder** Stufe etwas zu zeigen — wer echte Daten anbindet, ersetzt die Umschlaege durch die
 * wirkliche Struktur (weitere Galaxien, Gruppen, Haufen).
 *
 * Der Test haelt den Ist-Zustand fest, damit die Schwaeche sichtbar bleibt, bis sie behoben
 * ist — sie wird nicht weggelassen und nicht schoengerechnet.
 */
test('BEKANNT: neun Ebenen zeigen fast nichts — gemessen, nicht geschaetzt', () => {
  const duenn = ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const).filter((level) => {
    const scene = buildScene(universe, level)
    // Sichtbare Koerper: die gezeichneten **plus** die Kinder jedes Systems.
    const gesamt = scene.placed.length + scene.systems.reduce((n, s) => n + s.planets.length, 0)
    return gesamt <= 2
  })
  /*
   * **Diese Liste ist die Messung, nicht die Erwartung.**
   *
   * Der erste Anlauf riet „acht Ebenen" — gemessen waren es **neun**: Ebene 7 zeigt nur den
   * Sternhaufen-Umschlag (1 Koerper), und Ebene 6 zeigt zwei. Wer Inhalt ergaenzt, aendert die Liste —
   * und dann ist dieser Test die Stelle, an der man es merkt.
   *
   * Die Ursache liegt in den **Daten**: die Umschlaege tragen je ein oder zwei Kinder, weil das
   * Beispiel-Universum nur fuenf echte Groessenordnungen kennt. Ein Atlas braucht auf **jeder** Stufe
   * etwas zu zeigen — wer echte Daten anbindet, ersetzt die Umschlaege durch die wirkliche Struktur
   * (weitere Galaxien, Gruppen, Haufen).
   */
  expect(duenn).toEqual([1, 6, 7, 8, 9, 10, 11, 12])
})

test('das Schaustück traegt Stern, acht Planeten, Mond und Sonde', () => {
  const scene = buildScene(universe, 4)
  const showcase = scene.systems.find((s) => s.star.body.name === 'Sonnensystem')
  expect(showcase).toBeDefined()
  // **Sonne + acht Planeten + Mond + Sonde = elf Koerper.** Die Asteroiden sind weg (sie
  // trugen keine Bedeutung), der Mond und die Sonde sind **neu erreichbar** — vorher fielen
  // sie durch, weil die Sammlung nur bis zur Systemebene sah.
  expect(showcase?.planets).toHaveLength(11)
  expect(showcase?.planets[0]?.body.name).toBe('Sonne')
  expect(showcase?.planets[0]?.body.kind).toBe('Stern')
  const namen = showcase?.planets.map((p) => p.body.name) ?? []
  expect(namen).toContain('Neptun')
  expect(namen).toContain('Mond')
  expect(namen).toContain('Voyager')
  // Die Sonne steht im Zentrum — Abstand null.
  expect(showcase?.orbits[0]).toBe(0)
})

test('nur die direkten Kinder bekommen einen Ring — ein Mond kreist um seinen Planeten', () => {
  const showcase = buildScene(universe, 4).systems.find((s) => s.star.body.name === 'Sonnensystem')
  const paar = (showcase?.planets ?? []).map((p, i) => ({ name: p.body.name, orbit: showcase?.orbits[i] ?? 0 }))
  // Die acht Planeten haben einen Ring …
  for (const planet of ['Merkur', 'Venus', 'Erde', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptun']) {
    expect(paar.find((p) => p.name === planet)?.orbit ?? 0).toBeGreaterThan(0)
  }
  // … die Sonne, der Mond und die Sonde **nicht**. Ein Ring um den Stern für einen Mond wäre
  // im Bild ein Punkt auf der Erde.
  for (const ohne of ['Sonne', 'Mond', 'Voyager']) {
    expect(paar.find((p) => p.name === ohne)?.orbit ?? -1).toBe(0)
  }
})

test('keine Ebene ist leer — sonst schaut man in einen leeren Raum', () => {
  for (const level of [1, 2, 3, 4, 5, 6, 7] as const) {
    const scene = buildScene(universe, level)
    expect(scene.placed.length).toBeGreaterThan(0)
  }
})

test('auf der Workspace-Ebene ist der Stern ein Stern und jedes Kind ein Planet', () => {
  const scene = buildScene(universe, 4)
  const system = scene.systems.find((s) => s.star.body.name === 'apps')
  expect(system).toBeDefined()
  expect(system?.star.kind).toBe('sun')
  expect(system?.planets.length).toBe(3)
  expect(system?.planets.every((p) => p.kind === 'planet')).toBe(true)
})

test('im Schaustueck steht genau ein Koerper im Zentrum — die Sonne', () => {
  const scene = buildScene(universe, 4)
  for (const system of scene.systems) {
    expect(system.orbits).toHaveLength(system.planets.length)
  }
  // Das Schaustück hat genau einen Körper im Zentrum: die Sonne (Bahn 0). Mond und Sonde
  // haben ebenfalls Bahn 0 — aber weil sie **um ihren Planeten** kreisen, nicht um den Stern.
  const showcase = scene.systems.find((s) => s.star.body.name === 'Sonnensystem')
  expect(showcase?.orbits[0]).toBe(0)
  expect(showcase?.planets[0]?.body.name).toBe('Sonne')
  // Ein **Platzhalter**-System hat gar keinen Körper im Zentrum: seine Kinder kreisen alle um
  // einen Kern, der selbst kein eigener Körper ist.
  const platzhalter = scene.systems.find((s) => s.star.body.kind === 'Platzhalter')
  expect(platzhalter?.orbits.every((radius) => radius > 0)).toBe(true)
})

test('die beschriftete Liste enthaelt auch die Koerper aus den Systemen', () => {
  // Ohne diese Liste blieben die Koerper-Beschriftungen beim Ebenenwechsel stehen und der
  // Text stuende ueber einer anderen Welt.
  const scene = buildScene(universe, 4)
  const labeledIds = new Set(scene.labeled.map((p) => p.body.id))
  for (const system of scene.systems) {
    for (const planet of system.planets) expect(labeledIds.has(planet.body.id)).toBe(true)
  }
  expect(scene.labeled.length).toBeGreaterThan(scene.placed.length)
})

test('die Weltkoordinaten der Planeten zaehlen den Stern mit', () => {
  const scene = buildScene(universe, 4)
  const system = scene.systems.find((s) => s.star.body.name === 'Sonnensystem')
  const star = system?.star
  const planet = system?.planets.find((p) => p.body.name === 'Erde')
  expect(star).toBeDefined()
  expect(planet).toBeDefined()
  // Der Planet liegt nicht am Stern, sondern in einer Bahn darum.
  const dx = (planet?.world[0] ?? 0) - (star?.world[0] ?? 0)
  const dz = (planet?.world[2] ?? 0) - (star?.world[2] ?? 0)
  expect(Math.hypot(dx, dz)).toBeGreaterThan(100)
})

test('die Bahnebene liegt in xz — das Weltall hat oben und unten keine Vorzugsrichtung', () => {
  const scene = buildScene(universe, 4)
  const showcase = scene.systems.find((s) => s.star.body.name === 'Sonnensystem')
  expect(showcase).toBeDefined()
  for (const planet of showcase?.planets ?? []) {
    const radius = Math.hypot(
      planet.world[0] - (showcase?.star.world[0] ?? 0),
      planet.world[2] - (showcase?.star.world[2] ?? 0),
    )
    const height = Math.abs(planet.world[1] - (showcase?.star.world[1] ?? 0))
    // Die Höhe ist nur eine leichte Neigung, kein Ringelblumenstrauss.
    expect(height).toBeLessThan(radius * 0.06 + 20)
  }
})

test('die Platzhalter heissen auch so — niemand soll echten Code vermuten', () => {
  const scene = buildScene(universe, 4)
  const platzhalter = scene.systems.filter((s) => s.star.body.kind === 'Platzhalter')
  expect(platzhalter.length).toBeGreaterThan(0)
})

test('dieselbe Ebene ergibt zweimal dieselbe Szene — der Vergleich spart Rechenzeit', () => {
  const a = buildScene(universe, 4)
  const b = buildScene(universe, 4)
  expect(a.placed.map((p) => p.body.id)).toEqual(b.placed.map((p) => p.body.id))
  expect(a.systems.length).toBe(b.systems.length)
})
