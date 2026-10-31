# Zero Trust — beschlossene Reihenfolge

Stand 26.10.2026. Diese Notiz hält **nur die Reihenfolge** fest. Die Begründungen
stehen dort, wo sie gemessen wurden — vor allem in
[mandantentrennung.md](mandantentrennung.md) §8 und §13.

## Was bereits erledigt ist

| Punkt | Stand |
|---|---|
| Hauptschlüssel aus `.env` heraus | **erledigt** — liegt in `<PMH_HOME>/master.key`, [Entscheidung](../decisions/schluessel-nicht-in-der-env.md) |
| Least-Privilege-Rollen | vorhanden (`pmh_owner`, `pmh_app`, `pmh_readonly`, kein `TRUNCATE`/DDL für die Anwendung) |

## Die Reihenfolge, auf die wir uns geeinigt haben

**1. Zuerst: RLS flächendeckend.** Aus „ein Passwort = alle Daten" wird
„ein Passwort + ein Mandantenkontext = ein Mandant". Das ist der größte Hebel.

**2. Später, ausdrücklich nicht jetzt:**

- getrennte Rollen pro Subsystem (auth / content / jobs),
- kurzlebige DB-Credentials statt statischer Passwörter,
- Alarmierung aus `auth_events` (Massen-SELECT, neue IP, viele Fehlversuche).

## Was beim RLS-Entwurf nicht stillschweigend überschrieben werden darf

Die Ausnahmen sind **begründet**, nicht vergessen:

| Migration | Ausnahme | Grund |
|---|---|---|
| `0004` | RLS allgemein aus | ohne Setzer für `pmh.user_id` filtert RLS **still** alles weg |
| `0011` | `user_secrets`, `credential_records` | der Provider filtert jede Abfrage über `user_id` |
| `0012` | `invitations` | eigene Begründung in der Datei |
| `0013` | `crew_definitionen`, `crew_einstellungen` | eine Crew gehört mehreren |

Wer RLS einschaltet, muss diese vier Stellen **einzeln neu entscheiden** und die
Begründung fortschreiben — nicht die Zeile umdrehen und hoffen.

## Zwei gemessene Fallen (aus §13)

1. **`pmh_admin` umgeht RLS immer** (`bypassrls`). Eine Probe als Eigentümerin
   oder Superuser meldet „RLS wirkt nicht", obwohl es wirkt. Prüfen mit
   `SET LOCAL ROLE pmh_app`.
2. **`current_setting('pmh.user_id')` ohne `missing_ok`** — sonst liefert eine
   fehlende Kennung **null Zeilen** statt eines Fehlers, und ein leerer
   Bildschirm sieht aus wie „keine Daten".

## Wenn es doch passiert: Reihenfolge

1. **Zugang schließen** — neues Passwort in `.env`, `02-roles.sh` erneut laufen
   lassen (macht `ALTER ROLE … PASSWORD`), Sessions und API-Keys des Nutzers
   widerrufen.
2. **Reichweite feststellen** — `auth_events` plus Postgres-Log: welche Tabellen,
   wie viele Zeilen, von wo.
3. **Schlüssel-Fassung hochziehen**, falls der Master-Key betroffen war — dann
   alle Umschläge neu verpacken.
4. **Informieren**, wenn Klartext betroffen war: E-Mail-Adressen und Chat-Titel
   sind personenbezogen.

## Was Daten öffnet — und was nicht

Ein geleakter **Anbieter-Key** (OpenRouter, DeepSeek) öffnet die Datenbank
**nicht**. Daten öffnen nur zwei Wege: DB-Zugang, oder DB **plus** Master-Key.
Seit der Trennung liegen die beiden nicht mehr in derselben Datei.
