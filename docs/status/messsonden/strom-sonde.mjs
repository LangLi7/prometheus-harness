/**
 * Meßsonde: **trägt unser Host einen Live-Strom?**
 *
 * ## Warum diese Sonde existiert
 *
 * Der Kern bringt einen vollständigen Strom-Stapel mit (`dsh-api-gateway` mit
 * `stream-client`, `stream-server`, `stream-protocol`, `remote-events`), und der
 * Sitzungsvertrag kennt **wiederaufsetzbaren** Verlauf:
 *
 * ```
 * SessionFollowRequest  — mit Eröffnungsrahmen
 * SessionPageRequest    — "Inclusive log cut obtained from the corresponding follow opening frame"
 * SessionPage           — "One contiguous BACKWARDS page of a Session log"
 * ```
 *
 * Und die Strecke ist eine einzige:
 *
 * ```ts
 * export declare const REMOTE_STREAM_MUX_PATH = "/api/remote.mux";
 * // Exact WebSocket route carrying every Typert Remote stream.
 * ```
 *
 * **Alles davon ist gelesen, nicht gemessen.** „Der Kern kann es" ist nicht „unser Host
 * tut es". Diese Sonde verbindet sich wirklich — und mißt, was dabei geschieht.
 *
 * ## Was gemessen wird
 *
 * | Frage | Wie |
 * |---|---|
 * | Nimmt der Host die Aufwertung an? | echte WebSocket-Verbindung auf `/api/remote.mux` |
 * | Was kommt als **Eröffnungsrahmen**? | die erste empfangene Nachricht, im Wortlaut |
 * | Wie lange bis zum ersten Rahmen? | Zeitmessung ab `open` |
 * | Trägt der Rahmen einen **Schnitt** (`throughSeq`)? | ohne ihn ist Verlauf nicht anforderbar |
 * | Was kostet eine **Verlaufsseite**? | `session/page` über HTTP, mit Zeit und Größe |
 *
 * ## Was sie NICHT prüft
 *
 * Ob **unsere Oberfläche** den Strom benutzt. Sie tut es nicht — `apps/web/src` ist ein
 * Gerüst ohne Chat. Diese Sonde mißt die **Fähigkeit des Hosts**, nicht ihren Gebrauch.
 *
 * @module docs/status/messsonden/strom-sonde
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const WURZEL = join(HIER, '..', '..', '..')

const START_GRENZE_MS = 90_000
const RAHMEN_GRENZE_MS = 20_000
const RUNDE_GRENZE_MS = 90_000

export function leseStartzeile(text) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(text)
  if (t === null) return null
  return { port: Number(t[1]), token: t[2] }
}

async function haupt() {
  const portArg = Number(process.argv[2] ?? 3079)
  console.log('Live-Strom — trägt unser Host ihn?')
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
    console.log(`Anmeldung: HTTP ${String(anmeldung.status)}`)

    const ruf = async (methode, args) => {
      const t0 = Date.now()
      const a = await fetch(`http://127.0.0.1:${String(port)}/api/${methode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `strom-${String(Math.random()).slice(2, 8)}`,
          method: methode,
          payload: { args },
        }),
        signal: AbortSignal.timeout(60_000),
      })
      const text = await a.text()
      const ms = Date.now() - t0
      let j = null
      try {
        j = JSON.parse(text)
      } catch {
        /* kein JSON */
      }
      const r = j?.result
      return r?.ok === true
        ? { ok: true, wert: r.value, ms, bytes: text.length }
        : { ok: false, fehler: r?.error, roh: text.slice(0, 300), ms, bytes: text.length }
    }

    // ---- 0. Eine Sitzung mit etwas Verlauf ----
    const s = await ruf('session/create', { request: { cwd: WURZEL } })
    if (s.ok !== true) {
      console.log(`ABBRUCH: session/create — ${JSON.stringify(s.fehler ?? s.roh)}`)
      process.exitCode = 2
      return
    }
    const sid = s.wert.sessionId
    console.log(`Sitzung: ${sid}`)
    await ruf('session/prompt', {
      request: {
        requestId: `strom-${String(Date.now())}`,
        sessionId: sid,
        mode: 'queue',
        content: [{ type: 'text', text: 'Antworte mit genau einem Wort: STROM' }],
      },
    })
    // **Auf die Runde warten — aber ehrlich.** Hier stand eine Abfrage von
    // `session/page` mit `throughSeq: 10**9`. Die schlug **immer** fehl (der Vertrag
    // verlangt den Schnitt aus dem Eröffnungsrahmen), also lief die Schleife die volle
    // Zeitgrenze ab und „wartete" 90 Sekunden auf einen Fehler. Eine Warteschleife, die
    // auf eine ungültige Abfrage prüft, wartet auf nichts.
    await new Promise((f) => setTimeout(f, 15_000))
    console.log('Runde abgesetzt (15 s gewartet — der Verlauf wird unten geprüft)')
    console.log('')

    // ---- 1. Die WebSocket-Strecke ----
    console.log('== 1. Aufwertung auf /api/remote.mux ==')
    const wsUrl = `ws://127.0.0.1:${String(port)}/api/remote.mux`
    const rahmen = []
    let offen = false
    let fehler = null
    /** Der Schnitt aus dem Eröffnungsrahmen des Stroms — **nie erfunden**. */
    let throughSeq = null
    const t0 = Date.now()
    const ws = new WebSocket(wsUrl, { headers: { cookie } })
    const fertig = new Promise((erfuellen) => {
      const uhr = setTimeout(() => erfuellen('zeitgrenze'), RAHMEN_GRENZE_MS)
      ws.addEventListener('open', () => {
        offen = true
        console.log(`  Aufwertung ANGENOMMEN nach ${String(Date.now() - t0)} ms`)
      })
      ws.addEventListener('message', (ereignis) => {
        rahmen.push({ text: String(ereignis.data), ms: Date.now() - t0 })
        if (rahmen.length >= 3) {
          clearTimeout(uhr)
          erfuellen('rahmen')
        }
      })
      ws.addEventListener('error', (e) => {
        fehler = String(e?.message ?? e)
        clearTimeout(uhr)
        erfuellen('fehler')
      })
      ws.addEventListener('close', (e) => {
        if (!offen) {
          fehler = `geschlossen ohne Aufwertung (code ${String(e.code)}${e.reason ? `, ${e.reason}` : ''})`
          clearTimeout(uhr)
          erfuellen('geschlossen')
        }
      })
    })
    const wie = await fertig
    console.log(`  Ergebnis: ${wie}${fehler !== null ? ` — ${fehler}` : ''}`)
    console.log(`  Rahmen empfangen: ${String(rahmen.length)}`)
    for (const r of rahmen.slice(0, 3)) {
      console.log(`    [${String(r.ms)} ms] ${r.text.slice(0, 200)}`)
    }

    // ---- 2. Einen Sitzungsstrom anfordern ----
    // **Der Rahmen ist NICHT der HTTP-Umschlag.** Gemessen im Kern-Client
    // (`dsh-api-gateway/lib/types/client/stream-client.js`):
    //
    //     this.send(socket, { type: 'open',   streamId, endpoint, payload })
    //     this.send(socket, { type: 'item',   streamId, value })
    //     this.send(socket, { type: 'cancel', streamId })
    //     this.send(socket, { type: 'end',    streamId })
    //
    // Mein erster Versuch schickte `{type:'client-request', rpcId, method, payload}` —
    // den Umschlag der HTTP-Strecke. Der Host nahm die Aufwertung an und **antwortete
    // nie**, weil die Nachricht für ihn keine war. Ein Protokoll, das man nicht
    // nachliest, sieht aus wie ein stiller Host.
    if (offen) {
      console.log('')
      console.log('== 2. session/follow über den Strom ==')
      const vorher = rahmen.length
      const t1 = Date.now()
      const streamId = 'sonde-1'
      ws.send(
        JSON.stringify({
          type: 'open',
          streamId,
          endpoint: 'session/follow',
          payload: { args: { request: { address: { kind: 'session', sessionId: sid }, maxMessages: 20 } } },
        }),
      )
      const grenze = Date.now() + RAHMEN_GRENZE_MS
      while (Date.now() < grenze && rahmen.length === vorher) await new Promise((f) => setTimeout(f, 200))
      const neu = rahmen.slice(vorher)
      console.log(`  Rahmen nach der Anforderung: ${String(neu.length)} (nach ${String(Date.now() - t1)} ms)`)
      for (const r of neu.slice(0, 4)) console.log(`    ${r.text.slice(0, 400)}`)
      if (neu.length === 0) {
        console.log('  KEINE Antwort — die Anforderung blieb ohne Rahmen.')
      } else {
        // Den Schnitt aus dem Eröffnungsrahmen ziehen — **nicht erfinden**.
        for (const r of neu) {
          const m = /"throughSeq"\s*:\s*(\d+)/u.exec(r.text)
          if (m !== null) {
            throughSeq = Number(m[1])
            console.log(`  throughSeq aus dem Eröffnungsrahmen: ${String(throughSeq)}`)
            break
          }
        }
      }
    }

    // ---- 3. Verlauf über HTTP (der Weg für „nach dem Neustart") ----
    // **Der Schnitt kommt aus dem Eröffnungsrahmen, nicht aus dem Kopf.** Gelingt der
    // Strom nicht, wird der Schnitt aus dem Vorhandenen geschätzt — und das wird GESAGT.
    console.log('')
    console.log('== 3. session/page — der Verlaufsweg ==')
    if (throughSeq === null) {
      console.log('  Ohne Eröffnungsrahmen gibt es keinen Schnitt. Der Vertrag sagt:')
      console.log('  throughSeq ist „the inclusive log cut OBTAINED FROM the corresponding')
      console.log('  follow opening frame". Er wird NICHT erfunden.')
      console.log('  Diese Sonde probiert deshalb keinen geratenen Wert — sie meldet die Lücke.')
      process.exitCode = offen ? 0 : 1
      ws.close()
      return
    }
    const seite = await ruf('session/page', {
      request: { address: { kind: 'session', sessionId: sid }, throughSeq, maxMessages: 50 },
    })
    if (seite.ok !== true) {
      console.log(`  Fehler: ${JSON.stringify(seite.fehler ?? seite.roh)}`)
    } else {
      const w = seite.wert ?? {}
      const anzahl = Array.isArray(w.records) ? w.records.length : 0
      console.log(`  ${String(anzahl)} Einträge, hasMore=${String(w.hasMore)}, ${String(seite.bytes)} B in ${String(seite.ms)} ms`)
      const seqs = (Array.isArray(w.records) ? w.records : [])
        .map((r) => r?.seq ?? r?.throughSeq ?? r?.event?.seq)
        .filter((x) => typeof x === 'number')
      if (seqs.length > 0) {
        console.log(`  Sequenzbereich: ${String(Math.min(...seqs))} … ${String(Math.max(...seqs))}`)
      }
    }

    console.log('')
    console.log('== BEFUND ==')
    if (offen) {
      console.log('  Der Host nimmt die Live-Aufwertung AN. Der Strom steht.')
    } else {
      console.log('  Der Host nimmt die Live-Aufwertung NICHT an.')
    }
    console.log(`  Verlauf über HTTP: ${seite.ok === true ? 'liefert' : 'liefert NICHT'}.`)
    console.log('')
    console.log('  Diese Sonde prüft den HOST, nicht unsere Oberfläche: apps/web/src ist ein')
    console.log('  Gerüst ohne Chat und benutzt weder Strom noch Verlauf.')
    ws.close()
    process.exitCode = offen ? 0 : 1
  } finally {
    kind.kill()
    await new Promise((f) => setTimeout(f, 400))
  }
}

if (import.meta.main === true) await haupt()
