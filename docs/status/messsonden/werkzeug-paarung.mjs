/**
 * Meßsonde: **Werkzeug-Paarung** — je Werkzeug grün/rot, aus echten Sitzungsprotokollen.
 *
 * ## Warum diese Sonde existiert
 *
 * Der Nachweis `werkzeug-nachweis.md` beruht auf **Agentenberichten** („pwsh: OK") aus
 * einzelnen Sitzungen. Das ist schwach: der Agent **behauptet** Grün, und niemand prüft
 * es nach. Diese Sonde liest statt dessen die **Ereignisse selbst**: jedes `tool/call`
 * und jedes `tool/result` aus allen vorhandenen Protokollen, und paart sie.
 *
 * ## Der Schlüssel, an dem mein erster Versuch scheiterte
 *
 * `tool/result` trägt die Form `{turn, step, message}`. Ich hatte über `message.id`
 * gepaart — eine **UUID der Nachricht**, die mit dem Aufruf nichts zu tun hat — und
 * bekam **0 Zuordnungen aus 112 Ergebnissen**. Der richtige Schlüssel steht **im**
 * `message`:
 *
 * ```json
 * "message": { "role": "tool",
 *              "toolCallId": "call_00_ET_rT4CtZYkuDj2QWryf6WQ2645",
 *              "source": { "kind": "tool", "callId": "call_00_ET_…" } }
 * ```
 *
 * `message.toolCallId` (gespiegelt in `message.source.callId`) ist der Schlüssel.
 * Gegenprobe, die den Fehler sichtbar macht: paart man über `turn|step`, „findet" man
 * 112 von 112 — aber **falsch**, denn in einem Schritt können mehrere Werkzeuge laufen
 * (gemessen: ein `pwsh`-Aufruf paarte sich mit **zwei** Ergebnissen). Eine Paarung, die
 * zu gut aussieht, ist verdächtig.
 *
 * ## Was diese Sonde NICHT behauptet
 *
 * **Ein Werkzeugfehler ist nicht gleich ein Werkzeugdefekt.** Die Sonde trennt deshalb
 * drei Klassen, und nur die erste ist ein Defekt:
 *
 * | Klasse | Bedeutung | Beispiel |
 * |---|---|---|
 * | `defekt` | die **Seite des Harness** versagt | `ripgrep provider failure` |
 * | `regel` | eine Regel **greift wie vorgesehen** | `file has not been read` |
 * | `aufruf` | der **Agent** hat etwas Unmögliches verlangt | Datei gibt es nicht |
 * | `unklar` | nicht entscheidbar (Abbruch, Zeitgrenze) | `search aborted` |
 *
 * Und: die Protokolle reichen **über zwei Zeiträume** — vor und nach der
 * `bunfig.toml`-Ergänzung, die den `--`-Trenner nachliefert. Eine Summe über beide
 * beschreibt **keinen** Zustand. Deshalb gibt die Sonde die Zeitfolge mit aus.
 *
 * @module docs/status/messsonden/werkzeug-paarung
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Vorgabe: das Harness-Home des Projekts. */
const VORGABE_HOME = new URL('../../../.pmh-build/harness-home', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/u, '$1')
  .replace(/\//gu, '\\')

/** Die drei Fehlerklassen, nach Muster erkannt — mit dem Muster daneben, damit es prüfbar ist. */
export const KLASSEN = [
  { klasse: 'defekt', muster: /ripgrep provider failure|subprocess runner requires target argv|dispatcher\.close is not a function/u },
  { klasse: 'regel', muster: /file has not been read|not been read — read the file/u },
  { klasse: 'aufruf', muster: /not found|not a regular file|EISDIR|no such file/iu },
  { klasse: 'unklar', muster: /aborted|interrupted after it was recorded|timeout|timed out/iu },
]

/**
 * Ordnet einen Fehlertext einer Klasse zu.
 *
 * **Unbekanntes wird `unklar`, nicht `defekt`.** Wer im Zweifel „Defekt" meldet,
 * erzeugt Arbeit, die keine ist; wer im Zweifel „unklar" meldet, erzeugt eine Frage.
 *
 * @param {string} text
 * @returns {'defekt'|'regel'|'aufruf'|'unklar'}
 */
export function klasse(text) {
  for (const k of KLASSEN) {
    if (k.muster.test(text)) return k.klasse
  }
  return 'unklar'
}

function findeLogs(dir, aus = []) {
  let eintraege
  try {
    eintraege = readdirSync(dir, { withFileTypes: true })
  } catch {
    return aus
  }
  for (const e of eintraege) {
    const p = join(dir, e.name)
    if (e.isDirectory()) findeLogs(p, aus)
    else if (e.name.endsWith('.jsonl.zstd')) aus.push(p)
  }
  return aus
}

/**
 * Liest **eine** Sitzung und liefert die gepaarten Aufrufe.
 *
 * @param {string} pfad
 * @returns {{aufrufe: Array<{name: string, turn: unknown, step: unknown, isError: boolean|null, text: string}>}}
 */
export function leseSitzung(pfad) {
  let text
  try {
    text = new TextDecoder().decode(Bun.zstdDecompressSync(readFileSync(pfad)))
  } catch {
    return { aufrufe: [], cwd: null }
  }
  const rufer = new Map()
  const ergebnis = new Map()
  let cwd = null
  for (const zeile of text.split('\n')) {
    if (zeile.trim() === '') continue
    let ev
    try {
      ev = JSON.parse(zeile)
    } catch {
      continue
    }
    // `cwd` steht auf der **obersten** Ebene des `session`-Ereignisses — nicht unter
    // `data`. Meine erste Fassung suchte unter `data.cwd` und bekam für **alle** 18
    // Sitzungen `null`: ein falscher Feldpfad, der wie „kein Wert" aussah.
    if (ev.type === 'session') cwd = ev.cwd ?? null
    if (ev.type === 'tool/call') {
      const d = ev.data ?? {}
      if (d.callId !== undefined) rufer.set(d.callId, { name: String(d.name), turn: d.turn, step: d.step })
    } else if (ev.type === 'tool/result') {
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
  const aufrufe = []
  for (const [id, r] of rufer) {
    const e = ergebnis.get(id)
    aufrufe.push({
      name: r.name,
      turn: r.turn,
      step: r.step,
      isError: e === undefined ? null : e.isError,
      text: e?.text ?? '',
    })
  }
  return { aufrufe, cwd }
}

/**
 * Führt alle Sitzungen zu einer Bilanz zusammen.
 *
 * @param {Array<{pfad: string, zeit: number, aufrufe: Array}>} sitzungen
 */
export function bilanz(sitzungen) {
  const jeWerkzeug = new Map()
  for (const s of sitzungen) {
    for (const a of s.aufrufe) {
      const z = jeWerkzeug.get(a.name) ?? {
        aufrufe: 0, ergebnisse: 0, ohneErgebnis: 0,
        defekt: 0, regel: 0, aufruf: 0, unklar: 0,
        texte: new Map(),
      }
      z.aufrufe += 1
      if (a.isError === null) {
        z.ohneErgebnis += 1
      } else {
        z.ergebnisse += 1
        if (a.isError) {
          const k = klasse(a.text)
          z[k] += 1
          const kurz = a.text.replace(/\s+/gu, ' ').trim().slice(0, 140)
          z.texte.set(kurz, (z.texte.get(kurz) ?? 0) + 1)
        }
      }
      jeWerkzeug.set(a.name, z)
    }
  }
  return jeWerkzeug
}

/**
 * Das Urteil je Werkzeug — **nur `defekt` zählt gegen das Werkzeug**.
 *
 * @param {ReturnType<typeof bilanz> extends Map<string, infer V> ? V : never} z
 * @returns {string}
 */
export function urteil(z) {
  if (z.aufrufe === 0) return 'nicht benutzt'
  if (z.defekt > 0) return z.defekt === z.aufrufe ? 'ROT (Defekt)' : 'TEILWEISE DEFEKT'
  if (z.ohneErgebnis > 0) return 'OHNE ERGEBNIS'
  return 'GRUEN'
}

function haupt() {
  const home = process.argv[2] ?? VORGABE_HOME
  // Der Umschlagpunkt: die Reparatur, die den `--`-Trenner nachliefert. Sie wirkt nur,
  // wenn die Vorladung aus `bunfig.toml` geladen wird — und die hängt am cwd.
  const UMSCHLAG = Date.parse(process.argv[3] ?? '2026-10-13T18:01:46Z')
  const PROJEKT = 'prometheus-harness'

  const pfade = findeLogs(home)
  const sitzungen = pfade
    .map((p) => ({ pfad: p, zeit: statSync(p).mtimeMs }))
    .map((s) => ({ ...s, ...leseSitzung(s.pfad) }))
    .sort((a, b) => a.zeit - b.zeit)

  console.log(`Harness-Home: ${home}`)
  console.log(`Protokolle:   ${String(sitzungen.length)}`)
  console.log(`Umschlagpunkt: ${new Date(UMSCHLAG).toISOString()} (die Ergänzung des --Trenners)`)
  console.log('')

  // 1. Je Sitzung, in Zeitfolge — das trennt „vor der Ergänzung" von „danach".
  console.log('== Je Sitzung, in Zeitfolge ==')
  console.log('  Zeit(UTC)         Auf  Fehl  Def  cwd      Werkzeuge mit Defekt')
  for (const s of sitzungen) {
    const fehler = s.aufrufe.filter((a) => a.isError === true).length
    const defekt = s.aufrufe.filter((a) => a.isError === true && klasse(a.text) === 'defekt')
    const namen = [...new Set(defekt.map((a) => a.name))].join(', ')
    const lage = String(s.cwd).includes(PROJEKT) ? 'Projekt' : s.cwd === null ? '?' : 'FREMD'
    console.log(
      `  ${new Date(s.zeit).toISOString().slice(0, 16).replace('T', ' ')}  ${String(s.aufrufe.length).padStart(3)}  ` +
        `${String(fehler).padStart(4)}  ${String(defekt.length).padStart(3)}  ${lage.padEnd(7)}  ${namen}`,
    )
  }

  // 2. Getrennt nach cwd — DAS ist der Befund, nicht die Gesamtsumme.
  const gruppen = new Map()
  for (const s of sitzungen) {
    const lage = String(s.cwd).includes(PROJEKT) ? 'Projekt' : s.cwd === null ? 'ohne cwd' : 'FREMD'
    const nach = s.zeit >= UMSCHLAG ? 'nach' : 'vor'
    const schluessel = `${lage} / ${nach}`
    const g = gruppen.get(schluessel) ?? { sitzungen: [], werkzeuge: new Map(), defekte: 0, aufrufe: 0 }
    g.sitzungen.push(s)
    g.aufrufe += s.aufrufe.length
    for (const a of s.aufrufe) {
      g.werkzeuge.set(a.name, (g.werkzeuge.get(a.name) ?? 0) + 1)
      if (a.isError === true && klasse(a.text) === 'defekt') g.defekte += 1
    }
    gruppen.set(schluessel, g)
  }

  console.log('')
  console.log('== Getrennt nach Arbeitsverzeichnis und Zeitpunkt ==')
  for (const [schluessel, g] of [...gruppen.entries()].sort()) {
    const namen = [...g.werkzeuge.keys()].sort()
    console.log(
      `  ${schluessel.padEnd(18)}  Sitzungen ${String(g.sitzungen.length).padStart(2)}  Aufrufe ${String(g.aufrufe).padStart(3)}  ` +
        `Defekte ${String(g.defekte).padStart(2)}  Werkzeuge ${String(namen.length).padStart(2)}`,
    )
    console.log(`      ${namen.join(', ')}`)
  }

  // 3. Gesamtbilanz
  const gesamt = bilanz(sitzungen)
  console.log('')
  console.log('== Bilanz je Werkzeug (nur „defekt" zählt gegen das Werkzeug) ==')
  console.log('  Werkzeug              Aufrufe  ohne Erg.  defekt  regel  aufruf  unklar  Urteil')
  const zeilen = [...gesamt.entries()].sort((a, b) => b[1].aufrufe - a[1].aufrufe)
  for (const [name, z] of zeilen) {
    console.log(
      `  ${name.padEnd(20)}  ${String(z.aufrufe).padStart(7)}  ${String(z.ohneErgebnis).padStart(9)}  ` +
        `${String(z.defekt).padStart(6)}  ${String(z.regel).padStart(5)}  ${String(z.aufruf).padStart(6)}  ` +
        `${String(z.unklar).padStart(6)}  ${urteil(z)}`,
    )
  }

  // 4. Die Defekttexte im Wortlaut — der Befund, nicht die Zahl.
  console.log('')
  console.log('== Defekttexte im Wortlaut ==')
  let defekte = 0
  for (const [name, z] of zeilen) {
    const nurDefekt = [...z.texte.entries()].filter(([t]) => klasse(t) === 'defekt')
    if (nurDefekt.length === 0) continue
    console.log(`  ${name}:`)
    for (const [t, n] of nurDefekt.sort((a, b) => b[1] - a[1])) {
      defekte += n
      console.log(`     ${String(n)}x  ${t}`)
    }
  }
  if (defekte === 0) console.log('  keine')

  // 5. Aufrufe ohne Ergebnis benennen.
  const ohne = sitzungen.flatMap((s) =>
    s.aufrufe.filter((a) => a.isError === null).map((a) => ({ ...a, zeit: s.zeit })),
  )
  console.log('')
  console.log(`== Aufrufe OHNE Ergebnis: ${String(ohne.length)} ==`)
  for (const a of ohne) {
    console.log(`  ${a.name}  turn=${String(a.turn)} step=${String(a.step)}  (${new Date(a.zeit).toISOString().slice(0, 16)})`)
  }

  // 6. Welche Werkzeuge wurden überhaupt benutzt? Beantwortet die A3-Frage
  //    „steht web_fetch in unserer Liste?" aus den Daten statt aus einer Behauptung.
  console.log('')
  console.log('== Benutzte Werkzeuge (aus den Ereignissen, nicht aus einer Liste) ==')
  console.log(`  ${zeilen.map(([n]) => n).join(', ')}`)

  process.exitCode = 0
}

if (import.meta.main === true) haupt()
