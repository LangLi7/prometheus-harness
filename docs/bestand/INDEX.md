# Bestand — Register

> **Was diese Datei ist:** der Index über den Bestand und die vier Blätter daneben. Wer wissen
> will, *was Prometheus Harness hat* und *was davon von außen kommt*, findet es hier in einer
> Minute — ohne im Baum zu suchen.
>
> **Stand:** 21.10.2026. Alle Zahlen sind an diesem Tag selbst gezählt; die Befehle stehen in
> [`checkup-skills-plugins.md`](checkup-skills-plugins.md) §6.

---

## 1. Die vier Blätter

| Dokument | Beantwortet | In einem Satz |
|---|---|---|
| [checkup-skills-plugins.md](checkup-skills-plugins.md) | **Was ist da?** | Vier Schichten gezählt — Kern, 8 eigene Plugins, 23 Skills, 4 MCP-Server — mit acht belegten Lücken, darunter L1 (Skills außerhalb des Repos) und L6 (keine Skill-Evals). |
| [fremd-repos.md](fremd-repos.md) | **Was passt von außen?** | 23 Repositories gelesen und in vier Bauformen einsortiert — Unit, Bibliothek, Werkzeug, Referenz —, jedes mit Lizenz und Urteil, auch dem „nein". |
| [goal.md](goal.md) | **Wohin soll es?** | Fünf Phasen vom Bestand zur belegten Unit, mit Abnahmekriterien und fünf ausdrücklichen Nicht-Zielen. |
| [todos.md](todos.md) | **Was ist zu tun?** | 17 Punkte mit ID, Phase, Lücke und Nachweis — nach den Regeln A1–A7 aus `arbeitspakete.md`. |

**Reihenfolge zum Lesen:** Checkup → Fremd-Repos → Ziel → Todos.

---

## 2. Der Bestand in Zahlen

| Schicht | Größe | Gemessen |
|---|---|---|
| **Kern** (`node_modules/@deepseek-ai/`) | **265** Pakete, alle `0.2.1-alpha.2` | Verzeichnis gezählt |
| **Eigene Plugins** (`packages/plugin/`) | **8** Pakete, **116** Dateien | je Paket gezählt |
| **Skills wirksam** (Benutzer-Scope) | **23** | `%USERPROFILE%\.agents\skills` |
| **Skills im Repo** | **19** Ordner, davon **3** mit Inhalt | `.agents/skills/` |
| **Skill-Repo `units/skills`** | **1** Fähigkeit (`diagram-design`, 287 Dateien) — eigene Historie | `units/skills/`, Commits `3aaccfe` und `b7d0c7a` |
| **MCP-Server** | **4** (`graphify`, `rea`, `research`, `obsidian`) | laufende Sitzung |
| **Paketordner** | **401**, davon **82** belegt, **319** leer | `packages/*/*` |
| **Testdateien `apps/universe`** | **33** | `apps/universe/tests` |

---

## 3. Register: die 8 eigenen Plugins

| Plugin | Dateien | Rolle | Route |
|---|---:|---|---|
| `accounts` | 9 | Benutzer, Rollen, Einladungen | `/api/pmh/auth/benutzer`, `/einladungen` |
| `crew` | 15 | Crews, Rollen, Vorgabe und Projekt | `/api/pmh/crew` |
| `graphify` | 9 | Graph-Panel: Knoten, Hubs, Lauf | `/api/world/graphify` |
| `obsidian` | 9 | Vault-Panel: Suche, Notizvorschau | `/api/world/obsidian` |
| `ponytail` | 13 | Prompt-Abschnitt, Skill, Schalter (aus/lite/full/ultra) | — |
| `rich-ui` | 20 | `render_ui`: Karte, Diagramm, Tabelle, Bild, Notiz | — |
| `usage` | 21 | Guthaben, Verbrauch, Bildkostenschätzung | `/api/pmh/usage/status`, `/schaetzung` |
| `zugaenge` | 20 | Schlüsselverwalter, Anbieter-Schnittstelle, Sonde | — |

Dazu die sechs Pakete, die **kein** Client-Plugin sind: `skill`, `skill-filesystem`,
`tool-skill`, `skill-plugin`, `unit-export`, `unit-system`.

---

## 4. Register: die 23 wirksamen Skills

**Design (6):** `design-taste-frontend` · `high-end-visual-design` · `emil-design-eng` ·
`redesign-existing-projects` · `web-design-guidelines` · `figma-use`

**Review und Sicherheit (5):** `code-review` · `autofix` · `open-code-review` ·
`open-code-review-delegate` · `security-audit`

**Reverse-Engineering und Browser (3):** `reverse-api` · `reverse-engineer-anything` ·
`browser-local` · *(+ `playwright-cli`)*

**Gedächtnis und Recherche (3):** `codebase-memory` · `find-skills` · `hf-cli`

**Überbau-Abwehr (6):** `ponytail` · `ponytail-audit` · `ponytail-debt` · `ponytail-gain` ·
`ponytail-help` · `ponytail-review`

**Sonstiges (2):** `typesafe-ai`

> **Die Lücke, die dieses Register sichtbar macht:** diese 23 liegen im **Benutzer-Scope**, nicht
> im Repository. Ein frischer Klon hat **drei**. Das ist L1 in
> [`checkup-skills-plugins.md`](checkup-skills-plugins.md) §4 und Punkt P2.1 in
> [`todos.md`](todos.md).
>
> **Dazu seit 21.10.2026:** `diagram-design` liegt im eigenen Skill-Repo (`units/skills/`) —
> **übernommen, aber noch nicht geladen**, weil die vierte Wurzel `skill-plugin` voraussetzt.
> Damit sind es **24 Fähigkeiten im Bestand**, aber weiterhin **23 wirksam**.

---

## 5. Register: die 23 Fremd-Repos nach Urteil

**Übernehmen (4):**
`diagram-design` (Skill, L4) · `agent-reach` (Werkzeug) · `awesome-harness-engineering`
(Referenz, L6) · `pretext` (Bibliothek, Oberfläche)

**Selektiv ernten (5):**
`ecc` (311 Skills) · `scientific-agent-skills` (Prozessvorbild) ·
`anthropic-cybersecurity-skills` (3–5 defensiv) · `claude-red` (höchstens 5) ·
`agency-agents` (nur der Konverter)

**Nachziehen (2):**
`open-code-review` (`ocr scan` fehlt) · `strix` (Werkzeug, **nicht** Subagent)

**Nur Referenz (10):**
`agentmemory` · `Trail-Code` · `codebase-memory-mcp` · `voltagent` · `OpenMAIC` ·
`OpenExecutive` · `Unlimited-OCR` · `awesome-design-md` · `browser-use` · `flowsint`

**Gesperrt (2):**
`academic-research-skills` (CC BY-NC) · `OpenMontage` (AGPL-3.0, nur als eigener Prozess denkbar)

**Summe: 4 + 5 + 2 + 10 + 2 = 23.** Die vollständige Begründung je Repository:
[`fremd-repos.md`](fremd-repos.md) §0.

---

## 6. Die acht Lücken und wo sie stehen

| Lücke | Beschreibung | Bearbeitet in |
|---|---|---|
| **L1** | 23 Skills außerhalb des Repos, 3 darin | P2.1, P2.2 |
| **L2** | 319 leere Paketordner | P2.4 (teilweise) |
| **L3** | `packages/browser-use` hat 0 Dateien | P4.4 |
| **L4** | kein Diagramm-Skill | **P1.1** |
| **L5** | keine Video-/Schnitt-Fähigkeit | P4.1 (gesperrt) |
| **L6** | keine Skill-Evals | P2.3 |
| **L7** | `skill-office`, `tool-workspace-dependencies` leer | nicht eingeplant |
| **L8** | `roadmap.md` sagt „Noch kein eigener Code" | nicht eingeplant |

---

## 7. Nachprüfen

```powershell
# Schicht B — eigene Plugins
Get-ChildItem packages\plugin -Directory | ForEach-Object {
  "{0,-12} {1}" -f $_.Name, (Get-ChildItem $_.FullName -Recurse -File).Count }

# Schicht C — wirksame Skills
(Get-ChildItem "$env:USERPROFILE\.agents\skills" -Directory).Count

# Steckplätze
$leaf = Get-ChildItem packages -Directory | ForEach-Object { Get-ChildItem $_.FullName -Directory }
"gesamt {0}, leer {1}" -f $leaf.Count, ($leaf | Where-Object {
  (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue).Count -eq 0 }).Count
```

---

## 8. Grenzen

- **Die 23 Skills sind nach Frontmatter gezählt**, nicht nach Ladeprüfung. Ob alle im Katalog
  stehen, belegt der Digest des Hosts.
- **Die Fremd-Repos wurden gelesen, nicht installiert.** Jede Aussage stammt aus README,
  Dateiliste und API-Metadaten.
- **Die Urteile sind Urteile.** Sie sind begründet und damit widerlegbar — genau das sollen sie
  sein.
