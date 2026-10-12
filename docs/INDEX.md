# Katalog — Dokumentation Prometheus Harness

> **Was diese Datei ist:** das Register. Jedes Dokument mit einem Satz, nach Themen
> geordnet, wie in einer Bibliothek. Wer hier landet, findet in einer Minute die richtige
> Datei — ohne im Baum zu suchen.
>
> Stand: 12.10.2026 · 17 Arbeitsdokumente, 4 Ordner im Bestand, dazu der Doku-Bestand des
> Cores mit 692 Dateien.

---

## 0. In einer Minute: worum es geht

Ein **Assistent-Agent-Harness** wird neu gebaut — nicht als Abwandlung, sondern von Grund
auf, mit dem DeepSeek Harness als **Vorlage** statt als Codebasis. Alles Zusätzliche ist
eine steckbare **Unit**: anschließbar, absteckbar, mit eigener Version. Der Core bleibt
unangetastet.

- Zielbild: [vision.md](vision.md)
- Kurzprofil in einem Dokument: [project-profile.md](project-profile.md)
- Warum überhaupt: [concept.md](concept.md)

---

## 1. Ausrichtung — *wohin das Ganze soll*

| Dokument | In einem Satz |
|---|---|
| [vision.md](vision.md) | Nordstern: Assistent-Agent-Harness mit Docking-Oberfläche, eigenem Gedächtnis, Arbeit als Forscher und Automatisierer |
| [project-profile.md](project-profile.md) | Kurzprofil: Sprachen, Infrastruktur, Vorbilder, was entschieden ist und was offen |
| [concept.md](concept.md) | Das Problem (eingenähte Anpassungen) und die Antwort: alles ist ein Unit, der Core ist unantastbar |
| [roadmap.md](roadmap.md) | Die Reihenfolge: Core läuft → ein Unit beweist die Kette → dann Sprachgrenzen |

## 2. Technik — *womit gebaut wird*

| Dokument | In einem Satz |
|---|---|
| [stack.md](stack.md) | Schichten und Sprachgrenzen: TypeScript-Core als Kernel, Go und Rust als Dienste, C als Muster |
| [risks.md](risks.md) | Die Risiken mit Gegenmaßnahmen — zuerst die ungeprüfte Bun-Frage bei nativen Addons |

## 3. Entscheidungen — *was noch zu klären ist*

| Dokument | In einem Satz |
|---|---|
| [decisions/core-supply.md](decisions/core-supply.md) | **Entschieden:** der Agent-Core kommt als Abhängigkeit vom Upstream (Weg B, Hybrid) — besessen werden nur Host, Units und Dienste |
| [decisions/hybrid-then-self-build.md](decisions/hybrid-then-self-build.md) | **Entschieden:** Hybrid ist der erste Meilenstein, Eigenbau (A) das Ziel — samt NixOS-Selbständerung, Plugin-Export, Web-Attach und den verbindlichen Subagent-Regeln |
| [decisions/open-questions.md](decisions/open-questions.md) | Der Fragenkatalog mit Abhängigkeiten: Laufzeit, Umfang des Cores, Loop, Gedächtnis, Git-Plattform, Netzwerk |

## 4. Gestaltung — *wie es aussehen und sich anfühlen soll*

| Dokument | In einem Satz |
|---|---|
| [design/ui-keep-cut.md](design/ui-keep-cut.md) | **Die Auswahl:** was aus der Web-UI-Vorlage in den neuen Harness wandert, was ersetzt wird, was entfällt |
| [design/sketches.md](design/sketches.md) | Das Varianten-Verfahren der Skizzen-Sammlung und wie wir es weiterführen |
| [design/realtime-collaboration.md](design/realtime-collaboration.md) | Zielbild: mehrere Menschen **und** Agenten bearbeiten gleichzeitig dasselbe Dokument |
| [design/README.md](design/README.md) | Einstieg in den Gestaltungsbereich samt Bildmaterial |

## 5. Nachschlagewerk — *Belege und Vorlagen*

| Dokument | In einem Satz |
|---|---|
| [reference/reference-dsh.md](reference/reference-dsh.md) | Gemessene Zahlen zum DeepSeek Harness: Build, TypeScript 7, was er schon kann, Fallstricke |
| [reference/reference-templates.md](reference/reference-templates.md) | Die vier festgelegten Vorlage-Verzeichnisse mit exakten Pfaden und Upstream-Adresse |
| [reference/webui-dev.md](reference/webui-dev.md) | Wie man die Web-UI-Vorlage startet, samt Fallstricken und protokolliertem Testlauf |
| [reference/skills-index.md](reference/skills-index.md) | Das Register-Format der Skill-Bibliothek — übernommenes Konzept, nicht kopierter Inhalt |
| [reference/ChatGPT-stackexplane.md](reference/ChatGPT-stackexplane.md) | Fremde Stellungnahme zum Gesamtaufbau: modulare Plattform, Schnittstellen statt Eigenbau |

## 6. Doku-Bestand des Cores — *die Vorlage selbst*

| Ordner | In einem Satz | Umfang |
|---|---|---|
| [dsh/README.md](dsh/README.md) | Einstieg in den Core-Doku-Bestand: Aufbau, Rollen der drei Ordner, Grobgliederung | — |
| [dsh/original/](dsh/README.md) | Der Doku-Stand der Vorlage, wie übernommen: 217 kanonische Dokumente, 212 chinesische Fassungen, 212 Übersetzungstabellen, 47 Schemadateien, 4 Bilder | 692 Dateien |
| [dsh/translation_en/](dsh/translation_en/README.md) | Englische Fassung aller 692 Dateien: Originale unverändert, chinesische Dokumente neu übersetzt | 692 Dateien |
| [dsh/translation_de/](dsh/translation_de/README.md) | Deutsche Fassung aller 217 kanonischen Dokumente; Stand und offene Liste stehen im Manifest | im Aufbau |

**Abdeckungsregel:** Zu **jeder** Datei in `dsh/original/` gibt es eine gleichnamige Datei in
`dsh/translation_en/` — Dateinamen samt Endung bleiben erhalten (`foo.md`, `foo.zh.md`,
`foo.i18n.yaml`, `foo.schema.json`, `bild.png`). `translation_en/foo.zh.md` enthält die
**englische** Übersetzung des chinesischen Dokuments.

**Regel:** `dsh/original/` ist Quelle und wird **nie** geändert. Übersetzungen liegen
ausschließlich in `translation_*` — so bleibt der Vergleich mit dem Upstream möglich.

### Batching-Regel für Übersetzungsläufe (verbindlich)

In Scope sind **genau zwei Sprachen**: Deutsch (`translation_de`) und Englisch
(`translation_en`). Mehr Sprachen gibt es nicht, mehr Arbeiter braucht es nicht.

| Regel | Bedeutung |
|---|---|
| **Ein Arbeiter pro Sprache — nicht pro Datei** | Ein Auftrag = ein ganzer Ordner (z. B. „alles unter `subsystems/`"), nie eine einzelne Datei |
| **Keine Enkel** | Ein Arbeiter startet **keine** Subagenten. Steht als wörtliche Anweisung im Auftrag |
| **Obergrenze 2–3 Arbeiter gleichzeitig** | Mehr ist Budgetverschwendung, nicht Schnelligkeit |
| **Erst messen, dann starten** | Vorher zählen, welche Dateien noch fehlen; nur die offenen an einen Arbeiter geben |
| **Große Dateien sind kein Grund zu teilen** | Eine Datei wird in mehreren Schreibvorgängen erledigt, nicht von mehreren Agenten |

**Warum das hier steht — der Vorfall vom 12.10.2026.** Der erste Übersetzungslauf eskalierte
von 12 geplanten Arbeitern auf **52 Agenten-Sitzungen**: 12 von mir gestartet, 40 von den
Arbeitern selbst nachgestartet, überwiegend eine Datei oder eine Dateigruppe pro Kind. Ursache
war kein Fehler der Harness, sondern ein Auftragsfehler: Die Aufträge listeten 18–46 Dateien
pro Arbeiter und sagten „arbeite große Dateien notfalls in mehreren Schreibvorgängen ab" —
gelesen wurde das als Lizenz zum Parallelisieren. `tool-subagent` begrenzt nur die **Tiefe**
(`maxDepth`-Default 3), nicht die **Breite**: ein Arbeiter darf beliebig viele Kinder
gleichzeitig starten. Unterbrechen half nicht, weil die Arbeiter Ersatz starteten.

**Erwartete Arbeiterzahl nach dieser Regel:** 1 je Sprache je Ordner, also **2–3 statt 12+**.
Der frühere Auftrag „je 18–46 Dateien an einen Arbeiter" ist damit ersetzt.

## 7. Stand und Nachweise — *was tatsächlich gilt*

| Dokument | In einem Satz |
|---|---|
| [status/README.md](status/README.md) | Die Regeln der Momentaufnahmen: jeder Snapshot mit Datum und Befehl, Gemessenes getrennt von Gedeutetem, der 4-Stunden-Takt und seine ehrliche Grenze |
| [status/git-audit.md](status/git-audit.md) | Jeder Push mit Nachweis: lokaler `HEAD` gegen `origin/main` über die API geprüft, samt der Entscheidung „privat" |
| [status/2026-10-12.md](status/2026-10-12.md) | Der erste Snapshot: Harness läuft (HTTP 200), Repository erstmals versioniert, und die sechs offenen Lücken L1–L6 |

## 8. Weitere Ablage

| Ordner | In einem Satz |
|---|---|
| [source/README.md](source/README.md) | Rohmaterial und Auszüge, die noch nicht ausgewertet sind (derzeit leer) |

---

## Konventionen

- **Sprache:** Arbeitsdokumente auf Deutsch. Angelsächsische Fachbegriffe bleiben stehen,
  wo sie die genaueren sind (Agent-Loop, Session, Plugin, Unit, Bundle, Sandbox).
- **Belegt statt behauptet:** Zahlen und Befunde nennen Datum und Quelle. Gemessenes wird von
  Gedeutetem getrennt.
- **Ein Satz pro Dokument** in diesem Katalog — wer mehr braucht, öffnet das Dokument.
- **Neue Datei? Dann hier eintragen.** Ein Dokument, das im Katalog fehlt, gilt als
  verlegt und wird nicht gefunden.
- **Ordnerlogik:** Ausrichtung oben, Technik, Entscheidungen, Gestaltung, Nachschlagewerk,
  Core-Bestand. Wächst ein Thema über eine Handvoll Dateien, bekommt es einen eigenen Ordner
  mit `README.md`.
