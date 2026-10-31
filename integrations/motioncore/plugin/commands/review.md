---
description: "Reviewt die Bewegung einer Seite gegen die acht motioncore-Regeln und liefert höchstens sieben konkrete Änderungen."
argument-hint: "<projektordner>"
---

# Motion reviewen

```bash
bun "$DSH_HOME/plugins/motioncore/motioncore/scripts/motioncore.mjs" review <projektordner>
```

Prüfe zusätzlich zum Bericht am Code:

- Bewegt sich pro Abschnitt **eine** Sache, oder konkurrieren mehrere?
- Gibt es Idle-Wobble (Dauerschleife ohne Ereignis)?
- Ist der Exit schneller als der Enter?
- Schaltet `prefers-reduced-motion` wirklich ab — oder nur schneller?
- Staffelung zwischen 30 und 60 ms?
- Nur `transform`/`opacity`?

Liefere **maximal sieben** Änderungen, nach Wirkung sortiert, jede mit Datei und
CSS-Eigenschaft. Keine Geschmacksurteile ohne Bezug zur Regel.
