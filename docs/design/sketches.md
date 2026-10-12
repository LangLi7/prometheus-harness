# Skizzen: Verfahren und Verweis

Die Entwürfe liegen **außerhalb** dieses Projekts:

```
H:\Projekt\Programmieren\Prometheus\sketches
```

Wir kopieren sie nicht ins Projekt und verändern sie nicht. Diese Notiz hält nur fest, **wie**
dort gearbeitet wird — dieses Verfahren übernehmen wir.

## Aufbau der Vorlage

```
index.html                    ← Übersicht/Einstieg
bal.js, balcheck.js           ← kleine Hilfsskripte (je ~1 KB)
002-g-universe/index.html     ← aktuelle Variante (~31 KB)
archive/002-b-void/           ← verworfene Varianten, je index.html
archive/002-d-orbit/
archive/002-e-orbitvoid/
archive/002-f-galaxy/
```

## Das Verfahren

1. **Eine Variante = eine einzelne HTML-Datei.** Kein Build, kein Framework, sofort im
   Browser zu öffnen — genau deshalb kann man zehn Fassungen nebeneinanderlegen.
2. **Fortlaufend nummeriert.** `002-…` ist die laufende Reihe; der Buchstabe dahinter ist
   die Fassung (`b`, `d`, `e`, `f`, `g`).
3. **Die aktuelle Fassung bleibt oben**, alles Verworfene wandert nach `archive/`. Nichts
   wird gelöscht — die verworfenen Wege bleiben als Beleg erhalten.
4. **Erst vergleichen, dann bauen.** Übernommen wird nicht die Datei, sondern die
   Entscheidung, die sie sichtbar gemacht hat.

## Wie wir das weiterführen

- Die Skizzen bleiben der **Darstellungsort für Varianten** — auch weiterhin außerhalb des
  Projekts.
- Was sich durchsetzt, wird als **Unit** in `prometheus-harness` gebaut und dort gepflegt;
  die Skizze bleibt als Herkunftsnachweis liegen.
- Sobald eine Skizze zur Unit wird, steht die Begründung in
  [ui-keep-cut.md](ui-keep-cut.md).

Zurück zum [Katalog](../INDEX.md).
