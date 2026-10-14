/**
 * Meßsonde: **trägt die Strecke einen UNTERAGENTEN-Strom?**
 *
 * ## Warum diese Sonde existiert
 *
 * [live-anbindung.md](../live-anbindung.md) hat gemessen, daß unser Host den Live-Strom
 * trägt: Aufwertung nach 3 ms, Eröffnungsrahmen nach 201 ms, Verlauf in 9 ms. Dort steht
 * aber auch ausdrücklich als **nicht gemessen**:
 *
 * > *„Nicht, daß ein **Unteragenten**-Strom schon einmal gelaufen ist. Der Adresstyp ist
 * > gelesen, der Weg ist nicht gefahren."*
 *
 * Der Adresstyp kennt ihn:
 *
 * ```ts
 * { kind: 'subagent'; parentSessionId: SessionId; childSessionId: SessionId;
 *   mode: 'one-shot' | 'continuable' | 'unknown' }
 * ```
 *
 * **Diese Sonde fährt ihn.** Sie erzeugt wirklich einen Unteragenten und folgt ihm.
 *
 * ## Der `mode` wird NICHT geraten
 *
 * Der Vertrag nennt drei Werte. Welcher für einen über das Werkzeug `subagent` erzeugten
 * Lauf gilt, steht **nirgends geschrieben** — also wird er **erfragt**: die Sonde probiert
 * die Werte der Reihe nach durch und **nennt**, welcher angenommen wurde. Bleibt keiner,
 * steht das als Befund da, nicht als stiller Fehlschlag.
 *
 * @module docs/status/messsonden/strom-subagent-sonde
 */

import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const WURZEL = join(HIER, '..', '..', '..')
const HOME = join(WURZEL, '.pmh-build', 'harness-home')

const START_GRENZE_MS = 90_000
const RAHMEN_GRENZE_MS = 25_000
const KIND_GRENZE_MS = 120_000

export function leseStartzeile(text) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(text)
  return t === null ? null : { port: Number(t[1]), token: t[2] }
}

/** Findet die Sitzungsköpfe aller Protokolle — für die Suche nach dem Kind. */
export function leseSitzungskoepfe(home) {
  const raus = []
  const gehe = (dir) => {
    let eintraege
    try {
      eintraege = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of eintraege) {
      const p = join(dir, e.name)
      if (e.isDirectory()) gehe(p)
      else if (e.name.endsWith('.jsonl.zstd')) {
        try {
          const text = new TextDecoder().decode(Bun.zstdDecompressSync(readFileSync(p)))
          const erste = text.split('\n').find((z) => z.includes('"type":"session"'))
          if (erste !== undefined) raus.push(JSON.parse(erste))
        } catch {
          /* unvollständig */
        }
      }
    }
  }
  gehe(home)
  return raus
}

async function haupt() {
  const portArg = Number(process.argv[2] ?? 3075)
  console.log('Unteragenten-Strom — trägt die Strecke ihn?')
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
          rpcId: `sub-${String(Math.random()).slice(2, 8)}`,
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

    // ---- 1. Eine Wurzelsitzung und ein Unteragent darin ----
    const s = await ruf('session/create', { request: { cwd: WURZEL } })
    if (s.ok !== true) {
      console.log(`ABBRUCH: session/create — ${JSON.stringify(s.fehler)}`)
      process.exitCode = 2
      return
    }
    const eltern = s.wert.sessionId
    console.log(`Wurzelsitzung: ${eltern}`)

    const vorher = new Set(leseSitzungskoepfe(HOME).map((k) => String(k.id)))
    await ruf('session/prompt', {
      request: {
        requestId: `sub-${String(Date.now())}`,
        sessionId: eltern,
        mode: 'queue',
        content: [
          {
            type: 'text',
            text: 'Rufe jetzt genau einmal das Werkzeug subagent auf. Auftrag an den Unteragenten: "Antworte mit genau einem Wort: KIND". Danach antworte selbst mit einem Wort.',
          },
        ],
      },
    })
    console.log('Auftrag abgesetzt — warte auf den Unteragenten …')

    let kindId = null
    let kindKopf = null
    const grenze = Date.now() + KIND_GRENZE_MS
    while (Date.now() < grenze && kindId === null) {
      await new Promise((f) => setTimeout(f, 1000))
      for (const k of leseSitzungskoepfe(HOME)) {
        const id = String(k.id)
        if (vorher.has(id)) continue
        // Ein Unteragent hat einen Elternbezug — daran ist er zu erkennen.
        if (k.parentSession !== undefined && String(k.parentSession) === eltern) {
          kindId = id
          kindKopf = k
          break
        }
      }
    }

    if (kindId === null) {
      console.log('')
      console.log('KEIN Unteragent gefunden — die Sonde hat nichts zu folgen.')
      console.log('Das kann heißen: das Modell rief das Werkzeug nicht, oder der Lauf scheiterte.')
      console.log('Ein „kein Kind" ist KEIN Beweis, daß der Strom es nicht trägt.')
      process.exitCode = 1
      return
    }
    console.log(`Unteragent: ${kindId}`)
    console.log(`  Herkunft: ${String(kindKopf.origin)}   Tiefe: ${String(kindKopf.delegationDepth)}`)
    console.log(`  Eltern:   ${String(kindKopf.parentSession)}`)
    console.log('')

    // ---- 2. Die Strecke öffnen ----
    const wsUrl = `ws://127.0.0.1:${String(port)}/api/remote.mux`
    const rahmen = []
    let offen = false
    const ws = new WebSocket(wsUrl, { headers: { cookie } })
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
      console.log('ABBRUCH: die Aufwertung wurde nicht angenommen')
      process.exitCode = 2
      return
    }
    console.log('Strema aufgewertet')
    ws.addEventListener('message', (e) => rahmen.push(String(e.data)))

    // ---- 3. Den Unteragenten über die Strecke folgen ----
    // **Der `mode` wird erfragt, nicht geraten.** Drei Werte nennt der Vertrag; welcher
    // für diesen Lauf gilt, steht nirgends.
    console.log('')
    console.log('== session/follow mit kind=subagent ==')
    const modi = ['continuable', 'one-shot', 'unknown']
    let erfolgreich = null
    for (const mode of modi) {
      const vorherAnzahl = rahmen.length
      const id = `sub-${mode}`
      ws.send(
        JSON.stringify({
          type: 'open',
          streamId: id,
          endpoint: 'session/follow',
          payload: {
            args: {
              request: {
                address: {
                  kind: 'subagent',
                  parentSessionId: eltern,
                  childSessionId: kindId,
                  mode,
                },
                maxMessages: 20,
              },
            },
          },
        }),
      )
      const bis = Date.now() + 6000
      while (Date.now() < bis && rahmen.length === vorherAnzahl) await new Promise((f) => setTimeout(f, 200))
      const neu = rahmen.slice(vorherAnzahl)
      const text = neu.map((r) => r).join(' ')
      const fehler = /"type":"error"/u.test(text)
      const schnappschuss = /"type":"snapshot"/u.test(text)
      console.log(`  mode=${mode.padEnd(12)} -> ${String(neu.length)} Rahmen, ${schnappschuss ? 'SCHNAPPSCHUSS' : fehler ? 'FEHLER' : 'nichts'}`)
      if (neu.length > 0) {
        const erste = neu[0] ?? ''
        console.log(`      ${erste.slice(0, 300)}`)
      }
      if (schnappschuss) {
        erfolgreich = mode
        break
      }
    }

    console.log('')
    console.log('== BEFUND ==')
    if (erfolgreich === null) {
      console.log('  KEIN mode wurde angenommen. Der Unteragenten-Strom ist damit NICHT belegt.')
      console.log('  Die Antworten oben nennen den Grund im Wortlaut.')
      process.exitCode = 1
    } else {
      console.log(`  Die Strecke TRÄGT den Unteragenten-Strom. Angenommener mode: '${erfolgreich}'`)
      console.log(`  Adresse: { kind:'subagent', parentSessionId:'${eltern.slice(0, 20)}…',`)
      console.log(`             childSessionId:'${kindId.slice(0, 20)}…', mode:'${erfolgreich}' }`)

      // ---------------------------------------------------------------------
      // **Die Gegenprobe: prüft der Host `mode` überhaupt?**
      // ---------------------------------------------------------------------
      // Die Schleife oben bricht beim **ersten** Erfolg ab — sie belegt damit nur, daß
      // `continuable` geht, **nicht**, daß die anderen scheitern. Ein Feld, das niemand
      // prüft, ist eine Behauptung im Vertrag ohne Deckung. Also wird ein Wert probiert,
      // der für einen über das Werkzeug erzeugten Lauf **falsch** ist.
      console.log('')
      console.log('  Gegenprobe: wird ein FALSCHER mode abgewiesen?')
      const vorherAnzahl = rahmen.length
      ws.send(
        JSON.stringify({
          type: 'open',
          streamId: 'gegenprobe',
          endpoint: 'session/follow',
          payload: {
            args: {
              request: {
                address: {
                  kind: 'subagent',
                  parentSessionId: eltern,
                  childSessionId: kindId,
                  mode: 'one-shot',
                },
                maxMessages: 5,
              },
            },
          },
        }),
      )
      const bis = Date.now() + 6000
      while (Date.now() < bis && rahmen.length === vorherAnzahl) await new Promise((f) => setTimeout(f, 200))
      const gegen = rahmen.slice(vorherAnzahl).join(' ')
      if (gegen === '') {
        console.log("    mode='one-shot' -> KEINE Antwort (unentschieden)")
      } else if (/"type":"snapshot"/u.test(gegen)) {
        console.log("    mode='one-shot' -> ebenfalls SCHNAPPSCHUSS")
        console.log('    BEFUND: der Host prüft `mode` NICHT. Die Adresse führt das Feld,')
        console.log('    aber jeder Wert öffnet denselben Strom. Wer `mode` auswertet,')
        console.log('    liest eine Angabe, die niemand durchsetzt.')
      } else {
        const m = /"message":"([^"]{0,200})"/u.exec(gegen)
        console.log(`    mode='one-shot' -> ABGEWIESEN: ${m?.[1] ?? gegen.slice(0, 200)}`)
        console.log('    Der Host prüft `mode` also. `continuable` ist der gültige Wert für')
        console.log('    einen über das Werkzeug erzeugten Lauf.')
      }
      // Den Schnitt aus dem Eröffnungsrahmen ziehen und den Verlauf holen.
      const alle = rahmen.join(' ')
      const m = /"throughSeq"\s*:\s*(\d+)/u.exec(alle)
      if (m !== null) {
        console.log(`  throughSeq aus dem Rahmen: ${String(m[1])}`)
        const seite = await ruf('session/page', {
          request: {
            address: { kind: 'subagent', parentSessionId: eltern, childSessionId: kindId, mode: erfolgreich },
            throughSeq: Number(m[1]),
            maxMessages: 50,
          },
        })
        if (seite.ok === true) {
          const w = seite.wert ?? {}
          const anzahl = Array.isArray(w.records) ? w.records.length : 0
          console.log(`  session/page über die Unteragenten-Adresse: ${String(anzahl)} Einträge, hasMore=${String(w.hasMore)}`)
        } else {
          console.log(`  session/page scheiterte: ${JSON.stringify(seite.fehler)}`)
        }
      }
      process.exitCode = 0
    }
    ws.close()
  } finally {
    kind.kill()
    await new Promise((f) => setTimeout(f, 400))
  }
}

if (import.meta.main === true) await haupt()
