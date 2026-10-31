#!/usr/bin/env bun
/**
 * Die Kette als Tabelle: welcher Weg je Bedarf zuerst versucht wird.
 *
 * ```powershell
 * bun run packages/web/search-route/src/cli.ts
 * bun run packages/web/search-route/src/cli.ts --jetzt=2026-11-05T12:00:00Z
 * bun run packages/web/search-route/src/cli.ts --ohne=searxng,firecrawl
 * bun run packages/web/search-route/src/cli.ts --cloud-genutzt=480
 * ```
 *
 * @module @prometheus-harness/search-route/cli
 */

import { kaskade, proBedarf, type Lage } from './kaskade.ts'
import { FIRECRAWL_FREI_SUCHEN, STICHTAG, type Zustand } from './routen.ts'

/** Liest `--name=wert` aus der Kommandozeile. */
function arg(name: string, fallback: string): string {
  const treffer = process.argv.slice(2).find((eintrag) => eintrag.startsWith(`--${name}=`))
  return treffer === undefined ? fallback : treffer.slice(name.length + 3)
}

/** Eine Zahl in USD, deutsch geschrieben. */
function usd(wert: number): string {
  if (Number.isNaN(wert)) return 'k. A.'
  return wert === 0 ? '0' : `${wert.toFixed(5).replace('.', ',')} USD`
}

/** Füllt auf eine Spaltenbreite auf. */
function pad(text: string, breite: number): string {
  return text.padEnd(breite, ' ')
}

const alsJson = process.argv.includes('--json')
const jetzt = new Date(arg('jetzt', new Date().toISOString()))
const ohne = new Set(arg('ohne', '').split(',').filter((eintrag) => eintrag !== ''))
const zustand: Zustand = { firecrawlCloudGenutzt: Number(arg('cloud-genutzt', '0')) }
const lage: Lage = {
  searxng: !ohne.has('searxng'),
  firecrawl: !ohne.has('firecrawl'),
  firecrawlCloud: !ohne.has('firecrawl-cloud'),
  deepseek: !ohne.has('deepseek'),
}

if (Number.isNaN(zustand.firecrawlCloudGenutzt) || zustand.firecrawlCloudGenutzt < 0) {
  console.error('--cloud-genutzt muss eine Zahl ab 0 sein')
  process.exit(2)
}

if (alsJson) {
  console.log(JSON.stringify({ jetzt: jetzt.toISOString(), lage, zustand, empfehlungen: proBedarf(lage, zustand, jetzt) }, null, 2))
  process.exit(0)
}

const tage = Math.ceil((STICHTAG.getTime() - jetzt.getTime()) / 86_400_000)
console.log(`Stichtag: ${STICHTAG.toISOString()}${jetzt < STICHTAG ? `  (noch ${String(tage)} Tage)` : '  (vorbei)'}`)
console.log(`Cloud-Vorrat: ${String(zustand.firecrawlCloudGenutzt)} von ${String(FIRECRAWL_FREI_SUCHEN)}`)

const kopf = ['Bedarf', 'Weg', 'USD/Suche', 'Begründung']
const rumpf = proBedarf(lage, zustand, jetzt).map((zeile) => [zeile.bedarf, zeile.weg ?? 'keiner', usd(zeile.kostenUsd), zeile.grund])
const breiten = kopf.map((zelle, index) => Math.max(zelle.length, ...rumpf.map((linie) => (linie[index] ?? '').length)))
const linie = (zellen: string[]): string => zellen.map((zelle, index) => pad(zelle, breiten[index] ?? 0)).join(' | ')

console.log('')
console.log(linie(kopf))
console.log(breiten.map((breite) => '-'.repeat(breite)).join('-+-'))
for (const zellen of rumpf) console.log(linie(zellen))

const links = kaskade('links', lage, zustand, jetzt)
console.log('')
console.log(`Kette für links: ${links.schritte.map((schritt) => schritt.weg).join(' -> ') || 'leer'}`)
console.log(`Erster bezahlter Schritt: ${links.bezahltAb === null ? 'keiner' : String(links.bezahltAb + 1)}`)
if (links.hinweis !== null) console.log(`Hinweis: ${links.hinweis}`)
