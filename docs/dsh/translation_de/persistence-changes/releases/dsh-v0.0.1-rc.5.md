---
description: "Retrospektive Session-Persistenztypen und Änderungen benachbarter Releases für dsh-v0.0.1-rc.5."
kind: persistence-release
---

# Persistenz-Release: dsh-v0.0.1-rc.5

English | [中文](dsh-v0.0.1-rc.5.zh.md)

## Zusammenfassung

Alle rekonstruierten Persistenz-Wurzel-Digests stimmen mit dem vorangehenden Alpha-/RC-Tag überein. Das Writer-Format bleibt 0.

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
| Quell-Tag | `dsh-v0.0.1-rc.5` |
| Quelldatum | 2026-08-12T21:30:37.000Z |
| Release-Aufzeichnung | Nur Tag; kein Release-Objekt. |
| Vorheriges Release | [dsh-v0.0.1-rc.4](dsh-v0.0.1-rc.4.md) |
| Writer-Version der Session | 0 |
| Rekonstruiertes Inventar | <!-- persistence-release-inventory:start -->47 Wurzeln / 374 Typen<!-- persistence-release-inventory:end --> |
| Dieser Snapshot | [dsh-v0.0.1-rc.5.schema.json](dsh-v0.0.1-rc.5.schema.json) |

Quellbeleg für die Writer-Versionskonstante an diesem Tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Deklaration

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.0.1-rc.5
previous: dsh-v0.0.1-rc.4
sessionFormatVersion: 0
changes: []
```

<a id="changes"></a>
## Strukturelle Änderungen

<!-- persistence-release-changes:start -->

Die normalisierten Wurzeltypen und ihre transitiven Digests sind gegenüber dem vorangehenden Tag unverändert.

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
