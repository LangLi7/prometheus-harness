import { expect, test } from 'bun:test'
import { Quaternion, Vector3 } from 'three'
import {
  EBENEN_MAX,
  MAX_DISTANCE,
  MIN_DISTANCE,
  ROTATE_SPEED,
  cameraPosition,
  defaultCamera,
  focusOn,
  levelForDistance,
  panBy,
  rotateBy,
  zoomBy,
} from '../src/camera'

test('Zoom ist ein Faktor: gleich viele Rastschritte ergeben denselben Faktor', () => {
  const start = defaultCamera()
  const einmal = zoomBy(zoomBy(start, 1), 1)
  const zweimal = zoomBy(start, 2)
  expect(Math.abs(einmal.distance - zweimal.distance)).toBeLessThan(1e-9)
})

test('hineinzoomen verkuerzt den Abstand, herauszoomen verlaengert ihn', () => {
  const start = defaultCamera()
  expect(zoomBy(start, 1).distance).toBeLessThan(start.distance)
  expect(zoomBy(start, -1).distance).toBeGreaterThan(start.distance)
})

test('der Abstand bleibt in den Grenzen — auch bei 500 Rastschritten', () => {
  let state = defaultCamera()
  for (let i = 0; i < 500; i++) state = zoomBy(state, 1)
  expect(state.distance).toBeGreaterThanOrEqual(MIN_DISTANCE)
  let out = defaultCamera()
  for (let i = 0; i < 500; i++) out = zoomBy(out, -1)
  expect(out.distance).toBeLessThanOrEqual(MAX_DISTANCE)
})

test('die Drehlage bleibt ein Einheitsquaternion — 500 Drehungen driften nicht', () => {
  let state = defaultCamera()
  for (let i = 0; i < 500; i++) state = rotateBy(state, 7, 3)
  const q = new Quaternion(...state.orientation)
  expect(Math.abs(q.length() - 1)).toBeLessThan(1e-6)
})

test('eine volle Umdrehung um die Hochachse kommt zurueck — 360 Grad ohne Sperre', () => {
  // Genau eine Umdrehung: der Winkel je Schritt mal der Schrittzahl ergibt 2*PI.
  const dx = 10
  const steps = Math.round((Math.PI * 2) / (ROTATE_SPEED * dx))
  let state = defaultCamera()
  for (let i = 0; i < steps; i++) state = rotateBy(state, dx, 0, ROTATE_SPEED)
  const q = new Quaternion(...state.orientation)
  // Ein Quaternion und sein Negativ sind dieselbe Drehung — deshalb ueber den Betrag.
  const dot = Math.abs(q.dot(new Quaternion(0, 0, 0, 1)))
  expect(dot).toBeGreaterThan(0.9999)
})

test('ueber den Pol hinweg bleibt die Drehung stetig — keine Gimbal-Sperre', () => {
  let state = defaultCamera()
  const seen: number[] = []
  for (let i = 0; i < 200; i++) {
    state = rotateBy(state, 0, 20)
    const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(...state.orientation))
    seen.push(forward.y)
  }
  // Bei einer Sperre spraenge ein Wert; hier darf sich jedes Glied nur wenig aendern.
  for (let i = 1; i < seen.length; i++) {
    expect(Math.abs((seen[i] ?? 0) - (seen[i - 1] ?? 0))).toBeLessThan(0.5)
  }
})

test('die Kameraposition haelt den Abstand zum Fokus ein', () => {
  const state = rotateBy(zoomBy(defaultCamera(), 3), 40, 15)
  const position = cameraPosition(state)
  const focus = new Vector3(...state.focus)
  expect(Math.abs(position.distanceTo(focus) - state.distance)).toBeLessThan(1e-6)
})

test('Pan bewegt den Fokus, ohne den Abstand zu aendern', () => {
  const state = panBy(defaultCamera(), 30, -12)
  expect(state.distance).toBe(defaultCamera().distance)
  expect(state.focus.some((n, i) => n !== defaultCamera().focus[i])).toBe(true)
})

test('der Bezugswechsel setzt die Kamera in das Objekt, bezogen auf seine Groesse', () => {
  const klein = focusOn(defaultCamera(), [10, 20, 30], 2)
  const gross = focusOn(defaultCamera(), [10, 20, 30], 900)
  expect(klein.focus).toEqual([10, 20, 30])
  expect(gross.focus).toEqual([10, 20, 30])
  // Ein Planet wird aus der Naehe betrachtet, ein Filament aus der Ferne — sonst landet
  // man bei grossen Objekten *in* ihnen und sieht nichts.
  expect(klein.distance).toBeLessThan(gross.distance)
  expect(klein.distance).toBeGreaterThanOrEqual(MIN_DISTANCE)
})

test('naeher heran waehlt eine feinere Bezugsebene, weiter weg eine groebere', () => {
  // Die Richtung folgt `universe.ts`: je GROESSER die Zahl, desto GROESSER der Bezug.
  const nah = levelForDistance(200)
  const fern = levelForDistance(200_000)
  expect(fern).toBeGreaterThan(nah)
  // Zwoelf Ebenen: 1 = Kleinkörper, 12 = Universum (siehe `LEVELS` in `universe.ts`).
  for (const d of [0.5, 10, 70, 300, 1200, 5000, 20_000, 80_000, 320_000, 1_300_000]) {
    const level = levelForDistance(d)
    expect(level).toBeGreaterThanOrEqual(1)
    expect(level).toBeLessThanOrEqual(12)
  }
})

test('ganz weit draussen ist die groebste Ebene erreicht — das Universum', () => {
  expect(levelForDistance(MAX_DISTANCE)).toBe(12)
  expect(levelForDistance(MIN_DISTANCE)).toBe(1)
})

test('herauszoomen fuehrt durch ALLE zwoelf Ebenen, ohne eine zu ueberspringen', () => {
  /*
   * Der Bezugswechsel darf nicht springen: von der Naehe bis ganz weit draussen muss jede Ebene
   * mindestens einmal vorkommen — sonst sieht man eine Groessenordnung nie.
   *
   * **Dieser Test hat die obere Grenze gerettet.** Mit `MAX_DISTANCE = 4 Mio` und zwoelf Ebenen war bei
   * Ebene **9** Schluss: die Ebenen 10 bis 12 lagen **hinter** der Grenze und waren nicht erreichbar.
   * Die Liste wird aus `EBENEN_MAX` gebaut und nicht hingeschrieben — eine zweite Kopie der Zahl wäre
   * eine zweite Wahrheit, und genau die hat hier schon einmal gestanden.
   */
  const seen = new Set<number>()
  for (let d = MIN_DISTANCE; d < MAX_DISTANCE; d *= 1.3) seen.add(levelForDistance(d))
  const erwartet = Array.from({ length: EBENEN_MAX }, (_, i) => i + 1)
  expect([...seen].sort((a, b) => a - b)).toEqual(erwartet)
})

test('der Startblick zeigt das Sonnensystem — nicht einen Stern allein', () => {
  // Der Fehler, den das prüft: mit zu weit auseinanderliegenden Schwellen landete ein
  // Startblick, der die inneren Planeten zeigt, schon auf der **Stern**-Ebene. Man sah den
  // Stern, aber nicht sein System.
  //
  // **Warum hier 3 000 steht und nicht 12 000.** Die Schwelle der Bezugsebenen ist von **70** auf **30**
  // gefallen, damit die Rahmung ihr eigenes Band halten kann (Herleitung in `camera.ts` bei
  // `SCHWELLE`). Damit ist das Band von Ebene 4 jetzt **1 920 … 7 680** statt 4 500 … 17 950 — und
  // 12 000 liegt darin **nicht mehr**. Die Zahl im Test ist also nicht der Startwert, sondern der
  // **typische** Abstand dieser Ebene; der Startwert selbst steht in `opening-view.test.ts` und ist
  // an die Schwelle gekoppelt.
  expect(levelForDistance(3_000)).toBe(4)
})
