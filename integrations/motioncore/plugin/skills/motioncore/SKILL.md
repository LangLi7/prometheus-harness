---
name: motioncore
description: Motion-Schicht für Websites — benannte Tokens für Dauer, Easing und Staffelung, ein Audit vorhandener CSS-Bewegung und ein Review gegen die Hausregeln. Verwende diese Skill bei jeder Website, Landingpage oder UI mit Animation, beim Übernehmen einer Motion-Referenz (MotionClone), beim Prüfen von „alles fadet gleich", und wenn design.md §5 (Bewegung) gefüllt oder geprüft werden soll.
---

# motioncore — die Bewegung einer Seite

## Die Idee

Bewegung ist kein Dekor, sondern eine **kleine Sprache**: drei Dauern, drei
Kurven, eine Staffelung. Wer pro Komponente neu entscheidet, bekommt Rauschen.
Wer nur `ease-in-out` benutzt, bekommt Vorlage.

Diese Skill hält die Sprache klein und prüfbar. Sie ergänzt
`design-system-baseline` (§5 Bewegung) und nimmt die Werte aus einer
MotionClone-Referenz auf.

## Tokens

```bash
bun "$DSH_HOME/plugins/motioncore/motioncore/scripts/motioncore.mjs" tokens --preset editorial --out tokens.css
```

| Preset | micro | ui | scene | Staffelung | Charakter |
|---|---|---|---|---|---|
| `calm` | 120 | 180 | 320 | 30 ms | ruhig, dokumentarisch |
| `editorial` | 150 | 240 | 480 | 45 ms | Standard für Marken-Seiten |
| `kinetic` | 180 | 300 | 600 | 60 ms | Launch, Kampagne, viel Bewegung |

Die Datei enthält zusätzlich den `prefers-reduced-motion`-Block. Tokens werden
**einmal** in `:root` gesetzt und nur dort geändert.

## Rollen statt Zahlen

| Rolle | Wofür | Nicht für |
|---|---|---|
| `--motion-dur-micro` | Hover, Fokus, Icon-Wechsel | Seitenwechsel |
| `--motion-dur-ui` | Menü, Dialog, Karte öffnet | Hero |
| `--motion-dur-scene` | Hero, Section-Reveal, Seitenübergang | jeden Hover |

Eine vierte Dauer ist fast immer ein Fehler. Wenn eine Komponente eine eigene
braucht, ist die Rolle falsch geschnitten.

## Audit

```bash
bun "$DSH_HOME/plugins/motioncore/motioncore/scripts/motioncore.mjs" audit ./mein-projekt
bun "$DSH_HOME/plugins/motioncore/motioncore/scripts/motioncore.mjs" review ./mein-projekt
```

`audit` liest CSS/HTML/JSX/Vue/Svelte und meldet:

- **Fehler**: fehlendes `prefers-reduced-motion`, `transition: all`.
- **Warnungen**: Dauer über 600 ms, unter 80 ms, `linear`, mehr als sieben
  verschiedene Dauern, keine eigene Kurve.
- **Ambient** (`infinite` + `spin|marquee|orbit|float|rotate|pulse|shimmer|drift`):
  wird getrennt gezählt und nicht gewertet — lange Dauer und `linear` sind dort
  richtig.
- **Info**: keine Animation gefunden (statisch oder JS-getrieben).

Exit-Code 1 bei Fehlern — taugt für CI. `review` ergänzt die Checkliste.

## Die acht Regeln

1. **Eine Sache bewegt sich** pro Abschnitt. Zwei konkurrierende Bewegungen
   heben sich auf.
2. **Drei Dauern**, nicht zehn.
3. **Staffelung 30–60 ms** zwischen Karten; mehr wirkt wie Warten.
4. **Distanz 8–24 px.** Größere Sprünge sind Szenen, keine Hover-Effekte.
5. **Nur `transform` und `opacity`** animieren. `width`, `height`, `top`, `left`
   lösen Layout aus.
6. **`prefers-reduced-motion` schaltet ab**, nicht nur schneller.
7. **Kein Idle-Wobble.** Bewegung auf Ereignis, nicht in Schleife.
8. **Exit ≠ Enter.** Verlassen ist schneller und linearer als Ankommen.

## Rezepte

### Hero-Reveal

```css
.hero > * {
  opacity: 0;
  transform: translateY(var(--motion-distance));
  animation: hero-in var(--motion-dur-scene) var(--motion-ease-enter) forwards;
}
.hero > *:nth-child(2) { animation-delay: calc(var(--motion-stagger) * 1); }
.hero > *:nth-child(3) { animation-delay: calc(var(--motion-stagger) * 2); }

@keyframes hero-in {
  to { opacity: 1; transform: none; }
}
```

### Scroll-Staffelung

```css
.reveal { opacity: 0; transform: translateY(var(--motion-distance)); }
.reveal.is-visible {
  opacity: 1;
  transform: none;
  transition: opacity var(--motion-dur-ui) var(--motion-ease-standard),
              transform var(--motion-dur-ui) var(--motion-ease-standard);
  transition-delay: calc(var(--motion-stagger) * var(--i, 0));
}
```

`IntersectionObserver` setzt `is-visible` und `--i`. Kein Scroll-Listener, kein
`requestAnimationFrame`-Dauerlauf.

### Dialog

Enter mit `--motion-dur-ui` und `--motion-ease-enter`, Exit mit
`--motion-ease-exit` und 70 % der Dauer. Der Scrim fadet, das Panel skaliert von
0.98 auf 1 — nicht von 0.8.

## Von der Referenz zu Tokens

MotionClone liefert Keyframe-Zeiten und Kurven. Übernimm **nicht** jede Zahl,
sondern ordne sie den drei Rollen zu:

| Referenz | Token |
|---|---|
| häufigste Mikro-Dauer | `--motion-dur-micro` |
| häufigste Übergangsdauer | `--motion-dur-ui` |
| längste zusammenhängende Bewegung | `--motion-dur-scene` |
| häufigste Kurve | `--motion-ease-standard` |
| Abstand zwischen Elementen | `--motion-stagger` |

Danach `audit` gegen die eigene Seite: gleiche Rollen, keine Ausreißer.

## Grenzen

- Das Audit liest **statisches CSS**. JS-getriebene Animationen (GSAP, Framer
  Motion) erscheinen höchstens als Info.
- Es beurteilt keine Ästhetik und keine Marke — nur Konsistenz und
  Zugänglichkeit.
- `prefers-reduced-motion` wird nur erkannt, nicht ersetzt; die Verantwortung
  bleibt im CSS.
