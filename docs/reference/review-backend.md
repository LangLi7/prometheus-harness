# Review — Backend-Übertragung (`r1`–`r7`)

> **Rolle:** reviewer (crew-1) · **Datum:** 12.10.2026
> **Gegenstand:** Übertragung des Backends der Vorlage
> `C:\Users\Chang\harness\prometheus-harness` in das Zielprojekt
> `C:\Users\Chang\prometheus-harness` in **Golang · Bun/TS7 · Rust**.
> **Methode:** Text-, Hash-, Build- und Laufzeitprüfung. Keine Bildauswertung.
> **Vollfassung:** die ausführliche Fassung mit allen Tabellen und Rohbefunden steht in
> [`../review/review-backend-transfer.md`](../review/review-backend-transfer.md). Diese
> Datei ist der Einstieg und das Ergebnis.

---

## 1. Ergebnis

> ## **FREIGABE MIT AUFLAGEN**
>
> Die **Architektur** ist freigegeben. Die **Rust-Sprachgrenze** ist vollständig,
> verifiziert und kopiefrei. Der **Umfang** ist es nicht: Go und TypeScript sind
> unvollständig, und die kopierte `apps/`-Struktur der Vorlage blockiert den Bun-Workspace.

| Bereich | Gemessen | Urteil |
|---|---|---|
| Doku-Auswertung | 21 Dateien; `docs\dsh` + `docs\design` ausgeschlossen | **bestanden** |
| Quell-Inventar | 6 Dateien, ~1,2 MB (inkl. `inventory-core-agent.md` 181 KB mit Mapping-Tabelle) | **bestanden** |
| Vorlagenintegrität | 27.093 Dateien; Manifestvergleich **0 Abweichungen** | **bestanden** |
| Mapping | `MAPPING.md`, 40 KB, 5 Stufen, jede Auslassung begründet | **bestanden** |
| **Rust** (7 Crates) | **110 Tests grün**, 0 Warnungen, **0 Fehler auf Windows *und* Linux** | **bestanden** |
| **TypeScript** (4 Pakete) | **54 Tests grün**, **Typecheck exit 0** in allen 4 | bestanden, Umfang klein |
| **Go** (1 Dienst von 12) | `vet` **0 Meldungen**; `build` exit 0 (mit `-buildvcs=false`); **2 von 27 Tests rot** (vorher 5) | **nicht bestanden** |
| Unit-Format | 8 `unit.json` + `units/README.md` (Format erstmals festgehalten) | **bestanden** |
| Dokumentation | README je Rust-Crate (7), je TS-Paket (3), Supervisor, `services/`, `native/`, `units/` | **bestanden** |
| Kopiefreiheit | 0 Zeilen kopierter Python-/C++-Code | **bestanden** |
| Vorlagenkopie in `apps/` | **1.043 byte-identische Dateien** | **nicht bestanden** |

---

## 2. Die sieben Prüfungen

### r1 — Doku-Vollständigkeit und Ausschlussnachweis · **bestanden**

- **21** Dateien unter `docs\` ausgewertet (die übrigen 1.394 liegen in den beiden
  ausgeschlossenen Ordnern und wurden nicht geöffnet).
- Zu **jedem** Befund in `docs/backend-analysis.md` steht die Quelldatei. Kein Befund
  stammt aus `docs\dsh` oder `docs\design`; Provenienzprüfung über Datei-Änderungszeiten.
- **Vorlage unberührt:** 27.093 Dateien (deckt sich exakt mit dem Manifest),
  `Compare-Object` über `core-template-{before,after}.txt` → **0 Abweichungen**.
- **Offengelegte Abweichung:** der allererste Inventarschritt nutzte `glob "docs/**/*"`,
  das auch ausgeschlossene **Pfadnamen** listet. Es wurde **keine** dieser Dateien geöffnet
  und kein Inhalt daraus verwendet. Danach wurde der Ausschluss nur noch über explizite
  Filter erzwungen.
- **Prüfung, die einen echten Dokufehlers fand:** `reference-dsh.md` bezeichnet
  `native/system/.../main.c` als „Dateisperre (flock)". Tatsächlich ist `main.c` der
  **Landlock-Sandbox-Launcher** (298 Z.) und `flock.c` die Sperre (164 Z.). Korrigiert in
  `docs/backend-analysis.md` §5.6 — **ohne diese Korrektur wäre die Sandbox-Aufgabe
  vollständig übersehen worden.**

### r2 — Struktur- und Architekturvergleich · **Abweichungen benannt**

Richtig gemacht: die Prozessgrenze ist echt gezogen (7 Binaries, **kein** natives Addon —
damit ist das Risiko mit der höchsten Priorität aus `docs/risks.md` §1 **strukturell
beseitigt**), die Vorlagenverträge sind wörtlich erhalten, `apps/web` ist eine **eigene
Neuimplementierung** (React statt Svelte, 17 Dateien).

**Befund 1 (schwer): die `apps/`-Kopie.**

| Kennzahl | Wert |
|---|---|
| Dateien unter `apps/` (ohne `node_modules`) | 1.060 |
| **byte-identisch** mit der Vorlage (SHA-256) | **1.043** |
| abweichend / nur im Ziel | 5 / 12 — **alle** in `apps/web` |

`apps/cli`, `apps/desktop`, `apps/desktop-host` sind vollständige Kopien des Referenz-Forks.
Das widerspricht `docs/concept.md` wörtlich: *„Nicht als Codebasis — Wir kopieren nicht
14.990 Dateien und schneiden darin."* Alle Dateien tragen den Zeitstempel des
Vorlagen-Checkouts (12.10. 15:11), also **vor** dieser Arbeit — es ist ein vorbestehender
Zustand, der hier nur festgestellt wird.

**Befund 2 (schwer, neu): die Kopie blockiert den Bun-Workspace.**

```
$ bun install
error: @deepseek-ai/dsh-workflow-ptc@workspace:* failed to resolve
error: @deepseek-ai/dsh-home-paths@workspace:* failed to resolve
… (158 solcher Fehler)
exit=1
```

`apps/cli` deklariert **129**, `apps/desktop` **13**, `apps/desktop-host` **16**
`workspace:*`-Abhängigkeiten auf `@deepseek-ai/dsh-*`-Pakete, die es im Zielprojekt nicht
gibt. Dadurch ließ sich an der Wurzel **kein einziges Paket** installieren — und damit war
auch `tsgo` nicht auflösbar, sodass **jeder** `typecheck`-Aufruf mit
`bun: command not found: tsgo` scheiterte.

**Behoben (minimal-invasiv, nichts gelöscht):** die Workspace-Liste in `package.json` von
`["packages/*/*", "apps/*"]` auf `["packages/*/*", "apps/web"]` geändert. Ergebnis:
`bun install` → **exit 0**, 41 Pakete, `apps/web` unverändert (29 `node_modules`-Einträge
vorher wie nachher).

### r3 — Mapping-Vollständigkeit · **bestanden für die Kernfrage**

Die Aufgabe lautete, „Python- und C++-Komponenten" abzubilden. Das Inventar zeigt:
**Python existiert nur als Client-SDK** (47 Dateien), **C++ existiert nicht**, und es gibt
**genau zwei C-Programme**. Damit ist die Kernfrage vollständig beantwortet — und zwar
**belegt statt angenommen**:

| Komponente | Ziel | Vorhanden | Urteil |
|---|---|---|---|
| `main.c` (Landlock-Launcher) | `native/landlock-run` | 750 Z., 18 Tests | ✓ |
| `flock.c` + `flock.ts` | `native/flock` | 942 Z., 17 Tests + 19 Vertragstests | ✓ |
| `sandbox-windows-acl` | `services/pmh-sandbox` | 553 Z., 14 Tests | ✓ (beurteilt, setzt nicht durch) |
| `koffi`-Bedarf | `native/atomicfs` | 759 Z., 12 Tests | ✓ |
| `node-pty`-Bedarf | `native/pty` | 640 Z., 16 Tests | ✓ (Pipes statt PTY) |
| `python/sdk` (5 Module) | Go-API + TS-Protokoll | SDK nicht angelegt | ✓ korrekt |
| ~300 TS-Core-Pakete | `packages/*` | 3 von ~50 Gruppen | ✗ offen |
| 11 Go-Dienste | `services/*` | 1 von 11 | ✗ offen |

Der richtige Umgang mit dem Python-SDK: es wird als **Spezifikation** gelesen, nicht
portiert — begründet im Mapping §3.9, weil ein Python-Client im Zielprojekt keinen Aufrufer
hätte.

### r4 — Verhalten und Schnittstellen · **bestanden für Rust**

Jede der folgenden Prüfungen ist **ausgeführt**, nicht gelesen:

| Prüfung | Erwartet | Gemessen | |
|---|---|---|---|
| `landlock-run --probe` ohne Landlock | Exit 125 + Fatalzeile | **125** + `landlock-run: landlock is not enforced by this kernel (ABI unsupported or disabled)` | ✓ |
| **Fail-closed** | Kind wird **nicht** gestartet | **125, keine Ausgabe** — `echo SHOULD-NOT-PRINT` lief nicht | ✓ |
| Nutzungsfehler | Exit 125, wörtliche Meldung | `landlock-run: usage error: unknown argument: --rwx` | ✓ |
| `flock --probe` | antwortet auf jedem Host | `{"supported":false,…}`, **exit 0** | ✓ (nach Korrektur) |
| `flock --path` auf Windows | `ERR_FLOCK_UNSUPPORTED_PLATFORM` | exit 125, exakt dieser Code | ✓ |
| `atomicfs` Identität über Ersetzen | **ändert sich** | inode `…514` → `…515` | ✓ |
| `sandbox assess --network` | nie still `full` | `partial`, `unenforced:["network"]` | ✓ |
| `sandbox assess` widersprüchlich | Exit 125 | `ERR_SANDBOX_POLICY`, „use read-write" | ✓ |
| `crypto sha256 abc` | FIPS 180-4 | `ba7816bf…15ad` | ✓ |
| `crypto hmac "Jefe"` | RFC 4231 | `5bdcc146…3843` | ✓ |
| `index tree` auf echtem Baum | JSON pro Datei | 28 Dateien, 0 übersprungen | ✓ |

**Die 18 Vertragsbedingungen aus `flock-contract.md` sind als Testsuite umgesetzt**
(`native/flock/tests/contract.rs`): 15 abgedeckt, 2 entfallen begründet (es gibt keinen
Node-API-Callback in einem Prozess), 1 in einer anderen Prüfung enthalten. Die Datei ist
`#![cfg(unix)]` und **gegen Linux kompiliert** — auf diesem Host nicht ausgeführt.

### r5 — Codequalität, Idiomatik, Kopiefreiheit · **bestanden mit Mängeln**

| Prüfung | Ergebnis |
|---|---|
| C-Muster in `*.rs` (`printf`, `malloc(`, `napi_`, `#include`) | **0 Treffer** |
| Python-Muster | **2 Treffer** — beide **Testeingabe** für den Symbol-Extraktor, kein Python-Code |
| Eigene `.py`/`.c` im Ziel | 4 Dateien, **alle byte-identisch mit der Vorlage** und vor dieser Arbeit |
| `unsafe` | 26 Vorkommen, jede mit `// SAFETY:`-Begründung |

**Idiomatik, die benannt werden sollte:**

1. Der Vertrag wird **Typ**, nicht Kommentar: `flock` nimmt `BorrowedFd<'_>`. Die Regel
   „the binding does not open, duplicate, or close it" ist damit eine
   **Compile-Zeit-Eigenschaft**.
2. **Grenzen stehen im Code und sind gepinnt.** `pmh-index` dokumentiert, dass der
   Extraktor lexikalisch ist, und ein Test **hält die Grenze fest**, damit eine spätere
   Änderung sie nicht still verschiebt.
3. **Sicherheitsinvarianten sind testbar**: `pmh-sandbox` prüft, dass eine
   erlaubnisfreundliche Entscheidung die Policy-Schicht nicht umgehen kann.
4. **Die `unsafe`-Fläche ist klein und begründet**, inklusive der Erklärung, *warum*
   `CreateFileW` direkt deklariert statt importiert wird.

**Mängel:**

| # | Mangel | Schwere |
|---|---|---|
| a | `pmh-pty` benutzt **kein PTY** (Pipes statt `openpty`/ConPTY), meldet aber `implementation:"conpty"` — die Meldung verspricht mehr, als der Code hält | **hoch** |
| b | `pmh-sandbox` **beurteilt nur**, setzt nicht durch | **hoch** |
| c | `pmh-index` `digest` ist FNV-1a, nicht kryptografisch — dokumentiert, aber der Feldname legt eine Prüfsumme nahe | mittel |
| d | Kein Absturztest für die atomicfs-Garantien 2/3 (Bytes und Umbenennen erreichen das Medium) | mittel |
| e | Keine Plattformpakete und kein Release-Skript für die Rust-Binaries | niedrig |

### r6 — Build- und Testergebnisse · **Rust ✓ · TS ✓ · Go ✗**

**Rust — grün auf beiden Zielplattformen.**

```
cargo test --workspace                                   → 110 passed, 0 failed
cargo check --workspace --all-targets                    → Windows: 0 Fehler, 0 Warnungen
cargo check --workspace --target x86_64-unknown-linux-gnu --all-targets
                                                         → Linux:   0 Fehler, 0 Warnungen
```

Die **Linux-Kompilierprüfung** ist eine eigene, wertvolle Prüfstufe: sie ist auf einem
Windows-Host der einzige Weg zu belegen, dass die `#[cfg(unix)]`- und
`#[cfg(target_os = "linux")]`-Pfade übersetzen. Sie hat **vier echte Fehler** gefunden, die
der Windows-Build nicht sieht, und zuletzt **10 Warnungen** aufgedeckt: Landlock-Bits waren
als „Audit-Record" definiert, aber nur über zusammengesetzte Masken erreichbar. Statt sie zu
löschen wurden sie **ladend** gemacht — eine Tabelle Bit→ABI plus drei Tests, die jedes Bit
gegen seine ABI prüfen.

**TypeScript — grün, aber kleiner Umfang.**

```
bun install                                              → exit 0, 41 Pakete
bun run typecheck (Wurzel, alle Workspace-Pakete)         → exit 0 (4/4 Pakete)
Paket-Tests: home-paths 15 · atomic-write 19 · scope 12 · apps/web 8
                                                         → 54 passed, 0 failed
```

Der `atomic-write`-Test läuft **gegen das echte Rust-Binary** — die Prozessgrenze ist damit
nicht nur behauptet, sondern durchlaufen.

> **Befund 3 (mittel): `bun test` an der Wurzel terminiert nicht.** Auch nach 60 s kein
> Ergebnis; der `package.json`-Skript `test: bun test` ist so **nicht benutzbar**. Der
> Umweg über die vier Pakete funktioniert (54 Tests, alle grün). Ursache nicht eingegrenzt.

**Go — nicht bestanden, aber deutlich verbessert.**

```
go vet ./...                    → exit 0   (vorher: 1 Meldung "misuse of unbuffered os.Signal channel")
go build ./...                  → exit 1: "error obtaining VCS status: exit status 128"
go build -buildvcs=false ./...  → exit 0
go test ./...                   → 2 Tests ROT (vorher 5)
```

- Der `build`-Fehler ist ein **Umgebungsartefakt**, kein Codefehler: das `.git` im
  Zielprojekt ist defekt (`git rev-parse` → „not a git repository"), und Go versucht
  VCS-Stamping. Mit `-buildvcs=false` baut es sauber. Behoben durch die Skripte
  `scripts/build-go.ps1` und `scripts/test-go.ps1`, die das Flag immer setzen.

- **Drei der fünf roten Tests sind behoben.** Die Ursache war eine **echte Race in der
  Abschaltung**, nicht in den Tests:

  | Test | Ursache | Behebung |
  |---|---|---|
  | `TestOptionalServiceDoesNotStopWatch` | die Testhilfe `blockForever` blockierte **nicht** — `<-ch` auf einem Kanal ohne Sender lässt den Go-Deadlock-Prüfer feuern, der Fake-Dienst endete mit **Exit 2** und galt als Fehler | `blockForever` konsumiert jetzt alle Signale (gepufferter Kanal, damit `go vet` nicht zu Recht meckert) |
  | `TestShutdownGraceThenKill` | dieselbe Ursache | dito |
  | `TestSignalPathIsUsed` | dieselbe Ursache | dito |

  Zusätzlich wurde die Abschaltung **sachlich korrigiert**: sie stellte jedem Dienst
  **nacheinander** das Signal zu und wartete je Dienst die volle Frist ab — bei n Diensten
  dauerte das n·f, und ein Dienst, der noch gar nicht hochgekommen war, wurde nur noch als
  Leiche signalisiert. Jetzt laufen zwei Phasen: **erst allen das Signal zustellen**
  (in umgekehrter Startreihenfolge), **dann gemeinsam** auf die Frist warten und die
  Verbliebenen hart beenden. Die Dauer ist damit `max(frist)` statt Summe.

- **Die zwei verbleibenden roten Tests prüfen Verhalten, das auf dieser Plattform nicht
  existiert:**

| Test | Beobachtung | Ursache |
|---|---|---|
| `TestShutdownReverseOrder` | `beendete Dienste = []`, `Shutdown` meldet nach 15 s `Abschaltfrist ueberschritten: [gamma beta alpha]` | **Unter Windows kann einem fremden Prozess kein Signal zugestellt werden.** `signal_windows.go` gibt `os.Interrupt` zurück, was Go dort mit „not supported by windows" ablehnt; `CTRL_BREAK_EVENT` bräuchte eine eigene Konsole plus Job-Objekt. Also schreiben die Dienste ihre Ende-Marke **nicht selbst**, und die beobachtete Reihenfolge ist nicht messbar |
| `TestSingleRestartStartetNeu` | `PID blieb gleich`; danach `TempDir RemoveAll cleanup: … being used by another process` | derselbe Grund: `Restart` kann dem laufenden Dienst kein Signal zustellen und wartet die Frist ab, während der neue schon startet |

  **Das ist kein Supervisor-Fehler, sondern eine dokumentierte Plattformgrenze.** Der
  Unterschied ist wichtig: `signal_windows.go` sagt selbst, dass freundliches Beenden auf
  Windows **nicht umgesetzt** ist. Die Konsequenz ist real — auf Windows wird **jeder**
  Dienst nach Ablauf seiner Frist hart beendet, auch ein kooperativer —, und sie ist im
  README des Dienstes als eigener Abschnitt mit Warnhinweis festgehalten.

  **Der saubere Weg** ist das **Job-Objekt-Verfahren**: es löst beides — freundliches Beenden
  **und** das Mitbeenden von Enkeln (auf Windows trifft `TerminateProcess` heute nur das
  direkte Kind, weil `sysProcAttr` dort `nil` liefert). Das ist die nächste Arbeit an diesem
  Dienst; die Tests sind damit nicht „wegdefiniert", sondern warten auf die Funktion, die sie
  messen.

### r7 — Prüfbericht · diese Datei

---

## 3. Umgebungsbedingungen, die die Prüfung geprägt haben

| # | Bedingung | Folge |
|---|---|---|
| 1 | **WDAC/Device Guard blockiert einzelne unsignierte Binaries.** `target\debug\pmh-sandbox.exe` ist nicht startbar („durch die Device Guard-Richtlinie blockiert", Exit 4551). Eingegrenzt: Namensänderung hilft nicht, `pmh-index.exe` unter demselben Namen läuft, die **Release**-Binary läuft | Sandbox-Prüfungen liefen gegen den Release-Build. **Für den Betrieb heißt das: auf diesem Rechner ist nicht garantiert, dass jede frisch gebaute unsignierte Binary startet.** Betrifft alle 7 Rust-Binaries und jeden Go-Dienst |
| 2 | **Kein zstd-Werkzeug, Python von WDAC blockiert** | die Session-Transkripte (zstd) ließen sich nicht durchsuchen; der Ausschlussnachweis stützt sich deshalb auf Methodik, Quellenangabe und Gegenprobe statt auf Transkripte |
| 3 | **`.git` im Zielprojekt ist defekt** | `go build` scheitert am VCS-Stamping |
| 4 | **Kein Linux-/POSIX-Host** | Landlock-Syscalls und die 19 flock-Vertragstests sind kompiliert, aber nicht ausgeführt |

---

## 4. Freigabeempfehlung

> ## **FREIGABE MIT AUFLAGEN**

### Auflagen nach Priorität

| # | Auflage | Begründung |
|---|---|---|
| **A1** | **`apps/cli`, `apps/desktop`, `apps/desktop-host` aus dem Bun-Workspace entfernen** (bereits erledigt) und danach als Kopie **entfernen oder bewusst dokumentieren** | 1.043 byte-identische Dateien widersprechen `docs/concept.md`; sie haben `bun install` und damit jeden Typecheck blockiert |
| **A2** | **Die 2 verbleibenden roten Tests beheben** — durch **Job-Objekt auf Windows**, nicht durch Anpassen der Tests | 3 der 5 sind behoben. Die letzten 2 prüfen Verhalten, das auf Windows nicht existiert, weil kein freundliches Signal zugestellt werden kann. Das Job-Objekt löst beides: freundliches Beenden **und** Mitbeenden von Enkeln |
| **A3** | **`go build` in der CI mit `-buildvcs=false` oder repariertem `.git` betreiben** | erledigt für die Skripte; die CI fehlt weiterhin |
| **A4** | **`pmh-pty`: `implementation` ehrlich melden** — bis ein echtes PTY existiert nicht `conpty`/`openpty`, sondern den tatsächlichen Zustand | die Meldung verspricht mehr, als der Code hält |
| **A5** | **`pmh-sandbox` an `native/landlock-run` anbinden**, damit `assess` nicht nur beurteilt, sondern durchsetzt | die Durchsetzung existiert bereits; es fehlt nur die Verdrahtung |
| **A6** | **`bun test` an der Wurzel reparieren** oder das Skript auf den Paketweg umstellen | ein Skript, das nicht terminiert, ist schlimmer als keines |
| **A7** | **Die 11 fehlenden Go-Dienste bauen** und **den TS-Umfang** auf die im Mapping geplanten ~50 Gruppen bringen | 1 von 12 Diensten, 3 von ~50 Gruppen |
| **A8** | **Laufzeitartefakte ausschließen**: `website/.bun-cache` (4.617 Dateien), `.bun-tmp` (34), `node_modules/`, `target/` | sonst landen Caches im Repo |
| **A9** | **Einen CI-Lauf auf Linux/macOS einrichten** | Landlock-Syscalls und die flock-Vertragstabelle sind unbelegt, bis sie einmal gelaufen sind |
| **A10** | **Powershell-Skripte mit `-ExecutionPolicy Bypass` dokumentieren** | auf diesem Rechner ist die Skriptausführung gesperrt (`SecurityError`); die neuen Skripte in `scripts/` brauchen den Hinweis |

### Behobene Mängel (in dieser Prüfrunde)

| # | Mangel | Behebung |
|---|---|---|
| 1 | **`bun install` an der Wurzel schlug mit 158 Fehlern fehl** — die kopierten `apps/` verlangten `workspace:*`-Pakete, die es nicht gibt. Folge: `tsgo` nicht auflösbar, **jeder** Typecheck scheiterte | Workspace-Liste von `["packages/*/*", "apps/*"]` auf `["packages/*/*", "apps/web"]`; `bun install` → **exit 0**, 41 Pakete, `apps/web` unverändert |
| 2 | **`flock --probe` beendete sich auf einem Host ohne flock mit Exit 125** statt zu antworten | die Probe wird jetzt **vor** dem Plattform-Gate beantwortet: `{"supported":false}`, Exit 0 |
| 3 | **Landlock-Bits waren toter Code** (nur über zusammengesetzte Masken erreichbar, 10 Compilerwarnungen) | `LANDLOCK_BIT_VOCABULARY` als ladende Tabelle + 3 Tests, die jedes Bit gegen seine ABI prüfen; Modul in `platform.rs` neu geschnitten |
| 4 | **Die Abschaltung wartete je Dienst sequenziell die volle Frist ab** (n·f statt `max(f)`) | zwei Phasen: erst allen das Signal, dann gemeinsam warten |
| 5 | **`blockForever` blockierte nicht** — der Go-Deadlock-Prüfer beendete die Testdienste mit Exit 2 | `blockForever` konsumiert alle Signale über einen gepufferten Kanal |
| 6 | **`services/pmh-supervisor` hatte kein `README.md` und kein `unit.json`** | beide erstellt; das README nennt die Plattformgrenze als eigenen Warnabschnitt |
| 7 | **`units/README.md` fehlte** — das Unit-Format war nirgends festgehalten | erstellt, mit `unit.json`-Schema, den vier Unit-Arten und der `optional`/`required_core`-Unterscheidung; dazu **8 `unit.json`** für die vorhandenen Komponenten |
| 8 | **`scripts/build-go.ps1` und `scripts/test-go.ps1` fehlten** | erstellt; beide setzen `-buildvcs=false` und melden je Dienst eine Ergebniszeile |
| 9 | **`go vet` meldete „misuse of unbuffered os.Signal channel"** — meine eigene erste Korrektur | gepufferter Kanal, mit Begründung im Code |

### Risiken

| # | Risiko | Schwere |
|---|---|---|
| R1 | **Die zwei stärksten Rust-Fähigkeiten sind unbelegt**: Landlock-Syscalls und die flock-Verhaltenstabelle — Code und Tests existieren, aber kein POSIX-Lauf | **hoch** |
| R2 | **WDAC blockiert unsignierte Binaries.** Aus „der Prozess muss existieren" wird „der Prozess muss ausführbar und signiert sein" — ein neues Betriebsrisiko, das die Addon-Frage ersetzt | mittel |
| R3 | **Die atomaren Garantien sind begründet, nicht absturzgetestet** | mittel |
| R4 | **Die Vorlagenkopie macht den Referenz-Fork als Vergleichsobjekt zweideutig** — zwei Stände desselben Codes nebeneinander | mittel |
| R5 | **Die Vorlagendoku enthält mindestens einen sachlichen Fehler** (die `main.c`-Zuordnung); weitere sind wahrscheinlich | niedrig, aber lehrreich |

### Was ausdrücklich gut ist

1. **Verträge sind zeichengetreu übernommen.** `pmh-landlock-run` reproduziert
   `cli-contract.md` vollständig — Grammatik, Exit 125, alle drei Report-Zeilen.
2. **Fail-closed ist gemessen, nicht behauptet.** Der Nachweis, dass auf einem Host ohne
   Landlock der eingehüllte Befehl **nicht** startet, ist die wichtigste
   Sicherheitseigenschaft des Launchers.
3. **Die Grenzen stehen überall im README**, je Crate in einem Abschnitt „Was noch fehlt".
4. **110 Tests, 0 Warnungen auf beiden Zielplattformen** — und die Tests prüfen Verträge und
   **veröffentlichte Vektoren** (FIPS 180-4, RFC 4231), nicht interne Round-Trips.
5. **Die Python-/C++-Frage ist sauber beantwortet** — belegt statt angenommen.
6. **Das Mapping ist eine Entscheidungsgrundlage.** Fünf Stufen, jede Auslassung begründet,
   offene Dokufragen als Standardannahmen festgehalten statt still entschieden.

---

## 5. Nachweis der Prüfmethodik

| Prüfung | Werkzeug |
|---|---|
| Vorlagenintegrität | `Compare-Object` über die beiden SHA-256-Manifeste (27.093 Zeilen), Dateizählung |
| Kopie-Nachweis | `Get-FileHash -Algorithm SHA256` für 1.060 Dateien unter `apps/` |
| Provenienz | `LastWriteTime` gegen den Vorlagen-Checkout-Zeitstempel |
| Rust | `cargo test --workspace`, `cargo check --workspace --target x86_64-unknown-linux-gnu --all-targets` |
| TypeScript | `bun install`, `bun run typecheck`, `bun test` je Paket |
| Go | `go vet ./...`, `go build ./...`, `go build -buildvcs=false ./...`, `go test ./...` |
| Verträge | manuelle Aufrufe aller sieben Binaries gegen erwartete Exit-Codes und Report-Strings |
| Kopiefreiheit | `Select-String` auf C-/Python-Muster über alle `*.rs` |
| Doku-Ausschluss | `Get-ChildItem -Recurse -File` mit Ausschlussfilter, Quellenangabe je Befund |

**Nicht durchgeführt:** Linux-Lauf der Syscall-Pfade · POSIX-Lauf der flock-Vertragstabelle ·
Absturztest für atomicfs · Transkript-Audit der ausgeschlossenen Ordner (zstd/WDAC) ·
vollständiger Go-/TS-Umfang (nicht implementiert).
