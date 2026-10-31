/**
 * PNG lesen und schreiben — gerade genug für den Vektorisierer.
 *
 * ## Warum ein eigener Leser
 *
 * Auf diesem Rechner gibt es **keinen** Bilddecoder als Abhängigkeit (kein `sharp`, kein `canvas`)
 * und **keinen** Vektorisierer (`magick`, `potrace`, `vtracer`, `inkscape` fehlen — geprüft am
 * 19.10.2026). Für einen Vektorisierer braucht man aber nur **ein** Format: PNG, 8 Bit, ohne
 * Interlace. Genau das ist es, was Bildmodelle hier liefern (`Farbtyp 2`, gemessen am Avatar).
 *
 * ## Was unterstützt wird — und was nicht
 *
 * | Fall | Unterstützt |
 * |---|---|
 * | Farbtyp 2 (RGB, 8 Bit) | **ja** |
 * | Farbtyp 6 (RGBA, 8 Bit) | **ja** — durch Weiß ersetzt |
 * | Farbtyp 3 (Palette, 8 Bit) | **ja** |
 * | 16 Bit, Interlace, Graustufen | **nein** — mit klarer Meldung |
 *
 * **Kein stilles Raten.** Ein 16-Bit-Bild als 8-Bit zu lesen ergäbe ein Bild mit Streifen; ein
 * interlaced Bild ergäbe Rauschen. Beides wird abgelehnt, nicht „irgendwie" gelesen.
 *
 * @module @prometheus-harness/vectorize/png
 */

import { deflateSync, inflateSync } from 'node:zlib'

/** Ein gelesenes Bild: Breite, Höhe und **RGB**-Bytes (drei je Pixel). */
export interface Bild {
  readonly breite: number
  readonly hoehe: number
  readonly rgb: Uint8Array
}

/** Die Signatur jeder PNG-Datei. */
const SIGNATUR = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

/**
 * Liest die vier Byte eines `uint32` in **großer** Ordnung (PNG schreibt so).
 *
 * @param bytes - die Bytes
 * @param ab - der Anfang
 * @returns der Wert
 */
function u32(bytes: Uint8Array, ab: number): number {
  return (
    ((bytes[ab] ?? 0) << 24) |
    ((bytes[ab + 1] ?? 0) << 16) |
    ((bytes[ab + 2] ?? 0) << 8) |
    (bytes[ab + 3] ?? 0)
  ) >>> 0
}

/**
 * Entpackt ein PNG.
 *
 * @param datei - die Bytes der Datei
 * @returns das Bild in RGB
 * @throws Error wenn das Format nicht unterstützt wird
 */
export function liesPng(datei: Uint8Array): Bild {
  for (let i = 0; i < SIGNATUR.length; i += 1) {
    if (datei[i] !== SIGNATUR[i]) throw new Error('Das ist keine PNG-Datei (Signatur stimmt nicht).')
  }

  let breite = 0
  let hoehe = 0
  let bitTiefe = 0
  let farbtyp = 0
  let interlace = 0
  let palette: Uint8Array | undefined
  let alphaTabelle: Uint8Array | undefined
  const idat: Uint8Array[] = []

  let stelle = 8
  while (stelle + 8 <= datei.length) {
    const laenge = u32(datei, stelle)
    const typ = String.fromCharCode(
      datei[stelle + 4] ?? 0,
      datei[stelle + 5] ?? 0,
      datei[stelle + 6] ?? 0,
      datei[stelle + 7] ?? 0,
    )
    const anfang = stelle + 8
    const ende = anfang + laenge
    if (ende > datei.length) throw new Error(`PNG ist abgeschnitten (Chunk ${typ}).`)
    const daten = datei.subarray(anfang, ende)

    if (typ === 'IHDR') {
      breite = u32(daten, 0)
      hoehe = u32(daten, 4)
      bitTiefe = daten[8] ?? 0
      farbtyp = daten[9] ?? 0
      interlace = daten[12] ?? 0
    } else if (typ === 'PLTE') {
      palette = daten
    } else if (typ === 'tRNS') {
      alphaTabelle = daten
    } else if (typ === 'IDAT') {
      idat.push(daten)
    } else if (typ === 'IEND') {
      break
    }
    stelle = ende + 4 // vier Byte CRC
  }

  if (breite <= 0 || hoehe <= 0) throw new Error('PNG ohne lesbare Größe (IHDR fehlt).')
  if (bitTiefe !== 8) throw new Error(`PNG mit ${String(bitTiefe)} Bit je Kanal wird nicht gelesen — nur 8 Bit.`)
  if (interlace !== 0) throw new Error('Interlaced PNG wird nicht gelesen. Bitte ohne Interlace speichern.')
  if (farbtyp !== 2 && farbtyp !== 6 && farbtyp !== 3) {
    throw new Error(`PNG-Farbtyp ${String(farbtyp)} wird nicht gelesen — nur 2 (RGB), 6 (RGBA) und 3 (Palette).`)
  }
  if (idat.length === 0) throw new Error('PNG ohne Bilddaten (IDAT fehlt).')

  const kanaele = farbtyp === 2 ? 3 : farbtyp === 6 ? 4 : 1
  const roh = new Uint8Array(inflateSync(Buffer.concat(idat.map((d) => Buffer.from(d)))))
  const zeilenLaenge = breite * kanaele
  const erwartet = hoehe * (zeilenLaenge + 1)
  if (roh.length < erwartet) {
    throw new Error(`PNG-Daten sind zu kurz (${String(roh.length)} statt ${String(erwartet)} Bytes).`)
  }

  // Entfiltern — je Zeile ein Filterbyte, danach die Bytes der Zeile.
  const bild = new Uint8Array(hoehe * zeilenLaenge)
  for (let y = 0; y < hoehe; y += 1) {
    const filter = roh[y * (zeilenLaenge + 1)] ?? 0
    const quelle = y * (zeilenLaenge + 1) + 1
    const ziel = y * zeilenLaenge
    for (let i = 0; i < zeilenLaenge; i += 1) {
      const rohWert = roh[quelle + i] ?? 0
      const links = i >= kanaele ? (bild[ziel + i - kanaele] ?? 0) : 0
      const oben = y > 0 ? (bild[ziel - zeilenLaenge + i] ?? 0) : 0
      const obenLinks = y > 0 && i >= kanaele ? (bild[ziel - zeilenLaenge + i - kanaele] ?? 0) : 0
      let wert: number
      switch (filter) {
        case 0:
          wert = rohWert
          break
        case 1:
          wert = rohWert + links
          break
        case 2:
          wert = rohWert + oben
          break
        case 3:
          wert = rohWert + ((links + oben) >> 1)
          break
        case 4: {
          // Paeth: die Nachbarrichtung mit der kleinsten Abweichung.
          const p = links + oben - obenLinks
          const pa = Math.abs(p - links)
          const pb = Math.abs(p - oben)
          const pc = Math.abs(p - obenLinks)
          wert = rohWert + (pa <= pb && pa <= pc ? links : pb <= pc ? oben : obenLinks)
          break
        }
        default:
          throw new Error(`Unbekannter PNG-Zeilenfilter ${String(filter)}.`)
      }
      bild[ziel + i] = wert & 0xff
    }
  }

  // Auf RGB bringen — Alpha wird auf Weiß gelegt (das Modell liefert keinen sinnvollen Hintergrund).
  const rgb = new Uint8Array(breite * hoehe * 3)
  for (let p = 0; p < breite * hoehe; p += 1) {
    let r: number
    let g: number
    let b: number
    let a = 255
    if (farbtyp === 3) {
      const index = bild[p] ?? 0
      r = palette?.[index * 3] ?? 0
      g = palette?.[index * 3 + 1] ?? 0
      b = palette?.[index * 3 + 2] ?? 0
      a = alphaTabelle?.[index] ?? 255
    } else {
      r = bild[p * kanaele] ?? 0
      g = bild[p * kanaele + 1] ?? 0
      b = bild[p * kanaele + 2] ?? 0
      if (farbtyp === 6) a = bild[p * kanaele + 3] ?? 255
    }
    if (a < 255) {
      const anteil = a / 255
      r = Math.round(r * anteil + 255 * (1 - anteil))
      g = Math.round(g * anteil + 255 * (1 - anteil))
      b = Math.round(b * anteil + 255 * (1 - anteil))
    }
    rgb[p * 3] = r
    rgb[p * 3 + 1] = g
    rgb[p * 3 + 2] = b
  }

  return { breite, hoehe, rgb }
}

/**
 * Schreibt ein RGB-Bild als PNG (Filter 0, keine Palette).
 *
 * **Wofür das hier steht:** der Vektorisierer prüft sich selbst, indem er seine Flächen
 * **zurückrastert**. Ohne einen Schreiber könnte man das Ergebnis nicht ansehen — und ein SVG,
 * das niemand gesehen hat, ist eine Behauptung.
 *
 * @param breite - die Breite
 * @param hoehe - die Höhe
 * @param rgb - die Bytes
 * @returns die PNG-Datei
 */
export function schreibePng(breite: number, hoehe: number, rgb: Uint8Array): Uint8Array {
  const zeilenLaenge = breite * 3
  const roh = Buffer.alloc(hoehe * (zeilenLaenge + 1))
  for (let y = 0; y < hoehe; y += 1) {
    roh[y * (zeilenLaenge + 1)] = 0
    Buffer.from(rgb.buffer, rgb.byteOffset + y * zeilenLaenge, zeilenLaenge).copy(
      roh,
      y * (zeilenLaenge + 1) + 1,
    )
  }
  const gepackt = deflateSync(roh, { level: 9 })

  /** Ein Chunk: Länge, Typ, Daten, CRC32. */
  const chunk = (typ: string, daten: Uint8Array): Buffer => {
    const kopf = Buffer.alloc(8)
    kopf.writeUInt32BE(daten.length, 0)
    kopf.write(typ, 4, 'ascii')
    const crcDaten = Buffer.concat([Buffer.from(typ, 'ascii'), Buffer.from(daten)])
    const fuss = Buffer.alloc(4)
    fuss.writeUInt32BE(crc32(crcDaten), 0)
    return Buffer.concat([kopf, Buffer.from(daten), fuss])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(breite, 0)
  ihdr.writeUInt32BE(hoehe, 4)
  ihdr[8] = 8 // Bittiefe
  ihdr[9] = 2 // RGB
  const signatur = Buffer.from([...SIGNATUR])
  return new Uint8Array(
    Buffer.concat([signatur, chunk('IHDR', ihdr), chunk('IDAT', gepackt), chunk('IEND', new Uint8Array(0))]),
  )
}

/** Die CRC32-Tabelle — einmal gebaut, dann nur noch nachgeschlagen. */
let crcTabelle: Uint32Array | undefined

/**
 * CRC32 über Bytes — wie PNG es im Chunk-Fuß verlangt.
 *
 * @param daten - die Bytes
 * @returns die Prüfsumme
 */
export function crc32(daten: Uint8Array): number {
  if (crcTabelle === undefined) {
    const tabelle = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      tabelle[n] = c >>> 0
    }
    crcTabelle = tabelle
  }
  let c = 0xffffffff
  for (const byte of daten) c = (crcTabelle[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
