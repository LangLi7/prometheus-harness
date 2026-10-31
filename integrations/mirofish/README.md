# MiroFish — Website-Tests mit synthetischer Zielgruppe

Ein Claude-kompatibles Plugin für Prometheus Harness. Es macht aus einer Website
ein Seed-Dossier, führt MiroFish als Zielgruppen-Simulation aus und übersetzt den
Report in Design-Entscheidungen.

**Was es nicht ist:** ein Crawler, ein Analytics-Ersatz oder ein Conversion-
Prognosewerkzeug. MiroFish simuliert Meinungen; es misst keine Nutzer.

## Installation

```bash
bun apps/cli/src/main.ts plugin marketplace add ./integrations/mirofish
bun apps/cli/src/main.ts plugin install mirofish@mirofish
```

Danach stehen die Skill `mirofish` und vier Commands im Katalog
(`mirofish-check`, `mirofish-seed`, `mirofish-simulate`, `mirofish-report`).

## Voraussetzungen

- MiroFish separat klonen: `git clone https://github.com/666ghj/MiroFish.git C:\Users\Chang\MiroFish`
- `MiroFish/.env` mit `LLM_API_KEY` (OpenAI-kompatibel) und `ZEP_API_KEY`
- Node 18+, Python 3.11–3.12, `uv` oder Docker

```bash
bun "$DSH_HOME/plugins/mirofish/mirofish/scripts/mirofish.mjs" check --dir C:\Users\Chang\MiroFish
```

## Benutzung

```bash
# Seed aus Projekt oder URL
bun "$DSH_HOME/plugins/mirofish/mirofish/scripts/mirofish.mjs" seed ./mein-projekt --out mirofish-seed.md

# .env-Vorlage (überschreibt nichts)
bun "$DSH_HOME/plugins/mirofish/mirofish/scripts/mirofish.mjs" env-template --dir C:\Users\Chang\MiroFish
```

Dann im Frontend Projekt anlegen, Graph bauen, Simulation starten (20–30 Runden),
Report erzeugen — die Commands führen durch den Ablauf.

## Lizenz

MiroFish ist **AGPL-3.0**. Dieses Plugin enthält keinen MiroFish-Code; es spricht
nur über HTTP mit dem separaten Dienst. Diese Plugin-Dateien stehen unter MIT.
