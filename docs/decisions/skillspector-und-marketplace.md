---
title: "Entscheidung — SkillSpector und Plugin-Marketplace in Prometheus"
bereich: "decisions"
stand: 2026-10-26
tags:
  - pmh/decision
  - pmh/skills
  - pmh/security
---

# Entscheidung — SkillSpector und Plugin-Marketplace in Prometheus

## Kurzfassung

Zwei neue Pakete, eine Kommandofläche. **SkillSpector** prüft Fähigkeiten und
Plugins vor der Installation; der **Marketplace** liest das Claude-Code-Format und
installiert daraus. Beides läuft im Harness, ohne Python und ohne LLM.

```bash
pmh skill scan <pfad> [--format terminal|json|markdown|sarif]
pmh skill install <owner/repo | pfad> [--global] [--force] [--strict]
pmh skill list
pmh plugin marketplace add <quelle>
pmh plugin install <name>@<marketplace> [--force] [--strict] [--mcp]
pmh plugin list
pmh mcp add <name> --url <url> [--optional] | -- <befehl…>
pmh mcp list | remove
```

## Entscheidungen und Gründe

| Entscheidung | Grund |
|---|---|
| **Nativer Scanner statt Python-Aufruf** | Python ist auf diesem Wirt nicht verlässlich startbar (Sandbox/Pipes), und ein Sicherheitswerkzeug, das eine fremde Laufzeit braucht, fällt genau dann aus, wenn es gebraucht wird. |
| **Gleiches Risikomodell wie NVIDIA** | `CRITICAL +50`, `HIGH +25`, `MEDIUM +10`, `LOW +5`, ×1,3 bei ausführbaren Bestandteilen, Bänder 0–20/21–50/51–80/81–100. Zahlen bleiben mit fremden Berichten vergleichbar. |
| **Kein LLM im Scanner** | Der optionale semantische Schritt des Vorbilds würde Dateiinhalte an einen Anbieter senden. `llmAvailable` ist deshalb immer `false`. |
| **Zwei Gate-Politiken** | `strict` bildet das Vorbild ab; `balanced` (Vorgabe des Installers) blockt Absicht, warnt bei Fähigkeit. Ohne die Unterscheidung blockiert jedes Entwicklungswerkzeug, das `eval` benutzt — und wird mit `--force` umgangen. |
| **Skills werden kopiert, nicht verlinkt** | Der Host liest Verzeichnisse. Ein zweiter Anbieter im Kern wäre eine zweite Wahrheit. |
| **MCP als YAML-Dokument, nicht als Text** | Kommentare bleiben, derselbe Servername wird ersetzt statt verdoppelt. |
| **`npm`/`command`-Quellen abgelehnt** | Die eine bräuchte einen Paketmanager, die andere würde beim Installieren Code ausführen. |
| **Kein OAuth** | Der MCP-Client kennt nur statische Header. Mobbin und Figma-Remote bleiben damit außen vor; Figma-Desktop funktioniert. |

## Was installiert wurde (Auszug)

- **Anthropic claude-code-plugins**: `frontend-design` (Priorität), `plugin-dev`,
  `code-review`, `feature-dev`, `pr-review-toolkit`, `ralph-wiggum`, `hookify` u. a.
- **impeccable** (pbakaus): 1 Skill, 24 Commands.
- **replica-skill**: 10 Skills (`replica-*`).
- **mattpocock/skills**: 38 Skills.
- **hyperframes** (heygen): 26 Skills inkl. Motion-Blöcke.
- **trailhq/Trail-Code**: `trail`, `graft`, `rotate-pages`, `ship-docs`.
- **Frankie-Xu/Graft**: `graft`.

## MCP-Einträge

| Name | Transport | Ziel | Optional |
|---|---|---|---|
| `figma-desktop` | streamable-http | `http://127.0.0.1:3845/mcp` | ja (App lief nicht) |
| `mobbin` | streamable-http | `https://api.mobbin.com/mcp` | ja (OAuth fehlt) |
| `codebase-memory` | stdio | `npx -y codebase-memory-mcp` | ja |
| `playwright` | stdio | `npx @playwright/mcp@latest` | ja |

Alle vier stehen in `profiles/pmh/cordis.patch.yml`. `--optional` setzt
`failOnStartupError: false`; der Host startet auch, wenn ein Server fehlt.

## Offene Punkte

- **OAuth** für Mobbin und Figma-Remote fehlt im MCP-Client. Für Figma mit
  persönlichem Token gibt es `scripts/figma-mcp.mjs` (Token aus `user_secrets`).
- **LSP** der Claude-Plugins wird nicht ausgeführt — kein Sprachserver-Client.
- **`design-taste-frontend`** wurde beim Test überschrieben und aus Git
  wiederhergestellt. Der Installer verweigert jetzt fremde Ziele ohne `--force`;
  die Upstream-Fassung liegt als `upstream-design-taste-frontend` daneben.
- **Graphify** ist nach den strukturellen Änderungen neu gelaufen.

## Belege

- `packages/skill/skillspector/` (37 Regeln, 19 Tests)
- `packages/skill/skill-marketplace/` (17 Tests)
- `apps/cli/src/commands/index.ts`
- `docs/subsystems/skillspector.md`, `docs/subsystems/plugin-marketplace.md`
- `docs/design/figma-mcp.md` §8
