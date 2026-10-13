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

---

## P6 · t34 — Auflage A1: die kopierten Apps entfernen

**Phase: `abgenommen` (13.10.2026)** · **Auflage A1** aus `docs/review/backend-review.md`,
wörtlich:

> **A1** | `apps/cli`, `apps/desktop`, `apps/desktop-host` aus dem Bun-Workspace entfernen
> (erledigt) und danach als Kopie entfernen oder bewusst dokumentieren | 1.043
> byte-identische Dateien widersprechen `docs/concept.md`; sie haben `bun install` und
> damit jeden Typecheck blockiert

**Ausgangsbefund (gemessen mit SHA-256 über jede Datei):**

| Ordner | Vorlage | Ziel | identisch | abweichend | `workspace:*` |
|---|---:|---:|---:|---:|---:|
| `apps/cli` | 220 | 220 | **220** | **0** | **129** |
| `apps/desktop` | 773 | 773 | **773** | **0** | 13 |
| `apps/desktop-host` | 50 | 50 | **50** | **0** | 16 |

**Was getan wurde:**

| # | Schritt | Stand |
|---|---|---|
| P6.1 | `apps/host` um `--profile`, `-p`, `--port`, `--patches` erweitert (eigener Code) | **erledigt** |
| P6.2 | Unterkommando setzt das Profil (`pmh web` → Profil `web`) | **erledigt** |
| P6.3 | `--patches` lädt Overlays **hinter** die Profil-Schichten; fehlende Datei scheitert **vor** dem Boot | **erledigt** |
| P6.4 | Die drei Kopien entfernt (1.043 Dateien) | **erledigt** |
| P6.5 | `apps/web` unberührt | **erledigt** — weiterhin **17** Dateien |
| P6.6 | `LICENSE` (MIT) angelegt — Pflicht bei Nutzung als Codebasis | **erledigt** |

**Nachweis, unter WSL2 gemessen (Linux 6.6.87.2):**

```
bun install            → exit 0 · "Checked 522 installs across 610 packages"
bun run typecheck      → exit 0 · 6/6 Pakete (scope, host, atomic-write, home-paths, unit-export, web)
Host-Start 3×          → 6 s · 6 s · 6 s   (erster, kalter Lauf: 35 s)
pmh web --port 5199    → "pmh: Core läuft (Profil \"web\", Loader aktiv)"
GET /?token=…          → HTTP 303 (Weiterleitung setzt das Cookie)
GET / mit Cookie       → HTTP 200 · 32.184 B · <!doctype html>
```

**Struktur vorher → nachher:**

| | vorher | nachher |
|---|---|---|
| `apps/` | 5 Ordner, 1.064 Dateien | **2 Ordner**: `host` (4) · `web` (17) |
| Tote Verweise | 158 `workspace:*` | **0** |

### Drei Befunde, die dabei entstanden sind

**1. Der Host scheiterte zunächst — und zwar zu Recht.** Der Credential-Dienst brach ab:

```
error: credentials-local: /mnt/c/Users/Chang/.pmh/.credentials.yaml is readable
beyond its owner (mode 777); run "chmod 600 …" before starting again
```

Das ist **korrektes Verhalten** (fail-closed): eine für alle lesbare Zugangsdatei wird nicht
benutzt. **Die Ursache liegt aber tiefer:** `/mnt/c` ist als **9p ohne `metadata`** gemountet —
`chmod 600` **wirkt dort nicht** (Datei blieb `-rwxrwxrwx`). Behebung: Harness-Home ins
**Linux-Dateisystem** (`~/pmh`) — dort greift `chmod 600`. `sudo` für einen Remount mit
`metadata` war nicht verfügbar (Passwort nötig) und wurde **nicht** erzwungen.

**2. Der erste Messwert war falsch.** Ein erster Lauf meldete **~35 s** Startzeit; über drei
Läufe gemessen sind es **konstant 6 s**. 35 s war ein **Kaltstart** (Erstinitialisierung).
Die belastbare Zahl ist **6 s** — die erste war eine Einzelmessung ohne Wiederholung.

**3. `apps/host` ist eine Abweichung von `MAPPING.md`.** §3.5 nennt den Host `apps/cli`
(Stufe A). Da die Kopie dort unbrauchbar war (129 unauflösbare Verweise), tritt `apps/host`
an ihre Stelle. **Die Abweichung ist damit begründet, aber sie ist eine** — sie steht im
Kommentarkopf von `apps/host/src/main.ts` und im README.

---

## P7 · t39 — Web-Rendering: Canvas/SVG, Koordinatensystem, n-dimensionale Rotation, 3D-Zoom

**Phase: `geplant` — Konzept liegt vor, Code nicht begonnen.** Angelegt am **13.10.2026** auf
Weisung, nach dem Betreiber-Befund *„alles verpixelt, weil kein canvas genutzt wird"* samt
fehlendem Koordinatensystem, fehlender Rotation und fehlendem 3D-Zoom.

> **Auflage des Betreibers: „erst Konzept, dann Code."** Deshalb steht dieses Paket auf
> `geplant` und **nicht** auf `in Arbeit`. Das Konzept ist geschrieben, der Code beginnt erst
> nach Abnahme.

**Beleg für die Konzeptphase:** [`docs/design/3d-zoom-konzept.md`](../design/3d-zoom-konzept.md)

### P7.1 Was zu diesem Paket gemessen und gefunden wurde (nicht gedeutet)

**1. Die Verpixelung ist erklärt und hat eine Ursache in eigenem Code.** Der Betreiber hatte
`docs/status/zoom-probe.html` geöffnet — die Wegwerf-Messdatei, die auf Prüfauflage **gelöscht**
worden war. Sie zeichnete Sterne **einmal** in ein 1024×1024-Bitmap und vergrößerte dieses
Bitmap danach auf Bildschirmgröße; zusätzlich war die Zoomstufe bei 20 **gedeckelt**. Bei
Zoom 10¹² wurde dasselbe Bitmap um ~2¹⁰ vergrößert → Klötzchen. **Der Befund des Betreibers war
also richtig, und die Ursache liegt in meinem eigenen Code.** Die Deckelung war als
Speicherschutz gedacht und hat genau die Verpixelung erzeugt, die sie verhindern sollte.

**2. `apps/web` hat diese Verpixelung nicht — dort wird gar nichts gezeichnet.**
`src/lib/Universe.tsx` ist ein **leeres `<div>`** mit
`radial-gradient(ellipse at 50% 35%, #0c0a10, #050507 75%)`; die Dynamic Island ist HTML.
`three` ist in `apps/web/package.json` deklariert und liegt in `node_modules`, wird aber von
**keiner Zeile** benutzt (die Datei sagt das selbst). Möglich ist dort **Banding** des
Verlaufs — etwas anderes als Klötzchen und **nicht geprüft**.

**3. „5D" ist im ganzen Projekt nicht definiert.** Die Suche über `docs` (ohne `docs/dsh`,
`docs/design`) nach `5D|4D|360|gimbal|dolly|quaternion|koordinatensystem` findet dazu **nichts**
außer einer Einstufung als *nicht belegt* in `newdawn0-recherche.md` §3. Der Auftrag, vorhandene
Spezifikationen „z. B. aus t36/t37" zu lesen, geht ins Leere: **t37 ist `pending`.**

**4. Eigener Rechenfehler korrigiert.** `newdawn0-recherche.md` §4 hatte aus der Messung
geschlossen, das kachel-lokale Bezugssystem sei „nicht die Lösung". Das war falsch — die
Messung hat es nie geprüft. Die zutreffende Bauempfehlung lautet: **Stufe → Kachelindex →
lokaler Versatz.** Korrektur dort eingetragen und in §2.3/§2.4 des Konzepts hergeleitet.

### P7.2 Die Phasen (Checkliste)

| # | Phase | Schritt | Stand |
|---|---|---|---|
| P7.1 | **Untersuchung** | Ursache der Verpixelung in eigenem Code gefunden und belegt | **erledigt** |
| P7.2 | **Untersuchung** | `apps/web` inventarisiert: kein Canvas, `three` ungenutzt | **erledigt** |
| P7.3 | **Untersuchung** | Suche nach vorhandener 5D-/Rotations-Spezifikation — keine vorhanden | **erledigt** |
| P7.4 | **Konzept** | Koordinatensystem-Konvention verbindlich festschreiben (Händigkeit, Achsen, Kachelmaß, zwei Zahlenräume) | **erledigt** — Konzept §2 |
| P7.5 | **Konzept** | „5D" in drei Begriffe zerlegen und entscheiden | **erledigt** — Konzept §3, Betreiber wählte „beides" |
| P7.6 | **Konzept** | Darstellungsweg festlegen: Canvas 2D für die Welt, SVG fürs Overlay, `devicePixelRatio` Pflicht | **erledigt** — Konzept §4 |
| P7.7 | **Abnahme** | Betreiber nimmt das Konzept ab; **danach** beginnt der Code | **offen** |
| P7.8 | Implementierung | Rotationsmodul für `n` Dimensionen (5D → 10 Drehflächen), Quaternion für 3D | **offen** |
| P7.9 | Implementierung | Kamera: `logZoom`, `double`-Zustand, Dolly-Zoom | **offen** |
| P7.10 | Implementierung | Canvas-Welt mit `devicePixelRatio`, pro Stufe **neu gezeichnet** | **offen** |
| P7.11 | Implementierung | SVG-Overlay: Achsen, Gitter, Teilstriche, Einheiten, Maßstab | **offen** |
| P7.12 | Test | Längentreue, 360°-Rückkehr, Orthogonalität/Determinante, Zoom-Äquivalenz, Welt↔Bildschirm | **offen** |
| P7.13 | Test | **Schärfe-Test:** ein Kreis bleibt bei Zoom 10⁰…10¹² rund — der Test gegen die Verpixelung | **offen** |
| P7.14 | Nachweis | `bun run typecheck` exit 0, Tests exit 0, Host aus `apps/cli` HTTP 200, Funktionen manuell geprüft | **offen** |
| P7.15 | Nachweis | Bericht in `docs/status/` + Register aktualisiert | **offen** |

**Regel für dieses Paket:** kein Häkchen ohne Beleg. P7.13 ist der wichtigste Test — er prüft
genau die Eigenschaft, die P7.1 verloren hat.

---

## R · Erinnerte Harness-Anforderungen / Technikliste

> **Was dieser Abschnitt ist:** die vom Betreiber erneut vorgelegte Technik- und
> Anforderungsliste (13.10.2026), abgeglichen mit dem **bestehenden verbindlichen Plan**.
> Er ändert **nichts** an der Reihenfolge (Hybrid-Meilenstein → drei Arbeitspakete →
> Ansatz A → Self-Improve-Schleife) und startet **keine** Implementierung.
>
> **Regel für diesen Abschnitt:** Neue Punkte stehen auf `geplant`, **nie** auf `in Arbeit`.
> Nichts wird als „abgenommen" geführt, wofür kein Nachweis existiert.

### R.0 Die Statusklassen

| Klasse | Bedeutung |
|---|---|
| **A** | **belegt** — es gibt einen Nachweis (Datei, Befehl, Ergebnis) |
| **B** | **geplant** — steht schon in Phase 1 (Go) oder Phase 2 (Bun/TS7) |
| **C** | **neu** — in den Backlog aufgenommen, Phase `geplant` |
| **D** | **Konflikt** — Entscheidung des Betreibers erforderlich, **nicht** stillschweigend übernehmen |

### R.1 Die Liste

Kein Punkt dieser Liste wurde in diesem Auftrag implementiert, installiert oder verändert.
Jede Zeile nennt Klasse, Phase und Beleg **oder** den Grund, warum sie offen ist.

| Technik / Anforderung | Klasse | Phase | Beleg / Begründung |
|---|---|---|---|
| **DeepSeek Harness als Basis** | **A** | — | `docs/decisions/core-supply.md` (Weg B, Hybrid); Upstream-Core `0.2.1-alpha.2` als Abhängigkeit; Host läuft, `GET /?token=…` → **HTTP 200** |
| **Bun + Go + TS7** | **A** | — | Bun 1.4.0/1.4.3, Go 1.27.2, TS 7 (`tsgo`) — gemessen; `bun install` exit 0, `tsgo --noEmit` exit 0 |
| **Rust statt Python** | **A** | — | 7 Rust-Crates unter `native/` + `services/pmh-sandbox`; unter Linux **126 Tests grün** (`docs/status/wsl2-linux-nachweis.md`) |
| **NixOS-Selbständerung** | **A** | — | `docs/design/nixos-self-change.md` (262 Zeilen) + `services/pmh-nix` (60 Tests grün). **NixOS/Nix werden NICHT installiert** — Konzept und austauschbare Schnittstelle, mehr nicht |
| **NixOS per WSL2-Umgebung, Docker/Podman** | **A / C** | — | WSL2 läuft (Linux 6.6.87.2) und ist Standard-Umgebung (`t25`). Docker-Desktop-**WSL-Integration ist für Ubuntu nicht aktiviert** (`/var/run/docker.sock` fehlt) — offener Punkt, siehe L14 |
| **WSL2-Installer/Checker per Befehl oder Programm** | **C** | `geplant` | Neuer Punkt. Der Harness soll WSL2/Docker/Podman **prüfen und bei Bedarf installieren**. Berührt die Regel „Dienste starten mit der Harness" (`concept.md` Regel 3) — als Unit zu bauen, nicht im Core |
| **Plugin-Export (Units weitergeben)** | **A** | — | `packages/units/unit-export`; Roundtrip-Digest `sha256:ac37e0ec…` identisch, 158 Tests grün (`docs/status/plugin-export-nachweis.md`) |
| **DeepSeek als Plugin und Skill exportierbar** | **C** | `geplant` | Baut auf dem belegten Plugin-Export auf (A). Inhaltlich neu: ein Unit, das den DeepSeek-Adapter als Bündel ausgibt |
| **PostgreSQL + pgvector** | **B** | Phase 1 (Go) | `services/pmh-store` — in `MAPPING.md` §3.7 und `t30` geführt. Nicht implementiert |
| **Redis** | **B** | Phase 1 (Go) | `services/pmh-cache` — **standardmäßig aus** (`docs/project-profile.md` §3: „erst bei belegtem Bedarf") |
| **Obsidian als Memory + Graph View** | **B** | Phase 1 (Go) | `services/pmh-memory` (Markdown + Wikilinks). **Offener Konflikt** aus `open-questions.md`: ist Obsidian das Gedächtnis *oder* nur eine Ansicht? Bleibt offen |
| **Git: Forgejo / Gitea / GitLab CE** | **B / D** | Phase 1 (Go) | `services/pmh-git`. **Auswahl der Plattform ist offen** (`docs/vision.md`) — Entscheidung `D` |
| **Projekt-Stack-/Ordneransicht (VSC-artig)** | **D** | — | **GUI/UI** — laut Auftrag außen vor. `web/apps/web` bleibt **unverändert**. Als Anforderung notiert, nicht bearbeitet |
| **code-server / OpenVSCode Server / Theia** | **C / D** | `geplant` | **Externe Werkzeuge**, nicht Teil des Harness-Codes. Als Unit zu starten (Dienst), nicht einzubauen |
| **Firecrawl + SearXNG** | **B** | Phase 1 (Go) | `services/pmh-research` — Extraktion + Metasuche |
| **Decision-Model Jev / Laya** | **B / D** | Phase 1 (Go) | `services/pmh-decision`. **Harte Regel** (`docs/backend-analysis.md` §2.5): das Entscheidungsmodell darf **keine Sicherheitsregeln überschreiben** — im Typensystem unmöglich zu machen, nicht nur zu dokumentieren |
| **LangChain / LangGraph** | **D** | — | **Konflikt:** im Python-Ökosystem verankert. Die Projektregel verbietet Python. `docs/backend-analysis.md` §3.6 verlangt deshalb ausdrücklich: **Konzepte übernehmen** (Graph-Workflows, Checkpoints, Wiederaufnahme, Human-in-the-loop), **nicht** die Bibliothek. Offener Konflikt Nr. 1 |
| **RAG** | **B** | Phase 1 (Go) | Setzt `pmh-store` (pgvector) voraus. Konzept vorhanden, Implementierung nicht |
| **WireGuard / Tailscale / Cloudflared-Alternative** | **C / D** | `geplant` | Netzwerk-Fernzugriff. **Auswahl offen** (`docs/vision.md`): ein Tailnet genügt **oder** braucht es einen Reverse-Proxy? Das entscheidet die Bauform |
| **n8n** | **D** | — | **Konflikt:** externes Werkzeug, aber **nicht** Kern-Orchestrierung (`docs/vision.md`: „extern, nicht Kern-Orchestrierung"). Ein zweiter Loop neben dem Agent-Loop ist genau die Doppel-Semantik, die §3.3 vermeiden will. Offener Konflikt Nr. 2 |
| **Tesseract OCR** | **B / D** | Phase 1 (Go) | `services/pmh-ocr`. **Konflikt:** Tesseract ist C++ — als **externes Programm** über die Prozessgrenze aufrufbar (Regel 4), **nicht** als eingebundene Bibliothek. Die Grenze ist damit einhaltbar, aber sie muss ausdrücklich gezogen werden |
| **Mirage-Tesseract** | **D** | — | `docs/vision.md` führt es als **„ungeprüft"**: die Recherche fand nur Foto-Editor-Apps, nicht den gemeinten Dienst. **Muss vom Betreiber präzisiert werden**, bevor es geplant wird |
| **Assistent / Researcher / Fine-Tune-Skills** | **C** | `geplant` | Zielbild aus `docs/vision.md`. Skills sind das **billigste** Unit (`concept.md`: „Agent-Skill ohne Host-Code") — deshalb hier als eigener Backlog-Punkt, obwohl der Core fehlt |
| **NewDawn-Zoom-Technik** | **D** | recherchiert | **Konflikt:** `docs/project-profile.md` §4 hat die frühere Deutung **korrigiert** — NewDawn0 ist ein **Nix-/Systementwickler ohne UI-Projekt**; die „Zeichnungen" sind die **eigenen Skizzen** des Betreibers. Die Zoom-/Tensor-Technik ist damit **Darstellungsvorbild**, kein übertragbarer Code. GUI bleibt außen vor. **Nachtrag 13.10.2026:** Außenrecherche erbracht — alle 70 öffentlichen Repos geprüft (3 Seiten + Profilsuche nach `zoom`: 0 Treffer), **keine** der acht Behauptungen dort belegbar; dafür die eigentliche Technik geprüft und die **float32-Zoom-Grenze nachgerechnet**. Beleg: [`newdawn0-recherche.md`](newdawn0-recherche.md) — **kein** Messprogramm, kein Artefakt (siehe §4.1 dort) |
| **Obsidian-Docking als UX/GUI/UI-Konzept** | **D** | — | **Konflikt:** es ist ein **Oberflächen**-Konzept. Laut Auftrag bleibt GUI/UI/Web unverändert. Als Konzept notiert, **keine** Umsetzung |

### R.2 Die Konflikte, ausdrücklich benannt

Diese Punkte sind **keine** offenen Aufgaben, sondern **Entscheidungen**. Sie stehen hier,
damit sie nicht später als „vergessen" oder als „stillschweigend übernommen" erscheinen:

| # | Konflikt | Warum er zählt | Nötige Entscheidung |
|---|---|---|---|
| **K1** | **LangChain / LangGraph** | Python-verankert; die Projektregel verbietet Python. Ein zweites Orchestrierungs-Framework über einen bestehenden Agent-Loop erzeugt **zwei konkurrierende Loops** | Konzepte nachbauen (`docs/backend-analysis.md` §3.6) **oder** Python als Ausnahme zulassen. Bis dahin: **nicht** übernehmen |
| **K2** | **n8n** | Externes Workflow-Werkzeug; `docs/vision.md` schließt es als **Kern-Orchestrierung** ausdrücklich aus | Nur als **externen Dienst** anbinden (Unit) **oder** weglassen |
| **K3** | **Tesseract** | In C++ geschrieben; erlaubt ist nur die **Prozessgrenze** (Regel 4), nicht das Einbinden | Aufruf als externes Programm festschreiben — dann ist der Punkt einhaltbar |
| **K4** | **GUI / UI / UX / Web** | Auftrag: bleibt **außen vor**. `web/apps/web` unverändert. Zoom-Technik, Docking-Konzept und Projekt-Stack-Anzeige sind Oberflächen-Themen | Später, in einer eigenen Phase — **nicht** jetzt |
| **K5** | **Mirage-Tesseract** | Laut eigener Doku **ungeprüft** und inhaltlich unklar | Betreiber präzisiert, was gemeint ist |
| **K6** | **NixOS/Nix installieren?** | Der Harness soll Werkzeuge prüfen/installieren (neuer Punkt R), aber NixOS bleibt **Konzept ohne Installation** | Zwei getrennte Dinge: **Umgebungs-Prüfer** (Unit, erlaubt) vs. **NixOS-Installation** (weiterhin ausgeschlossen) |

### R.3 Was dieser Abschnitt ausdrücklich **nicht** getan hat

- **Keine** Codeänderung, kein Build, **keine** Web-Änderung (`apps/web` unberührt).
- **Keine** Installation — kein NixOS, kein Nix, kein Docker, kein Podman, kein n8n,
  kein Tesseract. Nichts wurde eingerichtet oder geprüft-installiert.
- **Keine** Vorlage-Nutzung: `C:\Users\Chang\harness\prometheus-harness` blieb unberührt;
  `docs\dsh` und `docs\design` wurden nicht geöffnet.
- **Keine** Umbenennung: bestehende Kennungen `t25`–`t31` und die Phasen bleiben, wie sie waren.
  `t30` bleibt `in_progress`, `t27`/`t28`/`t29`/`t31` bleiben `pending`.
- **Keine** Behauptung „implementiert" ohne Nachweis: jeder `A`-Eintrag nennt eine Datei oder
  eine Messung; alles andere steht auf `geplant` oder `Konflikt`.

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
| 2026-10-13 | **L12 behoben → P2 von `in Arbeit` auf `abgenommen`** | Die Notiz in `unit-export/unit.json` behauptete noch, der Plugin-Host sei „nicht Teil dieses Pakets". Das war beim Schreiben korrekt und wurde durch die Nacharbeit falsch. Korrigiert; `description` nennt den Host jetzt mit. Nachgemessen: `unit.json` strukturell gültig (4 notes, `contract: ^0.2.0`), `bun run typecheck` **exit 0**, `bun test` **158 pass / 0 fail** |
| 2026-10-13 | **Roundtrip-Nachweis als eigene Datei** [`plugin-export-nachweis.md`](plugin-export-nachweis.md) | Der Beweis lag bisher nur als Kommandoausgabe im Protokoll. Als Datei ist er nachprüfbar: Export-Digest `sha256:ac37e0ec…`, Rückexport **identisch**, Inhalt `sha256:84cef3f8…` beide Male gleich. Der **Dateihash** des Bündels ist bewusst **nicht** das Vergleichsmaß — er enthält Zeitstempel |
| 2026-10-13 | **Befund: paralleles Testen erzeugt Fehlalarme** — zweimal `checkBundle > H1` rot, isoliert exit 0 | Ursache war ein Testlauf, während ein anderer Arbeiter dieselben Dateien schrieb (`errors.ts` 00:06:57, `plugin-host.test.ts` 00:16:52). Regel daraus: **Tests nicht parallel zu Schreibvorgängen auf denselben Dateien** — ein Ergebnis über einen halbfertigen Stand ist ein Befund über den Ablauf, nicht über den Code |
| 2026-10-13 | **P6 angelegt und abgenommen: Auflage A1 erfüllt.** `apps/cli`, `apps/desktop`, `apps/desktop-host` entfernt (1.043 byte-identische Dateien, 158 `workspace:*`-Verweise); `apps/host` um `--profile`/`--port`/`--patches` erweitert; `LICENSE` (MIT) angelegt | Die Kopien widersprachen dem Auftrag und blockierten `bun install`. Nachweis: `bun install` exit 0, `bun run typecheck` exit 0 (6/6), Host-Start 6 s, HTTP 200 mit 32.184 B |
| 2026-10-13 | **Korrektur eines eigenen Messfehlers:** Startzeit des Hosts ist **6 s**, nicht 35 s | Die 35 s stammten aus einem **kalten** Einzellauf. Erst die Wiederholung über drei Läufe ergab den belastbaren Wert — eine Einzelmessung ohne Wiederholung ist keine Messung |
| 2026-10-13 | **Befund DrvFS:** `/mnt/c` ist als 9p **ohne `metadata`** gemountet, `chmod` wirkt dort nicht | Der Credential-Dienst verweigerte den Start korrekt (`mode 777`). Behebung: Harness-Home ins Linux-Dateisystem (`~/pmh`) |
| 2026-10-13 | **NewDawn-Zoom-Technik (Abschnitt R) von `—` auf `recherchiert`** — neuer Beleg [`newdawn0-recherche.md`](newdawn0-recherche.md) | Betreiber stellte klar: NewDawn0 war nur ein **Beispiel**, gemeint ist die **Sache** (Zoom-/Chunk-Technik als Universum-Hintergrund). Ergebnis: bei NewDawn0 **nichts** belegbar (70 Repos, Profilsuche `zoom` = 0 Treffer), aber die Technik selbst geprüft — und dabei eine **nachgerechnete** Grenze gefunden (float32). **Kein** Projektcode berührt, `apps/web` unverändert |
| 2026-10-13 | **Auflage verletzt und zurückgenommen:** zu diesem Paket wurde eine HTML-Messseite angelegt (`docs/status/zoom-probe.html`) — der Auftrag sagt aber „**KEINE** Code-Implementierung", verlangt waren Außenrecherche und Bericht | Die Prüfung beanstandete es zu Recht. Datei **gelöscht** (war nie committet), alle Verweise entfernt, `docs/INDEX.md` bereinigt. Der Fehler war nicht die Messung, sondern dass ein **Widerspruch zwischen Auftrag und Einzelfrage** nicht gemeldet, sondern einseitig aufgelöst wurde. Der Messweg steht jetzt als **abdruckbares Kommando** im Bericht (§4) — nachprüfbar ohne Artefakt |
| 2026-10-13 | **Eigener Rechenfehler im Bericht korrigiert:** die vierte Spalte der Messtabelle führte „chunklokal = 0" für alle Zeilen — übernommen aus einer älteren Messreihe, in der dort „rebased" stand | Beim Nachrechnen für die korrigierte Fassung aufgefallen. Richtig ist: beide Punkte liegen in **verschiedenen Kacheln**, chunklokal ist dort gar nicht definiert — und **das ist der Befund**, der die Hierarchie begründet. §4.1 des Berichts hält den Fehler fest statt ihn zu überschreiben |
| 2026-10-13 | **„Messung" von „Rechnung" getrennt:** die Zahlen in §4 sind Rechenergebnisse, keine Bildraten — kein Browser wurde geöffnet | `docs/status/README.md` verlangt, Gemessenes von Gedeutetem zu trennen. „Funktioniert im Browser gut" ist damit weiterhin **unbewiesen**; die Bildraten-Messung wäre ein **eigener** Auftrag |
| 2026-10-13 | **Neues Paket P7 / Todo t39 angelegt** — „Web-Rendering: Canvas/SVG, Koordinatensystem, n-dimensionale Rotation, 3D-Zoom", Phase `geplant`, Beleg [`../design/3d-zoom-konzept.md`](../design/3d-zoom-konzept.md) | Betreiber meldete verpixelte Darstellung, fehlendes Koordinatensystem, fehlende 5D-Rotation und fehlenden 3D-Zoom. Er wählte ausdrücklich **„erst Konzept, dann Code"** → Paket bleibt auf `geplant`, Code beginnt erst nach Abnahme (P7.7) |
| 2026-10-13 | **Ursache der Verpixelung gefunden — in eigenem Code.** Der Betreiber hatte die **gelöschte** Wegwerf-Datei `docs/status/zoom-probe.html` geöffnet; sie malte Sterne einmal in ein 1024-px-Bitmap, **deckelte** die Zoomstufe bei 20 und vergrößerte dann dasselbe Bitmap um ~2¹⁰ → Klötzchen | Der Befund des Betreibers war **richtig**. Die Deckelung war als Speicherschutz gedacht und erzeugte genau das, was sie verhindern sollte. Merksatz im Konzept: *ein gerastertes Bild, das man vergrößert, wird unscharf.* Der frühere Auftrag hatte die Faktenlage **umgekehrt** dargestellt (Bericht „gelöscht", Probe als lebend) — richtig ist: **Probe gelöscht, Bericht committet** |
| 2026-10-13 | **Befund: `apps/web` zeichnet gar nichts.** `src/lib/Universe.tsx` ist ein **leeres `<div>`** mit CSS-Verlauf; `three` ist deklariert, installiert und **von keiner Zeile benutzt** | Damit ist die Verpixelung **nicht** in `apps/web` entstanden. Möglich ist dort **Banding** des Verlaufs (wenige Farbstufen zwischen `#0c0a10` und `#050507`) — das ist etwas anderes als Klötzchen und **nicht geprüft** |
| 2026-10-13 | **Befund: „5D" ist im Projekt nirgends definiert.** Suche über `docs` nach `5D\|4D\|360\|gimbal\|dolly\|quaternion\|koordinatensystem` → kein Treffer außer der Einstufung *nicht belegt* | Der Auftrag verlangte, vorhandene Spezifikationen „z. B. aus t36/t37" zu lesen — **t37 ist `pending`**. Deshalb wurde „5D" im Konzept §3 in **drei Begriffe** zerlegt (N-dim Raum / 3D-Welt / semantische Stufe) und vom Betreiber entschieden: **beides**, Modul für n Dimensionen **und** sichtbare 3D-Welt |
| 2026-10-13 | **Eigener Denkfehler korrigiert:** `newdawn0-recherche.md` §4 hatte aus der Messung geschlossen, das kachel-lokale Bezugssystem sei „nicht die Lösung" | **Falsch** — die Messung hat es nie geprüft (die Bedingung „beide Punkte in derselben Kachel" war nie erfüllt, deshalb stand dort „andere Kachel"). Zutreffend ist: **Stufe → Kachelindex → lokaler Versatz.** Korrektur in §4 eingetragen, Herleitung in Konzept §2.3/§2.4 |
| 2026-10-13 | **Eigener Messfehler korrigiert:** die erste Messreihe führte „rebased (Chunk-Ursprung)" als Lösung — die Messung zeigt, dass es an mehreren Stellen **schlechter** ist als naiv | Der Fehler hängt an der **größten** float32-Zahl, nicht am Verfahren. Die Probe wurde auf vier Wege umgestellt (naiv / kameranah / chunklokal) und die Zahlen in §4 des Berichts offengelegt. Die erste Fassung der Probe hätte eine falsche Bauempfehlung gestützt |
