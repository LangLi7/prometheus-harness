---
kind: upgrade-guide
description: "Die Web-Komposition trägt die Schedule-Zeilen nicht mehr; das optionale Bundle Automation tasks fügt sie ein."
---

# Schedule wandert in das optionale Bundle Automation tasks

English | [中文](guide.zh.md)

## Änderung

In v0.1.7-rc.2 trug `@deepseek-ai/dsh-web-app` die Zeilen `time-context`, `schedule` und `ui-schedule` mit `disabled: true`. Das Einschalten von Schedule auf der Plugins-Seite oder von Hand schrieb id-adressierte Overrides wie `- id: schedule` mit `disabled: false` in `$DSH_HOME/profiles/<name>/cordis.patch.yml` oder in ein `--patch`-Overlay.

Das nächste Release entfernt die drei Zeilen aus der Web-Komposition. `@deepseek-ai/dsh-experimental-schedule-bundle`, in der Gruppe Official der Plugins-Seite als Automation tasks angezeigt, fügt sie ein. Jede Installation liefert das Bundle ausgeschaltet aus.

Profile, die Schedule per id aktiviert haben, verlieren es nach dem Upgrade: Der Loader warnt mit `patch: entry schedule not found` (und ebenso für `time-context` und `ui-schedule`), die `schedule_*`-Tools und die Seite Automation tasks verschwinden, und gespeicherte Erinnerungen werden nicht mehr zugestellt. Gespeicherte Aufgaben und Zustellprotokolle bleiben auf der Festplatte.

## Migration

1. Plugins öffnen, in der Gruppe Official Automation tasks finden und einschalten. Der Schalter hängt `@deepseek-ai/dsh-experimental-schedule-bundle` an `dsh.profile.bundles` in `$DSH_HOME/profiles/<name>/package.json` an; bei einem von Hand bearbeiteten Profil diesen Eintrag selbst hinzufügen.
2. Bestehende Overrides behalten, die andere Felder an `schedule`, `time-context` oder `ui-schedule` setzen, etwa `deliveryHistoryDays`; sie greifen wieder, sobald das Bundle die Zeilen einfügt. Overrides, die nur `disabled: false` setzen, sind redundant und können gelöscht werden.
3. Bestätigen: `dsh web` neu starten, prüfen, dass die Startlogs keine Warnung `patch: entry ... not found` für die drei ids ausgeben, und dass die Seitenleiste Automation tasks mit den zuvor gespeicherten Erinnerungen anzeigt.
