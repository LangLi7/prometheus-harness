# Regal: Agenten

Harness, Skills, Lernen, Schreiben, Werkzeuge. Das Regal beantwortet: *wie arbeitet der Agent selbst — und wie wird er besser?*

## Die Bibliothek

| Skill | Wann |
|---|---|
| `skill-index` | unklar, welcher Skill passt; zwei Kandidaten sehen gleich aus |
| `writing-for-agents` | ein Skill, eine AGENTS.md oder ein Zeiger-Dokument entsteht |
| `plugin-dev-create-plugin` | ein Plugin von Grund auf bauen |
| `plugin-dev-agent-skill-reviewer` | einen Skill auf Wirksamkeit prüfen |
| `hookify-hookify` | Verhalten per Hook verhindern statt per Bitte |

## Lernen und Schleifen

| Skill | Wann | Nicht wenn |
|---|---|---|
| `loop-engineering` | eine wiederkehrende Arbeit autonom machen, mit Stopp und Rücknahme | du willst nur einen Prompt |
| `prompt-engineering` | **eine** Anfrage verbessern | die Schleife fehlt |
| `retro` | Rückblick auf **eine** Sitzung, Kandidaten für die Umgebung | du willst eine Regel festhalten |
| `trail` | eine Lernnotiz für spätere Sitzungen | du willst einen Rückblick |
| `eval-harness` | Pass/Fail-Kriterien, pass@k, Regressionen | ein einzelner Test |
| `agent-eval` | Agenten-Setups gegeneinander messen | ein Modell |
| `programmatic-tools` | ab drei abhängigen Tool-Aufrufen ein Programm statt Einzelaufrufe | ein Aufruf |

**Die Kette:** `retro` findet → `loop-engineering` entwirft → `eval-harness` misst → `trail` notiert.
Kein Schritt darf den vorigen überspringen; sonst wird aus einem Befund eine Meinung.

## Denken, Prüfen, Entscheiden

| Skill | Wann |
|---|---|
| `grilling` | einen Plan hart befragen, Runde für Runde |
| `grill-me` | Alias dafür (user-invoked) |
| `grill-with-docs` | dasselbe, mit Doku als Grundlage |
| `loop-me` | Workflows für wiederkehrende Abläufe entwerfen |
| `clarify-ambiguous-query` | ein Stichwort mit mehreren Lesarten |
| `to-questionnaire` | eine Entscheidung braucht einen Menschen |
| `persona-kritiker` / `persona-praezision` / `persona-butler` / `persona-finanz` / `persona-ueberwacher` / `persona-doppelprofil` | je eine Prüfperspektive auf einen Entwurf |
| `chief-of-staff` | Lagebild und Priorisierung |
| `ask-matt` | zweite Meinung zu einer Designfrage |

## Schreiben

| Skill | Wann |
|---|---|
| `writing-for-agents` | Dokument, das ein Agent liest |
| `writing-beats` | Prosa-Rhythmus, Satzbau |
| `writing-fragments` | Splitter und Notizen ordnen |
| `writing-shape` | Textform und Aufbau |
| `ship-docs` | Doku-Seite bauen und veröffentlichen |
| `teach` | jemandem etwas erklären |
| `scaffold-exercises` | Übungen mit Lösungen anlegen |
| `rotate-pages` | PDF-Seiten drehen |

## Werkzeuge bedienen

| Skill | Wann | Nicht wenn |
|---|---|---|
| `browser-local` | echter Chromium über CDP: klicken, Screenshots, angemeldete Seiten | nur eine öffentliche Seite lesen |
| `playwright-cli` | Browser-Tests und Automatisierung | ein einzelner Screenshot |
| `media-use` | Musik, SFX, Bilder, Icons, Voiceover beschaffen | alles liegt vor |
| `hf-cli` | Hugging Face: Modelle, Datasets, Jobs | kein HF |
| `wizard` | ein Assistent für Schritte, die nur ein Mensch tun kann | der Agent kann es selbst |
| `claude-handoff` / `handoff` | Übergabe an ein anderes Harness | du bleibst in dieser Sitzung |
| `external-agents` | Claude Code, Codex, Hermes, Pi als Unterprozess | der Harness reicht |

## Einrichtung

`setup-pre-commit`, `setup-pstack`, `setup-ts-deep-modules`, `setup-matt-pocock-skills`,
`commit-commands-commit`, `commit-commands-clean-gone`, `git-guardrails-claude-code`.

## Abgrenzung

`loop-engineering` entwirft **die Schleife**, `prompt-engineering` **die Anfrage**,
`retro` **den Rückblick**, `trail` **die Notiz**. Vier Zeitpunkte, vier Skills — und
`skill-index` ist der Wegweiser davor, kein Ersatz.
