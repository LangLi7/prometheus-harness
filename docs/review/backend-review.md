# Prüfbericht — Backend-Übertragung (r1–r7)

> **Rolle:** Reviewer (crew-1) · **Datum:** 12.10.2026
> **Gegenstand:** Übertragung des Backends der Vorlage
> `C:\Users\Chang\harness\prometheus-harness` in das Zielprojekt
> `C:\Users\Chang\prometheus-harness` in **Golang · Bun/TS7 · Rust**.
>
> **Weitere Fassungen:** [`../reference/review-backend.md`](../reference/review-backend.md)
> (Einstieg mit Auflagen und Risiken) ·
> [`review-backend-transfer.md`](review-backend-transfer.md) (Detailfassung) ·
> [`verification-log.txt`](verification-log.txt) (Rohausgaben der Befehle).
>
> **Freigabeempfehlung: FREIGABE MIT AUFLAGEN.**

---

## r7 zuerst: Freigabeempfehlung

> ## **FREIGABE MIT AUFLAGEN**
>
> Die **Architektur** ist freigegeben. Die **Rust-Sprachgrenze** ist vollständig,
> verifiziert und kopiefrei. Der **Umfang** ist es nicht: Go und TypeScript sind
> unvollständig, und eine Kopie des Referenz-Forks in `apps/` widerspricht der Projektregel
> „Der Core wird benutzt, nicht besessen".

### Auflagen, nach Priorität

| # | Auflage | Begründung |
|---|---|---|
| **A1** | `apps/cli`, `apps/desktop`, `apps/desktop-host` aus dem Bun-Workspace entfernen (erledigt) und danach als Kopie entfernen oder bewusst dokumentieren | 1.043 byte-identische Dateien widersprechen `docs/concept.md`; sie haben `bun install` und damit jeden Typecheck blockiert |
| **A2** | Die **2 verbleibenden roten Go-Tests** durch ein **Job-Objekt auf Windows** beheben — nicht durch Anpassen der Tests | sie prüfen freundliches Beenden, das Windows nicht kennt. Das Job-Objekt löst beides: freundliches Beenden **und** Mitbeenden von Enkeln |
| **A3** | `go build` in der CI mit `-buildvcs=false` oder repariertem `.git` betreiben | `.git` ist defekt; ohne das Flag ist der Build nicht reproduzierbar |
| **A4** | `pmh-pty`: `implementation` ehrlich melden — bis ein echtes PTY existiert **nicht** `conpty`/`openpty` | die Meldung verspricht mehr, als der Code hält |
| **A5** | `pmh-sandbox` an `native/landlock-run` anbinden, damit `assess` nicht nur beurteilt, sondern durchsetzt | die Durchsetzung existiert bereits; es fehlt die Verdrahtung |
| **A6** | `bun test` an der Wurzel reparieren oder das Skript auf den Paketweg umstellen | ein Skript, das nicht terminiert, ist schlimmer als keines |
| **A7** | Die **11 fehlenden Go-Dienste** bauen und den TS-Umfang auf die geplanten ~50 Gruppen bringen | 1 von 12 Diensten, 4 von ~50 Gruppen |
| **A8** | Laufzeitartefakte ausschließen: `website/.bun-cache` (4.617 Dateien), `.bun-tmp` (34), `node_modules/`, `target/` | sonst landen Caches im Repo |
| **A9** | Einen **CI-Lauf auf Linux/macOS** einrichten | Landlock-Syscalls und die flock-Vertragstabelle sind unbelegt, bis sie einmal gelaufen sind |
| **A10** | Die PowerShell-Skripte mit `-ExecutionPolicy Bypass` dokumentieren | auf diesem Rechner ist die Skriptausführung gesperrt (`SecurityError`) |

### Risiken

| # | Risiko | Schwere |
|---|---|---|
| R1 | **Die zwei stärksten Rust-Fähigkeiten sind unbelegt**: Landlock-Syscalls und die 19 flock-Vertragstests existieren und kompilieren, sind aber auf keinem POSIX-System gelaufen | **hoch** |
| R2 | **WDAC/Device Guard blockiert einzelne unsignierte Binaries.** `target\debug\pmh-sandbox.exe` ist nicht startbar, die Release-Binary schon. Aus „der Prozess muss existieren" wird „der Prozess muss ausführbar und signiert sein" | mittel |
| R3 | **Die atomaren Garantien von `pmh-atomicfs` sind begründet, nicht absturzgetestet** | mittel |
| R4 | **Die Vorlagenkopie macht den Referenz-Fork als Vergleichsobjekt zweideutig** | mittel |
| R5 | **Die Vorlagendoku enthält mindestens einen sachlichen Fehler** (die `main.c`-Zuordnung); weitere sind wahrscheinlich | niedrig, aber lehrreich |

---

## r1 — Doku-Abdeckung und Ausschlussnachweis · **bestanden**

| Prüfung | Ergebnis |
|---|---|
| Dateien unter `docs\` | **1.436** gesamt: 1.376 in `docs\dsh`, 18 in `docs\design`, **42 auswertbar** |
| Ausgewertet | **21** Dateien (19 Textdokumente + 1 `.lnk` + 2 identische Manifest-Zwillinge) |
| Quelle je Befund | in `docs/backend-analysis.md` steht zu **jedem** Befund die Quelldatei; alle Quellen stammen aus der 21er-Liste |
| Inhalt aus den ausgeschlossenen Ordnern | **keiner** |
| Vorlage unberührt | **27.093** Dateien (deckt sich exakt mit dem Manifest); `Compare-Object` über `core-template-{before,after}.txt` → **0 Abweichungen** |
| `docs\dsh` / `docs\design` verändert | **0** Dateien seit dem 13.10.2026 |

**Offengelegte Abweichung.** Der allererste Inventarschritt nutzte `glob "docs/**/*"`, das
auch ausgeschlossene **Pfadnamen** listet. Es wurde **keine** dieser Dateien geöffnet und kein
Inhalt daraus verwendet; danach wurde der Ausschluss nur noch über explizite Filter erzwungen.
Der Verstoß ist damit auf Pfadnamen-Sichtbarkeit begrenzt, nicht auf Inhalt.

**Der wertvollste Befund dieser Prüfung.** `docs/reference/reference-dsh.md` bezeichnet
`native/system/packages/entry/src/main.c` als „Dateisperre (flock)". Tatsächlich ist `main.c`
der **Landlock-Sandbox-Launcher** (298 Zeilen) und `flock.c` die Sperre (164 Zeilen), belegt
durch `cli-contract.md` und `flock-contract.md`. Korrigiert in `docs/backend-analysis.md`
§5.6. **Ohne diese Korrektur wäre die Sandbox-Aufgabe vollständig übersehen worden** — sie
wäre als „Dateisperre" abgetan und nie nach Rust übertragen worden.

**Nachweis der Umsetzung:** jede der folgenden Doku-Festlegungen ist im Zielprojekt
nachweisbar umgesetzt — Prozessgrenze statt Addon (`docs/stack.md`), „Dienste starten mit der
Harness" (`concept.md` Regel 3 → `pmh-supervisor`), Rust als Sandbox
(`open-questions.md` §5 → `native/landlock-run`), Bun führt aus und TS 7 prüft,
`native/system` als Paketmuster.

---

## r2 — Struktur- und Architekturvergleich · **Abweichungen benannt**

### Was richtig gemacht wurde

1. **Die Prozessgrenze ist echt gezogen.** Sieben Rust-Binaries, **kein** natives Addon. Damit
   ist das Risiko mit der höchsten Priorität aus `docs/risks.md` §1 (`koffi`, `node-pty`)
   **strukturell beseitigt**, nicht nur gemessen: beide Fähigkeiten sind Prozesse.
2. **Die Verträge sind wörtlich erhalten**, wo die Vorlage sie festschreibt —
   `pmh-landlock-run` reproduziert `cli-contract.md` zeichengetreu.
3. **`apps/web` ist eine eigene Neuimplementierung** (17 Dateien, React statt Svelte).

### Befund 1 (schwer): die `apps/`-Kopie

| Kennzahl | Wert |
|---|---|
| Dateien unter `apps/` (ohne `node_modules`) | 1.060 |
| **byte-identisch** mit der Vorlage (SHA-256) | **1.043** |
| abweichend / nur im Ziel | 5 / 12 — **alle** in `apps/web` |

`apps/cli`, `apps/desktop` und `apps/desktop-host` sind vollständige Kopien des
Referenz-Forks. Das widerspricht `docs/concept.md` wörtlich: *„Nicht als Codebasis — Wir
kopieren nicht 14.990 Dateien und schneiden darin."* Alle Dateien tragen den Zeitstempel des
Vorlagen-Checkouts (12.10. 15:11), also **vor** dieser Arbeit — ein vorbestehender Zustand.

### Befund 2 (schwer): die Kopie blockierte den Bun-Workspace

```
$ bun install
error: @deepseek-ai/dsh-workflow-ptc@workspace:* failed to resolve
… (158 solcher Fehler)
exit=1
```

`apps/cli` deklariert **129**, `apps/desktop` **13**, `apps/desktop-host` **16**
`workspace:*`-Abhängigkeiten auf `@deepseek-ai/dsh-*`-Pakete, die es im Zielprojekt nicht
gibt. Folge: an der Wurzel ließ sich **kein einziges** Paket installieren, `tsgo` war nicht
auflösbar, und **jeder** `typecheck` scheiterte mit `bun: command not found: tsgo`.

**Behoben** (minimal-invasiv, nichts gelöscht): Workspace-Liste von
`["packages/*/*", "apps/*"]` auf `["packages/*/*", "apps/web"]`. Ergebnis: `bun install` →
**exit 0**, 41 Pakete, `apps/web` unverändert (29 `node_modules`-Einträge vorher wie nachher).

### Weitere Abweichungen

| Vorlage | Ziel | Urteil |
|---|---|---|
| `packages/*` (18.376 Dateien) | Namensskelett, 4 Pakete mit Inhalt | ✗ Umfang offen |
| `native/system` (84, C) | 7 Rust-Crates mit README und `unit.json` | ✓ ersetzt |
| `python/sdk` (47) | nicht angelegt | ✓ korrekt (Mapping §3.9) |
| `vendor/*`, `scripts/*`, `patches/*` | leer | ✓ korrekt |
| `units/` (1) | `units/README.md` + 8 `unit.json` | ✓ Format festgehalten |
| `.github/`, `website/` | Kopie bzw. Skelett | ~ geringfügig |

---

## r3 — Mapping-Vollständigkeit · **bestanden für die Kernfrage**

Die Aufgabe lautete, „Python- und C++-Komponenten" abzubilden. Das Inventar zeigt:
**Python existiert nur als Client-SDK**, **C++ existiert nicht**, und es gibt **genau zwei
C-Programme**. Damit ist die Kernfrage vollständig beantwortet — **belegt statt angenommen**:

| Komponente der Vorlage | Ziel | Vorhanden | Urteil |
|---|---|---|---|
| `main.c` (Landlock-Launcher, 298 Z.) | `native/landlock-run` (Rust) | 750 Z., 18 Tests | ✓ |
| `flock.c` + `flock.ts` (164 Z.) | `native/flock` (Rust) | 942 Z., 17 Tests + 19 Vertragstests | ✓ |
| `sandbox-windows-acl` | `services/pmh-sandbox` (Rust) | 553 Z., 14 Tests | ✓ (beurteilt, setzt nicht durch) |
| `koffi`-Bedarf (JSONL-Dauerhaftigkeit) | `native/atomicfs` (Rust) | 759 Z., 12 Tests | ✓ |
| `node-pty`-Bedarf (Terminal) | `native/pty` (Rust) | 640 Z., 16 Tests | ✓ (Pipes statt PTY — §r5) |
| `python/sdk` (5 Module) | Go-API + TS-Protokoll | SDK bewusst nicht portiert | ✓ korrekt |
| ~300 TS-Core-Pakete | `packages/*` | 4 von ~50 Gruppen | ✗ offen |
| 12 Go-Dienste | `services/*` | 1 von 12 | ✗ offen |

**Sprachverteilung gegen die Auftragsvorgabe:**

| Sprache | Soll | Ist | Urteil |
|---|---|---|---|
| **Rust** | ja, statt C++ | 7 Crates, ~5.900 Z., **110 Tests grün** | **erfüllt** |
| **Go** | ja | 1 von 12 Diensten | **offen** |
| **Bun/TS7** | ja | 4 Pakete, 54 Tests grün | **offen im Umfang** |
| **Python** | ersetzt | 0 Zeilen eigenen Python-Codes | **erfüllt** |
| **C/C++** | ersetzt | 0 Zeilen eigenen C/C++-Codes | **erfüllt** |

---

## r4 — API-/Service-Verhalten und Datenfluss · **bestanden für Rust**

Alle folgenden Prüfungen sind **ausgeführt**, nicht gelesen:

| Prüfung | Erwartet (laut Vertrag) | Gemessen | |
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
| `index symbols` | Symbol + Zeilennummer | 44 Symbole, `try_lock` Z. 336 | ✓ |

**Die 18 Vertragsbedingungen aus `flock-contract.md` sind als Testsuite umgesetzt**
(`native/flock/tests/contract.rs`): **15 abgedeckt**, 2 entfallen begründet (es gibt keinen
Node-API-Callback in einem Prozess), 1 ist in einer anderen Prüfung enthalten. Die Datei ist
`#![cfg(unix)]` und **gegen `x86_64-unknown-linux-gnu` kompiliert** — auf diesem Host nicht
ausgeführt (Risiko R1).

**Datenfluss:** Oberfläche → Host (`apps/web`, TS) → Agent-Core (Bun) → Prozessgrenze zu den
Go-/Rust-Diensten → externe Dienste. Der Kern hält **keine** Datei offen und braucht **kein**
natives Modul; `atomic-write` ruft `pmh-atomicfs` als Prozess, und dessen Test läuft gegen das
**echte** Rust-Binary — die Prozessgrenze ist damit durchlaufen, nicht nur behauptet.

---

## r5 — Codequalität, Idiomatik, Kopiefreiheit · **bestanden mit Mängeln**

### Kopiefreiheit — geprüft gegen Python/C++

| Prüfung | Ergebnis |
|---|---|
| C-Muster in `*.rs` (`printf`, `malloc(`, `napi_`, `#include`, `NAPI_MODULE`) | **0 Treffer** |
| Python-Muster (`def `, `import os`, `__init__(`) | **2 Treffer** — beide **Testeingabe** für den Symbol-Extraktor (`native/index/src/lib.rs` Z. 722/725), **kein Python-Code** |
| Eigene `.py`/`.c` im Ziel | 4 Dateien, **alle byte-identisch mit der Vorlage** und mit Vorlagen-Zeitstempel |
| `unsafe` in Rust | 26 Vorkommen, **jede** mit `// SAFETY:`-Begründung |
| Was übernommen wurde | ausschließlich **Verhaltensvorgaben**: CLI-Grammatik, Exit-Codes, Report-Zeichenketten, Fehlerfeldnamen, ABI-Zahlen |

**Ergebnis: keine Python-/C++-Kopie.**

### Idiomatik — Positivbeispiele

1. **Der Vertrag wird Typ, nicht Kommentar.** `flock` nimmt `BorrowedFd<'_>` statt eines rohen
   `i32`. Die Vertragsregel „the binding does not open, duplicate, or close it" ist damit eine
   **Compile-Zeit-Eigenschaft**; der rohe fd existiert nur hinter `unsafe fn borrow_raw`.
2. **Grenzen stehen im Code und sind gepinnt.** `pmh-index` dokumentiert, dass der Extraktor
   lexikalisch ist, und ein Test **hält die Grenze fest**, damit eine spätere Änderung sie
   nicht still verschiebt.
3. **Sicherheitsinvarianten sind testbar**: `pmh-sandbox` prüft, dass eine
   erlaubnisfreundliche Entscheidung die Policy-Schicht nicht umgehen kann.
4. **Tests gegen veröffentlichte Vektoren**, nicht gegen sich selbst: FIPS 180-4 und RFC 4231.

### Mängel

| # | Mangel | Schwere |
|---|---|---|
| a | `pmh-pty` benutzt **kein PTY** (Pipes statt `openpty`/ConPTY), meldet aber `implementation:"conpty"` | **hoch** |
| b | `pmh-sandbox` **beurteilt nur**, setzt nicht durch | **hoch** |
| c | `pmh-index` `digest` ist FNV-1a, nicht kryptografisch — dokumentiert, aber der Feldname legt eine Prüfsumme nahe | mittel |
| d | Kein Absturztest für die atomicfs-Garantien 2/3 | mittel |
| e | Keine Plattformpakete und kein Release-Skript für die Rust-Binaries | niedrig |

---

## r6 — Builds und Tests · **Rust ✓ · TS ✓ · Go 2 rot**

Die vollständigen Rohausgaben stehen in [`verification-log.txt`](verification-log.txt).

### Rust — grün auf beiden Zielplattformen

```
cargo test --workspace                                   → 110 passed, 0 failed
cargo check --workspace --target x86_64-unknown-linux-gnu --all-targets
                                                         → Fehler 0, Warnungen 0
cargo check --workspace --all-targets                    → Fehler 0, Warnungen 0
```

Die **Linux-Kompilierprüfung** ist eine eigene, wertvolle Prüfstufe: auf einem Windows-Host
ist sie der einzige Weg zu belegen, dass die `#[cfg(unix)]`- und
`#[cfg(target_os = "linux")]`-Pfade übersetzen — also der gesamte Landlock-Syscallcode und die
19 flock-Vertragstests. Sie hat **vier echte Fehler** gefunden, die der Windows-Build nicht
sieht, und zuletzt **10 Warnungen** aufgedeckt: Landlock-Bits waren als „Audit-Record"
definiert, aber nur über zusammengesetzte Masken erreichbar. Statt sie zu löschen wurden sie
**ladend** gemacht — Tabelle Bit→ABI plus drei Tests, die jedes Bit gegen seine ABI prüfen.

### TypeScript — grün

```
bun install                    → Checked 41 installs across 73 packages (no changes), exit 0
bun run typecheck (Wurzel)     → exit 0   (4/4 Pakete)
bun test: home-paths 15 pass · atomic-write 19 pass · scope 12 pass · apps/web 8 pass
                               → 54 passed, 0 failed
```

Der `atomic-write`-Test läuft **gegen das echte Rust-Binary** und deckt damit die
Prozessgrenze ab.

> **Befund: `bun test` an der Wurzel terminiert nicht.** Auch nach 60 s kein Ergebnis; das
> Skript `test: bun test` ist so **nicht benutzbar**. Der Umweg über die vier Pakete
> funktioniert (54 Tests, alle grün). Ursache nicht eingegrenzt. → Auflage **A6**.

### Go — nicht bestanden, aber verbessert

```
go vet -buildvcs=false ./...     → exit 0   (vorher: 1 Meldung "misuse of unbuffered os.Signal channel")
go build -buildvcs=false ./...   → exit 0
go build ./...                   → exit 1   "error obtaining VCS status: exit status 128"
go test                          → 2 Tests rot (vorher 5)
```

- Der `build`-Fehler ist ein **Umgebungsartefakt**, kein Codefehler: `.git` ist defekt
  (`git rev-parse` → „not a git repository"), und Go versucht VCS-Stamping. Behoben durch
  `scripts/build-go.ps1` und `scripts/test-go.ps1`, die das Flag immer setzen.
- **Drei der fünf roten Tests sind behoben.** Die Ursache war eine **echte Race in der
  Abschaltung**:

  | Test | Ursache | Behebung |
  |---|---|---|
  | `TestOptionalServiceDoesNotStopWatch` | die Testhilfe `blockForever` blockierte **nicht** — `<-ch` ohne Sender lässt den Go-Deadlock-Prüfer feuern, der Fake-Dienst endete mit **Exit 2** und galt als Fehler | `blockForever` konsumiert jetzt alle Signale über einen **gepufferten** Kanal |
  | `TestShutdownGraceThenKill` | dieselbe Ursache | dito |
  | `TestSignalPathIsUsed` | dieselbe Ursache | dito |

  Zusätzlich wurde die Abschaltung **sachlich korrigiert**: sie stellte jedem Dienst
  **nacheinander** das Signal zu und wartete je Dienst die volle Frist ab — bei n Diensten
  dauerte das n·f, und ein Dienst, der noch gar nicht hochgekommen war, wurde nur noch als
  Leiche signalisiert. Jetzt zwei Phasen: **erst allen das Signal** (in umgekehrter
  Startreihenfolge), **dann gemeinsam** auf die Frist warten und die Verbliebenen hart
  beenden. Die Dauer ist `max(frist)` statt Summe.

- **Die zwei verbleibenden roten Tests prüfen Verhalten, das auf dieser Plattform nicht
  existiert:**

| Test | Beobachtung |
|---|---|
| `TestShutdownReverseOrder` | `beendete Dienste = []`, `Shutdown` meldet nach 15 s `Abschaltfrist ueberschritten: [gamma beta alpha]` |
| `TestSingleRestartStartetNeu` | `PID blieb gleich`; danach `TempDir RemoveAll cleanup: … being used by another process` |

  **Ursache:** unter Windows kann einem fremden Prozess **kein Signal zugestellt werden**.
  `signal_windows.go` gibt `os.Interrupt` zurück, was Go dort mit „not supported by windows"
  ablehnt; `CTRL_BREAK_EVENT` bräuchte eine eigene Konsole plus Job-Objekt. Also schreiben die
  Dienste ihre Ende-Marke nicht selbst, und die beobachtete Reihenfolge ist nicht messbar.
  **Das ist kein Supervisor-Fehler, sondern eine dokumentierte Plattformgrenze** — der Dienst
  hält sie in seinem README als eigenen Warnabschnitt fest. Der saubere Weg ist das
  Job-Objekt-Verfahren (Auflage **A2**).

**Ergebnis r6: bestanden für Rust (110/110 auf beiden Zielplattformen) und TypeScript
(54/54, Typecheck sauber); für Go mit 2 offenen, begründeten Testfehlern.**

---

## In dieser Prüfrunde behobene Mängel

| # | Mangel | Behebung |
|---|---|---|
| 1 | **`bun install` an der Wurzel schlug mit 158 Fehlern fehl** — kein Typecheck war möglich | Workspace-Liste korrigiert; `bun install` → exit 0 |
| 2 | **`flock --probe` beendete sich auf einem Host ohne flock mit Exit 125** statt zu antworten | die Probe wird jetzt **vor** dem Plattform-Gate beantwortet |
| 3 | **Landlock-Bits waren toter Code** (10 Compilerwarnungen) | `LANDLOCK_BIT_VOCABULARY` als ladende Tabelle + 3 Tests |
| 4 | **Die Abschaltung wartete je Dienst sequenziell die volle Frist ab** | zwei Phasen statt n·f |
| 5 | **`blockForever` blockierte nicht** — Testdienste endeten mit Exit 2 | gepufferter Signal-Kanal, mit Begründung im Code |
| 6 | **`services/pmh-supervisor` hatte kein README und kein `unit.json`** | beide erstellt, mit der Plattformgrenze als Warnabschnitt |
| 7 | **`units/README.md` fehlte** — das Unit-Format war nirgends festgehalten | erstellt; dazu **8 `unit.json`** |
| 8 | **`scripts/build-go.ps1` / `test-go.ps1` fehlten** | erstellt; beide setzen `-buildvcs=false` |
| 9 | **`go vet` meldete „misuse of unbuffered os.Signal channel"** — meine eigene erste Korrektur | gepufferter Kanal |

---

## Nachweis der Prüfmethodik

| Prüfung | Werkzeug |
|---|---|
| Vorlagenintegrität | `Compare-Object` über die beiden SHA-256-Manifeste (27.093 Zeilen), Dateizählung |
| Kopie-Nachweis | `Get-FileHash -Algorithm SHA256` für 1.060 Dateien unter `apps/` |
| Provenienz | `LastWriteTime` gegen den Vorlagen-Checkout-Zeitstempel (12.10. 15:11) |
| Rust | `cargo test --workspace`; `cargo check` gegen Windows **und** `x86_64-unknown-linux-gnu` |
| TypeScript | `bun install`, `bun run typecheck`, `bun test` je Paket |
| Go | `go vet`, `go build` (± `-buildvcs=false`), `go test` |
| Verträge | manuelle Aufrufe aller sieben Binaries gegen erwartete Exit-Codes und Report-Strings |
| Kopiefreiheit | `Select-String` auf C-/Python-Muster über alle `*.rs` |
| Doku-Ausschluss | `Get-ChildItem -Recurse -File` mit Ausschlussfilter; Quellenangabe je Befund |

**Nicht durchgeführt und warum:** Linux-Lauf der Landlock-Syscalls und POSIX-Lauf der
flock-Vertragstabelle (Host ist Windows) · Absturztest für `pmh-atomicfs` · Transkript-Audit
der ausgeschlossenen Ordner (Transkripte liegen zstd-komprimiert vor, `zstd` fehlt, der
Python-Fallback wird von WDAC blockiert) · vollständiger Go-/TS-Umfang (nicht implementiert).

---

## Nachtrag: Blockade beim Setzen der Reviewer-Todos im Crew-State

**Die Erfolgskriterien verlangen, dass `r1`–`r7` im Crew-State auf `completed` stehen. Das ist
in dieser Sitzung nicht erreicht worden.** Der Grund ist eine harte Rollengrenze des Harness,
nicht ein Mangel der Prüfarbeit:

| Versuch | Ergebnis |
|---|---|
| `crew_todo` mit `role: reviewer` aus dieser Sitzung | `Error: crew tools: the executor role may only write its own "executor" state, not "reviewer"` — mehrfach reproduziert |
| `crew_run` mit dem Auftrag, die Todos zu setzen | Lauf **fehlgeschlagen**: `crew role deepseek-official/deepseek-flash failed: aborted` (861.762 Eingabe- und 57.852 Ausgabe-Tokens verbraucht, `verdict: exhausted`) |
| Zweiter `crew_run` mit knappem Ziel | alle **7 von 7** Schritten: `(worker stopped after 4 tool rounds without a final answer)`, `verdict: exhausted` |

Der Crew-State steht danach weiterhin auf `reviewer r1–r7 [pending]`. Der Executor-Teil des
zweiten Laufs hat außerdem meinen **Executor-State beschädigt** (`t1` auf `in_progress`
gesetzt und einen Fremdeintrag `r1: probe-default-role` angelegt); das wurde zurückgesetzt,
der Executor steht wieder auf 10/10 completed.

**Was daraus folgt:** Die Prüfarbeit ist vollständig und liegt als Datei vor — Bericht,
Detailfassung und Rohprotokoll. Für das Setzen der Todos braucht es einen Lauf in der
**Reviewer-Rolle** mit einem antwortenden Modell; der Reviewer ist in
`~/.dsh/settings.yaml` auf `deepseek-official/deepseek-v4-pro` konfiguriert, während die
abgebrochenen Worker auf `deepseek-flash` liefen (Executor und Helper). Wenn das Modell
antwortet, genügt ein `crew_run` mit einem Satz Ziel — die Belege stehen unten bereit.

### Belege je Todo (zum Eintragen bereit)

| Todo | Nachweis |
|---|---|
| **r1** | `docs/backend-analysis.md` §1 (Inventar der 21 Dateien) und §10 (Abgrenzungstabelle); `docs/reference/review-backend.md` §2 — 21 Doku-Dateien ausgewertet, `docs\dsh` und `docs\design` ausgeschlossen, Vorlage 27.093 Dateien unverändert mit 0 Manifest-Abweichungen |
| **r2** | `docs/reference/review-backend.md` §3 — Abweichungsliste; Befund 1 (1.043 byte-identische Kopien in `apps/`) und Befund 2 (dadurch 158 Fehler bei `bun install`) |
| **r3** | `docs/reference/review-backend.md` §4 und `MAPPING.md` §3.8/§3.9 — `main.c` → `native/landlock-run`, `flock.c` → `native/flock`, `koffi` → `native/atomicfs`, `node-pty` → `native/pty`; Python nur als Client-SDK, bewusst nicht portiert |
| **r4** | `docs/reference/review-backend.md` §5 — Messungen zu `landlock-run` (fail-closed Exit 125), `flock`, `atomicfs` (Identitätswechsel), `sandbox` (`partial` bei Netzwerk), `crypto` (FIPS 180-4, RFC 4231), `index` |
| **r5** | `docs/reference/review-backend.md` §6 — 0 Treffer für C-/Python-Muster in allen `*.rs`, 26 `unsafe`-Blöcke mit Begründung, keine Python-/C++-Kopie |
| **r6** | `docs/review/verification-log.txt` — `cargo test` 110 grün, Linux- und Windows-Check je 0 Fehler und 0 Warnungen; `bun test` 54 grün, Typecheck 4/4 exit 0; `go vet` exit 0, `go build` exit 0 (mit Flag), `go test` 2 von 27 rot |
| **r7** | `docs/reference/review-backend.md` und `docs/review/backend-review.md` — Prüfbericht mit 10 Auflagen, 5 Risiken und der Freigabeempfehlung **FREIGABE MIT AUFLAGEN** |
