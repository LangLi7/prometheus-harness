---
kind: upgrade-guide
description: "Der Legacy-Wert ui-chat.transcriptView normal und ein nicht gesetzter Wert in Nicht-Desktop-Web zeigen jetzt Detailed statt Standard an."
---

# Legacy-`normal` für Work details wird als Detailed angezeigt

English | [中文](guide.zh.md)

## Änderung

Die Host-Einstellung `ui-chat.transcriptView` wählt Settings → General → Work details. In v0.1.7-rc.2 zeigte der Client den gespeicherten Legacy-Wert `normal` als `standard` an, und jeder Client verwendete `standard`, wenn die Einstellung fehlte, `null` oder ungültig war.

Ab dem nächsten Release:

- Ein gespeichertes `normal` wird auf Desktop und Web als `detailed` angezeigt. Der auf der Festplatte gespeicherte Wert wird nicht umgeschrieben.
- Ein fehlender, `null`- oder ungültiger Wert wird in Nicht-Desktop-Web (der npm-Installation `dsh web`) als `detailed` angezeigt. Desktop verwendet weiterhin `standard`.
- Gespeicherte Werte `compact`, `standard`, `detailed` und `verbose` bleiben unverändert.

Nutzer, die sich auf die alte Darstellung verlassen haben, sehen laufende Turns mit ausgeklappten Prozessgruppen-Rümpfen statt eingeklappten Zusammenfassungen.

## Migration

1. Um die bisherige Darstellung beizubehalten, Settings → General → Work details öffnen und Standard wählen. Der Client speichert `standard` in `ui-chat.transcriptView`, was jede spätere Änderung an Vorgabewerten unberührt lässt.
2. Bestätigen: einen Turn starten, der Tools aufruft, und prüfen, dass seine Prozessgruppe eine eingeklappte Zusammenfassung mit Live-Aufgabendetail zeigt.
