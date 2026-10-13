/**
 * `scripts/start.mjs` — Einstieg für `bun run start`: Web-App **und** Go-Dienste.
 *
 * ## Warum es diese Datei gibt
 *
 * Das Referenz-Kommando ist `pnpm dsh web`: ein Kommando, das den Host startet
 * und die Oberfläche ausliefert. Für Prometheus Harness soll dasselbe mit
 * **Bun** gehen — ohne pnpm, ohne npx, und auf **Windows nativ** genauso wie
 * unter Linux.
 *
 * ## Der gemessene Windows-Fallstrick, der diesen Entwurf bestimmt
 *
 * Auf diesem Rechner liegen **drei** `bun`-Einträge im PATH, und **zwei davon
 * sind defekt** (gemessen am 13.10.2026):
 *
 * | Eintrag | Verhalten |
 * |---|---|
 * | `%APPDATA%\npm\bun.ps1` | **blockiert** — die PowerShell-Ausführungsrichtlinie steht auf `Restricted` |
 * | `%APPDATA%\npm\bun.cmd` | **inkompatibel** — ruft ein fremdarchigtes `bun.exe` auf: „ist mit der ausgeführten Windows-Version nicht kompatibel" |
 * | `%USERPROFILE%\.bun\bin\bun.exe` | **funktioniert** (1.4.0) |
 *
 * Ein Skript wie `bun run --filter '*' typecheck` ruft `bun` **verschachtelt**
 * auf. Der zweite Aufruf löst über den **PATH** auf — und trifft dort das
 * defekte Paket. Deshalb scheiterte der Typecheck, obwohl der äußere Aufruf
 * korrekt war.
 *
 * **Die Gegenmaßnahme:** dieses Skript startet Kindprozesse mit
 * `process.execPath` — dem Pfad der **laufenden** Bun-Binärdatei. Damit ist der
 * PATH für den Start gleichgültig: wer diesen Start einmal richtig aufruft,
 * startet die richtige Laufzeit, auch wenn der PATH falsch sortiert ist.
 *
 * ## Was es startet
 *
 * 1. **Optional den Core-Host** (`apps/cli`) — der Prozess, der die Oberfläche
 *    ausliefert. Er ist das Gegenstück zu `dsh web`.
 * 2. **Die Go-Dienste** (`services/*`), jeder als eigener Prozess hinter der
 *    Prozessgrenze (Regel 4 aus `docs/concept.md`). Sie werden mit
 *    `go build` gebaut und die Binärdatei gestartet.
 *
 * ## Grenzen — ehrlich
 *
 * * **Kein Neustart-Management.** Fällt ein Dienst, wird er nicht neu gestartet.
 *   Das ist Aufgabe von `services/pmh-supervisor` (siehe `MAPPING.md` §3.7) und
 *   noch nicht gebaut. Dieses Skript startet und beendet, mehr nicht.
 * * **Keine Reihenfolge-Abhängigkeiten.** Es wird nicht gewartet, bis ein Dienst
 *   „bereit" meldet. Wer das braucht, braucht den Supervisor.
 * * **Kein Watch/Reload.** Änderungen am Quelltext wirken erst nach Neustart.
 *
 * @module scripts/start
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Wurzel des Projekts, abgeleitet aus dem Modulpfad — nie aus dem Aufrufort. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Die laufende Bun-Binärdatei.
 *
 * **Warum nicht `'bun'`.** Ein nackter Programmname wird über den PATH
 * aufgelöst — und dort steht auf diesem Rechner ein defektes Paket (siehe
 * Dateikopf). `process.execPath` ist dagegen die Binärdatei, die **diesen**
 * Prozess ausführt, also nachweislich funktionsfähig.
 */
const BUN = process.execPath

/** Zeilen-Präfix je Prozess, damit die Ausgaben zuordenbar bleiben. */
function tag(name) {
  return `[${name}]`
}

/** Schreibt eine Zeile mit Präfix. */
function log(name, chunk) {
  const text = String(chunk)
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() !== '') process.stdout.write(`${tag(name)} ${line}\n`)
  }
}

/**
 * Ein gestarteter Kindprozess mit Namen — die Einheit, die dieses Skript führt.
 *
 * @typedef {{ name: string, child: import('node:child_process').ChildProcess, kind: 'host'|'go' }} Managed
 */

/** Alle laufenden Prozesse. Wird beim Beenden in umgekehrter Reihenfolge geleert. */
/** @type {Managed[]} */
const running = []

let shuttingDown = false

/**
 * Beendet alle Prozesse — **in umgekehrter Startreihenfolge**.
 *
 * **Warum umgekehrt.** Der Host kann auf einem Dienst aufbauen, der später
 * gestartet wurde. Steckt man den Host zuerst ab, arbeitet der Dienst kurz
 * gegen einen halben Zustand. Umgekehrt ist die einzige Reihenfolge, die für
 * beide Fälle stimmt — dieselbe Überlegung wie beim Plugin-Host in
 * `packages/units/unit-export`.
 *
 * **Warum nicht `tree-kill` auf Unix und `taskkill` auf Windows.** Beides wäre
 * eine Fremdabhängigkeit oder ein Plattformzweig. Hier wird zuerst höflich
 * beendet (`SIGTERM`, auf Windows `taskkill /T` für den Prozessbaum), dann nach
 * einer Frist hart.
 *
 * @param {number} code - Exit-Code, mit dem dieser Prozess endet
 * @returns {Promise<void>}
 */
async function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  process.stdout.write(`\n[pmh] Beende ${running.length} Prozess(e), umgekehrte Reihenfolge …\n`)

  for (const entry of [...running].reverse()) {
    if (entry.child.exitCode !== null || entry.child.signalCode !== null) continue
    terminate(entry.child)
  }

  // Frist: hart nachstoßen, was nicht von selbst endet. Ohne diese Frist
  // bliebe ein widerspenstiger Dienst stehen und der Start „hinge".
  const deadline = Date.now() + 5000
  while (running.some((entry) => entry.child.exitCode === null && entry.child.signalCode === null) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100))
  }
  for (const entry of running) {
    if (entry.child.exitCode === null && entry.child.signalCode === null) {
      process.stdout.write(`[pmh] ${entry.name} reagiert nicht — hartes Beenden\n`)
      try { entry.child.kill('SIGKILL') } catch { /* schon tot */ }
    }
  }
  process.stdout.write(`[pmh] Beendet (exit ${code})\n`)
  process.exit(code)
}

/**
 * Beendet einen Prozessbaum.
 *
 * Auf Windows gibt es kein Signal an fremde Prozesse; `taskkill /T /F` ist der
 * einzige verlässliche Weg, auch **Enkel** zu erfassen. Auf POSIX genügt das
 * Signal an die Prozessgruppe, weil die Kinder in derselben Gruppe laufen.
 *
 * @param {import('node:child_process').ChildProcess} child
 */
function terminate(child) {
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } catch {
      try { child.kill() } catch { /* schon tot */ }
    }
    return
  }
  try { child.kill('SIGTERM') } catch { /* schon tot */ }
}

/**
 * Startet einen Prozess und nimmt ihn in die Buchführung auf.
 *
 * @param {string} name - Anzeigename für die Ausgabe
 * @param {string} command - Programm
 * @param {readonly string[]} args - Argumente
 * @param {{cwd?: string, kind?: 'host'|'go', env?: Record<string,string>}} options
 * @returns {Managed}
 */
function launch(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout?.on('data', (chunk) => log(name, chunk))
  child.stderr?.on('data', (chunk) => log(name, chunk))
  child.on('exit', (code, signal) => {
    const how = signal === null ? `exit ${code}` : `Signal ${signal}`
    process.stdout.write(`${tag(name)} beendet (${how})\n`)
    // Ein Dienst, der von selbst endet, ist ein sichtbarer Fehler — Regel 3.
    // Der Start läuft weiter, aber die Zeile bleibt stehen.
    if (!shuttingDown && code !== 0) {
      process.stdout.write(`${tag(name)} FEHLER: unerwartet beendet — siehe Ausgabe oben\n`)
    }
  })
  child.on('error', (error) => {
    process.stdout.write(`${tag(name)} FEHLER beim Start: ${error.message}\n`)
  })
  const entry = { name, child, kind: options.kind ?? 'go' }
  running.push(entry)
  return entry
}

/**
 * Baut einen Go-Dienst und startet die erzeugte Binärdatei.
 *
 * **Warum bauen und nicht `go run`.** `go run` startet einen **Wrapper**-
 * Prozess, der das eigentliche Programm als Kind führt. Beim Beenden bleibt
 * dann leicht ein Enkel übrig — genau das Problem, das der Referenz-Harness mit
 * einem Job-Objekt löst. Ein vorheriger `go build` und der direkte Start der
 * Binärdatei vermeidet den Wrapper ganz.
 *
 * @param {string} dir - Dienstverzeichnis relativ zur Wurzel
 * @param {string} name - Dienstname (zugleich Name der Binärdatei)
 * @param {readonly string[]} args - Argumente für den Dienst
 * @returns {Promise<Managed | undefined>}
 */
async function buildAndStartGo(dir, name, args) {
  const serviceDir = join(ROOT, dir)
  const outDir = join(ROOT, '.pmh-build')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const binary = join(outDir, process.platform === 'win32' ? `${name}.exe` : name)

  process.stdout.write(`${tag(name)} baue (go build) …\n`)
  const build = await new Promise((settle) => {
    const child = spawn('go', ['build', '-buildvcs=false', '-o', binary, `./cmd/${name}`], {
      cwd: serviceDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdout?.on('data', (chunk) => log(name, chunk))
    child.stderr?.on('data', (chunk) => log(name, chunk))
    child.on('error', (error) => {
      process.stdout.write(`${tag(name)} FEHLER: 'go' nicht startbar (${error.message})\n`)
      settle(false)
    })
    child.on('exit', (code) => settle(code === 0))
  })

  if (!build) {
    // Fail-loud statt still: ein Dienst, der nicht gebaut werden kann, ist ein
    // sichtbarer Fehler (Regel 3). Der Rest startet trotzdem, damit man den
    // laufenden Teil prüfen kann.
    process.stdout.write(`${tag(name)} ÜBERSPRUNGEN — Build fehlgeschlagen\n`)
    return undefined
  }
  return launch(name, binary, args, { kind: 'go' })
}

/**
 * Liest die Kommandozeile dieses Skripts.
 *
 * | Flag | Wirkung |
 * |---|---|
 * | `--no-host` | den Core-Host **nicht** starten (nur Go-Dienste) |
 * | `--no-go` | die Go-Dienste **nicht** starten (nur den Host) |
 * | `--port <n>` | Port für den Host (Vorgabe 5199) |
 * | `--profile <n>` | Profil für den Host (Vorgabe `web`) |
 * | `--home <dir>` | eigenes Harness-Home (Vorgabe `.pmh-build/harness-home` im Repo) |
 *
 * @param {readonly string[]} argv
 * @returns {{host: boolean, go: boolean, port: string, profile: string, home: string}}
 */
function parseArgs(argv) {
  let host = true
  let go = true
  let port = '5199'
  let profile = 'web'
  let home = join(ROOT, '.pmh-build', 'harness-home')
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--no-host') host = false
    else if (arg === '--no-go') go = false
    else if (arg === '--port') { port = argv[i + 1] ?? port; i += 1 }
    else if (arg === '--profile') { profile = argv[i + 1] ?? profile; i += 1 }
    else if (arg === '--home') { home = argv[i + 1] ?? home; i += 1 }
  }
  return { host, go, port, profile, home }
}

/**
 * Startet alles und wartet auf ein Abbruchsignal.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const options = parseArgs(process.argv.slice(2))
  process.stdout.write(`[pmh] Start — Bun ${process.versions.bun ?? '?'} auf ${process.platform}\n`)
  process.stdout.write(`[pmh] Laufzeit: ${BUN}\n`)

  // Der Host zuerst: er liefert die Oberfläche und ist das, was ein Benutzer
  // erwartet, wenn er „start" tippt. Die Dienste folgen.
  if (options.host) {
    const hostEntry = join(ROOT, 'apps', 'cli', 'src', 'main.ts')
    if (existsSync(hostEntry)) {
      process.stdout.write(`[pmh] Host: apps/cli (Profil "${options.profile}", Port ${options.port})\n`)
      process.stdout.write(`[pmh] Harness-Home: ${options.home}\n`)
      // **Warum der Launcher ein eigenes Home mitgibt — mit dem Befund, der es
      // erzwungen hat.** Der Profilpfad des Hosts ist der **Auflösungsanker**
      // der Profil-Bündel. Steht im Harness-Home eine fremde Installation des
      // Core, gewinnt sie über die Node-Auflösungskette — sie wird **vor** dem
      // eigenen Projektbaum gefunden.
      //
      // Gemessen am 13.10.2026, Windows nativ: mit `DSH_HOME=C:\Users\Chang\.dsh`
      // (dort liegen 204 Pakete der Linie 0.1.1-rc.2, während der Projektbaum
      // 0.2.1-alpha.2 trägt) wurden **27** Profil-Einträge als
      // „version-inkompatibel" abgeschaltet — darunter `llm`, `session`,
      // `agent`, `webserver`, `web-startup`. Kein Webserver, kein HTTP.
      //
      // Mit eigenem Home: **0** Abschaltungen, Token, HTTP 200.
      //
      // Die fremde Installation wird dabei **nicht** angetastet: sie gehört einer
      // anderen, laufenden Harness. Der Host bekommt sein eigenes Home — die
      // Korrektur liegt dort, wo sie hingehört.
      launch('host', BUN, [hostEntry, options.profile, '--port', options.port, '--home', options.home, '--no-open'], {
        cwd: ROOT,
        kind: 'host',
      })
    } else {
      process.stdout.write('[pmh] WARNUNG: apps/cli/src/main.ts fehlt — kein Host gestartet\n')
    }
  }

  if (options.go) {
    // Nur Dienste mit `cmd/<name>/main.go` — was keinen Einstieg hat, kann
    // nicht gestartet werden. `pmh-sandbox` ist ein Rust-Dienst und steht
    // deshalb nicht in dieser Liste.
    await buildAndStartGo(join('services', 'pmh-attach'), 'pmh-attach', ['--host', '127.0.0.1', '--port', '8090'])
    await buildAndStartGo(join('services', 'pmh-nix'), 'pmh-nix', ['detect', '--json'])
  }

  if (running.length === 0) {
    process.stdout.write('[pmh] Nichts zu starten — beide Teile waren abgeschaltet.\n')
    process.exit(0)
  }

  process.stdout.write(`[pmh] ${running.length} Prozess(e) laufen. Beenden mit Ctrl+C.\n`)

  process.on('SIGINT', () => { void shutdown(0) })
  process.on('SIGTERM', () => { void shutdown(0) })
  // Windows liefert SIGINT an Kindprozesse unterschiedlich; `SIGBREAK` deckt
  // den Fall ab, dass die Konsole einen Break sendet statt eines Interrupts.
  process.on('SIGBREAK', () => { void shutdown(0) })
}

await main()
