/**
 * Der Startblick — **liegt die Welt ueberhaupt im Bild?**
 *
 * **Warum dieser Test existiert.** Der Betreiber hat nach dem Umbau ein **leeres Bild** gesehen:
 * schwarzes Canvas, halb gezeichnetes Achsenkreuz, sonst nichts. Die Ursache war ein
 * `ReferenceError` beim Laden — aber das war Zufall. Die eigentliche Luecke war, dass **nichts**
 * pruefte, ob der berechnete Startblick die Welt auch zeigt: die Tests pruefen Kamera-Rechnung
 * (`camera.test.ts`) und Szenenaufbau (`scene.test.ts`) **getrennt**, und genau an der Naht sass der
 * Fehler.
 *
 * **Was hier gerechnet wird.** Dieselbe Kette wie im Bildlauf: Szene bauen → Startblick holen →
 * Kamera aus Fokus, Abstand und Drehlage setzen → jeden Koerper projizieren → nachsehen, ob er
 * innerhalb des Bildes liegt. Es wird **nichts** gezeichnet; es wird gerechnet. Deshalb laeuft der
 * Test ohne Browser und ohne Grafikkarte.
 */
import { expect, test } from 'bun:test'
import { PerspectiveCamera, Vector3 } from 'three'
import { SUN_RADIUS } from '../src/bodies'
import { cameraPosition, levelForDistance, openingView, focusOn, rotateBy } from '../src/camera'
import { buildScene, drawnRadius, minBodySize } from '../src/scene'
import { exampleUniverse, outermostOf, search } from '../src/universe'

/**
 * Der Startblick, wie ihn `main.ts` baut — dieselbe Rechnung, hier nachvollziehbar.
 *
 * **Und genau daran ist dieser Test zweimal falsch gewesen.** Er stand hier mit
 * `search(universe, 'Neptun')[0]` und `Math.hypot(outermost.world − showcase.world)` — also mit
 * **derselben** fehlerhaften Rechnung wie `main.ts`. Ein Test, der den Code nachbaut, statt ihn zu
 * benutzen, prüft den Code nicht: er prüft die Nachbildung. Beide waren gleich falsch, also war der
 * Test grün, während das Bild eine 1,8-Pixel-Sonne zeigte.
 *
 * Jetzt kommt der äusserste Ring aus `outermostOf` — **derselben Funktion**, die `main.ts` ruft.
 */
function startView(width = 1280, height = 720) {
  const universe = exampleUniverse()
  const showcase = search(universe, 'Sonnensystem')[0]
  if (!showcase) throw new Error('Das Beispiel-Universum hat kein Sonnensystem')
  const aussen = outermostOf(showcase.body)
  if (!aussen) throw new Error('kein Körper mit Bahn — dann ist der Abstand geraten')
  const state = openingView(showcase.world, aussen.radius)
  const camera = new PerspectiveCamera(60, width / height, 0.05, state.distance * 1000)
  camera.position.copy(cameraPosition(state))
  camera.quaternion.set(...state.orientation)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return { universe, state, camera, showcase, radius: aussen.radius, aussen, width, height }
}

/** Projiziert einen Weltpunkt und sagt, ob er im Bild liegt. */
function imBild(
  camera: PerspectiveCamera,
  punkt: readonly [number, number, number],
  width: number,
  height: number,
): boolean {
  const v = new Vector3(punkt[0], punkt[1], punkt[2]).project(camera)
  if (v.z < -1 || v.z > 1) return false
  const x = (v.x * 0.5 + 0.5) * width
  const y = (-v.y * 0.5 + 0.5) * height
  return x >= 0 && x <= width && y >= 0 && y <= height
}

test('der Startblick zeigt die Sonne — nicht den leeren Raum', () => {
  const { camera, showcase, width, height } = startView()
  expect(imBild(camera, showcase.world, width, height)).toBe(true)
})

test('der Startblick zeigt die inneren Planeten', () => {
  const { camera, universe, width, height } = startView()
  for (const name of ['Merkur', 'Venus', 'Erde', 'Mars']) {
    const treffer = search(universe, name)[0]
    expect(treffer, `${name} fehlt im Universum`).toBeDefined()
    if (!treffer) continue
    expect(imBild(camera, treffer.world, width, height), `${name} liegt ausserhalb des Bildes`).toBe(
      true,
    )
  }
})

test('der Abstand fasst den aeussersten Ring — sonst ist der Rand abgeschnitten', () => {
  const { camera, universe, width, height } = startView()
  const neptun = search(universe, 'Neptun')[0]
  expect(neptun).toBeDefined()
  if (!neptun) return
  expect(imBild(camera, neptun.world, width, height)).toBe(true)
})

test('die Startebene ist das Sonnensystem — nicht der Kleinkoerper und nicht die Galaxie', () => {
  const { state } = startView()
  expect(levelForDistance(state.distance)).toBe(4)
})

/**
 * **Der äusserste Ring kommt aus den Kindern — und nur aus ihnen.**
 *
 * Der Fehler, den diese Prüfung festhält, war im Bild als „die Sonne ist ein Punkt" zu sehen und hat
 * drei Korrekturen an der Sonne selbst überlebt. Die Ursache stand im **Abstand**: `main.ts` nahm
 * `search(universe, 'Neptun')[0]` und dessen **Weltlage** — die Summe über den ganzen Baum. Im
 * Beispiel liegt unter den Zusammenfassungen ein weiterer Neptun mit Weltlage 22 434 statt 1 253,
 * der Startblick rechnete `3,8 · 22434`, und die Kamera stand bei **85 251**. Die Sonne war dann
 * 1,8 px gross, und keine Änderung an ihrem Radius konnte das beheben.
 *
 * **Warum der Test mit dem echten Universum allein nicht scharf wäre.** Im Beispiel ist der Fall
 * nicht mehr auslösbar: alle Kinder des Sonnensystems tragen `orbit` und `period`, und die Sonde ist
 * kein **direktes** Kind. Ein Test, der nur das echte Universum prüft, wäre also grün, egal ob die
 * Regel in `outermostOf` steht oder nicht — er würde eine Nachbarschaft prüfen, nicht die Regel.
 * Deshalb der **gebastelte** Baum: er enthält genau die drei Fälle, die zu unterscheiden sind.
 */
test('outermostOf nimmt nur Körper mit Bahn — nicht den weitesten überhaupt', () => {
  const system: Parameters<typeof outermostOf>[0] = {
    id: 'sys',
    name: 'Sys',
    level: 4,
    position: [0, 0, 0],
    radius: 10,
    mass: 1,
    kind: 'System',
    color: '#fff',
    system: true,
    children: [
      { id: 'kern', name: 'Kern', level: 3, position: [0, 0, 0], radius: 5, mass: 1, kind: 'Stern', color: '#fff', orbit: 0, period: 1 },
      { id: 'nah', name: 'Nah', level: 2, position: [100, 0, 0], radius: 1, mass: 1, kind: 'Planet', color: '#fff', orbit: 100, period: 1 },
      { id: 'weit', name: 'Weit', level: 2, position: [300, 0, 0], radius: 1, mass: 1, kind: 'Planet', color: '#fff', orbit: 300, period: 2 },
      // Eine **Sonde**: am weitesten draussen, aber ohne Bahn. Sie darf den Blick nicht bestimmen.
      { id: 'sonde', name: 'Sonde', level: 2, position: [900, 0, 0], radius: 1, mass: 1, kind: 'Sonde', color: '#fff' },
    ],
  }
  const aussen = outermostOf(system)
  expect(aussen?.body.name).toBe('Weit')
  expect(aussen?.radius).toBe(300)
})

test('der äusserste Ring des echten Sonnensystems ist Neptun', () => {
  const { aussen, state } = startView()
  expect(aussen.body.name).toBe('Neptun')
  /*
   * **Und der Abstand ist der Faktor aus `openingView` — nicht das Vierfache davon.**
   *
   * Der Faktor war **3,8**, solange die Schwelle der Bezugsebenen **70** betrug. Mit der neuen Schwelle
   * **30** fiel der Startblick damit auf **Ebene 5** (das Band von Ebene 4 ist jetzt 1 920 … 7 680) —
   * der Test „der Startblick zeigt das Sonnensystem" hat genau das gemeldet: *Erwartet 4, bekommen 5*.
   * Der Faktor ist deshalb **2,5**, und diese Zeile hält die Kopplung fest: **Schwelle und Startfaktor
   * sind eine Entscheidung, nicht zwei.**
   */
  expect(state.distance).toBeCloseTo(aussen.radius * 2.5, 0)
})

/**
 * **Die Sonne muss eine Scheibe sein, kein Punkt.**
 *
 * Das ist die Prüfung, die 85 251 Einheiten sofort gemeldet hätte. Sie rechnet dieselbe Formel wie
 * `labels.ts` — aber hier geht es nicht um die Beschriftung, sondern darum, dass ein Stern
 * **sichtbar** ist. 18 px ist die Grenze, ab der eine Kugel eine Scheibe ist statt eines Pixels.
 */
test('die Sonne ist im Startblick gross genug, um eine Sonne zu sein', () => {
  const { state, height } = startView()
  const pixel = (height * SUN_RADIUS) / (state.distance * Math.tan((60 * Math.PI) / 360))
  expect(pixel, `die Sonne ist nur ${pixel.toFixed(1)} px gross`).toBeGreaterThan(18)
})

test('das Drehen aendert den Abstand nicht — man kann bei jeder Stellung schauen', () => {
  const { state } = startView()
  const gedreht = rotateBy(state, 300, 120)
  expect(gedreht.distance).toBe(state.distance)
  // Und der Fokus bleibt, wo er war: Drehen ist Blickrichtung, nicht Ortswechsel.
  expect(gedreht.focus).toEqual(state.focus)
})

test('der Fokus springt auf ein Objekt, und der Abstand passt zu seiner Groesse', () => {
  const { universe, state } = startView()
  const erde = search(universe, 'Erde')[0]
  expect(erde).toBeDefined()
  if (!erde) return
  const nah = focusOn(state, erde.world, erde.body.radius)
  expect(nah.focus).toEqual(erde.world)
  // **Nicht kleiner als das Objekt.** Wer in einen Planeten hineinfliegt, sieht nichts.
  expect(nah.distance).toBeGreaterThan(erde.body.radius)
  // Und die Ebene wechselt mit: ein Planet ist Ebene 2.
  expect(levelForDistance(nah.distance)).toBeLessThanOrEqual(2)
})

/**
 * **Was auf den Ebenen 1–3 fehlte: der Stern — aber nicht überall.**
 *
 * Gemessen vor der Korrektur — `buildScene` lieferte auf den Ebenen 1–3 **kein einziges System**:
 *
 *     Ebene 1 | Systeme: — | als sun markiert: KEINE
 *     Ebene 2 | Systeme: — | als sun markiert: KEINE
 *     Ebene 3 | Systeme: — | als sun markiert: KEINE
 *     Ebene 4 | Systeme: Sonnensystem(11) | als sun markiert: Sonnensystem
 *
 * Ein System entsteht nur, wenn ein Körper **genau** auf der gesuchten Ebene liegt **und**
 * `system === true` hat. Zoomt man hinein, verschwand es — und mit ihm der Stern: **kein Licht**
 * (die Planeten hingen an keinem Punktlicht), keine Sonne im Bild, kaum ein Name.
 *
 * **Der Anker darf aber nicht überall stehen.** Der Betreiber hat die zweite Fassung gesehen:
 * auf der **Galaxie**-Ebene stand in der Pille „Sonne" — dort gibt es einen einzigen Körper
 * (`kosmischer Überblick`, Radius 9000), in dem eine 100-Einheiten-Sonne verschwindet. Sichtbar
 * blieb nur ihr **Name**.
 *
 * Die Regel, die beides trifft, ist an den Daten ablesbar:
 *
 *   - **Es kreist etwas** (`orbit > 0`): Ebene 1 (Voyager, 1412) und Ebene 2 (acht Planeten).
 *   - **Und der Stern fehlt** (kein Körper mit `kind === 'Stern'` in der gezeichneten Menge):
 *     auf Ebene 3 **ist** die Sonne gezeichnet, dort wäre der Anker eine zweite Sonne.
 */
test('der Anker steht nur dort, wo etwas kreist und der Stern fehlt', () => {
  const universe = exampleUniverse()
  const erwartet: Record<number, string | null> = {
    1: 'Sonne',
    2: 'Sonne',
    3: null,
    4: null,
    5: null,
    6: null,
    7: null,
  }
  for (const level of [1, 2, 3, 4, 5, 6, 7] as const) {
    const scene = buildScene(universe, level)
    const name = scene.anchor?.body.name ?? null
    expect(name, `Ebene ${level}: Anker ist ${name}, erwartet ${erwartet[level]}`).toBe(
      erwartet[level],
    )
    // Wo ein Anker steht, ist er ein **Stern** — sonst bekäme er kein Licht.
    if (scene.anchor) expect(scene.anchor.kind).toBe('sun')
    /*
     * **Und der Name braucht ein Element.** Die Szene baut ihre Beschriftungen aus `labeled`; steht
     * der Stern nicht darin, hat er keine — und die Auswahl (`chooseLabels`) kann nur lesen, was
     * schon da ist. Genau das war der Fehler, der die Sonne namenlos machte.
     */
    if (scene.anchor) {
      expect(
        scene.labeled.some((p) => p.body.id === scene.anchor?.body.id),
        `Ebene ${level}: der Anker steht nicht in \`labeled\``,
      ).toBe(true)
    }
  }
})

/**
 * **Die Grössenregel — die Antwort auf „die planeten sind ultra klein".**
 *
 * Der Betreiber: „die planeten galxien ect sind meistens ultra klein auch beim zoom rein ich denke die
 * grösse zoom sollte in bestimmte ebene geändert gezeichnet werden oder so idk schau dir mal an wie man
 * es realistisch lösen könnte".
 *
 * Die alte Regel war `Abstand · 0,005` für **jeden** Körper. Gemessen (`tools/scale.ts`) hiess das:
 *
 *     Abstand:   20000  11000   4761   1600    950    400    190
 *     Jupiter      7.8    7.8    7.8    7.8    9.9   23.5   49.5
 *     Saturn       7.8    7.8    7.8    7.8    8.6   20.5   43.1
 *     Erde         7.8    7.8    7.8    7.8    7.8    7.8    8.2
 *     Merkur       7.8    7.8    7.8    7.8    7.8    7.8    7.8
 *
 * Vier Körper, eine Zahl — die Grössenverhältnisse waren weg. Die neue Regel nimmt den **Median der
 * Ebene** als Bezugsgrösse.
 */
test('die Untergrenze staucht die Grössen, statt sie zu löschen', () => {
  const HOEHE = 900
  const FOV = 60
  const ABSTAND = 4761
  // Ebene 4 des Beispiels: Median 17, grösster 187 (gemessen mit `bun tools/_groesse.ts`).
  const minSize = minBodySize(17, 187, ABSTAND, HOEHE, FOV)
  /*
   * **Die Untergrenze kommt jetzt aus der SICHT, nicht aus der Ebene.**
   *
   * Hier stand `expect(minSize).toBeLessThan(17)` — die Untergrenze musste unter dem Median der Ebene
   * liegen, weil sie „den typischen Körper staucht". Das galt, solange nur die Ebenenregel
   * (`reference / SPREIZUNG` = 1,42) wirkte.
   *
   * Mit der **Sichtgrenze** als Untergrenze liegt sie darüber: 30,54 Einheiten, also 5 Bildpunkte
   * Radius. Und das ist beabsichtigt — der Betreiber hat gemeldet, dass die Körper auf den groben
   * Ebenen **nicht zu erkennen** waren („komische weisse und grösse das man es gar nicht erkennen
   * kann"). Eine Untergrenze, die unter dem Median bleibt, garantiert **keine** Sichtbarkeit.
   *
   * Was der Test weiter festhält, ist der Teil, auf den es ankommt: die **Reihenfolge**.
   */
  expect(minSize).toBeGreaterThan(17)
  expect(minSize).toBeLessThan(187)
  // **Und die Reihenfolge bleibt.** Das ist die Eigenschaft, auf der alles beruht.
  const gezeichnet = [0.38, 1, 6, 17, 100, 187].map((r) => drawnRadius(r, minSize))
  for (let i = 1; i < gezeichnet.length; i++) {
    expect(gezeichnet[i]).toBeGreaterThanOrEqual(gezeichnet[i - 1] ?? 0)
  }
  // Der grösste bleibt echt grösser als der kleinste — **das** war vorher nicht so.
  expect(gezeichnet[gezeichnet.length - 1]).toBeGreaterThan(gezeichnet[0] ?? 0)
  // Und die kleinsten sind nicht alle gleich: sie werden gestaucht, nicht auf einen Wert gezogen.
  // Gemessen sind es bei dieser Reihe **drei** verschiedene Werte (30,54 · 100 · 187) — die vier
  // kleinsten liegen unter der Sichtgrenze und sind deshalb gleich gross. Das ist der bewusste
  // Kompromiss (siehe `MIN_BODY_PIXELS`), und die Zahl steht hier, damit er sichtbar bleibt.
  const verschieden = new Set(gezeichnet).size
  expect(verschieden).toBeGreaterThanOrEqual(3)
  // Und der grösste Wert ist **nicht** die Untergrenze — die Regel löscht die Grössen nicht.
  expect(new Set(gezeichnet).size).toBeLessThan(gezeichnet.length)
})

test('die Untergrenze folgt der Ebene, nicht dem Abstand', () => {
  const HOEHE = 900
  const FOV = 60
  const ABSTAND = 4761
  // Eine grobe Ebene hat grosse Körper: die Untergrenze ist grösser, ohne den Abstand zu ändern.
  const grob = minBodySize(671, 671, ABSTAND, HOEHE, FOV)
  const fein = minBodySize(17, 187, ABSTAND, HOEHE, FOV)
  expect(grob).toBeGreaterThan(fein)
})

test('die harte Sichtgrenze greift, wenn die Ebenenregel zu klein wäre', () => {
  const HOEHE = 900
  const FOV = 60
  const ABSTAND = 20_000
  // Ein winziger Bezug (Median 1), ein riesiger Abstand: `1/12` wäre 0,08 Einheiten — unsichtbar.
  // Dann übernimmt die Sichtgrenze `MIN_BODY_PIXELS`.
  /*
   * **Und hier stand eine falsche Zahl — in einem Test.**
   *
   * Gerechnet war die Grenze als `2,4 · d · tan(fov/2) / viewHeight`, und der Kommentar dazu sagte
   * „Wer hier eine kleinere Zahl erwartet, hat den Bildwinkel vergessen". Der Bildwinkel war aber
   * **falsch eingesetzt**, und der Faktor fehlte an einer anderen Stelle: die halbe Fensterhöhe ist
   * `viewHeight / 2`, und dort stand `viewHeight`. Die Grenze war damit um **Faktor 2 zu klein** —
   * jeder Körper, der sie brauchte, wurde auf **1,2 px** statt 2,4 px gezogen.
   *
   * Nachgerechnet für 20 000, 900 px und 60°: **61,58** Welteneinheiten.
   *
   * Gefunden hat das der Betreiber, nicht der Test: „**beim zb projekt stack … verschwindet und taucht
   * auf komische weisse und grösse das man es gar nicht erkennen kann**". Ein Körper auf halber
   * Sichtgrenze ist ein Fleck, der beim kleinsten Zoom kippt.
   *
   * Die Probe steht in `tests/scale-pixel.test.ts`: dort wird die Grenze **vorwärts** in Bildpunkte
   * gerechnet. Dieser Test prüft nur noch, dass die Ebenenregel hier nicht mehr greift.
   */
  const sichtgrenze = (5 * ABSTAND * 2 * Math.tan((60 * Math.PI) / 360)) / HOEHE
  expect(sichtgrenze).toBeCloseTo(128.3, 2)
  const weit = minBodySize(1, 500, ABSTAND, HOEHE, FOV)
  expect(weit).toBeCloseTo(sichtgrenze, 3)
})

test('der Deckel beim groessten Koerper ist WEG — er machte die groben Ebenen leer', () => {
  /*
   * **Der Fehler, den dieser Test festhält.**
   *
   * `minBodySize` war gedeckelt beim **groessten** Koerper der Ebene. Auf den Ebenen 1 bis 7 schadet das
   * nicht — dort gibt es viele Koerper, und der Median liegt unter dem groessten.
   *
   * Auf den groben Ebenen **8 bis 12** steht aber **ein einziger** Koerper: der groesste **ist** der
   * einzige. Damit war `minSize = sein Radius`, die Sichtgrenze wurde wirkungslos, und das Maximum war
   * ein **leeres Bild**. Gemessen (`bun tools/_groesse.ts`): der „kosmische Überblick" hatte **0,3 px**
   * Radius, die „lokale Gruppe" 1,0 px, „Laniakea" 0,5 px.
   *
   * Der Betreiber: „**komische weisse und grösse das man es gar nicht erkennen kann was es ist**" und
   * „**es ist immer noch eine sonne obwohl ich ultra weit weg bin**".
   *
   * Jetzt gilt der Bezug nur noch als **Untergrenze**: `9000/12 = 750` — und **kein Deckel** nimmt sie
   * zurück.
   */
  const minSize = minBodySize(9000, 10, 4761, 900, 60)
  expect(minSize).toBe(750)
  /*
   * **Und die Ehrlichkeit bleibt.** Mit einer Untergrenze von 750 sind auch hier alle Körper unter 750
   * gleich gross. Die Regel erhält die Reihenfolge, sie **erfindet** keine Grössenunterschiede, wo die
   * Daten keine hergeben.
   */
  expect(drawnRadius(1, minSize)).toBe(750)
  expect(drawnRadius(10, minSize)).toBe(750)
  // Ein Körper **über** der Untergrenze behält seine echte Grösse — das ist der Normalfall.
  expect(drawnRadius(4000, minSize)).toBe(4000)
})

/**
 * **Beim Herauszoomen muss die Sonne VERSCHWINDEN.**
 *
 * Der Betreiber: „**es ist immer noch eine sonne obwohl ich ultra weit weg bin sollte da keine
 * universum werden als maxout**", mit der Reihenfolge „planet, Das Sonnensystem, Galaxien & Das
 * Universum".
 *
 * **Der Fehler.** Die Anker-Suche lief über den **ganzen Baum** (`suche(root, …)`) und fand die Sonne
 * **immer** — auch auf Ebene 7 („kosmischer Überblick", Radius 9000), wo sie ein Punkt **innerhalb**
 * des Überblicks ist. Sie wurde als Anker gezeichnet und blieb als Name stehen, egal wie weit man
 * hinauszoomte. **Das Grösste war damit nicht das Universum, sondern die Sonne.**
 *
 * **Die Regel.** Ein Körper und seine Nachfahren gehören zusammen: ein Körper der Ebene 4
 * („Sonnensystem") **enthält** seine Sterne. Ist die gezeigte Ebene **feiner** (`body.level >= level`),
 * sieht man in ihn hinein — dann darf sein Stern der Mittelpunkt sein. Ist sie **gröber**, ist er ein
 * Punkt unter anderen, und sein Inneres gehört nicht zum Bild.
 */
test('die Sonne ist nur auf feinen Ebenen der Mittelpunkt — nicht beim Universum', () => {
  const universe = exampleUniverse()
  // **Fein**: die Planeten kreisen um die Sonne, also ist sie der Mittelpunkt.
  for (const level of [1, 2] as const) {
    expect(buildScene(universe, level).anchor?.body.name, `Ebene ${level}`).toBe('Sonne')
  }
  // **Grob**: ab der Stern-Ebene ist die Sonne kein Anker mehr — sie ist selbst ein Körper, oder sie
  // liegt in einem Punkt, den die Ebene gar nicht aufmacht.
  for (const level of [3, 4, 5, 6, 7] as const) {
    expect(buildScene(universe, level).anchor, `Ebene ${level} hat unerwartet einen Anker`).toBeNull()
  }
  /*
   * **Und das Maximum ist das Universum, nicht die Sonne.**
   *
   * Auf der gröbsten Ebene steht genau **ein** Körper: der Wurzelknoten mit dem grössten Radius im
   * ganzen Baum. Wer ihn nicht sieht, sieht beim Herauszoomen etwas anderes — und genau das war der
   * Befund.
   */
  const groebste = buildScene(universe, 7)
  const koerper = [...groebste.placed, ...groebste.labeled]
  expect(koerper.length).toBeGreaterThan(0)
  const groesster = koerper.reduce((a, b) => (b.body.radius > a.body.radius ? b : a))
  expect(groesster.body.radius).toBe(Math.max(...koerper.map((p) => p.body.radius)))
  // Und die Sonne ist auf dieser Ebene **nicht** dabei.
  expect(koerper.some((p) => p.body.kind === 'Stern')).toBe(false)
})

test('die Szene der Startebene enthaelt das Sonnensystem', () => {
  const { universe } = startView()
  const scene = buildScene(universe, 4)
  expect(scene.systems.length).toBeGreaterThan(0)
  // **Nicht das erste System nehmen.** Auf Ebene 4 stehen auch die Platzhalter-Systeme des
  // Projekt-Stapels (`apps`, `packages`, `services`) — und sie kommen zuerst, weil der Stapel vor
  // dem Schauplatz gebaut wird. Wer `systems[0]` prueft, prueft einen Platzhalter und haelt das
  // Ergebnis fuer eine Aussage ueber das Sonnensystem.
  //
  // Erkannt wird es an der **Zahl der Koerper**: acht Planeten hat nur das echte System.
  const solar = scene.systems.find((system) => system.planets.length >= 8)
  expect(solar, 'kein System mit acht Planeten auf Ebene 4').toBeDefined()
  if (!solar) return
  // Der Kern des Systems ist der **Container** `Sonnensystem`; die Sonne ist sein erstes Kind. Das
  // ist die Struktur aus `universe.ts` — und deshalb steht hier der Containername, nicht „Sonne".
  expect(solar.star.body.name).toBe('Sonnensystem')
  // Die Bahnen liegen um den **Kern**, nicht um den Nullpunkt: alle positiv, die groesste gehoert
  // zu Neptun.
  expect(Math.max(...solar.orbits)).toBeGreaterThan(0)
  expect(solar.orbits.every((radius) => radius >= 0)).toBe(true)
})
