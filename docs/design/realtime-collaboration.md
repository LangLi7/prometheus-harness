# Echtzeit-Bearbeitung

> **Notiz für später.** Beschreibt ein Zielbild, keine Planung. Aufgenommen am 12.10.2026.

## Die Anforderung

**Echtzeit-Bearbeitung wie im Web** — mehrere Teilnehmer bearbeiten dasselbe Dokument
gleichzeitig und sehen einander live. Vorbilder: **Figma**, **Google Docs**, Notiz-Apps.

Und zwar mit **beiden** Teilnehmerarten zugleich:

- **Multi-User** — mehrere Menschen
- **Multi-Agent** — mehrere Agenten

## Der Gedanke, der das wertvoll ist

**Multi-Agent und Multi-User sind dasselbe Problem.** Ein Agent, der mitschreibt, ist ein
Teilnehmer wie ein Mensch — mit einer Kennung, einem Cursor, einer Auswahl und einem
Schreibstrom. Wer das eine löst, hat das andere gelöst.

Das ist insofern bemerkenswert, als der Referenz-Harness diese beiden Welten heute
**getrennt** behandelt: Agent Teams koordinieren Agenten über Postfächer und ein Task-Board,
aber es gibt keine gemeinsame Bearbeitung eines Dokuments durch Mensch und Agent.

## Was das technisch bedeutet

| Baustein | Rolle |
|---|---|
| **CRDT** | Konfliktauflösung ohne zentrale Sperre — jeder Teilnehmer darf lokal schreiben |
| **Transport** | WebSocket oder vergleichbar, für Änderungen **und** Anwesenheit |
| **Anwesenheit** | Wer ist da, wo ist der Cursor, was ist ausgewählt |
| **Persistenz** | Momentaufnahmen plus Verlauf, damit ein Dokument wiederherstellbar ist |
| **Identität** | Teilnehmer brauchen eine Kennung — für Menschen und Agenten dieselbe Form |

Gängige Bibliotheken wären **Yjs** oder **Automerge** für den CRDT-Teil.

## Die Kernfrage, die entschieden werden muss

> **Wie schreibt ein Agent in das geteilte Dokument?**

| Weg | Konsequenz |
|---|---|
| **Der Agent schreibt durch den CRDT** | Jeder Zwischenschritt ist live sichtbar, nachvollziehbar und umkehrbar — aber der Agent muss in kleinen Änderungen arbeiten, nicht in fertigen Blöcken |
| **Der Agent schreibt am Ende** | Einfacher für den Agenten, aber die Zusammenarbeit ist keine echte — die anderen sehen nur das Ergebnis |

Der erste Weg ist der, der „wie Figma" wirklich entspricht. Er verlangt aber, dass der
Agent-Loop **inkrementell** arbeitet und dass seine Änderungen als CRDT-Operationen
formuliert werden.

## Der Konflikt mit dem heutigen Modell

Der Referenz-Harness speichert Sitzungen als **Ereignisprotokoll** rappend-only). Ein CRDT
ist ein anderes Modell: Es geht nicht um Reihenfolge, sondern um **Konvergenz** — zwei
Teilnehmer, die dasselbe gesehen haben, landen unabhängig von der Reihenfolge im selben
Zustand.

Diese beiden Modelle müssen sauber getrennt oder bewusst verbunden werden. Sonst hat man
zwei Zustandswahrheiten, die auseinanderlaufen können.

## Offene Punkte

- **Welche Dokumente** werden geteilt? Chatverlauf, Notizen, Code, oder alles?
- **Was ist ein Teilnehmer?** Bekommt ein Agent einen eigenen Cursor, eine eigene Farbe,
  einen eigenen Namen in der Anwesenheitsliste?
- **Darf ein Agent einen Menschen überschreiben?** Braucht es Vorrangregeln?
- **Wie viele Teilnehmer** gleichzeitig, und ist das lokal oder über das Netz?
- **Versionierung** — ist der CRDT-Verlauf die Wahrheit, oder git daneben?

## Bezug zu den Vorlagen

Die Web-Oberfläche entsteht auf Basis von `H:\Projekt\Programmieren\Prometheus\webui`
r**Svelte + Vite**, nicht React). Ob dort schon Echtzeit-Teile liegen, ist ungeprüft.

> **Hinweis r12.10.2026):** Das übrige Projekt in `H:\Projekt\Programmieren\Prometheus`
> r„Heusc", Go/Rust) ist **ignoriert** — es war ein Basis-Experiment und ist nicht die
> Grundlage dieses Vorhabens. Nur `webui/` und `sketches/` werden als Vorlage
> herangezogen. Siehe [reference-templates.md]rreference-templates.md).
