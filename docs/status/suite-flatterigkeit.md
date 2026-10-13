# Die Prüfsuite flattert — belegt, aber nicht erklärt

> **Stand:** 13.10.2026, **fortgeschrieben** · **Status:** offener Befund. Ein
> Verdacht ist inzwischen **widerlegt** (§2a), die Ursache bleibt offen.
>
> **Warum das hier steht.** Ein Prüflauf, der manchmal rot ist, ist schlimmer als
> einer, der rot ist: man gewöhnt sich an ihn. Und ich habe diese Suite in vier
> Runden als „1174 pass / 2 fail" berichtet, während sie in Wahrheit **schwankt**.

---

## 1. Die Messungen

Derselbe Code, derselbe Befehl (`bun test`, mit `DATABASE_URL` und
`PMH_TEST_DATABASE_URL` gesetzt), **neun** Läufe:

| Lauf | pass | fail | Summe | Bemerkung |
|---|---|---|---|---|
| 1 | 1166 | **10** | 1176 | vor dem Wissensspeicher |
| 2–4 | 1174 | 2 | 1176 | dreimal in Folge |
| 5 | 1187 | **10** | 1197 | mit dem Wissensspeicher; **eine benannte rote: `Die Erstinbetriebnahme > der Claim ist an DIESEN Rechner gebunden`** |
| 6 | 1195 | 2 | 1197 | derselbe Code wie Lauf 5 |
| 7–10 | 1195 | 2 | 1197 | viermal in Folge, zusätzlich mit `--timeout 2000` (Lauf 10) |

**Die Summe stimmt immer.** Es wechseln **acht** Prüfungen zwischen grün und rot;
2 rote + 8 gekippte = 10.

**Zwei Ausreißer in zehn Läufen** — also **nicht reproduzierbar auf Zuruf**. Das
macht die Suche schwer und ist der Grund, warum hier ein **Meßweg** steht und keine
Vermutung.

---

## 2. Der Verdacht — und warum ich ihn nicht behaupte

**Verdacht:** Alle Datenbank-Prüfungen teilen **eine** Datenbank
(`PMH_TEST_DATABASE_URL` → `pmh_test`). `packages/auth/db-schema/tests/postgres.test.ts`
**löscht alle Tabellen**. Bei nebenläufigen Testdateien träfe dieser `DROP` andere
Prüfungen mitten im Lauf.

### 2a. **Widerlegt** — die Dateien laufen nacheinander

Gemessen mit `docs/status/messsonden/suite-nebenlaeufigkeit.mjs`. Die Sonde legt
Testdateien an, die ihren Anfang und ihr Ende in **eine** Protokolldatei schreiben,
mit 700 ms Pause dazwischen — aus der **Reihenfolge** folgt die Antwort eindeutig:

```
bun docs/status/messsonden/suite-nebenlaeufigkeit.mjs 2      # zwei Dateien
  a-start, a-ende, b-start, b-ende            -> nacheinander

bun docs/status/messsonden/suite-nebenlaeufigkeit.mjs 8      # acht Dateien
  d0-start, d0-ende, d1-start, … d7-ende      -> nacheinander, exit 0
```

**Auch mit acht Dateien — mehr als die halbe Suite — streng nacheinander.** Damit ist
die geteilte Datenbank als **Ursache dieser Ausreißer** erledigt: ein `DROP` in einer
Datei kann keine andere treffen, die noch nicht läuft. **Ich werde keine Ursache
beheben, die es nicht gibt.**

**Was die Sonde nicht sagt:** ob die echte Suite aus einem **anderen** Grund flattert.
Sie beantwortet **eine** Vorfrage — und die Antwort lautet nein.

### 2b. Der Mechanismus, der übrigbleibt — und ein Versuch, der nicht trug

Ein Abruch **mittendrin** reißt Folgeprüfungen mit. Das ist **selbst gemessen**: als
meine Wissensspeicher-Prüfung in die 5-Sekunden-Vorgabe lief, brach sie mitten im
Einfügen von 20 000 Zeilen ab, und der danach laufende `afterAll` räumte die
Mandanten weg, während die Anweisung noch lief — Ergebnis:

```
ERROR: insert or update on table "chunks" violates foreign key constraint
       "chunks_user_id_fkey"
       detail: Key (user_id)=(3b1d15bb-…) is not present in table "users".
```

**Der Versuch, das zu erzwingen, trug nicht** (`bun test --timeout 2000` → weiterhin
**1195 pass / 2 fail**): die einzige langsame Prüfung trägt ein **eigenes** Zeitlimit
(30 s), und das schlägt die Vorgabe. Ein kontrolliertes Auslösen müßte also **dort**
ansetzen. Damit ist der Mechanismus **plausibel und belegt**, aber **nicht als
Ursache dieser zwei Ausreißer nachgewiesen** — der Unterschied gehört hierher.

---

## 3. Was **nicht** die Ursache ist — drei widerlegte Annahmen

| Annahme | Warum sie falsch ist |
|---|---|
| **„Die Dateien laufen nebenläufig"** | **widerlegt**, §2a: zweimal gemessen, nacheinander |
| **„`glob` ist sprunghaft, deshalb flattern die Tests"** | eine andere Baustelle (`werkzeug-nachweis.md` §7) |
| **„Der 10er-Lauf kommt vom `atomic-write`-Test"** | der ist in **jedem** Lauf rot (2 von 2) und zählt nicht zu den acht gekippten |

---

## 4. Warum das **jetzt** wichtig ist

1. **Jeder Bericht über die Suite ist unzuverlässig**, solange das schwankt. Ich
   habe „1174 pass / 2 fail" mehrfach als Beleg genannt — richtig wäre gewesen:
   *„in diesem Lauf 1195/2; die Suite schwankt zwischen 2 und 10 roten."*
2. **Neue Prüfungen machen es wahrscheinlicher.** Der Wissensspeicher hat das
   Fenster verbreitert.
3. **Eine echte Fehlerquelle kann sich dahinter verstecken.** Solange die acht
   gekippten als „flatterig" gelten, sieht niemand, wenn eine davon aus einem
   **echten** Grund rot wird.

---

## 5. Der nächste Schritt — konkret

| Schritt | Was | Stand |
|---|---|---|
| 1 | Prüfen, ob Dateien nebenläufig laufen | **erledigt**: nein (§2a) |
| 2 | Die **Namen** aller roten in einem Ausreißer festhalten | **offen.** Es braucht einen Lauf, der die Ausgabe **speichert**, wenn `fail > 2` — viermal angesetzt, kein Ausreißer erwischt. Solange das fehlt, ist jede Ursachenangabe geraten |
| 3 | Ein **Zeitlimit je Datei** statt je Prüfung — oder ein Nachweis, daß keine Prüfung in die Vorgabe läuft | offen; §2b zeigt, was ein Abbruch anrichtet |
| 4 | In jedem Bericht die **Zahl des Laufs** nennen, nicht „die Suite ist grün" | **ab jetzt eingehalten** |

**Bis dahin gilt:** ein Lauf mit 2 roten ist der **Normalfall** (8 von 10 Läufen), ein
Lauf mit 10 roten ist **bekannt und ungeklärt** — und **beide Zahlen gehören in jeden
Bericht**.

---

## 2. Der Verdacht — und warum ich ihn nicht behaupte

**Verdacht:** Alle Datenbank-Prüfungen teilen sich **eine** Datenbank
(`PMH_TEST_DATABASE_URL` → `pmh_test`). Darunter ist
`packages/auth/db-schema/tests/postgres.test.ts` — und die erste Prüfung dieser
Datei **löscht alle Tabellen**:

```sql
DROP TABLE IF EXISTS auth_events, user_secrets, one_time_tokens, messages,
  chunks, documents, chats, workspaces, api_keys, auth_sessions, conversation_sessions,
  users, schema_migrations CASCADE;
```

Wenn Bun Testdateien **nebenläufig** ausführt, trifft dieser `DROP` andere Prüfungen
**mitten im Lauf**: deren Mandanten verschwinden, und sie scheitern an einer
Stelle, die mit ihrer eigenen Aussage nichts zu tun hat.

**Was dafür spricht:** genau das Bild — eine Prüfung, die einen angelegten Mandanten
„nicht wiederfindet"; und die Häufung seit dem Wissensspeicher, dessen Meßprüfung
**rund 10 Sekunden** für 20 000 Zeilen braucht und damit das Zeitfenster für eine
Überlappung **vergrößert**.

**Was dagegen spricht, und deshalb steht es hier:** ich habe **nicht** gemessen, ob
Bun Dateien nebenläufig ausführt. Ein Lauf mit lauter grünen Dateien beweist es
nicht, und mein Versuch, es aus der Ausgabe abzulesen, ist gescheitert — die
Zusammenfassung druckt keine Dateiüberschriften, an denen man eine Verschränkung
sehen könnte (`Select-String '^packages/|^apps/'` → **0 Treffer**).

**Wie es zu messen wäre** (nächster Schritt, nicht geraten):

1. Zwei Prüfdateien, die **absichtlich** dieselbe Tabelle anfassen und je eine
   eindeutige Zeile schreiben, mit einer künstlichen Verzögerung — und zählen, wie
   oft sie sich gegenseitig sehen.
2. Ein Lauf, in dem die destruktive Datei **allein** läuft (`bun test
   packages/auth/db-schema`) und die anderen **allein** — bleibt es dann stabil,
   spricht das für die Überlappung. (Geprüft, aber nur einzeln: `db-schema` allein
   **38 pass, 0 fail**; `store-postgres` allein **69 pass, 0 fail**; `auth-http`
   allein **77 pass, 0 fail**.)
3. Ein Lauf mit erzwungener Reihenfolge (falls Bun das kann) gegen einen Lauf ohne.

---

## 3. Was **nicht** die Ursache ist — zwei widerlegte Annahmen

| Annahme | Warum sie falsch ist |
|---|---|
| **„`glob` ist sprunghaft, deshalb flattern die Tests"** | die Werkzeugfrage aus A1 ist eine andere Baustelle (`werkzeug-nachweis.md` §7) und hat mit der Suite nichts zu tun |
| **„Der 10er-Lauf kommt vom `atomic-write`-Test"** | der ist in **jedem** Lauf rot (2 von 2 roten) und zählt nicht zu den acht gekippten. Er ist ein **eigener**, bekannter Fremdbefund (`os error 5` in `TEMP`) |

---

## 4. Warum das **jetzt** wichtig ist

1. **Jeder Bericht über die Suite ist unzuverlässig**, solange das schwankt. Ich
   habe „1174 pass / 2 fail" mehrfach als Beleg genannt — richtig wäre gewesen:
   *„in diesem Lauf 1174/2; die Suite schwankt zwischen 2 und 10 roten."*
2. **Neue Prüfungen machen es wahrscheinlicher.** Der Wissensspeicher hat das
   Fenster verbreitert. Die nächste lange Prüfung wird es weiter tun.
3. **Eine echte Fehlerquelle kann sich dahinter verstecken.** Solange die acht
   gekippten Prüfungen als „flatterig" gelten, sieht niemand, wenn eine davon aus
   einem **echten** Grund rot wird.

---

## 5. Der Vorschlag zur Behebung — in der Reihenfolge, in der es zu tun ist

| Schritt | Was | Warum zuerst |
|---|---|---|
| 1 | **Messen**, ob Dateien nebenläufig laufen (die drei Messungen aus §2) | ohne das ist jede Behebung ein Schuß ins Dunkle |
| 2 | Die **destruktive** Prüfung aus der geteilten Datenbank herausnehmen: sie legt sich ihre **eigene** Datenbank an (oder ein eigenes Schema) und räumt sie wieder ab | sie ist der einzige Prüfer, der **löscht** — und damit der einzige, der andere verletzen kann |
| 3 | Falls Bun Dateien nebenläufig führt und (2) nicht reicht: die DB-Prüfungen **serialisieren** | Reihenfolge statt Zufall |
| 4 | In jedem Bericht die **Zahl des Laufs** nennen, nicht „die Suite ist grün" | eine Zahl mit Datum ist ehrlich; „grün" ist eine Behauptung |

**Bis dahin gilt:** ein Lauf mit 2 roten ist der **Normalfall**, ein Lauf mit 10
roten ist **bekannt und ungeklärt** — und beide Zahlen gehören in jeden Bericht.
