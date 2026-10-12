---
kind: upgrade-guide
description: "Agent Teams entfernt sein Limit für ausstehende Messages und stellt historisch eingereihte Mail nicht mehr zu."
---

# Agent-Teams-Messages verwenden Ziel-Posteingänge

English | [中文](guide.zh.md)

## Änderung

Das experimentelle Plugin Agent Teams sendet neue Messages direkt an den Posteingang des Ziel-Agent, statt ein separates Team-Postfach zu führen. `send_message` gibt nur `{ "sent": true }` zurück; es legt weder eine Message-ID noch einen Status `accepted` oder `queued` offen. Die Annahme bestätigt weder Modellverarbeitung noch ein synchrones Schreiben in den Speicher. Fehlgeschlagene Sendevorgänge werden nicht für einen erneuten Versuch behalten, und explizite erneute Sendevorgänge werden nicht dedupliziert.

Der Konfigurationsschlüssel `maxPendingMessagesPerMember` wird entfernt. Historische Datensätze `team/message/queued` und `team/message/delivered` bleiben lesbar, aber eingereihte Messages, die vor dem Upgrade nicht zugestellt wurden, werden nie versendet. Roster- und Aufgabenzustand bleiben dauerhaft.

## Migration

1. Vor dem Upgrade ausstehende Team-Messages abschließen lassen und bestätigen, dass ihre Ziele sie empfangen haben. Nach dem Upgrade jede erforderliche nicht zugestellte Message explizit erneut senden; zuerst die Historie des Ziels prüfen, um Duplikate zu vermeiden. Historische Session-Datensätze nicht bearbeiten.
2. `maxPendingMessagesPerMember` aus der Plugin-Konfiguration von `@deepseek-ai/dsh-experimental-agent-team` in der eigenen `cordis.yml` oder in Overlays entfernen. Es gibt kein ersetzendes Team-Queue-Limit; `maxMessageBytes` begrenzt weiterhin jede vollständige sender-gerahmte Message.
3. Jeden Konsumenten der `send_message`-Ergebnisse darauf umstellen, `sent` statt Message-IDs oder Zustellstatus zu lesen, und Sendefehler explizit behandeln. Erfolg nicht als abgeschlossene Zielarbeit behandeln. Der Service `ctx.agentTeams.sendMessage()` gibt weiterhin `messageId` zurück.
4. Das Team-fähige Profil starten, eine Message an ein anderes Mitglied senden und bestätigen, dass das Tool `{ "sent": true }` zurückgibt und das Ziel sie empfängt. Die [Paketreferenz](../../../../packages/experimental/agent-team/README.md#use-this-package) für die Zustellsemantik heranziehen.
