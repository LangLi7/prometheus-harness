# Defensive Muster

Englisch | [中文](defensive-patterns.zh.md)

Hart erarbeitete Regeln zu Fehlerklassen: Jedes der folgenden Muster steht für eine Klasse von Defekten, die hier tatsächlich ausgeliefert wurde oder beinahe ausgeliefert worden wäre — formuliert als die Regel, die ihre Wiederkehr verhindert. Vor dem Schreiben von Lifecycle-, Nebenläuftigkeits-, Subprozess- oder Teardown-Code lesen. Die Gegenstücke auf Testebene (realer Einstiegspfad, Verifikation in der realen Umgebung, Ressourcen-Eigentümerschaft) stehen in [testing.md](testing.md).

## Orthogonale Ergebnisse unabhängig melden

Ein Ergebnis kann mehrere Dinge gleichzeitig sein — ein Prozess kann in ein Timeout laufen UND mit 0 beenden, weil er das Signal abgefangen hat. Jeden unabhängigen Sachverhalt (`timedOut`, `signal`, `exitCode`) für sich melden; niemals die Meldung eines Flags in den Zweig eines anderen verschachteln, sonst liest ein Aufrufer einen abgebrochenen Lauf als sauberen Erfolg.

## Öffentliche Verträge auf BEIDEN Seiten einhalten

Wenn eine Implementierung mehrere Repräsentationen eines Ergebnisses erhält, diese normalisieren, bevor über die öffentliche API zurückgegeben wird. Implementierungen von `LlmAdapter.stream()` dürfen werfen oder `finish {kind:'error'|'aborted'}` emittieren, aber `LlmRuntime.stream()` legt Fehler bei Modellanfragen ausschließlich als abschließende Finish-Chunks offen; Defekte in Middleware und Konsumenten werden weiterhin geworfen. Das verhindert, dass Konsumenten raten müssen, ob eine gefangene Ausnahme vom Provider, von einem Wrapper, von der Chunk-Protokollierung oder aus ihrer eigenen Assemblierung stammt. Den normalisierten Vertrag dort dokumentieren, wo der Typ definiert ist; jede Quellform über den realen Konsumenten ausüben.

## Asynchroner Zustand ist kein synchroner Zustand

`agent.followup()` hat keinen Abschluss und kein Ergebnis pro Nachricht; der Abschluss eines Hintergrund-Jobs läuft mit Turn-Grenzen um die Wette; `reader.close()` wird sowohl bei EOF als auch bei Disposal ausgelöst. `agent/status` oder `whenIdle()` niemals als Ergebnis eines einzelnen Follow-up behandeln: Mehrere in der Warteschlange stehende Follow-ups, Steering und injizierte Arbeit können sich ein `running`-Intervall teilen, während Abbruch oder Disposal noch nicht gestartete Einträge verwerfen können. Ein Automation-Aufrufer, der einen Lauf wirklich besitzt, muss sein Intervall ausdrücklich definieren — beispielsweise von der dauerhaften Inbox-Quittung seiner Nachricht bis zum nächsten `idle` des gesamten Agenten — und jede ausgewählte Ausgabe als intervallweit beschreiben statt als kausal dieser Nachricht zugeordnet. Die Absicherung schneidet in beide Richtungen: Wenn der erwartete Übergang niemals eintreten kann, hängt das Warten, also den Zweig „nichts zu erwarten" ausdrücklich behandeln.

## Dispose muss Ruhe erreichen, nicht nur anfordern

Ein Teardown, der Kills/Aborts auslöst, aber zurückkehrt, bevor die Arbeit aufhört, hinterlässt Waisen. Das Aufräumen asynchron machen und das Beenden der Kindprozesse abwarten (kill → `done` abwarten), und Listener-/Benachrichtigungs-Registries VOR dem Killen schließen, damit späte Abschlüsse still bleiben.

## Callback-Ausnahmen im Dispatcher eindämmen

Die Ausnahme jedes Listeners abfangen und melden, ohne das Dispatch-Promise abzulehnen oder spätere Listener auszuhungern. Der Eigentümer des Listeners muss den Zustand behandeln, den er gemäß den [error-handling rules](../.agents/skills/dsh-error-handling/SKILL.md#catch-recover-or-stop) verändert; bloßes Abfangen stellt den Zustand nicht wieder her.

## Untrusted Output niemals die umgebende Umgebung oder vorhersagbare Pfade überlassen

Gestartete Befehle bekommen eine bereinigte Env (entferne `*KEY*`/`*SECRET*`/`*TOKEN*`/`*PASSWORD*`), damit Harness-Anmeldedaten nicht in die Ausgabe, in `env` oder in Spill-Dateien gelangen können. Temp-/Spill-Dateien verwenden ein privates Verzeichnis (0700), zufällige Namen und exklusive, nur für den Eigentümer zugängliche Opens (`'wx'`, `0o600`) — vorhersagbare, weltweit lesbare Pfade laden Symlink-Races und Offenlegung ein.

## Link-förmige Pfade unlinken

Ein Pfad, der ein Symlink oder eine Windows-Junction sein kann, wird mit `lstatSync().isSymbolicLink()` und dann `unlinkSync` entfernt: unlink löscht nur den Link und verweigert ein echtes Verzeichnis, folgt also niemals dem Link in sein Ziel. Unter Windows wirft `rmSync(link)` bei einer Junction `ERR_FS_EISDIR`; rekursives Löschen kann durch eine Junction hindurch in deren Ziel absteigen. Rekursives `rmSync` für bekannt echte Verzeichnisse reservieren.
