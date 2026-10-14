/**
 * Meßsonde: **Befehle** — was tut ein `/befehl` wirklich, und was läßt er zurück?
 *
 * ## Warum diese Sonde existiert
 *
 * Der Agent-Kern hat **sechs** Befehle (gemessen über `commands/list`): `compact`,
 * `export`, `feedback`, `goal`, `permission`, `plan`. Die [Ereigniszählung](werkzeug-paarung.mjs)
 * über 21 Sitzungen zeigt für genau **einen** dieser Bereiche **keinen einzigen
 * Beleg**: **Ziele**. `dsh-goal` und `dsh-goal-round-driver` sind komponiert und
 * aktiv — daß ein Ziel je **gewirkt** hat, steht in keinem Protokoll.
 *
 * „Komponiert" ist nicht „wirksam". Diese Sonde fährt einen beliebigen Befehl über
 * `commands/execute` und berichtet **zweierlei**: was der Befehl zurückmeldet **und**
 * welche Ereignisse neu im Sitzungsprotokoll stehen.
 *
 * ## Warum BEIDE Angaben nötig sind
 *
 * Ein `kind: 'success'` **allein** ist kein Beweis. „Erfolg" ohne Spur ist mit
 * „nichts getan" vereinbar — genau dieser Fall steht als eigener Zweig im Urteil
 * unten. Und ein neues Ereignis **allein** beweist nicht, daß der Befehl die Ursache
 * war: es könnte von der vorherigen Runde stammen. Deshalb wird **vorher** gezählt
 * und die **Differenz** gebildet.
 *
 * ## Der Meßweg (Form gemessen, nicht geraten)
 *
 * ```
 * id: '@deepseek-ai/dsh-commands#commands/execute'
 * scope:      { context: 'agent', wire: 'agentId' }
 * parameters: [ { name: 'agent', wire: 'agentId', source: 'lookup' },
 *               { name: 'line',  wire: 'line',  source: 'json' },
 *               { name: 'submittedAttachments', source: 'json' } ]
 * ```
 *
 * Die Sitzung steht in `payload.args.agentId`, **nicht** im Pfad. Geraten wurde das
 * nicht: vier Formen wurden durchprobiert, jede vom Server **mit Begründung**
 * abgelehnt (`missing "agentId"; unexpected "agent"` → `404` → `unexpected "scope"`).
 *
 * ## Aufruf
 *
 * ```powershell
 * bun docs/status/messsonden/befehl-sonde.mjs 3089 "/goal Ein Ziel fuer die Sonde"
 * ```
 *
 * @module docs/status/messsonden/befehl-sonde
 */

import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const WURZEL = join(HIER, '..', '..', '..')
const HOME = join(WURZEL, '.pmh-build', 'harness-home')

const START_GRENZE_MS = 90_000
const WIRKUNG_GRENZE_MS = 20_000

/** Zieht Port und Token aus einer Host-Zeile; der Token wird nie ausgegeben. */
export function leseStartzeile(text) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(text)
  if (t === null) return null
  return { port: Number(t[1]), token: t[2] }
}

/** Findet das Protokoll **einer** Sitzung. */
export function findeLog(home, sessionId) {
  const kurz = sessionId.replace(/^session-/u, '')
  let treffer = null
  const gehe = (d) => {
    let e
    try {
      e = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const x of e) {
      if (treffer !== null) return
      const p = join(d, x.name)
      if (x.isDirectory()) {
        if (x.name.includes(kurz)) {
          try {
            readFileSync(join(p, 'session.v4.jsonl.zstd'))
            treffer = join(p, 'session.v4.jsonl.zstd')
            return
          } catch {
            /* noch kein Protokoll */
          }
        }
        gehe(p)
      }
    }
  }
  gehe(home)
  return treffer
}

/** Zählt die Ereignisarten eines Protokolls. */
export function zaehle(pfad) {
  const arten = new Map()
  let gesamt = 0
  const text = new TextDecoder().decode(Bun.zstdDecompressSync(readFileSync(pfad)))
  for (const zeile of text.split('\n')) {
    if (zeile.trim() === '') continue
    let ev
    try {
      ev = JSON.parse(zeile)
    } catch {
      continue
    }
    gesamt += 1
    const t = String(ev.type ?? '?')
    arten.set(t, (arten.get(t) ?? 0) + 1)
  }
  return { arten, gesamt }
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
  const portArg = Number(process.argv[2] ?? 3089)
  const zeile = process.argv[3] ?? '/goal'
  console.log(`Befehl: ${zeile}`)
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
          rpcId: `befehl-${String(Math.random()).slice(2, 8)}`,
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

    const s = await ruf('session/create', { request: { cwd: WURZEL } })
    if (s.ok !== true) {
      console.log(`ABBRUCH: session/create — ${JSON.stringify(s.fehler ?? s.roh)}`)
      process.exitCode = 2
      return
    }
    const sid = s.wert.sessionId
    console.log(`Sitzung: ${sid}`)

    const liste = await ruf('commands/list', { agentId: sid })
    const befehle = liste.ok === true && Array.isArray(liste.wert) ? liste.wert.map((b) => b.name) : []
    console.log(`Befehle: ${befehle.join(', ')}`)
    const name = zeile.replace(/^\//u, '').split(/\s+/u)[0] ?? ''
    if (!befehle.includes(name)) {
      console.log(`ABBRUCH: '${name}' steht nicht in der Befehlsliste (${befehle.join(', ')})`)
      process.exitCode = 1
      return
    }

    const logPfad = await warteAufLog(sid, 30_000)
    if (logPfad === null) {
      console.log('HINWEIS: die Sitzung hat noch kein Protokoll; die Vorher-Zählung entfällt.')
    }
    const vorher = logPfad === null ? { arten: new Map(), gesamt: 0 } : zaehle(logPfad)

    console.log('')
    console.log('== commands/execute ==')
    const c = await ruf('commands/execute', { agentId: sid, line: zeile, submittedAttachments: [] })
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
    if (typeof r.text === 'string') console.log(`  Text:      ${r.text.slice(0, 400)}`)

    // **Auf Wirkung warten, nicht auf die Zeit hoffen** — aber mit Grenze.
    let nachher = vorher
    const ende = Date.now() + WIRKUNG_GRENZE_MS
    while (Date.now() < ende) {
      await new Promise((f) => setTimeout(f, 500))
      if (logPfad !== null) nachher = zaehle(logPfad)
      if (nachher.gesamt > vorher.gesamt) break
    }

    console.log('')
    console.log(`Ereignisse: ${String(vorher.gesamt)} -> ${String(nachher.gesamt)}`)
    const neu = [...nachher.arten.entries()].filter(([t, n]) => n > (vorher.arten.get(t) ?? 0))
    if (neu.length === 0) {
      console.log('  KEINE neuen Ereignisarten')
    }
    for (const [t, n] of neu) console.log(`  ${t.padEnd(34)} +${String(n - (vorher.arten.get(t) ?? 0))}`)

    // **Die Huelle ist keine Wirkung — gemessen am 14.10.2026 an `/permission`.**
    //
    // Jeder Befehl schreibt `command/run` und `command/done`, egal was er tut. Meine
    // erste Fassung zaehlte sie als „Spur" mit — und `/permission` ohne Argument,
    // eine reine **Abfrage**, bekam damit ein gruenes Urteil, obwohl der Befehl
    // nichts geaendert hat und nichts aendern SOLL. Ein Waechter, der die Huelle
    // fuer die Wirkung nimmt, ist bei jedem Befehl gruen.
    //
    // Geurteilt wird deshalb ueber die Ereignisse OHNE die Huelle. Bleibt dann
    // nichts uebrig, lautet das Urteil „nur die Huelle" — und das ist je nach
    // Befehl richtig oder ein Befund. Die Sonde sagt, was sie sieht, statt
    // „belegt" zu behaupten.
    const HUELLE = new Set(['command/run', 'command/done'])
    const wirkung = neu.filter(([t]) => !HUELLE.has(t))

    console.log('')
    if (r.kind !== 'success') {
      console.log(`BEFUND: der Befehl meldete '${String(r.kind)}' — er hat NICHT gewirkt.`)
      process.exitCode = 1
    } else if (wirkung.length === 0) {
      console.log('BEFUND: kind=success, aber nur die HUELLE im Protokoll — KEINE eigene Spur.')
      console.log('        Das ist bei einer reinen Abfrage richtig (/permission ohne Argument)')
      console.log('        und bei einem Befehl, der etwas aendern SOLL, ein Befund.')
      console.log('        Diese Sonde entscheidet das nicht — sie nennt es.')
      process.exitCode = 1
    } else {
      console.log(`BEFUND: der Befehl lief durch UND das Protokoll zeigt eine eigene Spur: ${wirkung.map(([t]) => t).join(', ')}`)
      process.exitCode = 0
    }
  } finally {
    kind.kill()
    await new Promise((f) => setTimeout(f, 400))
  }
}

if (import.meta.main === true) await haupt()
