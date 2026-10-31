---
description: "Auditiert die vorhandene CSS-Bewegung eines Projekts auf Dauer, Easing, transition:all und prefers-reduced-motion und liefert eine Reparaturliste."
argument-hint: "<projektordner>"
---

# Motion auditieren

```bash
bun "$DSH_HOME/plugins/motioncore/motioncore/scripts/motioncore.mjs" audit <projektordner>
```

Lies den Bericht und beantworte knapp:

1. Wie viele verschiedene Dauern gibt es? Auf welche drei Rollen lassen sie sich
   zurückführen?
2. Welche **Fehler** stehen da (`transition: all`, fehlendes
   `prefers-reduced-motion`)? Die zuerst beheben.
3. Welche Warnungen sind echt, welche sind bewusst (z. B. 700 ms für eine
   bewusste Szene)?
4. Wo animiert der Code `width`/`height`/`top`/`left`? Das ist Layout-Arbeit,
   keine Bewegung — auf `transform` umstellen.

Ändere **nichts** ohne Rückfrage, wenn der Bericht nur Warnungen enthält.
Exit-Code 1 bedeutet: mindestens ein Fehler, der vor dem Launch weg muss.
