# Übersetzungsregeln

English | [中文](translation-rules.zh.md)

Wie zwischen den beiden Seiten eines Dokumentationspaares in diesem Repo übersetzt wird. Beide Sprachen tragen gleiche Autorität ([README.md](README.md)): Eine Änderung wird in einer der beiden Sprachen verfasst, und diese Seite ist die Quelle für diese Aktualisierung — diese Regeln bestimmen, wie das Gegenstück erzeugt oder aktualisiert wird. Sie binden Menschen und Agents gleichermaßen. Routinemäßige Agent-Arbeit übersetzt den geänderten Inhalt direkt in einem terminologiegeleiteten Durchgang; der erweiterte Workflow [.agents/skills/dsh-translate-docs](../../.agents/skills/dsh-translate-docs/SKILL.md) läuft nur, wenn der Nutzer ihn ausdrücklich aufruft. Die Regelstufen folgen dem RFC-2119-Gebrauch: **MUST** / **MUST NOT** blockieren die Prüfung oder die Review; **SHOULD** verlangt einen genannten Grund für eine Abweichung; **MAY** steht im Ermessen.

## Treue

- Das Gegenstück *MUST* aussagen, was die verfasste Seite aussagt — kein hinzugefügtes Verhalten, keine hinzugefügten Voraussetzungen, Warnungen, Versionsaussagen oder Beispiele und keine weggelassenen. Wenn das Paar in der Substanz nicht übereinstimmt, gewinnt keine Sprache automatisch: die falsche Seite korrigieren und die andere in derselben Änderung nachziehen.
- Das Gegenstück *SHOULD* sich als natürlicher technischer Text in seiner eigenen Sprache lesen, nicht als wortwörtliche Glosse. Bedeutung übersetzen, Sätze umbauen, wo die Zielgrammatik es verlangt, und das Register des Autors bewahren — knapp bleibt knapp.
- Das Unübersetzbare nicht übersetzen: Wenn ein Satz sich der natürlichen Wiedergabe widersetzt, weil er auf einer Idiomatik der Ausgangssprache beruht, die Idee übersetzen, nicht die Idiomatik.

## Stimme

- Das Register wird durch [style-samples.md](style-samples.md) kalibriert — von Menschen freigegebene Gold-Paare, eines pro Dokumentgattung. Das Gegenstück MUSS zur zielsprachlichen Seite des nächstliegenden Beispiels passen; wo dessen Stimme und eine Prosa-Stimmregel einander widersprechen, gewinnt das Beispiel. Chinesische Ziele verwenden institutionelles technisches Chinesisch; englische Ziele verwenden knappe professionelle Entwicklerprosa.
- Schreiben wie ein muttersprachlicher technischer Autor, der den Inhalt neu formuliert, nicht wie ein Übersetzer, der Sätze umstellt, und dabei jede Quellklausel bewahrt: nichts hinzugefügt, nichts weggelassen — Flüssigkeit rechtfertigt nie den Verlust einer Klausel.
- Sätzen einen expliziten Akteur geben, wenn die Zielsprache ihn sonst verdunkeln würde; im Chinesischen vage Passivkonstruktionen oder abstrakte Subjekte durch den tatsächlichen Akteur ersetzen (系统、门禁、评审人).
- Etablierte Ingenieursidiomatik der Zielsprache gegenüber Lehnübersetzungen bevorzugen (误报／漏检 für false positive/negative, 执行红线 für enforcement frontier); Metaphern lokalisieren statt transplantieren und Substantivketten auflösen, wo die Zielsprache es verlangt.
- Lange Absätze nach semantischer Einheit teilen — eine Idee pro Absatz. Absatzgrenzen MAY von der Quelle abweichen; die strukturelle Signatur zählt Absätze nicht.
- Beim Übersetzen ins Chinesische verwenden Kategorienomen Chinesisch mit englischer Annotation bei Erstnennung (实操手册（cookbook）); beim Übersetzen ins Englische den konventionellen englischen Kategorienamen verwenden. Wörtliche Verzeichnis- oder Dateiverweise bleiben code-formatierte englische Zeichenketten.

## Strukturerhaltung

Die Paarungsprüfung kontrolliert Überschriftentiefen, fenced Code Blocks, Anzahl der Tabellenzeilen und -spalten, Listenarten, Startwerte nummerierter Listen, Anzahl der Listeneinträge, Link-Locale und semantische Ziele. Den übrigen Rahmen manuell bewahren; die gepaarten Dateien MUST eins zu eins übereinstimmen in:

- Überschriftenhierarchie (gleiche Ebenen, gleiche Reihenfolge — der Überschriftentext wird übersetzt),
- Listenform und Nummerierung,
- Tabellen (gleiche Spalten, gleiche Zeilenreihenfolge; Kopfzellen nach Terminologie übersetzt),
- fenced Code Blocks — **byte-identisch, einschließlich Kommentaren**; die Paarungssignatur vergleicht ihre Info-Strings und Inhalte, und ` ```ts `-Blöcke kompilieren unter `doc-typecheck`,
- Inline-Code-Spans (Befehle, Schalter, Konfigurationsschlüssel, Dateipfade, Event-Namen, API-Namen, Versionsnummern) — wörtlich, niemals übersetzt oder umformatiert,
- Links und Anker: Jeder relative Dokumentlink MUST dasselbe semantische Ziel und dasselbe exakte Query-/Fragment-Suffix behalten. Wenn das Ziel zum aktiven zweisprachigen Korpus gehört, verwendet die englische Seite ihren `.md`-Pfad und die chinesische Seite ihren `.zh.md`-Pfad; ein fehlendes Gegenstück in diesem Korpus ist ein Fehler, während Ziele außerhalb des Korpus den ursprünglichen Pfad behalten. Externe URLs, Bilder und reine Seitenfragmente bleiben unverändert. Der Sprachumschalter bleibt die ausdrückliche Cross-Locale-Ausnahme, und ein README, das außerhalb von GitHub gerendert wird, MAY die kanonische öffentliche Repository-URL auf sein exaktes Gegenstück verwenden, wie in [README.md](README.md) dokumentiert. Der Link-TEXT wird übersetzt.

Die Markdown-Konventionen des Repos gelten unverändert für `.zh.md`-Dateien: eine physische Zeile pro Absatz (`verify-md-wrap`), auflösbare relative Links (`verify-md-links`), genau ein abschließender Zeilenumbruch.

## Terminologie

- [terminology.md](terminology.md) ist die maßgebliche Quelle in beide Richtungen. Vor dem Übersetzen laden; jeder gelistete Begriff MUST seiner Zeile und deren „不要译作"-Verboten folgen. Ein chinesisches Ziel verwendet die Spalte „中文" und deren „首次出现"-Annotation; ein englisches Ziel verwendet die Spalte „English", ohne eine chinesische Glosse hinzuzufügen.
- Für ein chinesisches Ziel MAY ein nicht gelisteter Fachbegriff eine etablierte Wiedergabe aus einer bedeutenden chinesischsprachigen OSS- oder Herstellerquelle verwenden (K8s-/Vue-/MDN-Chinesisch-Dokumentation, 微软简中风格指南, Dokumentation großer Technologieprojekte), zitiert im PR. Ohne einen solchen Präzedenzfall MUST er auf Englisch bleiben und unter 「待定术语」(offene Begriffe) mit einer vorgeschlagenen Wiedergabe gelistet werden.
- Für ein englisches Ziel den etablierten englischen Fachbegriff verwenden. Hat der Ausgangsbegriff keine eindeutige etablierte Entsprechung, ihn mit einer kurzen erklärenden Glosse bewahren und unter offenen Begriffen listen. Keine Richtung darf inline eine Wiedergabe erfinden; ein entschiedener Begriff geht im selben PR oder in einem Folge-PR in [terminology.md](terminology.md) ein.

## Typografie

Diese Regeln gelten für die chinesische Seite; die englische Seite folgt den normalen Markdown-Konventionen des Repos (Wurzel-`AGENTS.md`). Die folgenden Regeln für gemischte Schriftsysteme folgen dem projektübergreifenden Konsens des [MDN Simplified Chinese translation guide](https://github.com/mdn/translated-content/blob/main/docs/zh-cn/translation-guide.md), des [Kubernetes zh-cn localization guide](https://kubernetes.io/zh-cn/docs/contribute/localization_zh/), der [Vue.js Chinese translation conventions](https://github.com/vuejs-translations/docs-zh-cn/wiki/%E7%BF%BB%E8%AF%91%E9%A1%BB%E7%9F%A5) und von [中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines), die ihrerseits auf [W3C clreq](https://www.w3.org/TR/clreq/) und GB/T 15834—2011 fußen:

- MUST ein halbbreites Leerzeichen zwischen chinesischen Text und lateinische Wörter sowie zwischen chinesischen Text und Ziffern setzen: `每个 plugin 注册 3 个 tool`。Kein Leerzeichen zwischen einem vollbreiten Satzzeichen und irgendetwas.
- MUST vollbreite (chinesische) Satzzeichen in chinesischer Prosa verwenden: `，。：；？！（）「」`. Halbbreite Satzzeichen bleiben innerhalb von Code-Spans, innerhalb vollständiger englischer Sätze, die unverändert zitiert werden, und in Zahlen (`3.5`, `1,024`).
- Chinesische Prosa *SHOULD* Doppelpunkte, Punkte, Kommas oder Klammern gegenüber Gedankenstrichen bevorzugen. Einen Gedankenstrich nur behalten, wenn kein anderes Satzzeichen den Satz natürlich bewahrt.
- Aufzählungskommas: Eine chinesische Liste paralleler Einträge verwendet 顿号（、）, keine Kommas.
- MUST NOT vollbreite Ziffern oder vollbreite lateinische Buchstaben verwenden — `１２３` niemals, `123` immer.
- Eigennamen behalten ihre kanonische Schreibweise: GitHub, TypeScript, DeepSeek — niemals `github`/`Github`, außer beim Zitieren von Code.
- Die zweite Person ist 你, nicht 您 (entspricht den chinesischen Konventionen von Vue und Kubernetes und der direkten Stimme dieses Repos).
- Hervorhebungsmarker (`**bold**`, `*italic*`) bleiben auf denselben Spans wie in der Quelle; Chinesisch kennt keine Kursivschrift, daher kann die gerenderte Hervorhebung identisch aussehen — keine Anführungszeichen oder andere Dekoration einsetzen.

## Qualitätslatte

- Ein Paar ist fertig, wenn ein bilingualer Ingenieur, der eine der beiden Dateien allein liest, alles erhält, was ein Leser der anderen erhält — dieselben Fakten, dieselben Vorbehalte, derselbe Ton — und nichts darüber hinaus.
- `pnpm run verify-translation-pairing` und den Rest von `doc-sync` für Protokolle, Umschalter, Überschriftentiefen, Code Blocks, Anzahl der Tabellenzeilen und -spalten, Listenarten, Startwerte nummerierter Listen, Anzahl der Listeneinträge, Links und Repository-Markdown-Regeln ausführen. Die menschliche Review besitzt Listen- und Tabellenreihenfolge, nicht-kanonische Listennummerierung, Inline-Code, Hervorhebung, Bedeutung, Terminologie und Ton.

## Referenzen

Von diesen Regeln zitierte Autoritäten, für Menschen und Agents, die die zugrunde liegende Begründung wünschen:

- [中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines) — der De-facto-Community-Standard für gemischte CJK-/Latein-Abstände und -Satzzeichen.
- [MDN zh-CN translation guide](https://github.com/mdn/translated-content/blob/main/docs/zh-cn/translation-guide.md) — eine im Repo liegende Übersetzungsregeldatei derselben Form wie diese; Abstände, Satzzeichen und Glossarpraxis.
- [Kubernetes zh-cn localization guide](https://kubernetes.io/zh-cn/docs/contribute/localization_zh/) — Praxis zu Erstnennung von Terminologie und Satzzeichen des größten zh-Lokalisierungsteams.
- [Vue.js docs-zh-cn 翻译须知](https://github.com/vuejs-translations/docs-zh-cn/wiki/%E7%BF%BB%E8%AF%91%E9%A1%BB%E7%9F%A5) — Entscheidungen pro Begriff zwischen Übersetzen und Beibehalten sowie Ton.
- [zh-style-guide](https://zh-style-guide.readthedocs.io) — ein Community-Styleguide für chinesisches technisches Schreiben, dessen regelstufige Taxonomie (und RFC-2119-Schlüsselwortstufen) diese Datei übernimmt; bündelt GB/T 15834/15835, clreq und Herstellerleitfäden.
- [W3C clreq](https://www.w3.org/TR/clreq/) und der [Microsoft Simplified Chinese style guide](https://learn.microsoft.com/en-us/globalization/reference/microsoft-style-guides) — die formellen typografischen und herstellerbezogenen Lokalisierungsgrundlagen.
- GB/T 19682-2005《翻译服务译文质量要求》 — der nationale Standard, dessen drei Grundanforderungen (忠实原文、术语统一、行文通顺) die Abschnitte Treue und Terminologie dieser Datei operationalisieren.
