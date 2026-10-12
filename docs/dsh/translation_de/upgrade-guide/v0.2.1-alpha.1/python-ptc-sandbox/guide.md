---
kind: upgrade-guide
description: "Python-PTC-Kompositionen erfordern Sandbox-Services, und direkte Python-Dateioperationen folgen der aufgelösten Dateirichtlinie."
---

# Python PTC wendet die gemeinsame Datei-Sandbox an

English | [中文](guide.zh.md)

## Änderung

`@deepseek-ai/dsh-experimental-ptc-runtime-python` erfordert `sandbox` und `sandboxPolicy`. Zuvor liefen direkte Python-Dateioperationen ohne Einschränkung, und der Provider wies explizite `sandboxPolicy`-Eingaben zurück. Jetzt wendet er die gemeinsame Richtlinie auf jedes Programm an und meldet die Einschränkung in `PtcRunResult.sandbox`. Ein eingeschränkter Lauf schlägt mit `sandbox-unavailable` fehl, wenn die Einschränkung nicht hergestellt werden kann.

Dies betrifft eigene Kompositionen, die die Python-Runtime auswählen. Ausgelieferte Profile verwenden weiterhin die Node-Runtime. Python bleibt auf macOS oder Linux beschränkt; seine konfigurierten Ressourcenbudgets und die nicht unterstützten Timeout-Overrides pro Aufruf bleiben unverändert.

## Migration

1. In der `cordis.yml` oder dem Profil-Patch, der die Python-Runtime auswählt, die bestehenden gemeinsamen Sandbox-Services beibehalten. Wenn sie fehlen, `@deepseek-ai/dsh-sandbox-local` und `@deepseek-ai/dsh-sandbox-policy` samt ihrem erforderlichen Service `@deepseek-ai/dsh-session-projection` mounten. Siehe die [Anforderungen der Python-Runtime](../../../../packages/experimental/ptc-runtime-python/README.md#use-this-package).
2. Für agentlose Aufrufe `mode` und `workspaceRoot` der gemeinsamen Zeile `sandbox-policy` setzen. Ihr Standardmodus ist `read-only`; `workspace-write` erlaubt Schreibzugriffe im Workspace. PTC-Tool-Aufrufe verwenden die aufgelöste Richtlinie und das Verzeichnis der Session. Keine separate Python-only-Sandbox-Einstellung hinzufügen.
3. Direkte Service-Aufrufer verwenden `runtime.run(runtime.resolve(request))`; eine vertrauenswürdige `sandboxPolicy` nur übergeben, wenn ein expliziter Override erforderlich ist. Das modellgerichtete `run_code` verwendet den bestehenden Freigabeablauf für einen einmalig weiteren Modus, ohne die Berechtigungen verschachtelter Tools zu ändern oder das Programm automatisch erneut auszuführen.
4. Verifizieren, dass ein Programm unter `workspace-write` innerhalb des vorgesehenen Workspace schreiben kann, außerhalb davon nicht schreiben kann und `result.sandbox.mode` und `result.sandbox.enforcement` zurückgibt. Unter `read-only` schlagen direkte Dateischreibvorgänge fehl. `sandbox-unavailable` getrennt von einer verweigerten Dateioperation prüfen und die lokale Sandbox-Installation reparieren, bevor erneut versucht wird.
