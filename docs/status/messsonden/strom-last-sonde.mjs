/**
 * Meßsonde: **trägt EINE Strecke mehrere Sitzungen gleichzeitig?**
 *
 * ## Warum diese Sonde existiert
 *
 * [live-anbindung.md](../live-anbindung.md) §9 läßt genau einen meßbaren Punkt offen:
 *
 * > *„Der Strom unter **Last** (viele Sitzungen gleichzeitig, viele Rahmen je Sekunde)."*
 *
 * Und §8 behauptet den architektonischen Vorteil, ohne ihn zu belegen:
 *
 * > *„Sitzungsströme sind **bidirektional** … und **multiplex** — eine Strecke für alle
 * > Ströme."*
 *
 * **Bündelung ist eine Behauptung, bis sie gemessen ist.** Diese Sonde öffnet **eine**
 * WebSocket-Strecke, legt **mehrere** Sitzungen an, folgt **allen auf derselben Strecke**
 * und setzt dann in allen einen Auftrag ab.
 *
 * ## Was gemessen wird
 *
 * | Frage | Wie |
 * |---|---|
 * | Nimmt **eine** Strecke **N** Ströme an? | je Sitzung ein `open` mit eigener `streamId` |
 * | Liefert jeder Strom seinen Eröffnungsrahmen? | Zählung je `streamId` |
 * | Kommen die Ereignisse **nebeneinander**? | Rahmen je Strom nach dem Absetzen |
 * | Wie lange bis zum **ersten** Rahmen je Strom? | Zeitmessung |
 * | Wie groß ist die **größte Lücke** zwischen zwei Rahmen? | Zeitdifferenz |
 *
 * ## Was sie NICHT prüft
 *
 * Ob die **Reihenfolge** über Ströme hinweg stimmt — je Strom ist sie zugesichert, über
 * Ströme hinweg ist sie bedeutungslos. Und keine Dauerlast: N Sitzungen **einmal**, nicht
 * N über Minuten.
 *
 * @module docs/status/messsonden/strom-last-sonde
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const WURZEL = join(HIER, '..', '..', '..')

const START_GRENZE_MS = 90_000
const SAMMEL_MS = 60_000

export function leseStartzeile(text) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(text)
  return t === null ? null : { port: Number(t[1]), token: t[2] }
}

/** Die Art eines Rahmens, ohne den ganzen Inhalt zu drucken. */
export function rahmenArt(text) {
  try {
    const j = JSON.parse(text)
    if (j.type === 'error') return `error:${String(j.error?.code ?? '?')}`
    if (j.type === 'end') return 'end'
    if (j.type === 'item') {
      const a = j.value?.type
      if (a === 'snapshot') return 'snapshot'
      if (a === 'event') return `event:${String(j.value?.event?.type ?? '?')}`
      return `item:${String(a ?? '?')}`
    }
    return `rahmen:${String(j.type ?? '?')}`
  } catch {
    return 'unlesbar'
  }
}

async function haupt() {
  const portArg = Number(process.argv[2] ?? 3068)
  const anzahl = Number(process.argv[3] ?? 4)
  console.log(`Bündelung — trägt EINE Strecke ${String(anzahl)} Sitzungen gleichzeitig?`)
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
          rpcId: `last-${String(Math.random()).slice(2, 8)}`,
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

    // ---- N Sitzungen anlegen ----
    const sitzungen = []
    for (let i = 0; i < anzahl; i++) {
      const s = await ruf('session/create', { request: { cwd: WURZEL } })
      if (s.ok !== true) {
        console.log(`ABBRUCH: session/create Nr. ${String(i + 1)} — ${JSON.stringify(s.fehler)}`)
        process.exitCode = 2
        return
      }
      sitzungen.push({ nr: i + 1, sid: s.wert.sessionId, strom: `strom-${String(i + 1)}` })
    }
    console.log(`${String(sitzungen.length)} Sitzungen angelegt`)

    // ---- EINE Strecke, N Ströme ----
    const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/api/remote.mux`, { headers: { cookie } })
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
    console.log('EINE Strecke aufgewertet — alle Ströme laufen über sie')
    console.log('')

    /** Je Strom: Rahmen mit Zeitstempel. */
    const jeStrom = new Map()
    for (const s of sitzungen) jeStrom.set(s.strom, [])
    ws.addEventListener('message', (e) => {
      const text = String(e.data)
      let stromId = null
      try {
        stromId = JSON.parse(text)?.streamId ?? null
      } catch {
        /* unlesbar */
      }
      const schluessel = stromId ?? '(ohne streamId)'
      const liste = jeStrom.get(schluessel) ?? []
      liste.push({ text, ms: Date.now() })
      jeStrom.set(schluessel, liste)
    })

    // ---- Für jede Sitzung einen Strom auf DERSELBEN Strecke öffnen ----
    for (const s of sitzungen) {
      ws.send(
        JSON.stringify({
          type: 'open',
          streamId: s.strom,
          endpoint: 'session/follow',
          payload: { args: { request: { address: { kind: 'session', sessionId: s.sid }, maxMessages: 10 } } },
        }),
      )
    }
    // Auf die Eröffnungsrahmen warten.
    const bisSchnapp = Date.now() + 15_000
    while (
      Date.now() < bisSchnapp &&
      sitzungen.some((s) => !(jeStrom.get(s.strom) ?? []).some((r) => rahmenArt(r.text) === 'snapshot'))
    ) {
      await new Promise((f) => setTimeout(f, 200))
    }

    console.log('== 1. Eröffnungsrahmen je Strom ==')
    let mitSchnapp = 0
    for (const s of sitzungen) {
      const rahmen = jeStrom.get(s.strom) ?? []
      const schnapp = rahmen.find((r) => rahmenArt(r.text) === 'snapshot')
      if (schnapp !== undefined) mitSchnapp += 1
      console.log(`  ${s.strom.padEnd(9)} ${String(rahmen.length).padStart(3)} Rahmen   ${schnapp === undefined ? 'KEIN Eröffnungsrahmen' : 'Eröffnungsrahmen da'}`)
    }
    console.log(`  ${String(mitSchnapp)} von ${String(sitzungen.length)} Strömen tragen`)

    // ---- Alle Aufträge absetzen — ab hier sendet die Sonde nichts mehr ----
    console.log('')
    console.log('== 2. Auftrag in ALLEN Sitzungen — ab hier sendet die Sonde nichts ==')
    const vorher = new Map()
    for (const s of sitzungen) vorher.set(s.strom, (jeStrom.get(s.strom) ?? []).length)
    const tAuftrag = Date.now()
    for (const s of sitzungen) {
      await ruf('session/prompt', {
        request: {
          requestId: `last-${String(Date.now())}-${String(s.nr)}`,
          sessionId: s.sid,
          mode: 'queue',
          content: [{ type: 'text', text: `Führe genau einen Befehl aus: echo SITZUNG-${String(s.nr)}. Antworte danach mit einem Wort.` }],
        },
      })
    }
    console.log(`  ${String(sitzungen.length)} Aufträge abgesetzt in ${String(Date.now() - tAuftrag)} ms`)
    console.log('')

    // ---- Sammeln ----
    const bis = Date.now() + SAMMEL_MS
    let letzterStand = -1
    while (Date.now() < bis) {
      await new Promise((f) => setTimeout(f, 1000))
      const gesamt = [...jeStrom.values()].reduce((s2, l) => s2 + l.length, 0)
      if (gesamt !== letzterStand) {
        letzterStand = gesamt
        console.log(`  [${String(Date.now() - tAuftrag).padStart(6)} ms] ${String(gesamt)} Rahmen gesamt`)
      }
    }

    // ---- Auswertung ----
    console.log('')
    console.log('== 3. Was je Strom ankam ==')
    let ereignisGesamt = 0
    let ohneEreignis = 0
    let zuEndeZahl = 0
    const ohneEnde = []
    const luecken = []
    for (const s of sitzungen) {
      const alle = jeStrom.get(s.strom) ?? []
      const nachher = alle.slice(vorher.get(s.strom) ?? 0)
      const ereignisse = nachher.filter((r) => rahmenArt(r.text).startsWith('event:'))
      ereignisGesamt += ereignisse.length
      if (ereignisse.length === 0) ohneEreignis += 1
      const ersterNach = ereignisse[0] === undefined ? null : ereignisse[0].ms - tAuftrag
      // **Kam die Runde zum Ende?** Die Zahl der Ereignisse schwankt je Strom — und das
      // kann zwei Ursachen haben: ein kürzerer Lauf ODER ein Verlust. Ohne diese Prüfung
      // wäre jede Deutung eine Behauptung. `turn/end` unterscheidet die beiden Fälle.
      const zuEnde = nachher.some((r) => rahmenArt(r.text) === 'event:turn/end')
      if (zuEnde) zuEndeZahl += 1
      else ohneEnde.push(s.strom)
      // Größte Lücke zwischen zwei aufeinanderfolgenden Rahmen DIESES Stroms
      let maxLuecke = 0
      for (let i = 1; i < alle.length; i++) {
        const d = (alle[i]?.ms ?? 0) - (alle[i - 1]?.ms ?? 0)
        if (d > maxLuecke) maxLuecke = d
      }
      luecken.push(maxLuecke)
      console.log(
        `  ${s.strom.padEnd(9)} ${String(nachher.length).padStart(3)} ungerufen, davon ${String(ereignisse.length).padStart(2)} Ereignisse` +
          `   erster nach ${ersterNach === null ? '--' : `${String(ersterNach)} ms`}` +
          `   größte Lücke ${String(maxLuecke)} ms   ${zuEnde ? 'turn/end da' : 'OHNE turn/end'}`,
      )
    }
    console.log('')
    console.log(`  Runden zu Ende: ${String(zuEndeZahl)} von ${String(sitzungen.length)}`)
    if (ohneEnde.length > 0) {
      console.log(`  ohne turn/end: ${ohneEnde.join(', ')}`)
      console.log('  -> Dort ist die Zahl der Ereignisse KEIN Verlust, sondern ein offener Lauf.')
      console.log('     Ob die Strecke etwas verloren hat, sagt das NICHT.')
    }

    console.log('')
    console.log('== BEFUND ==')
    const alleTragen = ohneEreignis === 0
    if (mitSchnapp < sitzungen.length) {
      console.log(`  Nur ${String(mitSchnapp)} von ${String(sitzungen.length)} Strömen lieferten einen Eröffnungsrahmen.`)
      console.log('  Die Bündelung ist damit NICHT für alle Ströme belegt.')
      process.exitCode = 1
    } else if (!alleTragen) {
      console.log(`  Alle ${String(sitzungen.length)} Ströme trugen einen Eröffnungsrahmen, aber ${String(ohneEreignis)} ohne Ereignisse.`)
      process.exitCode = 1
    } else {
      console.log(`  EINE Strecke trug ${String(sitzungen.length)} Ströme GLEICHZEITIG.`)
      console.log(`  Jeder Strom lieferte Ereignisse ohne eine einzige Abfrage: ${String(ereignisGesamt)} Rahmen gesamt.`)
      console.log(`  Damit ist die Bündelung GEMESSEN und nicht mehr nur behauptet.`)
      process.exitCode = 0
    }
    ws.close()
  } finally {
    kind.kill()
    await new Promise((f) => setTimeout(f, 400))
  }
}

if (import.meta.main === true) await haupt()
