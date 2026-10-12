# Backend-Analyse — Prometheus Harness

> **Zweck.** Diese Datei ist das Ergebnis von Aufgabe **t1**: vollständige Auswertung aller
> Dokumente unter `C:\Users\Chang\prometheus-harness\docs` — **ohne** die Ordner
> `docs\dsh` und `docs\design`. Sie hält fest, was die Doku über Architektur, Backend-Aufgaben,
> Schnittstellen und Datenmodell sagt, damit daraus das Mapping (t3) und die Implementierung
> (t4–t8) abgeleitet werden können.
>
> **Abgrenzung (belegt).** `docs\dsh` (Core-Doku-Bestand, 1412 Dateien) und `docs\design`
> (Gestaltungsbereich, 3 Dateien) wurden für diese Analyse **nicht gelesen**. Der Katalog
> `docs/INDEX.md` verweist auf beide; die dort genannten Inhalte sind hier **nicht** verwendet.
> Verweise auf `design/*` wurden aus den gelesenen Dokumenten nur als Querverweis übernommen,
> nicht inhaltlich ausgewertet.
>
> **Stand:** erstellt aus dem Doku-Bestand vom 12.10.2026.

---

## 1. Inventar der ausgewerteten Dokumente

Vollständige Liste aller Dateien unter `docs\`, die **nicht** in `docs\dsh` oder `docs\design`
liegen (21 Dateien; 9 Unterordner sind leer):

| # | Pfad (relativ zu `docs\`) | Größe | Ausgewertet |
|---|---|---|---|
| 1 | `.pmh.lnk` | 1.000 B | nein — Windows-Verknüpfung, kein Textdokument |
| 2 | `INDEX.md` | 7.510 B | ja |
| 3 | `concept.md` | 3.465 B | ja |
| 4 | `project-profile.md` | 5.448 B | ja |
| 5 | `risks.md` | 3.996 B | ja |
| 6 | `roadmap.md` | 818 B | ja |
| 7 | `stack.md` | 4.890 B | ja |
| 8 | `vision.md` | 7.305 B | ja |
| 9 | `decisions\open-questions.md` | 3.351 B | ja |
| 10 | `source\README.md` | 921 B | ja |
| 11 | `reference\reference-dsh.md` | 5.365 B | ja |
| 12 | `reference\reference-templates.md` | 2.555 B | ja |
| 13 | `reference\skills-index.md` | 4.105 B | ja |
| 14 | `reference\web-frontend.md` | 13.987 B | ja |
| 15 | `reference\webui-dev.md` | 4.259 B | ja |
| 16 | `reference\ChatGPT-stackexplane.md` | 15.673 B | ja |
| 17 | `reference\verify\review-r1-r2.md` | 5.498 B | ja |
| 18 | `reference\verify\webui-template-before.txt` | 2.594 B | ja — Manifest Web-UI-Vorlage, 22 Zeilen |
| 19 | `reference\verify\webui-template-after.txt` | 2.594 B | ja — identisch zu #18 |
| 20 | `reference\verify\core-template-before.txt` | 4.397.662 B | ja — Manifest Core-Vorlage, **27.093 Zeilen**; als Strukturquelle für t2 ausgewertet |
| 21 | `reference\verify\core-template-after.txt` | 4.397.662 B | ja — identisch zu #20 (Unversehrtheitsnachweis) |

**Leere Ordner (kein Inhalt, daher nichts auszuwerten):** `cookbook\`, `cordis-api\`,
`cordis-tutorial\`, `i18n\`, `persistence-changes\`, `postmortem\`, `subsystems\`,
`upgrade-guide\`, `user\`.

**Nicht ausgewertet (Ausnahme laut Auftrag):** `docs\dsh\` (3.650 Dateien in
`original/`, `translation_en/`, `translation_de/`) und `docs\design\` (3 Dateien:
`ui-keep-cut.md`, `sketches.md`, `realtime-collaboration.md`, dazu `README.md` und
`webdesign example\`). Beide wurden nicht geöffnet; ihr Inhalt fließt nirgends in diese
Analyse ein.

---

## 2. Systemarchitektur (aus den Dokumenten)

### 2.1 Leitbild

Ein **Assistent-Agent-Harness** auf Basis des DeepSeek Harness (DSH). Der DSH wird als
**Vorlage** benutzt, nicht als Codebasis besessen: „**Der Core wird benutzt, nicht
besessen**" (`concept.md`). Alles Zusätzliche ist eine steckbare **Unit** mit eigener Version;
der Core bleibt unangetastet.

Problem, das gelöst wird: Im Referenz-Fork lagen die Anpassungen in **56 fremden Dateien** und
**129 neuen Dateien quer über 16 Pakete**. Jeder Upstream-Sprung erzeugte Merge-Konflikte; die
Anpassung war „eingenäht" statt absteckbar (`concept.md`).

### 2.2 Die vier Regeln (verbindlich, aus `concept.md` / `vision.md`)

1. **Der Core ist unantastbar.** Keine Änderung in Upstream-Dateien; wer eine Änderung braucht,
   baut sie als Unit.
2. **Kein Unit importiert Interna des Cores** — nur öffentliche Steckplätze (`ctx.*`,
   Service-Interfaces, deklarierte Interface-Maps).
3. **Dienste starten mit der Harness.** Ein Dienst wird vom Unit gestartet, nicht vom Core
   eingebaut; ein fehlgeschlagener Start ist ein **sichtbarer Fehler**, kein stiller Ausfall.
4. **Sprachgrenzen sind Dienstgrenzen.** Der JS-Core bleibt der Kernel; jede andere Sprache ist
   ein **Prozess, den er aufruft**.

### 2.3 Unit-Modell

| Unit-Art | Was es tut | Beispiel (Doku) |
|---|---|---|
| `plugin` | Cordis-Plugin, in einen Bundle eingehängt | Multi-Modell-Router, Git-Panel |
| `service` | startet einen externen Dienst **mit** der Harness | Firecrawl, SearXNG, PostgreSQL |
| `patch` | Änderung an einer Core-Datei, die keinen Steckplatz hat | nur mit Begründung |
| `skill` | Agent-Skill ohne Host-Code | Selbstverbesserung |

Jedes Unit: **ein Ordner**, eine Version, deklarierte Abhängigkeiten, an- und absteckbar.

### 2.4 Schichtenbild (`stack.md`)

```
┌─────────────────────────────────────────────────────────────┐
│  Bedienoberfläche      TypeScript + React                   │
│                        Typecheck mit TypeScript 7           │
├─────────────────────────────────────────────────────────────┤
│  AGENT-CORE            TypeScript auf Bun          ◀ Kernel │
│  (Agent-Loop, Plugin-System, Sessions)                      │
│  Typecheck mit TS 7, Ausführung direkt durch Bun            │
├──────────────┬──────────────────────────┬───────────────────┤
│  Gateway     │  Sandbox + schwere Tools │  Dienste          │
│  Scheduler   │  Rust                    │  Firecrawl,       │
│  Go          │                          │  SearXNG, DB, …   │
└──────────────┴──────────────────────────┴───────────────────┘
```

**Die zusammen­haltende Regel (`stack.md`):** *Der JS-Core bleibt der Kernel. Jede andere
Sprache ist ein Dienst, den er aufruft.* Damit ist jede Sprachgrenze einzeln verschiebbar —
ein Dienst kann in Go entstehen, später nach Rust wandern, ohne dass der Core sich ändert.

### 2.5 Referenzarchitektur aus fremder Stellungnahme (`reference/ChatGPT-stackexplane.md`)

Neun Schichten, ausdrücklich als „modulare, selbst gehostete AI-Agent-Plattform":

| Schicht | Inhalt |
|---|---|
| Docking-Station UI | Workspace · Graph View · Projektbaum · Terminal · Chat · Research |
| Harness Core | Agent Runtime · Decision Engine · Tool Registry · Policies · Event Bus |
| Agent Intelligence | Planner, Executor, Reviewer, Evaluator |
| Memory & Knowledge | PostgreSQL, Vektoren, Redis, Obsidian |
| Research Engine | SearXNG, Firecrawl, OCR, Quellenverwaltung |
| Execution & Experiments | Docker/Podman, Git, Tests, Training, Rollback |
| Infrastructure & Integrations | Model APIs · lokale Modelle · Forgejo/GitLab · Remote IDE · WireGuard/Tailscale |

Darin: Trennung von Oberfläche, Agent-Logik und Infrastruktur, damit Komponenten einzeln
ersetzbar sind. Empfohlener Ablauf eines Durchlaufs (Decision-Engine-Kapitel):

1. LLM erstellt Plan oder schlägt Patch vor.
2. Decision Engine entscheidet anhand definierter Kriterien den nächsten Schritt.
3. Harness prüft Berechtigungen und Grenzen **unabhängig vom Modell**.
4. Schritt wird ausgeführt.
5. Evaluator prüft das Ergebnis.
6. Experiment wird dokumentiert und **akzeptiert, wiederholt oder zurückgerollt**.

**Harte Regel daraus:** *Das Decision Model darf keine Sicherheitsregeln überschreiben.* Ein
Modell kann eine Aktion empfehlen; die ausführende **Policy** entscheidet, ob sie zulässig ist.

### 2.6 Datenfluss (aus Doku zusammengesetzt)

```
Oberfläche (React/TS, apps/web)
   │  HTTP/WS an Host (apps/cli, TS — NICHT Go)
   ▼
Agent-Core (TypeScript auf Bun, Kernel, Cordis-Plugin-System)
   ├─ ctx.*-Steckplätze ──▶ Units (plugin / skill / patch)
   ├─ Dienst-Aufrufe (Prozessgrenze!) ──▶ Go: Gateway/Scheduler/Supervisor
   │                                   ──▶ Rust: Sandbox, Parser/Index, Krypto
   │                                   ──▶ externe Dienste: Firecrawl, SearXNG, Tesseract, n8n
   ├─ Session-/Event-Modell ──▶ Persistenz (JSONL-Session-Dateien im Home, z. B. `$DSH_HOME`)
   └─ Gedächtnis/Wissen ──▶ PostgreSQL + pgvector · Redis · Obsidian-Vault (Markdown/Wikilinks)
```

Belegt durch: `reference/web-frontend.md` §10 (Host = `apps/cli` in TypeScript, **nicht** Go),
`stack.md` (Gateway/Supervisor in Go), `vision.md` (Speicher-Schicht), `reference-dsh.md`
(Home-Verhalten, JSONL-Dauerhaftigkeit via `koffi`).

---

## 3. Backend-Aufgaben (Dienste, Jobs, Worker, Orchestrierung)

### 3.1 Kernel-Aufgaben (TypeScript/Bun — bleiben im Core)

| Aufgabe | Beschreibung | Beleg |
|---|---|---|
| **Agent-Loop** | Kernschleife des Agenten; der DSH hat bereits einen | `vision.md`, `stack.md`, `reference-dsh.md` |
| **Plugin-/Unit-System** | Cordis: Plugins sind JS-Module über `ctx.*`; **muss** JS sein | `concept.md`, `stack.md` |
| **Session-Modell** | Sitzungen samt Persistenz und Formatversionen | `vision.md`, `stack.md` |
| **Kompositionsformat** | Bundle/Komposition mehrerer Plugins zum „echten Agenten" | `concept.md` (Upstream-Zitat), `vision.md` |
| **LLM-Adapter** | Modell-Anbindung; erster Baustein der kleinsten Kette | `decisions/open-questions.md` §3 |
| **Anwendungseinstieg** | Host, der die Oberfläche ausliefert | `reference/web-frontend.md` §1, §10 |
| **Language-Pack-Steckplatz** | `LocaleRuntime.addLanguage` — existiert im DSH, wird von niemandem benutzt; DE-Übersetzung wäre **ein Paket** statt 59 geänderter Dateien | `decisions/open-questions.md` §7 |
| **Multi-Modell-Router** | im DSH **nicht vorhanden** → eigene Entwicklung | `reference-dsh.md` |

### 3.2 Go-Aufgaben (Vorschlag — laut Doku durch Messung zu belegen)

| Aufgabe | Begründung in der Doku | Status |
|---|---|---|
| **Startup-Supervisor** | „Dienste starten mit der Harness" ist Anforderung mit klarem Nutzen und **ohne Semantik-Duplikat**; Kindprozesse starten, überwachen, neu starten, sauber beenden | **Neigung: zuerst** (`open-questions.md` §4, `stack.md`) |
| **Gateway** | viele gleichzeitige Sitzungen, Streams, Verbindungen. **Warnung:** Das Gateway des Referenz-Harness ist ~1.600 Zeilen und lebt davon, in Session- und Event-Modell eingepasst zu sein (Stream-Protokoll, Remote-Events) — in Go heißt das: dieselbe Semantik nachbauen und gegen jede Core-Änderung nachziehen. **Erst wenn Lastmessungen es als Engpass zeigen.** | Vorschlag (`stack.md`) |
| **Scheduler** | Nebenläufigkeit | Vorschlag (`stack.md`) |
| **Datei- und Git-Anbindung** | Go hat solide Standardbibliothek dafür | Vorschlag (`stack.md`) |

### 3.3 Rust-Aufgaben (Vorschlag — „stärkster Fall der drei")

| Aufgabe | Begründung |
|---|---|
| **Sandbox** | Referenz-Harness hat bereits Sandbox-Pakete für **Windows-ACL** und **Landlock** (Linux) — Betriebssystemarbeit, wo Rusts Speichersicherheit und FFI-Ergonomie tragen. **Neigung: zuerst** |
| **Schwere Werkzeuge** | Parsing, Indizierung, Kryptografie |
| **Muster existiert schon** | `native/system` im Referenz-Harness ist ein kleines C-Programm (Dateisperre per `flock`), verpackt als eigenes Paket, vom JS aufgerufen — Rust braucht **kein neues Konzept**, nur ein weiteres Paket nach diesem Muster |

### 3.4 Dienste und Infrastruktur (starten mit der Harness)

| Baustein | Rolle | Beleg |
|---|---|---|
| **PostgreSQL + pgvector** | strukturierte Daten **und** Vektorähnlichkeit in einem System | `vision.md`, `project-profile.md` |
| **Redis** | Zwischenspeicher und Nachrichtenverteilung — „erst bei belegtem Bedarf" | `project-profile.md`, `vision.md` |
| **Obsidian** | Gedächtnis als Markdown-Dateien, Graph View als Wissensnetz | `vision.md` |
| **Firecrawl** | Web-Extraktion | `vision.md` |
| **SearXNG** | Metasuche | `vision.md` |
| **Tesseract** | OCR (Apache 2.0); für Layout/Diagramme mit Vision-Modell kombinieren | `vision.md`, `ChatGPT-stackexplane.md` |
| **n8n** | Workflow-Automatisierung (extern, **nicht** Kern-Orchestrierung) | `vision.md`, `ChatGPT-stackexplane.md` |
| **Jev / Laya** | System-One-Entscheidungsmodelle: Zustand + strukturierte Frage → **typisierte Wahrscheinlichkeitsentscheidung**, kein Text | `vision.md` |
| **Git: Forgejo / Gitea / GitLab CE** | eigene Git-Anbindung, Auswahl offen | `vision.md`, `project-profile.md` |
| **code-server / OpenVSCode / Theia** | Entwicklungsumgebung im Browser | `vision.md` |
| **Tailscale oder WireGuard** | Fernzugriff | `vision.md` |
| **Docker/Podman** | Ausführung und Experimente, Rollback | `ChatGPT-stackexplane.md` |

**Wo Jev/Laya im Harness hingehören** (`vision.md`): **nicht** als Ersatz für den Agent-Loop,
sondern für **begrenzte Entscheidungen am Rand** — Werkzeugwahl, Rückfrage ja/nein, Umschaltung
zwischen Modellen, „ist das erledigt?". Beispiele, die im Referenz-Harness heute einen vollen
Modellaufruf kosten: **Vision-Umschaltung, Fehlklassifikation, Eskalation**.

### 3.5 Agent-Intelligence-Rollen

| Rolle | Aufgabe | Beleg |
|---|---|---|
| Planner | zerlegt Aufgabe | `ChatGPT-stackexplane.md` |
| Executor | führt aus | dito |
| Reviewer | prüft | dito |
| Evaluator | bewertet Ergebnis, akzeptiert/wiederholt/rollt zurück | dito |
| Agent-Teams (Roster, Postfächer, Task-Board) | **im DSH schon vorhanden** → nicht doppelt bauen (`experimental/agent-team` + `-profile` + `tool-` + `client-ui-`) | `reference-dsh.md` |

### 3.6 Orchestrierungs-Kernfrage (offen, blockiert Code)

`vision.md`: Der Harness **hat bereits** einen Agent-Loop und ein Multi-Agenten-System. Ein
zweites Orchestrierungs-Framework (LangChain/LangGraph) darüber erzeugt **zwei konkurrierende
Loops**. Kernfrage: **Welcher Loop gewinnt?** Muss vor der ersten Zeile Code entschieden
werden (`decisions/open-questions.md`).

`ChatGPT-stackexplane.md` ergänzt: LangChain/LangGraph sind im Python-Ökosystem verankert; wenn
Python vermieden wird, **nicht** als obligatorische Abhängigkeit vorsehen. Stattdessen die
Konzepte übernehmen: graph-basierte Workflows, persistente Checkpoints,
Wiederaufnahme nach Fehlern, Human-in-the-loop, Tool-Routing, strukturierte Zustände. Erste
Empfehlung: **kleiner eigener Workflow-Executor**, später prüfen, ob ein externer Adapter nötig ist.

---

## 4. Schnittstellen und Protokolle

### 4.1 Sprachgrenze Core ↔ Dienste (die zentrale Schnittstelle)

**Regel:** Jede andere Sprache ist ein **Prozess**, den der Core aufruft (`stack.md`,
`concept.md` Regel 4). Muster im Referenz-Harness: kleines Binary, **verpackt als eigenes
Paket**, vom JS aufgerufen (`native/system` → `flock`). Dieses Muster gilt für Go- und
Rust-Dienste gleichermaßen (`reference-dsh.md`: „Das ist das Muster für unsere Sprachgrenzen").

Folgen für die Umsetzung:
- **Transport:** Prozessgrenze. Damit sind die Schnittstellen, die die Doku belegt: `stdin`/`stdout`,
  Argumente/Flags, Exit-Codes. Für langlebige Dienste (Supervisor, Gateway) zusätzlich ein
  Netzwerkprotokoll (HTTP/WebSocket), weil der Core Streams und Remote-Events kennt.
- **Fehlerverhalten:** Start-Fehler sind **sichtbar** zu machen (Regel 3).
- **Kein Import von Core-Interna** (Regel 2) — die Dienstgrenze ist auch die
  Abhängigkeitsgrenze.

### 4.2 Home-Verzeichnis und Trennung zweier Installationen

Belegt in `reference-dsh.md`: Der Core liest **`$DSH_HOME`** und fällt sonst auf **`~/.dsh`**
zurück (`packages/util/home-paths`, **208 Fundstellen**). Deshalb lassen sich zwei
Installationen sauber trennen — `~/.dsh` und `~/.pmh` — **ohne eine Zeile Core-Änderung**.

> **Betriebsrisiko (`risks.md` §5):** `~/.pmh` und `~/.dsh` haben getrennte
> Credential-Dateien, aber zwei gleichzeitig laufende Instanzen könnten beim Start um die
> Store-Auswahl konkurrieren. Gegenmaßnahme: schreibende Modell-Konfiguration nur in **einer**
> Instanz gleichzeitig ändern.

### 4.3 Oberfläche ↔ Host

`reference/web-frontend.md`:
- Die Oberfläche liegt in **`apps/web`** (aus der Vorlage übernommen: „derselbe Ort, dieselbe
  Rolle"); dort `index.html` + `src/` + `vite.config.ts`.
- **Host, der das gebaute `dist/` ausliefert: `apps/cli` in TypeScript (`dsh web`) — nicht Go**
  (§1 und §10.2 ausdrücklich).
- `website/` ist die **VitePress-Dokumentationsseite**, **nicht** die App-Oberfläche.

### 4.4 HTTP-Endpunkte der Go-Vorlage (Referenz, nicht unsere)

`reference/webui-dev.md` dokumentiert die Go-Endpunkte der **Vorlage-WebUI**
(`internal/web/web.go`), die `src/lib/api.js` aufruft:

| Endpunkt | Rolle |
|---|---|
| `/api/status` | Zustand |
| `/api/history` | Verlauf |
| `/api/voice` | Sprache |
| `/api/model` | Modell |
| `/api/settings` | Einstellungen |

Der Go-Dienst gehört auf **Port 8080** (so steht es im Proxy von `vite.config.js` der Vorlage).

**Einordnung — wichtig für t6:** Diese Endpunkte gehören zur **verworfenen** Vorlage
`H:\Projekt\Programmieren\Prometheus\webui` (Svelte 5 + Vite 8), deren Go-Dienst laut Testlauf
**nicht lief**. Sie sind als *beobachtbares Verhalten einer Referenz* dokumentiert, nicht als
Vorgabe für Prometheus Harness. Für unseren Go-Dienst ist die Doku-Lage:
Startup-Supervisor zuerst (`open-questions.md` §4), Gateway erst bei belegtem Engpass
(`stack.md`).

### 4.5 Native Addons des Referenz-Harness (Schnittstelle Core ↔ Betriebssystem)

| Addon | Wofür | Risiko |
|---|---|---|
| `koffi` | **JSONL-Dauerhaftigkeit**, `MoveFileExW` mit **Write-Through** (Windows) | **hoch** |
| `node-pty` | **persistentes Terminal**, ConPTY auf Windows | mittel |

`koffi` ist kritisch: Der Referenz-Harness **baut es aus dem Quellcode**, weil Prebuilts unter
GCC 13 scheitern (belegt in dessen `pnpm-workspace.yaml`). Ob beide Addons unter **Bun** laufen,
ist **ungeprüft** (`stack.md`, `risks.md` §1) — die erste Messung, die ansteht (`roadmap.md`).

**Rückfallweg, falls die Messung negativ ausfällt** (`risks.md` §1, `open-questions.md` §1),
in dieser Reihenfolge: (a) Ersatz-Addon suchen, (b) die betroffene Fähigkeit als **eigenen
Dienst aus dem Core herausziehen** (passt zur Architektur), (c) Laufzeit auf **Node** bleiben
lassen und TS 7 nur als Typecheck nutzen.

### 4.6 Werkzeuge/CLI-Kommandos (belegt)

| Kommando | Bedeutung | Quelle |
|---|---|---|
| `bun run dev` | Dev-Server, HMR, Port 5175, `host: 127.0.0.1`, `strictPort` | `web-frontend.md` §5 |
| `bun run typecheck` | TypeScript 7 (`tsgo --noEmit`) prüft, schreibt nichts | dito |
| `bun test` | Tests (Struktur-Abnahme) | dito |
| `bun run build` | Produktionsbuild nach `dist/` | dito |
| `pnpm install --frozen-lockfile` | Referenz-Core: exit 0 (~27 s) | `reference-dsh.md` |
| `pnpm run build` | Referenz-Core: **baut über `tsx scripts/build.ts`**; exit 0, 212,9 s, 357 Client-Artefakte | dito |
| `tsc -b tsconfig.host.json` | Referenz-Core, TS 6.0.3: exit 0, 124,5 s, 0 Meldungen | dito |
| `bin.ts web --port …` | Referenz-Boot: läuft, HTTP 200, Web-Oberfläche wird ausgeliefert | dito |

**Fallstrick (`reference-dsh.md`):** Zerlegte Einzelaufrufe (`tsc -b tsconfig.client.json` ohne
vorherigen Host-Build) scheitern mit Hunderten Folgefehlern — Bedienfehler, kein Codefehler.

### 4.7 TypeScript 7 — Schnittstellenfolgen

| Compiler | Host-Build | Dauer |
|---|---|---|
| 6.0.3 (im Harness) | exit 0 | 124,5 s |
| 7.0.2 (`latest`) | **1430 Fehler** | 17,2 s |
| 7.1.0-dev (`next`) | 1430 Fehler (identisch) | **12,7 s** |

Die 1430 Fehler sind **ausnahmslos Werkzeuge**: 1411 in `scripts/`, 19 in
`packages/`+`apps/` (und die 19 wieder in Build-/Dev-Werkzeugen). Jede betroffene Datei beginnt
mit `import ts from 'typescript'`. **Kein Laufzeitcode betroffen.**

Neue API statt flacher Funktionssammlung: `API → Project → Program → Snapshot`; nutzbar über
`typescript/sync`, `typescript/async`, `typescript/ast`, `typescript/ast/is`. Fehlen u. a.
`createSourceFile`, `forEachChild` (neu: `getChildren` / `visitEachChild`).

**Blocker:** `pnpm-workspace.yaml` → `peerDependencyRules.allowedVersions.typescript: '>=5 <7'`
blockt TS 7. Erst auf `<8` heben, **wenn die Werkzeuge portiert sind**, sonst bricht
`pnpm run build`. Bei uns entfallen die Skripte mit Bun (`stack.md`) — wir schreiben sie nicht neu.

### 4.8 Sprache und Übersetzung

`decisions/open-questions.md` §7: Der Referenz-Harness hat einen **Language-Pack-Steckplatz**
(`LocaleRuntime.addLanguage`), der ausdrücklich „when a language-pack plugin adds a selectable
language" existiert und von niemandem benutzt wird. Eine deutsche Übersetzung wäre damit **ein
Paket** statt 59 geänderter Dateien.

---

## 5. Datenmodell, Persistenz, Konfiguration

### 5.1 Persistenz-Schichten (drei Ebenen, nicht konkurrierend)

| Ebene | System | Verantwortung |
|---|---|---|
| Dauerhafte strukturierte Wissensbasis | **PostgreSQL + pgvector** | Agent-Runs, Skills, Dokumente, Quellen, Experimente, Embeddings, Beziehungen |
| Kurzlebig | **Redis** | Cache, Queue, Rate Limits, Statusinformationen |
| Menschenlesbar | **Obsidian-Vault** (Markdown + Wikilinks) | Notizen, Research-Zusammenfassungen, verlinkte Konzepte, Agent-Doku; mit Git versionierbar |
| Versionierung | **Git** | Code, **Prompts**, **Skills**, Experimente |

**Regel aus `ChatGPT-stackexplane.md`:** Nicht blind beide Systeme (PostgreSQL und Obsidian)
in beide Richtungen synchronisieren, sondern **definieren, welches System für welchen Datentyp
verantwortlich ist**. Und: Für echte Wissensgraph-Abfragen die Beziehungen **zusätzlich
strukturiert** speichern, statt nur Obsidian-Links zu zeichnen.

### 5.2 Session-Persistenz im Core

`risks.md` §1: `koffi` wird für **„JSONL-Dauerhaftigkeit"** mit `MoveFileExW` +
`MOVEFILE_WRITE_THROUGH` gebraucht. Daraus folgt: Die Session-Dauerhaftigkeit des Cores ist
**JSONL-basiert**, mit einem Schreibpfad, der einen atomaren/Write-Through-Rename verlangt.

### 5.3 Der offene Konflikt im Datenmodell

`vision.md`: Wenn Obsidian das Gedächtnis **ist**, liegt es in **Dateien mit Markdown und
Wikilinks** — nachvollziehbar, versionierbar, im Graph View sichtbar, aber eine Festlegung, die
später teuer zu ändern ist. **Und es braucht eine Antwort auf gleichzeitige Schreibzugriffe.**
Ob Obsidian das Gedächtnis *ist* oder nur eine **Ansicht**, ist offen
(`project-profile.md` §5, `open-questions.md`).

### 5.4 Konfigurationsfläche

| Feld | Verhalten | Quelle |
|---|---|---|
| `DSH_HOME` (bzw. `PMH_HOME`) | Home-Verzeichnis; Fallback `~/.dsh` (neu: `~/.pmh`); 208 Fundstellen im Referenz-Core | `reference-dsh.md`, `risks.md` §5 |
| Credential-Dateien | je Home getrennt (`~/.dsh` vs `~/.pmh`) — kein Code-Eingriff nötig | `risks.md` §5 |
| Ports | Oberfläche **5175** (`strictPort`), Host `127.0.0.1`; Referenz-Vorlage **5174**; Go-Vorlage **8080**; 5173 ist auf dem Rechner belegt | `web-frontend.md` §5, `webui-dev.md` |
| Peer-Dependency-Regel | `allowedVersions.typescript: '>=5 <7'` — Blocker für TS 7 | `reference-dsh.md` |
| Vite-Proxy | Proxy auf den Go-Dienst (Port 8080) in der Vorlage | `webui-dev.md` |

### 5.5 Daten- und Strukturvorgaben aus der Vorlage (`core-template-before.txt`)

Das Manifest der Core-Vorlage ist selbst eine Strukturquelle: **27.093 Dateien** (ohne
`node_modules/` und `.git/`), Format `relativer\Pfad|Größe|Änderungszeit|SHA-256`.
Es belegt unter anderem die Top-Level-Ordner `apps/`, `packages/`, `native/`, `python/`,
`scripts/`, `website/`, `vendor/`, `patches/`, `units/`, `benchmarks/`, `snapshots/`,
`assets/`, `.agents/`. Ausgewertet wird es in **t2** (Struktur-Inventar der Vorlage).

### 5.6 Native Sprachgrenze im Referenz-Harness (Ist-Zustand)

`reference-dsh.md`: Der einzige Nicht-JS-Code ist winzig —

```
native/system/packages/entry/src/main.c    ← C, Dateisperre (flock)
python/sdk/                                ← Python, aber nur ein Client-SDK
```

**Kein Rust, kein Go.** Das ist das Muster für unsere Sprachgrenzen.

> **Korrektur nach Einsicht in die Vorlage (t2).** Die Angabe „`main.c` = Dateisperre
> (flock)" aus `reference-dsh.md` ist **unvollständig**. Das Inventar der Vorlage zeigt
> **zwei** C-Programme in `native/system/packages/entry/src/`:
>
> | Datei | Aufgabe |
> |---|---|
> | `main.c` (298 Zeilen) | **`landlock-run`** — ein Landlock-Launcher: er legt ein Landlock-Ruleset auf sich selbst und `exec`t den eingehüllten Befehl. CLI-Vertrag in `native/system/docs/cli-contract.md`. |
> | `flock.c` (164 Zeilen) | **Node-API-v8-Bindung** für asynchrones `flock(fd, LOCK_EX \| LOCK_NB)`. Vertrag in `native/system/docs/flock-contract.md`. |
>
> Beide sind Teil desselben npm-Pakets `@deepseek-ai/node-addon-system`. Der Launcher ist
> **Sandbox-Infrastruktur** (nicht Dateisperre); die Dateisperre ist die Node-API-Bindung.
> Für die Rust-Übertragung ist das der entscheidende Befund: Rust tritt die Nachfolge
> **beider** C-Programme an — siehe `MAPPING.md`. Details:
> `docs/reference/inventory-config-native.md` und
> `docs/reference/inventory-source-backend.md` §6.1.

---

## 6. Was der Referenz-Harness schon kann — nicht doppelt bauen

| Fähigkeit | Paket | Bei uns |
|---|---|---|
| Datei-Karte im Composer | `client/ui-attachment` → `FileCard.tsx` | nicht nachbauen |
| Datei-Upload | `client/file-upload` | nicht nachbauen |
| Office → PDF | `document/office-to-pdf` | nicht nachbauen |
| Dokument-Vorschau | `client/ui-sidebar-documentpreview` | nicht nachbauen |
| Office-Skill | `skill/skill-office` | nicht nachbauen |
| Agent-Teams (Roster, Postfächer, Task-Board) | `experimental/agent-team` + `-profile` + `tool-` + `client-ui-` | nicht nachbauen |
| **Multi-Modell-Router** | **nicht vorhanden** | **eigene Entwicklung** |
| **Git-Panel** | **nicht vorhanden** | **eigene Entwicklung** |

---

## 7. Reihenfolge und Geltungsbereich (was zuerst gebaut wird)

`concept.md` / `roadmap.md`:

1. **Core läuft** — Agent-Core auf TypeScript/Bun, ein Modell angebunden, Chat funktioniert.
2. **Ein Unit beweist die Kette** — Paket, Registrierung, Test, im GUI sichtbar, absteckbar.
3. **Erst dann Sprachgrenzen** — jede Auslagerung nach Go oder Rust wird mit einer **Messung**
   begründet, nicht mit einer Vorliebe.

`roadmap.md` (Stand der Doku): **Noch kein eigener Code.** Der nächste Schritt ist die
**Bun-Messung** (`koffi`, `node-pty`). Fällt sie negativ aus, bleibt Node die Laufzeit und TS 7
wird nur der Typecheck — sonst ändert sich nichts.

**Für die Backend-Übertragung bedeutet das:** Die Doku legt die **Architektur, die Regeln und
die Dienstgrenzen** fest, aber sie legt **nicht** fest, dass Gateway/Scheduler schon jetzt in
Go entstehen. Die Doku-Neigung ist eindeutig: **Go zuerst als Startup-Supervisor**, **Rust
zuerst als Sandbox**. Code, der über diesen belegten Umfang hinausgeht, ist eine
Architekturentscheidung, die im Mapping (t3) ausdrücklich als solche gekennzeichnet wird.

---

## 8. Offene Punkte aus der Doku (beeinflussen das Backend)

| # | Offene Frage | Hängt ab von | Neigung in der Doku |
|---|---|---|---|
| 1 | Laufzeit des Agent-Cores (Bun · Node · beide) | Bun-Messung (native Addons) | **Bun** (TS direkt, TS 7 separat als Typecheck); Rückfall Node |
| 2 | Umfang des Cores | wie viel ersetzt werden soll | **Cordis nicht nachbauen** — Seam ist erprobt und dokumentiert |
| 3 | Erster Baustein nach der Bun-Messung | was zuerst sichtbar läuft | kleinste Kette: **Adapter, Loop, Einstieg** |
| 4 | Wo Go beginnt | Lastmessungen am TS-Core | **Startup-Supervisor zuerst**; Gateway erst bei belegtem Engpass |
| 5 | Wo Rust beginnt | was rechenintensiv/sicherheitskritisch wird | **Sandbox zuerst** (Windows-ACL, Landlock; Muster `native/system`) |
| 6 | Verhältnis zum DSH langfristig | Upstream-Pflege vs. Eigenständigkeit | **Hybrid**: Core vom Upstream, Fähigkeiten als Units |
| 7 | Sprache der Oberfläche / Übersetzungen | ob Mehrsprachigkeit von Anfang an vorgesehen ist | Language-Pack als **ein Paket** |
| 8 | Verbleibende Aufräumarbeiten | — | `C:\Users\Chang\dsh-de` (Patch gesichert), `dsh-stack`, `apiproxy`-Analyse geparkt; Units `crew`, `ui-git`, `ui-settings-crew` geparkt bis der Core steht |

---

## 9. Risiken mit Backend-Bezug

| # | Risiko | Messung, die es klärt | Wenn es scheitert |
|---|---|---|---|
| 1 | **Bun + native Addons** (`koffi` hoch, `node-pty` mittel) — höchste Priorität | Bun installieren, im Referenz-Fork beide Addons laden und je eine **echte Operation** ausführen: PTY öffnen/senden/lesen/schließen; `MoveFileExW` mit `MOVEFILE_WRITE_THROUGH` binden und Datei schreiben | (a) Ersatz-Addon, (b) Fähigkeit als eigenen Dienst herausziehen, (c) Node als Laufzeit + TS 7 nur Typecheck |
| 2 | **TypeScript 7 vs. Build-Werkzeuge** — bekannte Größe: 288 Skripte nutzen die alte Compiler-API (132 Funktionen) | Mit Bun entfallen die Skripte; TS 7 als Typecheck läuft fehlerfrei | Generatoren gegen die **neue** API schreiben (`typescript/ast`, `typescript/sync`), nie gegen die alte; Peer-Regel erst nach Portierung anheben |
| 3 | **Drei Sprachen gleichzeitig** — Zeitrisiko, jeder Fehler mehrdeutig | Gegenmaßnahme: Reihenfolge Core → Unit → Sprachgrenzen; jede Auslagerung mit Messung begründen | — |
| 4 | **Core-Abwanderung vom Upstream** — Verlust von Fehlerbehebungen/Sicherheitsupdates | Core am Upstream halten, Fähigkeiten als Units; Referenz-Fork als Vergleichsobjekt | Drift wird sichtbar, bevor sie teuer ist |
| 5 | **Geteiltes Home** — Betriebsrisiko | `~/.pmh` und `~/.dsh` haben getrennte Credential-Dateien; zwei Instanzen könnten um die Store-Auswahl konkurrieren | Schreibende Modell-Konfiguration nur in einer Instanz gleichzeitig ändern |

**Erledigt und dokumentiert (`risks.md`):**
- **pnpm-Junctions mit absolutem Pfad** — jeder Umzug des Checkouts braucht
  `pnpm install --force`; belegt: ~1400 Junctions zeigten nach einem Umzug ins Leere,
  Boot scheitert mit `ERR_MODULE_NOT_FOUND`.
- **`AGENTS.md` des Upstream liegt im Repo-Wurzelverzeichnis** — der Agent lädt ihn
  automatisch; bei Arbeit im Fork erwünscht, kein Konflikt.
- **Ordnernamen, die sich nur in Groß-/Kleinschreibung unterscheiden, sind unter Windows eine
  Datei** (`web-frontend.md` §8: `src/app.css` vs. `src/App.css` überschrieben sich; die Seite
  blieb weiß). Auf Linux/CI sind es zwei — Namen müssen sich deutlicher unterscheiden.

---

## 10. Nachweis der Abgrenzung (Auftrag: `docs\dsh` und `docs\design` ignorieren)

| Prüfung | Ergebnis |
|---|---|
| Dateien unter `docs\` gesamt | 1.436 |
| davon in `docs\dsh\` | 1.412 — **nicht geöffnet** |
| davon in `docs\design\` | 3 — **nicht geöffnet** |
| ausgewertet | **21** (davon 1 `.lnk`, 2 identische Manifest-Zwillingspaare) |
| Quelle der Analyse | ausschließlich die 21 Dateien der Tabelle in §1 |
| `docs\design\*`-Verweise in dieser Datei | nur als Querverweis übernommen, inhaltlich **nicht** ausgewertet (in §1 und §7 ausdrücklich vermerkt) |

**Zählmethode:** `Get-ChildItem -Recurse -File` über `docs\` mit Ausschlussfilter auf die beiden
Ordner; Zahlen und Pfade stehen in §1. Die neun leeren Unterordner sind mitgezählt und
namentlich aufgeführt.

---

## 11. Konsequenzen für t2–t8 (Kurzfassung)

| Aufgabe | Was diese Analyse vorgibt |
|---|---|
| **t2** | Vorlage inventarisieren; das Manifest `reference/verify/core-template-before.txt` (27.093 Einträge) liefert die vollständige Struktur, ohne die Vorlage zu verändern |
| **t3** | Mapping mit **belegtem** Umfang (Supervisor in Go, Sandbox in Rust) und **gekennzeichneten** Architekturentscheidungen darüber hinaus; Multi-Modell-Router und Git-Panel sind laut Doku **Eigenentwicklung** |
| **t4** | Zielstruktur folgt der Vorlage (`apps/`, `packages/`, `native/`, `scripts/`, `units/`); Oberfläche bleibt in `apps/web`, Host in `apps/cli` (**TS, nicht Go**) |
| **t5** | Idiomatisch je Sprache; die vier Regeln sind einzuhalten: Core unantastbar, keine Core-Interna importieren, Dienste starten sichtbar, Sprachgrenze = Prozessgrenze |
| **t6** | Schnittstellen: Prozessgrenze (`stdin`/`stdout`/Exit-Codes) für Go/Rust-Dienste, HTTP/WS für langlebige Dienste, HTTP für die Oberfläche; Ports 5175 / 8080 laut Doku |
| **t7** | Persistenz in drei Ebenen (PostgreSQL+pgvector, Redis, Obsidian-Markdown) plus JSONL-Session-Dauerhaftigkeit im Core; Konfiguration über `PMH_HOME`/`DSH_HOME` mit Fallback `~/.pmh` bzw. `~/.dsh` |
| **t8** | Build und Test je Sprache; Startdoku analog `web-frontend.md` §5 (Bun-Kommandos) und §4.7 (Typecheck mit TS 7) |
