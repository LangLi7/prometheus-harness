# Roadmap

> **Absichtlich dünn.** Wir gehen Schritt für Schritt. Diese Datei hält nur fest, welcher
> Schritt als Nächstes ansteht — nicht eine Phasenplanung für Monate.

## Wo wir stehen

Noch kein eigener Code. Der Referenz-Fork (`C:\Users\Chang\harness\prometheus-harness`)
läuft und ist unser Vergleichsobjekt.

## Nächster Schritt

**Bun messen.** Die native Addons sind das einzige, was die Laufzeitwahl wirklich bestimmt:

- `koffi` — Schreiboperation mit Write-Through
- `node-pty` — PTY öffnen, Kommando senden, Ausgabe lesen

Fällt die Messung negativ aus, bleibt Node die Laufzeit und TS 7 wird nur der Typecheck.
Sonst ändert sich nichts.

## Danach

Wird hier eingetragen, wenn der Schritt dran ist. Alles Weitere steht in
[vision.md](vision.md) als Notizen und wird nach Bedarf gezogen.
