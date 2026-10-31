#!/usr/bin/env bun
/**
 * **Lebendnachweis für `pmh-ai-capabilities`** — lädt der Host das Plugin wirklich?
 *
 * ## Warum diese Sonde neben `plugin-inventur.mjs` steht
 *
 * Jene Sonde liest den Loader-Zustand. Diese hier stellt die **Frage des Betreibers**: antwortet
 * `GET /api/ai/capabilities`, und steht `bild` als bereit darin? Ein Eintrag im Loader ist die
 * halbe Antwort; ein **401 statt 404** auf der Adresse ist die andere Hälfte — 401 heißt „Route
 * ist registriert, nur die Anmeldung fehlt", 404 heißt „Route gibt es nicht".
 *
 * ## Warum das Kind seine Ausgabe in eine DATEI schreibt
 *
 * Der Sandkasten dieses Rechners läßt keine benannten Röhren zu: `spawn` mit `stdio: 'pipe'`
 * scheitert mit `EPERM`. Die vorhandene Inventur-Sonde benutzt Röhren und läuft deshalb **hier**
 * nicht. Diese Sonde gibt dem Kind zwei **Dateideskriptoren** — es schreibt in eine Protokolldatei,
 * die Sonde liest sie. Kein Rohr, kein Sonderrecht.
 *
 * ## Was sie NICHT tut
 *
 * Kein bezahlter Aufruf. Sie liest die Auskunft (`/api/ai/capabilities`) und die Inventur; beide
 * kosten nichts. `POST /api/ai/draw` wird **nicht** gerufen.
 *
 * @module docs/status/messsonden/plugin-lebend
 */

import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const WURZEL = join(HIER, '..', '..', '..')

/** Ein eigener Port, abseits von 3080 (Betreiber-GUI) und 3097 (Inventur-Sonde). */
const PORT = Number(process.argv[2] ?? 3098)

const START_GRENZE_MS = 120_000
const AUFRUF_GRENZE_MS = 20_000
const PROTOKOLL = join(WURZEL, '.pmh-build', 'plugin-lebend.log')

/**
 * Zieht Port und Token aus einer Host-Zeile.
 *
 * @param {string} zeile - eine Zeile des Protokolls
 * @returns {{port: number, token: string, url: string} | null} was darin steht
 */
function leseStartzeile(zeile) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(zeile)
  if (t === null) return null
  const port = Number(t[1])
  const token = t[2]
  if (!Number.isFinite(port) || token === undefined || token === '') return null
  return { port, token, url: `http://127.0.0.1:${String(port)}/?token=${token}` }
}

/** Ersetzt den Token in Text, der nach außen geht. */
function ohneToken(text, token) {
  return token === '' ? text : text.split(token).join('<token>')
}

/**
 * Wartet, bis die Startzeile in der Protokolldatei steht.
 *
 * **Warum eine Datei und kein Ereignis.** Siehe den Dateikopf: Röhren sind hier gesperrt. Ein
 * Dateipoll alle 250 ms ist billig und endet mit einer Frist — und die Frist ist der Unterschied
 * zwischen „langsam" und „hängt".
 *
 * @returns {Promise<{ok: true, port: number, token: string, url: string} | {ok: false, grund: string, protokoll: string}>}
 */
async function warteAufStart(grenzeMs) {
  const ende = Date.now() + grenzeMs
  while (Date.now() < ende) {
    let text = ''
    try {
      text = readFileSync(PROTOKOLL, 'utf8')
    } catch {
      // Noch keine Datei — das ist in den ersten Millisekunden normal.
    }
    for (const zeile of text.split('\n')) {
      const gelesen = leseStartzeile(zeile)
      if (gelesen !== null) return { ok: true, ...gelesen }
    }
    await new Promise((f) => setTimeout(f, 250))
  }
  let text = ''
  try {
    text = readFileSync(PROTOKOLL, 'utf8')
  } catch {
    text = '(keine Protokolldatei)'
  }
  return { ok: false, grund: `keine Startzeile binnen ${String(grenzeMs)} ms`, protokoll: text }
}

/**
 * Meldet sich über den Token-Link an.
 *
 * @param {string} url - die Startadresse mit Token
 * @returns {Promise<{ok: true, cookie: string, status: number} | {ok: false, status: number, grund: string}>}
 */
async function anmelden(url) {
  try {
    const antwort = await fetch(url, { redirect: 'manual' })
    const roh = antwort.headers.get('set-cookie')
    if (roh === null) return { ok: false, status: antwort.status, grund: 'kein set-cookie' }
    const cookie = roh.split(';')[0]
    if (cookie === undefined || !cookie.includes('=')) {
      return { ok: false, status: antwort.status, grund: 'set-cookie ohne Namen=Wert' }
    }
    return { ok: true, status: antwort.status, cookie }
  } catch (fehler) {
    return { ok: false, status: 0, grund: String(fehler) }
  }
}

/**
 * Ruft eine lesende Remote-Methode ab — mit dem Umschlag, den der Kern verlangt.
 *
 * @param {number} port - der Port
 * @param {string} cookie - das Anmelde-Keks
 * @returns {Promise<unknown>} der Wert aus `result.value`
 */
async function inventur(port, cookie) {
  const antwort = await fetch(`http://127.0.0.1:${String(port)}/api/pluginInventory/list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'lebend-1',
      method: 'pluginInventory/list',
      payload: { args: {} },
    }),
    signal: AbortSignal.timeout(AUFRUF_GRENZE_MS),
  })
  const text = await antwort.text()
  if (antwort.status !== 200) throw new Error(`Inventur: HTTP ${String(antwort.status)} ${text.slice(0, 200)}`)
  const umschlag = JSON.parse(text)
  const ergebnis = umschlag.result
  if (ergebnis?.ok !== true) throw new Error(`Inventur meldet Fehler: ${JSON.stringify(ergebnis?.error ?? {})}`)
  return ergebnis.value
}

async function haupt() {
  process.stdout.write('Lebendnachweis: lädt der Host pmh-ai-capabilities?\n\n')

  mkdirSync(dirname(PROTOKOLL), { recursive: true })
  writeFileSync(PROTOKOLL, '', 'utf8')
  const fd = openSync(PROTOKOLL, 'a')
  const kind = spawn(process.execPath, ['scripts/start.mjs', '--port', String(PORT), '--no-go'], {
    cwd: WURZEL,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
    env: { ...process.env, PMH_HOST_STDERR: '1' },
  })
  closeSync(fd)

  let token = ''
  let fehler = 0
  try {
    const start = await warteAufStart(START_GRENZE_MS)
    if (!start.ok) {
      process.stdout.write(`ABBRUCH: ${start.grund}\n--- Protokoll ---\n${start.protokoll.slice(-3000)}\n`)
      process.exitCode = 2
      return
    }
    token = start.token
    process.stdout.write(`Host gestartet auf Port ${String(start.port)} (Adresse mit Token, Token nicht ausgegeben)\n`)

    // 1. Die Adresse OHNE Keks: 401 heißt „registriert", 404 heißt „nicht da".
    const ohneKeks = await fetch(`http://127.0.0.1:${String(start.port)}/api/ai/capabilities`, {
      signal: AbortSignal.timeout(AUFRUF_GRENZE_MS),
    })
    process.stdout.write(`GET /api/ai/capabilities ohne Keks: HTTP ${String(ohneKeks.status)}\n`)
    if (ohneKeks.status !== 401) {
      process.stdout.write('  ERWARTET war 401 — 404 hieße: die Route ist nicht eingetragen.\n')
      fehler += 1
    }

    // 2. Anmelden und mit Keks lesen.
    const anmeldung = await anmelden(start.url)
    if (!anmeldung.ok) {
      process.stdout.write(`ABBRUCH: Anmeldung fehlgeschlagen (HTTP ${String(anmeldung.status)}): ${anmeldung.grund}\n`)
      process.exitCode = 2
      return
    }
    process.stdout.write(`Anmeldung: HTTP ${String(anmeldung.status)}, Keks gesetzt\n`)

    const antwort = await fetch(`http://127.0.0.1:${String(start.port)}/api/ai/capabilities`, {
      headers: { cookie: anmeldung.cookie },
      signal: AbortSignal.timeout(AUFRUF_GRENZE_MS),
    })
    const text = await antwort.text()
    process.stdout.write(`GET /api/ai/capabilities mit Keks: HTTP ${String(antwort.status)}\n`)
    if (antwort.status !== 200) {
      process.stdout.write(`  Körper: ${text.slice(0, 400)}\n`)
      fehler += 1
    } else {
      const auskunft = JSON.parse(text)
      process.stdout.write(`  Dienst:     ${String(auskunft.service)} ${String(auskunft.version)}\n`)
      process.stdout.write(`  Schlüssel:  ${auskunft.schluessel === true ? 'gesetzt' : 'NICHT gesetzt'}\n`)
      process.stdout.write(`  Eingetragen:${Array.isArray(auskunft.eingetragen) ? ` ${auskunft.eingetragen.join(', ')}` : ' —'}\n`)
      for (const zeile of Array.isArray(auskunft.faehigkeiten) ? auskunft.faehigkeiten : []) {
        const stand = zeile.bereit === true ? 'bereit' : `nicht bereit: ${String(zeile.grund ?? '')}`
        process.stdout.write(
          `  ${String(zeile.faehigkeit).padEnd(18)} ${String(zeile.modell ?? '—').padEnd(34)} ${stand}\n`,
        )
      }
      const bild = (auskunft.faehigkeiten ?? []).find((z) => z.faehigkeit === 'bild')
      if (bild === undefined || bild.bereit !== true) {
        process.stdout.write('  ERWARTET war: bild ist bereit.\n')
        fehler += 1
      }
    }

    // 3. Steht der Eintrag im Loader — und lebt er?
    const stand = await inventur(start.port, anmeldung.cookie)
    const eintraege = Array.isArray(stand.entries) ? stand.entries : []
    const unser = eintraege.filter((e) => String(e.moduleName ?? '').includes('ai-capabilities'))
    process.stdout.write(`\nLoader-Einträge gesamt: ${String(eintraege.length)}\n`)
    if (unser.length === 0) {
      process.stdout.write('  ERWARTET war: ein Eintrag für ai-capabilities.\n')
      fehler += 1
    }
    for (const e of unser) {
      process.stdout.write(
        `  ${String(e.moduleName)}  enabled=${String(e.enabled)}  phase=${String(e.fiberPhase)}` +
          `${e.meta?.error === undefined ? '' : `  FEHLER: ${String(e.meta.error).slice(0, 200)}`}\n`,
      )
      if (e.fiberPhase !== 'active') fehler += 1
    }

    process.stdout.write(`\n${fehler === 0 ? 'GRÜN' : `ROT (${String(fehler)} Abweichungen)`}\n`)
    process.exitCode = fehler === 0 ? 0 : 1
  } finally {
    kind.kill()
    await new Promise((f) => setTimeout(f, 500))
    process.stdout.write(`Protokoll: ${PROTOKOLL}\n`)
    if (token !== '') {
      // Nur der Vollständigkeit halber: der Token steht im Protokoll des Kindes. Er wird hier
      // nicht ausgegeben — `ohneToken` ist für Meldungen da, die ihn sonst mitschleppen würden.
      void ohneToken('', token)
    }
  }
}

if (import.meta.main === true || process.argv[1] === fileURLToPath(import.meta.url)) {
  await haupt()
}
