---
name: repo-map
description: Holt die Architektur eines fremden GitHub-Repositorys als Markdown — Überblick, Mermaid-Diagramm, Komponenten mit Dateipfaden und ihre Verbindungen, erzeugt von gitdiagram. Verwende diese Skill bei „wie ist dieses Repo aufgebaut", „zeig mir die Architektur von owner/repo", „welche Teile hat das Projekt", „wie hängen die Module zusammen", oder wenn ein Architekturdiagramm als Text (Mermaid) gebraucht wird, ohne das Repo zu klonen.
---

# repo-map — Architektur als Text

## Was es ist

gitdiagram liest Dateibaum, README und eine Stichprobe von Quelldateien und erzeugt daraus eine Architekturbeschreibung: Überblick, ein Mermaid-Diagramm, Komponenten mit ihren Dateipfaden, und die Verbindungen zwischen ihnen.

Für einen Agenten ist das der schnellste Weg zu einer belastbaren Karte, **bevor** der Digest gelesen wird: Du weißt danach, welche Pfade relevant sind, und kannst `repo-digest --include` genau darauf setzen.

**Nicht dafür:** Beweise über Verhalten. Das Diagramm ist von einem Modell erzeugt, aus einer Stichprobe. Es ist eine Hypothese über die Struktur, keine Messung.

## Der eine Befehl

```bash
bun "<plugin>/scripts/repo-intel.mjs" map owner/repo
```

`<plugin>` ist das installierte Plugin-Verzeichnis (`plugins/repo-intel/repo-intel` unter dem Harness-Home); die Skill `repo-digest` nennt den vollen Pfad.

Quelle ist `https://gitdiagram.com/<owner>/<repo>.md` — die Markdown-Fassung des Diagramms. Sie wird zusätzlich unter `.repo-intel/<owner>-<repo>.architecture.md` abgelegt.

Die Ausgabe nennt das Datum der letzten Erzeugung. **Prüfe es.** Ein Diagramm von vor sechs Monaten beschreibt ein anderes Repository.

## Wenn kein Diagramm existiert

HTTP 404 heißt: Für dieses Repo wurde noch keins erzeugt. Dann gibt es zwei Wege:

1. Die Seite einmal im Browser öffnen — das erzeugt es, danach funktioniert der Befehl.
2. Den MCP-Server von gitdiagram nutzen, der frisch generiert:

```bash
bun apps/cli/src/main.ts mcp add gitdiagram --url https://gitdiagram.com/mcp --profile web
```

Der MCP-Server braucht keinen Schlüssel und liefert Architektur, Komponenten, Verbindungen und Mermaid-Quelltext als strukturierte Werkzeugantworten. Er ist die bessere Wahl, wenn du **eine frische** Antwort brauchst oder mehrere Repos vergleichst.

## Wie du das Ergebnis benutzt

1. **Überblick lesen**, um die Begriffe des Projekts zu lernen.
2. **Komponenten mit Pfaden** als Landkarte nehmen — die Pfade sind anklickbar und echt.
3. **Mermaid** unverändert weitergeben, wenn ein Diagramm gebraucht wird; nicht selbst neu zeichnen.
4. **Gegen den Digest prüfen**, sobald eine Aussage eine Entscheidung trägt. Das Diagramm behauptet, `route.ts` rufe `graph.ts`; der Digest zeigt, ob das stimmt.

## Grenzen

- **Von einem Modell erzeugt.** Die Markdown-Fassung sagt das selbst: aus Dateibaum, README und einer Stichprobe. Unbeprobte Pfade fehlen.
- **Kann veralten.** Das Datum steht in der Datei; ohne Datum nicht verwenden.
- **Nur öffentliche Repos.** Private Repositories brauchen die Web-Oberfläche mit Token; dieser Befehl kennt keinen Token.
- **Fremder Dienst.** Kein SLA, Ratenbegrenzung möglich, Antworten können sich ändern. Kein Ersatz für das Lesen des Codes.

## Dateien

- `scripts/repo-intel.mjs` — `map`.
- `.repo-intel/*.architecture.md` — die abgelegten Karten.
