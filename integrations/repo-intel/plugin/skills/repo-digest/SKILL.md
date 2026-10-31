---
name: repo-digest
description: Verwandelt ein fremdes Git-Repository in einen Text-Digest, den ein Modell lesen kann — lokaler Lauf über gitingest, ohne Web-Oberfläche, mit harter Grenze für den Kontext. Verwende diese Skill, wenn ein Repository als Ganzes in den Kontext soll („fasse dieses Repo zusammen", „lies die Codebasis", „was steht in owner/repo"), wenn gitingest genannt wird, oder wenn ein Repository verglichen oder durchsucht werden soll, ohne es zu klonen und jede Datei einzeln zu öffnen.
---

# repo-digest — Repository als Text

## Was es ist

Ein Digest ist **eine Textdatei**: Verzeichnisbaum, dann jede Datei mit Pfad und Inhalt. gitingest klont das Repository flach, filtert nach `.gitignore`, lässt Binärdateien und große Dateien weg und schreibt das Ergebnis in eine Datei.

Das ist die Grundlage für jede Arbeit an fremdem Code: Du siehst die Struktur vollständig und kannst gezielt nachlesen, statt zu raten, welche Dateien es gibt.

**Nicht dafür:** Ausführen des Codes, Tests, Abhängigkeitsauflösung. Der Digest ist Text, keine Umgebung.

## Wann es sich lohnt

| Frage | Digest |
|---|---|
| „Wie ist dieses Repo aufgebaut?" | ja, der Baum ist vollständig |
| „Wo wird X definiert?" | ja, `grep` in der Datei |
| „Lohnt es sich, das zu übernehmen?" | ja, mit `--include` auf die Kernpfade |
| „Warum ist der Test rot?" | nein, dazu braucht es den echten Lauf |
| „Was macht dieses Repo zur Laufzeit?" | nein, nur Text |

## Der eine Befehl

```bash
bun "<plugin>/scripts/repo-intel.mjs" digest owner/repo
```

`<plugin>` ist das installierte Plugin-Verzeichnis. Es endet auf `plugins/repo-intel/repo-intel` unterhalb des Harness-Home; das Skript liegt dort unter `scripts/repo-intel.mjs`. Wenn der Pfad unklar ist, finde ihn einmalig:

```bash
ls "$DSH_HOME"/plugins/repo-intel/repo-intel/scripts/repo-intel.mjs
```

Das schreibt `.repo-intel/<owner>-<repo>.digest.txt` und zeigt **nur** Zusammenfassung und Verzeichnisbaum. Der vollständige Text bleibt in der Datei.

### Kontext klein halten

Der Digest ist oft größer als der Kontext. Drei Regeln:

1. **Nie die ganze Datei in den Kontext laden.** Erst den Baum lesen, dann mit `grep`/`read` gezielt in die Datei springen.
2. **Vor dem Lauf eingrenzen**, wenn das Repo groß ist:

```bash
bun "<plugin>/scripts/repo-intel.mjs" digest owner/repo \
  --include "src/*" --include "*.md" \
  --exclude "test/*" --exclude "dist/*" --exclude "*.lock" \
  --max-size 102400
```

3. **Budget für den Baum** ist 40.000 Zeichen; `--budget 8000` kürzt ihn weiter.

### Private Repositories

```bash
export GITHUB_TOKEN=ghp_...
bun "<plugin>/scripts/repo-intel.mjs" digest owner/private-repo
```

Kein Token in die Befehlszeile schreiben — `--token` landet in der Prozessliste. Das Skript liest `GITHUB_TOKEN` aus der Umgebung.

### Lokales Verzeichnis

```bash
bun "<plugin>/scripts/repo-intel.mjs" digest --local ./mein-projekt
```

## Wenn gitingest fehlt

```bash
bun "<plugin>/scripts/repo-intel.mjs" setup
```

Legt ein venv unter `.repo-intel/venv` an und installiert gitingest über `uv`. Danach findet das Skript es selbst — keine Umgebungsvariable nötig.

`check` nennt jeden fehlenden Punkt einzeln und endet mit Exit-Code 1, solange etwas blockiert:

```bash
bun "<plugin>/scripts/repo-intel.mjs" check
```

## Grenzen

- **Der Digest ist eine Momentaufnahme.** Er enthält den Commit, den gitingest ausgecheckt hat; die Zusammenfassung nennt ihn, wenn vorhanden.
- **Keine Ausführung.** Der Code im Digest ist Text; verhaltensbezogene Aussagen brauchen einen echten Lauf.
- **`.gitignore` gilt.** Dateien, die dort stehen, fehlen — auch wenn sie im Repo liegen.
- **Sehr große Repos** brauchen `--include`/`--exclude`; ohne Eingrenzung bricht der Lauf am Timeout ab (Standard: 300 s).
- **Named Pipes:** gitingest öffnet für seinen Logger einen Named Pipe. In einer Sandbox, die Pipes verbietet, scheitert schon der Import. Das Skript meldet das als Berechtigungsgrenze, nicht als fehlendes Werkzeug.

## Dateien

- `scripts/repo-intel.mjs` — `digest`, `check`, `setup`.
- `.repo-intel/*.digest.txt` — die erzeugten Digests (Arbeitsverzeichnis).
