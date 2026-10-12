---
description: "Retrospektive Session-Persistenztypen und Änderungen benachbarter Releases für dsh-v0.1.0-rc.8."
kind: persistence-release
---

# Persistenz-Release: dsh-v0.1.0-rc.8

English | [中文](dsh-v0.1.0-rc.8.zh.md)

## Zusammenfassung

Vier `team/*`-Events und die Quellvariante team-message der User-Message kommen hinzu; `assistant/message` erhält ein optionales `interrupted`. Das Writer-Format bleibt 0.

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
| Quell-Tag | `dsh-v0.1.0-rc.8` |
| Quelldatum | 2026-08-19T15:11:50.000Z |
| Release-Aufzeichnung | Release-Objekt vorhanden. |
| Vorheriges Release | [dsh-v0.1.0-rc.7](dsh-v0.1.0-rc.7.md) |
| Writer-Version der Session | 0 |
| Rekonstruiertes Inventar | <!-- persistence-release-inventory:start -->51 Wurzeln / 403 Typen<!-- persistence-release-inventory:end --> |
| Dieser Snapshot | [dsh-v0.1.0-rc.8.schema.json](dsh-v0.1.0-rc.8.schema.json) |

Quellbeleg für die Writer-Versionskonstante an diesem Tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Deklaration

```yaml persistence-release
schemaVersion: 1
tag: dsh-v0.1.0-rc.8
previous: dsh-v0.1.0-rc.7
sessionFormatVersion: 0
changes:
  - root: event:agent/inbox/spliced
    before: dea3a1d5640e0306a486f92b725a01b57e69439277978ca09dc246fb40016b90
    after: 7a0b347ba6a465a7813490036bde98bdc658609c6de9545ba58be26c372c5030
  - root: event:assistant/message
    before: 390aeb83383643633a1935f09f84fe19d2aee8d4f500a8de70f88d388562cc50
    after: fb7d974e1945b4c8e72ee540daf64eb9e81984030ff52e1a97a4e1f71b9dd2f9
  - root: event:session/title-llm-request
    before: 796a77af2c1452392f0cc62b99fba2d404d1c9eb10a8a2510a808fba6053cf24
    after: ee6c879669bb83325e4cd3011227f238bf51765744990fc4bb12089d6dd6563a
  - root: event:team/member
    before: null
    after: 31d13edbb5fe2f8b7a38056320a8a06275ee4426e0abf12d4741818beda5a9c9
  - root: event:team/message/delivered
    before: null
    after: c53bff743470c8bf11be698ced047072744ef088cce663a774b456d7a8982516
  - root: event:team/message/queued
    before: null
    after: 577054184d5f038bd96d6db70b76983a2bb62a8eea8eeed8ca3b0d47af0f462a
  - root: event:team/task
    before: null
    after: 1688a2451eef9da19eaf45f12c8a27df07b1a6e56fa57ba603118f5201bb435b
  - root: event:user/message
    before: 18c8d77777545808f232cd8d7730ce270cb1b737edd3eaa45e0da9436fd37a13
    after: e7eec68e39f9f44b2e53d799e5d5dd08f559558a27e93eb2a272782f040be50a
```

<a id="changes"></a>
## Strukturelle Änderungen

<!-- persistence-release-changes:start -->

8 geänderte Wurzeln und 8 strukturelle Abweichungen erkannt. Die untenstehende Review-Anforderung wird nur zum Vergleich nach aktuellen Regeln berechnet; sie behauptet keine historische Konformität, Migrationskorrektheit oder Laufzeitkompatibilität.

| Pfad | Änderung | Review-Anforderung |
|---|---|---|
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `review-required` |
| `event:assistant/message.data.interrupted` | `optional-property-added` | `not-required` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `review-required` |
| `event:team/member` | `root-added` | `not-required` |
| `event:team/message/delivered` | `root-added` | `not-required` |
| `event:team/message/queued` | `root-added` | `not-required` |
| `event:team/task` | `root-added` | `not-required` |
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
