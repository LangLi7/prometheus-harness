---
description: "Erzeugt Motion-Tokens (Dauer, Easing, Staffelung, reduced-motion) für ein Website-Projekt und trägt sie in design.md §5 ein."
argument-hint: "[--preset calm|editorial|kinetic] [--out tokens.css]"
---

# Motion-Tokens erzeugen

```bash
bun "$DSH_HOME/plugins/motioncore/motioncore/scripts/motioncore.mjs" tokens --preset editorial --out tokens.css
```

Preset wählen nach Charakter, nicht nach Laune:

- `calm` — ruhige Marke, Dokumentation, viel Text.
- `editorial` — Standard für Landingpages und Marken-Seiten.
- `kinetic` — Launch, Kampagne, Bewegung als Hauptargument.

Danach:

1. `tokens.css` im Projekt ablegen und **vor** dem eigenen CSS laden.
2. In `design.md` §5 die Werte eintragen (Referenz, Dauer, Kurve, Staffelung,
   Auslöser).
3. Keine vierte Dauer einführen; wenn eine Komponente sie braucht, ist die Rolle
   falsch geschnitten.

Nenne am Ende Pfad, Preset und die drei Dauern.
