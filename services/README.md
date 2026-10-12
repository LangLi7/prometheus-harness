# `services/` — die Dienste des Prometheus Harness

> **Die Regel, die hier gilt** ([`../docs/stack.md`](../docs/stack.md)):
> *Der JS-Core bleibt der Kernel. Jede andere Sprache ist ein Dienst, den er aufruft.*
>
> Jeder Dienst ist ein **Prozess** mit dokumentierter Kommandozeile, eigenen Exit-Codes und
> einer JSON- oder HTTP-Schnittstelle. Kein Dienst importiert Core-Interna; kein Dienst wird
> in den Core gelinkt.

## Stand — ehrlich

| Dienst | Sprache | Status | Beleg |
|---|---|---|---|
| **`pmh-supervisor`** | Go | **implementiert**, 2 Tests rot | `go vet` 0 · `go build` exit 0 · 25 Tests, **2 rot** (Plattformgrenze Windows, siehe README) |
| **`pmh-sandbox`** | Rust | **implementiert (Beurteilung)**, Durchsetzung offen | 14 Tests grün; `assess`/`probe` verifiziert |
| `pmh-scheduler` | Go | **offen** | — |
| `pmh-gateway` | Go | **offen**, messungsgebunden | `docs/stack.md`: erst wenn Lastmessungen es als Engpass zeigen |
| `pmh-git` | Go | **offen** | — |
| `pmh-store` | Go | **offen** | — |
| `pmh-cache` | Go | **offen** | — |
| `pmh-memory` | Go | **offen** | — |
| `pmh-research` | Go | **offen** | — |
| `pmh-ocr` | Go | **offen** | — |
| `pmh-workflow` | Go | **offen** | — |
| `pmh-decision` | Go | **offen** | — |

**1 von 12 Diensten ist implementiert.** Das ist der größte offene Posten des Go-Anteils
(Prüfbericht, Auflage **A7**). Das Mapping, das jeden Dienst begründet, steht in
[`../MAPPING.md`](../MAPPING.md) §3.7.

## Warum der Supervisor zuerst

`docs/stack.md` und `docs/decisions/open-questions.md` §4 sind eindeutig:

> „**Startup-Supervisor zuerst** — ‚Dienste starten mit der Harness' ist eine Anforderung mit
> klarem Nutzen und ohne Semantik-Duplikat. Das Gateway erst, wenn es messbar der Engpass ist."

Der Supervisor setzt **Regel 3** aus [`../docs/concept.md`](../docs/concept.md) um: *Dienste
starten mit der Harness. Ein fehlgeschlagener Start ist ein sichtbarer Fehler, kein stiller
Ausfall.* Alle weiteren Dienste werden **von ihm** gestartet — er ist damit die Voraussetzung
dafür, dass die übrigen überhaupt „mit der Harness starten" können.

Deshalb ist die Reihenfolge nicht beliebig: die anderen Dienste sind erst sinnvoll
anschließbar, wenn der Supervisor trägt.

## Aufbau eines Dienstes

```
services/<name>/
├── go.mod                  module github.com/LangLi7/prometheus-harness/services/<name>
├── cmd/<name>/main.go      Einstieg
├── internal/…              Implementierung
├── internal/api/           nach außen sichtbare Typen (der Vertrag)
├── …_test.go               Tests
├── README.md               Zweck, Start, Flags, Ports, Exit-Codes, was NICHT umgesetzt ist
└── unit.json               Unit-Deklaration (Format: ../units/README.md)
```

**Jeder Dienst hat ein README, das seine Grenzen nennt.** Ein Dienst ohne README gilt als
nicht abgeliefert — die Vorlage dokumentiert jedes Paket, und die Grenzen sind der Teil, der
sonst verloren geht.

## Konventionen

| Punkt | Regel |
|---|---|
| Go-Version | `go 1.26` in `go.mod` |
| Abhängigkeiten | Standardbibliothek bevorzugt; jede externe Abhängigkeit braucht einen Grund |
| HTTP | Port aus einem Flag mit sinnvoller Vorgabe; `GET /healthz`, `GET /version`; Bindung an `127.0.0.1`, `0.0.0.0` nur mit ausdrücklichem Flag |
| Konfiguration | Flags mit `PMH_`-Präfix als Umgebungs-Fallback; klarer Fehler, wenn Pflichtkonfiguration fehlt |
| Fehler | mit `%w` verpackt; Sentinel-Fehler, wo Aufrufer unterscheiden müssen; **nie** Panik bei schlechter Eingabe |
| Sichtbarkeit | Fehler sind **sichtbar** (Regel 3) — kein stiller Ausfall, kein verschluckter Exit-Code |

## Bauen und Testen

```powershell
# alle Dienste
.\scripts\build-go.ps1
.\scripts\test-go.ps1

# ein einzelner Dienst
.\scripts\build-go.ps1 -Service pmh-supervisor
.\scripts\test-go.ps1  -Service pmh-supervisor
```

## Bekannte Umgebungsbedingung: `-buildvcs=false`

Im Zielprojekt ist `.git` defekt (`git rev-parse` meldet „not a git repository"). `go build`
versucht VCS-Stamping und scheitert deshalb mit
`error obtaining VCS status: exit status 128`. Die Skripte setzen daher `-buildvcs=false`.
Behebung: `.git` reparieren **oder** die Variable dauerhaft setzen:

```powershell
$env:GOFLAGS = "-buildvcs=false"
```

## Was noch fehlt

1. **Elf der zwölf Dienste** (Auflage **A7**).
2. **Der Go-Build ist ohne `-buildvcs=false` nicht reproduzierbar** (Auflage **A3**).
3. **Kein CI-Lauf.** Die Dienste sind nie auf einem zweiten Rechner gebaut worden.
4. **Kein Lasttest.** Die Nebenläufigkeitszusagen (viele gleichzeitige Sitzungen,
   Prozessüberwachung) sind nicht gemessen — genau die Messung, die `docs/stack.md` für das
   Gateway verlangt.
