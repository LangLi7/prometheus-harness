/**
 * `scripts/typecheck.mjs` — der Typecheck über **alle** Pakete.
 *
 * Der Name ist bewußt der des Referenz-Kommandos: im Vorbild steht
 * `pnpm run build`. Bei uns gibt es **nichts zu bauen** — Bun führt TypeScript
 * direkt aus —, und was dort das Bauen prüft, prüft hier der Typecheck. Deshalb
 * heißt dieser Schritt genauso und steht an derselben Stelle der Reihenfolge.
 *
 * ## Warum dieses Skript und nicht `bun run --filter '*' typecheck`
 *
 * Das ist der naheliegende Einzeiler — und er **funktioniert in dieser
 * Umgebung nicht**. `bun run --filter` ruft `bun` **verschachtelt** auf, und der
 * zweite Aufruf löst über den PATH auf (gemessen am 13.10.2026, Windows nativ):
 *
 * | `bun` im PATH | Verhalten |
 * |---|---|
 * | `%USERPROFILE%\.bun\bin\bun.exe` | funktioniert (1.4.0) |
 * | `%APPDATA%\npm\bun.cmd` | **inkompatibel** — fremdarchigtes `bun.exe` |
 * | `%APPDATA%\npm\bun.ps1` | **blockiert** — Ausführungsrichtlinie `Restricted` |
 *
 * Auf einem frischen Rechner ist die Reihenfolge nicht garantiert. Ein
 * Installationsschritt, der davon abhängt, ist kein Installationsschritt.
 *
 * **Die Gegenmaßnahme:** dieses Skript startet **jeden** Unterprozeß mit
 * `process.execPath` — der Binärdatei, die **diesen** Prozeß ausführt, also
 * nachweislich der richtigen. Der PATH ist damit gleichgültig.
 *
 * ## Was es tut
 *
 * Es sucht jedes `tsconfig.json` unter `packages/`, `apps/` und `units/`, läuft sie
 * **nacheinander** durch und meldet am Ende eine Zeile je Paket.
 *
 * **Warum nacheinander und nicht gleichzeitig.** `tsgo` ist ein Compiler in
 * eigener Sprache; achtzehn gleichzeitige Läufe auf einem Laptop verdrängen sich
 * gegenseitig und die Gesamtdauer wird **schlechter**, nicht besser. Die
 * Reihenfolge macht außerdem die Ausgabe lesbar.
 *
 * @module scripts/typecheck
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Wurzel des Projekts, abgeleitet aus dem Modulpfad — nie aus dem Aufrufort. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Die laufende Bun-Binärdatei. Siehe Dateikopf. */
const BUN = process.execPath

/**
 * Der Weg zum `tsgo`-Einstieg.
 *
 * **Warum über den Shim und nicht über die plattformspezifische Binärdatei.**
 * `@typescript/native-preview` liefert je Plattform ein eigenes Paket
 * (`…-win32-x64`, `…-linux-arm64`, …) und wählt es über
 * `optionalDependencies`. Wer die Binärdatei selbst sucht, muß diese Auswahl
 * nachbauen — und baut sie irgendwann falsch nach. Der Shim `bin/tsgo` ist ein
 * paar Zeilen JavaScript und trifft die Auswahl **des Pakets**.
 *
 * @param wurzel - die Projektwurzel
 * @returns der Pfad oder `undefined`, wenn das Paket fehlt
 */
export function tsgoEinstieg(wurzel = ROOT) {
  const pfad = join(wurzel, 'node_modules', '@typescript', 'native-preview', 'bin', 'tsgo')
  return existsSync(pfad) ? pfad : undefined
}

/**
 * Findet alle Paket-Verzeichnisse mit einer `tsconfig.json`.
 *
 * **Warum gesucht und nicht aufgelistet.** Das Projekt ist ein Arbeitsbereich mit
 * `packages/*​/*` und `apps/*`. Eine feste Liste im Skript wäre bei jedem neuen
 * Paket falsch — und zwar **still**: das neue Paket würde einfach nicht geprüft,
 * und der Typecheck bliebe grün.
 *
 * @param wurzel - die Projektwurzel
 * @returns die Verzeichnisse, in stabiler Reihenfolge
 */
export function findePakete(wurzel = ROOT) {
  const gefunden = []
  for (const oben of ['packages', 'apps', 'units']) {
    const basis = join(wurzel, oben)
    if (!existsSync(basis)) continue
    // Zwei Ebenen: `packages/<gruppe>/<paket>` und `apps/<paket>`, dazu
    // `units/<name>` mit eigener `tsconfig.json`.
    //
    // **Warum `units/` mitgeprüft wird.** `units/` steht nicht im Bun-Arbeits-
    // bereich — es ist keine Paketquelle, sondern der Ort für Plugins und Skills
    // ohne eigenen Sprachbaum. Genau deshalb wäre ein TypeScript-Unit dort sonst
    // **untypgeprüft**: es liefe, und niemand merkte einen Typfehler. Ein
    // Prüfwerkzeug, das ein Verzeichnis überspringt, prüft in Wahrheit „alles
    // andere" — und sagt es nicht.
    for (const eintrag of readdirSync(basis, { withFileTypes: true })) {
      if (!eintrag.isDirectory()) continue
      const tief = join(basis, eintrag.name)
      const direkt = join(tief, 'tsconfig.json')
      if (existsSync(direkt)) {
        gefunden.push({ name: `${oben}/${eintrag.name}`, dir: tief, config: direkt })
        continue
      }
      for (const innen of readdirSync(tief, { withFileTypes: true })) {
        if (!innen.isDirectory()) continue
        const config = join(tief, innen.name, 'tsconfig.json')
        if (existsSync(config)) {
          gefunden.push({ name: `${oben}/${eintrag.name}/${innen.name}`, dir: join(tief, innen.name), config })
        }
      }
    }
  }
  return gefunden.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Läuft einen Unterprozeß und sammelt seine Ausgabe.
 *
 * **Warum gesammelt und nicht durchgereicht.** Achtzehn Läufe, jeder mit eigener
 * Ausgabe, ergeben eine Wand aus Text, in der die **eine** rote Zeile untergeht.
 * Hier wird gesammelt und am Ende je Paket **eine** Zeile ausgegeben; die
 * vollständige Ausgabe erscheint nur bei einem Fehler.
 *
 * @param programm - das Programm
 * @param args - seine Argumente
 * @param cwd - das Arbeitsverzeichnis
 * @returns Exit-Code und gesammelte Ausgabe
 */
function laufe(programm, args, cwd) {
  return new Promise((fertig) => {
    const kind = spawn(programm, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let aus = ''
    kind.stdout?.on('data', (s) => {
      aus += String(s)
    })
    kind.stderr?.on('data', (s) => {
      aus += String(s)
    })
    kind.on('error', (fehler) => fertig({ code: -1, aus: `${aus}\n${fehler.message}` }))
    kind.on('exit', (code) => fertig({ code: code ?? -1, aus }))
  })
}

/**
 * Prüft alle Pakete und gibt aus, was geschehen ist.
 *
 * @param optionen - Ausgabe und Wurzel, austauschbar für Prüfungen
 * @returns die Zahl der roten Pakete
 */
export async function pruefeAlle(optionen = {}) {
  const wurzel = optionen.wurzel ?? ROOT
  const schreibe = optionen.schreibe ?? ((t) => process.stdout.write(t))
  const tsgo = tsgoEinstieg(wurzel)
  if (tsgo === undefined) {
    schreibe(
      'FEHLER: @typescript/native-preview fehlt — `bun install` wurde nicht ausgeführt.\n',
    )
    return 1
  }
  const pakete = findePakete(wurzel)
  if (pakete.length === 0) {
    schreibe('FEHLER: kein Paket mit tsconfig.json gefunden — läuft das Skript im Projekt?\n')
    return 1
  }
  schreibe(`Typecheck über ${String(pakete.length)} Pakete (tsgo, kein Build-Schritt)\n`)
  const beginn = Date.now()
  const rot = []
  for (const paket of pakete) {
    // `--noEmit` steht in den Paket-Skripten; hier ausdrücklich, damit ein Paket
    // ohne eigenes Skript trotzdem nur prüft und nichts schreibt.
    const { code, aus } = await laufe(BUN, [tsgo, '--noEmit', '-p', paket.config], paket.dir)
    if (code === 0) {
      schreibe(`  ok    ${paket.name}\n`)
    } else {
      rot.push({ paket, aus })
      schreibe(`  ROT   ${paket.name}\n`)
    }
  }
  for (const { paket, aus } of rot) {
    schreibe(`\n--- ${paket.name} ---\n${aus.trimEnd()}\n`)
  }
  const sekunden = ((Date.now() - beginn) / 1000).toFixed(1)
  schreibe(
    rot.length === 0
      ? `\n${String(pakete.length)} Pakete grün, 0 rot — ${sekunden} s\n`
      : `\n${String(pakete.length - rot.length)} grün, ${String(rot.length)} rot — ${sekunden} s\n`,
  )
  return rot.length
}

// Nur ausführen, wenn dieses Modul **direkt** gerufen wurde. Ohne diese Prüfung
// würde ein Import (etwa aus einer Prüfdatei) den ganzen Typecheck starten.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = (await pruefeAlle()) === 0 ? 0 : 1
}
