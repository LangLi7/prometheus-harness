---
name: skill-index
description: Finds the right skill for a task by shelf instead of scanning all ~350. Use when you are unsure which skill fits, when two skills look interchangeable, before starting a multi-step job that may already have a pipeline, or when the user asks "which skill should we use" / "welcher Skill passt". Loads INDEX.md, then one shelf catalogue.
license: MIT
---

# Skill-Index — der Bibliothekar

Rund 360 Skills sind in dieser Umgebung geladen. Der System-Katalog nennt jeden mit einer Zeile; er sagt nicht, welcher zu welcher Aufgabe gehört und welcher einen anderen ausschließt. Diese Skill macht die Auswahl in vier Schritten.

## Die Regel

**Erst das Regal, dann der Skill.** Wer mit 350 Beschreibungen anfängt, nimmt den erstbesten Treffer. Wer mit sechs Regalen anfängt, nimmt den richtigen.

## Vorgehen

1. **Regal bestimmen.** `read` auf `INDEX.md` (Pfad unten). Sechs Regale: Bauen, Gestalten, Bewegen, Forschen, Spiele, Agenten. Die Tabelle „Entscheidung in einem Schritt" nennt für die häufigsten Absichten das Regal und den ersten Griff.
2. **Katalog laden — genau einen.** `read` auf `catalog/<regal>.md`. Er nennt je Skill *wann* und *nicht wenn*, also die Abgrenzung, die der System-Katalog nicht hat.
3. **Kandidaten prüfen.** Zwei Skills, deren Tabellenzeilen beide passen, sind ein Duplikat oder eine Stufenfolge. Prüfe im Katalog unter „Reihenfolgen" und in der Duplikat-Tabelle des `INDEX.md`, bevor du einen wählst.
4. **Laden und begründen.** Rufe `skill` mit dem exakten Namen auf und nenne in einem Satz, warum dieser und nicht der Nachbar.

## Pfade

| Was | Pfad |
|---|---|
| Systematik | `.agents/skills/INDEX.md` |
| Regal Bauen | `.agents/skills/catalog/bauen.md` |
| Regal Gestalten | `.agents/skills/catalog/gestalten.md` |
| Regal Bewegen | `.agents/skills/catalog/bewegen.md` |
| Regal Forschen | `.agents/skills/catalog/forschen.md` |
| Regal Spiele | `.agents/skills/catalog/spiele.md` |
| Regal Agenten | `.agents/skills/catalog/agenten.md` |
| Drift-Prüfung | `.agents/skills/catalog/check.ps1` |

## Wann nicht laden

- Der Skill ist offensichtlich (`tdd` bei „test-first") — dann direkt laden, ohne Zeremonie.
- Der Nutzer hat den Skill genannt — dann seinen Namen nehmen, nicht suchen.
- Die Aufgabe ist eine Zeile Code — dann kein Regal, sondern arbeiten.

## Fertig, wenn

Der gewählte Skill **geladen** ist, nicht nur benannt, und der Grund für die Wahl in einem Satz steht. Wer zwei Kandidaten nicht trennen kann, nennt beide und fragt einmal nach, statt zu raten.

## Pflege

Der Index ist von Hand gepflegt und läuft auseinander, wenn niemand nachsieht. `pwsh -File .agents/skills/catalog/check.ps1` meldet:
- Skills im Projekt, die im Index fehlen,
- Namen im Index, die es nirgends gibt,
- doppelte Namen über zwei Wurzeln.

Exitcode 1 heißt: der Index lügt an mindestens einer Stelle.
