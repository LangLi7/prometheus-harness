# Beleg: der erste eigene Endpunkt läuft im Host

**Datum:** 13.10.2026 · **Anlaß:** Der Kern des Projekts war gebaut (14 Pakete,
262 + 108 Tests grün), aber **kein einziges Paket davon war angeschlossen**. Der
Host lieferte die Oberfläche des Cores aus; unser Code lief nur in `bun test`.

Mit diesem Schritt sind es **15 Pakete** und — gemessen mit echter Datenbank —
**669 Tests grün, 0 rot** über 25 Dateien.
Dieser Beleg zeigt den kleinsten Schritt, der das ändert — und die **vier
Fehler**, die auf dem Weg dorthin in meinem Code steckten.

## Das Ergebnis

Ein gestarteter Host, ein Aufruf von außen:

```
GET /api/health
-> 200
{"status":"ok","service":"@prometheus-harness/health","version":"0.1.0",
 "uptimeMs":17862,"runtime":"bun 1.4.0"}
```

Gestartet mit `bun run start --no-go`, Port 3081 (3080 hält der Harness des
Betreibers). Der Handler, der antwortet, steht in
`packages/api/health/src/index.ts` und ist über den **offiziellen Dienst**
`ctx.webServer.register` eingehängt — nicht über eine eigene Serverinstanz.

## Was damit bewiesen ist

| Frage | Beweis |
|---|---|
| Findet der Loader des Hosts **unser** Paket? | Ja — der Host startet und der Endpunkt antwortet |
| Ist der Dienst `webServer` für uns erreichbar? | Ja — `inject: [webServer]` in der Patch-Zeile; ohne ihn würde der Loader warten |
| Erreicht eine Anfrage von außen unseren Code? | Ja — HTTP 200 mit unserem JSON über den Netzstapel |
| Genau unser Pfad und kein Präfix? | `/api/health?x=1` → **200**; `/api/health/mehr` → **404** |
| Falsche Methode wird unterschieden? | `POST /api/health` → **405**, `Allow: GET, HEAD` |
| Läuft der Host ohne unser Paket unverändert? | Ja — vor dem Eintrag antwortete die Adresse **404** |

## Die Anmeldesperre — genau bestimmt

Der Befund war zunächst verwirrend, und er ist wichtig:

| Aufruf | **ohne** Token-Cookie | **mit** Token-Cookie |
|---|---|---|
| `/api/health` | **200** | **200** |
| `/api/unbekannt` | **401** | **404** |
| `/api/health/mehr` | **401** | **404** |

**Ohne** Cookie antwortet die Anmeldesperre **vor** dem Auffang-Platz — deshalb
401 statt 404. **Mit** Cookie kommt die Anfrage durch und der Auffang-Platz
antwortet 404.

Unser Endpunkt antwortet in **beiden** Fällen 200, weil ein **registrierter**
Pfad vor beidem gewinnt. Das heißt aber auch, worüber hier entschieden wurde —
ausdrücklich und nicht nebenbei:

**`/api/health` ist ohne Anmeldung erreichbar.** Für eine Zustandsauskunft ist
das vertretbar: der Lauscher ist auf `127.0.0.1` gebunden (der Webserver lehnt
Wildcard-Bindungen ausdrücklich ab), und die Antwort nennt nur, daß dieser Code
läuft. Es ist trotzdem eine **Entscheidung**, und sie gehört ausgesprochen, weil
sie für jeden weiteren Endpunkt nicht automatisch richtig ist. Sobald etwas
Sensibles dazukommt, braucht es eine Prüfung **vor** dem Handler.

## Die vier eigenen Fehler

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
