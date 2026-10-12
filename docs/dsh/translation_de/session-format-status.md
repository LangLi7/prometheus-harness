# Session-Format-Version und Release-Status

English | [中文](session-format-status.zh.md)

## Zusammenfassung

Diese Referenz dient dazu, den Writer des Checkouts, die akzeptierte Kompatibilitäts-Baseline und das zuletzt veröffentlichte Session-Format auseinanderzuhalten. Die Code-Konstante besitzt den Writer; die Finalisierungs- und Release-Datensätze unten benennen akzeptierte Historie und Veröffentlichungsnachweis getrennt. Andere Dokumentationen verlinken hierher, statt diese Werte zu wiederholen.

## Inhaltsverzeichnis

- [Wahrheitsquellen](#sources-of-truth)
- [Finalisierungs-Datensatz](#finalization-record)
- [Release-Datensatz](#release-record)
- [Den Datensatz aktualisieren](#updating-the-record)
- [Dev Note](#dev-note)

<a id="sources-of-truth"></a>
## Wahrheitsquellen

- **Checkout-Writer:** `SESSION_FORMAT_VERSION` in [Core-Session-Typen](../packages/core/session/src/types.ts) ist die einzige von Hand gepflegte Nummer des aktuellen Writers im Code. Der [Katalog-Generator](../scripts/gen-session-format-catalog.ts) leitet die Codec-Reihenfolge ab und prüft, dass benachbarte Migrationen sie erreichen. Eine Paketversion, ein Codec-Exportname, ein Fixture-Dateiname oder eine Projection-Cache-Version ist nicht die Writer-Autorität.
- **Zuletzt veröffentlichtes Format:** `latestReleasedVersion` im folgenden Datensatz benennt das veröffentlichte Session-Format. `evidenceTag` benennt ein veröffentlichtes Produkt-Release, dessen getaggter Writer diesen Wert hat; es muss nicht das erste Release sein, das das Format trägt. Die bilinguale Kopie wird gegen denselben Datensatz geprüft und nicht als eigene Entscheidung gepflegt.
- **Release-Status:** die Writer-Konstante mit dem verifizierten Release-Datensatz vergleichen. Gleichheit bedeutet, dass das Writer-Format ausgeliefert wurde. Eine größere Writer-Version ist noch nicht als veröffentlicht erfasst; ihr Finalisierungs-Datensatz benennt unabhängig davon die akzeptierte Kompatibilitäts-Baseline. Beim Vergleich eines älteren Checkouts mit dem verifizierten Datensatz eines neueren Branches benennt eine niedrigere Writer-Version ein älteres Writer-Format; das lokale Konsistenz-Gate weist diese Reihenfolge innerhalb eines Checkouts zurück. Ein separates Boolean für „released“ wird nicht gepflegt. Bevor eine größere Version für unveröffentlicht erklärt wird, ist zu prüfen, dass kein veröffentlichtes Release den Datensatz vorangebracht hat.

Eine Alpha-, Beta- oder Release-Candidate-Veröffentlichung des Produkts begründet Verpflichtungen für das veröffentlichte Session-Format. Das Prerelease-Flag von GitHub macht persistierte Nutzerdaten nicht entbehrlich. Ein fehlender Release-Datensatz ist kein Beleg für eine Nichtveröffentlichung. Die [Versionierungs- und Autoritätsentscheidung](../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md) besitzt die Kompatibilitätsentscheidungen; die [Migration veröffentlichter Formate](../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md) besitzt unveränderliche Generationen und die benachbarte Konvertierung.

Die [Format-Referenzen](persistence-changes/historical-formats/README.md) dokumentieren jede ganze Zahl von null bis zum Writer des Checkouts, mit historischen Schemas und dem bestehenden aktuellen Katalog.

<a id="finalization-record"></a>
## Finalisierungs-Datensatz

```yaml session-format-finalization
latestFinalizedVersion: 4
```

V4 hat eine akzeptierte Kompatibilitäts-Baseline im [Checkpoint](persistence-changes/finalized/v4.json). Schema-Änderungen können bei V4 bleiben, wenn die [Reader-Kompatibilitätsregeln](persistence-changes/README.md#compatibility-rules) erfüllt sind und die erforderliche Review festgehalten ist. Eine Entscheidung zur Versionsanhebung erfordert eine höhere Writer-Version und einen eigenen Header-Übergang; sie kann den akzeptierten Übergang 3→4 nicht wiederverwenden. Akzeptierte Maschinen-Datensätze und After-Schemas bleiben unveränderlich.

Die Finalisierung friert nicht jede künftige V4-Ergänzung ein und trifft keine Aussage über die Veröffentlichung. Der Release-Datensatz unten hält die unabhängig verifizierte veröffentlichte Version fest. Gewöhnliche Kommentare, Aliase, Quellorte und Implementierungskorrekturen, die die akzeptierte Bedeutung erhalten, ändern diese Baseline nicht.

Das [finale V3-Vokabular](cookbook/adding-a-session-format-version.md#final-v3-vocabulary) bleibt historisch und unabhängig von aktuellen V4-Ergänzungen.

<a id="release-record"></a>
## Release-Datensatz

```yaml session-format-release
latestReleasedVersion: 4
evidenceTag: dsh-v0.2.0-rc.2
```

Nachweis: veröffentlichter Produkt-Tag `dsh-v0.2.0-rc.2`; getaggter Writer: `packages/core/session/src/types.ts`.

<a id="updating-the-record"></a>
## Den Datensatz aktualisieren

Wenn eine Anhebung des Session-Formats implementiert wird, sind die Code-Konstante und der benachbarte Katalog gemeinsam zu aktualisieren; dieser Release-Datensatz darf vor der Veröffentlichung nicht vorangebracht werden. Wenn ein Produkt-Release erstmals ein höheres Session-Format veröffentlicht, sind die Veröffentlichung und ihr getaggter Writer zu bestätigen, danach sind dieser Datensatz sowie Evidence-Tag und Writer-Pfad in derselben bilingualen Aktualisierung voranzubringen. Spätere Produkt-Releases mit demselben Format erfordern keine Änderung des Datensatzes. Auf dem Entwicklungs-Trunk darf er niemals herabgesetzt werden.

Der [Dokumentationsstandard-Test](../scripts/doc-standard.spec.ts) prüft die Datensatzstruktur, die bilinguale Gleichheit, die Konsistenz von Evidence-Tag und Writer-Pfad sowie, dass das dokumentierte Release den Writer des Checkouts nicht übersteigt. Diese Prüfung ohne Key fragt GitHub nicht ab und belegt nicht, dass der Datensatz aktuell ist; die Veröffentlichungsverifikation bleibt Teil der Release-Aktualisierung.

Für allgemeines Verhalten die Begriffe „aktuelles Format“ und „nächste benachbarte Version“ verwenden. Explizite Zahlen für feste Migrations-Eingaben und -Ausgaben, Wire-Schemas, historische Nachweise und Tests genau dieser Versionen beibehalten. Das [Format-Version-Cookbook](cookbook/adding-a-session-format-version.md) verwendet N für das zuletzt finalisierte oder veröffentlichte Format und N+1 für dessen Nachfolger.

<a id="dev-note"></a>
## Dev Note

Keine.
