# Regal: Bauen

Code ändern, prüfen, ausliefern. Das Regal beantwortet: *welcher Skill für welche Stufe der Arbeit?*

## Feature und Umbau

| Skill | Wann | Nicht wenn |
|---|---|---|
| `feature-dev-feature-dev` | mehrstufiges Feature mit Exploration, Architektur, Review | ein Einzeiler Fix |
| `feature-dev-agent-code-explorer` | erst verstehen, wo der Code liegt | du kennst die Datei schon |
| `feature-dev-agent-code-architect` | Entwurf mit Dateien, Datenfluss, Reihenfolge | die Änderung ist lokal |
| `feature-dev-agent-code-reviewer` | Review der eigenen Änderung | ein Fremder reviewt |
| `implement` | Auftrag liegt als Freitext vor | Spec und Tickets existieren |
| `implement-spec` | `to-spec` **und** `to-tickets` sind gelaufen | nur eine Spec ohne Tickets |
| `to-spec` | aus einem Gespräch eine Spec machen | die Spec steht schon |
| `to-tickets` | eine Spec in Arbeitspakete schneiden | die Spec ist noch unklar |
| `prototype` | eine Designfrage wegwerfbar beantworten | es soll bleiben |
| `prototype-fast` | in einer Stunde prüfen, ob es Spaß macht | Produktionscode entsteht |

## Prüfen und diagnostizieren

| Skill | Wann | Nicht wenn |
|---|---|---|
| `tdd` | Verhalten test-first festnageln | der Test ist ein Einzeiler |
| `diagnosing-bugs` | Ursache unklar, Reproduktion teuer | der Fehler ist offensichtlich |
| `wait-what` | der Auftrag ist unverständlich geworden | du nur mehr Kontext brauchst |
| `triage` | viele offene Punkte, Reihenfolge fehlt | ein Punkt ist klar |
| `eval-harness` | Pass/Fail-Kriterien vor dem Bauen | du willst nur einen Test |
| `agent-eval` | Agenten-Setups vergleichen (Passrate, Kosten) | ein Modell reicht |

## Architektur und Verstehen

| Skill | Wann | Nicht wenn |
|---|---|---|
| `codebase-design` | Schnittstelle eines Moduls entwerfen | die Datei ist klein |
| `domain-modeling` | Begriffe und Grenzen schärfen | das Vokabular steht |
| `architecture-decision-records` | eine Entscheidung mit Alternativen festhalten | es ist eine Stilfrage |
| `improve-codebase-architecture` | bestehende Struktur umbauen | nur eine Funktion wandert |
| `setup-ts-deep-modules` | tiefe Module als Projektkonvention | kein TS-Projekt |
| `graft` | Codebasis über den Graphen verstehen | der Graph fehlt |
| `codebase-memory` | Aufrufer, Abhängigkeiten, Impact | du kennst die Stelle |

## Review

| Skill | Wann | Nicht wenn |
|---|---|---|
| `code-review` | Branch/PR seit einem Punkt prüfen (Standards + Spec) | du den Diff selbst geschrieben hast und nur Bestätigung willst |
| `open-code-review` | OCR-CLI mit Repo-Regeln | kein `ocr` installiert |
| `open-code-review-delegate` | Review im Host-Agenten, OCR nur für Auswahl | OCR soll selbst urteilen |
| `pr-review-toolkit-review-pr` | mehrere spezialisierte Prüfer parallel | ein Reviewer genügt |
| `autofix` | CodeRabbit-Threads einzeln abarbeiten | keine Review-Threads |
| `security-audit` | Sicherheitslage, Angriffsfläche, Bericht | nur ein Lint-Fehler |

## Hygiene und Ausliefern

| Skill | Wann | Nicht wenn |
|---|---|---|
| `setup-pre-commit` | Husky, lint-staged, Typprüfung einrichten | Hooks existieren |
| `migrate-to-shoehorn` | `as`-Assertions in Tests ersetzen | kein TypeScript |
| `git-guardrails-claude-code` | gefährliche Git-Befehle blocken | du willst committen |
| `commit-commands-commit` | ein Commit | ein PR gehört dazu |
| `commit-commands-commit-push-pr` | Commit, Push, PR in einem | nur lokal |
| `commit-commands-clean-gone` | Branches mit `[gone]` aufräumen | nichts gelöscht |
| `pr` | PR-Text schreiben | der PR existiert noch nicht |

## Planung davor

| Skill | Wann |
|---|---|
| `wayfinder` | der Weg durch eine unklare Aufgabe fehlt |
| `grilling` | ein Plan soll hart geprüft werden |
| `to-questionnaire` | eine Entscheidung braucht die Antwort eines Menschen |
| `skill-index` | unklar, welcher Skill überhaupt passt |

## Reihenfolgen, die man nicht abkürzt

- **Spec → Code:** `to-spec` → `to-tickets` → `implement-spec` → `code-review`
- **Fehler:** `diagnosing-bugs` → Reparatur → `tdd`-Gegenprobe → `code-review`
- **Umbau:** `codebase-design` oder `improve-codebase-architecture` → `architecture-decision-records` → Umsetzung
