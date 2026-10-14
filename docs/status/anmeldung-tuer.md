# Die Tür des Rechners hat jetzt eine Anmeldeseite

Stand: 14.10.2026, gemessen am laufenden Rechner `127.0.0.1:3081`.

## Was vorher war

Wer `http://127.0.0.1:3081/` ohne Token öffnete, bekam **eine Textzeile**:

```
dsh web authentication required; reopen the URL printed by dsh web.
```

Keine Seite, kein Weg hinein. Der Token stand nur in der Konsole des Rechners. Der Betreiber
hat genau das gemeldet.

## Was jetzt ist

| Anfrage | Antwort |
|---|---|
| `GET /` ohne Token | **303 → `/anmeldung/`** (die Anmeldeseite) |
| `GET /?token=…` | 303, setzt den signierten Keks, danach ist man drin |
| `GET /anmeldung/` | 200, die Anmeldeseite |
| `GET /start` | 303 (ohne Sitzung) |
| `GET /api/pmh/auth/zugang` | 401 (ohne Sitzung) |

Nach der Anmeldung öffnet ein Knopf **„Oberfläche öffnen“** die Oberfläche des Rechners. Er
holt die Token-Adresse vom Server und folgt ihr einmal.

## Wie das ohne Kernänderung geht

Keine Datei in `node_modules` wurde geändert. Zwei Hebel:

1. **Die 401 umbiegen.** `dsh-host-frontend-static` ruft die Sperre über die **Eigenschaft**
   `connection.authorizeIndex` (`lib/index.js:95`). Unser Paket legt eine eigene Funktion
   darüber: schreibt der Kern eine 401, antworten wir mit 303 auf die Anmeldeseite — und
   verschlucken seinen Text.
2. **Die Token-Adresse holen.** `connection.authenticatedUrl(basis)` gibt es als öffentliche
   Methode. Die Adresse bauen wir aus `ctx.webServer` (`protocol`, `host`, `port`) und **nicht**
   aus dem `Host`-Kopf: den setzt jeder Aufrufer selbst, und wer ihn fälschte, bekäme den echten
   Token in einer Adresse seiner Wahl.

**Nur ein Administrator bekommt sie.** Jeder andere bekommt 403 `kein-admin`. Wer sich anmelden
kann, kommt an den ganzen Rechner — die Konto-Tür wird damit so stark wie die Token-Tür.

## Zwei Ursachen, drei Versuche — und was daran gemessen ist

Der Weg dahin war dreimal rot. Beide Ursachen sind gemessen, nicht geraten:

| Versuch | Was war | Befund |
|---|---|---|
| 1 | Zugriff über `ctx.get('connection')` | Dienst **nicht gefunden** — unser Paket lädt früher, als er bereitsteht |
| 2 | Zugriff über `ctx.reflect.get('connection')` | immer noch nichts; erst `ctx.inject` **griff** — aber die Warnung stand **trotzdem** im Protokoll |
| 3 | Warnung nachgesehen: *„Dienst gefunden: ja, authorizeIndex: ja"* | Die Zuweisung auf die **Ausprägung** wirkte (die Weiterleitung stand!), aber das **Zurücklesen** zeigte sie nicht: der Dienst kommt durch einen **Stellvertreter**, der Schreiben weiterreicht und Lesen nicht zurückspiegelt |
| 4 | Zuweisung auf den **Prototyp** | greift beim ersten Versuch, Prüfung und Wirkung stimmen überein: *„die 401 des Kerns führt auf /anmeldung/ (Versuch 1)"* |

**Die Lehre, die hier steht.** Eine Prüfung, die über einen Stellvertreter liest, ist **keine**
Prüfung. Mein Code hatte eine Gegenprobe („hat es gegriffen?") — und die Gegenprobe log, weil sie
denselben Umweg nahm wie die Zuweisung. Erst als Wirkung und Prüfung **denselben** Weg gingen (der
Prototyp), war beides wahr. Und die Warnung war zweimal ein **Fehlalarm**: eine Meldung, die den
Betrieb anzeigt, obwohl er läuft, ist schlimmer als keine.

## Gemessen

```
GET /                  ohne Keks   ->  303, location /anmeldung/
GET /anmeldung/                    ->  200
GET /start                         ->  303
GET /api/pmh/auth/zugang           ->  401 (ohne Sitzung), 403 (kein Admin), 200 (Admin)
Sonde gegen den Rechner            ->  15/15, exit 0
Typlauf                            ->  27 Pakete grün, 0 rot
Brücke allein (10 Prüfungen)       ->  10 pass, 0 fail
Protokoll beim Start               ->  „die 401 des Kerns führt auf /anmeldung/ (Versuch 1)"
```

## Was offen ist

- **Der Token steht beim Weiterleiten einmal in der Adreßzeile.** Das ist der Preis dieser
  Brücke. Ohne Änderung am Kern gibt es keinen anderen Weg an den signierten Keks. Wer das
  vermeiden will, muß den Kern umbauen: die Sitzung des Kontos **direkt** als gültig anerkennen
  — das ist ein Eingriff in `dsh-client-connection`, nicht in unserem Baum.
- **Die Konto-Tür ist jetzt so stark wie die Token-Tür.** Wer ein Administratorkonto hat, kommt
  an Dateien und Prozesse dieses Rechners. Deshalb: Adresse und Kennwort gehören niemandem
  sonst, und der Claim (15 Minuten, einmal einlösbar) bleibt der Riegel für das erste Konto.
- **Kein Browser auf diesem Rechner.** Daß ein Browser die Seite bedienen kann, ist weiter
  **nicht** bewiesen; alle Prüfungen fahren HTTP über echte Sockets.
- **Die Meldungen des Servers sind deutsch**, auch auf der englischen Seite.
