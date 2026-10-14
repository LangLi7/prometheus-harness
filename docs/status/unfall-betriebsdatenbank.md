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

## Was offen ist

- **Der Rettungsstand ist vom 14.10. 15:19** — älter als der Unfall, aber **nicht** identisch mit
  dem, was `pmh` zuletzt enthielt (er hat 39 Profile, `pmh` hatte 0). Ein Zurückspielen ist eine
  Entscheidung des Betreibers, keine Nebenbei-Aktion: ich habe **nichts** zurückgespielt.
- **Die drei anderen Sicherungen** (`store-postgres`, `einmaltoken`, `auth-http`) haben dieselbe
  Schwäche: sie vergleichen nur mit der Umgebung. Sie räumen nichts ab, sie **schreiben** nur —
  aber derselbe Griff macht sie zu Schreibern in der Betriebsdatenbank. Zu schließen.
- **Keine Sicherung des Stapels.** Daß es keinen Dump gibt, ist der eigentliche Befund: ein
  einzelner Aufruf hat den einzigen Stand vernichtet, und es gab nichts, wohin man zurückkonnte.
