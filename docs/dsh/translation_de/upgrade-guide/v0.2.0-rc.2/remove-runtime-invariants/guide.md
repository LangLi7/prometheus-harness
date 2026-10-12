---
kind: upgrade-guide
description: "Das Runtime-Invariant-Registry-Paket und der `./invariant`-Subpath-Export jedes Pakets werden entfernt."
---

# Runtime-Invariant-Plugins werden entfernt

English | [中文](guide.zh.md)

## Änderung

In v0.2.0-rc.2 stellte `@deepseek-ai/dsh-invariants` den Service `ctx.invariants` bereit, und Workspace-Pakete wie `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-agent`, `@deepseek-ai/dsh-scope` und `@deepseek-ai/dsh-agent-loop` veröffentlichten `./invariant`-Begleitplugins, die dort Checks registrierten. Das Profil `sdk-minimal` mountete fünf dieser Zeilen mit den ids `invariants`, `session-invariant`, `agent-invariant`, `scope-invariant` und `agent-loop-invariant`.

Das nächste Release veröffentlicht `@deepseek-ai/dsh-invariants`, `InvariantRegistry`, `InvariantInstaller`, `InvariantFailure`, `InvariantError` und jeglichen `<package>/invariant`-Subpath nicht mehr. Das Profil `sdk-minimal` enthält die fünf Zeilen nicht mehr. Die Emitter `credentials/reference-updated`, `credentials/record-updated`, `authorization/settled` und `llm/adapters-updated` fangen jeden Listener-Fehler ab und protokollieren ihn, einschließlich Fehlern mit `code: 'INVARIANT'`, statt sie erneut auszuwerfen.

Ein `cordis.yml`, Patch oder Overlay, das ein entferntes Modul benennt, kann es nicht laden. Ein Patch, der auf eine der fünf `sdk-minimal`-ids zielt, protokolliert `patch: entry <id> not found`. TypeScript-Code, der ein entferntes Modul oder Symbol importiert, kompiliert nicht mehr.

## Migration

1. Zeilen, deren `name` `@deepseek-ai/dsh-invariants` ist oder auf `/invariant` endet, aus `cordis.yml`, `$DSH_HOME/profiles/<name>/cordis.patch.yml` und `--patch`-Overlays löschen.
2. Patch-Einträge löschen, die auf die ids `invariants`, `session-invariant`, `agent-invariant`, `scope-invariant` oder `agent-loop-invariant` zielen.
3. `@deepseek-ai/dsh-invariants` aus den `package.json`-Abhängigkeiten entfernen und Importe davon sowie von `<package>/invariant`-Subpaths löschen. Ein Plugin, das sich auf einen erneut ausgeworfenen `INVARIANT`-Fehler von einem der vier Emitter verlassen hat, muss den Fehler über seinen eigenen Kanal melden.
4. Bestätigen: `dsh` startet das Profil ohne Modul-nicht-gefunden-Fehler oder Warnung `patch: entry ... not found`, und `tsc` meldet kein fehlendes Modul und keinen fehlenden Export.
