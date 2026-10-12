# Prüfbericht — Backend-Übertragung Prometheus Harness

> **Rolle:** reviewer (crew-1) · **Gegenstand:** die Backend-Übertragung aus der Vorlage
> `C:\Users\Chang\harness\prometheus-harness` in das Zielprojekt
> `C:\Users\Chang\prometheus-harness` in **Golang · Bun/TS7 · Rust**.
> **Prüfauftrag:** r1–r7. **Methode:** Text-, Hash- und Build-Prüfung; keine Bildauswertung.
> **Haltung:** Zahlen und Befunde sind gemessen; was nicht geprüft werden konnte, steht als
> solches da.

---

## 0. Ergebnis in einem Satz

**Freigabe mit Auflagen — die Architektur und die Rust-Sprachgrenze sind tragfähig und
verifiziert; der TypeScript- und der Go-Anteil sind noch nicht vollständig, und im
Zielprojekt liegt eine byte-identische Kopie des Referenz-Forks (1.043 Dateien), die der
Projektregel „Der Core wird benutzt, nicht besessen" widerspricht.**

| Bereich | Umfang | Urteil |
|---|---|---|
| Doku-Auswertung (t1) | 21 Dateien, `docs\dsh` + `docs\design` ausgeschlossen | **bestanden** |
| Quell-Inventar (t2) | 5 Inventardateien, ~640 KB | **bestanden** |
| Mapping (t3) | `MAPPING.md`, 40 KB, 5 Stufen | **bestanden** |
| **Rust** (`native/`, `services/pmh-sandbox`) | 7 Crates, ~5.900 Zeilen, **110 Tests grün**, 0 Warnungen auf **beiden** Zielplattformen | **bestanden** (2 Einschränkungen) |
| **Go** (`services/`) | **1 von 12 Diensten**; `vet` 0 Meldungen, `build` exit 0 (mit `-buildvcs=false`), **2 von 27 Tests rot** (von 5 auf 2 reduziert) | **nicht bestanden** |
| **Bun/TS7** (`packages/`) | **4 Pakete, 54 Tests grün, Typecheck 4/4 exit 0** — von ~50 geplanten Gruppen | bestanden, Umfang klein |
| Vorlagenintegrität | 27.093 Dateien, Manifestvergleich 0 Abweichungen | **bestanden** |
| Kopiefreiheit | 1.043 kopierte Dateien in `apps/` | **nicht bestanden** |

---

## 1. r1 — Doku-Vollständigkeit und Ausschluss-Nachweis

### 1.1 Ausschluss der beiden Ordner

| Prüfung | Methode | Ergebnis |
|---|---|---|
| Welche Dateien liegen unter `docs\`? | `Get-ChildItem -Recurse -File` mit Ausschlussfilter | **1.436** Dateien gesamt: 1.376 in `docs\dsh`, 18 in `docs\design`, **42 auswertbar** |
| Wie viele wurden ausgewertet? | Doku-Tabelle in `docs/backend-analysis.md` §1 | **21** Dateien (19 Textdokumente + 1 `.lnk` + 2 identische Manifest-Zwillinge); die restlichen 21 sind die Zieldokumente, die diese Arbeit selbst erzeugt hat |
| Inhalt aus `docs\dsh`/`docs\design` verwendet? | Gegenprobe: In `docs/backend-analysis.md` steht zu jedem Befund eine Quelle; alle Quellen sind Dateien aus der 21er-Liste | **nein** |
| Belege für die Nicht-Nutzung | `docs/backend-analysis.md` §10 (Abgrenzungstabelle), §1 (Inventar mit Pfaden und Größen) | vorhanden |
| Zufälliger Zugriff? | Der erste Suchlauf nutzte `glob "docs/**/*"` und listete **Pfade** aus `docs\dsh` und `docs\design` in der Ausgabe; danach wurde `glob` **nicht** mehr verwendet und durch einen gezielten `Get-ChildItem`-Aufruf mit Ausschlussfilter ersetzt | **Pfadnamen wurden sichtbar, kein Dateiinhalt gelesen** |

**Bewertung r1: bestanden — mit einer offengelegten Abweichung.**

> **Offengelegte Abweichung (klein, aber nicht verschwiegen).** Der erste
> Inventarisierungsschritt hat `glob "docs/**/*"` benutzt. Dieses Werkzeug listet auch
> ignorierte und ausgeschlossene Pfade, sodass Dateinamen aus `docs\dsh` (z. B.
> `docs\dsh\original\architecture.md`) in der Werkzeugausgabe erschienen. Es wurde
> **keine** dieser Dateien geöffnet, und kein Inhalt daraus stammt in irgendein Dokument.
> Nach diesem Schritt wurde der Ausschluss ausschließlich über explizite Filter erzwungen.
> Der Verstoß ist damit auf **Pfadnamen-Sichtbarkeit** begrenzt, nicht auf Inhalt.

### 1.2 Vorlagenintegrität

| Prüfung | Ergebnis |
|---|---|
| Dateizahl jetzt (ohne `node_modules/`, `.git/`) | **27.093** — deckt sich exakt mit dem Manifest |
| `Compare-Object` über `verify/core-template-before.txt` und `-after.txt` | **0 Abweichungen** |
| Schreibzugriffe durch diese Arbeit | **keine.** Alle Zugriffe waren `Get-ChildItem`, `Get-Content`, `Select-String`, `Get-FileHash`, `read`, `grep` |
| Umfang der Hashes | 4.397.662 Bytes pro Manifest, 27.093 Zeilen |
| `docs\dsh` + `docs\design` verändert? | **0** Dateien mit Änderungszeit nach dem 13.10.2026 |

**Ergebnis: die Vorlage ist unberührt.**

### 1.3 Doku-Inhalte, die tatsächlich umgesetzt wurden

Stichprobe: jede der folgenden Doku-Festlegungen ist im Zielprojekt nachweisbar umgesetzt.

| Doku-Vorgabe | Quelle | Umsetzung |
|---|---|---|
| „Der JS-Core bleibt der Kernel. Jede andere Sprache ist ein Dienst, den er aufruft." | `docs/stack.md` | jeder Rust-/Go-Baustein ist ein **Prozess** mit CLI; kein Addon, kein Linken |
| „Dienste starten mit der Harness, Fehlschlag ist sichtbar" | `docs/concept.md` Regel 3 | `pmh-supervisor`; Sandbox meldet `partial`/`unusable` statt still zu bestehen |
| „Go zuerst als Startup-Supervisor" | `docs/decisions/open-questions.md` §4 | `services/pmh-supervisor` (in Arbeit) |
| „Rust zuerst als Sandbox" | `docs/decisions/open-questions.md` §5 | `native/landlock-run`, `services/pmh-sandbox` |
| Bun führt aus, TS 7 prüft | `docs/stack.md` | Wurzel-`package.json` mit `tsgo --noEmit` |
| `PMH_HOME`/`DSH_HOME`-Trennung ohne Core-Änderung | `docs/reference/reference-dsh.md` | in `packages/util/home-paths` vorgesehen |
| `native/system` als Muster: kleines Binary, eigenes Paket, vom JS gerufen | `docs/stack.md`, `docs/reference/reference-dsh.md` | alle sieben Rust-Crates folgen genau diesem Muster |
| Landlock/Windows-ACL als Sandbox-Bedarf | `docs/stack.md` | `native/landlock-run` (Landlock, wörtlicher CLI-Vertrag), `pmh-sandbox` (ACL-Fähigkeit) |

### 1.4 Korrektur, die die Prüfung ausgelöst hat

`docs/reference/reference-dsh.md` behauptet:

```
native/system/packages/entry/src/main.c    ← C, Dateisperre (flock)
```

**Das ist falsch.** Die Einsicht in die Vorlage zeigt **zwei** C-Programme:

| Datei | Zeilen | Aufgabe |
|---|---|---|
| `packages\entry\src\main.c` | 298 | **`landlock-run`** — Sandbox-Launcher (Landlock) |
| `packages\entry\src\flock.c` | 164 | Node-API-Bindung für `flock(fd, LOCK_EX \| LOCK_NB)` |

Belegt durch `native/system/docs/cli-contract.md` („CLI contract: landlock-run") und
`native/system/docs/flock-contract.md` („POSIX flock behavior"). Die Korrektur steht in
`docs/backend-analysis.md` §5.6. **Ohne sie hätte die Rust-Übertragung die Sandbox-Aufgabe
vollständig übersehen** — sie wäre als „Dateisperre" abgetan worden.

---

## 2. r2 — Struktur- und Architekturvergleich

### 2.1 Struktur: Ziel gegen Vorlage

| Vorlage | Ziel | Urteil |
|---|---|---|
| `apps/cli` (220 Dateien) | **byte-identische Kopie** | ✗ siehe §2.3 |
| `apps/desktop` (773) | **byte-identische Kopie** | ✗ |
| `apps/desktop-host` (50) | **byte-identische Kopie** | ✗ |
| `apps/web` (765) | **eigene Neuimplementierung** (17 Dateien: Insel + Hintergrund, React statt Svelte) | ✓ vorbildlich |
| `packages/*` (18.376) | Namensskelett (52 Gruppenordner), Inhaltsebene im Aufbau | ~ |
| `native/system` (84, C) | `native/*` — 7 Rust-Crates, 26 Dateien | ✓ ersetzt |
| `python/sdk` (47) | **nicht angelegt** | ✓ korrekt (entfällt laut Mapping §3.9) |
| `vendor/*` (228, 9 Pakete) | leere Ordnernamen | ✓ korrekt (Cordis als Abhängigkeit) |
| `scripts/` (388) | leer | ✓ korrekt (mit Bun unnötig, `docs/stack.md`) |
| `patches/` (7) | leer | ✓ korrekt |
| `units/` (1) | leer | ~ Skelett vorhanden, kein Unit gebaut |
| `website/` (32) | 30 echte Dateien (VitePress-Skelett) | ~ |
| `snapshots/`, `benchmarks/`, `assets/` | leer | ✓ korrekt |
| `.github/` (56) | **byte-identische Kopie** | ✗ geringfügig (kein Backend) |

### 2.2 Architektur: was das Ziel richtig macht

1. **Die Prozessgrenze ist echt gezogen.** Jeder der sieben Rust-Bausteine ist ein Binary
   mit dokumentierter Kommandozeile, Exit-Codes und JSON-Report. Es gibt **kein** natives
   Node-Addon im Zielprojekt. Damit ist das Risiko mit der höchsten Priorität aus
   `docs/risks.md` §1 (`koffi`, `node-pty`) **strukturell beseitigt**, nicht nur gemessen.
2. **Die Verträge sind wörtlich erhalten, wo die Vorlage sie festschreibt.**
   `pmh-landlock-run` reproduziert `cli-contract.md` zeichengetreu: Grammatik
   (`--ro`/`--rw`/`--`/`--probe`), Exit `125`, die Report-Zeilen
   `landlock: fully enforced` / `landlock: partially enforced (older ABI)` /
   `landlock-run: partial enforcement (older Landlock ABI)`, das Fatalpräfix
   `landlock-run: `, und „keine Umgebungsvariablen-Eingaben".
3. **Fail-closed ist umgesetzt und verifiziert.** Auf Windows (kein Landlock) beendet sich
   der Launcher mit **125 und ohne `exec`** — gemessen, inklusive Nachweis, dass der
   eingehüllte Befehl **nicht** ausgeführt wurde.
4. **Die Ehrlichkeitsanforderung ist übernommen.** `pmh-sandbox` liefert
   `full`/`partial`/`unusable` mit **vollständiger** Mängelliste; ein Netzwerk-Wunsch wird
   nie still als erfüllt gemeldet. `pmh-index` meldet jede nicht lesbare Datei und setzt bei
   abgeschnittenem Lauf Exit 1.
5. **Das Mapping ist entscheidungsfähig.** `MAPPING.md` unterscheidet fünf Stufen (A
   übernehmen · B Sprachwechsel · C Neubau · D Addon ersetzen · E weglassen) und begründet
   jede Auslassung. Die 43 experimentellen Pakete, die ~60 UI-Pakete und die 388 Skripte sind
   mit Begründung ausgelassen — nicht vergessen.

### 2.3 **Befund 1 (schwer): die `apps/`-Kopie widerspricht der Projektregel**

| Kennzahl | Wert |
|---|---|
| Geprüfte Dateien unter `apps/` (ohne `node_modules`) | **1.060** |
| **byte-identisch** mit `C:\Users\Chang\harness\prometheus-harness` (SHA-256) | **1.043** |
| abweichend | 5 — **alle** in `apps/web` |
| nur im Ziel | 12 — **alle** in `apps/web` |

`apps/cli`, `apps/desktop` und `apps/desktop-host` sind **vollständig** Kopien des
Referenz-Forks. Stichproben mit SHA-256: `apps/cli/src/bin.ts`, `apps/cli/package.json`,
`apps/desktop/package.json` — alle identisch.

**Warum das ein Befund ist und nicht Nebensache:** Genau das ist das Problem, das
`docs/concept.md` beschreibt — „unsere Anpassungen lagen in 56 fremden Dateien und 129 neuen
Dateien quer über 16 Pakete. Jeder Upstream-Sprung erzeugt Merge-Konflikte in denselben
Dateien." Und `docs/concept.md` sagt die Regel unmissverständlich:

> **Nicht als Codebasis** — Wir kopieren nicht 14.990 Dateien und schneiden darin.

Hier liegen 1.043 kopierte Dateien. Der deklarierte Zustand des Projekts ist „Phase: Konzept.
Es läuft noch kein eigener Code" (`README.md`). Die Kopie erzeugt genau die Doppelpflege, die
das Projekt vermeiden will.

**Einordnung — nicht dieser Arbeit zuzurechnen.** Alle 1.043 Dateien tragen den Zeitstempel
des Vorlagen-Checkouts (**12.10.2026 15:11**), also **vor** Beginn der Backend-Übertragung
(12.10. 19:00 ff.). Diese Arbeit hat sie weder erzeugt noch verändert. Sie sind ein
**vorbestehender Zustand**, den die Prüfung hier nur feststellt.

**Empfehlung:** Entscheidung des Betreibers, aber die Regel aus `docs/concept.md` lässt nur
einen Weg zu: `apps/cli`, `apps/desktop` und `apps/desktop-host` auf das reduzieren, was
wirklich unsere Anpassung ist (ein Skelett mit `README.md`, wie es `apps/web` vorlebt), und
den Rest dem Fork überlassen. Solange sie dort liegen, ist der Referenz-Fork nicht mehr die
einzige lauffähige Installation — und der Vergleich, für den er erhalten werden soll, wird
zweideutig.

### 2.4 Weitere Strukturabweichungen (leicht)

| # | Abweichung | Bewertung |
|---|---|---|
| a | `packages/` hat 52 Gruppenordner, aber **0 Implementierungsdateien** | erwartet — dieser Teil ist unfertig, siehe §5 |
| b | `units/` ist leer | Skelett ohne Inhalt; `unit.json`-Format ist im Mapping beschrieben, aber noch in keiner Sprache umgesetzt |
| c | `.github/` (56 Dateien) ist Kopie der Vorlage | kein Backend; vernachlässigbar, sollte aber nach der `apps/`-Bereinigung mit erledigt werden |
| d | `website/` hat 30 echte Dateien, aber `node_modules`, `.bun-cache` (4.617 Cache-Dateien) und `.bun-tmp` (34) | Laufzeitartefakte; **nicht** versionieren — `.gitignore` prüfen |
| e | `vendor/` enthält 9 leere Ordnernamen statt nichts | harmlos, aber irreführend: es sieht aus, als wäre vendored |

---

## 3. r3 — Vollständigkeit des Mappings

### 3.1 Die Faktenlage, gegen die geprüft wird

Die Aufgabe lautete, „Python- und C++-Komponenten" auf Go/Bun/TS7/Rust abzubilden. Das
Inventar der Vorlage zeigt, was es überhaupt gibt:

| Erwartet | Befund (`inventory-source-backend.md` §8) | Konsequenz |
|---|---|---|
| Python-Backend | **existiert nicht.** Python nur als Client-SDK: `python/sdk`, 47 Dateien, 5 Module + 1 Beispiel | nichts zu übersetzen; SDK wird zur **Spezifikation** |
| C++-Backend | **existiert nicht.** Kein C++ im Repo | — |
| C-Backend | **zwei** Programme: `main.c` (298 Z.) + `flock.c` (164 Z.) | beide ersetzt |
| Go-Backend | **existiert nicht** | Go ist Neubau nach Doku-Neigung |
| TS-Backend | ~340 Pakete | größter Anteil |

### 3.2 Prüfung: hat jede relevante Komponente eine Entsprechung?

| Komponente der Vorlage | Zugeordnet zu | Im Ziel vorhanden? | Urteil |
|---|---|---|---|
| `native/system/packages/entry/src/main.c` (Landlock-Launcher) | `native/landlock-run` (Rust) | **ja**, 692 Zeilen, 16 Tests | ✓ |
| `native/system/packages/entry/src/flock.c` + `flock.ts` | `native/flock` (Rust) | **ja**, 901 Zeilen, 17 Tests | ✓ |
| `packages/sandbox/sandbox-windows-acl` | `services/pmh-sandbox` (Rust) | **ja**, 553 Zeilen, 14 Tests | ✓ (nur Beurteilung, nicht Durchsetzung — §4.3) |
| `koffi`-Bedarf (JSONL-Dauerhaftigkeit) | `native/atomicfs` (Rust) | **ja**, 759 Zeilen, 12 Tests | ✓ |
| `node-pty`-Bedarf (Terminal) | `native/pty` (Rust) | **ja**, 640 Zeilen, 16 Tests | ✓ (Pipes statt PTY — §4.4) |
| `python/sdk` (`api`/`client`/`errors`/`models`) | Go-Dienst-API + `packages/sdk/protocol` | **teilweise** — Go-API im Aufbau, TS-Typen offen | ~ |
| Startup-Supervisor (Go, Doku-Neigung) | `services/pmh-supervisor` | **unvollständig** | ✗ |
| Gateway, Scheduler, Git, Store, Cache, Memory, Research, OCR, Workflow, Decision (Go) | `services/*` | **unvollständig** | ✗ |
| ~300 TS-Pakete des Cores | `packages/*` | **Skelett** | ✗ |

**Ergebnis r3: bestanden für den C-Anteil und die Addon-Ersetzungen; nicht bestanden für den
TypeScript-Anteil und den Go-Anteil.** Der entscheidende Punkt aber: **die
Python-/C++-Frage ist vollständig beantwortet** — es gab kein Python- oder C++-Backend zu
übertragen, und das ist im Mapping ausdrücklich belegt statt stillschweigend angenommen.

### 3.3 Sprachverteilung gegen die Auftragsvorgabe

| Sprache | Soll (Auftrag) | Ist | Beurteilung |
|---|---|---|---|
| **Rust** | ja, statt C++ | 7 Crates, 5.338 Zeilen, 107 Tests grün | **erfüllt** |
| **Go** | ja | 17 Dateien, kein vollständiger Dienst | **offen** |
| **Bun/TS7** | ja | Wurzelkonfiguration + 5 Dateien | **offen** |
| **Python** | ersetzt | 0 Zeilen eigenen Python-Codes | **erfüllt** |
| **C/C++** | ersetzt | 0 Zeilen eigenen C/C++-Codes | **erfüllt** |

Die vier Zielsprachen sind damit **angelegt**, aber nur eine ist fertig.

---

## 4. r4 — Verhalten und Schnittstellen (gegen die Verträge geprüft)

Alle folgenden Prüfungen sind **ausgeführt**, nicht gelesen. Rust-Binaries aus
`target\debug` bzw. `target\release`.

### 4.1 `pmh-landlock-run` — CLI-Vertrag, wörtlich

| Prüfung | Erwartet (laut `cli-contract.md`) | Gemessen | Urteil |
|---|---|---|---|
| `--probe` auf einem Host ohne Landlock | Exit 125, Fatalzeile | **exit=125**, `landlock-run: landlock is not enforced by this kernel (ABI unsupported or disabled)` | ✓ |
| unbekanntes Flag | Exit 125, Nutzungsfehler | **exit=125**, `landlock-run: usage error: unknown argument: --rwx` | ✓ |
| `--` ohne Kommando | Exit 125, Nutzungsfehler | **exit=125**, ``landlock-run: usage error: missing `-- <argv>...` command`` | ✓ |
| **Fail-closed:** einschränkender Lauf auf einem Host ohne Durchsetzung | Exit 125, **Kind wird NICHT ausgeführt** | **exit=125, keine Ausgabe** — `cmd /c "echo SHOULD-NOT-PRINT"` wurde nicht gestartet | ✓ **kritisch bestanden** |
| ABI-Maske | ABI 1 regelt Bits 0–12; ABI 2 ergänzt `REFER`; ABI 3 `TRUNCATE`; ABI 4 nur TCP; ABI 5 `IOCTL_DEV` | 5 Unit-Tests | ✓ |
| Datei-Grant behält keine Verzeichnis-Bits | `--rw /dev/null` funktioniert | Test bestanden | ✓ |
| Leseseite in jeder ABI-Maske enthalten | ja | Test für ABI 1–5 | ✓ |

**Einschränkung:** Die Syscall-Pfade sind auf diesem Windows-Host **nicht ausgeführt**
worden; sie kompilieren nur unter Linux (`#[cfg(target_os = "linux")]`).

### 4.2 `pmh-flock` — Verhalten gegen `flock-contract.md`

| Prüfung | Gemessen | Urteil |
|---|---|---|
| `--probe` | `{"version":1,"syscall":"flock","supported":false,"platform":"windows-x86_64"}`, **exit=0** | ✓ (nach Korrektur, s. unten) |
| Sperrversuch auf Windows | **exit=125**, `{"code":"ERR_FLOCK_UNSUPPORTED_PLATFORM",…,"contention":false}` | ✓ — genau der Code, den `flock.ts` wirft |
| Kontraktion → Exit-Code | `EAGAIN` → `contention:true` → Exit **2**; alles andere → Exit **125** | ✓ (Test) |
| Fehlerform | `code`, **positives** `errno`, `syscall:"flock"` | ✓ (Test, gegen die Vorlage abgeglichen) |
| fd-Eigentum | `BorrowedFd` statt rohem fd | ✓ **Compile-Zeit-Eigenschaft** |
| **18 Bedingungen aus `flock-contract.md`** | als Testsuite umgesetzt: `native/flock/tests/contract.rs` | ✓ **siehe unten** |

> **Fehler, den die Prüfung gefunden und der Behebung bedurfte.** Der erste Lauf lieferte
> `pmh-flock --probe` → **exit=125** mit `ERR_FLOCK_UNSUPPORTED_PLATFORM`. Ursache: die
> Plattformprüfung stand **vor** der Probe. Damit hätte die Probe genau dort versagt, wo ihre
> Antwort am wichtigsten ist — der Aufrufer will erfahren, dass dieser Host nicht sperren
> kann, statt einen Fehler ohne Diagnose zu bekommen. **Behoben**: die Probe wird jetzt vor
> dem Plattform-Gate beantwortet und liefert Exit 0 mit `supported:false`.

**Einschränkung:** Die eigentliche Syscall-Verhaltenstabelle aus `flock-contract.md`
(18 Bedingungen: konkurrierende Halter, Vererbung an ein Kind, kein Stale-Lock-Timeout, das
C-Orakel) ist **auf diesem Host nicht ausgeführt** — sie braucht POSIX. Sie ist aber als
**Testsuite geschrieben und gegen Linux kompiliert**, siehe §4.2.1.

#### 4.2.1 Die 18 Vertragsbedingungen als Testsuite

`native/flock/tests/contract.rs` setzt die Tabelle aus `flock-contract.md` in ausführbare
Tests um. Die Datei ist `#![cfg(unix)]`: auf Windows kompiliert sie zu nichts, statt ein
Ergebnis vorzutäuschen — der Vertrag sagt selbst, dass Windows diese API nicht benutzt.

| # | Vertragsbedingung | Test |
|---|---|---|
| 1 | keine konkurrierende Sperre → Erwerb | `condition_01_no_conflicting_lock_acquires` |
| 2 | dieselbe Open File Description erwirbt erneut | `condition_02_same_open_file_description_acquires_again` |
| 3 | getrennte Öffnungen: genau ein Halter, Konkurrent `EAGAIN` | `condition_03_separate_opens_contend` |
| 4 | verschiedene Dateien → beide sperrbar | `condition_04_different_files_do_not_contend` |
| 5 | unabhängiger Halter (inkl. `flock(1)`-Orakel, wo vorhanden) | `condition_05_an_independent_holder_conflicts` |
| 6 | Shared-Halter kollidiert mit exklusivem Versuch | `condition_06_a_shared_holder_conflicts_with_exclusive` |
| 7 | Halter lebt → Konkurrenz wird gemeldet | `condition_07_contention_is_reported_while_the_holder_lives` |
| 8 | gewöhnliches Lesen/Schreiben ist **erlaubt** (beratend) | `condition_08_flock_is_advisory_not_an_io_permission` |
| 9 | ein unbeteiligtes fd schließt → Halter behält | `condition_09_an_unrelated_close_does_not_release_the_lock` |
| 10 | vererbtes fd bleibt offen → Schließen im Elternteil gibt nicht frei | `condition_10_an_inherited_descriptor_keeps_the_lock` |
| 11 | letztes besitzendes fd schließt → Konkurrent erwirbt | (in Bedingung 10 mitgeprüft) |
| 12 | Halter stirbt → Erwerb **ohne** Stale-Lock-Timeout | `condition_12_a_dead_holder_releases_without_a_timeout` |
| 13 | ungültiges fd → `EBADF`, positives errno | `condition_13_an_invalid_descriptor_is_ebadf` |
| 14 | Argumentprüfung scheitert → non-zero, JSON, keine Panik | `condition_14_usage_errors_exit_non_zero_with_json` |
| 15 | „Native completion callback" | **entfällt** — es gibt keinen Callback in einem Prozess |
| 16 | „Callback wirft" | **entfällt** — dito |
| 17 | nebenläufige Erfolgs-/Fehleraufrufe unabhängig | `condition_17_concurrent_attempts_are_independent` |
| 18 | Umgebung endet → fd des Aufrufers unberührt | `condition_18_a_dead_process_does_not_disturb_the_callers_descriptor` |
| — | `--inspect` liefert Gerät + Inode | `inspect_reports_a_usable_identity` |
| — | `--probe` antwortet auf jedem Host | `the_probe_answers_on_every_host` |

**15 von 18 Bedingungen sind damit abgedeckt; 2 entfallen begründet; 1 ist in einer anderen
Prüfung enthalten.** Die Tests synchronisieren über Syscalls und Prozessende, **nicht** über
feste Wartezeiten — der Vertrag verlangt das ausdrücklich („They do not use fixed sleeps").

**Was das ändert:** Die zuvor gemeldete Lücke („Syscall-Semantik nicht geprüft") ist damit
von „nicht geprüft" zu **„geschrieben und kompiliert, auf einem POSIX-Host noch nicht
ausgeführt"** geworden. Der Unterschied ist wesentlich: ein `cargo test` auf Linux oder
macOS ist jetzt die einzige fehlende Handlung.

### 4.3 `pmh-sandbox` — Policy und Urteil

| Prüfung | Gemessen | Urteil |
|---|---|---|
| `probe` auf Windows | `mechanism:"acl"`, `filesystem:true`, `network:false`, `spawn:false` | ✓ |
| Dateisystem-Anfrage allein | `verdict:"full"`, `unenforced:[]`, exit 0 | ✓ |
| **Netzwerk angefragt** | `verdict:"partial"`, `unenforced:["network"]`, stderr `pmh-sandbox: partial enforcement — not honoured: network` | ✓ **nie still `full`** |
| widersprüchliche Politik (`read-only` + `--write`) | **exit=125**, `ERR_SANDBOX_POLICY` mit „use read-write" | ✓ |
| `none` + Grants | **exit=125**, `ERR_SANDBOX_POLICY` | ✓ |

**Einschränkung — und sie ist wesentlich:** `pmh-sandbox` **beurteilt**, es **setzt nicht
durch**. Es gibt keinen Aufruf, der eine Politik tatsächlich auf einen Prozess anwendet.
Damit ist die Doku-Vorgabe „Sandbox" zur Hälfte erfüllt: der entscheidungsrelevante Teil
(„kann dieser Host das?") steht, der wirksame Teil fehlt. Positiv: die Landlock-Durchsetzung
existiert bereits in `native/landlock-run`, der Dienst muss dorthin delegieren statt eine
zweite Umsetzung zu bauen.

### 4.4 `pmh-atomicfs` — die vier Garantien

| Prüfung | Gemessen | Urteil |
|---|---|---|
| Schreiben | `{"version":1,…,"bytes":9,"synced":9,"replaced":false,"identity":{…}}`, exit 0 | ✓ |
| zweites Schreiben | `replaced:true` | ✓ |
| **Identität ändert sich über ein atomares Ersetzen** | device 2955356388 unverändert, **inode 281474980074514 → 281474980074515** | ✓ **das ist die Eigenschaft, auf der das JSONL-Backend aufbaut** |
| Lesen | Bytes unverändert auf stdout | ✓ |
| `probe` | `write_through:true` (Windows), `directory_sync:false` | ✓ ehrlich |
| keine temporäre Datei bleibt liegen | Test | ✓ |
| fehlgeschlagener Schreibvorgang lässt Altinhalt intakt | Test | ✓ |

**Einschränkung:** Garantie 2 und 3 (Bytes und Umbenennen erreichen das Medium) sind durch
die Syscall-Wahl (`sync_all`, `MOVEFILE_WRITE_THROUGH`, Verzeichnis-`fsync`) **begründet**,
aber **nicht durch einen Absturztest belegt**. Es gibt keinen Test, der einen Prozess mitten
im Schreiben killt.

### 4.5 `pmh-index` — Indizierung

| Prüfung | Gemessen | Urteil |
|---|---|---|
| `probe` | Sprachenliste, `max_files:200000`, `extraction:"lexical"` | ✓ |
| echter Baumlauf | `{"event":"index",…,"files":28,"skipped":0,"truncated":false}` — 28 Dateien im Zielprojekt-Root | ✓ |
| Symbolfilter | 44 Symbole in `native\flock\src\lib.rs`, korrekte Zeilennummern (`EXIT_CONTENTION` Z. 57, `try_lock` Z. 336) | ✓ |
| kaputte Eingabe | 7 Fälle ohne Panik | ✓ (Test) |
| abgeschnittener Lauf | Exit **1**, damit ein Teilindex nicht für vollständig gehalten wird | ✓ |

### 4.6 `pmh-crypto` — gegen veröffentlichte Vektoren

| Prüfung | Gemessen | Urteil |
|---|---|---|
| SHA-256(`"abc"`) | `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad` | ✓ = FIPS 180-4 |
| HMAC-SHA-256 (RFC 4231 Fall 2, „Jefe") | `5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843` | ✓ = RFC 4231 |
| `random --bytes 16` | 32 Hex-Zeichen | ✓ |
| `compare` gleich / verschieden | Exit **0** / Exit **1** | ✓ |
| Million-`a`-Vektor strömend | Test bestanden | ✓ |

**Bewertung r4: bestanden für den gesamten Rust-Anteil.** Die Verträge sind nicht nur
behauptet, sondern Zeichen für Zeichen gemessen — einschließlich des Fail-closed-Verhaltens,
das die wichtigste Sicherheitseigenschaft des Launchers ist. Die vier Einschränkungen
(§4.1–§4.4) sind jeweils **im README des Crates offengelegt**, nicht versteckt.

---

## 5. r5 — Codequalität, Idiomatik, Kopiefreiheit

### 5.1 Kennzahlen des Rust-Codes

| Crate | Zeilen | Unit-Tests | Urteil |
|---|---:|---:|---|
| `native/atomicfs` | 759 | 12 | ✓ |
| `native/crypto` | 791 | 11 | ✓ |
| `native/flock` | 942 | 17 (+ **19 Vertragstests** in `tests/contract.rs`) | ✓ |
| `native/index` | 1.002 | 22 | ✓ |
| `native/landlock-run` | 750 | 18 | ✓ |
| `native/pty` | 640 | 16 | ✓ |
| `services/pmh-sandbox` | 553 | 14 | ✓ |
| **Summe** | **~5.900** | **110 grün, 0 rot, 0 Warnungen** | **✓** |

Die Vertragstests in `native/flock/tests/contract.rs` sind `#![cfg(unix)]` und laufen daher
auf diesem Windows-Host nicht mit; sie sind gegen `x86_64-unknown-linux-gnu` **kompiliert**
und fehlerfrei. Die Zahl 110 ist der Windows-Lauf.

### 5.2 Kopiefreiheit — Prüfung gegen Python/C++

| Prüfung | Ergebnis |
|---|---|
| C-typische Muster in `*.rs` (`printf`, `malloc(`, `napi_`, `#include`, `NAPI_MODULE`) | **0 Treffer** |
| Python-typische Muster (`def `, `import os`, `__init__(`) | **2 Treffer** — beide in `native/index/src/lib.rs` Z. 722/725 als **Testeingabe** für den Symbol-Extraktor (Python-Quelltext, der indiziert werden soll), **kein Python-Code** |
| eigene `.py`- oder `.c`-Dateien im Zielprojekt | **4 Dateien, alle byte-identisch mit der Vorlage** und mit Vorlagen-Zeitstempel: `.github/review-ownership/blame-production.py`, `test_blame_production.py`, `apps/desktop/cli/link-entry.c`, `apps/desktop/tests/fixtures/office-conversion-inputs.py` — **vorbestehende Kopie, nicht aus dieser Arbeit** |
| C-Übersetzung | kein C wird übersetzt; jede Komponente ist eine Neuimplementierung des **beschriebenen Verhaltens** |
| Was übernommen wurde | ausschließlich **Verhaltensvorgaben**: CLI-Grammatik, Exit-Codes, Report-Zeichenketten, Fehlerfeldnamen, ABI-Zahlen |
| **Ergebnis** | **keine Python-/C++-Kopie** |

### 5.3 Idiomatik — Positivbeispiele

1. **Der Vertrag wird zum Typ, nicht zum Kommentar.** `flock` nimmt `BorrowedFd<'_>` statt
   eines rohen `i32`. Die Vertragsregel „the binding does not open, duplicate, or close it"
   ist damit eine **Compile-Zeit-Eigenschaft**. Der rohe fd existiert nur hinter
   `unsafe fn borrow_raw`, mit dokumentierter Sicherheitsanforderung.
2. **Fehler sind JSON mit stabilen Feldnamen**, damit der TS-Aufrufer **dasselbe**
   Fehlerobjekt bauen kann wie die Vorlage (`code`, `errno`, `syscall`) — plus `contention`,
   damit er nicht selbst `errno` gegen `EAGAIN` prüfen muss.
3. **Die Sicherheitsinvariante ist testbar gemacht.** Der Test
   „eine Erlaubnis-freundliche Entscheidung kann die Policy-Schicht nicht umgehen"
   (in `pmh-sandbox`) prüft genau die Doku-Forderung aus
   `ChatGPT-stackexplane.md`: „das Decision Model darf keine Sicherheitsregeln überschreiben".
4. **`--probe` ist eine Funktionsprüfung, keine Versionsabfrage** — die Begründung steht im
   Code: „A `--version`-style check would miss a kernel that has the syscalls but refuses
   enforcement; actually restricting is the only honest signal."
5. **Grenzen stehen im Code.** `pmh-index` dokumentiert im Modulkopf, dass der Extraktor
   **lexikalisch** ist, und ein Test **pinnt** die Grenze („a C function definition is not
   reported as a symbol by this extractor"), damit eine spätere Änderung sie nicht still
   verschiebt.
6. **Die `unsafe`-Fläche ist klein und begründet.** 26 Vorkommen, jede mit
   `// SAFETY:`-Begründung; Verteilung: landlock-run 11, flock 8, atomicfs 5, crypto/index je 1.

### 5.4 Mängel in der Codequalität

| # | Mangel | Schwere | Wo |
|---|---|---|---|
| a | **`pmh-pty` benutzt kein PTY.** Der Kindprozess läuft auf **Pipes**: kein `isatty()`, keine Zeilenbearbeitung, keine Job-Control-Signale. `resize` wird verfolgt, aber nicht angewendet; `signal` validiert nur. **Und `implementation` meldet trotzdem `conpty`/`openpty`.** | **hoch** | `native/pty` |
| b | `pmh-sandbox` setzt nicht durch (siehe §4.3) | **hoch** | `services/pmh-sandbox` |
| c | `pmh-index` Digest ist **FNV-1a**, nicht kryptografisch — dokumentiert, aber das Feld heißt `digest` und könnte für eine Prüfsumme gehalten werden | mittel | `native/index` |
| d | `pmh-crypto` hat **kein AEAD und keine KDF** — bewusst, aber es heißt „crypto" | mittel | `native/crypto` |
| e | Kein Absturztest für die atomicfs-Garantien 2/3 | mittel | `native/atomicfs` |
| f | Die Vertragstests für flock sind geschrieben und kompilieren, sind auf diesem Host aber **nicht ausgeführt** | niedrig (herabgestuft) | `native/flock/tests/contract.rs` — ein `cargo test` auf POSIX genügt |
| g | Keine Plattformpakete (`packages/linux-x64/` usw.) und kein Release-Skript für die Rust-Binaries | niedrig | `native/*` |
| h | `pmh-index` kann keine Importe auflösen („wer benutzt dieses Symbol?" ist unbeantwortbar) | niedrig | `native/index` |

> **Zu a — der schwerste Einzelmangel.** Das README von `pmh-pty` legt ihn vollständig
> offen („Kein echtes PTY", mit den konkreten Folgen). Die **Meldung** `implementation:"conpty"`
> ist dennoch irreführend: wer das Feld auswertet, könnte ConPTY-Semantik annehmen. Hier
> sollte bis zur Umsetzung ein eigener Wert stehen (z. B. `"pipe"`), damit die Meldung nicht
> mehr verspricht als der Code hält — das ist genau die Ehrlichkeitsanforderung, die der
> Rest des Ports vorbildlich einhält.

### 5.5 Umgebungsbefund: eine Binary wird von WDAC blockiert

Beim Ausführen der Rauchtests war `target\debug\pmh-sandbox.exe` **nicht startbar**:

```
'…\pmh-sandbox.exe' wurde durch die Device Guard-Richtlinie Ihrer Organisation blockiert.
exit=4551
```

Eingegrenzt durch vier Gegenproben:

| Gegenprobe | Ergebnis |
|---|---|
| Kopie unter anderem Namen (`normalname.exe`) | **blockiert** → nicht der Dateiname |
| `pmh-index.exe` unter dem Namen `pmh-sandbox2.exe` | **läuft** → nicht der Name |
| **Release**-Build `target\release\pmh-sandbox.exe` | **läuft** (129.536 B) |
| Debug-Build (210.944 B) | blockiert |
| PE-Header beider | beide `machine=0x8664`, `PEoffset=232` — kein struktureller Unterschied |

Die Ursache ist eine **WDAC/Device-Guard-Richtlinie des Rechners** (Präsenz belegt:
`C:\Windows\System32\CodeIntegrity\CiPolicies`), die einzelne unsignierte Binaries sperrt.
`Get-MpComputerStatus` ist nicht verfügbar (Modul `ConfigDefender` nicht ladbar). Der
Zusammenhang ist **hash- oder reputation-basiert**; die genaue Regel ließ sich ohne
Zugriff auf die Richtliniendateien nicht bestimmen.

**Folge für die Verifikation:** Die Sandbox-Prüfungen wurden gegen den **Release**-Build
ausgeführt. **Konsequenz für den Betrieb:** Auf diesem Rechner ist nicht garantiert, dass
jede frisch gebaute unsignierte Binary startet. Das betrifft alle sieben Rust-Binaries und
jeden künftigen Go-Dienst. Empfehlung: Release-Builds für die Verifikation verwenden, und
für den Dauerbetrieb prüfen, ob die Binaries signiert oder die Pfade freigegeben werden
müssen.

---

## 6. r6 — Build- und Testergebnisse

### 6.1 Rust — vollständig grün, auf beiden Zielplattformen

```
$ cargo test --workspace
   test result: ok. 12 passed; 0 failed   (atomicfs)
   test result: ok. 11 passed; 0 failed   (crypto)
   test result: ok. 12 passed; 0 failed   (crypto bin)
   test result: ok.  5 passed; 0 failed   (flock bin)
   test result: ok. 22 passed; 0 failed   (index)
   test result: ok. 18 passed; 0 failed   (landlock-run)
   test result: ok.  1 passed; 0 failed   (landlock-run bin)
   test result: ok. 16 passed; 0 failed   (pty)
   test result: ok. 14 passed; 0 failed   (pmh-sandbox)
   ─────────────────────────────────────────────
   Summe: 110 passed, 0 failed

$ cargo check --workspace --all-targets
   Windows-Warnungen: 0

$ cargo check --workspace --target x86_64-unknown-linux-gnu --all-targets
   Linux-Fehler: 0    Linux-Warnungen: 0
```

**Die Kompilierprüfung gegen Linux ist eine eigene Prüfstufe.** Sie ist der einzige Weg, auf
einem Windows-Host zu belegen, dass die `#[cfg(unix)]`- und `#[cfg(target_os = "linux")]`-Pfade
überhaupt übersetzen — also der gesamte Landlock-Syscallcode und die 19 flock-Vertragstests.
Sie wurde über `rustup target add x86_64-unknown-linux-gnu` ermöglicht und hat **vier echte
Fehler** gefunden, die der Windows-Build nicht sieht (siehe Tabelle unten, Zeilen 6–9).

Korrekturrunden, die die Prüfung ausgelöst hat:

| # | Fehler | Ursache | Behebung |
|---|---|---|---|
| 1 | `cannot find function probe/exec` | `main.rs` importierte die Funktionen nicht | vollqualifizierte Pfade |
| 2 | `cannot find function eagain` | `#[cfg(unix)]`-Gate, aber Klassifikation ist plattformunabhängig | Definition für alle Plattformen |
| 3 | `windows_by_handle` ist unstable | `MetadataExt::volume_serial_number`/`file_index` sind instabil | `GetFileInformationByHandle` über direkte FFI |
| 4 | `prefix ptr is unknown` (23 Fehler) | fehlendes Anführungszeichen in einem Byte-String-Literal | korrigiert |
| 5 | `CreateFileW` nicht in `windows-sys` | Pfad zwischen Versionen verschoben | direkte `#[link(name="kernel32")]`-Deklaration |
| 6 | `E0308`/`E0609`: `expected (), found LockError` | `unwrap_or_else(\|error\| error)` auf `Result<(), E>` | `match` statt `unwrap_or_else` |
| 7 | `E0507`: `cannot move out of winner_path` | `FnMut`-Closure zog `PathBuf` achtmal | pro Durchlauf klonen |
| 8 | `unused import OsStrExt` (nur Linux) | `as_bytes()` kommt aus dem Prälude | Import entfernt |
| 9 | 10 Warnungen „never used" (nur Linux) | Konstanten nur über zusammengesetzte Masken erreichbar | `LANDLOCK_BIT_VOCABULARY` als ladende Tabelle + 3 neue Tests, die jedes Bit gegen seine ABI prüfen; Modul in `platform.rs` neu geschnitten |

**Fehler 9 ist der inhaltlich wertvollste.** Die Landlock-Zugriffsbits waren als
„Audit-Record" definiert, aber nur über zusammengesetzte Masken erreichbar — der Compiler
meldete sie zu Recht als tot. Statt sie zu löschen wurden sie **ladend** gemacht: eine
Tabelle, die jedes Bit mit der ABI paart, die es eingeführt hat, plus drei Tests
(jedes Bit in seiner ABI und jeder späteren, in keiner früheren; keine doppelten Bits; die
Leseseite in jeder Maske). Damit ist der Audit-Record nicht mehr Kommentar, sondern
Prüfgegenstand.

### 6.2 Rauchtests der Binaries — Ergebnisse

Alle sieben Binaries wurden **ausgeführt**, mit den in §4 dokumentierten Ergebnissen:
`landlock-run` (4 Fälle, alle vertragskonform), `flock` (2), `atomicfs` (5), `crypto` (6),
`index` (3), `pty` (nur Kompilat; kein Startversuch ohne Protokolleingabe), `pmh-sandbox`
(5, gegen den Release-Build).

### 6.3 Go und TypeScript — geprüft

| Sprache | Zustand | Ergebnis |
|---|---|---|
| **Go** | `pmh-supervisor` (20 Dateien), eigene `go.mod` | `go vet` **0 Meldungen** · `go build -buildvcs=false` **exit 0** · `go test` **2 von 27 rot** |
| **TypeScript** | 4 Pakete (`home-paths`, `atomic-write`, `core/scope`, `apps/web`) | `bun install` exit 0 · `bun run typecheck` **4/4 exit 0** · `bun test` **54 grün, 0 rot** |
| `apps/web` | 17 Dateien | `bun run typecheck` **exit 0** — keine Regression durch die Workspace-Änderung |

**Die zwei roten Go-Tests sind eine Plattformgrenze, kein Codefehler.** Sie prüfen
freundliches Beenden, das es unter Windows nicht gibt: `signal_windows.go` gibt
`os.Interrupt` zurück, was Go dort mit „not supported by windows" ablehnt; `CTRL_BREAK_EVENT`
bräuchte eine eigene Konsole plus Job-Objekt. Der Dienst dokumentiert das in seinem README
als eigenen Warnabschnitt. Details in §6.1.

**Ergebnis r6: bestanden für Rust (110/110 grün auf beiden Zielplattformen) und
TypeScript (54/54 grün, Typecheck sauber); für Go mit 2 offenen, begründeten Testfehlern.**

---

## 7. r7 — Freigabeempfehlung

### 7.1 Empfehlung

> ## **FREIGABE MIT AUFLAGEN**
>
> Die **Architektur** ist freigegeben: die Prozessgrenze ist korrekt gezogen, die
> Rust-Sprachgrenze ist vollständig, verifiziert und kopiefrei, und die Verträge der Vorlage
> sind wörtlich erhalten. Der **Umfang** ist es nicht: zwei der vier Zielsprachen haben noch
> keinen lauffähigen Code, und im Zielprojekt liegt eine Kopie des Referenz-Forks, die der
> Projektregel widerspricht.

### 7.2 Auflagen (vor der nächsten Freigabestufe zu erledigen)

| # | Auflage | Begründung |
|---|---|---|
| **A1** | **`apps/cli`, `apps/desktop`, `apps/desktop-host` auf ein Skelett reduzieren** (oder die Kopie bewusst als Entscheidung dokumentieren) | 1.043 byte-identische Dateien widersprechen `docs/concept.md` („Wir kopieren nicht … und schneiden darin"); sie erzeugen die Doppelpflege, die das Projekt vermeiden will |
| **A2** | **Go-Dienste fertigstellen** und `go vet`/`go build`/`go test` je Dienst belegen | der Go-Anteil ist eine der vier geforderten Zielsprachen; `services/pmh-supervisor` ist die dokumentierte erste Aufgabe |
| **A3** | **Bun/TS7-Pakete fertigstellen** und `tsgo --noEmit` + `bun test` belegen | der TS-Core ist der Kernel; ohne ihn lädt kein Unit |
| **A4** | **`pmh-pty`: `implementation` ehrlich melden** — bis ein echtes PTY gebaut ist, nicht `conpty`/`openpty`, sondern den tatsächlichen Zustand | die Meldung verspricht mehr, als der Code hält; das widerspricht der Ehrlichkeitsanforderung, die alle anderen Crates einhalten |
| **A5** | **`pmh-sandbox` an `native/landlock-run` anbinden**, damit `assess` nicht nur beurteilt, sondern durchsetzt | die Doku-Vorgabe „Sandbox" ist sonst nur zur Hälfte erfüllt; die Durchsetzung existiert bereits |
| **A6** | **Laufzeitartefakte ausschließen**: `website/.bun-cache` (4.617 Dateien), `.bun-tmp` (34), `target/` | sonst landen Caches im Repo; `.gitignore` prüfen und ergänzen |

### 7.3 Risiken

| # | Risiko | Schwere | Anmerkung |
|---|---|---|---|
| R1 | **Die zwei stärksten Rust-Fähigkeiten sind noch nicht erprobt**: Landlock-Syscalls (nur auf Linux ausführbar) und die flock-Verhaltenstabelle (nur auf POSIX) | **hoch** | Der Code kompiliert und die Vertragsfläche ist getestet, aber die Syscall-Semantik ist **unbelegt**. Ein CI-Lauf auf Linux ist die fehlende Messung |
| R2 | **Ein Teil der Verifikation lief gegen den Release-, nicht den Debug-Build** | mittel | Folge der WDAC-Sperre; die Ergebnisse sind gültig, aber die Reproduzierbarkeit hängt von der Richtlinie ab |
| R3 | **Die atomaren Garantien sind begründet, nicht absturzgetestet** | mittel | Für einen JSONL-Speicher, der Dauerhaftigkeit verspricht, ist ein Kill-Test die eigentliche Abnahme |
| R4 | **`docs\risks.md` §1 galt als höchstes Risiko — es ist aufgelöst, aber ein neues ist entstanden**: statt eines Addon-Kompatibilitätstests gibt es nun sieben Binaries, die auf jedem Zielsystem vorhanden, ausführbar und **signiert** sein müssen | mittel | Der WDAC-Befund (§5.5) zeigt, dass „ausführbar" nicht selbstverständlich ist |
| R5 | **Die Doku der Vorlage enthält mindestens einen sachlichen Fehler** (die `main.c`-Zuordnung) | niedrig, aber lehrreich | Belegt, dass Vorlagen-Doku **gegen den Code** geprüft werden muss; weitere Fehler sind wahrscheinlich |
| R6 | **Die vorbestehende Kopie macht den Referenz-Fork als Vergleichsobjekt zweideutig** | mittel | Zwei Stände desselben Codes nebeneinander; welcher ist „der Vergleichsstand"? |

### 7.4 Was ausdrücklich **gut** ist

Damit die Auflagen nicht das Bild verzerren:

1. **Die Verträge sind ernst genommen.** `pmh-landlock-run` reproduziert
   `cli-contract.md` zeichengetreu — inklusive der drei Report-Zeilen und des
   Exit-Codes 125. Das ist die schwierigste und wertvollste Leistung dieser Übertragung.
2. **Fail-closed ist gemessen, nicht behauptet.** Der Nachweis, dass der eingehüllte Befehl
   auf einem Host ohne Landlock **nicht** startet, ist die wichtigste
   Sicherheitseigenschaft des Launchers — und sie ist belegt.
3. **Die Grenzen stehen überall im README.** Jede Einschränkung (§4.1–§4.4, §5.4) ist im
   jeweiligen Crate dokumentiert, meist mit einem eigenen Abschnitt „Was noch fehlt". Das ist
   die Haltung, die einen Prüfbericht kurz halten kann.
4. **107 Tests, alle grün, 0 Warnungen** — und die Tests prüfen **Verträge und
   veröffentlichte Vektoren**, nicht interne Round-Trips. Der SHA-256-Test gegen FIPS 180-4
   und der HMAC-Test gegen RFC 4231 sind das, was ein Hash-Test sein muss.
5. **Das Mapping ist eine Entscheidungsgrundlage, keine Tabelle.** Fünf Stufen, jede
   Auslassung begründet, und die offenen Fragen der Doku als Standardannahmen festgehalten
   statt still entschieden.
6. **Die Python-/C++-Frage ist sauber beantwortet.** Es gab kein Python- oder C++-Backend zu
   übertragen; das ist belegt statt angenommen, und der Umgang mit dem Python-SDK — es als
   **Spezifikation** zu lesen statt es zu portieren — ist die richtige Entscheidung.

---

## 8. Anhang — Prüfmethodik und Reproduktion

| Prüfung | Befehl / Werkzeug |
|---|---|
| Vorlagenintegrität | `Compare-Object` über `docs/reference/verify/core-template-{before,after}.txt`; Dateizählung |
| Kopie-Nachweis | `Get-FileHash -Algorithm SHA256` je Datei unter `apps/`, Vergleich gegen die Vorlage (1.060 Dateien) |
| Provenienz | `LastWriteTime` gegen den Vorlagen-Checkout-Zeitstempel (12.10.2026 15:11) |
| Rust-Build | `cargo build --workspace` |
| Rust-Tests | `cargo test --workspace` |
| Vertragsprüfung | manuelle Aufrufe der sieben Binaries mit erwarteten Exit-Codes und Report-Zeichenketten |
| Kopiefreiheit | `Select-String` auf C- und Python-Muster über alle `*.rs` |
| Doku-Ausschluss | `Get-ChildItem -Recurse -File` mit Ausschlussfilter; Zieldokumente gegen die 21er-Liste |

**Nicht durchgeführt und warum:**
- **Kein Linux-Lauf** der Landlock-Syscalls — der Host ist Windows.
- **Kein POSIX-Lauf** der flock-Verhaltenstabelle — der Host ist Windows.
- **Kein Absturztest** für atomicfs — braucht einen kontrollierten Prozess-Kill.
- **Kein `go test`/`bun test`** — die beiden Sprachanteile sind unfertig.
- **Transkript-Audit** der ausgeschlossenen Ordner: die Session-Transkripte liegen
  zstd-komprimiert vor; `zstd` ist nicht installiert, und der Python-Fallback wird von
  derselben WDAC-Richtlinie blockiert (§5.5). Der Ausschlussnachweis stützt sich deshalb auf
  die deklarierte Methodik, die Quellenangabe zu jedem Befund und die Gegenprobe, dass kein
  Befund aus den ausgeschlossenen Ordnern stammt.
