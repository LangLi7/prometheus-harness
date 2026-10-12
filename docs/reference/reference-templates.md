# Referenz-Vorlagen für den neuen Harness

Notiz zum Stand der Vorlagen. Der neue Harness wird **von Grund auf neu gebaut** und nutzt
die folgenden Verzeichnisse als **richtige Vorlagen** — nicht als Wegwerf-Kopien.
Alle Pfade sind wörtlich so notiert, wie sie genannt wurden.

---

## 1. Harness-Core-Vorlage

```
C:\Users\Chang\harness\prometheus-harness
```

- Kanonische **Vorlage / Fork-Basis** für den neuen Harness-Core.
- Aktueller Upstream dieser Core-Vorlage:
  `https://github.com/deepseek-ai/deepseek-harness`
  (dies ist der **aktuelle Upstream** des Harness-Core-Vorlagenstandes)

## 2. Web-UI-Vorlage

```
H:\Projekt\Programmieren\Prometheus\webui
```

- Nur das Unterverzeichnis **`webui`** ist relevant.
- Der Rest von `H:\Projekt\Programmieren\Prometheus` wird **ignoriert**.
- Wie man sie lokal startet: [webui-dev.md](webui-dev.md).

## 3. Skizzen

```
H:\Projekt\Programmieren\Prometheus\sketches
```

- **Zweck:** Wegwerf-Entwürfe der Oberfläche als je **eine einzelne HTML-Datei** —
  Design-Varianten zum Vergleichen, bevor daraus echte Komponenten werden.
- Aufbau (Stand der Einsicht):

```
index.html                    ← Übersicht/Einstieg
bal.js, balcheck.js           ← kleine Hilfsskripte (je ~1 KB)
002-g-universe/index.html     ← aktuelle Variante (~31 KB)
archive/002-b-void/           ← verworfene Varianten, je index.html
archive/002-d-orbit/
archive/002-e-orbitvoid/
archive/002-f-galaxy/
```

- Muster: fortlaufend nummerierte Varianten, die aktuelle bleibt oben, alles Veraltete
  wandert nach `archive/`. Genau diese Arbeitsweise soll für unseren UI-Entwurf gelten:
  erst Varianten in einer Datei, dann Komponenten.

## 4. Skill-Bibliothek

```
H:\Projekt\Programmieren\Prometheus\skills
```

- Sammlung **allgemein verwendbarer Skills moderner KI-Agenten**, mit `INDEX.md` als
  Register. Das Konzept ist gut und wird für Prometheus übernommen — Details in
  [skills-index.md](skills-index.md).

---

## 5. Status der referenzierten Verzeichnisse

**Keines der referenzierten Verzeichnisse wurde von Hand verändert.** Es wurden dort keine
Dateien geschrieben, erstellt, gelöscht oder bearbeitet — die Vorlagen bleiben unangetastet.
Einzige Ausnahme ist das, was der Dev-Server der `webui` beim **Lauf** selbst anlegt
(Vite-Cache im bereits vorhandenen `node_modules/.vite/`), siehe [webui-dev.md](webui-dev.md).

## 6. Wo diese Notiz steht

Dieses Dokument liegt seit der Katalogisierung unter `docs/reference/`. Der vollständige
Dokumenten-Überblick steht im [Katalog](../INDEX.md).
