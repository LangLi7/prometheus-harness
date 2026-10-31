/**
 * Der Vektorisierer — geprüft an Bildern, deren Antwort man **vorher** kennt.
 *
 * Ein Test mit einem echten Modellbild wäre schön, aber er könnte nicht sagen, *warum* etwas
 * danebengeht. Hier stehen Formen, deren Fläche und Umriß man ausrechnen kann: ein Quadrat, ein
 * Ring mit Loch, ein Streifen. Was daran scheitert, ist ein Fehler im Code und nicht im Bild.
 *
 * @module @prometheus-harness/vectorize/tests/vectorize
 */

import { describe, expect, test } from 'bun:test'

import { liesPng, schreibePng, crc32 } from '../src/png.ts'
import { quantisiere } from '../src/farben.ts'
import { schleifenFuer, vereinfache, pfadAus, shoelace, type Punkt } from '../src/kanten.ts'
import { rasterisiere, vektorisiere, type Vektoroptionen } from '../src/index.ts'
import type { Bild } from '../src/png.ts'

/** Ein leeres Bild in einer Farbe. */
function leinwand(breite: number, hoehe: number, farbe: readonly [number, number, number]): Bild {
  const rgb = new Uint8Array(breite * hoehe * 3)
  for (let p = 0; p < breite * hoehe; p += 1) {
    rgb[p * 3] = farbe[0]
    rgb[p * 3 + 1] = farbe[1]
    rgb[p * 3 + 2] = farbe[2]
  }
  return { breite, hoehe, rgb }
}

/** Malt ein Rechteck (Ecken inklusive) in ein Bild. */
function rechteck(
  bild: Bild,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  farbe: readonly [number, number, number],
): void {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const p = y * bild.breite + x
      bild.rgb[p * 3] = farbe[0]
      bild.rgb[p * 3 + 1] = farbe[1]
      bild.rgb[p * 3 + 2] = farbe[2]
    }
  }
}

const WEISS = [255, 255, 255] as const
const SCHWARZ = [0, 0, 0] as const

describe('PNG lesen und schreiben', () => {
  test('hin und zurück — dieselben Bytes', () => {
    const bild = leinwand(7, 5, [10, 20, 30])
    const datei = schreibePng(bild.breite, bild.hoehe, bild.rgb)
    const gelesen = liesPng(datei)
    expect(gelesen.breite).toBe(7)
    expect(gelesen.hoehe).toBe(5)
    expect([...gelesen.rgb]).toEqual([...bild.rgb])
  })

  test('die Signatur wird geprüft — ein JPEG ist kein PNG', () => {
    const keinPng = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0])
    expect(() => liesPng(keinPng)).toThrow('keine PNG-Datei')
  })

  test('16 Bit wird ABGELEHNT statt halb gelesen', () => {
    const bild = leinwand(4, 4, WEISS)
    const datei = schreibePng(4, 4, bild.rgb)
    // IHDR beginnt bei 8 (Signatur) + 4 (Länge) + 4 (Typ) = 16; Bittiefe ist das neunte Byte.
    const kopie = Uint8Array.from(datei)
    kopie[16 + 8] = 16
    expect(() => liesPng(kopie)).toThrow('16')
  })

  test('Interlace wird ABGELEHNT statt als Rauschen gelesen', () => {
    const bild = leinwand(4, 4, WEISS)
    const datei = schreibePng(4, 4, bild.rgb)
    const kopie = Uint8Array.from(datei)
    kopie[16 + 12] = 1
    expect(() => liesPng(kopie)).toThrow('Interlaced')
  })

  test('die CRC32 stimmt mit dem veröffentlichten Wert für „abc"', () => {
    // Bekannter Wert: CRC-32 von "abc" ist 0x352441C2.
    expect(crc32(new TextEncoder().encode('abc'))).toBe(0x352441c2)
  })
})

describe('Farben finden', () => {
  test('drei Farben werden als drei gefunden — auch mit Antialiasing-Saum', () => {
    const bild = leinwand(40, 40, WEISS)
    rechteck(bild, 5, 5, 20, 20, SCHWARZ)
    rechteck(bild, 22, 22, 35, 35, [200, 100, 50])
    // Ein Saum, wie ihn eine Kante hinterläßt: hellgrau, einen Pixel breit.
    rechteck(bild, 20, 5, 21, 20, [230, 230, 230])
    const q = quantisiere(bild, { farben: 6, minFlaeche: 64 })
    expect(q.farben.length).toBe(3)
    expect(q.bericht.kleineFlaechen).toBeGreaterThan(0)
  })

  test('ein Saum unter der Mindestfläche verschwindet — sonst bliebe ein Ring stehen', () => {
    const bild = leinwand(30, 30, WEISS)
    rechteck(bild, 5, 5, 24, 24, SCHWARZ)
    rechteck(bild, 5, 5, 24, 5, [128, 128, 128]) // Saum, 20 Pixel
    const q = quantisiere(bild, { farben: 4, minFlaeche: 64 })
    const grau = q.farben.findIndex((f) => f[0] === 128 && f[1] === 128 && f[2] === 128)
    expect(grau).toBe(-1)
  })

  test('ein einzelner Pixel ist keine Farbe', () => {
    const bild = leinwand(20, 20, WEISS)
    rechteck(bild, 3, 3, 3, 3, [0, 255, 0])
    const q = quantisiere(bild, { farben: 4, minFlaeche: 64 })
    expect(q.farben.length).toBe(1)
  })
})

describe('Kanten und Schleifen', () => {
  test('ein Quadrat ergibt EINE Schleife mit vier Ecken und der richtigen Fläche', () => {
    // 20×20 Pixel Schwarz auf Weiß.
    const labels = new Uint8Array(60 * 60)
    for (let y = 10; y < 30; y += 1) for (let x = 10; x < 30; x += 1) labels[y * 60 + x] = 1

    const schleifen = schleifenFuer(labels, 60, 60, 1, 1)
    expect(schleifen).toHaveLength(1)
    const vereinfacht = vereinfache(schleifen[0]?.punkte ?? [], 0.5)
    expect(vereinfacht).toHaveLength(4)
    expect(Math.abs(shoelace(vereinfacht))).toBe(400)
  })

  test('ein Ring ergibt ZWEI Schleifen — außen und das Loch', () => {
    const labels = new Uint8Array(60 * 60)
    for (let y = 10; y < 40; y += 1) {
      for (let x = 10; x < 40; x += 1) {
        const imLoch = x >= 20 && x < 30 && y >= 20 && y < 30
        if (!imLoch) labels[y * 60 + x] = 1
      }
    }
    const schleifen = schleifenFuer(labels, 60, 60, 1, 1)
    expect(schleifen).toHaveLength(2)
    const flaechen = schleifen.map((s) => Math.abs(shoelace(s.punkte))).sort((a, b) => b - a)
    expect(flaechen[0]).toBe(900) // 30×30 außen
    expect(flaechen[1]).toBe(100) // 10×10 Loch
  })

  test('RDP wirft Zwischenpunkte weg, die auf einer Geraden liegen', () => {
    const gerade: Punkt[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 3],
      [0, 3],
    ]
    const vereinfacht = vereinfache(gerade, 0.5)
    expect(vereinfacht).toHaveLength(4)
  })

  test('der Pfad beginnt mit M und schließt mit Z', () => {
    const schleifen = [
      { punkte: [[0, 0], [10, 0], [10, 10]] as Punkt[], flaeche: 50 },
    ]
    const pfad = pfadAus(schleifen)
    expect(pfad.startsWith('M ')).toBe(true)
    expect(pfad.endsWith('Z')).toBe(true)
    expect(pfad).toContain('L 10 0')
  })
})

describe('Die ganze Kette', () => {
  const optionen: Vektoroptionen = { farben: 4, minFlaeche: 32, toleranz: 0.5 }

  test('ein Quadrat wird zum SVG, und das Zurückrechnen trifft es GENAU', () => {
    const bild = leinwand(60, 60, WEISS)
    rechteck(bild, 15, 15, 44, 44, SCHWARZ)
    const ergebnis = vektorisiere(bild, optionen)
    expect(ergebnis.svg).toContain('<svg')
    expect(ergebnis.svg).toContain('fill-rule="evenodd"')
    // **Die Zahl, die zählt:** kein Pixel weicht ab. Ein SVG, das nicht zurückgerechnet wurde,
    // wäre eine Behauptung — diese Zeile macht daraus eine Messung.
    expect(ergebnis.bericht.abweichung).toBe(0)
    expect(ergebnis.bericht.farben.length).toBe(2)
  })

  test('ein Ring bleibt ein Ring — das Loch überlebt die Rückrechnung', () => {
    const bild = leinwand(60, 60, WEISS)
    rechteck(bild, 10, 10, 49, 49, SCHWARZ)
    rechteck(bild, 20, 20, 39, 39, WEISS)
    const ergebnis = vektorisiere(bild, optionen)
    expect(ergebnis.bericht.abweichung).toBe(0)
    // Die schwarze Fläche hat zwei Schleifen: außen und das Loch.
    const weiss = ergebnis.bericht.farben.indexOf('#ffffff')
    const schwarz = ergebnis.bericht.farben.indexOf('#000000')
    expect(weiss).toBeGreaterThanOrEqual(0)
    expect(schwarz).toBeGreaterThanOrEqual(0)
    expect(ergebnis.bericht.schleifen[schwarz]).toBe(2)
  })

  test('mehrere Formen derselben Farbe ergeben mehrere Schleifen', () => {
    const bild = leinwand(80, 80, WEISS)
    rechteck(bild, 5, 5, 14, 14, SCHWARZ)
    rechteck(bild, 30, 30, 39, 39, SCHWARZ)
    rechteck(bild, 55, 55, 64, 64, SCHWARZ)
    const ergebnis = vektorisiere(bild, optionen)
    const schwarz = ergebnis.bericht.farben.indexOf('#000000')
    expect(ergebnis.bericht.schleifen[schwarz]).toBe(3)
    expect(ergebnis.bericht.abweichung).toBe(0)
  })

  test('die Vereinfachung verkleinert den Pfad, ohne die Fläche zu verlieren', () => {
    const bild = leinwand(100, 60, WEISS)
    rechteck(bild, 20, 10, 79, 49, [0, 0, 255])
    const ergebnis = vektorisiere(bild, { ...optionen, toleranz: 2 })
    const blau = ergebnis.bericht.farben.indexOf('#0000ff')
    expect(ergebnis.bericht.punkteNachher[blau]).toBeLessThanOrEqual(ergebnis.bericht.punkteVorher[blau] ?? 0)
    expect(ergebnis.bericht.abweichung).toBe(0)
  })

  test('das Raster ist even-odd: zwei Schleifen heben sich im Loch auf', () => {
    // Ein Quadrat mit einem zweiten Quadrat darin — als zwei Schleifen derselben Farbe.
    const schleifen = [
      { punkte: [[0, 0], [10, 0], [10, 10], [0, 10]] as Punkt[], flaeche: 100 },
      { punkte: [[3, 3], [7, 3], [7, 7], [3, 7]] as Punkt[], flaeche: 16 },
    ]
    const ziel = new Uint8Array(10 * 10)
    rasterisiere(schleifen, 10, 10, ziel, 1)
    expect(ziel[0 * 10 + 0]).toBe(1) // außen gefüllt
    expect(ziel[5 * 10 + 5]).toBe(0) // im Loch leer — das ist even-odd
  })
})
