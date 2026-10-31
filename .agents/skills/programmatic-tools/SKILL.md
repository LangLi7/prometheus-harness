---
name: programmatic-tools
description: "Entscheidet, wann ein Werkzeug-Programm (run_code/run_program) statt vieler Einzelaufrufe richtig ist: ab drei abhängigen Aufrufen, Schleifen über Sammlungen, Filterung, Probe-dann-Verarbeitung. Für Aufgaben, die mehrere Werkzeuge in einer Runde verbinden — nicht für einzelne Aufrufe und nicht für Rückfragen an den Nutzer."
---

# programmatic-tools

Die Regel, wann gebündelt wird. Sie ersetzt kein Werkzeug — sie entscheidet, welches der
beiden man nimmt.

## Die eine Frage

> Würde ich nach diesem Aufruf **noch einen** brauchen, dessen Argumente von der Antwort
> abhängen?

Wenn ja, ist es kein Einzelaufruf, sondern ein Programm. Alles andere ist Buchhaltung.

## Wann bündeln

| Lage | Warum |
|---|---|
| Drei oder mehr Aufrufe, deren Argumente voneinander abhängen | Jeder Zwischenschritt kostet eine Modell-Runde; im Programm ist er eine Zeile. |
| Schleife über eine Sammlung (`für jede Datei`, `für jeden Treffer`) | Der Rundlauf pro Element ist reine Verschwendung. |
| Erst fünf Elemente probieren, dann alle verarbeiten | Klassischer Fall: die Form der Antwort bestimmt den nächsten Schritt. |
| Filtern, sortieren, zählen, gruppieren, auf die Top 10 kürzen | Die Zwischendaten müssen nie in den Kontext. |
| Ein Fehler pro Element darf den Lauf nicht beenden | `try`/`catch` je Element statt Abbruch der ganzen Aufgabe. |

## Wann nicht bündeln

| Lage | Stattdessen |
|---|---|
| Ein Aufruf, dessen Ergebnis du ohnehin vollständig liest | direkt aufrufen |
| Du brauchst eine Entscheidung des Nutzers | `ask_user_question`, nicht im Programm |
| Du willst den Plan bestätigen lassen | `exit_plan_mode`, nicht im Programm |
| Die Datenform der Antwort ist unbekannt und du willst sie erst sehen | ein Probe-Aufruf, **dann** das Programm |
| Das Ergebnis ist ein Bild oder eine Datei, die der Nutzer sehen soll | direkt aufrufen; `present`/`render_ui` gehören nicht ins Programm |

## Wie ein Programm aussieht

Der Programmtext ist der Rumpf einer `async`-Funktion: `await` und `return` auf oberster
Ebene sind erlaubt. Zurückgegeben wird **das, was du wirklich brauchst** — nicht die
Rohantwort.

```ts
const files = await tools.glob({ pattern: 'packages/**/*.ts' })
const hits = await Promise.all(
  files.slice(0, 20).map(async (f) => {
    try {
      const r = await tools.grep({ pattern: 'defineTool', path: f })
      return { f, n: r.length }
    } catch (e) {
      return { f, error: String(e) }
    }
  }),
)
return hits.filter((h) => h.n > 0).sort((a, b) => b.n - a.n).slice(0, 10)
```

Drei Regeln, die den Unterschied machen:

1. **Klein zurückgeben.** Zehn Treffer mit Pfad und Zähler statt zwanzig vollständiger
   Dateien. Was du nicht zurückgibst, kostet keinen Kontext.
2. **Fehler je Element fangen.** Ein kaputter Pfad darf die anderen neunzehn nicht
   mitnehmen. `Promise.all` ohne `catch` ist ein Alles-oder-nichts.
3. **Nebenläufigkeit begrenzen.** Zehn gleichzeitige Aufrufe sind in Ordnung; tausend
   sind ein Selbstschuss. Bei großen Sammlungen in Blöcken arbeiten.

## Grenzen, die man kennen muss

- **Der Programmtext ist typgestrippt.** `enum` und Namespaces laufen nicht. Typannotationen
  sind Hinweise, keine Prüfung.
- **Kein Zustand zwischen Läufen.** Jeder Lauf beginnt leer. Was du behalten willst, gibst
  du zurück.
- **Fehler kommen als Feld, nicht als Ausnahme.** Ein gescheitertes Programm liefert
  `error.kind` (`exception`, `timeout`, `abort`, `worker-exit`, `invalid-output`,
  `output-limit`, `protocol`, `sandbox-unavailable`) plus Text — lesen, nicht raten.
- **Ein Programm ersetzt keine Prüfung.** Was ein einzelner Aufruf an Policy durchläuft,
  durchläuft auch der gebündelte — aber die *Reihenfolge* deiner Aufrufe ist deine
  Verantwortung, nicht die des Harness.

## Wenn es kein Programm-Werkzeug gibt

Dann ist der Agent im `native`-Preset: Er sieht jedes Werkzeug einzeln und hat kein
`run_code`. Der Skill kann das nicht umschalten — die Präsentation ist pro Agent fixiert,
und ein Wechsel pro Turn würde den Prompt-Cache brechen. Wer bündeln will, braucht das
Preset `ptc` oder ein eigenes Preset mit einem Composite-Werkzeug.

Das ist keine Einschränkung, die man wegoptimieren sollte: Ein Katalog, der sich mitten
im Gespräch ändert, kostet mehr, als das Bündeln spart.
