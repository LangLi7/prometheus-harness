/**
 * Meßsonde: **schickt der Strom Ereignisse von selbst?**
 *
 * ## Warum diese Sonde existiert
 *
 * [live-anbindung.md](../live-anbindung.md) §7 hält als offen fest:
 *
 * > *„Nicht, daß der Strom **von selbst** neue Ereignisse schickt. Immer gemessen wurde der
 * > **Eröffnungsrahmen** — also die Antwort auf eine Anforderung. Daß danach
 * > **unaufgefordert** weitere `item`-Rahmen kommen, ist **nicht** nachgewiesen."*
 *
 * Das ist genau der Nutzen des Live-Wegs: **neue Ereignisse ohne Abfragen**. Ohne diesen
 * Nachweis wäre der Strom nur eine zweite Art, dasselbe abzufragen.
 *
 * ## Der Ablauf, der es entscheidet
 *
 * 1. Strecke aufwerten, `session/follow` senden → **Eröffnungsrahmen** (das ist die
 *    Anforderung, sie zählt **nicht** als unaufgefordert).
 * 2. **Danach** einen Auftrag absetzen — der Lauf geschieht also bei **offenem** Strom.
 * 3. Zählen, was **ohne weitere Anforderung** ankommt.
 *
 * ## Was als „von selbst" zählt — und was nicht
 *
 * Gezählt werden **alle** Rahmen nach dem Eröffnungsrahmen. Wichtig: die Sonde sendet
 * **nichts** mehr, sobald der Auftrag abgesetzt ist. Alles, was danach eintrifft, ist
 * damit **ungerufen**.
 *
 * @module docs/status/messsonden/strom-lauf-sonde
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const WURZEL = join(HIER, '..', '..', '..')

const START_GRENZE_MS = 90_000
const LAUF_MS = 75_000

export function leseStartzeile(text) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(text)
  return t === null ? null : { port: Number(t[1]), token: t[2] }
}

/** Zieht die Rahmenart aus einem `item`-Rahmen, ohne den ganzen Inhalt zu drucken. */
export function rahmenArt(text) {
  try {
    const j = JSON.parse(text)
    if (j.type === 'error') return `error:${String(j.error?.code ?? '?')}`
    if (j.type === 'end') return 'end'
    if (j.type === 'item') {
      const art = j.value?.type
      if (art === 'snapshot') return 'snapshot'
      if (art === 'event') return `event:${String(j.value?.event?.type ?? '?')}`
      return `item:${String(art ?? 'ohne type')}`
    }
    return `rahmen:${String(j.type ?? '?')}`
  } catch {
    return 'unlesbar'
  }
}

async function haupt() {
  const portArg = Number(process.argv[2] ?? 3073)
  console.log('Strom im Lauf — kommen Ereignisse von selbst?')
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

    const ruf = async (methode, args) => {
      const a = await fetch(`http://127.0.0.1:${String(port)}/api/${methode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `lauf-${String(Math.random()).slice(2, 8)}`,
          method: methode,
          payload: { args },
        }),
        signal: AbortSignal.timeout(60_000),
      })
      const text = await a.text()
      let j = null
      try {
        j = JSON.parse(text)
      } catch {
        /* kein JSON */
      }
      const r = j?.result
      return r?.ok === true ? { ok: true, wert: r.value } : { ok: false, fehler: r?.error }
    }

    const s = await ruf('session/create', { request: { cwd: WURZEL } })
    if (s.ok !== true) {
      console.log(`ABBRUCH: session/create — ${JSON.stringify(s.fehler)}`)
      process.exitCode = 2
      return
    }
    const sid = s.wert.sessionId
    console.log(`Sitzung: ${sid}`)

    // ---- Strecke öffnen und folgen ----
    const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/api/remote.mux`, { headers: { cookie } })
    const rahmen = []
    let offen = false
    await new Promise((erfuellen) => {
      const uhr = setTimeout(erfuellen, 8000)
      ws.addEventListener('open', () => {
        offen = true
        clearTimeout(uhr)
        erfuellen()
      })
      ws.addEventListener('error', () => {
        clearTimeout(uhr)
        erfuellen()
      })
    })
    if (!offen) {
      console.log('ABBRUCH: Aufwertung nicht angenommen')
      process.exitCode = 2
      return
    }
    console.log('Strecke aufgewertet')
    ws.addEventListener('message', (e) => {
      rahmen.push({ text: String(e.data), ms: Date.now() })
    })

    ws.send(
      JSON.stringify({
        type: 'open',
        streamId: 'lauf-1',
        endpoint: 'session/follow',
        payload: { args: { request: { address: { kind: 'session', sessionId: sid }, maxMessages: 30 } } },
      }),
    )
    const bisSchnapp = Date.now() + 10_000
    while (Date.now() < bisSchnapp && !rahmen.some((r) => rahmenArt(r.text) === 'snapshot')) {
      await new Promise((f) => setTimeout(f, 100))
    }
    const schnapp = rahmen.find((r) => rahmenArt(r.text) === 'snapshot')
    if (schnapp === undefined) {
      console.log('ABBRUCH: kein Eröffnungsrahmen')
      ws.close()
      process.exitCode = 1
      return
    }
    console.log(`Eröffnungsrahmen nach ${String(schnapp.ms - (rahmen[0]?.ms ?? schnapp.ms))} ms`)
    console.log('')

    // ---- Ab hier sendet die Sonde NICHTS mehr außer dem Auftrag ----
    const vorher = rahmen.length
    const tAuftrag = Date.now()
    console.log('== Auftrag abgesetzt — der Strom ist OFFEN ==')
    const p = await ruf('session/prompt', {
      request: {
        requestId: `lauf-${String(Date.now())}`,
        sessionId: sid,
        mode: 'queue',
        content: [
          {
            type: 'text',
            text: 'Führe genau einen Befehl aus: echo LAUF. Antworte danach mit einem Wort.',
          },
        ],
      },
    })
    console.log(`  session/prompt angenommen: ${p.ok === true ? 'ja' : JSON.stringify(p.fehler)}`)
    console.log(`  Ab jetzt sendet die Sonde NICHTS mehr. Alles Folgende ist UNGERUFEN.`)
    console.log('')

    const bis = Date.now() + LAUF_MS
    let letzterStand = -1
    while (Date.now() < bis) {
      await new Promise((f) => setTimeout(f, 500))
      if (rahmen.length !== letzterStand) {
        letzterStand = rahmen.length
        const neu = rahmen.length - vorher
        console.log(`  [${String(Date.now() - tAuftrag).padStart(6)} ms] ${String(neu)} ungerufene Rahmen`)
      }
    }

    // ---- Auswertung ----
    const ungerufene = rahmen.slice(vorher)
    const arten = new Map()
    for (const r of ungerufene) {
      const a = rahmenArt(r.text)
      arten.set(a, (arten.get(a) ?? 0) + 1)
    }

    console.log('')
    console.log('== Was ungerufen ankam ==')
    console.log(`  Rahmen gesamt nach dem Auftrag: ${String(ungerufene.length)}`)
    if (ungerufene.length > 0) {
      const erster = ungerufene[0]
      console.log(`  erster ungerufener Rahmen nach ${String(erster.ms - tAuftrag)} ms`)
    }
    for (const [a, n] of [...arten.entries()].sort((x, y) => y[1] - x[1])) {
      console.log(`    ${String(n).padStart(4)}x  ${a}`)
    }

    console.log('')
    console.log('== BEFUND ==')
    const ereignisse = [...arten.entries()].filter(([a]) => a.startsWith('event:'))
    if (ungerufene.length === 0) {
      console.log('  KEINE ungerufenen Rahmen. Der Strom meldet von selbst NICHTS.')
      console.log('  Dann ist er kein Live-Weg, sondern eine zweite Art der Abfrage —')
      console.log('  und der Nutzen „ohne Abfragen" wäre widerlegt.')
      process.exitCode = 1
    } else if (ereignisse.length === 0) {
      console.log(`  ${String(ungerufene.length)} ungerufene Rahmen, aber KEINE Ereignisse:`)
      console.log('  nur Hüllen (end/error). Das trägt keinen Verlauf.')
      process.exitCode = 1
    } else {
      console.log(`  Der Strom SCHICKT VON SELBST: ${String(ereignisse.reduce((s2, [, n]) => s2 + n, 0))} Ereignisrahmen`)
      console.log(`  in ${String(arten.size)} Arten, ohne eine einzige Abfrage.`)
      console.log('  Damit ist der Live-Weg belegt — und der Nutzen „ohne Abfragen" gemessen.')
      process.exitCode = 0
    }
    ws.close()
  } finally {
    kind.kill()
    await new Promise((f) => setTimeout(f, 400))
  }
}

if (import.meta.main === true) await haupt()
