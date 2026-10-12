---
kind: upgrade-guide
description: "Eigene TerminalBlock-Konsumenten müssen lokalisierte barrierefreie Namen für überlaufende Befehlszeilen bereitstellen."
---

# Beschriftungen von Terminal-Befehlen

English | [中文](guide.zh.md)

## Änderung

`TerminalBlockLabels` aus `@deepseek-ai/dsh-client-ui-primitives` erfordert einen Formatierer `commandLine(line: number): string`. Zuvor gaben Aufrufer keinen barrierefreien Namen für Befehlszeilen an. Jede horizontal überlaufende Zeile verwendet jetzt diesen Namen für ihre per Tastatur fokussierbare Gruppe; Zeilen, die passen, einschließlich umgebrochener Zeilen, fügen keinen Tab-Stopp hinzu. Dies betrifft eigene UI-Plugins, die `TerminalBlock` rendern.

## Migration

1. `commandLine` zu jedem Labels-Objekt hinzufügen, das an `TerminalBlock` übergeben wird. Das Argument ist die verfasste Zeilennummer, beginnend bei eins.
2. Einen lokalisierten Namen wie „Befehlszeile 1" über das Locale-Wörterbuch des Plugins zurückgeben. Den ursprünglichen Befehlstext von diesem Namen getrennt halten.
3. Das Plugin neu bauen. Verifizieren, dass ein langer Befehl Tastaturfokus erhalten und mit den Pfeiltasten gescrollt werden kann und dass ein kurzer oder umgebrochener Befehl keinen Tab-Stopp hinzufügt.
