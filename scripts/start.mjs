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

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { choosePort, describePortChoice, portFromEnv } from './port-wahl.mjs'
import { EIGENE_PAKETE, paketName, patchPfad, terminalUmgebung, verdrahte } from './profile-patch.mjs'
import { wendeFavoritenFilterAn } from './client-favoriten.mjs'
import { vorratBereitstellen } from './skill-vorrat.mjs'
import { ergaenzungNoetig } from './ptc-type-stripping.mjs'
import { announceAuthUrl } from './token-address.mjs'
import { WORLD_APP_DIR, WORLD_PATH, worldUrl } from './world-path.mjs'

/** Wurzel des Projekts, abgeleitet aus dem Modulpfad — nie aus dem Aufrufort. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Der Standardport — **derselbe, den die Vorlage benutzt**.
 *
 * **Warum 3080 und nicht 5199.** `3080` ist die Adresse, unter der die
 * Referenz-Harness ihre Oberfläche ausliefert und die ein Benutzer deshalb schon
 * kennt. Ein eigener Standard hieße: jede Anleitung, jedes Lesezeichen und jeder
 * Beitrag über dieses Projekt nennt eine andere Adresse. **Ist der Port belegt,
 * wird ausgewichen** — siehe {@link choosePort} —, aber der Standard bleibt
 * derselbe.
 */
const DEFAULT_PORT = 3080

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
 * `flush` ist gesetzt, wenn an der Ausgabe dieses Prozesses ein Beobachter hängt,
 * der einen **Abschluß** braucht (siehe {@link module:scripts/token-address}).
 *
 * @typedef {{ name: string, child: import('node:child_process').ChildProcess, kind: 'host'|'welt'|'go', flush?: () => void }} Managed
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
    // Was noch läuft, hat seine Ausgabe noch nicht abgeschlossen — der Abschluß
    // wird nachgeholt, bevor beendet wird.
    entry.flush?.()
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
  // Der Beobachter sieht die **Stücke**, nicht die Zeilen — neben `log`, nicht
  // darin. Eine Adresse kann über eine Stück-Grenze laufen, und genau dort ging
  // sie in einer früheren Fassung verloren. Ein Beobachter, der die schon
  // zerlegten Zeilen bekäme, könnte den Fall nicht mehr erkennen: nach dem
  // Zerlegen ist nicht mehr feststellbar, ob ein Umbruch dastand oder nicht.
  const beobachter = options.onOutput?.()
  if (beobachter !== undefined) {
    child.stdout?.on('data', (chunk) => beobachter.feed(chunk))
    child.stderr?.on('data', (chunk) => beobachter.feed(chunk))
  }
  child.on('exit', (code, signal) => {
    // **Zuerst der Abschluß, dann die Meldung.** Der Host schreibt die Adresse
    // als letzte Zeile **ohne** Umbruch (gemessen am 13.10.2026). Ohne diesen
    // Aufruf bliebe sie im Puffer liegen und wartete auf einen Umbruch, der nie
    // kommt — die Adresse wäre verloren, obwohl sie dastand.
    beobachter?.flush()
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
  const entry = { name, child, kind: options.kind ?? 'go', flush: beobachter?.flush }
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
 * | `--no-welt` | die **Welt** nicht bauen (`apps/universe`; dann antwortet `/universe/` mit 503) |
 * | `--port <n>` | **Startport** für den Host (Vorgabe 3080). Ist er belegt, wird der nächste freie genommen — siehe `port-wahl.mjs` |
 * | `--strict-port` | **nicht** ausweichen: ist der Port belegt, bricht der Start ab |
 * | `--profile <n>` | Profil für den Host (Vorgabe `web`) |
 * | `--home <dir>` | eigenes Harness-Home (Vorgabe `.pmh-build/harness-home` im Repo) |
 *
 * **Der Standard ist `3080`** — derselbe Port, auf dem auch die Vorlage ihre
 * Oberfläche ausliefert. Damit gilt für unser Projekt dieselbe Adresse, die ein
 * Benutzer schon kennt, und `PMH_PORT` überschreibt sie ohne Argument.
 *
 * @param {readonly string[]} argv
 * @returns {{host: boolean, go: boolean, welt: boolean, port: number, strictPort: boolean, profile: string, home: string}}
 */
function parseArgs(argv) {
  let host = true
  let go = true
  let welt = true
  let requested
  let strictPort = false
  let profile = 'web'
  let home = join(ROOT, '.pmh-build', 'harness-home')
  const unbekannt = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    // **`--help` gibt es erst seit dem 14.10.2026 — und es war ein echter Defekt.**
    // Vorher lief `--help` stillschweigend als „kein Schalter" durch, und der Host
    // **startete**. Ein Schnellstart, der auf `--help` verweist, war damit nicht
    // schreibbar, ohne zu lügen.
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Aufruf: bun run start [Schalter]\n\n' +
          '  --no-host            nur die Go-Dienste, nicht den Core-Host\n' +
          '  --no-go              nur den Host, nicht die Go-Dienste\n' +
          '  --no-welt            die Welt nicht bauen (dann antwortet /universe/ mit 503)\n' +
          '  --port <n>           Startport (Vorgabe 3080); ist er belegt, wird der naechste freie genommen\n' +
          '  --port=<n>           dasselbe in einem Argument\n' +
          '  --strict-port        nicht ausweichen: ist der Port belegt, bricht der Start ab\n' +
          '  --profile <n>        Profil des Hosts (Vorgabe web)\n' +
          '  --home <dir>         eigenes Harness-Home (Vorgabe .pmh-build/harness-home im Repo)\n' +
          '  --help, -h           diese Uebersicht\n\n' +
          `Die Welt liegt NEBEN dem Chat, auf demselben Port: <adresse>${WORLD_PATH}/ (Pfad aus\n` +
          'scripts/world-path.mjs). Im Chat fuehrt die Marke oben links dorthin, in der Welt zurueck.\n\n' +
          'Umgebung: PMH_PORT (Startport), PMH_HOME (Harness-Home).\n' +
          'Ein Schalter schlaegt die Umgebungsvariable, diese schlaegt den Standard.\n',
      )
      process.exit(0)
    }
    if (arg === '--no-host') host = false
    else if (arg === '--no-go') go = false
    else if (arg === '--no-welt') welt = false
    else if (arg === '--strict-port') strictPort = true
    else if (arg === '--port') { requested = argv[i + 1]; i += 1 }
    else if (arg.startsWith('--port=')) requested = arg.slice('--port='.length)
    else if (arg === '--profile') { profile = argv[i + 1] ?? profile; i += 1 }
    else if (arg === '--home') { home = argv[i + 1] ?? home; i += 1 }
    // **Unbekannte Schalter werden GEMELDET, nicht geschluckt.** Ein Tippfehler wie
    // `--strickt-port` bedeutete vorher nur: keine Wirkung — der Starter startete
    // etwas anderes, als der Aufrufer gemeint hatte, und sagte kein Wort dazu.
    else unbekannt.push(arg)
  }
  if (unbekannt.length > 0) {
    process.stderr.write(
      `FEHLER: unbekannte(r) Schalter: ${unbekannt.join(', ')}\n` +
        'Die vollstaendige Liste steht in `bun run start --help`.\n',
    )
    process.exit(2)
  }
  // **Reihenfolge: Argument schlägt Umgebungsvariable schlägt Standard.** Ein
  // ausdrücklich genanntes Argument darf nie von einer Umgebungsvariable
  // überstimmt werden — sonst startet der Host woanders, als der Aufrufer gesagt
  // hat, und das ist die Art Überraschung, die niemand sucht.
  const fromArg = requested === undefined ? undefined : portFromEnv(requested, DEFAULT_PORT)
  const port = fromArg ?? portFromEnv(process.env.PMH_PORT, DEFAULT_PORT)
  return { host, go, welt, port, strictPort, profile, home }
}

/**
 * **Baut die Welt — statt einen zweiten Server zu öffnen.**
 *
 * ## Was sich am 14.10.2026 geändert hat
 *
 * Hier stand `starteWelt()`: ein **Vite-Entwicklungsserver** auf einem eigenen Port (`5176`). Der
 * Betreiber: *„der ganze port ist mir bisschen zu piss 2 port offen zu haben ich möchte es als ein
 * port haben … und im folder: apps/universe anstatt in snapshot, dann alles in einem port."*
 *
 * Jetzt gibt es **einen** Port. Der Host liefert die Welt unter {@link WORLD_PATH} selbst aus
 * (`packages/web/world-static`); dieser Start baut sie vorher. Damit ist der Umschalter ein
 * **Pfadwechsel** auf derselben Herkunft — keine fremde Adresse, kein zweiter Keks-Speicher, kein
 * belegter Port.
 *
 * ## Warum **immer** gebaut wird und nicht nur, wenn `dist/` fehlt
 *
 * Ein Vorhandensein-Test ist keine Frischeprüfung: nach jeder Änderung am Quelltext läge ein
 * **alter** Bau unter dem Pfad, und man sucht den Fehler im Code, während der Browser den vorigen
 * Stand zeigt. Der Bau dauert hier **rund eine Viertelsekunde** (gemessen: 220 ms) — das ist
 * billiger als eine Stunde Suche an der falschen Stelle. Ist er rot, wird das **gesagt**, und der
 * Rest startet trotzdem (Regel 3: ein Fehler bleibt sichtbar).
 *
 * ## Warum `stdio: 'inherit'` und nicht gesammelt
 *
 * Der Bau ist ein **einmaliger** Schritt, kein Dienst: seine Ausgabe gehört ungefiltert auf den
 * Bildschirm, mit ihrem eigenen Präfix (`vite v8.3.4 building …`). Beim Sammeln müsste ich sie
 * umschreiben, und ein Baufehler stünde dann ohne die Zeile da, die ihn erklärt.
 *
 * @returns {boolean} ob der Bau gelungen ist
 */
function baueWelt() {
  const verzeichnis = join(ROOT, WORLD_APP_DIR)
  const viteEinstieg = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(join(verzeichnis, 'index.html')) || !existsSync(viteEinstieg)) {
    process.stdout.write(
      `[pmh] WARNUNG: die Welt ist nicht baubar — es fehlt ` +
        `${existsSync(verzeichnis) ? '' : `${WORLD_APP_DIR}/index.html `}${existsSync(viteEinstieg) ? '' : 'node_modules/vite '}` +
        '(bun install?). Unter dem Pfad antwortet der Host dann mit 503 und dem Grund.\n',
    )
    return false
  }
  process.stdout.write(`[pmh] Welt: baue ${WORLD_APP_DIR} (vite build) …\n`)
  const bau = spawnSync(BUN, [viteEinstieg, 'build'], {
    cwd: verzeichnis,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  })
  if (bau.status !== 0) {
    process.stdout.write(
      `[pmh] FEHLER: der Bau der Welt ist gescheitert (exit ${String(bau.status ?? '?')}). ` +
        `Unter ${WORLD_PATH}/ antwortet der Host mit 503; der Chat laeuft weiter.\n`,
    )
    return false
  }
  process.stdout.write(`[pmh] Welt: ${WORLD_PATH}/ auf DEMSELBEN Port — kein zweiter Server, keine zweite Adresse.\n`)
  return true
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

  /*
   * **Zuerst die Welt bauen — vor dem Host.**
   *
   * Die Reihenfolge ist kein Geschmack: der Host liefert die Welt unter einem Pfad aus
   * (`packages/web/world-static`). Wäre sie beim ersten Aufruf noch nicht gebaut, antwortete die
   * Adresse mit **503** — und wer sie gleich nach dem Start öffnet, sähe einen Fehler, wo nur eine
   * Reihenfolge falsch war. Der Bau dauert rund eine Viertelsekunde.
   */
  if (options.welt) baueWelt()

  // Der Host danach: er liefert die Oberfläche — und ab jetzt auch die Welt.
  if (options.host) {
    const hostEntry = join(ROOT, 'apps', 'cli', 'src', 'main.ts')
    if (existsSync(hostEntry)) {
      process.stdout.write(`[pmh] Host: apps/cli (Profil "${options.profile}")\n`)
      process.stdout.write(`[pmh] Harness-Home: ${options.home}\n`)

      // **Unser Code in den Host eintragen — bei jedem Start.**
      //
      // Warum das hier geschieht und nicht in einer eingecheckten Datei: die
      // Patch-Schicht des Profils liegt in `.pmh-build/`, und das ist **nicht**
      // versioniert. Eine handgeschriebene Datei dort wäre beim nächsten Klon
      // weg. Der Eintrag steht deshalb im Repo (`scripts/profile-patch.mjs`) und
      // wird hier in die Profildatei geschrieben — idempotent, ein eigener
      // markierter Bereich, fremde Einträge bleiben unangetastet.
      try {
        // **Was diese Maschine an Shells anbieten kann, wird hier gefragt und
        // nicht geraten.** Auf Windows entscheidet das Vorhandensein von WSL2
        // und Git-Bash darüber, welche Zeilen der Terminal-Controller bekommt
        // (siehe `terminalZeilen` in `profile-patch.mjs`). Die Frage kostet einen
        // kurzen `wsl.exe`-Aufruf mit Frist; sie liefert dafür eine Shell-Auswahl,
        // die zur Maschine paßt — statt `powershell` auf Linux anzubieten.
        const umgebung = terminalUmgebung()
        const eintrag = verdrahte(patchPfad(options.home, options.profile), EIGENE_PAKETE, umgebung)
        const was = eintrag.geaendert ? 'eingetragen' : 'schon eingetragen'
        process.stdout.write(`[pmh] Eigene Pakete ${was}: ${EIGENE_PAKETE.map(paketName).join(', ')}\n`)

        // **Der Favoriten-Filter in der Seitenleiste — bei jedem Start neu.**
        //
        // Das Bündel liegt in `node_modules` und wird von `bun install` ersetzt
        // (`node_modules` ist nicht versioniert). Die Änderung selbst steht im
        // Repo (`scripts/client-favoriten.mjs`) und wird hier erneut angewendet:
        // idempotent, mit Ankerprüfung. Paßt sie nach einem Kern-Update nicht
        // mehr, bricht der Start **nicht** ab — er sagt es laut, und die Zeile
        // muß nachgezogen werden.
        const favoriten = wendeFavoritenFilterAn()
        if (favoriten.status === 'passt-nicht' || favoriten.status === 'fehlt') {
          process.stdout.write(`[pmh] WARNUNG: Favoriten-Filter — ${favoriten.meldung}\n`)
          for (const zeile of favoriten.fehlend ?? []) process.stdout.write(`[pmh]   ${zeile}\n`)
        } else {
          process.stdout.write(`[pmh] Favoriten-Filter ${favoriten.meldung}\n`)
        }
      } catch (cause) {
        // Fail-loud: ohne den Eintrag läuft unser Endpunkt nicht, und der Start
        // würde trotzdem „erfolgreich" aussehen. Das ist genau die stille
        // Abweichung, die vermieden werden soll.
        process.stdout.write(
          `[pmh] FEHLER: eigene Pakete konnten nicht eingetragen werden — ` +
            `${cause instanceof Error ? cause.message : String(cause)}\n`,
        )
      }

      // **Der Bild-Absturz wird eingedaemmt — bei jedem Start.**
      //
      // **Der Befund.** libvips (in `sharp`) bringt GLib 2.90.0 **statisch** mit.
      // Beim Abbau eines Threads schliesst GLib ein Win32-Handle ein zweites Mal;
      // `win32_check_for_error` macht daraus ein `g_error`, und das ist im Wirt
      // ein toedlicher Prozeßabbruch (`GLib-ERROR ... gthread-win32.c:420`).
      // Gemessen: die letzte Bild-Annahme lag vier Sekunden vor dem Absturz.
      //
      // **Die Eindämmung.** `packages/attachment/sharp-safe` legt eine
      // **nahestehende** `sharp`-Aufloesung nur fuer `dsh-attachment-local` an —
      // libvips laeuft dann im Kindprozeß. Bricht es dort ab, sieht der Wirt eine
      // abgelehnte Zusage statt eines eigenen Todes. Idempotent; die gemeinsame
      // `sharp`-Fassung bleibt unberuehrt.
      {
        const schritt = spawnSync(BUN, [join(ROOT, 'scripts', 'sharp-safe-install.mjs')], {
          cwd: ROOT,
          encoding: 'utf8',
          windowsHide: true,
        })
        const meldung = `${schritt.stdout ?? ''}${schritt.stderr ?? ''}`
          .split(/\r?\n/)
          .filter((zeile) => zeile.startsWith('[sharp-safe]'))
          .join('\n')
        if (schritt.status === 0) {
          if (meldung !== '') process.stdout.write(`${meldung}\n`)
        } else {
          // Fail-loud, aber nicht fail-closed: der Harness laeuft ohne diesen
          // Schritt — nur eben mit dem offenen Absturzrisiko. Wer das liest,
          // soll wissen, was fehlt.
          process.stdout.write(
            `[pmh] FEHLER: sharp-safe nicht eingehaengt — Bild-Anhaenge koennen den Wirt weiterhin beenden\n${meldung}\n`,
          )
        }
      }

      // **Der Skill-Vorrat — aus dem Repo ins Home, bei jedem Start.**
      //
      // Dieselbe Begründung wie beim Profil-Patch darüber: das Home liegt in
      // `.pmh-build/` und ist **nicht** versioniert. Anders als der Patch betrifft
      // es hier aber nicht nur dieses Projekt — die projektweite Wurzel
      // (`.agents/skills`) gilt nur für Sitzungen **in diesem Baum**; wer den
      // Harness in einem anderen Projekt startet, sieht dort keinen davon. Die
      // benutzerweite Wurzel `<home>/skills` gilt für jede Sitzung dieser
      // Installation — deshalb wird dorthin gelegt und nicht nur hier abgelegt.
      //
      // Kopiert wird nur, was sich **inhaltlich** unterscheidet (Fingerabdruck,
      // nicht Zeitstempel): 41 Dateien, 2,3 MB, wenige Millisekunden je Start.
      //
      // Die Meldung ist **fail-open**: ein fehlender Skill ist eine fehlende
      // Beigabe, kein Grund, den Host nicht hochkommen zu lassen. Er fehlt dann
      // im Katalog, und das Werkzeug sagt es beim Aufruf.
      try {
        for (const befund of vorratBereitstellen(options.home, { wurzel: ROOT })) {
          const was =
            befund.grund === 'kopiert'
              ? 'kopiert'
              : befund.grund === 'unveraendert'
                ? 'unverändert'
                : 'Quelle fehlt — nicht bereitgestellt'
          process.stdout.write(`[pmh] Skill ${befund.name}: ${was}\n`)
        }
      } catch (cause) {
        process.stdout.write(
          `[pmh] WARNUNG: Skill-Vorrat nicht bereitgestellt — ` +
            `${cause instanceof Error ? cause.message : String(cause)}\n`,
        )
      }

      // **Die Portwahl — „binden statt fragen"** (siehe `port-wahl.mjs`).
      //
      // Warum das VOR dem Start geschieht und nicht der Host selbst entscheidet:
      // der Host reicht `--port` an das Web-Bündel durch, das den Port **bindet**.
      // Wäre der Port dort belegt, endete der Host mit einem Fehler — und der
      // Launcher müsste raten, woran es lag. Hier ist die Frage eine Prüfung mit
      // klarer Antwort.
      //
      // **Der Restwettlauf ist benannt und klein:** zwischen der Freigabe des
      // Prüfports und der Bindung durch den Host liegen Mikrosekunden. Wird der
      // Port in genau diesem Fenster genommen, scheitert der Host sichtbar — das
      // ist der richtige Ausgang, kein stiller Fehlstart.
      let port = options.port
      try {
        const choice = await choosePort(options.port, { span: options.strictPort ? 1 : 20 })
        port = choice.port
        process.stdout.write(`[pmh] ${describePortChoice(choice)}\n`)
      } catch (cause) {
        // **Mit `--strict-port` ist das der gewollte Ausgang**, ohne es ein
        // echter Fehler: kein freier Port im Bereich. Der Start bricht **sichtbar**
        // ab — mit dem Hinweis, wie man einen anderen wählt.
        process.stdout.write(`[pmh] FEHLER: ${cause instanceof Error ? cause.message : String(cause)}\n`)
        process.exit(1)
      }

      process.stdout.write(
        `[pmh] Oberfläche: http://127.0.0.1:${port}/  — ohne Token antwortet sie 401,\n` +
          `[pmh] die benutzbare Adresse folgt unten, sobald der Host sie meldet.\n`,
      )
      // **Und die Welt liegt daneben — auf DEMSELBEN Port.** Sie wird ausgeliefert, sobald der Host
      // läuft (`packages/web/world-static`, Pfad aus `scripts/world-path.mjs`). Die Adresse steht
      // hier, weil ein Mensch sie sucht — nicht erst hinter einem Klick auf die Marke.
      if (options.welt) {
        process.stdout.write(
          `[pmh] Welt: ${worldUrl(`http://127.0.0.1:${port}`)}  — dieselbe Adresse, anderer Pfad.\n`,
        )
      }
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
      // **Warum `--preload` davorsteht.**
      //
      // Der Core hat Teilsysteme, die **Node voraussetzen**. Unter Bun brechen sie
      // **stumm**: der Host startet, liefert HTTP 200, und erst bei der Benutzung
      // fällt es auf. Zwei Lücken sind gemessen:
      //
      //   1. `module.stripTypeScriptTypes` fehlt unter Bun (Node hat es). Das
      //      PTC-Zwischenstück lädt nicht, `ptcRuntime` fehlt, die Voreinstellung
      //      `standard` gilt als ungültig — **es läßt sich keine Sitzung anlegen**.
      //   2. **Bun verschluckt den `--`-Trenner**, Node reicht ihn durch. Der
      //      Subprozess-Runner verlangt ihn wörtlich — also scheitert er immer,
      //      und mit ihm **Shell und Suche zugleich**.
      //
      // Beide werden durch **eine** Vorladung geschlossen: je **eine Zeile** in
      // **einer** fremden Datei, ersetzt über ein Bun-Plugin auf den Dateipfad.
      // **Kein** Eintrag in `patches/`, **kein** `patchedDependencies` — der
      // Abhängigkeitsbaum bleibt unberührt. Siehe `scripts/bun-gap-preload.mjs`.
      //
      // Findet eine Ergänzung ihren Anker nicht, **wirft sie** und der Host startet
      // nicht. Lieber laut scheitern als eine Ergänzung, die ins Leere greift und
      // den Fehler bestehen läßt.
      const vorladen = ['--preload', join(ROOT, 'scripts', 'bun-gap-preload.mjs')]
      launch('host', BUN, [...vorladen, hostEntry, options.profile, '--port', String(port), '--home', options.home, '--no-open'], {
        cwd: ROOT,
        kind: 'host',
        // **Warum der Host einen Beobachter bekommt.** Er gibt eine Adresse
        // **mit** Token aus — und ohne dieses Token antwortet die Oberfläche mit
        // **401** (gemessen am 13.10.2026). Wer die oben genannte Adresse
        // abschreibt, landet auf einer Fehlerseite. Der Beobachter liefert die
        // benutzbare Adresse nach.
        onOutput: () => {
          const beobachter = announceAuthUrl((text) => process.stdout.write(`${text}\n`))
          return beobachter
        },
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
    process.stdout.write('[pmh] Nichts zu starten — alle Teile waren abgeschaltet.\n')
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
