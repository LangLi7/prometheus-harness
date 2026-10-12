---
kind: upgrade-guide
description: "Messages-Mock-Streams veröffentlichen benannte SSE-Events für native SDK-Konsumenten."
---

# Benannte Events vom Messages-Mock-Server lesen

English | [中文](guide.zh.md)

## Änderung

Das nächste Release lässt `@deepseek-ai/dsh-llm-mock-server` den Namen des Messages-Events neben jeder strukturierten SSE-Nutzlast ausgeben. Native SDKs benötigen diese Namen, um Message- und Content-Block-Events zu verarbeiten. Konsumenten, die nur unbenannte SSE-Messages akzeptieren, müssen ihre Event-Behandlung anpassen. Skriptgesteuerte Nutzlasten, Reihenfolge, Request-Erfassung und Chunk-Anzahlen bleiben unverändert; das absichtlich fehlerhafte JSON-Verhalten sendet seine ungültigen Daten weiterhin direkt.

## Migration

1. Die benannten Messages-Events konsumieren und ihre `data`-Felder parsen. Den Stream nicht auf unbenannte Events filtern.
2. Eine vollständige Textantwort, eine Tool-Aufruf-Antwort und die Fehlerverhalten, die der Test verwendet, verifizieren. Die [Referenz zum Mock-Server](../../../../packages/test-support/llm-mock-server/README.md) beschreibt die verfügbaren Skripte.
