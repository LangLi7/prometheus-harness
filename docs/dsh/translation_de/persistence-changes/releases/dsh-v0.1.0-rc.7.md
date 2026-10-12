---
description: "Retrospektive Session-Persistenztypen und Änderungen benachbarter Releases für dsh-v0.1.0-rc.7."
kind: persistence-release
---

# Persistenz-Release: dsh-v0.1.0-rc.7

English | [中文](dsh-v0.1.0-rc.7.zh.md)

## Zusammenfassung

`assistant/chunk` `replayState` ändert sich von unknown zu einem Objekt mit erforderlicher `response` und optionalen `blocks`. Das Writer-Format bleibt 0.

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
| Quell-Tag | `dsh-v0.1.0-rc.7` |
| Quelldatum | 2026-08-17T11:03:17.000Z |
| Release-Aufzeichnung | Release-Objekt vorhanden. |
| Vorheriges Release | [dsh-v0.1.0-rc.6](dsh-v0.1.0-rc.6.md) |
| Writer-Version der Session | 0 |
| Rekonstruiertes Inventar | <!-- persistence-release-inventory:start -->47 Wurzeln / 376 Typen<!-- persistence-release-inventory:end --> |
| Dieser Snapshot | [dsh-v0.1.0-rc.7.schema.json](dsh-v0.1.0-rc.7.schema.json) |

Quellbeleg für die Writer-Versionskonstante an diesem Tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Deklaration

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.1.0-rc.7
previous: dsh-v0.1.0-rc.6
sessionFormatVersion: 0
changes:
  - root: event:assistant/chunk
    before: 7fd942b2189b8dbf6e1a2c7b026e9ddd1e7dba3fbe5645708a76f4cddabb281d
    after: de04e4ae000cc4422a15fb86dce7c398c8a9970ac963b6f7f785e2276a939e62
```

<a id="changes"></a>
## Strukturelle Änderungen

<!-- persistence-release-changes:start -->

1 geänderte Wurzel und 1 strukturelle Abweichung erkannt. Die untenstehende Review-Anforderung wird nur zum Vergleich nach aktuellen Regeln berechnet; sie behauptet keine historische Konformität, Migrationskorrektheit oder Laufzeitkompatibilität.

| Pfad | Änderung | Review-Anforderung |
|---|---|---|
| `event:assistant/chunk.data.chunk.replayState` | `type-changed` | `review-required` |

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
