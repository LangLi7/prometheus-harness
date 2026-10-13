# Lage der Aufsicht — eine Seite für Entscheidungen

> **Was das ist.** Die Kurzfassung von [`befunde.md`](befunde.md) und [`protokoll.md`](protokoll.md):
> was **jetzt** zu tun ist, was erledigt ist, was **nicht** geprüft werden konnte. Stand:
> **2026-10-13, 13:55**. Die Einzelbelege stehen in `befunde.md` — hier steht nur, was eine
> Entscheidung braucht.
>
> **Wer das schreibt.** Die **Aufsicht** (Wächter-Rolle), nicht der bauende Agent. Jede Zahl hier ist
> gemessen; jede nennt in `befunde.md` den Befehl.

## 0. Das Dringendste — **behoben**, zwei Ein-Wort-Reste

**Behoben um 13:53:12.** `function BeendeBaum([int]$wurzelPid)` — der Parameter ist umbenannt **und im
Rumpf konsistent nachgezogen** (Zeilen 101/102). Das ist an der **gefährlichen** Stelle richtig: hätte
nur der Parameter den Namen gewechselt und der Rumpf `$pid` behalten, hätte die Funktion nicht mehr
**nichts** getan, sondern **den eigenen Prozessbaum** beendet. Dazu zwei Verbesserungen, die ich nicht
verlangt hatte: die Portprüfung prüft jetzt den **gewählten** Port (nicht immer 5780), und **die Waisen
werden nachgezählt** (Zeilen 189–198, mit Eltern-PID) — genau die Prüfung, die **B22 künftig sofort
sichtbar macht**.

**Zwei Reste derselben Familie — jeder ein Wort** (Quelltextbefund, Zeilen in der Shell gemessen):

| Stelle | Was | Folge |
|---|---|---|
| Zeilen **182, 186, 197** | `$fehler++` steht **im Funktionsrumpf** von `StarteHost`; `$script:fehler` kommt im ganzen Skript **nicht** vor | Die Zählung landet in einer **lokalen Kopie** — darunter **genau die neue Waisenprüfung**. „FEHLER: 3 Host-Prozess(e) ueberlebten das Aufraeumen" ist möglich bei einem Endstand **`0 Befund(e)`**. Fix: `$script:fehler++` |
| Zeile **218** | `Get-Content "$log.err" \| Select-Object -First 1` gibt den **Fehlertext in die Pipeline** (`return $null` in 219 hebt das nicht auf) | `BelegePort` liefert Text statt `$null` → `if ($h -eq $null)` (236) greift nicht → der Zweig „UEBERSPRUNGEN: … dieser Test prueft nichts" erscheint **nie**. Fix: `\| Out-Null` |

**Was ich *nicht* getan habe:** den Test **nicht noch einmal ausgeführt** — meine eine Ausführung (13:47)
lief parallel zu seinem Zeugentest und hinterließ eigene Waisen. Der **dynamische** Beweis gehört seinem
nächsten Lauf. **Stand 14:12 gemessen:** null Hosts, null Launcher, **0,0 MB**.

## 1. Jetzt zu entscheiden oder zu ändern

| # | Was | Warum es zählt | Nachweis in einem Befehl |
|---|---|---|---|
| **B23** | **behoben um 13:53** (`$wurzelPid`), **zwei Ein-Wort-Reste offen** (siehe §0) | Die Kernursache ist weg — und sie war gefährlicher, als sie aussah: ein halber Fix hätte das **eigene Skript** beendet. Die zwei Reste kosten die **Sichtbarkeit**: die neue Waisenprüfung zählt nicht, und der Schutz „dieser Test prueft nichts" greift nie | `Select-String -Path scripts\port-test.ps1 -Pattern '\$fehler\+\+|\$script:fehler'` |

| **B22** | **erledigt** — die Waisen sind **erklärt** (B23), **aufgeräumt** und die Ursache ist **behoben**: um 13:41:50 noch **sechs** (1,13 GB, Alter bis 11,4 min), um 13:42 **null**; sein Lauf um 13:43 hinterließ **drei** weitere (591,1 MB, Ports 5780/5781/5790), auch die sind um **14:12 weg** (null Hosts, null Launcher, 0,0 MB). Der Nachzähl-Schritt, den ich empfohlen hatte, steht jetzt **im Skript** (Zeilen 189–198) | Sechs Hosts = sechs Ports, sechs Harness-Homes, **1,13 GB**; dazu blockierten sie die eigenen nächsten Läufe (Fall 1 fiel deshalb um). **Bleibt nützlich:** [`hilfen/waisen-aufraeumen.ps1`](hilfen/waisen-aufraeumen.ps1) als Netz — Herkunft entscheidet, das Alter siebt nur die Kinder eines laufenden Tests aus (Trockenlauf; `-Anwenden` beendet) |
| **B16** | ~~**„API ausgefallen" ist nicht belegt.**~~ **ENTSCHIEDEN — die Behauptung ist widerlegt.** Angemeldet an ihrem **laufenden** Host antwortet `POST /api/goals/create` mit **HTTP 200 und JSON-RPC-Rahmen**: der Typert-Gateway **lebt**. Die README-Zeile „API des Cores ausgefallen" ist damit **falsch**, und die Begründung der Entscheidung „eigener Endpunktweg" („die Vorlage hat keine erreichbare API") **hinfällig** — die Entscheidung selbst bleibt legitim | Die eigene Sonde konnte es nicht sehen: ohne Anmeldung ist **jeder** `/api/*`-Pfad 401, mit Anmeldung sind ihre 19 **geratenen** Pfade 404. Nur ein **registrierter** Pfad antwortet. **Offen:** der WS-Pfad `/api/remote.mux` scheitert auf **beiden** Installationen schon beim Handschlag | `bun run docs\protokoll\aufsicht\werkzeuge\api-erreichbarkeit.mjs http://127.0.0.1:<port>` (mit Token) |
| **B13** | **von sechs Stellen sind drei übrig.** `port-test.ps1` ist **bereinigt** (die Namens-und-Alter-Zeilen sind weg — Verdienst des bauenden Agenten). **Offen:** `boot-schleife.ps1:103` (2 min), `api-test.ps1:33` (3 min), `api-flaeche.ps1:92` (3 min) | Diese drei töten weiterhin **jeden** `bun` im Fenster — auch einen fremden `bun test`/`bun install` und **den Zeugenprozess, den der bauende Agent gerade selbst benutzt**, um genau diese Frage zu prüfen | `Get-ChildItem -Recurse -Include *.ps1 \| Select-String 'Get-Process bun'` |
| **B19** | **erledigt** — der bauende Agent hat die Anmeldesperre über den **Zaun des Cores** gebaut (`requestRejection`, danach Anmeldung) und bei fehlendem Dienst **Fail-closed 503**. Die Umsetzung ist besser als die Empfehlung; ich rechne sie mir **nicht** zu (seine Sonde lief vor meinem Befund) | — | `Select-String -Path packages\api\health\src\index.ts -Pattern 'requestRejection'` |
| **B20** | **Zwei eigene Artefakte widersprechen sich:** `/api/ready` liefert bei **null Sonden** `bereit: true` + HTTP 200 (so steht es im **Test**: „nichts zu prüfen — und das ist bereit"), während die **`.env.example`** sagt, der Endpunkt melde `ok`, „statt ‚bereit' zu behaupten" | Ein Orchestrator liest den **Statuscode** und das Feld `bereit` — beide sagen „ja", obwohl nichts geprüft wurde. Kleine Auswege: an `sonden.length > 0` binden (503) · `null` als dritter Zustand („nicht geprüft") · oder nur den Wortlaut der Vorlage an den Code anpassen | `Select-String -Path packages\api\health\src\index.ts -Pattern 'bereit:'` |
| **B14** | **Umschlagverschlüsselung ist Schema, nicht Code**: `value_cipher`/`wrapped_key` nur in der Migration; `PMH_MASTER_KEY` und `MIGRATION_DATABASE_URL` liest **nichts** | Wer `PMH_MASTER_KEY` setzt, ändert nichts; §3 der Weisung („der Bestand macht es schon") gilt für den Plan, nicht für den Code | `Select-String -Recurse -Include *.ts,*.sh,*.sql -Pattern 'PMH_MASTER_KEY'` |
| **B15** | Der in **B6** widerlegte Satz steht inzwischen **auf der Startseite** (drittes Dokument), und die drei Bäume sind falsch beschriftet („unveränderter Upstream" = gepatchter Arbeitsbaum) | Ein Fremder liest das README zuerst; die Fehlbeschriftung ist die Ursache des Fehlzitats in **B10** | `git -C ..\deepseek-harness log --oneline -1` zeigt `dsh-custom` |
| **B11** | siehe **B13** — dieselbe Ursache, erster Fund | — | — |
| **H1** | **Nutzen statt nachbauen:** SearXNG (`127.0.0.1:8081`), Firecrawl (`127.0.0.1:3002`) und ein OpenAI-kompatibler Dienst (`127.0.0.1:3001`, **1.075 Modelle**) **laufen auf dieser Maschine bereits**; WSL2 Ubuntu läuft. Nur anschließen, nicht installieren | Die Zielliste nennt genau diese Bausteine. Ollama läuft im Container, hat aber **keinen** veröffentlichten Port (vom Host nicht erreichbar) | [`hilfen/vorhandene-bausteine.md`](hilfen/vorhandene-bausteine.md) |
| **H2** | Der lokale Anbieter ist für **dieses** Projekt noch nicht benutzbar: `FREELLMAPI_API_KEY` liegt **nur** in `~/.dsh/.env` — in **keinem** Credential-Speicher, auch nicht in `~/.pmh` | Der eigene Adapter liest nur die **Umgebungsvariable** (B17). Die laufende DSH-Installation hat eine fertige Referenzkonfiguration für diesen Anbieter | [`hilfen/vorhandene-bausteine.md`](hilfen/vorhandene-bausteine.md) §2 |
| **B18** | **Klein:** die erste Statuszeile des Launchers zählt **gestartete** statt **laufende** Prozesse („2 Prozesse laufen", während einer läuft) — `pmh-nix detect --json` ist ein Einmalaufruf, wird aber als Dienst geführt | Für einen Neuling ist das die erste Auskunft überhaupt; das Projekt lebt von „abgehakt wird nur Belegtes" | `Select-String -Path scripts\start.mjs -Pattern 'buildAndStartGo'` |

## 2. Erledigt oder beantwortet

| # | Was | Stand |
|---|---|---|
| **B1** | Konfiguration nachziehen (22.09.-Stand) | **erledigt** — 4 Änderungen angewendet, 3 Auslassungen belegt und nachholbar |
| **B3/B17** | Modellzugang für `P8.12` | **teilweise** — echter Aufruf über den **eigenen Adapter** gelungen („Empfang", 41/117 Token, 1,20 s); der Weg ist die **Umgebungsvariable**, nicht der Speicher |
| **B6** | Rust-Befund nachgemessen | Messungen **bestätigt**, Aussage „kein einziger Aufruf" **widerlegt** (der Aufrufer existiert) |
| **B8** | Compose-Umbau | **erledigt** — Stack neu aufgesetzt, Rechtetrennung von mir in fünf Prüfungen bestätigt |
| **B9** | Rechte belegt, Prüfung urteilt nicht | `hilfen/rechte-probe-assertion.sql` bereit, beide Ausgänge getestet |
| **B10** | Betreiber-Weisung | Krypto, Umschlag-Spalten, Historien-Negativbefund **bestätigt**; Vorlage-Tabelle zitiert den falschen Baum |
| **B12** | Sprachwahl-Recherche | PTY-Messung **vollständig reproduziert**; offene Zeilendifferenz **aufgeklärt** (555 Leerzeilen) |
| **B15** | README-Zahlen | Versionen **exakt** (17.11 / pgvector 0.8.7 / Redis 7.4.9), 14 Pakete bestätigt |
| **V1** | Der **erste eigene Endpunkt** (`packages/api/health`, `GET /api/health`) | **korrekt gebaut und verdrahtet** — drei Prüfungen bestanden: Core-Vertrag (`kind: 'exact'`), Profil-Eintrag deckungsgleich, aus dem Profilordner auflösbar (Nodes eigener Resolver → `packages/api/health/src/index.ts`). **Offen bleibt nur der Start:** lädt der Host das Plugin und antwortet der Pfad? |
| **V2** | Der **Weg der Bereitschafts-Sonde** (`/api/ready` → PostgreSQL) | **beantwortbar gegen den laufenden Stapel** (nur lesend nachgefahren): `select 1` → 1 · Fassung **2** (erwartet 2) · **fünf von fünf** Kerntabellen im aktuellen Schema · Rolle `pmh_app` darf die vom Eigentümer **nach** der Einrichtung angelegte `schema_migrations` lesen → die Vorgaben aus `03`/`04` **wirken** |

## 3. Offen, weil **nicht prüfbar** — ausdrücklich als Lücke geführt

| Frage | Warum offen |
|---|---|
| Lebt der API-Weg **des PMH-Hosts**? | braucht einen laufenden PMH-Host — die Aufsicht startet ihn **nicht** (Hausregel H2/H5) |
| `P8.12` **in der Kette** | der Nachweis gehört dem bauenden Agenten; meine Messung ist eine Vorstufe |
| Form der Host-Ausgabe (`token=<43 Zeichen base64url>`) | aus meiner Sitzung nicht prüfbar — die laufende GUI meldet keinen Token in `DSH_HOME`-Variablen |
| Widerspruch 17 rot gegen 19 grün bei `atomic-write` | Tests wurden von mir **nicht** ausgeführt (H5) |
| Ob der pnpm-Store-Gewinn netto 4,3 GB beträgt | im Dokument selbst als offen benannt |

## 4. Gefahren, die niemanden stören, solange nichts passiert

| Gefahr | Beleg |
|---|---|
| ~~**Dieses Protokoll ist nicht versioniert**~~ **erledigt und veröffentlicht.** `docs/protokoll/**` ist mit Commit **`6926c0a`** versioniert und durch den **zehnten Push** des bauenden Agenten (`origin/main` = `cd1b0ae`) **im Remote** — 21 Dateien. Mein zweiter Commit `ecae3b6` ist lokal und kommt mit seinem nächsten Push mit | Weil der Ordner jetzt **verfolgt** ist, nimmt ein `git add -A` künftige Einträge automatisch mit. Es war kein Push der Aufsicht nötig — seine Takt-Regel hat den Commit mitgenommen | `git ls-tree -r --name-only origin/main -- docs/protokoll` → 21 |
| **`docker volume prune` löscht den Altbestand** | 18 verwaiste Volumes; `ab00fc2605…` enthält ein intaktes PostgreSQL-17-Cluster (64,8 MB, read-only geprüft). `compose down -v` trifft es **nicht**, `prune` **doch** |
| `target/` belegt ~700 MB | Build-Artefakte von sechs Rust-Crates, die nichts aufruft; über `.gitignore` abgedeckt |
| Zwei Recherchedokumente im Repo-Wurzelverzeichnis | 55 KB + 86 KB; das gleichartige `sprachwahl-entscheidung-2026.md` liegt korrekt unter `docs/research/` |
| **Drei** Aufräumzeilen töten `bun` nach **Name und Alter** | siehe **B13** — von sechs Stellen sind nach der Bereinigung von `port-test.ps1` **drei** übrig (`boot-schleife.ps1`, `api-test.ps1`, `api-flaeche.ps1`) |
| **Unversionierte Arbeit ist gerade groß** | **34** Dateien geändert, **2.394** Einfügungen, **226** Löschungen — darunter die Rust-Dateien `native/flock` und 20 Go-Dateien. Nicht beanstandet (Arbeitsstand), aber **nichts davon ist versioniert**: `HEAD` ist `fc48415`, `origin/main` ist `cd1b0ae` |

## 5. Wie man alles nachfährt

```powershell
cd C:\Users\Chang\prometheus-harness\docs\protokoll\aufsicht
node werkzeuge\protokoll-pruefung.mjs       # prüft die eigene Spur (Vollständigkeit, JSONL, Versionierung)
node werkzeuge\takt-pruefung.mjs            # Lage: Konfiguration, Zugänge, Git, DB, Prozesse
node werkzeuge\settings-vergleich.mjs "<live>" "<sicherung>"
node werkzeuge\zugangs-lage.mjs --pruefen DEEPSEEK_API_KEY <home…>
node werkzeuge\zeilen-zahl.mjs <repo> rs md
node werkzeuge\zeilen-klassen.mjs <repo> rs
node werkzeuge\geheimnis-historie.mjs <repo>
node werkzeuge\init-skript-probe.mjs <pfad-zur-init-datei>
bun  run werkzeuge\pty-probe.mjs
bun  run werkzeuge\bun-faehigkeiten.mjs
bun  run werkzeuge\api-erreichbarkeit.mjs http://127.0.0.1:3080
bun  run hilfen\anbieter-rauchtest.mjs
# Waisen aufspüren: Herkunft (Kommandozeile) entscheidet, das Alter siebt nur die
# lebenden Kinder eines laufenden Tests aus. Ohne -Anwenden wird NICHTS beendet.
pwsh -NoProfile -ExecutionPolicy Bypass -File hilfen\waisen-aufraeumen.ps1
```

> **Zur Ausführungsrichtlinie.** Auf diesem Rechner steht `CurrentUser = Restricted` (und schlägt das
> `LocalMachine = RemoteSigned`): eine `.ps1` läuft **nur** mit `-ExecutionPolicy Bypass`. Das gilt für
> **jede** `.ps1` dieses Projekts, auch für `scripts/port-test.ps1` — ohne den Schalter bricht sie schon
> beim Laden ab. Meine eigenen Werkzeuge sind deshalb `.mjs` und brauchen den Schalter nicht.

**Hausregeln der Aufsicht:** kein Neustart von DSH/`~/.dsh`/`~/.pmh`, solange der andere Agent
arbeitet (**H1**); kein Schreiben in dessen Baubereich (**H2**); keine Geheimwerte in Protokollen
(**H4**); Korrektur statt Löschung eigener Fehler (**H6**). Vollständig in
[`README.md`](README.md) §2.
