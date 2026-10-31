---
title: "Fremd-Repos — zweite Runde, 26.10.2026"
bereich: "bestand"
stand: 2026-10-26
tags:
  - pmh/bestand
  - pmh/research
---

# Fremd-Repos — zweite Runde, 26.10.2026

**Anlass.** Der Betreiber hat eine zweite Liste vorgelegt. Dieses Blatt hält je
Repository fest: was es ist, welche Bauform es bei PMH haben kann und was
passiert ist. Es ist ein **Register**, keine Wunschliste.

Bauformen wie in [fremd-repos](fremd-repos.md): **Unit** (Plugin/Skill) · **Bibliothek** ·
**Werkzeug** (eigener Prozess) · **Referenz** (gelesen, nicht eingebaut) ·
**Backlog** (später prüfen).

## 1. Erledigt (installiert)

| Repository | Was es ist | Bauform | Stand |
|---|---|---|---|
| `nvidia/skillspector` | Sicherheits-Scanner für Agenten-Skills (Python) | **nachgebaut** als `@prometheus-harness/skillspector` | 37 Regeln, gleiches Risikomodell, kein LLM, 19 Tests |
| `anthropics/claude-code/plugins` | 12 offizielle Claude-Plugins, u. a. `frontend-design` | Marketplace | alle 12 eingetragen; 7 sauber, 5 nach Prüfung mit `--force` |
| `pbakaus/impeccable` | Design-Skill + 24 Commands | Marketplace | installiert (`52/100 HIGH`, nur Fähigkeitsbefunde) |
| `Jakeschincariol/replica-skill` | 10 Skills zum Nachbauen von Apps | Skills | 10 installiert, `replica-launch` wegen Zero-Width-Zeichen zunächst übersprungen |
| `leonxlnx/taste-skill` | `design-taste-frontend` (Anti-Slop) | Skill | Projektfassung blieb erhalten; die Upstream-Fassung liegt jetzt als `upstream-design-taste-frontend` daneben (`skill install … --prefix upstream`) |
| `Frankie-Xu/Graft` | Code-Index-/Kontext-Skill | Skill | `graft` installiert |
| `trailhq/Trail-Code` | Learnings-Datei + `trail ask/note` | Skills | 4 Skills (`trail`, `graft`, `rotate-pages`, `ship-docs`) |
| `heygen-com/hyperframes` | HTML-zu-Video, 26 Skills, ~450 Blöcke | Skills | 26 installiert (Archiv ~160 MB wegen Video-/Font-Assets) |
| `mattpocock/skills` | 38 Arbeits-Skills (tdd, research, triage …) | Skills | 38 installiert, `setup-matt-pocock-skills` übersprungen (MP1) |
| `DeusData/codebase-memory-mcp` | Nativer Code-Graph als MCP-Server | **Werkzeug** | als `npx -y codebase-memory-mcp` eingetragen, `--optional`; **nicht** global installiert |
| `mobbin/mobbin-mcp-server` | Gehosteter Design-Referenz-MCP | **Werkzeug** | `https://api.mobbin.com/mcp` eingetragen; **OAuth fehlt im Client** |
| `Figma` Desktop-MCP | Lokaler MCP unter `127.0.0.1:3845` | **Werkzeug** | eingetragen als `figma-desktop`; Port war am 26.10. geschlossen (App lief nicht) |
| `666ghj/MiroFish` | Schwarm-Simulation (Flask + Vue), 82k Sterne, **AGPL-3.0** | **Plugin + Skill** | integriert als `integrations/mirofish`; 20/100 LOW SAFE, 4 Commands materialisiert. Braucht Zep + LLM, Port 5001. Kein Code kopiert. |
| `microsoft/playwright` + `@playwright/mcp` | Browser-Automatisierung | **Werkzeug** | als `npx @playwright/mcp@latest` eingetragen, `--optional` |

## 2. Nicht als Skill installierbar (Befund)

| Repository | Befund | Vorschlag |
|---|---|---|
| `blixvip/MotionClone` | Desktop-App (Python + eigenes Web-UI auf Port 4319), **kein `SKILL.md`**; verlangt die offizielle Codex-CLI mit ChatGPT-Login | **Werkzeug für Motion-Referenzen.** `scripts/motionclone.mjs` nutzt die HTTP-API: Video rein, HyperFrames-Projekt raus. Dazu die globale Skill `motionclone`. Kein Fork von `app/ai.py`. Codex-CLI 0.164.0 installiert, Login bestätigt. |
| `msitarzewski/agency-agents` | 435 Dateien, je ein Agenten-`.md` (Claude-Subagent-Format), **kein `SKILL.md`** | Subagent-Presets statt Skills; PMH liest keine `agents/`-Ordner. Backlog: Agenten-Format |
| `Panniantong/agent-reach` | 16-Plattform-Recherche-Skill, bereits im Katalog | vorhanden; Wunsch „englisch und deutsch“ offen |

## 3. Backlog / Research (nicht angefasst)

| Repository | Was es ist | Nächster Schritt |
|---|---|---|
| `trailhq/Trail-Code` | Learnings + Code-Suche als CLI | installiert; prüfen, ob `trail ask` gegen `graphify` läuft oder beide nebeneinander |
| `makecindy/cindy` | noch nicht geprüft | lesen, Bauform bestimmen |
| `tt-a1i/archify` | noch nicht geprüft | lesen, Bauform bestimmen |
| `AminForou/mcp-gsc` | Google Search Console als MCP | **GSC MCP** als eigenes Plugin prüfen (OAuth nötig) |
| `every-app/open-seo` | SEO-Skill-Sammlung | im Katalog vorhanden (SEO-Skills); gegen `mcp-gsc` abgleichen |
| `Auriti-Labs/geo-optimizer-skill` | GEO/AEO-Optimierung | Original-Suche mit Keyword `geo-optimizer-skill` verifizieren, dann bewerten |

## 4. Keyword „Jarvis“

- `open-jarvis/openjarvis` und `openjarvis.stanford.edu` sind **eigene Posten**,
  nicht Teil der Skill-Liste.
- Auftrag: Harness analysieren lassen und bewerten, ob eine Übernahme in
  Prometheus sinnvoll ist. **Noch nicht begonnen.**
- Vorgehen: zuerst lesen (Paper/Repo), dann Bauform bestimmen, dann eine
  Entscheidungsnotiz — keine Installation vor der Analyse.

## 5. Design-Vorgaben (dauerhaft gemerkt)

Als globale Skill festgehalten:
`~/.agents/skills/design-system-baseline/SKILL.md` mit Vorlage
`references/design-md-template.md`.

Kern:

- **Farben nur HSL oder Hex**, niemals RGB (Ausnahme nur auf ausdrücklichen
  Auftrag, dann im `design.md` notiert).
- **Jedes Website-Projekt bekommt `design.md`** mit Flächen, Text, Akzent,
  Status, Schrift (Headline/Subhead/Fließtext), Abständen, Radien, Schatten und
  je einer Spalte für Hell und Dunkel.
- **Nie reines Weiß oder Schwarz.** Hintergrund 96 %/8 %, Card ±4 %,
  Text 94 %/8 %, Akzent `hsl(H 85% 62%)`, alle anderen Farben `H` mit 10 %
  Sättigung.

## 6. Offene Punkte aus dieser Runde

- **Adapter gebaut**: Commands und Agents sind jetzt Skills
  (`pmh plugin adapt --all`, 34 Stück aus den Anthropic-Plugins). Hooks laufen
  nach Freigabe über `pmh plugin hooks enable <id>` (Neustart nötig).
- **LSP** bleibt ohne Laufzeit — der Harness hat keinen Sprachserver-Client.
- `mobbin` und Figma-Remote brauchen OAuth — der MCP-Client kann es nicht; für
  Figma mit PAT gibt es `scripts/figma-mcp.mjs` und `scripts/secret.mjs`.
- `agency-agents` bringt Agenten-`.md`, aber kein Plugin-Format; der Adapter
  greift nur bei installierten Plugins.
