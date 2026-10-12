---
kind: upgrade-guide
description: "dsh plugin liest --profile nur vor den weitergeleiteten pnpm-Argumenten und gibt eine eigene Hilfe aus."
---

# Platzierung der Optionen von `dsh plugin`

English | [中文](guide.zh.md)

## Änderung

`dsh plugin` liest `--profile` nur vor den weitergeleiteten pnpm-Argumenten, die beim ersten nicht erkannten Token beginnen, und hat eine eigene Hilfe. Zuvor akzeptierte es `--profile <name>` an jeder Stelle der Kommandozeile, hatte keine eigene Hilfe und leitete `-h` und `--help` von jeder Position an pnpm weiter.

Wenn die weitergeleiteten Argumente mit dem pnpm-Befehl beginnen, erreicht jetzt alles nach diesem Befehl pnpm wörtlich, einschließlich `-h`, `--help` und `--profile`. An jeder anderen Position, einschließlich nach einer führenden pnpm-Option wie `--filter <selector>`, gibt `-h` oder `--help` die Hilfe von `dsh plugin` aus und beendet mit 0. Skripte, die `--profile` nach dem pnpm-Befehl oder nach einer führenden pnpm-Option platzieren, schlagen mit `required option '--profile <name>' not specified` fehl, und `dsh plugin --profile <name> --help` gibt nicht mehr die Hilfe von pnpm aus.

## Migration

1. `--profile <name>` vor jedes pnpm-Argument verschieben: `dsh plugin add <package> --profile <name>` durch `dsh plugin --profile <name> add <package>` ersetzen.
2. Die Hilfe von pnpm für einen Befehl nach diesem Befehl anfordern, mit allen pnpm-Optionen ebenfalls danach, wie in `dsh plugin --profile <name> add --help`. Für die allgemeine Hilfe von pnpm `help` weiterleiten: `dsh plugin --profile <name> help`.
3. Bestätigen, dass `dsh plugin --help` `Usage: dsh plugin [options] [args...]` ausgibt und dass die Befehle aus Schritt 1 und 2 pnpm erreichen.
