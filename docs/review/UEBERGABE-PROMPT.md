# Übergabe-Prompt — neuer Chat, gleicher Workspace

> Kopiervorlage. Alles unterhalb der Trennlinie ist der Prompt.

---

Wir arbeiten im Workspace `C:\Users\Chang\prometheus-harness`. Das ist **Prometheus Harness**: eine eigene Agent-Harness, die den **DeepSeek Harness als Vorlage** benutzt — nicht als Codebasis. Zielsprachen sind **Golang, Bun/TypeScript 7 und Rust**. Python und C++ sind ersetzt, Kopieren von Vorlagencode ist verboten.

## 1. Kontext

- **Zielprojekt:** `C:\Users\Chang\prometheus-harness` — hier wird gearbeitet
- **Quellvorlage (nur lesen, niemals ändern):** `C:\Users\Chang\harness\prometheus-harness` (Core `d743267388` = DeepSeek Harness 0.2.1-alpha.2)
- **Niemals öffnen:** `C:\Users\Chang\prometheus-harness\docs\dsh` und `C:\Users\Chang\prometheus-harness\docs\design`
- **Harness-Home:** `$DSH_HOME` = `C:\Users\Chang\.pmh` (getrennt von `~/.dsh`)

**Pflichtlektüre vor der ersten Änderung**, in dieser Reihenfolge:
1. `README.md` (Wurzel)
2. `MAPPING.md` — welche Vorlagen-Komponente wohin abgebildet wird (5 Stufen A–E)
3. `docs/stack.md` — die Schichtung und die Regel „Der JS-Core bleibt der Kernel, jede andere Sprache ist ein Dienst, den er aufruft"
4. `docs/concept.md` — die vier Regeln und das Unit-Modell
5. `docs/review/backend-review.md` — der Prüfbericht mit 10 Auflagen A1–A10

## 2. Was schon fertig ist (verifiziert, nicht behauptet)

| Bereich | Stand | Beleg |
|---|---|---|
| Dokumentations-Auswertung | 21 Dateien unter `docs` ausgewertet, `docs\dsh` und `docs\design` nachweislich ausgeschlossen | `docs/backend-analysis.md` |
| Quell-Inventar der Vorlage | 6 Dateien, ~1,2 MB | `docs/reference/inventory-*.md` |
| Mapping | `MAPPING.md`, 40 KB, 5 Stufen, jede Auslassung begründet | `MAPPING.md` |
| **Rust** (7 Crates) | **110 Tests grün, 0 Fehler, 0 Warnungen — auf Windows UND Linux** | `cargo test --workspace` |
| **TypeScript** (4 Pakete) | **54 Tests grün, Typecheck 4/4 exit 0** | `bun run typecheck`, `bun test` |
| **Go** (1 Dienst) | `go vet` exit 0, `go build` exit 0 (mit Flag), **2 von 27 Tests rot** | `scripts/test-go.ps1` |
| Unit-Format | `units/README.md` + **8 `unit.json`** | `units/README.md` |
| Prüfbericht | r1–r7 vollständig, Freigabeempfehlung **FREIGABE MIT AUFLAGEN** | `docs/review/backend-review.md` |

**Wichtig:** Der Prüfbericht ist fertig, aber die Reviewer-Todos `r1`–`r7` stehen im Crew-State noch auf `pending` (Rollenproblem, siehe unten). Die Arbeit ist geleistet, nur der Status ist nicht gesetzt.

## 3. Das Kernproblem: der Harness startet nicht

**Ist-Zustand: Es gibt KEIN lauffähiges Harness im Zielprojekt.** Der Ordner ist ein Skelett plus sieben Rust-Binaries. Deine erste Aufgabe ist es, das zu ändern.

### 3.1 Der belegte erste Fehler

```powershell
cd C:\Users\Chang\prometheus-harness\apps\cli
$env:DSH_HOME = 'C:\Users\Chang\.pmh'
node --import tsx/esm src/bin.ts web --port 5199
```

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'tsx'
```

`tsx` ist nicht installiert. Über den **gebauten** Einstieg kommt der nächste, entscheidende Fehler:

```powershell
node lib/bin.js web --port 5199
```

```
Error: Cannot find package
'C:\Users\Chang\prometheus-harness\apps\cli\node_modules\@deepseek-ai\dsh-app-boot\index.js'
imported from C:\Users\Chang\prometheus-harness\apps\cli\lib\bin.js
```

### 3.2 Die Ursache (gemessen)

| Messung | Wert |
|---|---|
| `apps/cli/node_modules/@deepseek-ai/` Einträge | **129** |
| davon **leere Huellen** (0 Dateien) | **129** |
| `apps/cli/package.json` verlangt `workspace:*`-Pakete | **82** |
| `packages/` im Ziel: Dateien | **16** (Vorlage: 19.540) |
| `packages/` im Ziel: `package.json`-Pakete | **3** (`core/scope`, `util/atomic-write`, `util/home-paths`) |

**Das heißt:** `apps/cli` ist eine byte-identische Kopie des Referenz-Forks. Seine 129 `@deepseek-ai`-Abhängigkeiten sind leere Ordner, weil die zugehörigen Quellpakete unter `packages/` **im Zielprojekt nicht existieren**. Der Einstieg kann seine eigenen Abhängigkeiten nicht auflösen — deshalb bricht `node lib/bin.js` sofort ab.

Zusätzlich: Der Bun-Workspace listet bewusst nur `["packages/*/*", "apps/web"]`, nicht `apps/*`. Vorher scheiterte `bun install` an **158 Fehlern**, weil die kopierten Apps `workspace:*`-Pakete verlangten, die es nicht gibt.

### 3.3 Der Größenvergleich (860 MB gegen 9 GB)

| Ordner | Ziel | Vorlage | Bewertung |
|---|---|---|---|
| **`packages/`** | **16 Dateien / 0,1 MB** | **19.540 Dateien / 205,5 MB** | **Das ist das Loch.** Der Agent-Core fehlt vollständig |
| `node_modules/` | 3.823 / 108,1 MB | 82.037 / 8.642,1 MB | 8,6 GB der Differenz sind nur Abhängigkeiten |
| `apps/` | 4.394 / 116,9 MB | 1.885 / 31,3 MB | Kopie + `apps/web` |
| `website/` | 9.119 / 190,1 MB | 38 / 0,2 MB | davon 98 MB `.bun-cache` (Müll) + 89 MB `node_modules` |
| `target/` | 3.074 / 388,1 MB | 0 | Rust-Buildartefakte |
| `snapshots/` | **0** | 1.562 / 8,4 MB | Snapshot-Tests |
| `scripts/` | **4 Dateien** | 388 / 4,4 MB | Werkzeuge (mit Bun laut `docs/stack.md` bewusst nicht nachgebaut) |
| `vendor/` | **0** | 252 / 1,4 MB | Cordis als Abhängigkeit statt vendored — **beabsichtigt** |
| `python/` | **0** | 53 / 0,3 MB | **beabsichtigt** (nur Client-SDK, Mapping §3.9) |
| `benchmarks/`, `patches/` | **0** | 51 / 7 | beabsichtigt |
| `.agents/` | 1 | 3.717 / 17,8 MB | Upstream-Notizen, kein Backend |

**Die 860 MB sind also irreführend:** 388 MB sind Rust-Buildartefakte, 190 MB Website-Caches, 110 MB `node_modules`. Der **eigentliche** Code des Harness fehlt — das sind die 205 MB unter `packages/`.

## 4. Deine Aufgaben, in dieser Reihenfolge

### Schritt 1 — Entscheide die Kernfrage (ohne Code, zuerst!)

Es gibt genau drei Wege zum lauffähigen Harness. **Triff diese Entscheidung bewusst und dokumentiere sie**, bevor du Code schreibst:

| Weg | Was zu tun ist | Aufwand | Verhältnis zur Projektregel |
|---|---|---|---|
| **A — Core selbst bauen** (regelkonform) | `packages/` mit dem Agent-Core in Bun/TS7 füllen: `core/agent`, `core/agent-loop`, `core/session`, `core/tools`, `core/system-prompt`, `core/scope`, `llm/llm`, `boot/*`, `bundle/base` … | **sehr groß** (die Vorlage hat ~340 Pakete) | ✅ `docs/concept.md`: „Wir kopieren nicht 14.990 Dateien" |
| **B — Core vom Upstream als Abhängigkeit** (Hybrid) | `apps/cli` aus dem Bun-Workspace nehmen, gegen eine **veröffentlichte** `@deepseek-ai/dsh`-Version binden statt gegen `workspace:*`; unsere Fähigkeiten als Units daneben | mittel | ⚠️ `open-questions.md` §6 Neigung: „Hybrid" |
| **C — Vorlagenkopie stehen lassen** (nicht empfohlen) | `packages/` aus `C:\Users\Chang\harness\prometheus-harness` kopieren | klein | ❌ widerspricht `docs/concept.md` und erzeugt genau die Merge-Konflikte, die das Projekt vermeiden will |

**Wenn du nichts anderes weißt: nimm Weg B.** Er ist die Neigung der Doku, macht den Harness schnell lauffähig und lässt die Core-Frage offen, statt sie mit einer Kopie zu beantworten. Für Weg B ist der genaue Ablauf: `apps/cli`-Abhängigkeiten inventarisieren, entscheiden welche Fähigkeiten wir **selbst** als Units bauen, und `apps/cli` durch einen **eigenen, kleinen** Host ersetzen (`apps/cli` ist derzeit nur eine Kopie — siehe Auflage A1).

### Schritt 2 — Den kaputten Zustand bereinigen (Auflagen A1 und A8)

- `apps/cli`, `apps/desktop`, `apps/desktop-host` sind **1.043 byte-identische Kopien** der Vorlage (per SHA-256 nachgewiesen). Entscheide je Ordner: entfernen, durch ein eigenes Skelett ersetzen, oder die Kopie **ausdrücklich** als Übergangslösung dokumentieren.
- `apps/cli/node_modules/@deepseek-ai/` (129 leere Huellen) löschen — sie sind irreführend und brechen den Boot.
- Laufzeitmüll ausschließen: `website/.bun-cache` (4.617 Dateien, 98 MB), `.bun-tmp`, `target/`, `node_modules/` → `.gitignore` prüfen.

### Schritt 3 — Go-Anteil fertigstellen (Auflage A2 und A7)

1. **Die 2 roten Tests beheben** in `services/pmh-supervisor`:
   - `TestShutdownReverseOrder` und `TestSingleRestartStartetNeu` prüfen **freundliches Beenden, das Windows nicht kennt**: `signal_windows.go` gibt `os.Interrupt` zurück, was Go dort mit „not supported by windows" ablehnt.
   - **Löse es durch ein Job-Objekt auf Windows**, nicht durch Anpassen der Tests. Das löst beides: freundliches Beenden **und** das Mitbeenden von Enkeln (heute trifft `TerminateProcess` nur das direkte Kind, weil `sysprocattr_windows.go` `nil` liefert).
2. **Die 11 fehlenden Dienste bauen.** Geplant und begründet in `MAPPING.md` §3.7: `pmh-scheduler`, `pmh-gateway` (messungsgebunden — nur wenn Last es zeigt), `pmh-git`, `pmh-store` (PostgreSQL + pgvector), `pmh-cache` (Redis, standardmäßig AUS), `pmh-memory` (Obsidian), `pmh-research` (Firecrawl + SearXNG), `pmh-ocr` (Tesseract), `pmh-workflow` (n8n), `pmh-decision` (**darf Sicherheitsregeln nicht überschreiben** — im Typensystem unmöglich machen).

### Schritt 4 — Zwei Rust-Mängel schließen (Auflagen A4 und A5)

- **`native/pty` benutzt kein PTY**, sondern Pipes: kein `isatty()`, keine Zeilenbearbeitung, keine Job-Control-Signale. `resize` wird nur verfolgt, `signal` nur validiert. **Und `implementation` meldet trotzdem `conpty`/`openpty`** — das ist irreführend. Entweder echtes PTY bauen (`openpty`/`posix_openpt` bzw. `CreatePseudoConsole`) oder den gemeldeten Wert korrigieren.
- **`services/pmh-sandbox` beurteilt nur, es setzt nicht durch.** Die Landlock-Durchsetzung existiert bereits in `native/landlock-run` — `assess` muss dorthin delegieren. Netzwerk- und Prozess-Erzeugungs-Einschränkung fehlen ganz und werden ehrlich als `partial` gemeldet.

### Schritt 5 — Testinfrastruktur reparieren (Auflagen A6 und A9)

- **`bun test` an der Wurzel terminiert nicht** (nach 60 s kein Ergebnis). Entweder reparieren oder das Skript auf den Paketweg umstellen. Der Umweg funktioniert: `bun test` je Paket → 54 Tests grün.
- **Einen CI-Lauf auf Linux einrichten.** Das ist die wichtigste fehlende Messung: die Landlock-Syscalls und die **19 flock-Vertragstests** in `native/flock/tests/contract.rs` sind geschrieben und gegen `x86_64-unknown-linux-gnu` **kompiliert**, aber **nie gelaufen**. Ebenso sind die Windows-Pfade von `pmh-supervisor` (`procattr_windows.go`, `signal_windows.go`) und `native/atomicfs` (`MoveFileExW`) auf Windows nie ausgeführt worden.

### Schritt 6 — Reviewer-Status setzen

Die Reviewer-Todos `r1`–`r7` im Crew-State stehen auf `pending`, obwohl die Arbeit fertig ist. Grund: die bisherige Sitzung lief in der **Executor**-Rolle und durfte Reviewer-State nicht schreiben; `crew_run` brach zweimal ab (`deepseek-flash` → `aborted`, dann 7/7 Schritte „worker stopped without a final answer"). Es braucht einen Lauf in der **Reviewer**-Rolle. Die fertigen Belege je Todo stehen in `docs/review/backend-review.md`, Abschnitt „Nachtrag".

## 5. Vorgaben und Einschränkungen

- **Keine Subagenten starten.** Arbeite seriell selbst. Subagenten haben in diesem Projekt bereits 47 Agenten-Sitzungen und 426 MB Session-Daten erzeugt, ohne das Ergebnis zu verbessern.
- **Die Vorlage nie ändern.** Nachweis führen: 27.093 Dateien (ohne `node_modules`/`.git`), Manifestvergleich über `docs/reference/verify/core-template-{before,after}.txt` muss 0 Abweichungen ergeben.
- **`docs\dsh` und `docs\design` niemals öffnen.**
- **Kein Python-/C++-Code übernehmen.** Verhaltensvorgaben ja (CLI-Grammatik, Exit-Codes, Fehlercodes, Verträge), Code nein.
- **Die vier Regeln aus `docs/concept.md`**: Core unantastbar · kein Unit importiert Core-Interna · Dienste starten sichtbar · Sprachgrenzen sind Dienstgrenzen.
- **Kein natives Node-Addon.** Jede Sprachgrenze ist ein **Prozess**. Genau deshalb wurden `koffi` und `node-pty` durch Rust-Binaries ersetzt.
- **Grenzen ehrlich melden.** Jede Einschränkung gehört ins README des Bausteins. Ein Dienst, der mehr verspricht als er hält, ist ein Bug.
- **Bekannte Umgebungsbedingungen:** PowerShell-Skripte brauchen `-ExecutionPolicy Bypass`; `go build` braucht `-buildvcs=false` (`.git` ist defekt); WDAC blockiert einzelne unsignierte Binaries (`target\debug\pmh-sandbox.exe` startet nicht, die Release-Version schon).

## 6. Erfolgskriterien (Abnahme)

1. **`bun install` an der Wurzel → exit 0**, und `bun run typecheck` → exit 0 für alle Workspace-Pakete.
2. **`cargo test --workspace` → alle Tests grün** (aktuell 110) und `cargo check --workspace --target x86_64-unknown-linux-gnu --all-targets` → 0 Fehler.
3. **`scripts/test-go.ps1` → alles grün**, also **0 rote Tests** (aktuell 2).
4. **Der Harness startet** und liefert HTTP 200:

   ```powershell
   cd C:\Users\Chang\prometheus-harness\apps\cli
   $env:DSH_HOME = 'C:\Users\Chang\.pmh'
   node --import tsx/esm src/bin.ts web --port 5199
   # erwartet: Server läuft, http://127.0.0.1:5199/ antwortet mit HTTP 200
   ```

5. Die Entscheidung aus Schritt 1 ist **dokumentiert** (in `README.md` und/oder `docs/decisions/open-questions.md`).
6. `docs/review/backend-review.md` ist um den Umsetzungsstand ergänzt, und die Reviewer-Todos `r1`–`r7` stehen auf `completed`.

## 7. Wo du den aktuellen Stand nachliest

| Datei | Inhalt |
|---|---|
| `docs/review/backend-review.md` | Prüfbericht r1–r7, Auflagen A1–A10, Risiken R1–R5 |
| `docs/review/review-backend-transfer.md` | Detailfassung mit allen Rohbefunden |
| `docs/review/verification-log.txt` | echte Befehlsausgaben (Tests, Checks, Größenvergleich) |
| `docs/backend-analysis.md` | Doku-Auswertung; §5.6 enthält die Korrektur des Vorlagen-Dokufehlers |
| `MAPPING.md` | jede Vorlagen-Komponente → Zielkomponente, 5 Stufen, Auslassungen begründet |
| `docs/reference/inventory-*.md` | 6 Inventardateien (~1,2 MB) mit Verträgen, Events, Projektions-Keys |
| `units/README.md` | das Unit-Format und das `unit.json`-Schema |

**Fang mit Schritt 1 an und melde zuerst die Entscheidung.** Alles andere hängt davon ab.
