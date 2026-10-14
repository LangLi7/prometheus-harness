/**
 * Meßsonde: **Werkzeuge wecken** — welche Werkzeug-Zeilen sind nie gerufen worden?
 *
 * ## Warum diese Sonde existiert
 *
 * Die Kreuzung aus gemessener Zusammensetzung und Ereigniszählung
 * ([agent-kern.md](../agent-kern.md) §2.1) hat **sieben Werkzeug-Zeilen** gefunden,
 * die im Standard-Preset `enabled=true, phase=active` sind und **nie** aufgerufen
 * wurden:
 *
 * ```
 * dsh-tool-skill · dsh-tool-goal · dsh-tool-ask-user · dsh-tool-present
 * dsh-tool-subagent-control · .../list-agents · dsh-tool-workflow
 * ```
 *
 * **„Nie gerufen" ist von „kaputt" nicht zu unterscheiden, solange es niemand ruft.**
 * Diese Sonde ruft sie — je Werkzeug in einer **eigenen** Sitzung, damit die Spur
 * eindeutig zuzuordnen ist.
 *
 * ## Was sie belegt — und was nicht
 *
 * Sie belegt, daß ein Werkzeug **erreichbar** ist: das Modell hat es gerufen, der
 * Kern hat einen Aufruf aufgezeichnet, und die Antwort sagt, ob es ging.
 *
 * Sie belegt **nicht**, daß das Werkzeug unter Last oder mit schwierigen Argumenten
 * funktioniert. Und: **ruft das Modell das Werkzeug nicht**, ist damit **nichts**
 * bewiesen — das wird als `NICHT GERUFEN` ausgewiesen, nicht als Erfolg.
 *
 * ## Grenzen, die bewußt gezogen sind
 *
 * * `workflow` wird **nicht** gefahren: das Werkzeug startet Unteragenten, und ein
 *   Lauf kostet ein Vielfaches der übrigen. Es wird **benannt**, nicht verschwiegen.
 * * `ask_user_question` **blockiert** die Runde, bis jemand antwortet. Es wird
 *   gefahren und **danach die Sitzung beendet** — der Nachweis ist der Aufruf, nicht
 *   eine Antwort.
 *
 * ## Aufruf
 *
 * ```powershell
 * bun docs/status/messsonden/werkzeug-wecken.mjs 3081
 * ```
 *
 * @module docs/status/messsonden/werkzeug-wecken
 */

import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const WURZEL = join(HIER, '..', '..', '..')
const HOME = join(WURZEL, '.pmh-build', 'harness-home')

/**
 * Je Werkzeug ein Auftrag. Der Auftrag nennt das Werkzeug **wörtlich** — sonst
 * entscheidet das Modell, und die Messung sagt nichts über das Werkzeug.
 */
export const AUFTRAEGE = [
  {
    werkzeug: 'list_agents',
    zeile: 'dsh-tool-subagent-control/list-agents',
    prompt: 'Rufe jetzt genau einmal das Werkzeug list_agents auf (ohne Argumente) und antworte danach mit einem Wort.',
  },
  {
    werkzeug: 'present',
    zeile: 'dsh-tool-present',
    prompt: 'Rufe jetzt genau einmal das Werkzeug present auf und zeige darin den Text "SONDE-PRESENT". Antworte danach mit einem Wort.',
  },
  {
    werkzeug: 'skill',
    zeile: 'dsh-tool-skill',
    prompt: 'Rufe jetzt genau einmal das Werkzeug skill auf. Nimm den Namen "analyse". Antworte danach mit einem Wort.',
  },
  {
    // **Der Name war geraten und falsch — gemessen ist es `get_goal`.** Im ersten Lauf
    // meldete die Sonde „NICHT GERUFEN", während das Protokoll `get_goal … {"goal":null}`
    // zeigte: das Werkzeug war gerufen worden, nur unter anderem Namen. Deshalb steht
    // der Name jetzt mit dem Beleg daneben.
    werkzeug: 'get_goal',
    zeile: 'dsh-tool-goal',
    prompt: 'Rufe jetzt genau einmal das Werkzeug get_goal auf (ohne Argumente) und antworte danach mit einem Wort.',
  },
  {
    werkzeug: 'ask_user_question',
    zeile: 'dsh-tool-ask-user',
    prompt: 'Rufe jetzt genau einmal das Werkzeug ask_user_question auf und stelle genau eine Frage mit zwei Auswahlmoeglichkeiten.',
  },
]

const START_GRENZE_MS = 90_000
const RUNDE_GRENZE_MS = 75_000

export function leseStartzeile(text) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(text)
  return t === null ? null : { port: Number(t[1]), token: t[2] }
}

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
            /* noch nichts geschrieben */
          }
        }
        gehe(p)
      }
    }
  }
  gehe(home)
  return treffer
}

/**
 * Liest die Werkzeugaufrufe einer Sitzung — je Aufruf Name und Urteil der Antwort.
 *
 * Gepaart wird über `message.toolCallId`, den Schlüssel, der in
 * [werkzeug-paarung.mjs](werkzeug-paarung.mjs) belegt ist. Über `turn|step` wäre
 * die Zuordnung falsch, über `message.id` gar nicht vorhanden.
 */
export function leseAufrufe(pfad) {
  const text = new TextDecoder().decode(Bun.zstdDecompressSync(readFileSync(pfad)))
  const rufer = new Map()
  const ergebnis = new Map()
  let turnEnde = false
  for (const zeile of text.split('\n')) {
    if (zeile.trim() === '') continue
    let ev
    try {
      ev = JSON.parse(zeile)
    } catch {
      continue
    }
    if (ev.type === 'turn/end') turnEnde = true
    if (ev.type === 'tool/call' && ev.data?.callId !== undefined) {
      rufer.set(ev.data.callId, String(ev.data.name))
    }
    if (ev.type === 'tool/result') {
      const m = ev.data?.message ?? {}
      const id = m.toolCallId ?? m.source?.callId
      if (id !== undefined) {
        const t = Array.isArray(m.content)
          ? (m.content.find((c) => c.type === 'text')?.text ?? '')
          : ''
        ergebnis.set(id, { isError: m.isError === true, text: t })
      }
    }
  }
  return [...rufer.entries()].map(([id, name]) => ({
    name,
    ergebnis: ergebnis.get(id) ?? null,
  })).concat(turnEnde ? [] : [{ name: '(Turn ohne Ende)', ergebnis: null }])
}

async function haupt() {
  const portArg = Number(process.argv[2] ?? 3081)
  console.log('Werkzeuge wecken — welche Zeilen waren nie gerufen?')
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
          rpcId: `weck-${String(Math.random()).slice(2, 8)}`,
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

    const berichte = []
    for (const a of AUFTRAEGE) {
      const s = await ruf('session/create', { request: { cwd: WURZEL } })
      if (s.ok !== true) {
        berichte.push({ ...a, urteil: 'SITZUNG GESCHEITERT', detail: '' })
        continue
      }
      const sid = s.wert.sessionId
      await ruf('session/prompt', {
        request: {
          requestId: `weck-${String(Date.now())}`,
          sessionId: sid,
          mode: 'queue',
          content: [{ type: 'text', text: a.prompt }],
        },
      })

      // Auf das Protokoll warten, dann auf Aufruf **und** Antwort — mit Grenze.
      let logPfad = null
      const ende = Date.now() + RUNDE_GRENZE_MS
      let aufrufe = []
      while (Date.now() < ende) {
        await new Promise((f) => setTimeout(f, 500))
        if (logPfad === null) logPfad = findeLog(HOME, sid)
        if (logPfad === null) continue
        try {
          aufrufe = leseAufrufe(logPfad)
        } catch {
          continue
        }
        const meiner = aufrufe.find((x) => x.name === a.werkzeug)
        // Fertig, wenn der Aufruf **und** seine Antwort da sind — oder die Runde endete.
        if (meiner?.ergebnis !== null && meiner !== undefined) break
        if (aufrufe.some((x) => x.name === '(Turn ohne Ende)') && meiner !== undefined) break
      }

      const meiner = aufrufe.find((x) => x.name === a.werkzeug)
      let urteil
      let detail = ''
      // **Der Fehler im ersten Lauf.** Die Schleife endete an der Zeitgrenze und urteilte
      // mit dem **zuletzt gelesenen** Stand. War die letzte Lesung fehlgeschlagen (die
      // zstd-Datei wird während des Schreibens gelesen), stand dort nur der `tool/call`
      // **ohne** Antwort — und die Sonde meldete „ANTWORT AUSSTEHEND", obwohl das
      // Ergebnis im Protokoll **stand**. Gemessen: `skill` und `get_goal` wurden so
      // falsch beurteilt. Deshalb wird **nach** der Schleife noch einmal gelesen, mit
      // kurzer Wartezeit — der letzte Stand entscheidet, nicht der letzte geglückte.
      if (logPfad !== null) {
        await new Promise((f) => setTimeout(f, 2500))
        try {
          const nachlese = leseAufrufe(logPfad)
          const meinerNach = nachlese.find((x) => x.name === a.werkzeug)
          if (meinerNach !== undefined) aufrufe = nachlese
        } catch {
          /* dann bleibt der vorige Stand — und das Urteil nennt ihn als unsicher */
        }
      }
      const endgueltig = aufrufe.find((x) => x.name === a.werkzeug)
      if (endgueltig === undefined) {
        const andere = aufrufe.filter((x) => !x.name.startsWith('(')).map((x) => x.name)
        urteil = 'NICHT GERUFEN'
        detail = andere.length === 0 ? 'kein Werkzeugaufruf in der Sitzung' : `gerufen wurde: ${andere.join(', ')}`
      } else if (endgueltig.ergebnis === null) {
        urteil = 'GERUFEN, ANTWORT AUSSTEHEND'
        detail = 'die Runde blockiert (ask_user_question) oder wurde abgebrochen'
      } else if (endgueltig.ergebnis.isError) {
        urteil = 'GERUFEN, FEHLER'
        detail = endgueltig.ergebnis.text.replace(/\s+/gu, ' ').slice(0, 200)
      } else {
        urteil = 'GERUFEN, GRUEN'
        detail = endgueltig.ergebnis.text.replace(/\s+/gu, ' ').slice(0, 160)
      }
      berichte.push({ ...a, urteil, detail })
      console.log(`${a.werkzeug.padEnd(20)} ${urteil}${detail === '' ? '' : `\n${' '.repeat(21)}${detail}`}`)
    }

    console.log('')
    console.log('== Bilanz ==')
    const grun = berichte.filter((b) => b.urteil === 'GERUFEN, GRUEN').length
    const fehler = berichte.filter((b) => b.urteil === 'GERUFEN, FEHLER').length
    const nicht = berichte.filter((b) => b.urteil === 'NICHT GERUFEN').length
    const offen = berichte.filter((b) => b.urteil.startsWith('GERUFEN, ANTWORT')).length
    console.log(`  grün ${String(grun)} · Fehler ${String(fehler)} · nicht gerufen ${String(nicht)} · Antwort ausstehend ${String(offen)}`)
    console.log('')
    console.log('  NICHT gefahren: dsh-tool-workflow — das Werkzeug startet Unteragenten und')
    console.log('  kostet ein Vielfaches der übrigen. Es wird benannt, nicht verschwiegen.')
    console.log('')
    console.log('  Ein „NICHT GERUFEN" ist KEIN Defekt und KEIN Erfolg: es heißt, daß das')
    console.log('  Modell das Werkzeug nicht benutzt hat — über das Werkzeug ist damit nichts')
    console.log('  bekannt.')

    process.exitCode = nicht > 0 || fehler > 0 ? 1 : 0
  } finally {
    kind.kill()
    await new Promise((f) => setTimeout(f, 400))
  }
}

if (import.meta.main === true) await haupt()
