# PDF Export

Sitzung oder einzelne Antwort als gesetztes PDF — Typst statt Browser-Druck.

## Was es tut

Drei Einstiegspunkte, eine Route:

| Einstieg | Inhalt | Route |
|---|---|---|
| Sitzungsmenü, „PDF" | kompletter Chatverlauf der Sitzung | `GET /api/chat.pdf?session=…&mode=chat` |
| Sitzungsmenü, „PDF+Log" | Chatverlauf plus Protokoll-Anhang | `GET /api/chat.pdf?session=…&mode=chat&protocol=1` |
| Nachrichten-Zeile, „PDF" | diese Antwort mit ihrer Frage | `GET /api/chat.pdf?session=…&mode=message&message=…` |
| — | letzte Antwort | `GET /api/chat.pdf?session=…&mode=last` |

Der Host liest die Sitzung über `sessionPersistence`, faltet sie zu Blöcken, rendert Typst und kompiliert mit dem installierten `typst`. Der Browser lädt nur herunter; er rendert nichts.

## Das Dokument

Deckblatt (Titel, Arbeitsbereich, Datum), **Inhaltsverzeichnis** mit Seitenzahlen (aus den Überschriften, verschachtelt), Sprecherblöcke „DU" und „PROMETHEUS", Karten aus `render_ui` (Kennzahlen, Tabellen, Balken), Codeblöcke, Seitenzahlen, Exportdatum im Kolophon.

Mit `protocol=1` kommt ein **Protokoll** als Anhang dazu: je Turn Dauer, Werkzeuge mit Aufrufzahl, neue Tokens (Eingabe + Ausgabe, ohne Cache-Wiederholungen) und Fehler. Layout steht in [`src/typst.ts`](src/typst.ts) — eine Vorlage, keine Optionsliste.

## Was nicht in den Verlauf gehört

Der Log enthält mehr als das Gespräch: Workspace-Instruktionen, Runtime-Snapshots, Skill-Katalog, Compaction-Zusammenfassungen. [`src/model.ts`](src/model.ts) nimmt nur Nachrichten mit `source.kind === 'user'`, Assistententext ohne Reasoning und gültige `render_ui`-Karten. Eine ungültige Karte wird übersprungen, nicht als JSON gedruckt.

## Gestaltung

Ein Sprecher-Strang statt Kartenstapel: beide Seiten tragen links eine Linie, grau für „DU", blau für „PROMETHEUS". Eine eingefügte, mehrseitige Nachricht wird dadurch nicht zu einer grauen Fläche, und Tabellen und Karten bleiben die lautesten Elemente.

Code steht auf einer eigenen Fläche (`luma(242)`), die Sprache erscheint als Etikett. Überschriften werden so verschoben, dass die erste im Dokument Ebene 1 hat — PDF/UA verlangt das, und der PDF-Gliederungspunkt (Lesezeichen) entsteht daraus. Der Export ist als **PDF/UA-1** getaggt (`--pdf-standard ua-1`): Sprache, Titel, Strukturbaum und Lesezeichen sind enthalten, nicht nur Pixelseiten.

## Grenzen der ersten Fassung

* Mathematik: LaTeX → Typst für den Alltag (Brüche, Wurzeln, griechische Buchstaben, Operatoren). Was der Übersetzer nicht kennt, erscheint als Code statt als kaputtes Typst.
* Diagramme: Balkendiagramme zeichnen Balken, Liniendiagramme stehen als Wertetabelle.
* Bilder erscheinen als Link, nicht als Bild.
* Protokoll (Werkzeuge, Dauern, Tokens) ist noch nicht im Dokument.
* Kein gedrucktes Inhaltsverzeichnis; die Navigation läuft über die PDF-Lesezeichen.

## Aktivierung

Profil-Eintrag und Patch sind gesetzt. Nach einem Host-Neustart und einem Reload der Seite erscheinen beide Knöpfe; die Route ist dann unter `/api/chat.pdf` erreichbar.

Typst wird gesucht über `PMH_TYPST`, dann `typst` im `PATH`, dann das WinGet-Paketverzeichnis. Fehlt es beim ersten Export, installiert das Plugin es plattformgerecht: Windows `winget install --id Typst.Typst`, macOS `brew install typst`, Linux `cargo install typst-cli`. Abschalten mit `config.install: never`; scheitert die Installation, antwortet die Route mit 503 und der Ausgabe des Paketmanagers.

## Prüfen

```powershell
cd packages/plugin/pdf-export
bun test          # 15 Tests: Mathe, Markdown, Faltung, Query, Protokoll, Installationsplan
bun run typecheck
bun run build.mjs # Bündel + Registrierungsprüfung
bun src/cli.ts <session.v4.jsonl.zstd> .pmh-build/pdf-export
```
