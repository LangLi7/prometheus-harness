/**
 * `scripts/install.mjs` — ein Befehl von der frischen Kopie bis zum laufenden Projekt.
 *
 * ## Warum dieses Skript existiert
 *
 * Das Vorbild ist die Referenz-Harness, deren Anleitung vier Zeilen hat:
 *
 * ```
 * git clone …/deepseek-harness.git
 * cd deepseek-harness
 * pnpm install
 * pnpm run build
 * pnpm dsh web
 * ```
 *
 * Bei uns fehlten davon **zwei**: es gab kein `build` (bei uns: Typecheck, weil
 * Bun nichts bauen muß) und keine Einrichtung der Datenbank. Wer das Projekt
 * frisch klonte, bekam eine **leere** Datenbank — und der Bereitschaftsendpunkt
 * meldete zu Recht 503, ohne daß irgendwo stand, was zu tun ist.
 *
 * ## Warum in Bun und nicht als Shell-Skript
 *
 * **Gemessen auf dem Zielrechner am 13.10.2026** — und das ist der Grund, der
 * jede andere Bauart ausschließt:
 *
 * | Werkzeug | Befund |
 * |---|---|
 * | `sh` | **fehlt** |
 * | `bash` | vorhanden, aber aus **WSL** — sieht `C:\…` nicht |
 * | `unzip` | **fehlt** |
 * | `powershell` | die alte **5.1** |
 * | Ausführungsrichtlinie | `CurrentUser = Restricted` — **`.ps1` lädt nicht** |
 *
 * Ein Installer als `.sh` hätte hier **keinen Interpreter**. Einer als `.ps1`
 * würde von der Richtlinie blockiert. Bun dagegen ist die eine Voraussetzung,
 * die dieses Projekt ohnehin hat — und kann alles, was ein Installer braucht:
 * Prozesse starten, Dateien schreiben, Netze bedienen.
 *
 * Die beiden Hüllen `install.sh` und `install.ps1` sind deshalb **dünn**: sie
 * stellen sicher, daß Bun da ist, und rufen dieses Skript. Die Logik gibt es
 * **einmal**.
 *
 * ## Was es tut
 *
 * | Schritt | Wirkung |
 * |---|---|
 * | 1 | Werkzeuge prüfen und **installieren, wo das automatisierbar ist** |
 * | 2 | Abhängigkeiten (`bun install`) |
 * | 3 | `.env` aus `.env.example` mit **erzeugten** Geheimnissen |
 * | 4 | Stapel starten (PostgreSQL, Redis) und auf Gesundheit **warten** |
 * | 5 | Migrationen |
 * | 6 | Typecheck (unser „build") |
 * | 7 | Prüfen, was läuft — und den nächsten Befehl nennen |
 *
 * **Jeder Schritt ist wiederholbar.** Ein zweiter Lauf ändert nichts, was schon
 * richtig ist — und sagt das auch.
 *
 * ## Wo es **nicht** automatisch installiert
 *
 * Docker auf Windows: der offizielle Weg ist Docker Desktop, ein Programm mit
 * Oberfläche und eigener Lizenz. Es still zu installieren wäre eine Entscheidung
 * über die Lizenz des Benutzers. Das Skript **nennt den Befehl** und bricht ab —
 * sichtbar, statt heimlich.
 *
 * Auf Linux ist Docker über das offizielle Skript installierbar; das braucht
 * aber **root**. Auch hier gilt: das Skript sagt, was zu tun ist, und tut es
 * nicht ungefragt.
 *
 * @module scripts/install
 */

import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  GEHEIMNIS_NAMEN,
  abgeleiteteWerte,
  erkenneUmgebung,
  familie,
  fassePruefungenZusammen,
  kennwortKonfliktHinweise,
  neuesGeheimnis,
  pruefeKennwortAbgleich,
  setzeWerte,
  umgebungsHinweise,
  werkzeugBefehl,
  wslLage,
} from './install-teile.mjs'

/** Wurzel des Projekts, abgeleitet aus dem Modulpfad. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Die laufende Bun-Binärdatei — siehe `scripts/start.mjs`, gleicher Grund. */
const BUN = process.execPath

/** Schreibt eine Zeile ohne Umweg. */
const aus = (text) => process.stdout.write(text)

/**
 * Startet einen Unterprozeß und liefert Exit-Code und gesammelte Ausgabe.
 *
 * @param programm - das Programm
 * @param args - seine Argumente
 * @param optionen - Arbeitsverzeichnis und Umgebung
 * @returns Exit-Code und Ausgabe
 */
function laufe(programm, args, optionen = {}) {
  return new Promise((fertig) => {
    const kind = spawn(programm, args, {
      cwd: optionen.cwd ?? ROOT,
      env: optionen.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // **Kein `shell`.** Mit `shell: true` würde die Shell die Argumente
      // zerlegen — und ein Kennwort mit Sonderzeichen zerfiele dabei. Ohne Shell
      // geht jedes Argument unverändert an das Programm.
      shell: false,
    })
    let text = ''
    kind.stdout?.on('data', (s) => {
      text += String(s)
      if (optionen.durchreichen === true) aus(String(s))
    })
    kind.stderr?.on('data', (s) => {
      text += String(s)
      if (optionen.durchreichen === true) process.stderr.write(String(s))
    })
    kind.on('error', (fehler) => fertig({ code: -1, text: `${text}\n${fehler.message}` }))
    kind.on('exit', (code) => fertig({ code: code ?? -1, text }))
  })
}

/**
 * Prüft, ob ein Programm aufrufbar ist.
 *
 * **Warum nicht `which`/`where`.** Beides ist plattformabhängig, und `where`
 * gibt es auf Linux nicht. Ein Probelauf ist die einzige Frage, die beide
 * Plattformen gleich beantworten: *läuft es?*
 *
 * @param programm - das Programm
 * @param args - Argumente für den Probelauf
 * @returns true, wenn es mit Exit-Code 0 antwortet
 */
async function laeuft(programm, args = ['--version']) {
  const { code } = await laufe(programm, args)
  return code === 0
}

/**
 * Prüft die Werkzeuge und **installiert Bun, wo es fehlt**.
 *
 * **Warum Bun hier überhaupt installiert wird, obwohl dieses Skript Bun
 * ausführt.** Weil es zwei Wege gibt, es zu starten: über `install.ps1`/
 * `install.sh` (die es vorher sicherstellen) und über `bun scripts/install.mjs`
 * (dann ist es schon da). Diese Funktion ist der dritte Weg — `node
 * scripts/install.mjs` — und macht daraus einen erfolgreichen.
 *
 * @returns true, wenn danach alles da ist
 */
async function stelleBunSicher() {
  const befehl = werkzeugBefehl('bun')
  if (await laeuft(befehl)) return true

  aus('\nBun ist nicht installiert — wird jetzt installiert.\n')
  if (familie() === 'windows') {
    // Der offizielle Weg des Bun-Projekts für Windows. `irm … | iex` ist die
    // dokumentierte Form; hier wird sie als `powershell -Command` gerufen, weil
    // eine Pipe keine Argumentliste ist.
    const befehlText = 'irm bun.sh/install.ps1 | iex'
    aus(`  ${befehlText}\n`)
    const { code, text } = await laufe('powershell', ['-NoProfile', '-Command', befehlText], {
      durchreichen: true,
    })
    if (code !== 0) {
      aus(`\nFEHLER: Bun konnte nicht installiert werden (exit ${String(code)}).\n${text}\n`)
      return false
    }
  } else {
    const befehlText = 'curl -fsSL https://bun.sh/install | bash'
    aus(`  ${befehlText}\n`)
    const { code, text } = await laufe('sh', ['-c', befehlText], { durchreichen: true })
    if (code !== 0) {
      aus(`\nFEHLER: Bun konnte nicht installiert werden (exit ${String(code)}).\n${text}\n`)
      return false
    }
  }
  aus(
    '\nBun wurde installiert. **Starte dieses Skript in einer NEUEN Shell** — der\n' +
      'Pfad zu Bun steht erst dann in der Umgebung.\n',
  )
  return false
}

/**
 * Prüft die Werkzeuge, die dieses Projekt braucht.
 *
 * **Warum `docker info` und nicht nur `docker --version`.** Der Unterschied
 * zwischen *installiert* und *erreichbar* ist auf diesem Rechner zweimal
 * aufgetreten:
 *
 * * Auf Windows ist Docker Desktop installiert und der Dienst gestoppt.
 * * In **WSL2** ist `docker` im PATH, und `docker info` **scheitert** — die
 *   Integration für diese Distribution ist nicht eingeschaltet (gemessen am
 *   13.10.2026).
 *
 * Beide Fälle sehen bei `--version` wie „alles in Ordnung" aus und scheitern
 * danach an einer Stelle, die nach einem Fehler des Skripts aussieht.
 *
 * @returns die Einzelergebnisse
 */
/**
 * Prüft die Werkzeuge, die dieses Projekt braucht.
 *
 * **Warum die Abhängigkeiten eingespeist werden (seit 14.10.2026).** Bis hierher
 * rief diese Funktion `laeuft`/`laufe` und `process.platform` direkt auf. Damit war
 * sie **nicht prüfbar**: einen Rechner ohne Go gibt es hier nicht, und ein Test,
 * der einen solchen braucht, ist keiner. Gemessen war die Folge, daß `install.mjs`
 * von **keiner** Prüfdatei genannt wurde und die `FEHLT`-Zeilen für **Go** und
 * **WSL2** nur **gelesen**, nie **ausgeführt** waren.
 *
 * Die Vorgaben sind **genau die bisherigen Funktionen** — der Aufruf in `main`
 * bleibt deshalb unverändert, und das Verhalten ist dasselbe. Der Unterschied ist,
 * daß ein Test jetzt `laeuft`/`laufe`/`plattform` **ersetzen** kann und damit
 * jeden Fall herstellen: Go fehlt, WSL2 fehlt, alles da.
 *
 * @param deps - die Abhängigkeiten; Vorgabe ist das wirkliche Verhalten
 * @returns die Einzelergebnisse
 */
export async function pruefeWerkzeuge(deps = { laeuft, laufe, plattform: process.platform }) {
  const { laeuft: istDa, laufe: hole, plattform } = deps
  const ergebnisse = []
  const bunDa = await istDa(werkzeugBefehl('bun'))
  ergebnisse.push({ name: 'bun', ok: bunDa, hinweis: bunDa ? undefined : 'https://bun.sh' })
  const dockerDa = await istDa(werkzeugBefehl('docker'), ['--version'])
  ergebnisse.push({
    name: 'docker',
    ok: dockerDa,
    hinweis: dockerDa ? undefined : 'https://docs.docker.com/get-docker/',
  })
  let dockerLaeuft = false
  if (dockerDa) {
    dockerLaeuft = await istDa(werkzeugBefehl('docker'), ['info'])
    ergebnisse.push({
      name: 'docker-Dienst',
      ok: dockerLaeuft,
      hinweis: dockerLaeuft ? undefined : 'installiert, aber nicht erreichbar',
    })
  }
  const gitDa = await istDa(werkzeugBefehl('git'))
  ergebnisse.push({ name: 'git', ok: gitDa, hinweis: gitDa ? undefined : 'https://git-scm.com' })
  // **Go — geprüft seit dem 14.10.2026, und der Grund ist gemessen.** `start.mjs`
  // baut die Dienste unter `services/` mit `go build`. Fehlte Go, lief die
  // Installation trotzdem **grün durch**, und erst `bun run start` meldete
  // „[pmh-attach] FEHLER: 'go' nicht startbar" und „ÜBERSPRUNGEN — Build
  // fehlgeschlagen": Erfolg am Ende der Installation, Enttäuschung beim ersten
  // Start. Auf dem Entwicklerrechner fiel das nie auf, weil `go` dort im PATH
  // liegt. Wie bei Docker gilt: **nennen, nicht still installieren.**
  const goDa = await istDa(werkzeugBefehl('go'), ['version'])
  ergebnisse.push({
    name: 'go',
    ok: goDa,
    hinweis: goDa ? undefined : 'https://go.dev/dl/ — ohne Go werden die Go-Dienste übersprungen',
  })
  // **WSL2 auf Windows — und zwar VOR Docker.** `native/landlock-run` ist ein
  // **Landlock**-Starter, also eine Linux-Kernel-Eigenschaft; Docker Desktop nimmt
  // auf Windows den WSL2-Backend-Weg. `wsl.exe` schreibt **UTF-16**, deshalb liest
  // `wslLage()` die Ausgabe (Falle als Prüfung festgehalten). **Nicht still
  // einschalten:** `wsl --install` braucht Administratorrechte und meist einen
  // Neustart — dieselbe Zurückhaltung wie bei Docker Desktop.
  if (plattform === 'win32') {
    const version = await hole(werkzeugBefehl('wsl'), ['--version'])
    const liste = await hole(werkzeugBefehl('wsl'), ['-l', '-v'])
    const wsl = wslLage(version.text, liste.text)
    ergebnisse.push({
      name: 'wsl2',
      ok: wsl.bereit,
      hinweis: wsl.bereit
        ? undefined
        : 'wsl --install   (Administrator; meist mit Neustart) — ohne WSL2 bleiben Sandbox und Go-Dienste außen vor',
    })
  }
  return { ergebnisse, dockerLaeuft, dockerDa }
}

/**
 * Stellt die Umgebung fest — WSL, Windows-Dateisystem, Docker-Erreichbarkeit.
 *
 * **Warum das vor den Werkzeugen geschieht.** Die Hinweise hängen voneinander
 * ab: „Docker ist nicht erreichbar" heißt auf Windows etwas anderes als in WSL.
 * Wer den Zusammenhang nicht kennt, gibt den falschen Rat.
 *
 * @returns die Erkenntnis
 */
async function stelleUmgebungFest() {
  let versionstext = ''
  if (familie() !== 'windows') {
    try {
      versionstext = readFileSync('/proc/version', 'utf8')
    } catch {
      versionstext = ''
    }
  }
  const hatMntC = existsSync('/mnt/c/Users')
  return erkenneUmgebung({ versionstext, hatMntC })
}

/**
 * Richtet die `.env` ein.
 *
 * ## Die Regel, die hier gilt — und der Fehler, der sie erzwungen hat
 *
 * **Läuft schon ein Container, werden seine Kennwörter übernommen. Sonst werden
 * neue erzeugt.**
 *
 * Der erste Entwurf erzeugte **immer** neue. Gemessen am 13.10.2026 auf dem
 * Zielrechner:
 *
 * ```
 * $ docker inspect pmh-postgres … POSTGRES_PASSWORD  →  bitte-aendern-admin
 * $ .env  (vom Installer erzeugt)  POSTGRES_SUPERUSER_PASSWORD  →  57OqNHhO…
 * $ bun scripts/migrate.mjs
 *   FEHLER bei den Migrationen: password authentication failed for user "pmh_owner"
 * ```
 *
 * **Warum das kein Ausnahmefall ist, sondern der Normalfall.** PostgreSQL legt
 * Rollen und Kennwörter beim **ersten** Start eines leeren Datenverzeichnisses
 * an (`docker/postgres-init/02-roles.sh`). Ein späterer `docker compose up` mit
 * anderen Werten ändert sie **nicht**: der Container wird neu erzeugt, das Volume
 * bleibt, die Kennwörter bleiben. Wer also den Stapel einmal gestartet hat — und
 * das tut jeder —, hat einen Bestand, den eine neue `.env` **nicht** erreicht.
 *
 * **Was daraus folgt, und das ist die allgemeine Regel:** ein Installer, der
 * einen bestehenden Bestand vorfindet, **fragt ihn** — statt ihn zu überschreiben.
 * Neue Geheimnisse sind nur dort richtig, wo noch nichts existiert.
 *
 * **Warum nur die Kennwörter und nicht die Rollennamen.** Die Rollen könnten
 * ebenfalls abweichen, aber ihr Name steht in jedem SQL des Projekts. Sie zu
 * ändern wäre eine Änderung am Code, nicht an der Konfiguration — das gehört
 * einem Menschen.
 *
 * @param wurzel - die Projektwurzel
 * @param schreibe - Ausgabe
 * @param laufenderContainer - die Umgebung des bestehenden Containers, oder `undefined`
 * @returns ob die Datei neu angelegt wurde
 */
export function richteEnvEin(wurzel = ROOT, schreibe = aus, laufenderContainer = undefined) {
  const ziel = join(wurzel, '.env')
  const vorlage = join(wurzel, '.env.example')
  if (existsSync(ziel)) {
    schreibe('  .env ist schon da — bleibt unverändert (dort stehen die Kennwörter der Datenbank).\n')
    return false
  }
  if (!existsSync(vorlage)) {
    schreibe('  FEHLER: .env.example fehlt — ist das die Projektwurzel?\n')
    return false
  }

  // Der Bestand schlägt die Erfindung: was im Container steht, gilt.
  const uebernommen = {}
  if (laufenderContainer !== undefined) {
    // Der Container nennt den Superuser als `POSTGRES_PASSWORD`; die drei
    // anderen Rollen stehen unter ihrem eigenen Namen.
    if (laufenderContainer.POSTGRES_PASSWORD !== undefined) {
      uebernommen.POSTGRES_SUPERUSER_PASSWORD = laufenderContainer.POSTGRES_PASSWORD
    }
    for (const name of ['PMH_OWNER_PASSWORD', 'PMH_APP_PASSWORD', 'PMH_READONLY_PASSWORD']) {
      if (laufenderContainer[name] !== undefined) uebernommen[name] = laufenderContainer[name]
    }
  }

  const werte = {}
  for (const name of GEHEIMNIS_NAMEN) werte[name] = neuesGeheimnis(32)
  // Übernehmen **nach** dem Erzeugen: der Bestand gewinnt.
  Object.assign(werte, uebernommen)
  const ersetzt = { ...werte, ...abgeleiteteWerte(werte) }
  const { inhalt, ersetzt: zahl } = setzeWerte(readFileSync(vorlage, 'utf8'), ersetzt)
  writeFileSync(ziel, inhalt, 'utf8')

  const ausBestand = Object.keys(uebernommen).length
  schreibe(`  .env angelegt: ${String(zahl)} Werte gesetzt.\n`)
  if (ausBestand > 0) {
    schreibe(
      `  ${String(ausBestand)} Kennwort(e) aus dem LAUFENDEN Container übernommen —\n` +
        '  ein neues Kennwort hätte den Zugang zur bestehenden Datenbank zerstört.\n',
    )
  }
  schreibe(
    `  ${String(GEHEIMNIS_NAMEN.length - ausBestand)} Geheimnis(se) neu erzeugt.\n` +
      '  (Die Datei steht in .gitignore — sie darf nie ins Repository.)\n',
  )
  return true
}

/**
 * Liest die Werte, die für die folgenden Schritte gebraucht werden, aus `.env`.
 *
 * **Warum nicht aus `process.env`.** Der Benutzer hat die Werte gerade in eine
 * Datei geschrieben; sie stehen nicht in seiner Umgebung. Beides zu berücksichtigen
 * wäre eine zweite Wahrheit — hier gilt: **die Datei** ist die Quelle, und die
 * Umgebung **schlägt** sie (wer etwas ausdrücklich setzt, meint es).
 *
 * ## Der CRLF-Fehler, der auch hier steckte
 *
 * Die erste Fassung benutzte `=(.*)$` — genau wie `setzeWerte`, und mit
 * **demselben** Ausgang. Gemessen am 13.10.2026 in einem sauberen Klon auf
 * Windows:
 *
 * ```
 * [diag] Anzahl Werte=51
 * [diag] MIGRATION_DATABASE_URL=undefined
 * FEHLER: MIGRATION_DATABASE_URL wurde in .env nicht gefunden.
 * ```
 *
 * Die Zeile lautete roh
 * `"MIGRATION_DATABASE_URL=postgres://…:5432/pmh\r"`. In JavaScript matcht `.`
 * **kein** `\r` — also scheiterte das Muster und der Wert **fehlte**.
 *
 * **Die Lehre, die hier steht.** Ich hatte `setzeWerte` korrigiert und `leseEnv`
 * **übersehen** — beide benutzten dasselbe Muster. Wer einen Fehler an einer
 * Stelle findet, muß nach **allen** Stellen desselben Musters suchen. Deshalb
 * steht `[^\r\n]*` jetzt an beiden.
 *
 * @param wurzel - die Projektwurzel
 * @returns die Werte
 */
export function leseEnv(wurzel = ROOT) {
  const pfad = join(wurzel, '.env')
  const werte = {}
  if (existsSync(pfad)) {
    for (const zeile of readFileSync(pfad, 'utf8').split('\n')) {
      // `[^\r\n]*` schließt das Zeilenende ausdrücklich aus, statt sich auf das
      // Verhalten von `.` zu verlassen.
      const treffer = /^\s*([A-Z][A-Z0-9_]*)=([^\r\n]*)/u.exec(zeile)
      if (treffer !== null) werte[treffer[1]] = treffer[2]
    }
  }
  for (const [name, wert] of Object.entries(process.env)) {
    if (wert !== undefined && /^[A-Z][A-Z0-9_]*$/u.test(name)) werte[name] = wert
  }
  return werte
}

/**
 * Liest die Umgebung des laufenden Postgres-Containers.
 *
 * **Warum über `docker inspect` und nicht über Compose.** Compose kennt die
 * Werte, mit denen es **jetzt** aufgerufen würde — nicht die, mit denen der
 * Container **tatsächlich** läuft. Genau dieser Unterschied ist das Problem.
 *
 * @returns die Werte, oder `undefined`, wenn kein Container läuft
 */
async function containerUmgebung() {
  const { code, text } = await laufe(werkzeugBefehl('docker'), [
    'inspect',
    'pmh-postgres',
    '--format',
    '{{range .Config.Env}}{{println .}}{{end}}',
  ])
  if (code !== 0) return undefined
  const werte = {}
  for (const zeile of text.split('\n')) {
    const treffer = /^([A-Z_]+)=(.*)$/u.exec(zeile.trim())
    if (treffer !== null) werte[treffer[1]] = treffer[2]
  }
  return Object.keys(werte).length > 0 ? werte : undefined
}

/**
 * Startet den Stapel und **wartet, bis er gesund ist**.
 *
 * **Warum gewartet wird und nicht geschlafen.** Ein `sleep 10` ist eine
 * Behauptung über die Geschwindigkeit eines fremden Rechners. Der Stapel hat
 * dafür einen Vertrag: `healthcheck` in `docker-compose.yml`. `docker compose up
 * -d --wait` liest ihn und kommt zurück, wenn er erfüllt ist — oder mit einem
 * Fehler, wenn nicht. Das ist der Unterschied zwischen „ich habe gewartet" und
 * „es ist bereit".
 *
 * @param schreibe - Ausgabe
 * @returns true, wenn der Stapel gesund ist
 */
async function starteStapel(schreibe = aus) {
  const docker = werkzeugBefehl('docker')
  schreibe('  docker compose up -d --wait\n')
  const { code, text } = await laufe(docker, ['compose', 'up', '-d', '--wait'], { durchreichen: false })
  if (code !== 0) {
    schreibe(`  FEHLER beim Starten des Stapels (exit ${String(code)}):\n`)
    for (const zeile of text.trimEnd().split('\n').slice(-12)) schreibe(`    ${zeile}\n`)
    return false
  }
  return true
}

/**
 * Führt einen Schritt mit Überschrift aus.
 *
 * @param nummer - die Schrittnummer
 * @param titel - die Überschrift
 * @param koerper - was zu tun ist
 * @returns das Ergebnis des Körpers
 */
async function schritt(nummer, titel, koerper) {
  aus(`\n[${String(nummer)}/7] ${titel}\n`)
  return await koerper()
}

/**
 * Der ganze Ablauf.
 *
 * @param optionen - Ausgabe und Wurzel, austauschbar für Prüfungen
 * @returns der Exit-Code
 */
export async function installiere(optionen = {}) {
  const wurzel = optionen.wurzel ?? ROOT
  const schreibe = optionen.schreibe ?? aus
  const ueberspringeStapel = optionen.ohneStapel === true

  schreibe(`Prometheus Harness — Installation (${familie()})\n`)
  schreibe(`Projekt: ${wurzel}\n`)

  // ── 1 ────────────────────────────────────────────────────────────────────
  const umgebung = await stelleUmgebungFest()
  if (umgebung.wsl) {
    schreibe(
      `Umgebung: WSL${umgebung.wslVersion ?? ''}` +
        `${umgebung.windowsDateisystem ? ' (Projekt auf dem Windows-Dateisystem)' : ''}\n`,
    )
  }
  const werkzeuge = await schritt(1, 'Werkzeuge prüfen', async () => {
    if (!(await stelleBunSicher())) {
      if (!(await laeuft(werkzeugBefehl('bun')))) return null
    }
    const { ergebnisse, dockerLaeuft, dockerDa } = await pruefeWerkzeuge()
    const zusammen = fassePruefungenZusammen(ergebnisse)
    for (const zeile of zusammen.zeilen) schreibe(`  ${zeile}\n`)

    // **Erst die Umgebungshinweise.** Sie erklären, *warum* etwas fehlt — ohne
    // sie ist „docker-Dienst: FEHLT" unter WSL irreführend, weil `docker` dort
    // im PATH liegt und der Dienst trotzdem nicht angebunden ist.
    const hinweise = umgebungsHinweise(umgebung, dockerLaeuft)
    if (hinweise.length > 0) schreibe(`\n${hinweise.join('\n')}\n`)

    if (!zusammen.allesDa) {
      schreibe('\nEs fehlt noch etwas. Die Adressen stehen oben neben FEHLT.\n')
      if (!dockerDa) {
        if (familie() === 'windows') {
          schreibe(
            '\nDocker auf Windows: **Docker Desktop** installieren (Programm mit Oberfläche\n' +
              'und eigener Lizenz — das installiert dieses Skript nicht ungefragt):\n' +
              '  https://docs.docker.com/desktop/install/windows-install/\n' +
              'Alternative über winget:\n' +
              '  winget install --id Docker.DockerDesktop\n',
          )
        } else {
          schreibe(
            '\nDocker auf Linux (braucht root — deshalb hier nur genannt, nicht getan):\n' +
              '  curl -fsSL https://get.docker.com | sudo sh\n' +
              '  sudo usermod -aG docker "$USER"   # danach neu anmelden\n',
          )
        }
      }
      if (dockerDa && !dockerLaeuft && hinweise.length === 0) {
        schreibe('\nDocker läuft nicht — Docker Desktop bzw. den Docker-Dienst starten.\n')
      }
      return null
    }
    return ergebnisse
  })
  if (werkzeuge === null) return 1

  // ── 2 ────────────────────────────────────────────────────────────────────
  const abhaengigkeiten = await schritt(2, 'Abhängigkeiten installieren (bun install)', async () => {
    const { code, text } = await laufe(BUN, ['install'], { cwd: wurzel })
    if (code !== 0) {
      schreibe(`  FEHLER (exit ${String(code)}):\n${text}\n`)
      return false
    }
    const letzte = text.trimEnd().split('\n').slice(-1)[0] ?? ''
    schreibe(`  ${letzte}\n`)
    return true
  })
  if (!abhaengigkeiten) return 1

  // ── 3 ────────────────────────────────────────────────────────────────────
  // **Der Bestand wird VOR der `.env` gelesen.** Ein Installer, der einen
  // laufenden Stapel vorfindet, muß dessen Kennwörter übernehmen — neue würden
  // den Zugang zur bestehenden Datenbank zerstören (siehe `richteEnvEin`).
  const bestehenderContainer = await containerUmgebung()
  await schritt(3, 'Konfiguration einrichten (.env)', async () => {
    if (bestehenderContainer !== undefined) {
      schreibe('  Ein laufender Container wurde gefunden — seine Kennwörter gelten.\n')
    }
    richteEnvEin(wurzel, (t) => schreibe(t), bestehenderContainer)
  })

  // ── 4 ────────────────────────────────────────────────────────────────────
  const stapel = await schritt(4, 'Datenbank und Redis starten', async () => {
    if (ueberspringeStapel) {
      schreibe('  übersprungen (--ohne-stapel)\n')
      return true
    }
    // ---------------------------------------------------------------------
    // ERST prüfen, ob die Kennwörter zusammenpassen — DANN starten.
    // ---------------------------------------------------------------------
    // **Die letzte Sicherung.** `richteEnvEin` hat den Bestand schon übernommen;
    // diese Prüfung fängt den Fall ab, wo die `.env` **schon vorher** da war und
    // jemand sie von Hand geändert hat. Ein Konflikt wird durch den Start nicht
    // besser: PostgreSQL ändert Kennwörter nicht nach.
    const laufend = await containerUmgebung()
    const envWerte = leseEnv(wurzel)
    const abgleich = pruefeKennwortAbgleich(envWerte, laufend)
    if (abgleich.geprueft && !abgleich.passt) {
      for (const zeile of kennwortKonfliktHinweise(laufend)) schreibe(`  ${zeile}\n`)
      return false
    }
    if (abgleich.geprueft) schreibe(`  ${abgleich.grund}\n`)
    return await starteStapel((t) => schreibe(t))
  })
  if (!stapel) {
    schreibe('\nDer Stapel läuft nicht. Ohne Datenbank kann die Anwendung nicht arbeiten.\n')
    return 1
  }

  // ── 5 ────────────────────────────────────────────────────────────────────
  const migriert = await schritt(5, 'Datenbankschema anlegen (Migrationen)', async () => {
    if (ueberspringeStapel) {
      schreibe('  übersprungen (--ohne-stapel)\n')
      return true
    }
    // ---------------------------------------------------------------------
    // Die Migration als EIGENER PROZESS — nicht als Import.
    // ---------------------------------------------------------------------
    // **Der Befund, der das erzwungen hat.** Als Import im Installer-Prozeß
    // scheiterte der Treiber im sauberen Klon **reproduzierbar**:
    //
    //     FEHLER: der Datenbanktreiber `postgres` ist nicht ladbar.
    //       Arbeitsverzeichnis: C:\Users\Chang\pmh-ende
    //       node_modules da:    true
    //       postgres da:        true
    //       Grund:  Cannot find package 'postgres' imported from …migrate.mjs
    //
    // **Und dieselbe Datei lief im selben Verzeichnis direkt durch:**
    //
    //     $ bun scripts/migrate.mjs
    //     Schema ist aktuell (Fassung 2). Nichts zu tun.
    //
    // **Was gemessen und damit ausgeschlossen wurde:**
    //
    // | Messung | Ergebnis |
    // |---|---|
    // | direkt, über `cmd /c`, über cmd → PowerShell → bun | funktioniert |
    // | statisch / dynamisch / in einer Funktion | alle drei funktionieren |
    // | `import.meta.resolve('postgres')` | löst korrekt auf |
    // | `bun install`, dann sofort importieren (Wettlauf) | funktioniert — **widerlegt** |
    // | `node_modules` über dem Projektverzeichnis | keines |
    // | mehrere `migrate.mjs` | nur eine |
    //
    // **Die Ursache ist nicht gefunden.** Statt sie zu vermuten, wird der Weg
    // gewechselt: die Migration läuft als **eigener Prozeß** — genau der
    // Aufruf, der in **jedem** gemessenen Fall funktioniert hat.
    //
    // **Was das außerdem besser macht.** Ein eigener Prozeß kann den Installer
    // nicht mit einem offenen Datenbankzeiger zurücklassen, und ein Absturz der
    // Migration reißt die Installation nicht mit. Die Regel dieses Projekts —
    // „Sprachgrenzen sind Dienstgrenzen" — gilt sinngemäß: was eigenen Zustand
    // hat, bekommt einen eigenen Prozeß.
    //
    // **Und die Diagnose bleibt.** `migrate.mjs` nennt im Fehlerfall
    // Arbeitsverzeichnis, Modulherkunft, Zustand von `node_modules` und Grund.
    // Kommt der Fehler wieder, führt die Meldung zur Ursache.
    const { code, text } = await laufe(BUN, [join(wurzel, 'scripts', 'migrate.mjs')], { cwd: wurzel })
    for (const zeile of text.trimEnd().split('\n')) {
      if (zeile.trim() !== '') schreibe(`  ${zeile}\n`)
    }
    return code === 0
  })
  if (!migriert) {
    schreibe('\nDie Migrationen sind nicht durchgelaufen. Siehe die Meldung oben.\n')
    return 1
  }

  // ── 6 ────────────────────────────────────────────────────────────────────
  const geprueft = await schritt(6, 'Typecheck (unser „build")', async () => {
    const { code, text } = await laufe(BUN, [join(wurzel, 'scripts', 'typecheck.mjs')], { cwd: wurzel })
    const zeilen = text.trimEnd().split('\n')
    schreibe(`  ${zeilen.slice(-1)[0] ?? ''}\n`)
    if (code !== 0) {
      schreibe(`\n${text}\n`)
      return false
    }
    return true
  })
  if (!geprueft) return 1

  // ── 7 ────────────────────────────────────────────────────────────────────
  await schritt(7, 'Fertig', async () => {
    schreibe(
      '\n  Starten:\n' +
        '\n' +
        '    bun run start\n' +
        '\n' +
        '  Die Adresse mit dem Anmeldetoken steht am Ende der Ausgabe. Ohne dieses\n' +
        '  Token antwortet die Oberfläche mit 401.\n' +
        '\n' +
        '  Prüfen:\n' +
        '\n' +
        '    bun test packages scripts apps        # alle Prüfungen\n' +
        '    bun run typecheck                     # nur der Typecheck\n' +
        '\n' +
        '  Die Anwendung liest DATABASE_URL und REDIS_URL aus der Umgebung. Ohne sie\n' +
        '  meldet GET /api/ready `ungeprueft` mit HTTP 503 — es wurde dann nichts\n' +
        '  geprüft. Die Werte stehen in .env; sie zu laden ist Sache der Shell:\n' +
        '\n' +
        '    Linux:   set -a; . ./.env; set +a; bun run start\n' +
        // **`[^\\r\\n]*` statt `(.*)`.** Dieselbe CRLF-Falle wie in `leseEnv` und
        // `setzeWerte`: auf Windows liefert `Get-Content` Zeilen mit `\r` am
        // Ende, und `.` matcht kein `\r`. Mit `(.*)` bekäme jede Variable ein
        // unsichtbares `\\r` angehängt — und die Kennwörter wären falsch.
        '    Windows: Get-Content .env | ForEach-Object { if ($_ -match "^(\\w+)=([^\\r\\n]*)") { Set-Item "env:$($matches[1])" $matches[2] } }\n',
    )
  })

  schreibe('\nInstallation abgeschlossen.\n')
  return 0
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ohneStapel = process.argv.includes('--ohne-stapel')
  process.exitCode = await installiere({ ohneStapel })
}
