# Todo-Liste — der Bestand, in Arbeit übersetzt

> **Was dieses Blatt ist:** die abarbeitbare Liste zu [`goal.md`](goal.md). Sie folgt den
> **Regeln A1–A7** aus [`arbeitspakete.md`](../status/arbeitspakete.md) — sie erfindet kein
> zweites Verfahren:
> **A1** ein Paket, eine Liste · **A2** jedes Paket nennt seine Phase ·
> **A3** abgehakt wird nur Belegtes · **A4** die Liste ist änderbar ·
> **A5** der Ausführende kennt seine Liste · **A6** nur Fertiges wird committet ·
> **A7** Meldeformat `BEDARF/GRUND/UMFANG/FERTIG`.
>
> **Stand:** 21.10.2026 · **Phasen:** `offen` → `in Arbeit` → `Nachweis offen` → `erledigt`

---

## 1. Die Liste auf einen Blick

| ID | Aufgabe | Phase | Lücke | Bauform | Stand |
|---|---|---|---|---|---|
| **B0.1** | Bestands-Checkup (vier Schichten) | 0 | — | Dokument | **erledigt** |
| **B0.2** | Bewertung von 23 Fremd-Repos | 0 | — | Dokument | **erledigt** |
| **B0.3** | Register und Ziel | 0 | — | Dokument | **erledigt** |
| **P1.1** | `diagram-design` als Skill | 1 | L4 | Skill | **erledigt** |
| **P1.2** | `pretext` als Bibliothek | 1 | — | Bibliothek | offen |
| **P1.3** | `agent-reach` hinter Werkzeug-Plugin | 1 | Plattform | Werkzeug | offen |
| **P1.4** | Sechs Research-Skills | 1 | Research | Skills | **erledigt** |
| **P2.1** | Die 23 Skills ins Repo | 2 | **L1** | Skills | offen |
| **P2.2** | Herkunft und Lizenz je Skill | 2 | L1 | Dokument | offen |
| **P2.3** | Skill `skill-eval` bauen | 2 | **L6** | Skill | offen |
| **P2.4** | 15 leere `dsh-*`-Ordner entscheiden | 2 | L2 | Aufräumen | offen |
| **P3.1** | Blast-Radius prüfen | 3 | — | Abfrage | offen |
| **P3.2** | Learnings-Datei für Obsidian | 3 | — | Verfahren | offen |
| **P3.3** | Verfall für den pgvector-Speicher | 3 | — | Konzept | offen |
| **P3.4** | Entscheidung: Rollenverteilung | 3 | — | Entscheidung | offen |
| **P3.5** | `Trail-Code` als Pilot | 3 | — | Werkzeug | offen |
| **P4.1** | `OpenMontage` (Video) | 4 | **L5** | Werkzeug | **gesperrt** (AGPL) |
| **P4.2** | `strix` als Sicherheits-Werkzeug | 4 | — | Werkzeug | **gesperrt** (Allowlist) |
| **P4.3** | `ocr scan` für `security-audit` | 4 | — | Skill-Ergänzung | offen |
| **P4.4** | Browser-Naht mit TS-Anbieter füllen | 4 | **L3** | Plugin | offen |

**Was zuerst:** P1.1, dann P4.3, dann P2.1 und P2.3. Begründung in
[`goal.md`](goal.md) §5 — bestes Verhältnis aus Nutzen, Risiko und Aufwand.

---

## 2. Phase 0 — Bestand (erledigt)

| ID | Aufgabe | Nachweis |
|---|---|---|
| **B0.1** | Skills und Plugins in vier Schichten gezählt, Lücken L1–L8 belegt | [`checkup-skills-plugins.md`](checkup-skills-plugins.md) — 401 Paketordner, 82 belegt, 319 leer; 23 Skills außerhalb, 3 im Repo |
| **B0.2** | 23 Repos gelesen, Lizenz und Bauform bestimmt, jedes mit Urteil | [`fremd-repos.md`](fremd-repos.md) |
| **B0.3** | Register, Ziel, diese Liste, Eintrag im Doku-Katalog | [`INDEX.md`](INDEX.md), [`goal.md`](goal.md), [`docs/INDEX.md`](../INDEX.md) |

**Abnahme Phase 0:** erfüllt — jede Zahl ist selbst gezählt, jede Lücke hat einen Beleg, jedes
Repository ein Urteil (auch das „nein").

---

## 3. Phase 1 — Die drei billigen Übernahmen

### P1.1 · `diagram-design` als Skill

**Stand 21.10.2026: `erledigt`.** Übernommen, versioniert und **geladen** — über eine Junction,
nicht über die vierte Wurzel.

| Was | Stand | Beleg |
|---|---|---|
| Repository übernommen | **erledigt** | `units/skills/diagram-design/` — 287 Dateien, 5,13 MB |
| Eigenes Git-Repo | **erledigt** | Commit `3aaccfe` (290 Dateien), `.gitattributes` `eol=lf` in `b7d0c7a` |
| Lizenz und Herkunft | **erledigt** | `LICENSE` und `THIRD_PARTY_LICENSES.md` unverändert daneben; Quelle und Stand im Commit |
| Im Monorepo ausgenommen | **erledigt** | `.gitignore` Regel `/units/skills/`, geprüft mit `git check-ignore -v` |
| Selbsttest des Skills | **erledigt** | `python scripts\self_check.py assets\example-flowchart.html` → `OK`, exit 0 |
| Sichtbar im Benutzer-Scope | **erledigt** | Junction `~\.agents\skills\diagram-design` → `units\skills\diagram-design`, keine Kopie |
| Im Katalog geladen | **erledigt** | Katalog aktualisiert **ohne Neustart**; `skill diagram-design` liefert den Rumpf |
| Vierte Skill-Wurzel (Rang 300) | **offen** | braucht `skill-plugin` in `EIGENE_PAKETE` — **nicht mehr blockierend** |

- **Lücke:** L4 (kein Diagramm-Skill; 0 Treffer über 23 Fähigkeiten).
- **Der Nachweis ist erbracht:** der Skill steht im Katalog dieser Sitzung, und ein Aufruf des
  `skill`-Werkzeugs liefert seinen vollständigen Rumpf samt Ressourcenpfad.
- **Die Abweichung, die dokumentiert sein muss:** Die Entscheidung nennt die **vierte Wurzel**;
  wirksam wurde der Skill über eine **Junction in den Benutzer-Scope** (Rang 400). Der Inhalt
  liegt weiterhin **einmal** — die Junction ist eine Verbindung, keine Kopie. Die vierte Wurzel
  bleibt die Architektur für den eigenen Rang, ist aber keine Voraussetzung mehr.
- **Prüfpunkte (§8 `fremd-repos.md`):** MIT ✓ · Bauform Skill ✓ · kein Duplikat ✓ · keine neue
  Laufzeit (Python nur für Export) ✓ · Lücke belegt ✓.
- **Risiko:** gering. Die Junction ist der einzige neue Angriffspunkt: wer den Skill im
  Benutzer-Scope löscht, trennt die Verbindung — der Bestand im Repo bleibt unberührt.

### P1.2 · `pretext` als Bibliothek in `apps/universe`

- **Lücke:** keine im Checkup — eine **Oberflächen-Notwendigkeit**: Chat und Log wachsen, jede
  Höhenmessung über das DOM löst Reflow aus.
- **Was zu tun ist:** `@chenglou/pretext` einbinden, **nur** in `apps/universe` und `apps/web`;
  `prepare()` einmal je Absatz, `layout()` bei Breitenänderung. Prüfen, ob `rich-ui`-Karten
  profitieren.
- **Nachweis:** eine Messung vorher/nachher (Layout-Dauer bei N Nachrichten), exit 0 im
  Typecheck, kein Reflow im Profil.
- **Prüfpunkte:** MIT mit Zusatzhinweisen ✓ (die API meldet `NOASSERTION` — **kein** Blocker,
  siehe `fremd-repos.md` §1.4) · Bauform Bibliothek ✓ · kein Duplikat ✓ · keine neue Laufzeit ✓.
- **Grenze:** läuft **nur im Browser**; in Bun ohne `OffscreenCanvas`-Shim wirft `prepare()`.
- **Aufwand:** ein Nachmittag.

### P1.3 · `agent-reach` hinter einem Werkzeug-Plugin

- **Lücke:** Plattform-Zugriff — PMH kann Webseiten abrufen, aber keine YouTube-Untertitel,
  Reddit-Threads, RSS-Feeds oder X-Suche.
- **Was zu tun ist:** **nicht** die Skill direkt übernehmen, sondern ein dünnes Plugin, das die
  CLI aufruft und **vorher** `agent-reach doctor --json` prüft. Damit liegt der Cookie-Umgang an
  einer Stelle.
- **Nachweis:** `doctor` meldet für mindestens einen Kanal „bereit"; ein Abruf liefert Inhalt;
  ohne Cookie meldet das Plugin **„nicht bereit"** statt zu scheitern.
- **Prüfpunkte:** MIT ✓ · Bauform Werkzeug ✓ · benachbart zu `browser-local`, aber kein Duplikat ✓
  · neue Laufzeit **Python** ⚠️ (der Grund, warum es Phase 1 und nicht „sofort" ist).
- **Risiko:** Cookies und ToS — Wegwerf-Konten, nie ein Produktkonto.

### P1.4 · Sechs Research-Skills — **erledigt 21.10.2026**

- **Lücke:** Research — PMH konnte Webseiten abrufen, aber keine Literatur durchsuchen, keine
  Zitate prüfen und keine systematische Übersicht bauen.
- **Übernommen** (alle MIT, ohne Server, Katalog führt sie sofort):
  `literature-review` · `paper-lookup` · `citation-management` · `peer-review` ·
  `market-research-reports` · `parallel-web`.
- **Quelle:** `K-Dense-AI/scientific-agent-skills`, sparse checkout (sechs von 177 Skills),
  Stand 21.10.2026. Lizenzfeld je Skill geprüft: **sechsmal MIT**.
- **Beleg:** Commit `3e6e7ef` (117 Dateien) im Skill-Repo; Katalog dieser Sitzung führt alle
  sechs; `link-skills.ps1` meldet „6 Verbindung(en) angelegt".
- **Ehrliche Grenze:** `parallel-web` braucht die **Parallel-CLI**, die heute nicht im PATH
  liegt. Der Skill ist geladen, aber ohne CLI nicht ausführbar.
- **Bewusst nicht übernommen:** `academic-research-skills` (`deep-research`, `academic-paper`,
  `academic-pipeline`, `sr-screener`, `academic-paper-reviewer`) — **CC BY-NC 4.0** schließt
  kommerzielle Nutzung aus, und die fünf Skills sind **Symlinks**, die ein Windows-Klon nicht
  als Ordner sieht. Beides ist eine Betreiber-Entscheidung, keine technische.

---

## 4. Phase 2 — Skills ins Repo und ihre Wirkung messen

### P2.1 · Die 23 Skills ins Repo

- **Lücke:** **L1** — ein frischer Klon hat drei Skills statt 23.
- **Was zu tun ist:** entscheiden, ob **Kopie** oder **dokumentierte Herkunft**. Eine Kopie ist
  eine zweite Quelle der Wahrheit (die `skill-uebertragung.md` §5 ausdrücklich vermeidet);
  sauberer ist ein **Abgleich**: welche Skills sind eigen, welche fremd, welche werden über den
  Benutzer-Scope geladen?
- **Nachweis:** ein frischer Klon in einem leeren Benutzer-Scope listet **alle** vorgesehenen
  Skills im Katalog; die Zahl steht im Bericht.
- **Vorsicht:** 16 von 23 sind fremd — ohne Quelle wird aus einem Export eine Rechtsfrage
  (P2.2 hängt daran).

### P2.2 · Herkunft und Lizenz je Skill

- **Was zu tun ist:** je Skill eine Zeile: Quelle (URL), Lizenz, eigene Änderungen. Grundlage:
  `fremd-repos.md` und die `LICENSE`-Dateien der Sammlungen.
- **Nachweis:** die Tabelle deckt 23 von 23 ab, keine Zeile „unbekannt".
- **Warum vor P2.1:** eine Kopie ohne Quelle ist der Fehler, den `auftrag-feature-und-skills.md`
  §F3 schon benannt hat.

### P2.3 · Skill `skill-eval` bauen

- **Lücke:** **L6** — 23 Fähigkeiten, kein Verfahren, ihre Wirkung zu messen.
- **Vorbild:** `skillgrade` aus `awesome-harness-engineering` — Task/Grader-Paare aus einer
  `SKILL.md`, mehrere Läufe, CI-Schwelle.
- **Was zu tun ist:** ein Skill, der aus einer Fähigkeit Prüfaufgaben ableitet, sie laufen lässt
  und eine Schwelle prüft. **Nicht** ein Benchmark für Modelle — ein Test für **Anweisungen**.
- **Nachweis:** für mindestens drei Fähigkeiten existiert ein Eval mit Schwelle; ein
  absichtlich verschlechterter Skill fällt durch (Gegenprobe).
- **Aufwand:** der größte Posten dieser Liste, und der mit dem längsten Nutzen.

### P2.4 · Die 15 leeren `dsh-*`-Ordner entscheiden

- **Befund:** `.agents/skills/` hat 19 Ordner, 15 leer.
- **Was zu tun ist:** je Ordner **entweder** füllen **oder** entfernen — mit Grund im Commit.
  Ein leerer Ordner sieht aus wie eine Fähigkeit und ist keine.
- **Nachweis:** `Get-ChildItem .agents\skills -Directory` liefert keinen Ordner ohne `SKILL.md`,
  oder jeder leere hat eine Notiz mit Grund.

---

## 5. Phase 3 — Die Wissensschicht: Rollen, nicht Speicher

> **Die Regel seit 21.10.2026:** Graphify und Obsidian sind **komplementär**. Die Frage ist
> nicht „wie viele Speicher", sondern **welche Rolle fehlt**. Ein Werkzeug ist kein Duplikat,
> wenn es eine andere Frage beantwortet — es ist eines, wenn es dieselbe Frage mit einer
> zweiten Datenbank beantwortet.

### P3.1 · Blast-Radius prüfen

- **Was zu tun ist:** vergleichen, was `mcp__graphify__get_pr_impact` heute liefert und was
  `codebase-memory-mcp` (`detect_changes`) zusätzlich kann. **Nicht** den Server einbauen.
- **Nachweis:** eine Änderung nennt ihre betroffenen Stellen aus dem Graphen — mit Quelle.

### P3.2 · Learnings-Datei für Obsidian — und `Trail-Code` als Werkzeug prüfen

- **Was zu tun ist:** das `Trail-Code`-Verfahren übernehmen: kurze Markdown-Datei je
  Entscheidung, `touches`-Feld auf Dateien, im Repo, durch Git geteilt — und eine Prüfung vor
  dem Commit, die eine frühere Entscheidung **nennt**, wenn der Diff ihr widerspricht.
- **Die Ergänzung nach der Richtigstellung:** `Trail-Code` ist **kein Duplikat**, sondern die
  fehlende Rolle. Es bringt keinen Server mit (Markdown in `.trail/`, MCP optional) und ist
  MIT-lizenziert. Der Graph-Teil fällt weg, die Learnings nicht.
- **Warum das die eigentliche Lücke ist:** `docs/decisions/` ist gut, aber von Hand und nicht
  maschinell geprüft; Obsidian ist gut, aber nicht im Repo und nicht an Dateien gebunden. Die
  Verbindung fehlt.
- **Nachweis:** eine Entscheidung wird angelegt, ein widersprechender Diff wird erkannt, und der
  Bericht nennt Autor, Datum und Grund.

### P3.3 · Verfall für den pgvector-Speicher

- **Was zu tun ist:** aus `agentmemory` die vierstufige Konsolidierung mit Verfall und
  Auto-Forget auf das eigene Schema übertragen — als **Konzept**, nicht als Dienst.
- **Nachweis:** ein Dokument mit Regeln und einer Zahl: was nach 30/90/365 Tagen passiert.

### P3.4 · Entscheidung: Rollenverteilung, nicht „ein Speicher"

- **Was zu tun ist:** die Entscheidung schriftlich festhalten (in `docs/decisions/`): **welche
  Frage beantwortet welches Werkzeug** — Graphify (Codefakten), Obsidian (Absicht), PostgreSQL
  (Bestand), `Trail-Code` (Entscheidung mit Dateibezug), `codebase-memory-mcp` (Infra-Kanten).
  Jede Rolle **genau einmal**.
- **Nicht** die Entscheidung: „nur ein Werkzeug". Die Regel sagt komplementär. Die Entscheidung
  ist die **Grenze** zwischen den Rollen.
- **Nachweis:** die Entscheidung liegt als Datei vor, nennt je Rolle einen Ort, und keine Rolle
  hat zwei Orte (`obsidian-gedaechtnis-oder-ansicht.md` prüfen, damit kein Widerspruch entsteht).

### P3.5 · `Trail-Code` als Pilot

- **Was zu tun ist:** `trail init` in einem **Kopie-Verzeichnis** prüfen, nicht im Hauptbaum —
  der Befehl schreibt außerhalb des Repos (`~/.claude`, `~/.codex`). Telemetrie abschalten
  (`trail telemetry disable`). Nur die Learnings-Hälfte bewerten, nicht den Graph.
- **Nachweis:** `trail check` erkennt einen Diff, der einer gespeicherten Entscheidung
  widerspricht, und nennt Autor, Datum und Grund. Kein Schreibzugriff außerhalb des
  Prüfverzeichnisses.
- **Warum als Pilot und nicht als Einbau:** es ist der billigste Kandidat (MIT, Dateien statt
  Server) — und der einzige, der eine **fehlende** Rolle abdeckt.

---

## 6. Phase 4 — Die großen Vorhaben, jede gesperrt bis zur Entscheidung

### P4.1 · `OpenMontage` — **gesperrt: AGPL-3.0**

- **Was zu tun ist:** nichts, bis die Lizenzfrage entschieden ist. Dann: eigener Prozess,
  eigenes Verzeichnis, Pipeline-ID und Brief als Argumente.
- **Vorbedingung:** rechtliche Prüfung §13 AGPL bei netzwerkbedientem Produkt; Entscheidung über
  die dritte Laufzeit (Python + Node + FFmpeg).
- **Warum nicht gestrichen:** es ist die **einzige** Option für Video/Schnitt (L5), und der
  Zero-Key-Pfad wäre ohne laufende Kosten testbar.

### P4.2 · `strix` — **gesperrt: Ziel-Allowlist**

- **Korrektur zur Annahme:** `strix` ist **kein Subagent**. Es ist eine Python-CLI mit eigenem
  Docker-Sandbox; ein PMH-Subagent kann es **aufrufen**, nicht **sein**.
- **Vorbedingung:** Docker, LLM-Schlüssel, **geprüfte Zielliste** (rechtlich, nicht technisch).
- **Nutzen:** ergänzt `security-audit` (heute reine Anleitung) um dynamische Validierung.

### P4.3 · `ocr scan` für `security-audit`

- **Was zu tun ist:** `ocr scan` in die Skill aufnehmen — Ganzdatei-Review **ohne Diff**. Heute
  steht es nur als Fallstrick in der Skill, ohne Aufrufpfad.
- **Nachweis:** ein Lauf auf einem Verzeichnis ohne Git-Diff liefert Befunde; exit-Code
  dokumentiert.
- **Warum das fast kostenlos ist:** die CLI ist bereits installiert und eingebunden.

### P4.4 · Browser-Naht mit einem TypeScript-Anbieter füllen

- **Lücke:** **L3** — `packages/browser-use/browser-use` hat 0 Dateien; Browser läuft nur als
  MCP-Konfiguration.
- **Was zu tun ist:** die Naht `ctx.browserUse` (drei Anbieter sind beschrieben) mit **einem**
  TypeScript-Anbieter füllen. **Nicht** das Python-Original portieren — es ist Vorbild, nicht
  Baustein.
- **Nachweis:** eine Sitzung ohne MCP-Konfiguration öffnet eine Seite und liest den DOM.

---

## 7. Was **nicht** auf dieser Liste steht

Diese Punkte sind entschieden und werden nicht nachgetragen (Begründung in
[`fremd-repos.md`](fremd-repos.md) §4 und [`goal.md`](goal.md) §3.5):

| Nicht | Grund |
|---|---|
| `voltagent` als Framework | Duplikat von Subagenten, Workflow, MCP |
| `flowsint` als Graph-Backend | fertige App mit Neo4j, zweiter Graph |
| `agentmemory` als Dienst | zweiter Wissensspeicher; nur die Verfahren (P3.3) |
| `Trail-Code` als Ganzes | Graph-Hälfte ist Graphify-Dublette; nur die Learnings (P3.2) |
| `codebase-memory-mcp` als Ersatz | Daemon mit exklusivem Cache-Root, ~330 MB; nur der Vergleich (P3.1) |
| `agency-agents` als Import | 230 Personas unterbieten die eigenen Skills |
| `academic-research-skills` | CC BY-NC schließt kommerzielle Nutzung aus |
| `OpenMAIC`, `OpenExecutive` | Apps, keine Units; nur als Vorbild gelesen |

---

## 8. Wie ein Punkt abgehakt wird

Nach Regel **A3** — und deshalb steht bei jedem Punkt ein Nachweis und nicht ein Häkchen:

```powershell
# Beispiel P1.1 — der Skill ist im Katalog, nicht nur im Ordner
Get-ChildItem .agents\skills\diagram-design -Recurse -File | Measure-Object    # > 0
bun test packages\skill\skill-filesystem\tests\filesystem.test.ts              # exit 0

# Beispiel P4.3 — ocr scan läuft ohne Diff
ocr scan --help                                                                # Befehl existiert
ocr scan . --format json                                                       # Befunde als JSON
```

**Ein Punkt ohne Befehl und Ergebnis bleibt offen**, auch wenn die Datei schon existiert. Das ist
die Regel, die dieses Projekt am häufigsten verletzt hat (`plugin-inventur.md`, Widerrufe).
