---
kind: upgrade-guide
description: "Die Modell-Erkennung über den DeepSeek-API-Schlüssel erfordert eine konfigurierte Credential."
---

# Sichtbarkeit von DeepSeek-Modellen über den API-Schlüssel

English | [中文](guide.zh.md)

## Änderung

Die Route `deepseek-official` listete zuvor ihre konfigurierten Modelle ohne API-Schlüssel auf. Sie gibt jetzt einen leeren Katalog zurück, wenn ihre Credential fehlt, sodass Desktop und Web die Gruppe DeepSeek ausblenden. Die Modell-Erkennung meldet fehlerhafte Credentials und Fehler beim Nachschlagen von Credentials. Eine gespeicherte oder vorgegebene Auswahl, die im Katalog fehlt, zeigt „Select model" an, ohne die gespeicherte Auswahl zu ändern. Die unabhängige Route für das DeepSeek-Konto verwendet weiterhin die Kontoanmeldung.

## Migration

1. Um die API-Schlüssel-Route zu verwenden, ihren Schlüssel unter Settings → Models konfigurieren oder die von `apiKeyEnv` benannte Referenz (Vorgabe `DEEPSEEK_API_KEY`) über die Startumgebung bereitstellen.
2. Die Modellauswahl erneut öffnen und bestätigen, dass die Gruppe DeepSeek erscheint. Eigene Konsumenten der Erkennung müssen einen leeren Katalog handhaben, bevor Credentials konfiguriert sind; das Auflisten von Modellen belegt nicht, dass die entfernte API den Schlüssel akzeptiert.
