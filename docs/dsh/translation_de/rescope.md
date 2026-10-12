# Rescope der vendorten Pakete

English | [中文](rescope.zh.md)

Das Cordis-Framework und seine Grundlagenbibliotheken werden unter [`vendor/`](../vendor/README.md) als Vendor-Code geführt und unter dem Scope `@deepseek-ai` veröffentlicht, weil jedes Harness-Paket das Framework als Peer-Dependency deklariert: Die Veröffentlichung des Harness veröffentlicht diese Schicht mit, und unter den Upstream-Namen würde diese Veröffentlichung sie im Registry besetzen. Diese Seite ist die Namenszuordnung; die Entscheidung und ihre Folgen stehen in der [Rescope-Agent-Note](../.agents/notes/archived/process/2026-08-10-vendor-package-rescope.md), die Upstream-Commits in [`vendor/README.md`](../vendor/README.md).

## Namenszuordnung

| Verzeichnis | Upstream-Name | Veröffentlichter Name | Upstream-Version | Rolle |
|---|---|---|---|---|
| `vendor/cordis/` | `cordis` | `@deepseek-ai/cordis` | 4.0.0-rc.7 | Framework-Core: `Context`, `Service`, `Fiber`, Events |
| `vendor/cosmokit/` | `cosmokit` | `@deepseek-ai/cosmokit` | 1.8.1 | Gemeinsame Utilities, auf denen das Framework und Schemastery aufbauen |
| `vendor/schemastery/` | `schemastery` | `@deepseek-ai/schemastery` | 3.18.0 | Config-Schemas (`Schema`) hinter dem `Config` jedes Plugins |
| `vendor/loader/` | `@cordisjs/plugin-loader` | `@deepseek-ai/cordis-plugin-loader` | 1.0.0-rc.5 | Laden von `cordis.yml`, Plugin-Auflösung, Repository-Cache |
| `vendor/include/` | `@cordisjs/plugin-include` | `@deepseek-ai/cordis-plugin-include` | 1.0.4 | Config-Includes und Patch-Overlays |
| `vendor/group/` | `@cordisjs/plugin-group` | `@deepseek-ai/cordis-plugin-group` | 1.0.0 | Verschachtelte Plugin-Gruppen |
| `vendor/timer/` | `@cordisjs/plugin-timer` | `@deepseek-ai/cordis-plugin-timer` | 1.1.2 | Disposal-bewusste Timer auf `ctx` |
| `vendor/hmr/` | `@cordisjs/plugin-hmr` | `@deepseek-ai/cordis-plugin-hmr` | 1.0.15 | Hot Module Replacement für Plugins und Config |
| `vendor/logger-console/` | `@cordisjs/plugin-logger-console` | `@deepseek-ai/cordis-plugin-logger-console` | 1.0.0 | Konsolen-Logger-Exporter |

Subpath-Exports behalten ihren Pfad: `@cordisjs/plugin-loader/repository` wird zu `@deepseek-ai/cordis-plugin-loader/repository`.

## Was die Umbenennung nicht berührt

- **Verzeichnisnamen und Upstream-Quellversionen.** `vendor/hmr/` bleibt `vendor/hmr/`, und die Tabelle hält die Upstream-Version des gepinnten Quell-Snapshots fest, sodass das Manifest wie ein Upstream-Snapshot wirkt; das eigene Feld `version` der vendorten `package.json` ist die veröffentlichte Manifest-Version des Harness, die `pnpm run release:vendor` anhebt und die ein erneuter Sync auf die Upstream-Version zurücksetzt.
- **Dependency-Ranges.** Die Umbenennung ändert Dependency-Keys, ohne Ranges zu ändern. Workspace-Manifeste verwenden das Protokoll `workspace:`; [Repository-Regeln](../AGENTS.md#conventions) unterscheiden exakte DSH-Referenzen von Tilde-Ranges für Vendor/Native.
- **Das Builtin-Präfix `cordis:` des Loaders.** `cordis:include` und `cordis:group` sind ein Protokollpräfix, kein Paketname.
- **Die Konfigurationsfamilie `cordis.yml`**, einschließlich `*.cordis.yml`, `*.cordis.snapshot.yml` und `cordis.patch.yml`.
- **Harness-Pakete, deren eigener Name das Wort enthält**, wie `@deepseek-ai/dsh-tool-cordis`.
- **Upstream-Runtime-Identifier**, wie Schemasterys `Symbol.for('schemastery')` und sein Metadatenfeld `vendor:`.
- **Prosa außerhalb von `docs/`.** `vendor/*/README.md`, Paket-READMEs und Agent Notes behalten die Namen, mit denen sie geschrieben wurden; ein blankes `cordis` kann dort auch der Optionsname des Python-SDK oder eine Agent-Preset-ID sein. Innerhalb von `docs/` folgen Prosa und jeder Markdown-Fence der Umbenennung.

## Was der eigene Code ändern muss

| Stelle | Vorher | Nachher |
|---|---|---|
| Modul-Import | `import { Context } from 'cordis'` | `import { Context } from '@deepseek-ai/cordis'` |
| Typed-Event-Merge | `declare module 'cordis'` | `declare module '@deepseek-ai/cordis'` |
| Dependency-Key in `package.json` | `"@cordisjs/plugin-hmr": "^1.0.15"` | `"@deepseek-ai/cordis-plugin-hmr": "^1.0.15"` |
| Plugin-Eintrag in `cordis.yml` | `name: '@cordisjs/plugin-include'` | `name: '@deepseek-ai/cordis-plugin-include'` |

## Anwenden, Verifizieren und Zurücknehmen

[`scripts/rescope-vendor.ts`](../scripts/rescope-vendor.ts) besitzt die obige Zuordnung und führt die Umbenennung aus, sodass keine Referenz von Hand umbenannt wird:

```sh
pnpm run rescope-vendor            # report what would change
pnpm run rescope-vendor --apply    # rewrite every reference
pnpm run rescope-vendor:check      # assert the post-state; runs in the hygiene gate
pnpm run rescope-vendor --apply --reverse   # return to the upstream names
```

Nach einem Upstream-Sync erneut anwenden ([Verfahren](../vendor/README.md)) und anschließend die ausgegebene Neugenerierung ausführen: `pnpm install` für das Lockfile, `pnpm run gen-third-party-notices` und `pnpm run verify-translation-pairing --write` für die berührten bilingualen Paare.
