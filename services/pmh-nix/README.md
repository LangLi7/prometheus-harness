# `pmh-nix` — Actuation als gestufter, umkehrbarer Vorgang (Go)

> **Die Regel, die dieser Dienst durchsetzt:**
> **Das Modell empfiehlt, die Policy entscheidet — ein Modell löst niemals einen
> Systemwechsel aus.**
>
> **Doku-Grundlage:** [`../../docs/design/nixos-self-change.md`](../../docs/design/nixos-self-change.md)
> (das Konzept, Fassung 2),
> [`../../docs/decisions/hybrid-then-self-build.md`](../../docs/decisions/hybrid-then-self-build.md)
> §3.1 (NixOS-Selbständerung, samt der verbindlichen Abgrenzung *„NixOS wird nicht
> installiert"*), [`../../docs/concept.md`](../../docs/concept.md) Regel 4 („Sprachgrenzen
> sind Dienstgrenzen").
>
> **Kein Gegenstück in der Vorlage** — Neubau.

## Was er tut — und was er ausdrücklich nicht tut

Er bildet eine Selbständerung des Systems als **gestuften, umkehrbaren Vorgang** ab. Der
Agent ändert **nicht das laufende System**, sondern die Konfiguration auf einem **Branch**;
der Mensch sieht den Diff und gibt frei; erst dann folgt die Activation.

```text
propose ──▶ check ──▶ approve ──▶ policy.Require(apply) ──▶ apply ──▶ Generation ──▶ rollback
 Branch      Prüfbau    Freigabe                            Activation              Umschalten
 + Diff      ohne       (Mensch,                            (switch)
             Aktivierung  mit Namen)
```

> ### ⚠ Abgrenzung — verbindlich: dieses Paket installiert **nichts**.
>
> **NixOS und Nix sind auf diesem Rechner nicht vorhanden und werden nicht installiert.**
> Weisung des Betreibers vom 12.10.2026: *„kein nixos installieren lol"*. Daraus folgt:
>
> | Erlaubt | Nicht erlaubt |
> |---|---|
> | Das Konzept beschreiben: Module, Flakes, Generationen, Rollback | NixOS oder Nix installieren |
> | Die Schnittstelle definieren: Actuation-API, Verträge, Fehlercodes | Eine Distribution austauschen, partitionieren, booten |
> | Diesen Dienst als Gerüst bauen, mit Backend-Austausch | Die Actuation gegen ein echtes System ausführen |
> | Ein Attrappen-Backend, damit alles testbar ist | `nixos-rebuild switch` irgendwo auslösen |
>
> **Nichts in diesem Dienst ändert das Betriebssystem.** Er ruft kein `nix`, kein
> `nixos-rebuild`, kein `nix-env` und kein `git` auf. Der einzige Schreibvorgang ist die
> eigene Buchführungsdatei. Kein WSL-Subsystem wird eingerichtet.

## Der Vertrag in fünf Stufen

| Stufe | CLI | Was geschieht | Sperrt bei |
|---|---|---|---|
| **Vorschlag** | `propose --flake <pfad>` | Legt einen **Branch mit Diff** an, zeichnet **Commit, Diff und Basisgeneration** auf. **Aktiviert nie** | fehlendem Flake (2), nicht verfügbarem Backend (125) |
| **Prüfbau** | `check --proposal <id>` | `build`/`test` **ohne Aktivierung**; Befunde mit Schwere und Text, Ergebnis wird **aufgezeichnet** | Befund der Schwere `error` (1) |
| **Freigabe** | `approve --proposal <id> --by <wer>` | **Ausdrückliche menschliche Freigabe**: wer, wann, welcher Diff-Hash, welche Basisgeneration | fehlendem Namen (2), fehlendem Prüfbau (1), gesperrtem Prüfbau (1) |
| **Activation** | `apply --proposal <id>` | `switch`: führt aus und liefert die Generation | jedem fehlenden Vorbedingung (1), nicht verfügbarem Backend (125) |
| **Rückweg** | `rollback --to <gen-id>` | Umschalten auf eine **aufgezeichnete** Generation | unbekannter Generation (1) |

**`propose` berührt das System nie und aktiviert nie.** **`apply` läuft nur mit
aufgezeichneter Freigabe** und lehnt fail-closed ab, wenn der Diff sich danach geändert hat
(Hash stimmt nicht mehr), wenn keine Freigabe vorliegt oder wenn die Basisgeneration nicht
mehr aktiv ist.

## Die zwei Betriebsarten

Beide erfüllen **dasselbe Backend-Interface**; sie unterscheiden sich im Ort, nicht in der
Form des Aufrufs. `--mode local|remote`, Vorgabe **`local`**.

| | `local` (Vorgabe) | `remote` |
|---|---|---|
| Ort | Flake im Repository, Diff und Prüfbau | Branch im Git-Repository, Prüfbau auf der **Zielmaschine** |
| Branch | `local/agent-<ziel>`, kein Push | `agent/nixos-<ziel>` auf `main`, mit Push |
| Aktivierung | nur in der Attrappe (Simulation) | `switch` auf der Zielmaschine, Rollback über die Generation |
| Rolle | **der Start** — mit dem Attrappen-Backend testbar | **das Ziel** — entfernter NixOS-Rechner oder Raspberry Pi 5. **Nichts davon wird jetzt gebaut** |

Die Betriebsart eines Vorschlags wird **im Diff mitgeführt**, damit die Activation nicht
raten muss, wo sie stattfindet. Eine unbekannte Betriebsart ist ein Aufruffeher (2).

## Die Backends — austauschbar, und beide ehrlich

`internal/actuation` definiert den Rand mit sieben Methoden:

| Methode | Was sie zusagt |
|---|---|
| `Name() string` | Kurzname für Meldung und Auswahl |
| `Detect() (api.Capability, error)` | meldet **ehrlich**, ob echte Actuation möglich ist, mit Begründung |
| `Propose(api.Proposal) (api.Diff, api.Branch, error)` | erzeugt einen **Branch mit Diff**; aktiviert nie |
| `Check(api.Diff) ([]api.Finding, error)` | **Prüfbau ohne Aktivierung**; jeder Befund trägt Schwere und Text |
| `Apply(api.Diff) (api.Generation, error)` | die **Activation**: führt aus und liefert die Generation |
| `Generations() ([]api.Generation, error)` | listet die Generationen, **neueste zuerst**, die aktive markiert |
| `Rollback(string) (api.Generation, error)` | schaltet auf eine aufgezeichnete Generation zurück |

| Backend | Zustand | Verhalten |
|---|---|---|
| `stub` (**Vorgabe**) | arbeitet vollständig | ändert **nichts** am System; trägt den ganzen Vertrag auf eigener Buchführung |
| `nix` | vorhanden, aber **inert** | ruft `nix`/`nixos-rebuild` auf; ohne `nix` auf dem Suchpfad scheitert **jeder** Aufruf laut (fail-closed) |

Die Attrappe meldet in `detect` **immer** `available: false` mit dem Grund *„nicht verfügbar:
kein Nix auf diesem Wirt"* und führt in den Einzelheiten **Grenze G1** an: NixOS läuft nur auf
Linux; auf diesem Wirt findet keine Actuation statt. Jede von ihr erzeugte Generation trägt
`system: "attrappe"` und den Vermerk *„nichts am System geändert, nur Buchführung"* — nie mit
einem echten Systemwechsel zu verwechseln. Die Betriebsart **streng** (`Strict = true`) macht
die Prüfung sperrend; das ist die Betriebsart, in der die Attrappe fail-closed ist.

## Die Politik — zwei Stufen, und was sie liest

```text
propose -> check -> approve -> policy.Require(apply) -> backend.Apply
```

Der Aufruf der Politik steht **vor** jedem Anwendungsaufruf. Sie liest **kein Feld der
Anfrage**, sondern ausschließlich die aufgezeichnete Buchführung — kein `checked`, kein
`safe`, kein `approved`, kein `policy_ok` hilft einem Vorschlag.

**Allgemeine Stufe** — `apply` verweigert, wenn:

| Fall | Grund (maschinenlesbar) |
|---|---|
| Vorschlag nie aufgenommen | `vorschlag-unbekannt` |
| Vorschlag bereits angewandt | `vorschlag-schon-angewandt` |
| kein aufgezeichneter Prüfbau | `vorschlag-ungeprueft` |
| Prüfbau mit Befund der Schwere `error` | `pruefung-gesperrt`, `befunde-der-schwere-error` |
| Diff nach dem Prüfbau oder nach der Freigabe getauscht | `diff-geaendert`, `freigabe-veraltet` |
| **keine ausdrückliche Freigabe** | `keine-freigabe` |
| Basisgeneration nicht mehr aktiv | `basisgeneration-geaendert` |

**Strengere Stufe (G3)** — die drei Kategorien **Netzwerk, Nutzerrechte und Geheimnisse**
sind **kein Sonderfall** der allgemeinen Regel, sondern eine eigene Stufe: ihre Zulässigkeit
hängt an der ausdrücklichen Freigabe, und die Ablehnung nennt sie (`strengere-kategorie`).

| Kategorie | Erkannt an | Erzwungen in |
|---|---|---|
| `network` | `networking.*`, `network/*`, `firewall/*`, `tailscale`, `wireguard` | `internal/policy` + `internal/actuation` |
| `users` | `users.*`, `users/*`, `home/*`, `sudoers` | dito |
| `secrets` | `secrets/*`, `sops`, `agenix`, Klartext-Geheimnis im Diff | dito |

**Mit** ausdrücklicher Freigabe läuft auch ein `networking.*`-Diff durch — die strenge Stufe
verlangt eine Freigabe, sie verbietet die Änderung nicht.

## Klartext-Geheimnisse (G4)

Der **Nix-Store ist world-readable.** Der Prüfbau enthält deshalb eine **eigene Prüfung**: ein
Diff, der ein Geheimnis **im Klartext** in die Konfiguration schreibt, ist ein Befund der
Schwere **`error`** — kein Hinweis. Er sperrt die Anwendung, und ein gesperrter Vorschlag
lässt sich **nicht freigeben**.

Erkannt werden: zugeordnete Literalwerte (`password = "…"`, `apiKey = "…"`), eingebettete
private Schlüssel (`-----BEGIN … PRIVATE KEY-----`) und bekannte Token-Formate (`ghp_…`,
`AKIA…`, `xoxb-…`). Geprüft werden nur **hinzugefügte** Zeilen und keine Kommentare.

**Der vorgesehene Weg wird nicht bestraft:** ein Verweis auf `sops.secrets.*`,
`config.sops…`, einen `.age`-Pfad oder `builtins.getEnv` ist **kein** Befund. Vorgesehen sind
**`sops-nix`** oder **`agenix`**.

## Der Prozessvertrag

```text
pmh-nix [--backend stub|nix] [--mode local|remote] [--state <datei>] <unterbefehl> [flags] [--json]
```

| Unterbefehl | Flags | Wirkung |
|---|---|---|
| `detect` | — | meldet, ob echte Actuation möglich ist, mit Grund |
| `propose` | `--flake <pfad>` (Pflicht), `--target <host>`, `--summary <text>` | legt einen Branch mit Diff an; **aktiviert nie** |
| `check` | `--proposal <id>` (Pflicht) | Prüfbau ohne Aktivierung, zeichnet das Ergebnis auf |
| `approve` | `--proposal <id>`, `--by <wer>` (**beide Pflicht**), `--note <text>` | zeichnet die ausdrückliche Freigabe auf |
| `apply` | `--proposal <id>` (Pflicht) | Activation; nur geprüft **und** freigegeben |
| `generations` | — | listet die Generationen, neueste zuerst, die aktive markiert |
| `rollback` | `--to <generation-id>` (Pflicht) | schaltet auf eine aufgezeichnete Generation zurück |

| Globales Flag | Vorgabe | Bedeutung |
|---|---|---|
| `--backend` | `stub` | `stub` oder `nix`; Umgebung: `PMH_NIX_BACKEND` |
| `--mode` | `local` | `local` oder `remote`; Umgebung: `PMH_NIX_MODE` |
| `--state` | siehe unten | Ablage der Buchführung; Umgebung: `PMH_NIX_STATE` |
| `--json` | aus | **genau ein** JSON-Objekt nach stdout |
| `--version`, `--help` | — | Version bzw. Aufrufhilfe |

Die globalen Flags dürfen **vor oder nach** dem Unterbefehl stehen.

### Exit-Codes

| Code | Bedeutung |
|---|---|
| `0` | Erfolg. Bei `detect` heißt das ausdrücklich auch: *die Antwort „nicht verfügbar" ist die Wahrheit und damit ein gelungener Aufruf.* |
| `1` | Politik- oder Prüfungsfehler: unbekannter/angewandter/ungeprüfter Vorschlag, **fehlende Freigabe**, gesperrter Prüfbau, getauschter Diff, veraltete Basisgeneration, unbekannte Generation, Freigabe ohne Prüfbau |
| `2` | Aufruffeher: unbekannter Unterbefehl, fehlendes Pflicht-Flag, unbekanntes Backend, **unbekannte Betriebsart** |
| `125` | Backend- oder Startfehler: `nix` nicht vorhanden, Buchführung unlesbar |

**Fehler gehen immer nach stderr, mit dem Präfix `pmh-nix: `** — auch bei `--json`, denn der
Exit-Code und der stderr-Text sind der Vertrag, das JSON-Objekt auf stdout ist nur dessen
maschinenlesbare Fassung.

### Ablage

`$PMH_HOME/state/pmh-nix.json`, ersatzweise `~/.pmh/state/pmh-nix.json`. Elternordner werden
angelegt. Geschrieben wird **atomar**: temporäre Datei im Zielordner, `fsync`, dann Umbenennen
(unter Windows mit Wiederholung bei kurzer Sperre). Eine fehlende Datei ist kein Fehler; eine
**unlesbare** ist einer (125) und führt **nicht** zu einem stillen Neuanfang.

Aufgezeichnet werden je Vorschlag: der Vorschlag (Betriebsart, Flake, Ziel, **Branch**,
**Basisgeneration**), der **Diff**, das **Prüfergebnis** samt Kategorien, die **Freigabe**
(wer, wann, Diff-Hash, Basisgeneration) und der Anwendungsvermerk. Ablagefassung: `2`.

## Die Sicherheitsinvarianten — namentlich belegt

| Test | Was er beweist |
|---|---|
| `TestApplyRequiresRecordedApproval` | ohne aufgezeichnete Freigabe kein `apply` — mit Freigabe geht es; die Aufzeichnung nennt wer, wann, welchen Diff, welche Basisgeneration |
| `TestProposeNeverActivates` | `propose`, `check` und `approve` lösen **null** Aktivierungen aus und lassen außerhalb der Buchführung keine Datei entstehen; erst `apply` aktiviert |
| `TestRollbackReturnsToRecordedGeneration` | der Rückweg landet auf der **aufgezeichneten** Generation, beide bleiben erhalten, eine geratene Kennung wird abgewiesen |
| `TestApplyRejectsChangedDiffHash` | nach der Freigabe getauscht → fail-closed |
| `TestApplyRejectsUncheckedProposal` | ohne Prüfbau kein `apply` |
| `TestPolicyCannotBeBypassedByProposalFields` | ein Vorschlag, der sich selbst für geprüft, sicher, freigegeben und anwendbar erklärt, wird trotzdem abgewiesen |
| `TestApplyRejectsUnknownProposal` / `TestApplyRejectsAlreadyAppliedProposal` | nur eigene Kennungen, und ein Vorschlag wirkt genau einmal |
| `TestApplyRefusesWhenCheckFoundErrorSeverityFinding` | ein Befund der Schwere `error` sperrt Anwendung und Freigabe |
| `TestRestrictedCategoryNeedsExplicitApproval` | Netzwerk, Nutzer, Geheimnis: ohne Freigabe abgelehnt, mit Freigabe erlaubt |
| `TestCheckReportsPlaintextSecretAsError` / `TestSopsReferenceIsNotAFinding` | Klartext-Secret ist ein Fehler; der Weg über `sops-nix`/`agenix` ist kein Befund |
| `TestApplyRejectsStaleBaseGeneration` | Basisgeneration nicht mehr aktiv → fail-closed, neu bauen |
| `TestApprovalIsInvalidatedByNewCheck` | eine Freigabe gilt genau für die freigegebenen Bytes |
| `TestProposeIsTheOnlyOpenAction` | gesperrt ist **nur** `apply`; Vorschlagen, Prüfen, Freigeben und der Rückweg bleiben offen |
| `TestNixRefusesEveryMutatingCallFailClosed` | ohne `nix` scheitert jeder Backend-Aufruf laut — und `Apply` liefert keine Generation |

Der Rückweg ist bewusst **nicht** gesperrt: ein System, aus dem man nicht herauskommt, wäre
schlimmer als eines, das sich ändert.

> **Ehrliche Einschränkung.** Auf diesem Wirt gibt es kein Nix. In der Vorgabe-Betriebsart
> läuft der Vertrag der Attrappe deshalb **durch**: er erzeugt einen Datensatz, der wie eine
> Generation aussieht — gekennzeichnet mit `system: "attrappe"` und dem Vermerk *„nichts am
> System geändert, nur Buchführung"*. Wer „eine Generation ist entstanden" mit „das System
> wurde umgestellt" gleichsetzt, liest die Ausgabe falsch.

## Aufbau

```text
services/pmh-nix/
├── go.mod                         Modul wie bei pmh-supervisor
├── unit.json                      die Deklaration
├── api/                           die übertragenen Typen (das ist die Veröffentlichung)
├── internal/actuation/            der austauschbare Rand: Interface, Kategorien, Secret-Prüfung
│   ├── stub/                      die Attrappe (Vorgabe) — ändert nichts
│   └── nix/                       das echte Backend — vorhanden, aber inert
├── internal/policy/               die Zulassungsschicht: allgemeine und strengere Stufe
├── internal/state/                Buchführung (Vorschlag, Prüfbau, Freigabe), atomare Ablage
├── internal/service/              der Vertrag: propose -> check -> approve -> policy -> apply
├── cmd/pmh-nix/                   Kommandozeile, Exit-Codes, JSON-Antwort
└── tests/                         Vertrags-, Sicherheits-, Kategorie- und CLI-Tests
```

Gelesen wird von außen nur `api/`. Der Dienst importiert **nichts** aus dem TypeScript-Kern
und nichts außerhalb seines eigenen Moduls — `TestStubBackendIsBehindTheProcessBoundary`
prüft das am Quellbaum.

## Bauen und Testen

```powershell
cd C:\Users\Chang\prometheus-harness\services\pmh-nix
go vet -buildvcs=false ./...
go build -buildvcs=false ./...      # -buildvcs=false, weil .git im Zielprojekt defekt ist
go test -buildvcs=false ./...
```

## Teststand

| Kennzahl | Wert |
|---|---|
| `go vet -buildvcs=false ./...` | exit 0, 0 Meldungen |
| `go build -buildvcs=false ./...` | exit 0 |
| `go test -buildvcs=false ./...` | exit 0 — **60 Tests, alle grün** |

Die Kommandozeilentests laufen über die **Prozessgrenze** (gebautes Programm, echter
Exit-Code), nicht über einen Paketaufruf: ein `package main` lässt sich in Go nicht
importieren, und nur so werden die Exit-Codes 0/1/2/125 wirklich gemessen.

## Was noch fehlt

1. **Ein echtes Nix-Backend.** Heute ein dokumentierter Rumpf. Wo es später hin muss, steht im
   Paketkommentar von `internal/actuation/nix`: Branch im Git-Repository, dann
   `nixos-rebuild build` für den Prüfbau, `switch` für die Activation und
   `nix-env --list-generations --profile /nix/var/nix/profiles/system` für die Liste.
2. **Der Transport in die `remote`-Betriebsart** — SSH oder ein Agent auf dem Ziel. Im
   Vertrag vorgesehen, ungemessen; siehe §10 des Konzepts.
3. **Keine Signaturprüfung.** Die Freigabe trägt einen Namen und einen Zeitstempel, aber wer
   den Vorschlag einreicht, wird nicht authentifiziert. Der Rand ist heute die Prozessgrenze.
4. **Kein Flake-Beispiel im Bestand.** Der Dienst reicht den Flake-Pfad nur durch; er liest
   ihn nicht. Ohne Nix lässt sich ein echtes Flake auch nicht prüfen.
5. **Die Kategorie-Zuordnung ist eine Textregel.** Sie erkennt Pfade und Klartext-Geheimnisse,
   nicht die Semantik eines Nix-Ausdrucks. Ein Diff, der `networking` über einen Umweg setzt,
   wird nicht als Netzwerk-Änderung erkannt.
