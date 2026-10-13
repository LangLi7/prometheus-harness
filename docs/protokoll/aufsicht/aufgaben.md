# Aufgaben der Aufsicht

> Rolle: **Aufsicht (Wächter)**. Diese Liste ist **meine** — nicht die des bauenden Agenten
> (dessen Register liegt in [`../status/arbeitspakete.md`](../status/arbeitspakete.md)).
> Stand: **2026-10-13, 12:05**.

## 1. Dauerauftrag (läuft, bis der Betreiber ihn zurückzieht)

| # | Auftrag | Takt | Wie geprüft wird |
|---|---|---|---|
| D1 | **Behauptungen gegen die Wirklichkeit prüfen** | bei jedem Takt | Git-Ref gegen `origin` (nicht gegen das Gedächtnis), Datei-Mtime, Prozessliste, HTTP-Status |
| D2 | **Zugänge sichern** (`.env`, Modell-API, Datenbank, Tunnel) | bei jedem Takt | `node werkzeuge/zugangs-lage.mjs --pruefen DEEPSEEK_API_KEY <home…>` |
| D3 | **DSH-Anpassungen auf Notwendigkeit prüfen** | bei jeder Änderung am Harness | `git -C C:\Users\Chang\deepseek-harness status --short`, `settings.yaml` gegen Sicherungen (`werkzeuge/settings-vergleich.mjs`) |
| D4 | **Eingriffe außerhalb der Aufgabe benennen** | laufend | Beobachtung: entstehen Dateien, die zur Aufgabe nicht gehören? Werden fremde Installationen angefasst? |
| D5 | **Protokoll fortschreiben** | bei jedem Takt | `protokoll.md` + `protokoll.jsonl`, append-only |

## 2. Meine Aufgaben (Stand jetzt)

| # | Aufgabe | Status | Beleg / Ort |
|---|---|---|---|
| W1 | Recon: Ziel-Repo, DSH-Home, WSL2, Prozesse | **erledigt** | `protokoll.md` 11:26 |
| W2 | Protokoll-Struktur angelegt | **erledigt** | dieser Ordner |
| W3 | Zugangslage geprüft (ohne Geheimwerte) | **erledigt** | Befund **B3** |
| W4 | Behauptungen gegengeprüft (Push, Keys, Migrations) | **erledigt** | `protokoll.md` 11:31–11:34 |
| W5 | Widerspruch zu `t63` belegt (jüngere Sicherung unbenutzt) | **erledigt** | Befund **B1** |
| W6 | Hausregel **H1** (kein Neustart) festgeschrieben | **erledigt** | `README.md` §2 |
| W7 | Hilfe für den Modellzugang bereitgelegt und **angewendet** | **erledigt** | `hilfen/zugang-bereitstellen.mjs`; Nachweis in `befunde.md` B3 Nachtrag (HTTP 200) |
| W8 | Wächter-Befunde und Risiken fortschreiben | **laufend** | `befunde.md` |
| W9 | Entscheidung des Betreibers zu **B1** einholen und umsetzen | **erledigt** | Entscheidung 11:44, Umsetzung 11:47 (`hilfen/b1-nachziehen.mjs`), 4 Änderungen, 3 belegte Auslassungen |
| W10 | Wirkungsnachweis `P8.12` **durch den bauenden Agenten** | **offen, nicht meine Tat** | Hausregel **H2** — der Zugang liegt jetzt in seinem Home bereit; den Aufruf führt er aus |
| W11 | Nachweis, dass `~/.pmh` als Home den `P7.7`-Fehler nicht zurückholt | **offen** | mit `docs/status/messsonden/windows-host-check.ps1` zu fahren, **bevor** eine Vorgabe wechselt |
| W12 | Registereintrag `docs/INDEX.md` | **erledigt** | Abschnitt 9 des Katalogs |
| W13 | Zweiter Lauf für die drei Auslassungen aus B1, falls der Betreiber sie doch will | **offen, wartet auf Wort** | `b1-nachziehen.mjs` ist idempotent; derzeit bewusst ausgesetzt, weil messbar schädlich |
| W14 | Den Rust-Befund (`docs/review/rust-bestand.md`) nachgemessen | **erledigt** | Befund **B6**: Messungen bestätigt, Aussage „kein einziger Aufruf" widerlegt (Aufrufer existiert und ist im eigenen Haus dreifach dokumentiert) |
| W15 | Widerspruch zu den `atomic-write`-Tests klären lassen (17 rot gegen 19 grün) | **offen, liegt beim bauenden Agenten** | Hausregel **H5** — ich führe die Tests nicht aus; der Widerspruch steht im Protokoll |
| W16 | Compose-Umbau und seine Folgen (Befund **B8**) | **erledigt** | Der bauende Agent hat den Stack um 12:05:21 neu aufgesetzt; vier Rollen, Schema `pmh`, 10 Tabellen, Vorgaben gesetzt — von mir nachgemessen |
| W17 | **Warnung: `docker volume prune` löscht den Datenbankstand** | **offen, sicherheitsrelevant** | Das verwaiste Volume `ab00fc2605…` enthält ein intaktes PG-17-Cluster (64,8 MB, read-only geprüft); 18 verwaiste Volumes insgesamt. `down -v` trifft es **nicht**, `prune` **doch** |
| W18 | Rechtetrennung des neuen Stacks prüfen | **erledigt** | Fünf Prüfungen selbst ausgeführt: SELECT erlaubt, DDL/TRUNCATE/INSERT verweigert, Eigentümerin darf anlegen |
| W19 | Reparierte Init-Datei **vor** dem nächsten Neustart prüfen | **erledigt** | `werkzeuge/init-skript-probe.mjs`: SQL in `BEGIN…ROLLBACK`, Exit 0 |
| W20 | Veralteter Zugang in `postgres.test.ts` (Zeile 16 und der `docker run`-Hinweis Zeile 55) | **offen, liegt beim bauenden Agenten** | Die Datei wurde um 12:05:54 geändert, die beiden Stellen aber nicht; der Hinweis kollidiert heute mit dem Compose-Container |
| W21 | Rechteprüfung zusichernd machen (Befund **B9**) | **bereitgelegt, nicht angewendet** | `hilfen/rechte-probe-assertion.sql`; beide Ausgänge getestet (Exit 0 / Exit 1). Die Umsetzung liegt beim bauenden Agenten |
| W22 | Prüfen, ob `sprachwahl-entscheidung-2026.md` (75 KB) belegte oder behauptete Zahlen enthält | **erledigt** | Befund **B12**: PTY-Messung des Dokuments **vollständig reproduziert** (16 Bytes, `isTTY=ja`, `bun:ffi`), offene Zeilendifferenz aufgeklärt (555 Leerzeilen) — **ein Fehler**: Entscheidung 4 trägt den widerlegten Satz „kein Code ruft es auf" weiter |
| W23 | Betreiber-Weisung (`decisions/betreiber-weisung-2026-10-13.md`) nachgemessen | **erledigt** | Befund **B10**: Krypto, Umschlagverschlüsselung, RLS-Fehlstand und Adapterzeilen exakt bestätigt; Historien-Behauptung mit den **echten** Werten definitiv bestätigt (null Treffer in 27 Commits); **ein harter Fehler**: die Vorlage-Tabelle zitiert den Arbeitsbaum |
| W24 | `geheimnis-historie.mjs` regelmäßig laufen lassen (Geheimnis-Historie) | **neu, wiederkehrend** | Läuft in Sekunden; ein Treffer wäre ein Rotationsfall — gehört in jeden Takt |
| W25 | Neue Messungen des bauenden Agenten nachprüfen (Boot-Sonde, Zahlen) | **erledigt** | Befund **B11**: 17 Pakete exakt, Zeit reproduziert, „tsgo ist Go" im Binärprogramm belegt; **ein Befund**: Zeile 103 der Sonde tötet fremde `bun`-Prozesse nach Name und Alter |
| W26 | Wurzel-Dokumente einordnen lassen (55 KB + 86 KB) | **offen, Hinweis liegt vor** | `docs/research/` wäre der Ort; das gleichartige `sprachwahl-entscheidung-2026.md` liegt dort bereits |
| W27 | Die fünf Tötungszeilen nach Name und Alter (Befund **B13**) | **offen, liegt beim bauenden Agenten** | Fenster 1/2/3/3/**5** Minuten; betroffen `boot-schleife.ps1`, `port-test.ps1` (2×), `api-flaeche.ps1`, `api-test.ps1`. Die DSH-GUI ist **nicht** betroffen (sie läuft auf `node`) |
| W28 | Größenvergleich zur Referenz nachgemessen | **erledigt** | Fast alles exakt bestätigt; nur `target/` weicht um ~20 MB (2,8 %) bei gleicher Dateizahl ab — Ursache offen, Schlussfolgerung unberührt |
| W29 | Sind die dokumentierten `.env`-Namen das, was der Code liest? | **erledigt** | Befund **B14**: `PMH_MASTER_KEY` und `MIGRATION_DATABASE_URL` werden von **nichts** gelesen; die Umschlagverschlüsselung ist Schema, nicht Code. Entlastet: `PMH_APP_USER` (9) und `PMH_OWNER_USER` (14) werden wirklich gelesen |
| W30 | Jede Tabellenänderung nachzählen (Lehre aus zwei eigenen Fehlern) | **neu, dauerhaft** | Zweimal habe ich beim Einsetzen einer Zeile die Nachbarzeile ersetzt. Ab jetzt: nach jeder Tabellenänderung die erwarteten Zeilen **zählen** |
| W31 | README als Vertrag gegenüber einem Fremden prüfen | **erledigt** | Befund **B15**: Versionen exakt bestätigt (17.11 / 0.8.7 / 7.4.9), 14 Pakete bestätigt; **zwei Funde**: der widerlegte Rust-Satz steht jetzt auf der Startseite, und die drei Bäume sind widersprüchlich beschriftet (Ursache von B10) |
| W32 | Die Behauptung „API ausgefallen" prüfen (Sonde, Methode, Gegenfall) | **erledigt** | Befund **B16** (schwerster Fund): die Sonde prüft geratene Pfade per GET, der Kern ruft `POST /api/<namespace>/<methode>`; an einer **gesunden** Installation liefern dieselben Pfade 404. Der Gegenbeweis ist mit `werkzeuge/api-erreichbarkeit.mjs` reproduzierbar |
| W33 | `P8.12` entblocken: echten Anbieteraufruf ermöglichen | **teilweise erledigt** | Befund **B17**: Ursache war der **Weg** (Adapter liest nur `env.DEEPSEEK_API_KEY`, nichts liest den Speicher). Echter Aufruf über den eigenen Adapter **gelungen** („Empfang", 41/117 Token, 1,20 s); Vorstufe bereitgestellt, den Nachweis in der Kette führt der bauende Agent |
| W34 | B3-Meldung „erledigt" korrigieren | **erledigt** | B3 war **zu früh** auf erledigt: die Speicher-Referenz hilft dem Kern, nicht dem Adapter dieses Projekts. Status jetzt „teilweise" mit benanntem fehlendem Teil |
| W35 | Einseitige Lageübersicht `LAGE.md` anlegen und pflegen | **angelegt, dauerhaft** | Macht 17 Befunde in einer Minute lesbar: was jetzt zu tun ist, was erledigt ist, was **nicht** prüfbar war, und die Befehle zum Nachfahren. Belege bleiben in `befunde.md` |
| W36 | Stale eigene Beschreibungen im Register prüfen | **erledigt** | Die Registerzeile nannte noch „Befunde B1–B5" (inzwischen B17) — berichtigt. Lehre: auch die eigenen Verweise altern |

| W37 | `native/flock`: die Vertragsabnahme überhaupt ausführbar machen | **offen, liegt beim bauenden Agenten** | Befund **B24**: `cargo test -p pmh-flock` ist auf Windows **grün mit `running 0 tests`** (`#![cfg(unix)]`), und in WSL Ubuntu fehlen `cargo`/`rustc`. Meine Hilfe: der rustup-Befehl für WSL steht in `befunde.md` — danach laufen **15** Vertragstests statt 0. Bis dahin bleibt „der Vertrag ist umgesetzt" **unbelegt** |
| W38 | B13-Rest: drei Stellen töten `bun` nach **Name und Alter** | **offen, liegt beim bauenden Agenten** | `boot-schleife.ps1:103` (2 min), `api-test.ps1:33` (3 min), `api-flaeche.ps1:92` (3 min) — gemessen **14:08 unverändert**, obwohl die Commit-Nachricht von `b75c9f6` B13 als behoben nennt. `boot-schleife` ist die gefährlichste: sie trifft auch den Zeugenprozess des Bauenden selbst |
| W39 | `$script:fehler` statt `$fehler++` in `scripts/port-test.ps1` Zeilen **182, 186, 197** | **offen, ein Wort** | Die drei Zählungen liegen im Funktionsrumpf von `StarteHost` (151–201) und landen in einer **lokalen Kopie** — darunter die neue **Waisenprüfung**. Nachgetragen in **B23** |
| W40 | `unit.json`: Startkommandos sind nackte Binärnamen, **keiner** im `PATH`, mehrere sind Einmalaufrufe als `kind: service` | **offen, Formatfrage (B18 + B25)** | Gemessen über **alle elf** Units. Solange `pmh-supervisor` fehlt, führt sie niemand aus — danach starten zehn Dienste, von denen mehrere sofort enden. Das Format kann „Einmalaufruf" und „Dienst" nicht unterscheiden |
| W41 | **Zeitangaben messen, nicht schätzen** — `Get-Date` als erster Befehl jedes Takts | **neu, dauerhaft (Lehre aus eigenem Fehler)** | Ich hatte im einunddreißigsten Takt Zeiten bis zu **45 Minuten in der Zukunft** geschrieben („14:25–14:50" statt 13:56; JSONL bis 12:20Z). Aufgefallen ist es nur, weil ein Dateizeitstempel nicht passte. Das war ein Verstoß gegen **meine eigene** Hausregel H7 |

## 3. Was ich ausdrücklich **nicht** tue (Hausregeln)

| Nicht | Grund |
|---|---|
| **Neustart** von DSH, `~/.dsh`, `~/.pmh`, Host-Prozessen | **H1** — Prompt-Caching; Anweisung des Betreibers 11:37 |
| Schreiben in `packages/`, `apps/`, `services/`, `native/`, `scripts/`, `units/` | **H2** — fremde Nachweise würden ungültig |
| Testläufe, Migrationen, `DROP`/`CREATE` gegen `pmh-postgres` | **H5** — der andere Agent arbeitet genau daran |
| Geheimwerte in Dateien, Ausgaben oder Protokoll | **H4** — die Protokolle liegen im Repository |
| Eine Anpassung am Harness „mal eben" vollziehen, weil sie sinnvoll scheint | **A3** — erst einstufen: nötig / nicht nötig / unbelegt. Vollziehen tut der Betreiber oder der bauende Agent |

## 4. Nächster Takt — was dann gemessen wird

**Der kürzeste Weg ist ein Aufruf.** `werkzeuge/stand-abgleich.mjs` prüft **alle zwölf offenen Befunde**
in einem Lauf und meldet selbst, wenn einer erledigt ist (Rückgabewert **1**). Was er nicht abdeckt,
steht darunter.

1. **Zuerst `Get-Date`** — jede Zeitangabe kommt aus der Shell (Lehre **W41**; fünf eigene Verstöße stehen in der Korrekturtabelle).
2. **Neue Commits** seit `499273f`? `git log --oneline 499273f..HEAD` und Abgleich mit `origin/main`.
3. **Die neun Punkte aus `LAGE.md` §0** der Reihe nach — jeder nennt seinen eigenen Nachweis-Befehl.
4. **`settings.yaml`**: Abschnitte weiterhin **10**, Routen **12**, Referenzen **12**? Wenn nicht: sofort Befund.
5. **Prozesslage**: Waisen dieses Projekts (`hilfen/waisen-aufraeumen.ps1` im Trockenlauf — **Altersschwelle beachten**: die Kinder eines *laufenden* Tests gehören ihm, siehe die drei Prozesse um 15:17)? Lebt die GUI (PID 22260, Start **09:39**, `tsx` auf `src`)?
6. **Datenbank** (read-only): Tabellen je Schema, `schema_migrations` Fassung **2**, verwaiste Volumes — **19** bei der Schlussmessung (Bestandsaufnahme, kein Befund: eines hält ein intaktes PG-17-Cluster).
7. **Die 29 unversionierten Pfade** (`native/flock`, `services/pmh-nix`, `services/pmh-attach`) und sieben unverfolgte Dateien: wächst der Berg, oder wird er committet?
8. **Der DSH-Checkout**: weiterhin **11** unversionierte Einträge? Der Zweig `dsh-custom` wartet (**B32**), und die Änderungen wirken erst nach einem **Neustart** der GUI.

**Zum Abschluß dieser Sitzung:** die Rolle ist **übergeben**, nicht beendet. Handlungsliste (`LAGE.md` §0),
Bilanz (§6), Standabgleich und die geprüften Hilfen sind so gebaut, daß sie **ohne** diese Sitzung
weiterlaufen — und jede Zahl darin nennt ihren Befehl.
