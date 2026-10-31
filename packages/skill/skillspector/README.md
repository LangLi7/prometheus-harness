# @prometheus-harness/skillspector

Statischer Sicherheits-Scanner für Agenten-Skills, Plugins und MCP-Manifeste —
die Prometheus-Fassung von [NVIDIA SkillSpector](https://github.com/NVIDIA/SkillSpector).

**Was er tut.** Er liest Text und liefert einen Bericht: Regeln, Belege,
Severity, Score, Empfehlung. **Was er nicht tut.** Er führt nichts aus, ruft kein
LLM und kein Netz.

```ts
import { scanDirectory, gate, formatReport } from '@prometheus-harness/skillspector'

const report = await scanDirectory('./mein-skill')
console.log(formatReport(report, 'terminal'))
if (!gate(report, 'balanced').allowed) process.exit(1)
```

## Merkmale

- **37 Regeln** in 16 Familien: Prompt-Injection, Datenabfluss, Rechteausweitung,
  Lieferkette, gefährlicher Code, übermäßige Handlungsmacht, Speichervergiftung,
  MCP-Missbrauch u. a.
- **Risikomodell wie das Vorbild**: `CRITICAL 50`, `HIGH 25`, `MEDIUM 10`, `LOW 5`,
  ×1,3 bei ausführbaren Bestandteilen, Bänder 0–20/21–50/51–80/81–100.
- **Zwei Politiken**: `strict` (HIGH blockt) und `balanced` (Absicht blockt,
  Fähigkeit warnt).
- **Baseline**: akzeptierte Befunde per Fingerabdruck unterdrücken; unterdrückte
  Befunde zählen nicht in den Score.
- **Vier Ausgabeformate**: Terminal, JSON, Markdown, SARIF 2.1.0.
- **Abdeckung ist Teil des Berichts**: eine übersprungene Datei macht den Bericht
  „unvollständig“ und verbietet `SAFE`.

## Grenzen

Kein Ersatz für Semantik: Regex erkennt Muster, keine Absicht. Nicht-deutsche
Inhalte, Bilder und Binärdateien werden schlechter bzw. nicht geprüft.

Die vollständige Beschreibung steht in
[`docs/subsystems/skillspector.md`](../../../docs/subsystems/skillspector.md).

## Prüfen

```bash
bun test packages/skill/skillspector
bunx tsgo --noEmit -p packages/skill/skillspector/tsconfig.json
```
