# Stack und Sprachgrenzen

## Die Schichten

```
┌─────────────────────────────────────────────────────────────┐
│  Bedienoberfläche      TypeScript + React                   │
│                        Typecheck mit TypeScript 7           │
├─────────────────────────────────────────────────────────────┤
│  AGENT-CORE            TypeScript auf Bun          ◀ Kernel │
│  (Agent-Loop, Plugin-System, Sessions)                      │
│  Typecheck mit TS 7, Ausführung direkt durch Bun            │
├──────────────┬──────────────────────────┬───────────────────┤
│  Gateway     │  Sandbox + schwere Tools │  Dienste          │
│  Scheduler   │  Rust                    │  Firecrawl,       │
│  Go          │                          │  SearXNG, DB, …   │
└──────────────┴──────────────────────────┴───────────────────┘
```

## Warum TypeScript gesetzt ist — und die Laufzeit die Frage

Das Plugin-System (Cordis) ist JavaScript. Plugins sind JS-Module über `ctx.*`. Ein Core in
einer anderen Sprache könnte sie nicht laden. **TypeScript ist deshalb nicht verhandelbar.**

Die Laufzeit ist offen. Bun führt TypeScript direkt aus, ohne `tsc` — und umgeht damit ein
Problem, das im Referenz-Fork real ist: Dort nutzen 288 Build-Skripte die alte
TypeScript-Compiler-API, die in TS 7 umgezogen ist. Mit Bun schreiben wir diese Skripte
gar nicht erst.

**Typecheck bleibt trotzdem TypeScript 7** — Bun *führt aus*, TS 7 *prüft*. Das ist die
saubere Trennung: keine Transpilation im Weg, aber volle Typprüfung im Gate.

## Go — Gateway, Scheduler, Datei- und Git-Anbindung

**Status: Vorschlag des Betreibers, noch nicht durch Messung belegt.**

Wofür Go wirklich stark ist, deckt sich mit dem, was hier gebraucht wird:

- **Nebenläufigkeit** — viele gleichzeitige Sitzungen, Streams, Verbindungen.
- **Prozess-Supervisierung** — genau das „Dienste starten mit der Harness"-Thema:
  Kindprozesse starten, überwachen, neu starten, sauber beenden.
- **Datei- und Git-Arbeit** — Go hat dafür solide Standardbibliothek.

**Was dagegen spricht, vorab festzulegen:** Das Gateway des Referenz-Harness ist rund
1.600 Zeilen und sein Wert liegt darin, in das Session- und Event-Modell eingepasst zu sein
(Stream-Protokoll, Remote-Events). In Go heißt das: dieselbe Semantik nochmal bauen und
gegen jede Core-Änderung nachziehen.

**Empfehlung:** Den **Startup-Supervisor** zuerst in Go bauen — dort ist der Gewinn
konkret und messbar. Das Gateway erst, wenn Lastmessungen zeigen, dass es der Engpass ist.

## Rust — Sandbox und schwere Werkzeuge

**Status: Vorschlag des Betreibers; stärkster Fall der drei.**

Der Referenz-Harness hat bereits Sandbox-Pakete für Windows-ACL und Landlock (Linux). Das
ist Betriebssystem-Arbeit, wo Rusts Speichersicherheit und FFI-Ergonomie tragen. Für
schwere Werkzeuge (Parsing, Indizierung, Kryptografie) gilt dasselbe.

**Der Vorteil: das Muster existiert schon.** `native/system` im Referenz-Harness ist ein
kleines C-Programm (Dateisperre per `flock`), verpackt als eigenes Paket, vom JS aufgerufen.
Rust braucht kein neues Konzept — nur ein weiteres Paket nach diesem Muster.

## Bun — der offene Punkt

Bun ist **nicht** allein eine TypeScript-Frage. Der Referenz-Harness nutzt native Addons:

| Addon | Wofür | Risiko |
|---|---|---|
| `node-pty` | persistentes Terminal, ConPTY auf Windows | mittel |
| `koffi` | JSONL-Dauerhaftigkeit, `MoveFileExW` mit Write-Through auf Windows | **hoch** |

`koffi` ist besonders kritisch: Der Referenz-Harness baut es **aus dem Quellcode**, weil
Prebuilts unter GCC 13 scheitern (steht so in dessen `pnpm-workspace.yaml`). Ob beide
Addons unter Bun laufen, ist **ungeprüft**. Das ist die erste Messung, die ansteht —
siehe [risks.md](risks.md).

## C — bleibt im Werkzeugkasten

Der Referenz-Harness beweist, dass eine minimale C-Komponente als Paket funktioniert. Für
sehr kleine, abhängigkeitsfreie Systemaufrufe (Dateisperren, Handle-Vererbung) ist C
weiterhin die einfachste Wahl. Kein Zwang, alles nach Rust zu ziehen.

## Die Regel, die alles zusammenhält

> **Der JS-Core bleibt der Kernel. Jede andere Sprache ist ein Dienst, den er aufruft.**

Solange das gilt, ist jede Sprachgrenze einzeln verschiebbar: ein Dienst kann in Go
entstehen, später nach Rust wandern oder umgekehrt — ohne dass der Core sich ändert.
