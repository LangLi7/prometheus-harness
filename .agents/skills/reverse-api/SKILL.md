---
name: reverse-api
description: Reverse-engineer APIs and app behavior from artifacts you own or are authorized to inspect. Capture a web app's traffic and generate a typed client (Reverse API Engineer), or inspect JavaScript/Electron/native/APK targets for endpoints, auth flow and logic (REA). Use for endpoint discovery, payload recovery, HAR analysis or client generation.
whenToUse: Der Nutzer will wissen, welche API eine App oder Website benutzt, wie Authentifizierung und Payloads aussehen, oder möchte daraus einen funktionierenden Client bauen.
metadata:
  version: "0.1.0"
  tools: "rea-agents, reverse-api-engineer"
---

# Reverse API

Ziel: Aus einem Ziel, das der Nutzer besitzt oder für das er schriftlich autorisiert ist, eine **belegte** API-Beschreibung und einen **lauffähigen** Client machen — mit Beweisen, nicht mit Vermutungen.

Zwei Werkzeuge, ein Ablauf:

| Frage | Werkzeug | Weg |
|---|---|---|
| Welche Endpunkte ruft diese Website auf, und wie sieht ein Client dafür aus? | Reverse API Engineer (RAE) | Browser-Capture → HAR → generierter Client |
| Was macht diese App/JS/APK/native Binärdatei, wo sind ihre Endpunkte und ihr Auth-Fluss? | REA | statische Analyse + optionale Laufzeitbeobachtung |
| Ich habe eine HAR-Datei und will die API-Oberfläche sehen | REA | `inspect-web-network-capture` → `api-surface` |

## 1. Freigabe-Tor — vor jedem Kommando

Prüfe in dieser Reihenfolge und fahre nur fort, wenn **alle** Punkte belegt sind:

1. **Eigentum oder Autorisierung.** Gehört das Ziel dem Nutzer, ist es sein eigenes Konto, ein Testsystem, ein Bug-Bounty-Ziel im erlaubten Scope — oder liegt eine schriftliche Erlaubnis vor?
2. **Kein Umgehen von Schutz.** Keine Auth-Bypässe, kein Credential-Stuffing, keine Umgehung von Rate-Limits oder Bot-Schutz, kein Zugriff auf fremde Konten.
3. **Datenminimierung.** Keine personenbezogenen oder geheimen Daten in Ausgaben, Commits oder Berichte übernehmen.

Wenn ein Punkt unklar ist: **frage nach und warte**, statt zu analysieren. Details und Formulierungen: [references/authorization.md](references/authorization.md).

Ein ehrlicher Satz genügt: „Ich brauche zuerst die Bestätigung, dass du dieses Ziel analysieren darfst (eigenes Konto/Testinstanz/schriftliche Freigabe). Welche der drei trifft zu?“

## 2. Umgebung prüfen

### Aufruf

Die Skripte liegen im Skill-Verzeichnis. Alle Beispiele unten sind relativ dazu — der Agent löst sie gegen die Skill-Basis auf. Eine normale Shell startet aber im Home-Verzeichnis; dort existiert `scripts/...` nicht. Deshalb entweder in das Repo wechseln oder den absoluten Pfad verwenden:

```powershell
# Variante A: aus dem Repo-Wurzelverzeichnis
cd C:\Users\Chang\prometheus-harness
pwsh -NoProfile -ExecutionPolicy Bypass -File .agents\skills\reverse-api\scripts\doctor.ps1

# Variante B: von überall über die Skill-Variable
$skill = "$env:USERPROFILE\.agents\skills\reverse-api"   # Junction auf das Repo
pwsh -NoProfile -ExecutionPolicy Bypass -File "$skill\scripts\doctor.ps1"
```

`$skill` zeigt auf `~\.agents\skills\reverse-api`; falls der Skill woanders liegt, den Pfad anpassen. Alle folgenden Skript-Aufrufe gelten relativ zur Skill-Basis (Agent) bzw. über `$skill` (normale Shell).

Das Skript meldet Node, npm, Python, uv, `rea`, `reverse-api-engineer`, Chrome/Edge und ob der DSH-MCP-Client installiert ist. Fehlt etwas, installiere gezielt:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "$skill\scripts\install.ps1" -All   # REA global + RAE als uv-Tool
```

Der `-ExecutionPolicy Bypass` ist auf Windows-Systemen nötig, deren Policy `.ps1`-Dateien blockiert (Fehler `SecurityError`). Auf Linux/macOS entfällt er. **REA ruft man unter Windows PowerShell immer als `rea.cmd` auf** — `rea` löst auf `rea.ps1` auf und scheitert an derselben Policy. Unter Linux/macOS heißt das Kommando `rea`.

Alternativ von Hand (Node ≥ 22.19 bzw. 24.11; Python ≥ 3.11):

```powershell
npm install --global rea-agents
uv tool install reverse-api-engineer            # optional: "reverse-api-engineer[manual]"
```

Auf Windows ist `npm.ps1` oft durch die Execution Policy gesperrt. Dann `npm.cmd` verwenden oder `node <npm-cli.js>` aufrufen; das Installationsskript macht das automatisch.

## 3. Weg A — Website → typisierter Client (RAE)

RAE startet einen Browser, zeichnet den Netzwerkverkehr als HAR auf und lässt ein Modell daraus einen Client schreiben.

**Erst trocken prüfen** (kein Browser, keine Kosten):

```powershell
reverse-api-engineer agent -p "alle öffentlichen Job-Endpunkte erfassen" -u https://example.com/jobs --dry-run
```

Dann der echte Lauf, maschinenlesbar:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "$skill\scripts\rae-run.ps1" -Prompt "alle öffentlichen Job-Endpunkte erfassen" -Url https://example.com/jobs -Headless
```

Oder direkt:

```powershell
reverse-api-engineer agent -p "<Ziel>" -u <Start-URL> --json
```

### Schlüssel und Modell

RAE braucht einen Modellschlüssel. Er gehört **nicht** in die Konfiguration, sondern in den Credential-Store des Harness (`$DSH_HOME/.credentials.yaml`, Abschnitt `refs`). Einmalig sicher speichern — die Eingabe bleibt unsichtbar, der Wert wird nie ausgegeben:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "$skill\scripts\rae-key.ps1" -Name ANTHROPIC_API_KEY
```

`rae-run.ps1` löst den Wert im Node-Prozess auf und übergibt ihn RAE nur als Umgebungsvariable; Argumente und Ausgabe enthalten ihn nie. Modell und SDK wählst du pro Lauf:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "$skill\scripts\rae-run.ps1" `
  -Prompt "…" -Url https://… -Model claude-sonnet-4-6 -Sdk claude -Credential ANTHROPIC_API_KEY
```

- `-Model`: `claude-sonnet-4-6` (Default), `claude-opus-4-6`, `claude-haiku-4-5`
- `-Sdk`: `claude`, `opencode`, `cursor`, `copilot`
- `-Credential`: Name des Eintrags im Store (Standard `ANTHROPIC_API_KEY`); ein bereits gesetzter Umgebungswert hat Vorrang
- Ohne `--dry-run` prüft ein Lauf zuerst die Umgebung; `checks` im Ergebnis zeigt, ob der Schlüssel erkannt wurde (ohne Wert)

Wichtig:

- `--json` liefert **ein** JSON-Dokument auf stdout, Logs gehen nach stderr. `--json-stream` liefert NDJSON-Fortschritt und am Ende ein `{"event":"result",...}`.
- Ergebnisobjekt: `schema_version`, `status` (`ok`/`error`), `run_id`, `har_path`, `script_path`, `usage`, `error`.
- Ausgaben liegen in `~/.reverse-api/runs/scripts/<run_id>/` und zusätzlich unter `./scripts/<sprechender-name>/`.
- `--headless` ist auf Rechnern ohne sichtbare Oberfläche Pflicht.
- Ohne Modell-Zugang schlägt der Lauf mit `status: "error"` fehl — dann fehlt ein Schlüssel im Credential-Store (nicht im Ziel). `credential_configured: false` im Ergebnis sagt es ohne Wert.

**Client testen und nachbessern:**

```powershell
reverse-api-engineer run <run_id> --file api_client.py --json
reverse-api-engineer engineer <run_id> -p "Pagination ergänzen" --json
reverse-api-engineer list --json
reverse-api-engineer show <run_id> --json
```

`run` gibt den Exit-Code des Skripts zurück. Erst wenn der Client gegen das echte Ziel läuft und plausible Daten liefert, ist der Auftrag erfüllt. Die vollständige, verifizierte Kommandofläche steht in [references/rae.md](references/rae.md).

## 4. Weg B — App/Binary/JS → API-Verständnis (REA)

REA arbeitet offline auf Artefakten (kein Provider nötig) oder mit einem Analyse-Engine (Ghidra/IDA/Hopper) für native Ziele.

Für die volle REA-Toolpalette (207 Werkzeuge, Provider-Details, Evidenz-Views) das von REA mitgelieferte Skill **`reverse-engineer-anything`** laden — es ergänzt dieses hier um die Tiefe, während `reverse-api` den Ablauf und die RAE-Brücke liefert.

Ist REA als MCP verbunden (in dieser Installation aktiv), stehen dieselben Operationen zusätzlich als `mcp__rea__*` bereit — z. B. `mcp__rea__binary_session` für den Fähigkeitsstatus, `mcp__rea__analyze_javascript_application` oder `mcp__rea__inspect_web_network_capture`. Die CLI-Beispiele gelten unverändert weiter; Einzelaufgaben sind dort billiger.

```powershell
rea.cmd providers --json          # welche Engines sind da?
rea.cmd capabilities --json       # welche Fähigkeiten meldet die Installation?
rea.cmd --help                    # exakte Kommandofläche der installierten Version
```

**JavaScript/Electron** (kein Engine nötig) — der wichtigste Fall für API-Fragen:

```powershell
rea.cmd analyze-javascript-application "C:\Pfad\zur\app" --json > app-evidence.json
node "$skill\scripts\summarize-evidence.mjs" app-evidence.json
```

Nur stdout landet in der Datei, stderr bleibt sichtbar. Kein `*>` verwenden — das mischt Fehlermeldungen in das JSON.

Große Evidenzdateien niemals ungefiltert in den Kontext laden. Stattdessen die Zusammenfassung oder eine gezielte View:

```powershell
pwsh -ExecutionPolicy Bypass -File "$skill\scripts\inspect-view.ps1" -Evidence app-evidence.json -View summary
pwsh -ExecutionPolicy Bypass -File "$skill\scripts\inspect-view.ps1" -Evidence app-evidence.json -View page -Collection modules -Limit 20
```

**Website zur Laufzeit** (Chrome-Familie, CDP):

```powershell
rea.cmd observe-web-execution https://example.com --json
rea.cmd capture-browser-scenario https://example.com --json
```

**Vorhandene HAR/SAZ-Aufzeichnung** — die Brücke zwischen beiden Werkzeugen:

```powershell
rea.cmd inspect-web-network-capture "C:\Pfad\aufnahme.har" har --json > capture.json
pwsh -ExecutionPolicy Bypass -File "$skill\scripts\inspect-view.ps1" -Evidence capture.json -View api-surface
```

`inspect-analysis-view` akzeptiert in REA 6.7.0 nur `inline` oder `retained-evidence`; die in der REA-Doku genannte Quelle `evidence-file` lehnt die CLI mit `invalid_value` ab. `inspect-view.ps1` bettet die Evidenz deshalb byte-genau ein — ein JSON-Roundtrip über PowerShell würde die `evidence_id` entwerten.

Die `api-surface`-View gruppiert Requests nach Methode, Origin und Pfad-Template, nennt Status und MIME-Typen — sie erfindet aber **keine** Schema- oder Kausalitätsaussagen, und abgeschnittene Seiten beweisen keine Vollständigkeit.

**Native Binärdateien** (Engine nötig):

```powershell
rea.cmd analyze .\program.exe --provider ghidra --json
rea.cmd search .\program.exe "https://" --provider ghidra --json
rea.cmd function .\program.exe main --provider ghidra --json
rea.cmd decompile .\program.exe 0x1000 --provider ghidra --json
```

**Weitere artefaktfreie Einstiege:** `inspect-go-binary`, `inspect-rust-binary`, `inspect-managed-artifact` (.NET), `inspect-il2cpp-metadata` (Unity), `inspect-sqlite-database`, `inspect-artifact` (ZIP/APK/IPA/DMG), `inspect-android-package` (JADX), `inspect-model-artifact`, `inspect-wasm-artifact`.

Regeln für Beweise: jeder Befund nennt Quelle (Datei, Adresse, Modul, Record-Ordinal), Konfidenz und Grenze. „Nicht gefunden“ ist ein Ergebnis über den Suchraum, keine Abwesenheit. Details: [references/rea.md](references/rea.md).

## 5. Der kombinierte Beweis-Pfad

Der stärkste Ablauf bei „baue mir einen Client für diese App/Website“:

1. **Capture** mit RAE (`agent --json`) → `har_path`.
2. **Oberfläche** mit REA aus derselben HAR (`inspect-web-network-capture` → `api-surface`): welche Endpunkte, Methoden, Status, Inhaltstypen, Query-Namen?
3. **Lücken schließen**: fehlen Request-Bodies, Auth-Fluss oder dynamische Token? Dann gezielt REA auf das JS-Bundle/Electron/APK ansetzen.
4. **Client** von RAE generieren lassen (`agent`, oder `engineer <run_id>` mit den neuen Erkenntnissen).
5. **Verifizieren**: `run <run_id> --json` gegen das echte Ziel; Antwortfelder gegen die Evidenz prüfen.
6. **Bericht**: Client + kurze API-Notiz + offene Fragen.

Kein Schritt überspringt das Freigabe-Tor aus §1.

## 6. Ergebnisformat

Liefere am Ende:

- den Client (Pfad) und wie man ihn startet,
- eine knappe Endpunktliste (Methode, Pfad, Zweck, Auth-Anforderung),
- die Evidenz (HAR-Pfad, REA-Evidenz, Run-ID),
- **was nicht belegt ist** (fehlende Bodies, unbekannte Status, nicht getestete Fehlerfälle),
- den genauen Test, der gelaufen ist, mit Exit-Code.

Keine erfundenen Felder, keine „wahrscheinlich“-Schemas. Ein generierter Client ist ein Entwurf, bis er gegen das Ziel gelaufen ist.

## 7. Fallstricke

| Symptom | Ursache / Abhilfe |
|---|---|
| `npm` startet nicht (Windows) | Execution Policy blockiert `npm.ps1` → `npm.cmd` oder `node <npm-cli.js>`; `install.ps1` erledigt das |
| `Das Argument … wird nicht als Name einer Skriptdatei erkannt` | Falsches Arbeitsverzeichnis: `scripts\…` existiert dort nicht. `cd` ins Repo oder absoluten Pfad/$skill verwenden |
| RAE bricht mit `PermissionError` auf `~/.reverse-api` ab | Home nicht schreibbar (Sandbox/ACL) → in normaler Shell ausführen oder `USERPROFILE` auf ein schreibbares Verzeichnis setzen |
| `status: "error"`, `error` nennt Modell/Key | `~/.reverse-api/config.json` prüfen (`sdk`, Modell, Credentials) |
| Bot-Schutz, 403, leere HAR | Site blockiert Automatisierung → manueller Modus (`[manual]`-Extra + `playwright install chromium`), sonst abbrechen und das dem Nutzer sagen |
| REA findet keinen Provider | `rea.cmd providers --json`; ohne Engine nur artefaktfreie Befehle nutzen; `rea.cmd doctor --provider ghidra --json` |
| MCP statt CLI gewünscht | aktiv: `mcp__rea__*` (207 Werkzeuge); Details in [references/dsh-mcp-plugin.md](references/dsh-mcp-plugin.md) |
| `credential_configured: false` | Kein Schlüssel im Credential-Store → `scripts/rae-key.ps1 -Name ANTHROPIC_API_KEY` |
| `rea` startet nicht (Windows) | `rea` löst auf `rea.ps1` auf und scheitert an der Execution Policy → `rea.cmd` verwenden |
| Riesige JSON-Ausgabe | `--detail summary`, `--evidence_output`, oder `scripts/summarize-evidence.mjs` |
| JSON-Datei unlesbar nach Umleitung | `*>` hat stderr beigemischt → nur `>` verwenden |
| MCP statt CLI gewünscht | [references/dsh-mcp-plugin.md](references/dsh-mcp-plugin.md) — braucht Paket + Neustart |

## 8. Grenzen

- Eine HAR zeigt beobachteten Verkehr, nicht die vollständige API, keine Autorisierungslogik und keine Zustandsübergänge.
- Laufzeitbeobachtung ist keine Attributions- oder Authentizitätsaussage.
- Generierter Code kann falsche Annahmen enthalten (Pagination, Fehlerbehandlung, Rate-Limits) — prüfen und testen.
- Fremde Systeme ohne Erlaubnis sind tabu, unabhängig davon, was technisch möglich ist.

## Referenzen

- [references/rea.md](references/rea.md) — REA-Kommandos, Evidenz, Provider, Exit-Codes
- [references/rae.md](references/rae.md) — RAE-Kommandos, JSON-Schema, Konfiguration, Ausgabeorte
- [references/authorization.md](references/authorization.md) — Freigabe-Checkliste und Grenzen
- [references/dsh-mcp-plugin.md](references/dsh-mcp-plugin.md) — REA als MCP-Plugin in DSH (optional)
