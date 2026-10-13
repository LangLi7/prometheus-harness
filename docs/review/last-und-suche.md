# Last, Neuladen und Suche — gemessen, mit Entwurf

> **Anlass.** Die Frage des Betreibers, wörtlich: *„kannst du den Chat session, tokens, API key
> Chat improven? dass es nicht probleme gibt beim neu laden … evt Database bottleneck ect. zb
> mit viele Agent, Subagent write database und oder auch erstellen eine Session chat ect dann
> noch multiplikation mit mehrere user zb max 10? und was ist mit skalling später evt
> relevant? der agent und subagent sollte sozusagen wie ein user behandelt werden mit viele
> writing ect."*
>
> **Alle Zahlen dieser Datei sind gemessen**, nicht geschätzt. Die Befehle stehen bei jeder
> Tabelle. Die Lasttests liefen gegen eine **Wegwerf-Datenbank** `pmh_bench` (Schema aus `pmh`
> kopiert, danach `DROP DATABASE`, Rückstand geprüft: 0). Die echte Datenbank ist unberührt —
> nachgemessen: 1 Benutzer, 1 Arbeitsbereich, 20 Chats, 10 000 Nachrichten, Fassung 3.

---

## 1. Kurzfassung

**Bei zehn Benutzern ist die Datenbank nicht der Engpass.** Gemessen trägt sie **~9 400
Einfügungen je Sekunde** (nachfahrbarer Lauf; die erste Messung ergab 8 030) und **~16 000
Sitzungen je Sekunde**. Der Engpass liegt woanders:

1. **Der Schreibpfad der Sitzungsdatei** ist **66× teurer als nötig** — und er ist
   synchron im Pfad jedes Agentenschritts.
2. **Ein `UPDATE` je Nachricht auf die Chat-Zeile** kostet **88 % des Durchsatzes**
   (9 357 → 1 165 tps). **Und zwar, sobald jemand ihn schreibt** — heute schreibt ihn
   **niemand** (Befund B41): die Spalten sind da, der Code fehlt, und eine Chat-Liste darauf
   zeigt heute **0 und NULL** statt „langsam". Siehe §4.
3. **Die Verbindungsgrenze** ist bei **100** (97 nutzbar). Eine Verbindung je Agent ist
   damit der erste harte Deckel, lange bevor die Datenbank müde wird.

**Die Zahlen sind nachfahrbar** — `bun benchmarks/db-last/lauf.mjs` legt die Wegwerf-Datenbank
selbst an, fährt die Szenarien und räumt auf. Das war eine Auflage der Aufsicht
(Verifikation **V13**): die erste Fassung dieses Dokuments nannte ein Verfahren, aber
**kein Skript lag im Baum**, und die Wegwerf-Datenbank war gelöscht. Nachprüfbarkeit ist keine
Höflichkeit — die drei Korrekturen, die der zweite Lauf an **meinen eigenen** Aussagen ergab,
stehen in §4.

**Der Unteragenten-Fall skaliert vorbildlich** — der Selbstbezug der Sitzung kostet nichts
(gemessen **16 462 tps** bei 40 gleichzeitigen Unteragenten am selben Elternteil).

**Und für die Suche gibt es eine harte Vorbedingung**, die vor der ersten Tabelle entschieden
werden muß: **es gibt zwei Kopien desselben Inhalts — eine verschlüsselt, eine im Klartext.**
Abschnitt 7.

## 2. Was beim Neuladen schon trägt

Der Betreiber fragt zuerst nach „Problemen beim Neuladen". Dazu ist der Bestand **besser als
erwartet**, und das ist belegt statt behauptet. `packages/agent/session-persistence-jsonl`
löst drei der vier klassischen Fehler bereits:

| Fehlerklasse | Was der Bestand tut | Beleg |
|---|---|---|
| **Reihenfolge** — zwei gleichzeitige Anhänge überholen sich, der Verlauf ist falsch geordnet | eine **Versprechenskette** (`#chain`), kein Sperrverfahren: jeder Anhang wartet auf den vorigen | `src/index.ts:15` (Begründung), `:226` (Kette), `:308` (`appendFile` in der Kette) |
| **Absturzrest** — die letzte Zeile ist halb geschrieben | wird **erkannt** (`truncatedTail`) und beim Öffnen **abgeschnitten**, bevor weitergeschrieben wird | `:415`, `:437`, `:509–544` |
| **Kopfdaten** — halb geschriebener Kopf nach Absturz | **atomar**: temporäre Datei, dann `rename` | `:330`, `:625` |
| **Haltbarkeit** — Ereignisse seit dem letzten Schreiben sind weg | **nicht gelöst**: im ganzen Paket **kein** `sync`/`fsync` | siehe Abschnitt 6 |

**Nachgemessen zur Atomarität der Anhänge** (8 gleichzeitige Schreiber, 120 Zeilen je
Schreiber, Zeilengröße von 600 B bis 1 MB):

```
Zeilengroesse  600 B: gelesen  960/960  nicht lesbar   0  je Schreiber vollstaendig: ja  -> rissfrei
Zeilengroesse   8 kB: gelesen  960/960  nicht lesbar   0  je Schreiber vollstaendig: ja  -> rissfrei
Zeilengroesse  64 kB: gelesen  960/960  nicht lesbar   0  je Schreiber vollstaendig: ja  -> rissfrei
Zeilengroesse 1024 kB: gelesen  960/960  nicht lesbar   0  je Schreiber vollstaendig: ja  -> rissfrei
```

**Aber die Ehrlichkeit gehört dazu:** das ist eine **Beobachtung, keine Zusicherung.** Sie
trägt, weil die Laufzeit je Ereignis **einen** `write()`-Aufruf absetzt und das Dateisystem
Anhänge darauf atomar behandelt. Das ist ein Umsetzungsdetail von Bun/Node und NTFS, **kein
Vertrag**. Wer sich darauf verläßt, verläßt sich auf etwas, das die nächste Fassung ändern
darf.

**Die eine Lücke, die daraus folgt:** die Kette wirkt **nur innerhalb eines Prozesses**. Zwei
Prozesse auf derselben Sitzungsdatei — und genau das ist der Fall „Agent und Unteragent"
— haben **keine** gemeinsame Ordnung. Schlimmer: `schneideAbgebrocheneZeileAb` schreibt die
Datei mit `writeFile` **neu** (`:544`). Ein zweiter Prozeß, der gerade angehängt hat, verliert
seine Ereignisse. **Das ist der reale Neulade-Fehler, und er ist noch nicht behoben.**

**Die kleinste wirksame Behebung:** eine Sperrdatei je Sitzung (`<id>.lock`) um Öffnen,
Abschneiden und Anhängen, oder — besser — **eine Sitzung gehört genau einem Prozess**. Letzteres
ist die Regel, die zur Architektur paßt: ein Unteragent hat seine **eigene** Sitzung.

## 3. Die gemessene Kapazität

Wegwerf-Datenbank `pmh_bench`, `pgbench` im Container, jeweils 15–20 s, `pmh_app` (die Rolle,
die die Anwendung benutzt), kein Fehlschlag in irgendeinem Lauf:

| # | Szenario | Clients | tps | Ø Latenz |
|---|---|---|---|---|
| A | je Benutzer ein eigener Chat: Chat anlegen + Nachricht + Zähler + Sitzung | 10 | **2 490** | 4,0 ms |
| D | dasselbe, 80 Clients | 80 | **2 421** | 33,0 ms |
| B | 10 **Agenten in EINEM** Chat (heisse Zeile) | 10 | **941** | 10,6 ms |
| C | 40 Agenten in EINEM Chat | 40 | **512** | 78,1 ms |
| E | 40 **Unteragenten am selben Elternteil** (Selbstbezug der Sitzung) | 40 | **16 463** | 2,4 ms |
| F | **nur Einfügen** in einen Chat | 10 | **8 030** | 1,25 ms |
| G | F + `UPDATE chats SET message_count` | 10 | **938** | 10,66 ms |
| H | G + `updated_at` (indiziert) | 10 | **775** | 12,91 ms |

**Wie diese Zahlen zu lesen sind.** `pgbench` mißt **Transaktionen je Sekunde**, und eine
Transaktion ist hier eine ganze Gruppe aus mehreren Anweisungen (F und G/H sind die Ausnahme
mit einer bzw. zwei). Die absoluten Werte sind deshalb **nicht** direkt mit „Schreibvorgängen"
gleichzusetzen — die **Verhältnisse** zwischen den Zeilen sind es, und auf die kommt es an.

**Die Maschine sättigt bei ~2 400 tps** (A bei 10 Clients und D bei 80 Clients liegen gleich),
und ab da wächst nur die **Latenz**: 4,0 → 33,0 ms bei achtfacher Clientzahl. Das ist die
normale Sättigungskurve, kein Fehler.

## 4. Der gefundene Engpass: ein `UPDATE` je Nachricht

**Die Isolierung ist eindeutig** (10 Clients, derselbe Chat):

| Was geschrieben wird | tps | Verlust |
|---|---|---|
| nur die Nachricht | **8 030** | — |
| + `message_count` hochzählen | **938** | **−88 %** |
| + `last_message_at` **und** `updated_at` | **775** | **−90 %** |

**Der Mechanismus ist eine Zeilensperre, kein Indexproblem.** Alle Schreiber wollen **dieselbe**
Zeile in `chats` ändern; PostgreSQL serialisiert sie. Der Einfügevorgang selbst ist mit
8 030 tps **8,6× billiger** als der Zähler, der ihn begleitet.

### Nachtrag: nachfahrbar gemacht, und dabei drei eigene Fehler gefunden

**Die Aufsicht konnte diese Zahlen nicht nachprüfen** (Verifikation **V13**): die
Wegwerf-Datenbank war gelöscht, und die `pgbench`-Skripte lagen in `/tmp` **innerhalb** des
Containers. Das Verfahren war beschrieben, aber **kein Skript lag im Baum** — die Zahlen waren
damit Behauptungen mit einem Verfahrensanhang. Das ist jetzt behoben:
**`benchmarks/db-last/lauf.mjs`** legt die Wegwerf-Datenbank selbst an, fährt die Szenarien,
meldet die Zahlen und räumt wieder auf. Wer zweifelt, ruft es auf.

**Der wiederholte Lauf — und was er an meinen eigenen Aussagen widerlegt hat:**

| | erste Messung | nachfahrbarer Lauf |
|---|---|---|
| nur Einfügen | 8 030 tps | **9 357 tps** |
| + Zähler | 938 tps | **1 165 tps** — Verlust **88 %** ✓ |
| + indizierter `updated_at` | 775 tps (**schlechter**) | 1 207 tps (**besser**) |
| Zähler auf eine **nicht getroffene** Zeile | nicht gemessen | **8 462 tps** |

**Drei Korrekturen, alle an mir:**

1. **Der Zusatzaufwand des indizierten `updated_at` ist NICHT reproduzierbar.** Der zweite Lauf
   ergab für `updated_at` **1 207 tps gegen 1 165 tps** — also *schneller*, nicht langsamer. Der
   im ersten Lauf gemessene Unterschied (938 → 775) lag **im Rauschen**. Die Aussage
   *„das kostet weitere 17 %"* ist damit **zurückgezogen**. Was bleibt, ist der HOT-Anteil als
   **struktureller** Grund (13,06 %, nachgerechnet von der Aufsicht; `chats_user_recent_idx`
   liegt auf `updated_at`), nicht als gemessener Aufschlag.

2. **Die Gegenprobe beweist den Mechanismus.** Ein `UPDATE`, das **keine** Zeile trifft, kostet
   fast nichts: **8 462 tps, 1,18 ms** gegen 1 165 tps, 8,58 ms. Damit ist es **die Zeilensperre**
   und nicht das `UPDATE` selbst — sauberer belegt als durch den Vergleich zweier Szenarien.

3. **„Das ist selbst zugefügt" war falsch — die Richtung ist umgekehrt** (Befund **B41** der
   Aufsicht). Gemessen im **ganzen Baum**: `message_count`, `last_message_id` und
   `last_message_at` kommen **sechsmal** vor — fünfmal in der Migration `0002`, einmal **lesend**
   in einem Test. **Kein INSERT, kein UPDATE, kein Trigger** (`pg_trigger` leer). **Heute zahlt
   also niemand diese Kosten.** Die 88 % sind nicht ein selbst zugefügter Schaden, sondern der
   **Preis einer Absicht**, die noch nicht umgesetzt ist.

**Und der reale Fehler ist der umgekehrte, kleinere und dringendere:** `message_count` ist
`NOT NULL DEFAULT 0`, `last_message_at` ist `NULL`. Eine Chat-Liste, die darauf gebaut wird,
zeigt **0 und NULL** — nicht „langsam". Das ist dieselbe Klasse wie Befund **B14**: das Schema
ist da, der Code fehlt. **Die Entscheidung ist deshalb nicht „später optimieren", sondern
jetzt:** pflegen (dann **je Turn**, siehe unten) **oder streichen** (`DROP`) — aber nicht
stehen lassen und die Liste darauf stützen.

**Die kleinste wirksame Behebung — drei Stufen, nach Wirkung:**

1. **Den Zähler einmal je Agentenschritt oder je Turn aktualisieren, nicht je Nachricht.**
   Ein Turn erzeugt viele Ereignisse; die Chat-Liste muß erst stimmen, wenn jemand sie liest.
   Das allein holt den Faktor 8,6 fast vollständig zurück.
2. **`updated_at` aus dem Index nehmen** — oder in der Liste nach `last_message_at`
   sortieren und dafür einen Index bauen, der beim Zähler-Update **nicht** berührt wird. Dann
   sind HOT-Updates möglich. **Dieser Punkt ist nach dem zweiten Lauf schwächer begründet als
   zuvor** — er bleibt als strukturelle Überlegung stehen, nicht als gemessener Gewinn.
3. **Wenn beides nicht reicht:** die Zähler in eine eigene Tabelle auslagern, damit die heiße
   Zeile nicht die ist, die die Liste liest.

**Und die Aussage für die Skalierung, die daraus folgt:** eine Gruppe von Agenten, die in
**denselben** Chat schreibt, ist der teuerste Fall, den dieses Schema kennt — 512 tps und
78 ms bei 40 Schreibern. **Gibt man jedem Agenten und Unteragenten seine eigene Zeile, kostet
es nichts** (Zeile E: 16 463 tps). Das ist genau die Regel, die der Betreiber vorschlägt
(„der Agent und Subagent sollte sozusagen wie ein User behandelt werden") — und sie ist
**meßbar die richtige**.

## 5. Die Verbindungsgrenze — der erste harte Deckel

```
show max_connections;                 ->  100
show superuser_reserved_connections;   ->    3
```

**97 nutzbare Verbindungen.** Ein Lauf mit 100 Clients **scheiterte vollständig**:
`FATAL: remaining connection slots are reserved for roles with the SUPERUSER attribute`.

**Was das für 10 Nutzer heißt.** 10 Nutzer sind unkritisch. Aber die Rechnung ist:
`Nutzer × Agenten je Nutzer × (Unteragenten + 1)` Verbindungen, wenn jeder Agent seine eigene
hält. Bei 10 Nutzern mit je 3 Agenten und je 2 Unteragenten sind das **90** — und dann ist die
Grenze erreicht, **ohne daß die Datenbank irgendwie gefordert war** (2 400 von ~8 000 tps).

**Die kleinste wirksame Behebung:** ein Verbindungspool **je Prozeß** mit kleiner Obergrenze
(z. B. 10), statt einer Verbindung je Agent. Ein Unteragent ist eine Aufgabe, kein
Datenbankmandant; er kann sich eine Verbindung teilen. Bei mehreren Prozessen gehört ein
**PgBouncer** davor — dann ist `max_connections` nicht mehr die Grenze der Anwendung.

## 6. Der Schreibpfad der Sitzung — der eigentliche Kostentreiber

Aus dem Benchmark vom 13.10.2026 (`benchmarks/session-open`), unverändert gültig:

| Schreibweise | 2000 Ereignisse |
|---|---|
| `flushEvery: 1` (**die Vorgabe**) | **~600–632 ms** |
| `flushEvery: 256` (gebündelt) | **9,4–12,0 ms** |

**Faktor 64.** Und die Ursache war bereits isoliert: nicht die Reihenfolge und nicht ein
`fsync`, sondern **die Zahl der Aufrufe** — 500 × `appendFile` = 97,3 ms gegen 1 × `writeFile`
= 0,4 ms; verkettet 99,6 ms.

**Was das für das Szenario bedeutet.** Ein Agentenschritt erzeugt viele Ereignisse, und
`flushEvery: 1` schreibt **jedes einzeln und synchron in den Pfad des Schritts**. Bei 100
gleichzeitigen Sitzungen mit je 2000 Ereignissen sind das 200 000 Anhänge; bei gemessenen
~5 600 Anhängen je Sekunde sind das **~36 Sekunden reine Dateiarbeit** — gegenüber ~80
Sekunden, die die Datenbank für dieselbe Menge bräuchte. **Datei und Datenbank sind
vergleichbar teuer, und die Datei ist die, die man mit einer Zahl um Faktor 64 billiger
machen kann.**

**Und die Haltbarkeit fehlt trotzdem.** `flushEvery: 1` kauft **Reihenfolge** und
**Rechtzeitigkeit**, **keinen Sync** — im ganzen Paket gibt es **null** Treffer für
`sync(`/`fsync`/`datasync`. Der **Core dagegen synct an fünf Stellen**, darunter ein
Verzeichnis-`fsync` und das Abschneiden des Absturzrests. Ein Absturz kann also auch bei
`flushEvery: 1` Ereignisse verlieren.

**Daraus folgt eine Entscheidung, die getroffen werden muß — nicht ein Kompromiß, den man
benennt:**

* **Wird Haltbarkeit zugesagt?** Dann **fehlt der Sync**, und `flushEvery` ist frei wählbar
  (gebündelt schreiben, am Turn-Ende syncen). Das ist die Empfehlung: schnell **und** haltbar.
* **Wird sie nicht zugesagt?** Dann gehört *„Ereignisse seit dem letzten Sync können verloren
  gehen"* neben die Vorgabe — und `flushEvery: 1` ist als Vorgabe **schwer zu begründen**, weil
  es 64× kostet und trotzdem nichts garantiert.

### Nachtrag: die Ursache war falsch benannt — und sie ist plattformabhängig

**Eine Fremdprüfung hat zu Recht beanstandet, daß „es sind die Aufrufe" zwei Dinge mischt:**
das **Öffnen und Schließen** der Datei und das **Schreiben** selbst. `appendFile` tut beides je
Aufruf. Nachgemessen — und zwar **auf beiden Plattformen**, weil die Vermutung im Raum stand,
ein Windows-Wächterdienst blähe die Zahlen auf. 2000 Zeilen à 280 Bytes, Median aus drei Läufen:

| Schreibart | Windows / Bun 1.4.0 | Linux (WSL2) / Bun 1.4.3 |
|---|---|---|
| `appendFile` je Zeile | 299 ms | 108 ms |
| ein Griff, N × `write` | **36 ms** | **105 ms** |
| ein Griff, `sync` je Zeile | 693 ms | 223 ms |
| **Puffer, ein `write` + ein `sync`** | **2 ms** | **1 ms** |
| **Faktor `appendFile` / ein Griff** | **8,3** | **1,0** |

**Die Widerlegung meiner eigenen Aussage.** *„Das Öffnen und Schließen ist der Kostentreiber"*
gilt **nur unter Windows**. Unter Linux ist der Faktor **1,0** — 108 gegen 105 ms, kein
Unterschied. Der Grund ist plausibel: unter Windows kostet das Öffnen und Schließen je Aufruf
spürbar, unter Linux ist es ein billiger Systemaufruf auf einem bereits warmen Verzeichniseintrag.
**Die Produktion läuft auf Linux** (der ganze Stapel ist Docker/Compose) — die daraus
abgeleitete Empfehlung *„nimm einen offenen Griff"* wäre dort **wirkungslos** gewesen.
Das ist der teuerste Fehler dieser Untersuchung: eine richtige Messung auf der **falschen**
Plattform.

**Was auf beiden Plattformen gilt — und damit die eigentliche Antwort ist:**

1. **`sync` je Ereignis ist überall der teuerste Weg** (693 ms Windows, 223 ms Linux).
   Haltbarkeit je Ereignis ist echt teuer.
2. **Puffer plus EIN `sync` kostet 1–2 ms** — 100- bis 300-fach billiger als `sync` je Zeile,
   und das **Einzige, was überhaupt haltbar ist**.
3. Die Behebung heißt deshalb **nicht** „ein offener Griff", sondern:
   **Ereignisse im Speicher sammeln, in **einem** `write` schreiben und **einmal** syncen** —
   beim Turn-Ende oder nach einem kurzen Zeitgeber.

**Und die Zahlen des Benchmarks bleiben davon unberührt:** `flushEvery: 1` gegen `flushEvery: 256`
ist ein Unterschied von **Faktor 66** (gemessen: 621,21 ms gegen 9,47 ms) — das ist die **Zahl**
der Schreibaufrufe, und die ist plattformunabhängig. Nur die **Ursache** (Öffnen/Schließen)
war falsch benannt.

**Was daran noch offen ist:** ob ein Windows-Wächterdienst die Zahlen wirklich aufbläht, ist
**plausibel gemacht, nicht bewiesen**. Belegt ist nur der Unterschied (Windows rund dreimal
teurer für Dateiarbeit). Wer es genau wissen will, schaltet den Echtzeitschutz für das
Projektverzeichnis ab und wiederholt den Lauf — **das habe ich nicht getan**, weil es einen
Sicherheitsmechanismus des Betreibers verändert hätte.

## 7. Die zwei Klartext-Kopien — die Vorbedingung für jede Suche

**Das ist der Befund, der die Suchfrage entscheidet, und er ist gemessen.**

| Kopie | Wo | Schutz |
|---|---|---|
| `messages.content_cipher` | PostgreSQL | **verschlüsselt** (`bytea`, AES-256-GCM vorgesehen) |
| der Ereignisstrom `.jsonl` | Dateisystem | **Klartext** — `appendFile(path, block, 'utf8')`, `JSON.stringify` |

Der Schreibpfad ist `packages/agent/session-persistence-jsonl/src/index.ts:308` — ein
`appendFile` mit JSON-Text. **Kein** Verschlüsselungsschritt im ganzen Paket.

**Was das Positive daran ist:** der Sitzungsstrom liegt **außerhalb** der Datenbank. Ein
Datenbank-Administrator kommt dort **nicht** heran — für die Anforderung aus
`geheimnisse-entwurf.md` ist das ein **Gewinn**.

**Was das Negative daran ist:** „Verschlüsselung at rest" gilt damit **nur für die eine
Kopie**. Wer Dateizugriff auf das Sitzungsverzeichnis hat, liest das ganze Gespräch im
Klartext. Die Verschlüsselung ist nur so stark wie die **schwächere** Kopie.

**Und daraus folgt die Suchantwort.** Ein `tsvector` in PostgreSQL kann `content_cipher`
**nicht** indizieren — verschlüsselter Text hat keine Wörter. Die Klartextkopie gibt es nur
auf der Platte. Genau deshalb baut der **Core** seinen Volltextindex aus dem JSONL
(`dsh-session-query-sqlite`, ausdrücklich ein **wegwerfbares** Lesemodell, das bei
inkompatibler Fassung zurückgesetzt wird).

**Die Entscheidung, die vor der ersten Suchtabelle fallen muß:**

* **A — PostgreSQL spiegelt den Klartext.** Wir bauen aus dem Ereignisstrom eine
  Suchtabelle in PostgreSQL und indizieren sie (`tsvector` + `vector`). Dann kann PostgreSQL
  alles: Stichwort, mehrere Wörter, Unscharf, Vektor, über Arbeitsbereich, Chat **und**
  Sitzung in **einer** Abfrage. **Preis:** eine **dritte** Klartextkopie in der Datenbank —
  und damit genau das, was die Anforderung „DBA liest nichts" verhindern soll. Mit
  Row-Level-Security und einem eigenen Tabellenraum ist es **abgeschwächt**, aber nicht
  beseitigt.
* **B — PostgreSQL indiziert nur Unbedenkliches.** Indiziert werden **Metadaten** (Titel,
  Rollen, Zeit, Werkzeugnamen, Pfade, Herkunft) im Klartext, der Inhalt bleibt verschlüsselt
  und wird über den **Core-Index** (SQLite über JSONL) gesucht. **Preis:** keine
  Vektorsuche über den Inhalt in PostgreSQL, und zwei Suchsysteme.
* **C — Vektoren über den Klartext, aber mit eigenem Schutz.** Der Inhalt wird zum Einbetten
  entschlüsselt, die Vektoren werden gespeichert, das Chiffrat bleibt. **Der Vektor ist dann
  ein neuer Leckpfad**: aus Einbettungen lassen sich Inhalte angenähert rekonstruieren
  (belegt: Einbettungen sind invertierbar — das ist in der Recherche als eigenes Risiko
  dokumentiert). **Diese Variante ist die gefährlichste und die, die am meisten nach
  „fertig" aussieht.**

**Meine Empfehlung: A für den Start, mit dem Wissen benannt.** Begründung: der Betreiber
verlangt Suche über **Arbeitsbereich, Chatverlauf und Sitzung** in **einer** Abfrage — das
kann nur ein System, das den Inhalt hat. Und die Anforderung an den DBA läßt sich mit
Row-Level-Security **und** einem getrennten Tabellenraum so weit abschwächen, daß der
verbleibende Rest (ein Administrator mit Zugriff auf den Anwendungsprozeß) ohnehin nicht
durch Kryptografie zu lösen ist — das steht so in `geheimnisse-entwurf.md` §2.

### Der Tabellenentwurf für A

Eine Tabelle, ein Unterscheider — damit **eine** Abfrage alle drei Ebenen trifft:

```sql
CREATE TABLE search_docs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workspace_id  uuid REFERENCES workspaces (id) ON DELETE CASCADE,   -- Ebene Arbeitsbereich
  chat_id       uuid REFERENCES chats (id) ON DELETE CASCADE,        -- Ebene Chat
  session_id    text REFERENCES conversation_sessions (id) ON DELETE CASCADE, -- Ebene Sitzung
  kind          text NOT NULL,        -- 'message' | 'note' | 'file' | 'event'
  source_ref    text NOT NULL,        -- woher: Dateipfad, Nachrichten-ID, Ereignis-seq
  content       text NOT NULL,        -- der Klartext (siehe Entscheidung oben)
  content_hash  text NOT NULL,        -- Wiedererkennung, damit nichts doppelt indexiert wird
  ts            tsvector,             -- Stichwortsuche
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_docs_kind_known CHECK (kind IN ('message','note','file','event'))
);

-- Stichwortsuche, mehrsprachig und ohne Akzentunterschiede (beides liegt im Stapel).
CREATE INDEX search_docs_ts_idx ON search_docs USING gin (ts);
CREATE INDEX search_docs_trgm_idx ON search_docs USING gin (content gin_trgm_ops);
-- Die Mandantengrenze gehört IN den Index, sonst liest jede Suche alles.
CREATE INDEX search_docs_user_kind_idx ON search_docs (user_id, kind, updated_at DESC);
```

**Der Vektor kommt in eine eigene Tabelle**, nicht in `search_docs` — weil Modell,
Dimension und Fassung dazugehören und weil ein Vektorindex (HNSW) eine eigene Pflege hat:

```sql
CREATE TABLE search_vectors (
  doc_id        uuid PRIMARY KEY REFERENCES search_docs (id) ON DELETE CASCADE,
  embedding     vector(1024) NOT NULL,
  model         text NOT NULL,        -- Name
  model_version text NOT NULL,        -- Fassung — ohne sie ist der Vektor in einem Jahr nicht deutbar
  dimension     integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_vectors_dim_ok CHECK (dimension = 1024)
);
CREATE INDEX search_vectors_hnsw ON search_vectors USING hnsw (embedding vector_cosine_ops);
```

**Und der Punkt, der über Sicherheit entscheidet — er ist derselbe wie B-S1.** Eine
Vektorabfrage ist eine **Leseabfrage**, die über Ähnlichkeit filtert. Ohne Mandantenfilter
liest sie **alle** Mandanten. Bei `chats` ist das heute eine Integritätslücke, weil es die
Abfrage noch nicht gibt; **mit Vektorsuche entsteht sie mit der ersten Abfrage.** Deshalb:

```sql
ALTER TABLE search_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_docs FORCE ROW LEVEL SECURITY;   -- auch für den Eigentümer
CREATE POLICY search_docs_eigener_mandant ON search_docs
  USING (user_id = current_setting('pmh.user_id', true)::uuid);
```

**Die Suche selbst — eine Abfrage, drei Ebenen, beide Verfahren:**

```sql
-- Stichwort (mehrere Wörter, unscharf) und Vektor in einer Rangfolge vereint.
WITH stichwort AS (
  SELECT d.id, ts_rank(d.ts, q) AS rang FROM search_docs d,
         websearch_to_tsquery('german', $1) q
   WHERE d.ts @@ q AND d.user_id = $2
     AND ($3::uuid IS NULL OR d.workspace_id = $3)
   ORDER BY rang DESC LIMIT 50
),
vektor AS (
  SELECT v.doc_id AS id, 1 - (v.embedding <=> $4) AS rang
    FROM search_vectors v JOIN search_docs d ON d.id = v.doc_id
   WHERE d.user_id = $2
     AND ($3::uuid IS NULL OR d.workspace_id = $3)
   ORDER BY v.embedding <=> $4 LIMIT 50
)
SELECT d.*, coalesce(s.rang, 0) * 0.5 + coalesce(v.rang, 0) * 0.5 AS gesamt
  FROM search_docs d
  LEFT JOIN stichwort s ON s.id = d.id
  LEFT JOIN vektor   v ON v.id = d.id
 WHERE s.id IS NOT NULL OR v.id IS NOT NULL
 ORDER BY gesamt DESC LIMIT 20;
```

**`websearch_to_tsquery` ist die richtige Funktion**, nicht `to_tsquery`: sie nimmt
„mehrere wörter" und `"feste wendung"` und `-ausschluss` so, wie ein Mensch sie tippt, ohne
daß eine kaputte Eingabe einen Syntaxfehler wirft. `unaccent` und `pg_trgm` liegen im Stapel
(gemessen: beide `1.6`/`1.1` **angelegt**) und decken Tippfehler und Akzente ab.

## 8. Die Antwort auf die Skalierungsfrage

**Bei 10 Nutzern:** die Datenbank ist **kein** Engpass. Selbst konservativ gerechnet —
10 Nutzer × 5 Agenten × 3 Unteragenten = **180 Schreiber** — liegt das weit unter den
gemessenen 2 400 tps, **wenn** jeder Agent seine eigene Zeile bekommt.

**Was später wirklich zuerst bricht, in dieser Reihenfolge:**

| Rang | Was bricht | Ab wann (gemessen) | Behebung |
|---|---|---|---|
| 1 | **Verbindungszahl** | 100 Clients scheitern vollständig; 97 nutzbar | Pool je Prozeß, später PgBouncer |
| 2 | **Der Zähler-`UPDATE`** je Nachricht | sofort, −88 % | je Turn statt je Nachricht |
| 3 | **Der JSONL-Schreibpfad** | 64× zu teuer je Ereignis | `flushEvery` bündeln **+** Sync am Turn-Ende |
| 4 | **Mehrprozess-Zugriff auf eine Sitzung** | sofort, Datenverlust möglich | eine Sitzung = ein Prozeß, oder Sperrdatei |
| 5 | **Die Maschine sättigt** | ~2 400 tps, dann nur noch Latenz | mehr Kerne, oder PgBouncer + Lesereplikat |
| 6 | **Volltext-/Vektorindex** | erst bei Millionen Zeilen | Teilindizes je Mandant, `ivfflat` statt `hnsw` bei viel Schreiben |

**Was entgegen der Erwartung *nicht* bricht:** der Selbstbezug der Sitzung. 40 gleichzeitige
Unteragenten am selben Elternteil: **16 463 tps, 2,4 ms**. `FOR KEY SHARE`-Sperren sind
miteinander verträglich — viele Kinder an einem Elternteil kosten nichts. **Der Unteragenten-Baum
ist die billigste Struktur in diesem Schema.**

## 9. Was zu tun ist — in dieser Reihenfolge

1. **B-S1 schließen** (Mandantentrennung). Es ist die Voraussetzung für jede Suche; sonst ist
   die erste Vektorabfrage das Leck.
2. **Eine Sitzung = ein Prozeß** festschreiben, oder eine Sperrdatei. Sonst ist der
   Mehrprozess-Fall ein stiller Datenverlust.
3. **`flushEvery` bündeln und am Turn-Ende syncen.** Holt Faktor ~64 bei der Datei **und**
   gibt zum ersten Mal eine Haltbarkeitszusage.
4. **Den Zähler-`UPDATE` aus dem Nachrichtenpfad nehmen.** Faktor 8,6.
5. **Verbindungspool je Prozeß** einführen, bevor der zweite Benutzer kommt.
6. **Entscheiden: A, B oder C** aus Abschnitt 7. Ohne diese Entscheidung ist jede Suchtabelle
   geraten.
7. **Dann** `search_docs` + `search_vectors` bauen, mit RLS **und** dem Mandantenfilter in
   jeder Abfrage.

## 10. Was diese Datei nicht behauptet

* **`pgbench` mißt Transaktionen, nicht Schreibvorgänge.** Die absoluten tps-Zahlen sind nur
  innerhalb dieser Tabelle vergleichbar (siehe Abschnitt 3).
* **Die Lasttests liefen auf EINER Maschine, in EINEM Container**, auf einem Laptop. Die
  Verhältnisse übertragen sich; die absoluten Zahlen nicht.
* **Der Atomaritätsbefund der Anhänge ist eine Beobachtung, keine Zusicherung** (Abschnitt 2).
* **Kein zielgesteuerter Code wurde ausgeführt** — die Lasttests liefen gegen eine
  Wegwerf-Datenbank dieses Projekts, nicht gegen fremde Software.
* **Der Vorschlag zur Suchtabelle ist ein Entwurf, keine Messung.** Er ist aus den gemessenen
  Eigenschaften abgeleitet (Verschlüsselung, Mandantenlücke, Eigenheiten der Indizes) und
  muß gegen echte Daten gemessen werden, bevor er trägt.
* **Was mit Trajectory ist, steht hier nicht** — dazu läuft eine eigene Bestandsaufnahme.
