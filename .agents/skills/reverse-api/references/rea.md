# REA — Kommandos, Evidenz, Provider

REA (`rea-agents`) analysiert lokale Artefakte: nativen Code, .NET, JavaScript/Electron, Android, Unity, Firmware, Modelle, Datenbanken und aufgezeichneten Netzwerkverkehr. Alles läuft lokal; Ergebnisse enthalten Evidenz und Grenzen.

- Node.js 22.x (≥ 22.19), 24.x (≥ 24.11) oder 26+
- Installation: `npm install --global rea-agents`, sonst `npx -y rea-agents@<version> <kommando>`
- Ohne Installation: `npx -y rea-agents@latest --help`

Die installierte Version ist maßgeblich. Vor einer neuen Kommandofamilie `rea <kommando> --help` lesen; das ist die verlässlichste Auskunft über exakte Flags. Unter Windows PowerShell lautet der Aufruf `rea.cmd <kommando>`, weil `rea` auf `rea.ps1` zeigt und an der Execution Policy scheitert.

## Grundmuster

```bash
rea <kommando> <pfad-oder-url> [--flags] --json
```

- `--json` = maschinenlesbare Ausgabe. Standard ist TOON (Terminal-Format).
- `--detail summary` = kompakte Übersicht, vollständige Evidenz wird separat abgelegt.
- `--evidence_output DATEI` = vollständige Evidenz in eine Datei schreiben, Ausgabe bleibt kompakt.
- `--provider ghidra|ida|hopper|kuna` = Analyse-Engine wählen.
- `--snapshot DATEI` = Analyseergebnis zwischenspeichern und wiederverwenden.

Exit-Codes: `0` abgeschlossen (auch mit Warnungen/offenen Fragen), `1` nicht abgeschlossen, `128+N` Signal. Ein `0` beweist keine Vollständigkeit — Limitations und Unknowns im Ergebnis lesen.

## Ziele und Einstiege

| Ziel | Kommando |
|---|---|
| JS/Electron-Verzeichnis oder ASAR | `analyze-javascript-application <pfad>` |
| Website zur Laufzeit beobachten | `observe-web-execution <url>` |
| Browser-Szenario mit Aktionen | `capture-browser-scenario <url> ...` |
| JS-Bundle einer Website | `analyze-web-bundle <pfad-oder-url>` |
| HAR/SAZ/mitmproxy/qlog-Aufzeichnung | `inspect-web-network-capture <datei> har\|saz\|qlog` |
| Evidenz projizieren (summary, api-surface, environment-manifest) | `inspect-analysis-view <request.json>` |
| Archiv/Paket (ZIP/APK/IPA/MSIX/DMG) | `inspect-artifact <pfad>` |
| Android-APK (JADX nötig) | `inspect-android-package <pfad>` |
| .NET-Assembly | `inspect-managed-artifact <pfad>`, dann `inspect-managed-members` |
| Go-Binärdatei (eingebettete Modul-Metadaten) | `inspect-go-binary <pfad>` |
| Rust-Binärdatei (cargo-auditable) | `inspect-rust-binary <pfad>` |
| Unity IL2CPP `global-metadata.dat` | `inspect-il2cpp-metadata <pfad>` |
| SQLite-Snapshot | `inspect-sqlite-database <pfad> [--table NAME --row-limit 20]` |
| Modellgewichte (GGUF/safetensors) | `inspect-model-artifact <pfad>` |
| WASM | `inspect-wasm-artifact <pfad>` |
| Nativer Code | `analyze`, `search`, `function`, `decompile`, `xrefs`, `trace`, `instructions` |
| Provider-Status | `providers`, `capabilities`, `doctor` |

## JavaScript/Electron

```bash
rea analyze-javascript-application /abs/pfad/app --json > app-evidence.json
```

Die vollständige Evidenz kann hunderte MB groß sein. Nie ungefiltert lesen:

```powershell
# Zusammenfassung
pwsh -ExecutionPolicy Bypass -File scripts/inspect-view.ps1 -Evidence app-evidence.json -View summary

# Seite aus einer Sammlung
pwsh -ExecutionPolicy Bypass -File scripts/inspect-view.ps1 -Evidence app-evidence.json -View page -Collection modules -Limit 32
```

`inspect-analysis-view` nimmt in REA 6.7.0 nur `inline` oder `retained-evidence`; `evidence-file` wird abgelehnt. `inspect-view.ps1` bettet die Datei byte-genau ein (kein JSON-Roundtrip, sonst passt die `evidence_id` nicht).

`api-surface` für Endpunkte gibt es auch hier, sofern die Evidenz Request-Zeilen enthält. Für Feature-Traces und Versionsvergleiche die JavaScript-Workflows von REA lesen.

## Netzwerkaufzeichnungen

```bash
rea inspect-web-network-capture /abs/aufnahme.har har --json > capture.json
rea inspect-web-network-capture /abs/aufnahme.har har --record 2 --record 0 --json
```

- Harter Deckel: 32 MiB Eingabe, 96 MiB Decoder-Antwort, 64 Verschachtelungsebenen.
- `--record` wählt einzelne Records (nullbasiert, Reihenfolge bleibt erhalten).
- Protobuf/gRPC-Bodies werden nur bei expliziter Record-Auswahl dekodiert; Schema optional via `--protobuf-schema` und `--protobuf-message`.
- Sensible Werte lassen sich mit `--sensitive-value` ausschließen; sie erscheinen dann als `null`, nie als Ersatztext.
- Header-/Cookie-Auth-Werte werden strukturell ausgeschlossen. Trotzdem: Ausgabe prüfen, bevor sie in einen Bericht wandert.

API-Oberfläche aus der Aufzeichnung:

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/inspect-view.ps1 -Evidence capture.json -View api-surface
```

Die View gruppiert nach Methode, Origin und Pfad-Template, templatisiert numerische/UUID/Hex/Datum-Segmente und nennt beobachtete Query-Namen (optional). Sie sagt nichts über Handler, Schema oder Kausalität und ist bei Seitenwechseln unvollständig.

## Native Analyse

Voraussetzung: eine Engine (Ghidra, IDA, Hopper oder Kuna) und `rea doctor --provider <id> --json`.

```bash
rea analyze /abs/programm --provider ghidra --json
rea search /abs/programm "https://" --provider ghidra --json
rea function /abs/programm main --provider ghidra --json
rea decompile /abs/programm 0x1000 --provider ghidra --json
rea xrefs /abs/programm 0x1000 --provider ghidra --json
rea trace /abs/programm "suchbegriff" --provider ghidra --json
```

Pseudocode ist keine Originalquelle. Adressen und Provider-IDs in Befunde aufnehmen.

## Evidenz-Regeln

1. Jeder Befund nennt Fundstelle: Datei, Modul, Adresse, Record-Ordinal oder Pfad.
2. `limitations`, `unknowns`, `coverage` lesen und im Ergebnis wiedergeben.
3. Abwesenheit nur behaupten, wenn der Suchraum vollständig war.
4. Große Ausgaben speichern, nicht in den Kontext ziehen (`scripts/summarize-evidence.mjs` hilft).
5. Aufzeichnungen sind historisch: sie belegen beobachteten Verkehr, keine Live-Attribution und keine vollständige API.

## Provider

```bash
rea providers --json        # verfügbare Engines + unterstützte Operationen
rea capabilities --json     # gesamte Fähigkeitsliste
rea doctor --json           # Gesundheitsbericht (read-only)
rea doctor --provider ghidra --json
```

Ohne Engine funktionieren die artefaktfreien Befehle (JS, .NET, Go, Rust, IL2CPP, SQLite, HAR, Archive). Für native Ziele keine Engine erzwingen — entweder Engine bereitstellen oder ehrlich sagen, dass die Analyse nicht möglich ist.
