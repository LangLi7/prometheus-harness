---
kind: upgrade-guide
description: "Die Bundles Claude Code und Codex ergänzen globale Delegations-Tools und behalten dabei ihre Paket- und Zeilenidentitäten."
---

# Native Subagent-Bundles enthalten globale Tools

English | [中文](guide.zh.md)

## Änderung

`@deepseek-ai/dsh-subagent-claude-code` und `@deepseek-ai/dsh-subagent-codex` behalten ihre Paketnamen, Bundle-Auswahlen, Provider-Zeilen-IDs, Konfiguration und native Authentifizierung. Ein ausgewähltes Bundle registriert jetzt zusätzlich sein Delegations-Tool als Host-globales Tool, sichtbar für jedes Preset einschließlich minimal; zuvor registrierte das Bundle nur seinen Provider. Live-Agents sehen das Tool ab ihrer nächsten Anfrage, nachdem das Bundle aktiviert wurde, und verlieren es, nachdem das Bundle ausgeschaltet wurde.

Die beigesteuerten Host-Zeilen sind `tool-subagent-claude-code` und `tool-subagent-codex`. Spätere Nutzerschichten können ihre Konfiguration oder ihren Disabled-Zustand per Zeilen-id überschreiben. Ein Override wählt kein nicht ausgewähltes Bundle aus. Ein Preset, das sein eigenes Tool mit demselben Namen registriert, verdeckt das globale Tool für seine Agents.

Die Delegation folgt der gemeinsamen Managed-Activation-API: Das Tool gibt eine Kind-ID zurück, und der Abschluss kommt als protokollierte Mitteilung beim Parent-Agent an. Veraltete `backgroundMode`-Einstellungen entfernen; `maxDepth: provider-managed` bleibt für diese nativen Provider unterstützt.

## Migration

1. Ausgewählte Bundle-Namen, Provider-Konfiguration und Authentifizierung beibehalten. Bestehende reine Provider-Pakete benötigen **Update** in Plugins → Official, um das Tool-beisteuernde Bundle zu erhalten; bei Aufforderung neu starten. Um einen neuen Provider zu übernehmen, seine Karte aktivieren. [Installationsziele](../../../../packages/boot/plugin-manager/README.md#use-this-package) folgen der veröffentlichten DSH-Version oder dem Source-Checkout; gleiche Versionszeichenketten machen ein älteres Registry-Paket nicht einem Entwicklungs-Link gleichwertig. Off deselektiert nur; Remove bleibt getrennt.
2. Das Tool mit einem gewöhnlichen Zeilen-Patch konfigurieren. Konfigurations-Overrides ersetzen weiterhin die vollständige Konfiguration. Zum Beispiel hält dies das Codex-Tool deaktiviert, während der Provider registriert bleibt:

   ```yaml
   - id: tool-subagent-codex
     disabled: true
   ```

3. Wenn eine manuelle Host-Zeile denselben Tool-Namen registriert, diese redundante Zeile entfernen oder die Zeile des Bundles deaktivieren. Den effektiven Tool-Katalog in einer Session verifizieren.
4. Plugin-Clients erhalten die erforderlichen Felder `BundleInfo.official` und `BundleInfo.availability`; Detail-Slot-`PluginPackageRef` erhält sie ebenfalls. `official` kennzeichnet Projektpflege, `availability` meldet `installation`, `profile` oder `missing`, und `installed` bedeutet weiterhin eine Abhängigkeitsdeklaration des Profils. Detail-Slot-Leser, die nur vorhandene Felder anzeigen, benötigen keine Änderungen; Konstruktoren und exakte Validatoren müssen die neuen Felder aufnehmen. Das optionale `installTarget` kennzeichnet die angebotene Version und die Registry- oder lokale Link-Spezifikation.

**Andere Profile.** Die Bundle-Layer fügen nur Host-Zeilen ein, daher können headless-, SDK-, ACP- und eigene Profile sie ebenfalls auswählen. Profile, die das Provider-Paket behalten, ohne dessen Bundle auszuwählen, können dieselben Zeilen über das Beispiel [Codex](../../../../packages/subagent/subagent-codex/README.md#exposing-the-tool) oder [Claude Code](../../../../packages/subagent/subagent-claude-code/README.md#exposing-the-tool) komponieren.
