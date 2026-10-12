Jetzt wird klarer, was du eigentlich bauen möchtest: nicht einfach einen Wrapper um DeepSeek, sondern eine modulare, selbst gehostete AI-Agent-Plattform – mit eigener Orchestrierung, Memory, Research, Coding-Umgebung, automatisierten Experimenten und einer integrierten Entwicklungsoberfläche.

Ich würde das Konzept als eine Mischung aus DeepSeek Harness + Docking-Station-UX + lokalem Agent-Workspace + Research- und Training-Labor aufbauen.

Die wichtigste Architekturentscheidung wäre: Du entwickelst den Kern selbst, integrierst bestehende Open-Source-Projekte über klare Schnittstellen und vermeidest es, jede Infrastrukturkomponente selbst neu zu schreiben.

## 1. Die Gesamtarchitektur

Docking-Station UI

Workspace · Graph View · Projektbaum · Terminal · Chat · Research

Harness Core

Agent Runtime · Decision Engine · Tool Registry · Policies · Event Bus

Agent Intelligence

Planner, Executor, Reviewer, Evaluator

Memory & Knowledge

PostgreSQL, Vektoren, Redis, Obsidian

Research Engine

SearXNG, Firecrawl, OCR, Quellenverwaltung

Execution & Experiments

Docker/Podman, Git, Tests, Training, Rollback

Infrastructure & Integrations

Model APIs · lokale Modelle · Forgejo/GitLab · Remote IDE · WireGuard/Tailscale

Diese Architektur trennt die Benutzeroberfläche von der Agent-Logik und die Agent-Logik wiederum von der Infrastruktur. Dadurch kannst du einzelne Komponenten ersetzen, ohne das gesamte Projekt umzubauen.

## 2. Mein wichtigster Architekturentscheid: Rust für den Kern, TypeScript für die UI

Deine geplante Kombination aus Bun, Go, TypeScript und Rust ist machbar. Ich würde allerdings jedem Teil eine klar begrenzte Aufgabe geben.

| Technologie           | Meine empfohlene Verantwortung                                                   |
| --------------------- | -------------------------------------------------------------------------------- |
| Rust                  | Harness-Kern, Agent-Lifecycle, Tool-Aufrufe, Policies, Sandbox-Controller        |
| Go                    | Optionale Infrastruktur-Dienste, Worker-Agenten, Netzwerk- und Betriebswerkzeuge |
| Bun + TypeScript      | UI, API-Clients, Frontend-Entwicklung, Build- und Entwicklungswerkzeuge          |
| PostgreSQL + pgvector | Persistente Daten, Experimente, Dokumente, Metadaten und Vektorsuche             |
| Redis                 | Kurzlebiger Cache, Queue-Unterstützung, Rate Limits und Statusinformationen      |
| Git                   | Versionierung von Code, Prompts, Skills und Experimenten                         |

Meine Tendenz wäre, Rust und TypeScript als primäre Entwicklungssprachen zu wählen und Go nur dann einzusetzen, wenn ein eigener Dienst damit einen echten Vorteil bietet.

Warum? Wenn jede Sprache eine eigene Laufzeit, Build-Pipeline, Fehlerbehandlung und Schnittstelle mitbringt, steigt der Wartungsaufwand. Vier Sprachen sind nicht automatisch viermal flexibler.

Ein möglicher Aufbau:

- `harness-core`: Rust
- `agent-runtime`: Rust
- `sandbox-provider`: Rust
- `api-server`: Rust oder zunächst eine schlanke Lösung innerhalb des Kerns
- `web-ui`: TypeScript
- `workflow-adapter`: Integration mit n8n
- `research-workers`: Rust-basierte Worker, die externe Tools aufrufen

### Und was ist mit LangChain und LangGraph?

Hier würde ich aufpassen: LangChain und LangGraph sind stark im Python-Ökosystem verankert. Wenn du Python wirklich vermeiden willst, würde ich sie nicht als obligatorische Abhängigkeit des Kernsystems vorsehen.

Du kannst die Konzepte übernehmen:

- Graph-basierte Agenten-Workflows
- Persistente Checkpoints
- Wiederaufnahme nach Fehlern
- Human-in-the-loop
- Tool-Routing und strukturierte Zustände

LangGraph dokumentiert beispielsweise die Trennung zwischen Checkpoints für einen laufenden Prozess und längerfristigem Memory. Das lässt sich als Architekturprinzip auch in Rust umsetzen.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://langchain-ai.github.io\&sz=32)

Docs by LangChain

+1



Ich würde zuerst einen kleinen, eigenen Workflow-Executor bauen und später prüfen, ob ein externer Agent-Framework-Adapter nötig ist.

## 3. Die IDE- und Docking-Station-Frage

Hier sehe ich drei realistische Ansätze.

[Eclipse Theia 1.48 brings code editor secondary window support to the development environment - NotebookCheck.net News](https://images.openai.com/static-rsc-4/6KCnSuL6beRx8OlK8LdA8dG4pHXSBTmhpaoLwaH1OhgPtjmmK6N-l_XCvKyIngXk9GQ9wF6Y9VUYiu3XPYdN-dQ39vXYJmKKwBneiKOtur7V6FzLWrE023wXRRsi3qSybxj5V5C4kn8hiL80fc7HDiwQodX50CXjFmcgHWh8ozk?purpose=inline)

Option A – Eclipse Theia als Plattform

Mein Favorit für tiefe Integration

Du baust deine eigene Workbench mit Projektbaum, Terminal, Editor, Agent-Panel, Research-Ansicht und Graph View. Theia unterstützt Browser- und Remote-Server-Architekturen sowie Erweiterungen.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://theia-ide.org\&sz=32)

theia-ide.org

+1



Link:&#x20;

GitHub – Eclipse Theia



[Quantum Programming Guide | UnitaryLab Docs](https://images.openai.com/static-rsc-4/X23-4-cWWvza3ze5DpbyPErn3Vl4C_K3ommGxGsxsTOYYIYsgym97sQQWzZCCsIb_PxZ3pyvfNss4iZpQb8Tud-wAFOfl9IPuS12dRrjaTJynkYo1ZKX_1LawWh5vujYIKl07hMLoS455YeOMWVDIPGiaVaWT6aDCf-lKpUh-Ps?purpose=inline)

Option B – OpenVSCode Server oder code-server

Gut, wenn du zuerst eine funktionierende Coding-Umgebung brauchst.

Der Editor läuft auf einem Server und wird im Browser genutzt. Dein Harness kann die Projektumgebung daneben verwalten. Du musst allerdings prüfen, wie tief du eigene Panels und Workbench-Funktionen integrieren kannst.

Links:&#x20;

OpenVSCode Server

&#x20;·&#x20;

code-server



[Needlecast - A modern approach for an agentic coding environment | Builtbyindies](https://images.openai.com/static-rsc-4/RVj4HBLffQBu8Onouj0d-cLu2mB4_fUCfkraUvQuEYAuv1ILcePqHyWy_uB1bc1EO2ZpFg1_LCITp4wjc_sIUNcV0UL1tllZ-dR3McVhwVfGVD5HL1mku8mKs0ywok3KKD5CQhSyQxI0GP_iQZkJmtv0tKjxYYgGrQmkHjtDO7o?purpose=inline)

Option C – Eigene Web-Workbench

Maximale UX-Freiheit, aber hoher Entwicklungsaufwand.

Du entwickelst Docking-System, Tabs, Projektbaum, Terminal und Agent-Views selbst. Einen Editor kannst du einbetten, ohne eine komplette IDE neu zu schreiben.

Das ist interessant, wenn die Oberfläche nicht wie VS Code aussehen soll, sondern wie eine AI-Zentrale mit spezialisierten Werkzeugen.

Meine Empfehlung: Starte mit Theia, wenn Erweiterbarkeit und IDE-Integration im Zentrum stehen. Wenn die Docking-Station-UX das eigentliche Produkt ist, entwickle eine eigene Workbench und integriere einen vorhandenen Editor.

Eine wichtige Unterscheidung: OpenVSCode Server, code-server und Theia sind keine austauschbaren Implementierungen derselben Plattform. Sie unterscheiden sich in ihrer Architektur, Erweiterbarkeit und Lizenzierung. Prüfe die konkrete Lizenz, bevor du eines davon tief in dein Produkt integrierst.

## 4. Decision Model: Jev, Laya oder ein eigenes Modell?

Das ist einer der interessantesten Teile deines Konzepts. Du willst nicht für jede kleine Entscheidung ein großes Sprachmodell aufrufen.

Dafür würde ich eine eigene Decision Engine als Teil deines Harness implementieren.

Jev

Ein Decision Model von TypeSafe AI. Es beantwortet strukturierte Fragen wie „Welches Modell ist für diese Aufgabe geeignet?“ oder „Ist das Testergebnis ausreichend?“. Es ist kein Textgenerator.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.harness.institute\&sz=32)

Harness Institute

+1



Interessant für Model Routing, Skill-Auswahl und Evaluationsentscheidungen.

Laya

Eine Alternative mit offenen Modellgewichten, die für selbst gehostete, strukturierte Entscheidungen interessant ist. Prüfe die konkrete Implementierung, Lizenz und Modellqualität, bevor du dich festlegst.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://jevlaya.cc\&sz=32)

jevlaya

+1



Interessant, wenn Entscheidungen lokal und unabhängig von einer externen API laufen sollen.

Eigene Decision Engine

Starte mit deterministischen Regeln, Scores und fest definierten Aktionen. Ergänze später ein Decision Model als austauschbaren Provider.

Mein Favorit für den Anfang, weil du jeden Schritt testen, nachvollziehen und reproduzieren kannst.

Der Ablauf könnte so aussehen:

1. Das LLM erstellt einen Plan oder schlägt einen Patch vor.
2. Die Decision Engine entscheidet anhand definierter Kriterien, welcher nächste Schritt infrage kommt.
3. Der Harness prüft Berechtigungen und Grenzen unabhängig vom Modell.
4. Der Schritt wird ausgeführt.
5. Ein Evaluator prüft das Ergebnis.
6. Das Experiment wird dokumentiert und akzeptiert, wiederholt oder zurückgerollt.

Wichtig ist, dass das Decision Model keine Sicherheitsregeln überschreiben darf. Ein Modell kann eine Aktion empfehlen; die ausführende Policy entscheidet, ob sie zulässig ist.

## 5. Memory: PostgreSQL, Redis, Obsidian und Graph View

Ich würde die vier Dinge nicht als konkurrierende Memory-Systeme betrachten, sondern als unterschiedliche Ebenen.

[Docker Hub Container Image Library | App Containerization](https://images.openai.com/static-rsc-4/Pole4xk5FkyhFJxxWDBh3yHjF1pQlxteoZyEQA0ykJQSPxLpLcdTrKWhkIQ2-SeCQp9ObINiyVMBFzoUkAM9P9RUAWW761nUuSEzxGOPsF9Keb0OX7HGw8IiQD84tSEoRfxnWrmYPSxGM1Bq9IBWZrT-EGb7Ta0uoZ1t6-qsVoY?purpose=inline)

PostgreSQL + pgvector

Die dauerhafte, strukturierte Wissensbasis: Agent-Runs, Skills, Dokumente, Quellen, Experimente, Embeddings und Beziehungen. pgvector ermöglicht Vektorsuche direkt in PostgreSQL.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub



[What are the pricing options for Redis?](https://images.openai.com/static-rsc-4/cxD0mNwOFZou3c4Llf54BhJRBatnwNaB1PRyLFmIPi8T_DppI8Tx5eXaldNM50YFgyAVtop1YVxSro1--SPQPyUwd84VpfhigqOETDMxnOrMCs17WGKsFDxEhnu6gcrlkKs6d9R4wQpKeQAR5180qRPJtYD1UoA32ydSYxE5k1U?purpose=inline)

Redis

Kurzlebige Zustände, Cache, Queue-Mechanismen und Statusinformationen. Nicht jedes Memory muss dauerhaft gespeichert werden.

[Kuwasidian | His Obsidian (note-taking app) notes](https://images.openai.com/static-rsc-4/Lvhp5cARWKyCbvkYAB8jFuQcYiMPGcbsX211Od9B2Hi2ALqtT0jqnKgniqXGpnst4G5hMXj8o__b2G6ur-dxb-nY5raXQ5F0l4_Oh-J1y_yJDSVCfECF4HvzE_68pKkFiFaBwiRQpTs5D20W_a1PraEgZuFAl8AFp6tI6biUsFw?purpose=inline)

Obsidian

Eine menschenlesbare Wissensoberfläche für Markdown-Notizen, Research-Zusammenfassungen, verlinkte Konzepte und Agent-Dokumentation. Das Obsidian-Vault kann mit Git versioniert werden.

Graph View

Visualisiert Verbindungen zwischen Dokumenten, Skills, Code-Modulen, Quellen, Experimenten und Modellen. Für eine echte Wissensgraph-Abfrage solltest du die Beziehungen zusätzlich strukturiert speichern, statt nur die Obsidian-Links zu zeichnen.

Mein Vorschlag: PostgreSQL ist die technische Datenbasis, Obsidian die editierbare Wissensoberfläche. Synchronisiere nicht blind beide Systeme in beide Richtungen, sondern definiere, welches System für welchen Datentyp verantwortlich ist.

## 6. Research, OCR und Automation

Hier würde ich möglichst viel integrieren, statt vorhandene Engines neu zu entwickeln.

| Komponente    | Rolle in deinem Harness                                                     |
| ------------- | --------------------------------------------------------------------------- |
| SearXNG       | Metasuche und Auffinden relevanter Quellen                                  |
| Firecrawl     | Webseiten extrahieren, crawlen und für die weitere Verarbeitung aufbereiten |
| Tesseract OCR | Text aus Screenshots, Scans und Dokumentbildern extrahieren                 |
| n8n           | Externe Dienste verbinden und wiederkehrende Workflows orchestrieren        |

Tesseract OCR ist eine eigenständige Open-Source-OCR-Engine unter Apache 2.0. Sie erkennt Text, ist aber kein allgemeines Bildverständnis-Modell. Für Layout, Diagramme, UI-Erkennung und komplexe Dokumente würde ich OCR mit einem Vision-Modell kombinieren.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://tesseract-ocr.github.io\&sz=32)

tessdoc

+1



### Achtung: Mirage Tesseract ist etwas anderes

Dein Link zu Tesseract by Mirage bezeichnet eine agentenorientierte Creative Engine für Videobearbeitung, Motion Graphics und Audio – nicht die OCR-Engine. Sie ist interessant, wenn dein Harness später auch kreative Medienprojekte direkt bearbeiten soll.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://mirage.app\&sz=32)

Tesseract by Mirage

+1



n8n würde ich ebenfalls integrieren, aber nicht als Kern deiner Agent-Orchestrierung. Es eignet sich für externe Automationen, Trigger und Integrationen; dein Rust-Kern sollte die Kontrolle über Agent-Lifecycle, Berechtigungen und Experimentzustände behalten. n8n bietet dafür eine Self-Hosting-Option.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.n8n.io\&sz=32)

n8n Docs

+1



## 7. Remote Development und Netzwerk

Für deine Idee einer selbst gehosteten Alternative zu Codespaces würde ich drei Schichten trennen:

- Git-Hosting: Forgejo, Gitea oder GitLab CE als Repository- und Review-System.
- Remote Workspace: Theia oder ein OpenVSCode-Server in einer isolierten Entwicklungsumgebung.
- Privater Netzwerkzugang: WireGuard oder Tailscale, damit du deine Workspaces erreichen kannst, ohne sie direkt öffentlich freizugeben.

Tailscale vereinfacht üblicherweise die Verwaltung eines privaten Netzwerks; WireGuard bietet eine schlanke VPN-Basis, auf der du deine eigene Verwaltung aufbauen kannst. Die Wahl hängt davon ab, ob du möglichst wenig Betriebsaufwand oder maximale Kontrolle willst.

Ein wichtiger Punkt: Git-Hosting, IDE-Server und Agent-Sandbox sollten getrennte Berechtigungen haben. Ein Agent, der Code ausführt, braucht nicht automatisch Admin-Zugriff auf deinen Git-Server oder dein gesamtes Netzwerk.

## 8. Wie ich das Projekt tatsächlich aufbauen würde

Nicht alle Komponenten gleichzeitig. Ich würde die Entwicklung in vier Phasen aufteilen.

1. Phase 1 – Harness Core

   Rust, Provider-Schnittstelle für LLMs, Tool Registry, Agent-Loop, Logging, PostgreSQL, Git-Integration und eine sichere Docker-Sandbox. Ein einzelner Agent soll zuverlässig eine Aufgabe planen, ausführen und testen können.
2. Phase 2 – Docking-Station UI

   TypeScript-Frontend, Projektbaum, Chat, Terminal, Task-Ansicht, Logs und Diff-Viewer. Danach Theia oder einen eigenen Editor integrieren.
3. Phase 3 – Memory und Research

   pgvector, Obsidian-Vault, Graph View, SearXNG, Firecrawl und OCR. Jede recherchierte Aussage sollte nach Möglichkeit mit Quelle und Herkunft gespeichert werden.
4. Phase 4 – Autonome Experimente

   Decision Model, spezialisierte Skills, isolierte Trainingsjobs, automatische Evaluation, reproduzierbare Experimente und Rollback. Erst dann würde ich komplexere Multi-Agent-Workflows und n8n-Integrationen ausbauen.

Der Kern sollte von Beginn an eine stabile Schnittstelle für Modelle, Skills, Sandboxes, Memory und Evaluatoren haben. Die konkrete Zahl der Dienste sollte dagegen klein bleiben, bis Messungen einen zusätzlichen Dienst rechtfertigen.

## Eine letzte wichtige Weichenstellung

Für das Design würde ich noch klären, welches Ziel du priorisierst: Das verändert vor allem die Grenzen zwischen Rust-Kern, IDE und Agent-Workspaces.