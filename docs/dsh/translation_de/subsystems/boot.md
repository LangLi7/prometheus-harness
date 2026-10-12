# Profilverwaltung

English | [中文](boot.zh.md)

Die [Boot-Paketgruppe](../../packages/boot/README.md) besitzt den vom Launcher bereitgestellten Profilzugriff und den Plugin-Manager. Der [Plugin-Manager](../../packages/boot/plugin-manager/README.md) dokumentiert Persistenz sowie Reload- und Paketoperationsverhalten.

## Verwaltungsrecords

`PluginEntryId` identifiziert einen Loader-Eintrag; Aufrufer beziehen sie aus `listPlugins`, statt eine Patch-Id zu konstruieren.

`PluginInfo` trägt Modulidentität, effektive Aktivierung, Fiber-Phase und optionales Anzeige-`meta` sowie eine eindeutige `patchId` oder einen `readOnlyReason`.

`BundleInfo.official` identifiziert projektgepflegte, mitgelieferte optionale Bundles und On-Demand-Katalogeinträge unabhängig von der Installation. `availability` identifiziert ein lesbares, von der Installation bereitgestelltes oder im Profil liegendes Paket oder `missing`; On-Demand-Katalogeinträge schließen nicht deklarierte transitive Kopien aus. `installed` zeichnet die Abhängigkeitsdeklaration des Profils auf. Ein On-Demand-`installTarget` trägt die vom Host abgeleitete exakte Spec und Version. `BundleInfo` trägt außerdem den Paketnamen, die optionale installierte Version, die gewählte Aktivierung, die Verfügbarkeit der Entfernung, einen optionalen Auflösungsfehler und, für ein Bundle, das die eigene Abhängigkeit des Profils bereitstellt und die Installation nicht, `source`: diese Abhängigkeit als Spec, die `pnpm add` akzeptiert. Sein optionales `meta` und jedes `BundleRowInfo.meta` enthalten Anzeigetext oder eine Metadaten-Diagnose; Clients wählen eine Sprache zur Renderzeit.

`InstallBundleOptions.saveExact` übergibt `--save-exact` an den gemeinsamen Paketinstaller. `InstallBundleOptions.enabled` ist standardmäßig true. False installiert, ohne die Bundle-Schicht zu wählen. `approvedBuilds` gewährt den angegebenen ausstehenden Paketnamen dauerhafte Script-Berechtigung vor der Installation. `registry` benennt die zuerst angefragte Registry; fehlt sie, die konfigurierte.

`PluginRegistries` trägt die konfigurierte erste Registry, `null` für die, die pnpm-eigene Konfiguration benennt, die danach angefragten Fallbacks und `resolved`, die URL, die pnpm-eigene Konfiguration benennt, oder `null`, solange sie ungelesen ist. `InspectOptions.registry` benennt die Registry, die ein Lookup zuerst anfragt.

`ChangeResult.changed` meldet eine Bearbeitung auf der Platte unabhängig von `application`: `applied`, `restart-required`, `overridden` oder `failed`. Optionales `error` trägt einen lokalisierbaren Code und eine externe Diagnose. `packageResult` zeichnet den pnpm-Exit-Code, begrenzte Ausgabe, das Truncation-Flag und den vollständigen Pfad zum Diagnose-Log auf, plus `timedOut`, wenn der Manager einen Lauf beendet hat, der aufhörte zu drucken. Ein beendeter Lauf wird unabhängig vom Exit-Status, den das Signal hinterlässt, als `timeout` klassifiziert, sodass Installation und Entfernung einen Fehler statt eines Erfolgs melden und keine weitere Registry angefragt wird. `pendingBuilds` listet unentschiedene Pakete über das Profil hinweg auf; `approvedBuilds` zeichnet die Namen auf, denen diese Operation Berechtigung gewährt hat; `registries` listet die von einer Installation angefragten Registries in Reihenfolge; `bundle` und `version` benennen das Paket, das eine abgeschlossene Installation hinzugefügt hat, und seine Manifest-Version; `failedAt` sagt, ob der letzte fehlgeschlagene Lauf die angefragte Registry oder den Host nicht erreichen konnte, von dem eine Git- oder Tarball-Spec geholt wird.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxconfigeditor--configeditor"></a>

### `ctx.configEditor` — `ConfigEditor`

Vollständige Rohkonfigurationen persistieren und sie über den normalen Loader-Pfad anwenden.

```ts cordis-catalog
/** Addressable profile rows; nested Includes have independent configuration ownership.
 * @returns Active entries with unique profile patch ids.
 */
entries(): Entry[]

/** Read inherited and explicit profile values for the active entries.
 * @returns Detached layer values alongside their Loader entries.
 */
configuration(): Array<{ entry: Entry; inherited: Record<string, unknown>; override: Record<string, unknown> }>

/** Validate, persist, and reconcile a plugin's next config; ordinary fields keep normal lifecycle rules.
 * @param entry Current Loader entry, also used to detect replacement during the write.
 * @param change Derive a raw config from the current entry and its inherited layer.
 * @returns Fulfillment after Loader reconciliation completes.
 */
async edit( entry: Entry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>, ): Promise<void>
```

Source: [`packages/boot/config-editor/src/index.ts`](../../packages/boot/config-editor/src/index.ts)

<a id="ctxhmr--hmr"></a>

### `ctx.hmr` — `Hmr`

Hot-Reload-Service mit Cordis-kompatibler Modulkonfiguration und Cordis-kompatiblen Events.

```ts cordis-catalog
/** Serialize a caller-owned mutation with all automatic reload paths.
 * @param operation Work that must not overlap module or configuration replacement.
 * @returns The operation result after its asynchronous work completes.
 */
runExclusive<T>(operation: () => Promise<T>): Promise<T>

/** Watch a configuration path through the same queue as module replacement.
 * @param filename Absolute path, which may not exist yet.
 * @param refresh Rebuilds configuration from its current files and awaits Loader completion.
 * @returns Disposer closing this registration and waiting for its pending refresh.
 */
async watchConfig(filename: string, refresh: () => Promise<void>): Promise<() => Promise<void>>

/** Read direct module dependency URLs from the active Node loader.
 * @param url Module URL.
 * @returns Linked module URLs, or an empty list for an uncached module.
 */
async getLinked(url: string): Promise<string[]>
```

Source: [`packages/boot/hmr/src/index.ts`](../../packages/boot/hmr/src/index.ts)

<a id="ctxpluginmanager--pluginmanager"></a>

### `ctx.pluginManager` — `PluginManager`

Profildateien verwalten und ihren deklarierten Reload-Lebenszyklus anwenden.

```ts cordis-catalog
/** Read exact plugin-version exemptions saved in this profile.
 * @returns Accepted package-name@version keys with the runtime versions they may run on, and any
 * record or file problem the reader rejected, which the caller reports instead of failing.
 */
@Remote listVersionExemptions(): { exemptions: Record<string, string[]>; warnings: string[] }

/** Grant or revoke one exact plugin/runtime exemption and reevaluate live plugins.
 * @param packageVersion Exact manifest package name followed by @ and its version; never an installation spec or alias.
 * @param runtimeVersion Exact current DSH version for grants; revocation may name a previous runtime.
 * @param enabled Whether to grant rather than revoke the exemption.
 * @param acceptRisk Required true for grants after the user accepts possible crashes and data loss.
 * @returns Saved and runtime outcomes. Startup-only profiles require restart.
 */
@Remote setVersionExemption(packageVersion: string, runtimeVersion: string, enabled: boolean, acceptRisk?: boolean): Promise<ChangeResult>

/** Read current plugins, including why a row cannot be changed through the profile patch.
 * @returns Current runtime entries with persistent patch targets.
 */
@Remote async listPlugins(): Promise<PluginInfo[]>

/** Read installed, installation-provided, and offline Official catalog bundles, plus selected non-bundle names.
 * A dependency without a bundle patch is listed, as a `not-bundle` problem, only while it is selected.
 * @returns Package versions, manifest descriptions, the installable spec of profile dependencies, rows, optional
 * display metadata, activation selections, whether the installation offers the bundle, and removal availability.
 */
@Remote listBundles(): Promise<BundleInfo[]>

/** Read the registries this manager asks: the configured first one, its fallbacks in order, and what pnpm's own configuration names.
 * @returns The registries in pnpm's comparison form; null is the one pnpm's own configuration names, `resolved` as pnpm reads it now.
 */
@Remote async registries(): Promise<PluginRegistries>

/** Read what a spec names before installing it.
 * @param spec One package spec: a registry name, an absolute path, a git address, or a tarball.
 * @param options The registry asked first.
 * @param signal Ends a registry lookup early.
 * @returns The package the spec names, or why it is refused.
 */
@Remote async inspect(spec: string, options?: InspectOptions, signal?: AbortSignal): Promise<PluginSpecInspection>

/** Persist a plugin entry's desired enablement and apply it on live profiles.
 * @param id Loader entry identity returned by listPlugins.
 * @param enabled Whether the plugin should run.
 * @returns Saved and runtime outcomes, including higher-priority overrides.
 */
@Remote setPluginEnabled(id: PluginEntryId, enabled: boolean): Promise<ChangeResult>

/** Select or remove a bundle layer while retaining installed dependencies.
 * @param name Bundle package name.
 * @param enabled Whether the bundle contributes its patch layer.
 * @returns Persisted and runtime outcomes.
 */
@Remote setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult>

/**
 * Install a package using the same pnpm implementation as dsh plugin. GitHub
 * repositories get a connection check bounded by githubConnectionTimeoutMs before pnpm starts;
 * only network failures or timeouts stop installation, while pnpm owns authentication and transport fallback. A run
 * that fails, is cancelled, or adds a package without a bundle patch restores
 * `package.json` and `pnpm-lock.yaml` as they were; downloaded files can stay.
 * @param spec One package spec, including local paths relative to the invocation directory.
 * @param options Whether to activate the installed bundle (defaults to true), the request id a cancellation names,
 * the pending build scripts to allow, whether to save an exact dependency, and the registry asked first.
 * @returns Package-manager diagnostics, the registries asked, and the observed activation outcome.
 */
@Remote installBundle(spec: string, options?: InstallBundleOptions): Promise<ChangeResult>

/** Recover the result of an active installation without cancelling it.
 * @param requestId The id supplied when installation started.
 * @returns The installation's outcome after it settles, or null if no active request has that id.
 * Completed results are not retained; null establishes neither success nor cancellation.
 */
@Remote async waitForInstall(requestId: PluginInstallRequestId): Promise<ChangeResult | null>

/** Stop an installation this manager owns and wait until its files are back.
 * @param requestId The id the installation was started with.
 * @returns `cancelled` once the Git check or pnpm exited and the files are restored, `too-late` once the bundle is being
 * applied, `not-running` for any other id.
 */
@Remote async cancelInstall(requestId: PluginInstallRequestId): Promise<PluginInstallCancellation>

/** Unload and remove a profile-owned bundle dependency through dsh plugin's pnpm path; a selected name no
 * dependency holds is only deselected.
 * @param name Installed dependency or selected bundle name.
 * @returns Removal diagnostics and the remaining profile state.
 */
@Remote removeBundle(name: string): Promise<ChangeResult>
```

Source: [`packages/boot/plugin-manager/src/index.ts`](../../packages/boot/plugin-manager/src/index.ts)

<a id="ctxpluginregistryprobe--pluginregistryprobe"></a>

### `ctx.pluginRegistryProbe` — `PluginRegistryProbe`

Vergleicht Antworten öffentlicher Registries auf dem Host; der Client besitzt die Erstauswahl.

```ts cordis-catalog
/**
 * Race npm and npmmirror HTTPS ping responses through the Host's fetch proxy.
 * Concurrent readers share a probe; a winner cancels and awaits the other request.
 * @returns the first registry with a successful response, or null when disabled or neither responds successfully; results are cached.
 * @throws rejects when the service has been unloaded.
 */
@Remote async fastest(): Promise<string | null>
```

Source: [`packages/client/ui-plugin-manager/src/index.ts`](../../packages/client/ui-plugin-manager/src/index.ts)

<a id="ctxprofilecontext--profilecontext"></a>

### `ctx.profileContext` — `ProfileContext`

Aktuelle Profilfakten; Planung und Mutation gehören ihren Aufrufern.

Source: [`packages/boot/app-boot/src/profile-context.ts`](../../packages/boot/app-boot/src/profile-context.ts)

<a id="app-boot-events"></a>

### `app-boot/*` events

<a id="app-bootconfig-reload--emit"></a>

#### `app-boot/config-reload` — emit

Profil-Patches wurden in den laufenden Loader-Baum abgeglichen: jedes Eintragsupdate ist abgeschlossen und kein neuer inaktiver Eintrag wurde eingeführt. Trägt kein Diff; Listener lesen die Loader-Einträge erneut.

```ts cordis-catalog
/**
 * Profile patches were reconciled into the running Loader tree: every entry update settled and no new
 * inactive entry was introduced. Carries no diff; listeners re-read Loader entries.
 * @mode emit
 */
'app-boot/config-reload'(): void
```

Source: [`packages/boot/app-boot/src/index.ts`](../../packages/boot/app-boot/src/index.ts)

<a id="hmr-events"></a>

### `hmr/*` events

<a id="hmrchange--emit"></a>

#### `hmr/change` — emit

Eine überwachte Datei hat keinen Modul- oder Konfigurationshandler.

```ts cordis-catalog
/** A watched file has no module or configuration handler.
 * @mode emit
 * @param url Canonical file URL.
 */
'hmr/change'(url: string): void
```

Source: [`packages/boot/hmr/src/index.ts`](../../packages/boot/hmr/src/index.ts)

<a id="hmrreload--emit"></a>

#### `hmr/reload` — emit

Modulersetzungen sind fertig geladen.

```ts cordis-catalog
/** Module replacements have finished loading.
 * @mode emit
 * @param reloads Replaced plugins and their module locations.
 */
'hmr/reload'(reloads: Map<Plugin, Reload>): void
```

Source: [`packages/boot/hmr/src/index.ts`](../../packages/boot/hmr/src/index.ts)

<a id="plugin-manager-events"></a>

### `plugin-manager/*` events

<a id="plugin-managerchanged--emit"></a>

#### `plugin-manager/changed` — emit

Die Plugins, Bundles oder die Komposition des Profils haben sich geändert: eine Manager-Operation ist abgeschlossen. Eine Patch-Generierung, die außerhalb des Managers angewendet wurde, durch den Watcher von HMR nach einer CLI- oder Handbearbeitung, kündigt hier nichts an.

```ts cordis-catalog
/**
 * The profile's plugins, bundles, or composition changed: a manager
 * operation completed. A patch generation applied outside the manager,
 * by HMR's watcher after a CLI or hand edit, announces nothing here.
 * @mode emit
 * @param change - what changed.
 */
'plugin-manager/changed'(change: PluginChange): void
```

Source: [`packages/boot/plugin-manager/src/types.ts`](../../packages/boot/plugin-manager/src/types.ts)

<a id="plugin-managerinstall-log--emit"></a>

#### `plugin-manager/install-log` — emit

Ein Chunk der Ausgabe eines pnpm-Laufs, gestreamt während der Lauf ihn erzeugt.

```ts cordis-catalog
/**
 * One chunk of a pnpm run's output, streamed as the run produces it.
 * @mode emit
 * @param chunk - the chunk and the run it belongs to.
 */
'plugin-manager/install-log'(chunk: PluginInstallLogChunk): void
```

Source: [`packages/boot/plugin-manager/src/types.ts`](../../packages/boot/plugin-manager/src/types.ts)

<a id="plugin-managerinstall-state--emit"></a>

#### `plugin-manager/install-state` — emit

Eine Installation hat zwischen ihren Host-Phasen gewechselt. `installing` wird einmal pro Registry angekündigt, die die Installation anfragt, mit Registry und Position des Versuchs; `cancelling` und `applying` je einmal.

```ts cordis-catalog
/**
 * An installation moved between its Host phases. `installing` is announced once per registry the
 * installation asks, with the attempt's registry and position; `cancelling` and `applying` once.
 * @mode emit
 * @param progress - the installation's request id and phase, with the attempt while installing.
 */
'plugin-manager/install-state'(progress: PluginInstallProgress): void
```

Source: [`packages/boot/plugin-manager/src/types.ts`](../../packages/boot/plugin-manager/src/types.ts)
<!-- END GENERATED cordis-surface -->
