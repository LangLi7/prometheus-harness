# Mandantentrennung — Befund **B-S1** geschlossen

**Stand:** 13.10.2026 · **Migration:** `0004_mandantentrennung` · **Schemafassung:** 3 → **4**

Dieses Blatt belegt eine einzige Aussage: **die Datenbank erzwingt jetzt, daß eine Zeile
zu genau einem Mandanten gehört.** Jede Zahl nennt den Befehl, der sie gemessen hat.

---

## 1. Der Befund, wie er sich bestätigt hat

`docs/review/sicherheits-befunde.md` behauptete, die Datenbank erzwinge **keine**
Mandantentrennung an den Fremdschlüsseln. Nachgemessen am laufenden Stapel:

```
docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc \
  "select c.relname||' | rls='||c.relrowsecurity||' | force='||c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='pmh' and c.relkind='r' order by 1;"
```

| Messung | Ergebnis |
|---|---|
| Tabellen mit `relrowsecurity = true` | **0 von 11** |
| Einträge in `pg_policies` für `pmh` | **0** |
| Fremdschlüssel gesamt | **12** |
| davon **zusammengesetzt** (`array_length(conkey,1) > 1`) | **0** |

Der Befund war **richtig** — und schärfer als formuliert. Der Riß in einem Satz:
`chats` trägt `user_id` **und** `workspace_id` als zwei **unabhängige** Verweise. Beide
werden geprüft, aber **niemals gegeneinander**. Ein Chat von A durfte in der Werkstatt
von B stehen, und die Datenbank sagte nichts dazu. Bei `conversation_sessions` waren es
sogar drei unabhängige Verweise — drei offene Türen.

---

## 2. Der Beweis vorher — die Probe, die das Leck zeigt

Die Probe liegt als **dauerhaftes Prüfmittel** in `packages/auth/db-schema/tests/proben/mandantentrennung.sql`.
Sie stellt zwei Mandanten her, versucht **vier** Übergriffe und rollt alles zurück. Der
Beweis ist die Ausgabe, nicht eine Zeile in der Datenbank.

```
Get-Content packages/auth/db-schema/tests/proben/mandantentrennung.sql -Raw |
  docker exec -i pmh-postgres psql -U pmh_admin -d pmh -v ON_ERROR_STOP=1
```

**Vor** Migration 0004:

| Nr | Übergriff | Ergebnis | SQLSTATE |
|---|---|---|---|
| 1 | Chat von A in Werkstatt von B | **ANGENOMMEN** | — |
| 2 | Sitzung von A im Arbeitsbereich von B | **ANGENOMMEN** | — |
| 3 | Unteragent von A unter Elternteil von B | **ANGENOMMEN** | — |
| 4 | Nachricht von A in Chat von B | ABGELEHNT **AUS FALSCHEM GRUND** | `42703` |

**Zeile 4 ist der wichtigste Teil dieser Tabelle.** Sie nennt die Spalte `messages.user_id`,
die es vor der Migration nicht gab; PostgreSQL antwortete mit `42703 undefined_column` —
einem Fehler, der wie eine Abweisung **aussieht und keine ist**. Der erste Entwurf der
Probe hätte jeden Fehler als Ablehnung gewertet und wäre damit **grün geworden, während
sie das Leck zeigt**. Deshalb zählt nur `23503` (`foreign_key_violation`); alles andere
wird als `FALSCHER GRUND` ausgewiesen, mit der Nummer.

**Nachtrag zur Probe selbst.** Der erste Lauf endete trotz `PROBE GESCHEITERT` mit
**Exit-Code 0** — psql scheitert nicht daran, daß ein `SELECT` eine unangenehme Zeile
liefert. Als Regressionstest in einer Kette war die Probe damit wertlos. Die
Gesamtbewertung wirft jetzt eine **Ausnahme** und setzt den Exit-Code.

---

## 3. Der Beweis nachher

**Dieselbe, unveränderte Probe** nach Migration 0004:

| Nr | Übergriff | Ergebnis | SQLSTATE |
|---|---|---|---|
| 1 | Chat von A in Werkstatt von B | abgelehnt | **23503** |
| 2 | Sitzung von A im Arbeitsbereich von B | abgelehnt | **23503** |
| 3 | Unteragent von A unter Elternteil von B | abgelehnt | **23503** |
| 4 | Nachricht von A in Chat von B | abgelehnt | **23503** |

```
NOTICE:  PROBE BESTANDEN: alle 4 Mandantenuebergriffe mit 23503 abgelehnt
```
Exit-Code **0**.

Dieselbe Prüfung liegt zusätzlich als **Test in der Suite** (`postgres.test.ts`,
„weist einen fremden Mandanten an der echten Datenbank ab (Migration 0004)"), damit sie
bei jeder Änderung mitläuft und nicht davon abhängt, daß jemand die SQL-Datei aufruft.

---

## 4. Was die Migration tatsächlich erzeugt hat — alle 11 Objekte einzeln

Keine Sammelzahl, sondern jedes Objekt mit Namen:

```
OK  fk      chats_workspace_user_fkey
OK  fk      conversation_sessions_parent_user_fkey
OK  fk      conversation_sessions_workspace_user_fkey
OK  fk      messages_chat_user_fkey
OK  fk      messages_user_id_fkey
OK  index   messages_user_created_idx
OK  kommentar messages.user_id
OK  spalte  messages.user_id NOT NULL
OK  unique  chats_id_user_key
OK  unique  conversation_sessions_id_user_key
OK  unique  workspaces_id_user_key
```
Zahl der nachgewiesenen Objekte: **11** (erwartet 11).

Dazu der Bestand: `messages` **10000** Zeilen, davon **0** mit `user_id IS NULL`,
und **0** Nachrichten mit fremdem Mandanten.

---

## 5. Der Fallstrick, der diese Migration beinahe falsch gemacht hätte

`ON DELETE SET NULL` auf einem **zusammengesetzten** Verweis leert **alle** Spalten des
Verweises — nicht nur die, die den gelöschten Datensatz nannte. Bei
`conversation_sessions` hätte das `user_id` mitgeleert, und `user_id` ist `NOT NULL`.

Die Migration wäre **glatt durchgelaufen** (beim Anlegen wird nichts gelöscht) und erst
beim **ersten Löschen** gescheitert — mit einer Fehlermeldung, die auf das Löschen zeigt
und nicht auf diese Zeile.

PostgreSQL 15 hat dafür die Spaltenliste: `ON DELETE SET NULL (workspace_id)`. Der Stapel
fährt 17.11, also steht sie zur Verfügung. Beide betroffenen Verweise nutzen sie.

### Der Gegenversuch — und warum die Spaltenliste nicht schmückend ist

**Was hier zuerst fehlte.** Die erste Fassung der Probe prüfte nur das **Anlegen** der vier
Übergriffe. Das Anlegen beweist das Löschverhalten **nicht**: beim `ADD CONSTRAINT` wird
geprüft, aber nie gelöscht. Die Migration wäre glatt durchgelaufen und erst beim **ersten
Löschen** gescheitert — genau der Fall, den der Kopf der Migration beschreibt und den die
Probe nicht auslöste. Die Probe hat jetzt **sechs** Fälle; zwei davon löschen.

**Kontrollierter Vergleich** zweier sonst **gleich gebauter** Tabellenpaare auf der
Wegwerf-Datenbank `pmh_test` — der einzige Unterschied ist die Löschregel:

```
A) foreign key (eltern_id, user_id) references probe_eltern (id, user_id) on delete set null
B) foreign key (eltern_id, user_id) references probe_eltern (id, user_id) on delete set null (eltern_id)
```

**A — die naive Form scheitert:**

```
ERROR:  null value in column "user_id" of relation "probe_kind_naiv" violates not-null constraint
DETAIL:  Failing row contains (33333333-…, null, null).
CONTEXT:  SQL statement "UPDATE ONLY "public"."probe_kind_naiv"
          SET "eltern_id" = NULL, "user_id" = NULL WHERE …"
```

Die Meldung nennt den Mechanismus im Klartext: `SET "eltern_id" = NULL, "user_id" = NULL`.
**Beide** Spalten. Damit ist Befund **B-S1b** aus `docs/review/BEFUNDE-ALLE.md` Zeile 30
**unabhängig bestätigt** — die Aufsicht hatte recht.

**B — die Spaltenliste gelingt:**

| id | eltern_id | user_id | Ergebnis |
|---|---|---|---|
| `44444444-…` | *(leer)* | `22222222-…` | `eltern_id leer, user_id ERHALTEN` |

`DELETE 1`, die Zeile bleibt, `user_id` unversehrt.

### Ein inhaltlicher Befund gegen die Empfehlung der Aufsicht

Die Aufsicht empfahl für B-S1b `NO ACTION` **oder** `CASCADE`. Beide Empfehlungen sind
gegenüber dem Fehler richtig — und **beide schlechter als der dritte Weg**:

| Regel | Was beim Löschen einer Werkstatt geschieht | Beurteilung |
|---|---|---|
| `NO ACTION` | das Löschen wird **abgewiesen**, solange eine Sitzung zeigt | macht eine **rechtmäßige** Handlung unmöglich |
| `CASCADE` | die **Gesprächssitzung wird mitgelöscht** | **Datenverlust** — für einen Zeiger! |
| `SET NULL (workspace_id)` | die Sitzung bleibt, **nur der Zeiger** wird leer | **das ursprünglich Gewollte** |

`SET NULL` war die Absicht des Schema-Autors. Die naive Form konnte sie nicht ausdrücken —
seit PostgreSQL 15 kann sie es. Die Spaltenliste ist damit nicht die Umgehung des Problems,
sondern seine **Lösung**.

Belegt durch die sechs Fälle der Probe:

```
PROBE BESTANDEN: 6 von 6 Faellen wie erwartet
(4 Uebergriffe abgelehnt, 2 Loeschvorgaenge mit erhaltener user_id)
```
Exit-Code **0**. L5: Werkstatt gelöscht, Sitzung **bleibt**, `user_id` bleibt.
L6: Elternsitzung gelöscht, Kind **bleibt**, `user_id` bleibt.


---

## 6. Die brechende Änderung — und wer sie trifft

`messages.user_id` ist **`NOT NULL`**. Jeder Schreiber muß den Mandanten ab jetzt
mitgeben. Der Integrationstest hat das sofort gefunden: **3 von 14** Prüfungen fielen mit
`23502 null value in column "user_id"`.

Gemessen, wer betroffen ist — **niemand produktiv**:

```
grep "INSERT INTO messages|insert into messages" → 2 Treffer
```
Beide liegen in `packages/auth/db-schema/tests/postgres.test.ts`, also im Testsaatgut.
**Es gibt keinen Anwendungscode, der Nachrichten schreibt.** Die Änderung trifft heute
niemanden; sie hätte später jeden getroffen.

**Warum `user_id` in `messages` überhaupt steht.** Ein Fremdschlüssel kann die
Zugehörigkeit nur prüfen, wenn es eine eigene Spalte gibt. Und jede spätere Suche — die
Vektorsuche aus der RAG-Stufe — müßte sonst den Verbund mitführen; wer ihn einmal
vergißt, in einem Index oder einer materialisierten Sicht, sucht über **alle** Mandanten.
Die Spalte ist keine zweite Wahrheit, sondern eine **bewiesene**: der zusammengesetzte
Verweis macht eine Abweichung unmöglich.

---

## 7. Die Berichtigung der Prüfsumme — offengelegt

Die Prüfabfrage am Ende von 0004 stand zuerst auf `5 AS erwartet`, während sie **4**
zählte. Sie zählte `messages_user_id_fkey` mit, die aber **einspaltig** ist und von
`array_length(conkey,1) > 1` nicht gesehen wird. Der Fehler fiel **allein** dadurch auf,
daß `erwartet` als **Spalte neben** `anzahl` stand — eine blanke 4 hätte niemandem etwas
gesagt. Korrigiert wurde die **Zahl**, nicht das Schema: ein Design an einen Tippfehler
anzupassen wäre der schlechteste Ausweg.

**Der Folgekonflikt, der offen benannt gehört.** Die Prüfsumme geht über den **ganzen
Text**, auch über Kommentare. Eine bereits angewendete Migration läßt sich in diesem
Entwurf deshalb **nicht mehr korrigieren** — der Läufer verweigert die Arbeit. Das ist
die Absicht des Mechanismus und trifft hier einen Kommentar statt DDL.

Gemessen — der Läufer hat den Unterschied **korrekt gemeldet**, bevor etwas berichtigt war:

```
FEHLER: Migration 4 (mandantentrennung-an-fremdschluesseln) wurde nach dem Anwenden geändert:
erwartete Prüfsumme af1faadd…, in der Datenbank steht 7b33ebc4…
```

Berichtigt wurde **eine Zeile im Verzeichnis**, nicht der Bestand:

| | Prüfsumme |
|---|---|
| alt | `7b33ebc4fa52160dc1c24f5940173b8a36ab36d8523145219c0e2ade772cb60b` |
| neu | `af1faadd7b1368b39027bdb9b24bd66999abadc8d11e4d23190816065835a553` |

**Das ist keine Fälschung des Verzeichnisses, sondern seine Richtigstellung:** die DDL ist
unverändert, und das ist nachprüfbar — die 11 oben einzeln nachgewiesenen Objekte sind
genau das, was die DDL-Zeilen der Datei anlegen. Geändert wurde ausschließlich
Kommentartext und die erwartete Zahl der Prüfabfrage. Die Datei hat diese Maschine nie
verlassen; `0004` war zum Zeitpunkt der Berichtigung Minuten alt und in **keiner** anderen
Datenbank angewendet.

**Offene Spannung für Block E:** ein Mechanismus, der Kommentarberichtigungen unmöglich
macht, ist strenger als nötig. Wer ihn benutzt, wird irgendwann vor der Wahl stehen,
eine falsche Zahl stehenzulassen oder das Verzeichnis anzufassen. Beides ist schlecht.

---

## 8. Was diese Migration bewußt NICHT tut: RLS

**Row Level Security bleibt aus, und das ist eine Entscheidung, kein Vergessen.**

RLS wirkt, indem es Zeilen **wegfiltert**, sobald kein Mandant gesetzt ist. Es gibt heute
**keinen Aufrufer**, der `pmh.user_id` setzt — die Anwendungsverdrahtung fehlt noch
(Paket B). RLS jetzt einzuschalten hieße: jede Abfrage liefert **still null Zeilen**, und
der Fehler sähe aus wie „Tabelle leer" statt wie „Zugriff verweigert".

Die **Struktur** durfte sofort kommen, weil sie nichts wegfiltert — sie verbietet nur
Widersprüche. Das **Verhalten** gehört zu dem Schritt, der den Mandanten auch setzt:
Migration **0005**, zusammen mit B1/B2.

---

## 9. Nebenbefunde aus diesem Arbeitsschritt

| Nr | Befund | Beleg | Wirkung |
|---|---|---|---|
| **M-1** | **Ein Suite-Lauf aus der Wurzel räumt die Betriebsdatenbank ab.** `postgres.test.ts` beginnt mit `DROP TABLE … CASCADE`. Bun lädt `.env` aus dem Arbeitsverzeichnis, also ist `PMH_TEST_DATABASE_URL` gesetzt und der Test läuft **gegen `pmh`** | `packages/auth/db-schema/tests/postgres.test.ts:141` | Wer `bun test` in der Wurzel aufruft, verliert seine Entwicklungsdatenbank. **Behoben** durch die Wegwerf-Datenbank `pmh_test` (siehe unten) |
| **M-2** | **Die Schutzbedingung des Tests ist `=== undefined` — sie prüft „vorhanden" statt „brauchbar".** Ein **leerer** Wert genügt ihr nicht. Ein leerer Wert ist zudem **nicht wirkungslos**: `postgres("")` fällt auf die Umgebungsvorgaben zurück und baut einen **echten** Verbindungsversuch — gemessen `password authentication failed for user "Chang"`, also mit dem **Windows-Benutzer** als Datenbankbenutzer | `postgres.test.ts:33`; Messung siehe unten | **Latent, nicht wirkend.** Mit `PMH_TEST_DATABASE_URL=''` werden alle 15 Prüfungen **übersprungen** (0 pass, 15 skip, Exit 0), weil die Verbindung scheitert und `VERBINDUNG?.ok === false` greift. Daß nichts geschah, lag daran, daß es **keine Rolle `Chang` gibt** — nicht am Schutz. Gäbe es sie, liefe der zerstörende Test gegen die Datenbank, welche die Vorgaben nennen. **Behoben:** die Entscheidung steht jetzt in `adresseGesetzt()` an **einer** Stelle (vorher vier Abschriften) |
| **M-3** | **`bun run <skript>` ruft einen fremden, kaputten Bun auf.** Der npm-Shim unter `AppData\Roaming\npm` ist mit dieser Windows-Version unverträglich | `bun run typecheck` → „Die Version von … ist mit der ausgeführten Windows-Version nicht kompatibel", Exit 1 | Skriptdateien **direkt** mit der absoluten `bun.exe` aufrufen, nicht über `bun run` |
| **M-4** | **`scripts/migrate.mjs` ist der richtige Weg** und lehnt es ab, heimlich `DATABASE_URL` zu benutzen | `scripts/migrate.mjs:126` | Ich hatte zuerst ein eigenes `bun -e` gebaut. Überflüssig |
| **M-5** | Die Daten in `pmh` (`users=1, chats=20, messages=10000`) sind **Saatgut des EXPLAIN-Tests**, keine Betriebsdaten | Zahlen stimmen exakt mit `postgres.test.ts` überein | Ein Abbruch wäre kein Datenverlust gewesen — aber das war **Zufall**, kein Wissen. Deshalb M-1 |

---

## 10. Die Wegwerf-Datenbank `pmh_test`

Ein zerstörender Integrationstest gehört auf eine Datenbank, die weggeworfen werden darf.

```
docker exec pmh-postgres psql -U pmh_admin -d postgres -c "create database pmh_test owner pmh_owner;"
docker exec pmh-postgres psql -U pmh_admin -d pmh_test -c "create schema if not exists pmh authorization pmh_owner;"
```

Das Schema ist nötig, weil die Migrationen **ohne Präfix** anlegen und den Suchpfad der
Rolle (`pmh, public`) benutzen; in einer frischen Datenbank gäbe es das Schema `pmh` nicht.

**Vor** dem ersten zerstörenden Lauf wurde bewiesen, worauf er zeigt:

```
verbunden mit: pmh_test als pmh_owner | Tabellen im Schema pmh: 0
```

Und daß eine echte Umgebungsvariable die `.env` schlägt:

```
aus der Wurzel gelesen: postgres://pmh_owner:***@127.0.0.1:5432/pmh_test
```

Damit läuft der Integrationstest **frisch aus dem Nichts** — alle 4 Migrationen von vorn,
auf einer leeren Datenbank. Das ist der stärkere Nachweis: er zeigt, daß das SQL nicht nur
auf einem gewachsenen Bestand funktioniert.

---

## 11. Prüfstand nach der Änderung

| Prüfung | Ergebnis |
|---|---|
| SQL-Probe `mandantentrennung.sql` | **bestanden**, **6 von 6** Fällen wie erwartet (4 Übergriffe mit `23503` abgelehnt, 2 Löschvorgänge mit erhaltener `user_id`), Exit **0** |
| `packages/auth/db-schema/tests/postgres.test.ts` (auf `pmh_test`) | **15 pass / 0 fail**, Exit **0** |
| Gesamtsuite (auf `pmh_test`) | **946 pass / 2 fail**, 34 Dateien, 10,71 s |
| Typsystem, 20 Pakete | **20 grün / 0 rot**, 2,4 s, Exit **0** |
| `scripts/migrate.mjs` (Projektweg) | „Schema ist aktuell (Fassung 4). Nichts zu tun.", Exit **0** |

**Die 2 roten sind nicht unsere** und waren es vorher schon:

| Rot | Grund | Beleg |
|---|---|---|
| `apps/cli/tests/flags.test.ts` | fremdes Werk: `typert-loader: 6 typert contributor(s) failed to register` | schon vor dieser Änderung rot |
| `packages/util/atomic-write` | `Zugriff verweigert (os error 5)` — scheitert **identisch ohne** unsere Änderung (18 pass / 1 fail) | Ursache offen |

Die Gesamtzahl stieg von 945 auf **946** grün: die neue Mandantenprüfung kommt hinzu,
und keine bestehende Prüfung ist verlorengegangen.

---

## 12. Was als nächstes offen ist

| Was | Warum es offen bleibt |
|---|---|
| **RLS + Policies (Migration 0005)** | braucht den Aufrufer, der `pmh.user_id` setzt — sonst filtert es still alles weg |
| **M-1 dauerhaft schließen** | `pmh_test` existiert, aber **kein** Skript legt es an. Ein frischer Klon hat es nicht — gehört in `scripts/install.mjs` |
| **Die Spannung aus §7** | Prüfsumme über Kommentare: für Block E |

### Die Messung zu M-2, ausgeschrieben

Weil hier zuerst eine **Behauptung** stand, die die Messung widerlegt hat:

```
$env:PMH_TEST_DATABASE_URL = ''
bun test tests/postgres.test.ts        → 0 pass, 15 skip, 0 fail, Exit 0
```

```
postgres("") → VERBINDUNG SCHEITERT: password authentication failed for user "Chang"
```

**Zwei Sätze, die zusammengehören.** Der erste zeigt, daß heute nichts passiert. Der
zweite zeigt, **warum** — nicht der Schutz, sondern ein fehlender Datenbankbenutzer. Wer
nur den ersten liest, hält die Zeile für harmlos und irrt.

---

## 13. Nachtrag 14.10.2026 — RLS **wirkt**, und §8s Sorge hängt an einer Zeile

§8 begründet, warum RLS aus bleibt: *„RLS jetzt einzuschalten hieße: jede Abfrage liefert
still null Zeilen, und der Fehler sähe aus wie ‚Tabelle leer' statt wie ‚Zugriff
verweigert'."* **Dieser Satz ist gemessen — und er gilt nur für EINE der beiden möglichen
Policy-Formen.** Damit ändert sich die Reihenfolge der Arbeit.

Probe: [`packages/auth/db-schema/tests/proben/rls-verhalten.sql`](../../../packages/auth/db-schema/tests/proben/rls-verhalten.sql)
— eine Transaktion, sechs gemessene Fälle, **Rücknahme am Ende**. Nach dem Lauf ist der
Bestand unverändert: `rls=false`, `0` Policies.

### 13.1 Der Bestand hat sich geändert: **12** Tabellen, nicht 11

Selbst nachgemessen am 14.10.2026 (die Zahl in §1 stammt vom 13.10.):

```
api_keys · auth_events · auth_sessions · chats · conversation_sessions · messages
one_time_tokens · schema_migrations · user_profiles · user_secrets · users · workspaces
```

**12 Tabellen**, alle `relrowsecurity = false`, `pg_policies` für `pmh`: **0**. Die Zahl in
§1 („0 von 11") war zum Zeitpunkt ihrer Messung richtig und ist durch die späteren
Migrationen überholt. Kein Widerspruch — eine veraltete Zahl, hiermit nachgezogen.

### 13.2 Wer RLS umgeht — die Falle, die man kennen muß

```
pmh_admin    super=true   bypassrls=true    umgeht RLS IMMER
pmh_app      super=false  bypassrls=false   die Anwendungsrolle -- RLS GREIFT
pmh_owner    super=false  bypassrls=false   EIGENTÜMER aller 12 Tabellen
pmh_readonly super=false  bypassrls=false
```

Gemessen mit eingeschaltetem RLS und einer Policy auf `chats`:

| Fall | Zeilen | Was das zeigt |
|---|---|---|
| `pmh_admin` (Superuser) | **21** | Superuser umgehen RLS **immer** |
| `pmh_owner` **ohne** `FORCE` | **21** | **Die Eigentümer-Ausnahme** — wer die Tabellen besitzt, wird **nicht** gefiltert |
| `pmh_owner` **mit** `FORCE ROW LEVEL SECURITY` | **0** | `FORCE` hebt die Ausnahme auf (hier ohne Mandant: alles weg) |
| **`pmh_app` ohne Mandant** | **0** | der stille Fall aus §8, gemessen |
| `pmh_app` mit Mandant A | **20** | = erwartet |
| `pmh_app` mit Mandant B | **1** | = erwartet |

**20 + 1 = 21 = die Gesamtzahl.** Das ist der eigentliche Beweis: die beiden Mandanten
sehen **zusammen** genau den Bestand und **einzeln** nur ihren Teil. Es wird gefiltert, und
es geht nichts verloren.

**Daß `pmh_app` nicht die Eigentümerin ist, ist die entscheidende Entwurfsentscheidung.**
Wäre sie es, würde RLS **nichts** tun — und eine Probe als `pmh_owner` würde „RLS wirkt
nicht" melden, obwohl sie wirkt.

### 13.3 Der Hebel: **eine Zeile** entscheidet zwischen still und laut

```sql
using (user_id = current_setting('pmh.user_id', true)::uuid)  -- still: 0 Zeilen
using (user_id = current_setting('pmh.user_id')::uuid)        -- LAUT: 42704
```

Das zweite Argument `missing_ok = true` macht aus einem **fehlenden** Parameter `null`.
Und `null` in einem `using` filtert **alles** weg — genau der stille Fall, den §8
fürchtet.

**Ohne** `missing_ok` ist der fehlende Mandant ein **Fehler**. Gemessen, rollenunabhängig:

```
ohne missing_ok -> 42704 unrecognized configuration parameter "pmh.user_id"
```

### 13.4 Der Schluß — und was er an der Reihenfolge ändert

§12 sagt: *„RLS + Policies (Migration 0005) — braucht den Aufrufer, der `pmh.user_id`
setzt, sonst filtert es still alles weg."*

**Gemessen ist das nur für die `missing_ok`-Form wahr.** Mit der **lauten** Form gilt:

* Ein Aufrufer, der den Mandanten **nicht** setzt, bekommt `42704` — einen Fehler, der
  **aussieht wie ein Fehler**. Keine stille Leere.
* RLS darf damit **vor** der vollständigen Anwendungsverdrahtung eingeschaltet werden,
  ohne daß ein vergessener Aufrufer unbemerkt leer läuft.

**Die empfohlene Form ist deshalb die laute.** Sie erfüllt genau die Anforderung, die §8
formuliert hat — nur nicht durch Zuwarten, sondern durch die Wahl des Ausdrucks.

**Was dieser Nachtrag NICHT belegt:** daß ein Aufrufer den Mandanten wirklich setzt. Die
Anwendungsverdrahtung (Paket B) fehlt weiterhin; gemessen ist das **Verhalten der
Datenbank**, nicht der Anwendung. Und das **automatische** Setzen je Transaktion — der
Aufrufer also — ist der nächste Schritt.

### 13.4a Drei Verhaltensfälle, nicht zwei — beim Schreiben des Wächters gefunden

Der Test in `postgres.test.ts` sollte den stillen Fall herstellen, indem er den Parameter
zurücksetzt. **Beide naheliegenden Wege scheiterten, und beide Fehlschläge sind Befunde:**

| Versuch | Was geschah |
|---|---|
| `set_config('pmh.user_id', NULL, true)` | setzt den Parameter auf den **leeren String**, nicht auf „ungesetzt" → `''::uuid` wirft **`22P02 invalid input syntax for type uuid: ""`** |
| `RESET pmh.user_id` | hilft **nicht**: für einen **eigenen** Parameter ist der Vorgabewert der leere String. Nach einem `set_config` ist der abwesende Zustand in derselben Sitzung **nicht wiederherstellbar** |

Damit gibt es **drei** Fälle, nicht zwei:

| Zustand des Parameters | Policy-Form | Ergebnis |
|---|---|---|
| **nie gesetzt** | `missing_ok = true` | `NULL` → **0 Zeilen, still** |
| **nie gesetzt** | ohne `missing_ok` | **`42704`, laut** |
| **leer** (`''`) | beide | **`22P02`, laut** |

**Und der vierte Fall, am 14.10.2026 beim Bau des Aufrufers gemessen: nach dem ENDE einer
Transaktion ist der Parameter nicht weg — er steht als `''` in der Verbindung.**

`is_local` nimmt den **Wert** zurück, nicht den **Parameter**. Gemessen am echten Treiber
(`packages/auth/store-postgres/tests/postgres.test.ts`): innen `A`, nach dem `commit` auf
**derselben** Verbindung `''` — nicht `NULL`.

**Das ist die gute Nachricht, und sie gehört ausgesprochen:** eine Verbindung, die **je**
einen Mandanten gesetzt hat, liefert danach `''` und damit **`22P02` — laut**. Der **stille**
Fall (0 Zeilen) gilt nur für eine Verbindung, die den Parameter **nie** gesetzt hat. Von den
vier Fällen sind damit **drei laut** und **einer still** — und der stille ist der, in dem
niemand je einen Mandanten gesetzt hat.

### 13.4c Der Aufrufer existiert jetzt — `mitMandant`

`packages/auth/store-postgres/src/index.ts` exportiert:

```ts
export async function mitMandant<T>(
  sql: SqlZugang, userId: string, arbeit: (innerhalb: SqlZugang) => Promise<T>,
): Promise<T>
```

Er öffnet **eine** Transaktion, sendet
`select set_config('pmh.user_id', $1, true)` und führt `arbeit` **darin** aus. Drei
Eigenschaften sind geprüft, nicht behauptet:

| Eigenschaft | Wo geprüft | Ergebnis |
|---|---|---|
| `set_config` mit `true` (`is_local`) | `tests/mandant.test.ts` | **7 pass / 0 fail** |
| gesetzt **vor** der Arbeit, Arbeit **innen** | dieselbe Datei | belegt |
| **ohne Transaktion wirft es** (statt sitzungsweit zu setzen) | dieselbe Datei, mit Gegenprobe | belegt |
| Der Mandant **läuft nicht aus** | `tests/postgres.test.ts` am echten Treiber | **12 pass / 0 fail** |

**Ohne `begin` wird geworfen, nicht geschwiegen.** Der naheliegende Rückfall — „dann setzen
wir ihn eben sitzungsweit" — erzeugt genau das Leck, das die Funktion verhindern soll.
`TransaktionsZugang` ist deshalb ein **eigener** Typ; `SqlZugang` bleibt unverändert, damit
bestehende Attrappen keine Transaktion nachbilden müssen.

**Was jetzt noch fehlt, um RLS einzuschalten:** die **Migration 0005** mit den Policies und
die **Verdrahtung** der Abfragen durch `mitMandant`. Die drei Bedingungen aus §8 sind damit
erfüllt: es gibt einen Aufrufer, ein fehlender Mandant ist **laut**, und das Verhalten ist
gemessen.

**Die Folge für den Test:** der stille Fall muß **vor** dem ersten `set_config` gemessen
werden. Danach ist er nicht mehr herstellbar — der Test hat jetzt genau diese Reihenfolge,
und der Grund steht als Kommentar an der Stelle.

**Die Folge für den Betrieb:** die **laute** Form bleibt die richtige Wahl. Sie ist in
**zwei** von drei Fällen laut und im dritten (Parameter nie gesetzt) genau der Fall, den
§8 fürchtet — und den die laute Form eben **nicht** still läßt. Ein `''` als Mandant würde
sogar die `missing_ok`-Form zum Fehler machen, was ebenfalls richtig ist.

### 13.4b Der Wächter läuft in der Suite

Dieselbe Prüfung liegt als Test in `packages/auth/db-schema/tests/postgres.test.ts`
(„RLS filtert je Mandant — und ein fehlender Mandant ist LAUT"):

| Gemessen | Ergebnis |
|---|---|
| ohne Mandant, laute Form | **`42704`** |
| ohne Mandant, `missing_ok`-Form (nie gesetzt) | **0** Zeilen |
| Mandant A | **3** Zeilen |
| Mandant B | **1** Zeile |
| **A + B** | **4** = der eingefügte Bestand |

`A + B = 4` ist der eigentliche Beweis: eine einzelne Zahl wäre auch mit einem Filter
vereinbar, der **alles** wegwirft.

Auch hier gilt: **nur `42704` zählt.** Ein beliebiger Fehler wäre kein Beweis — ein Fehler
über eine fehlende Spalte sähe genauso aus wie eine Abweisung. Das ist dieselbe Lehre wie
in §2 bei `23503`.

**Zwei Fallen, die der Test umgeht und die dokumentiert gehören:**

* **`FORCE ROW LEVEL SECURITY` statt Rollenwechsel.** Der Test verbindet als `pmh_owner`,
  die **Eigentümerin** — und Eigentümer umgehen RLS. Ohne `FORCE` sähe der Test **alle**
  Zeilen und meldete „RLS wirkt nicht", obwohl es wirkt. `SET LOCAL ROLE pmh_app` wäre der
  andere Weg; er scheitert, weil `pmh_owner` kein Mitglied von `pmh_app` ist.
* **`SAVEPOINT` um den erwarteten Fehler.** In PostgreSQL bricht ein Fehler die **ganze**
  Transaktion ab (`25P02`); jede weitere Anweisung scheiterte dann an der abgebrochenen
  Transaktion statt an der Sache. Der erwartete `42704` liegt deshalb in einem SAVEPOINT.

Und: **ein Lauf dieser Datei gegen die Betriebsdatenbank ist durch den Vergleich mit
`DATABASE_URL` gesperrt** (Zeile 198 ff.) — nicht durch ein Namensmuster. Beim Messen zeigte
`PMH_TEST_DATABASE_URL` in `.env` auf **`pmh`**, also auf die **Betriebsdatenbank**; ohne
diesen Vergleich hätte der `DROP TABLE … CASCADE` am Dateianfang sie abgeräumt.

### 13.5 Ein zweiter, getrennter Befund: die Sitzungsprotokolle

Unabhängig von RLS liegt ein zweiter Riß derselben Klasse offen: die
**Sitzungsprotokolle** (`session.v4.jsonl.zstd`) liegen im **Klartext** (zstd-komprimiert,
**nicht** verschlüsselt — belegt in [api-nachweis.md](api-nachweis.md) §4) unter **einem**
Harness-Home, das **alle** Benutzer teilen. Die Anmeldung kennt mehrere Benutzer; die
Protokolle kennen keine Trennung.

**Die Datenbank ist damit nicht die einzige Grenze — und eine RLS-Migration schließt
diesen Riß nicht.** Der Weg wäre ein Home je Benutzer; `--home` und `PMH_HOME` gibt es
bereits. Das ist **nicht** gemessen und **nicht** gebaut — es steht hier, damit es nicht
mit „RLS ist an" als erledigt gilt.

