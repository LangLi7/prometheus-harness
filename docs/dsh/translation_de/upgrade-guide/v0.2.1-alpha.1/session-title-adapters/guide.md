---
kind: upgrade-guide
description: "Eigene Titel-Routen erfordern registrierte Adapter und Reasoning-Efforts in aufsteigender Reihenfolge."
---

# Eigene Titel-Routen vorbereiten

English | [中文](guide.zh.md)

## Änderung

Modellgestützte Session-Titel bereiten ihre Anfragen über `ctx.llm.prepareCall()` vor. Kompositionen, die Titel-Routen nur über `llm/stream`-Middleware bedienen, müssen zusätzlich einen Adapter registrieren. Eigene Adapter müssen auswählbare Reasoning-Efforts vom geringsten zum größten auflisten, nicht in beliebiger Anzeigereihenfolge. Die Titel-Richtlinie wählt den ersten Eintrag über eine Konfigurationsfunktion. Bestehende konkrete `prepareCall()`-Eingaben bleiben gültig.

## Migration

1. Die Titel-Route mit `ctx.llm.registerAdapter()` registrieren. Replay-Kompositionen können die `providers`-Liste des bestehenden Plugins `llm-replay` konfigurieren.
2. In den Modellmetadaten des Adapters `reasoning.efforts` vom geringsten zum größten auswählbaren Effort ordnen. Dieselbe Reihenfolge auf `reasoningEfforts` der Replay-Modelle anwenden. Die konfigurierte Vorgabe unabhängig von der Listenreihenfolge halten. Reasoning-Metadaten weglassen, wenn die Route keine auswählbaren Steuerelemente hat.
3. Einen Titel generieren und prüfen, dass `session/title-llm-request` den ausgewählten Effort aufzeichnet und ein Provider-Titel gespeichert wird. Bestehende Session-Datensätze ohne dieses optionale Feld bleiben lesbar.
