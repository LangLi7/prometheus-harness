# Herkunft: human-factors

Diese fünf Dateien sind **unverändert** übernommen aus dem Go-Projekt Prometheus:

`H:\Projekt\Programmieren\Prometheus\docs\research\human-factors\` — Stand 05.–06.08.2026.

Sie sind die Evidenzbasis für die Personas in [`docs/design/crew-personas.md`](../../design/crew-personas.md).

## Was gilt — und was nicht

**Gilt hier.** Die neurobiologischen und psychologischen Aussagen: Dopamin als
Vorhersagefehler-Signal, Delay Discounting, DMN/TPN, Predictive Coding (HIPPEA), Working
Memory, prospektives Gedächtnis, RSD, PDA, Monotropismus, AuDHD als Konflikt zweier Systeme.
Diese Aussagen hängen nicht am Programmiersprachen-Stack.

**Gilt nur dort.** Die Go-/Pod-/Voice-Bezüge: `internal/agent`, `internal/voice`, Ornith,
Voxtral, whisper, `prompts/`, Raspi, NixOS. Wer diese Dateien im Harness liest, muss sie
übersetzen — der Harness hat weder Pods noch einen Voice-Hub.

**Gilt nirgends als Diagnose.** Die Dateien sagen es selbst: kein medizinisches Produkt,
keine Diagnostik, keine Therapie. Das ist eine Interaktions- und Strukturschicht.

## Was im Harness daraus geworden ist

- Prüfkriterien für die drei neurodivergenten Personas und die Butler-Persona
  (`docs/design/crew-personas.md` §7): salienter Cue, ohne Nachdenken startbarer erster
  Schritt, angekündigte Änderung, billige Rückkehr nach Abbruch, Bestätigungsschleife.
- Die Memory-Grenze („nie Diagnosen oder Annahmen über Neurodivergenz speichern") als
  gemeinsamer Kopf jeder Persona-Fassung.
- Die Erkenntnis, dass **Tonfall funktional** ist (RSD) und **deklarative Sprache** eine
  Zugänglichkeitsmaßnahme (PDA) — keine Stilfrage.

## Ein Befund im Quellprojekt

`prompts/` enthält **zwei** Persona-Dateien (`20-persona.md`, `persona.md`), und
`internal/prompt/prompt.go` verkettet **alle** `*.md` alphabetisch. Beide landen also im
System-Prompt, mit leicht widersprüchlichen Regeln. Das ist hier **nicht** übernommen; im
Quellprojekt sollte eine Datei übrig bleiben.

## Nicht übernommen

| Datei | Warum nicht |
|---|---|
| `STATUS.md` | beschreibt den Build-Stand des Go-Projekts, nicht des Harness |
| `UI_REDESIGN_RESEARCH.md` | UI des Go-Projekts |
| `BRAIN_GALAXY_IDEA.md` | Konzept ohne Code, gehört zur 3D-Welt des Go-Projekts |

## Weiterverwendung

Die Dateien sind **Referenz**, nicht Quelle der Wahrheit für den Harness. Wer eine Aussage
daraus in Code oder Prompts verwendet, soll sie gegen die Primärliteratur prüfen (die
Dateien nennen sie) und die Herkunft nennen.
