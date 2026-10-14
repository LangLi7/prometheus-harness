---
description: "Prometheus Harness — ein Agent-Harness auf dem DSH-Kern: der Kern bleibt der Kern, alles andere ist eine Unit (Plugin oder Skill)."
kind: "project"
---

# Prometheus Harness

[English](README.md) | Deutsch

[![PMH CI](https://github.com/LangLi7/prometheus-harness/actions/workflows/pmh-ci.yml/badge.svg)](https://github.com/LangLi7/prometheus-harness/actions/workflows/pmh-ci.yml)

> ### Basiskern: `deepseek-harness` aus dem Upstream — **alles andere ist eine Unit**.
> Eine Unit ist ein Plugin oder ein Skill. Das ist kein Wahlspruch, sondern die
> Bauregel: der Kern wird **komponiert**, nie umgeschrieben. Was wir hinzufügen,
> ist eine Unit — ladbar, austauschbar, weglassbar.

<a id="summary"></a>
## Zusammenfassung

Repository klonen, ein Befehl — `scripts\install.cmd` unter Windows,
`./scripts/install.sh` unter Linux und macOS. Er installiert Bun und die
Basispakete, erzeugt `.env` mit frischen Geheimnissen, startet PostgreSQL 17 und
Redis 7, wartet auf deren Gesundheitsprüfungen, fährt die Migrationen und typprüft
jedes Paket. Danach bedient `bun run start` die Oberfläche und druckt eine Adresse
**mit Token**; ohne dieses Token antwortet die Oberfläche mit **401**. Gemessen:
`bun run typecheck` meldet **23 Pakete grün, 0 rot**, und
`bun test packages scripts apps` meldet **1189 pass · 87 skip · 0 fail** über 55
Dateien auf Linux.

<a id="table-of-contents"></a>
## Inhaltsverzeichnis

- [Zusammenfassung](#summary)
- [Warum es das gibt](#why-this-exists)
- [Was heute läuft](#what-runs-today)
- [Schnellstart](#try-it)
- [Wo das Detail steht](#where-the-detail-lives)
- [Bekannte Grenzen](#known-limitations)
- [Lizenz](#licence)

<a id="why-this-exists"></a>
## Warum es das gibt

Ein Harness ist nicht ein Programm. Er ist eine Agentenschleife, eine
Modellschnittstelle, ein Sitzungsspeicher, eine Oberfläche, eine Sandbox und die
Regeln, die das zusammenhalten — und das meiste davon ist bereits geschrieben,
geprüft und gepflegt. Es nachzubauen wäre der teure Weg zu einer schlechteren
Fassung.

Dieses Projekt geht deshalb den umgekehrten Weg. **Der Kern ist der Quellbestand,
kein Vorbild.** Wir lesen seine Schnittstellen über `node_modules/@deepseek-ai/`,
wir komponieren unsere Teile hinein, und wir halten **eine** harte Regel: was der
Kern liefert, wird **nie umgeschrieben, nur komponiert**. Alles, was wir
hinzufügen — Anmeldung, Wissensspeicher, Sandbox, Endpunkte und die kommenden
Sprachpakete —, ist eine **Unit** mit Manifest, erklärtem Vertrag und eigenen
Prüfungen.

Genau das macht das Projekt mehr als einen Fork im Dunkeln: wir können **Unit für
Unit beurteilt** werden, und jede Unit, die mißlingt, läßt sich austauschen statt
bereuen.

<a id="what-runs-today"></a>
## Was heute läuft

Jede Zahl unten ist gemessen, und der Befehl, der sie gemessen hat, steht daneben.
Nichts hier ist geschätzt.

| | Stand | Gemessen mit |
|---|---|---|
| Typprüfung | **23 Pakete grün, 0 rot** | `bun run typecheck` |
| Prüfungen | **1189 pass · 87 skip · 0 fail** über 55 Dateien (Linux, CI) | `bun test packages scripts apps` |
| Eigene CI | grün | [ci-nachweis.md](docs/status/ci-nachweis.md) |
| Installation | ein Befehl, sieben gemeldete Schritte | `scripts\install.cmd` / `./scripts/install.sh` |
| Start des Hosts | **~1,1 s** bis zur ersten HTTP-200 (1107–1232 ms) | `bun run start` |
| Anmeldung | der erste Claim legt den Administrator an; **Argon2id** `m=19456, t=2, p=1` | `bun test packages scripts apps` |
| Speicher | PostgreSQL 17 mit **pgvector**; Migrationen bis Fassung 7 | `bun scripts/migrate.mjs` |
| Wissensspeicher | Dokumente, Stücke, Vektorindex; Obsidian-Gewölbe, Notizen, Etiketten, Verweise | `bun test packages scripts apps` |
| Geheimnisse | AES-256-GCM-Umschläge, ein Datenschlüssel je Benutzer, hinter einem Schalter | [envelope-cost.mjs](docs/status/messsonden/envelope-cost.mjs) |
| Echtes Modell | hat über die Kern-API geantwortet (`session/create`, `session/prompt`) | [api-nachweis.md](docs/status/api-nachweis.md) |

<a id="try-it"></a>
## Schnellstart

```sh
# Windows — Eingabeaufforderung, PowerShell oder Doppelklick auf die Datei
git clone https://github.com/LangLi7/prometheus-harness.git
cd prometheus-harness
scripts\install.cmd

# Linux und macOS
git clone https://github.com/LangLi7/prometheus-harness.git
cd prometheus-harness
./scripts/install.sh
```

```sh
bun run start
```

Öffne **diese** Adresse — keine feste. Ohne das ausgegebene Token antwortet die
Oberfläche mit **401**. Der erste Besuch verlangt einen **Claim**, und das erste
Konto daraus ist der **Administrator**; weitere Konten legt ein Administrator an,
wie bei einer frischen n8n-Instanz.

Zwei Schalter zählen. `--ohne-stapel` läßt die Datenbank aus: die
PostgreSQL-Prüfungen **überspringen sich dann und sagen das**, statt ohne
Datenbank zu „bestehen". `bun run start --help` nennt jeden Schalter und jede
Umgebungsvariable, und ein unbekannter Schalter wird **abgelehnt** statt
stillschweigend geschluckt.

**Für den Betrieb** kommen die Datenbankadressen aus `.env` — der Installer
schreibt sie — und der Port aus `PMH_PORT` oder `--port`. Zwei Dinge sind bewußt
anders als bei einem Ein-Zeilen-Installer: es gibt **keine eingebaute
Ersatzdatenbank** (PostgreSQL 17 ist Voraussetzung), und **Docker wird nicht
mitinstalliert** (unter Windows ist das Docker Desktop, ein Programm mit eigener
Lizenz; unter Linux braucht das offizielle Skript root). Warum es drei
Einstiegsskripte gibt und warum eine `.ps1` auf einem Standard-Windows nicht lädt,
steht in
[installations-einstiege.md](docs/status/installations-einstiege.md).

<a id="where-the-detail-lives"></a>
## Wo das Detail steht

Diese Datei beantwortet das *Warum*. Alles andere ist ein Dokument, und der
Katalog ist [docs/INDEX.md](docs/INDEX.md) — ein Satz je Datei.

| Frage | Dokument |
|---|---|
| Wie installiere ich, und warum drei Einstiege? | [installations-einstiege.md](docs/status/installations-einstiege.md) |
| Was läuft genau — und was nicht? | [grenzen-und-offenes.md](docs/status/grenzen-und-offenes.md) |
| Welche HTTP-Fläche gibt es, mit echten Antworten? | [api-nachweis.md](docs/status/api-nachweis.md) |
| Ist die Suite grün, und woher weiß ich das? | [ci-nachweis.md](docs/status/ci-nachweis.md) |
| Wie groß ist das, und was kostet ein Start? | [groesse-und-ressourcen.md](docs/status/groesse-und-ressourcen.md) |
| Wie wird der Wissensspeicher verschlüsselt? | [schluessel-je-stueck-oder-je-benutzer.md](docs/decisions/schluessel-je-stueck-oder-je-benutzer.md) |
| Jedes Dokument, ein Satz je Datei | [INDEX.md](docs/INDEX.md) |

**Geplant, nicht gebaut:** eine Web-App und ein Mobilformat für dieselbe
Oberfläche — eine HTTP-Fläche, mehrere Gestalten. Ein Bild der Oberfläche kommt
hier hinein, sobald sie fotografierenswert ist.

<a id="known-limitations"></a>
## Bekannte Grenzen

Benannt, gemessen und nicht schöngeredet. Die vollständige Liste, samt acht
früherer Aussagen dieses Projekts, die die Messung inzwischen widerlegt hat, steht
in [grenzen-und-offenes.md](docs/status/grenzen-und-offenes.md).

- **Die Oberfläche ist ein Gerüst** — 8 Dateien unter `apps/web/src`, kein Chat
  und kein Dateibaum. (Gezählt am 14.10.2026; hier stand bis dahin *5*.)
- **Sitzungen liegen als JSONL**, nicht in PostgreSQL.
- **Verdichtung läuft auf Anforderung; die Selbstauslösung ist unbelegt** —
  `/compact` wird ausgeführt und schreibt verkettete Ereignisse
  `compaction/start|summary|end` mit einer **echten** Zusammenfassung
  ([verdichtung-nachweis.md](docs/status/verdichtung-nachweis.md)). Was **keine**
  Messung zeigt, ist ob sie bei **Kontextdruck von selbst** auslöst. Hier stand bis
  zum 14.10.2026 *„Verdichtung fehlt"*; die Messung hat das widerlegt
  ([plugin-inventur.md](docs/status/plugin-inventur.md)).
- **Der Wissensspeicher hat keinen Indexer** — Schema und Proben gibt es,
  Einbettungen und Dateiwächter nicht.
- **Die Datenbankprüfungen laufen gegen die Betriebsdatenbank**, zehn scheitern.
- **Der Geheimnis-Haken prüft nichts** — `gitleaks` ist nicht installiert.

<a id="licence"></a>
## Lizenz

Der DeepSeek Harness dient als **Quellbestand**, deshalb gilt seine **MIT-Lizenz**.
Der Urheberrechtsvermerk steht in [LICENSE](LICENSE) — die Lizenz verlangt ihn.
