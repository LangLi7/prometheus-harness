# MAPPING — Vorlage (TypeScript/C/Python) → Prometheus Harness (Go · Bun/TS7 · Rust)

> **Zweck.** Ergebnis von Aufgabe **t3**: vollständiges Mapping jeder Backend-Komponente der
> Vorlage `C:\Users\Chang\harness\prometheus-harness` auf eine Komponente im Zielprojekt
> `C:\Users\Chang\prometheus-harness` in **Golang**, **Bun/TypeScript 7** und **Rust**.
> Jede relevante Komponente bekommt eine Entsprechung **oder** eine ausdrückliche Begründung,
> warum sie entfällt.
>
> **Grundlage.** `docs/backend-analysis.md` (t1, Doku-Auswertung ohne `docs\dsh` und
> `docs\design`), `docs/reference/inventory-source-backend.md` (t2, Struktur-Inventar) und
> die fünf Vertiefungsdateien `docs/reference/inventory-*.md`.
>
> **Leitregel (aus `docs/stack.md`, verbindlich):** *Der JS-Core bleibt der Kernel. Jede
> andere Sprache ist ein Dienst, den er aufruft.* Daraus folgt für dieses Mapping: **Go und
> Rust sind Prozesse hinter einer Prozessgrenze**, keine Bibliotheken im Core.

---

## 1. Ausgangslage: Was überhaupt zu übertragen ist

Die Aufgabe lautet, Python- und C++-Komponenten auf Go/Bun/TS7/Rust abzubilden. Das
Inventar der Vorlage (t2) zeigt, was tatsächlich existiert:

| Erwartet | Befund in der Vorlage | Konsequenz |
|---|---|---|
| Python-Backend | **existiert nicht.** Python gibt es **nur** als Client-SDK: `python/sdk` (47 Dateien, 5 Module) | Kein Python-Backend wird übersetzt. Das SDK wird zur **Schnittstellenspezifikation** für den Go-Dienst und den TS-Client. |
| C++-Backend | **existiert nicht.** Kein C++ im Repo | — |
| C-Code | **zwei** C-Programme in `native/system/packages/entry/src/`: `main.c` (`landlock-run`, 298 Z.) und `flock.c` (Node-API-Bindung, 164 Z.) | **Rust übernimmt beide.** |
| Go-Code | **existiert nicht** | Go ist **Neuland**: Supervisor und Gateway werden **neu** gebaut, nicht übersetzt. |
| TypeScript-Backend | **der gesamte Rest** (~340 Pakete) | Größter Teil des Mappings: TS bleibt TS, aber auf **Bun** und gegen **TS 7**. |

> **Präzisierung der Aufgabe.** Es wird **kein fremder Python- oder C++-Code portiert**, weil
> es keinen gibt. Übertragen werden (a) die **Struktur**, (b) die **Schnittstellen und das
> Verhalten** der TypeScript-Backends und (c) die **zwei C-Programme**. Der neue Stack ist
> eine **Neuimplementierung entlang der Vorlage** — genau wie `docs/concept.md` es fordert
> („Vorlage, nicht Codebasis"; „Wir kopieren nicht 14.990 Dateien und schneiden darin").

### 1.1 Die entscheidende Architekturentscheidung dieses Mappings

Die Doku des Zielprojekts nennt **ein** Risiko mit höchster Priorität
(`docs/risks.md` §1): **Bun und native Addons** — `koffi` (JSONL-Dauerhaftigkeit,
`MoveFileExW` mit Write-Through) und `node-pty` (persistentes Terminal). „Ob beide Addons
unter Bun laufen, ist **ungeprüft**."

**Dieses Mapping löst dieses Risiko strukturell auf, statt es zu messen.** Beide nativen
Fähigkeiten werden **aus dem JS herausgezogen und zu Prozessen** gemacht, die der Core
aufruft:

| Addon | Warum es im Referenz-Harness existiert | Auflösung hier |
|---|---|---|
| `koffi` | Windows-`MoveFileExW` mit `MOVEFILE_WRITE_THROUGH` für **JSONL-Dauerhaftigkeit** und atomare Renames | **Rust-Dienst `pmh-atomicfs`** (Write-Through-Write + atomarer Rename + Report) — der Core ruft ihn als Prozess. Die JSONL-Persistenz selbst bleibt in TS (sie ist Logik, nicht Syscall). |
| `node-pty` | persistentes Terminal, **ConPTY** auf Windows | **Rust-Dienst `pmh-pty`** (PTY öffnen/schreiben/lesen/größe/schließen, ConPTY auf Windows, `openpty` auf POSIX) |

Beide sind genau nach dem **Muster, das die Vorlage selbst beweist**: kleines Binary, als
eigenes Paket verpackt, vom JS aufgerufen (`native/system` → `landlock-run`). Damit
verschwindet das „hohe" und das „mittlere" Risiko aus `docs/risks.md` §1, **ohne** die
Laufzeitwahl anzutasten, und die Regel 4 („Sprachgrenzen sind Dienstgrenzen") wird
eingehalten, statt sie zu umgehen.

---

## 2. Mapping-Stufen

Es gibt fünf Stufen. Jede Komponente der Vorlage fällt in genau eine.

| Stufe | Bedeutung | Ergebnis |
|---|---|---|
| **A** | **1:1 übernehmen, Stack wechseln** — dieselbe Verantwortung, dieselbe Sprache (TS), neue Laufzeit/Typecheck | TS-Paket unter Bun, geprüft mit TS 7 |
| **B** | **1:1 übernehmen, Sprache wechseln** — die Verantwortung wandert nach Go oder Rust | Go-/Rust-Dienst mit Prozessschnittstelle |
| **C** | **Neu bauen** — die Vorlage hat es **nicht**; die Doku des Zielprojekts fordert es | neue Komponente, im Mapping als Neubau gekennzeichnet |
| **D** | **Ersetzen/auflösen** — die Vorlage löst es mit einem nativen Addon, das unter Bun ungeprüft ist | Rust-Dienst statt Addon |
| **E** | **Bewusst weglassen** — mit Begründung | entfällt, dokumentiert |

---

## 3. Das vollständige Mapping

### 3.1 Agent-Core (Kernel) — bleibt TypeScript auf Bun (Stufe A)

Der Core **muss** JS sein: das Plugin-System ist Cordis, Plugins sind JS-Module über `ctx.*`
(`docs/concept.md`, `docs/stack.md`). Ein Core in Go oder Rust könnte keine Units laden.

| Vorlage | Ziel | Stufe | Anmerkung |
|---|---|---|---|
| `packages/core/scope` | `packages/core/scope` (TS) | A | `Scoped<T>`, `createScope`, Carrier |
| `packages/core/session` | `packages/core/session` (TS) | A | Session-Log, Surface, `ctx.sessions` |
| `packages/core/agent` | `packages/core/agent` (TS) | A | `ctx.agents`, Inbox-Vokabular |
| `packages/core/agent-loop` | `packages/core/agent-loop` (TS) | A | Turn-/Step-Zustandsmaschine |
| `packages/core/agent-default-model` | `packages/core/agent-default-model` (TS) | A | Standard-Modellwahl |
| `packages/core/agent-tool-presentation` | `packages/core/agent-tool-presentation` (TS) | A | `native` / `ptc` |
| `packages/core/system-prompt` | `packages/core/system-prompt` (TS) | A | Sections, Contexts, Variablen |
| `packages/core/tools` | `packages/core/tools` (TS) | A | Tool-Registry + Ausführungspipeline |
| `packages/util/*` (17 Pakete) | `packages/util/*` (TS) | A | Hilfsprimitive; `crypto` ggf. später nach Rust (s. §3.8) |

**Warum nicht Rust für den Loop?** `reference/ChatGPT-stackexplane.md` schlägt Rust für
„Harness-Kern, Agent-Lifecycle" vor. Das ist mit der Doku des Zielprojekts **nicht
vereinbar**: `concept.md` und `stack.md` sind eindeutig, dass der Core JS sein muss, sonst
laden keine Cordis-Plugins. Der Vorschlag aus der Fremdstellungnahme wird hier **bewusst
nicht** übernommen; die Begründung steht in `docs/stack.md` („Warum TypeScript gesetzt ist —
und die Laufzeit die Frage").

### 3.2 Fähigkeiten als Plugins/Seams — TypeScript auf Bun (Stufe A)

Alles, was im Referenz-Harness ein `ctx.*`-Seam mit Providern ist, bleibt TS. Grund: Diese
Pakete hängen direkt am Core-Kontext (`ctx.tools`, `ctx.sessions`, `ctx.systemPrompt`) —
ein Prozess könnte nur über eine Fernschnittstelle teilnehmen und müsste die Seam-Semantik
duplizieren. Genau davor warnt `docs/stack.md` beim Gateway („dieselbe Semantik nochmal
bauen und gegen jede Core-Änderung nachziehen").

| Gruppe | Pakete | Ziel | Stufe |
|---|---|---|---|
| Guard | `guard/repeat-tool-reminder`, `guard/timeout-policy` | `packages/guard/*` (TS) | A |
| Goal | `goal/goal`, `goal/goal-round-driver`, `goal/command-goal`, `goal/tool-goal` | `packages/goal/*` (TS) | A |
| Plan | `plan/plan-mode` | `packages/plan/plan-mode` (TS) | A |
| Todo | `todo/tool-todo` | `packages/todo/tool-todo` (TS) | A |
| Interaction | `interaction/commands`, `-permission-presets`, `-tool-ask-user`, `-user-approval`, `-user-questions` | `packages/interaction/*` (TS) | A |
| Workflow | `workflow/workflow`, `workflow/workflow-ptc`, `workflow/tool-workflow` | `packages/workflow/*` (TS) | A |
| Subagent | `subagent/subagent`, `-tool-subagent`, `-tool-subagent-control`, `-fork-in-process`, `-spawn-in-process`, `-acp`, `-claude-code`, `-codex`, `-dsh-sdk` | `packages/subagent/*` (TS) | A |
| Compaction | `compaction/compaction`, `-basic`, `-tool-result-pruner`, `-image-offload`, `command-compact` | `packages/compaction/*` (TS) | A |
| Preset | `preset/agent-preset`, `-agent-preset-registry`, `preset/persona` | `packages/preset/*` (TS) | A |
| Schedule | `schedule/schedule`, `schedule/tool-schedule` | `packages/schedule/*` (TS) | A |
| Feedback | `feedback/command-feedback`, `feedback/message-feedback` | `packages/feedback/*` (TS) | A |

### 3.3 Session-Format, Persistenz, Daten — TypeScript, **mit zwei Rust-Diensten**

| Vorlage | Ziel | Stufe | Anmerkung |
|---|---|---|---|
| `session/session-format` | `packages/session/session-format` (TS) | A | **Formatversion 4** muss erhalten bleiben |
| `session/session-format-catalog` | `packages/session/session-format-catalog` (TS) | A | Migrationserkennung |
| `session/session-format-v0-to-v1` | `packages/session/session-format-v0-to-v1` (TS) | A | Migrationskette **vollständig** |
| `session/session-format-v1-to-v2` | `packages/session/session-format-v1-to-v2` (TS) | A | dito |
| `session/session-format-v2-to-v3` | `packages/session/session-format-v2-to-v3` (TS) | A | dito |
| `session/session-format-v3-to-v4` | `packages/session/session-format-v3-to-v4` (TS) | A | dito |
| `session/session-persistence` | `packages/session/session-persistence` (TS) | A | Schnittstelle |
| `session/session-persistence-jsonl` | `packages/session/session-persistence-jsonl` (TS) | A | **Logik** in TS |
| — (JSONL-Schreibpfad braucht Write-Through/atomaren Rename) | `native/atomicfs` (**Rust**) | **D** | ersetzt `koffi`; s. §3.8 |
| `session/session-projection`, `-cache`, `-stats`, `-title*`, `-turn-outline`, `-checkpoint-policy`, `-log-deepseek`, `-telemetry`, `-telemetry-otel`, `-working-directory`, `-tool-working-directory` | `packages/session/*` (TS) | A | Projektionen bleiben im Core |
| `session-query/session-query` | `packages/session-query/session-query` (TS) | A | Abfrage-API |
| `session-query/session-query-sqlite` | `packages/session-query/session-query-sqlite` (TS) | A | SQLite-Schema erhalten |
| `session-query/session-log-export` | `packages/session-query/session-log-export` (TS) | A | Exportformate |
| `storage/storage`, `-domain`, `-json`, `-sqlite` | `packages/storage/*` (TS) | A | — |
| `spill/spill`, `-local`, `-policy` | `packages/spill/*` (TS) | A | — |
| — (PostgreSQL + pgvector) | **Go-Dienst** `services/pmh-store` | **C** | die Vorlage hat **keine** PostgreSQL-Schicht; die Doku des Zielprojekts fordert sie (`docs/vision.md`, `project-profile.md`) |
| — (Redis) | **Go-Dienst** `services/pmh-cache` | **C** | „erst bei belegtem Bedarf" (`project-profile.md §3`) → Gerüst, standardmäßig aus |
| — (Obsidian-Vault als Gedächtnis) | **Go-Dienst** `services/pmh-memory` | **C** | Markdown + Wikilinks; Konflikt „ist vs. Ansicht" bleibt offen (`open-questions.md`) |

### 3.4 LLM-Adapter — TypeScript (Stufe A), Provider-Fernbetrieb später möglich

| Vorlage | Ziel | Stufe |
|---|---|---|
| `llm/llm` (Seam) | `packages/llm/llm` (TS) | A |
| `llm/llm-deepseek`, `llm/llm-pi-ai` | `packages/llm/llm-http` (Adapter), `-pi-ai` (TS) | A |
| `llm/llm-retry`, `llm/token-meter` | `packages/llm/llm-retry`, `-token-meter` (TS) | A |
| `llm/llm-deepseek-account`, `-api-key`, `deepseek-llm-api-extensions`, `plugin-package-inventory-deepseek` | `packages/llm/*` (TS) | A |

**Multi-Modell-Router** — im Referenz-Harness **nicht vorhanden** (`reference-dsh.md`:
„nicht vorhanden — eigene Entwicklung"). Er wird als **neues Unit** gebaut:
`units/multi-model-router` (TS-Plugin, Stufe **C**).

### 3.5 API, Gateway, Host — TypeScript für den Host (A), Go für die Dienste (B/C)

Der entscheidende Doku-Befund (`docs/reference/web-frontend.md` §1 und §10.2): Der Host, der
das Web-`dist/` ausliefert, ist **`apps/cli` in TypeScript (`dsh web`) — nicht Go**. Go ist
laut `stack.md` Gateway/Scheduler/Supervisor.

| Vorlage | Ziel | Stufe | Begründung |
|---|---|---|---|
| `apps/cli` (Host, CLI-Einstieg) | `apps/cli` (TS auf Bun) | A | Doku: Host bleibt TS |
| `apps/web` (Vite-Einstieg) | `apps/web` (TS + React, Bun, Vite, TS 7) | A | bereits vorhanden (Insel + Hintergrund) |
| `apps/desktop`, `apps/desktop-host` | `apps/desktop`, `apps/desktop-host` (TS) | A | Namensskelett vorhanden, noch leer |
| `host/webserver`, `-frontend-static`, `-plugin-inventory`, `-open-in-app`, `-directory-picker*`, `-product-telemetry-otel` | `packages/host/*` (TS) | A | Host-Nähe, kein Dienstgewinn durch Go |
| `packages/api/gateway` (~78 Dateien, ~1.600 Z.) | **`packages/api/gateway` (TS) bleibt der Seam**; **`services/pmh-gateway` (Go)** als Dienst | **B/C** | `docs/stack.md`: Go-Gateway **erst wenn Lastmessungen es als Engpass zeigen**. Der TS-Seam bleibt, der Go-Dienst tritt daneben — nicht an seine Stelle. |
| `packages/api/*-controller` (7 Controller), `api/remotes`, `api/workspace-files` | `packages/api/*` (TS) | A | Wire-Protokoll und Semantik erhalten (t6) |
| — (Startup-Supervisor) | **`services/pmh-supervisor` (Go)** | **C** | `open-questions.md` §4 + `stack.md`: **„Startup-Supervisor zuerst"** — messbarer Nutzen ohne Semantik-Duplikat |
| — (Scheduler) | **`services/pmh-scheduler` (Go)** | **C** | `stack.md` Vorschlag, nach dem Supervisor |
| — (Datei- und Git-Anbindung) | **`services/pmh-git` (Go)** | **C** | `stack.md` Vorschlag; Git-Panel ist laut `reference-dsh.md` **Eigenentwicklung** |
| `packages/typert/*` (protocol/registry/loader/generator) | `packages/typert/*` (TS) | A | typisiertes Remote-Protokoll |
| `packages/sdk/*` (protocol/server/client) | `packages/sdk/*` (TS) | A | JSON-RPC |
| `packages/acp/acp` | `packages/acp/acp` (TS) | A | ACP |
| `packages/bundle/*` (6 Bundles) | `packages/bundle/*` (TS) | A | Kompositionsformate |
| `packages/boot/*` (5 Pakete) | `packages/boot/*` (TS) | A | Boot, cmdline, HMR, plugin-manager |

### 3.6 Betriebs-Schichten (FS, Shell, Prozess, Terminal, SSH, Jobs, Tools)

| Vorlage | Ziel | Stufe | Anmerkung |
|---|---|---|---|
| `fs/fs`, `fs-local`, `fs-sandbox`, `fs-observation-policy` | `packages/fs/*` (TS) | A | Policy-Logik in TS |
| `fs/tool-fs`, `-fs-search`, `-str-replace-editor` | `packages/fs/*` (TS) | A | Tools |
| — (Sandbox-Durchsetzung Windows ACL / Linux Landlock) | **`services/pmh-sandbox` (Rust)** | **B** | ersetzt/ergänzt `sandbox-windows-acl` + `main.c` |
| `sandbox/sandbox`, `-local`, `-policy` | `packages/sandbox/*` (TS) | A | **Policy-Modell** in TS; Durchsetzung ruft den Rust-Dienst |
| `sandbox/sandbox-windows-acl` | → Rust (`services/pmh-sandbox`) | **B** | OS-Arbeit; `stack.md`: „stärkster Fall der drei" |
| `subprocess/subprocess`, `-local`, `win32-process` | `packages/subprocess/*` (TS) | A | Prozess-API im Core |
| — (persistentes Terminal braucht `node-pty`) | **`native/pty` (Rust)** | **D** | ersetzt `node-pty` |
| `terminal/terminal`, `terminal-bash` | `packages/terminal/*` (TS) | A | ruft `native/pty` |
| `shell/shell`, `-env`, `bash-local`, `bash-sandbox`, `pwsh-local`, `pwsh-sandbox`, `tool-bash`, `-bash-persistent`, `tool-pwsh`, `-pwsh-persistent` | `packages/shell/*` (TS) | A | Shell-Auswahl und Tools |
| `ssh/ssh`, `fs-ssh`, `sandbox-ssh`, `subprocess-ssh`, `ssh-helper-runtime` | `packages/ssh/*` (TS) | A | Remote-Varianten |
| `jobs/jobs`, `-local`, `tool-jobs` | `packages/jobs/*` (TS) | A | — |
| `mcp/mcp-client`, `mcp-resources` | `packages/mcp/*` (TS) | A | — |
| `lsp/lsp`, `-stdio`, `tool-lsp` | `packages/lsp/*` (TS) | A | — |
| `browser-use/browser-use`, `computer-use/computer-use` | `packages/browser-use`, `computer-use` (TS) | A | — |
| `web/web`, `tool-web`, `web-fetch-http`, `web-search-deepseek`, `-exa`, `-perplexity` | `packages/web/*` (TS) | A | Firecrawl/SearXNG kommen als **Dienste** dazu (§3.7) |
| `skill/skill`, `-filesystem`, `-office`, `tool-skill`, `tool-workspace-dependencies` | `packages/skill/*` (TS) | A | — |
| `document/office-to-pdf` | `packages/document/office-to-pdf` (TS) | A | — |
| `attachment/attachment`, `-local` | `packages/attachment/*` (TS) | A | — |
| `telemetry/otel` + `host/product-telemetry-otel` + `session/session-telemetry-otel` | `packages/telemetry/otel` (TS) | A | — |
| `identity/anonymous-user-id` | `packages/identity/anonymous-user-id` (TS) | A | — |
| `credentials/*` (5 Pakete) | `packages/credentials/*` (TS) | A | `util/crypto` ggf. später Rust (§3.8) |

### 3.7 Dienste, die die Vorlage **nicht** hat (Stufe C — Neubau)

Alle folgenden Komponenten stehen **nicht** in der Vorlage. Sie sind durch die Doku des
Zielprojekts gefordert (`docs/vision.md`, `project-profile.md`, `ChatGPT-stackexplane.md`)
und werden als Go- oder Rust-Dienste neu gebaut — jeder als Unit, der mit der Harness
startet und sichtbar scheitert (Regel 3).

| Dienst | Sprache | Aufgabe laut Doku | Quelle |
|---|---|---|---|
| `services/pmh-supervisor` | **Go** | Kindprozesse starten, überwachen, neu starten, sauber beenden — „Dienste starten mit der Harness" | `open-questions.md` §4, `stack.md` |
| `services/pmh-scheduler` | **Go** | Nebenläufigkeit, Zeitpläne | `stack.md` |
| `services/pmh-gateway` | **Go** | Last-Gateway — **erst bei belegtem Engpass** | `stack.md` |
| `services/pmh-git` | **Go** | Datei- und Git-Anbindung (Forgejo/Gitea/GitLab CE) | `stack.md`, `vision.md` |
| `services/pmh-store` | **Go** | PostgreSQL + pgvector (strukturierte Daten **und** Vektorsuche) | `vision.md`, `project-profile.md` |
| `services/pmh-cache` | **Go** | Redis — Cache, Queue, Rate Limits | `project-profile.md` |
| `services/pmh-memory` | **Go** | Obsidian-Vault als Gedächtnis (Markdown + Wikilinks), Graph View | `vision.md` |
| `services/pmh-research` | **Go** | Firecrawl (Extraktion) + SearXNG (Metasuche) + Quellenverwaltung | `vision.md` |
| `services/pmh-ocr` | **Go** | Tesseract-OCR | `vision.md` |
| `services/pmh-workflow` | **Go** | n8n-Anbindung (extern, **nicht** Kern-Orchestrierung) | `vision.md` |
| `services/pmh-decision` | **Go** | Decision Engine: deterministische Regeln zuerst, Jev/Laya als austauschbarer Provider. **Darf keine Sicherheitsregeln überschreiben.** | `ChatGPT-stackexplane.md`, `vision.md` |
| `native/landlock-run` | **Rust** | Landlock-Launcher (ersetzt `main.c`) | `stack.md`, `native/system/docs/cli-contract.md` |
| `native/flock` | **Rust** | Dateisperre (ersetzt `flock.c`) | `native/system/docs/flock-contract.md` |
| `native/atomicfs` | **Rust** | Write-Through-Write + atomarer Rename (ersetzt `koffi`) | `risks.md` §1 |
| `native/pty` | **Rust** | PTY/ConPTY (ersetzt `node-pty`) | `risks.md` §1 |
| `services/pmh-sandbox` | **Rust** | Sandbox-Durchsetzung: Landlock (Linux), Windows-ACL (Windows) | `stack.md`, `open-questions.md` §5 |
| `native/index` | **Rust** | Schwere Werkzeuge: Parsing, Indizierung | `stack.md` |
| `native/crypto` | **Rust** | Kryptografie | `stack.md` |
| `units/multi-model-router` | TS | **Eigenentwicklung** — im Referenz-Harness nicht vorhanden | `reference-dsh.md` |
| `units/git-panel` | TS | **Eigenentwicklung** — im Referenz-Harness nicht vorhanden | `reference-dsh.md` |
| `units/language-pack-de` | TS | Deutsche Übersetzung als **ein Paket** über `LocaleRuntime.addLanguage` | `open-questions.md` §7 |

### 3.8 Die beiden C-Programme im Detail (Stufe B — Rust)

Das ist der Kern der Sprachübertragung. Beide Programme sind Verträge, die **erhalten
bleiben müssen** — nicht der C-Code, sondern das beobachtbare Verhalten.

#### 3.8.1 `main.c` → `native/landlock-run` (Rust)

| Aspekt | Vorlage (`main.c`) | Ziel (Rust) | Muss erhalten bleiben |
|---|---|---|---|
| Aufgabe | Landlock-Ruleset auf sich selbst legen, dann `execvp` | dito | ja |
| CLI | `landlock-run [--ro <path>]... [--rw <path>]... -- <argv>...` · `landlock-run --probe` | identisch | **ja, wörtlich** (`cli-contract.md` ist versionsgebundener Vertrag) |
| `--` | Pflicht-Trenner; alles danach ist das Kommando-argv | identisch | ja |
| `--probe` | schließt Grants und Kommando aus; baut ein maximales Ruleset im eigenen, kurzlebigen Prozess | identisch | ja |
| Nicht-Verzeichnis-Grant | behält nur dateikompatible Bits (`--rw /dev/null`) | identisch | ja |
| Fail-closed | Kein Ruleset / keine Durchsetzung → **Exit 125 ohne `exec`** | identisch | **ja** |
| `no_new_privs` | `prctl(PR_SET_NO_NEW_PRIVS, 1, …)` **vor** der Restriktion | identisch | ja (neutralisiert setuid/setgid im Sandbox) |
| ABI-Verhandlung | bis **ABI 5**; `fs_mask_for_abi` staffelt nach ABI 1/2/3/5 | identisch | ja |
| Teil-Durchsetzung | akzeptiert, eine stderr-Zeile, Lauf wird fortgesetzt | identisch | ja |
| Report-Zeilen | `landlock: fully enforced` · `landlock: partially enforced (older ABI)` (stdout, genau eine Zeile) · `landlock-run: partial enforcement (older Landlock ABI)` (stderr) · jede Fatalzeile mit Präfix `landlock-run: ` | identisch | **ja, wörtlich** — der Konsument liest sie |
| Exit-Codes | 125 = jeder Launcher-Fehler; Kind-Status wird sonst unverändert durchgereicht | identisch | **ja** |
| Kein Env-Input | „no environment-variable inputs" | identisch | ja |
| Umsetzung | reines C11 über die rohe Landlock-UAPI, statisch gegen musl | Rust über `libc`/`rustix`-Syscalls; **keine** externe Landlock-Crate nötig | Abweichung erlaubt (Implementierung, nicht Verhalten) |

**Zusätzlicher Befund:** `index.ts` hält fest, dass die **Binärpfad-Auflösung absichtlich
nicht über Umgebungsvariablen** läuft („which binary confines a process must never be
decidable by the ambient environment"). Das ist eine **Sicherheitsanforderung** und wird in
der Rust-/TS-Anbindung beibehalten.

#### 3.8.2 `flock.c` → `native/flock` (Rust)

| Aspekt | Vorlage (`flock.c` + `flock.ts`) | Ziel (Rust) | Anmerkung |
|---|---|---|---|
| Schnittstelle | Node-API-v8-Addon: `tryLock(fd, callback(errno))`; JS: `tryLockExclusive(fd): Promise<void>` | **Prozess** `pmh-flock --fd <n> --json` | **Stufe B/D**: Die Doku-Regel „Sprachgrenzen sind Dienstgrenzen" verlangt einen Prozess. Ein Rust-Node-Addon (napi-rs) würde die Addon-Frage nur verschieben. |
| Syscall | `flock(fd, LOCK_EX \| LOCK_NB)` | identisch | Vertrag |
| Asynchronität | Syscall läuft in Node-Async-Work, **nicht** im JS-Thread | Der Aufrufer startet einen Prozess — asynchron per Konstruktion | Verhalten erhalten |
| fd-Eigentum | Das Modul öffnet/dupliziert/schließt/entsperrt **nie** das fd | Der Prozess erbt/liefert das fd; er schließt es nicht | **ja** |
| Fehler | `code` (z. B. `EAGAIN`), **positives** `errno`, `syscall: 'flock'` | gleiche Felder im JSON-Report | ja |
| Nicht unterstützte Plattform | `ERR_FLOCK_UNSUPPORTED_PLATFORM` (`flock.ts`) | gleicher Fehlercode | ja |
| Windows | kein flock: „Windows does not use this API and retains its existing semaphore implementation" (`flock-contract.md`); Plattformpakete nur `linux-*`, `darwin-*` | **identisch**: Rust-`flock` nur POSIX; Windows behält die Semaphore im JS | ja |
| libc-Varianten | `bin/glibc/system.node` vs. `bin/musl/system.node` (Erkennung über `process.report`) | Rust: statisch gelinkte Binärdatei je Ziel — die glibc/musl-Unterscheidung entfällt | **Vereinfachung**, gleiches Verhalten |
| Test-Orakel | `test/fixtures/flock-oracle.c` ruft das OS direkt auf | Entfällt: der Rust-Dienst **ist** der Syscall-Aufrufer; getestet wird gegen `flock(2)` direkt | Ersatz statt Kopie |

**Verhaltensanforderungen aus `flock-contract.md`, die als Rust-Tests nachzubauen sind**
(die Tabelle ist die Abnahmeliste):

| Bedingung | Erforderliche Beobachtung |
|---|---|
| Keine konkurrierende Sperre | Erwerb löst auf |
| Dieselbe Open File Description erwirbt erneut | Erfolg ohne zweiten Eigentumseintrag |
| Getrennte Öffnungen derselben Datei | genau **ein** exklusiver Halter; der Konkurrent scheitert mit `EAGAIN`/`EWOULDBLOCK` |
| Verschiedene Dateien | beide sperrbar |
| Unabhängiger C-`flock`-Halter | der Dienst kann nicht erwerben und umgekehrt |
| Shared-`flock`-Halter | exklusiver Versuch kollidiert |
| Halter lebt | nicht-blockierender Versuch meldet Konkurrenz |
| Gewöhnliches Lesen/Schreiben durch anderen Prozess | **erlaubt** — flock ist beratend, kein I/O-Rechtemechanismus |
| Ein unbeteiligtes fd schließt | der Halter behält die Sperre |
| fd an Kind vererbt | Schließen im Elternteil gibt die Sperre **nicht** frei |
| Letztes besitzendes fd schließt | ein bereits offener Konkurrent kann erwerben |
| Halterprozess endet/getötet | Erwerb gelingt danach, **ohne** Stale-Lock-Timeout |
| Ungültiges fd | `EBADF` mit positivem errno |
| Native Argumentprüfung scheitert | JS-Einstieg liefert ein rejected Promise, **ohne** synchron zu werfen |
| Nebenläufige Erfolgs-/Fehleraufrufe | jede Vervollständigung bekommt ihr eigenes errno |
| Worker-Umgebung endet vor/während des Callbacks | Arbeit und Aufräumen laufen zu Ende, **ohne** das fd des Aufrufers zu übernehmen |
| Pfadname entfernt/ersetzt | Sperre wandert **nicht** zum Ersatz-Inode; das JSONL-Backend prüft Inode-Identität **separat** |

> **Wichtig:** Der letzte Punkt erklärt, warum die JSONL-Persistenz **Inode-Identität
> selbst prüfen** muss. Das ist eine Anforderung an `packages/session/session-persistence-jsonl`
> (t5/t7), nicht an `native/flock`.

#### 3.8.3 Plattformpakete der Vorlage

| Vorlage | Ziel | Anmerkung |
|---|---|---|
| `native/system/packages/linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64` (je mit `prebuilds.json`, `package.json`, `bin/`) | `native/*/packages/<triple>/` nach demselben Muster | **Muster übernehmen:** ein Paket je Plattung-Triple, Auswahl über `os`/`cpu` |
| `native/system/scripts/build.ts`, `assemble-prebuilds.mjs`, `pack-release.mjs`, `publish-release.mjs`, `verify-release.mjs`, `verify-packed-install.mjs`, `verify-launcher-binary.mjs`, `github-matrix.mjs` | Rust-Build + `cargo` + ein Release-Skript | **Stufe B**: Buildkette auf `cargo` umstellen |
| `native/system/test/*.test.js` + `fixtures/flock-oracle.c` | `native/*/tests/` in Rust (`#[test]`) | Verhalten übernehmen |

### 3.9 Python-SDK → Spezifikation für Go-Dienst und TS-Client (Stufe B/E)

`python/sdk/src/deepseek_harness/` hat fünf Module. Sie sind **kein** Backend, sondern die
**Außenansicht** des Harness. Damit ist der Umgang eindeutig:

| Python-Modul | Bedeutung | Ziel |
|---|---|---|
| `models.py` | Datenmodelle des öffentlichen API | Vorbild für die **Go-Typen** in `services/*/internal/api` und für die **TS-Typen** in `packages/sdk/protocol` |
| `api.py` | API-Oberfläche (Methoden) | Vorbild für die **HTTP/JSON-RPC-Routen** des Go-Dienstes und für den TS-SDK-Client |
| `client.py` | Transport und Client | Vorbild für `packages/sdk/client` |
| `errors.py` | Fehlertypen | Vorbild für Fehlercodes in Go **und** TS — **müssen übereinstimmen** |
| `__init__.py` | Paketoberfläche | — |
| `pyproject.toml`, `uv.lock` | Python-Packaging | **entfällt** (Stufe E): kein Python im Zielprojekt |
| `examples/minimal.py` | Nutzungsbeispiel | wird zum **Go-Beispiel** `services/…/examples/minimal` und **TS-Beispiel** `packages/sdk/examples/minimal.ts` |

**Ein Python-Client wird nicht nachgebaut.** Begründung: Das Zielprojekt hat TS als
Oberflächen- und Core-Sprache und Go als Dienstsprache; ein dritter Client in Python hätte
keinen Aufrufer. Die *Funktion* des SDK (Außenschnittstelle dokumentieren und bedienen)
wandert nach Go und TS. Stufe **E** mit Begründung — der einzige bewusste Wegfall.

> **Falls ein Python-Client doch gebraucht wird:** Er wäre ein dünner Wrapper über den
> Go-HTTP-Dienst (wie `python/sdk` heute ein Client ist), nicht Teil des Backends. Dann als
> eigenes Unit `units/python-client`, ausdrücklich **außerhalb** des Backends.

### 3.10 Bewusst weggelassen (Stufe E)

| Vorlage | Warum entfällt |
|---|---|
| `python/sdk` (als Python-Paket) | kein Python im Zielprojekt; Funktion wandert nach Go/TS (s. §3.9) |
| `vendor/*` (9 Cordis-Pakete: cordis, cosmokit, group, hmr, include, loader, logger-console, schemastery, timer) | Sie sind **vendored**, weil der Referenz-Fork sie gepatcht braucht. Das Zielprojekt nutzt Cordis als **Abhängigkeit** (`open-questions.md` §2 Neigung: „Cordis nicht nachbauen — der Seam ist erprobt und dokumentiert"). Ein Vendor-Baum wird damit unnötig. |
| `packages/experimental/*` (43 Pakete) | Der Referenz-Harness kennzeichnet sie selbst als experimentell (`experimental/`). Übernommen werden nur die **Agent-Teams** (`agent-team`, `-profile`, `tool-agent-team`, `client-ui-agent-team`), weil `reference-dsh.md` sie als vorhandene Fähigkeit führt, die **nicht doppelt gebaut** werden soll. |
| `packages/client/*` (~60 UI-Pakete) | **Nicht Backend.** Die Oberfläche des Zielprojekts ist React/TS in `apps/web`; die Vorlage-UI-Pakete sind Vorlage, nicht Übertragungsgegenstand. Sie werden bei Bedarf als `packages/client/ui-*` **neu** gebaut (`web-frontend.md` §10.1). |
| `apps/desktop`, `apps/desktop-host` | Namensskelett bleibt; Implementierung nicht Teil dieser Backend-Übertragung (`web-frontend.md` §1: „vorgesehen, noch leer"). |
| `snapshots/*` (1.562 Dateien) | Snapshot-**Fixtures** der Vorlage. Sie sind wertvoll als Verhaltensbeleg und werden **gelesen**, aber nicht kopiert; die Zielprojekt-Tests werden neu geschrieben. |
| `benchmarks/*` | Werkzeuge der Vorlage, kein Backend. Bei Bedarf neu. |
| `scripts/*` (388) | **1411 der 1430 TS-7-Fehler** liegen hier (`reference-dsh.md`). `stack.md`: „Mit Bun schreiben wir diese Skripte gar nicht erst." |
| `patches/*` (7 pnpm-Patches) | pnpm-Patches von Fremdpaketen, die im Zielprojekt entweder nicht benutzt werden (Electron, exceljs, fortune-sheet) oder ersetzt sind (`node-pty` → `native/pty`), bzw. entfallen (`@earendil-works/pi-ai` nur bei `llm-pi-ai`). |
| `.agents/*` (3.717 Dateien), `.github/*` | Upstream-Notizen, CI und Issue-Management des Referenz-Forks. Kein Backend. `.agents/skills/*` sind Vorbild für die Skill-Bibliothek, nicht Kopiervorlage (`skills-index.md`: „Snapshot-Kopie … **nein**"). |
| `website/*` | VitePress-Doku-Seite. Bleibt bei uns Doku-Seite, **nicht** Oberfläche (`web-frontend.md` §1). |
| `packages/test-support/*` | Testhilfen der Vorlage; die Zielprojekt-Tests entstehen neu (`agent-loop-testkit` ggf. als Vorbild). |

---

## 4. Sprachverteilung — Ergebnis

| Sprache | Komponenten | Anzahl | Begründung |
|---|---|---|---|
| **Bun / TypeScript 7** | Core, alle Seams/Plugins, Session-Format + 4 Migrationen, Persistenz-Logik, LLM-Adapter, Boot/Settings/Credentials, API-Controller, Typert, SDK, ACP, Bundles, Host `apps/cli`, Oberfläche `apps/web`, alle Betriebs-Schichten, alle Tools | ~300 Pakete | **Zwang** aus der Architektur: Cordis ist JS (`concept.md`, `stack.md`). Typecheck mit **TS 7** (`tsgo`), Ausführung durch **Bun**. |
| **Golang** | `pmh-supervisor`, `pmh-scheduler`, `pmh-gateway`, `pmh-git`, `pmh-store`, `pmh-cache`, `pmh-memory`, `pmh-research`, `pmh-ocr`, `pmh-workflow`, `pmh-decision` | 11 Dienste | `stack.md`: Nebenläufigkeit, Prozess-Supervisierung, Datei-/Git-Arbeit. **Jeder** ist ein Prozess hinter einer Prozessgrenze. |
| **Rust** | `native/landlock-run`, `native/flock`, `native/atomicfs`, `native/pty`, `services/pmh-sandbox`, `native/index`, `native/crypto` | 7 Komponenten | `native/landlock-run` + `native/flock` sind die **direkten Nachfolger der beiden C-Programme**. `atomicfs` und `pty` lösen das Bun-Addon-Risiko strukturell auf. Sandbox ist laut `stack.md` „der stärkste Fall". |
| **C** | — | 0 | `stack.md`: „C bleibt im Werkzeugkasten … Kein Zwang, alles nach Rust zu ziehen." Es bleibt **kein** C-Bedarf: beide C-Programme sind in Rust sauber abbildbar (Landlock über Syscalls, flock über `flock(2)`). |
| **Python** | — | 0 | Ersetzt (`vision.md`: „**Rust statt Python**"). |

**Prüfung der Auftragsvorgabe** („Golang, Bun, TS7 & Rust statt Python & C++"): Alle vier
Zielsprachen sind belegt — **Go** 11 Dienste, **Bun/TS7** ~300 Core-Pakete,
**Rust** 7 systemnahe Komponenten. **Python** und **C** haben je 0 Komponenten.

---

## 5. Projektweites 1:1-Mapping — Paketgruppen → Sprachfamilie

| Vorlage-Gruppe | Dateien | Ziel-Sprache | Stufe |
|---|---:|---|---|
| `core` | 331 | TS | A |
| `util` | 295 | TS (crypto → Rust optional) | A |
| `session` | 754 | TS (+ Rust `atomicfs` für den Schreibpfad) | A/D |
| `session-query` | 163 | TS | A |
| `storage` | 122 | TS (+ Go `pmh-store` neu) | A/C |
| `spill` | 77 | TS | A |
| `context` | 179 | TS | A |
| `llm` | 507 | TS | A |
| `sandbox` | 163 | TS-Policy + **Rust-Durchsetzung** | A/B |
| `subprocess` | 192 | TS | A |
| `fs` | 216 | TS | A |
| `shell` | 203 | TS | A |
| `terminal` | 54 | TS + **Rust `pty`** | A/D |
| `ssh` | 134 | TS | A |
| `jobs` | 87 | TS | A |
| `mcp` | 74 | TS | A |
| `lsp` | 104 | TS | A |
| `browser-use`, `computer-use` | 42 | TS | A |
| `web` | 160 | TS (+ Go `pmh-research`) | A/C |
| `skill` | 77 | TS | A |
| `document` | 49 | TS | A |
| `attachment` | 105 | TS | A |
| `telemetry` | 37 | TS | A |
| `identity` | 16 | TS | A |
| `credentials` | 122 | TS | A |
| `settings` | 38 | TS | A |
| `boot` | 300 | TS | A |
| `bundle` | 140 | TS | A |
| `api` | 701 | TS | A |
| `host` | 224 | TS | A |
| `typert` | 169 | TS | A |
| `sdk` | 93 | TS | A |
| `acp` | 57 | TS | A |
| `preset` | 114 | TS | A |
| `plan` | 28 | TS | A |
| `todo` | 29 | TS | A |
| `goal` | 106 | TS | A |
| `guard` | 29 | TS | A |
| `interaction` | 132 | TS | A |
| `workflow` | 113 | TS | A |
| `subagent` | 371 | TS | A |
| `compaction` | 142 | TS | A |
| `schedule` | 92 | TS | A |
| `feedback` | 52 | TS | A |
| `deliverables` | 78 | TS | A |
| `extensions` | 262 | TS | A |
| `ptc-runtime` | 110 | TS | A |
| `workspace` | 36 | TS | A |
| `experimental` | 3.662 | nur `agent-team*` übernommen, Rest E | A/E |
| `client` | 6.645 | **E** (nicht Backend) | E |
| `test-support` | 384 | **E** (Tests neu) | E |
| `apps/cli`, `apps/web` | 985 | TS auf Bun | A |
| `apps/desktop*` | 823 | **E** (Skelett bleibt) | E |
| `native/system` | 84 | **Rust** | B |
| `python/sdk` | 47 | **E** → Spezifikation | B/E |
| `vendor` | 228 | **E** (Cordis als Abhängigkeit) | E |
| `scripts` | 388 | **E** (mit Bun unnötig) | E |
| `patches` | 7 | **E** | E |
| `benchmarks`, `snapshots` | 1.607 | **E** (Vorbild, nicht Kopie) | E |
| `.agents`, `.github`, `website` | 3.805 | **E** (kein Backend) | E |

---

## 6. Zuordnung je Zielsprache: die konkreten Komponenten

### 6.1 Golang — 11 Dienste

Alle Dienste folgen **einem** Muster (aus `stack.md` + `concept.md` Regel 3 und 4):

```
services/<name>/
├── cmd/<name>/main.go        Einstieg
├── internal/…                Implementierung
├── api/                      Schnittstellentypen (aus python/sdk-Modellen abgeleitet)
├── tests/                    Tests
├── README.md                 Zweck, Start, Flags, Ports
└── unit.json                 Unit-Deklaration (optional | required_core)
```

**Schnittstellenregel:** Der Core ruft einen Go-Dienst **als Prozess** (stdin/stdout, Argumente,
Exit-Codes) oder über **HTTP/WebSocket**, wenn er langlebig ist. Ein Go-Dienst importiert
**nie** Core-Interna (Regel 2).

### 6.2 Rust — 7 Komponenten

| Komponente | Ersetzt | Art | Vertrag |
|---|---|---|---|
| `native/landlock-run` | `native/system/packages/entry/src/main.c` | **Binary** | `native/system/docs/cli-contract.md` — **wörtlich** |
| `native/flock` | `native/system/packages/entry/src/flock.c` (+ `flock.ts`) | **Binary** | `native/system/docs/flock-contract.md` — Verhaltenstabelle als Testliste |
| `native/atomicfs` | `koffi` (Addon) | **Binary** | `MoveFileExW` + `MOVEFILE_WRITE_THROUGH`, atomarer Rename, Inode-Identität berichten |
| `native/pty` | `node-pty` (Addon) | **Binary** | PTY öffnen/schreiben/lesen/größe/schließen; ConPTY auf Windows, `openpty` auf POSIX |
| `services/pmh-sandbox` | `sandbox-windows-acl` + Landlock-Nutzung | **Dienst** | Policy-Modell kommt aus `packages/sandbox/sandbox-policy` (TS) |
| `native/index` | — (neu) | **Binary** | Parsing, Indizierung |
| `native/crypto` | — (neu) | **Binary** | Kryptografie |

### 6.3 Bun / TypeScript 7 — der Rest

Alle in §5 mit **A** markierten Gruppen. Zwei Regeln aus der Doku sind dabei bindend:

1. **Typecheck mit TS 7, Ausführung mit Bun** (`stack.md`): „Bun *führt aus*, TS 7 *prüft*."
   Also `tsgo --noEmit` als Gate, kein `tsc` im Pfad.
2. **Kein Laufzeitcode darf TS 7 brechen.** Nach `reference-dsh.md` trifft das ausschließlich
   Werkzeuge; die 19 Fehler in `packages/`/`apps/` liegen in Build-/Dev-Werkzeugen. Da wir
   die Skripte nicht nachbauen (`stack.md`), entfällt der Blocker.

---

## 7. Schnittstellen-Mapping (für t6)

| Schnittstelle der Vorlage | Ziel | Erhaltungsanforderung |
|---|---|---|
| Cordis-`ctx.*`-Seams (Plugin-System) | **identisch** in TS | Plugin-Anatomie `name` / `inject` / `Config` / `apply(ctx, config)` **wörtlich** beibehalten |
| Session-JSONL-Format **Version 4** | TS, identisch | Feldnamen, Record-Form, Header; Migrationskette v0→v4 **vollständig** |
| Gateway-Stream-Protokoll (Frames, Event-Namen, Fehlercodes) | TS-Seam bleibt; Go-Gateway später **dasselbe Protokoll** | Frame-Namen, Event-Namen und Fehlercodes **wörtlich** |
| Remote-/RPC-Methoden der 7 Controller | TS, identisch | Methodennamen, Parameter, Rückgabetypen |
| CLI: `web --port`, Profile, Patches, Config-Dump/-Schema | TS-Host `apps/cli` | Kommandos und Flags **wörtlich**; Ports 5175 (Web), 8080 (Go-Vorlage) |
| Batch/Komposition `.cordis.yml` | TS, identisch | Dateiformat und Profil-/Patch-Komposition |
| ACP-Protokoll | TS, identisch | Handshake, Session-Methoden, Permission-Modell |
| SDK-JSON-RPC | TS, identisch | Methodennamen, Framing |
| **`landlock-run`-CLI** | **Rust**, wörtlich | `--ro`/`--rw`/`--`/`--probe`, Exit 125, Report-Zeilen, keine Env-Eingabe |
| **flock-Verhalten** | **Rust** | die 17 Bedingungen aus `flock-contract.md` als Tests |
| **Python-SDK-Oberfläche** (`api`/`client`/`errors`/`models`) | Go **und** TS | Methoden, Datenmodelle und Fehlercodes **übereinstimmend** in beiden |
| Home-Verzeichnis `$DSH_HOME` → `PMH_HOME`, Fallback `~/.pmh` | alle Sprachen | Env-Name und Fallback-Kette; Trennung `~/.dsh` / `~/.pmh` |

---

## 8. Was dieses Mapping **nicht** festlegt (bewusst offen)

Die Doku des Zielprojekts lässt acht Fragen offen (`docs/decisions/open-questions.md`).
Dieses Mapping trifft dazu **keine** Entscheidung, sondern hält die Doku-Neigung als
Standardannahme fest:

| Offene Frage | Doku-Neigung | Umsetzung hier |
|---|---|---|
| Laufzeit Bun oder Node | **Bun** (Rückfall Node) | Bun; `native/*` als Prozesse → das Addon-Risiko ist **aufgelöst**, nicht nur gemessen |
| Umfang des Cores | Cordis **nicht** nachbauen | Cordis als Abhängigkeit |
| Erster Baustein | kleinste Kette: Adapter, Loop, Einstieg | Reihenfolge in t4–t8 |
| Wo Go beginnt | **Startup-Supervisor zuerst**, Gateway erst bei Messung | `pmh-supervisor` vor `pmh-gateway` umgesetzt |
| Wo Rust beginnt | **Sandbox zuerst** | `native/landlock-run` + `native/flock` + `pmh-sandbox` |
| Verhältnis zum DSH | Hybrid | Core-Form erhalten, Fähigkeiten als Units |
| Sprache/Übersetzungen | Language-Pack als **ein** Paket | `units/language-pack-de` |
| Aufräumarbeiten | geparkt | außerhalb des Backends |

---

## 9. Nachweis: Keine Python-/C++-Kopie

| Prüfung | Ergebnis |
|---|---|
| Python-Code im Zielprojekt | **keiner.** `python/sdk` wird als *Spezifikation* gelesen; §3.9 bildet es auf Go-/TS-Typen ab. |
| C/C++-Code im Zielprojekt | **keiner.** `main.c`/`flock.c` werden als *Vertrag* gelesen (`cli-contract.md`, `flock-contract.md`); §3.8 bildet Verhalten ab, nicht Code. |
| Übernommener Code aus der Vorlage | nur **Verhaltensvorgaben**: CLI-Grammatik, Exit-Codes, Report-Zeilen, Fehlerfelder, Formatversionen, Event- und Methodennamen, Fehlercodes. |
| Quellvorlage verändert | **nein** — alle Zugriffe in t2/t3 waren lesend |
| Warum die TS-Seite keine „Kopie" ist | Sie ist in **Bun/TS 7** neu gebaut: andere Laufzeit, anderer Typecheck, anderes Test-/Build-Werkzeug, Prozessgrenzen statt Addons. |
