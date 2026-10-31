#!/usr/bin/env bun
/**
 * Die Sonde für den **Bild-Weg** bei OpenRouter.
 *
 * ## Warum es diese Datei gibt
 *
 * `docs/status/openrouter-schnittstelle.md` sagt seit dem 15.10.2026: der Pfad
 * `/images/generations` ist **bestätigt** (400 auf einen leeren Auftrag), die **Form** ist
 * ungemessen. Ein Anbieter, der `bild` nennt, ohne die Form zu kennen, würde in der Registratur
 * als „kann es" stehen — und der Aufrufer erführe erst beim Aufruf, daß es nicht stimmt. Deshalb
 * steht `bild` bis heute nicht in `FAEHIGKEITEN_OPENROUTER`.
 *
 * Diese Sonde schließt die Lücke: **ein** Aufruf mit einem echten Auftrag, und die Antwort sagt,
 * welches Feld den Text trägt und wo das Bild liegt (`b64_json` oder `url`).
 *
 * ## Was sie NICHT tut
 *
 * Sie schreibt keinen Schlüssel in eine Ausgabe. Der Schlüssel wird aus der Umgebung oder aus
 * `~/.dsh/.credentials.yaml` gelesen und in jeder Meldung durch `***` ersetzt.
 *
 * ## Kosten
 *
 * Ein Bild kostet Geld. Die Sonde ruft **eine** Form auf, solange sie nicht antwortet; die
 * Reihenfolge ist so gewählt, daß die wahrscheinlichste zuerst kommt.
 *
 * @module docs/status/messsonden/bild-form
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const BASIS = 'https://openrouter.ai/api/v1'
const MODELL = process.env.BILD_MODELL ?? 'google/gemini-nano-banana-2.1'

/** Der Auftrag für den Avatar — bewusst flach, damit später ein SVG daraus werden kann. */
const AUFTRAG =
  process.env.BILD_AUFTRAG ??
  'A flat vector avatar icon of a flame-headed humanoid, bold black outlines, solid burnt orange ' +
    'and deep blue fills, centered and filling the frame, plain white background, minimal geometric ' +
    'shapes, no gradients, no shadows, no text, sticker style, high contrast, suitable for tracing ' +
    'to SVG.'

/** Ersetzt den Schlüssel durch Sterne — auch in Fehlertexten, die ihn zurückwerfen. */
function entschaerfe(text, schluessel) {
  return schluessel === undefined || schluessel === '' ? text : text.split(schluessel).join('***')
}

/**
 * Liest den Schlüssel: erst die Umgebung, dann der Schlüsselspeicher des Harness.
 *
 * @returns {Promise<string>} der Schlüssel
 * @throws Error wenn keiner gefunden wurde
 */
async function ladeSchluessel() {
  const ausUmgebung = process.env.OPENROUTER_API_KEY
  if (typeof ausUmgebung === 'string' && ausUmgebung.trim() !== '') return ausUmgebung.trim()
  const pfad = join(homedir(), '.dsh', '.credentials.yaml')
  const text = await readFile(pfad, 'utf8')
  const treffer = /^\s*OPENROUTER_API_KEY:\s*(\S+)\s*$/mu.exec(text)
  if (treffer === null) throw new Error(`kein OPENROUTER_API_KEY in ${pfad}`)
  return treffer[1].replace(/^["']|["']$/gu, '')
}

/**
 * Prüft, ob eine Antwort ein Bild trägt — und wo.
 *
 * @param {unknown} koerper - die gelesene JSON-Antwort
 * @returns {{ art: 'b64', daten: string } | { art: 'url', url: string } | undefined} der Fund
 */
function findeBild(koerper) {
  if (koerper === null || typeof koerper !== 'object') return undefined
  const daten = koerper.data
  if (Array.isArray(daten) && daten.length > 0) {
    const erstes = daten[0]
    if (erstes !== null && typeof erstes === 'object') {
      if (typeof erstes.b64_json === 'string') return { art: 'b64', daten: erstes.b64_json }
      if (typeof erstes.url === 'string') return { art: 'url', url: erstes.url }
    }
  }
  // Der Chat-Weg mit `modalities` liefert Bilder als `choices[0].message.images[]`.
  const wahl = Array.isArray(koerper.choices) ? koerper.choices[0] : undefined
  const nachricht = wahl !== undefined && wahl !== null ? wahl.message : undefined
  if (nachricht !== null && typeof nachricht === 'object' && Array.isArray(nachricht.images)) {
    for (const bild of nachricht.images) {
      const url = bild?.image_url?.url ?? bild?.url
      if (typeof url === 'string' && url.startsWith('data:')) {
        return { art: 'b64', daten: url.slice(url.indexOf(',') + 1) }
      }
      if (typeof url === 'string') return { art: 'url', url }
    }
  }
  return undefined
}

/**
 * Erkennt den Behälter an den ersten Bytes — **nicht** an der Endung.
 *
 * ## Warum das nachgetragen wurde
 *
 * Die erste Fassung schrieb die Daten nach `avatar-….png` und **nannte sie damit PNG**, ohne die
 * Bytes zu lesen. Am 19.10.2026 war es zufällig ein PNG; die Endung war trotzdem eine Behauptung.
 * Ein Bild, das als `.png` gespeichert wird und ein JPEG ist, fällt erst beim Öffnen auf.
 *
 * @param {Buffer} bytes - die Bytes
 * @returns {string} die Endung ohne Punkt
 */
function behaelter(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif'
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp'
  return 'bin'
}

/**
 * Führt eine Form aus.
 *
 * @param {string} name - der Name der Form
 * @param {string} pfad - der Pfad unter der Basis
 * @param {Record<string, unknown>} koerper - der Auftrag
 * @param {string} schluessel - der Schlüssel
 * @returns {Promise<{ name: string, status: number, ok: boolean, hinweis: string }>} das Ergebnis
 */
async function forme(name, pfad, koerper, schluessel) {
  const antwort = await fetch(`${BASIS}${pfad}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${schluessel}`,
      'content-type': 'application/json',
      'http-referer': 'https://prometheus.local',
      'x-title': 'Prometheus Harness',
    },
    body: JSON.stringify(koerper),
    signal: AbortSignal.timeout(180_000),
  })
  const typ = antwort.headers.get('content-type') ?? ''
  const roh = await antwort.text()
  const text = entschaerfe(roh, schluessel)

  if (!antwort.ok) {
    process.stdout.write(`\n[${name}] HTTP ${String(antwort.status)} (${typ})\n${text.slice(0, 1200)}\n`)
    return { name, status: antwort.status, ok: false, hinweis: text.slice(0, 300) }
  }

  let koerperJson
  try {
    koerperJson = JSON.parse(text)
  } catch {
    process.stdout.write(`\n[${name}] HTTP ${String(antwort.status)} — keine JSON-Antwort (${typ})\n${text.slice(0, 400)}\n`)
    return { name, status: antwort.status, ok: false, hinweis: 'keine JSON-Antwort' }
  }

  const bild = findeBild(koerperJson)
  if (bild === undefined) {
    process.stdout.write(
      `\n[${name}] HTTP ${String(antwort.status)} — JSON, aber kein Bild gefunden.\n` +
        `Schlüssel der Antwort: ${Object.keys(koerperJson).join(', ')}\n` +
        `${JSON.stringify(koerperJson).slice(0, 800)}\n`,
    )
    return { name, status: antwort.status, ok: false, hinweis: 'kein Bild im JSON' }
  }

  let bytes
  if (bild.art === 'b64') {
    bytes = Buffer.from(bild.daten, 'base64')
  } else {
    const geladen = await fetch(bild.url, { signal: AbortSignal.timeout(120_000) })
    bytes = Buffer.from(await geladen.arrayBuffer())
  }

  const endung = behaelter(bytes)
  const ziel = join(import.meta.dir, '..', 'img', `avatar-${name}.${endung}`)
  await mkdir(dirname(ziel), { recursive: true })
  await writeFile(ziel, bytes)
  process.stdout.write(
    `\n[${name}] HTTP ${String(antwort.status)} — Bild gefunden (${bild.art}), ` +
      `${String(bytes.byteLength)} Bytes, Behälter ${endung.toUpperCase()} → ${ziel}\n`,
  )
  return { name, status: antwort.status, ok: true, hinweis: ziel }
}

/**
 * Die Formen, in der Reihenfolge, in der sie geprüft werden.
 *
 * **Warum die Reihenfolge so ist.** `data[0].b64_json` ist die OpenAI-Form und damit die
 * wahrscheinlichste; `url` ist dieselbe Form mit Verweis. Der Chat-Weg mit `modalities` ist die
 * letzte Möglichkeit — er ist der teuerste und der am wenigsten belegte.
 *
 * @returns {readonly { name: string, pfad: string, koerper: Record<string, unknown> }[]} die Formen
 */
function formen() {
  return [
    {
      name: 'images-b64',
      pfad: '/images/generations',
      koerper: { model: MODELL, prompt: AUFTRAG, n: 1, response_format: 'b64_json' },
    },
    {
      name: 'images-schlicht',
      pfad: '/images/generations',
      koerper: { model: MODELL, prompt: AUFTRAG, n: 1 },
    },
    {
      name: 'chat-modalities',
      pfad: '/chat/completions',
      koerper: {
        model: MODELL,
        messages: [{ role: 'user', content: AUFTRAG }],
        modalities: ['image', 'text'],
      },
    },
  ]
}

const schluessel = await ladeSchluessel()
process.stdout.write(`Modell: ${MODELL}\nSchlüssel: gefunden (${String(schluessel.length)} Zeichen)\n`)

const ergebnisse = []
for (const form of formen()) {
  const ergebnis = await forme(form.name, form.pfad, form.koerper, schluessel)
  ergebnisse.push(ergebnis)
  if (ergebnis.ok) break
}

process.stdout.write('\n--- Zusammenfassung ---\n')
for (const e of ergebnisse) {
  process.stdout.write(`${e.ok ? 'JA ' : 'NEIN'} ${e.name} (HTTP ${String(e.status)}): ${e.hinweis}\n`)
}
process.exit(ergebnisse.some((e) => e.ok) ? 0 : 1)
