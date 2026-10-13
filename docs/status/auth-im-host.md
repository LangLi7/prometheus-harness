# Die Anmeldung im Host — B1 abgeschlossen

**Stand:** 13.10.2026 · **Neues Paket:** `packages/api/auth-http` · **Prüfungen:** 22 (+ 41 aus dem Speicher)

Dieses Blatt belegt eine einzige Aussage: **die Anmeldung ist im Host erreichbar und
schreibt in die Datenbank.** Jede Zahl nennt den Befehl, der sie gemessen hat.

---

## 1. Was vorher fehlte

Bis heute hingen von unserem Code **nur `health` und `readiness`** im Host — beide
**lesend**. Der Regelkern (51 Prüfungen) hatte keinen Aufrufer, der Speicher aus
`docs/status/auth-verdrahtung.md` ebenfalls nicht: er war gegen die Datenbank bewiesen,
aber an keinen Weg gehängt.

**B1 ist damit die erste Stelle, an der unser Code etwas VERÄNDERT.** Bis hierher konnte
unser Beitrag im Host nichts kaputtmachen; ab hier kann er es.

---

## 2. Die Frage, die vor dem Bau geklärt werden mußte

Der Kern besitzt `/api` als **Präfix**:

> `dsh-client-connection/lib/index.js:13` — *„Route prefix owning every api request
> (`/api` and `/api/<anything>`)"*

Ob ein eigener `POST` unter `/api/…` überhaupt ankommt, war damit offen. **Gemessen** in
`dsh-host-webserver/lib/index.js`:

```js
/** Longest-prefix-wins over the prefix table after an exact-table miss. */
match(pathname) {
  const exact = this.exact.get(pathname);
  if (exact !== void 0) return exact;
  …
}
```

**Erst die genaue Tabelle, dann das längste Präfix.** Ein genauer Weg gewinnt gegen `/api`.
Dazu zwei Eigenschaften, die den Entwurf tragen:

* `register()` **wirft** bei einem doppelten Weg — `webserver: duplicate exact route "…"`.
  Eine Kollision fällt beim **Start** auf, nicht im Betrieb.
* Der Webserver gleicht **nur den Pfad** ab. Die Methode kennt er nicht — sie muß der Weg
  selbst prüfen.

Der Namensraum `pmh` macht eine Kollision zusätzlich unmöglich: die Aufrufe des Kerns
heißen `session/…`, `workspace/…`, `plugin/…`.

---

## 3. Die vier Wege

| Weg | Methode | Was er tut |
|---|---|---|
| `/api/pmh/auth/register` | POST | Konto anlegen → **201** |
| `/api/pmh/auth/login` | POST | anmelden, beide Cookies setzen → **200** |
| `/api/pmh/auth/logout` | POST | abmelden, verlangt CSRF → **204** |
| `/api/pmh/auth/me` | GET | wer bin ich → **200** |

Der Aufbau ist dreigeteilt, damit jede Schicht ohne die andere prüfbar ist:

| Datei | Kennt | Prüfbar |
|---|---|---|
| `src/wege.ts` | kein Socket, keine Datenbank — nur Eingabe → Antwort | ohne Server, ohne Datenbank |
| `src/http.ts` | `IncomingMessage`/`ServerResponse`, **keine** Entscheidungen | über einen echten Socket mit giftigen Speichern |
| `src/index.ts` | Cordis, `process.env` | im Host |

---

## 4. Der Beweis: zehn Fälle über echtes HTTP gegen den laufenden Host

Gestartet mit `bun scripts/start.mjs --port 3082 --no-go`. Der Starter meldete:

```
[pmh] Eigene Pakete eingetragen: @prometheus-harness/health, @prometheus-harness/readiness, @prometheus-harness/auth-http
[host] pmh readiness: Sonden eingetragen: postgres, redis
[host] pmh: Core läuft (Profil "web", Loader aktiv)
```

| # | Fall | erwartet | gemessen |
|---|---|---|---|
| 1 | `POST register` | 201 | **201** `{"ok":true,"value":{"id":"527d650f-…","role":"user"}}` |
| 2 | `POST register`, Passwort `kurz` | 400 | **400** `passwort-zu-schwach` — *„Mindestens 16 Zeichen. Ein Satz ist besser als ein Wort mit Sonderzeichen."* |
| 3 | `POST login`, falsches Passwort | 401 | **401** `zugangsdaten-falsch` |
| 4 | `POST login`, richtiges Passwort | 200 | **200** + beide Cookies |
| 5 | `GET me` mit Sitzung | 200 | **200** + derselbe Benutzer |
| 6 | `GET me` ohne Sitzung | 401 | **401** `nicht-angemeldet` |
| 7 | `POST logout` **ohne** CSRF | 403 | **403** `csrf-fehlt` |
| 8 | `POST logout` **mit** CSRF | 204 | **204** |
| 9 | `GET me` nach dem Abmelden | 401 | **401** — **wörtlich dieselbe Meldung wie Fall 6** |
| 10 | `GET login` | 405 | **405**, `Allow: POST OPTIONS` |

**Fall 9 ist der wichtigste.** Ein Unterschied zwischen „unbekannt" (6) und „widerrufen" (9)
wäre meßbar und verriete einem Angreifer, ob ein geratenes Token je existiert hat. Beide
Meldungen lauten `Sitzung ist unbekannt oder widerrufen` — die Konstante
`SESSION_NOT_USABLE` aus dem Regelkern, importiert und **nicht abgeschrieben**.

**Die Cookies, gemessen:**

| Cookie | Wert | Flaggen |
|---|---|---|
| `pmh_session` | 43 Zeichen (base64url von 32 Zufallsbytes) | **`HttpOnly`** |
| `pmh_csrf` | 43 Zeichen | *keine* — mit Absicht |

Der CSRF-Wert **muß** für die Anwendung lesbar sein, sonst kann sie ihn nicht in die
Kopfzeile schreiben. Er ist kein Geheimnis gegenüber dem Benutzer, sondern gegenüber einer
**fremden Seite** — und die kann ihn nicht lesen (gleiche Herkunft).

---

## 5. Der Blick in die Datenbank

```
email=pruef-http@httptest.invalid  rolle=user  anzeige=Pruefbenutzer
hash_beginnt=$argon2id$  hash_enthaelt_klartext=false

token_hash=c56ba258a064… (64 Zeichen)  widerrufen=2026-10-13 21:02:37+02  grund=logout  ip=127.0.0.1
```

Die Spur, in der Reihenfolge des Geschehens:

```
register       | ip=127.0.0.1 | ua=pmh-pruefung/1.0
login-failed   | ip=127.0.0.1 | ua=pmh-pruefung/1.0
login-success  | ip=127.0.0.1 | ua=pmh-pruefung/1.0
login-success  | ip=127.0.0.1 | ua=pmh-pruefung/1.0
logout         | ip=-         | ua=pmh-pruefung/1.0
```

Und die Frage, die sich jede Spur gefallen lassen muß:

```
zeilen=12  mit_klartextpasswort=0  mit_argon2=0
```

**Kein Klartextpasswort, kein Hash, kein Token** — geprüft über die **ganze Zeile** als
Text, nicht nur über die Spalte, die man im Verdacht hat.

---

## 6. Die Entscheidungen, die im Weg stecken

### 6.1 Die Methode wird selbst geprüft

Der Webserver gleicht nur den Pfad ab. Ohne eigene Prüfung würde `GET /api/pmh/auth/login`
den **Anmeldeweg** auslösen. `HEAD` wird wie `GET` geführt, `OPTIONS` ergibt **204** mit
`Allow`.

### 6.2 Die IP kommt **vom Socket**, niemals aus `X-Forwarded-For`

**Die Kopfzeile darf jeder Aufrufer setzen.** Wer sie auswertet, läßt sich die IP von dem
bestimmen, den er gerade begrenzen will — und `loginIpKey(ip)` wäre **wirkungslos**: je
Versuch eine andere erfundene Adresse, nie eine Grenze erreicht.

Zwei Prüfungen halten das fest: eine schickt `X-Forwarded-For: 10.9.9.9` und erwartet
`127.0.0.1`; die andere erwartet, daß `::ffff:127.0.0.1` auf `127.0.0.1` gekürzt wird —
sonst hätte derselbe Aufrufer über zwei Wege **zwei** Zähler, und die Grenze wäre doppelt
so hoch wie beabsichtigt.

Die Kopfzeile wäre erst brauchbar, wenn ein **vertrauenswürdiger** Proxy davorsteht — und
dann müßte man wissen, **welcher** das ist, und alles andere verwerfen. Solange es keinen
gibt, ist der Socket die einzige Angabe, die der Aufrufer nicht fälschen kann.

### 6.3 Der Körper ist auf 8 KiB begrenzt — und die Länge wird **vorher** geprüft

Der Kern setzt für seine Aufrufe 300 MiB an (er trägt Bilder durch). Für eine Anmeldung
wäre dieselbe Zahl eine Einladung. Steht `Content-Length` da und ist zu groß, wird die
Verbindung **sofort** abgewiesen (`req.destroy()`), damit gar keine Bytes in den Speicher
wandern. Zusätzlich wird mitgezählt: `Content-Length` kann fehlen und kann **falsch** sein.

### 6.4 Abmelden verlangt CSRF, Anmelden nicht

Anmelden ist harmlos, wenn eine fremde Seite es auslöst — das Ergebnis wäre eine Sitzung,
die der Angreifer nicht lesen kann. **Abmelden** ist eine Zustandsänderung: eine fremde
Seite könnte einen Benutzer abmelden, und das läßt sich nicht zurücknehmen (die Sitzung ist
widerrufen).

Ein **ungültiges** Token endet beim Abmelden trotzdem mit **204** und geräumten Cookies. Ein
Fehler verriete, ob das Token einmal gültig war.

### 6.5 Eine Ausnahme im Weg läßt den Socket nicht offen

Ohne den letzten Fang bliebe die Verbindung offen und der Aufrufer wartete bis zum
Zeitablauf — ein Fehler, der wie „der Server ist weg" aussieht statt wie „dieser Weg ist
kaputt". Der **Text** der Ausnahme geht nicht an den Aufrufer: er kann Pfade, Adressen oder
Abfragen enthalten. Eine Prüfung schickt einen Weg, der absichtlich wirft, und erwartet
**500** mit `interner-fehler` — und daß der Text `absichtlich` **nicht** in der Antwort
steht.

### 6.6 Die giftigen Attrappen

In `tests/http-schicht.test.ts` wirft **jeder** Zugriff auf die Speicher. Jeder Fall dort
muß **vor** dem ersten Speicherzugriff entschieden werden — eine falsche Methode, ein zu
großer Körper, kein JSON, ein fehlendes Cookie. Mit harmlosen Attrappen würde ein Fall, der
sie versehentlich berührt, **trotzdem grün**, und die Prüfung bewiese nicht, was sie
behauptet.

---

## 7. Zwei gemessene Funde

### 7.1 Ein geratener Ereignisname

Der erste Entwurf trug ins Prüfprotokoll `login-ok` ein — **geraten**. Der Typlauf wies es ab:

```
error TS2322: Type '"login-ok"' is not assignable to type
  '"api-key-created" | … | "login-failed" | "login-success" | "logout" | …'
```

Die Ereignisarten sind eine **abschließende Aufzählung** in
`packages/auth/auth/src/identity.ts`. Ein geratener Name wäre zur Laufzeit in die Spalte
`kind` gegangen — dort steht **freier Text, es gibt keine Prüfregel** — und hätte eine Spur
erzeugt, die **niemand** findet, der nach `login-success` sucht. Behoben, und dabei `logout`
ergänzt: ohne diesen Eintrag endet jede Spur mit der letzten Nutzung, und ein Abmelden wäre
von einem abgeschlossenen Fenster nicht zu unterscheiden.

### 7.2 Die Sicherung, die jetzt jeden Lauf bewacht

**Der Befund.** In `pmh.auth_events` standen drei Zeilen, die **beweisbar** aus dem
Integrationstest von `store-postgres` stammen — `user_agent = 'Prüfgerät'`,
`ip = 203.0.113.7` und `203.0.113.9`. Dieser Test sollte gegen `pmh_test` laufen.
Mindestens ein Lauf hat also in die **Betriebsdatenbank** geschrieben.

```
docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc \
  "select kind, host(ip), user_agent from pmh.auth_events where user_agent='Prüfgerät';"
```

**Die Ursache ist nicht belegt** — und sie muß es auch nicht sein. Der Schaden wäre nicht das
Schreiben, sondern das **Löschen**: der Integrationstest des Schemas beginnt mit
`DROP TABLE … CASCADE` (Befund **M-1**), und dieselbe Verwechslung hätte die
Betriebsdatenbank abgeräumt.

**Die Sicherung.** Der Test liest jetzt vor allem anderen `current_database()` und
vergleicht mit dem Datenbanknamen aus `DATABASE_URL` — **derselben Angabe, die die
Anwendung benutzt**. Kein Namensmuster (`_test`), denn eine Konvention kann man brechen;
ein Vergleich mit der Wirklichkeit nicht.

**Beide Richtungen gemessen:**

| Lauf | Ergebnis |
|---|---|
| `PMH_TEST_DATABASE_URL` → `pmh_test` | **11 pass / 0 fail**, Exit **0** |
| `PMH_TEST_DATABASE_URL` → `pmh` (absichtlich) | **ABBRUCH**: *„dieser Test schreibt Daten und zeigt auf „pmh" — dieselbe Datenbank wie die Anwendung"*, Exit **1**, **nichts geschrieben** (der Abbruch kommt vor `migrate`) |

---

## 8. Ein fehlender Ausfuhr, wieder einer

```
SyntaxError: Export named 'SESSION_NOT_USABLE' not found in module
  'packages/auth/auth/src/index.ts'
```

**Dieselbe Sorte Mangel wie `NewUser` in der letzten Runde.** Besonders ärgerlich hier: der
Kommentar an der Konstante begründet ausführlich, warum sie überhaupt existiert — ein
unbekanntes und ein widerrufenes Token dürfen **wörtlich dieselbe** Meldung bekommen. Eine
Konstante, die der Aufrufer nicht importieren kann, zwingt ihn, den Text **abzuschreiben** —
und genau dann laufen die beiden Fassungen auseinander, wogegen sie da ist. Ausgeführt.

---

## 9. Prüfstand

| Prüfung | Ergebnis |
|---|---|
| HTTP-Schicht, echter Socket, giftige Speicher | **22 pass / 0 fail**, 42 Zusicherungen |
| Speicher gegen echtes PostgreSQL | **11 pass / 0 fail** |
| Patch-Prüfungen (`EIGENE_PAKETE` erweitert) | **25 pass / 0 fail** |
| Typsystem | **22 Pakete grün** (vorher 21), 2,3 s, Exit **0** |
| Gesamtsuite auf `pmh_test` | **1009 pass / 2 fail** — 1011 in 37 Dateien |
| Zehn Fälle über echtes HTTP im Host | **10 von 10 wie erwartet** |

Die 2 roten sind **nicht unsere** und waren es vorher: `apps/cli` (fremdes Werk,
`typert-loader`) und `packages/util/atomic-write` (`Zugriff verweigert`, os error 5).
Die Zahl stieg von **987 auf 1009** grün: **22** neue Prüfungen, keine verloren.

---

## 10. Was ich an der Umgebung angefaßt habe

| Sache | Was geschah |
|---|---|
| `node_modules/@prometheus-harness/auth-http` | **Junction von Hand**, wie beim Speicherpaket — `bun install` hätte `bun.lock` umgeschrieben, an dem ein anderer Agent arbeitet |
| `scripts/profile-patch.mjs` | `@prometheus-harness/auth-http` in `EIGENE_PAKETE` — die eine Wahrheit darüber, was von uns im Host läuft |
| `packages/auth/auth/src/index.ts` | `SESSION_NOT_USABLE` ausgeführt |
| `pmh.auth_sessions` | eine offene Sitzung des **eigenen** Prüfbenutzers widerrufen (`revoked_reason='pruefung-aufgeraeumt'`), damit kein gültiges Token liegen bleibt. **Gemessen danach: `offene_sitzungen_des_pruefbenutzers=0`** |
| `bun.lock` | **nicht angefaßt** — an dieser Datei arbeitet ein anderer Agent |
| `native/flock`, `services/pmh-attach`, `services/pmh-nix`, Wurzeldateien | **nicht angefaßt** |

**Was als Datensatz stehen bleibt:** ein Prüfbenutzer `pruef-http@httptest.invalid` und die
zugehörigen Zeilen in `auth_events` — als Nachweis, mit Namen, den niemand für einen echten
Benutzer hält. Die Sitzungen sind widerrufen.

---

## 11. Was offen ist

| Was | Warum |
|---|---|
| **Ein Integrationstest für `auth-http` gegen die echte Datenbank** | Die Wege sind gegen einen echten Socket mit giftigen Speichern geprüft, und im Host gegen die echte Datenbank. Was fehlt, ist **derselbe** Test gegen die echte Datenbank **ohne** Host — er würde die Lücke zwischen beiden schließen. Die Sicherung aus §7.2 gehört dann auch dort hinein |
| **B2** | `claim` (21 Prüfungen) und `permissions` (30 Prüfungen) haben weiterhin keinen Aufrufer. Sie gehören an die Wege aus diesem Paket: `claim` an den **ersten** Login, `permissions` vor jede Handlung |
| **B3** | Migration **`0005`** `user_profiles` — nicht `0004`, die Nummer ist belegt |
| **RLS (Migration 0006)** | braucht den Aufrufer, der `pmh.user_id` setzt. Der ist jetzt **da** (dieses Paket kennt den Benutzer je Anfrage) — die Reihenfolge ist damit möglich geworden |
| **Kein TLS** | `sicher: false`, also einfache Cookienamen. Der Host bindet auf `127.0.0.1`; mit TLS gehört `__Host-` davor, und das entscheidet `ctx.webServer.protocol` bereits |
