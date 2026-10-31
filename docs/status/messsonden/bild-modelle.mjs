#!/usr/bin/env bun
/**
 * Welche Modelle bei OpenRouter **Bilder ausgeben** — und was sie kosten.
 *
 * ## Warum diese Liste nötig ist
 *
 * Die Sonde `bild-form.mjs` lief am 19.10.2026 gegen `google/gemini-nano-banana-2.1` und bekam
 * **429**: *„You exceeded your current quota"* von Google AI Studio, und beim Chat-Weg
 * *„temporarily rate-limited upstream"*. Das ist **kein** Formfehler — die Anfrage wurde
 * angenommen und erst beim Anbieter abgewiesen. Über die Feldnamen ist damit weiterhin nichts
 * gesagt.
 *
 * Diese Datei beantwortet die billigere Frage zuerst: **welches andere Modell kann Bilder**, und
 * was kostet es? `GET /models` ist öffentlich und kostenlos.
 *
 * @module docs/status/messsonden/bild-modelle
 */

const BASIS = 'https://openrouter.ai/api/v1'

const antwort = await fetch(`${BASIS}/models`, { signal: AbortSignal.timeout(60_000) })
if (!antwort.ok) {
  process.stdout.write(`GET /models: HTTP ${String(antwort.status)}\n`)
  process.exit(1)
}
const koerper = await antwort.json()
const modelle = Array.isArray(koerper.data) ? koerper.data : []

/**
 * Ob ein Modell Bilder **ausgibt**.
 *
 * @param {Record<string, unknown>} modell - der Eintrag aus der Liste
 * @returns {boolean} ob `image` unter den Ausgabemodalitäten steht
 */
function gibtBilder(modell) {
  const architektur = modell.architecture
  if (architektur === null || typeof architektur !== 'object') return false
  const ausgabe = architektur.output_modalities
  return Array.isArray(ausgabe) && ausgabe.includes('image')
}

const bilder = modelle.filter(gibtBilder)
process.stdout.write(`${String(bilder.length)} von ${String(modelle.length)} Modellen geben Bilder aus:\n\n`)

for (const modell of bilder) {
  const preis = modell.pricing ?? {}
  const bild = preis.image ?? '—'
  const hinein = preis.prompt ?? '—'
  const heraus = preis.completion ?? '—'
  process.stdout.write(`${String(modell.id)}\n  Bild: ${String(bild)} · hinein: ${String(hinein)} · heraus: ${String(heraus)}\n`)
}

// Und die Gegenprobe: was sagt die Liste über nano-banana?
const gesucht = modelle.filter((m) => String(m.id).includes('nano-banana') || String(m.id).includes('image'))
process.stdout.write(`\nEinträge mit "image" oder "nano-banana" im Namen: ${String(gesucht.length)}\n`)
for (const modell of gesucht.slice(0, 20)) {
  const architektur = modell.architecture ?? {}
  process.stdout.write(`  ${String(modell.id)} → Ausgabe: ${JSON.stringify(architektur.output_modalities ?? null)}\n`)
}
