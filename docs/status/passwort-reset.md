# Einmal-Token: Passwort zurücksetzen, ohne daß die Datenbank das Geheimnis kennt

> **Stand:** 13.10.2026 · **Paket:** C2 (Einmal-Token) · **Status:** Regeln und Ablage
> belegt, **kein Aufrufer** — siehe §7
>
> **Die Weisung, die den Entwurf bestimmt** (wörtlich vom Betreiber):
> *„für einen DB-Administrator unlesbar, Passwort trotzdem zurücksetzbar."*
>
> **Vorher:** Die Tabelle `one_time_tokens` steht seit Migration **0001** im Schema und
> hatte **keinen Schreiber**: `grep` über den ganzen Baum fand die Tabelle nur in der
> Migration und in `review/*.md`. `packages/auth/reset` gab es nicht.

---

## 1. Was gebaut wurde

| Datei | Was darin steht |
|---|---|
| `packages/auth/reset/src/index.ts` | Die Regeln: Token erzeugen, prüfen, einlösen. **Keine** Datenbank, **kein** HTTP, **kein** Versand |
| `packages/auth/reset/tests/reset.test.ts` | **15** Prüfungen der Regeln gegen eine Attrappe |
| `packages/auth/store-postgres/src/index.ts` | `erzeugeTokenAblage(sql)` — die Ablage über der echten Tabelle |
| `packages/auth/store-postgres/tests/einmaltoken.test.ts` | **7** Prüfungen gegen echtes PostgreSQL |

**Beide zusammen, und das ist der Punkt.** Die Regeln lassen sich ohne Infrastruktur
prüfen — aber eine Attrappe kann **nicht** belegen, daß in der Spalte nur der Hash steht,
und sie hat **kein** Nebenläufigkeitsproblem. Genau das prüft die zweite Datei.

---

## 2. Der Entwurf: warum nur der Hash

Wer die Datenbank liest, darf **kein** Paßwort setzen können. Das geht nur, wenn in
`one_time_tokens.token_hash` ausschließlich der **SHA-256-Hash** des Tokens liegt:

- Das Klartext-Token hat **32 Zufallsbytes** (256 Bit, `randomToken(32)`), base64url → 43 Zeichen.
- Aus dem Hash lassen sich diese 32 Bytes **nicht** zurückrechnen.
- Wer die Tabelle liest, hat damit nichts in der Hand — er kann kein Paßwort setzen, weil er
  kein gültiges Token **vorlegen** kann.

**Warum SHA-256 und kein Argon2id.** Dasselbe Argument wie bei den Sitzungstoken: ein
langsames Verfahren schützt gegen das Durchprobieren **schwacher** Geheimnisse. Hier gibt es
nichts zu probieren — 256 Bit sind nicht zu raten. Ein Argon2id-Lauf je Prüfung wäre
Rechenzeit ohne Gewinn. (Das Schema verlangt ohnehin 64 Hexzeichen,
`one_time_tokens_hash_hex CHECK (token_hash ~ '^[0-9a-f]{64}$')`.)

### Die vier Eigenschaften, die gelten müssen

| Eigenschaft | Warum | Prüfung |
|---|---|---|
| nur der Hash liegt in der Ablage | die Weisung oben | `reset.test.ts` „in der Ablage steht ein Hash" **und** `einmaltoken.test.ts` „in der Zeile steht der Hash" |
| ein Token gilt **genau einmal** | sonst bliebe ein abgefangenes Token für immer gültig | „ein Token wirkt NICHT zweimal", „verbrauche trifft genau einmal — hintereinander" |
| es **läuft ab** | ein Token in einer alten Nachricht wäre sonst ein Schlüssel ohne Verfallsdatum | „nach fünfzehn Minuten gilt es nicht mehr" (`RESET_GUELTIG_SEKUNDEN = 900`) |
| nach dem Zurücksetzen sind **alle** Sitzungen widerrufen | sonst behält ein Angreifer seinen Zugang über seine **alten** Sitzungen | „ein Reset widerruft ALLE Sitzungen" |

**Die vierte ist die, die am häufigsten fehlt.** Eine Paßwortänderung, die die alten
Sitzungen am Leben läßt, sperrt einen Angreifer **nicht** aus: er sitzt in einer Sitzung, die
er beim Einbruch erbeutet hat, und die bleibt gültig. Der Regelkern sagt das selbst:
*„Wer sein Paßwort ändert, erwartet das Gegenteil."*

### Die Reihenfolge des Einlösens ist Absicht

1. **Token prüfen** 2. **Konto prüfen** (ein gesperrtes Konto bleibt gesperrt, auch mit
gültigem Token) 3. **Paßwort prüfen** (dasselbe Regelwerk wie bei der Registrierung — ein
Reset darf nicht der Weg sein, an dem die Paßwortregeln vorbeiführen) 4. **Verbrauchen** —
**vor** dem Schreiben 5. **Schreiben**, dann **alle Sitzungen widerrufen**.

Schritt 4 vor Schritt 5, weil sonst zwei Anfragen mit demselben Token **beide** „noch offen"
läsen und **beide** ein Paßwort setzten.

**Ein zu schwaches Paßwort verbraucht das Token nicht.** Wer ein zu schwaches wählt, soll es
noch einmal versuchen dürfen, ohne ein neues Token zu brauchen. Wer das Token dort
verbrauchte, bestrafte den falschen. Geprüft: „ein zu schwaches Paßwort wird abgelehnt — und
das Token BLEIBT gültig" (dieselbe Prüfung löst danach mit demselben Token erfolgreich ein).

---

## 3. Der Atomaritätsnachweis — und warum die Attrappe ihn nicht führen kann

`verbrauche` ist **ein** `UPDATE` mit Bedingung:

```sql
UPDATE one_time_tokens SET consumed_at = $2
 WHERE id = $1 AND consumed_at IS NULL
 RETURNING id
```

Genau eine zurückgegebene Zeile heißt: **dieser** Aufruf war der erste. Keine Zeile heißt:
ein anderer war schneller.

**Gemessen, nicht behauptet** — `einmaltoken.test.ts`:

```
(pass) verbrauche trifft genau einmal — GLEICHZEITIG [47.95ms]
```

Zwei `Promise.all`-Aufrufe auf dieselbe Kennung; genau einer ergibt `true`. Dazu die
Gegenprobe in der Tabelle: `count(*) = 1` und `count(consumed_at) = 1`.

**Und die Vorbedingung dieser Prüfung wurde eigens gemessen.** Sie wäre auch grün, wenn der
Treiber beide Anweisungen hintereinander auf **einer** Verbindung abarbeitete. Sonde über
zwei gleichzeitige Abfragen mit `pg_backend_pid()` und `pg_sleep(0.4)`:

```
pid1=47359 pid2=47360 verschiedene=true
dauer_ms=422  (nacheinander waeren ~800)
```

Zwei **verschiedene** Backend-Kennungen, 422 ms statt 800 ms — also wirklich gleichzeitig.
Der Treiberpool steht dafür auf `max: 4` (die bestehende Datei `postgres.test.ts` hat `max: 2`;
für zwei gleichzeitige Anweisungen genügt das, für die Aussage „gleichzeitig" ist der Puffer
größer).

---

## 4. Die Prüfung, die meine eigene Behauptung widerlegt hat

`pruefeResetToken` trug den Kommentar *„Dieselbe Meldung wie bei einem abgelaufenen Token"* —
und tat es **nicht**:

| Fall | `grund` **vorher** |
|---|---|
| unbekannt | `dieses Token ist unbekannt oder nicht mehr gültig` |
| abgelaufen | `das Token lief am <Zeitpunkt> ab` |

Zwei verschiedene Texte sind ein **Orakel**: wer Token rät, könnte daran ablesen, ob er einen
Treffer gelandet hat, und müßte nur noch den Verfall abwarten. Behoben durch **eine**
Konstante `RESET_ABWEISUNG`, die alle drei Ablehnungsfälle nach außen tragen
(`unbekannt`, `abgelaufen`, `verbraucht`); die Unterscheidung bleibt intern in `ResetRegel`
erhalten, wo Protokoll und Ratenbegrenzung sie brauchen.

**Daß die Prüfung nicht leer ist, wurde gemessen** — mit einer Mutation: der Fehler wurde
absichtlich wieder eingebaut.

```
(fail) Ein Token gilt genau einmal … > ein unbekanntes Token bekommt DIESELBE Meldung wie ein abgelaufenes
 13 pass  1 fail   EXIT_MUTIERT=1
--- zurueckgesetzt ---
 15 pass  0 fail   EXIT_WIEDERHERGESTELLT=0
```

---

## 5. Der Fund in der eigenen Attrappe: sie rechnete großzügiger als die Sache

Beim Lesen des echten SQL fiel auf: `zaehleSeit` zählt nach **`created_at`** —

```sql
SELECT count(*)::int AS n FROM one_time_tokens
 WHERE user_id = $1 AND purpose = $2 AND created_at >= $3
```

— die Attrappe zählte nach `laeuftAb`. Das ist **nicht** dasselbe. Bei einem Fenster von
einer Stunde und einem vor 65 Minuten erzeugten Token:

| | zählt? |
|---|---|
| echte Ablage (`created_at`) | **nein** — der Anlegezeitpunkt liegt vor dem Fenster |
| Attrappe (`laeuftAb = Anlage + 15 min`) | **ja** — und damit großzügiger als die Sache |

Die Attrappe hätte die Ratenbegrenzung im Test **schärfer** aussehen lassen, als sie ist.
Behoben (`laeuftAb − RESET_GUELTIG_SEKUNDEN` ist der Anlegezeitpunkt) **und festgenagelt**:
die Prüfung „die Grenze zählt nur das FENSTER — ein altes Token zählt nicht mehr" würde mit
der alten Zählweise rot.

---

## 6. Der eigene Fehler in der Prüfung, die rot war — und zu Recht

Eine Zusicherung lautete `expect(typeof consumed_at).toBe('string')`. Sie war rot:

```
Expected: "string"   Received: "object"
```

**Gemessen:** der Treiber liefert `timestamptz` bei `sql.unsafe` als **`Date`**, nicht als
Zeichenkette. Genau dafür gibt es `alsIso` im Speicher — und der Speicher hat sie auch
gebraucht (`finde` gab `laeuftAb` korrekt heraus, über dieselbe Umdeutung). Die Zusicherung
wurde auf das Gemessene geschrieben (Zeitpunkt, `Date`, nahe „jetzt"), nicht auf meine
Erwartung.

**Zwei weitere eigene Fehler, beide vor dem ersten grünen Lauf gefunden:** in der Attrappe
hieß die lokale Konstante wie die Hilfsfunktion (`angelegt`), und ein `edit` zog die Rechnung
aus dem Prädikat heraus, wo `e` nicht existiert (`ReferenceError: e is not defined`, 3 rote
Prüfungen). Beide sind im Verlauf belegt.

---

## 7. Was **nicht** belegt ist — und was fehlt

| Offen | Warum es offen ist |
|---|---|
| **Kein Aufrufer.** Weder Skript noch Endpunkt erzeugt ein Token | `erzeugeResetToken` hat außerhalb der Prüfungen **niemanden**, der es ruft. Bis dahin ist C2 **halb**: die Regeln gelten, die Tür ist noch nicht eingebaut |
| **Kein Versand** | es gibt **keinen** Mail-Übergang im Projekt. Deshalb der gegenwärtige Entwurf: der Bediener gibt das Token weiter („sag es mir gerade jetzt") — und genau deshalb ist die Gültigkeit auf 15 Minuten gesetzt |
| Die POSIX-Seite von `pruefeDateirechte` | auf NTFS nicht ausführbar (siehe `geheimnisse.md`) |
| Kein Endpunkt `POST /api/pmh/auth/password-reset` | fehlt; die vier bestehenden Wege sind `register`, `login`, `logout`, `me` |

---

## 8. Nachfahren

```powershell
# die Regeln, ohne Infrastruktur — 15 pass, 0 fail
& 'C:\Users\Chang\.bun\bin\bun.exe' test packages/auth/reset/tests/reset.test.ts

# gegen echtes PostgreSQL — 7 pass, 0 fail
$map = @{}; foreach ($l in (Get-Content .env)) { if ($l -match '^\s*([A-Za-z_]\w*)\s*=') { $k,$v = $l -split '=',2; $map[$k.Trim()] = $v.Trim() } }
$env:DATABASE_URL = $map['DATABASE_URL']
$env:PMH_TEST_DATABASE_URL = $map['MIGRATION_DATABASE_URL'] -replace '/pmh(\?|$)','/pmh_test$1'
& 'C:\Users\Chang\.bun\bin\bun.exe' test packages/auth/store-postgres/tests/einmaltoken.test.ts
```

**Die Sicherung ist eingebaut:** beide DB-Dateien vergleichen vor dem ersten Schreiben
`current_database()` mit `DATABASE_URL` und **brechen ab**, wenn beide dieselbe Datenbank
nennen. Grund: am 13.10.2026 wurde die Betriebsdatenbank durch einen zerstörenden Schematest
abgeräumt (`benutzerprofile.md`, §„mein schwerster Vorfall").

---

## 9. Zahlen

| Messung | Wert |
|---|---|
| Typprüfung | **24 Pakete grün, 0 rot** — 2.7 s |
| Voller Lauf | **1107 pass, 2 fail** in **42** Dateien — 11.19 s |
| Zuwachs gegenüber dem Stand davor (1085) | **+22** = 15 + 7 — **genau**, keine unerklärte Differenz |
| Die zwei roten | `apps/cli/tests/flags.test.ts` (typert-loader: *6 contributor(s) failed to register*) und `packages/util/atomic-write` (`os error 5`, `TEMP`) — **beide nicht unsere**, unverändert seit dem vorigen Lauf |
| `cargo test` (unberührt) | **14 pass, 0 fail** |

Der vorige Lauf hatte eine **unerklärte** Differenz von +2 (`benutzerprofile.md`). Dieser
nicht — der Zuwachs ist auf die Zahl genau.
