# SkillSpector in Prometheus

**Stand:** 26.10.2026 · **Paket:** `@prometheus-harness/skillspector` · **Kommando:** `pmh skill scan`

## 1. Die kurze Antwort

Prometheus prüft jede Fähigkeit und jedes Plugin **vor** der Installation mit einem
eigenen, statischen Sicherheits-Scanner. Er heißt wie das Vorbild von NVIDIA —
SkillSpector — und rechnet mit **demselben Risikomodell**, läuft aber als
TypeScript im Harness: kein Python, kein LLM, kein Netzzugriff beim Prüfen.

```bash
pmh skill scan .agents/skills/mein-skill
pmh skill scan . --format json > bericht.json
pmh skill scan . --format sarif --fail-on warn
```

Der Scanner **führt nichts aus**. Er liest Text, findet Muster und liefert einen
Bericht. Das ist die einzige Eigenschaft, die ein Sicherheitswerkzeug haben muss,
das fremden Code beurteilt.

## 2. Was geprüft wird

37 Regeln in 16 Familien. Die Kennungen sind stabil; eine Baseline verweist auf
`PI2`, nicht auf „Regel 17“.

| Familie | Kürzel | Beispiel |
|---|---|---|
| Prompt-Injection | `PI1`–`PI6` | „ignore all previous instructions“, Rollenübernahme, Base64-Nutzlast, unsichtbare Unicode-Zeichen |
| Anti-Refusal | `PI3`, `AR1` | „do not refuse“, „do not tell the user“ |
| Systemprompt-Abfluss | `SL1`, `SL2` | „print your system prompt“, Gesprächsverlauf senden |
| Datenabfluss | `E1`–`E5`, `TT1` | Umgebungsvariablen sammeln, `~/.ssh/id_*` lesen, DNS-Absaugen, Sammlung **und** Versand im selben Skill |
| Rechteausweitung | `PE1`–`PE3` | `sudo`, `chmod 777`, `crontab -e`, LaunchAgents |
| Lieferkette | `SC1`–`SC4` | `curl … \| bash`, ungepinnte Installation, `postinstall` mit Netzaufruf, fremde Registry |
| Gefährlicher Code | `DC1`, `DC2`, `OH1` | `eval`, `os.system`, `shell=True`, unsicheres Deserialisieren, Shell mit interpolierter Eingabe |
| Übermäßige Handlungsmacht | `EA1`–`EA4` | `--dangerously-skip-permissions`, `rm -rf /`, Endlosschleife, `--no-sandbox` |
| Werkzeugmissbrauch | `TM1`, `RA1` | `git push --force`, Selbstvervielfachung |
| Speichervergiftung | `MP1` | `CLAUDE.md`/`AGENTS.md`/Settings werden geschrieben |
| Auslöser-Missbrauch | `TA1` | Keyword-Backdoor („wenn der Nutzer X sagt, dann …“) |
| MCP | `MCP1`–`MCP5` | unverschlüsselter Endpunkt, Klartext-Token im Header, `"/"` als Pfad, Anweisung in einer Werkzeugbeschreibung |

**Die MCP-Regeln greifen nur in MCP-Dateien** (`.mcp.json`, `mcp.json` oder JSON mit
`"mcpServers"`/`"mcp_servers"`). Ein Datenbestand mit Website-Einträgen ist keine
MCP-Konfiguration — diese Unterscheidung hat der erste Lauf gegen einen echten
Design-Skill erzwungen.

## 3. Das Risikomodell

Unverändert vom Vorbild, damit Zahlen vergleichbar bleiben:

| Schweregrad | Punkte |
|---|---|
| `CRITICAL` | +50 |
| `HIGH` | +25 |
| `MEDIUM` | +10 |
| `LOW` | +5 |

Enthält das Artefakt ausführbare Bestandteile (`.sh`, `.py`, `.js`, `.ts`, Shebang),
multipliziert der Score mit **1,3** und wird bei 100 gedeckelt.

| Score | Severity | Empfehlung (Vorbild) |
|---|---|---|
| 0–20 | `LOW` | `SAFE` |
| 21–50 | `MEDIUM` | `CAUTION` |
| 51–80 | `HIGH` | `DO_NOT_INSTALL` |
| 81–100 | `CRITICAL` | `DO_NOT_INSTALL` |

**Unvollständige Abdeckung ist nie `SAFE`.** Wird eine Datei übersprungen (binär, zu
groß, nicht lesbar) oder schließt der Aufrufer Pfade aus, fällt die Empfehlung
mindestens auf `CAUTION`. „Nicht geprüft“ und „sauber“ sind verschiedene Dinge.

## 4. Zwei Gate-Politiken

`gate(report)` bildet die Empfehlung des Vorbilds eins zu eins ab: `HIGH` blockt.
Das ist für einen Installer zu grob, weil er sonst jedes Entwicklungswerkzeug
blockiert, das selbst `eval` benutzt.

Deshalb gibt es `gate(report, 'balanced')` — die Vorgabe des Installers:

| Politik | blockt |
|---|---|
| `strict` | jedes `CRITICAL` und jedes `HIGH` |
| `balanced` | jedes `CRITICAL` und `HIGH` **aus Absichtsfamilien** (Prompt-Injection, Anti-Refusal, Datenabfluss, Lieferkette, Speichervergiftung, Auslöser, Rogue-Agent, Systemprompt-Abfluss, Taint) |

Ein `eval` in einem Browser-Werkzeug **warnt**; eine Anweisung, den Agenten
umzuleiten, **blockt**. `pmh plugin install --strict` erzwingt die strenge Politik.

## 5. Baseline: akzeptierte Befunde

Ein geprüfter Befund soll nicht bei jedem Lauf wieder auftauchen. Die Baseline
bindet Regel, Datei und **normalisierten Beleg** — nicht die Zeile, damit eine
eingefügte Leerzeile eine akzeptierte Stelle nicht wieder aufweckt.

```bash
# Baseline aus einem Lauf schreiben (die Befunde gelten dann als geprüft)
pmh skill scan ./mein-skill --write-baseline skillspector.baseline.yaml

# Nächster Lauf mit Baseline — nur neue Befunde zählen
pmh skill scan ./mein-skill --baseline skillspector.baseline.yaml
```

Unterdrückte Befunde zählen **nicht** in den Score. Eine Baseline, die nicht zu
`pmh-skillspector` gehört oder eine falsche Fassung hat, wird **abgelehnt** — eine
kaputte Baseline darf nicht stillschweigend alles unterdrücken.

## 6. Grenzen

- **Kein LLM.** Das Vorbild hat einen optionalen semantischen zweiten Schritt. Der
  ist hier bewusst nicht eingebaut: er würde Dateiinhalte an einen Anbieter
  senden. `metadata.llmAvailable` ist deshalb immer `false`.
- **Keine Ausführung, keine Sandbox.** Der Scanner sagt „verdächtig“, er enthält
  nichts.
- **Regex ist keine Semantik.** Ein `eval` in einem Werkzeug, das Ausdrücke
  auswertet, ist ein anderer Fall als ein `eval` auf Nutzereingabe. Die
  Vertrauenswerte (0–1) stehen im Bericht; die Politik unterscheidet Absicht von
  Fähigkeit, nicht Wahrheit von Lüge.
- **Nicht-deutsche Inhalte** werden schlechter erkannt — wie beim Vorbild.
- **Bilder, Binärdateien, verschlüsselte Inhalte** werden nicht geprüft.

## 7. Aufbau

| Datei | Aufgabe |
|---|---|
| `src/types.ts` | Bericht, Befund, Baseline, Gate — der Vertrag |
| `src/rules.ts` | die Regeln; jede liefert Belege, kein Urteil |
| `src/text.ts` | Zeilen, Belege, Fingerabdrücke, Unicode, Base64, Globs |
| `src/index.ts` | Lauf, Score, Gate, Baseline, Verzeichnislesen |
| `src/output.ts` | Terminal, Markdown, JSON, SARIF 2.1.0 |

Die Tests liegen in `tests/scanner.test.ts` und prüfen Bericht, Score, Politik,
Baseline und Abdeckung — nicht die interne Regelreihenfolge.
