# motioncore — Bewegung als kleine, prüfbare Sprache

Ein Claude-kompatibles Plugin für Prometheus Harness. Es hält die Motion-Schicht
einer Website klein: drei Dauern, drei Kurven, eine Staffelung — plus ein Audit,
das Abweichungen findet.

**Kein MCP.** Bewegung ist lokale Rechnung und Design-Urteil, kein Dienst. Ein
MCP-Server hätte keine Gegenstelle.

## Installation

```bash
bun apps/cli/src/main.ts plugin marketplace add ./integrations/motioncore
bun apps/cli/src/main.ts plugin install motioncore@motioncore
```

Danach: Skill `motioncore` und die Commands `motioncore-tokens`,
`motioncore-audit`, `motioncore-review`.

## Benutzung

```bash
# Tokens für ein Projekt
bun "$DSH_HOME/plugins/motioncore/motioncore/scripts/motioncore.mjs" tokens --preset editorial --out tokens.css

# Vorhandene Bewegung prüfen (Exit 1 bei Fehlern)
bun "$DSH_HOME/plugins/motioncore/motioncore/scripts/motioncore.mjs" audit ./mein-projekt

# Audit plus Checkliste
bun "$DSH_HOME/plugins/motioncore/motioncore/scripts/motioncore.mjs" review ./mein-projekt
```

Presets: `calm` (120/180/320), `editorial` (150/240/480), `kinetic` (180/300/600).

## Was das Audit findet

- `transition: all` — Fehler.
- Fehlendes `prefers-reduced-motion` bei vorhandenen Animationen — Fehler.
- Dauer über 600 ms, unter 80 ms, `linear`, mehr als sieben verschiedene Dauern,
  keine eigene Kurve — Warnungen.
- Keine Animation — Info (statisch oder JS-getrieben).

## Grenzen

- Liest statisches CSS/HTML/JSX/Vue/Svelte, keine Laufzeit.
- JS-Animationen (GSAP, Framer Motion) erscheinen höchstens als Info.
- Beurteilt Konsistenz und Zugänglichkeit, keine Ästhetik.

## Lizenz

MIT.
