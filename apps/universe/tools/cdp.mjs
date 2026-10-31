/**
 * **Ein kopfloser Browser, der sich selbst wieder schließt.**
 *
 * ## Warum dieser Helfer eine Datei ist
 *
 * Bis zum 16.10.2026 startete **jede** Meßsonde ihren eigenen kopflosen Browser — und **keine**
 * beendete ihn. Auf dem Rechner des Betreibers standen danach **74 Brave-Prozesse** (einer mit 1,7 GB,
 * einer mit 1,2 GB), und in seinem Terminal liefen die Startmeldungen jeder Sitzung auf. Seine Frage:
 * *„DevTools listening on ws://… — why? browser crash?"*
 *
 * Es war kein Absturz. Es war **mein Müll** — und der Grund ist eine fehlende Zeile: `Start-Process`
 * ohne `taskkill`. Diese Datei hat sie, und zwar an **einer** Stelle statt in jeder Sonde.
 *
 * ## Wie man sie benutzt
 *
 * ```js
 * import { browserHolen, neueSeite, verbinde, beenden } from './cdp.mjs'
 *
 * const browser = await browserHolen()
 * try {
 *   const seite = await neueSeite(browser.port, 'http://127.0.0.1:3081/universe/')
 *   const cdp = await verbinde(seite.webSocketDebuggerUrl)
 *   // … messen …
 * } finally {
 *   await beenden(browser)     // ← der Schritt, der gefehlt hat
 * }
 * ```
 *
 * **`browserHolen` startet nur, wenn keiner läuft.** Ein zweiter Browser auf demselben Port wäre nicht
 * nur Verschwendung: `Page.bringToFront` und die Drosselung von Hintergrundfenstern machen Messungen
 * über zwei Instanzen hinweg unbrauchbar (das steht in `docs/status/himmel-physik.md` §4.3).
 *
 * ## Aufräumen
 *
 * ```
 * bun tools/cdp.mjs --aufraeumen
 * ```
 *
 * beendet **alle** kopflosen Browser und löscht ihre Wegwerf-Profile. Kopflos heißt: nur Prozesse mit
 * `--headless` in der Befehlszeile — ein **normales** Browserfenster des Betreibers wird **nicht**
 * angefaßt. Das ist keine Vorsicht, sondern der Unterschied zwischen Aufräumen und Sachbeschädigung.
 *
 * @module apps/universe/tools/cdp
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Wo Brave liegt — auf dieser Maschine. */
const BRAVE = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'

/** Der Standardport der Fernsteuerung. */
export const CDP_PORT = 9223

/**
 * Fragt, ob auf einem Port schon eine Fernsteuerung antwortet.
 *
 * @param port - der Port
 * @returns die Versionsauskunft oder `undefined`
 */
async function laufenderBrowser(port) {
  try {
    const antwort = await fetch(`http://127.0.0.1:${String(port)}/json/version`, {
      signal: AbortSignal.timeout(1500),
    })
    if (!antwort.ok) return undefined
    return await antwort.json()
  } catch {
    return undefined
  }
}

/**
 * **Der Port kommt aus der Datei, nicht aus dem Wunsch.**
 *
 * Gemessen am 2026-02 (Brave 155.1.97.59): mit `--remote-debugging-port=9223` öffnete der Browser
 * **keinen** Port — `netstat` zeigte nichts, `/json/version` verweigerte die Verbindung, und
 * {@link browserHolen} lief in „meldet sich nicht". Mit `--remote-debugging-port=0` schreibt
 * Chromium den **tatsächlich** gewählten Port in `<profil>/DevToolsActivePort`; das ist der
 * dokumentierte, verläßliche Weg und der einzige, der eine feste Nummer nicht voraussetzt.
 *
 * @param profil - das Datenverzeichnis des Browsers
 * @returns der Port oder `undefined`, solange die Datei fehlt
 */
function portAusProfil(profil) {
  try {
    const datei = join(profil, 'DevToolsActivePort')
    if (!existsSync(datei)) return undefined
    const erste = readFileSync(datei, 'utf8').split('\n')[0]?.trim() ?? ''
    const port = Number(erste)
    return Number.isInteger(port) && port > 0 ? port : undefined
  } catch {
    return undefined
  }
}

/**
 * Einen Browser holen — einen laufenden benutzen oder einen starten.
 *
 * @param port - der gewünschte Port der Fernsteuerung (der Browser darf einen anderen wählen)
 * @param optionen - `software: true` erzwingt die **Software-Rasterung** (CPU). Das ist der Fall, den
 *   der Betreiber verlangt hat („sollte es auch IGPU und CPU supporten") — und der einzige, den man
 *   auf einer Maschine mit guter Karte sonst nie zu sehen bekommt. Gemessen wird dann wirklich die
 *   CPU, nicht die Karte.
 * @returns `{ port, gestartet, profil, prozess }` — `port` ist der **tatsächliche** Port;
 *   `gestartet` sagt, ob **diese** Datei ihn beenden muß
 */
export async function browserHolen(port = CDP_PORT, optionen = {}) {
  const laeuft = await laufenderBrowser(port)
  if (laeuft) {
    console.log(`[cdp] benutze den laufenden Browser auf ${String(port)} (wird NICHT beendet)`)
    return { port, gestartet: false, profil: undefined, prozess: undefined }
  }
  if (!existsSync(BRAVE)) throw new Error(`Brave nicht gefunden: ${BRAVE}`)
  const profil = mkdtempSync(join(tmpdir(), 'pmh-cdp-'))
  const prozess = spawn(
    BRAVE,
    [
      '--headless=new',
      // **Port 0: der Browser wählt.** Siehe {@link portAusProfil} — eine feste Nummer wurde auf
      // dieser Maschine stillschweigend nicht geöffnet.
      '--remote-debugging-port=0',
      `--user-data-dir=${profil}`,
      '--no-first-run',
      '--no-default-browser-check',
      // **Mit Software-Rasterung, ausdrücklich.** Ein kopfloser Lauf hat keine Grafikkarte; ohne diese
      // Zeile verweigert Chromium das Zeichnen, und jede Messung wäre eine über „es geht nicht".
      '--enable-unsafe-swiftshader',
      ...(optionen.software === true
        ? [
            /*
             * **Die Karte abschalten — für die CPU-Messung.**
             *
             * `--disable-gpu` allein genügt nicht: Chromium fällt dann auf SwiftShader zurück, und
             * **das ist genau der Punkt** — die CPU rastert. Beides zusammen ist der ungünstigste Fall,
             * den diese Maschine hergibt, und damit die richtige Meßstelle für „läuft es auch ohne
             * Karte".
             */
            '--disable-gpu',
            '--use-gl=angle',
            '--use-angle=swiftshader',
          ]
        : []),
      '--hide-scrollbars',
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore', detached: false },
  )
  for (let i = 0; i < 40; i += 1) {
    await new Promise((f) => setTimeout(f, 250))
    const echterPort = portAusProfil(profil)
    if (echterPort !== undefined && (await laufenderBrowser(echterPort))) {
      console.log(`[cdp] Browser gestartet (Profil ${profil}, Port ${String(echterPort)})`)
      return { port: echterPort, gestartet: true, profil, prozess }
    }
  }
  prozess.kill()
  rmSync(profil, { recursive: true, force: true })
  throw new Error('Der kopflose Browser meldet sich nicht')
}

/**
 * **Den Browser beenden — und sein Profil löschen.**
 *
 * Der Prozeßbaum, nicht nur der Hauptprozeß: Chromium startet Renderer, GPU- und Hilfsprozesse, die
 * einen toten Elternprozeß **überleben** (genau das war der Fund von 74 Prozessen).
 *
 * @param browser - was {@link browserHolen} zurückgegeben hat
 */
export async function beenden(browser) {
  if (!browser.gestartet || browser.prozess === undefined) {
    console.log('[cdp] nichts zu beenden (fremder Browser)')
    return
  }
  const pid = browser.prozess.pid
  if (pid !== undefined) {
    const kill = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    await new Promise((f) => kill.on('exit', f))
  }
  await new Promise((f) => setTimeout(f, 500))
  if (browser.profil !== undefined) rmSync(browser.profil, { recursive: true, force: true })
  console.log('[cdp] Browser beendet, Profil gelöscht')
}

/** Eine neue Seite aufmachen. */
export async function neueSeite(port, url) {
  const antwort = await fetch(`http://127.0.0.1:${String(port)}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  })
  if (!antwort.ok) throw new Error(`CDP /json/new: HTTP ${String(antwort.status)}`)
  return await antwort.json()
}

/** Eine Seite schließen — sonst sammeln sich in **einem** Browser viele Tabellen an. */
export async function seiteSchliessen(port, id) {
  try {
    await fetch(`http://127.0.0.1:${String(port)}/json/close/${String(id)}`)
  } catch {
    // Eine schon geschlossene Seite ist kein Fehler.
  }
}

/** Eine WebSocket-Verbindung zu einer Seite. */
export async function verbinde(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((f, x) => {
    ws.addEventListener('open', () => f())
    ws.addEventListener('error', () => x(new Error('WebSocket-Fehler')))
  })
  const wartende = new Map()
  ws.addEventListener('message', (ereignis) => {
    const nachricht = JSON.parse(String(ereignis.data))
    const loeser = wartende.get(nachricht.id)
    if (loeser) {
      wartende.delete(nachricht.id)
      loeser(nachricht)
    }
  })
  let naechste = 1
  const ruf = async (method, params = {}) => {
    const id = naechste++
    const antwort = new Promise((f, x) => {
      wartende.set(id, f)
      setTimeout(() => x(new Error(`${method}: Zeitüberschreitung`)), 30_000)
    })
    ws.send(JSON.stringify({ id, method, params }))
    return await antwort
  }
  const js = (ausdruck) => ruf('Runtime.evaluate', { expression: ausdruck, returnByValue: true, awaitPromise: true })
  return { ruf, js, schliessen: () => ws.close() }
}

/**
 * **Aufräumen: alle kopflosen Browser beenden.**
 *
 * Erkannt wird an `--headless` in der **Befehlszeile**. Ein normales Fenster hat das nicht — es wird
 * deshalb nicht angefaßt, auch wenn es dieselbe Anwendung ist.
 *
 * @returns wie viele Prozesse beendet wurden
 */
export async function aufraeumen() {
  const liste = await new Promise((f) => {
    const ps = spawn(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "(Get-CimInstance Win32_Process -Filter \"Name='brave.exe'\" | Where-Object { $_.CommandLine -match '--headless' } | Select-Object -ExpandProperty ProcessId) -join ','",
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
    let text = ''
    ps.stdout.on('data', (d) => {
      text += String(d)
    })
    ps.on('exit', () => f(text.trim()))
  })
  const ids = liste === '' ? [] : liste.split(',').filter((x) => x !== '')
  for (const id of ids) {
    const kill = spawn('taskkill', ['/PID', id, '/T', '/F'], { stdio: 'ignore' })
    await new Promise((f) => kill.on('exit', f))
  }
  console.log(`[cdp] ${String(ids.length)} kopflose(r) Browser beendet`)
  // Und die Wegwerf-Profile weg.
  const temp = tmpdir()
  const weg = await new Promise((f) => {
    const ps = spawn(
      'powershell',
      ['-NoProfile', '-Command', `Get-ChildItem '${temp}' -Directory -Filter 'pmh-*' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue; ''`],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
    ps.on('exit', () => f())
  })
  void weg
  console.log('[cdp] Wegwerf-Profile gelöscht')
  return ids.length
}

// Direkter Aufruf: `bun tools/cdp.mjs --aufraeumen`
if (Bun.argv[1] === '--aufraeumen') {
  await aufraeumen()
  process.exit(0)
}
