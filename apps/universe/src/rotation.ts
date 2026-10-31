/**
 * Rotation in **n** Dimensionen.
 *
 * **Was der Betreiber will:** „im grunde genommen ist es nicht 2d sondern 3D achse also nach
 * vorne und bei 5D ist es rotation ect." — die Welt ist ein **echter 3D-Raum**, und darüber
 * liegt die Rotation als eigene Groesse. Auf Nachfrage ausdruecklich: „doch das wollte ich".
 *
 * **Warum nicht drei Winkel (Euler).** Drei Winkel nacheinander zu drehen erzeugt eine
 * **Gimbal-Sperre**: bei bestimmten Stellungen faellt ein Freiheitsgrad weg und die Drehung
 * springt. Fuer eine echte 360°-Drehung in beliebiger Richtung ist das die falsche Wahl.
 *
 * **Zwei Darstellungen, zwei Aufgaben:**
 *
 *   - **Quaternion** — fuer die 3D-Welt. Vier Zahlen, keine Sperre, glatt interpolierbar,
 *     Zusammensetzen durch Multiplikation. Das ist, was die Kamera benutzt.
 *   - **schiefymmetrische Matrix (Bivektor)** — fuer **n** Dimensionen. In `n` Dimensionen hat
 *     `SO(n)` genau `n(n−1)/2` Drehflaechen: in 3D sind das 3, in 5D sind das **10**. Die
 *     Exponentialabbildung macht daraus die Rotationsmatrix.
 *
 * **Was „5D" hier heisst — ehrlich benannt.** Fuenf **Freiheitsgrade** der Ansicht, nicht fuenf
 * Raumachsen: drei Raumachsen (`x`, `y`, `z`) plus eine **Drehlage** plus die **Zeit**, mit der
 * sich die Drehlage aendert. Das Modul kann echter: es rechnet in beliebig vielen Dimensionen.
 * Die sichtbare Welt benutzt davon 3D plus Zeit — sonst waere sie nicht mehr zu verstehen.
 */

/** Ein Vektor beliebiger Laenge. */
export type Vec = readonly number[]

/** Eine quadratische Matrix, zeilenweise. */
export type Mat = readonly (readonly number[])[]

/** Die Einheitsmatrix der Groesse `n`. */
export function identity(n: number): Mat {
  return Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => (row === col ? 1 : 0)),
  )
}

/** Matrix mal Vektor. */
export function apply(matrix: Mat, v: Vec): number[] {
  return matrix.map((row) => row.reduce((sum, value, i) => sum + value * (v[i] ?? 0), 0))
}

/** Matrix mal Matrix. */
export function multiply(a: Mat, b: Mat): Mat {
  const n = a.length
  const m = b[0]?.length ?? 0
  const outer = b.length
  if (outer !== n) throw new Error(`Formen passen nicht: ${n}×${outer}`)
  return Array.from({ length: n }, (_, row) =>
    Array.from({ length: m }, (_, col) =>
      Array.from({ length: outer }, (_, k) => (a[row]?.[k] ?? 0) * (b[k]?.[col] ?? 0)).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ),
  )
}

/** Laenge eines Vektors. */
export function length(v: Vec): number {
  return Math.sqrt(v.reduce((sum, value) => sum + value * value, 0))
}

/** Die Determinante — fuer die Pruefung „ist das wirklich eine Drehung?". */
export function determinant(m: Mat): number {
  const n = m.length
  if (n === 0) return 1
  if (n === 1) return m[0]?.[0] ?? 0
  if (n === 2) return (m[0]?.[0] ?? 0) * (m[1]?.[1] ?? 0) - (m[0]?.[1] ?? 0) * (m[1]?.[0] ?? 0)
  let sum = 0
  for (let col = 0; col < n; col++) {
    const minor = m.slice(1).map((row) => row.filter((_, c) => c !== col))
    sum += (col % 2 === 0 ? 1 : -1) * (m[0]?.[col] ?? 0) * determinant(minor)
  }
  return sum
}

/**
 * Wie viele Drehflaechen hat `SO(n)`?
 *
 * In 2D: eine. In 3D: drei (x-y, y-z, z-x). In 5D: **zehn**. Diese Zahl ist der Grund, warum
 * „5D-Rotation" nicht einfach „eine Drehung mehr" ist — es sind sieben mehr.
 */
export function planeCount(n: number): number {
  return (n * (n - 1)) / 2
}

/** Alle Drehflaechen als Paare von Achsenindizes. */
export function planes(n: number): readonly (readonly [number, number])[] {
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) out.push([i, j])
  }
  return out
}

/**
 * Eine Drehung in **einer** Flaechenpaarung (Givens-Rotation).
 *
 * `i` und `j` sind die beiden Achsen, `angle` der Winkel. Die Matrix ist die Einheitsmatrix
 * mit vier geaenderten Eintraegen — genau das tut eine Drehung: sie mischt zwei Achsen
 * ineinander und laesst den Rest in Ruhe.
 */
export function rotationInPlane(n: number, i: number, j: number, angle: number): Mat {
  if (i === j) throw new Error('Eine Drehfläche braucht zwei verschiedene Achsen')
  if (i < 0 || j < 0 || i >= n || j >= n) throw new Error(`Achse außerhalb von 0…${n - 1}`)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const m = identity(n).map((row) => [...row])
  const rowI = m[i]
  const rowJ = m[j]
  if (!rowI || !rowJ) throw new Error('Achse nicht vorhanden')
  rowI[i] = c
  rowI[j] = -s
  rowJ[i] = s
  rowJ[j] = c
  return m
}

/**
 * Eine Drehung aus **mehreren** Flaechen zusammensetzen.
 *
 * Die Reihenfolge ist die der uebergebenen Liste. Sie ist **nicht** beliebig: zwei Drehungen
 * in verschiedenen Flaechen sind im Allgemeinen nicht vertauschbar — `A·B ≠ B·A`. Das ist
 * kein Mangel, sondern eine Eigenschaft des Raums; wer eine feste Reihenfolge festlegt, bekommt
 * ein eindeutiges Ergebnis.
 */
export function rotationFrom(
  n: number,
  turns: readonly { readonly plane: readonly [number, number]; readonly angle: number }[],
): Mat {
  let result = identity(n)
  for (const turn of turns) {
    const [i, j] = turn.plane
    result = multiply(rotationInPlane(n, i, j, turn.angle), result)
  }
  return result
}

/**
 * Setzt eine Drehung aus einem **Bivektor** zusammen — der ueblichen Form fuer `SO(n)`.
 *
 * Ein Bivektor hat einen Wert je Drehflaeche (`n(n−1)/2` Zahlen). In 3D sind das drei Zahlen —
 * genau die Achse-mal-Winkel-Form. In 5D sind es zehn. `time` ist der Parameter, mit dem sich
 * die Drehung **ueber die Zeit** aendert: der Betreiber will Bewegung, keine feste Stellung.
 */
export function rotationFromBivector(n: number, bivector: readonly number[], time = 1): Mat {
  const groups = planes(n)
  if (bivector.length !== groups.length) {
    throw new Error(`Bivektor braucht ${groups.length} Werte für ${n} Dimensionen, bekam ${bivector.length}`)
  }
  return rotationFrom(
    n,
    groups.map((plane, index) => ({ plane, angle: (bivector[index] ?? 0) * time })),
  )
}

/** Prueft, ob eine Matrix wirklich eine Drehung ist: orthogonal und Determinante +1. */
export function isRotation(m: Mat, tolerance = 1e-9): boolean {
  const n = m.length
  if (m.some((row) => row.length !== n)) return false
  if (Math.abs(determinant(m) - 1) > tolerance) return false
  // Orthogonal heisst: die Spalten stehen paarweise senkrecht aufeinander und sind Einheitsvektoren.
  for (let a = 0; a < n; a++) {
    for (let b = a; b < n; b++) {
      let dot = 0
      for (let row = 0; row < n; row++) dot += (m[row]?.[a] ?? 0) * (m[row]?.[b] ?? 0)
      if (Math.abs(dot - (a === b ? 1 : 0)) > tolerance) return false
    }
  }
  return true
}

// ── Die 3D-Darstellung: Quaternion ───────────────────────────────────────────────────────
//
// Warum hier eine **zweite** Darstellung steht, obwohl die Matrix alles kann: ein Quaternion
// ist vier Zahlen statt neun, laesst sich glatt interpolieren und ist das, was three.js
// erwartet. Fuer die vielen Einzelteile der Szene ist das der Unterschied zwischen fluessig
// und ruckelig.

/** Ein Quaternion als `[x, y, z, w]`. */
export type Quat = readonly [number, number, number, number]

export const identityQuat: Quat = [0, 0, 0, 1]

/** Quaternion aus Achse und Winkel. Die Achse wird normiert — sonst dreht es falsch. */
export function quatFromAxisAngle(axis: readonly [number, number, number], angle: number): Quat {
  const len = Math.hypot(axis[0], axis[1], axis[2])
  if (len === 0) throw new Error('Drehachse darf nicht der Nullvektor sein')
  const half = angle / 2
  const s = Math.sin(half) / len
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)]
}

/**
 * Zwei Drehungen zusammensetzen: **erst `a`, dann `b`**.
 *
 * Das Ergebnis ist `b·a` — in dieser Reihenfolge. Wer sie vertauscht, bekommt eine andere
 * Drehung, und der Fehler sieht „nur ein bisschen falsch" aus.
 */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** Dreht einen Vektor mit einem Quaternion. */
export function quatRotate(q: Quat, v: readonly [number, number, number]): [number, number, number] {
  const [x, y, z, w] = q
  // v' = v + 2w(q_v × v) + 2 q_v × (q_v × v) — die uebliche, guenstige Form.
  const [vx, vy, vz] = v
  const tx = 2 * (y * vz - z * vy)
  const ty = 2 * (z * vx - x * vz)
  const tz = 2 * (x * vy - y * vx)
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ]
}

/** Laenge eines Quaternions — muss 1 bleiben, sonst enthaelt es eine Skalierung. */
export function quatLength(q: Quat): number {
  return Math.hypot(q[0], q[1], q[2], q[3])
}

/**
 * **5D als Ansicht:** ein Bivektor der Laenge 10 mit einer Zeit.
 *
 * Das ist die Form, die der Betreiber beschreibt: die Drehlage ist **eine Groesse**, die sich
 * mit der Zeit aendert — nicht drei Winkel, die man einzeln nachzieht. Wer die Eigenrotation
 * anhalten will, setzt `time` auf 0.
 */
export interface View5D {
  /** Zehn Drehflaechen-Werte fuer `SO(5)`. */
  readonly bivector: readonly number[]
  /** Wie weit die Drehung fortgeschritten ist. 1 = die eingestellte Stellung. */
  readonly time: number
}

export const defaultView5D: View5D = {
  bivector: [0.15, 0, 0.25, 0, 0, 0, 0, 0, 0, 0],
  time: 1,
}

/** Baut die `SO(5)`-Matrix aus der Ansicht. */
export function view5dMatrix(view: View5D): Mat {
  return rotationFromBivector(5, view.bivector, view.time)
}
