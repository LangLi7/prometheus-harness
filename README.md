# Prometheus Harness

Eine eigene Agent-Harness auf Basis des **DeepSeek Harness**. Der Core wird **benutzt
und angepasst** — er ist die Codebasis, nicht nur eine Vorlage. Alles, was wir darüber
bauen, sind **Units** (Plugins und Skills), die sich an- und abstecken lassen.

**Sprachen:** TypeScript auf **Bun** (Kern und Host) · **Go** (Dienste) · **Rust**
(systemnahe Kleinprogramme) · **kein Python**.

> **Dieses Verzeichnis ist die Harness selbst** — Code, Schema, Stack und Nachweise.
> Der unveränderte Upstream liegt unter `C:\Users\Chang\deepseek-harness` (Werkzeug und
> Core-Referenz), der Referenz-Fork unter `C:\Users\Chang\harness\prometheus-harness`
> (Core `d743267388` = DeepSeek Harness `0.2.1-alpha.2`, Branch `pmh`).

## In einem Satz

Ein Agent-Kern in TypeScript auf Bun, dessen Fähigkeiten als **Units** steckbar sind —
alles andere (Sandbox, Werkzeuge, Dienste, Datenbanken) liegt als **eigener Prozess**
dahinter, nicht im Core.

## Installieren

**Windows** (Eingabeaufforderung, PowerShell oder Doppelklick):

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

Der Installer prüft und **installiert**, was fehlt (Bun, und auf Linux die
Basispakete `curl`/`git`), legt `.env` mit erzeugten Geheimnissen an, startet
PostgreSQL und Redis, wartet auf deren Gesundheit, führt die Migrationen aus und
prüft den Typecheck. Danach:

```bash
bun run start
```

**Kein pnpm, kein Build-Schritt.** Bun führt TypeScript direkt aus; „bauen" heißt
hier `bun run typecheck` (gemessen: **18 Pakete, 1,8 s**).

### Warum es drei Einstiege gibt

| Datei | Wofür | Vorbedingung |
|---|---|---|
| `scripts/install.cmd` | **Windows, immer** | keine |
| `scripts/install.ps1` | Windows, aus PowerShell | Ausführungsrichtlinie erlaubt Skripte |
| `scripts/install.sh` | Linux, macOS | `sh` (überall vorhanden) |

Auf einem Windows-Rechner mit `CurrentUser = Restricted` **lädt** eine `.ps1`
nicht:

```
& : Die Datei …\install.ps1 kann nicht geladen werden, weil das Ausführen
    von Skripten auf diesem System deaktiviert ist.
```

Deshalb ist `.cmd` der Einstieg, den die Anleitung nennt: **es ist von der
Richtlinie nicht betroffen**. Es ruft `install.ps1` mit
`-ExecutionPolicy Bypass` — nur für diesen Aufruf, ohne die Einstellung des
Rechners zu ändern.

**Die Logik steht in `scripts/install.mjs` — einmal.** Die drei Dateien sind
dünne Hüllen. Eine zweite Fassung in `sh` wäre eine zweite Wahrheit, die
auseinandergeht.

### Was der Installer **nicht** automatisch installiert

**Docker** auf Windows: der offizielle Weg ist Docker Desktop — ein Programm mit
Oberfläche und eigener Lizenz. Es still zu installieren wäre eine Entscheidung
über die Lizenz des Benutzers. Der Installer nennt den Befehl und bricht sichtbar
ab. Auf Linux nennt er `curl -fsSL https://get.docker.com | sudo sh`, führt es
aber nicht aus: das braucht root.

### Unter WSL2

`docker` ist dort **im PATH** und der Dienst trotzdem **nicht erreichbar**
(gemessen am 13.10.2026). Der Installer erkennt das und sagt, was zu tun ist:
Docker Desktop starten, dann *Settings → Resources → WSL Integration* für diese
Distribution einschalten — oder den Windows-Einstieg `scripts\install.cmd`
benutzen.

### Wenn der Stapel schon läuft

PostgreSQL legt Rollen und Kennwörter beim **ersten** Start des
Datenverzeichnisses an. Ein späterer Start mit anderen Werten ändert sie **nicht**.
Der Installer liest deshalb die Kennwörter des **laufenden** Containers und
übernimmt sie in `.env` — neue würden den Zugang zur bestehenden Datenbank
zerstören. Passt eine vorhandene `.env` nicht zum Container, bricht er mit beiden
Auswegen ab (übernehmen oder `docker compose down -v`) statt zu raten.

### Ohne Datenbank aufsetzen

```bash
scripts\install.cmd --ohne-stapel      # Windows
./scripts/install.sh --ohne-stapel     # Linux
```

Für den Typecheck und die Tests ohne Datenbank. Die 14 PostgreSQL-Prüfungen
werden dann **übersprungen** und melden das — nicht bestanden.

### Von Hand, wenn der Installer nicht paßt

```bash
bun install                     # Abhängigkeiten (Bun, nicht pnpm)
docker compose up -d            # PostgreSQL 17 + pgvector, Redis 7
bun scripts/migrate.mjs         # Schema anlegen (Rolle pmh_owner)
bun run start                   # Host starten, Adresse steht am Ende der Ausgabe
```

**Ist `3080` belegt, weicht der Start auf den nächsten freien Port aus und nennt ihn.**
`--strict-port` bricht stattdessen ab, `--port <n>` wählt einen anderen Startpunkt,
`PMH_PORT` setzt ihn über die Umgebung. Methodik:
[startup-port-methodik.md](docs/design/startup-port-methodik.md).

### Die Adresse braucht ein Token

Die Oberfläche antwortet **ohne Token mit 401**. Der Start gibt deshalb die
**benutzbare** Adresse aus — Zeile für Zeile so, wie sie erscheint:

```
[pmh] Oberfläche: http://127.0.0.1:3081/  — ohne Token antwortet sie 401,
[pmh] die benutzbare Adresse folgt unten, sobald der Host sie meldet.
[host] dsh web: http://127.0.0.1:3081/?token=TWyrTSWfD3BBmIGzLgc5Hjm2klR5eSFqaw1D0wzdhz8

[pmh] Anmeldung nötig — diese Adresse öffnen (enthält den Token):
[pmh]   http://127.0.0.1:3081/?token=TWyrTSWfD3BBmIGzLgc5Hjm2klR5eSFqaw1D0wzdhz8
```

Die letzte Zeile ist die, die in den Browser gehört. Nachgemessen am 13.10.2026:

| Aufruf | Antwort |
|---|---|
| **mit** dem Token aus der Ausgabe | **200**, 35.664 Zeichen |
| **ohne** Token | **401** |
| mit **falschem** Token (43 Zeichen) | **401** |

Der Host versucht **nicht**, selbst einen Browser zu öffnen — auf diesem Rechner
scheitert er dabei sichtbar (`could not open the default browser because browser
launcher exited with code null`). Ein Start, der einen Fehler meldet, obwohl alles
läuft, wäre verwirrend; in einem Container gäbe es ohnehin keinen Browser.

**Warum das nicht nur eine Zeile Kopieren ist.** Die Adresse ist ein Geheimnis: sie
gewährt Zugang ohne weitere Anmeldung. Wer sie in ein Protokoll, ein Ticket oder
einen Chat kopiert, gibt den Zugang mit. Der Start schreibt sie deshalb nur auf die
Konsole — nicht in eine Datei, nicht in die Umgebung. Wer sie braucht, holt sie aus
der laufenden Ausgabe.

**Es gibt keinen Build-Schritt.** Bun führt TypeScript direkt aus; `tsgo --noEmit`
prüft und schreibt nichts:

```bash
bun install                     #  0,1 s
bun x tsgo --noEmit -p <paket>  #  2,1 s über 18 Pakete, 0 Fehler
bun run start                   #  1,1 s bis zur Adresse
```

### Prüfen

```bash
bun test packages scripts apps   # 762 grün, 0 rot — 26 Dateien, 11,2 s

# Die 14 PostgreSQL-Prüfungen laufen nur mit einer Testdatenbank.
# Sie brauchen die OWNER-Rolle: Migrationen sind DDL, pmh_app darf das nicht.
PMH_TEST_DATABASE_URL=postgres://pmh_owner:bitte-aendern-owner@127.0.0.1:5432/pmh \
  bun test packages scripts apps
```

**Ohne** diese Variable werden jene Fälle **übersprungen** — nicht bestanden. Ein
Lauf ohne sie meldet `748 pass · 14 skip · 0 fail` und sagt damit ehrlich, was er
nicht geprüft hat.

## Stand

**Phase: der Core läuft — und der erste eigene Endpunkt antwortet.**

Nachgemessen am 13.10.2026:

| Nachweis | Ergebnis |
|---|---|
| **Host startet** | `bun run start` → Adresse mit Token; Aufruf **200**, 35.664 Zeichen; ohne Token **401**, mit falschem Token **401**; Start bis zur Adresse **1,1 s** |
| **Eigener Endpunkt** | `GET /api/health` → **200** (offen) · `GET /api/ready` → **401** ohne Anmeldung, **200** mit Sitzungscookie · `POST` → **405** · genaue Pfade, kein Präfix — [Beleg](docs/status/beleg-eigener-endpunkt.md) |
| **Anmeldung des Cores** | Token-Weiterleitung **303** + Cookie; `GET /` mit Cookie **200**, ohne Cookie **401** — greift |
| **API des Cores** | **lebt — die frühere Zeile hier war falsch.** `POST /api/goals/create` **mit** Anmeldung → **`{"type":"server-response","rpcId":"invalid-request","result":{"ok":false,"error":{"code":"gateway/bad-request"…`** — der JSON-RPC-Rahmen. `WS /api/remote.mux` **mit** Cookie → **`101 Switching Protocols`** |
| **Unser eigener Beitrag** | **zwei lesende Endpunkte** (`/api/health`, `/api/ready`). Die Kette — Adapter, Agent-Loop, Session — ist gebaut und in Tests belegt, aber über **keine** Schnittstelle erreichbar. Was der Core sonst hat und was fehlt: [schnittstellen-bestand.md](docs/review/schnittstellen-bestand.md) |
| **Eigener Kern** | **16 Pakete · 762 Tests grün · 0 rot** (26 Dateien, mit echter PostgreSQL) · **zwei** Pakete davon sind verdrahtet (`health`, `readiness`), die übrigen laufen noch nur in Tests |
| **Datenbank** | PostgreSQL **17.11** + pgvector **0.8.7**, Redis **7.4.9** — als Stack in **einer** Datei; Rechtemodell mit vier Rollen belegt wirksam |
| **Stack** | `bun install` **0,1 s** · `tsgo --noEmit` **18 Pakete / 0 rot** · Start **1,1 s** — kein Build-Schritt |
| **Go-Dienste** | `pmh-nix` 60 Tests · `pmh-attach` 63 Tests · `pmh-supervisor` **2 rot** (auch auf `HEAD`) |
| **Rust** | 6.569 Zeilen in 6 Crates — **nichts ruft sie auf**, kein Skript baut sie — [Beleg](docs/review/rust-bestand.md) |

### Der eigene Endpunktweg

**Was hier steht, ist bewußt klein.** Zwei **lesende** Endpunkte, mehr nicht — und
die Kette (Adapter, Agent-Loop, Session) ist über **keine** Schnittstelle
erreichbar. Der Umfang dieser Lücke und was der Core sonst anbietet, steht in
[schnittstellen-bestand.md](docs/review/schnittstellen-bestand.md).

`packages/api/health` hängt sich über den **offiziellen Dienst** `ctx.webServer`
ein — nicht über eine eigene Serverinstanz. Eine zweite Instanz hätte nicht
gezeigt, was hier gezeigt werden soll, und wäre eine zweite Wahrheit über Adresse
und Anmeldung.

```bash
$ curl -s http://127.0.0.1:3081/api/health
{"status":"ok","service":"@prometheus-harness/health","version":"0.2.0",
 "uptimeMs":17807,"runtime":"bun 1.4.0"}

$ curl -s http://127.0.0.1:3081/api/ready
{"status":"error","error":"unauthenticated"}          # 401 + WWW-Authenticate: Cookie
```

**Zwei Endpunkte, zwei Fragen.** `/api/health` ist **offen** und sagt nur, daß der
Prozeß Routen bedient — eine Erreichbarkeitsprüfung, die eine Anmeldung verlangt,
könnte nicht melden, daß die **Anmeldung** kaputt ist. `/api/ready` ist
**geschützt** und prüft die Abhängigkeiten:

```bash
$ curl -s -b cookies.txt http://127.0.0.1:3081/api/ready
{"bereit":true,"zustand":"ok",
 "sonden":[{"name":"postgres","zustand":"ok","dauerMs":109},
           {"name":"redis","zustand":"ok","dauerMs":4}]}

# Mit absichtlich kaputtem Redis (REDIS_URL=redis://127.0.0.1:6399):
#   /api/ready  -> 503  eingeschraenkt, Grund genannt
#   /api/health -> 200  der Prozeß lebt weiter
```

**Was geprüft wird — und warum nicht nur die Verbindung.** Die PostgreSQL-Sonde
stellt **drei** Fragen: steht die Verbindung, sind die **Migrationen** gelaufen
(Fassung aus `schema_migrations`), sind die Kern-Tabellen da. `select 1` allein
würde auch bei fehlenden Tabellen „bereit" sagen. Die Redis-Sonde schickt ein
`PING` und verlangt `PONG` — „jemand antwortet" ist nicht dasselbe wie „Redis ist
bereit".

**Die Sonden stehen in `packages/api/readiness`, nicht in `health`.** `health`
stellt nur den Vertrag `ctx.readyness.register(sonde)` bereit. Sonst hinge der
Endpunkt, dessen Aufgabe „Zustand melden" ist, selbst an dem Zustand, den er
meldet — und Regel 2 wäre verletzt.

**Damit die Sonden laufen, müssen die Adressen in der Umgebung stehen** — der
Starter setzt sie nicht:

```bash
DATABASE_URL=postgres://pmh_app:…@127.0.0.1:5432/pmh \
REDIS_URL=redis://127.0.0.1:6379 \
bun run start
```

**Ohne diese beiden meldet `/api/ready` `ok` mit leerer Sondenliste** — ehrlich,
aber ohne Abhängigkeitsprüfung. Wer die Antwort liest, sieht es an `sonden: []`.
Alle Werte stehen in [.env.example](.env.example) (siehe `.env.example`).

**Die Sperre ist die des Hosts, keine eigene.** `/api/ready` ruft
`ctx.connection.requestRejection` auf — dieselbe Prüfung, die auch die
Oberfläche schützt (Host-/Origin-Zaun, dann Browsersitzung). Eine zweite Meinung
darüber, was eine gültige Anmeldung ist, ginge irgendwann auseinander; das Cookie
ist mit einem 32-Byte-Geheimnis unterschrieben, und wer das nachbaut, baut es
falsch nach.

| Antwort | Bedeutung |
|---|---|
| **401** `unauthenticated` + `WWW-Authenticate: Cookie` | nicht angemeldet |
| **403** `untrusted_origin` | nicht der Host, für den wir gebaut sind |
| **503** `unavailable` | die Prüfung selbst ist nicht erreichbar — **verweigern statt durchlassen** |
| **503** `eingeschraenkt` / `ausgefallen` | eine bzw. alle Sonden rot |

**Das ist kein Zufall, sondern die Korrektur eines Fehlers.** Der erste Entwurf
hatte **einen** offenen Endpunkt. Weil registrierte Routen am Auffang-Platz und
damit an der Anmeldesperre vorbeigehen, hätte **jeder** weitere Endpunkt
stillschweigend offen gestanden.

Eingetragen wird das Paket bei **jedem** Start von `scripts/start.mjs` in die
Patch-Schicht des Profils (idempotent, eigener markierter Bereich, fremde
Einträge bleiben stehen) — die Profildatei selbst liegt in `.pmh-build/` und ist
nicht versioniert.

### Was noch nicht gebaut ist — mit Zahlen

| | dieses Projekt | Referenz (Upstream-Fork) |
|---|---:|---:|
| Quellcode (`packages/`, `services/`, `native/`, `apps/cli/src`; `.ts`, `.go`, `.rs`, `.mjs`, `.sql`, `.ps1`) | **120 Dateien · 1,5 MB** | 5.205 Dateien · 49 MB |
| Applikationspakete | **16** | 245 |

**Unser Quellcode ist rund 43-mal kleiner als der Anwendungscode der Referenz.** Das
ist kein Größen-, sondern ein Fortschrittsmaß — die Zerlegung steht in
[groessenvergleich-zur-referenz.md](docs/review/groessenvergleich-zur-referenz.md).

## Aufbau

```
apps/cli            der Host: lädt das Profil, komponiert den Cordis-Baum, reicht die Oberfläche aus
apps/web            die Oberfläche (unverändert aus der Vorlage) — Vorlage für unsere eigene
packages/api        health (Endpunkte + Sondenregister) · readiness (Sonden für PostgreSQL, Redis)
                     — beide über ctx.webServer im Host eingehängt
packages/llm        LLM-Seam · llm-deepseek · llm-retry · token-meter
packages/core       agent-tools · agent-loop
packages/agent      session-format · session-persistence-jsonl
packages/auth       auth (Argon2id, Sitzungen, CSRF) · db-schema (SQL-Migrationen)
packages/units      unit-export (Plugin-Export mit belegtem Rundlauf)
packages/util       atomic-write · home-paths · scope
services/           pmh-attach · pmh-nix · pmh-supervisor (Go) · pmh-sandbox (Rust)
native/             6 Rust-Crates (Sperren, PTY, atomares Schreiben, Landlock) — derzeit ungenutzt
docker/             Stack-Einrichtung: Erweiterungen, Rollen, Rechte
scripts/            Start · Portwahl · Anmeldeadresse · Profil-Verdrahtung · Prüfungen
docs/               Konzept, Entscheidungen, Nachweise, Recherche
```

## Die Reihenfolge (bindend)

Weisung des Betreibers, 13.10.2026 —
[betreiber-weisung-2026-10-13.md](docs/decisions/betreiber-weisung-2026-10-13.md):

1. **Kleinste Kette verdrahten** — Adapter → Agent-Loop → Session. *„Ohne laufenden
   Kern gibt es nichts, was man absichern oder skalieren könnte."*
2. **Danach** Login, PostgreSQL und Redis ins Spiel bringen — gebaut und getestet ist
   beides, es hängt nur nichts daran.
3. **Mandantentrennung** als eigene Entscheidung davor: Row-Level Security,
   `workspace_members`, Redis-Namensräume, **pro Benutzer eine eigene Sandbox**.
   **Nicht Ende-zu-Ende** — der Agent braucht den Klartext, sonst fallen Werkzeuge,
   Subagenten und Verdichtung weg.
4. **Offen:** Formatversion 4 der Sitzung, Compaction, Aufruf gegen den echten Anbieter,
   `pmh-supervisor` starten.

**Wie es weitergeht** — der eigene Endpunktweg als erste eigene Schnittstelle, weil die
Vorlage keine erreichbare API hat: [eigener-endpunktweg.md](docs/decisions/eigener-endpunktweg.md).

## Zielbild

Assistent-Agent-Harness: Chat und Workspaces, Obsidian als Gedächtnis mit Graph-View,
Werkzeug- und Modellverwaltung, Researcher- und Fine-Tune-Skills, Git-Anbindung,
Vektor-Suche über PostgreSQL/pgvector, Netzwerkzugriff über einen Tunnel, und der
Harness richtet seine Umgebung (WSL2, Docker/Podman) selbst ein. Die vollständige Liste
mit Status je Punkt steht in
[arbeitspakete.md](docs/status/arbeitspakete.md) (Abschnitt R).

## Dokumente

| Datei | Inhalt | Art |
|---|---|---|
| [docs/concept.md](docs/concept.md) | Das Unit-Modell und die vier Regeln | Konzept |
| [docs/stack.md](docs/stack.md) | Sprachaufteilung und Sprachgrenzen | Vorschlag |
| [docs/decisions/](docs/decisions/) | Getroffene und offene Entscheidungen | Entscheidungen |
| [docs/review/](docs/review/) | Befunde: Rust-Bestand, API-Fläche, Stack, Größenvergleich | Belege |
| [docs/status/](docs/status/) | Nachweise mit Befehl und Ergebnis, Register, Git-Audit | Belege |
| [docs/research/](docs/research/) | Recherche: Auth-Standards, Sprachwahl | Vorlagen |
| [docs/INDEX.md](docs/INDEX.md) | Verzeichnis aller Dokumente | Übersicht |

## Regeln für die Arbeit hier

1. **Der Core ist unantastbar.** Keine Änderung in fremden Dateien — wer eine Änderung
   braucht, baut sie als Unit.
2. **Kein Unit importiert Interna des Cores** — nur öffentliche Steckplätze (`ctx.*`,
   Service-Interfaces). Nur so kostet ein Core-Sprung keine Unit-Arbeit.
3. **Dienste starten mit der Harness**, und ein fehlgeschlagener Start ist ein
   **sichtbarer** Fehler, kein stiller Ausfall.
4. **Sprachgrenzen sind Dienstgrenzen** — jede andere Sprache ist ein Prozess.

**Und die Regel, die hier am strengsten gilt:** abgehakt wird nur Belegtes. Jede Zahl in
diesem Repository nennt den Befehl, mit dem sie gemessen wurde. Was nicht geprüft werden
konnte, steht als Lücke da — nicht als erledigt.

## Lizenz

Der DeepSeek Harness dient als **Codebasis**; damit greift seine **MIT-Lizenz**. Der
Copyright-Vermerk liegt in [LICENSE](LICENSE) — die Bedingung der Lizenz verlangt ihn.
