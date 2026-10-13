---
description: "Prometheus Harness — eine Agent-Harness auf Bun mit Cordis-Units, einer steckbaren LLM-Naht und eigenen HTTP-Endpunkten, gebaut auf dem DeepSeek-Harness-Kern."
kind: "project"
---

# Prometheus Harness

[English](README.md) | Deutsch

Eine selbst betriebene Agent-Harness, die auf dem Kern des DeepSeek Harness
aufbaut. Der Kern wird **benutzt und angepasst** — er ist die Codebasis, nicht
bloß eine Vorlage. Was wir hinzufügen, liegt in `packages/`, `services/` und
`native/`; was der Kern liefert, wird nie umgeschrieben, sondern nur komponiert.

## Zusammenfassung

Repository klonen, ein Befehl — `scripts\install.cmd` unter Windows,
`./scripts/install.sh` unter Linux und macOS. Der Installer installiert Bun und
die Basispakete, die es braucht, erzeugt `.env` mit frischen Geheimnissen
(übernimmt bei einem bereits laufenden Stapel dessen Kennwörter), startet
PostgreSQL 17 und Redis 7, wartet auf deren Gesundheitsprüfungen, führt die
Datenbankmigrationen aus und typisiert jedes Paket. `bun run start` liefert
danach die Weboberfläche und gibt eine angemeldete Adresse aus; diese Adresse
trägt ein Starttoken, und ohne dieses antwortet die Oberfläche mit **401**.
Sechzehn Pakete machen unseren eigenen Code aus — eine anbieterunabhängige
LLM-Naht mit DeepSeek-Adapter, Wiederholung und Tokenzählung, ein Agent-Loop mit
Werkzeugregister, ein Sitzungsformat mit JSONL-Persistenz, Bausteine für die
Anmeldung und die ersten eigenen HTTP-Endpunkte. **826 Prüfungen laufen durch und
18 Pakete typisieren fehlerfrei.** Die kleinste Kette — Adapter → Agent-Loop →
Sitzung — ist gebaut und gemessen, aber über **keine** Schnittstelle erreichbar;
das ist der nächste Schritt, und die Abschnitte unten sagen genau, wo diese
Grenze liegt.

## Inhaltsverzeichnis

- [Dieses Projekt benutzen](#use-this-project)
- [Aufbau](#architecture)
- [Endpunkte](#endpoints)
- [Weiterlesen](#further-exploration)
- [Was das Modell sieht](#model-experience)
- [Bekannte Grenzen und offene Arbeit](#known-limitations-and-deferred-work)
- [Hinweis für Betreuer](#dev-note)

-----

<a id="use-this-project"></a>
## Dieses Projekt benutzen

### Installieren

**Windows** — aus der Eingabeaufforderung, aus PowerShell oder per Doppelklick:

```bat
git clone https://github.com/LangLi7/prometheus-harness.git
cd prometheus-harness
scripts\install.cmd
```

**Linux und macOS:**

```sh
git clone https://github.com/LangLi7/prometheus-harness.git
cd prometheus-harness
./scripts/install.sh
```

Der Installer meldet sieben Schritte und endet mit dem Befehl zum Starten. Ohne
Datenbank läuft er mit `--ohne-stapel`; die vierzehn PostgreSQL-Prüfungen werden
dann **übersprungen und sagen das**, statt ohne Datenbank grün zu erscheinen.

Sie wissen, daß es funktioniert hat, wenn `bun run start` eine Adresse mit Token
ausgibt und diese Adresse die Oberfläche im Browser lädt. Zwei Fehlschläge sind
es wert, erkannt zu werden: ein Kennwortkonflikt zwischen `.env` und einem
**laufenden** PostgreSQL-Container, den der Installer mit **beiden** Auswegen
nennt; und ein fehlender oder nicht erreichbarer Docker-Dienst, für den der
Installer den passenden Befehl der Plattform ausgibt.

### Warum es drei Einstiegsskripte gibt

| Datei | Wofür | Voraussetzung |
|---|---|---|
| `scripts/install.cmd` | Windows, immer | keine |
| `scripts/install.ps1` | Windows, aus PowerShell | Richtlinie erlaubt Skripte |
| `scripts/install.sh` | Linux, macOS | `sh` |

Die Ausführungsrichtlinie eines gewöhnlichen Windows-Rechners steht auf
`Restricted`, deshalb **lädt** eine `.ps1` nicht:

```
& : Die Datei …\install.ps1 kann nicht geladen werden, weil das Ausführen
    von Skripten auf diesem System deaktiviert ist.
```

Eine `.cmd`-Datei ist von dieser Richtlinie nicht betroffen — deshalb ist sie der
Einstieg, den die Anleitung nennt. Sie ruft `install.ps1` mit
`-ExecutionPolicy Bypass` für **diesen einen** Aufruf und ändert nichts an der
Einstellung des Rechners.

Die Logik selbst ist **eine** Datei, `scripts/install.mjs`, geschrieben für Bun.
Eine Umsetzung in der Shell hätte auf den Zielrechnern keinen Interpreter: `sh`
fehlt unter Windows, `bash` kommt nur über WSL und kann `C:\`-Pfade nicht lesen,
`unzip` fehlt. In einem frischen Alpine-Container fehlt sogar `bash`.

### Was der Installer nicht installiert

Docker. Unter Windows ist der unterstützte Weg Docker Desktop — ein Programm mit
eigener Lizenz —, und unter Linux braucht das offizielle Skript root. Der
Installer gibt den Befehl für die jeweilige Plattform aus und hält sichtbar an,
statt für Sie zu entscheiden.

### Starten

```sh
bun run start
```

Der Port ist **3080** — derselbe, den die Referenz-Harness benutzt. Ist er
belegt, bindet der Starter den nächsten freien Port und nennt ihn;
`--strict-port` bricht stattdessen ab, `--port <n>` verschiebt den Startpunkt,
`PMH_PORT` setzt ihn aus der Umgebung.

### Die Adresse trägt ein Token

Die Oberfläche antwortet **ohne Token mit 401**. Der Start gibt deshalb die
benutzbare Adresse aus, mit Token:

```
[pmh] Anmeldung nötig — diese Adresse öffnen (enthält den Token):
[pmh]   http://127.0.0.1:3081/?token=TWyrTSWfD3BBmIGzLgc5Hjm2klR5eSFqaw1D0wzdhz8
```

| Aufruf | Antwort |
|---|---|
| mit dem Token aus der Ausgabe | **200**, 35.664 Bytes |
| ohne Token | **401** |
| mit falschem 43-Zeichen-Token | **401** |

Die Adresse **ist** das Geheimnis. Behandeln Sie eine kopierte Adresse wie ein
Kennwort; der Starter schreibt sie nur auf die Konsole — nie in eine Datei, nie
in die Umgebung.

### Datenbankadressen

Die Anwendung liest `DATABASE_URL` und `REDIS_URL` aus der Umgebung, der
Migrationslauf liest `MIGRATION_DATABASE_URL`. Alle drei schreibt der Installer in
`.env`; sie zu laden ist Sache der Shell:

```sh
# Linux
set -a; . ./.env; set +a; bun run start
```

```powershell
# Windows
Get-Content .env | ForEach-Object { if ($_ -match "^(\w+)=([^\r\n]*)") { Set-Item "env:$($matches[1])" $matches[2] } }
bun run start
```

Die drei Adressen haben bewußt verschiedene Rollen: `pmh_app` liest und schreibt
Daten, `pmh_owner` darf die Struktur ändern und wird nur von den Migrationen
benutzt, und keine von beiden ist der Superuser.

### Prüfen

```sh
bun run typecheck                 # 18 Pakete, ~2 s, es wird nichts geschrieben
bun test packages scripts apps    # 826 Prüfungen, 27 Dateien
```

Bun führt TypeScript direkt aus, es gibt also keinen Bauschritt. `bun run build`
ist ein anderer Name für den Typecheck — der Schritt, den ein vertrauter Ablauf
an dieser Stelle erwartet.

Vierzehn dieser Prüfungen arbeiten gegen eine **echte** PostgreSQL. Sie werden
übersprungen, wenn `PMH_TEST_DATABASE_URL` fehlt oder nicht erreichbar ist, und
der Lauf nennt den Grund — statt einen grünen Haken zu zeigen, der nichts geprüft
hat.

-----

<a id="architecture"></a>
## Aufbau

Fünf Regeln bestimmen jede Entscheidung hier. Sie stehen zuerst, weil der Rest
des Repositories ihre Folge ist.

1. **Der Kern bleibt unangetastet.** Eine nötige Änderung wird eine Unit, nie
   eine Änderung in einer fremden Datei.
2. **Keine Unit importiert Interna des Kerns** — nur öffentliche Steckplätze wie
   `ctx.*` und Dienstschnittstellen. So kostet ein Kern-Sprung keine Unit-Arbeit.
3. **Dienste starten mit der Harness, und ein fehlgeschlagener Start ist ein
   sichtbarer Fehler.**
4. **Sprachgrenzen sind Prozeßgrenzen.** Jede andere Sprache läuft als Prozeß
   hinter einer definierten Schnittstelle.
5. **Abgehakt wird nur Belegtes.** Jede Zahl in diesem Repository nennt den
   Befehl, mit dem sie gemessen wurde; was nicht geprüft werden konnte, steht als
   ausdrückliche Lücke da.

### Aufteilung

```
apps/cli            der Host: lädt das Profil, komponiert den Cordis-Baum, liefert die Oberfläche
apps/web            die Oberfläche (aus der Vorlage) — Grundlage für unsere eigene
packages/api        health (Endpunkte + Sondenregister) · readiness (Sonden für PostgreSQL, Redis)
packages/llm        die LLM-Naht · llm-deepseek · llm-retry · token-meter
packages/core       agent-tools · agent-loop · scope
packages/agent      session-format · session-persistence-jsonl
packages/auth       auth (Argon2id, Sitzungen, CSRF) · db-schema (SQL-Migrationen)
packages/units      unit-export (Plugin-Export mit belegtem Rundlauf)
packages/util       atomic-write · home-paths
services/           pmh-attach · pmh-nix · pmh-supervisor (Go) · pmh-sandbox (Rust)
native/             6 Rust-Crates (Sperren, PTY, atomares Schreiben, Landlock) — derzeit ungenutzt
docker/             Stapel-Einrichtung: Erweiterungen, Rollen, Rechte
scripts/            Start · Portwahl · Anmeldeadresse · Profil-Verdrahtung · Installer · Prüfungen
docs/               Konzept, Entscheidungen, Nachweise, Recherche
```

### Die Kette

Der kleinste vollständige Weg führt von einer Anfrage zu einer gespeicherten
Sitzung:

```
LLM-Naht → DeepSeek-Adapter → Wiederholung → Tokenzähler
    ↓
Agent-Loop → Werkzeugregister → Sitzungsformat → JSONL-Persistenz → Wiederaufnahme
```

Jedes Glied ist ein Paket mit eigenen Prüfungen, und die ganze Kette hat **einen**
durchgehenden Test. Was ihr noch fehlt, ist eine Aufrufstelle in einer laufenden
Anwendung — siehe [Bekannte Grenzen](#known-limitations-and-deferred-work).

### Größe des Repositories

| | dieses Projekt | Referenz (Upstream-Fork) |
|---|---:|---:|
| Quellcode (`packages/`, `services/`, `native/`, `apps/cli/src`) | **120 Dateien · 1,5 MB** | 5.205 Dateien · 49 MB |
| Applikationspakete | **16** | 245 |

Unser Quellcode ist rund **43-mal kleiner** als der Anwendungscode der Referenz.
Das ist ein Fortschrittsmaß, kein Größenmaß; die Zerlegung steht in
[groessenvergleich-zur-referenz.md](docs/review/groessenvergleich-zur-referenz.md).

-----

<a id="endpoints"></a>
## Endpunkte

Unsere eigene HTTP-Fläche ist bewußt klein: zwei **lesende** Endpunkte. Der Kern
liefert eine wesentlich größere, und sie ist **kein** REST.

| Endpunkt | Methode | Anmeldung | Zweck |
|---|---|---|---|
| `/api/health` | GET, HEAD | keine | meldet, daß der Prozeß Routen bedient |
| `/api/ready` | GET, HEAD | Sitzungscookie | fragt die eingetragenen Sonden ab |

```sh
curl -s http://127.0.0.1:3081/api/health
# {"status":"ok","service":"@prometheus-harness/health","version":"0.3.0",…}

curl -s -b cookies.txt http://127.0.0.1:3081/api/ready
# {"bereit":true,"zustand":"ok",
#  "sonden":[{"name":"postgres","zustand":"ok","dauerMs":35},
#            {"name":"redis","zustand":"ok","dauerMs":6}]}
```

`/api/health` bleibt mit Absicht offen: eine Erreichbarkeitsprüfung, die eine
Anmeldung verlangt, kann nicht melden, daß die **Anmeldung** kaputt ist.
`/api/ready` ist geschützt und sagt mehr. Die beiden unterscheiden sich in genau
einer Lage, und sie ist meßbar:

| | `/api/ready` | `/api/health` |
|---|---|---|
| alles gesund | 200 `ok` | 200 `ok` |
| keine Sonde eingetragen | **503** `ungeprueft` | 200 |
| Redis nicht erreichbar | **503** `eingeschraenkt` | 200 |

Die Sonden stehen in `packages/api/readiness`, nicht in `health`. `health` bietet
den Vertrag `ctx.readyness.register(sonde)`; PostgreSQL und Redis werden darüber
eingetragen, und `health` erfährt nie, **was** es prüft. Ein Bereitschaftsendpunkt,
der selbst an dem hängt, worüber er Auskunft gibt, fiele mit ihm aus.

`/api/ready` ruft die **vorhandene** Prüfung des Kerns auf —
`ctx.connection.requestRejection` — statt eine zweite Meinung darüber zu bauen,
was eine gültige Sitzung ist. Eine registrierte Route geht am Auffang-Platz und
damit an der Anmeldesperre vorbei; jeder weitere Endpunkt braucht diese Sperre
deshalb ausdrücklich.

### Die Schnittstelle des Kerns, zum Vergleich

Der Kern spricht **Typert Remote** über zwei Träger. Ein `client-request`-Umschlag
geht an `POST /api/<namespace>/<methode>`; logische Ströme laufen über den
WebSocket unter `/api/remote.mux`. Beides wurde an einem laufenden Host gemessen:

```jsonc
// POST /api/goals/create, angemeldet
{type:'client-request', rpcId, method, payload}
  → {"type":"server-response","rpcId":"invalid-request",
     "result":{"ok":false,"error":{"code":"gateway/bad-request",…}}}

// WS /api/remote.mux
{type:'open', streamId, endpoint:'session/getState', payload:{args:{}}}
  → {"type":"error","error":{"code":"gateway/invocation-unavailable",
     "message":"typert gateway: session/getState: no active Remote method exports this endpoint"}}
```

**Acht** Controller lädt der Kern: Sitzung, Hintergrundauftrag, Terminal,
Arbeitsbereichsdateien, Konto, Einstellungen, Arbeitsbereich und entfernte
Werkzeuge. Werkzeuge wie Dateizugriff, Shell, Aufträge und Websuche sind ein
**dritter** Mechanismus: Funktionsaufrufe des Modells, überhaupt keine
HTTP-Fläche. Die vollständige Bestandsaufnahme, samt dem, was in dieser
Komposition fehlt, steht in
[schnittstellen-bestand.md](docs/review/schnittstellen-bestand.md).

-----

<a id="further-exploration"></a>
## Weiterlesen

- [docs/INDEX.md](docs/INDEX.md) — der Katalog: jedes Dokument mit einem Satz.
- [docs/concept.md](docs/concept.md) — das Unit-Modell und die vier Regeln.
- [docs/decisions/](docs/decisions/) — getroffene und offene Entscheidungen.
- [docs/review/](docs/review/) — Befunde: Schnittstellen, Rust-Bestand, Größenvergleich.
- [docs/status/](docs/status/) — Nachweise mit Befehl und Ergebnis, Register, Push-Audit.
- [docs/research/](docs/research/) — Recherche: Anmeldestandards, Sprachwahl.
- [docs/status/beleg-installation.md](docs/status/beleg-installation.md) — der Nachweis der Installation, mit den eigenen Lücken.
- [docs/status/beleg-eigener-endpunkt.md](docs/status/beleg-eigener-endpunkt.md) — wie der eigene Endpunktweg entstand, und die sechs Fehler auf dem Weg.

-----

<a id="model-experience"></a>
## Was das Modell sieht

### Kontext der Weboberfläche

Der Kern registriert einen Abschnitt `app:web-surface`, der das Modell auf die
Oberfläche ausrichtet: die angekündigte Adresse, worauf sich „diese Seite"
bezieht, und die Regel, daß ein Ersatzserver die laufende Oberfläche nicht
aktualisiert. `DSH_WEB_URL` wird für Shell-Befehle aus demselben Grund
bereitgestellt.

### Bereitschaft

`GET /api/ready` ist das maschinenlesbare Signal. Ein Aufseher liest den
Statuscode — **503** heißt „nicht bereit", und der Körper nennt, welche Sonde
gescheitert ist und warum. Sondenergebnisse werden fünf Sekunden
wiederverwendet, und gleichzeitige Aufrufer teilen sich **einen** Durchlauf; ein
häufig abfragender Aufseher vervielfacht die Datenbanklast damit nicht.

-----

<a id="known-limitations-and-deferred-work"></a>
## Bekannte Grenzen und offene Arbeit

Das sind gegenwärtige Einschränkungen — gemessen und benannt, nicht geschätzt.

- **Die Kette ist nicht erreichbar.** Adapter, Agent-Loop und Sitzung sind gebaut
  und durch über 300 Prüfungen belegt; **keine** Schnittstelle bietet sie an. Eine
  Sitzung gehört auf den RPC-Kanal des Kerns, wo Ströme, Abbruch und Fristen schon
  existieren — nicht auf einen selbstgebauten HTTP-Endpunkt.
- **Unsere eigene Endpunktfläche sind zwei lesende Endpunkte.** Nichts nimmt eine
  Eingabe an, startet Arbeit oder spricht mit einem Modell.
- **Die Persistenzschicht hat kein Produktionspaket.** `db-schema` definiert die
  Schnittstelle des Migrationsziels, den Treiber schließt der Aufrufer an. Ein
  Paket `session-persistence-postgres` gibt es nicht; Sitzungen liegen heute als
  JSONL-Dateien.
- **Das Sitzungsformat steht auf v1.** Format v4 der Vorlage und seine vier
  Migrationen sind nicht umgesetzt.
- **Verdichtung fehlt.** `token-meter` zählt Token; es kürzt nicht.
- **Kein Aufruf gegen einen echten Anbieter ist verzeichnet.** Der
  DeepSeek-Adapter wird gegen eine Attrappe geprüft; in dieser Umgebung wurde kein
  Schlüssel benutzt.
- **Umschlagverschlüsselung gibt es als Schema, nicht als Code.** Die Spalten
  `value_cipher`/`wrapped_key` und `PMH_MASTER_KEY` existieren; kein Code liest
  den Schlüssel.
- **Der Rust-Bestand ist ungenutzt.** 6.569 Zeilen in sechs Crates, und nichts
  ruft sie auf; kein Skript baut sie.
- **Zwei alte Lücken bei den Diensten.** `pmh-supervisor` hat zwei rote
  Prüfungen, auch auf `HEAD`, und `pmh-nix`/`pmh-attach` tragen nicht
  eingecheckte Arbeit aus einer anderen Sitzung, die dieser Strang nicht pusht.
- **Der Linux-Weg der Installation ist teilweise gemessen.** `install.sh` ist in
  `sh`, `dash` und `bash` syntaktisch geprüft, und seine WSL2-Erkennung wurde
  nachgemessen; die vollen sieben Schritte sind auf einem Linux-Dateisystem
  **nicht** gelaufen, weil Docker in WSL nicht erreichbar ist und ein Klon des
  privaten Repositories dort keine Anmeldedaten hat.
- **Ein Defekt ist umgangen, nicht behoben.** Der Import des Datenbanktreibers
  scheiterte im Installer in einem sauberen Klon reproduzierbar, während dieselbe
  Datei im selben Verzeichnis direkt durchlief; die Migration läuft jetzt als
  eigener Prozeß, was in **jedem** gemessenen Fall funktioniert. Die Diagnose
  bleibt im Code. Verzeichnet in
  [beleg-installation.md](docs/status/beleg-installation.md).

<a id="dev-note"></a>
### Hinweis für Betreuer

<details>
<summary>Arbeitskontext für Betreuer — zum Ausklappen</summary>

Die Referenz-Harness liegt unter `C:\Users\Chang\deepseek-harness` und wird
**nicht** verändert; Befunde dort werden gemeldet, nicht bearbeitet. Ihre
installierten Pakete werden über `node_modules/@deepseek-ai/` auf ihre
Schnittstellen hin gelesen.

Pushes folgen einem Vier-Stunden-Takt, und jeder wird in
[docs/status/git-audit.md](docs/status/git-audit.md) mit der Übereinstimmung von
lokalem `HEAD` und `origin/main` verzeichnet.

</details>

## Lizenz

Der DeepSeek Harness dient als **Codebasis**; damit greift seine **MIT-Lizenz**.
Der Copyright-Vermerk liegt in [LICENSE](LICENSE) — die Bedingung der Lizenz
verlangt ihn.
