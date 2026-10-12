---
kind: upgrade-guide
description: "Die Tool-Präsentation akzeptiert native oder ptc; der gemischte Modus both wird zurückgewiesen."
---

# Native oder PTC-Tool-Präsentation wählen

English | [中文](guide.zh.md)

## Änderung

Die `mode`-Felder von `@deepseek-ai/dsh-tools` und `@deepseek-ai/dsh-agent-tool-presentation` akzeptieren nur `native` oder `ptc`. Der Wert `both` wird zurückgewiesen. Dies betrifft auch `DSH_TOOLS_MODE=both`, das die Tool-Konfiguration über die ausgelieferten Profil-Patches bereitstellt.

`native` legt sichtbare Tools als direkte Funktionsaufrufe offen. `ptc` legt `run_code` offen; Programme rufen die sichtbaren Tools über das generierte SDK auf. Verschiedene Agent-Presets können in derselben Anwendung weiterhin verschiedene Modi verwenden.

## Migration

1. In `cordis.yml`, im Profil-`cordis.patch.yml` oder in einem eigenen Overlay `mode: both` durch `mode: native` für direkte Aufrufe oder `mode: ptc` für programmgestützte Aufrufe ersetzen.
2. `DSH_TOOLS_MODE=both` durch `DSH_TOOLS_MODE=native` oder `DSH_TOOLS_MODE=ptc` ersetzen. Für eine preset-spezifische Auswahl stattdessen die Zeile `@deepseek-ai/dsh-agent-tool-presentation` des Presets aktualisieren.
3. Code, der `ctx.tools.presentAs('both')` aufruft, auf die Auswahl von `native` oder `ptc` umstellen. In PTC-Programmen die Aufrufe innerhalb von `run_code` halten; die SDK-Funktionsnamen nicht als direkte Modell-Tool-Aufrufe ausgeben.
4. Das betroffene Profil starten und bestätigen, dass die Konfiguration lädt. Native Anfragen legen die erlaubten direkten Tools offen; PTC-Anfragen legen `run_code` und dessen SDK-Instruktionen offen.
