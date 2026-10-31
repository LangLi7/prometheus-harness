# Easing-Katalog

Drei Kurven reichen. Jede hat eine Aufgabe; die Zahlen sind Startwerte, keine
Dogmen.

| Rolle | Kurve | Wann |
|---|---|---|
| Standard | `cubic-bezier(.2,.7,.2,1)` | Zustandswechsel, Hover, Menü, alles Alltägliche |
| Enter | `cubic-bezier(.16,1,.3,1)` | etwas erscheint: Dialog, Karte, Section-Reveal |
| Exit | `cubic-bezier(.4,0,1,1)` | etwas verschwindet: schneller, linearer |
| Emphasis | `cubic-bezier(.34,1.56,.64,1)` | nur `kinetic`: ein einzelner Akzent, nie Fließtext |

## Warum nicht `ease`/`ease-in-out`

Das sind Browser-Vorgaben, keine Entscheidungen. Sie sind weich, unauffällig und
auf jeder zweiten Seite zu finden. Eine eigene Kurve ist der kleinste Eingriff,
der eine Seite anders anfühlen lässt.

## Was nie gefedert wird

- Fließtext und Headlines unter 14 px
- Formulareingaben und Fokusringe
- Statusicons und Ladeanzeigen (die brauchen lineare Rotation)
- alles, was bei wiederholtem Auslösen flackert

## Fortschritt und Rotation

`linear` ist richtig für Fortschrittsbalken, Spinner und Uhrzeiger — dort ist
Gleichmäßigkeit die Aussage. Überall sonst ist `linear` ein Hinweis auf eine
nicht getroffene Entscheidung.

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

Das schaltet Bewegung ab, nicht nur leiser. Wer `scroll-behavior: smooth` benutzt,
muss es hier zurücksetzen.
