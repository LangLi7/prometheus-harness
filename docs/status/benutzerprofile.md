# Benutzerprofile — B3 abgeschlossen

**Stand:** 13.10.2026 · **Migration:** `0005_benutzerprofile` · **Schemafassung:** 4 → **5**

Dieses Blatt belegt eine Aussage: **die Isolation je Benutzer ist jetzt dauerhaft, und sie ist
wörtlich die von `SandboxPolicy`.** Jede Zahl nennt den Befehl, der sie gemessen hat.

---

## 1. Was fehlte

`packages/auth/permissions` kennt `Isolation` — fünf Felder. Bis heute wurde dieser Wert bei
**jeder Anfrage neu abgeleitet** (`vorgabeProfil(home)` bzw. `adminProfil([home])`) und
nirgends gespeichert. Es gab also **keine Möglichkeit, einem Benutzer ein eigenes Profil zu
geben**; jeder mit der Rolle `user` bekam dasselbe.

## 2. Die Abbildung auf `SandboxPolicy` — 1:1, und gemessen

`SandboxPolicy` **gibt es schon**: als Rust-Typ in `services/pmh-sandbox/src/lib.rs` (Zeile 99).
`Isolation` sagt über sich selbst, es seien „genau die Felder von `SandboxPolicy`". Die
Gegenüberstellung:

| `Isolation` (TS) | `SandboxPolicy` (Rust) | hier (SQL) |
|---|---|---|
| `dateizugriff` | `file_access` | `dateizugriff` |
| `lesewurzeln` | `read_roots` | `lesewurzeln` |
| `schreibwurzeln` | `write_roots` | `schreibwurzeln` |
| `netz` | `network` | `netz` |
| `prozesse` | `spawn` | `prozesse` |

Die drei Werte sind **wörtlich** die, die `FileAccess::parse` (Zeile 72) annimmt: `none`,
`read-only`, `read-write`. Gespeichert wird nur die Langform — die Kurzformen (`ro`, `rw`, …)
sind für die Kommandozeile da, nicht für die Ablage.

**Und die Tabelle erzwingt dieselben drei Regeln wie `SandboxPolicy::validate()` (Zeile 131).**
Das ist der Kern: ein Profil in der Datenbank, das der Dienst später ablehnt, ist schlimmer als
kein Profil — der Fehler zeigte dann auf die Stelle, die es **benutzt**, statt auf die, die es
geschrieben hat. Die Begründung des Dienstes, wörtlich: *„read-only policy with write roots: one
of the two would have to be silently ignored, which is exactly the dishonesty this service
exists to avoid."*

## 3. Die Migration

```
packages/auth/db-schema/migrations/0005_benutzerprofile.sql
```

Fünf benannte Bedingungen — die Zahl stand im Kopf der Datei und stimmt:

| # | Bedingung | Was sie verhindert |
|---|---|---|
| 1 | `user_profiles_dateizugriff_known` | einen vierten Zugriffsgrad |
| 2 | `user_profiles_keine_wurzel_ohne_zugriff` | Regel 2 des Dienstes |
| 3 | `user_profiles_keine_schreibwurzel_bei_nur_lesen` | Regel 3 des Dienstes |
| 4 | `user_profiles_wurzeln_nicht_leer` | Regel 4 des Dienstes |
| 5 | `user_profiles_wurzeln_ohne_null` | den vierten Zustand: ein `NULL` in der Liste |

**Zwei Entwurfsentscheidungen, die begründet sein wollen:**

* **`user_id` ist der Primärschlüssel** — es gibt keine eigene `id`. Alle bisherigen Tabellen
  führen eine künstliche `id`; hier wäre sie ein Fehler: sie erlaubte **zwei** Profile für
  denselben Benutzer, und die einzige interessante Frage („welches gilt?") bliebe offen.
* **Ein einfacher Fremdschlüssel genügt** — und das ist **keine** Ausnahme von der
  0004-Regel. Dort waren zusammengesetzte Schlüssel nötig, weil jene Tabellen **mehrere**
  Mandantenangaben tragen (`user_id` **und** `workspace_id`), die auseinanderlaufen konnten.
  Diese Tabelle trägt genau **eine**.

## 4. Der Beweis: die Probe, und die Gegenprobe in Rust

```
Get-Content packages/auth/db-schema/tests/proben/benutzerprofile.sql -Raw |
  docker exec -i pmh-postgres psql -U pmh_admin -d pmh -v ON_ERROR_STOP=1
```

| # | Fall | erwartet | gemessen |
|---|---|---|---|
| 1 | gültiges Profil (`read-write`) | angenommen | **angenommen** |
| 2 | `none` + Lesewurzel | `23514` | **23514** |
| 3 | `read-only` + Schreibwurzel | `23514` | **23514** |
| 4 | leere Wurzel im Feld | `23514` | **23514** |
| 5 | `NULL` in der Wurzelliste | `23514` | **23514** |
| 6 | Kurzform `rw` | `23514` | **23514** |
| 7 | zweites Profil für denselben Benutzer | `23505` | **23505** |
| 8 | Profil ohne Benutzer | `23503` | **23503** |
| 9 | Vorgaben ohne Netz/Prozesse | `netz=f+prozesse=f+wurzeln=0` | **wie erwartet** |
| 10 | Benutzer löschen nimmt das Profil mit | `profil_weg=1` | **profil_weg=1** |

`PROBE BESTANDEN: 10 von 10` · Exit **0**.

**Die Gegenprobe auf der anderen Seite der Sprachgrenze:**

```
cd services/pmh-sandbox && cargo test --offline
  →  test result: ok. 14 passed; 0 failed
```

Darunter genau die vier Regeln aus der Tabelle:
`none_with_granted_roots_is_contradictory`, `read_only_with_write_roots_is_contradictory`,
`an_empty_root_is_rejected`, `an_unknown_access_level_is_rejected`. **Beide Seiten weisen
dieselben Fälle ab** — das ist die Abbildung, nicht nur ihre Behauptung.

**Nachtrag zur Probe selbst.** Der erste Entwurf war **eine** Transaktion mit neun Anweisungen.
Der erste Fehler brach sie ab, und die acht folgenden Fälle liefen **gar nicht** — sie meldeten
`current transaction is aborted`. Übrig blieb **eine** bewiesene Regel und ein Protokoll, das
nach neun aussah. Jeder Fall hat jetzt seinen eigenen `begin … exception`.

## 5. Die Tabelle hat einen Leser

Eine Migration ohne Aufrufer wäre genau das Muster, das wir an `claim` und `permissions`
beklagt haben. Deshalb:

| Was | Wo |
|---|---|
| `ladeProfil(sql, userId)` | `store-postgres` — `undefined` heißt „kein Profil", **kein** erfundenes Vorgabeprofil |
| `speichereProfil(sql, userId, isolation)` | `store-postgres` — `UPSERT`, eine Anweisung |
| `akteurAus(benutzer, home, eigenesProfil?)` | `auth-http` — **gespeichertes Profil gewinnt** gegen die Ableitung |
| `GET /api/pmh/auth/me` | liefert die Isolation aus der Zeile |

**Die Rolle kommt weiterhin aus `users`, nicht aus dem Profil.** Zwei Tabellen, zwei Fragen; ein
Profil, das die Rolle mitbrächte, wäre eine zweite Stelle, an der „wer ist Admin" steht.

**Ende-zu-Ende gemessen** (`packages/api/auth-http/tests/postgres.test.ts`): Profil
`read-only` mit einer Lesewurzel schreiben → anmelden → `GET /me` liefert
`dateizugriff: "read-only"`, `lesewurzeln: ["/nur-hier"]`, `schreibwurzeln: []` — **wörtlich
aus der Zeile**, nicht abgeleitet.

## 6. Mein Fehler: ich habe die Betriebsdatenbank abgeräumt

**Das ist der schwerste Vorfall dieser Runde, und die Ursache ist mein halber Fix aus Runde 5.**

`packages/auth/db-schema/tests/postgres.test.ts` beginnt mit `DROP TABLE … CASCADE`. Eine
Sicherung gegen die Betriebsdatenbank hatte ich in Runde 5 nur in
`store-postgres/tests/postgres.test.ts` eingebaut — **der zerstörende Test hatte keine**.

Beim Nachzählen der Prüfungen rief ich `bun test <datei>` aus dem **Wurzelverzeichnis** auf,
ohne `PMH_TEST_DATABASE_URL` zu setzen. Bun lädt `.env` aus dem Arbeitsverzeichnis, und darin
zeigt sie auf die **Betriebsdatenbank** `pmh`. Gemessen danach:

| | vorher | nachher |
|---|---|---|
| `auth_events` | **12** | **0** |
| `auth_sessions` | 1 (widerrufen) | **0** |
| `users` | 4 | 3 |

**Was verloren ist:** die Prüfspur meiner Nachweise und ein Prüfbenutzer — **Testdaten und
eigene Nachweise, keine Betriebsdaten.** Belegt dadurch, daß die drei verbliebenen Benutzer
allesamt Testsaatgut sind: `index@example.org` (EXPLAIN-Test) und `trennung-a/b@example.org`
(Mandantenprüfung). **Der Schaden war klein, die Ursache nicht** — derselbe Aufruf hätte alles
abgeräumt, was je in dieser Datenbank steht.

**Die Reparatur, und ihr Beweis.** Die Sicherung steht jetzt **auch** im zerstörenden Test.
Absichtlich auf die Betriebsdatenbank zeigen lassen:

```
error: ABBRUCH: dieser Test LÖSCHT ALLE TABELLEN und zeigt auf „pmh" — dieselbe Datenbank
       wie die Anwendung (DATABASE_URL) …
 0 pass  1 fail
```

Und der Zustand davor und danach, gemessen: `benutzer=3 tabellen=12 migrationen=5` —
**unverändert**. Der Abbruch geschieht **vor** dem `DROP`.

## 7. Prüfstand

| Prüfung | Ergebnis |
|---|---|
| Probe `benutzerprofile.sql` | **10 von 10**, Exit **0** |
| `cargo test` in `services/pmh-sandbox` | **14 pass / 0 fail**, Exit **0** |
| Typsystem | **22 Pakete grün**, Exit **0** |
| Gesamtsuite auf `pmh_test` | **1051 pass / 2 fail** — 1053 in 39 Dateien |
| Tor-Test mit Datenbank (11 Fälle) | **11 pass / 0 fail**, darunter der neue Profil-Fall |
| Speicher-Attrappen | **40 pass / 0 fail** (vorher 32, **+8**) |
| Rechte | **15 pass / 0 fail** (vorher 13, **+2**) |
| Projektweg `scripts/migrate.mjs` | „Schema aktualisiert: 1 Migration(en) (5) — jetzt Fassung 5", Exit **0** |

Die 2 roten sind **nicht unsere**: `apps/cli` (`typert-loader`, Ladefehler) und
`packages/util/atomic-write` (`Zugriff verweigert`, os error 5).

**Eine Zahl, die ich nicht vollständig erklären kann.** Die Suite stieg von **1042 auf 1051**
grün (**+9**), meine geänderten Testdateien gewannen aber **+11** Prüfungen (8 + 2 + 1, je
Datei gemessen). Die Differenz von 2 erklärt sich **plausibel** damit, daß die zwei kaputten
Dateien verschieden viel beitragen, wenn sie einzeln statt in der Suite laufen
(`apps/cli/tests/flags.test.ts` allein: `pass=0 fail=1`; `atomic-write` allein: 18 pass / 1 fail
von 19) — **bewiesen ist das nicht.** Es steht hier als offene Differenz, nicht als Erklärung.

## 8. Was danach kommt

**RLS als Migration `0006`.** Die Voraussetzung ist erfüllt: der Aufrufer, der den Mandanten je
Anfrage kennt, ist mit `werBinIch` da, und `ladeProfil` zeigt, wie ein Aufrufer aussieht. Bei
`0006` ist die zentrale Frage zu beantworten, die `0004` aufgeschoben hat: **welche Rolle
setzt `pmh.user_id`, und was geschieht, wenn sie es nicht tut?** Ohne diese Entscheidung
filtert RLS still alles weg — und ein leerer Bildschirm sieht aus wie „keine Daten", nicht wie
„kein Recht".
