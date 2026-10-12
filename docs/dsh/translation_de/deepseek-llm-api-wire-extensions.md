# Offizielle Wire-Erweiterungen der DeepSeek-LLM-API

English | [中文](deepseek-llm-api-wire-extensions.zh.md)

Diese Referenz definiert jeden DeepSeek-Harness-spezifischen HTTP-Header und jedes additive JSON-Feld, das [`@deepseek-ai/dsh-llm-deepseek`](../packages/llm/llm-deepseek/README.md) bei `deepseek-official`-Messages-Requests sendet. Sie definiert keine Felder neu, die der Upstream-DeepSeek-API gehören. Die providerneutrale LLM-Schnittstelle und `llm-pi-ai` implementieren diese Zusätze nicht.

Der Adapter sendet die Zusätze an seine aufgelöste `baseURL`, einschließlich eines konfigurierten Gateway. Sie bleiben außerhalb von `messages`, System-Prompts und Tool-Schemas, sodass sie keine Model-Input-Tokens hinzufügen und das model-sichtbare Präfix nicht ändern.

## Wire-Namespaces und Versionierung

| Ort | Namensgebung | Beispiele |
|---|---|---|
| HTTP-Feldnamen | kleingeschriebenes Kebab-Case; HTTP-Matching bleibt case-insensitiv | `user-agent`, `x-deepseek-harness-session-id` |
| Extension-Felder im DeepSeek-Request-Body | Snake Case mit reserviertem Präfix `dsh_` | `dsh_plugin_packages`, `dsh_session_log` |
| DSH-eigene verschachtelte JSON-Member | Camel Case | `afterSeq`, `throughSeq`, `sessionId` |
| Tagged Values | Kebab-Case-Strings; dauerhafte Events verwenden `domain/action` | `session-log-deepseek/delivery-accepted` |

Jede Body-Extension besitzt ihre `version` unabhängig. Eine Version gilt nur für das Objekt, das sie enthält; es besteht keine Kompatibilitäts- oder Reihenfolgebeziehung zwischen Versionen verschiedener Felder. Die Reihenfolge der JSON-Member ist nicht Teil des Protokolls.

Die [`DeepSeekLlmApiExtensionRegistry`](../packages/llm/deepseek-llm-api-extensions/README.md) reserviert einen Provider pro Top-Level-Extension-Namen. Leere oder mit Whitespace aufgefüllte Namen, doppelte Registrierungen und Kollisionen mit dem Base-DeepSeek-Request schlagen vor dem HTTP-Dispatch fehl.

## Request-Header

| Header | Vorhandensein | Wert |
|---|---|---|
| `user-agent` | Jeder HTTP-Request des Providers, einschließlich Files-API-Operationen | Anwendungsidentität in der Form `product/version (+url)`; das Standardprodukt ist `deepseek-harness` |
| `x-deepseek-harness-user-id` | Jeder autorisierte Model-Request | Die stabile anonyme UUID für das aufgelöste Harness-Home |
| `x-deepseek-harness-session-id` | Model-Requests, die eine Session-Id tragen | Der exakte `sessionId`-String des Requests |
| `x-deepseek-harness-compact` | Model-Requests, deren Purpose `compaction` ist | Der literale String `1` |

Ein Credential-Fehler tritt vor der Auflösung der anonymen User-Id auf, sodass ein nicht autorisierter Request diese Header weder sendet noch die Identitätsdatei anlegt. Ein direkter Request ohne Session lässt `x-deepseek-harness-session-id` weg. Session-Titel-Requests haben keinen zusätzlichen Purpose-Header; die gewöhnliche Session-Id-Regel gilt weiterhin, wenn einer eine `sessionId` trägt.

## Body-Extension-Transaktion

Der Adapter serialisiert den vollständigen Base-Body, einschließlich der exakten `messages`, bevor er registrierte Provider bittet, Felder vorzubereiten. Ein Provider erhält diesen unveränderlichen Body, das Cancellation-Signal des Requests sowie optional `sessionId` und den `purpose` des Hilfsaufrufs. Die Rückgabe von `undefined` lässt das Feld dieses Providers für den Request weg.

Vorbereitete JSON-Werte werden vom Provider-eigenen State abgelöst, als Top-Level-Geschwister der Base-Felder zusammengeführt und im selben HTTP-Body serialisiert. Ein Beitragender, dessen Vorbereitung fehlschlägt, wird aus diesem Request weggelassen, wobei nur sein erster Fehler geloggt wird, während die anderen Felder weiterhin gesendet werden; ein Feld, das mit einem Base-Feld kollidiert, verhindert den Request. Wenn der zusammengeführte Body nicht serialisiert werden kann, sendet der Adapter den Base-Body ohne Extension-Feld, überspringt die Acceptance-Transaktion, damit Beitragende ihren State bei einem späteren Request erneut senden, und loggt die weggelassenen Feldnamen. Eine Komposition ohne die Registry sendet den unerweiterten Base-Body.

Nachdem der konfigurierte Endpunkt HTTP 2xx zurückgegeben hat, führt der Adapter die vorbereitete `accept()`-Transaktion aus, bevor er den SSE-Response-Body liest. Transportfehler und Nicht-2xx-Responses akzeptieren keinen Beitrag. Ein Acceptance-Fehler wird geloggt und lässt den Model-Request nicht fehlschlagen; der Beitragende sendet seinen nicht akzeptierten State bei einem späteren Request erneut. Acceptance zeichnet HTTP-Erfolg auf Endpunkt-Ebene auf; es behauptet nicht, dass ein SSE-Stream abgeschlossen wurde oder dass der Endpunkt eine Extension persistiert hat.

## `dsh_plugin_packages`

[`@deepseek-ai/dsh-plugin-package-inventory-deepseek`](../packages/llm/plugin-package-inventory-deepseek/README.md) steuert das vollständige Inventar aktiver Loader-gestützter Plugin-Pakete bei. Das Feld ist standardmäßig aktiviert.

```json
{
  "dsh_plugin_packages": {
    "version": 1,
    "packages": [
      {
        "name": "@deepseek-ai/dsh-example",
        "version": "0.1.1-rc.2"
      }
    ]
  }
}
```

| Member | Typ | Bedeutung |
|---|---|---|
| `version` | `1` | Schema-Version für `dsh_plugin_packages` |
| `packages` | Array | Vollständige aktive Menge für diesen Request |
| `packages[].name` | String | Exakter, nicht leerer npm-Paketname aus dem besitzenden Manifest |
| `packages[].version` | optionaler String | Exakte, nicht leere Paketversion aus demselben Manifest; fehlt, wenn nicht verfügbar |

Jeder Request liest aktive Nicht-Gruppen-Loader-Einträge aus dem Host-Baum erneut ein und, sofern für die Request-Session verfügbar, deren bestehenden Agent-Preset-Baum. Relative und absolute Module verwenden ihr nächstgelegenes besitzendes Manifest; Bare-Package-Einträge folgen der Loader-Auflösungsbasis, die sie aktiviert hat. Ein benanntes Manifest ohne nicht-leeren String als Version steuert `{ name }` bei, unabhängig von `private`. Fehlende Namen und unlesbare Manifeste lassen nur die betroffenen Einträge weg; Paket-Metadaten blockieren keine Requests.

Der Sender dedupliziert exakte Paare `(name, optionale version)` und sortiert zuerst nach `name`, dann nach `version`, mit einem locale-unabhängigen Textvergleich und fehlenden Versionen zuerst. Gleichzeitig aktive Versionen eines Pakets bleiben getrennte Einträge, einschließlich eines Eintrags nur mit Namen. Empfänger müssen fehlende Versionen akzeptieren, dürfen das Array nicht nach Paketnamen kollabieren und dürfen aus der Array-Reihenfolge keine Paketaktivierung ableiten.

Deaktivierte, ausstehende, fehlgeschlagene, entladende, entsorgte und strukturelle Loader-Einträge fehlen. Gewöhnliche Abhängigkeiten, lose Module ohne benanntes besitzendes Paket, programmatisch gemountete Child-Fibers und dynamische In-Memory-Plugins fehlen ebenfalls, weil sie keine maßgebliche Loader-gestützte Paketidentität haben.

Ein aktiviertes Inventar ohne qualifizierende Einträge sendet `packages: []`; das Deaktivieren des Beitragenden lässt das gesamte Feld `dsh_plugin_packages` weg. Paketidentitäten sind Provider-Metadaten und gehen nie in den Model-Input ein.

## `dsh_session_log`

[`@deepseek-ai/dsh-session-log-deepseek`](../packages/session/session-log-deepseek/README.md) steuert ein zusammenhängendes Suffix des kanonischen Session-Logs bei. Das Feld ist standardmäßig aktiviert. Es gilt für einen Request mit einer Live-Session und mindestens einem Event; ein direkter Request, eine veraltete Session-Id oder ein leeres Log lassen das Feld weg, ebenso ein Request, dessen erstes ausstehendes Event allein `maxBytes` überschreitet oder nicht serialisiert werden kann; eine Komposition deaktiviert es mit `enabled: false`. Die Beispiele unten verwenden das logische Session-Format 2 nur zur Veranschaulichung der Wire-Felder; sie benennen nicht das [aktuelle Writer-Format](session-format-status.md).

```json
{
  "dsh_session_log": {
    "version": 1,
    "sessionFormatVersion": 2,
    "session": {
      "version": 2,
      "id": "session-id",
      "createdAt": 1780000000000
    },
    "afterSeq": -1,
    "throughSeq": 0,
    "events": [
      {
        "type": "turn/start",
        "seq": 0,
        "time": 1780000000001,
        "data": {
          "turn": 1
        }
      }
    ]
  }
}
```

| Member | Typ | Bedeutung |
|---|---|---|
| `version` | `1` | Schema-Version für `dsh_session_log` |
| `sessionFormatVersion` | nicht-negative Ganzzahl | Session-Format-Generation, die dieses Suffix darstellt |
| `session` | Objekt | Unveränderliche Wire-Projektion des aktuellen Session-Headers |
| `afterSeq` | Ganzzahl | Größte Sequenz, die vor diesem Request als akzeptiert aufgezeichnet wurde, oder `-1` |
| `throughSeq` | nicht-negative Ganzzahl | Größte durch diesen Request dargestellte Sequenz |
| `events` | Array | Zusammenhängende Events von `afterSeq + 1` bis `throughSeq` |

Der erste Upload verwendet `afterSeq: -1`, und jeder spätere Upload beginnt nach dem größten akzeptierten Watermark für dieselbe Session-Id. Jeder Upload trägt den längsten zusammenhängenden Lauf ab diesem Punkt, dessen serialisiertes Feld in `maxBytes` passt — standardmäßig 8 MiB, gezählt in UTF-8-Bytes einschließlich Header und numerischer Felder —, sodass ein Backlog über dem Limit mehrere akzeptierte Requests umfasst. Der Sender erstellt den Snapshot des Event-Arrays einmal pro Request; Appends nach diesem Snapshot gehören zu einem späteren Request.

### Wire-Session-Header

Das Member `session` projiziert logische Session-Metadaten auf rohe JSON-Primitives. Eine geseedete Session sendet ihren exakten `Session.inheritedEventCount` als `seedLength`; eine nicht geseedete Session lässt dieses Feld weg. Das logische Flag `isSeeded` erscheint nicht auf dieser Wire. Das äußere `dsh_session_log.version` wählt dieses Extension-Schema, während `session.version` das logische Session-Format wählt. Eine Änderung der Session-Header-Projektion erfordert ein Anheben der Extension-Schema-Version, selbst wenn sich auch das eingebettete logische Format ändert.

| Member | Vorhandensein | Bedeutung |
|---|---|---|
| `version` | erforderlich | Logische Session-Format-Version aus `Session.header`; siehe [Format-Status](session-format-status.md) |
| `id` | erforderlich | Exakte Session-Id |
| `createdAt` | erforderlich | Nicht-negative Safe-Integer-Unix-Epoch-Millisekunden |
| `cwd` | optional | Absolutes Arbeitsverzeichnis, das bei der Session-Erstellung aufgezeichnet wurde |
| `parentSession` | optional | Parent-Session-Id für einen Fork |
| `seedLength` | nur geseedete Sessions | Exakte Anzahl geerbter Events, einschließlich null für ein leeres geerbtes Präfix |
| `origin` | optional | Literal `subagent` für ein Subagent-Kind |
| `delegationDepth` | optional | Nicht-negative persistierte Subagent-Delegationstiefe |
| `agentPreset` | optional | Agent-Preset-Id, die zum Komponieren dieser Session verwendet wurde |

### Kanonische Event-Envelopes

Jedes Element in `events` trägt ein kanonisches Event als rohe JSON-Primitives, unabhängig von jedem anderen Request-Feld. Jedes Event enthält `type`, die numerische `seq`, `time` und `data`, wobei `ignorable: true` erhalten bleibt, wenn es vorhanden ist. Surface-Events erfordern `surfaceOp`; Ersetzungsbereiche verwenden numerisches `startSeq` und `endSeq`, und System-, User- und Tool-Events dürfen zusätzlich numerische `sourceEventSeqs` tragen. Assistant-Provider-Metadaten bleiben in ihrem eingebetteten Stream. Bekannte log-only-Events lassen Surface-Metadaten weg; wiederhergestellte unbekannte ignorierbare Records bewahren opake Metadaten, ohne sie als Surface-Operation zu behandeln.

### Acceptance-Watermark und At-least-once-Zustellung

Nachdem der Endpunkt HTTP 2xx zurückgegeben hat, hängt der Beitrag dieses kanonische Event an dieselbe Session an:

```json
{
  "type": "session-log-deepseek/delivery-accepted",
  "seq": 8,
  "time": 1780000000002,
  "data": {
    "sessionId": "session-id",
    "sessionFormatVersion": 2,
    "throughSeq": 7
  }
}
```

`delivery-accepted` bedeutet, dass der konfigurierte Endpunkt HTTP 2xx für den enthaltenden LLM-Request zurückgegeben hat. Es behauptet weder SSE-Abschluss noch Remote-Persistenz. Das `throughSeq` des Events muss ein früheres Event benennen, seine `sessionId` benennt die Session, deren Suffix gesendet wurde, und `sessionFormatVersion` bindet das Watermark an genau diese logische Generation. Abwesenheit bedeutet historisches Format v0.

Der Sender faltet das größte passende `throughSeq` für die aktuelle Session-Id und Format-Generation, sodass nebenläufig akzeptierte Requests den Cursor nicht rückwärts bewegen können und ein Watermark aus einer anderen Generation das aktuelle Suffix nicht autorisieren kann. Ein fortgesetzter Prozess baut den Cursor aus dem dauerhaften Log neu auf. Ein Fork ignoriert geerbte Watermarks, die eine andere Session benennen, und lädt daher sein eigenes geerbtes Präfix ab Sequenz null hoch, in durch `maxBytes` begrenzten Requests, bevor er unter der Child-Id voranschreitet. Das Watermark-Event selbst gehört zum nächsten ungesendeten Suffix.

Transportfehler, Nicht-2xx-Responses und Requests, die nach einem Serialisierungsfehler ohne Extension-Felder gesendet werden, hängen kein Watermark an. Ein Absturz nach der Endpunkt-Acceptance, aber vor der lokalen Persistenz kann einen bereits akzeptierten Bereich erneut senden; Unsicherheit erzeugt Duplikate, nie eine Sequenzlücke. Es gibt keinen unabhängigen Upload-Store und keinen Truncation-Pfad; stattdessen begrenzt `maxBytes` das Feld jedes Requests.

## Exposition und Anforderungen an Empfänger

Die Request-Header exponieren die Harness-Anwendungsversion, eine anonyme Harness-Home-Identität und eine optionale Session-Identität. `dsh_plugin_packages` exponiert aktive npm-Paketnamen und -Versionen. Sofern eine Komposition es nicht deaktiviert, kann `dsh_session_log` das Session-Arbeitsverzeichnis, System-Prompt-Snapshots, User- und Assistant-Inhalt, eingebettete Assistant-Streams, Ausgaben fehlgeschlagener Versuche, Tool-Argumente und -Results, Compaction-Summaries, Feedback und Plugin-eigene Events exponieren. Adapter-API-Keys sind keine Session-Events und gehen daher nicht in das Feld ein. Ein über `baseURL` ausgewähltes Gateway erhält dieselben Werte wie der offizielle Endpunkt.

Empfänger adressieren Extension-Felder über ihren Namen, dispatchen jedes Feld nach seiner eigenen `version`, bewahren unterschiedliche Paketversionen und ignorieren die Reihenfolge der JSON-Member. Ein Session-Log-Empfänger validiert den zusammenhängenden Sequenzbereich, bevor er Event-Typen interpretiert. Ein nicht erkanntes kanonisches Event ohne `ignorable: true` verhindert eine verlustfreie Rekonstruktion. Der Base-Request bleibt ohne die Registry oder einen bestimmten Beitrag nutzbar; Feldabwesenheit bedeutet, dass dieser Beitrag für diesen Request nicht zutraf. Während ein Session-Log-Backlog abgearbeitet wird, bleibt `throughSeq` hinter dem neuesten Event der Session zurück, sodass ein 2xx nicht zeigt, dass der Empfänger das aktuelle Log besitzt.
