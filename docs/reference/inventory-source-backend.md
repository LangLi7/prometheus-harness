# Quell-Inventar — Backend der Vorlage `C:\Users\Chang\harness\prometheus-harness`

> **Zweck.** Ergebnis von Aufgabe **t2**: vollständiges Inventar der Backend-Struktur der
> Quellvorlage. Grundlage für das Mapping (t3) und die Umsetzung (t4–t8).
>
> **Quelle.** `C:\Users\Chang\harness\prometheus-harness` — der Referenz-Fork
> (Upstream `https://github.com/deepseek-ai/deepseek-harness`, Commit
> `d743267388641bc76f17c45ce8b4c231aed1d32c`, Tag `dsh-v0.2.1-alpha.2`, 09.10.2026).
> Gelesen wurde **nur** (read-only); die Vorlage wurde nicht verändert.
> Ergänzend herangezogen: `docs/reference/verify/core-template-before.txt`
> (SHA-256-Manifest, 27.093 Einträge) als Strukturnachweis.
>
> **Detailtiefe dieser Datei:** Struktur, Paketkarte, Top-Level-Layout, Konfiguration,
> Werkzeugketten, Bauweise, native/python Anteile, `units/`, `patches/`, `vendor/`.
> Die **Verhaltensdetails** (Service-Interfaces, Wire-Protokoll, Datenmodelle) liegen in
> den Vertiefungsdateien `docs/reference/inventory-*.md`, auf die hier je Abschnitt
> verwiesen wird.

---

## 1. Kennzahlen der Vorlage

| Kennzahl | Wert | Quelle |
|---|---|---|
| Dateien (ohne `node_modules/`, `.git/`) | **27.093** | `verify/core-template-before.txt` (Zeilenzahl = 27.093) |
| Manifest-Einträge inkl. `node_modules/` | 59.653 | Verzeichniszählung (`node_modules/` 32.560 in `reference/verify/review-r1-r2.md`) |
| Top-Level-Ordner | 18 + 3 Dateien | `Get-ChildItem -Force` |
| Pakete (`package.json` unter `packages/`, `apps/`, `native/`, ohne Fixtures) | **354** package.json gesamt | Zählung |
| Sprache | **TypeScript** (JavaScript-Laufzeit), **C** (genau ein Addon), **Python** (nur SDK-Client) | s. §6, §7 |
| Kein Rust, kein Go | bestätigt | `reference/reference-dsh.md` |
| Build-Werkzeug | `tsx scripts/build.ts` (nicht `tsc -b` direkt) | `reference/reference-dsh.md` |
| Workspace-Manager | **pnpm** (`pnpm-workspace.yaml`) | Vorlage |

**Dateiverteilung nach Top-Level-Ordner** (aus dem Manifest):

| Ordner | Dateien | Rolle |
|---|---:|---|
| `packages/` | 18.376 | alle Core-Pakete |
| `.agents/` | 3.717 | Agent-Notizen + Skills des Upstream |
| `apps/` | 1.808 | Anwendungen (cli, web, desktop, desktop-host) |
| `snapshots/` | 1.562 | Snapshot-Tests (acp, sdk, …) |
| `docs/` | 692 | Upstream-Doku |
| `scripts/` | 388 | Build- und Prüfskripte |
| `vendor/` | 228 | **vendored** Cordis-Ökosystem (9 Pakete) |
| `native/` | 84 | C-Addon `system` (plattformverpackt) |
| `.github/` | 56 | CI, Issue-Management, Review-Ownership |
| `python/` | 47 | Python-SDK (Client) |
| `benchmarks/` | 45 | Benchmarks |
| `website/` | 32 | VitePress-Doku-Seite |
| `patches/` | 7 | pnpm-Patches für Fremdpakete |
| `units/` | 1 | **nur `README.md`** — unser Unit-Ordner, noch leer |
| `.pmh/` | 1 | `base.json` — unsere Fork-Konfiguration |
| `.claude/` | 1 | `skills`-Verweis |

---

## 2. Top-Level-Layout und Rollen

```
C:\Users\Chang\harness\prometheus-harness
├── apps\            cli · web · desktop · desktop-host
├── packages\        18.376 Dateien in ~50 Themengruppen, ~340 Einzelpakete
├── vendor\          9 vendored Cordis-Pakete (cordis, cosmokit, group, hmr,
│                    include, loader, logger-console, schemastery, timer)
├── native\system\   C-Addon (flock) + Plattformpakete
├── python\sdk\      Python-Client-SDK + Beispiel
├── scripts\         388 Build-/Prüf-/Generatorskripte
├── benchmarks\      Benchmark-Suites
├── snapshots\       Snapshot-Fixtures (acp, sdk, …)
├── website\         VitePress-Doku-Seite (32 Dateien)
├── patches\         7 pnpm-Patches
├── units\           UNSERE Units — derzeit nur README.md
├── .agents\         Upstream-Notizen (archived 2.774 / implemented 755 /
│                    proposed 123 / rejected 24) + 20 Upstream-Skills
├── .github\         CI, Issue-Management, Review-Ownership
├── .pmh\base.json   Fork-Regeln, Core-Pointer, Pfade
├── .claude\         skills
├── AGENTS.md        Upstream-Agentenanweisung (wird automatisch geladen)
├── tsconfig.base.json, tsconfig.host.json, tsconfig.client.json,
│   tsconfig.base.client.json, tsconfig.json
├── vitest.config.ts, vitest.bench.config.ts
├── tsdown.config.ts (Bundler-Konfiguration)
└── pnpm-workspace.yaml
```

**`.pmh/base.json` — die Fork-Selbstbeschreibung** (vollständig gelesen). Inhaltlich
bedeutsam:

| Feld | Wert |
|---|---|
| `harness` / `prefix` | `pmh` |
| `core.upstream` | `https://github.com/deepseek-ai/deepseek-harness.git` |
| `core.commit` / `tag` | `d743267388641bc76f17c45ce8b4c231aed1d32c` / `dsh-v0.2.1-alpha.2` |
| `checkout.home` / `home_env` | `C:\Users\Chang\.pmh` / **`DSH_HOME`** |
| `checkout.entry` | `node --import tsx/esm apps/cli/src/bin.ts web --port <port>` |
| `operational_warnings` | (a) pnpm-Junctions haben **absolute** Ziele → nach Umzug `pnpm install --force`, sonst `ERR_MODULE_NOT_FOUND`; (b) nach jedem Core-Sprung erst `pnpm install`; (c) **`units/` steht NICHT in `pnpm-workspace.yaml`** (dort nur `packages/*/*` und `apps/*`) — sobald ein Unit Abhängigkeiten hat, muss `units/*` ergänzt werden |
| `rules[]` | 5 Regeln: Core unantastbar · jede Änderung außerhalb des Cores ist ein Unit unter `units/` mit eigener **`unit.json`** · ein Unit deklariert `optional` (absteckbar) oder `required_core` · Dienste startet das **Unit**, nicht der Core · Upstream-Sprung darf keinen Unit zur Neuschrift zwingen (kein Unit importiert Core-Interna) |
| `core_changes` | `[]` — **keine** Core-Änderung |
| `units` | `[]` — **kein** Unit gebaut |

> **Wichtiger Befund für t4/t5:** Die Vorlage hat selbst schon die Zielstruktur
> vorbereitet: `units/` mit `README.md`, ein `unit.json`-Format je Unit und die
> Regel „Unit statt Core-Änderung". Genau das ist das Unit-Modell aus `docs/concept.md`.
> Die Vorlage ist damit **nicht** der umgebaute Harness, sondern der **unveränderte Core
> plus leere Unit-Schale**.

---

## 3. Paketkarte der Vorlage

### 3.1 Anwendungen (`apps/`)

| Pfad | Paket | Rolle | Dateien |
|---|---|---|---:|
| `apps/cli` | `@deepseek-ai/dsh` | **Host + CLI-Einstieg** (`bin.ts`), liefert das Web-`dist/` aus, lädt Profile und Bundles | 220 |
| `apps/web` | `@deepseek-ai/dsh-web-frontend` | Vite-Einstieg der Oberfläche (`index.html` + `src/`), 4 Fixture-Plugins unter `tests/fixtures/plugins/` | 765 |
| `apps/desktop` | `@deepseek-ai/dsh-desktop` | Desktop-GUI (Electron), nutzt `dsh-api-gateway` | 773 |
| `apps/desktop-host` | `@deepseek-ai/dsh-desktop-host` | Host-Prozess der Desktop-App | 50 |

`apps/cli` hat Unterordner `config/examples/` (u. a. `mcp-memory/*.cordis.yml`) und
`reference/`; die Komposition ist in `apps/cli/composition.md` beschrieben.
Vertiefung: `docs/reference/inventory-api-gateway-host.md`.

### 3.2 Cookbook-/Themengruppen unter `packages/`

Die Vorlage gruppiert ~340 Einzelpakete in Themengruppen (`packages/<gruppe>/<paket>`).
Vollständig mit Dateizahlen:

| Gruppe | Dateien | Einzelpakete (Auszug / vollständig) |
|---|---:|---|
| `acp` | 57 | `acp` |
| `api` | 701 | `gateway`, `remotes`, `session-controller`, `job-controller`, `settings-controller`, `terminal-controller`, `workspace-controller`, `account-controller`, `workspace-files` |
| `attachment` | 105 | `attachment`, `attachment-local` |
| `boot` | 300 | `app-boot`, `cmdline`, `config-editor`, `hmr`, `plugin-manager` |
| `browser-use` | 21 | `browser-use` |
| `bundle` | 140 | `base`, `web-app`, `headless`, `sdk-app`, `sdk-minimal`, `acp-app` |
| `client` | 6.645 | ~60 UI-Pakete (`ui-*`), `connection`, `file-upload`, `hmr`, `locale`, `modules`, `product-analytics`, `resources`, `shortcuts`, `store`, `web` |
| `compaction` | 142 | `compaction`, `compaction-basic`, `compaction-tool-result-pruner`, `compaction-image-offload`, `command-compact` |
| `computer-use` | 21 | `computer-use` |
| `context` | 179 | `agent-instructions`, `file-reference`, `file-reference-local`, `session-reference`, `time-context`, `tmux-context` |
| `core` | 331 | **`agent`, `agent-loop`**, `agent-default-model`, `agent-tool-presentation`, `scope`, `session`, `system-prompt`, `tools` |
| `credentials` | 122 | `authorization`, `credentials`, `credentials-local`, `deepseek-account`, `deepseek-account-platform` |
| `deliverables` | 78 | `tool-present`, `workspace-changes` |
| `document` | 49 | `office-to-pdf` |
| `experimental` | 3.662 | 43 Pakete, u. a. `agent-team`, `agent-team-profile`, `tool-agent-team`, `client-ui-agent-team`, `ralph-bundle`, `tool-ralph`, `inspector`, `session-inspector`, `session-search`, `hook-protocol`, `hooks-claude-code`, `hooks-codex`, `worktree`, `tool-worktree`, `webhook`, `webhook-github`, `speech-to-text*`, `voice-input-bundle`, `cot-translation-bundle`, `ptc-runtime-python`, `webworker-packer`, `webworker-runtime`, `browser-use-*`, `computer-use-*`, `claude-code-mods`, `translator`, `auto-review`, `session-title-all-prompts-llm`, `terminal-bundle`, `badge-skill-bundle`, `tool-session-query`, `tool-terminal` |
| `extensions` | 262 | `cordis-host-runner`, `cordis-client-runner`, `tool-cordis`, `ui-cordis` |
| `feedback` | 52 | `command-feedback`, `message-feedback` |
| `fs` | 216 | `fs`, `fs-local`, `fs-sandbox`, `fs-observation-policy`, `tool-fs`, `tool-fs-search`, `tool-str-replace-editor` |
| `goal` | 106 | `goal`, `goal-round-driver`, `command-goal`, `tool-goal` |
| `guard` | 29 | `repeat-tool-reminder`, `timeout-policy` |
| `host` | 224 | `webserver`, `frontend-static`, `plugin-inventory`, `open-in-app`, `directory-picker`, `-auto`, `-browse`, `-native`, `product-telemetry-otel` |
| `identity` | 16 | `anonymous-user-id` |
| `interaction` | 132 | `commands`, `permission-presets`, `tool-ask-user`, `user-approval`, `user-questions` |
| `jobs` | 87 | `jobs`, `jobs-local`, `tool-jobs` |
| `llm` | 507 | **`llm`**, `llm-deepseek`, `llm-pi-ai`, `llm-retry`, `llm-deepseek-account`, `llm-deepseek-api-key`, `deepseek-llm-api-extensions`, `token-meter`, `plugin-package-inventory-deepseek` |
| `lsp` | 104 | `lsp`, `lsp-stdio`, `tool-lsp` |
| `mcp` | 74 | `mcp-client`, `mcp-resources` |
| `plan` | 28 | `plan-mode` |
| `preset` | 114 | `agent-preset`, `agent-preset-registry`, `persona` |
| `ptc-runtime` | 110 | `ptc-runtime`, `ptc-runtime-node` |
| `sandbox` | 163 | `sandbox`, `sandbox-local`, `sandbox-policy`, **`sandbox-windows-acl`** |
| `schedule` | 92 | `schedule`, `tool-schedule` |
| `sdk` | 93 | `protocol`, `server`, `client` |
| `session` | 754 | **`session-format`** + `-catalog` + 4 Migrationspakete, `session-persistence`, `session-persistence-jsonl`, `session-projection`, `-cache`, `session-stats`, `session-title*`, `session-turn-outline`, `session-checkpoint-policy`, `session-log-deepseek`, `session-telemetry`, `-otel`, `working-directory`, `tool-working-directory` |
| `session-query` | 163 | `session-query`, `session-query-sqlite`, `session-log-export` |
| `settings` | 38 | `settings` |
| `shell` | 203 | `shell`, `shell-env`, `bash-local`, `bash-sandbox`, `pwsh-local`, `pwsh-sandbox`, `tool-bash`, `tool-bash-persistent`, `tool-pwsh`, `tool-pwsh-persistent` |
| `skill` | 77 | `skill`, `skill-filesystem`, `skill-office`, `tool-skill`, `tool-workspace-dependencies` |
| `spill` | 77 | `spill`, `spill-local`, `spill-policy` |
| `ssh` | 134 | `ssh`, `fs-ssh`, `sandbox-ssh`, `subprocess-ssh`, `ssh-helper-runtime` |
| `storage` | 122 | `storage`, `storage-domain`, `storage-json`, `storage-sqlite` |
| `subagent` | 371 | `subagent`, `tool-subagent`, `tool-subagent-control`, `subagent-fork-in-process`, `subagent-spawn-in-process`, `subagent-acp`, `subagent-claude-code`, `subagent-codex`, `subagent-dsh-sdk` |
| `subprocess` | 192 | `subprocess`, `subprocess-local`, `win32-process` |
| `telemetry` | 37 | `otel` |
| `terminal` | 54 | `terminal`, `terminal-bash` |
| `test-support` | 384 | `agent-loop-testkit`, `client-runtime`, `llm-mock-server`, `llm-replay`, `loader-smoke`, `remote-mock`, `session-snapshot` |
| `todo` | 29 | `tool-todo` |
| `typert` | 169 | `protocol`, `registry`, `loader`, `generator` |
| `util` | 295 | `home-paths`, `atomic-write`, `package-manifest`, `launch-environment`, `native-command`, `http-proxy`, `output-retention`, `workspace-path`, `crypto`, `values`, `deque`, `time`, `timeout`, `brand`, `lazy-require`, `chunked-list`, `code-language` |
| `web` | 160 | `web`, `tool-web`, `web-fetch-http`, `web-search-deepseek`, `web-search-exa`, `web-search-perplexity` |
| `workflow` | 113 | `workflow`, `workflow-ptc`, `tool-workflow` |
| `workspace` | 36 | `workspace` |

**Detailinventare je Gruppe** (Service-Interfaces, Exporte, Signaturen):

| Vertiefungsdatei | Abgedeckte Gruppen |
|---|---|
| `docs/reference/inventory-core-agent.md` | `core/*`, `guard/*`, `goal/*`, `plan/*`, `todo/*`, `interaction/*`, `workflow/*`, `subagent/*`, `compaction/*`, `preset/*`, `schedule/*`, `feedback/*` |
| `docs/reference/inventory-api-gateway-host.md` | `api/*`, `host/*`, `typert/*`, `sdk/*`, `acp/*`, `apps/cli` |
| `docs/reference/inventory-session-data.md` | `session/*`, `session-query/*`, `storage/*`, `workspace/*`, `spill/*`, `context/*` |
| `docs/reference/inventory-llm-sandbox-process.md` | `llm/*`, `sandbox/*`, `subprocess/*`, `shell/*`, `terminal/*`, `fs/*`, `ssh/*`, `jobs/*`, `mcp/*`, `lsp/*`, `browser-use/*`, `computer-use/*`, `web/*`, `skill/*`, `document/*`, `attachment/*`, `telemetry/*` |
| `docs/reference/inventory-config-native.md` | `boot/*`, `settings/*`, `credentials/*`, `util/*`, `identity/*`, `bundle/*`, `native/system`, `python/sdk`, `scripts/`, `patches/`, `vendor/`, `units/`, `.pmh/` |

---

## 4. Schichtenbild des Backends (Ist-Zustand der Vorlage)

Aus dem Quellinventar abgeleitet. **Alle** folgenden Schichten sind in der Vorlage
**TypeScript**; die Sprachgrenze ist bis auf ein C-Addon und ein Python-SDK nicht gezogen.

```
┌──────────────────────────────────────────────────────────────────────┐
│ apps/cli (Host, CLI-Einstieg, liefert Web-dist)   apps/desktop(-host)│
├──────────────────────────────────────────────────────────────────────┤
│ packages/api/*        Gateway, Remotes, 7 Controller, workspace-files│
│ packages/host/*       webserver, frontend-static, plugin-inventory   │
│ packages/typert/*     typisiertes Remote-Protokoll (protocol/registry│
│                       /loader/generator)                             │
│ packages/sdk/*        JSON-RPC-Server/Client + Protokoll             │
│ packages/acp/*        Agent Client Protocol                          │
├──────────────────────────────────────────────────────────────────────┤
│ AGENT-CORE (Kernel)                                                  │
│  core/scope  core/session  core/agent  core/agent-loop  core/tools   │
│  core/system-prompt  core/agent-default-model                        │
├──────────────────────────────────────────────────────────────────────┤
│ Fähigkeiten als Plugins (ctx.*-Seams)                                │
│  goal · plan-mode · todo · commands · user-approval · user-questions │
│  permission-presets · subagent/* · workflow/* · compaction/*         │
│  guard/* · schedule · feedback · deliverables · preset/persona       │
├──────────────────────────────────────────────────────────────────────┤
│ Betriebs-Schichten (alle mit lokal/remote-Varianten)                 │
│  llm/*        Provider (deepseek, pi-ai) + retry + token-meter       │
│  session/*    Format v4 + 4 Migrationen + JSONL-Persistenz           │
│  storage/*    json | sqlite  ·  session-query-sqlite                 │
│  sandbox/*    policy + local + windows-acl                           │
│  subprocess/* local + win32-process  ·  shell/* bash|pwsh ±sandbox   │
│  fs/* local|sandbox  ·  terminal/*  ·  jobs/*  ·  mcp/*  ·  lsp/*    │
│  ssh/*  ·  web/* (fetch + 3 Suchanbieter)  ·  skill/*  ·  spill/*    │
├──────────────────────────────────────────────────────────────────────┤
│ boot/*   app-boot · cmdline · config-editor · hmr · plugin-manager   │
│ settings/*  credentials/*  util/*  telemetry/otel  bundle/*          │
├──────────────────────────────────────────────────────────────────────┤
│ vendor/ (9 vendored Cordis-Pakete)   native/system (C, flock)        │
│ python/sdk (Python-Client-SDK)                                       │
└──────────────────────────────────────────────────────────────────────┘
```

**Zwei Betriebsachsen, die die gesamte Vorlage durchziehen** (für das Mapping zentral):

| Achse | Bedeutung | Beispiel |
|---|---|---|
| **lokal ↔ remote** | jede Betriebs-Schicht hat eine lokale Variante und eine Remote-Variante | `fs` / `fs-local` / `fs-ssh`; `sandbox` / `sandbox-local` / `sandbox-ssh`; `subprocess` / `subprocess-local` / `subprocess-ssh`; `storage-json` / `storage-sqlite` |
| **Seam ↔ Provider** | abstrakter `ctx.*`-Dienst + austauschbare Provider | `llm` (Seam) / `llm-deepseek`, `llm-pi-ai`; `subagents` (Seam) / `fork`, `spawn`, `acp`, `claude-code`, `codex`, `dsh-sdk`; `workflowEngine` / `workflow-ptc`; `compaction` / `compaction-basic`; `sandbox` / `sandbox-local` |

**Plugin-Anatomie.** Jedes Paket folgt demselben Cordis-Format:
`name` (String) · `inject` (Liste benötigter `ctx.*`-Dienste) · `Config` (Schema) ·
`apply(ctx, config)` (Funktion). Dienst-Klassen erben von `Service` (lokal) oder
`TypertRemoteService` (im Web erreichbar).

---

## 5. Konfiguration und Betrieb (Kurzfassung)

| Element | Wert | Quelle |
|---|---|---|
| Home-Verzeichnis | `$DSH_HOME`, Fallback `~/.dsh`; in der Vorlage gesetzt auf `C:\Users\Chang\.pmh` | `.pmh/base.json`, `reference/reference-dsh.md` |
| Einstieg | `node --import tsx/esm apps/cli/src/bin.ts web --port <port>` | `.pmh/base.json` |
| Workspace-Mitglieder | `packages/*/*` und `apps/*` — **`units/*` fehlt** | `pnpm-workspace.yaml`, `.pmh/base.json` |
| Workspace-Manager | pnpm (Junctions mit absolutem Zielpfad!) | `reference/reference-dsh.md` |
| Peer-Regel | `peerDependencyRules.allowedVersions.typescript: '>=5 <7'` — **blockt TS 7** | `reference/reference-dsh.md` |
| Patches | 7 pnpm-Patches, u. a. `node-pty@1.2.0-beta.15`, `exceljs@4.4.0`, `@yao-pkg__pkg@6.21.0`, `@earendil-works__pi-ai@1.0.2`, `@fortune-sheet__core|react@1.0.4`, `@electron__osx-sign@1.3.3` | `patches/` |
| Typecheck getrennt | `tsconfig.host.json` (Host), `tsconfig.client.json` (Client), `tsconfig.base*.json` | Dateiliste |

**Vollständige Konfigurationsfläche** (Env-Variablen, Dateien, Flags, Verzeichnisse):
siehe `docs/reference/inventory-config-native.md` und
`docs/reference/inventory-session-data.md`.

---

## 6. Native Sprachgrenze der Vorlage (Ist-Zustand, vollständig)

Die Vorlage enthält **genau zwei** Nicht-TypeScript-Anteile:

### 6.1 `native/system` — C-Addon (84 Dateien)

```
native/system/
├── package.json                     @deepseek-ai/node-addon-system-workspace
├── AGENTS.md, LICENSE, README(.zh).md, README.i18n.yaml
├── tsconfig.json, tsconfig.base.json
├── docs/
│   ├── architecture.md
│   ├── cli-contract.md              ← das CLI-Vertragsdokument
│   ├── flock-contract.md            ← das Sperr-Vertragsdokument
│   ├── naming.md, packaging.md, release.md, support-matrix.md
├── packages/
│   ├── entry/                       @deepseek-ai/node-addon-system
│   │   └── src/
│   │       ├── main.c               ← landlock-run (Landlock-Launcher, 298 Zeilen)
│   │       ├── flock.c              ← Node-API-v8-Bindung (flock, 164 Zeilen)
│   │       ├── index.ts             ← JS-API über den Launcher (launcherPath/probe/grantArgs)
│   │       └── flock.ts             ← JS-API tryLockExclusive(fd)
│   ├── darwin-arm64/  darwin-x64/   Plattform-Verpackungen (prebuilds.json)
│   ├── linux-arm64/   linux-x64/
│   └── test/                        flock.test.js, launcher.test.js, entry.test.js,
│                                    package-matrix.test.js, release-packing.test.js,
│                                    fixtures/flock-oracle.c (Syscall-Orakel, nur Tests)
```

**Aufgabe — zwei getrennte C-Programme, ein Paket:**

| Programm | Zweck | Vertrag |
|---|---|---|
| `main.c` → `landlock-run` | Sandbox: Landlock-Ruleset auf sich selbst legen, dann `execvp` des eingehüllten Befehls. Vier Flags: `--ro <path>`, `--rw <path>`, `--`, `--probe`. Fail-closed, Exit 125 bei jedem Launcher-Fehler, `no_new_privs` vor der Restriktion, ABI-Verhandlung bis **ABI 5**. | `docs/cli-contract.md` |
| `flock.c` | Dateisperre: eine asynchrone `flock(fd, LOCK_EX \| LOCK_NB)`-Anfrage über Node-API v8; der Aufrufer besitzt das fd, das Modul öffnet/schließt/entsperrt nie. | `docs/flock-contract.md` |

**Windows:** laut `flock-contract.md` „Windows does not use this API and retains its existing
semaphore implementation" — die Plattformpakete sind ausschließlich `linux-{x64,arm64}` und
`darwin-{x64,arm64}`. Die Windows-Sperre liegt also **im JS** (Semaphore), nicht im C.
**Verpackungsmuster:** kleines Binary → als eigenes npm-Paket je Plattform verpackt →
vom JS über `dsh-native-command` / `dsh-lazy-require` aufgerufen.
**Vertragsdokumente sind Teil der Vorlage** (`flock-contract.md`, `cli-contract.md`,
`packaging.md`, `support-matrix.md`) — diese sind für die Rust-/Go-Neuimplementierung
die maßgebliche Schnittstellenspezifikation.

### 6.2 `python/sdk` — Python-Client-SDK (47 Dateien)

```
python/
├── README.md (+ .zh.md, .i18n.yaml)
├── development.md (+ .zh.md, .i18n.yaml)
└── sdk/
    ├── pyproject.toml, uv.lock, README*
    ├── examples/        minimal.py + README*
    └── src/deepseek_harness/
        ├── __init__.py
        ├── api.py       ← API-Oberfläche
        ├── client.py    ← Transport/Client
        ├── errors.py    ← Fehlertypen
        └── models.py    ← Datenmodelle
```

**Rolle:** **kein** Backend — ein **Client-SDK** gegen den Harness. Damit ist es kein
Kandidat für eine Rust-Portierung des Servers, sondern eine **Schnittstellenbeschreibung**:
die vier Module `api`/`client`/`errors`/`models` zeigen exakt, welche Methoden, Fehler
und Datenmodelle der Harness nach außen anbietet.

**Vertiefung:** `docs/reference/inventory-config-native.md`
(inkl. `flock`-Vertrag, CLI-Vertrag, SDK-Methoden).

---

## 7. Werkzeugketten und Bauweise

| Element | Beobachtung | Quelle |
|---|---|---|
| Build-Einstieg | `tsx scripts/build.ts` — **nicht** `tsc -b` direkt | `reference/reference-dsh.md` |
| `pnpm run build` | exit 0, 212,9 s, 357 Client-Artefakte | dito |
| `tsc -b tsconfig.host.json` (TS 6.0.3) | exit 0, 124,5 s, 0 Meldungen | dito |
| Zerlegte Einzelaufrufe | scheitern mit Hunderten Folgefehlern → **Bedienfehler, kein Codefehler** | dito |
| Bundler | `tsdown.config.ts` (tsdown) | Dateiliste |
| Tests | `vitest.config.ts`, `vitest.bench.config.ts`; Snapshot-Suites unter `snapshots/` | Dateiliste |
| Übersetzungsinfrastruktur | jede Doku-Datei hat `.i18n.yaml` + `.zh.md`; `scripts/` enthält Doku-Graph- und Katalog-Generatoren | Dateiliste, `packages/CLAUDE.md` |
| Modul-Konvention | **jedes** Paket: `src/` (Quelle) + `lib/`+`lib/types/` (gebaut) + `tests/` + `tsdown.config.ts` + `README.md(.zh.md/.i18n.yaml)` | Stichproben |

**Die 388 Skripte** sind überwiegend Generatoren und Prüfer, u. a.:
`build.ts`, `persistence-schema.ts`, `gen-config-catalog.ts`, `verify-export-jsdoc.ts`,
`gen-doc-graphs.ts`, `cordis-core-api.ts`, `verify-type-equiv.ts`, `agent-note-tree.ts`,
`build-exe-for-python-sdk*.ts`, `build-python-release.py`, `change-scope.ts`,
`browser-bundled-externals.ts`, `benchmark-npm-resolution.ts`.
**1411 der 1430 TS-7-Fehler** liegen in diesem Ordner — sie nutzen die alte
TypeScript-Compiler-API (`reference/reference-dsh.md`).

---

## 8. Python- und C++-Anteil — die Faktenlage für das Mapping

Für t3 ist entscheidend, **was** überhaupt übertragen werden muss. Die Doku des
Zielprojekts spricht von „Python und wahrscheinlich auch C++" als abzulösendem Stack.
Das Inventar der Vorlage zeigt:

| Erwartung | Befund | Konsequenz für t3 |
|---|---|---|
| Python-Backend | **Nein.** Python existiert **nur** als Client-SDK (`python/sdk`, 47 Dateien, 5 Module + 1 Beispiel) | Es gibt **kein** Python-Backend zu übersetzen. Die Python-Module werden zur **Schnittstellenspezifikation** für Go/Rust-Dienste und den TS-Client. |
| C++-Backend | **Nein.** Kein C++ in der Vorlage. Genau **ein** C-Programm: `native/system/packages/entry/src/main.c` (Dateisperre) | Der Rust-Anteil ersetzt dieses **eine** C-Programm — plus die im Zielprojekt dokumentierte Sandbox-Arbeit (`sandbox-windows-acl`, Landlock). |
| Go-Backend | **Nein.** Kein Go in der Vorlage | Go ist **Neuland** aus Sicht der Vorlage: Supervisor und (später) Gateway werden nach der Doku des Zielprojekts **neu** gebaut, nicht übersetzt. |

**Damit ist die Aufgabe präzise:** Es wird **kein** fremder Python-/C++-Code portiert,
weil es keinen gibt. Übertragen werden (a) **Struktur**, (b) **Schnittstellen und
Verhalten** der TypeScript-Backends und (c) das **eine** C-Addon. Der neue Stack
(Golang, Bun/TS7, Rust) ist eine **Neuimplementierung entlang der Vorlage**, genau wie
in `docs/concept.md` gefordert („nicht Codebasis, sondern Vorlage").

---

## 9. Für t3/t4 wichtigste Einzelbefunde

1. **Die Vorlage hat die Unit-Schale schon.** `units/README.md` + `unit.json`-Format +
   `rules[]` in `.pmh/base.json` — die Zielstruktur des Zielprojekts ist damit
   **vorlagenkonform**, nicht erfunden.
2. **`units/*` fehlt in `pnpm-workspace.yaml`.** Bei Bun übernimmt `bun install` die
   Workspace-Auflösung über `workspaces` in der Wurzel-`package.json`; der Punkt muss
   in t4/t8 ausdrücklich behandelt werden.
3. **Ein Bundler-/Test-Stack existiert** (`tsdown`, `vitest`, Snapshot-Suites) — bei Bun
   ersetzt durch `bun build` / `bun test`, aber die **Struktur** (`src/`, `tests/`,
   `README.md`) bleibt.
4. **Jedes Paket dokumentiert sich selbst** (`README.md` + `.zh.md` + `.i18n.yaml`).
   Die Zielstruktur braucht mindestens `README.md` je Paket (t8).
5. **Die zwei Betriebsachsen** (lokal↔remote, Seam↔Provider) sind das
   Übertragungsmuster für Go- und Rust-Dienste: Go/Rust werden als **Provider hinter
   einem Prozess-Seam** angebunden, nicht in den Core eingebaut.
6. **`native/system/docs/flock-contract.md` und `cli-contract.md` sind die
   Spezifikation** für die Rust-Umsetzung — sie beschreiben Verhalten, nicht C-Code.
7. **`python/sdk/src/deepseek_harness/{api,client,errors,models}.py`** ist die
   Spezifikation der Außenschnittstelle.

---

## 10. Nachweis: Vorlage unverändert

| Prüfung | Ergebnis |
|---|---|
| Schreibzugriffe auf die Vorlage durch t2 | **keine** — ausschließlich `Get-ChildItem`, `Get-Content`, `read` |
| Manifest `core-template-before.txt` vs. `core-template-after.txt` | **identisch** (`reference/verify/review-r1-r2.md`: `Compare-Object` → 0 Abweichungen) |
| Dateizahl jetzt | 27.093 (ohne `node_modules/`, `.git/`) — deckt sich mit dem Manifest |
