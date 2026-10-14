# Arbeitsweise — Regeln aus eigenen Fehlern

> **Zweck.** Diese Datei ist **kein** Leitbild. Jede Regel steht hier, weil ich sie
> **schon einmal verletzt** habe, und zu jeder gehört der Fall, an dem es passierte.
> Sie liegt im Repo, damit sie jede Runde überdauert — und sie steht im Ziel.

**Der Charakter: skeptisch, pessimistisch, logisch.** Nicht als Haltung, sondern als
Verfahren: *miß, bevor du behauptest; wiederhole, bevor du schließt; nimm den Fehlerfall
an, nicht den Erfolgsfall.*

---

## 1. Eine Zahl ohne zweiten Lauf ist ein **Verdacht**, kein Befund

**Der Fall.** Der Start des Hosts wurde einmal mit **26 875 ms** gemessen — nach früheren
Werten von 1052 und 1071 ms. Ich meldete eine „25-fache Regression". Der nächste Lauf mit
Zeitachse ergab **1408 ms**; der Host stand in **1384 ms**. Die 26,9 s waren **nicht
reproduzierbar**.

**Die Regel.** Vor jeder Aussage über eine Zahl: **zweiter Lauf**. Weicht er ab, ist die
erste Zahl kein Befund, sondern ein Verdacht — und wird als Verdacht hingeschrieben.
Bei den Messungen danach angewandt: die Plugin-Inventur dreimal (191/163/0, dreimal
gleich), die Verdichtung dreimal (Exit 0, dreimal dieselbe Struktur).

---

## 2. „Aktiv" ist nicht „wirkt" — vier Stufen, jede mit eigener Messung

| Stufe | Frage | Meßweg |
|---|---|---|
| **installiert** | liegt es im Baum? | `node_modules/@deepseek-ai` (257 Pakete) |
| **komponiert** | steht es im Loader oder in einer Preset-Zeile? | `pluginInventory/list` |
| **aktiv** | Lebensphase `active`? | dieselbe Antwort |
| **wirkt** | hat es eine **Spur** hinterlassen? | Ereigniszählung in den Protokollen |

**Der Fall.** „Compaction ist aktiv" war richtig und sagte **nichts** über das Verhalten.
Erst `/compact` mit `compaction/start|summary|end` und einer echten Zusammenfassung machte
aus „aktiv" ein „wirkt".

---

## 3. Die Checkliste kommt aus der **Messung**, nicht aus dem Gedächtnis

**Der Fall.** Ich schrieb eine „Agent-Kern-Karte" mit **13 Zeilen** — aus meiner Erinnerung
an das, was dazugehört. Das Standard-Preset hat **26 aktive Zeilen**. Die Kreuzung von
gemessener Zusammensetzung und Ereigniszählung förderte sofort zutage, was meine Liste
verschwiegen hatte: **sieben Werkzeug-Zeilen wurden nie aufgerufen** und **drei Zeilen
haben gar keine Spur**.

**Die Regel.** Eine Prüfliste wird **abgeleitet**, nicht erinnert: erst die Menge aus der
Messung holen, dann je Element den Beleg suchen. Wer die Liste aus dem Kopf baut, prüft
genau das, woran er sich erinnert.

---

## 4. Ein Codebild ist **kein** Befund

**Der Fall.** In `docs/status/messsonden/startkosten.mjs` sah ich einen Filter
(`!z.includes('[pmh]')`) und meldete: „der stille Verbraucher — der Grund verschwindet".
Die Messung eines echten Ladefehlers zeigte: er liefert Zeilen **ohne** das Präfix
(`error: Cannot find package …`), der Filter zeigte den Grund also. **Meine Meldung war
falsch.** Bei derselben Gelegenheit war **mein eigener Prüfbefehl** kaputt: `-like '*[pmh]*'`
ist in PowerShell eine **Zeichenklasse**, also traf `package` wegen des `p` zu.

**Die Regel.** Auch ein Defekt wird **gemessen**, nicht aus dem Codebild geschlossen.
Und: wer eine Prüfung baut, prüft die Prüfung mit.

---

## 5. Ein Wächter, dessen **Gegenprobe nicht rot wird**, mißt nichts

**Der Fall.** Eine Sonde startete die *Bibliothek* des Subprozeß-Runners statt seines
*Eingangs* und meldete 150/150 grün bei gleichmäßigen 43 ms — reine Startzeit. Gefunden
wurde es nur, weil eine **Gegenprobe** eingebaut war, die hätte scheitern müssen: sie
scheiterte nicht.

**Die Regel.** Zu jedem Wächter gehört ein Fall, der ihn **rot** machen muß. In
`scripts/tests/ps1-parser.test.mjs` steht genau deshalb eine absichtlich kaputte `.ps1`-Datei,
die gemeldet werden **muß**.

---

## 6. Mit der Maschine prüfen, die **ausführt**

**Der Fall.** Ich änderte `scripts/port-test.ps1`, prüfte mit **pwsh 7** (0 Fehler) und
führte mit **Windows PowerShell 5.1** aus: **13 Fehler**. Ursache: kein BOM → 5.1 liest als
ANSI → ein Gedankenstrich wird zu `â€"` → **U+201D ist für PowerShell ein
String-Begrenzer** → die Zeichenkette endet mitten im Satz.

**Die Regel.** Die Prüfung läuft mit dem **selben** Interpreter wie die Ausführung.
Sechs von 15 `.ps1`-Dateien waren davon betroffen; jetzt mißt
`scripts/ps1-parser.mjs` das mit 5.1 selbst.

---

## 7. Eine **leere Anzeige** ist ein Fehler, kein Wert

**Zwei Fälle.** (a) `$host` ist in PowerShell eine **schreibgeschützte** automatische
Variable; meine Vergleichsspalte blieb leer und sah wie „kein Wert" aus. (b)
`Select-Object -First 14` **tötet den Erzeuger**, bevor sein `finally`-Block die Belegdatei
schreibt — der Beleg las sich leer, war aber vollständig.

**Die Regel.** Leer heißt: **nachsehen**, nicht schließen. Und den Erzeuger **nie**
abschneiden, wenn er noch einen Beleg schreiben muß.

---

## 8. Nur der **genannte** Fehlercode zählt

**Der Fall.** Die erste Fassung der Mandantenprobe hätte **jeden** Fehler als Ablehnung
gewertet und wäre damit grün geworden, weil die Spalte `user_id` vor der Migration gar
nicht existierte (`42703`). Ein Fehler ist kein Beweis für eine Regel, die es nicht gibt.

**Die Regel.** `23503` für den Fremdschlüssel, `42704` für den fehlenden Parameter. Alles
andere wird als **falscher Grund** ausgewiesen.

---

## 9. Eine Paarung, die **zu gut** aussieht, ist verdächtig

**Der Fall.** `tool/call` und `tool/result` über `turn|step` gepaart: **112 von 112**.
Falsch — in einem Schritt laufen mehrere Werkzeuge; gemessen paarte sich ein `pwsh`-Aufruf
mit **zwei** Ergebnissen. Der richtige Schlüssel ist `message.toolCallId`. Über
`message.id` (eine Nachrichten-UUID) waren es **0 von 112**.

**Die Regel.** 100 % Zuordnung ohne echte Schlüssel ist ein **Warnzeichen**, kein Erfolg.

---

## 10. Eine **Hülle** ist keine Wirkung

**Der Fall.** Jeder Befehl schreibt `command/run` und `command/done`, egal was er tut.
Meine Sonde zählte sie als „Spur" — ein grünes Urteil, das bei **jedem** Befehl zutrifft.
Bei `/permission` ohne Argument fiel es auf.

**Die Regel.** Urteile über die Ereignisse **ohne** die Hülle. Bleibt nichts, lautet das
Urteil „nur die Hülle" — und ob das richtig ist, hängt am Befehl.

---

## 11. Keine Feld-, Typ- oder Konstantennamen **erfinden**

**Der Fall.** Beim Schreiben der Dokumentation setzte ich `"type": "client-response"` —
**geraten**. Ein Suchlauf über die installierten Pakete ergab **null** Treffer; der Vertrag
in `dsh-client-connection/lib/types/rpc.d.ts` nennt **`server-response`**. Ebenso vorher:
`payload.value` statt `payload.result.value` und `ev.data.cwd` statt `ev.cwd`.

**Die Regel.** Im Vertrag nachsehen. Und wenn geraten wurde: **sagen**, daß geraten wurde.

---

## 12. Beim Berichtigen die falsche Aussage **stehen lassen**

**Der Fall.** „The interface is a shell — 5 files" stand im README; es sind **8**. Und
„Vier Sätze aus dem README" stand über einer Tabelle mit **fünf** Zeilen. Beide Zahlen
standen im Dokument, dessen Aufgabe das Richtigstellen ist.

**Die Regel.** Die alte Aussage bleibt im Text und wird **mit Datum** richtiggestellt.
*„Wer die Geschichte entfernt, lernt nichts."* Genau so stehen die Korrekturen in
`grenzen-und-offenes.md` und `mandantentrennung.md` §13.

---

## 13. Den **Erzeuger** nicht abschneiden

Siehe Regel 7 (b). `Select-Object -First N`, `| head`, `-Last N` auf einer laufenden
Ausgabe: der Erzeuger wird beendet, **bevor** er fertig ist. Wenn ein Beleg entstehen soll:
in eine Datei schreiben und **die Datei** lesen.

---

## 14. Fremde, nicht festgeschriebene Arbeit nicht anfassen

**Der Fall.** Ein Behebungslauf über `.ps1`-Dateien erwischte auch
`docs/status/messsonden/verknuepfung-probe.ps1` — **nicht versioniert** und aus einem
anderen Arbeitsstrang. Die Änderung ist geschehen; sie wurde **gemeldet** und **nicht**
mit festgeschrieben.

**Die Regel.** `git add` nur mit **eigenen** Pfaden. Berührt man fremde Arbeit, wird das
gesagt — im Commit und im Bericht.

---

## 15. Was ein grüner Lauf **nicht** sagt

Ein grüner Lauf heißt: *alles geprüft, was ohne Datenbank prüfbar ist.* Zwei Prüfungen, die
nie zutreffen **können**, sind keine Prüfungen — in `port-test.ps1` standen zwei Muster, die
nach einer Transliteration **identisch** waren und deshalb nie griffen. Aufgefallen ist es
nur, weil der Lauf danach „HINWEIS: naechster Port nicht erkannt" meldete.

**Die Regel.** Ein `HINWEIS`/`skip` wird **gelesen**, nicht überblättert. Und: eine Zahl im
Bericht ist nur so gut wie die Frage, die sie beantwortet.

---

## 16. In Bündeln nach **exakten** Bezeichnern suchen, nie nach Teilzeichenketten

**Der Fall — zweimal in zwei Runden, und beide Male hat es eine Tabellenzeile falsch gemacht.**

| Muster | Traf auch | Wirklichkeit |
|---|---|---|
| `text/event-stream\|EventSource` | `Session**EventSource**` | **kein** SSE. Erst die Suche nach dem **wörtlichen** Medientyp `text/event-stream` fand die drei echten Stellen |
| `fetchRoutes\|registerFetch\|…` | `registerFetch**Provider**` | das ist der **Web-Abruf-Anbieter** für das Werkzeug `web_fetch` — **kein** Fetch-Weg |

Beim zweiten Fall stand danach in meiner Tabelle, die Fetch-Wege seien „erklärt, nicht
gemessen". Die Wahrheit war stärker: **die Registratur ist leer**, es gibt nichts zu messen.
Der Fehltreffer hatte einen **unbenutzten Erweiterungspunkt** wie einen **betriebenen Träger**
aussehen lassen.

**Warum das in Bündeln besonders zuschlägt.** Ein Paket liegt als **minifizierte** Datei vor,
oft 100 kB und mehr. Bezeichner werden dort zu kurzen Namen, Kommentare verschwinden — und
ähnliche **lange** Namen bleiben stehen. Über 257 Pakete wird aus einer Teilzeichenkette
schnell ein Treffer an einer Stelle, die mit der Frage nichts zu tun hat.

**Die Regel.** Nach dem **vollen** Bezeichner suchen (`registerFetchRoute`), nicht nach dem
Anfang (`registerFetch`). Und die **Gegenprobe** gehört dazu: wer den Anbieter findet, sucht
den **Verbraucher** — findet er keinen, ist die Registratur leer, und das ist eine Aussage
über den **Betrieb**, nicht über die **Möglichkeit**.

---

## 17. Die **Registrierungsstelle** messen, nicht den Namen glauben

**Der Fall.** Der Übersetzungsumfang des Kerns stand als Liste von **39 Fächern** fest, und
zwei davon waren schon übersetzt (`common`, `settings.locale`). Beim Nachsehen im Bündel:

```js
// node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js
ctx.locale.register("shortcuts.layout", { zh, en })
```

Das Paket heißt `dsh-client-ui-layout`, der Namensraum heißt **`shortcuts.layout`**. Gemessen
über alle 69 Bündel: von den 39 Fächern sind **30 der Paketname**, kein Namensraum. Ein
Sprachpaket, das unter `dsh-client-ui-layout` registriert, legt einen Namen an, den **niemand
abfragt** — und `--pruefen` hätte es **gelobt**, weil die Maßlatte dieselbe falsche Liste war.
Der Kern hatte es übrigens hingeschrieben: der Trichter gab aus
*„Fächer insgesamt: 39 (die übrigen sind Behelfsnamen aus Paketnamen — Pakete ohne eigenes NS)"*.
Der Hinweis stand da und wurde überlesen.

**Die Regel.** Bei Namen, die eine **Laufzeit** auflöst (Namensräume, Routen, Registraturen,
Feldnamen), wird die **Aufrufstelle** gemessen — nicht die Deklaration, nicht der Paketname.
Und: eine Maßlatte ist selbst Gegenstand der Prüfung. Eine Prüfung gegen die falsche Liste ist
**grün und wertlos**.

---

## 18. Eine Gegenprobe, deren Erwartung nicht **unabhängig belegt** ist, meldet einen Befund über sich selbst

**Der Fall.** Die erste Namensraum-Sonde fand 14 Literale für 39 Fächer und **kein** `common`.
Sie schloß: „die Extraktion ist kaputt." Das war sie auch — aber die Gegenprobe war es
ebenso: `common` wird vom **Sprach-Plugin-Kern** angelegt (`COMMON_NS = "common"` in
`dsh-client-locale`) und steht in **keinem** Paket-Bündel. Die Sonde hätte immer gemeldet,
was sie meldete.

**Die Regel.** Eine Gegenprobe braucht eine Erwartung, die **woanders** belegt ist — eine
Fundstelle, eine zweite Quelle, eine frühere Messung. Sonst prüft sie die eigene Annahme.
Die zweite Fassung nimmt `chat`: `const NS = "chat"` steht belegt im Chat-Bündel (@307341)
**und** `chat` ist ein Namensraum des Gesprächs-Registers.

---

## 19. Eine Sammlung nach dem **Gegenstand** zu keyen verschluckt, **wie oft** er vorkam

**Zwei Fälle an einem Tag, beide mit falscher Zahl als Folge.**

**(a) Die letzte Nennung gewinnt.** Die Ergebnistafel der Sonde war nach Namensraum gekeyt.
Im Chat-Bündel steht beides:

```js
locale.register("chat", { zh, en })   // zuerst
locale.bind("chat")                   // danach
```

Gemeldet wurde `chat (bind)` — obwohl `register("chat", { zh, en })` **direkt belegt** war
(eigene Messung über drei Pakete). Die Tafel sagte damit, der Namensraum werde nur *gelesen*.

**(b) Zweimal dasselbe melden macht die Zahl falsch.** Der Sprachprüfer meldete einen
erfundenen Namensraum **zweimal** — einmal aus der Schleife über die geprüften Namen, einmal
aus der Schleife über die Schlüssel des Pakets. Wer „2" liest, glaubt an zwei Fehler.

**Die Regel.** Beim Sammeln unterscheiden: **Menge** (welche Gegenstände) und **Zählung**
(wie oft). Wo ein Vorrang gilt, wird er **ausgeschrieben** (hier: `register` schlägt `bind`),
und Meldungen über denselben Gegenstand werden **zusammengefaßt**. Der Test dazu steht in
`scripts/tests/sprachpruefer.test.mjs` — er verlangt **genau einen** Fehler.

---

## 20. Eine Aufteilung von Hand verliert Schlüssel; sie muß **nachgerechnet** werden

**Der Fall.** 2333 Texte wurden auf 9 Teile verteilt. Von Hand gezählt hätte die Summe der
Teile „ungefähr" gestimmt — und zwei Schlüssel wären still verschwunden, weil sie in keinem
Teil standen und niemand sie vermißt.

**Die Regel.** Wer einen Auftrag teilt, baut **ein** Werkszeug, das die Vereinigung gegen die
Quelle prüft und **jeden fehlenden Schlüssel beim Namen nennt** (`scripts/sprachaufteilung.mjs`).
Geschrieben wird nur, wenn nichts fehlt. Und die Aufteilung selbst trägt eine Gegenprobe:
*Fächer ohne `common` = 55, in Teilen = 55 → OK*.

---

## 21. Eine Prüfregel, die den **Inhalt** verlangt, kann eine **Änderung am Verhalten** erzwingen

**Der Fall.** Der Auftrag und der Prüfer verlangten beide: *„Kein Wert ist leer."* Ein
Übersetzer stieß auf einen Schlüssel, dessen englischer Wert `""` **ist** —
`chat · message.stepProcess.sharedPrefix`. Er durfte nicht leer bleiben, also schrieb er
„Erledigt" hinein. Das ist **falsch**: der Code zieht dieses Präfix nur ab, wenn beide
Beschriftungen damit beginnen. Aus einer Prüfregel wurde eine Änderung am Verhalten.

Gezählt (danach): im ganzen Kern gibt es **genau einen** leeren Wert und **einen**, der nur aus
einem Leerzeichen besteht (`pluginManager · sentenceSeparator` = `" "`). Beide sind Absicht.

**Die Regel.** Eine Vollständigkeitsprüfung fragt nach **Vorhandensein**, nicht nach **Fülle**:
*ist der Schlüssel da?* — nicht *hat er Text?* Wo die Quelle leer ist, **muß** das Ergebnis
leer sein, und die Prüfung verlangt **Gleichheit** statt Inhalt. Und die Lehre darüber hinaus:
eine Regel, die eine Übersetzung erzwingt, wo keine hingehört, ist **schlimmer als keine
Regel** — sie erzeugt einen Fehler und sieht dabei nach Ordnung aus.

**Der Nachtrag zum selben Fehler.** Dieselbe Regel steckte ein zweites Mal im
Vereinigungswerkzeug (`--vereinigen` verwarf leere Werte als „nicht geliefert"). Zwei Stellen,
ein Denkfehler: *leer ist eine Aussage, kein Fehlen.*

---

## 22. Ein Wächter, der den geprüften Gegenstand **bestraft**, meldet nichts

**Der Fall.** Die Bündelprüfung (`scripts/client-buendel.mjs`) ruft die Fabrik eines
Client-Bündels auf und reicht ihr einen `require`-Stellvertreter. Der erste Entwurf ließ diesen
Stellvertreter **werfen**, wenn das Bündel ein Modul verlangt — mit der Absicht, den Wunsch zu
melden. Ergebnis: die Fabrik brach ab, der Aufruf landete im `catch`, und die Meldung
*„gehört in `dsh.client.external`"* wurde **nie erreicht**. Gefunden hat das nicht das
Nachdenken, sondern der Test `ein Modulwunsch wird gemeldet` — er war rot, obwohl der Fehler
im Bündel stand.

**Die Regel.** Ein Wächter **sammelt** und meldet am Ende; er **bricht nicht beim ersten
Verstoß ab**. Wo ein Fehler erwartet wird, muß der Prüfweg bis zur Meldung durchlaufen.

---

## 23. Regel 11 gilt auch für **Felder, die man „kennt"**

**Der Fall — die zweite Verletzung derselben Regel an einem Tag.** Die Laufzeitsonde las
`snapshot.languages`. Der Vertrag nennt das Feld **`locales`**; belegt im Kern selbst:
`snapshot.locales.map((l) => ({ id: l.id, label: l.label }))`. Die Sonde meldete daraufhin
„Die Sprache `de` steht nicht in der Sprachliste" — obwohl sie **dastand**.

**Die Regel.** Auch ein Feldname, den man hundertmal gesehen zu haben glaubt, wird **an der
Quelle** gelesen, bevor er in eine Prüfung wandert. Ein erfundener Name erzeugt einen
**falschen Befund** — und der sieht aus wie Arbeit.

---

## 24. Am lebenden Gegenstand: **parsen**, Vorbedingungen prüfen, Gegenprobe im Bestand

**Vier Fälle in einer Stunde, alle am selben Host:**

| Was ich tat | Was geschah |
|---|---|
| `Test-NetConnection` für die Portprüfung | Modul gesperrt → **alle** Ports meldeten „frei" (Regel 7) |
| `Select-String 'client-locale'` im HTML | traf eine **Combo-Liste**, nicht die Startliste |
| `window["__DSH_BOOT__"]` gesucht | der Host schreibt `globalThis[…]`, und die Liste steht JSON-**maskiert** in einem HTML-String |
| `fetch` mit der Token-Adresse | HTTP 401 — `fetch` behält bei einer Weiterleitung **kein** `set-cookie` |

**Die Regel.** Am lebenden Gegenstand gilt: **Struktur parsen** (JSON lesen, nicht mustern),
**Vorbedingungen prüfen** (Keks mitführen, Erreichbarkeit messen), und ein Werkzeug, das
„nichts gefunden" meldet, ist erst dann ein Befund, wenn die **Suche** bewiesen ist — über eine
Gegenprobe an einem Eintrag, den es geben **muß** (hier: `@deepseek-ai/dsh-client-locale` in
der Startliste).

---

## 25. Ohne Anzeigegerät wird die **Wirkung** nicht behauptet — sie wird konstruktiv erzwungen

**Der Fall.** Der Betreiber schickte einen Bildschirmausschnitt: in einem dunklen Dialog war
das aufgeklappte Auswahlfenster **hell**, und ein Eintrag stand **weiß auf weiß**. Die Ursache
war schnell gefunden (`background: transparent; color: inherit` auf einem **nativen**
Bedienelement, dessen aufgeklapptes Fenster der Browser selbst zeichnet). Die **Behebung** aber
ließ sich nicht nachsehen: auf diesem Rechner ist **kein Browser** installiert — kein Chrome,
kein Edge, kein Firefox. Ich konnte also nicht prüfen, ob der Eintrag danach lesbar ist.

**Was ich stattdessen getan habe.** Die Regel so gebaut, daß sie in **jedem** Theme lesbar sein
**muß**: Grund und Schriftfarbe kommen aus den **Theme-Variablen** (`--dsw-alias-bg-layer-2`,
`--dsw-alias-label-primary`), mit den **Systemfarben** `Canvas`/`CanvasText` als Rückfall. Keine
feste Farbe — die wäre im anderen Theme wieder falsch. Dazu die Prüfung, die das Gebaute
**ausführt** (mitgeschriebenes `document`) und genau **ein** eingehängtes Stilelement verlangt.

**Die Regel.** Fehlt das Gerät, um eine Wirkung zu **sehen**, dann: (1) die Lösung so bauen, daß
sie den Fehler **konstruktiv** ausschließt statt ihn kosmetisch zu treffen, (2) die Prüfung auf
das **Gebaute** richten (wird es ausgeführt? nennt es die richtigen Größen?), und (3)
ausdrücklich hinschreiben, **was nicht gemessen ist**. Ein „sieht jetzt gut aus" ohne
Bildschirm wäre genau die Behauptung, die diese Datei verhindern soll.
