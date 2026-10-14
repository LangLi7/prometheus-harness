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

## Was heute läuft

Jede Zahl unten ist gemessen, und der Befehl, der sie gemessen hat, steht im
verlinkten Dokument. Nichts hier ist geschätzt.

| | Stand |
|---|---|
| Typprüfung | **25 Pakete grün, 0 rot** |
| Prüfungen | **1189 pass · 87 skip · 0 fail** über 55 Dateien — auf Linux, in der CI |
| Eigene CI | grün — [ci-nachweis.md](docs/status/ci-nachweis.md) |
| Installation | ein Befehl, sieben gemeldete Schritte, Geheimnisse lokal erzeugt |
| Start des Hosts | **~1,1 s** bis zur ersten HTTP-200 (gemessen: 1107–1232 ms) |
| Anmeldung | der erste Claim legt den Administrator an; Paßwörter als **Argon2id** (`m=19456, t=2, p=1` — die erste OWASP-Konfiguration) |
| Speicher | PostgreSQL 17 mit **pgvector**; Migrationen bis Fassung 7 |
| Wissensspeicher | Dokumente, Stücke und Vektorindex; Obsidian-Gewölbe, Notizen, Etiketten und Verweise — je mit Probe |
| Geheimnisse | AES-256-GCM-Umschläge, ein Datenschlüssel je Benutzer, hinter einem Schalter |
| Echtes Modell | hat über die Kern-API geantwortet (`session/create`, `session/prompt`) — [api-nachweis.md](docs/status/api-nachweis.md) |

**Und was noch fehlt**, steht genauso nüchtern da — samt der vier Aussagen, die
dieses Projekt früher gemacht hat und die die Messung inzwischen widerlegt hat:
[grenzen-und-offenes.md](docs/status/grenzen-und-offenes.md).

## Ausprobieren

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

Er installiert Bun und die Basispakete, erzeugt `.env` mit frischen Geheimnissen,
startet PostgreSQL und Redis, wartet auf deren Gesundheitsprüfungen, fährt die
Migrationen und typprüft jedes Paket. Danach bedient `bun run start` die
Oberfläche und druckt eine Adresse **mit Starttoken** — **ohne dieses Token
antwortet die Oberfläche mit 401**.

Mit `--ohne-stapel` läuft der Installer ohne Datenbank; die PostgreSQL-Prüfungen
**überspringen sich dann und sagen das**, statt ohne Datenbank zu „bestehen".
Warum es drei Einstiegsskripte gibt und warum eine `.ps1` auf einem
Standard-Windows nicht lädt, steht in
[installations-einstiege.md](docs/status/installations-einstiege.md).

## Wo das Detail steht

Diese Datei beantwortet das *Warum*. Alles andere ist ein Dokument, und der
Katalog ist [docs/INDEX.md](docs/INDEX.md) — ein Satz je Datei, 98 davon.

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

## Lizenz

Der DeepSeek Harness dient als **Quellbestand**, deshalb gilt seine **MIT-Lizenz**.
Der Urheberrechtsvermerk steht in [LICENSE](LICENSE) — die Lizenz verlangt ihn.
