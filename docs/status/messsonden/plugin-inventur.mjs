/**
 * Meßsonde: **Plugin-Inventur** — welche Kernpakete in unserem Host **wirklich** laufen.
 *
 * ## Warum diese Sonde existiert
 *
 * Die Frage „welche der 257 installierten Kernpakete sind bei uns aktiv?" ließ sich
 * **nicht** aus dem Startprotokoll beantworten. Der Host schreibt beim Hochfahren
 * genau **eine** Zeile über seine Zusammensetzung:
 *
 * ```
 * [host] pmh: core running (profile "web", loader active)
 * ```
 *
 * Das ist eine **Behauptung**, keine Liste. „Installiert" ist nicht „geladen", und
 * „geladen" ist nicht „aktiv". Ich habe daraus zweimal zu viel geschlossen — erst
 * „die Inventur-API ist einer von sechs kaputten Codecs", dann „das Protokoll
 * meldet es nicht, also gibt es keinen Weg". Beides war **geraten**.
 *
 * ## Der Meßweg
 *
 * Der Kern hat einen **eigenen** Dienst dafür: `pluginInventory` aus
 * `@deepseek-ai/dsh-host-plugin-inventory`. Er projiziert den Cordis-Loader-Zustand
 * als Momentaufnahme: je Eintrag `entryId`, `moduleName`, `enabled`, `fiberPhase`
 * (`pending|loading|active|failed|unloading|null`) und die Anzeigetexte, dazu je
 * Agent-Preset die flache Zusammensetzung. Der Vertrag ist eindeutig:
 *
 * ```
 * id:          '@deepseek-ai/dsh-host-plugin-inventory#pluginInventory/list'
 * invocation:  { kind: 'direct' }
 * parameters:  []          <-- KEINE Parameter
 * result:      strict, PluginInventorySnapshot
 * ```
 *
 * **`parameters: []` ist der entscheidende Punkt.** Meine erste Sonde schickte den
 * `{request:{…}}`-Mantel von `session/create` — einer Methode *mit* Request-Parameter —
 * auch an diese parameterlose Methode und bekam einen Codec-Fehler. Der Fehler war
 * **meiner**, nicht der des Kerns. Deshalb steht die Parameterliste hier als
 * Voraussetzung im Quelltext und wird **geprüft**, bevor gesendet wird: findet die
 * Sonde die Datei nicht oder weicht `parameters` ab, bricht sie **ab**, statt zu senden.
 *
 * ## Was diese Sonde NICHT ist
 *
 * Sie startet einen Host auf einem eigenen Port, holt sich über den Token-Link ein
 * Cookie und ruft **eine** lesende Remote-Methode auf. Sie ändert nichts, sie lädt
 * nichts nach, sie schreibt nichts außer ihrer eigenen Belegdatei.
 *
 * Der Token wird **nie** ausgegeben — auch nicht im Fehlerfall.
 *
 * @module docs/status/messsonden/plugin-inventur
 */

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const WURZEL = join(HIER, '..', '..', '..')

/** Vorgabe-Port; bewußt abseits von 3080/3099, damit ein laufender Host nicht stört. */
const PORT = Number(process.argv[2] ?? 3097)

/** Zeitgrenzen — deutlich über der gemessenen Startzeit (1,4 s), damit „langsam" nicht „kaputt" heißt. */
const START_GRENZE_MS = 90_000
const AUFRUF_GRENZE_MS = 20_000

const VERTRAG = join(
  WURZEL,
  'node_modules',
  '@deepseek-ai',
  'dsh-host-plugin-inventory',
  'lib',
  'typert.remote-client.js',
)

/**
 * Prüft den Vertrag **vor** dem Senden: Die Methode muß parameterlos sein.
 *
 * Ohne diese Prüfung würde die Sonde bei einem Kern-Update, das einen Parameter
 * ergänzt, mit einem Codec-Fehler scheitern — und ich würde wieder „API kaputt"
 * melden statt „mein Aufruf ist veraltet". Die Prüfung macht aus einem stillen
 * Fehlschlag eine benannte Vorbedingung.
 *
 * @returns {{ok: true} | {ok: false, grund: string}}
 */
export function pruefeVertrag(pfad = VERTRAG) {
  let text
  try {
    text = readFileSync(pfad, 'utf8')
  } catch {
    return { ok: false, grund: `Vertragsdatei nicht lesbar: ${pfad}` }
  }
  if (!text.includes("namespace: 'pluginInventory'")) {
    return { ok: false, grund: 'Vertrag nennt den Namensraum pluginInventory nicht' }
  }
  // `parameters: [` … `]` ohne Inhalt = parameterlos. Ein Eintrag dazwischen = geändert.
  const treffer = /parameters:\s*\[([^\]]*)\]/u.exec(text)
  if (treffer === null) {
    return { ok: false, grund: 'Vertrag nennt kein parameters-Feld' }
  }
  const inhalt = (treffer[1] ?? '').trim()
  if (inhalt !== '') {
    return { ok: false, grund: `parameters ist nicht leer, sondern: ${inhalt.slice(0, 120)}` }
  }
  if (!text.includes("invocation: { kind: 'direct' }")) {
    return { ok: false, grund: 'invocation ist nicht mehr direct' }
  }
  return { ok: true }
}

/**
 * Zieht Port und Token aus einer Host-Zeile.
 *
 * Der Token ist ein Geheimnis: er wird hier **abgetrennt** und nur als eigene
 * Variable weitergegeben, nie protokolliert.
 *
 * @returns {{port: number, token: string, url: string} | null}
 */
export function leseStartzeile(zeile) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(zeile)
  if (t === null) return null
  const port = Number(t[1])
  const token = t[2]
  if (token === undefined || token === '') return null
  return { port, token, url: `http://127.0.0.1:${String(port)}/?token=${token}` }
}

/** Ersetzt den Token in beliebigem Text — für Fehlermeldungen, die nach außen gehen. */
export function ohneToken(text, token) {
  if (token === undefined || token === '') return text
  return text.split(token).join('<token>')
}

/**
 * Meldet sich an: `GET /?token=…` antwortet mit **303** und setzt das Auth-Cookie.
 *
 * Ohne Cookie antwortet `/api/*` mit **401** — die Sonde nennt in dem Fall den
 * Statuscode, statt „keine Antwort" zu behaupten.
 *
 * @returns {Promise<{ok: true, cookie: string, status: number} | {ok: false, grund: string, status: number}>}
 */
export async function anmelden(url) {
  let antwort
  try {
    antwort = await fetch(url, { redirect: 'manual' })
  } catch (fehler) {
    return { ok: false, status: 0, grund: `Verbindung fehlgeschlagen: ${String(fehler)}` }
  }
  const roh = antwort.headers.get('set-cookie')
  if (roh === null) {
    return { ok: false, status: antwort.status, grund: 'kein set-cookie in der Antwort' }
  }
  const cookie = roh.split(';')[0]
  if (cookie === undefined || !cookie.includes('=')) {
    return { ok: false, status: antwort.status, grund: 'set-cookie ohne Namen=Wert' }
  }
  return { ok: true, status: antwort.status, cookie }
}

/**
 * Ruft `pluginInventory/list` ab.
 *
 * Der Körper hat **zwei Hüllen**: außen den Umschlag `{type, rpcId, result}`, innen
 * die Nutzlast unter `result.value`. Meine erste Sonde suchte die Nutzlast unter
 * `value` und sah deshalb „leer", obwohl die Antwort vollständig war.
 */
export async function holeInventur(port, cookie, { rpcId = 'inv-1' } = {}) {
  const koerper = {
    type: 'client-request',
    rpcId,
    method: 'pluginInventory/list',
    payload: { args: {} },
  }
  let antwort
  try {
    antwort = await fetch(`http://127.0.0.1:${String(port)}/api/pluginInventory/list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(koerper),
      signal: AbortSignal.timeout(AUFRUF_GRENZE_MS),
    })
  } catch (fehler) {
    return { ok: false, grund: `Aufruf fehlgeschlagen: ${String(fehler)}` }
  }
  const text = await antwort.text()
  if (antwort.status !== 200) {
    return { ok: false, grund: `HTTP ${String(antwort.status)}`, rohtext: text.slice(0, 400) }
  }
  let umschlag
  try {
    umschlag = JSON.parse(text)
  } catch {
    return { ok: false, grund: 'Antwort ist kein JSON', rohtext: text.slice(0, 400) }
  }
  const ergebnis = umschlag.result
  if (ergebnis === undefined || ergebnis === null) {
    return { ok: false, grund: 'Umschlag ohne result', rohtext: text.slice(0, 400) }
  }
  if (ergebnis.ok !== true) {
    const fehler = ergebnis.error ?? {}
    return {
      ok: false,
      grund: `Remote meldet Fehler: ${String(fehler.code ?? '?')} — ${String(fehler.message ?? '')}`,
    }
  }
  const wert = ergebnis.value
  if (wert === undefined || wert === null) {
    return { ok: false, grund: 'result.value fehlt (innere Hülle leer)' }
  }
  // Der **äußere** Hüllentyp wird mitgegeben. Er ist die eine Angabe, die ich beim
  // Schreiben der Dokumentation geraten hatte (`client-response`), statt sie zu messen —
  // der Vertrag in `dsh-client-connection/lib/types/rpc.d.ts` nennt `server-response`.
  // Gemessen schlägt zitiert.
  return { ok: true, wert, huellentyp: umschlag.type ?? null, rpcId: umschlag.rpcId ?? null }
}

/** Zählt die Einträge nach Lebensphase — die Antwort auf „läuft es wirklich?". */
export function zaehlePhasen(eintraege) {
  const zaehler = new Map()
  for (const e of eintraege) {
    const phase = e?.fiberPhase === null || e?.fiberPhase === undefined ? 'keine Wurzel-Faser' : String(e.fiberPhase)
    zaehler.set(phase, (zaehler.get(phase) ?? 0) + 1)
  }
  return [...zaehler.entries()].sort((a, b) => b[1] - a[1])
}

/** Die Anzeigetexte sind `string` **oder** `{en, ...}` — beides auf einen Text bringen. */
export function anzeigetext(meta) {
  const wert = meta?.title
  if (wert === undefined || wert === null) return ''
  if (typeof wert === 'string') return wert
  return String(wert.en ?? Object.values(wert)[0] ?? '')
}

/** Wartet auf die Startzeile im Protokoll — ohne Busy-Poll, mit Zeitgrenze. */
function warteAufStart(kind, grenzeMs) {
  return new Promise((erfuellen) => {
    let puffer = ''
    let fertig = false
    const uhr = setTimeout(() => {
      if (!fertig) {
        fertig = true
        erfuellen({ ok: false, grund: `keine Startzeile binnen ${String(grenzeMs)} ms`, protokoll: puffer })
      }
    }, grenzeMs)
    const sauge = (stueck) => {
      puffer += stueck.toString('utf8')
      if (fertig) return
      for (const zeile of puffer.split('\n')) {
        const gelesen = leseStartzeile(zeile)
        if (gelesen !== null) {
          fertig = true
          clearTimeout(uhr)
          erfuellen({ ok: true, ...gelesen, protokoll: puffer })
          return
        }
      }
    }
    kind.stdout.on('data', sauge)
    kind.stderr.on('data', sauge)
  })
}

async function haupt() {
  console.log('Plugin-Inventur — welche Kernpakete laufen in unserem Host?')
  console.log('')

  const vertrag = pruefeVertrag()
  if (!vertrag.ok) {
    console.log(`ABBRUCH: Vorbedingung verletzt — ${vertrag.grund}`)
    console.log('Es wurde NICHTS gesendet. Der Vertrag hat sich geändert; die Sonde muß nachgezogen werden.')
    process.exitCode = 2
    return
  }
  console.log('Vorbedingung geprüft: pluginInventory/list ist parameterlos (parameters: [])')

  const kind = spawn(process.execPath, ['scripts/start.mjs', '--port', String(PORT), '--no-go'], {
    cwd: WURZEL,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PMH_HOST_STDERR: '1' },
  })

  let token = ''
  let beleg = null
  try {
    const start = await warteAufStart(kind, START_GRENZE_MS)
    if (!start.ok) {
      console.log(`ABBRUCH: ${start.grund}`)
      console.log('--- Protokoll (Token entfernt) ---')
      console.log(ohneToken(start.protokoll, token).slice(-2000))
      process.exitCode = 2
      return
    }
    token = start.token
    console.log(`Host gestartet auf Port ${String(start.port)}`)

    const anmeldung = await anmelden(start.url)
    if (!anmeldung.ok) {
      console.log(`ABBRUCH: Anmeldung fehlgeschlagen — HTTP ${String(anmeldung.status)}: ${anmeldung.grund}`)
      process.exitCode = 2
      return
    }
    console.log(`Anmeldung: HTTP ${String(anmeldung.status)}, Cookie gesetzt`)

    const abruf = await holeInventur(start.port, anmeldung.cookie)
    if (!abruf.ok) {
      console.log(`ABBRUCH: Inventur nicht abrufbar — ${abruf.grund}`)
      if (abruf.rohtext !== undefined) console.log(`Rohantwort: ${ohneToken(abruf.rohtext, token)}`)
      process.exitCode = 2
      return
    }

    const eintraege = Array.isArray(abruf.wert.entries) ? abruf.wert.entries : []
    const aktive = eintraege.filter((e) => e.fiberPhase === 'active')
    const aktiviert = eintraege.filter((e) => e.enabled === true)
    const gescheitert = eintraege.filter((e) => e.fiberPhase === 'failed')
    const presets = Array.isArray(abruf.wert.agentPresets) ? abruf.wert.agentPresets : []

    console.log('')
    console.log(`Äußerer Hüllentyp:         ${String(abruf.huellentyp)}`)
    console.log(`Einträge im Loader:        ${String(eintraege.length)}`)
    console.log(`davon enabled:             ${String(aktiviert.length)}`)
    console.log(`davon Lebensphase active:  ${String(aktive.length)}`)
    console.log(`davon failed:              ${String(gescheitert.length)}`)
    console.log(`Agent-Presets:             ${String(presets.length)}`)
    console.log(`Verwaltung verfügbar:      ${String(abruf.wert.managementAvailable ?? 'nicht gemeldet')}`)
    console.log('')
    console.log('Lebensphasen:')
    for (const [phase, anzahl] of zaehlePhasen(eintraege)) {
      console.log(`  ${phase.padEnd(22)} ${String(anzahl)}`)
    }

    if (gescheitert.length > 0) {
      console.log('')
      console.log('GESCHEITERTE Einträge (das ist der Befund, nicht die Zahl):')
      for (const e of gescheitert) {
        console.log(`  ${e.moduleName}`)
        if (e.meta?.error !== undefined) console.log(`      ${String(e.meta.error).slice(0, 200)}`)
      }
    }

    console.log('')
    console.log('Aktive Einträge nach Modul:')
    for (const e of aktive.slice(0, 60)) {
      const titel = anzeigetext(e.meta)
      console.log(`  ${String(e.moduleName).padEnd(56)}${titel === '' ? '' : `  (${titel.slice(0, 40)})`}`)
    }
    if (aktive.length > 60) console.log(`  … und ${String(aktive.length - 60)} weitere`)

    if (presets.length > 0) {
      console.log('')
      console.log('Agent-Presets:')
      for (const p of presets) {
        const kennung = p.isDefault === true ? ' [Vorgabe]' : ''
        const kaputt = p.broken === undefined ? '' : ` KAPUTT: ${String(p.broken).slice(0, 120)}`
        const zeilen = Array.isArray(p.rows) ? p.rows : []
        const lebendig = zeilen.filter((z) => z.fiberPhase === 'active').length
        console.log(`  ${String(p.id).padEnd(24)}${kennung} Zeilen: ${String(zeilen.length)}, aktiv: ${String(lebendig)}${kaputt}`)
      }
    }

    beleg = {
      gemessenAm: new Date().toISOString(),
      port: start.port,
      vertragGeprueft: true,
      anmeldungStatus: anmeldung.status,
      huellentyp: abruf.huellentyp,
      rpcId: abruf.rpcId,
      eintraege: eintraege.length,
      enabled: aktiviert.length,
      active: aktive.length,
      failed: gescheitert.length,
      phasen: Object.fromEntries(zaehlePhasen(eintraege)),
      presets: presets.map((p) => ({
        id: p.id,
        isDefault: p.isDefault === true,
        zeilen: Array.isArray(p.rows) ? p.rows.length : 0,
        aktiv: Array.isArray(p.rows) ? p.rows.filter((z) => z.fiberPhase === 'active').length : 0,
        broken: p.broken ?? null,
      })),
      gescheiterteModule: gescheitert.map((e) => ({ modul: e.moduleName, fehler: e.meta?.error ?? null })),
      aktiveModule: aktive.map((e) => ({ modul: e.moduleName, titel: anzeigetext(e.meta) })),
      rohschnappschuss: abruf.wert,
    }
    process.exitCode = gescheitert.length === 0 && eintraege.length > 0 ? 0 : 1
  } finally {
    kind.kill()
    // Dem Kind Zeit geben, den Port freizugeben, bevor die Sonde endet.
    await new Promise((f) => setTimeout(f, 400))
    if (beleg !== null) {
      const ziel = join(WURZEL, 'docs', 'status', 'plugin-inventur.json')
      mkdirSync(dirname(ziel), { recursive: true })
      writeFileSync(ziel, `${JSON.stringify(beleg, null, 2)}\n`, 'utf8')
      console.log('')
      console.log(`Beleg geschrieben: ${ziel}`)
    }
  }
}

// Nur ausführen, wenn direkt gestartet — die reinen Funktionen bleiben einzeln prüfbar.
// `import.meta.main` statt Pfadvergleich: ein Vergleich von `import.meta.url` mit
// `process.argv[1]` scheitert auf Windows an Schrägstrichen und Groß-/Kleinschreibung
// und hätte die Sonde **still nichts tun** lassen — also genau die Sorte Grün, die
// nichts bedeutet. Bun setzt `import.meta.main`.
if (import.meta.main === true || process.argv[1] === fileURLToPath(import.meta.url)) {
  await haupt()
}
