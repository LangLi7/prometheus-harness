---
title: "motioncore — Bewegung als Tokens, Audit und Review"
stand: 2026-10-27
tags:
  - pmh/subsystem
  - pmh/skills
---

# motioncore — Bewegung als Tokens, Audit und Review

## Kurzfassung

Bewegung ist die Schicht, die zwischen „sieht aus wie eine Vorlage" und „fühlt
sich gemacht an" entscheidet. `motioncore` hält sie klein: **drei Dauern, drei
Kurven, eine Staffelung**, dazu ein Audit, das Abweichungen im vorhandenen CSS
findet.

```bash
bun apps/cli/src/main.ts plugin marketplace add ./integrations/motioncore
bun apps/cli/src/main.ts plugin install motioncore@motioncore
```

Ergebnis: Skill `motioncore` und die Commands `motioncore-tokens`,
`motioncore-audit`, `motioncore-review`. Scanner: **0/100 SAFE**.

## Warum Plugin, nicht MCP

Bewegung ist **lokale Rechnung und Design-Urteil**. Es gibt keine Gegenstelle,
die man anfragen könnte; ein MCP-Server wäre eine Protokollschicht um ein
Regex-Audit. Der Nutzen eines Plugins liegt woanders: Commands werden im Katalog
sichtbar, die Skill wird bei „Animation", „Hero" oder „design.md §5" geladen, und
das Skript ist überall gleich aufrufbar.

## Tokens

| Preset | micro | ui | scene | Staffelung | Charakter |
|---|---|---|---|---|---|
| `calm` | 120 | 180 | 320 | 30 ms | ruhig, dokumentarisch |
| `editorial` | 150 | 240 | 480 | 45 ms | Standard für Marken-Seiten |
| `kinetic` | 180 | 300 | 600 | 60 ms | Launch, Kampagne |

Die erzeugte Datei enthält `:root`-Variablen und einen
`prefers-reduced-motion`-Block. Sie wird **vor** dem eigenen CSS geladen; die
Werte stehen zusätzlich in `design.md` §5.

## Audit

```bash
bun "$DSH_HOME/plugins/motioncore/motioncore/scripts/motioncore.mjs" audit <projekt>
```

Gelesen werden `.css`, `.scss`, `.html`, `.vue`, `.svelte`, `.jsx`, `.tsx`, `.js`,
`.ts`, `.astro` (max. 250 Dateien, 400 kB je Datei). Eigene Variablen werden
aufgelöst, damit `var(--motion-dur-ui)` nicht als 0 ms zählt.

| Stufe | Befund |
|---|---|
| Fehler | fehlendes `prefers-reduced-motion` bei Animationen |
| Fehler | `transition: all` |
| Warnung | Dauer > 600 ms, < 80 ms |
| Warnung | `linear` (außer Ambient) |
| Warnung | mehr als sieben verschiedene Dauern |
| Warnung | keine eigene `cubic-bezier`-Kurve |
| Info | keine Animation gefunden (statisch oder JS-getrieben) |

**Ambient** (`infinite` plus `spin|marquee|orbit|float|rotate|pulse|shimmer|drift|blink|ticker`)
wird getrennt gezählt: lange Dauer und `linear` sind dort korrekt und lösen keine
Warnung aus. Genau das hatte ArtCraft in v0.1 als Fehlalarm gemeldet.

Exit-Code 1 bei Fehlern — taugt für CI. `review` ergänzt die acht Regeln als
Checkliste.

## Die acht Regeln

1. Eine Sache bewegt sich pro Abschnitt.
2. Drei Dauern, nicht zehn.
3. Staffelung 30–60 ms.
4. Distanz 8–24 px.
5. Nur `transform` und `opacity`.
6. `prefers-reduced-motion` schaltet ab, nicht nur schneller.
7. Kein Idle-Wobble.
8. Exit ≠ Enter.

## Prüfung

| Fall | Ergebnis |
|---|---|
| `transition: all`, 900 ms, `linear`, kein reduced | 2 Fehler, 3 Warnungen, Exit 1 |
| Ambient-Fixture (36 s Marquee, Hover `linear`) | 0 Fehler, 1 Warnung (`linear`), Exit 0 |
| Tokens mit `var(--motion-dur-*)`, reduced vorhanden | 0 Befunde, Exit 0 |
| `tokens --preset calm` | CSS + optionales JSON |

## Grenzen

- Nur statisches CSS; GSAP/Framer-Motion erscheinen höchstens als Info.
- Keine Ästhetik-Bewertung, nur Konsistenz und Zugänglichkeit.
- Kein Vergleich zwischen Referenz und Umsetzung — das wäre der nächste Schritt
  (`motioncore diff`), braucht aber eine gerenderte Seite oder ein
  HyperFrames-Projekt als Eingang.
