---
description: "Aufgezeichnete Persistenztyp-Änderungen der Session prüfen und pflegen, ihre Schema-Snapshots und Kompatibilitätsentscheidungen."
---

# Aufzeichnungen zu Persistenztyp-Änderungen

English | [中文](README.zh.md)

## Zusammenfassung

Verwenden Sie diese Referenz, um eine anerkannte Persistenztyp-Änderung der Session und ihren Vorgänger zu prüfen. Jede Aufzeichnung bindet eine Kompatibilitätsentscheidung an exakte generierte Schemas. Lokale Prüfungen vergleichen die aktuelle Quelle mit der aufgezeichneten Historie und verwenden dabei ausschließlich Dateien im Checkout. Beginnen Sie mit dem [Review-Cookbook](../cookbook/reviewing-persistence-type-changes.md), wenn Sie einen persistierten Typ ändern.

Für ältere getaggte Versionen verwenden Sie das [Prerelease-Archiv](releases/README.md). Es rekonstruiert Alpha-/RC-Typunterschiede zum historischen Nachlesen und zur Formatvalidierung; seine Beobachtungen dienen nicht als aktuelle Kompatibilitätsbestätigungen.

Für vollständige, nach Session-Format gruppierte Schemas verwenden Sie die [Format-Referenzen](historical-formats/README.md). Ihr Umfang folgt der Writer-Konstante und schließt Zwischenformate ohne Release-Tag ein.

## Inhaltsverzeichnis

- [Dateien und Zuständigkeit](#files-and-ownership)
- [Kompatibilitätsregeln](#compatibility-rules)
- [Historie und Einschränkungen](#history-and-limitations)
- [Dev Note](#dev-note)

-----

<a id="files-and-ownership"></a>
## Dateien und Zuständigkeit

Der generierte [Katalog](../persistence-catalog.md) liefert lesbare Deklarationen und Digests; das [Schema-Inventar](../persistence-schema.json) enthält die normalisierten Typen. Wurzeln umfassen den logischen Session-Header, die physische JSONL-Headerzeile, den Event-Envelope und jedes im Repository deklarierte Event. Referenzierte Typen tragen transitiv zum Digest jeder betroffenen Wurzel bei.

Jede datierte Aufzeichnung hat vier gleichrangige Dateien:

| Datei | Zuständigkeit |
|---|---|
| `YYYY-MM-DD-slug.md` | Englische Bestätigung mit `kind: persistence-change`, einer maschinellen Deklaration, Kompatibilitätsbegründung und Verifikationsbelegen |
| `YYYY-MM-DD-slug.zh.md` | Chinesisches Gegenstück mit identischer maschineller Deklaration |
| `YYYY-MM-DD-slug.i18n.yaml` | Generierte zweisprachige Konsistenzaufzeichnung |
| `YYYY-MM-DD-slug.schema.json` | Generierte vollständige After-Schemas für die betroffenen Wurzeln, die weiterhin vorhanden sind |

`finalized/vN.json` zeichnet die vollständigen Wurzelklassifikationen/-Digests einer akzeptierten Kompatibilitätsbasislinie sowie semantische Hashes ihrer akzeptierten Aufzeichnungen auf. Die [Finalisierungsaufzeichnung](../session-format-status.md#finalization-record) benötigt ihren Checkpoint. Aktuelle V4-Schemas können sich kompatibel weiterentwickeln; der Checkpoint schützt akzeptierte maschinelle Deklarationen und After-Schemas auch dann, wenn der Writer weiterzieht, und schließt dabei Prosa, Aliase und Quellorte von den Aufzeichnungs-Hashes aus.

Ein Maintainer erfasst ein vereinbartes Format mit [`createPersistenceFinalizationCheckpoint`](../../scripts/persistence-finalization.ts), schreibt einen neuen, nach Version benannten Checkpoint, ohne einen früheren zu ersetzen, und zieht die zugehörige `latestFinalizedVersion` weiter. Der Helfer verlangt, dass die aktuellen Schemas zur vollständigen anerkannten Historie passen. Führen Sie vor dem Commit den gewöhnlichen Verifier aus.

Die [Aufzeichnungsvorlage](../../.agents/skills/dsh-doc/templates/persistence-change.md) definiert das verfasste Format. Die Aufzeichnungserstellung akzeptiert eine zweisprachige Prosa-Eingabe und generiert die maschinelle Deklaration, Snapshots, das Katalogpaar und die Konsistenzaufzeichnungen. Der Verifier liest die maschinelle Deklaration einmal aus der englischen Datei und prüft die chinesische Deklaration auf Gleichheit. Eine Deklaration benennt jede betroffene Wurzel, ihre Vorgängeraufzeichnung, ihren After-Digest und ihre Kompatibilitätsentscheidung. Eine neue Wurzel hat keinen Vorgänger; eine Löschung hat kein After-Schema und behält einen ausdrücklichen Tombstone.

<a id="compatibility-rules"></a>
## Kompatibilitätsregeln

Jede erkannte strukturelle Änderung erfordert eine Bestätigung. Behalten Sie die Session-Version bei, wenn ältere Leser die erforderliche Bedeutung akzeptierter Daten erhalten, optionale Merkmale sicher ignorieren und dabei undurchsichtige Aufzeichnungen bewahren oder nicht unterstützte erforderliche Daten vor Ausführung, Mutation oder Recovery-Truncation zurückweisen. Neue Leser müssen historische Bedeutung und Lesbarkeit erhalten. Erhöhen Sie die Version nur, wenn eine unsichere Interpretation nicht durch einen wirksamen Diskriminator verhindert werden kann. Unbekannte Felder oder Werte zählen nur, wenn bestehende Leser sie tatsächlich sicher behandeln; Typunterschiede allein können dieses Verhalten nicht belegen. Siehe die [Reader-Kompatibilitätsentscheidung](../../.agents/notes/implemented/process/2026-10-08-session-reader-compatibility-review.md).

| Erkannte Änderung | Anforderung an die Aufzeichnung |
|---|---|
| Eine optionale Eigenschaft des Event-Bodys hinzufügen, einschließlich ihres vollständigen Teilbaums | `same-version` |
| Eine erforderliche Eigenschaft des Event-Bodys optional machen | `same-version` |
| Einen gewöhnlichen Event-Typ hinzufügen | `same-version` |
| Eine höhere numerische `data.version` zu einem gewöhnlichen Event hinzufügen und dabei jede alte Payload-Alternative unter den bestehenden Kompatibilitätsregeln bewahren | `same-version` |
| Eine ausdrücklich qualifizierte Attributionsart zu einem user/developer-Quellslot hinzufügen, dessen Vorher- und Nachher-Schemas dieselbe unterstützte Policy tragen | `same-version` |
| Eine optionale Eigenschaft erforderlich machen, eine erforderliche Eigenschaft hinzufügen, einen bestehenden Typ ändern oder eine Eigenschaft bzw. ein Event entfernen/umbenennen | Kompatibilitätsprüfung für `same-version` oder ausdrücklicher `version-bump` |
| Den Session-Header oder den Event-Envelope ändern | Kompatibilitätsprüfung für `same-version`; eine Änderung der Header-Version erfordert `version-bump` |

Der Klassifizierer identifiziert etablierte Same-Version-Fälle und Änderungen, die eine Kompatibilitätsprüfung erfordern; er kann die semantische Sicherheit nicht entscheiden. Letztere erfordern beim Aufzeichnen oder Aktualisieren ohne Versionserhöhung einen ausdrücklichen `--decision same-version`. Der Abschnitt „Compatibility“ der Bestätigung erläutert das tatsächliche Reader-Verhalten in beide Richtungen, und „Verification“ zeichnet die ausgeführten Prüfungen auf. Prüfen Sie den vollständigen Übergang, einschließlich gleichzeitiger Änderungen. Ein ausdrücklicher `version-bump` erfordert stattdessen einen eigenen, aufsteigenden `SessionHeader.version`-Übergang; eine Same-Version-Entscheidung kann eine Änderung der Header-Version nicht erlassen. Finalisierte Aufzeichnungen bleiben unveränderlich, daher kann eine spätere Aufzeichnung den akzeptierten Übergang 3→4 nicht wiederverwenden.

Die CLI verlangt diese ausdrückliche Wahl, bevor sie eine markierte Same-Version-Aufzeichnung generiert. CI liest die aufgezeichnete `decision: same-version` und akzeptiert sie, wenn die gewöhnlichen Beschränkungen für Historie, Schema und Header-Version gelten, unabhängig davon, ob die Aufzeichnung generiert oder manuell bearbeitet wurde. Die Verifikation kann nicht belegen, wie die Aufzeichnung verfasst wurde oder ob ein Mensch sie geprüft hat. Reviewer vergleichen Basis- und Head-Inventare mit [`persistence-review`](../cookbook/reviewing-persistence-type-changes.md#generate); `--check` validiert die Konsistenz des aktuellen Baums und kann einen bereits durch eine Bestätigung abgedeckten Übergang nicht aufdecken.

Ein gewöhnliches Event darf Payload-Alternativen mit einer erforderlichen, nicht negativen ganzen Zahl `data.version` hinzufügen, die größer ist als jede bestehende Payload-Version, sofern jede bestehende Alternative unter den oben festgelegten Same-Version-Regeln lesbar bleibt. Optionale Eigenschaftshinzufügungen und Änderungen von erforderlich zu optional dürfen die neue Version begleiten; jede beibehaltene Alternative wird getrennt verglichen. Andere Payload-Änderungen erfordern eine Kompatibilitätsprüfung. Ältere Leser dürfen die neue Payload-Version zurückweisen. Die [Katalogbestätigung](2026-09-20-unknown-child-catalog.md) zeichnet einen solchen Übergang auf.

Der Extraktor akzeptiert eine ausdrückliche `@persistenceSource`-Bindung für eine Core-eigene Quelleigenschaft auf einer literalen user- oder developer-Rolle; er leitet keine Bindung aus einem nicht annotierten Typ ab. Ein Producer qualifiziert seinen `MessageSourceMap`-Eintrag mit `@persistenceAttribution`. Die Qualifizierung verspricht, dass eine unbekannte Art und ihre JSON-Metadaten das Lesen ohne den Producer überstehen und dass die Art keine Validierungs-, Replay- oder Autoritätsanforderung auferlegt. Ein Producer darf seine eigene Art prüfen, um die Duplikatunterdrückung fortzusetzen; andere Leser müssen die aufgezeichneten Nachrichten ohne diese Projektion bewahren und ableiten. Das aufgezeichnete Schema behält die Bindung, die Policy-Version, den literalen `kind`-Diskriminator, das Bewahrungsversprechen und die qualifizierte Artenmenge. Inventarformat 2 speichert diese Versprechen; Extraktion ohne gebundene Policy behält Format 1. Session-Formatversionen sind unabhängig. Beide verglichenen Snapshots müssen kompatiblen Policy-Zustand tragen. Bestehende Artengruppen erhalten weiterhin den gewöhnlichen strukturellen Vergleich; Entfernungen, unmarkierte Hinzufügungen, Policy-Änderungen und unabhängige strukturelle Änderungen erfordern eine Kompatibilitätsprüfung. Mehrere Alternativen der Kontextform mit derselben Wire-Art bilden eine Gruppe.

Jede Same-Version-Erklärung gibt an, wie alte Aufzeichnungen lesbar bleiben und wie ältere Leser neue Aufzeichnungen behandeln, einschließlich etablierter Fälle, die keine ausdrückliche CLI-Entscheidung benötigen. Ein in einem Log fehlendes Merkmal muss das alte Verhalten behalten; entbehrliche Merkmale müssen sicher ignorierbar sein; erforderliche Merkmale brauchen ein wirksames Zurückweisungssignal. Die Zurückweisung nicht unterstützter Merkmale darf nicht zu Korruptionswiederherstellung oder Tail-Truncation werden. Erläutern Sie bei Änderungen von erforderlich zu optional, wie Leser einen fehlenden Wert behandeln. Reviewer beurteilen Verhalten und Belege; der Checker validiert die Deklaration und die Typklassifikation. Eine Version-Bump-Aufzeichnung folgt dem [Session-Format-Verfahren](../cookbook/adding-a-session-format-version.md).

Wenn ein Leser eine JSON-Eigenschaft namentlich zurückweist, deklarieren Sie die Eigenschaft als optional `never` und markieren Sie sie mit argumentfreiem `@persistenceReserved`. Der Extraktor behält das verbotene Feld, daher erfordert das spätere Zulassen eines JSON-Werts eine Typänderung eines bestehenden Felds. Erforderliche Eigenschaften oder Eigenschaften mit JSON-Werten können diese Markierung nicht tragen. Unmarkierte optionale `never`- und `undefined`-Eigenschaften behalten ihr bestehendes Auslassungsverhalten.

<a id="history-and-limitations"></a>
## Historie und Einschränkungen

Eine Basislinie zeichnet das vollständige Anfangs-Inventar auf. Spätere Aufzeichnungen verwenden das After-Schema ihres Vorgängers als Vorher-Schema. Der Verifier weist fehlende Vorgänger, Zyklen, doppelte Nachfolger für eine Wurzel, Digest-Abweichungen und aktuelle Wurzeln zurück, die ihren neuesten Aufzeichnungen widersprechen. Unabhängige Wurzeln können unabhängig voranschreiten. Zwei Änderungen an demselben Vorgänger erfordern nach der Integration eine einzige geordnete Historie.

Akzeptierte Aufzeichnungen beschreiben historische Übergänge; bewahren Sie ihre maschinellen Deklarationen und Schema-Snapshots, wenn Sie einen Nachfolger hinzufügen. Eine nicht akzeptierte abschließende Aufzeichnung kann ausdrücklich erneuert werden; der Befehl weist Basislinien, Aufzeichnungen mit abhängigen Aufzeichnungen und checkpoint-gesperrte Aufzeichnungen zurück, bevor er Artefakte erzeugt. Die Verifikation prüft aufbewahrte Checkpoint-Hashes; sie belegt nicht, dass die Checkpoints und ihre Autoritätsaufzeichnung nie gemeinsam bearbeitet wurden. Kein Git-Ref, kein Remote-Dienst und kein veröffentlichter Checkout liefert die Basislinie.

Digests beschreiben deklarierte Persistenztypen, nicht Laufzeitvalidierung oder -verhalten. Gewöhnliche Kommentare, Quellorte, Aliasnamen und harmlose Umsortierungen von Deklarationen beeinflussen sie nicht. Kompatibilitätsannotationen sind aufgezeichnete Policy-Daten und beeinflussen die Digests. Nicht annotierte Version-1-Snapshots behalten ihre ursprüngliche Normalisierung und ihre Fingerabdrücke; policy-tragende Graphen verwenden eine eigene Fingerabdruck-Domäne. Objektfelder, Union-Alternativen, Intersection-Operanden und Indexsignaturen können umsortiert werden, solange ihre aufgelösten Typen gleich bleiben; Tuple-Positionen und numerische Enum-Werte bleiben bedeutsam. Katalogtext und Quellorte können sich dennoch ändern, daher sollten Sie veraltete Artefakte neu generieren, ohne eine Bestätigung für einen unveränderten Digest hinzuzufügen. Undurchsichtige Typen wie `unknown` legen keine verborgene Struktur zum Vergleich offen. Rein verhaltensbezogene Änderungen und Strukturen, die in undurchsichtigen Werten verborgen sind, liegen außerhalb des Geltungsbereichs dieses Mechanismus. Die [Entscheidung](../../.agents/notes/implemented/process/2026-09-11-persistence-type-history.md) zeichnet diese Abwägungen auf.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Arbeitskontext für Maintainer — zum Erweitern klicken</summary>

Keine.

</details>
