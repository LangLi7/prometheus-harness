# Skill-Bibliothek: Konzept und Register

Vorbild aus `H:\Projekt\Programmieren\Prometheus\skills` (Pfad wörtlich). Das Verzeichnis
selbst bleibt **unangetastet** — hier steht nur das Konzept und ein Register, damit wir es
für Prometheus übernehmen können.

## Warum das Konzept gut ist

1. **Ein Ordner pro Fähigkeit**, nicht ein Monolith. Jeder Skill ist eine Einheit, die man
   einzeln laden, tauschen oder löschen kann.
2. **Register statt Suchen.** Eine einzige `INDEX.md` beantwortet „was gibt es überhaupt?" —
   ohne die Dateien zu öffnen.
3. **Kategorie → Skill → Beigaben.** Grob sortiert nach Thema, innerhalb des Skills alles,
   was er zum Arbeiten braucht.
4. **Ein Format für alles.** Jeder Skill hat `SKILL.md`; der Index zieht daraus die
   Ein-Satz-Beschreibung. Damit ist der Index erzeugbar, nicht handgepflegt.

## Aufbau der Vorlage (gemessen, nicht geschätzt)

```
skills/
├── INDEX.md                    ← Register: 16 Kategorien, 100 Skills (~11 KB)
├── apple/                      ← 4 Skills   (apple-notes, apple-reminders, findmy, imessage)
├── autonomous-ai-agents/       ← 6
├── creative/                   ← 16
├── data-science/               ← 1
├── email/                      ← 1
├── git/                        ← 1
├── github/                     ← 6
├── media/                      ← 4
├── misc/                       ← 2
├── mlops/                      ← 6 (davon 3 Unterkategorien: evaluation, inference, models)
├── note-taking/                ← 1
├── productivity/               ← 15
├── research/                   ← 6
├── smart-home/                 ← 1
├── social-media/               ← 1
└── software-development/       ← 26
```

Gezählt über `SKILL.md`: **100 Skills** — deckt sich mit der Kopfzeile des Registers, das
„100 Skills in 19 Kategorien" nennt (19 = 16 Ordner + 3 Unterkategorien unter `mlops`).

### Aufbau eines einzelnen Skills

```
research/arxiv/
├── SKILL.md                    ← Pflicht: Anleitung, Frontmatter mit Name + Beschreibung
└── scripts/
    └── search_arxiv.py         ← Beigaben: ausführbare Helfer
```

Beigaben, die in der Vorlage vorkommen:

| Ordner | Inhalt |
|---|---|
| `references/` | Nachschlagewerk, das der Skill bei Bedarf liest (z. B. `excalidraw/references/colors.md`) |
| `scripts/` | ausführbare Helfer (Python, Shell, JS) |
| `templates/` | Vorlagen, die der Skill kopiert (z. B. LaTeX-Templates für Paper) |
| `assets/` | Bilder und Sonstiges |
| `DESCRIPTION.md` | Kurzbeschreibung **je Kategorie** (nicht je Skill) |

### Format des Registers

Eine Überschrift je Kategorie mit Anzahl, darunter je Skill **eine Zeile**: fetter Name,
Gedankenstrich, Ein-Satz-Zweck. Beispiel aus der Vorlage:

```markdown
## research (6)

- **arxiv** — Search arXiv papers by keyword, author, category, or ID.
- **grounded-citations** — Ground answers and documents in cited, verifiable sources.
```

Zusätzlich nennt die Vorlage in der Kopfzeile **Herkunft und Grenzen** der Sammlung
(Quelle, Snapshot statt Live-Verknüpfung, was bewusst *nicht* enthalten ist). Das ist der
Teil, der bei uns am häufigsten fehlen würde — deshalb gehört er ins Format.

## Was wir daraus übernehmen

| Regel | Für Prometheus |
|---|---|
| Ein Ordner = ein Skill, `SKILL.md` als Pflichtdatei | ja |
| Beigaben in `references/`, `scripts/`, `templates/`, `assets/` | ja |
| `INDEX.md` als Register mit Kategorie, Anzahl, Ein-Satz-Zweck | ja |
| Kopfzeile mit Quelle, Stand und bewussten Lücken | ja |
| `DESCRIPTION.md` je Kategorie | optional — nur wenn eine Kategorie wächst |
| Snapshot-Kopie statt Live-Verknüpfung | **nein** — wir wollen eine Quelle der Wahrheit, keine Kopie, die driftet |

**Abgrenzung:** Die vorhandene Skill-Auswahl dieser Vorlage ist bereits in unseren Docs
beschrieben — siehe `reference-dsh.md` (was der Harness selbst schon kann) und die
Skill-Liste der Sitzung. Diese Datei beschreibt nur das **Format**.
