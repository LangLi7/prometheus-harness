# AI-Slop-Code — Beleglage und was die Arbeitsweise ändern würde

> **Zweck.** Was „AI Slop" im Code ist, was davon belegt ist, was nur Schätzung ist — und
> welche Änderungen an Arbeitsweise, Werkzeug und Governance die Belege tatsächlich tragen.
> Stand: 2026-10-28.
>
> **Methode.** Kuratierte Quellenrecherche, keine eigene Messung. Bevorzugt wurden
> peer-reviewte Arbeiten und Primärquellen (RCTs, Projekterklärungen, Survey-Rohberichte);
> Vendor-Daten sind als solche markiert. Die zentrale Einschränkung steht in §8: Es gibt
> keine repräsentative Messung des Slop-Anteils, und mehrere Kernzahlen sind Selbstauskunft.

---

## Kurzfassung

1. **Slop ist kein Genre, sondern eine Beziehung.** Nicht jeder KI-generierte Code ist Slop.
   Slop entsteht, wenn Ausgabe billig erzeugt, nicht geprüft und an andere weitergereicht
   wird. Drei Eigenschaften machen ihn erkennbar: oberflächliche Kompetenz,
   Aufwandsasymmetrie, Massenproduzierbarkeit.
2. **Der Engpass wandert vom Schreiben zum Prüfen.** Die Schreibzeit sinkt (Selbstauskunft:
   bis 52 %), die Prüf- und Nachbesserungszeit steigt. Wer nur die Schreibzeit misst, misst
   die Hälfte des Systems.
3. **Die belegten Schäden sind Prüf- und Vertrauenskosten, nicht Tippfehler.** Ein Viertel
   der eingehenden PRs gilt Maintainern als minderwertig (31 % in großen Projekten), die
   Review-Last ist der neue Flaschenhals, und LLM-gestütztes Review lässt sich durch
   Framing messbar aushebeln.
4. **Individuelle Zurückhaltung löst das nicht.** Die Kosten sind externalisiert; wo
   Beitragszahlen, Bounties und Beitrags-Graphen zählen, gewinnt Volumen. Es braucht
   Regeln, Messgrößen und Werkzeuge auf Teamebene — keine Appelle.
5. **Drei Änderungen tragen am meisten:** Verifikation vor Vertrauen, Review-Kapazität
   schützen, Output-Metriken durch Durchsatzkosten ersetzen.

---

## 1. Begriff: Was „AI Slop" im Code heißt

Geprägt wurde der Begriff für Inhalte, nicht für Code: Simon Willison schlug im Mai 2024
„slop" als Gegenstück zu „spam" vor — für KI-erzeugte Inhalte, die achtlos erzeugt und
jemandem aufgedrängt werden, der sie nicht angefordert hat. Wichtig ist die Einschränkung,
die er selbst macht: Nicht jeder KI-Inhalt ist Slop, und Slop ist keine Aussage über die
Technik, sondern über den Umgang mit ihr. Merriam-Webster machte „slop" 2025 zum Wort des
Jahres; die Software-Diskussion hat den Begriff übernommen.

Für Code ist die brauchbarste Fassung die von Kommers et al.: Slop hat drei Eigenschaften.

| Eigenschaft | Bedeutung im Code |
|---|---|
| Oberflächliche Kompetenz | Der Code sieht plausibel aus, hält leichter Prüfung stand und ist trotzdem falsch — etwa ein `setTimeout`, das eine Race Condition verdeckt, oder ein Cast nach `any`, das einen Typfehler stumm stellt. |
| Aufwandsasymmetrie | Erzeugen kostet Sekunden, Prüfen kostet Minuten bis Stunden. Der Aufwand wandert stromabwärts. |
| Massenproduzierbarkeit | Die Menge ist nicht durch menschliche Arbeitszeit begrenzt. |

Damit ist Slop abzugrenzen von „vibe coding" (einem Arbeitsstil: dem Modell die Führung
lassen) und von bloß schlechtem Code. Schlechter Code kann von Menschen stammen und
repariert werden; Slop ist dadurch gekennzeichnet, dass der Erzeuger die Prüfung nicht
geleistet hat und sie auch nicht nachholen kann, weil er den Code nicht versteht.

Slop betrifft dabei nicht nur Code. Dieselbe Mechanik trifft Bug-Reports, PR-Beschreibungen,
Commit-Messages, Dokumentation, Tutorials und Antworten auf Q&A-Seiten — überall dort, wo
jemand eine plausible Ausgabe weiterreicht, ohne sie zu prüfen. Deshalb ist die
Review-Perspektive in §3.3 und §5.2 wichtiger als die Code-Perspektive: Der teuerste Teil
ist nicht die Zeile, sondern die Prüfung, die an ihr hängt.

Die empirische Untersuchung von Baltes, Cheong und Treude stützt diese Fassung. Sie haben
1.154 Beiträge aus 15 Reddit- und Hacker-News-Threads codiert und finden drei Cluster:
Prüfreibung, Qualitätsverlust, strukturelle Kräfte. Die Metapher, die sie wählen, ist die
Allmende: Der einzelne Produzent gewinnt, die Gemeinschaft zahlt.

---

## 2. Warum sich Slop nicht wie ein Bug zählen lässt

Es gibt kein Etikett „AI-generated", und Provenienz ist in den meisten Werkzeugketten nicht
vorgesehen. Drei Größen müsste man messen, um den Effekt zu schätzen — sie sind
unterschiedlich schwer zu bekommen:

| Größe | Was sie zeigt | Fallstrick |
|---|---|---|
| Schreibzeit | Aufwand der Erzeugung | Wird als Produktivität verkauft; sagt nichts über Kosten stromabwärts. |
| Review-Zeit und -Tiefe | Tatsächliche Prüfkosten | Kaum instrumentiert; Review-Tiefe ist nicht messbar, nur die Dauer. |
| Fehler, die erst nach dem Merge auffallen | Qualität | Selten, teuer, und die Zuordnung zur Ursache ist strittig. |

Zwei Studien zeigen, wie leicht man sich dabei täuscht.

**METR (2025):** 16 erfahrene Open-Source-Entwickler, 246 Aufgaben, randomisiert. Mit
KI-Werkzeugen brauchten sie **19 % länger**, obwohl sie glaubten, 20 % schneller zu sein,
und vorher 24 % Ersparnis erwartet hatten. Der Befund ist kein Beweis, dass KI allgemein
bremst — die Autoren grenzen ausdrücklich ein, dass ihr Setting (vertraute, große
Repositories, hohe Qualitätsstandards) nicht repräsentativ ist. Er ist ein Beweis dafür,
dass **Selbstauskunft über Produktivität unzuverlässig ist**.

**Mockus et al. (ESEM 2026):** Über 10.000 Entwickler und 400.000 Diffs bei Meta. KI-Code
landet häufiger in weniger zentralem Code, in größeren Änderungen, in Testdateien und bei
erfahreneren Autoren. Review-Zeit und Ausfallraten (SEVs) sind bei KI-Diffs niedriger — aber
beide Effekte verschwinden als eigenständige Erklärung, wenn man für den Kontext
kontrolliert. Die Autoren folgern: Naive Vergleiche „KI gegen Nicht-KI" führen zu falschen
Schlüssen.

Das ist die methodische Grundlage für alles Folgende: Wer den Effekt von KI auf Code messen
will, muss den Kontext kontrollieren und die Prüfkosten mitzählen. Wer nur die Schreibzeit
misst, misst die falsche Seite.

---

## 3. Befunde

### 3.1 Schreiben wird schneller — die Zeit wandert

Die Linux Foundation hat im Oktober 2026 eine Befragung unter Open-Source-Entwicklern und
Maintainern veröffentlicht (gesponsert von Red Hat, unterstützt von OpenSSF und LF AI &
Data). Ergebnis: Die Befragten schätzen die Zeitersparnis beim **Code-Schreiben auf 52 %**;
bei Vorschlagsdiskussionen sind es rund 19 %. Bei **hochkomplexen Aufgaben** sagen 21 %, dass
sie mit KI **mehr** Zeit brauchen. Die gesparte Zeit fließt zu 66 % in den Abbau technischer
Schulden, zu 63 % in neue Funktionen und zu 58 % in Lernen.

Die Google-DORA-Erhebung 2025 kommt aus der anderen Richtung: 90 % der Technik-Fachkräfte
nutzen KI bei der Arbeit, über 80 % nehmen eine Produktivitätssteigerung wahr — und
gleichzeitig berichten 30 % wenig oder kein Vertrauen in den erzeugten Code. Die qualitative
Auswertung von 1.110 Freitextantworten von Google-Entwicklern (Q3 2025) findet den
Mechanismus: **„Verification Tax"**. Die Zeit, die beim Schreiben gespart wird, wird beim
Prüfen und Nacharbeiten wieder ausgegeben. Höhere KI-Nutzung ist assoziiert mit **mehr
Durchsatz und mehr Instabilität zugleich**.

Die Stack-Overflow-Umfrage 2025 (49.000+ Teilnehmer) passt dazu: 80 % nutzen KI, aber das
Vertrauen in die Genauigkeit fiel von 40 % auf 29 %, die positive Haltung von 72 % auf 60 %.
Die häufigste Frustration (45 %) sind „fast richtige" Lösungen; 66 % sagen, sie verbringen
mehr Zeit mit dem Nachbessern von „fast richtigem" KI-Code; 75 % fragen bei Misstrauen lieber
einen Menschen.

### 3.2 Codebasis: mehr Klone, weniger Umbau

GitClear hat 211 Millionen geänderte Zeilen aus den Jahren 2020–2024 ausgewertet (Repos von
Google, Microsoft, Meta und Enterprise-Kunden). Zwei Zahlen sind auffällig:

- Der Anteil **refaktorierender** Änderungen fiel von 25 % (2021) auf unter 10 % (2024).
- Der Anteil **kopierter/eingefügter** Zeilen stieg von 8,3 % auf 12,3 %; GitClear meldet
  zudem ein Vierfaches an Code-Klonen und dass „copy/paste" erstmals „moved" übersteigt.

Das sind Vendor-Daten, korrelativ, ohne Kontrolle für Projektart und Sprache. Sie zeigen
nicht, dass KI Code schlechter macht. Sie zeigen, dass in einem Korpus, in dem KI-Nutzung
zunahm, **Wiederverwendung und Umbau zurückgingen** — und genau das sind die Mechaniken, die
langfristige Wartbarkeit tragen. DORA beschreibt denselben Zug aus der Sicht der Teams: mehr
Code, der aussieht wie Fortschritt, und mehr technische Schuld, die später bezahlt wird.

### 3.3 Review: Der Engpass verschiebt sich

Die Linux-Foundation-Befragung liefert die klarsten Zahlen zur Verteuerung:

- **25 %** der eingehenden Pull Requests gelten Maintainern als minderwertig („AI slop");
  in **großen Projekten 31 %**.
- **59 %** der Maintainer berichten mehr Beitragseingänge seit dem Aufstieg der generativen
  KI; in großen Projekten **69 %**.
- Maintainer-Burnout ist die **meistgenannte Sorge** großer Projekte.
- Nur **35 %** der Projekte haben eine formale Richtlinie zur KI-Nutzung in Beiträgen; 32 %
  haben keine und planen keine.

Wichtig ist die Einschränkung, die der Bericht selbst macht: Die 25 % sind
**Maintainer-Schätzungen**, keine Messung jedes einzelnen PRs, und nicht jeder minderwertige
PR ist nachweislich KI-erzeugt. Die Größenordnung ist trotzdem belastbar, weil sie mit den
qualitativen Befunden zusammenpasst.

Baltes et al. zitieren aus der Diskussion: ein Team mit **30 PRs pro Tag auf sechs
Reviewer**; Reviewer, die sich als „erster Mensch, der diesen Code je sieht", beschreiben;
und den Satz, der die Umkehr der Verantwortung benennt: Man werde benutzt, um den Code des
anderen kritisch zu prüfen und den nächsten Prompt zu schreiben.

Die Eskalation ist dokumentiert. **curl** hat sein Bug-Bounty-Programm zum 31. Januar 2026
beendet. Daniel Stenberg nennt drei Ursachen: „the mind-numbing AI slop", verschlechtertes
Verhalten von Menschen und die Neigung, Löcher zu suchen statt zu helfen. Die
Einreichungen kosteten Zeit und Nerven und erzeugten keine belastbaren Funde. Baltes et al.
verzeichnen die Fortsetzung: Wenige Monate später waren die Slop-Meldungen weitgehend weg —
ersetzt durch **legitime, KI-gestützte Sicherheitsmeldungen in nie gekannter Frequenz**, die
die Maintainer vergleichbar belasteten. Die Qualität war besser, die Last nicht kleiner.

**Gentoo** hat im April 2024 KI-gestützte Beiträge grundsätzlich verboten — mit drei
Begründungen: Urheberrecht, Qualität („unfairer menschlicher Aufwand, Beiträge zu prüfen")
und Ethik. Godot und Apache Log4j melden ähnliche Belastungen; die Reaktionen reichen von
Richtlinien bis zur Ablehnung ganzer Beitragsklassen.

### 3.4 Sicherheit: drei belegte Mechanismen

**Erstens: unsicherer Code.** Veracode hat über 100 LLMs auf 80 Aufgaben getestet; nach
eigenem Bericht erzeugte **nahezu die Hälfte** der Aufgaben unsicheren Code (in der
Berichterstattung: 45 %), Java schnitt am schlechtesten ab. Das ist ein Vendor-Test mit
eigener Methodik, keine Feldmessung — aber die Richtung deckt sich mit der älteren
Pearce-Studie zu Copilot und mit den Fallberichten aus der Praxis.

**Zweitens: erfundene Abhängigkeiten („Slopsquatting").** Spracklen et al. (USENIX Security
2025) haben 16 Modelle, 576.000 Code-Proben, zwei Sprachen ausgewertet. Im Schnitt sind
**mindestens 5,2 %** der empfohlenen Pakete bei kommerziellen Modellen halluziniert, **21,7 %**
bei offenen Modellen; insgesamt fanden sie **205.474** einzigartige erfundene Paketnamen.
Wer solche Namen registriert, bekommt Installationen und damit Ausführung. Das ist kein
Modellfehler, der sich wegprompten lässt — es ist ein struktureller Angriff auf die
Paketketten.

**Drittens: Review lässt sich framen.** Mitropoulos et al. (2026) haben 250 CVE-Paare unter
fünf Framing-Bedingungen geprüft. Wenn der Prompt andeutet, die Änderung sei fehlerfrei,
sinkt die Erkennungsrate um **16 bis 93 Prozentpunkte** — die Fehlernennungen steigen stark,
die Fehlalarme kaum. Im Angriffsteil lassen sie verwundbaren Code als „Sicherheitsverbesserung"
auftreten: **35 %** Erfolg gegen GitHub Copilot (interaktive Prüfung, Ein-Schuss),
**88 %** gegen Claude Code als autonomen Review-Agenten, wenn der Angreifer das Framing
iterativ nachschärfen kann. Entschärfung durch Metadaten-Redaktion und explizite Anweisung
stellt die Erkennung in den interaktiven Fällen vollständig wieder her, im autonomen Fall zu
93,75 %.

Der Befund ist für die Praxis wichtiger als die Prozentzahlen: **Ein LLM-Review ist kein
Sicherheitsgate.** Es ist ein zusätzlicher Leser mit einer bekannten, ausnutzbaren
Schwäche. Wer es als Gate einsetzt, verschiebt die Verantwortung auf ein System, das sich
durch PR-Metadaten beeinflussen lässt.

### 3.5 Lernen und Können

Die bekannteste Studie ist ein Preprint: Kosmyna et al. (MIT Media Lab, 2025) haben 54
Teilnehmer beim Schreiben von Essays per EEG beobachtet. Die Gruppe mit LLM zeigte die
schwächste Hirnkonnektivität, die geringste empfundene Urheberschaft und Schwierigkeiten,
den eigenen Text später zu zitieren; Teilnehmer, die von LLM auf „ohne Werkzeug" wechselten,
zeigten ebenfalls reduzierte Konnektivität. Die Studie ist **nicht über Code**, die
Stichprobe klein, und der Langzeitbefund ist vorläufig. Sie ist trotzdem der beste
verfügbare Hinweis darauf, dass die Abkürzung beim Erzeugen einen Preis beim Verstehen hat.

DORA fasst dasselbe für die Softwarepraxis als „Expertise-Paradox": KI senkt die
Eintrittsschwelle und kann gleichzeitig den „produktiven Umweg" abkürzen, der Fachwissen erzeugt. Ein
Entwickler beschreibt es als „the blind leading the blind": Man kommt schneller in ein
fremdes Gebiet, hat aber nicht die Grundlage, die Ausgabe zu beurteilen.

Baltes et al. zitieren das als Catch-22: Wenn gute KI-Nutzung Erfahrung voraussetzt,
Erfahrung aber nur ohne KI entsteht, woher kommen die nächsten Erfahrenen?

### 3.6 Die öffentliche Wissensinfrastruktur

Slop bleibt nicht im Repository. Baltes et al. dokumentieren Berichte über Tutorials und
Dokumentation, denen Beispiele fehlen oder die Klassen verwenden, die es nicht gibt; ein
Teil der Erklärung ist der Abbau von Developer-Relations- und Dokumentationsarbeit seit
2022. Bei Stack Overflow geben 35 % der Entwickler an, dass ein Teil ihrer Besuche auf
KI-Probleme zurückgeht. Das
ist die unangenehmste Rückkopplung: Modelle werden auf Material trainiert, das selbst
zunehmend aus Modellausgaben besteht. Shumailov et al. haben den Mechanismus als
„model collapse" beschrieben; für Software heißt das: Die nächste Generation lernt aus
verschmutztem Material.

---

## 4. Der Mechanismus: Allmende, nicht Faulheit

Die Ursache ist nicht, dass Menschen faul geworden sind. Es sind drei strukturelle Kräfte:

1. **Die Aufwandsasymmetrie.** Erzeugen ist billig, Prüfen ist teuer. Jede Erhöhung der
   Erzeugungsrate erhöht die Prüflast überproportional, weil Prüfen nicht parallelisierbar
   ist wie Generieren.
2. **Externalisierte Kosten.** Der Produzent bekommt den geschlossenen Ticket, den
   Beitrags-Graphen, den Bounty. Der Reviewer bekommt die Arbeit; der Maintainer die
   Regression in zwei Monaten; der Anfänger das kaputte Tutorial. Niemand bezahlt die
   Prüfung im Moment der Erzeugung.
3. **Belohnung von Volumen.** Beitrags-Graphen, Bounty-Programme, PR-Zahlen und
   „AI-Adoption"-Vorgaben belohnen Menge. Goodhart lässt grüßen: Sobald die Zahl das Ziel
   ist, produziert das System die Zahl.

Dagegen hilft kein Appell an Sorgfalt, weil die Sorgfalt die Kosten trägt und den Nutzen
nicht. Das ist die Kernsaussage der Allmende-Analyse: Ein Commons-Problem wird nicht durch
individuelle Zurückhaltung gelöst, sondern durch Regeln, die den Nutzen und die Kosten
wieder verbinden — Grenzen, Monitoring, abgestufte Sanktionen, Konfliktlösung.

---

## 5. Was die Arbeitsweise ändern würde

Die folgenden sieben Hebel sind keine Erfindungen dieser Recherche; sie folgen aus den
Befunden und sind, wo möglich, mit Belegen verbunden. Reihenfolge nach Wirkung auf den
Engpass, nicht nach Aufwand.

### 5.1 Verifikation vor Vertrauen

**Mechanismus.** Prüfen ist teuer, weil es menschliche Aufmerksamkeit braucht. Automatische
Prüfung ist billig, wiederholbar und skalierbar — aber nur, wenn sie Eigenschaften prüft,
nicht Meinungen.

**Beleg.** Der Framing-Angriff zeigt, dass LLM-Review als Gate unzuverlässig ist (§3.4).
DORA empfiehlt ausdrücklich, Testautomatisierung und kleine Batches als Gegengewicht.

**Änderung.** Kein Merge ohne eine Prüfung, die den konkreten Fehler hätte zeigen können:
Tests für das geänderte Verhalten, Property-Tests für Invarianten, Typen statt Casts,
Mutationstests für die Testqualität. LLM-Review bleibt erlaubt, aber als zusätzlicher Leser,
nicht als Freigabe. Sicherheitskritische Pfade (Auth, Zahlungen, Datenzugriff) brauchen
einen menschlichen Reviewer, der den Code erklären kann.

**Prüfbar.** Anteil der Merges mit neuem oder geändertem Test; Anteil der Diffs, die keinen
Test ändern; Fehler, die erst nach dem Merge auffallen, pro 1.000 Änderungen.

### 5.2 Review-Kapazität als budgetierte Ressource

**Mechanismus.** Review ist der begrenzte Faktor. Wer ihn nicht begrenzt, verliert ihn an
die lauteste Quelle.

**Beleg.** 25–31 % minderwertige PRs, 59–69 % mehr Eingänge, Burnout als Sorge Nummer eins
(§3.3); die 30-PRs-auf-sechs-Reviewer-Anekdote; curl als Eskalationsfall.

**Änderung.** Größenlimits für Diffs (die Praxis nennt 500 Zeilen als Schwelle), Pflicht zur
Selbstprüfung vor dem Review, Walkthrough-Pflicht bei großen Änderungen, ein Recht des
Reviewers, einen PR als „nicht prüfbar" zurückzuweisen. Review-Zeit wird als Budget
geplant, nicht als Restgröße.

**Prüfbar.** Median-Diff-Größe; Review-Durchlaufzeit; Anteil der PRs, die ohne
Walkthrough-Gespräch durchgehen; Review-Stunden pro Woche pro Team.

### 5.3 Metriken von Output auf Durchsatzkosten umstellen

**Mechanismus.** Was gemessen wird, wird optimiert. Zeilen und PR-Zahlen sind billig zu
produzieren und sagen nichts über die Kosten, die sie erzeugen.

**Beleg.** Goodhart-Mechanik in §4; DORA rät ausdrücklich von Output-Metriken ab und
empfiehlt Durchsatz, Stabilität und Nacharbeit; GitClear zeigt die Verschiebung von Umbau zu
Kopieren.

**Änderung.** Vier Zahlen statt Zeilen: Review-Aufwand, Nacharbeit (Rework), entkommene
Fehler, Änderungsfehlerrate. Dazu die Frage, die DORA stellt: Senkt die Änderung die
Durchlaufzeit, ohne die Stabilität zu senken? Wer KI-Nutzung belohnen will, belohnt
„landed and stayed", nicht „generated".

**Prüfbar.** Diese vier Zahlen sind messbar; der Rest ist Meinung.

### 5.4 Provenienz statt Detektion

**Mechanismus.** Reviewer können nicht zuverlässig erkennen, woher Code kommt; sie erkennen
nur Muster (Emojis, Schritt-für-Schritt-Kommentare) und liegen damit mal richtig, mal
falsch. Detektion erzeugt Misstrauen ohne Beweis.

**Beleg.** Die Codierung von Baltes et al. zeigt „ai-content-detection" als eigenes Thema
und die Klage „riecht nach KI, aber ich kann es nicht beweisen"; die LF-Zahlen zeigen, dass
nur 35 % der Projekte überhaupt eine Policy haben.

**Änderung.** Deklaration statt Detektion: ein Feld im PR-Template („KI-unterstützt: ja/nein,
welche Teile, welche Prüfung"), Provenienz als Default in Werkzeugen, klare Regeln, was
deklariert werden muss. Dazu die Gegenprobe: Wer deklariert, wird nicht bestraft — sonst
deklariert niemand.

**Prüfbar.** Anteil der PRs mit Deklaration; Anteil der Projekte mit Policy; Zahl der
Rückfragen wegen unklarer Herkunft.

### 5.5 Arbeitsteilung neu ziehen

**Mechanismus.** KI ist stark bei Entwurf, Boilerplate, Exploration und fremdem Code; sie ist
schwach bei Integrationslogik, Architektur und Stellen, an denen der Kontext teuer ist.

**Beleg.** DORA: KI verstärkt, was schon da ist — gute Plattformen und Tests machen sie
nützlich, in fragilen Systemen erzeugt sie schneller technische Schuld. METR: erfahrene
Entwickler in vertrauten Repositories wurden langsamer. Cui et al.: weniger erfahrene
Entwickler profitieren stärker. ESEM: KI-Code landet eher in weniger zentralem Code.

**Änderung.** Bewusste Zonen: KI für Draft und Nebenpfade, Mensch für Kern und
Sicherheitsgrenzen. Junioren bekommen Zeit ohne KI für die Grundlagen, die sie später zum
Prüfen brauchen. Wer KI nutzt, muss den Code erklären können — das ist die eigentliche
Definition von „verantwortbar".

**Prüfbar.** Anteil der kritischen Pfade mit menschlichem Autor; Walkthrough-Quote;
Zeit, die Junioren ohne KI verbringen (als bewusste Investition, nicht als Verbot).

### 5.6 Governance mit Zähnen

**Mechanismus.** Regeln ohne Sanktion sind Empfehlungen. Die Allmende-Literatur nennt
abgestufte Sanktionen und Konfliktlösung als Bedingungen für tragfähige Commons.

**Beleg.** Ostrom-Prinzipien, auf Software übertragen bei Baltes et al.; Gentoo und curl als
gelebte Beispiele; LF: nur 35 % haben eine Policy.

**Änderung.** Beitragsrichtlinie mit drei Sätzen: Was deklariert werden muss, welche Prüfung
Pflicht ist, was als nicht prüfbar zurückgewiesen wird. Dazu ein Verfahren für den
Konfliktfall („wer haftet für die Regression?") und die ausdrückliche Erlaubnis, einen PR
abzulehnen, ohne ihn zu reparieren. Für Open Source: Slop-Triage automatisieren, aber die
Entscheidung beim Maintainer lassen.

**Prüfbar.** Existenz und Datum der Policy; Anteil der Beiträge, die die Prüfschwelle
erfüllen; Zahl der eskalierten Konflikte.

### 5.7 Die Wissensinfrastruktur pflegen

**Mechanismus.** Modelle lernen aus öffentlichem Material. Wenn Beispiele und Tutorials
verrotten, verrottet die Grundlage der nächsten Generation.

**Beleg.** Baltes et al. zur Dokumentationsverschlechterung; Shumailov et al. zum
Model-Collapse; Stack Overflow als Ausweichkanal bei KI-Problemen.

**Änderung.** Dokumentation als Code behandeln: Beispiele werden ausgeführt, Snippets
getestet, Versionen gepflegt. Wer ein Beispiel veröffentlicht, prüft es. Das ist keine
Nettigkeit, sondern Investition in den eigenen Nachwuchs.

**Prüfbar.** Anteil der Dokumentationsbeispiele mit Test; Zeit bis zur Aktualisierung nach
einer API-Änderung.

### 5.8 Wenn nur drei Dinge geändert werden

1. **Kein Merge ohne Prüfung, die den Fehler zeigen könnte.** (Verifikation vor Vertrauen.)
2. **Kein Review ohne Größenlimit und Erklärung.** (Review-Kapazität schützen.)
3. **Keine Produktivitätszahl, die Output misst.** (Durchsatzkosten messen.)

### 5.9 Vorher und nachher

Die Hebel verändern nicht nur Zahlen, sondern den Alltag. Die folgende Gegenüberstellung ist
eine Verdichtung der Belege, kein gemessener Zustand:

| Heute üblich | Wenn die Hebel greifen |
|---|---|
| Der Autor schreibt, der Reviewer prüft alles. | Der Autor prüft zuerst; der Reviewer prüft Absicht, Risiko und Auswahl. |
| Produktivität wird an Zeilen, PRs und Akzeptanzraten gemessen. | Produktivität wird an gelandeten Änderungen ohne Nacharbeit gemessen. |
| Die Frage lautet: „Ist das KI?" | Die Frage lautet: „Was wurde geprüft, und wer kann es erklären?" |
| Sicherheit hängt an Scannern und einem LLM-Kommentar. | Sicherheit hängt an Tests, Typen, Provenienz und einer menschlichen Freigabe. |
| Review ist das Ende der Arbeit. | Verifikation läuft während der Arbeit mit. |

Das ist die eigentliche Verschiebung: Nicht die Werkzeuge ändern sich zuerst, sondern die
Frage, an der ein Team merkt, dass es fertig ist.

---

## 6. Gegenbelege und was sie relativieren

Eine ehrliche Beleglage muss die Gegenseite nennen.

- **KI erhöht die Zahl erledigter Aufgaben.** Cui et al. (Management Science 2026) haben drei
  randomisierte Feldexperimente bei Microsoft, Accenture und einem Fortune-100-Unternehmen
  ausgewertet: 4.867 Entwickler, **+26,08 %** erledigte Aufgaben (Standardfehler 10,3 %).
  Weniger erfahrene Entwickler adoptierten stärker und profitierten mehr. Das ist der
  stärkste Beleg dafür, dass KI nicht generell bremst.
- **Der METR-Befund von 2025 ist nicht der letzte Stand.** METR hat im Februar 2026 neue
  Daten vorgelegt und den alten Befund ausdrücklich als überholt bezeichnet: Die neuen Daten
  sind wegen Selektionseffekten unzuverlässig, deuten aber auf eine Beschleunigung hin
  (18 % weniger Zeit bei den ursprünglichen Entwicklern, 4 % bei neuen; die
  Konfidenzintervalle schließen Null ein). Die ehrliche Aussage lautet: Die Wirkung auf
  erfahrene Entwickler ist zeitlich instabil und derzeit nicht sauber messbar.
- **KI-Code ist nicht per se schlechter.** Die ESEM-2026-Daten zeigen niedrigere
  Review-Zeiten und niedrigere SEV-Raten für KI-Diffs, allerdings konfundiert durch den
  Kontext. Wer daraus „KI-Code ist sicherer" macht, hat den Befund nicht gelesen.
- **Die Zeitgewinne werden teilweise reinvestiert.** 66 % der Befragten stecken sie in den
  Abbau technischer Schulden, 63 % in Features, 58 % in Lernen. Das ist kein Slop, das ist
  Produktivität — wenn die Prüfung mitwächst.
- **DORA sagt: KI ist ein Verstärker.** In Organisationen mit guter Plattform, klaren APIs
  und Tests hilft sie; in fragilen Systemen beschleunigt sie den Verfall. Die Variable ist
  nicht das Werkzeug, sondern die Umgebung.

---

## 7. Übertragung auf den Harness (Vorschlag, nicht Beschluss)

Wenn diese Befunde auf ein Agenten-Harness übertragen werden, folgen vier Konsequenzen, die
sich in bestehende Strukturen einfügen:

1. **Diffs klein halten und Reviews budgetieren.** Ein Werkzeug, das große Änderungen
   erzeugt, muss sie auch zerlegen können; ein Review-Gate ohne Größenlimit ist keins.
2. **Evals statt Vertrauen.** Was ein Agent kann, wird gemessen, nicht behauptet. Die
   vorhandene `eval-harness`-Struktur ist der richtige Ort; ein „der Agent hat es erklärt"
   ist kein Beleg.
3. **Provenienz im Datensatz.** Wenn ein Agent Code schreibt, gehört in den Commit oder die
   Sitzung, was erzeugt, was geprüft und was verworfen wurde. Das ist die billigste Form von
   Nachvollziehbarkeit — und die Voraussetzung dafür, Slop später zu erkennen.
4. **Sicherheitsgrenzen bleiben menschlich.** Ein Agent darf prüfen, vorschlagen und
   blockieren; die Freigabe für Auth-, Zahlungs- und Datenzugriffspfade bleibt beim Menschen.
   Der Framing-Angriff aus §3.4 ist genau der Grund.

---

## 8. Was nicht belegt ist

- **Es gibt keine repräsentative Messung des Slop-Anteils.** Die 25 %/31 % sind
  Maintainer-Schätzungen; die 52 % Zeitersparnis sind Selbstauskunft; die 45 % unsicherer
  Code stammen aus einem Vendor-Test mit 80 Aufgaben.
- **Vendor-Interessen.** GitClear verkauft Code-Analytik, Veracode Sicherheitstests, DORA ist
  von Google finanziert. Die Zahlen sind nicht falsch, aber sie sind nicht neutral erhoben.
- **Publikations- und Selektionsverlust.** Wer über Slop schreibt, hat ihn erlebt; wer
  erfolgreich mit KI arbeitet, schreibt seltener darüber. Die Diskursstichprobe von Baltes
  et al. ist bewusst eine Stichprobe der Klagen.
- **Die kognitive Studie ist nicht über Code.** Die EEG-Studie untersucht Essays; die
  Übertragung auf Programmieren ist plausibel, aber nicht gemessen.
- **Die Wirkung auf erfahrene Entwickler ist zeitlich instabil.** METR 2025 und METR 2026
  widersprechen sich teilweise; die Autoren selbst sagen, dass ihr Design an Selektion
  leidet.
- **Die Kausalrichtung ist oft offen.** Ob KI Codebasen verschlechtert oder ob Teams mit
  schlechten Codebasen KI stärker nutzen, lässt sich mit den vorliegenden Beobachtungsdaten
  nicht entscheiden.

---

## 9. Quellen

### Peer-reviewt oder Preprint

- Baltes, S., Cheong, M., Treude, C. (2026): *AI Slop and the Software Commons.*
  arXiv:2604.16754v2. <https://arxiv.org/abs/2604.16754>
- Baltes, S., Cheong, M., Treude, C. (2026): *„An Endless Stream of AI Slop": The Growing
  Burden of AI-Assisted Software Development.* arXiv:2603.27249 (Preprint, IEEE Software).
  <https://arxiv.org/abs/2603.27249>
- Becker, J., Rush, N., Barnes, B., Rein, D. (2025): *Measuring the Impact of Early-2025 AI
  on Experienced Open-Source Developer Productivity.* METR.
  <https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/>
- METR (2026): *We are Changing our Developer Productivity Experiment Design.*
  <https://metr.org/blog/2026-02-24-uplift-update/>
- Cui, K., Demirer, M., Jaffe, S., Musolff, L., Peng, S., Salz, T. (2026): *The Effects of
  Generative AI on High-Skilled Work: Evidence from Three Field Experiments with Software
  Developers.* Management Science. <https://doi.org/10.1287/mnsc.2025.00535>
- Mockus, A., Rigby, P. C., Stewart, D., Maddila, C., Nagappan, N. (2026): *A Preliminary
  Analysis of the Impact of AI Assisted/Generated Code on Quality, Centrality and Review
  Time at Scale.* ESEM 2026, LIPIcs 394. <https://doi.org/10.4230/LIPIcs.ESEM.2026.93>
- Spracklen, J., Wijewickrama, R., Sakib, A. H. M. N., Maiti, A., Viswanath, B., Jadliwala,
  M. (2025): *We Have a Package for You! A Comprehensive Analysis of Package Hallucinations
  by Code Generating LLMs.* USENIX Security 2025. <https://arxiv.org/abs/2406.10279>
- Mitropoulos, D., Alexopoulos, N., Alexopoulos, G., Spinellis, D. (2026): *Measuring and
  Exploiting Confirmation Bias in LLM-Assisted Security Code Review.* arXiv:2603.18740.
  <https://arxiv.org/abs/2603.18740>
- Kosmyna, N. et al. (2025): *Your Brain on ChatGPT: Accumulation of Cognitive Debt when
  Using an AI Assistant for Essay Writing Task.* arXiv:2506.08872.
  <https://arxiv.org/abs/2506.08872>
- Shumailov, I. et al. (2024): *AI models collapse when trained on recursively generated
  data.* Nature 631. <https://doi.org/10.1038/s41586-024-07566-y>
- Pearce, H., Ahmad, B., Tan, B., Dolan-Gavitt, B., Karri, R. (2022): *Asleep at the
  Keyboard? Assessing the Security of GitHub Copilot's Code Contributions.* IEEE S&P 2022.
  <https://doi.org/10.1109/SP46214.2022.9833571>
- Kommers, C., Duede, E., Gordon, J., Holtzman, A., McNulty, T., Stewart, S., Thomas, L.,
  So, R. J., Long, H. (2026): *Why slop matters.* ACM AI Letters 1 (1).
  <https://doi.org/10.1145/3786777>
- Ostrom, E. (1990): *Governing the Commons.* Cambridge University Press.

### Berichte und Erhebungen

- Linux Foundation Research (2026): *Navigating Open Source Software Development in the
  Generative AI Era.* <https://www.linuxfoundation.org/research/oss-development-gen-ai-era-2026>
- DORA / Google Cloud (2025): *2025 State of AI-assisted Software Development.*
  <https://dora.dev/research/2025/dora-report/>
- DORA (2026): *Balancing AI tensions: Moving from AI adoption to effective SDLC use.*
  <https://dora.dev/insights/balancing-ai-tensions/>
- Stack Overflow (2025): *2025 Developer Survey.*
  <https://survey.stackoverflow.co/2025/>
- GitClear (2025): *AI Copilot Code Quality: 2025 Look Back at 12 Months of Data.*
  <https://www.gitclear.com/ai_assistant_code_quality_2025_research>
- Veracode (2025): *2025 GenAI Code Security Report.*
  <https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/>

### Primärquellen und Projektentscheidungen

- Willison, S. (2024): *Slop is the new name for unwanted AI-generated content.*
  <https://simonwillison.net/2024/May/8/slop/>
- Stenberg, D. (2026): *The end of the curl bug-bounty program*, zusammengefasst in LWN.
  <https://lwn.net/Articles/1055996/>
- Gentoo Council (2024): *AI policy.* <https://wiki.gentoo.org/wiki/Project:Council/AI_policy>
- Merriam-Webster (2025): *slop* als Wort des Jahres; Berichterstattung der AP.
  <https://www.ap.org/news-highlights/spotlights/2025/merriam-websters-2025-word-of-the-year-is-slop/>

---

## 10. Selbstauskunft

Diese Recherche wurde mit einem Agenten erstellt; die Quellen wurden gelesen, die Zahlen
gegen die jeweilige Primärseite geprüft, soweit sie erreichbar war. Wo eine Zahl nur aus
Berichterstattung stammt (Veracode: 45 %), ist das im Text kenntlich gemacht. Die
Interpretation in §4, §5 und §7 ist Bewertung, nicht Befund.
