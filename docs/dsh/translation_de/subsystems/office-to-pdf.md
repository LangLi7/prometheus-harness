# Office zu PDF

English | [中文](office-to-pdf.zh.md)

Die [Dokument-Paketfamilie](../../packages/document/README.md) konvertiert Office-Dateien auf dem Node-Host in PDFs. Consumer autorisieren Quelllesevorgänge und besitzen die Darstellung; der gemeinsame Provider besitzt Konvertierung, begrenzte Zulassung und die Wiederverwendung transienter PDFs. Dieses Subsystem erzeugt weder ein modellzugewandtes Tool noch ein Session-Event.

## Ownership

| Owner | Verantwortung |
|---|---|
| [office-to-pdf](../../packages/document/office-to-pdf/README.md) | `ctx.officeToPdf`: gemeinsame LibreOffice-Konvertierung, begrenzte Zulassung und PDF-Caching |
| [Web-Bundle](../../packages/bundle/web-app/README.md) | Ein konfigurierbarer Konvertierungsprovider, den Host-Consumer gemeinsam nutzen |
| [Office-Preview-Client](../../packages/client/ui-sidebar-documentpreview/README.md#office-preview) | Auswahl der Office-Endung, PDF-Wiederverwendung und Hinweise auf fehlende Schriften |

## Anfragen und Ergebnisse

[`OfficeToPdfRequest`](../../packages/document/office-to-pdf/src/types.ts) enthält einen bereits autorisierten Quellschlüssel/-version, eine optionale Stat-Größe, einen verzögerten `read(signal, maxBytes)`-Callback, eine Vordergrund-/Hintergrundpriorität und eine `OfficeExtension`: `doc`, `docx`, `xls`, `xlsx`, `ppt` oder `pptx`. `OfficeToPdf.convert(request, signal?)` gibt ein vollständiges PDF-Ergebnis zurück. Der Abbruch folgt den Lebensdauern von Aufrufer und Provider; Validierungs-, Ausgabe- und Engine-Fehler weisen mit einem klassifizierten `OfficeToPdfError` zurück.

`OfficeToPdfPriority` ist `foreground` für angeforderte Preview/QA und `background` für Spekulation. `OfficeSourceKey` brandet den vom Aufrufer besessenen autorisierten Quell-Locator. `OfficeToPdfGeneration` brandet eine Provider-Lebensdauer, und `OfficeToPdfKey` brandet deren Inhaltsidentität; keiner der beiden undurchsichtigen Werte wird von Consumern geparst.

| Ergebnisfeld | Bedeutung |
|---|---|
| `pdf` | Vom Aufrufer besessenes `Uint8Array` mit dem vollständigen PDF |
| `missingFonts` | Angeforderte Schriftfamilien des Dokuments, die für diese Konvertierung nicht verfügbar sind |
| `cacheKey` | Undurchsichtige Converter-Generation plus Identität von Endung und Quellinhalt |
| `generation` | Provider-Lebensdauer; ein Austausch entwertet die Wiederverwendung gecachter PDFs |

Der Provider lässt den verzögerten Lesevorgang zu, bevor er Quellbytes alloziert, teilt Konvertierungen über die Inhaltsidentität und entfernt sein privates Scratch-Verzeichnis vor der Rückgabe. Zurückgegebene PDF-Bytes bleiben nach der Entsorgung des Providers gültig. Quell- und PDF-Bytes gelangen nicht in den Session-Speicher. Consumer können [Workspace Files](../../packages/api/workspace-files/README.md) für autorisierte, begrenzte Lesevorgänge verwenden.

## Preview-Lesevorgänge

`RenderedDocumentBytes` trägt Workspace-Datei-Metadaten, natives PDF-`data`, `missingFonts` und `generation`; die ursprüngliche Quellidentität begleitet das konvertierte PDF.

Die Remote-Methode `officeToPdf.render` prüft Quellautorisierung und -version über den [Workspace Files](../../packages/api/workspace-files/README.md)-Dienst der Session. Nach der Konvertierungszulassung liefert `fs.readBytes` Rohdaten innerhalb der reservierten Byte-Kapazität; die Office-Eingabegrenzen bestimmen diesen Lesevorgang. Die binäre Remote projiziert das PDF in ein Multipart-Attachment und stellt auf dem Client ein `ArrayBuffer`-gestütztes `Uint8Array` wieder her. Fehler beim Quellzugriff werden durchgereicht; Größen- und Engine-Fehler legen einen klassifizierten Grund ohne Diagnosen offen. Die Konvertierung aktiviert keinen Agent und hängt keine Events an.

Die `api/remotes`-Assembly mountet den generierten Remote-Deskriptor des Konvertierungsdienstes. Das gemeinsame Document-Preview-Paket registriert Office-Formate mit vollständigem Byte-Laden und seinem bestehenden PDF.js-Worker. Jeder Preview-Lesevorgang prüft Renderer-Generation, Quellautorisierung und Version erneut, bevor er eine laufende Konvertierung oder ein gecachtes PDF teilt. Verbindungs-Resets und Plugin-Entsorgung brechen Anfragen ab und leeren gecachte Bytes. Fehlende Dienste zeigen lokalisierte Konfigurationshinweise.

## Engine-Auswahl und Grenzen

Die externe Node-API [`@deepseek-ai/libreoffice-kit`](https://github.com/deepseek-ai/dsh-libreoffice-kit) wählt ihre vorkompilierten Engines. Das Kit hat eine unabhängige Version und einen eigenen Release-Workflow, festgelegt durch die [Entscheidung zur Release-Ownership](../../.agents/notes/implemented/architecture/2026-09-14-independent-libreoffice-kit.md). Anwendungs-Builds installieren die veröffentlichten npm-Pakete. Das Packaging der Anwendung erfordert die deklarierte native Engine des Ziels oder Node WASM, wenn das Kit für dieses Ziel keine native Engine deklariert. Die [Plattform-Engine-Referenz](../../packages/document/office-to-pdf/README.md) definiert Installation und Packaging. Ungültige Metadaten, fehlende erforderliche Assets und Konvertierungsfehler weisen zurück, ohne die Engine zu wechseln. Die Konvertierung nutzt Disk-Eingabe- und -Ausgabepfade auf dem Host, ohne Browser-Konvertierungsengine oder Font-RPC.

Die [Host-Provider-Konfiguration](../../packages/document/office-to-pdf/README.md#use-this-package) besitzt Nebenläufigkeit, Deadlines, Ein-/Ausgabegrenzen, Archivgrenzen, Bildauflösung und Schriftzugriff. Native/WASM-Implementierung und Asset-Verteilung gehören zum Kit-Workspace. Die Entdeckung von System-LibreOffice, Engine-Downloads zur Laufzeit, persistentes PDF-Caching und modellzugewandtes Rendering liegen außerhalb dieses Providers.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generiert aus dem Quellcode durch `scripts/gen-cordis-catalog.ts` (per `pnpm run verify-cordis-catalog` in doc-sync auf Aktualität geprüft; Neugenerierung mit `pnpm run gen-cordis-catalog`) — die Sprachseiten unterscheiden sich nur in lokalspezifischen gepaarten Dokumentpfaden. Signaturblöcke verwenden einen `ts cordis-catalog`-Fence und behalten das ursprüngliche Quell-JSDoc; Dispatch-Modi sind im [primer](../cordis-primer.md#dispatch-modes) definiert, und die vom Framework geerbte `ctx`-API liegt in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxofficetopdf--officetopdf"></a>

### `ctx.officeToPdf` — `OfficeToPdf`

Eine Provider-Lebensdauer besitzt alle Konverter, eingereihten Aufrufe und temporären Dateien.

```ts cordis-catalog
/**
 * Convert Office bytes without modifying the source or writing Session events.
 * @param request - authorized metadata and deferred bounded source read.
 * @param signal - caller cancellation; provider disposal also stops active work.
 * @returns caller-owned PDF bytes after conversion and scratch cleanup settle; canceled readers reject independently.
 * @throws {OfficeToPdfError} Invalid input, unusable output, or engine failure; cancellation rejects with its reason.
 */
convert(request: OfficeToPdfRequest, signal?: AbortSignal): Promise<OfficeToPdfResult>

/**
 * Read and convert one Office file using the Session's ordinary filesystem authorization.
 * @param workspaceFileScope - Session header lookup shared with workspaceFiles.
 * @param path - absolute or workspace-relative Office path.
 * @param priority - foreground preview or speculative background work.
 * @param signal - Remote cancellation; disposal also cancels outstanding reads and conversions.
 * @returns complete PDF bytes with original source identity and missing font families.
 */
@Remote async render( workspaceFileScope: WorkspaceFileScope, path: string, priority: OfficeToPdfPriority, signal: AbortSignal, ): Promise<RenderedDocumentBytes>

/**
 * Read the current rendering generation before reusing a Client PDF.
 * @param signal - Remote caller cancellation.
 * @returns provider lifetime, replaced with rendering, font, or engine configuration.
 */
@Remote('generation') getGeneration(signal: AbortSignal): OfficeToPdfGeneration
```

Quelle: [`packages/document/office-to-pdf/src/index.ts`](../../packages/document/office-to-pdf/src/index.ts)
<!-- END GENERATED cordis-surface -->
