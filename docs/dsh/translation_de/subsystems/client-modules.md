# Client-Module

English | [中文](client-modules.zh.md)

Die Web-Plugin-Tabelle: die Node-Hälfte des Client-Modulsystems in [dsh-client-modules](../../packages/client/modules), bereitgestellt als `ctx.clientModules` (`ClientModuleRegistry`). Sie durchsucht die Einträge des Host-Loaders nach Paketen, die `dsh.client` deklarieren, setzt den Einstiegsgraphen `window.__DSH_BOOT__` zusammen, serviert versionierte Combo-Scripts aus einem oder mehreren Ressourcen unter `/plugins` und beantwortet jede Index-Injektionssammlung mit den Boot-Protokollzeilen — die vier Gesichter eines Service. Es ist eine optionale Fähigkeit des Web-GUI-Stacks, nicht Teil des Agent-Loop-Rückgrats, und es ist ein Consumer von [dsh-host-webserver](../../packages/host/webserver): der in [web-server.md](web-server.md) beschriebene Träger liefert die Präfix-Route und das `webserver/index-inject`-Event, das dieser Service beantwortet. Die Browser-Hälfte desselben Pakets (`ctx.modules`, die Lazy-CJS-Modultabelle, die diese Bundles holt und materialisiert) ist Kernel-Maschinerie und im [Paket-README](../../packages/client/modules/README.md) dokumentiert, nicht hier.

Source: [`packages/client/modules/src/client/manifest.ts`](../../packages/client/modules/src/client/manifest.ts)

## Das Wire

Der Graph ist die einzige Wire-Quelle zwischen der Node- und der Browser-Hälfte. Der Host setzt `WebBootEntry`-Zeilen und `WebBootBatch`-Deskriptoren aus den durchsuchten Paketen zusammen und trägt dann die Registrierungs-Fassade, Anwendungs-Preloads, Bootstrap-Scripts und das Graph-Global in die strukturierte Index-Injektionstabelle ein, bevor der Vite-Einstieg läuft. Die `global`-Zeile rendert als `globalThis["__DSH_BOOT__"]` mit maskiertem `<`, damit plugin-gesteuerte Zeichenketten nicht aus dem Script-Element ausbrechen können. Eine Seite ohne gültiges Manifest kann nicht booten: der Browser-Parser weist fehlerhafte Zeilen oder Batches, unbekannte Mitglieder und Einträge ohne genau einen initialen Combo-Deskriptor zurück.

```ts type-equiv
/**
 * One composed client entry pushed by the host (a graph row). Wire
 * single source: the host node half (package root) produces this same shape.
 * `immediately` marks stage-one prefetch. `inject` names package rows whose
 * factories must arrive before this row materializes, while Cordis separately
 * uses the same package edges to compose entries. `external` carries exact
 * non-inject module requests (see {@link WebBootGraph.entries}).
 */
interface WebBootEntry {
  /** Entry name == package name. */
  id: string
  /**
   * Revisioned single-resource combo reference used by HMR. It is relative to
   * the document, so the browser resolves it under whatever mount served the page.
   */
  url: string
  /** Opaque plugin-artifact revision used for HMR cache busting. */
  rev: string
  /** Package-name dependency edges used for factory arrival and plugin composition. */
  inject?: string[]
  /** Stage-one prefetch mark: load the script for factory registration during module-face boot. */
  immediately?: boolean
  /** Non-baseline module specifiers this row requests; omitted when it requests none. */
  external?: string[]
}
```

```ts type-equiv
/** Initial scheduling phase for one revisioned combo script. */
type WebBootBatchPhase = 'bootstrap' | 'application'
```

```ts type-equiv
/** One initial combo script; a scheduling phase may span several descriptors. */
interface WebBootBatch {
  /** Parser-blocking bootstrap or preloaded application scheduling. */
  phase: WebBootBatchPhase
  /** Content-addressed combo script reference, document-relative like {@link WebBootEntry.url}. */
  url: string
  /** Revision derived from the ordered entry revisions. */
  rev: string
  /** Graph entry ids whose factories the script registers, in execution order. */
  entries: string[]
}
```

```ts type-equiv
/** The composed client entry graph the host injects as `window.__DSH_BOOT__`. */
interface WebBootGraph {
  /** Consistency anchor over the current entry and batch descriptors. */
  rev: string
  /**
   * Composed entries in module-graph order — a dynamic package row precedes
   * rows whose `external` requests that package. Cordis activation order is
   * unrelated and remains owned by fiber service waiting.
   */
  entries: WebBootEntry[]
  /** Initial combo descriptors; every entry belongs to exactly one descriptor. */
  batches: WebBootBatch[]
}
```

Erstveröffentlichung und HMR leiten die `rev` jeder Zeile aus mtime, ctime und Größe des Eintrags ab, ohne ausführbare Bytes zu hashen. Dieselben Artefakte behalten ihre Revisionen über Host-Neustarts hinweg. Die initialen Deskriptoren teilen die Zeilen in die Scheduling-Phasen bootstrap und application auf, und jede Phase darf mehrere Deskriptoren enthalten. Ihre URLs enthalten nur die geordnete Paket-Ressourcenliste und eine aus diesen Zeilenrevisionen abgeleitete Revision; Phasennamen gelangen nicht in die Route. Die Graph-Komposition bewahrt die Zeilenreihenfolge und teilt gierig auf, bevor die URL in Map-Form 3 KiB überschreitet, ohne Scripts zu verketten oder Maps zu lesen. Die Graph-Revision hasht die Eintrags- und Batch-Deskriptoren. `immediately` markiert die Registrierungsbarriere der ersten Stufe; Zeilen innerhalb einer Combo teilen ihren Script-Transport, während getrennte Combos unabhängig laden.

## Der Scan

Ein Paket tritt der Tabelle bei, indem es in seiner package.json `dsh.client` deklariert (`platform: 'web'`, optionale `inject`-Kanten, optionales `immediately`) und sein gebautes Bundle unter `exports["./client"]` exportiert. Jede laufende Zeile löst sich aus ihrem eigenen Loader-Specifier und dem `baseUrl` des besitzenden Baums auf, und zwar über dieselbe `loader.internal.resolveSync`-Implementierung, die ihre Host-Seite importiert, sofern verfügbar. Das nächstgelegene besitzende Paketmanifest liefert die Browser-Modul-Id, sodass relative Quell- und Build-Overlays die Paketidentität bewahren. Verschiedene aktive Loader-Quellen, die sich zu einem Paketnamen auflösen, lassen die Komposition fehlschlagen; nachdem eine Quelle entladen ist, liefert die überlebende Quelle die Zeile ohne Fiber-Neustart.

Der Scan ist inkrementell pro Paket; es gibt keinen Codepfad für einen vollständigen Rescan. Jede `internal/plugin`-Emission von cordis (Fiber-Erzeugung oder -Entsorgung) markiert den Eintragsnamen der Fiber als dirty, und ein Mikrotask-Flush gleicht jeden dirty-Namen gegen die laufenden Loader-Einträge ab. Der Aktivierungslauf befüllt dieselbe dirty-Menge mit allen aktuellen Einträgen und flusht synchron, sodass Erstscan und Dauerzustand eine Implementierung teilen — mit entgegengesetzter Fehlerhaltung. Bei der Aktivierung aggregiert eine fehlerhafte Deklaration oder ein fehlendes Bundle unter den bereits geladenen Einträgen zu einem lauten `AggregateError`, der jedes kaputte Paket auflistet: die Fiber SCHEITERT und der fail-loud-Sweep des Boots meldet es. Im Dauerzustand protokolliert ein kaputtes Paket eine Warnung und darf die anderen nicht vergiften.

Paketmetadaten — einschließlich des negativen Urteils „kein Client-Paket“ — werden pro Loader-Specifier und base URL des besitzenden Baums bis zum Neustart gecacht. Ein Fiber-Neustart aus derselben Quelle verwendet seine Zeile und rev unverändert erneut; Änderungen am Bundle-Inhalt erreichen den Graphen nur über `rebuilt()`.

## Die Bundle-Route und Index-Injektion

`GET`/`HEAD /plugins/??<package-a>/client.js,<package-b>/client.js&rev=<rev>` adressiert ein generiertes Combo-Script; eine Anfrage mit einer Ressource verwendet dieselbe Form und ist der HMR-Pfad. Das Script wird bei seinem ersten `GET` einmal verkettet und endet mit einer `sourceMappingURL`, die allein die Combo-Query trägt — `??<package-a>/client.js.map,<package-b>/client.js.map&rev=<rev>`, aufgelöst gegen das eigene Verzeichnis des Scripts statt gegen das Dokument. Die Map-Dateien werden weder beim Start noch beim Index-Rendering noch bei Script-`GET` oder `HEAD` gelesen; das erste Map-`GET` liest und validiert sie, setzt eine Indexed Source Map v3 zusammen und cached diesen Body. Eine mitgelieferte Komponenten-Map liefert ihren Abschnitt; eine Komponente ohne eine erhält einen Identity-Abschnitt, dessen `sourcesContent` das erfasste Bundle ist und dessen Quellname ihre paketierte `sourceURL` oder Plugin-Route ist. Jede Startanfrage-URL misst als UTF-8-Bytes höchstens 3 KiB; die Partitionierung verwendet die längere Map-Form. Alle Anwendungs-URLs werden vorgeladen, und alle Bootstrap-URLs laufen vor dem Graph-Global und dem Vite-Einstieg. Materialisierte Antworten verwenden langlebiges Immutable-Caching. Unbekannte oder veränderte Ressourcenlisten, fehlende Revisionen und veraltete Revisionen antworten mit 404, statt andere Bytes zu servieren oder den SPA-Fallback HTML als JavaScript zurückgeben zu lassen; andere Methoden erhalten 405. Die Injektionszeilen tragen den aktuellen Graphen bei jedem Index-Rendering, sodass ein Reload stets gegen die lebende Komposition bootet.

## Der Service

```ts type-equiv
/** Filesystem baseline captured before a client artifact snapshot is read. */
interface ClientArtifactBaseline {
  /** Absolute path of the client bundle. */
  readonly path: string
  /** Bundle modification time in milliseconds. */
  readonly mtimeMs: number
  /** Bundle status-change time in milliseconds, including writes that preserve mtime. */
  readonly ctimeMs: number
  /** Bundle size in bytes. */
  readonly size: number
}
```

`ClientModuleRegistry` (`ctx.clientModules`, definiert in [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)) legt Reads und die Rebuild-Seite offen; Signaturen stehen im generierten [Service-Katalog](#ctxclientmodules--clientmoduleregistry). `graph()` gibt den aktuellen zusammengesetzten Graphen zurück (ein zwischen Änderungen stabiles Objekt), `clientPath(id)` gibt den absoluten Pfad des Bundles zurück und `artifactBaseline(id)` die Bundle-Stat-Werte, die erfasst wurden, bevor der aktuelle Snapshot gelesen wurde. `fetchBundle()` löst dieselbe Lazy-Antwort auf, die die HTTP-Route verwendet. `rebuilt(id)` ist der einzige Einstiegspunkt, über den geänderter Bundle-Inhalt den Graphen erreicht: er leitet die Revision aus Dateisystemmetadaten ab, und nur eine Revisionsänderung liest die neuen Bytes, setzt den Graphen neu zusammen und benachrichtigt. `onRebuilt` feuert pro geändertem Bundle mit der neuen Revision; `onGraphChanged` feuert nach jedem Flush, der den Graphen neu zusammengesetzt hat (Zeile hinzugefügt oder entfernt, oder eine rebuildete Revisionsänderung), und ist Pull-Modell — Listener lesen `graph()` erneut. Beide Benachrichtigungspfade fangen Listener-Ausnahmen ab, damit ein werfender Abonnent spätere Abonnenten nicht überspringt oder den Auslöser des Flushs nicht beendet.

[`dsh-client-hmr`](../../packages/client/hmr/README.md) liefert in der ausgelieferten Web-Komposition laufende Graph-Snapshots. Der Host leitet bestehende Graph-Change-Benachrichtigungen sofort weiter, und ein Reconnect sendet den aktuellen vollständigen Graphen. Ein Graph beschreibt gewünschte Browser-Einträge, ohne zu behaupten, dass die Host-Bereinigung abgeschlossen ist. Sein Artefakt-Poll meldet rebuildete Revisionen separat. Source-Map-Änderungen allein lösen keinen Reload aus; eine neue Combo-Map-URL erscheint erst nach einer Bundle-Revisionsänderung, und jeder Map-Body ist durch sein erstes `GET` festgelegt. Client-Module validieren Snapshots und serialisieren den Abgleich mit diesen Rebuilds; es besitzt die beim Boot erzeugte Eintrags-Map, das Eintreffen einzelner Ressourcen, asynchrone Entfernung, die Bereinigung ungenutzter Module/Styles und den seitenlokalen Retry-Status. Statische Plattformmodule und der Bootstrap behalten ihre Seitenlebensdauer; die Electron-Installation ist ein getrennter Ablauf.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxclientmodules--clientmoduleregistry"></a>

### `ctx.clientModules` — `ClientModuleRegistry`

Der Web-Plugin-Tabellenservice: inkrementeller `dsh.client`-Scan + Wire-Komposition + Bundle-Route + Index-Injektionszeilen. Die Konstruktion führt den Aktivierungsscan synchron aus — eine fehlerhafte Deklaration oder ein fehlendes Bundle unter den bereits geladenen Einträgen aggregiert zu einem lauten Throw (Fiber FAILED; das Aktivierungsaudit des Boots meldet es).

```ts cordis-catalog
/**
 * Current composed entry graph (stable object between changes).
 * @returns the graph served as `window.__DSH_BOOT__`.
 */
graph(): WebBootGraph

/**
 * Absolute path of an entry's client bundle.
 * @param id - entry id (package name).
 * @returns the path, or undefined for an unknown id.
 */
clientPath(id: string): string | undefined

/**
 * Serve an advertised revisioned bundle or source map without a Web server.
 * Unknown URLs return 404, unsupported methods return 405, and `HEAD`
 * returns the same immutable headers without materializing a body. Each body
 * is built once on its first `GET`; script construction never reads maps.
 * @param request - shell-carrier request for a `/plugins` resource.
 * @returns the exact response also exposed by the optional Web route.
 */
async fetchBundle(request: Request): Promise<Response>

/**
 * Filesystem baseline captured before an entry's current bytes were read.
 * HMR compares it with the live files when installing a watch, so a write
 * between startup composition and watch installation cannot disappear into
 * the watcher's initial state.
 * @param id - entry id (package name).
 * @returns the path and baseline, or undefined for an unknown id.
 */
artifactBaseline(id: string): ClientArtifactBaseline | undefined

/**
 * Publish one completed bundle generation (the HMR watch's registration
 * hook — the only entry point through which build changes reach the graph).
 * Unchanged mtime, ctime and size preserve the graph without reading the bundle.
 * @param id - entry id (package name).
 * @returns the current artifact rev, or undefined for an unknown id.
 */
rebuilt(id: string): string | undefined

/**
 * Subscribe to bundle rebuilds; fires only when artifact metadata changes the rev.
 * @param listener - receives the entry id and its new bundle rev.
 * @returns the unsubscriber.
 */
onRebuilt(listener: (id: string, rev: string) => void): () => void

/**
 * Fires after any flush that recomposed the graph (row added/removed, or a
 * rebuilt rev change). Pull model: listeners re-read {@link graph}.
 * @param listener - notified with no payload.
 * @returns the unsubscriber.
 */
onGraphChanged(listener: () => void): () => void
```

Source: [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)
<!-- END GENERATED cordis-surface -->
