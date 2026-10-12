---
kind: upgrade-guide
description: "Das optionale Bundle Automation tasks wird entfernt; die Web-Komposition mountet Schedule selbst."
---

# Bundle Automation tasks entfernt

English | [中文](guide.zh.md)

## Änderung

In v0.2.0-rc.2 hängte das Einschalten von Automation tasks auf der Plugins-Seite `@deepseek-ai/dsh-experimental-schedule-bundle` an `dsh.profile.bundles` in `$DSH_HOME/profiles/<name>/package.json` an. Dieses Bundle fügte die Zeilen `time-context`, `schedule` und `ui-schedule` ein.

Das nächste Release entfernt das Bundle. `@deepseek-ai/dsh-web-app` mountet `schedule` und `ui-schedule` in jedem Web-Profil, und die Presets `standard`, `cordis` und `ptc` deklarieren das Uhrzeit-Lesen und die vier `schedule_*`-Tools; `minimal` deklariert beides nicht ([Details](../../../subsystems/schedule.md)).

Das Laden eines Profils entfernt `@deepseek-ai/dsh-experimental-schedule-bundle` aus dessen `dsh.profile.bundles` und schreibt `package.json` neu; andere Manifestfelder bleiben erhalten. Gespeicherte Aufgaben und Zustellprotokolle bleiben auf der Festplatte und werden weiterhin verwendet.

## Migration

1. `dsh` einmal mit jedem betroffenen Profil starten; keine manuelle Bearbeitung ist nötig. Ein Profilverzeichnis, das ein anderes Tool schreibt, muss den Eintrag selbst aus `dsh.profile.bundles` entfernen.
2. Overrides auf `schedule` und `ui-schedule` in `cordis.patch.yml` oder einem `--patch`-Overlay behalten; die Web-Komposition trägt diese Zeilen. Ein Override auf oberster Ebene auf `time-context` passt nicht mehr zu einer Zeile, weil die Uhrzeit-Zeile zu den Presets gehört ([time-context](../../../../packages/context/time-context/README.md)); ihn löschen.
3. Bestätigen: `dsh.profile.bundles` listet das Bundle nicht mehr, die Plugins-Seite zeigt keinen fehlgeschlagenen Eintrag Automation tasks, und die Seitenleiste zeigt Automation tasks mit den zuvor gespeicherten Erinnerungen.
