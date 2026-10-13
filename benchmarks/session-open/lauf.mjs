/**
 * `benchmarks/session-open/` — den Sitzungspfad messen: schreiben, lesen, falten.
 *
 * ## Warum es diesen Benchmark heute schon gibt
 *
 * `benchmarks/` ist aus der Vorlage übernommen und war **leer**. Die anderen
 * Benchmarks messen den **laufenden Agenten** — und der ist noch nicht an eine
 * Anwendung angeschlossen (siehe `benchmarks/README.md`). Dieser hier mißt den
 * Teil, der **fertig** ist: das Sitzungsformat und seine JSONL-Ablage.
 *
 * **Und dieser Teil ist der, der es am nötigsten hat.** Sitzungen wachsen mit
 * jedem Turn. Eine Umsetzung, die quadratisch wächst, ist bei zwanzig Ereignissen
 * schnell und bei zwanzigtausend unbrauchbar — und ein Zeitbudget für eine feste
 * Eingabegröße fängt das **nie**. Deshalb prüft dieser Benchmark nicht nur „wie
 * schnell", sondern „wie wächst es".
 *
 * ## Was gemessen wird
 *
 * | Pfad | Was der Benutzer davon merkt |
 * |---|---|
 * | `parseSession` | eine Sitzung öffnen |
 * | `foldSession` | den Verlauf zu Nachrichten falten (was das Modell sieht) |
 * | `writeSession` · `readSession` | auf Platte schreiben und wieder lesen |
 *
 * ## Warum unter **plain Node** und nicht unter Bun
 *
 * Die Vorlage schreibt es vor: *„zeitlich gemessener Code läuft unter plain Node,
 * niemals unter TSX"* (`docs/dsh/original/testing.md`). Der Grund ist derselbe,
 * aus dem dieses Verzeichnis eine Aufwärmphase benutzt: verschiedene Laufzeiten
 * haben verschiedene Compiler, und ein Benchmark soll die **Arbeit** messen, nicht
 * die Laufzeit.
 *
 * **Was wir hier nicht können:** unsere Pakete sind TypeScript, und Node führt
 * TypeScript nicht direkt aus. Gemessen wird deshalb unter Bun — **und das steht
 * in jeder Ausgabe**. Ein Vergleich mit Werten aus der Vorlage ist damit
 * **nicht** zulässig, und die Zahlen dieses Benchmarks gelten nur gegen sich
 * selbst (Regression), nicht gegen fremde.
 *
 * Aufruf:
 *
 *     bun benchmarks/session-open/lauf.mjs
 *
 * @module benchmarks/session-open
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { foldSession, parseSession, serializeLine } from '../../packages/agent/session-format/src/index.ts'
import {
  readSession,
  sessionPaths,
  writeSession,
} from '../../packages/agent/session-persistence-jsonl/src/index.ts'
import { fuehreAus, alsGroesse, messe, messeSpeicher, pruefeBudget, pruefeSkalierung } from '../support/messen.mjs'

/**
 * Die Zeitbudgets — **und warum sie so gewählt sind**.
 *
 * Es gibt keine Vorgabe aus der Vorlage, die wir übernehmen könnten: dort wird
 * der **laufende Agent** gemessen, hier ein Bibliothekspfad. Diese Zahlen sind
 * deshalb **Startwerte**, die den heutigen Stand festhalten. Ihr Zweck ist die
 * **Regression**: wird eine Änderung zehnmal langsamer, schlägt der Benchmark an.
 *
 * **Warum so großzügig.** Ein zu knappes Budget wird bei fremder Last rot, und
 * dann wird es erhöht — und dann fängt es nichts mehr. Ein Budget, das eine
 * Größenordnung Spielraum läßt, fängt die Fehler, die zählen.
 */
export const BUDGETS = {
  /** 2.000 Ereignisse falten: was das Modell als Verlauf sieht. */
  falten2000: 60,
  /** 2.000 Zeilen schreiben, Vorgabe flushEvery: 1 — jedes Ereignis einzeln. */
  schreiben2000: 250,
  /** Derselbe Weg gebündelt (flushEvery: 256). */
  schreiben2000Gebuendelt: 250,
  /** 2.000 Zeilen lesen: eine Sitzung öffnen. */
  lesen2000: 250,
}

/**
 * Baut eine Sitzung mit `n` Ereignissen.
 *
 * **Synthetische Eingabe, wie die Vorlage es verlangt** — damit die Größe
 * *gewählt* werden kann und nicht vom Zufall eines echten Verlaufs abhängt.
 *
 * **Warum der Inhalt realistisch lang ist und nicht `"x"`.** Die Arbeit hängt an
 * der Länge der Zeichenketten: eine Sitzung aus lauter Ein-Zeichen-Ereignissen zu
 * messen, hieße den JSON-Aufwand zu unterschätzen. Diese Ereignisse tragen
 * Textlängen, wie sie ein Gespräch mit Werkzeugausgaben hat.
 *
 * @param n - die Zahl der Ereignisse
 * @returns die Ereignisse in Reihenfolge
 */
export function baueEreignisse(n) {
  const ereignisse = []
  let seq = 1
  const druecken = (text, laenge) => `${text} ${'…'.repeat(0)}${'a'.repeat(Math.max(0, laenge - text.length - 1))}`
  ereignisse.push({
    v: 1,
    seq: seq++,
    at: new Date(1_700_000_000_000).toISOString(),
    type: 'session-start',
    id: 's-bench-0001',
    model: 'deepseek-v4-flash',
    cwd: 'C:\\arbeit\\projekt',
    writer: 'benchmark',
  })
  ereignisse.push({ v: 1, seq: seq++, at: new Date(1_700_000_001_000).toISOString(), type: 'system-prompt', text: druecken('Du bist ein Agent.', 800) })
  let turn = 1
  let step = 1
  while (ereignisse.length < n - 2) {
    ereignisse.push({ v: 1, seq: seq++, at: new Date(1_700_000_000_000 + seq * 1000).toISOString(), type: 'turn-start', turn })
    ereignisse.push({ v: 1, seq: seq++, at: new Date(1_700_000_000_000 + seq * 1000).toISOString(), type: 'user-input', text: druecken(`Frage ${String(turn)}`, 200) })
    ereignisse.push({ v: 1, seq: seq++, at: new Date(1_700_000_000_000 + seq * 1000).toISOString(), type: 'step-start', turn, step })
    ereignisse.push({
      v: 1,
      seq: seq++,
      at: new Date(1_700_000_000_000 + seq * 1000).toISOString(),
      type: 'model-reply',
      text: druecken(`Antwort ${String(turn)}`, 1200),
      toolCalls: [],
    })
    ereignisse.push({ v: 1, seq: seq++, at: new Date(1_700_000_000_000 + seq * 1000).toISOString(), type: 'usage', inputTokens: 900, outputTokens: 120 })
    ereignisse.push({ v: 1, seq: seq++, at: new Date(1_700_000_000_000 + seq * 1000).toISOString(), type: 'step-end', turn, step })
    ereignisse.push({ v: 1, seq: seq++, at: new Date(1_700_000_000_000 + seq * 1000).toISOString(), type: 'turn-end', turn, reason: 'done' })
    turn += 1
  }
  while (ereignisse.length < n) {
    ereignisse.push({ v: 1, seq: seq++, at: new Date(1_700_000_000_000 + seq * 1000).toISOString(), type: 'session-end', reason: 'benchmark' })
  }
  return ereignisse
}

/**
 * Baut den JSONL-Text einer Sitzung.
 *
 * @param n - die Zahl der Ereignisse
 * @returns der Text
 */
export function baueText(n) {
  return `${baueEreignisse(n).map((e) => serializeLine(e)).join('\n')}\n`
}

/** Ein frisches Verzeichnis für den Schreib-/Lesepfad. */
async function mitVerzeichnis(koerper) {
  const dir = mkdtempSync(join(tmpdir(), 'pmh-bench-'))
  try {
    return await koerper(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const BENCH_ID = 's-bench-0001'

/**
 * Führt die Messungen aus.
 *
 * @returns {number} die Zahl der Befunde
 */
export async function laufe() {
  const teile = []

  // ── Lesen und Falten: die zwei reinen Pfade ────────────────────────────────
  const text2000 = baueText(2000)

  teile.push(async () => {
    const m = await messe(() => parseSession(text2000), { aufwaermen: 5, laeufe: 20 })
    return pruefeBudget(
      {
        name: 'parseSession, 2000 Ereignisse',
        grenzeMs: BUDGETS.falten2000,
        warum: 'eine Sitzung öffnen: der Benutzer wartet darauf',
      },
      m,
    )
  })

  teile.push(async () => {
    const bericht = parseSession(text2000)
    const m = await messe(() => foldSession(bericht.events), { aufwaermen: 5, laeufe: 20 })
    return pruefeBudget(
      {
        name: 'foldSession, 2000 Ereignisse',
        grenzeMs: BUDGETS.falten2000,
        warum: 'den Verlauf zum Modell falten: geschieht vor jedem Aufruf',
      },
      m,
    )
  })

  // ── Skalierung: der Fehler, den ein festes Budget nie fängt ───────────────
  teile.push(async () =>
    pruefeSkalierung(
      {
        von: 2000,
        bis: 20000,
        koerper: (n) => () => foldSession(parseSession(baueText(n)).events),
        aufwaermen: 5,
        laeufe: 15,
      },
      1.25,
    ),
  )

  teile.push(async () =>
    pruefeSkalierung(
      {
        von: 2000,
        bis: 20000,
        koerper: (n) => () => parseSession(baueText(n)),
        aufwaermen: 5,
        laeufe: 15,
      },
      1.25,
    ),
  )

  // ── Auf Platte: schreiben und lesen ───────────────────────────────────────
  //
  // **Der Fehler, den dieser Teil zuerst hatte.** Er rief
  // `writeSession(pfad, {id, title}, ereignisse)` auf — die Signatur ist aber
  // `writeSession({root, id, model, cwd, events})`. Der Aufruf **warf**, und der
  // Aufruf darunter meldete danach `readSession: 0,00 ms`. Das sah nach einer
  // hervorragenden Zahl aus und war eine **nicht durchgeführte Messung**.
  //
  // Deshalb umschließt jeder Teil unten den Schreibvorgang mit einer Prüfung:
  // erst schreiben, **dann** nachsehen, ob die Dateien da sind. Ohne diese
  // Prüfung meldet ein Benchmark die Geschwindigkeit von nichts.
  const schreibOptionen = (dir) => ({
    root: join(dir, 'sitzungen'),
    id: BENCH_ID,
    model: 'deepseek-v4-flash',
    cwd: dir,
    title: 'Benchmark',
  })

  /**
   * Zählt die nicht-leeren Zeilen der geschriebenen Ereignisdatei.
   *
   * **Warum diese Kontrolle sein muß.** Ein Benchmark, der die Dauer eines
   * Schreibvorgangs mißt, ohne nachzusehen, ob etwas geschrieben wurde, meldet
   * die Geschwindigkeit von **nichts**. Genau das ist hier passiert: ein falscher
   * Aufruf ließ `writeSession` werfen, und die Messung darunter meldete
   * `readSession: 0,00 ms` — eine hervorragende Zahl für eine Datei, die es nicht
   * gab. Die **Lese**messung prüft seitdem, daß sie lesen konnte (`probe`);
   * die **Schreib**messungen taten es nicht. Diese Funktion schließt die Lücke.
   *
   * **Warum die Zeilenzahl und nicht `probe.events.length`.** Der Leser liefert
   * **mehr** Ereignisse als übergeben wurden (gemessen: 2004 bei 2000) — er
   * ergänzt eigene. Eine Gleichheit wäre deshalb eine falsche Zusicherung; die
   * Zeilenzahl der Datei ist die Zahl, die der Schreibvorgang tatsächlich
   * erzeugt hat, und damit die ehrliche.
   *
   * **Der eigene Fehler, den diese Kontrolle sofort gefunden hat — zweimal.**
   * Die erste Fassung nahm `readdirSync(root).find((d) => d.includes('event'))`
   * und traf einen **Ordner**: `ROT  EISDIR: illegal operation on a directory,
   * read`. Die zweite Fassung nahm nur noch Dateien — und meldete dann korrekt
   * „keine Ereignisdatei geschrieben", weil die Datei **nicht** direkt in `root`
   * liegt. Beide Male hat die Kontrolle eine kaputte Messung **laut** gemacht,
   * statt eine Zahl zu melden, die niemand nachrechnet.
   *
   * **Die Lehre, die daraus im Code steht:** nicht raten, wo die Datei liegt —
   * das Paket exportiert `sessionPaths(root, id)` mit dem Feld `events`. Wer den
   * Pfad selbst zusammensetzt, baut beim nächsten Umbau still daneben.
   *
   * @param root - das Sitzungsverzeichnis
   * @returns Dateiname und Zeilenzahl
   */
  function zeilenDerEreignisdatei(root) {
    const pfad = sessionPaths(root, BENCH_ID).events
    if (!existsSync(pfad)) return { name: pfad, zeilen: 0 }
    const text = readFileSync(pfad, 'utf8')
    return { name: pfad, zeilen: text.split('\n').filter((z) => z.length > 0).length }
  }

  /**
   * Die Kontrolle, die vor jedes Schreiburteil gehört.
   *
   * @param root - das Sitzungsverzeichnis
   * @param erwartet - die Zahl der übergebenen Ereignisse
   * @param beschriftung - der Name der Messung für die Meldung
   * @returns `undefined`, wenn alles stimmt — sonst ein roter Befund
   */
  function pruefeGeschrieben(root, erwartet, beschriftung) {
    const { name, zeilen } = zeilenDerEreignisdatei(root)
    if (name === undefined || zeilen === 0) {
      return {
        ok: false,
        text: `ROT  ${beschriftung}: keine Ereignisdatei geschrieben — die Messung ist ungültig, nicht schnell`,
      }
    }
    if (zeilen < erwartet) {
      return {
        ok: false,
        text:
          `ROT  ${beschriftung}: nur ${String(zeilen)} Zeilen in ${name}, übergeben wurden ` +
          `${String(erwartet)} — die Messung ist ungültig`,
      }
    }
    return undefined
  }

  teile.push(async () =>
    await mitVerzeichnis(async (dir) => {
      const ereignisse = baueEreignisse(2000)
      const m = await messe(
        async () => {
          rmSync(schreibOptionen(dir).root, { recursive: true, force: true })
          // Ohne `await` wird die Zeit des **Anstoßens** gemessen, nicht die des
          // Schreibens — und `messe` wartet auf das Versprechen dieser Funktion.
          await writeSession({ ...schreibOptionen(dir), events: ereignisse })
        },
        { aufwaermen: 3, laeufe: 10 },
      )
      // **Erst nachsehen, dann urteilen.** Sonst meldet der Benchmark die
      // Geschwindigkeit einer Datei, die es nicht gibt.
      const ungültig = pruefeGeschrieben(
        schreibOptionen(dir).root,
        ereignisse.length,
        'writeSession (flushEvery 1)',
      )
      if (ungültig !== undefined) return ungültig
      return pruefeBudget(
        {
          name: 'writeSession (flushEvery 1), 2000 Ereignisse',
          grenzeMs: BUDGETS.schreiben2000,
          warum:
            'der Turn-Abschluß: er darf den Agenten nicht aufhalten. Die Vorgabe ist 1 — ' +
            'jedes Ereignis wird EINZELN angehängt',
        },
        m,
      )
    }),
  )

  // ── Derselbe Weg, gebündelt: der Vergleich, der die Ursache zeigt ─────────
  //
  // **Warum das gemessen wird.** Ein roter Wert sagt „zu langsam", aber nicht
  // **warum** — und ohne den Grund wird die Grenze erhöht statt der Code geändert.
  // Gemessen am 13.10.2026 (Windows nativ, Bun 1.4.0), je 500 Zeilen:
  //
  // | Vorgang | Dauer |
  // |---|---|
  // | 500 × `appendFile` einzeln | **97,3 ms** |
  // | 1 × `writeFile` gebündelt | **0,4 ms** |
  // | 500 × `appendFile` in einer Kette | 99,6 ms |
  //
  // Faktor **240**, und die Kette hilft **nicht** — es sind die **Aufrufe**, nicht
  // die Reihenfolge und nicht ein `fsync`.
  teile.push(async () =>
    await mitVerzeichnis(async (dir) => {
      const ereignisse = baueEreignisse(2000)
      const optionen = schreibOptionen(dir)
      const m = await messe(
        async () => {
          rmSync(optionen.root, { recursive: true, force: true })
          // **`writeSession` mit `flushEvery` — nicht `createSession` von Hand.**
          // Der erste Versuch hing die Ereignisse selbst an und scheiterte an der
          // Reihenfolge: `createSession` schreibt `session-start` bereits als
          // erste Zeile, ein zweites Anhängen ergäbe `seq 1` doppelt. Genau das
          // meldete der Benchmark als Befund. `writeSession` überspringt sie
          // ausdrücklich — und reicht `flushEvery` durch.
          await writeSession({ ...optionen, events: ereignisse, flushEvery: 256 })
        },
        { aufwaermen: 3, laeufe: 10 },
      )
      const ungueltig = pruefeGeschrieben(optionen.root, ereignisse.length, 'writeSession (flushEvery 256)')
      if (ungueltig !== undefined) return ungueltig
      return pruefeBudget(
        {
          name: 'writeSession (flushEvery 256), 2000 Ereignisse',
          grenzeMs: BUDGETS.schreiben2000Gebuendelt,
          warum: 'derselbe Weg gebündelt — zeigt, daß die Zahl der Aufrufe die Ursache ist',
        },
        m,
      )
    }),
  )

  teile.push(async () =>
    await mitVerzeichnis(async (dir) => {
      const optionen = schreibOptionen(dir)
      // **`await` ist hier nicht Kosmetik.** Ohne es läuft der Schreibvorgang
      // weiter, während die nächste Zeile liest — und die Meldung wäre
      // `ENOENT: no such file or directory` auf eine Sitzung, die gerade erst
      // entsteht. Gemessen am 13.10.2026 genau so aufgetreten.
      await writeSession({ ...optionen, events: baueEreignisse(2000) })
      // **Erst nachsehen, dann messen.** Eine Messung auf etwas, das nicht
      // existiert, ergibt eine Zahl — eine falsche.
      const probe = await readSession(optionen.root, BENCH_ID)
      if (probe === undefined || probe.events === undefined || probe.events.length === 0) {
        return { ok: false, text: 'ROT  readSession: geschriebene Sitzung ist nicht lesbar — Messung ungültig' }
      }
      const m = await messe(() => readSession(optionen.root, BENCH_ID), { aufwaermen: 3, laeufe: 10 })
      return pruefeBudget(
        {
          name: `readSession, ${String(probe.events.length)} Ereignisse`,
          grenzeMs: BUDGETS.lesen2000,
          warum: 'eine Sitzung wieder aufnehmen',
        },
        m,
      )
    }),
  )

  // ── Speicher: wächst der Verlauf übermäßig? ───────────────────────────────
  teile.push(async () => {
    const speicher = messeSpeicher(() => foldSession(parseSession(text2000).events))
    if (!speicher.verfuegbar) {
      // **Nicht stillschweigend überspringen.** Eine fehlende Messung wird
      // gemeldet, nicht als „0 Bytes, alles gut" ausgegeben.
      return { ok: true, text: `übersprungen  Speicher: ${speicher.hinweis ?? ''}` }
    }
    const grenze = 64 * 1024 * 1024
    const ok = speicher.zuwachsBytes <= grenze
    return {
      ok,
      text:
        `${ok ? 'ok  ' : 'ROT '} Speicher nach foldSession: ${alsGroesse(speicher.zuwachsBytes)} ` +
        `gegen ${alsGroesse(grenze)}`,
    }
  })

  // ── Die Zahlen: Größe der Eingabe, damit sie einordbar bleibt ─────────────
  teile.push(() => ({
    ok: true,
    text: `      Eingabe: ${String(2000)} Ereignisse, ${alsGroesse(Buffer.byteLength(text2000))} JSONL`,
  }))

  return await fuehreAus('session-open — Sitzung schreiben, lesen, falten', teile)
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('lauf.mjs')) {
  process.exitCode = (await laufe()) === 0 ? 0 : 1
}
