# Lage der Aufsicht — eine Seite für Entscheidungen

> **Was das ist.** Die Kurzfassung von [`befunde.md`](befunde.md) und [`protokoll.md`](protokoll.md):
> was **jetzt** zu tun ist, was erledigt ist, was **nicht** geprüft werden konnte. Stand:
> **2026-10-13, 16:11**. Die Einzelbelege stehen in `befunde.md` — hier steht nur, was eine
> Entscheidung braucht.
>
> **Wer das schreibt.** Die **Aufsicht** (Wächter-Rolle), nicht der bauende Agent. Jede Zahl hier ist
> gemessen; jede nennt in `befunde.md` den Befehl.

## 0. Was jetzt zu tun ist — nach **Wirkung** sortiert

> **Warum diese Liste hier steht.** Die Befunde stehen in `befunde.md`, die Chronik in `protokoll.md`.
> Diese Tabelle ist die **eine** Seite für den Menschen: was wirkt, wer es tun kann, und womit.
> **Nichts davon tue ich selbst** — H1 (kein Neustart), H3 (mein Schreibbereich ist `docs/protokoll/`)
> und A3 (erst einstufen, dann vollziehen) gelten.

### Sofort — die Reihenfolge hat sich gedreht, und **einer meiner Sätze war falsch**

**1. Die vier Rollenkennwörter sind im Repository veröffentlicht — und sie können *sofort* gedreht
werden.** Gemessen: die Werte in `.env` sind **identisch** mit `.env.example`, `docker-compose.yml` und
`README.md` (19/19/17/19 Zeichen) — also nicht *abgeflossen*, sondern **von Anfang an öffentlich**, in
jedem Klon und in jedem Push. **Löschen hilft nicht**; Historie und Kopien behalten sie. **Der Weg, der
zählt, prüft das Kennwort bereits:** am 13.10. um **16:13** gemessen wird ein absichtlich **falsches**
Kennwort von **Windows** aus gegen `127.0.0.1:5432` **abgelehnt** — `password authentication failed for
user "pmh_app"` und ebenso für `pmh_admin`. Die Portweiterleitung führt unter die **letzte**
`pg_hba`-Zeile (`host all all all scram-sha-256`), und `password_encryption` ist bereits
`scram-sha-256`. Die Drehung wirkt also **heute** — für die Anwendung (`DATABASE_URL` → Rolle
`pmh_app`), für pgAdmin und für jeden Zugriff aus dem Netz. **Nicht betroffen:** die *erzeugten*
Geheimnisse (`PMH_MASTER_KEY`, Modellschlüssel) — **14 echte Werte, 0 Treffer** in 53 Commits.

**2. `pg_hba.conf` bleibt ein Punkt — aber ein kleinerer. *Korrigiert am 16:14.*** Die drei
`trust`-Zeilen (`local`, `127.0.0.1/32`, `::1/128`) erreichen nur, wer **im Container** oder über den
**Unix-Socket** fragt: `docker exec … psql` meldet sich mit **falschem** Kennwort als `pmh_admin` an
(gemessen 16:14). Wer das kann, hat ohnehin Docker-Rechte — also Root-Äquivalent. **Zurückgezogen:**
~~„auf diesem Rechner … heißt ‚nur lokal' jeder lokale Prozeß"~~ — das war meine eigene Messung **im
Container**, nicht über den Host. **Zurückgezogen:** ~~„eine Drehung ist vorher kosmetisch"~~.
**B28 sinkt von M auf N (latent).**

**Reihenfolge in einem Satz:** erst **drehen** (wirkt sofort), dann `pg_hba` **dauerhaft** schärfen
(Schutz gegen den Zugriff von *innen*), dann den Installer erneut laufen lassen.

| # | Was | Wer | Warum zuerst | Befehl / Nachweis |
|---|---|---|---|---|
| **1** | **Kennwörter drehen** — `ALTER ROLE … PASSWORD` als `pmh_admin`, dann `.env` nachziehen | bauender Agent | **Wirkt sofort** (16:13 gemessen: der Host-Weg prüft das Kennwort schon). **Vor** dem nächsten Installer-Lauf: der schreibt mit dem CRLF-Fix **neue** Geheimnisse in die `.env`, während die Datenbank die alten behält (**B26**) | `node docs\protokoll\aufsicht\hilfen\kennwoerter-drehen.mjs --env .env` (Trockenlauf) |
| **2** | **`pg_hba.conf` dauerhaft schärfen** — `host all all 127.0.0.1/32 scram-sha-256` als **erste** Zeile (oder eine Datei einhängen), dann `select pg_reload_conf()` | Betreiber oder bauender Agent | **N (latent), nicht mehr Vorbedingung:** `trust` erreicht nur Socket und **Container**-Schleife; dort umgeht jeder mit Docker-Rechten das Rollenmodell (**B28**, am 16:14 korrigiert). Dauerhaft machen, sonst ist es beim nächsten Volume weg | `docker exec pmh-postgres sh -c 'tail -6 /var/lib/postgresql/data/pg_hba.conf'` (zeigt die **Regeln**; `head -2` zeigt nur den Kommentarkopf — mein früherer Befehl war unbrauchbar) |
| **3** | **Modellzugang eintragen** — leere, dokumentierte Zeile `DEEPSEEK_API_KEY=` in `.env.example` + zwei Zeilen in Installer-Schritt 7 | bauender Agent | Ohne den Schlüssel **wirft** `providerFromEnv`; eine frische Installation hätte Host und Oberfläche, aber **keinen beantwortbaren Auftrag** (**B30**) | `Select-String -Path packages\llm\llm-deepseek\src\index.ts -Pattern 'DEEPSEEK_API_KEY'` |
| **4** | **DSH-Anpassungen aufzeichnen** (`git switch dsh-custom` → `add -A` → `commit`), **Neustart** der GUI wenn erlaubt | Betreiber | Zehn Änderungen (Modellkatalog, Crew-Plugin, UI) sind gebaut, aber **nicht in Kraft**: die GUI läuft seit **09:39** über `tsx` auf `src`, die Änderungen entstanden **10:19–10:45**. Ein Update verlöre sie **still** (**B32**) | `git -C C:\Users\Chang\deepseek-harness status --porcelain` → 11 Zeilen |
| **5** | **Zaun im neuen `pmh-attach`** — Host/Origin-Prüfung wie im Kern; `--allow-wildcard` nicht ohne Credential | bauender Agent | Der Dienst hat **keine** eingehende Anmeldung und **keinen** Origin-Zaun, während der Kern daneben beides hat (`requestRejection`). Gefährlich ist die **Kombination** `--allow-wildcard` ohne Zaun (**B33**) | `Select-String -Path services\pmh-attach\internal\wire\conn.go -Pattern 'Origin'` → leer |
| **6** | **`$script:fehler++`** in `scripts/port-test.ps1` (Zeilen 182, 186, 197) | bauender Agent | Die neue **Waisenprüfung** zählt nicht: „3 Host-Prozess(e) überlebten" ist bei Endstand „**0 Befunde**" möglich (**B23**) | `Select-String -Path scripts\port-test.ps1 -Pattern '\$script:fehler'` → leer |
| **7** | **Drei Tötungszeilen nach Name und Alter** in `docs/status/messsonden/` | bauender Agent | `boot-schleife.ps1:103` (2 min), `api-test.ps1:33` und `api-flaeche.ps1:92` (3 min) treffen auch fremde `bun`-Läufe und **seinen eigenen Zeugenprozess** (**B13**) | `Get-ChildItem -Recurse -Include *.ps1 \| Select-String 'Get-Process bun'` |
| **8** | **Arbeitskopie renormalisieren** — `git add --renormalize .` und `git checkout -- .` | bauender Agent | 11 Dateien haben CRLF, obwohl ihre Regel LF verlangt; `unit-export/src/cli.ts` trägt ein **CRLF im Shebang** (**B29**) | `git ls-files --eol \| Select-String 'w/crlf.*eol=lf'` → muß leer sein |
| **9** | **rustup in WSL** — oder „Vertrag umgesetzt" als **Behauptung** kennzeichnen | Betreiber | Die 15 Vertragstests von `native/flock` laufen auf dieser Maschine **nirgends**: Windows kompiliert sie weg, WSL hat keinen Rust-Compiler (**B24**) | `wsl -d Ubuntu -- sh -c 'command -v cargo'` → leer |

**Was ich ausdrücklich nicht tue:** keinen Neustart von DSH/`~/.dsh`/`~/.pmh` (**H1**) · keine Schreibzugriffe
im Baubereich (**H2/H3**) · keine Tests des Ziel-Repos, außer wo ich sie ankündige und ihre Dateien nachweislich
ruhig sind (**H5**, siehe V5) · keine Geheimwerte in Protokollen (**H4**).

---

### Rückblick — der Fall, der §0 vorher bestimmte

**Behoben um 13:53:12.** `function BeendeBaum([int]$wurzelPid)` — der Parameter ist umbenannt **und im
Rumpf konsistent nachgezogen** (Zeilen 101/102). Das ist an der **gefährlichen** Stelle richtig: hätte
nur der Parameter den Namen gewechselt und der Rumpf `$pid` behalten, hätte die Funktion nicht mehr
**nichts** getan, sondern **den eigenen Prozessbaum** beendet. Dazu zwei Verbesserungen, die ich nicht
verlangt hatte: die Portprüfung prüft jetzt den **gewählten** Port (nicht immer 5780), und **die Waisen
werden nachgezählt** (Zeilen 189–198, mit Eltern-PID) — genau die Prüfung, die **B22 künftig sofort
sichtbar macht**.

**Ein Rest bleibt — ein Wort** (Quelltextbefund, Zeilen in der Shell gemessen **14:08**):

| Stelle | Was | Folge |
|---|---|---|
| Zeilen **182, 186, 197** | `$fehler++` steht **im Funktionsrumpf** von `StarteHost`; `$script:fehler` kommt im ganzen Skript **nicht** vor | Die Zählung landet in einer **lokalen Kopie** — darunter **genau die neue Waisenprüfung**. „FEHLER: 3 Host-Prozess(e) ueberlebten das Aufraeumen" ist möglich bei einem Endstand **`0 Befund(e)`**. Fix: `$script:fehler++` |
| Zeile **218** | ~~`Get-Content "$log.err" \| Select-Object -First 1` gibt den **Fehlertext in die Pipeline**~~ **BEHOBEN um 13:59** — und besser als verlangt: er fand die **tiefere Ursache** (`port-halter.mjs` schreibt seinen Fehler nach **stdout**, deshalb war `.err` leer) und gibt jetzt **beide** Dateien mit **Exit-Code** aus (Zeilen 216–227) | erledigt |

**Was ich *nicht* getan habe:** den Test **nicht noch einmal ausgeführt** — meine eine Ausführung (13:47)
lief parallel zu seinem Zeugentest und hinterließ eigene Waisen. Der **dynamische** Beweis gehört seinem
nächsten Lauf. **Stand 14:12 gemessen:** null Hosts, null Launcher, **0,0 MB**.

## 1. Jetzt zu entscheiden oder zu ändern

| # | Was | Warum es zählt | Nachweis in einem Befehl |
|---|---|---|---|
| **B23** | **behoben** (`$wurzelPid` in `b75c9f6`), **ein Ein-Wort-Rest offen** (siehe §0) | Die Kernursache ist weg — und sie war gefährlicher, als sie aussah: ein halber Fix hätte das **eigene Skript** beendet. Die zwei Reste kosten die **Sichtbarkeit**: die neue Waisenprüfung zählt nicht, und der Schutz „dieser Test prueft nichts" greift nie | `Select-String -Path scripts\port-test.ps1 -Pattern '\$fehler\+\+|\$script:fehler'` |
| **B24** | **Die 15 Vertragstests von `native/flock` sind auf dieser Maschine nirgends ausführbar** — Windows: `running 0 tests` (grün, weil `#![cfg(unix)]`); WSL Ubuntu: **kein `cargo`/`rustc`**. Ein grüner `cargo test` beweist hier **nichts** über den Vertrag | Ohne diesen Nachweis trägt „der Vertrag ist umgesetzt" nur als **Behauptung**. **Ein Befehl schließt die Lücke** (rustup in WSL) — danach laufen 15 Tests statt 0. **Dazu:** `target/debug/pmh-flock.exe` **existiert**, der Satz „unter Windows wird es nicht gebaut" ist damit falsch (gemessen, das Verhalten selbst ist vorbildlich) | `wsl -d Ubuntu -- sh -c 'command -v cargo \|\| echo FEHLT'` |
| **B25** | **Das deklarierte Startkommando der Unit `pmh-flock` tut nichts:** `--hold-ms 0` schläft 0 ms → Sperre sofort frei, Prozess endet. `units/README.md` Zeile 63 definiert `entry` als „**wie der Dienst gestartet wird**" | **Latent, nicht akut** — niemand führt die Kommandos aus, solange `pmh-supervisor` fehlt. **Systemisch:** **10** von 10 Dienst-Einträgen nennen einen **nackten Binärnamen**, **0** davon sind im `PATH`; mehrere sind **Einmalaufrufe** als `service` deklariert — **dieselbe Lücke wie B18** im Launcher. Fix: `--daemon` und die Unterscheidung Einmalaufruf/Dienst im Format | `Get-Command pmh-flock` → nicht gefunden |
| **B26** | **BERICHTIGT — die Anmelde-Aussage fällt.** Gemessen bleibt: die vier Rollenkennwörter in `.env` sind **identisch** mit den Vorlagenwerten (Längen/Gleichheit). **Gefallen ist „meldet sich über TCP damit an"** — es wird überhaupt kein Kennwort geprüft (siehe **B28**). Ursache: `docker-compose.yml` liefert **Ausweichwerte** (`:-bitte-aendern-*`) und entwertet damit die scharfe Prüfung in `docker/02-roles.sh` (`: "${…:?}"`) — und PostgreSQL setzt Kennwörter **nur beim ersten Init**, das Volume blieb (Container 14:25 neu, Volume von 12:05) | **Aus dem Netz nicht erreichbar** (alle Ports an `127.0.0.1` gebunden — gemessen), also **M**, nicht H. Lokal bleibt: jeder Prozess/Benutzer dieser Maschine und jeder Container im Compose-Netz, also auch **pgAdmin**. Der Autor **kennt** den Fall und hat ihn selbst gemessen; sein Werkzeug **meldet nur** und ändert nichts (richtig). Was fehlt: **nichts führt aus Weg A („Kennwörter übernehmen") wieder heraus** | 1) In compose `${VAR:?…}` statt `:-bitte-aendern-…` (fünf Stellen) · 2) laufenden Stapel **drehen** statt löschen: `ALTER ROLE … PASSWORD` als `pmh_admin`, dann `.env` nachziehen |
| **B27** | **Auskunft auf die Betreiberfrage „da wurde doch nichts geändert".** Der Zielbaum ist **1.867 MB**, die Quelle **9.029 MB** — aber **8.642 MB (96 %) der Quelle sind `node_modules`** eines pnpm-Monorepos, und im Ziel sind **1.490 MB** `node_modules` + Rust-`target`. Eigener Quelltext im Ziel: **~4 MB.** | **Die Größe zweier Bäume vergleicht Installiertes, nicht Geleistetes.** Die echten Zahlen: **54 Commits in 15 Stunden**, seit dem ersten Commit **1.224 Dateien · +42.338 / −97.781 Zeilen**, eigener Quelltext **~147 Dateien / ~49.200 Zeilen**, **51 Testdateien**. Dass der Zielbaum **kleiner** ist, ist der Zweck (Ballast abwerfen) | `git -C C:\Users\Chang\prometheus-harness diff --shortstat (git rev-list --max-parents=0 HEAD) HEAD` |
| **B28** | **KORRIGIERT am 16:14 — die Schleife *im Container* verlangt kein Kennwort, der Host schon.** `pg_hba.conf` (Bildvorgabe, vom Projekt nirgends gesetzt) hat `local`/`127.0.0.1/32`/`::1/128` auf **trust**. Gemessen: **im Container** (Socket *und* `-h 127.0.0.1`) meldet sich ein **absichtlich falsches** Kennwort als `pmh_app` **und** als `pmh_admin` an; **von Windows aus** gegen `127.0.0.1:5432` wird dasselbe falsche Kennwort **abgelehnt** (`password authentication failed`) — die Portweiterleitung fällt unter die letzte Zeile `host all all all scram-sha-256` | **N (latent), vorher M.** Zurückgezogen: ~~„auf diesem Rechner heißt ‚nur lokal' jeder lokale Prozeß"~~ (mein Test lief **im Container**) und ~~„eine Drehung ohne diese Datei ist kosmetisch"~~ (sie wirkt sofort). Was bleibt: wer **im Container** arbeitet, wählt seine Rolle selbst — und Docker-Rechte sind Root-Äquivalent. Die Datei bleibt der **einzige** Ort, an dem das Rechtemodell durchgesetzt wird | 1) `host all all 127.0.0.1/32 scram-sha-256` als **erste** Zeile + `select pg_reload_conf()` (gemessen: danach scheitert ein falsches Kennwort) · 2) dauerhaft machen · 3) die Drehung **braucht das nicht mehr** als Vorbedingung |
| **B29** | **`.gitattributes` ist da, die Arbeitskopie widerspricht ihm aber noch.** `git ls-files --eol`: **11** Dateien mit `attr eol=lf` und `w/crlf` (drei `.md`, **acht `.ts`** in `packages/units/unit-export`), **3** mit gemischten Zeilenenden, 13 `.ps1` mit `w/lf` (laut eigener Begründung unkritisch) | **Der Bestand ist sauber** — Index **1752/1773** LF, Git normalisiert beim `git add`, eine frische Auscheckung bekommt LF; der Widerspruch betrifft **nur diese Arbeitskopie**. **Eine latente Falle bleibt:** `unit-export/src/cli.ts` hat `#!/usr/bin/env bun` **mit CRLF im Shebang** → direkt ausgeführt (in WSL) scheitert es, weil `/usr/bin/env` den Interpreter `bun\r` nicht findet — genau das Fehlerbild aus seinem eigenen `.gitattributes`-Kopf. Über `bun run src/cli.ts` harmlos | `git add --renormalize .` und `git checkout -- .`, dann `git ls-files --eol` prüfen (die Zeilen mit `w/crlf` **und** `attr/text eol=lf` müssen leer sein) |
| **B30** | **Eine frische Installation hat keinen Modellzugang — und niemand sagt es.** `.env`/`.env.example`: **22** Schlüssel, **keiner** für einen Anbieter (die zwei „KEY"-Treffer sind `PMH_MASTER_KEY`/`_VERSION`). Der `.env.example`-**Kommentar** verspricht, Anbieter-Schlüssel lägen **verschlüsselt in `user_secrets`** — nach **B14** liest aber **kein** Code `PMH_MASTER_KEY`. Der eigene Code liest den Schlüssel an **genau einer** Stelle: `providerFromEnv` aus `env.DEEPSEEK_API_KEY`, und **wirft** ohne ihn. Der Installer erklärt `DATABASE_URL`/`REDIS_URL` samt 503-Bedeutung — **kein Wort zum Modell** | `bun run start` liefert Host und Oberfläche, aber **keinen beantwortbaren Auftrag**. Die mitgelieferte **Upstream-Doku** nennt den Ort selbst: `DEEPSEEK_API_KEY=sk-...` in der **`.env` im Repo-Root**. Kein Fehler des Projekts (die Vorlage läßt es offen) — aber die eine Lücke, die das Ergebnis unbrauchbar macht | 1) `.env.example`: **leere, dokumentierte** Zeile `DEEPSEEK_API_KEY=` (wie `PMH_MASTER_KEY`, **nicht** in `GEHEIMNIS_NAMEN`) · 2) Schritt 7 um zwei Zeilen ergänzen (Lesestelle + Speicher-Weg) · 3) Speicher-Weg über [`hilfen/zugang-bereitstellen.mjs`](hilfen/zugang-bereitstellen.mjs) — hier belegt: `.pmh-build/harness-home`, HTTP **200** |
| **B31** | **Sein eigenes Werkzeug warnt gegen seine eigenen Manifeste: 6 von 11.** `bun run src/cli.ts list --root native --root services --root packages` meldet **sechsmal** `[unit_name_directory_mismatch]` — alle `native/*`: `"name"` ist `pmh-flock`, der Ordner heißt `flock` (ebenso atomicfs, crypto, index, landlock-run, pty). `exit 0` — Warnungen, keine Fehler | Die Registry begründet ihre Regel selbst mit „**der Ordner ist die Installation**" — und der **Import** benennt den Ordner nach dem **Unit-Namen**: `installed pmh-nix 0.2.0 -> …\registry\pmh-nix`. Ein Rundlauf aus `native/flock` landet also in `registry/pmh-flock`: **der Pfad ändert sich.** Funktional unschädlich, aber die Regel gilt im ausgelieferten Baum **nicht**. **Der eigentliche Schaden ist die Gewohnheit:** sechs Warnungen bei jedem Lauf lehren jeden Leser, Warnungen zu überlesen | (a) Ordner umbenennen und die sieben Arbeitsbereichsmitglieder mitziehen — mechanisch, berührt aber sieben `Cargo.toml`-Zeilen und Dokumente · (b) die Regel auf den **Anwendungsbaum** begrenzen und für `native/` mit einer Zeile Begründung abschalten. **Beides besser als der heutige Zustand** |
| **B32** | **Die Anpassungen am DSH sind gebaut, aber *nicht in Kraft* — und niemand sagt es.** Der Checkout `deepseek-harness` trägt **10 unversionierte Änderungen** (473 Einfügungen, dazu eine neue Datei) von **heute 10:19–10:45**: Modellkatalog auf `deepseek-flash`/`deepseek-v4-pro` (sachlich richtig, die alten ids sind zurückgezogen), **Crew-Plugin** (Adapter/Reasoning/Tool/Turn + 90 Zeilen Tests — also mein eigenes Werkzeug), UI-Modellauswahl. Die GUI läuft als `node --import tsx/esm apps/cli/src/bin.ts web`, **PID 22260, Start 09:39** | **`tsx` liest die Quellen direkt** — ein `lib/`-Build ist für diesen Startweg **ohne Wirkung** (der Build um 10:45 war unnötig, kein Schaden). Ein laufender Prozess behält den beim Start geladenen Code: **keine der zehn Änderungen ist in dieser Sitzung wirksam**, auch mein `crew_*` nicht. Wirksam würden sie **nur beim nächsten Start** — und den herbeizuführen ist **mir** verboten (H1) und vom Betreiber zweimal untersagt. **Dazu:** der Zweig `dsh-custom` zeichnet den Stand vom **12.10.** auf, die heutigen Änderungen liegen unversioniert daneben, und im **Projekt** steht davon **nichts** (null Treffer) — ein Update oder Neusauschecken verlöre sie **still** | 1) `git switch dsh-custom` + `add -A` + `commit` — der Zweig **existiert schon** · 2) im Projekt **eine Zeile je Anpassung** mit Grund und dem Hinweis „**wirkt erst nach Neustart der GUI**" · 3) für die Wirkung sorgt der **Betreiber** (Neustart), nicht ich |
| **B33** | **Der neue Anhängepunkt `pmh-attach` hat keinen Zaun und keine Anmeldung** — während der Kern daneben beides hat (`requestRejection`). `conn.go` prüft nur `Connection: upgrade`/`Upgrade: websocket` (Protokoll, **keine** Autorisierung); die Suche nach `Origin` in `internal/` findet nur die **Testdatei**, die einen sendet. Alle `Bearer`-Stellen betreffen den **Upstream** — der Dienst ist dort **Client** | **Gut und gemessen:** Standardbindung `127.0.0.1`, Wildcard nur mit `--allow-wildcard`, **läuft nicht**, keine Abhängigkeiten, `go vet` exit 0 (V6). **Die gefährliche Kombination:** `--allow-wildcard` bindet an `0.0.0.0` **ohne** jedes Credential — und eine beliebige Webseite könnte ohne Origin-Prüfung mitlesen. **Latent**, weil noch kein echter Upstream hängt; akut, sobald er hängt | 1) Host/Origin-Prüfung wie im Kern vor dem Upgrade · 2) `--allow-wildcard` **an ein Token binden** (ohne Token abbrechen) |
| **B34** | **Die Ueberschrift des Installations-Belegs verspricht mehr, als der Lauf voraussetzt.** Sie sagt „ohne Vorbedingung", die eigene Schritt-1-Ausgabe lautet aber `ok bun · ok docker · ok git`. Gemessen: **Bun** wird von `install.mjs` auf **beiden** Plattformen selbst installiert, `curl`/`git` von `install.sh`; **Docker** dagegen **von nichts** — Voraussetzung ist Docker **mit laufendem Dienst**. In seiner Container-Tabelle fehlt genau diese Spalte | Es ist eine **begruendete** Entscheidung, keine Nachlaessigkeit (Docker Desktop still zu installieren waere eine Lizenzentscheidung — so steht es in `install.mjs`). Aber wer auf einem **nackten** Rechner steht, haelt den Installer fuer kaputt. Fix: ein Halbsatz in der Ueberschrift + eine Spalte `docker` in der Tabelle | `Select-String -Path scripts\install.mjs -Pattern bun.sh/install` → belegt, dass Bun nachinstalliert wird |
| **B35** | **Ist die neue Harness ressourceneffizienter?** Gemessen gegen **drei** Bäume. Gegen die *Quelle* (9.029 MB) sieht es gut aus — aber 8.642 MB davon sind `node_modules` (pnpm, also der Paketmanager). Gegen den **laufenden DSH-Arbeitsbaum** (1.553 MB) ist das Ziel **GROESSER: 1.870 MB (+317)** — davon **697,6 MB Rust-`target/`**. Ohne dieses nicht ausgelieferte Bauverzeichnis bleiben **1.172,8 MB → ~24 % kleiner** als DSH, bei **achtmal weniger eigenem Code** (60 `.ts` / 23.374 Zeilen gegen 2.542 / 562.378) | **Betrieb: nichts belegt, in keine Richtung.** Die laufende DSH-GUI belegt 2.407,9 MB (mit **dieser** Sitzung), ein frischer PMH-Host lag bei 184–198 MB (13:41 gemessen) — **nicht vergleichbar**, ein DSH-Host zu starten ist mir verwehrt (H1). **Der eigentliche Befund:** 49 Go- und 16 Rust-Dateien (20.379 Zeilen) gegen `packages` mit **0,9 MB** — **gebaut wird viel, verdrahtet ist wenig** | `Get-ChildItem -Recurse -File \| Measure-Object -Sum Length` je Baum; `node werkzeuge\zeilen-zahl.mjs <baum> ts tsx go rs` |
| **B36** | **Die teure Vorgabe des eigenen Sitzungsschreibers steht ohne Begruendung da.** `options.flushEvery ?? 1` an zwei Stellen (`index.ts:368`, `:518`) - ein Schreibvorgang je Ereignis. Sein Benchmark misst dafuer 600-632 ms je 2000 Ereignisse gegen 9,4-12,0 ms gebuendelt; meine Nachmessung: Faktor **184x** (Bun) / 206x (Node), Kette hilft nicht (1,03x / 0,99x) | **Latent**: das Paket ist **nicht verdrahtet** - kein Profil-Eintrag, keine Referenz in `apps/cli`, keine Abhaengigkeit im Wurzel-`package.json`. Es laeuft heute nicht im Host; akut beim Anschliessen des Sitzungsspeichers. **Der Kern hat gar kein `flushEvery`** - seine Schnittstelle ist `appendBatch(meta, events, ...)`, also stapelweise per Vertrag; die Vorgabe ist die des Ports, und die Dokumentation nennt nur die Zahl, keinen Kompromiss. **Und kein `sync`:** im ganzen Paket gibt es **null** Treffer fuer `sync(`/`fsync`/`datasync` (Schreibpfad: `appendFile`, `index.ts:308`) - **der Kern synct an fuenf Stellen** (`index.ts:611, 639, 666, 685, 697`), mit Verzeichnis-fsync und *„discard the crash tail"*. `flushEvery 1` kauft also **Reihenfolge** und Rechtzeitigkeit, **keine Haltbarkeit** | Entweder den Kompromiss neben die Vorgabe schreiben (was kauft sie, was kostet sie) oder die Vorgabe auf einen gebuendelten Wert setzen. **Erst die Entscheidung, dann die Zahl — wird Haltbarkeit zugesagt?** Ja -> der Sync fehlt (der Kern hat ihn); Nein -> der Satz *„Ereignisse seit dem letzten Sync koennen verloren gehen"* gehoert **neben** die Vorgabe, und `1` ist dann schwer zu begruenden |
| **B37** | **Der Eigentuemer einer Sitzung ist im Schema vorgesehen, aber niemand schreibt ihn.** `conversation_sessions` hat `user_id uuid NOT NULL` und `workspace_id uuid` (Migration `0003`, Zeilen 135/136) - und sagt selbst, warum: *„user_id und workspace_id sind unsere Zusaetze. … hier steht nur der Kopf."* Trotzdem: **0** `INSERT` im Anwendungscode (`conversation_sessions` kommt 7-mal vor: 6 Tests, 1 Kerntabellen-Liste `packages/api/readiness/src/index.ts:190`), und der **JSONL-Kopf** auf der Platte hat **keinen** Eigentuemer | **N, latent — aber Vorarbeit fuer RLS:** zwei Orte beschreiben dieselbe Sitzung, einer davon ist leer. Mit der ersten geschriebenen Sitzung ist die Zuordnung **geraten** (Dateinamen tragen keine Benutzerkennung), und die Bereitschaftspruefung **verlangt** die Tabelle. Reihenfolge: **Schreiber bauen**, dann Pruefung „Sitzungsdatei ohne Kopfzeile", **erst danach** RLS | `git grep -n 'insert into conversation_sessions'` → leer; `Select-String -Path packages\api\readiness\src\index.ts -Pattern 'conversation_sessions'` → 1 Treffer (Kerntabellen-Liste) |
| **B38** | **Sein Vorschlag zur Mandantentrennung weist richtig ab — die vorgeschlagene Loeschregel aber ist nicht ausfuehrbar.** Gemessen 16:33 an eigenen Wegwerf-Tabellen: `ON DELETE SET NULL` auf einem **zusammengesetzten** Verweis setzt **beide** Spalten auf NULL, das Loeschen laeuft als `UPDATE ONLY chat SET workspace_id = NULL, user_id = NULL` und scheitert an **`null value in column "workspace_id" violates not-null constraint`**. `DELETE FROM workspaces` waere unmoeglich, solange ein Chat zeigt - dasselbe fuer `conversation_sessions.parent_session` (`user_id NOT NULL`) | **N, und rechtzeitig** (die Migration existiert noch nicht): kein Sicherheitsloch, sondern eine **Betriebsstoerung im Entwurf**. **Sein Weg ist richtig** - der Fremdverweis wird abgewiesen, unabhaengig nachgemessen und **bestaetigt** (B-S1 stimmt). Zu waehlen ist **`NO ACTION`** statt `SET NULL`, weil das Schema **weiche** Loeschungen kennt (`chats.deleted_at`, `workspaces.archived_at`). Dazu: `messages_pkey` ist `(chat_id, id)`, also braucht der Verweis auf `chats (id, user_id)` einen eigenen eindeutigen Index | [`hilfen/mandantentrennung-probe.sql`](hilfen/mandantentrennung-probe.sql) — fuehrt beides in einer Transaktion mit `ROLLBACK` vor und weist am Ende `0 \| 0` Rueckstand nach |
| **B2** | **Kein Schutz davor, dass die Hauptkonfiguration wieder schrumpft** - sie ist **unbemerkt** von 117 KB auf 151 Byte gefallen. Es gibt vier brauchbare Sicherungen (17.09., 22.09.; zwei ältere 26.08., 31.08.) und **keine** Prüfung „Abschnittszahl und Referenzzahl unverändert?" | **M, offen** - in einem Punkt aber **entschärft**: ein Schreiben wirkt **ohne Neustart** (der laufende Prozess hat die um 10:35 geschriebene Datei neu geladen), eine Reparatur braucht also keinen - wichtig, weil **H1** einen Neustart ohnehin verbietet. Empfehlung: vor **jedem** Schreiben eine Kopie `settings.yaml.<ISO-Zeit>.bak`, danach der Vergleich; zwei Zahlen, die sich nicht ändern dürfen: **Abschnitte = 9**, **Referenzen = 13** | `node docs\protokoll\aufsicht\werkzeuge\settings-vergleich.mjs` gegen die jüngste Kopie, `zugangs-lage.mjs` für die Referenzen |
| **V4/V5** | **Sein Nachweis ist reproduziert** — über **15 Stunden** und bei laufender Arbeit: Export- und Inhalts-Digest, 20 Dateien / 223'508 B, Rückexport **identisch** zum Dokument von 00:2x. Mit festem `--created-at` sind die Bündel sogar **bit-gleich** (`06a69695…`) — seine Prosa in §1 bestreitet das zu allgemein, **sein eigener Test** behauptet es. Und `bun test` → **158 pass · 0 fail · 380 Prüfaufrufe · 6 Dateien**, exit 0, wie dokumentiert | **Die stärkste Form, die ein Nachweis haben kann: wiederholbar, nicht einmalig gelungen.** Die Suite habe ich bewußt gewählt (0 geänderte Dateien unter `packages/units/`) — nach **seiner eigenen** Regel aus §5 gegen Tests über einen halbfertigen Stand | zweimal exportieren mit **festem** `--created-at`, dann `Get-FileHash` beider Bündel vergleichen |

| **B22** | **erledigt** — die Waisen sind **erklärt** (B23), **aufgeräumt** und die Ursache ist **behoben**: um 13:41:50 noch **sechs** (1,13 GB, Alter bis 11,4 min), um 13:42 **null**; sein Lauf um 13:43 hinterließ **drei** weitere (591,1 MB, Ports 5780/5781/5790), auch die sind um **14:12 weg** (null Hosts, null Launcher, 0,0 MB). Der Nachzähl-Schritt, den ich empfohlen hatte, steht jetzt **im Skript** (Zeilen 189–198) | Sechs Hosts = sechs Ports, sechs Harness-Homes, **1,13 GB**; dazu blockierten sie die eigenen nächsten Läufe (Fall 1 fiel deshalb um). **Bleibt nützlich:** [`hilfen/waisen-aufraeumen.ps1`](hilfen/waisen-aufraeumen.ps1) als Netz — Herkunft entscheidet, das Alter siebt nur die Kinder eines laufenden Tests aus (Trockenlauf; `-Anwenden` beendet) |
| **B16** | **ERLEDIGT 15:14 (`a0524f4`)** — er hat die README-Zeile berichtigt und die Korrektur **behalten**: der alte Satz bleibt stehen, der Vermerk steht darunter (Hausregel H6, von ihm angewendet). Ursprünglich: ~~„API ausgefallen" ist nicht belegt~~ → **widerlegt**. Angemeldet an ihrem **laufenden** Host antwortet `POST /api/goals/create` mit **HTTP 200 und JSON-RPC-Rahmen**: der Typert-Gateway **lebt**. Die README-Zeile „API des Cores ausgefallen" ist damit **falsch**, und die Begründung der Entscheidung „eigener Endpunktweg" („die Vorlage hat keine erreichbare API") **hinfällig** — die Entscheidung selbst bleibt legitim | Die eigene Sonde konnte es nicht sehen: ohne Anmeldung ist **jeder** `/api/*`-Pfad 401, mit Anmeldung sind ihre 19 **geratenen** Pfade 404. Nur ein **registrierter** Pfad antwortet. **Auch der WS-Teil ist geklärt:** er mißt mit Anmeldung `HTTP/1.1 101 Switching Protocols` (`api-flaeche.md:122`) — mein Vorbehalt war die **schwächere** Messung | `bun run docs\protokoll\aufsicht\werkzeuge\api-erreichbarkeit.mjs http://127.0.0.1:<port>` (mit Token) |
| **B13** | **von sechs Stellen sind drei übrig — trotz Commit-Nachricht „B13 behoben"** (gemessen 14:08; bereinigt wurde nur `port-test.ps1`). `port-test.ps1` ist **bereinigt** (die Namens-und-Alter-Zeilen sind weg — Verdienst des bauenden Agenten). **Offen:** `boot-schleife.ps1:103` (2 min), `api-test.ps1:33` (3 min), `api-flaeche.ps1:92` (3 min) | Diese drei töten weiterhin **jeden** `bun` im Fenster — auch einen fremden `bun test`/`bun install` und **den Zeugenprozess, den der bauende Agent gerade selbst benutzt**, um genau diese Frage zu prüfen | `Get-ChildItem -Recurse -Include *.ps1 \| Select-String 'Get-Process bun'` |
| **B19** | **erledigt** — der bauende Agent hat die Anmeldesperre über den **Zaun des Cores** gebaut (`requestRejection`, danach Anmeldung) und bei fehlendem Dienst **Fail-closed 503**. Die Umsetzung ist besser als die Empfehlung; ich rechne sie mir **nicht** zu (seine Sonde lief vor meinem Befund) | — | `Select-String -Path packages\api\health\src\index.ts -Pattern 'requestRejection'` |
| **B20** | **BEHOBEN 13:59 (`b75c9f6`) — und besser als vorgeschlagen:** dritter Zustand `ungeprueft`, `STANDARD_MINDEST_SONDEN = 1`, Abschalter `PMH_READY_REQUIRE_PROBES=0`. Der ursprüngliche Befund: **zwei eigene Artefakte widersprachen sich:** `/api/ready` liefert bei **null Sonden** `bereit: true` + HTTP 200 (so steht es im **Test**: „nichts zu prüfen — und das ist bereit"), während die **`.env.example`** sagt, der Endpunkt melde `ok`, „statt ‚bereit' zu behaupten" | Ein Orchestrator liest den **Statuscode** und das Feld `bereit` — beide sagen „ja", obwohl nichts geprüft wurde. Kleine Auswege: an `sonden.length > 0` binden (503) · `null` als dritter Zustand („nicht geprüft") · oder nur den Wortlaut der Vorlage an den Code anpassen | `Select-String -Path packages\api\health\src\index.ts -Pattern 'bereit:'` |
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
| **Bestehen die 15 Vertragstests von `native/flock`?** | **nicht prüfbar auf dieser Maschine** — Windows kennt `flock(2)` nicht und kompiliert die Suite weg (`running 0 tests`), WSL Ubuntu hat keinen Rust-Compiler (Befund **B24**). Der Vertrag ist damit auf dieser Maschine **unverifiziert**, nicht falsch |

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

**Sind meine offenen Befunde noch offen?** Ein Aufruf, zwölf Prüfungen — je Befund die eine Tatsache, auf
der er steht. Alles lesend; meldet `BEHOBEN` und endet mit Rückgabewert **1**, sobald einer erledigt ist:

```powershell
cd C:\Users\Chang\prometheus-harness\docs\protokoll\aufsicht
node werkzeuge\stand-abgleich.mjs
```

**Ein Crate prüfen, ohne den fremden Baum anzufassen** (Vorbild: `native/flock`, Befund **B24**). Die
Kopie liegt außerhalb des Repos, `CARGO_TARGET_DIR` ebenfalls — es wird **nichts** im Baubereich
geschrieben:

```powershell
$tmp = "$env:TEMP\pmh-flock-probe"
New-Item -ItemType Directory -Path "$tmp\native" -Force | Out-Null
Copy-Item C:\Users\Chang\prometheus-harness\Cargo.toml "$tmp\Cargo.toml"
Copy-Item C:\Users\Chang\prometheus-harness\native\flock "$tmp\native\flock" -Recurse
$c = (Get-Content "$tmp\Cargo.toml" -Raw) -replace '(?s)members = \[.*?\]', 'members = ["native/flock"]'
Set-Content "$tmp\Cargo.toml" -Value $c
$env:CARGO_TARGET_DIR = "$tmp\target"
cargo test -p pmh-flock --manifest-path "$tmp\Cargo.toml"   # Windows: contract.rs -> running 0 tests
```

**Leckprüfung** — echte Werte gegen **alle** Commits, den verfolgten Arbeitsbaum und die unverfolgten
Dateien. `--vorlage` trennt veröffentlichte Standardwerte von Geheimnissen; **ohne diese Trennung meldet
das Werkzeug jeden Platzhalter als Leck** (eigener Fehler um 14:20):

```powershell
cd C:\Users\Chang\prometheus-harness
node docs\protokoll\aufsicht\werkzeuge\leck-pruefung.mjs C:\Users\Chang\prometheus-harness `
  .env C:\Users\Chang\.dsh\.credentials.yaml C:\Users\Chang\.pmh\.credentials.yaml --vorlage .env.example
```

**Kennwörter eines laufenden Stapels drehen — ohne Datenverlust** (Befund **B26**/**B28**). Ohne
`--anwenden` nur Trockenlauf. Das Werkzeug **meldet selbst**, wenn `pg_hba.conf` auf `trust` steht — dann
wäre die Drehung kosmetisch, und es verweigert die Erfolgsmeldung:

```powershell
cd C:\Users\Chang\prometheus-harness\docs\protokoll\aufsicht
node hilfen\kennwoerter-drehen.mjs --env C:\Users\Chang\prometheus-harness\.env            # Trockenlauf
node hilfen\kennwoerter-drehen.mjs --env C:\Users\Chang\prometheus-harness\.env --anwenden  # dreht
```

**Größe und Fortschritt zweier Bäume** — die Größe vergleicht Installiertes, nicht Geleistetes
(Befund **B27**):

```powershell
foreach ($t in 'C:\Users\Chang\prometheus-harness','C:\Users\Chang\harness\prometheus-harness') {
  foreach ($teil in '','node_modules','.git','target','docs','packages','services','native','apps') {
    $p = if ($teil) { Join-Path $t $teil } else { $t }
    if (-not (Test-Path $p)) { continue }
    $f = Get-ChildItem $p -Recurse -File -Force -ErrorAction SilentlyContinue
    "{0,-16} {1,-12} {2,7} Dateien {3,9:N0} MB" -f (Split-Path $t -Leaf), $teil, $f.Count, (($f | Measure-Object -Sum Length).Sum / 1MB)
  }
}
git -C C:\Users\Chang\prometheus-harness rev-list --count HEAD
git -C C:\Users\Chang\prometheus-harness diff --shortstat (git -C C:\Users\Chang\prometheus-harness rev-list --max-parents=0 HEAD) HEAD
```

> **Zur Ausführungsrichtlinie.** Auf diesem Rechner steht `CurrentUser = Restricted` (und schlägt das
> `LocalMachine = RemoteSigned`): eine `.ps1` läuft **nur** mit `-ExecutionPolicy Bypass`. Das gilt für
> **jede** `.ps1` dieses Projekts, auch für `scripts/port-test.ps1` — ohne den Schalter bricht sie schon
> beim Laden ab. Meine eigenen Werkzeuge sind deshalb `.mjs` und brauchen den Schalter nicht.

**Hausregeln der Aufsicht:** kein Neustart von DSH/`~/.dsh`/`~/.pmh`, solange der andere Agent
arbeitet (**H1**); kein Schreiben in dessen Baubereich (**H2**); keine Geheimwerte in Protokollen
(**H4**); Korrektur statt Löschung eigener Fehler (**H6**). Vollständig in
[`README.md`](README.md) §2.
---

## 6. Bilanz dieser Sitzung (13.10.2026)

> **Wofür dieser Abschnitt da ist.** Die Handlungsliste in §0 sagt, was **jetzt** zu tun ist. Hier steht,
> was diese Aufsicht **insgesamt** vorgelegt hat — damit ein Nachfolger nicht alles nachlesen muß.

**Die Spur, in Zahlen** (gemessen am 13.10.2026, 15:21):

| Größe | Wert |
|---|---|
| Befundabschnitte | **33** (`B1`–`B34`, ohne das zurückgezogene `B7`) |
| Verifikationen | **7** (`V1`–`V7` — geprüfte Behauptungen des Bauenden, kein Befund) |
| eigene Korrekturen | **29** Zeilen in der H6-Tabelle (Fehler **der Aufsicht**) |
| Dateien | **28** — alle versioniert |
| Chronik | **201** JSONL-Zeilen + dieselbe Zahl Abschnitte in `protokoll.md` |
| Umfang | **703 KB** |
| Werkzeuge / Hilfen | **13 / 6** |

**Was der bauende Agent auf Grund dieser Befunde erledigt hat** (jeweils gemessen, nicht behauptet):

| Befund | Stand |
|---|---|
| **B16** „API ausgefallen" | **vollständig erledigt** (`a0524f4`): README berichtigt, alter Satz **bleibt stehen** samt Vermerk, Fundstelle genannt — und der WS-Teil, den ich offen ließ, ist durch **seine** Messung geklärt (`101 Switching Protocols`) |
| **B20** zwei widersprüchliche Artefakte | **erledigt — besser als vorgeschlagen**: dritter Zustand `ungeprueft`, `STANDARD_MINDEST_SONDEN = 1`, Abschalter |
| **B23** `$pid` schreibgeschützt | **erledigt** bis auf `$script:fehler`; die undichte Rückgabe hat er **tiefer** geheilt als verlangt |
| **B22** Waisen der Port-Tests | **erledigt** — Waisenprüfung steht jetzt im Skript, 0 Waisen gemessen |
| **B13** Töten nach Name und Alter | **teilweise**: `port-test.ps1` bereinigt, **drei** Messsonden offen |
| **B19** Zaun + Anmeldung | **erledigt** (seine Umsetzung war besser als die Empfehlung) |
| **B26** Kennwörter aus der Vorlage | **Ursache erledigt** (sein CRLF-Fix) — die **Wirkung** hängt an **B28** |

**Was offen bleibt — und ausdrücklich beim Betreiber oder beim bauenden Agenten liegt:** die neun Punkte
in §0. Die Schlussmessung des Standabgleichs ergab: **12 von 12 unverändert offen**, keiner still erledigt.

**Was diese Rolle geliefert hat, das bleibt:**

1. **Die Handlungsliste** (§0) — neun Punkte, nach **Wirkung** sortiert, jeder mit Befehl.
2. **Der Standabgleich** (`werkzeuge/stand-abgleich.mjs`) — prüft in einem Aufruf, ob ein offener Befund
   noch offen ist. Er kann jederzeit laufen und meldet selbst, wenn einer erledigt wurde.
3. **Die Leckprüfung** (`werkzeuge/leck-pruefung.mjs`) — definitiver Negativbefund: **14 echte Geheimwerte,
   0 Treffer** in 53 Commits und im ganzen Arbeitsbaum.
4. **Zwei geprüfte Hilfen**, die der Betreiber ohne mich benutzen kann:
   `hilfen/kennwoerter-drehen.mjs` (Drehung ohne Datenverlust, beide Zweige ausgeführt) und
   `hilfen/waisen-aufraeumen.ps1` (Aufräumen **nach Herkunft**, nicht nach Name und Alter).
5. **Der Beleg, daß es auch andersherum geht:** zwei **eigene** Befunde mußte ich zurückziehen —
   die B22-Hypothese (falscher Mechanismus) und die B26-Anmeldebehauptung (mein Test prüfte kein
   Kennwort, `pg_hba: trust`). Und **fünf** eigene Ankerfehler stehen in der Korrekturtabelle. Die
   Aufsicht, die Fehler bei anderen sucht, führt ihre eigenen vollständig.
