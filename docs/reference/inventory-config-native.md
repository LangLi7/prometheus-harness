# Inventar: Boot, Settings, Config, Utilities, Bundles, C-Addon, Python-SDK und Repository-Infrastruktur

## 1. Kopf

**Was diese Datei ist.** Ein vollständiges, belegtes Inventar der Komponenten BOOT, SETTINGS, CONFIG, UTILITIES, BUNDLES, des einzigen C-Codes (`native/system`), des einzigen Python-Codes (`python/sdk`) sowie der Repository-Infrastruktur der DeepSeek-Harness-Vorlage. Jede Aussage nennt die Quelldatei, aus der sie stammt; alle Bezeichner, Typnamen, Feldnamen, Pfade, Exit-Codes und Code-Strings stehen unverändert in Originalschreibweise.

**Quelle.** `C:\Users\Chang\harness\prometheus-harness` (die DeepSeek-Harness-Referenzvorlage, ein TypeScript-Monorepo mit einem C-Addon und einem Python-SDK). Primaerquellen sind die `src/`-Verzeichnisse; `package.json`, `README.md`, `tests/` und generierte `lib/types/*.d.ts` wurden nur zur Bestaetigung herangezogen.

**Datum.** 2026-10-12 (Erstellungsdatum dieses Dokuments; alle Aussagen beziehen sich auf den oben genannten Stand der Quelle).

**Ausdruecklicher Hinweis: Read-only-Analyse.** Dieses Dokument ist eine reine Leseanalyse. Es wurde **keine** Datei in der Quelle veraendert, erstellt oder geloescht. Die Ordner `C:\Users\Chang\prometheus-harness\docs\dsh` und `C:\Users\Chang\prometheus-harness\docs\design` wurden nicht geoeffnet. Geschrieben wurde genau **eine** Datei: diese hier.

**Repository-Eckdaten der Quelle.** Der Monorepo-Root `package.json` traegt `name: @deepseek-ai/dsh-root`, `version: 0.2.1-alpha.2`, `private: true`, `type: module`, `packageManager: pnpm@11.28.5`, `engines.node: ^22.19.0 || >=24.0.0` (`package.json`).

**Hinweis zur Laenge.** Das Dokument umfasst rund 2000 Zeilen statt der nominell angepeilten 500–1000. Grund sind ausschliesslich die ausdruecklich als *vollstaendig* geforderten Tabellen: die Umgebungsvariablen-Tabelle (Abschnitt 5.4, **173** verschiedene Variablennamen), das flock-Kontrakt (Abschnitt 8.2, 22 Zeilen), die Plugin-Liste des Base-Bundles (Abschnitt 7.1, 94 Zeilen) und die vollstaendige oeffentliche Oberflaeche des Python-SDK (Abschnitt 9). Eine Kuerzung waere nur durch Weglassen dieser Vollstaendigkeit moeglich; die Prosa-Teile sind bewusst knapp gehalten und nennen statt Codebloecken nur einzeilige Signaturen, Tabellen und Dateipfade.

---

## 2. Boot und Lebenszyklus

Alle fuenf Pakete liegen unter `packages/boot/`, tragen Version `0.2.1-alpha.2`, setzen `"type": "module"`, veroeffentlichen mit `publishConfig.access: "public"` und definieren **kein** `bin`.

### 2.1 `boot/app-boot` — `@deepseek-ai/dsh-app-boot`

**Zweck.** Gemeinsame Loader-Startbibliothek hinter dem `dsh`-Launcher: sie laedt `.env`-Schichten, komponiert Profil-Bundles und Patch-Layer, mountet den Root-Include und bootet den Cordis-Loader bis zum Settlement. Dazu kommen Profil-Kompatibilitaetspruefung, Laufzeit-Paketaufloesung, Config-Dump und Start-Audit-Politik (`packages/boot/app-boot/README.md`, `packages/boot/app-boot/src/index.ts`).

**Config-Schema.** **Kein** `Config`: es gibt keine Klasse mit `static Config` und kein `interface Config` in `src/`. Vorhanden sind nur die Typen `ConfigDumpLayer`, `ConfigJsonSchemaObject`, `ConfigSchemaDiagnostic`, `ConfigSchemaEntry`, `ConfigSchemaDump`, `ConfigProjection` (`packages/boot/app-boot/src/index.ts`, `src/config-schema/types.ts`, `src/config-schema/projector.ts`).

**Package-Metadaten** (`packages/boot/app-boot/package.json`):

| Feld | Wert |
|---|---|
| npm-Name / Version | `@deepseek-ai/dsh-app-boot` / `0.2.1-alpha.2` |
| `main` / `types` | `lib/index.js` / `lib/types/index.d.ts` |
| `exports` | `.`, `./worker/profile-resolution-bootstrap`, `./src/*`, `./package.json` |
| dependencies | `@deepseek-ai/dsh-atomic-write`, `@deepseek-ai/dsh-package-manifest`, `@eslint-community/regexpp`, `ajv`, `js-yaml`, `node-addon-require-builtin`, `resolve.exports`, `semver` |
| peerDependencies | `@deepseek-ai/cordis-plugin-group`, `@deepseek-ai/cordis-plugin-include`, `@deepseek-ai/cordis-plugin-loader`, `@deepseek-ai/dsh-launch-environment`, `@deepseek-ai/dsh-home-paths`, `@deepseek-ai/dsh-system-prompt`, `@deepseek-ai/cordis` |

**Wichtige Exporte (verdichtete Signaturen):**

| Export | Signatur |
|---|---|
| `resolveConfigPath` | `resolveConfigPath(configPath: string, snapshotMode: string \| undefined, cwd = process.cwd()): string` |
| `loadEnv` | `loadEnv(binName: string, dir = process.cwd(), warn = …stderr): void` |
| `loadLayeredEnv` | `loadLayeredEnv(binName: string, cwd = process.cwd(), warn = …stderr): LaunchEnvironmentSnapshot` |
| `reconcileProfilePatches` | `reconcileProfilePatches(ctx: Context, patches: PatchOptions[], binName: string, requiredIds: readonly string[] = []): Promise<string[]>` |
| `loadOptionalPatches` / `loadOverlayPatches` | `loadOptionalPatches(binName: string, file: string): PatchOptions[] \| undefined` / `loadOverlayPatches(binName, file): PatchOptions[]` |
| `renderConfigDump` | `renderConfigDump(binName: string, absoluteConfigPath: string, layers: ConfigDumpLayer[], warn = …stderr): string` |
| `mountRootInclude` | `mountRootInclude(ctx: Context, absoluteConfigPath: string, patches = [], bareModuleBaseUrl?: string, binName = 'dsh'): Promise<Entry \| undefined>` |
| `installFailLoud` | `installFailLoud(binName: string, proc: FailLoudProcess = process, release?: () => Promise<void> \| void): () => void` |
| `auditStartupEntries` | `auditStartupEntries(ctx: Context, binName: string, warn = …stderr): Promise<void>` |
| `boot` | `boot(binName: string, absoluteConfigPath: string, patches?: PatchOptions[], prepare?: (ctx: Context) => Promise<void> \| void, bareModuleBaseUrl?: string): Promise<Context>` |
| `addHarnessSourceSection` | `addHarnessSourceSection(ctx: Context, sourceRoot: string): (() => void) \| undefined` |
| `prepareProfileEntries` / `prepareProfilePatches` | `prepareProfileEntries(ctx, entries: readonly EntryOptions[], parentURL: string \| undefined, binName = 'dsh'): EntryOptions[]` / `prepareProfilePatches(ctx, patches: PatchOptions[], parentURL: string, binName = 'dsh'): PatchOptions[]` |
| `readPluginMeta` / `resolvePluginResource` | `readPluginMeta(specifier: string, parentURL: string): PluginLocalizedMeta \| undefined` / `resolvePluginResource(specifier: string, parentURL: string): string` |
| `generateConfigSchema` / `collectConfigSchemas` | `generateConfigSchema(profile: Profile, layers: readonly PatchOptions[][], installAnchor: string): Promise<ConfigSchemaDump>` / `collectConfigSchemas(profile: Profile, entries: readonly unknown[], resolution: RuntimeResolution, diagnostics = []): Promise<ConfigSchemaDump>` |
| `createConfigProjector` / `isNativeConfigSchema` / `createPatternCheck` | `createConfigProjector(): Promise<(root: NativeConfigSchema, prefix: string) => ConfigProjection>` / `isNativeConfigSchema(value: unknown): value is NativeConfigSchema` / `createPatternCheck(): Promise<(source: string, flags?: string) => boolean>` |
| `getDshRuntimeVersion` | `getDshRuntimeVersion(): string` |
| `evaluatePluginCompatibility` / `pluginCompatibilityWarning` | `evaluatePluginCompatibility(manifest: object, exemptions = {}, runtimeVersion = getDshRuntimeVersion()): PluginCompatibility \| undefined` / `pluginCompatibilityWarning(issue: PluginCompatibility): string` |
| `readProfileCompatibility` / `setProfileVersionExemption` | `readProfileCompatibility(profileDir: string): ProfileCompatibility` / `setProfileVersionExemption(profileDir, packageVersion, runtimeVersion, enabled, acceptRisk): Promise<void>` |
| `sanitizeProfile` | `sanitizeProfile(binName: string, profileDir: string, bundles: readonly string[]): string \| undefined` |
| `readProfilePatches` / `resolveTelemetryPatch` | `readProfilePatches(binName: string, context: ProfileContext, initialProfile?: Profile): PatchOptions[]` / `resolveTelemetryPatch(disabledEnv: string \| undefined, hasRow: boolean): PatchOptions \| undefined` |
| `composeEntries` | `composeEntries(layers: readonly PatchOptions[][], warn = () => {}): EntryOptions[]` |
| `createRuntimeResolution` | `createRuntimeResolution(options: RuntimeResolutionOptions): Promise<ProfileRuntimeResolution>` |
| `resolveProfileDir` / `resolveBundleDir` | `resolveProfileDir(name: string, home = resolveDshHome()): string` / `resolveBundleDir(binName, packageName, installAnchor, profileDir): string` |
| `loadProfile` / `loadProfileDirectory` / `initProfile` | `loadProfile(binName, name, installAnchor, home = resolveDshHome(), options = {}): Profile` / `loadProfileDirectory(binName, dir, installAnchor, options = {}): Profile` / `initProfile(dir: string, bundles: readonly string[]): void` |
| `readProfileManifest` / `writeProfileManifest` / `removeLinkProjections` | `readProfileManifest(binName: string, dir: string): ProfileManifest` / `writeProfileManifest(dir, manifest): void` / `removeLinkProjections(dir: string): void` |
| `bundlePatchFiles` / `bundlePatchPaths` / `reportSkippedBundles` | `bundlePatchFiles(bundle: DshBundleManifest): string[]` / `bundlePatchPaths(packageDir, bundle): string[]` / `reportSkippedBundles(binName: string, profile: Pick<Profile, 'skippedBundles'>): void` |
| `readProfilePlugins` / `writeProfileBundles` / `reconcileProfilePlugins` | `readProfilePlugins(location: ProfilePluginLocation): ProfilePluginInventory` / `writeProfileBundles(profileDir, manifest, bundles): ProfileManifest` / `reconcileProfilePlugins(options: ProfilePluginLocation & { before; preserveDisabled }): ProfilePluginReconciliation` |
| `ProfileRuntimeResolution` | `class ProfileRuntimeResolution implements RuntimeResolution` mit `computeLatestResolution(): Promise<ProfileRuntimeResolution>` |
| `PluginPackages` | `class PluginPackages extends Service` mit `replace(successor: RuntimeResolution): void`, `refresh(): Promise<void>`, `packageOf(specifier, parentURL): PluginPackage \| undefined`, `metaOf(specifier, parentURL): PluginLocalizedMeta \| undefined` |
| `installRuntimeInterception` / `registerWorkerResolution` / `barePackageName` | `installRuntimeInterception(resolution: RuntimeResolution): RuntimeInterception` / `registerWorkerResolution(resolution): () => void` / `barePackageName(request: string): string \| undefined` |
| `realModuleDirectory` / `realModuleFile` | `realModuleDirectory(path: string): string` / `realModuleFile(path: string): string` |

**Exportierte Typen (Feldlisten, je eine Zeile):**
`ProfileContext { name; packageManager?; dir; patchPath; installAnchor; cwd; home; startedBundles; overlays; telemetryDisabledEnv }` · `Profile { name; dir; layers; patchPath; patches; skippedBundles }` · `ProfileLayer { packageName; packageDir; patchPaths; patches }` · `SkippedBundle { packageName; reason }` · `RuntimeResolution { profilesDir; profileDir; localPackageNames; entries; linkedRoots }` · `RuntimeResolutionEntry { name; packageDir; version; declarer; scope }` · `LinkedRoot { name; realPath }` · `PluginCompatibility { name; version; runtimeVersion; peers; exempted }` · `ProfileCompatibility { exemptions; warnings; rewritable }` · `ConfigSchemaDump { $schema; $defs; 'x-cordis' }` · `ConfigSchemaEntry { path; id?; name?; status; configRef?; tree? }` · `StartupEntryDiagnostic { id; module; required; fiberState; outcome }` · `FailLoudProcess { on; off; stderr; exit }` · `ConfigDumpLayer { label; patches }` (alle `packages/boot/app-boot/src/index.ts`, `src/profile.ts`, `src/config-schema/types.ts`).

**Konstanten, Fehler und Event:** `PROFILES_DIR = 'profiles'`, `PROFILE_PATCH_FILENAME = 'cordis.patch.yml'`, `PROFILE_COMPATIBILITY_FILENAME = 'compatibility.json'`, `DEFAULT_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base']`, `PROFILE_TEMPLATES`, `OPTIONAL_BUNDLES`, `ON_DEMAND_BUNDLES`, `OFFICIAL_ON_DEMAND_CATALOG`, `LOADER_EXPRESSION_SCHEMA`, `FAIL_LOUD_RELEASE_TIMEOUT_MS = 2_000`, `HARNESS_SOURCE_SECTION = 'harness:source'`; `class StartupError extends Error { startup?; entries }` (beide `enumerable: false`); Event `app-boot/config-reload()` (`packages/boot/app-boot/src/index.ts`, `src/profile.ts`).

**Beobachtbarer Lebenszyklus.** Boot-Phasen in Reihenfolge (`packages/boot/app-boot/src/index.ts`):
`new Context()` → zweiter `Context` als Logger-Exporter fuer `warn`/`error` → `ctx.baseUrl` → `ctx.provide('dshHomePath', dshHomePath)` → globaler `internal/update`-Waterfall-Hook → `await ctx.plugin(Loader)` → `prepare?.(ctx)` (Label `host preparation failed`) → Label `plugin tree failed to load` → `mountRootInclude` (mit `prepareProfilePatches` vor jedem Import) → `ctx.get('loader')?.await()` → `auditStartupEntries` → Rueckgabe.

**Verhalten bei Fehlern.** Jeder Fehler laeuft durch `catch (cause)` mit `await ctx.fiber.dispose()`; ein `StartupError` erhaelt `cause.startup = { configurationPath, messages }` und wird unveraendert weitergereicht, alles andere wird zu `new Error(\`${binName}: ${stage}: ${detail}${stack}\`, { cause })`. `auditStartupEntries` wirft `StartupError`, wenn der Bootstrap-Include oder eine Id aus `requiredStartupEntryIds` (`agent-loop`, `webserver`, `web-runtime`, `modules`, `connection`, `headless-runner`, `acp`, `sdk-jsonrpc-server`) inaktiv ist; fehlende oder explizit `disabled` gesetzte Required-Ids sind folgenlos, nur-optionale Ausfaelle ergeben eine `warning:`-Zeile. `installFailLoud` schreibt `util.inspect(err, { depth: 4, maxArrayLength: 50 })` mit `fatal load failure` bzw. `fatal uncaught exception` und ruft `proc.exit(1)`; bereits im Boot-Diagnostic enthaltene Rejection-Gruende werden ueber `assembledActivationRejections` am naechsten Checkpoint geschluckt; `release` wird unter `FAIL_LOUD_RELEASE_TIMEOUT_MS = 2_000` ms awaited, danach folgt immer `exit(1)` (`packages/boot/app-boot/src/index.ts`).

**Shutdown/Drain.** `ctx.fiber.dispose()` im Catch, im `finally` `await diagnostics.fiber.dispose()`. `reconcileProfilePatches` wirft nach `entry.update(...)`, `fiber.await()` und `ctx.loader.await()` nur bei neuen oder geaenderten Fehlschlaegen und emittiert sonst `app-boot/config-reload`. `sanitizeProfile` benennt `cordis.patch.yml` in `<patch>.bak-<Date.now()>` um (Kollisionen `-1`, `-2`, …). `loadProfileDirectory` legt unresolvable, manifestfreie oder peer-inkompatible Bundles in `skippedBundles`; `loadProfile` normalisiert `INSTALLATION_OWNED_PROFILE_TUPLES` und entfernt `RETIRED_BUNDLES`. `loadLayeredEnv` parst beide `.env`-Dateien **vor** dem Anwenden und wirft bei `BOOTSTRAP_NAMES`/`BOOTSTRAP_PREFIXES` (`DSH_`, `XDG_`, `DYLD_`, `BASH_FUNC_`), ausgenommen `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` in der Home-Datei. `evaluatePluginCompatibility` prueft nur `@deepseek-ai/dsh` und `@deepseek-ai/dsh-*` mit `semver.satisfies(..., { includePrerelease: true })`; `workspace:^`, `workspace:~`, `workspace:*` gelten als laufende Version (`packages/boot/app-boot/src/plugin-compatibility.ts`).

*Quellen:* `packages/boot/app-boot/package.json`, `README.md`, `src/index.ts`, `src/profile.ts`, `src/profile-context.ts`, `src/profile-plugins.ts`, `src/profile-sanitize.ts`, `src/profile-compatibility.ts`, `src/plugin-compatibility.ts`, `src/compatibility-preflight.ts`, `src/package-meta.ts`, `src/official-bundles.ts`, `src/official-bundle-packages.ts`, `src/config-schema/*.ts`, `src/profile-resolution/*.ts`.

### 2.2 `boot/cmdline` — `@deepseek-ai/dsh-cmdline`

**Zweck.** Uebergibt die inneren Argumente einer `dsh`-Invokation unveraendert an die gebootete App, damit die App eigene Flags, `--help`-Texte und Parse-Fehler besitzt. Zusaetzlich liefert sie den begrenzten Exit-Wunsch und das Ready-Signal des Launchers (`packages/boot/cmdline/README.md`, `src/index.ts`).

**Config-Schema.** **Kein** `Config`: nur Interfaces und Funktionen, keine Plugin-Klasse mit `static Config` (`packages/boot/cmdline/src/index.ts`).

**Package** (`packages/boot/cmdline/package.json`): `@deepseek-ai/dsh-cmdline`, `0.2.1-alpha.2`, `main: lib/index.js`, `types: lib/types/index.d.ts`, `exports: . , ./src/*, ./package.json`; **keine** `dependencies`; peerDependencies `@deepseek-ai/cordis-plugin-loader`, `@deepseek-ai/cordis` (`workspace:~`); devDependency `commander: ^15.0.0`.

**Exporte:** `provideCmdline(ctx: Context, host: CmdlineHost): void` · `parseCmdline(ctx: Context, program: Command): void` · `exitOnStdinEnd(ctx: Context, label: string): void` · `internals` = `{ stdin: AppStdin; stdout: { write(chunk: string): unknown }; stderr: { write(chunk: string): unknown } }` · Typen `CmdlineArgs { get(): readonly string[] }`, `AppExit { (code: number): void }`, `AppReady { onReady(listener: () => void): () => void }`, `CmdlineHost { args: readonly string[]; exit: AppExit; ready?: AppReady }`, `AppStdin { readonly readableEnded: boolean; once(event: 'end', listener): unknown; off(event: 'end', listener): unknown }` · Context-Slots `cmdlineArgs?`, `appExit?`, `appReady?` (`packages/boot/cmdline/src/index.ts`).

**Beobachtbarer Lebenszyklus.** `provideCmdline` laeuft vor jedem Tree-Eintrag und stellt `cmdlineArgs` (eingefrorener Snapshot via `Object.freeze([...host.args])`), `appExit` und optional `appReady` bereit. `parseCmdline` wirft ohne `cmdlineArgs`/`appExit` sowie ohne Action-Handler (`hasAction` liest `_actionHandler` strukturell); sonst konfiguriert es jeden Kommandoknoten rekursiv mit `exitOverride()` und `configureOutput` und ruft `program.parse(args.get(), { from: 'user' })`. Geworfene Werte werden nur geschluckt, wenn `isCommanderError` sie strukturell erkennt (`code` beginnt mit `commander.`, `exitCode` ist Zahl) — dann `exit(error.exitCode)`, also auch fuer `--help` und `--version`. `exitOnStdinEnd` wirft ohne `appExit`/`appReady`, registriert einmalig `stdin.once('end', onEnd)` und fordert danach ueber `ready.onReady(() => exit(0))` den Exit an; `stdin.readableEnded` wird per `queueMicrotask` nachgeholt; der `ctx.effect`-Disposer entfernt den Listener und storniert einen wartenden Ready-Listener (`packages/boot/cmdline/src/index.ts`, `tests/cmdline.spec.ts`).

### 2.3 `boot/config-editor` — `@deepseek-ai/dsh-config-editor`

**Zweck.** Persistiert vollstaendige Plugin-Konfigurationen in den Patch des aktiven Profils und wendet sie sofort ueber den normalen Loader-Pfad an. Geschrieben wird erst nach vollstaendiger Validierung des Kandidaten, serialisiert mit Profilaenderungen und HMR (`packages/boot/config-editor/README.md`, `src/index.ts`).

**Config-Schema.** **Kein** `Config`: `ConfigEditor` ist ein `Service` mit `static inject = ['loader', 'profileContext']`, aber ohne `static Config` (`packages/boot/config-editor/src/index.ts`).

**Package** (`packages/boot/config-editor/package.json`): `@deepseek-ai/dsh-config-editor`, `0.2.1-alpha.2`, `main: lib/index.js`, `types: lib/types/index.d.ts`, `exports: . , ./src/*, ./package.json`; dependencies `@deepseek-ai/dsh-atomic-write`, `yaml: ^2.8.1`, `js-yaml: ^4.3.2`; peerDependencies `@deepseek-ai/cordis`, `@deepseek-ai/cordis-plugin-loader`, `@deepseek-ai/dsh-hmr` (via `peerDependenciesMeta.optional: true`), `@deepseek-ai/cordis-plugin-include`, `@deepseek-ai/dsh-app-boot`.

**Exporte:** `class ConfigEditor extends Service` (zugleich `default`) mit `static inject: string[]`, `constructor(ownerContext: Context)`, `get documentPath(): string`, `entries(): Entry[]`, `configuration(): Array<{ entry: Entry; inherited: Record<string, unknown>; override: Record<string, unknown> }>`, `edit(entry: Entry, change: (current, inherited) => Record<string, unknown>): Promise<void>`; Context-Slot `configEditor: ConfigEditor` (`packages/boot/config-editor/src/index.ts`).

**Beobachtbarer Lebenszyklus.** Der Lauf steht unter `withFileLock(join(profileContext.dir, 'package.json'))`. Reihenfolge:
1. Pruefen, dass `entry` in `entries()` liegt und ein `fiber` hat → sonst `Configuration entry is no longer available`.
2. `readProfilePatches` plus `reconcileProfilePatches(root, beforePatches, 'dsh')`.
3. Erneute Pruefung → `Configuration entry changed during reload`.
4. `current`/`inherited` lesen; `fiber.state !== FiberState.ACTIVE` → `Configuration plugin is no longer active`.
5. `fiber.ctx.waterfall(fiber, 'internal/config', next, () => next)` und `resolveConfig(...)` als Validierung.
6. `readFile(path)` mit ENOENT-Fallback `'[]\n'`; `parseDocument` mit `customTags` fuer `tag:yaml.org,2002:js`; Fehler aus `document.errors[0]`; `isSeq`-Pruefung → `Profile patch must be a YAML sequence`.
7. Bei Tiefengleichheit zu `inherited` wird `config` aus allen passenden Zeilen entfernt und leere Zeilen geloescht, sonst `config` gesetzt bzw. eine Zeile `{ id, name, config }` angehaengt.
8. `visit` stellt `__jsExpr`-Marker als `!!js`-Scalar wieder her.
9. Abweichung des effektiven Werts → `Configuration for "<id>" is overridden by a home patch or command-line overlay`.
10. `writeFileAtomic(path, String(document), { mode: 0o600 })`.
11. `reconcileProfilePatches(root, patches, 'dsh', [entry.options.id])`; schlaegt Schritt 11 fehl, wird der vorherige Text atomar zurueckgeschrieben und `beforePatches` erneut abgeglichen, dann der Fehler erneut geworfen.

Bei vorhandenem `hmr` laeuft alles in `hmr.runExclusive(run)`, sonst direkt. `entries()` beruecksichtigt nur Eintraege mit `entry.parent.tree.ctx.fiber.entry?.id === 'include'` und filtert mehrfach vergebene Ids (`packages/boot/config-editor/src/index.ts`).

### 2.4 `boot/hmr` — `@deepseek-ai/dsh-hmr`

**Zweck.** Laedt Plugin-Quellcode und Profilkonfiguration im laufenden Betrieb nach; Modulersetzungen, Include-Refreshes und Konfigurationsaenderungen teilen sich eine Queue. Paketinstallationen laufen ausserhalb dieser Queue (`packages/boot/hmr/README.md`, `src/index.ts`).

**Config-Schema.** `static Config: z<HmrConfig> = z.object({...})`; `HmrConfig extends ChokidarOptions`, `namespace Hmr { export type Config = HmrConfig }` (`packages/boot/hmr/src/index.ts`).

| Feld | Typ | Optional | Default | Quelle |
|---|---|---|---|---|
| `base` | `string` | ja | Kontext-Basis-URL → `fileURLToPath(new URL(config.base \|\| '.', ctx.baseUrl))` | `src/index.ts:54`, `:308` |
| `root` | `string[]` | nein | `['.']` via `z.array(String).role('table').default(['.'])` | `src/index.ts:57`, `:214` |
| `debounce` | `number` | nein | `100` via `z.natural().role('ms').default(100)` | `src/index.ts:59`, `:221` |
| `ignored` | `string[]` | nein | `['**/node_modules', '**/.*', 'cache', 'data']` | `src/index.ts:61`, `:215` |
| Chokidar-Optionen | `ChokidarOptions` | ja (geerbt) | Chokidar-Defaults; `watch()` setzt `cwd: watchBaseDir`, `ignored: path => match(relative(...))`, `ignoreInitial: true` | `src/index.ts:53`, `:374` |

**Package** (`packages/boot/hmr/package.json`): `@deepseek-ai/dsh-hmr`, `0.2.1-alpha.2`, `main: lib/index.js`; dependencies `@babel/code-frame`, `chokidar: ^4.0.3`, `node-addon-require-builtin`, `picomatch: ^4.0.7`, `@deepseek-ai/schemastery`; peerDependencies `@deepseek-ai/cordis-plugin-timer`, `@deepseek-ai/cordis`, `@deepseek-ai/cordis-plugin-loader`, `@deepseek-ai/cordis-plugin-include`, `@deepseek-ai/dsh-app-boot`, `@deepseek-ai/dsh-cmdline`; Lizenz `MIT`, Autor `Shigma <shigma10826@gmail.com>`.

**Exporte:** `class Hmr extends Service` (zugleich `default`) mit `@Inject('loader')`, `@Inject('timer')`, `static Config: z<HmrConfig>`, `readonly baseDir: string`, `runExclusive<T>(operation: () => Promise<T>): Promise<T>`, `watchConfig(filename: string, refresh: () => Promise<void>): Promise<() => Promise<void>>`, `getOuterStack: () => string[]`, `getLinked(url: string): Promise<string[]>` · `interface HmrConfig extends ChokidarOptions { base?: string; root: string[]; debounce: number; ignored: string[] }` · `interface Reload { filename: string; modules: ReloadModules; runtime?: Plugin.Runtime \| undefined }` · `watchConfig(ctx: Context, filename: string, options: ChokidarOptions, refresh: () => Promise<void> \| void, inTransaction: () => boolean = () => false): Promise<() => Promise<void>>` (`src/watch-config.ts`) · `handleError(ctx: Context, e: unknown): void` (`src/error.ts`) · `class PackageManifests` mit `invalidate(manifest: string): void`, `dispose(): void` (`src/package-manifest.ts`) · Events `hmr/change(url: string): void`, `hmr/reload(reloads: Map<Plugin, Reload>): void`; Context-Slot `hmr: Hmr`.

**Beobachtbarer HMR-Lebenszyklus.** Der Konstruktor wirft `--expose-internals is required for HMR service` ohne `ctx.loader.internal`. `[Service.init]` liefert zuerst einen Disposer: `closing = true`, `this.watcher?.close()`, `this.operations` nur ausserhalb einer Transaktion awaited, `manifests.dispose()`.
- **Profilzweig:** ohne `profileContext` keine Verdrahtung; mit Profil wird `appReady` verlangt (`Profile HMR requires application readiness`) und alle Reloads warten auf `applicationReady`.
- **Gewatchte Dateien:** `<profile.dir>/package.json`, `profile.patchPath`, `join(profile.home, PROFILE_PATCH_FILENAME)`. Die Manifest-Ueberwachung laedt nur bei geaenderter Liste `dsh.profile.bundles` neu (`refresh(manifestOnly)` ueber `lastBundles`), der Patch-Refresh vergleicht zusaetzlich die Rohinhalte ueber `lastInputs`.
- **Modul-Watcher:** Externals kommen aus dem Dependency-Graph von `process.argv[1]` (`loadDependencies`) und werden vor `watch(root, …)` gesammelt; `ignored` laeuft ueber `picomatch` auf relative Pfade; Startfehler lehnen `init` ab, spaetere `error`-Events werden nur geloggt.
- **Debounce/Dispatch:** `change`-Events sammeln Pfade und rufen `ctx.debounce(..., this.config.debounce)` (Default `100` ms). Pro Datei: registrierte Konfigurationspfade werden uebersprungen; `package.json` ausserhalb `node_modules` invalidiert den Manifest-Cache; ein External setzt `fullReload` und ruft `loader.exit()`; ein Eintrag im `internal.loadCache` (ESM oder `'json'`) landet in `stashed`; eine Include-Datei wird ueber `include.refresh()` aktualisiert; alles andere emittiert `hmr/change`. Danach `partialReload()` und `loader.await()`; Batch-Fehler werden ueber `ctx.logger.warn(error)` geschluckt.
- **`partialReload`:** `analyzeChanges()` markiert gestashte Dateien als `accepted`, Externals als `declined` und propagiert ueber `getLinked()`, bis nichts mehr zu entscheiden ist; Reste werden `declined`. Pro Config-Tree-Basis-URL entstehen `EntryNamespaces`; `declined`-URLs werden uebersprungen; Jobs ohne akzeptierte Abhaengigkeit entfallen; ESM-`loadCache`-Eintraege werden per `Map.prototype.delete`, CJS-`require.cache`-Eintraege per `Reflect.deleteProperty` entfernt, mit `esmBackup`/`cjsBackup` fuer `rollback()`. Ersetzungen werden in `generations` gruppiert. Import-Fehler: `handleError(this.ctx, e)`, `rollback()`, Fehler wird geworfen. Erfolg: pro Plugin `ctx.registry.delete(plugin)`, `fiber.await()`, `reload(...)`, `ctx.logger.info('reload plugin at %C', path)`. Nach `await this.ctx.loader.await()` aktualisieren `replacements.updateEntries(loader)` die `entry.moduleNamespace`, dann folgt `hmr/reload` mit der `reloads`-Map und `stashed` wird geleert. `getActiveImplementations` wirft `HMR replacement is ambiguous for a plugin instance without a Loader entry`.
- **`watch-config.ts`:** `findWatchRoot` steigt von `dirname(filename)` auf, bis ein Verzeichnis existiert, und kanonisiert per `realpath`; doppelte Registrierung wirft `config path already registered`. `watch` laeuft mit `awaitWriteFinish: true` vor den Deployment-Optionen sowie `depth` und `ignoreInitial: false`; beobachtet werden `add`, `change`, `unlink`; Refreshes werden ueber `dirty` plus laufende Promise serialisiert; Refresh-Fehler ergeben `ctx.logger.warn('config reload at %C failed', filename)` und werden geschluckt. Der Disposer schliesst den Watcher, haengt den `error`-Listener ueber `close()` hinweg erneut an, entfernt den Pfad und awaited den laufenden Refresh nur ausserhalb einer Transaktion.
- `runExclusive` lehnt Verschachtelung mit `HMR transactions cannot be nested` ab und wirft nach Disposal `HMR is disposed`. `package-manifest.ts` ersetzt `readPackageJSON`, `getPackageScopeConfig`, `getPackageType`, `getNearestParentPackageJSON` und `CommonJS._load`, leert `_pathCache` und den ESM-`ResolveCache` und stellt bei `dispose()` alles in umgekehrter Reihenfolge wieder her.

### 2.5 `boot/plugin-manager` — `@deepseek-ai/dsh-plugin-manager`

**Zweck.** Verwaltet Plugins und Bundles des aktuellen Profils ohne Handarbeit an der Konfiguration: Eintraege schalten, Bundles auswaehlen, externe Bundles installieren oder entfernen. Dienst, CLI und das Agent-Werkzeug `plugin_manager` nutzen dieselben Operationen (`packages/boot/plugin-manager/README.md`, `src/tools.ts`, `src/operations.ts`).

**Config-Schema.** `static Config: z<Config> = z.object({...})`; alle Felder optional, gelesen als `Required<Config>` (`packages/boot/plugin-manager/src/index.ts`).

| Feld | Typ | Optional | Default (Schemastery) |
|---|---|---|---|
| `pnpmCommand` | `string` | ja | `'pnpm'` |
| `outputBytes` | `number` (`step(1).min(1)`) | ja | `16384` |
| `lockWaitMs` | `number` (`step(1).min(0)`) | ja | `120000` |
| `inspectTimeoutMs` | `number` (`step(1).min(1000)`) | ja | `20000` |
| `githubConnectionTimeoutMs` | `number` (`step(1).min(1000)`) | ja | `5000` |
| `idleTimeoutMs` | `number` (`step(1).min(1000)`) | ja | `600000` |
| `registry` | `string` (`pattern(REGISTRY_URL)`) | ja | kein Default → `null` = die von pnpm selbst benannte Registry |
| `fallbackRegistries` | `string[]` | ja | `[NPMMIRROR_REGISTRY]` = `['https://registry.npmmirror.com/']` |

**Package** (`packages/boot/plugin-manager/package.json`): `@deepseek-ai/dsh-plugin-manager`, `0.2.1-alpha.2`; `exports: . , ./types, ./registry, ./typert, ./remote, ./src/*, ./package.json, ./operations, ./tools`; dependencies `@deepseek-ai/dsh-app-boot`, `@deepseek-ai/dsh-atomic-write`, `@deepseek-ai/schemastery`, `execa: ^10.0.1`, `yaml: ^2.9.0`, `zod: ^4.4.3`, `@deepseek-ai/dsh-util-values`; peerDependencies u. a. `@deepseek-ai/cordis`, `@deepseek-ai/cordis-plugin-loader`, `@deepseek-ai/dsh-host-plugin-inventory`, `@deepseek-ai/dsh-subprocess`, `@deepseek-ai/dsh-typert-protocol`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-brand`, `@deepseek-ai/dsh-sandbox-policy`, `@deepseek-ai/dsh-sandbox`, `@deepseek-ai/dsh-user-approval`; optional peers `@deepseek-ai/dsh-hmr`, `@deepseek-ai/dsh-user-approval`.

**Exporte (verdichtet):** `class PluginManager extends TypertRemoteService` (zugleich `default`) mit `static inject = ['loader', 'profileContext']`, `static Config: z<Config>` · `listVersionExemptions(): { exemptions: Record<string, string[]>; warnings: string[] }` · `setVersionExemption(packageVersion: string, runtimeVersion: string, enabled: boolean, acceptRisk?: boolean): Promise<ChangeResult>` · `listPlugins(): Promise<PluginInfo[]>` · `listBundles(): Promise<BundleInfo[]>` · `registries(): Promise<PluginRegistries>` · `inspect(spec: string, options?: InspectOptions, signal?: AbortSignal): Promise<PluginSpecInspection>` · `setPluginEnabled(id: PluginEntryId, enabled: boolean): Promise<ChangeResult>` · `setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult>` · `installBundle(spec: string, options?: InstallBundleOptions): Promise<ChangeResult>` · `waitForInstall(requestId: PluginInstallRequestId): Promise<ChangeResult \| null>` · `cancelInstall(requestId): Promise<PluginInstallCancellation>` · `removeBundle(name: string): Promise<ChangeResult>` · `apply(ctx: Context): void` (registriert `plugin_manager`, `inject = ['tools', 'pluginManager', 'sandboxPolicy']`) · `operations.ts`: `anchorPathSpec`, `bundleManifest`, `saveManifest`, `runProfilePnpm`, `runPluginCommand`, `readProfileRegistry`, `registryArguments`, `viewProfilePackage` · `registry.ts`: `OFFICIAL_NPM_REGISTRY = 'https://registry.npmjs.org/'`, `NPMMIRROR_REGISTRY = 'https://registry.npmmirror.com/'`, `REGISTRY_URL = /^https?:\/\/\S+$/`, `normalizeRegistry`, `registryPlan`, `attributeFailure` · `install-spec.ts`: `class InvalidInstallSpecError extends Error { spec; reason }`, `parseInstallSpec`, `dependencySpec` · `install-failure.ts`/`failure.ts`: `classifyInstallFailure`, `class ManagementFailure extends Error { code; incompatible }`, `incompatiblePlugin` · `build-approval.ts`: `recordPendingBuilds`, `ignoredBuildNames`, `approveBuilds` · `github-connection.ts`/`patch.ts`: `checkGithubConnection`, `writePluginEnabled` · `run-tree.ts`: `leadsOwnGroup`, `treeAlive`, `awaitTreeGone` · `official-install-target.ts`: `officialBundleInstallTarget`.

**Wichtige Typen:** `ReadOnlyReason = 'management-required' \| 'unaddressable'` · `PluginInfo` · `BundleRowInfo { rowId; moduleName; meta?; entryId? }` · `BundleInfo { name; official; availability; installTarget?; version?; meta?; description?; enabled; installed; source?; optional; removable; readOnlyReason?; error?; rows; overrides }` · `Registry = string \| null` · `PluginRegistries { registry; fallbackRegistries; resolved }` · `PackageResult { exitCode; output; truncated; logPath; kind?; timedOut?; incompatible? }` · `ChangeResult { changed; application; stage; target; enabled?; error?; warnings?; packageResult?; bundle?; version?; pendingBuilds?; approvedBuilds?; registries?; failedAt? }` · `PluginInstallRequestId = Branded<'PluginInstallRequestId'>` · `InstallBundleOptions { enabled?; saveExact?; requestId?; approvedBuilds?; registry? }` · `InstallSpecKind = 'registry' \| 'path' \| 'git' \| 'tarball'` · Events `plugin-manager/changed`, `plugin-manager/install-log`, `plugin-manager/install-state` (`packages/boot/plugin-manager/src/types.ts`, `src/index.ts`).

**Beobachtbarer Lebenszyklus.** Konstruktion merkt `ctx.fiber.entry?.id` als `ownerEntryId`, schuetzt alle `profile.startedBundles`, normalisiert `registry`/`fallbackRegistries`; `ctx.effect(..., 'plugin-manager: package cancellation')` ruft `this.abort.abort()` und `Promise.allSettled([...this.packageOperations])`.

Jede Operation laeuft durch `change(...)`: `withFileLock(join(profile.dir, 'package.json'), …, { waitMs: lockWaitMs })` → `abort.signal.throwIfAborted()` → Vorher-Nachher-Vergleich ueber `diskState()` (`package.json`, `cordis.patch.yml`, `pnpm-workspace.yaml`, `compatibility.json`) → am Ende `ctx.emit('plugin-manager/changed', { reason })`. `application` startet als `'applied'` mit `hmr`, sonst `'restart-required'`; `InstallCancelledError` → `'cancelled'`, sonst `'failed'`.

Installationsablauf: (1) leere oder mit `-` beginnende Spec → `ManagementFailure('invalid-spec')`; (2) `options.approvedBuilds` → `approveBuilds(...)`; (3) Snapshot von `package.json` und `pnpm-lock.yaml`; (4) `checkGithubConnection(...)` mit `githubConnectionTimeoutMs` und `AbortSignal.any([...])` — nur `network`/`timeout` bricht mit `failedAt = 'spec-host'` ab; (5) `registryPlan(...)`, pro Registry bei Index > 0 `restoreFiles(files)`, dann `announce('installing', …)` und `pnpm add <spec> [--save-exact] [--registry=…]`; (6) `run.incompatible` bricht ohne weitere Registry ab, `timedOut` ebenso, sonst entscheidet `attributeFailure(...)`; (7) Fehlschlag → `recordPendingBuilds(...)` und `throw new Error(run.output)`; (8) Diff der `dependencies` ergibt den Namen, sonst `ManagementFailure('ambiguous-install')`; (9) fehlendes `dsh.bundle` → `not-bundle`; (10) `evaluatePluginCompatibility` → `incompatible-version`; (11) alle Patch-Pfade ueber `loadOverlayPatches`; (12) jeder Fehler im `try` loest `restoreFiles(files)` aus; (13) Phase `applying` mit `result.bundle/version/target` und `stage = 'enable'`; (14) `configure(...)`: Standard aktiviert, vorhandene Abhaengigkeit ergibt `restart-required`, sonst `refreshPackages()` und optional `reload()`.

Entfernung: `listBundles()` sucht das Bundle, `!removable` → `not-removable`; ohne HMR bei gestartetem Bundle oder lebenden Rows → `stop-profile`; dann `selectBundle(name, false)` plus `reload()`, Pruefung auf Eintraege mit `fiber?.uid != null` → `bundle-in-use`, dann `pnpm remove <name>` und `refreshPackages()`. Reihenfolge laut README und Code: Deselektieren, Runtime-Beitraege entladen, `pnpm remove`, Runtime-Resolution veroeffentlichen.

Prozesse: `runProfilePnpm` prueft zuerst `activeRecordedRun(dir)` (`.plugin-manager/run.json`), legt `.plugin-manager/logs/operation-*` mit `pnpm.log` an und prueft benannte Specs ueber `namedSpecManifest` mit `--config.fetch-retries=0`. Der Lauf nutzt `execa` mit `execution === 'cli'` (geerbte Deskriptoren) oder `'service'` (gepufferte Ausgabe, `killDescendants`, `idleTimeoutMs`). Nach dem Exit wird bei `stalled` der Baum ueber `awaitTreeGone` abgewartet, Pipes unter `DRAIN_AFTER_EXIT_MS = 2_000` ms geleert, der `run.json`-Eintrag im `finally` entfernt und das Log geschlossen (`packages/boot/plugin-manager/src/operations.ts`, `src/run-tree.ts`).

Version-Exemptions: `setProfileVersionExemption` verlangt fuer Grants `acceptRisk === true`, gleicht gegen `getDshRuntimeVersion()` ab und schreibt nur bei `readProfileCompatibility(profileDir).rewritable === true`; sonst wirft es. Ein Grant wirkt erst bei der naechsten Komposition: Live-Profil meldet `applied`, Startup-only-Profil `restart-required` (`packages/boot/app-boot/src/profile-compatibility.ts`).

Das Agent-Werkzeug `plugin_manager` deckt `list_plugins`, `list_bundles`, `set_plugin`, `set_bundle`, `install_bundle`, `remove_bundle`, `list_version_exemptions`, `set_version_exemption` ab; jede Aktion geht zuvor durch `approveEscalation({ requestedMode: 'danger-full-access', … })`; Listen entfernen `meta` und paginieren ueber `offset` (Default `0`) und `limit` (Default `25`, 1–100) (`packages/boot/plugin-manager/src/tools.ts`).

---

## 3. Settings

### 3.1 Zweck und Stellung

`@deepseek-ai/dsh-settings` ist die Service-Definition `ctx.settings` (Klasse `SettingsForms extends Service`, deklariert als `Context.settings`). Das Paket projiziert die `Config`-Schemata aktiver Loader-Eintraege in bearbeitbare Formulare und leitet Schreibvorgaenge an den Config-Editor weiter (`packages/settings/settings/README.md`). Es besitzt **selbst keine Konfigurationsfelder** — „This plugin has no configuration fields" (`packages/settings/settings/README.md`); in `src/` existiert kein `Config`/`Schema.object`.

| Aspekt | Befund | Quelle |
|---|---|---|
| Manifestname | `@deepseek-ai/dsh-settings` | `packages/settings/settings/package.json` |
| Entry Points | `main: lib/index.js`, `types: lib/types/index.d.ts` | `packages/settings/settings/package.json` |
| Subpath-Exports | `.`, `./types`, `./src/*`, `./package.json` | `packages/settings/settings/package.json` |
| Injizierte Services | `static inject = ['configEditor', 'profileContext']` | `packages/settings/settings/src/index.ts` |
| Service-Name | `super(ownerContext, 'settings')` | `packages/settings/settings/src/index.ts` |
| Sichtbarkeit | nur **volatile** Felder (`volatileForm`) werden exponiert; gewoehnliche Konfiguration bleibt Cordis-Konfigurationsdateien ueberlassen | `packages/settings/settings/src/index.ts`, `README.md` |

### 3.2 Konfigurationsdatei auf der Platte

Es gibt **keine** eigene Settings-Datei mehr. Die persistierte Form der Einstellungen ist der **Profil-Patch**:

| Konstante / Fakt | Wert | Quelle |
|---|---|---|
| Basisverzeichnis des Harness-Home | Verzeichnisname `.dsh` unterhalb des OS-Home (`DSH_HOME_DIR_NAME`) | `packages/util/home-paths/src/index.ts` |
| Override-Env-Variable | `DSH_HOME` (`DSH_HOME_ENV`) | `packages/util/home-paths/src/index.ts` |
| Aufloesungsfunktion | `resolveDshHome(configured?, env?)` → configured → `$DSH_HOME` → `~/.dsh` | `packages/util/home-paths/src/index.ts` |
| Profilunterverzeichnis | `PROFILES_DIR = 'profiles'` | `packages/boot/app-boot/src/profile.ts` |
| Dateiname des Nutzer-Patch-Layers | `PROFILE_PATCH_FILENAME = 'cordis.patch.yml'` | `packages/boot/app-boot/src/profile.ts` |
| Konkreter Pfad (Web) | `$DSH_HOME/profiles/web/cordis.patch.yml` | `packages/bundle/web-app/README.md` |
| Home-weiter Zusatz-Layer | `$DSH_HOME/cordis.patch.yml` (`join(context.home, PROFILE_PATCH_FILENAME)`) | `packages/boot/app-boot/src/profile-context.ts` |
| Serialisierung | **YAML** (Dokument = `yaml`-Sequenz; strikt `isSeq(document.contents)`) | `packages/boot/config-editor/src/index.ts` |
| Dateimodus beim Schreiben | `0600` (`writeFileAtomic(path, String(document), { mode: 0o600 })`) | `packages/boot/config-editor/src/index.ts` |
| Sperre | `withFileLock(join(profileContext.dir, 'package.json'), …)` | `packages/boot/config-editor/src/index.ts` |

**Dokumentform** (`cordis.patch.yml`): eine YAML-Sequenz von Patch-Zeilen mit den Schluesseln `id`, optional `name`, optional `config`, optional `insert` (verschachtelte Zeilenliste) und optional `group` (`flatten` in `packages/boot/config-editor/src/index.ts` behandelt `row.group && Array.isArray(row.config)` als Kindliste). Ein Patch **ersetzt** das gesamte `config` der Zielzeile, es wird nicht gemergt (`packages/bundle/base/cordis.patch.yml`, Kopfkommentar).

**Altformat (importiert, nicht mehr geschrieben):** `$DSH_HOME/settings.yaml`. Beim Start (nach dem Settle des Loaders) wird sie einmalig importiert: die Datei wird zuerst nach `<pfad>.imported` umbenannt, dann wird jeder Abschnitt in den Eintrag gleicher id geschrieben. Sektions-Umbiegungen (`LEGACY_SECTION_ENTRIES`): `ui-developer-tools` → `ui-settings`, `ui-onboarding` → `ui-settings-general`, `shell` → `pwsh-sandbox` (win32) bzw. `bash-sandbox` (`packages/settings/settings/src/index.ts`).

### 3.3 Settings-Schluessel mit Typ und Default

Settings selbst definiert **keine** Keys. Die adressierbaren Eintraege sind die Menge der `configEditor.entries()`; ihr Schema stammt aus `entry.fiber.runtime.Config` (`packages/settings/settings/src/index.ts`). Die in der Quelle erfassbaren Config-Schemata mit Defaults:

| Namespace (Entry-id) | Key | Typ | Default | Quelle |
|---|---|---|---|---|
| `deepseek-account` | `platformOrigin` | `string` | `'https://platform.deepseek.com'` | `packages/credentials/deepseek-account-platform/src/index.ts` |
| `deepseek-account` | `desktopPlatform` | `'darwin' \| 'win32' \| null` | `null` | ebd. |
| `deepseek-account` | `embeddedPageDist` | `string` | `''` | ebd. |
| `deepseek-account` | `inferenceOrigin` | `string` | `'https://api.deepseek.com'` | ebd. |
| `deepseek-account` | `allowLoopbackHttp` | `boolean` | `false` | ebd. |
| `deepseek-account` | `rewriteBrowserOrigin` | `boolean` | `false` | ebd. |
| `deepseek-account` | `requestHeaders` | `dict(string role('secret'))` | `{}` | ebd. |
| `deepseek-account` | `accountRequestHeaders` | `dict(string role('secret'))` | `{}` | ebd. |
| `deepseek-account` | `requestTimeoutMs` | `number` (1…120000) | `30000` | ebd. |
| `deepseek-account` | `balanceTimeoutMs` | `number` (1…120000) | `30000` | ebd. |
| `deepseek-account` | `logoutMaxRetries` | `number` (0…5, step 1) | `5` | ebd. |
| `deepseek-account` | `logoutRetryDelayMs` | `number` (1…60000) | `1000` | ebd. |
| `deepseek-account` | `attemptTimeoutMs` | `number` (1…3600000) | `600000` | ebd. |
| `credentials` (credentials-local) | `path` | `string` | `<harness home>/.credentials.yaml` | `packages/credentials/credentials-local/src/index.ts` |
| `credentials` | `dshHome` | `string` | `$DSH_HOME` bzw. `~/.dsh` | ebd. |
| `credentials` | `watch` | `boolean` | `true` | ebd. |
| `credentials` | `debounceMs` | `number` (min 0) | `100` | ebd. |
| `web-runtime` | `openBrowser` | `boolean` | `true` | `packages/bundle/web-app/src/index.ts` |
| `web-runtime` | `printUrl` | `boolean` | `true` | ebd. |
| `web-runtime` | `surfaceContext` | `boolean` | `true` | ebd. |
| `web-runtime` | `publicUrl` | `string` (transform → `parsePublicUrl(value).href`) | kein Default | ebd. |
| `sdk-app-startup` | `profile` | `string` | `'sdk'` | `packages/bundle/sdk-app/src/index.ts` |
| `agent-preset-registry` | `default` | `string` | `'standard'` | `packages/bundle/web-app/cordis.patch.yml` |
| `settings` (dieses Paket) | — | — | **keine Felder** | `packages/settings/settings/README.md` |

Descriptor-Felder eines Namespace: `ns`, `autoGenerate`, `schema`, `value`, `revision`, `base?`, `user?`, `applies: 'live'`, `secrets?` (`packages/settings/settings/src/index.ts`).

### 3.4 Lesen

- `describe(options?)` ist **synchron** und liefert `SettingsDescriptor[]`; Quelle sind `this.ownerContext.configEditor.configuration()` und `entry.fiber.config` (`packages/settings/settings/src/index.ts`).
- Nur Eintraege mit eindeutiger id, aktivem Fiber (`FiberState.ACTIVE`) und vorhandenem Runtime-`Config` erscheinen; nicht-volatile Eintraege werden uebersprungen.
- Wert-Layer: `value` = projizierter laufender Config (`plainConfig(entry.fiber.config)`), `base` = geerbte Layer (`inheritedConfig(runtime, interpolate(ctx, inherited))`), `user` = `override`.
- Revisionen: `revisions` ist ein `Map<string, { raw, revision, ns, autoGenerate }>`; `raw = JSON.stringify([fiber.uid, schema.toJSON(), entry.options.config ?? {}])`; Revision steigt nur, wenn sich `raw` aendert.
- Event `settings/document-updated(ns, revision)` wird bei Wert- oder `autoGenerate`-Aenderung emittiert, ebenso beim Verschwinden eines zuvor aktiven Eintrags.
- Invalidierung: `ctx.on('app-boot/config-reload', …)` sowie `configure()` rufen `invalidate()`, das ueber `queueMicrotask` genau einen `describe()`-Lauf einplant (`scheduled`-Flag, `closed`-Flag).
- **Kein eigener Cache und kein eigener Watcher** in Settings. Der Config-Editor liest seine Kompositionen ausdruecklich ungecacht („compositions are not cached between reads", `packages/boot/config-editor/README.md`).

**Layer-Praesedenz** (aus `readProfilePatches`, `packages/boot/app-boot/src/profile-context.ts`), von unten nach oben: Bundle-Layer der Profil-Manifeste → Profil-Patch (`context.patchPath`) → Home-Patch (`$DSH_HOME/cordis.patch.yml`) → Kommandozeilen-Overlays (`context.overlays`); zusaetzlich wird bei gesetztem `DSH_TELEMETRY_DISABLED` ein `session-telemetry-otel`-Disable-Patch **angehaengt**. Pro Zeile gewinnt der letzte Schreibvorgang (`packages/bundle/base/cordis.patch.yml`).

### 3.5 Schreiben und Config-Editor-Integration

Geschrieben wird von **`@deepseek-ai/dsh-config-editor`** (Service `ctx.configEditor`).

| Operation | Signatur | Quelle |
|---|---|---|
| Ziel-Dokument | `get documentPath(): string` (→ `profileContext.patchPath`) | `packages/boot/config-editor/src/index.ts` |
| Adressierbare Zeilen | `entries(): Entry[]` | ebd. |
| Schichten lesen | `configuration(): Array<{ entry, inherited, override }>` | ebd. |
| Schreiben | `edit(entry, change: (current, inherited) => Record<string, unknown>): Promise<void>` | ebd. |
| Settings-Fassade | `update(ns, patch, expectedRevision?)`, `replace(ns, section, expectedRevision?)`, `mutate(ns, ops, expectedRevision?)` | `packages/settings/settings/src/index.ts` |
| Pfadoperationen | `type SettingsPathOp = { op: 'set'; path; value } \| { op: 'unset'; path }` | ebd. |
| Dokument vorbereiten | `prepareDocument(): Promise<string>` | ebd. |
| Schreibbarkeit | `get writable(): boolean` (konstant `true`) | ebd. |

Ueberdeckte Eintraege werden gesondert komponiert: enthaelt der Profil-Patch eine eigene `config` fuer die id, wird nur diese eigene Ueberdeckung entfernt, Inserts und fremde Ueberdeckungen bleiben wirksam (`packages/boot/config-editor/src/index.ts`, `README.md`).

### 3.6 Validierung, Fehler und `redact.ts`

| Fall | Verhalten | Quelle |
|---|---|---|
| Nicht-JSON-faehige Werte | `cloneJsonShaped` wirft `TypeError` (`Config $ contains a non-plain root`, `… a circular reference`, `… a non-finite number`, `… a <Typ>`); `undefined`-Objektfelder werden uebersprungen, `undefined` in Arrays abgelehnt | `packages/settings/settings/src/index.ts` |
| Unbekannter Namespace | `Error('No configurable plugin entry "<ns>"')` | ebd. |
| Eintrag ohne volatile Felder | `Error('Plugin entry "<ns>" has no volatile fields')` | ebd. |
| Nicht-volatiler Pfad | `Error('Config field "<pfad>" is not volatile')` | ebd. |
| Veraltete Revision | `SettingsConflictError` mit `code = 'SETTINGS_CONFLICT'`, Feldern `expected`/`actual` | ebd. |
| Hoeherer Layer ueberstimmt | `Error('Configuration for "<id>" is overridden by a home patch or command-line overlay')` | `packages/boot/config-editor/src/index.ts` |
| Eintrag waehrend des Reloads verschwunden | `Error('Configuration entry is no longer available')` / `'… changed during reload'` | ebd. |
| Array-Index ausserhalb des Bereichs | `TypeError('Config array index "<head>" is out of range')` | `packages/settings/settings/src/index.ts` |
| Geerbte Layer unvollstaendig | `inheritedConfig` faengt den `resolveConfig`-Fehler und zeigt die Rohwerte als `base` | ebd. |

`redactSecrets(schema, value): RedactedValue` (`packages/settings/settings/src/redact.ts`) entfernt strukturell jedes Feld mit `meta.role === 'secret'`: der Walker rekursiert durch `object` (`dict`), `dict` (`inner`), `array` (`inner`), besucht bei `union`/`intersect` **alle** Zweige und folgt `transform.inner`; der Rueckgabewert ist `{ value, secrets }` mit `RedactedSecret = { path: string[]; set: boolean }`. Objekt-Properties werden immer als Slot gemeldet (auch unbesetzt), Dict-Eintraege und Array-Elemente nur, wenn vorhanden; Positionen werden per `JSON.stringify(path)` dedupliziert und `set` wird OR-verknuepft. Zusaetzlich: `plainSchema` loescht `meta.volatile`, entfernt bei `role === 'secret'` `default` und `required` und redigiert andere Defaults; `volatileForm(schema)` liefert das reine Live-Formular oder `undefined`; `projectForm(schema, value)` projiziert nur schema-deklarierte Felder und laesst `!!js`-Ausdruecke (`__jsExpr`) ganz; `isVolatilePath(schema, path)` prueft Pfade unterhalb eines volatilen Knotens (`packages/settings/settings/src/schema.ts`).

---

## 4. Credentials und Autorisierung

### 4.1 `packages/credentials/credentials` — Seam `ctx.credentials`

Zweck: abstrakte Service-Definition ueber **zwei Schluesselraeume** — `CredentialRef` (POSIX-Name, „was steckt hinter diesem Env-Namen") und `CredentialKey` (`<scope>/<id>`, „welche Credential haelt dieses Plugin fuer diese id") (`packages/credentials/credentials/src/index.ts`). Kein `Config`-Schema. Manifest: `@deepseek-ai/dsh-credentials`, `main: lib/index.js`, Exports `.`, `./types`, `./src/*`, `./package.json` (`packages/credentials/credentials/package.json`).

- **Helfer:** `credentialRef(value: string): CredentialRef` · `isCredentialRefName(value: string): boolean` · `isCredentialKeySegment(value: string): boolean` · `credentialKey(scope: string, id: string): CredentialKey` · `parseCredentialKey(value: string): CredentialKey` · `credentialKeyScope(key): string` · `credentialKeyId(key): string`.
- **Abstrakte API** (`CredentialProvider extends Service`): `resolve(ref): Promise<ResolvedCredential | undefined>`, `describe(ref): Promise<CredentialInfo>`, `set(ref, value): Promise<void>`, `unset(ref): Promise<void>`, `readRecord(key): Promise<CredentialRecord | undefined>`, `describeRecord(key): Promise<CredentialRecordInfo>`, `listRecords(): Promise<readonly CredentialRecordEntry[]>`, `modifyRecord(key, mutate): Promise<CredentialRecord | undefined>`, `deleteRecord(key): Promise<void>`.
- **Record-Union** (`packages/credentials/credentials/src/types.ts`): `ApiKeyRecord = { kind: 'api-key'; key?: string; env?: Record<string,string> }`, `GrantRecord = { kind: 'grant'; payload: unknown }`.
- **Events:** `credentials/reference-updated(ref)`, `credentials/record-updated(key)`; Listener-Fehler werden gefangen und geloggt.
- **Regel:** leerer gespeicherter Wert = nicht vorhanden; ein Record ohne `key` **und** ohne `env` ist eine bewusste Aussage ueber Ambient-Authentifizierung (`packages/credentials/credentials/src/types.ts`).

### 4.2 `packages/credentials/credentials-local` — lokaler Store

Dateibasiertes Provider-Implementat ueber `$DSH_HOME/.credentials.yaml`, geschichtet gegen die Umgebung (`packages/credentials/credentials-local/src/index.ts`).

| Fakt | Wert | Quelle |
|---|---|---|
| Dateiname-Konstante | `CREDENTIALS_FILENAME = '.credentials.yaml'` | `packages/credentials/credentials-local/src/index.ts` |
| Exakter Pfad | `resolve(config.path ?? join(resolveDshHome(config.dshHome), CREDENTIALS_FILENAME))` → `$DSH_HOME/.credentials.yaml` | ebd. |
| Format | YAML, versioniert: `DOCUMENT_VERSION = 1` | ebd. |
| Top-Level-Schluessel | ausschliesslich `version`, `refs`, `records`; jeder andere Schluessel ist ein Fehler | ebd. |
| `refs` | Mapping `CredentialRef` → nicht-leerer String | ebd. |
| `records` | Mapping `<scope>/<id>` → `{ kind: 'api-key', key?, env? }` oder `{ kind: 'grant', payload }` | ebd. |
| Secret-Behandlung | **Klartext** in YAML; keine Hash- oder Verschluesselungsstufe im Paket | ebd., `README.md` |
| Dateimodus | Schreiben `0600`, Verzeichnis `0700` (`writeFileAtomic(..., { mode: 0o600, dirMode: 0o700 })`) | ebd. |
| POSIX-Pruefung | `GROUP_OTHER_BITS = 0o077`; `assertOwnerOnly` wirft mit `chmod 600`-Hinweis; auf `win32` wird die Pruefung uebersprungen | ebd. |
| Migrationskonstante | `renderFlatLayoutMigration(text)` → v1-Text oder `undefined` | ebd. |
| Lock-Wartezeit | `DOCUMENT_LOCK_WAIT_MS = 30_000` | ebd. |

**Record-Lebenszyklus.** (1) Schreiben nur ueber `modifyRecord(key, mutate)`: `mkdir(dirname, { recursive: true, mode: 0o700 })` → `withFileLock(filename, …, { waitMs: 30_000 })` → `reconcileFromDisk()` → `mutate(current)`; `undefined` laesst den Eintrag unberuehrt. (2) Vor dem Rendern wird admittiert: `assertJsonValue` fuer `grant.payload`, `assertStorableApiKey` fuer `api-key` (leerer `key` verboten, `env`-Namen muessen `credentialRef` genuegen, `env`-Werte nicht leer). (3) `renderRecord` ersetzt den Record-Knoten ganz; `deleteRecord` entfernt ihn samt Kopfkommentar (`deleteSectionEntry`). (4) Nach dem Commit: `notifyRecordUpdated(key)`; Referenzschreibvorgaenge nutzen denselben Pfad ueber `write(ref, value)` und `notifyUpdated(ref)`. (5) Disposal: `closed = true`, `await this.operations` (Drain), Watcher `close()` mit nachgehaengtem Error-Listener.

**Watcher.** Bibliothek `chokidar` (`watch as chokidarWatch`), Zielpfad ueber `canonicalizeWatchPath(this.spec.filename)` (`packages/credentials/credentials-local/src/index.ts`, Helper in `packages/util/home-paths/src/index.ts`). Optionen: `ignoreInitial: true`, `awaitWriteFinish: { stabilityThreshold: debounceMs, pollInterval: max(1, min(debounceMs, 10)) }`. Ereignisse: `watcher.on('all', …)` → `queueRefresh()`; `watcher.on('ready', …)` → zusaetzlich `queueRefresh()`; `watcher.on('error', reportWatcherError)`. Debounce-Fenster `debounceMs`, Default `100`. `refresh()` faengt Fehler und haelt den letzten guten Snapshot fest; `reconcileFromDisk()` vergleicht Text mit dem Cache, prueft Permissions erneut, ersetzt beide Snapshots und publiziert genau ein Event pro geaenderter Referenz bzw. Record.

**Drain/Queue-Semantik.** `private operations: Promise<void> = Promise.resolve()` mit `enqueue<T>(op)`: jede Operation haengt sich an die Kette, der Kettenkopf schluckt Fehler (`task.then(() => undefined, () => undefined)`). Entry-Checks werden doppelt geprueft: frueh (disposed, leerer Wert, Environment-Shadowing) und erneut zur Laufzeit in der Queue. `assertUnshadowed(ref, verb)` verweigert `set`/`unset`, wenn die Startumgebung die Referenz liefert.

**Migrationspfad.** `loadInitial()` liest die Datei; erkennt `renderFlatLayoutMigration(text) !== undefined`, laeuft `migrateFlatDocument()` unter dem Writer-Lock (erneutes Lesen, um ein paralleles Boot zu erkennen), schreibt die Version-1-Fassung mit `0600` und loggt `credentials-local: migrated %s to the version %d layout; values are unchanged`. Ein Live-Reload migriert nie (`packages/credentials/credentials-local/src/index.ts`, `README.md`).

**Aufloesungsreihenfolge fuer Referenzen** (exakt aus `resolve()`):

| Rang | Quelle | `source`-Label | Writable |
|---|---|---|---|
| 1 | geerbte Prozessumgebung (`launchEnvironmentOf(ctx).getFrom(ref, ['process'])`) | `'env'` | nein (`describe` → `writable: false`) |
| 2 | Managed Store `$DSH_HOME/.credentials.yaml` (`this.values`) | `'file'` | ja |
| 3 | Projekt-`.env` (`getFrom(ref, ['project-env','user-env'])`, Projekt zuerst) | `'project-env'` | ja |
| 4 | Home-`.env` `$DSH_HOME/.env` | `'user-env'` | ja |
| 5 | nicht gesetzt | – | – |

Die Labels `'process' | 'project-env' | 'user-env'` und `getFrom(name, sources)` stammen aus `packages/util/launch-environment/src/index.ts`. Fuer **Records** gibt es keine Schichtung: `describeRecord` meldet allein die Praesenz (`packages/credentials/credentials-local/src/index.ts`).

### 4.3 `packages/credentials/authorization` — Autorisierungs-Seam

`ctx.authorization`, Registry menschenvermittelter Credential-Beschaffungs-Flows; „the seam owns the conversation, it never owns the protocol" (`packages/credentials/authorization/src/index.ts`). Kein `Config`-Schema. Manifest `main: lib/index.js`, Exports `.`, `./types`, `./src/*`, `./package.json`.

- **Klassen/Fehler:** `AuthorizationError extends HarnessError` (mit `code`), `AuthorizationDeclinedError extends AuthorizationError` (Default-Nachricht `'the authorization prompt was declined'`, Code `DECLINED`), `AuthorizationService extends Service` mit `static inject = ['credentials']`.
- **Entscheidungstypen:** Es gibt **keine** allow/deny/ask-Regeln. Ergebnis eines Versuchs ist `AuthorizationOutcome = { status: 'authorized' | 'cancelled' }`; fuer Beobachter existiert zusaetzlich `AuthorizationSettlement = AuthorizationStatus | 'failed'` — ein Fehler erreicht den Aufrufer als geworfene Exception, `failed` gibt es nur im Event-Stream (`packages/credentials/authorization/src/types.ts`).
- **Fehlercodes:** aus `begin()`: `NO_FLOW`, `UNKNOWN_METHOD`, `ALREADY_IN_FLIGHT`, `NOT_COMMITTED`; aus `registerFlow()`: `DUPLICATE_FLOW`; aus `commit()`: `CANCELLED`.
- **Regel-Matching / Autorisierungsgegenstand:** die Registrierung ist der `CredentialKey` des Records, den der Flow schreibt — ein Flow pro Key; `scope` benennt das besitzende Plugin, `id` dessen Adressierungseinheit.
- **Persistenz der Entscheidung:** kein eigener Store — der Flow committet ueber `ctx.credentials.modifyRecord(flow.key, …)`; die Seam bestaetigt einen **waehrend** des Versuchs beobachteten Commit (`ctx.on('credentials/record-updated', …)`) und prueft danach `describeRecord(key).configured`.
- **Exponierte API:** `registerFlow(flow: AuthorizationFlow): () => void` · `list(): readonly AuthorizationEntry[]` · `describe(key: CredentialKey): AuthorizationEntry | undefined` · `cancel(key: CredentialKey): void` · `begin(request: AuthorizationRequest): Promise<AuthorizationOutcome>`.
- `AuthorizationSession`: `readonly method: string`, `readonly signal: AbortSignal`, `commit(record: CredentialRecord): Promise<void>`, `notify(notice: AuthorizationNotice): void`, `prompt(prompt: AuthorizationPrompt): Promise<string>`.
- `AuthorizationInteraction`: `notify(notice): void`, `prompt(prompt): Promise<string>`; `AuthorizationRequest`: `{ key, method?, interaction, signal? }`.
- **Prompt-Arten:** `kind: 'text' | 'secret' | 'select'` (mit `message`, optional `placeholder`, bei `select` `options: AuthorizationPromptOption[]`), gemeinsames optionales `signal` (`packages/credentials/authorization/src/types.ts`).
- **Event:** `authorization/settled(key: CredentialKey, settlement: AuthorizationSettlement)` — feuert fuer **jeden** terminalen Ausgang inkl. `failed`, nach Freigabe des Keys.

### 4.4 `packages/credentials/deepseek-account` — Account-Service-Definition

Transportneutrale Account-Seam `ctx.deepseekAccount` fuer Platform-, API- und Modell-Konsumenten (`packages/credentials/deepseek-account/src/index.ts`). Kein `Config`-Schema.

- **Abstrakte API** (`DeepSeekAccount extends Service`): `getState()`, `getProfile(client)`, `getBalance(client)`, `getUnnotifiedBonuses(client)`, `ackBonusNotified(accountId, orderId, client)`, `startSignIn(client, callbackOrigin, loginSource)`, `cancelSignIn(id)`, `signOut(client)`, `watch(signal): AsyncIterable<AccountView>`, `resolveToken(url): Promise<string | undefined>`, `rejectToken(token)`, `getPlatformSession()`, `getDeviceIdentity()`.
- **Header-/Client-Helfer:** `mergePlatformCookies(base, override): string`; `desktopClientHeaders(platform): Record<string,string>` (`x-client-platform: desktop-win | desktop-mac`); `platformClientHeaders(platform, client): Record<string,string>` (setzt `x-client-bundle-id: ''`, `x-client-platform: 'web'`, ueberschreibt bei Desktop, `x-client-version`, `x-client-locale`, `x-client-timezone-offset`); `platformWireLocale(locale): 'zh_CN' | 'en_US'`.
- **Account-Tasks** (`packages/credentials/deepseek-account/src/account-tasks.ts`): `isRunningAccountTask(agent): boolean` (Status `running` **und** `session.requestContext()?.provider === 'deepseek-account'`); `installAccountTaskCancellation(ctx)` bricht laufende Account-Tasks bei `deepseek-account/signed-out` mit `agent.cancel({ kind: 'hook', reason: 'deepseek-account/signed-out' }, { keepInbox: true })` ab und uebersetzt `LlmError` mit Code `ACCOUNT_SIGN_IN_REQUIRED` in `deepseek-account/model-sign-in-required`.
- **Events:** `deepseek-account/signed-out()`, `deepseek-account/session-expired()`, `deepseek-account/model-sign-in-required()`.
- **Fehlercodes:** `SignInErrorCode = 'no-response' | 'network' | 'protocol' | 'expired' | 'storage'`; Phasen `'initializing' | 'waiting-browser' | 'exchanging' | 'committing' | 'succeeded' | 'cancelled' | 'expired' | 'failed'` (`packages/credentials/deepseek-account/src/types.ts`).

### 4.5 `packages/credentials/deepseek-account-platform` — OAuth/PKCE und Kontodaten

**Config:** siehe Tabelle in Abschnitt 3.3 (`platformOrigin`, `desktopPlatform`, `embeddedPageDist`, `inferenceOrigin`, `allowLoopbackHttp`, `rewriteBrowserOrigin`, `requestHeaders`, `accountRequestHeaders`, `requestTimeoutMs`, `balanceTimeoutMs`, `logoutMaxRetries`, `logoutRetryDelayMs`, `attemptTimeoutMs`). `desktopPlatform` wird im Base-Bundle per `!!js`-Ausdruck an das `desktop`-Profil gebunden (`packages/bundle/base/cordis.patch.yml`).

**Credential-Records dieses Providers:**

| Fakt | Wert | Quelle |
|---|---|---|
| Grant-Key | `KEY = credentialKey('deepseek-account-platform', 'default')` | `packages/credentials/deepseek-account-platform/src/index.ts` |
| Device-Key | `DEVICE = credentialKey('deepseek-account-platform', 'device')` | ebd. |
| Grant-Payload-Schema | `z.object({ version: z.literal(1), token: z.string().min(1), issuer: z.url() })` | ebd. |
| Device-Payload-Schema | `z.object({ id: z.uuid() })` | ebd. |
| Speicherort | im `records`-Abschnitt von `$DSH_HOME/.credentials.yaml`, Klartext (`kind: grant`, `payload`) | `packages/credentials/credentials-local/src/index.ts`, `…/deepseek-account-platform/src/index.ts` |
| Issuer-Bindung | beim Init wird ein Grant mit fremdem `issuer` lokal geloescht; `resolveToken` verweigert fremde Issuer und `dsh_mock_`-Tokens | `…/deepseek-account-platform/src/index.ts` |

**OAuth-/PKCE-Flow** — es gibt **keinen** Device-Code-Flow; das „Device" ist nur eine persistierte UUID-Identitaet:

| Schritt | Detail | Quelle |
|---|---|---|
| Verifier/Challenge | `verifier = randomBytes(32).toString('base64url')`; `challenge = sha256(verifier).base64url`; `code_challenge_method: 'S256'` | `packages/credentials/deepseek-account-platform/src/index.ts` |
| `state` | `randomBytes(32).toString('base64url')`, Vergleich mit `timingSafeEqual` | ebd. |
| Callback-Route | `webServer.register({ kind: 'exact', path: '/oauth/callback', … })`, nur `GET`, genau ein `code` und ein `state` | ebd. |
| Lokale Redirect-URI | ``${attempt.origin}/oauth/callback`` mit `attempt.origin = loginOrigin(callbackOrigin)` (loopback HTTP mit explizitem Port) | ebd., `src/protocol.ts` |
| Plattform-API-Basis | `${origin}/auth-api/v0/dsh/${method}` als POST | `src/protocol.ts` |
| Methoden | `auth_init`, `auth_exchange`, `auth_cancel` | `src/index.ts` |
| `auth_init` Request | `{ code_challenge, code_challenge_method: 'S256', state, redirect_uri, locale, login_source }` | ebd. |
| `auth_init` Response | `{ authorize_url: url, authorize_id: string.min(1), expires_in: number.positive }` | `src/protocol.ts` |
| Browser-Seite | validiert auf fixen Pfad `/dsh/authorize` derselben Origin (optional Origin-Rewrite) | `src/protocol.ts`, `src/index.ts` |
| `auth_exchange` Request | `{ code, code_verifier, redirect_uri, device_id, device_model, os_version }` | `src/index.ts` |
| `auth_exchange` Response | `{ token (druckbares ASCII), authorized_url: url, user? }` | `src/protocol.ts` |
| Completion-URL | `/dsh/authorized` auf der Plattform-Origin, ergaenzt `login_source` | `src/index.ts` |
| Polling-Intervall | **kein Polling** — der Flow wartet auf `code.promise` aus der Callback-Route; Zeitsteuerung nur ueber Deadline | ebd. |
| Fristen | `attemptTimeout` (Default `600000` ms) bzw. `Math.min(attemptTimeout, auth_init.expires_in * 1000)`; Ablauf → `PlatformAuthError('expired')` | ebd. |
| Abbruch | `POST auth_cancel` mit `{ authorize_id, code_verifier }` im Hintergrund, Fehler werden ignoriert | ebd. |
| Fehlerklassen | `PlatformAuthError` (stabiler `code`), `AccountUnauthorizedError` (HTTP 401 oder `code: 40003`) | `src/protocol.ts` |
| Antwortgrenzen | Body-Limit `65_536` Bytes, `redirect: 'error'`, Envelope `{ code: 0, data: { biz_code, biz_data } }`, `biz_code !== 0` → Protokollfehler | `src/protocol.ts` |

**Token-Speicherung, Refresh, Logout.** Speicherung als `{ kind: 'grant', payload: { version: 1, token, issuer: this.origin } }` ueber `session.commit(...)` → `ctx.credentials.modifyRecord(KEY, …)`. **Kein Refresh-Flow:** „Account tokens have no expiry or refresh flow" (`packages/credentials/deepseek-account-platform/README.md`); ein 401 bzw. `40003` fuehrt zum Loeschen des lokalen Grants und zu `deepseek-account/session-expired`. `signOut`: lokalen Grant loeschen → `ctx.emit('deepseek-account/signed-out')` → Hintergrund-Revocation mit den Client-Headern.

Logout-Semantik (`packages/credentials/deepseek-account-platform/src/logout.ts`): `revokeAccount(origin, token, policy, signal, headers)` versucht `maxRetries + 1` Male, Delay `delayMs * 2 ** (attempt - 1)` (1, 2, 4, 8, 16 s bei Defaults), pro Versuch `AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)])`; jeder Fehler verbraucht einen Versuch **ohne** Credentials wiederherzustellen. Logout-Endpunkt: `POST ${origin}/auth-api/v0/users/logout` mit `x-dsh-auth-token` (`src/protocol.ts`).

Konto-Endpunkte (`src/protocol.ts`, `src/details.ts`): `GET /auth-api/v0/users/current` (Profil), `GET /api/v0/users/get_user_summary` (Wallets), `GET /api/v0/users/get_unnotified_bonuses`, `POST /api/v0/users/ack_bonus_notified` mit `{ order_id }`. Reservierte Header (`authorization`, `x-dsh-auth-token`, `host`, `content-length`, `transfer-encoding`, `connection`, `content-type`) werden in `platformHeaders` abgelehnt. Wallet-Decimal-Grammatik: `^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$` (Waehrungen `CNY`/`USD`), Bonus-`order_id` als UUID. `packages/credentials/deepseek-account-platform/src/types.ts` ist eine reine Re-Export-Fassade.

### 4.6 `packages/identity/anonymous-user-id`

| Aspekt | Befund | Quelle |
|---|---|---|
| Manifest | `@deepseek-ai/dsh-anonymous-user-id`, `main: lib/index.js`, Exports `.`, `./src/*`, `./package.json` | `packages/identity/anonymous-user-id/package.json` |
| Zweck | anonyme, **pro Harness-Home** stabile Kennung zur Korrelation von Telemetrie, Feedback und DeepSeek-Anfragen | `packages/identity/anonymous-user-id/README.md` |
| `Config`-Schema | **keines**; Optionen sind Funktionsparameter | `packages/identity/anonymous-user-id/src/index.ts` |
| Exporte | `type AnonymousUserId`, `const ANONYMOUS_USER_ID_FILE_NAME = '.anonymous-user-id'`, `interface AnonymousUserIdOptions { env?: NodeJS.ProcessEnv; randomUUID?: () => string }`, `getOrCreateAnonymousUserId(options?): AnonymousUserId` | ebd. |
| Algorithmus | `crypto.randomUUID()` (UUID v4); Entropiequelle ist ausschliesslich der CSPRNG von Node, testbar ueber `options.randomUUID` | ebd. |
| Validierung | `UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` auf den getrimmten Dateiinhalt | ebd. |
| Persistenzpfad | `join(resolveDshHome(undefined, options.env ?? process.env), ANONYMOUS_USER_ID_FILE_NAME)` → `$DSH_HOME/.anonymous-user-id` | ebd. |
| Dateiformat | nackte UUID-Zeile plus `\n`, UTF-8, keine Wrapper-Struktur | ebd. |
| Nebenlaeufigkeit | Erstschreiben mit `flag: 'wx'`; `EEXIST`/Fehler → Reread (`readPersistedId`), bei ungueltigem Reread Ueberschreiben ohne `wx` | ebd. |
| Memoisierung | `const memo = new Map<string, AnonymousUserId>()`, Schluessel ist der aufgeloeste Dateipfad | ebd. |
| Fehlertoleranz | Persistenz ist Best-Effort: ein Schreibfehler liefert trotzdem eine ID fuer diesen Lauf | ebd., `README.md` |
| Verwendung | OTel-Resource-Attribut `user.id`; Feedback-Bestaetigung; HTTP-Header `x-deepseek-harness-user-id` bei DeepSeek-Provider-Anfragen | `packages/identity/anonymous-user-id/README.md` |
| Nicht-Zweck | keine Nutzeridentifikation, keine Verkettung ueber verschiedene Homes hinweg | ebd. |

---

## 5. Home-Verzeichnis, Pfade und die vollstaendige Umgebungsvariablen-Tabelle

### 5.1 `util/home-paths` — Package und Exporte

`@deepseek-ai/dsh-home-paths`, Version `0.2.1-alpha.2`, **nicht** `private`, `"type": "module"`, `main: lib/index.js`, `types: lib/types/index.d.ts`, `exports`: `"."`, `"./src/*"`, `"./package.json"`; `peerDependencies: { "@deepseek-ai/cordis": "workspace:~" }` (`packages/util/home-paths/package.json`).

| Export | Signatur |
|---|---|
| `DSH_HOME_DIR_NAME` | `string = '.dsh'` |
| `DEFAULT_DSH_HOME_DISPLAY` | `string = '~/.dsh'` |
| `DSH_HOME_ENV` | `string = 'DSH_HOME'` |
| `AGENTS_HOME_DIR_NAME` | `string = '.agents'` |
| `DEFAULT_AGENTS_HOME_DISPLAY` | `string = '~/.agents'` |
| `AGENTS_HOME_ENV` | `string = 'DSH_AGENTS_HOME'` |
| `canonicalizeWatchPath` | `canonicalizeWatchPath(path: string): Promise<string>` |
| `defaultDshHome` | `defaultDshHome(): string` |
| `defaultAgentsHome` | `defaultAgentsHome(): string` |
| `expandHomePath` | `expandHomePath(path: string): string` |
| `resolveDshHome` | `resolveDshHome(configured?: string, env: Record<string, string \| undefined> = process.env): string` |
| `resolveAgentsHome` | `resolveAgentsHome(configured?: string, env: Record<string, string \| undefined> = process.env): string` |
| `dshHomePath` | `dshHomePath(...segments: string[]): string` |
| `dshCachePath` | `dshCachePath(optionsOrSegment?: { dshHome?: string } \| string, ...segments: string[]): string` |
| `dshHomeDisplay` | `dshHomeDisplay(resolvedHome: string): string` |
| `agentsHomeDisplay` | `agentsHomeDisplay(resolvedHome: string): string` |

(alle `packages/util/home-paths/src/index.ts`; die privaten Helfer `resolveRoot` und `rootDisplay` sind **nicht** exportiert.)

### 5.2 (a) Exakter Algorithmus der Home-Aufloesung

Beide Roots laufen durch dieselbe private Funktion `resolveRoot(configured, env, envName, fallback)` (`packages/util/home-paths/src/index.ts:101-110`). Die Pruefreihenfolge ist exakt:

1. `const fromEnv = env[envName]` — der Env-Wert wird **nur** gelesen, nicht mutiert.
2. `const selected = configured ?? (fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : fallback())`.
3. `return resolve(expandHomePath(selected))` — `resolve` aus `node:path`, also Normalisierung zu einem absoluten Pfad relativ zum aktuellen Arbeitsverzeichnis.

Damit gilt fuer das Harness-Home, hoechste Prioritaet zuerst (`packages/util/home-paths/src/index.ts:135-137`):

| Rang | Quelle | Verhalten |
|---|---|---|
| 1 | explizites `configured`-Argument | gewinnt immer, sobald es nicht `null`/`undefined` ist (`??`) |
| 2 | `$DSH_HOME` | nur wenn `fromEnv !== undefined` **und** `fromEnv.trim().length > 0` |
| 3 | `defaultDshHome()` = `join(homedir(), '.dsh')` | `homedir()` aus `node:os` |

Fuer den geteilten Agent-Root analog mit `$DSH_AGENTS_HOME` → `join(homedir(), '.agents')` (`packages/util/home-paths/src/index.ts:151-153`).

**Plattform.** `homedir()`, `join` und `resolve` folgen den Node-Plattformregeln; es gibt **keine** plattformspezifische Verzweigung im Paket — `process.platform` wird in `home-paths` nirgends gelesen. Es gibt **keinen** XDG-Pfad: keine der Variablen `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME` wird in diesem Paket konsultiert. XDG erscheint nur bei Konsumenten bzw. Nachbarpaketen: `XDG_DATA_HOME`/`XDG_DATA_DIRS` in `packages/util/native-command/src/desktop-entry.ts:36-37` und `XDG_` als verbotenes Bootstrap-Praefix in `packages/boot/app-boot/src/index.ts:158`.

**Verhalten leerer Env-Werte.** Ein leerer oder nur aus Leerzeichen bestehender Env-Wert gilt als *nicht gesetzt* (`fromEnv.trim().length > 0`), das Home faellt also auf `~/.dsh` zurueck — bestaetigt durch `packages/util/home-paths/tests/home-paths.spec.ts:49-52`, `:79-82` und `:90-92`. Ein blanker Override loest das Home also **nie** auf das aktuelle Arbeitsverzeichnis auf (`packages/util/home-paths/src/index.ts:128-130`). **Wichtige Asymmetrie:** das gilt **nur** fuer den Env-Wert. Das `configured`-Argument wird mit `??` geprueft, also gewinnt ein explizit uebergebener Leerstring `''`, und `resolve(expandHomePath(''))` ergibt `resolve('')` = aktuelles Arbeitsverzeichnis. Ebenso wird ein relativer Env-Wert gegen das cwd aufgeloest (`packages/util/home-paths/tests/home-paths.spec.ts:94`: `'./relative-dsh'` → `resolve('./relative-dsh')`).

**Tilde-Expansion** (`expandHomePath`, `packages/util/home-paths/src/index.ts:87-91`) — genau drei Faelle: `'~'` → `homedir()`; Praefix `'~/'` oder `'~\\'` → `join(homedir(), path.slice(2))`; alles andere unveraendert. Benannte Nutzerformen wie `~alice/...` bleiben unangetastet, ebenso `$VAR` oder Shell-Ausdruecke (Limit dokumentiert in `packages/util/home-paths/README.md:112`).

| Export | Exakt gebauter Pfad |
|---|---|
| `defaultDshHome()` | `join(homedir(), '.dsh')` |
| `defaultAgentsHome()` | `join(homedir(), '.agents')` |
| `expandHomePath(p)` | `'~'` → `homedir()`; `'~/…'`/`'~\\…'` → `join(homedir(), p.slice(2))`; sonst `p` |
| `resolveDshHome(configured?, env?)` | `resolve(expandHomePath(configured ?? (nicht-blankes `$DSH_HOME`) ?? `~/.dsh`))` |
| `resolveAgentsHome(configured?, env?)` | analog mit `$DSH_AGENTS_HOME` und `~/.agents` |
| `dshHomePath(...segments)` | `join(resolveDshHome(), ...segments)`; ohne Segmente das Home selbst |
| `dshCachePath(...)` | Objektform: `join(resolveDshHome(o.dshHome), 'cache', ...segments)`; Stringform: `dshHomePath('cache', arg0, ...segments)` |
| `canonicalizeWatchPath(p)` | `realpath` des tiefsten existierenden Vorfahren + wiederhergestelltes fehlendes Suffix |
| `dshHomeDisplay(h)` | `'~/.dsh'` wenn `h === resolve(defaultDshHome())`, sonst `'$DSH_HOME'` |
| `agentsHomeDisplay(h)` | `'~/.agents'` wenn `h === resolve(defaultAgentsHome())`, sonst `'$DSH_AGENTS_HOME'` |

`dshCachePath` erzeugt keine Verzeichnisse (`packages/util/home-paths/README.md:41`). `canonicalizeWatchPath` beweist bei fehlendem Suffix, dass der aufgeloeste Vorfahre ein *enumerierbares Verzeichnis* ist (`opendir` + `close`), wirft Fehler ausser `ENOENT` weiter und liefert `ENOTDIR`, wenn ein regulaerer Datei-Vorfahre ein Kind haben soll (`packages/util/home-paths/src/index.ts:42-64`; Test `tests/home-paths.spec.ts:117-134`). Die Anzeige-Funktionen geben nie einen absoluten Pfad zurueck (`src/index.ts:176-181`, `:188-193`).

### 5.3 (b) Baum des Harness-Home

`home-paths` selbst garantiert nur das Wurzelverzeichnis. Der folgende Baum listet jeden Eintrag, den ein Konsument nachweislich unter dem aufgeloesten Home bildet — mit Quelle pro Eintrag:

```
$DSH_HOME/                                  home-paths: resolveDshHome()
├── .env                                    boot/app-boot: user-env-Layer (loadLayeredEnv)
├── AGENTS.md                               context/agent-instructions: join(root.home, USER_GLOBAL_FILE)
├── .anonymous-user-id                      identity/anonymous-user-id: ANONYMOUS_USER_ID_FILE_NAME
├── .credentials.yaml                       credentials/credentials-local: CREDENTIALS_FILENAME
├── cordis.patch.yml                        apps/cli/src/profile-boot.ts: Home-Level-User-Patch-Layer
├── logs/                                   apps/cli/src/startup-diagnostics.ts (mkdir mode 0o700)
│   └── startup-<ISO-mit-Bindestrichen>-<uuid>.log   (writeFile flag 'wx', mode 0o600)
├── sessions/                               bundle/base/cordis.patch.yml: dshHomePath('sessions')
├── storages/                               bundle/base/cordis.patch.yml: dshHomePath('storages')
├── skills/                                 skill/skill-filesystem: join(this.dshHome, 'skills')
├── attachments/v1/                         attachment/attachment-local: join(dshHome, 'attachments', 'v1')
├── cache/                                  home-paths: dshCachePath()
│   └── attachments/                        attachment-local: dshCachePath({dshHome}, 'attachments')
│       └── request-images/…                attachment-local: <cache>/attachments/request-images/<2-Zeichen>/<hash>
├── llm-deepseek/files-v3.json              llm/llm-deepseek: join(resolveDshHome(), 'llm-deepseek', 'files-v3.json')
├── speech-to-text/sensevoice/              experimental/voice-input-bundle/cordis.patch.yml
└── profiles/                               boot/app-boot: PROFILES_DIR = 'profiles'
    ├── node_modules/                       boot/app-boot: Interception-Layer der Runtime-Aufloesung
    ├── <name>/                             boot/app-boot: resolveProfileDir(name, home)
    │   ├── cordis.yml                      boot/app-boot config-schema/collect.ts
    │   ├── package.json, pnpm-lock.yaml    boot/plugin-manager operations.ts (pnpm-Lauf)
    │   ├── node_modules/                   boot/plugin-manager: profil-lokale Pakete
    │   └── .plugin-manager/logs/           boot/plugin-manager operations.ts (mkdir mode 0o700)
    │       └── operation-<mkdtemp>/pnpm.log   (open 'wx', mode 0o600)
    └── desktop/{,lock}                     apps/desktop/src/paths.ts: resolveDesktopPaths()
```

Jeder Profilordner erhaelt beim ersten Oeffnen ausserdem `cordis.patch.yml` (aus `PROFILE_PATCH_TEMPLATE`), `package.json` (mit `dsh.profile.bundles`) und `pnpm-workspace.yaml` (aus `PROFILE_PNPM_WORKSPACE` mit `nodeLinker: hoisted`, `autoInstallPeers: false`); ein Altbestand kann `.dsh-module-fallback/` enthalten, das `removeLinkProjections` entfernt (`packages/boot/app-boot/src/profile.ts:237-300`).

Quellen im Einzelnen: `packages/util/home-paths/src/index.ts:12,135,160,170-172`; `packages/boot/app-boot/src/index.ts:194,240,244`; `packages/context/agent-instructions/src/files.ts:337` und `src/render.ts:122`; `packages/identity/anonymous-user-id/src/index.ts:29,69`; `packages/credentials/credentials-local/src/index.ts:61,90`; `apps/cli/src/profile-boot.ts:68-70`; `apps/cli/src/startup-diagnostics.ts:58-62`; `packages/bundle/base/cordis.patch.yml:136,180`; `packages/skill/skill-filesystem/src/index.ts:256`; `packages/attachment/attachment-local/src/index.ts:176-177`; `packages/llm/llm-deepseek/src/upload-index.ts:119`; `packages/experimental/voice-input-bundle/cordis.patch.yml:9`; `packages/boot/app-boot/src/profile.ts:37,169-176,452`; `packages/boot/plugin-manager/src/operations.ts:290-294`; `apps/desktop/src/paths.ts:17-21`.

Der geteilte Agent-Root ist ein *eigener* Baum: `$DSH_AGENTS_HOME/AGENTS.md` (`packages/context/agent-instructions/src/files.ts:337`) und `$DSH_AGENTS_HOME/skills/` (`packages/skill/skill-filesystem/src/index.ts:257`).

**Projekt- und Workspace-Ebene.** Ein projektlokales Verzeichnis wird relativ zur **Projektwurzel** gebildet, die ueber Marker gefunden wird: `DEFAULT_PROJECT_ROOT_MARKERS = ['.git']` (`packages/context/agent-instructions/src/config.ts:11`). Daraus entstehen `<projectRoot>/.dsh/skills` (source `project-dsh`) und `<projectRoot>/.agents/skills` (source `project-agents`) in `packages/skill/skill-filesystem/src/index.ts:249-250`; die Instruction-Datei-Kandidaten der Projekt-Ebene sind `AGENTS.md`, `CLAUDE.md` und lokal `AGENTS.local.md`, `CLAUDE.local.md` (`packages/context/agent-instructions/src/config.ts:12-13`). Ein **`.pmh`**-Verzeichnis existiert im Quellbaum nicht: eine Suche ueber `packages` und `apps` nach `pmh` liefert keinen Treffer. Workspace-Pfadaufloesung passiert rein lexikalisch in `packages/util/workspace-path`.

### 5.4 (c) Vollstaendige Tabelle der Umgebungsvariablen

Methode: systematischer Durchlauf aller `packages/*/*/src/**/*.ts` (2091 Dateien in 331 `src`-Verzeichnissen) und aller `*.yml`/`*.yaml` unter `packages/` und `apps/` nach `process.env.X`, `process.env['X']`, `<envRecord>.X`, `<envRecord>['X']`, nach Konstanten mit Env-Namensform (`*_ENV`) sowie nach Literalen in Env-Namensform. Zusaetzlich wurden `apps/` und `scripts/` durchsucht. Die folgende Tabelle ist die konsolidierte, vollstaendige Liste.

#### 5.4.1 Variablen, die `packages/` liest, setzt oder validiert

| Variable | Lesendes Paket / Datei | Bedeutung |
|---|---|---|
| `DSH_HOME` | `packages/util/home-paths` (`DSH_HOME_ENV`); `packages/shell/shell-env`; `packages/skill/skill-filesystem`; `packages/credentials/credentials-local`; `packages/identity/anonymous-user-id`; `packages/boot/app-boot`; `packages/attachment/attachment-local`; `packages/llm/llm-deepseek` (`upload-index.ts`); `packages/sdk/client`; `packages/test-support/*` | Wurzel aller Nutzerdaten; Override des Defaults `~/.dsh`. In `shell-env` als reservierter `DSH_*`-Schluessel und als Bash-Variable `DSH_HOME` exponiert |
| `DSH_AGENTS_HOME` | `packages/util/home-paths` (`AGENTS_HOME_ENV`); `packages/skill/skill-filesystem`; `packages/test-support/*` | Wurzel der mit anderen Agent-Tools geteilten Konfiguration; Override des Defaults `~/.agents` |
| `DSH_SHELL` | `packages/shell/shell-env` (gesetzt, nicht gelesen) | Marker `'1'` fuer jeden Modell-Shell-Aufruf |
| `DSH_SESSION_ID` | `packages/shell/shell-env` (gesetzt) | id der aktiven Session als Bash-Variable |
| `DSH_PROFILE` | `packages/shell/shell-env` (gesetzt) | Name des aktiven Profils (`profileContext.name`) |
| `DSH_PROFILE_DIR` | `packages/shell/shell-env` (gesetzt) | Verzeichnis des aktiven Profils (`profileContext.dir`) |
| `DSH_TELEMETRY_DISABLED` | `packages/boot/app-boot/src/profile-context.ts`; `packages/extensions/tool-cordis/src/api-catalog.ts` | Jeder nicht-leere Wert (auch `'0'`/`'false'`) deaktiviert die OTel-Zeile `session-telemetry-otel` |
| `DSH_TELEMETRY_MODE` | `packages/bundle/base/cordis.patch.yml` (`!!js process.env.DSH_TELEMETRY_MODE \|\| 'FEEDBACK_ONLY'`) | Modus der Session-Telemetrie |
| `DSH_TELEMETRY_OTLP_URL` | `packages/bundle/base/cordis.patch.yml` | OTLP-Endpunkt; Default `https://dsh-otel-collector.deepseeksvc.com/v1/logs` |
| `DSH_PRODUCT_ANALYTICS_OTLP_URL` | `packages/bundle/web-app/cordis.patch.yml` | OTLP-Endpunkt der Produktanalytik |
| `DSH_PERMISSION_MODE` | `packages/bundle/base/cordis.patch.yml`; `packages/subagent/subagent-acp/src/run.ts` | Sandbox-/Approval-Preset (`read-only` \| `workspace-write` \| `danger-full-access`), Default `workspace-write` |
| `DSH_TOOLS_MODE` | `packages/bundle/web-app/cordis.patch.yml`, `packages/bundle/headless/cordis.patch.yml` | Praesentationsmodus der Tool-Registry |
| `DSH_SNAPSHOT` | `packages/boot/app-boot/src/index.ts` (`resolveConfigPath`); `packages/test-support/llm-replay/src/index.ts`; `packages/test-support/session-snapshot/src/*` | Snapshot-Modus; nur `'replay'` tauscht `cordis.yml` gegen `cordis.snapshot.yml` |
| `DSH_SNAPSHOT_FILE` | `packages/test-support/llm-replay/src/index.ts` | Fixture-Datei fuer den Replay-Transport |
| `DSH_SNAPSHOT_OVERRIDE` | `packages/test-support/llm-replay/src/index.ts` | Override der Snapshot-Aufloesung |
| `DSH_SNAPSHOT_CHILD_FILES` | `packages/test-support/llm-replay/src/index.ts` | Liste der Kind-Fixtures |
| `DSH_EXAMPLE_MODE` | `packages/test-support/loader-smoke/src/index.ts` (`EXAMPLE_MODE_ENV`) | Beispielmodus der Loader-Smoke-Tests |
| `DSH_WEB_URL` | `packages/bundle/web-app/src/index.ts`, `src/startup.ts` | Veroeffentlichte Web-URL als Bash-Variable |
| `DSH_WEB_SEARCH_PROVIDER` | `packages/web/web/src/index.ts` | Default-Suchprovider, wenn `config.searchProvider` fehlt |
| `DSH_WEB_FETCH_PROVIDER` | `packages/web/web/src/index.ts` | Default-Fetchprovider, wenn `config.fetchProvider` fehlt |
| `DSH_PRIMARY_RUNTIME` | `packages/bundle/sdk-app/cordis.patch.yml` | Pfad der Primary-Runtime |
| `DSH_BUNDLED_PRIMARY_RUNTIME` | `packages/bundle/sdk-app/cordis.patch.yml` | Mitgelieferte Primary-Runtime |
| `DSH_BUNDLED_OFFICE_CLI` | `packages/bundle/sdk-app/cordis.patch.yml` | Mitgelieferte Office-CLI |
| `DSH_BUNDLED_OFFICE_NODE` | `packages/bundle/sdk-app/cordis.patch.yml` | Mitgeliefertes Office-Node |
| `DSH_BUNDLED_OFFICE_SKILLS` | `packages/bundle/sdk-app/cordis.patch.yml` | Mitgelieferte Office-Skills |
| `DSH_MAX_TOKENS_AS_SUCCESS` | `packages/bundle/sdk-app/cordis.patch.yml` | JSON-RPC-Server: `maxTokens` als Erfolg werten |
| `DSH_CONTEXT_WINDOW` | `packages/bundle/sdk-minimal/cordis.patch.yml` | Kontextfenster des `llm-deepseek`-Adapters; Default `1000000` |
| `DSH_SYSTEM_PROMPT` | `packages/bundle/sdk-minimal/cordis.patch.yml` | `personaPrefix` der System-Prompt-Zeile |
| `DSH_SUBPROCESS_CONTROL` | `packages/subprocess/subprocess/src/control.ts` (`SUBPROCESS_CONTROL_ENV`); gelesen in `packages/sandbox/sandbox-windows-acl/src/runner.ts` | Steuernamespace der Subprozess-Verwaltung |
| `DSH_SUBPROCESS_RUNNER` | `packages/subprocess/subprocess-local/src/runner-launch.ts` (`SUBPROCESS_RUNNER_ENV`); `packages/ssh/ssh-helper-runtime/src/index.ts` | Kennzeichnet den lokal gestarteten Runner-Prozess |
| `DSH_BUNDLED_SKILL_DIR` | `packages/skill/skill-filesystem/src/index.ts` | Verzeichnis mit mitgelieferten Skills |
| `DSH_PTC_RUNTIME_NODE` | `packages/ssh/ssh-helper-runtime/src/index.ts` | Node-Binary fuer die PTC-Runtime |
| `DSH_SPEECH_TOKEN` | `packages/experimental/speech-to-text-sensevoice/src/worker.ts` | 64-stelliger Hex-Token; wird nach dem Lesen geloescht |
| `DSH_DIALOG_TITLE` | `packages/host/directory-picker-native/src/win32-dialog-worker.ts` | Fenstertitel des nativen Win32-Verzeichnisdialogs |
| `DSH_PROCESS_INFORMATION` | `packages/subprocess/win32-process/src/ffi.ts` | FFI-Bindung an `PROCESS_INFORMATION` |
| `DSH_STARTUPINFOW` | `packages/subprocess/win32-process/src/ffi.ts` | FFI-Bindung an `STARTUPINFOW` |
| `DSH_ENV_PREFIX` | `packages/subprocess/subprocess/src/types.ts` (`DSH_ENV_PREFIX = 'DSH_' as const`) | **Praefix**, kein Wert: definiert den Typ `DshEnvironmentKey`. Subprozesse verwerfen jeden Schluessel mit diesem Praefix (`packages/subprocess/subprocess/src/index.ts:69`) |
| `DSH_CLIENT_BUILD_PROFILE` | `packages/client/ui-brand-official/src/client/index.ts` | Build-Profil des Clients; nur `'official'` aktiviert das Branding |
| `DSH_CLIENT_COMMIT_HASH` | `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | Commit-Hash fuer die Sidebar-Anzeige |
| `DSH_CLIENT_GIT_DIRTY` | `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | Dirty-Marker des Arbeitsbaums |
| `DSH_CLIENT_TITLE` | `packages/client/ui-layout/src/client/AppFrame.tsx`; `packages/bundle/web-app/cordis.patch.yml` | Dokumenttitel des Clients |
| `DSH_CLIENT_VERSION` | `packages/client/ui-settings-account/src/client/index.ts`; `ui-settings-general/src/client/CurrentVersionRow.tsx`; `ui-sidebar/src/client/SidebarRoot.tsx`; `packages/bundle/web-app/cordis.patch.yml` | Versionsanzeige des Clients |
| `DEEPSEEK_API_KEY` | `packages/credentials/credentials/src/index.ts`; `credentials-local/src/index.ts`; `packages/llm/llm-deepseek-api-key/src/config.ts`; `packages/web/web-search-deepseek/src/index.ts` (`DEFAULT_API_KEY_ENV`); `packages/subagent/subagent-acp/*`, `subagent-dsh-sdk/*`; `packages/subprocess/subprocess/src/index.ts`; `packages/client/ui-settings-web-search/*` | API-Schluessel des DeepSeek-Endpunkts; im Base-Bundle als `apiKeyEnv: DEEPSEEK_API_KEY` verdrahtet |
| `DEEPSEEK_BASE_URL` | `packages/llm/llm-deepseek/src/config.ts` (`BASE_URL_ENV`) | Basis-URL des Messages-Endpunkts; in der Bootstrap-Liste gesperrt |
| `DEEPSEEK_SEARCH_BASE_URL` | `packages/web/web-search-deepseek/src/index.ts` (`SEARCH_BASE_URL_ENV`) | Basis-URL des Such-Endpunkts; in der Bootstrap-Liste gesperrt |
| `DEEPSEEK_FILES_API_TIMEOUT` | `packages/llm/llm-deepseek/src/request-files.ts` | Timeout fuer Datei-API-Anfragen |
| `PERPLEXITY_API_KEY` | `packages/web/web-search-perplexity/src/index.ts` | API-Schluessel des Perplexity-Suchproviders |
| `EXA_API_KEY` | `packages/web/web-search-exa/src/index.ts` | API-Schluessel des Exa-Suchproviders |
| `http_proxy` / `HTTP_PROXY` | `packages/util/http-proxy/src/policy.ts`, `src/install.ts`; gesperrt in `packages/boot/app-boot/src/index.ts` | HTTP-Proxy; Kleinschreibung hat Vorrang |
| `https_proxy` / `HTTPS_PROXY` | dito | HTTPS-Proxy; faellt notfalls auf den HTTP-Proxy zurueck |
| `no_proxy` / `NO_PROXY` | dito; zusaetzlich gelesen in `packages/web/web-fetch-http/src/provider.ts` | Bypass-Liste |
| `ALL_PROXY` | `packages/util/http-proxy/src/policy.ts`, `src/install.ts`; gesperrt in `packages/boot/app-boot/src/index.ts` | Fallback-Proxy fuer jede Scheme |
| `NODE_USE_ENV_PROXY` | `packages/util/http-proxy/src/install.ts` (gesetzt fuer Kindprozesse) | Signalisiert Node, `HTTP_PROXY`/`HTTPS_PROXY` selbst auszuwerten |
| `SSH_CONNECTION` | `packages/util/launch-environment/src/index.ts` (`launchedThroughSsh`) | Nur aus der `process`-Schicht; begruendet eine SSH-Sitzung |
| `SSH_TTY` | dito | Zweiter SSH-Marker |
| `SSH_ASKPASS` | `packages/boot/app-boot/src/index.ts` (`BOOTSTRAP_NAMES`) | Bootstrap-gesperrt |
| `PATH` | `packages/util/native-command` (`runNativeCommand`-Aufrufer); `packages/host/directory-picker-auto/src/index.ts`; `packages/experimental/ptc-runtime-python/src/index.ts`; `packages/boot/app-boot/src/index.ts` | Programmsuchpfad; Bootstrap-gesperrt |
| `HOME` | `packages/util/native-command/src/desktop-entry.ts`, `file-applications-linux.ts`, `path-opener.ts`; `packages/boot/app-boot/src/index.ts` | POSIX-Home; Bootstrap-gesperrt |
| `USERPROFILE` | `packages/boot/app-boot/src/index.ts` (`BOOTSTRAP_NAMES`) | Windows-Home; Bootstrap-gesperrt |
| `SHELL` | `packages/subprocess/subprocess-local/src/index.ts`; `packages/boot/app-boot/src/index.ts` | Login-Shell; Bootstrap-gesperrt |
| `ComSpec` | `packages/subprocess/subprocess-local/src/index.ts` | Windows-Befehlinterpretierer |
| `SystemRoot` | `packages/ptc-runtime/ptc-runtime-node/src/process.ts`; `packages/host/open-in-app/src/catalog.ts`, `src/resolver.ts`; `packages/shell/pwsh-local/src/resolve.ts` | Windows-Systemverzeichnis |
| `WINDIR` | `packages/ptc-runtime/ptc-runtime-node/src/environment.ts` | Windows-Verzeichnis (Fallback zu `SystemRoot`) |
| `TEMP` | `packages/ptc-runtime/ptc-runtime-node/src/environment.ts`; `packages/boot/plugin-manager/src/operations.ts`; `packages/subprocess/subprocess-local/src/output.ts`; u. a. | Windows-Temp-Verzeichnis |
| `TMP` | `packages/ptc-runtime/ptc-runtime-node/src/environment.ts`; `packages/experimental/inspector/src/host/bridge/controller.ts`; u. a. | Temp-Verzeichnis (Fallback) |
| `TMPDIR` | `packages/experimental/ptc-runtime-python/src/index.ts` | POSIX-Temp-Verzeichnis |
| `LANG` | `packages/util/native-command/src/file-applications-linux.ts`; `packages/util/code-language/src/index.ts`; `packages/ptc-runtime/ptc-runtime/src/types.ts`; `packages/boot/app-boot/src/package-meta.ts`; `packages/experimental/client-ui-cot-translation/*` | Locale fuer `.desktop`-Namen und Anzeige |
| `LC_ALL` | `packages/util/native-command/src/file-applications-linux.ts`; `packages/deliverables/workspace-changes/src/git.ts`; `packages/subprocess/subprocess-local/src/linux-scope.ts`; `packages/boot/plugin-manager/src/github-connection.ts` | Locale-Override (hoechste Prioritaet) |
| `LC_MESSAGES` | `packages/util/native-command/src/file-applications-linux.ts` | Locale-Fallback |
| `ZDOTDIR` | `packages/subprocess/subprocess-local/src/shell-activity.ts` | zsh-Konfigurationsverzeichnis |
| `DISPLAY` | `packages/util/native-command/src/path-opener.ts`; `packages/host/directory-picker-auto/src/resolve.ts`; `packages/host/directory-picker-native/src/win32-dialog-bindings.ts` | X11-Display; Voraussetzung fuer `canOpenNativePath` |
| `WAYLAND_DISPLAY` | `packages/util/native-command/src/path-opener.ts`; `packages/host/directory-picker-auto/src/resolve.ts` | Wayland-Display |
| `BROWSER` | `packages/util/native-command/src/path-opener.ts`; `packages/bundle/web-app/src/index.ts`; `packages/client/ui-sidebar-browser/*`; `packages/boot/app-boot/src/index.ts` | Browser-Kommando auf Linux; Bootstrap-gesperrt |
| `XDG_DATA_HOME` | `packages/util/native-command/src/desktop-entry.ts`; `packages/host/open-in-app/src/resolver.ts` | XDG-Datenwurzel; Default `~/.local/share` |
| `XDG_DATA_DIRS` | dito | XDG-Datenpfade; Default `/usr/local/share:/usr/share` |
| `WSL_DISTRO_NAME` | `packages/util/native-command/src/path-opener.ts` | WSL-Erkennung |
| `WSL_INTEROP` | dito | Zweiter WSL-Marker |
| `SYSTEMD_LOG_TARGET` | `packages/subprocess/subprocess-local/src/linux-scope.ts`, `src/runner-launch.ts` | systemd-Logziel im Scope-Launcher |
| `ELECTRON_RUN_AS_NODE` | `packages/host/open-in-app/src/resolver.ts`; `packages/ptc-runtime/ptc-runtime-node/src/index.ts`; `packages/experimental/speech-to-text-sensevoice/src/recognizer.ts` | Electron im Node-Modus |
| `NODE_ENV` | `packages/client/store/src/index.ts` | `'production'` deaktiviert Dev-Pruefungen |
| `NODE_OPTIONS` | `packages/boot/app-boot/src/index.ts` (`BOOTSTRAP_NAMES`) | Interpreter-Startoptionen; Bootstrap-gesperrt |
| `NODE_PATH` | ebd. | Modulaufloesung; Bootstrap-gesperrt |
| `NODE_EXTRA_CA_CERTS` | ebd. | Zusaetzliche CA; Bootstrap-gesperrt |
| `NODE_TLS_REJECT_UNAUTHORIZED` | ebd. | TLS-Pruefung; Bootstrap-gesperrt |
| `TSX_TSCONFIG_PATH` | `packages/experimental/browser-use-stagehand-native/src/worker-client.ts`; `packages/experimental/inspector/src/host/bridge/controller.ts` | tsconfig-Pfad fuer `tsx`-Kindprozesse |

#### 5.4.2 Bootstrap-Namen und -Praefixe (`packages/boot/app-boot/src/index.ts:134-158`)

Diese Namen liest die Harness aus `process.env` und/oder aus `.env`-Dateien ausschliesslich zum **Validieren**; kein gefundenes `.env` darf sie setzen (Ausnahme: die vier Proxy-Namen in der Home-Datei). Vollstaendig, wie im Code:

`PATH`, `HOME`, `USERPROFILE`, `SHELL`, `NODE_OPTIONS`, `NODE_PATH`, `NODE_EXTRA_CA_CERTS`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `LD_AUDIT`, `BASH_ENV`, `ENV`, `SHELLOPTS`, `BASHOPTS`, `PERL5OPT`, `PERL5LIB`, `PYTHONSTARTUP`, `PYTHONPATH`, `RUBYOPT`, `RUBYLIB`, `JAVA_TOOL_OPTIONS`, `_JAVA_OPTIONS`, `JDK_JAVA_OPTIONS`, `PYTHONHOME`, `GIT_SSH`, `GIT_SSH_COMMAND`, `GIT_EXTERNAL_DIFF`, `GIT_PAGER`, `GIT_EDITOR`, `GIT_ASKPASS`, `SSH_ASKPASS`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `GIT_CONFIG_COUNT`, `EDITOR`, `VISUAL`, `PAGER`, `BROWSER`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_SEARCH_BASE_URL`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`, `NODE_TLS_REJECT_UNAUTHORIZED`.

Praefixe, die kein gefundenes `.env` setzen darf: `DSH_`, `XDG_`, `DYLD_`, `BASH_FUNC_`. Der Home-Datei zusaetzlich erlaubt: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` (`HOME_LAYER_PROXY_NAMES`).

#### 5.4.3 Git-Isolationsnamen (`packages/experimental/worktree/src/process.ts`, `packages/deliverables/workspace-changes/src/git.ts`)

`GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_ATTR_SOURCE`, `GIT_CEILING_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_CONFIG`, `GIT_CONFIG_PARAMETERS`, `GIT_DIR`, `GIT_GRAFT_FILE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_PREFIX`, `GIT_REPLACE_REF_BASE`, `GIT_SHALLOW_FILE`, `GIT_WORK_TREE`.

#### 5.4.4 Variablen ausserhalb von `packages/` (apps, scripts, gepatchte Abhaengigkeit)

| Variable | Lesende Stelle | Bedeutung |
|---|---|---|
| `DSH_SNAPSHOT`, `DSH_SNAPSHOT_BASE_URL`, `DSH_SNAPSHOT_SESSIONS_ROOT` | `apps/cli/tests/profiles/*`, `apps/web/tests/*` | Snapshot-Modi und Fixture-Wurzeln |
| `DSH_SNAPSHOT_MAX_CONCURRENCY`, `DSH_SNAPSHOT_MAX_WORKERS` | `vitest.snapshot.config.ts` (per `process.env`) | Nebenlaeufigkeit der Snapshot-Laeufe |
| `DSH_EXAMPLE_MODE` | `apps/desktop/tests/*`, `apps/cli/tests/*` | `'lib'` = gebaute Artefakte statt Quelle |
| `DSH_WEB_STRESS_HEADFUL` | `apps/web/stress-tests/reasoning-chunks.stress.ts` | Headful-Browser fuer Stresstests |
| `DSH_PLAYWRIGHT_EXECUTABLE_PATH` | `apps/web/tests/access-confirmation.e2e.ts` | Browser-Binary |
| `DSH_AUTO_REVIEW_SCREENSHOT_DIR` | `apps/web/tests/auto-review-fixture.ts` | Ablage der Auto-Review-Screenshots |
| `DSH_GITHUB_WEBHOOK_PORT`, `DSH_GITHUB_WEBHOOK_SECRET` | `apps/web/tests/github-ready-review.e2e.ts`; Fixtures | Webhook-Testserver |
| `DSH_DESKTOP_USER_DATA_DIR` | `apps/desktop/scripts/dev.ts` | Electron-User-Data |
| `DSH_DESKTOP_PRIMARY_RUNTIME_DIR` | `apps/desktop/scripts/dev.ts`, `apps/desktop/src/main.ts` | Primary-Runtime im Dev-Betrieb |
| `DSH_DESKTOP_OPEN_DEVTOOLS` | `apps/desktop/scripts/dev.ts`, `src/main.ts` | DevTools automatisch oeffnen |
| `DSH_DESKTOP_PNPM_ENTRY`, `DSH_DESKTOP_DSH_DIR` | `apps/desktop/src/main.ts` | Dev-Pfade fuer pnpm und `dsh` |
| `DSH_DESKTOP_HOST_INSPECT_PORT` | `apps/desktop/src/main.ts` | Inspector-Port des Hosts |
| `DSH_DESKTOP_UPDATE_JOURNAL_DIR` | `apps/desktop/src/main.ts` | Journal-Verzeichnis der Updates |
| `DSH_DESKTOP_UPDATE_HTTP_IDLE_TIMEOUT_MS` | `apps/desktop/src/update-coordinator.ts` | Idle-Timeout des Update-Transports (Default `60_000`) |
| `DSH_DESKTOP_MANDATORY_UPDATE_CONFIG` | `apps/desktop/src/main.ts` | Konfiguration erzwungener Updates (nur Dev) |
| `DSH_DESKTOP_DIAGNOSTIC_FILE` | `apps/desktop/src/main.ts` | Diagnoseausgabe |
| `DSH_DESKTOP_DEV_APP` | `apps/desktop/src/main.ts` | Registriert das `dsh`-Protokoll auch ohne Packaging |
| `DSH_DESKTOP_PACKAGING_RUN_DIR` | `apps/desktop/scripts/*.ts` | Laufverzeichnis des Packaging (wird gesetzt und restauriert) |
| `DSH_DESKTOP_UNSIGNED` | `apps/desktop/scripts/prepare-dsh.ts` | `'1'` ueberspringt die macOS-Signatur |
| `DSH_DESKTOP_WINDOWS_CER_FILE`, `DSH_DESKTOP_WINDOWS_SIGNTOOL`, `DSH_DESKTOP_WINDOWS_KEY_CONTAINER`, `DSH_DESKTOP_WINDOWS_TOKEN_PIN` | `apps/desktop/scripts/sign-primary-runtime.ts` | Windows-Signaturmaterial |
| `DSH_DESKTOP_MACOS_SIGNING_PROBE` | `apps/desktop/scripts/macos-runtime.ts` | macOS-Signaturprobe |
| `DSH_REQUIRE_BUILT_CLI_SMOKE` | `apps/cli/tests/lazy-search-startup.compat.spec.ts` | `'1'` verlangt gebaute CLI-Artefakte |
| `DSH_CLI_TEST_VALUE`, `TEST_SECRET_KEY`, `TEST_SECRET_KEY`-artige Testfixturen | `apps/desktop/tests/*` | Testfixturen |
| `DSH_COVERAGE_TEST_TIMEOUT_MS` | `packages/sandbox/sandbox-windows-acl/tests/diagnose-script.spec.ts` | Coverage-Timeout |
| `DSH_E2E_MAX_WORKERS` | `vitest.e2e.config.ts` | Worker-Budget der E2E-Laeufe (Default 4) |
| `DSH_WEB_SNAPSHOT_WORKERS` | `scripts/run-web-snapshots.ts` | Worker-Pool der Web-Snapshots |
| `DSH_NODE_PTY_SPAWN_HELPER` | `patches/node-pty@1.2.0-beta.15.patch` (in `lib/unixTerminal.js`) | Pfad zum `spawn-helper`; hat Vorrang vor `process.execPath + '-spawn-helper'` und dem `app.asar`-Fallback |
| `NALR_REQUIRE_LANDLOCK` | `native/system/docs/naming.md`, `native/system/test/launcher.test.js` | Test-only: ein nicht erzwingender Kernel schlaegt fehl statt zu skippen |
| `NALR_*` (Praefix) | `native/system/docs/naming.md` | Reserviert fuer Build/Test-Orchestrierung des C-Addons; Laufzeitbinaries lesen **keine** Umgebungsvariablen |
| `GITHUB_REPOSITORY`, `GITHUB_SERVER_URL` | `native/system/scripts/pack-release.mjs` | Setzt die Repository-URL der kopierten Manifeste |
| `NPM_TOKEN` | `.github`-Workflows `node-addon-system-release.yml` | Fallback-Publikationstoken |
| `MEMORY_FILE_PATH` | `apps/cli/config/examples/mcp-memory/mcp-reference-memory.cordis.yml` | Beispielkonfiguration eines MCP-Memory-Servers |
| `ELECTRON_ENABLE_LOGGING` | `apps/desktop/scripts/dev.ts` | Electron-Logging |
| `npm_execpath` | `apps/desktop/scripts/dev.ts`, `flock-entry.ts`, `package-target.ts` | pnpm-Einstiegspfad |

**Zaehlung (nachgezaehlt an den Tabellen dieses Dokuments).** Tabelle 5.4.1 enthaelt **85** Namen, die in `packages/` gelesen, gesetzt oder validiert werden. Abschnitt 5.4.2 fuehrt **49** Bootstrap-Namen und **4** Praefixe (`DSH_`, `XDG_`, `DYLD_`, `BASH_FUNC_`). Abschnitt 5.4.3 fuehrt **14** Git-Namen. Tabelle 5.4.4 fuehrt **44** Eintraege, davon **43** Namen und das Praefix `NALR_*`. Die Vereinigungsmenge aller vier Abschnitte sind **179** Eintraege; zieht man die **5** Praefixe und die Code-Konstante `HOME_LAYER_PROXY_NAMES` ab, bleiben **173 verschiedene Umgebungsvariablennamen**.

**Nicht gefunden.** Ein `env[`-Zugriff mit **literalem** Schluessel existiert im gesamten `packages/`-Baum nicht; alle indizierten Zugriffe (`process.env[name]`, `env[envName]`, `process.env[key]`, `env[SUBPROCESS_RUNNER_ENV]`, `env[SUBPROCESS_CONTROL_ENV]`, `env[EXAMPLE_MODE_ENV]`) verwenden Variable. Ein `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` oder `XDG_STATE_HOME` wird nirgends gelesen.

---

## 6. Utilities

Alle Pakete unter `packages/util/` tragen Version `0.2.1-alpha.2`, sind **nicht** `private`, setzen `"type": "module"`, `main: lib/index.js`, `types: lib/types/index.d.ts` und exportieren nach demselben Muster `.`, `./src/*`, `./package.json` (Abweichungen sind vermerkt).

### 6.1 `home-paths` — `@deepseek-ai/dsh-home-paths`
Vollstaendig in Abschnitt 5.1–5.3 behandelt.

### 6.2 `atomic-write` — `@deepseek-ai/dsh-atomic-write`

**Zweck.** Atomarer Dateiersatz plus prozessuebergreifende Writer-Serialisierung: Leser sehen entweder den alten oder den neuen vollstaendigen Inhalt, und ein ersetztes File traegt exakt die vom Aufrufer genannten Rechte (`packages/util/atomic-write/src/index.ts:1-12`). Keine Runtime-Dependencies.

**Exporte:**
- `interface WriteFileAtomicOptions { mode: number; dirMode?: number }` — `mode` ist **erforderlich**
- `writeFileAtomic(filename: string, content: string, options: WriteFileAtomicOptions): Promise<void>` — **nur `string`-Inhalt**, kein `Uint8Array`
- `interface FileLockOptions { waitMs?: number }`
- `withFileLock<T>(filename: string, operation: () => Promise<T>, options?: FileLockOptions): Promise<T>`

Nicht exportierte Konstanten: `WINDOWS_TRANSIENT_RENAME_ERRORS = { EACCES, EBUSY, EPERM }`, `WINDOWS_RENAME_RETRY_INITIAL_MS = 20`, `WINDOWS_RENAME_RETRY_MAX_MS = 200`, `WINDOWS_RENAME_RETRY_LIMIT = 8`, `LOCK_RETRY_INITIAL_MS = 20`, `LOCK_RETRY_MAX_MS = 200`, `DEFAULT_LOCK_WAIT_MS = 2_000` (`packages/util/atomic-write/src/index.ts:18-21,184-196`).

**Exakte Write/Rename/Flush-Strategie:**
1. **Elternverzeichnisse:** `mkdir(dirname(filename), { recursive: true })`; `mode: options.dirMode` nur wenn `dirMode !== undefined` gesetzt — bestehende Verzeichnisse behalten ihren Mode (`src/index.ts:80-83`).
2. **Temp-Namensgebung:** `` `${filename}.${randomBytes(6).toString('hex')}.tmp` `` — also `<ziel>.<12 Hex-Zeichen>.tmp` (`src/index.ts:86`). Der Temp liegt garantiert im **selben Verzeichnis** wie das Ziel, was den Rename auf einem Dateisystem haelt.
3. **Exklusives Anlegen:** `writeFile(temp, content, { mode: options.mode, flag: 'wx' })` — `O_EXCL`-Semantik: der Open folgt keinem am Temp-Pfad platzierten Symlink (`src/index.ts:88`).
4. **Rename:** `rename(temp, filename)`, umhuellt von `renameAtomicTemp` (`src/index.ts:30-43,89`).
5. **Cleanup:** Bei jedem Fehler `await rm(temp, { force: true })` und Rethrow — es bleibt kein Temp-Geschwister zurueck (`src/index.ts:90-93`).
6. **`fsync`: nicht vorhanden.** Es gibt keinen `fsync`-Aufruf fuer Datei oder Verzeichnis. Ein `TODO(settings-atomic-durability)` im Quelltext nennt das als offen (`src/index.ts:84-85`); die README fuehrt „Atomic, not durable" als akzeptierte Grenze (`README.md:124`).
7. **Keine Bereinigung fremder Temp-Dateien** — nur der eigene Temp dieser Instanz wird entfernt.
8. **Rechte-/Mode-Erhalt:** Der frische Temp-Inode traegt `options.mode`; der Rename transportiert ihn auf das Ziel. Dadurch *verengt* das Ersetzen einer breiter berechtigten Datei deren Rechte ohne `chmod`-Race; ein `chmod`-Aufruf existiert nicht. Der Mode unterliegt dem Prozess-`umask` (`src/index.ts:50-59,74`).
9. **Symlink-Ziel:** Der Rename ersetzt das Symlink-Ziel **selbst**, statt in sein Referent zu schreiben (Test `tests/atomic-write.spec.ts:145`).

**Windows-Spezifika** (`isTransientWindowsRenameError`, `src/index.ts:23-43`):
- Nur auf `process.platform === 'win32'` werden `EACCES`, `EBUSY` und `EPERM` als transient behandelt; auf anderen Plattformen wird der Fehler sofort weitergereicht (Test `tests/atomic-write.spec.ts:204`).
- Retry: bis zu `WINDOWS_RENAME_RETRY_LIMIT = 8` Wiederholungen; Delay startet bei 20 ms und **verdoppelt** bis maximal 200 ms (`delay = Math.min(delay * 2, WINDOWS_RENAME_RETRY_MAX_MS)`).
- Waehrend aller Retries bleibt derselbe, vollstaendige Temp die Rename-Quelle; das Ziel bleibt bis zum erfolgreichen Rename unveraendert.
- `fs.rename` wird verwendet, **nicht** `fs.rm` — es gibt **keinen** `rm`-then-rename-Fallback (`packages/util/atomic-write/README.md:83`; Entscheidungsakte `.agents/notes/archived/bug-fix/2026-08-29-windows-atomic-replace-retry.md`).
- Grund fuer die Retries: „temporary use of the target by software outside the cooperative writer lock" (`README.md:83`) — also Antivirus/Indexer. Ein Treffer ueber den Writer-Lock hinaus ist ausdruecklich nicht behebbar.
- **Long-Path-Behandlung: keine.** Der Temp-Name entsteht durch reine String-Konkatenation; `\\?\`-Praefixe werden nicht verwendet.
- **`chmod`-Verhalten: kein `chmod`-Aufruf**; der Modus kommt ausschliesslich ueber den frisch angelegten Inode. Der Quelltext nennt „preserves owner-only permissions on Windows" als offenen Punkt (`src/index.ts:85`).

**Lock-Protokoll** (`withFileLock`, `src/index.ts:235-268`):
- Lock-Pfad `` `${filename}.lock` ``; Inhalt `` `${process.pid}\n` ``, angelegt per `wx` mit `mode: 0o600`. **Das Elternverzeichnis muss existieren** (Test `tests/atomic-write.spec.ts:257`).
- Contention-Erkennung `isLockContention`: `EEXIST` ist direkt Contention; `EPERM` nur, wenn ein frischer `lstat(lockPath)` die Existenz bestaetigt (`src/index.ts:97-108`).
- Windows: genau **ein** Retry bei unbestaetigtem `EPERM` (`retriedUnconfirmedPermissionError`); ein wiederholter unbestaetigter Fehler wird rethrown (`src/index.ts:250-255`).
- Dead-Holder-Uebernahme `takeOverExitedLock`: `holderExited` akzeptiert nur Record-Form `^\d+\n$`, lehnt `pid === 0`, `pid > 0x7fffffff` und `pid === process.pid` ab und probt mit `process.kill(pid, 0)`; nur `ESRCH` beweist den Exit, `EPERM` bedeutet „existiert unter anderem Nutzer" (`src/index.ts:111-126`).
- Uebernahme-Claim: `` `${lockPath}.takeover-${sha256(record).slice(0,16)}` `` mit `wx`, `mode: 0o600`; unter dem Claim wird das Lock neu gelesen, die PID erneut geprobt, dann `rm(lockPath, { force: true })`. `EEXIST`/`EPERM` beim Claim → `false` (`src/index.ts:149-177`).
- Backoff: 20 ms Start, Verdopplung bis 200 ms; Deadline `Date.now() + (waitMs ?? 2000)`; Ueberschreitung wirft `atomic-write: timed out waiting for the writer lock at ${lockPath}` (`src/index.ts:241-262`).
- Freigabe in `finally` via `rm(lockPath, { force: true })`.
- Grenzen: Leser nehmen **nie** ein Lock; PIDs werden auf dem Host des Contenders verglichen, also sind mehrere Hosts oder PID-Namespaces auf einem gemeinsamen Dateisystem **nicht** unterstuetzt (`README.md:126-127`).

### 6.3 `package-manifest` — `@deepseek-ai/dsh-package-manifest`

**Zweck.** Reine Typdeklarationen fuer `package.json`-Felder und DSH-Plugin-Anzeigemetadaten; **keine** Runtime-Exporte (`packages/util/package-manifest/src/index.ts:1-15`).

**Exporte (alle `export type`):** `DshPackageManifest { name: string; version: string; description?: string; icon?: string; private?: boolean; dependencies?: Record<string,string>; peerDependencies?: Record<string,string>; engines?: DshEnginesManifest; dsh?: DshManifest }` · `DshManifest { manifestVersion?: 1; bundle?: DshBundleManifest; profile?: DshProfileManifest; client?: DshClientManifest }` · `LocalizedText = string | { readonly en: string; readonly [locale: string]: string }` · `PluginLocalizedMeta { readonly title?: LocalizedText; readonly description?: LocalizedText; readonly icon?: string; readonly error?: string }` · `DshEnginesManifest { dsh?: string; node?: string; npm?: string; [engine: string]: string | undefined }` · `DshBundleManifest { patch: string | string[] }` · `DshProfileManifest { bundles?: string[] }` · `DshClientManifest { platform: string; inject?: string[]; immediately?: boolean; external?: string[] }` (`packages/util/package-manifest/src/types.ts:8-94`).

**Verhalten.** Kein Parser, keine Getter, keine Defaults — jeder Leser validiert sein JSON selbst (`README.md:92`). `icon` ist ein SVG/PNG/JPEG/WebP-Pfad relativ zum Manifest-Verzeichnis, hoechstens 256 KiB und nach `realpath`-Aufloesung darin enthalten (`src/types.ts:15`). `dsh.manifestVersion` und `engines.dsh` sind rein deklarativ: aktuelle Installer und Loader erzwingen sie nicht (`README.md:93`). Interne Metadaten wie `configTrees`, `sessionFormatMigration` und `moduleFallback` sind bewusst nicht oeffentlich (`README.md:57`).

### 6.4 `launch-environment` — `@deepseek-ai/dsh-launch-environment`

**Zweck.** Unveraenderlicher Snapshot der Startumgebung, der festhaelt, welche Schicht welchen Wert geliefert hat (`packages/util/launch-environment/src/index.ts:1-7`).

**Exporte:** `type LaunchEnvironmentSource = 'process' | 'project-env' | 'user-env'` · `interface LaunchEnvironmentEntry { value: string; source: LaunchEnvironmentSource; path?: string }` · `interface LaunchEnvironmentSnapshot { get(name: string): LaunchEnvironmentEntry \| undefined; getFrom(name: string, sources: readonly LaunchEnvironmentSource[]): LaunchEnvironmentEntry \| undefined }` · `interface LaunchEnvironmentLayerInput { source; path?; values: Readonly<Record<string, string>> }` · `createLaunchEnvironmentSnapshot(layers: readonly LaunchEnvironmentLayerInput[]): LaunchEnvironmentSnapshot` · `DSH_LAUNCH_ENVIRONMENT_KEY: string = 'launchEnvironment'` · `launchEnvironmentOf(ctx: Context): LaunchEnvironmentSnapshot` · `launchedThroughSsh(environment: LaunchEnvironmentSnapshot): boolean`; Modul-Augmentation `Context.launchEnvironment?`.

**Verhalten.** Vertrauensordnung ist fest `['process', 'project-env', 'user-env']` (`SOURCE_ORDER`, `src/index.ts:19`), unabhaengig von der Reihenfolge der uebergebenen Schichten. Namensschluessel: auf `process.platform === 'win32'` wird der Name auf Grossbuchstaben gefaltet, sonst exakt gesucht (`lookupKey`, `src/index.ts:60-63`). Jede Schicht wird beim Bau kopiert, spaetere Mutationen aendern den Snapshot nicht (`src/index.ts:79-87`). `launchedThroughSsh` prueft ausschliesslich `process` auf nicht-leeres `SSH_CONNECTION` oder `SSH_TTY`. `launchEnvironmentOf` faellt auf einen Snapshot mit ausschliesslich `process: process.env` zurueck. Grenzen: der Snapshot ist **keine** Subprozess-Grenze, da jede Schicht zusaetzlich nach `process.env` materialisiert wird (`README.md:102`); es gibt keine Per-Workspace-Schicht (`README.md:103`).

### 6.5 `native-command` — `@deepseek-ai/dsh-native-command`

**Zweck.** Fuehrt Host-Executables **ohne Shell** aus und oeffnet Host-Dateisystempfade ueber den Desktop, inklusive WSL-Uebergabe und Dateizuordnungs-Abfragen (`packages/util/native-command/src/index.ts:1-25`). Zusaetzlicher Export `"./types" → { types: ./lib/types/types.d.ts, default: ./lib/types/types.js }`.

**Exporte:** `type NativeCommandRunner = (command: string, args: readonly string[], signal: AbortSignal, window: 'hidden' \| 'visible') => Promise<{ stdout: string; stderr: string }>` · `runNativeCommand: NativeCommandRunner` · `type PathOpenerRunner = NativeCommandRunner` · `interface PathOpenerInternals { platform?: NodeJS.Platform; osRelease?: string; env?: NodeJS.ProcessEnv; run?: PathOpenerRunner }` · `type NativeFileManager = 'finder' \| 'explorer' \| 'directory'` · `canOpenNativePath(internals?): boolean` · `nativeFileManager(internals?): NativeFileManager \| null` · `revealNativePath(path, signal, internals?): Promise<void>` · `openNativePath(path, signal, internals?): Promise<void>` · `openNativeAssociatedPath(path, signal, internals?): Promise<void>` · `openNativeTextFile(path, signal, internals?): Promise<void>` · `nativeFileApplications(path, signal, internals?): Promise<readonly NativeFileApplication[]>` · `openNativeFileApplication(path, application, signal, internals?): Promise<void>` · `interface NativeFileApplication { readonly id: string; readonly name: string; readonly default: boolean; readonly icon: string \| null }` · `desktopEntryFields(text: string): Readonly<Record<string, string>>` · `desktopDataDirectories(home: string, env: Readonly<Record<string, string \| undefined>>): readonly string[]` · `desktopApplicationIcon(name: string, directories: readonly string[]): Promise<DesktopIcon \| null>` (`src/index.ts:6-25`, `src/types.ts:4-19`, `src/desktop-entry.ts:6-9`). `DesktopIcon` und `parseNativeFileApplications` sind **nicht** aus `index.ts` re-exportiert, nur ueber `./src/*` bzw. `./types` erreichbar.

**Mechanismus zum Aufruf nativer Binaries:**
- **`execFile` statt exec-Shell:** `execFile` aus `node:child_process` mit `{ encoding: 'utf8', signal, windowsHide: window === 'hidden' }`; `args` wird als `[...args]` kopiert (`src/runner.ts:6,25-43`). Es gibt **kein** `shell: true`, **keinen** `timeout`, **kein** `detached`, **kein** `stdio`-Override und **keine** `maxBuffer`-Anpassung.
- **Kein Quoting** der Argumente: `execFile` uebergibt `argv` direkt; die einzige Ausnahme ist `explorerTarget` (siehe unten).
- **Fehlerform:** `Object.assign(new Error(error.message, { cause: error }), { code: error.code, stdout, stderr })`.
- **`window`:** nur `windowsHide`; auf Nicht-Windows-Plattformen ohne Wirkung.
- **Nicht vorhanden:** kein `rundll32`, kein `cmd /c`, kein `start`, kein `powershell -EncodedCommand` im ausgelieferten Quellcode.

**Plattform-Dispatch** (`openNativePathWithIntent`, `src/path-opener.ts:168-202`):

| Bedingung | Kommando | argv | window |
|---|---|---|---|
| `!wsl && intent==='default' && ext ∈ {.html,.htm,.xhtml,.svg}` | Browser-Pfad (`openInBrowser`) | — | — |
| `darwin`, `text-editor` | `open` | `['-t', path]` | `hidden` |
| `darwin`, sonst | `open` | `[path]` | `hidden` |
| `win32` | `explorer.exe` | `[explorerTarget(path)]` | `visible` |
| `linux` und WSL | `wslpath` | `['-w', path]` → dann Explorer | `hidden` |
| `linux`, sonst | `xdg-open` | `[path]` | `hidden` |
| unbekannte Plattform | wirft `` Error(`native path opener is unsupported on ${platform}`) `` | — | — |

`extname(path).toLowerCase()` gegen `BROWSER_DOCUMENTS = new Set(['.html', '.htm', '.xhtml', '.svg'])` (`src/path-opener.ts:34`). `isWsl` = nicht-leeres `WSL_DISTRO_NAME` **oder** `WSL_INTEROP`, sonst `osRelease().toLowerCase().includes('microsoft')` (`src/path-opener.ts:94-98`).

**Browser-Praeferenz** (`openInBrowser`, `src/path-opener.ts:53-83`): auf `darwin` zuerst `defaults read com.apple.LaunchServices/com.apple.launchservices.secure` (`hidden`); der Parser entfernt `LSHandlerPreferredVersions = {...};`, sucht den Block mit `LSHandlerURLScheme = "https";` und liest `LSHandlerRoleAll`; danach `open -b <bundle> <path>`. Auf `linux` wird nur `env.BROWSER` verwendet (muss nicht-leer sein) und als `BROWSER <path>` ausgefuehrt; `xdg-settings` wird ausdruecklich nicht benutzt. Auf `win32` gibt es `false`.

**Argument-Quoting fuer Explorer** (`explorerTarget`, `src/path-opener.ts:116-123`): `pathToFileURL(windowsPath, { windows: true }).href`, danach `(?:%[89A-F][0-9A-F])+` → `decodeURIComponent` (Nicht-ASCII-Escapes werden zurueckdekodiert, ASCII-Escapes bleiben), dann `','` → `'%2C'` und `'='` → `'%3D'`. Grund: Explorer parst seine Kommandozeile selbst und trennt an Komma und Gleichheitszeichen. Beim Reveal sind es **zwei** argv-Elemente: `['/select,', explorerTarget(windowsPath)]` (`src/path-opener.ts:307`).

**Explorer-Exit 1 als delegierte Uebergabe** (`runExplorer`, `src/path-opener.ts:136-145`): `explorer.exe` laeuft mit `'visible'`, weil `SW_HIDE` auch das Ordnerfenster verbirgt; `signal.throwIfAborted()` gewinnt vor der Auswertung, und nur `error.code === 1` wird akzeptiert. Die README haelt fest, dass Exit 1 die Oeffnung **nicht** beweist und dass ein nicht-interaktiver Windows-Dienst `explorer.exe` nach ca. einer Sekunde ebenfalls mit 1 beendet, ohne etwas zu oeffnen (`README.md:112`).

**Verfuegbarkeitspruefung** (`canOpenNativePath`, `src/path-opener.ts:215-221`): `darwin`/`win32` immer `true`; `linux` nur bei WSL **oder** nicht-leerem `DISPLAY` **oder** nicht-leerem `WAYLAND_DISPLAY`; andere Plattformen `false`.

**Windows-Zuordnungsabfrage** (`src/file-applications-windows.ts`): Es wird **keine** Registry direkt gelesen — kein `reg.exe`, kein Registry-Schluesselpfad im Quelltext. Stattdessen wird ein privates PowerShell-5.1-Skript in einer temporaeren Datei ausgefuehrt: `mkdtemp(join(tmpdir(), 'dsh-native-command-'))/associations.ps1`, geschrieben mit vorangestelltem BOM (`\uFEFF`), damit PowerShell 5.1 die UTF-8-C#-Quelle nicht als ANSI liest; im `finally` wird das Verzeichnis rekursiv entfernt (`src/file-applications-windows.ts:265-275`). Aufruf: `powershell.exe -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File <scriptPath>` mit `'hidden'`. Kein `-EncodedCommand`, weil das eingebettete C# das 32767-Zeichen-Limit von `CreateProcess` ueberschritt (`src/file-applications-windows.ts:261-264`). Pfad und Anwendungs-id werden als Base64 in den Skripttext interpoliert. Die C#-Klasse `DshFileAssociations` nutzt `SHAssocEnumHandlers`, `AssocQueryString` (kind `2` = Executable, kind `21` = AppId), `SHCreateItemFromParsingName`, `IHandler.GetName/GetUIName/GetIconLocation/Invoke`, `SHLoadIndirectString` fuer `@{…}`-Indirektionen und `SHDefExtractIcon` + `DestroyIcon` fuer Icons (32 px PNG als `data:image/png;base64,…`).

**Linux-Zuordnungsabfrage** (`src/file-applications-linux.ts`): `gio info -a standard::content-type <path>` → MIME ueber `/standard::content-type:\s*(\S+)/`; dann `env LC_ALL=C gio mime <mime>`; Default ueber `/^Default application.*:\s*(.+\.desktop)\s*$/m`, Kandidaten zusaetzlich aus Zeilen mit `^\s+.*\.desktop\s*$`, dedupliziert per `Set`. Explizites Starten geht ueber `gio launch <application> <path>`; es wird **kein** Kommandotext aus der `.desktop`-Datei ausgefuehrt.

**XDG-Aufloesung** (`desktopDataDirectories`, `src/desktop-entry.ts:35-38`): `[env.XDG_DATA_HOME ?? join(home, '.local', 'share'), ...(env.XDG_DATA_DIRS ?? '/usr/local/share:/usr/share').split(':').filter(Boolean)]`, wobei `home = env.HOME ?? homedir()`.

**macOS-Zuordnung:** `osascript -l JavaScript -e <JXA-Quelltext> <path> <icons|handlers>` (`hidden`); die JXA nutzt `NSWorkspace.URLForApplicationToOpenURL` und `URLsForApplicationsToOpenURL`, liefert `id`, `name`, `default`, `icon` plus `bundle` und `version` (`src/file-applications.ts:9-46,74`).

### 6.6 `http-proxy` — `@deepseek-ai/dsh-http-proxy`

**Zweck.** Prozessweite Policy fuer ausgehende HTTP-Proxies: einmal aus der Startumgebung aufloesen und als undici-Global-Dispatcher installieren, damit Node's `fetch` ohne Codeaenderung geroutet wird (`packages/util/http-proxy/src/index.ts:1-15`). Dependency `undici: ^8.10.2`.

**Exporte:** `installProxyFromEnvironment(env: EnvLookup, report: (message: string) => void): Promise<() => Promise<void>>` · `proxyRouteFor(url: URL): ProxyRoute` · `proxyEnvironmentForChild(): Readonly<Record<string, string \| undefined>>` · `clearedProxyEnv(): Record<string, undefined>` · `type ProxyRoute = { readonly proxied: true; readonly proxy: string; readonly dispatcher: Dispatcher } \| { readonly proxied: false }`. Ueber `./src/policy.ts` zusaetzlich: `interface EnvLookup { get(name: string): { readonly value: string } \| undefined }` · `LOOPBACK_NO_PROXY: readonly string[] = ['localhost','127.0.0.1','::1','[::1]']` · `POLICY_ENV_NAMES` mit `httpProxy/httpsProxy/noProxy` · `PROXY_ENV_NAMES` · `interface ProxyPolicy { httpProxy?; httpsProxy?; noProxy: string; source: 'env' \| 'none' }` · `DIRECT_POLICY` · `interface ProxyDiagnostic { kind: 'socks' \| 'invalid'; origin: string; message: string }` · `interface ProxyResolution { policy: ProxyPolicy; diagnostics: readonly ProxyDiagnostic[] }` · `isSupportedProxyUrl(value: string): boolean` · `isLoopbackHost(hostname: string): boolean` · `bypassesProxy(noProxy: string, url: URL): boolean` · `resolveProxyPolicy(env: EnvLookup): ProxyResolution` · `proxyForUrl(policy: ProxyPolicy, url: URL): string \| undefined`.

**Verhalten.** Gelesen werden `http_proxy`, `https_proxy`, `no_proxy`, `all_proxy` — **lowercase zuerst**, Uppercase als Fallback, blank gilt als unset (`readEnv`, `src/policy.ts:109-118`). Aufloesung: eigene Variable der Scheme gewinnt, dann `ALL_PROXY`, und nur HTTPS faellt zuletzt auf den HTTP-Proxy zurueck (`src/policy.ts:193-197,306-326`). Ein *abgelehnter* Slot haelt die Scheme direkt — es wird **nicht** auf eine andere Scheme ausgewichen. Akzeptiert werden nur `http:`- und `https:`; `socks:`/`socks4:`/`socks4a:`/`socks5:`/`socks5h:` werden als `kind: 'socks'` gemeldet, alles Unparsbare als `invalid`, jeweils ohne Zugangsdaten. Loopback wird immer umgangen: die veroeffentlichte Liste enthaelt nur die vier Literale, `proxyForUrl` erkennt zusaetzlich `127.0.0.0/8`, `::1`, `::`, `0.0.0.0`, `*.localhost` und IPv4-gemappte Schreibweisen (`src/policy.ts:239-266,338-343`). Bypass-Matching kennt Subdomains, fuehrendes `.`/`*.`, optionales `:port` und `*` — **kein** CIDR (`src/policy.ts:279-295`). Der installierte Dispatcher ist ein `Agent`, dessen `factory` pro Origin selbst `proxyForUrl` aufruft; `undici.EnvHttpProxyAgent` ist bewusst nicht verwendbar (`src/install.ts:131-157`). Bei `policy.source === 'none'` wird ein direkter `Agent` installiert und die Umgebung restauriert (`src/install.ts:176-206`). `proxyEnvironmentForChild` setzt `NODE_USE_ENV_PROXY: '1'`; das Flag wird zurueckgehalten, wenn ein Proxy-Wert, den das Kind erhaelt, von diesem Paket abgelehnt wurde (`src/install.ts:262-279`). Grenzen: keine SOCKS-/PAC-/OS-Proxy-Erkennung, kein eigenes CA-Handling, Telemetrie bleibt absichtlich direkt (`README.md:107-111`).

### 6.7 `output-retention` — `@deepseek-ai/dsh-output-retention`

**Zweck.** Bounded-Retention-Primitive: ein Aufrufer speist Items oder Textchunks in ein begrenztes Objekt und erhaelt den behaltenen Inhalt plus exakte Auslassungsmetadaten (`packages/util/output-retention/src/index.ts:1-31`).

**Exporte:** `type Omitted = { kind: 'none' } \| { kind: 'exact'; count: number } \| { kind: 'unknown' }` · `interface PushDecision { kept: boolean; truncated: boolean }` · `interface RetainedItems<T> { items: T[]; truncated: boolean; seen: number; kept: number; omitted: Omitted }` · `interface RetainedText { text: string; truncated: boolean; omittedBytes: Omitted }` · `type ItemRetentionStrategy = { kind: 'head'; maxItems: number }` · `type TextRetentionStrategy = { kind: 'head'; maxBytes: number } \| { kind: 'tail'; maxBytes: number } \| { kind: 'headTail'; headBytes: number; tailBytes: number }` · `interface RetentionNotice { scope: string; strategy: 'head' \| 'tail' \| 'headTail'; unit: 'items' \| 'bytes' \| 'chars' \| 'lines'; limit: number \| { head: number; tail: number }; kept: number; omitted: Omitted }` · `class ItemRetainer<T> { constructor(strategy: ItemRetentionStrategy); push(item: T): PushDecision; finish(): RetainedItems<T> }` · `class TextRetainer { constructor(strategy: TextRetentionStrategy); push(chunk: Uint8Array \| string): PushDecision; finish(): RetainedText }` · `describeOmitted(omitted: Omitted, unit: RetentionNotice['unit']): string` · `formatRetentionNotice(notice: RetentionNotice, recovery: (notice: RetentionNotice) => string): string` · `truncateWithoutSplittingSurrogatePair(text: string, maxChars: number): string`.

**Verhalten.** Budgets muessen nicht-negative ganze Zahlen sein, sonst wirft `assertBudget` (`${name} must be a non-negative integer`) (`src/index.ts:129-134`). `truncated` ist reine Budget-Tatsache und bedeutet **nie** „Upstream war unvollstaendig". `TextRetainer` rechnet in **Bytes**, haelt hoechstens `prefixCap + suffixCap + ein Chunk` und schneidet an jeder Kante eine unvollstaendige UTF-8-Sequenz weg (`trimTrailingPartialUtf8` laeuft maximal 3 Continuation-Bytes zurueck, `trimLeadingContinuationUtf8` ueberspringt fuehrende `10xxxxxx`); ohne echte Auslassung wird der zusammenhaengende Puffer als **ein** Buffer dekodiert. `finish()` meldet die Auslassung gegen die *tatsaechlich zurueckgegebenen* Bytes (`src/index.ts:337-386`). `describeOmitted` druckt bei `exact` die Zahl (`Omitted 3 items.`), bei `unknown` keine Zahl, bei `none` den Leerstring.

### 6.8 `workspace-path` — `@deepseek-ai/dsh-util-workspace-path`

**Zweck.** Browser-sichere Workspace-Pfad- und Anzeigehelfer (`packages/util/workspace-path/README.md:12`).

**Exporte:** `isAbsoluteWorkspacePath(path: string): boolean` · `resolveWorkspacePath(cwd: string \| undefined, path: string): string` · `abbreviateHomePath(path: string, home?: string): string` · `workspaceTitleOf(path: string): string` · `pathPartsOf(path: string): { readonly directory: string; readonly name: string }` · `fileAddressFor(sessionId: string, cwd: string \| undefined, path: string): string` · `relativizeToCwd(text: string, cwd: string \| undefined): string` · `fileMediaUrl(base: string, path: string): string \| undefined` · `type FileAddress = { readonly scope: 'session'; readonly sessionId: string; readonly path: string } \| { readonly scope: 'absolute'; readonly path: string }` · `sessionFileAddress(sessionId: string, path: string): string` · `absoluteFileAddress(path: string): string` · `parseFileAddress(address: string): FileAddress \| undefined`.

**Verhalten.** Absolut heisst POSIX (`/a/b`) oder Windows-Laufwerk bzw. UNC (`/^[A-Za-z]:[/\\]/` oder Praefix `\\\\`) (`src/index.ts:8-19`). `resolveWorkspacePath` behaelt den Separatorstil des Workspace-Roots (`src/index.ts:27-34`). `abbreviateHomePath` ist POSIX-only. `fileMediaUrl` akzeptiert nur `https?:`-Basen oder `dsh-app://app/`, verlangt einen absoluten Pfad und lehnt Netzwerkpfad-Praefixe sowie Steuerzeichen `[\u0000-\u001f\u007f]` ab; das Ergebnis ist `new URL(`api/file?path=${encodeURIComponent(path)}`, base).href` (`src/index.ts:120-124`). Die Adressgrammatik kodiert jedes Segment komponentenweise, laesst `:` fuer Laufwerksbuchstaben literal, ignoriert Query/Fragment und wirft nie (`src/file-address.ts:44-52,89-111`). Aufloesung ist rein lexikalisch (`README.md:37`).

### 6.9 `crypto` — `@deepseek-ai/dsh-util-crypto`

**Zweck.** UUID-Erzeugung, die in jeder ausgelieferten JavaScript-Umgebung funktioniert, weil `crypto.randomUUID` eine Secure-Context-Web-API ist, `crypto.getRandomValues` dagegen ueberall verfuegbar (`packages/util/crypto/src/index.ts:1-10`).

**Exporte:** `type Uuid = \`${string}-${string}-${string}-${string}-${string}\`` · `bytesToBase64(data: Uint8Array): string` · `randomUUID(): Uuid`.

**Verhalten.** `bytesToBase64` kodiert in 0x8000-Byte-Chunks ueber `String.fromCharCode(...)` und `btoa`, um Argumentgrenzen nicht zu ueberschreiten. `randomUUID` zieht 16 Bytes aus `globalThis.crypto.getRandomValues` und setzt Version 4 im High-Nibble von Byte 6 sowie Variante `10` in Byte 8; keine weiteren UUID-Versionen, Namespaces oder Parser (`README.md:57-58`).

### 6.10 `values` — `@deepseek-ai/dsh-util-values`

**Zweck.** Duplicate-install-sichere JSON- und Immutable-Value-Primitive (`packages/util/values/src/index.ts:1`).

**Exporte:** `type JsonValue = null \| boolean \| number \| string \| JsonValue[] \| { [key: string]: JsonValue }` · `assertNever(value: never, context?: string): never` · `snapshotJsonValue<T>(value: T): T \| undefined` · `isJsonValue(value: unknown): boolean` · `deepEqualJson(a: unknown, b: unknown): boolean` · `deepFreeze<T>(value: T): T` · `class WeakMapWithValues<Key extends object, Value> { readonly values: ReadonlySet<Value>; get(key); has(key); set(key, value); delete(key): boolean; clear(): void }` · `interface LengthReadOptions { readonly step?: number; readonly offset?: number }` · `class PartialArguments { static readonly EMPTY; static fromText(text: string): PartialArguments; static fromObject(value: unknown): PartialArguments; get isSealed(): boolean; get invalid(): boolean; append(fragment: string): void; settle(text: string): PartialArguments; refresh(): boolean; closed(): boolean; keys(): readonly string[]; has(key): boolean; complete(key): boolean; stringLength(key, options?): number \| undefined; stringExceeds(key, maxLength): boolean; text(key): string \| undefined; textPrefix(key, maxLength): string \| undefined; value(key): JsonValue \| undefined }`.

**Verhalten.** `isJsonValue`/`snapshotJsonValue` akzeptieren nur verlustfreie Wurzeln: `null`, Booleans, endliche Zahlen ausser `-0`, Strings, dichte intrinsische Arrays und Plain- bzw. Null-Prototype-Records mit aufzaehlbaren String-Keys; Zyklen, sparse Arrays, Symbol- oder nicht-aufzaehlbare eigene Properties, Funktionen und Klasseninstanzen werden abgelehnt (`src/index.ts:119-155,172-183`). Der Walker ist **iterativ** ueber einen expliziten Task-Stack. `deepFreeze` friert in place ein und laesst `AbortSignal`-Instanzen absichtlich mutabel (`src/index.ts:210-239`). `WeakMapWithValues` raeumt nie automatisch auf (`README.md:50,92`). `PartialArguments` ist eine lazy gescannte Sicht auf die Top-Level-Felder eines JSON-Objekts (`src/partial-json.ts:147-195`).

### 6.11 `deque` — `@deepseek-ai/dsh-deque`

**Zweck.** Zirkulaere Deque fuer Queues, die Eintraege ueber asynchrone Arbeit hinweg halten (`packages/util/deque/src/index.ts:1-12`).

**Exporte:** `class Deque<T> { get size(): number; pushBack(value: T): void; pushFront(value: T): void; popFront(): T \| undefined; clear(): void }`.

**Verhalten.** Startkapazitaet `MIN_CAPACITY = 16`; Wachstum verdoppelt, Schrumpfung halbiert, sobald die Anzahl auf ein Viertel der Kapazitaet faellt und die Kapazitaet ueber dem Minimum liegt (`compact`, `src/index.ts:74-82`). `popFront` setzt den Slot sofort auf `undefined`; bei leerer Deque kommt `undefined` zurueck (`src/index.ts:45-60`). Kein Limit, keine Koaleszierung (`README.md:93`).

### 6.12 `time` — `@deepseek-ai/dsh-util-time`

**Zweck.** Zeitvokabular fuer Wire-Grenzen, die eine Zeitzone vom Aufrufer annehmen: nur Validierung und Kanonisierung (`packages/util/time/src/index.ts:1-6`).

**Export:** `canonicalClientTimeZone(value: string): string | undefined`.

**Verhalten.** Akzeptiert wird `'UTC'` oder ein IANA-`Area/Location`-Name gegen `/^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)+$/`; leer, mit umgebenden Leerzeichen (weil `value.trim() !== value`), abgekuerzt oder einsegmentig wird abgelehnt. Die kanonische Schreibweise kommt aus `new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone` (`src/index.ts:20-33`). Alias-Aufloesung folgt den ICU-Daten der Laufzeit (`README.md:57`).

### 6.13 `timeout` — `@deepseek-ai/dsh-timeout`

**Zweck.** Geteilte Timeout-Arithmetik, Signal-Fusion und Klassifikation; die Bibliothek benachrichtigt nur ueber Abort-Signale (`packages/util/timeout/src/index.ts:1-6`).

**Exporte:** `class TimeoutReason extends Error { override name = 'TimeoutReason'; constructor(readonly code: string, readonly timeoutMs: number) }` · `MAX_TIMER_DELAY_MS: number = 2_147_483_647` · `clampTimeout(requested: number \| undefined, def: number, max: number, name = 'timeoutMs'): number` · `interface Deadline { readonly signal: AbortSignal; [Symbol.dispose](): void }` · `interface IdleWatchdog { readonly signal: AbortSignal; next<T>(iterator: AsyncIterator<T>): Promise<IteratorResult<T>>; pulse(): void; [Symbol.dispose](): void }` · `deadline(upstream: AbortSignal \| undefined, timeoutMs: number, code: string): Deadline` · `idleWatchdog(upstream: AbortSignal \| undefined, timeoutMs: number, code: string): IdleWatchdog` · `timeoutOf(x: AbortSignal \| { reason?: unknown }, code?: string): TimeoutReason \| undefined`.

**Verhalten.** `clampTimeout` lehnt nicht-endliche oder `<= 0`-Hinweise ab (`${name} must be a positive finite number`) und liefert `min(requested ?? def, max)`. `deadline` behandelt `timeoutMs <= 0` als internen No-Timer-Sentinel; sonst validiert `assertTimerDelay` positiv/endlich/`<= MAX_TIMER_DELAY_MS` und fusioniert ueber `AbortSignal.any([upstream, timer.signal])`. `timeoutOf` liest nur einen `TimeoutReason` und, wenn `code` angegeben ist, nur mit exakt diesem `code`. `idleWatchdog` haelt ein stabiles Signal, armt den Timer nur waehrend eines ausstehenden `next()`, rearmt per `pulse()`, lehnt einen zweiten gleichzeitigen `next()`-Aufruf ab (`idleWatchdog next is already outstanding`) und wirft nach Disposal (`idleWatchdog is disposed`); der Deadline-Ablauf settelt die ausstehende Forderung selbst ueber `Promise.race` gegen ein `expired`-Promise (`src/index.ts:145-183`; `README.md:140-143`).

### 6.14 `brand` — `@deepseek-ai/dsh-brand`

**Zweck.** Nominale Primitiv-Typen ohne Laufzeitidentitaet oder Zustand (`packages/util/brand/src/index.ts:1-13`).

**Exporte:** `type Branded<B extends string> = string & { readonly [BRAND]: B }` · `type BrandedNumber<B extends string> = number & { readonly [BRAND]: B }` · `brandString<T extends Branded<string>>(value: string \| T): T` · `brandNumber<T extends BrandedNumber<string>>(value: number \| T): T`; `BRAND` ist ein modulprivates `unique symbol`.

**Verhalten.** Das private Symbol existiert zur Laufzeit nicht. Beide Konstruktoren geben ihre Eingabe unveraendert zurueck und validieren nichts (`README.md:76-79`).

### 6.15 `lazy-require` — `@deepseek-ai/dsh-lazy-require`

**Zweck.** Haelt eine CommonJS-kompatible Host-Abhaengigkeit bis zur ersten echten Operation ungeladen; die Aufloesung bleibt relativ zum konsumierenden Paket (`packages/util/lazy-require/README.md:12`).

**Export:** `createLazyRequire<T>(specifier: string, parentURL: string \| URL): () => T`.

**Verhalten.** `createRequire(parentURL)` wird einmal beim Aufruf der Factory gebildet; der Loader cached **nur ein erfolgreiches** Ergebnis (`loaded`-Flag) (`src/index.ts:14-23`). Nur CJS-kompatible Abhaengigkeiten; der statische WebWorker-Packer entdeckt Abhaengigkeiten, die nur in `createLazyRequire()`-Aufrufen genannt werden, nicht (`README.md:80-81`).

### 6.16 `chunked-list` — `@deepseek-ai/dsh-chunked-list`

**Zweck.** Persistente Append-only-Listen mit begrenztem Kopieraufwand und Zod-Validierung von JSON-Checkpoints (`packages/util/chunked-list/src/index.ts:1-8`). Dependency `zod: ^4.4.3`.

**Exporte:** `interface ChunkedList<T> { readonly values: readonly T[]; readonly previous?: ChunkedList<T> \| undefined }` · `appendChunkedList<T>(head: ChunkedList<T> \| undefined, value: T): ChunkedList<T>` · `iterateChunkedList<T>(head: ChunkedList<T> \| undefined): Generator<T>` · `chunkedListSchema<T>(valueSchema: z.ZodType<T>): z.ZodType<ChunkedList<T>>`.

**Verhalten.** `CHUNK_CAPACITY = 64`: `appendChunkedList` kopiert hoechstens einen Chunk; aeltere Versionen bleiben unveraendert. Die leere Liste ist `undefined`. `iterateChunkedList` sammelt erst alle Chunks und gibt sie umgekehrt aus. `chunkedListSchema` verlangt `values` mit `.min(1).max(64)`, ein optionales `previous` und `.strict()` (`src/index.ts:52-57`, `README.md:38`).

### 6.17 `code-language` — `@deepseek-ai/dsh-util-code-language`

**Zweck.** Die eine Dateiendung-zu-Syntaxhighlighting-Sprache-Tabelle des Repositories (`packages/util/code-language/src/index.ts:1-14`).

**Exporte:** `CODE_HIGHLIGHT_EXTENSIONS: readonly string[]` · `languageForPath(path: string): string \| undefined` · `readLangHintForPath(path: string): string \| undefined`. Nicht exportiert: `LANGUAGE_EXTENSIONS`, `READ_LANG_BY_EXTENSION`, `SHORT_BY_LANGUAGE`, `extensionForPath`.

**Verhalten.** Die Endung ist der Text nach dem letzten Punkt des letzten Pfadsegments, kleingeschrieben; beide Separatoren `/` und `\` werden erkannt. `.env` → `dotenv`, waehrend `.gitignore`, ein fehlender Punkt und eine unbekannte Endung `undefined` liefern. Nachschlagen geschieht in einer `Map`, damit `foo.constructor` oder `foo.__proto__` keinen `Object.prototype`-Member aufloesen. `readLangHintForPath` behaelt einen bereits persistierten Wert fuer `tsx`, `jsx`, `tf`, `tfvars`, `gradle`, sonst kommt der Kurzname aus `SHORT_BY_LANGUAGE` (`powershell` → `ps1`, `hcl` → `tf`, `system-verilog` → `sv`). `pem`, `crt`, `key`, `cer`, `lock` sind bewusst nicht gelistet; `properties` bildet auf `ini` ab; endungslose Namen (`Dockerfile`, `Makefile`, `.editorconfig`) bleiben ungelistet (`src/index.ts:16-29,94-129`, `README.md:35`).

### 6.18 `identity/anonymous-user-id`
Vollstaendig in Abschnitt 4.6 behandelt.

---

## 7. Bundles / Kompositionen

Alle Bundles deklarieren ihren Patch ueber das Manifestfeld `dsh.bundle.patch`; `bundlePatchFiles` akzeptiert einen String oder eine Liste (`packages/boot/app-boot/src/profile.ts`). Ein Patch **ersetzt** das gesamte `config` der Zielzeile. **Kein** Bundle deklariert `bin`.

| Bundle | Paketname | Rolle | `dsh.bundle.patch` | Belegdatei |
|---|---|---|---|---|
| `base` | `@deepseek-ai/dsh-base` | **gemeinsamer Kern** aller base-gestuetzten Profile (keine Oberflaeche) | `./cordis.patch.yml` | `packages/bundle/base/package.json` |
| `web-app` | `@deepseek-ai/dsh-web-app` | **das Web-App-Bundle** (Browser-GUI, `dsh --profile web`) | `./cordis.patch.yml`, `./presets/standard.patch.yml`, `./presets/ptc.patch.yml`, `./presets/minimal.patch.yml`, `./presets/cordis.patch.yml` | `packages/bundle/web-app/package.json` |
| `headless` | `@deepseek-ai/dsh-headless` | **Headless-Bundle**: Einmal-Task, kein Host/HTTP/Browser | `./cordis.patch.yml` | `packages/bundle/headless/package.json` |
| `sdk-app` | `@deepseek-ai/dsh-sdk-app` | **SDK-Bundle** ueber `dsh-base`: stdio-JSON-RPC | `./cordis.patch.yml` | `packages/bundle/sdk-app/package.json` |
| `sdk-minimal` | `@deepseek-ai/dsh-sdk-minimal` | **SDK-Bundle, eigenstaendig** (kein `dsh-base`-Layer) | `./cordis.patch.yml` | `packages/bundle/sdk-minimal/package.json` |
| `acp-app` | `@deepseek-ai/dsh-acp-app` | ACP-Automations-Bundle ueber `dsh-base` | `./cordis.patch.yml` | `packages/bundle/acp-app/package.json` |

**Klarstellung.** Das **Web-App-Bundle** ist `@deepseek-ai/dsh-web-app`. Die **Headless-/SDK-Bundles** sind `@deepseek-ai/dsh-headless`, `@deepseek-ai/dsh-sdk-app` und `@deepseek-ai/dsh-sdk-minimal` (dazu das ACP-Bundle `@deepseek-ai/dsh-acp-app`).

Die ausgelieferten Profil-Templates (`PROFILE_TEMPLATES`, `packages/boot/app-boot/src/profile.ts:179-195`): `acp` = `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-acp-app']`; `web` = `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']`; `headless` = `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']`; `sdk` = `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-sdk-app']`; `sdk-minimal` = `['@deepseek-ai/dsh-sdk-minimal']`. Default fuer namenlose Profile: `DEFAULT_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base']`.

### 7.1 `base` — vollstaendige Plugin-Liste in Dateireihenfolge

`packages/bundle/base/cordis.patch.yml` ist **ein einziger `insert`** ueber den leeren Profil-Root; die Zeilenreihenfolge traegt laut Kopfkommentar **keine** Ladesemantik (Aktivierung ist Service-Verfuegbarkeits-getrieben). 94 Zeilen:

1. `tool-plugin-manager` (`@deepseek-ai/dsh-plugin-manager/tools`, `disabled: true`) · 2. `plugin-manager` (`@deepseek-ai/dsh-plugin-manager`) · 3. `timer` (`@deepseek-ai/cordis-plugin-timer`) · 4. `hmr` (`@deepseek-ai/dsh-hmr`) · 5. `llm` (`@deepseek-ai/dsh-llm`) · 6. `deepseek-llm-api-extensions` · 7. `session` · 8. `session-log-deepseek` · 9. `typert` (`@deepseek-ai/dsh-typert-registry`) · 10. `typert-loader` · 11. `typert-gateway` (`@deepseek-ai/dsh-api-gateway`) · 12. `session-title` · 13. `session-title-llm` (`@deepseek-ai/dsh-session-title-first-prompt-llm`) · 14. `user-questions` · 15. `agent` · 16. `plugin-package-inventory-deepseek` · 17. `agent-default-model` (`provider: deepseek-official`, `model: deepseek-flash`) · 18. `jobs` (`@deepseek-ai/dsh-jobs-local`) · 19. `llm-retry` · 20. `config-editor` (`@deepseek-ai/dsh-config-editor`) · 21. `settings` (`@deepseek-ai/dsh-settings`) · 22. `authorization` · 23. `deepseek-account` (`@deepseek-ai/dsh-deepseek-account-platform`) · 24. `credentials` (`@deepseek-ai/dsh-credentials-local`) · 25. `llm-pi-ai` · 26. `session-persistence-jsonl` (`root: !!js dshHomePath('sessions')`) · 27. `attachment-local` · 28. `session-query-sqlite` (`path: ':memory:'`, `openAt: never`) · 29. `working-directory` · 30. `tool-working-directory` · 31. `session-projection` · 32. `storage` · 33. `storage-json` (`root: !!js dshHomePath('storages')`) · 34. `storage-domain` (`backend: json`) · 35. `session-projection-cache` · 36. `otel` · 37. `session-telemetry-otel` · 38. `subprocess` (`@deepseek-ai/dsh-subprocess-local`) · 39. `sandbox` (`@deepseek-ai/dsh-sandbox-local`) · 40. `sandbox-policy` · 41. `bash-sandbox` · 42. `pwsh-sandbox` · 43. `approval` (`@deepseek-ai/dsh-user-approval`) · 44. `permission` (`@deepseek-ai/dsh-permission-presets`) · 45. `shell-env` · 46. `tool-bash` · 47. `tool-pwsh` · 48. `tool-jobs` · 49. `fs-observation-policy` · 50. `tool-fs` · 51. `tool-fs-search` · 52. `agent-instructions` · 53. `skill` · 54. `skill-filesystem` · 55. `tool-skill` · 56. `commands` · 57. `command-feedback` · 58. `goal` · 59. `goal-round-driver` · 60. `command-goal` · 61. `plan-mode` · 62. `token-meter` · 63. `compaction-basic` · 64. `command-compact` · 65. `subagent` · 66. `subagent-spawn-in-process` · 67. `subagent-fork-in-process` · 68. `tool-subagent-control` · 69. `tool-subagent-list-agents` (`@deepseek-ai/dsh-tool-subagent-control/list-agents`) · 70. `tool-subagent` · 71. `tool-subagent-fork` · 72. `ptc-runtime` (`@deepseek-ai/dsh-ptc-runtime-node`) · 73. `workflow-ptc` · 74. `tool-workflow` · 75. `timeout-policy` (`@deepseek-ai/dsh-tool-call-timeout-policy`) · 76. `spill-local` · 77. `spill-policy` · 78. `session-checkpoint-policy` · 79. `tool-result-pruner` (`@deepseek-ai/dsh-compaction-tool-result-pruner`) · 80. `image-offload` (`@deepseek-ai/dsh-compaction-image-offload`) · 81. `tool-todo` · 82. `tool-goal` · 83. `repeat-tool-reminder` · 84. `web` (`searchProvider: deepseek-official`, `fetchProvider: http`) · 85. `web-search-deepseek` (`apiKeyEnv: DEEPSEEK_API_KEY`) · 86. `web-fetch-http` · 87. `tool-web` · 88. `mcp-resources` · 89. `tools` · 90. `system-prompt` (`personaPrefix: ''`) · 91. `agent-loop` (`agents: []`) · 92. `fs-sandbox` · 93. `llm-deepseek` (`@deepseek-ai/dsh-llm-deepseek-api-key`) · 94. `llm-deepseek-account`.

Jede Zeile ist ein `insert`-Eintrag ohne `apply`-Phase; Bedingungen stehen als `!!js`-Ausdruecke im Feld `disabled` (z. B. `!ctx.get('profileContext')` fuer `plugin-manager`, `hmr`, `config-editor`, `settings`; Plattformgates fuer `bash-sandbox`/`pwsh-sandbox`/`tool-bash`/`tool-pwsh`). `src/index.ts` exportiert nur `export {}` — „this module carries no runtime API" (`packages/bundle/base/src/index.ts`). Kein `src/startup.ts` vorhanden.

### 7.2 `web-app`

**`cordis.patch.yml`** besteht aus drei Abschnitten (`packages/bundle/web-app/cordis.patch.yml`):
- **Abschnitt A** — Ueberschreiben von Base-Zeilen (vollstaendig neu gesetztes `config`): `system-prompt` (personaPrefix), `session-query-sqlite`, `tools` (`mode: !!js process.env.DSH_TOOLS_MODE`).
- **Abschnitt B** — ein `insert` mit **89 Zeilen** in Dateireihenfolge: `desktop-product-telemetry` (`@deepseek-ai/dsh-host-product-telemetry-otel`), `product-analytics` (`@deepseek-ai/dsh-client-product-analytics`), `subagent-model-selection-settings` (`@deepseek-ai/dsh-tool-subagent/model-selection-settings`), `message-feedback`, `session-log-download` (`@deepseek-ai/dsh-session-log-export`), `open-in-app` (`@deepseek-ai/dsh-host-open-in-app`), `ui-open-in-app`, `workspace`, `session-reference`, `file-reference-local`, `session-stats`, `session-turn-outline`, `directory-picker` (`@deepseek-ai/dsh-host-directory-picker-auto`), `plugin-inventory` (`@deepseek-ai/dsh-host-plugin-inventory`), `session-controller` (`@deepseek-ai/dsh-api-session-controller`), `job-controller`, `terminal-controller`, `workspace-files`, `schedule`, `ui-settings-account`, `account-controller`, `settings-controller`, `workspace-controller`, `cordis-host-runner`, `cordis-inspect-providers` (`@deepseek-ai/dsh-tool-cordis/host`), `web-startup` (`@deepseek-ai/dsh-web-app/startup`), `webserver` (`@deepseek-ai/dsh-host-webserver`, `inject: [webStartup]`), `web-runtime` (`@deepseek-ai/dsh-web-app`, `inject: [webStartup]`), `client-hmr`, `modules` (`@deepseek-ai/dsh-client-modules`), `connection` (`@deepseek-ai/dsh-client-connection`, `inject: [webStartup]`), `file-upload`, `api-remotes`, `cordis-client-runner`, `ui-theme`, `locale`, `shortcuts`, `ui-shortcuts`, `ui-layout`, `ui-renderer`, `ui-session`, `resources`, `ui-sidebar`, `ui-sidebar-right`, `office-to-pdf`, `ui-sidebar-documentpreview`, `ui-sidebar-browser`, `ui-sidebar-terminal`, `ui-sidebar-files`, `ui-settings`, `ui-settings-general`, `ui-settings-models`, `ui-plugin-manager`, `ui-settings-plugin-inventory`, `ui-conversation`, `ui-approval`, `ui-chat`, `ui-brand-official`, `ui-attachment`, `ui-tool`, `ui-cordis`, `ui-deliverables`, `workspace-changes`, `ui-workspace`, `ui-workflow-run`, `ui-input-trigger`, `ui-commands`, `ui-skill`, `ui-subagent`, `ui-reference`, `ui-jobs`, `ui-schedule`, `ui-goal`, `ui-message-feedback`, `ui-model-selection`, `ui-permission` (`@deepseek-ai/dsh-client-ui-permission-presets`), `ui-agent-preset`, `ui-settings-session-log`, `ui-settings-plugins`, `ui-settings-shell`, `ui-settings-agent-loop`, `ui-settings-subagent`, `ui-settings-web-search`, `ui-plan`, `ui-user-questions`, `ui-trajectory`.
- **Abschnitt C** — Deaktivierungen der agent-plane-Zeilen aus `base` (nur `id` + `disabled: true`): `tool-plugin-manager`, `tool-bash`, `tool-pwsh`, `tool-jobs`, `tool-fs`, `tool-fs-search`, `skill-filesystem`, `tool-skill`, `command-goal`, `tool-goal`, `plan-mode`, `compaction-basic`, `command-compact`, `tool-result-pruner`, `tool-subagent-control`, `tool-subagent-list-agents`, `tool-subagent`, `tool-subagent-fork`, `workflow-ptc`, `tool-workflow`, `agent-instructions`, `tool-todo`, `tool-web`; danach der `insert` der Zeile `agent-preset-registry` (`@deepseek-ai/dsh-agent-preset-registry`, `config.default: 'standard'`).

**Presets** (`presets/*.patch.yml`, angewandt in der Reihenfolge aus `dsh.bundle.patch`; jede Datei setzt die Zeile `preset-<id>` auf `@deepseek-ai/dsh-agent-preset`):

| Preset | Datei | Registrierte Kind-Zeilen (Reihenfolge; `cordis:group` als Gruppe) |
|---|---|---|
| `standard` | `presets/standard.patch.yml` | `persona` (`@deepseek-ai/dsh-persona`), `agent-instructions`, `time-context`, `tool-bash`, `tool-pwsh`, `tool-fs`, `tool-fs-search`, `tool-jobs`, `tool-schedule`, `skill-filesystem`, `tool-skill`, `command-goal`, `tool-goal`, `planning`-Gruppe (`plan-mode`), `compaction`-Gruppe (`compaction-basic`, `command-compact`, `tool-result-pruner`), `delegation`-Gruppe (`tool-subagent-control`, `tool-subagent-list-agents`, `tool-subagent`, `tool-subagent-fork`, `workflow-ptc`, `tool-workflow`), `tool-ask-user`, `tool-todo`, `tool-web`, `present` (`@deepseek-ai/dsh-tool-present`), `tool-plugin-manager` (`disabled: true`) |
| `ptc` | `presets/ptc.patch.yml` | wie `standard`, jedoch mit `tool-presentation` (`@deepseek-ai/dsh-agent-tool-presentation`) und `workflow-ptc`/`tool-workflow` auf `disabled: true` |
| `minimal` | `presets/minimal.patch.yml` | `persona`, `persistent-shell`-Gruppe (`pty` → `@deepseek-ai/dsh-terminal`, `terminal-bash`, `persistent-bash`, `terminal-pwsh`, `persistent-pwsh`) |
| `cordis` | `presets/cordis.patch.yml` | wie `standard` plus `tool-cordis` (`@deepseek-ai/dsh-tool-cordis`); `tool-plugin-manager` mit `disabled: !!js "!ctx.get('profileContext')"` |

**Entry Point.** `main: lib/index.js`; zusaetzlich `"./startup"` → `lib/startup.js` (`packages/bundle/web-app/package.json`). `src/index.ts` exportiert `name = 'web-app'`, `inject = ['webServer']`, `interface Config`, `Config: z<Config>`, `internals` und `apply(ctx, config)`. Das Glue-Plugin loest das gebaute Frontend-Dist auf, mountet den Frontend-Static-Fallback, registriert den Surface-Prompt-Abschnitt und die Bash-Variable `DSH_WEB_URL`, druckt die URL-Zeile und oeffnet den Browser erst nach `auditStartupEntries`.

**Startverhalten** (`src/startup.ts`): `name = 'web-startup'`, `inject = ['cmdlineArgs']`, Service `WEB_STARTUP_SERVICE = 'webStartup'`; Kommando `dsh --profile web` mit `--host`, `--no-open`, `--port`, `--public-url`, `--trusted-host`, `--tls-cert`, `--tls-key`, `--help`. Wildcard-Hosts werden mit dem Hinweis auf Remote-Code-Ausfuehrung abgelehnt; `--port` muss numerisch sein; `--tls-cert`/`--tls-key` muessen paarweise kommen; `--public-url` wird ueber `parsePublicUrl` validiert. Veroeffentlicht wird `{ openBrowser, host?, port?, publicUrl?, trustedHosts, tls? }`.

**`src/public-url.ts`:** `parsePublicUrl(value: string, label = 'publicUrl'): URL` — weist ASCII-Whitespace/Steuerzeichen, fehlendes `http(s)://`, `?`/`#`, leere Authority und Credentials vor `@` zurueck und normalisiert den Pfad auf einen abschliessenden `/`.

### 7.3 `headless`

Patch `packages/bundle/headless/cordis.patch.yml`: Ueberschreibungen `system-prompt` (personaPrefix), `tools` (`mode: !!js process.env.DSH_TOOLS_MODE`); `insert` mit zwei Zeilen — `headless-startup` (`@deepseek-ai/dsh-headless/startup`) und `headless-runner` (`@deepseek-ai/dsh-headless`, `inject: [headlessStartup]`, Config `task`, `sessionId`, `json`); abschliessend `hmr` `disabled: true`.

`src/startup.ts` exportiert `name = 'headless-startup'`, `inject = ['cmdlineArgs']`, `HEADLESS_STARTUP_SERVICE = 'headlessStartup'`, `interface HeadlessStartupValues`, `apply(ctx)`; Flags `--json`, `--session-id <id>`, Positional `[task...]` (`-` liest stdin). Bei erkanntem `--json` wird `program.error` ueberschrieben, damit Grammatikfehler als `{ type: 'error', message }`-Zeile auf stdout erscheinen (`packages/bundle/headless/src/startup.ts`). Weitere Dateien: `src/index.ts` (Runner), `src/json-stream.ts`, `src/runner-internals.ts`, `src/startup-internals.ts`.

### 7.4 `sdk-app`

Patch `packages/bundle/sdk-app/cordis.patch.yml`: `session-title-llm` `disabled: true`; `insert` mit `sdk-app-startup` (`@deepseek-ai/dsh-sdk-app`, Config `profile: sdk`) und `sdk-jsonrpc-server` (`@deepseek-ai/dsh-sdk-jsonrpc-server`, `inject: [sdkAppStartup, loader]`, Config `maxTokensAsSuccess` aus `DSH_MAX_TOKENS_AS_SUCCESS`); `hmr` `disabled: true`; zweiter `insert` mit `workspace-dependencies` (`@deepseek-ai/dsh-tool-workspace-dependencies`) und `skill-office` (`@deepseek-ai/dsh-skill-office`), beide an `DSH_PRIMARY_RUNTIME`/`DSH_BUNDLED_PRIMARY_RUNTIME` gebunden.

`src/index.ts` exportiert `name = 'sdk-app-startup'`, `inject = ['cmdlineArgs']`, `SDK_APP_STARTUP_SERVICE = 'sdkAppStartup'`, `interface Config`, `Config: z<Config>` (`profile: z.string().default('sdk')`), `apply(ctx, config)`; Kommando `dsh --profile <profile>` ohne Optionen, bindet stdin-Ende ueber `exitOnStdinEnd`.

### 7.5 `sdk-minimal`

Patch `packages/bundle/sdk-minimal/cordis.patch.yml` ist laut Kopfkommentar **der vollstaendige Cordis-Baum** (kein `dsh-base`-Layer); ein `insert` mit 33 Zeilen in Reihenfolge: `sdk-app-startup` (`profile: sdk-minimal`), `sdk-jsonrpc-server` (`maxTokensAsSuccess: false`), `deepseek-llm-api-extensions`, `session-log-deepseek`, `plugin-package-inventory-deepseek`, `llm-deepseek` (`apiKeyEnv: DEEPSEEK_API_KEY`, `defaultContextWindow` aus `DSH_CONTEXT_WINDOW ?? 1000000`, `streamIdleTimeoutMs: 172800000`), `sandbox` (`@deepseek-ai/dsh-sandbox-local`), `filesystem` (`@deepseek-ai/dsh-fs-local`), `working-directory`, `tool-working-directory`, `session-projection`, `sandbox-policy` (`mode: danger-full-access`), `subprocess`, `pty` (`@deepseek-ai/dsh-terminal`), `terminal-bash`, `terminal-pwsh`, `timer`, `llm`, `session`, `session-title`, `system-prompt` (`includeHarnessIdentity: false`, `includeRuntimeContext: false`, `personaPrefix` aus `DSH_SYSTEM_PROMPT`), `tools`, `mcp-resources`, `agent`, `llm-retry`, `jobs`, `agent-loop` (`agents: []`), `persistent-bash`, `persistent-pwsh`, `sessions` (`@deepseek-ai/dsh-session-persistence-jsonl`, `root: !!js dshHomePath('sessions')`, `compression: none`). `src/index.ts` exportiert nur `export {}`.

### 7.6 `acp-app`

Patch `packages/bundle/acp-app/cordis.patch.yml`: `system-prompt` (personaPrefix), `session-title-llm` `disabled: true`; `insert` mit `acp-app-startup` (`@deepseek-ai/dsh-acp-app`) und `acp` (`@deepseek-ai/dsh-acp`, `inject: [acpAppStartup]`, Config `provider: deepseek-official`, `model: deepseek-v4-flash`); `hmr` `disabled: true`. `src/index.ts` exportiert `name = 'acp-app-startup'`, `inject = ['cmdlineArgs']`, `ACP_APP_STARTUP_SERVICE = 'acpAppStartup'`, `apply(ctx)`; Kommando `dsh --profile acp` ohne Optionen, `exitOnStdinEnd(ctx, 'acp-app.stdin')`.

---

## 8. Das C-Addon (`native/system`) — vollstaendig

`native/system` ist der **einzige** C-Code des Repositories. Er ist ein eigenstaendiger pnpm-Workspace mit eigenem Versions- und Release-Zyklus, teilt aber Root-pnpm-Workspace und Lockfile (`native/system/AGENTS.md`).

### 8.1 Was es tut und warum es existiert

Der Workspace besitzt `@deepseek-ai/node-addon-system` und liefert zwei native Mechanismen an Node-Aufrufer: ein Linux-`landlock-run`-Confinement-Executable und ein POSIX-`system.node`-Binding fuer Dateisperren (`native/system/AGENTS.md`, `native/system/docs/architecture.md`).

| Aspekt | Fakt | Quelle |
|---|---|---|
| Zweck | Vorkompilierte System-Primitive: Linux-Confinement und POSIX-`Session`-Write-Locks | `native/system/README.md` |
| Gelostes Problem | Konsumenten installieren nur Binaerdateien; **kein Installations-Build** nativen Codes | `native/system/README.md`, `docs/packaging.md` |
| Landlock-Notwendigkeit | Fuer Linux-Hosts, auf denen `bwrap` unbrauchbar ist (nicht installiert, unprivilegierte User-Namespaces deaktiviert, LSM-Profil verweigert `mount`); Landlock ist eine unabhaengige Syscall-Familie | `native/system/packages/entry/src/main.c` |
| Fail-closed | Kann das Ruleset nicht erstellt oder nicht erzwungen werden, beendet sich der Launcher **ohne** `exec` der Kommandozeile | ebd. |
| Warum JS das nicht kann | Das Ruleset muss auf dem Prozess selbst installiert werden (`no_new_privs` + `landlock_restrict_self`) und ueber `execve` vererbt werden — reines JS kann weder Raw-Syscalls absetzen noch `no_new_privs` setzen | ebd. |
| Warum JS das nicht kann (Lock) | `flock(fd, LOCK_EX \| LOCK_NB)` muss off-thread laufen und `errno` am Worker erfassen; Node bietet kein flock in `fs` | `native/system/docs/flock-contract.md`, `packages/entry/src/flock.c` |
| Import-Verhalten | Kein Root-Export; `./landlock-run` und `./flock` sind unabhaengige Capability-Exporte, Import laedt **kein** Addon | `native/system/AGENTS.md`, `packages/entry/package.json` |
| Fehlende Payloads | Fehlende Landlock-Binaerdateien proben `unusable`; fehlende flock-Bindings lehnen die Acquisition ab, gewaehren **nie** stillschweigend eine Sperre | `native/system/AGENTS.md` |
| Windows | Windows nutzt die bestehende Harness-Semaphore-Implementierung und ruft dieses POSIX-Binding nie auf | `docs/architecture.md`, `docs/support-matrix.md` |
| Browser-Worker | Liefert einen Single-Process-Ersatz fuer den flock-Eintrag; die Landlock-JS-API laeuft unveraendert | `docs/architecture.md` |
| Policy-Grenze | Sandbox-Policy und `Session`-Lifecycle bleiben beim Aufrufer | `native/system/README.md`, `docs/architecture.md` |

### 8.2 Das flock-Kontrakt (`native/system/docs/flock-contract.md`)

Die C-Seite laeuft ueber `packages/entry/src/flock.c` (Node-API v8), die JS-Seite ueber `packages/entry/src/flock.ts`.

**API-Form:** `tryLockExclusive(fd): Promise<void>` — genau **ein** `flock(fd, LOCK_EX | LOCK_NB)`-Versuch, off-thread.

| Operation / Bedingung | Eingaben | Ausgaben | Fehlerbedingung | Exakte Semantik | Quelle |
|---|---|---|---|---|---|
| `tryLock(fd, callback)` (natives Binding) | `fd` als C-`int`, `callback: (errno: number) => void` | `undefined` (Rueckgabe), Callback asynchron mit `0` oder positivem `errno` | Setup-Fehler werfen in die Promise | Laeuft `flock(fd, LOCK_EX \| LOCK_NB)` in asynchroner Arbeit, erfasst `errno` auf diesem Worker | `packages/entry/src/flock.c` |
| `tryLockExclusive(fd)` | `fd: number` (fd bleibt Eigentum des Aufrufers) | `Promise<void>`, erfuellt bei Acquisition | `EAGAIN`/`EWOULDBLOCK` bei Contention; andere Syscall-Fehler rejecten ebenfalls | Ein `flock`-Versuch, exklusiv und nicht blockierend | `docs/flock-contract.md`, `packages/entry/src/flock.ts` |
| Kein konkurrierender Lock | — | Acquisition loest zu `void` auf | — | Normalfall | `docs/flock-contract.md` |
| Dieselbe offene Dateibeschreibung sperrt erneut | gleicher `fd` | Erfolg | — | Erfolg **ohne zweiten Ownership-Eintrag** | ebd. |
| Getrennte `open`s derselben Datei | zwei `fd` | Genau ein exklusiver Halter | Contender rejected mit `EAGAIN`/`EWOULDBLOCK` | Exklusivitaet | ebd. |
| Verschiedene Dateien | zwei `fd` | beide sperrbar | — | Keine gegenseitige Beeinflussung | ebd. |
| Unabhaengiger C-flock-Halter | externer Prozess | Addon kann nicht erwerben; C-Oracle kann nicht erwerben, solange das Addon haelt | Contention | Gegenseitige Ausschliessung ueber Prozessgrenzen | ebd. |
| Shared-flock-Halter | `LOCK_SH` extern | — | exklusiver Versuch des Addons konfligiert | Shared vs. exclusive respektiert | ebd. |
| Halter bleibt lebendig | — | — | nicht-blockierender Versuch meldet Contention vor dem Unlock | Beweist Non-Blocking | ebd. |
| Gewoehnliches Lesen/Schreiben eines anderen Prozesses | beliebig | Zugriff erlaubt | — | `flock` ist **advisory**, kein I/O-Permission-Mechanismus | ebd. |
| Ein unabhaengiger Deskriptor schliesst | fremder `fd` derselben Datei | Halter behaelt Lock | — | Lock haengt an der *open file description* | ebd. |
| Deskriptor an Kind vererbt und offen | vererbter `fd` | Lock bleibt | — | Schliessen des Parent-Deskriptors gibt den Lock der geteilten OFD nicht frei | ebd. |
| Letzter besitzender Deskriptor schliesst | — | bereits offener Contender kann erwerben | — | Freigabe durch Schliessen | ebd. |
| Halterprozess endet oder wird gekillt | `SIGKILL` | Acquisition danach erfolgreich | **kein** Stale-Lock-Timeout | Kernel gibt Lock beim Prozessende frei | ebd. |
| Ungueltiger Deskriptor | `fd = -1` | Promise rejected | `EBADF`, positiver `errno` | Syscall-Fehler | `docs/flock-contract.md`, `native/system/test/flock.test.js` |
| Native Argumentvalidierung schlaegt fehl | z. B. `fd = 2**31` | rejected Promise | `RangeError: fd must be a signed C int` | Kein synchrones Werfen aus dem JS-Eintrag | ebd. |
| Nicht-Zahl als `fd` | `fd` ohne Zahl | — | `TypeError: fd must be a number` | Natives Argument-Gate | `packages/entry/src/flock.c` |
| Kein Callback / Nicht-Funktion | Argument 2 | — | `TypeError: callback must be a function` | Natives Argument-Gate | ebd. |
| Allokationsfehler | — | — | `Error` mit Code `ENOMEM` | Setup-Fehler | ebd. |
| Native Completion-Callback | — | erhaelt `0` oder den positiven `errno` der Anfrage, asynchron | — | Anforderungs-lokales Ergebnis | `docs/flock-contract.md` |
| Completion-Callback wirft | — | Exception erreicht Nodes Uncaught-Exception-Handler; Prozess endet mit Code `1` | — | Report ueber Nodes Async-Work-Dispatcher | ebd., `native/system/test/flock.test.js` |
| Gleichzeitige Erfolgs-/Fehleraufrufe | mehrere `fd` | jedes Completion erhaelt seinen eigenen Syscall-`errno` | — | Kein geteilter Fehlerzustand | `docs/flock-contract.md` |
| Worker-Umgebung terminiert vor/waehrend Callback | Worker-Terminierung | Native Arbeit und Cleanup laufen zu Ende, ohne den `fd` des Aufrufers zu uebernehmen | — | `napi_add_async_cleanup_hook` + `napi_cancel_async_work` | ebd., `packages/entry/src/flock.c` |

**Ownership und Lebenszyklus** (`docs/flock-contract.md`, `docs/architecture.md`, `packages/entry/src/flock.c`):
- Der Deskriptor gehoert dem Aufrufer und muss bis zur Completion offen bleiben.
- Das Binding oeffnet, dupliziert, schliesst und entsperrt **nie** explizit.
- Freigabe erfolgt durch Schliessen des letzten Deskriptors der *open file description*.
- Es gibt **keine** Blocking-Wait-API und **keine** Shared-Lock-API.
- Die native Callback-Signatur liefert `0` oder positiven `errno`; Promise- und Fehlerkonstruktion gehoeren JavaScript.

**Plattformverhalten POSIX vs. Windows** (`docs/flock-contract.md`, `docs/support-matrix.md`, `packages/entry/src/flock.ts`, `packages/session/session-persistence-jsonl/src/lease.ts`, `.../src/win32.ts`):

| Aspekt | POSIX (Linux/macOS) | Windows |
|---|---|---|
| Mechanismus | `flock(fd, LOCK_EX \| LOCK_NB)` ueber `system.node` | Named Kernel-Semaphore, abgeleitet vom kanonischen Lock-Pfad; **kein** Dateilock und kein Dateihandle |
| Plattform-Auswahl | `platform` muss `linux` oder `darwin` sein, sonst `ERR_FLOCK_UNSUPPORTED_PLATFORM` | Binding wird nie geladen; eigener Codepfad |
| Lock-Datei | `session.lock` neben dem Log (`LEASE_FILENAME`) | Keine Lock-Datei |
| Contention-Fehler | `EAGAIN`/`EWOULDBLOCK` → `SessionAlreadyOwnedError` | `WaitForSingleObject` mit Timeout `0` → `ERROR_SHARING_VIOLATION` → `EBUSY` → `SessionAlreadyOwnedError` |
| Stale-Locks / Prozessende | Kernel gibt beim Schliessen des letzten Deskriptors bzw. bei Prozessende frei; **kein** Ablauf-Timeout | Objekt stirbt mit dem letzten Handle, auch bei Prozessende; Nachfolger erstellt frisch |
| Inode-Pruefung | Nach dem Lock wird geprueft, dass der gesperrte Inode noch die Datei am Lock-Pfad ist (`stat`-Vergleich von `ino`/`dev` ueber `bigint`), sonst bis zu 3 Versuche | Entfaellt |
| Advisory-Charakter | flock ist advisory; Leser und Verzeichnisentfernung bleiben moeglich | Entfaellt, da kein Dateisystem-Objekt |
| Netzwerkdateisysteme | Koennen andere oder keine Lock-Semantik haben | — |
| Entfernen/Ersetzen des Pfads | Uebertraegt den Lock **nicht** auf den Ersatz-Inode | — |
| Garantie bei Fehlen | Fehlendes Binding → rejected Acquisition, nie stillschweigende Gewaehrung | Semaphore ist die vorhandene Implementierung |

### 8.3 Das CLI-Kontrakt (`native/system/docs/cli-contract.md`)

**Aufrufform (exakte argv-Gestalt):**

```text
landlock-run [--ro <path>]... [--rw <path>]... -- <argv>...
landlock-run --probe
```

| Argument | Bedeutung | Regel |
|---|---|---|
| `--ro <path>` | Gewaehrt read + execute unterhalb `<path>` | Wiederholbar |
| `--rw <path>` | Gewaehrt vollen Dateisystemzugriff unterhalb `<path>` | Wiederholbar |
| Nicht Gewaehrtes | Wird verweigert — Landlock-Rulesets sind Allow-Lists | — |
| Grant auf Nicht-Verzeichnis | Behaelt nur die dateikompatiblen Access-Bits (so funktioniert `--rw /dev/null`) | `packages/entry/src/main.c` |
| `--` | Pflicht-Trenner; alles danach ist die Kommando-argv, `exec`'t via `execvp` mit unveraenderter Umgebung des Launchers | Pflicht |
| `--probe` | Schliesst Grants und Kommando gegenseitig aus; `argc` muss exakt 2 sein | `packages/entry/src/main.c` |
| Andere Flags | Nicht erlaubt | ebd. |
| Umgebungsvariablen | Keine Eingaben — **keine** Env-Var-Overrides zur Laufzeit | `docs/cli-contract.md`, `native/system/AGENTS.md` |

**Exit-Codes (vollstaendige Liste)** aus `docs/cli-contract.md`, `packages/entry/src/main.c`, `packages/entry/src/index.ts`:

| Code | Konstante | Bedeutung |
|---|---|---|
| `125` | `LAUNCHER_FAILURE_EXIT` / `EXIT_LAUNCHER_FAILURE` | **Jeder** Launcher-Fehler: Usage-Fehler, Kernel ohne durchsetzbares Landlock, nicht oeffenbarer Grant-Root, fehlgeschlagenes `exec`. Die umhuellte Kommandozeile wurde **nicht** ausgefuehrt. |
| `0` | — | Erfolgreicher `--probe` bei erzwingendem Kernel (voll oder partiell); nach erfolgreichem `exec` der Status des Kindes, falls dieser `0` ist |
| Kind-Status | — | Nach erfolgreichem `exec` wird **jeder** Kindstatus unveraendert durchgereicht, **einschliesslich** `125`. Konsumenten brauchen daher sowohl Status `125` **als auch** eine `landlock-run: `-Fatallinie, um Launcher-Fehler zuzuschreiben |
| `125` bei `--probe` | — | Kernel erzwingt nicht: `--probe` liefert `0` bei Erzwingung (voll oder partiell), sonst `125` |

**stdout/stderr-Grammatik** aus `docs/cli-contract.md`, `packages/entry/src/main.c`:

| Kanal | Bedingung | Exakte Ausgabe |
|---|---|---|
| stdout | Probe-Erfolg | Genau eine Zeile: `landlock: fully enforced` **oder** `landlock: partially enforced (older ABI)` |
| stderr | Confined Run unter partieller ABI | Genau eine Zeile: `landlock-run: partial enforcement (older Landlock ABI)` — der Lauf faehrt fort |
| stderr | Jeder fatale Fehler | Genau eine Zeile mit Praefix `landlock-run: ` vor Exit `125` |
| stderr | Usage-Fehler | `landlock-run: usage error: <message>`; beobachtete Texte: ``missing `-- <argv>...` command``, `unknown argument: <arg>`, `<flag> requires a path`, `--probe takes no other arguments` (`native/system/test/launcher.test.js`) |
| stderr | Regel-/Syscall-Fehler | `landlock-run: landlock ruleset error: <strerror>`; `landlock-run: cannot open rule path: <path>: <strerror>`; `landlock-run: exec failed: <strerror>`; `landlock-run: out of memory` |
| stderr | Kein erzwingender Kernel | `landlock-run: landlock is not enforced by this kernel (ABI unsupported or disabled)` |

**Probe-Abbildung auf der JS-Seite** (`packages/entry/src/index.ts`): `probe()` mappt die beiden Erfolgszeilen auf `full`/`partial`; ein Nicht-Null-Probe-Exit mappt auf `unusable`. Ein Timeout (Default `timeoutMs: 2000`) oder fehlgeschlagener Spawn ergibt ebenfalls `unusable`. Typ: `LandlockEnforcement = 'full' | 'partial' | 'unusable'`.

**Confinement-Semantik:** Der Launcher setzt `no_new_privs`, installiert das Ruleset auf sich selbst und `exec`'t; das Ruleset wird ueber `execve` vererbt, sodass jeder Nachfahrenprozess gleichermassen confined ist. Das Ruleset regiert die Dateisystemzugriffe der ausgehandelten Landlock-ABI (bis ABI 5); Zugriffe neuerer ABI werden nicht regiert und sind die Differenz zwischen `full` und `partial` (`docs/cli-contract.md`, `packages/entry/src/main.c`).

### 8.4 Architektur, Packaging und Release

**Build-System** (`native/system/scripts/build.ts`, `native/system/package.json`):

| Aspekt | Fakt | Quelle |
|---|---|---|
| Build-Skript | `pnpm build:native` → `tsx ./scripts/build.ts` | `native/system/package.json` |
| TS-Build | `pnpm build:ts` → `tsc -b` (Entry → `lib/`, composite, declarations) | ebd., `packages/entry/tsconfig.json` |
| Test-Oracle | `pnpm build:test-oracle` → `node ./scripts/build-test-oracle.mjs` | `native/system/package.json` |
| Typecheck | `pnpm typecheck` → `tsc --noEmit && tsc -b --dry` | ebd. |
| Host-Gate | Auf Nicht-Linux/Nicht-macOS wirft `build:native`; mit `--host-addon-only` beendet es mit `0` | `native/system/scripts/build.ts` |
| Node-Header | Aus der laufenden Node-Installation: `resolve(dirname(process.execPath), '../include/node')`; fehlendes `node_api.h` ist ein Fehler | ebd. |
| Atomarer Output | Build in `mkdtempSync(.release/native-build-*)`, dann `renameSync` in den Zielpfad | ebd. |
| Quellzuordnung | Aus `prebuilds.json`-`tool`: `landlock-run` → `packages/entry/src/main.c`, `flock` → `packages/entry/src/flock.c`; unbekanntes Tool wirft | ebd. |

**Compiler-Flags (exakt)** aus `native/system/scripts/build.ts`:

| Ziel | Compiler | Flags |
|---|---|---|
| `landlock-run` (`kind: static-musl`, Linux) | `musl-gcc` | `-std=c11 -Os -Wall -Wextra -Werror -static -s` |
| `flock` (`kind: node-api`, `napi: 8`, Linux `glibc`) | `cc` | `-std=c11 -O2 -Wall -Wextra -Werror -fPIC -fvisibility=hidden -DNAPI_VERSION=8 -I <node-headers>` + `-shared` |
| `flock` (Linux `musl`) | `musl-gcc` | wie glibc |
| `flock` (macOS) | `cc` | `-std=c11 -O2 -Wall -Wextra -Werror -fPIC -fvisibility=hidden -DNAPI_VERSION=8 -I <node-headers>` + `-bundle -undefined dynamic_lookup -mmacosx-version-min=11.0` |

**Linkung** (`native/system/AGENTS.md`, `docs/architecture.md`, `docs/naming.md`): Der Launcher nutzt nur libc, **statisch gegen musl** gelinkt; Single-C-File mit statischer Linkung ohne exportierten Symbol-Namespace. `system.node` nutzt stabiles Node-API v8 — nie NAN, V8-C++-APIs oder experimentelle Node-Interfaces. Linux-glibc- und musl-Addons sind **distinkte Binaerdateien**; macOS hat ein eigenes Mach-O-Bundle.

**Artefakt-Benennung (exakte Muster):**

| Ebene | Muster | Quelle |
|---|---|---|
| npm-Paketfamilie | `@deepseek-ai/node-addon-system`, `@deepseek-ai/node-addon-system-<platform>` | `docs/naming.md` |
| Plattform-Suffixe | OS und CPU im Suffix; Linux-libc-Varianten liegen **innerhalb** desselben Plattformpakets und stehen in `prebuilds.json` | ebd. |
| Binaerpfade | Linux: `bin/landlock-run`, `bin/glibc/system.node`, `bin/musl/system.node`; macOS: `bin/system.node` | `docs/naming.md`, `docs/packaging.md` |
| Pfad-Regex der Verifikation | `/^bin\/(?:[a-z0-9-]+\/)?[a-z0-9._-]+$/`, doppelte Pfade verboten, undeklarierte `bin/`-Dateien verboten | `native/system/scripts/repo.mjs` |
| Tarball-Name | Scope entfernt und `/` → `-`: `<scope-name>-<version>.tgz` (z. B. `deepseek-ai-node-addon-system-linux-x64-0.1.2.tgz`) | `native/system/scripts/pack-release.mjs` |
| Release-Artefaktname je Plattform | `prebuild-<package>` | `native/system/scripts/github-matrix.mjs`, `assemble-prebuilds.mjs` |
| Release-Tag | `node-addon-system-vX.Y.Z` bzw. Tag-Praefix `refs/tags/node-addon-system-v` | `docs/release.md`, `native/system/scripts/verify-release.mjs` |
| Env-Praefix | `NALR_` (Node Addon Landlock Run), reserviert fuer Build/Test-Orchestrierung; Laufzeitbinaerdateien und Entry-Pakete lesen **keine** Umgebungsvariablen | `docs/naming.md` |
| Env-Variable (vollstaendig) | `NALR_REQUIRE_LANDLOCK` — test-only: ein nicht erzwingender Kernel schlaegt fehl statt zu skippen | `docs/naming.md`, `native/system/test/launcher.test.js`, `scripts/verify-packed-install.mjs` |
| C-Symbole | Kernel-UAPI-Konstanten behalten ihre Kernel-Namen mit lokalem Praefix `LL_` | `docs/naming.md` |

**Packaging** (`docs/packaging.md`, `packages/entry/package.json`):
- Entry-Paket exportiert `./landlock-run` und `./flock`, plus `./package.json`; **kein Root-Export**. Die C-Quellen `src/main.c` und `src/flock.c` werden zur Auditierbarkeit mitgeliefert.
- Plattformpakete enthalten **kein** JavaScript.
- Entry deklariert alle vier Plattformpakete als `optionalDependencies` mit `workspace:~`.
- Keine Installations-Lifecycle-Skripte in Entry- oder Plattformpaketen.
- `package.json` liefert `os`/`cpu`, `prebuilds.json` liefert Tool, Binary-Art, Pfad sowie Node-API- und libc-Metadaten.
- Plattform-Tarballs nutzen `npm pack` (bewahrt das Executable-Bit des Launchers); das Entry nutzt `pnpm pack`; `pnpm publish` direkt ist deshalb verboten.
- Prepack-Gates: `packages/entry/package.json` → `node ../../scripts/verify-entry-lib.mjs`; jedes Plattformpaket → `node ../../scripts/verify-launcher-binary.mjs`. Letzteres prueft ELF/Mach-O-Format, Architektur (`E_MACHINE`: `x64` = 62, `arm64` = 183), ELF-Typ (`2` Executable, `3` Shared Object), Mach-O (`0xfeedfacf`, `0x01000007` fuer x64, `0x0100000c` fuer arm64, Filetype `8`), Node-API-Exporte (`napi_register_module_v1`, `node_api_module_get_api_version_v1`) sowie das Executable-Bit (nur `static-musl` + `landlock-run` + Linux).
- `verify-packed-install.mjs` prueft Manifeste, installiert lokale Tarballs ohne Registry offline, pinnt Payload-Bytes und uebt das installierte flock-Binding sowie den funktionalen Landlock-Probe.
- Wenn `GITHUB_REPOSITORY` gesetzt ist, kopiert der Release-Packer Pakete und Prepack-Skripte in einen temporaeren Workspace und setzt die Repository-URL der kopierten Manifeste aus Workflow-Repository und `GITHUB_SERVER_URL` (Default `https://github.com`).

**Versionierung** (`docs/release.md`, `native/system/scripts/bump-release.mjs`, `verify-release.mjs`):
- Native-Workspace-Wurzel und **jedes** Plattform-/Entry-Paket teilen **eine** Version (aktuell `0.1.2` in `native/system/package.json`, `native/system/packages/entry/package.json` und allen vier Plattform-Manifesten).
- Bump vom Repository-Root: `pnpm --dir native/system release:bump patch` (oder `minor` / `major` / `x.y.z`). Der Helper aktualisiert `native/system/package.json` und jedes `native/system/packages/*`-Manifest, refresht das Root-Lockfile (`--ignore-scripts --lockfile-only`) und laeuft `release:verify`.
- Inkrement-Typen verlangen eine reine `x.y.z`-Ausgangsversion; explizite Versionen akzeptieren volles Semver inklusive Prereleases (z. B. `0.0.0-test.0`); Prerelease-Versionen landen unter dem `next`-Dist-Tag.
- `workspace:*`-Abhaengigkeiten bleiben in der Quelle; pnpm konvertiert sie beim Packen.
- Der Tag-Namensraum `node-addon-system-vX.Y.Z` vermeidet Kollisionen mit anderen Paketfamilien; der Publish-Workflow validiert Tag gegen Version.
- Vor 1.0 gilt das Dokument als Release-Checkliste, nicht als Stabilitaetspolicy.

**Release-Prozess (Schritte)** aus `docs/release.md`:
1. Preflight: `pnpm install --frozen-lockfile`, `pnpm --dir native/system build:ts`, `typecheck`, `test:entry`.
2. Auf unterstuetztem Linux-/macOS-Host zusaetzlich: `build:native`, `build:test-oracle`, `test:launcher`, `test:flock`, `test:packaging`, dann `node native/system/scripts/pack-release.mjs native/system/.release/npm --current-platform-only` und `node native/system/scripts/verify-packed-install.mjs native/system/.release/npm --current-platform-only`.
3. Version-Bump als normale Quellaenderung: Release-PR/-Commit mit Launcher-Manifesten und Root-Lockfile, mergen, dann `node-addon-system-vX.Y.Z`-Tag von diesem Commit erstellen (oder `pnpm --dir native/system release:commit patch`).
4. Workflow `Node Addon System Release` mit `publish=false` vom Release-Commit: alle Plattformbinaerdateien auf ihren nativen Runnern bauen, Payloads assemblieren und verifizieren, Tarballs in Publish-Reihenfolge packen, gepackte Installation proben, Artefakt `npm-tarballs` hochladen.
5. Tag `node-addon-system-vX.Y.Z` erstellen und pushen.
6. Denselben Workflow vom Tag mit `publish=true` laufen lassen; publiziert nur die finalen gepackten Tarballs in `publish-order.txt`-Reihenfolge (Plattformpakete vor dem Entry).
7. Publikation mit `--access public`; npm Trusted Publishing ueber GitHub OIDC, sonst `NPM_TOKEN`-Secret im Environment `npm-publish`. Neue Scoped-Paketnamen benoetigen zunaechst ein `@deepseek-ai`-Organisationstoken als Fallback.
8. Nie `.npmrc`-Dateien mit Tokens oder Registry-Overrides committen.

**Tests** (`native/system/package.json`): `test` = `test/entry.test.js`, `test/launcher.test.js`, dann `node --test` ueber `test/flock.test.js`, `test/package-matrix.test.js`, `test/release-packing.test.js`. Der Syscall-Oracle `test/fixtures/flock-oracle.c` (exklusiv/shared, `LOCK_NB`, `LOCK_UN`, JSON-Zeilen `{"ready":true}` und `{"errno":N}`) wird nur fuer Tests gebaut und gelangt **nie** in ein veroeffentlichtes Plattformpaket.

### 8.5 Support-Matrix (`native/system/docs/support-matrix.md`)

Die vollstaendige Liste der Plattformpaket-Suffixe **woertlich** aus `native/system/docs/support-matrix.md`:

| Platform package suffix | Builder | Payload |
|---|---|---|
| `linux-x64` | `ubuntu-24.04` | static Landlock executable; glibc and musl `system.node` |
| `linux-arm64` | `ubuntu-24.04-arm` | static Landlock executable; glibc and musl `system.node` |
| `darwin-x64` | `macos-15-intel` | `system.node` |
| `darwin-arm64` | `macos-latest` | `system.node` |

Ergaenzende Fakten:
- Die CI-Runner-Zuordnung ist identisch in `native/system/scripts/github-matrix.mjs` hinterlegt und wird aus `prebuilds.json` abgeleitet; ein unbekanntes `platform` wirft `missing GitHub runner for platform: ...`.
- Das Node-API-v8-Addon wird einmal pro Plattform/libc gebaut und in CI unter Node **20, 22, 24 und 26** geprueft (`docs/support-matrix.md`, `scripts/github-matrix.mjs`; Linux laeuft das musl-Addon zusaetzlich in Alpine-Containern gemae ss `docs/architecture.md`).
- macOS-Builds zielen auf **11.0 oder spaeter** (`docs/support-matrix.md`; Flag `-mmacosx-version-min=11.0`).
- Linux-Binding-Auswahl nutzt die libc des laufenden Node-Prozesses; der statische Launcher bedient beide libc-Varianten.
- Landlock benoetigt zusaetzlich einen erzwingenden Linux-Kernel; der funktionale Probe bestimmt `full`, `partial` oder `unusable` — die Kernelversion allein ist keine Verfuegbarkeitsgarantie.
- **Windows** hat weder einen Landlock-Launcher noch dieses POSIX-Addon; die Harness behaelt ihre bestehende Windows-Semaphore-Implementierung.
- Andere CPU/OS-Kombinationen haben **kein** veroeffentlichtes Plattformpaket: Landlock probt `unusable` und flock-Acquisition rejectet.

**Wichtige Praezisierung.** Rust-artige Ziel-Triples (etwa `x86_64-unknown-linux-gnu`, `aarch64-apple-darwin`, `x86_64-pc-windows-msvc`) existieren in diesem Repository **nicht** — eine repository-weite Suche nach diesen drei Mustern liefert keinen Treffer. Die Plattformidentitaet ist durchgaengig die Node-Konvention `<platform>-<arch>` (aus `process.platform`-`process.arch` bzw. aus dem `platform`-Feld in `prebuilds.json`), belegt in `docs/support-matrix.md`, `packages/entry/src/index.ts`, `packages/entry/src/flock.ts`, `native/system/scripts/build.ts`, `scripts/pack-release.mjs`, `scripts/github-matrix.mjs`. Die dokumentierten Plattform-Suffixe sind damit genau vier: **`linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`**.

**Verzeichnisstruktur** (`native/system/packages/`): `darwin-arm64`, `darwin-x64`, `entry`, `linux-arm64`, `linux-x64`. Plattformpakete enthalten exakt `LICENSE`, `package.json`, `prebuilds.json`, `README.md`, `README.i18n.yaml`, `README.zh.md`; das `entry`-Paket enthaelt `package.json`, `tsconfig.json`, `README*` sowie `src/main.c`, `src/flock.c`, `src/index.ts`, `src/flock.ts` und das gebaute `lib/`.

### 8.6 Struktur von `packages/entry/src/main.c`

Das File ist der **Landlock-Launcher** `landlock-run` (nicht die flock-Bindung). Aufbau: ein Datei-Kommentar mit CLI-Kontrakt und Fail-closed-Erklaerung, lokal definierte Landlock-UAPI-Strukturen und -Konstanten, Syscall-Fallback-Nummern, `struct cli`, vier Hilfsfunktionen und `main` (298 Zeilen).

**argv-Parsing** (`parse(argc, argv, struct cli*)`, hand-rolled, ohne Parser-Bibliothek):
- Allokiert `ro`- und `rw`-Zeigerlisten via `calloc` in `argc`-Groesse (kein `free`, da der Prozess `exec`'t oder endet); `NULL` → `landlock-run: out of memory`.
- Erkennt `--probe` (verlangt `argc == 2`, sonst `--probe takes no other arguments`), `--ro <path>` und `--rw <path>` (jeweils mit Pflichtpfad, sonst `<flag> requires a path`), `--` (setzt `command` auf den Rest von `argv` und bricht ab) und meldet alles andere als `unknown argument: <arg>`.
- Nach der Schleife: ohne `--probe` muss `command` vorhanden und nicht leer sein, sonst ``missing `-- <argv>...` command``.
- Felder von `struct cli`: `int probe`, `const char **ro`, `size_t ro_count`, `const char **rw`, `size_t rw_count`, `char **command`.

**Dispatch in `main`:**

| Fall | Ablauf |
|---|---|
| Parse-Fehler | Sofortiger Return des Fehlercodes (`125`) ohne jede Restriktion |
| `cli.probe` | Baut einen Probe-`struct cli` mit genau einem `--ro`-Grant auf `/` (statisch `probe_root = "/"`), ruft `restrict_self`, druckt bei Erfolg `landlock: fully enforced` oder `landlock: partially enforced (older ABI)` auf stdout, gibt `0` zurueck |
| Normaler Lauf | Ruft `restrict_self(&cli, &partial)`; bei Erfolg und `partial` eine stderr-Zeile `landlock-run: partial enforcement (older Landlock ABI)`, dann `execvp(cli.command[0], cli.command)` — Rueckkehr nur bei Fehler → `landlock-run: exec failed: <strerror>` |

**Verwendete OS-APIs:**

| API | Verwendung |
|---|---|
| `syscall(__NR_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION)` | ABI-Version abfragen; Negativwert → `ENOSYS` (Kernel ohne Landlock) oder `EOPNOTSUPP` → Fail-closed mit `landlock is not enforced by this kernel (ABI unsupported or disabled)` |
| `syscall(__NR_landlock_create_ruleset, &attr, sizeof attr, 0)` | Ruleset anlegen; Fehler → `landlock ruleset error: <strerror>` |
| `syscall(__NR_landlock_add_rule, ruleset_fd, LANDLOCK_RULE_PATH_BENEATH, &attr, 0)` | Eine Path-Beneath-Regel hinzufuegen |
| `open(path, O_PATH \| O_CLOEXEC)` | Grant-Wurzel oeffnen; Fehler → `cannot open rule path: <path>: <strerror>` |
| `fstat(path_fd, &st)` + `S_ISDIR(st.st_mode)` | Nicht-Verzeichnis-Grants behalten nur `LL_FS_EXECUTE \| LL_FS_WRITE_FILE \| LL_FS_READ_FILE \| LL_FS_TRUNCATE \| LL_FS_IOCTL_DEV` |
| `prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)` | Pflicht fuer unprivilegiertes Restrict |
| `syscall(__NR_landlock_restrict_self, ruleset_fd, 0)` | Ruleset auf den aktuellen Thread installieren |
| `close(ruleset_fd)`, `close(path_fd)` | Aufraeumen |
| `execvp(cli.command[0], cli.command)` | Kommando ausfuehren (Umgebung unveraendert) |
| `fprintf(stderr, ...)`, `printf(...)` | Reporting |
| `calloc`, `strcmp`, `strerror`, `errno` | Parsing und Fehlertexte |

**Lokale UAPI-Definitionen** (statt `<linux/landlock.h>`, um unabhaengig von der Toolchain-Header-Vintage zu sein): `struct landlock_ruleset_attr { uint64_t handled_access_fs; }`; `struct landlock_path_beneath_attr { uint64_t allowed_access; int32_t parent_fd; } __attribute__((packed))`; `LANDLOCK_CREATE_RULESET_VERSION (1U << 0)`; `LANDLOCK_RULE_PATH_BENEATH 1`. ABI-Bits: `LL_FS_EXECUTE` (bit 0) bis `LL_FS_MAKE_SYM` (bit 12), `LL_FS_REFER` (bit 13, ABI 2), `LL_FS_TRUNCATE` (bit 14, ABI 3), `LL_FS_IOCTL_DEV` (bit 15, ABI 5); `LL_ABI1_MASK = LL_FS_REFER - 1`; `MAX_ABI 5L`. Syscall-Fallbacks: `__NR_landlock_create_ruleset 444`, `__NR_landlock_add_rule 445`, `__NR_landlock_restrict_self 446`. Header: `errno.h`, `fcntl.h`, `stdint.h`, `stdio.h`, `stdlib.h`, `string.h`, `sys/prctl.h`, `sys/stat.h`, `sys/syscall.h`, `unistd.h`; `#define _GNU_SOURCE`.

**ABI-Negotiation** (`fs_mask_for_abi`): Basis `LL_ABI1_MASK`, plus `LL_FS_REFER` ab ABI ≥ 2, `LL_FS_TRUNCATE` ab ABI ≥ 3, `LL_FS_IOCTL_DEV` ab ABI ≥ 5. `partial` gilt, wenn die Kernel-ABI kleiner als `MAX_ABI` ist. `--ro`-Pfade erhalten die Read-Seite (`LL_FS_EXECUTE | LL_FS_READ_FILE | LL_FS_READ_DIR`), `--rw`-Pfade das gesamte `handled`-Set. `--probe` baut ein maximales Ruleset und erzwingt es tatsaechlich in einem kurzlebigen Prozess — ein `--version`-Stil-Check wuerde einen Kernel verfehlen, der die Syscalls hat, die Erzwingung aber verweigert.

**Fehlerreporting und Exit-Verhalten:** `fail(prefix, detail)` druckt `landlock-run: <prefix>` bzw. `landlock-run: <prefix>: <detail>` auf stderr und gibt `EXIT_LAUNCHER_FAILURE` (`125`) zurueck; `fail_usage` druckt `landlock-run: usage error: <message>` und gibt ebenfalls `125` zurueck. Jeder Fehlerpfad gibt den Code nach oben weiter; `main` gibt ihn direkt zurueck. Nach erfolgreichem `exec` kehrt die Funktion nie zurueck. `NOT_ENFORCED_MESSAGE` ist als statischer String zentral definiert.

**Hinweis zum zweiten C-File.** Das flock-Binding liegt in `native/system/packages/entry/src/flock.c` (Node-API v8, `NAPI_MODULE_INIT`, exportiert die Funktion `tryLock`, `napi_create_async_work` mit `execute_lock`/`complete_lock`, `napi_add_async_cleanup_hook` mit `cleanup_lock`, `napi_fatal_error("flock", ...)`). Es ruft **kein** `LockFileEx`, `CreateFileW` oder `fcntl` — die Windows-Seite ist die Semaphore-Implementierung in `packages/session/session-persistence-jsonl/src/win32.ts` (`CreateSemaphoreW`, `WaitForSingleObject`, `ReleaseSemaphore`, `CloseHandle`, geladen lazy ueber Koffi aus `kernel32.dll`).

### 8.7 Wie die JS-Seite es aufruft

**Plattform-Binaerdatei-Auswahl zur Laufzeit** — es gibt genau zwei Auswahlstellen, beide in `native/system/packages/entry/src/`:

| Auswahl | Regel | Quelle |
|---|---|---|
| Landlock-Launcher-Pfad | Paketname `` `@deepseek-ai/node-addon-system-${process.platform}-${process.arch}` ``; Aufloesung von `<paket>/package.json` via `createRequire(import.meta.url).resolve`, dann `join(dirname(<manifest>), 'bin', LAUNCHER_BIN)` mit `LAUNCHER_BIN = 'landlock-run'` | `packages/entry/src/index.ts` |
| Fallback bei nicht aufloesbarem Paket | Absoluter Pfad innerhalb der eigenen Paketgrenze: `new URL(\`../node_modules/${platformPackage}/bin/${LAUNCHER_BIN}\`, import.meta.url)` — bewusst **nie** cwd-relativ | ebd. |
| Existenzpruefung | Bewusst **keine**: `probe()` ist das einzige Verfuegbarkeitssignal | ebd. |
| flock-Plattform-Gate | `if (platform !== 'linux' && platform !== 'darwin') throw` mit `code: 'ERR_FLOCK_UNSUPPORTED_PLATFORM'`, `syscall: 'flock'` | `packages/entry/src/flock.ts` |
| flock-Dateiname (macOS) | `system.node` in `bin/` | ebd. |
| flock-Dateiname (Linux, libc-Auswahl) | `process.report.getReport().header.glibcVersionRuntime` vorhanden → `join('glibc', 'system.node')`, sonst `join('musl', 'system.node')` | ebd. |
| flock-Manifest-Aufloesung | `` require.resolve(`@deepseek-ai/node-addon-system-${platform}-${arch}/package.json`) ``, dann `require(join(dirname(manifest), 'bin', filename))` | ebd. |
| Lazy Loading | `let binding` plus `loadBinding()` beim ersten `tryLockExclusive`-Aufruf; Import allein laedt kein Addon | ebd., `packages/entry/README.md` |
| Fehlerobjekt-Form | Syscall-Fehler tragen `code` (via `getSystemErrorName(-errno)`), positives `errno` und `syscall: 'flock'`; Meldung `` `${code}: flock failed` `` | `packages/entry/src/flock.ts` |
| Umgebungsvariablen | **Keine** Runtime-Overrides fuer die Binaerauswahl; Test-Injektion ueber Funktionsparameter (`resolvePackageJson`, `launcher`) | `packages/entry/src/index.ts`, `native/system/AGENTS.md`, `docs/naming.md` |
| Paketmanager-Auswahl | `os`/`cpu`-Felder der Plattformpakete sorgen dafuer, dass Installer nur das passende Paket holen | `packages/entry/src/index.ts`, `packages/linux-x64/package.json`, `packages/darwin-arm64/package.json` |

**Namen der Plattformpakete** (`native/system/packages/*/package.json`): `@deepseek-ai/node-addon-system-linux-x64`, `@deepseek-ai/node-addon-system-linux-arm64`, `@deepseek-ai/node-addon-system-darwin-x64`, `@deepseek-ai/node-addon-system-darwin-arm64`. Jedes deklariert `os` und `cpu`, `files: ["README.md", "bin/", "prebuilds.json"]`, `engines.node: ">=20"`, `publishConfig.access: "public"` und den Prepack-Hook `node ../../scripts/verify-launcher-binary.mjs`. Die `prebuilds.json`-Payloads lauten: Linux je `landlock-run` (`kind: "static-musl"`, `path: "bin/landlock-run"`), `flock` (`kind: "node-api"`, `napi: 8`, `libc: "glibc"`, `path: "bin/glibc/system.node"`), `flock` (`kind: "node-api"`, `napi: 8`, `libc: "musl"`, `path: "bin/musl/system.node"`); macOS je `flock` (`kind: "node-api"`, `napi: 8`, `path: "bin/system.node"`).

**Aufrufstellen:**

| Konsument | Verwendete API | Quelle |
|---|---|---|
| Sandbox-Provider lokal | `launcherPath as landlockLauncherPath`, `probe as defaultProbeLandlock`, `LAUNCHER_FAILURE_EXIT`, `landlockProfileArgs`; Kette Linux `['bwrap', 'landlock']` | `packages/sandbox/sandbox-local/src/index.ts`, `src/profiles.ts` |
| Sandbox-Profile | `grantArgs` mit `readOnly: ['/']` und `readWrite: ['/dev/null']`, plus `/tmp` und `workspaceRoot` im Modus `workspace-write` | `packages/sandbox/sandbox-local/src/profiles.ts` |
| Session-Persistenz (POSIX-Write-Ownership) | `tryLockExclusive(handle.fd)` auf `session.lock`; Contention `EAGAIN`/`EWOULDBLOCK` → `SessionAlreadyOwnedError` | `packages/session/session-persistence-jsonl/src/lease.ts` |
| Browser-Worker | Ersetzt `@deepseek-ai/node-addon-system/flock` durch einen Single-Process-Stub, waehrend die Landlock-JS-API unveraendert laeuft | `packages/experimental/webworker-runtime/src/module-proxies.ts`, `src/node/external_packages/replaced-externals.ts`, `src/node/builtins.ts`, `src/node/external_packages/node-addon-system-flock.ts` |
| SSH-Helper-SEA | Registriert einen Resolver-Hook, der `@deepseek-ai/node-addon-system-<platform>-<arch>/package.json` auf das mitgelieferte `<dir(process.execPath)>/native/system/package.json` umbiegt | `packages/ssh/ssh-helper-runtime/src/index.ts` |
| Tests/E2E | `probe`, `launcherPath`, `LAUNCHER_FAILURE_EXIT`, `grantArgs` | `native/system/test/entry.test.js`, `test/launcher.test.js`, `packages/sandbox/sandbox-local/tests/landlock.e2e.ts`, `packages/shell/bash-sandbox/tests/partial-landlock.spec.ts` |

**Abgrenzung zu `dsh-native-command` und `dsh-lazy-require`.** Keines der beiden Pakete waehlt Plattformbinaerdateien dieses Addons aus.
- `@deepseek-ai/dsh-native-command` (`packages/util/native-command/src/runner.ts` mit `export { runNativeCommand } from './runner.ts'` in `src/index.ts`) ist ein generischer No-Shell-`execFile`-Runner plus Path-Opener, File-Application- und Desktop-Entry-Helfer; `runNativeCommand(command, args, signal, window)` bekommt den Programmnamen als Parameter und fuehrt **keine** Plattform-zu-Binary-Abbildung durch. Das Paket referenziert `@deepseek-ai/node-addon-system` nicht.
- `@deepseek-ai/dsh-lazy-require` (`packages/util/lazy-require/src/index.ts`) ist ein aufrufer-relativer Lazy-`require`-Cache: `createLazyRequire<T>(specifier, parentURL)` gibt einen Null-Argument-Loader zurueck, der beim ersten Aufruf laedt und das Ergebnis cacht (fehlgeschlagene Loads werden **nicht** gecacht). Es kennt keine Plattformnamen. Die flock-Bindung implementiert ihr Lazy-Loading eigenstaendig in `packages/entry/src/flock.ts` — noetig, weil die Plattformaufloesung `process.platform`, `process.arch` und die libc-Erkennung ueber `process.report` benoetigt statt eines statischen Specifiers.

**Auswahl-Hierarchie (kein Env-Override an keiner Stelle):** `process.platform`-`process.arch` → npm-Paketname `@deepseek-ai/node-addon-system-<platform>-<arch>` (von npm ueber `os`/`cpu` installiert) → `package.json` dieses Pakets aufloesen (`createRequire`) → `bin/`-Datei waehlen (`landlock-run`; bei Linux zusaetzlich das libc-Verzeichnis `glibc`/`musl` fuer `system.node`) → bei nicht aufloesbarem Paket ein absoluter Fallback-Pfad innerhalb des eigenen Pakets, dessen Nichtexistenz `probe()` als `unusable` bzw. die flock-Acquisition als Rejection meldet.

---

## 9. Das Python-SDK (`python/sdk`) — vollstaendig

### 9.1 Packaging

**Vollstaendiger Baum `python/sdk`** (30 Dateien; **keine** `py.typed`, keine `_version.py`, kein `conftest.py`, kein `tests/__init__.py`):

```
python/sdk/
├── pyproject.toml
├── uv.lock
├── README.md
├── README.zh.md
├── README.i18n.yaml
├── examples/
│   ├── minimal.py
│   ├── README.md
│   ├── README.zh.md
│   └── README.i18n.yaml
├── src/deepseek_harness/
│   ├── __init__.py
│   ├── api.py
│   ├── client.py
│   ├── errors.py
│   ├── models.py
│   └── office.py
└── tests/
    ├── expected/account-provider-signout.json
    ├── expected/cot-translation-projection.json
    ├── fixtures/office_cli.py
    ├── manual_sdk_agent_smoke.py
    ├── test_account_provider_snapshot.py
    ├── test_bundled_runtime.py
    ├── test_client.py
    ├── test_cot_translation_projection.py
    ├── test_macos_deployment_target.py
    ├── test_office.py
    ├── test_office_interrupts.py
    ├── test_release_version.py
    ├── test_runtime_resolution.py
    ├── test_smoke_model.py
    └── test_working_directory.py
```

| Punkt | Wert | Quelle |
|---|---|---|
| Build-Backend | `hatchling.build`, `requires = ["hatchling==1.32.0"]` (exakt gepinnt) | `python/sdk/pyproject.toml` |
| Projektname | `deepseek-harness-sdk` | ebd. |
| Version | `0.0.0.dev0` (Platzhalter; der Release-Job ersetzt sie) | ebd. |
| `description` | `Python SDK for DeepSeek Harness` | ebd. |
| `readme` | `README.md` | ebd. |
| `requires-python` | `>=3.10` | ebd. |
| `license` | `MIT` (SPDX-String; **kein** `license-files` in dieser Datei) | ebd. |
| `authors` | `[{ name = "DeepSeek" }]` | ebd. |
| Laufzeit-Abhaengigkeiten | `pydantic>=2.12,<3`, `deepseek-harness-runtime-bin==0.0.0.dev0` (exakter Versions-Pin auf das Runtime-Wheel) | ebd. |
| Optionale Extras | **nicht vorhanden** | ebd. |
| Dependency-Group | `[dependency-groups] test = ["pytest>=8.0"]` | ebd. |
| Entry-Points / `[project.scripts]` | **nicht vorhanden** — das SDK hat keinen eigenen Konsolen-Entrypoint; die `dsh`-Kommandozeile gehoert zum Schwester-Wheel `deepseek-harness-runtime-bin` (gestaged: `dsh = "deepseek_harness_runtime:main"`, belegt in `python/sdk/tests/test_release_version.py`) | ebd., `README.md` |
| Classifiers | **nicht vorhanden** | ebd. |
| Wheel-Include-Regel | `[tool.hatch.build.targets.wheel] packages = ["src/deepseek_harness"]`, `core-metadata-version = "2.4"` (Twine-6.2.0-Grenze) | ebd. |
| sdist-Ziel | **nicht konfiguriert** | ebd. |
| URLs | `Homepage`, `Documentation`, `Issues`, `Source` (alle `github.com/deepseek-ai/deepseek-harness`) | ebd. |
| Lokale Quelle | `[tool.uv.sources] deepseek-harness-runtime-bin = { path = "../sdk-runtime", editable = true }` | ebd. |
| pytest im Paket | `[tool.pytest.ini_options] addopts = "-q"`, `testpaths = ["tests"]` | ebd. |
| pytest im Repo-Root | `[pytest] testpaths = python/sdk/tests`, `norecursedirs = node_modules .git dist-exe` | `pytest.ini` |
| Lockfile | `uv.lock` (Version 1, Revision 3, `requires-python = ">=3.10"`) loest `deepseek-harness-sdk` und `deepseek-harness-runtime-bin` als `editable` auf | `python/sdk/uv.lock` |
| Typ-Marker | **kein `py.typed`** und keine `.pyi`-Stubs ⇒ keine PEP-561-Auszeichnung | `python/sdk` (Baumaufzaehlung) |

Laut `python/sdk/README.md` ist die Autorenumgebung ueber `deepseek_harness_runtime.download_primary_runtime()` unabhaengig optional; SDK-Start und Office-Operationen laden fehlende Ressourcen nie automatisch nach.

### 9.2 Modul `deepseek_harness/__init__.py`

19 Zeilen, ausschliesslich Re-Exports plus `__all__`:
- `from .api import DeepSeekHarness, DeepSeekHarnessConfig, RunResult, Session`
- `from .client import HarnessClient, HarnessConfig`
- `from .errors import SdkProtocolError`
- `from .models import IncomingRequest, InitializeResponse, JsonObject, Notification, ServerInfo`
- `__all__` = `["DeepSeekHarness", "DeepSeekHarnessConfig", "Session", "RunResult", "HarnessClient", "HarnessConfig", "SdkProtocolError", "IncomingRequest", "InitializeResponse", "JsonObject", "Notification", "ServerInfo"]` (12 Namen)
- **Kein `__version__`** und kein `version_info` im gesamten Paket; die Version existiert nur als Distributions-Metadatum aus `pyproject.toml`.
- **Nicht** re-exportiert: `HarnessError`, `TransportClosedError`, `JsonRpcError` (nur ueber `deepseek_harness.errors`), `NotificationSubscription` (ueber `deepseek_harness.client`), alle Office-Namen (ueber `deepseek_harness.office`).

### 9.3 Modul `api.py` (258 Zeilen)

**Klassen (4):**

| Klasse | Art | Details |
|---|---|---|
| `DeepSeekHarnessConfig` | `@dataclass(slots=True)` | 16 Felder, alle mit Default; **nicht** frozen |
| `RunResult` | `@dataclass(slots=True)` | 5 Felder, alle ohne Default; **nicht** frozen |
| `DeepSeekHarness` | regulaere Klasse | Kontextmanager, startet lazy |
| `Session` | regulaere Klasse | oeffentliche Attribute `harness`, `id` |

**`DeepSeekHarnessConfig` — vollstaendige Feldtabelle:**

| Feld | Typ | Default |
|---|---|---|
| `provider` | `str` | `"deepseek-official"` |
| `model` | `str` | `"deepseek-v4-flash"` |
| `reasoning_effort` | `str \| None` | `None` |
| `max_tokens` | `int \| None` | `None` |
| `cwd` | `str \| None` | `None` |
| `runtime_cwd` | `str \| None` | `None` |
| `dsh_bin` | `str \| None` | `None` |
| `profile` | `str` | `"sdk"` |
| `patches` | `tuple[str, ...]` | `()` |
| `dsh_home` | `str \| None` | `None` |
| `env` | `dict[str, str]` | `field(default_factory=dict)` |
| `initialize_timeout_seconds` | `float` | `30.0` |
| `request_timeout_seconds` | `float \| None` | `None` |
| `shutdown_timeout_seconds` | `float \| None` | `1.0` |
| `base_url` | `str \| None` | `None` |
| `api_key` | `str \| None` | `None` |

**`RunResult` — Feldtabelle:** `session_id: str`, `final_response: str`, `finish_reason: str | None`, `events: list[JsonObject]`, `notifications: list[Notification]` (alle ohne Default).

**`DeepSeekHarness` — alle oeffentlichen Signaturen:**
- `__init__(self, config: DeepSeekHarnessConfig | None = None, *, _launch_args: tuple[str, ...] | None = None, **kwargs: object) -> None` — wirft `TypeError`, wenn `config` **und** `kwargs` uebergeben werden; `_launch_args` ist der interne Fake-Runtime-Testadapter (`python/sdk/README.md`: „Arbitrary argv replacement remains an internal fake-runtime test adapter, not public API").
- `__enter__(self) -> "DeepSeekHarness"` (ruft `start()`), `__exit__(self, _exc_type, _exc, _tb) -> None` (ruft `close()`).
- Property `client -> HarnessClient` (liefert `self._client`).
- `start(self) -> None` — idempotent ueber `_initialized`; ruft `client.start()` und `client.initialize(cwd=…, provider=…, model=…, reasoning_effort=…, max_tokens=…)`.
- `close(self) -> None` — `client.close()`, setzt `_initialized = False`.
- `start_session(self, session_id: str | None = None) -> "Session"` — ohne ID: `f"session-{uuid.uuid4().hex}"`.
- `run(self, input: str | list[JsonObject], *, session_id: str | None = None, on_notification: Callable[[Notification], None] | None = None) -> RunResult`.
- Interne Attribute: `config`, `_cwd`, `_client`, `_initialized`. `__init__` macht `cwd` und `runtime_cwd` absolut (`Path(...).resolve()`); `base_url`/`api_key` werden als `env["DEEPSEEK_BASE_URL"]`/`env["DEEPSEEK_API_KEY"]` in die Subprozess-Umgebung injiziert.

**`Session` — alle Signaturen:** `__init__(self, harness: DeepSeekHarness, session_id: str) -> None`; `get_working_directory(self) -> str`; `set_working_directory(self, path: str) -> str`; `run(self, input: str | list[JsonObject], *, on_notification: Callable[[Notification], None] | None = None) -> RunResult`.

`Session.run` verwendet `self.harness.client.subscribe_session_notifications(self.id)` als Kontextmanager, ruft `session_prompt(...)` und wartet, bis `session.event`/`agent/inbox/spliced` die eigene `message_id` enthaelt (Startpunkt), danach bis `session.status` mit `status == "idle"`. `events` sammelt nur Events mit `payload["sessionId"] == self.id`; `notifications` sammelt alles aus dem Session-Baum.

**Modul-Ebene `api.py`:** `normalize_input(input: str | list[JsonObject]) -> list[JsonObject]` (String → `[{"type": "text", "text": input}]`), `final_response(events: list[JsonObject]) -> str` (letztes `assistant/message`, konkateniert alle `text`-Bloecke, sonst `""`), `finish_reason(events: list[JsonObject]) -> str | None` (letztes `turn/end`, `data.reason.kind`; sonst `SdkProtocolError`), privat `_is_inbox_receipt(notification: Notification, session_id: str, message_id: str) -> bool`. **Keine** modulweiten Konstanten und kein `__all__` in `api.py`.

### 9.4 Modul `client.py` (611 Zeilen)

**Transport — exakt:** Der Client startet einen **Subprozess** ueber `subprocess.Popen` und spricht **newline-delimited JSON-RPC 2.0 ueber stdio** (nicht HTTP, kein SSE, kein Socket, keine Bibliothek wie `requests`/`httpx`/`websockets`).

| Transportaspekt | Wert | Quelle |
|---|---|---|
| Prozess | `subprocess.Popen(args, stdin=PIPE, stdout=PIPE, stderr=PIPE, text=True, encoding="utf-8", cwd=<aufgeloest oder None>, env=env, bufsize=1)` | `python/sdk/src/deepseek_harness/client.py` |
| Drahtformat | `json.dumps(message, separators=(",", ":")) + "\n"`, ein Objekt pro Zeile; `"jsonrpc": "2.0"` | ebd. |
| Standard-Startargumente | `resolve_bundled_launch_args()` aus `deepseek_harness_runtime`, danach `("--profile", self.config.profile)` und je Patch `("--patch", <absoluter Pfad>)` | ebd. |
| Alternative Binaerdatei | `dsh_bin` ersetzt die Basis durch `(str(Path(dsh_bin).expanduser().resolve()),)` | ebd. |
| Fehlende Runtime | `ImportError` von `deepseek_harness_runtime` → `FileNotFoundError("Unable to locate the bundled DeepSeek Harness dsh runtime. Install deepseek-harness-runtime-bin.")` | ebd. |
| `dsh_home`-Regel | `dsh_home` wird auf `DSH_HOME` gemappt (absolut); leerer `dsh_home` → `ValueError("HarnessConfig requires a non-empty dsh_home")`; weder `dsh_home` noch nicht-leeres `DSH_HOME` → `ValueError(... the Python SDK never uses ~/.dsh implicitly)` | ebd. |
| Lesethreads | zwei Daemon-Threads: `dsh-runtime-reader` (stdout) und `dsh-runtime-stderr` (stderr) | ebd. |
| Fehlertoleranz stdout | Nicht-JSON-Zeilen werden per `json.JSONDecodeError: continue` **verworfen** (belegt in `python/sdk/tests/test_client.py::test_client_ignores_non_json_stdout_lines`) | ebd. |
| stderr-Puffer | `deque(maxlen=400)` fuer den Diagnose-Tail | ebd. |
| Auth-Header | **keine** — der Client setzt keinerlei HTTP-Header. Credentials/Endpunkt laufen ausschliesslich ueber die Subprozess-Umgebung (`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`), gesetzt von `DeepSeekHarness.__init__` | ebd., `api.py` |
| Retries | **keine** — keinerlei Wiederholungslogik, Backoff oder Reconnect | ebd. |
| HTTP-Client-Bibliothek | **keine** | ebd. |
| Timeouts | `initialize_timeout_seconds: float = 30.0`; `request_timeout_seconds: float | None = None` (= unbegrenzt); `shutdown_timeout_seconds: float | None = 1.0`; pro Aufruf ueberschreibbar via `request(..., timeout_seconds=...)` | ebd. |
| Timeout-Verhalten | `TimeoutError(f"{method} timed out waiting for DeepSeek Harness runtime{suffix}")` mit angehaengter Diagnose (`exit code: N`, `stderr tail:`) | ebd. |
| `initialize`-Timeout | zusaetzlich `TimeoutError(f"{error}\nselected dsh profile {profile!r}")` und sofortiges `close()` | ebd. |
| Shutdown-Sequenz | `shutdown`-Request → stdin schliessen → `wait(shutdown_timeout)` → `terminate()` → `wait(timeout)` → `kill()`; anschliessend `_fail_waiters(...)` und Joins der Threads mit `0.5 s` | ebd. |
| Aufgerufene JSON-RPC-Methoden | `initialize`, `session/prompt`, `session/working-directory/get`, `session/working-directory/set`, `shutdown`; weitere ueber `notify()` | ebd. |
| Erwartete eingehende Methoden | Notifications `session.event`, `session.status`, `subagent.started`, `subagent.finished`; beliebige Server-Requests ueber `next_request()` | ebd. |
| Subagent-Baum | `_session_parents` merkt `childSessionId → parentSessionId` aus `subagent.started`, solange der Client lebt | ebd. |

**`HarnessConfig`** (`@dataclass(slots=True)`, nicht frozen), 9 Felder: `dsh_bin: str | None = None`, `profile: str = "sdk"`, `patches: tuple[str, ...] = ()`, `dsh_home: str | None = None`, `cwd: str | None = None`, `env: dict[str, str] | None = None`, `initialize_timeout_seconds: float = 30.0`, `request_timeout_seconds: float | None = None`, `shutdown_timeout_seconds: float | None = 1.0` — **kein** `api_key`, **kein** `base_url`, **kein** `model`, **kein** `provider`.

**`HarnessClient` — oeffentliche Signaturen:**
- `__init__(self, config: HarnessConfig | None = None, *, _launch_args: tuple[str, ...] | None = None) -> None`
- `__enter__(self) -> "HarnessClient"`, `__exit__(self, _exc_type, _exc, _tb) -> None`
- `start(self) -> None` (idempotent: Rueckkehr, wenn `self._proc is not None`)
- `close(self) -> None` (idempotent und vor dem Start aufrufbar)
- `initialize(self, *, cwd: str, provider: str, model: str, reasoning_effort: str | None = None, max_tokens: int | None = None) -> InitializeResponse` — Payload `{"cwd": <absolut>, "provider", "model"}` plus optional `reasoningEffort`, `maxTokens`
- `session_prompt(self, session_id: str, content_blocks: list[JsonObject], *, on_notification: Callable[[Notification], None] | None = None, notification_subscription: "NotificationSubscription | None" = None) -> str` (liefert `response.messageId`)
- `get_working_directory(self, session_id: str) -> str`
- `set_working_directory(self, session_id: str, path: str) -> str` (sendet den Pfad unveraendert — auch relativ; belegt in `python/sdk/tests/test_working_directory.py`)
- `request(self, method: str, params: JsonObject | None, *, response_model: type[ModelT], timeout_seconds: float | None = None, on_notification: Callable[[Notification], None] | None = None, notification_filter: NotificationFilter | None = None, notification_subscription: "NotificationSubscription | None" = None) -> ModelT` — `TypeError(f"{method} response must be a JSON object")`, wenn das Ergebnis kein Objekt ist; Validierung via `response_model.model_validate(result)` (Pydantic)
- `notify(self, method: str, params: JsonObject | None = None) -> None`
- `next_notification(self) -> Notification`
- `subscribe_notifications(self, notification_filter: NotificationFilter | None = None) -> "NotificationSubscription"`
- `subscribe_session_notifications(self, session_id: str) -> "NotificationSubscription"`
- `next_request(self) -> IncomingRequest`
- `respond(self, request_id: str | int, result: JsonValue) -> None`
- `respond_error(self, request_id: str | int, *, code: int, message: str, data: JsonValue | None = None) -> None`
- Private Methoden: `_request_raw`, `_write_message`, `_start_reader_thread`, `_start_stderr_thread`, `_reader_loop`, `_stderr_loop`, `_handle_message`, `_fail_waiters`, `_runtime_closed_error`, `_runtime_diagnostics`, `_default_launch_args`, `_unsubscribe_notifications`, `_record_session_relationship_locked`, `_notification_belongs_to_session_tree`, `_session_is_descendant_of`.
- Instanzattribute: oeffentlich nur `config`; intern `_launch_args`, `_proc`, `_lock`, `_write_lock`, `_responses`, `_notifications`, `_notification_subscribers`, `_session_parents`, `_requests`, `_stderr_lines`, `_reader_thread`, `_stderr_thread`. Die Schreibsperre `_write_lock` serialisiert parallele Writes (Test `test_client_serializes_concurrent_writes`).

**`NotificationSubscription`** (oeffentlicher Name, **nicht** in `__all__`): `__init__(self, client: HarnessClient, subscription_id: str, notifications: queue.Queue[Notification | BaseException]) -> None`; `__enter__(self) -> "NotificationSubscription"`; `__exit__(self, _exc_type, _exc, _tb) -> None`; `close(self) -> None` (idempotent via `_closed`); `next(self) -> Notification`; `drain(self, on_notification: Callable[[Notification], None]) -> None`. Attribute: `_client`, `_subscription_id`, `_notifications`, `_closed`.

**Modul-Ebene `client.py`:** `ModelT = TypeVar("ModelT", bound=BaseModel)`; `NotificationFilter: TypeAlias = Callable[[Notification], bool]`; `_int_or_none(value: object) -> int | None`. Private Antwortmodelle: `_SessionPromptResponse(messageId: str)`, `_WorkingDirectoryResponse(cwd: str)`, `_ShutdownResponse` (ohne Felder).

### 9.5 Modul `errors.py` (23 Zeilen)

| Exception | Basisklasse | Konstruktor | Attribute |
|---|---|---|---|
| `HarnessError` | `Exception` | geerbt | keine eigenen |
| `TransportClosedError` | `HarnessError` | geerbt | keine eigenen |
| `SdkProtocolError` | `HarnessError` | geerbt | keine eigenen |
| `JsonRpcError` | `HarnessError` | `__init__(self, code: int | None, message: str, data: object | None = None) -> None` | `code: int \| None`, `message: str`, `data: object \| None`; `super().__init__(message)` ⇒ `args == (message,)` |
| `OfficeError` | `HarnessError` (definiert in `python/sdk/src/deepseek_harness/office.py`) | `__init__(self, code: str, message: str, exit_code: int) -> None` | `code: str`, `exit_code: int`; `super().__init__(message)` |

`errors.py` definiert **vier** Exception-Typen; `OfficeError` ist der fuenfte und liegt in `office.py`. **Keine** `__all__`, keine weiteren Klassen, keine Konstanten in `errors.py`. Nur `SdkProtocolError` wird aus `deepseek_harness` re-exportiert.

### 9.6 Modul `models.py` (32 Zeilen)

**Type-Aliase:**

| Alias | Definition |
|---|---|
| `JsonScalar` | `str \| int \| float \| bool \| None` |
| `JsonValue` | `JsonScalar \| dict[str, "JsonValue"] \| list["JsonValue"]` (rekursiv) |
| `JsonObject` | `dict[str, JsonValue]` |

**Klassen (4):** `Notification` und `IncomingRequest` sind `@dataclass(slots=True)` (nicht frozen, keine Validatoren, keine `from_dict`/`to_dict`); `ServerInfo` und `InitializeResponse` sind `pydantic.BaseModel` (kein `frozen`, kein `strict`, keine `Field`-Aliase, keine Validatoren, keine `model_config`).

| Klasse | Feld | Typ | Default |
|---|---|---|---|
| `Notification` | `method` | `str` | kein Default |
| `Notification` | `payload` | `JsonObject` | kein Default |
| `IncomingRequest` | `id` | `str \| int` | kein Default |
| `IncomingRequest` | `method` | `str` | kein Default |
| `IncomingRequest` | `payload` | `JsonObject` | kein Default |
| `ServerInfo` | `name` | `str \| None` | `None` |
| `ServerInfo` | `version` | `str \| None` | `None` |
| `InitializeResponse` | `serverInfo` | `ServerInfo \| None` | `None` |

**Enums oder `Literal`-Typen in `models.py`: keine.** `Literal` kommt ausschliesslich in `office.py` vor.

**Zusatzmodul `office.py`** (219 Zeilen, **nicht** in `__all__`). Transport: Subprozess ueber `deepseek_harness_runtime._resources.run_office_process([*deepseek_harness_runtime.resolve_office_launch_args(), *arguments, *options])`; Ergebnis als JSON auf stdout, Fehler als JSON auf stderr, Rueckgabecode entscheidet.

| Modell | Art | Felder (Typ, Default) |
|---|---|---|
| `_OfficeModel` | `pydantic.BaseModel`, `model_config = ConfigDict(strict=True, frozen=True)` | Basisklasse, keine Felder |
| `ConversionResult` | `_OfficeModel` | `backend: Literal["native", "wasm"]`; `output_path: Path = Field(alias="outputPath")`; `missing_fonts: list[str] = Field(alias="missingFonts")` |
| `ImageRectangle` | `_OfficeModel` | `x: float`, `y: float`, `width: float`, `height: float` (alle erforderlich) |
| `RenderedImage` | `_OfficeModel` | `index: int`; `path: Path`; `width: int`; `height: int`; `rectangle: ImageRectangle`; `byte_length: int = Field(alias="byteLength")`; `page: int \| None = None`; `sheet: str \| None = None`; `range: str \| None = None`; `rtl: bool \| None = None` |
| `RenderImagesResult` | `_OfficeModel` | `schema_version: Literal[1] = Field(alias="schemaVersion")`; `backend: Literal["native", "wasm"]`; `raster_engine: Literal["libreoffice", "pdfium"] = Field(alias="rasterEngine")`; `source: Literal["saved"]`; `input_path: Path = Field(alias="inputPath")`; `source_sha256: str = Field(alias="sourceSha256")`; `dpi: float`; `page_count: int = Field(alias="pageCount")`; `images: list[RenderedImage]`; `missing_fonts: list[str] = Field(alias="missingFonts")` |
| `_CliFailure` | `_OfficeModel` (privat) | `code: str`, `error: str` |
| `OfficeOptions` | `@dataclass(frozen=True, slots=True)` | 12 Felder; Methode `_arguments(self) -> list[str]` |

`OfficeOptions`-Felder (alle Default `None`): `timeout_ms: int | None`, `max_input_bytes: int | None`, `max_output_bytes: int | None`, `max_image_resolution: int | None`, `max_archive_entries: int | None`, `max_uncompressed_bytes: int | None`, `max_font_files: int | None`, `max_font_file_bytes: int | None`, `max_loaded_font_bytes: int | None`, `font_directories: Sequence[str | os.PathLike[str]] | None`, `initial_font_families: Sequence[str] | None`, `font_fallbacks: Sequence[Sequence[str]] | None`. `_arguments` mappt Feldnamen auf `--kebab-case`; Sonderfaelle: `--font-directory` (je Pfad), `--initial-font-family` (je Familie), `--font-fallbacks` (JSON-kodiert).

**Oeffentliche Funktionen in `office.py`:**
- `render_images(input_path: str | os.PathLike[str], output_dir: str | os.PathLike[str], *, pages: Literal["all"] | Sequence[int] | None = None, sheet: str | None = None, range: str | None = None, dpi: int | None = None, max_pages: int | None = None, max_pixels: int | None = None, max_dimension: int | None = None, options: OfficeOptions | None = None) -> RenderImagesResult`
- `convert(input_path, output_path, *, sheet: str | None = None, options: OfficeOptions | None = None) -> ConversionResult`
- `recalculate(input_path, output_path, *, options: OfficeOptions | None = None) -> ConversionResult`
- Privat: `_run(arguments: list[str], options: OfficeOptions | None, result_type: type[_Result]) -> _Result`; `_Result = TypeVar("_Result", bound=_OfficeModel)`. Fehlerpfad: eigener Fehlercode aus stderr-JSON → `OfficeError(code, error, returncode)`; unlesbares stderr → `OfficeError("failed", <stderr-Text>, returncode)`; ungueltiges Ergebnis-JSON → `SdkProtocolError("Office CLI returned an invalid result.")` (belegt in `python/sdk/tests/test_office.py`).

### 9.7 Beispiel `examples/minimal.py` (48 Zeilen)

Ablauf Schritt fuer Schritt:
1. `main()` legt einen `argparse.ArgumentParser` an; `configured_home = os.environ.get("DSH_HOME", "")` liest die Umgebung.
2. Positionales Argument `prompt` („Task for the minimal agent") — erforderlich.
3. `--workspace` (`type=Path`, Default `Path.cwd()`), `--dsh-home` (`type=Path`, Default `Path(configured_home)`, wenn `DSH_HOME` nicht leer, sonst `None`), `--profile` (Default `"sdk-minimal"`), `--session-id` (ohne Default), `--provider` (Default `"deepseek-official"`), `--model` (Default `os.environ.get("DSH_MODEL", "deepseek-v4-flash")`), `--max-tokens` (`type=int`, ohne Default).
4. Ohne `--dsh-home` und ohne nicht-leeres `DSH_HOME` bricht das Skript mit `parser.error("--dsh-home or a non-empty DSH_HOME is required")` ab ⇒ Exit-Code 2.
5. `workspace` und `dsh_home` werden per `.resolve()` absolut gemacht; es wird **kein** implizites `cwd` gesetzt.
6. Kontextmanager `DeepSeekHarness(provider=..., model=..., max_tokens=..., cwd=str(workspace), dsh_home=str(dsh_home), profile=args.profile)` — `reasoning_effort`, `runtime_cwd`, `patches`, `base_url`, `api_key`, `env` werden **nicht** gesetzt.
7. `harness.run(args.prompt, session_id=args.session_id)` — ohne `on_notification`-Callback; `session_id=None` erzeugt intern `session-<uuid4hex>`.
8. Nach Verlassen des `with`-Blocks (`close()` ⇒ JSON-RPC `shutdown` plus Prozess-Reaping) wird `print(result.final_response)` ausgegeben.

**Ausgeuebter Transport und Calls:** JSON-RPC 2.0 ueber stdio als Subprozess. Der Startpfad nutzt `resolve_bundled_launch_args()` aus dem Wheel `deepseek-harness-runtime-bin` plus `--profile sdk-minimal`, also die gebuendelte `dsh`-CLI (kein HTTP, kein SSE, kein Socket). Ausgefuehrt werden `initialize` mit `{"cwd", "provider", "model"}` (und `maxTokens`, falls gesetzt), `session/prompt` mit `{"sessionId", "contentBlocks"}`, die konsumierten Notifications (`session.event`, `session.status`, ggf. `subagent.*`) und beim Verlassen `shutdown`. Das Skript setzt **kein** `DEEPSEEK_API_KEY`; die Anleitung verlangt es aus der Umgebung (`python/sdk/examples/README.md`).

### 9.8 Tests und Zusatzdateien im SDK-Tree

- Kein `conftest.py`, kein `tests/__init__.py`; die Tests importieren `deepseek_harness` als installiertes Paket.
- `python/sdk/tests/manual_sdk_agent_smoke.py` wird **nicht** von pytest gesammelt („This manual test is not collected by pytest; run `python tests/manual_sdk_agent_smoke.py`"); es startet einen Mock-SSE-Modellserver und faehrt `DeepSeekHarness` ueber `node --import tsx apps/cli/src/bin.ts --profile sdk`.
- `python/sdk/tests/fixtures/office_cli.py` ist der Fake-Office-Peer, der `sys.argv` als JSON-Receipt protokolliert.
- `python/sdk/tests/test_release_version.py` und `test_macos_deployment_target.py` laden Repo-Skripte (`scripts/build-python-release.py`, `scripts/check-macos-deployment-target.py`) und pruefen das Release-Staging (u. a. `license-files = ["LICENSE"]` und die Runtime-Pin-Zeile `"deepseek-harness-runtime-bin==1.2.3"`).
- `python/sdk/README.zh.md`, `README.i18n.yaml`, `examples/README.zh.md` und `examples/README.i18n.yaml` sind die bilingualen Paar-/Hash-Registrierungen.

### 9.9 Zaehlung

- **Oeffentliche Klassen: 21** — `DeepSeekHarness`, `DeepSeekHarnessConfig`, `Session`, `RunResult` (`api.py`); `HarnessClient`, `HarnessConfig`, `NotificationSubscription` (`client.py`); `Notification`, `IncomingRequest`, `ServerInfo`, `InitializeResponse` (`models.py`); `HarnessError`, `TransportClosedError`, `SdkProtocolError`, `JsonRpcError` (`errors.py`); `OfficeError`, `ConversionResult`, `ImageRectangle`, `RenderedImage`, `RenderImagesResult`, `OfficeOptions` (`office.py`). Davon sind **12** ueber `deepseek_harness/__init__.py` re-exportiert; **9** erreichen Nutzer nur ueber die Untermodule.
- **Exception-Typen: 5** — `HarnessError` (Basis `Exception`), `TransportClosedError`, `SdkProtocolError`, `JsonRpcError`, `OfficeError`.
- **Dataclass-/Modell-Felder: 77 oeffentliche Felder.** Aufteilung: `DeepSeekHarnessConfig` 16, `RunResult` 5, `HarnessConfig` 9, `Notification` 2, `IncomingRequest` 3, `ServerInfo` 2, `InitializeResponse` 1, `OfficeOptions` 12, `ConversionResult` 3, `ImageRectangle` 4, `RenderedImage` 10, `RenderImagesResult` 10; zusaetzlich **4** Felder in privaten Modellen (`_SessionPromptResponse.messageId`, `_WorkingDirectoryResponse.cwd`, `_CliFailure.code`, `_CliFailure.error`) ⇒ **81 Felder insgesamt**. `_ShutdownResponse` und `_OfficeModel` haben keine Felder.
- **Modulweite Type-Aliase: 4** — `JsonScalar`, `JsonValue`, `JsonObject` (`models.py`), `NotificationFilter` (`client.py`); dazu die Typparameter `ModelT` und `_Result`.
- **Enums: 0.** `Literal`-Typen: 9 Vorkommen in `office.py`.
- **`from_dict`/`to_dict`: 0** — Serialisierung laeuft ausschliesslich ueber Pydantic und `json.dumps`/`json.loads`.
- **Frozen: 6 Klassen** (`_OfficeModel` und die fuenf davon abgeleiteten Modelle) sowie die Dataclass `OfficeOptions`.
- **Ausdruecklich abwesend:** HTTP-Transport, SSE, Sockets, Retries/Backoff, Auth-Header, `__version__`, `py.typed`, `[project.scripts]`-Entry-Points, optionale Extras, Classifiers, sdist-Konfiguration, `Enum`-Typen, `_version.py`, `conftest.py`.

---

## 10. Repository-Infrastruktur

### 10.1 Workspace-Konfiguration

`pnpm-workspace.yaml` (115 Zeilen), `packages:`-Block woertlich:

```yaml
packages:
  - vendor/*
  - packages/*/*
  # The Landlock launcher is developed with its harness consumers but keeps
  # its native build and publication scripts under native/system.
  - native/system
  - native/system/packages/*
  # Product assemblies over the package tier; apps/cli owns the `dsh` bin.
  - apps/*
  # Private package owning repository-level benchmark dependencies.
  - benchmarks
  - website
  # Deploy root of the single-exe build: a pure dependency manifest whose
  # closure is what the exe bundles and what the Python runtime distributes.
  - python/sdk-runtime
```

```yaml
overrides:
  'extract-zip>yauzl': '3.4.0'
  '@deepseek-ai/cosmokit': 'link:vendor/cosmokit'
  '@deepseek-ai/schemastery': 'link:vendor/schemastery'

peerDependencyRules:
  allowedVersions:
    typescript: '>=5 <7'
```

```yaml
patchedDependencies:
  '@earendil-works/pi-ai@1.0.2': patches/@earendil-works__pi-ai@1.0.2.patch
  '@electron/osx-sign@1.3.3': patches/@electron__osx-sign@1.3.3.patch
  '@fortune-sheet/core@1.0.4': patches/@fortune-sheet__core@1.0.4.patch
  '@fortune-sheet/react@1.0.4': patches/@fortune-sheet__react@1.0.4.patch
  '@yao-pkg/pkg@6.21.0': patches/@yao-pkg__pkg@6.21.0.patch
  exceljs@4.4.0: patches/exceljs@4.4.0.patch
  node-pty@1.2.0-beta.15: patches/node-pty@1.2.0-beta.15.patch
```

| Aspekt | Befund (`pnpm-workspace.yaml`) |
|---|---|
| `packages:` | 9 Globs (siehe Zitat); `units/*` **fehlt** (siehe Abschnitt 11) |
| `overrides:` | 3 Eintraege |
| `peerDependencyRules:` | nur `allowedVersions: typescript: '>=5 <7'` |
| `patchedDependencies:` | 7 Eintraege, deckungsgleich mit `patches/` |
| `onlyBuiltDependencies` | **existiert nicht**; stattdessen `allowBuilds` (Zeilen 31–55) |
| `catalog` | **existiert nicht** in dieser Datei |
| `allowBuilds` | `esbuild: true`, `lefthook: true`, `node-pty: true`, `'@google/genai': false`, `protobufjs: false`, `node-addon-require-builtin: false`, `koffi: true`, `'@deepseek-ai/dsh-subprocess-local@file:packages/subprocess/subprocess-local': true`, `electron-winstaller: false`, `msgpackr-extract: false`; Kommentar: „pnpm 10+ blocks any dependency shipping an install/build script until it is explicitly reviewed here (strictDepBuilds defaults to true…)" |
| `minimumReleaseAgeExclude` | 40+ gepinnte Ausnahmen (u. a. `pnpm@11.28.5`, `electron@44.7.0`, `node-addon-require-builtin@0.1.9`) |

Der Root-`package.json` fuehrt zusaetzlich ein `workspaces`-Feld mit 6 Globs (`vendor/*`, `packages/*/*`, `native/system`, `native/system/packages/*`, `apps/*`, `website`) — ohne `benchmarks` und `python/sdk-runtime`; massgeblich ist `pnpm-workspace.yaml`.

**Root-`package.json`** (286 Zeilen): `name: @deepseek-ai/dsh-root`, `version: 0.2.1-alpha.2`, `license: MIT`, `private: true`, `type: module`, `packageManager: pnpm@11.28.5`, `engines.node: ^22.19.0 || >=24.0.0`.

Wichtige `scripts` (insgesamt 214 Eintraege): `prepare:primary-runtime` → `tsx scripts/primary-runtime/prepare.ts`; `build` → `tsx scripts/build.ts`; `build:official` → `tsx scripts/build.ts --profile official`; `build:lib` → `build:lib:host && build:lib:client`; `build:lib:host` → `tsc -b tsconfig.host.json && tsdown --config-loader native --env.DSH_BUILD_FACE host && pnpm --filter @deepseek-ai/dsh-desktop run bundle`; `build:lib:client` → `tsc -b tsconfig.client.json && tsdown --config-loader native --env.DSH_BUILD_FACE client`; `clean`; `change-scope`; `typecheck`; `lint`/`lint:fix` → `tsx scripts/run-oxlint.ts`; `duplication` → `jscpd --config .jscpd.json packages scripts`; `test` → `pnpm run build:native-system && vitest run`; `test:coverage`; `test:coverage:partitioned`; `test:e2e`; `test:bench`; `test:expected`/`test:expected:refresh`; `test:approval-policy`; `test:issue-management`; `test:snapshot`/`:record`/`:refresh`; `migrate:packed-session-fixtures`; `migrate:sessions-to-v4`; `test:web`/`:ci`/`:perf`/`:stress`; `check:all`/`check:ci*` → `tsx scripts/run-gates.ts`; `check:windows-wine`; `check:node-compat`; `publint`; `doc-typecheck`; `verify-md-wrap`; `verify-md-links`; `verify-*`; `test:docs`; `gen-*`-Generatoren mit `verify-*`-Gegenstuecken; `constraints`; `doc-sync`; `hygiene`; `release:*`; `dsh` → `node --import tsx/esm apps/cli/src/bin.ts`; `demo:ptc`; `demo:inspector`; `mock:llm`; `start:web`; `dev:web` → `tsx scripts/dev-web.ts --poll`; `postinstall` → `node scripts/install-lefthook.mjs`.

`devDependencies`-Highlights: `typescript ^6.0.3`, `tsdown ^0.22.2`, `tsx ^4.23.13`, `vitest ^4.1.11`, `@vitest/coverage-v8 ^4.1.11`, `vite 8.2.2`, `vite-tsconfig-paths ^6.1.1`, `oxlint 1.81.0`, `oxlint-tsgolint 7.0.2001`, `jscpd ^5.1.2`, `lefthook ^2.1.12`, `pnpm 11.28.5`, `jsdom 29.1.1`, `js-yaml ^4.3.2`, `smol-toml ^1.9.0`, `zod ^4.4.3`, `@yao-pkg/pkg 6.21.0`, `publint ^0.3.24`, `semver ^7.8.5`, `mermaid 11.17.2`, `fast-check ^4.9.0`, `tar ^7.5.22`.

### 10.2 TypeScript-Konfigurationen

| Datei | Zweck | Kerneinstellungen |
|---|---|---|
| `tsconfig.base.json` | Basis aller Pakete **und** Aufloesungs-Fassade fuer `vite-tsconfig-paths` | `target: es2024`, `module: esnext`, `moduleResolution: bundler`, `composite: true`, `incremental: true`, `declaration`/`sourceMap`/`declarationMap: true`, `allowImportingTsExtensions: true`, `rewriteRelativeImportExtensions: true`, `verbatimModuleSyntax: false`, `skipLibCheck: true`, `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `types: ["node"]`; `paths` mit ~500 Eintraegen, u. a. `@deepseek-ai/cordis` → `./vendor/cordis/src`, `@deepseek-ai/cosmokit` → `./vendor/cosmokit/src`, `@deepseek-ai/schemastery` → `./vendor/schemastery/src`, `@deepseek-ai/cordis-plugin-loader` → `./vendor/loader/src`, `@deepseek-ai/dsh/lib/bin.js` → `./apps/cli/src/bin.ts`; generierter Block `BEGIN generated package aliases — pnpm run gen-tsconfig-paths` … `END generated package aliases` |
| `tsconfig.json` | Solution-Datei: Repo-Graph fuer `tsc -b tsconfig.json` und tsserver; traegt Basis-`paths` fuer `get-tsconfig`-Konsumenten (tsx beim Ausfuehren von `scripts/`) | `extends: ./tsconfig.base.json`, `files: []`, `references: [tsconfig.host.json, tsconfig.client.json]`; Kommentar: „NEVER add include/files entries, and NEVER flatten this solution into a single ts.Program" |
| `tsconfig.host.json` | Host-Aggregat (eine der zwei Pruefeinheiten); `packages/client` bewusst aussen vor | `noEmit: true`, `rewriteRelativeImportExtensions: false`; `include`: `apps/web/tests/**`, `apps/web/product-isolation.ts`, `apps/cli/tests/**/*.ts`, `apps/desktop/**`, `apps/desktop-host/tests/**`, `benchmarks/**/*.ts`, `packages/*/*/tests/**/*.ts`, `packages/experimental/claude-code-mods/examples/*/index.ts`, `packages/experimental/inspector/scripts/**`, `scripts/**/*.ts`, `website/**/*.ts`, `website/.vitepress/**/*.ts`; `exclude`: `packages/client/*/src/**`, `benchmarks/**/*.client.ts(x)`, `packages/*/*/tests/**/*.client.*`, `packages/typert/generator/tests/fixtures/**`, `scripts/client-bundle-*.spec.ts`; ~290 `references` (inkl. aller 9 `vendor/`-Pakete) |
| `tsconfig.client.json` | Client-Aggregat: `packages/client`-Tests und Top-Level-Client-Benchmarks | `extends: ./tsconfig.base.client.json`, `noEmit: true`, `rewriteRelativeImportExtensions: false`, `types: ["node"]`; `include`: `apps/desktop/tests/keyboard.spec.ts` + Freunde, `apps/desktop/tests/**/*.client.spec.tsx`, `packages/client/*/tests/**/*.ts(x)`, `benchmarks/**/*.client.ts(x)`, `packages/*/*/tests/**/*.client.*`, `scripts/*.client.spec.ts`, `scripts/client-bundle-css.spec.ts`, `scripts/client-bundle-purity.spec.ts`; `exclude`: `packages/client/*/tests/**/*.host.spec.ts`; ~95 `references` |
| `tsconfig.base.client.json` | Client-Compiler-Form fuer `tsconfig.client.json` und jedes `packages/client/*` | `jsx: react-jsx`, `lib: ["ES2024","DOM","DOM.Iterable","ESNext.Disposable"]`, `typeRoots: ["./scripts/types","./node_modules/@types"]`, `types: ["client-build-environment"]` |

Beziehungen: `tsconfig.base.json` ist die Wurzel; `tsconfig.json` referenziert die zwei Aggregate; Host und Client sind getrennt, weil beide Seiten `cordis Context` unter denselben Schluesseln mergen. Die nativen Workspaces haben eigene Konfigurationen, z. B. `native/system/tsconfig.json` mit `extends: ./tsconfig.base.json`, `include: ["scripts/**/*.ts"]` und `references: [{ "path": "./packages/entry" }]`.

### 10.3 Build-Pipeline

`scripts/build.ts` traegt den Header „Build repository artifacts and bind client outputs to their public environment"; prueft `process.features.typescript`, kennt `--profile` und `--artifacts-only`. Der eigentliche Ablauf ist die Skriptkette aus Abschnitt 10.1: `build:lib:host` kompiliert `tsc -b tsconfig.host.json` und bundelt danach mit `tsdown --config-loader native --env.DSH_BUILD_FACE host` nach `lib/`; `build:lib:client` dasselbe mit `tsconfig.client.json` und `--env.DSH_BUILD_FACE client`. `tsdown.config.ts`:

| Aspekt | Wert (`tsdown.config.ts`) |
|---|---|
| `workspace` | client: `['vendor/*','packages/*/*','apps/cli']`; host: zusaetzlich `'apps/desktop-host'` |
| `entry` | client: `''` (paketlokale Konfigs); host: `['lib/types/{index,startup}.js']` |
| `outDir` / `format` | `lib` / `['esm']` |
| `platform` / `target` | `node` / `es2024` |
| `dts` / `clean` / `fixedExtension` | `false` / `false` / `false` |
| `plugins` | host: `[typertPlugin({ mode: 'workspace', faces: ['host'] })]`; client: `[]` |
| Face-Schalter | `--env.DSH_BUILD_FACE` ∈ `host` \| `client`, sonst Fehler |

`scripts/compile-referenced-projects.ts` („Compile and bundle package projects without repeating aggregate test and script typechecks"; Modi `checked` und `benchmark-emit`) ist der Wiederaufnahme-Pfad fuer inkrementelle Laeufe.

### 10.4 Test-Setup und Snapshot-Tests

Gemeinsame Bausteine in `vitest.shared.ts`: `vitestExecArgv` (setzt `--no-webstorage`, wenn Node das Flag in `allowedNodeEnvironmentFlags` kennt) und `standardDecoratorPlugin()` (Vite-`pre`-Plugin, transpiliert Standard-Decorators ueber `ts.transpileModule`). Alle Konfigurationen nutzen `tsconfigPaths({ projects: ['./tsconfig.base.json'] })`.

| Datei | Include-Globs | Besonderheiten |
|---|---|---|
| `vitest.config.ts` | `packages/*/*/tests/**/*.spec.{ts,tsx}`, `apps/*/tests/**/*.spec.{ts,tsx}`, `scripts/**/*.spec.ts`, `website/tests/**/*.spec.ts` | zwei Inline-`projects`: `thread-safe` und `process-bound` (8 Prozess-Suiten); beide `pool: 'forks'`; `setupFiles: ['./scripts/test-proxy-environment.ts','./scripts/test-dom-environment.ts']`; plattformabhaengige `exclude`-Listen; Coverage `provider: 'v8'`, `include: ['packages/*/*/src/**/*.{ts,tsx}']`, `perFile: true` mit `statements\|branches\|functions\|lines: 100`, Reporter `scripts/coverage-uncovered-locations.cjs` |
| `vitest.bench.config.ts` | `benchmarks/**/*.bench.ts`, `benchmarks/**/*.bench.client.ts` | `globalSetup: ['./benchmarks/support/scaling-report.ts']`, `fileParallelism: false`, `maxWorkers: 1`, `testTimeout: 600_000`, `disableConsoleIntercept: true` |
| `vitest.snapshot.config.ts` | `scripts/session-snapshot-corpus.corpus.ts`, `snapshots/**/*.snapshot.ts`, bei `DSH_EXAMPLE_MODE=lib` zusaetzlich `apps/web/tests/**/*.snapshot.ts` | Snapshot-Mechanik unten |
| `vitest.web.config.ts` | `apps/web/tests/**/*.e2e.ts`, `apps/web/tests/**/*.snapshot.ts`, `packages/experimental/inspector/tests/client-browser.e2e.ts` | laedt `.env` per `process.loadEnvFile`; `fileParallelism: false`; `testTimeout: 180_000`, `hookTimeout: 120_000` |
| `vitest.e2e.config.ts` | `packages/*/*/tests/**/*.e2e.ts`, `apps/cli/tests/**/*.e2e.ts`, `apps/desktop/tests/**/*.e2e.ts` | echte API (kostet Tokens); `exclude`: `**/*.expected.e2e.ts`, `packages/experimental/inspector/tests/client-browser.e2e.ts`; `retry: 2`; Worker-Budget `DSH_E2E_MAX_WORKERS` (Default 4) |
| `vitest.expected.config.ts` | `apps/cli/tests/**/*.expected.e2e.ts` | „Owner-local assembled expected-output tests", `maxWorkers: Math.min(5, availableParallelism())` |
| `vitest.web-stress.config.ts` | `apps/web/stress-tests/**/*.stress.ts` | optionaler Lauf; kein Standard-Config zieht `*.stress.ts` ein |
| `vitest.web.perf.config.ts` | `apps/web/tests/**/*.perf.ts`, `packages/client/ui-conversation/tests/**/*.perf.client.ts` | erweitert `vitest.web.config.ts`; `execArgv` zusaetzlich `--expose-gc` |

**Snapshot-Mechanik.** `snapshots/` am Repo-Root ist der Ort fuer sessiongetriebene Erwartungen; `snapshots/AGENTS.md` begrenzt das („This tree contains only tests whose committed session JSONL is replay input and expected persisted output") und verweist nicht-session-basierte Erwartungen an `test:expected`, `test:web` oder `test`. Das Verzeichnis enthaelt `snapshots/acp`, `snapshots/sdk`, `snapshots/session`, `snapshots/web` und `snapshots/AGENTS.md` (insgesamt 1562 Dateien). Dateinamen: Eltern `session[.vN].jsonl`, Kinder `session.<ordinal>[.vN].jsonl`; v0 laesst `.v0` weg, positive Versionen nutzen `.vN`, jeder Name muss zum Header passen. Modi ueber `DSH_SNAPSHOT` (`vitest.snapshot.config.ts`): `replay` (Default, keyless, schreibt nie), `record` (echte API, aktualisiert Fixtures und Erwartungen, liest Key aus Umgebung oder Root-`.env`), `refresh` (spielt committete Skripte ab, aktualisiert aktuelle Erwartungen); `DSH_SNAPSHOT_MAX_CONCURRENCY` (Default `min(5, availableParallelism())`) und optional `DSH_SNAPSHOT_MAX_WORKERS`; `fileParallelism` nur im `replay`-Modus. Der `--update`-Lauf liegt allein in `test:snapshot:record`. `scripts/run-web-snapshots.ts` fuehrt zuerst die zwei seriellen Besitzer `apps/web/tests/hmr-live.e2e.ts` und `apps/web/tests/client-plugin-live.e2e.ts` aus und danach einen Pool (`DSH_WEB_SNAPSHOT_WORKERS`, Pflicht-Positive-Integer) mit `--exclude=<file>` fuer beide.

### 10.5 pnpm-Patches

`patches/` enthaelt **genau 7** Dateien; die Zuordnung ist identisch mit `patchedDependencies:`.

| Patchdatei | Paket@Version | Aenderung und Grund |
|---|---|---|
| `patches/@earendil-works__pi-ai@1.0.2.patch` | `@earendil-works/pi-ai@1.0.2` | Entfernt in `dist/api/anthropic-messages.js`, `bedrock-converse-stream.js`, `mistral-conversations.js`, `openai-completions.js`, `openai-responses-shared.js` das inkrementelle `block.arguments = parseStreamingJson(block.partialJson)` im `toolcall_delta`-Pfad; unvollstaendiges JSON wird nicht mehr bei jedem Delta geparst |
| `patches/@electron__osx-sign@1.3.3.patch` | `@electron/osx-sign@1.3.3` | In `dist/cjs/util.js` und `dist/esm/util.js` in `walkAsync` `fs.stat` → `fs.lstat`; der Signatur-Spaziergang darf Symlinks nicht aufloesen |
| `patches/@fortune-sheet__core@1.0.4.patch` | `@fortune-sheet/core@1.0.4` | `escapeHTMLTag(c_value)` → `_.escape(c_value)` in `rangeValueToHtml`; frueher Ruecklauf in `drawFreezeLine` bei `sheetCtx.allowEdit === false`; Read-only-Trackpad-Panning bei `e.deltaMode === 0` |
| `patches/@fortune-sheet__react@1.0.4.patch` | `@fortune-sheet/react@1.0.4` | Effektbedingung auf `!context.allowEdit && context.forceFormulaRef`; Formel-Editor nutzt im Read-only-Fall `cell.f` und `textContent` statt `innerHTML`; kein HTML-Injection-Pfad |
| `patches/@yao-pkg__pkg@6.21.0.patch` | `@yao-pkg/pkg@6.21.0` | 400 454 Bytes gegen `prelude/sea-bootstrap.bundle.js`; fuehrt `writeFileAtomic(dest, content)` ein (Temp-Datei im selben Verzeichnis + `renameSync`, Aufraeumen bei Fehler); Begruendung im Kommentar: „a concurrent process never observes a partially written addon" (sonst SIGBUS / „Library not loaded") |
| `patches/exceljs@4.4.0.patch` | `exceljs@4.4.0` | In `dist/exceljs.js` und `lib/utils/parse-sax.js`: `new SaxesParser()` → `new SaxesParser({xmlns: true})` plus `prefixes`-Map und `canonicalName(node)`; „Xforms use canonical names; OOXML producers may choose different prefixes"; zusaetzlich `lib/xlsx/xform/book/workbook-xform.js`, `comment/comment-xform.js`, `sheet/worksheet-xform.js` |
| `patches/node-pty@1.2.0-beta.15.patch` | `node-pty@1.2.0-beta.15` | In `lib/unixTerminal.js` wird `helperPath` zuerst aus `process.env.DSH_NODE_PTY_SPAWN_HELPER`, dann aus `process.execPath + '-spawn-helper'`, zuletzt aus dem bisherigen `app.asar`-Pfad bestimmt; „A current external embedded-runtime consumer supplies a non-sibling helper"; dazu `lib/windowsPtyAgent.js` |

### 10.6 `scripts/`

`scripts/` enthaelt **308 Dateien** inklusive der Unterordner `dependency-catalog/`, `fixtures/`, `primary-runtime/`, `release/`, `snapshots/`, `ssh-helper/`, `tests/`, `types/`.

**Wichtige Einzelskripte (eine Zeile je Skript):**

| Skript | Zweck |
|---|---|
| `scripts/build.ts` | „Build repository artifacts and bind client outputs to their public environment"; prueft `process.features.typescript`, kennt `--profile` und `--artifacts-only` |
| `scripts/persistence-schema.ts` | „Extract complete persistent Session record types from one source-only compiler program" |
| `scripts/gen-config-catalog.ts` | Erzeugt `docs/config-catalog.md` aus Paket-Entrypoints, Config-Typen, JSDoc und statischen Schemastery-Schemas; `--check` prueft das committete Artefakt |
| `scripts/verify-export-jsdoc.ts` | Erzwingt JSDoc auf jedem nicht-vendorten Paket-Export; Funktionen und oeffentliche Methoden brauchen `@param` und `@returns` |
| `scripts/gen-doc-graphs.ts` | Erzeugt die Beziehungsschicht ueber Modul-, Cordis- und Tool-Katalogen (enumerierbar, hybrid, kuratiert); `--check` |
| `scripts/cordis-core-api.ts` | Erzeugt die Cordis-Core-API-Seiten aus gepinnten Vendor-Deklarationen; Fence-Kennung `ts cordis-catalog` |
| `scripts/verify-type-equiv.ts` | Prueft jeden `ts type-equiv`- und `ts public-api`-Block gegen das im Manifest benannte Quellsymbol |
| `scripts/change-scope.ts` | „Report the explicit committed and worktree scope of a repository change" (`FORMAT_VERSION = 1`) |
| `scripts/agent-note-tree.ts` | Struktur-Wahrheit des Agent-Note-Baums; geschlossene Lifecycles `['proposed','implemented','rejected']`, Klassen `['feature','bug-fix','simplification','architecture','process','testing']`, `ROOT_ALLOWLIST = ['AGENTS.md','CLAUDE.md']` |
| `scripts/build-exe-for-python-sdk.ts` | Baut die `dsh`-Executables und den Entwicklungs-Node-Carrier fuer das Python-Runtime-Wheel (`@yao-pkg/pkg --sea`) |
| `scripts/build-exe-for-python-sdk-staging.ts` | „Prepare a symlink-free executable runtime payload with shared workspace module instances" |
| `scripts/build-exe-for-python-sdk-office.ts` | Haelt LibreOffice-Worker, Prebuilt-Engines und deren Abhaengigkeiten auf dem echten Dateisystem (`OFFICE_ASSET_IGNORES`) |
| `scripts/build-exe-for-python-sdk-assets.spec.ts` | Vitest-Spec, die `scripts/build-exe-for-python-sdk.ts` mit `--skip-build` startet und die gepackten Assets prueft |
| `scripts/run-gates.ts` | Fuehrt lokale und CI-Gates mit begrenztem In-Process-Scheduling aus; Modi `ci-primary`, `ci-linux-primary`, `ci-static`, `ci-lint-contracts-ready`, `ci-coverage`, `ci-unit`, `ci-bench`, `ci-snapshot`, `ci-artifacts`, `ci-consumers`, `ci-windows-blocking`, `ci-windows-complete`, `ci-windows-observational-ready`, `node-compat`, `check-all`, `hygiene`, `doc-sync`, `doc-quick` |
| `scripts/verify-md-links.ts` | Prueft relative Markdown-Links, Bilder und Definitions; Zieldatei muss existieren, ein `#fragment` muss eine echte Heading-Slug oder ein `<a id>` benennen |
| `scripts/gen-third-party-notices.ts` | Erzeugt `THIRD_PARTY_NOTICES.md` aus Workspace-Manifesten, `vendor/README.md`, Python-`pyproject.toml`-Dateien, Python-Lock und pnpm-Patch-Liste; `--check` |
| `scripts/compile-referenced-projects.ts` | „Compile and bundle package projects without repeating aggregate test and script typechecks"; Modi `checked` und `benchmark-emit` |
| `scripts/check-workspace-constraints.ts` | Workspace-Paketinvarianten fuer paketmanager-unabhaengige Qualitaetsgates (`pnpm run constraints`) |
| `scripts/doc-typecheck.ts` | Typprueft Markdown-`ts`-Fences gegen die Workspace-API; `ignore-check`-Fences werden als Opt-outs gemeldet |
| `scripts/translation-pairing.ts` | Reine Parsing-/Struktur-Helfer des Bilingual-Pairing-Gates; einzige Heimat der Generated-Region-Grammatik (`<!-- BEGIN GENERATED <slug> -->`) |

**Alle uebrigen Dateinamen, nach Zweck gruppiert:**

- **Build, Clean, Dev-Server (9):** `build.spec.ts`, `clean.ts`, `clean.spec.ts`, `dev-web.ts`, `dev-web.spec.ts`, `dev-bundle-registry.ts`, `prepare-ci-bubblewrap.sh`, `prepare-linux-node-pty.sh` (plus `build.ts` oben).
- **TypeScript-Projekte & Kompilierung (10):** `compile-referenced-projects.spec.ts`, `project-reference-faces.ts`, `project-reference-faces.spec.ts`, `client-tsconfig.spec.ts`, `ts-project.ts`, `doc-typecheck-paths.ts`, `doc-typecheck-paths.spec.ts`, `executable-native-pty.ts`, `native-pty.ts` (plus `compile-referenced-projects.ts`, `doc-typecheck.ts` oben).
- **Bundling & Bundle-Isolation (10):** `browser-bundled-externals.ts`, `browser-bundled-externals.spec.ts`, `bundle-input-isolation.ts`, `client-bundle-css.spec.ts`, `client-bundle-purity.spec.ts`, `web-product-bundle-isolation.ts`, `web-product-bundle-isolation.spec.ts`, `local-bundle-registry.ts`, `local-bundle-registry.spec.ts`, `optional-bundles.spec.ts`.
- **Paket-, Produkt- & Experimental-Policy (8):** `experimental-package-policy.ts`, `experimental-package-policy.spec.ts`, `product-package-policy.ts`, `package-dependency-policy.ts`, `package-graph.ts`, `package-graph.spec.ts`, `npm-baseline-packages.ts`, `npm-baseline-packages.spec.ts`.
- **Single-Exe & Python-Runtime (22):** `build-exe-for-python-sdk.spec.ts`, `build-exe-for-python-sdk-assets.spec.ts`, `build-exe-for-python-sdk-native-pty.spec.ts`, `build-exe-for-python-sdk-office.ts`, `build-exe-for-python-sdk-office.spec.ts`, `build-exe-for-python-sdk-staging.spec.ts`, `executable-packaging.ts`, `executable-packaging.spec.ts`, `libreoffice-packages.mjs`, `libreoffice-packages.d.mts`, `libreoffice-engine.spec.ts`, `python-runtime-download.spec.ts`, `smoke-python-runtime.py`, `primary-runtime/lock.json`, `primary-runtime/prepare.ts`, `primary-runtime/prepare.spec.ts`, `primary-runtime/prune-python-tests.ts`, `primary-runtime/prune-python-tests.spec.ts`, `primary-runtime/smoke.py` (plus die drei `build-exe-for-python-sdk*` oben).
- **SSH-Helper-Artefakt (9):** `build-exe-for-ssh-helper.ts`, `verify-ssh-helper-artifact.ts`, `verify-ssh-helper-ssh.ts`, `ssh-helper/artifact.ts`, `ssh-helper/artifact.spec.ts`, `ssh-helper/native.ts`, `ssh-helper/probe.ts`, `ssh-helper/release.ts`, `ssh-helper/worker-probe.ts`.
- **Release & Publikation (18):** `publish-npm-baseline.ts`, `publication-payload.ts`, `publication-payload.spec.ts`, `release/bump.ts`, `release/families.ts`, `release/families.spec.ts`, `release/installed-product-isolation.ts`, `release/installed-product-isolation.spec.ts`, `release/pack.ts`, `release/pack.spec.ts`, `release/process.ts`, `release/process.spec.ts`, `release/publish.ts`, `release/publish.spec.ts`, `release/tarball.ts`, `release/verify-packed-install.ts`, `release/verify-packed-install.spec.ts`, `release/verify.ts`.
- **Kataloge & Generatoren (33):** `gen-cli-help.ts`, `gen-cli-help.spec.ts`, `gen-client-catalog.ts`, `gen-client-catalog.spec.ts`, `gen-config-catalog.spec.ts`, `gen-cordis-api.ts`, `gen-cordis-catalog.ts`, `gen-cordis-catalog-partition.spec.ts`, `gen-cordis-inspect-catalog.ts`, `gen-dependency-catalog.ts`, `gen-dependency-catalog.spec.ts`, `gen-doc-graphs.spec.ts`, `gen-module-graph.ts`, `gen-official-bundle-catalog.ts`, `gen-official-bundle-catalog.spec.ts`, `gen-persistence-catalog.ts`, `gen-plugin-packages.ts`, `gen-session-format-catalog.ts`, `gen-session-format-catalog.spec.ts`, `gen-third-party-notices.spec.ts`, `gen-tool-catalog.ts`, `gen-translation-brief.ts`, `gen-tsconfig-paths.ts`, `gen-tsconfig-paths.spec.ts`, `gen-workflow-guest.ts`, `gen-workflow-guest.spec.ts`, `dependency-catalog/package-lock.json`, `dependency-catalog/resolution.json` (plus `gen-config-catalog.ts`, `gen-doc-graphs.ts` oben).
- **Persistenz-Dokumentation & Schema (27):** `persistence-schema.spec.ts`, `persistence-schema-model.ts`, `persistence-schema-model.spec.ts`, `persistence-schema-snapshot.spec.ts`, `persistence-artifacts.ts`, `persistence-catalog-source.ts`, `persistence-catalog-text.ts`, `persistence-changes.ts`, `persistence-changes.spec.ts`, `persistence-developer.spec.ts`, `persistence-epoch-header.spec.ts`, `persistence-finalization.ts`, `persistence-format-facts.ts`, `persistence-formats.ts`, `persistence-formats.spec.ts`, `persistence-release-facts.ts`, `persistence-releases.ts`, `persistence-releases.spec.ts`, `persistence-review.ts`, `persistence-review.spec.ts`, `persistence-source-annotations.ts`, `persistence-source-metadata.ts`, `persistence-source-policy.ts`, `historical-schema-region.ts`, `render-persistence-schema.ts`, `render-persistence-schema.spec.ts` (plus `persistence-schema.ts` oben).
- **Doku- & Markdown-Gates (35):** `verify-md-links.spec.ts`, `verify-md-wrap.ts`, `verify-doc-refs.ts`, `verify-doc-budgets.ts`, `verify-mermaid.ts`, `verify-concrete-terms.ts`, `verify-concrete-terms.spec.ts`, `verify-subsystem-pages.ts`, `verify-subsystem-pages.spec.ts`, `verify-repository-references.ts`, `verify-repository-references.spec.ts`, `verify-public-repository-links.ts`, `verify-public-repository-links.spec.ts`, `verify-doc-site-fragments.ts`, `verify-doc-site-fragments.spec.ts`, `verify-upgrade-guides.ts`, `verify-upgrade-guides.spec.ts`, `doc-budgets.manifest.json`, `doc-standard.spec.ts`, `markdown.ts`, `jsdoc.ts`, `project-doc-site.ts`, `project-doc-site.spec.ts`, `repo-files.ts`, `repo-files.spec.ts`, `type-equiv.manifest.json`, `cordis-core-api.spec.ts`, `cordis-walk.ts`, `slot-walk.ts` (plus `verify-md-links.ts`, `verify-type-equiv.ts`, `verify-export-jsdoc.ts`, `doc-typecheck.ts`, `cordis-core-api.ts` oben).
- **i18n: Paarung, Briefings, Prompt (16):** `translation-pairing.spec.ts`, `translation-pairing-git.ts`, `translation-pairing-record.ts`, `translation-pairing.manifest.json`, `verify-translation-pairing.ts`, `translation-prompt.ts`, `translation-prompt.spec.ts`, `translation-prompt.expected.spec.ts`, `verify-translation-prompt.ts`, `translation-brief.ts`, `translation-brief.spec.ts`, `translation-links.ts`, `translation-links.spec.ts`, `paired-markdown-derivatives.ts`, `paired-markdown-derivatives.spec.ts`, `locale-dictionary-parity.spec.ts`.
- **Agent Notes & Skills (8):** `verify-agent-note-format.ts`, `verify-agent-note-classification.ts`, `verify-archived-agent-notes.ts`, `archived-agent-notes.ts`, `archived-agent-notes.spec.ts`, `verify-skill-invocation-metadata.ts`, `verify-skill-invocation-metadata.spec.ts` (plus `agent-note-tree.ts` oben).
- **Workspace-, Vendor- & Paketmetadaten-Gates (25):** `check-workspace-constraints.spec.ts`, `check-vendor-manifest.sh`, `check-expected-filenames.sh`, `rescope-vendor.ts`, `rescope-vendor.spec.ts`, `verify-package-paths.ts`, `verify-package-paths.spec.ts`, `verify-package-meta.ts`, `verify-package-meta.spec.ts`, `verify-package-dependencies.ts`, `verify-package-dependencies.spec.ts`, `publint-all.ts`, `publint-all.spec.ts`, `verify-dsh-package-licenses.ts`, `verify-dsh-package-licenses.spec.ts`, `verify-package-readme-summaries.ts`, `verify-package-readme-summaries.spec.ts`, `verify-package-readme-limitations.ts`, `verify-package-readme-model-experience.ts`, `verify-npm-install-layout.ts`, `verify-npm-install-layout.spec.ts`, `verify-config-source-ownership.ts`, `verify-config-source-ownership.spec.ts` (plus `check-workspace-constraints.ts` oben).
- **Cordis-, Loader- & Runtime-Closure-Gates (27):** `cordis-config-files.ts`, `cordis-config-files.spec.ts`, `cordis-yaml.ts`, `verify-cordis-config.ts`, `verify-cordis-config.spec.ts`, `verify-no-bare-dispatcher.ts`, `verify-no-bare-dispatcher.spec.ts`, `verify-plugin-record-callers.ts`, `verify-plugin-record-callers.spec.ts`, `plugin-record-catalog.ts`, `plugin-record-catalog.spec.ts`, `loader-config-diff.spec.ts`, `loader-volatile-update.spec.ts`, `volatile-config.fixture.ts`, `volatile-config.spec.ts`, `verify-runtime-closure.ts`, `verify-runtime-closure.spec.ts`, `verify-optional-dependency-imports.ts`, `verify-optional-dependency-imports.spec.ts`, `verify-node-next-types.ts`, `verify-application-entrypoints.ts`, `verify-application-entrypoints.spec.ts`, `verify-default-product-isolation.ts`, `verify-default-product-isolation.spec.ts`, `verify-product-use.ts`, `verify-product-use.spec.ts`.
- **Client- & UI-Gates (12):** `client-build-environment.ts`, `client-build-environment.client.spec.ts`, `verify-client-packages.ts`, `verify-client-packages.spec.ts`, `verify-client-ui-i18n.ts`, `verify-client-ui-i18n.spec.ts`, `verify-client-route-resolution.ts`, `verify-client-route-resolution.spec.ts`, `verify-client-domain-graph.ts`, `verify-client-domain-graph.spec.ts`, `verify-v3-event-vocabulary.ts`, `verify-v3-event-vocabulary.spec.ts`, `request-input-types.spec.ts`.
- **Code-Standards & Lint (9):** `run-oxlint.ts`, `run-oxlint.spec.ts`, `oxlint-contract.spec.ts`, `lint-rule-fingerprint.spec.ts`, `verify-no-unknown-casts.ts`, `verify-no-unknown-casts.spec.ts`, `no-unknown-casts.baseline.json`.
- **Tests, Coverage & Benchmarks (31):** `run-gates.spec.ts`, `run-coverage-partitions.ts`, `run-memory-pressure-bench.ts`, `run-memory-pressure-bench.spec.ts`, `run-ci-bench.ts`, `run-web-snapshots.ts`, `coverage-canonical-locations.ts`, `coverage-exempt.ts`, `coverage-exempt.spec.ts`, `coverage-file-times.ts`, `coverage-file-times.spec.ts`, `coverage-fork-diagnostics.ts`, `coverage-fork-diagnostics.spec.ts`, `coverage-partitions.ts`, `coverage-partitions.spec.ts`, `coverage-uncovered-locations.cjs`, `lane-test-budget.spec.ts`, `test-dom-environment.ts`, `test-proxy-environment.ts`, `test-proxy-environment.spec.ts`, `test-fixture-cleanup.ts`, `test-non-loopback-address.ts`, `test-non-loopback-address.spec.ts`, `vitest-environment.compat.spec.ts`, `attribute-chunk-bytes.mjs`, `benchmark-npm-resolution.ts`, `benchmark-npm-resolution.spec.ts`, `benchmark-next-package-dependency.ts`, `benchmark-next-package-dependency.spec.ts` (plus `run-gates.ts` oben).
- **Snapshots & Session-Fixtures (49):** `session-snapshot-corpus.corpus.ts`, `session-snapshot-corpus-policy.ts`, `session-snapshot-corpus-policy.spec.ts`, `session-fixture-layout.ts`, `session-fixture-layout.spec.ts`, `snapshot-http-fixtures.spec.ts`, `snapshot-shell-path.ts`, `snapshot-shell-path.spec.ts`, `snapshot-spill-locators.ts`, `snapshot-spill-locators.spec.ts`, `snapshot-workspace-parent.ts`, `snapshot-workspace-parent.spec.ts`, `migrate-packed-session-fixtures.ts`, `migrate-sessions-to-v4.ts`, `migrate-sessions-to-v4.spec.ts`, `migration-failure-summary.ts`, `migration-failure-summary.spec.ts`, `session-query-spill-command.spec.ts` sowie die 30 Dateien unter `snapshots/`: `snapshots/python-sdk-single-exe/advanced/{result.json, session.1.v2.jsonl, session.1.v3.jsonl, session.1.v4.jsonl, session.2.v2.jsonl, session.2.v3.jsonl, session.2.v4.jsonl, session.v2.jsonl, session.v3.jsonl, session.v4.jsonl}`, `snapshots/python-sdk-single-exe/advanced-ptc/{result.json, session.v4.jsonl}`, `snapshots/python-sdk-single-exe/authoring/model-visible.json`, `snapshots/python-sdk-single-exe/dynamic-tools/tool-history.json`, `snapshots/python-sdk-single-exe/minimal/model-visible.json`, `snapshots/python-sdk-single-exe/minimal/win-x64/model-visible.json`, `snapshots/python-sdk-single-exe/minimal-in-history/prompt-history.json`, `snapshots/python-sdk-single-exe/restart/{requests.json, result.json, session.1.v2.jsonl, session.1.v3.jsonl, session.1.v4.jsonl, session.2.v2.jsonl, session.2.v3.jsonl, session.2.v4.jsonl}`, `snapshots/python-sdk-single-exe/scheduler-recovery/{requests.json, result.json, session.v3.jsonl, session.v4.jsonl}`, `snapshots/translation-prompt-v4/request-response.expected.json`.
- **CI-, GitLab- & Workflow-Gates (11):** `ci-workflow.spec.ts`, `ci-compatible-selfhosted.spec.ts`, `ci-compatible-toolcache.mjs`, `preview-workflow.spec.ts`, `windows-package-workflow.spec.ts`, `python-snapshot-workflow-order.spec.ts`, `tests/ci-master-platforms.spec.ts`, `tests/ci-release-selfhosted.spec.ts`, `wine-windows-gates.sh`, `check-macos-deployment-target.py`, `build-python-release.py`.
- **Git-Hooks, Prozess- & Repo-Helfer (8):** `install-lefthook.mjs`, `install-lefthook.spec.ts`, `pnpm-invocation.ts`, `pnpm-invocation.spec.ts`, `fix-hunk-headers.sh`, `fixture-file.ts`, `types/client-build-environment/index.d.ts`.
- **Demo & Fixtures (19):** `demo-ptc.mjs`, `fixtures/coverage-fork-exit.cjs`, `fixtures/coverage-fork.config.ts`, `fixtures/coverage-fork.fixture.ts`, `fixtures/lane-test-budget.fixture.ts`, `fixtures/python-sdk-dynamic-tools.mjs`, `fixtures/python-sdk-in-history-prompt.mjs`, `fixtures/python-sdk-office.mjs`, `fixtures/python-snapshot-image-offload.mjs`, `fixtures/python-snapshot-tool.mjs`, `fixtures/python-snapshot-workflow-order.mjs`, `fixtures/translation-prompt/response.txt`, `fixtures/translation-prompt/snapshot-note.md`, `fixtures/translation-prompt/examples/agent-note.md`, `.../agent-note.zh.md`, `.../product.md`, `.../product.zh.md`, `.../rules.md`, `.../rules.zh.md`.

### 10.7 `vendor/`

Neun Quellkopien des Cordis-Frameworks, umbenannt in den `@deepseek-ai`-Scope. Begruendung (`vendor/README.md`): „They are copied into this monorepo instead of being depended on via npm, so that the harness fully owns its framework layer (auditable, patchable, pinned)." Referenzen nutzen `workspace:~`; Upstream-MIT-`LICENSE`-Dateien bleiben erhalten.

| Verzeichnis | npm-Paketname (`package.json`) | Version (`package.json`) | Was es bereitstellt (`README.md`) | Warum vendored |
|---|---|---|---|---|
| `vendor/cordis` | `@deepseek-ai/cordis` | `4.0.5-alpha.1` | „TypeScript plugin framework … explicit dependency injection, scoped services, lifecycle-managed cleanup, and optional configuration-driven loading" | Framework-Kern; die Harness muss ihn auditieren, patchen und pinnen; lokale Haertung in `cordis/src/fiber.ts` und `cordis/src/logger.ts` |
| `vendor/cosmokit` | `@deepseek-ai/cosmokit` | `1.8.6-alpha.1` | „A collection of common utilities" | Fundament des Cordis-Stacks; liefert die unveraenderlichen Referenzen und die `deepEqual`-Semantik des „volatile config"-Mechanismus |
| `vendor/group` | `@deepseek-ai/cordis-plugin-group` | `1.0.5-alpha.1` | „Loader group plugin for nesting Cordis entries" | Plugin-Schicht wird mit dem Framework zusammen gepinnt |
| `vendor/hmr` | `@deepseek-ai/cordis-plugin-hmr` | `1.0.20-alpha.1` | Hot Module Replacement fuer Loader-verwaltete Plugins | Framework-Schicht; lokal wurden `./locales/*.yml`-Imports und `.i18n({...})` entfernt, weil der YAML-Loader-Hook `@cordisjs/unyaml` nicht vendored ist |
| `vendor/include` | `@deepseek-ai/cordis-plugin-include` | `1.0.10-alpha.1` | „File-backed loader tree for Cordis"; liest YAML/JSON, macht daraus Loader-Eintraege und schreibt Updates zurueck | Framework-Schicht; lokal robuste Refresh-/Patch-Reapplikation, `applyEntryPatches`-Export, `!!js`-Dialekt als `entryListSchema` |
| `vendor/loader` | `@deepseek-ai/cordis-plugin-loader` | `1.0.6-alpha.1` | „Runtime plugin loader for Cordis": besitzt einen `EntryTree`, importiert Plugin-Module per Name | Framework-Schicht; lokal Runtime-Shape-Erkennung (`getOrCreateModuleJob` vs. `getModuleJobForImport`), Fiber-Identitaet, `moduleNamespace`-Erhalt |
| `vendor/logger-console` | `@deepseek-ai/cordis-plugin-logger-console` | `1.0.5-alpha.1` | „Console exporter for the built-in Cordis logger service" | Framework-Schicht; eigene `tsdown.config.ts` (dualer ESM+CJS-Output, getrennte node/browser-Entries) |
| `vendor/schemastery` | `@deepseek-ai/schemastery` | `3.18.5-alpha.1` | „Type Driven Schema Validator" | Validiert jede Cordis-`Config`; lokal um `.volatile()`, Optional-/Default-Inferenz und referenzbewusste Simplifizierung erweitert |
| `vendor/timer` | `@deepseek-ai/cordis-plugin-timer` | `1.1.7-alpha.1` | „Disposal-aware timer service for Cordis" | Framework-Schicht; Timer bleiben an den Cordis-Lifecycle gekoppelt |

`scripts/check-vendor-manifest.sh` erzwingt, dass Aenderungen unter `vendor/*/src` oder an einer vendorten `bin.js` im selben Commit `vendor/README.md` mitaendern (Hook in `lefthook.yml`). `scripts/rescope-vendor.ts` begruendet die Umbenennung: „Every harness package declares `cordis` as a peer dependency, so publication carries this framework layer too; publishing it under the upstream names would squat them on the registry"; `--reverse` macht es rueckgaengig, `--check` prueft. Das `overrides:`-Feld in `pnpm-workspace.yaml` zwingt `@deepseek-ai/cosmokit` und `@deepseek-ai/schemastery` per `link:vendor/...` auf die lokalen Verzeichnisse. **Achtung:** Die Versionen oben sind Harness-Release-Versionen; die Upstream-Versionen der Manifest-Tabelle in `vendor/README.md` lauten `cordis` 4.0.0-rc.7, `cosmokit` 1.8.1, `schemastery` 3.18.0, `loader` 1.0.0-rc.5, `include` 1.0.4, `group` 1.0.0, `timer` 1.1.2, `hmr` 1.0.15, `logger-console` 1.0.0 — die beiden Angaben sind bewusst nicht deckungsgleich.

### 10.8 `.github/` — CI-Workflows und Issue-Management

**Vollstaendige Dateiliste unter `.github/`:** `.github/AGENTS.md`, `.github/dependabot.yml`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/{bug.md, config.yml, feature.md, task.md}`, `.github/issue-management/{config.json, github.mjs, lifecycle.mjs, policy.mjs, policy.test.mjs, pull-request.mjs, README.md, README.zh.md, README.i18n.yaml, rules.mjs, selective-preflight.json}`, `.github/preview-sizing/{README.md, README.zh.md, README.i18n.yaml}`, `.github/review-ownership/{.gitignore, approval-policy.json, author-weight.mjs, author-weight.test.mjs, blame-ownership.mjs, blame-ownership.test.mjs, blame-production.py, check-approval.mjs, check-approval.test.mjs, README.md, requirements.txt, test_blame_production.py}`, dazu **22** Workflowdateien in `.github/workflows/`.

**Workflows (`.github/workflows/`), vollstaendig:**

| Workflowdatei | Trigger | Jobs / Inhalt |
|---|---|---|
| `ci.yml` | `pull_request` | `node-24`, `node-24-coverage`, `node-24-bench`, `node-24-consumers`, `node-compat`, `python-sdk`, `python-runtime`, `windows-build`, `windows-coverage`, `windows-native-tests`, `all-checks-passed` |
| `ci-master.yml` | `push` (master), `workflow_dispatch` | `ssh-helper`, `python-runtime`, `windows`, `serial-linux-selfhosted`, `serial-macos`, `serial-windows`, `larger-runner-benchmark`, `consolidated-runner-benchmark`; master-only Laeufe bleiben bewusst ausserhalb der PR-Panels (`.github/AGENTS.md`) |
| `e2e.yml` | `workflow_dispatch`, `push`, `pull_request`, `schedule` | Job `e2e`, echte DeepSeek-API; ohne Key selbstueberspringend |
| `sandbox.yml` | `push` | `sandbox-e2e`, `unit-darwin` u. a. |
| `expected-filenames.yml` | `pull_request` | Job `expected-filenames` (nutzt `scripts/check-expected-filenames.sh`) |
| `docs-pages.yml` | `workflow_dispatch` | `build`, `deploy`; Concurrency `github-pages`, `cancel-in-progress: false` |
| `build-preview-cloudflare.yml` | `pull_request` | Job `preview`; PR-Previews auf `ubuntu-24.04` (`.github/preview-sizing/README.md`), `pull-requests: write` |
| `issue-lifecycle.yml` | `issues`, `pull_request`, `pull_request_review` | Job `lifecycle`; fuehrt Code aus dem Default-Branch aus |
| `issue-policy.yml` | `pull_request`, `pull_request_review` | Job `policy`; Pflicht-Check |
| `weighted-approval.yml` | `pull_request_target` | Job `publish-status`; veroeffentlicht den `weighted approval`-Status, Rechte `pull-requests: write`, `statuses: write` |
| `weighted-approval-review-event.yml` | `pull_request_review` | Job `record-review-event` |
| `release.yml` | `pull_request`, `push`, `workflow_dispatch` | `dependencies`, `pack` |
| `release-publish.yml` | `workflow_dispatch` | `pack`, `publish` |
| `release-vendor.yml` | `pull_request`, `push`, `workflow_dispatch` | `pack` (Vendor) |
| `release-vendor-publish.yml` | `workflow_dispatch` | `pack`, `publish` (Vendor) |
| `build-exe-for-python-sdk.yml` | `workflow_call`, `workflow_dispatch` | `plan`, `sdk-wheel`, `build`; Concurrency `build-single-exe-*` |
| `python-release.yml` | `workflow_dispatch` | `build`, `python-compat`, `validate`, `publish-runtime`, `publish-sdk` |
| `build-exe-for-ssh-helper.yml` | `workflow_call`, `workflow_dispatch` | `plan`, `build` |
| `publish-ssh-helper.yml` | `workflow_dispatch` | `validate`, `build`, `verify`, `publish` |
| `node-addon-system.yml` | `pull_request`, `push`, `workflow_dispatch` | `matrix`, `native` |
| `node-addon-system-release.yml` | `workflow_dispatch` | `matrix`, `build-prebuilds`, `pack`, `publish` |
| `pi-ai-provider-e2e.yml` | `workflow_dispatch` | Job `e2e` (Azure OpenAI und Anthropic) |
| `windows-package.yml` | `workflow_dispatch` | Job `package`; selbstgehostetes Label `dsh-win-package-trial`, native `pwsh` (`.github/AGENTS.md`) |

**Issue-Management und Review-Ownership:**

| Baustein | Befund |
|---|---|
| Issue-Templates | `.github/ISSUE_TEMPLATE/bug.md` (`type: Bug`; Summary, Reproduction, Current behavior, Expected behavior, Environment), `feature.md` (`type: Feature`; Motivation, Behavior), `task.md` (`type: Task`; Summary, Deliverables); Body-Kommentare chinesisch |
| Template-Konfiguration | `.github/ISSUE_TEMPLATE/config.yml`: `blank_issues_enabled: false` |
| PR-Template | `.github/pull_request_template.md` mit `## Motivation`, `## Changes`, `## Testing` und `<details><summary>Proof</summary>` |
| Issue-Management-Modul | `.github/issue-management/`: `config.json` (Organisation/Repo `deepseek-harness`, `projectNumber: 1`, Titel `DSH Issue Management`, `lifecycleActor: dsh-issue-management`, Felder `Priority`/`Start Date`, Zeitzone `Asia/Shanghai`, Status `Inbox`…`No action`), Logik in `github.mjs`, `lifecycle.mjs`, `policy.mjs`, `pull-request.mjs`, `rules.mjs`, Test in `policy.test.mjs` |
| Issue-Management-Regel | `README.md`: „Contributors can link Issues as context without coupling pull-request validation to Project availability. Resolving references additionally enforce Project Priority." Pflicht-Job `Issue policy` und Lifecycle-Workflow nutzen Code aus dem Default-Branch |
| Review-Ownership | `.github/review-ownership/README.md`: der Workflow `weighted-approval` veroeffentlicht einen Approval-Score; Branch-Regeln duerfen nur den Commit-Status mit GitHub Actions als erwarteter Quelle verlangen; unter zwei Punkten, im Draft oder bei wirksamem `CHANGES_REQUESTED` bleibt der Status `pending`, bei Evaluierungsfehler `error` |
| Gewichtungsregeln | `.github/review-ownership/approval-policy.json`: `requiredPoints: 2`, `defaultPoints: 1`, `reviewerPoints` mit je 2 Punkten fuer `07akioni`, `imccyu`, `tianyicui`, `tianyicui-bot`, `turtle1999`, `turtle2099` |
| Review-Ownership-Code | `check-approval.mjs` (29 250 Bytes) mit `check-approval.test.mjs` (52 900 Bytes), `author-weight.mjs`/`.test.mjs`, `blame-ownership.mjs`/`.test.mjs`, `blame-production.py`/`test_blame_production.py` (braucht `Pygments==2.21.0` laut `requirements.txt`), `.gitignore` nur `__pycache__/` |
| Lokale Tests dieser Mechanik | `package.json`: `test:approval-policy` startet die drei `node --test`-Dateien unter `.github/review-ownership/`; `test:issue-management` startet `node .github/issue-management/policy.test.mjs` |
| Dependabot | `.github/dependabot.yml`: drei Oekosysteme (`npm` auf `/` mit `exclude-paths: ["vendor/**"]`, `uv` auf `/python/sdk`, `github-actions` auf `/`), Cron `0 4 * * *` in `Asia/Shanghai`, `cooldown.default-days: 30`, Labels `kind/dependency` und `area/infra` |
| CODEOWNERS | **nicht vorhanden**; die Suche findet nur Fremddateien in `node_modules/…/github/CODEOWNERS` |
| Preview-Sizing | `.github/preview-sizing/README.md`: Runner-Sizing vergleicht vollstaendige Job-Kosten, nicht Preis pro Minute oder Kernzahl |

### 10.9 Doku-/i18n-Maschinerie (`.i18n.yaml` + `.zh.md`)

**Konvention:** Jedes zweisprachige Dokument `foo.md` hat einen `foo.zh.md`-Zwilling und eine Nebenlade-Datei `foo.i18n.yaml`. Die Header-Kommentare dieser Nebenlade-Dateien buendeln drei Angaben: den Bezug auf den Vertrag in `docs/i18n/README.md`, die Feststellung, dass pro Heading-Sektion ein Hash des englischen und des chinesischen Blocks ausserhalb von Code-Bloecken und generierten Regionen gespeichert wird, sowie das Re-Record-Kommando `pnpm run verify-translation-pairing --write <datei>`. Vollstaendige Triplets im Repo: `README.*`, `CONTRIBUTING.*`, `SAFETY.*`, `BRAND_GUIDELINES.*`, `.github/issue-management/README.*`, `.github/preview-sizing/README.*`, `.agents/notes/README.*`. `README.zh.md` beginnt mit der H1 `# DeepSeek Harness`, gefolgt von der Sprachumschalter-Zeile `[English](README.md) | 中文`; `README.md` traegt die Spiegelzeile `English | [中文](README.zh.md)`. Ein Sprachumschalter ist in beiden Richtungen Pflicht, ausser fuer generierte englische Quellen — die Ausnahmeliste steht in `scripts/translation-pairing.ts` (`requiresSourceLanguageSwitcher`, u. a. `docs/cli-help.md`, `docs/config-catalog.md`, `docs/tool-catalog.md`, `docs/module-graph.md`).

| Skript | Verhalten |
|---|---|
| `scripts/translation-pairing.ts` | Reine Helfer: `generatedRegions()` liest `<!-- BEGIN GENERATED <slug> -->`/`<!-- END GENERATED <slug> -->` und wirft bei ungepaarten, verschachtelten oder fehlerhaften Markern; `translationStructureSignature()` bildet Heading-Tiefen, Code-Fences, Tabellen (`rows x cols`), Listen (`bullet:items=N`, `ordered:start=N:items=M`) und Link-Ziele (Sprachumschalter ausgenommen) ab; `translationStructureDiff()` meldet die erste Abweichung je Feld; `TRANSLATION_SCOPE_GLOB_EXCLUDES` schliesst `vendor`, `lib`, `node_modules`, `coverage`, `.sessions`, `.storages`, `.agents/notes/archived/**` u. a. aus |
| `scripts/verify-translation-pairing.ts` | Erzwingt vollstaendige Paare, gleiche Struktur und aufgezeichnete Sektions-Hashes; `--list` berichtet, `--write <pairs...>` bzw. `--write --all` zeichnet auf, `--cached <pairs...>` prueft exakte Index-Bytes fuer Hooks; ein blankes `--write` ist verboten; `scripts/translation-pairing.manifest.json` enthaelt nur `excluded` (9 Eintraege, u. a. `.agents/notes/AGENTS.md`, `docs/AGENTS.md`, `docs/i18n/terminology.md`) |
| `scripts/translation-prompt.ts` | Ausfuehrbarer Renderer und Antwortparser des Prompts `prompt-v4`: drei Platzhalter (`source_lang`, `target_lang`, `terminology`), Ganzdokument-Uebersetzung, dreiteilige Antwort `<translation>`, `<review>`, `<final>` |
| `scripts/verify-translation-prompt.ts` | Prueft diesen Prompt-Vertrag gegen die Fixtures unter `scripts/fixtures/translation-prompt/` und `scripts/snapshots/translation-prompt-v4/request-response.expected.json` |
| `scripts/verify-md-links.ts` | Prueft relative Markdown-Links, Bilder und Definitions inklusive Fragment-Aufloesung; schreibt nie, dedupliziert Symlink-Dubletten |
| `scripts/verify-md-wrap.ts` | Verbietet mehrzeilige Prosa-Absaetze („one physical line per paragraph"), nutzt den GFM-AST, maskiert VitePress-Frontmatter und Custom-Container |
| `scripts/doc-standard.spec.ts` | Schnelle Doku-Standard-Tests: Referenzbeispiel gueltig, `dsh-doc`-Skill ohne veraltete Website-Werte, Kind-System bildet jedes Label auf genau ein Skill-Template ab |
| `scripts/verify-doc-budgets.ts` | Erzwingt Wort-Obergrenzen aus `scripts/doc-budgets.manifest.json`; `--list` berichtet Verbrauch; Senken mit mindestens 5 % Headroom, Erhoehen nur mit Begruendung in `docs/AGENTS.md` |
| `scripts/gen-translation-brief.ts` | Gibt das Minimal-Update-Briefing fuer aus-dem-Takt-Paare aus (`[--apply] [pair paths...]`); `--apply` schreibt die Gegenseite nur bei reiner Code-Fence-Aenderung; Regeln in `scripts/translation-brief.ts` |
| `scripts/translation-links.ts` | Locale-bewusste Aufloesung und byte-erhaltende Umschreibung bilingualer Markdown-Links |
| `scripts/paired-markdown-derivatives.ts` | Trennt byte-identische chinesische Code-Bloecke (`derivatives`) von den primaer zu pruefenden englischen Bloecken (`primary`) |
| `scripts/locale-dictionary-parity.spec.ts` | Prueft Paritaet der UI-Locale-Woerterbuecher |
| `scripts/verify-client-ui-i18n.ts` | Erzwingt, dass Produkttexte ueber typisierte Woerterbuecher laufen („Client UI copy is locale-owned", `AGENTS.md`) |

### 10.10 `.agents/` — Note- und Skill-Layout

**Baum (Tiefe 2):** `.agents/notes/` mit `AGENTS.md`, `README.md`, `README.zh.md`, `README.i18n.yaml` und vier Lifecycle-Ordnern; `.agents/skills/` mit `.gitignore` und 15 Skill-Ordnern.

| Ordner | Inhalt |
|---|---|
| `.agents/notes/archived/` | `AGENTS.md`, `manifest.json`, Klassen `architecture`, `bug-fix`, `feature`, `process`, `simplification`, `testing` (2774 Dateien) |
| `.agents/notes/implemented/` | `AGENTS.md`, `CLAUDE.md`, dieselben 6 Klassen (753 Dateien) |
| `.agents/notes/proposed/` | 6 Klassen (123 Dateien) |
| `.agents/notes/rejected/` | `architecture`, `simplification` (24 Dateien) |
| `.agents/skills/` | `agent-experience`, `dsh-archive-agent-notes`, `dsh-ci-test-reliability` (+`references/`), `dsh-client-ui-ux`, `dsh-code-review`, `dsh-create-upgrade-guide`, `dsh-doc` (+`references/`, `templates/`), `dsh-error-handling`, `dsh-find-simplifications` (+`references/`), `dsh-merging-stacked-prs`, `dsh-pre-push-checks`, `dsh-prose-standard` (+`references/`), `dsh-speed-up-perf`, `dsh-translate-docs`, `dsh-trim-cot-leakage` (+`references/`), `record-browser-gif` (+`scripts/`) |

**Regeln** (`.agents/notes/README.md`): Pfadmuster `{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`; Lifecycle und Klasse sind geschlossene Mengen; ein zentrales `INDEX.md` ist verboten. Kopfblock: Zeile 1 `# Agent Note: <title>`, Leerzeile, dann `Status: proposed` | `Status: implemented` | `Status: rejected — <Grund>` passend zum Ordner. Body beginnt mit `## Problem`; `proposed/` nutzt `## Proposal`/`## Acceptance criteria`/`## Risks`, `implemented/` nutzt `## Decision`/`## Consequences` (Proposal-Ueberschriften dort verboten), `rejected/` friert den Vorschlag ein. `## Alternatives considered` ist Pflicht; fuer Dateien vor 2026-07-05 gilt der Grandfather-Kommentar `<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->`. `archived/` ist versiegelt: vollstaendige Triplets, `Archived: YYYY-MM-DD` direkt unter der Statuszeile, danach unveraenderlich.

**Skill-Layout:** ein Ordner pro Skill mit `SKILL.md` (Frontmatter `name`, `description`, optional `disable-model-invocation`/`user-invocable` — Beleg `.agents/skills/dsh-translate-docs/SKILL.md`) plus optional `references/`, `templates/`, `scripts/`.

| Skript | Verhalten |
|---|---|
| `scripts/verify-agent-note-format.ts` | Erzwingt Kopfblock, lifecyclespezifische Sektionen, Alternatives-Pflicht und Regeln fuer zurueckgezogene Marker; `.zh.md`-Dateien werden uebersprungen, weil das Pairing-Gate sie prueft |
| `scripts/verify-agent-note-classification.ts` | Erzwingt Lifecycle-/Klassenpfade und datierte Dateinamen ueber `walkAgentNoteTree()`; ein nicht-leeres `errors`-Array ist fatal |
| `scripts/agent-note-tree.ts` | Geteilte, pure Struktur-Quelle: `agentNoteRoot`, `AGENT_NOTE_LIFECYCLES`, `AGENT_NOTE_CLASSES`, `AGENT_NOTE_ARCHIVE = 'archived'`, `ROOT_ALLOWLIST`; `walkAgentNoteTree()` liefert `{ notes, errors }` |
| `scripts/archived-agent-notes.ts` | Reine Archiv-Helfer (204 Zeilen, Spec `archived-agent-notes.spec.ts`): `ArchiveManifest` mit `version: 1` und `files: Record<string, string>`, `archiveContentHash()` als `sha256:<hex>`, `gitBlobHash()` als Git-SHA-1-Blob-Id fuer Bilingual-Sidecars |
| `scripts/verify-archived-agent-notes.ts` | Erzwingt geschlossenen Klassenbaum, vollstaendige Triplets, Archiv-Metadaten, Sidecar-Hashes und das append-only Manifest; laeuft im `pre-commit`-Hook bei Aenderungen unter `.agents/notes/archived/**` (`lefthook.yml`) |

### 10.11 Weitere Infrastrukturdateien

| Datei | Zweck |
|---|---|
| `Makefile` | Kurznamen `build`, `clean`, `web`, `desktop`, `dev-web`, `dev-desktop`; „package.json scripts they call stay the source of truth"; `ARGS='--no-open --port 3081'` wird durchgereicht |
| `lefthook.yml` | `pre-commit`: translation pairing (`*.i18n.yaml`, ausser `.agents/notes/archived/**`), archived agent notes, `run-oxlint.ts --config .oxlintrc.staged.json --fix` (`stage_fixed: true`), `gen-third-party-notices.ts` + `git add`, `git diff --cached --check`, `scripts/check-vendor-manifest.sh`; `pre-merge-commit` wiederholt die ersten zwei; `pre-push` laeuft `pnpm run typecheck` |
| `.gitlab-ci.yml` | Nur Python-Releases: Workflow-Regel nur bei Tag `python-v<semver>`; Stages `build`/`publish`; Jobs `sdk-wheel`, `runtime-linux-x64`, `runtime-linux-arm64`, `runtime-macos-arm64`, `runtime-macos-x64`, `runtime-windows-x64`, `publish-python`; Wheels via `scripts/build-python-release.py` und `scripts/build-exe-for-python-sdk.ts`; glibc-≤-2.28-Pruefung, macOS-Arch-Pruefung, Upload mit `twine` |
| `.jscpd.json` | `minTokens: 60`, `minLines: 6`, `mode: "mild"`, `format: ["typescript","tsx"]`, `pattern: "**/*.{ts,tsx}"`, `ignore: ["**/tests/**","**/tsdown.config.ts"]`, `ignorePattern` fuer `/* jscpd:ignore-start */ … /* jscpd:ignore-end */`, `exitCode: 1` |
| `.oxlintrc.json` | 358 Zeilen; `correctness: off`, `typeAware: true`, `env.builtin: true`; `ignorePatterns` u. a. `vendor/**`, `native/**`, `**/*.config.ts`; Overrides mit strikten `typescript/*`-Regeln (`no-floating-promises`, `no-unsafe-*`, `switch-exhaustiveness-check`, `only-throw-error`), `crypto.randomUUID`-Verbot zugunsten `@deepseek-ai/dsh-util-crypto`, `sonarjs/*`, `@stylistic/*` (`semi: never`, `quotes: single`, `max-len: 140`) |
| `.editorconfig` | `root = true`; `[*]`: `end_of_line = lf`, `insert_final_newline = true` |
| `.oxlintrc.staged.json` | zweites, projektfreies Profil fuer den Hook-Lauf (`lefthook.yml`) |
| `AGENTS.md` (Root, 181 Zeilen) | Repo-Layout (`vendor/`, `packages/<group>/<pkg>/`, `python/`, `native/`, `benchmarks/`, `.agents/`, `docs/`, `scripts/`, `website/`), Kommandoliste (`pnpm install`, `pnpm run test`, `pnpm run test:coverage`, `pnpm run test:e2e`, `pnpm run test:snapshot`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, `pnpm run hygiene`, `pnpm run doc-sync`, `pnpm dsh --profile headless "task"`, `make web\|dev-web\|desktop\|dev-desktop` mit `ARGS=`), Secret-Regeln (`.env`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`; `cordis.yml` erlaubt `!!js` nur unter Plugin-`config` und Entry-`disabled`) und Konventionen (ESM ueberall, `.ts` in lokalen relativen Imports, Registrierungen ueber `ctx.effect()`/`ctx.on()`, `assertNever` fuer geschlossene Unions, Waterfall-Listener muessen `next()` rufen, „Model-visible ⟺ logged", verbotene `as unknown`-Casts, `Branded<B>` fuer opake IDs, Source-Plane vs. Artifact-Plane nie gemischt) |

---

## 11. Das `units/`-Format

### 11.1 Was `units/README.md` vorschreibt

`units/README.md` (50 Zeilen, deutsch) ist die einzige Datei unter `units/`.

| Aspekt | Aussage (`units/README.md`) |
|---|---|
| Definition | „Ein Unit ist ein Ordner mit einer `unit.json`." |
| Arten | `plugin` (Cordis-Plugin, wird in einen Bundle eingehaengt; Beispiel Language-Pack `de`), `service` (startet einen externen Dienst **mit** der Harness; Firecrawl, SearXNG, Postgres), `patch` (Aenderung an einer Core-Datei, die keinen Steckplatz hat), `skill` (Agent-Skill ohne Host-Code; Beispiel `self-improve`) |
| Kern-Regel | „Ein Unit darf **Interna des Cores nicht importieren** — nur die oeffentlichen Steckplaetze (`ctx.*`, Service-Interfaces, deklarierte Interface-Maps)." |
| Eskalationsreihenfolge | 1. **Steckplatz finden** (Beispiel: `LocaleRuntime.addLanguage` existiert ausdruecklich „when a language-pack plugin adds a selectable language", wird aber von niemandem benutzt), 2. **Merge-Extension nutzen** (Interface-Maps wie `LocaleNamespaceMap`), 3. **Als `patch` deklarieren** |
| `patch`-Zusatz | „Ein `patch`-Unit traegt in seiner `unit.json` die Upstream-Datei und einen Kontext-Hash, damit ein Core-Sprung den Konflikt meldet statt ihn still zu verlieren." |
| Layout | `units/<name>/` mit `unit.json` (Pflicht: Art, Version, Abhaengigkeiten, An/Aus), `src/` (bei `plugin`/`service`/`patch`), `tests/` („Nachweis, dass das Unit tut was es sagt"), `README.md` („Was es tut, warum es existiert, wie man es absteckt") |
| Zustand | Tabellenzeile: „— \| — \| noch keins angelegt; Sprache `de` ist geparkt (siehe `~/.dsh/notes/pmh-unit-de-locale-GEPARKT.md`)" |

**Zum `unit.json`-Schema — ausdrueckliche Feststellung.** Die README benennt nur die **Pflichtfeldgruppen** („Art, Version, Abhaengigkeiten, An/Aus") und fuer `patch` zusaetzlich Upstream-Datei + Kontext-Hash. Ein vollstaendiges Schema mit Feldtypen ist im Repository **nicht** dokumentiert: eine Suche nach `unit.json|required_core` ueber das gesamte Repository liefert nur `units/README.md` (Zeilen 8, 33, 40) sowie zwei unbeteiligte Fixtures (`packages/storage/storage-json/tests/json-backend.spec.ts`, `packages/session/session-projection-cache/tests/fixtures.spec.ts` mit `v3-single-unit.json`). Es gibt **keinen** Loader, **kein** Schema und **keinen** Validator fuer `unit.json`. Die Unterscheidung **`optional` vs. `required_core`** steht **nicht** in `units/README.md`, sondern ausschliesslich in `.pmh/base.json` (`rules[2]`: „Ein Unit deklariert, ob es absteckbar ist (optional) oder den Core voraussetzt (required_core)."). Eine Ladevorschrift ist nirgends dokumentiert; da `units/` kein Workspace-Member ist und keinen Code enthaelt, existiert derzeit auch kein Lademechanismus.

### 11.2 Workspace-Situation und dokumentierte Konsequenz

`pnpm-workspace.yaml` (Zeilen 1–15) listet `units/*` **nicht**; die `packages:`-Liste lautet vollstaendig `vendor/*`, `packages/*/*`, `native/system`, `native/system/packages/*`, `apps/*`, `benchmarks`, `website`, `python/sdk-runtime`. Der Glob `units/*` kommt in `pnpm-workspace.yaml` nicht vor.

**Dokumentierte Konsequenz** (`.pmh/base.json`, `operational_warnings[2]`): „units/ ist NICHT in pnpm-workspace.yaml eingetragen (dort stehen packages/*/* und apps/*). Sobald das erste Unit installierbare Abhaengigkeiten hat, muss 'units/*' dort ergaenzt werden."

### 11.3 Tatsaechlicher Inhalt von `units/`

`units/README.md` — die **einzige** Datei; es existiert kein Unit-Ordner. `units/` enthaelt also derzeit keinen Code, keine `unit.json` und keine Tests.

### 11.4 `.pmh/base.json` — die Fork-Konfiguration

`.pmh/` enthaelt genau eine Datei: `base.json` (3242 Bytes, 63 Zeilen). Jeder Schluessel mit Wert:

| Schluessel | Wert (woertlich aus `.pmh/base.json`) |
|---|---|
| `harness` | `pmh` |
| `name` | `Prometheus Harness` |
| `prefix` | `pmh` |
| `description` | `Eigene Harness auf Basis des DeepSeek Harness als Core. Alles ausserhalb des Cores ist ein Unit (Plugin oder Skill).` |
| `repository` | `https://github.com/LangLi7/prometheus-harness` |
| `visibility` | `private` |
| `core.upstream` | `https://github.com/deepseek-ai/deepseek-harness.git` |
| `core.commit` | `d743267388641bc76f17c45ce8b4c231aed1d32c` |
| `core.tag` | `dsh-v0.2.1-alpha.2` |
| `core.version` | `0.2.1-alpha.2` |
| `core.date` | `2026-10-09T17:31:32+08:00` |
| `core.branch` | `pmh` |
| `branch_model.pmh` | `Unser Stand: Core-Pointer plus Units. Upstream-Dateien werden hier NICHT editiert.` |
| `branch_model.notes` | `Freie Flaeche fuer Experimente; wird nicht exportiert.` |
| `remotes.origin` | `https://github.com/LangLi7/prometheus-harness.git` |
| `remotes.upstream` | `https://github.com/deepseek-ai/deepseek-harness.git` |
| `checkout.path` | `C:\\Users\\Chang\\harness\\prometheus-harness` |
| `checkout.upstream_branch` | `master` |
| `checkout.our_branch` | `pmh` |
| `checkout.home` | `C:\\Users\\Chang\\.pmh` |
| `checkout.home_env` | `DSH_HOME` |
| `checkout.entry` | `node --import tsx/esm apps/cli/src/bin.ts web --port <port>` |
| `checkout.note` | Home wird NICHT umbenannt: der Core liest `$DSH_HOME` und faellt sonst auf `~/.dsh` zurueck (`packages/util/home-paths`, 208 Fundstellen); `~/.dsh` und `~/.pmh` sind damit getrennte Installationen ohne Core-Aenderung |
| `checkout.workbench` | `C:\\Users\\Chang\\deepseek-harness` |
| `checkout.workbench_note` | Die bestehende Original-Installation bleibt unberuehrt: sie ist Werkzeug (der laufende Agent) UND Core-Referenz |
| `layout.parent` | `C:\\Users\\Chang\\harness` |
| `layout.core` | `C:\\Users\\Chang\\deepseek-harness  (Original-Installation, bleibt wo sie ist)` |
| `layout.ours` | `C:\\Users\\Chang\\harness\\prometheus-harness  (unsere Harness, hier wird gearbeitet)` |
| `layout.intent` | Zwei Harness-Ordner nebeneinander: der geladene Core und unser Aufbau, getrennt, damit unsere Arbeit den Core nicht vermischt |
| `operational_warnings[0]` | pnpm legt `node_modules`-Eintraege als Junctions mit absolutem Zielpfad an; Umbenennen/Verschieben bricht alle ~1400 Junctions (`ERR_MODULE_NOT_FOUND`, z. B. tsx); Fix: `pnpm install --force` im neuen Pfad |
| `operational_warnings[1]` | Nach jedem Core-Sprung `pnpm install` im neuen Stand ausfuehren, bevor gebootet oder getestet wird |
| `operational_warnings[2]` | `units/` ist nicht in `pnpm-workspace.yaml`; sobald das erste Unit installierbare Abhaengigkeiten hat, muss `units/*` ergaenzt werden |
| `rules` | „Der Core ist unantastbar: keine Aenderung in Upstream-Dateien. Wer eine Aenderung braucht, baut sie als Unit." / „Jede Aenderung ausserhalb des Cores ist ein Unit unter units/ mit eigener unit.json." / „Ein Unit deklariert, ob es absteckbar ist (optional) oder den Core voraussetzt (required_core)." / „Dienste werden vom Unit gestartet, nicht vom Core eingebaut." / „Upstream-Sprung darf keinen Unit zwingen, neu geschrieben zu werden: kein Unit importiert Interna des Cores." |
| `core_changes` | `[]` |
| `units` | `[]` |

---

## 12. Hard Facts

### 12.1 Versionen

| Gegenstand | Version | Quelle |
|---|---|---|
| Root-Paket `@deepseek-ai/dsh-root` | `0.2.1-alpha.2` | `package.json` |
| Alle neun `vendor/`-Pakete | `cordis 4.0.5-alpha.1`, `cosmokit 1.8.6-alpha.1`, `group 1.0.5-alpha.1`, `hmr 1.0.20-alpha.1`, `include 1.0.10-alpha.1`, `loader 1.0.6-alpha.1`, `logger-console 1.0.5-alpha.1`, `schemastery 3.18.5-alpha.1`, `timer 1.1.7-alpha.1` | `vendor/*/package.json` |
| Upstream-Versionen derselben Pakete (abweichend, bewusst) | `cordis 4.0.0-rc.7`, `cosmokit 1.8.1`, `schemastery 3.18.0`, `loader 1.0.0-rc.5`, `include 1.0.4`, `group 1.0.0`, `timer 1.1.2`, `hmr 1.0.15`, `logger-console 1.0.0` | `vendor/README.md` |
| Alle Boot-, Settings-, Credentials-, Util-, Identity- und Bundle-Pakete | `0.2.1-alpha.2` | jeweilige `package.json` |
| `native/system` (Wurzel, `entry`, alle vier Plattformpakete) | `0.1.2` (eine gemeinsame Version) | `native/system/package.json`, `native/system/packages/*/package.json` |
| Python-SDK `deepseek-harness-sdk` | `0.0.0.dev0` (Platzhalter; der Release-Job ersetzt sie) | `python/sdk/pyproject.toml` |
| Runtime-Wheel `deepseek-harness-runtime-bin` (Pin) | `==0.0.0.dev0` in der Quelle; im Release-Staging `==1.2.3` | `python/sdk/pyproject.toml`, `python/sdk/tests/test_release_version.py` |
| Core-Pointer des Forks | `dsh-v0.2.1-alpha.2`, Commit `d743267388641bc76f17c45ce8b4c231aed1d32c` | `.pmh/base.json` |

### 12.2 Workspace-Globs und Peer-Regel

**`pnpm-workspace.yaml` `packages:` (9 Globs, woertlich):** `vendor/*`, `packages/*/*`, `native/system`, `native/system/packages/*`, `apps/*`, `benchmarks`, `website`, `python/sdk-runtime` (plus die Kommentarzeilen zu `native/system`, `apps/*`, `benchmarks` und `python/sdk-runtime`).

**`peerDependencyRules` (woertlich, vollstaendig):**

```yaml
peerDependencyRules:
  allowedVersions:
    typescript: '>=5 <7'
```

**`onlyBuiltDependencies` / `patchedDependencies`:** `onlyBuiltDependencies` **existiert nicht**; das Aequivalent heisst `allowBuilds` (10 Eintraege, siehe 10.1). `patchedDependencies` hat **7** Eintraege (siehe 10.1 und 10.5), deckungsgleich mit `patches/`.

**`overrides`:** `'extract-zip>yauzl': '3.4.0'`, `'@deepseek-ai/cosmokit': 'link:vendor/cosmokit'`, `'@deepseek-ai/schemastery': 'link:vendor/schemastery'`.

### 12.3 Arbeitsverzeichnis- und Entry-Point-Konventionen

| Konvention | Quelle |
|---|---|
| „**Application launch.** Only `dsh` profiles launch supported Node apps; package bins, demos, and public SDK argv escapes are forbidden" | `AGENTS.md` |
| Jeder Prozess unter Test startet ueber die `dsh` CLI mit geliefertem Profil | `snapshots/AGENTS.md` |
| Source-Launch laeuft ueber `node --import tsx/esm apps/cli/src/bin.ts`, damit die Kette ESM bleibt | `AGENTS.md` |
| Profil-Entry des Forks | `node --import tsx/esm apps/cli/src/bin.ts web --port <port>` (`.pmh/base.json`) |
| `apps/cli` besitzt das `dsh`-`bin` | `pnpm-workspace.yaml` (Kommentar) |
| Harness-Home: `resolveDshHome(configured?, env?)` → configured → nicht-leeres `$DSH_HOME` → `~/.dsh` | `packages/util/home-paths/src/index.ts:135-137` |
| Agents-Home: `resolveAgentsHome(...)` → configured → nicht-leeres `$DSH_AGENTS_HOME` → `~/.agents` | ebd.:151-153 |
| Profilordner: `<home>/profiles/<name>` mit `package.json`, `cordis.patch.yml`, `pnpm-workspace.yaml` | `packages/boot/app-boot/src/profile.ts:37,169-176,261-280` |
| Session-Logs: `dshHomePath('sessions')` → `$DSH_HOME/sessions/<projectKey>/<sessionId>/session[.vN].jsonl`; ohne `cwd` `_no-cwd` | `packages/bundle/base/cordis.patch.yml:136`, `packages/session/session-persistence-jsonl/src/format.ts:254-281` |
| KV-Storage: `dshHomePath('storages')` | `packages/bundle/base/cordis.patch.yml:180` |
| Anzeigeform des Home ist **nie** ein absoluter Pfad: `~/.dsh` bzw. `$DSH_HOME` | `packages/util/home-paths/src/index.ts:176-181` |
| `CLAUDE.md` ist ein 9-Byte-Zeiger auf `AGENTS.md`; „`CLAUDE.md` symlinks `AGENTS.md` at root and `packages/`; edit the real file." | `CLAUDE.md`, `AGENTS.md` |

### 12.4 Plattform-Suffixe des C-Addons

Dokumentiert sind genau **vier** Plattformpaket-Suffixe (`native/system/docs/support-matrix.md`): **`linux-x64`** (Builder `ubuntu-24.04`), **`linux-arm64`** (Builder `ubuntu-24.04-arm`), **`darwin-x64`** (Builder `macos-15-intel`), **`darwin-arm64`** (Builder `macos-latest`). Die Linux-Pakete tragen je drei Payloads (`bin/landlock-run` static-musl, `bin/glibc/system.node`, `bin/musl/system.node`), die macOS-Pakete je einen (`bin/system.node`). Windows hat **kein** Plattformpaket. Rust-artige Ziel-Triples existieren im Repository **nicht**.

### 12.5 Gotchas

1. **`onlyBuiltDependencies` heisst hier `allowBuilds`.** pnpm 10+ blockiert jedes Paket mit Installscript, bis es hier explizit steht; `strictDepBuilds` ist standardmaessig `true`, ein nicht gelistetes Script ist ein harter Installfehler (`pnpm-workspace.yaml:26-55`).
2. **Kein `catalog`-Block** in `pnpm-workspace.yaml`.
3. **`units/*` ist kein Workspace-Member** und `units/` enthaelt nur die README (`pnpm-workspace.yaml`, `.pmh/base.json` `operational_warnings[2]`).
4. **Ein formaler `unit.json`-Schema-Katalog existiert nicht**, und die Unterscheidung `optional`/`required_core` steht nur in `.pmh/base.json`, nicht in `units/README.md`.
5. **`CODEOWNERS` existiert nicht** (nur Fremddateien in `node_modules`); die Review-Steuerung laeuft ueber `weighted-approval`.
6. **Vendor-Versionen weichen bewusst von den Upstream-Versionen in `vendor/README.md` ab.**
7. **`atomic-write` macht kein `fsync`.** „Atomic, not durable" ist die dokumentierte Grenze; ein `TODO(settings-atomic-durability)` steht im Quelltext (`packages/util/atomic-write/src/index.ts:84-85`, `README.md:124`).
8. **`atomic-write` behandelt nur `EACCES`/`EBUSY`/`EPERM` auf `win32` als transient** (8 Versuche, 20→200 ms); es gibt **keinen** `rm`-then-rename-Fallback und **keine** Long-Path-Behandlung.
9. **`withFileLock` verlangt ein existierendes Elternverzeichnis** und unterstuetzt **keine** mehreren Hosts oder PID-Namespaces (`packages/util/atomic-write/src/index.ts`).
10. **Ein blanker `$DSH_HOME` gilt als unset**, aber ein explizit uebergebener Leerstring `configured = ''` gewinnt und loest `resolve('')` = cwd auf; ein relativer Env-Wert wird gegen das cwd aufgeloest (`packages/util/home-paths/src/index.ts:101-110`, Tests `:90-94`).
11. **`home-paths` liest kein XDG.** `XDG_CONFIG_HOME`/`XDG_CACHE_HOME`/`XDG_DATA_HOME`/`XDG_STATE_HOME` werden dort nicht konsultiert; `XDG_` ist nur ein verbotenes Bootstrap-Praefix.
12. **`DSH_`-Praefix ist ein reservierter Namespace, kein einzelner Schalter.** `BOOTSTRAP_PREFIXES = ['DSH_', 'XDG_', 'DYLD_', 'BASH_FUNC_']` sperrt jede `.env`-Zuweisung mit diesem Praefix (`packages/boot/app-boot/src/index.ts:158`).
13. **Proxy-Namen sind in der Home-`.env` erlaubt, in der Projekt-`.env` nicht** (`HOME_LAYER_PROXY_NAMES`, `packages/boot/app-boot/src/index.ts:167`) — „a proxy chooses the route every request takes".
14. **`DSH_TELEMETRY_DISABLED` wirkt bei jedem nicht-leeren Wert**, auch `'0'` und `'false'` (`packages/boot/app-boot/src/profile-context.ts:48-55`).
15. **`launch-environment` faltet Namen nur auf `win32`** auf Grossbuchstaben (`lookupKey`, `packages/util/launch-environment/src/index.ts:60-63`).
16. **Der Python-Client benutzt `~/.dsh` nie implizit:** fehlen `dsh_home` und ein nicht-leeres `DSH_HOME`, wirft `HarnessConfig` `ValueError` (`python/sdk/src/deepseek_harness/client.py`).
17. **Der Python-Client faehrt keine Retries und setzt keine Auth-Header**; Credentials laufen ausschliesslich ueber die Subprozess-Umgebung.
18. **`node-pty` wird gepatcht und liest dabei `DSH_NODE_PTY_SPAWN_HELPER`** — eine Umgebungsvariable, die nur in `patches/node-pty@1.2.0-beta.15.patch` existiert, nicht im Repo-Quellcode.
19. **`landlock-run` gibt `125` auch als Kindstatus durch**; ein reiner Exitcode `125` ist daher nicht eindeutig — zusaetzlich muss eine `landlock-run: `-Zeile auf stderr auftreten (`native/system/docs/cli-contract.md`).
20. **flock ist advisory und hat kein Stale-Lock-Timeout**; Freigabe erfolgt ausschliesslich durch Schliessen des letzten Deskriptors der *open file description* (`native/system/docs/flock-contract.md`).
21. **Ersetzen oder Entfernen des Lock-Pfads uebertraegt den Lock nicht** auf den Ersatz-Inode; das JSONL-Backend prueft daher die Inode-Identitaet separat (`native/system/docs/flock-contract.md`).
22. **`explorer.exe` beendet sich mit Exit 1 auch bei erfolgreicher Uebergabe** — deshalb akzeptiert `runExplorer` genau `error.code === 1` als Erfolg; ein nicht-interaktiver Windows-Dienst beendet `explorer.exe` ebenfalls mit 1, ohne etwas zu oeffnen (`packages/util/native-command/src/path-opener.ts:136-145`, `README.md:112`).
23. **`native-command` benutzt kein `rundll32`, kein `cmd /c`, kein `start` und kein `-EncodedCommand`**; die Windows-Dateizuordnung laeuft ueber ein temporaeres PowerShell-5.1-Skript mit eingebettetem C#.
24. **`native-command` escaped nur ein einziges Argument:** `explorerTarget` wandelt `,` → `%2C` und `=` → `%3D`, weil Explorer seine eigene Kommandozeile parst.
25. **Objekt-Rename in `atomic-write` ersetzt das Symlink-Ziel selbst**, nicht dessen Referenten (Test `packages/util/atomic-write/tests/atomic-write.spec.ts:145`).
26. **`dsh-lazy-require` cacht fehlgeschlagene Loads nicht**, `@deepseek-ai/node-addon-system` implementiert sein Lazy-Loading aber eigenstaendig.
27. **Der statische WebWorker-Packer entdeckt Abhaengigkeiten nicht**, die nur in `createLazyRequire()`-Aufrufen genannt werden (`packages/util/lazy-require/README.md:80-81`).
28. **`packages/util/package-manifest` hat keine Runtime-Exporte** — nur Typen.
29. **`@deepseek-ai/dsh-settings` hat keine eigenen Konfigurationsfelder** und exponiert nur **volatile** Felder.
30. **Es gibt keine `settings.yaml` mehr**; die persistierte Form ist der Profil-Patch `cordis.patch.yml` mit Modus `0600`. Die Altdatei `$DSH_HOME/settings.yaml` wird einmalig importiert und nach `<pfad>.imported` umbenannt.
31. **Jeder Credential-Wert liegt im Klartext** in `$DSH_HOME/.credentials.yaml` (Modus `0600`, Verzeichnis `0700`); auf `win32` entfaellt die Owner-only-Pruefung.
32. **Der Account-Flow ist PKCE, kein Device-Code-Flow**, und **ohne Polling und ohne Refresh** (`packages/credentials/deepseek-account-platform/README.md`).
33. **`DSH_HOME` steht auf der Bootstrap-Sperrliste**, deshalb kann keine `.env` das Home umlenken (`packages/boot/app-boot/src/index.ts:150-167`).
34. **pnpm legt `node_modules`-Eintraege als Junctions mit absolutem Zielpfad an**; ein Umbenennen des Checkouts bricht alle ~1400 Junctions mit `ERR_MODULE_NOT_FOUND` (`ERR_MODULE_NOT_FOUND`, z. B. tsx). Fix: `pnpm install --force` (`.pmh/base.json` `operational_warnings[0]`).
35. **Die 7 Patches greifen in gebaute `dist/`-Dateien ein** — ein Dependency-Update auf eine andere Version macht sie still wirkungslos, wenn `patchedDependencies` nicht mitgezogen wird.
36. **`snapshots/` ist ausschliesslich fuer sessiongetriebene Erwartungen**; nicht-session-basierte Erwartungen gehoeren nach `test:expected`, `test:web` oder `test` (`snapshots/AGENTS.md`).
37. **Der `--update`-Lauf der Snapshots existiert nur in `test:snapshot:record`**; `replay` (Default) schreibt nie.
38. **`tsconfig.json` ist eine reine Solution-Datei** — „NEVER add include/files entries, and NEVER flatten this solution into a single ts.Program".
39. **Der Coverage-Schwellwert ist 100 % pro Datei** (`perFile: true` mit `statements|branches|functions|lines: 100`, `vitest.config.ts`).
40. **`CLAUDE.md` ist ein 9-Byte-Zeiger**, keine eigenstaendige Datei — Aenderungen gehoeren in `AGENTS.md`.
41. **Das Python-SDK hat kein `py.typed`, kein `[project.scripts]`, keine Extras und keine Classifiers**; es ist nicht als PEP-561-typisiert ausgezeichnet.
42. **Die Plattformidentitaet des C-Addons ist die Node-Konvention `<platform>-<arch>`**, nicht ein Rust-Triple; eine Suche nach Rust-Triples liefert keinen Treffer.
43. **`DSH_NODE_PTY_SPAWN_HELPER` und `NALR_REQUIRE_LANDLOCK` sind die einzigen Env-Variablen der nicht-TypeScript-Schicht**; alle anderen Laufzeitbinaries lesen keine Umgebungsvariablen (`native/system/docs/naming.md`).
44. **Der einzige `env[`-Zugriff mit literalem Schluessel existiert im `packages/`-Baum nicht** — alle indizierten Env-Zugriffe verwenden Variable.

---

**Ende des Dokuments.** Alle Aussagen sind aus den genannten Dateien abgeleitet; wo eine erwartete Angabe in der Quelle nicht existiert (Rust-Triples, `unit.json`-Schema, `onlyBuiltDependencies`, `CODEOWNERS`, `py.typed`), ist das ausdruecklich als Nicht-Befund vermerkt statt ergaenzt.
