# Fremd-Repos — was für Prometheus Harness passt und was nicht

> **Anlass.** Der Betreiber hat am 21.10.2026 dreiundzwanzig Repositories vorgelegt mit der
> Auflage: *„schaue dir noch inhalt an was es ist und nur das was für PMH passt rein tun"*.
> Dieses Blatt ist das Ergebnis: je Repository **was es ist**, **was es kostet** und **welche
> Bauform** es bei uns haben könnte — nicht eine Wunschliste.
>
> **Die vier Bauformen, in die ein Fremdprojekt bei PMH fallen kann:**
> **Unit** (Plugin oder Skill, wird eingehängt) · **Bibliothek** (Code, den wir aufrufen) ·
> **Werkzeug** (eigener Prozess, den wir starten) · **Referenz** (gelesen, nicht eingebaut).
> Alles andere ist **nicht übernehmen** — und das steht genauso da.

**Stand der Prüfung:** 21.10.2026. Alle dreiundzwanzig Repositories waren erreichbar; READMEs
vollständig gelesen, Sterne/Push/Lizenz über die GitHub-API. Wo eine Angabe fehlt, steht
„nicht belegt" und nicht eine geratene Zahl.

---

## 0. Das Urteil in einer Tabelle

| # | Repository | Lizenz | Bauform bei PMH | Urteil |
|---|---|---|---|---|
| 1 | `baidu/Unlimited-OCR` | MIT | Werkzeug (MCP-Option) | **später** — schließt keine heutige Lücke, braucht GPU |
| 2 | `voltagent/voltagent` | MIT | Referenz | **nein** — dupliziert Subagenten, Workflow, MCP |
| 3 | `VoltAgent/awesome-design-md` | MIT | Referenz / Skill-Inhalt | **ja, als Vorlagen** — 84 `DESIGN.md`, reines Markdown |
| 4 | `THU-MAIC/OpenMAIC` | MIT (eine LGPL-Ausnahme) | Referenz | **nein als Unit** — App, aber Vorbild für Session-Resume |
| 5 | `Imbad0202/academic-research-skills` | **CC BY-NC 4.0** | — | **nein** — NC-Lizenz blockiert |
| 6 | `browser-use/browser-use` | nicht belegt | Referenz | **nein** — Python; die Naht ist bei uns leer, nicht das Werkzeug |
| 7 | `rohitg00/agentmemory` | Apache-2.0 | Referenz + evtl. MCP | **prüfen** — dupliziert unseren Wissensspeicher |
| 8 | `reconurge/flowsint` | Apache-2.0 | Referenz | **nein** — Anwendung mit eigener Datenbank |
| 9 | `trailhq/Trail-Code` | MIT | Referenz | **nein** — dupliziert Graphify **und** Obsidian |
| 10 | `DeusData/codebase-memory-mcp` | MIT | Referenz, evtl. MCP | **prüfen** — stärker als Graphify, aber zweite Wahrheit |
| 11 | `k-dense-ai/scientific-agent-skills` | MIT (je Skill abweichend) | selektiver Import | **selektiv** — Vorbild für Skill-Tests |
| 12 | `cathrynlavery/diagram-design` | MIT | **Skill** | **ja** — schließt Lücke L4, Aufwand ein Nachmittag |
| 13 | `mukul975/anthropic-cybersecurity-skills` | Apache-2.0 | selektiver Import | **selektiv** — 3–5 defensive Skills |
| 14 | `ai-boost/awesome-harness-engineering` | CC0 | Referenz | **ja** — schließt Lücke L6 (Skill-Evals) |
| 15 | `chenglou/pretext` | **MIT (mit Zusatzhinweisen)** | **Bibliothek** | **ja** — für `apps/universe` |
| 16 | `SenteLabsAI/OpenExecutive` | Apache-2.0 | Referenz | **nein** — Domänen-App, zu schwer |
| 17 | `SnailSploit/claude-red` | MIT | selektiver Import | **selektiv, mit Vorbehalt** — Dual-Use |
| 18 | `calesthio/OpenMontage` | **AGPL-3.0** | Werkzeug (Subprozess) | **nur wenn Video strategisch ist** — Lizenz prüfen |
| 19 | `msitarzewski/agency-agents` | MIT | Referenz (Konverter) | **nein als Import** — dupliziert die stärksten Skills |
| 20 | `Panniantong/agent-reach` | MIT | Werkzeug + Skill | **ja** — schließt eine echte Fähigkeitslücke |
| 21 | `affaan-m/ecc` | MIT | Skill-Quelle | **selektiv** — 311 Skills, Duplikate sieben |
| 22 | `usestrix/strix` | Apache-2.0 | **Werkzeug, nicht Subagent** | **ja, als Werkzeug** — Korrektur zur Annahme |
| 23 | `alibaba/open-code-review` | Apache-2.0 | schon vorhanden | **nachziehen** — `ocr scan` fehlt |

---

## 1. Direkt übernehmen — klein, permissiv, schließt eine gemessene Lücke

### 1.1 `diagram-design` → **Skill** (Lücke L4)

**Was es ist:** Ein Agent-Skill, der Diagramme als **eine** in sich geschlossene HTML-Datei mit
Inline-SVG zeichnet — 44–45 Typen (Architektur, Sequenz, ER, Zustand, Swimlane, Quadrant,
Wardley, Sankey, Gantt), dazu Import und Neuzeichnen aus draw.io, Mermaid und Excalidraw mit
einem Fidelity-Ledger. Kein Mermaid, 4px-Raster, MIT, keine Schlüssel, Python nur für Export
und Selbstprüfung.

**Warum es passt:** PMH hat **sechs Design-Skills und keinen einzigen Diagramm-Skill** (L4 im
Checkup). Die vorhandenen Skills sind Art Direction für Oberflächen — Diagramm-Grammatik ist
etwas anderes. Das Format ist `SKILL.md` plus `references/` und `scripts/`, also genau die Form,
die `skill-filesystem` bereits liest.

**Bauform:** Skill. **Aufwand:** ein Nachmittag. **Risiko:** MIT, keins außer Python 3 für den
PNG-Export (SVG geht ohne).

### 1.2 `agent-reach` → **Werkzeug + Skill**

**Was es ist:** Eine Python-CLI als „Capability Layer" für 16 Plattformen (Web, YouTube, RSS,
Exa, GitHub, X, Reddit, Bilibili, Instagram, LinkedIn, …) mit **geordneten Backend-Listen je
Kanal**, `doctor --json` zur Selbstdiagnose und **einer** `SKILL.md`.
Lizenz MIT, ~30 pytest-Dateien, CI.

**Warum es passt:** PMH kann heute Webseiten abrufen und suchen — aber **keine YouTube-Untertitel,
keine Reddit-Threads, keine RSS-Feeds, keine X-Suche**. Das ist eine echte Fähigkeitslücke, keine
Duplizierung. Der `doctor`-Befehl ist der Grund, warum es als Werkzeug und nicht als Skill
gehört: ob ein Kanal gerade funktioniert, muss **gemessen** werden, nicht behauptet.

**Bauform:** Werkzeug hinter einem dünnen Plugin, das `doctor` prüft. **Risiko:** Cookies und
ToS — das README warnt selbst vor gesperrten Konten. Nicht in ein Produkt ohne Wegwerf-Konten.

### 1.3 `awesome-harness-engineering` → **Referenz** (Lücke L6)

**Was es ist:** Eine kuratierte Liste zur Harness-Engineering-Disziplin (CC0): Essays, Papers,
Referenzimplementierungen und Primitive zu Agent-Loop, Kontextverwaltung, Tool-Design,
Permissions, Memory, Orchestrierung, **Evals**, Observability, Human-in-the-Loop.

**Warum es zählt:** Es ist die einzige Quelle der 23, die **genau auf PMHs Kern** zielt — und sie
benennt die Lücke, die im Checkup als **L6** steht: PMH hat 23 Fähigkeiten und **kein Verfahren,
ihre Wirkung zu messen**. Der dort verlinkte `skillgrade`-Ansatz (Task/Grader-Paare aus einer
`SKILL.md`, mehrere Läufe, CI-Schwelle) wäre ein neuer Skill `skill-eval`.

**Bauform:** Referenz. Kein Code, kein Risiko (CC0), aber konkrete Handlungsanweisung.

### 1.4 `pretext` → **Bibliothek** (Oberfläche)

**Was es ist:** Eine TypeScript-Bibliothek, die mehrzeiligen Text **ohne DOM-Messung** vermisst
und umbricht: `prepare()` einmal, `layout()` danach als reine Arithmetik. Rendert nach DOM,
Canvas und SVG, unterstützt Schriften, Emoji, Arabisch, Thai. Gedacht für Virtualisierung,
Chat-Blasen, Masonry und Layouts, die kein CSS-Reflow auslösen dürfen.

**Warum es passt:** `apps/universe` und `apps/web` bauen beide eine Chat-Oberfläche
(`packages/plugin/rich-ui` rendert Karten, Tabellen, Diagramme als Chat-Knoten). Zeilenhöhe ohne
Reflow ist genau das Problem, das eine wachsende Chat-Liste hat. **Das ist die konkreteste
technische Übernahme der ganzen Liste.**

**Lizenz — der Fallstrick, der fast zu einer falschen Absage geführt hätte:** die GitHub-API
meldet `NOASSERTION`. Das heißt **nicht** „keine Lizenz", sondern „kein SPDX-Standardschlüssel":
die `LICENSE` ist MIT **mit Zusatzhinweisen** für übernommene Chromium-, WebKit-, ICU- und
Unicode-Daten. Wer nur die API liest, hält ein permissives Projekt für ungeklärt. Der Punkt ist
damit **geklärt, nicht offen** — und die Lehre steht in §8.

**Grenze:** Die Bibliothek läuft **nur im Browser**. In Node, Bun, jsdom oder happy-dom wirft
`prepare()` ohne eigenen `OffscreenCanvas`-Shim. Der Nutzen liegt also in `apps/web` und
`apps/universe`, nicht im Host.

---

## 2. Selektiv ernten — Sammlungen, aus denen einzelne Skills passen

Der Grundsatz: **eine Sammlung ist kein Argument.** Bei 311 oder 818 Skills zählt nur, was eine
belegte Lücke füllt und nicht schon besser im Haus ist.

| Sammlung | Umfang | Was passt | Was nicht |
|---|---|---|---|
| `affaan-m/ecc` | **311** Skills, MIT | einzelne Skills im `SKILL.md`-Format ohne Build | Hooks, Agents, Commands sind Claude-Code-förmig und laufen unter Cordis nicht |
| `k-dense-ai/scientific-agent-skills` | **177** Skills, ~460 MB | **das Prozessvorbild**: Contract-Guard, Tests je Skill, Security-Scan als CI-Tor | die Wissenschaftsdomäne; 177 Skills sprengen jeden Katalog |
| `mukul975/anthropic-cybersecurity-skills` | **818** Skills, Apache-2.0 | 3–5 **defensive** Skills (Cloud-IR, Memory-Forensik, Supply-Chain, Prompt-Injection) | der offensive Rest; der Name suggeriert Anthropic-Zugehörigkeit, ist aber ein Community-Projekt |
| `SnailSploit/claude-red` | **78** Skills, MIT | höchstens 5 (`api-security`, `ai-security`, `reporting`) | 73 weitere, darunter Shellcode, EDR-Evasion, Phishing — **Dual-Use** |
| `msitarzewski/agency-agents` | **230+** Personas, MIT | der **Konverter** (`--tool dsh` erzeugt echtes `SKILL.md`) als Vorbild fürs Unit-Packaging | die Inhalte: `engineering-code-reviewer` ist eine Heuristik-Liste ohne ein Kommando und unterbietet `code-review` |
| `Imbad0202/academic-research-skills` | 5 Skills, **CC BY-NC** | nichts — die NC-Klausel schließt kommerzielle Nutzung aus | alles, solange PMH ein Produkt ist |

**Die Regel, die daraus folgt:** eine Fremd-Skill wird nur übernommen, wenn sie (a) eine im
Checkup belegte Lücke füllt, (b) nicht inhaltlich unter dem liegt, was PMH schon hat, und (c)
MIT/Apache/CC0 ist. Punkt (c) schließt `academic-research-skills` und `pretext` bis zur Klärung aus.

---

## 3. Die Wissensschicht — vier Projekte, ein Befund

Hier liegt der wichtigste Teil, weil der Betreiber dazu eigene Anmerkungen gemacht hat.

| Projekt | Was es wirklich ist | Überschneidung |
|---|---|---|
| **`agentmemory`** | Persistenter Speicher für Coding-Agenten: 54 MCP-Werkzeuge, 12 Hooks, BM25 + Vektor + Graph mit RRF-Fusion, eigenes Speicher-Backend (SQLite + iii-Engine), Viewer. Nennt **DeepSeek Harness ausdrücklich als MCP-Client**. | **pgvector-Wissensspeicher**, Obsidian-Notizen, Graphify-Graph |
| **`Trail-Code`** | Zwei Teile: ein **Codegraph** (tree-sitter, 23 Sprachen, wer ruft wen) und **Learnings** (Entscheidungen als Markdown in `.trail/`, durch Git geteilt). | **Graphify** (Graph) **und** Obsidian (Notizen) — beide |
| **`codebase-memory-mcp`** | Ein MCP-Server in C mit **17 Werkzeugen**, 162 Sprachen, Hybrid-LSP-Typprüfung, Cypher-Teilmenge, Blast-Radius, Architektur-ADR, Infrastruktur (Docker/K8s/Terraform). | **Graphify** — aber deutlich tiefer (Typauflösung statt Textsuche) |
| **`flowsint`** | Eine **fertige OSINT-Anwendung**: Neo4j-Graph, FastAPI, React, Docker-Compose, Enricher für Domains, IPs, E-Mails, Wallets. | **Die Graph-Idee**, aber als App mit eigener Datenbank |

### 3.1 Der Befund, ehrlich

**Alle vier lösen dasselbe Problem wie Graphify + Obsidian — und keiner löst es mit unserem
Bestand.** Wer eines davon einbaut, hat **zwei** Wissensspeicher: den in PostgreSQL (Migration
0007, `documents`/`chunks`/`vector(768)`) und den des Fremdprojekts. Zwei Wahrheiten über
denselben Gegenstand sind genau das, was dieses Projekt an anderen Stellen schon als Fehler
geführt hat.

**Deshalb: keines wird als Speicher eingebaut.** Was übernommen wird, ist das **Verfahren**:

| Von | Übernehmen wir | Wohin |
|---|---|---|
| `codebase-memory-mcp` | **Blast-Radius** als eigene Abfrage, Hybrid-LSP als Idee für Genauigkeit | `mcp__graphify__get_pr_impact` gibt es schon — der Vergleich lohnt |
| `Trail-Code` | **Learnings als Datei mit `touches`-Feld**, im Repo committet, durch Git geteilt | Das ist ein Modell für Obsidian-Notizen mit Rückverweis auf Code |
| `agentmemory` | **Vierstufige Konsolidierung mit Verfall** und die Frage „was ist eine Erinnerung wert?" | Konzept für den pgvector-Speicher, nicht als Dienst |
| `flowsint` | **Enricher-Liste** als Katalog möglicher Anreicherungen | Referenz für spätere Graph-Knoten |

### 3.2 Der eine Punkt, an dem `Trail-Code` **nicht** Duplikat ist

Der Graph-Teil von `Trail-Code` ist eine Graphify-Dublette und fällt weg. Die **Learnings**
fallen nicht weg — sie füllen eine Lücke, die PMH tatsächlich hat und die im Checkup nicht
auftaucht, weil sie keine Fähigkeit ist, sondern ein **Verfahren**:

> Eine Entscheidung wird als **kurze Markdown-Datei** festgehalten, mit `touches`-Feld auf die
> betroffenen Dateien, **im Repository committet**, durch Git geteilt — und **vor dem Commit**
> gegen den eigenen Diff geprüft (`trail check`). Widerspricht die Änderung einer früheren
> Entscheidung, nennt das Werkzeug **wer** sie wann **warum** getroffen hat.

**Was PMH heute hat:** `docs/decisions/` mit ausführlichen Entscheidungen (gut, aber von Hand
geschrieben und nicht maschinell geprüft) und Obsidian-Notizen (gut, aber nicht im Repo und
nicht an Dateien gebunden). **Was fehlt:** die Verbindung *Entscheidung → Datei → Prüfung vor
dem Commit*. Genau das ist der Punkt, an dem ein Agent eine frühere Entscheidung unbemerkt
umdreht — und in diesem Projekt schon umgedreht hat.

**Nicht übernommen wird** die Telemetrie (standardmäßig aktiv, abschaltbar) und das Schreiben
außerhalb des Repos (`~/.claude`, `~/.codex`, `~/.gemini`).

### 3.3 `agentmemory` — stark als Vorbild, schädlich als Dienst

TypeScript, Apache-2.0, 54 MCP-Werkzeuge, nennt **DeepSeek Harness ausdrücklich als
MCP-Client** — ein Anschluss wäre also ohne Anpassung möglich. Genau deshalb steht hier ein
„nein": er würde **ohne Reibung** neben dem pgvector-Speicher stehen, und dann gäbe es zwei.
Dazu vier Ports, ein eigenes Datenverzeichnis und unter nativem Windows nur der manuelle Weg.

Was bleibt: **RRF-Fusion**, **Verfall und Konsolidierung**, **Provenienz je Erinnerung** — drei
Verfahren für den eigenen Speicher, kein Dienst.

### 3.4 Zur Anmerkung „später als Notizen in universe neu machen — modern"

Der Betreiber hat das selbst schon richtig eingeordnet: *„das gleiche wie mit trail etc oben ist
wahrscheinlich eine schon existierende universe die ich baue, evtl besser als das."*

**Das ist der Punkt.** `apps/universe` ist bereits die Oberfläche, in der Orte, Fäden und
Beiträge zusammenlaufen (`design/welt-orte.md`). Ein zweiter Graph-Speicher daneben wäre kein
Remake, sondern ein Rückschritt. Die Reihenfolge, die daraus folgt:

1. **Jetzt:** Graphify fragen (tut die Sitzung bereits), Obsidian lesen/schreiben (tut sie),
   pgvector-Schema steht. Nichts davon ersetzen.
2. **Danach:** die *Verfahren* aus §3.1 übernehmen — Blast-Radius, Learnings-Datei, Verfall.
3. **Später:** `universe` bekommt eine Notiz-Ansicht auf **denselben** Speicher. Kein vierter
   Dienst.

---

## 4. Nicht übernehmen — und warum das eine Entscheidung ist, keine Auslassung

| Repository | Grund |
|---|---|
| `voltagent/voltagent` | TypeScript-Agent-Framework **plus Cloud**. Dupliziert Subagenten, Workflow, MCP, Memory — alles Dinge, die PMH aus dem Kern hat. Nur als Referenz für `suspend`/`resume` im Workflow brauchbar. |
| `THU-MAIC/OpenMAIC` | Eine Next.js-App (PostgreSQL Pflicht, Node ≥ 22.19, ~167 MB). Als Unit zu groß. **Wertvoll als Vorbild** für dauerhafte Sitzungen: Leases, Heartbeats, Crash-Resume, Revisionszähler. Achtung: `packages/mathml2omml` ist LGPL-3.0. |
| `SenteLabsAI/OpenExecutive` | Eine Management-Web-App (Python, ChromaDB, PyTorch, Next.js, Docker). Als Baustein zu schwer. **Lesenswert** für den MCP-Zuschnitt: 8 Ressourcen, 4 Werkzeuge, Read-only als Vorgabe. |
| `browser-use/browser-use` | Python-Framework. **Der eigentliche Befund:** `packages/browser-use/browser-use` ist bei uns **leer** (0 Dateien, gemessen). Die Naht `ctx.browserUse` ist beschrieben, die Umsetzung fehlt. Das Original schließt diese Lücke **nicht** — es ist ein Vorbild für Agent-Loop und DOM-Extraktion. Zu füllen ist die Naht mit einem TypeScript-Anbieter. |
| `flowsint` | Fertige Anwendung mit Neo4j, eigener Authentifizierung und Docker-Compose. Kein Unit, und der Graph wäre ein zweiter. |
| `agency-agents` | 230 Personas mit zusammen ~1 Mio. Token Rumpf. Die Divisions, in denen PMH stark ist (Engineering, Design), sind **dupliziert und schwächer**. Nutzen nur im Konverter. |
| `academic-research-skills` | CC BY-NC. Harte Sperre für ein Produkt. |

---

## 5. Die zwei Korrekturen an den Annahmen des Auftrags

### 5.1 `strix` ist kein Subagent

Der Betreiber: *„wahrscheinlich als subagent oder agent für PMH."*
**Gemessen:** `strix` ist eine Python-CLI, die ihre Agentenflotte in einem **eigenen
Docker-Sandbox** startet (Caido, Playwright, Exploit-Runtime), mit eigenem LLM-Schlüssel und
`-n` für kopflosen Lauf mit Exit-Code bei Funden.

**Was daraus folgt:** Es ist **kein einbettbarer Agent-Loop**. Ein PMH-Subagent kann es
**aufrufen** (als Werkzeug mit eigenem Prozess), aber nicht **sein**. Der saubere Weg ist ein
Werkzeug-Aufruf mit Ziel-Allowlist — und die ist rechtlich keine Formalie: ein Werkzeug, das
Angriffe gegen beliebige Hosts fährt, braucht eine geprüfte Zielliste.

**Nutzen:** Es ergänzt `security-audit` (heute reine Anleitung) um **dynamische Validierung**.
**Kosten:** Docker, Schlüssel, Laufzeitkosten pro Lauf.

### 5.2 `browser-use` füllt keine Lücke, die es zu füllen scheint

Die verbreitete Annahme, `packages/browser-use` sei eine eigene Implementierung, ist **falsch**:
der Ordner enthält **0 Dateien**. Browser-Automatisierung läuft heute als MCP-Konfiguration
(`chrome-devtools`), nicht als Unit. Das ist der Unterschied zwischen **benutzt** und **gebaut**,
den `ziel-liste-ist-und-plan.md` §2.1 schon benennt.

---

## 6. `OpenMontage` — die Video-Frage, getrennt behandelt

Der Betreiber: *„hat Relevanz wenn ich Video, Shorts, Reel etc. schneiden möchte, weil momentan
haben wir nur Bilder generieren."*

**Was es ist:** Ein agentisches Video-Produktionssystem in **drei Schichten** — (1) Pipeline- und
Stage-Direktor-Skills als Markdown/YAML, (2) eine Python-Werkzeugbibliothek (100+ Werkzeuge),
(3) Node-Renderer (Remotion, HyperFrames) plus FFmpeg. Zwölf Pipelines von Recherche bis Render,
erzwungene Freigabe-Tore, Budget-Obergrenze, Qualitätsprüfungen nach dem Rendern.

**Was es nicht ist:** kein Schnittprogramm. Keine GUI-Timeline, kein Projektformat. Es ist eine
**Pipeline**, die ein Agent fährt.

**Der harte Blocker ist die Lizenz: AGPL-3.0.** Bei einem netzwerkbedienten Produkt greift §13.
Einbetten oder Vendorn ist ausgeschlossen; der einzige saubere Schnitt ist ein **unveränderter,
separat gestarteter Prozess** — und selbst das gehört rechtlich geprüft, nicht technisch
entschieden.

**Technisch:** Python 3.10+, Node 18+/22+, FFmpeg, WhisperX. Das wäre die **dritte** Laufzeit
neben Bun und Go. Dazu 412 offene Issues und **kein einziges GitHub-Release**.

**Empfehlung:** Wenn Video strategisch ist, ist es ein **eigenes Vorhaben** mit eigenem
Prozess und eigener Lizenzprüfung — kein Häkchen in dieser Liste. Der Zero-Key-Pfad (Piper +
Remotion + Stock-Material) ist der einzige, der ohne laufende Kosten testbar wäre.

---

## 7. `open-code-review` — schon da, eine Lücke offen

Das Repository ist **exakt die CLI `ocr`**, die PMH bereits als Skill nutzt (Paketname und Flags
stimmen überein). Kein Neuzugang, nur Versionspflege.

**Was fehlt:** `ocr scan` — Ganzdatei-Review **ohne Diff**. Die Skill erwähnt es nur in einem
Fallstrick, ruft es nirgends auf. Für `security-audit` ist das der interessantere Modus: ein
Bestand wird geprüft, nicht eine Änderung. Dazu fehlen Session-Viewer (Befunde abhaken) und
SARIF-Anbindung an einen Workflow.

---

## 8. Prüfpunkte vor **jeder** Übernahme

Fünf Fragen, die dieses Projekt an anderer Stelle schon teuer gelernt hat:

1. **Lizenz geklärt?** `OpenMontage` (AGPL-3.0) und `academic-research-skills` (CC BY-NC) sind
   ohne Entscheidung gesperrt. **`pretext` ist geklärt** — MIT mit Zusatzhinweisen, siehe §1.4.
   Eine `NOASSERTION`-Meldung der API ist ein **Hinweis zum Nachlesen**, kein Urteil.
2. **Bauform richtig?** Eine App ist kein Unit. Ein Python-Framework ist kein Subagent. Ein
   MCP-Server ist Konfiguration, kein gebautes Unit.
3. **Duplikat?** Gegen `code-review`, `security-audit`, `design-taste-frontend`, `graphify`,
   `obsidian` prüfen — nicht gegen den Namen.
4. **Laufzeit?** Bun, Go, Rust sind im Haus. Python, Docker, GPU und Node-Renderer sind **neue**
   Betriebslasten und brauchen einen eigenen Grund.
5. **Lücke belegt?** Eine Übernahme ohne Lücke im Checkup ist eine Sammlung, kein Bestand.

---

## 9. Grenzen dieses Blattes

- **Sterne und Push-Daten** sind Momentaufnahmen vom 21.10.2026 und sagen nichts über Qualität.
- **Die Lizenz von `browser-use`** habe ich in diesem Lauf nicht einzeln abgefragt; sie steht
  deshalb als „nicht belegt" und nicht als Vermutung.
- **Kein Repository wurde installiert oder ausgeführt.** Alle Aussagen stammen aus README,
  Dateiliste und API-Metadaten. Wer eines übernimmt, prüft es am laufenden System — das ist die
  Regel A3 aus `arbeitspakete.md`, nicht eine Empfehlung.
- **Die Zuordnung „passt/ passt nicht"** ist ein Urteil, kein Meßergebnis. Sie ist begründet und
  damit widerlegbar — genau das soll sie sein.
