'use strict'

/**
 * `sharp-safe` — ein Tropfen-Ersatz für `sharp`, der libvips in einen
 * **Kindprozess** verlegt.
 *
 * **Warum.** libvips bringt GLib 2.90.0 statisch mit. Beim Abbau eines Threads
 * schließt GLib ein Win32-Handle ein zweites Mal, `win32_check_for_error`
 * macht daraus ein `g_error` — und `g_error` ist tödlich: der Prozeß endet.
 * Solange libvips **im Wirt** läuft, tötet dieser Fehler den Wirt.
 *
 * **Was hier passiert.** Der Wirt bekommt nur eine dünne Kette: jeder Aufruf
 * wird als JSON an einen dauerhaften Helfer (`worker.mjs`) geschickt, der die
 * echte `sharp`-Fassung lädt und ausführt. Bricht libvips dort ab, endet der
 * Helfer; der Wirt sieht eine abgelehnte Zusage und lebt weiter. Beim nächsten
 * Aufruf startet ein neuer Helfer.
 *
 * **Grenze, ehrlich benannt.** Das ist eine **Eindämmung**, keine Heilung: die
 * doppelte Handle-Schließung in libvips/GLib bleibt. Sie trifft nur keinen
 * Wirt mehr. Und es kostet einen Prozeßwechsel je Bild — gemessen wird das in
 * `tests/sharp-safe.test.ts`.
 *
 * @module @prometheus-harness/sharp-safe
 */

const { spawn } = require('node:child_process')
const { existsSync, readFileSync } = require('node:fs')
const { dirname, join } = require('node:path')

/** Die Kettenglieder, die die Anhang-Pipeline benutzt (und die üblichen Nachbarn). */
const CHAIN = [
  'rotate', 'resize', 'toColourspace', 'jpeg', 'webp', 'png', 'gif', 'avif', 'tiff',
  'raw', 'trim', 'flatten', 'extend', 'blur', 'sharpen', 'gamma', 'normalise', 'normalize',
  'modulate', 'composite', 'withMetadata', 'keepExif', 'keepIccProfile', 'withIccProfile',
]

const WURZELN = new Set(['@prometheus-harness/root', 'prometheus-harness'])

/** Die Projektwurzel: der nächste Vorfahr mit unserem Wurzel-package.json. */
function findeWurzel(start) {
  let dir = start
  for (let i = 0; i < 12; i++) {
    const datei = join(dir, 'package.json')
    if (existsSync(datei)) {
      try {
        const inhalt = JSON.parse(readFileSync(datei, 'utf8'))
        if (typeof inhalt.name === 'string' && WURZELN.has(inhalt.name)) return dir
      } catch {
        // unlesbar: weiter nach oben
      }
    }
    const hoch = dirname(dir)
    if (hoch === dir) break
    dir = hoch
  }
  return process.cwd()
}

/** Die **echte** sharp-Fassung — nie diese hier. */
function echtesSharp(wurzel) {
  const ausUmgebung = process.env.PMH_SHARP_REAL
  if (ausUmgebung !== undefined && existsSync(ausUmgebung)) return ausUmgebung
  return require.resolve('sharp', { paths: [wurzel] })
}

/** Ein Bild als JSON: Bytes als Base64, ein Pfad bleibt ein Pfad. */
function alsEingabe(eingabe) {
  if (typeof eingabe === 'string') return { art: 'pfad', wert: eingabe }
  if (Buffer.isBuffer(eingabe)) return { art: 'base64', wert: eingabe.toString('base64') }
  if (eingabe instanceof Uint8Array) return { art: 'base64', wert: Buffer.from(eingabe).toString('base64') }
  if (eingabe instanceof ArrayBuffer) return { art: 'base64', wert: Buffer.from(eingabe).toString('base64') }
  throw new Error('sharp-safe: nur Bytes oder ein Pfad werden unterstützt')
}

let zustand = null

function starteHelfer() {
  if (zustand !== null) return zustand
  const wurzel = findeWurzel(__dirname)
  const helfer = {
    kind: null,
    nummer: 0,
    offen: new Map(),
    puffer: '',
    echteFassung: echtesSharp(wurzel),
  }
  const bun = process.env.PMH_BUN ?? process.execPath
  const kind = spawn(bun, [join(__dirname, 'worker.mjs')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, PMH_SHARP_REAL: helfer.echteFassung, PMH_SHARP_SAFE: '1' },
  })
  helfer.kind = kind

  kind.stdout.setEncoding('utf8')
  kind.stdout.on('data', (stueck) => {
    helfer.puffer += stueck
    let grenze
    while ((grenze = helfer.puffer.indexOf('\n')) >= 0) {
      const zeile = helfer.puffer.slice(0, grenze)
      helfer.puffer = helfer.puffer.slice(grenze + 1)
      if (zeile.trim() !== '') beantworte(helfer, zeile)
    }
  })
  kind.stderr.setEncoding('utf8')
  kind.stderr.on('data', (stueck) => {
    for (const zeile of String(stueck).split(/\r?\n/)) {
      const sauber = zeile.trim()
      // Die Vorladung des Repos (bunfig.toml) schreibt bei jedem Bun-Start
      // ihre Zeilen. Sie sind kein Befund dieses Prozesses.
      if (sauber === '' || sauber.startsWith('[pmh]')) continue
      console.error(`[sharp-safe] ${sauber}`)
    }
  })
  kind.on('exit', (code, signal) => {
    if (zustand === helfer) zustand = null
    const grund = signal === null ? `exit ${code}` : `Signal ${signal}`
    const fehler = new Error(`sharp-safe: libvips-Helfer beendet (${grund})`)
    for (const zusage of helfer.offen.values()) zusage.abbrechen(fehler)
    helfer.offen.clear()
  })

  /**
   * Ein Pipe-Fehler darf den Wirt **nicht** töten.
   *
   * **Der Befund.** Bricht die Pipe zum Helfer (Windows meldet `EPIPE`, wenn die
   * Gegenseite weg ist), meldet Node/Bun das als `'error'`-Event auf dem Stream.
   * Ohne Zuhörer behandelt der Laufzeitkern das als unbehandelten Fehler und
   * beendet den **ganzen Prozeß** — gemessen am 27.10.2026: der Host starb mit
   * `exit 1`, nachdem der Helfer seine Antwort nicht mehr loswurde. Genau das
   * soll diese Kapsel verhindern; ein Rohrbruch ist kein Grund zu sterben.
   *
   * **Die Behandlung.** Der Helfer gilt als verloren, jede offene Zusage wird
   * abgelehnt, und der nächste Aufruf startet einen neuen. Der Wirt lebt.
   */
  const rohrbruch = (fehler) => {
    if (zustand === helfer) zustand = null
    const grund = fehler?.code ?? fehler?.message ?? 'unbekannt'
    for (const zusage of helfer.offen.values()) {
      zusage.abbrechen(new Error(`sharp-safe: Helfer-Pipe geschlossen (${grund})`))
    }
    helfer.offen.clear()
    try {
      kind.kill()
    } catch {
      // schon tot
    }
  }
  kind.stdin.on('error', rohrbruch)
  kind.stdout.on('error', rohrbruch)
  kind.stderr.on('error', rohrbruch)
  kind.on('error', (fehler) => {
    if (zustand === helfer) zustand = null
    for (const zusage of helfer.offen.values()) zusage.abbrechen(fehler)
    helfer.offen.clear()
  })

  // Der Helfer darf den Aufrufer **nicht am Leben halten**: ein Skript, das
  // ein Bild verarbeitet hat, soll enden können. Beim Ende des Aufrufers wird
  // der Helfer mitgenommen, damit kein verwaister libvips-Prozeß bleibt.
  kind.unref?.()
  kind.stdin.unref?.()
  kind.stdout.unref?.()
  kind.stderr.unref?.()
  process.once('exit', () => {
    try {
      kind.kill()
    } catch {
      // schon tot
    }
  })

  zustand = helfer
  console.error('[sharp-safe] Bildarbeit laeuft im Kindprozess (libvips isoliert)')
  return helfer
}

function beantworte(helfer, zeile) {
  let antwort
  try {
    antwort = JSON.parse(zeile)
  } catch {
    return
  }
  const zusage = helfer.offen.get(antwort.id)
  if (zusage === undefined) return
  helfer.offen.delete(antwort.id)
  if (antwort.ok === true) zusage.erfuellen(antwort)
  else zusage.abbrechen(new Error(`sharp-safe: ${antwort.error ?? 'unbekannter Fehler'}`))
}

function frage(auftrag, fristMs) {
  const helfer = starteHelfer()
  const id = ++helfer.nummer
  return new Promise((erfuellen, abbrechen) => {
    const frist = setTimeout(() => {
      helfer.offen.delete(id)
      try {
        helfer.kind.kill('SIGKILL')
      } catch {
        // schon tot
      }
      abbrechen(new Error(`sharp-safe: Zeitlimit von ${fristMs} ms überschritten`))
    }, fristMs)
    helfer.offen.set(id, {
      erfuellen: (wert) => {
        clearTimeout(frist)
        erfuellen(wert)
      },
      abbrechen: (fehler) => {
        clearTimeout(frist)
        abbrechen(fehler)
      },
    })
    // **Der Helfer kann zwischen Start und Schreiben sterben.** Dann ist sein
    // `stdin` zu, und `write` meldet das — je nach Laufzeit synchron oder als
    // `'error'`-Event (letzteres fängt {@link rohrbruch} in `starteHelfer`).
    // Hier wird der synchrone Fall abgefangen; ohne dieses `try` bliebe die
    // Zusage unbehandelt und der Wirt stürbe an einer Ablehnung, die niemand
    // liest.
    try {
      if (helfer.kind.exitCode !== null || helfer.kind.stdin.destroyed === true) {
        throw Object.assign(new Error('Helfer ist beendet'), { code: 'HELFER_TOT' })
      }
      helfer.kind.stdin.write(`${JSON.stringify({ id, ...auftrag })}\n`)
    } catch (fehler) {
      helfer.offen.delete(id)
      clearTimeout(frist)
      if (zustand === helfer) zustand = null
      try {
        helfer.kind.kill()
      } catch {
        // schon tot
      }
      const grund = fehler?.code ?? fehler?.message ?? 'unbekannt'
      abbrechen(new Error(`sharp-safe: Helfer nicht beschreibbar (${grund})`))
    }
  })
}

function baue(eingabe, optionen, kette) {
  const flaeche = {}
  for (const name of CHAIN) {
    flaeche[name] = (...argumente) => {
      kette.push([name, argumente])
      return flaeche
    }
  }
  flaeche.clone = () => baue(eingabe, optionen, [...kette])
  flaeche.toBuffer = (abschlussOptionen) =>
    frage(
      {
        eingabe: alsEingabe(eingabe),
        optionen,
        kette,
        abschluss: 'toBuffer',
        abschlussOptionen,
      },
      120000,
    ).then((antwort) => {
      const daten = Buffer.from(antwort.daten, 'base64')
      return abschlussOptionen !== undefined && abschlussOptionen.resolveWithObject === true
        ? { data: daten, info: antwort.info }
        : daten
    })
  flaeche.metadata = () =>
    frage({ eingabe: alsEingabe(eingabe), optionen, kette, abschluss: 'metadata' }, 120000).then(
      (antwort) => antwort.metadaten,
    )
  flaeche.toFile = (ziel, dateiOptionen) =>
    frage(
      {
        eingabe: alsEingabe(eingabe),
        optionen,
        kette,
        abschluss: 'toFile',
        abschlussOptionen: { ziel, optionen: dateiOptionen },
      },
      120000,
    ).then((antwort) => antwort.info)
  // Nur für die Prüfung: den Helfer hart beenden lassen — beweist, dass der
  // Aufrufer weiterlebt und der nächste Aufruf einen neuen Helfer startet.
  flaeche._beendeHelferFuerPruefung = () => frage({ absturz: true }, 15000)
  return flaeche
}

/**
 * Wie `sharp(...)`: liefert eine Kette, deren Abschluß im Kindprozess läuft.
 * @param {Buffer|Uint8Array|string} eingabe - Bildbytes oder ein Pfad.
 * @param {Record<string, unknown>} [optionen] - sharp-Eingabeoptionen.
 */
function sharpSafe(eingabe, optionen) {
  return baue(eingabe, optionen ?? {}, [])
}

sharpSafe.versions = {
  get sharp() {
    return 'sharp-safe 0.1.0 (Kindprozess)'
  },
  get vips() {
    return 'im Helfer'
  },
}
sharpSafe.concurrency = () => 1
sharpSafe.cache = () => sharpSafe
sharpSafe.simd = () => sharpSafe

module.exports = sharpSafe
module.exports.default = sharpSafe
