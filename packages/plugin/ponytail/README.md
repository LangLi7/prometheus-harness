# @prometheus-harness/ponytail

Ponytail als **DSH-Plugin**: ein Prompt-Abschnitt, ein Skill, ein Schalter.

> *„The best code is the code you never wrote."* — die Leiter von „muß das überhaupt
> existieren?" bis „das Minimum, das funktioniert", ohne Abstriche an Validierung,
> Fehlerbehandlung, Sicherheit und Barrierefreiheit.

## Was es tut

| Teil | Wirkung |
|---|---|
| **Prompt-Abschnitt** `pmh:ponytail` | wirkt in **jeder** Antwort — Ponytails Bauart ist „active every response" |
| **Skill** `ponytail` | im Katalog, ladbar über das `skill`-Werkzeug; trägt Beispiele, Prüfwege und Stufen |
| **Route** `GET/POST /api/pmh/ponytail` | liest und setzt den Zustand |
| **Pill im Composer** | `conversation.input.left`, ein Knopf |

## Der Schalter

`off` · `lite` · `full` · `ultra` — gespeichert in `~/.pmh/ponytail.json`
(`PMH_HOME` → `~/.pmh`; **nie** `~/.dsh`, das gehört dem anderen Harness).

- **Klick** — an oder aus. Beim Einschalten kommt die letzte Stufe zurück, sonst `full`.
- **Alt+Klick** — nächste Stufe (`off → lite → full → ultra → off`).

`off` heißt wirklich aus: der Prompt-Abschnitt **und** der Skill werden abgemeldet. Es bleibt
keine Erinnerung im Prompt und kein Eintrag im Katalog.

## Datei

```json
{ "modus": "full", "updatedAt": "2026-10-21T15:00:00.000Z" }
```

Fremde Felder in derselben Datei bleiben stehen; ein `{"enabled": false}` der
Claude-Code-Installation wird gelesen, nicht überschrieben.

## Prüfen

```bash
bun test --cwd packages/plugin/ponytail      # 18 Prüfungen, ohne Host
bun packages/plugin/ponytail/build.mjs       # Browser-Hälfte + Formprüfung
bun run typecheck --cwd packages/plugin/ponytail
```

Die Tests bauen einen Ersatz-Kontext mit `systemPrompt`, `skills` und `webServer` und beweisen
die eine Behauptung, die zählt: **`off` meldet beides ab.**

## Grenzen

- Der Pill wirkt **nach dem nächsten Start** des Hosts — die Browser-Startliste entsteht beim
  Start, nicht beim Neuladen der Seite.
- Der Zustand ist **pro Rechner**, nicht pro Sitzung: er ist eine Eigenschaft des Hosts.
