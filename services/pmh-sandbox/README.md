# `pmh-sandbox` — Sandbox-Durchsetzung als Dienst (Rust)

> **Nachfolger** von `packages/sandbox/sandbox-windows-acl` und der Landlock-Nutzung der
> Vorlage.
> **Mapping:** [`../../MAPPING.md`](../../MAPPING.md) §3.6 und §3.7
> **Doku-Grundlage:** [`../../docs/stack.md`](../../docs/stack.md) — „Sandbox … **stärkster
> Fall der drei**"; [`../../docs/decisions/open-questions.md`](../../docs/decisions/open-questions.md)
> §5 — Neigung: „Sandbox zuerst"

## Die Arbeitsteilung

Die Vorlage trennt ihre Sandbox genauso, und dieser Port behält die Trennung, weil sie die
richtige ist:

| Anliegen | Wo es lebt |
|---|---|
| **Politik** — welche Modi es gibt, was jeder gewährt, was validiert wird | der TypeScript-Kern (`packages/sandbox/sandbox-policy`), weil Politik für Agent, UI und Einstellungsoberfläche sichtbar sein muss |
| **Durchsetzung** — einen Prozess tatsächlich einschränken | hier, weil das Betriebssystemarbeit ist |

**Dieser Dienst entscheidet also nie, wie die Politik aussehen soll.** Er bekommt eine
Politik, validiert, dass er sie durchsetzen kann, und **berichtet ehrlich, was er erreicht
hat**.

## Die Ehrlichkeitsanforderung

Die Vorlage dokumentiert das für ihren Launcher, und es bleibt hier erhalten: eine
**teilweise** durchgesetzte Sandbox muss das **sagen**. `enforced` zu melden, wenn nur eine
Teilmenge der angefragten Zugriffe geregelt ist, wäre schlimmer als zu verweigern — der
Aufrufer hört dann auf, sich Sorgen zu machen.

Jedes Urteil trägt deshalb beides: die angefragte Politik **und** das tatsächlich erreichte
Maß.

## Aufruf

```text
pmh-sandbox probe
pmh-sandbox assess [--file-access <none|read-only|read-write>]
                   [--read <path>]... [--write <path>]...
                   [--network] [--spawn]
```

### `probe`

```json
{"version":1,"operation":"probe","mechanism":"acl","filesystem":true,"network":false,"spawn":false,"note":"…"}
```

### `assess`

```json
{"version":1,"operation":"assess","verdict":"partial","enforced":false,"unenforced":["network"],"policy":{"file_access":"read-only","read_roots":2,"write_roots":0,"network":true,"spawn":false}}
```

## Urteilsvokabular

Dieselben drei Worte wie die Probe des Launchers, damit ein Aufrufer beide Dienste gleich
behandeln kann:

| Urteil | Bedeutung | Exit-Code | stderr |
|---|---|---|---|
| `full` | jede angefragte Einschränkung ist durchgesetzt | `0` | — |
| `partial` | ein Teil ist durchgesetzt; **welcher Teil fehlt, steht im Report** | `0` | eine Zeile mit den nicht geehrten Punkten |
| `unusable` | nichts konnte durchgesetzt werden. **Traue diesem Lauf nicht.** | `125` | Verweigerungszeile |

## Fähigkeiten je Plattform (ehrlich)

| Plattform | Mechanismus | Dateisystem | Netzwerk | Prozess-Erzeugung |
|---|---|---|---|---|
| Linux | `landlock` | ja | **nein** | **nein** |
| Windows | `acl` | ja | **nein** | **nein** |
| andere | keine | nein | nein | nein |

**Kein Mechanismus regelt Netzwerk oder Prozess-Erzeugung.** Landlock ist eine
Dateisystem-Allow-List; Windows-ACLs regeln Dateizugriff. Für Netzwerk und Prozess-Erzeugung
bräuchte es einen Job-Object-Ansatz oder einen Filter-Treiber — beides ist **nicht** gebaut.
Deshalb liefert eine Politik mit `--network` oder `--spawn` das Urteil **`partial`**, nie ein
stilles `full`.

Das ist eine **Sicherheitseigenschaft, keine Einschränkung**: Eine Fähigkeit zuzusagen, die
der Mechanismus nicht hat, wäre ein Sicherheitsfehler, kein Feature.

## Politik-Validierung

Eine intern widersprüchliche Politik wird abgelehnt, **bevor** irgendetwas beurteilt wird:

| Fall | Fehler | Warum |
|---|---|---|
| `--file-access none` **mit** Grants | `ERR_SANDBOX_POLICY` | eines von beidem müsste still ignoriert werden |
| `--file-access read-only` **mit** `--write` | `ERR_SANDBOX_POLICY` | dito; die Fehlermeldung sagt „use read-write" |
| leerer Grant-Root | `ERR_SANDBOX_POLICY` | ein leerer Pfad ist kein Root |

## Fehlercodes

| Code | Bedeutung |
|---|---|
| `ERR_SANDBOX_POLICY` | die Politik ist widersprüchlich oder ein Wert ist unbekannt |
| `ERR_SANDBOX_USAGE` | Nutzungsfehler |

## Bauen und Testen

```powershell
cargo build -p pmh-sandbox
cargo test  -p pmh-sandbox
```

Von Hand:

```powershell
.\target\debug\pmh-sandbox.exe probe
.\target\debug\pmh-sandbox.exe assess --file-access read-write --read C:\ --write C:\temp
.\target\debug\pmh-sandbox.exe assess --network; echo "exit=$? (0, aber partial)"
.\target\debug\pmh-sandbox.exe assess --file-access read-only --write C:\temp; echo "exit=$? (125)"
```

## Tests

15 Unit-Tests, darunter die inhaltlich entscheidenden:

- eine minimale Politik ist gültig
- `none` mit Grants ist widersprüchlich
- `read-only` mit Write-Roots ist widersprüchlich
- ein leerer Root wird abgelehnt
- Zugriffsstufen laufen über ihre Namen hin und zurück (`ro`, `rw`, `readonly` werden
  akzeptiert)
- eine unbekannte Zugriffsstufe wird abgelehnt
- eine reine Dateisystem-Anfrage ist `full` (wo Dateisystem funktioniert)
- **`--network` wird nie still gewährt** — immer `partial` mit `"network"` in der Liste
- **`--spawn` wird nie still gewährt**
- **jede nicht geehrte Anfrage wird gelistet, nicht nur die erste** (ein Report, der nur
  eine von zwei Lücken nennt, ist kein ehrlicher Report)
- eine ungültige Politik wird vor jeder Beurteilung abgelehnt
- das Urteilsvokabular ist wörtlich dasselbe wie beim Launcher

## Was noch fehlt — der Kern der Sache

**Dieser Dienst beurteilt, er setzt noch nicht durch.** Was funktioniert: die
Politik-Validierung, die Fähigkeitserkennung und das Urteil mit vollständiger Mängelliste —
also genau der Teil, der vor einem Lauf entschieden werden muss.

Was fehlt:

1. **Die ACL-Anwendung unter Windows.** Es gibt keinen Aufruf, der eine Politik auf einen
   Prozess oder ein Verzeichnis anwendet.
2. **Die Landlock-Anwendung unter Linux.** Sie existiert bereits als
   [`pmh-landlock-run`](../../native/landlock-run/) — dieser Dienst sollte dorthin delegieren,
   statt eine zweite Umsetzung zu bauen.
3. **Netzwerk- und Prozess-Erzeugungs-Einschränkung** — siehe die Fähigkeitstabelle; das ist
   die eigentliche offene Arbeit.

Punkt 2 ist die nächste sinnvolle Ergänzung, weil die Durchsetzung dann bereits existiert und
nur noch hinter `assess` gelegt werden muss.
