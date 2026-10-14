# Die Sprache der Anmeldung

Stand: 14.10.2026. Gemessen auf dem laufenden Host `127.0.0.1:3081`.

## Was gebaut wurde

Ein Sprachpaket: `packages/util/sprachen`. Zwei Sprachen, Deutsch und Englisch.

Es hat keine Abhängigkeiten (keine Fremdbibliothek, kein Nachbarpaket). Deshalb können es
**beide** Seiten benutzen:

- die Seite im Browser (`apps/login_web`)
- die Seite des Rechners (`/start`, in `packages/api/auth-http/src/anmeldung.ts`)

Eine Abschrift auf jeder Seite wäre eine zweite Wahrheit: die englische Seite sagte dann
irgendwann etwas anderes als die deutsche.

## Wie man die Sprache wählt

**Auf der Anmeldeseite:** ein Auswahlfeld oben rechts. Die Wahl liegt im Keks `pmh_sprache`.

**Auf `/start`:** ein Link, zum Beispiel `?sprache=en`. Er setzt denselben Keks und leitet auf
`/start` zurück. Auf dieser Seite gibt es **kein** Skript; deshalb baut der Umschalter aus Links,
und die Richtlinie darf Skripte ganz verbieten.

**Die Reihenfolge der Entscheidung:** erst der Keks (die Wahl eines Menschen), dann die Sprache
des Browsers (`de-CH` zählt als `de`), dann Deutsch. Eine unbekannte Sprache ist kein Fehler —
sie gilt einfach nicht.

Denselben Keks liest der Rechner. Wer auf `/start` umschaltet, findet die Anmeldeseite danach in
derselben Sprache vor — und umgekehrt.

## Was jetzt nicht mehr passieren kann

Die Tabelle ist typisiert: `TEXTE` ist `Record<string, Texte>` mit einem ausgeschriebenen
`Texte`. Fehlt in einer Sprache ein Feld, wird der **Typlauf** rot — nicht der Nutzer, der eine
leere Stelle sieht.

Die Prüfungen (`packages/util/sprachen/tests/sprachen.test.ts`, 14 Stück) schauen auf das, was
ein Typ **nicht** sieht:

- kein Text ist leer
- kein Text enthält HTML (die Seite setzt ihr `<strong>` selbst)
- jede Sprache hat **genau** die Felder von Deutsch
- Englisch ist wirklich übersetzt und nicht abgeschrieben — sonst wären es zwei deutsche Sprachen
- ein erfundener Kekswert ergibt Deutsch und keinen Fehler

## Gemessen

| Was | Ergebnis |
|---|---|
| Sprachpaket allein | **14 pass, 0 fail** |
| Wege des Rechners, ohne Datenbank | **28 pass, 5 skip, 0 fail** |
| Wege des Rechners, mit Wegwerf-Datenbank | **31 pass, 0 fail** |
| Seite im Browser | **15 pass, 0 fail** (Weiterleiter 8, Sprache 7) |
| Typlauf | **27 Pakete grün, 0 rot** |
| Bau der Seite | exit 0 |
| Sonde gegen den laufenden Host | **15/15, exit 0** |

Am laufenden Host abgefragt:

```
GET /api/pmh/auth/sprachen
  {"ok":true,"value":{"sprachen":[{"id":"de","label":"Deutsch"},
                                  {"id":"en","label":"English"}],"vorgabe":"de"}}

GET /start?sprache=en
  303  location: /start
  set-cookie: pmh_sprache=en; Path=/; SameSite=Strict
```

## Was noch offen ist

**Die Meldungen des Rechners bleiben deutsch.** Sie kommen wörtlich vom Server
(`zugangsdaten-falsch` wird zu „Adresse oder Passwort ist falsch."), und der Server kennt keine
Sprachwahl. Eine englische Oberfläche mit deutschen Fehlermeldungen ist gemischt — aber geratene
Übersetzungen wären schlechter. Wer das schließen will, gibt dem Weg die Sprache mit (etwa im
Kopf `Accept-Language`) und übersetzt die Meldungen in `wege.ts` aus derselben Tabelle.

**Kein Browser auf diesem Rechner.** Daß ein Browser die Seite bedienen kann, ist damit weiter
**nicht** bewiesen — die Prüfungen fahren HTTP über einen echten Socket.
