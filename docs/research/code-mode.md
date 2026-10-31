# Code Mode — Recherche und Stand im Harness

> **Zweck.** Was das Muster „Code Mode" ist, welche Quellen es tragen, welche Suchbegriffe
> weiterführen, und wie es im Prometheus Harness tatsächlich ankommt (dort heißt es **PTC**).
> Stand: 2026-10-27. Laufzeitverhalten im Harness ist **nicht** gemessen — siehe §5.

---

## 1. Definition

Code Mode ist ein Tool-Use-Muster: Das Modell gibt **ein** Tool auf, nämlich
Code-Ausführung, und schreibt darin ein Programm, das andere Tools aufruft, statt sie
einzeln nacheinander anzufordern. Die Werkzeugschicht wird damit zur Bibliothek im
Programm statt zur Liste im Kontextfenster.

Drei Wirkungen werden dem Muster zugeschrieben:

| Wirkung | Mechanik |
|---|---|
| Token-Reduktion | Ein großer Tool-Katalog (Tausende OpenAPI- oder MCP-Endpunkte) muss nicht in den Kontext; das Modell entdeckt nur, was es braucht. |
| Batching und Logik | Abhängige Aufrufe, Schleifen, Filter und Verzweigungen laufen **innerhalb** einer Ausführung statt über Modell-Runden. |
| Weniger Round Trips | Eine Programmausführung ersetzt viele Hin-und-zurück-Iterationen der Modellschleife. |

Der Ablauf in vier Schritten, wie ihn die Cloudflare-Dokumentation beschreibt:
**Discovery** (leichtgewichtige Meta-Tools wie `search`/`describe` statt Vollkatalog) →
**Code-Generierung** (Skript, das die nötigen Aufrufe sequenziert) →
**Sandbox-Ausführung** (isolierte Laufzeit mit kontrolliertem Zugriff) →
**Ergebnisrückgabe** (nur die Endausgabe erreicht das Kontextfenster).

Der entscheidende Punkt ist nicht „Code statt Tool-Calls", sondern **wo der Code läuft**.
Armin Ronacher trennt dafür *Brains* (Harness, vertraut) von *Hands* (Ausführungsumgebung,
weniger vertraut). Code Mode läuft in Pi in QuickJS innerhalb einer WASM-Runtime: kein Netz,
kein Dateisystem, keine Timer, begrenzter Speicher — der einzige Ausweg sind weitere
Tool-Aufrufe. Genau diese Abschottung macht den Namen „Code Mode" zu mehr als „Bash".

---

## 2. Quellen

| Quelle | Rolle | Was sie belegt |
|---|---|---|
| [Cloudflare Agents — Code Mode](https://developers.cloudflare.com/agents/tools/codemode/) | Referenz, Begriffsurheber | Definition, „Code as a plan", progressive Discovery über `codemode.search()`/`describe()`, Entscheidungstabelle direkt vs. Code Mode. Ausdrücklich als *experimental* markiert. |
| [Cloudflare — How Code Mode works](https://developers.cloudflare.com/agents/tools/codemode/how-it-works/) | Referenz | Ablauf eines generierten Plans (nicht abgerufen). |
| [universal-tool-calling-protocol/code-mode](https://github.com/universal-tool-calling-protocol/code-mode) | Bibliothek (UTCP) | „Plug-and-play library to enable agents to call MCP and UTCP tools via code execution." Repository-Seite abgerufen; README-Inhalt nicht im Detail gelesen. |
| [Armin Ronacher — What is Codemode](https://lucumr.pocoo.org/2026/10/6/codemode/) | Erfahrungsbericht, beste Einzelquelle | Brains-vs-Hands-Trennung, QuickJS/WASM-Sandbox, `store()` für Zustand über Aufrufe hinweg, Nebenläufigkeit (`Promise.all`, Limit auf vier), MCP-Kritik (doppelte JSON-Escapes, inkonsistente Ergebnisse, kein Binärtransport). |
| [FastMCP — Code Mode](https://gofastmcp.com/servers/transforms/code-mode) | Werkzeug | Code Mode als Transform auf der **Server**-Seite; Inhalt beim Abruf abgeschnitten, hier nicht ausgewertet. |
| [adk-code-mode (PyPI)](https://pypi.org/project/adk-code-mode/) | Umsetzung | Agent Development Kit, mehrsprachig/mehrmandantenfähig; nur über Suchtreffer bekannt. |
| [PMCP — Progressive MCP (PyPI)](https://pypi.org/project/pmcp/1.4.0/) | Umsetzung | Progressive Discovery als eigenes Paket. |

Nicht verifiziert und deshalb nicht behauptet: Aussagen über Versionen, Marktanteile oder
„die meisten Harnesse unterstützen das". Solche Sätze stehen in Blogposts, nicht in den
Primärquellen dieses Dokuments.

---

## 3. Suchbegriffe

Für die eigene Weitersuche, gruppiert nach Trefferqualität:

**Kern**
- `"code mode"` + `agent` / `LLM`
- `code execution with MCP` (Anthropic-Formulierung, findet die ältere Diskussion)
- `progressive tool discovery` / `progressive disclosure tools`
- `programmatic tool calling` (Microsoft/Anthropic-Sprech; im Harness ist das der Name **PTC**)

**Umsetzungen**
- `universal tool calling protocol` (UTCP)
- `code-mode library` + `MCP`
- `QuickJS sandbox agent` / `WASM sandbox tool calls`
- `tool use as code generation`

**Abgrenzung**
- `function calling vs code generation agent`
- `tool catalog context window bloat`
- `MCP context bloat` — führt zu den Gegenargumenten (doppelte Escapes, `outputSchema`)

**Verwandt, aber nicht dasselbe**
- `workflow orchestration agent` (feste Hooks statt freier Code)
- `durable execution agent` (Wiederaufnahme nach Absturz)

---

## 4. Stand im Harness: es heißt PTC und ist da

Der Upstream-Core (`deepseek-harness`) bringt Code Mode vollständig mit. Im Repo liegt er
nur unter anderem Namen, weil er dort als generische Fähigkeit verstanden wird:
**PTC — Programmatic Tool Calling**. Die Umbenennung ist historisch belegt
(`2026-08-25-rename-code-mode-to-ptc`).

| Baustein | Paket | Rolle |
|---|---|---|
| Naht | `dsh-ptc-runtime` | `ctx.ptcRuntime`: `resolve(request)` → `run(spec)`. Sprach- und Isolationsdeskriptoren, keine Sicherheitszusage. |
| Backend | `dsh-ptc-runtime-node` | Frischer Node-Prozess je Lauf, unter der Datei-Sandbox der Session; Deadline, Ausgabegrenzen, V8-Heap-Limit. |
| Verbraucher 1 | `dsh-tools` (`mode: ptc`) | Tool `run_code` plus generiertes SDK; ersetzt die native Schemaliste. |
| Verbraucher 2 | `dsh-workflow-ptc` | Dieselbe Runtime für den `workflow`-Hook-Satz (`agent()`, `parallel()`, `pipeline()`). |

Die Verträge: Programm läuft als Rumpf einer `async`-Funktion (Top-Level-`await` und
`return` verfügbar), Bindings sind verlustfreie JSON-Werte, Fehlerklassen sind orthogonal
(`exception`, `timeout`, `abort`, `worker-exit`, `invalid-output`, `output-limit`,
`protocol`, `sandbox-unavailable`). Kein Zustand über Läufe hinweg — bewusst, damit jede
Anfrage aus dem Session-Log rekonstruierbar bleibt.

**Warum der laufende Agent `run_code` trotzdem nicht sieht:** Die Präsentation ist pro
Agent-Preset wählbar, nicht global.

- `dsh-tools` hat `mode: native` als Vorgabe (jedes sichtbare Tool als eigene Schema-Definition).
- `dsh-agent-tool-presentation` setzt pro Preset `mode: ptc` (nur `run_code` plus SDK).
- Die Web-App liefert vier Presets als eigene Patch-Dateien mit, darunter
  `@deepseek-ai/dsh-web-app/presets/ptc.patch.yml` mit `mode: ptc`.
- Die Registry steht auf `default: standard`; der Standard-Agent hat folglich native Tools.

Aktivierung ist damit eine Auswahl, kein Einbau: **Agent-Preset `ptc`** in den
Einstellungen wählen, oder pro Sitzung. Will man Code Mode als Vorgabe für neue
Sitzungen, setzt man im Home-Patch (`$DSH_HOME/cordis.patch.yml`) die Registry-Zeile:

```yaml
- id: agent-preset-registry
  config:
    default: ptc
```

Das ist reversibel (Zeile entfernen) und betrifft nur neu erzeugte Sitzungen, keine
laufende.

---

## 5. Was hier nicht belegt ist

- **Laufzeit nicht gemessen.** Ob `run_code` in dieser Instanz tatsächlich ausführt, ist
  statisch erschlossen (Pakete vorhanden, Preset im Bundle gelistet, Runtime-Backend
  gemountet), aber nicht durch einen Lauf bestätigt. Ein zweiter Boot zur Prüfung war
  nicht möglich: `bun` und `git` sind in der Sandbox dieser Sitzung über Named Pipes
  blockiert.
- **Der Bun-Vorbereitungscode ist ein Indiz, kein Beweis.** Der Preload meldet
  „PTC-Typentfernung (`module.stripTypeScriptTypes` fehlt)" — jemand hat die Lücke für
  diesen Pfad bereits gestopft. Das zeigt Absicht, nicht Funktion.
- **Das Preset `ptc` ist schlanker als der Standard-Agent.** In seiner Datei sind
  `workflow-ptc` und `tool-workflow` auf `disabled: true` gesetzt. Code Mode ersetzt dort
  also den Workflow-Pfad, er ergänzt ihn nicht.

---

## 6. Einordnung

Code Mode löst ein Problem, das dieses Projekt selbst hat: Der Harness lädt viele Skills,
MCP-Server und Tools. Jeder zusätzliche Server wächst dem Modell in den Kontext. Der
Gegenentwurf — ein Programm, das die Aufrufe bündelt — passt zur Hausregel „der Core bleibt
der Core, alles andere ist eine Unit": `run_code` ist die Unit-fähige Form von
Tool-Nutzung, weil sie die Tool-Liste aus dem Prompt herausnimmt, ohne den Core zu ändern.

Grenzen, die aus den Quellen folgen und für die Planung zählen: kleine Modelle kommen mit
dem Muster schlechter zurecht; MCP-Server liefern oft kein strukturiertes Ergebnis; große
Binärdaten haben keinen sauberen Weg; und Code Mode in Code Mode (Cloudflare-MCP aus einem
Code-Mode-Harness) erzeugt doppelte Escapes. Wer das Muster einführt, sollte zuerst die
Tool-Rückgaben auf `outputSchema` bringen — sonst wird die Sandbox zur Umleitung
unstrukturierter Texte.
