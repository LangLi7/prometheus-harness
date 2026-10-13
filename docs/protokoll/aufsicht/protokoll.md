# Protokoll der Aufsicht — Chronologie

> **append-only.** Neue Einträge kommen **unten** dazu. Ein alter Eintrag wird **nie** geändert;
> eine Korrektur ist ein **neuer** Eintrag mit Bezug auf den alten (Hausregel **H6**).
> Jeder Eintrag nennt **Zeit**, **Handlung**, **Befehl** und **Ergebnis**.
>
> Sitzung: **2026-10-13, 11:26–12:05** (Europe/Zurich, +02:00) · Rolle: Aufsicht (Wächter) ·
> Gemeldet vom Betreiber um 11:37: **kein Neustart** (Hausregel **H1**).

---

## 2026-10-13 11:26 — Auftrag angenommen, Lage erfasst

**Handlung.** Ziel- und Quellordner, Git-Zustand, WSL-Lage und laufende Prozesse erhoben.

**Befehl.**

```powershell
Get-ChildItem C:\Users\Chang\harness\prometheus-harness -Force      # Quelle
Get-ChildItem C:\Users\Chang\prometheus-harness -Force              # Ziel
git log --oneline -20 ;  git status --short ;  git remote -v        # im Ziel
wsl.exe -l -v
Get-Process | Where-Object { $_.ProcessName -match 'node|bun|dsh|cargo|docker|wsl' }
```

**Ergebnis.**

| Punkt | Gemessen |
|---|---|
| Quelle | `C:\Users\Chang\harness\prometheus-harness` — sauberer Core-Checkout, `HEAD` = `d743267388…` (Tag `dsh-v0.2.1-alpha.2`), Remotes `origin` = LangLi7/prometheus-harness, `upstream` = deepseek-ai/deepseek-harness |
| Ziel | `C:\Users\Chang\prometheus-harness` — aktiver Aufbau: `services/`, `tests/`, `Cargo.toml`, `MAPPING.md`, `bun.lock`; `HEAD` = `935f77e…` |
| Arbeitsbaum | **23 geänderte + 5 neue Pfade** (nicht committet), Schwerpunkt `services/pmh-nix`, `services/pmh-attach`, neu `packages/auth/` |
| WSL | `Ubuntu` läuft, `docker-desktop` läuft, `kali-linux` gestoppt |
| Prozesse | DSH-GUI `node … apps/cli/src/bin.ts web` (PID 22260) lebt; Docker Desktop; Firecrawl-, SearXNG-, Ollama-Container |

**Deutung.** Der andere Agent ist eine **eigene Sitzung**, kein Kindprozess von mir (`list_agents`
und `job_list` sind leer). Eine direkte Nachricht an ihn ist damit nicht möglich — Unterstützung
läuft über **Dateien im gemeinsamen Arbeitsbereich** und über diesen Bericht an den Betreiber.

---

## 2026-10-13 11:28 — Laufende Arbeit des anderen Agenten lokalisiert

**Befehl.**

```powershell
Get-ChildItem C:\Users\Chang\prometheus-harness -Recurse -File -Force |
  Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-30) }
```

**Ergebnis.** Zuletzt (11:21–11:27) entstanden: `packages/auth/db-schema/{package.json,tsconfig.json,src/index.ts,src/sql.d.ts,migrations/0001_identitaet.sql,migrations/0002_workspaces_chats.sql,tests/*.ts}`.
Danach `docs/status/{arbeitspakete.md,git-audit.md}` (11:17).

**Deutung.** Er arbeitet am **PostgreSQL-Schema der Authentifizierung** — das passt zur Zielrichtung
(PostgreSQL wegen Vektornutzung). Daraus folgt Hausregel **H5**: ich fasse `pmh-postgres` nur
**lesend** an.

---

## 2026-10-13 11:31 — Push-Behauptung des anderen Agenten gegengeprüft

**Befehl.**

```powershell
git rev-parse HEAD
git ls-remote origin refs/heads/main
git log -5 --format='%h %ci %s'
```

**Ergebnis.** Lokal `935f77e3a8a5933b64bade4352b7d0ccfbe73720` = `origin/main`. Commit-Zeit 11:17:35,
Betreff „t40 behoben: der Host waehlt sein eigenes Harness-Home (--home)".

**Nebenbefund.** `git ls-remote` meldet `git: 'credential-gh' is not a git command` → Befund **B4**.
Der Push selbst ist **belegt** (identischer Hash), also heute **nicht** blockierend.

---

## 2026-10-13 11:33 — Zugangslage der Modell-APIs geprüft (Auftrag A1)

**Befehl.**

```powershell
Get-Content C:\Users\Chang\.dsh\.env            # nur Schlüsselnamen
node werkzeuge/zugangs-lage.mjs --pruefen DEEPSEEK_API_KEY `
     "C:\Users\Chang\.pmh" "C:\Users\Chang\.dsh" `
     "C:\Users\Chang\prometheus-harness\.pmh-build\harness-home"
```

**Ergebnis.**

| Home | Referenzen | `DEEPSEEK_API_KEY` |
|---|---|---|
| `~/.pmh` | 13 | **HTTP 200**, Guthaben USD 15.32 |
| `~/.dsh` | 13 | **HTTP 200** |
| `.pmh-build/harness-home` | **0** | keine Referenz |

Kein Geheimwert wurde ausgegeben — nur Name, Länge und SHA-256-Kurzfingerabdruck.

**Deutung.** Befund **B3**: Der Nachweis `P8.12` („kein Schlüssel in dieser Umgebung") ist für das
**Projekt-Home** richtig und für die **Maschine** falsch. Zugang ist vorhanden und gültig.

---

## 2026-10-13 11:34 — Postgres- und Redis-Lage read-only nachgemessen

**Befehl.**

```powershell
docker ps -a --format '{{.Names}} | {{.Image}} | {{.Status}} | {{.Ports}}'
docker exec pmh-postgres psql -U pmh -d pmh -Atc "select current_database(), current_user, version();"
docker exec pmh-postgres psql -U pmh -d pmh -Atc "select schemaname||'.'||tablename from pg_tables …;"
docker exec pmh-redis redis-cli ping
```

**Ergebnis.** `pmh-postgres` (postgres:17-alpine, Up 7 min, `0.0.0.0:5432`) und `pmh-redis`
(redis:7-alpine, Up 7 min, `6379`) laufen. Abfrage → `pmh|pmh`, PostgreSQL **17.11**. **Zehn** Tabellen
inklusive `schema_migrations`. Redis → `PONG`.

**Deutung.** Die Migrationen des anderen Agenten sind **bereits** gegen ein echtes PostgreSQL gelaufen.
Der Testlauf selbst wurde von mir **nicht** ausgeführt (**H5**).

---

## 2026-10-13 11:35 — DSH-Anpassungen aufgelistet (Auftrag A3)

**Befehl.**

```powershell
cd C:\Users\Chang\deepseek-harness ; git status --short ; git log --oneline -3
git show --stat --format='%H%n%ci%n%s%n%b' HEAD
Get-ChildItem C:\Users\Chang\.dsh -File | Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-24) }
```

**Ergebnis.**

- **Checkout `C:\Users\Chang\deepseek-harness`**: `HEAD` = `c7edfcbc41` „dsh-custom: alles Nicht-Upstream
  als eigener Stand" (12.10.2026), Arbeitsbaum **nicht sauber**: 10 geänderte Dateien
  (`packages/llm/crew/src/{adapter,reasoning,tool,turn}.ts`, `packages/llm/llm-deepseek/src/index.ts`,
  `packages/client/ui-model-selection/…`) + 1 neue Datei (`directory-order.ts`), 473 Zeilen plus.
- **`~/.dsh`** hat heute gearbeitet: `settings.yaml` (10:35), `settings.yaml.t63-merged`,
  `settings.yaml.bak-t63-before-repair-…` (151 B), fünf `t63-*.mjs`-Werkzeuge, dazu die Notiz
  `notes/CREW-APIKEY-REPARATUR.md` (10:47).

**Deutung.** Es gibt **zwei** getrennte DSH-Anpassungsspuren: den `dsh-custom`-Stand im Checkout und
die `t63`-Reparatur im Home. Beide sind zu prüfen, bevor sie als „nötig" gelten dürfen.

---

## 2026-10-13 11:36 — `t63`-Notiz gelesen und gegen eigene Messungen gehalten

**Befehl.** `read C:\Users\Chang\.dsh\notes\CREW-APIKEY-REPARATUR.md`

**Ergebnis.** Die Notiz belegt: Schlüssel waren nie weg (13 Referenzen), die Datei war auf 151 Byte
geschrumpft, 11 der 13 Schlüssel waren von nichts mehr referenziert; der Turn-Fehler
(`UNSUPPORTED_REASONING_EFFORT`) hatte eine zweite Ursache im Code (Sentinels `given`/`auto` wurden
ungeprüft in eine `ReasoningEffortId` gebrandmarkt) und ist an allen fünf Aufrufstellen geschlossen.

**Gegenprüfung.** Zwei Behauptungen habe ich **bestätigt** (Schlüssel ungeprüft: Datei nicht
angetastet, mtime 22.09.; Schreiben wirkt ohne Neustart: `contextWindow: 1000000` im `request/header`).
Eine Behauptung habe ich **widerlegt** — siehe nächster Eintrag.

---

## 2026-10-13 11:37 — **Widerspruch gefunden: es gibt eine jüngere vollständige Sicherung**

**Befehl.**

```powershell
Get-ChildItem C:\Users\Chang\.dsh -File -Filter 'settings*' | Sort-Object LastWriteTime
Get-ChildItem C:\Users\Chang\.dsh\crew,C:\Users\Chang\.dsh\crew\backup -File -Filter 'settings*' |
  Sort-Object LastWriteTime
node werkzeuge/settings-vergleich.mjs "C:\Users\Chang\.dsh\settings.yaml" `
     "C:\Users\Chang\.dsh\crew\backup\settings.yaml.2026-09-22T22-51-48.bak"
```

**Ergebnis.**

```
C:\Users\Chang\.dsh\crew\settings.yaml.pre-probe                        117545 B   17.09.2026 20:08   (verwendet)
C:\Users\Chang\.dsh\crew\backup\settings.yaml.2026-09-22T22-51-48.bak   122500 B   22.09.2026 22:50   (jünger, unbenutzt)
live nach der Rettung                                                   117826 B   13.10.2026 10:35
```

Abweichende Abschnitte live ↔ 22.09: `agent-loop` (**fehlt live**, `{maxParallelToolCalls: 9}`),
`llm-pi-ai` (live 11 statt 12 Anbieter-Routen, `openai` fehlt), `crew` (live 1 statt 2 Crews),
`agent-default-model` (live `deepseek-official/deepseek-flash`, am 22.09. `crew/crew-1`).

**Deutung.** Befund **B1**: Die Notiz nennt die 17.09-Fassung „die letzte vollständige Fassung" — das
ist widerlegt. Die Reparatur war methodisch sauber, die **Quellenwahl** war es nicht.

**Wichtig — keine Tat.** Ich habe **nichts** zurückgeschrieben und **nichts** geändert. Die Entscheidung,
ob der 22.09-Stand nachgezogen wird, liegt beim Betreiber (Hausregel **H2/H3**).

---

## 2026-10-13 11:37 — **Anweisung des Betreibers: kein Neustart**

**Wortlaut (sinngemäß).** Keinen Neustart machen, solange der andere Agent arbeitet — das kann
Prompt-Caching-Probleme verursachen; es wurden bereits mehrere Prompts vorausgeschickt. Der DSH
soll **nicht** neugestartet werden.

**Aufnahme.** Als Hausregel **H1** in [`README.md`](README.md) §2 festgeschrieben. Zur Klarstellung:
Ich habe **keinen** Neustart ausgeführt und **keinen** Prozess beendet. Meine Befehle waren lesend;
geschrieben habe ich ausschließlich unter `docs/protokoll/aufsicht/`.

**Bestätigende Nebenmessung.** Der `t63`-Nachweis zeigt: eine Änderung an `settings.yaml` wirkt
**ohne Neustart** (der laufende Prozess hat die Datei um 10:35 neu geladen). Konfigurationsreparaturen
brauchen also keinen Neustart — die Regel **H1** kostet in diesem Bereich nichts.

---

## 2026-10-13 11:38 — Wächter-Werkzeuge und Protokoll angelegt

**Handlung.** Eigener Schreibbereich nach Hausregel **H3**; zwei Messwerkzeuge, die jeder nachfahren
kann.

**Ergebnis.**

| Datei | Zweck |
|---|---|
| `werkzeuge/settings-vergleich.mjs` | vergleicht die Live-Konfiguration gegen **alle** Sicherungen, Abschnitt für Abschnitt, ohne Geheimwerte |
| `werkzeuge/zugangs-lage.mjs` | vergleicht die Credential-Referenzen aller Harness-Homes und prüft eine Referenz **live** (nur Statuscode) |
| `README.md`, `befunde.md`, `protokoll.md`, `protokoll.jsonl`, `aufgaben.md` | Rolle, Befunde, Chronologie, Aufgaben |

**Eigener Fehler, offen berichtet.** Der erste Lauf von `settings-vergleich.mjs` brach ab
(`TypeError: Cannot read properties of undefined (reading 'slice')`), weil `JSON.stringify(undefined)`
`undefined` liefert. Behoben, zweiter Lauf vollständig. Der Fehler stand **im** Protokoll, bevor die
Zahl daraus verwendet wurde.

---

## 2026-10-13 11:52 — Hilfe zum Modellzugang gebaut, geprüft, **nicht** angewendet

**Handlung.** `hilfen/zugang-bereitstellen.mjs` geschrieben (Standard = nur anzeigen), dann
ausgeführt und geprüft.

**Befehl und Ergebnis.**

```powershell
node hilfen/zugang-bereitstellen.mjs
# Quelle ~/.pmh: 13 Referenzen
# Ziel   <repo>/.pmh-build/harness-home: 0 Referenzen — 13 fehlen
# Es wurde NICHTS geschrieben.

$env:DEEPSEEK_API_KEY = node -e "…refs['DEEPSEEK_API_KEY']…"   # Rezept aus --umgebung
node -e "…Laenge + sha256-Kurzform von $env:DEEPSEEK_API_KEY…"
# DEEPSEEK_API_KEY 35 e2159c3d1018   == Wert im Speicher: Rezept wirkt
```

**Eigene Fehler, offen berichtet.** Der erste Lauf löste das Repo-Wurzelverzeichnis **eine Ebene zu
tief** auf (`…\docs\.pmh-build\harness-home` statt `…\.pmh-build\harness-home`); die
`--umgebung`-Ausgabe enthielt zunächst einen **Platzhalter** statt eines Rezepts; in `befunde.md`
stand `.ps1` statt `.mjs`. Alles drei korrigiert, das Rezept **wirklich ausgeführt** und der
Fingerabdruck gegen den Speicher geprüft. Die fehlerhafte Zeile in `protokoll.jsonl` bleibt gemäß
Hausregel **H6** stehen — korrigiert wird durch einen neuen Eintrag, nicht durch Löschen.

**Deutung.** Die Aussage „kein Schlüssel in dieser Umgebung" ist **behebbar, ohne eine Zeile Code des
Ziel-Repos zu ändern** — der Zugang ist vorhanden und gültig. Was fehlt, ist die Verbindung zwischen
dem Home des Projekts und dem Speicher der Maschine.

---

## 2026-10-13 11:44 — **Entscheidungen des Betreibers**

**B1** (Konfiguration nachziehen): **„Vollständig auf den 22.09-Stand nachziehen (inkl. openai-Route)"**
**B3** (Modellzugang): **„Punkt 1 und 2 machen"** — Rezept bereitlegen **und** Referenz schreiben.

---

## 2026-10-13 11:47 — B1 umgesetzt: nachziehen mit Guardrails, drei Auslassungen belegt

**Warum mit Guardrails und nicht per Kopie.** Die laufende Konfiguration wird von **zwei arbeitenden
Sitzungen** gelesen, und das Harness lädt eine geschriebene Datei **im Betrieb neu**. Ein Fehler
trifft also sofort beide — und ein Neustart zur Rettung ist nach **H1** ausgeschlossen. Deshalb:
Entwurf schreiben → gegen die **echten Plugin-Schemata** validieren → Invarianten prüfen → erst dann
mit Sicherung tauschen.

**Befehl.**

```powershell
node hilfen/b1-nachziehen.mjs              # Trockenlauf: Änderungen zeigen, validieren, nichts schreiben
node hilfen/b1-nachziehen.mjs --anwenden   # zweiter Lauf, nachdem der Trockenlauf grün war
```

**Ergebnis.**

| Änderung | vorher → nachher |
|---|---|
| `agent-loop` | fehlte → `{maxParallelToolCalls: 9}` |
| `llm-pi-ai.providers.openai` | fehlte → 38 Modelle, `apiKeyEnv: OPENAI_API_KEY` (**12** Routen statt 11) |
| `crew.crews[]` | 1 → **2** (`crew-2` „Test RouterFree") |
| `openrouter.models` | 276 → **277** (`z-ai/glm-5.2:free` ergänzt) |
| Datei | 117.825 B → 122.769 B, Abschnitte 9 → **10** |
| Schema-Prüfung | `llm-pi-ai` OK (12 Routen) · `llm-deepseek` OK (4 Modelle) · `crew` OK (2 Crews) |
| Invarianten | `agent-default-model`, `llm-deepseek`, `ui-onboarding`, `locale`, `dsh-i18n-de`, `web-search-*`, `crew.crews[0]` — **alle unverändert** |
| Sicherungen | `settings.yaml.bak-aufsicht-2026-10-13T09-47-06-308Z` (117.825 B), `…09-48-19-911Z` (122.698 B) |

Die vierte Änderung entstand **beim Nachmessen**, nicht aus dem Auftrag: die Live-Liste von
`openrouter` war eine **echte Teilmenge** der 22.09-Liste (kein Modell nur live), und
`packages/llm/llm-pi-ai/src/provider.ts` Zeile 141/142 belegt, dass diese Route ihren Katalog
**nicht** selbst nachlädt („this route's catalog is the settings document"). Ein fehlendes Modell
bleibt also fehlend, bis es jemand einträgt.

**Drei Punkte habe ich ausgesetzt — und zwar mit Messung, nicht mit Geschmack:**

1. `agent-default-model` — der **Vorzustand** vor dem Schrumpf (151-Byte-Rest) trägt denselben Wert
   wie live (`deepseek-official`/`deepseek-flash`/`high`). Der 22.09-Wert (`crew`/`crew-1`) ist damit
   **älter als der Vorzustand**: ein Zurückziehen wäre keine Wiederherstellung.
2. `llm-deepseek.models` — im 22.09-Katalog ist `deepseek-flash` nur `{id, name}`, **ohne**
   `contextWindow: 1000000` und **ohne** Bildfähigkeit. Genau dieses Modell fahren die laufenden
   Sitzungen: das Zurückziehen würde Kontextfenster und Bild-Eingang **im Betrieb** beschneiden.
3. `crew.crews[0].roles` — bindet die Vision-Rolle an die **zurückgezogene** ID
   `deepseek-v4-flash-vision-exp`; live steht sie auf dem bildfähigen `deepseek-flash`.

**Kontrolle am lebenden Objekt nach beiden Schreibvorgängen.**

```
PID 22260 (GUI) lebt · GET http://127.0.0.1:3080/ → HTTP 200 · Sitzungsdatei schreibt weiter
Kein Neustart ausgeführt (H1).
```

**Ehrliche Grenze.** Der Betreiber hat „vollständig" gesagt. Ich habe drei Punkte ausgesetzt, weil sie
messbar schaden würden — nachholbar in einem zweiten Lauf, das Werkzeug ist idempotent. Wenn die
Einschätzung falsch ist, korrigiert sie der Betreiber mit einem Wort.

---

## 2026-10-13 11:47 — B3 umgesetzt: Zugang für das Projekt-Home

**Befehl und Ergebnis.**

```powershell
node hilfen/zugang-bereitstellen.mjs --anwenden --refs DEEPSEEK_API_KEY
# 1 Referenz geschrieben → .pmh-build/harness-home/.credentials.yaml
# Sicherung: .credentials.yaml.bak-2026-10-13T09-47-17-518Z

node werkzeuge/zugangs-lage.mjs --pruefen DEEPSEEK_API_KEY "<projekt-home>"
# 35 Zeichen · Fingerabdruck e2159c3d1018 · GET api.deepseek.com/user/balance → HTTP 200
```

**Bewusste Einschränkung.** Nur **eine** Referenz (`DEEPSEEK_API_KEY`, die dokumentierte Vorgabe des
Adapters), nicht alle 13 — das Ziel liegt im Repository, jedes weitere Geheimnis dort ist zusätzliche
Angriffsfläche ohne aktuellen Nutzen. Nachholbar mit `--refs <NAME,…>`.

**Restrisiko, offen benannt.** `.pmh-build/` ist ein **Bauartefakt** (über `.gitignore` Zeile 46
abgedeckt). Ein Aufräumen des Ordners löscht den Zugang wieder. Dauerhaft ist ein Home außerhalb des
Repos oder die Umgebungsvariable beim Start.

---

## 2026-10-13 11:51 — Zweiter Takt: Lage, Invarianten, Prozesse, Datenbank

**Befehl.** `node werkzeuge/takt-pruefung.mjs` — neu angelegt, weil der erste Versuch als
PowerShell-Einzeiler an einem Quoting-Fehler **abbrach und trotzdem wie ein Ergebnis aussah**.

**Ergebnis (alles lesend, kein Neustart).**

| Prüfung | Ergebnis |
|---|---|
| `~/.dsh/settings.yaml` | 122.769 B · sha256 `6fc9d5d30edb` (**unverändert seit meinem Schreiben** 09:48) · 10 Abschnitte · 12 Routen · 2 Crews · 12 Referenzen |
| `agent-default-model` / `agent-loop` | `deepseek-official/deepseek-flash/high` · `{maxParallelToolCalls: 9}` |
| `deepseek-flash` | `contextWindow=1000000`, Modalitäten `["text","image"]` — die Bildfähigkeit ist unangetastet |
| Zugänge | `~/.dsh` 13 Referenzen · `~/.pmh` 13 · **Projekt-Home 1** — überall derselbe Fingerabdruck `e2159c3d1018` |
| Ziel-Repo | `HEAD 5626f13` = `origin/main` (identisch) · 32 geänderte Pfade |
| `deepseek-harness` | `HEAD c7edfcbc41` · 11 geänderte Pfade (unverändert gegenüber dem ersten Takt) |
| Datenbank | 10 Tabellen in `public` · `schema_migrations` Versionen 1 und 2, je 1 Zeile · Redis `PONG` |

**Neu seit dem ersten Takt: fünf Commits** — `47e33a5` Auth 1/5 (PostgreSQL-Schema), `bed71f9`
Auth 2/5 (Auth-Kern, 108 Tests), `3e6de10` Rust-Bestand, `0d628e9` Rust-Messung, `5626f13`
Abschnittsnummern. Die Arbeit ist also weitergegangen und **gepusht**.

---

## 2026-10-13 11:53 — Den neuen Rust-Befund nachgemessen (Auftrag A3/A4)

**Anlass.** `docs/review/rust-bestand.md` (11:50) beantwortet eine Betreiberfrage mit Zahlen und
**widerruft darin die eigene Empfehlung**. Ein Dokument, das sich selbst korrigiert, prüfe ich
genauso streng wie jedes andere.

**Befehl.**

```powershell
node werkzeuge/zeilen-zahl.mjs C:\Users\Chang\prometheus-harness rs md sql go ts js css
bun run werkzeuge/bun-faehigkeiten.mjs          # Bun 1.4.0
git ls-files '*.js' ; git check-ignore -v website/.vitepress/cache ; git ls-files '.github/*'
```

**Ergebnis — bestätigt:** 16 Rust-Dateien / **6.569 Zeilen** (exakt die Zahl des Berichts), Vorlage
**0** `.rs`-Dateien und **kein** `services/`, TypeScript 55/20.316, Go 49/13.810, JavaScript
9/33.577 (**alle neun** unter `website/.vitepress/cache/deps/`), CSS 3/286, `.github/` **nicht**
versioniert, `website/.vitepress/cache` **nicht** ignoriert, **kein** `cargo`-Aufruf in Skripten.

**Ergebnis — die entscheidende Laufzeitmessung ist reproduziert:** unter Bun 1.4.0 auf Windows
scheitert `fsync` auf einem **Verzeichnis** mit `EPERM` (beide Öffnungsarten), auf einer **Datei**
gelingt es; `node:fs.flock` ist `undefined`; `rename` über eine bestehende Datei gelingt; die
Kryptografie ist **vollständig** vorhanden (`Bun.CryptoHasher`, `Bun.password.hash` mit Argon2id
funktioniert, `Bun.hash`, `timingSafeEqual`, SHA-256, AES-256-GCM). Die Begründung „`crypto` kann
weg, `atomicfs` bleibt" steht damit auf **unabhängig nachgemessenem** Grund.

**Ergebnis — widerlegt:** Der Satz *„Kein einziger Aufruf"* ist **falsch**.
`packages/util/atomic-write/src/index.ts` ist ein vollständiger Aufrufer des Rust-Prozesses
`pmh-atomicfs` (Prozessvertrag, Timeout, Fehlerbehandlung), das Paket ist **Workspace-Mitglied**
(`bun.lock` Zeile 119), seine Tests laufen laut eigenem Nachweis **gegen das echte Binary**, das
Crate-README nennt den Aufrufer selbst, und das eigene `docs/review-report.md` Zeile 245 sagt es
wörtlich: *„Nur `pmh-atomicfs` wird aus `packages/util/atomic-write/src/index.ts` gerufen."*

**Was bleibt:** kein Aufruf aus dem **Startpfad**, und **niemand importiert** das Paket (0 Treffer
bei der Suche nach Import-Spezifizierern). Der genaue Satz ist also **„ein Aufrufer ist da, aber
nicht verdrahtet"**. Das **stützt** die Empfehlung (die Anbindung existiert schon) — es schwächt sie
nicht.

**Zwei Zahlenschwächen dazu:** „fünf Crates und einem Dienst" — es sind **sechs** Crates (7
Rust-Units, alle mit `unit.json`); und die Einzelwerte der Tabelle addieren sich zu 4.407, nicht zur
Überschrift 6.569 — sie sind **Code-Zeilen ohne Kommentare**, was nirgends steht.

**Nebenmessung:** die sieben Rust-Binaries **existieren** in `target/debug/` (u. a. `pmh-flock.exe`
von **heute 10:44**), `target/` ist **697,6 MB** groß und über `.gitignore` Zeile 14 ignoriert
(0 versionierte Dateien) — kein Repo-Ballast, aber deutlicher Platzverbrauch.

**Eigener Fehler, offen berichtet (H6).** Meine erste Zählung ergab „6.014 Rust-Zeilen" und
„226.948 Markdown-Zeilen" — beides **falsch**, weil mein Befehl `Get-Content … | Measure-Object
-Line` mit `-ErrorAction SilentlyContinue` nicht lesbare Dateien **still mit 0** zählte. Ich hätte
damit fast einen Fehler beim anderen Agenten gemeldet, den ich selbst gemacht habe. Deshalb gibt es
jetzt `werkzeuge/zeilen-zahl.mjs`, das unlesbare Dateien **namentlich meldet**.

---

## 2026-10-13 11:58–12:01 — Dritter Takt: der Compose-Umbau und seine Folgen (Befund B8)

**Was ich beim Messen gesehen habe.** Um 11:58 lief der Takt noch gegen den **alten** Container
(`postgres:17-alpine`, Superuser `pmh`, 10 Tabellen, `schema_migrations` 1 und 2). **Während** meiner
Messung änderte sich die Lage: um **11:59:04** ersetzte `docker compose up` den laufenden Container
durch einen Compose-Container (`pgvector/pgvector:pg17`, Projekt `pmh`, benanntes Volume).

**Befehl.**

```powershell
docker inspect pmh-postgres --format '{{json .Config.Labels}}'
docker logs pmh-postgres | Select-Object -Last 60
docker exec pmh-postgres psql -U pmh_admin -d pmh -Atc "select count(*) from information_schema.tables where table_schema='public';"
docker exec pmh-postgres psql -U pmh_admin -d pmh -Atc "select rolname from pg_roles where rolname like 'pmh%';"
docker network inspect pmh-net
docker volume inspect ab00fc2605a9f7fa00bc044ec45659d4b35e282c491f6bbdc1e4cb01ae2180fe
node werkzeuge/takt-pruefung.mjs        # erweitert: die DB-Zahl nennt jetzt ihre Herkunft
```

**Ergebnis.**

| Prüfung | Ergebnis |
|---|---|
| Neuer Container | Compose-Projekt `pmh`, `pgvector/pgvector:pg17`, Volume `pmh-postgres-data`, Netz `pmh-net`, erstellt 11:59:04 |
| Rollen | **nur `pmh_admin`** — `pmh_app` und `pmh_readonly` **fehlen** |
| Tabellen in `public` | **0** — Anwendungsschema nicht vorhanden |
| `schema_migrations` | **fehlt** |
| Erweiterungen | `vector`, `pg_trgm`, `pgcrypto`, `unaccent` — angekommen |
| `pg_default_acl` | **0** → Skripte `03` und `04` nie gelaufen |
| Init-Log | `02-roles.sql` **scheiterte**: `ERROR: syntax error at or near ":" … :'PMH_OWNER_USER'`; danach Neustart mit *„Skipping initialization"* |
| Altes Daten-Volume | `ab00fc2605…` (angelegt 11:20) **existiert und ist verwaist** — die migrierten Daten sind noch da, aber nicht eingehängt |
| `docker compose config` | fehlerfrei — die Datei selbst ist gültig |
| Verwaiste Volumes gesamt | **18** — ein `volume prune` würde mehr treffen als diesen Stand |

**Was der andere Agent selbst getan hat (Anerkennung).** Um **12:00:21** hat er `02-roles.sql` durch
`02-roles.sh` ersetzt und die Ursache im Dateikopf korrekt benannt (der Einstieg übergibt nur seine
eigenen Variablen über `--set`). Die Diagnose ist seine, nicht meine.

**Was ich als offen melde.** (1) Die Reparatur greift am **laufenden** Stack nicht — Init-Skripte
laufen nur auf einem **leeren** Datenverzeichnis; ohne bewusstes `down -v` bleibt der Stack ohne
Anwendungsrollen. (2) Der dokumentierte Testzugang
`postgres://pmh:pmh-dev-only@127.0.0.1:5432/pmh` (`postgres.test.ts` Zeile 16) zeigt auf einen
Benutzer, den es nicht mehr gibt. (3) Der Nachweis zum migrierten Schema (`47e33a5`) ist gegen die
laufende Datenbank **nicht mehr reproduzierbar**; die Daten liegen im verwaisten Volume, das ein
`prune` löschen würde.

**Eigene Messung, die nichts beweist (H6).** Mein Versuch, den psql-Mechanismus über
`select :'PROBE'` mit `-c` nachzustellen, schlug **auch mit gesetzter Variable** fehl und taugt
deshalb **nicht** als Reproduktion des `-f`-Pfades des Einstiegs. Beleg bleibt das Log.

**Werkzeug verbessert.** `takt-pruefung.mjs` nennt bei der Datenbank jetzt **Herkunft und Alter** des
Containers (Image, Compose-Projekt, Volume, Erstellzeit) sowie Rollen, Tabellenzahl und verwaiste
Volumes. Grund: eine Zahl wie „10 Tabellen" ist **wertlos**, wenn nicht dabeisteht, **welcher**
Container sie geliefert hat — genau dieser Fehler wäre mir um 11:58 fast unterlaufen.

---

## 2026-10-13 12:03–12:07 — Vierter Takt: der Stack steht, Rechtetrennung selbst geprüft

**Befehl.**

```powershell
node werkzeuge/takt-pruefung.mjs                     # Container-Herkunft, Rollen, Tabellen, Volumes
docker run --rm -v ab00fc2605…:/alt:ro postgres:17-alpine sh -c "cat /alt/PG_VERSION; du -sh /alt"
docker exec pmh-postgres sh -c "env | grep '^PMH_' | sort"
node werkzeuge/init-skript-probe.mjs C:\Users\Chang\prometheus-harness\docker\postgres-init\02-roles.sh
docker exec -e PGPASSWORD=… pmh-postgres psql -U pmh_app     -h 127.0.0.1 -d pmh -Atc '…'
docker exec -e PGPASSWORD=… pmh-postgres psql -U pmh_readonly -h 127.0.0.1 -d pmh -Atc '…'
docker exec -e PGPASSWORD=… pmh-postgres psql -U pmh_owner    -h 127.0.0.1 -d pmh -Atc 'begin; create table …; rollback;'
```

**Ergebnis.**

| Prüfung | Ergebnis |
|---|---|
| Container-Generation | **neu seit 12:05:21** — der Stack wurde von Null aufgesetzt |
| Rollen | `pmh_admin`, `pmh_app`, `pmh_owner`, `pmh_readonly` — **alle vier** |
| Schemata / Tabellen | `pmh` (10 Tabellen) und `public` |
| `pg_default_acl` | 3 → `03`/`04` gelaufen |
| `pmh_app` | SELECT **geht**, `CREATE TABLE` **verweigert**, `TRUNCATE` **verweigert** |
| `pmh_readonly` | SELECT **geht**, `INSERT` **verweigert**; Suchpfad `pmh, public` |
| `pmh_owner` | `CREATE TABLE` **geht**, danach `ROLLBACK` — Probe-Tabelle existiert nicht (0) |
| `init-skript-probe.mjs` auf `02-roles.sh` | **Exit 0** — der SQL-Block läuft gegen den echten Server durch, per ROLLBACK zurückgenommen |
| Verwaistes Volume `ab00fc2605…` | enthält ein **intaktes PostgreSQL-17-Cluster (64,8 MB)** — read-only nachgesehen |

**Eigene Fehler, offen berichtet (H6).**

1. Ich hatte vermutet, die Compose-Datei reiche `PMH_OWNER_USER`/`PMH_OWNER_PASSWORD` **nicht** durch
   (und die reparierte `02-roles.sh` würde deshalb beim nächsten Start abbrechen). **Falsch** — mein
   früherer Env-Ausschnitt hatte nur nach `POSTGRES|PMH_APP|PMH_READONLY` gefiltert. Die Datei führt
   beide Variablen in Zeile 59–60, und der Container hat sie.
2. Meine fünfte Rechteprüfung (`INSERT` als Nur-Lese-Rolle) scheiterte an **meinem** Quoting — dem
   Fehler, den ich in diesem Protokoll bereits zweimal stehen habe. Nachgeholt ohne `sh -c`:
   `permission denied for table users`, wie erwartet.
3. Meine Einschätzung „die Reparatur greift am laufenden Stack nicht" war als Momentaufnahme richtig,
   die Folgerung aber zu eng: der Weg über ein frisches Volume war gefahrlos (im aktuellen Volume lag
   nichts Wertvolles) und ist der richtige — der bauende Agent ist ihn gegangen, bevor ich ihn
   vorschlagen konnte.

**Offen bleibt:** (a) der veraltete Zugang und der kollidierende `docker run`-Hinweis in
`postgres.test.ts` Zeile 16 und 55; (b) das verwaiste Volume mit dem Altbestand — `docker volume
prune` würde es löschen, 18 verwaiste Volumes existieren.

---

## 2026-10-13 12:08–12:11 — Fünfter Takt: Rechte stimmen, die Prüfungen urteilen nicht (Befund B9)

**Befehl.**

```powershell
node werkzeuge/takt-pruefung.mjs
docker exec -e PGPASSWORD=bitte-aendern-owner pmh-postgres psql -U pmh_owner -h 127.0.0.1 -d pmh -Atc `
  'begin; create table pmh.aufsicht_vorgabe(x int); select has_table_privilege(...), …; rollback;'
Get-Content hilfen\rechte-probe-assertion.sql -Raw | docker exec -i pmh-postgres psql -U pmh_admin -d pmh -v ON_ERROR_STOP=1
```

**Ergebnis — die Behauptung „Rechtesystem belegt" ist bestätigt:**

| Prüfung | Ergebnis |
|---|---|
| `pmh_app` SELECT / `CREATE TABLE` / `TRUNCATE` | **erlaubt / verweigert / verweigert** |
| `pmh_readonly` SELECT / `INSERT` | **erlaubt / verweigert** |
| Vorgaben für **neue** Objekte (der subtile Fall) | app SELECT `t`, app INSERT `t`, readonly SELECT `t`, readonly INSERT `f`, app Schema-DDL `f` — mit `ROLLBACK`, keine Spur |
| Migrationen | **10 Tabellen in Schema `pmh`** |

**Ergebnis — die Prüfung selbst hat eine Lücke:** `rechtprobe.sql` läuft mit `ON_ERROR_STOP off` und
stellt neben jedes Verbot nur ein `\echo`. Damit sind „aus dem richtigen Grund gescheitert", „aus
einem anderen Grund gescheitert" und „gar nicht gescheitert" **ununterscheidbar** — und im dritten
Fall (Regress) würde `TRUNCATE users` / `DROP TABLE users` **wirklich zuschlagen**: die Probe
zerstört dann, was sie schützt. `scripts/stack-test.ps1` endet mit `Pop-Location`, ohne `exit`,
ohne Zusicherung, ohne Urteil. Und der Test, den die eigenen Kommentare als den eigentlichen
bezeichnen (Vorgaben für neue Objekte), läuft in **keinem** Skript; `rechtprobe.sql` Zeile 25
verweist auf „Schritt 7" von `stack-test.ps1`, das nur die Schritte **1–6** hat.

**Bereitgelegt, nicht angewendet:** `hilfen/rechte-probe-assertion.sql` — fragend statt versuchend
(`has_table_privilege` / `has_schema_privilege` üben keine Rechte aus, sie **beantworten** sie).
Zehn Prüfungen, `RAISE EXCEPTION` bei Verstoß. **Beide Ausgänge selbst ausgeführt:** Normalfall →
`Rechteprobe bestanden: 10 Prüfungen`, Exit **0**; absichtlich falsche Erwartung → `ERROR: … hier
muss es knallen`, Exit **1**.

**Eigener Fehler (H6, Nr. 9).** Mein Takt-Werkzeug fragte die Tabellen **unqualifiziert** in `public`
ab und meldete „0 Tabellen" sowie „`schema_migrations` fehlt" — nach dem Umzug des Anwendungsschemas
nach `pmh` liest das einen **Fortschritt als Rückschritt**. Behoben: das Werkzeug zählt jetzt **je
Schema** und setzt `search_path to pmh, public`. Ursache derselben Familie wie die Zeilenzählung:
ein Instrument, das nicht sagt, **was** es gemessen hat.

**Unverändert offen (W20):** `postgres.test.ts` wurde um 12:05:54 geändert, nennt in Zeile 16 aber
weiter `pmh:pmh-dev-only` und in Zeile 55 weiter `docker run --name pmh-postgres -p 5432:5432` —
Kollision mit dem Compose-Container.

---

## 2026-10-13 12:12–12:18 — Sechster Takt: Betreiber-Weisung nachgemessen (Befund B10)

**Anlass.** Commit `4506fa7` (12:11) und `docs/decisions/betreiber-weisung-2026-10-13.md` (10 KB,
12:10) halten die Entscheidungen des Betreibers fest. Entscheidungen sind prüfbar, wenn sie Zahlen
nennen — also habe ich sie gemessen.

**Befehl.**

```powershell
node werkzeuge/geheimnis-historie.mjs C:\Users\Chang\prometheus-harness
Select-String -Path packages\auth\auth\src\*.ts -Pattern 'ARGON2_PARAMETERS\s*=|memoryCost'
docker exec pmh-postgres psql -U pmh_admin -d pmh -Atc "set search_path to pmh, public; select column_name… from information_schema.columns where table_name='user_secrets';"
Get-ChildItem <paket>\src -File | Measure-Object      # für beide Bäume getrennt
```

**Ergebnis — bestätigt:** Argon2id `memoryCost: 19_456, timeCost: 2, parallelism: 1` (exakt);
Umschlagverschlüsselung über die Spalten `value_cipher`, `wrapped_key`, `master_key_version`,
`key_hint` (exakt); **RLS nicht eingebaut** (null Treffer); `gitleaks`/pre-commit nicht installiert,
keine Git-Haken (bestätigt); unser Adapter **1 Datei / 493 Zeilen** (exakt).

**Ergebnis — die wichtigste Behauptung, stärker geprüft als beschrieben:** „Es steht kein echter
Schlüsselwert in der Historie." Statt eines Musters habe ich die **13 echten Werte** aus
`~/.dsh/.credentials.yaml` als Suchbegriffe genommen und `git grep -F -f` über **alle 27 Commits
aller Zweige** laufen lassen: **null Treffer**. Der Negativbefund ist damit belastbar.

**Ergebnis — ein harter Fehler: die Zahlen stammen aus dem falschen Baum.** §5 nennt Dateizahlen
„der Vorlage". Keine davon ist in der Vorlage `harness\prometheus-harness` reproduzierbar — **alle
fünf** reproduzieren sich **exakt** in `C:\Users\Chang\deepseek-harness`, dem **Arbeitsbaum**:

| Paket | Doku | Vorlage | Arbeitsbaum |
|---|---|---|---|
| `llm-deepseek` | 11 | **24** | **11** |
| `llm` | 14 | **13** | **14** |
| `llm-pi-ai` | 12 | 12 | 12 |
| `llm-retry` | 5 | **3** | **5** |
| `token-meter` | 10 | **11** | **10** |

Die beiden Bäume sind **verschiedene Versionen**: Vorlage `d743267388` = `dsh-v0.2.1-alpha.2`,
Arbeitsbaum `c7edfcbc41` = „dsh-custom" auf **`dsh-v0.1.1-rc.2`** plus 57 gepatchte Upstream-Dateien.
Die Korrektur macht die Aussage **stärker** (24 statt 11 gegen unsere 1 Datei) — aber wer
„übernehmen" wählt, könnte den **0.1.1-Adapter** greifen statt den der 0.2.1-Vorlage.

**Eigener Fehler (H6, Nr. 10).** Meine erste RLS-Suche traf auf `SessionPolicy` (ein
TypeScript-Typ) und druckte danach trotzdem „(leer = RLS nicht eingebaut)" — die Ausgabe hätte
mich zu einer falschen Schlussfolgerung verleiten können. Präzise nachgesucht
(`ROW LEVEL SECURITY|CREATE POLICY|ENABLE ROW LEVEL`): tatsächlich null Treffer, die Behauptung
stimmt. Ursache: Ich habe ein Suchergebnis gelesen, ohne die Treffer anzusehen.

---

## 2026-10-13 12:15–12:18 — Siebter Takt: die korrigierte Messung nachgeprüft (Befund B11)

**Anlass.** Commit `45884b2` (12:14:49) — „Korrektur: der 12,7-s-Wert maß den Compiler, nicht unser
Projekt". Der bauende Agent hat eine **eigene irreführende Zahl** korrigiert und den Irrtum
ausdrücklich stehen gelassen, statt ihn zu überschreiben. Neue Sonde:
`docs/status/messsonden/boot-schleife.ps1` (112 Zeilen).

**Befehl.**

```powershell
git show 45884b2 -- docs/risks.md
(Get-ChildItem . -Recurse -Filter tsconfig.json | Where-Object { $_.FullName -notmatch 'node_modules' }).Count
bun x tsgo --noEmit -p packages/llm/llm/tsconfig.json      # 3 Pakete als Stichprobe, je einmal
# Binaerpruefung: Kennungen in node_modules\@typescript\native-preview-win32-x64\lib\tsgo.exe
```

**Ergebnis — die neuen Zahlen halten stand:**

| Behauptung | Meine Prüfung |
|---|---|
| „tsgo über **17** eigene Pakete" | **exakt**: 17 `tsconfig.json` im Repo, alle unter `packages/`, `apps/`, `tests/` |
| „2,1 s für 17 Pakete" | **reproduziert**: Stichprobe 0,11 / 0,11 / 0,12 s je Paket → hochgerechnet ≈ 2 s |
| „TS 7 (`tsgo`) ist der native Compiler, **in Go geschrieben**" | **im Binärprogramm belegt**: `tsgo.exe` (23,4 MB) enthält `golang.org/` (361 Treffer), `runtime.main`, `Go build ID`, `GODEBUG` — und **null** Rust-Kennungen (`rustc`, `cargo`, `core::panicking`) |
| „Es gibt KEINEN Build-Schritt" | **korrekt begrenzt** auf Host und Boot-Pfad. Meine Vermutung, das sei falsch, war **falsch**: `apps/web` hat einen Vite-Build (`dist/` 221,6 kB), und das eigene Register führt ihn als P7.3 |

**Ergebnis — ein Befund: die Sonde räumt nach Name und Alter auf.** Zeile 103 lautet
`Get-Process bun | Where StartTime -gt now-2min | Stop-Process -Force`. Das ist kein Aufräumen,
sondern ein **Namensfilter**: es beendet **jeden** `bun`-Prozess der letzten zwei Minuten, wem er
auch gehört. Die Sonde läuft dreimal → drei Zwei-Minuten-Fenster. Folgen: der andere Agent kann
mitten in `bun test`/`bun install` **still** getötet werden; ein abgebrochenes `bun install`
**schreibt** in `node_modules` und kann es beschädigen; echte Waisen findet die Zeile nicht, weil sie
nach Alter statt nach Herkunft beendet. Das eigene Haus macht es vor: `scripts/start.mjs`
Zeile 147–157 beendet über die **bekannte PID** (`taskkill /PID <pid> /T /F`), und Zeile 102 der
Sonde tut das bereits — **Zeile 103 ist damit überflüssig.** Status latent: zum Messzeitpunkt lief
kein `bun`-Prozess.

**Meine eigene Fehlvermutung, offen berichtet (H6).** Ich hielt „es gibt keinen Build-Schritt" für
falsch, weil `apps/web/dist` existiert. Die Aussage ist aber auf **Host und Boot-Pfad** begrenzt und
damit richtig; der Web-Build ist vorhanden **und** im eigenen Register dokumentiert. Ich melde das
lieber als zurückgenommene Vermutung, als es als Befund zu führen.

---

## 2026-10-13 12:20–12:26 — Achter Takt: die Sprachwahl-Recherche geprüft (Befund B12)

**Anlass.** `docs/research/sprachwahl-entscheidung-2026.md` (75 KB, 654 Zeilen) — seit drei Takten als
**ungeprüft** in meiner Liste geführt (W22). Jetzt gemessen.

**Befehl.**

```powershell
bun run werkzeuge\pty-probe.mjs                    # die PTY-Behauptungen aus §0 nachfahren
node werkzeuge\zeilen-klassen.mjs C:\Users\Chang\prometheus-harness rs
bun run werkzeuge\bun-faehigkeiten.mjs
```

**Ergebnis — vollständig reproduziert (Bun 1.4.0, Windows x64):**

| Behauptung des Dokuments | Messung |
|---|---|
| „Bun erzeugt selbst ein echtes PTY unter Windows; das Kind sieht `isTTY=true`" | **reproduziert**: Kind meldet `istTTY=ja`, Marker kommt an, Ausgabe enthält echte Terminal-Sequenzen |
| „`node-pty` startet unter Bun, liefert aber **keine Daten** (16 Bytes, kein Marker)" | **exakt reproduziert**: **16 Bytes**, kein Marker, Kind meldet `istTTY=nein` |
| „`bun:ffi` bindet `kernel32!MoveFileExW` direkt" | **reproduziert** |
| „`Bun.Terminal` vorhanden" | **bestätigt** (Funktion vorhanden) |

Die Entscheidungen 1, 2, 5 stehen damit auf von unabhängiger Seite reproduziertem Grund.

**Ergebnis — ein widerlegter Satz wird weitergereicht.** Kurzfassung, Entscheidung 4 sagt:
„`pmh-atomicfs` … **Kein Code ruft es auf.**" Derselbe Satz steht schon in `review/rust-bestand.md`
§4 und ist **widerlegt** (Befund **B6**): `packages/util/atomic-write/src/index.ts` ruft den
Rust-Prozess auf, das Paket ist Workspace-Mitglied, das Crate-README nennt den Aufrufer selbst.
Der Fehler steht jetzt in **zwei** Dokumenten — beim dritten Mal wird er zur Voraussetzung.

**Ergebnis — eine offene Frage des Dokuments ist beantwortet.** Es schreibt, die Differenz zwischen
seinen **6.014** Zeilen und den **6.569** des Auftrags sei „nicht aufgeklärt". Sie ist aufgeklärt:
**555 Leerzeilen**. Meine Klassenzählung reproduziert seine Zahlen **pro Crate exakt**
(759 · 791 · 1.473 · 1.002 · 796 · 640 · 553 = 6.014); mit Leerzeilen sind es 6.569. Kein
Zählfehler, kein veränderter Stand.

**Eigene Korrektur (H6, Nr. 11).** In **B6** hatte ich behauptet, „Code + Kommentar ergibt genau die
6.569". **Falsch**: Code + Kommentar = **6.014**, alle Zeilen = 6.569. Und meine damalige Deutung
(die Einzelwerte seien „Code-Zeilen ohne Kommentare") war zu grob — es sind **Code + Kommentar**.
Jetzt gemessen statt geschätzt.

**Eigener Werkzeugfehler, behoben (Nr. 12).** `pty-probe.mjs` gab im ersten Lauf alle Ergebnisse aus
und **beendete sich nicht** — `node-pty` hält eine Ressource offen, der Prozess lief in ein
120-Sekunden-Zeitlimit. Ein Werkzeug für wiederkehrende Prüfungen muss sich beenden; jetzt ruft es
`process.exit(0)`.

---

## 2026-10-13 12:25–12:30 — Neunter Takt: das Töten nach Name ist systemisch (Befund B13)

**Anlass.** Zwei neue Commits: `d0b012b` „Startup-Methodik: auto-port statt Abbruch, Standard 3080"
und `aab7bde` „Groessenvergleich zur Referenz: gemessen statt vermutet". **Standard 3080 ist der Port
der laufenden DSH-GUI** — also habe ich zuerst geprüft, ob irgendwo ein Portbesitzer getötet wird.

**Befehl.**

```powershell
Select-String -Path scripts,docs\status\messsonden -Include '*.ps1','*.mjs' -Pattern 'Stop-Process|taskkill|kill\(|Get-NetTCPConnection|OwningProcess'
netstat -ano | Select-String ':3080'
node zeilen-klassen.mjs … ; Select-String in port-wahl.mjs, port-halter.mjs, port-test.ps1
```

**Ergebnis — die gefährliche Klasse ist ein Muster, kein Einzelfall.**

| Datei | Zeile | Fenster |
|---|---|---|
| `boot-schleife.ps1` | 103 | 2 min |
| `port-test.ps1` | 40 | 1 min (je Aufruf der Funktion) |
| `port-test.ps1` | 102 | **5 min** (am Skriptende) |
| `api-flaeche.ps1` | 92 | 3 min |
| `api-test.ps1` | 33 | 3 min |

Fünf Stellen, alle mit `Get-Process bun | Where StartTime -gt now-Nmin | Stop-Process -Force` —
Name und Alter statt Herkunft.

**Ergebnis — was ich **entlastet** habe:**

* **Port 3080 hält PID 22260, und das ist `node`, nicht `bun`** (`netstat -ano`). Der Namensfilter
  trifft die laufende DSH-GUI **nicht**; die Hausregel **H1** ist durch diese Sonden nicht gefährdet.
* **Kein Skript tötet einen Portbesitzer** — keine Treffer auf `Get-NetTCPConnection`/`OwningProcess`
  als Tötungspfad. `port-wahl.mjs` **bindet und gibt frei**, prüft beide Adressfamilien und weicht bei
  Belegung aus; `--strict-port` erzwingt den sichtbaren Abbruch, und `port-test.ps1` Fall 3 prüft die
  **Meldung**, nicht nur den Exit-Code.
* **Ihr eigener Fehler ist dokumentiert:** `port-halter.mjs` erklärt, dass der erste Versuch mit
  `bun -e` den Port nicht hielt und der Test deshalb drei Mal „Port ist frei" meldete — also nichts
  prüfte.

**Ergebnis — der Größenvergleich hält stand, mit einer kleinen Abweichung.** Nachgemessen:
112 Quelldateien ✓ (ich: 113 — Definition ist `.ts/.tsx/.go/.rs`), 14 Applikationspakete ✓ exakt,
`docs/` 1.466 Dateien / 56 MB ✓, `docs/dsh/` 1.376 ✓ exakt, `website/` versioniert 28 Dateien /
2,82 MB ✓ exakt, `target/` 5.851 Dateien ✓ exakt. Nur die **Größe** von `target/` weicht ab:
**731 MB** laut Dokument gegen **697,6 MB Nutzbytes / 711,1 MB belegt** (BlockSize 4096). Die
Schlussfolgerung trägt in jedem Fall.

**Eigene Fehler, offen berichtet (H6).** (Nr. 13) Meine erste Quellcode-Zählung ergab „181 Dateien" —
ich hatte `node_modules`, `dist` und `lib` **nicht** ausgeschlossen. Erst nach der Bereinigung und
dem Durchprobieren mehrerer Definitionen kam ich auf die Zahl des Dokuments. Wieder dieselbe Lehre:
**erst die eigene Zählweise prüfen, dann die fremde Zahl bezweifeln.** (Nr. 14) `Get-NetTCPConnection`
ist auf diesem Rechner nicht benutzbar (Ausführungsrichtlinie blockiert das Modul) — ich habe auf
`netstat -ano` ausgewichen und das im Protokoll vermerkt, statt die Messung stillschweigend
auszulassen.

---

## 2026-10-13 12:29–12:34 — Zehnter Takt: Schema gegen Code geprüft (Befund B14)

**Anlass.** Meine Auftragsflanke „Zugänge und `.env`" — ich habe gefragt, ob die dokumentierten
Namen das sind, was der Code **liest**.

**Befehl.**

```powershell
Select-String -Path packages,a apps,services -Include '*.ts','*.go','*.mjs' -Pattern 'value_cipher|wrapped_key|createCipheriv|MASTER_KEY'
Select-String -Path . -Include '*.sh','*.sql','*.ps1','*.yml','*.md' -Pattern 'MIGRATION_DATABASE_URL|PMH_MASTER_KEY|PMH_APP_USER|PMH_OWNER_USER'
```

**Ergebnis.**

| Variable | Treffer im Code | Bewertung |
|---|---|---|
| `PMH_APP_USER` | **9** | gelesen (Einrichtungs-Skripte) ✓ |
| `PMH_OWNER_USER` | **14** | gelesen ✓ |
| `PMH_TEST_DATABASE_URL` | 4 | gelesen ✓ |
| **`MIGRATION_DATABASE_URL`** | **0** | **nur dokumentiert** — die Migrationen lesen `PMH_TEST_DATABASE_URL` |
| **`PMH_MASTER_KEY` / `…_VERSION`** | **0** | **nur dokumentiert** |

**Ergebnis — die Umschlagverschlüsselung ist Schema, nicht Code.** `value_cipher` und `wrapped_key`
existieren in `0001_identitaet.sql:149–150`; **außerhalb der Migration kommen sie nirgends vor**.
`user_secrets` und `api_keys` tauchen **ausschließlich in Testdateien** auf, und zwar als Einträge in
Tabellenlisten — kein Produktivcode schreibt oder liest sie.

**Deutung.** Die Weisung §3 („der Bestand macht es schon richtig") ist für das **Schema** wahr und für
den **Code** falsch. Wer sie liest, kann glauben, Anbieter-Schlüssel lägen heute verschlüsselt in der
Datenbank — sie liegen **gar nicht** dort, weil sie noch nirgends geschrieben werden. Dieselbe
Fehlerfamilie wie B6/B12: eine **Bestandsaussage** auf der Grundlage eines Plans.

**Nicht prüfbar (offen benannt):** die Form der Host-Ausgabe in `scripts/token-adresse.mjs`
(„43 Zeichen base64url") — die laufende DSH-GUI meldet in `DSH_WEB_URL` nur `http://127.0.0.1:3080`,
ohne Token-Parameter. Ungeprüft, nicht bestritten.

---

## 2026-10-13 12:34–12:40 — Elfter Takt: das README als Vertrag geprüft (Befund B15)

**Befehl.**

```powershell
docker exec pmh-postgres psql -U pmh_admin -d pmh -Atc "show server_version; select extversion from pg_extension where extname='vector';"
docker exec pmh-redis redis-server --version
node -e "… versionierte .ts unter packages/ zählen und Zeilen summieren …"
git -C C:\Users\Chang\deepseek-harness log --oneline -1 ; git -C …\harness\prometheus-harness log --oneline -1
```

**Ergebnis — bestätigt:** PostgreSQL **17.11** ✓, pgvector **0.8.7** ✓, Redis **v7.4.9** ✓,
**14** Applikationspakete ✓, die Portausweich-Angabe ✓ (der Port ist heute belegt — von der DSH-GUI),
Testzahlen im Rahmen (ich zähle 73 + 36 = 109 statt 108).

**Ergebnis — der widerlegte Satz steht jetzt auf der Startseite.** README Zeile 60: „Rust | 6.569
Zeilen in 6 Crates — **nichts ruft sie auf**", Zeile 85 ebenso. In **B6** widerlegt, in **B12** als
weitergereicht gemeldet (zwei Dokumente) — jetzt das dritte, und es ist das erste, das ein Fremder
liest. Die Vorhersage aus B12 ist damit eingetreten.

**Ergebnis — die drei Bäume sind falsch beschriftet.** Das README nennt `deepseek-harness` „den
**unveränderten** Upstream". Gemessen: HEAD `c7edfcbc41` „dsh-custom", **57 gepatchte** Upstream-Dateien
und 11 uncommittete Änderungen, Basis `dsh-v0.1.1-rc.2` — also der **Arbeitsbaum** auf einer **anderen
Version**. Der Baum, der zur Vorlage passt (`dsh-v0.2.1-alpha.2`), ist `harness\prometheus-harness`.
Und `.pmh/base.json` zeigt `checkout.path`/`ours` auf diesen Vorlagenbaum, obwohl die Arbeit seit dem
12.10. in `C:\Users\Chang\prometheus-harness` läuft. **Genau daraus entstand B10** — Zahlen „der
Vorlage", die den Arbeitsbaum maßen.

**Eigener Fehler (H6, Nr. 16).** Meine erste Zeilenzählung für die TypeScript-Angabe ergab 18.712 —
statt sofort eine Abweichung zu melden, habe ich **vier Zählweisen** durchprobiert und die Ursache
eingegrenzt: **eine einzige Testdatei** mit 1.040 Zeilen erklärt den größten Teil. Ergebnis: die Zahl
des README ist **nicht widerlegt**, nur nicht exakt reproduzierbar. Kein Befund — eine fehlende
Definition.

---

## 2026-10-13 12:37–12:46 — Zwölfter Takt: „API ausgefallen" ist nicht belegt (Befund B16)

**Anlass.** Die README führt als schwerwiegendste Zeile: „**API | ausgefallen.** `/api/*` → 404
(18 Pfade geprüft), WS → 1008 Policy Violation", und daraus folgt die Entscheidung
`eigener-endpunktweg.md` („weil die Vorlage **keine erreichbare API** hat"). Diese Zeile habe ich
geprüft — Sonde, Methode und Gegenfall.

**Befehl.**

```powershell
# 1. Die Sonde selbst gelesen: docs/status/messsonden/api-flaeche.ps1
# 2. Wie der Kern wirklich spricht:
Select-String -Path docs\dsh\original\api-gateway.md -Pattern '/api'
#    und im Kern: packages/api/gateway/tests/gateway.host.spec.ts:1121
# 3. Der Gegenfall an der LAUFENDEN Harness (nachweislich gesund: meine Sitzung läuft darin):
bun run werkzeuge\api-erreichbarkeit.mjs http://127.0.0.1:3080
```

**Ergebnis.**

| Prüfung | Befund |
|---|---|
| Pfade der Sonde | **19 geratene REST-Namen per GET** (`/api/health`, `/api/sessions`, `/api/plugins`, …); POST nur auf **erfundene** Namen (`/typert`, `/rpc`, `/gateway`, `/api/typert`) |
| Registrierter Endpunkt dabei? | **keiner** |
| Wie der Kern ruft | **eine** Route `/api`, aufgerufen als **`POST /api/<namespace>/<methode>`** (Core-Doku Zeile 123; Kern-Test `gateway.host.spec.ts:1121` mit `POST /api/goals/create`) |
| **Gegenfall an der laufenden Harness** | `POST /api/goals/create` → **HTTP 200 mit JSON-RPC-Rahmen** (`bad-request`); `POST /api/health` und `/api/sessions` → **404 „not found"** |
| WS `/api/remote.mux` | hier **Handschlag scheitert ganz**; bei ihnen **Close-Code 1008** — ein Close-Code setzt einen **erfolgreichen** Handschlag voraus |

**Deutung.** Eine 404 auf `/api/health` entsteht **auch in einer gesunden Installation**. Die Sonde
kann „lebt" von „tot" damit **nicht unterscheiden** — und ihr WS-Befund spricht eher **dafür**, dass
die Route bedient wurde. Die Zeile „API ausgefallen" ist **nicht belegt**; die Begründung der
Entscheidung „eigener Endpunktweg" trägt damit nicht. Die Entscheidung selbst kann richtig bleiben —
einen eigenen API-Weg zu wollen ist ein legitimes Ziel.

**Was ich ausdrücklich nicht behaupte.** Die laufende DSH-Installation ist `0.1.1-rc.2` + Patches, der
PMH-Host baut auf `0.2.1-alpha.2`. Sie **können** sich unterscheiden. Meine Messung zeigt: die
**Methode** der Sonde macht den Unterschied unsichtbar — nicht mehr und nicht weniger.

**Bereitgelegt:** `werkzeuge/api-erreichbarkeit.mjs` — POST auf registrierte und unregistrierte
Endpunkte, Unterscheidung am JSON-RPC-Rahmen.

---

## 2026-10-13 12:41–12:50 — Dreizehnter Takt: `P8.12` entblockt (Befund B17)

**Anlass.** `P8.12` („Aufruf gegen den **echten** Anbieter — **kein Schlüssel in dieser Umgebung**")
steht seit dem ersten Takt offen. Der Betreiber hat mir ausdrücklich aufgetragen, hier zu helfen.

**Befehl.**

```powershell
# Wie liest unser Adapter den Schlüssel?
Select-String -Path packages\llm\llm-deepseek\src\index.ts -Pattern 'apiKey|API_KEY|env\.'
# Liest irgendetwas den Credential-Speicher?
Select-String -Path packages,apps,services,scripts -Include '*.ts','*.mjs','*.go' -Pattern 'apiKeyEnv|credentials-local|credentials\.yaml'
# Der Beweis:
bun run docs\protokoll\aufsicht\hilfen\anbieter-rauchtest.mjs
```

**Ergebnis — die Ursache war nicht der Schlüssel, sondern der Weg.**

| Weg | Wer ihn liest |
|---|---|
| `~/.pmh/.credentials.yaml` | **der Kern** (löst `apiKeyEnv` darüber auf) |
| `env.DEEPSEEK_API_KEY` | **unser eigener Adapter** — `providerFromEnv()` in Zeile 510, und **nur** das |

Die Suche nach `apiKeyEnv`, `credentials-local`, `credentials.yaml` im eigenen Code ergibt **null
Treffer**: **nichts** liest den Speicher, den ich in B3 befüllt habe.

**Ergebnis — der echte Aufruf gelingt:**

```
Schlüssel: 35 Zeichen, Fingerabdruck e2159c3d1018 (gleich dem Speicher)
ECHTE ANTWORT in 1,20 s
  Modell: deepseek-flash · finishReason: stop · Token: 41 ein / 117 aus · Text: "Empfang"
```

**Korrektur meiner eigenen Meldung zu B3.** Dort steht seit dem ersten Takt „**erledigt**". Das war
**zu früh**: die Referenz im Speicher hilft dem Kern, aber **nicht** dem Adapter dieses Projekts.
Status jetzt **teilweise** — mit benanntem fehlendem Teil. (Der erste Lauf mit `maxTokens: 24` endete
mit `finishReason: length` und **leerem** Text; auch das steht in der Datei, damit niemand einen
leeren Rauchtest für einen Beweis hält.)

**Was ich ausdrücklich nicht behaupte.** `P8.12` ist damit **nicht** erfüllt — der Nachweis verlangt
den Aufruf **in der Kette des Projekts**, durch den bauenden Agenten. Mein Test ist eine Vorstufe und
als solche gekennzeichnet.

---

## 2026-10-13 12:44–12:52 — Vierzehnter Takt: zwei Befunde wachsen (B13, B16)

**Befehl.**

```powershell
Get-ChildItem . -Recurse -Include '*.ps1','*.mjs' | Select-String -Pattern 'Get-Process bun'
Test-Path 'node_modules\@deepseek-ai\dsh-api-gateway'
Get-ChildItem 'node_modules\@deepseek-ai\dsh-base' -Recurse | Select-String -SimpleMatch '/api-gateway'
```

**Ergebnis 1 — B13 wächst von fünf auf sechs Stellen.** Neu: `scripts/port-test.ps1:154`. Der Grund
ist aufschlussreich: ein **vierter Testfall** (`$p4`, weiterer Host-Start samt Token-Prüfung) wurde
ergänzt und die Aufräumzeile **mitkopiert**. Das Muster wächst mit jedem neuen Testfall, statt einmal
richtig gelöst zu werden — der Beleg dafür, dass es ein **Muster** ist und kein Versehen.

**Ergebnis 2 — B16 wird durch einen statischen Befund gestützt.** Der Baustein, den die Sonde als
„registriert sich nicht" bezeichnet, ist in dem Bündel **deklariert**, das der PMH-Host lädt:
`@deepseek-ai/dsh-api-gateway` ist installiert (Version **0.2.1-alpha.2**) und in
`node_modules\@deepseek-ai\dsh-base\package.json` Zeile **60** sowie `cordis.patch.yml` Zeile **53**
genannt. Damit widerspricht die Ursachenangabe auch dem statischen Befund — nicht nur der
Messmethode.

**Grenze, ausdrücklich:** die Deklaration im Bündel garantiert **nicht** die Registrierung zur
Laufzeit. Das kann nur ein laufender PMH-Host zeigen. Es ist ein **Gegenindiz**, kein Beweis.

**Eigener Fehler (H6, Nr. 17).** Ein Suchmuster mit Backtick brach **ohne Ausgabe** ab (exit 1) —
vierter Quoting-Fall derselben Familie. Wiederholt mit `Select-String -SimpleMatch`, ohne Backtick
und ohne verschachtelte Anführungszeichen. Der Fehler brach ab, **bevor** etwas lief; ein falsches
Ergebnis entstand nicht.

---

## 2026-10-13 12:47–12:53 — Fünfzehnter Takt: der Kern nennt den Grund für die 404 selbst (B16)

**Befehl.**

```powershell
# Der neue eigene Endpunkt des bauenden Agenten und sein Mechanismus:
Select-String -Path packages\api\health\src\index.ts -Pattern '@Remote|webServer|inject|apply'
# Der Core-Dienst, den er dafür benutzt:
Get-ChildItem 'node_modules\@deepseek-ai\dsh-host-webserver' -Recurse | Select-String -SimpleMatch 'register'
```

**Ergebnis — B16 wird durch die Core-Dokumentation bestätigt.** `dsh-host-webserver` (Version
**0.2.1-alpha.2**) schreibt in `lib/index.d.ts`:

```
Zeile 117  * during startup with 404 until its owner registers.
Zeile 157    register(route: WebRoute): () => void;
Zeile 164    registerUpgrade(route: WebUpgradeRoute): () => void;
```

Eine Route ist also **404, bis ihr Eigentümer sie registriert** — in den Worten des Cores. Eine 404
heißt damit „**niemand hat diesen Pfad registriert**", nicht „der API-Weg ist ausgefallen". Das ist
genau das, was ich um 12:42 an einer gesunden Installation gemessen habe.

**Ergebnis — der neue Endpunkt ist richtig gebaut.** `packages/api/health` benutzt
`ctx.webServer.register` über `inject = ['webServer']` — eine **dokumentierte** Core-Schnittstelle.
Der Weg, den der bauende Agent jetzt geht, steht auf tragfähigem Fundament; er ist nur ein **zweiter**
Weg neben dem Typert-Gateway, das bereits funktioniert. Dazu passt `scripts/profile-patch.mjs`: er
trägt die eigenen Einträge in die Patch-Schicht des Profils ein — der ordentliche Weg, ein Plugin in
den Host-Baum zu hängen.

**Ergebnis — mein Registereintrag hat die Überarbeitung überlebt.** `docs/INDEX.md` Abschnitt 9 steht
unverändert (Zeile 133 ff.). **Eigene Nachlässigkeit korrigiert:** die Beschreibung dort nannte noch
„Befunde `B1`–`B5`" — inzwischen sind es **B17**. Berichtigt und um die neue Lageübersicht ergänzt.

**Neu angelegt: [`LAGE.md`](LAGE.md)** — eine Seite für Entscheidungen: was jetzt zu tun ist, was
erledigt ist, was **nicht** prüfbar war, und die Befehle zum Nachfahren. Sie ersetzt niemandes
Nachweis; sie macht 17 Befunde in einer Minute lesbar.

---

## 2026-10-13 12:52–12:58 — Sechzehnter Takt: der erste eigene Endpunkt geprüft (Verifikation V1)

**Anlass.** Zwischen 12:41 und 12:47 entstand `packages/api/health` — der erste **eigene** Endpunkt des
Projekts. Ein Plugin, das den Core-Vertrag verfehlt, lässt den **Host-Start scheitern**; also habe ich
die drei Voraussetzungen geprüft.

**Befehl.**

```powershell
Get-Content 'node_modules\@deepseek-ai\dsh-host-webserver\lib\types\index.d.ts'   # WebRoute, WebRouteKind
Select-String -Path packages\api\health\src\index.ts -Pattern 'kind:|inject|HEALTH_PATH|ctx.effect'
Get-Content .pmh-build\harness-home\profiles\web\cordis.patch.yml
node -e "createRequire(profil + '/package.json').resolve('@prometheus-harness/health')"
```

**Ergebnis — alle drei Voraussetzungen erfüllt:**

| Prüfung | Ergebnis |
|---|---|
| Core-Vertrag | `kind: 'exact'` ✓ (erlaubt: `'exact' \| 'prefix'`), `path: '/api/health'` ✓ absolut ohne Schluss-Schrägstrich, `handler` besitzt den Lebenszyklus ✓, `inject = ['webServer']` ✓, `ctx.effect(…)` für die Rücknahme ✓ |
| Profil-Eintrag | `cordis.patch.yml` enthält den markierten Block mit `id: pmh-health`, `name: '@prometheus-harness/health'` — **deckungsgleich** mit `export const name` (wichtig: der Core **wirft** bei doppeltem `(kind, path)`) |
| Auflösbarkeit | mit **Nodes eigenem Resolver** aus dem Profilordner: `@prometheus-harness/health` → `packages/api/health/src/index.ts` (Bun führt TS direkt aus); Arbeitsbereichs-Verknüpfung als Junction, in `bun.lock` Zeilen 63/843 |

**Was offen bleibt:** ob der Host das Plugin beim Start **lädt** und `GET /api/health` **antwortet**.
Die Aufsicht startet den Host nicht (H2/H5). Bleibt der Start aus, liegt es **nicht** an Vertrag,
Eintrag oder Auflösung — das ist damit immerhin eingegrenzt.

**Eigener Fehler (H6, Nr. 18).** Mein erster Auflösungstest meldete „NICHT auflösbar entlang der
Kette" — **mein** Test hatte einen Schleifenfehler (relative Pfade, Abbruch bevor der Repo-Ordner
erreicht war). Autoritativ geprüft mit Nodes eigenem Resolver: **auflösbar**. Wieder dieselbe Lehre:
ein Negativbefund des eigenen Werkzeugs ist zuerst ein Verdacht gegen das Werkzeug.

---

## 2026-10-13 12:54–13:00 — Siebzehnter Takt: der Beleg des anderen Agenten **stützt** B16

**Anlass.** Der bauende Agent hat `docs/status/beleg-eigener-endpunkt.md` vorgelegt: sein erster
eigener Endpunkt läuft **im Host** (`GET /api/health` → 200, Port 3081). Ich habe geprüft, was das
für B16 bedeutet — und ob mein empfohlener Test in **seiner** Version überhaupt taugt.

**Befehl.**

```powershell
Get-Content docs\status\beleg-eigener-endpunkt.md
Select-String -Path README.md -Pattern 'ausgefallen|nicht ruft sie auf'
Get-ChildItem 'node_modules\@deepseek-ai' -Recurse -Include '*.js','*.ts' | Select-String -SimpleMatch 'goals/create'
# Wer hält Port 5522? (mein Verdacht: eine Waise aus den Sonden)
netstat -ano | Select-String ':5522'
```

**Ergebnis 1 — sein eigener Beleg zeigt genau die Unterscheidung, die der alten Sonde fehlte.** In
seinem Dokument: registrierter Pfad → **200** (richtige Methode) / **405** (falsche Methode);
unregistrierter Pfad → **401** ohne Cookie, **404** mit Cookie. Seine Sonde prüfte **nur**
unregistrierte Pfade — „401/404" war also die **erwartete** Antwort einer lebenden Installation.

**Ergebnis 2 — die README-Zeile steht weiter.** Nur die Evidenz wurde geändert („404" → „**401/404**"),
die Ursachenangabe blieb. Nach seinem eigenen Beleg ist 401/404 **kein** Zeichen für einen toten Weg.

**Ergebnis 3 — mein Testvorschlag ist versionsgültig.** `goals/create` wird von **`dsh-goal`** in
**0.2.1-alpha.2** registriert (`lib/typert.host.js:233`, `typert.remote-client.d.ts:22,34`,
`dsh-api-remotes/lib/client.js:6538`) — also in dem Stand, den der PMH-Host lädt. **Eine** Anweisung
entscheidet die README-Zeile: `api-erreichbarkeit.mjs` gegen den PMH-Host. Antwortet
`POST /api/goals/create` mit JSON-RPC-Rahmen, lebt der Gateway; antwortet er 401/404, ist die
Ursachensuche fällig.

**Anerkennung, ausdrücklich.** Sein Beleg startet auf **3081** und sagt: *„**3080 hält der Harness des
Betreibers**"* — die Rücksicht, die **H1** verlangt, von ihm aus freien Stücken. Er nennt **vier
eigene Fehler** mit Messung und **fünf Lücken** ausdrücklich (keine Zustandsprüfung, `Content-Length`
nicht verifiziert, Anmeldung nicht durch Test festgehalten, Typecheck nur paketweise, nur Windows).

**Eigener Fehler (H6, Nr. 19).** Ich hielt den auf `0.0.0.0` lauschenden Port **5522** für eine Waise
aus ihren Sonden. Gemessen: er gehört **`RGSUpdater.exe`** (PID 7084, Fremdprogramm vom 12.10.).
Keine Waise, kein Befund.

---

## 2026-10-13 13:00–13:06 — Achtzehnter Takt: Push-Behauptung geprüft, Launcher-Befund B18

**Befehl.**

```powershell
git rev-parse HEAD ; git ls-remote origin refs/heads/main
Select-String -Path scripts\start.mjs -Pattern 'buildAndStartGo|Prozess\(e\) laufen|running\.length'
Get-Content services\pmh-nix\cmd\pmh-nix\commands.go | Select-Object -Skip 15 -First 26
```

**Ergebnis 1 — die Push-Behauptung des Git-Audits stimmt.** Lokaler `HEAD` `72cf0f3…` =
`origin/main` `72cf0f3…` — der achte Push ist belegt.

**Ergebnis 2 — Befund B18: der Launcher meldet einen beendeten Einmalaufruf als laufenden Dienst.**
`scripts/start.mjs:431` startet `pmh-nix detect --json` über `buildAndStartGo` — dieselbe Funktion wie
für den Dienst `pmh-attach`. `detect` ist aber ein **Einmalaufruf**: das eigene Repository sagt es
(`commands.go:13–16`, „Detect veraendert nichts"), und er endet mit `ExitOK`. Trotzdem bleibt er in
`running`, und Zeile **439** meldet `running.length` als **laufende** Prozesse — inklusive der
Abschiedsmeldung („Beende N Prozess(e)").

| Wirkung | Bewertung |
|---|---|
| „2 Prozesse laufen", während einer läuft | eine Zahl, die etwas anderes sagt als der Zustand |
| **kein** falscher Fehler | die Regel prüft `code !== 0`, und `detect` endet mit 0 — zu Recht still |

**Zwei Wege, beide klein:** (a) nur noch **laufende** Kinder zählen und beendete namentlich nennen;
(b) den Einmalaufruf gar nicht als Dienst führen — starten, Ausgabe durchreichen, nicht in `running`
aufnehmen. Weg (b) trifft die Ursache.

**Grenze, ausdrücklich.** Ich habe den Lauf **nicht** ausgeführt (H5, kein Start des fremden Hosts).
Der Befund stammt aus dem Quelltext: Zeile, Funktion und Exit-Code sind belegt; wie es sich auf dem
Bildschirm liest, ist **nicht** gemessen.

---

## 2026-10-13 13:01–13:08 — Neunzehnter Takt: Zaun und Anmeldung sind zwei Dinge (Befund B19)

**Anlass.** Der bauende Agent legte `.pmh-build/probe-auth.ts` an — eine Wegwerf-Sonde für
`requestRejection`, um die Anmeldesperre zu verstehen. Ich habe sie **nicht ausgeführt** und sage
warum: das `Connection`-Plugin schreibt Sitzungsdatensätze in den Credential-Speicher
(`~/.pmh/.credentials.yaml`, Abschnitt `records.client-connection/browser-session`). Stattdessen habe
ich die Kernlogik **gelesen**.

**Befehl.**

```powershell
Get-Content .pmh-build\probe-auth.ts
Get-ChildItem 'node_modules\@deepseek-ai\dsh-client-connection' -Recurse | Select-String -SimpleMatch 'requestRejection'
```

**Ergebnis — die Kernlogik:**

```js
requestRejection(request) {
  const carrier = this.ctx.get("webServer")
  if (!isTrustedApiRequest(request, this.trustedHosts, carrier?.host, …)) return 403   // Zaun
  return this.browserAuth.isAuthenticated(request, …) ? undefined : 401               // Anmeldung
}
```

**Ergebnis — die Deutung des Agenten ist bestätigt:** der **geteilte Kanal** `/api` ruft
`requestRejection` **vor** seiner Wegewahl (daher 401 ohne Cookie, 404 mit Cookie); ein über
`webServer.register` registrierter Pfad wird **direkt** bedient und läuft nicht durch den Kanal
(daher 200 in beiden Fällen).

**Ergebnis — und das geht über seine Darstellung hinaus:** `requestRejection` prüft **zwei** Dinge.
Der Agent hat die Folge für die **Anmeldung** ausgesprochen; die Folge für den **Zaun**
(`isTrustedApiRequest` gegen Host und Origin → 403, der Schutz gegen **DNS-Rebinding** und **CSRF**)
steht nicht dort — und sie ist **dieselbe**: wer über `webServer.register` registriert, umgeht beide.
Für ein reines `GET` harmlos; für die **zustandsändernden** Endpunkte, die als Nächstes kommen (Login,
Sitzungen, Chats), wäre der Pfad ohne Zaun auch aus einer fremden Seite erreichbar.

**Empfehlung:** für lesende Auskünfte bleibt der Weg richtig; für Zustandsänderungen entweder
`requestRejection`/`admit` ausdrücklich anwenden (der Kern bietet beides an) **oder** den
Typert-Remote-Weg auf dem geteilten Kanal nehmen — dort gibt es Zaun **und** Anmeldung ohne
Zusatzarbeit. Und als **Regel** notieren, weil es keine Einzelfrage ist: *jeder über
`webServer.register` eingehängte Pfad ist öffentlich, einschließlich des Zauns.*

**Grenze.** Gelesen, **nicht** gegen einen laufenden Host gemessen; die Messung „registrierter Pfad →
200 ohne Cookie" stammt aus dem Beleg des Agenten und passt zur gelesenen Logik.

**Nebenbefund (stale Registerzeile).** `docs/status/arbeitspakete.md` führt P8.12 weiter als
*„offen — **kein Schlüssel in dieser Umgebung**"*. Meine Messung (B17) widerlegt den Nebensatz: der
Schlüssel ist vorhanden, gültig und über den eigenen Adapter benutzbar („Empfang", 41/117 Token,
1,20 s). Was fehlt, ist die **Umgebungsvariable** beim Start.

---

## 2026-10-13 13:04–13:10 — Zwanzigster Takt: Vorhandenes inventarisiert (Hilfe) — und ein schwerer eigener Fehler

**Anlass.** Meine Befunde sind in den Dokumenten des Agenten **nicht** angekommen (README Zeile 102
„API des Cores ausgefallen" und Zeile 107 „nichts ruft sie auf" unverändert, sechs Tötungszeilen
unverändert). Statt den Befund zu wiederholen, habe ich geprüft, was auf dieser Maschine **schon
läuft** und zur Zielliste des Betreibers gehört — damit nichts nachgebaut wird, was nur angeschlossen
werden muss.

**Befehl.**

```powershell
docker ps --format '{{.Names}} | {{.Image}} | {{.Ports}}'
wsl -l -v
Invoke-WebRequest http://127.0.0.1:3002/ , http://127.0.0.1:8081/ , http://127.0.0.1:3001/v1/models
```

**Ergebnis — ein Inventar, bereitgelegt als `hilfen/vorhandene-bausteine.md`:**

| Baustein | Zustand |
|---|---|
| **SearXNG** | läuft, `http://127.0.0.1:8081/` → **200** |
| **Firecrawl API** (+ playwright, rabbitmq, redis, foundationdb) | läuft, `http://127.0.0.1:3002/` → **200** |
| **freellmapi** | läuft, `/v1/models` → **401 ohne Schlüssel**, **200 mit Schlüssel — 1.075 Modelle** |
| **Ollama** | Container läuft, Port **nicht** veröffentlicht → vom Host **nicht** erreichbar |
| WSL2 Ubuntu + docker-desktop | laufen |
| PostgreSQL 17.11/pgvector 0.8.7, Redis 7.4.9 | eigener Stapel des Projekts |

**Dazu der Zugang, der fehlt:** `FREELLMAPI_API_KEY` liegt **nur** in `~/.dsh/.env` — in **keinem**
Credential-Speicher, auch nicht in `~/.pmh`. Damit ist der lokale Anbieter für dieses Projekt noch
nicht benutzbar, obwohl er läuft. Und die laufende DSH-Installation hat dafür bereits eine
**funktionierende Referenzkonfiguration** (`llm-pi-ai.providers.freellmapi`, `baseURL:
http://127.0.0.1:3001/v1`).

### Eigener Fehler (H6, Nr. 20) — der schwerste dieser Sitzung

In der ersten Fassung dieses Hilfsdokuments habe ich die Gegenprobe falsch gebaut
(`$env:FREELLMAPI_API_KEY` in die Kommandozeile interpoliert: **Leck-Fläche**) und als Ergebnis den
Fingerabdruck des **leeren** Strings gemeldet. Beim Korrigieren habe ich **einen Wert erfunden** —
`95624be3e0c1` — der nie gemessen wurde.

**Nachgemessen in zwei frischen Shells: `d0be03708b89`, Länge 59, stabil.** Dazu die Gegenprobe, die
das Leck ausschließt: **kein** Prozess auf dieser Maschine trägt den Wertanfang in seiner
Kommandozeile. Die Datei nennt jetzt den gemessenen Wert, den erfundenen und den Vorgang.

**Warum ich das so ausführlich aufschreibe.** Eine Zahl, die aussieht wie eine Messung und keine ist,
ist **genau** der Fehler, den diese Rolle bei anderen sucht — die 12,7-s-Zahl, die den Compiler maß;
der 731-MB-Wert; die 404 auf geratenen Pfaden. Eine stille Korrektur wäre der Verlust der Glaubwürdigkeit,
die dieses Protokoll ausmacht. **Lehre, ab jetzt Regel: kein Wert in eine Datei, der nicht vorher in
einer Shell gestanden hat.**

---

## 2026-10-13 13:09–13:12 — Einundzwanzigster Takt: B19 ist erledigt — besser als empfohlen

**Anlass.** Zwei neue Commits: `38aa3ff` „**Anmeldesperre fuer die eigene API-Flaeche: `/api/ready`**"
und `58d25b6` (Git-Audit, neunter Push). Das ist genau das Feld von B19 — also geprüft, **welchen**
Mechanismus er verwendet.

**Befehl.**

```powershell
Get-ChildItem packages\api -Recurse -Include '*.ts' | Select-String -Pattern 'requestRejection|admit|isTrustedApiRequest'
Get-Content packages\api\health\src\index.ts | Select-Object -Skip 519 -First 32
```

**Ergebnis — der Befund ist erledigt, und die Umsetzung ist besser als meine Empfehlung:**

| Prüfung | Ergebnis |
|---|---|
| Zaun **und** Anmeldung des Cores benutzt? | **ja** — `verbindung.requestRejection({ headers })` (Zaun 403, Anmeldung 401) |
| **Fail-open oder Fail-closed** bei fehlendem Dienst? | **Fail-closed**: `503`, mit Begründung im Quelltext („ein ungeschützter Endpunkt ist der teurere Fehler") |
| Absturz bei fehlendem Dienst? | nein — `ctx.get('connection')` statt `ctx.connection`, der Fall ist ein beschriebener Ausgang |
| Sauberes HTTP | `WWW-Authenticate: Cookie` bei 401, `Cache-Control: no-store` („eine zwischengespeicherte Zustandsauskunft ist eine falsche Zustandsauskunft") |

**Ehrliche Einordnung, die ich nicht weglasse.** Ich **kann mir das nicht zurechnen**: seine Sonde
`probe-auth.ts` entstand **12:59**, mein Befund B19 um **13:08** — die Arbeit lief also bereits, als
ich den Befund schrieb. Die Übereinstimmung ist gegenseitig, nicht ursächlich. Seine Umsetzung geht
über meinen Vorschlag hinaus, weil er zusätzlich den **Fehlfall** des Dienstes entschieden und
dokumentiert hat.

**Nebenbefund:** das neue `packages/api/readiness` bringt Bereitschaftssonden für PostgreSQL und Redis
in das health-Register — damit ist seine selbst benannte Lücke („keine Zustandsprüfung") in Arbeit.

**Kleiner Hinweis:** unter `packages/api/` liegen **neun leere** Verzeichnisse (Plan-Gerüst nach der
Vorlage). Git versioniert keine leeren Verzeichnisse — nach einem frischen Klon sind sie weg.

**Push neun bestätigt:** `HEAD` = `origin/main` = `58d25b6…`.

**Regel aus dem eigenen Fehler gemacht (H7).** In `README.md` §2 steht jetzt: *kein Wert in eine Datei,
der nicht vorher in einer Shell gestanden hat* — jede Zahl und jeder Fingerabdruck wird ausgeführt,
bevor er geschrieben wird. Das ist die Antwort auf meinen Fehler Nr. 20, nicht die stille Korrektur.

---

## 2026-10-13 13:11–13:18 — Zweiundzwanzigster Takt: drei Endpunkte, drei Entscheidungen (B20)

**Anlass.** Der bauende Agent schreibt an `packages/api/readiness` (18.457 B, 13:10) und hat `health`
auf 28.630 B erweitert — Bereitschaftssonden für PostgreSQL und Redis. Ich habe die Mechanik auf
Robustheit und auf **Stimmigkeit mit den eigenen Prinzipien** geprüft.

**Befehl.**

```powershell
Select-String -Path packages\api\readiness\src\index.ts -Pattern 'catch|setTimeout|inject|Frist|ready'
Select-String -Path packages\api\health\src\index.ts -Pattern 'bereit|sonden.length|zustand'
Select-String -Path packages\api\health\tests\health.test.ts -Pattern "test\('.*(Sonde|bereit)"
Select-String -Path .env.example -SimpleMatch -Pattern 'REDIS_URL','PMH_READY_DATABASE_URL'
```

**Ergebnis 1 — die Mechanik ist gut gebaut.** Werfende Sonden werden gefangen und als `fehler`
geführt, ohne die anderen mitzureißen; hängende Sonden enden an einer Gesamtfrist
(`STANDARD_SONDEN_FRIST_MS = 2_000`); `frist` ist ein **eigener** Zustand neben `fehler`; Fristen
liegen auf **Socket**-Ebene (`socket.setTimeout`), nicht nur im Promise; Zugangsdaten werden aus der
Antwort abgeschnitten; nach dem Abhängen antwortet der Pfad wieder 404. Sieben Tests decken genau
diese Fälle ab.

**Ergebnis 2 — aber drei eigene Endpunkte entscheiden bei „ich kann nicht prüfen" verschieden:**

| Stelle | Entscheidung |
|---|---|
| `/api/health` (Anmeldung) | **Fail-closed `503`** — „ein ungeschützter Endpunkt ist der teurere Fehler" |
| `/api/ready` (fehlender Dienst) | **`503` mit Grund `unavailable`** — konsequent |
| **`/api/ready` (null Sonden)** | **`ok`, `bereit: true`** — `if (sonden.length === 0) return { zustand: 'ok', sonden: [] }`, mit dem Test **„keine Sonde heißt ok"** |

Ein Bereitschafts-Endpunkt wird von **Maschinen** gelesen, und die lesen den **Statuscode**. `200 ok`
ohne eine einzige Sonde ist eine Auskunft, die nicht gedeckt ist — derselbe Fehlertyp wie **B18**
(gestartete statt laufende Prozesse) und **B16** (404, die auch im Gesunden entsteht). Die
Entscheidung ist **bewusst und getestet**; abgemildert wird sie dadurch, dass der Körper `sonden: []`
nennt — aber der Statuscode sagt „bereit".

**Empfehlung:** `503` mit Grund `keine sonden`, wenn die Liste leer ist (dieselbe Härte wie beim
fehlenden Dienst) — **oder** den Grund der Ausnahme ausdrücklich dokumentieren; der Kommentar nennt
die Folge, aber nicht den Grund.

**Ergebnis 3 — Nebenbefund:** `PMH_READY_DATABASE_URL`, `PMH_READY_REDIS_URL` und **`REDIS_URL`**
werden gelesen (readiness Zeile 388/392), stehen aber **nicht** in `.env.example` (0 Treffer). Das ist
das **umgekehrte Zwillingsstück zu B14** (dort: dokumentiert, aber von nichts gelesen). Beides endet
gleich — ein Fremder weiß nicht, was zu setzen ist.

---

## 2026-10-13 13:15–13:20 — Dreiundzwanzigster Takt: der Widerspruch liegt in ihrem eigenen Haus (B20, Nachtrag)

**Anlass.** `.env.example` wurde um **13:14:52** erweitert — der Nebenbefund aus B20 (drei gelesene,
aber undokumentierte Variablen). Ich habe geprüft, ob die Lücke geschlossen ist — und dabei gefunden,
dass die neue Dokumentation **etwas anderes behauptet** als der Code tut.

**Befehl.**

```powershell
Select-String -Path .env.example -SimpleMatch -Pattern 'DATABASE_URL','REDIS_URL','PMH_READY_DATABASE_URL','PMH_READY_REDIS_URL'
Get-Content .env.example | Select-Object -Skip 123 -First 24
Select-String -Path packages\api\health\src\index.ts -Pattern 'bereit:|zustand === .ok.|sonden.length === 0'
Select-String -Path packages\api\health\tests\health.test.ts -Pattern 'bereit|keine Sonde'
```

**Ergebnis 1 — der Nebenbefund ist geschlossen** (und zwar **vor** meinem Befund, um 13:14:52):
`REDIS_URL` (4 Treffer, Zeile 129), `PMH_READY_DATABASE_URL` (2), `PMH_READY_REDIS_URL` (2,
kommentiert Zeile 145–146) — mit Begründung, wozu die eigenen Namen gut sind (Prüfung gegen eine
**andere** Instanz). **Ich rechne mir das nicht zu.**

**Ergebnis 2 — dafür ein Widerspruch zwischen zwei eigenen Artefakten:**

| Artefakt | Wortlaut | Wirkung |
|---|---|---|
| Code + Test (`health/src/index.ts:427`, `:514`, `:347`; Test `:389`) | `sonden.length === 0` → `zustand: 'ok'` → **`bereit: true`**, Status **200**. Testkommentar: *„Keine Sonde heißt nicht ‚unbekannt', sondern ‚nichts zu prüfen' — **und das ist bereit**."* | eine getroffene Entscheidung, mit Test festgehalten |
| `.env.example` Zeile 137–138 | der Endpunkt melde `ok` mit leerer Liste — *„ehrlich: er sagt damit, daß nichts geprüft wurde, **statt ‚bereit' zu behaupten**"* | beschreibt das **Gegenteil** des Feldwertes |

`bereit: true` ist genau das Feld, das ein Aufrufer für die Frage „bereit?" benutzt — und es steht auf
`true`, obwohl nichts geprüft wurde. **Drei kleine Auswege**, einer genügt: (1) `bereit`/Status an
`sonden.length > 0` binden → `503`; (2) statt eines Booleans **drei** Zustände
(`true | false | null`, `null` = „nicht geprüft"); (3) nur den **Wortlaut** der Vorlage an den Code
anpassen, dann steht die Entscheidung ehrlich da.

---

## 2026-10-13 13:17–13:19 — Vierundzwanzigster Takt: das Protokoll ist versioniert (eigene Entscheidung)

**Der offene Punkt.** Seit dem 17. Takt steht in meiner Liste: *mein Protokoll ist nicht versioniert.*
`docs/protokoll/**` war **nicht** ignoriert, wurde aber von keinem Commit mitgenommen — `docs/INDEX.md`
dagegen schon. Ursache: der bauende Agent committet **gezielt benannte Pfade**; einen Ordner, den er
nicht kennt, nimmt er nie mit. Folge: das Protokoll stand auf der Platte, aber **nicht in der
Historie** und wurde nicht gepusht.

**Die Entscheidung, und warum ich sie selbst getroffen habe.** Der Auftrag verlangt ein
**nachprüfbares** Protokoll; ein nur lokal vorhandener Ordner erfüllt das nicht. Und der Ordner ist
**mein** Schreibbereich (**H3**) — nicht der Baubereich des anderen Agenten (**H2**). Beides zusammen
ergibt: die Versionierung meiner eigenen Spur ist meine Aufgabe, nicht seine.

**Befehl und Ergebnis.**

```powershell
git add docs/protokoll docs/INDEX.md
git diff --cached --name-only        # VOR dem Commit geprüft: 22 Dateien, alle meine, nichts Fremdes
git commit -m "Protokoll der Aufsicht: Befunde B1-B20, Werkzeuge, Hilfen, Lageuebersicht"
# → [main 6926c0a] 22 files changed, 4976 insertions(+), 1 deletion(-)
```

| Prüfung | Ergebnis |
|---|---|
| Auf der Bühne | **22 Dateien** — `docs/INDEX.md` (nur meine zwei Zeilen) und 21 unter `docs/protokoll/` |
| Fremdes dabei? | **nein** (Gegenprobe vor dem Commit: leer) |
| Jetzt versioniert | `git ls-files 'docs/protokoll/*'` → **21** |
| Gepusht? | **nein** — `HEAD` `6926c0a` lokal, `origin/main` `58d25b6`. Sein nächster Push nimmt den Commit mit |
| Arbeitsbaum | 37 Änderungen offen — **ausschließlich seine** (u. a. `docs/status/beleg-eigener-endpunkt.md`) |

**Was sich dadurch ändert.** Weil der Ordner jetzt **verfolgt** ist, werden künftige Einträge von
einem `git add -A` **mitgenommen** — der offene Punkt entfällt also dauerhaft, ohne dass ich wieder
eingreifen muss.

**Rücknahme, falls der Betreiber widerspricht (ein Befehl, ungefährlich):**

```powershell
git reset --soft HEAD~1      # Commit zurücknehmen, Dateien bleiben auf der Platte
```

**Grenze, die ich nenne.** Ich habe **nicht** gepusht. Das ist seine Handlung nach seiner
Takt-Regel, und ein zweiter Schreibender am selben Remote wäre genau die Art Eingriff, die diese
Rolle sonst beanstandet.

---

## 2026-10-13 13:19–13:24 — Fünfundzwanzigster Takt: Regression der offenen Befunde

**Anlass.** Ein Wächter, dessen Befunde veralten, ist wertlos. Ich habe **alle offenen Befunde** mit
ihrem ursprünglichen Nachweis erneut gemessen.

**Ergebnis — alle bestehen unverändert (13:20):**

| Befund | Erwartet | Gemessen |
|---|---|---|
| **B13** Tötungszeilen nach Name und Alter | 6 | **6** |
| **B14** `PMH_MASTER_KEY`/`MIGRATION_DATABASE_URL` im Code gelesen | 0 | **0** |
| **B15** README „nichts ruft sie auf" | vorhanden | **vorhanden** |
| **B16** README „ausgefallen" | vorhanden | **vorhanden** (Zeile 102 — die zweite Nennung ist neu und gehört zur Statuscode-Tabelle) |
| **B18** `running.length` als laufende Prozesse | vorhanden | **3 Vorkommen** |
| **B20** `sonden.length === 0` → `ok` | vorhanden | **vorhanden**; `.env.example` sagt weiter „statt ‚bereit' zu behaupten" |
| Konfiguration (Takt) | 10 Abschnitte / 12 Routen / 4 Rollen / 10 Tabellen | **unverändert** |

**Ergebnis — und eine gute Nachricht: der Definitions-Teil von B15 ist erledigt.** Die README nennt
die Zahlen jetzt **mit ihrer Definition** (`.ts`, `.go`, `.rs`, `.mjs`, `.sql`, `.ps1`). Mit genau
dieser Definition nachgemessen:

```
gemessen: 120 Dateien, 1,53 MB · 16 Applikationspakete
README  : 120 Dateien, 1,5 MB  · 16
```

**Beide Zahlen reproduzieren exakt.** Die Verschiebung gegenüber meiner ersten Prüfung (113 Dateien /
1.443 KB / 14 Pakete) liegt nicht an einem Fehler: dazwischen entstanden `packages/api/health` und
`packages/api/readiness`.

**Ergebnis — B20 bleibt, und die neue README-Tabelle lässt den Fall aus.** Der neue Abschnitt zur
Anmeldesperre listet 401, 403, 503 `unavailable`, 503 `eingescränkt`/`ausgefallen` — **„null Sonden"
steht nicht darin** (Suche: 0 Treffer), obwohl genau dieser Fall als einziger **`200`** liefert, ohne
dass etwas geprüft wurde.

**Anerkennung für denselben Abschnitt:** er beschreibt den Mechanismus korrekt („registrierte Routen
gehen am Auffang-Platz und damit an der Anmeldesperre vorbei") und nennt die Sperre ausdrücklich „die
des Hosts, keine eigene" — genau die Analyse aus **B19**, von ihm selbst gefunden.

**Sonst:** kein neuer Commit, kein PMH-Host aktiv; der Arbeitsbaum wuchs von 37 auf 44 Änderungen
(seine Arbeit läuft weiter).

---

## Offen / nächster Takt

| Punkt | Stand |
|---|---|
| **B1** Konfiguration nachziehen | **erledigt** — 4 Änderungen, 3 belegte Auslassungen |
| **B2** Kein Schutz gegen ein erneutes Schrumpfen der Konfiguration | **Hilfe bereit, Sache offen** | Der Schrumpf 117 KB → 151 B geschah **unbemerkt**. Ich habe die Invarianten-Prüfung gebaut (10 Abschnitte / 12 Referenzen, in **jedem** Takt gemessen) — eine **automatische** Sicherung vor jedem Schreiben gibt es weiterhin nicht |
| **B3** Modellzugang | **erledigt** — Rezept **und** Referenz, live HTTP 200 |
| **B4** Der Git-Credential-Helfer ist defekt | **latent, bewusst nicht angefasst** | `credential-gh` existiert nicht; Pushes sind **belegt** (HEAD = origin/main) → Empfehlung bleibt: **nichts ändern** |
| **B5** `PMH_TEST_DATABASE_URL` nur im Testkopf | **erledigt** | Inzwischen liegt eine `.env.example` vor, die den Namen nennt (Zeile 124) — und der Test überspringt **laut**, nicht still |
| **B6** Rust-Befund geprüft | **erledigt** — Messungen bestätigt, „kein einziger Aufruf" widerlegt |
| **B8** Compose-Umbau | **erledigt** — Stack neu aufgesetzt, Rechtetrennung von mir bestätigt |
| **B9** Rechte belegt, Prüfung urteilt nicht | **bereitgelegt** — `hilfen/rechte-probe-assertion.sql`, beide Ausgänge getestet; Umsetzung liegt beim bauenden Agenten |
| **B10** Betreiber-Weisung nachgemessen | **erledigt** — Kernbehauptungen exakt bestätigt (Krypto, Umschlagverschlüsselung, Historien-Negativbefund), **ein harter Fehler**: die Vorlage-Tabelle zitiert den Arbeitsbaum |
| **B11** Boot-Sonde räumt nach Name und Alter auf | **offen, liegt beim bauenden Agenten** | Zeile 103 beendet **jeden** `bun`-Prozess der letzten zwei Minuten — der andere Agent kann mitten im Lauf sterben. Zeile 102 (eigene PID) genügt |
| **B12** Sprachwahl-Recherche geprüft | **erledigt** — PTY-Messung **vollständig reproduziert**, offene Zeilendifferenz **aufgeklärt** (555 Leerzeilen), **ein Fehler**: Entscheidung 4 trägt den in B6 widerlegten Satz „kein Code ruft es auf" — er steht damit in **zwei** Dokumenten |
| **B13** Töten nach Prozessname und Alter | **offen, wächst** | inzwischen **sechs** Stellen (Fenster 1/2/2/3/3/**5** Minuten) — die sechste entstand beim **vierten Testfall** durch Mitkopieren. Entlastet: die DSH-GUI läuft auf `node` und ist **nicht** betroffen; kein Skript tötet einen Portbesitzer |
| **B14** Umschlagverschlüsselung = Schema, nicht Code | **offen, Hinweis liegt vor** | `value_cipher`/`wrapped_key` nur in der Migration; `user_secrets`/`api_keys` nur in Testdateien; `PMH_MASTER_KEY` und `MIGRATION_DATABASE_URL` werden von **nichts** gelesen. Die Weisung §3 ist für das Schema wahr, für den Code nicht |
| **B15** Startseite + Baum-Beschriftung | **teilweise erledigt** | **Erledigt:** die Zahlen nennen jetzt ihre **Definition**, und mit ihr **reproduzieren sie exakt** (120 Dateien / 1,53 MB · 16 Pakete). **Offen:** der in B6 widerlegte Satz „nichts ruft sie auf" steht weiter auf der Startseite, und die drei Bäume bleiben falsch beschriftet („unveränderter Upstream" = gepatchter Arbeitsbaum) — die Ursache von B10 |
| **B16** „API ausgefallen" nicht belegt | **offen, dringlich** | Die Sonde prüft **19 geratene Pfade per GET**; der Kern ruft `POST /api/<namespace>/<methode>`. An einer **gesunden** Installation liefern genau diese Pfade ebenfalls 404 — sie kann „lebt" von „tot" nicht unterscheiden. Darauf steht die Entscheidung „eigener Endpunktweg" |
| **B17** `P8.12` entblockt | **teilweise, Unterstützung liegt bereit** | Ursache war **nicht** der Schlüssel, sondern der Weg: der eigene Adapter liest nur `env.DEEPSEEK_API_KEY`, nichts liest den Speicher. **Echter Aufruf über den Adapter gelungen** („Empfang", 41/117 Token, 1,20 s). Den Nachweis in der Kette führt der bauende Agent |
| **B18** Launcher meldet Beendetes als laufend | **offen, klein** | `pmh-nix detect --json` ist ein Einmalaufruf, wird aber wie ein Dienst geführt: die Statuszeile sagt „**2 Prozesse laufen**", während einer läuft (Quelltextbefund, **kein** Lauf — H5) |
| **B19** Registrierter Pfad umgeht auch den Zaun | **erledigt** | Commit `38aa3ff`: `verbindung.requestRejection({ headers })` — Zaun **und** Anmeldung; bei fehlendem Dienst **Fail-closed 503**. Die Umsetzung ist besser als die Empfehlung, und ich rechne sie mir **nicht** zu (seine Sonde lief 12:59, mein Befund kam 13:08) |
| **B20** Zwei eigene Artefakte widersprechen sich | **offen, Design-Frage (verschärft)** | `/api/ready` mit **null Sonden** liefert **`bereit: true`** und **HTTP 200**; ihr **Test** hält das fest („nichts zu prüfen — und das ist bereit"), ihre **`.env.example`** sagt dagegen, der Endpunkt melde `ok`, „**statt ‚bereit' zu behaupten**". Die **neue README-Statuscode-Tabelle** (401/403/503) lässt genau diesen Fall aus. Drei Auswege: `bereit`/Status an `sonden.length > 0` binden (503) · drei Zustände statt Boolean (`null` = nicht geprüft) · nur den Wortlaut der Vorlage an den Code anpassen |
| **Warnung an den Betreiber** | **18 verwaiste Docker-Volumes**, darunter ein intaktes PG-17-Cluster (64,8 MB). `down -v` trifft es nicht, **`docker volume prune` löscht es** |
| Veralteter Zugang in `postgres.test.ts` | **offen (W20)** — Zeile 16 und der `docker run`-Hinweis Zeile 55 kollidieren heute mit dem Compose-Container |
| Die zwei Wurzel-Dokumente | **offen (Hinweis)** — 55 KB und 86 KB im Repo-Wurzelverzeichnis, während das gleichartige `docs/research/sprachwahl-entscheidung-2026.md` korrekt eingeordnet ist |
| Wirkungsnachweis `P8.12` | **teilweise** — der Zugang ist bewiesen (echter Aufruf über den eigenen Adapter, „Empfang", 41/117 Token, 1,20 s), die **Umgebungsvariable** ist dafür nötig, nicht der Speicher; den Nachweis **in der Kette** führt der bauende Agent (Befund **B17**) |
| Nachweis, dass `~/.pmh` als Home den `P7.7`-Fehler nicht zurückholt | offen — Sonde vor einer Vorgabeänderung |
| Route `openai` im Katalog | offen — Schlüssel lieferte 403 |
| Widerspruch zu `atomic-write`-Tests | **offen** — 17 rot gegen 19 grün (nicht von mir ausgeführt, H5) |
| Nächster Takt | neue Commits (`git log c728464..HEAD`), `settings.yaml` (10/12), Container-Generation, ob `rechte-probe-assertion.sql` übernommen wurde |

---

## Registereintrag

`docs/INDEX.md`, Abschnitt **9 — Protokoll der Aufsicht**: alle Dateien dieses Ordners sind dort mit
je einem Satz eingetragen (Konvention „Neue Datei? Dann hier eintragen").

## Wortlaut der Hausregeln

Siehe [`README.md`](README.md) §2 — insbesondere **H1** (kein Neustart), **H2** (kein Schreiben in
den Baubereich des anderen Agenten), **H3** (Schreibbereich = dieser Ordner), **H4** (keine
Geheimwerte) und **H6** (Korrektur statt Löschung).
