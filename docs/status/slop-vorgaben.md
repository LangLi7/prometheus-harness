# Slop-Vorgaben — was eine Änderung erfüllen muss

> **Zweck.** Zehn Vorgaben, die verhindern, dass Arbeit aussieht wie Fortschritt. Sie kommen
> aus der Beleglage in [`docs/research/ai-slop-code-2026.md`](../research/ai-slop-code-2026.md),
> nicht aus dem Geschmack. Sie gelten für Code, Dokumente, Commits, Pull Requests und für
> jede Antwort eines Agenten, die Arbeit behauptet.
>
> **Verhältnis zu [`arbeitsweise.md`](arbeitsweise.md).** Dort steht, was aus eigenen Fehlern
> gelernt wurde (messen, Gegenprobe, nicht raten). Hier steht, was aus der Forschung folgt
> (Prüflast, Allmende, Lesbarkeit). Beide gelten; bei Widerspruch gilt die strengere.
>
> Stand: 2026-10-28.

---

## 1. Was Slop ist — in einem Satz

Slop ist Arbeit, die billig erzeugt, nicht geprüft und an den Nächsten weitergereicht wird.
Drei Merkmale verraten sie: Sie sieht kompetent aus, ihr Aufwand liegt beim Prüfer, und sie
lässt sich beliebig vermehren.

Die Vorgaben greifen deshalb an einer Stelle: **Prüfung ist Teil der Arbeit, nicht ihr
Nachtrag.**

---

## 2. Die zehn Vorgaben

**1. Kleinster Schnitt.**
Eine Änderung hat einen Zweck. Kein „gleich mit aufgeräumt", kein Umbau, den niemand
angefordert hat.
*Prüfung:* `git diff --stat` nennt nur Dateien, die der Zweck braucht.

**2. Eine Prüfung, die rot werden kann.**
Jede Verhaltensänderung bekommt eine Prüfung, die ohne die Änderung scheitert. Ein Test, der
immer grün ist, ist keine Prüfung, sondern Dekoration.
*Prüfung:* die Gegenprobe ist gelaufen — Änderung zurückgenommen, Test rot, Änderung wieder
eingesetzt, Test grün.

**3. Beleg statt Behauptung.**
Jede Aussage über Zustand, Zahl oder Wirkung stammt aus einem Lauf. „Nicht messbar" ist eine
zulässige Antwort; „bestanden" ohne Lauf ist keine.
*Prüfung:* im Bericht stehen drei Sätze — was geprüft, womit geprüft, was nicht geprüft.

**4. Lesbar ohne Rückfrage.**
Ein Fremder kommt durch den Code, ohne den Autor zu fragen. Namen sagen die Absicht, eine
Funktion tut eine Sache, Fehler werden nicht geschluckt. `any`, `as` und `@ts-ignore` sind
Stummschaltungen und brauchen einen Satz Begründung.
*Prüfung:* die geänderte Stelle laut vorgelesen — stockt der Satz, ist der Code nicht fertig.

**5. Keine erfundenen Namen.**
Feld-, Typ-, Konstanten-, Werkzeug- und Schnittstellennamen werden an der Quelle gelesen,
nicht aus dem Gedächtnis geschrieben (Regel 11 und 23 in [`arbeitsweise.md`](arbeitsweise.md)).
*Prüfung:* jede neue Schnittstelle nennt ihre Fundstelle — Datei und Zeile.

**6. Abhängigkeiten sind Verdacht.**
Ein neues Paket wird nur aufgenommen, wenn Name und Quelle geprüft, der Zweck im Commit
genannt und die Fassung gepinnt ist. Ein Vorschlag eines Modells ist kein Grund.
*Prüfung:* der Name existiert exakt in der Registry — nicht nur ein ähnlicher.

**7. Provenienz.**
Wenn ein Agent wesentliche Teile geschrieben hat, steht im Commit oder PR, was erzeugt, was
geprüft und was verworfen wurde. „Ich habe es geschrieben" ist falsch, wenn es generiert
wurde.
*Prüfung:* der Satz „erzeugt mit … / geprüft durch …" ist vorhanden oder es ist belegt, dass
er nicht nötig war.

**8. Review ist kein Gate.**
Ein Kommentar eines Modells ist ein Hinweis, keine Freigabe. Sicherheitskritische Pfade —
Anmeldung, Kryptographie, Zahlungen, Datenzugriff — gibt ein Mensch frei, der den Code
erklären kann.
*Prüfung:* der Freigebende kann den geänderten Pfad in eigenen Worten erklären.

**9. Dokumente sind Behauptungen.**
Jede Zahl, jeder Pfad und jeder Verweis in einem Dokument wird geprüft oder als ungeprüft
markiert. Eine Regel, die es nicht gibt, ist schlimmer als keine Regel (Regel 35 in
[`arbeitsweise.md`](arbeitsweise.md)).
*Prüfung:* jeder Verweis zeigt auf eine existierende Stelle; jede Zahl hat einen Lauf.

**10. Keine Output-Metriken.**
Zeilen, PR-Zahlen und Akzeptanzraten sind keine Produktivität. Wer misst, misst Review-Zeit,
Nacharbeit, entkommene Fehler und Änderungsfehlerrate.
*Prüfung:* die Metrik ändert sich auch dann zum Guten, wenn jemand weniger Code schreibt.

---

## 3. Die sieben Muster, an denen Slop erkennbar ist

| Muster | Warum das Slop ist | Was stattdessen gilt |
|---|---|---|
| `setTimeout` als Behebung | verdeckt die Ursache, statt sie zu beheben | die Race verstehen und den Test schreiben, der sie zeigt |
| `as any` / `@ts-ignore` | stellt den Prüfer stumm, nicht den Fehler | Typ reparieren oder die Ausnahme begründen |
| Test angepasst, Code nicht | die Prüfung bestätigt jetzt den Fehler | Test bleibt rot, bis der Code stimmt |
| 800-Zeilen-Diff | Review ist unmöglich, also findet es nicht statt | in reviewbare Schritte teilen |
| toter Code „für später" | bezahlt heute, genutzt vielleicht nie | löschen; die Versionsverwaltung erinnert sich |
| neues Paket aus dem Gedächtnis | Supply-Chain-Risiko, siehe Slopsquatting | Name, Quelle, Fassung prüfen und pinnen |
| „fast richtig" ohne Lauf | Behauptung ersetzt Prüfung | laufen lassen; das Ergebnis in den Bericht |

Diese Muster sind nicht verboten, weil sie hässlich sind, sondern weil sie die Prüfung an
jemanden weiterreichen, der sie nicht bestellt hat. **Wie sie im Alltag aussehen — je ein
Paar aus Slop und Arbeit — steht in [`slop-vergleich.md`](slop-vergleich.md).**

---

## 4. Definition of Done

Eine Aufgabe ist fertig, wenn alle sechs Punkte zutreffen:

1. Der Schnitt ist klein und begründet.
2. Die Prüfung ist gelaufen und konnte rot werden.
3. Der Bericht nennt geprüft, nicht geprüft und offen.
4. Die geänderte Stelle ist ohne Rückfrage lesbar.
5. Neue Namen und neue Abhängigkeiten haben eine Fundstelle.
6. Erzeugtes ist als erzeugt benannt.

Fehlt ein Punkt, ist die Aufgabe nicht fertig — sie ist angefangen.

---

## 5. Der Fünf-Satz-Test vor jeder Antwort

Wer Arbeit meldet, beantwortet fünf Sätze, bevor er „fertig" sagt:

1. Was ist geändert?
2. Womit ist es geprüft?
3. Was ist **nicht** geprüft?
4. Was daran hat ein Modell erzeugt?
5. Was ist offen geblieben?

Fünf Sätze, keine Aufsätze. Wer sie nicht schreiben kann, hat nicht gearbeitet, sondern
formuliert.

---

## 6. Durchsetzung

Die Vorgaben sind keine Empfehlungen. Ein Verstoß blockiert den Merge, bis er behoben oder
mit Datum und Grund als Ausnahme benannt ist. Ausnahmen werden im selben Zug aufgeschrieben,
in dem sie gemacht werden — sonst sind sie beim nächsten Leser unsichtbar.

Drei Stellen prüfen:

- **Der Wächter:** `bun run check:slop --range main...HEAD` prüft die drei Muster, die ein
  Rechner entscheiden kann — Typ-Stummschaltung, Diff-Größe, Abhängigkeit ohne Sperrdatei.
  Ein Fund blockiert; eine Ausnahme steht als `slop-ok: <Grund>` an der Zeile.
- **Vor dem Merge:** die Liste in [`vor-dem-merge.md`](vor-dem-merge.md) bleibt zuständig;
  die vier Fragen aus ihrem §2a kommen im Review dazu. Sie sind keine Häkchen — sie können
  nicht grün werden, und genau deshalb stehen sie getrennt.
- **Im Review:** die Muster aus §3. Wer eines findet, benennt es beim Namen und verlangt die
  Reparatur — nicht die Erklärung, warum es diesmal in Ordnung ist.

---

## 7. Was diese Vorgaben nicht leisten

Sie verhindern keinen schlechten Entwurf. Sie verhindern, dass ein schlechter Entwurf
ungeprüft durchgeht. Sie machen Arbeit langsamer, sichtbar langsamer am Anfang — und das ist
der Punkt: Die Zeit, die beim Schreiben gespart wird, wird beim Prüfen ausgegeben. Wer sie
nicht dort ausgibt, gibt sie später aus, mit Zinsen.
