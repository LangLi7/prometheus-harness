/**
 * Der Helfer: lädt die **echte** sharp-Fassung (also libvips mit GLib 2.90.0)
 * und führt je Zeile eine Kette aus. Bricht libvips hier ab, endet nur dieser
 * Prozeß — der Wirt wartet auf eine Antwort und bekommt eine Ablehnung.
 *
 * Protokoll (eine Zeile JSON je Richtung):
 *   hinein:  { id, eingabe, optionen, kette, abschluss, abschlussOptionen }
 *   hinaus:  { id, ok: true, daten?, info?, metadaten? } | { id, ok: false, error }
 *
 * `absturz: true` beendet den Helfer absichtlich (Prüfstelle, kein Betriebsweg).
 */
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

const echteFassung = process.env.PMH_SHARP_REAL
if (echteFassung === undefined || echteFassung === '') {
  process.stderr.write('sharp-safe: PMH_SHARP_REAL fehlt\n')
  process.exit(2)
}

const geladen = await import(pathToFileURL(echteFassung).href)
const sharp = geladen.default ?? geladen

function alsBild(eingabe) {
  if (eingabe === undefined) throw new Error('sharp-safe: Eingabe fehlt')
  if (eingabe.art === 'pfad') return eingabe.wert
  if (eingabe.art === 'base64') return Buffer.from(eingabe.wert, 'base64')
  throw new Error(`sharp-safe: unbekannte Eingabeart ${String(eingabe.art)}`)
}

const zeilen = createInterface({ input: process.stdin, crlfDelay: Infinity })

for await (const zeile of zeilen) {
  if (zeile.trim() === '') continue
  let auftrag
  try {
    auftrag = JSON.parse(zeile)
  } catch {
    continue
  }

  if (auftrag.absturz === true) {
    // Die Prüfstelle: ein harter Prozeßende wie bei einem g_error.
    process.exit(9)
  }

  try {
    let bild = sharp(alsBild(auftrag.eingabe), auftrag.optionen ?? {})
    for (const [name, argumente] of auftrag.kette ?? []) {
      if (typeof bild[name] !== 'function') throw new Error(`sharp-safe: sharp kennt ${name} nicht`)
      bild = bild[name](...argumente)
    }
    const antwort = { id: auftrag.id, ok: true }
    if (auftrag.abschluss === 'metadata') {
      antwort.metadaten = await bild.metadata()
    } else if (auftrag.abschluss === 'toBuffer') {
      const ergebnis = await bild.toBuffer({ resolveWithObject: true })
      antwort.daten = ergebnis.data.toString('base64')
      antwort.info = ergebnis.info
    } else if (auftrag.abschluss === 'toFile') {
      antwort.info = await bild.toFile(auftrag.abschlussOptionen.ziel, auftrag.abschlussOptionen.optionen)
    } else {
      throw new Error(`sharp-safe: unbekannter Abschluß ${String(auftrag.abschluss)}`)
    }
    process.stdout.write(`${JSON.stringify(antwort)}\n`)
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : String(fehler)
    process.stdout.write(`${JSON.stringify({ id: auftrag.id, ok: false, error: text })}\n`)
  }
}
