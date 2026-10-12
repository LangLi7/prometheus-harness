---
description: "Die vollständigen deklarierten Persistenztypen für jedes Session-Format von V0 bis zum Writer des Checkouts finden."
---

# Session-Persistenzformate

English | [中文](README.zh.md)

## Zusammenfassung

Verwenden Sie diese Referenz, um die Header, Event-Envelopes und Payload-Typen einer gespeicherten Session-Generation zu prüfen. Jedes Format unterhalb des Writers des Checkouts hat ein zweisprachiges Dokument und einen vollständigen Schema-Snapshot. Das aktuelle Format verwendet den generierten Persistenzkatalog. Die [Versionsautorität](../../session-format-status.md) besitzt die Writer-Konstante und den Release-Status.

## Inhaltsverzeichnis

- [Format-Referenzen](#formats)
- [Geltungsbereich und Belege](#scope)
- [Abdeckung pflegen](#maintenance)
- [Dev Note](#dev-note)

-----

<a id="formats"></a>
## Format-Referenzen

Der Index wird aus validierten Snapshots und der aktuellen Writer-Konstante generiert. Jede historische Referenz benennt ihren Quell-Checkpoint; eine Session-Formatnummer benennt nicht jede Event-Payload-Revision innerhalb dieses Formats.

<!-- persistence-format-index:start -->

| Format | Quelle | Referenz | Maschinelles Schema | Wurzeln / Typen |
|---|---|---|---|---|
| 0 | `dsh-v0.1.2-rc.1` | [V0](v0.md) | [JSON](v0.schema.json) | 54 / 415 |
| 1 | PR #3349 | [V1](v1.md) | [JSON](v1.schema.json) | 54 / 415 |
| 2 | `dsh-v0.1.3-alpha.2` | [V2](v2.md) | [JSON](v2.schema.json) | 56 / 435 |
| 3 | PR #4320 | [V3](v3.md) | [JSON](v3.schema.json) | 60 / 467 |
| 4 | Aktueller Checkout | [Aktueller Katalog](../../persistence-catalog.md) | [JSON](../../persistence-schema.json) | 63 / 597 |

<!-- persistence-format-index:end -->

<a id="scope"></a>
## Geltungsbereich und Belege

Jedes Paar `vN.md` / `vN.zh.md` hat `kind: persistence-format`, eine identische Deklaration `yaml persistence-format`, die jeden Wurzelschlüssel an seinen erfassten Digest bindet, eine Paarungs-Sidecar und ein vollständiges `vN.schema.json`. Die [Vorlage](../../../.agents/skills/dsh-doc/templates/persistence-format.md) definiert diese Aufzeichnungen. Wurzeln umfassen den logischen Session-Header, den physischen JSONL-Header, den Event-Envelope und alle First-Party-Events am gewählten Checkpoint; jede Wurzel enthält jeden erreichbaren deklarierten Typ. Gepackte physische Body-Aufzeichnungen haben eigene Codec-Eigentümer, die von jeder Seite aus verlinkt sind.

V0 und V2 verwenden die neuesten passenden Tags im [erfassten Prerelease-Archiv](../releases/README.md). V1 verwendet einen Zwischen-Quellbaum, der in seiner Referenz benannt ist, weil die erfassten Tags keinen V1-Writer enthalten. V3 erfasst das verifizierte Inventar vor der V4-Writer-Änderung in PR #4320. Historische Quellen behalten Dateipfade ohne Zeilennummern. Snapshots bewahren historische optionale Felder und undurchsichtige Werte; sie setzen keine aktuellen Typen in ältere Formate ein. Historische Bezeichner bleiben nur im Schema-JSON und in den verifizierten generierten Schema-Bereichen intakt; verfasste Prosa folgt den aktuellen Terminologieregeln.

Diese Referenzen beschreiben ausgewählte Schemas, nicht das Wiederabspielen historischer Anwendungen oder die Migrationssicherheit. Same-Version-Event-Hinzufügungen und optionale Payload-Änderungen können andere gültige Inventare erzeugen. Das Prerelease-Archiv behält die Unterschiede von Tag zu Tag; die [Änderungsaufzeichnungen](../README.md) behalten die aktuellen Kompatibilitätsbestätigungen. Keine der beiden Historien wird durch diese Format-Snapshots ersetzt.

<a id="maintenance"></a>
## Abdeckung pflegen

`verify-persistence-formats` leitet den erforderlichen ganzzahligen Bereich aus `SESSION_FORMAT_VERSION` ab. Jede ältere ganze Zahl benötigt ihre eigene vollständige Aufzeichnung. Der aktuelle Katalog und das Schema müssen vorhanden sein und zur Writer-Version passen. Die Prüfung weist fehlende, zusätzliche, falsch nummerierte, unvollständige oder inkonsistente Aufzeichnungen sowie veraltete generierte Bereiche zurück, ohne die Git-Historie abzurufen oder einen Dienst abzufragen.

Prüfen Sie vor dem Weiterschreiten des Writers den aktuellen Katalog und archivieren Sie das ausgehende Format. Führen Sie für eine Änderung von V3 zu V4 diese Befehle aus, solange Writer und aktuelles Schema noch V3 beschreiben:

```sh
pnpm run verify-persistence-catalog
pnpm run verify-persistence-formats --archive 3
```

Ersetzen Sie `3` bei anderen Übergängen durch die ausgehende Writer-Version. `--archive N` erzeugt `vN.schema.json` aus dem aktuellen Inventar, behält genau die von seinen Wurzeln erreichbaren Typen und entfernt Quellzeilennummern. Es weist ein bereits vorhandenes Ziel, eine andere Version als die des aktuellen Writers, ungültige oder unvollständige Schemas und die Kombination mit `--write` zurück. Fügen Sie die zweisprachige Aufzeichnung des Snapshots und die Quellbelege mit der [Vorlage](../../../.agents/skills/dsh-doc/templates/persistence-format.md) hinzu. Behalten Sie alle früheren Aufzeichnungen. Der Nachfolger verwendet den aktuellen Katalog; das Kopieren eines neuen aktuellen Katalogs kann die Anforderung eines archivierten Vorgängers nicht erfüllen. Folgen Sie für Laufzeitänderungen dem [Cookbook für Formatversionen](../../cookbook/adding-a-session-format-version.md).

Die Schema-Definitionen und der Index innerhalb von Kommentarmarkern sind generiert. Nachdem Sie den Writer weitergeschaltet und die maschinellen Daten sowie die verfassten Belege vervollständigt haben, erneuern Sie ihre Tabellen und Paarungsaufzeichnungen und verifizieren Sie anschließend:

```sh
pnpm run verify-persistence-formats --write
pnpm run verify-persistence-formats
pnpm run doc-sync
```

`--write` validiert die maschinellen Daten, bevor es generiertes Markdown und Paarungsaufzeichnungen aktualisiert. Es bewahrt verfasste Erläuterungen, maschinelle Deklarationen und Schemas. Die Standardverifikation weist außerdem veraltete Paarungsaufzeichnungen zurück; die Standard-Dokumentationsprüfungen validieren Übersetzungen und lokale Links. Die Aktualität des aktuellen Katalogs bleibt bei `verify-persistence-catalog`.

<a id="dev-note"></a>
## Dev Note

Keine.
