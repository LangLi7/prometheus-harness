---
kind: upgrade-guide
description: "Verwaltete Subagent-Aktivierungen ersetzen Foreground- und Job-gestützte Delegation, deren Konfigurationsschlüssel und den veröffentlichten In-Process-Treiber."
---

# Delegation auf verwaltete Subagent-Aktivierungen migrieren

English | [中文](guide.zh.md)

## Änderung

`@deepseek-ai/dsh-tool-subagent` entfernt `backgroundMode`, `enableRunInBackground` und das Modellargument `run_in_background`. Jede Delegation gibt jetzt `{ kind: 'activation', subagentId }` zurück, nachdem sie das Kind angenommen hat, und die Runtime liefert seine finale Antwort in einer Abschlussmitteilung an den Parent. Foreground-Ergebnisse und `{ kind: 'background', jobId }`-Ergebnisse werden entfernt; Subagents werden nicht mehr über `job_output` oder `job_kill` eingesammelt oder gestoppt.

Das veröffentlichte Paket `@deepseek-ai/dsh-subagent-in-process-driver` wird entfernt. Lokale Provider steuern Erzeugungseingaben über `prepareContinuable()` bei; der Subagent-Service besitzt die Ausführung. Spawn- und Fork-Kinder können spätere Messages empfangen, auch nach dem Abschluss, wenn Persistenz und Session-Abfrage verfügbar sind. Externe Provider führen einmal aus und akzeptieren keine Folge-Messages.

## Migration

1. `backgroundMode` und `enableRunInBackground` aus den Zeilen `tool-subagent` in `cordis.yml`, Profil-Patches und Overlays entfernen. Den Provider und die übrige Konfiguration beibehalten. Zum Beispiel:

   ```yaml
   - name: '@deepseek-ai/dsh-tool-subagent'
     config:
       provider: spawn
       toolName: subagent
   ```

   Lokale Tool-Delegation erfordert Session-Persistenz. Sie mit dem [Subagent-Service und Provider](../../../../packages/subagent/subagent/README.md#use-this-package) komponieren.

2. `run_in_background` aus Tool-Aufrufen entfernen und Ergebnis-Konsumenten darauf umstellen, `subagentId` zu lesen. Die Abschlussmitteilung statt Foreground-Output oder eines Job-Ergebnisses einsammeln. `interrupt_agent` verwenden, um die aktuelle Ausführung zu stoppen; `send_message` nur für lokale Kinder verwenden, wenn diese Steuertools komponiert sind.

3. Bei Host-Code, der auf ein Ergebnis warten muss, `ctx.subagents.start()` oder `startContinuable()` durch `startActivation()` und Caller-Delivery ersetzen. Gegeben einen komponierten Service und einen lebenden Parent:

   ```ts
   import type { Agent } from '@deepseek-ai/dsh-agent'
   import type SubagentRuntime from '@deepseek-ai/dsh-subagent'

   async function collect(subagents: SubagentRuntime, parent: Agent, signal: AbortSignal) {
     const activation = await subagents.startActivation({
       provider: 'spawn',
       label: 'Review changes',
       request: { parent, prompt: [{ type: 'text', text: 'Review these changes.' }] },
       signal,
       delivery: 'caller',
     })
     const result = await activation.result
     await activation.dispose()
     return result
   }
   ```

   Caller-Delivery gibt keine Abschlussmitteilung an den Parent aus. `result` wird nach dem Cleanup eingelöst und enthält `output`, `stopReason` sowie optionale Werte `structured` und `diagnostic`; `stopReason` prüfen, bevor das Ergebnis als Erfolg behandelt wird. Das Startsignal besitzt die Abbruchsherrschaft nach der Veröffentlichung nicht mehr: den Beleg behalten und `dispose()` aufrufen, um genau diese Aktivierung abzubrechen. Cleanup-Fehler werden von `dispose()` getrennt vom erfassten Ergebnis gemeldet.

4. Die Treiber-Abhängigkeit und deren Importe entfernen, einschließlich `startInProcessRun`. Den bestehenden Spawn- oder Fork-Provider mounten und den Service wie oben aufrufen. Eigene lokale Provider implementieren `prepareContinuable()` anhand der [Provider-API](../../../../docs/subsystems/subagent.md); es gibt keinen ersetzenden eigenständigen Treiber.

   Externe Provider behalten `start()`, aber jede zurückgegebene `SubagentRun.id` muss über Parents, Provider und lokale Sessions in der Runtime hinweg eindeutig sein. Für jede Ausführung eine frische id generieren, statt einen parent-lokalen Zähler zu verwenden.

   Für `dsh-subagent-dsh-sdk` jede separat konfigurierte `dshBin`-Runtime aktualisieren, damit sie `session/wait` unterstützt. Für die Verzeichniskonfiguration der [Migration des Arbeitsverzeichnisses](../working-directory/guide.md) folgen.

5. Bestätigen, dass eine Delegation die Aktivierungsergebnis-Variante zurückgibt, ihre Abschlussmitteilung die finale Antwort enthält und Caller-Delivery das Ergebnis zurückgibt, ohne diese Mitteilung hinzuzufügen. Bestätigen, dass lokale Kinder nach dem Abschluss weiterhin gelistet bleiben und externe Kinder nicht fortgesetzt werden können.
