/**
 * Prüft das Packen eines Umschlags in **einen** Blob.
 *
 * **Die wichtigste Prüfung ist die dritte:** ein *echter* Umschlag (aus `verpacke`) muß nach
 * Packen und Entpacken noch **geöffnet** werden können. Alles andere wäre Formatkosmetik — hier
 * hängt daran, ob ein Geheimnis nach dem Weg durch die Datenbank noch lesbar ist.
 */
import { describe, expect, test } from 'bun:test'
import {
  entpacke,
  entpackeUmschlag,
  packeUmschlag,
  UMSCHLAG_FASSUNG,
  verpacke,
  type Hauptschluessel,
  type Umschlag,
} from '../src/index.ts'

/** Ein Prüfschlüssel — 32 Byte, Fassung 1. Kein Betriebsschlüssel. */
const HAUPT: Hauptschluessel = { schluessel: new Uint8Array(32).fill(3), version: 1, herkunft: 'pruefung' }

/** Ein Umschlag mit ungleichen Teilen, damit Vertauschungen auffallen. */
function beispiel(): Umschlag {
  return {
    valueCipher: new Uint8Array([1, 2, 3, 4, 5]),
    wrappedKey: new Uint8Array([9, 8, 7]),
    masterKeyVersion: 4_294_967_295,
    keyHint: 'abc·ü',
  }
}

describe('Umschlag packen', () => {
  test('die Rundreise gibt jeden Teil unverändert zurück', () => {
    const vorher = beispiel()
    const nachher = entpackeUmschlag(packeUmschlag(vorher))
    expect(nachher.masterKeyVersion).toBe(vorher.masterKeyVersion)
    expect(nachher.keyHint).toBe(vorher.keyHint)
    expect([...nachher.valueCipher]).toEqual([...vorher.valueCipher])
    expect([...nachher.wrappedKey]).toEqual([...vorher.wrappedKey])
  })

  test('die Teile werden NICHT vertauscht — der Blob trägt ihre Reihenfolge', () => {
    // valueCipher und wrappedKey unterscheiden sich in Länge und Inhalt; eine Verwechslung fiele
    // beim Öffnen als Krypto-Fehler auf, wäre aber schwer zu finden. Deshalb hier ausdrücklich.
    const gepackt = entpackeUmschlag(packeUmschlag(beispiel()))
    expect(gepackt.valueCipher.length).toBe(5)
    expect(gepackt.wrappedKey.length).toBe(3)
  })

  test('ein ECHTER Umschlag überlebt das Packen und läßt sich noch öffnen', () => {
    const klartext = new TextEncoder().encode('Der Phönix steigt aus der Asche.')
    const umschlag = verpacke(klartext, HAUPT)
    const wieder = entpackeUmschlag(packeUmschlag(umschlag))
    const entschluesselt = entpacke(wieder, HAUPT)
    expect(new TextDecoder().decode(entschluesselt)).toBe('Der Phönix steigt aus der Asche.')
  })

  test('eine unbekannte Fassung wird abgewiesen statt geraten', () => {
    const blob = packeUmschlag(beispiel())
    expect(blob[0]).toBe(UMSCHLAG_FASSUNG)
    blob[0] = 99
    expect(() => entpackeUmschlag(blob)).toThrow(/Unbekannte Fassung/u)
  })

  test('jede Kürzung ist ein Fehler — auch die letzte um ein Byte', () => {
    const blob = packeUmschlag(beispiel())
    for (let laenge = 0; laenge < blob.length; laenge += 1) {
      expect(() => entpackeUmschlag(blob.subarray(0, laenge))).toThrow()
    }
    // Und die volle Länge geht.
    expect(() => entpackeUmschlag(blob)).not.toThrow()
  })

  test('ein Teil über 65 535 Byte wird abgewiesen', () => {
    expect(() =>
      packeUmschlag({ ...beispiel(), valueCipher: new Uint8Array(0x10000) }),
    ).toThrow(/65535|65 535/u)
  })
})
