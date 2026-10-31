# Katalog — wie der Index gepflegt wird

Der Katalog ist die zweite Ebene unter [`../INDEX.md`](../INDEX.md). Der Index trägt die
Ordnung: sechs Regale, ein Entscheidungsbaum, die Duplikat-Tabelle. Der Katalog trägt die
Entscheidung pro Regal: *wann* ein Skill, *wann nicht*.

## Was hier liegt

| Datei | Regal |
|---|---|
| `bauen.md` | Code ändern, prüfen, ausliefern |
| `gestalten.md` | Oberfläche, Design-System, Barrierefreiheit |
| `bewegen.md` | Motion, Video, HyperFrames, Remotion |
| `forschen.md` | herausfinden, belegen, vermessen |
| `spiele.md` | Engine, Genre, Assets |
| `agenten.md` | Harness, Skills, Lernen, Schreiben, Werkzeuge |
| `check.ps1` | Drift-Prüfung gegen den Bestand |

## Die drei Regeln beim Eintragen

1. **Ein Regal, eine Zeile.** Der Katalog wiederholt die Beschreibung aus dem System-Katalog
   **nicht**. Er nennt nur, was dort fehlt: die Abgrenzung („nicht wenn") und die Reihenfolge.
2. **Der Name ist der Schlüssel.** Immer der exakte Skill-Name in Backticks. Der Check liest
   genau diese Form.
3. **Abgrenzung vor Vollständigkeit.** Ein Paar, das verwechselt wird, ist wertvoller als zehn
   Skills, die niemand sucht. Wo zwei Skills fast dasselbe tun, gehört das in die
   Duplikat-Tabelle im `INDEX.md`.

## Prüfen

```powershell
pwsh -File .agents/skills/catalog/check.ps1
```

Drei Befunde, Exitcode 1 bei den ersten beiden:

| Befund | Bedeutung | Behebung |
|---|---|---|
| **Abdeckung** | ein Projekt-Skill steht in keinem Regal | Regal wählen, Zeile ergänzen |
| **Genauigkeit** | ein Name im Index existiert in keiner Wurzel | Tippfehler korrigieren oder Zeile löschen |
| **Doppelung** | derselbe Name in zwei aktiven Wurzeln | kein Fehler; der Rang entscheidet. Nur prüfen, ob die richtige Fassung gewinnt |

Die Prüfung kennt sechs Wurzeln: Projekt, `<pmh-home>/skills`, `~/.agents/skills`,
`~/.dsh/skills` sowie `units/skills`, `marketplaces` und `plugins` als Herkunft. Fehlt eine
Wurzel in einer anderen Umgebung, überspringt der Check sie stillschweigend — die Zahlen im
Kopf der Ausgabe sagen, wie viele er gesehen hat.

## Warum von Hand und nicht generiert

Eine generierte Liste wäre vollständig und wertlos: Sie wiederholte den System-Katalog, den
der Agent ohnehin im Kontext hat. Der Wert liegt in der **Abgrenzung**, und die kann kein
Skript aus einem Frontmatter ableiten — sie entsteht aus einem Vergleich, den jemand
entschieden hat.

Der Check ist deshalb die halbe Automatik: Er findet, was fehlt und was nicht existiert; die
Entscheidung, *warum* etwas in ein Regal gehört, bleibt beim Menschen.

## Wenn der Katalog zu groß wird

Ab etwa 40 Zeilen pro Regal lohnt der Schnitt nach **Absicht** statt nach Technologie —
„schnell aufräumen" und „Richtung entscheiden" sind zwei Regale, „UI" ist keines. Der
`INDEX.md` bleibt der Einstieg; die Regale dürfen wachsen.
