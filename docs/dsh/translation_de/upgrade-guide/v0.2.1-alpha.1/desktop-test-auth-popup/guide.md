---
kind: upgrade-guide
description: "Desktop-Testbuilds erfordern ein lokales Opt-in, bevor sie Authentifizierungsdialoge der Feishu-Update-Richtlinie anzeigen."
---

# Authentifizierungsdialoge der Test-Update-Richtlinie lokal aktivieren

English | [中文](guide.zh.md)

## Änderung

Testbuilds boten zuvor nach einem nicht authentifizierten Start oder einer manuellen Prüfung der Update-Richtlinie die Feishu-Anmeldung an. Alle Test-Authentifizierungsdialoge sind jetzt standardmäßig deaktiviert, einschließlich manueller Prüfungen und Aktualisierungen für Pflicht-Updates. Test-Gateway-Cookies überleben keinen Neustart. Bei deaktivierter Anmeldung kann ein Gateway, das Authentifizierung verlangt, keine neuen Entscheidungen zu Pflicht-Updates liefern; die Einstellung aktivieren, neu starten und anmelden, um sie zu erhalten. Authentifizierungsfehler behalten jede im selben Prozess bereits bekannte Pflicht-Sperre bei; Richtlinienanfragen der Produktion und die Produktkonto-Anmeldung bleiben unverändert.

## Migration

1. Die aktualisierte Anwendung einmal starten, um `app.getPath('userData')/desktop/settings.json` anzulegen, falls sie fehlt. Bestehende Dateien bleiben erhalten, und ein fehlendes Feld hat die Vorgabe `false`. Plattformpfade und Fehlerbehebung siehe [lokale Desktop-Einstellungen](../../../../apps/desktop/README.md#local-desktop-settings).
2. Um die Feishu-Anmeldung zu erlauben, `updates.allowTestAuthPopupWindow` in dieser Datei auf `true` setzen, dann Desktop vollständig beenden und neu starten. Eine nicht authentifizierte Antwort der Test-Richtlinie kann nun eine Anmeldung anbieten. Die Vorgabe unverändert lassen, wenn keine Anmeldedialoge gewünscht sind.
3. Um die Dialoge wieder zu deaktivieren, das Feld auf `false` setzen und neu starten. Start und manuelle Prüfungen dürfen keine Feishu-Authentifizierungsdialoge zeigen. Updates fragen weiterhin die Richtlinie ab, und Authentifizierungsfehler heben eine bekannte Pflicht-Sperre nicht auf.
