# Browser-Nutzung

English | [中文](browser-use.zh.md)

Browser-Nutzung lässt ein Modell Webseiten über ein konfiguriertes Backend inspizieren und bedienen. DSH besitzt die Task-Schleife; der Provider liefert die Browser-Operationen und bewahrt den Browserzustand über die Turns einer laufenden Session hinweg.

## Provider wählen

[`dsh-browser-use`](../../packages/browser-use/browser-use/README.md) und einen Provider in derselben Komposition mounten. Die Provider sind experimentelle öffentliche npm-Pakete und erfordern explizite Aktivierung. Ihre anfängliche Browser-Engine ist Chromium.

| Provider | Integration |
|---|---|
| [Playwright MCP](../../packages/experimental/browser-use-playwright-mcp/README.md) | Die MCP-Tools von Playwright zur Browsersteuerung |
| [Chrome DevTools MCP](../../packages/experimental/browser-use-chrome-devtools-mcp/README.md) | Inspektion und Steuerung über Chrome DevTools via MCP |
| [Stagehand](../../packages/experimental/browser-use-stagehand-native/README.md) | Native Browser-Operationen mit KI-gestützten Aktionen, Beobachtung und Extraktion |

Der gemeinsame Service registriert nur einen Namen und weist jeden zweiten Provider zurück, einschließlich einer weiteren Instanz mit demselben Namen. Er hat keine gemeinsamen Browser-Operationsmethoden, keine Browser-Ressourcen und keinen modellgesteuerten Selektor. Die Provider-Konfiguration in einem Profil oder Preset wählt für diese Aktivierung Start oder Anbindung.

## Eigentum an der Session

Ein gestarteter Browser gehört dem exakten laufenden Agent und der Session, die ihn verwendet. Aufrufe über Turns hinweg verwenden diesen Browser erneut. Die Entsorgung der Session-Laufzeit schließt ihre gestarteten Ressourcen; ein Reload oder Fork einer Session startet mit frischem Browserzustand. Browser-Profile und Login-Zustand werden nicht aus dem Session-Log wiederhergestellt.

Ein angebundener Browser bleibt extern im Eigentum. Der Provider reserviert ihn für eine Session innerhalb dieser Provider-Instanz, bewahrt seinen bestehenden Browserzustand und weist die gleichzeitige Anbindung durch eine andere Session zurück. Der Abbau trennt die Verbindung und lässt den externen Browser weiterlaufen. Getrennte DSH-Prozesse und andere Clients bleiben außerhalb dieser Reservierung.

Das Herunterfahren eines Providers stoppt die Tool-Admission und wartet auf eigene Arbeit und Ressourcenbereinigung, bevor die gemeinsame Provider-Registrierung freigegeben wird. Eine Stornierung kann eine bereits zugestellte Browser-Aktion nicht rückgängig machen.

## MCP-Initialisierung

Ein MCP-Provider initialisiert einen Client für jeden laufenden Agent, der nach dem Laden des Providers erzeugt wird. Das bestehende serielle `agent/created`-Event wartet auf Verbindung und Discovery, bevor Erzeugung oder Fortsetzung abgeschlossen ist und eingereihte Eingaben laufen. Der Client bleibt über die Turns hinweg bei der Session. Ein Startfehler oder eine Stornierung weist Erzeugung oder Fortsetzung zurück und löst die Bereinigung des Clients aus.

Ist eine Anbindung belegt, läuft diese Aktivierung ohne den Browser weiter und versucht es in späteren Turns nicht erneut. Nach der Freigabe kann eine neu erzeugte oder fortgesetzte Aktivierung sie erwerben. Das Laden oder Neuladen des Providers übernimmt bereits aktive Sessions nicht; die [gemeinsame Laufzeit](../../packages/experimental/browser-use-runtime/README.md) besitzt diese Initialisierungsregeln.

## Tools und aufgezeichnete Ergebnisse

Provider-Tools verwenden die normale DSH-Ausführungspipeline und das Session-Log. Die Provider besitzen ihre Tool-Schemas, ihr Ergebnis-Rendering, ihre Bildunterstützung, ihre Konfiguration und ihre Upstream-Einschränkungen; der gemeinsame Service fügt keinen modellsichtbaren Inhalt hinzu. Die KI-gestützten Operationen von Stagehand verwenden ihr explizit konfiguriertes natives Modell, während DSH die Task-Schleife behält. DSH-Modellrouting, Wiederverwendung von Credentials, die Erfassung der zugrunde liegenden Inferenzanfragen/-antworten und die Integration in die Session-Verbrauchsabrechnung sind aufgeschoben; zurückgegebene SDK-Daten und Metadaten bleiben gewöhnliche protokollierte Tool-Ergebnisse.

Browser-MCP-Verbindungen legen außerdem [Ressourcen und Server-Instruktionen](mcp.md) offen. An einen Browser-Server adressierte Ressourcenaufrufe verwenden dessen Session-Queue und weisen andere Sessions zurück; Server-Instruktionen werden nur für ihre besitzende Session zusammengesetzt.

Die [Entscheidungsaufzeichnung](../../.agents/notes/implemented/architecture/2026-09-12-browser-use-provider-registration.md) erklärt den rein registrierenden Service und das Eigentum pro Session.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbrowseruse--browseruseregistry"></a>

### `ctx.browserUse` — `BrowserUseRegistry`

Besitzt eine optionale Provider-Registrierung im gemeinsamen Browser-Use-Service.

```ts cordis-catalog
/**
 * Reserve the sole provider slot until the contribution is disposed.
 * A second registration fails even when it repeats the current name. Providers
 * must stop their tools and await owned work before releasing this registration.
 * @param name - provider-owned name used in registration diagnostics.
 * @returns the effect disposer for this exact registration.
 */
register(name: BrowserUseProviderName): () => Promise<void>
```

Source: [`packages/browser-use/browser-use/src/index.ts`](../../packages/browser-use/browser-use/src/index.ts)
<!-- END GENERATED cordis-surface -->
