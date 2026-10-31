/**
 * `@prometheus-harness/vectorize` — ein Bild zu SVG, **ohne** Fremdwerkzeug.
 *
 * ## Warum es dieses Paket gibt
 *
 * Der Betreiber wollte den Avatar „später als Vector SVG". Auf diesem Rechner gibt es dafür
 * **nichts**: `magick`, `potrace`, `vtracer`, `inkscape` fehlen (geprüft am 19.10.2026). Ein
 * Verweis auf ein Programm, das nicht da ist, wäre keine Vorbereitung.
 *
 * ## Die Kette
 *
 * ```
 * PNG lesen → Farben finden (k-Means, kleine Flächen schlucken)
 *           → Kanten bilden → Schleifen verketten → vereinfachen
 *           → SVG schreiben → ZURÜCKRASTERN und vergleichen
 * ```
 *
 * **Der letzte Schritt ist der, der zählt.** Ein SVG, das niemand zurückgerechnet hat, ist eine
 * Behauptung über Flächen. Der Vergleich sagt, wie viele Pixel anders liegen — und genau diese
 * Zahl steht im Bericht.
 *
 * ## Was dieses Paket NICHT ist
 *
 * Kein Ersatz für einen guten Vektorisierer. Es gibt **keine Kurven** (nur Polygonzüge), keine
 * Hierarchie (jede Fläche steht für sich), und es ist auf **flächige** Bilder ausgelegt — ein Foto
 * ergäbe Matsch. Für ein Zeichen mit vier Farben ist es genau richtig.
 *
 * @module @prometheus-harness/vectorize
 */

import { alsHex, quantisiere, type Farbe } from './farben.ts'
import { pfadAus, schleifenFuer, vereinfache, type Schleife } from './kanten.ts'
import { liesPng, type Bild } from './png.ts'

export { liesPng, schreibePng, crc32, type Bild } from './png.ts'
export { quantisiere, alsHex, type Farbe, type Quantisiert } from './farben.ts'
export { schleifenFuer, vereinfache, pfadAus, shoelace, type Punkt, type Schleife } from './kanten.ts'

/** Wie vektorisiert wird. */
export interface Vektoroptionen {
  /** Höchstens so viele Farben. Vorgabe: 6. */
  readonly farben?: number
  /** Flächen unter so vielen Pixeln werden geschluckt. Vorgabe: 64. */
  readonly minFlaeche?: number
  /** Vereinfachung in Pixeln. Vorgabe: 0,9. */
  readonly toleranz?: number
  /** Schleifen unter dieser Fläche werden verworfen. Vorgabe: 6. */
  readonly minSchleife?: number
  /**
   * Ob ein **Vorschaubild** aus den Schleifen zurückgerechnet wird.
   *
   * **Warum das eine Einstellung ist.** Die Rückrechnung ist die Gegenprobe und läuft immer. Ein
   * Bild daraus ist zusätzliche Arbeit (und Speicher) — wer nur das SVG will, braucht sie nicht.
   * Wer sehen will, was er bekommt, schon.
   */
  readonly vorschau?: boolean
  /**
   * Ob das SVG auf den **Inhalt** zugeschnitten wird.
   *
   * **Warum das für ein Logo zählt.** Ein Bild aus einem Modell hat 1024 × 1024 mit viel Rand; ein
   * Logo, das in einer Oberfläche steht, braucht keinen Rand, sondern einen `viewBox`, der den
   * Umriß umschließt. Ohne Zuschnitt skaliert das Zeichen je nach Einbettung auf Briefmarkengröße.
   *
   * Zugeschnitten wird auf alles **außer der größten Fläche** — das ist der Hintergrund, und der
   * soll den Rahmen nicht bestimmen.
   */
  readonly zuschneiden?: boolean
  /** Der Rand in Pixeln beim Zuschneiden. Vorgabe: 12. */
  readonly rand?: number
}

/** Was die Vektorisierung ergeben hat. */
export interface Ergebnis {
  /** Das SVG als Text. */
  readonly svg: string
  /** Was gerechnet wurde — und wie gut es paßt. */
  readonly bericht: {
    readonly breite: number
    readonly hoehe: number
    readonly farben: readonly string[]
    readonly schleifen: readonly number[]
    readonly punkteVorher: readonly number[]
    readonly punkteNachher: readonly number[]
    /** Anteil der Pixel, deren Farbe nach dem Zurückrechnen abweicht (0…1). */
    readonly abweichung: number
    readonly svgBytes: number
    /** Der `viewBox` des SVG — beim Zuschneiden kleiner als das Bild. */
    readonly rahmen: { readonly x: number; readonly y: number; readonly breite: number; readonly hoehe: number }
  }
  /**
   * Das zurückgerechnete Bild — **nur** mit `vorschau: true`.
   *
   * Es entsteht aus **denselben Schleifen**, die im SVG stehen. Was hier zu sehen ist, ist also
   * das, was der Pfad beschreibt — nicht die Vorlage.
   */
  readonly vorschau?: Bild
}

/** Eine Fläche mit ihren Schleifen. */
interface Flaeche {
  readonly farbe: Farbe
  readonly schleifen: readonly Schleife[]
  readonly flaeche: number
}

/**
 * Vektorisiert ein gelesenes Bild.
 *
 * @param bild - das Bild in RGB
 * @param optionen - Farben, Mindestflächen, Toleranz
 * @returns das SVG und der Bericht
 */
export function vektorisiere(bild: Bild, optionen: Vektoroptionen = {}): Ergebnis {
  const toleranz = optionen.toleranz ?? 0.9
  const minSchleife = optionen.minSchleife ?? 6
  const quant = quantisiere(bild, {
    ...(optionen.farben === undefined ? {} : { farben: optionen.farben }),
    ...(optionen.minFlaeche === undefined ? {} : { minFlaeche: optionen.minFlaeche }),
  })

  const flaechen: Flaeche[] = []
  const schleifenZahl: number[] = []
  const vorher: number[] = []
  const nachher: number[] = []

  for (let k = 0; k < quant.farben.length; k += 1) {
    const roh = schleifenFuer(quant.labels, bild.breite, bild.hoehe, k, minSchleife)
    const vereinfacht = roh.map((s) => ({
      punkte: vereinfache(s.punkte, toleranz),
      flaeche: s.flaeche,
    }))
    const behalten = vereinfacht.filter((s) => s.punkte.length >= 3)
    flaechen.push({
      farbe: quant.farben[k] ?? [0, 0, 0],
      schleifen: behalten,
      flaeche: Math.abs(roh.reduce((summe, s) => summe + s.flaeche, 0)),
    })
    schleifenZahl.push(behalten.length)
    vorher.push(roh.reduce((summe, s) => summe + s.punkte.length, 0))
    nachher.push(behalten.reduce((summe, s) => summe + s.punkte.length, 0))
  }

  // **Gezeichnet wird von groß nach klein.** Die größte Fläche ist der Hintergrund; sie liegt
  // hinten. Wer sie zuletzt zeichnet, deckt alles andere zu.
  const reihenfolge = flaechen.map((_, i) => i).sort((a, b) => (flaechen[b]?.flaeche ?? 0) - (flaechen[a]?.flaeche ?? 0))

  // **Der Zuschnitt.** Der Hintergrund (die größte Fläche) bestimmt den Rahmen nicht; sonst bliebe
  // ein Logo ein 1024er Bild mit leerem Rand.
  const rahmen = rahmenFuer(flaechen, reihenfolge, bild, optionen)

  const teile: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${zahl(rahmen.x)} ${zahl(rahmen.y)} ${zahl(rahmen.breite)} ${zahl(rahmen.hoehe)}">`,
  ]
  for (const i of reihenfolge) {
    const flaeche = flaechen[i]
    if (flaeche === undefined || flaeche.schleifen.length === 0) continue
    // **Beim Zuschnitt fällt der Rahmen weg — aber nicht die Löcher im Zeichen.**
    //
    // Der Hintergrund besteht oft aus mehreren Schleifen: dem Bildrand **und** weißen Flächen
    // *innerhalb* des Motivs (beim Logo: die innere Flamme). Den ganzen Hintergrund zu streichen
    // machte aus der inneren Flamme ein Loch — auf weißem Grund unsichtbar, auf dunklem ein Fehler.
    // Deshalb fliegt nur, was den Bildrand berührt; das ist der Rahmen.
    const schleifen =
      optionen.zuschneiden === true && i === reihenfolge[0]
        ? flaeche.schleifen.filter((s) => !beruehrtRand(s, bild.breite, bild.hoehe))
        : flaeche.schleifen
    if (schleifen.length === 0) continue
    teile.push(
      `  <path fill="${alsHex(flaeche.farbe)}" fill-rule="evenodd" d="${pfadAus(schleifen)}"/>`,
    )
  }
  teile.push('</svg>')
  const svg = `${teile.join('\n')}\n`

  // **Die Gegenprobe: zurückrechnen und vergleichen.** Ohne sie wäre „das SVG stimmt" geraten.
  const gerastert = new Uint8Array(bild.breite * bild.hoehe)
  for (const i of reihenfolge) {
    const flaeche = flaechen[i]
    if (flaeche === undefined) continue
    rasterisiere(flaeche.schleifen, bild.breite, bild.hoehe, gerastert, i + 1)
  }
  let falsch = 0
  for (let p = 0; p < gerastert.length; p += 1) {
    // 0 heißt „keine Fläche" — das darf nicht vorkommen, wird aber als Abweichung gezählt.
    if (gerastert[p] !== (quant.labels[p] ?? 0) + 1) falsch += 1
  }

  return {
    svg,
    bericht: {
      breite: bild.breite,
      hoehe: bild.hoehe,
      farben: quant.farben.map(alsHex),
      schleifen: schleifenZahl,
      punkteVorher: vorher,
      punkteNachher: nachher,
      abweichung: falsch / gerastert.length,
      svgBytes: Buffer.byteLength(svg, 'utf8'),
      rahmen,
    },
    ...(optionen.vorschau === true ? { vorschau: alsBild(gerastert, flaechen, bild.breite, bild.hoehe) } : {}),
  }
}

/**
 * Ob eine Schleife den **Bildrand** berührt.
 *
 * **Wofür das gebraucht wird:** beim Zuschneiden soll der Rahmen verschwinden, ein Loch im Motiv
 * aber bleiben. Der Unterschied ist meßbar: der Rahmen läuft am Bildrand entlang, ein Loch nicht.
 *
 * @param schleife - die Schleife
 * @param breite - die Bildbreite
 * @param hoehe - die Bildhöhe
 * @returns ob ein Punkt auf dem Rand liegt
 */
function beruehrtRand(schleife: Schleife, breite: number, hoehe: number): boolean {
  return schleife.punkte.some((p) => p[0] <= 0 || p[1] <= 0 || p[0] >= breite || p[1] >= hoehe)
}

/**
 * Rechnet den `viewBox` aus — ganzes Bild, oder auf den Inhalt zugeschnitten.
 *
 * **Was „Inhalt" heißt:** alles außer der größten Fläche. Das ist der Hintergrund. Ein Logo, dessen
 * Rahmen vom weißen Rand bestimmt wird, ist in jeder Einbettung zu klein.
 *
 * @param flaechen - die Flächen
 * @param reihenfolge - die Zeichenreihenfolge; `reihenfolge[0]` ist der Hintergrund
 * @param bild - das Bild (für die Grenzen)
 * @param optionen - Zuschnitt und Rand
 * @returns der Rahmen
 */
function rahmenFuer(
  flaechen: readonly Flaeche[],
  reihenfolge: readonly number[],
  bild: Bild,
  optionen: Vektoroptionen,
): { readonly x: number; readonly y: number; readonly breite: number; readonly hoehe: number } {
  const ganz = { x: 0, y: 0, breite: bild.breite, hoehe: bild.hoehe }
  if (optionen.zuschneiden !== true) return ganz

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const i of reihenfolge) {
    if (i === reihenfolge[0]) continue
    for (const schleife of flaechen[i]?.schleifen ?? []) {
      for (const p of schleife.punkte) {
        if (p[0] < minX) minX = p[0]
        if (p[1] < minY) minY = p[1]
        if (p[0] > maxX) maxX = p[0]
        if (p[1] > maxY) maxY = p[1]
      }
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return ganz

  const rand = Math.max(0, optionen.rand ?? 12)
  const x = Math.max(0, minX - rand)
  const y = Math.max(0, minY - rand)
  const x2 = Math.min(bild.breite, maxX + rand)
  const y2 = Math.min(bild.hoehe, maxY + rand)
  return { x, y, breite: x2 - x, hoehe: y2 - y }
}

/**
 * Eine Zahl für den `viewBox` — ohne überflüssige Nullen.
 *
 * @param wert - die Zahl
 * @returns die Textform
 */
function zahl(wert: number): string {
  return Number.isInteger(wert) ? String(wert) : wert.toFixed(1)
}

/**
 * Macht aus dem Raster ein Bild — jede Fläche in ihrer Farbe, alles andere weiß.
 *
 * @param gerastert - je Pixel `index + 1`, 0 heißt „keine Fläche"
 * @param flaechen - die Flächen in Zeichenreihenfolge
 * @param breite - die Breite
 * @param hoehe - die Höhe
 * @returns das Bild
 */
function alsBild(
  gerastert: Uint8Array,
  flaechen: readonly Flaeche[],
  breite: number,
  hoehe: number,
): Bild {
  const rgb = new Uint8Array(breite * hoehe * 3)
  for (let p = 0; p < breite * hoehe; p += 1) {
    const wert = gerastert[p] ?? 0
    const farbe = wert === 0 ? ([255, 255, 255] as Farbe) : (flaechen[wert - 1]?.farbe ?? [255, 255, 255])
    rgb[p * 3] = farbe[0]
    rgb[p * 3 + 1] = farbe[1]
    rgb[p * 3 + 2] = farbe[2]
  }
  return { breite, hoehe, rgb }
}

/**
 * Vektorisiert eine PNG-Datei.
 *
 * @param datei - die Bytes
 * @param optionen - wie oben
 * @returns das Ergebnis
 */
export function vektorisierePng(datei: Uint8Array, optionen: Vektoroptionen = {}): Ergebnis {
  return vektorisiere(liesPng(datei), optionen)
}

/**
 * Rechnet Schleifen zurück in ein Raster — **even-odd**, wie das SVG es füllt.
 *
 * Das ist die Gegenprobe zum SVG: derselbe Füllalgorithmus, den ein Browser benutzt, nur auf
 * unserem Raster. Weicht das Ergebnis ab, ist der Pfad falsch — und nicht die Anzeige.
 *
 * @param schleifen - die Schleifen
 * @param breite - die Breite
 * @param hoehe - die Höhe
 * @param ziel - wohin geschrieben wird (ein Byte je Pixel)
 * @param wert - der Wert, der gesetzt wird
 */
export function rasterisiere(
  schleifen: readonly Schleife[],
  breite: number,
  hoehe: number,
  ziel: Uint8Array,
  wert: number,
): void {
  for (let y = 0; y < hoehe; y += 1) {
    const mitte = y + 0.5
    const schnitte: number[] = []
    for (const schleife of schleifen) {
      const punkte = schleife.punkte
      for (let i = 0; i < punkte.length; i += 1) {
        const a = punkte[i] ?? [0, 0]
        const b = punkte[(i + 1) % punkte.length] ?? [0, 0]
        // Halboffene Regel: der obere Punkt zählt mit, der untere nicht — sonst zählt jede Ecke
        // doppelt, und genau dort entstehen die Löcher, die niemand erklären kann.
        if ((a[1] <= mitte && b[1] > mitte) || (b[1] <= mitte && a[1] > mitte)) {
          schnitte.push(a[0] + ((mitte - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
        }
      }
    }
    schnitte.sort((a, b) => a - b)
    for (let i = 0; i + 1 < schnitte.length; i += 2) {
      const von = Math.max(0, Math.ceil((schnitte[i] ?? 0) - 0.5))
      const bis = Math.min(breite - 1, Math.floor((schnitte[i + 1] ?? 0) - 0.5))
      for (let x = von; x <= bis; x += 1) ziel[y * breite + x] = wert
    }
  }
}
