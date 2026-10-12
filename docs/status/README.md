# Status-Snapshots — Zweck und Regeln

> **Was dieser Ordner ist:** der fortlaufende, überprüfbare Stand der Arbeit.
> Jeder „Zwischenstand" wird hier abgelegt, nicht nur in den Chat geschrieben.

## Warum das hier liegt und nicht im Chat

Ein Zwischenstand im Chat ist nach der nächsten Nachricht weg. Ein Zwischenstand als Datei
ist **nachprüfbar** — mit Datum, Befehl und Ergebnis. Der Unterschied ist genau der, den der
Selbstverbesserungs-Loop verlangt (`self-improve`: „Dateien lügen nicht"). Deshalb gilt:

| Regel | Bedeutung |
|---|---|
| **Jeder Snapshot nennt Datum und Uhrzeit** | ein Befund ohne Zeit ist keine Messung |
| **Jeder Befund nennt den Befehl** | wer zweifelt, führt ihn aus und sieht dasselbe |
| **Gemessenes und Gedeutetes stehen getrennt** | Überschrift bzw. Spalte macht es sichtbar |
| **Fehlschläge werden berichtet** | ein Snapshot ohne Fehlschläge ist entweder leer oder geschönt |
| **Kein Snapshot wird nachträglich korrigiert** | Korrekturen kommen als **neuer** Snapshot mit Bezug auf den alten |

## Die zwei Dateien mit unterschiedlicher Aufgabe

| Datei | Was sie beantwortet | Rhythmus |
|---|---|---|
| `git-audit.md` | Wurde **wirklich** gepusht? Was genau ist auf GitHub? | bei **jedem** Push |
| `NNNN-JJJJ-MM-TT.md` | Wo steht das Projekt inhaltlich? Was ist offen? | bei jedem größeren Fortschritt |

Das Git-Audit ist bewusst eine **eigene** Datei: ein Push ist eine Handlung mit
Außenwirkung, und eine Handlung ohne Nachweis ist eine Behauptung. Der Nachweis ist die
Übereinstimmung von lokalem `HEAD` und `origin/main`, ausgelesen **über die API** — nicht
aus dem eigenen Gedächtnis.

## Rhythmus: alle vier Stunden

Der Betreiber hat einen festen Takt vorgegeben: **alle vier Stunden** — 00:00, 04:00,
08:00, 12:00, 16:00, 20:00. Zu jedem Takt gehört:

1. Arbeitsstand sichern und **pushen** (`git add -A`, Commit mit Aussage, `git push`).
2. Den Push **auditieren** und in `git-audit.md` eintragen.
3. Wenn Code sich geändert hat: `code-review` und die Security-Skills darüber laufen lassen.
4. Ergebnis als Snapshot ablegen.

**Ehrliche Einschränkung:** Dieser Takt läuft **innerhalb einer Sitzung**, nicht als
Hintergrunddienst. Ein Takt, der ohne laufenden Agenten nicht feuert, ist kein Cronjob —
wer den Takt verlässlich will, braucht dafür einen echten Scheduler (Go, `services/pmh-scheduler`,
geplant in `MAPPING.md` §3.7). Das ist ein **offener Punkt**, keine erfüllte Zusage.

## Skepsis als Arbeitsweise

Für Reviews und Planung gilt die pessimistische Lesart: **Nicht „läuft es?", sondern „wie
kann es brechen, und was habe ich nicht geprüft?"** Konkret:

- Ein Testlauf, der nichts geprüft hat (`review_skipped`, 0 Findings), ist **kein** Beweis
  für sauberen Code — sondern für einen nicht gelaufenen Test.
- Eine grüne Zahl ohne Befehl ist keine Messung.
- „Vermutlich funktioniert" wird als offener Punkt geführt, bis es gemessen ist.
- Was nicht geprüft werden **konnte**, wird als Lücke benannt, nicht weggelassen.

## Register

Jede Datei in diesem Ordner wird in [`../INDEX.md`](../INDEX.md) eingetragen — die dortige
Konvention („Neue Datei? Dann hier eintragen") gilt auch hier.
