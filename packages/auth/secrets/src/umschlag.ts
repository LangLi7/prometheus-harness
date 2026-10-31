/**
 * **Ein Umschlag in *einem* Blob** — für Spalten, die nur `bytea` kennen.
 *
 * ## Warum das nötig ist
 *
 * {@link verpacke} liefert **vier** Teile: `valueCipher`, `wrappedKey`, `masterKeyVersion`,
 * `keyHint`. `user_secrets` hat für jeden Teil eine eigene Spalte. `pmh.chunks.content_cipher` und
 * `pmh.documents.content_cipher` haben **eine**. Ohne den eingewickelten Datenschlüssel ist der
 * Text nicht zu öffnen — ein „nur der Chiffrat"-Blob wäre also ein Geheimnis, das niemand mehr
 * aufmachen kann.
 *
 * ## Das Format (ausgeschrieben, weil es das sein muß)
 *
 * ```
 * Byte 0        Fassung dieses Formats — derzeit 1
 * Byte 1..4     masterKeyVersion, u32 little-endian
 * Byte 5..6     Länge des keyHint, u16 little-endian
 * danach        keyHint (utf8)
 * danach        u16-Länge + valueCipher
 * danach        u16-Länge + wrappedKey
 * ```
 *
 * **Warum nicht JSON.** Der Inhalt ist binär: JSON machte aus 32 Byte Schlüssel 44 Zeichen Base64
 * und aus der Fassungsnummer eine Zeichenkette. `u16` als Länge reicht — ein Umschlag über 64 KiB
 * wäre kein Geheimnis, sondern ein Unfall, und der soll auffallen.
 *
 * **Warum eine eigene Fassungsnummer.** Ein späterer Zusatz (etwa ein weiterer Teil) darf alte
 * Blobs nicht falsch deuten: `entpackeUmschlag` wirft bei einer Fassung, die es nicht kennt, statt
 * zu raten.
 *
 * @module @prometheus-harness/secrets/umschlag
 */

import type { Umschlag } from './index.ts'

/** Die Fassung, die diese Datei schreibt. */
export const UMSCHLAG_FASSUNG = 1

/** Der kleinste mögliche Blob: Fassung + Fassungsnummer + Länge. */
const KOPF = 1 + 4 + 2

/**
 * Packt einen Umschlag in einen Blob.
 *
 * @param umschlag - was {@link verpacke} geliefert hat
 * @returns der Blob für eine `bytea`-Spalte
 * @throws Error wenn ein Teil länger als 65 535 Byte ist (dann ist etwas anderes kaputt)
 */
export function packeUmschlag(umschlag: Umschlag): Uint8Array {
  const hinweis = new TextEncoder().encode(umschlag.keyHint)
  const teile: readonly Uint8Array[] = [umschlag.valueCipher, umschlag.wrappedKey]
  for (const teil of [hinweis, ...teile]) {
    if (teil.length > 0xffff) {
      throw new Error(`Ein Teil des Umschlags ist ${String(teil.length)} Byte lang — das Format trägt 65 535.`)
    }
  }
  const groesse = KOPF + hinweis.length + teile.reduce((summe, t) => summe + 2 + t.length, 0)
  const raus = new Uint8Array(groesse)
  const sicht = new DataView(raus.buffer)
  let an = 0
  raus[an] = UMSCHLAG_FASSUNG
  an += 1
  sicht.setUint32(an, umschlag.masterKeyVersion, true)
  an += 4
  sicht.setUint16(an, hinweis.length, true)
  an += 2
  raus.set(hinweis, an)
  an += hinweis.length
  for (const teil of teile) {
    sicht.setUint16(an, teil.length, true)
    an += 2
    raus.set(teil, an)
    an += teil.length
  }
  return raus
}

/**
 * Öffnet einen Blob aus {@link packeUmschlag}.
 *
 * **Jede Kürzung ist ein Fehler, keine Vorgabe.** Ein abgeschnittener Blob lieferte sonst ein
 * halbes Geheimnis — und `entpacke` würde daran mit einer Krypto-Meldung scheitern, die auf den
 * falschen Verdacht führt.
 *
 * @param roh - der Blob aus der Spalte
 * @returns der Umschlag für {@link entpacke}
 * @throws Error bei unbekannter Fassung oder abgeschnittenen Längen
 */
export function entpackeUmschlag(roh: Uint8Array): Umschlag {
  if (roh.length < KOPF) {
    throw new Error(`Der Umschlag ist zu kurz (${String(roh.length)} Byte) — er trägt weder Fassung noch Längen.`)
  }
  const sicht = new DataView(roh.buffer, roh.byteOffset, roh.byteLength)
  const fassung = roh[0]
  if (fassung !== UMSCHLAG_FASSUNG) {
    throw new Error(`Unbekannte Fassung des Umschlags: ${String(fassung)} (bekannt: ${String(UMSCHLAG_FASSUNG)}).`)
  }
  const masterKeyVersion = sicht.getUint32(1, true)
  const hinweisLaenge = sicht.getUint16(5, true)
  let an = KOPF
  if (an + hinweisLaenge > roh.length) throw new Error('Der Umschlag ist abgeschnitten (keyHint).')
  const keyHint = new TextDecoder().decode(roh.subarray(an, an + hinweisLaenge))
  an += hinweisLaenge

  const lese = (was: string): Uint8Array => {
    if (an + 2 > roh.length) throw new Error(`Der Umschlag ist abgeschnitten (Länge von ${was}).`)
    const laenge = sicht.getUint16(an, true)
    an += 2
    if (an + laenge > roh.length) throw new Error(`Der Umschlag ist abgeschnitten (${was}).`)
    const teil = roh.subarray(an, an + laenge)
    an += laenge
    return teil
  }

  const valueCipher = lese('valueCipher')
  const wrappedKey = lese('wrappedKey')
  return { valueCipher, wrappedKey, masterKeyVersion, keyHint }
}
