---
description: Prüft MiroFish-Voraussetzungen, .env-Schlüssel und die Dienste auf 3000/5001 und nennt jeden Blocker.
argument-hint: "[--dir <MiroFish-Pfad>]"
---

# MiroFish prüfen

Das Skript liegt im installierten Plugin:

- Windows: `%DSH_HOME%\plugins\mirofish\mirofish\scripts\mirofish.mjs`
- sonst: `$DSH_HOME/plugins/mirofish/mirofish/scripts/mirofish.mjs`

Führe aus:

```bash
bun "$DSH_HOME/plugins/mirofish/mirofish/scripts/mirofish.mjs" check --dir <MiroFish-Pfad>
```

Ohne `--dir` sucht es `MiroFish`, `../MiroFish` und `C:\Users\Chang\MiroFish`.

Berichte **wörtlich**, was blockiert (Python-Version, Node, `.env`, fehlende
Schlüssel, nicht erreichbare Dienste). Erfinde keine grünen Häkchen. Ist
`ZEP_API_KEY` nicht gesetzt, ist das ein Blocker — Zep Cloud ist Pflicht, kein
optionaler Beschleuniger.
