/**
 * Die Gewichte — geprüft in einem **Wegwerf-Verzeichnis**, ohne Netz.
 *
 * ## Warum hier ein fremder Prüfsummen-Vektor steht
 *
 * Die Prüfsumme mit `node:crypto` zu rechnen und das Ergebnis mit `node:crypto` zu vergleichen wäre
 * **kein Beweis**: dieselbe Funktion prüft sich selbst. Deshalb steht unten der **veröffentlichte**
 * SHA-256-Wert von `abc` — er stammt nicht aus diesem Code, sondern aus der Welt.
 *
 * ## Der wichtigste Fall
 *
 * Eine Datei mit der **richtigen Länge** und dem **falschen Inhalt**. Genau so sieht ein
 * Herunterladen aus, der an einer anderen Stelle abbricht oder vertauscht wird — und genau deshalb
 * reicht die Größe nicht.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  fehlendeAngaben,
  holeUndLegeAb,
  pruefeDatei,
  pruefsumme,
  speicherOrt,
  type Gewichte,
} from '../src/index.ts'

/** Die Wegwerf-Verzeichnisse — nach **jedem** Test entfernt. */
const offen: string[] = []

afterEach(() => {
  for (const d of offen.splice(0)) rmSync(d, { recursive: true, force: true })
})

/**
 * Ein frisches Wegwerf-Verzeichnis.
 *
 * @returns der Pfad
 */
function wegwerf(): string {
  const d = mkdtempSync(join(tmpdir(), 'pmh-lokal-'))
  offen.push(d)
  return d
}

/**
 * Die Prüfsumme eines Textes — **nur für den Bauplan der Prüfung**.
 *
 * @param text - der Text
 * @returns die Prüfsumme
 */
function summe(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * Ein vollständiger Bauplan für einen Text.
 *
 * @param text - der Inhalt, der erwartet wird
 * @param name - der Modellname
 * @returns der Bauplan
 */
function bauplan(text: string, name = 'Pruefmodell'): Gewichte {
  return {
    name,
    quelle: 'https://example.invalid/modell.bin',
    revision: '2026-10-15',
    groesse: Buffer.byteLength(text),
    sha256: summe(text),
  }
}

// ---------------------------------------------------------------------------
// 1. Die Prüfsumme selbst — gegen einen Wert aus der Welt
// ---------------------------------------------------------------------------

describe('Die Prüfsumme', () => {
  test('der veröffentlichte SHA-256 von „abc" stimmt', async () => {
    const d = wegwerf()
    const pfad = join(d, 'abc.txt')
    writeFileSync(pfad, 'abc', 'utf8')
    const gemessen = await pruefsumme(pfad)
    // **Ein Wert von außen**, nicht aus diesem Code. Er prüft die Rechnung, nicht sich selbst.
    expect(gemessen.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(gemessen.groesse).toBe(3)
  })

  test('die Größe wird mitgezählt, auch bei mehreren Stromstücken', async () => {
    const d = wegwerf()
    const pfad = join(d, 'gross.bin')
    // Größer als das übliche Stück eines Stroms, damit wirklich mehrere Stücke ankommen.
    writeFileSync(pfad, Buffer.alloc(300_000, 7))
    const gemessen = await pruefsumme(pfad)
    expect(gemessen.groesse).toBe(300_000)
  })
})

// ---------------------------------------------------------------------------
// 2. Der Bauplan
// ---------------------------------------------------------------------------

describe('Der Bauplan', () => {
  test('vollständig heißt: nichts fehlt', () => {
    expect(fehlendeAngaben(bauplan('hallo'))).toEqual([])
  })

  test('jede fehlende Angabe wird einzeln benannt', () => {
    expect(fehlendeAngaben({})).toEqual(['name', 'quelle', 'revision', 'groesse', 'sha256'])
    expect(fehlendeAngaben({ name: 'x' })).toEqual(['quelle', 'revision', 'groesse', 'sha256'])
  })

  test('eine Prüfsumme in GROSSBUCHSTABEN gilt nicht — die Form ist Teil des Werts', () => {
    // Sonst gälte ein Wert als vollständig, der nie mit einem Ergebnis übereinstimmen kann.
    const g = bauplan('hallo')
    expect(fehlendeAngaben({ ...g, sha256: g.sha256.toUpperCase() })).toEqual(['sha256'])
  })

  test('eine zu kurze Prüfsumme gilt nicht', () => {
    expect(fehlendeAngaben({ ...bauplan('hallo'), sha256: 'abc123' })).toEqual(['sha256'])
  })

  test('eine Größe von 0 oder eine krumme Zahl gilt nicht', () => {
    const g = bauplan('hallo')
    expect(fehlendeAngaben({ ...g, groesse: 0 })).toEqual(['groesse'])
    expect(fehlendeAngaben({ ...g, groesse: 12.5 })).toEqual(['groesse'])
    expect(fehlendeAngaben({ ...g, groesse: -1 })).toEqual(['groesse'])
  })

  test('leere Texte gelten nicht als Angabe', () => {
    const g = bauplan('hallo')
    expect(fehlendeAngaben({ ...g, name: '   ' })).toEqual(['name'])
    expect(fehlendeAngaben({ ...g, quelle: '' })).toEqual(['quelle'])
    expect(fehlendeAngaben({ ...g, revision: ' ' })).toEqual(['revision'])
  })
})

// ---------------------------------------------------------------------------
// 3. Die Datei prüfen
// ---------------------------------------------------------------------------

describe('Eine Datei prüfen', () => {
  test('richtig: heil', async () => {
    const d = wegwerf()
    const pfad = join(d, 'gut.bin')
    writeFileSync(pfad, 'hallo welt', 'utf8')
    expect(await pruefeDatei(pfad, bauplan('hallo welt'))).toEqual({
      heil: true,
      groesse: 10,
      sha256: summe('hallo welt'),
    })
  })

  test('fehlende Datei: „fehlt"', async () => {
    const d = wegwerf()
    const befund = await pruefeDatei(join(d, 'gibtsnicht.bin'), bauplan('hallo'))
    expect(befund.heil).toBe(false)
    expect(befund.heil === false ? befund.grund : '').toBe('fehlt')
  })

  test('falsche Größe: so sieht ein abgebrochener Herunterladen aus', async () => {
    const d = wegwerf()
    const pfad = join(d, 'kurz.bin')
    writeFileSync(pfad, 'hall', 'utf8')
    const befund = await pruefeDatei(pfad, bauplan('hallo welt'))
    expect(befund.heil).toBe(false)
    expect(befund.heil === false ? befund.grund : '').toBe('falsche-groesse')
    expect(befund.heil === false ? befund.wegen : '').toContain('abgebrochener Herunterladen')
  })

  test('DER WICHTIGSTE FALL: richtige Länge, falscher Inhalt', async () => {
    const d = wegwerf()
    const pfad = join(d, 'vertauscht.bin')
    // Gleich lang wie erwartet — 'aaaa' gegen 'aaab'.
    writeFileSync(pfad, 'aaab', 'utf8')
    const befund = await pruefeDatei(pfad, bauplan('aaaa'))
    expect(befund.heil).toBe(false)
    expect(befund.heil === false ? befund.grund : '').toBe('falsche-pruefsumme')
    // **Warum die Größe nicht reicht.** Beide Dateien sind vier Byte lang.
    expect(befund.heil === false ? befund.wegen : '').toContain('INHALT')
  })

  test('ein unvollständiger Bauplan prüft NICHTS — und sagt das', async () => {
    const d = wegwerf()
    const pfad = join(d, 'da.bin')
    writeFileSync(pfad, 'irgendwas', 'utf8')
    const befund = await pruefeDatei(pfad, { name: 'x', quelle: 'y', revision: 'z', groesse: 9 } as Gewichte)
    expect(befund.heil).toBe(false)
    expect(befund.heil === false ? befund.grund : '').toBe('keine-pruefsumme')
    expect(befund.heil === false ? befund.wegen : '').toContain('gilt NICHT als heil')
  })

  test('eine VOLLSTÄNDIG aussehende Datei ohne bekannte Prüfsumme gilt NICHT als heil', async () => {
    // Der gefährlichste Zustand: die Datei ist da, die Länge stimmt — und niemand kann sagen, ob
    // sie die richtige ist. „Sieht vollständig aus" ist kein Befund.
    const d = wegwerf()
    const pfad = join(d, 'unbekannt.bin')
    writeFileSync(pfad, 'beliebig', 'utf8')
    const befund = await pruefeDatei(pfad, { name: 'x', quelle: 'y', revision: 'z', groesse: 8 } as Gewichte)
    expect(befund.heil).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. Holen und ablegen
// ---------------------------------------------------------------------------

describe('Holen und ablegen', () => {
  test('der Speicherort liegt unter dem Harness-Home und nennt Name und Revision', () => {
    const ort = speicherOrt(join('C:', 'home'), bauplan('x', 'Tev1-4B'))
    expect(ort).toContain('home')
    expect(ort).toContain('Tev1-4B')
    expect(ort).toContain('2026-10-15')
    expect(ort.endsWith('gewichte.bin')).toBe(true)
  })

  test('ein richtiger Abruf legt die Datei ab — und läßt KEINE Teildatei liegen', async () => {
    const d = wegwerf()
    const ziel = join(d, 'tief', 'drin', 'gewichte.bin')
    const befund = await holeUndLegeAb(bauplan('hallo welt'), {
      ziel,
      abruf: async () => new Response('hallo welt', { status: 200 }),
    })
    expect(befund.heil).toBe(true)
    expect(existsSync(ziel)).toBe(true)
    // Nur die Zieldatei — keine `.teil`-Datei, die beim nächsten Lauf wie ein Modell aussähe.
    expect(readdirSync(join(d, 'tief', 'drin'))).toEqual(['gewichte.bin'])
  })

  test('ein FALSCHER Abruf legt NICHTS ab', async () => {
    const d = wegwerf()
    const ziel = join(d, 'gewichte.bin')
    const befund = await holeUndLegeAb(bauplan('hallo welt'), {
      ziel,
      abruf: async () => new Response('aaab', { status: 200 }),
    })
    expect(befund.heil).toBe(false)
    // **Geprüft wird VOR dem Umbenennen.** Sonst stünde die falsche Datei schon an ihrem Platz.
    expect(existsSync(ziel)).toBe(false)
    expect(readdirSync(d)).toEqual([])
  })

  test('ein 404 legt nichts ab', async () => {
    const d = wegwerf()
    const ziel = join(d, 'gewichte.bin')
    const befund = await holeUndLegeAb(bauplan('x'), {
      ziel,
      abruf: async () => new Response('nicht da', { status: 404 }),
    })
    expect(befund.heil).toBe(false)
    expect(existsSync(ziel)).toBe(false)
    expect(readdirSync(d)).toEqual([])
  })

  test('ein Netzfehler legt nichts ab', async () => {
    const d = wegwerf()
    const ziel = join(d, 'gewichte.bin')
    const befund = await holeUndLegeAb(bauplan('x'), {
      ziel,
      abruf: async () => {
        throw new Error('kein Netz')
      },
    })
    expect(befund.heil).toBe(false)
    expect(existsSync(ziel)).toBe(false)
    expect(readdirSync(d)).toEqual([])
  })

  test('ein unvollständiger Bauplan wird NICHT geholt — kein Aufruf nach draußen', async () => {
    const d = wegwerf()
    let gerufen = 0
    const befund = await holeUndLegeAb(
      { name: 'x', quelle: 'y', revision: 'z', groesse: 5 } as Gewichte,
      {
        ziel: join(d, 'gewichte.bin'),
        abruf: async () => {
          gerufen += 1
          return new Response('x', { status: 200 })
        },
      },
    )
    expect(befund.heil).toBe(false)
    expect(befund.heil === false ? befund.grund : '').toBe('keine-pruefsumme')
    // **Erst prüfen, dann holen.** Gigabyte zu laden, um danach festzustellen, daß nichts zu
    // prüfen war, wäre die teuerste Art, einen fehlenden Wert zu bemerken.
    expect(gerufen).toBe(0)
    expect(existsSync(d)).toBe(true)
    expect(readdirSync(d)).toEqual([])
  })
})
