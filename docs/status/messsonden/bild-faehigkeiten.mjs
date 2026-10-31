#!/usr/bin/env bun
/**
 * Was die Bild-Modelle **wirklich** können — und was ein Bild kostet.
 *
 * ## Warum diese Sonde
 *
 * Die Bild-API hat eine eigene Modellliste: `GET /api/v1/images/models`. Sie nennt je Modell die
 * **unterstützten Parameter** (`resolution`, `aspect_ratio`, `quality`, `n`, `seed`, …) und je
 * Endpunkt die **Preiszeilen pro Bild**. Genau das fehlte bisher: „Preis je Bild" stand als offener
 * Punkt in den Notizen, und die Parameter wurden geraten.
 *
 * ## Kosten
 *
 * Nichts. Ein `GET` auf eine öffentliche Liste — kein Bild, keine Rechnung.
 *
 * @module docs/status/messsonden/bild-faehigkeiten
 */

const BASIS = 'https://openrouter.ai/api/v1'

/** Die Modelle, die uns interessieren — die Kennungen aus den bisherigen Messungen. */
const INTERESSE = [
  'google/gemini-2.5-flash-image',
  'google/gemini-3.1-flash-image',
  'google/gemini-nano-banana-2.1',
  'google/gemini-3-pro-image',
  'openai/gpt-5-image-mini',
  'openai/gpt-5-image',
  'bytedance-seed/seedream-4.5',
]

/**
 * Liest eine Antwort und bricht mit dem Status ab, wenn sie nicht 200 ist.
 *
 * @param {string} pfad - der Pfad unter der Basis
 * @returns {Promise<unknown>} der JSON-Körper
 */
async function hole(pfad) {
  const antwort = await fetch(`${BASIS}${pfad}`, { signal: AbortSignal.timeout(60_000) })
  const text = await antwort.text()
  if (!antwort.ok) throw new Error(`${pfad}: HTTP ${String(antwort.status)} — ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

/** Macht aus einem Parameter-Deskriptor eine kurze Textform. */
function beschreibe(deskriptor) {
  if (deskriptor === null || typeof deskriptor !== 'object') return '?'
  if (deskriptor.type === 'enum') return (deskriptor.values ?? []).join('|')
  if (deskriptor.type === 'range') return `${String(deskriptor.min)}…${String(deskriptor.max)}`
  if (deskriptor.type === 'boolean') return 'ja'
  return String(deskriptor.type)
}

/** Preiszeilen eines Endpunkts als Text. */
function preiszeilen(endpunkt) {
  const zeilen = Array.isArray(endpunkt.pricing) ? endpunkt.pricing : []
  return zeilen
    .map((z) => `${String(z.billable)}: ${String(z.cost_usd)} $ / ${String(z.unit)}${z.variant === undefined ? '' : ` (${String(z.variant)})`}`)
    .join(' · ')
}

const liste = await hole('/images/models')
const modelle = Array.isArray(liste.data) ? liste.data : []
process.stdout.write(`Bild-Modelle: ${String(modelle.length)}\n\n`)

for (const modell of modelle) {
  if (!INTERESSE.includes(String(modell.id))) continue
  const params = modell.supported_parameters ?? {}
  const namen = Object.keys(params)
  process.stdout.write(`${String(modell.id)}\n`)
  process.stdout.write(`  Parameter: ${namen.length === 0 ? '(keine)' : namen.map((n) => `${n}=${beschreibe(params[n])}`).join(', ')}\n`)
  try {
    const endpunkt = await hole(`/images/models/${String(modell.id)}/endpoints`)
    for (const e of Array.isArray(endpunkt.endpoints) ? endpunkt.endpoints : []) {
      const eigen = Object.keys(e.supported_parameters ?? {})
      process.stdout.write(
        `  · ${String(e.provider_name)} (${String(e.provider_tag ?? e.provider_slug)})` +
          `${eigen.length === 0 ? '' : ` [${eigen.join(', ')}]`}\n` +
          `      ${preiszeilen(e) || 'keine Preiszeile'}\n`,
      )
    }
  } catch (fehler) {
    process.stdout.write(`  · Endpunkte nicht lesbar: ${String(fehler)}\n`)
  }
  process.stdout.write('\n')
}
