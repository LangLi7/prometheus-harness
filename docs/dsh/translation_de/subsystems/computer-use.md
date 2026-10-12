# Computer-Nutzung

English | [中文](computer-use.zh.md)

Computer-Nutzung lässt ein Modell den lokalen Desktop über einen konfigurierten Provider beobachten und bedienen. Die gemeinsame DSH-Fähigkeit heißt **computer use**; **Cua Driver** benennt die Upstream-Implementierung.

## Provider wählen

[`dsh-computer-use`](../../packages/computer-use/computer-use/README.md) und einen Provider in derselben Komposition mounten. Beide Cua-Driver-Provider sind experimentelle öffentliche npm-Pakete und erfordern explizite Aktivierung.

| Provider | Laufzeit |
|---|---|
| [Cua Driver MCP](../../packages/experimental/computer-use-cua-driver-mcp/README.md) | Eine bereits installierte `cua-driver`-Executable, verbunden über MCP |
| [Cua Driver native](../../packages/experimental/computer-use-cua-driver-native/README.md) | Die plattformnative Laufzeit, die mit der npm-Abhängigkeit installiert wird |

Jeder Provider liefert seinen Upstream-Tool-Katalog. Der gemeinsame Service registriert nur einen Namen und weist jeden zweiten Provider zurück, einschließlich einer weiteren Instanz mit demselben Namen. Er hat keine gemeinsamen Desktop-Operationsmethoden und keinen modellgesteuerten Selektor.

## Lebensdauer und gemeinsame Desktop-Nutzung

Ein Provider behält seine Registrierung, während er seine Tools und eigenen Ressourcen herunterfährt. Ein Startfehler gibt die versuchte Registrierung frei. Der MCP-Provider behält seine Registrierung während Reconnects.

Ein registrierter Provider reserviert keinen Desktop für eine Session. Aufrufer koordinieren vollständige Abläufe aus Beobachten, Handeln und Verifizieren über Sessions und getrennte DSH-Prozesse hinweg. Ein stornierter Aufruf kann Eingaben, die der Desktop bereits erhalten hat, nicht rückgängig machen.

## Ergebnisse und Plattformanforderungen

Tools verwenden die normale Ausführungspipeline und das Session-Log. Bildfähige Modellrouten mit einem Attachment-Store erhalten dauerhafte Screenshots; nicht unterstützte Bildrouten erhalten die bestehende MCP-Bilddiagnose. Provider-READMEs besitzen Installation, Berechtigung und Plattformeinschränkungen.

Die [Entscheidungsaufzeichnung](../../.agents/notes/implemented/architecture/2026-09-12-computer-use-provider-registration.md) erklärt den rein registrierenden Service und die beiden Cua-Driver-Integrationen.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcomputeruse--computeruseregistry"></a>

### `ctx.computerUse` — `ComputerUseRegistry`

Besitzt eine optionale Provider-Registrierung im gemeinsamen Computer-Use-Service.

```ts cordis-catalog
/**
 * Reserve the sole provider slot until the contribution is disposed.
 * A second registration fails even when it repeats the current name. Providers
 * must stop their tools and await owned work before releasing this registration.
 * @param name - provider-owned name used in registration diagnostics.
 * @returns the effect disposer for this exact registration.
 */
register(name: ComputerUseProviderName): () => Promise<void>
```

Source: [`packages/computer-use/computer-use/src/index.ts`](../../packages/computer-use/computer-use/src/index.ts)
<!-- END GENERATED cordis-surface -->
