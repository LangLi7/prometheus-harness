# `units/` — die Units des Prometheus Harness

> **Was ein Unit ist.** Alles, was **nicht** Core ist. Der Core ist die Harness selbst
> (der Referenz-Fork, unangetastet); jede Fähigkeit darüber ist ein Unit mit eigener
> Version, das man an- und abstecken kann.
>
> **Die Regel, die das trägt** ([`../docs/concept.md`](../docs/concept.md)):
> *Der Core ist unantastbar. Kein Unit importiert Interna des Cores. Dienste starten mit der
> Harness. Sprachgrenzen sind Dienstgrenzen.*

## Die vier Unit-Arten

| Art | Was es ist | Beispiel |
|---|---|---|
| `plugin` | Cordis-Plugin, in einen Bundle eingehängt | Multi-Modell-Router, Git-Panel |
| `service` | startet einen externen Dienst **mit** der Harness | Supervisor, Store, Research |
| `patch` | Änderung an einer Core-Datei, die keinen Steckplatz hat | nur mit Begründung |
| `skill` | Agent-Skill ohne Host-Code | Selbstverbesserung |

## Aufbau eines Units

Ein Unit liegt in **einem** Ordner:

```
units/<name>/
├── unit.json          Pflicht: die Deklaration
├── README.md          Pflicht: Zweck, Start, Flags, Grenzen
├── …                  die Umsetzung (src/, cmd/, tests/ …)
└── …
```

**Kein `package.json` im Unit-Ordner, wenn es ein Dienst ist.** Dienste in Go und Rust sind
Prozesse mit eigenem `go.mod` bzw. `Cargo.toml`; nur `plugin`- und `skill`-Units, die im
JS-Core laufen, brauchen eine Node-Paketdatei.

## `unit.json` — die Deklaration

```json
{
  "name": "pmh-supervisor",
  "version": "0.1.0",
  "kind": "service",
  "language": "go",
  "description": "Startet, überwacht und beendet die Dienste der Harness.",
  "entry": {
    "command": "pmh-supervisor",
    "args": ["--config", "supervisor.yaml"]
  },
  "core": "required_core",
  "provides": ["process-supervision"],
  "requires": [],
  "platforms": ["windows", "linux", "darwin"]
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `name` | ja | eindeutiger Name; entspricht dem Ordnernamen |
| `version` | ja | eigene Version, unabhängig vom Core |
| `kind` | ja | `plugin` · `service` · `patch` · `skill` |
| `language` | ja | `typescript` · `go` · `rust` |
| `description` | ja | ein Satz |
| `entry` | bei `service` | `command` + `args`: wie der Dienst gestartet wird |
| `core` | ja | **`optional`** (steckbar, läuft ohne Core) oder **`required_core`** (braucht den Core) |
| `provides` | nein | welche Fähigkeit das Unit bereitstellt |
| `requires` | nein | welche anderen Units es braucht |
| `platforms` | nein | Einschränkung; fehlt = überall |

### `optional` gegen `required_core` — der Unterschied, der zählt

| Wert | Bedeutung | Folge beim Start |
|---|---|---|
| `required_core` | Das Unit setzt den Core voraus und wird von ihm gestartet. | Scheitert es, ist das ein **sichtbarer Fehler** (Regel 3). Kann über `optional: true` in der Supervisor-Konfiguration abgeschwächt werden — dann bleibt der Fehler im Status sichtbar, beendet die Harness aber nicht. |
| `optional` | Das Unit ist absteckbar: ohne Core startbar, z. B. ein Werkzeug. | Es wird nicht automatisch gestartet. |

## Warum kein `units/*` im Bun-Workspace steht

`package.json` an der Wurzel listet `packages/*/*` und `apps/web`. **`units/*` fehlt
absichtlich:** ein Go- oder Rust-Dienst hat keine Node-Abhängigkeiten, und ein
`plugin`-Unit wird über die Cordis-Komposition eingebunden, nicht über den Bun-Workspace.
Sobald das erste **JS-basierte** Unit installierbare Abhängigkeiten hat, muss `units/*`
dort ergänzt werden — genau der Hinweis, den die Vorlage in `.pmh/base.json` gibt.

## Wo die Dienste tatsächlich liegen

Die produktiven Dienste liegen aus historischen Gründen unter `services/` bzw. `native/`.
Ihre `unit.json` steht **bei ihnen** — sie ist die Deklaration, auch wenn der Ordner nicht
`units/` heißt. `units/` bleibt den Units vorbehalten, die **keinen** eigenen Sprachbaum
brauchen (Plugins, Skills).

| Sprachbaum | Deklaration liegt in |
|---|---|
| `services/<name>/unit.json` | Go-Dienste |
| `native/<name>/unit.json` | Rust-Binaries |
| `packages/<gruppe>/<paket>/unit.json` | TypeScript-Pakete, die als Unit ausgeliefert werden |
| `units/<name>/unit.json` | Plugins und Skills ohne eigenen Sprachbaum |
