# Reverse API Engineer (RAE) — Kommandos und Verträge

RAE startet einen Browser (manuell oder agentengesteuert), zeichnet den Verkehr als HAR auf und lässt ein Modell daraus einen Client schreiben.

- Python ≥ 3.11
- Installation: `uv tool install reverse-api-engineer` (oder `pip install reverse-api-engineer`)
- Manueller Modus zusätzlich: `uv tool install "reverse-api-engineer[manual]"` und `playwright install chromium`
- Konfiguration: `~/.reverse-api/config.json`
- Schema-Version des JSON-Vertrags: `reverse-api-engineer --json-schema-version` → aktuell `1`

## Modi

| Modus | Bedeutung |
|---|---|
| `manual` | Der Mensch bedient den Browser, das Modell schreibt den Client |
| `agent` | Ein Agent steuert die Aufzeichnung (Playwright-MCP, Chrome-MCP oder Vercel `agent-browser`) |
| `engineer` | Erneutes Generieren auf einer früheren Aufzeichnung |
| `collector` | Strukturierte Datensammlung per Websuche/Fetch |

Im interaktiven REPL wechselt **Shift+Tab** den Modus.

## `agent`

```text
reverse-api-engineer agent [-p PROMPT] [-u URL] [-m MODEL] [-o DIR]
                           [--no-interactive] [--json | --json-stream]
                           [--headless] [--dry-run]
```

- `-p/--prompt` — Ziel in natürlicher Sprache
- `-u/--url` — Start-URL
- `-m/--model` — `claude-sonnet-4-6` (Default), `claude-opus-4-6`, `claude-haiku-4-5`
- `-o/--output-dir` — Zielverzeichnis
- `--json` — ein JSON-Dokument auf stdout, Logs auf stderr; impliziert `--no-interactive`
- `--json-stream` — NDJSON-Fortschritt, letzte Zeile `{"event":"result",...}`
- `--headless` — Browser ohne Fenster (auf Rechnern ohne Display nötig)
- `--dry-run` — prüft Prompt/URL/Config/Umgebung ohne Browser; Exit 0 nur wenn alle Checks bestehen

JSON-Ergebnis (`schema_version: 1`):

```json
{
  "schema_version": 1,
  "status": "ok",
  "run_id": "a450e520ca30",
  "prompt": "…",
  "url": "https://…",
  "mode": "auto",
  "har_path": "C:\\Users\\…\\recording.har",
  "script_path": "C:\\Users\\…\\api_client.py",
  "usage": { "input_tokens": 0, "output_tokens": 0, "total_cost_usd": 0 },
  "error": null
}
```

Exit-Codes: `0` Erfolg, `1` Laufzeitfehler, `2` fehlendes Pflichtargument unter `--no-interactive`/`--json`.

## `engineer`

```text
reverse-api-engineer engineer [RUN_ID] [-p PROMPT] [--fresh] [-m MODEL] [-o DIR]
                              [--json | --json-stream]
```

Ohne `--fresh` wird der Prompt als zusätzliche Anweisung auf den ursprünglichen gelegt; mit `--fresh` wird von vorn generiert. `RUN_ID` darf ein Suchbegriff sein.

## `run`

```text
reverse-api-engineer run IDENTIFIER [-f DATEI] [--ls]
                       [--no-interactive] [--auto-install]
                       [--json | --json-stream] [-- ARGS…]
```

- `--ls` listet verfügbare Skripte, ohne sie auszuführen
- `--auto-install` installiert fehlende Abhängigkeiten beim Retry
- Alles nach `--` geht an das Skript
- Exit-Code: der Rückgabewert des Skripts; `1` wenn kein Skript gefunden wurde; ≠0 wenn unter `--no-interactive` eine Auswahl nötig gewesen wäre

## `list` / `show`

```text
reverse-api-engineer list [--json] [--full] [-n N] [-m MODUS] [--model MODELL] [-s SUCHE]
reverse-api-engineer show [RUN_ID] [--json]
```

`list --json` liefert immer ein flaches Array (ggf. `[]`). `show --json` gibt `1` zurück, wenn der Run nicht existiert.

## `collector`

```text
reverse-api-engineer collector [-p PROMPT] [-m MODEL] [-o DIR]
```

Ergebnisse unter `./collected/<ordner>/` (`items.json`, `items.csv`, `README.md`).

## Ausgabeorte

- `~/.reverse-api/runs/scripts/<run_id>/` — dauerhafte Ablage
- `./scripts/<sprechender-name>/` — lokale Kopie (`api_client.*`, `README.md`, `example_usage.*`)
- `./collected/<ordner>/` — Collector-Ergebnisse

## Schlüssel: PMH-Credential-Store statt Datei

Der Modellschlüssel liegt im Credential-Store des Harness, nicht in `config.json`:

- Datei: `$DSH_HOME/.credentials.yaml` (bzw. `~/.dsh/.credentials.yaml`), Abschnitt `refs`
- Auflösungsreihenfolge: Startumgebung → Store → Projekt-`.env` → Home-`.env`; die Startumgebung gewinnt und ist schreibgeschützt
- Der Store lädt Änderungen automatisch nach, ein Neustart ist nicht nötig

Sicher speichern (unsichtbare Eingabe, Wert erscheint nie in Ausgabe oder Prozessliste):

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/rae-key.ps1 -Name ANTHROPIC_API_KEY
```

Ausführen mit Auflösung im Prozess:

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/rae-run.ps1 -Prompt "…" -Url https://… -Model claude-sonnet-4-6 -Sdk claude
```

`rae-run.mjs` liest `refs[<Name>]`, setzt die Variable nur im Kindprozess und meldet `credential_source` und `credential_configured` — nie den Wert. Ein gesetzter Umgebungswert hat Vorrang und wird als `environment` gemeldet.

## Konfiguration

`~/.reverse-api/config.json`, bearbeitbar über `/settings` im REPL. Relevante Felder:

```json
{
  "agent_provider": "auto",
  "sdk": "claude",
  "output_language": "python",
  "output_dir": null,
  "real_time_sync": true
}
```

- `sdk`: `claude`, `opencode`, `cursor`, `copilot`
- `output_language`: `python`, `javascript`, `typescript`, `go`, `java`, `csharp`, `php`, `ruby`, `c`, `powershell`
- `agent_provider`: `auto` (Playwright-MCP), `chrome-mcp` (echtes Chrome), `agent-browser` (Vercel-CLI)

Umgebungsvariablen: `RAE_DEBUG=1` (Tracebacks), `RAE_AGENT_BROWSER_*`, `RAE_OPENCODE_PACKAGE`, `OPENCODE_BASE_URL`, `OPENCODE_SERVER_PASSWORD`, `RAE_OLLAMA_BASE_URL`.

## Fallstricke

- Ohne Schlüssel endet `agent` mit `status: "error"`; `credential_configured: false` benennt die Ursache ohne Wert.
- Sites mit aggressivem Bot-Schutz liefern leere oder unvollständige HARs. Dann manueller Modus oder abbrechen.
- Generierter Code läuft lokal — vor dem Ausführen prüfen.
- `--json` hält stdout maschinenlesbar; Diagnose immer aus stderr lesen.
