/**
 * Meßsonde: **bedient unser Host die SSE-Strecke `/plugins/events`?**
 *
 * ## Warum diese Sonde existiert
 *
 * [live-anbindung.md](../live-anbindung.md) §8 hat gemessen: der Kern kennt SSE
 * (`text/event-stream`), sein einziger Verbraucher im Baum ist **HMR**. Und der Zustand
 * unseres Hosts zeigt eine Spannung:
 *
 * ```
 * @deepseek-ai/dsh-hmr          enabled=false
 * @deepseek-ai/dsh-client-hmr   enabled=true, phase=active
 * ```
 *
 * Daraus habe ich **vermutet**, die SSE-Strecke werde nicht bedient. Diese Sonde prüft die
 * Vermutung, statt sie stehenzulassen — und sie hat sich als **falsch** erwiesen:
 *
 * * Der Weg heißt `/plugins/events` (`EVENTS_ROUTE` in `dsh-client-hmr/lib/client.js`).
 * * Er wird von **`dsh-client-hmr`** angemeldet (`ctx.webServer.register({ … "content-type":
 *   "text/event-stream" … })`, `lib/index.js:141`) — und dieses Paket **ist aktiv**.
 * * **`dsh-hmr` ist etwas anderes**: die Nachlade-Maschine („Reload plugin code and profile
 *   configuration through one coordinated queue"), nicht der Träger der Strecke.
 *
 * ## Was gemessen wird
 *
 * | Frage | Wie |
 * |---|---|
 * | Antwortet `/plugins/events` überhaupt? | echter HTTP-Abruf mit Cookie |
 * | Ist der Medientyp `text/event-stream`? | `content-type` der Antwort |
 * | Kommt ein erster Rahmen? | kurzes Mitlesen des Körpers |
 *
 * ## Was sie **nicht** prüft
 *
 * Ob ein **Browser** die Rahmen verwertet. Der `EventSource` läuft dort; hier wird die
 * **Strecke** geprüft, nicht der Client.
 *
 * @module docs/status/messsonden/sse-sonde
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const WURZEL = join(HIER, '..', '..', '..')

const START_GRENZE_MS = 90_000
/** Der Weg aus dem Client — **nachgeschlagen**, nicht erfunden. */
export const SSE_WEG = '/plugins/events'

export function leseStartzeile(text) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(text)
  return t === null ? null : { port: Number(t[1]), token: t[2] }
}

async function haupt() {
  const portArg = Number(process.argv[2] ?? 3071)
  console.log('SSE-Strecke — bedient unser Host sie?')
  console.log(`  Weg: ${SSE_WEG}`)
  console.log('')

  const kind = spawn(process.execPath, ['scripts/start.mjs', '--port', String(portArg), '--no-go'], {
    cwd: WURZEL,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  try {
    const start = await new Promise((erfuellen) => {
      let puffer = ''
      const uhr = setTimeout(() => erfuellen(null), START_GRENZE_MS)
      const sauge = (s) => {
        puffer += s.toString('utf8')
        const g = leseStartzeile(puffer)
        if (g !== null) {
          clearTimeout(uhr)
          erfuellen(g)
        }
      }
      kind.stdout.on('data', sauge)
      kind.stderr.on('data', sauge)
    })
    if (start === null) {
      console.log('ABBRUCH: keine Startzeile')
      process.exitCode = 2
      return
    }
    const { port, token } = start
    console.log(`Host auf Port ${String(port)}`)
    const anmeldung = await fetch(`http://127.0.0.1:${String(port)}/?token=${token}`, { redirect: 'manual' })
    const cookie = (anmeldung.headers.get('set-cookie') ?? '').split(';')[0]

    // ---- Ohne Cookie: was antwortet der Host — und was LIEFERT er? ----
    // **Der Kopf allein genügt nicht.** Gemessen: der Weg antwortet auch ohne Anmeldung mit
    // HTTP 200 und `text/event-stream`. Ob er dann auch **Rahmen liefert**, ist eine andere
    // Frage — und die entscheidet, ob das eine offene Auskunft ist oder nur eine offene Tür.
    console.log('')
    console.log('== 1. Ohne Anmeldung ==')
    const abbruch0 = new AbortController()
    const uhr0 = setTimeout(() => abbruch0.abort(), 6000)
    let ohne = null
    try {
      ohne = await fetch(`http://127.0.0.1:${String(port)}${SSE_WEG}`, {
        redirect: 'manual',
        headers: { accept: 'text/event-stream' },
        signal: abbruch0.signal,
      })
    } catch {
      /* Zeitgrenze */
    }
    clearTimeout(uhr0)
    if (ohne === null) {
      console.log('  keine Antwort (Zeitgrenze)')
      process.exitCode = 2
      return
    }
    console.log(`  HTTP ${String(ohne.status)}   content-type: ${String(ohne.headers.get('content-type') ?? '(keiner)')}`)
    let ohneText = ''
    if (ohne.body !== null) {
      const leser0 = ohne.body.getReader()
      const bis0 = Date.now() + 4000
      try {
        while (Date.now() < bis0) {
          const { value, done } = await Promise.race([
            leser0.read(),
            new Promise((f) => setTimeout(() => f({ value: undefined, done: false }), 1000)),
          ])
          if (done) break
          if (value !== undefined) ohneText += new TextDecoder().decode(value)
          if (ohneText.length > 2000) break
        }
      } catch {
        /* erwartet */
      }
      try {
        await leser0.cancel()
      } catch {
        /* egal */
      }
    }
    console.log(`  ohne Anmeldung gelesen: ${String(ohneText.length)} Zeichen`)
    const hatDaten0 = /^data:/mu.test(ohneText)
    if (ohneText.length > 0) {
      for (const zeile of ohneText.split('\n').slice(0, 4)) console.log(`    ${zeile.slice(0, 130)}`)
    }
    console.log(`  enthält data-Rahmen: ${hatDaten0 ? 'JA  <== offene Auskunft' : 'nein'}`)

    // ---- Mit Cookie: öffnet sich die Strecke? ----
    console.log('')
    console.log('== 2. Mit Anmeldung ==')
    const abbruch = new AbortController()
    const uhr = setTimeout(() => abbruch.abort(), 6000)
    let antwort = null
    let fehler = null
    try {
      antwort = await fetch(`http://127.0.0.1:${String(port)}${SSE_WEG}`, {
        headers: { cookie, accept: 'text/event-stream' },
        signal: abbruch.signal,
      })
    } catch (e) {
      fehler = e instanceof Error ? e.message : String(e)
    }
    clearTimeout(uhr)

    if (fehler !== null) {
      console.log(`  Verbindung scheiterte: ${fehler}`)
      process.exitCode = 1
      return
    }
    const art = antwort.headers.get('content-type') ?? ''
    console.log(`  HTTP ${String(antwort.status)}`)
    console.log(`  content-type: ${art === '' ? '(keiner)' : art}`)
    console.log(`  cache-control: ${String(antwort.headers.get('cache-control') ?? '(keiner)')}`)
    console.log(`  connection:    ${String(antwort.headers.get('connection') ?? '(keiner)')}`)

    // ---- Den Körper kurz mitlesen ----
    console.log('')
    console.log('== 3. Kommt ein Rahmen? ==')
    let gelesen = ''
    if (antwort.body !== null) {
      const leser = antwort.body.getReader()
      const bis = Date.now() + 4000
      try {
        while (Date.now() < bis) {
          const { value, done } = await Promise.race([
            leser.read(),
            new Promise((f) => setTimeout(() => f({ value: undefined, done: false }), 1000)),
          ])
          if (done) break
          if (value !== undefined) gelesen += new TextDecoder().decode(value)
          if (gelesen.length > 1200) break
        }
      } catch {
        /* Abbruch nach der Zeitgrenze ist erwartet */
      }
      try {
        await leser.cancel()
      } catch {
        /* egal */
      }
    }
    console.log(`  ${String(gelesen.length)} Zeichen gelesen`)
    if (gelesen.length > 0) {
      for (const zeile of gelesen.split('\n').slice(0, 8)) {
        console.log(`    ${zeile.slice(0, 130)}`)
      }
    }

    console.log('')
    console.log('== BEFUND ==')
    const istSse = art.toLowerCase().startsWith('text/event-stream')
    if (antwort.status === 200 && istSse) {
      console.log('  Die Strecke IST BEDIENT: HTTP 200 mit content-type text/event-stream.')
      console.log('  Meine Vermutung aus §8 war FALSCH — `dsh-hmr` ist NICHT ihr Träger.')
      if (gelesen.length === 0) {
        console.log('  Allerdings kam in 4 s KEIN Rahmen: die Strecke ist offen und still.')
        console.log('  Das ist für HMR erwartet — Rahmen entstehen nur bei einer Änderung.')
      }
      process.exitCode = 0
    } else if (antwort.status === 404) {
      console.log('  Die Strecke ist NICHT bedient (404). Meine Vermutung trifft zu.')
      process.exitCode = 1
    } else {
      console.log(`  Unerwartet: HTTP ${String(antwort.status)}, content-type „${art}".`)
      console.log('  Das ist weder „bedient" noch „nicht bedient" — es ist offen.')
      process.exitCode = 2
    }
  } finally {
    kind.kill()
    await new Promise((f) => setTimeout(f, 400))
  }
}

if (import.meta.main === true) await haupt()
