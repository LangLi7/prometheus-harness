/**
 * Meßsonde: **überlebt der Verlauf einen Abbruch der Verbindung?**
 *
 * ## Warum diese Sonde existiert
 *
 * Das ist der Fall, der für die Anforderung des Betreibers wirklich zählt: *„damit der
 * Benutzer beim Neustart Chatverlauf bekommt"*. Alle bisherigen Messungen haben den Strom
 * **geöffnet und laufen lassen** — keine hat ihn **mitten im Lauf zerrissen**.
 *
 * [live-anbindung.md](../live-anbindung.md) §12 führt das ausdrücklich als **nicht
 * gemessen**: *„Verhalten bei **Verbindungsabbruch** und Wiederaufsetzen."*
 *
 * ## Der Ablauf
 *
 * 1. Sitzung anlegen, Strecke aufwerten, `session/follow` → Eröffnungsrahmen mit `throughSeq`.
 * 2. Auftrag absetzen (der Lauf beginnt).
 * 3. Ein paar Rahmen sammeln und den **höchsten gesehenen `seq`** merken.
 * 4. **Die Strecke schließen** — mitten im Lauf.
 * 5. Warten, während der Lauf weiterläuft (niemand hört zu).
 * 6. **Neu verbinden**, erneut `session/follow` → **neuer** Eröffnungsrahmen, neuer `throughSeq`.
 * 7. Den Verlauf über `session/page` **rückwärts blättern** und **alle `seq`** einsammeln.
 *
 * ## Was gemessen wird — und wie das Urteil entsteht
 *
 * | Frage | Wie |
 * |---|---|
 * | Bekommt man nach dem Abbruch wieder Anschluß? | neuer Eröffnungsrahmen vorhanden? |
 * | **Fehlt** etwas aus der Zeit ohne Zuhörer? | die eingesammelten `seq` müssen **lückenlos** sein |
 * | **Doppelt** sich etwas? | die `seq`-Menge darf **keine Dubletten** haben |
 * | Deckt der neue Schnitt die Lücke? | `throughSeq` nach dem Abbruch ≥ höchster `seq` davor |
 *
 * **Nur wenn alle vier zutreffen, ist die Wiederaufnahme belegt.** Ein vorhandener
 * Eröffnungsrahmen allein sagt nichts über die Lücke.
 *
 * @module docs/status/messsonden/strom-wiederaufnahme-sonde
 */

import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const HIER = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1').replace(/\//gu, '\\')
const WURZEL = join(HIER, '..', '..', '..')
const HOME = join(WURZEL, '.pmh-build', 'harness-home')

const START_GRENZE_MS = 90_000
/**
 * Wie lange nach dem Folgen gesammelt wird, **bevor getrennt wird**.
 *
 * **Hier stand `8_000` — und das machte den Test wertlos.** Der Lauf war nach acht Sekunden
 * schon **fertig**; die Lücke blieb **leer**, und der Test bewies nur, daß man sich nach
 * einem abgeschlossenen Lauf wieder verbinden kann. Das ist nicht die Frage.
 *
 * Gemessen: `throughSeq` war **vor und nach** dem Riß **15** — unverändert.
 */
const SAMMEL_MS = 1_500
const TRENN_MS = 20_000

export function leseStartzeile(text) {
  const t = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=(\S+)/u.exec(text)
  return t === null ? null : { port: Number(t[1]), token: t[2] }
}

/** Zieht `seq` aus einem Rahmen — **geparst**, nicht gesucht. */
export function seqAus(text) {
  try {
    const j = JSON.parse(text)
    const s = j?.value?.event?.seq
    return typeof s === 'number' ? s : null
  } catch {
    return null
  }
}

/**
 * Die Felder eines Eröffnungsrahmens — **geparst**.
 *
 * ## Der Fehler, der das nötig machte
 *
 * Hier stand `/"throughSeq"\s*:\s*(\d+)/` — ein **Muster** über den rohen Rahmen. Der
 * Eröffnungsrahmen ist aber **88 844 Zeichen** groß und enthält den **ganzen
 * Schnappschuß** samt aller Datensätze. Das Muster fand deshalb irgendeinen
 * `throughSeq`-Wert **tief in einem Datensatz** — und meldete nach dem Riß **15**,
 * obwohl der `cursor` von **19 auf 65** gewachsen war.
 *
 * **Ein Strukturfeld wird geparst, nicht gesucht.** Dieselbe Lehre wie Regel 16
 * („nach exakten Bezeichnern suchen, nicht nach Teilzeichenketten") — hier eine Stufe
 * schärfer: über **JSON** wird nicht gemustert, sondern gelesen.
 *
 * @returns {{throughSeq: number|null, cursor: number|null, art: string|null}}
 */
export function rahmenFelder(text) {
  try {
    const j = JSON.parse(text)
    const v = j?.value
    if (v === undefined || v === null) return { throughSeq: null, cursor: null, art: null }
    return {
      throughSeq: typeof v.throughSeq === 'number' ? v.throughSeq : null,
      cursor: typeof v.cursor === 'number' ? v.cursor : null,
      art: typeof v.type === 'string' ? v.type : null,
    }
  } catch {
    return { throughSeq: null, cursor: null, art: null }
  }
}

/** Nur der Schnitt — für die Schleifen. */
export function schnittAus(text) {
  return rahmenFelder(text).throughSeq
}

/** Öffnet eine Strecke und folgt einer Sitzung. Liefert `{ws, rahmen}`. */
async function streckeOeffnen(port, cookie, stromId) {
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
  if (!offen) return { ws: null, rahmen }
  ws.addEventListener('message', (e) => rahmen.push(String(e.data)))
  return { ws, rahmen }
}

/** Findet das Sitzungsprotokoll **einer** Sitzung auf der Platte. */
export function findeProtokoll(home, sessionId) {
  const kurz = sessionId.replace(/^session-/u, '')
  let treffer = null
  const gehe = (dir) => {
    let eintraege
    try {
      eintraege = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of eintraege) {
      if (treffer !== null) return
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name.includes(kurz)) {
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

async function warteAufProtokoll(sessionId, grenzeMs) {
  const ende = Date.now() + grenzeMs
  while (Date.now() < ende) {
    const p = findeProtokoll(HOME, sessionId)
    if (p !== null) return p
    await new Promise((f) => setTimeout(f, 300))
  }
  return null
}

/** Steht ein Ereignistyp im Protokoll? Liest die Datei jedes Mal neu. */
export function protokollHat(pfad, typ) {
  try {
    const text = new TextDecoder().decode(Bun.zstdDecompressSync(readFileSync(pfad)))
    return text.includes(`"type":"${typ}"`)
  } catch {
    return false
  }
}

async function haupt() {
  const portArg = Number(process.argv[2] ?? 3065)
  console.log('Wiederaufnahme — überlebt der Verlauf einen Abbruch?')
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
          rpcId: `wied-${String(Math.random()).slice(2, 8)}`,
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

    // ---------------------------------------------------------------------------
    // **Erst der Auftrag, DANN folgen.** Hier stand es umgekehrt — und die Sonde
    // scheiterte an sich selbst: eine **leere** Sitzung hat noch keinen Verlauf, also
    // liefert ihr Eröffnungsrahmen **keinen Schnitt** (`throughSeq = null`). Gemessen:
    // `ABBRUCH: kein throughSeq im ersten Rahmen`, Exit 1.
    //
    // Für die Wiederaufnahme ist die umgekehrte Reihenfolge ohnehin die richtige: es geht
    // darum, **mitten im Lauf** zu trennen — also muß der Lauf laufen.
    // ---------------------------------------------------------------------------
    console.log('')
    console.log('== 0. Erst eine KLEINE Runde, damit ein Verlauf entsteht ==')
    // **Die Reihenfolge, die zwei Fehlversuche gekostet hat.**
    //   Versuch 1: folgen, bevor etwas im Verlauf steht → kein Schnitt (`throughSeq = null`).
    //   Versuch 2: kleiner Auftrag, dann 15 s mit einer UNGÜLTIGEN Abfrage gewartet
    //              (`throughSeq: 10_000`) → der Lauf war danach FERTIG, die Lücke leer,
    //              der Test ungültig (Exit 2, von der Gegenprobe gemeldet).
    // Jetzt: kleine Runde absetzen, ihr Ende **in der Protokolldatei** abwarten — nicht
    // über die API raten —, DANN folgen und erst danach den langen Auftrag absetzen.
    await ruf('session/prompt', {
      request: {
        requestId: `wied-klein-${String(Date.now())}`,
        sessionId: sid,
        mode: 'queue',
        content: [{ type: 'text', text: 'Antworte mit genau einem Wort: VORLAUF' }],
      },
    })
    const logPfad = await warteAufProtokoll(sid, 30_000)
    let rundeFertig = false
    if (logPfad !== null) {
      const grenze = Date.now() + 60_000
      while (Date.now() < grenze && !rundeFertig) {
        await new Promise((f) => setTimeout(f, 500))
        rundeFertig = protokollHat(logPfad, 'turn/end')
      }
    }
    console.log(`  Vorlauf beendet: ${rundeFertig ? 'ja' : 'NEIN (Zeitgrenze)'}`)
    console.log(`  Protokoll: ${logPfad === null ? '(nicht gefunden)' : 'gefunden'}`)

    // ---- 1. Erste Strecke, folgen ----
    const erste = await streckeOeffnen(port, cookie, 'wied-1')
    if (erste.ws === null) {
      console.log('ABBRUCH: Aufwertung nicht angenommen')
      process.exitCode = 2
      return
    }
    erste.ws.send(
      JSON.stringify({
        type: 'open',
        streamId: 'wied-1',
        endpoint: 'session/follow',
        payload: { args: { request: { address: { kind: 'session', sessionId: sid }, maxMessages: 30 } } },
      }),
    )
    const bisSchnapp1 = Date.now() + 10_000
    while (Date.now() < bisSchnapp1 && !erste.rahmen.some((r) => schnittAus(r) !== null)) {
      await new Promise((f) => setTimeout(f, 150))
    }
    const schnitt1 = erste.rahmen.map(schnittAus).find((x) => x !== null) ?? null
    const cursor1 = erste.rahmen
      .map((r) => rahmenFelder(r).cursor)
      .find((x) => x !== null)
    console.log(`  Erster Eröffnungsrahmen: throughSeq = ${String(schnitt1)}, cursor = ${String(cursor1)}`)
    if (schnitt1 === null && cursor1 === null) {
      console.log('ABBRUCH: weder throughSeq noch cursor im ersten Rahmen')
      console.log('  Ohne Schnitt ist der Verlauf nicht anforderbar — die Sonde sagt das,')
      console.log('  statt einen Wert zu erfinden.')
      process.exitCode = 1
      return
    }
    /** Der Schnitt für `session/page`: `throughSeq` wenn vorhanden, sonst der `cursor`. */
    const schnittWert = schnitt1 ?? cursor1
    if (schnitt1 === null) {
      console.log('  HINWEIS: kein `throughSeq` — es wird der `cursor` benutzt und das GESAGT.')
    }

    // ---- 2. JETZT den langen Auftrag — und nur kurz sammeln, dann reißen ----
    await ruf('session/prompt', {
      request: {
        requestId: `wied-lang-${String(Date.now())}`,
        sessionId: sid,
        mode: 'queue',
        content: [
          {
            type: 'text',
            text: 'Führe NACHEINANDER sechs Befehle aus und melde jeden einzeln: echo A1, echo A2, echo A3, echo A4, echo A5, echo A6. Antworte erst danach mit einem Wort.',
          },
        ],
      },
    })
    await new Promise((f) => setTimeout(f, SAMMEL_MS))
    const seqsVorher = erste.rahmen.map(seqAus).filter((x) => x !== null)
    const hoechsterVorher = seqsVorher.length === 0 ? schnittWert : Math.max(...seqsVorher, schnittWert)
    console.log(`  Lauf läuft. Rahmen bisher: ${String(erste.rahmen.length)}, höchster seq: ${String(hoechsterVorher)}`)

    // ---- 3. Die Strecke ZERREISSEN ----
    erste.ws.close()
    console.log('')
    console.log(`== ABBRUCH — Strecke geschlossen, der Lauf läuft WEITER ==`)
    console.log(`  ${String(TRENN_MS)} ms ohne Zuhörer …`)
    await new Promise((f) => setTimeout(f, TRENN_MS))

    // ---- 4. Neu verbinden ----
    const zweite = await streckeOeffnen(port, cookie, 'wied-2')
    if (zweite.ws === null) {
      console.log('ABBRUCH: die zweite Aufwertung wurde nicht angenommen')
      process.exitCode = 1
      return
    }
    zweite.ws.send(
      JSON.stringify({
        type: 'open',
        streamId: 'wied-2',
        endpoint: 'session/follow',
        payload: { args: { request: { address: { kind: 'session', sessionId: sid }, maxMessages: 30 } } },
      }),
    )
    const bisSchnapp2 = Date.now() + 15_000
    while (Date.now() < bisSchnapp2 && !zweite.rahmen.some((r) => schnittAus(r) !== null)) {
      await new Promise((f) => setTimeout(f, 150))
    }
    const schnitt2 = zweite.rahmen.map(schnittAus).find((x) => x !== null) ?? null
    const cursor2 = zweite.rahmen
      .map((r) => rahmenFelder(r).cursor)
      .find((x) => x !== null)
    console.log('')
    console.log('== 1. Wieder Anschluß? ==')
    console.log(`  Zweiter Eröffnungsrahmen: throughSeq = ${String(schnitt2)}, cursor = ${String(cursor2)}`)
    // **Die Felder im Wortlaut.** Mein erster Blick griff `throughSeq` — und bekam einen
    // Wert, der KLEINER war als das, was live schon angekommen war. Bevor daraus ein Befund
    // über den Host wird, wird der Rahmen GELESEN.
    for (const r of zweite.rahmen.slice(0, 2)) {
      console.log(`  Rahmen (${String(r.length)} Zeichen), Anfang:`)
      console.log(`    ${r.slice(0, 260)}`)
      console.log(`    … Ende: ${r.slice(-200)}`)
    }
    const deckt = schnitt2 !== null && schnitt2 >= hoechsterVorher
    console.log(`  deckt die Lücke (${String(schnitt2)} >= ${String(hoechsterVorher)}): ${deckt ? 'JA' : 'NEIN'}`)

    // ---- 5. Den Verlauf rückwärts blättern und ALLE seq sammeln ----
    console.log('')
    console.log('== 2. Verlauf rückwärts blättern ==')
    const alleSeq = []
    let beforeSeq = undefined
    let seiten = 0
    let hasMore = true
    while (hasMore && seiten < 20) {
      const anfrage = {
        address: { kind: 'session', sessionId: sid },
        throughSeq: schnitt2 ?? 0,
        ...(beforeSeq === undefined ? {} : { beforeSeq }),
        maxMessages: 20,
      }
      const seite = await ruf('session/page', { request: anfrage })
      if (seite.ok !== true) {
        console.log(`  Seite ${String(seiten + 1)} scheiterte: ${JSON.stringify(seite.fehler)}`)
        break
      }
      const w = seite.wert ?? {}
      const eintraege = Array.isArray(w.records) ? w.records : []
      for (const r of eintraege) {
        const seq = r?.seq ?? r?.event?.seq
        if (typeof seq === 'number') alleSeq.push(seq)
      }
      seiten += 1
      hasMore = w.hasMore === true
      const kleinster = eintraege
        .map((r) => r?.seq ?? r?.event?.seq)
        .filter((x) => typeof x === 'number')
        .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY)
      if (!Number.isFinite(kleinster)) break
      beforeSeq = kleinster
      if (kleinster <= 0) break
    }
    console.log(`  ${String(seiten)} Seite(n), ${String(alleSeq.length)} Einträge eingesammelt`)

    // ---- 6. Urteil ----
    const menge = new Set(alleSeq)
    const dubletten = alleSeq.length - menge.size
    const kleinster = alleSeq.length === 0 ? 0 : Math.min(...alleSeq)
    const groesster = alleSeq.length === 0 ? 0 : Math.max(...alleSeq)
    const fehlend = []
    for (let i = kleinster; i <= groesster; i++) if (!menge.has(i)) fehlend.push(i)

    console.log('')
    console.log('== 3. Lückenlos und ohne Doppelung? ==')
    console.log(`  Bereich: ${String(kleinster)} … ${String(groesster)}`)
    console.log(`  vorhanden: ${String(menge.size)} verschiedene seq`)
    console.log(`  Dubletten: ${String(dubletten)}`)
    console.log(`  fehlende seq: ${fehlend.length === 0 ? 'KEINE' : fehlend.slice(0, 12).join(', ') + (fehlend.length > 12 ? ` … (+${String(fehlend.length - 12)})` : '')}`)

    console.log('')
    console.log('== BEFUND ==')

    // ---------------------------------------------------------------------------
    // **Die Gegenprobe, die den Test erst gültig macht.**
    // ---------------------------------------------------------------------------
    // Ist der Schnitt nach dem Riß **nicht größer** als davor, dann ist in der Lücke
    // **nichts geschehen** — der Lauf war fertig oder pausierte. Dann belegt der Lauf
    // nur, daß man sich nach einem **abgeschlossenen** Verlauf wieder verbinden kann,
    // und sagt über die Wiederaufnahme **während** eines Laufs **nichts**.
    //
    // Im ersten Lauf dieser Sonde war genau das der Fall: `throughSeq` war **vor und
    // nach** dem Riß **15**. Ohne diese Prüfung hätte die Sonde „BELEGT" gemeldet — und
    // der Befund wäre leer gewesen.
    const lueckeWarLeer = schnitt2 !== null && schnitt2 <= hoechsterVorher
    if (lueckeWarLeer) {
      console.log(`  UNGÜLTIGER LAUF: der Schnitt ist nach dem Riß NICHT gewachsen`)
      console.log(`    vorher: ${String(hoechsterVorher)}   nachher: ${String(schnitt2)}`)
      console.log('  In der Lücke ist also NICHTS geschehen. Der Lauf belegt die Wiederaufnahme')
      console.log('  während eines Laufs NICHT — er belegt nur, daß man sich nach einem')
      console.log('  abgeschlossenen Verlauf wieder verbinden kann.')
      console.log('  Das ist ein Befund über den TEST, nicht über den Host.')
      process.exitCode = 2
    } else if (schnitt2 === null) {
      console.log('  Kein zweiter Eröffnungsrahmen — die Wiederaufnahme ist NICHT belegt.')
      process.exitCode = 1
    } else if (fehlend.length === 0 && dubletten === 0 && deckt) {
      console.log('  Die Wiederaufnahme ist BELEGT:')
      console.log(`    - neuer Anschluß nach ${String(TRENN_MS)} ms ohne Zuhörer`)
      console.log(`    - der Schnitt WUCHS über die Lücke: ${String(hoechsterVorher)} -> ${String(schnitt2)}`)
      console.log(`    - ${String(menge.size)} seq LÜCKENLOS von ${String(kleinster)} bis ${String(groesster)}`)
      console.log('    - KEINE Doppelung')
      console.log('  Der Verlauf überlebt also einen Abbruch MITTEN IM LAUF — vollständig.')
      process.exitCode = 0
    } else {
      console.log('  Die Wiederaufnahme ist NICHT belegt:')
      if (fehlend.length > 0) console.log(`    - ${String(fehlend.length)} seq FEHLEN`)
      if (dubletten > 0) console.log(`    - ${String(dubletten)} Doppelungen`)
      if (!deckt) console.log('    - der neue Schnitt deckt den Lauf davor NICHT')
      process.exitCode = 1
    }
    zweite.ws?.close()
  } finally {
    kind.kill()
    await new Promise((f) => setTimeout(f, 400))
  }
}

if (import.meta.main === true) await haupt()
