---
description: "Retrospektive Session-Persistenztypen und Änderungen benachbarter Releases für dsh-v0.1.1-rc.2."
kind: persistence-release
---

# Persistenz-Release: dsh-v0.1.1-rc.2

English | [中文](dsh-v0.1.1-rc.2.zh.md)

## Zusammenfassung

`permission/preset` entfernt `origin`, während Attachment-Aufzeichnungen ein optionales `originalDimensions` über die Message- und Tool-Payloads hinweg erhalten, die darauf verweisen. Das Writer-Format bleibt 0.

## Inhaltsverzeichnis

- [Release-Belege](#evidence)
- [Deklaration](#declaration)
- [Strukturelle Änderungen](#changes)
- [Verifikation](#verification)
- [Dev Note](#dev-note)

-----

<a id="evidence"></a>
## Release-Belege

Diese ungefähre Nachtragung unterstützt das Nachlesen und die Formatvalidierung; sie ist keine zeitgleiche Kompatibilitätsbestätigung. Extraktions- und Abdeckungsgrenzen finden Sie in der [Archivreferenz](README.md).

| Element | Aufgezeichneter Wert |
|---|---|
| Quell-Tag | `dsh-v0.1.1-rc.2` |
| Quelldatum | 2026-08-21T12:03:37.000Z |
| Release-Aufzeichnung | Release-Objekt vorhanden. |
| Vorheriges Release | [dsh-v0.1.1-rc.1](dsh-v0.1.1-rc.1.md) |
| Writer-Version der Session | 0 |
| Rekonstruiertes Inventar | <!-- persistence-release-inventory:start -->51 Wurzeln / 404 Typen<!-- persistence-release-inventory:end --> |
| Dieser Snapshot | [dsh-v0.1.1-rc.2.schema.json](dsh-v0.1.1-rc.2.schema.json) |

Quellbeleg für die Writer-Versionskonstante an diesem Tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Deklaration

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.1.1-rc.2
previous: dsh-v0.1.1-rc.1
sessionFormatVersion: 0
changes:
  - root: event:agent/inbox/spliced
    before: 7a0b347ba6a465a7813490036bde98bdc658609c6de9545ba58be26c372c5030
    after: 402ee62cd1447d03340e206138fb107d865a3452ea73c15c22fb6bc48fdf181a
  - root: event:assistant/chunk
    before: de04e4ae000cc4422a15fb86dce7c398c8a9970ac963b6f7f785e2276a939e62
    after: 51045f351a56e61da8be1dd5bba8080ac5e8ac2ff3d62a308a7f3e710b7cb18b
  - root: event:assistant/message
    before: fb7d974e1945b4c8e72ee540daf64eb9e81984030ff52e1a97a4e1f71b9dd2f9
    after: 395d04e6fd6f40eae4099cfaf3793fb710cee646fac53378433bc2d74bebd386
  - root: event:compaction/summary
    before: 67c53a0cdc70f8330a84b9a16481bc6cc45e23d1ae8041485a0b0453c11fc9aa
    after: 80316c3b92f42f246ab57d649dc546a8adeb11b96db3b11361ea32709b6bdc35
  - root: event:permission/preset
    before: 7271e4b771406aaf06014c2269edd6cb68055bb8b8686571730813ce0ababc22
    after: 5c45bf4c544a7211dcd8ba6ba7e5f1bc39b49e7a9df9d5cbdc8e87c22771b37b
  - root: event:session/title-llm-request
    before: ee6c879669bb83325e4cd3011227f238bf51765744990fc4bb12089d6dd6563a
    after: 9d5c0dabeec05f0ba9edd8ca24754de13dc2d3af5c302ff44eda04fb1a602257
  - root: event:team/message/queued
    before: 577054184d5f038bd96d6db70b76983a2bb62a8eea8eeed8ca3b0d47af0f462a
    after: a6a26c92459c96e4f342e58d7e41c71956e7e62c9280e30e260df58409a3012c
  - root: event:tool/code-dispatch
    before: c39526f02abfb7a3b47a7e4f12da2125d4025bf588286e16a0d22baedbb1a83b
    after: c14c2fdd439461cfc85105c6f620b0f62f799e3a69fb48196e938ec045aa0390
  - root: event:tool/result
    before: 3b8a618295a9388a612e8de2e0997c6e59d0e82d034419317bf616a496ae593c
    after: a79feb023a08a8b73d254e29e78f13045b6773ce377b0c4156fcdf1368c146ab
  - root: event:user/message
    before: e7eec68e39f9f44b2e53d799e5d5dd08f559558a27e93eb2a272782f040be50a
    after: 70a39b3639ca6c2eeabf1e2c8ef4cbc23e24c947e72bf0c28754e7c2f713be26
```

<a id="changes"></a>
## Strukturelle Änderungen

<!-- persistence-release-changes:start -->

10 geänderte Wurzeln und 11 strukturelle Abweichungen erkannt. Die untenstehende Review-Anforderung wird nur zum Vergleich nach aktuellen Regeln berechnet; sie behauptet keine historische Konformität, Migrationskorrektheit oder Laufzeitkompatibilität.

| Pfad | Änderung | Review-Anforderung |
|---|---|---|
| `event:agent/inbox/spliced.data.inserted[].content[].attachment.originalDimensions` | `optional-property-added` | `not-required` |
| `event:assistant/chunk.data.chunk.block.attachment.originalDimensions` | `optional-property-added` | `not-required` |
| `event:assistant/message.data.message.content[].attachment.originalDimensions` | `optional-property-added` | `not-required` |
| `event:compaction/summary.data.rawOutput[].attachment.originalDimensions` | `optional-property-added` | `not-required` |
| `event:compaction/summary.data.summary[].attachment.originalDimensions` | `optional-property-added` | `not-required` |
| `event:permission/preset.data.origin` | `property-removed` | `review-required` |
| `event:session/title-llm-request.data.messages[].content[].attachment.originalDimensions` | `optional-property-added` | `not-required` |
| `event:team/message/queued.data.message.content[].attachment.originalDimensions` | `optional-property-added` | `not-required` |
| `event:tool/code-dispatch.data.content[].attachment.originalDimensions` | `optional-property-added` | `not-required` |
| `event:tool/result.data.message.content[0].content[].attachment.originalDimensions` | `optional-property-added` | `not-required` |
| `event:user/message.data.content[].attachment.originalDimensions` | `optional-property-added` | `not-required` |

<!-- persistence-release-changes:end -->

<a id="verification"></a>
## Verifikation

Die Extraktion hat die Validierung von kanonischem Graph, Wurzel-Digest und Digest erreichbarer Typen bestanden und lässt das ursprüngliche optionale `surfaceOp` nur für historische Surface-Events zu. Die Prüfung im Baum rekonstruiert jeden Tag aus seinem Vorgänger und verifiziert Vorher-/Nachher-Werte, Snapshot-Abdeckung und zweisprachige maschinelle Deklarationen.

```sh
pnpm run verify-persistence-releases
```

<a id="dev-note"></a>
## Dev Note

Keine.
