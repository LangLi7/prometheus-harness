---
name: prometheus-package
description: Zieht Fähigkeiten (Skills) und Pakete (Units) des Prometheus Harness nach. Bestand holen, in den Benutzer-Scope verknüpfen, eine einzelne Fähigkeit nachinstallieren, Units prüfen. Anwenden bei "Skill nachinstallieren", "Paket fehlt", "Bestand aktualisieren", "pmh-package", "prometheus package".
license: MIT
---

# Prometheus Package

Nach der Installation startet der Harness, aber es fehlt etwas. Die Fähigkeiten
liegen in `units/skills` (eigenes Repository), die Pakete in `packages/` und
`harness/units.json`. Dieser Skill zieht beides nach, ohne Neuinstallation.

## Woher der Bestand kommt

| Was | Wo | Quelle |
|---|---|---|
| Fähigkeiten | `units/skills` | `https://github.com/LangLi7/pmh-skills` |
| Benutzer-Scope | `~/.agents/skills` | Verknüpfungen dorthin |
| Pakete (Units) | `harness/units.json` | im Harness-Repo |

Fähigkeiten sind Inhalte, keine Kernpakete. Sie haben eine eigene Historie, eine
eigene Lizenz und einen eigenen Takt. Der Harness liest sie über den
Benutzer-Scope, nicht über `node_modules`.

## 1. Fähigkeiten holen oder aktualisieren

```sh
# vorhanden? dann aktualisieren
git -C units/skills pull --ff-only

# sonst holen
git clone --depth 1 https://github.com/LangLi7/pmh-skills.git units/skills
```

## 2. Verknüpfen

Ohne Verknüpfung liegt der Bestand nur auf der Platte. Der Harness liest
`~/.agents/skills`; dort steht je Fähigkeit ein Verweis, keine Kopie.

```powershell
# Windows
pwsh -NoProfile -File units/skills/link-skills.ps1
```

```sh
# Linux und macOS
sh units/skills/link-skills.sh
```

Beide überspringen vorhandene Verknüpfungen und fassen nichts an, was keine
Verknüpfung ist. Danach zählen:

```sh
ls ~/.agents/skills | wc -l
```

Der Katalog wird beim Start gelesen. Eine laufende Sitzung sieht neue
Fähigkeiten erst nach dem Neustart.

## 3. Eine einzelne Fähigkeit

Der Klon enthält alles. Wer nur eine Fähigkeit braucht, verweist nur sie:

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.agents\skills\<name>" `
  -Target "$(Resolve-Path units/skills/<name>)"
```

```sh
ln -s "$(pwd)/units/skills/<name>" "$HOME/.agents/skills/<name>"
```

Für Sammlungen (mehrere Fähigkeiten in einem Baum, etwa `pstack` oder
`ui-skills`) liegt die Fähigkeit eine Ebene tiefer:
`units/skills/<sammlung>/skills/<name>`.

## 4. Pakete und Units

Die Units sind der laufende Bestand. `harness/units.json` deklariert sie.

```sh
bun run units:host     # beweist: Generation -> mount -> Weg -> unmount
bun run gen            # Unit-System: erzeugen, prüfen, quittieren
bun run typecheck      # die Typen der Pakete
bun test packages      # die Prüfungen der Pakete
```

Fehlt nach einem `git pull` ein Paket, ist der Weg nicht "einzeln
nachinstallieren", sondern:

```sh
bun install
bun run install:alles -- --ohne-stapel
```

## 5. Grenzen

- Der Benutzer-Scope ist ein Ort, kein Besitz. Liegt dort schon eine echte
  Datei gleichen Namens, wird sie nicht überschrieben. Die Ausgabe sagt es.
- `index.json` schreibt nur das PowerShell-Skript. Unter Linux fehlt die
  Gruppierung nach Sammlung im Web-Client. Die Fähigkeiten selbst sind da.
- Ein Klon ist kein Update. `pull --ff-only` scheitert bewusst, wenn lokal etwas
  geändert wurde. Dann ist Nachsehen richtiger als Überschreiben.
- Es gibt keinen entfernten Katalog, aus dem eine Fähigkeit einzeln geladen
  wird. Die Quelle ist das Repository als Ganzes.

## Wenn etwas fehlt

| Befund | Ursache | Weg |
|---|---|---|
| `~/.agents/skills` ist leer | nicht verknüpft | Schritt 2 |
| Fähigkeit doppelt | zwei Quellen, gleicher Name | die Ausgabe nennt beide; eine Verknüpfung entfernen |
| `units/skills` fehlt nach `git pull` | eigenes Repository, nicht Teil des Klons | Schritt 1 |
| `bun run units:host` rot | Generation oder Port | Ausgabe lesen; Port belegt heißt: warten |
