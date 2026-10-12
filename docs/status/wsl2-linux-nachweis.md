# WSL2-Linux-Nachweis

> **Zweck:** der **erste** Lauf der Go- und Rust-Prüfungen unter Linux auf diesem Rechner.
> Bis heute war das unmöglich (Host ist Windows); Risiko **R1** aus
> `docs/review/backend-review.md` war deshalb nur „kompiliert, nie gelaufen".
>
> **Gemessen:** 13.10.2026 · WSL2 Ubuntu 26.04 LTS · Kernel `6.6.87.2-microsoft-standard-WSL2`

## 1. Umgebung

| Baustein | Wert |
|---|---|
| Distribution | Ubuntu 26.04 LTS (WSL2) |
| Kernel | `6.6.87.2-microsoft-standard-WSL2` |
| Go | `go1.27.2 linux/amd64` — **benutzerlokal** unter `~/.local/go` (offizielles Tarball, **ohne root**) |
| Rust | `cargo 1.99.0` / `rustc 1.99.0` |
| Bun | `1.4.3` (benutzerlokal unter `~/.bun`) |
| Node | v26.11.1 (über nvm) |
| Caches | `GOCACHE=~/.cache/go-build`, `GOMODCACHE=~/go/pkg/mod` — **nicht** auf `/mnt/c` |

**Warum Go ohne root installiert wurde:** `sudo` verlangt auf diesem Rechner eine
interaktive Anmeldung. Ein Passwort in einer Agenten-Sitzung wäre ein Risiko ohne
Gegenwert — das offizielle Tarball nach `~/.local/go` erfüllt denselben Zweck.

**`go.mod`-Anforderung erfüllt:** beide Dienste verlangen `go 1.26`, installiert ist
**1.27.2** — also neuer als gefordert.

## 2. Go-Dienste unter Linux

```bash
export PATH="$HOME/.local/go/bin:$PATH"
export GOFLAGS=-buildvcs=false
cd /mnt/c/Users/Chang/prometheus-harness/services/<dienst>
go vet ./... && go build ./... && go test -count=1 ./...
```

### `services/pmh-nix`

```
go vet   → exit 0
go build → exit 0
go test  → exit 0   ok  .../services/pmh-nix/tests   5.656s
```

| Messung | Wert |
|---|---|
| `--- PASS` | **60** |
| `--- FAIL` | **0** |
| `=== RUN` | 63 (enthält die Untertests der Kategorie-Prüfung) |

### `services/pmh-attach`

```
go vet   → exit 0
go build → exit 0
go test  → exit 0   ok  internal/attach 2.413s · internal/wire 0.111s · tests 0.782s
```

| Messung | Wert |
|---|---|
| `--- PASS` | **63** |
| `--- FAIL` | **0** |

**Beide Dienste laufen unter Linux grün.** Die Erwartung aus dem Auftrag (59 / 63) ist
damit **erfüllt bzw. übertroffen**: `pmh-nix` hat inzwischen 60 Testfunktionen.

## 3. Rust unter Linux — und ein Befund, der wichtiger ist als die Zahl

```bash
cd /mnt/c/Users/Chang/prometheus-harness
cargo test --workspace --no-fail-fast
```

**Derselbe Befehl, zwei Läufe, zwei verschiedene Ergebnisse:**

| Lauf | Ergebnis |
|---|---|
| **1. Lauf** | `FAILED. 15 passed; 2 failed` — `error: test failed, to rerun pass '-p pmh-flock --test contract'` |
| **2. Lauf** | `PASS=126 FAIL=0` |

**Das ist der eigentliche Befund dieses Nachweises: die flock-Vertragstests sind nicht
deterministisch.** Ein Test, der beim ersten Lauf rot und beim zweiten grün ist, beweist
**nichts** — weder im roten noch im grünen Fall. Die zwei betroffenen Bedingungen:

| Test | Beobachtung im ersten Lauf |
|---|---|
| `condition_13_an_invalid_descriptor_is_ebadf` | **Panik** in `native/flock/src/lib.rs:400` — `fd != -1` (Produktivcode, nicht Testcode) |
| `condition_12_a_dead_holder_releases_without_a_timeout` | `the child never took the lock, so the test would prove nothing` — der Test **sagt selbst**, dass er nichts beweist |

**Beide Befunde deuten auf Zeitabhängigkeit:** Bedingung 12 startet einen Kindprozess und
wartet darauf, dass er die Sperre nimmt; Bedingung 13 erwartet ein ungültiges fd. Ein
Unterschied zwischen den Läufen heißt: das Ergebnis hängt vom **Zeitablauf** ab, nicht von
einer stabilen Eigenschaft.

## 4. Erwartung gegen Messung — die Abweichung

| Erwartet (Auftrag) | Gemessen | Bewertung |
|---|---|---|
| 19 flock-Vertragstests | **15** `condition_`-Funktionen in `contract.rs` | **Abweichung** |
| 18 Landlock-Tests | **19** `#[test]`-Attribute in `native/landlock-run/`, läuft grün | **Abweichung** |

**Die Zahlen 19 und 18 sind aus dem Prüfbericht übernommen, nicht nachgezählt.** Dort steht
(Zeile 187 f.): *„Die 18 Vertragsbedingungen aus `flock-contract.md` sind als Testsuite
umgesetzt: 15 abgedeckt, 2 entfallen begründet, 1 ist in einer anderen Prüfung enthalten."*
Die **19** bezog sich auf die **Vertragsbedingungen der Vorlage**, nicht auf die Zahl der
Testfunktionen. Beide Zahlen in einen Auftrag zu schreiben, war eine **Vermischung von
Vertragsbedingungen und Tests** — hier korrigiert.

**Ehrliche Folge:** Von den 18 Vertragsbedingungen sind **15 als Testfunktionen** vorhanden
(`condition_01` … `condition_18`, mit Lücken: 11, 15, 16 fehlen). Die drei fehlenden sind
laut Prüfbericht zwei begründete Entfälle und eine anderweitig abgedeckte Bedingung.

## 5. R1 — Neubewertung

**R1 laut Prüfbericht (wörtlich):** *„Die zwei stärksten Rust-Fähigkeiten sind unbelegt:
Landlock-Syscalls und die 19 flock-Vertragstests existieren und kompilieren, sind aber auf
keinem POSIX-System gelaufen."* — Schwere **hoch**.

**Neubewertung nach diesem Lauf:**

| Teil von R1 | Status |
|---|---|
| „nie auf einem POSIX-System gelaufen" | **erledigt** — sie sind jetzt gelaufen (WSL2, Linux 6.6.87.2) |
| Landlock-Syscalls | **grün** — `native/landlock-run` läuft mit 19 Tests durch |
| flock-Vertragstests | **NICHT geschlossen** — nicht deterministisch (rot im 1. Lauf, grün im 2.) |

**R1 ist damit von „unbelegt" auf „belegt, mit offenem Mangel" gewechselt.** Das ist ein
Fortschritt — vorher wusste niemand, ob der Code unter Linux überhaupt läuft; jetzt weiß man:
**er läuft meistens, aber nicht immer.** Genau diese Klasse Fehler ist im Betrieb die
teuerste, weil sie sich nicht reproduzieren lässt.

**Nächster Schritt (offen):** die Zeitabhängigkeit in `condition_12` und `condition_13`
eingrenzen. `native/flock/src/lib.rs:400` liegt im **Produktivcode** und ist damit der
gewichtigerе der beiden Befunde.

## 6. Was dieser Nachweis **nicht** belegt

| Offen | Grund |
|---|---|
| Landlock-**Durchsetzung** unter echtem Zwang | Die Tests laufen; ob ein Prozess tatsächlich eingeschränkt wird, prüft nur ein Syscall-Test mit Rechten — der Host erlaubt ihn, aber die Wirkung wurde nicht gegen einen Angriff geprüft |
| `-race` | Nicht gelaufen: benötigt cgo, nicht geprüft |
| Docker aus WSL heraus | Docker-Desktop-WSL-Integration für Ubuntu **nicht aktiviert** — `/var/run/docker.sock` fehlt; Docker-Befehle treffen die Windows-`docker.exe` |
| Windows-Rückfall | In diesem Lauf **nicht nötig** — kein Test scheiterte an WSL2/Kernel |

## 7. Nachweis der Befehle

Alle Befehle liefen in WSL2 über `wsl.exe -d Ubuntu -- bash -lc "…"`. Die Ausgaben wurden
im Verlauf wörtlich festgehalten; die Zählungen stammen aus
`awk '/^--- PASS/{…}'` bzw. `cargo test --workspace` und wurden **nicht** geschätzt.

**Kein Nix, kein NixOS, kein Python und keine C/C++-Toolchain wurden installiert.** Die
Vorlage `C:\Users\Chang\harness\prometheus-harness` wurde nicht benutzt; `docs\dsh` und
`docs\design` wurden nicht geöffnet.
