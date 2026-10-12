---
kind: upgrade-guide
description: "Session-Titel-Provider registrieren sich direkt, besitzen ihre Strategie-Einstellungen und teilen nur die vorbereitete Ausführung."
---

# Session-Titel-Provider migrieren

English | [中文](guide.zh.md)

## Änderung

`@deepseek-ai/dsh-session-title-llm` exportiert `registerSessionTitleLlmProvider`, `generateSessionTitleWithLlm` und `SessionTitleLlmMessageSelector` nicht mehr. `SessionTitleLlmConfig` enthält jetzt nur noch Ausführungs-Steuerelemente (`maxInputBytes`, `maxOutputTokens`, `timeoutMs` und das optionale Paar `provider`/`model`); `targetWords` und `targetCjkCharacters` sind in die eigene `Config` jedes Providers gewandert. Jeder Provider besitzt seine Systeminstruktion, sein Message-Framing, sein Titel-Parsing, seine Reasoning-Auswahl und seine Output-Interpretation, registriert sich direkt mit `ctx.sessionTitle.register()` und ruft `executeSessionTitleLlm(ctx, config, request, providerId, { system, input, messageSeqs, selectReasoningEffort })` auf. Diese Funktion gibt die zusammengesetzten Content-Blöcke, den terminalen Finish und die verwendete Modell-Route zurück. `SessionTitleProviderRequest` erhält einen optionalen `currentTitle`-Schnappschuss.

## Migration

1. Einen Aufruf von `registerSessionTitleLlmProvider(...)` durch ein direktes `ctx.sessionTitle.register({ id, automatic, generate })` ersetzen; dieselbe `id` und Kadenz beibehalten.
2. In `generate(request)` einen eigenen System-Prompt und eigene Nutzereingabe aufbauen, eine `selectReasoningEffort`-Funktion übergeben und dann `executeSessionTitleLlm` mit `{ system, input, messageSeqs, selectReasoningEffort }` aufrufen.
3. Einen terminalen Finish `tool-calls` oder `max-tokens` sowie Tool-Aufruf-Blöcke zurückweisen; den Titel aus den Textblöcken ableiten.
4. `request.currentTitle` lesen, wenn die Strategie einen akzeptierten Provider-Titel bewahren soll; vor jedem Titel fehlt es.
5. Einen Titel generieren und das gespeicherte Ergebnis samt dem exakten Datensatz `session/title-llm-request` bestätigen.
