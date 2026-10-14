# Grenzen und Offenes — was heute nicht geht

> **Warum das ein eigenes Dokument ist.** Ein README, das seine eigenen Grenzen
> ausbreitet, wird nicht gelesen. Hier stehen sie vollständig, **mit der Messung,
> die sie belegt** — und mit den Stellen, an denen eine **frühere** Aussage in
> diesem Projekt **falsch geworden** ist.

## Was sich geändert hat (14.10.2026)

Vier Sätze aus dem README waren zum Zeitpunkt dieses Nachtrags **nicht mehr wahr**.
Sie werden hier nicht gelöscht, sondern richtiggestellt — wer die Geschichte
entfernt, lernt nichts.

| Frühere Aussage | Heute gemessen |
|---|---|
| „the chain is not reachable" | **Widerlegt.** Über die Kern-API haben `session/create` und `session/prompt` ein echtes DeepSeek-Modell antworten lassen — [api-nachweis.md](api-nachweis.md). Erreichbar ist die Kette damit **über den Kern**, nicht über unsere eigene Oberfläche. |
| „our own endpoint surface is two reading endpoints" | **Zu klein.** Dazu gehören `api/health`, `api/readiness` und der Anmeldebereich `api/auth-http` mit Anmeldeseite, Erstinbetriebnahme, API-Schlüsseln und Paßwort-Reset. |
| „envelope encryption exists as a schema, not as code" | **Widerlegt.** `verpacke`, `entpacke` und `rotiere` stehen in `packages/auth/secrets` und sind gemessen (`docs/status/messsonden/envelope-cost.mjs`). Offen ist die **Verdrahtung** des Wissensspeichers, nicht die Krypto. |
| „the Rust inventory is unused — nothing invokes them" | **Widerlegt.** `packages/util/atomic-write` startet `pmh-atomicfs` als Prozeß; `native/crypto` liefert `random_hex` aus `/dev/urandom` bzw. `BCryptGenRandom`. |
| „826 tests pass and 18 packages type-check clean" | **Zu klein.** Gemessen auf Linux: **1189 pass · 87 skip · 0 fail** über 55 Dateien; **25 Pakete** typprüfen grün. Belegt: [ci-nachweis.md](ci-nachweis.md). |

## Was offen ist

**Die eigene Oberfläche ist ein Gerüst.** `apps/web/src` hat 5 Dateien und **6**
sichtbare Zeichenketten. Es gibt **keinen** Chat und **keinen** Dateibaum. Die
künftige Oberfläche ist damit auch für die Übersetzung **unbekannt** — 63
Verzeichnisse unter `packages/client/` enthalten **0 Dateien**.

**Sitzungen liegen als JSONL, nicht in PostgreSQL.** `auth/store-postgres` gibt es
für Anmeldung und Wissensspeicher; ein `session-persistence-postgres` gibt es
nicht. Der Sitzungsformat-Stand v1 gegen die Vorlage v4 ist **nicht neu gemessen**
— die Aussage stammt aus einem früheren Bericht.

**Verdichtung fehlt.** `token-meter` **zählt** Token, es **kürzt** nicht.

**Der Wissensspeicher hat kein Schema-Problem mehr, aber keinen Indexer.**
Migration 0006 (Dokumente, Stücke, `vector(768)`, HNSW) und 0007 (Obsidian:
Gewölbe, Notizen, Etiketten, Verweise) sind mit Proben belegt. Es fehlen
**Einbettungen**, ein **Dateiwächter** und die **Graph-Ansicht**.

**Verschlüsselung des Wissensspeichers: Entscheidung getroffen, nicht gebaut.**
Ein Datenschlüssel je Benutzer, hinter einem Schalter — begründet in
[schluessel-je-stueck-oder-je-benutzer.md](../decisions/schluessel-je-stueck-oder-je-benutzer.md)
mit gemessenen Kosten.

## Was beim Prüfen aufgefallen ist — und offen bleibt

Diese Punkte stammen aus der Sicherheitsprüfung vom 14.10.2026 und sind **nicht**
behoben, wo sie nicht mir gehören.

**Die Datenbankprüfungen laufen gegen die Betriebsdatenbank.** `PMH_TEST_DATABASE_URL`
zeigt auf `pmh` statt auf `pmh_test`. Seit die Kennwörter stimmen, **laufen** die
Prüfungen deshalb (vorher übersprangen sie sich) — und **zehn scheitern** an
Migration 6 mit `type "vector" does not exist`, obwohl `vector` in **beiden**
Datenbanken vorhanden ist. Führende Erklärung, **nicht** belegt: die
Migrationsprüfung fährt die Kette auf einer frischen Datenbank, in der die
Erweiterung nicht vererbt wird.

**Der Geheimnis-Haken prüft nichts.** Er ist inzwischen verdrahtet und ruft das
richtige Bun, aber `gitleaks` fehlt — der Haken sagt das und blockiert nicht. Ein
**größerer** Wertetest (`leck-pruefung.mjs`) hat ergeben: **9 von 10** echten
Werten haben **0** Treffer in Historie und verfolgten Dateien; der eine Treffer ist
`REDIS_URL` (`redis://127.0.0.1:6379`, ohne Zugangsdaten) — ein **Fehlalarm** eines
rein längenbasierten Filters.

**`pg_hba.conf` steht für `127.0.0.1` auf `trust`.** Jede lokale Anmeldung gelingt
**ohne** Kennwort, auch als Superuser. Die gedrehten Kennwörter **wirken deshalb
noch nicht**. Nach außen gilt `scram-sha-256`.

**Die Betriebsdatenbank ist ausgesperrt:** 3 Benutzer, **0** Administratoren —
niemand kann ein Konto anlegen. Der Weg heraus ist ein Claim oder ein `UPDATE` auf
`role='admin'`; beides ist eine Entscheidung, kein Skriptlauf.

**Zwei Dienste gehören einer anderen Hand.** `pmh-supervisor` hat zwei rote
Prüfungen; `pmh-nix` und `pmh-attach` tragen nicht übertragene Arbeit. Sie werden
**gemeldet, nicht angefaßt**.

**Der Linux-Installationsweg ist teilweise gemessen.** `install.sh` ist in `sh`,
`dash` und `bash` syntaxgeprüft und seine WSL2-Erkennung belegt; die **sieben
Schritte** sind auf einem Linux-Dateisystem **nicht** durchgelaufen. Die **Suite**
läuft dort inzwischen grün (CI).

**Ein Defekt ist ungelöst, nicht behoben.** Der Treiber-Import des Installers
scheiterte reproduzierbar in einem frischen Klon, während dieselbe Datei aus
demselben Verzeichnis lief. Die Migration läuft jetzt als **eigener Prozeß**, was
in jedem gemessenen Fall funktioniert; die Diagnose steht im Code —
[beleg-installation.md](beleg-installation.md).
