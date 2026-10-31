---
name: repo-reverse
description: Erzeugt aus einem öffentlichen GitHub-Repository einen einzigen natürlichsprachlichen Prompt, mit dem man dasselbe Projekt von Grund auf bauen würde — über den Dienst gitreverse. Verwende diese Skill bei „wie würde man das bauen", „schreib mir den Prompt für so eine App", „reverse zu einem Prompt", wenn ein fremdes Projekt als Bauanleitung statt als Code gebraucht wird, oder wenn ein Ausgangspunkt für einen Nachbau gesucht ist.
---

# repo-reverse — vom Repo zum Bau-Prompt

## Was es ist

gitreverse liest Metadaten, README und den Dateibaum der ersten Ebene eines Repos und lässt ein Modell daraus **einen** kurzen, umgangssprachlichen Prompt schreiben — so, wie jemand ihn in Cursor oder Claude Code eintippen würde, um das Projekt nachzubauen.

Das Ergebnis ist eine **Absichtsbeschreibung**, kein Code und keine Spezifikation.

## Der eine Befehl

```bash
bun "<plugin>/scripts/repo-intel.mjs" reverse owner/repo
```

`<plugin>` ist das installierte Plugin-Verzeichnis (`plugins/repo-intel/repo-intel` unter dem Harness-Home); die Skill `repo-digest` nennt den vollen Pfad.

Schreibt den Prompt nach `.repo-intel/<owner>-<repo>.reverse-prompt.md` und gibt ihn aus.

## Wofür das taugt — und wofür nicht

| Zweck | geeignet |
|---|---|
| Einstieg in ein fremdes Produkt verstehen | ja |
| Ausgangspunkt für einen eigenen Nachbau | ja, als erste Skizze |
| Prüfen, ob die Idee in einem Absatz erklärbar ist | ja |
| Funktionsumfang ableiten | nein, der Prompt ist absichtlich knapp |
| Technische Entscheidungen nachlesen | nein |
| Code oder Architektur | nein — dafür `repo-digest` und `repo-map` |

**Der entscheidende Punkt:** Der Prompt entsteht aus README und Dateibaum der ersten Ebene, nicht aus dem Quelltext. Alles, was das Projekt tut, ohne es in der README zu erwähnen, fehlt — und alles, was die README großspurig verspricht, steht drin. Behandle das Ergebnis als **Marketing in Prompt-Form**, nicht als Fakten.

## Reihenfolge, wenn du ein fremdes Projekt verstehen willst

1. `repo-map` — die Karte, billig.
2. `repo-reverse` — die Absicht in einem Absatz.
3. `repo-digest` — der Code; das Einzige, was belastbar ist.

## Grenzen

- **Fremder Dienst, kein SLA.** Der Aufruf geht an `https://www.gitreverse.com/api/reverse-prompt`. Ratenbegrenzung ist möglich; HTTP 429 bedeutet „später erneut" oder „nutze den lokalen Digest".
- **Nur öffentliche Repos.** Kein Token, keine privaten Repositories.
- **Der Text wird an einen fremden Dienst geschickt** (Repository-Name, README-Inhalt, Dateibaum). Nichts Vertrauliches damit analysieren.
- **Ein einzelner Prompt**, keine Dateien. Er ist als Startpunkt gedacht, nicht als Ergebnis.

## Dateien

- `scripts/repo-intel.mjs` — `reverse`.
- `.repo-intel/*.reverse-prompt.md` — die erzeugten Prompts.
