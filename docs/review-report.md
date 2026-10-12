# Prüfbericht — Backend-Übertragung Prometheus Harness (r1–r7)

> **Rolle:** reviewer (crew-1) · **Gegenstand:** die Backend-Übertragung aus der Vorlage
> `C:\Users\Chang\harness\prometheus-harness` in das Zielprojekt
> `C:\Users\Chang\prometheus-harness` in **Golang · Bun/TS7 · Rust**.
> **Prüfauftrag:** r1–r7. **Methode:** Text-, Hash- und Build-Prüfung; keine Bildauswertung.
> **Haltung:** Zahlen und Befunde sind gemessen; was nicht geprüft werden konnte, steht als
> solches da.

---

## 0. Web-Ausnahme (bewusst, keine Lücke)

**Dieser Bericht prüft Web nicht.** `apps/web` wurde **nicht** aus der Vorlage kopiert oder
eingefügt, sondern ist eine eigenständige Neuimplementierung. Eine fehlende oder unfertige
Web-Umsetzung ist daher **keine Abweichung** und wird in keiner der Prüfungen r1–r7 als
Mangel gewertet.

Belege für die Ausnahme (gemessen, nicht angenommen):

| Prüfung | Ergebnis |
|---|---|
| `apps/web`-Dateien byte-identisch mit der Vorlage | **0** — die drei byte-identischen Ordner sind ausschließlich `apps/cli`, `apps/desktop`, `apps/desktop-host` |
| Eigene Identität | `package.json` → `@prometheus-harness/web` (Vorlage-Namensraum ist `@deepseek-ai/…`) |
| Eigene Abhängigkeiten | `react`, `react-dom`, `three`, `vite`, `@vitejs/plugin-react` — eigene `bun.lock`, eigenes `node_modules` |
| Eigene Konfiguration | eigenes `tsconfig.json` mit `include: ["src", "vite.config.ts"]`, **kein** `references`-Block auf Core-Pakete |
| Eigene Quellen | 8 Dateien unter `apps/web/src/`, alle Importe relativ (`./lib/…`) |

**Grenze der Ausnahme:** Ausgenommen ist `apps/web` als **Web-Modul**. `apps/cli`,
`apps/desktop` und `apps/desktop-host` bleiben im Prüfumfang — sie sind Backend-Host bzw.
Desktop-Skelett (vgl. `MAPPING.md` §3.5) und **nicht** Teil der Web-Ausnahme.

---

## 1. Ergebnis in einem Satz

**Freigabe mit Auflagen — die Architektur und die Rust-Sprachgrenze sind tragfähig und
verifiziert; der TypeScript- und der Go-Anteil sind unfertig, und im Zielprojekt liegt eine
byte-identische Kopie des Referenz-Forks (1.043 Dateien), die der Projektregel „Der Core
wird benutzt, nicht besessen" widerspricht.**

| Bereich | Umfang | Urteil |
|---|---|---|
| Doku-Auswertung (r1) | 21 auswertbare Dateien, `docs\dsh` + `docs\design` ausgeschlossen | **bestanden** (mit offengelegter Abweichung) |
| Struktur (r2) | 52 Paketgruppen, aber 328 von 331 Blattordnern leer | **Abweichungen benannt** |
| Mapping (r3) | C-Anteil vollständig; Go 1 von 11; TS 3 von ~300 | **bestanden für den C-Anteil, nicht für Go/TS** |
| Verhalten (r4) | Rust-Verträge wörtlich; Go/TS-Schnittstellen offen | **bestanden für Rust** |
| Codequalität (r5) | 33 eigene Dateien, kopiefrei; 8 Mängel benannt | **bestanden mit Mängeln** |
| Build/Test (r6) | Rust 110/110 grün · TS 54 grün · Go 13 pass/2 fail | **Rust ✓ · TS ✓ · Go ✗** |
| Web | **bewusst nicht geprüft** (nicht übertragen) | ausgenommen |

---

## 2. Die sieben Prüfungen

### r1 — Doku-Vollständigkeit und Ausschluss-Nachweis · **bestanden**

| Prüfung | Methode | Ergebnis |
|---|---|---|
| Umfang `docs\` | `Get-ChildItem -Recurse -File` mit Ausschlussfilter | **1.436** Dateien: 1.376 in `docs\dsh`, 18 in `docs\design`, **42 auswertbar** |
| Tatsächlich ausgewertet | Doku-Tabelle in `docs/backend-analysis.md` §1 | **21** Dateien (19 Textdokumente + 1 `.lnk` + 2 identische Manifest-Zwillinge) |
| Inhalt aus `docs\dsh`/`docs\design` verwendet? | Gegenprobe: jede Befundquelle stammt aus der 21er-Liste | **nein** |
| Belege | `docs/backend-analysis.md` §1 und §10 | vorhanden |

> **Offengelegte Abweichung (klein).** Der erste Inventarisierungsschritt nutzte
> `glob "docs/**/*"`, das auch ausgeschlossene **Pfade** listet. Dateinamen aus `docs\dsh`
> erschienen dadurch in der Werkzeugausgabe. Es wurde **keine** dieser Dateien geöffnet und
> **kein** Inhalt daraus übernommen. Die Abweichung ist auf **Pfadnamen-Sichtbarkeit**
> begrenzt. `docs\design` wurde zusätzlich als eigener Ordner vollständig ausgelassen
> (18 Dateien, 0 Zugriffe).

**Vorlagenintegrität:** 27.093 Dateien (ohne `node_modules`/`.git`/`.bun-cache`) —
deckt sich exakt mit dem Manifest; `Compare-Object` über
`docs/reference/verify/core-template-before.txt` und `-after.txt` → **0 Abweichungen**.
**Die Vorlage ist unberührt.**

### r2 — Struktur- und Architekturvergleich · **Abweichungen benannt**

| Vorlage | Ziel | Urteil |
|---|---|---|
| `apps/cli` (226 Dateien) | **byte-identische Kopie** | ✗ siehe §2.1 |
| `apps/desktop` (814) | **byte-identische Kopie** | ✗ |
| `apps/desktop-host` (59) | **byte-identische Kopie** | ✗ |
| `apps/web` | **eigene Neuimplementierung** | **ausgenommen** (Web-Ausnahme, §0) |
| `packages/*` (18.376) | Namensskelett: 52 Gruppen, 331 Blattordner, **328 leer**, 3 mit Inhalt | ✗ unfertig |
| `native/system` (84, C) | `native/*` — 7 Rust-Crates, 16 `.rs`-Dateien | ✓ ersetzt |
| `python/sdk` (47) | **nicht angelegt** | ✓ korrekt (`MAPPING.md` §3.9) |
| `vendor/*` (228) | leer bzw. nicht vorhanden | ✓ korrekt (Cordis als Abhängigkeit) |
| `scripts/` (388) | 7 leere Unterordner + 4 eigene `.ps1` | ✓ korrekt (`docs/stack.md`) |
| `patches/` (7) | leer | ✓ korrekt |
| `units/` (1) | nur `README.md` | ✗ kein Unit gebaut |
| `snapshots/`, `benchmarks/`, `assets/` | leer | ✓ korrekt (Stufe E) |
| `.github/` (56) | **byte-identische Kopie** (56/56) | ✗ geringfügig (kein Backend) |

#### 2.1 Befund 1 (schwer): die `apps/`-Kopie widerspricht der Projektregel

| Kennzahl | Wert |
|---|---|
| Geprüfte Dateien unter `apps/` (ohne `node_modules`) | **1.099** |
| **byte-identisch** mit der Vorlage (SHA-256, je Datei) | **1.043** |
| `apps/cli` | 226 / 226 identisch, 0 abweichend, 0 fehlend |
| `apps/desktop` | 814 / 814 identisch, 0 abweichend, 0 fehlend |
| `apps/desktop-host` | 59 / 59 identisch, 0 abweichend, 0 fehlend |

`docs/concept.md` sagt die Regel unmissverständlich:

> **Der Core wird benutzt, nicht besessen.** (Z. 13)
>
> | **Nicht als Codebasis** | Wir kopieren nicht 14.990 Dateien und schneiden darin | (Z. 72)

**Zusätzlicher Befund: die Kopien sind bereits nicht lauffähig.** `apps/cli/tsconfig.json`
referenziert 23 Projektpfade — im Zielprojekt vorhanden sind **2**
(`packages/util/home-paths`, `packages/util/atomic-write`); **21 fehlen**, darunter
`vendor/cordis`, `packages/boot/app-boot`, `packages/bundle/*`, `packages/host/webserver`,
`packages/core/{session,system-prompt,tools}`. `apps/desktop-host/tsconfig.json` verweist
u. a. auf `../cli`, `packages/core/agent`, `packages/jobs/jobs`,
`packages/client/connection/tsconfig.host.json` — **alle fehlen**. Die mitgelieferten
`lib/`-Artefakte stammen aus der Vorlage, nicht aus einem Build hier.

**Einordnung — nicht dieser Arbeit zuzurechnen.** Alle 1.043 Dateien tragen den Zeitstempel
des Vorlagen-Checkouts (12.10.2026 15:11), also **vor** Beginn der Übertragung
(12.10. 19:00 ff.). Vorbestehender Zustand.

**Widerspruch in der Ablage:** `docs/review/ABSCHLUSS-MELDUNG.txt` Z. 17 behauptet
„A1 kopierte apps/ aus dem Bun-Workspace entfernen (erledigt)". Das ist **falsch** — die
Dateien liegen unverändert da.

**Empfehlung:** `apps/cli`, `apps/desktop` und `apps/desktop-host` auf ein Skelett
zurückführen, wie `apps/web` es vorlebt — **nicht** die Ordner streichen: `apps/cli` ist
laut `MAPPING.md` §3.5 und `docs/reference/web-frontend.md` der vorgesehene TS-Host, der
`apps/web/dist` ausliefert. Vor jedem Löschen ist eine `.gitignore` anzulegen: das Zielprojekt
hat **keine**, und `.git/` ist defekt (`HEAD`, `config`, `refs` fehlen → „fatal: not a git
repository"), Löschen wäre also unumkehrbar.

#### 2.2 Weitere Strukturabweichungen

| # | Abweichung | Bewertung |
|---|---|---|
| a | `packages/` hat 52 Gruppen und 331 Blattordner, aber **328 davon sind leer**; nur `core/scope`, `util/atomic-write`, `util/home-paths` haben Inhalt | ✗ unfertig (Auflage A3) |
| b | `units/` enthält nur `README.md` | ✗ kein Unit gebaut |
| c | `.github/` (56 Dateien) ist vollständige Kopie (56/56 identisch) | ✗ geringfügig, kein Backend |
| d | Laufzeitartefakte: `website/.bun-cache`, `.bun-tmp`, `target/` | ✗ nicht versionieren (Auflage A6) |
| e | `vendor/` existiert nicht als Ordner; 4 gleichnamige Treffer stammen aus `node_modules` | harmlos |

### r3 — Mapping-Vollständigkeit · **bestanden für die Kernfrage**

Faktenlage (`docs/reference/inventory-source-backend.md` §8):

| Erwartet | Befund in der Vorlage | Konsequenz |
|---|---|---|
| Python-Backend | **existiert nicht.** Python nur als Client-SDK (`python/sdk`, 47 Dateien) | nichts zu übersetzen; SDK wird Spezifikation |
| C++-Backend | **existiert nicht.** Kein C++ im Repo | — |
| C-Backend | **zwei** Programme: `main.c` (298 Z.) + `flock.c` (164 Z.) | beide ersetzt |
| Go-Backend | **existiert nicht** | Go ist Neubau nach Doku-Neigung |
| TS-Backend | ~340 Pakete | größter Anteil |

| Komponente der Vorlage | Zugeordnet zu | Vorhanden? | Urteil |
|---|---|---|---|
| `main.c` (Landlock-Launcher) | `native/landlock-run` | **ja**, 796 Zeilen, 19 Tests | ✓ |
| `flock.c` + `flock.ts` | `native/flock` | **ja**, 1.401 Zeilen, 34 Tests | ✓ |
| `sandbox-windows-acl` | `services/pmh-sandbox` | **ja**, 553 Zeilen, 14 Tests | ✓ (beurteilt, setzt nicht durch — §3.4) |
| `koffi`-Bedarf | `native/atomicfs` | **ja**, 759 Zeilen, 12 Tests | ✓ |
| `node-pty`-Bedarf | `native/pty` | **ja**, 640 Zeilen, 16 Tests | ✓ (Pipes statt PTY — §3.4) |
| `python/sdk` (`api`/`client`/`errors`/`models`) | Go-Dienst-API + `packages/sdk/protocol` | **teilweise** | ~ |
| Startup-Supervisor (Go) | `services/pmh-supervisor` | **unvollständig** | ✗ |
| 10 weitere Go-Dienste | `services/*` | **nicht vorhanden** | ✗ |
| ~300 TS-Pakete | `packages/*` | **Skelett (3 von 331)** | ✗ |

**Ergebnis r3:** Der **C-Anteil ist vollständig** abgebildet (beide C-Programme ersetzt,
Verhalten statt Code), und die **Python-/C++-Frage ist abschließend beantwortet** — es gab
kein Python- oder C++-Backend zu übertragen. `python/sdk` und `vendor/*` sind mit Begründung
ausgelassen (`MAPPING.md` §3.9, §3.10). **Nicht bestanden** ist die Vollständigkeit für Go
und TypeScript — das ist ein Umfangs-, kein Mapping-Fehler: die Zuordnung existiert, die
Umsetzung fehlt.

### r4 — Verhalten und Schnittstellen · **bestanden für Rust**

| Vertrag | Quelle | Prüfung | Urteil |
|---|---|---|---|
| `landlock-run`-CLI | `native/system/docs/cli-contract.md` | Grammatik `--ro`/`--rw`/`--`/`--probe`, Exit 125, Report-Zeilen `landlock: fully enforced` / `partially enforced (older ABI)`, stderr-Präfix `landlock-run: `, keine Env-Eingaben | **wörtlich erhalten** |
| Landlock-Durchsetzung | dieselbe | Syscalls echt implementiert (`libc::SYS_landlock_create_ruleset`, `_add_rule`, `_restrict_self` in `native/landlock-run/src/platform.rs` Z. 199/274/323) | ✓ |
| Fail-closed | `docs/risks.md` | Ohne Landlock (Windows): Exit **125 ohne `exec`**, gemessen | ✓ |
| `flock`-Verhalten | `native/system/docs/flock-contract.md` | 17-Bedingungen-Tabelle als Testliste; fd-Eigentum als Compile-Zeit-Eigenschaft (`BorrowedFd<'_>`) | ✓ (Tests `#![cfg(unix)]`) |
| Ehrlichkeitsanforderung | `docs/concept.md` Regel 3 | `pmh-sandbox` meldet `full`/`partial`/`unusable` mit vollständiger Mängelliste; ein Netzwerk-Wunsch wird nie still als erfüllt gemeldet | ✓ (Urteil), ✗ (Durchsetzung) |
| Prozessgrenze | `docs/stack.md` | Jeder Baustein ist ein Binary mit CLI; **kein** natives Node-Addon im Zielprojekt | ✓ |

**Nicht geprüft (offen):** die Go- und TS-Schnittstellen — es gibt nur eine Go-Dienst-API
(`services/pmh-supervisor/internal/api`) und keine TS-Service-Seam. Eine Verifikation gegen
die Vorlage ist erst nach Auflage A2/A3 möglich.

### r5 — Codequalität, Idiomatik, Kopiefreiheit · **bestanden mit Mängeln**

**Kennzahlen des Rust-Codes** (gemessen mit `cargo test --workspace`):

| Crate | Zeilen | `#[test]` | Ergebnis |
|---|---:|---:|---|
| `native/atomicfs` | 759 | 12 | 12 pass |
| `native/crypto` | 791 | 11 | 11 pass |
| `native/flock` | 1.401 | 34 | 17 pass (12 + 5) |
| `native/index` | 1.002 | 22 | 22 pass |
| `native/landlock-run` | 796 | 19 | 19 pass (18 + 1) |
| `native/pty` | 640 | 16 | 16 pass |
| `services/pmh-sandbox` | 553 | 14 | 14 pass |
| **Summe** | **5.942** | | **110 pass, 0 fail, 0 Warnungen** |

#### 5.1 Kopiefreiheit — Prüfung gegen Python/C++

| Prüfung | Ergebnis |
|---|---|
| Eigener Quellbaum (`packages/`, `services/`, `native/`, `units/`) | **0** `.py`, `.c`, `.cpp`, `.h` — ausschließlich `.rs`, `.go`, `.ts`, `.toml`, `.json`, `.md` |
| Python-/C++-Dateien im **gesamten** Zielprojekt | **15** — davon **0** eigene: 3 in `.github/` (Kopie), 12 unter `apps/desktop/` (Kopie) |
| C-typische Muster in `*.rs` (`printf`, `malloc(`, `napi_`, `#include`) | **0 Treffer** |
| Python-typische Muster in `*.rs` | 2 Treffer in `native/index/src/lib.rs` Z. 722/725 — **Testeingabe** des Symbol-Extraktors, kein Python-Code |
| Was übernommen wurde | ausschließlich **Verhaltensvorgaben**: CLI-Grammatik, Exit-Codes, Report-Zeichenketten, Fehlerfeldnamen, ABI-Zahlen |

> **Korrektur zu `docs/reference/review-backend.md` §5.2.** Dort stehen „**4 Dateien, alle
> byte-identisch**" als vollständige Liste. Tatsächlich sind es **15**, weil die Suche nur
> `.py`/`.c` und den eigenen Quellbaum betraf. Die zusätzlichen Treffer liegen **alle** in
> kopierten Bereichen (`apps/desktop/installer/*.h`, `*.cpp`, `apps/desktop/tests/*.cpp`,
> `.github/review-ownership/*.py`) und ändern das Ergebnis **nicht**: der eigene Code ist
> kopiefrei. Die Zahl war zu niedrig, die Aussage bleibt.

#### 5.2 Idiomatik — Positivbeispiele

1. **Der Vertrag wird zum Typ.** `flock` nimmt `BorrowedFd<'_>` statt eines rohen `i32`;
   die Vertragsregel „die Bindung öffnet, dupliziert, schließt oder entsperrt es nie" ist
   damit eine Compile-Zeit-Eigenschaft. Der rohe fd existiert nur hinter `unsafe fn
   borrow_raw` mit dokumentierter Sicherheitsanforderung.
2. **Fehler sind JSON mit stabilen Feldnamen** (`code`, `errno`, `syscall`, plus
   `contention`), damit der TS-Aufrufer dasselbe Fehlerobjekt bauen kann wie die Vorlage.
3. **`--probe` ist eine Funktionsprüfung, keine Versionsabfrage** — begründet im Code:
   ein `--version`-Check würde einen Kernel übersehen, der die Syscalls hat, aber die
   Durchsetzung verweigert.
4. **Die `unsafe`-Fläche ist klein und begründet** (26 Vorkommen, jede mit
   `// SAFETY:`-Begründung).
5. **Grenzen stehen im Code und sind getestet** — `pmh-index` pinnt die lexikalische
   Grenze seines Extraktors mit einem Test.

#### 5.3 Mängel

| # | Mangel | Schwere | Ort |
|---|---|---|---|
| a | **`pmh-pty` benutzt kein PTY.** `main.rs` startet das Kind mit `Stdio::piped()` (Z. 51–53); kein `openpty`, kein `CreatePseudoConsole`. `resize` wird verfolgt, aber nicht angewendet. **`implementation()` liefert trotzdem fest `"conpty"`** (Z. 334–340) | **hoch** | `native/pty` |
| b | **`pmh-sandbox` setzt nicht durch.** `main.rs` kennt nur `probe` und `assess`; Windows-ACL wird nirgends angewendet | **hoch** | `services/pmh-sandbox` |
| c | 6 der 7 Rust-Binaries haben **keinen TypeScript-Aufrufer**. Nur `pmh-atomicfs` wird aus `packages/util/atomic-write/src/index.ts` gerufen | **hoch** | `native/*` |
| d | `pmh-index` Digest ist **FNV-1a**, nicht kryptografisch — dokumentiert, aber das Feld heißt `digest` | mittel | `native/index` |
| e | `pmh-crypto` hat **kein AEAD und keine KDF** — bewusst, aber es heißt „crypto" | mittel | `native/crypto` |
| f | Kein Absturztest für die atomicfs-Garantien 2/3 | mittel | `native/atomicfs` |
| g | Die 19 flock-Vertragstests sind auf diesem Windows-Host **nicht ausgeführt** (`#![cfg(unix)]`) | niedrig | `native/flock/tests/contract.rs` |
| h | Keine Plattformpakete (`native/*/packages/<triple>/`) und kein Release-Skript | niedrig | `native/*` |

### r6 — Build- und Testergebnisse · **Rust ✓ · TS ✓ · Go ✗**

Web-Builds wurden auftragsgemäß **nicht** ausgeführt und nicht gewertet.

| Sprache | Befehl | Ergebnis |
|---|---|---|
| **Rust** | `cargo test --workspace` | **110 passed, 0 failed, 0 Warnungen, 0 Fehler** |
| **Go** | `go build -buildvcs=false ./...` | **exit 0** |
| **Go** | `go vet ./...` | **1 Meldung:** `internal/supervisor/supervisor_test.go:106: misuse of unbuffered os.Signal channel as argument to signal.Notify` |
| **Go** | `go test ./internal/supervisor/ -v` | **13 pass, 2 fail, 1 skip** — `TestShutdownReverseOrder` (Abschaltfrist überschritten), `TestSingleRestartStartetNeu` (PID blieb gleich → kein Neustart) |
| **Go** | `go test ./internal/api ./internal/config` | **ok** |
| **TS** | `bun test` (laut `docs/reference/review-backend.md` §6.3) | 54 grün, 0 rot — **nicht erneut ausgeführt** |
| **TS** | `bun run typecheck` | 4/4 exit 0 — **nicht erneut ausgeführt** |

> **Zwei Korrekturen an der gemeldeten Zahlenlage.** (1) `go vet` ist **nicht** grün,
> sondern meldet einen Fehler in einer Testdatei. (2) Die Zahl der roten Go-Tests ist
> **2**, nicht 5 — und die `-buildvcs=false`-Notwendigkeit ist begründet: das `.git` des
> Zielprojekts ist defekt, Go scheitert sonst am VCS-Stamping.

### r7 — Prüfbericht · diese Datei

## 3. Freigabeempfehlung

> ## **FREIGABE MIT AUFLAGEN**
>
> Die **Architektur** ist freigegeben: die Prozessgrenze ist korrekt gezogen, die
> Rust-Sprachgrenze ist vollständig, verifiziert und kopiefrei, und die Verträge der Vorlage
> sind wörtlich erhalten. Der **Umfang** ist es nicht: zwei der vier Zielsprachen haben noch
> keinen lauffähigen Code, und im Zielprojekt liegt eine Kopie des Referenz-Forks, die der
> Projektregel widerspricht.

### Auflagen nach Priorität

| # | Auflage | Begründung |
|---|---|---|
| **A1** | `apps/cli`, `apps/desktop`, `apps/desktop-host` auf ein Skelett zurückführen (oder die Kopie bewusst als Entscheidung dokumentieren) | 1.043 byte-identische Dateien widersprechen `docs/concept.md`; sie erzeugen die Doppelpflege, die das Projekt vermeiden will. **Nicht löschen** — `apps/cli` ist der vorgesehene TS-Host; vorher `.gitignore` anlegen, `.git` ist defekt |
| **A2** | Go-Dienste fertigstellen (10 von 11 fehlen) und `go vet`/`build`/`test` je Dienst belegen | Go ist eine der vier geforderten Zielsprachen; `pmh-supervisor` ist die dokumentierte erste Aufgabe |
| **A3** | Bun/TS7-Pakete fertigstellen (328 von 331 Blattordnern leer) und `tsgo --noEmit` + `bun test` belegen | der TS-Core ist der Kernel; ohne ihn lädt kein Unit |
| **A4** | `pmh-pty`: `implementation` ehrlich melden — bis ein echtes PTY existiert nicht `conpty`/`openpty`, sondern den tatsächlichen Zustand | die Meldung verspricht mehr, als der Code hält |
| **A5** | `pmh-sandbox` an `native/landlock-run` anbinden, damit `assess` nicht nur beurteilt, sondern durchsetzt | sonst ist die Doku-Vorgabe „Sandbox" nur zur Hälfte erfüllt |
| **A6** | Laufzeitartefakte ausschließen (`website/.bun-cache`, `.bun-tmp`, `target/`) und `.gitignore` anlegen | es gibt **keine** `.gitignore`; Caches und Buildartefakte würden sonst versioniert |
| **A7** | Die 6 Rust-Binaries ohne TS-Aufrufer anbinden oder ihren Status dokumentieren | eine Prozessgrenze ohne Aufrufer ist keine Grenze |
| **A8** | `docs/review/ABSCHLUSS-MELDUNG.txt` Z. 17 korrigieren („A1 … erledigt" ist falsch) | ein Prüfvermerk darf keinen erledigten Zustand behaupten, der nicht besteht |

### Risiken

| # | Risiko | Schwere | Anmerkung |
|---|---|---|---|
| R1 | Landlock-Syscall-Semantik und die flock-Verhaltenstabelle sind **nur auf POSIX** ausführbar und hier **unbelegt** | **hoch** | Der Code kompiliert und ist getestet; die Syscall-Semantik braucht einen CI-Lauf auf Linux |
| R2 | **Kein Versionskontrollzustand**: `.git` ist defekt, `.gitignore` fehlt | **hoch** | Jede Bereinigung (A1/A6) ist unumkehrbar |
| R3 | Eine WDAC/Device-Guard-Richtlinie blockierte im Prüflauf `target\debug\pmh-sandbox.exe` (exit 4551); der Release-Build lief | mittel | Betrifft alle unsignierten Binaries; für den Dauerbetrieb Signierung oder Pfadfreigabe prüfen |
| R4 | 6 von 7 Rust-Binaries sind **toter Code**, solange kein TS-Aufrufer existiert | mittel | Sie binden Wartung, ohne Wirkung zu entfalten |

### Was ausdrücklich gut ist

1. **Die Verträge sind wörtlich erhalten, wo die Vorlage sie festschreibt** — die
   `landlock-run`-Report-Zeilen und Exit-Codes zeichengetreu, das Fail-closed-Verhalten
   gemessen (Kind wurde **nicht** ausgeführt).
2. **Fail-closed ist verifiziert**, nicht nur behauptet.
3. **Die Ehrlichkeitsanforderung ist übernommen** — `pmh-sandbox` listet jede nicht
   durchsetzbare Anforderung einzeln auf; `pmh-index` meldet jede nicht lesbare Datei und
   setzt bei abgeschnittenem Lauf Exit 1.
4. **Das Mapping ist entscheidungsfähig** — `MAPPING.md` unterscheidet fünf Stufen und
   begründet jede Auslassung; 43 experimentelle Pakete, die UI-Pakete und die 388 Skripte
   sind mit Begründung ausgelassen, nicht vergessen.
5. **Rust ist vollständig grün und kopiefrei** — 110 Tests, 0 Warnungen, kein Python- oder
   C++-Code übernommen.

---

## 4. Nachweis der Prüfmethodik

| Prüfung | Werkzeug |
|---|---|
| Byte-Identität `apps/` gegen Vorlage | `Get-FileHash -Algorithm SHA256` je Datei, 1.099 Dateien verglichen |
| Rust-Tests | `cargo test --workspace` (7 Crates, 110 Tests) |
| Go | `go vet ./...`, `go build -buildvcs=false ./...`, `go test ./... -v` |
| Paketumfang | `Get-ChildItem -Directory` über `packages/*/*`, Zählung leerer Blätter |
| Kopiefreiheit | `Get-ChildItem -Include *.py,*.c,*.cpp,*.h` + Muster-Suche in `*.rs` |
| Referenzsuche | `Select-String` über alle Konfigurations- und Skriptdateien |
| Doku-Ausschluss | `Get-ChildItem -Recurse -File` mit Ausschlussfilter auf `docs\dsh` und `docs\design` |

**Nicht geprüft:** Web (auftragsgemäß ausgenommen), der TS-Typecheck und `bun test`
(Ergebnisse aus `docs/reference/review-backend.md` §6.3 übernommen, nicht erneut
ausgeführt), die Linux-Seite der Rust-Tests, Bildauswertung.
