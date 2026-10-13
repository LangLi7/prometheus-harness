/**
 * protokoll-pruefung.mjs — Wächter-Werkzeug (Aufsicht): prüft das **eigene** Protokoll.
 *
 * WARUM. Am 13.10.2026 zählte meine Regel W30 „B-Zeilen der Offen-Tabelle" **22** statt 16 — weil sie
 * jede Zeile zählte, die mit einem B-Label beginnt, und die Tabellen **in meinen Berichten** mitzählte.
 * Ein Instrument, das nicht sagt, **was** es gemessen hat, hat den falschen Wert geliefert. Genau der
 * Fehler, den diese Rolle bei anderen sucht.
 *
 * Dieses Werkzeug prüft deshalb **fünf Dinge**, die zusammen stimmen müssen:
 *
 *   1. Die Offen-Tabelle nennt jede Befundnummer **genau einmal** und **aufsteigend**.
 *   2. Zu jeder Nummer in der Tabelle gibt es einen **Abschnitt** in `befunde.md` — und umgekehrt.
 *   2b. `LAGE.md` **nennt** jede Befundnummer (oder führt sie ausdrücklich als Ausnahme). Diese Regel
 *      ist am 13.10.2026 dazugekommen, nachdem **B37** ohne LAGE-Zeile geblieben war und **dieses
 *      Werkzeug es nicht merkte** — es las `LAGE.md` gar nicht.
 *   3. `protokoll.jsonl` ist **zeilenweise gültiges JSON** (append-only heißt: nie eine kaputte Zeile).
 *   4. Jede Datei des Ordners ist **versioniert** — ein nicht versioniertes Protokoll ist nicht
 *      nachprüfbar.
 *
 * Aufruf:  node protokoll-pruefung.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HIER = dirname(fileURLToPath(import.meta.url))
const ORDNER = join(HIER, '..')
const REPO = join(ORDNER, '..', '..', '..')

const lies = (pfad) => readFileSync(pfad, 'utf8')
let fehler = 0
const melde = (ok, text) => {
  console.log(`  ${ok ? 'ok    ' : 'FEHLER'}  ${text}`)
  if (!ok) fehler += 1
}

console.log('=== Prüfung des eigenen Protokolls ===\n')

/** 1. Die Offen-Tabelle */
const protokoll = lies(join(ORDNER, 'protokoll.md')).split(/\r?\n/)
const start = protokoll.findIndex((zeile) => zeile.startsWith('## Offen'))
if (start === -1) {
  melde(false, 'der Abschnitt „## Offen / nächster Takt" fehlt in protokoll.md')
} else {
  const zeilen = protokoll.slice(start).filter((zeile) => /^\| \*\*B\d+\*\*/.test(zeile))
  const nummern = zeilen.map((zeile) => Number((zeile.match(/\*\*B(\d+)\*\*/) ?? [])[1]))
  const eindeutig = new Set(nummern).size === nummern.length
  const aufsteigend = nummern.every((n, i) => i === 0 || nummern[i - 1] < n)
  melde(zeilen.length > 0, `Offen-Tabelle: ${zeilen.length} Befundzeilen (${nummern.join(', ')})`)
  melde(eindeutig, 'jede Nummer genau einmal')
  melde(aufsteigend, 'aufsteigend sortiert')

  /** 2. Gegenprobe gegen befunde.md */
  const befunde = lies(join(ORDNER, 'befunde.md'))
  const imText = [...befunde.matchAll(/^## (B\d+) —/gm)].map((treffer) => Number(treffer[1].slice(1)))
  const fehlendeAbschnitte = nummern.filter((n) => !imText.includes(n))
  const fehlendeZeilen = imText.filter((n) => !nummern.includes(n))
  melde(fehlendeAbschnitte.length === 0, `Befundabschnitte in befunde.md vorhanden${fehlendeAbschnitte.length > 0 ? ` — fehlt: ${fehlendeAbschnitte.join(', ')}` : ''}`)
  melde(fehlendeZeilen.length === 0, `kein Abschnitt ohne Tabellenzeile${fehlendeZeilen.length > 0 ? ` — ohne Zeile: ${fehlendeZeilen.join(', ')}` : ''}`)

  /**
   * 2b. Die Entscheidungsseite nennt jede Nummer.
   *
   * WARUM. Am 13.10.2026 um 16:33 fand ich **B37** ohne jede Zeile in `LAGE.md` — meine eigene
   * Regel „beide Zeilen vor dem Commit" war verletzt, und **dieses Werkzeug merkte es nicht**,
   * weil es `LAGE.md` gar nicht las. Die Lücke wird hier geschlossen: wer einen Befund anlegt,
   * nennt ihn auf der Entscheidungsseite — oder trägt ihn unten **ausdrücklich** als Ausnahme
   * ein. Eine stille Auslassung ist ab jetzt ein Fehler; eine benannte ist eine Entscheidung.
   */
  const ausnahmen = {
    B4: 'N, latent (Git-Credential-Helfer) — keine Entscheidung nötig',
    B5: 'N (nur im Testkopf dokumentiert) — kein Handlungsbedarf',
    B21: 'N (das Wort „Kette" bedeutet zweierlei) — Begriffshinweis',
    V3: 'Verifikation (CRLF-Klasse geschlossen) — in §2 geführt',
    V6: 'Verifikation (pmh-attach kompiliert) — in der B33-Zeile mitgeführt',
    V7: 'Verifikation (drei Installations-Einstiege) — in den Zeilen B30/B34 mitgeführt',
    V8: 'Verifikation (Datenbank-Abgleich) — im §2-Text erklärt',
    V9: 'Verifikation (Benchmark) — als Zahl in der B35-Zeile enthalten',
    V10: 'Verifikation (Paarungsprüfer) — in §1 bei B15/B16 geführt',
    V11: 'Verifikation (Benchmark-Gate) — in der B35-Zeile mitgeführt',
    V12: 'Verifikation (Argon2id-Kosten nachgemessen) — in der B40-Zeile mitgeführt',
  }
  const lage = lies(join(ORDNER, 'LAGE.md'))
  const alleNummern = [...new Set([...befunde.matchAll(/^## (B\d+|V\d+)/gm)].map((t) => t[1]))]
  // Genannte Nummern: jede fette Marke zählt, auch **gebündelt** (`**B3/B17**`, `**V4/V5**`).
  // Die erste Fassung dieser Regel suchte die Nummer als Teilzeichenkette — damit galt „B2" als
  // genannt, weil „B22" ihn enthält. Ein Suchmuster, das zu weit greift, misst das Falsche.
  const genannt = new Set(
    // **Zeilenverankert**: nur der Beginn einer Tabellenzeile zählt (`| **B37** | …`), und gebündelte
    // Marken werden getrennt (`**B3/B17**`, `**V4/V5**`). Die erste Fassung suchte die Nummer als
    // Teilzeichenkette — dann galt „B2" als genannt, weil „B22" ihn enthält. Die zweite scannte das
    // ganze Dokument nach `**…**` — dann **verschluckte eine unpaarige Marke weiter oben die nächste
    // Nummer** (B24 wurde gefunden, B25 nicht). Beide Messungen waren falsch, jede auf ihre Weise.
    [...lage.matchAll(/^\| \*\*([^*|\n]+)\*\*/gm)]
      .flatMap((treffer) => treffer[1].split('/'))
      .map((teil) => teil.trim())
      .filter((teil) => /^(B|V)\d+$/.test(teil)),
  )
  const ohneNennung = alleNummern.filter((n) => !genannt.has(n) && !(n in ausnahmen))
  melde(
    ohneNennung.length === 0,
    `LAGE.md nennt jede Befundnummer${ohneNennung.length > 0 ? ` — OHNE Nennung: ${ohneNennung.join(', ')}` : ` (Ausnahmen ausdrücklich: ${Object.keys(ausnahmen).join(', ')})`}`,
  )
}

/**
 * 6. **Keine verklebte Tabellenzeile.**
 *
 * WARUM. Am 13.10.2026 hat ein Schreibvorgang von mir zwei Befundzeilen **ohne Trennzeichen**
 * aneinandergehängt — die Signatur war `… RLS || **B38**`. Die eine Stelle fand mein eigener Blick
 * beim Nachmessen, die zweite — in `protokoll.md` Zeile 2619, „B37 und V10 in einer Tabellenzeile" —
 * ein **fremder** Prüfer (CodeRabbit, im Commit-Text des bauenden Agenten). **Regel 1 hätte sie nie
 * gemeldet:** sie liest nur `**B…**` am Zeilenanfang und sieht eine verklebte **V**-Zeile gar nicht.
 */
const verklebt = protokoll.filter(
  (zeile) => /^\| \*\*(B|V)\d+/.test(zeile) && zeile.includes('||'),
)
melde(
  verklebt.length === 0,
  `keine verklebte Tabellenzeile (doppeltes „|")${verklebt.length > 0 ? ` — ${verklebt.length} Zeile(n)` : ''}`,
)

/** 3. Die JSONL-Datei */
const jsonlPfad = join(ORDNER, 'protokoll.jsonl')
const jsonlZeilen = lies(jsonlPfad).trim().split(/\r?\n/)
let kaputt = 0
for (const [index, zeile] of jsonlZeilen.entries()) {
  try {
    JSON.parse(zeile)
  } catch {
    kaputt += 1
    console.log(`         Zeile ${index + 1} ist kein gültiges JSON`)
  }
}
melde(kaputt === 0, `protokoll.jsonl: ${jsonlZeilen.length} Zeilen, ${kaputt} ungültig`)

/** 4. Versionierung */
const alle = []
const sammle = (pfad) => {
  for (const eintrag of readdirSync(pfad, { withFileTypes: true })) {
    const voll = join(pfad, eintrag.name)
    if (eintrag.isDirectory()) sammle(voll)
    else alle.push(voll)
  }
}
sammle(ORDNER)
const relativ = (pfad) => pfad.replace(REPO, '').replace(/\\/g, '/').replace(/^\//, '')
let nichtVersioniert = []
try {
  const versioniert = new Set(
    execFileSync('git', ['ls-files', 'docs/protokoll'], { cwd: REPO, encoding: 'utf8' }).split('\n').map((z) => z.trim()),
  )
  nichtVersioniert = alle.map(relativ).filter((pfad) => !versioniert.has(pfad))
} catch (error) {
  melde(false, `git ls-files nicht ausführbar: ${error.message}`)
}
melde(
  nichtVersioniert.length === 0,
  `Versionierung: ${alle.length - nichtVersioniert.length}/${alle.length} Dateien verfolgt` +
    (nichtVersioniert.length > 0 ? ` — offen: ${nichtVersioniert.join(', ')}` : ''),
)

console.log(`\nGesamtgröße der Spur: ${(alle.reduce((summe, pfad) => summe + statSync(pfad).size, 0) / 1024).toFixed(0)} KB in ${alle.length} Dateien`)
console.log(fehler === 0 ? 'ERGEBNIS: das Protokoll ist in sich stimmig.' : `ERGEBNIS: ${fehler} Abweichung(en) — siehe oben.`)
process.exit(fehler === 0 ? 0 : 1)
