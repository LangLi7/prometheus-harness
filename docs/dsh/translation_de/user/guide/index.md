# Die Web-UI verwenden

English | [中文](index.zh.md)

Die Web-UI wird über die [Root-README](../../../README.md#run) gestartet; der Befehl gibt ihre URL aus. Diese Anleitung beginnt, nachdem dieser Server läuft. Der `dsh`-Prozess verwendet sein Aufrufverzeichnis als Standard-Dateisystemort, aber eine frische Web-UI hat keinen ausgewählten Workspace, bis einer hinzugefügt wird.

## Ein Modell konfigurieren

**Settings → Models** öffnen, einen [DeepSeek-API-Schlüssel](https://platform.deepseek.com/) eingeben und speichern. Die Modell-Route wird sofort nutzbar, ohne den Server neu zu starten.

Die [Anleitung zur Modellkonfiguration](./providers.md) behandelt weitere Provider und benutzerdefinierte OpenAI-kompatible Endpunkte.

## Einen Workspace auswählen

Auf **Choose workspace** klicken, das Projektverzeichnis hinzufügen, in dem `dsh` gestartet wurde, und es auswählen. Der Session-Composer bleibt nicht verfügbar, bis ein Workspace ausgewählt ist.

## Eine Aufgabe ausführen

Eine Session starten und senden:

> Dieses Repository zusammenfassen und seine Hauptpakete identifizieren.

Der Agent kann Workspace-Dateien lesen und bearbeiten, Befehle ausführen, Arbeit delegieren und einen Plan pflegen. Die Web-UI fragt vor Operationen nach, die gemäß der aktiven Berechtigungsrichtlinie eine Freigabe erfordern.

## Fortsetzen

- [Modelle konfigurieren](./providers.md)
- [Das Python-SDK verwenden](./python-sdk.md)
- [Die Web-UI hinter einem Reverse-Proxy veröffentlichen](./public-deployments.md)
- [Weitere CLI-Modi verwenden](../../../apps/cli/README.md)
- [Ein Plugin entwickeln](../develop/basic/index.md)
