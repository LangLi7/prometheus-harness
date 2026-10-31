/**
 * Farben finden — aus einem Bild mit Antialiasing werden wenige **flache** Farben.
 *
 * ## Warum das nicht „die häufigsten Farben" sind
 *
 * Ein Bild aus einem Bildmodell ist **flach gemeint**, aber nicht flach gespeichert: jede Kante
 * trägt Zwischenwerte (Antialiasing). Zählt man exakte Farben, stehen Dutzende Blendtöne zwischen
 * Orange und Weiß — und ein Vektorisierer machte daraus Dutzende Flächen. Deshalb:
 *
 * 1. **Grobe Körnung zählen** (5 Bit je Kanal), damit ähnliche Töne zusammenfallen.
 * 2. **Zentren weit auseinander** wählen (Mindestabstand), damit Orange und Hellorange nicht zwei
 *    Farben werden.
 * 3. **k-Means** über die echten Pixel — die Zentren wandern dorthin, wo die Masse liegt.
 * 4. **Kleine Flächen schlucken**: ein Saum von einem Pixel Breite ist kein Motiv, sondern ein
 *    Rest des Antialiasings.
 *
 * Der letzte Schritt ist der wichtigste für die Optik: ohne ihn bliebe um jede Kante ein
 * heller Saum stehen, der wie ein Fehler aussieht.
 *
 * @module @prometheus-harness/vectorize/farben
 */

import type { Bild } from './png.ts'

/** Eine Farbe als drei Kanäle 0…255. */
export type Farbe = readonly [number, number, number]

/** Was die Farbwahl ergeben hat. */
export interface Quantisiert {
  /** Die gefundenen Farben, größte Fläche zuerst. */
  readonly farben: readonly Farbe[]
  /** Je Pixel der Index in {@link farben}. */
  readonly labels: Uint8Array
  readonly bericht: {
    readonly gefunden: number
    readonly kleineFlaechen: number
    readonly flaechen: readonly number[]
  }
}

/** Wie die Farbwahl eingestellt wird. */
export interface Farboptionen {
  /** Höchstens so viele Farben. Vorgabe: 6. */
  readonly farben?: number
  /** Flächen unter so vielen Pixeln werden geschluckt. Vorgabe: 64. */
  readonly minFlaeche?: number
}

/**
 * Der Abstand zweier Farben im Quadrat.
 *
 * @param a - die eine
 * @param b - die andere
 * @returns der Abstand zum Quadrat
 */
function abstand2(a: Farbe, b: Farbe): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

/**
 * Wählt Farben und ordnet jedem Pixel eine zu.
 *
 * @param bild - das Bild in RGB
 * @param optionen - Farbzahl und Mindestfläche
 * @returns die Farben, die Zuordnung und ein Bericht
 */
export function quantisiere(bild: Bild, optionen: Farboptionen = {}): Quantisiert {
  const maxFarben = optionen.farben ?? 6
  const minFlaeche = optionen.minFlaeche ?? 64
  const pixel = bild.breite * bild.hoehe

  // 1. Grobe Körnung zählen (5 Bit je Kanal).
  const histogramm = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let p = 0; p < pixel; p += 1) {
    const r = bild.rgb[p * 3] ?? 0
    const g = bild.rgb[p * 3 + 1] ?? 0
    const b = bild.rgb[p * 3 + 2] ?? 0
    const schluessel = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const eintrag = histogramm.get(schluessel)
    if (eintrag === undefined) histogramm.set(schluessel, { n: 1, r, g, b })
    else {
      eintrag.n += 1
      eintrag.r += r
      eintrag.g += g
      eintrag.b += b
    }
  }

  // 2. Zentren: häufigste Töne zuerst, aber mit Mindestabstand.
  const kanditaten = [...histogramm.values()]
    .sort((a, b) => b.n - a.n)
    .map((e): Farbe => [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)])
  const zentren: Farbe[] = []
  for (const farbe of kanditaten) {
    if (zentren.length >= maxFarben) break
    // **Der Mindestabstand ist der Unterschied zwischen „flach" und „geraten".** 40 im
    // RGB-Abstand trennt Orange von Hellorange, aber nicht Orange von Gelb.
    if (zentren.every((z) => abstand2(z, farbe) > 40 * 40)) zentren.push(farbe)
  }
  if (zentren.length === 0) zentren.push([0, 0, 0])

  // 3. k-Means: zuordnen, Mittelwerte neu bilden, vier Runden.
  let labels = new Uint8Array(pixel)
  for (let runde = 0; runde < 4; runde += 1) {
    for (let p = 0; p < pixel; p += 1) {
      const farbe: Farbe = [bild.rgb[p * 3] ?? 0, bild.rgb[p * 3 + 1] ?? 0, bild.rgb[p * 3 + 2] ?? 0]
      let bester = 0
      let besterAbstand = Number.POSITIVE_INFINITY
      for (let k = 0; k < zentren.length; k += 1) {
        const d = abstand2(farbe, zentren[k] ?? [0, 0, 0])
        if (d < besterAbstand) {
          besterAbstand = d
          bester = k
        }
      }
      labels[p] = bester
    }
    if (runde === 3) break
    const summen = zentren.map(() => ({ r: 0, g: 0, b: 0, n: 0 }))
    for (let p = 0; p < pixel; p += 1) {
      const summe = summen[labels[p] ?? 0]
      if (summe === undefined) continue
      summe.r += bild.rgb[p * 3] ?? 0
      summe.g += bild.rgb[p * 3 + 1] ?? 0
      summe.b += bild.rgb[p * 3 + 2] ?? 0
      summe.n += 1
    }
    for (let k = 0; k < zentren.length; k += 1) {
      const summe = summen[k]
      if (summe === undefined || summe.n === 0) continue
      zentren[k] = [
        Math.round(summe.r / summe.n),
        Math.round(summe.g / summe.n),
        Math.round(summe.b / summe.n),
      ]
    }
  }

  // 4. Kleine Flächen schlucken — zwei Durchgänge, weil ein Saum nach dem ersten noch Reste hat.
  const breite = bild.breite
  const hoehe = bild.hoehe
  let geschluckt = 0
  for (let durchgang = 0; durchgang < 2; durchgang += 1) {
    const besucht = new Uint8Array(pixel)
    const neu = new Uint8Array(labels)
    for (let start = 0; start < pixel; start += 1) {
      if (besucht[start] === 1) continue
      const marke = labels[start] ?? 0
      const stapel = [start]
      besucht[start] = 1
      const flaeche: number[] = [start]
      while (stapel.length > 0) {
        const p = stapel.pop() ?? 0
        const x = p % breite
        const y = (p - x) / breite
        // Nur die vier Nachbarn: eine Diagonale ist keine gemeinsame Kante.
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= breite || ny >= hoehe) continue
          const q = ny * breite + nx
          if (besucht[q] === 1 || labels[q] !== marke) continue
          besucht[q] = 1
          stapel.push(q)
          flaeche.push(q)
        }
      }
      if (flaeche.length >= minFlaeche) continue
      // Die häufigste Nachbarfarbe gewinnt — nicht „die erste".
      const zaehler = new Map<number, number>()
      for (const p of flaeche) {
        const x = p % breite
        const y = (p - x) / breite
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= breite || ny >= hoehe) continue
          const nachbar = labels[ny * breite + nx] ?? 0
          if (nachbar === marke) continue
          zaehler.set(nachbar, (zaehler.get(nachbar) ?? 0) + 1)
        }
      }
      let beste = marke
      let besteZahl = -1
      for (const [farbe, zahl] of zaehler) {
        if (zahl > besteZahl) {
          besteZahl = zahl
          beste = farbe
        }
      }
      for (const p of flaeche) neu[p] = beste
      geschluckt += 1
    }
    labels = neu
  }

  // 5. Nach Fläche ordnen — und **leere Farben wegwerfen**.
  //
  // Eine Farbe, deren Pixel alle geschluckt wurden, ist keine Farbe mehr: sie stünde sonst als
  // leerer Eintrag in der Palette, und der Vektorisierer legte dafür einen Pfad ohne Fläche an.
  // Genau das ist beim ersten Lauf passiert (vier Farben für drei Flächen).
  const flaechen = zentren.map(() => 0)
  for (let p = 0; p < pixel; p += 1) flaechen[labels[p] ?? 0] = (flaechen[labels[p] ?? 0] ?? 0) + 1
  const reihenfolge = zentren
    .map((_, k) => k)
    .filter((k) => (flaechen[k] ?? 0) > 0)
    .sort((a, b) => (flaechen[b] ?? 0) - (flaechen[a] ?? 0))
  const umsetzung = new Map<number, number>()
  reihenfolge.forEach((alt, neu) => umsetzung.set(alt, neu))
  const farben = reihenfolge.map((alt) => zentren[alt] ?? ([0, 0, 0] as Farbe))
  const umbenannt = new Uint8Array(pixel)
  for (let p = 0; p < pixel; p += 1) umbenannt[p] = umsetzung.get(labels[p] ?? 0) ?? 0

  return {
    farben,
    labels: umbenannt,
    bericht: {
      gefunden: farben.length,
      kleineFlaechen: geschluckt,
      flaechen: reihenfolge.map((alt) => flaechen[alt] ?? 0),
    },
  }
}

/**
 * Eine Farbe als `#rrggbb`.
 *
 * @param farbe - die Farbe
 * @returns die Textform
 */
export function alsHex(farbe: Farbe): string {
  const teil = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${teil(farbe[0])}${teil(farbe[1])}${teil(farbe[2])}`
}
