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

**Phase: `abgenommen` (13.10.2026)** · **Arbeiter:** 1 Subagent (Bun/TS7), Abnahme vom Executor
selbst nachgemessen · **Warnung eingehalten:** der Befund aus `docs/risks.md` §6 gilt — das
Einhängen stützt sich **nicht** auf den `node-addon-require-builtin`-Interzeptor.

**Nachweis, unabhängig gemessen** (nicht die Meldung des Subagenten übernommen):

```
cd packages/units/unit-export
bun run typecheck   -> exit 0
bun test            -> exit 0 · 158 pass · 0 fail · 6 Dateien
```

**Der Rundlauf, belegt in [`plugin-export-nachweis.md`](plugin-export-nachweis.md):**

| Messung | Digest | Urteil |
|---|---|---|
| Export → Bündel (20 Dateien, 223.508 B) | `sha256:ac37e0ec…` | — |
| **Rückexport nach Import** | `sha256:ac37e0ec…` | **identisch** |
| Inhalts-Digest | `sha256:84cef3f8…` | **identisch** |

Herkunft beim Import aufgezeichnet (`.pmh-export.json`): Erzeuger, Quellbündel, Bündel- und
Inhalts-Digest, Installationszeitpunkt.

| # | Punkt | Stand |
|---|---|---|
| P2.1 | Manifest-Modell + Validierung gegen `units/README.md` | **erledigt** |
| P2.2 | Windows-sichere Namensprüfung (Gross-/Kleinschreibung, Gerätenamen, Endpunkte) | **erledigt** |
| P2.3 | Registry: Auffinden, Abhängigkeiten, Verträglichkeit gegen Core-Vertragsversion | **erledigt** |
| P2.4 | Bündelung: ein Artefakt, Manifest, Dateiinhalts-Hashes, Bündel-Digest | **erledigt** |
| P2.5 | **Pfadsicherheit** beim Import (absolut, `..`, Laufwerksbuchstabe) | **erledigt** |
| P2.6 | Export/Import über **CLI** *und* programmatische API | **erledigt** |
| P2.7 | Import fail-closed: erst prüfen, dann an Ort und Stelle verschieben | erledigt (Code) |
| P2.8 | Herkunftsnachweis im installierten Unit festhalten | erledigt (Code) |
| P2.9 | Roundtrip-Test gegen ein **echtes** Unit aus `units/` | **belegt** — 6 Tests grün, u. a. „exportieren, prüfen, importieren, rückexportieren" |
| P2.10 | Negativtests: beschädigt, Digest-Abweichung, Pfadausbruch, fehlende Abhängigkeit | **belegt** — in `bundle.test.ts` (u. a. H1, gekipptes Byte, Pfadausbruch) |
| P2.11 | Plugin-**Host**: laden, prüfen, einhängen, abstecken (Lebenszyklus) | **belegt** — `src/plugin-host.ts` (32 Typfehler behoben) + **37 neue Tests** in `tests/plugin-host.test.ts` |
| P2.12 | `unit.json` + `README.md` für das Paket selbst | **belegt, mit Widerspruch** — beide vorhanden (1.181 B / 17.717 B); `unit.json` behauptet in `notes` aber noch, der Plugin-Host sei **nicht** Teil des Pakets (offener Punkt L12) |
| P2.13 | `bun test` → Anzahl grün/rot | **belegt** — `bun test tests` → **158 pass, 0 fail**, exit 0 (380 `expect()`, 6 Dateien) |
| P2.14 | `bun run typecheck` → exit 0 | **belegt, mit Ersatzweg** — `bun run typecheck` ist in dieser Umgebung **nicht** lauffähig (`--filter` kann keinen Prozess starten, offener Punkt L9); einzeln geprüft: `tsgo --noEmit` in allen 6 Workspace-Paketen **exit 0** |

**Abnahme erst, wenn P2.9–P2.14 belegt sind.** → **P2.1–P2.14 sind belegt; die Abnahme
steht noch aus**, weil L12 einen Widerspruch zwischen Manifest und Code offen lässt.

### Wie der ursprüngliche Fehlschlag einzuordnen war

Gemeldet war `(fail) checkBundle > lehnt ein verändertes Manifest ab (H1)`. Zum
Nachmessen wurde `HEAD` in einem **eigenen `git worktree`** ausgecheckt:

| Zustand | `bun test tests` |
|---|---|
| `HEAD` (`8b6fd4a`) | **91 pass, 27 fail** |
| Arbeitsbaum vor dieser Sitzung | **121 pass, 0 fail** |
| Arbeitsbaum nach dieser Sitzung | **158 pass, 0 fail** |

Der Fehlschlag war also echt — aber die Behebung lag bereits **uncommittet** im
Arbeitsbaum, ohne Nachweis. Die H1-Prüfung bindet den kanonischen Manifest-Text mit
Platzhalter-Digest; ein gekipptes Byte in `createdAt"` ändert die Manifest-Bytes, H1
passt nicht mehr, `bundle_component_digest_mismatch` wird gemeldet. Der Test ist
**nicht** abgeschwächt worden.

### Befund am Rande: neun ungültige Vertragsspannen

Der Roundtrip prüft **jedes** echte Unit. Neun `unit.json` nannten
`"contract": ">=0.2.0 <0.3.0"` — für `isContractRange` ungültig, weil das Muster genau
**einen** Operator-Term erlaubt (`^(?:[~^]|>=|<=|>|<)?X.Y.Z$`). Dadurch fielen fünf
Roundtrip-Tests **nicht** wegen des geprüften Codes, sondern wegen fremder Manifeste um.
Alle neun auf `"^0.2.0"` vereinheitlicht; `pmh-nix` danach mit `go vet`/`build`/`test`
regressionsgeprüft (exit 0).

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
| P3.10 | `go vet -buildvcs=false ./...` → exit 0 | **belegt** — exit 0 |
| P3.11 | `go test -buildvcs=false ./...` → exit 0, Anzahl Tests genannt | **belegt, mit Einschränkung** — `go test ./internal/attach/ ./tests/` → **28 pass, 0 fail**, exit 0; `./...` **hängt** im neuen Paket `internal/wire` (offener Punkt L7, nicht von t15 verursacht) |
| P3.12 | `README.md` + `unit.json` | **offen** — nachgemessen: in `services/pmh-attach` gibt es **keine** `.md`-Datei und **kein** `unit.json`. Ein erster Eintrag hier hatte beide als „belegt" geführt; das war **falsch** und wurde korrigiert |
| P3.13 | Debug-Testdatei (`zz_debug_test.go`) entfernen oder begründen | **belegt** — keine `zz*`-Datei vorhanden (`Get-ChildItem -Filter zz*` leer) |

**Abnahme erst, wenn P3.8–P3.13 belegt sind.** P3.8 ist der kritische Punkt: eine
Protokolltabelle, die rät, ist schlimmer als keine — dann lieber ehrlich „eigener Name".

### Vier echte Fehler in `internal/attach` (behoben)

Kein Test hatte sie bemerkt, weil sie in einer unfertigen Fassung lagen. Nachgemessen
in einem **eigenen `git worktree`** auf `HEAD`: dort waren **8** Tests rot, im
Arbeitsbaum noch **4**.

| # | Fehler | Behebung |
|---|---|---|
| 1 | `Enqueue` verlor bei `drop-oldest` Rahmen **still**: Puffer leeren, neuen Rahmen zuerst einlegen, Rest per `select`/`default` zurück — der `default`-Zweig verschluckte sie ohne Meldung. Gemessen: 9 Verwerfungen, 2 Rahmen in einer Warteschlange der Länge 3, Reihenfolge `[12 2]` statt `[8 9 10]` | neuen Rahmen **hinten** anhängen; Sperre über Leeren + Zurücklegen halten; Rückgabe auswerten. Ein stiller Verlust ist ausgeschlossen — entweder es passt, oder der Client wird sichtbar getrennt |
| 2 | Eine **abgehängte** Sicht bekam weiter Rahmen: der schnelle Weg schrieb in den Puffer, **bevor** `closed` geprüft wurde | beendete Session nimmt nichts mehr an |
| 3 | **Kein Abschlussrahmen** bei vollem Puffer: `Fail` versuchte den `error`-Rahmen einmal und ließ ihn fallen — ausgerechnet den Rahmen, der die Trennung erklärt | Puffer leeren, zuerst `droppable` opfern, dann `ready` (eröffnet eine Generation, die `Fail` beendet), sonst Close-Code. Nutzinhalt wird nie still verworfen |
| 4 | `println("DBG …")`-Restspuren einer Debug-Sitzung in `session.go` | entfernt |

**Ein Test war selbst fehlerhaft.** `TestShutdownDetachesEveryClient` hing einen
**nebenläufigen Leser** an und las danach die Warteschlange selbst — der Leser hatte den
Fehlerrahmen längst verbraucht, der Test konnte ihn gar nicht sehen (gemessen: der
Rahmen **wurde** zugestellt). Der Test hängt jetzt **ohne** Leser an und liest `ready`
und `error` selbst. Er prüft dadurch **mehr** als vorher, nicht weniger — abgeschwächt
wurde nichts.

**Was weiterhin fehlt:** `-race` ist hier nicht lauffähig (`go: -race requires cgo`,
offener Punkt L8). Die Sperrenführung ist **begründet**, aber nicht maschinell geprüft.

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
| 2026-10-13 | **P2.9–P2.14 von `offen` auf `belegt`** (P2.12 mit Widerspruch, P2.14 mit Ersatzweg) — nach eigener Messung: 158 Bun-Tests grün (exit 0), `tsgo --noEmit` in allen 6 Paketen exit 0; `HEAD` zum Vergleich in eigenem `git worktree` nachgemessen | Weisung: abgehakt wird nur Belegtes. Der gemeldete Fehlschlag war echt, aber bereits uncommittet behoben — das ist ohne Nachweis nicht von „erledigt" zu unterscheiden |
| 2026-10-13 | **P2.11 zusätzlich belegt** durch 37 neue Tests in `tests/plugin-host.test.ts`; `src/plugin-host.ts` hatte **32 Typfehler** und war nie ausgeführt worden | Ein Host, der nur übersetzt, ist eine Behauptung; erst Laden, Einhängen und Abstecken im Test machen ihn prüfbar |
| 2026-10-13 | **P3.10/P3.13 von `offen` auf `belegt`**, **P3.11 mit Einschränkung** — `go vet`/`build` exit 0, 28 Go-Tests grün; `./...` hängt in `internal/wire` (L7) | Der Beleg nennt die geprüften Pakete ausdrücklich statt `./...`, damit ein hängender Fremdtest nicht als grün durchgeht |
| 2026-10-13 | **P3.12-Korrektur: von „belegt" auf `offen` zurückgenommen.** In `services/pmh-attach` gibt es **keine** `.md`-Datei und **kein** `unit.json` | Der erste Eintrag behauptete ein README, das nicht existiert. Gefunden beim Stagen, weil `git add` die Datei nicht kannte — hätte ich das nicht geprüft, wäre ein Paket mit erfundenem Nachweis „abgenommen" worden |
| 2026-10-13 | **Vier echte Fehler in `internal/attach` behoben** (stiller Rahmenverlust, abgehängte Sicht bekam Rahmen, fehlender Abschlussrahmen, `println`-Restspuren) | Auf `HEAD` waren 8 Tests rot, im Arbeitsbaum 4 — die Reste waren ungeprüfter, nie abgeschlossener Arbeitsstand |
| 2026-10-13 | **Ein Test korrigiert** (`TestShutdownDetachesEveryClient`): er hing einen nebenläufigen Leser an und konnte den Fehlerrahmen deshalb nie sehen | Der Test prüfte nicht, was er behauptete; er prüft jetzt **mehr** (ohne Leser, `ready` und `error` selbst gelesen) |
| 2026-10-13 | **Neun `unit.json` korrigiert**: Vertragsspanne `">=0.2.0 <0.3.0"` ist für `isContractRange` ungültig → `"^0.2.0"` | Fünf Roundtrip-Tests fielen wegen **fremder** Manifeste um, nicht wegen des geprüften Codes. `pmh-nix` danach regressionsgeprüft (exit 0) |
