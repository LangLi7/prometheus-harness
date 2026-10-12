# `dsh` — Dokumentation des Harness-Core

Dieser Teilbaum enthält die **Dokumentation der Vorlage**, aus der der neue Harness
hervorgeht. Er ist bewusst von unseren eigenen Arbeitsdokumenten getrennt: hier steht,
**was der Core tut**, nicht was wir vorhaben.

Quelle der Inhalte ist der Core unter `C:\Users\Chang\harness\prometheus-harness`
(Upstream: `https://github.com/deepseek-ai/deepseek-harness`). Die Pfade und Dateinamen
unten sind wörtlich aus der Vorlage übernommen.

## Drei Ordner, drei Rollen

| Ordner | Rolle | Regel |
|---|---|---|
| `original/` | **Quelle.** Der Doku-Stand der Core-Vorlage, unverändert übernommen — englische Originale, chinesische Fassungen (`*.zh.md`), Übersetzungstabellen (`*.i18n.yaml`), Schemadateien (`*.json`), Bilder | **Niemals ändern.** Jede Bearbeitung hier würde den Vergleich mit dem Upstream zerstören |
| `translation_en/` | **Englische Fassung.** Alle 692 Dateien aus `original/`: die englischen Originale unverändert, die chinesischen Dokumente neu ins Englische übersetzt, Übersetzungstabellen, Schemadateien und Bilder unverändert | Ergänzend zur Quelle, nie an ihrer Stelle |
| `translation_de/` | **Deutsche Fassung.** Alle 217 kanonischen Dokumente übersetzt | Pflege in eigener Hand; `original/` bleibt unberührt |

**Abdeckungsregel:** Zu **jeder** Datei in `original/` gibt es eine gleichnamige Datei in
`translation_en/` und — bei den Dokumenten — in `translation_de/`. Dateinamen werden
einschließlich der Endung beibehalten: `foo.md`, `foo.zh.md`, `foo.i18n.yaml`,
`foo.schema.json`, `bild.png`. In `translation_en/foo.zh.md` steht also die **englische**
Übersetzung des chinesischen Dokuments — der Dateiname benennt die Herkunft, nicht die
Sprache.

## Was in den Übersetzungsordnern woher kommt

| Herkunft in `original/` | `translation_en/` | `translation_de/` |
|---|---|---|
| `foo.md` (englisch) | unverändert kopiert | ins Deutsche übersetzt |
| `foo.zh.md` (chinesisch) | ins Englische übersetzt | nicht enthalten — die deutsche Fassung steht in `foo.md` |
| `foo.i18n.yaml` (Übersetzungstabelle) | unverändert kopiert | nicht enthalten |
| `foo.schema.json` (Schema) | unverändert kopiert | nicht enthalten |
| `bild.png` | unverändert kopiert | nicht enthalten |

Die vollständige Liste mit Sprache und Ausgabe steht in
[translation_en/README.md](translation_en/README.md) und
[translation_de/README.md](translation_de/README.md).

## Umfang

| Ordner | Dateien | Inhalt |
|---|---|---|
| `original/` | 692 | 217 kanonische `.md`, 212 chinesische `.md`, 212 `.i18n.yaml`, 47 `.json`, 4 `.png` |
| `translation_en/` | 692 | alle Dateien mit Entsprechung |
| `translation_de/` | 217 | alle kanonischen Dokumente |

### Grobgliederung der Vorlage

| Pfad | Inhalt |
|---|---|
| `architecture.md`, `agent-lifecycle.md`, `capability-seams.md`, `module-graph.md`, `graph-atlas.md` | Aufbau des Cores: Komposition, Pakete, Agent-Loop, Fähigkeitsnähte |
| `subsystems/` | je Teilsystem eine Seite: core, workspace, filesystem, jobs, approval, credentials, extensions, workflow, client-modules, office-to-pdf, … |
| `tool-catalog.md`, `tool-execution-pipeline.md`, `config-catalog.md`, `cli-help.md` | erzeugte Nachschlagewerke: Werkzeuge, Konfiguration, Kommandozeile |
| `user/guide/`, `user/develop/` | Anwender- und Entwickleranleitung: Provider, Netzwerk-Proxy, Python-SDK, Zeitplan, Plugins schreiben |
| `cookbook/` | Rezepte: ein Paket, ein Werkzeug, eine Remote-API, ein Fremdpaket hinzufügen |
| `cordis-primer.md`, `cordis-api/`, `cordis-tutorial/` | das Plugin-System, auf dem alles beruht |
| `postmortem/` | vier dokumentierte Fehlerfälle mit Ursache und Lehre |
| `persistence-changes/`, `upgrade-guide/` | Formatänderungen und Versionsumstellungen |
| `i18n/` | die Zweisprachigkeitsregeln des Upstreams |
| `AGENTS.md`, `development.md`, `testing.md`, `defensive-patterns.md` | Arbeitsregeln für Beitragende |

Zurück zum [Katalog](../INDEX.md).
