/**
 * Meßsonde: **überlebt der Verlauf einen NEUSTART des Hosts?**
 *
 * ## Warum diese Sonde existiert
 *
 * [live-anbindung.md](../live-anbindung.md) §13 hat gemessen, daß der Verlauf einen
 * **Abbruch der Verbindung** überlebt — lückenlos, ohne Doppelung. Dort steht aber
 * ausdrücklich als **nicht gemessen**:
 *
 * > *„Ob die Wiederaufnahme auch bei einem **Prozeßneustart** des Hosts gilt — hier wurde nur
 * > die **Verbindung** getrennt, nicht der Host beendet."*
 *
 * Und das ist der Fall des Betreibers: **die Anwendung wird beendet und wieder geöffnet.**
 * „Beim Neustart Chatverlauf" heißt: ein **anderer Prozeß** muß die Sitzung wiederfinden.
 *
 * ## Der Ablauf
 *
 * 1. Host **A** starten, Sitzung anlegen, eine Runde laufen lassen.
 * 2. Über die Strecke folgen und den Verlauf holen: **Cursor** und **Sequenzbereich**.
 * 3. **Host A töten** — der ganze Prozeß, nicht nur die Verbindung.
 * 4. Host **B** starten — **gleiches Home, ANDERER Port**.
 * 5. Zum **selben** `sessionId` folgen und den Verlauf erneut holen.
 * 6. Die beiden Bereiche vergleichen.
 *
 * **Der andere Port ist Absicht.** Fände Host B die Sitzung nur, weil derselbe Port oder
 * derselbe Prozeß noch etwas im Speicher hält, wäre nichts bewiesen. So muß die Sitzung
 * **aus dem Home** kommen.
 *
 * ## Was gemessen wird
 *
 * | Frage | Wie |
 * |---|---|
 * | Findet Host B die Sitzung wieder? | `session/follow` auf dieselbe Kennung |
 * | Ist der Verlauf **vollständig**? | Sequenzbereich A gegen Bereich B |
 * | Geht etwas **verloren**? | jedes `seq` aus A muß in B vorkommen |
 * | Kommt etwas **dazu**? | erlaubt — aber es wird **gezählt** |
 * | Ist die Strecke nach dem Neustart wieder da? | neue Aufwertung auf Host B |
 *
 * @module docs/status/messsonden/strom-neustart-sonde
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const WURZEL = join(HIER, '..', '..', '..')

const START_GRENZE_MS = 90_000
const RUNDE_GRENZE_MS = 90_000

export function leseStartzeile(text) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(text)
  return t === null ? null : { port: Number(t[1]), token: t[2] }
}

/** Startet einen Host und wartet auf seine Startzeile. */
async function hostStarten(port) {
  const kind = spawn(process.execPath, ['scripts/start.mjs', '--port', String(port), '--no-go'], {
    cwd: WURZEL,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
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
  return { kind, start }
}

/** Meldet sich an und liefert die Zugangsfunktionen. */
async function zugang(port, token) {
  const anmeldung = await fetch(`http://127.0.0.1:${String(port)}/?token=${token}`, { redirect: 'manual' })
  const cookie = (anmeldung.headers.get('set-cookie') ?? '').split(';')[0]
  const ruf = async (methode, args) => {
    const a = await fetch(`http://127.0.0.1:${String(port)}/api/${methode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `neu-${String(Math.random()).slice(2, 8)}`,
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
  return { cookie, ruf }
}

/**
 * Folgt einer Sitzung über die Strecke und holt den Verlauf.
 *
 * Der Schnitt ist der **`cursor`** des Eröffnungsrahmens — gemessen in
 * [strom-wiederaufnahme-sonde.mjs](strom-wiederaufnahme-sonde.mjs), **nicht** `throughSeq`.
 */
async function verlaufHolen(port, cookie, sid) {
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
  if (!offen) return null
  ws.addEventListener('message', (e) => rahmen.push(String(e.data)))
  ws.send(
    JSON.stringify({
      type: 'open',
      streamId: 'neu-1',
      endpoint: 'session/follow',
      payload: { args: { request: { address: { kind: 'session', sessionId: sid }, maxMessages: 30 } } },
    }),
  )
  const grenze = Date.now() + 15_000
  while (Date.now() < grenze && rahmen.length === 0) await new Promise((f) => setTimeout(f, 200))
  ws.close()
  for (const r of rahmen) {
    try {
      const j = JSON.parse(r)
      const v = j?.value
      if (v?.type === 'snapshot' && typeof v.cursor === 'number') {
        return { cursor: v.cursor, hasMore: v.hasMore === true, rahmen: rahmen.length }
      }
    } catch {
      /* unlesbar */
    }
  }
  return null
}

/** Blättert den Verlauf rückwärts und sammelt alle `seq`. */
async function verlaufBlättern(ruf, sid, schnitt) {
  const alle = []
  let beforeSeq = undefined
  let hasMore = true
  let seiten = 0
  while (hasMore && seiten < 30) {
    const seite = await ruf('session/page', {
      request: {
        address: { kind: 'session', sessionId: sid },
        throughSeq: schnitt,
        ...(beforeSeq === undefined ? {} : { beforeSeq }),
        maxMessages: 30,
      },
    })
    if (seite.ok !== true) return { fehler: seite.fehler, alle }
    const w = seite.wert ?? {}
    const eintraege = Array.isArray(w.records) ? w.records : []
    const seqs = eintraege.map((r) => r?.seq ?? r?.event?.seq).filter((x) => typeof x === 'number')
    for (const s of seqs) alle.push(s)
    seiten += 1
    hasMore = w.hasMore === true
    if (seqs.length === 0) break
    beforeSeq = Math.min(...seqs)
    if (beforeSeq <= 0) break
  }
  return { alle, seiten }
}

async function haupt() {
  const portA = Number(process.argv[2] ?? 3056)
  const portB = portA + 1
  console.log('Neustart — überlebt der Verlauf einen HOST-NEUSTART?')
  console.log('')

  // ---- Host A ----
  const a = await hostStarten(portA)
  if (a.start === null) {
    console.log('ABBRUCH: Host A startete nicht')
    a.kind.kill()
    process.exitCode = 2
    return
  }
  console.log(`Host A auf Port ${String(a.start.port)}`)
  let b = null
  try {
    const A = await zugang(a.start.port, a.start.token)
    const s = await A.ruf('session/create', { request: { cwd: WURZEL } })
    if (s.ok !== true) {
      console.log(`ABBRUCH: session/create — ${JSON.stringify(s.fehler)}`)
      process.exitCode = 2
      return
    }
    const sid = s.wert.sessionId
    console.log(`Sitzung: ${sid}`)
    await A.ruf('session/prompt', {
      request: {
        requestId: `neu-${String(Date.now())}`,
        sessionId: sid,
        mode: 'queue',
        content: [{ type: 'text', text: 'Antworte mit genau einem Wort: NEUSTART' }],
      },
    })
    // Auf die Runde warten — großzügig, und danach NOCH etwas, damit geschrieben ist.
    await new Promise((f) => setTimeout(f, 12_000))

    const vorA = await verlaufHolen(a.start.port, A.cookie, sid)
    if (vorA === null) {
      console.log('ABBRUCH: Host A lieferte keinen Eröffnungsrahmen')
      process.exitCode = 1
      return
    }
    const bereichA = await verlaufBlättern(A.ruf, sid, vorA.cursor)
    const seqA = bereichA.alle ?? []
    console.log('')
    console.log('== Host A ==')
    console.log(`  cursor = ${String(vorA.cursor)}   hasMore = ${String(vorA.hasMore)}`)
    console.log(`  Verlauf: ${String(seqA.length)} Einträge, Bereich ${String(Math.min(...seqA, 0))} … ${String(Math.max(...seqA, 0))}`)

    // ---- Host A TÖTEN ----
    console.log('')
    console.log('== HOST A WIRD GETÖTET ==')
    a.kind.kill()
    await new Promise((f) => setTimeout(f, 3000))
    let tot = true
    try {
      await fetch(`http://127.0.0.1:${String(a.start.port)}/?token=x`, { redirect: 'manual', signal: AbortSignal.timeout(2000) })
      tot = false
    } catch {
      tot = true
    }
    console.log(`  Host A antwortet nicht mehr: ${tot ? 'ja' : 'NEIN — er läuft noch!'}`)
    if (!tot) {
      console.log('  ABBRUCH: ohne toten Host A ist der Neustart nicht gemessen.')
      process.exitCode = 2
      return
    }

    // ---- Host B auf ANDEREM Port, GLEICHEM Home ----
    console.log('')
    console.log(`== HOST B auf Port ${String(portB)} (gleiches Home, anderer Prozeß) ==`)
    const gestartet = await hostStarten(portB)
    if (gestartet.start === null) {
      console.log('ABBRUCH: Host B startete nicht')
      gestartet.kind.kill()
      process.exitCode = 2
      return
    }
    b = gestartet.kind
    console.log(`  Host B auf Port ${String(gestartet.start.port)}`)
    const B = await zugang(gestartet.start.port, gestartet.start.token)

    const vorB = await verlaufHolen(gestartet.start.port, B.cookie, sid)
    if (vorB === null) {
      console.log('')
      console.log('== BEFUND ==')
      console.log('  Host B lieferte KEINEN Eröffnungsrahmen für dieselbe Sitzungskennung.')
      console.log('  Die Sitzung ist nach dem Neustart NICHT wiederauffindbar —')
      console.log('  „beim Neustart Chatverlauf" ist damit NICHT belegt.')
      process.exitCode = 1
      return
    }
    const bereichB = await verlaufBlättern(B.ruf, sid, vorB.cursor)
    const seqB = bereichB.alle ?? []
    const mengeB = new Set(seqB)
    const verloren = seqA.filter((x) => !mengeB.has(x))
    const dazu = seqB.filter((x) => !new Set(seqA).has(x))
    const dublettenB = seqB.length - mengeB.size

    console.log('')
    console.log('== Host B ==')
    console.log(`  cursor = ${String(vorB.cursor)}   hasMore = ${String(vorB.hasMore)}`)
    console.log(`  Verlauf: ${String(seqB.length)} Einträge, Bereich ${String(Math.min(...seqB, 0))} … ${String(Math.max(...seqB, 0))}`)

    console.log('')
    console.log('== Vergleich ==')
    console.log(`  Host A: cursor ${String(vorA.cursor)}, ${String(seqA.length)} seq`)
    console.log(`  Host B: cursor ${String(vorB.cursor)}, ${String(seqB.length)} seq`)
    console.log(`  VERLOREN gegenüber A: ${verloren.length === 0 ? 'KEINE' : verloren.slice(0, 12).join(', ')}`)
    console.log(`  neu dazugekommen:      ${dazu.length}`)
    console.log(`  Doppelungen in B:      ${String(dublettenB)}`)

    console.log('')
    console.log('== BEFUND ==')
    if (verloren.length === 0 && dublettenB === 0) {
      console.log('  Der Verlauf überlebt einen HOST-NEUSTART:')
      console.log(`    - Host A wurde beendet, Host B ist ein ANDERER Prozeß auf Port ${String(gestartet.start.port)}`)
      console.log(`    - dieselbe Sitzungskennung ist wiederauffindbar`)
      console.log(`    - ${String(seqA.length)} seq aus A sind ALLE in B vorhanden, KEINE verloren`)
      // **Kein „wuchs", wenn er gleich blieb.** Hier stand „der Cursor wuchs von 21 auf 21" —
      // ein Widerspruch in sich. Zwischen den beiden Läufen lief nichts, also BLEIBT der
      // Cursor gleich. Die Sonde sagt jetzt, was sie sieht.
      const cursorVergleich =
        vorB.cursor === vorA.cursor
          ? `der Cursor blieb bei ${String(vorA.cursor)} (zwischen den Läufen lief nichts)`
          : `der Cursor stieg von ${String(vorA.cursor)} auf ${String(vorB.cursor)} (dazwischen lief etwas)`
      console.log(`    - ${cursorVergleich}`)
      console.log('  Damit ist „beim Neustart Chatverlauf" GEMESSEN.')
      process.exitCode = 0
    } else {
      console.log('  Der Verlauf überlebt den Neustart NICHT vollständig:')
      if (verloren.length > 0) console.log(`    - ${String(verloren.length)} seq FEHLEN nach dem Neustart`)
      if (dublettenB > 0) console.log(`    - ${String(dublettenB)} Doppelungen in B`)
      process.exitCode = 1
    }

    // ---------------------------------------------------------------------------
    // 5. SCHREIBEN nach dem Neustart — die letzte Lücke
    // ---------------------------------------------------------------------------
    // Bis hierher wurde nur **gelesen**. Der Betreiber öffnet die Anwendung aber, um
    // **weiterzuarbeiten**. Also: einen neuen Auftrag in dieselbe Sitzung geben und
    // nachsehen, ob sie weiterläuft — **ohne** den alten Verlauf zu beschädigen.
    console.log('')
    console.log('== 5. SCHREIBEN in dieselbe Sitzung, nach dem Neustart ==')
    const vorSchreiben = vorB.cursor
    const p = await B.ruf('session/prompt', {
      request: {
        requestId: `neu-schreiben-${String(Date.now())}`,
        sessionId: sid,
        mode: 'queue',
        content: [{ type: 'text', text: 'Antworte mit genau einem Wort: WEITER' }],
      },
    })
    console.log(`  Auftrag angenommen: ${p.ok === true ? 'ja' : JSON.stringify(p.fehler)}`)
    if (p.ok !== true) {
      console.log('  BEFUND: der Auftrag wurde ABGELEHNT — die Sitzung ist nach dem Neustart')
      console.log('  NICHT beschreibbar. „Weiterarbeiten" ist damit nicht belegt.')
      process.exitCode = 1
      return
    }

    // Auf die neue Runde warten — großzügig, damit sie sicher geschrieben ist.
    await new Promise((f) => setTimeout(f, 14_000))
    const nachSchreiben = await verlaufHolen(gestartet.start.port, B.cookie, sid)
    if (nachSchreiben === null) {
      console.log('  BEFUND: nach dem Schreiben kein Eröffnungsrahmen — unklar.')
      process.exitCode = 1
      return
    }
    const bereichC = await verlaufBlättern(B.ruf, sid, nachSchreiben.cursor)
    const seqC = bereichC.alle ?? []
    const mengeC = new Set(seqC)
    const alteWeg = seqA.filter((x) => !mengeC.has(x))
    const neuDazu = seqC.filter((x) => !new Set(seqA).has(x))
    const dublettenC = seqC.length - mengeC.size

    console.log('')
    console.log('== 6. Der Verlauf nach dem Schreiben ==')
    console.log(`  cursor: ${String(vorB.cursor)} -> ${String(nachSchreiben.cursor)}`)
    console.log(`  Einträge: ${String(seqB.length)} -> ${String(seqC.length)}`)
    console.log(`  Bereich: ${String(Math.min(...seqC, 0))} … ${String(Math.max(...seqC, 0))}`)
    console.log(`  alte Einträge verloren: ${alteWeg.length === 0 ? 'KEINE' : alteWeg.slice(0, 10).join(', ')}`)
    console.log(`  neu dazugekommen:       ${String(neuDazu.length)}`)
    console.log(`  Doppelungen:            ${String(dublettenC)}`)

    console.log('')
    console.log('== BEFUND (Schreiben nach dem Neustart) ==')
    if (nachSchreiben.cursor <= vorSchreiben) {
      console.log(`  Der Cursor wuchs NICHT (${String(vorSchreiben)} -> ${String(nachSchreiben.cursor)}).`)
      console.log('  Also hat der Auftrag nichts geschrieben — die Sitzung ist nach dem Neustart')
      console.log('  möglicherweise nur LESBAR. Das ist ein Befund, kein Erfolg.')
      process.exitCode = 1
    } else if (alteWeg.length === 0 && dublettenC === 0 && neuDazu.length > 0) {
      console.log('  Die Sitzung ist nach dem Neustart WEITERSCHREIBBAR:')
      console.log(`    - neuer Auftrag angenommen und ausgeführt (cursor ${String(vorSchreiben)} -> ${String(nachSchreiben.cursor)})`)
      console.log(`    - ${String(neuDazu.length)} neue Einträge`)
      console.log(`    - die ${String(seqA.length)} alten Einträge sind ALLE noch da`)
      console.log('    - KEINE Doppelung')
      console.log('  Damit ist „nach dem Neustart weiterarbeiten" GEMESSEN.')
      process.exitCode = 0
    } else {
      console.log('  Nicht belegt:')
      if (alteWeg.length > 0) console.log(`    - ${String(alteWeg.length)} alte Einträge sind WEG`)
      if (dublettenC > 0) console.log(`    - ${String(dublettenC)} Doppelungen`)
      if (neuDazu.length === 0) console.log('    - kein neuer Eintrag')
      process.exitCode = 1
    }
  } finally {
    a.kind.kill()
    b?.kill()
    await new Promise((f) => setTimeout(f, 400))
  }
}

if (import.meta.main === true) await haupt()
