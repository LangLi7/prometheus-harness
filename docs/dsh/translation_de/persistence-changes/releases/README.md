---
description: "Persistenztyp-Änderungen der Session über jeden erfassten DSH-Alpha-/RC-Tag durchsuchen und die historischen Snapshots offline validieren."
---

# Persistenzänderungen über DSH-Prereleases hinweg

English | [中文](README.zh.md)

## Zusammenfassung

Dieses Archiv bietet eine ungefähre historische Sicht auf 26 DSH-Alpha-/RC-Tags und ihre 25 benachbarten Übergänge. Jedes Release enthält eine kurze Erläuterung, den Quell-Tag, Vorher-/Nachher-Digests und vollständige Snapshots der geänderten Typen zum Nachlesen und zur Formatvalidierung. Es belegt keine historische Laufzeitkompatibilität und ersetzt nicht die [Bestätigungen aus der aktuellen Quelle](../README.md).

## Inhaltsverzeichnis

- [Archivierte Releases](#releases)
- [Dateien und Geltungsbereich](#files)
- [Extraktion und Einschränkungen](#extraction)
- [Verifikation](#verification)
- [Dev Note](#dev-note)

-----

<a id="releases"></a>
## Archivierte Releases

Das [Manifest](manifest.json) zeichnet jeden am 2026-09-12 erfassten DSH-Alpha-/RC-Tag auf: 16 haben Release-Aufzeichnungen, und die frühesten 10 sind nur Tags. Einträge folgen der semantischen Versionsreihenfolge; fehlende Tags werden nicht erfunden. Der erste Eintrag legt den historischen Ausgangspunkt fest, daher umfasst seine Änderungszahl jede Wurzel.

<!-- persistence-release-index:start -->

| Tag | Quelldatum (UTC) | Session-Version | Wurzeln / Typen | Geänderte Wurzeln |
|---|---|---|---|---|
| [dsh-v0.0.1-rc.1](dsh-v0.0.1-rc.1.md) | 2026-08-10 | 0 | 42 / 341 | 42 |
| [dsh-v0.0.1-rc.2](dsh-v0.0.1-rc.2.md) | 2026-08-11 | 0 | 47 / 374 | 45 |
| [dsh-v0.0.1-rc.3](dsh-v0.0.1-rc.3.md) | 2026-08-12 | 0 | 47 / 374 | 12 |
| [dsh-v0.0.1-rc.4](dsh-v0.0.1-rc.4.md) | 2026-08-12 | 0 | 47 / 374 | 0 |
| [dsh-v0.0.1-rc.5](dsh-v0.0.1-rc.5.md) | 2026-08-12 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.1](dsh-v0.1.0-rc.1.md) | 2026-08-13 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.2](dsh-v0.1.0-rc.2.md) | 2026-08-13 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.3](dsh-v0.1.0-rc.3.md) | 2026-08-13 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.5](dsh-v0.1.0-rc.5.md) | 2026-08-13 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.6](dsh-v0.1.0-rc.6.md) | 2026-08-13 | 0 | 47 / 374 | 0 |
| [dsh-v0.1.0-rc.7](dsh-v0.1.0-rc.7.md) | 2026-08-17 | 0 | 47 / 376 | 1 |
| [dsh-v0.1.0-rc.8](dsh-v0.1.0-rc.8.md) | 2026-08-19 | 0 | 51 / 403 | 8 |
| [dsh-v0.1.1-rc.1](dsh-v0.1.1-rc.1.md) | 2026-08-21 | 0 | 51 / 407 | 1 |
| [dsh-v0.1.1-rc.2](dsh-v0.1.1-rc.2.md) | 2026-08-21 | 0 | 51 / 404 | 10 |
| [dsh-v0.1.2-alpha.1](dsh-v0.1.2-alpha.1.md) | 2026-08-27 | 0 | 54 / 417 | 52 |
| [dsh-v0.1.2-alpha.2](dsh-v0.1.2-alpha.2.md) | 2026-08-30 | 0 | 54 / 417 | 52 |
| [dsh-v0.1.2-alpha.3](dsh-v0.1.2-alpha.3.md) | 2026-08-31 | 0 | 54 / 417 | 0 |
| [dsh-v0.1.2-alpha.4](dsh-v0.1.2-alpha.4.md) | 2026-09-01 | 0 | 54 / 415 | 4 |
| [dsh-v0.1.2-alpha.5](dsh-v0.1.2-alpha.5.md) | 2026-09-02 | 0 | 54 / 415 | 0 |
| [dsh-v0.1.2-rc.1](dsh-v0.1.2-rc.1.md) | 2026-09-03 | 0 | 54 / 415 | 0 |
| [dsh-v0.1.3-alpha.1](dsh-v0.1.3-alpha.1.md) | 2026-09-04 | 2 | 54 / 425 | 17 |
| [dsh-v0.1.3-alpha.2](dsh-v0.1.3-alpha.2.md) | 2026-09-07 | 2 | 56 / 435 | 2 |
| [dsh-v0.1.5-alpha.1](dsh-v0.1.5-alpha.1.md) | 2026-09-08 | 3 | 57 / 443 | 12 |
| [dsh-v0.1.5-alpha.2](dsh-v0.1.5-alpha.2.md) | 2026-09-09 | 3 | 59 / 462 | 4 |
| [dsh-v0.1.5-rc.1](dsh-v0.1.5-rc.1.md) | 2026-09-10 | 3 | 59 / 462 | 0 |
| [dsh-v0.1.5-rc.2](dsh-v0.1.5-rc.2.md) | 2026-09-10 | 3 | 59 / 462 | 0 |

<!-- persistence-release-index:end -->

<a id="files"></a>
## Dateien und Geltungsbereich

Jeder Tag hat eine englische/chinesische Aufzeichnung mit `kind: persistence-release`, eine Paarungs-Sidecar und `.schema.json`. Seine maschinelle Deklaration enthält den Tag, den unmittelbaren Vorgänger, die beobachtete Writer-Version und den Vorher-/Nachher-Digest jeder geänderten Wurzel. Der erste Snapshot enthält jede Wurzel; spätere Snapshots behalten nur geänderte Wurzeln, die weiterhin vorhanden sind, und alle ihre erreichbaren Typen. Löschungen verwenden einen Nullwert als Nachher-Wert; unveränderte Releases behalten leere Änderungen und Snapshots.

Snapshots umfassen den logischen Session-Header, den physischen JSONL-Header, den Event-Envelope sowie jedes First-Party-Event und jede transitive Referenz an diesem Tag. Typenzahlen umfassen nur Definitionen, die nach der Normalisierung erreichbar sind. Historische Quellverweise behalten Dateipfade ohne Zeilennummern.

Diese retrospektiven Aufzeichnungen werden getrennt von der aktuellen Bestätigungskette im übergeordneten Verzeichnis validiert. Klassifikationen alter Änderungen nach aktuellen Regeln sind Lesehilfen: Die historische Version 0 enthielt tatsächlich strukturelle Änderungen ohne Versionserhöhungen. Eine nachgetragene Aufzeichnung kann keinen aktuellen PR dazu berechtigen, eine Bestätigung oder eine erforderliche Versionserhöhung auszulassen.

<a id="extraction"></a>
## Extraktion und Einschränkungen

Die Rekonstruktion verwendete den Quellstand an jedem Tag, TypeScript 6.0.3 und den zusammengeführten [Schema-Extraktor](../../../scripts/persistence-schema.ts). Die einzige Extraktionsanpassung lässt ein redundantes `object`-Member aus Schnittmengen früher konkreter Event-Aufzeichnungen weg. Bestehende `any` / `unknown` bleiben undurchsichtig; für unaufgelöste Referenzen wurden keine zusätzlichen undurchsichtigen Typen ersetzt. Das Release-Schema-JSON behält historische Bezeichner; Terminologieprüfungen gelten weiterhin für verfasste Aufzeichnungen und aktuelle Schemas.

Die ersten 22 Tags deklarieren zu Recht ein optionales `surfaceOp` auf Surface-Events. Die historische Auswertung behält diese Optionalität; die Auswertung der aktuellen Quelle verlangt das Feld weiterhin. Frühere Deklarationen `SessionHeader.version: number` bleiben ebenfalls intakt, wobei die tatsächlichen Writer-Versionskonstanten getrennt aufgezeichnet werden. Eine breite `number`-Deklaration kann diese Konstante nicht liefern.

Die erfassten Tags verwenden die Writer-Versionen 0, 2 und 3; kein Tag verwendet Writer-Version 1.

Digests beschreiben normalisierte rekonstruierte Typen, nicht den wörtlichen Quelltext oder eine Reproduktion der ursprünglichen Toolchain. Zusammenfassungen liefern groben strukturellen Kontext; alte Anwendungen wurden nicht wieder abgespielt, vollständiges Codec-Verhalten wurde nicht validiert und die Migrationssicherheit wurde nicht bewiesen. Ein unveränderter Digest belegt kein unverändertes Verhalten.

<a id="verification"></a>
## Verifikation

Alle 26 Snapshots haben die Validierung von kanonischem Graph, Wurzel-Digest und Digest erreichbarer Typen bestanden. Die Prüfung des Release-Archivs liest nur das Manifest, die Aufzeichnungen und die Snapshots in diesem Baum, ohne Git, Netzwerkzugriff oder Checkouts alter Versionen; sie validiert Manifest-Abdeckung, Vorgänger, Vorher-/Nachher-Werte, Vollständigkeit der Snapshot-Typen und zweisprachige maschinelle Deklarationen.

```sh
pnpm run verify-persistence-releases
pnpm run doc-sync
```

Der marker-begrenzte Index, die Inventarzellen und die Fakten zu strukturellen Änderungen werden aus den Snapshots generiert. Die Standardverifikation weist veraltete Fakten zurück. Führen Sie `pnpm run verify-persistence-releases --write` aus, um diese Bereiche und die Paarungsaufzeichnungen nach der Validierung aller maschinellen Daten zu erneuern; verfasste Zusammenfassungen, Quellbelege, maschinelle Deklarationen und Schema-Dateien bleiben erhalten.

Die Tag-Vollständigkeit ist relativ zum erfassten Umfang des Manifests; Offline-Prüfungen entdecken spätere Tags nicht automatisch. Die Standard-Dokumentationsprüfungen validieren Paarungsaufzeichnungen und Markdown-Links. Die [Formatvorlage](../../../.agents/skills/dsh-doc/templates/persistence-release.md) definiert die Felder jeder Aufzeichnung.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Erweitern klicken</summary>

Keine.

</details>
