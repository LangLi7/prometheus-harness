/**
 * **Wann ein Name gezeigt wird** — die Regel, ohne Browser geprüft.
 *
 * **Warum dieser Test entstanden ist.** Der Betreiber: „wenn es immer anzeigt ist es unschön evt
 * sollten wir name nur ab bestimmte grösse radius also fokusiert". Im gemessenen Bild standen
 * **22 Namen** gleichzeitig, sechs davon als Klumpen um die Sonne.
 *
 * **Was hier geprüft wird, ist die Rechnung.** Die Bildschirmgrösse eines Körpers hängt von Radius,
 * Abstand, Bildhöhe und Bildwinkel ab — vier Zahlen, die man einzeln nachrechnen kann. Wer die
 * Grenze ändert, sieht hier sofort, wen sie trifft.
 */
import { expect, test } from 'bun:test'
import {
  MAX_LABELS_PER_LEVEL,
  MIN_LABEL_PIXELS,
  MIN_STAR_PIXELS,
  chooseLabels,
  labelDecision,
  screenDiameter,
} from '../src/labels'
import type { LabelInput } from '../src/labels'

/** Der Bildwinkel, den die Szene benutzt (`PerspectiveCamera(60, …)`). */
const FOV = 60
const HOEHE = 900

function eingabe(over: Partial<LabelInput> = {}): LabelInput {
  return { radius: 1, cameraDistance: 1000, kind: 'body', focused: false, imBild: false, ...over }
}

test('die Bildschirmgrösse folgt der Rechnung: Höhe · r / (d · tan(fov/2))', () => {
  // Ein Körper von 100 Einheiten in 1000 Abstand bei 900 px Höhe und 60° Bildwinkel:
  // 900 · 100 / (1000 · tan(30°)) = 90000 / 577,35 = 155,9 px
  expect(screenDiameter(100, 1000, HOEHE, FOV)).toBeCloseTo(155.9, 1)
  // Doppelter Abstand, halbe Grösse.
  expect(screenDiameter(100, 2000, HOEHE, FOV)).toBeCloseTo(77.9, 1)
})

test('unmögliche Zahlen ergeben 0 — nicht NaN und nicht unendlich', () => {
  // Ein Körper ohne Grösse, ein Abstand von 0, eine Höhe von 0: alles Fälle, in denen eine
  // Division NaN oder Infinity ergäbe. Ein NaN würde jeden Vergleich stillschweigend falsch machen.
  for (const wert of [
    screenDiameter(0, 1000, HOEHE, FOV),
    screenDiameter(10, 0, HOEHE, FOV),
    screenDiameter(10, 1000, 0, FOV),
  ]) {
    expect(wert).toBe(0)
    expect(Number.isNaN(wert)).toBe(false)
  }
})

test('ein kleiner Körper wird nicht benannt — ein grosser schon', () => {
  // Bei Abstand 5000 und 900 px Höhe: 1 Einheit Radius ergeben 0,3 px, 30 Einheiten ergeben 9,3 px.
  const klein = labelDecision(eingabe({ radius: 1, cameraDistance: 5000 }), HOEHE, FOV)
  expect(klein.show).toBe(false)
  expect(klein.reason).toBe('too-small')

  const gross = labelDecision(eingabe({ radius: 60, cameraDistance: 5000 }), HOEHE, FOV)
  expect(gross.show).toBe(true)
  expect(gross.reason).toBe('big-enough')
})

test('der Fokus wird IMMER benannt — auch wenn er klein ist', () => {
  const winzig = eingabe({ radius: 0.01, cameraDistance: 90_000, focused: true })
  const entscheidung = labelDecision(winzig, HOEHE, FOV)
  // **Das ist die Ausnahme, für die es die Regel gibt.** Wer einen Körper ansieht, will seinen
  // Namen sehen — sonst verschwindet genau der, den man sucht.
  expect(entscheidung.show).toBe(true)
  expect(entscheidung.reason).toBe('focused')
})

test('ein Körper, in dem man steht, wird ebenfalls benannt', () => {
  const drin = eingabe({ radius: 0.01, cameraDistance: 90_000, imBild: true })
  expect(labelDecision(drin, HOEHE, FOV).reason).toBe('focused')
})

test('Sterne bekommen ihre Grenze früher als Planeten', () => {
  // Ein Stern ist der **Anker** des Systems: wer ihn nicht benannt sieht, weiss nicht, wo das
  // System hängt. Deshalb 8 px statt 14.
  const stern = eingabe({ radius: 26, cameraDistance: 3000, kind: 'star' })
  const planet = eingabe({ radius: 26, cameraDistance: 3000, kind: 'body' })
  const pixel = screenDiameter(26, 3000, HOEHE, FOV)
  expect(pixel).toBeGreaterThan(MIN_STAR_PIXELS)
  expect(pixel).toBeLessThan(MIN_LABEL_PIXELS)
  expect(labelDecision(stern, HOEHE, FOV).show).toBe(true)
  expect(labelDecision(planet, HOEHE, FOV).show).toBe(false)
})

test('die Auswahl nimmt die GRÖSSTEN — nicht die ersten', () => {
  // Drei Kandidaten, alle über der Grenze. Die Ebene lässt nur zwei zu.
  const grenze = MAX_LABELS_PER_LEVEL[4] ?? 8
  const kandidaten = Array.from({ length: grenze + 3 }, (_, i) => ({
    id: `k${i}`,
    ...eingabe({ radius: 10 + i, cameraDistance: 500 }),
  }))
  const gewaehlt = chooseLabels(kandidaten, 4, HOEHE, FOV)
  expect(gewaehlt.length).toBe(grenze)
  // Der grösste ist dabei, der kleinste nicht.
  expect(gewaehlt).toContain(`k${grenze + 2}`)
  expect(gewaehlt).not.toContain('k0')
})

test('der Fokus steht vor allen anderen und verdrängt keinen Platz', () => {
  const grenze = MAX_LABELS_PER_LEVEL[4] ?? 8
  // **Der Fokus ist winzig** — er käme über die Grösse nie durch. Dazu **mehr** grosse Kandidaten,
  // als die Ebene zulässt.
  //
  // Warum „mehr als die Grenze": mit genau `grenze` Kandidaten ist der Test nicht zu unterscheiden
  // von einem, in dem der Fokus **einen** Platz wegnimmt — beide ergeben dieselbe Zahl. Erst mit
  // einem Kandidaten zu viel zeigt sich, dass der Fokus **verdrängt** und nicht nur mitzählt.
  const kandidaten = [
    { id: 'fokus', ...eingabe({ radius: 0.01, cameraDistance: 90_000, focused: true }) },
    ...Array.from({ length: grenze + 1 }, (_, i) => ({
      id: `k${i}`,
      ...eingabe({ radius: 40 + i, cameraDistance: 500 }),
    })),
  ]
  const gewaehlt = chooseLabels(kandidaten, 4, HOEHE, FOV)
  // **Die Grenze gilt für die Grossen, der Fokus kommt dazu.** Also `grenze + 1` — und der
  // kleinste der Grossen fällt heraus.
  expect(gewaehlt.length).toBe(grenze + 1)
  expect(gewaehlt).toContain('fokus')
  expect(gewaehlt).not.toContain('k0')
  // Und der Fokus steht **vorne**: seine Lage ist die Ausnahme, nicht ein Kontingentplatz.
  expect(gewaehlt[0]).toBe('fokus')
})

test('auch der Fokus wird auf Überlagerung geprüft — Sonne schlägt Sonnensystem', () => {
  // **Der Fehler, den dieser Test festhält.** Im gemessenen Bild standen „Sonne" und
  // „Sonnensystem" übereinander: beide sind Fokus (derselbe Punkt), und der Fokus war von der
  // Überlagerungsprüfung ausgenommen — die Regel galt nur für die anderen. Ein Name, der einen
  // anderen verdeckt, ist keiner.
  const stelle = { screenX: 700, screenY: 450, textWidth: 90 }
  const kandidaten = [
    // Der Stern: 26 Einheiten in 3000 Abstand ergeben rund 13,5 px.
    { id: 'sun', ...eingabe({ radius: 26, cameraDistance: 3000, kind: 'star', focused: true }), ...stelle },
    // Das System: kleiner gezeichnet, also verliert es.
    { id: 'solar', ...eingabe({ radius: 8, cameraDistance: 3000, kind: 'star', focused: true }), ...stelle },
  ]
  const gewaehlt = chooseLabels(kandidaten, 4, HOEHE, FOV)
  expect(gewaehlt).toContain('sun')
  expect(gewaehlt).not.toContain('solar')
})

test('zwei Fokus-Namen an verschiedenen Stellen bleiben beide stehen', () => {
  // Die Gegenprobe: geprüft wird die **Lage**, nicht der Fokus an sich. Wer die Regel zu scharf
  // macht, verliert Namen, die sich gar nicht stören.
  const kandidaten = [
    { id: 'a', ...eingabe({ radius: 26, cameraDistance: 3000, focused: true }), screenX: 200, screenY: 120, textWidth: 90 },
    { id: 'b', ...eingabe({ radius: 20, cameraDistance: 3000, focused: true }), screenX: 900, screenY: 700, textWidth: 90 },
  ]
  expect(chooseLabels(kandidaten, 4, HOEHE, FOV)).toEqual(['a', 'b'])
})

test('was zu klein ist, kommt auch bei freier Grenze nicht durch', () => {
  const kandidaten = [
    { id: 'winzig', ...eingabe({ radius: 0.001, cameraDistance: 100_000 }) },
    { id: 'gross', ...eingabe({ radius: 60, cameraDistance: 800 }) },
  ]
  const gewaehlt = chooseLabels(kandidaten, 7, HOEHE, FOV)
  expect(gewaehlt).toEqual(['gross'])
})

test('jede Bezugsebene hat eine Obergrenze, und keine ist null', () => {
  for (const level of [1, 2, 3, 4, 5, 6, 7] as const) {
    const grenze = MAX_LABELS_PER_LEVEL[level]
    expect(grenze).toBeGreaterThan(0)
    // Und die feine Ebene verträgt weniger Namen als die mittlere — dort sind die Körper grösser
    // und die Übersicht wichtiger.
    expect(grenze).toBeLessThanOrEqual(8)
  }
})
