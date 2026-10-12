---
description: "Retrospektive Session-Persistenztypen und Änderungen benachbarter Releases für dsh-v0.1.1-rc.1."
kind: persistence-release
---

# Persistenz-Release: dsh-v0.1.1-rc.1

English | [中文](dsh-v0.1.1-rc.1.zh.md)

## Zusammenfassung

`permission/preset` erhält ein optionales `origin` mit den Werten default, selection und inferred. Das Writer-Format bleibt 0.

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
| Quell-Tag | `dsh-v0.1.1-rc.1` |
| Quelldatum | 2026-08-21T06:21:44.000Z |
| Release-Aufzeichnung | Release-Objekt vorhanden. |
| Vorheriges Release | [dsh-v0.1.0-rc.8](dsh-v0.1.0-rc.8.md) |
| Writer-Version der Session | 0 |
| Rekonstruiertes Inventar | <!-- persistence-release-inventory:start -->51 Wurzeln / 407 Typen<!-- persistence-release-inventory:end --> |
| Dieser Snapshot | [dsh-v0.1.1-rc.1.schema.json](dsh-v0.1.1-rc.1.schema.json) |

Quellbeleg für die Writer-Versionskonstante an diesem Tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Deklaration

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.1.1-rc.1
previous: dsh-v0.1.0-rc.8
sessionFormatVersion: 0
changes:
  - root: event:permission/preset
    before: 5c45bf4c544a7211dcd8ba6ba7e5f1bc39b49e7a9df9d5cbdc8e87c22771b37b
    after: 7271e4b771406aaf06014c2269edd6cb68055bb8b8686571730813ce0ababc22
```

<a id="changes"></a>
## Strukturelle Änderungen

<!-- persistence-release-changes:start -->

1 geänderte Wurzel und 1 strukturelle Abweichung erkannt. Die untenstehende Review-Anforderung wird nur zum Vergleich nach aktuellen Regeln berechnet; sie behauptet keine historische Konformität, Migrationskorrektheit oder Laufzeitkompatibilität.

| Pfad | Änderung | Review-Anforderung |
|---|---|---|
| `event:permission/preset.data.origin` | `optional-property-added` | `not-required` |

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
