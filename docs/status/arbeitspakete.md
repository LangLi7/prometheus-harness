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

## P10 · t39 — Web-Rendering: Canvas/SVG, Koordinatensystem, n-dimensionale Rotation, 3D-Zoom

> **Zur Nummer:** Dieser Abschnitt stand zuerst als `P7`. Waehrend daran gearbeitet wurde, hat
> ein zweiter Arbeiter `P7` ebenfalls vergeben (`t40`, Windows-Start) und `P8`/`P9` belegt.
> Die Kennung ist hier deshalb auf **P10** verschoben — **doppelte Kennungen sind schlimmer als
> eine unschoene Reihenfolge.** Die anderen Abschnitte wurden **nicht** angetastet.

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

### P10.2 Die Phasen (Checkliste)

> **Zur Schreibweise:** Die Schritte behalten ihre Kennungen `P7.x` — sie sind so in
> `docs/design/3d-zoom-konzept.md` §7.3 und in frueheren Staenden verlinkt. Nur der
> **Abschnitt** heisst P10.

| # | Phase | Schritt | Stand |
|---|---|---|---|
| P7.1 | **Untersuchung** | Ursache der Verpixelung in eigenem Code gefunden und belegt | **erledigt** |
| P7.2 | **Untersuchung** | `apps/web` inventarisiert: kein Canvas, `three` ungenutzt | **erledigt** |
| P7.3 | **Untersuchung** | Suche nach vorhandener 5D-/Rotations-Spezifikation — keine vorhanden | **erledigt** |
| P7.4 | **Konzept** | Koordinatensystem-Konvention verbindlich festschreiben (Händigkeit, Achsen, Kachelmaß, zwei Zahlenräume) | **erledigt** — Konzept §2 |
| P7.5 | **Konzept** | „5D" in drei Begriffe zerlegen und entscheiden | **erledigt** — Konzept §3, Betreiber wählte „beides" |
| P7.6 | **Konzept** | Darstellungsweg festlegen; `devicePixelRatio` Pflicht | **erledigt** — Konzept §4, in §8.1 auf **three.js** korrigiert |
| P7.7 | **Abnahme** | Betreiber nimmt das Konzept ab; **danach** beginnt der Code | **teilweise erteilt** — freigegeben ist der Prototyp (Konzept §8), nicht Barrierefreiheit/Leistung/Daten |
| P7.8 | Implementierung | Rotation: Quaternion für 3D, ohne Gimbal-Sperre | **belegt im Prototyp** — `src/camera.ts`, Tests „360 Grad ohne Sperre", „ueber den Pol hinweg" |
| P7.9 | Implementierung | Kamera: Zoom als Faktor, Bezugswechsel („Fix Fokus"), Blickrichtung | **belegt im Prototyp** — `src/camera.ts` |
| P7.10 | Implementierung | Welt pro Bezugsebene **neu gebaut**, Beschriftungen als Text statt Textur | **belegt im Prototyp** — `src/scene.ts` |
| P7.11 | Overlay | Achsenkreuz **in der Welt** + Lineal-Panel | **belegt im Prototyp** — `UniverseView.buildAxes`, Panel `ruler` |
| P7.12 | Test | 360°-Rückkehr, keine Sperre, Zoom-Faktor, Bezugswechsel, Suche, Weg der Treffer | **belegt** — 39 Tests, 0 Fehler |
| P7.13 | Test | **Schärfe-Test** (Kreis bleibt bei jedem Zoom rund) | **offen** — im Prototyp nicht messbar ohne Browser |
| P7.14 | Nachweis | Typecheck, Tests, Server | **belegt** — `tsgo` exit 0, 39 Tests, `vite build` exit 0, HTTP 200 |
| P7.15 | Nachweis | Bericht + Register | **belegt** — dieser Abschnitt und Konzept §8 |
| P7.16 | Nachweis | **Bild** — sieht es aus wie gedacht? | **offen** — kein Browser geoeffnet |
| P7.17 | Implementierung | Rotation in **n** Dimensionen (5D → 10 Drehflächen) | **offen** — der Prototyp dreht in 3D |

**Regel für dieses Paket:** kein Häkchen ohne Beleg. P7.13 und P7.16 sind die wichtigsten
offenen Punkte — P7.13 prüft die Eigenschaft, die P7.1 verloren hat, und P7.16 ist die einzige
Prüfung, die kein Test ersetzen kann.

### P10.3 Der Prototyp — `snapshots/web`

**Auftrag des Betreibers (13.10.2026):** ein Web-Prototyp mit **zwei Modi** (Chat und
OS-Dynamic-Island), **andockbaren Panels**, der **3D-Welt** mit Rotation, Tiefen-Zoom,
Bezugswechsel und Objektsuche — **noch ohne Harness-Anbindung**.

**Warum `snapshots/`:** der Betreiber hat den Ort so gewaehlt. **Befund dazu, offen benannt:**
der Ordner ist **nicht versioniert** (`git ls-files snapshots` = 0 Dateien) und enthaelt sonst
nur leere Laufzeit-Unterordner. Der Prototyp liegt damit **ausserhalb** von Git und ausserhalb
des Typecheck-Laufs der Wurzel. Das ist bewusst so gelassen — aber es heisst: **dieser Code
wird nicht gepusht.** Wer ihn erhalten will, muss das entscheiden.

| Datei | Rolle |
|---|---|
| `index.html` | Einstieg, kein Rahmen |
| `vite.config.ts` | Port 5176, `strictPort: false` (Prototyp, mehrere Fassungen moeglich) |
| `tsconfig.json` | streng, wie `apps/web` |
| `src/universe.ts` | Der Baum: fuenf Bezugsebenen, Suche mit Weg und Weltkoordinaten |
| `src/camera.ts` | Quaternion-Drehung, Zoom als Faktor, Bezugswechsel, Zustand je Raum |
| `src/scene.ts` | three.js: Objekte, Glorienschein, Achsenkreuz, Beschriftungen als Text |
| `src/docking.ts` | Andock-Regeln — **rein**, ohne DOM, deshalb pruefbar |
| `src/dock-view.ts` | Ziehen, Zielmarken, Reiter, Groessen, schwebende Panels |
| `src/room.ts` | Die Grenze zwischen zwei Nutzern (eigene Instanz) |
| `src/chat.ts` | Chat-Modus aus der Vorlage `002-Chat Perspektive` |
| `src/main.ts` | Huelle: Modi, Zeiger, Tastatur, Schleife |
| `src/app.css` | Tokens **woertlich** aus den Skizzen |
| `tests/*.test.ts` | 39 Tests |

**Nachweis (gemessen am 13.10.2026):**

```
bun test              → 39 pass · 0 fail · 319 expect() calls
tsgo --noEmit         → exit 0
vite build            → exit 0 · dist/index.html 0,86 kB · CSS 8,22 kB · JS 554,36 kB (three.js)
GET 127.0.0.1:5176/   → HTTP 200 · 821 B
```

**Was der Prototyp nicht kann — ausdruecklich:**
- **Keine Harness-Anbindung.** Chat-Antworten sind erfunden und als solche gekennzeichnet.
- **Keine echte Physik.** Bahnen sind gerechnete Lagen, keine n-Koerper-Simulation.
- **Keine Datenbank.** Massen sind Attrappen; pgvector ist **Scheibe 3**.
- **Kein Sicherheitsmerkmal.** Der Raum ist ein Name aus der Adresse (`?room=…`), keine
  Zugangskontrolle. Die echte Grenze zieht spaeter der Container.
- **Nicht gemessen:** Bildrate und Aussehen. Kein Browser wurde geoeffnet.

### P10.4 Vier Fehler, die die Tests und der Typecheck gefunden haben

Festgehalten, weil sie zeigen, wofuer die Pruefungen da sind:

| Fehler | Gefunden von | Wirkung, wenn er geblieben waere |
|---|---|---|
| **Bezugsebenen waren verkehrt herum numeriert** (5 = groesster statt feinster) | Test „fuenf Bezugsebenen" | Die Welt haette bei jedem Zoom die falsche Ebene gezeigt |
| **Zoom-Richtung war umgekehrt** (positiver Rastschritt entfernte) | Test „hineinzoomen verkuerzt" | Das Rad haette in die verkehrte Richtung gezoomt — am Bildschirm nur „fuehlt sich falsch an" |
| **`..` kam durch die Raumnamen-Bereinigung** (`../../bob` → `..-..-bob`) | Test „Pfadanteile" | Der Speicherschluessel haette wie ein Pfad ausgesehen |
| **Blickrichtungs-Test rechnete nicht zurueck** (schaute auf `+z` statt auf `-z`) | Test „360 Grad" | Ein Test, der nichts prueft, ist schlimmer als kein Test |

### P10.5 Steuerung und Sprache: Einstellungen sind Plugins, Sprache ist ein Paket

**Weisung des Betreibers (13.10.2026):** „die könnte man in settings implementieren fuer stuerung"
und „sprache nicht vergessen das wir auf englisch standard und deutsch unterstuetzen diese sprache
fuer den harness wird durch eine language package/plugin implementiert, wie beim Visual studio code
extension verstehst du?"

Umgesetzt ist die VS-Code-Form: **Verwaltungen im Kern, Inhalte als Pakete.**

| Teil | Datei | Rolle |
|---|---|---|
| Einstellungen | `snapshots/web/src/settings.ts` | Kern. Kennt **keine** Einstellung — nur Schema, Bereichsprüfung, Speicherung je Raum |
| Sprachkern | `snapshots/web/src/i18n.ts` | Kern. Kennt **keine** Sprache — nur Schlüssel, aktive Sprache, Rückfall in die Standardsprache |
| Sprachpakete | `locales/de.ts`, `locales/en.ts` | reine Daten, je als **Plugin** eingetragen (`locale-de`, `locale-en`) |
| Sprachauswahl | `locale-plugins.ts` (`ui-language`) | die Einstellung `language.locale`; Optionen als **Funktion**, weil die Paketliste sich ändern kann |
| Steuerung | `control-settings.ts` (`ui-controls`) | Drehen, Zoomen, Schieben, Achsenkreuz, Dimensionen, Namen |
| Einstellungsbildschirm | `settings-screen.ts` (`ui-settings`) | zeigt an, was **andere** beschreiben — kennt selbst keine Einstellung |

**Englisch ist der Standard** (`DEFAULT_LOCALE = 'en'`), **Deutsch liegt bei**. Beim **ersten** Start
schlägt der Browser die Sprache vor (`navigator.language`); danach gilt die Entscheidung des
Nutzers — auch „Englisch". Die Unterscheidung liegt in `room.hasSetup()`, weil sie am **Raum** hängt.

**Die Steuerungswerte sind aus dem Code verschwunden** und werden bei jeder Bewegung **gelesen**,
nicht in eine Variable kopiert:

| Einstellung | ersetzt | Vorgabe |
|---|---|---|
| `control.rotateSpeed` | `ROTATE_SPEED` in `camera.ts` | 0,00175 rad/px |
| `control.zoomFactor` | `ZOOM_FACTOR_PER_NOTCH` | 1,25 |
| `control.axisSpin` | `AXIS_SPIN_SPEED` in `main.ts` | 0,006 rad/px |
| `control.panFactor` | `0.0011` in `panBy` | 0,0011 |
| `control.showAxes` | — | an |
| `world.dimensions` | die feste 5 in `weltMatrix()` | 3 (3 … 5) |

**Die Griffe am Achsenkreuz.** Der Betreiber: „ich möchte also auch diese achse dinger nutzen können
um rotation bewegung zu machen" und „fehlt unten beim achsen noch eine rotation Kugel". Jede Achse
hat deshalb drei SVG-Knoten (dicke Trefferlinie, Strich, Endpunkt); ein Zug am Endpunkt dreht die
**Welt** um die beiden **anderen** Achsen. Unten sitzt ein Ring für die freie Drehung in der
Bildebene. Die Knoten werden weiterhin **nur verschoben**, nie neu gebaut — der Grund steht in P10.5
des Konzepts (die erste Fassung ruckelte, weil sie alle 500 ms `innerHTML` setzte).

### P10.6 Zwei eigene Fehler in dieser Runde — beide offen benannt

**1. Das leere Bild war ein `ReferenceError` beim Laden.** `registerLocalePlugins` ruft beim
Eintragen `onSwitch → relabel()`, und `relabel()` griff auf `dock` zu, das erst weiter unten
deklariert wird. Das Modul starb, **bevor** `requestAnimationFrame(loop)` erreicht war. Sichtbar war
davon nichts als ein schwarzes Canvas — der Betreiber: „weitermachen und das ist komisch aus btw
komplett leer". Behoben durch die Marke `aufgebaut` und einen **Test, der die Hülle wirklich lädt**
(`tests/boot.test.ts` mit `tests/dom-stub.ts`). Der Test ist **gegengeprüft**: mit wieder
eingebautem Fehler meldet er `ReferenceError: Cannot access 'dock' before initialization`.

**2. Eine Zahl, die ich zweimal falsch hatte.** In einem Zwischenschritt stand in `camera.ts`,
`0,00175 rad/px` seien „57 Pixel je Grad" und der CAD-Bereich liege bei 40 bis 60. Nachgerechnet ist
`(π/180)/0,00175` = **9,97 px/°**. Der erste Korrekturversuch machte es nicht besser („9,97", dann
„32,7" — beide Male dieselbe Verwechslung von Grad und Radiant). Richtig ist **9,97** (alt: 4,15).
Der Faktor 2,4 zwischen alt und neu stimmt, die Entscheidung langsamer zu drehen bleibt richtig.

**Was daraus geblieben ist:** die Umrechnung steht jetzt in `settings.ts` (`pixelsPerDegree`,
`degreesPerWidth`) und ist **mit Gegenprobe** geprüft (10 px Zug × 0,00175 = 1,0°). Und die Anzeige
nennt die Größe, die man wirklich spürt: **Grad je Bildschirmbreite** — 0,00175 rad/px sind 128° je
1280 px, also zwei Züge für eine volle Drehung; der alte Wert waren 308°, also mehr als einmal
herum in **einem** Zug.

**Nicht behoben, weil außerhalb des Auftrags:** `Set-Content -NoNewline` hat beim Aufräumen alle
Zeilenumbrüche aus `main.ts` entfernt und damit die Kommentargrenzen zerstört. Die Datei wurde neu
geschrieben; die Ursache war ein **eigener Bedienfehler** in PowerShell, nicht im Prototyp.

### P10.7 Der Prüfstand dieser Runde

| Prüfung | Ergebnis |
|---|---|
| `bun test` | **173 pass / 0 fail** (15 Dateien) |
| `tsgo --noEmit` | exit 0 |
| `vite build` | exit 0, Schriften im `dist` |
| Dev-Server | HTTP 200 auf `127.0.0.1:5176` |
| Sichtprüfung | vergleiche P10.9 — jetzt **gemessen**, nicht geschätzt |

### P10.8 Der Unterschied, den der Betreiber gesehen hat: Maße aus dem Harness, Farben aus der Welt

Der Betreiber hat zwei Bilder nebeneinandergestellt und gefragt: „siehst du der unterschied???" Er
hatte recht, und die Ursache war **keine Geschmacksfrage**:

> **Die Maße waren aus dem Harness, die Farben waren meine.**

Ich hatte die Werte aus `InputBar.module.css` und `ChatView.module.css` **abgeschrieben** und die
Farben aus einem eigenen `:root`-Block bezogen — von Hand aus `design-platform.css` herausgelesen.
Abgeschriebene Werte sind eine **zweite Wahrheit**: sie stimmen heute und driften morgen. Der Test
war die Sichtprüfung, und sie ist durchgefallen.

**Behoben durch echte Übernahme — der Betreiber hat es ausdrücklich erlaubt:** „weisst du was du
darfst auch wenn du es quasi 1:1 übernimmst mit dem aktuellen harness komplett übernehmen das es auch
funktioniert".

`src/design-system.css` importiert deshalb fünf Blätter aus `ui-theme` **wörtlich**:

| Datei | was sie beiträgt |
|---|---|
| `brand-font.css` | die Markenschrift **Montserrat** (SIL OFL) |
| `base.css` | Schriftfamilien, Bewegungskurven, Radien |
| `design-platform.css` | **alle** Token-Sätze — hell `body`, dunkel `body[data-ds-dark-theme]` |
| `scrollbar.css` | die Bildlaufleiste |
| `focus.css` | der Fokusring |

Der eigene `--dsw-*`-Block in `app.css` ist **gelöscht**. Vite löst den Fremdpfad auf und bündelt die
Dateien samt der drei Schriftdateien (3 × ~61 KB).

**Und die dunkle Marke gesetzt:** `document.body.dataset.dsDarkTheme = ''` — ohne sie gilt der
**helle** Satz, weil beide auf `body` liegen (der dunkle mit dem Attributselektor). Das ist der
Grund, warum so etwas wie ein Fehler in einer Regel aussieht und keiner ist.

**Was der Import nicht kann — offen benannt.** Die 63 Client-Pakete enthalten die
Komponenten-Blätter (`AppFrame`, `SidebarRoot`, `ChatView`, `MessageItem`, `InputBar`). Sie sind auf
den React-Baum des Harness zugeschnitten (`data-slot`, CSS-Module-Hashes, Container-Queries) und
ergeben ohne ihn kein Bild. Der **Aufbau** des Chats bleibt deshalb nachgebaut — jetzt aber mit den
**echten Tokens**, sodass jede Farbe, jeder Radius und jede Schrift aus dem Original kommt.

**Der Prototyp hängt damit an einem Ort auf dieser Maschine** (`C:\Users\Chang\harness\deepseek-harness`).
Für einen Prototyp auf diesem Rechner ist das der richtige Tausch: das Aussehen stimmt
**nachweislich** statt „ungefähr". Wer ihn weitergeben will, muss die fünf Dateien mitnehmen.

### P10.9 Erstmals **gemessen** statt geraten: das Bild ist jetzt prüfbar

Bis hierher stand in jedem Bericht „kein Browser geöffnet, das Bild ist nicht gemessen". Das ist
jetzt anders: es gibt **Brave** auf der Maschine (Chromium), und es spricht das
**DevTools-Protokoll**.

`tools/measure.ps1` + `tools/measure.js` öffnen die Seite headless, lesen Breite, Höhe,
Hintergrundfarbe, Textfarbe und Schriftart je Element aus und geben sie als Text zurück. Aufruf:

```powershell
brave.exe --headless=new --remote-debugging-port=9223 --user-data-dir=$env:TEMP\brave-mess
pwsh -NoProfile -Command (Get-Content -Raw snapshots\web\tools\measure.ps1)
```

**Gemessenes Ergebnis (764 × 491 Fenster, Raum `mess`):**

| Element | Wert | Bewertung |
|---|---|---|
| `body` | `rgb(21,21,23)` | dunkler Satz **greift** |
| `.side` | `280 × 491`, `rgb(27,27,28)` | `SIDEBAR_DEFAULT` |
| `.side-new` | `251 × 38`, `rgb(67,69,74)` | 38 px wie im Harness |
| `.side-row` | `251 × 32` | 32 px wie im Harness |
| `.box` | `rgb(44,44,46)` | Composer-Karte |
| `.box-send` | `34 × 34`, `rgb(122,170,255)` | **DeepSeek-Blau**, nicht Orange |
| Blase (`.msg.u .card`) | `rgb(44,44,46)` | Nutzer-Blase |
| Montserrat | **3 faces geladen** | Schrift aus dem Harness |

**Was die Messung zusätzlich aufgedeckt hat:** `.side` liegt **innerhalb** von `.chat` und nimmt
seitlich Platz weg — bei 764 px bleiben der Mitte nur 484 px, bei 1280 px rund 1000. Im Harness ist
die Leiste eine **eigene Rasterspalte** (`AppFrame`), keine Schwester der Lesespalte. Der nächste
Schritt ist deshalb: die Leiste auf die Ebene der Fläche ziehen (`#screen-chat` wird ein Grid
`auto 1fr auto`), damit die Mitte ihre Breite behält.

---

| Prüfung | Ergebnis |
|---|---|
| `bun test` | **166 pass / 0 fail** (14 Dateien) |
| `tsgo --noEmit` | exit 0 |
| `vite build` | exit 0 |
| Dev-Server | HTTP 200 auf `127.0.0.1:5176` |
| Schlüsselabdeckung | `tests/locale-keys.test.ts`: jeder benutzte Schlüssel existiert in **beiden** Paketen; **keine** toten Schlüssel außer drei begründeten Ausnahmen |
| Vollständigkeit Deutsch | `tests/i18n.test.ts`: 0 fehlende, 0 überzählige Schlüssel |

**Was zum Zeitpunkt dieses Abschnitts NICHT geprüft war:** ob die Welt im Browser **sichtbar** ist.
Der Prüfweg über DevTools fand kein Chrome, und ein Bildschirmfoto ist kein Test. Rechnerisch war es
belegt (`tests/opening-view.test.ts` projiziert Sonne, innere Planeten und Neptun mit echter
Kamerarechnung in den Bildbereich).

**Das ist inzwischen überholt** — siehe **P10.9**: es gibt **Brave** auf der Maschine, und damit ist
das Bild **messbar** geworden (Breite, Höhe, Farben, Schriften je Element). Die Messung hat sofort
einen echten Layoutfehler aufgedeckt, den kein Foto gezeigt hätte.

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

---

## P7 · t40 — Windows-Start (`bun run start`)

**Phase: `Nachweis offen` (13.10.2026)** · Nachweis:
[`windows-start-nachweis.md`](windows-start-nachweis.md)

| # | Punkt | Stand |
|---|---|---|
| P7.1 | `bun install` (Windows nativ) | **erledigt** — exit 0 |
| P7.2 | `bun run typecheck` (Windows nativ) | **erledigt** — exit 0, 8/8 Pakete |
| P7.3 | `bun run build` (Vite/TS7) | **erledigt** — exit 0, `dist/` 221,78 kB, 1 s |
| P7.4 | PATH-Befund: `bun.ps1` blockiert, `bun.cmd` inkompatibel, `.bun\bin\bun.exe` trägt | **erledigt** — dokumentiert |
| P7.5 | `scripts/start.mjs` mit `process.execPath`, Go-Build, Logs, umgekehrtem Beenden | **erledigt** |
| P7.6 | HMR-Abschaltung als Patch-Zeile (`disabled: true`) | **erledigt** — `hmr` ist nicht Pflicht |
| P7.7 | **Host-Start unter Windows nativ** | **BEHOBEN (13.10.2026)** — Ursache: der Auflösungsanker der Bündel zeigte in ein fremdes Harness-Home (`DSH_HOME=C:\Users\Chang\.dsh` mit einer älteren Core-Installation) → 27 Kern-Einträge deaktiviert. Behebung: Flag `--home`, Vorgabe `.pmh-build/harness-home` im Repo. Gemessen: **0** Deaktivierungen, Token, **HTTP 200**. Beleg: [`kleinste-kette-nachweis.md`](kleinste-kette-nachweis.md) §6 |
| P7.8 | `bun run start` **mit Go-Diensten** | **offen** — der Host startet jetzt; der volle Lauf mit beiden Diensten ist noch nicht bis zum HTTP-Nachweis gefahren |
| P7.9 | cmd-Nachweis | **offen** |
| P7.10 | Ctrl+C und Waisenprozesse | **offen** |

**Warum P7.7 blockiert ist und nicht bei uns liegt:** Der Pflicht-Eintrag `connection`
wartet auf den Dienst `webRuntime`, den die Zeile `web-runtime` aus
`@deepseek-ai/dsh-web-app` bereitstellen soll. Unter **Bun** zeigt er sich nicht; unter
**WSL2** lief derselbe Host und lieferte **HTTP 200**. Hypothese (nicht gemessen):
derselbe Laufzeit-Grenzbefund wie `node-addon-require-builtin` (`docs/risks.md` §6).

**t40 wird deshalb NICHT als `completed` geführt.** Die vier offenen Punkte (P7.7–P7.10)
stehen namentlich im Nachweis unter §6.

**Nachtrag 13.10.2026 (spätere Sitzung):** Der Launcher-Lauf meldet jetzt **acht**
fehlende Plugins statt sieben, und `hmr` steht weiterhin darunter:

```
[host] pmh: startup failed: 1 required plugin did not activate
[host] Failed plugins (8): hmr
[host]   Error: --expose-internals is required for HMR service
```

Die Patch-Zeile `{ id: 'hmr', disabled: true }` (P7.6) führt also **nicht** dazu, dass
`hmr` aus den fehlenden Pflicht-Einträgen verschwindet. Ob die Zeile nicht greift oder ob
ein **deaktivierter** Eintrag als „nicht aktiviert" gezählt wird, ist **nicht geklärt** und
bleibt offen. Der zweite Befund derselben Sitzung: `bun run typecheck` und `bun install`
scheitern in dieser Umgebung an einer **Sandkasten-Grenze** (benannte Pipes für erfasste
Kindprozesse, `EPERM`), nicht am Code — `bun install` lief nach ausdrücklicher Freigabe mit
`exit 0`. Einzelheiten: [`kleinste-kette-nachweis.md`](kleinste-kette-nachweis.md) §5.

---

## P8 · Kleinste Kette — LLM-Seam → Anbieter → Wiederholung → Loop → Session

**Phase: `Nachweis offen` (13.10.2026)** · Nachweis:
[`kleinste-kette-nachweis.md`](kleinste-kette-nachweis.md)

**Was das Paket ist.** Der Gegenstand des vorigen Übergabepunkts: „`llm-retry` →
danach der Agent-Loop" — und alles, was zur **ersten vollständigen Kette** gehört.
Acht neue Pakete, 262 Tests, alle Typechecks `exit 0`, plus ein durchgehender Test,
der die Kette von der Nutzlast über die Wiederholung und den Loop bis zur
Wiederaufnahme aus der Datei fährt.

| # | Punkt | Stand |
|---|---|---|
| P8.1 | `packages/llm/llm-retry` — Wiederholung mit begrenztem Rückzug (`LlmError.retryable`) | **belegt** — 41 Tests, exit 0 |
| P8.2 | `packages/llm/token-meter` — Zählung **mit Herkunft** (`reported`/`estimated`/`mixed`) | **belegt** — 37 Tests, exit 0 |
| P8.3 | `packages/core/agent-tools` — Werkzeug-Registry, Fehler werden zum Ergebnis | **belegt** — 19 Tests (in `agent-loop.test.ts`) |
| P8.4 | `packages/core/agent-loop` — Turn-/Step-Zustandsmaschine | **belegt** — 48 Tests, exit 0 |
| P8.5 | `packages/agent/session-format` — Ereignisse, JSON-Zeilen, toleranter Leser, Falten | **belegt** — 41 Tests, exit 0 |
| P8.6 | `packages/agent/session-persistence-jsonl` — Anhängen in Reihenfolge, Wiederaufnahme | **belegt** — 36 Tests, exit 0 |
| P8.7 | **Durchgehender Nachweis** der Kette mit dem echten Adapter gegen eine Attrappe | **belegt** — 6 Tests, exit 0 |
| P8.8 | Behebung **Fehler 1**: Assistenten-Nachricht verlor die Werkzeugaufrufe (`400` beim Anbieter) | **belegt** — Seam + Adapter + 3 Tests |
| P8.9 | Behebung **Fehler 2**: Sitzung verlor Benutzereingabe und Systemanweisung | **belegt** — 2 neue Ereignisarten + Tests |
| P8.10 | **Formatversion 4** der Vorlage mit den vier Migrationen (v0→v4) | **offen** — dieses Paket beginnt bei `v1`; die Migrationskette ist **leer** und meldet das begründet (§6 des Nachweises) |
| P8.11 | Verdichtung (Compaction) | **offen** — eigenes Paket; `token-meter` zählt, kürzt nicht |
| P8.12 | Aufruf gegen den **echten** Anbieter | **offen** — kein Schlüssel in dieser Umgebung; kein Nachweis gegen den Dienst |
| P8.13 | Kette in der **Anwendung** (Host startet und bedient sie) | **begonnen** — der **erste eigene Endpunkt** läuft im Host (`GET /api/health` → **200** über `ctx.webServer.register`). Adapter, Agent-Loop und Session sind **weiterhin nicht** angeschlossen. Beleg: [beleg-eigener-endpunkt.md](beleg-eigener-endpunkt.md) |
| P8.14 | `unit.json` für die neuen Pakete | **offen — Widerspruch** (`units/README.md` verlangt Units unter `units/`; die vorhandenen Pakete liegen unter `packages/`). Nicht vom Executor zu entscheiden |
| P8.15 | Ein **echtes** Werkzeug (Dateisystem, Shell) an der Registry | **offen** — nur eine Attrappe geprüft |

**Warum P8 auf `Nachweis offen` steht und nicht auf `abgenommen`.** Die acht Pakete
sind gemessen; die Kette ist gemessen. Aber sie läuft **nicht in der Anwendung**,
es gibt **keinen** Aufruf gegen den echten Dienst, und die Formatversion der
Vorlage ist **nicht** erreicht. Nach der eigenen Regel dieses Registers („ein
Paket ohne Nachweis wird nicht abgenommen") heißt das: `Nachweis offen`.

### Die zwei Fehler, die kein Pakettest finden konnte

Beide saßen in der **Lücke zwischen Loop und Persistenz** — und beide hätten sich
in einer laufenden Sitzung als „der Agent verhält sich seltsam" gezeigt, nicht
als Absturz:

1. **Der Seam hatte keinen Typ für „das Modell hat ein Werkzeug verlangt".**
   Die Assistenten-Nachricht ging ohne Aufrufe hinaus; die folgenden
   `role: 'tool'`-Nachrichten zeigten auf Aufrufe, die die Nutzlast nicht kannte
   → `400 Bad Request` beim Anbieter, **erst bei der ersten echten Werkzeugrunde**.
   Behoben durch `ToolCallPart` im Seam, `assistantMessage()` als einzigen Weg,
   `checkHistory()` als Prüfung und die Übersetzung in `buildBody`.
2. **Die Sitzung verlor die Benutzereingabe und die Systemanweisung.**
   Der Loop meldete den Benutzertext nur als Feld von `turn-start`; der Verlauf
   aus der Datei begann mit einer Antwort auf eine Frage, die niemand mehr sieht.
   Behoben durch die Ereignisse `system-prompt` und `user-input`.

**Der Merksatz daraus:** sechs grüne Pakete sind **kein** Beweis für eine Kette.
Was die Lücke prüft, ist nur ein Test, der **durch** die Lücke läuft.

---

## P9 · t40-Nachtrag — was in dieser Sitzung zu `t40` neu gemessen wurde

**Phase: `Nachweis offen`** · gehört zu **P7**, steht hier nur, damit die neuen
Messungen nicht in P7 hineinkorrigiert werden (Regel: kein Snapshot wird
nachträglich korrigiert).

| # | Punkt | Stand |
|---|---|---|
| P9.1 | Launcher-Lauf mit dem bestehenden `scripts/start.mjs` | **belegt** — der Launcher startet, der Host scheitert (§5/P7-Nachtrag) |
| P9.2 | Zahl der fehlenden Plugins: **8** statt 7; `hmr` weiterhin darunter | **belegt** — Protokoll des Laufs |
| P9.3 | Ursache der `hmr`-Meldung trotz `disabled: true` | **belegt** — `hmr` wird **zusätzlich** von der Kompatibilitätsprüfung deaktiviert (P9.8) |
| P9.4 | `bun install` in dieser Umgebung | **belegt** — `EPERM` im Sandkasten, nach Freigabe `exit 0` (`2 packages installed`) |
| P9.5 | `bun run typecheck` in dieser Umgebung | **belegt** — `Failed to start process` (Sandkasten, benannte Pipes). Ersatzweg: 13 Einzel-Typechecks, alle `exit 0` |
| P9.6 | **WSL2-Lauf: Host kommt hoch und liefert die Oberfläche** | **belegt** — Bun 1.4.3, Token gelesen; `GET /` **401** → `GET /?token=…` **303** + `set-cookie` → `GET /` mit Cookie **200 · 32.184 B · `text/html`**, Titel „DeepSeek Harness" |
| P9.7 | **Windows nativ: 27 Profil-Einträge werden als version-inkompatibel deaktiviert** | **belegt** — darunter `llm`, `session`, `agent`, `webserver`, `web`, `web-startup`. Folge: kein Token, kein HTTP, Exitcode 0 |
| P9.8 | **Die Laufzeitversion ist korrekt (0.2.1-alpha.2)** — die Fehlermeldung nennt eine Fassung, die es auf diesem Rechner **nicht gibt** | **belegt** — Sonde: `dsh-app-boot/package.json` → 0.2.1-alpha.2; `dsh-llm` deklariert 0.2.1-alpha.2 mit Peer **nur** `cordis`; `bun pm ls` = eine Kopie; `0.1.1-rc.2` in `bun.lock`/`apps/cli`/allen 245 `@deepseek-ai`-Paketen: **0 Treffer** |
| P9.9 | **Die bisherige Erklärung ist widerlegt** — es ist **keine** Bun-Laufzeitgrenze | **belegt** — unter WSL2 läuft dieselbe Laufzeit (Bun) und **null** Einträge werden deaktiviert. Das Verhalten ist **plattform**abhängig |
| P9.10 | **Herkunft der fremden Paketidentität `0.1.1-rc.2`** | **GEKLÄRT** — sie liegt in `C:\Users\Chang\.dsh\profiles\node_modules` (204 Pakete der Linie 0.1.1-rc.2). Der Auflösungsanker des Baums zeigt ins Harness-Home; Node sucht von dort aufwärts und findet den **ersten** Treffer — die alte Installation —, statt in den Projektbaum zu sehen. Messung: **120 von 120** aufgelösten Paketpfaden aus `.dsh`, **0** aus dem Projektbaum |
| P9.11 | **Behebung — im Repo umgesetzt** | **BEHOBEN.** Neues Flag `--home <dir>` in `apps/cli/src/main.ts` (setzt `DSH_HOME` **vor** der Auflösung von Profil und Anker); `scripts/start.mjs` gibt `.pmh-build/harness-home` als Vorgabe mit. **Gemessen (Windows nativ):** 27 → **0** deaktivierte Einträge, Token nach 1 s, `GET /` mit Cookie **200 · 35.664 B** (`--no-go`-Lauf) bzw. **200 · 3.845 B** (Einzellauf). 15 Tests für die Kommandozeile (`apps/cli/tests/flags.test.ts`), Typecheck `exit 0` |
| P9.12 | **Die fremde Installation in `~/.dsh` wurde NICHT angetastet** | **belegt** — kein Schreibzugriff, keine Umbenennung, keine Löschung. Sie gehört einer anderen, laufenden Harness; die Korrektur liegt im Host, nicht in einem fremden Home |
| P9.13 | cmd-Nachweis, Ctrl+C, Waisenprozesse | **offen** |

**Damit ist P7.7 erledigt und `t40` im Kern erreicht:** der Host kommt unter
**Windows nativ** hoch und liefert die Oberfläche mit **HTTP 200** aus. Offen
bleiben nur noch P9.13 (cmd, Ctrl+C, Waisen) und die Frage, ob die Kette
(Agent-Loop, Session) im Host **verdrahtet** wird — sie ist gebaut und geprüft,
aber noch nicht an die Oberfläche angeschlossen (P8.13).

### Die Korrektur, ausdrücklich ausgesprochen

`windows-start-nachweis.md` §5 erklärte den Windows-Blocker mit einer **Grenze der
Laufzeit Bun** („derselbe Grenzbefund wie `node-addon-require-builtin`"). Diese
Erklärung ist nach P9.9 **nicht haltbar**. Der Bericht wird **nicht** nachträglich
geändert (Regel: kein Snapshot wird korrigiert) — die Korrektur steht hier und in
[`kleinste-kette-nachweis.md`](kleinste-kette-nachweis.md) §6.

**Was der Blocker wirklich ist:** die Zeilen `webserver` und `web-startup` werden
unter Windows nativ von der **Profil-Kompatibilitätsprüfung** deaktiviert, weil sie
angeblich `0.1.1-rc.2` sind. Damit kommt kein Webserver hoch — und der Pflicht-Eintrag
`connection` wartet auf `webRuntime`, das die abgeschaltete Zeile hätte liefern sollen.
**Die frühere Deutung als „Reihenfolge-Frage" und „Bun-Grenze" war falsch.**

## Geändert

| Datum | Änderung | Grund |
|---|---|---|
| 2026-10-13 | **Eigener Handfehler, DREIMAL gemacht — und jetzt die Regel dagegen.** Beim Einfügen neuer Zeilen habe ich dreimal den **Anfang einer bestehenden** Zeile als Suchtext benutzt und sie damit überschrieben: die Zeile zu den Planeten-Grössen, die zu `Page.enable`, die zu den Nebeln. Alle drei sind aus dem Sitzungsverlauf wiederhergestellt | Ein Register, das stillschweigend Zeilen verliert, ist als Nachweis wertlos — und dreimal derselbe Fehler heisst, dass die **Vorgehensweise** falsch ist, nicht die Aufmerksamkeit. **Regel ab jetzt:** Beim Einfügen wird ausschliesslich auf das **Tabellenende** gezielt (die letzte Zeile als Ganzes) oder auf eine **vollständige, eindeutige** Zeile — und nach jedem Eingriff wird die **Zeilenzahl** gegengeprüft. Die drei Verluste sind beim Gegenzählen aufgefallen, nicht beim Lesen |
| 2026-10-12 | Datei angelegt, P1–P5 erfasst | Weisung: Todo-Listen je Paket, gleiches Prinzip wie Git und Zwischenstand |
| 2026-10-13 | **Die Überlagerung war echte Positionierung — gemessen und behoben.** `tools/ui-surface.ts` findet überlappende Textrechtecke: **9 Paare**, die stärkste **2864 px²** zwischen der Kopfzeile „Ebene Sonnensystem · 4,8 k" und „Jedes Objekt hat einen Namen" im Suchpanel. Der vergrösserte Ausschnitt zeigt die Ursache: Marke **und** Kopfzeile sind **frei über die Fläche positioniert** (`.hud`, `left: 20px`) und kennen die Panels nicht. Neu: `onLayout` misst die Breite der linken Zone (`--panel-links`), die Kopfzeile weicht aus; die Achsenanzeige richtet sich nach `--leiste-hoehe` und `--unten-top` (beide **gemessen**) | Sie lag erst auf der Knopfleiste, dann im Terminal — zwei feste Zahlen (22 px und 14 px), die nichts voneinander wissen, überlappen irgendwann. Ergebnis: **6 statt 9**, die restlichen sechs sind Panel-Reiter **hinter** dem Terminal und als „nicht sichtbar" eingeordnet — nicht als behoben behauptet |
| 2026-10-13 | **Zwei eigene Fehlversuche bei derselben Sache, offen benannt.** (1) `table-layout: fixed` mit `max-width: 15ch` gegen den Wortumbruch — gemessen **verschlimmerte** es ihn: `Raum „ui-mv8mxuq4"` brach danach nach **acht** Zeichen. (2) Eine Medienabfrage `max-width: 1100px` als Ausnahme für die Achsenbeschriftung — das Fenster ist **1440 px**, die Abfrage griff **nie** (`capDisplay: "block"`) | Ein Fehlversuch, den man nicht benennt, wird beim nächsten Mal wiederholt. Beide hatten dieselbe Wurzel: ich habe eine **Zahl angenommen** (15ch passen; 1440 < 1100) statt sie zu **lesen**. Rückfallwerte sind seitdem als gemessen benannt oder werden zur Laufzeit gesetzt |
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
| 2026-10-13 | **P8 angelegt: die kleinste Kette ist gebaut und belegt** — acht neue Pakete (`llm-retry`, `token-meter`, `agent-tools`, `agent-loop`, `session-format`, `session-persistence-jsonl` + Erweiterungen an `llm`/`llm-deepseek`), **262 Tests grün**, 13 Einzel-Typechecks `exit 0`, plus ein **durchgehender** Test der Kette | Der vorige Bericht endete mit einem Übergabepunkt: „`llm-retry` → danach der Agent-Loop". Der ist jetzt erledigt — und darüber hinaus die ganze Kette bis zur Wiederaufnahme aus der Datei. Beleg: [`kleinste-kette-nachweis.md`](kleinste-kette-nachweis.md) |
| 2026-10-13 | **Zwei echte Fehler gefunden und behoben, die kein Pakettest finden konnte:** (1) der Seam hatte keinen Typ für „das Modell hat ein Werkzeug verlangt" → die Nutzlast zeigte auf unbekannte `tool_call_id`s → `400` beim Anbieter, **erst bei der ersten echten Werkzeugrunde**; (2) die Sitzung verlor **Benutzereingabe** und **Systemanweisung** | Beide saßen in der **Lücke zwischen Loop und Persistenz** — genau der Stelle, die kein Pakettest abdeckt. Gemessen: der durchgehende Test faltete nach dem ersten Turn **eine** Nachricht aus der Datei statt zwei. Merksatz im Register: *sechs grüne Pakete sind kein Beweis für eine Kette* |
| 2026-10-13 | **Der Loop führt jetzt die Turn-Nummer und meldet den Benutzertext als eigenes Ereignis** (`user-input`, `system-prompt`, `turn`, `firstTurn`, `events()`) | Ohne die Turn-Nummer hießen alle Zeilen einer fortgesetzten Sitzung „Turn 1"; ohne `user-input` fehlte die Frage im Verlauf; ohne `system-prompt` arbeitete der fortgesetzte Agent unter **anderen** Anweisungen als der erste |
| 2026-10-13 | **Eigener Messfehler korrigiert: die Testzahlen galten je Ordner, nicht je Datei.** `bun test packages/llm/llm` meldet **94** Tests statt 20, weil der Pfad als **Teilzeichenkette** geprüft wird und `packages/llm/llm-deepseek` mitzählt | Aufgefallen beim Gegenzählen für den Nachweis. Die Tabelle in `kleinste-kette-nachweis.md` §1 nennt jetzt je **Testdatei** gemessene Zahlen. Eine Ordnungszahl, die mehr Tests meldet als es gibt, ist genau die Art Beleg, die dieses Register verbietet |
| 2026-10-13 | **P9 angelegt: neue Messungen zu `t40`, ohne P7 zu überschreiben.** Der Launcher-Lauf meldet **8** fehlende Plugins (statt 7), `hmr` weiterhin darunter, trotz `disabled: true` (P7.6). Ursache **nicht geklärt** | Die Zahl aus `windows-start-nachweis.md` §5 ist damit überholt; nach der eigenen Regel wird kein Snapshot nachträglich korrigiert, sondern ein neuer Befund daneben gestellt. `t40` bleibt offen |
| 2026-10-13 | **P8.10 ausdrücklich offen: Formatversion 4 der Vorlage ist NICHT erreicht.** Dieses Paket beginnt bei `v1`; die Migrationskette ist **leer**, und `migrateEvents` meldet jede ältere Zeile als `skipped` **mit Grund** | Die Feldbedeutungen der Vorlage-Fassungen 0–4 sind ohne Vorlage-Daten nicht rekonstruierbar. Eine erfundene Migration würde fremde Verläufe **stillschweigend verfälschen** — sie sähe erfolgreich aus und wäre falsch. Ehrlich offen ist besser als scheinbar fertig |
| 2026-10-13 | **Der Web-Welt-Prototyp ist gebaut und belegt** — `snapshots/web`, 13 Quelldateien: zwei Modi (Chat + OS-Insel), andockbare Panels, 3D-Welt mit Quaternion-Drehung, Bezugswechsel („Fix Fokus"), Objektsuche mit Weg und Weltkoordinaten, Zustand je Raum. Nachweis: `bun test` **39 pass / 0 fail**, `tsgo --noEmit` **exit 0**, `vite build` **exit 0**, Server **HTTP 200** auf `127.0.0.1:5176` | Betreiber hat den Prototyp ausdrücklich beauftragt — **„noch nicht mit Prometheus Harness Schnittstelle verbunden"**. Damit ist **P7.7 teilweise freigegeben**: freigegeben ist, was der Prototyp braucht; **nicht** freigegeben sind Barrierefreiheit, Leistungsnachweis und Datenanbindung. Details: P10.3 |
| 2026-10-13 | **Vier echte Fehler gefunden, bevor irgendetwas sichtbar war** — Bezugsebenen verkehrt numeriert, Zoom-Richtung umgekehrt, `..` kam durch die Raumnamen-Bereinigung, ein Test prüfte die falsche Blickachse | Alle vier fand die Prüfkette (Tests + Typecheck), **keiner** wäre beim Draufschauen aufgefallen. Festgehalten in P10.4 — ein Test, der nichts prüft, ist schlimmer als kein Test |
| 2026-10-13 | **Eigene Kennung korrigiert: `P7` war doppelt vergeben.** Mein Web-Rendering-Abschnitt (`t39`) und der Windows-Start-Abschnitt (`t40`) trugen beide `P7`. Mein Abschnitt heisst jetzt **P10**; die anderen Abschnitte wurden **nicht** angetastet | `P8` und `P9` waren zwischenzeitlich belegt. Eine doppelte Kennung ist schlimmer als eine unschoene Reihenfolge — und der Nachtrag gehört in `Geändert`, nicht als stille Umbenennung |
| 2026-10-13 | **Befund zum Ort, offen benannt:** `snapshots/` ist **nicht versioniert** (`git ls-files snapshots` = 0 Dateien) und enthält sonst nur leere Laufzeit-Unterordner. Der Prototyp liegt damit ausserhalb von Git und ausserhalb des Typecheck-Laufs der Wurzel | Der Betreiber hat den Ort selbst gewaehlt. Die Folge wird **nicht stillschweigend hingenommen**, sondern benannt: **dieser Code wird nicht gepusht.** Wer ihn erhalten will, muss das entscheiden |
| 2026-10-13 | **Betreiber-Korrektur aufgenommen: „jeder Nutzer sein eigenes Universum" heisst eine eigene INSTANZ** — „komplett sein eigenes wie ein Sandbox / Container", **nicht** ein Filter in einer gemeinsamen Datenbank | Meine erste Auslegung („eigene Daten in einer gemeinsamen DB") war zu schwach. Umgesetzt in `src/room.ts`: der gespeicherte Zustand hängt am **Raum**, und der Raum ist sichtbar in der Oberflaeche — niemand soll raten müssen, in welchem Universum er schaut. Die echte Grenze zieht später der Container, **nicht** diese Datei |
| 2026-10-13 | **Vier Befunde des Betreibers am laufenden Prototyp behoben** — (1) **weisser Klumpen** in der Bildmitte, (2) **Licht fehlte**, (3) **Achsenstrich „whack"**, (4) **Raum leer** ausser Sternen | Alle vier waren echte Fehler, nicht Geschmack. Ursachen in P10.5 festgehalten — der weisse Klumpen war ein **Sternenfeld in 3D**, das bei mittlerem Zoom in der Mitte zusammenfiel; das fehlende Licht machte jeden Körper flach; die Achsen waren ein 420 Einheiten langes Gestell mitten im Bild |
| 2026-10-13 | **Zwei weitere Nummerierungs-Fehler der Bezugsebenen gefunden und behoben** — erst lief die Nummer gegen die Groesse, dann trugen „Sternhaufen" und „Galaxie" **vertauschte** Nummern (ein Sternhaufen ist kleiner als eine Galaxie). Dazu war der Vergleich in `buildScene` **verkehrt herum**, wodurch beim Herauszoomen nur der Wurzelknoten gezeichnet wurde | Beide fand die **Prüfkette**, nicht das Auge: eine leere oder falsch gefüllte Welt sieht „irgendwie leer" aus, aber niemand sieht, dass die Nummern gegen die Physik laufen. Die Ebenentabelle steht jetzt als Test (`tests/scene.test.ts`) |
| 2026-10-13 | **`system` als Eigenschaft in die Daten aufgenommen.** Ein erster Anlauf **riet** „hat Kinder → ist ein Sonnensystem" und zeichnete prompt die **Galaxie** als Sonnensystem — mit dem eigenen Kern als Sonne | Ob ein Objekt ein System ist, ist eine **Tatsache über die Daten**, keine Regel über die Struktur. Eine Galaxie enthält Sternhaufen, ist aber selbst kein Stern |
| 2026-10-13 | **Eigener Deutungsfehler korrigiert: „5D" und „Sonnensystem" sind zwei Dinge, und der Betreiber will BEIDE.** Ich hatte „er will das sichtbare Sonnensystem" gegen „er will 5D-Rotation" ausgespielt — der Betreiber: „**doch das wollte ich**" | Zwei getrennte Aufgaben, beide umgesetzt: (1) `src/rotation.ts` — echtes `SO(n)` mit `n(n−1)/2` Drehflächen, für 5D also **zehn**; Quaternion für die 3D-Welt, Bivektor/Matrix für n Dimensionen, Zeit als eigener Freiheitsgrad. 17 Tests, 2544 Prüfungen. (2) `solarShowcase()` in `src/universe.ts` — Sonne, Merkur bis Neptun, Erdmond, Bahnen logarithmisch gestaucht |
| 2026-10-13 | **Befund: die Welt war schwarz, und der Grund war Physik.** `PointLight` mit `decay: 1.4` laesst die Helligkeit mit dem Quadrat des Abstands fallen — ein Planet in 4000 Einheiten bekommt dann praktisch kein Licht | `decay: 0` (Helligkeit bleibt, `distance` begrenzt nur die Reichweite) plus `HemisphereLight` als Grundlicht. Merksatz: *ein Stern leuchtet weit — genau das unterscheidet ihn von einer Glühbirne.* |
| 2026-10-13 | **Die Rotation ist als eigenes Plugin gebaut und im Terminal prüfbar:** `rotation` zeigt Zustand, alle zehn Drehflächen und die **fertige 5×5-Matrix**; `rotation pause` / `run` / `tempo <n>` / `plane <0-9> <wert>` / `time <n>` ändern sie | Ohne die Matrix wäre „5D" eine Behauptung. Mit ihr kann jeder nachrechnen, dass es eine echte Drehung im Fünf-dimensionalen ist — orthonormal, Determinante +1. Und ein **Plugin**, weil sich die Eigenrotation damit abstellen lässt: wer nur die Struktur ansehen will, will keine Bewegung |
| 2026-10-13 | **Zwei Bildfehler des Betreibers behoben — beide hatten eine Ursache, keine Geschmacksfrage.** (1) „wenn ich raus gehe weiter ist es nur ein punkt???" — die Körpergrößen standen in **Welteneinheiten** und schrumpften mit dem Abstand zu Sub-Pixeln; ein Planet in 10 Einheiten ist bei Abstand 20 000 ein Zehntausendstel. (2) „mit ringe sieht schon scheisse aus" — die Kamera schaute fast **in** die Bahnebene, und ein Kreis von der Seite ist ein Streifen | Gegen (1): `MIN_BODY_FRACTION 0,0022` in `scene.ts` — ein Körper ist nie kleiner als ~0,2 % des Abstands. Der Preis ist, dass ferne Körper **zu groß** erscheinen; Sichtbarkeit schlägt Maßstab, weil ein unsichtbarer Planet keine Bedeutung trägt. Gegen (2): `orbitView()` und `SOLAR_ELEVATION` in `camera.ts` setzen die Kamera **38° über** die Bahnebene, und der Startabstand kommt aus dem **äußeren Ring** (`openingView`) statt aus einer festen Zahl |
| 2026-10-13 | **Eigener Denkfehler in der Bahnstauchung korrigiert: die Logarithmik stauchte zu stark.** Von Venus zur Erde wuchs die Bahn nur um **24 %**, während draußen riesige Lücken blieben | Jetzt `orbit = 700 · a^0,55` (Wurzel statt Logarithmus). Gemessen wachsen die Bahnen nun um Faktor **1,20 bis 1,97** je Planet statt um 1,24 mit Ausreißern — Reihenfolge sichtbar, alles im Bild. Gefunden in den **Zahlen**, nicht am Bildschirm |
| 2026-10-13 | **Steuerung und Sprache sind jetzt Einstellungen, und Sprache ist ein Paket** — neu: `settings.ts`, `i18n.ts`, `locales/en.ts`, `locales/de.ts`, `locale-plugins.ts`, `control-settings.ts`, `settings-screen.ts`. Der Kern kennt **keinen** deutschen Satz und **keine** Einstellung; die Inhalte sind Plugins (VS-Code-Form) | Weisung: „die könnte man in settings implementieren fuer stuerung" und „sprache … wird durch eine language package/plugin implementiert, wie beim Visual studio code extension". Englisch ist Standard, Deutsch liegt bei; beim **ersten** Start schlägt der Browser vor, danach gilt die Wahl des Nutzers. Details: P10.5 |
| 2026-10-13 | **Die vier Steuerungswerte sind aus dem Code verschwunden** (`ROTATE_SPEED`, `ZOOM_FACTOR_PER_NOTCH`, `AXIS_SPIN_SPEED`, `0.0011` in `panBy`) und werden bei jeder Bewegung **gelesen** statt kopiert; dazu neu `world.dimensions` (3 … 5, ersetzt die feste 5 in `weltMatrix`) | Eine Einstellung, die man einmal liest und in eine Variable legt, hat eine zweite Wahrheit — und dann zeigt der Einstellungsbildschirm etwas anderes als die Kamera tut. Die Konstanten bleiben nur als **Rückfall**, damit ein abgeschaltetes `ui-controls` die Kamera nicht stehenlässt |
| 2026-10-13 | **Das Achsenkreuz ist greifbar geworden** — dicke Trefferlinie, Endpunkt als Griff, Zug am Endpunkt dreht die Welt um die **beiden anderen** Achsen; unten ein Ring für die freie Drehung in der Bildebene | Betreiber: „ich möchte also auch diese achse dinger nutzen können um rotation bewegung zu machen" und „fehlt unten beim achsen noch eine rotation Kugel". Die Knoten werden weiterhin **nur verschoben**, nie neu gebaut — sonst ruckelt es wie in der ersten Fassung |
| 2026-10-13 | **Befund: das leere Bild war ein `ReferenceError` beim Laden.** `registerLocalePlugins` ruft beim Eintragen `onSwitch → relabel()`, und `relabel()` griff auf `dock` zu, bevor es deklariert war. Das Modul starb vor `requestAnimationFrame(loop)` — sichtbar war nur ein schwarzes Canvas | Betreiber: „weitermachen und das ist komisch aus btw komplett leer". **Keine** der 120 Prüfungen fand es, weil keine die Hülle **lud**. Behoben durch die Marke `aufgebaut`; dazu `tests/boot.test.ts` + `tests/dom-stub.ts`, der die Hülle gegen ein winziges DOM wirklich lädt. Der Test ist **gegengeprüft** — mit wieder eingebautem Fehler meldet er den `ReferenceError` |
| 2026-10-13 | **Eigener Rechenfehler, zweimal gemacht und offen benannt:** „0,00175 rad/px = 57 px/°" (richtig: **9,97**). Der erste Korrekturversuch war derselbe Fehler noch einmal (9,97 → 32,7) | Die Verwechslung war Grad und Radiant. Betroffen waren Kommentar, Anzeige und Bericht. Die Umrechnung steht jetzt in `settings.ts` und ist **mit Gegenprobe** geprüft (10 px Zug = 1,0°); die Anzeige nennt „Grad je Bildschirmbreite" (128° für 0,00175) statt „Pixel je Grad", weil das die Handbewegung beschreibt, die man wirklich macht |
| 2026-10-13 | **Eigener Bedienfehler, offen benannt:** `Set-Content -NoNewline` entfernte alle Zeilenumbrüche aus `main.ts`; die `//`-Kommentare fraßen den folgenden Code, und die Grenzen waren nicht rekonstruierbar. Die Datei wurde neu geschrieben (derselbe Aufbau, dieselbe Reihenfolge) | Ein Reparaturversuch mit einem Zeichenleser wurde **verworfen**, weil er an den Kommentargrenzen geraten hätte — eine geratene Datei ist schlimmer als eine neu geschriebene. Ursache war der Aufruf, nicht der Code |
| 2026-10-13 | **Prüfstand auf 166 Tests erweitert** — neu: `settings.test.ts` (Bereichsprüfung, Typprüfung, Anzeige-Umrechnung), `i18n.test.ts` (Rückfall, Vollständigkeit, Paket entfernen), `locale-keys.test.ts` (jeder benutzte Schlüssel existiert, keine toten), `opening-view.test.ts` (projiziert Sonne, innere Planeten und Neptun mit echter Kamerarechnung), `boot.test.ts` (lädt die Hülle) | Zwei Befunde machten die Tests nötig: der **leere Bildschirm** (kein Test lud die Hülle) und die **falsche Umrechnung** (kein Test rechnete sie nach). Ein Test, der den Fehler nicht fängt, ist schlimmer als keiner — er erzeugt Vertrauen |
| 2026-10-13 | **Die Chat-Struktur ist komplett ersetzt: DSH-Web-GUI als Vorlage.** Seitenleiste **280 px** (`SIDEBAR_DEFAULT` aus `ui-layout/…/columns.ts`) mit Gruppen, Zählern und Einklappen auf 56 px; Verlauf in einer **920-px-Lesespalte**; Composer als **Karte mit Radius 28 px** und der weichen Erhebung; Sende-Knopf als **34-px-Kreis**; `+` als **28-px-Kreis**; Nutzer-Blase rechts (Radius 20 px), Agent links ohne Rahmen; **keine Absendernamen mehr** | Betreiber: „ich möchte den ganze Chat structure von deepseek und layout haben also das late komplett weg." Alle Maße stammen aus dem Quelltext des Harness, nicht aus dem Augenschein — jede Regel nennt ihre Datei |
| 2026-10-13 | **Dritte Ansicht `web`: die Vorlage des Betreibers (`apps/web`) 1:1.** `.stage` + `.universe` (Verlaufshintergrund `radial-gradient(ellipse at 50% 35%, #0c0a10, #050507 75%)`) + `.isl` (Pille 230 × 40 → 560 × 280, CHANNELS in zwei Spalten). Umschaltbar mit dem neuen Befehl **`view [chat\|web\|world]`** | Betreiber: „anders gesagt ist unsere welt anzeige eine art switch zur chat … dort wird zb beim DSH structure web vorlage komplett implementiert. also quasi 1:1 `apps/web`" und „man kann es switchen über chat command". Die Insel der Vorlage belegt sich aus **denselben Daten** wie die Welt — jedes Teil ist damit ein Andockpunkt |
| 2026-10-13 | **Echter Fehler behoben: Mond und Sonde kreisten um die Sonne statt um die Erde.** `updateBodies` gab **jedem** Körper `center = Sternposition`; der Mond lief damit in einem Ring von 70 Einheiten um einen 34 Einheiten großen Stern — mit 27 Tagen Umlaufzeit, also schneller als Merkur | Betreiber: „anmerkung mond und voayger folgt erde nicht lol". Er hatte recht. Neu: `Placed.depth`/`parentId`/`localOrbit` und `DynamicEntry.parent`; die Reihenfolge in `dynamic` **ist** jetzt die Abhängigkeit (erst der Elternteil, dann das Kind). Der Schweif eines Mondes rechnet den **damaligen** Mittelpunkt mit, sonst würde aus dem Ring ein Strich |
| 2026-10-13 | **Rechtsklick-Menü weg** — `contextmenu` wird auf Welt und Dock unterdrückt, **nicht** im ganzen Dokument | Betreiber: „rechtsklick issue das immer diese website pop up erscheint das war vorher nicht so." In Eingabefeldern bleibt das Menü: dort ist es nützlich, und es dort zu nehmen wäre eine zweite Unannehmlichkeit statt einer Behebung |
| 2026-10-13 | **Beide Steuerungen behalten, umschaltbar per Einstellung** `control.scheme`: `cad` (linke Taste dreht, mittlere schiebt) oder `orbit` (die vorherige Belegung) | Betreiber: „ich möchte auch die alte steuerung noch behalten und per settings ändern können was man bevorzugt." Eine Umstellung, die man nicht zurücknehmen kann, ist keine Verbesserung, sondern eine Zumutung |
| 2026-10-13 | **Sprachfehler behoben: die Oberfläche stand auf einem deutschen System auf Englisch.** Die automatisch erkannte Sprache wurde als **Wahl des Nutzers** gespeichert und danach nie wieder geprüft; `hasSetup` verhinderte jede Neuerkennung | Aufgefallen daran, dass der Betreiber einen deutschen Rechner hat und englische Texte sah. Neu: `language.chosen` trennt „erkannt" von „gewählt"; der Einstellungsbildschirm zeigt nur Felder **mit Text** (`internal: true` für Marken). `detectLocale` wird jetzt wirklich **benutzt** statt nur befragt |
| 2026-10-13 | **DOM-Stub um einen `innerHTML`-Parser erweitert.** Vorher merkte er sich die Zeichenkette nur — und ein Test, der darauf „Eingabefeld fehlt" meldete, prüfte den **Stub**, nicht den Code | Ein Fehlalarm ist genauso irreführend wie ein falsches Grün. Der Parser ist absichtlich klein: öffnende/schließende Marken, Attribute, Selbstschließer, Text |
| 2026-10-13 | **Drei Befunde des Betreibers zur Welt, und ein neues Messwerkzeug:** `tools/scale.ts` rechnet die **scheinbare Grösse jedes Körpers in Pixeln** — mit denselben Formeln wie die Szene, ohne Browser. Es hat den Fehler gefunden, den drei Korrekturen an der Sonne nicht gefunden hatten | Betreiber: „die sonne sieht nicht wie eine sonne aus und planeten sieht auch nicht real aus nutze svg bilder passend zur naming des planeten. die grösse … sollte schon realistische Relative grösse haben". Ein Bild zeigt, **dass** etwas fehlt; eine Tabelle zeigt, **warum** — und die Zahl, die zu ändern ist |
| 2026-10-13 | **Der Startblick stand bei 85 251 Einheiten statt 4 761 — die Sonne war 1,8 px gross.** Ursache: `search(universe,'Neptun')[0]` liefert die **Weltlage über den ganzen Baum** (22 434 statt 1 253). Neu: `outermostOf(system)` liest den **Bahnradius** der direkten Kinder und lässt Körper ohne Umlaufzeit aus (eine Sonde kreist nicht) | Gemessen, nicht vermutet. **Drei Korrekturen an der Sonne selbst hatten nichts bewirkt**, weil der Fehler im **Abstand** sass. Merksatz: *wenn eine Grösse nicht stimmt, prüfe zuerst den Abstand.* Der Test `opening-view.test.ts` baute die fehlerhafte Rechnung **nach**, statt sie zu benutzen — beide waren gleich falsch, also war er grün |
| 2026-10-13 | **Der Anker: die Sonne fehlte auf den Ebenen 1–3 vollständig.** `buildScene` liefert dort **kein einziges System** — ein System entsteht nur, wenn ein Körper *genau* auf der gesuchten Ebene liegt und `system === true` hat. Beim Hineinzoomen verschwand der Stern: **kein Licht** (die Planeten hingen an keinem Punktlicht), keine Sonne, fast kein Name. Neu: `BuiltScene.anchor` — der nächste Stern wird auf jeder Ebene gezeichnet **und** benannt | Im Bild war es ein fast schwarzes Feld mit sieben Punkten. Der Stern ist der **Mittelpunkt** des Bildes; ohne ihn weiss man nicht, worum die Körper kreisen |
| 2026-10-13 | **Zwei Zeichenfehler behoben, beide „doppelt gezeichnet":** (1) der Stern einer Zusammenfassung **ist** ihr erstes Kind — auf Ebene 4 lagen zwei Kugeln an derselben Stelle, und die einfarbige gewann die Zeichenreihenfolge (die Sonne war ein oranger Ball **ohne Zeichnung**). (2) „Sonnensystem" (Radius 100) und „Sonne" (Radius 100) liegen am selben Punkt, also schrieb sich der Knotenname **über die Sonne** und verdeckte die inneren Planeten | Beides sind Fälle von „zwei Dinge, eine Bedingung": `item.kind === 'sun'` traf den **Zusammenfassungsknoten** und den **Anker** zugleich. Unterschieden wird jetzt an den Daten (`system === true` gegen den Stern selbst) |
| 2026-10-13 | **Die Grössenregel ist ersetzt: ebenenbezogen statt abstandsbezogen.** Alt war `Abstand · 0,005` für **jeden** Körper — gemessen hiess das bei Abstand 4761: Jupiter, Saturn, Erde und Merkur **alle 7,8 px**, also nicht unterscheidbar. Neu: `minBodySize(reference, largest, distance, höhe, fov)` in `scene.ts` — Untergrenze = **Median der Ebene / 12**, gedeckelt beim grössten Körper, plus eine harte Sichtgrenze von 2,4 px. Gemessen bei Abstand 4761: Ebene 4 von „Spreizung 1,0×" auf **40,8×**, der grösste Körper von 7,8 px auf **61 px** | Betreiber: „die planeten galxien ect sind meistens ultra klein auch beim zoom rein ich denke die grösse zoom sollte in bestimmte ebene geändert gezeichnet werden oder so idk schau dir mal an wie man es realistisch lösen könnte". Er hatte recht. Zwei verworfene Anläufe sind **durchgerechnet** und in `tools/scale.ts` dokumentiert: eine Untergrenze je Körper wirkt nicht, eine feste Sichtgrenze in Pixeln **projiziert die Spreizung nach aussen** (Merkur würde so gross wie die Sonne) |
| 2026-10-13 | **Offen, mit Messwerten belegt: bei realistischen Verhältnissen bleiben die Planeten im Startblick Punkte.** Nachgerechnet: bei Abstand 4761 ist die Erde **0,33 px**; um sie auf 2 px zu bringen, müsste die Kamera bei Abstand 10 stehen — **innerhalb** der Sonne (Radius 100). Und `focusOn` setzt heute `radius · 3,2`, was für **jeden** Körper **54 % der Bildhöhe** ergibt (gerechnet) — die Fokussierung ist also nicht das Problem, die Startansicht ist es | Es gibt keinen Grössen-Exponenten, der 109 : 1 auflöst: das Werkzeug hat fünf Kandidaten von 0,35 bis 0,75 durchgerechnet, und Jupiter wird mit jedem **kleineren** Exponenten **kleiner**, nicht grösser. Die verbleibende Wahl ist eine **Entscheidung** (Realismus gegen Sichtbarkeit auf der feinen Ebene), keine Rechnung — und sie gehört dem Betreiber, nicht dem Code |
| 2026-10-13 | **Der Anker stand auf Ebenen, auf denen er nicht hingehört — und der Betreiber hat es gesehen:** auf der **Galaxie**-Ebene stand in der Pille „Sonne". Ursache: der Anker wurde gesucht, sobald **kein System** da war, und das ist auf Ebene 5–7 immer der Fall. Dort steht aber **ein** Körper (`kosmischer Überblick`, Radius 9000) — eine 100-Einheiten-Sonne verschwindet darin, sichtbar blieb nur ihr **Name**. Neu: der Anker entsteht nur, wenn **etwas kreist** (`orbit > 0`) **und der Stern fehlt** (kein Körper mit `kind === 'Stern'` gezeichnet). Gemessen: Anker auf Ebene 1 und 2, keiner auf 3–7 | Die Regel steht als Tabelle im Test `opening-view.test.ts`, je Ebene mit dem erwarteten Anker. **Zwei eigene Fehlannahmen sind dabei widerlegt worden:** `Placed.kind` ist auf diesen Ebenen „node" und nicht „planet" (der Zweig „feiner als die gesuchte Ebene" sammelt sie als Einzelkörper), und Voyager **hat** sehr wohl eine Bahn (`orbit = 1412`) — meine Begründung „die Sonne war dort auch falsch" war erfunden und ist nachgemessen korrigiert |
| 2026-10-13 | **Zusammenfassungen bekommen jetzt Zeichnungen nach ihrer ART** — neu `aggregateSvg(kind)` in `bodies.ts`: `Alles` → Galaxie (Kern, zwei Spiralarme), `Projekt` → Bündel, `Gruppe` → Haufen, `Schaustück` → Ring um einen hellen Punkt, `Platzhalter` → gestrichelt, `Datei` → Blatt mit Zeilen. Gezeichnet mit `emissiveMap` + `emissiveIntensity 0.85`, weil `surfaceMaterial` unbeleuchtet schwarz ist | Betreiber: „da fehlt galaxie". Gemessen war der Überblicksknoten ein **dunkelgrüner Ball von 20 px** ohne jede Struktur — und auf den groben Ebenen ist er das Einzige, was man sieht. Die Arten sind **gemessen** (`Alles`, `Projekt`, `Gruppe`, `Schaustück`, `Platzhalter`, `Datei`), nicht geraten |
| 2026-10-13 | **Werkzeugfehler gefunden, der drei Messungen unbrauchbar machte: `Page.enable` fehlte.** `Page.addScriptToEvaluateOnNewDocument` wird **mit einer `identifier` beantwortet, auch ohne `Page.enable`** — das Skript läuft dann aber **nie**. Gemessen (`tools/diag-preset.js`): die Marke, die es setzen sollte, war `null`. Dazu neu `tools/level.js`, das eine Bezugsebene **gezielt anfährt** (`distanceForLevel` aus `camera.ts`, nicht nachgebaut) und protokolliert, was auf dem Bildschirm steht | Eine Antwort ohne Wirkung ist die unangenehmste Sorte Fehler: jedes Werkzeug sah erfolgreich aus und mass stumm den **alten** Zustand. Der Betreiber sah 112,6 k auf der Galaxie-Ebene, meine Werkzeuge behaupteten 4,8 k |
| 2026-10-13 | **Zwei eigene Handfehler beim Führen dieses Registers, offen benannt.** Zweimal habe ich beim Einfügen neuer Zeilen den **Anfang einer bestehenden** als Suchtext benutzt und sie damit überschrieben — zuerst die Zeile „bei realistischen Verhältnissen bleiben die Planeten Punkte", dann die Zeile zu `Page.enable`. Beide sind aus dem Sitzungsverlauf wiederhergestellt | Ein Register, das stillschweigend Zeilen verliert, ist als Nachweis wertlos. Beim Einfügen wird ab jetzt **nur** auf eine eindeutige, vollständige Zeile oder auf das Tabellenende gezielt — und nach jedem Eingriff wird die Zahl der Zeilen gegengeprüft |
| 2026-10-13 | **Der Sternenhimmel war nie weg — er stand hinter einer deckenden Fläche.** `Scene` rief `setClearColor(0x050507, 1)` auf: eine **deckende** Räumung in fast demselben Ton wie der Himmel, und das Canvas liegt mit `z-index: 2` **über** `#screen-os::before` (dort hängt `var(--starfield)`). Neu: `WebGLRenderer({ alpha: true })` und `setClearColor(0x000000, 0)` | Betreiber: „ich möchte gerne diese kleine sterne background wieder haben sonst sieht es so leer aus". Gemessen auf Ebene 7: `sternfeldBild: "none"` am `.stage` und `hellster: 0` in den Canvas-Pixeln — der Himmel war da, nur unsichtbar. Die Hintergrundfarbe kommt jetzt aus `app.css`, wo sie ohnehin stand |
| 2026-10-13 | **Die Nebel haben jetzt eine Kante, die keine ist.** Sie waren drei **Ellipsen ohne Weichzeichnung**, und nach dem Freilegen des Himmels waren sie das Auffälligste im Bild: grosse flache Formen mit sichtbarem Rand. Neu: `feGaussianBlur stdDeviation 90` über einer Gruppe, Deckkraft leicht erhöht | Ein Nebel hat keine Kante. Mit einem harten Rand sieht man eine **Form** statt Dunst — und eine Form im Hintergrund liest man als Objekt, nicht als Himmel |
| 2026-10-13 | **Vier Runden an der falschen Stelle gemessen — und der Betreiber hat es dreimal gesagt.** Auf „sieht beschissen aus" habe ich die **Welt** vermessen: Körpergrössen, Abstände, Ebenen, Bahnen. Beim vierten Mal war es eindeutig: „**nein es geht um gui ui ux**". Erst dann entstand `tools/ui-surface.ts`, das die Oberfläche vermisst | Ein Befund ohne Adressat ist wertlos. „Es sieht schlecht aus" nannte **kein** Objekt, und ich habe das Naheliegendste gewählt statt nachzufragen — **das war der Fehler**, nicht die Messung. Merksatz: *bei einer ästhetischen Rückmeldung zuerst fragen, **welche** Fläche gemeint ist.* |
| 2026-10-13 | **Die Schriftgrade waren gewachsen: elf Werte, keine Skala.** `tools/ui-surface.ts` gemessen: 8, 9, 9,5, 10, 10,5, 11, 11,5, 12, 12,5, 13, 14 px — und die kleinen ausgerechnet an den Stellen, die man **immer** liest (Knopfleiste 10 px, Etiketten 10,5 px, Kopfzeile 10 px, Achsenbeschriftung **8 px**). Neu: drei Stufen `--f-titel: 14px`, `--f-text: 12px`, `--f-klein: 11px`; 18 Regeln benutzen sie, **keine** Regel setzt mehr unter 11 px. Zum Vergleich die Skala des Harness, ausgezählt über seine **202** Stylesheets: 12 px (159×), 14 px (109×), 13 px (104×), 11 px (53×) — 8, 9, 9,5 und 10,5 px kommen dort **praktisch nicht vor** | Die Regel ist damit **gemessen**, nicht gewählt. Zwei eigene Fehldiagnosen sind dabei korrigiert: (1) die drei Schriftfamilien sind **kein** Fehler — `--dsh-font-family-text-default` **ist** `-apple-system, …`, der Harness benutzt die Systemschrift selbst; `--mono` (JetBrains Mono) liegt genau auf dem Code-Stack des Harness. (2) Die Ursache der Unleserlichkeit war nicht nur die Grösse, sondern `letter-spacing: 1.5px` mit Grossbuchstaben bei 10 px — eine dünne Schrift mit weiter Sperrung verliert die Strichdicke, die den Kontrast trägt. `--t3` ist von `#8b949e` auf `#b9c2cc` gehoben (Kontrast 6,2:1 → 9,7:1) |
| 2026-10-13 | **Fünf Tests für die Skala, die einen echten Rückfall gefunden haben.** `tests/typo-scale.test.ts` liest die **Stildatei** und prüft: drei Stufen vorhanden, jede benutzt, keine `font-size` unter 11 px (mit **benannter** Ausnahme für die 1:1 übernommene Vorlage `#screen-web`), und `--t3` hell genug | Der Test war zuerst **rot**, und zwar zu Recht: mein erster Anlauf hatte die kleinen Grade nur **übersteuert**, nicht bereinigt — 13 Regeln trugen weiter `8px` bis `10.5px`. Ein Übersteuern, das man nicht sieht, ist ein Rückfall, der auf den nächsten Umbau wartet. Danach an der Quelle ersetzt (8 Regeln jetzt `var(--f-klein)`), und der Test prüft die **Richtung**: weniger feste Zahlen ist besser, nicht schlechter |
| 2026-10-13 | **Noch offen, im Bild sichtbar und nicht behoben:** (1) im Suchfeld überlagert der Markentext `PROMETHEUS` die Objektliste; (2) der Zustandsbericht ist für seinen 280-px-Bereich zu breit („Harness-Anbindung**" bricht mitten im Wort); (3) die Achsenbeschriftung liegt auf der Knopfleiste unten links | Die drei sind **Layout**, nicht Schrift — sie brauchen eine Entscheidung über die Flächen, nicht eine weitere Zahl. Sie stehen hier, damit sie nicht als erledigt gelten, weil die Schrift stimmt | Sie waren drei **Ellipsen ohne Weichzeichnung**, und nach dem Freilegen des Himmels waren sie das Auffälligste im Bild: grosse flache Formen mit sichtbarem Rand. Neu: `feGaussianBlur stdDeviation 90` über einer Gruppe, Deckkraft leicht erhöht | Ein Nebel hat keine Kante. Mit einem harten Rand sieht man eine **Form** statt Dunst — und eine Form im Hintergrund liest man als Objekt, nicht als Himmel |
| 2026-10-13 | **Der leere Bildschirm des Betreibers ist gefunden und hat eine Zahl: auf Ebene 1 steht die Kamera zu nah an der Sonne, und dort ist nichts.** Gemessen (`tools/boot-with-state.js`, frische Seite je Abstand, Vorbelegung **vor** dem ersten Programmzeiler): bei gemerktem Abstand **140** (Ebene 1) ist das Canvas **leer** — nur Sternenhimmel, kein Körper, keine Beschriftung. Die Ursache: die Ebenen sind über den **Abstand** definiert (70 … 300 = Ebene 1), die Körper liegen aber in Welteneinheiten — der einzige Körper der Ebene, der Voyager, liegt bei **1412**. Wer die Kamera bei 140 auf die Sonne richtet, sieht ihn nicht, und die Sonne wird auf dieser Ebene ohne Anker nicht gezeichnet | Nicht geraten, sondern gemessen: `tools/level-image.ts` rechnet je Ebene durch, was im Bild steht — Ebene 1 „0 → (keiner)". Die **Behebung hängt an einer Entscheidung**: entweder den Abstandsbereich von Ebene 1 an seinen Inhalt binden, oder die Kamera beim Ebenenwechsel auf den nächsten Körper richten. Beides ist ein Eingriff in die Ebenenlogik, nicht in eine Zahl |
| 2026-10-13 | **Zwei eigene Werkzeugfehler, beide mit derselben Wurzel — und beide haben Messungen unbrauchbar gemacht.** (1) **`Page.addScriptToEvaluateOnNewDocument` gilt pro Seite und bleibt bestehen**: eine Seite, für jeden Abstand neu geladen, sammelt **alle** Vorbelegungen an, und sie laufen in Registrierungsreihenfolge — gemessen stand im Speicher 140, im Bild der Startblick bei 4,8 k. Jetzt öffnet **jeder** Abstand eine eigene frische Seite. (2) **`tools/level-image.ts` rechnete mit der falschen Grösse**: `|Lage| − Abstand` statt des euklidischen Abstands zur Kameraposition — es meldete für Ebene 7 „0 Körper", während das Bild den Knoten zeigt. Der Widerspruch ist im Werkzeug als Warnung festgehalten, samt der verbleibenden Ungenauigkeit (die Kamera wird dort auf die z-Achse gesetzt, der Startblick steht 38° schräg) | Ein Werkzeug, das die Anwendung **nachbaut**, prüft die Nachbildung — derselbe Fehler, an dem `opening-view.test.ts` schon einmal grün war, während das Bild falsch war. **57 Testseiten** hatten sich angesammelt und wurden geschlossen (`tools/pages.js --schliessen`); die Hypothese „verlorene WebGL-Kontexte" wurde geprüft und **widerlegt** (0 von 56) |
| 2026-10-13 | **Drei Zeilen dieses Registers waren durch eigene Reparaturen verschmolzen, gefunden und getrennt.** Beim Wiederherstellen überschriebener Einträge sind Inhalte in **einer** Zeile gelandet: „Werkzeugfehler / Nebel / `Page.enable`" standen als **eine** Zeile mit **neun** Zellen statt drei Zeilen mit je vier, eine weitere Zeile hatte eine überzählige Zelle, und eine Eintragung stand **doppelt**. Gefunden nicht beim Lesen, sondern durch **Nachzählen** | Dieselbe Wurzel wie die drei Überschreibungen: ein Einfügen, das nicht gegen das Ergebnis geprüft wird. Die Prüfung ist jetzt das **Nachzählen der Zeilen und der Zellen** — und die erste Fassung dieser Prüfung meldete einen **Fehlalarm** (eine Zeile enthält `5D\|4D`, also ein `|` mitten im Text), und der Fehlalarm führte zu einer Reparatur, die eine Zeile **löschte**. Merksatz: *ein ungeprüftes Werkzeug, das repariert, richtet Schaden an wie ein ungeprüftes, das einfügt.* |
| 2026-10-13 | **Offen, mit Messwerten belegt: auf den groben Ebenen ist der Abstand zu gross für den Inhalt.** `distanceForLevel(5)` = 35 840, dort ist der grösste Körper (`projekt-stack`, 671) **3 px** gross; `distanceForLevel(7)` = 573 440, dort ist der einzige Körper (`kosmischer Überblick`, 9000) **20 px**. Der grösste Körper einer Ebene bekommt nie eine Untergrenze — er ist ja der grösste —, also hilft `SPREIZUNG` dort **nicht** | Der Widerspruch ist echt und wird nicht stillschweigend gelöst: die Abstände sind Zweierpotenzen mit Faktor 4 je Ebene, die Körpergrössen des Beispiels wachsen aber nicht mit. Ob die Abstände enger, die Grössen gestreckt oder die Ebenen weniger werden sollen, ist eine **Entscheidung des Betreibers** — die Zahlen dafür stehen in `tools/scale.ts` |
| 2026-10-13 | **Der Neustart des Servers hat einen Fehler sichtbar gemacht, der zwei Stunden still war: die Marken-Schrift Montserrat wurde nicht geladen.** Vite protokollierte `The request id "…/ui-theme/src/styles/montserrat-medium.woff2" is outside of Vite serving allow list.` — die Design-System-Dateien des Harness liegen **ausserhalb** des Projektordners, und Vite liefert nur innerhalb aus. Für die `.css`-Dateien fiel das nie auf (sie werden eingebettet); die **Schriften** lädt der Browser als eigene Anfrage. Neu: `server.fs.allow` in `vite.config.ts` gibt `packages/client/ui-theme` frei | Betreiber: „starte mal das neu evt liegt es an dem". Er hatte recht — aber nicht, weil der Server **alt** war, sondern weil ein **Neustart** den Zustand wegnimmt, den ein laufender Server im Speicher hält. Über zwei Stunden lieferte der alte Prozess die Schriften noch aus; danach fiel die Marke auf die Systemschrift zurück. **Nachgemessen** (`tools/font.js`): `montserrat-medium.woff2 62448 B` kommt an, `Montserrat 500 loaded`, keine Meldungen mehr. Das war einer der Gründe, warum die Oberfläche „fremd" aussah |
| 2026-10-13 | **Zweiter Handfehler derselben Art, offen benannt: Zeile 961 des Registers war zerstört.** Beim Wiederherstellen der überschriebenen Zeile sind **zwei** Zeileninhalte in **einer** gelandet — sie hatte sechs Zellen statt vier. Gefunden beim Suchen des Tabellenendes für den nächsten Eintrag | Dieselbe Wurzel wie die drei Überschreibungen: ein Einfügen, das nicht gegen das Ergebnis geprüft wird. Die Zeile ist getrennt und beide Fassungen stehen jetzt einzeln. **Regel, ab jetzt geprüft:** nach jedem Eingriff wird die **Zellenzahl je Zeile** der letzten Einträge gezählt — nicht nur die Zeilenzahl |
| 2026-10-13 | **Der Betreiber hat benannt, was ihn stört: „dockingstuff wurde einfach rein getan plop auftaucht".** Gemeint ist der **Aufbau** der Oberfläche, und er hat recht: `.dockhost` liegt mit `position: absolute; inset: 0` **über** dem Canvas, die Zonen sind **halbdurchsichtig** (`#0b0b0eee` + `backdrop-filter`), und beim Wechsel von Chat auf Welt wird der `screen-os`-Baum gebaut — die Panels **erscheinen** schlagartig darüber. Sie sind nicht **eingebaut**, sondern hineingelegt | Vier Runden lang hatte ich an Schriftgraden, Kontrasten und Überlappungen gemessen, ohne den Aufbau anzusehen. **Zwei Umbauten sind gescheitert und zurückgenommen:** (1) ein Flex-Streifen — die Panels wurden ein Band über die ganze Breite, die Welt ein schmaler Streifen; (2) ein Raster mit `display: contents` — die Panels ragten über den Rand, die Welt wurde ein Streifen, unten blieb eine leere Fläche. Beide waren **schlechter** als der Ausgangsstand und wurden verworfen statt repariert: ein kaputter Umbau ist schlimmer als ein bekannter Mangel |
| 2026-10-13 | **Was ein richtiger Dock-Umbau braucht — aufgeschrieben, damit der nächste Anlauf nicht wieder gerät.** (1) Die Zonen müssen **Kinder des Rasters** sein; `display: contents` scheitert daran, dass die Panels ihre Breite über `flex-basis` setzen (`dock-view.ts`) und im Raster kein Flex-Kontext existiert — es braucht `grid-template-columns: 280px 1fr 280px` und eine Regel, die beim Ziehen die **Rasterspalte** setzt. (2) Der Umbau braucht ein **eigenes Messwerkzeug** (`tools/dock-layout.js`), das die Kästen von Kern, linker, rechter und unterer Zone liest und meldet, ob sie sich überlappen oder aus dem Bild ragen — sonst ist „es sieht falsch aus" wieder eine Beobachtung statt einer Zahl | Der Grund, warum meine beiden Anläufe scheiterten, ist derselbe wie bei allem anderen in dieser Sitzung: ich habe **geändert und angesehen** statt **gemessen und nachgerechnet**. Die Anforderung ist jetzt als Kommentar an der Stelle hinterlegt, wo sie hingehört — in `app.css` bei `.dockhost` |
| 2026-10-13 | **Der Betreiber hat mit vier Ausschnitten gezeigt, was gemeint war — und die Messung fand drei echte Fehler.** `tools/build-up.js` liest Position und Grösse der Panels, ihrer Reiter und Zellen. Befund: **`.tabs` war ein Geschwister des Panels in einer `flex-direction: row`-Zone** — also eine **Spalte**, gemessen **253 × 900** px, und das Panel daneben hatte nur **157** px Breite. Die Folge: der Zustandsbericht brach über **sieben Zeilen** mitten im Wort, und links davon stand eine scheinbar leere Zelle | **Behoben:** die Reiter liegen jetzt **in der Kopfzeile des Panels** (gemessen 132 × 21, innerhalb des Panels), das Panel ist von **157 auf 285 px** gewachsen, die Beschreibung steht in **drei** Zeilen. Der Betreiber hatte zudem gefordert, sie „auszublenden … bis man es per Button macht": sie sind jetzt **leise Knöpfe** in der Kopfzeile statt eines eigenen Bandes, und sie erscheinen nur, wenn es ein Geschwisterpanel gibt |
| 2026-10-13 | **Zwei eigene CSS-Fehler, die die Welt unbedienbar machten — beide von mir, beide an derselben Stelle.** (1) `.dockhost > * { pointer-events: auto }` gab **allen drei Zonen** Zeigerereignisse; die Zonen sind Flex-Kinder und werden auf die volle Höhe gestreckt (gemessen **900** px), also fingen sie zusammen fast den ganzen Bildschirm ab. (2) Beim Umbau gesetzt und beim Zurücknehmen **stehengeblieben**: `.core > * { pointer-events: auto }` — **dieselbe Spezifität** (0,1,0) wie `.labels { pointer-events: none }`, und weil es **später** stand, gewann es. Gemessen: `labels pe="auto" z=3` **über** `world z=2` — eine unsichtbare Ebene fing jedes Radereignis, jeden Zug und jeden Klick ab | Betreiber: „**noch dazu kann ich es nicht mehr universe ect steuern mit maus und oder tastatur**". **Nachgewiesen statt behauptet** (`tools/controls.js` schickt echte Eingaben und liest den Kamerazustand): Empfänger in der Bildmitte ist jetzt `world` statt `labels`; Rad ändert den Abstand **4761 → 3014**, ein Zug die Drehlage **−0,429,0,200,0,098 → −0,404,0,263,0,059**, Taste `+` den Abstand **3014 → 2411**. Merksatz: *bei gleicher Spezifität entscheidet die Reihenfolge — eine Regel, die „aufräumt", kann eine ältere still überschreiben.* |
| 2026-10-13 | **Alle Panels starten jetzt abgesteckt — die Welt ist beim Öffnen frei.** Der Betreiber: „**die andere stuff ist immer noch da: terminal, suche, zustand und abgedeckt??**". Ursache: `search` stand auf `zone: 'left'`, `status` und `health-check` auf `zone: 'right'`, das Terminal auf `zone: 'bottom'` — drei Panels lagen also **von Anfang an** über der Welt. Neu: **alle** starten `closed` und werden über die Leiste unten links („+ Suche · + Terminal · …") oder den Befehl geholt | Gemessen (`tools/build-up.js`): alle drei Zonen sind jetzt `display: none`, die Welt hat den ganzen Bildschirm. **Warum `closed` und nicht „unsichtbar":** ein ausgeblendetes Panel wäre nicht mehr erreichbar; ein abgestecktes ist genau das Verlangte — nicht da, bis man es ruft, und dann mit seiner Grösse und Anordnung |
| 2026-10-13 | **Die Ablage des Docks wurde auf `v2` gehoben — sonst hätte der Betreiber die Änderung nicht gesehen.** `loadLayout` gleicht den **gespeicherten** Zustand gegen die aktuellen Angebote ab, und der gespeicherte **gewinnt**: wer die Panels einmal offen hatte, behält sie offen, auch nach einer geänderten Voreinstellung | Derselbe Fehler wie beim gemerkten Kamerastand und beim `localStorage`, den ein `beforeunload` zurückschreibt — **ein Zustand, der in der Ablage liegt, überlebt jede Änderung an der Voreinstellung.** Eine neue Fassung heisst: einmal die neue Voreinstellung, ab dann gilt wieder die Anordnung des Nutzers. Die alte Ablage bleibt stehen, sie wird nur nicht mehr gelesen |
| 2026-10-13 | **Ein fehlender Baustein im Test-Stub, gefunden weil ein Test den Startweg prüft: `MutationObserver`.** Die Anwendung benutzt ihn in zwei Panels, um einen Zuhörer abzulösen; in Bun gibt es ihn nicht (er ist DOM). Sichtbar wurde es erst, als die Panels **`closed` starteten** — vorher legte der Start die Panels gar nicht an, und der Fehler blieb verborgen. `tests/dom-stub.ts` hat jetzt eine Attrappe, die **nichts beobachtet** (sie merkt sich den Rückruf und ruft ihn nie) | Ein Test, der den **Startweg** prüft, findet so etwas; einer, der Elemente zählt, nicht. Und die Attrappe ist bewusst passiv: ein Stub, der Änderungen erfindet, täuscht Verhalten vor, das es im Test nicht gibt |
| 2026-10-13 | **Die Panels waren beim Betreiber weiterhin da — und der Grund war die Ablage, nicht der Code.** Nachgemessen im Raum `mess`: `Zonen: ["left=none","right=flex","bottom=none"]`, und in der Ablage stand `plugin:health-check=right` aus der Zeit **vor** der geänderten Voreinstellung. `loadLayout` gleicht den gespeicherten Zustand gegen die Angebote ab, und der gespeicherte **gewinnt** — eine Änderung an der Voreinstellung erreicht also **niemanden**, der die Panels schon einmal angefasst hat | Neu: die Anordnung trägt eine **Fassung** (`LAYOUT_VERSION = 3`). Passt sie nicht, wird die gespeicherte Anordnung **einmalig** verworfen und die Voreinstellung gilt; danach ist die Anordnung des Nutzers wieder die Wahrheit. Ehrlicher als ein Umbenennen des Schlüssels: **eine** Ablage, **ein** Schlüssel, ein sichtbarer Grund für den Reset. Danach gemessen: `["left=none","right=none","bottom=none"]` |
| 2026-10-13 | **FÜNFIGER eigener Handfehler beim Führen dieses Registers, offen benannt — und die Ursache ist jetzt behandelt.** Beim Einfügen habe ich fünfmal den **Anfang einer bestehenden** Zeile als Suchtext benutzt und sie damit überschrieben: Planeten-Grössen, `Page.enable`, die Nebel, „Zwei eigene CSS-Fehler", zuletzt den `MutationObserver`. Dazu kamen ein **Duplikat** und eine Zeile mit **zu vielen Zellen** (mein Einsatztext enthielt Striche). Alles aus dem Sitzungsverlauf wiederhergestellt | Fünfmal derselbe Fehler heisst: die **Vorgehensweise** ist falsch, nicht die Aufmerksamkeit. Deshalb wird jetzt **gezählt** statt gehofft: nach jedem Eingriff werden Zeilenzahl und Zellenzahl geprüft und sieben Schlüsselzeilen einzeln nachgeschlagen. Und beim Einfügen wird ausschliesslich ans **Tabellenende** angehängt — nie auf eine bestehende Zeile gezielt. Merksatz: *ein Suchtext, den man aus einer Zeile abschreibt, die man behalten will, ist kein Anker, sondern eine Löschung.* |
| 2026-10-13 | **Die Kopfzeile aktualisiert jetzt nur die Zahl.** Betreiber: „**die fps zahlen sollte eigentlich einzeln aktualisieren ohne den text**". Vorher stand **ein** Übersetzungsschlüssel (`hud.summary`) für die ganze Zeile, der alle 700 ms den **gesamten** Text neu setzte — bei jeder Änderung der Bildrate wurde auch „Ebene Sonnensystem · 4,8 k" neu geschrieben. Neu: drei Felder (`hud.level`, `hud.distance`, `hud.fps`), jedes wird **nur bei Änderung** geschrieben, und `#hudFps` bekommt `tabular-nums` mit `min-width: 7ch`, damit die Zeile beim Wechsel **60 → 280 fps nicht springt** | Der Test `locale-keys` hat dabei **zugeschlagen**: er fand `tr('hud.summary', …)` in meinem **Kommentar** und meldete den Schlüssel als fehlend. Er hat recht — ein Kommentar, der wie ein Aufruf aussieht, ist eine Falle für die Prüfung. Umformuliert |
| 2026-10-13 | **Die Panels waren sichtbar, aber nicht bedienbar — die Kernfläche lag über ihnen.** Betreiber: „**wenn ich es zb aktiviere ist es nicht interaktiv und DockStation mechanik auch nicht vorhanden kann nicht wegnehmen ect**" und „**ich kann es auch nicht bewegen alles was dazu gehört**". Gemessen (`tools/panels.js`): an der Kopfzeile eines offenen Panels liefert `elementsFromPoint` als **erstes** Element `world` — den Canvas der Kernfläche. Also ging jedes Ziehen am Griff und jeder Klick im Panel an den Canvas. Neu: `.core { z-index: 1 }` und `.dockhost { z-index: 2 }` | Dass das „✕" trotzdem wirkte, war **kein** Gegenbeweis: der Test hatte das Ereignis **erfunden** und direkt auf den Knopf geschickt — ein erfundenes Ereignis braucht kein Trefferbild. Nur ein echter Zeiger trifft, und der traf die Kernfläche. Nach dem Fix gemessen: `["panelhead","panel","dock-col","world"]` — das Panel ist jetzt oben |
| 2026-10-13 | **Die zwölf Knöpfe sind weg — die Panels sind jetzt eine Gruppe IN der Insel.** Betreiber: „**sollten wir das nicht in dynamic illand implementieren als ein punkt oder Button wie dynamic illand die man drücken könnte**". Er hat recht, und der Grund ist der Entwurf selbst: die Dynamic Island ist die **einzige** Navigation („Eine Seitenleiste gibt es nicht"), und die Leiste war ein **zweiter** Weg für dieselbe Sache — gemessen **1166 px** breit, quer über den Bildschirm, auf der Welt | Neu: die Insel hat eine Gruppe „▤ panels" mit zwölf Einträgen („▣ Suche offen" / „▢ Terminal abgesteckt"). Ein Klick **holt** das Panel oder **steckt es ab**. Nachgemessen: Leiste `display: none`; 12 Einträge; Klick auf „Terminal" → `plugin:debug-terminal=bottom` und `zone-bottom=flex` (es kommt also wirklich). Dazu neu `openPanel(id, ziel)` — die Zielzone muss der Aufrufer nennen, weil alle Angebote inzwischen `closed` sind und das Dock sonst jedes Panel rechts ablegen müsste |
| 2026-10-13 | **Die Knopfleiste schnitt den Namen „Sonne" an — sie liegt nicht mehr auf der Welt.** Betreiber: „**immer noch da den abgedeckte teil?**", mit einem Ausschnitt, in dem die Pille über dem Namen lag. Die Leiste ist `position: absolute; bottom: 14px` und lag damit **auf** der Welt. Neu: die Kernfläche endet **über** ihr (`bottom: calc(var(--leiste-hoehe) + 24px)`), also wird die Welt um die **gemessene** Höhe der Leiste gekürzt statt verdeckt | Gemessen (`tools/build-up.js`): Kernfläche und Canvas enden bei **y = 835**, die Leiste beginnt bei **845** — überschneidungsfrei. **Was das nicht ist:** die Leiste verstecken — sie war damals der einzige Weg zu den Panels, und eine unsichtbare Bedienung ist keine. Sie bekam Platz statt Verdeckung; inzwischen ist sie ganz abgeschafft (siehe die Zeile zur Insel-Gruppe) |
| 2026-10-13 | **Fünf Befunde des Betreibers, drei davon behoben — alle am Ziehen und an der Achsenanzeige.** (1) „**in mitte rot rein tue verschwindet es einfach**": `zoneAt` gab am **oberen Rand** `'closed'` zurück — wer ein Panel nach oben zog (und die Bildmitte war schnell „oben"), **steckte es ab**. Jetzt steckt nur noch **die Insel** ab, alles andere wird schwebend. (2) „**diese komische rote anzeige umrandung**": zwei gestrichelte Zielmarken lagen über dem **ganzen** Bildschirm. Jetzt leuchtet **nur die Insel** auf, wenn sie im Weg ist (`#isl.dropziel`). (3) „**achsen anzeige ist naja bischen weit zu oben verschoben**": sie sass bei `y = 611`; gemessen steht sie jetzt bei **y = 715** (24 px zu beiden Rändern) | Nachgemessen mit `tools/panels.js` und `tools/build-up.js`. **Und dabei zwei CSS-Fallen gefunden:** es gab **drei** Regeln für `.axes`, und die spätere überschrieb die frühere still (mein `bottom: 24px` blieb wirkungslos, gemessen unverändert bei 611); dazu Regeln für `.axis`, `.axis.x/.y/.z` und `.axis-row` — **toter Code** einer Knopfreihe, die es nicht mehr gibt, und zum Verwechseln ähnlich. Beides entfernt |
| 2026-10-13 | **Die Panel-Liste in der Insel ist jetzt eine aufklappbare Gruppe.** Betreiber: „**ist das möglich dieses irgendwie zu veringern als eine art dropdown liste sozusagen?**" Zwölf Zeilen machten aus der Übersicht eine Liste. Jetzt steht dort **eine** Zeile „▸ ▤ panels · 2 von 12 offen"; ein Klick zeigt die Einträge, ein zweiter klappt sie zu. Der Zustand ist eine **Marke mit Text** („● offen" / „○ abgesteckt") statt der Zeichen `▣`/`▢`, die man nicht unterscheiden kann | Gemessen: 12 Einträge, Klick auf „Terminal" → `plugin:debug-terminal=bottom`, `zone-bottom=flex`. Der Auf-/Zu-Zustand lebt **nur in der Sitzung** — er ist eine Sicht, keine Einstellung, und gehört deshalb nicht in die Ablage (dort steht, welche Panels offen sind) |
| 2026-10-13 | **Die Zoom-/Abstands-Anzeige ist jetzt ein Strich-Objekt — nach dem Vorbild des Harness, aber in seiner Sprache.** Betreiber: „für den zoom und distanz könnten wir zb theoretisch diese logic vom Deepseek Harness nutzen … das gleiche behandel als eine art objekt die man theoretisch verschieben kann und verschwinden könnte". **Was der Harness hat** (`ui-sidebar-documentpreview/src/client/zoom/`): `ZoomControls.tsx` mit `−`/Wert-Knopf/`+`/„Fit width", `steppedZoom()` (Rastung auf Vielfache), **automatisches Ausblenden** und `ZoomLabels` aus dem Sprachpaket. **Was hier daraus wurde:** sieben **dünne Striche**, einer je Bezugsebene — der aktive lang und hell, und **Klick, Rad und Ziehen** sind die Bedienung. Kein Rahmen, keine Füllung, kein Knopfpaar. Name und Abstand stehen daneben, das „✕" erscheint nur beim Überfahren | **Erste Fassung war ein Kasten** (Titelzeile, grosser Ebenenname, „−"/„+") — der Betreiber: „**sieht scheisse aus nicht modern nicht scifi** und ich würde lieber den strich nutzen als button und als scrollen". Er hat recht: ein Kasten mit zwei Knöpfen ist ein **Formular**, ein Massstab aus Strichen ist ein **Instrument**. Die Einheit ist hier die **Ebene**, nicht ein Faktor; deshalb steht dort kein Prozentwert, sondern Ebenenname und Abstand — und jeder Sprung geht über `distanceForLevel`, dieselbe Funktion wie die Sprungmarken. Der Zustand (Position, Sichtbarkeit) liegt **je Raum** in der Ablage, wie Kamera und Dock |
| 2026-10-13 | **Drei Tests haben zugeschlagen, und alle drei hatten recht.** (1) `boot.test.ts`: „Element #core fehlt" — der DOM-Stub kannte `#core` und die drei HUD-Felder nicht, die mit der Ansichts-Leiste dazukamen; ergänzt. (2) `locale-keys`: es sah `view.controls.out/in/show` als **unbenutzt** — meine `knopf()`-Funktion bekam den Schlüssel als **Zeichenkette**, und der Test findet nur **direkte** Aufrufe. Also steht der Aufruf jetzt dort, wo der Text gebraucht wird. (3) `typo-skala`: das „✕" der Leiste war `10px` — unter der Skalen-Untergrenze | Keiner der drei war ein Fehlalarm. **Der zweite ist der lehrreichste:** ein Schlüssel, den man nur als Zeichenkette herumreicht, findet man beim Aufräumen nicht wieder — und der Test hat ihn gefunden, weil er **direkte** Aufrufe sucht. Die drei überflüssigen Schlüssel sind **gelöscht**, nicht als „begründete Ausnahme" durchgewinkt |
| 2026-10-13 | **Drei Vorschläge des Betreibers sind NICHT umgesetzt — sie stehen als offene Punkte.** (1) „**jeder diese objekte sollte eine art extra button haben**" (Bild 2 und 3: Kopfzeilen mit Zahnrad, Fenster-Icon, Schliessen) — die Panelkopfzeile hat heute nur Griff, Titel, Umschalter und „✕". (2) „**es sollte auch grösse verschieben ändern können. wie ein klebstoff mit andere objekte nebeneinander nachbar reagieren**" — Andocken **aneinander**, Teilen einer Spalte, Ziehen der Kante: heute dockt ein Panel nur an **eine** der drei Zonen. (3) „**achsen anzeige … behandle es als eine docking station mechanik implementierung als objekt das zb irgendein ecke darüber erst ermöglicht es zu verschieben**" — die Anzeige sitzt fest | **Warum nicht gemacht:** alle drei sind **Mechanik**, nicht Kosmetik — sie brauchen einen Entwurf (welche Knöpfe, wie wird geteilt, wie wird eine Kante gezogen) und eigene Messungen, sonst baue ich wie bei den zwei gescheiterten Dock-Umbauten wieder ins Blaue. Der Betreiber hat die Richtung genannt; die Umsetzung gehört in einen eigenen Durchgang **mit Werkzeug zuerst** |
| 2026-10-13 | **„Es ist immer noch eine Sonne obwohl ich ultra weit weg bin" — drei Ursachen, alle gemessen, alle behoben.** Betreiber: „**sollte da keine universum werden als maxout**", mit der Reihenfolge „planet, Das Sonnensystem, Galaxien & Das Universum". (1) **Die Anker-Suche lief über den ganzen Baum** (`suche(root, …)`) und fand die Sonne **immer** — auch auf Ebene 7, wo sie ein Punkt *innerhalb* des Überblicks ist. Neu: die Suche steigt nur ab, wo `body.level >= level` — das Sonnensystem (L4) wird auf Ebene 1–2 betreten, ab Ebene 5 nicht mehr. Gemessen: Anker auf **1–2**, keiner auf **3–7**. (2) **Die Nachführung kämpfte gegen das Rad:** sie setzte den Abstand auf den Inhalt der neuen Ebene und zog damit jeden Zoom zurück (Rad 4 761 → 8 134 → 13 896, Nachführung 1 550 → 3 014 → 3 014 — Ergebnis **stehengeblieben**). Neu: beim Ebenenwechsel wird **nicht** mehr nachgeführt. (3) **Die Ebenenbänder und die Rahmung passten nicht zusammen:** Ebene 5 verlangt ab 17 950, ihre Rahmung rechnet 1 550 — jede Rahmung warf die Ansicht in ein feineres Band zurück. Nachgerechnet: mit `SCHWELLE 30` statt 70 liegen die Rahmungen der Ebenen 5–7 sauber im eigenen Band | **Nachgemessen mit echten Radereignissen** (`tools/zoom-out.js`) statt mit gesetzten Werten: 3 132 (Sonne) → 26 682 (projekt-stack) → 227 274 (**kosmischer Überblick**) → 4 000 000, **ohne Sonne**. **Und ein Test hat die Kopplung gefunden:** „der Startblick zeigt das Sonnensystem — Erwartet 4, bekommen 5"; der Faktor in `openingView` ist deshalb **3,8 → 2,5** (3 132). Beide Tests halten die Kopplung jetzt fest: *Schwelle und Startfaktor sind eine Entscheidung, nicht zwei* |
| 2026-10-13 | **Die echten Grössenordnungen sind gemessen und im Code festgehalten — mit ihrem Widerspruch.** `tools/magnitudes.ts` rechnet die Hierarchie in Kilometern (Zahlen des Betreibers): Planet → Sonne **109×** → Sonnensystem **6 900×** → Oortsche Wolke **1 560×** → Sternhaufen **25×** → Milchstraße **2 500×** → Lokale Gruppe **10×** → Laniakea **50×** → beobachtbares Universum **1 870×** | **Die echten Stufen springen um Faktor 10 bis 6 900 — ein konstanter Faktor kann das nicht abbilden.** Vier Ebenen Abstand sind hier rund 256-fach, nicht milliardenfach. Das steht als **bewusster Verzicht** bei `SCHWELLE` in `camera.ts`: die **Reihenfolge** stimmt (Kleinkörper → Planet → Stern → Sonnensystem → Sternhaufen → Galaxie → Universum), die **Steilheit** nicht. Wer das ändern will, muss die Ebenenzahl erhöhen — nicht den Faktor |
| 2026-10-13 | **Drei eigene Fehler beim Umbau, alle offen benannt und alle behoben.** (1) **Zeilenweises Löschen per PowerShell hat zu viel erwischt**: die schliessende Klammer von `viewHeight()` und ein Kommentarkopf waren mit weg — acht Syntaxfehler. (2) **Zwei Konstanten mit demselben Namen:** `SCHWELLE` stand **zweimal** in `camera.ts` (30 oben, 70 weiter unten), die spätere gewann — wer an der einen drehte, sah keine Wirkung. (3) **Eine Zeile dieses Registers war verschmolzen** (doppelter Inhalt, zu viele Zellen), gefunden beim Nachzählen | Alle drei sind dieselbe Klasse: **eine Änderung, die nicht gegen ihr Ergebnis geprüft wird.** Die Prüfungen sind hier der Typecheck, das Nachmessen der Wirkung und das Nachzählen der Tabelle — und alle drei haben angeschlagen. Merksatz: *zeilenweise zu löschen ist so riskant wie zeilenweise zu suchen.* |
| 2026-10-14 | **Der „abgedeckte Teil" war kein Element — es war der RAND EINES FILTERBEREICHS. Endlich gefunden, nach drei Meldungen.** Betreiber: „die andere stuff ist immer noch da", „immer noch da den abgedeckte teil?", „das sollten wir ändern". **Was ich zuerst falsch suchte:** ein DOM-Element mit Fläche. Gemessen mit einer Abfrage über **alle** Elemente > 400×300 samt `background-color`, `background-image`, `box-shadow`, `backdrop-filter` — es gab **keine** Verdächtigen ausser `BODY` und `#screen-os` (Vollbild, also richtig). **Der Beweis kam durch Abschalten:** Canvas versteckt → Kasten **weg**; Sternenfeld versteckt → Kasten **weg**. Also lag er in `#screen-os::before` — dem Sternenfeld-Bild. Darin standen drei Nebel als **Ellipsen mit `feGaussianBlur`**. Ein SVG-Filter wird auf seinen **Filterbereich** gerastert, und der ist ein **Rechteck**: alles darüber hinaus ist abgeschnitten, und die Kante des Nebels wurde zur **Geraden**. Sie stand still, während sich die Welt drehte — deshalb sah es wie ein abdeckendes Panel aus | **Behoben, indem die Ursache unmöglich gemacht wurde:** der Nebel ist jetzt ein `radialGradient` mit `stop-opacity: 0`. Ein Verlauf hat **keine** Rastergrenze, also gibt es nichts zu beschneiden. Dazu `preserveAspectRatio="none"` statt `slice` — `slice` **schneidet** bei fremdem Seitenverhältnis, und der Schnitt ist wieder eine gerade Kante. **Werkzeug: `tools/sky.js`** fährt alle sieben Ebenen ab und legt je ein Bild hin; die Lehre: *wenn ein Fehler „stehen bleibt, während sich alles dreht", ist er kein Weltelement — und wenn er beim Verstecken einer Ebene verschwindet, ist er in dieser Ebene.* |
| 2026-10-14 | **Zwei Rechenfehler, die der Betreiber GESEHEN hat und kein Test — beide behoben und beide jetzt geprüft.** (1) **Die Sichtgrenze war um Faktor 2 zu klein.** Sie heisst `MIN_BODY_PIXELS = 2,4` — also **Pixel** — und war gerechnet als `2,4 · d · tan(fov/2) / viewHeight`; richtig ist `· 2 · tan(fov/2) / viewHeight`, denn die halbe Fensterhöhe ist `viewHeight/2`. Probe: dieselbe Grenze vorwärts in Pixel gerechnet ergab **1,2** statt 2,4. Betreiber: „**beim zb projekt stack … verschwindet und taucht auf komische weisse und grösse das man es gar nicht erkennen kann**". (2) **Die Ebenennamen passten nicht zur Skala.** Ebene 5 hiess „Sternhaufen", Ebene 7 „Kosmischer Überblick" — das Maximum der Kamera hiess also **nicht** „Universum", obwohl der Betreiber genau das verlangt hat („**sollte da keine universum werden als maxout**"). Neu: Kleinkörper → Planet → Stern → Sonnensystem → **Sternsystem** → **Welteninsel** → **Universum** | **Warum kein Test das fand — und was ich daraus geändert habe.** Der Test rechnete **dieselbe falsche Formel** noch einmal nach und schrieb ihr Ergebnis als Erwartung fest; ein Test, der die Rechnung wiederholt, **bestätigt** sie statt sie zu prüfen. Deshalb geht `tests/scale-pixel.test.ts` den anderen Weg: er rechnet die Grenze **vorwärts** in Bildpunkte und verlangt genau `MIN_BODY_PIXELS` — bei 30°, 45°, 60° und 90°. **Gegenprobe gemacht:** mit der alten Formel wird der Test rot („Expected 2.4, Received 1.2"). Die umbenannten Ebenen haben einen Test gerissen (`level 5 zeigt den Sternhaufen`) — der prüfte dasselbe wie vorher, nur mit dem neuen Namen. Und **eine Zeile dieses Registers war noch kaputt** (Rest einer früheren Zeile in Zelle 4), gefunden beim Nachzählen. |
| 2026-10-14 | **Die Welt ist noch nicht „realistisch gross" — und jetzt ist die Ursache eine Zahl, nicht ein Gefühl.** Nach den zwei Korrekturen gemessen (`buildScene` + `bodyPixels`): der **grösste** Körper jeder Ebene nimmt zu **0,7 px** (Ebene 6, `prometheus`) und **1,8 px** (Ebene 7, `kosmischer Überblick`) — und der **Deckel** der Untergrenze ist der Grund: `minBodySize` wird auf den **grössten** Körper der Ebene begrenzt, und auf diesen Ebenen **ist** das grösste Objekt der einzige Inhalt. Auf Ebene 6 liegt `prometheus` (Radius 1400) bei Abstand 1,48 M und ist darum 0,7 px gross — die Untergrenze darf ihn nicht anheben, weil sie bei ihm gedeckelt ist. Auf den Ebenen 4 und 5 wirkt sie dagegen (Sonnensystem 2,4 px, nodes 6–9 px) | **Der Widerspruch, der dahinter steht:** ein Faktor 4 je Ebene über 7 Ebenen ergibt 4⁶ = **4096**-fachen Bereich, die echten Stufen springen aber um **10 bis 6900** (siehe `tools/magnitudes.ts`). Der Betreiber hat die richtige Lösung schon genannt — „**ich denke die grösse zoom sollte in bestimmte ebene geändert gezeichnet werden**" — und sie heisst **mehr Ebenen**, nicht ein grösserer Faktor. Mit mehr Ebenen wird jede Stufe flacher, und die Untergrenze kann überall greifen. **Offener Entwurf, kein Versehen.** |
| 2026-10-14 | **Die Skala hat jetzt ZWÖLF Bezugsebenen statt sieben — und der Baum hat keine Lücke mehr.** Betreiber-Entscheidung: „**Mehr Ebenen (10-12) nach astronomischer Folge**" statt „erst Deckel weg". `Level` ist 1–12, `LEVELS` trägt die astronomische Reihe (Kleinkörper, Planet, Stern, Sonnensystem, **Planetensystem**, **Sternsystem**, **Sternhaufen**, **Welteninsel**, **Galaxiengruppe**, **Galaxienhaufen**, **Superhaufen**, Universum), und `EBENEN_MAX` wird aus `LEVELS.length` **gelesen** statt an vier Stellen hingeschrieben. Der Beispielbaum ist umgebaut: Ebene 4 Sonnensystem → 5 Planetensystem → 6 Sternsystem (projekt-stack) → 7 Sternhaufen → 8 Welteninsel (prometheus) → 9–12 Umschläge bis zum Universum. Für die leeren Stufen gibt es `umschlag()`: ein Knoten mit astronomischem Namen und **einem** Kind | **Zwei eigene Fehler, beide von einer Prüfung gefunden, nicht vom Auge.** (1) Der Sternhaufen hing zuerst **neben** dem Sternsystem statt darum — damit hing der Projekt-Stapel **zweimal** im Baum; `tests/universe.test.ts` („jede Kennung ist eindeutig") hat es gefunden. (2) Danach hieß der Stapel selbst „Sternsystem" auf Ebene 6, aber seine Kinder sind Ebene 4 — die Kette **übersprang** Stufe 5, und `describeLevel(6)` fand nichts. **Und `MAX_DISTANCE` musste mitwachsen:** bei 4 Mio war bei Ebene 9 Schluss, die Ebenen 10–12 lagen hinter der Grenze. `tests/camera.test.ts` („herauszoomen führt durch ALLE Ebenen", Liste aus `EBENEN_MAX` gebaut) hat es gerissen. Gemessen: `tools/sky.js` fährt jede der zwölf Ebenen gezielt an — **„Alle zwölf Ebenen treffen ihr eigenes Band"**, und die Sterne fallen von 900 auf 199. |
| 2026-10-14 | **Der Deckel bei der Größengrenze ist weg — er war der Grund für die leeren Bilder, und der Betreiber hat es dreimal gesagt.** `minBodySize` war gedeckelt beim **größten** Körper der Ebene. Auf den Ebenen 1–7 schadet das nicht; auf den groben Ebenen **8–12 steht aber nur EIN Körper**, also war `minSize = sein Radius` und die Sichtgrenze wirkungslos. **Gemessen** (`tools/_groesse.ts`): prometheus 1,1 px · lokale Gruppe 1,0 px · Galaxienhaufen 0,7 px · Laniakea 0,5 px · kosmischer Überblick **0,3 px** — ein leeres Bild. Mit dem Wegfall: alle **5,0 px**, und auf den Ebenen 3–7 ändert sich **nichts**. `MIN_BODY_PIXELS` stieg dabei von 2,4 auf **5** (Radius), damit die Zeichnung aus `aggregateSvg` erkennbar ist. Betreiber: „**komische weisse und grösse das man es gar nicht erkennen kann was es ist**" | **Der Deckel wird nicht gebraucht** — er sollte verhindern, dass alle Körper gleich groß werden, aber `reference / SPREIZUNG` (Median/12) liegt *immer* unter dem Median und damit unter dem größten. Was der Deckel tat, war einzig die **Sichtgrenze abzuschalten**. Drei Tests schrieben die alte Regel fest und mussten umgeschrieben werden; einer davon (`die Untergrenze staucht die Grössen`) prüfte „minSize < Median" — das galt nur für die Ebenenregel und verhinderte genau die Sichtbarkeit, die der Betreiber verlangt. **Was noch offen ist und im Bild sichtbar:** auf Ebene 12 ist der Körper jetzt da (≈10 px), aber **dunkel**, und sein **Name fehlt** in der Anzeige. |
| 2026-10-14 | **Der Himmel gehört jetzt zur Bezugsebene — „das Universum dehnt sich aus, aber nicht überall gleich".** Betreiber: „**beim maximum denke ich es wäre besser das es komplett in eine umhüllung aussehen könnte mit weisse sterne weil universum sich ja ausdehnt aber ab bestimmt grenze von weitem sollte irgendwann nicht überall sterne geben hintergrund verstehst was ich meine?**" Verstanden als **Maßstabsfrage**, nicht als Farbfrage: jede Ebene hat ihre eigene Leere. `HIMMEL` in `main.ts` gibt **jeder der zwölf Stufen** drei Nebelfarben (Kleinkörper fast schwarz → Stern warm → Sternsystem violett → Welteninsel blau → Universum kalt und leer), und `starfieldUrl(ebene)` zeichnet nach aussen **weniger** Sterne (Anteil 1,0 → **0,22**) und **weissere** (Weissanteil 0,40 → **0,96**). Gemessen mit `tools/sky.js`: **900 Sterne auf Ebene 1, 199 auf Ebene 12**. | **Und die Sterne bleiben an ihrem Platz.** Die Lage kommt aus einem **festen** Zufallsstartwert: weniger Sterne heisst, dass welche **wegfallen** — nicht, dass alle **springen**. Ein wechselndes Feld wäre beim Zoomen ein Flackern und beim Neuladen ein anderes Weltall. Das Sternenfeld wird nur bei einem **Ebenenwechsel** neu gebaut (`himmelEbene`), nicht je Bild — und diese Merkzahl stand zuerst an der falschen Stelle im Modul: `settings.onChange` ruft `applyStarfield` schon beim Aufbau, ein `let` wäre vor seiner Zeile nicht definiert gewesen. |
| 2026-10-14 | **Ein Werkzeugfehler, der eine Messung falsch machte — und der Widerspruch, der ihn fand.** `tools/sky.js` fuhr die Ebenen über das **Mausrad** an und meldete „8 von 12 Ebenen erreichbar". Die Arithmetik sagte aber, dass jede Ebene ihr eigenes Band trifft. **Der Grund lag in der Auflösung der Messung:** ein Radereignis sind `-deltaY / 100` Rastschritte, bei `deltaY = 120` also **1,2** — mit vier Zügen je Runde ist man bei Faktor 2,94 und **springt** über eine Stufe (eine Ebene ist Faktor 4). Zwei Läufe mit sechs bzw. zwei Zügen je Runde lieferten „7 von 12" und „1 von 12" — **beide falsch, in verschiedene Richtungen.** Die Lösung war nicht ein besserer Faktor, sondern ein anderer Weg: `window.__prometheusKamera.setzeEbene()` fährt eine Ebene über **`distanceForLevel`** an, denselben Weg wie die Sprungmarken. Danach: „Alle zwölf Ebenen treffen ihr eigenes Band" | **Die Lehre:** wer eine Skala über eine **Eingabe** abfährt (Rad, Taste), misst die Skala **und** die Auflösung der Eingabe. Wer sie über die **Rechnung** abfährt, misst die Skala. Der Widerspruch zwischen zwei Messungen war das Signal — eine einzelne Messung hätte ich geglaubt. |
| 2026-10-14 | **Der Zoom ist jetzt stufenlos — „die Ebene ist eine Erleichterung, kein Ereignis".** Betreiber: „**ebene ist eine erleichterung der zoom sollte es natuerlich sein also keine ebene direkt change oder so ansonsten fuehl es sich nach ruckeln oder veraenderung der kamera perspektive und so an**". **Was das Ruckeln war, als Zahl** (`tools/transition.js`): bei jedem Ebenenwechsel sprang die Zahl der gezeichneten Körper — **16 → 4** bei 2 240, **4 → 2** bei 32 500, **2 → 1** bei 124 000, weil zwischen den beiden Mengen **nichts** gemeinsam war. Neu: die nächstgröbere Stufe liegt **gleichzeitig** in der Szene (`this.distant`) und blendet ein, während die feine ausblendet — beide mit **denselben Weltkoordinaten**, nur anderer Auswahl und Größe. Die Lichter werden mitgerechnet (`userData.baseIntensity`), sonst wäre die Szene im Übergang doppelt so hell; die grobe Stufe steht still und ist **nicht** anklickbar, damit der Strahl nicht die halbdurchsichtige Lage trifft. **Gemessen: der stärkste Bildsprung fiel von 51,6 % auf 7,0 % der Bildgröße** (Mittel 0,54 %). | **Vier falsche Rechnungen, jede von einer Messung gefunden.** (1) Übergang nur in den letzten 25 % → zwei Rasterpunkte darin. (2) Letzte 20 % → die feine Stufe fiel am Bandende auf 0, und **genau dort wechselt die Ebene**: gemeldet „38 Körper auf einmal". (3) Bandgrenzen falsch: `distanceForLevel(n)` ist die **Mitte** des Bandes, nicht sein Anfang — `anteil` sprang an der Grenze von 0,98 auf −0,48. (4) **Die Richtung war verkehrt**, dann das Fenster **viel zu früh**: bei 2 266 (Bandmitte 3 840) stand die feine Stufe auf 0,05 und die **Sonne war weg** — 54 % Bildsprung. Die Rechnung, die stimmt: der Übergang läuft über `[M, 2M]` und **endet bei 2M**, wo die Ebene wechselt. Und weil die grobe Stufe der Ebene n `buildScene(root, n+1)` ist — also genau die feine der Ebene n+1 —, wird zwischen zwei **identischen** Bildern umgeschaltet. **Zwei Werkzeugfehler dabei:** `drawImage` auf ein WebGL-Canvas liefert ohne `preserveDrawingBuffer` nur Nullen („alles stetig" bei leerem Ergebnis), und PNG-**Dateigröße** ist kein Maß für ein Bild — der Wechsel auf das Bildschirmfoto und einen Ausreißer-Vergleich war nötig. |
| 2026-10-14 | **Die Einheit ist jetzt eine ECHTE Größe — und keine erfundene Umrechnung.** Betreiber: „**ändere masseinheit also einheit in lichtjahre oder so**". Die Anzeige „4,8 k Einheiten" sagt niemandem etwas, das war richtig erkannt. **Aber die naheliegende Lösung wäre eine Lüge gewesen**, und der Grund steht in `bodies.ts`: die **Abstände** sind gestaucht (Neptun beim **4,2-fachen** Erdenabstand statt beim 30-fachen — rund 7-mal enger) und die **Größen** aufgeblasen (Sonne `SUN_RADIUS = 100`, ehrlich wären `13,4` — 7,5-mal zu groß). Das Modell ist damit rund **50-mal** „enger" als die Wirklichkeit, und zwar **nicht gleichmäßig**: die Abstauchung wächst mit dem Abstand, die Aufblähung nicht. Ein Umrechnungsfaktor existiert **nicht**. Stattdessen trägt jede Bezugsebene ihre **echte astronomische Größe** (`echteGroesse()` in `universe.ts`), und die steht in der Kopfzeile: „Ebene Welteninsel · **100 000 Lj** · Zoom 983,0 k". Der Zoomabstand folgt dahinter, weil **er** die Kamera beschreibt. Gemessen über alle zwölf Ebenen (`tools/_einheit.ts`): 1 km → 12 742 km → 1,4 Mio km → 80 AE → 0,25 Lj → 40 Lj → 1 500 Lj → 100 000 Lj → 10 Mio Lj → 100 Mio Lj → 500 Mio Lj → 93 Mrd Lj. | **Drei Fehler, die dabei auffielen und behoben wurden.** (1) **Die Kopfzeile hinkte dem Zoom nach:** sie wurde nur alle **700 ms** geschrieben (`now - statsAt > 700`), und das galt auch für den **Ebenennamen**. Gemessen: nach `setzeEbene(1…7)` stand weiter „Ebene Sonnensystem", erst die achte zeigte die richtige — bis zu 700 ms Verzug, und das **sieht aus wie ein Ruckler, obwohl die Kamera stetig fährt**. Jetzt wird bei einem **Ebenenwechsel sofort** geschrieben; die Bildrate bleibt im ruhigen Takt. (2) `applyStarfield()` stand **vor** den Textfeldern: der Aufbau des Sternenfelds (900 Kreise als Data-URL) blockierte die Anzeige. (3) Der Test-Stub kannte `#hudEcht` nicht — ergänzt. **Das ist die erste echte Fehlermeldung, die der Betreiber NICHT melden musste.** |
| 2026-10-14 | **Das Universe ist jetzt eine leere Sandbox — die Logik bleibt, das Zeichnen geht.** Betreiber: „**entferne mal alle anzeige im Universe, nur logic schnittstelle behalten. also ich meinte den planeten galaxien ect wir behandel den Universe als eine sandbox visualisierung modern minimalistisch wie ein OS/betriebsystem**" und auf die Nachfrage nach der Objektform: „**nix einfach leer lassen :D**". Abgeschaltet: Sternenfeld, Nebel, Vignette (CSS), Planeten, Sonne, Galaxien, Sternhaufen, Bahnschweife, Glorienschein und die **Namen**. Geblieben: die Insel (Navigation), die Kopfzeile, das Achsenkreuz und die Ansichtsleiste — die Schnittstelle. **Was ausdrücklich erhalten bleibt:** `buildScene` rechnet weiter, welche Körper auf welcher Ebene sichtbar sind (samt Ankermaske, Mindestgrößen, Median), `framing` die Rahmung, `pick` bleibt die Klickschnittstelle, `updateBodies` bewegt weiter, und die Überblendung zwischen zwei Stufen läuft. Schalter: Einstellung `universe.visuals`, **Voreinstellung aus** — wer einschaltet, sieht dasselbe Bild wie vorher. **Nichts ist gelöscht, es wird nur nicht benutzt.** | **Vier Fehler auf dem Weg, drei davon dieselbe Klasse.** (1) Der `setZeichnen`-Aufruf stand **vor** `const view = new UniverseView…` → „Cannot access 'view' before initialization", drei Tests rot („der Startweg wurde nicht erreicht"). **Das war die dritte Stelle derselben Klasse** — nach `dock` und `himmelEbene`; die Marke `aufgebaut` gibt es genau dafür und stand eine Zeile tiefer schon im Code. (2) `labelLayer.classList.toggle('hidden')` genügte **nicht**: die Schleife in `placeLabels` setzt bei **jedem Bild** `display: block` und macht die Klasse wirkungslos — gemessen standen weiter **22 Namen** im Bild. Die Sperre steht jetzt im Zeichenweg selbst; gemessen: **0 sichtbare Namen**. (3) `world.visible = false` genügte ebenfalls nicht — `rebuild` und der Aufbau setzen es zurück; gemessen stand eine **graue Kugel** im Bild, obwohl `zeichnet` `false` meldete. Die Regel steht jetzt **unmittelbar vor `renderer.render`**: eine Bedingung dort, wo sie wirkt, statt an fünf Stellen, an denen sie gelten soll. (4) Der Griff `window.__prometheusKamera.zeichnen` fehlte zuerst — ohne ihn war der Zustand von außen nicht messbar, und ich habe zwei Runden lang am falschen Ende gesucht. |
 Betreiber: „**abgesehen davon möchte ich das du svg, und der modell passend machst ein sonne ist kein kreis ein stern genauso ect**". Heute zeichnet `bodies.ts` **jeden** Himmelskörper als Kugel mit einer SVG-Textur (`surfaceMaterial` + `svgTexture`) — eine Sonne ist damit eine orange Kugel, ein Stern eine helle Kugel mit Glorienschein. **Was fehlt:** die **Silhouette**. Eine Sonne hat keinen Rand — sie hat einen Kern, eine Chromosphäre und einen auslaufenden Rand (Korona). Ein Stern mit Strahlen ist keine Kugel. Ein Sternhaufen ist eine Ansammlung, keine Scheibe. Eine Galaxie hat Arme auf einer **Ebene**, nicht auf einer Kugel. **Nächster Schritt:** für Sonne, Stern, Sternhaufen und Galaxie je eine eigene **Geometrie** (Korona als additives Sprite mit auslaufendem Alpha, Galaxie als Scheibe statt Kugel) — der Auftrag steht, die Umsetzung nicht. | **Warum das nicht in diesem Durchgang gebaut ist.** Es ist eine **Zeichenaufgabe**, keine Einstellung: Sonne, Stern, Sternhaufen und Galaxie brauchen je eine eigene **Geometrie** (bei der Sonne ein additives Sprite mit auslaufendem Alpha, bei der Galaxie eine Scheibe statt einer Kugel), und dazu gehört eine Messung, die zeigt, dass es besser aussieht — sonst ist es Geschmack. Zusammen mit den drei Panels und dem Datei-Drop wäre das ein Duchrgang mit vier Themen, und der letzte mit vier Themen hat zwei Dock-Umbauten ins Blaue gebaut. **Reihenfolge: erst die Formen (sie sind im Bild sichtbar und stören beim Zoomen), dann die Panels.** |
| 2026-10-14 | **AUFTRAG (vorgemerkt, nicht begonnen): Objektformen statt Kugeln — „eine Sonne ist kein Kreis, ein Stern genauso".** Betreiber: „**abgesehen davon möchte ich das du svg, und der modell passend machst ein sonne ist kein kreis ein stern genauso ect**". Heute zeichnet `bodies.ts` **jeden** Himmelskörper als Kugel mit einer SVG-Textur (`surfaceMaterial` + `svgTexture`) — eine Sonne ist damit eine orange Kugel, ein Stern eine helle Kugel mit Glorienschein. **Was fehlt:** die **Silhouette**. Eine Sonne hat keinen Rand — sie hat einen Kern, eine Chromosphäre und einen auslaufenden Rand (Korona). Ein Stern mit Strahlen ist keine Kugel. Ein Sternhaufen ist eine Ansammlung, keine Scheibe. Eine Galaxie hat Arme auf einer **Ebene**, nicht auf einer Kugel. **Nächster Schritt:** für Sonne, Stern, Sternhaufen und Galaxie je eine eigene **Geometrie** (Korona als additives Sprite mit auslaufendem Alpha, Galaxie als Scheibe statt Kugel). **Reihenfolge: erst das, wenn `universe.visuals` wieder eingeschaltet wird** — im leeren Zustand ist nichts zu formen. | **Warum die Reihenfolge sich geändert hat.** Der Auftrag stand zuerst als „im Bild sichtbar und störend". Seit dem Schnitt auf die **leere Sandbox** ist nichts mehr zu sehen — die Formen sind damit **nachrangig** geworden, nicht wichtiger. Wer sie prüfen will, schaltet `universe.visuals` ein. **Die Arbeit ist dieselbe, der Zeitpunkt ein anderer.** |
| 2026-10-14 | **Eigener Syntaxfehler hat 20 Minuten Messungen unbrauchbar gemacht — und ein Werkzeugfehler hat den Code verdächtigt.** Um **14:59** zerriss eine meiner Umbenennungen (`himmelAn` → `skyOn`) einen Kommentarblock in `main.ts`: der Block begann mit ` *` statt `/**`, der Text stand **ausserhalb** des Kommentars, und Vite lieferte `[PARSE_ERROR] Unexpected token` in Zeile 430. **Der Dev-Server lief weiter** und antwortete mit HTTP 200 — meine Objekt-Messungen liefen also gegen eine **kaputte** Seite. Der Fehler fiel erst auf, als der Server mit exit 1 starb und `job_output` 20 KB Parserfehler zeigte. **Behoben** (`/**` ergänzt, die beiden `let` in die richtige Reihenfolge), danach **248 Tests** statt 239 — der Syntaxfehler hatte auch Tests verhindert. | **Zwei Lehren, beide teuer bezahlt.** (1) **Ein laufender Server ist kein Beweis, dass der Code lädt.** HTTP 200 heisst „ich antworte", nicht „ich habe verstanden" — wer nach jeder Änderung misst, muss den **Build** prüfen, nicht den Port. `tsgo --noEmit` und `vite build` sind zwei Sekunden und hätten es sofort gezeigt. (2) **Ein Messwerkzeug kann den Code zu Unrecht beschuldigen.** `tools/objects.js` meldete „die Verschiebung überlebt den Neustart nicht" — und der Fehler lag am **Werkzeug**: `Input.dispatchMouseEvent` erzeugt **Maus**-Ereignisse, die Objektfläche hört aber auf **Pointer**-Ereignisse (`setPointerCapture`). Die Bewegung kam an, das **Loslassen** nicht, die Karte behielt `.zieht`, `persist()` lief nie. Mit echten `PointerEvent`s: **die Verschiebung überlebt**, gemessen `336/272 → 456/332` und nach dem Neuladen unverändert. **Ein widersprüchliches Messergebnis ist zuerst ein Verdacht gegen das Werkzeug.** |
| 2026-10-14 | **Stufe 1 der Objekte steht: Dateien ablegen und verschieben.** Betreiber: „**also objecte aka datei möglichkeit drag and drop genauso später zb in eine art workspaces definieren zu was es gehört also kann man und daraus die möglichkeit geben das der harness Prometheus diese datei sieht**". Neu: `canvas-objects.ts` (reine Logik) und `canvas-view.ts` (Annehmen und Malen), **12 Tests** (`tests/canvas-objects.test.ts`), das Werkzeug `tools/objects.js` und der Messgriff `window.__prometheusCanvas`. **Gemessen** über den ganzen Weg: echte Drag-Ereignisse werden angenommen (Meldung erscheint und verschwindet beim Abbruch), drei Dateien liegen an ihrer Stelle, Karten im DOM = Objekte im Zustand, **Ziehen bewegt** (336/272 → 456/332), die Lage **hängt nicht am 3D-Zoom** (nach einem Ebenenwechsel unverändert), die Anordnung **überlebt einen Neustart**, und das „✕" nimmt eines weg. | **Die Entscheidung, die alles bestimmt:** die Karten liegen in **Bildpunkten**, nicht in Weltkoordinaten — wie in `docs/design/img/other/drawdb.png`. In Weltkoordinaten wäre ein Objekt nach zwei Zoomstufen ein Punkt und nicht mehr anzufassen; in Bildpunkten bleibt es ein **Objekt**, egal welcher Massstab darunter liegt. **Was noch fehlt (Stufen 2 und 3):** die Zuordnung zu einem **Workspace** („zu was gehört die Datei") und die **Schnittstelle zum Wirt** — ein echter Datei-Ordner, damit der Harness die Datei sieht. Beides steht im Register. || 2026-10-14 | **Der Universe-Eintrag verschwindet im Universe — man braucht keinen Weg dorthin, wo man ist.** Betreiber, mit einem Bild der Insel-Gruppe „Ansichten": „**kannst du den universe in dynamic illand entfernen wenn man schon in universe befindet ;D ist bischen waste und unötig**". Neu: `onlyIn?: 'chat' \| 'os'` am Eintrag — ein Eintrag weiß jetzt, in welcher Ansicht er hingehört. Gemessen in beiden Ansichten: **im Universe** steht „▤ Chat \| ⟲ Ansicht zurücksetzen", **im Chat** „◉ Universe \| ⟲ Ansicht zurücksetzen". Die Gruppe schrumpft nie auf null (der jeweils andere Weg und das Zurücksetzen haben kein `onlyIn`). | **Die Bedingung steht am EINTRAG, nicht im Aufbau.** So bleibt die Liste eine **Daten**liste: man liest sie von oben nach unten und sieht an jedem Eintrag, wann er erscheint. Eine Wenn-Abfrage im Aufbau wäre eine zweite Stelle, an der man nachsehen muss — und beim nächsten Eintrag vergessen. **Und ein Fehler wurde dabei gefunden, bevor er im Bild auftauchte:** `setMode` änderte `mode`, baute die Insel aber **nicht** neu — wer die Ansicht **bei offener Insel** umschaltet, hätte weiter „Universe" gesehen, obwohl er dort ist. `buildIslandFull()` wird jetzt nach einem Ansichtswechsel aufgerufen, wenn die Insel offen ist. **Eine Anzeige, die von einem Zustand abhängt, muss neu gebaut werden, wenn sich der Zustand ändert** — sonst zeigt sie die Vergangenheit. || 2026-10-14 | **Die Überlappungen sind weg — mit einer WACHE, nicht mit neun Handkorrekturen.** Betreiber, mit einem Bild von zwei ineinandergeschobenen Kugeln: „**überlappen? xD sieht strange aus lol**" und „**sollte zukünftig vermeiden ik ist 3D raum mit zoom aber es sollte nicht so unrealistisch ausehen**". Gemessen (`tools/_ueberlappung.ts`): **neun** Eltern-Kind-Paare durchdrangen sich, mehrere mit **Abstand 0** — zwei Körper an derselben Stelle: `lokale Gruppe → prometheus`, `Sternhaufen → planetensystem`, `kosmischer Überblick → Laniakea` (22 % der Radiensumme), `Laniakea → Galaxienhaufen` (19 %). Neu: `entzerre()` und `entzerreBaum()` in `universe.ts` schieben auf, was zu nah ist (`SEPARATION = 1,06`), und laufen **einmal über den fertigen Baum** — wer die Daten später ändert, kann den Fehler nicht wieder einbauen. **Nachher gemessen: nur noch „beruehrt sich" mit 94 % statt Durchdringung.** | **Und eine Unterscheidung, die nötig war.** Ein erster Anlauf hätte **jedes** zu nahe Kind weggeschoben — und damit die **Sonne** aus der Mitte gerissen. Ein Stern bei Abstand 0 vom Sonnensystem ist aber **richtig**: er **ist** der Kern, kein Körper daneben. Deshalb drei Fälle in `entzerre`: (1) `kind === 'Stern'` bleibt, wo er ist; (2) Abstand ≈ 0 bekommt eine **feste** Richtung (eine Division durch null gibt es nicht); (3) sonst wird in die vorhandene Richtung hinausgeschoben. **Was die Wache ausdrücklich NICHT prüft:** ob ein Kind weiter draussen liegt als der Elternkörper gross ist — die Sonne hat Radius 100, Neptun kreist bei 1 254, und das ist richtig. Radien sind eine Darstellung der **Bedeutung**, Abstände eine der **Struktur**. |
| 2026-10-14 | **„Ist unsere Raum nah oder fast unendlich?" — gemessen, und die Antwort ist unbequem.** Betreiber: „**ist unsere raum eigentlich nahe oder fast unendlich ausser dem outzoom?**". `tools/room-size.ts` rechnet es aus: **Inhalt** (weitester Körper: `index.ts` bei **145 236** Einheiten) gegen **Kameraweite** (`MAX_DISTANCE = 4 Mrd`) = **27 541×**. Und die Zahl, die man im Bild sieht: der ganze Inhalt ist ab **226 Mio** Einheiten nur noch **ein Punkt** — **5,7 %** der Kameraweite. **94 % der Zoomstrecke führen also ins Leere:** Ebene 11 (Superhaufen) ab 31,5 M und Ebene 12 (Universum) **komplett** — dort steht **nichts**. | **Die Ursache ist ein Maßstabsbruch, und er ist strukturell.** Der Baum ist in **Weltkoordinaten** 145 000 Einheiten tief, aber er **bedeutet** 93 Mrd Lichtjahre. Die Kamera fährt nach Weltkoordinaten — also dorthin, wo nichts mehr ist. **Zwei Wege, und beide sind eine Entscheidung:** (a) die oberen Ebenen mit **Inhalt** füllen (der Obsidian-Auftrag liefert die Struktur), oder (b) `MAX_DISTANCE` so weit senken, dass die Kamera nicht über den Inhalt hinausfährt — dann ist der „leere" Zoom weg, aber auch die Ebenen 11 und 12. **Offen.** |
| 2026-10-14 | **Das Koordinatensystem war schon da — nur nicht sichtbar.** Betreiber: „**es fehlt nur noch corinaten position system implementieren**". Es gibt seit dem ersten Umbau ein Panel **„Achsen"** (`ruler`) mit `#rLevel`, `#rDist`, `#rFocus`, und `updateReadouts` füllt alle drei. **Es startet abgesteckt** (Entscheidung des Betreibers: „der OS-Modus soll zuerst leer sein"), und eine Anzeige, die niemand öffnet, ist von einer fehlenden **nicht zu unterscheiden** — genau das beschreibt „es fehlt nur noch". Gemessen (`tools/_koord.ts`): `rFocus = "94396 · 1862 · 108650"`, live. **Nachgezogen:** `#rDist` trägt jetzt die echte Größe (`61.4 k · 40 Lj` statt nur `3.1 k`), und `#rFocus` schreibt Tausenderpunkte. **Und die Zeile belegt zugleich die Raumberechnung:** der Fokus liegt rund **144 000** vom Ursprung — dieselbe Grössenordnung wie der weiteste Körper (145 236). || 2026-10-14 | **Der Takt der Bewegung ist ruhig geworden — ein Erdenjahr dauert 70 statt 24 Sekunden.** Betreiber: „**es ist auch unrealistisch wie ich es da sehen planeten groesse ringe distance vom planeten ect verstehst du? sieht so doof aus und es bewegt sich zu schnell ;D von dem kamera entfernt sollte schon smothe sein**". Gemessen: mit `YEAR_SECONDS = 24` stand die Erde in 24 s einmal herum, **Merkur in 13 s** — bei acht sichtbaren Körpern ist das ein Kreisen, kein Stehen. Jetzt (nachgerechnet, nicht geschätzt): Merkur 37 s · Venus 56 s · Erde 70 s · Mars 93 s · Jupiter 3,6 min · Saturn 5,3 min · Uranus 8,6 min · Neptun 11,6 min. Die Steigung `OMEGA_EXPONENT = 0,45` ist **unangetastet**: die **Reihenfolge** der Geschwindigkeiten ist eine Aussage über die Welt, die Gesamtdauer eine über die Darstellung. Die Grunddauer steht als `YEAR_SECONDS` in `scene.ts`; `universe.orbitSpeed` bleibt der Multiplikator für den Nutzer. | **Und ein Test hat die Fehlerklasse gefunden, die heute schon zweimal zugeschlagen hat.** `tests/orbits.test.ts` rechnete mit `const jahr = 24` — einer **Kopie** von `YEAR_SECONDS`. Der Test wurde rot, obwohl er die **Beziehung** prüfen soll („die Erde einmal, der Merkur öfter") und nicht eine Zahl. `YEAR_SECONDS` ist jetzt **exportiert**, der Test liest sie von dort und prüft zusätzlich `jahr > 60`. **Eine zweite Kopie einer Zahl ist eine zweite Wahrheit** — dritter Fall an einem Tag. |
| 2026-10-14 | **OFFEN und mit einem Test belegt: die Größenverhältnisse sind NICHT mit einem Wert zu retten — es ist eine Entscheidung.** Betreiber: „**es ist auch unrealistisch wie ich es da sehen planeten groesse ringe distance vom planeten ect**". **Die Ursache ist ein einziger Wert:** `bodies.ts` komprimiert alles mit dem Exponenten **0,42** — Erde Radius 1, Bahn 300; Sonne Radius **13,4** wäre die Formel. **Aber `SUN_RADIUS` ist auf 100 festgenagelt**, also **7,5-fach zu gross**. Deshalb sieht es falsch aus: die Planeten sind nach der Formel richtig, die **Sonne** ist es nicht — und damit wirken die Bahnen zu eng und die Planeten zu gross. **Warum ich es nicht einfach geändert habe:** `tests/opening-view.test.ts` verlangt „die Sonne ist im Startblick gross genug, um eine Sonne zu sein" mit **mehr als 18 px**. Mit der ehrlichen Formel wären es im Startblick (3 132 Einheiten) **3,3 px** — der Test wird rot. Gemessen über die ganze Ebene 4 (1 920 … 7 680): die Sonne wäre **3,3 bis 13,2 px**, also **nirgends** eine Scheibe. | **Das ist ein echter Konflikt, kein Detail:** die Sonne ehrlich zu machen heisst, sie **unlesbar** zu machen. Die ehrliche Lösung wäre, den **Startblick näher** zu setzen (Ebene 4 beginnt bei 1 920, dort ist die Sonne 13 px) — dann ist sie eine kleine Scheibe, und man sieht **einen** Planeten statt acht. **Die Frage an den Betreiber:** Sonne ehrlich und klein, oder Sonne sichtbar und das Verhältnis bleibt gestaucht? — **Antwort: „ist jetzt egal ich braich das nicht mehr". Der Punkt ist damit GESCHLOSSEN, nicht gelöst.** `SUN_RADIUS` bleibt bei 100. Die Ursache steht oben und ist belegt; wer sie später angeht, findet sie in einer Minute statt in einer Stunde. || 2026-10-14 | **Der Zoomtakt ist halbiert — 8 statt 3 Radereignisse je halber Ebene.** Betreiber: „**die ebene und zoom ist zu schnelle wechseln da kann man nicht einmal reinzoomen wie man es will ohne das es groesser wird oder kleiner, wir sollten evt die reichweite bis zur ebene wechseln anpassen oder so**". **Er hatte recht, und die Zahl war für eine andere Skala gewählt:** der alte Kommentar begründete `ZOOM_FACTOR_PER_NOTCH = 1,25` mit „fuer ein Universum mit **sieben** Groessenordnungen viel zu zahm". Mit **zwölf** Ebenen (siehe `LEVELS`) ist dieselbe Zahl falsch. Gemessen mit dem **echten Mausrad** (`tools/zoom-rate.js`): **3 Radereignisse** von der Bandmitte bis zur nächsten Grenze — man war durch, bevor man ankam. Jetzt `1,08`: **8 Ereignisse**, gleichmässig über alle Ebenen geprüft, und 152 für die ganze Reise von 3 132 bis 4 Mrd. | **Zwei eigene Rechenfehler, beide von der Messung gefunden.** (1) Die erste Vorhersage rechnete `ln(4)` — die **ganze** Ebenenbreite. `setLevel(n)` fährt aber die **Mitte** des Bandes an, und von dort bis zur Grenze ist es die **halbe** Strecke (`ln(2)`): gesagt 10,2 Ereignisse, gemessen **6**. (2) Der erste Versuch setzte 1,12 — damit waren es 6 Ereignisse, noch unter der selbstgesetzten Grenze von 8. Die Tabelle in `tools/_zoom.ts` (1,25 / 1,12 / 1,10 / 1,08 / 1,06) hat die Entscheidung getragen: **1,06 gäbe 9,9, aber 201 Züge für die ganze Reise** — zu zahm, und der Betreiber hatte früher schon „scrollen viel zu langsam" gemeldet. **Und der Faktor ist die richtige Schraube, nicht die Reichweite:** breitere Ebenenbänder hiessen, dass die Körper **innerhalb** einer Ebene länger klein bleiben — das vergrössert genau das Problem, das `MIN_BODY_PIXELS` löst. Nachgemessen: die Grösse ändert sich innerhalb einer Ebene um Faktor 4, aber die **Übergänge sind nahtlos** (Ebene 4 endet bei 10,1 px, Ebene 5 beginnt bei 10,1 px). || 2026-10-14 | **Kennungen sind jetzt ENGLISCH — und der Betreiber hatte den besseren Grund.** Betreiber: „**„uebergang" naming sollte schon englisch sein ;D das könnte probleme verursachen. Chinesische und asiatische datei wird doch auch nicht in ihren sprache genutzt**". Sein Argument ist praktisch, nicht ästhetisch: **eine Kennung in der Sprache des Kommentars ist in einer Fehlermeldung nicht suchbar.** Wer `setzeEbene is not a function` im Protokoll hat, findet die Stelle nur, wenn er auch Deutsch sucht. **Und ich hatte die Hausordnung verletzt** — die bestehende Schnittstelle ist englisch (`buildScene`, `distanceForLevel`, `framingDistance`, `orbitView`, `pick`, `rebuild`; nur `SCHWELLE` und `alsAnsicht` sind begründete Ausnahmen), und ausgerechnet der **öffentliche Messgriff** war deutsch: `__prometheusKamera.setzeAbstand/setzeEbene/uebergang/zeichnen`. Umbenannt: `setDistance/setLevel/blend/isDrawing`, dazu `realSize`, `visibilityFloor`, `setDrawing`/`isDrawing`, `target`/`primary`/`coarseLevel`/`bandMid`/`lastFadeCalc` in `scene.ts`, `skyOn`/`lastSkyLevel` in `main.ts`. **Vier Werkzeuge mitgezogen.** | **Nachgemessen:** 227 Tests grün, Typecheck sauber, Bau sauber, `tools/sky.js` läuft. **Was bewusst NICHT umbenannt ist:** die deutschen Namen, die **vor** meiner Arbeit da waren (`dock.ziel`, `bodies.ziel`, `labels.gewaehlt`, Testlokale wie `gezeichnet`) — sie sind ein eigener, größerer Schnitt, und ein Rename über fremden Code gehört nicht in denselben Durchgang wie eine Korrektur am eigenen. **Offen als eigener Punkt.** |
| 2026-10-14 | **Das Raster ist gebaut und wieder AUS — „scheiss auf den raster".** Betreiber: „**weisst du was scheiss auf den raster es sieht schlimm aus und noch was ich möchte eher den objekt item datei ect rein tun können verschieben interagieren**". Ich hatte den leeren Raum für **orientierungslos** gehalten und ein Punkt-Raster nach `docs/design/img/other/drawdb.png` gebaut. **Der erste Anlauf war geometrisch falsch:** die Punkte lagen in der Weltebene `xz` (wie ein Fußboden) und degenerierten im Bild zu einer **schmalen Linie** — eine flache Punktwolke, die man von der Seite ansieht, hat keine Ausdehnung. Der zweite Anlauf lag in der **Bildebene der Kamera** (Kind von `this.camera`) und stand richtig — war aber **zu grob und zu hell** (26 Punkte über die Höhe, 34 % Deckkraft), und nach der Korrektur auf 38 Punkte und 22 % hat der Betreiber es abgelehnt. **`GRID_ON = false`** — der Aufbau bleibt stehen (dieselbe Entscheidung wie bei den Himmelskörpern: **abschalten ist nicht löschen**), eine Zeile schaltet ihn wieder ein. | **Die Lehre ist wichtiger als das Raster.** Der Betreiber sieht die Fläche zuerst als **Arbeitsfläche**, nicht als Koordinatensystem: „**ich möchte eher den objekt item datei ect rein tun können verschieben interagieren**". Der Bezug kommt aus dem, was man **hineinlegt**, nicht aus einem Muster darunter. Das ist derselbe Fehler wie bei den Achsen („hast was komplett neues gemacht") und beim Dock („dockingstuff wurde einfach rein getan plop auftaucht"): **ich habe eine Struktur gebaut, wo eine Handlung gebraucht wurde.** Die Zahlen bleiben im Code, damit ein zweiter Versuch nicht bei null anfängt. |
| 2026-10-14 | **AUFTRAG (der nächste Durchgang): Objekte in die Fläche legen, verschieben, anfassen.** Betreiber: „**ich möchte eher den objekt item datei ect rein tun können verschieben interagieren**". Das ist die Richtung für die leere Sandbox — und **größer als ein Panel**: (1) **Elemente auf der Fläche** — ein Objekt (Datei, Notiz, Ordner, Verknüpfung) wird abgelegt und bleibt liegen; (2) **Verschieben** mit der Maus, wie die Panels es heute schon tun (Griff, Ziehen, Loslassen); (3) **Interagieren** — anklicken, auswählen, öffnen, verknüpfen (der Obsidian-Auftrag); (4) **Ablegen** per Datei-Drop von außen. **Was dabei ausdrücklich NICHT passieren darf:** die Objekte dürfen **nicht** am 3D-Zoom hängen. In `drawdb.png` liegen die Tabellen **in der Fläche** und werden in **Bildpunkten** verschoben — das ist der richtige Weg: die Ansicht zoomt, die Objekte bleiben bedienbar. **Reihenfolge:** erst Elemente + Verschieben (sichtbar und prüfbar), dann Interagieren, dann das Verknüpfen über die docs. | **Warum das einen eigenen Durchgang braucht und nicht „noch ein Panel" ist.** Es berührt drei Schichten gleichzeitig: die **Fläche** (Elemente, die liegen bleiben und im Speicher je Raum leben), die **Bedienung** (Ziehen mit der Maus — dieselbe Mechanik wie die Panels, aber ohne Zone) und die **Daten** (was ein Element ist: Datei, Notiz, Ordner, Verknüpfung). Wer alle drei auf einmal baut, baut wie bei den zwei gescheiterten Dock-Umbauten ins Blaue. **Und die Reihenfolge ist nicht beliebig:** erst muss ein Objekt sichtbar liegen und sich bewegen lassen — das ist prüfbar; dann kommt das Anklicken; erst zuletzt das Verknüpfen, weil es die Frage „was ist ein Knoten" braucht, und die steht im Obsidian-Auftrag. |
| 2026-10-14 | **AUFTRAG (vorgemerkt): wie Informationen und Projektstacks vernetzt werden — Obsidian-Memory. ZUERST `docs` LESEN.** Betreiber: „**später möchte ich das du in docs das hier anschaust**" mit drei Bildern (`docs/design/img/other/Episodic-Memory-visualisation.jpg`, `Working-Memory-visualisation.jpg`, `Semantic-Memory-visualisation.jpg`, `drawdb.png`) und dem README von **drawdb** (`github.com/drawdb-io/drawdb`). Seine Worte: „**das erklärt wie der Obsidian Memory und projekt stack verknüpft wird ect. ich rede von informationen miteinander vernetzt werden und projekte wie datenbank ect**". **Was daran hängt:** die drei Panels (Notizen, To-do, Goal) und der Datei-Drop mit Verknüpfung — beides beschlossen, beides nicht gebaut. **Reihenfolge:** die Bilder und das drawdb-MD **zuerst** lesen, daraus ableiten, was ein „vernetzter Knoten" in diesem Universum ist, und **dann** bauen. Nicht umgekehrt. | **Warum die Reihenfolge „erst lesen, dann bauen" hier ausdrücklich hingehört.** Der Betreiber sagt selbst: „**das erklärt wie der Obsidian Memory und projekt stack verknüpft wird**". Die drei Bilder und das drawdb-README sind die **Vorlage** — wer ohne sie baut, baut ein Notizfeld mit Dateianhang und nennt es „vernetzt". Und es hängt mehr daran als ein Panel: wenn ein Datei-Drop auf einen Planeten eine **Verknüpfung** schreiben soll („wie Obsidian RAG"), dann ist die Frage, **was ein Knoten ist** und **wie Kanten zwischen ihnen aussehen** — das ist eine Datenfrage, nicht eine Oberflächenfrage. **Also zuerst die docs, dann der Entwurf, dann der Bau.** |
 Gefunden beim Prüfen des Zoom-Übergangs (`tools/_rest.ts`, Bildschirmfoto `_p486.png`): die Kopfzeile sagt „Ebene Stern · 486,0 Einheiten", die Anzeige zählt **16 Beschriftungen**, `blendState()` meldet `fine: 16` — und im Bild steht **nichts**. Auf „Ebene Sonnensystem" bei 3 840 ist dieselbe Sonne zu sehen. | **Was bekannt ist:** der Fehler ist **älter als der Übergang** (er betrifft die feine Stufe allein, mit `fade = 1`), und er ist **nicht** die Auswahl der Körper — die ist richtig (16 Objekte auf Ebene 3 laut `buildScene`). Zu prüfen sind die **Kamera** (Fokuspunkt und Abstand: bei 486 Einheiten und 60° Bildwinkel ist die sichtbare Höhe rund 561 Welteneinheiten, die Sonne hat Radius 100 — sie **müsste** das Bild füllen) und die **Lage** der gezeichneten Gruppe. **Nicht behoben, nicht weggeredet.** |
 `tools/sky.js` fuhr die Ebenen über das **Mausrad** an und meldete „8 von 12 Ebenen erreichbar". Die Arithmetik sagte aber, dass jede Ebene ihr eigenes Band trifft. **Der Grund lag in der Auflösung der Messung:** ein Radereignis sind `-deltaY / 100` Rastschritte, bei `deltaY = 120` also **1,2** — mit vier Zügen je Runde ist man bei Faktor 2,94 und **springt** über eine Stufe (eine Ebene ist Faktor 4). Zwei Läufe mit sechs bzw. zwei Zügen je Runde lieferten „7 von 12" und „1 von 12" — **beide falsch, in verschiedene Richtungen.** Die Lösung war nicht ein besserer Faktor, sondern ein anderer Weg: `window.__prometheusKamera.setzeEbene()` fährt eine Ebene über **`distanceForLevel`** an, denselben Weg wie die Sprungmarken. Danach: „Alle zwölf Ebenen treffen ihr eigenes Band" | **Die Lehre:** wer eine Skala über eine **Eingabe** abfährt (Rad, Taste), misst die Skala **und** die Auflösung der Eingabe. Wer sie über die **Rechnung** abfährt, misst die Skala. Der Widerspruch zwischen zwei Messungen war das Signal — eine einzelne Messung hätte ich geglaubt. |
 Betreiber: „**beim maximum denke ich es wäre besser das es komplett in eine umhüllung aussehen könnte mit weisse sterne weil universum sich ja ausdehnt aber ab bestimmt grenze von weitem sollte irgendwann nicht überall sterne geben hintergrund verstehst was ich meine?**" Verstanden als **Maßstabsfrage**, nicht als Farbfrage: jede Ebene hat ihre eigene Leere. `HIMMEL` in `main.ts` gibt jeder Stufe drei Nebelfarben (Planet fast schwarz → Sonnensystem warm → Stern wärmer → Sternsystem violett → Welteninsel blauviolett → Kosmos dunkelblau → Universum kalt), und `starfieldUrl(ebene)` zeichnet nach aussen **weniger** Sterne (Anteil 1,0 → **0,28**) und **weissere** (Weissanteil 0,55 → **0,95**). Gemessen mit `tools/sky.js` über echte Radzüge: das Bild schrumpft von **103 361** auf **31 984** Zeichen — es gibt also wirklich weniger Sterne | **Und die Sterne bleiben an ihrem Platz.** Die Lage kommt aus einem **festen** Zufallsstartwert: weniger Sterne heisst, dass welche **wegfallen** — nicht, dass alle **springen**. Ein wechselndes Feld wäre beim Zoomen ein Flackern, und beim Neuladen ein anderes Weltall. Das Sternenfeld wird nur bei einem **Ebenenwechsel** neu gebaut (`himmelEbene`), nicht je Bild — und diese Merkzahl stand zuerst an der falschen Stelle im Modul: `settings.onChange` ruft `applyStarfield` schon beim Aufbau, ein `let` wäre vor seiner Zeile nicht definiert gewesen. |

