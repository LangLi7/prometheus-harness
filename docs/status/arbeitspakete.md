# Arbeitspakete — Todo-Listen je Paket

> **Was diese Datei ist:** das Register der Arbeitspakete mit **eigener Todo-Liste** — nach
> demselben Prinzip wie die Zwischenstände und das Git-Audit. Jedes Paket hat eine Phase,
> eine Checkliste und einen Nachweis. Die Liste ist **änderbar**: sie wächst, wenn ein Paket
> größer wird, und ein Punkt wird erst abgehakt, wenn er **belegt** ist.
>
> **Warum diese Datei existiert (Weisung des Betreibers, 12.10.2026):** „Erstelle bei jedem
> Loop auch für Subagenten eine Todo-Liste — das hilft dir und dem Subagenten. Gleiches
> Prinzip wie Git und Zwischenschritt, genauso Hauptschritt, welche Phase."

## Regeln (verbindlich)

| # | Regel |
|---|---|
| **A1** | **Ein Paket, eine Todo-Liste.** Kein Paket ohne Checkliste — auch kein kleines. |
| **A2** | **Jedes Paket nennt seine Phase** (`geplant` → `in Arbeit` → `Nachweis offen` → `abgenommen`). |
| **A3** | **Abgehakt wird nur Belegtes.** Ein Punkt ohne Befehl und Ergebnis bleibt offen. |
| **A4** | **Die Liste ist änderbar.** Neue Punkte kommen dazu, wenn ein Paket sich als größer erweist; entfallene Punkte werden als „entfällt (Grund)" geführt, nicht gelöscht. |
| **A5** | **Der Subagent kennt seine Liste.** Jeder Auftrag enthält seine Checkliste, damit er sie selbst abarbeiten und seinen Stand melden kann. |
| **A6** | **Nur Fertiges wird committet.** Halbfertige Dateien eines laufenden Pakets gehen **nicht** in einen Commit — auch nicht „nebenbei" mit einer Dokuänderung. |
| **A7** | **Meldeformat bleibt.** Ein Subagent, der mehr braucht, meldet `BEDARF/GRUND/UMFANG/FERTIG` zurück und startet **keine** eigenen Arbeiter. |

## Phasen

```
geplant  ──▶  in Arbeit  ──▶  Nachweis offen  ──▶  abgenommen
              (Code)          (Befehl+Ergebnis)    (Beleg liegt vor)
```

`Nachweis offen` ist die wichtigste Phase: hier sieht die Arbeit fertig aus, ist es aber
nicht. Ein Paket ohne Nachweis wird **nicht** abgenommen, egal wie vollständig die Dateien
wirken.

---

## P1 · t13 — `services/pmh-nix` (NixOS-Konzept, keine Installation)

**Phase: `abgenommen` (12.10.2026)** · **Arbeiter:** 1 Subagent (Go) · **Weisung:** NixOS/Nix
wird **nicht** installiert; nur Konzept und austauschbare Schnittstelle.

**Nachweis, unabhängig vom Subagenten gemessen** (nicht seine Meldung übernommen):

```
cd services/pmh-nix
go vet   -buildvcs=false ./...   → exit 0
go build -buildvcs=false ./...   → exit 0
go build ./...                   → exit 0   (ohne Flag! siehe Befund unten)
go test  -buildvcs=false -count=1 -v ./...  → PASS = 45, FAIL = 0, SKIP = 0
```

| # | Punkt | Stand |
|---|---|---|
| P1.1 | Backend-Interface (`Detect`/`Propose`/`Check`/`Apply`/`Generations`/`Rollback`) | **erledigt** |
| P1.2 | Attrappen-Backend **ohne Systemwirkung**, nur eigene Buchführung | **erledigt** |
| P1.3 | `nix`-Backend vorhanden, aber **inert** — ohne `nix` im PATH fail-closed | **erledigt** |
| P1.4 | Vertrag `Vorschlag → Prüfung → Anwendung → Generation → Rückweg` | **erledigt** |
| P1.5 | Freigabe-Datenstruktur `Approval` (wer/wann/Diff-Hash/Basisgeneration) | **erledigt** |
| P1.6 | Zwei Betriebsarten `local`/`remote` | **erledigt** |
| P1.7 | Policy-Stufe für Netzwerk/Nutzerrechte/Secrets strenger als die Branch-Regel | **erledigt** |
| P1.8 | Secrets nicht im Nix-Store (`sops-nix`/`agenix`) als **Fehler**-Finding | **erledigt** |
| P1.9 | `README.md` (12.379 B) | **erledigt** |
| P1.10 | `unit.json` nach bestehendem Format (1.475 B) | **erledigt** |
| P1.11 | `docs/design/nixos-self-change.md` (200 Zeilen) | **erledigt** |
| P1.12 | `go vet -buildvcs=false ./...` → exit 0 | **erledigt** — gemessen |
| P1.13 | `go test -buildvcs=false ./...` → exit 0, **45 PASS / 0 FAIL** | **erledigt** — gemessen |
| P1.14 | Quelltextprüfung: die Attrappe hat **keine** Systemwirkung | **erledigt** — gemessen |
| P1.15 | Nachweis, dass ein Modell **nicht** selbst umschalten kann (Test) | **erledigt** |

### Wie P1.14 belegt ist (und warum die Prüfung nötig war)

`internal/actuation/stub/stub.go` **importiert `os/exec`** — das sieht nach Systemwirkung aus.
Die Prüfung ergab: es wird ausschließlich `exec.LookPath(name)` benutzt (Zeile 84), also eine
**Programmsuche**, kein Prozessstart.

| Prüfung | Ergebnis |
|---|---|
| `exec.Command`/`CommandContext` in `internal/actuation/stub/` | **0 Vorkommen** |
| `exec.CommandContext` im ganzen Dienst | **1 Vorkommen** — `internal/actuation/nix/nix.go` Z97, **hinter** dem fail-closed-Gate |
| Prozessstart auf diesem Wirt | **keiner** — `nix` fehlt, jeder mutierende Aufruf liefert `ErrNotAvailable` |
| Beweis | `TestNixNeverStartsAProcessOnThisHost` ersetzt `Run` durch ein `t.Fatalf` |

**Die eigentliche Qualität dieses Entwurfs:** jeder Prozessstart läuft über die **injizierbaren**
Felder `Run` und `LookPath`. Damit ist „es wird nichts gestartet" nicht eine Behauptung im
Kommentar, sondern eine **ersetzbare und damit prüfbare** Eigenschaft. Das ist das Muster,
das `native/flock` mit `BorrowedFd` schon einmal angewandt hat (siehe
`docs/review/backend-review.md`, r5) — hier zum zweiten Mal, und diesmal für die schärfere
Frage „läuft ein Prozess?".

### Die Sicherheitstests, die die Kernanforderung tragen

Alle **grün** (gemessen, nicht behauptet):

| Test | Was er sichert |
|---|---|
| `TestProposeIsTheOnlyOpenAction` | ein Modell darf **nur vorschlagen** |
| `TestApplyRejectsUncheckedProposal` (+ CLI-Variante) | ohne Prüfung keine Anwendung |
| `TestApplyRejectsUnknownProposal` / `…AlreadyApplied` | keine erfundenen, keine doppelten Vorgänge |
| `TestPolicyCannotBeBypassedByProposalFields` | **die zentrale Invariante**: freundliche Felder umgehen die Policy nicht |
| `TestPolicyRejectsTamperedDiff` | nach der Freigabe geänderter Diff → abgelehnt |
| `TestNixRefusesEveryMutatingCallFailClosed` | ohne Nix-Werkzeugkasten **kein** Erfolg |
| `TestNixApplyNeverReturnsAGeneration` | das inerte Backend liefert **nie** eine Generation |
| `TestStubRollbackRejectsUnknownGeneration` | Rückweg nur auf bekannte Generationen |

### Befund am Rande: offener Punkt L2 ist erledigt

`go build` **ohne** `-buildvcs=false` läuft jetzt durch (exit 0). Die Ursache war das leere
`.git`, das kein Repository beantworten konnte; mit dem neuen Repository ist das Flag
entfallen. **`scripts/build-go.ps1` und `scripts/test-go.ps1` setzen es weiterhin** — das ist
harmlos, aber ab jetzt unnötig. Auflage **A3** aus `docs/review/backend-review.md` ist damit
gegenstandslos, sobald die Skripte angepasst sind (offener Punkt, keine Eile).

---

## P2 · t14 — `packages/units/unit-export` (Plugin-Export über den Harness)

**Phase: `in Arbeit`** · **Arbeiter:** 1 Subagent (Bun/TS7) · **Warnung:** der Befund aus
`docs/risks.md` §6 gilt — das Einhängen darf sich **nicht** auf den
`node-addon-require-builtin`-Interzeptor stützen.

| # | Punkt | Stand |
|---|---|---|
| P2.1 | Manifest-Modell + Validierung gegen `units/README.md` | erledigt (Code) |
| P2.2 | Windows-sichere Namensprüfung (Gross-/Kleinschreibung, Gerätenamen, Endpunkte) | erledigt (Code) |
| P2.3 | Registry: Auffinden, Abhängigkeiten, Verträglichkeit gegen Core-Vertragsversion | erledigt (Code) |
| P2.4 | Bündelung: ein Artefakt, Manifest, Dateiinhalts-Hashes, Bündel-Digest | erledigt (Code) |
| P2.5 | **Pfadsicherheit** beim Import (absolut, `..`, Laufwerksbuchstabe) | erledigt (Code) |
| P2.6 | Export/Import über **CLI** *und* programmatische API | erledigt (Code) |
| P2.7 | Import fail-closed: erst prüfen, dann an Ort und Stelle verschieben | erledigt (Code) |
| P2.8 | Herkunftsnachweis im installierten Unit festhalten | erledigt (Code) |
| P2.9 | Roundtrip-Test gegen ein **echtes** Unit aus `units/` | **offen** |
| P2.10 | Negativtests: beschädigt, Digest-Abweichung, Pfadausbruch, fehlende Abhängigkeit | **offen** |
| P2.11 | Plugin-**Host**: laden, prüfen, einhängen, abstecken (Lebenszyklus) | **offen** |
| P2.12 | `unit.json` + `README.md` für das Paket selbst | **offen** |
| P2.13 | `bun test` → Anzahl grün/rot | **offen** |
| P2.14 | `bun run typecheck` → exit 0 | **offen** |

**Abnahme erst, wenn P2.9–P2.14 belegt sind.**

---

## P3 · t15 — `services/pmh-attach` (Web-Attach-Gateway)

**Phase: `in Arbeit`** · **Arbeiter:** 1 Subagent (Go) · **Anforderung:** Protokoll
**wörtlich** vom Core-Gateway-Seam der Abhängigkeit `0.2.1-alpha.2`.

| # | Punkt | Stand |
|---|---|---|
| P3.1 | `/healthz` → 200, kleines JSON | erledigt (Code) |
| P3.2 | WebSocket-Handshake + Frames (RFC 6455) selbst implementiert | erledigt (Code) |
| P3.3 | Anhänge-Modell: Ansicht + Panel-Id, mehrere Clients auf einem Strom | erledigt (Code) |
| P3.4 | Fan-out mit eigenem Puffer je Client; langsamer Client blockiert nicht | erledigt (Code) |
| P3.5 | Sequenznummern + Lückenerkennung (`resync`) | erledigt (Code) |
| P3.6 | Läuft **ohne** Upstream; fehlender Upstream scheitert **sichtbar** | erledigt (Code) |
| P3.7 | Wildcard-Bind nur mit ausdrücklichem Flag | erledigt (Code) |
| P3.8 | Protokolltabelle: **wörtlich** übernommene Namen vs. eigene Namen | **offen** |
| P3.9 | Spezifikationsdokument mit verbindlicher Tabelle | **offen** |
| P3.10 | `go vet -buildvcs=false ./...` → exit 0 | **offen** |
| P3.11 | `go test -buildvcs=false ./...` → exit 0, Anzahl Tests genannt | **offen** |
| P3.12 | `README.md` + `unit.json` | **offen** |
| P3.13 | Debug-Testdatei (`zz_debug_test.go`) entfernen oder begründen | **offen** |

**Abnahme erst, wenn P3.8–P3.13 belegt sind.** P3.8 ist der kritische Punkt: eine
Protokolltabelle, die rät, ist schlimmer als keine — dann lieber ehrlich „eigener Name".

---

## P4 · t21 — 4-Stunden-Takt (Push + Audit + Snapshot)

**Phase: `in Arbeit`** · **Arbeiter:** Executor selbst (kein Subagent)

| # | Punkt | Stand |
|---|---|---|
| P4.1 | `.git` reparieren oder ersetzen (war leer) | erledigt — ersetzt |
| P4.2 | `.gitignore` mit Begründung | erledigt |
| P4.3 | Erster Commit | erledigt — `39eeaa5`, 2.660 Dateien |
| P4.4 | Remote verbinden (privat) und pushen | erledigt |
| P4.5 | Push per API auditieren, in `git-audit.md` eintragen | erledigt — 2 Einträge |
| P4.6 | Skript, das den Takt in **einem** Befehl ausführbar macht | **offen** |
| P4.7 | Ehrlich dokumentieren, dass der Takt **kein Dienst** ist | erledigt |
| P4.8 | Echten Scheduler bauen (gehört zu `services/pmh-scheduler`) | **offen — eigenes Paket** |

**P4.7 ist kein Kosmetikpunkt:** ein Takt, der nur in einer laufenden Sitzung feuert, ist
eine Absicht. Das steht so in `docs/status/README.md` und wird hier nicht schöngeredet.

---

## P5 · t22/t23 — Prüfung und lokales Web-Testing

**Phase: `geplant`** · **Arbeiter:** noch keiner

| # | Punkt | Stand |
|---|---|---|
| P5.1 | `code-review` über den aktuellen Stand | **offen** |
| P5.2 | Security-Skills über den aktuellen Stand | **offen** |
| P5.3 | Ergebnisse mit Schweregrad festhalten; `review_skipped` als **nicht gelaufen** melden | **offen** |
| P5.4 | Browser-Weg für `127.0.0.1:5199` / `:5175` / `:8090` bereitstellen und dokumentieren | **offen** |
| P5.5 | Oberfläche tatsächlich im Browser prüfen (nicht nur HTTP 200) | **offen** |

---

## Geändert

| Datum | Änderung | Grund |
|---|---|---|
| 2026-10-12 | Datei angelegt, P1–P5 erfasst | Weisung: Todo-Listen je Paket, gleiches Prinzip wie Git und Zwischenstand |
| 2026-10-12 | **P1 von `Nachweis offen` auf `abgenommen`** — nach eigener Messung (45 Tests, 0 Fehler; Attrappe ohne Systemwirkung nachgewiesen) | Weisung: abgehakt wird nur Belegtes. Die Meldung des Subagenten wurde **nicht** übernommen, sondern nachgemessen |
| 2026-10-12 | **P1.9–P1.14 von `offen` auf `erledigt`** | Dateien vorhanden (README 12.379 B, `unit.json` 1.475 B, Konzept 200 Zeilen); `go vet`/`build`/`test` exit 0 |
| 2026-10-12 | Befund ergänzt: offener Punkt **L2 erledigt** (`go build` ohne `-buildvcs=false` läuft) | Ursache war das leere `.git`; Auflage A3 damit gegenstandslos |
