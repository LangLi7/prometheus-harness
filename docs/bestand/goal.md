# Ziel — vom Bestand zum belegten Unit

> **Was dieses Blatt ist:** das Ziel für den Ausbau von Prometheus Harness aus dem Bestand
> heraus. Es **ersetzt** weder `roadmap.md` noch `arbeitspakete.md` noch
> `ziel-liste-ist-und-plan.md` — es ist die Ebene darunter: *welche Fähigkeit kommt als
> nächstes, aus welchem Grund, und woran erkennt man, dass sie da ist.*
>
> **Verhältnis zu den bestehenden Zielen (keine zweite Wahrheit):**
> `arbeitspakete.md` bleibt **verbindlich für Arbeitspakete** (Regeln A1–A7, Phasen
> `geplant → in Arbeit → Nachweis offen → abgenommen`). `ziel-liste-ist-und-plan.md` bleibt
> **verbindlich für die Technikliste** (Klassen A/B/C/D). Dieses Blatt fügt die **Bestandsseite**
> hinzu: was von außen hereinkommt und in welcher Bauform.

**Stand:** 21.10.2026

---

## 1. Das Ziel in einem Satz

**Jede Fähigkeit, die Prometheus Harness bekommt, ist eine Unit mit belegtem Nutzen — keine
Sammlung, kein zweiter Wissensspeicher, kein Fremdprojekt, das eine App mitbringt.**

Drei Sätze, die daraus folgen und die jede Zeile der Todo-Liste prüfen muss:

1. **Der Kern bleibt der Kern.** Was hereinkommt, ist Plugin, Skill, Bibliothek oder Werkzeug —
   nie ein Umbau des Kerns (`MAPPING.md`, `decisions/core-supply.md`).
2. **Eine Lücke, eine Übernahme.** Wer etwas einbaut, nennt die Lücke aus
   [`checkup-skills-plugins.md`](checkup-skills-plugins.md) §4, die es schließt. Ohne Lücke keine
   Übernahme.
3. **Belegt heißt gemessen.** Ein Punkt ist erledigt, wenn ein Befehl und sein Ergebnis dastehen
   (Regel A3). „Ist eingebaut" ist kein Nachweis.

---

## 2. Die Ausgangslage — was der Checkup ergeben hat

| Befund | Zahl | Folge |
|---|---|---|
| Die **wirksamen Skills liegen außerhalb des Repos** | 23 im Benutzer-Scope, 3 im Repo | **L1**: ein frischer Klon hat sie nicht |
| **Leere Paketordner** | 319 von 401 | **L2**: Steckplätze, keine Lücken — aber auch keine Fähigkeiten |
| **Browser-Unit fehlt** | `packages/browser-use` = 0 Dateien | **L3**: benutzt, nicht gebaut |
| **Kein Diagramm-Skill** | 0 Treffer | **L4** |
| **Keine Video-Fähigkeit** | nur `image_generate` | **L5** |
| **Keine Skill-Evals** | 0 Verfahren für 23 Fähigkeiten | **L6** |

**Die Reihenfolge folgt aus dem Preis, nicht aus dem Reiz:** was in einem Nachmittag eine belegte
Lücke schließt, kommt vor dem, was eine dritte Laufzeit mitbringt.

---

## 3. Die Phasen

### Phase 0 — Bestand (erledigt am 21.10.2026)

**Ziel:** wissen, was da ist, bevor etwas dazukommt.

| Ergebnis | Beleg |
|---|---|
| Bestands-Checkup mit vier Schichten (Kern, Plugins, Skills, MCP) | [`checkup-skills-plugins.md`](checkup-skills-plugins.md) |
| Bewertung von 23 Fremd-Repos mit Bauform und Urteil | [`fremd-repos.md`](fremd-repos.md) |
| Register über beide Blätter | [`INDEX.md`](INDEX.md) |
| Dieses Ziel und die Todo-Liste | diese Datei, [`todos.md`](todos.md) |

**Abnahme:** die Zahlen sind selbst gezählt, nicht zitiert; jede Lücke hat einen Beleg; jedes
Fremd-Repo hat ein Urteil, auch das „nein".

---

### Phase 1 — Die drei billigen Übernahmen

**Ziel:** drei Lücken schließen, die **keine neue Laufzeit** und **keine Lizenzfrage** mitbringen.

| # | Vorhaben | Lücke | Bauform | Aufwand |
|---|---|---|---|---|
| 1.1 | `diagram-design` als Skill | L4 | Skill | **übernommen 21.10.** — Wurzel angelegt, Wirksamkeit offen |
| 1.2 | `pretext` als Bibliothek in `apps/universe` | — (Oberfläche) | Bibliothek | ein Nachmittag (Lizenz MIT, geklärt) |
| 1.3 | `agent-reach` hinter einem Werkzeug-Plugin | Plattform-Zugriff | Werkzeug | mittel (Cookies) |

**Abnahme Phase 1:** ein Diagramm entsteht aus einer Beschreibung im Chat; `apps/universe` misst
Zeilenhöhe ohne Reflow; `doctor` meldet für mindestens einen Kanal „bereit".

**Was Phase 1 ausdrücklich nicht tut:** keine Sammel-Importe. `agency-agents`, `ecc` und die
Wissenschafts-Skills bleiben draußen (Duplikate, siehe `fremd-repos.md` §2).

---

### Phase 2 — Die Skills ins Repo und ihre Wirkung messen

**Ziel:** L1 und L6 schließen. Das ist die Phase mit dem größten Hebel, weil sie **jede** spätere
Fähigkeit betrifft.

| # | Vorhaben | Warum |
|---|---|---|
| 2.1 | Die 23 wirksamen Skills ins Repo überführen (oder ihre Herkunft dokumentieren) | ein frischer Klon hat heute **drei** Skills |
| 2.2 | Herkunft und Lizenz je Skill festhalten | 16 von 23 sind fremd — ohne Quelle wird aus einem Export eine Rechtsfrage |
| 2.3 | Einen Skill `skill-eval` bauen (Vorbild `skillgrade` aus `awesome-harness-engineering`) | 23 Fähigkeiten, kein Wirkungsnachweis |
| 2.4 | Die 15 leeren `dsh-*`-Ordner im Repo entfernen oder füllen | ein leerer Ordner sieht aus wie eine Fähigkeit |

**Abnahme Phase 2:** ein frischer Klon lädt **alle** vorgesehenen Skills; für mindestens drei
davon existiert ein Eval mit Schwelle; die leeren Ordner sind entschieden, nicht vergessen.

---

### Phase 3 — Die Wissensschicht: Rollen ergänzen, nicht Speicher stapeln

**Ziel:** die **Rollen** ergänzen, die heute fehlen — Entscheidung mit Dateibezug
(`Trail-Code`), Sitzungsgedächtnis (`agentmemory`), Infra-Kanten (`codebase-memory-mcp`) — ohne
eine **zweite Datenbank für dieselbe Frage** zu bauen.

**Die Regel, die seit dem 21.10.2026 gilt:** Graphify und Obsidian sind **komplementär**, keine
Alternativen. Daraus folgt nicht „mehr ist besser", sondern die Frage: *welche Rolle fehlt, und
deckt das Werkzeug genau diese?*

| # | Vorhaben | Quelle | Rolle |
|---|---|---|---|
| 3.1 | **Blast-Radius** prüfen (was hängt an dieser Änderung?) | `codebase-memory-mcp` | Codefakten, tiefer |
| 3.2 | **Learnings mit `touches`** — Entscheidung vor dem Commit prüfen | `Trail-Code` | **fehlt heute** |
| 3.3 | **Verfall und Konsolidierung** für den pgvector-Speicher konzipieren | `agentmemory` | Gedächtnis |
| 3.4 | **Rollenverteilung entscheiden** — nicht „ein Speicher", sondern: welche Frage beantwortet welches Werkzeug? | diese Phase | Entscheidung |
| 3.5 | **`Trail-Code` als Pilot** — MIT, TypeScript, Dateien statt Server | `Trail-Code` | erster echter Zusatz |

**Abnahme Phase 3:** eine Änderung nennt ihre betroffenen Stellen aus dem Graphen; eine
Entscheidung wird **vor dem Commit** gegen den Diff geprüft und nennt Autor und Grund; jede
Rolle hat **genau einen** Ort — und keine zwei Werkzeuge beantworten dieselbe Frage.

**Die Entscheidung, die diese Phase verlangt:** `universe` bekommt später eine Notiz-Ansicht auf
**denselben** Speicher — kein vierter Dienst. Das ist die Anmerkung des Betreibers, in eine
Reihenfolge gebracht.

---

### Phase 4 — Die großen Vorhaben, jede mit eigener Entscheidung

**Ziel:** was eine neue Laufzeit, eine Lizenzprüfung oder eine Ziel-Allowlist braucht, wird
**einzeln** entschieden — nicht als Häkchen mitgenommen.

| # | Vorhaben | Vorbedingung |
|---|---|---|
| 4.1 | Video/Schnitt über `OpenMontage` | **AGPL-Prüfung** und Entscheidung „eigener Prozess"; dritte Laufzeit |
| 4.2 | `strix` als Sicherheits-Werkzeug | Docker, Schlüssel, **Ziel-Allowlist** (rechtlich) |
| 4.3 | `ocr scan` für `security-audit` nachziehen | keine — das ist die billigste Zeile der ganzen Liste |
| 4.4 | Browser-Naht mit einem TypeScript-Anbieter füllen (L3) | Entscheidung gegen das Python-Original |

**Abnahme Phase 4:** je Vorhaben ein eigener Nachweis; kein Vorhaben dieser Phase blockiert
Phase 1–3.

---

### Phase 5 — Was ausdrücklich **nicht** kommt

Ein Ziel ohne Nicht-Ziele ist eine Wunschliste. Diese fünf sind entschieden:

| Nicht | Grund |
|---|---|
| `voltagent` als Framework | dupliziert Subagenten, Workflow, MCP — alles aus dem Kern |
| `flowsint` als Graph-Backend | fertige App mit Neo4j; ein zweiter Graph |
| `Trail-Code` oder `codebase-memory-mcp` als **Speicher** | zweite Wahrheit über denselben Gegenstand |
| `agency-agents` als Import | 230 Personas, die unsere stärksten Skills unterbieten |
| `academic-research-skills` | CC BY-NC schließt die kommerzielle Nutzung aus |

---

## 4. Woran das Ziel insgesamt scheitert

Vier Fehler, die dieses Projekt schon gemacht hat und die hier ausdrücklich als Abbruchkriterien
stehen:

1. **Eine Zahl ohne Datum.** Jede Zeile nennt den Tag der Messung.
2. **Ein leeres Ergebnis als Wert.** Eine leere Spalte ist ein Fehler, kein „nichts gefunden"
   (`plugin-inventur.md`, Fallstrick `$host`).
3. **Ein geladenes Werkzeug für ein gebautes Unit halten.** MCP-Konfiguration ist keine Fähigkeit.
4. **Eine Sammlung für eine Fähigkeit halten.** 311 Skills sind kein Bestand, solange keiner
   eine Lücke schließt.

---

## 5. Der nächste Schritt

**Phase 1.1 — `diagram-design` als Skill.** Das ist die Zeile mit dem besten Verhältnis aus
Nutzen, Risiko und Aufwand: MIT, keine Schlüssel, ein Markdown-Skill plus fünf Python-Skripte,
und die Lücke ist im Checkup belegt (L4).

Danach, in dieser Reihenfolge: **4.3** (`ocr scan`, fast kostenlos), **2.1** (Skills ins Repo),
**2.3** (Skill-Evals).

Die vollständige, abarbeitbare Liste steht in [`todos.md`](todos.md).
