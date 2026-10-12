# Referenz: Was wir am DeepSeek Harness gemessen haben

> Liegt unter `docs/reference/`. Vollständiger Überblick: [Katalog](../INDEX.md).

Alle Zahlen gemessen am **12.10.2026**, Core `d743267388` = `dsh-v0.2.1-alpha.2`
(09.10.2026). Wegwerf-Klon, Build-Caches vor jedem Lauf gelöscht.

## Build und Laufzeit

| Messung | Ergebnis |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0 (~27 s) |
| `pnpm run build` (offizieller Befehl) | **exit 0**, 212,9 s, 357 Client-Artefakte |
| `tsc -b tsconfig.host.json` (TS 6.0.3) | exit 0, **124,5 s**, 0 Meldungen |
| Boot (`bin.ts web --port …`) | läuft, `HTTP 200`, Web-Oberfläche wird ausgeliefert |

**Wichtig:** Der Harness baut über `tsx scripts/build.ts`. Zerlegte Einzelaufrufe
(`tsc -b tsconfig.client.json` ohne vorherigen Host-Build) scheitern mit Hunderten
Folgefehlern — das ist ein Bedienfehler, kein Codefehler.

## TypeScript 7

| Compiler | Host-Build | Dauer |
|---|---|---|
| 6.0.3 (aktuell im Harness) | exit 0 | 124,5 s |
| 7.0.2 (`latest`) | 1430 Fehler | **17,2 s** |
| 7.1.0-dev (`next`) | 1430 Fehler (identisch) | **12,7 s** |

**Der Harness-Code kompiliert mit TS 7 fehlerfrei** — rund 10× schneller. Kein einziger
Fehler in `packages/` oder `apps/` betrifft Laufzeitcode.

### Die 1430 Fehler sind ausnahmslos Werkzeuge

Verteilung: **1411 in `scripts/`**, 19 in `packages/`+`apps/` — und die 19 liegen wieder in
Build-/Dev-Werkzeugen (`inspector/scripts/devtools/`, `cli/tests/profiles/`). Jede
betroffene Datei beginnt mit `import ts from 'typescript'`.

| Datei | Fehler |
|---|---|
| `scripts/persistence-schema.ts` | 149 |
| `scripts/gen-config-catalog.ts` | 146 |
| `scripts/verify-export-jsdoc.ts` | 139 |
| `scripts/gen-doc-graphs.ts` | 91 |
| `scripts/cordis-core-api.ts` | 91 |
| `scripts/verify-type-equiv.ts` | 65 |
| … 12 weitere | |

Fehlercodes: TS2339 (898×), TS2694 (370×), TS7006 (148×), Rest TS2305/18046/18048/2322/7019.

### Ursache: anderes Programmiermodell, nicht nur andere Pfade

```
klassisch:  ts.createSourceFile(datei, inhalt, …)   ← flache Funktionssammlung (~2000 Exporte)
TS 7:       API → Project → Program → Snapshot      ← objektorientiert
```

| Neue API | Exporte | benötigte Funktionen |
|---|---|---|
| `typescript/sync` | 63 | 0 |
| `typescript/async` | 61 | 0 |
| `typescript/ast` | 430 | AST-Prädikate (`isIdentifier`, `isStringLiteral`, …) |
| `typescript/ast/is` | 349 | dieselben |

**Fehlen:** `createSourceFile`, `forEachChild`, `parseJsonConfigFileContent`,
`readConfigFile`, `transpileModule`, `sys`, `createProgram`, `getPreEmitDiagnostics`,
`resolveProjectReferencePath`. `forEachChild` entspricht in der neuen API `getChildren`
bzw. `visitEachChild`.

Die Werkzeuge nutzen **132 verschiedene API-Funktionen**, Spitzenreiter: `isIdentifier`
(70×), `createSourceFile` (41×), `isStringLiteral` (38×).

### Korrektur zur Versionslegende

**TypeScript 6.0 warnt nicht.** Mit fünf absichtlich veralteten Optionen
(`importsNotUsedAsValues`, `preserveValueImports`, `noImplicitUseStrict`, `keyofStringsOnly`,
`suppressExcessPropertyErrors`) lief 6.0.3 mit **exit 0 und null Meldungen** durch;
`--showConfig` listet sie als angenommen, `tsc --help` kennt kein „deprecated".
Die Ablehnung kommt erst von 7: `error TS5023: Unknown compiler option`.

Wer wissen will, was 7 bricht, prüft gegen 7 — nicht gegen 6.

### Keine entfernte tsconfig-Option im Einsatz

Geprüft über alle **414** `tsconfig*.json` des Repos: keine Treffer für die in TS 7
entfernten Optionen. Der Harness ist in dieser Hinsicht TS-7-vorbereitet.

### Blocker für eine TS-7-Umstellung

`pnpm-workspace.yaml` → `peerDependencyRules.allowedVersions.typescript: '>=5 <7'`.
pnpm würde TS 7 im Workspace blocken. Muss auf `<8` gehoben werden — **aber erst, wenn die
Werkzeuge portiert sind**, sonst bricht `pnpm run build`.

## Was der Harness schon kann (nicht doppelt bauen)

| Fähigkeit | Paket |
|---|---|
| Datei-Karte im Composer | `client/ui-attachment` → `FileCard.tsx` |
| Datei-Upload | `client/file-upload` |
| Office → PDF | `document/office-to-pdf` |
| Dokument-Vorschau | `client/ui-sidebar-documentpreview` |
| Office-Skill | `skill/skill-office` |
| Agent-Teams (Roster, Postfächer, Task-Board) | `experimental/agent-team` + `-profile` + `tool-` + `client-ui-` |
| Multi-Modell-Router | **nicht vorhanden** — eigene Entwicklung |
| Git-Panel | **nicht vorhanden** — eigene Entwicklung |

## Native Sprachgrenze im Harness

Der einzige Nicht-JS-Code ist winzig:

```
native/system/packages/entry/src/main.c    ← C, Dateisperre (flock)
python/sdk/                                 ← Python, aber nur ein Client-SDK
```

Kein Rust, kein Go. **Das ist das Muster für unsere Sprachgrenzen**: kleines Binary,
verpackt als eigenes Paket, vom JS aufgerufen.

## Home-Verhalten

Der Core liest `$DSH_HOME` und fällt sonst auf `~/.dsh` zurück
(`packages/util/home-paths`, 208 Fundstellen). Deshalb lassen sich zwei Installationen
sauber trennen — `~/.dsh` und `~/.pmh` — **ohne eine Zeile Core-Änderung**.

## Fallstrick: pnpm-Junctions

pnpm legt `node_modules`-Einträge als **Junctions mit absolutem Zielpfad** an. Wird der
Checkout-Ordner umbenannt oder verschoben, zeigen alle ~1400 Junctions ins Leere und der
Boot scheitert mit `ERR_MODULE_NOT_FOUND`. Fix: `pnpm install --force` im neuen Pfad.
