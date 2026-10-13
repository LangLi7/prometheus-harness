/**
 * Die prüfbaren Teile der Installation: Plattform, Werkzeuge, `.env`, Geheimnisse.
 *
 * ## Warum das eine eigene Datei ist und nicht im Installer steht
 *
 * Der Installer **wirkt**: er legt Dateien an, startet Container, führt
 * Migrationen aus. Wirkung läßt sich schlecht prüfen — ein zweiter Lauf auf
 * derselben Maschine sieht anders aus als der erste.
 *
 * Was sich prüfen läßt, steht deshalb hier: **reine Funktionen** ohne Wirkung.
 * `werkzeugBefehl()` sagt, wie ein Werkzeug auf diesem System zu rufen ist;
 * `erzeugeEnv()` sagt, welcher Inhalt in die `.env` gehört; `neuesGeheimnis()`
 * liefert Zufall. Jede davon ist ohne Docker, ohne Netz und ohne Dateisystem
 * prüfbar — und genau das braucht sie, weil ein Fehler hier jede Installation
 * betrifft.
 *
 * @module scripts/install-teile
 */

import { randomBytes } from 'node:crypto'

/**
 * Erkennt die Plattformfamilie.
 *
 * **Warum zwei Familien und nicht drei.** Für dieses Projekt gibt es zwei
 * ernsthafte Fälle: Windows und POSIX (Linux, macOS). Alles andere ist POSIX mit
 * anderen Namen. Eine dritte Familie wäre eine Unterscheidung ohne Unterschied.
 *
 * @param platform - der Wert von `process.platform`
 * @returns `'windows'` oder `'posix'`
 */
export function familie(platform = process.platform) {
  return platform === 'win32' ? 'windows' : 'posix'
}

/**
 * Wie ein Programm auf dieser Plattform zu rufen ist.
 *
 * **Warum das nicht dasselbe ist wie der Programmname — mit dem Befund, der
 * diese Funktion erzwungen hat.** Gemessen auf dem Zielrechner am 13.10.2026:
 *
 * | Programm | Befund |
 * |---|---|
 * | `sh` | **fehlt** — es gibt nur `bash`, und die kommt aus WSL |
 * | `unzip` | **fehlt** |
 * | `powershell` | die **alte 5.1**, nicht `pwsh` 7 |
 * | `bash` | 5.3.9, aber aus WSL — ein `bash`-Skript sieht daher **nicht** `C:\…` |
 *
 * Daraus folgen zwei Regeln, die dieses Projekt einhalten muß:
 *
 * 1. **Die Logik läuft in Bun, nicht in der Shell.** Ein Installer als
 *    Shell-Skript hätte auf diesem Rechner nicht einmal einen Interpreter.
 * 2. **Die Shell wird nur für Einzelfälle gerufen** — und dann mit dem Namen,
 *    den es hier wirklich gibt.
 *
 * @param werkzeug - logischer Name (`'bun'`, `'docker'`, …)
 * @param platform - der Wert von `process.platform`
 * @returns der aufzurufende Programmname
 */
export function werkzeugBefehl(werkzeug, platform = process.platform) {
  if (familie(platform) === 'windows') {
    // Auf Windows heißen die ausführbaren Dateien `.exe`; ein Aufruf ohne
    // Endung gelingt über den PATH, aber `spawn` ohne `shell` findet sie
    // zuverlässiger mit Endung.
    if (werkzeug === 'bun') return 'bun.exe'
    if (werkzeug === 'docker') return 'docker.exe'
    if (werkzeug === 'git') return 'git.exe'
    return `${werkzeug}.exe`
  }
  return werkzeug
}

/**
 * Erzeugt ein Geheimnis als base64url ohne Auffüllung.
 *
 * **Warum base64url und nicht Hex.** 32 Byte Zufall sind 43 Zeichen base64url
 * oder 64 Zeichen Hex. Beide sind sicher; das kürzere paßt in eine
 * Verbindungsadresse, ohne daß jemand sie umbrechen muß.
 *
 * **Warum ohne Auffüllung.** Das `=` ist in einer URL ein Sonderzeichen und in
 * einer `.env`-Zeile je nach Parser ein Problem. Es wird weggelassen, nicht
 * ersetzt — base64url ist ohne `=` vollständig eindeutig.
 *
 * **Warum `randomBytes` und nicht `Math.random`.** `Math.random` ist für
 * Geheimnisse unbrauchbar: es ist vorhersagbar. `randomBytes` ist der
 * kryptografische Zufall der Plattform.
 *
 * @param bytes - die Länge des Zufalls
 * @returns das Geheimnis
 */
export function neuesGeheimnis(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Die Namen der Zugangsdaten, die eine Installation braucht. **Eine Liste, keine
 * verstreuten Zeichenketten.**
 *
 * Der Grund ist die Prüfung `install-teile.test.mjs`: sie vergleicht diese Liste
 * mit den Namen, die in `.env.example` **und** in `docker-compose.yml` vorkommen.
 * Läuft eine Variable in einem der beiden Dokumente ein und hier nicht, wird die
 * Prüfung rot — statt daß die Installation eine leere Kennung benutzt.
 */
export const GEHEIMNIS_NAMEN = [
  'POSTGRES_SUPERUSER_PASSWORD',
  'PMH_OWNER_PASSWORD',
  'PMH_APP_PASSWORD',
  'PMH_READONLY_PASSWORD',
  'PMH_MASTER_KEY',
]

/**
 * Die Werte, die aus einem Geheimnis abgeleitet werden.
 *
 * **Warum die Verbindungsadressen mitgeschrieben werden und nicht zusammengesetzt
 * werden.** Sie stehen in `.env.example` als vollständige Zeilen. Wer sie beim
 * Installieren zusammensetzt, muß dieselbe Regel noch einmal kennen — und die
 * beiden Regeln gehen irgendwann auseinander. Hier wird die **Vorlage**
 * ersetzt: ein Wert wird durch einen anderen ersetzt, die Form bleibt die der
 * Vorlage.
 *
 * @param werte - die erzeugten Geheimnisse
 * @returns Name → neuer Wert
 */
export function abgeleiteteWerte(werte) {
  const owner = werte.PMH_OWNER_PASSWORD
  const app = werte.PMH_APP_PASSWORD
  return {
    // Die Anwendung benutzt `pmh_app` — **nicht** den Eigentümer und **nicht**
    // den Superuser. Wer hier den Superuser einträgt, hebt das ganze
    // Rechtemodell auf, ohne daß es auffällt.
    DATABASE_URL: `postgres://pmh_app:${app}@127.0.0.1:5432/pmh`,
    // Die Migrationen brauchen DDL und laufen deshalb als `pmh_owner`.
    MIGRATION_DATABASE_URL: `postgres://pmh_owner:${owner}@127.0.0.1:5432/pmh`,
    // Die Prüfungen brauchen die Eigentümerrolle, weil sie Tabellen anlegen.
    PMH_TEST_DATABASE_URL: `postgres://pmh_owner:${owner}@127.0.0.1:5432/pmh`,
    REDIS_URL: 'redis://127.0.0.1:6379',
  }
}

/**
 * Schreibt neue Werte in den Inhalt einer `.env`-Datei.
 *
 * **Die Regel: nur ZEILEN ersetzen, die es schon gibt.** Alles andere bleibt
 * stehen — die Kommentare der Vorlage sind die Anleitung, und wer sie löscht,
 * nimmt dem Benutzer die Erklärung, warum eine Variable so heißt, wie sie heißt.
 *
 * **Warum nur vorhandene Zeilen und keine neuen.** Eine Variable, die in der
 * Vorlage fehlt, gehört dort hin — nicht hier hinein. Sonst gäbe es zwei Orte,
 * an denen eine Variable entsteht, und der zweite wäre unsichtbar.
 *
 * **Kommentierte Zeilen zählen nicht.** `# PMH_READY_DATABASE_URL=…` ist ein
 * Beispiel, kein Wert. Wer sie ersetzt, macht aus einem Beispiel eine
 * Einstellung — eine stille Änderung am Verhalten.
 *
 * @param vorher - der Inhalt der Vorlage
 * @param werte - Name → neuer Wert
 * @returns der neue Inhalt und die Zahl der ersetzten Zeilen
 */
export function setzeWerte(vorher, werte) {
  let ersetzt = 0
  const zeilen = vorher.split('\n').map((zeile) => {
    // Führender Leerraum ist erlaubt, `#` nicht.
    const treffer = /^(\s*)([A-Z][A-Z0-9_]*)=(.*)$/u.exec(zeile)
    if (treffer === null) return zeile
    const name = treffer[2]
    if (!Object.hasOwn(werte, name)) return zeile
    ersetzt += 1
    return `${treffer[1]}${name}=${werte[name]}`
  })
  return { inhalt: zeilen.join('\n'), ersetzt }
}

/**
 * Liest die gesetzten (nicht die auskommentierten) Namen aus einem `.env`-Inhalt.
 *
 * @param inhalt - der Inhalt einer `.env`-Datei
 * @returns die Namen in Dateireihenfolge
 */
export function gesetzteNamen(inhalt) {
  const namen = []
  for (const zeile of inhalt.split('\n')) {
    const treffer = /^\s*([A-Z][A-Z0-9_]*)=/u.exec(zeile)
    if (treffer !== null) namen.push(treffer[1])
  }
  return namen
}

/**
 * Erkennt, ob wir unter WSL laufen — und ob Docker dort erreichbar ist.
 *
 * ## Der Befund, der diese Funktion erzwungen hat
 *
 * Gemessen am 13.10.2026 in WSL2 (Ubuntu 26.04) auf dem Zielrechner:
 *
 * ```
 * $ command -v docker   →  /usr/bin/docker        (im PATH)
 * $ docker info         →  FEHLGESCHLAGEN         (Dienst nicht erreichbar)
 * $ ls /mnt/c/Users     →  da                     (Windows-Dateisystem sichtbar)
 * ```
 *
 * **`docker` ist also da und trotzdem unbrauchbar.** Der Grund ist die
 * fehlende Docker-Desktop-Integration für diese Distribution. Ein Installer, der
 * nur `command -v docker` fragt, meldet „docker ist da" und scheitert danach an
 * einer Stelle, die nach einem Fehler des Skripts aussieht.
 *
 * **Woran man WSL erkennt.** `/proc/version` enthält bei WSL den Hersteller —
 * das ist die einzige verläßliche Spur; ein Verzeichnis `/mnt/c` könnte auch von
 * einem manuell gemounteten System stammen.
 *
 * @param optionen - Versionstext und Prüfungen, austauschbar für Prüfungen
 * @returns die Erkenntnis über die Umgebung
 */
export function erkenneUmgebung(optionen = {}) {
  const versionstext = optionen.versionstext ?? ''
  const hatMntC = optionen.hatMntC ?? false
  const istWsl = /microsoft|wsl/iu.test(versionstext)
  return {
    /** Ob wir unter WSL laufen. */
    wsl: istWsl,
    /** Ob die WSL-Fassung erkennbar ist (`WSL2`, `WSL1`, sonst `undefined`). */
    wslVersion: /WSL(\d)/iu.exec(versionstext)?.[1],
    /**
     * Ob das Windows-Dateisystem sichtbar ist.
     *
     * **Warum das zählt.** Liegt das Projekt unter `/mnt/c/…` und läuft Docker
     * auf der **Windows**-Seite, dann reicht WSL Pfade an einen fremden Dienst
     * weiter — und Bind-Mounts scheitern mit „Datei nicht gefunden", obwohl die
     * Datei da ist. Das ist eine eigene Fehlerklasse.
     */
    windowsDateisystem: hatMntC,
  }
}

/**
 * Die Hinweise, die zu einer Umgebung gehören — in der Sprache des Benutzers.
 *
 * **Warum als eigene Funktion und nicht im Installer verstreut.** Diese Sätze
 * sind das, was ein Mensch bei einem Fehlschlag liest. Sie gehören an **eine**
 * Stelle, damit sie geprüft werden können — und damit sie nicht in einem Zweig
 * fehlen.
 *
 * @param umgebung - das Ergebnis von {@link erkenneUmgebung}
 * @param dockerLaeuft - ob `docker info` erfolgreich war
 * @returns Hinweiszeilen; leer heißt „nichts zu sagen"
 */
export function umgebungsHinweise(umgebung, dockerLaeuft) {
  const zeilen = []
  if (umgebung.wsl && !dockerLaeuft) {
    zeilen.push(
      'WSL erkannt, aber Docker ist dort nicht erreichbar.',
      'In WSL ist `docker` vorhanden, der Dienst aber nicht angebunden.',
      '',
      'Docker Desktop starten und unter',
      '  Settings → Resources → WSL Integration',
      'die Integration fuer diese Distribution einschalten.',
      '',
      'Alternativ ohne WSL arbeiten: den Windows-Einstieg benutzen —',
      '  scripts\\install.cmd',
    )
  }
  if (umgebung.windowsDateisystem && umgebung.wsl) {
    zeilen.push(
      'Das Projekt liegt auf dem Windows-Dateisystem (/mnt/…), waehrend die Shell',
      'in WSL laeuft. Das geht, ist aber langsam — jede Datei wird uebersetzt.',
      'Fuer Tempo: das Projekt in das Linux-Dateisystem legen (~/…).',
    )
  }
  return zeilen
}

/**
 * Eine kurze Zusammenfassung eines Prüfergebnisses für die Ausgabe.
 *
 * @param ergebnisse - die Einzelergebnisse
 * @returns Zeilen für die Konsole, und ob alles gut ging
 */
export function fassePruefungenZusammen(ergebnisse) {
  const fehlend = ergebnisse.filter((e) => !e.ok)
  const zeilen = ergebnisse.map(
    (e) => `${e.ok ? 'ok  ' : 'FEHLT'}  ${e.name}${e.hinweis ? ` — ${e.hinweis}` : ''}`,
  )
  return { zeilen, allesDa: fehlend.length === 0, fehlend }
}

/**
 * Die Werkzeuge, die dieses Projekt auf **jeder** Plattform braucht.
 *
 * **Warum `git` hier steht, obwohl der Installer es nicht benutzt.** Es steht in
 * der Anleitung: `git clone` ist der erste Befehl. Wer den Installer ausführt,
 * hat also geklont — aber wenn `git` fehlt, kann er auch keinen Beitrag
 * einreichen, und das gehört gesagt.
 *
 * **Warum `tar` nicht hier steht.** Gemessen: `tar` ist auf ubuntu, alpine und
 * debian **vorhanden** (BusyBox bringt es mit). Es als Abhängigkeit zu führen
 * wäre eine Anforderung, die niemand erfüllen muß.
 */
export const BENOETIGTE_WERKZEUGE = ['bun', 'docker', 'git']

/**
 * Prüft, ob die Kennwörter in `.env` zu dem **laufenden** Container passen.
 *
 * ## Der Fehler, der diese Prüfung erzwungen hat
 *
 * Gemessen am 13.10.2026 auf dem Zielrechner, nachdem der Installer eine neue
 * `.env` mit **erzeugten** Kennwörtern angelegt hatte:
 *
 * ```
 * $ docker inspect pmh-postgres … POSTGRES_PASSWORD  →  bitte-aendern-admin
 * $ .env   PMH_OWNER_PASSWORD                        →  5iaeo4ow…      (neu erzeugt)
 * $ bun scripts/migrate.mjs
 *   FEHLER bei den Migrationen: password authentication failed for user "pmh_owner"
 * ```
 *
 * **Was geschehen war — und warum es kein Fehler des Installers allein ist.**
 * Der Stapel war **vorher** mit den Platzhaltern aus `.env.example` gestartet
 * worden. PostgreSQL legt seine Rollen und Kennwörter beim **ersten** Start des
 * Datenverzeichnisses an; ein späterer `up` mit anderen Werten ändert das
 * **nicht** — der Container wird neu erzeugt, das Volume bleibt, die Kennwörter
 * bleiben. Der Zugang ist damit verloren, obwohl alles „läuft".
 *
 * **Das ist die häufigste Falle dieses Stapels**, und sie ist unsichtbar: der
 * Installer meldet Erfolg, und der Fehler erscheint später an einer Stelle, die
 * nach einem Datenbankproblem aussieht.
 *
 * ## Was die Prüfung tut und was sie nicht tut
 *
 * Sie **vergleicht und meldet** — sie **ändert nichts**. Das Kennwort im
 * Container zu ändern wäre ein Eingriff in fremde Daten; das Volume zu löschen
 * wäre der Verlust aller Daten. Beides gehört einem Menschen, nicht einem
 * Installationsskript.
 *
 * @param envWerte - die Werte aus `.env`
 * @param containerWerte - die Umgebung des laufenden Containers, oder `undefined` wenn er nicht läuft
 * @returns das Ergebnis mit einer Erklärung in einfachen Sätzen
 */
export function pruefeKennwortAbgleich(envWerte, containerWerte) {
  if (containerWerte === undefined) {
    return { geprueft: false, passt: true, grund: 'kein laufender Container — beim ersten Start wird angelegt' }
  }
  const imContainer = containerWerte.POSTGRES_PASSWORD
  const inEnv = envWerte.POSTGRES_SUPERUSER_PASSWORD
  if (imContainer === undefined) {
    return { geprueft: false, passt: true, grund: 'der Container nennt kein Kennwort' }
  }
  if (inEnv === undefined || inEnv.trim() === '') {
    return { geprueft: false, passt: false, grund: 'in .env fehlt POSTGRES_SUPERUSER_PASSWORD' }
  }
  if (imContainer === inEnv) {
    return { geprueft: true, passt: true, grund: 'die Kennwörter stimmen überein' }
  }
  return {
    geprueft: true,
    passt: false,
    grund: 'die Kennwörter stimmen NICHT überein',
    imContainer,
  }
}

/**
 * Die Handlungsanweisungen bei einem Kennwort-Konflikt.
 *
 * **Warum als eigene Funktion.** Das ist der Text, den ein Mensch in einer
 * Sackgasse liest. Er muß **beide** Auswege nennen — und den Preis jedes Weges.
 * Eine Anweisung, die nur „lösche das Volume" sagt, ist eine Anweisung zum
 * Datenverlust.
 *
 * @param containerWerte - die Umgebung des laufenden Containers
 * @returns Zeilen für die Konsole
 */
export function kennwortKonfliktHinweise(containerWerte) {
  const alt = containerWerte?.POSTGRES_PASSWORD ?? '<unbekannt>'
  return [
    'Der Stapel läuft schon — mit ANDEREN Kennwörtern als in .env stehen.',
    '',
    'PostgreSQL legt Rollen und Kennwörter beim ERSTEN Start des Datenverzeichnisses',
    'an. Ein späterer Start mit anderen Werten ändert sie nicht: der Container wird',
    'neu erzeugt, das Volume bleibt, die Kennwörter bleiben.',
    '',
    'Zwei Wege, und beide kosten etwas:',
    '',
    '  A) Die vorhandenen Kennwörter übernehmen (kein Datenverlust).',
    '     In .env eintragen, was der Container benutzt:',
    `       POSTGRES_SUPERUSER_PASSWORD=${alt}`,
    '     und die drei abgeleiteten Adressen entsprechend anpassen.',
    '     Die Kennwörter der Rollen pmh_owner/pmh_app/pmh_readonly stehen nicht im',
    '     Container — sie wurden beim Einrichten gesetzt. Wer sie nicht mehr kennt,',
    '     nimmt Weg B.',
    '',
    '  B) Neu anfangen (Datenverlust).',
    '       docker compose down -v',
    '       bun scripts/install.mjs',
    '     Das löscht das Volume pmh-postgres-data und legt alles neu an.',
    '',
    'Ohne Entscheidung läuft die Anwendung nicht — sie kann sich nicht anmelden.',
  ]
}
