---
description: "Retrospektive Session-Persistenztypen und Änderungen benachbarter Releases für dsh-v0.1.2-alpha.4."
kind: persistence-release
---

# Persistenz-Release: dsh-v0.1.2-alpha.4

English | [中文](dsh-v0.1.2-alpha.4.zh.md)

## Zusammenfassung

Der logische SessionHeader ersetzt das optionale `seedLength` durch das erforderliche `isSeeded`, während der physische JSONL-Header weiterhin `seedLength` deklariert. Die Quellvarianten subagent-report und coordinator der User-Message werden zu agent-message. Das Writer-Format bleibt 0.

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
| Quell-Tag | `dsh-v0.1.2-alpha.4` |
| Quelldatum | 2026-09-01T15:37:26.000Z |
| Release-Aufzeichnung | Release-Objekt vorhanden. |
| Vorheriges Release | [dsh-v0.1.2-alpha.3](dsh-v0.1.2-alpha.3.md) |
| Writer-Version der Session | 0 |
| Rekonstruiertes Inventar | <!-- persistence-release-inventory:start -->54 Wurzeln / 415 Typen<!-- persistence-release-inventory:end --> |
| Dieser Snapshot | [dsh-v0.1.2-alpha.4.schema.json](dsh-v0.1.2-alpha.4.schema.json) |

Quellbeleg für die Writer-Versionskonstante an diesem Tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Deklaration

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.1.2-alpha.4
previous: dsh-v0.1.2-alpha.3
sessionFormatVersion: 0
changes:
  - root: SessionHeader
    before: a50373168c4935222b1681223d919a56d095ce37ad45c5ba2c20d75235adf937
    after: 001ed6f66d67fac9cb9594b55f13557db94174fe5d5954789bb5a2d6d5927226
  - root: event:agent/inbox/spliced
    before: ee796690277eafbcda4437478de7a8f01d983424d6238fe472df9b3b0d97a89f
    after: 15cdff6391d58ea00d7e2fe113b663d5479cbb3fd1af26717ad933c770bca081
  - root: event:session/title-llm-request
    before: 61651f4ca07ab9ebef773d82fafbcb74d39190a255c69ecc36084046123a9cb4
    after: 2cfb71f7819bc88a6bccbffa8b7ae5664233af6f6e1dfb068db25e2e17ddd8c7
  - root: event:user/message
    before: e23368db1646a9ac10d2bd4629084fdff583a1db2c83ffaa3f2f201d0c45f3e4
    after: e950c87ba49bd8175b8a670b319a599d5ed14cde996540d5ba91a141fad68781
```

<a id="changes"></a>
## Strukturelle Änderungen

<!-- persistence-release-changes:start -->

4 geänderte Wurzeln und 5 strukturelle Abweichungen erkannt. Die untenstehende Review-Anforderung wird nur zum Vergleich nach aktuellen Regeln berechnet; sie behauptet keine historische Konformität, Migrationskorrektheit oder Laufzeitkompatibilität.

| Pfad | Änderung | Review-Anforderung |
|---|---|---|
| `SessionHeader.seedLength` | `property-removed` | `review-required` |
| `SessionHeader.isSeeded` | `required-property-added` | `review-required` |
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `review-required` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `review-required` |
| `event:user/message.data.source` | `union-variants-changed` | `review-required` |

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
