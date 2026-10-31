# Skill-Index — die Systematik

> **Zweck.** Rund 360 Skills sind geladen, verteilt über sechs Wurzeln (517 Skill-Ordner, weil
> Vendor-Quellen und Installationen dieselben Namen tragen). Der System-Katalog nennt jeden mit
> einer Zeile; er sagt nicht, welcher zu welcher Aufgabe gehört, welcher einen anderen
> ausschließt, und in welcher Reihenfolge sie laufen. Das leistet dieser Index.
>
> **Die eine Regel.** Erst das Regal, dann der Skill. Wer mit 360 Beschreibungen anfängt,
> nimmt den erstbesten Treffer; wer mit sechs Regalen anfängt, nimmt den richtigen.
>
> **Stand:** 28.10.2026, geprüft mit `catalog/check.ps1` (Abdeckung vollständig, alle Namen
> existieren, 36 Namenskollisionen zwischen Wurzeln).

## Wo die Bibliothek liegt

| Wurzel | Rang | Inhalt |
|---|---|---|
| `~/.agents/skills/` | 500 | Benutzer-Skills; die größte Sammlung (359) |
| `~/.dsh/skills/` | 400 | Home-Skills (36) |
| `<pmh-home>/skills/` | 400 | installierte Marketplace-Skills (71) |
| `.agents/skills/` (Projekt) | 200 | hier gepflegt (80) |
| `units/skills/*/skills/` | — | Herkunft der Vendor-Skills (85), nicht geladen |
| bundled | 600 | mit dem Harness geliefert (4) |

Kleinerer Rang gewinnt bei gleichem Namen: ein Projekt-Skill überstimmt den gleichnamigen
installierten. Deshalb liegt `code-review` dreifach (Projekt, `~/.agents`, `~/.dsh`) — es gilt
die Projektfassung. `check.ps1` nennt alle 36 solcher Kollisionen.

## Die sechs Regale

| Regal | Frage, die es beantwortet | Datei |
|---|---|---|
| **Bauen** | Code ändern, prüfen, ausliefern | `catalog/bauen.md` |
| **Gestalten** | Oberfläche, Design-System, Barrierefreiheit | `catalog/gestalten.md` |
| **Bewegen** | Motion, Video, HyperFrames, Remotion | `catalog/bewegen.md` |
| **Forschen** | herausfinden, belegen, vermessen | `catalog/forschen.md` |
| **Spiele** | Engine, Genre, Assets | `catalog/spiele.md` |
| **Agenten** | Harness, Skills, Lernen, Schreiben, Werkzeuge | `catalog/agenten.md` |

## Entscheidung in einem Schritt

| Absicht | Regal | Erster Griff |
|---|---|---|
| „bau mir das Feature" | Bauen | `feature-dev-feature-dev` (führt), sonst `implement` |
| „test-first" | Bauen | `tdd` |
| „das ist kaputt" | Bauen | `diagnosing-bugs` |
| „prüf meinen Branch" | Bauen | `code-review` |
| „ist das sicher?" | Bauen | `security-audit` |
| „sieht billig aus" | Gestalten | `design-taste-frontend`, dann `impeccable` |
| „schnell aufräumen" | Gestalten | `baseline-ui` |
| „Fehlerbehebung für Screenreader" | Gestalten | `fixing-accessibility` |
| „ein Video" | Bewegen | `hyperframes` (Gateway), dann das Genre |
| „warum fühlt sich die Bewegung falsch an" | Bewegen | `animation-principles` |
| „recherchier X" | Forschen | `research` (eine Frage), `deep-research` (Pipeline) |
| „lies dieses Repo" | Forschen | `repo-digest`, `repo-map` |
| „ein Spiel" | Spiele | `router` (Game-Router), dann Engine-Skill |
| „der Agent soll autonom laufen" | Agenten | `loop-engineering` |
| „verbessere diesen Prompt" | Agenten | `prompt-engineering` |
| „was haben wir gelernt" | Agenten | `retro`, `trail` |
| „welcher Skill passt überhaupt" | Agenten | `skill-index` (dieser Index) |

## Was ähnlich klingt und nicht dasselbe ist

| Paar | Unterschied | Nimm |
|---|---|---|
| `research` / `deep-research` | eine Frage mit Quellen / 13-Agenten-Pipeline mit Review | `research` zuerst |
| `retro` / `trail` / `loop-engineering` | Rückblick auf **eine** Sitzung / Lernnotiz für **später** / Entwurf **der Schleife** | je Auslöser |
| `grilling` / `grill-me` | das Verfahren / der Aufruf-Alias | `grilling` |
| `implement` / `implement-spec` | freie Aufgabe / setzt Spec **und** Tickets voraus | `implement-spec` nur mit beidem |
| `code-review` / `open-code-review` / `pr-review-toolkit-review-pr` | Review seit Punkt X / OCR-CLI / PR-Panel mit mehreren Prüfern | `code-review` als Standard |
| `hyperframes` / `hyperframes-cli` / `hyperframes-registry` | Vertrag und Arbeitsweise / CLI-Bedienung / fertige Bausteine | `hyperframes` zuerst |
| `design-taste-frontend` / `upstream-design-taste-frontend` | zwei Fassungen, 65 Bytes Unterschied | die lokale; vorher `check.ps1` lesen |
| `writing-for-agents` / `writing-beats` / `writing-shape` | Dokumente für Agenten / Prosa-Rhythmus / Textform | je Ziel |
| `loop-engineering` / `programmatic-tools` | Schleife entwerfen / mehrere Tools in einem Programm bündeln | `loop-engineering` zuerst |
| `persona-*` / `grilling` | eine Prüfperspektive / ein ganzes Interview | `grilling` für Pläne |

## Pipelines — die Reihenfolge ist der Skill

Manche Skills sind Stufen, keine Einzelstücke. Wer die Mitte aufruft, bezahlt die Vorstufe doppelt.

| Kette | Reihenfolge |
|---|---|
| **Spec → Code** | `to-spec` → `to-tickets` → `implement-spec` → `code-review` |
| **App nachbauen** | `replica-recon` → `replica-entrepreneur` → `replica-architect` → `replica-backend` → `replica-design` → `replica-build` → `replica-test` → `replica-diff` → `replica-brand` → `replica-launch` → `replica-deploy` |
| **Wissenschaft** | `research`/`deep-research` → `academic-paper` → `academic-paper-reviewer` → `academic-pipeline` (Gesamtlauf) |
| **Video** | `hyperframes` → `motion-doctrine` → Genre-Skill → `seam-craft` → `video-delivery-specs` |
| **Selbstverbesserung** | `retro` (Befund) → `loop-engineering` (Entwurf) → `eval-harness` (Messung) → `trail` (Lernnotiz) |

## Pflege

- **Neuer Skill?** Regal wählen, Eintrag ergänzen, `catalog/check.ps1` laufen lassen.
- **Skill gelöscht?** Der Index nennt ihn weiter, bis `check.ps1` ihn als fehlend meldet.
- **Zwei Namen, ein Inhalt?** Ins Duplikatpaar aufnehmen, nicht stillschweigend einen wählen.
- **Der Index selbst** ist kein Skill und wird nicht automatisch geladen; `skill-index` holt ihn.

## Fertig, wenn

Der gewählte Skill geladen ist — nicht nur benannt — und der Grund für die Wahl in einem Satz
steht. Wer zwei Kandidaten nicht trennen kann, nennt beide und fragt einmal nach.
