import { expect, test } from 'bun:test'
import {
  apply,
  determinant,
  identity,
  isRotation,
  length,
  multiply,
  planeCount,
  planes,
  quatFromAxisAngle,
  quatLength,
  quatMultiply,
  quatRotate,
  rotationFrom,
  rotationFromBivector,
  rotationInPlane,
  view5dMatrix,
  defaultView5D,
} from '../src/rotation'

// ── Die Groesse des Problems ─────────────────────────────────────────────────────────────

test('SO(n) hat n(n−1)/2 Drehflaechen — in 5D sind das zehn, nicht fuenf', () => {
  expect(planeCount(2)).toBe(1)
  expect(planeCount(3)).toBe(3)
  expect(planeCount(4)).toBe(6)
  expect(planeCount(5)).toBe(10)
  expect(planes(5)).toHaveLength(10)
})

// ── Die Grundeigenschaften einer Drehung ─────────────────────────────────────────────────

test('eine Drehung in einer Flaeche ist eine echte Drehung', () => {
  for (const n of [2, 3, 5]) {
    for (const [i, j] of planes(n)) {
      const m = rotationInPlane(n, i, j, 0.7)
      expect(isRotation(m)).toBe(true)
      expect(Math.abs(determinant(m) - 1)).toBeLessThan(1e-12)
    }
  }
})

test('Laengentreue: eine Drehung aendert die Laenge nicht — 1000 Zufallsvektoren in 3D und 5D', () => {
  const m3 = rotationFrom(3, [
    { plane: [0, 1], angle: 0.9 },
    { plane: [1, 2], angle: -0.4 },
  ])
  const m5 = rotationFromBivector(5, [0.3, -0.7, 0.2, 0.5, -0.1, 0.4, 0.6, -0.3, 0.8, -0.2], 1)
  let seed = 12345
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296 - 0.5
  }
  for (let i = 0; i < 1000; i++) {
    const v3 = [rnd(), rnd(), rnd()]
    const v5 = [rnd(), rnd(), rnd(), rnd(), rnd()]
    expect(Math.abs(length(apply(m3, v3)) - length(v3))).toBeLessThan(1e-12)
    expect(Math.abs(length(apply(m5, v5)) - length(v5))).toBeLessThan(1e-12)
  }
})

test('360 Grad kommt zurueck — in jeder Drehflaeche einzeln', () => {
  for (const n of [2, 3, 5]) {
    for (const [i, j] of planes(n)) {
      const m = rotationInPlane(n, i, j, Math.PI * 2)
      const id = identity(n)
      for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
          expect(Math.abs((m[row]?.[col] ?? 0) - (id[row]?.[col] ?? 0))).toBeLessThan(1e-12)
        }
      }
    }
  }
})

test('zusammengesetzte Drehungen bleiben Drehungen — 10 000 Multiplikationen driften nicht', () => {
  // Das ist die Pruefung gegen die Gimbal-Sperre: eine Sperre wuerde hier als Sprung oder als
  // Determinante ungleich 1 sichtbar.
  let m = identity(5)
  const step = rotationFromBivector(5, [0.001, 0.002, -0.001, 0.003, 0, 0.002, -0.002, 0.001, 0, 0.001], 1)
  for (let i = 0; i < 10_000; i++) m = multiply(step, m)
  expect(Math.abs(determinant(m) - 1)).toBeLessThan(1e-9)
  expect(isRotation(m, 1e-9)).toBe(true)
})

test('die Reihenfolge zaehlt: zwei Drehungen in verschiedenen Flaechen sind nicht vertauschbar', () => {
  const a = rotationInPlane(3, 0, 1, 0.8)
  const b = rotationInPlane(3, 1, 2, 0.6)
  const ab = multiply(a, b)
  const ba = multiply(b, a)
  let differs = 0
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (Math.abs((ab[row]?.[col] ?? 0) - (ba[row]?.[col] ?? 0)) > 1e-6) differs += 1
    }
  }
  // Das ist **kein** Fehler, sondern eine Eigenschaft des Raums. Wer die Reihenfolge vertauscht,
  // bekommt eine andere Drehung — deshalb ist sie in `rotationFrom` ausdruecklich festgelegt.
  expect(differs).toBeGreaterThan(0)
})

// ── Die Zeit als Parameter ───────────────────────────────────────────────────────────────

test('die Drehung aendert sich mit der Zeit — time = 0 ist die Ausgangslage', () => {
  const bivector = [0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const still = rotationFromBivector(5, bivector, 0)
  expect(isRotation(still)).toBe(true)
  const id = identity(5)
  for (let i = 0; i < 5; i++) expect(Math.abs((still[i]?.[i] ?? 0) - (id[i]?.[i] ?? 0))).toBeLessThan(1e-12)

  const moved = rotationFromBivector(5, bivector, 1)
  let differs = false
  for (let i = 0; i < 5; i++) if (Math.abs((moved[i]?.[i] ?? 0) - (id[i]?.[i] ?? 0)) > 1e-6) differs = true
  expect(differs).toBe(true)
})

test('eine volle Umdrehung ueber die Zeit kommt zurueck', () => {
  // Winkel 2*PI in der ersten Flaeche entspricht time = 2*PI / 1 bei bivector[0] = 1.
  const m = rotationFromBivector(5, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], Math.PI * 2)
  const id = identity(5)
  for (let i = 0; i < 5; i++) expect(Math.abs((m[i]?.[i] ?? 0) - (id[i]?.[i] ?? 0))).toBeLessThan(1e-12)
})

test('die voreingestellte 5D-Ansicht ist gueltig', () => {
  const m = view5dMatrix(defaultView5D)
  expect(m).toHaveLength(5)
  expect(isRotation(m)).toBe(true)
})

test('ein Bivektor mit falscher Laenge wird abgelehnt statt still zu rechnen', () => {
  expect(() => rotationFromBivector(5, [1, 2, 3])).toThrow(/10 Werte/)
  expect(() => rotationFromBivector(3, [1, 2, 3, 4])).toThrow(/3 Werte/)
})

test('ungueltige Achsen werden abgelehnt', () => {
  expect(() => rotationInPlane(3, 1, 1, 0.5)).toThrow(/zwei verschiedene/)
  expect(() => rotationInPlane(3, 0, 7, 0.5)).toThrow(/außerhalb/)
})

// ── Die 3D-Darstellung: Quaternion ──────────────────────────────────────────────────────

test('ein Quaternion bleibt ein Einheitsquaternion — 1000 Drehungen driften nicht', () => {
  let q = quatFromAxisAngle([0, 1, 0], 0.01)
  const step = quatFromAxisAngle([0.3, 1, 0.2], 0.01)
  for (let i = 0; i < 1000; i++) q = quatMultiply(step, q)
  expect(Math.abs(quatLength(q) - 1)).toBeLessThan(1e-9)
})

test('quatRotate erhaelt die Laenge', () => {
  const q = quatFromAxisAngle([1, 2, 3], 1.234)
  const v: [number, number, number] = [3, -4, 12]
  const r = quatRotate(q, v)
  expect(Math.abs(Math.hypot(r[0], r[1], r[2]) - Math.hypot(v[0], v[1], v[2]))).toBeLessThan(1e-12)
})

test('ueber den Pol hinweg bleibt die Drehung stetig — keine Gimbal-Sperre', () => {
  // Bei Euler-Winkeln spraenge hier ein Wert. Mit Quaternionen darf sich jedes Glied nur
  // wenig aendern.
  let q = quatFromAxisAngle([1, 0, 0], 0)
  const forward: number[] = []
  for (let i = 0; i < 200; i++) {
    q = quatMultiply(quatFromAxisAngle([1, 0, 0], 0.05), q)
    const r = quatRotate(q, [0, 0, -1])
    forward.push(r[1])
  }
  for (let i = 1; i < forward.length; i++) {
    expect(Math.abs((forward[i] ?? 0) - (forward[i - 1] ?? 0))).toBeLessThan(0.1)
  }
})

test('eine volle Umdrehung mit dem Quaternion kommt zurueck', () => {
  const q = quatFromAxisAngle([0, 1, 0], Math.PI * 2)
  // Bei 2*PI ist das Quaternion (0,0,0,-1) — das ist **dieselbe** Drehung wie (0,0,0,1).
  const v = quatRotate(q, [1, 0.5, -2])
  expect(Math.abs(v[0] - 1)).toBeLessThan(1e-12)
  expect(Math.abs(v[1] - 0.5)).toBeLessThan(1e-12)
  expect(Math.abs(v[2] + 2)).toBeLessThan(1e-12)
})

test('eine Drehachse aus dem Nullvektor wird abgelehnt — sie dreht nicht', () => {
  expect(() => quatFromAxisAngle([0, 0, 0], 1)).toThrow(/Nullvektor/)
})

test('laengere Achsen drehen gleich — die Achse wird normiert', () => {
  const kurz = quatFromAxisAngle([0, 1, 0], 0.5)
  const lang = quatFromAxisAngle([0, 7, 0], 0.5)
  for (let i = 0; i < 4; i++) expect(Math.abs((kurz[i] ?? 0) - (lang[i] ?? 0))).toBeLessThan(1e-12)
})
