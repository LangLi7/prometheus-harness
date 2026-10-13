# Beleg: Plug-and-Play-Installation (Windows und Linux)

**Datum:** 13.10.2026 · **Anlaß:** Das Vorbild ist die Anleitung der
Referenz-Harness — *„git clone, cd, pnpm install, pnpm run build, pnpm dsh web"*.
Bei uns fehlten davon **zwei** Schritte: es gab kein `build` und keine
Einrichtung der Datenbank. Wer frisch klonte, bekam eine **leere** Datenbank —
und `/api/ready` meldete zu Recht **503**, ohne daß irgendwo stand, was zu tun ist.

## Das Ergebnis

**Windows** — aus der Eingabeaufforderung, ohne Vorbedingung:

```bat
git clone https://github.com/LangLi7/prometheus-harness.git
cd prometheus-harness
scripts\install.cmd
```

**Linux / macOS:**

```bash
git clone https://github.com/LangLi7/prometheus-harness.git
cd prometheus-harness
./scripts/install.sh
```

Danach `bun run start`. Gemessen im **frischen Klon**, exit **0**:

```
[1/7] Werkzeuge prüfen          ok bun · ok docker · ok docker-Dienst · ok git
[2/7] Abhängigkeiten            524 packages installed [54,48 s]
[3/7] Konfiguration (.env)      9 Werte gesetzt, 4 Kennwörter aus dem Container übernommen
[4/7] Datenbank und Redis       docker compose up -d --wait
[5/7] Migrationen               Schema ist aktuell (Fassung 2)
[6/7] Typecheck                 18 Pakete grün, 0 rot — 2,8 s
[7/7] Fertig                    Starten: bun run start
```

## Die Abhängigkeiten — gemessen, nicht angenommen

**Frische minimale Container** (also der ehrliche Fall „neues System"):

| Werkzeug | `ubuntu:24.04` | `alpine:3` | `debian:stable-slim` |
|---|---|---|---|
| `curl` | **fehlt** | **fehlt** | **fehlt** |
| `git` | **fehlt** | **fehlt** | **fehlt** |
| `bash` | vorhanden | **fehlt** (nur BusyBox `sh`) | fehlt |
| `tar` | vorhanden | vorhanden | vorhanden |

**Daraus folgt der Aufbau.** `install.sh` läuft in **POSIX-`sh`** und benutzt nur
`sh`-Sprachmittel — `bash` gibt es auf Alpine nicht. Es erkennt den
Paketverwalter (`apt`, `dnf`, `yum`, `apk`, `pacman`, `zypper`, `brew`), prüft die
Rechte (`root`, `sudo`, sonst sichtbarer Abbruch) und installiert **`curl` und
`git`**, weil das die Werkzeuge sind, die es selbst zum Weiterlaufen braucht.

**Auf dem Zielrechner gemessen** (Windows, 13.10.2026):

| Werkzeug | Befund |
|---|---|
| `sh` | **fehlt** |
| `bash` | vorhanden — aber aus **WSL** (`bash 5.3.9`, x86_64-linux-gnu) |
| `unzip` | **fehlt** |
| `powershell` | die alte **5.1** (nicht `pwsh` 7) |
| `pwsh` | 7.6.6 |
| Ausführungsrichtlinie | `CurrentUser = Restricted` — **`.ps1` lädt nicht** |

**Daraus folgt die Bauart.** Ein Installer, dessen Logik in der Shell liegt, hätte
hier **keinen Interpreter**. Deshalb: die Logik in **Bun**
(`scripts/install.mjs`), die Hüllen dünn.

## Warum drei Einstiege

| Datei | Wofür | Vorbedingung |
|---|---|---|
| `scripts/install.cmd` | **Windows, immer** | keine |
| `scripts/install.ps1` | Windows aus PowerShell | Richtlinie erlaubt Skripte |
| `scripts/install.sh` | Linux, macOS | `sh` |

`.cmd` ist von der Ausführungsrichtlinie **nicht** betroffen — deshalb ist es der
Einstieg, den die Anleitung nennt. Es ruft `install.ps1` mit
`-ExecutionPolicy Bypass` — **nur für diesen Aufruf**, ohne die Einstellung des
Rechners zu ändern.

## WSL2 — die Falle, die gemessen wurde

In WSL2 Ubuntu 26.04 auf dem Zielrechner:

```
$ command -v docker   →  /usr/bin/docker     (im PATH)
$ docker info         →  FEHLGESCHLAGEN      (Dienst nicht erreichbar)
$ ls /mnt/c/Users     →  da
```

**`docker` ist also vorhanden und trotzdem unbrauchbar** — die
Docker-Desktop-Integration für diese Distribution ist nicht eingeschaltet. Ein
Installer, der nur `command -v docker` fragt, meldet „docker ist da" und scheitert
danach an einer Stelle, die nach einem Skriptfehler aussieht.

**Gemessen, was der Installer jetzt sagt** (`sh scripts/install.sh --ohne-stapel`
in WSL2):

```
[1/7] Werkzeuge prüfen
  ok    bun
  FEHLT  docker — https://docs.docker.com/get-docker/
  ok    git

WSL erkannt, aber Docker ist dort nicht erreichbar.
In WSL ist `docker` vorhanden, der Dienst aber nicht angebunden.

Docker Desktop starten und unter
  Settings → Resources → WSL Integration
die Integration fuer diese Distribution einschalten.

Alternativ ohne WSL arbeiten: den Windows-Einstieg benutzen —
  scripts\install.cmd
Das Projekt liegt auf dem Windows-Dateisystem (/mnt/…), waehrend die Shell
in WSL laeuft. Das geht, ist aber langsam — jede Datei wird uebersetzt.
Fuer Tempo: das Projekt in das Linux-Dateisystem legen (~/…).
```

Erkannt wird WSL an `/proc/version` — die einzige verläßliche Spur; ein
Verzeichnis `/mnt/c` könnte auch von einem manuell gemounteten System stammen.

## Was der Installer **nicht** automatisch installiert

**Docker.** Auf Windows ist der offizielle Weg Docker Desktop — ein Programm mit
Oberfläche und **eigener Lizenz**. Es still zu installieren wäre eine Entscheidung
über die Lizenz des Benutzers. Auf Linux nennt er
`curl -fsSL https://get.docker.com | sudo sh`, führt es aber nicht aus: das
braucht root.

Beide Wege werden **genannt**, die Installation bricht **sichtbar** ab.

## Der Kennwort-Konflikt — der Fehler, den der Installer selbst erzeugt hatte

Der erste Entwurf erzeugte **immer** neue Geheimnisse. Gemessen:

```
$ docker inspect pmh-postgres … POSTGRES_PASSWORD  →  bitte-aendern-admin
$ .env  (vom Installer erzeugt) POSTGRES_SUPERUSER_PASSWORD → 57OqNHhO…
$ bun scripts/migrate.mjs
  FEHLER bei den Migrationen: password authentication failed for user "pmh_owner"
```

**Warum das kein Ausnahmefall ist.** PostgreSQL legt Rollen und Kennwörter beim
**ersten** Start eines leeren Datenverzeichnisses an
(`docker/postgres-init/02-roles.sh`). Ein späterer `docker compose up` mit anderen
Werten ändert sie **nicht**: der Container wird neu erzeugt, das Volume bleibt,
die Kennwörter bleiben. Wer den Stapel einmal gestartet hat — und das tut jeder —,
hat einen Bestand, den eine neue `.env` **nicht** erreicht.

**Die Regel, die jetzt gilt:** ein Installer, der einen bestehenden Bestand
vorfindet, **fragt ihn** — statt ihn zu überschreiben. Gemessen:

```
[3/7] Konfiguration einrichten (.env)
  Ein laufender Container wurde gefunden — seine Kennwörter gelten.
  .env angelegt: 9 Werte gesetzt.
  4 Kennwort(e) aus dem LAUFENDEN Container übernommen —
  ein neues Kennwort hätte den Zugang zur bestehenden Datenbank zerstört.
  1 Geheimnis(se) neu erzeugt.
```

Passt eine **vorhandene** `.env` nicht zum Container, bricht der Installer mit
**beiden** Auswegen ab — übernehmen (kein Datenverlust) oder
`docker compose down -v` (Datenverlust) — statt zu raten.

## Die eigene Messung, die falsch war

`.env.example` ist versioniert. Beim Schreiben der Prüfungen fiel auf:
`PMH_MASTER_KEY` steht **nur** dort und **nie** in `docker-compose.yml`.

```
$ Select-String -Path docker-compose.yml -Pattern PMH_MASTER_KEY  → kein Treffer
```

Der Grund ist ein Befund der Aufsicht (**B14**): die Umschlagverschlüsselung
existiert als **Schema** (`value_cipher`, `wrapped_key` in der Migration), aber
**nicht als Code** — es gibt keine Stelle, die den Schlüssel liest. Er wird
erzeugt, damit eine spätere Fassung ihn vorfindet, und **nicht** vom Stapel
gebraucht. Die Ausnahme steht **namentlich** in der Prüfung, und eine zweite
Prüfung hält die Liste kurz: **nur ein** Geheimnis darf im Stapel fehlen.

## Die vier eigenen Fehler, jeder von einer Prüfung oder Messung gefunden

### 1. `=(.*)$` scheitert an `\r` — **zweimal**, an zwei Stellen

**Der Fehler.** `setzeWerte` schrieb im frischen Klon **0 Werte**, obwohl alle
Namen dastanden:

```
[3/7] .env angelegt: 0 Werte gesetzt.
[5/7] FEHLER: MIGRATION_DATABASE_URL ist nicht gesetzt.
```

**Die Ursache ist eine Eigenheit von JavaScript:** `.` matcht **kein** `\r`. Die
Zeile lautete roh `"POSTGRES_SUPERUSER_PASSWORD=bitte-aendern-admin\r"` — und
`=(.*)$` scheiterte daran.

**Warum keine Prüfung das fand:** alle Eingaben waren im Speicher gebaut, mit
`\n`. Die Wirklichkeit auf einem Windows-Rechner mit `core.autocrlf=true` ist
`\r\n`. **Die Prüfungen waren grün und die Installation kaputt.**

**Und dann derselbe Fehler noch einmal.** Ich korrigierte `setzeWerte` — und
**übersah** `leseEnv`, das dasselbe Muster benutzte:

```
[diag] Anzahl Werte=51
[diag] MIGRATION_DATABASE_URL=undefined
```

**Die Lehre:** wer einen Fehler an einer Stelle findet, muß nach **allen** Stellen
desselben Musters suchen. Die Suche ergab **fünf**:

| Stelle | Wirkung |
|---|---|
| `install-teile.mjs` `setzeWerte` | 0 Werte geschrieben |
| `install.mjs` `leseEnv` | Wert verschluckt → „nicht gesetzt" |
| `install.mjs` **README-Befehl** | **hätte jedem Benutzer** jede Variable mit `\r` angehängt |
| `install.mjs` `containerUmgebung` | war robust (`trim()`) |
| Prüfdatei, zwei Helfer | Prüfungen rot, obwohl der Code richtig war |

Der README-Befehl war der **gefährlichste** — er stand in der Anleitung für den
Benutzer selbst. Jetzt: `([^\r\n]*)`.

### 2. `.gitattributes` fehlte — die Blobs lagen als CRLF im Repository

`core.autocrlf = true` und **keine** `.gitattributes`. Auf Linux hätte
`./scripts/install.sh` gemeldet:

```
/bin/sh^M: bad interpreter: No such file or directory
```

**Jede Linux-Installation wäre gescheitert**, mit einer Meldung, die nach einem
fehlenden Paket aussieht. Jetzt: **LF** für alles, was ein Skript ist, **CRLF**
für `.cmd`/`.ps1` (`cmd.exe` springt bei LF an Marken falsch).

Nachgemessen an den **Rohbytes** der Blobs und der ausgecheckten Dateien:

| Datei | Bytes | Ergebnis |
|---|---|---|
| `install.sh` | CR=0, LF=216 | **LF** |
| `install.cmd` | CR=91, LF=91 | **CRLF** |
| `install.ps1` | CR=110, LF=110 | **CRLF** |

### 3. Die Prüfung verdoppelte die Wirklichkeit

Im Klon waren **zwei eigene** Prüfungen rot — die, die die **echte**
`.env.example` benutzen. Die Umformung lautete
`VORLAGE.split('\n').join('\r\n')`. Auf diesem Rechner hat die ausgecheckte Datei
**schon** CRLF — daraus wurde `\r\r\n`:

```
CRLF doppelt: true
--- Original ---       ersetzt: 1     ← die Funktion arbeitet richtig
--- CRLF-Fassung ---   ersetzt: 0     ← meine Umformung ist falsch
```

Eine Prüfung, die die Wirklichkeit verdoppelt, prüft nicht die Wirklichkeit.

### 4. Der Treiber-Import — **die Ursache ist nicht gefunden**

Im sauberen Klon scheiterte der Import des Datenbanktreibers **reproduzierbar**:

```
FEHLER: der Datenbanktreiber `postgres` ist nicht ladbar.
  Arbeitsverzeichnis: C:\Users\Chang\pmh-ende
  Dieses Modul:       file:///C:/Users/Chang/pmh-ende/scripts/migrate.mjs
  node_modules da:    true
  postgres da:        true
  Grund:  Cannot find package 'postgres' imported from …migrate.mjs
```

**Und dieselbe Datei lief im selben Verzeichnis direkt durch:**

```
$ bun scripts/migrate.mjs
Schema ist aktuell (Fassung 2). Nichts zu tun.
```

**Was gemessen und damit ausgeschlossen wurde:**

| Messung | Ergebnis |
|---|---|
| direkt, über `cmd /c`, über cmd → PowerShell → bun | **funktioniert** |
| statisch / dynamisch / in einer Funktion (Sonde) | **alle drei funktionieren** |
| `import('postgres')` aus `install.mjs` heraus | **funktioniert** |
| `import.meta.resolve('postgres')` | löst korrekt auf |
| `bun install`, dann sofort importieren (Wettlauf) | funktioniert — **widerlegt** |
| `node_modules` über dem Projektverzeichnis | **keines** |
| mehrere `migrate.mjs` | **nur eine** |

**Die Ursache ist NICHT gefunden.** Statt sie zu vermuten, wird der Weg
gewechselt: die Migration läuft als **eigener Prozeß** — genau der Aufruf, der in
**jedem** gemessenen Fall funktioniert hat. Das ist zusätzlich besser: ein eigener
Prozeß kann den Installer nicht mit einem offenen Datenbankzeiger zurücklassen.

**Die Diagnose bleibt im Code.** Kommt der Fehler wieder, nennt die Meldung
Arbeitsverzeichnis, Modulherkunft, Zustand von `node_modules` und den Grund.

## Nachweise

| Nachweis | Befehl | Ergebnis |
|---|---|---|
| Frischer Klon, Windows | `scripts\install.cmd` | **exit 0**, 7/7 Schritte |
| Tests im installierten Klon | `bun test packages scripts apps` | **826 pass · 0 fail** (2 skip: Rust-Binary fehlt) |
| Tests im Hauptprojekt | ebenso | **826 pass · 0 fail** |
| Typecheck | `bun run typecheck` | **18 Pakete, 0 rot** |
| Skript-Prüfungen | `bun test scripts/tests/` | **115 pass · 0 fail** |
| Syntax der Hüllen | `sh -n` · `dash -n` · `bash -n` | **alle OK** |
| Prüfungen in beiden Zeilenenden | LF-Checkout und CRLF-Checkout | **115 pass** · **115 pass** |
| Linux-Hülle auf WSL2 | `sh scripts/install.sh --ohne-stapel` | erkennt WSL2, Docker-Lage, `/mnt/` |

## Nachtrag: eine Aussage in der eigenen README war falsch

**Gefunden beim Lesen der Befunde der Aufsicht (B16)**, dann selbst nachgemessen.

Die README führte bis hierher die Zeile:

> **API des Cores** | **ausgefallen.** `/api/*` → **401/404**, WS `/api/remote.mux`
> → **1008 Policy Violation**. Ursache: der `typert`-Stapel registriert sich nicht.

**Das war nicht belegt.** Die Sonde hatte **geratene** Pfade geprüft. Der Gateway
registriert aber **eine** Route `/api` und ruft sie als
`POST /api/<namespace>/<methode>` — ein beliebiger Pfad liefert deshalb **404,
auch wenn alles läuft**. Und die 401 kam von der **Anmeldesperre**, die vor jeder
Weiterleitung greift.

**Nachgemessen mit Anmeldung** (Cookie aus der Token-Weiterleitung):

| Prüfung | Ergebnis |
|---|---|
| `POST /api/goals/create` mit Cookie | **`{"type":"server-response","rpcId":"invalid-request","result":{"ok":false,"error":{"code":"gateway/bad-request","message":"invalid …`** |
| `POST /api/status` mit Cookie | **404** `not found` |
| `WS /api/remote.mux` mit Cookie | **`HTTP/1.1 101 Switching Protocols`** |

**Der Gateway lebt.** Der JSON-RPC-Rahmen ist das Unterscheidungsmerkmal: „tot"
wäre eine 404 **ohne** Rahmen, „lebt" ist eine Antwort **mit** Rahmen — und der
`gateway/bad-request` ist die richtige Antwort auf eine leere Anfrage.

**Was daraus folgt.** Die Entscheidung „eigener Endpunktweg, **weil die Vorlage
keine erreichbare API hat**" steht auf einem Satz, der so nicht gilt. Der eigene
Endpunktweg bleibt richtig — aber aus dem **anderen** Grund: die API der Vorlage
ist ein RPC-Kanal (`POST /api/<namespace>/<methode>`), kein Weg für einfache
HTTP-Endpunkte wie `GET /api/health`. Zwei verschiedene Dinge, zwei Begründungen
— und die alte war falsch.

Die README-Zeile ist korrigiert. Der frühere Befund in
`docs/review/api-flaeche.md` bleibt stehen und trägt jetzt einen Vermerk — eine
Momentaufnahme wird nicht rückwirkend geändert, sondern durch eine neuere ergänzt.

## Was hier **nicht** belegt ist — ehrlich

1. **Der Treiber-Import-Fehler ist nicht erklärt.** Er ist reproduzierbar
   aufgetreten und durch den Wechsel auf einen eigenen Prozeß **umgangen**, nicht
   behoben. Ein Fehler, den man nicht versteht, kann wiederkommen.
2. **Die Linux-Installation ist nicht vollständig durchlaufen.** In WSL2 ist
   Docker nicht erreichbar, und ein Klon **im** Linux-Dateisystem scheiterte an
   den fehlenden Git-Anmeldedaten für das private Repository. Gemessen ist nur
   der Weg über `/mnt/c` **bis** zur Werkzeugprüfung. `install.sh` ist in `sh`,
   `dash` und `bash` syntaktisch geprüft — aber **nicht** bis Schritt 7 gelaufen.
3. **`bun install` auf einem echten Linux ist nicht gemessen.** Gemessen ist es
   auf Windows (524 Pakete, 54 s) und über `/mnt/c` in WSL.
4. **Der frische Klon setzt einen bestehenden Container voraus.** Auf diesem
   Rechner lief `pmh-postgres` schon, und der Installer hat dessen Kennwörter
   übernommen. Der Weg „**gar kein** Container, alles neu" ist damit **nicht**
   gemessen — dort würden neue Geheimnisse erzeugt und der Stapel legt die Rollen
   beim ersten Start selbst an.
5. **Kein macOS.** Gemessen sind Windows nativ und WSL2.
6. **`docker` wird nicht installiert.** Auf Windows nicht (Lizenz), auf Linux
   nicht (root). Wer Docker nicht hat, kommt bis Schritt 1 und sieht die Anleitung.
