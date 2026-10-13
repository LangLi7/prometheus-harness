# Beleg: der erste eigene Endpunkt läuft im Host

**Datum:** 13.10.2026 · **Anlaß:** Der Kern des Projekts war gebaut (14 Pakete,
262 + 108 Tests grün), aber **kein einziges Paket davon war angeschlossen**. Der
Host lieferte die Oberfläche des Cores aus; unser Code lief nur in `bun test`.

Mit diesem Schritt sind es **15 Pakete** und — gemessen mit echter Datenbank —
**690 Tests grün, 0 rot** über 25 Dateien. Dieser Beleg zeigt den kleinsten
Schritt, der das ändert — und die **fünf** Fehler, die auf dem Weg dorthin in
meinem Code steckten.

## Das Ergebnis

Ein gestarteter Host, drei Aufrufe von außen:

```
GET /api/health                      -> 200
{"status":"ok","service":"@prometheus-harness/health","version":"0.2.0",
 "uptimeMs":17807,"runtime":"bun 1.4.0"}

GET /api/ready                       -> 401
{"status":"error","error":"unauthenticated"}   + WWW-Authenticate: Cookie

GET /api/ready  (mit Sitzungscookie) -> 200
{"status":"ok",…,"bereit":true,"prozessSekunden":18,"plattform":"win32"}
```

Gestartet mit `bun run start --no-go`, Port 3081 (3080 hält der Harness des
Betreibers). Die Handler stehen in `packages/api/health/src/index.ts` und sind
über den **offiziellen Dienst** `ctx.webServer.register` eingehängt — nicht über
eine eigene Serverinstanz.

## Was damit bewiesen ist

| Frage | Beweis |
|---|---|
| Findet der Loader des Hosts **unser** Paket? | Ja — der Host startet und die Endpunkte antworten |
| Ist der Dienst `webServer` für uns erreichbar? | Ja — `inject: [webServer]`; ohne ihn würde der Loader warten |
| Erreicht eine Anfrage von außen unseren Code? | Ja — HTTP-Antworten mit unserem JSON über den Netzstapel |
| Genau unsere Pfade und kein Präfix? | `/api/health?x=1` → **200**; `/api/health/mehr` und `/api/ready/mehr` → **404** |
| Falsche Methode wird unterschieden? | `POST /api/health` → **405**, `Allow: GET, HEAD` |
| **Greift die Anmeldesperre auf unserer Fläche?** | Ja — `/api/ready` ohne Cookie **401**, mit Cookie **200** |
| Läuft der Host ohne unser Paket unverändert? | Ja — vor dem Eintrag antworteten die Adressen **404** |

## Die Anmeldesperre — und der fünfte Fehler

Der erste Entwurf hatte **einen** offenen Endpunkt: `/api/health`. Er antwortete
**ohne** Anmeldung mit 200. Das war im Beleg als Entscheidung ausgesprochen — und
die Entscheidung war **falsch**, sobald ein zweiter Endpunkt dazukommt. Die
Route geht am Auffang-Platz vorbei (siehe oben), also hätte **jeder** weitere
Endpunkt stillschweigend offen gestanden.

Deshalb gibt es jetzt **zwei** Endpunkte:

| Pfad | Anmeldung | Frage |
|---|---|---|
| `GET /api/health` | **nein** | *läuft der Prozeß?* |
| `GET /api/ready` | **ja** | *ist die Anwendung dahinter ansprechbar?* |

**Warum `/api/health` offen bleibt.** Eine Erreichbarkeitsprüfung, die eine
Anmeldung verlangt, kann nicht melden, daß die **Anmeldung kaputt** ist. Sie sagt
deshalb auch nichts außer „dieser Handler läuft".

**Die Sperre ist die des Hosts, keine eigene.** `ctx.connection.requestRejection`
prüft zuerst den Host/Origin-Zaun und danach die Browsersitzung:

| Ergebnis | Bedeutung | unsere Antwort |
|---|---|---|
| `undefined` | erlaubt | der Inhalt |
| `403` | nicht der Host, für den wir gebaut sind | **403** `untrusted_origin`, **ohne** `WWW-Authenticate` |
| `401` | nicht angemeldet | **401** `unauthenticated`, mit `WWW-Authenticate: Cookie` |
| Dienst fehlt | nicht prüfbar | **503** `unavailable` — **verweigern statt durchlassen** |

Eine zweite Meinung darüber, was eine gültige Anmeldung ist, geht irgendwann
auseinander. Das Cookie ist mit einem 32 Byte langen Geheimnis unterschrieben;
wer das nachbaut, baut es falsch nach — und merkt es nicht, weil beide Seiten
„funktionieren".

**Gemessen am laufenden Host (Port 3081), mit `curl`:**

| Aufruf | Antwort |
|---|---|
| `GET /api/health` ohne alles | **200** `{"status":"ok",…,"version":"0.2.0",…}` |
| `GET /api/ready` ohne alles | **401** `{"status":"error","error":"unauthenticated"}` + `WWW-Authenticate: Cookie` |
| `GET /api/ready` mit **falschem** Cookie | **401** ebenso |
| `GET /api/ready` mit Sitzungscookie aus der Token-Weiterleitung | **200** `{…,"bereit":true,"prozessSekunden":18,"plattform":"win32"}` |
| `GET /api/ready/mehr` | **404** — genau, kein Präfix |
| `GET /api/unbekannt` ohne Anmeldung | **401** `unauthorized` (die Sperre des Cores, vor dem Auffang-Platz) |

### Der fünfte Fehler: `connection` als Einhänge-Bedingung

Der erste Entwurf forderte `inject: ['webServer', 'connection']` — ohne
Verbindungsdienst sollte der Loader uns **gar nicht** einhängen. Der Gedanke klang
nach Sicherheit.

**Er bewirkte das Gegenteil.** In einem Aufbau ohne Verbindungsdienst hing der
Loader das Plugin **nie** ein, und beide Endpunkte antworteten **404**. Ein
Endpunkt, der wegen einer fehlenden Prüfung verschwindet, kann nicht melden,
**daß** die Prüfung fehlt. Er verschwindet still.

Gefunden hat das die Prüfung „ohne Anmeldung antwortet sie 401": sie bekam
**404**. Aufgefallen ist es nur, weil ein eigener Testaufbau den Dienst nicht
mitbrachte — im vollen Host wäre der Fehler **nie** sichtbar geworden.

Jetzt gilt: das Plugin hängt sich immer ein. Fehlt der Dienst zur Laufzeit,
antwortet `/api/ready` mit **503** und nennt den Grund. Ein Ausfall, den man
abfragen kann.

## Die Prüfung der Sperre — und ihre Grenze

`packages/api/health` prüft mit einer **Attrappe** des Verbindungsdienstes: sie
hat dieselbe Signatur, dieselben möglichen Werte, und sie **zählt die Aufrufe
mit**. Damit ist belegt, daß wir `requestRejection` mit den Kopfdaten der Anfrage
aufrufen und auf `undefined`, `401`, `403` und einen fehlenden Dienst richtig
antworten.

**Was die Attrappe nicht kann:** zeigen, daß unser Aufruf die **echte** Prüfung
erreicht. Das ist eine andere Frage — und sie ist am **laufenden Host** gemessen,
in der Tabelle oben. Zwei Aufbauten, zwei Fragen; keiner behauptet, der andere zu
sein.

## Nachweise

| Nachweis | Befehl | Ergebnis |
|---|---|---|
| Prüfungen des Pakets | `bun test packages/api/health` | **40 pass · 0 fail** |
| Gesamtlauf | `bun test packages scripts apps` | **690 pass · 0 fail** (25 Dateien, 6,6 s) |
| Gesamtlauf ohne Testdatenbank | ebenso, ohne `PMH_TEST_DATABASE_URL` | **676 pass · 14 skip · 0 fail** — übersprungen, **nicht** bestanden |
| Prüfungen der Profil-Verdrahtung | `bun test scripts/tests/profile-patch.test.mjs` | **24 pass · 0 fail** |
| Typecheck | `bunx tsgo --noEmit -p packages/api/health/tsconfig.json` | **exit 0** |
| Typecheck alle Pakete | je `tsgo --noEmit -p <paket>` | **17 grün · 0 rot** |
| Alle Skript-Prüfungen | `bun test scripts/tests/` | **58 pass · 0 fail** (3 Dateien) |
| Endpunkt im Host, offen | `curl /api/health` | **200** mit unserem JSON |
| Endpunkt im Host, geschützt | `curl /api/ready` | **401** + `WWW-Authenticate: Cookie` |
| Mit Sitzungscookie | `curl /api/ready` mit Cookie | **200** mit `bereit: true` |
| Pfadgenauigkeit | `?x=1` · `/api/health/mehr` · `/api/ready/mehr` | **200** · **404** · **404** |

## Was hier **nicht** belegt ist — ehrlich

1. **Der `Content-Length`-Kopf ist in der HTTP-Antwort nicht nachgewiesen** (siehe unten, Punkt 2 der alten Fassung).
2. **Nur Windows.** Gemessen auf Windows nativ, Bun 1.4.0. Linux ist nicht gemessen.
3. **Die Attrappen halten Verträge fest, nicht ihre Erfüllung.** Ändert der Core die Bedeutung von `requestRejection` oder `WebServer.register`, bleiben unsere Prüfungen grün. Dagegen hilft nur die Messung am laufenden Host — und die ist eine **Handmessung**, keine Prüfung, die bei jeder Änderung läuft.

---

# Teil 2: `/api/ready` prüft jetzt die Abhängigkeiten

**Datum:** 13.10.2026 · **Anlaß:** Teil 1 dieses Belegs nannte die Lücke selbst:
*„`/api/ready` sagt, daß die Anwendung antwortet; ob PostgreSQL erreichbar ist,
sagt es nicht."*

## Das Ergebnis

```
GET /api/ready   (mit Sitzungscookie)  -> 200
{"service":"@prometheus-harness/health","version":"0.3.0",…,
 "bereit":true,"zustand":"ok",
 "sonden":[{"name":"postgres","zustand":"ok","dauerMs":109},
           {"name":"redis","zustand":"ok","dauerMs":4}],
 "zwischengespeichert":false}
```

Und mit **absichtlich kaputtem** Redis (`REDIS_URL=redis://127.0.0.1:6399`):

```
GET /api/ready   -> 503
{…,"bereit":false,"zustand":"eingeschraenkt",
 "sonden":[{"name":"postgres","zustand":"ok","dauerMs":25},
           {"name":"redis","zustand":"fehler","dauerMs":4,
            "grund":"Verbindung zu 127.0.0.1:6399 fehlgeschlagen: connect ECONNREFUSED …"}]}

GET /api/health  -> 200   (der Prozeß lebt)
```

**Das ist der Unterschied der beiden Endpunkte, gemessen statt behauptet:** ein
Ausfall einer Abhängigkeit ergibt **503** auf `/api/ready` und **200** auf
`/api/health`. Wären beide Zahlen gleich, wäre einer der beiden Endpunkte
überflüssig.

## Warum ein **Register** und keine festen Prüfungen

Die naheliegende Fassung wäre: `health` verbindet sich mit PostgreSQL und Redis.
**Das wäre falsch:**

* **`health` würde von den Datenbanken abhängig.** Ein Endpunkt, dessen Aufgabe
  „Zustand melden" ist, darf nicht selbst am Zustand hängen — ein Fehler in der
  Datenbankverbindung risse den Endpunkt mit, der ihn melden soll.
* **Es verletzt Regel 2 dieses Projekts** (README): keine Unit importiert Interna
  einer anderen.

Deshalb stellt `health` einen **Vertrag** bereit — `ctx.readyness.register(sonde)`
— und `@prometheus-harness/readiness` trägt seine Sonden dort ein. `health` kennt
PostgreSQL nicht.

## Die Sonden — und warum sie nicht `select 1` und `PING` sind

**PostgreSQL: drei Fragen, nicht eine.**

| # | Frage | Warum |
|---|---|---|
| 1 | `select 1` | steht die Verbindung? |
| 2 | Fassung aus der Migrationstabelle | sind die **Migrationen** gelaufen? |
| 3 | Kern-Tabellen vorhanden? | ist das **Ergebnis** da? |

`select 1` allein wäre eine Behauptung: fehlende Tabellen, eine nie gelaufene
Migration, ein falscher Suchpfad — alles liefert bei `select 1` ein fröhliches
Ergebnis. Ein Bereitschaftsendpunkt, der dann „bereit" sagt, ist schlimmer als
keiner.

**Redis: ein `PING` über einen Socket.** Gemessen am 13.10.2026, Bun 1.4.0:

| Weg | Ergebnis |
|---|---|
| `postgres` (npm) gegen 5432 | **OK** (`select 1` → `1`, Fassung `17.11`) |
| `Bun.SQL` gegen 5432 | **OK** |
| `Bun.redis` | **vorhanden, aber ohne benutzbare Methoden** (`Object.keys` → leer) |
| **rohes TCP, `PING`** gegen 6379 | **OK** (`+PONG`) |
| `fetch('redis://…')` | **FEHLER** (`protocol must be http:, https: or s3:`) |

Und eine Antwort, die nicht `PONG` ist, gilt **nicht** als bereit: „jemand
antwortet" ist nicht dasselbe wie „Redis ist bereit".

## Der sechste eigene Fehler — und die Lücke, die ihn durchgelassen hat

**Der Fehler.** Im Host scheiterte das Sonden-Paket vollständig:

```
[host] pmh: warning: 2 entries did not activate
[host] pmh-readiness (@prometheus-harness/readiness):
       Error: readiness: der Dienst "readyness" fehlt, obwohl inject ihn fordert
```

`apply` las den Dienst mit `ctx.get('readyness')` **innerhalb von `apply`**. Aber
`ctx.provide(name, wert)` macht einen Dienst erst **nach dem Ende von `apply`**
auffindbar. Gemessen mit einer Sonde:

```
anbieter: after provide, ctx.get = undefined      ← der eigene Dienst ist noch unsichtbar
Wurzel:   ctx.get(meinding)     = [object Object]  ← erst danach da
```

**Die Lücke in den Prüfungen — das eigentliche Problem.** Alle 40 Prüfungen des
Pakets riefen `trageSondenEin` mit einem **selbstgebauten** Register auf. Sie
prüften die Logik und gingen an `apply` **vorbei**. Genau dort steckte der Fehler.
Es gab **keine** Prüfung, die `apply` wirklich ausführte.

Jetzt gibt es drei — gegen einen **echten** Cordis-Kontext und ein **echtes**
Register: die Sonden kommen an, ohne Adressen kommt nichts an (ohne zu scheitern),
und das Abhängen nimmt sie wieder heraus.

**Die allgemeine Lehre, die hier steht.** Eine Prüfung, die eine Funktion direkt
aufruft, prüft **nicht** den Weg, auf dem sie im Betrieb aufgerufen wird. Beides
braucht eine Prüfung — und die zweite war hier nicht da.

## Nachweise

| Nachweis | Befehl | Ergebnis |
|---|---|---|
| Prüfungen `health` | `bun test packages/api/health` | **72 pass · 0 fail** |
| Prüfungen `readiness` | `bun test packages/api/readiness` | **40 pass · 0 fail** |
| Prüfungen der Profil-Verdrahtung | `bun test scripts/tests/profile-patch.test.mjs` | **24 pass · 0 fail** |
| Alle Skript-Prüfungen | `bun test scripts/tests/` | **58 pass · 0 fail** (3 Dateien) |
| Gesamtlauf | `bun test packages scripts apps` | **762 pass · 0 fail** (26 Dateien, 11,2 s) |
| Gesamtlauf ohne Testdatenbank | ebenso, ohne `PMH_TEST_DATABASE_URL` | **748 pass · 14 skip · 0 fail** — übersprungen, **nicht** bestanden |
| Typecheck Einzelpaket | `bunx tsgo --noEmit -p packages/api/health/tsconfig.json` | **exit 0** |
| Typecheck alle Pakete | je `tsgo --noEmit -p <paket>` | **18 grün · 0 rot** |
| Endpunkt im Host, offen | `curl /api/health` | **200** mit unserem JSON |
| Endpunkt im Host, geschützt | `curl /api/ready` | **401** + `WWW-Authenticate: Cookie` |
| Mit Sitzungscookie | `curl /api/ready` mit Cookie | **200** mit `bereit: true` |
| Pfadgenauigkeit | `?x=1` · `/api/health/mehr` · `/api/ready/mehr` | **200** · **404** · **404** |
| Im Host, gesund | `curl /api/ready` mit Cookie | **200**, beide Sonden `ok` |
| Im Host, Redis tot | `curl /api/ready` mit Cookie | **503** `eingeschraenkt`, Grund genannt |
| Im Host, Redis tot | `curl /api/health` | **200** — der Unterschied ist belegt |
| Verdopplungsschutz | zweiter Start | `Eigene Pakete schon eingetragen` |

## Was in Teil 2 **nicht** belegt ist — ehrlich

1. **Keine Prüfung, die den Ausfall regelmäßig herbeiführt.** Die 503-Antwort ist
   **einmal** von Hand gemessen (Redis auf einen toten Port gezeigt). Es gibt
   keinen Lauf, der das bei jeder Änderung wiederholt.
2. **Die Sonden laufen gegen `DATABASE_URL`/`REDIS_URL` aus der Umgebung.** Der
   Starter setzt sie **nicht** — ohne sie meldet `/api/ready` `ok` mit **leerer**
   Sondenliste. Das ist gebaut und geprüft, aber es steht **nicht** in der
   Startanleitung der README. Wer die Anleitung befolgt, bekommt keine
   Abhängigkeitsprüfung.
3. **Kein Zusammenhang zwischen `.env.example` und dem Start.** Der Starter liest
   die Datei nicht; die Adressen müssen im PATH der Umgebung stehen.
4. **Die Wiederverwendung (5 s) ist geprüft, aber nicht im Host gemessen.** Ein
   zweiter Aufruf binnen fünf Sekunden müßte `zwischengespeichert: true` liefern —
   das ist **nicht** von Hand nachgemessen.
5. **`Bun.redis` könnte in einer neueren Bun-Fassung brauchbar werden.** Dann wäre
   das eigene `PING` ersetzbar; die Messung oben gilt für **1.4.0**.
6. **Nur Windows.**

Jeder wurde von einer Messung gefunden, nicht durch Nachdenken.

### 1. Ein Lebenszyklus-Haken, den es nicht gibt

Die erste Fassung hing den Aufräumer an `ctx.on('dispose', …)`. Das sah richtig
aus und **feuerte nie**: Cordis kennt kein `dispose`-**Ereignis**. Der Listener
wurde beim Abhängen nur mitentsorgt — das Aufräumen, das er auslösen sollte, lief
nie mit.

Gefunden von der Prüfung „nach dem Abhängen antwortet die Adresse wieder 404":
sie antwortete **200**. Ohne diese Prüfung wäre eine Route zurückgeblieben, die
auf einen toten Kontext zeigt.

Richtig ist `ctx.effect(körper)`: der Körper läuft sofort, die zurückgegebenen
Disposer laufen beim Abhängen des Plugins oder des Effekts — was zuerst kommt.

### 2. Die Patch-Zeile hätte **nichts** eingehängt

Die Patch-Semantik des Loaders (`applyEntryPatches` in `dsh-app-boot`) kennt zwei
Formen:

| Form | Wirkung |
|---|---|
| `{ insert: [zeile, …] }` | **hängt Zeilen an** die Eintragsliste an |
| `{ id, name?, …felder }` | **ändert** die Zeile mit dieser `id`; `name` wird geprüft, nicht gesetzt |

Meine erste Zeile war `- id: pmh-health` + `name: …` — die **Änderungs**form.
Der Loader hätte eine Zeile mit dieser id gesucht, keine gefunden und gemeldet
`patch: entry pmh-health not found`. Der Host wäre **ohne unseren Endpunkt**
weitergelaufen, mit einer Warnung im Protokoll.

Nachgelesen erst, nachdem der Endpunkt im Host fehlte.

### 3. An eine **leere Liste** angehängt

`[]` ist keine Formatvorlage, sondern die **leere Liste**. Zeilen dahinter sind
kein YAML mehr. Der Host brach ab:

```
failed to parse overlay …/cordis.patch.yml:
  YAMLException: end of the stream or a document separator is expected (6:1)
```

### 4. `insert:` ohne Listenstrich

Nach Fehler 3 ersetzte das Skript den Platzhalter — aber schrieb `insert:` als
**Abbildung**. Verlangt ist eine **Liste** von Patch-Einträgen:

```
overlay …/cordis.patch.yml must be a top-level YAML array of loader patch entries
```

Richtig ist `- insert:` mit den Zeilen darunter.

**Fehler 2 bis 4 sind derselbe Fehler in drei Stufen:** Ich habe die Form des
Eintrags **angenommen** statt sie in der Quelle nachzulesen. Aufgefallen ist jeder
erst, als der Host wirklich starten sollte — die Prüfungen hätten ihn nicht
finden können, weil sie die Form prüften, die ich mir ausgedacht hatte. Genau
deshalb steht in der Prüfdatei jetzt ein Fall, der die erzeugten Zeilen **parst**
und die Form `insert:` gegen einen echten Leser nachweist.

## Wo der Eintrag herkommt

Die Patch-Schicht des Profils liegt in `.pmh-build/harness-home/profiles/web/` —
und `.pmh-build/` ist **nicht versioniert**. Eine handgeschriebene Datei dort wäre
beim nächsten Klon weg. Der Eintrag steht deshalb in
`scripts/profile-patch.mjs` und wird bei **jedem** Start in die Profildatei
geschrieben:

* eigener markierter Bereich — fremde Einträge bleiben Byte für Byte stehen
* wiederholbar — nach zehn Starts steht der Eintrag **einmal** darin
* `[]`-Platzhalter der Vorlage wird **ersetzt**, nicht ergänzt

## Nachweise

| Nachweis | Befehl | Ergebnis |
|---|---|---|
| Prüfungen des Endpunkts | `bun test packages/api/health` | **19 pass · 0 fail** |
| Prüfungen der Profil-Verdrahtung | `bun test scripts/tests/profile-patch.test.mjs` | **24 pass · 0 fail** |
| Typecheck | `bunx tsgo --noEmit -p packages/api/health/tsconfig.json` | **exit 0** |
| Typecheck alle Pakete | je `tsgo --noEmit -p <paket>` | **17 grün · 0 rot** — das neue Paket ist mitgezählt |
| Alle Skript-Prüfungen | `bun test scripts/tests/` | **58 pass · 0 fail** (3 Dateien) |
| Endpunkt im Host | `bun run start --no-go`, dann `GET /api/health` | **200** mit unserem JSON |
| Falsche Methode | `POST /api/health` | **405**, `Allow` gesetzt |
| Pfadgenauigkeit | `GET /api/health?x=1` · `GET /api/health/mehr` | **200** · **404** |

## Was hier **nicht** belegt ist — ehrlich

1. **Keine Zustandsprüfung.** Der Endpunkt prüft **nicht** PostgreSQL, nicht
   Redis, nicht die LLM-Anbindung. Er beantwortet die eine Frage, die vor allen
   anderen kommt: *läuft unser Code im Host?* Ein `/api/health`, das „ok" sagt,
   obwohl die Datenbank liegt, wäre schlimmer als keines.
2. **Der `Content-Length`-Kopf ist in der Antwort nicht geprüft.** Die
   Absicht — unverdichtet bleiben und die Länge nennen — ist im Handler
   ausgeführt, aber die tatsächlich gesendeten Kopfdaten wurden nicht sauber
   ausgelesen (PowerShell zeigte `System.String[]`). **Nicht belegt.**
3. **Die Anmeldung ist nicht geprüft.** Kein Testfall stellt fest, daß
   `/api/health` ohne Cookie erreichbar ist und bleiben soll. Bekannt und
   gewollt — aber nicht durch eine Prüfung festgehalten.
4. **Der Typecheck lief für alle 17 Pakete — aber einzeln.** Ein `bun run
   typecheck` über den Arbeitsbereich ist in dieser Umgebung weiterhin nicht
   ausführbar (der verschachtelte `bun`-Aufruf trifft ein defektes Paket im PATH,
   siehe `scripts/start.mjs`). Gezählt wurden deshalb 17 einzelne Läufe.
5. **Nur Windows.** Gemessen auf Windows nativ, Bun 1.4.0. Linux ist nicht
   gemessen.
