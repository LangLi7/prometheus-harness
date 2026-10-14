/**
 * Meßsonde: **Verdichtung** — läuft sie, wenn man sie anfordert?
 *
 * ## Warum diese Sonde existiert
 *
 * Die Plugin-Inventur hat belegt, daß die Verdichtung **komponiert** ist:
 * `dsh-compaction-basic`, `dsh-command-compact` und
 * `dsh-compaction-tool-result-pruner` stehen im Standard-Preset auf
 * `enabled=true, phase=active`. **Aktiv heißt eingehängt, nicht wirksam.** Keine
 * Messung zeigte bisher, daß die Verdichtung **auslöst**.
 *
 * Der naheliegende Weg wäre eine **lange** Sitzung, bis der Kontextdruck die
 * Verdichtung von selbst auslöst. Der ist teuer, langsam und schlecht
 * wiederholbar. Es gibt einen besseren: den **Befehl** `/compact`.
 *
 * ## Der Meßweg
 *
 * `dsh-command-compact` registriert `/compact` „für jeden komponierten
 * Mensch-Befehl-Adapter" über die verdichtungsunabhängige Naht. Der Kern bietet
 * dazu zwei Remotes:
 *
 * ```
 * id: '@deepseek-ai/dsh-commands#commands/list'
 * parameters: [ { name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent' } ]
 *
 * id: '@deepseek-ai/dsh-commands#commands/execute'
 * parameters: [ { name: 'agent', wire: 'agentId', source: 'lookup' },
 *               { name: 'line',  wire: 'line',  source: 'json' },
 *               { name: 'submittedAttachments', wire: '…', source: 'json' } ]
 * ```
 *
 * **Beide Methoden sind `scope: { context: 'agent', wire: 'agentId' }`** — die
 * Sitzung ist also Teil des Arguments, nicht des Pfades. Gemessen: der Pfad bleibt
 * `commands/list`, der Bereich steht in `payload.args.agentId`.
 *
 * ## Wie die Form gefunden wurde — der Server als Auskunft
 *
 * Geraten habe ich **nicht**. Vier Formen wurden durchprobiert, und der Server hat
 * jede abgelehnt **mit Begründung**:
 *
 * ```
 * args:{agent: …}          -> missing "agentId"; unexpected "agent"
 * method:'agent:commands/list' -> HTTP 404 "not found"
 * args:{…, scope:{…}}      -> unexpected "scope"
 * args:{agentId: …}        -> OK
 * ```
 *
 * Das ist dieselbe Methode wie in `api-nachweis.md` §2: *jede Fehlermeldung war
 * die nächste Auskunft*.
 *
 * ## Was diese Sonde belegt — und was nicht
 *
 * Sie belegt, daß der **Befehl** angenommen wird und was er **zurückmeldet**.
 * Sie belegt **nicht**, daß die Verdichtung bei **Kontextdruck** von selbst
 * auslöst — das ist ein anderer Vorgang und weiterhin ungemessen.
 *
 * @module docs/status/messsonden/verdichtung-sonde
 */

import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const WURZEL = join(HIER, '..', '..', '..')
const HOME = join(WURZEL, '.pmh-build', 'harness-home')

const PORT = Number(process.argv[2] ?? 3092)
const START_GRENZE_MS = 90_000
const TURN_GRENZE_MS = 120_000

/** Ereignisarten, die eine Verdichtung anzeigen könnten — bewußt weit gefaßt. */
export const VERDICHTUNGS_MUSTER = /compact|prune|summar|condense|truncat/i

/** Zieht Port und Token aus einer Host-Zeile; der Token wird nie ausgegeben. */
export function leseStartzeile(zeile) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(zeile)
  if (t === null) return null
  return { port: Number(t[1]), token: t[2] }
}

/** Findet das Protokoll **einer** Sitzung. */
export function findeLog(home, sessionId) {
  const kurz = sessionId.replace(/^session-/u, '')
  const treffer = []
  const gehe = (d) => {
    let e
    try {
      e = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const x of e) {
      const p = join(d, x.name)
      if (x.isDirectory()) {
        if (x.name.includes(kurz)) treffer.push(p)
        gehe(p)
      }
    }
  }
  gehe(home)
  if (treffer.length === 0) return null
  const datei = join(treffer[0], 'session.v4.jsonl.zstd')
  try {
    statSync(datei)
    return datei
  } catch {
    return null
  }
}

/** Liest die Ereignisarten eines Protokolls. */
export function leseEreignisse(pfad) {
  const text = new TextDecoder().decode(Bun.zstdDecompressSync(readFileSync(pfad)))
  const arten = new Map()
  const verdichtung = []
  let gesamt = 0
  for (const zeile of text.split('\n')) {
    if (zeile.trim() === '') continue
    let ev
    try {
      ev = JSON.parse(zeile)
    } catch {
      continue
    }
    gesamt += 1
    const t = String(ev.type ?? '(ohne type)')
    arten.set(t, (arten.get(t) ?? 0) + 1)
    if (VERDICHTUNGS_MUSTER.test(t)) verdichtung.push({ type: t, seq: ev.seq, data: ev.data })
  }
  return { arten, gesamt, verdichtung }
}

async function warteAufLog(sessionId, grenzeMs) {
  const ende = Date.now() + grenzeMs
  while (Date.now() < ende) {
    const p = findeLog(HOME, sessionId)
    if (p !== null) return p
    await new Promise((f) => setTimeout(f, 200))
  }
  return null
}

async function haupt() {
  console.log('Verdichtung — läuft sie, wenn man sie anfordert?')
  console.log('')

  const kind = spawn(process.execPath, ['scripts/start.mjs', '--port', String(PORT), '--no-go'], {
    cwd: WURZEL,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let token = ''
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
      console.log(`ABBRUCH: keine Startzeile binnen ${String(START_GRENZE_MS)} ms`)
      process.exitCode = 2
      return
    }
    token = start.token
    const port = start.port
    console.log(`Host auf Port ${String(port)}`)

    const anmeldung = await fetch(`http://127.0.0.1:${String(port)}/?token=${token}`, { redirect: 'manual' })
    const cookie = (anmeldung.headers.get('set-cookie') ?? '').split(';')[0]
    console.log(`Anmeldung: HTTP ${String(anmeldung.status)}`)

    const ruf = async (methode, args) => {
      const a = await fetch(`http://127.0.0.1:${String(port)}/api/${methode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `sonde-${String(Math.random()).slice(2, 8)}`,
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
      if (r?.ok === true) return { ok: true, wert: r.value }
      return { ok: false, status: a.status, fehler: r?.error, roh: text.slice(0, 300) }
    }

    // 1. Sitzung
    const s = await ruf('session/create', { request: { cwd: WURZEL } })
    if (s.ok !== true) {
      console.log(`ABBRUCH: session/create scheiterte — ${JSON.stringify(s.fehler ?? s.roh)}`)
      process.exitCode = 2
      return
    }
    const sid = s.wert.sessionId
    console.log(`Sitzung: ${sid}`)

    // 2. Befehlsliste — steht /compact überhaupt zur Verfügung?
    const liste = await ruf('commands/list', { agentId: sid })
    if (liste.ok !== true) {
      console.log(`ABBRUCH: commands/list scheiterte — ${JSON.stringify(liste.fehler ?? liste.roh)}`)
      process.exitCode = 2
      return
    }
    const befehle = Array.isArray(liste.wert) ? liste.wert : []
    console.log('')
    console.log(`Befehle im Host: ${String(befehle.length)}`)
    for (const b of befehle) {
      const quelle = typeof b.definitionId === 'string' ? `  (${b.definitionId})` : ''
      console.log(`  ${String(b.name).padEnd(14)} ${String(b.description).slice(0, 62)}${quelle}`)
    }
    const hatCompact = befehle.some((b) => b.name === 'compact')
    console.log('')
    console.log(`/compact vorhanden: ${hatCompact ? 'JA' : 'NEIN'}`)
    if (!hatCompact) {
      console.log('ABBRUCH: ohne /compact ist diese Sonde gegenstandslos.')
      process.exitCode = 1
      return
    }

    // 3. Eine winzige Runde, damit es überhaupt Verlauf gibt.
    const p = await ruf('session/prompt', {
      request: {
        requestId: `sonde-${String(Date.now())}`,
        sessionId: sid,
        mode: 'queue',
        content: [{ type: 'text', text: 'Antworte mit genau einem Wort: HALLO' }],
      },
    })
    console.log(`session/prompt angenommen: ${p.ok === true ? 'ja' : JSON.stringify(p.fehler ?? p.roh)}`)

    const logPfad = await warteAufLog(sid, 30_000)
    if (logPfad === null) {
      console.log('ABBRUCH: kein Sitzungsprotokoll gefunden — ohne Protokoll ist nichts nachweisbar.')
      process.exitCode = 2
      return
    }

    // Auf das Ende der Runde warten — nicht auf die Zeit hoffen.
    const ende = Date.now() + TURN_GRENZE_MS
    let vorher = { arten: new Map(), gesamt: 0 }
    while (Date.now() < ende) {
      vorher = leseEreignisse(logPfad)
      if (vorher.arten.has('turn/end')) break
      await new Promise((f) => setTimeout(f, 500))
    }
    console.log(`Runde beendet: ${vorher.arten.has('turn/end') ? 'ja' : 'NEIN (Zeitgrenze)'}`)
    console.log(`Ereignisse vor der Verdichtung: ${String(vorher.gesamt)}`)

    // 4. /compact ausführen
    console.log('')
    console.log('== commands/execute mit /compact ==')
    const c = await ruf('commands/execute', { agentId: sid, line: '/compact', submittedAttachments: [] })
    if (c.ok !== true) {
      console.log(`  Fehler: HTTP ${String(c.status)} ${JSON.stringify(c.fehler ?? c.roh)}`)
      process.exitCode = 1
      return
    }
    if (c.wert === undefined || c.wert === null) {
      console.log('  Antwort: undefined — der Befehl wurde nicht ausgeführt')
      process.exitCode = 1
      return
    }
    console.log(`  commandId: ${String(c.wert.commandId)}`)
    const r = c.wert.result ?? {}
    console.log(`  Art:       ${String(r.kind)}`)
    if (typeof r.text === 'string') console.log(`  Text:      ${r.text.slice(0, 300)}`)
    if (r.sourceEventSeq !== undefined) console.log(`  Ereignis:  seq ${String(r.sourceEventSeq)}`)

    // 5. Was hat sich im Protokoll geändert?
    await new Promise((f) => setTimeout(f, 1500))
    const nachher = leseEreignisse(logPfad)
    console.log('')
    console.log(`Ereignisse nach der Verdichtung: ${String(nachher.gesamt)} (vorher ${String(vorher.gesamt)})`)
    const neu = [...nachher.arten.entries()].filter(([t, n]) => n > (vorher.arten.get(t) ?? 0))
    console.log('Neue oder vermehrte Ereignisarten:')
    if (neu.length === 0) console.log('  KEINE — das Protokoll hat sich nicht verändert')
    for (const [t, n] of neu) {
      const vor = vorher.arten.get(t) ?? 0
      const marke = VERDICHTUNGS_MUSTER.test(t) ? '   <== Verdichtung' : ''
      console.log(`  ${t.padEnd(38)} +${String(n - vor)}${marke}`)
    }

    const verdichtet = neu.some(([t]) => VERDICHTUNGS_MUSTER.test(t))

    // **Die Nutzlast zeigen.** „Ein Ereignis ist da" belegt, daß etwas geschah — nicht,
    // WAS. Der Inhalt ist der Unterschied zwischen „hat gearbeitet" und „hat gemeldet".
    if (nachher.verdichtung.length > 0) {
      console.log('')
      console.log('== Nutzlast der Verdichtungsereignisse ==')
      for (const v of nachher.verdichtung) {
        console.log(`  [seq ${String(v.seq)}] ${v.type}`)
        const text = JSON.stringify(v.data ?? null)
        console.log(`     ${text.length > 700 ? `${text.slice(0, 700)}…` : text}`)
      }
    }

    console.log('')
    if (r.kind === 'success' && verdichtet) {
      console.log('BEFUND: der Befehl lief durch UND das Protokoll zeigt ein Verdichtungsereignis.')
      process.exitCode = 0
    } else if (r.kind === 'success') {
      console.log('BEFUND: der Befehl lief durch (kind=success), aber das Protokoll zeigt KEIN')
      console.log('        Verdichtungsereignis. Ein Erfolg ohne Spur ist mit „nichts getan"')
      console.log('        vereinbar — die Wirkung ist damit NICHT belegt.')
      process.exitCode = 1
    } else {
      console.log(`BEFUND: der Befehl meldete ${String(r.kind)} — die Verdichtung lief NICHT.`)
      process.exitCode = 1
    }
  } finally {
    kind.kill()
    await new Promise((f) => setTimeout(f, 400))
  }
}

if (import.meta.main === true) await haupt()
