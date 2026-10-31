# Selbstverbesserung bei Odysseus — Primärquellenprüfung

Stand: 2026-10-28. Untersuchtes Repository: `odysseus-dev/odysseus`, Zweig `main`
(Standardzweig ist laut API `dev`; `main` existiert und wurde verwendet).
Alle Dateizitate wurden über `raw.githubusercontent.com` abgerufen, alle
Metadaten über die GitHub-API. Nicht abrufbare Quellen sind als **nicht abrufbar**
gekennzeichnet. Wo eine Datei zu groß zum Vollablesen war, steht das ausdrücklich dabei.

---

## Kurzfazit

Odysseus **hat** einen echten, im Code belegten Mechanismus für Lernen aus
Erfahrung: komplexe Agentenläufe werden per LLM zu wiederverwendbaren Skills
destilliert, gegen eine Zwei-Arm-Prüfung (mit/ohne Skill) auditiert und erst nach
bestandener Prüfung und Schwellenwert veröffentlicht. Dieser Mechanismus ist
**kein** Selbstverbesserungsmodell im Sinne von Reflexion oder Gewichtsupdate: er
schreibt ausschließlich Markdown-Daten (Skills), niemals Code, Systemprompt,
Werkzeuge oder Modellparameter, und der Standardzustand eines neu extrahierten
Skills ist `draft`, nicht aktiv. Die Behauptung "hat das System schon" ist in
dieser Form **nicht belegt**: das Wort "self-improving" kommt in README und
ROADMAP nicht vor, die Selbstbeschreibung lautet "self-hosted AI workspace", und
dieselbe Codebasis nennt Prompt-Größe als offenes Problem. Was existiert, ist ein
**kontrollierter, menschlich freigabepflichtiger Kuratierungs-Loop für prozedurales
Gedächtnis** — deutlich mehr als Marketing, deutlich weniger als Autonomie. Das
Urteil lautet daher: echt ist die Mechanik aus Extraktion, Zwei-Arm-Prüfung und
Freigabe, nicht echt ist die Selbstverbesserung, und übertragbar ist die Mechanik
ohne das Etikett.

---

## Was Odysseus tatsächlich macht

Selbstbeschreibung (wörtlich): "A self-hosted AI workspace for chat, agents,
research, documents, email, notes, calendar, and local model workflows."
— `README.md`, <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/README.md>

Repositorium laut API: 94.616 Stars, angelegt 2026-05-31, Sprache Python,
Lizenz AGPL-3.0-or-later, Standardzweig `dev`, 1.611 offene Issues.
— <https://api.github.com/repos/odysseus-dev/odysseus>

Der vollständige Dateibaum umfasst 2.817 Pfade (`truncated: false`).
— <https://api.github.com/repos/odysseus-dev/odysseus/git/trees/main?recursive=1>

### Belegtabelle

| # | Behauptung | Datei | URL | Status |
|---|---|---|---|---|
| 1 | Es gibt keine Selbstverbesserungs-, Reflexions- oder Retrospektiven-Komponente. Kein Pfad enthält `self`/`improve`/`reflect`/`retro`/`lesson`/`insight`/`evolve`. | Dateibaum (2.817 Pfade) | <https://api.github.com/repos/odysseus-dev/odysseus/git/trees/main?recursive=1> | belegt (Negativbefund) |
| 2 | Skills werden automatisch aus Agentenläufen extrahiert, wenn ein Lauf `>= 2` Runden oder `>= 2` Werkzeugaufrufe braucht. | `services/memory/skill_extractor.py` | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/services/memory/skill_extractor.py> | belegt |
| 3 | Extraktion ist **erfolgsselektiv**: "The agent failed, gave up, or the approach is not worth repeating" führt zu `null`. | `services/memory/skill_extractor.py` | wie #2 | belegt |
| 4 | Neue Extrakte starten als `draft`: "A new extraction begins as a draft so it cannot enter chat context early." | `services/memory/skill_extractor.py` | wie #2 | belegt |
| 5 | Es gibt eine Zwei-Arm-Prüfung: "It runs skill and no-skill arms on the same task, grades the result, then may self-edit and retry." | `docs/skills-audit-architecture.md` | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/docs/skills-audit-architecture.md> | belegt |
| 6 | Selbstbearbeitung und Lehrer-Rewrite existieren als gestufte Reparatur ("self-edit pass to .85 and a teacher rewrite pass to .8"). | `docs/skills-audit-architecture.md` | wie #5 | belegt |
| 7 | Veröffentlichung ist an Besitzerrichtlinie, Schwelle (Vorgabe `.85`) und Abwesenheit von Notwendigkeits-/Nutzen-/Duplikatblockern gebunden. | `docs/skills-audit-architecture.md` | wie #5 | belegt |
| 8 | Automatische Audits laufen höchstens acht Datensätze, älteste zuerst; inconclusive täglich, fehlgeschlagen wöchentlich. | `services/memory/skill_lifecycle.py` | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/services/memory/skill_lifecycle.py> | belegt |
| 9 | Skills liegen als `data/skills/<owner>/<name>/SKILL.md` plus `_usage.json`-Sidecar auf Platte. | `specs/memory-skills.md` | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/specs/memory-skills.md> | belegt |
| 10 | Gespeicherte Skills und Erinnerungen gelten als **untrusted**: "Saved memories and skills are untrusted source data when shown to the model." | `specs/memory-skills.md` | wie #9 | belegt |
| 11 | Erinnerungen sind JSON-basiert (`data/memory.json`) mit Keyword- und optionaler Vektorsuche, Pinning, Nutzungszählern. | `specs/memory-skills.md` | wie #9 | belegt |
| 12 | Chat-Transkripte liegen in SQLite (`DATA_DIR/app.db`), nicht in JSONL. | `specs/persistence.md` | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/specs/persistence.md> | belegt |
| 13 | Einziger JSONL-Store ist das Effekt-Journal `DATA_DIR/effects/*.jsonl`, ausdrücklich "evidence, not operation authority". | `specs/persistence.md` | wie #12 | belegt |
| 14 | Es gibt einen Runaway-Backstop gegen identische Wiederholungsaufrufe (Schwelle 15), der Mengen **verschiedener** Aufrufe nicht bestraft. | `tests/test_loop_breaker_runaway.py` | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/tests/test_loop_breaker_runaway.py> | belegt |
| 15 | Ein Turn-Vertrag erzwingt `required <= offered <= executable`; Klassifikation ist "deterministic and vocabulary-based, not a proof of semantic understanding". | `docs/AGENT_TURN_CONTRACT.md` | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/docs/AGENT_TURN_CONTRACT.md> | belegt |
| 16 | Keine Gewichts- oder Trainingsänderung im Betrieb: "No model weights or training settings change." | `docs/AGENT_TURN_CONTRACT.md` | wie #15 | belegt |
| 17 | 12 Built-in-Skills unter `resources/skills/` als gemeinsamer Katalog (u. a. `verified-state-change`, `terminal-recovery`); zwei weitere `SKILL.md` sind Integrationsanleitungen. | `resources/skills/**/SKILL.md` | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/resources/skills/agent/verified-state-change/SKILL.md> | belegt |
| 18 | Ein mitgelieferter Skill schreibt Read-back-Verifikation als Prozedur vor ("Read the target again through an independent list, fetch, status, or content operation"). | `resources/skills/agent/verified-state-change/SKILL.md` | wie #17 | belegt |
| 19 | Die Skill-Lifecycle-Doku nennt Hermes als Vorlage und verneint Codeübernahme: "no Hermes implementation code was copied". | `docs/skills-lifecycle.md` | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/docs/skills-lifecycle.md> | belegt |
| 20 | Die ROADMAP enthält **kein** Selbstverbesserungsziel, dafür "Agent prompt/context bloat" als offenes Problem und den Satz "I don't know what I'm doing, help". | `ROADMAP.md` | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/ROADMAP.md> | belegt |
| 21 | Ein offenes Issue fordert Hermes-Integration, **weil** Hermes selbstverbessernd sei — impliziert, dass Odysseus es (für den Antragsteller) nicht war. Zustand: offen, Label `p3`. | Issue #55 | <https://api.github.com/repos/odysseus-dev/odysseus/issues/55> | belegt |
| 22 | Es gibt einen Offline-SFT-Korpus (1.294 Sitzungen, 3.258 Lehrer-Seeds), aber nur **ein** Workstream `model_sft` gegen 593 `replay_first`. | `docs/ODYSSEUS_SFT_ALEX_CORPUS.md` | <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/docs/ODYSSEUS_SFT_ALEX_CORPUS.md> | belegt |
| 23 | Der Agent kann seinen Systemprompt selbst umschreiben. | — | — | **nicht belegt / widerlegt** (siehe unten) |
| 24 | Der Agent ändert Werkzeuge, Hooks oder Quellcode. | — | — | **nicht belegt / widerlegt** |
| 25 | Fehlgeschlagene Läufe werden zu Lehren verarbeitet. | — | — | **nicht belegt / widerlegt** (siehe #3) |
| 26 | Odysseus betreibt ein Laufzeit-Evalsystem für das Harness selbst. | — | — | **nicht belegt** (nur `scripts/eval_*` als Entwicklerwerkzeuge) |
| 27 | Die Selbstverbesserungs-Rhetorik stammt aus dem Projekt. | — | — | **nicht belegt** (README/ROADMAP schweigen; Rhetorik ist Sekundärliteratur) |

**Nicht im Volltext gelesen** (Größe): `src/agent_loop.py` (1.778.422 Bytes).
Aussagen über dessen Interna stützen sich ausschließlich auf `tests/test_loop_breaker_runaway.py`
und `docs/AGENT_TURN_CONTRACT.md`, die ihn referenzieren. Seine Schleifenlogik im
Detail ist **nicht geprüft**.

Ebenfalls nicht im Volltext gelesen: `services/skills/evaluation.py`,
`audit_workflow.py`, `publication.py`, `agent_runner.py`,
`services/memory/memory_extractor.py`, `services/memory/skills.py`. Deren Verhalten
ist über `docs/skills-audit-architecture.md` und `specs/memory-skills.md` belegt,
die beide als verbindliche Spezifikationen im Repo liegen — nicht über eigenen Codeblick.

---

## Die fünf Mechanismen

### (a) Gedächtnis und Persistenz — vorhanden, ausgereift, aber konservativ

**Befund.** Zwei getrennte Speicher: Chat-Transkripte in SQLite
(`DATA_DIR/app.db`, Modelle `chat_sessions`/`chat_messages` plus FTS-Index), und
ein JSON-Gedächtnis (`data/memory.json`) für Fakten. Letzteres hat Besitzerfelder,
Pinning, Nutzungszähler und Ähnlichkeitssuche; semantische Suche kommt über Chroma
dazu und **degradiert** bei Ausfall auf reine Keyword-Suche. Ein dritter Store ist
ein append-only Effekt-Journal in JSONL (`DATA_DIR/effects/*.jsonl`) für
Werkzeugwirkungen, ausdrücklich als Beweismittel, nicht als Erlaubnis.

Bemerkenswert ist die Pinning-Politik: Identitäts- und Kontaktfakten werden
automatisch angepinnt, aber nur solange weniger als fünf solche Einträge existieren,
und nie automatisch entpinnt. Das ist eine bewusste Obergrenze gegen
Gedächtnisverwässerung.

- `specs/persistence.md` — <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/specs/persistence.md>
- `specs/memory-skills.md` — <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/specs/memory-skills.md>
- `src/memory.py` (19.534 Bytes, nicht im Volltext gelesen) — <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/src/memory.py>

**Grenze.** Es gibt keine Verdichtung von Einzelfakten zu Regeln. Gedächtnis ist
Retrieval, nicht Induktion. Was wie Lernen aussieht, ist der Skill-Pfad aus (c).

### (b) Lernen aus Fehlern — **existiert nicht als Fehlerlernen**, nur als Erfolgskontrolle

**Befund.** Das ist der wichtigste Befund der ganzen Prüfung. Der Extraktionsprompt
schließt Fehlschläge explizit aus:

> "Return null (the bare word, no JSON) when the session is NOT a reusable
> computer procedure, including: … The agent failed, gave up, or the approach is
> not worth repeating."

— `services/memory/skill_extractor.py`,
<https://raw.githubusercontent.com/odysseus-dev/odysseus/main/services/memory/skill_extractor.py>

Ebenso ausgeschlossen: "Routine use of an existing tool, or a generic checklist
with no new discovery." Bevorzugt wird dagegen "a specific successful workaround,
an unexpected pitfall, or a verified sequence that would save rediscovery".

Fehler tauchen im System an genau zwei Stellen auf, und beide sind **Kontrolle,
nicht Lehre**:

1. Der Audit stellt fest, dass ein Skill nicht besser ist als gar kein Skill
   ("worse-baseline" ist ein Publikationsblocker), und stuft herab.
2. Ein Reparaturversuch scheitert; nach Wiederholung wird der Skill `draft` bei
   Konfidenz `.35`.

Ein fehlgeschlagener Lauf, aus dem der Agent *nichts* gelernt hat außer "das ging
nicht", wird verworfen. Es gibt keinen Reflexionspuffer, keine Lehre aus dem
Abbruch, keinen Kausaltext.

- `services/memory/skill_extractor.py` (Prompt, `MIN_CONFIDENCE = 0.6`) — wie oben
- `docs/skills-audit-architecture.md` (Stufen `.95/.85/.8/.35`) — <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/docs/skills-audit-architecture.md>

### (c) Selbstmodifikation und Prompt-Verbesserung — vorhanden, aber auf Daten beschränkt

**Befund.** Es gibt echte Selbstmodifikation, aber eng umzäunt:

- **Was sich ändert:** ausschließlich der Markdown-Inhalt eines Skill-Datensatzes
  (`data/skills/<owner>/<name>/SKILL.md`). Der Audit darf den Skill selbst
  umschreiben ("self-edit") und bei Misserfolg an einen **anderen** Lehrer schicken
  ("An optional distinct teacher rewrites the skill; the worker performs the retry").
- **Was sich nicht ändert:** Systemprompt, Werkzeuge, Hooks, Code, Modellgewichte.
  Der Turn-Vertrag sagt es klar: "No model weights or training settings change."
- **Wer freigibt:** Publikation verlangt aktive Besitzerrichtlinie, bestandene
  Prüfung über Schwelle (Vorgabe `.85`), keine Duplikate und keinen
  Nutzen-Rückschritt. Ohne diese Bedingungen bleibt der Skill Entwurf.
- **Prompt-Überschreiben ist Admin-HTTP, keine Agentenaktion:**
  `PUT /api/skills/builtin/{name}` ist laut Vertragstabelle "Admin; 404 unknown,
  400 missing text" — ein Mensch mit Adminrecht, kein Modellaufruf.

Das ist **kontrollierte Selbstkuratierung**, nicht Selbstmodifikation im Sinne von
"das System ändert, wie es denkt".

- `docs/skills-audit-architecture.md` — wie oben
- `specs/memory-skills.md` (Speicherform, Sidecar) — wie oben
- `docs/AGENT_TURN_CONTRACT.md` (keine Gewichte) — <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/docs/AGENT_TURN_CONTRACT.md>

### (d) Evaluation und Verifikation — der stärkste Teil des Systems

**Befund.** Drei getrennte Ebenen, sauber getrennt:

1. **Laufzeit-Verifikation als Prozedur.** Der mitgelieferte Skill
   `verified-state-change` schreibt Lesen → engste Mutation → Read-back →
   Vergleich → gezielte Reparatur vor, samt Fallstricken ("Do not report success
   from an accepted request alone"). Das ist eine Anweisung, kein erzwungener Hook.
2. **Skill-Audit als Zwei-Arm-Experiment.** Dieselbe Aufgabe wird mit und ohne
   Skill gelaufen, bewertet, ggf. repariert. Zusätzliche Dimensionen:
   Notwendigkeit ("necessity") und Retrieval-Präzision. Konfidenzstufen sind
   dokumentiert, Fehlschläge werden zu `draft`.
3. **Entwickler-Evaluation.** 1.330 Testdateien (`tests/test_*.py`) und zahlreiche
   `scripts/eval_*` / `scripts/verify_*` als Abnahme vor Merge. Das ist CI, kein
   Produktloop.

Wichtig für die Bewertung: Die Audit-Urteile sind **beratend**. "These model
outputs are advisory and do not grant execution authority." Und die
Auftragserteilung ist vokabularbasiert, nicht semantisch.

- `resources/skills/agent/verified-state-change/SKILL.md` — <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/resources/skills/agent/verified-state-change/SKILL.md>
- `docs/skills-audit-architecture.md` — wie oben
- `services/memory/skill_lifecycle.py` — <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/services/memory/skill_lifecycle.py>

**Grenze.** Es gibt kein Eval des Harness gegen sich selbst. Die `scripts/eval_*`
sind Entwicklerwerkzeuge mit Fixtures, keine Laufzeitmessung.

### (e) Autonomie und Loops — Werkzeugschleife, kein Zielselbstlauf

**Befund.** Autonomie ist vorhanden als **Werkzeugschleife mit Sicherungen**, nicht
als selbstgesetztes Ziel:

- **Runaway-Backstop:** gezählt wird die *exakte Aufrufsignatur*, nicht der
  Werkzeugtyp. 15 identische Aufrufe gelten als Schleife; 30 verschiedene
  `bash`-Aufrufe nicht. Der Test begründet das mit einem echten Fehlerfall
  ("creating 18 calendar events at once" wurde fälschlich abgebrochen).
- **Turn-Vertrag:** `required <= offered <= executable`. Fehlt eine Fähigkeit,
  stoppt der Turn, statt zu improvisieren; Unbekanntes führt zu Rückfrage.
- **Hintergrund und Zeitplan:** Hintergrund-Werkzeugjobs und geplante Agentenaufgaben
  (README: "scheduled agent tasks") erlauben Ausführung ohne offenen Chat.
- **Effekt-Journal:** jede Wirkung wird vor Ausführung geclaims und fsync't;
  Persistenzfehler verweigert die Ausführung.

**Grenze.** Es gibt keinen Beleg für einen Modus, in dem der Agent sich selbst ein
Ziel setzt, über Runden hinweg verfolgt und den Fortschritt gegen das Ziel bewertet.
Die einzige zyklische Selbstbewertung ist der Skill-Audit aus (d).

- `tests/test_loop_breaker_runaway.py` — <https://raw.githubusercontent.com/odysseus-dev/odysseus/main/tests/test_loop_breaker_runaway.py>
- `docs/AGENT_TURN_CONTRACT.md` — wie oben
- `specs/persistence.md` (Effekt-Journal) — wie oben

---

## Kritische Prüfung der Behauptung "hat das angebliche System schon"

**Belegt ist:**

- Ein funktionierender Extraktions-, Prüf- und Publikationszyklus für prozedurales
  Gedächtnis, mit Konfidenz, Duplikaterkennung, Reparaturstufen und Freigabepolitik.
- Ein Zwei-Arm-Audit, der einen Skill gegen "kein Skill" auf derselben Aufgabe misst.
- Trennung von Evidenz und Autorität im Effekt-Journal.
- Ein Runaway-Backstop, der aus einem realen Fehler entstanden ist.

**Nicht belegt ist:**

- Selbstverbesserung im Sinne von Reflexion, Selbstkritik oder Strategiewechsel.
  Kein Pfad im Baum enthält `reflect`, `retro`, `lesson`, `insight`, `self`, `improve`.
- Lernen aus Fehlern. Der Extraktionsprompt schließt Fehlschläge aus.
- Selbstmodifikation von Prompt, Werkzeug, Hook oder Code. Nur Markdown-Daten.
- Autonomie als Zielselbstlauf.
- Ein Laufzeit-Eval des Harness gegen sich selbst.

**Marketing ist:**

- Das Etikett "self-improving". Es steht in Sekundärquellen (Medium, LinkedIn,
  YouTube, Facebook), nicht in `README.md` und nicht in `ROADMAP.md`. Die
  Selbstbeschreibung des Projekts lautet "self-hosted AI workspace".
- Die Behauptung, Odysseus protokolliere "Missed Requests" für Selbstverbesserung.
  Im Dateibaum existiert kein solcher Pfad; die Suche nach `miss` liefert nur
  UI-Dismiss- und Berechtigungstests.

**Gegen das Narrativ spricht außerdem:**

- Die ROADMAP nennt "Agent prompt/context bloat" als offenes Problem und enthält
  den Satz "I don't know what I'm doing, help".
- Issue #55 (Tag der Repo-Eröffnung, weiterhin offen, Label `p3` = niedrig) bittet
  um Hermes-Integration, **weil** Hermes selbstverbessernd sei.
- `docs/skills-lifecycle.md` nennt Hermes als Vorlage für Progressive Disclosure —
  die Beweisrichtung ist Übernahme, nicht Eigenentwicklung.
- Der SFT-Korpus hat genau einen Workstream `model_sft` gegen 593 `replay_first`:
  Training ist ein Nebenschauplatz, nicht der Kern.

**Einordnung.** Odysseus hat kein Selbstverbesserungssystem. Es hat einen
**Kuratierungs-Loop für prozedurales Gedächtnis** — sauber gebaut, ehrlich
instrumentiert, mit klaren Grenzen. Wer "self-improving scaffolding" will, findet
hier eine belastbare Teilkomponente (Extraktion + Audit + Freigabe) und eine
brauchbare Warnung (Prompt-Bloat, Erfolgsselektivität, prozesslokale Jobs).

---

## Stand der Technik

| Arbeit | ID | Kernmechanismus |
|---|---|---|
| Reflexion: Language Agents with Verbal Reinforcement Learning | arXiv 2303.11366 | Sprachliches Selbstfeedback statt Gewichtsupdate; Reflexionstext in einem episodischen Puffer, der Folgeversuche steuert. |
| Voyager: An Open-Ended Embodied Agent with Large Language Models | arXiv 2305.16291 | Automatischer Lehrplan plus wachsende Bibliothek **ausführbaren Codes**; iteratives Prompting mit Umgebungsfeedback, Ausführungsfehlern und Selbstverifikation. |
| Self-Refine: Iterative Refinement with Self-Feedback | arXiv 2303.17651 | Ein einziges Modell als Generator, Kritiker und Verfeinerer; keine Trainingsdaten, keine Gewichte, nur Iteration. |
| DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines | arXiv 2310.03714 | Pipelines als deklarative Module; ein Compiler optimiert sie gegen eine Metrik, statt Prompt-Templates von Hand zu tunen. |
| Agentic Context Engineering: Evolving Contexts for Self-Improving Language Models | arXiv 2510.04618 | Kontext als wachsende Sammlung von Strategien; inkrementelle, strukturierte Updates gegen "context collapse" und "brevity bias". |

Quellen: <https://arxiv.org/abs/2303.11366> · <https://arxiv.org/abs/2305.16291> ·
<https://arxiv.org/abs/2303.17651> · <https://arxiv.org/abs/2310.03714> ·
<https://arxiv.org/abs/2510.04618>
(alle Titel und IDs über die arXiv-API verifiziert:
<https://export.arxiv.org/api/query?id_list=2303.11366,2305.16291,2303.17651,2310.03714,2510.04618>)

**Bezug zu Odysseus.** Der Skill-Extraktor entspricht am ehesten Voyagers
Skill-Bibliothek, aber ohne Ausführbarkeit und ohne Fehlerpfad. Der Audit entspricht
am ehesten Self-Refine, aber mit externem Judge und Zwei-Arm-Vergleich statt
Selbstkritik. Was fehlt, ist die Reflexionsschleife aus 2303.11366 und die
Metrik-Optimierung aus DSPy.

---

## Übertragbare Muster für den Prometheus Harness

Vorhandene Andockpunkte, verifiziert im lokalen Baum:

- Wasserfall-Hooks `tools/pre-execute` (allow/deny/cancel/ask) und
  `tools/post-execute` (Ergebnisersetzung) — `packages/plugin/plugin-hooks/src/index.ts`
- `llm/stream` — `packages/crew/crew-plugin/src/plugin.ts`, `packages/usage/usage-recorder/src/recorder.ts`
- Skills als Markdown mit Frontmatter — `.agents/skills/*/SKILL.md`
- Session-Logs als JSONL — `packages/agent/session-persistence-jsonl/src/index.ts`
- `trail`-Skill — `.agents/skills/trail/SKILL.md` (Verzeichnis `.trail/` existiert
  hier **nicht**, CLI `trail` ist **nicht installiert**)
- `retro`-Skill — `.agents/skills/retro/SKILL.md` (nutzerinvoking,
  `disable-model-invocation: true`, schlägt Kandidaten vor, wendet nichts an)

### 1. Ausführungsbuchführung am `tools/post-execute`

**Mechanismus.** Jeder Werkzeugaufruf schreibt einen Datensatz: Werkzeugname,
Argument-Hash, Ergebnisklasse (`ok`/`error`/`blocked`), Dauer, Sitzungs-ID.
Kein Inhalt, nur Form. Das ist die Datenbasis für alles Folgende.
**Andockpunkt.** `tools/post-execute` in `packages/plugin/plugin-hooks/src/index.ts`,
Ablage neben dem Session-JSONL.
**Aufwand.** klein.
**Risiko.** Log-Wachstum; Argument-Hashes können bei kleinem Wertebereich
re-identifizieren. Hashen mit Salt pro Sitzung.

### 2. Fehlerkandidaten statt Erfolgsdestillation (Umkehrung von Odysseus)

**Mechanismus.** Statt erfolgreiche Läufe zu Skills zu verdichten, werden
**Fehlercluster** markiert: gleiche Fehlerklasse, gleiches Werkzeug, mehr als einmal.
Der `retro`-Skill liest diese Cluster statt Sitzungsprotokolle.
**Andockpunkt.** Regel in `tools/post-execute`, Auswertung in
`.agents/skills/retro/SKILL.md`.
**Aufwand.** klein bis mittel.
**Risiko.** Rauschen: zwei Fehler sind kein Muster. Mindesthäufigkeit und
Zeitfenster nötig, sonst entstehen Lehren aus Zufall.

### 3. Skill-Entwurf mit Herkunft und Prüfstatus

**Mechanismus.** Frontmatter um `status` (`draft`/`published`/`archived`),
`confidence`, `source` (`builtin`/`learned`/`imported`) und `audited_at` erweitern.
Neue Einträge sind `draft` und werden nicht injiziert. Vorbild: Odysseus'
`_initial_status = "draft"`.
**Andockpunkt.** `SKILL.md`-Frontmatter plus ein Validator im Skill-Loader.
**Aufwand.** klein.
**Risiko.** Frontmatter-Drift zwischen Skill-Autoren und Loader; ohne
Schema-Prüfung stillschweigend ignorierte Felder.

### 4. Zwei-Arm-Audit als eigenes Plugin

**Mechanismus.** Dieselbe Aufgabe zweimal laufen: mit und ohne den zu prüfenden
Skill. Vergleich der Ergebnisse durch einen Judge. Nur bei Nutzen über Schwelle
wird der Skill `published`.
**Andockpunkt.** Neues Plugin, das `llm/stream` für die Arme und
`tools/pre-execute` zum Unterdrücken der Skill-Injektion im Baseline-Arm nutzt.
**Aufwand.** groß.
**Risiko.** Kosten verdoppeln sich pro Audit; Nichtdeterminismus macht
Einzelläufe aussagelos; derselbe Judge, der den Skill schrieb, bestätigt ihn.

### 5. Rollentrennung Arbeiter/Lehrer

**Mechanismus.** Der Reparaturvorschlag kommt von einer **anderen** Modellroute als
der, die den Skill erzeugt hat. Odysseus nennt das "distinct teacher"; die
Credentials werden getrennt aufgelöst.
**Andockpunkt.** Eigene Route im Audit-Plugin, nicht die Sitzungsroute.
**Aufwand.** mittel.
**Risiko.** Korrelation bleibt, wenn beide Routen dasselbe Modell sind. Kosten pro
Reparaturversuch.

### 6. Begrenzte Nachprüf-Warteschlange

**Mechanismus.** Höchstens N Kandidaten pro Lauf, älteste zuerst; transient
fehlgeschlagene täglich, endgültig fehlgeschlagene wöchentlich; `published`,
`archived` und Built-ins ausgenommen.
**Andockpunkt.** Vorhandenes Job-/Scheduler-System, Konfiguration im Plugin.
**Aufwand.** klein bis mittel.
**Risiko.** Endlosschleife auf hoffnungslosen Kandidaten; ohne Abbruchkriterium
verbrennt die Warteschlange Budget an einem einzigen Skill.

### 7. Runaway-Backstop auf Signatur, nicht auf Werkzeugtyp

**Mechanismus.** Zähle exakte Aufrufsignaturen. Wiederholung derselben Signatur
über Schwelle gilt als Schleife; viele **verschiedene** Aufrufe desselben Werkzeugs
nicht.
**Andockpunkt.** `tools/pre-execute` (Rückgabe `cancel`).
**Aufwand.** klein.
**Risiko.** Falsch-positive Blockade legitimer Batches — genau der Fehler, den
Odysseus' Test beschreibt. Schwelle und Fenster müssen aus echten Läufen kommen.

### 8. Read-back-Verifikation als Hook, nicht als Prosa

**Mechanismus.** Nach mutierenden Werkzeugen liest der Hook das Ziel erneut und
vergleicht. Abweichung wird als `error` verbucht, nicht als Erfolg.
**Andockpunkt.** `tools/post-execute`, beschränkt auf eine Whitelist mutierender
Werkzeuge.
**Aufwand.** mittel.
**Risiko.** Doppelte Latenz und doppelte Seiteneffekte bei nicht-idempotenten
Aktionen; ohne Whitelist teuer und gefährlich.

### 9. Evidenz-Journal getrennt von Erlaubnis

**Mechanismus.** Ein append-only JSONL je Sitzung für Wirkungen (Claim vor
Ausführung, Outcome danach), physisch getrennt von allem, was Berechtigungen
erteilt.
**Andockpunkt.** `packages/agent/session-persistence-jsonl/src/index.ts`, neuer
Store daneben.
**Aufwand.** mittel.
**Risiko.** Datenschutz (Wirkungen sind personenbezogen); die Trennung "Evidenz
erteilt keine Erlaubnis" muss im Code erzwungen werden, sonst wird sie zur
Hintertür.

### 10. Loop-Engineer als Skill, nicht als Automatik

**Mechanismus.** Die Rolle bleibt ein Dokument mit Pflichtfeldern: beobachtetes
Signal, vermutete Ursache, vorgeschlagene Änderung, Ort der Änderung, Rücknahme.
Der Skill schlägt vor; ein Mensch gibt frei.
**Andockpunkt.** `.agents/skills/retro/SKILL.md` erweitern, Kandidatenkatalog aus
Odysseus' retro-Kategorien (Navigation, automatische Prüfungen, Standards,
Werkzeugökonomie, Informationszugang).
**Aufwand.** klein.
**Risiko.** Der Skill-Text wächst und frisst genau den Kontext, den er sparen soll —
Odysseus nennt das als eigenes offenes Problem.

---

## Was NICHT übertragbar ist und warum

**1. Der Zwei-Arm-Audit in Odysseus' Größenordnung.** Ein voller Agentenlauf pro
Arm und pro Skill, mit 32k-Token-Budget und 180-Sekunden-Timeout, ist bei 14
Built-ins tragbar und bei hunderten gelernten Skills nicht. Übertragbar ist die
Idee, nicht der Durchsatz. Ohne Stichprobenverfahren wird das ein Kostenloch.

**2. Die Konfidenzarithmetik `.95/.85/.8/.35`.** Das sind gesetzte Zahlen ohne
dokumentierte Kalibrierung. Sie als Messung zu importieren wäre ein Kategorienfehler.
Übertragbar ist die **Stufung** (sauber bestanden > selbst repariert > fremd
repariert > gescheitert), nicht die Zahlen.

**3. Der Vektorstore als Voraussetzung.** Chroma ist ein externer HTTP-Dienst mit
Degradationspfad. Der Prometheus Harness hat diese Abhängigkeit nicht und sollte sie
sich für Skill-Retrieval nicht einhandeln; lexikalische Suche plus guter Index ist
der billigere Anfang.

**4. Der Owner-/Mehrbenutzer-Plumbing.** Ein großer Teil der Odysseus-Komplexität
(Besitzerfelder auf jedem Store, `effective_storage_owner`, Owner-Migrationen,
MCP-Owner-Scope) existiert, weil es ein Mehrbenutzer-Dienst ist. Der Harness ist
lokal. Der Aufwand entfällt — aber die **SicherheitsInvariante** bleibt:
gespeicherte Skills und Lernnotizen sind untrusted, wenn sie in den Kontext gehen.

**5. Prozesslokale Jobs.** Odysseus' Audit-Jobs überleben keinen Neustart, und die
Doku nennt das als offene Grenze. Das ist kein Muster zum Nachbauen, sondern eine
Lücke, die man von Anfang an vermeidet.

**6. "Lernen aus Fehlern" als Vorbild.** Gerade nicht: der Extraktionsprompt
schließt Fehlschläge aus. Wer diesen Punkt will, muss ihn selbst bauen und kann sich
bei Odysseus nur das Drumherum (Audit, Freigabe, Dedup) borgen.

**7. Die Turn-Contract-Klassifikation.** Sie ist ausdrücklich
"deterministic and vocabulary-based, not a proof of semantic understanding". Als
Sicherheitsgurt brauchbar, als Fähigkeitserkennung nicht.

---

## Offene Fragen

1. **Woher kommt das Fehlersignal, und wer darf es schreiben?** Werkzeug-Exitcode,
   Nutzerkorrektur und fehlgeschlagener Test sind drei verschiedene Signale mit
   verschiedener Verlässlichkeit. Odysseus hat diese Frage nicht, weil es Fehler
   ignoriert — der Harness muss sie beantworten.
2. **Wer urteilt, und wie verhindert man Selbstbestätigung?** Ein Judge auf
   derselben Route wie der Arbeiter misst Korrelation, nicht Qualität. Reicht eine
   zweite Route, oder braucht es einen deterministischen Prüfer (Test, Linter,
   Read-back)?
3. **Wie verhindert man Kontextbloat durch Gelerntes?** Odysseus nennt Prompt-Größe
   selbst als offenes Problem. Ist die Antwort ein Index mit Nachladen auf Abruf,
   eine harte Obergrenze injizierter Einträge, oder beides?
4. **Wie widerruft man eine falsch gelernte Regel?** Ohne Rücknahme-Semantik
   (welche Notiz ersetzt welche, was gilt bei Konflikt) akkumuliert der Harness
   Widersprüche. `trail` hat dafür `--replaces`; der Rest des Systems nicht.
5. **Ist "Loop Engineer" eine Rolle für den Menschen, ein Skill, oder ein
   Automatismus — und was darf er ohne Freigabe ändern?** Die Antwort entscheidet,
   ob Muster 10 genügt oder Muster 4–6 nötig werden.

---

## Belegbilanz

| Kategorie | Anzahl |
|---|---|
| Aussagen in der Belegtabelle | 27 |
| davon belegt (Datei/API gelesen, URL angegeben) | 22 |
| davon ausdrücklich widerlegt oder als nicht belegt markiert | 5 |
| Aussagen in den fünf Mechanismen (a–e), je mit Beleg | 5 Befunde + 5 Grenzen |
| davon belegt | 10 |
| davon als Negativbefund belegt (Abwesenheit geprüft) | in den 10 enthalten |
| Nicht im Volltext geprüfte, aber über Spezifikation belegte Dateien | 7 (in Sektion 2 benannt) |
| Nicht abrufbare Quellen | 0 |

**Zählweise.** Gezählt wurden Behauptungen, nicht Sätze. Eine Behauptung ist belegt,
wenn eine im Dokument genannte Datei oder API-Antwort sie trägt und die URL im Text
steht. Abwesenheitsbehauptungen gelten als belegt, wenn die Suche über den
vollständigen Dateibaum (2.817 Pfade, `truncated: false`) läuft und im Dokument
benannt ist. "Nicht belegt" heißt: keine Primärquelle im Repo trägt die Behauptung,
und die Widerlegung steht im Text.

---

## Provenienz

Dieses Dokument wurde von einem Modell geschrieben und danach gegen die Quellen
geprüft. Die Prüfung ist maschinell nachvollziehbar für: den Dateibaum (2.817 Pfade,
`truncated: false`), die gelesenen Dateien (Wortlaut oben zitiert) und die
arXiv-Metadaten (API-Antwort mit Titel und ID je Arbeit). Sie ist **menschliches
Urteil**, nicht maschinell geprüft, für: die Einordnung "Marketing vs. belegt", die
Zuordnung der Muster zu Andockpunkten und alle Aufwands- und Risikoschätzungen.

Verworfen wurden: die Deutung, der Skill-Audit sei eine Reflexionsschleife (er hat
keinen Reflexionstext und keinen Fehlerpfad); die Deutung, `PUT /api/skills/builtin/{name}`
sei Selbstmodifikation des Prompts (es ist ein Admin-Endpunkt ohne Agentenaufruf);
und die Übernahme der Odysseus-Konfidenzzahlen als Messwerte (sie sind gesetzt, nicht
kalibriert).

Nicht geprüft und deshalb im Text als solches benannt: `src/agent_loop.py`
(1.778.422 Bytes) sowie sieben Dateien aus `services/`, deren Verhalten nur über die
Repo-Spezifikationen belegt ist.

