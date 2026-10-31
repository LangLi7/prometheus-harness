---
title: "Plugin-Hooks — Claude-Hooks im Prometheus-Host"
stand: 2026-10-27
tags:
  - pmh/subsystem
  - pmh/skills
---

# Plugin-Hooks — Claude-Hooks im Prometheus-Host

## Kurzfassung

Ein Claude-Plugin kann `hooks/hooks.json` mitbringen. Bisher wurde die Datei
kopiert und **nicht** ausgeführt. Jetzt hängt sich `@prometheus-harness/plugin-hooks`
an die Werkzeug-Pipeline des Kerns und führt `PreToolUse` und `PostToolUse` aus —
aber **nur für ausdrücklich freigegebene Plugins**.

```bash
pmh plugin hooks enable hookify@claude-code-plugins   # wirksam nach Neustart
pmh plugin hooks list
pmh plugin hooks disable hookify@claude-code-plugins
```

Ohne Freigabe passiert nichts. Die Freigaben stehen in
`<home>/hooks-enabled.json`; fehlt die Datei, ist nichts freigegeben.

## Wo der Haken sitzt

Der Werkzeug-Registry des Kerns hat eine Wasserfall-Pipeline:

| Ereignis | Bedeutung |
|---|---|
| `tools/pre-execute` | darf erlauben, ablehnen (`deny`), abbrechen oder fragen |
| `tools/post-execute` | darf das Ergebnis ersetzen oder blockieren |

Genau dort werden `PreToolUse` und `PostToolUse` eingehängt. Ein `deny` aus einem
Hook wird zu `{ kind: 'deny', reason }`; die Begründung erscheint beim Modell.

## Dateiformat

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT/check.mjs\"", "timeout": 10000 }]
      }
    ],
    "PostToolUse": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "echo done" }] }
    ]
  }
}
```

Der Aufruf geht als JSON auf **stdin**:

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "git push" },
  "cwd": "C:\\Users\\Chang\\prometheus-harness"
}
```

## Entscheidungen lesen

| Ausgabe | Wirkung |
|---|---|
| Exit 0, keine Ausgabe | erlauben |
| Exit 2 | blockieren; `stderr` ist die Begründung |
| `{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"…"}}` | blockieren |
| `{"decision":"block","reason":"…"}` | blockieren |
| Startfehler, Absturz, Timeout | **erlauben** (nicht-blockierender Fehler), Warnung im Log |

Ein Timeout blockiert — anders als ein Absturz: ein hängender Hook darf den Host
nicht ewig aufhalten. Vorgabe 10 s, höchstens 120 s.

## Matcher

- `""` oder `"*"` trifft jedes Werkzeug.
- `Bash|Write` sind Alternativen.
- Ein Ausdruck mit Regex-Zeichen wird als `^(?:…)$` versucht; scheitert er, gilt
  Wortgleichheit.

## Umgebung

Der Hook bekommt **nicht** die Umgebung des Hosts. `DATABASE_URL`,
`PMH_MASTER_KEY` und Anbieterschlüssel bleiben draußen; sonst könnte fremder Code
`user_secrets` entschlüsseln. Er sieht eine Whitelist (Pfade, `TEMP`, Proxy) plus:

- `CLAUDE_PLUGIN_ROOT`
- `CLAUDE_PROJECT_DIR`
- `CLAUDE_TOOL_NAME`

## Was nicht unterstützt wird

- **`prompt`-Hooks** — sie bräuchten ein Modell im Hook.
- **`Stop`, `SessionStart`, `SessionEnd`, `PreCompact`** — der Host hat andere
  Lebenszyklen; diese Ereignisse haben keinen Haken.
- **Argumente ändern.** `PreToolDecision` kennt kein Umschreiben der Eingabe; ein
  Hook kann nur erlauben oder ablehnen.

## Risiko

Ein Hook ist fremder Code mit den Rechten des Hosts, bei **jedem** Werkzeugaufruf.
Deshalb: Freigabe pro Plugin, keine Vorgabe, klare Warnung beim Aktivieren. Wer
ein Plugin nicht traut, gibt es nicht frei — auch nicht „nur kurz“.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `src/hooks.ts` | Dateien lesen, Matcher, Befehle ausführen, Entscheidungen lesen |
| `src/index.ts` | Cordis-Plugin, hängt an `tools/pre-execute` und `tools/post-execute` |
| `tests/hooks.test.ts` | 9 Prüfungen inkl. echter Kindprozesse und Umgebungsfilter |

Eingetragen in beiden Profilen als `pmh-plugin-hooks`; Abhängigkeit in
`apps/cli/package.json`.

## Prüfen

```bash
bun test packages/plugin/plugin-hooks
bunx tsgo --noEmit -p packages/plugin/plugin-hooks/tsconfig.json
```
