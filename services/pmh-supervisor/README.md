# `pmh-supervisor` — Dienst-Aufsicht (Go)

> **Die erste Go-Aufgabe.** `docs/stack.md` und `docs/decisions/open-questions.md` §4 nennen
> den **Startup-Supervisor** als den Baustein, mit dem Go beginnt — „‚Dienste starten mit der
> Harness' ist eine Anforderung mit klarem Nutzen und ohne Semantik-Duplikat."
>
> **Doku-Grundlage:** [`../../docs/concept.md`](../../docs/concept.md) Regel 3
> („Dienste starten mit der Harness. Fehlgeschlagener Start ist ein **sichtbarer** Fehler"),
> [`../../docs/stack.md`](../../docs/stack.md) (Go: Nebenläufigkeit, Prozess-Supervisierung),
> [`../../MAPPING.md`](../../MAPPING.md) §3.7 und §6.1.
>
> **Kein Gegenstück in der Vorlage** — Neubau (Mapping-Stufe **C**). Die Vorlage hat keinen
> Supervisor; ihr Core startet Plugins im eigenen Prozess.

## Was er tut

Er liest eine Konfiguration mit Kinddiensten, startet sie in Deklarationsreihenfolge,
überwacht sie, startet gescheiterte nach einer Backoff-Regel neu, beendet alles in
**umgekehrter** Reihenfolge und meldet seinen Zustand über HTTP.

## Der Prozessvertrag

```text
pmh-supervisor --config <datei> [--addr 127.0.0.1:8787] [--log-level info]
pmh-supervisor --version
```

| Flag | Vorgabe | Bedeutung |
|---|---|---|
| `--config` | `PMH_SUPERVISOR_CONFIG` | Pfad zur YAML-Konfiguration; **erforderlich** |
| `--addr` | `127.0.0.1:8787` | HTTP-Adresse. Ohne ausdrückliches `--addr 0.0.0.0:…` wird nur lokal gebunden |
| `--log-level` | `info` | `debug` · `info` · `warn` · `error` |

**Exit-Codes:** `0` sauber beendet · `1` Start- oder Konfigurationsfehler · `2` ein
**nicht optionaler** Dienst ist endgültig gescheitert.

## HTTP-Oberfläche

| Route | Zweck |
|---|---|
| `GET /healthz` | `200` solange kein nicht optionaler Dienst gescheitert ist, sonst `503` |
| `GET /version` | Version, Go-Version, Plattform |
| `GET /status` | vollständiger Zustandsschnappschuss |
| `POST /processes/{name}/restart` | einen Dienst einzeln neu starten |

## Konfiguration

```yaml
health_interval: 1s
shutdown_timeout: 15s          # Frist für das gesamte Herunterfahren
processes:
  - name: pmh-store
    exec: pmh-store
    args: ["--addr", "127.0.0.1:8790"]
    dir: C:\work
    env: ["PMH_STORE_DSN=postgres://…"]
    restart: on-failure         # never | on-failure | always
    max_restarts: 5             # < 0 = unbegrenzt, 0 = Vorgabe
    optional: false             # optional: darf fehlen oder scheitern
    shutdown_grace: 5s
    backoff:
      initial: 500ms
      max: 30s
      factor: 2
      jitter: full              # off | full
```

**Vorgaben:** `DefaultShutdownTimeout = 15s`, `DefaultMaxRestarts = 5`,
`DefaultRestart = on-failure`.

**`optional: true`** heißt: der Dienst darf fehlen oder scheitern, ohne die Harness zu
beenden — er bleibt aber im Status als Fehler **sichtbar** (Regel 3: sichtbar scheitern,
nicht still ausfallen). Ein optionaler Fehler setzt den Status **nicht** auf `degraded`.

## Wie er die Regel „sichtbar scheitern" einlöst

- Ein nicht optionaler Dienst, der sein Neustartlimit erreicht, beendet `Watch` mit
  `ErrServiceFailed` und dem Namen des Dienstes.
- `Start` bricht beim ersten nicht optionalen Dienst ab, der sich nicht starten lässt.
- Die Ausgabe der Kinder wird **geerbt**, nicht verschluckt — ein Kind, das schreit, ist
  sichtbar.
- `Status.Degraded` macht Teilausfälle sichtbar, ohne den Betrieb zu beenden.

## Die Abschaltung — und ihre Plattformgrenze

Die Abschaltung läuft in **zwei Phasen**:

1. **Signal zustellen** an alle laufenden Dienste, in umgekehrter Startreihenfolge.
2. **Gemeinsam auf die Frist warten**; was dann noch läuft, wird hart beendet.

Phase 2 ist **gemeinsam**, nicht nacheinander. Das ist der Unterschied zwischen „alle haben
eine Frist von f" und „jeder hat nacheinander f": das sequenzielle Verfahren dauerte bei n
Diensten n·f und ließ einen Dienst, der noch gar nicht hochgekommen war, nur noch als Leiche
signalisieren.

> ### ⚠ Plattformgrenze: auf Windows gibt es **kein** freundliches Beenden
>
> Go kann einem fremden Prozess unter Windows **kein** SIGTERM zustellen. `os.Interrupt`
> liefert dort den Fehler *„not supported by windows"*, und die Zustellung von
> `CTRL_BREAK_EVENT` braucht eine eigene Konsole plus ein Job-Objekt.
>
> **Folge:** Auf Windows wird **jeder** Dienst nach Ablauf seiner Frist hart beendet
> (`TerminateProcess`). `Shutdown` meldet das dann als `ErrShutdownTimeout` — auch wenn der
> Dienst kooperativ gewesen wäre. Die Dauer der Abschaltung ist damit `max(frist)`, nicht
> Summe. Auf POSIX wird `SIGTERM` zugestellt und ein kooperativer Dienst beendet sich selbst.
>
> **Nicht umgesetzt:** das Job-Objekt-Verfahren. Es würde beides lösen — freundliches Beenden
> **und** das Mitbeenden von Enkeln (auf Windows trifft `TerminateProcess` heute nur das
> direkte Kind, weil `sysProcAttr` dort `nil` liefert). Das ist die nächste sinnvolle Arbeit
> an diesem Dienst und steht in der Mängelliste des Prüfberichts.

## Bauen und Testen

```powershell
cd C:\Users\Chang\prometheus-harness\services\pmh-supervisor
go vet ./...
go build -buildvcs=false ./...     # -buildvcs=false, weil .git im Zielprojekt defekt ist
go test ./...
```

## Teststand — ehrlich, mit offenen Punkten

| Kennzahl | Wert |
|---|---|
| `go vet` | **0 Meldungen** |
| `go build` | exit 0 (mit `-buildvcs=false`) |
| Tests | **rot: 2** |

### Was behoben wurde

Drei Tests waren rot und sind grün:

| Test | Ursache | Behebung |
|---|---|---|
| `TestOptionalServiceDoesNotStopWatch` | die Testhilfe `blockForever` blockierte **nicht**: `<-ch` auf einem Kanal ohne Sender lässt den Go-Deadlock-Prüfer feuern, der Fake-Dienst endete mit **Exit 2** und galt als Fehler | `blockForever` konsumiert jetzt alle Signale und blockiert damit wirklich |
| `TestShutdownGraceThenKill` | dieselbe Ursache | dito |
| `TestSignalPathIsUsed` | dieselbe Ursache | dito |

### Was **offen** ist (2 Tests)

| Test | Beobachtung | Ursache | Nächster Schritt |
|---|---|---|---|
| `TestShutdownReverseOrder` | `beendete Dienste = []`, und `Shutdown` meldet nach 15 s `Abschaltfrist ueberschritten: [gamma beta alpha]` | Auf Windows kann kein freundliches Signal zugestellt werden, also schreiben die Dienste ihre Ende-Marke **nicht selbst**; die beobachtete Reihenfolge ist damit auf dieser Plattform nicht prüfbar. Zusätzlich dauert der Lauf eine volle Frist (15 s) | Der Test braucht entweder eine Plattformtrennung (POSIX: Reihenfolge über Ende-Marken; Windows: Reihenfolge über `OnProcessExit`) **oder** das Job-Objekt-Verfahren, das freundliches Beenden auf Windows überhaupt erst möglich macht |
| `TestSingleRestartStartetNeu` | `PID blieb gleich`; danach `TempDir RemoveAll cleanup: … being used by another process` | `Restart` beendet den laufenden Dienst, kann ihm aber auf Windows kein Signal zustellen und wartet die Frist ab; der alte Prozess hält die PID-Datei noch, während der neue schon startet | Nach demselben Muster: entweder Plattformtrennung oder Job-Objekt |

**Beide offenen Tests prüfen Verhalten, das auf dieser Plattform nicht existiert.** Der
Dienst selbst ist nicht nachweislich falsch — die Tests können hier nur nicht das messen,
was sie messen wollen. Das ist genau der Unterschied, den der Prüfbericht als Auflage **A2**
führt.

## Was noch fehlt

1. **Job-Objekt auf Windows** — freundliches Beenden **und** Mitbeenden von Enkeln. Die
   wichtigste offene Arbeit.
2. **Die beiden offenen Tests** — siehe oben.
3. **Kein `unit.json`-Nachweis in der Praxis**, weil es vor diesem Dienst kein Unit gab; das
   Format ist in [`../../units/README.md`](../../units/README.md) festgehalten.
4. **Kein Lasttest.** Bei vielen Diensten ist die Nebenläufigkeit des Supervisors nicht
   gemessen.
