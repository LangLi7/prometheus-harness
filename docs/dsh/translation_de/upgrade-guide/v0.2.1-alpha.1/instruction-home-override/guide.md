---
kind: upgrade-guide
description: "Die Zeile `agent-instructions` akzeptiert `dshHome` nicht mehr; das Laden von Instruktionen löst das Harness-Home immer aus `$DSH_HOME` oder `~/.dsh` auf."
---

# Das Laden von Instruktionen löst ein einziges Harness-Home auf

English | [中文](guide.zh.md)

## Änderung

`@deepseek-ai/dsh-agent-instructions` hat sein Config-Feld `dshHome` entfernt. Das Plugin löst das Harness-Home über `resolveDshHome()` aus `@deepseek-ai/dsh-home-paths` auf, wie jeder andere Harness-Konsument: Das Home ist `$DSH_HOME`, wenn es gesetzt und nicht leer ist, andernfalls `~/.dsh`, mit Tilde-Expansion.

Ein `cordis.yml`, ein Profil-Patch oder ein `--patch`-Overlay, das weiterhin `dshHome` an der Zeile `agent-instructions` setzt, hat keine Wirkung: Die Zeile behält den überzähligen Schlüssel, und das Plugin ignoriert ihn, sodass das Laden von Instruktionen dem Prozess-Home folgt. Andere Provider wie `dsh-skill-filesystem` und `dsh-shell-env` behalten ihre eigenen Home-Felder; diese Entfernung betrifft nur den Instruktions-Loader.

## Migration

1. `dshHome` aus der Zeile `agent-instructions` in `cordis.yml`, `$DSH_HOME/cordis.patch.yml`, `$DSH_HOME/profiles/<profile>/cordis.patch.yml` und jedem `--patch`-Overlay löschen.
2. Wo der Override auf ein Nicht-Standard-Home zeigte, stattdessen `DSH_HOME` für den Prozess exportieren, damit jeder Harness-Konsument dieses Home liest.
3. Mit `dsh --profile <profile> --dump-config` bestätigen, dass die Zeile `agent-instructions` nur ihre verbleibenden Felder listet, und dass die erste Anfrage einer neuen Session `Instructions from: $DSH_HOME/AGENTS.md` (oder `~/.dsh/AGENTS.md`) zeigt, wenn diese Datei existiert.
