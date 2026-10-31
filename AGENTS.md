# Projektregeln — Prometheus Harness

## Codebase Memory

- **Graphify und Obsidian sind komplementär, keine Alternativen.** Graphify liefert
  Codefakten („wo wird X benutzt?"), Obsidian liefert Absicht und Verlauf („warum
  haben wir das so entschieden?"). Eine Aufgabe darf und soll beide nutzen.
- **Graph vor Code-Suche.** Bei Architektur-, Refactoring- oder „wo wird X benutzt?"-Fragen
  zuerst den Graphify-Graphen über die MCP-Werkzeuge `mcp__graphify__*` fragen
  (`query_graph`, `get_node`, `get_neighbors`, `shortest_path`, `god_nodes`,
  `graph_stats`), dann nur die genannten Dateien lesen.
- **Obsidian vor Entscheidungen.** Wenn eine Aufgabe frühere Entscheidungen, Notizen oder
  Projektwissen betrifft, zuerst `obsidian_search` und `obsidian_read` benutzen.
- **Schreiben nur auf Auftrag.** `obsidian_write` und Änderungen an Quelldateien nur, wenn
  der Nutzer es ausdrücklich verlangt; vorher lesen und den Pfad nennen.
- **Graph aktuell halten.** Nach strukturellen Änderungen `graphify extract . --code-only`
  (oder `graphify update .`) laufen lassen. Den Graphen nicht ungefragt committen.
- **Rückfall ist erlaubt.** Fehlt der Graph oder der Vault, sag es und nutze `grep`/`read`.
- Diese Regel gilt zusätzlich zur `codebase-memory`-Skill; bei Konflikt gilt die direkte
  Nutzeranweisung.

## Vor dem Merge

- **Prüfliste und Vorgehensweise: `docs/status/vor-dem-merge.md`.** Lesen, bevor eine
  Änderung `main` erreicht, und immer dann, wenn ein Prüfbefehl rot ist.
- **Drei Ursachen, nicht eine.** Ein roter Lauf ist Code, Umgebung oder Flattern. Erst
  die Meldung lesen und klassifizieren, dann reparieren.
- **„Nicht messbar" ist eine zulässige Antwort.** Ein Punkt ohne Beleg wird als nicht
  geprüft berichtet, nicht als bestanden.

## Kein Slop

Die zehn Vorgaben stehen in `docs/status/slop-vorgaben.md`; sie kommen aus der Beleglage in
`docs/research/ai-slop-code-2026.md`. Kurzfassung, verbindlich:

- **Kleinster Schnitt.** Eine Änderung, ein Zweck; `git diff --stat` nennt nur die Dateien,
  die der Zweck braucht.
- **Prüfung, die rot werden kann.** Jede Verhaltensänderung bekommt eine Gegenprobe, die
  ohne sie scheitert. Ein immer grüner Test ist keine Prüfung.
- **Lesbar ohne Rückfrage.** Namen sagen die Absicht; `any`, `as` und `@ts-ignore` sind
  Stummschaltungen und brauchen einen Satz Begründung.
- **Keine erfundenen Namen.** Feld-, Typ- und Werkzeugnamen werden an der Quelle gelesen;
  neue Abhängigkeiten nur mit geprüfter Quelle und gepinnter Fassung.
- **Provenienz.** Was ein Modell erzeugt hat, wird als erzeugt benannt — samt dem, was
  geprüft und was verworfen wurde.
- **Review ist kein Gate.** Ein Modellkommentar ist ein Hinweis; Anmeldung, Kryptographie,
  Zahlungen und Datenzugriff gibt ein Mensch frei, der den Code erklären kann.
- **Der Wächter läuft vor dem Merge.** `bun run check:slop --range main...HEAD` prüft drei
  maschinell messbare Punkte: Typ-Stummschaltung, Diff-Größe, Abhängigkeit ohne Sperrdatei.
  Ein Fund blockiert, bis er behoben oder mit `slop-ok: <Grund>` an der Zeile benannt ist.

Ein Verstoß ist keine Stilfrage. Er blockiert den Merge, bis er behoben oder mit Datum und
Grund als Ausnahme benannt ist.
