---
name: external-agents
description: "Ein fremdes Agenten-Harness als Unterprozess aufrufen: Claude Code, Codex, Hermes, Pi, OMP. Wenn ein anderes Modell oder eine fremde Werkzeugkiste eine Aufgabe übernehmen soll, ohne dass Prometheus dessen Schlüssel kennt. Auch der Einstieg, wenn es um einen echten Subagent-Adapter für Pi/OMP geht — der ist noch nicht gebaut."
---

# external-agents

Ein fremder Agent als Werkzeugaufruf: Prozess starten, Prompt übergeben,
Antwort zurückgeben. **Kein Subagent** — kein Katalogeintrag, keine Sitzung im
Kind-Baum, keine Fortsetzung. Wer das braucht, nimmt das `subagent`-Werkzeug mit
`spawn` oder `fork`.

## Wann

- Eine **zweite Meinung** oder ein anderes Modell soll dieselbe Frage sehen.
- Die Aufgabe braucht **Werkzeuge oder Skills des fremden Harness**, nicht die
  von Prometheus.
- Ein Lauf soll **isoliert** stattfinden und Prometheus nichts davon wissen
  (kein Token-Zähler, keine Katalogspur).
- Vergleich: derselbe Prompt durch mehrere Agenten.

## Wann nicht

- Fortsetzen, Nachsteuern, Kind-Sitzung im Baum → `subagent` (in-process).
- Aufgabe, die ich selbst kann: der Umweg kostet Geld und Kontext, siehe
  „Was es kostet".
- Etwas nur **nachschlagen** → `web_fetch`, `research_search`.

## Stand auf dieser Maschine (gemessen 27.10.2026)

| Agent | Aufruf | Stand |
|---|---|---|
| Claude Code | `claude -p --output-format json "<prompt>"` | läuft, `exit=0`, Antwort `OK` |
| Codex | `codex exec --skip-git-repo-check --json "<prompt>"` | läuft, `exit=0`, Antwort `OK` |
| Hermes | `hermes --accept-hooks -z "<prompt>"` | läuft, `exit=0`, Antwort `OK` |
| Pi | `pi -p "<prompt>"` | **blockiert**: `No API key found for the selected model.` |
| OMP | `omp -p "<prompt>"` | **blockiert**: `403 ... (api_key_source: payg)` |

Pi und OMP sind installiert, aber ohne nutzbare Anmeldung. Das ist kein Fehler
des Aufrufs — es fehlt der Schlüssel beziehungsweise das Recht am Modell. Nicht
stundenlang Flags probieren, sondern den Fehlertext zitieren und den Weg unten
nennen.

## Aufruf

Der Fallstrick, der Zeit kostet: **`Start-Process -ArgumentList @(...)` zerlegt
einen Prompt in Einzelwörter.** Codex und Hermes antworten dann mit
`unexpected argument 'mit'` beziehungsweise `'mit' is not a hermes command`,
und man sucht den Fehler beim falschen Ende.

```powershell
# Richtig: der Prompt bleibt ein Argument.
& claude -p --output-format json "Antworte mit genau dem Wort OK und sonst nichts."

# Ebenfalls richtig, wenn ein Prozessobjekt gebraucht wird: Anführungszeichen
# selbst setzen und die Argumentliste als EINE Zeichenkette übergeben.
Start-Process -FilePath $exe -ArgumentList '-p "Prompt hier"' -NoNewWindow -PassThru
```

Immer in einem **eigenen, leeren Arbeitsordner** starten — nicht im Repo:

```powershell
$probe = Join-Path $PWD '.pmh-build/external-agents-probe'
New-Item -ItemType Directory -Force -Path $probe | Out-Null
```

## Antwort auslesen

**Claude Code** (`--output-format json`) schreibt ein Objekt, eine Zeile:

- `.result` — der Text (hier `"\n\nOK"`)
- `.is_error`, `.subtype`, `.stop_reason` — Abbruch erkennen
- `.total_cost_usd`, `.usage`, `.modelUsage` — Kosten und Token
- `.session_id` — Bezug für einen späteren `--resume`

**Codex** (`--json`) schreibt JSONL, ein Ereignis pro Zeile:

- `thread.started` — `thread_id`
- `item.completed` mit `item.type == "agent_message"` — `item.text` ist die Antwort
- `item.completed` mit `item.type == "error"` — Hinweise, kein Abbruch
- `turn.completed` — `usage`

**Hermes** (`-z`) schreibt reinen Text auf stdout.

## Fallstricke, alle gemessen

1. **Fremde Harnesses lesen die Umgebung dieses Repos.** Codex meldete
   `Exceeded skills context budget … 93 additional skills were not included`,
   OMP startete `codebase-memory-mcp` mit, Hermes wollte einen `pre_llm_call`-Hook
   von `codebase-memory-mcp` registrieren und blieb bei `Allow this hook to run?
   [y/N]` stehen. Deshalb `--accept-hooks` (Hermes) und ein leerer Arbeitsordner.
2. **stderr ist kein Fehler.** Codex schreibt dort sein Banner und
   `Reading additional input from stdin...`, Claude eine Modellwarnung
   (`[claude-code:unrecognized_model] {"model":"auto"}`). Auf den Exit-Code und
   stdout sehen, nicht auf stderr.
3. **Zeitlimit setzen.** Hermes ohne `--accept-hooks` wartet unbegrenzt auf die
   Hook-Freigabe, OMP allein ~30 s auf seinen MCP-Start.
4. **Schlüssel werden nicht geteilt.** Jedes CLI nutzt seinen eigenen
   Auth-Store; Prometheus' Credential-Seam bleibt außen vor. Das ist der
   Vorteil dieses Weges — und der Grund, warum ein fehlender Login nicht durch
   Prometheus zu beheben ist.

## Was es kostet

Ein „OK" ist nicht billig, weil jedes Harness seinen Grundkontext mitbringt:

| Agent | Eingabetoken für `OK` | Notiz |
|---|---|---|
| Claude Code | 4.580 | `total_cost_usd: 0.023325` |
| Codex | 21.711 | Modell `gpt-6-luna` |

Also nicht in Schleifen über viele Dateien. Für Reihenfolgen und Vergleiche
lieber einen Aufruf mit mehreren Fragen als viele kleine.

## Wenn ein Harness blockiert

- **Pi**: `pi login`, oder `--api-key <key>`, oder `--provider` plus `--model`.
  Der Fehlertext nennt die Hilfeseiten unter
  `%APPDATA%\npm\node_modules\@earendil-works\pi-coding-agent\docs\`.
- **OMP**: `403 ... you have no permission to access this resource
  (api_key_source: payg)`. Schlüssel oder Modell ohne Recht; `--model` prüfen.
  OMP liest außerdem die Projektkonfiguration und startet deren MCP-Server.
- **Neu dazugekommen?** `--help` zeigt die maschinensteuerbaren Modi:
  `--mode text|json|rpc` und `-p` (Pi), `--mode rpc` und `-p` (OMP), `exec` und
  `app-server` (Codex), `-z` und `--cli` (Hermes), `-p` (Claude Code).

## Noch nicht gebaut: ein echter Subagent-Adapter

**Wenn der Nutzer dieses Thema von sich aus wieder anspricht** — „Adapter",
„Pi als Subagent", „OMP als Subagent", „fremdes Harness im Kind-Baum" — **frag
nach, ob er jetzt gebaut werden soll.** Nicht ungefragt anfangen; die
Entscheidung vom 27.10.2026 war ausdrücklich: erst CLI, Adapter später.

Warum er sich lohnt: Pi und OMP haben `--mode rpc`, also einen dauerhaften
JSON-RPC-Kanal statt Prozess pro Aufruf. Damit überlebt eine Sitzung mehrere
Runden — genau das, was die Codex-Vorlage nicht kann.

Bausteine, damit die Arbeit nicht bei Null beginnt:

- **Vorlage**: `packages/subagent/subagent-codex` (Codex-App-Server, JSONL,
  `disposeGraceMs`). Lokal nicht installiert; im Register steht `0.0.1-rc.1`
  gegen einen Kern auf `0.2.1-alpha.2` — Fassungsfrage vorher klären.
- **Vertrag**: `ctx.subagents` mit `startActivation`, `SubagentCapabilities`,
  ein Ausführungs-Handle je Kind. Externe Backends sind Einmal-Ausführungen:
  keine Folgeaufträge, Blatt im Katalog. Belegt in
  `docs/dsh/original/subsystems/subagent.md`.
- **Konfiguration**: die Felder der Geschwister in
  `docs/dsh/original/config-catalog.md` (Abschnitte `@deepseek-ai/dsh-subagent-*`).
  Muster: `providerName`, `model`, `env`, `permissionMode`, `disposeGraceMs`.
- **Anbindung an das Modell**: eine `tool-subagent`-Instanz mit `provider` auf
  den neuen Namen, Eintrag in `cordis.patch.yml`.
- **Bekannte Sperre**: `subagent-claude-code` und `subagent-codex` sind im
  Profil abgeschaltet, Begründung in `scripts/profile-patch.mjs`. Wer sie
  scharf schaltet, prüft die Fassung — nicht die Annahme „wird schon passen".

## Nicht verwechseln

| Vorhaben | Weg |
|---|---|
| Skills eines fremden Harness nutzen | `customSkillDirs` genügt, Format `<name>/SKILL.md` |
| Claude-Code-**Plugins und Hooks** | Brücke `claude-code-mods`, experimentell und teilkompatibel |
| Fremder Agent als **Subagent** | noch nicht gebaut, siehe oben |
| Fremder Agent als **Werkzeug** | diese Skill |

## Aufräumen

Der Probe-Ordner sammelt Ausgaben. Nach dem Messen löschen:

```powershell
Remove-Item -Recurse -Force .pmh-build/external-agents-probe
```
