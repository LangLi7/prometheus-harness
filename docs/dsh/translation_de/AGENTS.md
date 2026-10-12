# AGENTS.md — Der Dokumentationsstandard

Diese Datei definiert Dokumentstruktur, Markdown-Ebenen, Schreibregeln und die Obergrenzen von `verify-doc-budgets`. [dsh-doc](../.agents/skills/dsh-doc/SKILL.md) für Platzierung und Validierung verwenden, [dsh-prose-standard](../.agents/skills/dsh-prose-standard/SKILL.md) für geforderte Abdeckung und redaktionelles Urteil; die [archivierte Doc-Tiers-Agent-Note](../.agents/notes/archived/process/2026-07-04-doc-tiers-and-budgets.md) hält die historische Begründung fest.

## Dokumentstruktur

Diese Regeln gelten für menschengerichtete Dokumentation; [Agent Notes](../.agents/notes/README.md) bleiben außerhalb ihres Geltungsbereichs. Ein [Postmortem](postmortem/README.md) ist eine vorfallbezogene Referenz; die Chronologie hält Nachweise fest, keine Lehrsequenz. Gegenstand und Baumposition eines Dokuments legen seinen Umfang fest: den eigenen Gegenstand in angemessener Tiefe beschreiben und direkte Kinder nur nach Zweck, Verantwortung und übergeordnetem Verhalten; für tieferliegende Details auf den besitzenden Nachfahren verlinken. Der Dokumenttyp erweitert diesen Umfang nicht. Eine Referenz darf nur über ihren eigenen Gegenstand erschöpfend sein. Testmechanismen, Fixtures und Harnesses gehören auf die niedrigste besitzende Ebene; höhere Dokumente verlinken dorthin.

Jedes Dokument im Geltungsbereich als Tutorial oder Referenz klassifizieren. Tutorials folgen einem geordneten Pfad zu einem Ergebnis und führen nur ein, was der jeweilige Schritt benötigt. Referenzen definieren einen Nachschlagebereich und das aktuelle Verhalten ohne Lehrsequenz. Umfangreiche Tutorial- und Referenzinhalte trennen; einen Abschnitt kennzeichnen, wenn einer der beiden Teile klein ist.

Vor dem Schreiben eines Tutorials das Vorwissen der Leserschaft und jedes Konzept intern als Anfänger, Fortgeschritten oder Experte klassifizieren. Voraussetzungen vor abhängigen Konzepten etablieren, die Schwierigkeit schrittweise erhöhen und unnötiges fortgeschrittenes Material in ein späteres Tutorial oder eine Referenz verschieben.

In dieser Reihenfolge vorgehen: das Dokument im Baum verorten; seine zulässige Detailtiefe festlegen; Tutorial oder Referenz wählen; bei einem Tutorial die Konzepte nach Voraussetzung und Schwierigkeit ordnen; vom Nachfahren besessenes Detail verlagern; tieferliegende Erklärungen durch Links auf ihre Owner ersetzen.

## Die Ebenen-Taxonomie: ein Zuhause pro Fakt

Jeder Fakt hat ein Zuhause: die Ebene, deren Aufgabe er ist; andernorts dorthin verlinken.

| Ebene | Aufgabe | Gehört NICHT dorthin |
|---|---|---|
| Root-`AGENTS.md` | Ständige Anweisungen: Regeln, die ein Agent in jeder Session im Kontext benötigt, je ein bis drei Zeilen, mit Link auf ihr Zuhause | Geschichten, durchgearbeitete Beispiele, situative Verfahren, alles aus einem verlinkten Zuhause Wiederholte |
| Teilbaum-`AGENTS.md` (`packages/`, `docs/`, `.agents/notes/`) | Anweisungen, die für diesen Teilbaum spezifisch sind | Repo-weite Regeln, die die Root-Datei bereits trägt |
| [architecture.md](architecture.md) | Geordnete Karte: Komposition, Core-Pakete, Loop, Seams, Erweiterungspunkte; vor Änderungen an `packages/` lesen | Typdefinitionen (→ Subsysteme), Detail pro Paket (→ Paket-READMEs), Entscheidungsbegründungen (→ Agent Notes), Anmerkungen zum Implementierungsstatus |
| [subsystems/](subsystems/README.md) | Eine Referenzseite pro Subsystem: Typdefinitionen, Semantik und die generierte Cordis-API | Verhaltensbeschreibung (→ architecture.md) |
| [Agent Notes](../.agents/notes/README.md) | Aktive Entscheidungsdatensätze: das Warum, das Aufgegebene und die erforderliche Verifikation; Notizen in `implemented/` beschreiben die ausgelieferte Realität im Präsens | Migrationspläne, Checklisten für Abnahmeaufgaben, Fixture-Durchläufe und Spec-Sprache („should…“), sobald die Entscheidung ausgeliefert ist; archivierte Notizen sind eingefrorene Historie, niemals aktuelle Autorität |
| [postmortem/](postmortem/README.md) | Vorfallgeschichten — die einzige Ebene, in die War-Story-Erzählungen gehören | — |
| [Persistenz-Historie](persistence-changes/README.md) und [Format-Referenzen](persistence-changes/historical-formats/README.md) | Bestätigungen von Typänderungen, Release-Vergleiche und vollständige historische Format-Schemas | Rein verhaltensbezogene Änderungen; aktuelle Runtime-Verträge |
| [cookbook/](cookbook/adding-a-package.md) | Schritt-für-Schritt-Anleitungen mit nummerierten Verifikationsschritten | Design-Begründungen (→ die Agent Note, auf die jede Anleitung verlinkt) |
| [user/](user/index.md) | Produktgerichtete Anleitungen, die von der Dokumentationswebsite veröffentlicht werden | Generierte Referenztabellen, Verfahren für Beitragende, Entscheidungshistorie |
| Paket-README | Der Vertrag pro Paket: Config, Semantik, Einschränkungen, Erweiterungspunkte und [Model Experience](cookbook/adding-a-package.md#4-write-the-package-readme) | Wiederholung von JSDoc, Wiederholung des generierten Katalogs (Event-/Tool-Tabellen), Belange anderer Pakete |
| [development.md](development.md) | Einrichtung für Beitragende, täglicher Workflow und eine Zusammenfassung von CI; ein bilinguales Paar unter dem [i18n-Vertrag](i18n/README.md) | Runtime-/Versionsbegründungen (→ Agent Notes), Prüfung-für-Prüfung-Listen, die von den Scripts in `package.json` abweichen |
| Generierte Referenz: die `cordis-surface`-Regionen pro Seite in [subsystems/](subsystems/README.md), die [Cordis-Core-API + geerbte Ebene](cordis-api/context.md), [tool-catalog](tool-catalog.md), [config-catalog](config-catalog.md), [persistence-catalog](persistence-catalog.md), [module-graph.md](module-graph.md), [cli-help](cli-help.md) | Erschöpfende englische Quellen, aus dem Quellcode neu generiert und auf Aktualität geprüft; geprüfte chinesische Gegenstücke folgen dem [Pairing-Workflow](i18n/README.md#scope-and-exclusions) | Handbearbeitungen generierter englischer Quellen oder Regionen; chinesische Gegenstücke werden nur über Pairing aktualisiert |
| Skills (`.agents/skills/`) | Wiederverwendbare Workflows und spezialisierte Entscheidungsstandards | Produkt- und Runtime-Verträge (→ Docs oder Quellcode) |

Platzierung: Bugs → Postmortems; Begründungen → Agent Notes; Verfahren → Cookbooks; Typdefinitionen → Subsysteme; Paketverträge → READMEs; ständige Anweisungen → Root-`AGENTS.md` mit Begründungslink.

## Schreibregeln

- **Den aktuellen Zustand dokumentieren.** Historie in Commits, PRs, Agent Notes, Postmortems oder bereichsbezogenen Persistenz-Datensätzen halten. Andere Prosa benennt lebende Mechanismen, nicht Änderungen oder Positionen im Stack. Allgemeine Prosa zum Session-Format verlinkt die [Versions-/Status-Autorität](session-format-status.md); Zahlen für versionsspezifische Verträge, Beispiele oder Nachweise beibehalten.
- **Die Kriterien für das Anlegen einer Agent Note anwenden.** Mechanische/lokale Änderungen sind ausgenommen, einschließlich lokaler UI-Änderungen; bestehende besitzende Notizen aktuell halten ([Geltungsbereich](../.agents/notes/README.md#when-to-write-one)).
- **Eine physische Zeile pro Absatz** (`verify-md-wrap`): Soft-Wrap des Editors verwenden. Codeblöcke, Tabellen und Listenstruktur behalten ihre Formatierung; Code-Kommentare bleiben unter dem Spaltenlimit des Linters.
- **Eingezäunte `ts`-Blöcke müssen kompilieren** (`doc-typecheck`); eine eingefügte Typdeklaration und ihr ursprüngliches JSDoc verwenden ` ```ts type-equiv `, während eine von ihrem Rumpf befreite öffentliche Klassendeklaration ` ```ts public-api ` verwendet; beide im Manifest registrieren, damit keine abdriften kann ([Mechanik](development.md#documenting-types-verbatim-ts-type-equiv)).
- **Die besitzende [Subsystem-Seite](subsystems/README.md) wird in derselben Änderung aktualisiert**, die einen dokumentierten Typ umformt. `verify-type-equiv` fängt abgedriftete Einfügungen ab, nicht nie dokumentierte neue Typen; ein Typ wird auf der Seite seiner deklarierenden Paketgruppe dokumentiert ([Seiten-Scoping](../scripts/verify-subsystem-pages.ts)).
- **Paare werden gemeinsam aktualisiert**: [terminologiegeleitete](i18n/terminology.md), einläufige Arbeit eines aktiven Agenten positioniert Erstverwendungs-Annotationen neu, bewahrt unberührte Prosa und zeichnet neu auf; `dsh-translate-docs` bleibt nutzerseitig aufgerufen ([Vertrag](i18n/README.md)).
- **Kommentare und JSDoc nennen vollständige Verträge, keine Gedankengangs-Transkripte.** Verhalten, Fehler, Timing, Ownership, Modalität, Ausnahmen, Konsequenzen und nicht offensichtliche Orientierung erhalten; Erzählung, Test-Durchläufe, Review-Analyse und Wiederholung von Code löschen. Den lokalen Vertrag behalten und seine Begründung verlinken. Details in [dsh-prose-standard](../.agents/skills/dsh-prose-standard/SKILL.md).
- Direkt schreiben: Akteure und Fakten benennen ([Referenz](../.agents/skills/dsh-prose-standard/SKILL.md)). `seam` für die definierte Capability reservieren. Die exakte Prüfung, den Typ, die API, die Operation oder das Verhalten benennen statt metaphorischer „Gate“, „Vocabulary“ oder „Surface“.

## Wortzahl-Budgets

[scripts/doc-budgets.manifest.json](../scripts/doc-budgets.manifest.json) setzt Obergrenzen für dauerhafte Dokumente; `pnpm run verify-doc-budgets` weist überschüssige oder fehlende Dateien zurück.

Wenn das Gate rot wird:

1. Inhalte, die in eine andere Ebene gehören, **verlagern**; bei Bedarf einen einzeiligen Link hinterlassen.
2. Inhalte, die hierher gehören, aber kürzer sein können, **verdichten**.
3. Die Obergrenze nur **anheben**, wenn die Wörter den Platz brauchen; den Manifest-Diff im PR begründen. Eine zu niedrige Obergrenze ist ein Budget-Bug.

Obergrenzen sind Leitplanken, keine Reduktionsziele. Auf oder unter dem Ziel mindestens 5 % Reserve behalten; über dem Ziel die Obergrenze einfrieren, bis Verlagerung oder Verdichtung das Dokument unter das Ziel bringt. Eine Obergrenze nur senken, wenn das Dokument noch Platz hat. Ziele: Root-`AGENTS.md` ≤ 1,960; `architecture.md` ≤ 2,400; Teilbaum-`AGENTS.md` ≤ 600, außer `packages/AGENTS.md` ≤ 750 und diese Datei ≤ 1,320; `packages/README.md` ≤ 994; zusätzlich `cordis-primer.md` 600, `defensive-patterns.md` 550, `testing.md` 1,300, `examples/AGENTS.md` 310. Ebenen ohne Budget unterliegen der Review.

## Die Slop-Checkliste

Diese Punkte in jedem Dokument aufspüren; [dsh-doc](../.agents/skills/dsh-doc/SKILL.md) führt diese Liste als Audit aus:

- Doppelte Regeln: nach einer markanten Formulierung suchen; ein Zuhause behalten und den Rest verlinken.
- Historie außerhalb ihrer zulässigen Ebene: aktuelle Fakten nennen und den historischen Owner verlinken.
- Anmerkungen zum Implementierungsstatus in Prosa oder Diagrammen („implemented!“, „future: …“). Status verrottet; das Repo-Layout und die Paketmanifeste tragen ihn.
- Von Hand wiederholte Kataloge, JSDoc oder Inventare von Tests, Paketen und Status, wenn Quellcode oder ein Generator autoritativ ist.
- Gedankengangs-Transkripte: schrittweise Implementierungserzählung, Beweise offensichtlicher Verzweigungen, Test-Durchläufe oder verworfene lokale Alternativen. Den resultierenden Vertrag oder die dauerhafte Begründung behalten; den Weg, über den er hergeleitet wurde, löschen.
- Begründungen, die neben Geschwistermethoden wiederholt werden, statt einmal bei der besitzenden Capability oder dem Helper zu stehen.
- Absatzwände: ein Absatz, der mehrere Regeln und eingeklammerte Nebenbemerkungen trägt. Ihn aufteilen oder das Detail in sein Zuhause zurückstufen.
- Hervorhebungs-Inflation: Fett, GROSSBUCHSTABEN oder „critically“ überall bedeutet, dass nichts hervorsticht. Hervorhebung für die Klausel reservieren, die das Verhalten ändert.
- Spec-Sprache in Agent Notes unter `implemented/`: „should“, Migrationspläne, Abnahme-Checklisten. Eine implementierte Agent Note beschreibt, was ist, gemäß den [Anweisungen für implementierte Notizen](../.agents/notes/implemented/AGENTS.md).

## Repository-Referenzen

Für aktuelle Dateien relative Markdown-Links verwenden, für historische Referenzen Tags oder PR-Nummern. `verify-md-links` prüft lokale Ziele. Die [Referenzvalidierung](../scripts/verify-repository-references.ts) weist tatsächliche Commit-Identifier und unzulässige Organisations-URLs in gepflegten Dateien zurück.
