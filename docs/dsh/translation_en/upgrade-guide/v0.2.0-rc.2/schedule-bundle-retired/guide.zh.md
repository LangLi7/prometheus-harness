---
kind: upgrade-guide
description: "The “Scheduled tasks” optional bundle is removed; the Web composition mounts Schedule itself."
---

# The “Scheduled tasks” bundle is removed

[English](guide.md) | 中文

## Change

In v0.2.0-rc.2, enabling “Scheduled tasks” on the plugin management page appends `@deepseek-ai/dsh-experimental-schedule-bundle` to `dsh.profile.bundles` in `$DSH_HOME/profiles/<name>/package.json`. That bundle inserts the three rows `time-context`, `schedule`, and `ui-schedule`.

The next release removes that bundle. `@deepseek-ai/dsh-web-app` mounts `schedule` and `ui-schedule` in every Web profile, the `standard`, `cordis`, and `ptc` presets declare the clock reading and the four `schedule_*` tools, and `minimal` declares neither ([details](../../../subsystems/schedule.zh.md)).

Loading a profile deletes `@deepseek-ai/dsh-experimental-schedule-bundle` from its `dsh.profile.bundles` and rewrites `package.json`; the other manifest fields are unchanged. Stored tasks and delivery records remain on disk and keep working.

## Migration

1. Start `dsh` once with each affected profile; no manual edit is needed. A profile directory written by other tools needs the entry removed from `dsh.profile.bundles` by hand.
2. Keep overrides for `schedule` and `ui-schedule` in `cordis.patch.yml` or a `--patch` overlay; the Web composition contains those two rows. A top-level override for `time-context` no longer matches any row, because the clock row belongs to a preset ([time-context](../../../../packages/context/time-context/README.zh.md)); delete it.
3. Confirm that `dsh.profile.bundles` no longer lists the bundle, that the plugin management page no longer shows an anomalous “Scheduled tasks” entry, and that the sidebar displays “Scheduled tasks” and lists previously stored reminders.
