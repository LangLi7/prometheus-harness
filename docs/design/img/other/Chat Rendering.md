OpenAI ChatGPT zeigt solche Antworten nicht einfach als normalen Text an, sondern rendert sie in einer Chat-Oberfläche, die Markdown, strukturierte Inhalte und spezielle UI-Komponenten darstellen kann.

Das kannst du für dein eigenes Agenten-Harness sehr ähnlich umsetzen. Du brauchst dafür nicht einmal ein eigenes KI-Modell oder eine besonders leistungsfähige GPU. Entscheidend ist, wie dein Backend die Antwort liefert und wie dein Frontend sie rendert.

## 1. Was ChatGPT bei deiner gezeigten Antwort macht

Dein Screenshot enthält mehrere unterschiedliche Darstellungselemente:

Markdown-Rendering

Überschriften, Fettdruck, Aufzählungen, Trennlinien und Tabellen werden formatiert statt als rohe Zeichen angezeigt.

Strukturierte UI-Komponenten

Die grauen Flächen mit den Zahlen „2.000“ und „5.000“ sind beispielsweise keine gewöhnlichen Markdown-Überschriften. Sie lassen sich als eigene Karten oder Dashboard-Komponenten bauen.

Streaming

Die Antwort kann während der Generierung schrittweise erscheinen, anstatt erst nach Abschluss vollständig angezeigt zu werden.

Eigenes Designsystem

Schriftgrößen, Abstände, dunkler Hintergrund, Tabellen, Karten und responsive Layouts sorgen dafür, dass alles wie eine zusammenhängende Chat-Oberfläche aussieht.

Der wichtige Punkt ist: Das Modell erzeugt den Inhalt, aber die Benutzeroberfläche entscheidet, wie dieser Inhalt aussieht.

## 2. Drei Möglichkeiten, das selbst zu bauen

## Variante A: Markdown-Chat

Bester Einstieg

Das Modell liefert Text mit Markdown. Dein Frontend rendert daraus Überschriften, Tabellen, Listen und Codeblöcke.

Technologien: React oder Next.js, `react-markdown`, `remark-gfm`.

Einfach umzusetzen und ideal für einen Chat, der wie ChatGPT aussehen soll.

## Variante B: Chat mit eigenen UI-Komponenten

Für dein Harness

Das Modell liefert zusätzlich strukturierte Daten, aus denen dein Frontend automatisch Karten, Diagramme, Statusanzeigen und Tabellen baut.

Technologien: React, TypeScript, Tailwind CSS und JSON-Schemas.

Damit kannst du die Zahlenkarten aus deinem Screenshot sauber nachbilden.

## Variante C: Generative UI

Die KI entscheidet anhand eines festgelegten Komponenten-Katalogs, welche UI-Elemente zu einer Antwort passen. Das Frontend rendert diese Komponenten anhand einer kontrollierten Spezifikation.

Beispiel: Die KI erkennt eine Kapazitätsberechnung und gibt eine Statistik-Karte, eine Tabelle und eine kurze Erklärung zurück.

OpenAI bietet mit [Structured Outputs](<https://developers.openai.com/api/docs/guides/structured-outputs>) eine Möglichkeit, Modellantworten an ein definiertes JSON-Schema zu binden. Außerdem gibt es ein offizielles Beispielprojekt für [Generative UI auf GitHub](<https://github.com/openai/openai-structured-outputs-samples>). OpenAI API

+1

## 3. So könnte dein Chat technisch aufgebaut sein

Chat-Frontend

React · Markdown · UI-Komponenten

Backend / API-Gateway

Authentifizierung · Streaming · Sitzungen

Agenten-Orchestrierung

Scheduler · Queues · Worker · Tool-Aufrufe

Modell-Provider

OpenAI API oder andere Modelle

Für die flüssige Anzeige nutzt du am besten Streaming: Das Backend sendet Textstücke oder strukturierte Ereignisse, während das Modell noch antwortet. Die OpenAI Responses API unterstützt das über Server-Sent Events. OpenAI API

+1

Wichtig: Du solltest nicht für jeden Subagenten eine eigene Chat-Oberfläche bauen. Die Agenten können im Backend arbeiten; dein Frontend zeigt die fertige Antwort und bei Bedarf den Fortschritt einzelner Agenten an.

## 4. Wie du den Stil aus deinem Screenshot nachbaust

Ich würde mit React und TypeScript anfangen und folgende Komponenten erstellen:

- `MessageRenderer` – rendert Markdown und normalen Antworttext.
- `StatCard` – zeigt Kennzahlen wie 2.000 und 5.000.
- `DataTable` – rendert strukturierte Tabellen.
- `AgentStatus` – zeigt laufende, wartende oder abgeschlossene Agenten.
- `StreamingMessage` – aktualisiert die Antwort während der Generierung.

Damit kannst du später auch interaktive Agenten-Dashboards integrieren, ohne deine gesamte Chat-Oberfläche neu schreiben zu müssen.

Eine entscheidende Frage: Verwendest du für dein eigenes Harness bereits ein Frontend?

1. Was verwendest du für die Oberfläche?

react React / Next.js

Python, z. B. Streamlit oder Gradio

Desktop-App, z. B. Electron

Noch kein Frontend, bisher nur Backend

2. Womit läuft dein Backend?

python Python

Node.js / TypeScript

Etwas anderes

 Passende Architektur zeigen