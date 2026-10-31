# Der Hauptschlüssel liegt nicht in derselben Datei wie der Datenbankzugang

## Status

angenommen — 26.10.2026

## Kontext

Die Vorlage `.env.example` legte beides in eine Datei: die vier Datenbank-Passwörter
und `PMH_MASTER_KEY`. Das war bequem und ist falsch.

Der Hauptschlüssel öffnet jeden `wrapped_key` in `user_secrets` und
`credential_records`. Die Datenbank-Passwörter öffnen die Zeilen. Zusammen
ergeben sie den vollständigen Inhalt: Nachrichten, Dokumente und die
hinterlegten Anbieter-Schlüssel.

Ein Leck dieser **einen** Datei hätte damit beide Hürden gleichzeitig beseitigt —
die Verschlüsselung hätte den Angreifer nicht mehr aufgehalten, nur seine Arbeit
verlangsamt. Das ist der Unterschied zwischen zwei getrennten Schutzstufen und
einer, die nur so aussieht.

Der Code war bereits richtig gebaut: `standardQuellen` sucht in der Reihenfolge
Datei (0600) → Docker-Secret → Umgebungsvariable, und die Umgebungsvariable ist
ausdrücklich als schwächste und als Übergangsstufe dokumentiert. Nur die Vorlage
hat alle in die schwächste Stufe geschickt.

## Entscheidung

`PMH_MASTER_KEY` bleibt in `.env` **leer**. Der Schlüssel liegt in
`<PMH_HOME>/master.key` (Vorgabe `~/.pmh`) und wird mit
`bun scripts/schluessel.mjs` erzeugt. Wer bereits einen Wert in `.env` hat,
übernimmt ihn mit `bun scripts/schluessel.mjs --uebernehmen` — derselbe
Schlüssel, nur aus einer stärkeren Quelle, bestehende Umschläge bleiben lesbar.

Die leere Zeile bleibt als Platzhalter stehen, weil der Installer sie erwartet
(`scripts/install-parts.mjs`) und ein Test genau diese Form prüft
(`scripts/tests/install-parts.test.mjs`).

## Folgen

- Ein Leck von `.env` liefert nur noch den Datenbankzugang, nicht den Schlüssel.
  Ein Datenbank-Dump allein bleibt wertlos, weil die Umschläge zu sind.
- Ein Leck der Schlüsseldatei allein bleibt wertlos, weil die Chiffrate fehlen.
- Der Schlüssel liegt außerhalb des Repos und außerhalb des Compose-Kontexts;
  `docker-compose.yml` nennt `PMH_MASTER_KEY` nicht, der Container braucht ihn
  nicht.
- Auf Windows lässt sich der Dateimodus nicht prüfen (NTFS meldet immer `0o666`);
  das wird beim Laden **gesagt**, nicht verschwiegen. Der Schutz ist dort das
  Benutzerprofil.

## Was diese Entscheidung nicht löst

Die Trennung verhindert nicht, dass jemand den Schlüssel wieder in eine
Umgebungsvariable schreibt. Sie macht es nur unnötig und sichtbar: die Herkunft
steht bei jedem Zugriff in `haupt.herkunft`.

Ebenso ungelöst bleibt die zweite Hälfte der Zero-Trust-Frage: `pmh_app` sieht
weiterhin alle Mandanten, weil Row Level Security nur auf drei Tabellen aktiv
ist. Diese Entscheidung betrifft nur den Schlüssel, nicht die Mandantengrenze.
