---
title: "MiroFish — synthetische Zielgruppe für Websites"
stand: 2026-10-27
tags:
  - pmh/subsystem
  - pmh/skills
---

# MiroFish — synthetische Zielgruppe für Websites

## Kurzfassung

`666ghj/MiroFish` ist eine Schwarm-Simulations-Engine: Seed-Material rein,
Persona-Graph, hunderte Agenten in einer Twitter-/Reddit-Umgebung, Report raus.
Für PMH ist der sinnvolle Einsatz **Website-Tests vor dem Launch**: Wie kommt
Versprechen, Preis und Beweis an — und welche Einwände dominieren?

Das Plugin liegt in `integrations/mirofish` und wird über den Marketplace
installiert. Es enthält **keinen** MiroFish-Code; MiroFish bleibt ein separater
Dienst (AGPL-3.0).

```bash
bun apps/cli/src/main.ts plugin marketplace add ./integrations/mirofish
bun apps/cli/src/main.ts plugin install mirofish@mirofish
```

Ergebnis: Skill `mirofish` plus die Commands `mirofish-check`, `mirofish-seed`,
`mirofish-simulate`, `mirofish-report` (als Skills materialisiert).

## Warum ein Plugin und kein Kopieren

- **AGPL-3.0**: Codeübernahme würde das Harness infizieren. HTTP-Nutzung nicht.
- **Schwer**: Python 3.11–3.12, `uv`, Node 18+, Zep Cloud, LLM-Zugang. Das ist
  ein Dienst, kein Skill.
- **Eigener Lebenszyklus**: Der Dienst wird gestartet, benutzt, gestoppt; das
  Plugin liefert Prüfung, Seed und Auswertung.

## Ablauf

1. **Prüfen** — `mirofish-check` nennt Python, Node, `uv`, `.env`, fehlende
   Schlüssel und die Dienste. Backend wird über die Signatur
   `service: "MiroFish Backend"` erkannt; ein fremder Dienst auf 5001 gilt als
   Blocker, nicht als grünes Häkchen.
2. **Seed** — `mirofish-seed` zieht `design.md`, `README.md`, `index.html` oder
   eine URL und legt ein Dossier an. Die TODO-Felder (Zielgruppen, Beweise,
   Preis-Einwand, Wettbewerber) füllt der Agent aus dem Projekt.
3. **Simulation** — im Frontend: Projekt, Graph, Simulation, 20–30 Runden,
   Report. `mirofish-simulate` führt durch den Ablauf und nennt Abbruchkriterien.
4. **Auswertung** — `mirofish-report` übersetzt den Report in höchstens fünf
   Design-Entscheidungen; das Ergebnis geht nach `design.md` §7 mit dem Hinweis
   „synthetische Simulation".

## Ports

Backend 5001, Frontend 3000. Ist 5001 belegt, hilft `FLASK_PORT` im Backend und
`VITE_API_BASE_URL` im Frontend; das Skript liest `MIROFISH_BACKEND_URL` und
`MIROFISH_FRONTEND_URL`. Am 27.10.2026 antwortete auf 5001 ein **anderer** Dienst
(`{"status":"ok"}` ohne MiroFish-Signatur) — der Seed-Lauf ist deshalb blockiert,
bis der Port frei ist.

## Kosten und Grenzen

- Jeder Lauf kostet LLM-Tokens und Zep-Kontingent. Erst 20–30 Runden, wenige
  Personas.
- Synthetische Reaktionen sind **Hypothesen**, keine Messungen. Kein Ersatz für
  Analytics, Usability-Tests oder Conversion-Daten.
- Keine personenbezogenen Daten in den Seed. Keine Authentifizierung am Backend:
  nicht ins Internet stellen.
- Ohne `LLM_API_KEY` und `ZEP_API_KEY` startet das Backend nicht (Config-Prüfung
  in `run.py`).

## Dateien

| Datei | Aufgabe |
|---|---|
| `plugin/skills/mirofish/SKILL.md` | Wann, wie, Grenzen |
| `plugin/commands/*.md` | check, seed, simulate, report |
| `plugin/scripts/mirofish.mjs` | Prüfen, Seed, `.env`-Vorlage, Health |
| `plugin/references/api.md` | HTTP-Endpunkte für automatisierte Läufe |
| `README.md` | Installation und Voraussetzungen |
