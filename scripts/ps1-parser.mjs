/**
 * Wächter: **jede `.ps1`-Datei läßt sich von Windows PowerShell 5.1 übersetzen.**
 *
 * ## Warum nicht „nur ASCII"
 *
 * Mein erster Entwurf dieses Wächters verlangte **reines ASCII** in allen
 * `.ps1`-Dateien. Die Messung hat ihn widerlegt: **14** Dateien enthalten
 * Nicht-ASCII, aber nur **6** scheitern beim Übersetzen. Umlaute in **Kommentaren**
 * sind also harmlos — gefährlich ist Nicht-ASCII **in Zeichenketten**.
 *
 * Eine Regel, die 14 Dateien umschreibt, um 6 Fehler zu beheben, ist ein
 * Stellvertreter für das eigentliche Ziel. **Geprüft wird deshalb die Eigenschaft
 * selbst:** läßt sich die Datei übersetzen?
 *
 * ## Der Defekt, den dieser Wächter fängt — gemessen am 14.10.2026
 *
 * An `scripts/port-test.ps1`: geprüft mit **pwsh 7** (0 Fehler), ausgeführt mit
 * **Windows PowerShell 5.1** (**13 Fehler**). Der Mechanismus:
 *
 * 1. Die Datei hat **kein BOM**, also liest 5.1 sie mit der **ANSI-Codepage**
 *    (hier cp1252) statt als UTF-8.
 * 2. `—` (U+2014) ist in UTF-8 `E2 80 94`. Als cp1252 gelesen: `â` `€` `"`.
 * 3. `0x94` ist in cp1252 **U+201D** — ein *spitzes* Anführungszeichen. PowerShell
 *    behandelt U+201C/U+201D als **String-Begrenzer**.
 * 4. Die Zeichenkette endet **mitten im Satz**, der Rest wird als Code gelesen.
 *
 * **Die Lehre, die bleibt:** eine Prüfung mit der **falschen Maschine** ist keine
 * Prüfung. `pwsh` 7 und PowerShell 5.1 sind **zwei Parser**, und die Datei wird von
 * 5.1 gestartet (`-ExecutionPolicy Bypass -File`).
 *
 * ## Aufruf
 *
 * ```powershell
 * bun scripts/ps1-parser.mjs             # prüfen; Exit 1 bei Befund
 * bun scripts/ps1-parser.mjs --beheben   # Nicht-ASCII NUR in den kaputten Dateien transliterieren
 * ```
 *
 * `--beheben` faßt **ausschließlich** die Dateien an, die der Parser als kaputt
 * meldet. Eine heile Datei wird nicht umgeschrieben — sie hat keinen Defekt.
 *
 * @module scripts/ps1-parser
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const AUSGENOMMEN = ['node_modules', '.git', '.pmh-build', 'dist']

/** Transliteration, wie sie das Projekt schon benutzt (`Oberflaeche`, `Pruefung`). */
export const ERSATZ = new Map([
  ['\u2014', '-'],
  ['\u2013', '-'],
  ['\u201E', '"'],
  ['\u201C', '"'],
  ['\u201D', '"'],
  ['\u201A', "'"],
  ['\u2018', "'"],
  ['\u2019', "'"],
  ['\u00E4', 'ae'],
  ['\u00F6', 'oe'],
  ['\u00FC', 'ue'],
  ['\u00C4', 'Ae'],
  ['\u00D6', 'Oe'],
  ['\u00DC', 'Ue'],
  ['\u00DF', 'ss'],
  ['\u2026', '...'],
  ['\u00A0', ' '],
  ['\u00A7', 'Paragraph '],
  ['\u2192', '->'],
])

/**
 * Findet alle `.ps1`-Dateien.
 *
 * @param {string} dir
 * @param {string[]} [aus]
 * @returns {string[]}
 */
export function findeSkripte(dir, aus = []) {
  let eintraege
  try {
    eintraege = readdirSync(dir, { withFileTypes: true })
  } catch {
    return aus
  }
  for (const e of eintraege) {
    if (AUSGENOMMEN.includes(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) findeSkripte(p, aus)
    else if (e.name.endsWith('.ps1')) aus.push(p)
  }
  return aus
}

/**
 * Ist Windows PowerShell 5.1 vorhanden?
 *
 * **Ohne 5.1 wird nicht geprüft** — und das wird **gesagt**, nicht verschwiegen.
 * Ein stiller grüner Haken ohne Werkzeug ist die Abwesenheit eines Beweises.
 *
 * @returns {boolean}
 */
export function hatPowerShell51() {
  try {
    const aus = execFileSync('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return aus.trim() === '5'
  } catch {
    return false
  }
}

/**
 * Läßt 5.1 alle Dateien übersetzen und liefert die Fehler zurück.
 *
 * Der Prüfling wird als **eigene ASCII-Datei** erzeugt und von `powershell.exe`
 * ausgeführt — nicht aus Node heraus interpretiert. Nur so prüft **5.1** und nicht
 * der Parser der laufenden Sitzung.
 *
 * @param {string[]} dateien
 * @param {string} tmpPfad
 * @returns {Array<{datei: string, fehler: number, erste: string}>}
 */
export function pruefeMit51(dateien, tmpPfad) {
  // **PowerShell-Literale, nicht JSON-Literale — gemessen am 14.10.2026.** Hier stand
  // `JSON.stringify(d)`. Das erzeugt `"C:\\Users\\…"`, und PowerShell kennt **kein**
  // Rückstrich-Escaping: es liest die doppelten Rückstriche **wörtlich**. Daß der
  // Wächter trotzdem echte Fehler fand, liegt nur daran, daß Windows mehrfache
  // Trennzeichen zusammenzieht — der Pfad zeigte zufällig auf dieselbe Datei. Ein
  // Werkzeug, das aus dem falschen Grund funktioniert, ist keines.
  //
  // In PowerShell maskiert man ein einfaches Anführungszeichen, indem man es
  // **verdoppelt**. Alles andere ist in einfachen Anführungszeichen wörtlich.
  const psLiteral = (s) => `'${s.replace(/'/gu, "''")}'`
  const liste = dateien.map(psLiteral).join(',')
  // **Tabgetrennt und nicht JSON — gemessen am 14.10.2026.** Der erste Entwurf ließ
  // PowerShell `ConvertTo-Json` schreiben. 5.1 liefert darin **doppelte**
  // Rückstriche (`C:\\Users\\…`), und der Empfänger bekam einen Pfad, der nicht mehr
  // zu dem paßte, den er gesucht hatte. Über eine **Prozeßgrenze** ist ein
  // Zeilenprotokoll mit `[char]9` als Trenner robuster als eine Maskierung, die auf
  // beiden Seiten verschieden ausgelegt wird: ein Pfad kann keinen Tab enthalten.
  const skript = [
    '$ErrorActionPreference = "Continue"',
    '$t = [char]9',
    `$dateien = @(${liste})`,
    'foreach ($f in $dateien) {',
    '  $fehler = $null',
    '  [void][System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$null, [ref]$fehler)',
    '  if ($fehler.Count -gt 0) {',
    '    $zeile = $fehler[0].Extent.StartLineNumber',
    '    $meldung = $fehler[0].Message',
    '    Write-Output ($f + $t + $fehler.Count + $t + $zeile + $t + $meldung)',
    '  }',
    '}',
  ].join('\n')
  writeFileSync(tmpPfad, skript, 'ascii')
  const roh = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPfad], {
    encoding: 'utf8',
    timeout: 180_000,
  })
  const aus = []
  for (const zeile of roh.split('\n')) {
    const z = zeile.replace(/\r$/u, '').trim()
    if (z === '') continue
    const teile = z.split('\t')
    if (teile.length < 4) {
      // **Kein stilles Übergehen.** Eine Zeile, die nicht ins Protokoll paßt, ist
      // ein Befund für sich — sonst würde ein Formatfehler wie „keine Fehler" aussehen.
      aus.push({ datei: `(unlesbare Protokollzeile) ${z.slice(0, 120)}`, fehler: -1, zeile: 0, erste: 'Formatfehler' })
      continue
    }
    aus.push({
      datei: teile[0] ?? '',
      fehler: Number(teile[1] ?? '0'),
      zeile: Number(teile[2] ?? '0'),
      erste: teile.slice(3).join('\t'),
    })
  }
  return aus
}

/**
 * Ersetzt Nicht-ASCII. Ein Zeichen ohne Eintrag wird als `?` geschrieben **und
 * gemeldet** — nicht stillschweigend verschluckt.
 *
 * @param {string} text
 */
export function ersetze(text) {
  const ersetzt = new Map()
  const unbekannt = new Map()
  let aus = ''
  for (const c of text) {
    if (c.codePointAt(0) <= 0x7f) {
      aus += c
      continue
    }
    const ziel = ERSATZ.get(c)
    if (ziel === undefined) {
      unbekannt.set(c, (unbekannt.get(c) ?? 0) + 1)
      aus += '?'
    } else {
      ersetzt.set(c, (ersetzt.get(c) ?? 0) + 1)
      aus += ziel
    }
  }
  return { text: aus, ersetzt, unbekannt }
}

function haupt() {
  const beheben = process.argv.includes('--beheben')
  const wurzel = process.cwd()
  const skripte = findeSkripte(wurzel)

  console.log(`Geprüft: ${String(skripte.length)} .ps1-Dateien mit Windows PowerShell 5.1`)
  console.log('')

  if (!hatPowerShell51()) {
    console.log('NICHT GEPRÜFT: Windows PowerShell 5.1 ist auf diesem Rechner nicht aufrufbar.')
    console.log('Ein grüner Haken ohne Werkzeug ist kein Beweis — dieser Lauf hat nichts geprüft.')
    process.exitCode = 0
    return
  }

  const tmp = join(wurzel, '.pmh-ps1-parser-pruefling.ps1')
  let kaputt
  try {
    kaputt = pruefeMit51(skripte, tmp)
  } finally {
    rmSync(tmp, { force: true })
  }

  if (kaputt.length === 0) {
    console.log('Alle Dateien übersetzen sich unter 5.1 — gruen.')
    process.exitCode = 0
    return
  }

  for (const k of kaputt) {
    console.log(`  KAPUTT  ${relative(wurzel, k.datei)}`)
    console.log(`          ${String(k.fehler)} Fehler, erste bei Zeile ${String(k.zeile)}: ${k.erste}`)
  }

  if (!beheben) {
    console.log('')
    console.log(`${String(kaputt.length)} von ${String(skripte.length)} Dateien übersetzen sich unter 5.1 NICHT.`)
    console.log('Häufigste Ursache: ein Gedankenstrich in einer Zeichenkette. 5.1 liest die Datei ohne BOM')
    console.log('als ANSI; das dritte Byte wird zum spitzen Anführungszeichen, das PowerShell als')
    console.log('String-Begrenzer behandelt — die Zeichenkette endet mitten im Satz.')
    console.log('Beheben mit:  bun scripts/ps1-parser.mjs --beheben')
    process.exitCode = 1
    return
  }

  console.log('')
  console.log('== Beheben (nur die kaputten Dateien) ==')
  const alleUnbekannt = new Map()
  for (const k of kaputt) {
    const roh = readFileSync(k.datei, 'utf8')
    const { text, ersetzt, unbekannt } = ersetze(roh)
    for (const [c, n] of unbekannt) alleUnbekannt.set(c, (alleUnbekannt.get(c) ?? 0) + n)
    writeFileSync(k.datei, text, 'utf8')
    const summe = [...ersetzt.entries()].map(([c, n]) => `${c}x${String(n)}`).join(' ')
    console.log(`  ${relative(wurzel, k.datei)}: ${summe === '' ? 'keine bekannten Zeichen' : summe}`)
  }

  // **Nachprüfen, nicht behaupten.** Ein Behebungslauf, der seinen Erfolg nicht
  // nachprüft, ist eine Behauptung.
  let nachher
  try {
    nachher = pruefeMit51(skripte, tmp)
  } finally {
    rmSync(tmp, { force: true })
  }
  console.log('')
  if (nachher.length === 0) {
    console.log('Nachprüfung: alle Dateien übersetzen sich jetzt unter 5.1.')
  } else {
    console.log(`Nachprüfung: ${String(nachher.length)} Datei(en) sind WEITERHIN kaputt:`)
    for (const k of nachher) {
      console.log(`  ${relative(wurzel, k.datei)} — Zeile ${String(k.zeile)}: ${k.erste}`)
    }
  }
  if (alleUnbekannt.size > 0) {
    console.log('ACHTUNG — unbekannte Zeichen wurden zu "?"; von Hand nachsehen:')
    for (const [c, n] of alleUnbekannt) {
      console.log(`   U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}  ${String(n)}x`)
    }
  }
  process.exitCode = nachher.length === 0 ? 0 : 1
}

if (import.meta.main === true) haupt()
