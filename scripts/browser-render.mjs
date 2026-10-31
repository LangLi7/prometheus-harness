/**
 * `scripts/browser-render.mjs` — der lokale Browser als HTTP-Dienst.
 *
 * ## Warum es diesen Dienst gibt
 *
 * `pmh-research` kann Seiten abrufen, aber nicht **rendern**: sein letzter
 * Rueckfall (`Browser` in `internal/kette/anbieter.go`) holt HTML und schneidet
 * die Markierungen weg. Fuer eine Nachrichtenseite reicht das, fuer eine
 * React-Anwendung fast nie — dort steht im HTML ein leerer `<div id="root">`.
 *
 * Dieses Skript haelt einen echten Chromium und beantwortet eine Frage:
 * „Gib mir den sichtbaren Text dieser Adresse." Der Go-Dienst fragt per HTTP,
 * nicht per Prozessstart — deshalb bleibt der Browser am Leben, wenn eine
 * Anfrage scheitert, und ein Browserstart kostet nicht jede Recherche.
 *
 * ## Was er nicht tut
 *
 * Kein Klicken, kein Ausfuellen, kein Login. Das ist die Aufgabe von
 * `scripts/browser-local.mjs` und der Faehigkeit `browser-local`. Hier geht es
 * nur um **lesen**, und zwar von Seiten, die ohne JavaScript leer blieben.
 *
 * ## Aufruf
 *
 * ```
 * node scripts/browser-render.mjs            # hoert auf 127.0.0.1:9335
 * curl -s -X POST http://127.0.0.1:9335/render -d '{"url":"https://example.com"}'
 * ```
 *
 * Umgebung: `PMH_RENDER_PORT` (Vorgabe 9335), `PMH_CDP_PORT` (Vorgabe 9334),
 * `PMH_CHROME_PATH` (sonst das Chromium aus dem Playwright-Cache).
 */

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.PMH_RENDER_PORT ?? 9335)
const CDP_PORT = Number(process.env.PMH_CDP_PORT ?? 9334)
const CDP = `http://127.0.0.1:${CDP_PORT}`
const WURZEL = process.cwd()
const PROFIL = join(WURZEL, '.pmh-build', 'browseruse', 'profiles', 'render')

/** Hoechste akzeptierte Anfragegroesse. */
const KOERPERGRENZE = 64 << 10
/** So lange darf eine Seite brauchen, bis `document.readyState` complete ist. */
const LADEFRIST_MS = 25_000

function chromiumPfad() {
  if (process.env.PMH_CHROME_PATH) return process.env.PMH_CHROME_PATH
  const basis = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  const kandidaten = ['chromium-1248', 'chromium-1134', 'chromium-1091']
  for (const name of kandidaten) {
    const p = join(basis, name, 'chrome-win64', 'chrome.exe')
    if (existsSync(p)) return p
  }
  return join(basis, 'chromium-1248', 'chrome-win64', 'chrome.exe')
}

async function cdpLebt() {
  try {
    const antwort = await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(1500) })
    return antwort.ok
  } catch {
    return false
  }
}

async function browserSicherstellen() {
  if (await cdpLebt()) return true
  const exe = chromiumPfad()
  if (!existsSync(exe)) throw new Error(`Kein Chromium gefunden: ${exe}`)
  const kind = spawn(
    exe,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${PROFIL}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank',
    ],
    { detached: true, stdio: 'ignore', windowsHide: true },
  )
  kind.unref()
  const ende = Date.now() + 20_000
  while (Date.now() < ende) {
    if (await cdpLebt()) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

/**
 * Eine CDP-Sitzung auf einem Tab: sendet Befehle, sammelt Antworten.
 *
 * **Warum ein eigener kleiner Klient und keine Bibliothek.** Der Dienst soll
 * ohne `npm install` laufen; Node bringt `WebSocket` und `fetch` mit. Mehr als
 * `Runtime.evaluate` und `Page.enable` braucht dieser Dienst nicht.
 */
function verbinde(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let naechsteId = 1
    const offen = new Map()

    ws.addEventListener('open', () => {
      resolve({
        sende(methode, params = {}) {
          const id = naechsteId++
          return new Promise((erfuellen, ablehnen) => {
            offen.set(id, { erfuellen, ablehnen })
            ws.send(JSON.stringify({ id, method: methode, params }))
            setTimeout(() => {
              if (offen.has(id)) {
                offen.delete(id)
                ablehnen(new Error(`CDP ${methode}: keine Antwort`))
              }
            }, 30_000)
          })
        },
        schliessen() {
          try {
            ws.close()
          } catch {
            /* egal */
          }
        },
      })
    })

    ws.addEventListener('message', (ereignis) => {
      let nachricht
      try {
        nachricht = JSON.parse(ereignis.data)
      } catch {
        return
      }
      const wartend = offen.get(nachricht.id)
      if (!wartend) return
      offen.delete(nachricht.id)
      if (nachricht.error) wartend.ablehnen(new Error(nachricht.error.message ?? 'CDP-Fehler'))
      else wartend.erfuellen(nachricht.result)
    })

    ws.addEventListener('error', () => reject(new Error('CDP-Verbindung fehlgeschlagen')))
  })
}

/**
 * Wartet, bis die **Zielseite** geladen ist.
 *
 * **Der Fehler, den diese Fassung behebt.** Ein frisch angelegter Tab ist
 * sofort `about:blank` **und** `readyState === 'complete'`. Die erste Fassung
 * fragte nur nach `readyState` — sie hielt den leeren Tab für die fertige Seite,
 * las leeren Text und meldete „leerer Text". Gemessen am 21.10.2026 über
 * `research_fetch`: der Renderer antwortete nach **80 ms** mit leerem Text,
 * die Kette fiel auf den nackten Abruf zurück. Deshalb wird jetzt zusätzlich
 * geprüft, daß die Adresse den Tab verlassen hat, und danach gewartet, bis
 * wirklich Text im DOM steht (SPAs füllen ihn nach `load`).
 */
async function warteAufSeite(sitzung) {
  const ende = Date.now() + LADEFRIST_MS
  let verlassen = false
  while (Date.now() < ende) {
    const stand = await sitzung.sende('Runtime.evaluate', {
      expression: 'JSON.stringify([document.readyState, location.href])',
      returnByValue: true,
    })
    let zustand = 'loading'
    let adresse = ''
    try {
      ;[zustand, adresse] = JSON.parse(String(stand?.result?.value ?? '[]'))
    } catch {
      /* noch nichts lesbar */
    }
    if (adresse && adresse !== 'about:blank' && zustand === 'complete') {
      verlassen = true
      // Der Text kommt bei SPAs oft **nach** `load` — kurz nachfassen.
      const text = await sitzung.sende('Runtime.evaluate', {
        expression: 'document.body ? document.body.innerText.length : 0',
        returnByValue: true,
      })
      if (Number(text?.result?.value ?? 0) > 0) return true
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  // Verlassen, aber ohne Text: kein Timeout, sondern eine leere Seite. Der
  // Aufrufer meldet das als „leerer Text" und nicht als „zu langsam".
  return verlassen
}

/** Holt Titel und sichtbaren Text einer Adresse. */
async function rendern(url, maxBytes) {
  const ziel = new URL(url)
  if (ziel.protocol !== 'http:' && ziel.protocol !== 'https:') {
    throw new Error('nur http und https')
  }

  // **Die Adresse steht roh hinter dem Fragezeichen, nicht prozentkodiert.**
  // Chromium liest dort die URL selbst; `encodeURIComponent` macht aus
  // `https://example.com` ein `https%3A%2F%2F…`, und der Tab landet auf
  // `about:blank` — gemessen, bevor diese Zeile geaendert wurde.
  const angelegt = await fetch(`${CDP}/json/new?${url}`, { method: 'PUT' })
  if (!angelegt.ok) throw new Error(`Tab nicht anlegbar: HTTP ${angelegt.status}`)
  const tab = await angelegt.json()

  try {
    const sitzung = await verbinde(tab.webSocketDebuggerUrl)
    try {
      await sitzung.sende('Page.enable')
      if (!(await warteAufSeite(sitzung))) throw new Error('Zeit abgelaufen beim Laden')

      const titel = await sitzung.sende('Runtime.evaluate', {
        expression: 'document.title',
        returnByValue: true,
      })
      const adresse = await sitzung.sende('Runtime.evaluate', {
        expression: 'location.href',
        returnByValue: true,
      })
      const text = await sitzung.sende('Runtime.evaluate', {
        expression: 'document.body ? document.body.innerText : ""',
        returnByValue: true,
      })

      let inhalt = String(text?.result?.value ?? '')
      if (maxBytes > 0 && inhalt.length > maxBytes) inhalt = inhalt.slice(0, maxBytes)

      return {
        url: String(adresse?.result?.value ?? url),
        title: String(titel?.result?.value ?? ''),
        text: inhalt,
        bytes: Buffer.byteLength(inhalt, 'utf8'),
      }
    } finally {
      sitzung.schliessen()
    }
  } finally {
    // Der Tab wird immer geschlossen: ein Renderer, der Tabs sammelt, ist ein
    // Speicherleck mit Adressleiste.
    await fetch(`${CDP}/json/close/${tab.id}`).catch(() => {})
  }
}

/** Liest den Koerper mit harter Grenze. */
async function koerperLesen(anfrage) {
  const stuecke = []
  let gesamt = 0
  for await (const stueck of anfrage) {
    gesamt += stueck.length
    if (gesamt > KOERPERGRENZE) throw new Error('Anfrage zu gross')
    stuecke.push(stueck)
  }
  return Buffer.concat(stuecke).toString('utf8')
}

const server = createServer(async (anfrage, antwort) => {
  const pfad = (anfrage.url ?? '/').split('?')[0]

  if (pfad === '/health') {
    const lebt = await cdpLebt()
    const version = lebt ? await (await fetch(`${CDP}/json/version`)).json() : null
    antwort.writeHead(200, { 'content-type': 'application/json' })
    antwort.end(JSON.stringify({ ok: lebt, cdp: CDP, browser: version?.Browser ?? null }))
    return
  }

  if (pfad !== '/render' || anfrage.method !== 'POST') {
    antwort.writeHead(404, { 'content-type': 'application/json' })
    antwort.end(JSON.stringify({ error: 'nur POST /render und GET /health' }))
    return
  }

  try {
    const roh = await koerperLesen(anfrage)
    const eingabe = JSON.parse(roh)
    if (!eingabe?.url) throw new Error('url fehlt')
    if (!(await browserSicherstellen())) throw new Error('Browser startet nicht')

    const ergebnis = await rendern(String(eingabe.url), Number(eingabe.maxBytes ?? 0))
    antwort.writeHead(200, { 'content-type': 'application/json' })
    antwort.end(JSON.stringify(ergebnis))
  } catch (fehler) {
    antwort.writeHead(500, { 'content-type': 'application/json' })
    antwort.end(JSON.stringify({ error: fehler instanceof Error ? fehler.message : String(fehler) }))
  }
})

if (!(await browserSicherstellen())) {
  console.error(`browser-render: Chromium antwortet nicht auf ${CDP}`)
  process.exit(1)
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`browser-render hoert auf http://127.0.0.1:${PORT} (CDP ${CDP})`)
})
