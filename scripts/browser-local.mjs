/**
 * `scripts/browser-local.mjs` — der lokale Browser für den Agenten.
 *
 * ## Warum es diese Datei gibt
 *
 * Browser-Use ist auf dieser Maschine **installiert** (106 Pakete, `uvx
 * --from 'browser-use[cli]'`), und der MCP-Server davon antwortet auch — aber
 * jeder Browser-Aufruf scheitert mit `-32000 Connection closed`: browser-use
 * startet Chromium mit 60 Argumenten, und der Prozess stirbt nach 0,2 s, bevor
 * CDP antwortet. Dieselbe Argumentliste von Hand gestartet läuft.
 *
 * Was dagegen **gemessen funktioniert** (21.10.2026): ein selbst gestartetes
 * Chromium mit `--remote-debugging-port`, und `BU_CDP_URL` in der Umgebung des
 * CLI-Pfads (`browser-harness`). Dann liefert
 * `print(page_info())` ein Wörterbuch mit `url`, `title`, `w`, `h`, exit 0.
 *
 * Dieses Skript macht genau das: Browser sicherstellen, Snippet über stdin an
 * die CLI geben, Ausgabe durchreichen.
 *
 * ## Aufruf
 *
 * ```
 * node scripts/browser-local.mjs --check
 * node scripts/browser-local.mjs --code .pmh-build/snippet.py
 * ```
 *
 * ## Grenzen
 *
 * - Ein Browser, ein Port (9334). Zwei Agenten teilen sich Tabs — das ist die
 *   Grenze, die browser-use selbst beschreibt.
 * - Kein Cloud-Daemon, kein `auth login`, kein Modellschlüssel. Die direkte
 *   Steuerung braucht keinen.
 * - Der Fehler `DevToolsActivePort not found` bedeutet: 9334 antwortet nicht.
 *   Dann startet dieses Skript den Browser; scheitert das, steht der Pfad im
 *   Fehlertext.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const WURZEL = process.cwd()
const PORT = 9334
const CDP = `http://127.0.0.1:${PORT}`
const PROFIL = join(WURZEL, '.pmh-build', 'browseruse', 'profiles', 'agent')

/** Chromium, das Playwright bereits mitbringt — kein Chrome-Extra-Download. */
function chromiumPfad() {
  if (process.env.PMH_CHROME_PATH) return process.env.PMH_CHROME_PATH
  const basis = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  for (const name of ['chromium-1248', 'chromium-1134', 'chromium-1091']) {
    const p = join(basis, name, 'chrome-win64', 'chrome.exe')
    if (existsSync(p)) return p
  }
  return join(basis, 'chromium-1248', 'chrome-win64', 'chrome.exe')
}

/** Antwortet der CDP-Port? */
async function cdpLebt() {
  try {
    const antwort = await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(2000) })
    return antwort.ok
  } catch {
    return false
  }
}

/** Wartet, bis der Port antwortet. */
async function warteAufCdp(sekunden = 20) {
  const ende = Date.now() + sekunden * 1000
  while (Date.now() < ende) {
    if (await cdpLebt()) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

/** Startet Chromium, falls es nicht läuft. Gibt zurück, ob es danach lebt. */
async function browserSicherstellen() {
  if (await cdpLebt()) return true

  const exe = chromiumPfad()
  if (!existsSync(exe)) {
    throw new Error(
      `Kein Chromium gefunden: ${exe}\n` +
        'Abhilfe: PMH_CHROME_PATH setzen oder `uvx playwright install chromium` laufen lassen.',
    )
  }

  const kind = spawn(
    exe,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFIL}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank',
    ],
    { detached: true, stdio: 'ignore', windowsHide: true },
  )
  kind.unref()

  return warteAufCdp()
}

/** Umgebung für den CLI-Pfad: CDP statt Chrome-Suche, Cache im Arbeitsbaum. */
function umgebung() {
  return {
    ...process.env,
    BH_HOME: join(WURZEL, '.pmh-build', 'browser-harness'),
    BU_CDP_URL: CDP,
    UV_CACHE_DIR: join(WURZEL, '.pmh-build', 'uv-cache'),
    UV_LINK_MODE: 'copy',
    ANONYMIZED_TELEMETRY: 'false',
    // Ohne das hängt browser-harness jedem Seitentitel ein Pferd an
    // („🐴 Example Domain"). Nützlich für seine Tab-Erkennung, störend, wenn
    // der Titel im Ergebnis weiterverwendet wird.
    BH_TAB_MARKER: '0',
  }
}

/** Führt ein Python-Snippet über die browser-use-CLI aus. */
function snippetAusfuehren(code) {
  return new Promise((resolve) => {
    const kind = spawn(
      process.env.PMH_UVX ?? join(process.env.LOCALAPPDATA ?? '', 'hermes', 'bin', 'uvx.exe'),
      ['--from', 'browser-use[cli]', 'browser-use'],
      { cwd: WURZEL, env: umgebung(), stdio: ['pipe', 'inherit', 'inherit'] },
    )
    kind.stdin.end(code)
    kind.on('exit', (code2) => resolve(code2 ?? 1))
    kind.on('error', (fehler) => {
      console.error(`browser-local: Start fehlgeschlagen: ${fehler.message}`)
      resolve(125)
    })
  })
}

const argv = process.argv.slice(2)

/**
 * Beendet **unseren** Browser (Port 9334) samt Kindern.
 *
 * **Warum es diesen Schalter gibt.** Ein headless Chromium hat kein Fenster, das
 * man schließen könnte — es bleibt stehen, bis jemand es beendet. Ohne `--kill`
 * gibt es dafür keinen Weg außer Task-Manager. Der Renderer startet ihn beim
 * nächsten Aufruf neu; beendet wird nur, was auf **unserem** Port lauscht.
 */
if (argv.includes('--kill')) {
  const { execFileSync, spawnSync } = await import('node:child_process')
  let ausgabe = ''
  try {
    ausgabe = execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
  } catch (fehler) {
    console.error(`browser-local: netstat nicht lesbar: ${fehler.message}`)
    process.exit(125)
  }
  // **Nicht nach dem Wort „LISTENING" filtern.** Auf einem deutschen Windows
  // heißt der Zustand „ABHÖREN"; die erste Fassung fand deshalb nie einen
  // Prozess und meldete „nichts zu beenden", während der Port längst antwortete.
  // Gezählt wird jetzt die Spalte: `TCP  <adresse>:9334  <ziel>  <zustand>  <pid>`.
  const pids = new Set()
  for (const zeile of ausgabe.split('\n')) {
    const spalten = zeile.trim().split(/\s+/)
    if (spalten[0] !== 'TCP') continue
    if (!spalten[1]?.endsWith(`:${PORT}`)) continue
    const pid = spalten.at(-1)
    if (/^\d+$/.test(pid ?? '')) pids.add(pid)
  }
  if (pids.size === 0) {
    console.log(`browser-local: nichts zu beenden — auf Port ${PORT} lauscht niemand.`)
    process.exit(0)
  }
  for (const pid of pids) {
    spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' })
    console.log(`browser-local: beendet — PID ${pid} (Port ${PORT})`)
  }
  process.exit(0)
}

if (argv.includes('--check')) {
  const lebt = await browserSicherstellen()
  if (!lebt) {
    console.error(`browser-local: CDP antwortet nicht auf ${CDP}`)
    process.exit(1)
  }
  const version = await (await fetch(`${CDP}/json/version`)).json()
  console.log(JSON.stringify({ cdp: CDP, browser: version.Browser, userAgent: version['User-Agent'] }, null, 2))
  process.exit(0)
}

const index = argv.indexOf('--code')
if (index === -1 || !argv[index + 1]) {
  console.error('Aufruf: node scripts/browser-local.mjs --check | --code <datei.py>')
  process.exit(2)
}

const datei = argv[index + 1]
if (!existsSync(datei)) {
  console.error(`browser-local: Datei fehlt: ${datei}`)
  process.exit(2)
}

if (!(await browserSicherstellen())) {
  console.error(`browser-local: Browser startet nicht (CDP ${CDP})`)
  process.exit(1)
}

process.exit(await snippetAusfuehren(readFileSync(datei, 'utf8')))
