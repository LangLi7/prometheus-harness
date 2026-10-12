# Vision

> Nordstern. Beschreibt das **Zielbild**, nicht den Plan. Was zuerst gebaut wird, steht in
> [roadmap.md](roadmap.md). Widersprüche und Risiken sind absichtlich mitgeschrieben.

## Der Kern in einem Satz

Ein **Assistent-Agent-Harness** auf Basis des DeepSeek Harness, dessen Fähigkeiten als
steckbare Units organisiert sind — mit einer Oberfläche auf Docking-Station-Niveau, einem
eigenen Gedächtnis, und der Möglichkeit, als Forscher und Automatisierer für KI-Modelle zu
arbeiten.

---

## Fundament

| Baustein | Rolle |
|---|---|
| **DeepSeek Harness** | Basis: Plugin-System (Cordis), Agent-Loop, Session-Modell, Kompositionsformat |
| **Bun + Go + TS 7** | Laufzeiten und Sprachen; Typecheck mit TS 7 |
| **Rust statt Python** | schwere und systemnahe Werkzeuge |

## Agent-Core

TypeScript auf Bun. Das Plugin-System ist JavaScript — **der Core muss JS sein**, sonst
lassen sich keine Units laden. Bun führt TypeScript direkt aus; der Typecheck läuft
separat mit TS 7.

## Oberfläche: Docking-Station-Technologie

Vorbild für Docking und Wissensdarstellung: **Obsidian**.

> **Aufgelöst (12.10.2026):** Die gemeinten „Zeichnungen" sind die **eigenen Skizzen** im
> Verzeichnis `H:\Projekt\Programmieren\Prometheus\sketches\` — insbesondere
> `002-g-universe` (31 KB) sowie die archivierten Varianten `002-b-void`, `002-d-orbit`,
> `002-e-orbitvoid`, `002-f-galaxy`. Sie sind das **Zoom- und Darstellungsvorbild**.

> **Das übrige Projekt dort ist ignoriert.** `H:\Projekt\Programmieren\Prometheus` (Go/Rust,
> „Heusc") war ein **Basis-Experiment** auf dem Weg zu einer neuen Harness und ist **nicht**
> die Grundlage dieses Vorhabens. Nur die **Skizzen** werden als Darstellungsvorbild
> herangezogen. Nicht als Codebasis, nicht als Architektur-Referenz. Siehe
> [reference-templates.md](reference/reference-templates.md).

Anforderungen, die aus dem Docking-Konzept folgen:

- **Zoom** — nicht nur Skalierung, sondern Bedeutungsebenen: Übersicht → Projekt → Datei →
  Detail. Bei welcher Stufe wechselt die Darstellung, nicht nur die Größe?
- **Dockbare Panels** — frei anordbar, speicherbare Layouts, mehrere Ansichten desselben
  Inhalts.
- **Projekt-Stack-Anzeige** — Inhalt und Ordnerstruktur wie in einer IDE.
- Drei Varianten sind denkbar und sollen **konfigurierbar** sein statt festgelegt:
  Dock-Leiste, IDE-artige andockbare Panels, unendliche Zoom-Leinwand.

## Echtzeit-Bearbeitung

Mehrere Teilnehmer bearbeiten dasselbe Dokument gleichzeitig — **Menschen und Agenten
gemeinsam**, wie bei Figma oder Google Docs.

Eigene Notiz: [realtime-collaboration.md](design/realtime-collaboration.md)

## Speicher und Daten

| Baustein | Rolle |
|---|---|
| **PostgreSQL** | strukturierte Daten **und** Vektorähnlichkeit (`pgvector`) — ein System statt zwei |
| **Redis** | Zwischenspeicher und Nachrichtenverteilung |
| **Obsidian** | Gedächtnis als Markdown-Dateien; Graph View als Wissensnetz |

**Der Konflikt, der hier entschieden werden muss:** Wenn Obsidian das Gedächtnis *ist*,
dann liegt das Gedächtnis in **Dateien mit Markdown und Wikilinks**. Das ist nachvollziehbar,
versionierbar und im Graph View sichtbar — aber es ist eine Festlegung, die später teuer zu
ändern ist. Und es braucht eine Antwort auf gleichzeitige Schreibzugriffe.

## Entwicklungsumgebung

Git-Anbindung über **Forgejo**, **Gitea** oder **GitLab CE** (Auswahl offen).
Fernzugriff auf die Umgebung über:

- [OpenVSCode Server](https://github.com/gitpod-io/openvscode-server)
- [code-server](https://github.com/coder/code-server)
- [Eclipse Theia](https://github.com/eclipse-theia/theia)

Als Alternative zu GitHub Codespaces bzw. VS Code Remote Tunnels.

## Suche und Extraktion

**Firecrawl** für Web-Extraktion, **SearXNG** für Metasuche.

## Entscheidungsmodelle: Jev / Laya

**Recherchiert am 12.10.2026.** Beide sind **System-One-Entscheidungsmodelle**: Software
sendet einen Zustand und eine strukturierte Frage und erhält eine **typisierte
Wahrscheinlichkeitsentscheidung** — sie schreiben keinen Text.

| | Jev | Laya |
|---|---|---|
| Herkunft | TypeSafe AI | quelloffen, erschien Tage nach Jev |
| Betrieb | gehostet, nur API | lokal lauffähig (~421 Mio. Parameter) |

Quellen: [Jev vs Laya](https://shop.zimaspace.com/blogs/product-comparisons/jev-vs-laya-decision-model),
[What is Jev](https://medium.com/aiguys/what-is-jev-inside-typesafe-ais-decision-first-model-728cbc19f447),
[System One Models & Laya](https://pub.towardsai.net/introducing-system-one-models-laya-and-jev-56b7271da9c2),
[arXiv-Analyse](https://arxiv.org/html/2609.30216v1).

**Wo das im Harness hingehört.** Nicht als Ersatz für den Agent-Loop, sondern für die
**begrenzten Entscheidungen am Rand**: Werkzeugwahl, Rückfrage ja/nein, Umschaltung
zwischen Modellen, „ist das erledigt?". Beispiele aus dem Referenz-Harness, an denen so
etwas heute mit einem vollen Modellaufruf gelöst wird: Vision-Umschaltung, Fehlklassifikation,
Eskalation. Genau dafür ist ein kalibriertes Entscheidungsmodell billiger und schneller als
ein Sprachmodell.

## Orchestrierung: LangChain / LangGraph

**Der Konflikt.** Der Harness **hat bereits** einen Agent-Loop und ein
Multi-Agenten-System (Agent Teams mit Roster, Postfächern, Task-Board). Ein zweites
Orchestrierungs-Framework darüber zu legen schafft zwei konkurrierende Loops.

**Die Kernfrage lautet deshalb:** *Welcher Loop gewinnt?* Sie ist in
[open-questions.md](decisions/open-questions.md) festgehalten und muss vor der ersten Zeile Code
entschieden werden.

## Netzwerk

**Tailscale** oder **WireGuard**; als Alternative zu Cloudflare-Tunnel.
Wofür genau — Fernzugriff auf die Harness, auf die Entwicklungsumgebung, beides? Das
entscheidet, ob ein Tailnet genügt oder ein Reverse-Proxy dazugehört.

## Werkzeuge und Dienste

| Baustein | Rolle |
|---|---|
| **n8n** | Workflow-Automatisierung |
| **Tesseract** | OCR — [tesseract-ocr.org](https://tesseractocr.org/), [GitHub](https://github.com/tesseract-ocr/tesseract) |
| **mirage.app** | **ungeprüft** — Recherche ergab nur Foto-Editor-Apps, nicht den gemeinten Dienst. Muss vom Betreiber präzisiert werden. |

## Ziele

- **Assistent** — alltägliche Agent-Arbeit.
- **Forscher** — Recherche und Auswertung, auch über KI-Modelle.
- **Automatisierung** — Modellvergleiche, Feinabstimmung, wiederkehrende Abläufe als Skills.

---

## Die vier Regeln bleiben

Alle Bausteine dieser Vision sind **Units oder Dienste** — nichts davon wird in den Core
eingebaut:

1. Der Core ist unantastbar.
2. Kein Unit importiert Interna des Cores.
3. Dienste starten mit der Harness und scheitern sichtbar.
4. Der JS-Core bleibt der Kernel; jede andere Sprache ist ein Dienst, den er aufruft.

## Das eigentliche Problem dieser Vision

Sie nennt rund **fünfzehn Systeme über fünf Sprachen**. Was fehlt, ist nicht die Idee,
sondern die **Reihenfolge**.

Ohne Reihenfolge wird nichts fertig — nicht weil die Bausteine falsch wären, sondern weil
jeder einzelne davon Wochen kostet und drei Sprachen gleichzeitig jeden Fehler mehrdeutig
machen: Bei einem Ausfall kann niemand sagen, welche Sprache schuld ist.

Die Reihenfolge steht deshalb in [roadmap.md](roadmap.md) — und sie ist so gebaut, dass
**nach jedem Schritt etwas vorzeigbar Läuft**.
