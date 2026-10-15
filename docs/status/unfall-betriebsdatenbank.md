# Unfall: mein Testlauf hat die Betriebsdatenbank abgeräumt

Stand: 15.10.2026, 01:24:03. **Was hier steht, ist gemessen** — und es ist mein Fehler.

## Was passiert ist

Ich habe die Prüfungen des Schemas gegen meine Wegwerf-Datenbank fahren wollen und dafür zwei
Umgebungsvariablen gesetzt:

```powershell
$env:MIGRATION_DATABASE_URL = …/pmh_wegwerf
$env:DATABASE_URL           = …/pmh_wegwerf     # <— übersteuert
bun test packages/auth/db-schema/tests/postgres.test.ts
```

`PMH_TEST_DATABASE_URL` habe ich **nicht** gesetzt. Sie kam aus `.env` — und dort zeigt sie auf
die **Betriebsdatenbank `pmh`**. Der Test hat also gegen `pmh` gearbeitet: alle Tabellen
gelöscht (`DROP TABLE … CASCADE`, **`schema_migrations` eingeschlossen**), alle neun Migrationen
neu angewendet und seine eigenen Prüfdaten angelegt.

**Gemessen danach** (Zeitstempel sind der Beweis, nicht die Zeilenzahl):

```
select version, applied_at from schema_migrations;   →  ALLE 9 Zeilen: 2026-10-15 01:24:03
select min(created_at), max(created_at) from messages →  01:24:03 / 01:24:03   (10000 Zeilen)
select min(created_at), max(created_at) from users    →  01:24:03 / 01:24:03
```

Alle Zeilen tragen den Zeitpunkt des Laufs. Die alten Daten sind **fort**.

## Warum die Sicherung versagt hat

Die Sicherung im Test verglich den **Datenbanknamen der Prüfverbindung** mit dem Namen aus
`process.env.DATABASE_URL`:

> *Zeigt sie auf dieselbe Datenbank, ist der Lauf ein Fehler und kein Testlauf.*

Das war richtig gedacht — und **entwaffnet**, sobald jemand `DATABASE_URL` in seiner Sitzung
übersteuert. Dann stand dort `pmh_wegwerf`, die Prüfverbindung zeigte auf `pmh`, die Namen waren
verschieden, und die Sicherung ließ durch. **Eine Sicherung, die man mit einer Umgebungsvariable
umgehen kann, ist keine.**

Das ist genau der Fehler, den ich selbst vorher als Gefahr aufgeschrieben hatte
(„gleiche Betriebsdatenbank, verschiedene Zeichenketten — URL-vergleichende Sicherungen lassen
durch"). Aufgeschrieben und dann hineingelaufen.

## Was verloren ist — und was nicht

**Verloren:** der bisherige Inhalt von `pmh`. Das waren **Prüf- und Benchmark-Daten**, keine
Betriebsdaten des Betreibers: 3 Benutzer, 3 Arbeitsbereiche, 21 Chats, 10 000 Nachrichten
(erzeugt von `benchmarks/db-last/lauf.mjs`), 1 Sitzung, 1 Prüfspur-Eintrag. Die Zahlen sind
wiederherstellbar, die Konten nicht — sie stammten aus früheren Prüfläufen.

**Nicht verloren:**

| Was | Wo | Stand |
|---|---|---|
| `pmh_test` (Kopie der Betriebsdatenbank) | PostgreSQL | **14.10. 15:19:39** — 3 Benutzer, 3 Arbeitsbereiche, 21 Chats, 10 000 Nachrichten, **39 Profile**, 20 Prüfspur-Einträge |
| Der **Bau** der Anmeldung | Git | unberührt |
| Schema und Migrationen | Git | unberührt |

**Sicherungsdateien gibt es keine.** Kein Dump, kein Sicherungsordner, nur ein leeres
`~/pmh-fertig` vom 13.10. Der einzige Rettungsstand ist `pmh_test`.

## Was ich geändert habe — zwei Netze statt eines

1. **Der Vergleich gilt beiden Angaben**: der aus der **Umgebung** *und* der aus der **Datei**
   `.env`. Die Datei ist die Konfiguration des Betreibers; eine Variable einer einzelnen Sitzung
   darf sie nicht entwaffnen.
2. **Zerstören verlangt eine ausdrückliche Bestätigung.** Ohne `PMH_WEGWERF_BESTAETIGT=1` wird
   die Datei **übersprungen** und sagt das. Wer eine Datenbank abräumt, soll es **wollen**.

**Vier Lagen gemessen** (danach):

| Lage | Ergebnis |
|---|---|
| ohne Bestätigung | **übersprungen** (Meldung im Protokoll) |
| Bestätigung + Wegwerf-Datenbank | **16 pass, 0 fail** |
| Bestätigung + Betriebsdatenbank | **ABBRUCH**: *„dieser Test LÖSCHT ALLE TABELLEN und zeigt auf „pmh""* |
| **die Falle vom Unfall**: `DATABASE_URL` übersteuert, `PMH_TEST_DATABASE_URL` = `pmh` | **ABBRUCH** — die Datei hat die Sicherung gerettet |

Und die Betriebsdatenbank danach kontrolliert: **10 000 Nachrichten, 9 Migrationen** — sie hat
den vierten Lauf überstanden.

## Der zweite Fund: der zerstörende Test ließ ein halb migriertes Schema zurück

Beim Nachziehen der Riegel fielen zwei Prüfungen um — und die Ursache war ein **Fehler in der
Streichliste** des zerstörenden Schematests, nicht in den Prüfungen.

`DROP TABLE IF EXISTS …` zählte die Tabellen **einzeln auf**: `auth_events`, `messages`, `chats`,
`workspaces`, … Die Liste war älter als die Migrationen 8 und 9: `session_events` und
`workspace_folders` fehlten darin.

**Was dann geschieht, ist schlimmer als ein Fehler.** `DROP TABLE workspaces CASCADE` nimmt der
abhängigen Tabelle `workspace_folders` den **Fremdschlüssel** — und läßt sie **stehen**. Danach
läuft `migrate()`, trifft auf `CREATE TABLE IF NOT EXISTS workspace_folders`, findet die Tabelle
vor und legt sie **nicht** neu an. Zurück bleibt eine Tabelle **ohne** ihren Verweis: ohne
Kaskade, ohne Schutz gegen einen fremden Mandanten.

**Gemessen** in `pmh_wegwerf`:

```
pg_constraint … contype = 'f'   →  pmh: 1   pmh_test: 1   pmh_wegwerf: 0
```

Zwei Prüfungen fielen daraufhin um: „ein Ordner kann nicht am Arbeitsbereich eines fremden
Mandanten hängen" war grün bei einem Einfügen, das hätte scheitern müssen (23503), und „mit dem
Arbeitsbereich verschwinden seine Ordner" ließ eine Zeile stehen. **Die Prüfungen hatten recht.**

**Die Reparatur.** Die Streichliste ist jetzt **abgeleitet**, nicht abgeschrieben: eine Schleife
über `pg_tables` im Schema `pmh` löscht, was da ist. Sie kann nicht veralten. Nach dem nächsten
Lauf nachgemessen: Fremdschlüssel wieder da (`1`), 16 Prüfungen bestanden.

**Und die Lehre, die schon in Regel 26 steht** — diesmal in einer Streichliste: was wächst, wird
nicht abgeschrieben. Eine Liste, die niemand nachzieht, wird nicht falsch, sie wird
**gefährlich**: sie hinterläßt einen Zustand, der wie fertig aussieht.

## Was offen ist
- **Der Rettungsstand ist vom 14.10. 15:19** — älter als der Unfall, aber **nicht** identisch mit
  dem, was `pmh` zuletzt enthielt (er hat 39 Profile, `pmh` hatte 0). Ein Zurückspielen ist eine
  Entscheidung des Betreibers, keine Nebenbei-Aktion: ich habe **nichts** zurückgespielt.
- **Die drei anderen Sicherungen** (`store-postgres`, `einmaltoken`, `auth-http`) haben dieselbe
  Schwäche: sie vergleichen nur mit der Umgebung. Sie räumen nichts ab, sie **schreiben** nur —
  aber derselbe Griff macht sie zu Schreibern in der Betriebsdatenbank. Zu schließen.
- **Keine Sicherung des Stapels.** Daß es keinen Dump gibt, ist der eigentliche Befund: ein
  einzelner Aufruf hat den einzigen Stand vernichtet, und es gab nichts, wohin man zurückkonnte.
