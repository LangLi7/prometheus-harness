---
kind: upgrade-guide
description: "Arbeitsverzeichnisse von Sessions ersetzen die eingebaute cwd-Konfiguration, und Tool-Präsentationsmetadaten laufen auch für verschachtelte PTC-Aufrufe."
---

# Arbeitsverzeichnis-Konfiguration und Tool-Präsentation migrieren

English | [中文](guide.zh.md)

## Änderung

Das nächste Release entfernt die eingebaute Prompt-Variable `{{cwd}}` des Loop und den Konfigurationsschlüssel `cwd` aus `@deepseek-ai/dsh-subagent-acp` und `@deepseek-ai/dsh-subagent-dsh-sdk`. Eigene Prompt-Vorlagen, die ein unaufgelöstes `{{cwd}}` behalten, schlagen vor einer Modellanfrage fehl. Das aktuelle Ausführungsverzeichnis einer Session wird als erforderlicher Nutzerkontext bereitgestellt und getrennt von ihrem ursprünglichen `Session.header.cwd` persistiert.

Neue Subagents verwenden das `cwd` ihrer Startanfrage, wenn es angegeben ist, andernfalls erfassen sie das aktuelle Verzeichnis des Parents. Bestehende Prozesse behalten ihre eigenen Verzeichnisse. Das Ändern des Ausführungsverzeichnisses ändert nicht das ursprüngliche Projekt und gewährt keine zusätzlichen Schreibberechtigungen.

`output.presentationMeta` eines Tools läuft auch für erfolgreiche verschachtelte PTC-Aufrufe. Autoren, deren Projektion nur native Aufrufe auf oberster Ebene annimmt, sind betroffen. Ein Projektionsfehler lässt diesen verschachtelten Aufruf mit `ToolOutputError` fehlschlagen; kanonische Programmwerte und Modellinhalt bleiben unverändert.

## Migration

1. In `personaSuffix`-Konfigurationen von Home, Profil oder Aufruf sowie in `suffix`-Feldern von Presets die Verzeichnisklausel entfernen, die `{{cwd}}` referenziert, und unrelated Text behalten. Ein Suffix, das leer wird, weglassen oder leeren. Der [Service für das Arbeitsverzeichnis](../../../../packages/session/working-directory/README.md) stellt den Verzeichniskontext bereit.
2. `config.cwd` aus den Provider-Zeilen der ACP- und DSH-SDK-Subagents in den Profil-Patches entfernen. Um ein Verzeichnis für ein einzelnes Kind auszuwählen, `cwd` in dessen [Startanfrage](../../../subsystems/subagent.md) übergeben. Um das Ausführungsverzeichnis des Parents zu ändern, vor dem Start des Kindes `working_directory({ cd: "/absolute/project" })` verwenden.
3. `working_directory({})` in der betroffenen Session ausführen und das gemeldete Verzeichnis bestätigen. Ein Kind ohne Override starten und sein Ausführungsverzeichnis prüfen; ein explizites Start-`cwd` verwenden, wenn das Kind einen anderen Checkout nutzen muss. `Session.header.cwd` nur für die Identität des ursprünglichen Projekts oder Berechtigungswurzeln lesen, nicht für Operationen im aktuellen Verzeichnis.
4. Eigene `output.presentationMeta`-Projektionen rein halten und JSON-sichere Metadaten aus ihren Argumenten und dem kanonischen Ergebnis zurückgeben. Sowohl einen nativen Aufruf als auch einen verschachtelten PTC-Aufruf durchspielen und bestätigen, dass die aufgezeichneten Metadaten das tatsächliche Ziel der Operation kennzeichnen, ohne deren Ergebnis zu ändern.

Dynamische Kontext-Provider werden bei der Anfrageannahme erneut ausgewertet, nach Pre-Step-Listenern und Routenvorbereitung. Den aktuellen Zustand zurückgeben, ohne sich auf eine Auswertung pro Schritt zu verlassen. Registrierten Kontext innerhalb seines Providers transformieren; die Aktualisierung bei der Annahme ersetzt seinen zwischengespeicherten Text und bewahrt dabei Assembly-only-Kontextbeiträge sowie den akzeptierten System-Prompt, die Tool-Schemas und die Variablen.
