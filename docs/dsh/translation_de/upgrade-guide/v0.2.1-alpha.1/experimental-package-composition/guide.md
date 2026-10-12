---
kind: upgrade-guide
description: "Explizite Installation, Peer-Abhängigkeiten und Konfiguration für optionale Hooks, Webhooks, Tools und Skills."
---

# Explizite Installation und Komposition für optionale Capabilities

English | [中文](guide.zh.md)

## Änderung

Die CLI und die Python-Runtime lassen die Hook-Bridges aus ihren Installationsabhängigkeiten weg, und die CLI lässt das Webhook-Paar weg. Die Presets base und das vollständige Web lassen dormante Ralph-Zeilen weg, und base lässt seine dormante Badge-Zeile weg. Ein Patch, der nur eine entfernte Zeile aktiviert, fügt deren Plugin nicht ein. Das standardmäßig aktive Verhalten, die Plugin-Registrierungsnamen, Tool-Namen und aufgezeichneten Session-Event-Namen bleiben unverändert.

Paket-Ownership und -Benennung folgen der [Richtlinie für experimentelle Pakete](../../../../scripts/experimental-package-policy.ts). Installation und Komposition sind getrennt: Ein Plugin-Paket zu installieren mountet es nicht, und ein Bundle muss ausgewählt sein, bevor seine beigesteuerten Zeilen konfiguriert werden können.

## Migration

1. Alle im Zielprofil fehlenden Pakete samt ihren erforderlichen Peers installieren. Profile deaktivieren die automatische Peer-Installation. Zum Beispiel `dsh plugin --profile web add @deepseek-ai/dsh-hooks-claude-code @deepseek-ai/dsh-hook-protocol` ausführen. Die Codex-Bridge braucht denselben Protokoll-Peer; der GitHub-Adapter braucht `@deepseek-ai/dsh-webhook` neben `@deepseek-ai/dsh-webhook-github`.
2. Ein verfügbares Bundle auswählen, bevor dessen Zeilen überschrieben werden. Bei einer manuell komponierten Capability einen Override einer entfernten Zeile durch eine vollständige Einfügung ersetzen. Preset-lokale Tools innerhalb von `config.plugins` dieses Presets hinzufügen, einschließlich der von ihnen benötigten Services. Eine Host-Badge-Einfügung lautet:

   ```yaml
   - insert:
       - id: skill-badge
         name: '@deepseek-ai/dsh-skill-badge'
   ```

3. Für GitHub-Review das mit dem Adapter ausgelieferte Beispiel statt des entfernten CLI-Beispiels verwenden. Den [Anweisungen für installierte Profile](../../../user/guide/github-review.md) folgen; angepasste Regelmodule im Profil belassen, damit ihre Importe dessen installierte Pakete auflösen.
4. Das Profil starten und bestätigen, dass seine konfigurierten Plugins ohne Fehler über fehlende Pakete, fehlende Peers oder fehlende Zeilen aktivieren. Bestätigen, dass das erwartete Tool oder Skill im vorgesehenen Agent-Preset verfügbar ist.
